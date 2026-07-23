const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireFamilyMembership, requireFamilyAdmin } = require('../middleware/auth');
const { calculateDepositState } = require('../utils/interestCalculator');

const router = express.Router();

// Synchronized in-memory locks for concurrent operations
const activeLocks = new Set();
const acquireLock = async (id) => {
  while (activeLocks.has(id)) {
    await new Promise((res) => setTimeout(res, 5));
  }
  activeLocks.add(id);
};
const releaseLock = (id) => {
  activeLocks.delete(id);
};

/**
 * GET /api/operations/pending - List all pending operations for family admin approval
 */
router.get('/pending', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  try {
    const ops = await dbAll(`
      SELECT o.*, b.name as bank_name, b.color as bank_color, u.display_name as child_name
      FROM operations o
      JOIN banks b ON o.bank_id = b.id
      JOIN child_profiles cp ON o.child_profile_id = cp.id
      JOIN users u ON cp.user_id = u.id
      WHERE o.family_id = ? AND o.status = 'pending'
      ORDER BY o.requested_at ASC
    `, [req.user.familyId]);

    const enrichedOps = [];
    for (const op of ops) {
      if (op.type === 'withdraw') {
        const deposit = await dbGet(`SELECT * FROM deposits WHERE id = ?`, [op.deposit_id]);
        if (deposit) {
          const contributions = await dbAll(`
            SELECT * FROM deposit_contributions 
            WHERE deposit_id = ? AND status = 'approved'
          `, [op.deposit_id]);
          const state = calculateDepositState(deposit, contributions, new Date());
          op.calculatedPayoutKopecks = state.finalPayoutKopecks;
          op.isEarlyWithdrawal = state.isEarly;
          op.penaltyKopecks = state.penaltyKopecks;
          op.earnedInterestKopecks = state.earnedInterestKopecks;
        }
      }
      enrichedOps.push(op);
    }

    return res.json(enrichedOps);
  } catch (error) {
    console.error('List pending operations error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/operations - Retrieve full operations history of the family
 */
router.get('/', requireAuth, requireFamilyMembership, async (req, res) => {
  const { child_profile_id, type } = req.query;

  try {
    let sql = `
      SELECT o.*, b.name as bank_name, b.color as bank_color, u.display_name as child_name, 
             req.display_name as requested_by_name, dec.display_name as decided_by_name
      FROM operations o
      JOIN banks b ON o.bank_id = b.id
      JOIN child_profiles cp ON o.child_profile_id = cp.id
      JOIN users u ON cp.user_id = u.id
      JOIN users req ON o.requested_by_user_id = req.id
      LEFT JOIN users dec ON o.decided_by_user_id = dec.id
      WHERE o.family_id = ?
    `;
    const params = [req.user.familyId];

    if (req.user.familyRole === 'child') {
      sql += ` AND cp.user_id = ?`;
      params.push(req.user.id);
    } else if (child_profile_id) {
      sql += ` AND o.child_profile_id = ?`;
      params.push(parseInt(child_profile_id, 10));
    }

    if (type) {
      sql += ` AND o.type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY o.requested_at DESC`;

    const ops = await dbAll(sql, params);
    return res.json(ops);

  } catch (error) {
    console.error('List operations history error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/operations/:id/approve - Approve a pending operation request (Admin only)
 */
router.post('/:id/approve', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const opId = parseInt(req.params.id, 10);

  await acquireLock(opId);
  try {
    await dbRun('BEGIN TRANSACTION');
    
    const op = await dbGet(`SELECT * FROM operations WHERE id = ? AND family_id = ?`, [opId, req.user.familyId]);
    if (!op) {
      await dbRun('ROLLBACK');
      return res.status(404).json({ error: 'Заявка не найдена.' });
    }

    if (op.status !== 'pending') {
      await dbRun('ROLLBACK');
      return res.status(400).json({ error: 'Эта заявка уже обработана.' });
    }

    const deposit = await dbGet(`SELECT * FROM deposits WHERE id = ?`, [op.deposit_id]);
    if (!deposit) {
      await dbRun('ROLLBACK');
      return res.status(404).json({ error: 'Связанный вклад не найден.' });
    }

    if (deposit.status === 'closed' || deposit.status === 'rejected') {
      await dbRun('ROLLBACK');
      return res.status(400).json({ error: 'Нельзя обрабатывать операции для закрытого или отклоненного вклада.' });
    }

    if (op.type === 'open') {
      // 1. Approve Opening: Set status to active, record approved_at time and locked parameters
      await dbRun(`
        UPDATE deposits
        SET status = 'active', approved_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `, [op.deposit_id]);

      // 2. Approve initial contribution
      const pendingContribution = await dbGet(`
        SELECT id FROM deposit_contributions
        WHERE deposit_id = ? AND type = 'initial' AND status = 'pending'
        ORDER BY created_at ASC LIMIT 1
      `, [op.deposit_id]);

      if (pendingContribution) {
        await dbRun(`
          UPDATE deposit_contributions
          SET status = 'approved', approved_at = datetime('now'), approved_by_user_id = ?
          WHERE id = ?
        `, [req.user.id, pendingContribution.id]);
      }

      // 3. Approve operation
      await dbRun(`
        UPDATE operations
        SET status = 'approved', decided_by_user_id = ?, decided_at = datetime('now')
        WHERE id = ?
      `, [req.user.id, opId]);

      // Audit Log
      await dbRun(`
        INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
        VALUES (?, ?, 'approve_open_deposit', 'deposit', ?, 'Одобрено открытие вклада родителями')
      `, [req.user.familyId, req.user.id, op.deposit_id]);

      await dbRun('COMMIT');
      return res.json({ success: true, message: 'Открытие вклада успешно одобрено!' });

    } else if (op.type === 'top_up') {
      // 1. Approve top-up contribution
      const pendingContribution = await dbGet(`
        SELECT id FROM deposit_contributions
        WHERE deposit_id = ? AND type = 'top_up' AND status = 'pending'
        ORDER BY created_at ASC LIMIT 1
      `, [op.deposit_id]);

      if (pendingContribution) {
        await dbRun(`
          UPDATE deposit_contributions
          SET status = 'approved', approved_at = datetime('now'), approved_by_user_id = ?
          WHERE id = ?
        `, [req.user.id, pendingContribution.id]);
      }

      // 2. Approve operation
      await dbRun(`
        UPDATE operations
        SET status = 'approved', decided_by_user_id = ?, decided_at = datetime('now')
        WHERE id = ?
      `, [req.user.id, opId]);

      // Audit Log
      await dbRun(`
        INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
        VALUES (?, ?, 'approve_top_up_deposit', 'deposit', ?, ?)
      `, [req.user.familyId, req.user.id, op.deposit_id, `Одобрено пополнение вклада на сумму ${(op.amount_kopecks/100).toFixed(2)} ₽`]);

      await dbRun('COMMIT');
      return res.json({ success: true, message: 'Пополнение вклада успешно одобрено!' });

    } else if (op.type === 'withdraw') {
      const contributions = await dbAll(`
        SELECT * FROM deposit_contributions 
        WHERE deposit_id = ? AND status = 'approved'
      `, [op.deposit_id]);

      const state = calculateDepositState(deposit, contributions, new Date());

      // 1. If penalty > 0, insert a system log operation for the penalty
      if (state.penaltyKopecks > 0) {
        await dbRun(`
          INSERT INTO operations (
            family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status, 
            requested_by_user_id, decided_by_user_id, requested_at, decided_at, notes
          )
          VALUES (?, ?, ?, ?, 'penalty', ?, 'system_completed', ?, ?, datetime('now'), datetime('now'), 'Штраф за досрочный вывод средств')
        `, [
          req.user.familyId, op.deposit_id, op.child_profile_id, op.bank_id,
          state.penaltyKopecks, op.requested_by_user_id, req.user.id
        ]);
      }

      // 2. Update deposit status to closed
      await dbRun(`
        UPDATE deposits
        SET status = 'closed', closed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `, [op.deposit_id]);

      // 3. Update operation to approved, setting the final payout amount
      const breakdownMetadata = JSON.stringify({
        principalKopecks: state.principalKopecks,
        currentBalanceBeforeAdjustmentKopecks: state.currentBalanceKopecks,
        earnedInterestBeforeAdjustmentKopecks: state.earnedInterestKopecks,
        interestForfeitedKopecks: state.interestForfeitedKopecks,
        penaltyKopecks: state.penaltyKopecks,
        payoutKopecks: state.finalPayoutKopecks,
        policy: deposit.locked_early_withdrawal_interest_policy || 'keep_earned_interest'
      });

      await dbRun(`
        UPDATE operations
        SET status = 'approved', amount_kopecks = ?, decided_by_user_id = ?, decided_at = datetime('now'), metadata_json = ?
        WHERE id = ?
      `, [state.finalPayoutKopecks, req.user.id, breakdownMetadata, opId]);

      // Audit Log
      await dbRun(`
        INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
        VALUES (?, ?, 'approve_withdraw_deposit', 'deposit', ?, ?)
      `, [
        req.user.familyId, req.user.id, op.deposit_id,
        `Вывод одобрен. Баланс: ${(state.currentBalanceKopecks/100).toFixed(2)} ₽, Проценты: ${(state.earnedInterestKopecks/100).toFixed(2)} ₽, Штраф: ${(state.penaltyKopecks/100).toFixed(2)} ₽, К выдаче: ${(state.finalPayoutKopecks/100).toFixed(2)} ₽`
      ]);

      await dbRun('COMMIT');
      return res.json({ 
        success: true, 
        message: 'Заявка на закрытие вклада успешно одобрена!',
        payoutKopecks: state.finalPayoutKopecks,
        interestKopecks: state.earnedInterestKopecks,
        penaltyKopecks: state.penaltyKopecks
      });
    }

    await dbRun('ROLLBACK');
    return res.status(400).json({ error: 'Неизвестный тип операции.' });

  } catch (error) {
    try {
      await dbRun('ROLLBACK');
    } catch (rollbackError) {
      // Ignore if no transaction is active
    }
    console.error('Approve operation error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  } finally {
    releaseLock(opId);
  }
});

/**
 * POST /api/operations/:id/reject - Reject a pending operation request (Admin only)
 */
router.post('/:id/reject', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const opId = parseInt(req.params.id, 10);
  const { reason } = req.body;

  await acquireLock(opId);
  try {
    await dbRun('BEGIN TRANSACTION');

    const op = await dbGet(`SELECT * FROM operations WHERE id = ? AND family_id = ?`, [opId, req.user.familyId]);
    if (!op) {
      await dbRun('ROLLBACK');
      return res.status(404).json({ error: 'Заявка не найдена.' });
    }

    if (op.status !== 'pending') {
      await dbRun('ROLLBACK');
      return res.status(400).json({ error: 'Эта заявка уже обработана.' });
    }

    const deposit = await dbGet(`SELECT * FROM deposits WHERE id = ?`, [op.deposit_id]);
    if (!deposit) {
      await dbRun('ROLLBACK');
      return res.status(404).json({ error: 'Связанный вклад не найден.' });
    }

    if (deposit.status === 'closed' || deposit.status === 'rejected') {
      await dbRun('ROLLBACK');
      return res.status(400).json({ error: 'Нельзя обрабатывать операции для закрытого или отклоненного вклада.' });
    }

    // Revert statuses
    if (op.type === 'open') {
      await dbRun(`UPDATE deposits SET status = 'rejected', updated_at = datetime('now') WHERE id = ?`, [op.deposit_id]);
      
      const pendingContribution = await dbGet(`
        SELECT id FROM deposit_contributions
        WHERE deposit_id = ? AND type = 'initial' AND status = 'pending'
        ORDER BY created_at ASC LIMIT 1
      `, [op.deposit_id]);

      if (pendingContribution) {
        await dbRun(`
          UPDATE deposit_contributions
          SET status = 'rejected', rejected_at = datetime('now'), rejection_reason = ?
          WHERE id = ?
        `, [reason || 'Отклонено родителями', pendingContribution.id]);
      }

    } else if (op.type === 'top_up') {
      const pendingContribution = await dbGet(`
        SELECT id FROM deposit_contributions
        WHERE deposit_id = ? AND type = 'top_up' AND status = 'pending'
        ORDER BY created_at ASC LIMIT 1
      `, [op.deposit_id]);

      if (pendingContribution) {
        await dbRun(`
          UPDATE deposit_contributions
          SET status = 'rejected', rejected_at = datetime('now'), rejection_reason = ?
          WHERE id = ?
        `, [reason || 'Отклонено родителями', pendingContribution.id]);
      }

    } else if (op.type === 'withdraw') {
      await dbRun(`UPDATE deposits SET status = 'active', updated_at = datetime('now') WHERE id = ?`, [op.deposit_id]);
    }

    // Update operation status
    await dbRun(`
      UPDATE operations
      SET status = 'rejected', notes = ?, decided_by_user_id = ?, decided_at = datetime('now')
      WHERE id = ?
    `, [reason || 'Отклонено родителями', req.user.id, opId]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'reject_operation', 'deposit', ?, ?)
    `, [req.user.familyId, req.user.id, op.deposit_id, `Заявка на ${op.type} отклонена. Причина: ${reason || 'не указана'}`]);

    await dbRun('COMMIT');
    return res.json({ success: true, message: 'Заявка успешно отклонена.' });

  } catch (error) {
    try {
      await dbRun('ROLLBACK');
    } catch (rollbackError) {
      // Ignore if no transaction is active
    }
    console.error('Reject operation error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  } finally {
    releaseLock(opId);
  }
});

module.exports = router;
