const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireFamilyMembership } = require('../middleware/auth');
const { calculateDepositState, getForecast, simulateRegularTopUps, buildWithdrawalComparison } = require('../utils/interestCalculator');

const router = express.Router();

/**
 * GET /api/analytics/forecast/:depositId - Forecast future returns for a deposit
 */
router.get('/forecast/:depositId', requireAuth, requireFamilyMembership, async (req, res) => {
  const depositId = parseInt(req.params.depositId, 10);
  const periods = parseInt(req.query.periods, 10) || 12;

  try {
    const deposit = await dbGet(`
      SELECT d.*, b.name as bank_name, b.id as bank_id, b.period_days as bank_period_days, b.interest_rate_bps as bank_interest_rate_bps
      FROM deposits d
      JOIN banks b ON d.bank_id = b.id
      WHERE d.id = ? AND d.family_id = ?
    `, [depositId, req.user.familyId]);

    if (!deposit) {
      return res.status(404).json({ error: 'Вклад не найден.' });
    }

    if (req.user.platformRole !== 'global_admin') {
      if (req.user.familyRole === 'child') {
        const childProfile = await dbGet(`SELECT id FROM child_profiles WHERE user_id = ?`, [req.user.id]);
        if (!childProfile || deposit.child_profile_id !== childProfile.id) {
          return res.status(404).json({ error: 'Вклад не найден.' });
        }
      } else {
        if (deposit.family_id !== req.user.familyId) {
          return res.status(404).json({ error: 'Вклад не найден.' });
        }
      }
    }

    const contributions = await dbAll(`
      SELECT * FROM deposit_contributions 
      WHERE deposit_id = ? AND status = 'approved'
    `, [depositId]);

    const forecastResult = getForecast(deposit, contributions, periods, new Date());

    return res.json({
      depositId: deposit.id,
      bank: {
        id: deposit.bank_id,
        name: deposit.bank_name,
        periodDays: deposit.locked_period_days,
        interestRateBps: deposit.locked_interest_rate_bps
      },
      currency: 'RUB',
      current: forecastResult.current,
      forecast: forecastResult.forecast,
      summary: forecastResult.summary
    });

  } catch (error) {
    console.error('Get forecast error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/analytics/calculator - Run simulation calculator
 */
router.post('/calculator', requireAuth, requireFamilyMembership, async (req, res) => {
  const { bankId, principalKopecks, periods = 12, regularTopUpKopecks = 0, goalTargetKopecks = null } = req.body;

  if (req.user.familyRole !== 'child' && req.user.familyRole !== 'family_admin') {
    return res.status(403).json({ error: 'Доступ запрещен.' });
  }

  if (!bankId || !principalKopecks) {
    return res.status(400).json({ error: 'Укажите банк и сумму.' });
  }

  const pKopecks = parseInt(principalKopecks, 10);
  const pCount = parseInt(periods, 10);

  if (isNaN(pKopecks) || pKopecks <= 0) {
    return res.status(400).json({ error: 'Сумма вклада должна быть положительным числом.' });
  }

  if (isNaN(pCount) || pCount < 1 || pCount > 120) { // Extended limit up to 120 for realistic projections
    return res.status(400).json({ error: 'Количество периодов должно быть от 1 до 120.' });
  }

  try {
    const bank = await dbGet(`SELECT * FROM banks WHERE id = ? AND family_id = ?`, [bankId, req.user.familyId]);
    if (!bank) {
      return res.status(404).json({ error: 'Банк не найден.' });
    }

    if (!bank.is_active) {
      return res.status(400).json({ error: 'Выбранный банк не активен.' });
    }

    if (pKopecks < bank.minimum_deposit_kopecks) {
      return res.status(400).json({ 
        error: `Сумма вклада меньше минимальной для этого банка: ${(bank.minimum_deposit_kopecks / 100).toFixed(2)} ₽` 
      });
    }

    if (bank.maximum_deposit_per_child_kopecks && pKopecks > bank.maximum_deposit_per_child_kopecks) {
      return res.status(400).json({ 
        error: `Сумма вклада превышает максимальный лимит для одного ребенка в этом банке: ${(bank.maximum_deposit_per_child_kopecks / 100).toFixed(2)} ₽` 
      });
    }

    const simulation = simulateRegularTopUps({
      principalKopecks: pKopecks,
      rateBps: bank.interest_rate_bps,
      periodDays: bank.period_days,
      periods: pCount,
      regularTopUpKopecks: regularTopUpKopecks ? parseInt(regularTopUpKopecks, 10) : 0,
      goalTargetKopecks: goalTargetKopecks ? parseInt(goalTargetKopecks, 10) : null
    });

    return res.json({
      bank: {
        id: bank.id,
        name: bank.name,
        periodDays: bank.period_days,
        interestRateBps: bank.interest_rate_bps,
        minimumHoldingDays: bank.minimum_holding_days,
        earlyWithdrawalPenaltyBps: bank.early_withdrawal_penalty_bps,
        earlyWithdrawalInterestPolicy: bank.early_withdrawal_interest_policy
      },
      ...simulation
    });

  } catch (error) {
    console.error('Calculator simulation error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/analytics/early-withdrawal-preview - Preview early withdrawal comparison
 */
router.post('/early-withdrawal-preview', requireAuth, requireFamilyMembership, async (req, res) => {
  const { depositId, withdrawalDate, comparePeriods = 12 } = req.body;

  if (!depositId) {
    return res.status(400).json({ error: 'Укажите ID вклада.' });
  }

  const pCount = parseInt(comparePeriods, 10);
  if (isNaN(pCount) || pCount < 1 || pCount > 12) {
    return res.status(400).json({ error: 'Количество периодов должно быть от 1 до 12.' });
  }

  let dateToUse;
  if (withdrawalDate && typeof withdrawalDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(withdrawalDate)) {
    dateToUse = new Date(withdrawalDate + 'T00:00:00Z');
  } else {
    dateToUse = withdrawalDate ? new Date(withdrawalDate) : new Date();
    if (isNaN(dateToUse.getTime())) {
      dateToUse = new Date();
    }
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const checkDate = new Date(dateToUse);
  checkDate.setUTCHours(0, 0, 0, 0);
  // Give a 1-day grace period to avoid timezone mismatch issues between client and server
  if (checkDate.getTime() < todayStart.getTime() - 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: 'Дата досрочного снятия не может быть в прошлом.' });
  }

  try {
    const deposit = await dbGet(`SELECT * FROM deposits WHERE id = ? AND family_id = ?`, [depositId, req.user.familyId]);
    if (!deposit) {
      return res.status(404).json({ error: 'Вклад не найден.' });
    }

    if (req.user.platformRole !== 'global_admin') {
      if (req.user.familyRole === 'child') {
        const childProfile = await dbGet(`SELECT id FROM child_profiles WHERE user_id = ?`, [req.user.id]);
        if (!childProfile || deposit.child_profile_id !== childProfile.id) {
          return res.status(404).json({ error: 'Вклад не найден.' });
        }
      } else {
        if (deposit.family_id !== req.user.familyId) {
          return res.status(404).json({ error: 'Вклад не найден.' });
        }
      }
    }

    const contributions = await dbAll(`
      SELECT * FROM deposit_contributions 
      WHERE deposit_id = ? AND status = 'approved'
    `, [depositId]);

    const comparison = buildWithdrawalComparison(deposit, contributions, dateToUse, pCount);

    return res.json(comparison);

  } catch (error) {
    console.error('Withdrawal preview error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/analytics/child/:childId - Statistics and metrics for a single child
 */
router.get('/child/:childId', requireAuth, requireFamilyMembership, async (req, res) => {
  const childId = parseInt(req.params.childId, 10);

  try {
    // Check family authorization
    const childProfile = await dbGet(`
      SELECT cp.id, u.display_name, cp.avatar_color
      FROM child_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.user_id = ? AND cp.family_id = ?
    `, [childId, req.user.familyId]);

    if (!childProfile) {
      return res.status(404).json({ error: 'Профиль ребенка не найден.' });
    }

    // Verify child can only query their own stats
    if (req.user.familyRole === 'child' && req.user.id !== childId) {
      return res.status(404).json({ error: 'Доступ запрещен.' });
    }

    // Fetch all deposits for child
    const deposits = await dbAll(`
      SELECT d.*, b.name as bank_name
      FROM deposits d
      JOIN banks b ON d.bank_id = b.id
      WHERE d.child_profile_id = ? AND d.family_id = ?
    `, [childProfile.id, req.user.familyId]);

    let totalInvestedKopecks = 0;
    let totalCurrentBalanceKopecks = 0;
    let totalInterestEarnedKopecks = 0;
    let activeDepositsCount = 0;

    for (const d of deposits) {
      const contributions = await dbAll(`
        SELECT * FROM deposit_contributions 
        WHERE deposit_id = ? AND status = 'approved'
      `, [d.id]);
      const state = calculateDepositState(d, contributions, new Date());
      if (d.status === 'active' || d.status === 'pending_close') {
        totalInvestedKopecks += state.principalKopecks;
        totalCurrentBalanceKopecks += state.currentBalanceKopecks;
        totalInterestEarnedKopecks += state.earnedInterestKopecks;
        activeDepositsCount++;
      } else if (d.status === 'closed') {
        totalInterestEarnedKopecks += Math.max(0, state.currentBalanceKopecks - state.principalKopecks);
      }
    }

    // Fetch recent operations
    const recentOperations = await dbAll(`
      SELECT o.*, b.name as bank_name, b.color as bank_color, u.display_name as child_name, d.goal_title as deposit_goal_title
      FROM operations o
      JOIN banks b ON o.bank_id = b.id
      JOIN child_profiles cp ON o.child_profile_id = cp.id
      JOIN users u ON cp.user_id = u.id
      LEFT JOIN deposits d ON o.deposit_id = d.id
      WHERE o.child_profile_id = ? AND o.family_id = ?
      ORDER BY o.requested_at DESC
      LIMIT 10
    `, [childProfile.id, req.user.familyId]);

    return res.json({
      childId,
      displayName: childProfile.display_name,
      avatarColor: childProfile.avatar_color,
      total_invested_kopecks: totalInvestedKopecks,
      total_current_balance_kopecks: totalCurrentBalanceKopecks,
      total_interest_earned_kopecks: totalInterestEarnedKopecks,
      active_deposits_count: activeDepositsCount,
      total_deposits_count: deposits.length,
      recent_operations: recentOperations
    });

  } catch (error) {
    console.error('Get child analytics error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/analytics/family - General analytics dashboard for the whole family (Admin only)
 */
router.get('/family', requireAuth, requireFamilyMembership, async (req, res) => {
  try {
    // 1. Get total number of children in family
    const childCountRow = await dbGet(`
      SELECT COUNT(*) as total FROM family_members 
      WHERE family_id = ? AND role = 'child'
    `, [req.user.familyId]);

    // 2. Load all deposits in the family to compute dynamic totals
    const deposits = await dbAll(`
      SELECT d.*, b.name as bank_name
      FROM deposits d
      JOIN banks b ON d.bank_id = b.id
      WHERE d.family_id = ?
    `, [req.user.familyId]);

    let totalInvestedKopecks = 0;
    let totalVirtualSumKopecks = 0;
    let totalEarnedInterestKopecks = 0;
    let activeDepositsCount = 0;

    for (const d of deposits) {
      const contributions = await dbAll(`
        SELECT * FROM deposit_contributions 
        WHERE deposit_id = ? AND status = 'approved'
      `, [d.id]);
      const state = calculateDepositState(d, contributions, new Date());
      if (d.status === 'active' || d.status === 'pending_close') {
        totalInvestedKopecks += state.principalKopecks;
        totalVirtualSumKopecks += state.currentBalanceKopecks;
        totalEarnedInterestKopecks += state.earnedInterestKopecks;
        activeDepositsCount++;
      } else if (d.status === 'closed') {
        totalEarnedInterestKopecks += Math.max(0, state.currentBalanceKopecks - state.principalKopecks);
      }
    }

    // 3. Count pending operations
    const pendingOpsRow = await dbGet(`
      SELECT COUNT(*) as total FROM operations 
      WHERE family_id = ? AND status = 'pending'
    `, [req.user.familyId]);

    // 4. Load bento chart metrics: balance distribution per child
    const childrenBalances = await dbAll(`
      SELECT cp.id as child_profile_id, u.display_name, cp.avatar_color
      FROM child_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.family_id = ?
    `, [req.user.familyId]);

    const bentoData = [];
    for (const child of childrenBalances) {
      const childDeposits = deposits.filter(d => d.child_profile_id === child.child_profile_id);
      let balance = 0;
      for (const d of childDeposits) {
        const contributions = await dbAll(`
          SELECT * FROM deposit_contributions 
          WHERE deposit_id = ? AND status = 'approved'
        `, [d.id]);
        const state = calculateDepositState(d, contributions, new Date());
        if (d.status === 'active' || d.status === 'pending_close') {
          balance += state.currentBalanceKopecks;
        }
      }
      bentoData.push({
        childId: child.child_profile_id,
        name: child.display_name,
        color: child.avatar_color,
        balanceKopecks: balance
      });
    }

    return res.json({
      total_children: childCountRow.total,
      total_active_deposits: activeDepositsCount,
      total_invested_kopecks: totalInvestedKopecks,
      total_virtual_sum_kopecks: totalVirtualSumKopecks,
      total_earned_interest_kopecks: totalEarnedInterestKopecks,
      pending_operations_count: pendingOpsRow.total,
      distribution: bentoData
    });

  } catch (error) {
    console.error('Get family analytics error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

module.exports = router;
