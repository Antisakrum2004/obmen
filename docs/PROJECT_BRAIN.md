# PROJECT BRAIN — Payroll Review System

## История версий

### ПР-3.x — Первые версии
- Базовая структура модуля
- Моковые данные для разработки
- Простой tasks-first pipeline

### ПР-6.5.0 — Удаление моковых данных
- Моковые данные удалены, всегда живые данные из Bitrix24
- `PR_MOCK_MODE = false` для совместимости

### ПР-6.6.0 — EXCLUDE_GROUPS
- `EXCLUDE_GROUPS` влияет ТОЛЬКО на UI (Projects tab)
- На загрузку данных НЕ влияет — задачи из групп 26, 48, 78 загружаются
- Предеин списывает время в группе 26 «Текущие задачи 1с»
- `PR_NORM_CONFIG_OVERRIDE = { excludeGroups: {} }` — пустой = не исключать

### ПР-6.7.0 — Non-retryable errors
- Добавлена обработка невосстановимых ошибок API
- `_DL_NON_RETRYABLE`: `ERROR_METHOD_NOT_FOUND`, `ERROR_TASK_NOT_FOUND`, `ERROR_ACCESS_DENIED`
- Исправлен бесконечный retry loop на `tasks.elapseditem.list`

### ПР-6.8.0 — Диагностика дат
- Выявлено: все elapsed записи из старых месяцев (Nov 2025 - Feb 2026)
- Нет записей за May 2026 (текущий период)

### ПР-6.9.0 — API discovery
- `task.elapseditem.list` → `ERROR_METHOD_NOT_FOUND`
- `tasks.elapseditem.list` → `ERROR_METHOD_NOT_FOUND`
- Оба метода НЕ СУЩЕСТВУЮТ в нашем Bitrix24
- Загрузка по группам: 3160 задач из 38 групп

### ПР-6.10.0 — Batch vs Sequential
- Batch URL format для `task.elapseditem.getlist` — СЛОМАН (66 чанков, все пустые)
- Прямой POST `bxPost('task.elapseditem.getlist', [taskId, {ID:'DESC'}, {}])` — РАБОТАЕТ
- Sequential search: 734 elapsed записей
- USER_ID: `{"1":2,"18":77,"38":120,"54":252,"82":85,"88":2,"92":125,"98":67,"116":6}`
- Predein (116) = 6 elapsed записей, но 0 за May 2026

### ПР-6.11.0 — Параллельные POST
- 273 чанка параллельных POST → 502 Bad Gateway / Read timeout
- Слишком много одновременных запросов к API
- UI не отображается

### ПР-6.12.0 — Activity-filtered pipeline (промежуточный)
- Замена 3 мес lookback на RESPONSIBLE_ID + `>=CREATED_DATE`
- Убрана загрузка по группам (3260 задач → ~400)
- Добавлены hard limits: 400 задач, 500 elapsed, 8с таймаут
- Мьютекс generation для отмены устаревших загрузок
- Всё ещё использовал `>=CREATED_DATE` вместо `>=DATE_ACTIVITY`

### ПР-7.0.0 — ACTIVITY-FILTERED TASKS-FIRST (текущая)

## Архитектура v7.0.0

### Pipeline

```
┌─────────────────────────────────────────────────┐
│ 1. PayrollCache.get(key)                        │
│    → Если кэш валидный (TTL 5 мин): мгновенный  │
│      возврат, без API запросов                   │
├─────────────────────────────────────────────────┤
│ 2. tasks.task.list (per developer)              │
│    FILTER:                                       │
│      RESPONSIBLE_ID = devId                      │
│      >=DATE_ACTIVITY = periodStart - 14 дней     │
│      <=DATE_ACTIVITY = periodEnd + 14 дней       │
│    (+ ACCOMPLICE для каждого devId)              │
│    МАКС 3 страницы = 150 задач/разработчик       │
├─────────────────────────────────────────────────┤
│ 3. Дедупликация TASK_ID                          │
│    Hard limit: 400 задач                         │
├─────────────────────────────────────────────────┤
│ 4. task.elapseditem.getlist (POST)              │
│    ТОЛЬКО для найденных taskIds                  │
│    Формат: [taskId, {ID:'DESC'}, {}]             │
│    Параллельно: 6 concurrent                     │
│    Таймаут: 8с на запрос                         │
│    Hard limit: 500 elapsed записей               │
├─────────────────────────────────────────────────┤
│ 5. Фильтрация по выбранному месяцу              │
│    CREATED_DATE >= fromStr AND <= toStr          │
│    Только DEV_IDS разработчики                   │
├─────────────────────────────────────────────────┤
│ 6. Загрузка проектов (sonet_group.get)           │
│    + orphan tasks (batch, max 50)                │
├─────────────────────────────────────────────────┤
│ 7. PayrollCache.set(key, data, 5 мин)           │
└─────────────────────────────────────────────────┘
```

### Ожидаемый масштаб
- 80-250 задач на месяц
- 20-60 API вызовов
- 3-10 секунд загрузка

### СТАРОГО масштаб (до v7.0.0)
- 3260 задач
- 2182+ elapsed checks
- 273+ batch chunks
- Минуты загрузки, 502 таймауты

### Ключевые правила

#### Запрещено
- Load all tasks by developer (без DATE_ACTIVITY фильтра)
- Recursive group scans
- All historical tasks
- No-date task loading
- Unbounded pagination
- Tasks without activity filter

#### Обязательно
- DATE_ACTIVITY фильтр с buffer 14 дней
- Hard limits: 400 задач, 500 elapsed
- Кэш PayrollCache с TTL 5 мин
- Partial data rendering (если часть API упала)

### Видимость разработчиков

`hasVisiblePayroll` — правило видимости карточки разработчика:

```
tasks.length > 0
  OR elapsedHours > 0
  OR baseSalary > 0
  OR payrollAmount > 0
  OR adjustments.length > 0
```

Реализация: `_prEnsureAllDevsInProjection()` добавляет ВСЕХ активных
разработчиков в projection, даже с 0 часов, но с их baseSalary.

**Предеин (ID 116)**: rate=0, base=200000, клиент rate=0
- Всегда виден благодаря baseSalary > 0
- Карточка показывает: 0.0h факт, 200,000 затраты
- Риски: LOW LOAD, RATE=0

### Bitrix24 API

| Метод | Статус | Примечание |
|-------|--------|------------|
| `tasks.task.list` | Работает | Загрузка задач с фильтрами |
| `task.elapseditem.getlist` | Работает | Только прямой POST, `[taskId, {ID:'DESC'}, {}]` |
| `task.elapseditem.list` | НЕ СУЩЕСТВУЕТ | `ERROR_METHOD_NOT_FOUND` |
| `tasks.elapseditem.list` | НЕ СУЩЕСТВУЕТ | `ERROR_METHOD_NOT_FOUND` |
| `task.elapseditem.getlist` (batch URL) | СЛОМАН | URL format не передаёт positional array params |
| `sonet_group.get` | Работает | Загрузка проектов/групп |

### Структура файлов

```
public/js/
├── core.js                      — Константы, API, утилиты (ПР-7.0.0)
├── data-loader.js                — Pipeline загрузки данных (v7.0.0)
├── tab-payroll-review.js         — UI модуль (v5.0.0+)
├── payroll-review-styles.js      — CSS стили
├── payroll-review-export.js      — CSV экспорт
├── payroll-review-storage.js     — localStorage обёртка
├── payroll-review-calc.js        — Расчёты, domain model
├── mock-data.js                  — (устаревший) моковые данные
└── payroll/
    ├── payroll-review-engine.js  — Движок ревью, TaskReview builder
    ├── payroll-normalizer.js     — Нормализация elapsed записей
    ├── payroll-projection.js     — Прогнозы, агрегация, итоги
    ├── payroll-cache.js          — Smart Cache Layer (TTL, SWR)
    ├── payroll-storage.js        — Persistence layer
    ├── payroll-domain.js         — Domain types, constants
    └── payroll-export.js         — Export logic
```

### Исключённые разработчики
- ID 80 (Сергей Приходько) — `EXCLUDED_DEV_IDS`
- ID 94 (Denius Coder) — `EXCLUDED_DEV_IDS`
- ID 96 (Марина Савчук) — `EXCLUDED_DEV_IDS`

### Активные разработчики (ACTIVE_DEV_IDS)
Все кроме исключённых: 1, 18, 38, 54, 82, 92, 98, 116

### Вебхук
`https://1c-cms.bitrix24.ru/rest/116/48yuunr8ss2u18qm/`
User 116 = Андрей Предеин

### Кэш PayrollCache
- TTL: 5 минут
- Storage: localStorage + in-memory mirror
- Max entries: 50
- Eviction: LRU-like (oldest 25%)
- SWR: `getStale()` для stale-while-revalidate
- Key format: `data:YYYY-MM`
- Invalidate: при manual refresh, при смене периода
