/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v6.6.0)

   Ключевые изменения v6.6.0:
   - Убран EXCLUDE_GROUPS из загрузки данных (Предеин списывает
     время в группе 26 «Текущие задачи 1с», которая была исключена)
   - Последовательная загрузка с задержками (anti-502)
   - Retry с backoff для неуспешных API-вызовов
   - Fallback: прямой поиск elapsed по USER_ID для Предеина
   - EXCLUDE_GROUPS влияет ТОЛЬКО на UI (какие проекты показывать),
     но НЕ на загрузку данных

   Алгоритм загрузки:
   1. Загрузка задач по RESPONSIBLE (по каждому разработчику)
   2. Загрузка задач по GROUP_ID ВСЕХ проектов (включая исключённые!)
   3. Batch-загрузка elapsed для ВСЕХ найденных задач
   4. Fallback: прямой поиск elapsed по USER_ID=116 (Предеин)
   5. Фильтрация elapsed по периоду + нашим разработчикам
   6. Загрузка проектов (sonet_group.get)
   ═══════════════════════════════════════════════════════════════ */

/* ─── Утилита: задержка ─── */
function _dlDelay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

/* ─── Утилита: bxPost с retry ─── */
function _dlBxPost(method, body, retries) {
  retries = retries || 1;
  return bxPost(method, body).then(function(r) {
    if (r && r.error && retries > 0) {
      console.warn('[DL] Retry ' + method + ' (' + retries + ' left): ' + r.error);
      return _dlDelay(2000).then(function() {
        return _dlBxPost(method, body, retries - 1);
      });
    }
    return r;
  }).catch(function(e) {
    if (retries > 0) {
      console.warn('[DL] Retry ' + method + ' (' + retries + ' left): ' + e);
      return _dlDelay(2000).then(function() {
        return _dlBxPost(method, body, retries - 1);
      });
    }
    return { error: String(e) };
  });
}

/* ─── Загрузка данных за период ─── */
function prLoadPeriodData(year, month) {
  return PR_loadRealData(year, month);
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка задач по GROUP_ID (ВСЕХ проектов, включая исключённые!)
   v6.6.0: EXCLUDE_GROUPS убран из загрузки данных.
   Предеин списывает время в группе 26 «Текущие задачи 1с».
   ═══════════════════════════════════════════════════════════════ */
function _prLoadTasksByGroups(lookbackStr) {
  var groupIds = Object.keys(PROJECTS); /* ВСЕ группы, без EXCLUDE_GROUPS! */

  var allTasks = [];
  var seenIds = {};

  /* Загружаем по 3 группы параллельно (было 5 — снижаем для anti-502) */
  var proms = [];
  for (var i = 0; i < groupIds.length; i += 3) {
    var chunk = groupIds.slice(i, i + 3);
    (function(groupChunk, chunkIdx) {
      proms.push(
        /* Небольшая задержка между батчами для снижения нагрузки */
        _dlDelay(chunkIdx * 300).then(function() {
          return Promise.all(groupChunk.map(function(gid) {
            return fetchTasksPaginated({
              filter: {
                GROUP_ID: gid,
                '>=CREATED_DATE': lookbackStr
              },
              select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE'],
              order: {ID: 'DESC'}
            }, 5).then(function(tasks) {
              return Array.isArray(tasks) ? tasks : [];
            }).catch(function() { return []; });
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
    console.log('[DL] Задачи по группам: ' + allTasks.length + ' из ' + groupIds.length + ' групп (все, вкл. исключённые)');
    return allTasks;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Прямой поиск elapsed по USER_ID (fallback для Предеина)
   Используем tasks.elapseditem.list с фильтром по USER_ID.
   Если этот API не работает на данном Bitrix24 — просто пропускаем.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedByUser(userId, fromStr, toStr) {
  console.log('[DL] Прямой поиск elapsed для USER_ID=' + userId + '...');
  return _dlBxPost('tasks.elapseditem.list', {
    filter: {
      USER_ID: userId,
      '>=CREATED_DATE': fromStr,
      '<=CREATED_DATE': toStr + ' 23:59:59'
    },
    order: { ID: 'ASC' },
    start: 0
  }, 1).then(function(r) {
    var items = [];
    if (r && r.result && Array.isArray(r.result)) {
      items = r.result;
    } else if (r && r.result && r.result.items && Array.isArray(r.result.items)) {
      items = r.result.items;
    } else {
      console.log('[DL] tasks.elapseditem.list для USER_ID=' + userId + ': нет данных или метод недоступен');
      return [];
    }
    console.log('[DL] tasks.elapseditem.list для USER_ID=' + userId + ': ' + items.length + ' записей');
    return items;
  }).catch(function(e) {
    console.warn('[DL] tasks.elapseditem.list для USER_ID=' + userId + ': ошибка', e);
    return [];
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка метаданных потерянных задач
   Если elapsed ссылается на задачи, не найденные через поиск,
   загружаем их данные через batch tasks.task.list
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
      _dlBxPost('batch', { halt: 0, cmd: batchCmd }, 1).then(function(r) {
        if (r && r.result && r.result.result) {
          Object.keys(r.result.result).forEach(function(key) {
            var taskResult = r.result.result[key];
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
      }).catch(function(e) {
        console.warn('[DL] Ошибка загрузки потерянных задач', e);
      })
    );
  }

  return Promise.all(batchProms);
}

/* ═══════════════════════════════════════════════════════════════
   Главная функция загрузки реальных данных
   ═══════════════════════════════════════════════════════════════ */
function PR_loadRealData(year, month) {
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);
  var devIds = ACTIVE_DEV_IDS;

  /* Look back 6 месяцев — компромисс между охватом и скоростью */
  var lookbackDate = new Date(year, month - 1 - 6, 1);
  var lookbackStr = fmt(lookbackDate);

  console.log('[DL] PR_loadRealData v6.6.0: ' + fromStr + ' — ' + toStr +
    ', devs=' + devIds.length);

  /* ═══ Phase 1: Поиск задач по RESPONSIBLE (убраны ACCOMPLICE/AUDITOR — 
     они дублируют то, что уже находится через группы, но добавляют API-вызовы) ═══ */
  var taskProms = [];
  devIds.forEach(function(devId, idx) {
    taskProms.push(
      /* Небольшая задержка между запросами для снижения нагрузки */
      _dlDelay(idx * 200).then(function() {
        return fetchTasksPaginated({
          filter: { RESPONSIBLE_ID: devId, '>=CREATED_DATE': lookbackStr },
          select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
          order: {ID: 'DESC'}
        }, 5);
      }).then(function(tasks) { return Array.isArray(tasks) ? tasks : []; })
        .catch(function() { return []; })
    );
  });

  /* ═══ Phase 2: Загрузка задач по ВСЕМ группам проектов ═══
     Включая исключённые группы! Предеин списывает время в группе 26. */
  var groupTaskProm = _prLoadTasksByGroups(lookbackStr);

  /* ═══ Запуск обеих фаз параллельно ═══ */
  return Promise.all([
    Promise.all(taskProms),
    groupTaskProm
  ]).then(function(phases) {
    var taskArrays = phases[0];
    var groupTasks = phases[1];

    /* ─── Собрать задачи, дедупликация по ID ─── */
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

    /* ─── Построить tasksMeta ─── */
    var tasksMeta = {};
    var taskIdList = [];
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
      /* v6.6.0: Загружаем elapsed для ВСЕХ задач, 
         EXCLUDE_GROUPS больше не влияет на загрузку данных! */
      taskIdList.push(id);
    });

    if (!taskIdList.length) {
      console.warn('[DL] Нет задач для загрузки elapsed');
      return {
        elapsed: [], tasks: allTasks, projects: {}, tasksMeta: tasksMeta,
        from: range.from, to: range.to, days: range.days
      };
    }

    /* ═══ Phase 3: Batch-загрузка elapsed для ВСЕХ задач ═══
       v6.6.0: батчи по 25 задач (было 50), с задержками и retry */
    console.log('[DL] Batch-загрузка elapsed для ' + taskIdList.length + ' задач...');

    var allElapsed = [];
    var seenElapsedIds = {};
    var batchProms = [];
    var BATCH_SIZE = 25; /* уменьшено с 50 для снижения риска 502 */

    for (var i = 0; i < taskIdList.length; i += BATCH_SIZE) {
      var chunk = taskIdList.slice(i, i + BATCH_SIZE);
      var batchCmd = {};
      chunk.forEach(function(tid, idx) {
        batchCmd['e' + idx] = 'task.elapseditem.getlist?TASK_ID=' + tid;
      });
      (function(batchIdx) {
        batchProms.push(
          /* Задержка между батчами: 300мс × номер батча */
          _dlDelay(batchIdx * 300).then(function() {
            return _dlBxPost('batch', { halt: 0, cmd: batchCmd }, 1);
          }).then(function(r) {
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
          }).catch(function() {})
        );
      })(Math.floor(i / BATCH_SIZE));
    }

    return Promise.all(batchProms).then(function() {
      console.log('[DL] Elapsed загружено: ' + allElapsed.length + ' записей (до фильтрации)');

      /* ─── Диагностика: сколько elapsed у Предеина (user=116) ─── */
      var predeinBefore = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
      console.log('[DL] Предеин (116): ' + predeinBefore.length + ' записей до фильтрации по периоду');
      predeinBefore.forEach(function(e) {
        console.log('[DL]   Предеин elapsed: TASK=' + e.TASK_ID + ' DATE=' + (e.CREATED_DATE || '').substring(0,10) +
          ' MIN=' + e.MINUTES + ' SEC=' + e.SECONDS);
      });

      /* ═══ Phase 4: Fallback — прямой поиск elapsed для Предеина ═══
         Если Предеин не найден через batch, пробуем tasks.elapseditem.list */
      var predeinFallbackNeeded = predeinBefore.length === 0;

      var fallbackProm = predeinFallbackNeeded
        ? _prLoadElapsedByUser('116', fromStr, toStr)
        : Promise.resolve([]);

      return fallbackProm.then(function(fallbackElapsed) {
        if (fallbackElapsed.length > 0) {
          console.log('[DL] Fallback: добавлено ' + fallbackElapsed.length + ' записей Предеина через tasks.elapseditem.list');
          fallbackElapsed.forEach(function(e) {
            var eid = String(e.ID || '');
            if (eid && !seenElapsedIds[eid]) {
              seenElapsedIds[eid] = true;
              allElapsed.push(e);
            }
          });
          /* Обновить диагноз */
          predeinBefore = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
          console.log('[DL] Предеин (116): ' + predeinBefore.length + ' записей ПОСЛЕ fallback');
        }

        /* ─── Фильтрация: период + наши разработчики ─── */
        var devIdSet = {};
        DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

        allElapsed = allElapsed.filter(function(e) {
          var d = (e.CREATED_DATE || '').substring(0, 10);
          if (d < fromStr || d > toStr) return false;
          return devIdSet[String(e.USER_ID)];
        });

        /* Диагностика: Предеин после фильтрации */
        var predeinAfter = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
        console.log('[DL] Предеин (116): ' + predeinAfter.length + ' записей после фильтрации (' + fromStr + ' — ' + toStr + ')');

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

        console.log('[DL] После фильтрации: ' + allElapsed.length + ' elapsed записей');

        /* Статистика по разработчикам */
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

        /* ─── Загрузка потерянных задач + проекты ─── */
        return _prLoadOrphanTasks(orphanTaskIds, tasksMeta, allTasks).then(function() {
          return _prLoadProjectsAndFinish(allElapsed, allTasks, tasksMeta, range);
        });
      });
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка проектов + финальная сборка результата
   ═══════════════════════════════════════════════════════════════ */
function _prLoadProjectsAndFinish(allElapsed, allTasks, tasksMeta, range) {
  return _dlBxPost('sonet_group.get', { select: ['ID','NAME'] }, 1).then(function(r) {
    var projects = {};
    if (r && r.result) {
      var groups = r.result;
      if (!Array.isArray(groups)) groups = Object.values(groups);
      groups.forEach(function(g) {
        var id = String(g.ID || g.id);
        var nm = g.NAME || g.name || ('Группа ' + id);
        /* v6.6.0: НЕ фильтруем по EXCLUDE_GROUPS — загружаем ВСЕ проекты */
        if (id && id !== '0') {
          projects[id] = { id: id, name: nm };
        }
      });
    }

    /* Обновить groupName из загруженных проектов */
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
