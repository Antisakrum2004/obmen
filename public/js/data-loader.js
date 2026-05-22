/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v7.1.0)

   ═══ ACTIVITY-FILTERED TASKS-FIRST PIPELINE ═══

   АРХИТЕКТУРНЫЙ СДВИГ v7.0.0:

   ПРЕЖНЕ (tasks-first — УДАЛЕНО):
     Загрузить ВСЕ задачи (3 мес lookback по CREATED_DATE)
     → проверить elapsed каждой → фильтр по периоду
     = 3260 задач, 273 чанка, минуты ожидания, 502 таймауты

   v7.1.0 ИСПРАВЛЕНИЯ (по результатам v7.0.0):
     - Убран буфер 14 дней (58-дневное окно → точный месяц)
       Буфер давал 1020 задач вместо ожидаемых 80-250
     - Убраны ACCOMPLICE-запросы (111 лишних задач)
       elapsed у ACCOMPLICE находится через RESPONSIBLE_ID задач
     - Пагинация 3→2 страницы (150→100 задач на разработчика)
     - Лимиты снижены: tasks 400→250, elapsed 500→350
     - Конкурентность увеличена: 6→10 параллельных запросов

   ТЕПЕРЬ (activity-filtered tasks-first v7.1.0):
     1. tasks.task.list с DATE_ACTIVITY фильтром ТОЧНО ЗА МЕСЯЦ (без буфера)
     2. Дедупликация TASK_ID
     3. task.elapseditem.getlist ТОЛЬКО для найденных taskIds
     4. Фильтрация elapsed по выбранному месяцу
     5. Построение projection

   Ожидаемый масштаб:
     80-250 задач на месяц
     15-40 API calls
     5-15 сек загрузка

   КРИТИЧЕСКИЕ ПРАВИЛА:
   - МАКСИМУМ 250 задач для проверки elapsed
   - МАКСИМУМ 350 elapsed записей
   - Таймаут 8с на каждый запрос
   - Если часть упала — продолжать с тем что есть
   - ЗАПРЕЩЕНО: load all tasks, recursive group scans, no-date loading,
     unbounded pagination, tasks without activity filter, ACCOMPLICE queries,
     activity buffer > 0 days
   - КЭШ: TTL 5 мин, PayrollCache

   ═══════════════════════════════════════════════════════════════ */

/* ─── Мьютекс и generation ─── */
var _dlLoadGeneration = 0;

/* ─── Hard limits ─── */
var _DL_MAX_TASKS = 250;
var _DL_MAX_ELAPSED = 350;
var _DL_REQUEST_TIMEOUT = 8000;
var _DL_CONCURRENT = 10;
var _DL_CHUNK_DELAY = 100;

/* ─── Activity buffer (days before/after period) ───
   v7.1.0: Установлен в 0. Буфер 14 дней давал 58-дневное окно
   и 1020 задач вместо 80-250. Без буфера — точный месяц. */
var _DL_ACTIVITY_BUFFER_DAYS = 0;

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

/* ═══════════════════════════════════════════════════════════════
   Загрузка данных за период С КЭШЕМ

   Логика:
   1. Проверить кэш PayrollCache.get(key) — если валидный, вернуть мгновенно
   2. Если нет кэша — загрузить через PR_loadRealData
   3. Сохранить результат в кэш с TTL 5 мин
   ═══════════════════════════════════════════════════════════════ */
function prLoadPeriodData(year, month, progressCb) {
  var periodKey = prGetPeriodKey(year, month);
  var cacheKey = 'data:' + periodKey;

  /* Шаг 1: Проверяем кэш */
  if (typeof PayrollCache !== 'undefined') {
    var cached = PayrollCache.get(cacheKey);
    if (cached) {
      console.log('[DL] CACHE HIT: ' + cacheKey + ' (age=' +
        Math.round((Date.now() - (cached._cachedAt || 0)) / 1000) + 'с)');
      if (progressCb) progressCb('Из кэша', periodKey);
      return Promise.resolve(cached);
    }
  }

  /* Шаг 2: Загружаем свежие данные */
  return PR_loadRealData(year, month, progressCb).then(function(data) {
    /* Шаг 3: Сохраняем в кэш с TTL 5 мин */
    if (typeof PayrollCache !== 'undefined' && data) {
      data._cachedAt = Date.now();
      PayrollCache.set(cacheKey, data, 5 * 60 * 1000);
      console.log('[DL] CACHE SET: ' + cacheKey);
    }
    return data;
  });
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
      /* Прогресс каждые 5 чанков или последний */
      if ((chunkIdx + 1) % 5 === 0 || chunkIdx === chunks.length - 1) {
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

   v7.1.0: ТОЛЬКО RESPONSIBLE_ID + точный период (без буфера):
   - RESPONSIBLE_ID = devId + >=DATE_ACTIVITY / <=DATE_ACTIVITY
   - ACCOMPLICE запросы УДАЛЕНЫ — давали 111 лишних задач,
     а elapsed соучастников находится через задачи ответственных

   НЕ загружаем:
   - Все задачи по группам (было 3260!)
   - Все исторические задачи
   - Задачи без activity filter
   - ACCOMPLICE задачи (v7.1.0 — удалено)
   ═══════════════════════════════════════════════════════════════ */
function _prLoadActiveTasks(devIds, fromStr, toStr) {
  var allTasks = [];
  var seenIds = {};
  var devTaskIds = {}; /* devId -> [taskId, ...] */

  devIds.forEach(function(devId) { devTaskIds[String(devId)] = []; });

  console.log('[DL] Загрузка активных задач: ' + devIds.length +
    ' разработчиков, период: ' + fromStr + ' — ' + toStr);

  var proms = [];
  devIds.forEach(function(devId, idx) {
    var uid = String(devId);

    /* RESPONSIBLE_ID с DATE_ACTIVITY фильтром — ЕДИНСТВЕННЫЙ источник задач */
    proms.push(
      _dlDelay(idx * 120).then(function() {
        return _dlWithTimeout(
          fetchTasksPaginated({
            filter: {
              RESPONSIBLE_ID: devId,
              '>=DATE_ACTIVITY': fromStr,
              '<=DATE_ACTIVITY': toStr
            },
            select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','DATE_ACTIVITY'],
            order: {ID: 'DESC'}
          }, 2), /* МАКС 2 страницы = 100 задач на разработчика */
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
  });

  return Promise.all(proms).then(function(results) {
    results.forEach(function(r) {
      if (!r || !r.tasks) return;
      r.tasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        if (!seenIds[id]) {
          seenIds[id] = true;
          allTasks.push(t);
          if (r.source === 'responsible') {
            devTaskIds[r.devId].push(id);
          }
        } else {
          /* Задача уже есть, но добавляем devId если RESPONSIBLE */
          if (r.source === 'responsible') {
            if (devTaskIds[r.devId].indexOf(id) < 0) {
              devTaskIds[r.devId].push(id);
            }
          }
        }
      });
    });

    /* Жёсткий лимит задач */
    if (allTasks.length > _DL_MAX_TASKS) {
      console.log('[DL] ЛИМИТ ЗАДАЧ! ' + allTasks.length + ' > ' + _DL_MAX_TASKS + '. Обрезаем.');
      allTasks = allTasks.slice(0, _DL_MAX_TASKS);
    }

    console.log('[DL] Активных задач: ' + allTasks.length + ' (дедуплицировано)');
    return { tasks: allTasks, devTaskIds: devTaskIds };
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка потерянных задач (orphan — есть elapsed, но нет метаданных)
   Ограничение: максимум 50 orphan задач.
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

   ACTIVITY-FILTERED TASKS-FIRST PIPELINE:
   1. tasks.task.list с DATE_ACTIVITY фильтром
   2. Дедупликация TASK_ID
   3. task.elapseditem.getlist для найденных taskIds
   4. Фильтрация elapsed по периоду
   5. Загрузка проектов + финальная сборка
   ═══════════════════════════════════════════════════════════════ */
function PR_loadRealData(year, month, progressCb) {
  var gen = ++_dlLoadGeneration;
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);
  var devIds = ACTIVE_DEV_IDS;

  /* v7.1.0: Activity buffer = 0. Используем ТОЧНЫЙ период.
     Буфер 14 дней давал 58-дневное окно → 1020 задач вместо 80-250. */
  var activityFromStr = fromStr;
  var activityToStr = toStr;

  /* Метрики ДО/ПОСЛЕ */
  var metrics = {
    pipelineVersion: '7.1.0',
    periodKey: prGetPeriodKey(year, month),
    oldTasksLoaded: 3260,    /* Старый пайплайн: 3260 задач */
    oldElapsedChecks: 2182,  /* Старый: 2182 проверки */
    oldApiCalls: 273,        /* Старый: 273 чанка */
    newTasksLoaded: 0,
    newElapsedChecks: 0,
    newApiCalls: 0,
    loadStartMs: Date.now(),
    loadEndMs: 0,
    cacheHit: false
  };

  console.log('[DL] ═══ PR_loadRealData v7.1.0 (gen=' + gen + ') ═══');
  console.log('[DL] Период: ' + fromStr + ' — ' + toStr);
  console.log('[DL] Activity filter: ТОЧНЫЙ ПЕРИОД (без буфера)');
  console.log('[DL] Разработчиков: ' + devIds.length +
    ', лимиты: tasks=' + _DL_MAX_TASKS + ', elapsed=' + _DL_MAX_ELAPSED +
    ', concurrent=' + _DL_CONCURRENT);

  if (progressCb) progressCb('Загрузка задач за период', fromStr + ' — ' + toStr);

  /* ═══ Шаг 1: Загрузка АКТИВНЫХ задач за период ═══ */
  return _prLoadActiveTasks(devIds, activityFromStr, activityToStr).then(function(taskResult) {
    /* Проверка поколения */
    if (gen !== _dlLoadGeneration) {
      console.log('[DL] Отмена загрузки gen=' + gen);
      return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days, _metrics: metrics };
    }

    var allTasks = taskResult.tasks;
    var devTaskIds = taskResult.devTaskIds;
    metrics.newTasksLoaded = allTasks.length;

    if (progressCb) progressCb('Задачи загружены', allTasks.length + ' задач');

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
    metrics.newElapsedChecks = elapsedTaskIds.length;
    metrics.newApiCalls = Math.ceil(elapsedTaskIds.length / _DL_CONCURRENT);

    /* ═══ Шаг 2: Параллельная загрузка elapsed ═══ */
    if (progressCb) progressCb('Загрузка elapsed', elapsedTaskIds.length + ' задач');

    return _prLoadElapsedConcurrent(elapsedTaskIds).then(function(allElapsed) {
      /* Проверка поколения */
      if (gen !== _dlLoadGeneration) {
        console.log('[DL] Отмена после elapsed (gen=' + gen + ')');
        return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days, _metrics: metrics };
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

      /* ─── Фильтрация: период + наши АКТИВНЫЕ разработчики ─── */
      var devIdSet = {};
      ACTIVE_DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

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

      /* Создать плейсхолдеры для задач без метаданных (orphan) */
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
      if (progressCb) progressCb('Финализация', allElapsed.length + ' elapsed');

      return _prLoadOrphanTasks(orphanTaskIds, tasksMeta, allTasks).then(function() {
        return _prLoadProjectsAndFinish(allElapsed, allTasks, tasksMeta, range, metrics);
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

    /* Финализация метрик */
    metrics.loadEndMs = Date.now();
    var loadTimeSec = ((metrics.loadEndMs - metrics.loadStartMs) / 1000).toFixed(1);

    console.log('[DL] ═══ Загрузка завершена ═══');
    console.log('[DL] Результат: ' + allElapsed.length + ' elapsed, ' +
      Object.keys(tasksMeta).length + ' задач, ' +
      Object.keys(projects).length + ' проектов');
    console.log('[DL] Время загрузки: ' + loadTimeSec + 'с');
    console.log('[DL] ═══ МЕТРИКИ ДО/ПОСЛЕ ═══');
    console.log('[DL]   Задачи:     ДО=' + metrics.oldTasksLoaded + ' → ПОСЛЕ=' + metrics.newTasksLoaded +
      ' (' + Math.round((1 - metrics.newTasksLoaded / metrics.oldTasksLoaded) * 100) + '% меньше)');
    console.log('[DL]   Elapsed checks: ДО=' + metrics.oldElapsedChecks + ' → ПОСЛЕ=' + metrics.newElapsedChecks +
      ' (' + Math.round((1 - metrics.newElapsedChecks / metrics.oldElapsedChecks) * 100) + '% меньше)');
    console.log('[DL]   API calls:  ДО=' + metrics.oldApiCalls + ' → ПОСЛЕ=' + metrics.newApiCalls +
      ' (' + Math.round((1 - metrics.newApiCalls / metrics.oldApiCalls) * 100) + '% меньше)');
    console.log('[DL]   Load time:  ДО=минуты → ПОСЛЕ=' + loadTimeSec + 'с');

    return {
      elapsed: allElapsed,
      tasks: allTasks,
      projects: projects,
      tasksMeta: tasksMeta,
      from: range.from,
      to: range.to,
      fromStr: fmt(range.from),
      toStr: fmt(range.to),
      days: range.days,
      _metrics: metrics
    };
  }).catch(function(e) {
    console.error('[DL] Ошибка загрузки проектов', e);
    metrics.loadEndMs = Date.now();
    return {
      elapsed: allElapsed,
      tasks: allTasks,
      projects: {},
      tasksMeta: tasksMeta,
      from: range.from,
      to: range.to,
      days: range.days,
      _metrics: metrics
    };
  });
}
