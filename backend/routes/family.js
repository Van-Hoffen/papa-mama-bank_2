const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireFamilyAdmin, requireFamilyMembership } = require('../middleware/auth');
const EmailService = require('../utils/emailService');

const router = express.Router();

/**
 * GET /api/family - Retrieve details for the current user's family
 */
router.get('/', requireAuth, requireFamilyMembership, async (req, res) => {
  try {
    const family = await dbGet(`
      SELECT id, name, slug, timezone, currency_code, status, created_at, updated_at
      FROM families
      WHERE id = ?
    `, [req.user.familyId]);

    if (!family) {
      return res.status(404).json({ error: 'Семья не найдена.' });
    }

    return res.json(family);
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * PATCH /api/family - Modify details of the current user's family
 */
router.patch('/', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const { name, timezone, currencyCode } = req.body;

  try {
    const family = await dbGet(`SELECT * FROM families WHERE id = ?`, [req.user.familyId]);
    if (!family) {
      return res.status(404).json({ error: 'Семья не найдена.' });
    }

    const updatedName = name || family.name;
    const updatedTimezone = timezone || family.timezone;
    const updatedCurrency = currencyCode || family.currency_code;

    await dbRun(`
      UPDATE families
      SET name = ?, timezone = ?, currency_code = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [updatedName, updatedTimezone, updatedCurrency, req.user.familyId]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'update_family_settings', 'family', ?, 'Обновлены настройки семьи')
    `, [req.user.familyId, req.user.id, req.user.familyId]);

    return res.json({
      success: true,
      message: 'Настройки семьи успешно обновлены.',
      family: {
        id: req.user.familyId,
        name: updatedName,
        timezone: updatedTimezone,
        currencyCode: updatedCurrency
      }
    });

  } catch (error) {
    console.error('Update family error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/family/members - Retrieve member accounts of the family
 */
router.get('/members', requireAuth, requireFamilyMembership, async (req, res) => {
  try {
    const members = await dbAll(`
      SELECT u.id, u.email, u.username, u.display_name, u.platform_role, u.status, fm.role, fm.joined_at, cp.birth_date, cp.avatar_color
      FROM family_members fm
      JOIN users u ON fm.user_id = u.id
      LEFT JOIN child_profiles cp ON fm.child_profile_id = cp.id
      WHERE fm.family_id = ? AND u.status != 'deleted'
    `, [req.user.familyId]);

    return res.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/family/invitations - Retrieve invitations for the family
 */
router.get('/invitations', requireAuth, requireFamilyMembership, async (req, res) => {
  try {
    const invitations = await dbAll(`
      SELECT id, email_normalized, invitee_name, role, expires_at, accepted_at, revoked_at, created_at
      FROM invitations
      WHERE family_id = ?
      ORDER BY created_at DESC
    `, [req.user.familyId]);

    return res.json(invitations);
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/family/invitations - Invite another family administrator via email
 */
router.post('/invitations', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const { email, inviteeName } = req.body;

  if (!email || !inviteeName) {
    return res.status(400).json({ error: 'Email и Имя приглашаемого обязательны.' });
  }

  const emailNormalized = email.toLowerCase().trim();

  try {
    // Check if there is an active pending invitation for this email
    const pendingInvite = await dbGet(`
      SELECT id FROM invitations 
      WHERE family_id = ? AND email_normalized = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now')
    `, [req.user.familyId, emailNormalized]);

    if (pendingInvite) {
      return res.status(400).json({ error: 'Активное приглашение для этого адресата уже отправлено.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72 hours

    const inviteResult = await dbRun(`
      INSERT INTO invitations (family_id, email_normalized, invitee_name, token_hash, expires_at, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.familyId, emailNormalized, inviteeName, token, expiresAt, req.user.id]);

    // Send invitation email
    await EmailService.sendInvitationEmail(emailNormalized, inviteeName, req.user.displayName, req.user.familyName, token);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'create_invitation', 'invitation', ?, ?)
    `, [req.user.familyId, req.user.id, inviteResult.lastID, `Приглашен взрослый: ${emailNormalized}`]);

    return res.json({
      success: true,
      message: 'Приглашение успешно создано и отправлено на указанную почту.'
    });

  } catch (error) {
    console.error('Invite family admin error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/family/invitations/:id/resend - Resend an existing invitation
 */
router.post('/invitations/:id/resend', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const { id } = req.params;

  try {
    const invite = await dbGet(`SELECT * FROM invitations WHERE id = ? AND family_id = ?`, [id, req.user.familyId]);
    if (!invite) {
      return res.status(404).json({ error: 'Приглашение не найдено.' });
    }

    if (invite.accepted_at) {
      return res.status(400).json({ error: 'Приглашение уже принято.' });
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    await dbRun(`
      UPDATE invitations
      SET token_hash = ?, expires_at = ?, revoked_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `, [newToken, expiresAt, id]);

    await EmailService.sendInvitationEmail(invite.email_normalized, invite.invitee_name, req.user.displayName, req.user.familyName, newToken);

    // Audit
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'resend_invitation', 'invitation', ?, 'Повторная отправка приглашения')
    `, [req.user.familyId, req.user.id, id]);

    return res.json({ success: true, message: 'Приглашение отправлено повторно.' });

  } catch (error) {
    console.error('Resend invitation error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * DELETE /api/family/invitations/:id - Revoke/cancel an invitation
 */
router.delete('/invitations/:id', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const { id } = req.params;

  try {
    const invite = await dbGet(`SELECT * FROM invitations WHERE id = ? AND family_id = ?`, [id, req.user.familyId]);
    if (!invite) {
      return res.status(404).json({ error: 'Приглашение не найдено.' });
    }

    await dbRun(`UPDATE invitations SET revoked_at = datetime('now') WHERE id = ?`, [id]);

    // Audit
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'revoke_invitation', 'invitation', ?, 'Приглашение отозвано')
    `, [req.user.familyId, req.user.id, id]);

    return res.json({ success: true, message: 'Приглашение успешно отозвано.' });

  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/family/invitations/accept - Accept family invitation
 */
router.post('/invitations/accept', async (req, res) => {
  const { token, password, name } = req.body;

  if (!token || !password || !name) {
    return res.status(400).json({ error: 'Все поля обязательны: токен, пароль, имя.' });
  }

  if (password.length < 10) {
    return res.status(400).json({ error: 'Пароль должен быть минимум 10 символов.' });
  }

  try {
    const invite = await dbGet(`
      SELECT * FROM invitations 
      WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now')
    `, [token]);

    if (!invite) {
      return res.status(400).json({ error: 'Недействительное или просроченное приглашение.' });
    }

    const emailNormalized = invite.email_normalized;
    let user = await dbGet(`SELECT id FROM users WHERE email_normalized = ?`, [emailNormalized]);
    let userId;

    if (user) {
      userId = user.id;
      // User exists, but verify if they are already in this family
      const membership = await dbGet(`SELECT id FROM family_members WHERE family_id = ? AND user_id = ?`, [invite.family_id, userId]);
      if (membership) {
        return res.status(400).json({ error: 'Вы уже состоите в этой семье.' });
      }
    } else {
      // Create user
      const passwordHash = bcrypt.hashSync(password, 10);
      const userRes = await dbRun(`
        INSERT INTO users (email, email_normalized, password_hash, display_name, platform_role, email_verified_at, status)
        VALUES (?, ?, ?, ?, 'user', datetime('now'), 'active')
      `, [emailNormalized, emailNormalized, passwordHash, name]);
      userId = userRes.lastID;
    }

    // Add membership
    await dbRun(`
      INSERT INTO family_members (family_id, user_id, role)
      VALUES (?, ?, 'family_admin')
    `, [invite.family_id, userId]);

    // Mark invite as accepted
    await dbRun(`UPDATE invitations SET accepted_at = datetime('now') WHERE id = ?`, [invite.id]);

    // Audit
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'accept_invitation', 'user', ?, 'Пользователь принял приглашение')
    `, [invite.family_id, userId, userId]);

    return res.json({
      success: true,
      message: 'Вы успешно присоединились к семье в качестве Администратора! Теперь вы можете войти в систему.'
    });

  } catch (error) {
    console.error('Accept invitation error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

module.exports = router;
