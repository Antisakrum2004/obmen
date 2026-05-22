/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v6.9.0)

   Ключевые изменения v6.9.0:
   - НОВЫЙ ПОДХОД: Пробуем task.elapseditem.list с фильтром по
     USER_ID + CREATED_DATE для КАЖДОГО разработчика.
     Это 8 запросов вместо 48 батчей и обходит ограничения
     видимости вебхука юзера 116.
   - УБРАН >=CREATED_DATE из поиска по группам (был 6 мес —
     не находил старые задачи группы 26, на которые Предеин
     списывает время)
   - Загрузка ВСЕХ задач из группы 26 без фильтра по дате
   - Расширен lookback с 6 до 24 месяцев
   - FILTER по дате в batch elapsed вызовах (только целевой месяц)
   ═══════════════════════════════════════════════════════════════ */

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
   ИЗВЛЕЧЕНИЕ elapsed ИЗ batch-результата
   ═══════════════════════════════════════════════════════════════ */
function _dlExtractElapsedItems(cmdResult, key) {
  if (!cmdResult) return [];
  if (Array.isArray(cmdResult)) return cmdResult;
  if (typeof cmdResult === 'object' && cmdResult.error) return [];
  if (typeof cmdResult === 'object' && cmdResult.result) {
    if (Array.isArray(cmdResult.result)) return cmdResult.result;
    if (typeof cmdResult.result === 'object' && cmdResult.result.items) {
      if (Array.isArray(cmdResult.result.items)) return cmdResult.result.items;
    }
  }
  if (typeof cmdResult === 'object' && cmdResult.items) {
    if (Array.isArray(cmdResult.items)) return cmdResult.items;
  }
  return [];
}

/* ─── Загрузка данных за период ─── */
function prLoadPeriodData(year, month) {
  return PR_loadRealData(year, month);
}

/* ═══════════════════════════════════════════════════════════════
   НОВЫЙ ПОДХОД: Прямая загрузка elapsed по USER_ID

   Пробуем 3 варианта API:
   1. task.elapseditem.list с FILTER[USER_ID] + FILTER[>=CREATED_DATE]
   2. tasks.elapseditem.list (plural) — может работать на некоторых инстансах
   3. Если оба не работают — fallback на task-based подход
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedByUserDirect(devIds, fromStr, toStr) {
  var allElapsed = [];
  var seenElapsedIds = {};
  var proms = [];

  devIds.forEach(function(devId, idx) {
    var uid = String(devId);
    proms.push(
      _dlDelay(idx * 400).then(function() {
        console.log('[DL] Прямой поиск elapsed для USER_ID=' + uid + ' (' + (DEVELOPERS[uid]||'?') + ')...');

        /* Вариант 1: task.elapseditem.list с фильтром */
        return bxPost('task.elapseditem.list', {
          FILTER: {
            USER_ID: uid,
            '>=CREATED_DATE': fromStr,
            '<=CREATED_DATE': toStr + ' 23:59:59'
          },
          ORDER: { ID: 'ASC' }
        }).then(function(r) {
          if (r && r.error) {
            console.log('[DL] task.elapseditem.list для ' + uid + ': ' + r.error + ' — пробуем вариант2');
            /* Вариант 2: tasks.elapseditem.list (plural) */
            return bxPost('tasks.elapseditem.list', {
              filter: {
                USER_ID: uid,
                '>=CREATED_DATE': fromStr,
                '<=CREATED_DATE': toStr + ' 23:59:59'
              },
              order: { ID: 'ASC' },
              start: 0
            }).then(function(r2) {
              if (r2 && r2.error) {
                console.log('[DL] tasks.elapseditem.list для ' + uid + ': ' + r2.error + ' — НЕ ДОСТУПЕН');
                return [];
              }
              return _dlParseElapsedResponse(r2, uid);
            });
          }
          return _dlParseElapsedResponse(r, uid);
        }).catch(function(e) {
          console.warn('[DL] Ошибка поиска elapsed для ' + uid, e);
          return [];
        });
      }).then(function(items) {
        if (items.length > 0) {
          console.log('[DL] USER_ID=' + uid + ' (' + (DEVELOPERS[uid]||'?') + '): ' + items.length + ' elapsed записей');
          items.forEach(function(e) {
            var eid = String(e.ID || '');
            if (eid && !seenElapsedIds[eid]) {
              seenElapsedIds[eid] = true;
              allElapsed.push(e);
            }
          });
        }
        return items.length;
      })
    );
  });

  return Promise.all(proms).then(function(counts) {
    var total = counts.reduce(function(s, c) { return s + c; }, 0);
    console.log('[DL] Прямой поиск elapsed: ' + allElapsed.length + ' записей для ' + devIds.length + ' разработчиков');
    return { elapsed: allElapsed, seenElapsedIds: seenElapsedIds, method: 'direct', totalDirect: total };
  });
}

/* Парсинг ответа elapsed API (разные форматы) */
function _dlParseElapsedResponse(r, uid) {
  if (!r || !r.result) return [];

  var items = r.result;

  /* Прямой массив */
  if (Array.isArray(items)) return items;

  /* Объект с полем items */
  if (typeof items === 'object' && items.items && Array.isArray(items.items)) return items.items;

  /* Объект с полем result */
  if (typeof items === 'object' && items.result && Array.isArray(items.result)) return items.result;

  console.log('[DL] Неизвестный формат ответа для USER_ID=' + uid + ': type=' + typeof items + ' keys=' + (typeof items === 'object' ? Object.keys(items).join(',') : ''));
  return [];
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка задач по GROUP_ID (ВСЕХ проектов)
   v6.9.0: УБРАН >=CREATED_DATE — загружаем ВСЕ задачи
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
            /* v6.9.0: БЕЗ фильтра >=CREATED_DATE — загружаем ВСЕ задачи */
            var filter = { GROUP_ID: gid };
            /* Только для больших групп добавляем фильтр по активности */
            return fetchTasksPaginated({
              filter: filter,
              select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE'],
              order: {ID: 'DESC'}
            }, 20).then(function(tasks) { /* 20 страниц вместо 5 */
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
   Batch-загрузка elapsed для задач (FALLBACK)
   v6.9.0: Добавлен FILTER по дате в batch URL
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedBatch(taskIdList, fromStr, toStr, seenElapsedIds) {
  var allElapsed = [];
  var batchProms = [];
  var BATCH_SIZE = 25;
  var _batchStats = { total: 0, success: 0, empty: 0, error: 0 };

  for (var i = 0; i < taskIdList.length; i += BATCH_SIZE) {
    var chunk = taskIdList.slice(i, i + BATCH_SIZE);
    var batchCmd = {};
    chunk.forEach(function(tid, idx) {
      /* v6.9.0: Добавляем FILTER по дате — только записи за целевой месяц */
      batchCmd['e' + idx] = 'task.elapseditem.getlist?TASK_ID=' + tid +
        '&FILTER[>=CREATED_DATE]=' + fromStr +
        '&FILTER[<=CREATED_DATE]=' + toStr + '+23%3A59%3A59';
    });
    (function(batchIdx) {
      batchProms.push(
        _dlDelay(batchIdx * 300).then(function() {
          _batchStats.total++;
          return _dlBxPost('batch', { halt: 0, cmd: batchCmd }, 0);
        }).then(function(r) {
          if (r && r.error) { _batchStats.error++; return; }
          if (!r || !r.result || !r.result.result) { _batchStats.error++; return; }
          var results = r.result.result;
          if (typeof results !== 'object' || Array.isArray(results)) { _batchStats.error++; return; }

          var batchHasItems = false;
          Object.keys(results).forEach(function(key) {
            var items = _dlExtractElapsedItems(results[key], key);
            if (items.length > 0) batchHasItems = true;
            items.forEach(function(e) {
              var eid = String(e.ID || '');
              if (eid && !seenElapsedIds[eid]) {
                seenElapsedIds[eid] = true;
                allElapsed.push(e);
              }
            });
          });

          if (batchHasItems) _batchStats.success++;
          else _batchStats.empty++;
        }).catch(function() { _batchStats.error++; })
      );
    })(Math.floor(i / BATCH_SIZE));
  }

  return Promise.all(batchProms).then(function() {
    console.log('[DL] Batch fallback: total=' + _batchStats.total +
      ' success=' + _batchStats.success + ' empty=' + _batchStats.empty +
      ' error=' + _batchStats.error + ' | elapsed=' + allElapsed.length);
    return allElapsed;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Главная функция загрузки реальных данных
   ═══════════════════════════════════════════════════════════════ */
function PR_loadRealData(year, month) {
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);
  var devIds = ACTIVE_DEV_IDS;

  console.log('[DL] PR_loadRealData v6.9.0: ' + fromStr + ' — ' + toStr +
    ', devs=' + devIds.length);

  /* ═══ Phase 0: ПРЯМОЙ ПОИСК elapsed по USER_ID ═══
     Новый подход: сначала пробуем получить elapsed напрямую
     для каждого разработчика, без загрузки задач.
     Если API метод существует — это самый быстрый путь. */
  var directProm = _prLoadElapsedByUserDirect(devIds, fromStr, toStr);

  /* ═══ Параллельно: загрузка задач ═══ */
  /* v6.9.0: БЕЗ фильтра >=CREATED_DATE — находим ВСЕ задачи */
  var lookbackStr = fmt(new Date(year, month - 1 - 24, 1)); /* 24 мес lookback для RESPONSIBLE */

  var taskProms = [];
  devIds.forEach(function(devId, idx) {
    taskProms.push(
      _dlDelay(idx * 200).then(function() {
        return fetchTasksPaginated({
          filter: { RESPONSIBLE_ID: devId, '>=CREATED_DATE': lookbackStr },
          select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
          order: {ID: 'DESC'}
        }, 20); /* 20 страниц */
      }).then(function(tasks) { return Array.isArray(tasks) ? tasks : []; })
        .catch(function() { return []; })
    );
  });

  var groupTaskProm = _prLoadTasksByGroups();

  return Promise.all([
    directProm,
    Promise.all(taskProms),
    groupTaskProm
  ]).then(function(phases) {
    var directResult = phases[0];
    var taskArrays = phases[1];
    var groupTasks = phases[2];

    var allElapsed = directResult.elapsed;
    var seenElapsedIds = directResult.seenElapsedIds;

    console.log('[DL] Прямой поиск дал ' + allElapsed.length + ' elapsed (method=' + directResult.method + ')');

    /* Диагностика прямых elapsed */
    if (allElapsed.length > 0) {
      var userIdStats = {};
      allElapsed.forEach(function(e) {
        var uid = String(e.USER_ID || '?');
        userIdStats[uid] = (userIdStats[uid] || 0) + 1;
      });
      console.log('[DL] USER_ID distribution (direct): ' + JSON.stringify(userIdStats));

      var predeinDirect = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
      console.log('[DL] Предеин (direct): ' + predeinDirect.length + ' записей');
    }

    /* ─── Собрать задачи ─── */
    var allTasks = [];
    var seenTaskIds = {};

    taskArrays.forEach(function(tasks) {
      if (!Array.isArray(tasks)) return;
      tasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        if (!seenTaskIds[id]) { seenTaskIds[id] = true; allTasks.push(t); }
      });
    });

    groupTasks.forEach(function(t) {
      var id = String(t.id || t.ID);
      if (!seenTaskIds[id]) { seenTaskIds[id] = true; allTasks.push(t); }
    });

    console.log('[DL] Найдено задач: ' + allTasks.length + ' (дедуплицировано)');

    /* Диагностика: groupId */
    var groupIdStats = {};
    allTasks.forEach(function(t) {
      var gid = String(t.groupId || t.GROUP_ID || (t.group && t.group.id) || '0');
      groupIdStats[gid] = (groupIdStats[gid] || 0) + 1;
    });
    console.log('[DL] GroupId distribution: ' + JSON.stringify(groupIdStats));

    /* ─── Построить tasksMeta ─── */
    var tasksMeta = {};
    var taskIdList = [];
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
      taskIdList.push(id);
    });

    /* ═══ Phase 1.5: Если прямой поиск дал 0 — fallback на batch elapsed ═══ */
    var batchProm;
    if (directResult.totalDirect === 0 && taskIdList.length > 0) {
      console.log('[DL] Прямой поиск не работает — fallback на batch elapsed для ' + taskIdList.length + ' задач');
      batchProm = _prLoadElapsedBatch(taskIdList, fromStr, toStr, seenElapsedIds);
    } else {
      batchProm = Promise.resolve([]);
    }

    return batchProm.then(function(batchElapsed) {
      if (batchElapsed.length > 0) {
        console.log('[DL] Batch fallback добавил ' + batchElapsed.length + ' записей');
        batchElapsed.forEach(function(e) {
          var eid = String(e.ID || '');
          if (eid && !seenElapsedIds[eid]) {
            seenElapsedIds[eid] = true;
            allElapsed.push(e);
          }
        });
      }

      console.log('[DL] Всего elapsed: ' + allElapsed.length + ' записей');

      /* ─── Фильтрация: период + наши разработчики ─── */
      var devIdSet = {};
      DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

      allElapsed = allElapsed.filter(function(e) {
        var d = (e.CREATED_DATE || '').substring(0, 10);
        if (d < fromStr || d > toStr) return false;
        return devIdSet[String(e.USER_ID)];
      });

      console.log('[DL] После фильтрации: ' + allElapsed.length + ' elapsed записей (' + fromStr + ' — ' + toStr + ')');

      /* Диагностика */
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
