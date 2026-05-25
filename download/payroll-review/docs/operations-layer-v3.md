# Operations Layer v3.0 — Payroll Review System

**Версия:** ПР-3.0.0  
**Дата:** 2026-05-19  
**Доменная модель:** v1.2.0  
**Pipeline:** Safe Fetch Pipeline v3.0

---

## 1. Архитектура загрузки данных (Loading Pipeline)

### 1.1. Пайплайн

```
LOAD TASKS → VERIFY PAGINATION → LOAD ELAPSED →
VERIFY ELAPSED → BUILD NORMALIZED MODEL → CACHE → RENDER
```

### 1.2. Стратегия загрузки: Period-Centric

Загрузка ведётся по **периоду**, не по задачам. Все данные за месяц загружаются полностью, отношения разработчик↔задача строятся локально.

**Флаг:** `PR_LOADER_CONFIG.periodCentric = true`

**Преимущества:**
- Количество запросов фиксировано: ~11 для задач (3 фильтра × 11 разработчиков) + 11 для elapsed + 1 для проектов
- Не зависит от количества задач — рост с 50 до 500 задач не увеличивает запросы
- Дедупликация задач по ID гарантирует уникальность

### 1.3. Загрузка задач

Для каждого разработчика выполняются **3 параллельных запроса**:

| Фильтр | Описание | API метод |
|--------|----------|-----------|
| Созданные в периоде | `>=CREATED_DATE` и `<=CLOSED_DATE` | `tasks.task.list` |
| В работе | `STATUS: '3'` | `tasks.task.list` |
| Закрытые в периоде | `>=CLOSED_DATE` и `<=CLOSED_DATE` | `tasks.task.list` |

Результаты дедуплицируются по ID задачи.

### 1.4. Загрузка elapsed

Загрузка elapsed ведётся **по разработчикам**, не по задачам. Один запрос `task.elapseditem.getlist` с `USER_ID` и фильтром по `CREATED_DATE` за период.

**Запросов:** 11 (по числу разработчиков), не N+1 как при загрузке по задачам.

### 1.5. Пагинация

- **Размер страницы:** 50 записей (лимит Bitrix24)
- **Максимум страниц:** 100 (`PR_LOADER_CONFIG.maxPages`)
- **Цикл:** `while(r.next > 0)` — загружает до полного завершения
- **Concat:** `allItems = allItems.concat(items)` — правильное слияние, не overwrite
- **Защита от зацикливания:** если `start` не изменился между итерациями — break
- **Проверка total:** если `allItems.length < totalFromApi` — предупреждение о потере данных

---

## 2. Диагностика (Observability)

### 2.1. PR_DataLoadReport

Глобальный объект диагностики, обновляется в реальном времени:

| Поле | Описание |
|------|----------|
| `state` | idle / loading / partial / complete / failed |
| `startedAt` / `finishedAt` | Timestamps начала/конца загрузки |
| `tasksRequested` / `tasksLoaded` | Запрошено/загружено задач |
| `elapsedRequested` / `elapsedLoaded` | Запрошено/загружено elapsed |
| `tasksPages` / `elapsedPages` | Количество страниц пагинации |
| `apiRequests` | Общее количество API запросов |
| `failedRequests` | Количество неудачных запросов |
| `retries` | Количество повторных попыток |
| `duplicateElapsedIds` | ID дублирующихся elapsed |
| `orphanElapsedIds` | ID orphan elapsed (без задачи) |
| `pageGaps` | Пропуски между страницами |
| `errors` / `warnings` | Массивы ошибок и предупреждений |

### 2.2. datasetMeta — Модель свежести данных

| Поле | Описание |
|------|----------|
| `lastSyncStartedAt` | Timestamp начала последней синхронизации |
| `lastSyncCompletedAt` | Timestamp завершения последней синхронизации |
| `tasksSyncedCount` | Количество синхронизированных задач |
| `elapsedSyncedCount` | Количество синхронизированных elapsed |
| `failedRequests` | Количество неудачных запросов в последней синхронизации |
| `retries` | Количество повторных попыток в последней синхронизации |
| `completenessVerified` | Подтверждена ли полнота данных |
| `syncDurationMs` | Длительность синхронизации в мс |

### 2.3. Визуальная панель диагностики

Панель встроена в UI, видна **без консоли**:
- Состояние загрузки (цветной индикатор: зелёный/жёлтый/красный)
- Сетка метрик: задач загружено, elapsed записей, строк обзора
- Сетка pipeline: страниц задач, страниц elapsed, повторных попыток, неудачных запросов
- Секция свежести: источник, время загрузки, полнота, последняя синхронизация
- Секция аномалий данных: дубликаты, orphan, пропуски страниц
- Секция валидации: ошибки, предупреждения
- Секция обнаруженных аномалий (из Phase 8)
- Секция курсора синхронизации

Панель сворачиваемая — кнопка «Свернуть/Развернуть».

### 2.4. Step-based Loading UI

Загрузка отображается как последовательность шагов:

1. **Загрузка задач...** — с прогрессом `current/total`
2. **Загрузка elapsed...** — с прогрессом
3. **Слияние страниц...**
4. **Проверка целостности...**
5. **Построение проекций...**
6. **Рендеринг...**

Каждый шаг: ✓ (выполнен), ● (активный), номер (ожидает).

### 2.5. window.__PAYROLL_DEBUG()

Консольная функция для полного отчёта. Включает:
- Все поля PR_DataLoadReport
- Adaptive throttle состояние
- Sync cursor
- Текущие данные рендера

---

## 3. Модель свежести данных (Data Freshness)

### 3.1. Принципы

- **Stale/partial dataset НЕ показывается как актуальный.**
- UI отображает: Last sync, Dataset status, Sync completeness.
- Если `completenessVerified === false` — показывается предупреждение.
- Если `loadState !== 'complete'` — таблица не рендерится (только loading UI).

### 3.2. Состояния загрузки

| Состояние | Описание | UI |
|-----------|----------|-----|
| `idle` | Начальное состояние | Пусто |
| `loading` | Загрузка в процессе | Step-based loader |
| `partial` | Задачи загружены, elapsed ещё нет | Не показывается |
| `complete` | Все данные загружены | Полный UI |
| `failed` | Ошибка загрузки | Сообщение об ошибке |

---

## 4. Обнаружение аномалий (Anomaly Engine)

### 4.1. Типы аномалий

| Тип | Условие | Серьёзность | Лейбл |
|-----|---------|-------------|-------|
| `overburn` | billable > payroll × 1.2 | critical | Переработка |
| `huge_delta` | |billable - fact| > fact × 0.5 | warning | Большой разбег |
| `no_elapsed` | factHours = billableHours = payrollHours = 0 | info | Нет elapsed |
| `excessive` | factHours > 40 | warning | Слишком много часов |
| `neg_margin` | grossMargin < 0 | critical | Отрицательная маржа |
| `missing_rate` | rate ≤ 0 && payrollHours > 0 | info | Нет ставки |
| `duplicate` | Дубликат elapsed (из PR_DataLoadReport) | warning | Дубликат elapsed |

### 4.2. Визуализация

- Цветные бейджи рядом с задачей в таблице: 🔴 critical, 🟡 warning, 🔵 info
- Количество аномалий в заголовке
- Детали в панели диагностики

---

## 5. Синхронизация

### 5.1. Sync Cursor

```javascript
PR_SyncCursor = {
  lastTaskSync: 0,      // timestamp последней успешной загрузки задач
  lastElapsedSync: 0,   // timestamp последней успешной загрузки elapsed
  lastTaskCount: 0,     // количество задач при последней синхронизации
  lastElapsedCount: 0   // количество elapsed при последней синхронизации
}
```

- Сохраняется в localStorage через `PayrollStorage.saveSyncCursor(periodKey, cursor)`
- Загружается при смене периода
- В будущем: инкрементальная загрузка только delta

### 5.2. Автообновление

- Интервал: 300 секунд (5 минут)
- Проверка: `_pr.loading === false` перед запуском
- Защита от race conditions: `_pr.loadId` инкрементируется при каждой загрузке

---

## 6. Сетевое укрепление (Network Hardening)

### 6.1. Exponential Backoff

```javascript
function _prBackoffDelay(attempt) {
  var base = PR_LOADER_CONFIG.retryDelay;  // 1000ms
  var delay = base * Math.pow(2, attempt);
  var jitter = Math.random() * base;
  return Math.min(delay + jitter, 30000);  // cap at 30s
}
```

### 6.2. Adaptive Throttle

```javascript
_prAdaptiveThrottle = {
  currentDelay: 200,   // текущая задержка между запросами
  minDelay: 200,       // минимум
  maxDelay: 5000,      // максимум
  increaseOnRateLimit: function() { this.currentDelay = Math.min(this.currentDelay * 2, this.maxDelay); },
  decreaseOnSuccess: function() { this.currentDelay = Math.max(this.currentDelay * 0.9, this.minDelay); }
};
```

### 6.3. Retry Classification

| Категория | Ключевые слова | Поведение |
|-----------|----------------|-----------|
| Retryable | rate, limit, timeout, network, 500, 502, 503, flood | Retry с backoff |
| Non-retryable | auth, not_found, invalid_method, access_denied | Fail immediately |
| Unknown | — | Retry once |

### 6.4. Request Cancellation

При каждой новой загрузке предыдущие запросы отменяются через `_prCancelPendingRequests()`.

### 6.5. Stale Request Ignore

Защита через `loadId`: если ответ пришёл от устаревшей загрузки — игнорируется.

---

## 7. Bulk Operations

### 7.1. Multi-select

- Чекбокс в каждой строке + «Select All» в заголовке
- `_pr.selectedRows` — объект с выбранными индексами

### 7.2. Bulk Actions

| Действие | Описание |
|----------|----------|
| Bulk Approve | Подтвердить все выбранные строки |
| Bulk Exclude | Исключить все выбранные строки |
| Bulk Rate Apply | Применить ставку ко всем выбранным |
| Bulk Export | Экспортировать только выбранные строки |

---

## 8. Финансовая визуализация

### 8.1. Sticky Summary Bar

Фиксированная панель внизу экрана, всегда видна при прокрутке:

| Показатель | Описание |
|------------|----------|
| Факт часы | Сумма factHours |
| Billable | Сумма billableHours |
| Payroll | Сумма payrollHours |
| Сумма выплат | Сумма payrollAmount |
| Клиенту | Сумма clientAmount |
| Маржа | clientAmount - payrollAmount |
| Риск | Уровень на основе margin% |

### 8.2. Diff View

Переключатель «Δ Diff» в заголовке. При активации:
- Дополнительные столбцы: Δ Billable, Δ Payroll
- Цветовое кодирование: зелёный (+), красный (−), нейтральный (=)

---

## 9. Audit Timeline

Хронологический просмотр аудиторского лога:
- Каждая запись: timestamp, actor, action, details
- Цветовое кодирование по типу действия
- Доступен через кнопку «⏱ Аудит» в заголовке

---

## 10. Table Scalability

### 10.1. Группировка

| Режим | Описание |
|-------|----------|
| По разработчику | Группировка по developerName |
| По проекту | Группировка по projectName |
| Без группировки | Плоская таблица |

Каждая группа — сворачиваемая, с агрегированной статистикой (задач, факт, выплат, сумма).

### 10.2. Row Count

При 1000+ задач:
- Отображается счётчик: «Показано N строк в M группах»
- Сворачивание групп уменьшает DOM
- Виртуальный скролл подготовлен через `_pr.virtualStart` / `_pr.virtualEnd`

---

## 11. Известные ограничения (Known Bottlenecks)

1. **Bitrix24 API pagination limit:** 50 записей на страницу, максимум 100 страниц = 5000 записей. При превышении — предупреждение.
2. **localStorage size:** ~5-10 MB. При большом количестве периодов может переполниться. Ограничение audit log: 1000 записей.
3. **No server-side pagination:** Вся фильтрация и сортировка — клиентская. При 1000+ строк — нагрузка на DOM.
4. **No delta sync:** Каждый раз загружаются все данные за период. Sync cursor подготовлен, но инкрементальная загрузка не реализована.
5. **AbortController:** Поддержка есть, но `bxPost()` не принимает signal. Полная отмена запросов требует модификации `bxPost`.
6. **Virtual scroll:** Подготовлена инфраструктура (`virtualStart`, `virtualEnd`), но полная реализация отложена до реальной необходимости (1000+ строк).

---

## 12. Стратегия будущей синхронизации

### 12.1. Текущая модель: Full Sync

Каждый запрос загружает **все** данные за период. Просто, но неэффективно при росте данных.

### 12.2. Подготовленная инфраструктура

- `PR_SyncCursor` — timestamp и counts последней успешной загрузки
- `PayrollStorage.saveSyncCursor()` / `loadSyncCursor()` — персистенция
- `_prLoadSyncCursor()` — загрузка при смене периода

### 12.3. Future: Incremental Sync

```javascript
// Будущая архитектура
if (cursor && cursor.lastTaskSync > 0) {
  // Загрузить только задачи, изменённые после cursor.lastTaskSync
  var deltaTasks = loadDeltaTasks(periodKey, cursor.lastTaskSync);
  // Слить с существующими данными
  mergeDelta(existingTasks, deltaTasks);
}
```

**Требует:**
- Bitrix24 API поддержку `>=DATE_MODIFIED` фильтра
- Механизм слияния (upsert + delete detection)
- Версионирование данных на клиенте

---

## 13. Конфигурация загрузчика

```javascript
PR_LOADER_CONFIG = {
  maxPages: 100,           // Максимум страниц пагинации
  pageSize: 50,            // Размер страницы Bitrix24
  retryCount: 3,           // Количество повторных попыток
  retryDelay: 1000,        // Базовая задержка между повторами (мс)
  requestTimeout: 30000,   // Таймаут запроса (мс)
  throttleDelay: 200,      // Минимальная задержка между запросами (мс)
  maxConcurrent: 3,        // Максимум параллельных запросов
  elapsedByDev: true,      // Загружать elapsed по разработчикам
  periodCentric: true      // Period-centric loading flag
};
```

---

## 14. Файловая структура

```
static/js/
├── core.js                              # APP_VERSION, DEVELOPERS, bxPost(), utilities
├── mock-data.js                         # PR_MOCK_MODE, prLoadPeriodData(), mock generation
├── payroll-review-styles.js             # PR_CSS — все стили
├── payroll-review-calc.js               # Legacy calc (deprecated, kept for compat)
├── payroll-review-storage.js            # Legacy storage (deprecated, kept for compat)
├── payroll-review-export.js             # Legacy export (deprecated, kept for compat)
├── tab-payroll-review.js                # UI module — _pr state, rendering, events
└── payroll/
    ├── payroll-data-loader.js           # Safe Fetch Pipeline, datasetMeta, sync cursor
    ├── payroll-domain.js                # Domain models, anomaly detection, audit
    ├── payroll-normalizer.js            # Elapsed normalization, grouping
    ├── payroll-review-engine.js         # Review engine, normalized model
    ├── payroll-projection.js            # Projections, totals, cache
    ├── payroll-storage.js               # PayrollStorage IIFE, sync cursor storage
    └── payroll-export.js               # Export DTO, CSV generation
```
