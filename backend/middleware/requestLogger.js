const crypto = require('crypto');
const logger = require('../utils/logger');

function requestLoggerMiddleware(req, res, next) {
  req.requestId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const actorUserId = req.user?.id || null;
    const familyId = req.user?.familyId || null;

    logger.info(`HTTP ${req.method} ${req.originalUrl || req.url}`, {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      actorUserId,
      familyId,
      ip: req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress
    });
  });

  next();
}

module.exports = requestLoggerMiddleware;
