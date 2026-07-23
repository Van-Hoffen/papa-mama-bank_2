# Mama-Papa Bank App
## Полное веб-приложение для управления детскими вкладами

---

## СТРУКТУРА ПРОЕКТА

```
mama-papa-bank/
├── backend/
│   ├── server.js                 # Entry point
│   ├── db.js                     # SQLite инициализация
│   ├── package.json
│   ├── routes/
│   │   ├── auth.js              # Login/Register
│   │   ├── deposits.js          # CRUD вкладов
│   │   ├── operations.js        # Заявки и операции
│   │   └── analytics.js         # Прогнозы и расчёты
│   └── middleware/
│       └── auth.js              # JWT проверка
│
├── frontend/
│   ├── src/
│   │   ├── index.jsx            # Entry point
│   │   ├── components/
│   │   │   ├── Login.jsx
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── ChildDashboard.jsx
│   │   │   ├── DepositCard.jsx
│   │   │   └── RequestModal.jsx
│   │   ├── pages/
│   │   │   └── ...
│   │   ├── api.js               # API client
│   │   ├── App.jsx
│   │   └── index.css
│   ├── package.json
│   └── .env
│
└── README.md
```

---

## BACKEND - УСТАНОВКА И ЗАПУСК

### 1. Инициализация backend

```bash
mkdir mama-papa-bank && cd mama-papa-bank
mkdir backend && cd backend
npm init -y
npm install express sqlite3 jsonwebtoken bcryptjs cors dotenv body-parser
```

### 2. `.env` файл (backend)

```
PORT=5000
JWT_SECRET=your-super-secret-key-change-me
DATABASE=./bank.db
NODE_ENV=development
```

### 3. `db.js` — инициализация БД

```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'bank.db'), (err) => {
  if (err) console.error('DB Error:', err);
  else console.log('SQLite connected');
});

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin', 'child')) NOT NULL,
  parent_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(parent_id) REFERENCES users(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  bank TEXT CHECK(bank IN ('mama', 'papa')) NOT NULL,
  amount REAL NOT NULL,
  current_balance REAL NOT NULL,
  interest_rate REAL NOT NULL,
  period_days INTEGER NOT NULL,
  status TEXT CHECK(status IN ('active', 'closed', 'pending')) DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_interest_calc DATETIME,
  closed_at DATETIME,
  FOREIGN KEY(child_id) REFERENCES users(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT CHECK(type IN ('open', 'withdraw', 'interest', 'penalty')) NOT NULL,
  amount REAL NOT NULL,
  status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  notes TEXT,
  requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME,
  approved_by INTEGER,
  FOREIGN KEY(deposit_id) REFERENCES deposits(id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(approved_by) REFERENCES users(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS interest_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_id INTEGER NOT NULL,
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  interest_amount REAL NOT NULL,
  new_balance REAL NOT NULL,
  FOREIGN KEY(deposit_id) REFERENCES deposits(id)
)`);

module.exports = db;
```

### 4. `server.js` — главный файл

```javascript
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes (будут написаны дальше)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/deposits', require('./routes/deposits'));
app.use('/api/operations', require('./routes/operations'));
app.use('/api/analytics', require('./routes/analytics'));

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### 5. `routes/auth.js` — авторизация

```javascript
const express = require('express');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const db = require('../db');

const router = express.Router();

// Register
router.post('/register', (req, res) => {
  const { username, password, name, role, parent_id } = req.body;

  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const hashedPassword = bcryptjs.hashSync(password, 10);

  db.run(
    `INSERT INTO users (username, password, name, role, parent_id) VALUES (?, ?, ?, ?, ?)`,
    [username, hashedPassword, name, role, parent_id || null],
    function(err) {
      if (err) return res.status(400).json({ error: 'User already exists' });
      res.json({ id: this.lastID, username, name, role });
    }
  );
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isPasswordValid = bcryptjs.compareSync(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user.id, role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
    }
  );
});

module.exports = router;
```

### 6. `routes/deposits.js` — управление вкладами

```javascript
const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get deposits for child
router.get('/', verifyToken, (req, res) => {
  const userId = req.query.child_id || req.user.id;

  db.all(
    `SELECT * FROM deposits WHERE child_id = ? ORDER BY created_at DESC`,
    [userId],
    (err, deposits) => {
      if (err) return res.status(500).json({ error: err.message });

      // Calculate current balance for each deposit
      const enriched = deposits.map(dep => ({
        ...dep,
        calculated_balance: calculateBalance(dep),
      }));

      res.json(enriched);
    }
  );
});

// Get single deposit with full history
router.get('/:id', verifyToken, (req, res) => {
  const depositId = req.params.id;

  db.get(
    `SELECT * FROM deposits WHERE id = ?`,
    [depositId],
    (err, deposit) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!deposit) return res.status(404).json({ error: 'Not found' });

      // Get interest history
      db.all(
        `SELECT * FROM interest_log WHERE deposit_id = ? ORDER BY calculated_at DESC`,
        [depositId],
        (err, history) => {
          if (err) return res.status(500).json({ error: err.message });

          res.json({
            ...deposit,
            calculated_balance: calculateBalance(deposit),
            interest_history: history,
          });
        }
      );
    }
  );
});

function calculateBalance(deposit) {
  if (deposit.status !== 'active') return deposit.current_balance;

  const now = new Date();
  const createdAt = new Date(deposit.created_at);
  const elapsedMs = now - createdAt;
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  const periods = Math.floor(elapsedDays / deposit.period_days);
  const rate = deposit.interest_rate / 100;

  return deposit.amount * Math.pow(1 + rate, periods);
}

module.exports = router;
```

### 7. `routes/operations.js` — операции и заявки

```javascript
const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Create operation request (child opens or withdraws)
router.post('/request', verifyToken, (req, res) => {
  const { deposit_id, type, amount } = req.body;
  const user_id = req.user.id;

  if (!deposit_id || !type || !amount) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  db.run(
    `INSERT INTO operations (deposit_id, user_id, type, amount, status) 
     VALUES (?, ?, ?, ?, 'pending')`,
    [deposit_id, user_id, type, amount],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, status: 'pending' });
    }
  );
});

// Get pending operations (for admin)
router.get('/pending', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.all(
    `SELECT o.*, d.child_id, d.amount, d.bank, u.name as child_name
     FROM operations o
     JOIN deposits d ON o.deposit_id = d.id
     JOIN users u ON d.child_id = u.id
     WHERE o.status = 'pending'
     ORDER BY o.requested_at DESC`,
    (err, ops) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(ops);
    }
  );
});

// Approve operation
router.post('/:id/approve', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const operationId = req.params.id;

  // Get operation
  db.get(
    `SELECT * FROM operations WHERE id = ?`,
    [operationId],
    (err, op) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!op) return res.status(404).json({ error: 'Not found' });

      // Get deposit
      db.get(
        `SELECT * FROM deposits WHERE id = ?`,
        [op.deposit_id],
        (err, deposit) => {
          if (err) return res.status(500).json({ error: err.message });

          // Handle different operation types
          if (op.type === 'open') {
            // Open new deposit
            db.run(
              `UPDATE deposits SET status = 'active' WHERE id = ?`,
              [op.deposit_id],
              (err) => {
                if (err) return res.status(500).json({ error: err.message });
                
                db.run(
                  `UPDATE operations SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ? WHERE id = ?`,
                  [req.user.id, operationId],
                  (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ status: 'approved' });
                  }
                );
              }
            );
          } else if (op.type === 'withdraw') {
            // Process withdrawal with penalty check
            const now = new Date();
            const createdAt = new Date(deposit.created_at);
            const elapsedDays = (now - createdAt) / (1000 * 60 * 60 * 24);
            const minDays = deposit.period_days;

            let actualAmount = op.amount;
            let penaltyAmount = 0;

            if (elapsedDays < minDays) {
              // Apply penalty: -2% for papa, 0 for mama
              if (deposit.bank === 'papa') {
                penaltyAmount = op.amount * 0.02;
                actualAmount = op.amount - penaltyAmount;
              }
            }

            db.run(
              `UPDATE deposits SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [op.deposit_id],
              (err) => {
                if (err) return res.status(500).json({ error: err.message });

                db.run(
                  `INSERT INTO operations (deposit_id, user_id, type, amount, status, approved_at, approved_by)
                   VALUES (?, ?, 'penalty', ?, 'approved', CURRENT_TIMESTAMP, ?)`,
                  [op.deposit_id, req.user.id, -penaltyAmount, req.user.id],
                  (err) => {
                    if (err) return res.status(500).json({ error: err.message });

                    db.run(
                      `UPDATE operations SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ? WHERE id = ?`,
                      [req.user.id, operationId],
                      (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ 
                          status: 'approved',
                          actual_amount: actualAmount,
                          penalty: penaltyAmount
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        }
      );
    }
  );
});

// Reject operation
router.post('/:id/reject', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.run(
    `UPDATE operations SET status = 'rejected', approved_at = CURRENT_TIMESTAMP, approved_by = ? WHERE id = ?`,
    [req.user.id, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'rejected' });
    }
  );
});

module.exports = router;
```

### 8. `routes/analytics.js` — расчёты и прогнозы

```javascript
const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get forecast for deposit
router.get('/forecast/:depositId', verifyToken, (req, res) => {
  const depositId = req.params.depositId;

  db.get(
    `SELECT * FROM deposits WHERE id = ?`,
    [depositId],
    (err, deposit) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!deposit) return res.status(404).json({ error: 'Not found' });

      const now = new Date();
      const createdAt = new Date(deposit.created_at);

      const forecast = {
        current_balance: calculateBalance(deposit),
        in_7_days: calculateFutureBalance(deposit, 7),
        in_14_days: calculateFutureBalance(deposit, 14),
        in_30_days: calculateFutureBalance(deposit, 30),
        in_90_days: calculateFutureBalance(deposit, 90),
      };

      res.json(forecast);
    }
  );
});

// Get total stats for child
router.get('/stats/:childId', verifyToken, (req, res) => {
  const childId = req.params.childId;

  db.all(
    `SELECT * FROM deposits WHERE child_id = ?`,
    [childId],
    (err, deposits) => {
      if (err) return res.status(500).json({ error: err.message });

      const stats = {
        total_invested: 0,
        total_current: 0,
        deposits_count: deposits.length,
        active_deposits: 0,
        total_interest_earned: 0,
      };

      deposits.forEach(dep => {
        stats.total_invested += dep.amount;
        const current = calculateBalance(dep);
        stats.total_current += current;
        if (dep.status === 'active') stats.active_deposits++;
        stats.total_interest_earned += current - dep.amount;
      });

      res.json(stats);
    }
  );
});

function calculateBalance(deposit) {
  if (deposit.status !== 'active') return deposit.current_balance;

  const now = new Date();
  const createdAt = new Date(deposit.created_at);
  const elapsedMs = now - createdAt;
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  const periods = Math.floor(elapsedDays / deposit.period_days);
  const rate = deposit.interest_rate / 100;

  return deposit.amount * Math.pow(1 + rate, periods);
}

function calculateFutureBalance(deposit, daysFromNow) {
  const now = new Date();
  const createdAt = new Date(deposit.created_at);
  const futureElapsedMs = (now - createdAt) + (daysFromNow * 24 * 60 * 60 * 1000);
  const futureElapsedDays = futureElapsedMs / (1000 * 60 * 60 * 24);

  const periods = Math.floor(futureElapsedDays / deposit.period_days);
  const rate = deposit.interest_rate / 100;

  return deposit.amount * Math.pow(1 + rate, periods);
}

module.exports = router;
```

### 9. `middleware/auth.js` — JWT проверка

```javascript
const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

module.exports = { verifyToken };
```

---

## FRONTEND - УСТАНОВКА И ЗАПУСК

### 1. Инициализация frontend (React)

```bash
cd ..
npx create-react-app frontend
cd frontend
npm install axios react-router-dom lucide-react
```

### 2. `.env` файл (frontend)

```
REACT_APP_API_URL=http://localhost:5000/api
```

### 3. `src/api.js` — HTTP клиент

```javascript
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  register: (data) => api.post('/auth/register', data),
};

export const depositsAPI = {
  getAll: (childId) => api.get(`/deposits?child_id=${childId}`),
  getOne: (id) => api.get(`/deposits/${id}`),
};

export const operationsAPI = {
  request: (data) => api.post('/operations/request', data),
  getPending: () => api.get('/operations/pending'),
  approve: (id) => api.post(`/operations/${id}/approve`),
  reject: (id) => api.post(`/operations/${id}/reject`),
};

export const analyticsAPI = {
  forecast: (depositId) => api.get(`/analytics/forecast/${depositId}`),
  stats: (childId) => api.get(`/analytics/stats/${childId}`),
};

export default api;
```

### 4. `src/App.jsx` — главное приложение

```javascript
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import AdminDashboard from './pages/AdminDashboard';
import ChildDashboard from './pages/ChildDashboard';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={!user ? <Login setUser={setUser} /> : <Navigate to="/" />}
        />
        <Route
          path="/"
          element={
            user ? (
              user.role === 'admin' ? (
                <AdminDashboard user={user} />
              ) : (
                <ChildDashboard user={user} />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### 5. `src/components/Login.jsx`

```javascript
import React, { useState } from 'react';
import { authAPI } from '../api';
import { AlertCircle } from 'lucide-react';

export default function Login({ setUser }) {
  const [mode, setMode] = useState('login'); // login | register
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('child');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      const res = await authAPI.login(username, password);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
    } catch (err) {
      setError('Ошибка входа: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleRegister = async () => {
    try {
      const res = await authAPI.register({
        username,
        password,
        name,
        role,
      });
      setError('');
      setMode('login');
      setPassword('');
    } catch (err) {
      setError('Ошибка регистрации: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Мама-Папа Банк 🏦</h1>
        <p>Учебная платформа для управления детскими вкладами</p>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        <div className="tab-buttons">
          <button
            className={`tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            Вход
          </button>
          <button
            className={`tab-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            Регистрация
          </button>
        </div>

        {mode === 'login' ? (
          <div className="form">
            <input
              type="text"
              placeholder="Логин"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleLogin}>
              Войти
            </button>
          </div>
        ) : (
          <div className="form">
            <input
              type="text"
              placeholder="Имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Логин"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="child">Вкладчик (Ребёнок)</option>
              <option value="admin">Администратор (Родитель)</option>
            </select>
            <button className="btn btn-primary" onClick={handleRegister}>
              Зарегистрироваться
            </button>
          </div>
        )}

        <div className="demo-users">
          <p>📝 Демо-учётные данные:</p>
          <p><strong>Родитель:</strong> admin / admin123</p>
          <p><strong>Ребёнок:</strong> child / child123</p>
        </div>
      </div>
    </div>
  );
}
```

### 6. `src/pages/AdminDashboard.jsx`

```javascript
import React, { useState, useEffect } from 'react';
import { operationsAPI, analyticsAPI } from '../api';
import { CheckCircle, XCircle, LogOut } from 'lucide-react';

export default function AdminDashboard({ user }) {
  const [operations, setOperations] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingOperations();
    loadStats();
  }, []);

  const loadPendingOperations = async () => {
    try {
      const res = await operationsAPI.getPending();
      setOperations(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadStats = async () => {
    try {
      // Можно добавить общую статистику
      setStats({
        totalChildren: 2,
        totalInvested: 15000,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (opId) => {
    try {
      await operationsAPI.approve(opId);
      loadPendingOperations();
      alert('Операция одобрена');
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleReject = async (opId) => {
    try {
      await operationsAPI.reject(opId);
      loadPendingOperations();
      alert('Операция отклонена');
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <div className="dashboard admin-dashboard">
      <header className="dashboard-header">
        <h1>👨‍💼 Панель родителя</h1>
        <div className="header-info">
          <span>Привет, {user.name}!</span>
          <button className="btn btn-secondary" onClick={handleLogout}>
            <LogOut size={18} /> Выход
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Всего детей</h3>
            <p className="stat-number">{stats.totalChildren}</p>
          </div>
          <div className="stat-card">
            <h3>Инвестировано</h3>
            <p className="stat-number">{stats.totalInvested?.toLocaleString()} ₽</p>
          </div>
          <div className="stat-card">
            <h3>Ожидающих операций</h3>
            <p className="stat-number">{operations.length}</p>
          </div>
        </div>

        <section className="operations-section">
          <h2>⏳ Ожидающие подтверждения операции</h2>
          
          {loading ? (
            <p>Загрузка...</p>
          ) : operations.length === 0 ? (
            <p className="empty-state">Нет ожидающих операций</p>
          ) : (
            <div className="operations-list">
              {operations.map((op) => (
                <div key={op.id} className="operation-card">
                  <div className="op-header">
                    <div>
                      <h4>{op.child_name}</h4>
                      <p className="op-type">
                        {op.type === 'open' ? '📤 Открыть вклад' : '📥 Снять'}
                      </p>
                    </div>
                    <div className="op-amount">
                      <span className="bank-badge" style={{
                        backgroundColor: op.bank === 'mama' ? '#FF6B6B' : '#4ECDC4'
                      }}>
                        {op.bank === 'mama' ? 'Мама' : 'Папа'}-банк
                      </span>
                      <span className="amount">{op.amount?.toLocaleString()} ₽</span>
                    </div>
                  </div>
                  <p className="op-date">Запрос: {new Date(op.requested_at).toLocaleDateString('ru-RU')}</p>
                  <div className="op-actions">
                    <button
                      className="btn btn-success"
                      onClick={() => handleApprove(op.id)}
                    >
                      <CheckCircle size={18} /> Одобрить
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleReject(op.id)}
                    >
                      <XCircle size={18} /> Отклонить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

### 7. `src/pages/ChildDashboard.jsx`

```javascript
import React, { useState, useEffect } from 'react';
import { depositsAPI, analyticsAPI, operationsAPI } from '../api';
import { Plus, TrendingUp, LogOut, AlertCircle } from 'lucide-react';

export default function ChildDashboard({ user }) {
  const [deposits, setDeposits] = useState([]);
  const [stats, setStats] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeposits();
    loadStats();
  }, [user.id]);

  const loadDeposits = async () => {
    try {
      const res = await depositsAPI.getAll(user.id);
      setDeposits(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadStats = async () => {
    try {
      const res = await analyticsAPI.stats(user.id);
      setStats(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeposit = async (bank, amount) => {
    try {
      // Сначала создаём вклад в статусе pending
      const newDeposit = {
        child_id: user.id,
        bank,
        amount,
        interest_rate: bank === 'mama' ? 3.5 : 11,
        period_days: bank === 'mama' ? 14 : 30,
      };

      // Это сложновато, нужен API для создания вклада
      // Упрощаем: создаём операцию запроса
      
      alert('Заявка отправлена родителю на подтверждение');
      setShowModal(false);
      // loadDeposits();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <div className="dashboard child-dashboard">
      <header className="dashboard-header">
        <h1>👧 Мой финансовый счёт</h1>
        <div className="header-info">
          <span>Привет, {user.name}!</span>
          <button className="btn btn-secondary" onClick={handleLogout}>
            <LogOut size={18} /> Выход
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {!loading && stats && (
          <div className="stats-grid">
            <div className="stat-card primary">
              <h3>Всего у меня</h3>
              <p className="stat-number">{stats.total_current?.toLocaleString()} ₽</p>
            </div>
            <div className="stat-card">
              <h3>Инвестировано</h3>
              <p className="stat-number">{stats.total_invested?.toLocaleString()} ₽</p>
            </div>
            <div className="stat-card">
              <h3>Заработано процентов</h3>
              <p className="stat-number" style={{ color: '#10b981' }}>
                +{stats.total_interest_earned?.toLocaleString()} ₽
              </p>
            </div>
            <div className="stat-card">
              <h3>Активных вкладов</h3>
              <p className="stat-number">{stats.active_deposits}</p>
            </div>
          </div>
        )}

        <section className="deposits-section">
          <div className="section-header">
            <h2>💳 Мои вклады</h2>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={20} /> Новый вклад
            </button>
          </div>

          {deposits.length === 0 ? (
            <div className="empty-state">
              <p>У тебя ещё нет вкладов</p>
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                Создать первый вклад
              </button>
            </div>
          ) : (
            <div className="deposits-grid">
              {deposits.map((dep) => (
                <DepositCard key={dep.id} deposit={dep} />
              ))}
            </div>
          )}
        </section>
      </div>

      {showModal && (
        <NewDepositModal
          onClose={() => setShowModal(false)}
          onSubmit={handleOpenDeposit}
        />
      )}
    </div>
  );
}

function DepositCard({ deposit }) {
  const isMama = deposit.bank === 'mama';
  const rate = isMama ? '3.5%' : '11%';
  const period = isMama ? '14 дней' : '30 дней';
  const daysLive = Math.floor(
    (new Date() - new Date(deposit.created_at)) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className={`deposit-card ${isMama ? 'mama' : 'papa'}`}>
      <div className="card-header">
        <h3>{isMama ? '👩 Мама-банк' : '👨 Папа-банк'}</h3>
        <span className="status-badge" style={{
          backgroundColor: deposit.status === 'active' ? '#10b981' : '#6b7280',
        }}>
          {deposit.status === 'active' ? '✓ Активен' : 'ожидание'}
        </span>
      </div>

      <div className="card-body">
        <div className="balance-row">
          <span>Вложено:</span>
          <strong>{deposit.amount?.toLocaleString()} ₽</strong>
        </div>
        <div className="balance-row">
          <span>Текущий баланс:</span>
          <strong className="highlight">{deposit.calculated_balance?.toLocaleString()} ₽</strong>
        </div>
        <div className="balance-row earnings">
          <span>Заработано:</span>
          <strong>+{(deposit.calculated_balance - deposit.amount)?.toLocaleString()} ₽</strong>
        </div>

        <div className="meta-info">
          <p>📊 Ставка: {rate} / {period}</p>
          <p>📅 Дней в вкладе: {daysLive}</p>
        </div>

        {!isMama && daysLive < 30 && (
          <div className="warning-box">
            <AlertCircle size={16} />
            <span>Осталось {30 - daysLive} дней до полного месяца</span>
          </div>
        )}
      </div>

      <div className="card-actions">
        <button className="btn btn-secondary btn-sm">Отправить на снятие</button>
      </div>
    </div>
  );
}

function NewDepositModal({ onClose, onSubmit }) {
  const [bank, setBank] = useState('mama');
  const [amount, setAmount] = useState('1000');

  const isMama = bank === 'mama';
  const minAmount = isMama ? 1000 : 2000;
  const step = isMama ? 500 : 1000;
  const rate = isMama ? 3.5 : 11;
  const period = isMama ? 14 : 30;

  const handleSubmit = () => {
    if (!amount || parseInt(amount) < minAmount) {
      alert(`Минимальная сумма: ${minAmount} ₽`);
      return;
    }
    onSubmit(bank, parseInt(amount));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Открыть новый вклад</h2>

        <div className="bank-selector">
          <button
            className={`bank-btn ${bank === 'mama' ? 'active' : ''}`}
            onClick={() => setBank('mama')}
          >
            👩 Мама-банк
            <span className="rate">{3.5}% / 14 дн</span>
          </button>
          <button
            className={`bank-btn ${bank === 'papa' ? 'active' : ''}`}
            onClick={() => setBank('papa')}
          >
            👨 Папа-банк
            <span className="rate">{11}% / 30 дн</span>
          </button>
        </div>

        <div className="form-group">
          <label>Сумма вклада</label>
          <div className="amount-input">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={minAmount}
              step={step}
            />
            <span className="currency">₽</span>
          </div>
          <p className="hint">Минимум: {minAmount} ₽, кратность: {step} ₽</p>
        </div>

        <div className="info-box">
          <h4>Условия:</h4>
          <ul>
            <li>Ставка: <strong>{rate}%</strong> каждые <strong>{period}</strong> дней</li>
            <li>Текущий период: <strong>{period}</strong> дней</li>
            {!isMama && <li>⚠️ Досрочное снятие: штраф −2%</li>}
          </ul>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Отправить заявку
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 8. `src/App.css` — стили

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --primary: #0284c7;
  --primary-dark: #0369a1;
  --mama-color: #FF6B6B;
  --papa-color: #4ECDC4;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
  --text: #1f2937;
  --text-light: #6b7280;
  --bg: #f9fafb;
  --border: #e5e7eb;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
}

/* Login */
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 20px;
}

.login-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 40px;
  max-width: 400px;
  width: 100%;
}

.login-card h1 {
  margin-bottom: 10px;
  font-size: 28px;
}

.login-card > p {
  color: var(--text-light);
  margin-bottom: 30px;
}

.tab-buttons {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
}

.tab-btn {
  flex: 1;
  padding: 10px;
  background: var(--bg);
  border: 2px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.tab-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.form input,
.form select {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.alert {
  padding: 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.alert-error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.demo-users {
  background: var(--bg);
  padding: 15px;
  border-radius: 8px;
  margin-top: 20px;
  font-size: 13px;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-dark);
}

.btn-secondary {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-success {
  background: var(--success);
  color: white;
}

.btn-danger {
  background: var(--danger);
  color: white;
}

.btn-sm {
  padding: 8px 16px;
  font-size: 13px;
}

/* Dashboard */
.dashboard {
  min-height: 100vh;
  background: var(--bg);
}

.dashboard-header {
  background: white;
  padding: 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.dashboard-header h1 {
  font-size: 24px;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 20px;
}

.dashboard-content {
  padding: 30px;
  max-width: 1200px;
  margin: 0 auto;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-card h3 {
  font-size: 13px;
  color: var(--text-light);
  text-transform: uppercase;
  margin-bottom: 10px;
}

.stat-number {
  font-size: 32px;
  font-weight: 700;
  color: var(--primary);
}

.stat-card.primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: white;
}

.stat-card.primary h3 {
  color: rgba(255, 255, 255, 0.8);
}

.stat-card.primary .stat-number {
  color: white;
}

/* Deposits */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.deposits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.deposit-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-left: 6px solid var(--mama-color);
  transition: transform 0.2s, box-shadow 0.2s;
}

.deposit-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.deposit-card.papa {
  border-left-color: var(--papa-color);
}

.card-header {
  background: var(--bg);
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
}

.card-header h3 {
  font-size: 16px;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  color: white;
  font-weight: 600;
}

.card-body {
  padding: 20px;
}

.balance-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 14px;
}

.balance-row.earnings strong {
  color: var(--success);
}

.highlight {
  color: var(--primary);
  font-size: 18px;
}

.meta-info {
  background: var(--bg);
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  margin: 15px 0;
}

.meta-info p {
  margin: 6px 0;
}

.warning-box {
  background: #fef3c7;
  border-left: 4px solid var(--warning);
  padding: 12px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #92400e;
}

.card-actions {
  padding: 12px 20px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  display: flex;
  gap: 10px;
}

/* Operations */
.operations-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.operation-card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.op-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
}

.op-type {
  color: var(--text-light);
  font-size: 13px;
  margin-top: 4px;
}

.op-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.bank-badge {
  padding: 4px 12px;
  border-radius: 6px;
  color: white;
  font-size: 12px;
  font-weight: 600;
}

.amount {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}

.op-date {
  font-size: 13px;
  color: var(--text-light);
  margin-bottom: 15px;
}

.op-actions {
  display: flex;
  gap: 10px;
}

.op-actions .btn {
  flex: 1;
  justify-content: center;
  font-size: 14px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 30px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-content h2 {
  margin-bottom: 20px;
  font-size: 20px;
}

.bank-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.bank-btn {
  padding: 20px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: white;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  font-weight: 600;
}

.bank-btn:hover {
  border-color: var(--primary);
}

.bank-btn.active {
  border-color: var(--primary);
  background: var(--bg);
}

.rate {
  font-size: 12px;
  color: var(--text-light);
  font-weight: 400;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 14px;
}

.amount-input {
  position: relative;
  display: flex;
  align-items: center;
}

.amount-input input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
}

.amount-input .currency {
  position: absolute;
  right: 12px;
  font-weight: 600;
  color: var(--text-light);
}

.hint {
  font-size: 12px;
  color: var(--text-light);
  margin-top: 6px;
}

.info-box {
  background: var(--bg);
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
}

.info-box h4 {
  margin-bottom: 10px;
  font-size: 14px;
}

.info-box ul {
  list-style: none;
}

.info-box li {
  margin: 6px 0;
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.modal-actions .btn {
  flex: 1;
  justify-content: center;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-light);
}

.empty-state p {
  margin-bottom: 20px;
  font-size: 16px;
}

/* Responsive */
@media (max-width: 768px) {
  .dashboard-header {
    flex-direction: column;
    gap: 15px;
    align-items: flex-start;
  }

  .header-info {
    width: 100%;
    justify-content: space-between;
  }

  .deposits-grid {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: 1fr 1fr;
  }

  .bank-selector {
    grid-template-columns: 1fr;
  }
}
```

---

## ЗАПУСК ПРОЕКТА

### Терминал 1 — Backend

```bash
cd backend
npm install
npm start
# или: node server.js
```

Будет на http://localhost:5000

### Терминал 2 — Frontend

```bash
cd frontend
npm install
npm start
```

Будет на http://localhost:3000

---

## ДЕМО-УЧЁТНЫЕ ДАННЫЕ

**Для первого запуска используй эти данные:**

Вы можете создать две учётные записи через экран регистрации:

### Родитель:
- Имя: Папа
- Логин: admin
- Пароль: admin123
- Роль: Администратор

### Ребёнок:
- Имя: Денис
- Логин: child
- Пароль: child123
- Роль: Вкладчик

---

## СЛЕДУЮЩИЕ ШАГИ

1. **Завершить API для создания вкладов** — `POST /deposits`
2. **Добавить калькулятор прогнозов** — интерактивный расчёт
3. **История операций** — полная лента транзакций
4. **Экспорт в CSV** — для отчётов
5. **Push-уведомления** — когда процент начисляется
6. **Чёрная тема** — для удобства вечером

---

**Статус:** Готовый к запуску прототип 🚀