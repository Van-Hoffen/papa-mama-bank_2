# Quick Start Guide - Мама-Папа Банк

## Быстрая установка и запуск

### 1. Установка зависимостей

Сначала установите зависимости для backend:

```bash
cd /workspace/backend
npm install
```

Затем установите зависимости для frontend:

```bash
cd /workspace/frontend
npm install
```

### 2. Настройка переменных окружения

Создайте файл `.env` в директории `/workspace/backend/` со следующим содержимым:

```
PORT=5000
JWT_SECRET=your-super-secret-key
DATABASE=./bank.db
NODE_ENV=development
```

### 3. Запуск приложения

Запустите backend сервер:

```bash
cd /workspace/backend
npm start
```

В новом терминале запустите frontend:

```bash
cd /workspace/frontend
npm run dev
```

### 4. Доступ к приложению

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api

### 5. Демо-аккаунты

После первого запуска доступны следующие демо-аккаунты:

- **Мама-администратор**: 
  - Логин: `mama_admin`
  - Пароль: `password123`
  - Банк: Мама-банк

- **Папа-администратор**: 
  - Логин: `papa_admin` 
  - Пароль: `password123`
  - Банк: Папа-банк

## Структура проекта

```
/workspace/
├── backend/
│   ├── controllers/     # Контроллеры API
│   ├── models/          # Модели данных
│   ├── routes/          # Маршруты API
│   ├── services/        # Бизнес-логика
│   ├── middleware/      # Middleware
│   ├── utils/           # Утилиты
│   ├── server.js        # Главный файл сервера
│   └── package.json     # Зависимости backend
├── frontend/
│   ├── src/
│   │   ├── components/  # Компоненты
│   │   ├── pages/       # Страницы
│   │   ├── utils/       # Утилиты
│   │   ├── styles/      # Стили
│   │   ├── App.jsx      # Главный компонент
│   │   └── main.jsx     # Точка входа
│   ├── public/
│   ├── index.html
│   └── package.json     # Зависимости frontend
├── TZ_MAMA_PAPA_BANK.md # Техническое задание
└── README.md           # Документация
```

## Основные функции

### Для детей:
- Создание вкладов в Мама-банк или Папа-банке
- Просмотр текущего баланса и заработанных процентов
- Запрос снятия средств (требует одобрения родителя)

### Для родителей:
- Одобрение операций от детей
- Просмотр статистики по своим вкладам
- Разделение прав: Мама-администратор видит только Мама-банк, Папа-администратор - только Папа-банк

## API Endpoints

- `POST /api/auth/login` - Вход
- `POST /api/auth/register` - Регистрация
- `GET /api/deposits` - Получить вклады
- `POST /api/deposits` - Создать вклад
- `GET /api/operations/pending` - Ожидающие операции
- `POST /api/operations/:id/approve` - Одобрить операцию
- `POST /api/operations/:id/reject` - Отклонить операцию
- `GET /api/analytics/forecast/:depositId` - Прогноз доходности

## Технологии

- **Backend**: Node.js, Express, SQLite
- **Frontend**: React 18, React Router, Axios
- **Безопасность**: JWT токены, bcryptjs для хеширования паролей
- **UI**: Lucide React icons, адаптивный CSS