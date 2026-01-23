const express = require('express');
const { db } = require('../models/db');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

// Helper function to get days since creation
const getDaysSince = (dateStr) => {
  const createdDate = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now - createdDate);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

// Request a new operation (withdrawal, etc.)
router.post('/request', authenticate, (req, res) => {
  const { deposit_id, type, amount } = req.body;

  if (!deposit_id || !type) {
    return res.status(400).json({ error: 'Deposit ID and type are required' });
  }

  // Get deposit information
  db.get(`
    SELECT d.*, u.bank as user_bank
    FROM deposits d
    JOIN users u ON d.child_id = u.id
    WHERE d.id = ?
  `, [deposit_id], (err, deposit) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    // Check if the user owns this deposit (for children)
    if (req.user.role === 'child' && deposit.child_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate operation type
    if (!['open', 'withdraw', 'interest', 'penalty'].includes(type)) {
      return res.status(400).json({ error: 'Invalid operation type' });
    }

    // For withdrawal operations
    if (type === 'withdraw') {
      if (deposit.status !== 'active') {
        return res.status(400).json({ error: 'Cannot withdraw from inactive deposit' });
      }
    }

    // Insert operation with pending status
    const stmt = db.prepare(`
      INSERT INTO operations (deposit_id, user_id, type, amount, status, notes)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `);

    stmt.run([
      deposit_id, 
      req.user.id, 
      type, 
      amount || deposit.current_balance, 
      `Requested ${type} operation`
    ], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }

      res.status(201).json({
        id: this.lastID,
        status: 'pending',
        message: 'Operation requested successfully. Awaiting approval.'
      });
    });
  });
});

// Get pending operations for admins
router.get('/pending', authenticate, (req, res) => {
  // Only admins can view pending operations
  if (req.user.role !== 'mama-admin' && req.user.role !== 'papa-admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }

  let query;
  let params = [];

  if (req.user.role === 'mama-admin') {
    // Mama admin sees only mama bank operations
    query = `
      SELECT o.*, d.bank, d.amount as deposit_amount, c.name as child_name
      FROM operations o
      JOIN deposits d ON o.deposit_id = d.id
      JOIN users c ON d.child_id = c.id
      WHERE o.status = 'pending' 
      AND d.bank = 'mama'
      ORDER BY o.requested_at DESC
    `;
  } else if (req.user.role === 'papa-admin') {
    // Papa admin sees only papa bank operations
    query = `
      SELECT o.*, d.bank, d.amount as deposit_amount, c.name as child_name
      FROM operations o
      JOIN deposits d ON o.deposit_id = d.id
      JOIN users c ON d.child_id = c.id
      WHERE o.status = 'pending' 
      AND d.bank = 'papa'
      ORDER BY o.requested_at DESC
    `;
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    res.json(rows);
  });
});

// Approve an operation
router.post('/:id/approve', authenticate, (req, res) => {
  const operationId = req.params.id;

  // Only admins can approve operations
  if (req.user.role !== 'mama-admin' && req.user.role !== 'papa-admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }

  // Get operation and related deposit
  db.get(`
    SELECT o.*, d.bank as deposit_bank, d.child_id, d.status as deposit_status, d.amount as deposit_amount
    FROM operations o
    JOIN deposits d ON o.deposit_id = d.id
    WHERE o.id = ?
  `, [operationId], (err, operation) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    // Check bank access
    if ((req.user.role === 'mama-admin' && operation.deposit_bank !== 'mama') ||
        (req.user.role === 'papa-admin' && operation.deposit_bank !== 'papa')) {
      return res.status(403).json({ error: 'Access denied. This is not your bank!' });
    }

    // Handle different operation types
    if (operation.type === 'open') {
      // Approve opening a deposit - change deposit status to active
      db.run(`
        UPDATE deposits 
        SET status = 'active', current_balance = amount
        WHERE id = ?
      `, [operation.deposit_id], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Internal server error' });
        }

        // Update operation status
        db.run(`
          UPDATE operations 
          SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [req.user.id, operationId], (err) => {
          if (err) {
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({ 
            status: 'approved',
            message: 'Deposit opened successfully' 
          });
        });
      });
    } else if (operation.type === 'withdraw') {
      // Get the deposit to calculate penalties and check timing
      db.get(`
        SELECT *, julianday('now') - julianday(created_at) as days_since_creation
        FROM deposits
        WHERE id = ?
      `, [operation.deposit_id], (err, deposit) => {
        if (err) {
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!deposit) {
          return res.status(404).json({ error: 'Deposit not found' });
        }

        let withdrawalAmount = deposit.current_balance;
        let penaltyApplied = 0;

        // Check if early withdrawal penalty applies
        if (deposit.bank === 'papa') {
          // Papa bank: 2% penalty for early withdrawal
          if (getDaysSince(deposit.created_at) < 30) {
            penaltyApplied = withdrawalAmount * 0.02;
            withdrawalAmount -= penaltyApplied;
          }
        }
        // Mama bank: no penalty for early withdrawal

        // Update deposit status to closed
        db.run(`
          UPDATE deposits 
          SET status = 'closed', closed_at = CURRENT_TIMESTAMP, current_balance = ?
          WHERE id = ?
        `, [withdrawalAmount, operation.deposit_id], (err) => {
          if (err) {
            return res.status(500).json({ error: 'Internal server error' });
          }

          // Update operation status
          db.run(`
            UPDATE operations 
            SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [req.user.id, operationId], (err) => {
            if (err) {
              return res.status(500).json({ error: 'Internal server error' });
            }

            res.json({ 
              status: 'approved',
              actual_amount: withdrawalAmount,
              penalty_applied: penaltyApplied,
              message: 'Withdrawal processed successfully' 
            });
          });
        });
      });
    } else {
      // For other operation types, just approve
      db.run(`
        UPDATE operations 
        SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.user.id, operationId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Internal server error' });
        }

        res.json({ 
          status: 'approved',
          message: 'Operation approved' 
        });
      });
    }
  });
});

// Reject an operation
router.post('/:id/reject', authenticate, (req, res) => {
  const operationId = req.params.id;

  // Only admins can reject operations
  if (req.user.role !== 'mama-admin' && req.user.role !== 'papa-admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }

  // Get operation to check bank access
  db.get(`
    SELECT o.*, d.bank as deposit_bank
    FROM operations o
    JOIN deposits d ON o.deposit_id = d.id
    WHERE o.id = ?
  `, [operationId], (err, operation) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    // Check bank access
    if ((req.user.role === 'mama-admin' && operation.deposit_bank !== 'mama') ||
        (req.user.role === 'papa-admin' && operation.deposit_bank !== 'papa')) {
      return res.status(403).json({ error: 'Access denied. This is not your bank!' });
    }

    // Update operation status to rejected
    db.run(`
      UPDATE operations 
      SET status = 'rejected', approved_by = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.user.id, operationId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }

      res.json({ 
        status: 'rejected',
        message: 'Operation rejected' 
      });
    });
  });
});

module.exports = router;