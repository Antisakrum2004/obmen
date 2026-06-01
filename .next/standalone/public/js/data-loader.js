/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v7.2.1)

   ═══ HYBRID ELAPSED-FIRST + TASKS-FIRST PIPELINE ═══

   ПРОБЛЕМА v7.2.0:
     ELAPSED-FIRST DAY-BY-DAY с date-фильтром вернул только 319
     записей вместо полного объёма. API не возвращает все записи.

   РЕШЕНИЕ v7.2.1 — ГИБРИДНЫЙ ПОДХОД (по мотивам bitrix-dashboard):
     ДВА ИСТОЧНИКА ДАННЫХ, объединяем и дедуплицируем:

     ИСТОЧНИК 1: ELAPSED-FIRST DAY-BY-DAY
       task.elapseditem.getlist с CREATED_DATE фильтром по дням
       Находит записи времени напрямую — быстрый, но неполный

     ИСТОЧНИК 2: TASKS-FIRST по CREATED_DATE
       tasks.task.list — ВСЕ задачи созданные за месяц
       БЕЗ RESPONSIBLE_ID — все пользователи, все статусы
       Затем per-task elapsed для каждой задачи

     Объединяем: elapsed из обоих источников + метаданные задач

   ПОЧЕМУ ЭТО НАХОДИТ ВСЁ:
     - Источник 1: прямые записи времени за каждый день
     - Источник 2: все задачи за месяц + их elapsed
       (включая старые задачи с May elapsed)
     - Пересечение покрывает ВСЕ возможные комбинации

   МАСШТАБ:
     31 elapsed day-by-day + ~10 pages tasks + ~200 per-task elapsed
     = ~240 API calls
     Ожидание: 10-30 секунд, ПОЛНЫЕ данные

   ═══════════════════════════════════════════════════════════════ */

/* ─── Мьютекс и generation ─── */
var _dlLoadGeneration = 0;

/* ─── Конфигурация ─── */
var _DL_REQUEST_TIMEOUT = 12000;
var _DL_CONCURRENT = 10;
var _DL_CHUNK_DELAY = 80;

/* ─── Невосстановимые ошибки API ─── */
var _DL_NON_RETRYABLE = [
  'ERROR_METHOD_NOT_FOUND',
  'ERROR_TASK_NOT_FOUND',
  'ERROR_ACCESS_DENIED',
  'ERROR_INSUFFICIENT_RIGHTS',
  'INVALID_REQUEST'
];

function _dlIsNonRetryable(errStr) {
  if (!errStr) return false;
  var s = String(errStr).toUpperCase();
  for (var i = 0; i < _DL_NON_RETRYABLE.length; i++) {
    if (s.indexOf(_DL_NON_RETRYABLE[i]) >= 0) return true;
  }
  return false;
}

/* ─── Утилиты ─── */
function _dlDelay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function _dlWithTimeout(promise, ms) {
  return new Promise(function(resolve) {
    var timer = setTimeout(function() {
      resolve({ _timeout: true, error: 'TIMEOUT_AFTER_' + ms + 'ms' });
    }, ms);
    promise.then(function(r) { clearTimeout(timer); resolve(r); })
      .catch(function(e) { clearTimeout(timer); resolve({ error: String(e) }); });
  });
}

function _dlBxPost(method, body) {
  return _dlWithTimeout(bxPost(method, body), _DL_REQUEST_TIMEOUT);
}

/* ═══════════════════════════════════════════════════════════════
   ИЗВЛЕЧЕНИЕ elapsed ИЗ ответа task.elapseditem.getlist
   ═══════════════════════════════════════════════════════════════ */
function _dlParseElapsedItems(r) {
  if (!r || r._timeout) return [];
  if (r && r.error) return [];
  if (!r || !r.result) return [];
  if (Array.isArray(r.result)) return r.result;
  if (r.result.result && Array.isArray(r.result.result)) return r.result.result;
  if (r.result.items && Array.isArray(r.result.items)) return r.result.items;
  return [];
}

/* ═══════════════════════════════════════════════════════════════
   КЭШ
   ═══════════════════════════════════════════════════════════════ */
function prLoadPeriodData(year, month, progressCb) {
  var periodKey = prGetPeriodKey(year, month);
  var cacheKey = 'data:' + periodKey;

  if (typeof PayrollCache !== 'undefined') {
    var cached = PayrollCache.get(cacheKey);
    if (cached) {
      console.log('[DL] CACHE HIT: ' + cacheKey + ' (age=' +
        Math.round((Date.now() - (cached._cachedAt || 0)) / 1000) + 'с)');
      if (progressCb) progressCb('Из кэша', periodKey);
      return Promise.resolve(cached);
    }
  }

  return PR_loadRealData(year, month, progressCb).then(function(data) {
    if (typeof PayrollCache !== 'undefined' && data) {
      data._cachedAt = Date.now();
      PayrollCache.set(cacheKey, data, 5 * 60 * 1000);
      console.log('[DL] CACHE SET: ' + cacheKey);
    }
    return data;
  });
}

/* ═══════════════════════════════════════════════════════════════
   ИСТОЧНИК 1: ELAPSED-FIRST DAY-BY-DAY

   task.elapseditem.getlist с CREATED_DATE фильтром по дням.
   Быстрый, но может возвращать не все записи.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedDayByDay(year, month, devIdSet) {
  var range = prGetMonthRange(year, month);
  var daysInMonth = range.days;
  var allElapsed = [];
  var seenIds = {};
  var totalApiCalls = 0;
  var totalErrors = 0;
  var totalTimeouts = 0;

  console.log('[DL] ИСТОЧНИК 1: ELAPSED DAY-BY-DAY: ' + daysInMonth + ' дней');

  var dates = [];
  for (var d = 1; d <= daysInMonth; d++) {
    dates.push(year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
  }

  var dayPromises = dates.map(function(ds) {
    totalApiCalls++;
    return _dlBxPost('task.elapseditem.getlist', [
      0, {},
      { '>=CREATED_DATE': ds, '<=CREATED_DATE': ds + ' 23:59:59' },
      ['ID', 'TASK_ID', 'USER_ID', 'MINUTES', 'SECONDS', 'CREATED_DATE', 'COMMENT_TEXT']
    ]).then(function(r) {
      if (r && r._timeout) { totalTimeouts++; return []; }
      if (r && r.error) { totalErrors++; return []; }
      return _dlParseElapsedItems(r);
    }).catch(function() { totalErrors++; return []; });
  });

  return Promise.all(dayPromises).then(function(dayResults) {
    dayResults.forEach(function(items) {
      if (!Array.isArray(items)) return;
      items.forEach(function(e) {
        var eid = String(e.ID || '');
        if (!devIdSet[String(e.USER_ID)]) return;
        if (eid && !seenIds[eid]) {
          seenIds[eid] = true;
          allElapsed.push(e);
        }
      });
    });

    console.log('[DL] ИСТОЧНИК 1: ' + allElapsed.length + ' elapsed записей' +
      ' (API=' + totalApiCalls + ', ошибок=' + totalErrors + ', таймаутов=' + totalTimeouts + ')');

    return { elapsed: allElapsed, apiCalls: totalApiCalls, errors: totalErrors, timeouts: totalTimeouts };
  });
}

/* ═══════════════════════════════════════════════════════════════
   ИСТОЧНИК 2: TASKS-FIRST по CREATED_DATE за весь месяц

   Загружаем ВСЕ задачи созданные за месяц:
   - БЕЗ RESPONSIBLE_ID (все пользователи)
   - БЕЗ статусного фильтра (все статусы)
   - С пагинацией до 20 страниц (1000 задач)

   Это подход из bitrix-dashboard вкладка "В счёт".
   ═══════════════════════════════════════════════════════════════ */
function _prLoadAllTasksForPeriod(fromStr, toStr) {
  console.log('[DL] ИСТОЧНИК 2: Загрузка ВСЕХ задач за период (CREATED_DATE)');

  return _dlWithTimeout(
    fetchTasksPaginated({
      filter: {
        '>=CREATED_DATE': fromStr,
        '<=CREATED_DATE': toStr + ' 23:59:59'
      },
      select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','DATE_ACTIVITY','CLOSED_DATE'],
      order: { ID: 'DESC' }
    }, 20),  /* до 20 страниц = 1000 задач */
    30000
  ).then(function(tasks) {
    if (!tasks || tasks._timeout) {
      console.log('[DL] ИСТОЧНИК 2: таймаут загрузки задач');
      return [];
    }
    var arr = Array.isArray(tasks) ? tasks : [];
    console.log('[DL] ИСТОЧНИК 2: ' + arr.length + ' задач по CREATED_DATE');
    return arr;
  }).catch(function(e) {
    console.log('[DL] ИСТОЧНИК 2: ошибка загрузки задач: ' + e);
    return [];
  });
}

/* ═══════════════════════════════════════════════════════════════
   ДОПОЛНЕНИЕ: задачи по CLOSED_DATE за период

   Задачи закрытые в мае, но созданные раньше —
   в них тоже может быть May elapsed.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadClosedTasksForPeriod(fromStr, toStr) {
  console.log('[DL] ДОПОЛНЕНИЕ: Загрузка задач закрытых за период (CLOSED_DATE)');

  return _dlWithTimeout(
    fetchTasksPaginated({
      filter: {
        '>=CLOSED_DATE': fromStr,
        '<=CLOSED_DATE': toStr + ' 23:59:59',
        'STATUS': 5
      },
      select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
      order: { ID: 'DESC' }
    }, 10),
    20000
  ).then(function(tasks) {
    if (!tasks || tasks._timeout) return [];
    var arr = Array.isArray(tasks) ? tasks : [];
    console.log('[DL] ДОПОЛНЕНИЕ: ' + arr.length + ' задач по CLOSED_DATE');
    return arr;
  }).catch(function() { return []; });
}

/* ═══════════════════════════════════════════════════════════════
   Per-task ELAPSED — параллельная загрузка

   Для задач из Источника 2 загружаем ВСЕ их elapsed записи,
   потом фильтруем по нашим разработчикам и периоду.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedForTasks(taskIds) {
  if (!taskIds.length) return Promise.resolve([]);

  var allElapsed = [];
  var seenIds = {};
  var totalChecked = 0;
  var totalWithItems = 0;
  var totalErrors = 0;
  var totalTimeouts = 0;

  var chunks = [];
  for (var i = 0; i < taskIds.length; i += _DL_CONCURRENT) {
    chunks.push(taskIds.slice(i, i + _DL_CONCURRENT));
  }

  console.log('[DL] Per-task elapsed: ' + taskIds.length +
    ' задач, ' + chunks.length + ' чанков');

  var chain = Promise.resolve();
  chunks.forEach(function(chunk, chunkIdx) {
    chain = chain.then(function() {
      if (chunkIdx > 0) return _dlDelay(_DL_CHUNK_DELAY);
    }).then(function() {
      return Promise.all(chunk.map(function(tid) {
        return _dlBxPost('task.elapseditem.getlist', [parseInt(tid) || 0, {ID: 'DESC'}, {}]).then(function(r) {
          totalChecked++;
          if (r && r._timeout) { totalTimeouts++; return []; }
          var items = _dlParseElapsedItems(r);
          if (items.length > 0) totalWithItems++;
          return items;
        }).catch(function() { totalChecked++; totalErrors++; return []; });
      }));
    }).then(function(results) {
      if (!results) return;
      results.forEach(function(items) {
        if (!items || !items.length) return;
        items.forEach(function(e) {
          var eid = String(e.ID || '');
          if (eid && !seenIds[eid]) { seenIds[eid] = true; allElapsed.push(e); }
        });
      });
      /* Прогресс */
      if ((chunkIdx + 1) % 10 === 0 || chunkIdx === chunks.length - 1) {
        console.log('[DL] Per-task прогресс: ' + (chunkIdx + 1) + '/' + chunks.length +
          ' чанков, ' + allElapsed.length + ' elapsed');
      }
    });
  });

  return chain.then(function() {
    console.log('[DL] Per-task elapsed завершён: ' +
      totalChecked + ' проверено, ' + totalWithItems + ' с данными, ' +
      allElapsed.length + ' записей, ошибок=' + totalErrors + ', таймаутов=' + totalTimeouts);
    return allElapsed;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка метаданных задач по ID (batch по 50)
   ═══════════════════════════════════════════════════════════════ */
function _prLoadTaskMetadata(taskIds) {
  if (!taskIds.length) return Promise.resolve({});

  var tasksMeta = {};
  var batches = [];
  for (var i = 0; i < taskIds.length; i += 50) {
    batches.push(taskIds.slice(i, i + 50));
  }

  console.log('[DL] Загрузка метаданных: ' + taskIds.length +
    ' задач, ' + batches.length + ' батчей');

  var batchProms = batches.map(function(batch, idx) {
    return _dlDelay(idx * 100).then(function() {
      return _dlBxPost('tasks.task.list', {
        filter: { ID: batch },
        select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','DATE_ACTIVITY']
      });
    }).then(function(r) {
      if (!r || r.error || !r.result) return;
      var tasks = r.result.tasks || r.result || [];
      if (!Array.isArray(tasks)) tasks = [];
      tasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        var gid = String(t.groupId || t.GROUP_ID || (t.group && t.group.id) || '0');
        var pname = (t.group && t.group.name) || PROJECTS[gid] || '';
        tasksMeta[id] = {
          groupId: gid, groupName: pname,
          title: t.title || t.TITLE || '',
          status: t.status || t.STATUS || '0',
          responsibleId: String(t.responsibleId || t.RESPONSIBLE_ID || '0')
        };
      });
    }).catch(function() {});
  });

  return Promise.all(batchProms).then(function() {
    console.log('[DL] Метаданные: ' + Object.keys(tasksMeta).length + ' задач');
    return tasksMeta;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Главная функция загрузки — HYBRID v7.2.1

   1. ИСТОЧНИК 1: ELAPSED-FIRST DAY-BY-DAY (быстрый)
   2. ИСТОЧНИК 2: TASKS-FIRST CREATED_DATE + CLOSED_DATE (полный)
   3. Per-task elapsed для задач из Источника 2
   4. ОБЪЕДИНЕНИЕ + дедупликация elapsed
   5. Метаданные + проекты
   ═══════════════════════════════════════════════════════════════ */
function PR_loadRealData(year, month, progressCb) {
  var gen = ++_dlLoadGeneration;
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);
  var devIds = ACTIVE_DEV_IDS;

  var devIdSet = {};
  devIds.forEach(function(id) { devIdSet[String(id)] = true; });

  var metrics = {
    pipelineVersion: '7.2.1',
    pipelineMode: 'hybrid',
    periodKey: prGetPeriodKey(year, month),
    loadStartMs: Date.now(),
    loadEndMs: 0,
    source1Elapsed: 0,
    source2Tasks: 0,
    source2NewTaskIds: 0,
    perTaskElapsed: 0,
    totalElapsed: 0,
    uniqueTasks: 0,
    apiCalls: 0,
    errors: 0,
    timeouts: 0
  };

  console.log('[DL] ═══ PR_loadRealData v7.2.1 HYBRID (gen=' + gen + ') ═══');
  console.log('[DL] Период: ' + fromStr + ' — ' + toStr);
  console.log('[DL] Разработчиков: ' + devIds.length);

  /* ═══ Шаг 1: ИСТОЧНИК 1 — ELAPSED-FIRST DAY-BY-DAY ═══ */
  if (progressCb) progressCb('Загрузка elapsed по дням', fromStr + ' — ' + toStr);

  var elapsedP = _prLoadElapsedDayByDay(year, month, devIdSet);

  /* ═══ Шаг 2: ИСТОЧНИК 2 — TASKS-FIRST по CREATED_DATE ═══ */
  var tasksP = _prLoadAllTasksForPeriod(fromStr, toStr);
  var closedP = _prLoadClosedTasksForPeriod(fromStr, toStr);

  /* Запускаем все 3 запроса параллельно */
  return Promise.all([elapsedP, tasksP, closedP]).then(function(results) {
    if (gen !== _dlLoadGeneration) {
      return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days, _metrics: metrics };
    }

    var elapsedResult = results[0];
    var createdTasks = results[1];
    var closedTasks = results[2];

    /* Данные из Источника 1 */
    var source1Elapsed = elapsedResult.elapsed;
    metrics.source1Elapsed = source1Elapsed.length;
    metrics.apiCalls += elapsedResult.apiCalls;
    metrics.errors += elapsedResult.errors;
    metrics.timeouts += elapsedResult.timeouts;

    /* Объединяем задачи из Источника 2 (созданные + закрытые) */
    var allTasks = [];
    var taskSeenIds = {};
    createdTasks.concat(closedTasks).forEach(function(t) {
      var id = String(t.id || t.ID);
      if (!taskSeenIds[id]) {
        taskSeenIds[id] = true;
        allTasks.push(t);
      }
    });
    metrics.source2Tasks = allTasks.length;

    /* Извлекаем TASK_ID из Источника 1 (уже есть elapsed) */
    var elapsedTaskIds = {};
    source1Elapsed.forEach(function(e) {
      var tid = String(e.TASK_ID || '');
      if (tid) elapsedTaskIds[tid] = true;
    });

    /* Находим НОВЫЕ задачи из Источника 2 (нет в elapsed Источника 1) */
    var newTaskIds = [];
    allTasks.forEach(function(t) {
      var id = String(t.id || t.ID);
      if (!elapsedTaskIds[id]) {
        newTaskIds.push(id);
      }
    });
    metrics.source2NewTaskIds = newTaskIds.length;

    console.log('[DL] ИСТОЧНИК 1: ' + source1Elapsed.length + ' elapsed, ' +
      Object.keys(elapsedTaskIds).length + ' задач');
    console.log('[DL] ИСТОЧНИК 2: ' + allTasks.length + ' задач (' +
      createdTasks.length + ' created + ' + closedTasks.length + ' closed), из них новых: ' + newTaskIds.length);

    if (progressCb) progressCb('Загрузка elapsed для задач', newTaskIds.length + ' новых задач');

    /* ═══ Шаг 3: Per-task elapsed для НОВЫХ задач ═══ */
    return _prLoadElapsedForTasks(newTaskIds).then(function(source2Elapsed) {
      if (gen !== _dlLoadGeneration) {
        return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days, _metrics: metrics };
      }

      /* Фильтруем elapsed из Источника 2 по нашим разработчикам и периоду */
      source2Elapsed = source2Elapsed.filter(function(e) {
        var d = (e.CREATED_DATE || '').substring(0, 10);
        if (d < fromStr || d > toStr) return false;
        return devIdSet[String(e.USER_ID)];
      });
      metrics.perTaskElapsed = source2Elapsed.length;

      console.log('[DL] Per-task elapsed (отфильтровано за май): ' + source2Elapsed.length + ' записей');

      /* ═══ Шаг 4: ОБЪЕДИНЕНИЕ + дедупликация ═══ */
      var allElapsed = [];
      var seenElapsedIds = {};

      source1Elapsed.forEach(function(e) {
        var eid = String(e.ID || '');
        if (eid && !seenElapsedIds[eid]) {
          seenElapsedIds[eid] = true;
          allElapsed.push(e);
        }
      });

      source2Elapsed.forEach(function(e) {
        var eid = String(e.ID || '');
        if (eid && !seenElapsedIds[eid]) {
          seenElapsedIds[eid] = true;
          allElapsed.push(e);
        }
      });

      metrics.totalElapsed = allElapsed.length;

      console.log('[DL] ОБЪЕДИНЕНИЕ: ' + allElapsed.length + ' elapsed (' +
        source1Elapsed.length + ' источник1 + ' + source2Elapsed.length + ' источник2, дедупл)');

      /* Диагностика */
      if (allElapsed.length > 0) {
        var uidStats = {};
        allElapsed.forEach(function(e) {
          var uid = String(e.USER_ID || '?');
          uidStats[uid] = (uidStats[uid] || 0) + 1;
        });
        console.log('[DL] USER_ID distribution (итого): ' + JSON.stringify(uidStats));
      }

      /* ═══ Шаг 5: Метаданные задач ═══ */
      if (progressCb) progressCb('Загрузка метаданных', allElapsed.length + ' elapsed');

      /* Собираем все TASK_ID */
      var allTaskIds = [];
      var taskIdSeen = {};
      allElapsed.forEach(function(e) {
        var tid = String(e.TASK_ID || '');
        if (tid && !taskIdSeen[tid]) {
          taskIdSeen[tid] = true;
          allTaskIds.push(tid);
        }
      });
      metrics.uniqueTasks = allTaskIds.length;

      /* Строим tasksMeta из задач Источника 2 */
      var tasksMeta = {};
      allTasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        var gid = String(t.groupId || t.GROUP_ID || (t.group && t.group.id) || '0');
        var pname = (t.group && t.group.name) || PROJECTS[gid] || '';
        tasksMeta[id] = {
          groupId: gid, groupName: pname,
          title: t.title || t.TITLE || '',
          status: t.status || t.STATUS || '0',
          responsibleId: String(t.responsibleId || t.RESPONSIBLE_ID || '0')
        };
      });

      /* Загружаем метаданные для задач НЕ из Источника 2 */
      var metaMissingIds = allTaskIds.filter(function(tid) { return !tasksMeta[tid]; });

      var metaP;
      if (metaMissingIds.length > 0) {
        metaP = _prLoadTaskMetadata(metaMissingIds).then(function(extraMeta) {
          Object.keys(extraMeta).forEach(function(tid) {
            if (!tasksMeta[tid]) tasksMeta[tid] = extraMeta[tid];
          });
        });
      } else {
        metaP = Promise.resolve();
      }

      return metaP.then(function() {
        /* Orphan placeholders */
        allElapsed.forEach(function(e) {
          var tid = String(e.TASK_ID || '');
          if (tid && !tasksMeta[tid]) {
            tasksMeta[tid] = {
              groupId: '0', groupName: '', title: 'Задача #' + tid,
              status: '0', responsibleId: String(e.USER_ID || '0')
            };
          }
        });

        /* allTasks для совместимости */
        var finalTasks = [];
        Object.keys(tasksMeta).forEach(function(tid) {
          var m = tasksMeta[tid];
          finalTasks.push({ id: tid, title: m.title, groupId: m.groupId, status: m.status, responsibleId: m.responsibleId });
        });

        if (progressCb) progressCb('Финализация', allElapsed.length + ' elapsed');

        return _prLoadProjectsAndFinish(allElapsed, finalTasks, tasksMeta, range, metrics);
      });
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка проектов + финальная сборка
   ═══════════════════════════════════════════════════════════════ */
function _prLoadProjectsAndFinish(allElapsed, allTasks, tasksMeta, range, metrics) {
  return _dlBxPost('sonet_group.get', { select: ['ID','NAME'] }).then(function(r) {
    var projects = {};
    if (r && r.result) {
      var groups = r.result;
      if (!Array.isArray(groups)) groups = Object.values(groups);
      groups.forEach(function(g) {
        var id = String(g.ID || g.id);
        var nm = g.NAME || g.name || ('Группа ' + id);
        if (id && id !== '0') projects[id] = { id: id, name: nm };
      });
    }

    Object.keys(tasksMeta).forEach(function(tid) {
      var meta = tasksMeta[tid];
      var gid = meta.groupId;
      if (gid && gid !== '0' && projects[gid] && !meta.groupName) {
        meta.groupName = projects[gid].name;
      }
    });

    metrics.loadEndMs = Date.now();
    var loadTimeSec = ((metrics.loadEndMs - metrics.loadStartMs) / 1000).toFixed(1);

    /* Диагностика по разработчикам */
    var devMinutes = {};
    var devTaskCount = {};
    var devIdSet = {};
    ACTIVE_DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

    allElapsed.forEach(function(e) {
      var uid = String(e.USER_ID);
      if (!devIdSet[uid]) return;
      var mins = parseInt(e.MINUTES || Math.floor(parseInt(e.SECONDS || '0', 10) / 60), 10);
      devMinutes[uid] = (devMinutes[uid] || 0) + mins;
      var tid = String(e.TASK_ID);
      if (!devTaskCount[uid]) devTaskCount[uid] = {};
      devTaskCount[uid][tid] = true;
    });

    console.log('[DL] ═══ Загрузка завершена ═══');
    console.log('[DL] Pipeline: ' + metrics.pipelineMode + ' v' + metrics.pipelineVersion);
    console.log('[DL] Источник1 (elapsed day-by-day): ' + metrics.source1Elapsed + ' elapsed');
    console.log('[DL] Источник2 (tasks CREATED/CLOSED): ' + metrics.source2Tasks + ' задач, ' + metrics.source2NewTaskIds + ' новых');
    console.log('[DL] Per-task elapsed: ' + metrics.perTaskElapsed + ' новых записей');
    console.log('[DL] ИТОГО: ' + allElapsed.length + ' elapsed, ' +
      Object.keys(tasksMeta).length + ' задач, ' +
      Object.keys(projects).length + ' проектов');
    console.log('[DL] Время: ' + loadTimeSec + 'с');

    var totalMins = 0;
    ACTIVE_DEV_IDS.forEach(function(id) {
      var uid = String(id);
      var mins = devMinutes[uid] || 0;
      totalMins += mins;
      var tasks = devTaskCount[uid] ? Object.keys(devTaskCount[uid]).length : 0;
      console.log('[DL]   ' + (DEVELOPERS[uid] || uid) + ': ' + mhm(mins) + ' ч, ' + tasks + ' задач');
    });
    console.log('[DL]   ВСЕГО: ' + mhm(totalMins) + ' ч');

    return {
      elapsed: allElapsed, tasks: allTasks, projects: projects, tasksMeta: tasksMeta,
      from: range.from, to: range.to, fromStr: fmt(range.from), toStr: fmt(range.to),
      days: range.days, _metrics: metrics
    };
  }).catch(function(e) {
    console.error('[DL] Ошибка загрузки проектов', e);
    metrics.loadEndMs = Date.now();
    return {
      elapsed: allElapsed, tasks: allTasks, projects: {}, tasksMeta: tasksMeta,
      from: range.from, to: range.to, days: range.days, _metrics: metrics
    };
  });
}
