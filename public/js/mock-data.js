/* ═══════════════════════════════════════════════════════════════
   mock-data.js — Test data layer for Payroll Review Prototype
   Реальные данные из 1С-АйтиЛаб Bitrix24 (мок)
   Структура elapsed точно как в продакшене:
     {ID, TASK_ID, USER_ID, COMMENT_TEXT, SECONDS(str), MINUTES(str),
      SOURCE, CREATED_DATE, DATE_START, DATE_STOP}
   v6.4.0: Прямой запрос elapsed по USER_ID (tasks.elapseditem.list)
            + поиск по AUDITOR + загрузка потерянных задач
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
    /* ── Константин Приходько (18) — Бигап, Дакар ── */
    {id:'6801',title:'Настройка обмена 1С-Битрикс для Бигап',groupId:'6',status:'5',responsibleId:'18'},
    {id:'6802',title:'Интеграция REST API Битрикс — заказы',groupId:'6',status:'5',responsibleId:'18'},
    {id:'6803',title:'Фикс ошибки выгрузки каталога',groupId:'6',status:'3',responsibleId:'18'},
    {id:'6804',title:'Настройка синхронизации остатков Дакар',groupId:'32',status:'5',responsibleId:'18'},
    {id:'6805',title:'Доработка документа Реализация',groupId:'32',status:'5',responsibleId:'18'},

    /* ── Александр Соколовский (38) — Медицина КЗ, Керамика ── */
    {id:'6806',title:'Миграция БД Медицина КЗ на новый сервер',groupId:'36',status:'5',responsibleId:'38'},
    {id:'6807',title:'Рефакторинг модуля расчёта листов нетрудоспособности',groupId:'36',status:'5',responsibleId:'38'},
    {id:'6808',title:'Code review — спринт 18 Керамика',groupId:'74',status:'5',responsibleId:'38'},
    {id:'6809',title:'Аудит безопасности Керамика Фабрика',groupId:'72',status:'1',responsibleId:'38'},
    {id:'6810',title:'Настройка обмена с 1С Керамика',groupId:'74',status:'5',responsibleId:'38'},

    /* ── Александр Попов (54) — ВДЛ, МАРКДЖЕТ ── */
    {id:'6811',title:'Новый аналитический отчёт ВДЛ',groupId:'20',status:'5',responsibleId:'54'},
    {id:'6812',title:'Фильтры по дате и проекту МАРКДЖЕТ',groupId:'70',status:'5',responsibleId:'54'},
    {id:'6813',title:'Мобильная адаптация ЛК ВДЛ',groupId:'20',status:'3',responsibleId:'54'},
    {id:'6814',title:'Доработка печатной формы МАРКДЖЕТ',groupId:'70',status:'5',responsibleId:'54'},

    /* ── Сергей Приходько (80) — Нейс-Юг, Кондитеры ── */
    {id:'6815',title:'Экспорт данных CSV/XLSX Нейс-Юг',groupId:'62',status:'5',responsibleId:'80'},
    {id:'6816',title:'Деплой релиза Кондитеры на прод',groupId:'60',status:'5',responsibleId:'80'},
    {id:'6817',title:'CI/CD pipeline настройка Нейс-Юг',groupId:'62',status:'3',responsibleId:'80'},
    {id:'6818',title:'Оптимизация SQL запросов Кондитеры',groupId:'60',status:'5',responsibleId:'80'},

    /* ── Тимур Забиров (82) — Бигап, Кровля ── */
    {id:'6819',title:'Регрессионное тестирование Бигап',groupId:'6',status:'5',responsibleId:'82'},
    {id:'6820',title:'Написание тест-кейсов Q2 Бигап',groupId:'6',status:'5',responsibleId:'82'},
    {id:'6821',title:'Автотесты API Кровля',groupId:'8',status:'1',responsibleId:'82'},
    {id:'6822',title:'Нагрузочное тестирование Кровля',groupId:'8',status:'5',responsibleId:'82'},

    /* ── Елена Кашина (92) — ООО ОПТИМАПЛАСТ, ИП Белолапотко ── */
    {id:'6823',title:'Техническая документация ОПТИМАПЛАСТ',groupId:'52',status:'5',responsibleId:'92'},
    {id:'6824',title:'Ревью требований заказчика Белолапотко',groupId:'50',status:'1',responsibleId:'92'},
    {id:'6825',title:'Аналитика метрик Q2 ОПТИМАПЛАСТ',groupId:'52',status:'5',responsibleId:'92'},

    /* ── Denius Coder (94) — Завод Милл ФАУЗ, Приправы Дона ── */
    {id:'6826',title:'Разработка модуля интеграции Милл ФАУЗ',groupId:'64',status:'5',responsibleId:'94'},
    {id:'6827',title:'Фикс ошибки отчёта Приправы Дона',groupId:'44',status:'5',responsibleId:'94'},
    {id:'6828',title:'Настройка обмена с 1С Приправы Дона',groupId:'44',status:'3',responsibleId:'94'},

    /* ── Марина Савчук (96) — ИП Иванов, АМР ── */
    {id:'6829',title:'Верстка email-шаблонов Иванов',groupId:'66',status:'5',responsibleId:'96'},
    {id:'6830',title:'Фикс email рассылки Иванов',groupId:'66',status:'5',responsibleId:'96'},
    {id:'6831',title:'Лендинг промо-акции АМР',groupId:'40',status:'3',responsibleId:'96'},

    /* ── Ольга Замшина (98) — Самокаты центр, АгроСервис ── */
    {id:'6832',title:'Настройка документа Заказ-наряд Самокаты',groupId:'18',status:'5',responsibleId:'98'},
    {id:'6833',title:'Доработка отчёта АгроСервис',groupId:'12',status:'5',responsibleId:'98'},
    {id:'6834',title:'Фикс ошибки в расчёте АгроСервис',groupId:'12',status:'5',responsibleId:'98'},
    {id:'6835',title:'Настройка обмена 1С Самокаты',groupId:'18',status:'5',responsibleId:'98'},

    /* ── Владимир Макаров (1) — ЮРИСТЫ БИГАП, Живое пиво ── */
    {id:'6836',title:'Планирование архитектуры ЮРИСТЫ БИГАП',groupId:'82',status:'5',responsibleId:'1'},
    {id:'6837',title:'Консультация по интеграции Живое пиво',groupId:'4',status:'5',responsibleId:'1'},
    {id:'6838',title:'Ревью кода ЮРИСТЫ БИГАП спринт 19',groupId:'82',status:'5',responsibleId:'1'},

    /* ── Андрей Предеин (116) — МС Лизинг, АвтоБриф, + чужие задачи ── */
    {id:'6839',title:'Разработка модуля лизинга МС Лизинг',groupId:'16',status:'5',responsibleId:'116'},
    {id:'6840',title:'Доработка калькулятора АвтоБриф',groupId:'14',status:'5',responsibleId:'116'},
    {id:'6841',title:'Фикс ошибки валидации МС Лизинг',groupId:'16',status:'3',responsibleId:'116'}
  ];

  /* ─── Elapsed entries — реальная структура из Bitrix24 ───
     SECONDS: строка, MINUTES: строка, DATE_START/STOP с таймзоной
  */
  var elapsed = [];
  var eid = 7700;

  /* Маппинг: какие задачи делает каждый разработчик, сколько часов */
  var devTasks = {
    '18': [
      {tid:'6801', entries:[
        {hours:4, comment:'Вёрстка формы выгрузки', dayOff:0},
        {hours:3, comment:'Подключение API 1С', dayOff:1},
        {hours:2, comment:'Тестирование обмена', dayOff:2}
      ]},
      {tid:'6802', entries:[
        {hours:8, comment:'Интеграция REST заказов', dayOff:3},
        {hours:2, comment:'Фикс ошибок ответа API', dayOff:4}
      ]},
      {tid:'6803', entries:[
        {hours:3, comment:'Исправление фильтра каталога', dayOff:5}
      ]},
      {tid:'6804', entries:[
        {hours:6, comment:'Настройка синхронизации остатков', dayOff:6},
        {hours:4, comment:'Проверка целостности данных', dayOff:7}
      ]},
      {tid:'6805', entries:[
        {hours:3, comment:'Доработка документа реализация', dayOff:8}
      ]}
    ],
    '38': [
      {tid:'6806', entries:[
        {hours:10, comment:'Миграция БД на новый сервер', dayOff:0},
        {hours:8, comment:'Проверка целостности после миграции', dayOff:1}
      ]},
      {tid:'6807', entries:[
        {hours:4, comment:'Рефакторинг модуля расчёта', dayOff:2},
        {hours:4, comment:'Покрытие тестами', dayOff:3},
        {hours:2, comment:'Ревью кода', dayOff:4}
      ]},
      {tid:'6808', entries:[
        {hours:2, comment:'Code review спринт 18', dayOff:5}
      ]},
      {tid:'6809', entries:[
        {hours:3, comment:'Анализ уязвимостей', dayOff:6}
      ]},
      {tid:'6810', entries:[
        {hours:5, comment:'Настройка обмена с 1С', dayOff:7},
        {hours:3, comment:'Тестирование обмена', dayOff:8}
      ]}
    ],
    '54': [
      {tid:'6811', entries:[
        {hours:6, comment:'Разработка отчёта', dayOff:0},
        {hours:4, comment:'Настройка графиков и фильтров', dayOff:1}
      ]},
      {tid:'6812', entries:[
        {hours:3, comment:'Фильтры по дате', dayOff:2},
        {hours:2, comment:'Фильтры по проекту', dayOff:3}
      ]},
      {tid:'6813', entries:[
        {hours:5, comment:'Адаптация layout мобильный', dayOff:4},
        {hours:4, comment:'Тест на мобильных', dayOff:5},
        {hours:3, comment:'Правки по результатам теста', dayOff:6}
      ]},
      {tid:'6814', entries:[
        {hours:3, comment:'Доработка печатной формы', dayOff:7}
      ]}
    ],
    '80': [
      {tid:'6815', entries:[
        {hours:5, comment:'Экспорт CSV модуль', dayOff:0},
        {hours:2, comment:'Экспорт XLSX модуль', dayOff:1}
      ]},
      {tid:'6816', entries:[
        {hours:8, comment:'Деплой + проверка на проде', dayOff:2}
      ]},
      {tid:'6817', entries:[
        {hours:4, comment:'GitHub Actions pipeline', dayOff:3},
        {hours:3, comment:'Docker настройка', dayOff:4}
      ]},
      {tid:'6818', entries:[
        {hours:6, comment:'Оптимизация запросов БД', dayOff:5}
      ]}
    ],
    '82': [
      {tid:'6819', entries:[
        {hours:7, comment:'Регрессионное тестирование', dayOff:0}
      ]},
      {tid:'6820', entries:[
        {hours:3, comment:'Тест-кейсы модуль А', dayOff:1},
        {hours:3, comment:'Тест-кейсы модуль Б', dayOff:2}
      ]},
      {tid:'6821', entries:[
        {hours:2, comment:'Настройка тестового фреймворка', dayOff:3}
      ]},
      {tid:'6822', entries:[
        {hours:4, comment:'Нагрузочное тестирование API', dayOff:4},
        {hours:3, comment:'Анализ результатов нагрузки', dayOff:5}
      ]}
    ],
    '92': [
      {tid:'6823', entries:[
        {hours:8, comment:'Документация API модуль', dayOff:0}
      ]},
      {tid:'6824', entries:[
        {hours:4, comment:'Ревью требований заказчика', dayOff:1}
      ]},
      {tid:'6825', entries:[
        {hours:2, comment:'Аналитика метрик', dayOff:2},
        {hours:3, comment:'Подготовка отчёта Q2', dayOff:3}
      ]}
    ],
    '94': [
      {tid:'6826', entries:[
        {hours:6, comment:'Разработка модуля интеграции', dayOff:0},
        {hours:4, comment:'Подключение API Милл ФАУЗ', dayOff:1},
        {hours:3, comment:'Тестирование обмена', dayOff:2}
      ]},
      {tid:'6827', entries:[
        {hours:2, comment:'Фикс ошибки отчёта', dayOff:3}
      ]},
      {tid:'6828', entries:[
        {hours:4, comment:'Настройка обмена 1С', dayOff:4},
        {hours:3, comment:'Тестирование обмена Приправы', dayOff:5}
      ]}
    ],
    '96': [
      {tid:'6829', entries:[
        {hours:5, comment:'Верстка шаблона письма', dayOff:0},
        {hours:2, comment:'Тестирование рендеринга', dayOff:1}
      ]},
      {tid:'6830', entries:[
        {hours:2, comment:'Фикс вёрстки email', dayOff:2}
      ]},
      {tid:'6831', entries:[
        {hours:4, comment:'Дизайн лендинга промо', dayOff:3},
        {hours:3, comment:'Вёрстка лендинга', dayOff:4}
      ]}
    ],
    '98': [
      {tid:'6832', entries:[
        {hours:5, comment:'Настройка документа Заказ-наряд', dayOff:0},
        {hours:3, comment:'Тестирование документа', dayOff:1}
      ]},
      {tid:'6833', entries:[
        {hours:4, comment:'Доработка отчёта', dayOff:2}
      ]},
      {tid:'6834', entries:[
        {hours:3, comment:'Фикс ошибки расчёта', dayOff:3},
        {hours:2, comment:'Проверка расчётов', dayOff:4}
      ]},
      {tid:'6835', entries:[
        {hours:4, comment:'Настройка обмена 1С', dayOff:5},
        {hours:3, comment:'Тест обмена', dayOff:6}
      ]}
    ],
    '1': [
      {tid:'6836', entries:[
        {hours:3, comment:'Планирование архитектуры', dayOff:0},
        {hours:2, comment:'Ревью архитектурного решения', dayOff:1}
      ]},
      {tid:'6837', entries:[
        {hours:1, comment:'Консультация по интеграции', dayOff:2}
      ]},
      {tid:'6838', entries:[
        {hours:2, comment:'Ревью кода спринт 19', dayOff:3}
      ]}
    ],
    '116': [
      {tid:'6839', entries:[
        {hours:5, comment:'Разработка модуля лизинга', dayOff:0},
        {hours:4, comment:'Логика расчёта платежей', dayOff:1}
      ]},
      {tid:'6840', entries:[
        {hours:3, comment:'Доработка калькулятора', dayOff:2},
        {hours:2, comment:'Тестирование калькулятора', dayOff:3}
      ]},
      {tid:'6841', entries:[
        {hours:2, comment:'Фикс ошибки валидации', dayOff:4}
      ]}
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

/* ─── Data loader (mock → real switch) ─── */
function prLoadPeriodData(year, month) {
  if (PR_MOCK_MODE) {
    return new Promise(function(resolve) {
      setTimeout(function() {
        resolve(PR_MOCK_buildMockData(year, month));
      }, 300);
    });
  }
  return PR_loadRealData(year, month);
}

/* ─── Build mock data for period ─── */
function PR_MOCK_buildMockData(year, month) {
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);

  /* Filter elapsed for period */
  var periodElapsed = PR_MOCK.elapsed.filter(function(e) {
    var d = (e.CREATED_DATE || '').substring(0, 10);
    return d >= fromStr && d <= toStr;
  });

  /* Filter tasks that have elapsed in this period */
  var taskIds = {};
  periodElapsed.forEach(function(e) { taskIds[e.TASK_ID] = true; });
  var periodTasks = PR_MOCK.tasks.filter(function(t) { return taskIds[String(t.id)]; });

  /* Build tasksMeta for calc module */
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
    days: range.days
  };
}

/* ═══════════════════════════════════════════════════════════════
   Real data loader (Bitrix24-compatible) v6.4.0
   ═══════════════════════════════════════════════════════════════
   Проблема v6.3.0: Предеин не появлялся в живых данных, потому что
   поиск задач шёл только по RESPONSIBLE_ID и ACCOMPLICE. Если
   разработчик списывает время на задачи, где он НЕ ответственный
   и НЕ соисполнитель — эти записи никогда не загружались.

   Решение v6.4.0: Двухфазная загрузка:
   Phase A: Прямой запрос elapsed по USER_ID через tasks.elapseditem.list
            (новый API Bitrix24, поддерживает фильтр по USER_ID)
   Phase B: Поиск задач по RESPONSIBLE_ID + ACCOMPLICE + AUDITOR
            + загрузка elapsed по TASK_ID (batch) — для метаданных задач
   После слияния результатов: загрузка потерянных задач (batch)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Прямой запрос elapsed записей по USER_ID.
 * Использует новый API tasks.elapseditem.list, который поддерживает
 * фильтр по USER_ID без требования TASK_ID.
 * Если API недоступен — возвращает пустой массив (fallback на Phase B).
 */
function _prFetchElapsedByUser(userId, fromStr, toStr) {
  var all = [];
  var start = 0;
  var maxPages = 10;
  var pages = 0;

  function step() {
    pages++;
    if (pages > maxPages) {
      console.warn('_prFetchElapsedByUser: лимит страниц для user ' + userId + ', ' + all.length + ' записей');
      return all;
    }
    return bxPost('tasks.elapseditem.list', {
      start: start,
      'filter[USER_ID]': String(userId),
      'filter[>=CREATED_DATE]': fromStr + 'T00:00:00+03:00',
      'filter[<=CREATED_DATE]': toStr + 'T23:59:59+03:00',
      'select[]': ['ID','TASK_ID','USER_ID','SECONDS','MINUTES','COMMENT_TEXT',
                   'CREATED_DATE','DATE_START','DATE_STOP','SOURCE']
    }).then(function(r) {
      if (r && r.error) {
        /* API not available — return what we have (likely nothing) */
        console.warn('_prFetchElapsedByUser: API error for user ' + userId + ': ' + (r.error_description || r.error));
        return all;
      }
      var items = [];
      if (r && r.result) {
        if (Array.isArray(r.result)) {
          items = r.result;
        } else if (r.result.items && Array.isArray(r.result.items)) {
          items = r.result.items;
        } else if (r.result.list && Array.isArray(r.result.list)) {
          items = r.result.list;
        }
      }
      all = all.concat(items);
      if (r && r.next && items.length >= 50) {
        start = r.next;
        return step();
      }
      console.log('_prFetchElapsedByUser: user=' + userId + ' найдено ' + all.length + ' записей elapsed');
      return all;
    }).catch(function(e) {
      console.warn('_prFetchElapsedByUser: ошибка для user ' + userId, e);
      return all;
    });
  }

  return step();
}

/**
 * Альтернативный запрос elapsed по USER_ID через старый API.
 * Старый API task.elapseditem.getlist требует TASK_ID, поэтому
 * мы используем batch: сначала ищем ВСЕ задачи пользователя
 * (RESPONSIBLE + ACCOMPLICE + AUDITOR), потом загружаем elapsed.
 * Это запасной вариант если tasks.elapseditem.list недоступен.
 */
function _prFetchElapsedByUserFallback(userId, fromStr, toStr, lookbackStr) {
  /* Поиск задач тремя способами параллельно */
  var searchProms = [
    /* RESPONSIBLE */
    fetchTasksPaginated({
      filter: { RESPONSIBLE_ID: userId, '>=CREATED_DATE': lookbackStr },
      select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID'],
      order: {ID: 'DESC'}
    }, 10),
    /* ACCOMPLICE */
    fetchTasksPaginated({
      filter: { ACCOMPLICE: userId, '>=CREATED_DATE': lookbackStr },
      select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID'],
      order: {ID: 'DESC'}
    }, 10),
    /* AUDITOR */
    fetchTasksPaginated({
      filter: { AUDITOR: userId, '>=CREATED_DATE': lookbackStr },
      select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID'],
      order: {ID: 'DESC'}
    }, 10)
  ];

  return Promise.all(searchProms).then(function(results) {
    /* Дедупликация задач по ID */
    var taskIds = [];
    var seen = {};
    results.forEach(function(tasks) {
      if (!Array.isArray(tasks)) return;
      tasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        if (!seen[id]) { seen[id] = true; taskIds.push(id); }
      });
    });

    if (!taskIds.length) return [];

    /* Загрузка elapsed для найденных задач (batch) */
    var allElapsed = [];
    var batchProms = [];
    for (var i = 0; i < taskIds.length; i += 50) {
      var chunk = taskIds.slice(i, i + 50);
      var batchCmd = {};
      chunk.forEach(function(tid, idx) {
        batchCmd['e' + idx] = 'task.elapseditem.getlist?TASK_ID=' + tid;
      });
      batchProms.push(
        bxPost('batch', { halt: 0, cmd: batchCmd }).then(function(r) {
          if (r && r.result && r.result.result) {
            var results = r.result.result;
            if (typeof results === 'object' && !Array.isArray(results)) {
              Object.keys(results).forEach(function(key) {
                var items = results[key];
                if (Array.isArray(items)) {
                  allElapsed = allElapsed.concat(items);
                }
              });
            }
          }
        })
      );
    }

    return Promise.all(batchProms).then(function() {
      /* Фильтр по USER_ID и периоду */
      var devStr = String(userId);
      allElapsed = allElapsed.filter(function(e) {
        if (String(e.USER_ID) !== devStr) return false;
        var d = (e.CREATED_DATE || '').substring(0, 10);
        return d >= fromStr && d <= toStr;
      });
      console.log('_prFetchElapsedByUserFallback: user=' + userId + ' найдено ' + allElapsed.length + ' записей elapsed (через задачи)');
      return allElapsed;
    });
  });
}

/**
 * Загрузка метаданных потерянных задач (задачи, на которые есть elapsed,
 * но они не были найдены через поиск по разработчикам).
 * Использует batch tasks.task.list для получения названия и проекта.
 */
function _prLoadOrphanTasks(orphanTaskIds, tasksMeta, allTasks) {
  if (!orphanTaskIds.length) return Promise.resolve();

  /* Дедупликация */
  var unique = [];
  var seen = {};
  orphanTaskIds.forEach(function(tid) {
    if (!seen[tid]) { seen[tid] = true; unique.push(tid); }
  });

  var batchProms = [];
  for (var i = 0; i < unique.length; i += 50) {
    var chunk = unique.slice(i, i + 50);
    var batchCmd = {};
    chunk.forEach(function(tid, idx) {
      batchCmd['t' + idx] = 'tasks.task.list?filter[ID]=' + tid + '&select[]=ID&select[]=TITLE&select[]=GROUP_ID&select[]=STATUS&select[]=RESPONSIBLE_ID';
    });
    batchProms.push(
      bxPost('batch', { halt: 0, cmd: batchCmd }).then(function(r) {
        if (r && r.result && r.result.result) {
          var results = r.result.result;
          Object.keys(results).forEach(function(key) {
            var taskResult = results[key];
            /* tasks.task.list возвращает {tasks: [...]} */
            var tasks = [];
            if (taskResult && Array.isArray(taskResult.tasks)) {
              tasks = taskResult.tasks;
            } else if (Array.isArray(taskResult)) {
              tasks = taskResult;
            }
            tasks.forEach(function(t) {
              var id = String(t.id || t.ID);
              var gid = String(t.groupId || t.GROUP_ID || '0');
              var pname = (t.group && t.group.name) || '';
              if (tasksMeta[id]) {
                /* Обновить плейсхолдер реальными данными */
                tasksMeta[id].groupId = gid;
                if (pname) tasksMeta[id].groupName = pname;
                if (t.title || t.TITLE) tasksMeta[id].title = t.title || t.TITLE;
                tasksMeta[id].status = t.status || t.STATUS || tasksMeta[id].status;
                tasksMeta[id].responsibleId = String(t.responsibleId || t.RESPONSIBLE_ID || tasksMeta[id].responsibleId);
              }
              allTasks.push(t);
            });
          });
        }
      })
    );
  }

  return Promise.all(batchProms);
}

/* ─── Главная функция загрузки реальных данных ─── */
function PR_loadRealData(year, month) {
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);
  var devIds = ACTIVE_DEV_IDS;

  /* Look back 6 months for tasks */
  var lookbackDate = new Date(year, month - 1 - 6, 1);
  var lookbackStr = fmt(lookbackDate);

  console.log('PR_loadRealData v6.4.0: period=' + fromStr + ' — ' + toStr +
    ', devs=' + devIds.length + ', lookback=' + lookbackStr);

  /* ═══ PHASE A: Прямой запрос elapsed по USER_ID ═══
     tasks.elapseditem.list — новый API, поддерживает фильтр USER_ID.
     Захватывает ВСЕ списания разработчика, независимо от того,
     на чьей задаче он списывает время. */
  var directElapsedProms = devIds.map(function(devId) {
    return _prFetchElapsedByUser(devId, fromStr, toStr).then(function(entries) {
      return entries;
    }).catch(function() {
      return [];
    });
  });

  /* ═══ PHASE B: Поиск задач по RESPONSIBLE + ACCOMPLICE + AUDITOR ═══
     Нужен для метаданных задач (название, проект, статус).
     Без этого у нас будут только ID задач без названий. */
  var taskProms = [];
  devIds.forEach(function(devId) {
    /* Search 1: developer is RESPONSIBLE */
    taskProms.push(
      fetchTasksPaginated({
        filter: {
          RESPONSIBLE_ID: devId,
          '>=CREATED_DATE': lookbackStr
        },
        select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
        order: {ID: 'DESC'}
      }, 10).then(function(tasks) {
        if (!Array.isArray(tasks)) tasks = [];
        return { devId: devId, tasks: tasks };
      })
    );
    /* Search 2: developer is ACCOMPLICE (co-executor) */
    taskProms.push(
      fetchTasksPaginated({
        filter: {
          ACCOMPLICE: devId,
          '>=CREATED_DATE': lookbackStr
        },
        select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
        order: {ID: 'DESC'}
      }, 10).then(function(tasks) {
        if (!Array.isArray(tasks)) tasks = [];
        return { devId: devId, tasks: tasks };
      })
    );
    /* Search 3: developer is AUDITOR — v6.4.0 NEW
       Разработчик может списывать время на задачи, где он наблюдатель */
    taskProms.push(
      fetchTasksPaginated({
        filter: {
          AUDITOR: devId,
          '>=CREATED_DATE': lookbackStr
        },
        select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
        order: {ID: 'DESC'}
      }, 10).then(function(tasks) {
        if (!Array.isArray(tasks)) tasks = [];
        return { devId: devId, tasks: tasks };
      })
    );
  });

  /* ═══ Запуск обеих фаз параллельно ═══ */
  return Promise.all([
    Promise.all(directElapsedProms),
    Promise.all(taskProms)
  ]).then(function(phases) {
    var directElapsedArrays = phases[0];
    var devResults = phases[1];

    /* ─── Собрать прямые elapsed записи, дедупликация по ID ─── */
    var allElapsed = [];
    var seenElapsedIds = {};
    var hasDirectElapsed = false;
    directElapsedArrays.forEach(function(entries) {
      if (!Array.isArray(entries)) return;
      entries.forEach(function(e) {
        var eid = String(e.ID || '');
        if (eid && !seenElapsedIds[eid]) {
          seenElapsedIds[eid] = true;
          allElapsed.push(e);
          hasDirectElapsed = true;
        }
      });
    });

    console.log('PR_loadRealData Phase A: ' + allElapsed.length + ' elapsed записей через прямой запрос');

    /* ─── Собрать задачи, дедупликация по ID ─── */
    var allTasks = [];
    var seenIds = {};
    devResults.forEach(function(dr) {
      if (!dr || !Array.isArray(dr.tasks)) return;
      dr.tasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        if (!seenIds[id]) { seenIds[id] = true; allTasks.push(t); }
      });
    });

    /* ─── Построить tasksMeta из найденных задач ─── */
    var tasksMeta = {};
    allTasks.forEach(function(t) {
      var id = String(t.id || t.ID);
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

    /* ─── Если прямые elapsed есть → используем их + загрузка потерянных задач ─── */
    if (hasDirectElapsed) {
      /* Найти потерянные задачи (elapsed на задачах, не найденных в Phase B) */
      var orphanTaskIds = [];
      allElapsed.forEach(function(e) {
        var tid = String(e.TASK_ID || '');
        if (tid && !tasksMeta[tid]) {
          orphanTaskIds.push(tid);
          /* Создать плейсхолдер пока не загрузим реальные данные */
          tasksMeta[tid] = {
            groupId: '0',
            groupName: '',
            title: 'Задача #' + tid,
            status: '0',
            responsibleId: String(e.USER_ID || '0')
          };
        }
      });

      console.log('PR_loadRealData: ' + orphanTaskIds.length + ' потерянных задач для загрузки');

      /* Загрузить метаданные потерянных задач */
      return _prLoadOrphanTasks(orphanTaskIds, tasksMeta, allTasks).then(function() {
        /* Также загрузить elapsed для задач из Phase B (чтобы получить
           списания ДРУГИХ пользователей на тех же задачах) */
        return _prLoadBatchElapsedAndFinish(allElapsed, seenElapsedIds, allTasks, tasksMeta, range, fromStr, toStr);
      });
    }

    /* ─── Fallback: Прямой запрос не дал результатов → старый подход + AUDITOR ───
       Загрузка elapsed через batch по найденным задачам */
    console.log('PR_loadRealData: прямой запрос не дал результатов, fallback на batch-загрузку');

    /* Также пробуем альтернативный запрос elapsed по USER_ID через задачи */
    var fallbackElapsedProms = devIds.map(function(devId) {
      return _prFetchElapsedByUserFallback(devId, fromStr, toStr, lookbackStr);
    });

    return Promise.all(fallbackElapsedProms).then(function(fallbackArrays) {
      /* Добавить fallback elapsed */
      fallbackArrays.forEach(function(entries) {
        if (!Array.isArray(entries)) return;
        entries.forEach(function(e) {
          var eid = String(e.ID || '');
          if (eid && !seenElapsedIds[eid]) {
            seenElapsedIds[eid] = true;
            allElapsed.push(e);
          }
        });
      });

      /* Найти потерянные задачи из fallback elapsed */
      var orphanTaskIds = [];
      allElapsed.forEach(function(e) {
        var tid = String(e.TASK_ID || '');
        if (tid && !tasksMeta[tid]) {
          orphanTaskIds.push(tid);
          tasksMeta[tid] = {
            groupId: '0',
            groupName: '',
            title: 'Задача #' + tid,
            status: '0',
            responsibleId: String(e.USER_ID || '0')
          };
        }
      });

      return _prLoadOrphanTasks(orphanTaskIds, tasksMeta, allTasks).then(function() {
        return _prLoadBatchElapsedAndFinish(allElapsed, seenElapsedIds, allTasks, tasksMeta, range, fromStr, toStr);
      });
    });
  });
}

/**
 * Загрузка elapsed через batch (для задач из Phase B)
 * + финальная фильтрация + загрузка проектов
 */
function _prLoadBatchElapsedAndFinish(allElapsed, seenElapsedIds, allTasks, tasksMeta, range, fromStr, toStr) {
  var taskIdList = [];
  Object.keys(tasksMeta).forEach(function(id) {
    if (!EXCLUDE_GROUPS[tasksMeta[id].groupId]) {
      taskIdList.push(id);
    }
  });

  /* Загрузка elapsed для найденных задач через batch
     (чтобы получить списания ВСЕХ пользователей на этих задачах,
      а не только целевого разработчика) */
  var batchProms = [];
  for (var i = 0; i < taskIdList.length; i += 50) {
    var chunk = taskIdList.slice(i, i + 50);
    var batchCmd = {};
    chunk.forEach(function(tid, idx) {
      batchCmd['e' + idx] = 'task.elapseditem.getlist?TASK_ID=' + tid;
    });
    batchProms.push(
      bxPost('batch', { halt: 0, cmd: batchCmd }).then(function(r) {
        if (r && r.result && r.result.result) {
          var results = r.result.result;
          if (typeof results === 'object' && !Array.isArray(results)) {
            Object.keys(results).forEach(function(key) {
              var items = results[key];
              if (Array.isArray(items)) {
                items.forEach(function(e) {
                  var eid = String(e.ID || '');
                  if (eid && !seenElapsedIds[eid]) {
                    seenElapsedIds[eid] = true;
                    allElapsed.push(e);
                  }
                });
              }
            });
          }
        }
      })
    );
  }

  return Promise.all(batchProms).then(function() {
    /* Фильтрация: период + только наши разработчики */
    var devIdSet = {};
    DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

    allElapsed = allElapsed.filter(function(e) {
      var d = (e.CREATED_DATE || '').substring(0, 10);
      if (d < fromStr || d > toStr) return false;
      return devIdSet[String(e.USER_ID)];
    });

    /* Удалить elapsed на исключённых проектах (но оставить если
       это наш разработчик и мы ещё не знаем проект) */
    var validTaskIds = {};
    Object.keys(tasksMeta).forEach(function(id) {
      if (!EXCLUDE_GROUPS[tasksMeta[id].groupId]) {
        validTaskIds[id] = true;
      }
    });
    allElapsed = allElapsed.filter(function(e) {
      var tid = String(e.TASK_ID || '');
      /* Если задача в валидных — OK */
      if (validTaskIds[tid]) return true;
      /* Если задача неизвестна но разработчик наш — оставляем
         (создадим плейсхолдер если ещё нет) */
      if (devIdSet[String(e.USER_ID)]) {
        if (!tasksMeta[tid]) {
          tasksMeta[tid] = {
            groupId: '0',
            groupName: '',
            title: 'Задача #' + tid,
            status: '0',
            responsibleId: String(e.USER_ID || '0')
          };
        }
        return true;
      }
      return false;
    });

    console.log('PR_loadRealData: всего ' + allElapsed.length + ' elapsed записей после фильтрации');

    /* ─── Загрузка проектов ─── */
    return bxPost('sonet_group.get', { select: ['ID','NAME'] }).then(function(r) {
      var projects = {};
      if (r && r.result) {
        var groups = r.result;
        if (!Array.isArray(groups)) groups = Object.values(groups);
        groups.forEach(function(g) {
          var id = String(g.ID || g.id);
          var nm = g.NAME || g.name || ('Группа ' + id);
          if (id && id !== '0' && !EXCLUDE_GROUPS[id]) {
            projects[id] = { id: id, name: nm };
          }
        });
      }

      /* Обновить groupName в tasksMeta из загруженных проектов */
      Object.keys(tasksMeta).forEach(function(tid) {
        var meta = tasksMeta[tid];
        var gid = meta.groupId;
        if (gid && gid !== '0' && projects[gid] && !meta.groupName) {
          meta.groupName = projects[gid].name;
        }
      });

      /* Статистика по разработчикам */
      var devHours = {};
      allElapsed.forEach(function(e) {
        var uid = String(e.USER_ID);
        var mins = parseInt(e.MINUTES || e.SECONDS / 60 || '0', 10);
        devHours[uid] = (devHours[uid] || 0) + mins;
      });
      Object.keys(devHours).forEach(function(uid) {
        console.log('  dev ' + uid + ': ' + mhm(devHours[uid]) + ' часов');
      });

      return {
        elapsed: allElapsed,
        tasks: allTasks,
        projects: projects,
        tasksMeta: tasksMeta,
        from: range.from,
        to: range.to,
        days: range.days
      };
    });
  });
}
