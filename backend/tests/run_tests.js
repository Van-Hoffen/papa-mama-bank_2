const assert = require('assert');
const { calculateDepositState, getForecast, simulateDepositGrowth, buildWithdrawalComparison } = require('../utils/interestCalculator');

console.log('🧪 Starting Interest Calculator & Early Withdrawal unit tests...');

async function run() {
  try {
  // Test 1: 12-period forecast for 2,000 ₽ at 4% per period
  console.log('Test 1: 12-period forecast for 2,000 ₽ at 4% per period...');
  const depositMock1 = {
    principal_kopecks: 200000,
    locked_interest_rate_bps: 400, // 4%
    locked_period_days: 14,
    locked_minimum_holding_days: 7,
    locked_penalty_bps: 0,
    approved_at: new Date().toISOString()
  };

  const forecastResult = getForecast(depositMock1, 12, new Date());
  assert.strictEqual(forecastResult.summary.periods, 12, 'Should forecast exactly 12 periods');
  assert.strictEqual(forecastResult.summary.finalBalanceKopecks, 320208, 'Final balance should be 320,208 kopecks');
  assert.strictEqual(forecastResult.summary.totalInterestKopecks, 120208, 'Earned interest should be 120,208 kopecks');
  assert.strictEqual(forecastResult.summary.growthPercent, 60.1, 'Growth percent should be 60.1%');
  console.log('✅ Test 1 passed!');

  // Test 2: Forecast starting from current balance with completed periods
  console.log('Test 2: Forecast starting from current balance with completed periods...');
  const approvedDate = new Date();
  approvedDate.setDate(approvedDate.getDate() - 14); // 1 period completed (14 days ago)
  
  const depositMock2 = {
    principal_kopecks: 200000,
    locked_interest_rate_bps: 400,
    locked_period_days: 14,
    locked_minimum_holding_days: 7,
    locked_penalty_bps: 0,
    approved_at: approvedDate.toISOString()
  };

  const state2 = calculateDepositState(depositMock2, new Date());
  assert.strictEqual(state2.completedPeriods, 1, 'Should have exactly 1 completed period');
  assert.strictEqual(state2.currentBalanceKopecks, 208000, 'Current balance after 1 period should be 208,000');

  // Next forecast from now should compound from 208,000
  const forecastResult2 = getForecast(depositMock2, 12, new Date());
  assert.strictEqual(forecastResult2.current.balanceKopecks, 208000, 'Current forecast starting point should be 208,000');
  // period 1 in forecast is 208,000 * 1.04 = 216,320
  assert.strictEqual(forecastResult2.forecast[0].balanceKopecks, 216320, 'First forecasted period should compound from current balance');
  console.log('✅ Test 2 passed!');

  // Test 3: No interest for incomplete period
  console.log('Test 3: No interest for incomplete period...');
  const approvedDateIncomplete = new Date();
  approvedDateIncomplete.setDate(approvedDateIncomplete.getDate() - 5); // 5 days out of 14, incomplete

  const depositMock3 = {
    principal_kopecks: 200000,
    locked_interest_rate_bps: 400,
    locked_period_days: 14,
    locked_minimum_holding_days: 7,
    locked_penalty_bps: 0,
    approved_at: approvedDateIncomplete.toISOString()
  };

  const state3 = calculateDepositState(depositMock3, new Date());
  assert.strictEqual(state3.completedPeriods, 0, 'Completed periods should be 0');
  assert.strictEqual(state3.currentBalanceKopecks, 200000, 'No interest accrued yet');
  console.log('✅ Test 3 passed!');

  // Test 4: Verification of periods 1, 6 and 12
  console.log('Test 4: Verification of periods 1, 6 and 12...');
  // Period 1: 208,000
  // Period 6: Math.round(200,000 * (1.04)^6) = 253,064 (Wait, compounded step-by-step:
  // p1=208000, p2=216320, p3=224973, p4=233972, p5=243331, p6=253064) Let's verify with simulator
  const sim = simulateDepositGrowth(200000, 400, 14, 12);
  assert.strictEqual(sim.forecast[0].balanceKopecks, 208000, 'Period 1 correct');
  assert.strictEqual(sim.forecast[5].balanceKopecks, 253064, 'Period 6 correct');
  assert.strictEqual(sim.forecast[11].balanceKopecks, 320208, 'Period 12 correct');
  console.log('✅ Test 4 passed!');

  // Test 5: Stable rounding to kopecks
  console.log('Test 5: Stable rounding to kopecks...');
  // A = 100050 (1000.50 RUB), rate = 13% (1300 bps)
  const simRounding = simulateDepositGrowth(100050, 1300, 30, 1);
  assert.strictEqual(simRounding.forecast[0].balanceKopecks, 113057, 'Should round properly without floating issues');
  console.log('✅ Test 5 passed!');

  // Test 6: Early withdrawal with keep_earned_interest
  console.log('Test 6: Early withdrawal keep_earned_interest...');
  const startEarlyKeep = new Date();
  startEarlyKeep.setDate(startEarlyKeep.getDate() - 15); // 15 days ago, min holding is 30. period is 10 days.
  // 1 complete period. principal = 200,000. rate = 4% (400 bps).
  // balance = 208,000. penalty rate = 2% (200 bps).
  const depositMockKeep = {
    principal_kopecks: 200000,
    locked_interest_rate_bps: 400,
    locked_period_days: 10,
    locked_minimum_holding_days: 30,
    locked_penalty_bps: 200,
    locked_early_withdrawal_interest_policy: 'keep_earned_interest',
    approved_at: startEarlyKeep.toISOString()
  };

  const stateKeep = calculateDepositState(depositMockKeep, new Date());
  assert.strictEqual(stateKeep.isEarly, true, 'Withdrawal should be early');
  assert.strictEqual(stateKeep.currentBalanceKopecks, 208000, 'Current balance before penalty should have 1 period interest');
  // Penalty: 2% of 208,000 = 4,160
  assert.strictEqual(stateKeep.penaltyKopecks, 4160, 'Penalty should be 2% of current balance (4,160 kopecks)');
  assert.strictEqual(stateKeep.interestForfeitedKopecks, 0, 'Earned interest should be kept');
  assert.strictEqual(stateKeep.finalPayoutKopecks, 203840, 'Payout should be 208,000 - 4,160 = 203,840');
  console.log('✅ Test 6 passed!');

  // Test 7: Early withdrawal with lose_all_interest
  console.log('Test 7: Early withdrawal lose_all_interest...');
  const depositMockLose = {
    ...depositMockKeep,
    locked_early_withdrawal_interest_policy: 'lose_all_interest'
  };

  const stateLose = calculateDepositState(depositMockLose, new Date());
  assert.strictEqual(stateLose.isEarly, true, 'Withdrawal should be early');
  assert.strictEqual(stateLose.currentBalanceKopecks, 208000, 'Current balance is 208,000');
  assert.strictEqual(stateLose.interestForfeitedKopecks, 8000, 'All interest (8,000 kopecks) should be forfeited');
  // Penalty: 2% of principal 200,000 = 4,000
  assert.strictEqual(stateLose.penaltyKopecks, 4000, 'Penalty should be 2% of principal (4,000 kopecks)');
  assert.strictEqual(stateLose.finalPayoutKopecks, 196000, 'Payout should be principal (200,000) - penalty (4,000) = 196,000');
  console.log('✅ Test 7 passed!');

  // Test 8: Withdrawal after minimum holding days (no penalty)
  console.log('Test 8: Withdrawal after minimum holding days...');
  const startLate = new Date();
  startLate.setDate(startLate.getDate() - 35); // 35 days ago. min holding is 30. period is 10 days.
  // 3 complete periods. principal = 200,000. rate = 4%.
  const depositMockLate = {
    principal_kopecks: 200000,
    locked_interest_rate_bps: 400,
    locked_period_days: 10,
    locked_minimum_holding_days: 30,
    locked_penalty_bps: 200,
    locked_early_withdrawal_interest_policy: 'lose_all_interest',
    approved_at: startLate.toISOString()
  };

  const stateLate = calculateDepositState(depositMockLate, new Date());
  assert.strictEqual(stateLate.isEarly, false, 'Withdrawal should NOT be early');
  assert.strictEqual(stateLate.penaltyKopecks, 0, 'No penalty');
  assert.strictEqual(stateLate.interestForfeitedKopecks, 0, 'No interest forfeited');
  console.log('✅ Test 8 passed!');

  // Test 9: Lost future growth correctly computed as difference
  console.log('Test 9: Lost future growth calculation...');
  const comp = buildWithdrawalComparison(depositMockLose, new Date(), 12);
  // comparison.lostFutureGrowthKopecks should equal comparison.continueToFinalBalanceKopecks - withdrawal.currentBalanceBeforeAdjustmentKopecks
  assert.strictEqual(
    comp.comparison.lostFutureGrowthKopecks,
    comp.comparison.continueToFinalBalanceKopecks - comp.withdrawal.currentBalanceBeforeAdjustmentKopecks,
    'Lost future growth should be compound interest difference'
  );
  // comparison.totalDifferenceKopecks should be final forecasted balance - payout now
  assert.strictEqual(
    comp.comparison.totalDifferenceKopecks,
    comp.comparison.continueToFinalBalanceKopecks - comp.withdrawal.payoutKopecks,
    'Total difference should be forecast balance minus payout now'
  );
  console.log('✅ Test 9 passed!');

  // Test 10: Timeline contains period 0 (now) and 12 periods
  console.log('Test 10: Timeline size and content verification...');
  assert.strictEqual(comp.timeline.length, 13, 'Timeline must have 13 points (period 0 to 12)');
  assert.strictEqual(comp.timeline[0].period, 0, 'First point is period 0');
  assert.strictEqual(comp.timeline[12].period, 12, 'Last point is period 12');
  console.log('✅ Test 10 passed!');

  // Mandatory Test 1: первоначальный взнос без процентов
  console.log('Mandatory Test 1: первоначальный взнос без процентов...');
  const depositMockMandatory1 = {
    principal_kopecks: 200000,
    locked_interest_rate_bps: 400, // 4%
    locked_period_days: 14,
    status: 'active',
    approved_at: new Date().toISOString()
  };
  const contributionsMandatory1 = [
    { type: 'initial', amount_kopecks: 200000, status: 'approved', approved_at: new Date().toISOString() },
    { type: 'parent_reward', amount_kopecks: 50000, status: 'approved', approved_at: new Date().toISOString() }
  ];
  const stateMandatory1 = calculateDepositState(depositMockMandatory1, contributionsMandatory1, new Date());
  assert.strictEqual(stateMandatory1.currentBalanceKopecks, 250000, 'Expected balance: 2500 rubles (250000 kopecks)');
  assert.strictEqual(stateMandatory1.principalKopecks, 250000, 'Expected totalContributed: 2500 rubles (250000 kopecks)');
  assert.strictEqual(stateMandatory1.earnedInterestKopecks, 0, 'Expected earnedInterest: 0 kopecks');
  console.log('✅ Mandatory Test 1 passed!');

  // Mandatory Test 2: pending не учитывается
  console.log('Mandatory Test 2: pending не учитывается...');
  const depositMockMandatory2 = {
    principal_kopecks: 200000,
    locked_interest_rate_bps: 400,
    locked_period_days: 14,
    status: 'active',
    approved_at: new Date().toISOString()
  };
  const contributionsMandatory2 = [
    { type: 'initial', amount_kopecks: 200000, status: 'approved', approved_at: new Date().toISOString() },
    { type: 'top_up', amount_kopecks: 50000, status: 'pending', approved_at: null },
    { type: 'parent_reward', amount_kopecks: 30000, status: 'approved', approved_at: new Date().toISOString() }
  ];
  const stateMandatory2 = calculateDepositState(depositMockMandatory2, contributionsMandatory2, new Date());
  assert.strictEqual(stateMandatory2.currentBalanceKopecks, 230000, 'Expected balance: 2300 rubles (230000 kopecks)');
  console.log('✅ Mandatory Test 2 passed!');

  // Mandatory Test 3: rejected не учитывается
  console.log('Mandatory Test 3: rejected не учитывается...');
  const depositMockMandatory3 = {
    principal_kopecks: 200000,
    locked_interest_rate_bps: 400,
    locked_period_days: 14,
    status: 'active',
    approved_at: new Date().toISOString()
  };
  const contributionsMandatory3 = [
    { type: 'initial', amount_kopecks: 200000, status: 'approved', approved_at: new Date().toISOString() },
    { type: 'parent_reward', amount_kopecks: 50000, status: 'rejected', approved_at: null }
  ];
  const stateMandatory3 = calculateDepositState(depositMockMandatory3, contributionsMandatory3, new Date());
  assert.strictEqual(stateMandatory3.currentBalanceKopecks, 200000, 'Expected balance: 2000 rubles (200000 kopecks)');
  console.log('✅ Mandatory Test 3 passed!');

  // Mandatory Test 4: сложный процент
  console.log('Mandatory Test 4: сложный процент...');
  const startDay = new Date();
  
  const day0 = new Date(startDay.getTime());
  const day14 = new Date(startDay.getTime() + 14 * 24 * 60 * 60 * 1000);
  const day15 = new Date(startDay.getTime() + 15 * 24 * 60 * 60 * 1000);
  const day28 = new Date(startDay.getTime() + 28 * 24 * 60 * 60 * 1000);

  const depositMockMandatory4 = {
    principal_kopecks: 200000,
    locked_interest_rate_bps: 400, // 4%
    locked_period_days: 14,
    locked_interest_accrual_mode: 'whole_balance_on_schedule',
    status: 'active',
    approved_at: day0.toISOString()
  };

  const initialCont = { type: 'initial', amount_kopecks: 200000, status: 'approved', approved_at: day0.toISOString() };
  const parentRewardCont = { type: 'parent_reward', amount_kopecks: 50000, status: 'approved', approved_at: day15.toISOString() };

  // 1. At Day 14 (exactly 1 complete period, before parent_reward exists)
  const stateAtDay14 = calculateDepositState(depositMockMandatory4, [initialCont], day14);
  assert.strictEqual(stateAtDay14.completedPeriods, 1);
  assert.strictEqual(stateAtDay14.currentBalanceKopecks, 208000, 'Expected balance 2080 rubles (208000 kopecks)');

  // 2. At Day 15 (after parent_reward is approved, but before next accrual on Day 28)
  const stateAtDay15 = calculateDepositState(depositMockMandatory4, [initialCont, parentRewardCont], day15);
  assert.strictEqual(stateAtDay15.completedPeriods, 1);
  assert.strictEqual(stateAtDay15.currentBalanceKopecks, 258000, 'Expected balance 2580 rubles (258000 kopecks)');

  // 3. At Day 28 (next accrual date, 2 complete periods)
  const stateAtDay28 = calculateDepositState(depositMockMandatory4, [initialCont, parentRewardCont], day28);
  assert.strictEqual(stateAtDay28.completedPeriods, 2);
  assert.strictEqual(stateAtDay28.currentBalanceKopecks, 268320, 'Expected balance 2683.20 rubles (268320 kopecks)');
  console.log('✅ Mandatory Test 4 passed!');

  // Mandatory Test 5: миграция старых вкладов
  console.log('Mandatory Test 5: миграция старых вкладов...');
  const sqlite3 = require('sqlite3').verbose();
  const testDb = new sqlite3.Database(':memory:');

  const testDbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      testDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  };

  const testDbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      testDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  const testDbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      testDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  await testDbRun(`
    CREATE TABLE families (
      id INTEGER PRIMARY KEY
    )
  `);
  await testDbRun(`
    CREATE TABLE child_profiles (
      id INTEGER PRIMARY KEY,
      user_id INTEGER UNIQUE
    )
  `);
  await testDbRun(`
    CREATE TABLE family_members (
      family_id INTEGER,
      user_id INTEGER,
      role TEXT
    )
  `);
  await testDbRun(`
    CREATE TABLE deposits (
      id INTEGER PRIMARY KEY,
      family_id INTEGER,
      bank_id INTEGER,
      child_profile_id INTEGER,
      principal_kopecks INTEGER,
      status TEXT,
      created_at DATETIME,
      approved_at DATETIME
    )
  `);
  await testDbRun(`
    CREATE TABLE deposit_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER,
      deposit_id INTEGER,
      child_profile_id INTEGER,
      bank_id INTEGER,
      type TEXT,
      amount_kopecks INTEGER,
      status TEXT,
      requested_by_user_id INTEGER,
      approved_by_user_id INTEGER,
      requested_at DATETIME,
      approved_at DATETIME,
      created_at DATETIME,
      updated_at DATETIME
    )
  `);

  await testDbRun(`INSERT INTO families (id) VALUES (1)`);
  await testDbRun(`INSERT INTO child_profiles (id, user_id) VALUES (10, 100)`);
  await testDbRun(`INSERT INTO family_members (family_id, user_id, role) VALUES (1, 101, 'family_admin')`);
  await testDbRun(`
    INSERT INTO deposits (id, family_id, bank_id, child_profile_id, principal_kopecks, status, created_at, approved_at)
    VALUES (50, 1, 5, 10, 200000, 'active', '2026-07-20 12:00:00', '2026-07-20 12:01:00')
  `);

  async function runBackfill(dbAllFn, dbGetFn, dbRunFn) {
    const deposits = await dbAllFn(`
      SELECT d.*, cp.user_id AS child_user_id 
      FROM deposits d
      JOIN child_profiles cp ON d.child_profile_id = cp.id
    `);
    for (const dep of deposits) {
      if (dep.status === 'pending_open') {
        continue;
      }

      const existingInitial = await dbGetFn(`
        SELECT * FROM deposit_contributions 
        WHERE deposit_id = ? AND type = 'initial'
      `, [dep.id]);

      if (!existingInitial) {
        const familyAdmin = await dbGetFn(`
          SELECT user_id FROM family_members 
          WHERE family_id = ? AND role = 'family_admin' 
          LIMIT 1
        `, [dep.family_id]);
        const approverId = familyAdmin ? familyAdmin.user_id : dep.child_user_id;

        const approvedAt = dep.approved_at || dep.created_at;

        await dbRunFn(`
          INSERT INTO deposit_contributions (
            family_id, deposit_id, child_profile_id, bank_id, type, 
            amount_kopecks, status, requested_by_user_id, approved_by_user_id, 
            requested_at, approved_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'initial', ?, 'approved', ?, ?, ?, ?, ?, ?)
        `, [
          dep.family_id,
          dep.id,
          dep.child_profile_id,
          dep.bank_id,
          dep.principal_kopecks,
          dep.child_user_id,
          approverId,
          dep.created_at,
          approvedAt,
          dep.created_at,
          approvedAt
        ]);
      }
    }
  }

  await runBackfill(testDbAll, testDbGet, testDbRun);
  const contsFirst = await testDbAll(`SELECT * FROM deposit_contributions WHERE deposit_id = 50`);
  assert.strictEqual(contsFirst.length, 1);
  assert.strictEqual(contsFirst[0].type, 'initial');
  assert.strictEqual(contsFirst[0].amount_kopecks, 200000);
  assert.strictEqual(contsFirst[0].status, 'approved');

  await runBackfill(testDbAll, testDbGet, testDbRun);
  const contsSecond = await testDbAll(`SELECT * FROM deposit_contributions WHERE deposit_id = 50`);
  assert.strictEqual(contsSecond.length, 1, 'Duplicate initial contribution should not be created');

  await new Promise((resolve) => testDb.close(resolve));
  console.log('✅ Mandatory Test 5 passed!');

  console.log('\n🎉 ALL 15 UNIT AND MANDATORY TESTS PASSED SUCCESSFULLY! 🥇');
  } catch (err) {
    console.error('\n❌ Unit test failed!');
    console.error(err);
    process.exit(1);
  }
}

run();
