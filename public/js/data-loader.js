/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v6.11.0)

   Ключевые изменения v6.11.0:
   - УДАЛЁН batch (подтверждено: task.elapseditem.getlist в batch
     не передаёт TASK_ID через URL, возвращает пустые массивы)
   - ОСНОВНОЙ МЕТОД: параллельные POST-вызовы task.elapseditem.getlist
     с телом [taskId, {ID:'DESC'}, {}] — ЕДИНСТВЕННЫЙ рабочий формат
   - Проверяем ВСЕ задачи по RESPONSIBLE_ID каждого разработчика
   - ДОПОЛНИТЕЛЬНО: поиск ACCOMPLICE=116 для Предеина
   - Прогресс-логирование в консоль при загрузке
   - Мьютекс против двойной загрузки
   ═══════════════════════════════════════════════════════════════ */

/* ─── Мьютекс против параллельных загрузок ─── */
var _dlLoadGeneration = 0;

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

function _dlBxPost(method, body, retries) {
  retries = retries || 1;
  return bxPost(method, body).then(function(r) {
    if (r && r.error) {
      if (_dlIsNonRetryable(r.error)) return r;
      if (retries > 0) {
        return _dlDelay(2000).then(function() { return _dlBxPost(method, body, retries - 1); });
      }
    }
    return r;
  }).catch(function(e) {
    if (retries > 0) {
      return _dlDelay(2000).then(function() { return _dlBxPost(method, body, retries - 1); });
    }
    return { error: String(e) };
  });
}

/* ═══════════════════════════════════════════════════════════════
   ИЗВЛЕЧЕНИЕ elapsed ИЗ ответа task.elapseditem.getlist
   ═══════════════════════════════════════════════════════════════ */
function _dlParseElapsedItems(r) {
  if (!r || !r.result) return [];
  /* Прямой массив */
  if (Array.isArray(r.result)) return r.result;
  /* Объект с полем result */
  if (r.result.result && Array.isArray(r.result.result)) return r.result.result;
  /* Объект с полем items */
  if (r.result.items && Array.isArray(r.result.items)) return r.result.items;
  return [];
}

/* ─── Загрузка данных за период ─── */
function prLoadPeriodData(year, month) {
  return PR_loadRealData(year, month);
}

/* ═══════════════════════════════════════════════════════════════
   ПАРАЛЛЕЛЬНАЯ загрузка elapsed через POST-вызовы

   Единственный рабочий формат для task.elapseditem.getlist:
     bxPost('task.elapseditem.getlist', [taskId, {ID:'DESC'}, {}])

   Batch НЕ работает — URL-формат не передаёт TASK_ID.

   Параллельность: обрабатываем chunkSize задач одновременно,
   между чанками задержка delay мс.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedConcurrent(taskIds, chunkSize, delay) {
  chunkSize = chunkSize || 8;
  delay = delay || 150;
  var allElapsed = [];
  var seenIds = {};
  var totalChecked = 0;
  var totalWithItems = 0;

  /* Разбиваем на чанки */
  var chunks = [];
  for (var i = 0; i < taskIds.length; i += chunkSize) {
    chunks.push(taskIds.slice(i, i + chunkSize));
  }

  console.log('[DL] Параллельная загрузка elapsed: ' + taskIds.length +
    ' задач, чанки по ' + chunkSize + ', всего ' + chunks.length + ' чанков');

  var chain = Promise.resolve();
  chunks.forEach(function(chunk, chunkIdx) {
    chain = chain.then(function() {
      if (chunkIdx > 0) return _dlDelay(delay);
    }).then(function() {
      return Promise.all(chunk.map(function(tid) {
        return bxPost('task.elapseditem.getlist', [tid, {ID: 'DESC'}, {}]).then(function(r) {
          totalChecked++;
          var items = _dlParseElapsedItems(r);
          if (items.length > 0) totalWithItems++;
          return items;
        }).catch(function() {
          totalChecked++;
          return [];
        });
      }));
    }).then(function(results) {
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
          ' чанков, ' + allElapsed.length + ' elapsed, задач с данными=' + totalWithItems);
      }
    });
  });

  return chain.then(function() {
    console.log('[DL] Параллельная загрузка завершена: ' +
      totalChecked + ' задач проверено, ' + totalWithItems + ' с elapsed, ' +
      allElapsed.length + ' записей');
    return allElapsed;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка задач по GROUP_ID (ВСЕХ проектов)
   ═══════════════════════════════════════════════════════════════ */
function _prLoadTasksByGroups() {
  var groupIds = Object.keys(PROJECTS);
  var allTasks = [];
  var seenIds = {};
  var groupCount = {};

  var proms = [];
  for (var i = 0; i < groupIds.length; i += 3) {
    var chunk = groupIds.slice(i, i + 3);
    (function(groupChunk, chunkIdx) {
      proms.push(
        _dlDelay(chunkIdx * 300).then(function() {
          return Promise.all(groupChunk.map(function(gid) {
            return fetchTasksPaginated({
              filter: { GROUP_ID: gid },
              select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE'],
              order: {ID: 'DESC'}
            }, 20).then(function(tasks) {
              var arr = Array.isArray(tasks) ? tasks : [];
              groupCount[gid] = arr.length;
              return arr;
            }).catch(function() { groupCount[gid] = 0; return []; });
          }));
        }).then(function(results) {
          results.forEach(function(tasks) {
            tasks.forEach(function(t) {
              var id = String(t.id || t.ID);
              if (!seenIds[id]) { seenIds[id] = true; allTasks.push(t); }
            });
          });
        })
      );
    })(chunk, Math.floor(i / 3));
  }

  return Promise.all(proms).then(function() {
    console.log('[DL] Задачи по группам: ' + allTasks.length + ' из ' + groupIds.length + ' групп');
    Object.keys(groupCount).sort(function(a,b){return (groupCount[b]||0)-(groupCount[a]||0);}).forEach(function(gid) {
      if (groupCount[gid] > 0) {
        console.log('[DL]   Группа ' + gid + ' (' + (PROJECTS[gid]||'?') + '): ' + groupCount[gid] + ' задач');
      }
    });
    return allTasks;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка задач где Предеин ACCOMPLICE или AUDITOR
   ═══════════════════════════════════════════════════════════════ */
function _prLoadPredeinExtraTasks() {
  console.log('[DL] Поиск задач Предеина (ACCOMPLICE + AUDITOR)...');
  var accompProm = fetchTasksPaginated({
    filter: { ACCOMPLICE: '116' },
    select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE'],
    order: {ID: 'DESC'}
  }, 10).then(function(tasks) {
    var arr = Array.isArray(tasks) ? tasks : [];
    console.log('[DL] ACCOMPLICE=116: ' + arr.length + ' задач');
    return arr;
  }).catch(function() { return []; });

  var auditProm = fetchTasksPaginated({
    filter: { AUDITOR: '116' },
    select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE'],
    order: {ID: 'DESC'}
  }, 10).then(function(tasks) {
    var arr = Array.isArray(tasks) ? tasks : [];
    console.log('[DL] AUDITOR=116: ' + arr.length + ' задач');
    return arr;
  }).catch(function() { return []; });

  return Promise.all([accompProm, auditProm]).then(function(results) {
    var all = [].concat(results[0], results[1]);
    console.log('[DL] Дополнительных задач Предеина: ' + all.length);
    return all;
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
      _dlBxPost('batch', { halt: 0, cmd: batchCmd }, 0).then(function(r) {
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

  console.log('[DL] ═══ PR_loadRealData v6.11.0 (gen=' + gen + ') ═══');
  console.log('[DL] Период: ' + fromStr + ' — ' + toStr + ', devs=' + devIds.length);

  /* ═══ Параллельная загрузка задач ═══ */
  var lookbackStr = fmt(new Date(year, month - 1 - 24, 1));

  var taskProms = [];
  devIds.forEach(function(devId, idx) {
    taskProms.push(
      _dlDelay(idx * 200).then(function() {
        return fetchTasksPaginated({
          filter: { RESPONSIBLE_ID: devId, '>=CREATED_DATE': lookbackStr },
          select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
          order: {ID: 'DESC'}
        }, 20);
      }).then(function(tasks) { return Array.isArray(tasks) ? tasks : []; })
        .catch(function() { return []; })
    );
  });

  var groupTaskProm = _prLoadTasksByGroups();
  var predeinExtraProm = _prLoadPredeinExtraTasks();

  return Promise.all([
    Promise.all(taskProms),
    groupTaskProm,
    predeinExtraProm
  ]).then(function(phases) {
    /* Проверка поколения — если началась новая загрузка, отменить */
    if (gen !== _dlLoadGeneration) {
      console.log('[DL] Отмена загрузки gen=' + gen + ' (текущая=' + _dlLoadGeneration + ')');
      return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days };
    }

    var taskArrays = phases[0];
    var groupTasks = phases[1];
    var predeinExtra = phases[2];

    /* ─── Собрать задачи ─── */
    var allTasks = [];
    var seenTaskIds = {};

    /* Задачи по RESPONSIBLE_ID (основной источник) */
    var devTaskIds = {}; /* devId -> [taskId, ...] */
    devIds.forEach(function(devId) { devTaskIds[String(devId)] = []; });

    taskArrays.forEach(function(tasks, idx) {
      if (!Array.isArray(tasks)) return;
      var devId = String(devIds[idx]);
      tasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        if (!seenTaskIds[id]) { seenTaskIds[id] = true; allTasks.push(t); }
        devTaskIds[devId].push(id);
      });
    });

    /* Задачи по группам (для метаданных проектов) */
    groupTasks.forEach(function(t) {
      var id = String(t.id || t.ID);
      if (!seenTaskIds[id]) { seenTaskIds[id] = true; allTasks.push(t); }
    });

    /* Дополнительные задачи Предеина (ACCOMPLICE/AUDITOR) */
    predeinExtra.forEach(function(t) {
      var id = String(t.id || t.ID);
      if (!seenTaskIds[id]) {
        seenTaskIds[id] = true;
        allTasks.push(t);
        devTaskIds['116'].push(id);
      }
    });

    console.log('[DL] Найдено задач: ' + allTasks.length + ' (дедуплицировано)');
    devIds.forEach(function(devId) {
      var uid = String(devId);
      console.log('[DL]   ' + (DEVELOPERS[uid]||uid) + ': ' + devTaskIds[uid].length + ' задач по RESPONSIBLE_ID');
    });

    /* ─── Построить tasksMeta ─── */
    var tasksMeta = {};
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
    });

    /* ═══ Сбор уникальных ID задач для проверки elapsed ═══
       Проверяем задачи каждого разработчика по RESPONSIBLE_ID,
       плюс дополнительные задачи Предеина (ACCOMPLICE/AUDITOR) */
    var elapsedTaskIds = [];
    var elapsedSeenIds = {};
    devIds.forEach(function(devId) {
      var uid = String(devId);
      devTaskIds[uid].forEach(function(tid) {
        if (!elapsedSeenIds[tid]) {
          elapsedSeenIds[tid] = true;
          elapsedTaskIds.push(tid);
        }
      });
    });

    console.log('[DL] Задач для проверки elapsed: ' + elapsedTaskIds.length);

    /* ═══ Параллельная загрузка elapsed ═══ */
    return _prLoadElapsedConcurrent(elapsedTaskIds, 8, 150).then(function(allElapsed) {

      /* Проверка поколения */
      if (gen !== _dlLoadGeneration) {
        console.log('[DL] Отмена после elapsed (gen=' + gen + ')');
        return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days };
      }

      console.log('[DL] Всего elapsed (до фильтрации): ' + allElapsed.length + ' записей');

      /* ─── Диагностика: распределение по USER_ID и датам ─── */
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
  return _dlBxPost('sonet_group.get', { select: ['ID','NAME'] }, 0).then(function(r) {
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
