const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../models/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Register
router.post('/register', (req, res) => {
  const { username, password, name, role, parent_id } = req.body;

  // Validation
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'All fields are required: username, password, name, role' });
  }

  if (username.length < 4) {
    return res.status(400).json({ error: 'Username must be at least 4 characters long' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  // Validate role and bank consistency
  if (role === 'mama-admin' && (!req.body.bank || req.body.bank !== 'mama')) {
    return res.status(400).json({ error: 'Mama-admin must have bank=mama' });
  }
  
  if (role === 'papa-admin' && (!req.body.bank || req.body.bank !== 'papa')) {
    return res.status(400).json({ error: 'Papa-admin must have bank=papa' });
  }
  
  if (role === 'child' && req.body.bank) {
    return res.status(400).json({ error: 'Child cannot have a bank assigned' });
  }

  // Hash password
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);

  // Insert user
  const stmt = db.prepare(`
    INSERT INTO users (username, password, name, role, parent_id, bank) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run([username, hashedPassword, name, role, parent_id || null, req.body.bank || null], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }

    const newUser = {
      id: this.lastID,
      username,
      name,
      role,
      parent_id: parent_id || null
    };

    res.status(201).json(newUser);
  });
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const stmt = db.prepare(`
    SELECT id, username, name, role, bank FROM users WHERE username = ?
  `);

  stmt.get([username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare password
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        name: user.name, 
        role: user.role,
        bank: user.bank  // Include bank info in token
      },
      process.env.JWT_SECRET || 'your-super-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        bank: user.bank
      }
    });
  });
});

// Get current user
router.get('/current-user', authenticate, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    name: req.user.name,
    role: req.user.role,
    bank: req.user.bank
  });
});

module.exports = router;