const express = require('express');
const { dbGet, dbRun } = require('../models/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/profile
 * Returns profile information for the authenticated user.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await dbGet(`
      SELECT id, email, username, display_name, platform_role, preferred_locale, created_at
      FROM users
      WHERE id = ?
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден.' });
    }

    return res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      platformRole: user.platform_role,
      preferredLocale: user.preferred_locale || 'ru',
      familyId: req.user.familyId,
      familyRole: req.user.familyRole,
      childProfileId: req.user.childProfileId,
      familyName: req.user.familyName,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * PATCH /api/profile/preferences
 * Updates user preferences such as preferredLocale.
 */
router.patch('/preferences', requireAuth, async (req, res) => {
  const { preferredLocale } = req.body;

  const ALLOWED_LOCALES = ['ru', 'en'];

  if (!preferredLocale || !ALLOWED_LOCALES.includes(preferredLocale)) {
    return res.status(400).json({
      error: 'Недопустимый язык локализации. Разрешенные значения: ru, en.'
    });
  }

  try {
    await dbRun(`
      UPDATE users
      SET preferred_locale = ?
      WHERE id = ?
    `, [preferredLocale, req.user.id]);

    return res.json({
      success: true,
      preferredLocale
    });
  } catch (error) {
    console.error('Error updating profile preferences:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера при обновлении настроек.' });
  }
});

module.exports = router;
