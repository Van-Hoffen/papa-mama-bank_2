const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DATABASE || path.join(__dirname, '../bank.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Promisified Helpers
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const initDB = async () => {
  try {
    console.log('Initializing database tables...');
    
    // Drop legacy single-family tables to ensure smooth migration
    await dbRun(`DROP TABLE IF EXISTS interest_log`);
    await dbRun(`DROP TABLE IF EXISTS operations_legacy`); // temporary backup
    
    // Create new Multi-Family Schema
    
    // 1. Users Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        email_normalized TEXT UNIQUE,
        username TEXT,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        platform_role TEXT NOT NULL CHECK(platform_role IN ('global_admin', 'user')),
        email_verified_at DATETIME,
        must_change_password BOOLEAN DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending_email_verification' CHECK(status IN ('pending_email_verification', 'active', 'blocked', 'deleted')),
        verification_token TEXT,
        verification_expires_at DATETIME,
        reset_password_token TEXT,
        reset_password_expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME
      )
    `);

    // 2. Families Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS families (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
        currency_code TEXT NOT NULL DEFAULT 'RUB',
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending', 'active', 'blocked', 'deleted')),
        created_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )
    `);

    // 3. Family Members Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS family_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('family_admin', 'child')),
        child_profile_id INTEGER,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(family_id, user_id),
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 4. Child Profiles Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS child_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL,
        user_id INTEGER UNIQUE NOT NULL,
        birth_date TEXT,
        avatar_color TEXT,
        created_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 5. Banks Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS banks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        icon TEXT,
        interest_rate_bps INTEGER NOT NULL CHECK(interest_rate_bps >= 0),
        period_days INTEGER NOT NULL CHECK(period_days > 0),
        minimum_deposit_kopecks INTEGER NOT NULL CHECK(minimum_deposit_kopecks >= 0),
        maximum_deposit_per_child_kopecks INTEGER,
        early_withdrawal_penalty_bps INTEGER NOT NULL DEFAULT 0,
        minimum_holding_days INTEGER NOT NULL DEFAULT 0,
        early_withdrawal_interest_policy TEXT DEFAULT 'keep_earned_interest',
        allow_top_up BOOLEAN DEFAULT 1,
        minimum_top_up_kopecks INTEGER,
        maximum_top_up_kopecks INTEGER,
        maximum_total_deposit_per_child_kopecks INTEGER,
        interest_accrual_mode TEXT DEFAULT 'whole_balance_on_schedule',
        is_active BOOLEAN DEFAULT 1,
        created_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(family_id, slug),
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
      )
    `);

    // 6. Deposits Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL,
        bank_id INTEGER NOT NULL,
        child_profile_id INTEGER NOT NULL,
        principal_kopecks INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_open' CHECK(status IN ('pending_open', 'active', 'pending_close', 'closed', 'rejected')),
        approved_at DATETIME,
        closed_at DATETIME,
        locked_interest_rate_bps INTEGER NOT NULL,
        locked_period_days INTEGER NOT NULL,
        locked_minimum_holding_days INTEGER NOT NULL DEFAULT 0,
        locked_penalty_bps INTEGER NOT NULL DEFAULT 0,
        locked_minimum_deposit_kopecks INTEGER NOT NULL,
        locked_early_withdrawal_interest_policy TEXT DEFAULT 'keep_earned_interest',
        locked_interest_accrual_mode TEXT DEFAULT 'whole_balance_on_schedule',
        goal_title TEXT,
        goal_target_kopecks INTEGER,
        goal_icon TEXT,
        goal_note TEXT,
        goal_due_date TEXT,
        rate_change_status TEXT NOT NULL DEFAULT 'not_required' CHECK(rate_change_status IN ('not_required', 'pending_child_approval', 'accepted', 'rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
        FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE,
        FOREIGN KEY (child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE
      )
    `);

    // Schema Migrations (in case table already existed without these columns)
    try {
      await dbRun(`ALTER TABLE banks ADD COLUMN early_withdrawal_interest_policy TEXT DEFAULT 'keep_earned_interest'`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE banks ADD COLUMN allow_top_up BOOLEAN DEFAULT 1`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE banks ADD COLUMN minimum_top_up_kopecks INTEGER`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE banks ADD COLUMN maximum_top_up_kopecks INTEGER`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE banks ADD COLUMN maximum_total_deposit_per_child_kopecks INTEGER`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE banks ADD COLUMN interest_accrual_mode TEXT DEFAULT 'whole_balance_on_schedule'`);
    } catch (e) {}

    try {
      await dbRun(`ALTER TABLE deposits ADD COLUMN locked_early_withdrawal_interest_policy TEXT DEFAULT 'keep_earned_interest'`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE deposits ADD COLUMN locked_interest_accrual_mode TEXT DEFAULT 'whole_balance_on_schedule'`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE deposits ADD COLUMN goal_title TEXT`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE deposits ADD COLUMN goal_target_kopecks INTEGER`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE deposits ADD COLUMN goal_icon TEXT`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE deposits ADD COLUMN goal_note TEXT`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE deposits ADD COLUMN goal_due_date TEXT`);
    } catch (e) {}

    // 11. Deposit Contributions Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS deposit_contributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL,
        deposit_id INTEGER NOT NULL,
        child_profile_id INTEGER NOT NULL,
        bank_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('initial', 'top_up', 'parent_reward')),
        amount_kopecks INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('approved', 'pending', 'rejected')),
        requested_by_user_id INTEGER NOT NULL,
        approved_by_user_id INTEGER,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        rejected_at DATETIME,
        rejection_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
        FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE CASCADE,
        FOREIGN KEY (child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
      )
    `);

    // 7. Operations Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL,
        deposit_id INTEGER,
        child_profile_id INTEGER NOT NULL,
        bank_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('open', 'top_up', 'withdraw', 'penalty', 'rate_change', 'parent_reward')),
        amount_kopecks INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'system_completed')),
        requested_by_user_id INTEGER NOT NULL,
        decided_by_user_id INTEGER,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        decided_at DATETIME,
        notes TEXT,
        metadata_json TEXT,
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
        FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE SET NULL,
        FOREIGN KEY (child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE,
        FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Self-healing migrations for existing database files (updating check constraints)
    try {
      await dbRun('BEGIN TRANSACTION');
      let needsMigrationCont = false;
      try {
        await dbRun(`
          INSERT INTO deposit_contributions (id, family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status, requested_by_user_id)
          VALUES (-999, -999, -999, -999, -999, 'parent_reward', 0, 'approved', -999)
        `);
      } catch (err) {
        if (err.message.includes('CHECK constraint failed')) {
          needsMigrationCont = true;
        }
      }
      await dbRun('ROLLBACK');

      if (needsMigrationCont) {
        console.log('Migrating deposit_contributions to support parent_reward type...');
        await dbRun('PRAGMA foreign_keys=OFF');
        await dbRun('BEGIN TRANSACTION');
        await dbRun('ALTER TABLE deposit_contributions RENAME TO deposit_contributions_old');
        await dbRun(`
          CREATE TABLE deposit_contributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id INTEGER NOT NULL,
            deposit_id INTEGER NOT NULL,
            child_profile_id INTEGER NOT NULL,
            bank_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('initial', 'top_up', 'parent_reward')),
            amount_kopecks INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('approved', 'pending', 'rejected')),
            requested_by_user_id INTEGER NOT NULL,
            approved_by_user_id INTEGER,
            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            approved_at DATETIME,
            rejected_at DATETIME,
            rejection_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
            FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE CASCADE,
            FOREIGN KEY (child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE,
            FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
          )
        `);
        await dbRun(`
          INSERT INTO deposit_contributions (
            id, family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status,
            requested_by_user_id, approved_by_user_id, requested_at, approved_at, rejected_at,
            rejection_reason, created_at, updated_at
          )
          SELECT id, family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status,
                 requested_by_user_id, approved_by_user_id, requested_at, approved_at, rejected_at,
                 rejection_reason, created_at, updated_at
          FROM deposit_contributions_old
        `);
        await dbRun('DROP TABLE deposit_contributions_old');
        await dbRun('COMMIT');
        await dbRun('PRAGMA foreign_keys=ON');
        console.log('Successfully migrated deposit_contributions.');
      }
    } catch (e) {
      console.error('Error migrating deposit_contributions check constraints:', e);
      try { await dbRun('ROLLBACK'); } catch (_) {}
    }

    try {
      await dbRun('BEGIN TRANSACTION');
      let needsMigrationOps = false;
      try {
        await dbRun(`
          INSERT INTO operations (id, family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status, requested_by_user_id)
          VALUES (-999, -999, -999, -999, -999, 'parent_reward', 0, 'approved', -999)
        `);
      } catch (err) {
        if (err.message.includes('CHECK constraint failed')) {
          needsMigrationOps = true;
        }
      }
      await dbRun('ROLLBACK');

      if (needsMigrationOps) {
        console.log('Migrating operations to support parent_reward type...');
        await dbRun('PRAGMA foreign_keys=OFF');
        await dbRun('BEGIN TRANSACTION');
        await dbRun('ALTER TABLE operations RENAME TO operations_old');
        await dbRun(`
          CREATE TABLE operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id INTEGER NOT NULL,
            deposit_id INTEGER,
            child_profile_id INTEGER NOT NULL,
            bank_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('open', 'top_up', 'withdraw', 'penalty', 'rate_change', 'parent_reward')),
            amount_kopecks INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'system_completed')),
            requested_by_user_id INTEGER NOT NULL,
            decided_by_user_id INTEGER,
            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            decided_at DATETIME,
            notes TEXT,
            metadata_json TEXT,
            FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
            FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE SET NULL,
            FOREIGN KEY (child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE,
            FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE,
            FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
          )
        `);
        await dbRun(`
          INSERT INTO operations (
            id, family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status,
            requested_by_user_id, decided_by_user_id, requested_at, decided_at, notes, metadata_json
          )
          SELECT id, family_id, deposit_id, child_profile_id, bank_id, type, amount_kopecks, status,
                 requested_by_user_id, decided_by_user_id, requested_at, decided_at, notes, metadata_json
          FROM operations_old
        `);
        await dbRun('DROP TABLE operations_old');
        await dbRun('COMMIT');
        await dbRun('PRAGMA foreign_keys=ON');
        console.log('Successfully migrated operations.');
      }
    } catch (e) {
      console.error('Error migrating operations check constraints:', e);
      try { await dbRun('ROLLBACK'); } catch (_) {}
    }

    // 8. Rate Change Proposals Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS rate_change_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL,
        deposit_id INTEGER NOT NULL,
        bank_id INTEGER NOT NULL,
        old_interest_rate_bps INTEGER NOT NULL,
        old_period_days INTEGER NOT NULL,
        old_penalty_bps INTEGER NOT NULL,
        new_interest_rate_bps INTEGER NOT NULL,
        new_period_days INTEGER NOT NULL,
        new_penalty_bps INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_child_approval' CHECK(status IN ('pending_child_approval', 'accepted', 'rejected', 'expired')),
        created_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        responded_at DATETIME,
        expires_at DATETIME,
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
        FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE CASCADE,
        FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 9. Invitations Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL,
        email_normalized TEXT NOT NULL,
        invitee_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'family_admin' CHECK(role IN ('family_admin')),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        accepted_at DATETIME,
        revoked_at DATETIME,
        created_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 10. Audit Logs Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER,
        actor_user_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        reason TEXT,
        metadata_json TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // 12. Notifications Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL,
        recipient_user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        operation_id INTEGER,
        is_read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME,
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE SET NULL
      )
    `);

    console.log('All tables created successfully. Seeding database...');

    // Seed Global Admin
    const globalAdminEmail = 'platform-admin@example.test';
    const globalAdminExist = await dbGet(`SELECT * FROM users WHERE email_normalized = ?`, [globalAdminEmail]);
    if (!globalAdminExist) {
      const passwordHash = bcrypt.hashSync('ChangeMe123!', 10);
      await dbRun(`
        INSERT INTO users (email, email_normalized, password_hash, display_name, platform_role, email_verified_at, status)
        VALUES (?, ?, ?, ?, 'global_admin', datetime('now'), 'active')
      `, [globalAdminEmail, globalAdminEmail, passwordHash, 'Глобальный администратор']);
      console.log('Seeded global_admin successfully.');
    }

    // Seed "Семья Ивановых"
    const familySlug = 'ivanov';
    let family = await dbGet(`SELECT * FROM families WHERE slug = ?`, [familySlug]);
    if (!family) {
      const familyRes = await dbRun(`
        INSERT INTO families (name, slug, timezone, currency_code, status)
        VALUES (?, ?, ?, 'RUB', 'active')
      `, ['Семья Ивановых', familySlug, 'Europe/Moscow']);
      family = { id: familyRes.lastID, slug: familySlug, timezone: 'Europe/Moscow' };
      console.log('Seeded Семья Ивановых successfully.');
    }

    // Seed Family Admin: ivanov.parent@example.test
    const parentEmail = 'ivanov.parent@example.test';
    let parentUser = await dbGet(`SELECT * FROM users WHERE email_normalized = ?`, [parentEmail]);
    if (!parentUser) {
      const passwordHash = bcrypt.hashSync('FamilyAdmin123!', 10);
      const userRes = await dbRun(`
        INSERT INTO users (email, email_normalized, password_hash, display_name, platform_role, email_verified_at, status)
        VALUES (?, ?, ?, ?, 'user', datetime('now'), 'active')
      `, [parentEmail, parentEmail, passwordHash, 'Папа Иванов']);
      parentUser = { id: userRes.lastID, email: parentEmail };
      
      // Associate with Семья Ивановых
      await dbRun(`
        INSERT OR IGNORE INTO family_members (family_id, user_id, role)
        VALUES (?, ?, 'family_admin')
      `, [family.id, parentUser.id]);
      console.log('Seeded parent user and associated as family_admin.');
    }

    // Seed Children
    const childrenData = [
      { username: 'masha', display_name: 'Маша', birth_date: '2016-04-12', avatar_color: '#f43f5e' },
      { username: 'petya', display_name: 'Петя', birth_date: '2014-08-25', avatar_color: '#3b82f6' }
    ];

    for (const child of childrenData) {
      const childUsernameCombined = `${familySlug}_${child.username}`;
      let childUser = await dbGet(`SELECT * FROM users WHERE username = ?`, [childUsernameCombined]);
      if (!childUser) {
        const passwordHash = bcrypt.hashSync('Child123!', 10);
        // Children do not have email
        const childRes = await dbRun(`
          INSERT INTO users (username, password_hash, display_name, platform_role, status, must_change_password)
          VALUES (?, ?, ?, 'user', 'active', 0)
        `, [childUsernameCombined, passwordHash, child.display_name]);
        childUser = { id: childRes.lastID };

        // Create child profile
        const profileRes = await dbRun(`
          INSERT INTO child_profiles (family_id, user_id, birth_date, avatar_color, created_by_user_id)
          VALUES (?, ?, ?, ?, ?)
        `, [family.id, childUser.id, child.birth_date, child.avatar_color, parentUser.id]);

        // Associate with family
        await dbRun(`
          INSERT INTO family_members (family_id, user_id, role, child_profile_id)
          VALUES (?, ?, 'child', ?)
        `, [family.id, childUser.id, profileRes.lastID]);
        console.log(`Seeded child ${child.display_name} successfully.`);
      }
    }

    // Seed Banks for Семья Ивановых
    const banksData = [
      {
        slug: 'mama',
        name: 'Мамин банк',
        description: 'Уютный банк от мамы. Быстрые выплаты и стабильный доход.',
        color: '#ec4899',
        icon: 'heart',
        interest_rate_bps: 400, // 4%
        period_days: 14,
        minimum_deposit_kopecks: 100000, // 1000 rubles
        maximum_deposit_per_child_kopecks: 5000000, // 50,000 rubles
        early_withdrawal_penalty_bps: 0, // 0%
        minimum_holding_days: 7,
        early_withdrawal_interest_policy: 'keep_earned_interest'
      },
      {
        slug: 'papa',
        name: 'Папин банк',
        description: 'Серьезный банк с высокой доходностью, но есть штраф за досрочный вывод.',
        color: '#2563eb',
        icon: 'briefcase',
        interest_rate_bps: 1300, // 13%
        period_days: 30,
        minimum_deposit_kopecks: 200000, // 2000 rubles
        maximum_deposit_per_child_kopecks: 10000000, // 100,000 rubles
        early_withdrawal_penalty_bps: 200, // 2%
        minimum_holding_days: 15,
        early_withdrawal_interest_policy: 'lose_all_interest'
      }
    ];

    for (const bank of banksData) {
      const bankExist = await dbGet(`SELECT * FROM banks WHERE family_id = ? AND slug = ?`, [family.id, bank.slug]);
      if (!bankExist) {
        await dbRun(`
          INSERT INTO banks (
            family_id, slug, name, description, color, icon, 
            interest_rate_bps, period_days, minimum_deposit_kopecks, 
            maximum_deposit_per_child_kopecks, early_withdrawal_penalty_bps, 
            minimum_holding_days, early_withdrawal_interest_policy, is_active, created_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `, [
          family.id, bank.slug, bank.name, bank.description, bank.color, bank.icon,
          bank.interest_rate_bps, bank.period_days, bank.minimum_deposit_kopecks,
          bank.maximum_deposit_per_child_kopecks, bank.early_withdrawal_penalty_bps,
          bank.minimum_holding_days, bank.early_withdrawal_interest_policy, parentUser.id
        ]);
        console.log(`Seeded bank ${bank.name} for Семья Ивановых.`);
      }
    }

    // Safe Backfill/Migration of existing deposits to populate initial contributions
    try {
      const deposits = await dbAll(`
        SELECT d.*, cp.user_id AS child_user_id 
        FROM deposits d
        JOIN child_profiles cp ON d.child_profile_id = cp.id
      `);
      for (const dep of deposits) {
        if (dep.status === 'pending_open') {
          continue;
        }

        const existingInitial = await dbGet(`
          SELECT * FROM deposit_contributions 
          WHERE deposit_id = ? AND type = 'initial'
        `, [dep.id]);

        if (!existingInitial) {
          console.log(`Backfilling initial contribution for deposit ID ${dep.id}...`);
          
          const familyAdmin = await dbGet(`
            SELECT user_id FROM family_members 
            WHERE family_id = ? AND role = 'family_admin' 
            LIMIT 1
          `, [dep.family_id]);
          const approverId = familyAdmin ? familyAdmin.user_id : dep.child_user_id;

          const approvedAt = dep.approved_at || dep.created_at;

          await dbRun(`
            INSERT INTO deposit_contributions (
              family_id, deposit_id, child_profile_id, bank_id, type, 
              amount_kopecks, status, requested_by_user_id, approved_by_user_id, 
              requested_at, approved_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'initial', ?, 'approved', ?, ?, ?, ?, ?, ?)
          `, [
            dep.family_id,
            dep.id,
            dep.child_profile_id,
            dep.bank_id,
            dep.principal_kopecks,
            dep.child_user_id,
            approverId,
            dep.created_at,
            approvedAt,
            dep.created_at,
            approvedAt
          ]);
          console.log(`Successfully backfilled initial contribution for deposit ID ${dep.id}`);
        }
      }
    } catch (err) {
      console.error('Error during deposit contributions safe backfill migration:', err);
    }

    console.log('Seeding finished successfully.');

  } catch (error) {
    console.error('Error initializing/seeding database:', error);
  }
};

module.exports = {
  db,
  initDB,
  dbRun,
  dbGet,
  dbAll
};
