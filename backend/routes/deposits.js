const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireFamilyMembership, requireFamilyAdmin } = require('../middleware/auth');
const { calculateDepositState, getForecast, estimateGoalReach } = require('../utils/interestCalculator');

const router = express.Router();

/**
 * GET /api/deposits - List all deposits in the current user's family
 * Supports query params: child_profile_id, status
 */
router.get('/', requireAuth, requireFamilyMembership, async (req, res) => {
  const { child_profile_id, status } = req.query;

  try {
    let query = `
      SELECT d.*, b.name as bank_name, b.color as bank_color, b.icon as bank_icon, 
             b.allow_top_up, b.minimum_top_up_kopecks, b.maximum_top_up_kopecks, b.maximum_total_deposit_per_child_kopecks, b.is_active as bank_is_active,
             u.display_name as child_name, cp.user_id as child_user_id
      FROM deposits d
      JOIN banks b ON d.bank_id = b.id
      JOIN child_profiles cp ON d.child_profile_id = cp.id
      JOIN users u ON cp.user_id = u.id
      WHERE d.family_id = ?
    `;
    const params = [req.user.familyId];

    // Filter by child role
    if (req.user.familyRole === 'child') {
      query += ` AND cp.user_id = ?`;
      params.push(req.user.id);
    } else if (child_profile_id) {
      query += ` AND d.child_profile_id = ?`;
      params.push(parseInt(child_profile_id, 10));
    }

    if (status) {
      query += ` AND d.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY d.created_at DESC`;

    const deposits = await dbAll(query, params);

    // Hydrate each deposit with dynamically calculated interest state
    const hydratedDeposits = [];
    for (const d of deposits) {
      const contributions = await dbAll(`
        SELECT * FROM deposit_contributions 
        WHERE deposit_id = ? AND status = 'approved'
      `, [d.id]);
      const pendingTopUp = await dbGet(`
        SELECT id FROM operations 
        WHERE deposit_id = ? AND type = 'top_up' AND status = 'pending' 
        LIMIT 1
      `, [d.id]);
      const state = calculateDepositState(d, contributions, new Date());
      hydratedDeposits.push({
        ...d,
        calculated_balance_kopecks: state.currentBalanceKopecks,
        earned_interest_kopecks: state.earnedInterestKopecks,
        completed_periods: state.completedPeriods,
        next_accrual_date: state.nextAccrualDate,
        is_early_withdrawal: state.isEarly,
        predicted_penalty_kopecks: state.penaltyKopecks,
        predicted_payout_kopecks: state.finalPayoutKopecks,
        days_held: state.daysHeld,
        has_pending_top_up: !!pendingTopUp
      });
    }

    return res.json(hydratedDeposits);

  } catch (error) {
    console.error('List deposits error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/deposits/:id - Detailed view of a single deposit
 */
router.get('/:id', requireAuth, requireFamilyMembership, async (req, res) => {
  const depositId = parseInt(req.params.id, 10);

  try {
    const deposit = await dbGet(`
      SELECT d.*, b.name as bank_name, b.color as bank_color, b.icon as bank_icon, 
             b.allow_top_up, b.minimum_top_up_kopecks, b.maximum_top_up_kopecks, b.maximum_total_deposit_per_child_kopecks, b.is_active as bank_is_active,
             u.display_name as child_name, cp.user_id as child_user_id
      FROM deposits d
      JOIN banks b ON d.bank_id = b.id
      JOIN child_profiles cp ON d.child_profile_id = cp.id
      JOIN users u ON cp.user_id = u.id
      WHERE d.id = ? AND d.family_id = ?
    `, [depositId, req.user.familyId]);

    if (!deposit) {
      return res.status(404).json({ error: 'Вклад не найден.' });
    }

    // Child can only see their own deposits
    if (req.user.familyRole === 'child' && req.user.id !== deposit.child_user_id) {
      return res.status(404).json({ error: 'Вклад не найден.' });
    }

    const contributions = await dbAll(`
      SELECT * FROM deposit_contributions
      WHERE deposit_id = ?
      ORDER BY approved_at ASC, created_at ASC
    `, [depositId]);

    const approvedConts = contributions.filter(c => c.status === 'approved');
    const pendingTopUp = await dbGet(`
      SELECT id FROM operations 
      WHERE deposit_id = ? AND type = 'top_up' AND status = 'pending' 
      LIMIT 1
    `, [depositId]);
    const state = calculateDepositState(deposit, approvedConts, new Date());
    const forecasts = getForecast(deposit, approvedConts, 12, new Date());

    // Fetch related operations
    const operations = await dbAll(`
      SELECT o.*, u.display_name as requested_by_name, du.display_name as decided_by_name
      FROM operations o
      JOIN users u ON o.requested_by_user_id = u.id
      LEFT JOIN users du ON o.decided_by_user_id = du.id
      WHERE o.deposit_id = ?
      ORDER BY o.requested_at DESC
    `, [depositId]);

    // Build goal details if goal exists
    let goal = null;
    if (deposit.goal_target_kopecks) {
      const target = parseInt(deposit.goal_target_kopecks, 10);
      const remaining = Math.max(0, target - state.currentBalanceKopecks);
      const progressPercent = parseFloat(((state.currentBalanceKopecks / target) * 100).toFixed(2));
      const reach = estimateGoalReach(deposit, approvedConts, target, new Date());

      goal = {
        title: deposit.goal_title,
        targetKopecks: target,
        icon: deposit.goal_icon,
        note: deposit.goal_note,
        dueDate: deposit.goal_due_date,
        progressPercent,
        remainingKopecks: remaining,
        estimatedPeriodsWithoutTopUps: reach.estimatedPeriods,
        estimatedDateWithoutTopUps: reach.estimatedDate
      };
    }

    return res.json({
      ...deposit,
      calculated_balance_kopecks: state.currentBalanceKopecks,
      earned_interest_kopecks: state.earnedInterestKopecks,
      completed_periods: state.completedPeriods,
      next_accrual_date: state.nextAccrualDate,
      is_early_withdrawal: state.isEarly,
      predicted_penalty_kopecks: state.penaltyKopecks,
      predicted_payout_kopecks: state.finalPayoutKopecks,
      days_held: state.daysHeld,
      has_pending_top_up: !!pendingTopUp,
      forecasts,
      operations,
      contributions,
      goal
    });

  } catch (error) {
    console.error('Get deposit details error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/deposits/request-open - Request opening a deposit (called by child)
 */
router.post('/request-open', requireAuth, requireFamilyMembership, async (req, res) => {
  // Ensure only children can request deposits
  if (req.user.familyRole !== 'child') {
    return res.status(403).json({ error: 'Только дети могут отправлять заявки на открытие вкладов.' });
  }

  const { bankId, amountKopecks, goalTitle, goalTargetKopecks, goalIcon, goalNote, goalDueDate } = req.body;

  if (!bankId || !amountKopecks || amountKopecks <= 0) {
    return res.status(400).json({ error: 'Необходимо указать банк и положительную сумму.' });
  }

  try {
    const bank = await dbGet(`SELECT * FROM banks WHERE id = ? AND family_id = ?`, [bankId, req.user.familyId]);
    if (!bank) {
      return res.status(404).json({ error: 'Банк не найден.' });
    }

    if (!bank.is_active) {
      return res.status(400).json({ error: 'Этот банк временно заархивирован и новые вклады в него недоступны.' });
    }

    if (amountKopecks < bank.minimum_deposit_kopecks) {
      return res.status(400).json({ 
        error: `Минимальная сумма вклада для этого банка составляет ${(bank.minimum_deposit_kopecks / 100).toFixed(2)} ₽` 
      });
    }

    // Check maximum deposit limit per child in this bank
    if (bank.maximum_deposit_per_child_kopecks) {
      // Sum active and pending open deposits of this child in this bank
      const currentDeposited = await dbGet(`
        SELECT SUM(principal_kopecks) as total
        FROM deposits
        WHERE child_profile_id = ? AND bank_id = ? AND status IN ('active', 'pending_open', 'pending_close')
      `, [req.user.childProfileId, bankId]);

      const sum = (currentDeposited.total || 0) + amountKopecks;
      if (sum > bank.maximum_deposit_per_child_kopecks) {
        return res.status(400).json({
          error: `Вы превысили максимальный лимит вкладов в этом банке. Лимит составляет ${(bank.maximum_deposit_per_child_kopecks / 100).toFixed(2)} ₽. У вас уже внесено/ожидает: ${(currentDeposited.total / 100).toFixed(2)} ₽.`
        });
      }
    }

    // Insert pending deposit row
    const depositResult = await dbRun(`
      INSERT INTO deposits (
        family_id, bank_id, child_profile_id, principal_kopecks, status,
        locked_interest_rate_bps, locked_period_days, locked_minimum_holding_days,
        locked_penalty_bps, locked_minimum_deposit_kopecks, locked_early_withdrawal_interest_policy,
        locked_interest_accrual_mode,
        goal_title, goal_target_kopecks, goal_icon, goal_note, goal_due_date
      )
      VALUES (?, ?, ?, ?, 'pending_open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.familyId, bankId, req.user.childProfileId, amountKopecks,
      bank.interest_rate_bps, bank.period_days, bank.minimum_holding_days,
      bank.early_withdrawal_penalty_bps, bank.minimum_deposit_kopecks,
      bank.early_withdrawal_interest_policy || 'keep_earned_interest',
      bank.interest_accrual_mode || 'whole_balance_on_schedule',
      goalTitle || null,
      goalTargetKopecks ? parseInt(goalTargetKopecks, 10) : null,
      goalIcon || null,
      goalNote || null,
      goalDueDate || null
    ]);

    const depositId = depositResult.lastID;

    // Create a pending operation for approval
    const opResult = await dbRun(`
      INSERT INTO operations (
        family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status, requested_by_user_id
      )
      VALUES (?, ?, ?, ?, 'open', ?, 'pending', ?)
    `, [req.user.familyId, depositId, req.user.childProfileId, bankId, amountKopecks, req.user.id]);

    // Create a pending initial contribution
    await dbRun(`
      INSERT INTO deposit_contributions (
        family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status, requested_by_user_id
      )
      VALUES (?, ?, ?, ?, 'initial', ?, 'pending', ?)
    `, [req.user.familyId, depositId, req.user.childProfileId, bankId, amountKopecks, req.user.id]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'request_open_deposit', 'deposit', ?, ?)
    `, [req.user.familyId, req.user.id, depositId, `Создан запрос на открытие вклада на сумму ${(amountKopecks/100).toFixed(2)} ₽`]);

    return res.status(201).json({
      success: true,
      message: 'Заявка на открытие вклада успешно отправлена! Ожидайте одобрения родителями.',
      depositId,
      operationId: opResult.lastID
    });

  } catch (error) {
    console.error('Request open deposit error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/deposits/:depositId/top-ups - Request a top-up
 */
router.post('/:depositId/top-ups', requireAuth, requireFamilyMembership, async (req, res) => {
  const depositId = parseInt(req.params.depositId, 10);
  const { amountKopecks } = req.body;

  if (req.user.familyRole !== 'child') {
    return res.status(403).json({ error: 'Только дети могут отправлять заявки на пополнение.' });
  }

  if (!amountKopecks || amountKopecks <= 0) {
    return res.status(400).json({ error: 'Сумма пополнения должна быть больше нуля.' });
  }

  try {
    const deposit = await dbGet(`
      SELECT d.*, b.allow_top_up, b.minimum_top_up_kopecks, b.maximum_top_up_kopecks, b.maximum_total_deposit_per_child_kopecks, cp.id as child_profile_id
      FROM deposits d
      JOIN banks b ON d.bank_id = b.id
      JOIN child_profiles cp ON d.child_profile_id = cp.id
      WHERE d.id = ? AND d.family_id = ? AND cp.user_id = ?
    `, [depositId, req.user.familyId, req.user.id]);

    if (!deposit) {
      return res.status(404).json({ error: 'Вклад не найден.' });
    }

    if (deposit.status !== 'active') {
      return res.status(400).json({ error: 'Пополнять можно только активный вклад.' });
    }

    if (deposit.allow_top_up === 0 || deposit.allow_top_up === false) {
      return res.status(400).json({ error: 'Этот банк не разрешает пополнение вкладов.' });
    }

    const minTopUp = deposit.minimum_top_up_kopecks;
    if (minTopUp && amountKopecks < minTopUp) {
      return res.status(400).json({ error: `Минимальная сумма пополнения: ${(minTopUp / 100).toFixed(2)} ₽` });
    }

    const maxTopUp = deposit.maximum_top_up_kopecks;
    if (maxTopUp && amountKopecks > maxTopUp) {
      return res.status(400).json({ error: `Максимальная сумма пополнения: ${(maxTopUp / 100).toFixed(2)} ₽` });
    }

    // Check overall total limit
    const maxTotal = deposit.maximum_total_deposit_per_child_kopecks;
    if (maxTotal) {
      const contributions = await dbAll(`SELECT * FROM deposit_contributions WHERE deposit_id = ? AND status = 'approved'`, [depositId]);
      const state = calculateDepositState(deposit, contributions, new Date());
      const newTotal = state.currentBalanceKopecks + amountKopecks;
      if (newTotal > maxTotal) {
        return res.status(400).json({ error: `Превышен общий лимит по вкладам в этом банке. Лимит: ${(maxTotal / 100).toFixed(2)} ₽. Текущий баланс: ${(state.currentBalanceKopecks / 100).toFixed(2)} ₽.` });
      }
    }

    // Check if there's already a pending top_up for this deposit
    const existingPending = await dbGet(`
      SELECT id FROM operations
      WHERE deposit_id = ? AND type = 'top_up' AND status = 'pending'
    `, [depositId]);
    if (existingPending) {
      return res.status(400).json({ error: 'У вас уже есть ожидающая одобрения заявка на пополнение этого вклада.' });
    }

    // Create a pending operation
    const opResult = await dbRun(`
      INSERT INTO operations (
        family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status, requested_by_user_id, notes
      )
      VALUES (?, ?, ?, ?, 'top_up', ?, 'pending', ?, ?)
    `, [
      req.user.familyId, depositId, deposit.child_profile_id, deposit.bank_id,
      amountKopecks, req.user.id, `Заявка на пополнение вклада на сумму ${(amountKopecks/100).toFixed(2)} ₽`
    ]);

    const opId = opResult.lastID;

    // Create a pending contribution
    await dbRun(`
      INSERT INTO deposit_contributions (
        family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status, requested_by_user_id
      )
      VALUES (?, ?, ?, ?, 'top_up', ?, 'pending', ?)
    `, [
      req.user.familyId, depositId, deposit.child_profile_id, deposit.bank_id,
      amountKopecks, req.user.id
    ]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'request_top_up_deposit', 'deposit', ?, ?)
    `, [req.user.familyId, req.user.id, depositId, `Запрос на пополнение вклада на сумму ${(amountKopecks/100).toFixed(2)} ₽`]);

    return res.json({
      operation: {
        id: opId,
        type: 'top_up',
        status: 'pending',
        amountKopecks,
        requestedAt: new Date().toISOString()
      },
      message: 'Заявка на пополнение отправлена взрослому.'
    });

  } catch (error) {
    console.error('Top-up request error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * PUT /api/deposits/:depositId/goal - Update or create deposit goal
 */
router.put('/:depositId/goal', requireAuth, requireFamilyMembership, async (req, res) => {
  const depositId = parseInt(req.params.depositId, 10);
  const { title, targetKopecks, icon, note, dueDate } = req.body;

  if (!title || !targetKopecks || targetKopecks <= 0) {
    return res.status(400).json({ error: 'Название и положительная сумма цели обязательны.' });
  }

  try {
    const deposit = await dbGet(`
      SELECT d.*, cp.user_id as child_user_id FROM deposits d
      JOIN child_profiles cp ON d.child_profile_id = cp.id
      WHERE d.id = ? AND d.family_id = ?
    `, [depositId, req.user.familyId]);

    if (!deposit) {
      return res.status(404).json({ error: 'Вклад не найден.' });
    }

    if (req.user.familyRole === 'child' && req.user.id !== deposit.child_user_id) {
      return res.status(403).json({ error: 'Вы не можете менять цель чужого вклада.' });
    }

    if (deposit.status === 'closed' || deposit.status === 'rejected') {
      return res.status(400).json({ error: 'Нельзя редактировать цель у закрытого вклада.' });
    }

    await dbRun(`
      UPDATE deposits
      SET goal_title = ?, goal_target_kopecks = ?, goal_icon = ?, goal_note = ?, goal_due_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [title, parseInt(targetKopecks, 10), icon || '🎯', note || null, dueDate || null, depositId]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'update_deposit_goal', 'deposit', ?, ?)
    `, [req.user.familyId, req.user.id, depositId, `Изменена цель вклада: ${title} (${(targetKopecks/100).toFixed(2)} ₽)`]);

    return res.json({ success: true, message: 'Цель успешно обновлена.' });

  } catch (error) {
    console.error('Update goal error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * DELETE /api/deposits/:depositId/goal - Delete deposit goal
 */
router.delete('/:depositId/goal', requireAuth, requireFamilyMembership, async (req, res) => {
  const depositId = parseInt(req.params.depositId, 10);

  try {
    const deposit = await dbGet(`
      SELECT d.*, cp.user_id as child_user_id FROM deposits d
      JOIN child_profiles cp ON d.child_profile_id = cp.id
      WHERE d.id = ? AND d.family_id = ?
    `, [depositId, req.user.familyId]);

    if (!deposit) {
      return res.status(404).json({ error: 'Вклад не найден.' });
    }

    if (req.user.familyRole === 'child' && req.user.id !== deposit.child_user_id) {
      return res.status(403).json({ error: 'Вы не можете удалить цель чужого вклада.' });
    }

    if (deposit.status === 'closed' || deposit.status === 'rejected') {
      return res.status(400).json({ error: 'Нельзя удалять цель у закрытого вклада.' });
    }

    await dbRun(`
      UPDATE deposits
      SET goal_title = NULL, goal_target_kopecks = NULL, goal_icon = NULL, goal_note = NULL, goal_due_date = NULL, updated_at = datetime('now')
      WHERE id = ?
    `, [depositId]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'delete_deposit_goal', 'deposit', ?, 'Удалена цель вклада')
    `, [req.user.familyId, req.user.id, depositId]);

    return res.json({ success: true, message: 'Цель успешно удалена.' });

  } catch (error) {
    console.error('Delete goal error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/deposits/:id/request-close - Request closing an active deposit (called by child)
 */
router.post('/:id/request-close', requireAuth, requireFamilyMembership, async (req, res) => {
  if (req.user.familyRole !== 'child') {
    return res.status(403).json({ error: 'Только дети могут отправлять заявки на закрытие вкладов.' });
  }

  const depositId = parseInt(req.params.id, 10);

  try {
    const deposit = await dbGet(`
      SELECT d.*, b.name as bank_name
      FROM deposits d
      JOIN banks b ON d.bank_id = b.id
      WHERE d.id = ? AND d.family_id = ? AND d.child_profile_id = ?
    `, [depositId, req.user.familyId, req.user.childProfileId]);

    if (!deposit) {
      return res.status(404).json({ error: 'Вклад не найден.' });
    }

    if (deposit.status !== 'active') {
      return res.status(400).json({ error: 'Снять средства можно только с активного вклада.' });
    }

    const contributions = await dbAll(`
      SELECT * FROM deposit_contributions 
      WHERE deposit_id = ? AND status = 'approved'
    `, [depositId]);

    // Calculate dynamic state for warnings
    const state = calculateDepositState(deposit, contributions, new Date());

    // Switch deposit status to pending_close
    await dbRun(`UPDATE deposits SET status = 'pending_close', updated_at = datetime('now') WHERE id = ?`, [depositId]);

    // Create withdrawal request operation
    const opResult = await dbRun(`
      INSERT INTO operations (
        family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status, requested_by_user_id, notes
      )
      VALUES (?, ?, ?, ?, 'withdraw', ?, 'pending', ?, ?)
    `, [
      req.user.familyId, depositId, req.user.childProfileId, deposit.bank_id,
      state.currentBalanceKopecks, req.user.id, 
      state.isEarly ? `Досрочное закрытие вклада! Накопленные проценты: ${(state.earnedInterestKopecks/100).toFixed(2)} ₽. Штраф: ${(state.penaltyKopecks/100).toFixed(2)} ₽.` : `Стандартное закрытие вклада.`
    ]);

    // Audit
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'request_close_deposit', 'deposit', ?, ?)
    `, [req.user.familyId, req.user.id, depositId, `Запрос на закрытие вклада (Итоговая сумма: ${(state.currentBalanceKopecks/100).toFixed(2)} ₽)`]);

    return res.json({
      success: true,
      message: 'Заявка на снятие средств отправлена родителям на рассмотрение.',
      isEarly: state.isEarly,
      predictedInterestKopecks: state.earnedInterestKopecks,
      predictedPenaltyKopecks: state.penaltyKopecks,
      predictedPayoutKopecks: state.finalPayoutKopecks,
      operationId: opResult.lastID
    });

  } catch (error) {
    console.error('Request close deposit error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

const activeIdempotencyKeys = new Set();

/**
 * POST /api/deposits/:id/parent-rewards - Directly reward child (called by family_admin)
 */
router.post('/:id/parent-rewards', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const depositId = parseInt(req.params.id, 10);
  const { amountKopecks, notes, idempotencyKey } = req.body;

  // 1. Validate input
  if (!amountKopecks || typeof amountKopecks !== 'number' || amountKopecks <= 0) {
    return res.status(400).json({ error: 'Необходимо указать положительную сумму поощрения.' });
  }

  if (!notes || typeof notes !== 'string' || notes.trim().length < 3 || notes.trim().length > 300) {
    return res.status(400).json({ error: 'Комментарий обязателен и должен быть от 3 до 300 символов.' });
  }

  if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
    return res.status(400).json({ error: 'Необходим уникальный ключ идемпотентности.' });
  }

  const cleanIdempotencyKey = idempotencyKey.trim();

  // 2. Idempotency Lock Check (In-Progress)
  if (activeIdempotencyKeys.has(cleanIdempotencyKey)) {
    return res.status(409).json({ error: 'Операция с этим ключом уже выполняется.' });
  }

  // 3. Register key as active
  activeIdempotencyKeys.add(cleanIdempotencyKey);

  try {
    // 4. Fetch deposit and ensure family isolation and status check
    const deposit = await dbGet(`
      SELECT d.*, cp.user_id as child_user_id
      FROM deposits d
      JOIN child_profiles cp ON d.child_profile_id = cp.id
      WHERE d.id = ? AND d.family_id = ?
    `, [depositId, req.user.familyId]);

    if (!deposit) {
      return res.status(404).json({ error: 'Вклад не найден в вашей семье.' });
    }

    if (deposit.status !== 'active') {
      return res.status(400).json({ error: 'Поощрение можно зачислить только на активный вклад.' });
    }

    // 5. Idempotency Check (Successful past run)
    const allRewards = await dbAll(`
      SELECT * FROM operations 
      WHERE family_id = ? AND type = 'parent_reward'
    `, [req.user.familyId]);

    const matchedOp = allRewards.find(op => {
      try {
        const meta = JSON.parse(op.metadata_json);
        return meta && meta.idempotencyKey === cleanIdempotencyKey;
      } catch (e) {
        return false;
      }
    });

    if (matchedOp) {
      let contributionId = null;
      try {
        const meta = JSON.parse(matchedOp.metadata_json);
        contributionId = meta.contributionId;
      } catch (e) {}

      const contributions = await dbAll(`
        SELECT * FROM deposit_contributions 
        WHERE deposit_id = ? AND status = 'approved'
      `, [depositId]);
      const state = calculateDepositState(deposit, contributions, new Date());

      return res.status(200).json({
        success: true,
        operationId: matchedOp.id,
        contributionId: contributionId,
        newBalanceKopecks: state.currentBalanceKopecks,
        message: 'Дублирующий запрос обработан успешно (идемпотентность).'
      });
    }

    // 6. Atomic DB Transaction
    await dbRun('BEGIN TRANSACTION');
    try {
      // 6.1 Insert operation
      const opResult = await dbRun(`
        INSERT INTO operations (
          family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status,
          requested_by_user_id, decided_by_user_id, requested_at, decided_at, notes, metadata_json
        )
        VALUES (?, ?, ?, ?, 'parent_reward', ?, 'approved', ?, ?, datetime('now'), datetime('now'), ?, ?)
      `, [
        req.user.familyId, depositId, deposit.child_profile_id, deposit.bank_id,
        amountKopecks, req.user.id, req.user.id, notes.trim(), JSON.stringify({ idempotencyKey: cleanIdempotencyKey })
      ]);
      const opId = opResult.lastID;

      // 6.2 Insert contribution
      const contResult = await dbRun(`
        INSERT INTO deposit_contributions (
          family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status,
          requested_by_user_id, approved_by_user_id, requested_at, approved_at
        )
        VALUES (?, ?, ?, ?, 'parent_reward', ?, 'approved', ?, ?, datetime('now'), datetime('now'))
      `, [
        req.user.familyId, depositId, deposit.child_profile_id, deposit.bank_id,
        amountKopecks, req.user.id, req.user.id
      ]);
      const contId = contResult.lastID;

      // 6.3 Update operation's metadata_json with contributionId
      await dbRun(`
        UPDATE operations
        SET metadata_json = ?
        WHERE id = ?
      `, [JSON.stringify({ idempotencyKey: cleanIdempotencyKey, contributionId: contId }), opId]);

      // 6.4 Create notification for child
      const amountFormatted = (amountKopecks / 100).toFixed(2);
      const title = 'Получено поощрение от родителя';
      const message = `Родитель зачислил поощрение ${amountFormatted} ₽ на ваш вклад "${deposit.goal_title || 'Без названия'}" с комментарием: "${notes.trim()}"`;
      
      await dbRun(`
        INSERT INTO notifications (
          family_id, recipient_user_id, type, title, message, operation_id, is_read, created_at
        )
        VALUES (?, ?, 'parent_reward_received', ?, ?, ?, 0, datetime('now'))
      `, [req.user.familyId, deposit.child_user_id, title, message, opId]);

      // 6.5 Create Audit Log
      await dbRun(`
        INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason, metadata_json, created_at)
        VALUES (?, ?, 'parent_reward_created', 'deposit', ?, ?, ?, datetime('now'))
      `, [
        req.user.familyId, req.user.id, depositId,
        `Зачислено поощрение взрослого: ${amountFormatted} ₽`,
        JSON.stringify({ amountKopecks, operationId: opId, contributionId: contId })
      ]);

      await dbRun('COMMIT');

      // Calculate new state for success response
      const contributions = await dbAll(`
        SELECT * FROM deposit_contributions 
        WHERE deposit_id = ? AND status = 'approved'
      `, [depositId]);
      const state = calculateDepositState(deposit, contributions, new Date());

      return res.status(201).json({
        success: true,
        operationId: opId,
        contributionId: contId,
        newBalanceKopecks: state.currentBalanceKopecks
      });

    } catch (txError) {
      try { await dbRun('ROLLBACK'); } catch (_) {}
      throw txError;
    }

  } catch (error) {
    console.error('Create parent reward error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера при создании поощрения.' });
  } finally {
    // 7. Always release the idempotency lock key
    activeIdempotencyKeys.delete(cleanIdempotencyKey);
  }
});

module.exports = router;
