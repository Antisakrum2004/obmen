/* ═══════════════════════════════════════════════════════════════
   mock-data.js — Data Loading Layer for Payroll Review
   v5.0.0 — INVERTED PIPELINE: elapsed-first, period-bounded

   Pipeline:
   1. LOAD ELAPSED ONLY (period-bounded: current + prev month)
   2. EXTRACT UNIQUE TASK IDS from elapsed
   3. LOAD ONLY REFERENCED TASKS by ID
   4. NORMALIZE + BUILD MODEL
   5. CACHE

   Source of truth for payroll = elapsed entries, NOT tasks.task.list

   Critical constraints:
   - Period-bounded: ONLY current month + previous month
   - Max 3 concurrent API calls (throttled queue)
   - Max tasks loaded = 300
   - Max elapsed entries = 5000
   ═══════════════════════════════════════════════════════════════ */

var PR_MOCK = {};

/* ─── Генерация моковых данных ─── */
function PR_MOCK_generate() {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth(); /* 0-based */
  var today = now.getDate();

  /* ─── Проекты — реальные GROUP_ID из Bitrix24 ─── */
  PR_MOCK.projects = {};
  Object.keys(PROJECTS).forEach(function(gid) {
    if (!EXCLUDE_GROUPS[gid]) {
      PR_MOCK.projects[gid] = {id: gid, name: PROJECTS[gid]};
    }
  });

  /* ─── Задачи — реалистичные для 1С-АйтиЛаб ─── */
  PR_MOCK.tasks = [
    {id:'6801',title:'Настройка обмена 1С-Битрикс для Бигап',groupId:'6',status:'5',responsibleId:'18'},
    {id:'6802',title:'Интеграция REST API Битрикс — заказы',groupId:'6',status:'5',responsibleId:'18'},
    {id:'6803',title:'Фикс ошибки выгрузки каталога',groupId:'6',status:'3',responsibleId:'18'},
    {id:'6804',title:'Настройка синхронизации остатков Дакар',groupId:'32',status:'5',responsibleId:'18'},
    {id:'6805',title:'Доработка документа Реализация',groupId:'32',status:'5',responsibleId:'18'},
    {id:'6806',title:'Миграция БД Медицина КЗ на новый сервер',groupId:'36',status:'5',responsibleId:'38'},
    {id:'6807',title:'Рефакторинг модуля расчёта листов нетрудоспособности',groupId:'36',status:'5',responsibleId:'38'},
    {id:'6808',title:'Code review — спринт 18 Керамика',groupId:'74',status:'5',responsibleId:'38'},
    {id:'6809',title:'Аудит безопасности Керамика Фабрика',groupId:'72',status:'1',responsibleId:'38'},
    {id:'6810',title:'Настройка обмена с 1С Керамика',groupId:'74',status:'5',responsibleId:'38'},
    {id:'6811',title:'Новый аналитический отчёт ВДЛ',groupId:'20',status:'5',responsibleId:'54'},
    {id:'6812',title:'Фильтры по дате и проекту МАРКДЖЕТ',groupId:'70',status:'5',responsibleId:'54'},
    {id:'6813',title:'Мобильная адаптация ЛК ВДЛ',groupId:'20',status:'3',responsibleId:'54'},
    {id:'6814',title:'Доработка печатной формы МАРКДЖЕТ',groupId:'70',status:'5',responsibleId:'54'},
    {id:'6815',title:'Экспорт данных CSV/XLSX Нейс-Юг',groupId:'62',status:'5',responsibleId:'80'},
    {id:'6816',title:'Деплой релиза Кондитеры на прод',groupId:'60',status:'5',responsibleId:'80'},
    {id:'6817',title:'CI/CD pipeline настройка Нейс-Юг',groupId:'62',status:'3',responsibleId:'80'},
    {id:'6818',title:'Оптимизация SQL запросов Кондитеры',groupId:'60',status:'5',responsibleId:'80'},
    {id:'6819',title:'Регрессионное тестирование Бигап',groupId:'6',status:'5',responsibleId:'82'},
    {id:'6820',title:'Написание тест-кейсов Q2 Бигап',groupId:'6',status:'5',responsibleId:'82'},
    {id:'6821',title:'Автотесты API Кровля',groupId:'8',status:'1',responsibleId:'82'},
    {id:'6822',title:'Нагрузочное тестирование Кровля',groupId:'8',status:'5',responsibleId:'82'},
    {id:'6823',title:'Техническая документация ОПТИМАПЛАСТ',groupId:'52',status:'5',responsibleId:'92'},
    {id:'6824',title:'Ревью требований заказчика Белолапотко',groupId:'50',status:'1',responsibleId:'92'},
    {id:'6825',title:'Аналитика метрик Q2 ОПТИМАПЛАСТ',groupId:'52',status:'5',responsibleId:'92'},
    {id:'6826',title:'Разработка модуля интеграции Милл ФАУЗ',groupId:'64',status:'5',responsibleId:'94'},
    {id:'6827',title:'Фикс ошибки отчёта Приправы Дона',groupId:'44',status:'5',responsibleId:'94'},
    {id:'6828',title:'Настройка обмена с 1С Приправы Дона',groupId:'44',status:'3',responsibleId:'94'},
    {id:'6829',title:'Верстка email-шаблонов Иванов',groupId:'66',status:'5',responsibleId:'96'},
    {id:'6830',title:'Фикс email рассылки Иванов',groupId:'66',status:'5',responsibleId:'96'},
    {id:'6831',title:'Лендинг промо-акции АМР',groupId:'40',status:'3',responsibleId:'96'},
    {id:'6832',title:'Настройка документа Заказ-наряд Самокаты',groupId:'18',status:'5',responsibleId:'98'},
    {id:'6833',title:'Доработка отчёта АгроСервис',groupId:'12',status:'5',responsibleId:'98'},
    {id:'6834',title:'Фикс ошибки в расчёте АгроСервис',groupId:'12',status:'5',responsibleId:'98'},
    {id:'6835',title:'Настройка обмена 1С Самокаты',groupId:'18',status:'5',responsibleId:'98'},
    {id:'6836',title:'Планирование архитектуры ЮРИСТЫ БИГАП',groupId:'82',status:'5',responsibleId:'1'},
    {id:'6837',title:'Консультация по интеграции Живое пиво',groupId:'4',status:'5',responsibleId:'1'},
    {id:'6838',title:'Ревью кода ЮРИСТЫ БИГАП спринт 19',groupId:'82',status:'5',responsibleId:'1'},
    {id:'6839',title:'Разработка модуля лизинга МС Лизинг',groupId:'16',status:'5',responsibleId:'116'},
    {id:'6840',title:'Доработка калькулятора АвтоБриф',groupId:'14',status:'5',responsibleId:'116'},
    {id:'6841',title:'Фикс ошибки валидации МС Лизинг',groupId:'16',status:'3',responsibleId:'116'}
  ];

  /* ─── Elapsed entries ─── */
  var elapsed = [];
  var eid = 7700;

  var devTasks = {
    '18': [
      {tid:'6801', entries:[{hours:4,comment:'Вёрстка формы выгрузки',dayOff:0},{hours:3,comment:'Подключение API 1С',dayOff:1},{hours:2,comment:'Тестирование обмена',dayOff:2}]},
      {tid:'6802', entries:[{hours:8,comment:'Интеграция REST заказов',dayOff:3},{hours:2,comment:'Фикс ошибок ответа API',dayOff:4}]},
      {tid:'6803', entries:[{hours:3,comment:'Исправление фильтра каталога',dayOff:5}]},
      {tid:'6804', entries:[{hours:6,comment:'Настройка синхронизации остатков',dayOff:6},{hours:4,comment:'Проверка целостности данных',dayOff:7}]},
      {tid:'6805', entries:[{hours:3,comment:'Доработка документа реализация',dayOff:8}]}
    ],
    '38': [
      {tid:'6806', entries:[{hours:10,comment:'Миграция БД на новый сервер',dayOff:0},{hours:8,comment:'Проверка целостности после миграции',dayOff:1}]},
      {tid:'6807', entries:[{hours:4,comment:'Рефакторинг модуля расчёта',dayOff:2},{hours:4,comment:'Покрытие тестами',dayOff:3},{hours:2,comment:'Ревью кода',dayOff:4}]},
      {tid:'6808', entries:[{hours:2,comment:'Code review спринт 18',dayOff:5}]},
      {tid:'6809', entries:[{hours:3,comment:'Анализ уязвимостей',dayOff:6}]},
      {tid:'6810', entries:[{hours:5,comment:'Настройка обмена с 1С',dayOff:7},{hours:3,comment:'Тестирование обмена',dayOff:8}]}
    ],
    '54': [
      {tid:'6811', entries:[{hours:6,comment:'Разработка отчёта',dayOff:0},{hours:4,comment:'Настройка графиков и фильтров',dayOff:1}]},
      {tid:'6812', entries:[{hours:3,comment:'Фильтры по дате',dayOff:2},{hours:2,comment:'Фильтры по проекту',dayOff:3}]},
      {tid:'6813', entries:[{hours:5,comment:'Адаптация layout мобильный',dayOff:4},{hours:4,comment:'Тест на мобильных',dayOff:5},{hours:3,comment:'Правки по результатам теста',dayOff:6}]},
      {tid:'6814', entries:[{hours:3,comment:'Доработка печатной формы',dayOff:7}]}
    ],
    '80': [
      {tid:'6815', entries:[{hours:5,comment:'Экспорт CSV модуль',dayOff:0},{hours:2,comment:'Экспорт XLSX модуль',dayOff:1}]},
      {tid:'6816', entries:[{hours:8,comment:'Деплой + проверка на проде',dayOff:2}]},
      {tid:'6817', entries:[{hours:4,comment:'GitHub Actions pipeline',dayOff:3},{hours:3,comment:'Docker настройка',dayOff:4}]},
      {tid:'6818', entries:[{hours:6,comment:'Оптимизация запросов БД',dayOff:5}]}
    ],
    '82': [
      {tid:'6819', entries:[{hours:7,comment:'Регрессионное тестирование',dayOff:0}]},
      {tid:'6820', entries:[{hours:3,comment:'Тест-кейсы модуль А',dayOff:1},{hours:3,comment:'Тест-кейсы модуль Б',dayOff:2}]},
      {tid:'6821', entries:[{hours:2,comment:'Настройка тестового фреймворка',dayOff:3}]},
      {tid:'6822', entries:[{hours:4,comment:'Нагрузочное тестирование API',dayOff:4},{hours:3,comment:'Анализ результатов нагрузки',dayOff:5}]}
    ],
    '92': [
      {tid:'6823', entries:[{hours:8,comment:'Документация API модуль',dayOff:0}]},
      {tid:'6824', entries:[{hours:4,comment:'Ревью требований заказчика',dayOff:1}]},
      {tid:'6825', entries:[{hours:2,comment:'Аналитика метрик',dayOff:2},{hours:3,comment:'Подготовка отчёта Q2',dayOff:3}]}
    ],
    '94': [
      {tid:'6826', entries:[{hours:6,comment:'Разработка модуля интеграции',dayOff:0},{hours:4,comment:'Подключение API Милл ФАУЗ',dayOff:1},{hours:3,comment:'Тестирование обмена',dayOff:2}]},
      {tid:'6827', entries:[{hours:2,comment:'Фикс ошибки отчёта',dayOff:3}]},
      {tid:'6828', entries:[{hours:4,comment:'Настройка обмена 1С',dayOff:4},{hours:3,comment:'Тестирование обмена Приправы',dayOff:5}]}
    ],
    '96': [
      {tid:'6829', entries:[{hours:5,comment:'Верстка шаблона письма',dayOff:0},{hours:2,comment:'Тестирование рендеринга',dayOff:1}]},
      {tid:'6830', entries:[{hours:2,comment:'Фикс вёрстки email',dayOff:2}]},
      {tid:'6831', entries:[{hours:4,comment:'Дизайн лендинга промо',dayOff:3},{hours:3,comment:'Вёрстка лендинга',dayOff:4}]}
    ],
    '98': [
      {tid:'6832', entries:[{hours:5,comment:'Настройка документа Заказ-наряд',dayOff:0},{hours:3,comment:'Тестирование документа',dayOff:1}]},
      {tid:'6833', entries:[{hours:4,comment:'Доработка отчёта',dayOff:2}]},
      {tid:'6834', entries:[{hours:3,comment:'Фикс ошибки расчёта',dayOff:3},{hours:2,comment:'Проверка расчётов',dayOff:4}]},
      {tid:'6835', entries:[{hours:4,comment:'Настройка обмена 1С',dayOff:5},{hours:3,comment:'Тест обмена',dayOff:6}]}
    ],
    '1': [
      {tid:'6836', entries:[{hours:3,comment:'Планирование архитектуры',dayOff:0},{hours:2,comment:'Ревью архитектурного решения',dayOff:1}]},
      {tid:'6837', entries:[{hours:1,comment:'Консультация по интеграции',dayOff:2}]},
      {tid:'6838', entries:[{hours:2,comment:'Ревью кода спринт 19',dayOff:3}]}
    ],
    '116': [
      {tid:'6839', entries:[{hours:5,comment:'Разработка модуля лизинга',dayOff:0},{hours:4,comment:'Логика расчёта платежей',dayOff:1}]},
      {tid:'6840', entries:[{hours:3,comment:'Доработка калькулятора',dayOff:2},{hours:2,comment:'Тестирование калькулятора',dayOff:3}]},
      {tid:'6841', entries:[{hours:2,comment:'Фикс ошибки валидации',dayOff:4}]}
    ]
  };

  /* Генерация рабочих дней текущего месяца */
  var workDays = [];
  for (var d = 1; d <= today && d <= 28; d++) {
    var dt = new Date(year, month, d);
    var dow = dt.getDay();
    if (dow !== 0 && dow !== 6) workDays.push(d);
  }

  /* Генерация elapsed записей (реальная структура Bitrix24) */
  Object.keys(devTasks).forEach(function(uid) {
    devTasks[uid].forEach(function(taskDef) {
      taskDef.entries.forEach(function(entry, i) {
        var seconds = entry.hours * 3600;
        var minutes = Math.round(seconds / 60);
        var dayIdx = entry.dayOff % workDays.length;
        var day = workDays[dayIdx];
        var monthStr = String(month + 1).padStart(2, '0');
        var dayStr = String(day).padStart(2, '0');
        var dateStr = year + '-' + monthStr + '-' + dayStr;
        var startH = 9;
        var stopH = 9 + entry.hours;

        elapsed.push({
          ID: String(eid++),
          TASK_ID: taskDef.tid,
          USER_ID: uid,
          COMMENT_TEXT: entry.comment || '',
          SECONDS: String(seconds),
          MINUTES: String(minutes),
          SOURCE: '2',
          CREATED_DATE: dateStr + 'T' + String(startH).padStart(2, '0') + ':04:16+03:00',
          DATE_START: dateStr + 'T' + String(startH).padStart(2, '0') + ':04:22+03:00',
          DATE_STOP: dateStr + 'T' + String(stopH).padStart(2, '0') + ':04:22+03:00'
        });
      });
    });
  });

  PR_MOCK.elapsed = elapsed;
}

/* ─── Инициализация при загрузке ─── */
PR_MOCK_generate();

/* ═══════════════════════════════════════════════════════════════
   DATA LOADER — Mock/Real switch with cache + SWR
   ═══════════════════════════════════════════════════════════════ */

function prLoadPeriodData(year, month, progressCb) {
  var cacheKey = 'data:' + year + '-' + String(month).padStart(2, '0');
  var cb = progressCb || function() {};

  /* ── Check cache first ── */
  if (typeof PayrollCache !== 'undefined') {
    var cached = PayrollCache.get(cacheKey);
    if (cached) {
      console.log('prLoadPeriodData: CACHE HIT for ' + cacheKey);
      cb('Из кеша', 'найден закешированный результат');
      return Promise.resolve(cached);
    }
  }

  if (PR_MOCK_MODE) {
    cb('Загрузка (МОК)', 'генерация тестовых данных...');
    return new Promise(function(resolve) {
      setTimeout(function() {
        cb('Генерация MOCK', 'создание elapsed и задач...');
        var data = PR_MOCK_buildMockData(year, month);
        /* Store in cache */
        if (typeof PayrollCache !== 'undefined') {
          PayrollCache.set(cacheKey, data, 5 * 60 * 1000);
        }
        cb('MOCK готов', data.elapsed.length + ' elapsed, ' + data.tasks.length + ' задач');
        resolve(data);
      }, 200);
    });
  }
  return PR_loadRealData(year, month, progressCb);
}

/* ─── Build mock data for period ─── */
function PR_MOCK_buildMockData(year, month) {
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);

  var periodElapsed = PR_MOCK.elapsed.filter(function(e) {
    var d = (e.CREATED_DATE || '').substring(0, 10);
    return d >= fromStr && d <= toStr;
  });

  var taskIds = {};
  periodElapsed.forEach(function(e) { taskIds[e.TASK_ID] = true; });
  var periodTasks = PR_MOCK.tasks.filter(function(t) { return taskIds[String(t.id)]; });

  var tasksMeta = {};
  periodTasks.forEach(function(t) {
    var id = String(t.id);
    var gid = String(t.groupId || '0');
    var pname = (PR_MOCK.projects[gid] && PR_MOCK.projects[gid].name) || PROJECTS[gid] || '';
    tasksMeta[id] = {
      groupId: gid,
      groupName: pname,
      title: t.title || '',
      status: t.status || '0',
      responsibleId: String(t.responsibleId || '0')
    };
  });

  return {
    elapsed: periodElapsed,
    tasks: periodTasks,
    projects: PR_MOCK.projects,
    tasksMeta: tasksMeta,
    from: range.from,
    to: range.to,
    days: range.days,
    fromStr: fromStr,
    toStr: toStr
  };
}

/* ═══════════════════════════════════════════════════════════════
   REAL DATA LOADER — Inverted Pipeline v5.0.0

   NEW PIPELINE:
   1. Load developers (cached)
   2. Load elapsed PER DEVELOPER for period bounds only
   3. Extract unique task IDs from elapsed
   4. Load ONLY referenced tasks by ID
   5. Build metadata
   6. Load projects (cached)
   7. Cache result

   PERIOD BOUNDARIES: current month + previous month only
   MAX CONCURRENCY: 3 API calls
   SAFETY LIMITS: max 300 tasks, max 5000 elapsed
   ═══════════════════════════════════════════════════════════════ */

/* ─── Safety limits ─── */
var PR_MAX_TASKS = 300;
var PR_MAX_ELAPSED = 5000;
var PR_MAX_CONCURRENT = 3;

/* ─── Throttled queue: max N concurrent promises ─── */
function _prThrottledQueue(items, workerFn, maxConcurrent) {
  if (!items || !items.length) return Promise.resolve([]);
  var maxC = maxConcurrent || PR_MAX_CONCURRENT;
  var results = [];
  var idx = 0;
  var active = 0;
  var resolveAll;

  function next() {
    while (active < maxC && idx < items.length) {
      var item = items[idx];
      var itemIdx = idx;
      idx++;
      active++;
      workerFn(item, itemIdx).then(function(result) {
        active--;
        results[itemIdx] = result;
        if (idx >= items.length && active === 0) {
          resolveAll(results);
        } else {
          next();
        }
      }).catch(function(err) {
        active--;
        results[itemIdx] = null;
        if (idx >= items.length && active === 0) {
          resolveAll(results);
        } else {
          next();
        }
      });
    }
  }

  return new Promise(function(resolve) {
    resolveAll = resolve;
    next();
  });
}

/* ─── Get payroll periods: current month + previous month ─── */
function getPayrollPeriods() {
  var now = new Date();
  var current = { year: now.getFullYear(), month: now.getMonth() + 1 };
  var prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var previous = { year: prevDate.getFullYear(), month: prevDate.getMonth() + 1 };
  return { current: current, previous: previous };
}

/* ─── Real data loader v5.0 ─── */
function PR_loadRealData(year, month, progressCb) {
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);
  var periodKey = year + '-' + String(month).padStart(2, '0');
  var cacheKey = 'data:' + periodKey;
  var cb = progressCb || function() {};

  console.log('PR_loadRealData v5.0: загрузка за ' + fromStr + ' — ' + toStr + ' (elapsed-first pipeline)');

  /* ── Step 0: Check cache ── */
  if (typeof PayrollCache !== 'undefined') {
    var cached = PayrollCache.get(cacheKey);
    if (cached) {
      console.log('PR_loadRealData: CACHE HIT for ' + cacheKey);
      cb('Из кеша', 'найден закешированный результат');
      return Promise.resolve(cached);
    }

    /* ── Stale-while-revalidate: use stale data, refresh in background ── */
    var stale = PayrollCache.getStale(cacheKey);
    if (stale) {
      console.log('PR_loadRealData: serving stale data, refreshing in background');
      cb('Из кеша (устаревший)', 'фоновое обновление...');
      _prBackgroundRefresh(year, month, cacheKey);
      return Promise.resolve(stale);
    }
  }

  return _prLoadRealDataFresh(year, month, fromStr, toStr, periodKey, cacheKey, progressCb);
}

/* ─── Fresh data load (no cache) ─── */
function _prLoadRealDataFresh(year, month, fromStr, toStr, periodKey, cacheKey, progressCb) {
  var perfStart = Date.now();
  var cb = progressCb || function() {};

  /* ── Step 1: Load developers (cached) ── */
  cb('Загрузка разработчиков', 'из API...');

  var devPromise;
  if (typeof PayrollCache !== 'undefined' && PayrollCache.has('developers')) {
    cb('Разработчики', 'из кеша');
    devPromise = Promise.resolve(PayrollCache.get('developers'));
  } else {
    devPromise = (typeof bxLoadDevelopers === 'function')
      ? bxLoadDevelopers().then(function() {
          if (typeof PayrollCache !== 'undefined') {
            PayrollCache.set('developers', DEVELOPERS, 30 * 60 * 1000); /* 30 min cache */
          }
          cb('Разработчики загружены', Object.keys(DEVELOPERS).length + ' чел.');
          return DEVELOPERS;
        })
      : Promise.resolve(DEVELOPERS);
  }

  return devPromise.then(function() {
    cb('Загрузка elapsed', 'по каждому разработчику...');

    /* ── Step 2: Load elapsed PER DEVELOPER for period ──
       Source of truth = elapsed. We load elapsed for each dev,
       bounded to the current period. This is the INVERTED pipeline. */
    return _prLoadElapsedByDev(fromStr, toStr, progressCb);

  }).then(function(allElapsed) {
    console.log('PR_loadRealData: получено ' + allElapsed.length + ' elapsed записей за ' + ((Date.now() - perfStart) / 1000).toFixed(1) + 's');
    cb('Elapsed загружен', allElapsed.length + ' записей');

    /* Safety limit */
    if (allElapsed.length > PR_MAX_ELAPSED) {
      console.warn('PR_loadRealData: SAFETY LIMIT — обрезаем elapsed с ' + allElapsed.length + ' до ' + PR_MAX_ELAPSED);
      allElapsed = allElapsed.slice(0, PR_MAX_ELAPSED);
    }

    /* ── Step 3: Extract unique task IDs from elapsed ── */
    var taskIds = {};
    allElapsed.forEach(function(e) {
      taskIds[String(e.TASK_ID)] = true;
    });
    var uniqueTaskIds = Object.keys(taskIds);
    cb('Извлечение ID задач', uniqueTaskIds.length + ' уникальных из elapsed');
    console.log('PR_loadRealData: ' + uniqueTaskIds.length + ' уникальных задач из elapsed');

    /* Safety limit */
    if (uniqueTaskIds.length > PR_MAX_TASKS) {
      console.warn('PR_loadRealData: SAFETY LIMIT — обрезаем задачи с ' + uniqueTaskIds.length + ' до ' + PR_MAX_TASKS);
      uniqueTaskIds = uniqueTaskIds.slice(0, PR_MAX_TASKS);
    }

    if (!uniqueTaskIds.length) {
      return _prBuildEmptyResult(range);
    }

    /* ── Step 4: Load ONLY referenced tasks ── */
    cb('Загрузка задач', uniqueTaskIds.length + ' по ID...');
    return _prLoadTasksByIdsThrottled(uniqueTaskIds).then(function(allTasks) {
      cb('Задачи загружены', allTasks.length + ' задач из API');

      /* Build tasksMeta */
      var tasksMeta = {};
      var tasksMap = {};
      allTasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        if (!id) return;
        tasksMap[id] = true;
        var gid = String(t.groupId || t.GROUP_ID || '0');
        var pname = (t.group && t.group.name) || PROJECTS[gid] || '';
        tasksMeta[id] = {
          groupId: gid,
          groupName: pname,
          title: t.title || t.TITLE || '',
          status: t.status || t.STATUS || '0',
          responsibleId: String(t.responsibleId || t.RESPONSIBLE_ID || '0')
        };
      });

      /* Filter elapsed: only for tasks we loaded, in our period, from our devs */
      var exGroups = (typeof EXCLUDE_GROUPS !== 'undefined') ? EXCLUDE_GROUPS : {};
      var validTaskIds = {};
      Object.keys(tasksMeta).forEach(function(tid) {
        if (!exGroups[tasksMeta[tid].groupId]) {
          validTaskIds[tid] = true;
        }
      });

      allElapsed = allElapsed.filter(function(e) {
        return validTaskIds[String(e.TASK_ID)];
      });

      /* ── Step 5: Load projects (cached) ── */
      cb('Загрузка проектов', '...');
      return _prLoadProjectsCached().then(function(projects) {
        /* Merge project names from API into tasksMeta */
        Object.keys(projects).forEach(function(gid) {
          /* Already have name from API */
        });

        var elapsedMs = Date.now() - perfStart;
        console.log('PR_loadRealData: завершено за ' + (elapsedMs / 1000).toFixed(1) + 's — ' +
          allElapsed.length + ' elapsed, ' + allTasks.length + ' задач, ' +
          Object.keys(projects).length + ' проектов');
        cb('Загрузка завершена', (elapsedMs / 1000).toFixed(1) + 'с — ' + allElapsed.length + ' elapsed, ' + allTasks.length + ' задач');

        var result = {
          elapsed: allElapsed,
          tasks: allTasks,
          projects: projects,
          tasksMeta: tasksMeta,
          from: range.from,
          to: range.to,
          days: range.days,
          fromStr: fromStr,
          toStr: toStr
        };

        /* ── Step 6: Cache ── */
        if (typeof PayrollCache !== 'undefined') {
          PayrollCache.set(cacheKey, result, 5 * 60 * 1000);
        }

        return result;
      });
    });
  }).catch(function(e) {
    console.error('PR_loadRealData ERROR:', e);
    return _prBuildEmptyResult(prGetMonthRange(year, month));
  });
}

/* ─── Load elapsed per developer (period-bounded, throttled) ─── */
function _prLoadElapsedByDev(fromStr, toStr, progressCb) {
  var devIds = (typeof DEV_IDS !== 'undefined') ? DEV_IDS : [];
  var cb = progressCb || function() {};
  var loadedDevs = 0;

  /* For each developer, load elapsed via batch API
     Using Bitrix24 batch: task.elapseditem.getlist with USER_ID filter */
  return _prThrottledQueue(devIds, function(devId) {
    /* Build batch command for this developer's elapsed */
    return bxPost('task.elapseditem.getlist', {
      FILTER: {
        USER_ID: parseInt(devId),
        '>=CREATED_DATE': fromStr,
        '<=CREATED_DATE': toStr
      }
    }, 20000).then(function(r) {
      loadedDevs++;
      cb('Elapsed', 'разраб. ' + loadedDevs + '/' + devIds.length + ' (ID ' + devId + ')');
      if (r && r.error) {
        /* Fallback: try without date filter, then filter client-side */
        return bxPost('task.elapseditem.getlist', {
          FILTER: { USER_ID: parseInt(devId) }
        }, 20000).then(function(r2) {
          var items = _prExtractElapsed(r2);
          /* Client-side filter by period */
          return _prFilterElapsedByPeriod(items, fromStr, toStr);
        }).catch(function() { return []; });
      }
      return _prExtractElapsed(r);
    }).catch(function() { return []; });
  }, PR_MAX_CONCURRENT).then(function(batches) {
    var all = [];
    batches.forEach(function(b) {
      if (Array.isArray(b)) all = all.concat(b);
    });
    return all;
  });
}

/* ─── Extract elapsed items from API response ─── */
function _prExtractElapsed(r) {
  if (!r) return [];
  if (r.result) {
    if (Array.isArray(r.result)) return r.result;
    if (r.result.items && Array.isArray(r.result.items)) return r.result.items;
    if (r.result.list && Array.isArray(r.result.list)) return r.result.list;
  }
  return [];
}

/* ─── Filter elapsed by period (client-side) ─── */
function _prFilterElapsedByPeriod(items, fromStr, toStr) {
  if (!items || !items.length) return [];
  return items.filter(function(e) {
    var d = (e.CREATED_DATE || '').substring(0, 10);
    return d >= fromStr && d <= toStr;
  });
}

/* ─── Load tasks by IDs with throttled batching ─── */
function _prLoadTasksByIdsThrottled(taskIds) {
  if (!taskIds || !taskIds.length) return Promise.resolve([]);

  /* Use bxLoadTasksByIds which already does batch, but add safety limit */
  if (typeof bxLoadTasksByIds === 'function') {
    return bxLoadTasksByIds(taskIds);
  }

  /* Fallback: manual batch */
  var cmdMap = {};
  taskIds.forEach(function(tid, idx) {
    cmdMap['t' + idx] = 'tasks.task.list?filter[ID]=' + tid +
      '&select[]=ID&select[]=TITLE&select[]=GROUP_ID&select[]=STATUS' +
      '&select[]=RESPONSIBLE_ID&select[]=CREATED_DATE&select[]=CLOSED_DATE';
  });

  return bxBatchCall(cmdMap).then(function(results) {
    var allTasks = [];
    Object.keys(results).forEach(function(key) {
      var data = results[key];
      var tasks = [];
      if (data && data.tasks && Array.isArray(data.tasks)) {
        tasks = data.tasks;
      } else if (data && data.result && data.result.tasks && Array.isArray(data.result.tasks)) {
        tasks = data.result.tasks;
      } else if (Array.isArray(data)) {
        tasks = data;
      }
      allTasks = allTasks.concat(tasks);
    });
    return allTasks;
  });
}

/* ─── Load projects with cache ─── */
function _prLoadProjectsCached() {
  if (typeof PayrollCache !== 'undefined' && PayrollCache.has('projects')) {
    return Promise.resolve(PayrollCache.get('projects'));
  }

  return bxPost('sonet_group.get', {select: ['ID','NAME']}, 15000).then(function(r) {
    var projects = {};
    if (r && r.result) {
      var groups = r.result;
      if (!Array.isArray(groups)) groups = Object.values(groups);
      groups.forEach(function(g) {
        var id = String(g.ID || g.id);
        var nm = g.NAME || g.name || ('Группа ' + id);
        if (id && id !== '0' && !EXCLUDE_GROUPS[id]) {
          projects[id] = {id: id, name: nm};
        }
      });
    }
    if (typeof PayrollCache !== 'undefined') {
      PayrollCache.set('projects', projects, 30 * 60 * 1000); /* 30 min cache */
    }
    return projects;
  }).catch(function() {
    return {};
  });
}

/* ─── Background refresh for stale-while-revalidate ─── */
function _prBackgroundRefresh(year, month, cacheKey) {
  console.log('PR: background refresh started for ' + cacheKey);
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);

  _prLoadRealDataFresh(year, month, fromStr, toStr, year + '-' + String(month).padStart(2, '0'), cacheKey)
    .then(function(freshData) {
      /* If data changed, trigger soft refresh */
      if (typeof _prSoftRefresh === 'function') {
        _prSoftRefresh(freshData);
      }
    }).catch(function(e) {
      console.warn('PR: background refresh failed', e);
    });
}

/* ─── Empty result helper ─── */
function _prBuildEmptyResult(range) {
  return {
    elapsed: [],
    tasks: [],
    projects: {},
    tasksMeta: {},
    from: range.from,
    to: range.to,
    days: range.days,
    fromStr: fmt(range.from),
    toStr: fmt(range.to)
  };
}

/* ─── Loading message helper ─── */
function _prLoadingMsg(msg) {
  try {
    var el = document.getElementById('pr-loading-msg');
    if (el) el.textContent = msg;
    var stepEl = document.getElementById('pr-loading-step');
    if (stepEl) stepEl.textContent = msg;
  } catch(e) {}
}
