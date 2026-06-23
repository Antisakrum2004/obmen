# API дашборда зарплат — Полные ссылки и методы

**Базовый URL:** `https://obmen-atilab.vercel.app`  
**API-ключ:** `pr_api_2026`  
**Дата создания:** 2026-06-04  
**Версия:** ПР-9.2.0

---

## 1. GET — Сводка за период (summary)

Возвращает итоговые данные по всем разработчикам за указанный месяц: план, факт, сумму к выплате, штрафы, базовую часть.

```
https://obmen-atilab.vercel.app/api/payroll/2026-05?key=pr_api_2026
```

**Параметры:**
| Параметр | Обязательный | Описание |
|----------|:---:|----------|
| `period` | Да | Период в формате `YYYY-MM` (в URL) |
| `key` | Да | API-ключ (`pr_api_2026`) |
| `view` | Нет | `summary` (по умолчанию) или `details` |

**Пример ответа:**
```json
{
  "period": "2026-05",
  "savedAt": "2026-05-28T14:30:00.000Z",
  "version": 1,
  "developers": [
    {
      "devId": "18",
      "fullName": "Константин Приходько",
      "rate": 1000,
      "clientRate": 1000,
      "base": 0,
      "fine": 0,
      "fineComment": "",
      "fines": [],
      "inn": "",
      "selfEmployed": "Нет",
      "bank": "",
      "contract": "",
      "contractDate": "",
      "notes": "",
      "active": true,
      "totalPlan": 168000,
      "totalFact": 155000,
      "totalBillableHours": 155.0,
      "payrollAmount": 155000,
      "clientRevenue": 155000
    }
  ],
  "totals": {
    "totalPlan": 840000,
    "totalFact": 780000,
    "totalPayrollAmount": 780000,
    "totalClientRevenue": 780000,
    "totalBase": 200000,
    "totalFine": 0
  }
}
```

---

## 2. GET — Детализация за период (details)

Возвращает данные по каждому дню и задаче для каждого разработчика.

```
https://obmen-atilab.vercel.app/api/payroll/2026-05?key=pr_api_2026&view=details
```

**Параметры:**
| Параметр | Обязательный | Описание |
|----------|:---:|----------|
| `period` | Да | Период в формате `YYYY-MM` (в URL) |
| `key` | Да | API-ключ (`pr_api_2026`) |
| `view` | Да | Должно быть `details` |

**Пример ответа:**
```json
{
  "period": "2026-05",
  "savedAt": "2026-05-28T14:30:00.000Z",
  "version": 1,
  "developers": [ ... ],
  "details": [
    {
      "devId": 18,
      "fullName": "Константин Приходько",
      "taskId": 1234,
      "taskTitle": "Интеграция API",
      "projectId": 6,
      "projectName": "Бигап",
      "stageId": 194,
      "stageName": "Счет",
      "paymentStatus": "invoice",
      "isReadyForPayment": true,
      "date": "2026-05-05",
      "factHours": 4.0,
      "billableHours": 4.0,
      "rate": 1000,
      "payrollAmount": 4000,
      "clientRate": 1000,
      "clientAmount": 4000,
      "comment": ""
    }
  ]
}
```

**Поля стадий и платёжного статуса (новые):**
| Поле | Тип | Описание |
|------|-----|----------|
| `stageId` | number | ID стадии в Bitrix24 (например, 194 для «Счет» в Бигап) |
| `stageName` | string | Название стадии («Счет», «Оплата», «Готово», и т.д.) |
| `paymentStatus` | string | `not_ready` / `invoice` / `paid` / `closed` / `unknown` |
| `isReadyForPayment` | boolean | `true` если `paymentStatus` = `invoice` или `paid` |

---

## 3. GET — Справочник разработчиков

Возвращает список всех разработчиков с их ставками, ИНН, реквизитами. Данные берутся из последнего сохранённого снапшота.

```
https://obmen-atilab.vercel.app/api/developers?key=pr_api_2026
```

**Параметры:**
| Параметр | Обязательный | Описание |
|----------|:---:|----------|
| `key` | Да | API-ключ (`pr_api_2026`) |

**Пример ответа:**
```json
{
  "period": "2026-05",
  "savedAt": "2026-05-28T14:30:00.000Z",
  "developers": [
    {
      "devId": "18",
      "fullName": "Константин Приходько",
      "inn": "",
      "selfEmployed": "Нет",
      "bank": "",
      "contract": "",
      "contractDate": "",
      "rate": 1000,
      "clientRate": 1000,
      "base": 0,
      "fine": 0,
      "fineComment": "",
      "fines": [],
      "notes": "",
      "active": true
    }
  ]
}
```

---

## 4. GET — Справочник проектов со стадиями

Возвращает полный маппинг проектов Bitrix24 → стадии с цветами и платёжными статусами. Полезен для 1С, чтобы понимать какой stageId соответствует «Счет»/«Оплата»/«Готово» в каждом проекте.

```
https://obmen-atilab.vercel.app/api/projects?key=pr_api_2026
```

**Параметры:**
| Параметр | Обязательный | Описание |
|----------|:---:|----------|
| `key` | Да | API-ключ (`pr_api_2026`) |

**Пример ответа (фрагмент):**
```json
{
  "generatedAt": "2026-06-23T08:00:00Z",
  "projectsCount": 21,
  "projects": [
    {
      "projectId": 6,
      "projectName": "Бигап",
      "stagesCount": 10,
      "stages": [
        {"id": 136, "name": "Новые",   "color": "a8afb3", "paymentStatus": "not_ready"},
        {"id": 534, "name": "Оценка",  "color": "f5d220", "paymentStatus": "not_ready"},
        {"id": 138, "name": "Работа",  "color": "2fc6f6", "paymentStatus": "not_ready"},
        {"id": 188, "name": "Правки",  "color": "ff5752", "paymentStatus": "not_ready"},
        {"id": 190, "name": "Тест",    "color": "9b51e0", "paymentStatus": "not_ready"},
        {"id": 258, "name": "Релиз",   "color": "ffa900", "paymentStatus": "not_ready"},
        {"id": 140, "name": "Готово",  "color": "8ec82f", "paymentStatus": "closed"},
        {"id": 192, "name": "Пауза",   "color": "754c24", "paymentStatus": "not_ready"},
        {"id": 194, "name": "Счет",    "color": "1db7f1", "paymentStatus": "invoice"},
        {"id": 196, "name": "Оплата",  "color": "14b033", "paymentStatus": "paid"}
      ],
      "invoiceStageId": 194,
      "paidStageId":    196,
      "closedStageId":  140
    }
  ],
  "paymentStatusLegend": {
    "not_ready": "Работа ещё не готова к оплате",
    "invoice":   "Стадия «Счет» — 1С формирует счёт клиенту",
    "paid":      "Стадия «Оплата» — клиент оплатил, 1С формирует акт+выплату разрабу",
    "closed":    "Стадия «Готово» — задача закрыта"
  }
}
```

---

## 5. GET — Выгрузка для 1С (счета и выплаты)

**Главный эндпоинт для 1С.** Возвращает задачи, готовые к выставлению счетов клиентам (`invoices`) и к выплате разработчикам (`payouts`). Автоматически исключает задачи, уже помеченные как обработанные через `mark-processed`.

```
https://obmen-atilab.vercel.app/api/payroll/2026-05/billing?key=pr_api_2026
```

**Параметры:**
| Параметр | Обязательный | Описание |
|----------|:---:|----------|
| `period` | Да | Период в формате `YYYY-MM` (в URL) |
| `key` | Да | API-ключ (`pr_api_2026`) |

**Логика:**
- `invoices` — задачи в стадии «Счет» (клиенту выставляется счёт)
- `payouts` — задачи в стадии «Оплата» (клиент оплатил → выплата разрабу + акт)
- Задачи, у которых уже есть запись в `mark-processed`, исключаются (защита от двойной выгрузки)

**Пример ответа:**
```json
{
  "period": "2026-05",
  "generatedAt": "2026-06-23T08:00:00Z",
  "savedAt": "2026-05-28T14:30:00.000Z",
  "invoices": [
    {
      "taskId": 1234,
      "taskTitle": "Интеграция API",
      "projectId": 6,
      "projectName": "Бигап",
      "stageId": 194,
      "stageName": "Счет",
      "developer": {
        "devId": 18,
        "fullName": "Константин Приходько",
        "inn": "...",
        "selfEmployed": "Да",
        "bank": "...",
        "contract": "№...",
        "contractDate": "..."
      },
      "hours": 4.0,
      "rate": 1000,
      "amount": 4000,
      "clientRate": 1500,
      "clientAmount": 6000,
      "date": "2026-05-05"
    }
  ],
  "payouts": [
    {
      "taskId": 5678,
      "taskTitle": "Правки регистрации",
      "projectId": 6,
      "projectName": "Бигап",
      "stageId": 196,
      "stageName": "Оплата",
      "developer": { ... },
      "hours": 8.0,
      "rate": 1000,
      "amount": 8000,
      "clientRate": 1500,
      "clientAmount": 12000,
      "date": "2026-05-10"
    }
  ],
  "totals": {
    "invoicesCount": 5,
    "invoicesAmount": 25000,
    "invoicesClientAmount": 37500,
    "payoutsCount": 12,
    "payoutsAmount": 156000,
    "payoutsClientAmount": 234000,
    "processedCount": 3
  }
}
```

---

## 6. POST — Отметка об обработке (backlink от 1С)

Вызывается 1С после формирования счетов/актов, чтобы при следующей выгрузке эти задачи не попали повторно.

```
https://obmen-atilab.vercel.app/api/admin/mark-processed?key=pr_api_2026
```

**Тело запроса (JSON):**
```json
{
  "period": "2026-05",
  "items": [
    { "taskId": 1234, "action": "invoice_created", "processedAt": "2026-06-02T10:00:00Z" },
    { "taskId": 5678, "action": "paid_out",        "processedAt": "2026-06-02T10:05:00Z" }
  ]
}
```

**Возможные `action`:**
| action | Когда вызывать |
|--------|----------------|
| `invoice_created` | 1С сформировала счёт клиенту (для задач из `invoices`) |
| `paid_out` | 1С провела акт + выплату разрабу (для задач из `payouts`) |

**Пример ответа:**
```json
{
  "ok": true,
  "period": "2026-05",
  "itemsCount": 15,
  "url": "https://xxx.public.blob.vercel-storage.com/payroll-processed-2026-05.json",
  "updatedAt": "2026-06-23T08:10:00Z"
}
```

После этого вызова задачи с указанными `taskId` больше не появятся в выгрузке `/billing` за период `2026-05`.

---

## 7. POST — Сохранение данных (админка)

Сохраняет снапшот данных за период. Вызывается автоматически при нажатии «Сохранить» в админке дашборда.

```
https://obmen-atilab.vercel.app/api/admin/save?key=pr_api_2026
```

**Параметры:**
| Параметр | Обязательный | Описание |
|----------|:---:|----------|
| `key` | Да | API-ключ (`pr_api_2026`) |

**Тело запроса (JSON):**
```json
{
  "period": "2026-05",
  "developers": [ ... ],
  "details": [ ... ],
  "totals": { ... }
}
```

**Пример ответа:**
```json
{
  "ok": true,
  "period": "2026-05",
  "url": "https://xxx.public.blob.vercel-storage.com/payroll-snapshot-2026-05.json",
  "savedAt": "2026-05-28T14:30:00.000Z"
}
```

---

## Быстрая шпаргалка

| # | Метод | URL | Описание |
|---|-------|-----|----------|
| 1 | GET  | `https://obmen-atilab.vercel.app/api/payroll/2026-05?key=pr_api_2026` | Сводка за месяц |
| 2 | GET  | `https://obmen-atilab.vercel.app/api/payroll/2026-05?key=pr_api_2026&view=details` | Детализация за месяц (со стадиями задач) |
| 3 | GET  | `https://obmen-atilab.vercel.app/api/developers?key=pr_api_2026` | Справочник разработчиков |
| 4 | GET  | `https://obmen-atilab.vercel.app/api/projects?key=pr_api_2026` | Справочник проектов со стадиями |
| 5 | GET  | `https://obmen-atilab.vercel.app/api/payroll/2026-05/billing?key=pr_api_2026` | **Выгрузка для 1С: счета + выплаты** |
| 6 | POST | `https://obmen-atilab.vercel.app/api/admin/mark-processed?key=pr_api_2026` | Отметка об обработке (backlink от 1С) |
| 7 | POST | `https://obmen-atilab.vercel.app/api/admin/save?key=pr_api_2026` | Сохранение снапшота (админка) |

---

## Аутентификация

API-ключ передаётся одним из двух способов:
1. **Query-параметр:** `?key=pr_api_2026`
2. **HTTP-заголовок:** `X-API-Key: pr_api_2026`

---

## Важное примечание

Данные для GET-эндпоинтов берутся из **последнего сохранённого снапшота** в Vercel Blob. Снапшот создаётся автоматически при сохранении в админке дашборда. Если снапшота за запрошенный период нет — API вернёт `404` с подсказкой:

```json
{
  "error": "No data found for this period",
  "period": "2026-04",
  "hint": "Manager needs to save data first from the payroll dashboard"
}
```

Для появления данных нужно:
1. Открыть дашборд: `https://obmen-atilab.vercel.app`
2. Выбрать нужный период (месяц)
3. Нажать ⚙️ **Админка** → **Сохранить**
4. Данные автоматически отправятся на сервер и станут доступны по API
