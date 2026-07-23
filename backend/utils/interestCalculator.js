/**
 * Interest Calculator for "Mama-Papa Bank"
 * All calculations use integer-based kopecks and basis points to eliminate floating-point roundoff issues.
 */

/**
 * Calculates balance for a single contribution (realistic mode)
 */
function calculateContributionState(c, deposit, asOfDate = new Date()) {
  const amount = parseInt(c.amount_kopecks, 10);
  const start = new Date(c.approved_at || c.created_at);
  const end = new Date(asOfDate);

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  const periodDays = parseInt(deposit.locked_period_days || deposit.period_days || 1, 10);
  const completedPeriods = Math.floor(diffDays / periodDays);

  const rateBps = parseInt(deposit.locked_interest_rate_bps || deposit.interest_rate_bps || 0, 10);
  const ratePerPeriod = rateBps / 10000;

  const multiplier = Math.pow(1 + ratePerPeriod, completedPeriods);
  const currentBalanceKopecks = Math.round(amount * multiplier);
  const earnedInterestKopecks = currentBalanceKopecks - amount;

  return {
    currentBalanceKopecks,
    earnedInterestKopecks,
    completedPeriods,
    nextAccrualDate: new Date(start.getTime() + (completedPeriods + 1) * periodDays * 24 * 60 * 60 * 1000).toISOString()
  };
}

/**
 * Calculates balance under simple "whole balance on schedule" mode
 */
function calculateWholeBalanceOnSchedule(deposit, contributions, asOfDate = new Date()) {
  const periodDays = parseInt(deposit.locked_period_days || deposit.period_days || 1, 10);
  const rateBps = parseInt(deposit.locked_interest_rate_bps || deposit.interest_rate_bps || 0, 10);
  const ratePerPeriod = rateBps / 10000;

  const initialContribution = contributions.find(c => c.type === 'initial' && c.status === 'approved');
  const startStr = initialContribution?.approved_at || deposit.approved_at || deposit.created_at;
  const start = new Date(startStr);
  const end = new Date(asOfDate);

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const completedPeriods = Math.floor(diffDays / periodDays);

  let currentBalance = 0;
  let totalInterest = 0;

  const approvedConts = contributions
    .filter(c => c.status === 'approved')
    .map(c => ({
      ...c,
      approvedTime: new Date(c.approved_at || c.created_at).getTime()
    }))
    .sort((a, b) => a.approvedTime - b.approvedTime);

  let lastAccrualTime = start.getTime();
  for (let i = 1; i <= completedPeriods; i++) {
    const nextAccrualTime = start.getTime() + i * periodDays * 24 * 60 * 60 * 1000;

    const periodConts = approvedConts.filter(c => {
      if (i === 1) {
        return c.approvedTime <= nextAccrualTime;
      } else {
        return c.approvedTime > lastAccrualTime && c.approvedTime <= nextAccrualTime;
      }
    });

    const addedAmount = periodConts.reduce((sum, c) => sum + parseInt(c.amount_kopecks, 10), 0);
    currentBalance += addedAmount;

    const interest = Math.round(currentBalance * ratePerPeriod);
    currentBalance += interest;
    totalInterest += interest;

    lastAccrualTime = nextAccrualTime;
  }

  const remainingConts = approvedConts.filter(c => {
    if (completedPeriods === 0) {
      return c.approvedTime <= end.getTime();
    } else {
      return c.approvedTime > lastAccrualTime && c.approvedTime <= end.getTime();
    }
  });
  const remainingAmount = remainingConts.reduce((sum, c) => sum + parseInt(c.amount_kopecks, 10), 0);
  currentBalance += remainingAmount;

  return {
    currentBalanceKopecks: currentBalance,
    earnedInterestKopecks: totalInterest,
    completedPeriods,
    nextAccrualDate: new Date(start.getTime() + (completedPeriods + 1) * periodDays * 24 * 60 * 60 * 1000).toISOString()
  };
}

/**
 * Calculates current balance, earned interest, completed periods, and early withdrawal penalties.
 */
function calculateDepositState(deposit, contributions = [], now = new Date()) {
  if (contributions && !Array.isArray(contributions)) {
    now = contributions;
    contributions = [];
  }
  if (!now) {
    now = new Date();
  } else if (typeof now === 'string') {
    now = new Date(now);
  }

  const principal = parseInt(deposit.principal_kopecks || deposit.amount_kopecks || 0, 10);
  
  let activeConts = contributions.filter(c => {
    if (c.status !== 'approved') return false;
    const approvedAtStr = c.approved_at || c.created_at;
    const approvedTime = new Date(approvedAtStr).getTime();
    return approvedTime <= now.getTime();
  });
  const hasInitial = activeConts.some(c => c.type === 'initial');
  if (!hasInitial && deposit.status !== 'pending_open' && deposit.status !== 'rejected') {
    const depositApprovedAt = deposit.approved_at || deposit.created_at;
    const depositApprovedTime = new Date(depositApprovedAt).getTime();
    if (depositApprovedTime <= now.getTime()) {
      activeConts.unshift({
        id: 'initial_synth',
        type: 'initial',
        amount_kopecks: principal,
        status: 'approved',
        approved_at: depositApprovedAt
      });
    }
  }

  const accrualMode = deposit.locked_interest_accrual_mode || 'whole_balance_on_schedule';
  
  let currentBalanceKopecks = principal;
  let earnedInterestKopecks = 0;
  let completedPeriods = 0;
  let nextAccrualDateStr = '';

  if (deposit.status === 'pending_open' || deposit.status === 'rejected') {
    const start = new Date(deposit.created_at);
    const periodDays = parseInt(deposit.locked_period_days || deposit.period_days || 1, 10);
    const nextAccrualDate = new Date(start.getTime() + periodDays * 24 * 60 * 60 * 1000);
    return {
      principalKopecks: principal,
      currentBalanceKopecks: principal,
      earnedInterestKopecks: 0,
      completedPeriods: 0,
      nextAccrualDate: nextAccrualDate.toISOString(),
      daysHeld: 0,
      isEarly: true,
      penaltyKopecks: 0,
      interestForfeitedKopecks: 0,
      finalPayoutKopecks: principal,
      contributionsCount: 0
    };
  }

  if (accrualMode === 'per_contribution_period') {
    let totalBalance = 0;
    let totalInterest = 0;
    let minNextAccrualTime = Infinity;

    activeConts.forEach(c => {
      const state = calculateContributionState(c, deposit, now);
      totalBalance += state.currentBalanceKopecks;
      totalInterest += state.earnedInterestKopecks;
      const nextTime = new Date(state.nextAccrualDate).getTime();
      if (nextTime < minNextAccrualTime) {
        minNextAccrualTime = nextTime;
      }
    });

    currentBalanceKopecks = totalBalance;
    earnedInterestKopecks = totalInterest;
    
    const initialCont = activeConts.find(c => c.type === 'initial');
    if (initialCont) {
      const state = calculateContributionState(initialCont, deposit, now);
      completedPeriods = state.completedPeriods;
    } else {
      completedPeriods = 0;
    }

    nextAccrualDateStr = isFinite(minNextAccrualTime) 
      ? new Date(minNextAccrualTime).toISOString() 
      : new Date(new Date(deposit.approved_at || deposit.created_at).getTime() + (parseInt(deposit.locked_period_days || deposit.period_days || 1, 10)) * 24 * 60 * 60 * 1000).toISOString();
  } else {
    const state = calculateWholeBalanceOnSchedule(deposit, activeConts, now);
    currentBalanceKopecks = state.currentBalanceKopecks;
    earnedInterestKopecks = state.earnedInterestKopecks;
    completedPeriods = state.completedPeriods;
    nextAccrualDateStr = state.nextAccrualDate;
  }

  const approvedAtStr = deposit.approved_at || deposit.created_at;
  const start = new Date(approvedAtStr);
  const end = deposit.closed_at ? new Date(deposit.closed_at) : new Date(now);

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  const minHoldingDays = parseInt(deposit.locked_minimum_holding_days || deposit.minimum_holding_days || 0, 10);
  const isEarly = diffDays < minHoldingDays;
  const penaltyBps = parseInt(deposit.locked_penalty_bps || deposit.early_withdrawal_penalty_bps || 0, 10);
  
  const policy = deposit.locked_early_withdrawal_interest_policy || deposit.early_withdrawal_interest_policy || 'keep_earned_interest';

  let penaltyKopecks = 0;
  let interestForfeitedKopecks = 0;
  let finalPayoutKopecks = currentBalanceKopecks;

  if (isEarly) {
    if (policy === 'lose_all_interest') {
      interestForfeitedKopecks = earnedInterestKopecks;
      const totalContributed = activeConts.reduce((sum, c) => sum + parseInt(c.amount_kopecks, 10), 0);
      penaltyKopecks = Math.round(totalContributed * (penaltyBps / 10000));
      finalPayoutKopecks = Math.max(0, totalContributed - penaltyKopecks);
    } else {
      penaltyKopecks = Math.round(currentBalanceKopecks * (penaltyBps / 10000));
      finalPayoutKopecks = Math.max(0, currentBalanceKopecks - penaltyKopecks);
    }
  }

  return {
    principalKopecks: activeConts.reduce((sum, c) => sum + parseInt(c.amount_kopecks, 10), 0),
    currentBalanceKopecks,
    earnedInterestKopecks,
    completedPeriods,
    nextAccrualDate: nextAccrualDateStr,
    daysHeld: diffDays,
    isEarly,
    penaltyKopecks,
    interestForfeitedKopecks,
    finalPayoutKopecks
  };
}

/**
 * Gets compound interest forecasts for 12 periods ahead.
 */
function getForecast(deposit, contributions = [], periods = 12, now = new Date()) {
  if (contributions && !Array.isArray(contributions)) {
    if (typeof contributions === 'number') {
      const origPeriods = contributions;
      const origNow = periods;
      periods = origPeriods;
      now = origNow || new Date();
    } else {
      now = contributions;
      periods = 12;
    }
    contributions = [];
  }
  if (!now) {
    now = new Date();
  } else if (typeof now === 'string') {
    now = new Date(now);
  }

  const state = calculateDepositState(deposit, contributions, now);
  const initialContribution = contributions.find(c => c.type === 'initial' && c.status === 'approved') || {
    approved_at: deposit.approved_at || deposit.created_at
  };
  const start = new Date(initialContribution.approved_at || deposit.approved_at || deposit.created_at);
  const periodDays = parseInt(deposit.locked_period_days || deposit.period_days || 1, 10);

  const forecast = [];
  const currentCompleted = state.completedPeriods;

  for (let i = 1; i <= periods; i++) {
    const futurePeriodDays = (currentCompleted + i) * periodDays;
    const futurePeriodDate = new Date(start.getTime() + futurePeriodDays * 24 * 60 * 60 * 1000);
    
    const futureState = calculateDepositState(deposit, contributions, futurePeriodDate);
    
    forecast.push({
      futurePeriod: i,
      date: futurePeriodDate.toISOString(),
      balanceKopecks: futureState.currentBalanceKopecks,
      earnedInterestKopecks: futureState.earnedInterestKopecks,
      periodInterestKopecks: futureState.currentBalanceKopecks - (i === 1 ? state.currentBalanceKopecks : forecast[i - 2].balanceKopecks)
    });
  }

  const finalBalanceKopecks = forecast[periods - 1] ? forecast[periods - 1].balanceKopecks : state.currentBalanceKopecks;
  let totalContributedKopecks = contributions
    .filter(c => c.status === 'approved')
    .reduce((sum, c) => sum + parseInt(c.amount_kopecks, 10), 0);
  if (totalContributedKopecks === 0) {
    totalContributedKopecks = parseInt(deposit.principal_kopecks || deposit.amount_kopecks || 0, 10);
  }
  const growthPercent = parseFloat(((finalBalanceKopecks - totalContributedKopecks) / totalContributedKopecks * 100).toFixed(2));

  return {
    depositId: deposit.id,
    current: {
      date: new Date(now).toISOString(),
      balanceKopecks: state.currentBalanceKopecks,
      earnedInterestKopecks: state.earnedInterestKopecks,
      completedPeriods: state.completedPeriods,
      nextAccrualDate: state.nextAccrualDate
    },
    forecast,
    summary: {
      periods,
      finalBalanceKopecks,
      totalInterestKopecks: forecast[periods - 1] ? forecast[periods - 1].earnedInterestKopecks : state.earnedInterestKopecks,
      growthPercent: isNaN(growthPercent) ? 0 : growthPercent
    }
  };
}

/**
 * Simulates growth with regular top-ups.
 */
function simulateRegularTopUps({ principalKopecks, rateBps, periodDays, periods = 12, regularTopUpKopecks = 0, goalTargetKopecks = null }) {
  const ratePerPeriod = rateBps / 10000;
  const forecast = [];
  let currentSimulatedBalance = principalKopecks;
  let totalContributed = principalKopecks;
  let totalInterest = 0;

  const referenceDate = new Date();

  // Period 0
  forecast.push({
    futurePeriod: 0,
    date: referenceDate.toISOString(),
    balanceKopecks: principalKopecks,
    earnedInterestKopecks: 0,
    periodInterestKopecks: 0,
    totalContributedKopecks: principalKopecks
  });

  let estimatedReachPeriod = null;

  for (let i = 1; i <= periods; i++) {
    const futurePeriodDate = new Date(referenceDate.getTime() + i * periodDays * 24 * 60 * 60 * 1000);
    
    currentSimulatedBalance += regularTopUpKopecks;
    totalContributed += regularTopUpKopecks;

    const periodInterestKopecks = Math.round(currentSimulatedBalance * ratePerPeriod);
    currentSimulatedBalance += periodInterestKopecks;
    totalInterest += periodInterestKopecks;

    forecast.push({
      futurePeriod: i,
      date: futurePeriodDate.toISOString(),
      balanceKopecks: currentSimulatedBalance,
      earnedInterestKopecks: totalInterest,
      periodInterestKopecks,
      totalContributedKopecks: totalContributed
    });

    if (goalTargetKopecks && currentSimulatedBalance >= goalTargetKopecks && estimatedReachPeriod === null) {
      estimatedReachPeriod = i;
    }
  }

  const isReached = goalTargetKopecks ? (currentSimulatedBalance >= goalTargetKopecks) : false;
  const remainingKopecks = goalTargetKopecks ? Math.max(0, goalTargetKopecks - currentSimulatedBalance) : 0;

  return {
    principalKopecks,
    totalContributedKopecks: totalContributed,
    totalInterestKopecks: totalInterest,
    finalBalanceKopecks: currentSimulatedBalance,
    goalProjection: {
      isReached,
      remainingKopecks,
      estimatedReachPeriod
    },
    forecast,
    summary: {
      periods,
      finalBalanceKopecks: currentSimulatedBalance,
      totalInterestKopecks: totalInterest,
      growthPercent: parseFloat(((currentSimulatedBalance - totalContributed) / totalContributed * 100).toFixed(2))
    }
  };
}

/**
 * Estimates the goal reach date/periods
 */
function estimateGoalReach(deposit, contributions, goalTargetKopecks, now = new Date()) {
  const state = calculateDepositState(deposit, contributions, now);
  if (state.currentBalanceKopecks >= goalTargetKopecks) {
    return { isReached: true, remainingKopecks: 0, estimatedPeriods: 0, estimatedDate: now.toISOString() };
  }

  const initialContribution = contributions.find(c => c.type === 'initial' && c.status === 'approved') || {
    approved_at: deposit.approved_at || deposit.created_at
  };
  const start = new Date(initialContribution.approved_at || deposit.approved_at || deposit.created_at);
  const periodDays = parseInt(deposit.locked_period_days || deposit.period_days || 1, 10);
  const currentCompleted = state.completedPeriods;

  for (let i = 1; i <= 120; i++) {
    const futurePeriodDays = (currentCompleted + i) * periodDays;
    const futurePeriodDate = new Date(start.getTime() + futurePeriodDays * 24 * 60 * 60 * 1000);
    const futureState = calculateDepositState(deposit, contributions, futurePeriodDate);
    if (futureState.currentBalanceKopecks >= goalTargetKopecks) {
      return {
        isReached: false,
        remainingKopecks: goalTargetKopecks - state.currentBalanceKopecks,
        estimatedPeriods: i,
        estimatedDate: futurePeriodDate.toISOString()
      };
    }
  }

  return {
    isReached: false,
    remainingKopecks: goalTargetKopecks - state.currentBalanceKopecks,
    estimatedPeriods: null,
    estimatedDate: null
  };
}

/**
 * Simulates simple growth (original function)
 */
function simulateDepositGrowth(principalKopecks, rateBps, periodDays, periods = 12) {
  const sim = simulateRegularTopUps({ principalKopecks, rateBps, periodDays, periods, regularTopUpKopecks: 0 });
  sim.forecast = sim.forecast.filter(f => f.futurePeriod !== 0);
  return sim;
}

/**
 * Builds comparison between withdrawing now vs waiting.
 */
function buildWithdrawalComparison(deposit, contributions = [], withdrawalDate = new Date(), comparePeriods = 12) {
  if (contributions && !Array.isArray(contributions)) {
    const origWithdrawalDate = contributions;
    const origComparePeriods = withdrawalDate;
    withdrawalDate = origWithdrawalDate;
    comparePeriods = typeof origComparePeriods === 'number' ? origComparePeriods : 12;
    contributions = [];
  }
  if (!withdrawalDate) {
    withdrawalDate = new Date();
  } else if (typeof withdrawalDate === 'string') {
    withdrawalDate = new Date(withdrawalDate);
  }

  const withdrawalState = calculateDepositState(deposit, contributions, withdrawalDate);
  const forecastResult = getForecast(deposit, contributions, comparePeriods, withdrawalDate);

  const initialContribution = contributions.find(c => c.type === 'initial' && c.status === 'approved') || {
    approved_at: deposit.approved_at || deposit.created_at
  };
  const start = new Date(initialContribution.approved_at || deposit.approved_at || deposit.created_at);
  const minHoldingDays = parseInt(deposit.locked_minimum_holding_days || deposit.minimum_holding_days || 0, 10);
  const nextPenaltyFreeDate = new Date(start.getTime() + minHoldingDays * 24 * 60 * 60 * 1000);

  const penaltyFreeState = calculateDepositState(deposit, contributions, nextPenaltyFreeDate);

  const timeline = [];
  
  timeline.push({
    period: 0,
    date: new Date(withdrawalDate).toISOString(),
    withdrawNowPayoutKopecks: withdrawalState.finalPayoutKopecks,
    continueBalanceKopecks: withdrawalState.currentBalanceKopecks,
    differenceKopecks: withdrawalState.currentBalanceKopecks - withdrawalState.finalPayoutKopecks
  });

  forecastResult.forecast.forEach(f => {
    timeline.push({
      period: f.futurePeriod,
      date: f.date,
      withdrawNowPayoutKopecks: withdrawalState.finalPayoutKopecks,
      continueBalanceKopecks: f.balanceKopecks,
      differenceKopecks: f.balanceKopecks - withdrawalState.finalPayoutKopecks
    });
  });

  const lostFutureGrowthKopecks = forecastResult.summary.finalBalanceKopecks - withdrawalState.currentBalanceKopecks;
  const totalDifferenceKopecks = forecastResult.summary.finalBalanceKopecks - withdrawalState.finalPayoutKopecks;

  return {
    depositId: deposit.id,
    currency: "RUB",
    withdrawal: {
      date: new Date(withdrawalDate).toISOString(),
      isEarly: withdrawalState.isEarly,
      daysHeld: withdrawalState.daysHeld,
      minimumHoldingDays: minHoldingDays,
      daysUntilPenaltyFree: Math.max(0, Math.ceil((nextPenaltyFreeDate.getTime() - new Date(withdrawalDate).getTime()) / (1000 * 60 * 60 * 24))),
      principalKopecks: withdrawalState.principalKopecks,
      currentBalanceBeforeAdjustmentKopecks: withdrawalState.currentBalanceKopecks,
      earnedInterestBeforeAdjustmentKopecks: withdrawalState.earnedInterestKopecks,
      interestForfeitedKopecks: withdrawalState.interestForfeitedKopecks,
      penaltyKopecks: withdrawalState.penaltyKopecks,
      payoutKopecks: withdrawalState.finalPayoutKopecks
    },
    comparison: {
      nextPenaltyFreeDate: nextPenaltyFreeDate.toISOString(),
      penaltyFreePayoutForecastKopecks: penaltyFreeState.finalPayoutKopecks,
      forecastPeriods: comparePeriods,
      continueToFinalBalanceKopecks: forecastResult.summary.finalBalanceKopecks,
      lostFutureGrowthKopecks,
      totalDifferenceKopecks
    },
    timeline
  };
}

module.exports = {
  calculateDepositState,
  getForecast,
  simulateDepositGrowth,
  simulateRegularTopUps,
  estimateGoalReach,
  buildWithdrawalComparison
};
