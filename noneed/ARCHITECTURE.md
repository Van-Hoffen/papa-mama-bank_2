# Architecture Document - Мама-Папа Банк

## 1. Обзор архитектуры

Проект представляет собой веб-приложение с клиент-серверной архитектурой, состоящее из:
- **Backend API**: Node.js + Express + SQLite
- **Frontend SPA**: React 18 с модульной структурой
- **База данных**: SQLite (файл-база, embedded)

### Структура проекта
```
/workspace/
├── backend/                 # Серверная часть
│   ├── controllers/         # Контроллеры API
│   ├── models/             # Модели данных и работа с БД
│   ├── routes/             # Роутинг API
│   ├── middleware/         # Middleware функции
│   ├── services/           # Бизнес-логика (не используется в текущей версии)
│   ├── utils/              # Утилиты и вспомогательные функции
│   ├── server.js           # Главный файл сервера
│   └── package.json        # Зависимости backend
├── frontend/               # Клиентская часть
│   ├── src/
│   │   ├── components/     # Переиспользуемые компоненты
│   │   ├── pages/          # Страницы приложения
│   │   ├── utils/          # Вспомогательные функции
│   │   ├── styles/         # Стилевые файлы
│   │   ├── App.jsx         # Главный компонент
│   │   └── main.jsx        # Точка входа
│   ├── public/
│   ├── index.html
│   └── package.json        # Зависимости frontend
├── TZ_MAMA_PAPA_BANK.md    # Основное техническое задание
├── UPDATE_ТЗ_разделение_банков.md # Обновление ТЗ
├── README.md               # Основная документация
├── QUICK_START.md          # Быстрый старт
├── API_DOCS.md             # Документация по API
└── ARCHITECTURE.md         # Этот документ
```

---

## 2. Backend архитектура

### 2.1. Стек технологий
- **Node.js**: Runtime для JavaScript
- **Express.js**: Web framework для создания REST API
- **SQLite**: Embedded SQL database
- **jsonwebtoken**: JWT токены для аутентификации
- **bcryptjs**: Хеширование паролей
- **cors**: Обработка CORS
- **dotenv**: Управление переменными окружения

### 2.2. Структура БД

#### users
```
id (INTEGER PRIMARY KEY)
username (TEXT UNIQUE NOT NULL)
password (TEXT NOT NULL)
name (TEXT NOT NULL)
role (TEXT: 'mama-admin' | 'papa-admin' | 'child')
parent_id (INTEGER - FK to users.id)
bank (TEXT: 'mama' | 'papa' | NULL)
created_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
```

#### deposits
```
id (INTEGER PRIMARY KEY)
child_id (INTEGER NOT NULL - FK to users.id)
bank (TEXT NOT NULL)
amount (REAL NOT NULL)
current_balance (REAL DEFAULT 0)
interest_rate (REAL NOT NULL)
period_days (INTEGER NOT NULL)
status (TEXT: 'active' | 'closed' | 'pending' DEFAULT 'pending')
created_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
last_interest_calc (DATETIME DEFAULT CURRENT_TIMESTAMP)
closed_at (DATETIME)
```

#### operations
```
id (INTEGER PRIMARY KEY)
deposit_id (INTEGER NOT NULL - FK to deposits.id)
user_id (INTEGER NOT NULL - FK to users.id)
type (TEXT NOT NULL: 'open' | 'withdraw' | 'interest' | 'penalty')
amount (REAL)
status (TEXT: 'pending' | 'approved' | 'rejected' DEFAULT 'pending')
notes (TEXT)
requested_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
approved_at (DATETIME)
approved_by (INTEGER - FK to users.id)
```

#### interest_log
```
id (INTEGER PRIMARY KEY)
deposit_id (INTEGER NOT NULL - FK to deposits.id)
calculated_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
interest_amount (REAL NOT NULL)
new_balance (REAL NOT NULL)
```

### 2.3. Архитектура API

#### Маршруты
- `/api/auth` - аутентификация (register, login, current-user)
- `/api/deposits` - вклады (CRUD операции)
- `/api/operations` - операции (запросы, одобрения)
- `/api/analytics` - аналитика (прогнозы, статистика)

#### Middleware
- `authenticate` - проверка JWT токена
- `authorizeRoles` - проверка ролей пользователя
- `checkBankAccess` - проверка доступа к банку (для администраторов)

### 2.4. Логика расчета процентов

Формула сложного процента: `A = P × (1 + r)^n`

Где:
- A = итоговая сумма
- P = начальная сумма
- r = процентная ставка за период
- n = количество завершенных периодов

**Условия банков:**
- Мама-банк: 3.5% каждые 14 дней
- Папа-банк: 11% каждые 30 дней

---

## 3. Frontend архитектура

### 3.1. Стек технологий
- **React 18**: Библиотека для создания пользовательских интерфейсов
- **React Router DOM**: Навигация между страницами
- **Axios**: HTTP клиент для взаимодействия с API
- **Lucide React**: Библиотека иконок
- **CSS**: Стилизация (vanilla CSS)

### 3.2. Структура компонентов

#### Pages (Страницы)
- `Login.jsx` - форма входа и регистрации
- `AdminDashboard.jsx` - панель администратора (для мамы/папы)
- `ChildDashboard.jsx` - личный кабинет ребенка

#### Стилевые файлы
- `index.css` - глобальные стили и общие компоненты
- `AdminDashboard.css` - стили для админ панели
- `ChildDashboard.css` - стили для детской панели

### 3.3. Управление состоянием
- Локальное состояние React (useState, useEffect)
- Глобальное состояние через props передается от App.jsx
- Токен хранится в localStorage
- HTTP заголовки устанавливаются через axios.defaults

---

## 4. Безопасность

### 4.1. Аутентификация и авторизация
- JWT токены с 7-дневным сроком действия
- Хеширование паролей bcryptjs (10 раундов)
- Проверка ролей на уровне API
- Проверка принадлежности к банку для администраторов

### 4.2. Защита от атак
- Валидация входных данных на сервере
- Проверка авторизации для всех защищенных маршрутов
- Разграничение доступа к данным разных банков
- Проверка владельца ресурса (например, вклада)

### 4.3. Разделение прав
- Мама-администратор: доступ только к Мама-банку
- Папа-администратор: доступ только к Папа-банку
- Ребенок: доступ только к своим вкладам

---

## 5. Особенности реализации

### 5.1. Разделение банков
- Каждый администратор работает только со своим банком
- Запросы к API фильтруются по банку администратора
- Вклады и операции изолированы между банками

### 5.2. Динамический расчет процентов
- Проценты вычисляются на лету при каждом запросе
- Используется формула сложного процента
- Учитывается количество прошедших периодов

### 5.3. Адаптивность
- CSS Grid и Flexbox для адаптивного дизайна
- Медиа-запросы для мобильных устройств
- Отзывчивые карточки и формы

---

## 6. Масштабируемость

### 6.1. Текущие ограничения
- SQLite база данных (подходит для прототипа)
- Однопоточное приложение Node.js
- Нет кэширования результатов

### 6.2. Возможности для масштабирования
- Замена SQLite на PostgreSQL/MySQL
- Добавление Redis для кэширования
- Внедрение очередей для фоновых задач (начисление процентов)
- Горизонтальное масштабирование серверов

---

## 7. Тестирование

### 7.1. Функциональное тестирование
- Регистрация: создание пользователя с двумя ролями
- Вход: вход с корректными и неправильными данными
- Создание вклада: Мама и Папа банки с разными суммами
- Одобрение операции: проверка смены статуса
- Расчет процентов: проверка формулы на разных периодах
- Снятие: раньше срока (с штрафом для Папа-банка) и по сроку
- Прогнозы: корректность расчетов на 7, 14, 30, 90 дней
- История: отображение всех операций

### 7.2. Граничные случаи
- Сумма меньше минимума
- Снятие раньше на 1 день минимума (для Папа-банка)
- Отклонение заявки
- Несколько вкладов одновременно
- Длительное время между заявкой и одобрением

### 7.3. Безопасность
- Невозможно изменить роль через API
- Ребенок не видит чужих вкладов
- Пароли хешируются и не логируются
- Токен истекает через 7 дней
- Администратор не видит чужой банк

---

## 8. Деплоймент

### 8.1. Локальная разработка
- Backend: `npm start` на порту 5000
- Frontend: `npm run dev` на порту 3000 с проксированием API
- Hot reload для обоих частей приложения

### 8.2. Production деплоймент
- Backend: Heroku, Railway, VPS (Node.js)
- Frontend: Vercel, Netlify, GitHub Pages (static build)
- Database: PostgreSQL (как upgrade с SQLite)
- CI/CD: автоматическая сборка и деплоймент