/* ═══════════════════════════════════════════════════════════════
   mock-data.js — Test data layer for Payroll Review Prototype
   Данные генерируются динамически для ТЕКУЩЕГО месяца
   ═══════════════════════════════════════════════════════════════ */

var PR_MOCK = {};

/* ─── Генерация моковых данных для текущего месяца ─── */
function PR_MOCK_generate() {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth(); /* 0-based */
  var today = now.getDate();

  /* Проекты */
  PR_MOCK.projects = {
    '10': {id:'10', name:'Дакар'},
    '20': {id:'20', name:'Медицина КЗ'},
    '30': {id:'30', name:'ВДЛ'},
    '40': {id:'40', name:'Бигап'},
    '50': {id:'50', name:'ИП Белолапотко'}
  };

  /* Задачи — реалистичные для 1С-АйтиЛаб */
  PR_MOCK.tasks = [
    {id:'2001',title:'Настройка выгрузки в 1С',groupId:'10',status:'5',responsibleId:'18'},
    {id:'2002',title:'Интеграция REST API Битрикс',groupId:'10',status:'5',responsibleId:'18'},
    {id:'2003',title:'Фикс ошибки фильтрации',groupId:'10',status:'3',responsibleId:'18'},
    {id:'2004',title:'Миграция БД на новый сервер',groupId:'20',status:'5',responsibleId:'38'},
    {id:'2005',title:'Рефакторинг модуля расчёта',groupId:'20',status:'3',responsibleId:'38'},
    {id:'2006',title:'Code review — спринт 22',groupId:'30',status:'5',responsibleId:'38'},
    {id:'2007',title:'Аудит безопасности',groupId:'20',status:'1',responsibleId:'38'},
    {id:'2008',title:'Новый аналитический отчёт',groupId:'30',status:'5',responsibleId:'54'},
    {id:'2009',title:'Фильтры по дате и проекту',groupId:'30',status:'5',responsibleId:'54'},
    {id:'2010',title:'Мобильная адаптация ЛК',groupId:'10',status:'3',responsibleId:'54'},
    {id:'2011',title:'Экспорт данных CSV/XLSX',groupId:'20',status:'5',responsibleId:'82'},
    {id:'2012',title:'Деплой релиза на прод',groupId:'20',status:'5',responsibleId:'82'},
    {id:'2013',title:'CI/CD pipeline настройка',groupId:'10',status:'3',responsibleId:'82'},
    {id:'2014',title:'Оптимизация SQL запросов',groupId:'40',status:'5',responsibleId:'82'},
    {id:'2015',title:'Регрессионное тестирование',groupId:'30',status:'5',responsibleId:'92'},
    {id:'2016',title:'Написание тест-кейсов Q2',groupId:'20',status:'5',responsibleId:'92'},
    {id:'2017',title:'Автотесты API',groupId:'40',status:'1',responsibleId:'92'},
    {id:'2018',title:'Техническая документация',groupId:'30',status:'5',responsibleId:'98'},
    {id:'2019',title:'Ревью требований заказчика',groupId:'10',status:'1',responsibleId:'98'},
    {id:'2020',title:'Аналитика метрик Q2',groupId:'20',status:'5',responsibleId:'1'},
    {id:'2021',title:'Планирование спринта 23',groupId:'10',status:'5',responsibleId:'1'},
    {id:'2022',title:'Консультация по архитектуре',groupId:'30',status:'5',responsibleId:'1'},
    {id:'2023',title:'Верстка email-шаблонов',groupId:'50',status:'5',responsibleId:'116'},
    {id:'2024',title:'Фикс email рассылки',groupId:'50',status:'5',responsibleId:'116'},
    {id:'2025',title:'Лендинг промо-акции',groupId:'40',status:'3',responsibleId:'116'}
  ];

  /* Elapsed entries — динамически по рабочим дням текущего месяца */
  var elapsed = [];
  var eid = 30001;

  /* Маппинг: какие задачи делает каждый разработчик */
  var devTasks = {
    '18': [
      {tid:'2001', hours:[4,3,2], comments:['Вёрстка формы выгрузки','Подключение API 1С','Тестирование']},
      {tid:'2002', hours:[8,2], comments:['Интеграция REST','Фикс ошибок']},
      {tid:'2003', hours:[3], comments:['Исправление фильтра']}
    ],
    '38': [
      {tid:'2004', hours:[10,8], comments:['Миграция БД','Проверка целостности']},
      {tid:'2005', hours:[4,4,2], comments:['Рефакторинг','Покрытие тестами','Ревью']},
      {tid:'2006', hours:[2], comments:['Code review']},
      {tid:'2007', hours:[3], comments:['Анализ уязвимостей']}
    ],
    '54': [
      {tid:'2008', hours:[6,4], comments:['Разработка отчёта','Настройка графиков']},
      {tid:'2009', hours:[3,2], comments:['Фильтры по дате','Фильтры по проекту']},
      {tid:'2010', hours:[5,4,3], comments:['Адаптация layout','Тест на мобильных','Правки']}
    ],
    '82': [
      {tid:'2011', hours:[5,2], comments:['Экспорт CSV','Экспорт XLSX']},
      {tid:'2012', hours:[8], comments:['Деплой + проверка']},
      {tid:'2013', hours:[4,3], comments:['GitHub Actions','Docker настройка']},
      {tid:'2014', hours:[6], comments:['Оптимизация запросов']}
    ],
    '92': [
      {tid:'2015', hours:[7], comments:['Регрессионное тестирование']},
      {tid:'2016', hours:[3,3], comments:['Тест-кейсы модуль А','Тест-кейсы модуль Б']},
      {tid:'2017', hours:[2], comments:['Настройка тестового фреймворка']}
    ],
    '98': [
      {tid:'2018', hours:[8], comments:['Документация API']},
      {tid:'2019', hours:[4], comments:['Ревью требований']}
    ],
    '1': [
      {tid:'2020', hours:[2], comments:['Аналитика метрик']},
      {tid:'2021', hours:[3], comments:['Планирование']},
      {tid:'2022', hours:[1], comments:['Консультация']}
    ],
    '116': [
      {tid:'2023', hours:[5,2], comments:['Верстка шаблона','Тестирование']},
      {tid:'2024', hours:[2], comments:['Фикс вёрстки']},
      {tid:'2025', hours:[4,3], comments:['Дизайн лендинга','Вёрстка']}
    ]
  };

  /* Генерация elapsed записей по рабочим дням */
  var dayIndex = 0;
  var workDays = [];
  for (var d = 1; d <= today && d <= 28; d++) {
    var dt = new Date(year, month, d);
    var dow = dt.getDay();
    if (dow !== 0 && dow !== 6) workDays.push(d);
  }

  Object.keys(devTasks).forEach(function(uid) {
    devTasks[uid].forEach(function(taskDef) {
      var totalHours = 0;
      taskDef.hours.forEach(function(h, i) {
        totalHours += h;
        var dayOffset = (dayIndex + i) % workDays.length;
        var day = workDays[dayOffset];
        var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');

        elapsed.push({
          ID: String(eid++),
          TASK_ID: taskDef.tid,
          USER_ID: uid,
          SECONDS: h * 3600,
          COMMENT_TEXT: taskDef.comments[i] || '',
          CREATED_DATE: dateStr + 'T09:00:00',
          DATE_START: dateStr + 'T09:00:00',
          DATE_STOP: dateStr + 'T' + String(9 + h) + ':00:00'
        });
      });
      dayIndex = (dayIndex + 1) % workDays.length;
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
      /* Небольшая задержка для реалистичности */
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
    tasksMeta[id] = {
      groupId: gid,
      groupName: (PR_MOCK.projects[gid] && PR_MOCK.projects[gid].name) || '',
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
  var hook = HOOK.trim();

  /* Load elapsed by day (Bitrix24 max 50 per request) */
  var dates = [];
  var cur = new Date(range.from);
  while (cur <= range.to) {
    dates.push(fmt(cur));
    cur.setDate(cur.getDate() + 1);
  }

  var elapsedProms = dates.map(function(ds) {
    var u = '/api/task.elapseditem.getlist?hook=' + encodeURIComponent(hook);
    var b = JSON.stringify([0, {}, {
      '>=CREATED_DATE': ds,
      '<=CREATED_DATE': ds + ' 23:59:59'
    }, ['ID','TASK_ID','USER_ID','SECONDS','CREATED_DATE','COMMENT_TEXT']]);
    return fetch(u, {method:'POST', headers:{'Content-Type':'application/json'}, body:b})
      .then(function(r) { return r.json(); });
  });

  return Promise.all(elapsedProms).then(function(results) {
    var allElapsed = [];
    results.forEach(function(r) {
      if (!r.error && Array.isArray(r.result)) {
        allElapsed = allElapsed.concat(r.result);
      }
    });

    /* Filter only known developers */
    allElapsed = allElapsed.filter(function(e) {
      return DEV_IDS.indexOf(Number(e.USER_ID)) >= 0;
    });

    /* Collect unique task IDs */
    var taskIds = [];
    var seen = {};
    allElapsed.forEach(function(e) {
      var tid = e.TASK_ID;
      if (tid && !seen[tid]) { seen[tid] = true; taskIds.push(tid); }
    });

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

    /* Load task metadata in batches */
    return fetchTasksPaginated({
      filter: {ID: taskIds},
      select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE']
    }).then(function(tasks) {
      if (!Array.isArray(tasks)) tasks = [];

      var tasksMeta = {};
      var validTaskIds = {};
      tasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        var gid = String(t.groupId || t.GROUP_ID || '0');
        tasksMeta[id] = {
          groupId: gid,
          groupName: (t.group && t.group.name) || '',
          title: t.title || t.TITLE || '',
          status: t.status || t.STATUS || '0',
          responsibleId: String(t.responsibleId || t.RESPONSIBLE_ID || '0')
        };
        if (!EXCLUDE_GROUPS[gid]) {
          validTaskIds[id] = true;
        }
      });

      /* Filter elapsed for non-excluded projects */
      allElapsed = allElapsed.filter(function(e) {
        return validTaskIds[String(e.TASK_ID)];
      });

      /* Load all projects */
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
          tasks: tasks,
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
