const fs = require('fs');
const path = require('path');

// Determine log directory - use /var/log/papa-mama-bank if writable, else fallback to ./logs
let logDir = '/var/log/papa-mama-bank';
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.accessSync(logDir, fs.constants.W_OK);
} catch (err) {
  logDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

const appLogPath = path.join(logDir, 'app.log');
const errorLogPath = path.join(logDir, 'error.log');

function maskEmail(email) {
  if (!email || typeof email !== 'string') return email;
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return `${name[0]}*@${domain}`;
  }
  return `${name.substring(0, 2)}***@${domain}`;
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const sensitiveKeys = [
    'password', 'password_hash', 'passwordhash', 'token', 'access_token',
    'refresh_token', 'token_hash', 'verification_token', 'reset_password_token',
    'cookie', 'cookies', 'authorization', 'secret'
  ];

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (lowerKey === 'email') {
      sanitized[key] = maskEmail(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function writeToFile(filePath, logData) {
  const line = JSON.stringify(logData) + '\n';
  fs.appendFile(filePath, line, (err) => {
    if (err) console.error(`Error writing to log file ${filePath}:`, err.message);
  });
}

function log(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const environment = process.env.NODE_ENV || 'development';
  
  const sanitizedMeta = sanitizeObject(metadata);
  
  const logEntry = {
    timestamp,
    level,
    service: 'papa-mama-bank-api',
    environment,
    message,
    ...sanitizedMeta
  };

  // Write to stdout
  const stdOutLine = `[${timestamp}] [${level.toUpperCase()}] ${message} ${Object.keys(sanitizedMeta).length ? JSON.stringify(sanitizedMeta) : ''}`;
  if (level === 'error' || level === 'fatal') {
    console.error(stdOutLine);
  } else {
    console.log(stdOutLine);
  }

  // Write to file
  writeToFile(appLogPath, logEntry);
  if (level === 'error' || level === 'fatal') {
    writeToFile(errorLogPath, logEntry);
  }
}

const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  fatal: (msg, meta) => log('fatal', msg, meta),
  maskEmail,
  sanitizeObject,
  logDir
};

module.exports = logger;
