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

### ПР-7.1.0 — Pipeline fix

Критические исправления по результатам v7.0.0:

1. **Убран buffer 14 дней** — теперь ТОЧНЫЙ период (2026-05-01 — 2026-05-31)
2. **Убраны ACCOMPLICE запросы** — 111 лишних задач
3. **Пагинация 3→2 страницы** (150→100 задач на разработчика)
4. **Снижены лимиты**: tasks 400→250, elapsed 500→350
5. **Увеличена конкурентность**: 6→10 параллельных, delay 200→100ms
6. **Исправлена видимость Предеина** — разработчики с baseSalary>0
7. **Добавлен fromStr/toStr** в объект данных для нормализатора
8. **ACTIVE_DEV_IDS вместо DEV_IDS** при фильтрации elapsed

Результаты: 711:39 часов, 137 задач — лучше чем v7.0.0, но НЕ ВСЕ задачи за май

### ПР-7.2.0 — ELAPSED-FIRST DAY-BY-DAY (текущая)

Архитектурный сдвиг: от tasks-first к elapsed-first pipeline.

**Проблема v7.1.0**: RESPONSIBLE_ID + DATE_ACTIVITY фильтр терял задачи:
- Задачи где разработчик ACCOMPLICE (не RESPONSIBLE_ID)
- Задачи с May elapsed но старой DATE_ACTIVITY
- 711:39 часов вместо полного объёма

**Решение v7.2.0** (по мотивам bitrix-dashboard reference repo):

1. **ELAPSED-FIRST DAY-BY-DAY** — сначала ВСЕ записи времени за месяц
   - `task.elapseditem.getlist([0, {}, {>=CREATED_DATE, <=CREATED_DATE}, select])`
   - 31 параллельный запрос — по одному на каждый день
   - Фильтруем по USER_ID наших разработчиков

2. **Извлечение TASK_ID** из elapsed записей
   - Уникальные ID задач → загружаем метаданные batch

3. **Batch метаданных** — `tasks.task.list` с `filter: {ID: [batch]}`
   - По 50 ID за запрос
   - Заголовки, группы, статусы

4. **Orphan tasks** — задачи без метаданных (batch загрузка)

5. **Проекты** — `sonet_group.get` как прежде

**FALLBACK**: Если elapsed date API не работает:
- Переключаемся на TASKS-FIRST DAY-BY-DAY
- `tasks.task.list` с CREATED_DATE фильтром по дням (без RESPONSIBLE_ID!)
- Per-task elapsed как в v7.1.0

**Почему elapsed-first лучше**:
- Elapsed записи = источник истины для зарплатного обзора
- Если есть elapsed за май → задача ТОЧНО была в мае
- Не зависит от RESPONSIBLE_ID / ACCOMPLICE
- Не зависит от DATE_ACTIVITY (ненадёжный фильтр)
- Гарантированно находим ВСЕ часы за период

**Масштаб**: ~35 API вызовов, 5-15 секунд

## Архитектура v7.2.0

### Pipeline (ELAPSED-FIRST DAY-BY-DAY)

```
┌─────────────────────────────────────────────────┐
│ 1. PayrollCache.get(key)                        │
│    → Если кэш валидный (TTL 5 мин): мгновенный  │
│      возврат, без API запросов                   │
├─────────────────────────────────────────────────┤
│ 2. task.elapseditem.getlist (DAY-BY-DAY)        │
│    Для КАЖДОГО дня месяца (31 параллельно):      │
│    [0, {}, {>=CREATED_DATE, <=CREATED_DATE},     │
│     select: ID,TASK_ID,USER_ID,MINUTES,etc]     │
│    Пагинация: до 3 страниц на день               │
│    Фильтрация по ACTIVE_DEV_IDS клиент-сайд      │
├─────────────────────────────────────────────────┤
│ 3. Извлечение уникальных TASK_ID                 │
│    Из всех elapsed записей за месяц               │
├─────────────────────────────────────────────────┤
│ 4. tasks.task.list (batch по 50 ID)             │
│    filter: { ID: [taskId1, taskId2, ...] }       │
│    select: ID,TITLE,GROUP_ID,STATUS,etc          │
├─────────────────────────────────────────────────┤
│ 5. Orphan tasks (без метаданных)                 │
│    batch загрузка, max 100                        │
├─────────────────────────────────────────────────┤
│ 6. Загрузка проектов (sonet_group.get)           │
├─────────────────────────────────────────────────┤
│ 7. PayrollCache.set(key, data, 5 мин)           │
│    + fromStr/toStr для нормализатора             │
└─────────────────────────────────────────────────┘

   FALLBACK (если elapsed date API не работает):
┌─────────────────────────────────────────────────┐
│ 2'. tasks.task.list (DAY-BY-DAY)                │
│     CREATED_DATE фильтр, без RESPONSIBLE_ID      │
│     1 страница = 50 задач на день                │
├─────────────────────────────────────────────────┤
│ 3'. Per-task elapsed (как v7.1.0)               │
│     task.elapseditem.getlist(taskId)             │
└─────────────────────────────────────────────────┘
```

### Ожидаемый масштаб
- 31 + 2-5 + 1 = ~35 API вызовов
- 5-15 секунд загрузка
- ПОЛНЫЕ данные за месяц (без потерь)

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
- Load all tasks by developer (без даты фильтра)
- Recursive group scans
- All historical tasks
- Unbounded pagination
- RESPONSIBLE_ID фильтр (v7.2.0 — удалено, терялись ACCOMPLICE задачи)
- DATE_ACTIVITY фильтр (v7.2.0 — удалено, ненадёжный)

#### Обязательно
- ELAPSED-FIRST подход (v7.2.0) — сначала elapsed, потом задачи
- CREATED_DATE фильтр для elapsed (точный, надёжный)
- День за днём — 31 параллельный запрос
- Фильтрация по ACTIVE_DEV_IDS клиент-сайд
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
| `task.elapseditem.getlist` (per-task) | Работает | `[taskId, {ID:'DESC'}, {}]` |
| `task.elapseditem.getlist` (date filter) | ПРОВЕРЯЕТСЯ | `[0, {}, {>=CREATED_DATE, <=CREATED_DATE}, select]` — используется в bitrix-dashboard reference |
| `task.elapseditem.list` | НЕ СУЩЕСТВУЕТ | `ERROR_METHOD_NOT_FOUND` |
| `tasks.elapseditem.list` | НЕ СУЩЕСТВУЕТ | `ERROR_METHOD_NOT_FOUND` |
| `task.elapseditem.getlist` (batch URL) | СЛОМАН | URL format не передаёт positional array params |
| `sonet_group.get` | Работает | Загрузка проектов/групп |

### Структура файлов

```
public/js/
├── core.js                      — Константы, API, утилиты (ПР-7.0.0)
├── data-loader.js                — Pipeline загрузки данных (v7.2.0 — elapsed-first day-by-day)
├── tab-payroll-review.js         — UI модуль (v5.0.0+, Predein fix v7.1.0, pipeline v7.2.0)
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

## Известные баги (НЕИСПРАВЛЕННЫЕ)

### 1. Скролл в админке прыгает наверх
- **Симптом**: При нажатии любой кнопки в админке список прокручивается наверх
- **Причина**: `_prSaveAdmin()` → `_prScheduleRender()` → `_prRenderAll()` → `_pr.container.innerHTML = h` — ПОЛНОЕ пересоздание DOM
- **3 попытки FAILED**: scrollTop save/restore, double RAF, убирание _prScheduleRender
- **Решение**: Микросервисная разбивка — AdminService рендерит ТОЛЬКО свой .pr-modal-body

### 2. Сумма штрафа не отображается светло-красным
- **Симптом**: В админке поле штрафа должно быть светло-красным
- **Причина**: CSS не применяется корректно к input полю
- **Статус**: Не исправлено. В мокапе v2 зафиксирован цвет: `rgba(255,110,120,0.9)`

### 3. Формула выгрузки: base добавляется на КАЖДУЮ задачу (КРИТИЧЕСКИЙ)
- **Симптом**: 10800 вместо 10000 при ставке 1000 за 10 часов
- **Причина**: `payroll-review-calc.js:146` — `r.payrollAmount = Math.round(r.payrollHours * r.rate) + r.base`
  Добавляет `base` на каждую задачу. А `buildMonthlyProjection()` добавляет ЕЩЁ РАЗ на уровне разработчика.
  Итого: base × количество задач + base × 1 = двойной/множественный учёт
- **Решение**: Убрать `+ r.base` из `buildTaskReviewRows()`. Base добавляется ОДИН раз в `buildMonthlyProjection()`
- **Статус**: Не исправлено. Планируется в v10.0 Фаза 1

## План микросервисной разбивки

### Цель: «Один настраиваешь — остальное не ломается»

Разбить монолит `tab-payroll-review.js` (2398 строк) на 7 сервисов + EventBus:

| Сервис | Ответственность | Строк |
|--------|----------------|-------|
| SVC 1: Data | Загрузка, кэш, нормализация | ~120 |
| SVC 2: Admin | Модалка, ставки, штрафы, проекты | ~320 |
| SVC 3: Review | Статусы, часы, слайдеры, пресеты | ~260 |
| SVC 4: Cards | Карточки, KPI, фильтры, таблица, таймлайн | ~620 |
| SVC 5: Export | CSV экспорт, диагностика, debug | ~200 |

Порядок: pr-bus.js → AdminService (решает скролл-баг) → ReviewService → CardsService → ExportService → тонкий оркестратор

## v9.1 — Мокап v2 (НЕ В PROD)

Цвета: цифры `rgba(210,215,225,0.88)`, ЗП зелёная `rgba(52,211,153,0.85)`, штрафы красные `rgba(255,110,120,0.9)`, лейблы +20% ярче. KPI блоки одинаковые: min-height:100px + 1fr. Кнопки: active translateY(1px) scale(0.97). Tooltip словарь 30+ элементов.

---

## v10.0 — ПЛАН РЕАЛИЗАЦИИ 9 ФИЧ (НЕ КОДИМ — ТОЛЬКО ПЛАН)
Дата: 2026-05-25
Статус: **ПЛАН** — ожидает подтверждения перед реализацией

### КОРНЕВАЯ ПРОБЛЕМА: Расхождение формул

В коде **ТРИ** параллельных пути расчёта payrollAmount:

```
Путь 1: payroll-review-calc.js:146
  r.payrollAmount = Math.round(r.payrollHours * r.rate) + r.base
  ↑ base добавляется НА КАЖДУЮ ЗАДАЧУ ← БАГ!

Путь 2: payroll-domain.js:142
  r.payrollAmount = Math.round(r.payrollHours * r.rate)
  ↑ base НЕ добавляется (комментарий: "added once per developer in projection")

Путь 3: payroll-projection.js:153
  d.totalAmount = d.totalAmount + baseSalary - fine
  ↑ base добавляется ОДИН РАЗ на уровне projection
```

Если путь 1 добавляет base на задачу, а путь 3 ещё раз на разработчика — **base удваивается**.
При 10 задачах и base=200000: вместо 10*rate получаем 10*(rate+base) + base.

---

### Фича 1: Починить формулы выгрузки [P0 — КРИТИЧЕСКИЙ]

**Проблема**: `buildTaskReviewRows()` строка 146 добавляет `+ r.base` на каждую задачу.

**Решение**: Убрать `+ r.base`. Base добавляется один раз в `buildMonthlyProjection()`.

**Затронутые файлы**:
- `payroll-review-calc.js:146` — убрать `+ r.base`
- `payroll-review-export.js:28` — после фикса `totalAmount += r.payrollAmount` не содержит base, добавить отдельно

**Риски**: ВСЕ суммы изменятся. Нужно перерассчитать периоды.

---

### Фича 2: Детализация выплат («расчётный листок») [P1]

**Что**: По каждому разработчику — раскрытый вид с детализацией по задачам:
```
Задача #312 «Верстка»  Факт:12.5ч → К оплате:10ч → 10 000 руб
Задача #315 «API»      Факт:8.0ч  → К оплате:8.0ч → 8 000 руб
─── Итого по задачам: 18 000 руб
+ Базовая ЗП:         200 000 руб
- Штраф:              -20 000 руб
═══ К ВЫПЛАТЕ:        198 000 руб
```

**Затронутые файлы**:
- `tab-payroll-review.js` — +~80 строк: `_prRenderPaystub()`
- `payroll-review-styles.js` — +~40 строк: стили paystub
- **НЕ ТРОГАЕМ**: payroll/*.js — данные уже есть

---

### Фича 3: Корректировка часов в большую сторону [P1]

**Проблема**: Слайдер ограничен `0 <= billableHours <= factHours`.

**Решение**: Разрешить `billableHours > factHours` (до factHours * 1.5). Warning при превышении.

**Затронутые файлы**:
- `tab-payroll-review.js` — убрать `max=factHours` на слайдере
- `payroll-domain.js` — валидация: warning при `billableHours > factHours * 2`
- `cutHours` может стать отрицательным → переименовать в «Корректировка» с +/-

**Риски**: Маржа может стать отрицательной. Нужен warning.

---

### Фича 4: Три отдельные колонки часов [P1]

**Что**: Факт | К расчёту | Клиенту — три значения вместо двух.

**Уже есть**: `createTaskReview()` содержит `factHours`, `billableHours`, `payrollHours`.

**Затронутые файлы**:
- `tab-payroll-review.js` — `_prRenderOneDevCard()`, `_prRenderTable()`, `_prRenderTimelineItem()`
- `payroll-review-styles.js` — 3-колоночный layout
- **НЕ ТРОГАЕМ**: payroll/*.js — поля уже есть

**Зависимость**: Фича 3 (корректировка вверх) должна быть первой.

---

### Фича 5: Автоматический вычет правок [P2]

**Что**: Задачи в статусе «Правки» → время автоматически вычитается из billable.

**Нужно от заказчика**: Какие статусы Bitrix24 = «Правки»?

**Решение**:
1. DATA ENGINE: Сохранять STATUS из tasks.task.list в tasksMeta
2. FINANCE ENGINE: При `buildTaskReviewRows()` — если isRevisionStatus, то billable=0, payroll=factHours
3. UI: Метка «Правки» в таймлайне, флаг `autoDeducted: true`

**Затронутые файлы**:
- `payroll-domain.js` — +`isRevisionStatus()`, +`PR_TASK_STATUSES_DEDUCTIBLE`
- `payroll-review-calc.js` — автовычет для revision задач
- `data-loader.js` — сохранять STATUS в tasksMeta
- `tab-payroll-review.js` — визуальная метка

---

### Фича 6: Светлая тема [P2]

**Что**: Переключатель dark/light theme.

**Решение**: CSS custom properties + `data-theme` атрибут на корневом элементе.

**Затронутые файлы**:
- `payroll-review-styles.js` — +~60 строк: светлые переменные
- `tab-payroll-review.js` — toggle кнопка
- `payroll-review-storage.js` — pr_theme в localStorage

**Риски**: Все rgba из мокапа v2 hardcoded под тёмную тему — нужен пересчёт.

---

### Фича 7: Интеграция с 1С [P2]

**Что**: CSV для загрузки в 1С (счета, акты).

**Уже есть**: `payroll-review-export.js` генерирует CSV, но не в формате 1С.

**Нужно от заказчика**: Формат 1С (Бухгалтерия 3.0 / ЗУП / другая конфигурация).

**Новый формат**:
```
Организация;ИНН;КПП;Период;Услуга;Кол-во;Ед.;Цена;Сумма;НДС%;Сумма НДС;Всего
```

**Затронутые файлы**:
- `payroll-review-export.js` — +~80 строк: `generate1CExport()`
- `tab-payroll-review.js` — кнопка «Экспорт 1С»
- `payroll-review-storage.js` — реквизиты компании

---

### Фича 8: План/Факт [P3]

**Что**: Блок планирования — сравнение заложенных часов с фактически отработанными.

**Вариант A** (рекомендую): Использовать `TIME_ESTIMATE` из Bitrix24 tasks.task.list.
**Вариант B**: Ручной ввод плана в админке.

**Затронутые файлы**:
- `data-loader.js` — добавить TIME_ESTIMATE в select
- `payroll-review-calc.js` — `plannedHours` из taskMeta
- `payroll-projection.js` — `totalPlannedHours`, `deltaHours`
- `tab-payroll-review.js` — рендер План/Факт блока
- `payroll-review-styles.js` — стили

**Риски**: TIME_ESTIMATE может быть не заполнен в Bitrix24.

---

### Фича 9: Комментарии к времени [P0 — ПРОСТАЯ ПРАВКА]

**Что**: Показывать комментарии разработчиков к elapsed записям.

**Уже есть**: `normalizeElapsed()` сохраняет `entry.COMMENT_TEXT` в `comment` — данные ЗАГРУЖАЮТСЯ, но НЕ ОТОБРАЖАЮТСЯ.

**Затронутые файлы**:
- `tab-payroll-review.js` — `_prRenderTimelineItem()`: +1 строка с комментарием
- `payroll-review-styles.js` — мелкий шрифт, обрезка 60 символов + tooltip
- Минимальные изменения!

---

### ПОРЯДОК РЕАЛИЗАЦИИ

```
Фаза 1 — КРИТИЧЕСКИЕ (P0):
  ├── 1. Починить формулы (base удваивается) — FINANCE ENGINE
  └── 9. Показать комментарии (данные уже есть) — UI ENGINE

Фаза 2 — ВАЖНЫЕ (P1):
  ├── 3. Корректировка часов вверх — UI + FINANCE ENGINE
  ├── 4. Три колонки часов — UI ENGINE
  └── 2. Расчётный листок — UI ENGINE

Фаза 3 — УЛУЧШЕНИЯ (P2):
  ├── 5. Автовычет правок (нужны статусы Bitrix24) — DATA + FINANCE ENGINE
  ├── 6. Светлая тема — UI ENGINE
  └── 7. 1С экспорт (нужен формат) — FINANCE + UI ENGINE

Фаза 4 — ПЛАНИРОВАНИЕ (P3):
  └── 8. План/Факт — DATA + UI ENGINE
```

### ЗАВИСИМОСТИ

```
Фича 1 (формулы) → ПЕРВАЯ, все остальные зависят от корректных расчётов
Фича 3 (корректировка ↑) → Фича 4 (три колонки имеют смысл при ↑)
Фича 5 (автовычет) → нужны статусы от заказчика
Фича 7 (1С) → нужен формат от заказчика
Фича 8 (план/факт) → нужен TIME_ESTIMATE из Bitrix24
```

### 5 ДВИЖКОВ (модульная архитектура)

| Движок | Файлы | Правило |
|--------|-------|---------|
| DATA ENGINE | data-loader.js, payroll-cache.js, payroll-normalizer.js | Только Фичи 5,8 затрагивают |
| FINANCE ENGINE | payroll-projection.js, payroll-domain.js, payroll-review-calc.js | Фича 1 багфикс, Фича 5 автовычет |
| UI ENGINE | tab-payroll-review.js, payroll-review-styles.js | Основной объём |
| ADMIN ENGINE | Админка в tab-payroll-review.js | Фича 7 реквизиты |
| TIMELINE ENGINE | _prRenderTimeline*() | Фичи 9, 4 |

### Lessons learned
- ДВА пути расчёта payrollAmount — гарантированный источник багов. После фикса оставить ОДИН путь (через payroll-domain.js calculateReviewAmount())
- base salary = одна выплата на разработчика, НЕ на задачу
- COMMENT_TEXT уже загружается — нужно просто отобразить
- CSS переменные позволяют сделать светлую тему минимальными правками
