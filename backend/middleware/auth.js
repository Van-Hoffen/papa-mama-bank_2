const jwt = require('jsonwebtoken');
const { db } = require('../models/db');

const authenticate = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-key');
    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

const checkBankAccess = (req, res, next) => {
  // For admin roles, check if the requested resource belongs to their bank
  if (req.user.role === 'mama-admin' || req.user.role === 'papa-admin') {
    // Check if the bank in the request matches the user's bank
    // This will be handled by individual route controllers
    next();
  } else {
    next();
  }
};

module.exports = {
  authenticate,
  authorizeRoles,
  checkBankAccess
};