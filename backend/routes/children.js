const express = require('express');
const bcrypt = require('bcryptjs');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireFamilyAdmin, requireFamilyMembership } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/children - List all children in the user's family
 */
router.get('/', requireAuth, requireFamilyMembership, async (req, res) => {
  try {
    const children = await dbAll(`
      SELECT u.id, u.username, u.display_name, u.status, u.must_change_password, cp.id as child_profile_id, cp.birth_date, cp.avatar_color
      FROM family_members fm
      JOIN users u ON fm.user_id = u.id
      JOIN child_profiles cp ON fm.child_profile_id = cp.id
      WHERE fm.family_id = ? AND fm.role = 'child' AND u.status != 'deleted'
    `, [req.user.familyId]);

    // Format output to remove combined prefix from username if needed, but it's cleaner to return full username or simple child-friendly username
    const formattedChildren = children.map(c => {
      // e.g. "ivanov_masha" -> "masha"
      const prefix = `${req.user.id}_`;
      let shortUsername = c.username;
      if (c.username && c.username.includes('_')) {
        shortUsername = c.username.substring(c.username.indexOf('_') + 1);
      }
      return {
        ...c,
        username: shortUsername,
        fullUsername: c.username
      };
    });

    return res.json(formattedChildren);
  } catch (error) {
    console.error('List children error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/children - Create a new child profile associated with the family
 */
router.post('/', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const { username, displayName, temporaryPassword, birthDate, avatarColor } = req.body;

  if (!username || !displayName || !temporaryPassword) {
    return res.status(400).json({ error: 'Имя, логин и временный пароль обязательны.' });
  }

  if (temporaryPassword.length < 6) {
    return res.status(400).json({ error: 'Временный пароль должен быть не менее 6 символов.' });
  }

  const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (!cleanUsername) {
    return res.status(400).json({ error: 'Логин должен состоять только из латинских букв и цифр.' });
  }

  try {
    // Get family details to construct combined username
    const family = await dbGet(`SELECT slug FROM families WHERE id = ?`, [req.user.familyId]);
    if (!family) {
      return res.status(404).json({ error: 'Семья не найдена.' });
    }

    const combinedUsername = `${family.slug}_${cleanUsername}`;

    // Check uniqueness of combined username
    const existingUser = await dbGet(`SELECT id FROM users WHERE username = ?`, [combinedUsername]);
    if (existingUser) {
      return res.status(400).json({ error: 'Такой логин ребенка уже занят в вашей семье или на платформе.' });
    }

    const passwordHash = bcrypt.hashSync(temporaryPassword, 10);

    // Create child user
    const userResult = await dbRun(`
      INSERT INTO users (username, password_hash, display_name, platform_role, status, must_change_password)
      VALUES (?, ?, ?, 'user', 'active', 1)
    `, [combinedUsername, passwordHash, displayName]);

    const childUserId = userResult.lastID;

    // Create child profile
    const profileResult = await dbRun(`
      INSERT INTO child_profiles (family_id, user_id, birth_date, avatar_color, created_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `, [req.user.familyId, childUserId, birthDate || null, avatarColor || '#6366f1', req.user.id]);

    const childProfileId = profileResult.lastID;

    // Create family membership
    await dbRun(`
      INSERT INTO family_members (family_id, user_id, role, child_profile_id)
      VALUES (?, ?, 'child', ?)
    `, [req.user.familyId, childUserId, childProfileId]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'create_child', 'child', ?, ?)
    `, [req.user.familyId, req.user.id, childProfileId, `Создан профиль ребенка: ${displayName} (${combinedUsername})`]);

    return res.status(201).json({
      success: true,
      message: 'Профиль ребенка успешно создан. Ребенок может войти, используя этот пароль.',
      child: {
        id: childUserId,
        username: cleanUsername,
        fullUsername: combinedUsername,
        displayName,
        avatarColor,
        mustChangePassword: true
      }
    });

  } catch (error) {
    console.error('Create child error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/children/:id - Retrieve child profile details (enforces same family)
 */
router.get('/:id', requireAuth, requireFamilyMembership, async (req, res) => {
  const childId = parseInt(req.params.id, 10);

  try {
    // Verify membership in the same family
    const targetMember = await dbGet(`
      SELECT fm.family_id, u.id, u.username, u.display_name, cp.birth_date, cp.avatar_color
      FROM family_members fm
      JOIN users u ON fm.user_id = u.id
      JOIN child_profiles cp ON fm.child_profile_id = cp.id
      WHERE u.id = ? AND fm.role = 'child'
    `, [childId]);

    if (!targetMember || targetMember.family_id !== req.user.familyId) {
      return res.status(404).json({ error: 'Профиль ребенка не найден или принадлежит другой семье.' });
    }

    return res.json(targetMember);
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * PATCH /api/children/:id - Modify child details (enforces same family)
 */
router.patch('/:id', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const childId = parseInt(req.params.id, 10);
  const { displayName, birthDate, avatarColor, password } = req.body;

  try {
    const member = await dbGet(`
      SELECT fm.family_id, fm.child_profile_id, u.display_name
      FROM family_members fm
      JOIN users u ON fm.user_id = u.id
      WHERE u.id = ? AND fm.role = 'child'
    `, [childId]);

    if (!member || member.family_id !== req.user.familyId) {
      return res.status(404).json({ error: 'Профиль ребенка не найден.' });
    }

    // Update child profile
    if (birthDate !== undefined || avatarColor !== undefined) {
      const existingProfile = await dbGet(`SELECT * FROM child_profiles WHERE id = ?`, [member.child_profile_id]);
      const updatedBirth = birthDate !== undefined ? birthDate : existingProfile.birth_date;
      const updatedColor = avatarColor !== undefined ? avatarColor : existingProfile.avatar_color;

      await dbRun(`
        UPDATE child_profiles
        SET birth_date = ?, avatar_color = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [updatedBirth, updatedColor, member.child_profile_id]);
    }

    // Update user row
    if (displayName || password) {
      const existingUser = await dbGet(`SELECT display_name, password_hash FROM users WHERE id = ?`, [childId]);
      const updatedName = displayName || existingUser.display_name;
      const updatedHash = password ? bcrypt.hashSync(password, 10) : existingUser.password_hash;
      const mustChange = password ? 1 : 0;

      await dbRun(`
        UPDATE users
        SET display_name = ?, password_hash = ?, must_change_password = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [updatedName, updatedHash, mustChange, childId]);
    }

    // Audit
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'update_child_profile', 'child', ?, ?)
    `, [req.user.familyId, req.user.id, member.child_profile_id, `Обновлены данные ребенка: ${displayName || member.display_name}`]);

    return res.json({ success: true, message: 'Профиль ребенка успешно обновлен.' });

  } catch (error) {
    console.error('Update child error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * POST /api/children/:id/reset-password - Quick password reset by parents (with no email)
 */
router.post('/:id/reset-password', requireAuth, requireFamilyAdmin, requireFamilyMembership, async (req, res) => {
  const childId = parseInt(req.params.id, 10);
  const { temporaryPassword } = req.body;

  if (!temporaryPassword || temporaryPassword.length < 6) {
    return res.status(400).json({ error: 'Временный пароль должен содержать не менее 6 символов.' });
  }

  try {
    const member = await dbGet(`SELECT family_id, child_profile_id FROM family_members WHERE user_id = ? AND role = 'child'`, [childId]);
    if (!member || member.family_id !== req.user.familyId) {
      return res.status(404).json({ error: 'Ребенок не найден.' });
    }

    const passwordHash = bcrypt.hashSync(temporaryPassword, 10);

    await dbRun(`
      UPDATE users
      SET password_hash = ?, must_change_password = 1, updated_at = datetime('now')
      WHERE id = ?
    `, [passwordHash, childId]);

    // Audit
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'reset_child_password', 'user', ?, 'Родитель сбросил временный пароль ребенку')
    `, [req.user.familyId, req.user.id, childId]);

    return res.json({
      success: true,
      message: 'Временный пароль успешно установлен. Ребенок должен будет изменить его при следующем входе.'
    });

  } catch (error) {
    console.error('Reset child password error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

module.exports = router;
