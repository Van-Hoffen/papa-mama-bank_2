const express = require('express');
const { db } = require('../models/db');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

// Helper function to calculate compound interest
const calculateCompoundInterest = (principal, rate, periods) => {
  // Formula: A = P × (1 + r)^n
  return principal * Math.pow(1 + rate, periods);
};

// Helper function to get days since creation
const getDaysSince = (dateStr) => {
  const createdDate = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now - createdDate);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

// Get deposits for a specific child
router.get('/', authenticate, (req, res) => {
  const childId = req.query.child_id;
  
  // Check authorization - child can only see their own deposits
  if (req.user.role === 'child' && parseInt(childId) !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  let query;
  let params = [];

  if (req.user.role === 'mama-admin' || req.user.role === 'papa-admin') {
    // Admins can only see deposits from their own bank
    if (req.user.role === 'mama-admin') {
      if (childId) {
        query = `
          SELECT d.*, u.name as child_name
          FROM deposits d
          JOIN users u ON d.child_id = u.id
          WHERE d.child_id = ? AND d.bank = 'mama'
          ORDER BY d.created_at DESC
        `;
        params = [childId];
      } else {
        query = `
          SELECT d.*, u.name as child_name
          FROM deposits d
          JOIN users u ON d.child_id = u.id
          WHERE d.bank = 'mama'
          ORDER BY d.created_at DESC
        `;
      }
    } else if (req.user.role === 'papa-admin') {
      if (childId) {
        query = `
          SELECT d.*, u.name as child_name
          FROM deposits d
          JOIN users u ON d.child_id = u.id
          WHERE d.child_id = ? AND d.bank = 'papa'
          ORDER BY d.created_at DESC
        `;
        params = [childId];
      } else {
        query = `
          SELECT d.*, u.name as child_name
          FROM deposits d
          JOIN users u ON d.child_id = u.id
          WHERE d.bank = 'papa'
          ORDER BY d.created_at DESC
        `;
      }
    }
  } else {
    // Child can see their own deposits
    query = `
      SELECT d.*, u.name as child_name
      FROM deposits d
      JOIN users u ON d.child_id = u.id
      WHERE d.child_id = ?
      ORDER BY d.created_at DESC
    `;
    params = [req.user.id];
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    // Calculate dynamic balances
    const depositsWithBalance = rows.map(deposit => {
      let calculatedBalance = deposit.current_balance;
      
      if (deposit.status === 'active') {
        // Calculate interest based on the bank
        const daysSinceCreation = getDaysSince(deposit.created_at);
        
        if (deposit.bank === 'mama') {
          // Mama bank: 3.5% every 14 days
          const periodsCompleted = Math.floor(daysSinceCreation / 14);
          const ratePerPeriod = 0.035;
          
          calculatedBalance = calculateCompoundInterest(deposit.amount, ratePerPeriod, periodsCompleted);
        } else if (deposit.bank === 'papa') {
          // Papa bank: 11% every 30 days
          const periodsCompleted = Math.floor(daysSinceCreation / 30);
          const ratePerPeriod = 0.11;
          
          calculatedBalance = calculateCompoundInterest(deposit.amount, ratePerPeriod, periodsCompleted);
        }
      }
      
      return {
        ...deposit,
        calculated_balance: parseFloat(calculatedBalance.toFixed(2))
      };
    });

    res.json(depositsWithBalance);
  });
});

// Get specific deposit
router.get('/:id', authenticate, (req, res) => {
  const depositId = req.params.id;

  db.get(`
    SELECT d.*, u.name as child_name
    FROM deposits d
    JOIN users u ON d.child_id = u.id
    WHERE d.id = ?
  `, [depositId], (err, deposit) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    // Check authorization
    if (req.user.role === 'child' && deposit.child_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check admin bank access
    if (req.user.role === 'mama-admin' && deposit.bank !== 'mama') {
      return res.status(403).json({ error: 'Access denied. This is not your bank!' });
    }
    
    if (req.user.role === 'papa-admin' && deposit.bank !== 'papa') {
      return res.status(403).json({ error: 'Access denied. This is not your bank!' });
    }

    // Calculate dynamic balance
    let calculatedBalance = deposit.current_balance;
    
    if (deposit.status === 'active') {
      const daysSinceCreation = getDaysSince(deposit.created_at);
      
      if (deposit.bank === 'mama') {
        // Mama bank: 3.5% every 14 days
        const periodsCompleted = Math.floor(daysSinceCreation / 14);
        const ratePerPeriod = 0.035;
        
        calculatedBalance = calculateCompoundInterest(deposit.amount, ratePerPeriod, periodsCompleted);
      } else if (deposit.bank === 'papa') {
        // Papa bank: 11% every 30 days
        const periodsCompleted = Math.floor(daysSinceCreation / 30);
        const ratePerPeriod = 0.11;
        
        calculatedBalance = calculateCompoundInterest(deposit.amount, ratePerPeriod, periodsCompleted);
      }
    }

    // Get interest history
    db.all(`
      SELECT *
      FROM interest_log
      WHERE deposit_id = ?
      ORDER BY calculated_at DESC
    `, [depositId], (err, interestHistory) => {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }

      res.json({
        ...deposit,
        calculated_balance: parseFloat(calculatedBalance.toFixed(2)),
        interest_history: interestHistory
      });
    });
  });
});

// Create a new deposit request
router.post('/', authenticate, authorizeRoles('child'), (req, res) => {
  const { bank, amount } = req.body;

  if (!bank || !amount) {
    return res.status(400).json({ error: 'Bank and amount are required' });
  }

  if (bank !== 'mama' && bank !== 'papa') {
    return res.status(400).json({ error: 'Bank must be either "mama" or "papa"' });
  }

  // Validate minimum amounts
  if (bank === 'mama' && amount < 1000) {
    return res.status(400).json({ error: 'Minimum deposit for Mama bank is 1000 ₽' });
  }

  if (bank === 'papa' && amount < 2000) {
    return res.status(400).json({ error: 'Minimum deposit for Papa bank is 2000 ₽' });
  }

  // Set interest parameters based on bank
  let interestRate, periodDays;
  if (bank === 'mama') {
    interestRate = 0.035; // 3.5% per period
    periodDays = 14; // Every 14 days
  } else {
    interestRate = 0.11; // 11% per period
    periodDays = 30; // Every 30 days
  }

  // Insert deposit with pending status
  const stmt = db.prepare(`
    INSERT INTO deposits (child_id, bank, amount, current_balance, interest_rate, period_days, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);

  stmt.run([req.user.id, bank, amount, amount, interestRate, periodDays], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    // Create a pending operation for approval
    const opStmt = db.prepare(`
      INSERT INTO operations (deposit_id, user_id, type, amount, status, notes)
      VALUES (?, ?, 'open', ?, 'pending', 'Opening new deposit')
    `);

    opStmt.run([this.lastID, req.user.id, amount], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }

      res.status(201).json({
        id: this.lastID,
        message: 'Deposit request created successfully. Awaiting approval.'
      });
    });
  });
});

module.exports = router;