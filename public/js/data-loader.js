/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v6.12.0)

   ═══ АРХИТЕКТУРНЫЙ СДВИГ: elapsed-first pipeline ═══

   ПРЕЖНЕ (tasks-first — УДАЛЕНО):
     Загрузить ВСЕ задачи → проверить elapsed каждой → фильтр по периоду
     = 3260 задач, 273 чанка, минуты ожидания, 502 таймауты

   ТЕПЕРЬ (elapsed-first через activity-filtered tasks):
     1. Загрузить ТОЛЬКО активные задачи за период (RESPONSIBLE_ID + ACCOMPLICE)
        с фильтром >=CREATED_DATE = 3 мес назад (не 24!)
     2. Проверить elapsed только для этих задач (~100-200 вместо 3260)
     3. Фильтрация по периоду на клиенте

   Ключевые ограничения:
   - МАКСИМУМ 400 задач для проверки elapsed
   - МАКСИМУМ 500 elapsed записей
   - Таймаут 8с на каждый API запрос
   - Если часть запросов упала — продолжать с тем что есть
   - УБРАНА загрузка задач по группам (было 3260 задач!)
   ═══════════════════════════════════════════════════════════════ */

/* ─── Мьютекс и generation ─── */
var _dlLoadGeneration = 0;

/* ─── Hard limits ─── */
var _DL_MAX_TASKS = 400;
var _DL_MAX_ELAPSED = 500;
var _DL_REQUEST_TIMEOUT = 8000;
var _DL_CONCURRENT = 6;
var _DL_CHUNK_DELAY = 200;

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

/* Таймаут-обёртка для fetch */
function _dlWithTimeout(promise, ms) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      resolve({ _timeout: true, error: 'TIMEOUT_AFTER_' + ms + 'ms' });
    }, ms);
    promise.then(function(r) {
      clearTimeout(timer);
      resolve(r);
    }).catch(function(e) {
      clearTimeout(timer);
      resolve({ error: String(e) });
    });
  });
}

/* ─── API с таймаутом ─── */
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

/* ─── Загрузка данных за период ─── */
function prLoadPeriodData(year, month) {
  return PR_loadRealData(year, month);
}

/* ═══════════════════════════════════════════════════════════════
   ПАРАЛЛЕЛЬНАЯ загрузка elapsed через POST-вызовы

   Единственный рабочий формат:
     bxPost('task.elapseditem.getlist', [taskId, {ID:'DESC'}, {}])

   С таймаутом _DL_REQUEST_TIMEOUT на каждый запрос.
   С hard limit _DL_MAX_ELAPSED — прекращаем если нашли достаточно.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedConcurrent(taskIds) {
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

  console.log('[DL] Параллельная загрузка elapsed: ' + taskIds.length +
    ' задач, ' + chunks.length + ' чанков, лимит=' + _DL_MAX_ELAPSED);

  var chain = Promise.resolve();
  chunks.forEach(function(chunk, chunkIdx) {
    chain = chain.then(function() {
      /* Жёсткий лимит: прекращаем если уже нашли достаточно */
      if (allElapsed.length >= _DL_MAX_ELAPSED) {
        console.log('[DL] Лимит elapsed достигнут (' + allElapsed.length + '/' + _DL_MAX_ELAPSED + '), пропуск ' + (chunks.length - chunkIdx) + ' чанков');
        return;
      }
      if (chunkIdx > 0) return _dlDelay(_DL_CHUNK_DELAY);
    }).then(function() {
      return Promise.all(chunk.map(function(tid) {
        return _dlBxPost('task.elapseditem.getlist', [tid, {ID: 'DESC'}, {}]).then(function(r) {
          totalChecked++;
          if (r && r._timeout) {
            totalTimeouts++;
            return [];
          }
          var items = _dlParseElapsedItems(r);
          if (items.length > 0) totalWithItems++;
          return items;
        }).catch(function() {
          totalChecked++;
          totalErrors++;
          return [];
        });
      }));
    }).then(function(results) {
      if (!results) return;
      results.forEach(function(items) {
        if (!items || !items.length) return;
        items.forEach(function(e) {
          var eid = String(e.ID || '');
          if (eid && !seenIds[eid]) {
            seenIds[eid] = true;
            allElapsed.push(e);
          }
        });
      });
      /* Прогресс каждые 10 чанков */
      if ((chunkIdx + 1) % 10 === 0 || chunkIdx === chunks.length - 1) {
        console.log('[DL] Прогресс: ' + (chunkIdx + 1) + '/' + chunks.length +
          ' чанков, ' + allElapsed.length + ' elapsed, ошибок=' + totalErrors +
          ', таймаутов=' + totalTimeouts);
      }
    });
  });

  return chain.then(function() {
    console.log('[DL] Загрузка elapsed завершена: ' +
      totalChecked + ' проверено, ' + totalWithItems + ' с данными, ' +
      allElapsed.length + ' записей, ошибок=' + totalErrors + ', таймаутов=' + totalTimeouts);
    return allElapsed;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка АКТИВНЫХ задач за период

   ТОЛЬКО:
   - RESPONSIBLE_ID = devId + >=CREATED_DATE = 3 мес назад
   - ACCOMPLICE = devId + >=CREATED_DATE = 3 мес назад

   НЕ загружаем:
   - Все задачи по группам (было 3260!)
   - Все исторические задачи (было 24 мес lookback!)
   ═══════════════════════════════════════════════════════════════ */
function _prLoadActiveTasks(devIds, lookbackStr) {
  var allTasks = [];
  var seenIds = {};
  var devTaskIds = {}; /* devId -> [taskId, ...] */

  devIds.forEach(function(devId) { devTaskIds[String(devId)] = []; });

  console.log('[DL] Загрузка активных задач: ' + devIds.length + ' разработчиков, lookback=' + lookbackStr);

  var proms = [];
  devIds.forEach(function(devId, idx) {
    var uid = String(devId);

    /* RESPONSIBLE_ID */
    proms.push(
      _dlDelay(idx * 150).then(function() {
        return _dlWithTimeout(
          fetchTasksPaginated({
            filter: { RESPONSIBLE_ID: devId, '>=CREATED_DATE': lookbackStr },
            select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE'],
            order: {ID: 'DESC'}
          }, 5), /* МАКС 5 страниц = 250 задач на разработчика */
          15000
        );
      }).then(function(tasks) {
        if (tasks && tasks._timeout) {
          console.log('[DL] Таймаут загрузки задач RESPONSIBLE_ID=' + uid);
          return [];
        }
        var arr = Array.isArray(tasks) ? tasks : [];
        console.log('[DL] RESPONSIBLE_ID=' + uid + ' (' + (DEVELOPERS[uid]||'?') + '): ' + arr.length + ' задач');
        return { tasks: arr, devId: uid, source: 'responsible' };
      }).catch(function() { return { tasks: [], devId: uid, source: 'responsible' }; })
    );

    /* ACCOMPLICE */
    proms.push(
      _dlDelay(idx * 150 + 75).then(function() {
        return _dlWithTimeout(
          fetchTasksPaginated({
            filter: { ACCOMPLICE: devId, '>=CREATED_DATE': lookbackStr },
            select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE'],
            order: {ID: 'DESC'}
          }, 3), /* МАКС 3 страницы = 150 задач */
          15000
        );
      }).then(function(tasks) {
        if (tasks && tasks._timeout) {
          console.log('[DL] Таймаут загрузки задач ACCOMPLICE=' + uid);
          return [];
        }
        var arr = Array.isArray(tasks) ? tasks : [];
        if (arr.length > 0) {
          console.log('[DL] ACCOMPLICE=' + uid + ' (' + (DEVELOPERS[uid]||'?') + '): ' + arr.length + ' задач');
        }
        return { tasks: arr, devId: uid, source: 'accomplice' };
      }).catch(function() { return { tasks: [], devId: uid, source: 'accomplice' }; })
    );
  });

  return Promise.all(proms).then(function(results) {
    results.forEach(function(r) {
      if (!r || !r.tasks) return;
      r.tasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        if (!seenIds[id]) {
          seenIds[id] = true;
          allTasks.push(t);
          if (r.source === 'responsible' || r.source === 'accomplice') {
            devTaskIds[r.devId].push(id);
          }
        } else {
          /* Задача уже есть, но добавляем devId если RESPONSIBLE */
          if (r.source === 'responsible' || r.source === 'accomplice') {
            if (devTaskIds[r.devId].indexOf(id) < 0) {
              devTaskIds[r.devId].push(id);
            }
          }
        }
      });
    });

    /* Жёсткий лимит задач */
    if (allTasks.length > _DL_MAX_TASKS) {
      console.log('[DL] ⚠️ Лимит задач! ' + allTasks.length + ' > ' + _DL_MAX_TASKS + '. Обрезаем.');
      allTasks = allTasks.slice(0, _DL_MAX_TASKS);
    }

    console.log('[DL] Активных задач: ' + allTasks.length + ' (дедуплицировано)');
    return { tasks: allTasks, devTaskIds: devTaskIds };
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка потерянных задач
   ═══════════════════════════════════════════════════════════════ */
function _prLoadOrphanTasks(orphanTaskIds, tasksMeta, allTasks) {
  if (!orphanTaskIds.length) return Promise.resolve();

  var unique = [];
  var seen = {};
  orphanTaskIds.forEach(function(tid) {
    if (!seen[tid]) { seen[tid] = true; unique.push(tid); }
  });

  /* Жёсткий лимит */
  if (unique.length > 50) {
    console.log('[DL] Слишком много потерянных задач: ' + unique.length + ', обрезаем до 50');
    unique = unique.slice(0, 50);
  }

  console.log('[DL] Потерянные задачи: ' + unique.length);

  var batchProms = [];
  for (var i = 0; i < unique.length; i += 50) {
    var chunk = unique.slice(i, i + 50);
    var batchCmd = {};
    chunk.forEach(function(tid, idx) {
      batchCmd['t' + idx] = 'tasks.task.list?filter[ID]=' + tid +
        '&select[]=ID&select[]=TITLE&select[]=GROUP_ID&select[]=STATUS&select[]=RESPONSIBLE_ID';
    });
    batchProms.push(
      _dlBxPost('batch', { halt: 0, cmd: batchCmd }).then(function(r) {
        if (r && r.result && r.result.result) {
          Object.keys(r.result.result).forEach(function(key) {
            var taskResult = r.result.result[key];
            var tasks = [];
            if (taskResult && Array.isArray(taskResult.tasks)) tasks = taskResult.tasks;
            else if (Array.isArray(taskResult)) tasks = taskResult;
            tasks.forEach(function(t) {
              var id = String(t.id || t.ID);
              var gid = String(t.groupId || t.GROUP_ID || '0');
              var pname = (t.group && t.group.name) || '';
              if (tasksMeta[id]) {
                tasksMeta[id].groupId = gid || tasksMeta[id].groupId;
                if (pname) tasksMeta[id].groupName = pname;
                if (t.title || t.TITLE) tasksMeta[id].title = t.title || t.TITLE;
                tasksMeta[id].status = t.status || t.STATUS || tasksMeta[id].status;
                tasksMeta[id].responsibleId = String(t.responsibleId || t.RESPONSIBLE_ID || tasksMeta[id].responsibleId);
              }
              allTasks.push(t);
            });
          });
        }
      }).catch(function() {})
    );
  }

  return Promise.all(batchProms);
}

/* ═══════════════════════════════════════════════════════════════
   Главная функция загрузки реальных данных
   ═══════════════════════════════════════════════════════════════ */
function PR_loadRealData(year, month) {
  var gen = ++_dlLoadGeneration;
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);
  var devIds = ACTIVE_DEV_IDS;

  console.log('[DL] ═══ PR_loadRealData v6.12.0 (gen=' + gen + ') ═══');
  console.log('[DL] Период: ' + fromStr + ' — ' + toStr + ', devs=' + devIds.length +
    ', лимиты: tasks=' + _DL_MAX_TASKS + ', elapsed=' + _DL_MAX_ELAPSED);

  /* ═══ Шаг 1: Загрузка АКТИВНЫХ задач ═══
     Lookback = 3 месяца (не 24!), только RESPONSIBLE + ACCOMPLICE */
  var lookbackStr = fmt(new Date(year, month - 1 - 3, 1)); /* 3 мес lookback */

  return _prLoadActiveTasks(devIds, lookbackStr).then(function(taskResult) {
    /* Проверка поколения */
    if (gen !== _dlLoadGeneration) {
      console.log('[DL] Отмена загрузки gen=' + gen);
      return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days };
    }

    var allTasks = taskResult.tasks;
    var devTaskIds = taskResult.devTaskIds;

    /* ─── Построить tasksMeta ─── */
    var tasksMeta = {};
    var elapsedTaskIds = [];
    var elapsedSeenIds = {};
    allTasks.forEach(function(t) {
      var id = String(t.id || t.ID);
      var gid = String(t.groupId || t.GROUP_ID || (t.group && t.group.id) || '0');
      var pname = (t.group && t.group.name) || PROJECTS[gid] || '';
      tasksMeta[id] = {
        groupId: gid,
        groupName: pname,
        title: t.title || t.TITLE || '',
        status: t.status || t.STATUS || '0',
        responsibleId: String(t.responsibleId || t.RESPONSIBLE_ID || '0')
      };
      if (!elapsedSeenIds[id]) {
        elapsedSeenIds[id] = true;
        elapsedTaskIds.push(id);
      }
    });

    devIds.forEach(function(id) {
      var uid = String(id);
      console.log('[DL]   ' + (DEVELOPERS[uid]||uid) + ': ' + (devTaskIds[uid]||[]).length + ' задач');
    });

    console.log('[DL] Уникальных задач для elapsed: ' + elapsedTaskIds.length);

    /* ═══ Шаг 2: Параллельная загрузка elapsed ═══ */
    return _prLoadElapsedConcurrent(elapsedTaskIds).then(function(allElapsed) {
      /* Проверка поколения */
      if (gen !== _dlLoadGeneration) {
        console.log('[DL] Отмена после elapsed (gen=' + gen + ')');
        return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days };
      }

      console.log('[DL] Всего elapsed (до фильтрации): ' + allElapsed.length + ' записей');

      /* Диагностика */
      if (allElapsed.length > 0) {
        var uidStats = {};
        var dateStats = {};
        allElapsed.forEach(function(e) {
          var uid = String(e.USER_ID || '?');
          uidStats[uid] = (uidStats[uid] || 0) + 1;
          var d = (e.CREATED_DATE || '').substring(0, 7);
          dateStats[d] = (dateStats[d] || 0) + 1;
        });
        console.log('[DL] USER_ID distribution (raw): ' + JSON.stringify(uidStats));
        console.log('[DL] DATE distribution (raw): ' + JSON.stringify(dateStats));
      }

      /* ─── Фильтрация: период + наши разработчики ─── */
      var devIdSet = {};
      DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

      var beforeFilter = allElapsed.length;
      allElapsed = allElapsed.filter(function(e) {
        var d = (e.CREATED_DATE || '').substring(0, 10);
        if (d < fromStr || d > toStr) return false;
        return devIdSet[String(e.USER_ID)];
      });

      console.log('[DL] После фильтрации: ' + allElapsed.length + ' / ' + beforeFilter +
        ' elapsed записей (' + fromStr + ' — ' + toStr + ')');

      /* Диагностика по каждому разработчику */
      var devMinutes = {};
      var devTaskCount = {};
      allElapsed.forEach(function(e) {
        var uid = String(e.USER_ID);
        var mins = parseInt(e.MINUTES || Math.floor(parseInt(e.SECONDS || '0', 10) / 60), 10);
        devMinutes[uid] = (devMinutes[uid] || 0) + mins;
        var tid = String(e.TASK_ID);
        if (!devTaskCount[uid]) devTaskCount[uid] = {};
        devTaskCount[uid][tid] = true;
      });
      devIds.forEach(function(id) {
        var uid = String(id);
        var mins = devMinutes[uid] || 0;
        var tasks = devTaskCount[uid] ? Object.keys(devTaskCount[uid]).length : 0;
        console.log('[DL]   ' + (DEVELOPERS[uid] || uid) + ': ' + mhm(mins) + ' ч, ' + tasks + ' задач');
      });

      /* Создать плейсхолдеры для задач без метаданных */
      var orphanTaskIds = [];
      allElapsed.forEach(function(e) {
        var tid = String(e.TASK_ID || '');
        if (tid && !tasksMeta[tid]) {
          orphanTaskIds.push(tid);
          tasksMeta[tid] = {
            groupId: '0', groupName: '', title: 'Задача #' + tid,
            status: '0', responsibleId: String(e.USER_ID || '0')
          };
        }
      });

      /* ─── Загрузка потерянных задач + проекты ─── */
      return _prLoadOrphanTasks(orphanTaskIds, tasksMeta, allTasks).then(function() {
        return _prLoadProjectsAndFinish(allElapsed, allTasks, tasksMeta, range);
      });
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка проектов + финальная сборка
   ═══════════════════════════════════════════════════════════════ */
function _prLoadProjectsAndFinish(allElapsed, allTasks, tasksMeta, range) {
  return _dlBxPost('sonet_group.get', { select: ['ID','NAME'] }).then(function(r) {
    var projects = {};
    if (r && r.result) {
      var groups = r.result;
      if (!Array.isArray(groups)) groups = Object.values(groups);
      groups.forEach(function(g) {
        var id = String(g.ID || g.id);
        var nm = g.NAME || g.name || ('Группа ' + id);
        if (id && id !== '0') {
          projects[id] = { id: id, name: nm };
        }
      });
    }

    Object.keys(tasksMeta).forEach(function(tid) {
      var meta = tasksMeta[tid];
      var gid = meta.groupId;
      if (gid && gid !== '0' && projects[gid] && !meta.groupName) {
        meta.groupName = projects[gid].name;
      }
    });

    console.log('[DL] ═══ Загрузка завершена ═══');
    console.log('[DL] Результат: ' + allElapsed.length + ' elapsed, ' +
      Object.keys(tasksMeta).length + ' задач, ' +
      Object.keys(projects).length + ' проектов');

    return {
      elapsed: allElapsed,
      tasks: allTasks,
      projects: projects,
      tasksMeta: tasksMeta,
      from: range.from,
      to: range.to,
      days: range.days
    };
  }).catch(function(e) {
    console.error('[DL] Ошибка загрузки проектов', e);
    return {
      elapsed: allElapsed,
      tasks: allTasks,
      projects: {},
      tasksMeta: tasksMeta,
      from: range.from,
      to: range.to,
      days: range.days
    };
  });
}
