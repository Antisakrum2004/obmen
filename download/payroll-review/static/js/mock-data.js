/* ═══════════════════════════════════════════════════════════════
   mock-data.js — Test data layer for Payroll Review Prototype
   Архитектура: можно переключить на real API заменой источника
   ═══════════════════════════════════════════════════════════════ */

var PR_MOCK = {};

/* ─── Mock Elapsed Entries ─── */
PR_MOCK.elapsed = [
  {ID:'9001',TASK_ID:'100',USER_ID:'18',SECONDS:14400,COMMENT_TEXT:'Вёрстка главной',CREATED_DATE:'2026-05-02T10:00:00',DATE_START:'2026-05-02T10:00:00',DATE_STOP:'2026-05-02T14:00:00'},
  {ID:'9002',TASK_ID:'100',USER_ID:'18',SECONDS:10800,COMMENT_TEXT:'Доработки',CREATED_DATE:'2026-05-03T09:00:00',DATE_START:'2026-05-03T09:00:00',DATE_STOP:'2026-05-03T12:00:00'},
  {ID:'9003',TASK_ID:'101',USER_ID:'18',SECONDS:28800,COMMENT_TEXT:'Интеграция API',CREATED_DATE:'2026-05-05T09:00:00',DATE_START:'2026-05-05T09:00:00',DATE_STOP:'2026-05-05T17:00:00'},
  {ID:'9004',TASK_ID:'101',USER_ID:'18',SECONDS:7200,COMMENT_TEXT:'Фикс багов',CREATED_DATE:'2026-05-06T10:00:00',DATE_START:'2026-05-06T10:00:00',DATE_STOP:'2026-05-06T12:00:00'},
  {ID:'9005',TASK_ID:'102',USER_ID:'38',SECONDS:36000,COMMENT_TEXT:'Миграция БД',CREATED_DATE:'2026-05-04T08:00:00',DATE_START:'2026-05-04T08:00:00',DATE_STOP:'2026-05-04T18:00:00'},
  {ID:'9006',TASK_ID:'103',USER_ID:'38',SECONDS:14400,COMMENT_TEXT:'Рефакторинг модуля',CREATED_DATE:'2026-05-07T09:00:00',DATE_START:'2026-05-07T09:00:00',DATE_STOP:'2026-05-07T13:00:00'},
  {ID:'9007',TASK_ID:'104',USER_ID:'38',SECONDS:7200,COMMENT_TEXT:'Code review',CREATED_DATE:'2026-05-08T14:00:00',DATE_START:'2026-05-08T14:00:00',DATE_STOP:'2026-05-08T16:00:00'},
  {ID:'9008',TASK_ID:'105',USER_ID:'54',SECONDS:21600,COMMENT_TEXT:'Новый отчёт',CREATED_DATE:'2026-05-02T09:00:00',DATE_START:'2026-05-02T09:00:00',DATE_STOP:'2026-05-02T15:00:00'},
  {ID:'9009',TASK_ID:'106',USER_ID:'54',SECONDS:10800,COMMENT_TEXT:'Фильтры',CREATED_DATE:'2026-05-05T11:00:00',DATE_START:'2026-05-05T11:00:00',DATE_STOP:'2026-05-05T14:00:00'},
  {ID:'9010',TASK_ID:'107',USER_ID:'54',SECONDS:32400,COMMENT_TEXT:'Мобильная адаптация',CREATED_DATE:'2026-05-06T09:00:00',DATE_START:'2026-05-06T09:00:00',DATE_STOP:'2026-05-06T18:00:00'},
  {ID:'9011',TASK_ID:'108',USER_ID:'82',SECONDS:18000,COMMENT_TEXT:'Экспорт CSV',CREATED_DATE:'2026-05-03T09:00:00',DATE_START:'2026-05-03T09:00:00',DATE_STOP:'2026-05-03T14:00:00'},
  {ID:'9012',TASK_ID:'108',USER_ID:'82',SECONDS:5400,COMMENT_TEXT:'Доработка формата',CREATED_DATE:'2026-05-04T10:00:00',DATE_START:'2026-05-04T10:00:00',DATE_STOP:'2026-05-04T11:30:00'},
  {ID:'9013',TASK_ID:'109',USER_ID:'82',SECONDS:28800,COMMENT_TEXT:'Деплой',CREATED_DATE:'2026-05-07T09:00:00',DATE_START:'2026-05-07T09:00:00',DATE_STOP:'2026-05-07T17:00:00'},
  {ID:'9014',TASK_ID:'110',USER_ID:'82',SECONDS:14400,COMMENT_TEXT:'CI/CD pipeline',CREATED_DATE:'2026-05-09T09:00:00',DATE_START:'2026-05-09T09:00:00',DATE_STOP:'2026-05-09T13:00:00'},
  {ID:'9015',TASK_ID:'111',USER_ID:'92',SECONDS:25200,COMMENT_TEXT:'Тестирование',CREATED_DATE:'2026-05-06T09:00:00',DATE_START:'2026-05-06T09:00:00',DATE_STOP:'2026-05-06T16:00:00'},
  {ID:'9016',TASK_ID:'112',USER_ID:'92',SECONDS:10800,COMMENT_TEXT:'Написание тест-кейсов',CREATED_DATE:'2026-05-08T10:00:00',DATE_START:'2026-05-08T10:00:00',DATE_STOP:'2026-05-08T13:00:00'},
  {ID:'9017',TASK_ID:'113',USER_ID:'98',SECONDS:28800,COMMENT_TEXT:'Документация',CREATED_DATE:'2026-05-05T09:00:00',DATE_START:'2026-05-05T09:00:00',DATE_STOP:'2026-05-05T17:00:00'},
  {ID:'9018',TASK_ID:'114',USER_ID:'98',SECONDS:14400,COMMENT_TEXT:'Ревью требований',CREATED_DATE:'2026-05-07T09:00:00',DATE_START:'2026-05-07T09:00:00',DATE_STOP:'2026-05-07T13:00:00'},
  {ID:'9019',TASK_ID:'115',USER_ID:'1',SECONDS:7200,COMMENT_TEXT:'Аналитика',CREATED_DATE:'2026-05-04T09:00:00',DATE_START:'2026-05-04T09:00:00',DATE_STOP:'2026-05-04T11:00:00'},
  {ID:'9020',TASK_ID:'116',USER_ID:'1',SECONDS:10800,COMMENT_TEXT:'Планирование спринта',CREATED_DATE:'2026-05-06T09:00:00',DATE_START:'2026-05-06T09:00:00',DATE_STOP:'2026-05-06T12:00:00'},
  {ID:'9021',TASK_ID:'100',USER_ID:'1',SECONDS:3600,COMMENT_TEXT:'Консультация',CREATED_DATE:'2026-05-08T14:00:00',DATE_START:'2026-05-08T14:00:00',DATE_STOP:'2026-05-08T15:00:00'},
  {ID:'9022',TASK_ID:'117',USER_ID:'116',SECONDS:18000,COMMENT_TEXT:'Верстка email',CREATED_DATE:'2026-05-02T09:00:00',DATE_START:'2026-05-02T09:00:00',DATE_STOP:'2026-05-02T14:00:00'},
  {ID:'9023',TASK_ID:'118',USER_ID:'116',SECONDS:7200,COMMENT_TEXT:'Фикс шаблона',CREATED_DATE:'2026-05-05T10:00:00',DATE_START:'2026-05-05T10:00:00',DATE_STOP:'2026-05-05T12:00:00'}
];

/* ─── Mock Tasks ─── */
PR_MOCK.tasks = [
  {id:'100',title:'Настройка экспорта',groupId:'10',status:'5',responsibleId:'18',createdDate:'2026-05-01',closedDate:'2026-05-03'},
  {id:'101',title:'Интеграция REST API',groupId:'10',status:'5',responsibleId:'18',createdDate:'2026-05-04',closedDate:'2026-05-06'},
  {id:'102',title:'Миграция данных',groupId:'20',status:'5',responsibleId:'38',createdDate:'2026-05-03',closedDate:'2026-05-04'},
  {id:'103',title:'Рефакторинг модуля расчёта',groupId:'20',status:'1',responsibleId:'38',createdDate:'2026-05-06'},
  {id:'104',title:'Code review冲刺',groupId:'30',status:'5',responsibleId:'38',createdDate:'2026-05-07',closedDate:'2026-05-08'},
  {id:'105',title:'Новый аналитический отчёт',groupId:'30',status:'5',responsibleId:'54',createdDate:'2026-05-01',closedDate:'2026-05-02'},
  {id:'106',title:'Фильтры по дате',groupId:'30',status:'5',responsibleId:'54',createdDate:'2026-05-04',closedDate:'2026-05-05'},
  {id:'107',title:'Мобильная адаптация',groupId:'10',status:'3',responsibleId:'54',createdDate:'2026-05-05'},
  {id:'108',title:'Экспорт в CSV',groupId:'20',status:'5',responsibleId:'82',createdDate:'2026-05-02',closedDate:'2026-05-04'},
  {id:'109',title:'Деплой на прод',groupId:'20',status:'5',responsibleId:'82',createdDate:'2026-05-06',closedDate:'2026-05-07'},
  {id:'110',title:'CI/CD pipeline',groupId:'10',status:'3',responsibleId:'82',createdDate:'2026-05-08'},
  {id:'111',title:'Регрессионное тестирование',groupId:'30',status:'5',responsibleId:'92',createdDate:'2026-05-05',closedDate:'2026-05-06'},
  {id:'112',title:'Написание тест-кейсов',groupId:'20',status:'5',responsibleId:'92',createdDate:'2026-05-07',closedDate:'2026-05-08'},
  {id:'113',title:'Техническая документация',groupId:'30',status:'5',responsibleId:'98',createdDate:'2026-05-04',closedDate:'2026-05-05'},
  {id:'114',title:'Ревью требований',groupId:'10',status:'1',responsibleId:'98',createdDate:'2026-05-06'},
  {id:'115',title:'Аналитика метрик',groupId:'20',status:'5',responsibleId:'1',createdDate:'2026-05-03',closedDate:'2026-05-04'},
  {id:'116',title:'Планирование спринта',groupId:'10',status:'5',responsibleId:'1',createdDate:'2026-05-05',closedDate:'2026-05-06'},
  {id:'117',title:'Верстка email-шаблонов',groupId:'30',status:'5',responsibleId:'116',createdDate:'2026-05-01',closedDate:'2026-05-02'},
  {id:'118',title:'Фикс email шаблона',groupId:'30',status:'5',responsibleId:'116',createdDate:'2026-05-04',closedDate:'2026-05-05'}
];

/* ─── Mock Projects ─── */
PR_MOCK.projects = {
  '10': {id:'10', name:'Дакар'},
  '20': {id:'20', name:'Медицина КЗ'},
  '30': {id:'30', name:'ВДЛ'}
};

/* ─── Data loader (mock → real switch) ─── */
function prLoadPeriodData(year, month) {
  if (PR_MOCK_MODE) {
    return Promise.resolve(PR_MOCK_buildMockData(year, month));
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

  return {
    elapsed: periodElapsed,
    tasks: periodTasks,
    projects: PR_MOCK.projects,
    from: range.from,
    to: range.to,
    days: range.days
  };
}

/* ─── Real data loader (for future integration) ─── */
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

    /* Filter excluded projects (need task meta) */
    /* Load task metadata in batches */
    var taskIds = [];
    var seen = {};
    allElapsed.forEach(function(e) {
      var tid = e.TASK_ID;
      if (tid && !seen[tid]) { seen[tid] = true; taskIds.push(tid); }
    });

    return fetchTasksPaginated({
      filter: {ID: taskIds},
      select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE']
    }).then(function(tasks) {
      if (!Array.isArray(tasks)) tasks = [];

      /* Build task meta and filter excluded projects */
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
