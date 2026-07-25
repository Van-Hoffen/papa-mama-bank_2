const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireFamilyOwner, requireFamilyAdult, requireFamilyMembership } = require('../middleware/auth');
const EmailService = require('../utils/emailService');
const { recordAuditEvent } = require('../utils/auditLogger');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/family - Retrieve details for the current user's family
 */
router.get('/', requireAuth, requireFamilyMembership, async (req, res) => {
  try {
    const family = await dbGet(`
      SELECT id, name, slug, timezone, currency_code, status, owner_user_id, created_at, updated_at
      FROM families
      WHERE id = ?
    `, [req.user.familyId]);

    if (!family) {
      return res.status(404).json({ error: 'Семья не найдена.' });
    }

    return res.json(family);
  } catch (error) {
    logger.error('Get family error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * PATCH /api/family - Modify details of the current user's family
 */
router.patch('/', requireAuth, requireFamilyOwner, requireFamilyMembership, async (req, res) => {
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

    await recordAuditEvent({
      req,
      familyId: req.user.familyId,
      eventType: 'family_settings_updated',
      targetType: 'family',
      targetId: req.user.familyId,
      metadata: { name: updatedName, timezone: updatedTimezone, currencyCode: updatedCurrency }
    });

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
    logger.error('Update family error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/family/members - Retrieve all member accounts of the family
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
    logger.error('Get members error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/family/adults - Retrieve adult accounts in the family
 */
router.get('/adults', requireAuth, requireFamilyAdult, requireFamilyMembership, async (req, res) => {
  try {
    const family = await dbGet(`SELECT owner_user_id FROM families WHERE id = ?`, [req.user.familyId]);
    const ownerUserId = family ? family.owner_user_id : null;

    const adults = await dbAll(`
      SELECT 
        u.id, u.email, u.display_name, u.status, fm.role, fm.joined_at,
        (SELECT COUNT(*) FROM banks b WHERE b.family_id = fm.family_id AND b.created_by_user_id = u.id) AS banks_created_count
      FROM family_members fm
      JOIN users u ON fm.user_id = u.id
      WHERE fm.family_id = ? AND fm.role IN ('family_owner', 'family_adult', 'family_admin') AND u.status != 'deleted'
      ORDER BY fm.joined_at ASC
    `, [req.user.familyId]);

    const formatted = adults.map(a => {
      const isOwner = (a.id === ownerUserId) || (a.role === 'family_owner');
      return {
        id: a.id,
        email: a.email,
        displayName: a.display_name,
        status: a.status,
        role: isOwner ? 'family_owner' : 'family_adult',
        isOwner,
        joinedAt: a.joined_at,
        banksCreatedCount: a.banks_created_count || 0
      };
    });

    return res.json(formatted);
  } catch (error) {
    logger.error('Get adults error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/family/adults/invitations (and GET /api/family/invitations)
 */
const getInvitationsHandler = async (req, res) => {
  try {
    const invitations = await dbAll(`
      SELECT id, email_normalized, invitee_name, role, expires_at, accepted_at, revoked_at, created_at
      FROM invitations
      WHERE family_id = ?
      ORDER BY created_at DESC
    `, [req.user.familyId]);

    return res.json(invitations);
  } catch (error) {
    logger.error('Get invitations error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
};

router.get('/adults/invitations', requireAuth, requireFamilyAdult, requireFamilyMembership, getInvitationsHandler);
router.get('/invitations', requireAuth, requireFamilyAdult, requireFamilyMembership, getInvitationsHandler);

/**
 * POST /api/family/adults/invitations - Invite an adult to the family
 */
const createInvitationHandler = async (req, res) => {
  const { email, inviteeName, message } = req.body;

  if (!email || !inviteeName) {
    return res.status(400).json({ error: 'Email и Имя приглашаемого обязательны.' });
  }

  const emailNormalized = email.toLowerCase().trim();

  try {
    // Check if target is already an active member of the family
    const existingMember = await dbGet(`
      SELECT fm.id, fm.role FROM family_members fm
      JOIN users u ON fm.user_id = u.id
      WHERE fm.family_id = ? AND u.email_normalized = ? AND u.status != 'deleted'
    `, [req.user.familyId, emailNormalized]);

    if (existingMember) {
      return res.status(400).json({ error: 'Этот пользователь уже состоит в вашей семье.' });
    }

    // Check if there is an active pending invitation
    const pendingInvite = await dbGet(`
      SELECT id FROM invitations 
      WHERE family_id = ? AND email_normalized = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now')
    `, [req.user.familyId, emailNormalized]);

    if (pendingInvite) {
      return res.status(400).json({ error: 'Активное приглашение для этого адресата уже отправлено.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72 hours

    const inviteResult = await dbRun(`
      INSERT INTO invitations (family_id, email_normalized, invitee_name, role, token_hash, expires_at, created_by_user_id)
      VALUES (?, ?, ?, 'family_adult', ?, ?, ?)
    `, [req.user.familyId, emailNormalized, inviteeName, tokenHash, expiresAt, req.user.id]);

    // Send invitation email
    await EmailService.sendInvitationEmail(emailNormalized, inviteeName, req.user.displayName, req.user.familyName, token);

    await recordAuditEvent({
      req,
      familyId: req.user.familyId,
      eventType: 'adult_invitation_created',
      targetType: 'invitation',
      targetId: inviteResult.lastID,
      metadata: { inviteeName, inviteeEmail: emailNormalized, role: 'family_adult', noteMessage: message || '' }
    });

    return res.json({
      success: true,
      message: 'Приглашение успешно создано и отправлено на указанную почту.'
    });

  } catch (error) {
    logger.error('Invite adult error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
};

router.post('/adults/invitations', requireAuth, requireFamilyOwner, requireFamilyMembership, createInvitationHandler);
router.post('/invitations', requireAuth, requireFamilyOwner, requireFamilyMembership, createInvitationHandler);

/**
 * POST /api/family/adults/invitations/:id/resend - Resend an existing invitation
 */
const resendInvitationHandler = async (req, res) => {
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
    const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    await dbRun(`
      UPDATE invitations
      SET token_hash = ?, expires_at = ?, revoked_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `, [newTokenHash, expiresAt, id]);

    await EmailService.sendInvitationEmail(invite.email_normalized, invite.invitee_name, req.user.displayName, req.user.familyName, newToken);

    await recordAuditEvent({
      req,
      familyId: req.user.familyId,
      eventType: 'adult_invitation_resent',
      targetType: 'invitation',
      targetId: id,
      metadata: { inviteeName: invite.invitee_name, inviteeEmail: invite.email_normalized }
    });

    return res.json({ success: true, message: 'Приглашение отправлено повторно.' });

  } catch (error) {
    logger.error('Resend invitation error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
};

router.post('/adults/invitations/:id/resend', requireAuth, requireFamilyOwner, requireFamilyMembership, resendInvitationHandler);
router.post('/invitations/:id/resend', requireAuth, requireFamilyOwner, requireFamilyMembership, resendInvitationHandler);

/**
 * DELETE /api/family/adults/invitations/:id - Revoke/cancel an invitation
 */
const revokeInvitationHandler = async (req, res) => {
  const { id } = req.params;

  try {
    const invite = await dbGet(`SELECT * FROM invitations WHERE id = ? AND family_id = ?`, [id, req.user.familyId]);
    if (!invite) {
      return res.status(404).json({ error: 'Приглашение не найдено.' });
    }

    await dbRun(`UPDATE invitations SET revoked_at = datetime('now') WHERE id = ?`, [id]);

    await recordAuditEvent({
      req,
      familyId: req.user.familyId,
      eventType: 'adult_invitation_revoked',
      targetType: 'invitation',
      targetId: id,
      metadata: { inviteeName: invite.invitee_name, inviteeEmail: invite.email_normalized }
    });

    return res.json({ success: true, message: 'Приглашение успешно отозвано.' });

  } catch (error) {
    logger.error('Revoke invitation error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
};

router.delete('/adults/invitations/:id', requireAuth, requireFamilyOwner, requireFamilyMembership, revokeInvitationHandler);
router.delete('/invitations/:id', requireAuth, requireFamilyOwner, requireFamilyMembership, revokeInvitationHandler);

/**
 * POST /api/family/invitations/accept - Accept family invitation
 */
router.post('/invitations/accept', async (req, res) => {
  const { token, password, name } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Токен приглашения обязателен.' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    let invite = await dbGet(`
      SELECT * FROM invitations 
      WHERE (token_hash = ? OR token_hash = ?) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now')
    `, [tokenHash, token]);

    if (!invite) {
      return res.status(400).json({ error: 'Недействительное, отозванное или просроченное приглашение.' });
    }

    const emailNormalized = invite.email_normalized;
    let user = await dbGet(`SELECT id, display_name FROM users WHERE email_normalized = ?`, [emailNormalized]);
    let userId;

    if (user) {
      userId = user.id;
      const membership = await dbGet(`SELECT id FROM family_members WHERE family_id = ? AND user_id = ?`, [invite.family_id, userId]);
      if (membership) {
        return res.status(400).json({ error: 'Вы уже состоите в этой семье.' });
      }
    } else {
      if (!password || !name) {
        return res.status(400).json({ error: 'Для регистрации нового пользователя укажите имя и пароль.' });
      }
      if (password.length < 10) {
        return res.status(400).json({ error: 'Пароль должен содержать минимум 10 символов.' });
      }
      const passwordHash = bcrypt.hashSync(password, 10);
      const userRes = await dbRun(`
        INSERT INTO users (email, email_normalized, password_hash, display_name, platform_role, email_verified_at, status)
        VALUES (?, ?, ?, ?, 'user', datetime('now'), 'active')
      `, [emailNormalized, emailNormalized, passwordHash, name]);
      userId = userRes.lastID;
    }

    // Add membership as family_adult
    await dbRun(`
      INSERT INTO family_members (family_id, user_id, role)
      VALUES (?, ?, 'family_adult')
    `, [invite.family_id, userId]);

    // Mark invite as accepted
    await dbRun(`UPDATE invitations SET accepted_at = datetime('now') WHERE id = ?`, [invite.id]);

    await recordAuditEvent({
      familyId: invite.family_id,
      actorUserId: userId,
      actorRole: 'family_adult',
      eventType: 'adult_invitation_accepted',
      targetType: 'user',
      targetId: userId,
      metadata: { inviteId: invite.id, email: emailNormalized }
    });

    return res.json({
      success: true,
      message: 'Вы успешно присоединились к семье в качестве приглашённого взрослого! Теперь вы можете войти в систему.'
    });

  } catch (error) {
    logger.error('Accept invitation error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * DELETE /api/family/adults/:userId - Remove an adult from the family
 */
router.delete('/adults/:userId', requireAuth, requireFamilyOwner, requireFamilyMembership, async (req, res) => {
  const targetUserId = parseInt(req.params.userId, 10);

  if (!targetUserId) {
    return res.status(400).json({ error: 'Не указан идентификатор пользователя.' });
  }

  try {
    const family = await dbGet(`SELECT owner_user_id FROM families WHERE id = ?`, [req.user.familyId]);
    if (family && family.owner_user_id === targetUserId) {
      return res.status(400).json({ error: 'Нельзя удалить текущего владельца семьи.' });
    }

    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя из семьи, пока вы являетесь владельцем.' });
    }

    const member = await dbGet(`
      SELECT fm.id, u.display_name, u.email_normalized 
      FROM family_members fm
      JOIN users u ON fm.user_id = u.id
      WHERE fm.family_id = ? AND fm.user_id = ? AND fm.role IN ('family_adult', 'family_admin')
    `, [req.user.familyId, targetUserId]);

    if (!member) {
      return res.status(404).json({ error: 'Участник семьи не найден или является ребёнком.' });
    }

    await dbRun(`DELETE FROM family_members WHERE family_id = ? AND user_id = ?`, [req.user.familyId, targetUserId]);

    await recordAuditEvent({
      req,
      familyId: req.user.familyId,
      eventType: 'adult_removed_from_family',
      targetType: 'user',
      targetId: targetUserId,
      metadata: { removedUserName: member.display_name, removedUserEmail: member.email_normalized }
    });

    return res.json({
      success: true,
      message: `Взрослый ${member.display_name} успешно удалён из семьи.`
    });

  } catch (error) {
    logger.error('Remove adult error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/family/ownership-transfers - Request family ownership transfer
 */
router.post('/ownership-transfers', requireAuth, requireFamilyOwner, requireFamilyMembership, async (req, res) => {
  const { toUserId } = req.body;
  const recipientId = parseInt(toUserId, 10);

  if (!recipientId) {
    return res.status(400).json({ error: 'Укажите получателя прав управления.' });
  }

  if (recipientId === req.user.id) {
    return res.status(400).json({ error: 'Нельзя передать управление самому себе.' });
  }

  try {
    const recipient = await dbGet(`
      SELECT fm.id, u.display_name, u.email_normalized, u.status
      FROM family_members fm
      JOIN users u ON fm.user_id = u.id
      WHERE fm.family_id = ? AND fm.user_id = ? AND fm.role IN ('family_adult', 'family_admin')
    `, [req.user.familyId, recipientId]);

    if (!recipient) {
      return res.status(400).json({ error: 'Получатель должен быть активным взрослым участником этой же семьи.' });
    }

    if (recipient.status === 'blocked' || recipient.status === 'deleted') {
      return res.status(400).json({ error: 'Указанный пользователь неактивен или заблокирован.' });
    }

    // Cancel any previous pending transfer for this family
    await dbRun(`
      UPDATE ownership_transfers
      SET status = 'cancelled', responded_at = datetime('now')
      WHERE family_id = ? AND status = 'pending'
    `, [req.user.familyId]);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    const transferRes = await dbRun(`
      INSERT INTO ownership_transfers (family_id, from_user_id, to_user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `, [req.user.familyId, req.user.id, recipientId, tokenHash, expiresAt]);

    await recordAuditEvent({
      req,
      familyId: req.user.familyId,
      eventType: 'ownership_transfer_requested',
      targetType: 'user',
      targetId: recipientId,
      metadata: { recipientName: recipient.display_name, recipientEmail: recipient.email_normalized, expiresAt }
    });

    return res.json({
      success: true,
      message: `Запрос на передачу управления успешно отправлен пользователю ${recipient.display_name}.`,
      transferId: transferRes.lastID
    });

  } catch (error) {
    logger.error('Request ownership transfer error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/family/ownership-transfers/pending - Retrieve pending transfer for current user or family
 */
router.get('/ownership-transfers/pending', requireAuth, requireFamilyAdult, requireFamilyMembership, async (req, res) => {
  try {
    const transfer = await dbGet(`
      SELECT 
        ot.id, ot.family_id, ot.from_user_id, ot.to_user_id, ot.expires_at, ot.created_at,
        u_from.display_name AS from_name, u_to.display_name AS to_name
      FROM ownership_transfers ot
      JOIN users u_from ON ot.from_user_id = u_from.id
      JOIN users u_to ON ot.to_user_id = u_to.id
      WHERE ot.family_id = ? AND ot.status = 'pending' AND ot.expires_at > datetime('now')
      ORDER BY ot.created_at DESC LIMIT 1
    `, [req.user.familyId]);

    if (!transfer) {
      return res.json({ pendingTransfer: null });
    }

    return res.json({
      pendingTransfer: {
        id: transfer.id,
        familyId: transfer.family_id,
        fromUserId: transfer.from_user_id,
        fromName: transfer.from_name,
        toUserId: transfer.to_user_id,
        toName: transfer.to_name,
        expiresAt: transfer.expires_at,
        createdAt: transfer.created_at,
        isForMe: transfer.to_user_id === req.user.id,
        isInitiatedByMe: transfer.from_user_id === req.user.id
      }
    });

  } catch (error) {
    logger.error('Get pending ownership transfer error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/family/ownership-transfers/:id/accept - Accept ownership transfer
 */
router.post('/ownership-transfers/:id/accept', requireAuth, requireFamilyAdult, requireFamilyMembership, async (req, res) => {
  const transferId = parseInt(req.params.id, 10);

  try {
    const transfer = await dbGet(`
      SELECT * FROM ownership_transfers 
      WHERE id = ? AND family_id = ? AND status = 'pending' AND expires_at > datetime('now')
    `, [transferId, req.user.familyId]);

    if (!transfer) {
      return res.status(404).json({ error: 'Активный запрос на передачу управления не найден или истек.' });
    }

    if (transfer.to_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Только получатель прав может принять передачу управления.' });
    }

    await dbRun('BEGIN TRANSACTION');

    // Previous owner becomes family_adult
    await dbRun(`
      UPDATE family_members
      SET role = 'family_adult'
      WHERE family_id = ? AND user_id = ?
    `, [req.user.familyId, transfer.from_user_id]);

    // Recipient becomes family_owner
    await dbRun(`
      UPDATE family_members
      SET role = 'family_owner'
      WHERE family_id = ? AND user_id = ?
    `, [req.user.familyId, req.user.id]);

    // Update family owner_user_id
    await dbRun(`
      UPDATE families
      SET owner_user_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [req.user.id, req.user.familyId]);

    // Mark transfer accepted
    await dbRun(`
      UPDATE ownership_transfers
      SET status = 'accepted', responded_at = datetime('now')
      WHERE id = ?
    `, [transferId]);

    await dbRun('COMMIT');

    await recordAuditEvent({
      req,
      familyId: req.user.familyId,
      eventType: 'ownership_transfer_accepted',
      targetType: 'user',
      targetId: req.user.id,
      metadata: { previousOwnerId: transfer.from_user_id, newOwnerId: req.user.id }
    });

    return res.json({
      success: true,
      message: 'Вы успешно приняли управление семьёй! Теперь вы являетесь владельцем семьи.'
    });

  } catch (error) {
    try { await dbRun('ROLLBACK'); } catch (_) {}
    logger.error('Accept ownership transfer error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/family/ownership-transfers/:id/reject - Reject ownership transfer
 */
router.post('/ownership-transfers/:id/reject', requireAuth, requireFamilyAdult, requireFamilyMembership, async (req, res) => {
  const transferId = parseInt(req.params.id, 10);

  try {
    const transfer = await dbGet(`
      SELECT * FROM ownership_transfers 
      WHERE id = ? AND family_id = ? AND status = 'pending'
    `, [transferId, req.user.familyId]);

    if (!transfer) {
      return res.status(404).json({ error: 'Запрос на передачу управления не найден.' });
    }

    if (transfer.to_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Только получатель прав может отклонить передачу.' });
    }

    await dbRun(`
      UPDATE ownership_transfers
      SET status = 'rejected', responded_at = datetime('now')
      WHERE id = ?
    `, [transferId]);

    await recordAuditEvent({
      req,
      familyId: req.user.familyId,
      eventType: 'ownership_transfer_rejected',
      targetType: 'user',
      targetId: transfer.from_user_id,
      metadata: { transferId }
    });

    return res.json({ success: true, message: 'Предложение передачи управления отклонено.' });

  } catch (error) {
    logger.error('Reject ownership transfer error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/family/ownership-transfers/:id/cancel - Cancel ownership transfer
 */
router.post('/ownership-transfers/:id/cancel', requireAuth, requireFamilyOwner, requireFamilyMembership, async (req, res) => {
  const transferId = parseInt(req.params.id, 10);

  try {
    const transfer = await dbGet(`
      SELECT * FROM ownership_transfers 
      WHERE id = ? AND family_id = ? AND status = 'pending'
    `, [transferId, req.user.familyId]);

    if (!transfer) {
      return res.status(404).json({ error: 'Запрос на передачу управления не найден.' });
    }

    await dbRun(`
      UPDATE ownership_transfers
      SET status = 'cancelled', responded_at = datetime('now')
      WHERE id = ?
    `, [transferId]);

    await recordAuditEvent({
      req,
      familyId: req.user.familyId,
      eventType: 'ownership_transfer_cancelled',
      targetType: 'user',
      targetId: transfer.to_user_id,
      metadata: { transferId }
    });

    return res.json({ success: true, message: 'Запрос на передачу управления отменён.' });

  } catch (error) {
    logger.error('Cancel ownership transfer error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/family/audit-logs - Family Action Log view
 */
router.get('/audit-logs', requireAuth, requireFamilyAdult, requireFamilyMembership, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  const { from, to, eventType, actorUserId, childId, bankId, search } = req.query;

  try {
    const isOwner = req.user.familyRole === 'family_owner' || req.user.familyRole === 'family_admin';

    let conditions = ['al.family_id = ?'];
    let params = [req.user.familyId];

    if (from) {
      conditions.push('al.created_at >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('al.created_at <= ?');
      params.push(to);
    }
    if (eventType) {
      conditions.push('al.event_type = ?');
      params.push(eventType);
    }
    if (actorUserId) {
      conditions.push('al.actor_user_id = ?');
      params.push(actorUserId);
    }
    if (childId) {
      conditions.push(`json_extract(al.metadata_json, '$.childUserId') = ?`);
      params.push(parseInt(childId, 10));
    }
    if (bankId) {
      conditions.push(`json_extract(al.metadata_json, '$.bankId') = ?`);
      params.push(parseInt(bankId, 10));
    }
    if (search) {
      conditions.push(`(u.display_name LIKE ? OR al.event_type LIKE ? OR al.metadata_json LIKE ?)`);
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await dbGet(`
      SELECT COUNT(*) as total 
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      WHERE ${whereClause}
    `, params);

    const total = countRow ? countRow.total : 0;

    const rows = await dbAll(`
      SELECT 
        al.id, al.created_at, al.family_id, al.actor_user_id, al.actor_role,
        al.event_type, al.target_type, al.target_id, al.request_id,
        al.ip_address, al.user_agent, al.metadata_json,
        u.display_name AS actor_name, u.email AS actor_email
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      WHERE ${whereClause}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);

    const logs = rows.map(r => {
      let parsedMeta = {};
      try {
        parsedMeta = JSON.parse(r.metadata_json || '{}');
      } catch (_) {}

      return {
        id: r.id,
        createdAt: r.created_at,
        familyId: r.family_id,
        actorUserId: r.actor_user_id,
        actorName: r.actor_name || 'Система',
        actorRole: r.actor_role,
        eventType: r.event_type,
        targetType: r.target_type,
        targetId: r.target_id,
        requestId: r.request_id,
        ipAddress: isOwner ? r.ip_address : null, // sanitize for non-owner adult
        userAgent: isOwner ? r.user_agent : null, // sanitize for non-owner adult
        metadata: parsedMeta
      };
    });

    return res.json({
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });

  } catch (error) {
    logger.error('Get family audit logs error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

module.exports = router;
