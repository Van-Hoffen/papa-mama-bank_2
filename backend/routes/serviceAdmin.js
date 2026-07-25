const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../models/db');
const { requireAuth, requireServiceAdmin } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/auditLogger');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/service-admin/families - Get list of all families with stats
 */
router.get('/families', requireAuth, requireServiceAdmin, async (req, res) => {
  try {
    const families = await dbAll(`
      SELECT 
        f.id, f.name, f.slug, f.status, f.created_at, f.owner_user_id,
        u_owner.display_name AS owner_name, u_owner.email AS owner_email,
        (SELECT COUNT(*) FROM family_members fm WHERE fm.family_id = f.id) AS members_count,
        (SELECT COUNT(*) FROM deposits d WHERE d.family_id = f.id AND d.status = 'active') AS active_deposits_count,
        (SELECT created_at FROM audit_logs al WHERE al.family_id = f.id ORDER BY al.created_at DESC LIMIT 1) AS last_action_at
      FROM families f
      LEFT JOIN users u_owner ON f.owner_user_id = u_owner.id
      ORDER BY f.created_at DESC
    `);

    return res.json(families);
  } catch (error) {
    logger.error('Get service admin families error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/service-admin/audit-logs - View audit logs across all families
 */
router.get('/audit-logs', requireAuth, requireServiceAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  const offset = (page - 1) * pageSize;

  const { familyId, actorUserId, eventType, from, to, ipAddress, requestId, search } = req.query;

  try {
    let conditions = ['1=1'];
    let params = [];

    if (familyId) {
      conditions.push('al.family_id = ?');
      params.push(parseInt(familyId, 10));
    }
    if (actorUserId) {
      conditions.push('al.actor_user_id = ?');
      params.push(parseInt(actorUserId, 10));
    }
    if (eventType) {
      conditions.push('al.event_type = ?');
      params.push(eventType);
    }
    if (from) {
      conditions.push('al.created_at >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('al.created_at <= ?');
      params.push(to);
    }
    if (ipAddress) {
      conditions.push('al.ip_address LIKE ?');
      params.push(`%${ipAddress}%`);
    }
    if (requestId) {
      conditions.push('al.request_id = ?');
      params.push(requestId);
    }
    if (search) {
      conditions.push(`(u.display_name LIKE ? OR u.email LIKE ? OR f.name LIKE ? OR al.event_type LIKE ? OR al.metadata_json LIKE ?)`);
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await dbGet(`
      SELECT COUNT(*) as total
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      LEFT JOIN families f ON al.family_id = f.id
      WHERE ${whereClause}
    `, params);

    const total = countRow ? countRow.total : 0;

    const rows = await dbAll(`
      SELECT 
        al.id, al.created_at, al.family_id, al.actor_user_id, al.actor_role,
        al.event_type, al.target_type, al.target_id, al.request_id,
        al.ip_address, al.user_agent, al.metadata_json,
        u.display_name AS actor_name, u.email AS actor_email,
        f.name AS family_name
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      LEFT JOIN families f ON al.family_id = f.id
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
        familyName: r.family_name || 'Н/Д',
        actorUserId: r.actor_user_id,
        actorName: r.actor_name || 'Система',
        actorEmail: r.actor_email || null,
        actorRole: r.actor_role,
        eventType: r.event_type,
        targetType: r.target_type,
        targetId: r.target_id,
        requestId: r.request_id,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        metadata: parsedMeta
      };
    });

    // Record audit event for service admin viewing audit logs
    await recordAuditEvent({
      req,
      familyId: familyId ? parseInt(familyId, 10) : null,
      eventType: 'service_admin_audit_viewed',
      targetType: 'audit_logs',
      metadata: { filterFamilyId: familyId, filterActorUserId: actorUserId, page }
    });

    return res.json({
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });

  } catch (error) {
    logger.error('Service admin audit error:', { error: error.message });
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

/**
 * GET /api/service-admin/audit-logs/export.csv - Export audit logs to CSV
 */
router.get('/audit-logs/export.csv', requireAuth, requireServiceAdmin, async (req, res) => {
  const { familyId, actorUserId, eventType, from, to, search } = req.query;

  try {
    let conditions = ['1=1'];
    let params = [];

    if (familyId) {
      conditions.push('al.family_id = ?');
      params.push(parseInt(familyId, 10));
    }
    if (actorUserId) {
      conditions.push('al.actor_user_id = ?');
      params.push(parseInt(actorUserId, 10));
    }
    if (eventType) {
      conditions.push('al.event_type = ?');
      params.push(eventType);
    }
    if (from) {
      conditions.push('al.created_at >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('al.created_at <= ?');
      params.push(to);
    }
    if (search) {
      conditions.push(`(u.display_name LIKE ? OR u.email LIKE ? OR f.name LIKE ? OR al.event_type LIKE ? OR al.metadata_json LIKE ?)`);
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const rows = await dbAll(`
      SELECT 
        al.id, al.created_at, f.name AS family_name, u.display_name AS actor_name,
        u.email AS actor_email, al.actor_role, al.event_type, al.target_type,
        al.target_id, al.ip_address, al.metadata_json
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      LEFT JOIN families f ON al.family_id = f.id
      WHERE ${whereClause}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT 5000
    `, params);

    // Escape CSV values
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const header = ['ID', 'Дата', 'Семья', 'Участник', 'Email', 'Роль', 'Событие', 'Тип объекта', 'ID объекта', 'IP', 'Детали'];
    let csvLines = [header.map(escapeCsv).join(',')];

    for (const r of rows) {
      const line = [
        r.id,
        r.created_at,
        r.family_name || '',
        r.actor_name || 'Система',
        r.actor_email || '',
        r.actor_role || '',
        r.event_type || '',
        r.target_type || '',
        r.target_id || '',
        r.ip_address || '',
        r.metadata_json || ''
      ].map(escapeCsv).join(',');
      csvLines.push(line);
    }

    const csvContent = '\uFEFF' + csvLines.join('\n'); // UTF-8 BOM for Excel

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    
    await recordAuditEvent({
      req,
      eventType: 'service_admin_audit_viewed',
      targetType: 'csv_export',
      metadata: { exportedRows: rows.length }
    });

    return res.send(csvContent);

  } catch (error) {
    logger.error('Export CSV error:', { error: error.message });
    return res.status(500).json({ error: 'Ошибка экспорта CSV.' });
  }
});

module.exports = router;
