const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE || path.join(__dirname, '../bank.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

const initDB = () => {
  // Create tables
  db.serialize(() => {
    // Drop existing tables to ensure schema matches perfectly
    db.run(`DROP TABLE IF EXISTS interest_log`);
    db.run(`DROP TABLE IF EXISTS operations`);
    db.run(`DROP TABLE IF EXISTS deposits`);
    db.run(`DROP TABLE IF EXISTS bank_settings`);
    db.run(`DROP TABLE IF EXISTS users`);

    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        parent_id INTEGER,
        bank TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES users(id)
      )
    `);

    // Deposits table
    db.run(`
      CREATE TABLE IF NOT EXISTS deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        child_id INTEGER NOT NULL,
        bank TEXT NOT NULL,
        amount REAL NOT NULL,
        current_balance REAL DEFAULT 0,
        interest_rate REAL NOT NULL,
        period_days INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_interest_calc DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
        pending_interest_rate REAL,
        pending_period_days INTEGER,
        pending_penalty_rate REAL,
        rate_change_status TEXT DEFAULT 'none',
        FOREIGN KEY (child_id) REFERENCES users(id)
      )
    `);

    // Operations table
    db.run(`
      CREATE TABLE IF NOT EXISTS operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deposit_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        approved_by INTEGER,
        FOREIGN KEY (deposit_id) REFERENCES deposits(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Interest log table
    db.run(`
      CREATE TABLE IF NOT EXISTS interest_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deposit_id INTEGER NOT NULL,
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        interest_amount REAL NOT NULL,
        new_balance REAL NOT NULL,
        FOREIGN KEY (deposit_id) REFERENCES deposits(id)
      )
    `);

    // Bank settings table
    db.run(`
      CREATE TABLE IF NOT EXISTS bank_settings (
        bank TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        interest_rate REAL NOT NULL,
        period_days INTEGER NOT NULL,
        min_amount REAL NOT NULL,
        penalty_rate REAL NOT NULL
      )
    `, () => {
      // Seed bank settings if empty
      db.get("SELECT * FROM bank_settings WHERE bank = 'mama'", (err, row) => {
        if (!row) {
          db.run(`
            INSERT INTO bank_settings (bank, display_name, interest_rate, period_days, min_amount, penalty_rate)
            VALUES ('mama', 'Мама-банк', 0.035, 14, 1000, 0.0)
          `);
        }
      });

      db.get("SELECT * FROM bank_settings WHERE bank = 'papa'", (err, row) => {
        if (!row) {
          db.run(`
            INSERT INTO bank_settings (bank, display_name, interest_rate, period_days, min_amount, penalty_rate)
            VALUES ('papa', 'Папа-банк', 0.11, 30, 2000, 0.02)
          `);
        }
      });

      db.get("SELECT * FROM bank_settings WHERE bank = 'babushka'", (err, row) => {
        if (!row) {
          db.run(`
            INSERT INTO bank_settings (bank, display_name, interest_rate, period_days, min_amount, penalty_rate)
            VALUES ('babushka', 'Бабушка-банк', 0.05, 10, 500, 0.01)
          `);
        }
      });
    });

    // Insert default admin users if they don't exist
    db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
      if (!row) {
        const hashedPassword = require('bcryptjs').hashSync('admin123', 10);
        db.run(`
          INSERT INTO users (username, password, name, role, bank) 
          VALUES (?, ?, ?, 'admin', NULL)
        `, ['admin', hashedPassword, 'Администратор']);
      }
    });

    db.get("SELECT * FROM users WHERE username = 'mama_admin'", (err, row) => {
      if (!row) {
        const hashedPassword = require('bcryptjs').hashSync('password123', 10);
        db.run(`
          INSERT INTO users (username, password, name, role, bank) 
          VALUES (?, ?, ?, 'bank-admin', 'mama')
        `, ['mama_admin', hashedPassword, 'Мама']);
      }
    });

    db.get("SELECT * FROM users WHERE username = 'papa_admin'", (err, row) => {
      if (!row) {
        const hashedPassword = require('bcryptjs').hashSync('password123', 10);
        db.run(`
          INSERT INTO users (username, password, name, role, bank) 
          VALUES (?, ?, ?, 'bank-admin', 'papa')
        `, ['papa_admin', hashedPassword, 'Папа']);
      }
    });
  });
};

module.exports = { db, initDB };