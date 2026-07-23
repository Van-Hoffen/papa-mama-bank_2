const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireFamilyMembership } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/rate-change-proposals - Retrieve proposals
 */
router.get('/', requireAuth, requireFamilyMembership, async (req, res) => {
  try {
    let sql = `
      SELECT rcp.*, b.name as bank_name, d.principal_kopecks, u.display_name as child_name
      FROM rate_change_proposals rcp
      JOIN banks b ON rcp.bank_id = b.id
      JOIN deposits d ON rcp.deposit_id = d.id
      JOIN child_profiles cp ON d.child_profile_id = cp.id
      JOIN users u ON cp.user_id = u.id
      WHERE rcp.family_id = ?
    `;
    const params = [req.user.familyId];

    // If logged in as child, filter only their proposals
    if (req.user.familyRole === 'child') {
      sql += ` AND cp.user_id = ? AND rcp.status = 'pending_child_approval'`;
      params.push(req.user.id);
    }

    const proposals = await dbAll(sql, params);
    return res.json(proposals);
  } catch (error) {
    console.error('List proposals error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/rate-change-proposals/:id/accept - Child accepts new deposit conditions
 */
router.post('/:id/accept', requireAuth, requireFamilyMembership, async (req, res) => {
  const proposalId = parseInt(req.params.id, 10);

  try {
    // Retrieve and verify proposal ownership
    const proposal = await dbGet(`
      SELECT rcp.*, cp.user_id as child_user_id
      FROM rate_change_proposals rcp
      JOIN deposits d ON rcp.deposit_id = d.id
      JOIN child_profiles cp ON d.child_profile_id = cp.id
      WHERE rcp.id = ? AND rcp.family_id = ?
    `, [proposalId, req.user.familyId]);

    if (!proposal) {
      return res.status(404).json({ error: 'Предложение условий не найдено.' });
    }

    // Verify it belongs to the active child
    if (req.user.familyRole === 'child' && req.user.id !== proposal.child_user_id) {
      return res.status(403).json({ error: 'Доступ запрещен. Это предложение принадлежит другому пользователю.' });
    }

    if (proposal.status !== 'pending_child_approval') {
      return res.status(400).json({ error: 'Это предложение уже обработано или срок его действия истек.' });
    }

    // Update proposal status
    await dbRun(`
      UPDATE rate_change_proposals
      SET status = 'accepted', responded_at = datetime('now')
      WHERE id = ?
    `, [proposalId]);

    // Apply new conditions to the active deposit
    await dbRun(`
      UPDATE deposits
      SET locked_interest_rate_bps = ?,
          locked_period_days = ?,
          locked_penalty_bps = ?,
          rate_change_status = 'accepted',
          updated_at = datetime('now')
      WHERE id = ?
    `, [proposal.new_interest_rate_bps, proposal.new_period_days, proposal.new_penalty_bps, proposal.deposit_id]);

    // Update any pending rate_change operation logs
    await dbRun(`
      UPDATE operations
      SET status = 'system_completed', decided_at = datetime('now'), decided_by_user_id = ?
      WHERE deposit_id = ? AND type = 'rate_change' AND status = 'pending'
    `, [req.user.id, proposal.deposit_id]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'accept_rate_proposal', 'deposit', ?, ?)
    `, [
      req.user.familyId, req.user.id, proposal.deposit_id, 
      `Ребенок согласился на новые условия (Ставка ${proposal.new_interest_rate_bps/100}%, период ${proposal.new_period_days} дней)`
    ]);

    return res.json({
      success: true,
      message: 'Вы успешно согласились с новыми условиями вклада!'
    });

  } catch (error) {
    console.error('Accept rate proposal error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/rate-change-proposals/:id/reject - Child rejects proposal
 */
router.post('/:id/reject', requireAuth, requireFamilyMembership, async (req, res) => {
  const proposalId = parseInt(req.params.id, 10);

  try {
    const proposal = await dbGet(`
      SELECT rcp.*, cp.user_id as child_user_id
      FROM rate_change_proposals rcp
      JOIN deposits d ON rcp.deposit_id = d.id
      JOIN child_profiles cp ON d.child_profile_id = cp.id
      WHERE rcp.id = ? AND rcp.family_id = ?
    `, [proposalId, req.user.familyId]);

    if (!proposal) {
      return res.status(404).json({ error: 'Предложение условий не найдено.' });
    }

    if (req.user.familyRole === 'child' && req.user.id !== proposal.child_user_id) {
      return res.status(403).json({ error: 'Доступ запрещен.' });
    }

    if (proposal.status !== 'pending_child_approval') {
      return res.status(400).json({ error: 'Это предложение уже обработано или срок его действия истек.' });
    }

    // Mark proposal as rejected
    await dbRun(`
      UPDATE rate_change_proposals
      SET status = 'rejected', responded_at = datetime('now')
      WHERE id = ?
    `, [proposalId]);

    // Revert deposit rate_change_status
    await dbRun(`
      UPDATE deposits
      SET rate_change_status = 'rejected', updated_at = datetime('now')
      WHERE id = ?
    `, [proposal.deposit_id]);

    // Reject operations
    await dbRun(`
      UPDATE operations
      SET status = 'rejected', decided_at = datetime('now'), decided_by_user_id = ?
      WHERE deposit_id = ? AND type = 'rate_change' AND status = 'pending'
    `, [req.user.id, proposal.deposit_id]);

    // Audit
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'reject_rate_proposal', 'deposit', ?, 'Ребенок отклонил изменение условий')
    `, [req.user.familyId, req.user.id, proposal.deposit_id]);

    return res.json({
      success: true,
      message: 'Вы отклонили новые условия. Вклад продолжит работать по прежним условиям.'
    });

  } catch (error) {
    console.error('Reject rate proposal error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

module.exports = router;
