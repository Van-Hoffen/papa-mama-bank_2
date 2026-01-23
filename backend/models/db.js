const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

const initDB = () => {
  // Open database connection
  db = new sqlite3.Database(process.env.DATABASE || './bank.db', (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    } else {
      console.log('Connected to SQLite database');
    }
  });

  // Create tables
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT CHECK(role IN ('mama-admin', 'papa-admin', 'child')) NOT NULL,
        parent_id INTEGER,
        bank TEXT CHECK(bank IN ('mama', 'papa', NULL)),
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
        status TEXT CHECK(status IN ('active', 'closed', 'pending')) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_interest_calc DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
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
        status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
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

    // Insert default admin users if they don't exist
    db.get("SELECT * FROM users WHERE username = 'mama_admin'", (err, row) => {
      if (!row) {
        const hashedPassword = require('bcryptjs').hashSync('password123', 10);
        db.run(`
          INSERT INTO users (username, password, name, role, bank) 
          VALUES (?, ?, ?, 'mama-admin', 'mama')
        `, ['mama_admin', hashedPassword, 'Мама']);
      }
    });

    db.get("SELECT * FROM users WHERE username = 'papa_admin'", (err, row) => {
      if (!row) {
        const hashedPassword = require('bcryptjs').hashSync('password123', 10);
        db.run(`
          INSERT INTO users (username, password, name, role, bank) 
          VALUES (?, ?, ?, 'papa-admin', 'papa')
        `, ['papa_admin', hashedPassword, 'Папа']);
      }
    });
  });
};

module.exports = { db, initDB };