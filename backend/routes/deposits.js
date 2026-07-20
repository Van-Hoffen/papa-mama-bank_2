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

  if (req.user.role === 'admin' || req.user.role === 'mama-admin' || req.user.role === 'papa-admin' || req.user.role === 'bank-admin') {
    if (req.user.role === 'admin') {
      if (childId) {
        query = `
          SELECT d.*, u.name as child_name
          FROM deposits d
          JOIN users u ON d.child_id = u.id
          WHERE d.child_id = ?
          ORDER BY d.created_at DESC
        `;
        params = [childId];
      } else {
        query = `
          SELECT d.*, u.name as child_name
          FROM deposits d
          JOIN users u ON d.child_id = u.id
          ORDER BY d.created_at DESC
        `;
      }
    } else {
      // Custom bank admin (mama, papa, babushka, etc.)
      const adminBank = req.user.bank;
      if (childId) {
        query = `
          SELECT d.*, u.name as child_name
          FROM deposits d
          JOIN users u ON d.child_id = u.id
          WHERE d.child_id = ? AND d.bank = ?
          ORDER BY d.created_at DESC
        `;
        params = [childId, adminBank];
      } else {
        query = `
          SELECT d.*, u.name as child_name
          FROM deposits d
          JOIN users u ON d.child_id = u.id
          WHERE d.bank = ?
          ORDER BY d.created_at DESC
        `;
        params = [adminBank];
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
        const daysSinceCreation = getDaysSince(deposit.created_at);
        const periodsCompleted = Math.floor(daysSinceCreation / deposit.period_days);
        calculatedBalance = calculateCompoundInterest(deposit.amount, deposit.interest_rate, periodsCompleted);
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
    if (req.user.role !== 'admin') {
      if ((req.user.role === 'mama-admin' || req.user.role === 'papa-admin' || req.user.role === 'bank-admin') && deposit.bank !== req.user.bank) {
        return res.status(403).json({ error: 'Access denied. This is not your bank!' });
      }
    }

    // Calculate dynamic balance
    let calculatedBalance = deposit.current_balance;
    
    if (deposit.status === 'active') {
      const daysSinceCreation = getDaysSince(deposit.created_at);
      const periodsCompleted = Math.floor(daysSinceCreation / deposit.period_days);
      calculatedBalance = calculateCompoundInterest(deposit.amount, deposit.interest_rate, periodsCompleted);
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

  // Fetch bank settings dynamically from the database
  db.get('SELECT * FROM bank_settings WHERE bank = ?', [bank], (err, settings) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!settings) {
      return res.status(404).json({ error: 'Выбранный банк не найден в системе' });
    }

    if (amount < settings.min_amount) {
      return res.status(400).json({ error: `Минимальная сумма вклада для этого банка составляет ${settings.min_amount} ₽` });
    }

    const interestRate = settings.interest_rate;
    const periodDays = settings.period_days;

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
});

// Approve a pending rate change for a deposit (called by child)
router.post('/:id/approve-rate-change', authenticate, authorizeRoles('child'), (req, res) => {
  const depositId = req.params.id;

  db.get('SELECT * FROM deposits WHERE id = ? AND child_id = ?', [depositId, req.user.id], (err, deposit) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    if (deposit.rate_change_status !== 'pending_child_approval') {
      return res.status(400).json({ error: 'No pending rate change for this deposit' });
    }

    const daysSinceCreation = getDaysSince(deposit.created_at);
    const periodsCompleted = Math.floor(daysSinceCreation / deposit.period_days);
    const calculatedBalance = calculateCompoundInterest(deposit.amount, deposit.interest_rate, periodsCompleted);
    const interestEarned = calculatedBalance - deposit.amount;

    db.serialize(() => {
      // 1. If interest earned is greater than zero, log it and capitalize it
      if (interestEarned > 0) {
        db.run(`
          INSERT INTO interest_log (deposit_id, interest_amount, new_balance)
          VALUES (?, ?, ?)
        `, [depositId, interestEarned, calculatedBalance]);
      }

      // 2. Update the deposit body and switch to new rates, resetting the timer to now
      db.run(`
        UPDATE deposits
        SET amount = ?,
            current_balance = ?,
            interest_rate = ?,
            period_days = ?,
            created_at = CURRENT_TIMESTAMP,
            last_interest_calc = CURRENT_TIMESTAMP,
            pending_interest_rate = NULL,
            pending_period_days = NULL,
            rate_change_status = 'none'
        WHERE id = ?
      `, [calculatedBalance, calculatedBalance, deposit.pending_interest_rate, deposit.pending_period_days, depositId], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Internal server error' });
        }

        res.json({
          message: 'Новые условия вклада успешно подтверждены! Ранее накопленные проценты зафиксированы и добавлены к сумме вклада.',
          new_balance: parseFloat(calculatedBalance.toFixed(2))
        });
      });
    });
  });
});

// Decline a pending rate change for a deposit (called by child)
router.post('/:id/decline-rate-change', authenticate, authorizeRoles('child'), (req, res) => {
  const depositId = req.params.id;

  db.run(`
    UPDATE deposits
    SET pending_interest_rate = NULL,
        pending_period_days = NULL,
        rate_change_status = 'none'
    WHERE id = ? AND child_id = ? AND rate_change_status = 'pending_child_approval'
  `, [depositId, req.user.id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    res.json({ message: 'Вы отклонили изменение условий вклада. Вклад продолжает действовать по старой процентной ставке.' });
  });
});

module.exports = router;