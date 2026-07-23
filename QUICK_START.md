# 🚀 Quick Start: Установка «Мама-Папа Банк» на сервер

Краткая и исчерпывающая инструкция по развёртыванию приложения **«Мама-Папа Банк»** на физическом или виртуальном сервере (VPS/VDS под управлением Linux, например Ubuntu 20.04/22.04/24.04).

---

## 📋 Требования к серверу

- **ОС:** Linux (Ubuntu 20.04+, Debian 11+, CentOS/RHEL 8+)
- **Node.js:** v18.x или v20.x (LTS)
- **Пакетный менеджер:** `npm` v9+
- **Процесс-менеджер:** `pm2` *(рекомендуется для фонового автозапуска)*
- **Веб-сервер:** `Nginx` *(рекомендуется для проксирования и SSL)*

---

## 1️⃣ Пошаговая установка (PM2 + Nginx)

### Шаг 1. Подготовка окружения и Node.js

Если Node.js ещё не установлен на сервере:

```bash
# Обновление пакетов
sudo apt update && sudo apt upgrade -y

# Установка Node.js 20 LTS через NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# Установка PM2 для управления процессом
sudo npm install -g pm2
```

---

### Шаг 2. Клонирование репозитория и установка зависимостей

```bash
# Клонируем репозиторий
git clone https://github.com/Van-Hoffen/papa-mama-bank_2.git
cd papa-mama-bank_2

# Установка корневых зависимостей
npm install

# Установка зависимостей бэкенда
cd backend && npm install && cd ..

# Установка зависимостей фронтенда
cd frontend && npm install && cd ..
```

---

### Шаг 3. Настройка переменных окружения

Создайте `.env` файл в директории `backend/`:

```bash
nano backend/.env
```

Вставьте конфигурацию *(замените `JWT_SECRET` на уникальный секретный ключ)*:

```env
PORT=3000
JWT_SECRET=super-secret-random-key-change-me
DATABASE=./bank.db
NODE_ENV=production
```

---

### Шаг 4. Сборка фронтенда

Скомпилируйте клиентскую часть React:

```bash
npm run build
```

*После завершения статическая сборка появится в папке `frontend/dist`. Бэкенд автоматически раздаёт эти файлы в продакшене.*

---

### Шаг 5. Запуск приложения через PM2

Запустите сервер и настройте автозапуск при перезагрузке ОС:

```bash
# Запуск через PM2
pm2 start start-prod.js --name "papa-mama-bank"

# Сохранение списка процессов PM2
pm2 save

# Настройка автозапуска PM2 при старте сервера
pm2 startup
```

---

## 2️⃣ Настройка Nginx и SSL (HTTPS)

### Настройка Reverse Proxy в Nginx

Создайте конфигурационный файл сайта:

```bash
sudo nano /etc/nginx/sites-available/papa-mama-bank
```

Добавьте следующую конфигурацию *(укажите ваш домен или IP)*:

```nginx
server {
    listen 80;
    server_name your-domain.com; # Укажите ваш домен или IP адрес

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Активируйте конфиг и перезапустите Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/papa-mama-bank /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Бесплатный SSL-сертификат (Certbot / Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🔑 Учётные данные по умолчанию

При первом запуске бэкенд автоматически создает SQLite базу данных `backend/bank.db` и инициализирует начальные учётные записи:

| Логин | Пароль | Роль | Описание |
| :--- | :--- | :--- | :--- |
| **`admin`** | `admin123` | Global Admin | Полные права управления системой |
| **`mama_admin`** | `password123` | Bank Admin | Администратор Мама-Банка |
| **`papa_admin`** | `password123` | Bank Admin | Администратор Папа-Банка |
| **`ivan`** | `password123` | Child | Вкладчик (ребёнок) |

> ⚠️ **Важно:** После первого входа смените пароль администратора в панели управления!

---

## 🛠️ Полезные команды для обслуживания

```bash
# Просмотр статуса приложения
pm2 status

# Просмотр логов в реальном времени
pm2 logs papa-mama-bank

# Перезапуск приложения (например, после обновления кода)
git pull
npm run build
pm2 restart papa-mama-bank

# Создание резервной копии базы данных
cp backend/bank.db backend/bank.db.bak_$(date +%Y%m%m_%H%M%S)
```
