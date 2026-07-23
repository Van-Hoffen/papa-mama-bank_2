const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireFamilyMembership } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/notifications - List notifications for the authenticated user
 */
router.get('/', requireAuth, requireFamilyMembership, async (req, res) => {
  try {
    const notifications = await dbAll(`
      SELECT n.*, o.deposit_id 
      FROM notifications n
      LEFT JOIN operations o ON n.operation_id = o.id
      WHERE n.recipient_user_id = ? AND n.family_id = ?
      ORDER BY n.created_at DESC
    `, [req.user.id, req.user.familyId]);

    return res.json(notifications);
  } catch (error) {
    console.error('List notifications error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/notifications/:id/read - Mark a notification as read
 */
router.post('/:id/read', requireAuth, requireFamilyMembership, async (req, res) => {
  const notifId = parseInt(req.params.id, 10);

  try {
    const notif = await dbGet(`
      SELECT * FROM notifications
      WHERE id = ? AND recipient_user_id = ? AND family_id = ?
    `, [notifId, req.user.id, req.user.familyId]);

    if (!notif) {
      return res.status(404).json({ error: 'Уведомление не найдено.' });
    }

    await dbRun(`
      UPDATE notifications
      SET is_read = 1, read_at = datetime('now')
      WHERE id = ?
    `, [notifId]);

    return res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

module.exports = router;
