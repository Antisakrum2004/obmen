# Payroll Review System — Architecture v2

**Проект:** Зарплатный обзор (Payroll Review) для 1С-АйтиЛаб  
**Версия:** ПР-1.1.0  
**Дата:** 2026-05-19  
**Доменная модель:** v1.1.0

---

## 1. Обзор архитектуры

Система зарплатного обзора представляет собой task-centric financial review system, построенную вокруг сущности TaskReview (задача + разработчик). Архитектура следует принципу разделения слоёв: доменные модели не зависят от UI, хранилище абстрагировано, экспорт идёт через DTO.

### Flow данных

```
Bitrix24 Task + Elapsed
    ↓
normalizeElapsedBatch()       — парсинг, дедупликация, валидация
    ↓
groupElapsedByTask()          — группировка по (taskId, userId)
    ↓
buildFactHoursMap()           — агрегация секунд → часы
    ↓
buildReviewRows()             — создание TaskReview с defaults
    ↓
buildNormalizedModel()        — ЕДИНЫЙ источник истины
    ↓                           (snapshot для immutable, live для draft)
[Manager Review UI]           — редактирование billable/payroll/status
    ↓
PayrollExportDTO              — независимый от UI объект экспорта
    ↓
CSV / JSON / 1С XML           — сериализация
```

---

## 2. Доменные слои

### 2.1 Domain Layer (`payroll-domain.js`)

Центральный файл с доменными моделями и константами. НЕ зависит от DOM, НЕ зависит от storage.

**Сущности:**

- **TaskReview** — центральная модель: задача + разработчик + часы + деньги + ревью-статус
- **ReviewSnapshot** — иммутабельный согласованный срез TaskReview (frozen + checksum)
- **PeriodSnapshot** — иммутабельный согласованный срез периода (frozen + checksum + versioning)
- **PayrollPeriod** — расчётный период с state machine
- **DevCabinetView** — представление для разработчика (только payroll данные)
- **AuditLogEntry** — запись аудиторского следа
- **ValidationReport** — отчёт валидации (errors/warnings/info)

**Типы часов:**

| Поле | Описание | Редактируемость |
|------|----------|----------------|
| factHours | Фактические из Bitrix24 | readonly |
| billableHours | Оплата клиенту | менеджер |
| payrollHours | К выплате разработчику | менеджер |

**Финансовая модель (profitability):**

| Поле | Описание | Формула |
|------|----------|---------|
| rate | Payroll ставка (р/час) | из конфига/админки |
| base | Базовая часть (оклад) | из конфига/админки |
| payrollAmount | Сумма к выплате | payrollHours × rate + base |
| clientRate | Ставка для клиента | из конфига (fallback на rate) |
| clientAmount | Сумма от клиента | billableHours × clientRate |
| grossMargin | Валовая маржа | clientAmount − payrollAmount |
| marginPercent | Маржа в % | grossMargin / clientAmount × 100 |
| overburnHours | Переработка | max(0, billableHours − payrollHours) |

**Version conflict protection:**

| Поле | Описание |
|------|----------|
| version | Optimistic locking версия (инкремент при каждом обновлении) |
| revisionId | Уникальный ID ревизии |

**Константы:**

- `PR_REVIEW_STATUS` — статусы ревью (pending/approved/disputed/excluded)
- `PR_REVIEW_TRANSITIONS` — допустимые переходы статусов
- `PR_PERIOD_STATUS` — статусы периода (draft/review/approved/locked/exported/paid)
- `PR_PERIOD_TRANSITIONS` — допустимые переходы периодов

### 2.2 Normalization Layer (`payroll-normalizer.js`)

Преобразует сырые elapsed записи из Bitrix24 в нормализованные доменные объекты.

**Функции:**

- `normalizeElapsedEntry()` — нормализация одной записи
- `normalizeElapsedBatch()` — пакетная нормализация с отчётом
- `groupElapsedByTask()` — группировка по (taskId, userId)
- `groupElapsedByDeveloper()` — группировка по разработчику
- `aggregateFactHours()` — агрегация факт-часов
- `buildFactHoursMap()` — построение карты факт-часов
- `findOrphanTasks()` — обнаружение orphan задач
- `findExcludedGroupTasks()` — задачи в исключённых проектах
- `generateQualityReport()` — отчёт о качестве данных

**Конфигурация нормализации (`PR_NORM_CONFIG`):**

- minSeconds: 60 (минимум 1 минута)
- maxSeconds: 86400 (максимум 24 часа)
- maxHoursPerTaskPerDev: 200 (подозрительно если больше)

### 2.3 Review Engine (`payroll-review-engine.js`)

Строит TaskReview[] из нормализованных данных. Управляет состоянием ревью.

**Единый источник истины:**

- `buildNormalizedModel()` — строит NormalizedReviewModel
  - Immutable периоды → данные из snapshot
  - Draft/review периоды → live elapsed + saved reviews
  - Fallback → live если snapshot не найден

**Операции над ревью:**

- `updateReviewField()` — обновление поля с валидацией + version increment
- `transitionReviewStatus()` — переход статуса с валидацией + version increment
- `approveAllPending()` — массовое подтверждение
- `serializeReviews()` — сериализация для storage
- `deserializeReviews()` — десериализация из storage

### 2.4 Projection Layer (`payroll-projection.js`)

Вычисляет прогнозы выплат, маржу, итоги периода.

**Функции:**

- `buildMonthlyProjection()` — прогноз по разработчикам
- `buildPeriodTotals()` — итоги периода
- `calculatePayrollAmount()` — сумма выплаты для одной записи
- `calculateMargin()` — маржа для одной записи
- `calculateDeveloperSummary()` — сводка по разработчику
- `filterReviews()` — фильтрация по критериям
- `sortReviews()` — сортировка
- `getUniqueFieldValues()` — уникальные значения
- `sumReviewField()` — суммирование поля

**Memoization (performance):**

- `buildMonthlyProjectionCached()` — кэшированная projection
- `buildPeriodTotalsCached()` — кэшированные totals
- `invalidateProjectionCache()` — сброс кэша

### 2.5 Storage Layer (`payroll-storage.js`)

Абстракция хранения. UI НЕ знает о localStorage, JSON schema, persistence internals.

**PayrollStorage API:**

| Метод | Описание |
|-------|----------|
| loadReviews(year, month) | Загрузить ревью за период |
| saveReviews(year, month, reviews) | Сохранить ревью |
| saveSingleReview() | Сохранить одно ревью |
| deleteSingleReview() | Удалить одно ревью |
| saveSnapshot(periodKey, snapshot) | Сохранить snapshot (с write-guard) |
| loadSnapshot(periodKey) | Загрузить snapshot (с integrity check + deep copy) |
| deleteSnapshot(periodKey) | Удалить snapshot (с write-guard) |
| savePeriodState() | Сохранить состояние периода |
| loadPeriodState() | Загрузить состояние периода |
| saveAuditLog() | Сохранить аудит-лог |
| loadAuditLog() | Загрузить аудит-лог |
| appendAuditLog() | Добавить записи в аудит-лог |
| loadDevSettings() | Загрузить настройки разработчика |
| saveDevSettings() | Сохранить настройки разработчика |
| loadFilters() / saveFilters() | Фильтры |
| loadSettings() / saveSettings() | Настройки |
| loadHook() / saveHook() | Вебхук |
| clearAll() | Очистить все данные |
| getSavedPeriods() | Список сохранённых периодов |
| getStorageSize() | Размер хранилища |

**Write-guard:** saveSnapshot/deleteSnapshot блокируют операции для immutable периодов (approved/locked/exported/paid).

**Integrity check:** loadSnapshot проверяет checksum при загрузке. Повреждённые данные не возвращаются.

**Deep copy:** loadSnapshot возвращает deep copy, чтобы предотвратить мутацию через ссылку.

### 2.6 Export Layer (`payroll-export.js`)

Экспорт получает данные ТОЛЬКО через PayrollExportDTO, НЕ из DOM.

**DTO pipeline:**

```
review snapshot / TaskReview[]
    ↓
createPayrollExportDTO()
    ↓
PayrollExportDTO { aggregated, detailed }
    ↓
serializeDTOToAggregatedCSV() / serializeDTOToDetailedCSV()
    ↓
downloadCSV()
```

### 2.7 Event Layer (`PayrollEvents`)

Lightweight event bus для развязки core logic от analytics/notifications/integrations.

**События:**

| Событие | Описание |
|---------|----------|
| review:updated | Изменено поле ревью |
| review:approved | Ревью подтверждено |
| snapshot:created | Создан snapshot |
| period:locked | Период заблокирован |
| export:generated | Экспорт выполнен |
| validation:failed | Валидация не прошла |
| audit:created | Создана запись аудита |

**API:**

- `PayrollEvents.on(event, callback)` — подписка (возвращает unsubscribe)
- `PayrollEvents.once(event, callback)` — одноразовая подписка
- `PayrollEvents.emit(event, data)` — отправка события
- `PayrollEvents.off(event)` — отписка
- `PayrollEvents.getActiveEvents()` — debug: список активных событий

---

## 3. Snapshot Immutability

После approval/locked/paid данные периода становятся immutable financial record.

### Защита:

1. **Deep clone protection:** все вложенные объекты копируются при создании snapshot
2. **Object.freeze():** snapshot замораживается после создания
3. **Snapshot versioning:** snapshotVersion инкрементируется при пересоздании
4. **Checksum/hash:** DJB2 hash для обнаружения порчи данных
5. **Write-guard:** PayrollStorage блокирует перезапись/удаление immutable snapshots
6. **Load verification:** при загрузке checksum пересчитывается и сравнивается
7. **Deep copy on load:** loadSnapshot возвращает копию, не оригинал

### Функции:

- `isPeriodSnapshotImmutable(status)` — проверка immutable-статуса
- `verifySnapshotIntegrity(snapshot)` — проверка целостности
- `isSnapshotFrozen(snapshot)` — проверка Object.freeze
- `unfreezeSnapshot(frozenSnapshot)` — создать изменяемую копию

---

## 4. State Machine

### Review Status

```
pending  ←→  approved
pending  ←→  disputed
pending  ←→  excluded
disputed ←→  approved
disputed ←→  excluded
```

### Period Status

```
draft → review → approved → locked → exported → paid
           ↑                              |
           └──────── (rollback) ─────────┘
```

**Transition validator (`validatePeriodTransition`):**

- paid → что-либо: ЗАПРЕЩЕНО (paid_no_rollback)
- locked → не exported: ЗАПРЕЩЕНО (locked_mutation)
- exported → не paid: ЗАПРЕЩЕНО (exported_no_rollback)
- Любой невалидный переход: ЗАПРЕЩЕНО (invalid_transition)

---

## 5. Validation Engine

### ValidationReport

```javascript
{
  errors: [],     // Критические — блокируют операции
  warnings: [],   // Предупреждения — не блокируют
  info: [],       // Информационные
  isValid: true,
  hasWarnings: false,
  checkedAt: Date.now()
}
```

### Проверки (validateTaskReview):

| Код | Проверка |
|-----|----------|
| negative_billable | billableHours < 0 |
| negative_payroll | payrollHours < 0 |
| negative_fact | factHours < 0 |
| excessive_billable | billableHours > 200 |
| missing_rate | rate <= 0 при payrollHours > 0 |
| invalid_rate | rate не валидное число |
| nan_fact | factHours не число |
| nan_amount | payrollAmount не число |
| missing_developer | developerId отсутствует |
| missing_task | taskId отсутствует |
| locked_period_mutation | попытка изменить immutable период |
| invalid_status | неизвестный статус ревью |
| duplicate_review | дублирующийся reviewKey (batch) |

---

## 6. Version Conflict Protection

Optimistic locking через version + revisionId на каждой сущности TaskReview.

- При каждом обновлении: version++, новый revisionId
- При конфликте: `checkVersionConflict(current, stored)` возвращает `{ hasConflict, message }`
- Сериализация: version и revisionId сохраняются в storage

---

## 7. Dev Cabinet Security

Данные для разработчика проходят через `createDevCabinetView()`, которая создаёт отдельную data model.

**Разработчик видит ТОЛЬКО:**

- taskId, taskTitle, projectName
- payrollHours (сколько часов к выплате)
- reviewStatus, managerComment

**Разработчик НЕ видит (data-level, НЕ UI hiding):**

- billableHours, factHours
- rate, base, payrollAmount
- clientRate, clientAmount
- grossMargin, marginPercent, overburnHours

---

## 8. Source of Truth

### Единый источник: NormalizedReviewModel

```
buildNormalizedModel()
    ↓
if (period immutable) → loadSnapshot() → _restoreRowsFromSnapshot()
else                  → buildReviewRows() → live elapsed + saved reviews
```

Все потребители (KPI, таблица, проекции, экспорт, админка, dev cabinet) читают из единой модели.

---

## 9. Файловая структура

```
payroll-review/
├── api/
│   └── index.py                    # Flask прокси + static files
├── static/
│   ├── index.html                  # SPA entry point
│   ├── favicon.svg
│   └── js/
│       ├── payroll/                # Domain modules (v1.1.0)
│       │   ├── payroll-domain.js   # Domain models, events, validation
│       │   ├── payroll-normalizer.js  # Normalization layer
│       │   ├── payroll-review-engine.js  # Review engine + SSOT
│       │   ├── payroll-projection.js     # Projections + memoization
│       │   ├── payroll-storage.js        # Storage abstraction
│       │   └── payroll-export.js         # Export DTO + serializers
│       ├── core.js                 # Constants, API, utilities
│       ├── mock-data.js            # Mock data + real data loader
│       ├── payroll-review-calc.js  # Legacy calc (backward compat)
│       ├── payroll-review-storage.js  # Legacy storage (backward compat)
│       ├── payroll-review-export.js   # Legacy export (backward compat)
│       ├── payroll-review-styles.js   # CSS-as-JS
│       └── tab-payroll-review.js      # UI module
├── docs/
│   ├── payroll-architecture-v2.md  # Этот документ
│   ├── payroll-refactor-audit.md   # Аудит v0.4.1
│   └── payroll-domain-model.md     # Domain model v0.4
├── vercel.json
└── requirements.txt
```

---

## 10. Критерии успеха

Архитектура выдержит добавление следующих фич БЕЗ переписывания:

- KPI и метрики эффективности
- Штрафы и бонусы
- Profitability analytics
- Client billing и multi-rate проекты
- Overtime / support work / internal work
- Payroll analytics и дашборды
- Мульти-организационная поддержка
- Интеграция с 1С через XML/JSON

**Принцип:** Каждый новый функционал = новый модуль, а не изменение существующего.
