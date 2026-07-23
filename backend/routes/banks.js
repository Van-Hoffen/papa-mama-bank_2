const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireFamilyAdmin, requireFamilyMembership } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/banks - Retrieve all banks of the current user's family
 */
router.get('/', requireAuth, requireFamilyMembership, async (req, res) => {
  const includeArchived = req.query.include_archived === 'true';
  try {
    let sql = `SELECT * FROM banks WHERE family_id = ?`;
    const params = [req.user.familyId];

    if (!includeArchived) {
      sql += ` AND is_active = 1`;
    }
    
    const banks = await dbAll(sql, params);
    return res.json(banks);
  } catch (error) {
    console.error('List banks error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/banks/:id - Get details of a single bank
 */
router.get('/:id', requireAuth, requireFamilyMembership, async (req, res) => {
  const bankId = parseInt(req.params.id, 10);
  try {
    const bank = await dbGet(`SELECT * FROM banks WHERE id = ? AND family_id = ?`, [bankId, req.user.familyId]);
    if (!bank) {
      return res.status(404).json({ error: 'Банк не найден.' });
    }
    return res.json(bank);
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/banks - Create a new bank template in the family
 */
router.post('/', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const {
    name, description, color, icon, 
    interestRateBps, periodDays, minimumDepositKopecks, 
    maximumDepositPerChildKopecks, earlyWithdrawalPenaltyBps, minimumHoldingDays,
    earlyWithdrawalInterestPolicy,
    allowTopUp, minimumTopUpKopecks, maximumTopUpKopecks,
    maximumTotalDepositPerChildKopecks, interestAccrualMode
  } = req.body;

  if (!name || interestRateBps === undefined || !periodDays || minimumDepositKopecks === undefined) {
    return res.status(400).json({ error: 'Название, процентная ставка, период и минимальный депозит обязательны.' });
  }

  if (periodDays <= 0) {
    return res.status(400).json({ error: 'Период вкладов должен быть больше 0 дней.' });
  }

  const allowTopUpVal = allowTopUp !== undefined ? (allowTopUp ? 1 : 0) : 1;
  const interestAccrualModeVal = interestAccrualMode || 'whole_balance_on_schedule';
  if (allowTopUpVal === 1 && (minimumTopUpKopecks === undefined || minimumTopUpKopecks === null)) {
    return res.status(400).json({ error: 'Минимальная сумма пополнения обязательна, если пополнение включено.' });
  }

  // Create clean slug from name
  let slug = name.toLowerCase().trim().replace(/[^a-z0-9а-яё]/gi, '-').replace(/\-+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) {
    slug = 'bank-' + Date.now().toString().substring(8);
  }

  try {
    const slugExist = await dbGet(`SELECT id FROM banks WHERE family_id = ? AND slug = ?`, [req.user.familyId, slug]);
    if (slugExist) {
      slug = `${slug}-${Math.floor(Math.random() * 1000)}`;
    }

    const result = await dbRun(`
      INSERT INTO banks (
        family_id, slug, name, description, color, icon, 
        interest_rate_bps, period_days, minimum_deposit_kopecks, 
        maximum_deposit_per_child_kopecks, early_withdrawal_penalty_bps, 
        minimum_holding_days, early_withdrawal_interest_policy,
        allow_top_up, minimum_top_up_kopecks, maximum_top_up_kopecks,
        maximum_total_deposit_per_child_kopecks, interest_accrual_mode,
        is_active, created_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [
      req.user.familyId, slug, name, description || null, color || '#6366f1', icon || 'piggy-bank',
      parseInt(interestRateBps, 10), parseInt(periodDays, 10), parseInt(minimumDepositKopecks, 10),
      maximumDepositPerChildKopecks ? parseInt(maximumDepositPerChildKopecks, 10) : null,
      earlyWithdrawalPenaltyBps ? parseInt(earlyWithdrawalPenaltyBps, 10) : 0,
      minimumHoldingDays ? parseInt(minimumHoldingDays, 10) : 0,
      earlyWithdrawalInterestPolicy || 'keep_earned_interest',
      allowTopUpVal,
      minimumTopUpKopecks ? parseInt(minimumTopUpKopecks, 10) : null,
      maximumTopUpKopecks ? parseInt(maximumTopUpKopecks, 10) : null,
      maximumTotalDepositPerChildKopecks ? parseInt(maximumTotalDepositPerChildKopecks, 10) : null,
      interestAccrualModeVal,
      req.user.id
    ]);

    const newBankId = result.lastID;

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'create_bank', 'bank', ?, ?)
    `, [req.user.familyId, req.user.id, newBankId, `Создан новый банк: ${name}`]);

    return res.status(201).json({
      success: true,
      message: `Банк "${name}" успешно добавлен.`,
      bank: { id: newBankId, slug, name }
    });

  } catch (error) {
    console.error('Create bank error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * PATCH /api/banks/:id - Modify bank conditions
 * Critical: Triggers condition change proposals for all active deposits of this bank.
 */
router.patch('/:id', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const bankId = parseInt(req.params.id, 10);
  const {
    name, description, color, icon,
    interestRateBps, periodDays, minimumDepositKopecks,
    maximumDepositPerChildKopecks, earlyWithdrawalPenaltyBps, minimumHoldingDays,
    earlyWithdrawalInterestPolicy,
    allowTopUp, minimumTopUpKopecks, maximumTopUpKopecks,
    maximumTotalDepositPerChildKopecks, interestAccrualMode
  } = req.body;

  try {
    const bank = await dbGet(`SELECT * FROM banks WHERE id = ? AND family_id = ?`, [bankId, req.user.familyId]);
    if (!bank) {
      return res.status(404).json({ error: 'Банк не найден.' });
    }

    const updatedName = name !== undefined ? name : bank.name;
    const updatedDescription = description !== undefined ? description : bank.description;
    const updatedColor = color !== undefined ? color : bank.color;
    const updatedIcon = icon !== undefined ? icon : bank.icon;
    
    const updatedRate = interestRateBps !== undefined ? parseInt(interestRateBps, 10) : bank.interest_rate_bps;
    const updatedPeriod = periodDays !== undefined ? parseInt(periodDays, 10) : bank.period_days;
    const updatedMinDep = minimumDepositKopecks !== undefined ? parseInt(minimumDepositKopecks, 10) : bank.minimum_deposit_kopecks;
    const updatedMaxDep = maximumDepositPerChildKopecks !== undefined ? (maximumDepositPerChildKopecks ? parseInt(maximumDepositPerChildKopecks, 10) : null) : bank.maximum_deposit_per_child_kopecks;
    const updatedPenalty = earlyWithdrawalPenaltyBps !== undefined ? parseInt(earlyWithdrawalPenaltyBps, 10) : bank.early_withdrawal_penalty_bps;
    const updatedMinHold = minimumHoldingDays !== undefined ? parseInt(minimumHoldingDays, 10) : bank.minimum_holding_days;
    const updatedPolicy = earlyWithdrawalInterestPolicy !== undefined ? earlyWithdrawalInterestPolicy : bank.early_withdrawal_interest_policy;

    const updatedAllowTopUp = allowTopUp !== undefined ? (allowTopUp ? 1 : 0) : bank.allow_top_up;
    const updatedMinTopUp = minimumTopUpKopecks !== undefined ? (minimumTopUpKopecks ? parseInt(minimumTopUpKopecks, 10) : null) : bank.minimum_top_up_kopecks;
    const updatedMaxTopUp = maximumTopUpKopecks !== undefined ? (maximumTopUpKopecks ? parseInt(maximumTopUpKopecks, 10) : null) : bank.maximum_top_up_kopecks;
    const updatedMaxTotalDep = maximumTotalDepositPerChildKopecks !== undefined ? (maximumTotalDepositPerChildKopecks ? parseInt(maximumTotalDepositPerChildKopecks, 10) : null) : bank.maximum_total_deposit_per_child_kopecks;
    const updatedAccrualMode = interestAccrualMode !== undefined ? interestAccrualMode : bank.interest_accrual_mode;

    if (updatedAllowTopUp === 1 && (updatedMinTopUp === undefined || updatedMinTopUp === null)) {
      return res.status(400).json({ error: 'Минимальная сумма пополнения обязательна, если пополнение включено.' });
    }

    // Check if critical financial conditions changed
    const financeChanged = (
      updatedRate !== bank.interest_rate_bps ||
      updatedPeriod !== bank.period_days ||
      updatedPenalty !== bank.early_withdrawal_penalty_bps ||
      updatedMinHold !== bank.minimum_holding_days ||
      updatedPolicy !== bank.early_withdrawal_interest_policy
    );

    // Update bank template parameters
    await dbRun(`
      UPDATE banks
      SET name = ?, description = ?, color = ?, icon = ?,
          interest_rate_bps = ?, period_days = ?, minimum_deposit_kopecks = ?,
          maximum_deposit_per_child_kopecks = ?, early_withdrawal_penalty_bps = ?,
          minimum_holding_days = ?, early_withdrawal_interest_policy = ?,
          allow_top_up = ?, minimum_top_up_kopecks = ?, maximum_top_up_kopecks = ?,
          maximum_total_deposit_per_child_kopecks = ?, interest_accrual_mode = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `, [
      updatedName, updatedDescription, updatedColor, updatedIcon,
      updatedRate, updatedPeriod, updatedMinDep, updatedMaxDep, updatedPenalty, updatedMinHold,
      updatedPolicy,
      updatedAllowTopUp, updatedMinTopUp, updatedMaxTopUp, updatedMaxTotalDep, updatedAccrualMode,
      bankId
    ]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'update_bank', 'bank', ?, ?)
    `, [req.user.familyId, req.user.id, bankId, `Отредактированы условия банка: ${updatedName}`]);

    let proposalCount = 0;
    if (financeChanged) {
      // Find all active deposits connected to this bank
      const activeDeposits = await dbAll(`
        SELECT d.id, d.locked_interest_rate_bps, d.locked_period_days, d.locked_penalty_bps, d.locked_minimum_holding_days, cp.user_id as child_user_id
        FROM deposits d
        JOIN child_profiles cp ON d.child_profile_id = cp.id
        WHERE d.bank_id = ? AND d.status = 'active'
      `, [bankId]);

      for (const deposit of activeDeposits) {
        // Skip if conditions are exactly identical to what's already locked on this deposit
        if (
          deposit.locked_interest_rate_bps === updatedRate &&
          deposit.locked_period_days === updatedPeriod &&
          deposit.locked_penalty_bps === updatedPenalty &&
          deposit.locked_minimum_holding_days === updatedMinHold
        ) {
          continue;
        }

        // Check if there is already an active pending proposal for this deposit
        const existingProposal = await dbGet(`
          SELECT id FROM rate_change_proposals 
          WHERE deposit_id = ? AND status = 'pending_child_approval'
        `, [deposit.id]);

        if (existingProposal) {
          // Cancel previous proposal and set to expired
          await dbRun(`
            UPDATE rate_change_proposals 
            SET status = 'expired', responded_at = datetime('now') 
            WHERE id = ?
          `, [existingProposal.id]);
        }

        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days

        // Create new proposal
        await dbRun(`
          INSERT INTO rate_change_proposals (
            family_id, deposit_id, bank_id, 
            old_interest_rate_bps, old_period_days, old_penalty_bps,
            new_interest_rate_bps, new_period_days, new_penalty_bps,
            status, created_by_user_id, expires_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_child_approval', ?, ?)
        `, [
          req.user.familyId, deposit.id, bankId,
          deposit.locked_interest_rate_bps, deposit.locked_period_days, deposit.locked_penalty_bps,
          updatedRate, updatedPeriod, updatedPenalty,
          req.user.id, expiresAt
        ]);

        // Update rate_change_status on deposit
        await dbRun(`
          UPDATE deposits 
          SET rate_change_status = 'pending_child_approval' 
          WHERE id = ?
        `, [deposit.id]);

        // Add rate_change operation log (pending status)
        await dbRun(`
          INSERT INTO operations (family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status, requested_by_user_id, notes)
          VALUES (?, ?, (SELECT id FROM child_profiles WHERE user_id = ?), ?, 'rate_change', 0, 'pending', ?, ?)
        `, [
          req.user.familyId, deposit.id, deposit.child_user_id, bankId, 
          req.user.id, `Предложено изменение ставки: с ${deposit.locked_interest_rate_bps/100}% на ${updatedRate/100}%`
        ]);

        proposalCount++;
      }
    }

    let feedbackMessage = `Параметры банка "${updatedName}" успешно изменены.`;
    if (proposalCount > 0) {
      feedbackMessage += ` Изменения отправлены на согласование (${proposalCount}) детям по их активным вкладам.`;
    }

    return res.json({
      success: true,
      message: feedbackMessage,
      financeChanged,
      proposalCount
    });

  } catch (error) {
    console.error('Modify bank error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/banks/:id/archive - Archive a bank
 */
router.post('/:id/archive', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const bankId = parseInt(req.params.id, 10);
  try {
    const bank = await dbGet(`SELECT name FROM banks WHERE id = ? AND family_id = ?`, [bankId, req.user.familyId]);
    if (!bank) {
      return res.status(404).json({ error: 'Банк не найден.' });
    }

    await dbRun(`UPDATE banks SET is_active = 0 WHERE id = ?`, [bankId]);

    // Audit
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'archive_bank', 'bank', ?, 'Банк архивирован')
    `, [req.user.familyId, req.user.id, bankId]);

    return res.json({ success: true, message: `Банк "${bank.name}" успешно заархивирован. Взнос новых вкладов заблокирован.` });
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/banks/:id/restore - Restore an archived bank
 */
router.post('/:id/restore', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const bankId = parseInt(req.params.id, 10);
  try {
    const bank = await dbGet(`SELECT name FROM banks WHERE id = ? AND family_id = ?`, [bankId, req.user.familyId]);
    if (!bank) {
      return res.status(404).json({ error: 'Банк не найден.' });
    }

    await dbRun(`UPDATE banks SET is_active = 1 WHERE id = ?`, [bankId]);

    // Audit
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'restore_bank', 'bank', ?, 'Банк восстановлен из архива')
    `, [req.user.familyId, req.user.id, bankId]);

    return res.json({ success: true, message: `Банк "${bank.name}" успешно восстановлен и открыт для новых вкладов.` });
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

module.exports = router;
