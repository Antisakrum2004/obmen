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

### ПР-7.0.0 — ACTIVITY-FILTERED TASKS-FIRST

Первоначальная реализация activity-filtered pipeline. Результаты:
- Buffer 14 дней создавал 58-дневное окно (Apr 17 — Jun 14)
- 5 из 8 разработчиков упёрлись в лимит 150 задач (3 стр × 50)
- ACCOMPLICE запросы добавляли 111 лишних задач
- Итого: 1020 задач → обрезано до 400 → 86 секунд загрузка
- Предеин добавлялся в projection, но фильтровался в UI
- Только 120 из 578 elapsed записей были за май (79% мусор)

### ПР-7.1.0 — Pipeline fix (текущая)

Критические исправления по результатам v7.0.0:

1. **Убран buffer 14 дней** — теперь ТОЧНЫЙ период (2026-05-01 — 2026-05-31)
   - Буфер давал 58-дневное окно → 1020 задач
   - Без буфера: ожидается ~100-200 задач

2. **Убраны ACCOMPLICE запросы** — 111 лишних задач
   - Elapsed соучастников находится через задачи RESPONSIBLE_ID
   - `task.elapseditem.getlist(taskId)` возвращает ВСЕ записи для задачи

3. **Пагинация 3→2 страницы** (150→100 задач на разработчика)

4. **Снижены лимиты**: tasks 400→250, elapsed 500→350

5. **Увеличена конкурентность**: 6→10 параллельных, delay 200→100ms

6. **Исправлена видимость Предеина** — разработчики с baseSalary>0
   теперь проходят проектные и статусные фильтры

7. **Добавлен fromStr/toStr** в объект данных для нормализатора

8. **ACTIVE_DEV_IDS вместо DEV_IDS** при фильтрации elapsed

## Архитектура v7.1.0

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
│      >=DATE_ACTIVITY = periodStart (ТОЧНО)       │
│      <=DATE_ACTIVITY = periodEnd (ТОЧНО)         │
│    АССОЦИАТЫ НЕ ЗАГРУЖАЮТСЯ (v7.1.0)           │
│    МАКС 2 страницы = 100 задач/разработчик       │
├─────────────────────────────────────────────────┤
│ 3. Дедупликация TASK_ID                          │
│    Hard limit: 250 задач                         │
├─────────────────────────────────────────────────┤
│ 4. task.elapseditem.getlist (POST)              │
│    ТОЛЬКО для найденных taskIds                  │
│    Формат: [taskId, {ID:'DESC'}, {}]             │
│    Параллельно: 10 concurrent                    │
│    Таймаут: 8с на запрос                         │
│    Hard limit: 350 elapsed записей               │
├─────────────────────────────────────────────────┤
│ 5. Фильтрация по выбранному месяцу              │
│    CREATED_DATE >= fromStr AND <= toStr          │
│    Только ACTIVE_DEV_IDS разработчики            │
├─────────────────────────────────────────────────┤
│ 6. Загрузка проектов (sonet_group.get)           │
│    + orphan tasks (batch, max 50)                │
├─────────────────────────────────────────────────┤
│ 7. PayrollCache.set(key, data, 5 мин)           │
│    + fromStr/toStr для нормализатора             │
└─────────────────────────────────────────────────┘
```

### Ожидаемый масштаб
- 100-200 задач на месяц (vs 1020 в v7.0.0)
- 15-40 API вызовов (vs 67 в v7.0.0)
- 5-15 секунд загрузка (vs 86.2с в v7.0.0)

### СТАРОГО масштаб (до v7.0.0)
- 3260 задач
- 2182+ elapsed checks
- 273+ batch chunks
- Минуты загрузки, 502 таймауты

### v7.0.0 масштаб (с буфером 14 дней)
- 1020 задач (8 разраб × ~130 + ACCOMPLICE 111)
- 400 elapsed checks (обрезано с 400 задач)
- 67 API chunks
- 86.2 секунды
- 578 raw elapsed → 120 за май (79% мусор из других месяцев)

### Ключевые правила

#### Запрещено
- Load all tasks by developer (без DATE_ACTIVITY фильтра)
- Recursive group scans
- All historical tasks
- No-date task loading
- Unbounded pagination
- Tasks without activity filter
- ACCOMPLICE queries (v7.1.0 — удалено, слишком много задач)
- Activity buffer > 0 дней (v7.1.0 — удалено, 58-дневное окно)

#### Обязательно
- DATE_ACTIVITY фильтр ТОЧНО за месяц (без буфера)
- Hard limits: 250 задач, 350 elapsed
- Кэш PayrollCache с TTL 5 мин
- Partial data rendering (если часть API упала)
- ACTIVE_DEV_IDS при фильтрации elapsed

### Видимость разработчиков

`hasVisiblePayroll` — правило видимости карточки разработчика:

```
tasks.length > 0
  OR elapsedHours > 0
  OR baseSalary > 0
  OR payrollAmount > 0
  OR adjustments.length > 0
```

Реализация (v7.1.0):
- `_prEnsureAllDevsInProjection()` добавляет ВСЕХ активных
  разработчиков в projection, даже с 0 часов, но с их baseSalary
- `_prGetFilteredProjection()` НЕ фильтрует разработчиков с
  `totalBase > 0 || totalAmount > 0` при проектных/статусных фильтрах
- Диагностический лог: каждый рендер карточек выводит список
  разработчиков с их метриками

**Предеин (ID 116)**: rate=0, base=200000, клиент rate=0
- Всегда виден благодаря baseSalary > 0
- Карточка показывает: 0.0h факт, 200,000 затраты
- Риски: LOW LOAD, RATE=0
- v7.1.0: Проходит проектный и статусный фильтры благодаря hasVisiblePayroll

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
├── data-loader.js                — Pipeline загрузки данных (v7.1.0)
├── tab-payroll-review.js         — UI модуль (v5.0.0+, Predein fix v7.1.0)
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
