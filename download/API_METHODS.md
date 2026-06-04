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
      "devId": "18",
      "fullName": "Константин Приходько",
      "days": [
        {
          "date": "2026-05-05",
          "plan": 8000,
          "fact": 8000,
          "tasks": [
            {
              "taskId": "1234",
              "title": "Интеграция API",
              "projectName": "Бигап",
              "projectId": "6",
              "factHours": 4.0,
              "billableHours": 4.0,
              "amount": 4000
            }
          ]
        }
      ]
    }
  ]
}
```

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

## 4. POST — Сохранение данных (админка)

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
| 1 | GET | `https://obmen-atilab.vercel.app/api/payroll/2026-05?key=pr_api_2026` | Сводка за месяц |
| 2 | GET | `https://obmen-atilab.vercel.app/api/payroll/2026-05?key=pr_api_2026&view=details` | Детализация за месяц |
| 3 | GET | `https://obmen-atilab.vercel.app/api/developers?key=pr_api_2026` | Справочник разработчиков |
| 4 | POST | `https://obmen-atilab.vercel.app/api/admin/save?key=pr_api_2026` | Сохранение снапшота |

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
