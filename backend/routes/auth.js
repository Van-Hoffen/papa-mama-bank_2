const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, dbGet, dbRun } = require('../models/db');
const { requireAuth } = require('../middleware/auth');
const EmailService = require('../utils/emailService');

const router = express.Router();

/**
 * Generate a clean, URL-safe slug from a string.
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\wа-яё\-]+/gi, '')  // Remove non-alphanumeric (keep Cyrillic letters and hyphens)
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '');            // Trim - from end
}

/**
 * Public registration of a new family.
 * Creates family space + first family_admin in pending status.
 */
router.post('/register-family', async (req, res) => {
  const email = req.body.email || req.body.adminEmail;
  const password = req.body.password || req.body.adminPassword;
  const name = req.body.name || req.body.adminName;
  const { familyName, timezone } = req.body;

  if (!email || !password || !name || !familyName) {
    return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены: email, пароль, имя, название семьи.' });
  }

  if (password.length < 10) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 10 символов.' });
  }

  const emailNormalized = email.toLowerCase().trim();

  try {
    // Neutral message pattern to avoid email enumeration
    const existingUser = await dbGet(`SELECT id FROM users WHERE email_normalized = ?`, [emailNormalized]);
    if (existingUser) {
      // Simulate sending email to prevent timing attacks and return success
      return res.json({ 
        message: 'Регистрация успешна! На указанный email отправлено письмо со ссылкой для подтверждения.' 
      });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Generate unique slug for family
    let slug = slugify(familyName);
    if (!slug || slug.length < 3) {
      slug = 'family-' + crypto.randomBytes(4).toString('hex');
    }
    const slugExist = await dbGet(`SELECT id FROM families WHERE slug = ?`, [slug]);
    if (slugExist) {
      slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    // Insert user (pending status)
    const userResult = await dbRun(`
      INSERT INTO users (email, email_normalized, password_hash, display_name, platform_role, status, verification_token, verification_expires_at)
      VALUES (?, ?, ?, ?, 'user', 'pending_email_verification', ?, ?)
    `, [emailNormalized, emailNormalized, passwordHash, name, verificationToken, verificationExpiresAt]);

    const userId = userResult.lastID;

    // Insert family (pending status)
    const familyResult = await dbRun(`
      INSERT INTO families (name, slug, timezone, currency_code, status, created_by_user_id)
      VALUES (?, ?, ?, 'RUB', 'pending', ?)
    `, [familyName, slug, timezone || 'Europe/Moscow', userId]);

    const familyId = familyResult.lastID;

    // Create family_member relationship
    await dbRun(`
      INSERT INTO family_members (family_id, user_id, role)
      VALUES (?, ?, 'family_admin')
    `, [familyId, userId]);

    // Audit Log
    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'register_family', 'family', ?, 'Первичная регистрация семьи')
    `, [familyId, userId, familyId]);

    // Send verification email
    await EmailService.sendVerificationEmail(emailNormalized, name, verificationToken);

    return res.json({ 
      message: 'Регистрация успешна! На указанный email отправлено письмо со ссылкой для подтверждения.' 
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера при регистрации.' });
  }
});

/**
 * Confirm email address using token.
 */
router.post('/verify-email', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Токен подтверждения обязателен.' });
  }

  try {
    const user = await dbGet(`
      SELECT id, display_name, status, verification_expires_at 
      FROM users 
      WHERE verification_token = ?
    `, [token]);

    if (!user) {
      return res.status(400).json({ error: 'Неверный или просроченный токен подтверждения.' });
    }

    const expires = new Date(user.verification_expires_at);
    if (expires < new Date()) {
      return res.status(400).json({ error: 'Срок действия токена подтверждения истек (24 часа). Пожалуйста, зарегистрируйтесь заново.' });
    }

    // Activate User
    await dbRun(`
      UPDATE users 
      SET status = 'active', email_verified_at = datetime('now'), verification_token = NULL, verification_expires_at = NULL
      WHERE id = ?
    `, [user.id]);

    // Get family associated with user
    const member = await dbGet(`SELECT family_id FROM family_members WHERE user_id = ?`, [user.id]);
    if (member) {
      // Activate Family
      await dbRun(`UPDATE families SET status = 'active' WHERE id = ?`, [member.family_id]);
      
      // Log Audit
      await dbRun(`
        INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
        VALUES (?, ?, 'verify_email', 'user', ?, 'Email успешно верифицирован')
      `, [member.family_id, user.id, user.id]);
    }

    return res.json({ 
      success: true, 
      message: 'Ваш email успешно подтвержден! Теперь вы можете войти в систему.' 
    });

  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера при подтверждении email.' });
  }
});

/**
 * Login Route. Supports adults (via Email) and children (via combined/scoped username or optional Family Code).
 */
router.post('/login', async (req, res) => {
  const login = req.body.login || req.body.email || req.body.username;
  const { password, familySlug } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: 'Логин/email и пароль обязательны.' });
  }

  try {
    let user = null;
    const loginClean = login.toLowerCase().trim();

    // 1. Check if email (adults & global_admin)
    if (loginClean.includes('@')) {
      user = await dbGet(`SELECT * FROM users WHERE email_normalized = ?`, [loginClean]);
    } else {
      // 2. Child login
      let targetUsername = loginClean;
      
      // Support "slug/username" notation or explicit "familySlug" body parameter
      if (loginClean.includes('/')) {
        const parts = loginClean.split('/');
        const slug = parts[0];
        const childUser = parts[1];
        targetUsername = `${slug}_${childUser}`;
      } else if (familySlug) {
        const slug = slugify(familySlug);
        targetUsername = `${slug}_${loginClean}`;
      }

      user = await dbGet(`SELECT * FROM users WHERE username = ?`, [targetUsername]);
      
      // Fallback: search by raw login if they passed the fully resolved username
      if (!user) {
        user = await dbGet(`SELECT * FROM users WHERE username = ?`, [loginClean]);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Неверные учетные данные.' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'Ваш доступ заблокирован администратором платформы.' });
    }

    if (user.status === 'pending_email_verification') {
      return res.status(403).json({ error: 'Ваш email не подтвержден. Пожалуйста, проверьте почту.' });
    }

    // Verify Password
    const passwordValid = bcrypt.compareSync(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Неверные учетные данные.' });
    }

    // Load full profile details and membership info
    let familyId = null;
    let familyRole = null;
    let childProfileId = null;
    let familyName = '';
    let timezone = 'Europe/Moscow';

    if (user.platform_role === 'user') {
      const membership = await dbGet(`
        SELECT fm.family_id, fm.role, fm.child_profile_id, f.name as family_name, f.timezone, f.status as family_status
        FROM family_members fm
        JOIN families f ON fm.family_id = f.id
        WHERE fm.user_id = ?
      `, [user.id]);

      if (membership) {
        if (membership.family_status === 'blocked') {
          return res.status(403).json({ error: 'Доступ заблокирован. Ваша семья заблокирована.' });
        }
        familyId = membership.family_id;
        familyRole = membership.role;
        childProfileId = membership.child_profile_id;
        familyName = membership.family_name;
        timezone = membership.timezone;
      }
    }

    // Sign JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        username: user.username, 
        platform_role: user.platform_role 
      },
      process.env.JWT_SECRET || 'your-super-secret-key',
      { expiresIn: '24h' }
    );

    // Update last login
    await dbRun(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, [user.id]);

    // Return profile
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        platformRole: user.platform_role,
        mustChangePassword: !!user.must_change_password,
        familyId,
        familyRole,
        childProfileId,
        familyName,
        timezone
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера при аутентификации.' });
  }
});

/**
 * Logout (client handles clearing token, but server acknowledges).
 */
router.post('/logout', (req, res) => {
  return res.json({ success: true, message: 'Вы успешно вышли из системы.' });
});

/**
 * Token Refresh Simulation.
 */
router.post('/refresh', requireAuth, (req, res) => {
  const token = jwt.sign(
    { 
      id: req.user.id, 
      email: req.user.email, 
      username: req.user.username, 
      platform_role: req.user.platformRole 
    },
    process.env.JWT_SECRET || 'your-super-secret-key',
    { expiresIn: '24h' }
  );
  return res.json({ token });
});

/**
 * Forgot password request. Generates password reset token.
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email обязателен.' });
  }

  const emailNormalized = email.toLowerCase().trim();

  try {
    const user = await dbGet(`SELECT id, display_name FROM users WHERE email_normalized = ?`, [emailNormalized]);
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      await dbRun(`
        UPDATE users 
        SET reset_password_token = ?, reset_password_expires_at = ?
        WHERE id = ?
      `, [resetToken, resetExpiresAt, user.id]);

      await EmailService.sendPasswordResetEmail(emailNormalized, user.display_name, resetToken);
    }

    // Secure neutral answer
    return res.json({ 
      message: 'Если указанный email зарегистрирован в системе, на него отправлена ссылка для сброса пароля.' 
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * Reset password using token.
 */
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Токен сброса и новый пароль обязательны.' });
  }

  if (newPassword.length < 10) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 10 символов.' });
  }

  try {
    const user = await dbGet(`
      SELECT id, display_name 
      FROM users 
      WHERE reset_password_token = ? AND reset_password_expires_at > datetime('now')
    `, [token]);

    if (!user) {
      return res.status(400).json({ error: 'Неверный или просроченный токен сброса пароля.' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);

    await dbRun(`
      UPDATE users 
      SET password_hash = ?, reset_password_token = NULL, reset_password_expires_at = NULL, must_change_password = 0
      WHERE id = ?
    `, [passwordHash, user.id]);

    // Find if associated with family to log audit
    const member = await dbGet(`SELECT family_id FROM family_members WHERE user_id = ?`, [user.id]);
    const familyId = member ? member.family_id : null;

    await dbRun(`
      INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
      VALUES (?, ?, 'reset_password_via_token', 'user', ?, 'Пароль успешно восстановлен')
    `, [familyId, user.id, user.id]);

    return res.json({ 
      success: true, 
      message: 'Пароль успешно изменен. Теперь вы можете войти в систему с новым паролем.' 
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * Me route — returns fresh profile.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await dbGet(`SELECT id, email, username, display_name, platform_role, must_change_password FROM users WHERE id = ?`, [req.user.id]);
    
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        platformRole: user.platform_role,
        mustChangePassword: !!user.must_change_password,
        familyId: req.user.familyId,
        familyRole: req.user.familyRole,
        childProfileId: req.user.childProfileId,
        familyName: req.user.familyName,
        timezone: req.user.timezone,
        currencyCode: req.user.currencyCode
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

// Legacy backwards compatibility route
router.get('/current-user', requireAuth, async (req, res) => {
  return res.json({
    id: req.user.id,
    username: req.user.username,
    name: req.user.displayName,
    role: req.user.familyRole || req.user.platformRole,
    family_id: req.user.familyId,
    child_profile_id: req.user.childProfileId
  });
});

module.exports = router;
