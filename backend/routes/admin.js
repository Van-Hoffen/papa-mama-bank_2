const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireGlobalAdmin } = require('../middleware/auth');

const router = express.Router();

// Enforce requireAuth and requireGlobalAdmin across all routes in this file
router.use(requireAuth);
router.use(requireGlobalAdmin);

/**
 * GET /api/admin/families - Retrieve list of all registered families with stats
 */
router.get('/families', async (req, res) => {
  const { search } = req.query;

  try {
    let query = `
      SELECT f.*, 
             (SELECT COUNT(*) FROM family_members WHERE family_id = f.id) as members_count,
             (SELECT COUNT(*) FROM banks WHERE family_id = f.id) as banks_count,
             u.display_name as creator_name
      FROM families f
      LEFT JOIN users u ON f.created_by_user_id = u.id
      WHERE f.status != 'deleted'
    `;
    const params = [];

    if (search) {
      query += ` AND (f.name LIKE ? OR f.slug LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY f.created_at DESC`;

    const families = await dbAll(query, params);
    return res.json(families);

  } catch (error) {
    console.error('Admin list families error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/admin/families/:id - Read family metadata
 */
router.get('/families/:id', async (req, res) => {
  const familyId = parseInt(req.params.id, 10);

  try {
    const family = await dbGet(`
      SELECT f.*, 
             u.display_name as creator_name,
             u.email as creator_email
      FROM families f
      LEFT JOIN users u ON f.created_by_user_id = u.id
      WHERE f.id = ?
    `, [familyId]);

    if (!family) {
      return res.status(404).json({ error: 'Семья не найдена.' });
    }

    const members = await dbAll(`
      SELECT u.id, u.display_name, u.email, u.username, u.status, fm.role, fm.joined_at
      FROM family_members fm
      JOIN users u ON fm.user_id = u.id
      WHERE fm.family_id = ?
    `, [familyId]);

    const banks = await dbAll(`SELECT id, name, slug, interest_rate_bps, period_days, is_active FROM banks WHERE family_id = ?`, [familyId]);

    return res.json({
      family,
      members,
      banks
    });

  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/admin/families/:id/block - Block family space
 */
router.post('/families/:id/block', async (req, res) => {
  const familyId = parseInt(req.params.id, 10);
  const { reason } = req.body;

  try {
    const family = await dbGet(`SELECT name FROM families WHERE id = ?`, [familyId]);
    if (!family) {
      return res.status(404).json({ error: 'Семья не найдена.' });
    }

    await dbRun(`UPDATE families SET status = 'blocked', updated_at = datetime('now') WHERE id = ?`, [familyId]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'block_family', 'family', ?, ?)
    `, [familyId, req.user.id, familyId, reason || 'Заблокировано администратором платформы']);

    return res.json({ success: true, message: `Семья "${family.name}" успешно заблокирована.` });

  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/admin/families/:id/activate - Unblock/activate family space
 */
router.post('/families/:id/activate', async (req, res) => {
  const familyId = parseInt(req.params.id, 10);

  try {
    const family = await dbGet(`SELECT name FROM families WHERE id = ?`, [familyId]);
    if (!family) {
      return res.status(404).json({ error: 'Семья не найдена.' });
    }

    await dbRun(`UPDATE families SET status = 'active', updated_at = datetime('now') WHERE id = ?`, [familyId]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'activate_family', 'family', ?, 'Семья активирована обратно')
    `, [familyId, req.user.id, familyId]);

    return res.json({ success: true, message: `Семья "${family.name}" успешно активирована.` });

  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * DELETE /api/admin/families/:id - Soft-delete family space
 */
router.delete('/families/:id', async (req, res) => {
  const familyId = parseInt(req.params.id, 10);

  try {
    const family = await dbGet(`SELECT name FROM families WHERE id = ?`, [familyId]);
    if (!family) {
      return res.status(404).json({ error: 'Семья не найдена.' });
    }

    await dbRun(`UPDATE families SET status = 'deleted', deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [familyId]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'soft_delete_family', 'family', ?, 'Семья удалена soft-delete')
    `, [familyId, req.user.id, familyId]);

    return res.json({ success: true, message: `Семья "${family.name}" успешно удалена (soft-delete).` });

  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/admin/families/:id/support-access - Access detail info of a family for support reasons
 */
router.post('/families/:id/support-access', async (req, res) => {
  const familyId = parseInt(req.params.id, 10);
  const { reason } = req.body;

  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ error: 'Вы должны указать подробную причину запроса доступа (минимум 5 символов).' });
  }

  try {
    const family = await dbGet(`SELECT name FROM families WHERE id = ?`, [familyId]);
    if (!family) {
      return res.status(404).json({ error: 'Семья не найдена.' });
    }

    // Register active audit warning for family space
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'support_access_activated', 'family', ?, ?)
    `, [familyId, req.user.id, familyId, reason]);

    return res.json({
      success: true,
      message: `Доступ в режиме поддержки к семье "${family.name}" успешно предоставлен и залогирован.`,
      familyId,
      reason
    });

  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/admin/audit-logs - Query all system audit logs
 */
router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await dbAll(`
      SELECT al.*, u.display_name as actor_name, f.name as family_name
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      LEFT JOIN families f ON al.family_id = f.id
      ORDER BY al.created_at DESC
      LIMIT 100
    `);

    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

module.exports = router;
