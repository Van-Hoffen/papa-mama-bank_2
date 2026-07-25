const { dbRun } = require('../models/db');
const logger = require('./logger');

/**
 * Log a structured audit event to the audit_logs database table and system log.
 */
async function recordAuditEvent({
  req,
  familyId,
  actorUserId,
  actorRole,
  eventType,
  targetType = null,
  targetId = null,
  requestId = null,
  ipAddress = null,
  userAgent = null,
  metadata = {}
}) {
  try {
    const finalFamilyId = familyId || req?.user?.familyId || null;
    const finalActorUserId = actorUserId || req?.user?.id || null;
    const finalActorRole = actorRole || req?.user?.familyRole || req?.user?.platformRole || null;
    const finalRequestId = requestId || req?.requestId || null;
    const finalIp = ipAddress || req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null;
    const finalUserAgent = userAgent || req?.headers?.['user-agent'] || null;

    const sanitizedMeta = logger.sanitizeObject(metadata);
    const metadataJson = JSON.stringify(sanitizedMeta || {});

    await dbRun(`
      INSERT INTO audit_logs (
        family_id, actor_user_id, actor_role, event_type, 
        target_type, target_id, request_id, ip_address, user_agent, metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      finalFamilyId,
      finalActorUserId,
      finalActorRole,
      eventType,
      targetType,
      targetId,
      finalRequestId,
      finalIp,
      finalUserAgent,
      metadataJson
    ]);

    logger.info(`Audit event: ${eventType}`, {
      familyId: finalFamilyId,
      actorUserId: finalActorUserId,
      actorRole: finalActorRole,
      eventType,
      targetType,
      targetId,
      requestId: finalRequestId
    });
  } catch (err) {
    logger.error(`Failed to record audit event '${eventType}': ${err.message}`, { error: err.stack });
  }
}

module.exports = { recordAuditEvent };
