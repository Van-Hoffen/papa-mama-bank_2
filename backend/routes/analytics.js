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

// Get forecast for a specific deposit
router.get('/forecast/:depositId', authenticate, (req, res) => {
  const depositId = req.params.depositId;

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

    // Calculate forecasts for 7, 14, 30, 90 days
    const days = [7, 14, 30, 90];
    const forecasts = {};

    // Current balance calculation
    const daysSinceCreation = getDaysSince(deposit.created_at);
    let currentCalculatedBalance = deposit.amount;
    
    if (deposit.status === 'active') {
      if (deposit.bank === 'mama') {
        // Mama bank: 3.5% every 14 days
        const periodsCompleted = Math.floor(daysSinceCreation / 14);
        const ratePerPeriod = 0.035;
        
        currentCalculatedBalance = calculateCompoundInterest(deposit.amount, ratePerPeriod, periodsCompleted);
      } else if (deposit.bank === 'papa') {
        // Papa bank: 11% every 30 days
        const periodsCompleted = Math.floor(daysSinceCreation / 30);
        const ratePerPeriod = 0.11;
        
        currentCalculatedBalance = calculateCompoundInterest(deposit.amount, ratePerPeriod, periodsCompleted);
      }
    }

    forecasts.current_balance = parseFloat(currentCalculatedBalance.toFixed(2));

    // Calculate future values
    days.forEach(day => {
      let futureCalculatedBalance = deposit.amount;
      let totalDays = daysSinceCreation + day;

      if (deposit.status === 'active') {
        if (deposit.bank === 'mama') {
          // Mama bank: 3.5% every 14 days
          const periodsCompleted = Math.floor(totalDays / 14);
          const ratePerPeriod = 0.035;
          
          futureCalculatedBalance = calculateCompoundInterest(deposit.amount, ratePerPeriod, periodsCompleted);
        } else if (deposit.bank === 'papa') {
          // Papa bank: 11% every 30 days
          const periodsCompleted = Math.floor(totalDays / 30);
          const ratePerPeriod = 0.11;
          
          futureCalculatedBalance = calculateCompoundInterest(deposit.amount, ratePerPeriod, periodsCompleted);
        }
      }

      forecasts[`in_${day}_days`] = parseFloat(futureCalculatedBalance.toFixed(2));
    });

    res.json(forecasts);
  });
});

// Get statistics for a child
router.get('/stats/:childId', authenticate, (req, res) => {
  const childId = req.params.childId;

  // Check authorization
  if (req.user.role === 'child' && parseInt(childId) !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Check admin bank access
  if (req.user.role === 'mama-admin') {
    // Only get deposits from mama bank for this child
    db.get(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_invested,
        COUNT(*) as deposits_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_deposits
      FROM deposits
      WHERE child_id = ? AND bank = 'mama'
    `, [childId], (err, stats) => {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }

      // Calculate current balance for active deposits
      db.all(`
        SELECT d.*
        FROM deposits d
        WHERE d.child_id = ? AND d.bank = 'mama'
      `, [childId], (err, deposits) => {
        if (err) {
          return res.status(500).json({ error: 'Internal server error' });
        }

        let totalCurrent = 0;
        let totalInterestEarned = 0;

        deposits.forEach(deposit => {
          const daysSinceCreation = getDaysSince(deposit.created_at);
          let calculatedBalance = deposit.amount;

          if (deposit.status === 'active') {
            if (deposit.bank === 'mama') {
              // Mama bank: 3.5% every 14 days
              const periodsCompleted = Math.floor(daysSinceCreation / 14);
              const ratePerPeriod = 0.035;
              
              calculatedBalance = calculateCompoundInterest(deposit.amount, ratePerPeriod, periodsCompleted);
            }
          }

          if (deposit.status === 'active') {
            totalCurrent += calculatedBalance;
          }

          // Calculate interest earned
          if (deposit.status === 'active') {
            totalInterestEarned += (calculatedBalance - deposit.amount);
          } else if (deposit.status === 'closed') {
            // For closed deposits, use the final balance
            totalInterestEarned += (deposit.current_balance - deposit.amount);
          }
        });

        res.json({
          total_invested: parseFloat(stats.total_invested),
          total_current: parseFloat(totalCurrent.toFixed(2)),
          deposits_count: stats.deposits_count,
          active_deposits: stats.active_deposits,
          total_interest_earned: parseFloat(totalInterestEarned.toFixed(2))
        });
      });
    });
  } else if (req.user.role === 'papa-admin') {
    // Only get deposits from papa bank for this child
    db.get(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_invested,
        COUNT(*) as deposits_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_deposits
      FROM deposits
      WHERE child_id = ? AND bank = 'papa'
    `, [childId], (err, stats) => {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }

      // Calculate current balance for active deposits
      db.all(`
        SELECT d.*
        FROM deposits d
        WHERE d.child_id = ? AND d.bank = 'papa'
      `, [childId], (err, deposits) => {
        if (err) {
          return res.status(500).json({ error: 'Internal server error' });
        }

        let totalCurrent = 0;
        let totalInterestEarned = 0;

        deposits.forEach(deposit => {
          const daysSinceCreation = getDaysSince(deposit.created_at);
          let calculatedBalance = deposit.amount;

          if (deposit.status === 'active') {
            if (deposit.bank === 'papa') {
              // Papa bank: 11% every 30 days
              const periodsCompleted = Math.floor(daysSinceCreation / 30);
              const ratePerPeriod = 0.11;
              
              calculatedBalance = calculateCompoundInterest(deposit.amount, ratePerPeriod, periodsCompleted);
            }
          }

          if (deposit.status === 'active') {
            totalCurrent += calculatedBalance;
          }

          // Calculate interest earned
          if (deposit.status === 'active') {
            totalInterestEarned += (calculatedBalance - deposit.amount);
          } else if (deposit.status === 'closed') {
            // For closed deposits, use the final balance
            totalInterestEarned += (deposit.current_balance - deposit.amount);
          }
        });

        res.json({
          total_invested: parseFloat(stats.total_invested),
          total_current: parseFloat(totalCurrent.toFixed(2)),
          deposits_count: stats.deposits_count,
          active_deposits: stats.active_deposits,
          total_interest_earned: parseFloat(totalInterestEarned.toFixed(2))
        });
      });
    });
  } else {
    // Child user gets all their deposits
    db.get(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_invested,
        COUNT(*) as deposits_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_deposits
      FROM deposits
      WHERE child_id = ?
    `, [childId], (err, stats) => {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }

      // Calculate current balance for all deposits
      db.all(`
        SELECT d.*
        FROM deposits d
        WHERE d.child_id = ?
      `, [childId], (err, deposits) => {
        if (err) {
          return res.status(500).json({ error: 'Internal server error' });
        }

        let totalCurrent = 0;
        let totalInterestEarned = 0;

        deposits.forEach(deposit => {
          const daysSinceCreation = getDaysSince(deposit.created_at);
          let calculatedBalance = deposit.amount;

          if (deposit.status === 'active') {
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

          if (deposit.status === 'active') {
            totalCurrent += calculatedBalance;
          }

          // Calculate interest earned
          if (deposit.status === 'active') {
            totalInterestEarned += (calculatedBalance - deposit.amount);
          } else if (deposit.status === 'closed') {
            // For closed deposits, use the final balance
            totalInterestEarned += (deposit.current_balance - deposit.amount);
          }
        });

        res.json({
          total_invested: parseFloat(stats.total_invested),
          total_current: parseFloat(totalCurrent.toFixed(2)),
          deposits_count: stats.deposits_count,
          active_deposits: stats.active_deposits,
          total_interest_earned: parseFloat(totalInterestEarned.toFixed(2))
        });
      });
    });
  }
});

// Get overall statistics for admin
router.get('/overall-stats', authenticate, (req, res) => {
  // Only admins can access overall stats
  if (req.user.role !== 'mama-admin' && req.user.role !== 'papa-admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }

  let bankFilter = '';
  if (req.user.role === 'mama-admin') {
    bankFilter = "AND d.bank = 'mama'";
  } else if (req.user.role === 'papa-admin') {
    bankFilter = "AND d.bank = 'papa'";
  }

  // Query to get overall stats for the admin's bank
  db.get(`
    SELECT 
      COUNT(DISTINCT u.id) as total_children,
      COALESCE(SUM(d.amount), 0) as total_invested,
      COUNT(CASE WHEN o.status = 'pending' THEN 1 END) as pending_operations,
      COALESCE(SUM(il.interest_amount), 0) as total_interest_paid
    FROM users u
    LEFT JOIN deposits d ON u.id = d.child_id ${bankFilter}
    LEFT JOIN operations o ON d.id = o.deposit_id AND o.status = 'pending'
    LEFT JOIN interest_log il ON d.id = il.deposit_id
    WHERE u.role = 'child'
  `, (err, stats) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    res.json(stats);
  });
});

module.exports = router;