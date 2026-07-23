const express = require('express');
const { db } = require('../models/db');
const { requireAuth, requireGlobalAdmin } = require('../middleware/auth');
const router = express.Router();

// Get all bank settings
router.get('/', (req, res) => {
  db.all('SELECT * FROM bank_settings', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }
    const settings = {};
    rows.forEach(row => {
      settings[row.bank] = row;
    });
    res.json(settings);
  });
});

// Create a new bank profile (Super Admin only)
router.post('/', requireAuth, requireGlobalAdmin, (req, res) => {
  const { bank, display_name, interest_rate, period_days, min_amount, penalty_rate } = req.body;

  if (!bank || !display_name || interest_rate === undefined || period_days === undefined || min_amount === undefined || penalty_rate === undefined) {
    return res.status(400).json({ error: 'Все поля (bank, display_name, interest_rate, period_days, min_amount, penalty_rate) обязательны.' });
  }

  const bankKey = bank.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  if (!bankKey) {
    return res.status(400).json({ error: 'Идентификатор банка должен состоять из латинских букв и цифр.' });
  }

  const rateNum = parseFloat(interest_rate);
  const periodNum = parseInt(period_days);
  const minNum = parseFloat(min_amount);
  const penaltyNum = parseFloat(penalty_rate);

  if (isNaN(rateNum) || isNaN(periodNum) || isNaN(minNum) || isNaN(penaltyNum)) {
    return res.status(400).json({ error: 'Некорректные числовые значения.' });
  }

  db.run(`
    INSERT INTO bank_settings (bank, display_name, interest_rate, period_days, min_amount, penalty_rate)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [bankKey, display_name, rateNum, periodNum, minNum, penaltyNum], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Банк с таким идентификатором уже существует.' });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.status(201).json({ message: `Банк "${display_name}" успешно создан.`, bank: bankKey });
  });
});

// Update specific bank settings
router.put('/:bank', requireAuth, (req, res) => {
  const { bank } = req.params;
  const { interest_rate, period_days, min_amount, penalty_rate } = req.body;

  // Authorize:
  // - Global admin can change any bank settings
  if (req.user.platformRole !== 'global_admin') {
    return res.status(403).json({ error: 'Access denied. You can only configure bank settings as global admin.' });
  }

  // Validate fields
  if (interest_rate === undefined || period_days === undefined || min_amount === undefined || penalty_rate === undefined) {
    return res.status(400).json({ error: 'All fields (interest_rate, period_days, min_amount, penalty_rate) are required.' });
  }

  const rateNum = parseFloat(interest_rate);
  const periodNum = parseInt(period_days);
  const minNum = parseFloat(min_amount);
  const penaltyNum = parseFloat(penalty_rate);

  if (isNaN(rateNum) || isNaN(periodNum) || isNaN(minNum) || isNaN(penaltyNum)) {
    return res.status(400).json({ error: 'Invalid numeric value' });
  }

  // Fetch current bank display name
  db.get('SELECT display_name FROM bank_settings WHERE bank = ?', [bank], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Bank settings not found' });
    }

    const displayName = row.display_name;

    db.serialize(() => {
      // 1. Update the bank settings
      db.run(`
        UPDATE bank_settings
        SET interest_rate = ?, period_days = ?, min_amount = ?, penalty_rate = ?
        WHERE bank = ?
      `, [rateNum, periodNum, minNum, penaltyNum, bank], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Internal server error' });
        }

        // 2. Find all active deposits of this bank and set them to pending child approval for the rate change
        // We only set it if the rate or period is actually changing from what is currently running
        db.run(`
          UPDATE deposits
          SET pending_interest_rate = ?,
              pending_period_days = ?,
              pending_penalty_rate = ?,
              rate_change_status = 'pending_child_approval'
          WHERE bank = ? AND status = 'active' AND (interest_rate != ? OR period_days != ?)
        `, [rateNum, periodNum, penaltyNum, bank, rateNum, periodNum], function(err) {
          if (err) {
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({ 
            message: `Условия вкладов для "${displayName}" успешно обновлены. Изменения отправлены на подтверждение детям по активным вкладам.` 
          });
        });
      });
    });
  });
});

module.exports = router;
