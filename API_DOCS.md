# API Documentation - Мама-Папа Банк

## Base URL
`http://localhost:5000/api` (или другой указанный порт)

## Authentication
Все защищенные эндпоинты требуют JWT токен в заголовке:
```
Authorization: Bearer <token>
```

---

## 1. Авторизация

### POST /api/auth/register
**Описание:** Регистрация нового пользователя

**Тело запроса:**
```json
{
  "username": "string (min 4 chars)",
  "password": "string (min 6 chars)",
  "name": "string",
  "role": "child | mama-admin | papa-admin",
  "bank": "mama | papa | null (for children)"
}
```

**Пример запроса:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_user",
    "password": "password123",
    "name": "Test User",
    "role": "child"
  }'
```

**Ответ:**
```json
{
  "id": 1,
  "username": "test_user",
  "name": "Test User",
  "role": "child",
  "parent_id": null
}
```

### POST /api/auth/login
**Описание:** Вход в систему

**Тело запроса:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Пример запроса:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_user",
    "password": "password123"
  }'
```

**Ответ:**
```json
{
  "token": "jwt_token_string",
  "user": {
    "id": 1,
    "username": "test_user",
    "name": "Test User",
    "role": "child",
    "bank": null
  }
}
```

### GET /api/auth/current-user
**Описание:** Получить информацию о текущем пользователе

**Заголовки:**
```
Authorization: Bearer <token>
```

**Пример запроса:**
```bash
curl -X GET http://localhost:5000/api/auth/current-user \
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "id": 1,
  "username": "test_user",
  "name": "Test User",
  "role": "child",
  "bank": null
}
```

---

## 2. Вклады

### GET /api/deposits
**Описание:** Получить вклады для конкретного ребенка

**Параметры запроса:**
- `child_id` (number) - ID ребенка (только для администраторов)

**Заголовки:**
```
Authorization: Bearer <token>
```

**Пример запроса:**
```bash
curl -X GET "http://localhost:5000/api/deposits?child_id=1" \
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
[
  {
    "id": 1,
    "child_id": 1,
    "bank": "mama",
    "amount": 1000,
    "current_balance": 1000,
    "interest_rate": 0.035,
    "period_days": 14,
    "status": "active",
    "created_at": "2023-01-01T00:00:00.000Z",
    "last_interest_calc": "2023-01-01T00:00:00.000Z",
    "closed_at": null,
    "calculated_balance": 1035
  }
]
```

### GET /api/deposits/:id
**Описание:** Получить конкретный вклад

**Параметры пути:**
- `id` (number) - ID вклада

**Заголовки:**
```
Authorization: Bearer <token>
```

**Пример запроса:**
```bash
curl -X GET http://localhost:5000/api/deposits/1 \
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "id": 1,
  "child_id": 1,
  "bank": "mama",
  "amount": 1000,
  "current_balance": 1000,
  "interest_rate": 0.035,
  "period_days": 14,
  "status": "active",
  "created_at": "2023-01-01T00:00:00.000Z",
  "last_interest_calc": "2023-01-01T00:00:00.000Z",
  "closed_at": null,
  "calculated_balance": 1035,
  "interest_history": [
    {
      "id": 1,
      "deposit_id": 1,
      "calculated_at": "2023-01-15T00:00:00.000Z",
      "interest_amount": 35,
      "new_balance": 1035
    }
  ]
}
```

### POST /api/deposits
**Описание:** Создать новый вклад (требует одобрения)

**Заголовки:**
```
Authorization: Bearer <token>
```

**Тело запроса:**
```json
{
  "bank": "mama | papa",
  "amount": "number (min 1000 for mama, min 2000 for papa)"
}
```

**Пример запроса:**
```bash
curl -X POST http://localhost:5000/api/deposits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "bank": "mama",
    "amount": 1500
  }'
```

**Ответ:**
```json
{
  "id": 1,
  "message": "Deposit request created successfully. Awaiting approval."
}
```

---

## 3. Операции

### POST /api/operations/request
**Описание:** Запросить новую операцию

**Заголовки:**
```
Authorization: Bearer <token>
```

**Тело запроса:**
```json
{
  "deposit_id": "number",
  "type": "open | withdraw | interest | penalty",
  "amount": "number (optional)"
}
```

**Пример запроса:**
```bash
curl -X POST http://localhost:5000/api/operations/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "deposit_id": 1,
    "type": "withdraw"
  }'
```

**Ответ:**
```json
{
  "id": 1,
  "status": "pending",
  "message": "Operation requested successfully. Awaiting approval."
}
```

### GET /api/operations/pending
**Описание:** Получить ожидающие операции (только для администраторов)

**Заголовки:**
```
Authorization: Bearer <token>
```

**Пример запроса:**
```bash
curl -X GET http://localhost:5000/api/operations/pending \
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
[
  {
    "id": 1,
    "deposit_id": 1,
    "user_id": 2,
    "type": "withdraw",
    "amount": 1035,
    "status": "pending",
    "notes": "Requested withdraw operation",
    "requested_at": "2023-01-20T00:00:00.000Z",
    "approved_at": null,
    "approved_by": null,
    "bank": "mama",
    "deposit_amount": 1000,
    "child_name": "Child Name"
  }
]
```

### POST /api/operations/:id/approve
**Описание:** Одобрить операцию

**Параметры пути:**
- `id` (number) - ID операции

**Заголовки:**
```
Authorization: Bearer <token>
```

**Пример запроса:**
```bash
curl -X POST http://localhost:5000/api/operations/1/approve \
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "approved",
  "actual_amount": 1035,
  "penalty_applied": 0,
  "message": "Withdrawal processed successfully"
}
```

### POST /api/operations/:id/reject
**Описание:** Отклонить операцию

**Параметры пути:**
- `id` (number) - ID операции

**Заголовки:**
```
Authorization: Bearer <token>
```

**Пример запроса:**
```bash
curl -X POST http://localhost:5000/api/operations/1/reject \
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "rejected",
  "message": "Operation rejected"
}
```

---

## 4. Аналитика

### GET /api/analytics/forecast/:depositId
**Описание:** Получить прогноз доходности для вклада

**Параметры пути:**
- `depositId` (number) - ID вклада

**Заголовки:**
```
Authorization: Bearer <token>
```

**Пример запроса:**
```bash
curl -X GET http://localhost:5000/api/analytics/forecast/1 \
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "current_balance": 1035,
  "in_7_days": 1035,
  "in_14_days": 1070.23,
  "in_30_days": 1070.23,
  "in_90_days": 1146.75
}
```

### GET /api/analytics/stats/:childId
**Описание:** Получить статистику по ребенку

**Параметры пути:**
- `childId` (number) - ID ребенка

**Заголовки:**
```
Authorization: Bearer <token>
```

**Пример запроса:**
```bash
curl -X GET http://localhost:5000/api/analytics/stats/1 \
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "total_invested": 2500,
  "total_current": 2587.5,
  "deposits_count": 2,
  "active_deposits": 2,
  "total_interest_earned": 87.5
}
```

### GET /api/analytics/overall-stats
**Описание:** Получить общую статистику (только для администраторов)

**Заголовки:**
```
Authorization: Bearer <token>
```

**Пример запроса:**
```bash
curl -X GET http://localhost:5000/api/analytics/overall-stats \
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "total_children": 5,
  "total_invested": 15000,
  "pending_operations": 3,
  "total_interest_paid": 450
}
```

---

## Коды ошибок

| Код | Описание |
|-----|----------|
| 400 | Неверный запрос (неправильные параметры) |
| 401 | Неавторизованный доступ (токен не предоставлен) |
| 403 | Доступ запрещен (недостаточно прав) |
| 404 | Ресурс не найден |
| 500 | Внутренняя ошибка сервера |

---

## Примечания

1. **Разделение банков:** Администраторы могут видеть и управлять только своими банками:
   - `mama-admin` видит только `mama`-банковские операции
   - `papa-admin` видит только `papa`-банковские операции

2. **Валидация минимальных сумм:**
   - Мама-банк: минимум 1000 ₽
   - Папа-банк: минимум 2000 ₽

3. **Штрафы за досрочное снятие:**
   - Мама-банк: 0% штрафа
   - Папа-банк: 2% штрафа при снятии ранее чем через 30 дней

4. **Сложный процент:**
   - Мама-банк: 3.5% каждые 14 дней
   - Папа-банк: 11% каждые 30 дней