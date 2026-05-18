/* ═══════════════════════════════════════════════════════════════
   mock-data.js — Test data layer for Payroll Review Prototype
   Реальные данные из 1С-АйтиЛаб Bitrix24 (мок)
   Структура elapsed точно как в продакшене:
     {ID, TASK_ID, USER_ID, COMMENT_TEXT, SECONDS(str), MINUTES(str),
      SOURCE, CREATED_DATE, DATE_START, DATE_STOP}
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

    /* ── Андрей Предеин (116) — МС Лизинг, АвтоБриф ── */
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

/* ─── Real data loader ─── */
function PR_loadRealData(year, month) {
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);

  /* Шаг 1: Загрузить все задачи за период по каждому разработчику */
  var taskProms = DEV_IDS.map(function(devId) {
    return fetchTasksPaginated({
      filter: {
        RESPONSIBLE_ID: devId,
        '>=CREATED_DATE': fromStr,
        '<=CLOSED_DATE': toStr + ' 23:59:59'
      },
      select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE']
    }).then(function(tasks) {
      if (!Array.isArray(tasks)) tasks = [];
      /* Добавляем задачи без CLOSED_DATE (ещё не закрытые) */
      return fetchTasksPaginated({
        filter: {
          RESPONSIBLE_ID: devId,
          '>=CREATED_DATE': fromStr,
          STATUS: '3'
        },
        select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE']
      }).then(function(moreTasks) {
        if (!Array.isArray(moreTasks)) moreTasks = [];
        return tasks.concat(moreTasks);
      }).catch(function() {
        return tasks;
      });
    }).catch(function() {
      return [];
    });
  });

  return Promise.all(taskProms).then(function(allTaskBatches) {
    /* Собираем уникальные задачи */
    var tasksMap = {};
    var allTasks = [];
    allTaskBatches.forEach(function(batch) {
      batch.forEach(function(t) {
        var id = String(t.id || t.ID);
        if (!tasksMap[id]) {
          tasksMap[id] = true;
          allTasks.push(t);
        }
      });
    });

    /* Собираем ID задач для запроса elapsed */
    var taskIds = Object.keys(tasksMap);
    if (!taskIds.length) {
      return {
        elapsed: [],
        tasks: [],
        projects: {},
        tasksMeta: {},
        from: range.from,
        to: range.to,
        days: range.days
      };
    }

    /* Шаг 2: Загрузить elapsed для каждой задачи */
    var elapsedProms = taskIds.map(function(tid) {
      return bxPost('task.elapseditem.getlist', {
        TASK_ID: parseInt(tid),
        PARAMS: {}
      }).then(function(r) {
        if (r && r.result && Array.isArray(r.result)) {
          return r.result;
        }
        return [];
      }).catch(function() {
        return [];
      });
    });

    return Promise.all(elapsedProms).then(function(elapsedBatches) {
      var allElapsed = [];
      elapsedBatches.forEach(function(batch) {
        allElapsed = allElapsed.concat(batch);
      });

      /* Фильтр по периоду и разработчикам */
      allElapsed = allElapsed.filter(function(e) {
        var d = (e.CREATED_DATE || '').substring(0, 10);
        return d >= fromStr && d <= toStr && DEV_IDS.indexOf(Number(e.USER_ID)) >= 0;
      });

      /* Собираем метаданные задач */
      var tasksMeta = {};
      var validTaskIds = {};
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
        if (!EXCLUDE_GROUPS[gid]) {
          validTaskIds[id] = true;
        }
      });

      /* Фильтр elapsed по не-исключённым проектам */
      allElapsed = allElapsed.filter(function(e) {
        return validTaskIds[String(e.TASK_ID)];
      });

      /* Шаг 3: Загрузить список проектов */
      return bxPost('sonet_group.get', {select: ['ID','NAME']}).then(function(r) {
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
  });
}
