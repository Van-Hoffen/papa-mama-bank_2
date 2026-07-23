const jwt = require('jsonwebtoken');
const { db, dbGet, dbRun } = require('../models/db');

/**
 * Core Authentication Middleware
 * Validates JWT and populates req.user with profile, role, family membership, and timezone.
 */
const requireAuth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Доступ запрещен. Токен не предоставлен.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-key');
    
    // Fetch full fresh info from database
    const user = await dbGet(`SELECT id, email, username, display_name, platform_role, status, must_change_password FROM users WHERE id = ?`, [decoded.id]);
    
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден.' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован администратором платформы.' });
    }

    if (user.status === 'pending_email_verification') {
      return res.status(403).json({ error: 'Пожалуйста, подтвердите ваш email перед входом.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      platformRole: user.platform_role,
      mustChangePassword: user.must_change_password
    };

    // If platform role is user, load family membership
    if (user.platform_role === 'user') {
      const membership = await dbGet(`
        SELECT fm.family_id, fm.role, fm.child_profile_id, f.timezone, f.currency_code, f.name as family_name, f.status as family_status
        FROM family_members fm
        JOIN families f ON fm.family_id = f.id
        WHERE fm.user_id = ?
      `, [user.id]);

      if (membership) {
        if (membership.family_status === 'blocked') {
          return res.status(403).json({ error: 'Доступ заблокирован. Ваша семья заблокирована администратором.' });
        }
        req.user.familyId = membership.family_id;
        req.user.familyRole = membership.role; // 'family_admin' | 'child'
        req.user.childProfileId = membership.child_profile_id;
        req.user.timezone = membership.timezone;
        req.user.currencyCode = membership.currency_code;
        req.user.familyName = membership.family_name;
      }
    }

    next();
  } catch (ex) {
    res.status(401).json({ error: 'Неверный или просроченный токен сессии.' });
  }
};

/**
 * Limits access to global platform admins.
 */
const requireGlobalAdmin = (req, res, next) => {
  if (req.user?.platformRole !== 'global_admin') {
    return res.status(403).json({ error: 'Доступ запрещен. Требуются права супер-администратора.' });
  }
  next();
};

/**
 * Limits access to family administrators.
 */
const requireFamilyAdmin = (req, res, next) => {
  if (req.user?.platformRole === 'user' && req.user?.familyRole === 'family_admin') {
    return next();
  }
  return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора семьи.' });
};

/**
 * Restricts queries/mutations to the user's active family space.
 */
const requireFamilyMembership = (req, res, next) => {
  if (!req.user?.familyId) {
    return res.status(403).json({ error: 'Вы не состоите ни в одной семье.' });
  }
  next();
};

/**
 * Support Access middleware.
 * Allows access if:
 * 1. The user is a member of the family F.
 * 2. Or the user is a global_admin who has passed a valid support reason in the header.
 */
const checkSupportAccess = (familyIdParamName = 'familyId') => {
  return async (req, res, next) => {
    const targetFamilyId = parseInt(req.params[familyIdParamName] || req.query[familyIdParamName] || req.body[familyIdParamName], 10);
    
    if (!targetFamilyId) {
      return res.status(400).json({ error: 'Идентификатор семьи не указан.' });
    }

    // Scenario A: Standard family member
    if (req.user?.familyId === targetFamilyId) {
      return next();
    }

    // Scenario B: Global Admin Support Mode
    if (req.user?.platformRole === 'global_admin') {
      const supportReason = req.header('X-Support-Reason');
      if (!supportReason || supportReason.trim().length < 5) {
        return res.status(403).json({ 
          error: 'Режим поддержки заблокирован. Необходимо указать причину доступа в заголовке X-Support-Reason (минимум 5 символов).' 
        });
      }

      // Audit log the support access action
      await dbRun(`
        INSERT INTO audit_logs (family_id, actor_user_id, action, entity_type, entity_id, reason)
        VALUES (?, ?, 'support_view_data', 'family', ?, ?)
      `, [targetFamilyId, req.user.id, targetFamilyId, supportReason]);

      // Set a flag on the request to indicate support mode
      req.isSupportMode = true;
      req.supportFamilyId = targetFamilyId;
      return next();
    }

    return res.status(404).json({ error: 'Семья не найдена или доступ запрещен.' });
  };
};

module.exports = {
  requireAuth,
  requireGlobalAdmin,
  requireFamilyAdmin,
  requireFamilyMembership,
  checkSupportAccess
};
