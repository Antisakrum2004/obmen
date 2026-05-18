# Payroll Domain Model

## Основные сущности

### TaskReview

Центральная сущность системы. Связывает задачу, разработчика, часы и review-решение менеджера.

```
TaskReview {
  taskId:          String      // ID задачи в Bitrix24
  taskTitle:       String      // Название задачи
  projectName:     String      // Название проекта (group)
  projectId:       String      // ID проекта (groupId)
  developerId:     String      // ID разработчика
  developerName:   String      // Имя разработчика
  factHours:       Number      // Фактические часы (из elapsed, readonly)
  billableHours:   Number      // Часы, показываемые клиенту (editable менеджером)
  payrollHours:    Number      // Часы, оплачиваемые разработчику (editable менеджером)
  rate:            Number      // Ставка в рублях/час
  payrollAmount:   Number      // payrollHours * rate (вычисляемое)
  reviewStatus:    String      // 'pending' | 'approved' | 'disputed' | 'excluded'
  managerComment:  String      // Комментарий менеджера
  updatedAt:       Number      // timestamp последнего изменения
}
```

**Invariant**: `factHours` — readonly, источник истины из Bitrix24. `billableHours` и `payrollHours` могут быть любыми (включая 0 или больше fact).

### PayrollPeriod

Месячный период расчёта.

```
PayrollPeriod {
  year:            Number      // 2026
  month:           Number      // 1-12
  fromDate:        String      // "2026-05-01"
  toDate:          String      // "2026-05-31"
  status:          String      // 'open' | 'closed' | 'archived'
  totalFactHours:  Number      // Сумма factHours по всем TaskReview
  totalBillable:   Number      // Сумма billableHours
  totalPayroll:    Number      // Сумма payrollHours
  totalPayrollAmount: Number   // Сумма payrollAmount
  estimatedMargin: Number      // (billable - payroll) * avgRate (упрощённо)
}
```

### PayrollProjection

Агрегированный прогноз по разработчику за период.

```
PayrollProjection {
  developerId:     String
  developerName:   String
  periodKey:       String      // "2026-05"
  totalFactHours:  Number
  totalBillable:   Number
  totalPayroll:    Number
  totalAmount:     Number      // totalPayroll * rate
  taskCount:       Number      // Количество задач
  approvedCount:   Number      // Количество approved задач
  pendingCount:    Number      // Количество pending задач
  approvalRate:    Number      // approvedCount / taskCount (0-1)
}
```

### PayrollExportRow

Строка для экспорта в CSV/1С.

```
PayrollExportRow {
  fullName:        String      // ФИО разработчика
  inn:             String      // ИНН (пока placeholder)
  period:          String      // "Май 2026"
  hours:           Number      // payrollHours
  rate:            Number      // Ставка
  amount:          Number      // hours * rate
  comment:         String      // Комментарий
}
```

---

## Flow данных

```
Bitrix24 Task
    ↓
Elapsed Entries (task.elapseditem.getlist)
    ↓
normalizeElapsed()           — парсинг, дедупликация, валидация
    ↓
groupElapsedByTask()         — группировка по (taskId, userId)
    ↓
aggregateTaskHours()         — суммирование секунд → минуты → часы
    ↓
buildTaskReviewRows()        — создание TaskReview с defaults
    ↓
mergeWithSavedReviews()      — загрузка manager adjustments из localStorage
    ↓
[Manager Review UI]          — редактирование billable/payroll/status
    ↓
saveReviews()                — сохранение в localStorage
    ↓
buildPayrollProjection()     — агрегация по разработчикам
    ↓
buildExportRows()            — форматирование для CSV
    ↓
CSV Export                   — скачивание файла
```

---

## Границы слоёв

### UI Layer
- Рендеринг таблиц, карточек, фильтров
- Обработка пользовательского ввода (inline edit, кнопки)
- CSS-инъекция, оверлеи, модалки
- Вызов domain functions по событиям

**Файлы**: `tab-payroll-review.js`, `payroll-review-styles.js`

### Aggregation Layer
- Нормализация elapsed entries
- Группировка по задачам
- Подсчёт часов
- Построение TaskReview rows
- Загрузка/сохранение review state

**Файлы**: `payroll-review-calc.js`, `payroll-review-storage.js`

### Domain Layer
- Business rules: fact/billable/payroll relationship
- Rate resolution (config-based, extensible)
- Review status transitions
- Projection calculation
- Export row formatting

**Файлы**: `payroll-review-calc.js` (domain functions)

### Export Layer
- CSV generation
- Future: 1С XML format
- File download

**Файлы**: `payroll-review-export.js`

### Persistence Layer
- localStorage read/write
- Key management (with module prefix `pr_`)
- Versioning / migration
- Mock data layer for development

**Файлы**: `payroll-review-storage.js`

---

## Rate Provider (extensible)

Текущий MVP использует config-based mapping:

```js
var DEV_RATES = {
  "18": 1000,    // Приходько Константин
  "38": 1300     // Соколовский Александр
};
```

Интерфейс rate provider:
```js
function prGetRate(developerId) {
  // MVP: lookup from DEV_RATES config
  // Future: fetch from API / period-based / project-based
  return DEV_RATES[developerId] || 0;
}
```

**Расширение** (не реализовывать сейчас, но закладывать):
- `prGetRate(developerId, periodKey)` — периодические ставки
- `prGetRate(developerId, projectId)` — проектные ставки
- `prGetRate(developerId, taskType)` — ставки по типу работ

---

## Review Status Flow

```
  [pending]  ← начальный статус для всех задач
      ↓
  [approved]  ← менеджер подтвердил
      ↓
  [exported]  ← включено в экспорт (future)

  [pending] → [disputed]  ← менеджер оспаривает часы
  [pending] → [excluded]  ← задача исключена из расчёта

  [disputed] → [approved]  ← после разбора
  [disputed] → [excluded]  ← после разбора
```

---

## Ключевые business rules

1. **factHours = readonly** — никогда не редактируется, источник = Bitrix24 elapsed
2. **billableHours default = factHours** — если менеджер не скорректировал
3. **payrollHours default = factHours** — если менеджер не скорректировал
4. **payrollAmount = payrollHours * rate** — всегда вычисляемое
5. **billableHours может быть > factHours** — если есть переработка для клиента
6. **payrollHours может быть 0** — если задача не оплачивается
7. **payrollHours может быть > factHours** — если есть бонус
8. **Review status 'excluded' = задача не участвует в projection и export**
9. **Все корректировки — на уровне задач** (task-centric, не monthly-centric)
10. **One TaskReview per (taskId, developerId)** — если в задаче списывали несколько разработчиков, создаётся отдельный TaskReview для каждого
