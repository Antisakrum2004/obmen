/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v6.5.0)
   Моковые данные УДАЛЕНЫ — всегда живые данные.

   Алгоритм загрузки:
   1. Прямой запрос elapsed по USER_ID через tasks.elapseditem.list
      (загружает ВСЕ списания разработчика, независимо от роли в задаче)
   2. Поиск задач по RESPONSIBLE / ACCOMPLICE / AUDITOR
      (для метаданных: название, проект, статус)
   3. Поиск задач по GROUP_ID всех известных проектов
      (фоллбэк — находит задачи, где разработчик не имеет роли)
   4. Загрузка потерянных задач (batch tasks.task.list)
   5. Загрузка проектов (sonet_group.get)
   ═══════════════════════════════════════════════════════════════ */

/* ─── Загрузка данных за период ─── */
function prLoadPeriodData(year, month) {
  return PR_loadRealData(year, month);
}

/* ═══════════════════════════════════════════════════════════════
   Прямой запрос elapsed по USER_ID
   Использует tasks.elapseditem.list с фильтром USER_ID.
   Работает БЕЗ знания TASK_ID — находит ВСЕ списания разработчика.
   ═══════════════════════════════════════════════════════════════ */
function _prFetchElapsedByUser(userId, fromStr, toStr) {
  var all = [];
  var start = 0;
  var maxPages = 10;
  var pages = 0;

  function step() {
    pages++;
    if (pages > maxPages) {
      console.warn('[DL] _prFetchElapsedByUser: лимит страниц user=' + userId);
      return Promise.resolve(all);
    }
    /* ВАЖНО: filter — вложенный объект, не bracket-нотация!
       Bitrix24 REST API принимает JSON body с вложенными объектами. */
    return bxPost('tasks.elapseditem.list', {
      start: start,
      filter: {
        USER_ID: String(userId),
        '>=CREATED_DATE': fromStr + 'T00:00:00+03:00',
        '<=CREATED_DATE': toStr + 'T23:59:59+03:00'
      },
      select: ['ID','TASK_ID','USER_ID','SECONDS','MINUTES','COMMENT_TEXT',
               'CREATED_DATE','DATE_START','DATE_STOP','SOURCE']
    }).then(function(r) {
      if (!r || r.error) {
        console.warn('[DL] tasks.elapseditem.list ошибка user=' + userId + ': ' +
          (r ? (r.error_description || r.error) : 'no response'));
        return all;
      }
      var items = [];
      if (Array.isArray(r.result)) {
        items = r.result;
      } else if (r.result && Array.isArray(r.result.items)) {
        items = r.result.items;
      } else if (r.result && Array.isArray(r.result.list)) {
        items = r.result.list;
      } else if (r.result && typeof r.result === 'object') {
        /* Иногда результат — объект с ключами-числами */
        var vals = Object.values(r.result);
        if (vals.length && vals[0] && vals[0].ID) {
          items = vals;
        }
      }

      all = all.concat(items);
      if (r.next && items.length >= 50) {
        start = r.next;
        return step();
      }
      console.log('[DL] Прямой elapsed user=' + userId + ': ' + all.length + ' записей');
      return all;
    }).catch(function(e) {
      console.warn('[DL] tasks.elapseditem.list exception user=' + userId, e);
      return all;
    });
  }

  return step();
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка задач по GROUP_ID (фоллбэк)
   Для каждого известного проекта загружает недавние задачи.
   Это находит задачи, где разработчик не RESPONSIBLE/ACCOMPLICE/AUDITOR,
   но списывает на них время.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadTasksByGroups(lookbackStr) {
  var groupIds = Object.keys(PROJECTS).filter(function(gid) {
    return !EXCLUDE_GROUPS[gid];
  });

  var allTasks = [];
  var seenIds = {};

  /* Батчим по 10 групп за раз */
  var proms = [];
  for (var i = 0; i < groupIds.length; i += 10) {
    var chunk = groupIds.slice(i, i + 10);
    (function(groupChunk) {
      proms.push(
        Promise.all(groupChunk.map(function(gid) {
          return fetchTasksPaginated({
            filter: {
              GROUP_ID: gid,
              '>=CREATED_DATE': lookbackStr
            },
            select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE'],
            order: {ID: 'DESC'}
          }, 3).then(function(tasks) {
            return Array.isArray(tasks) ? tasks : [];
          }).catch(function() { return []; });
        })).then(function(results) {
          results.forEach(function(tasks) {
            tasks.forEach(function(t) {
              var id = String(t.id || t.ID);
              if (!seenIds[id]) { seenIds[id] = true; allTasks.push(t); }
            });
          });
        })
      );
    })(chunk);
  }

  return Promise.all(proms).then(function() {
    console.log('[DL] Загрузка по группам: ' + allTasks.length + ' задач из ' + groupIds.length + ' групп');
    return allTasks;
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

  console.log('[DL] Загрузка ' + unique.length + ' потерянных задач');

  var batchProms = [];
  for (var i = 0; i < unique.length; i += 50) {
    var chunk = unique.slice(i, i + 50);
    var batchCmd = {};
    chunk.forEach(function(tid, idx) {
      batchCmd['t' + idx] = 'tasks.task.list?filter[ID]=' + tid +
        '&select[]=ID&select[]=TITLE&select[]=GROUP_ID&select[]=STATUS&select[]=RESPONSIBLE_ID';
    });
    batchProms.push(
      bxPost('batch', { halt: 0, cmd: batchCmd }).then(function(r) {
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

  /* Look back 12 месяцев — задачи могут быть старые, а списания текущие */
  var lookbackDate = new Date(year, month - 1 - 12, 1);
  var lookbackStr = fmt(lookbackDate);

  console.log('[DL] PR_loadRealData v6.5.0: ' + fromStr + ' — ' + toStr +
    ', devs=' + devIds.length);

  /* ═══ Phase 1: Прямой запрос elapsed по USER_ID ═══
     tasks.elapseditem.list — находит ВСЕ списания разработчика за период.
     Работает даже если разработчик не RESPONSIBLE/ACCOMPLICE/AUDITOR. */
  var directProms = devIds.map(function(devId) {
    return _prFetchElapsedByUser(devId, fromStr, toStr).then(function(entries) {
      return { devId: devId, entries: entries || [] };
    }).catch(function() {
      return { devId: devId, entries: [] };
    });
  });

  /* ═══ Phase 2: Поиск задач по разработчикам ═══
     RESPONSIBLE + ACCOMPLICE + AUDITOR — для метаданных задач.
     Без этого у нас будут только ID задач без названий. */
  var taskProms = [];
  devIds.forEach(function(devId) {
    taskProms.push(
      fetchTasksPaginated({
        filter: { RESPONSIBLE_ID: devId, '>=CREATED_DATE': lookbackStr },
        select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
        order: {ID: 'DESC'}
      }, 10).then(function(tasks) { return Array.isArray(tasks) ? tasks : []; })
    );
    taskProms.push(
      fetchTasksPaginated({
        filter: { ACCOMPLICE: devId, '>=CREATED_DATE': lookbackStr },
        select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
        order: {ID: 'DESC'}
      }, 10).then(function(tasks) { return Array.isArray(tasks) ? tasks : []; })
    );
    taskProms.push(
      fetchTasksPaginated({
        filter: { AUDITOR: devId, '>=CREATED_DATE': lookbackStr },
        select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
        order: {ID: 'DESC'}
      }, 10).then(function(tasks) { return Array.isArray(tasks) ? tasks : []; })
    );
  });

  /* ═══ Phase 3: Загрузка задач по группам проектов (фоллбэк) ═══
     Находит задачи в известных проектах, где разработчик не имеет роли.
     Это самый надёжный способ найти Предеинские задачи. */
  var groupTaskProm = _prLoadTasksByGroups(lookbackStr);

  /* ═══ Запуск всех фаз параллельно ═══ */
  return Promise.all([
    Promise.all(directProms),
    Promise.all(taskProms),
    groupTaskProm
  ]).then(function(phases) {
    var directResults = phases[0];   /* [{devId, entries}] */
    var taskArrays = phases[1];      /* [task[], task[], ...] */
    var groupTasks = phases[2];      /* task[] */

    /* ─── Собрать прямые elapsed, дедупликация по ID ─── */
    var allElapsed = [];
    var seenElapsedIds = {};
    var hasDirectElapsed = false;

    directResults.forEach(function(dr) {
      if (!dr || !Array.isArray(dr.entries)) return;
      dr.entries.forEach(function(e) {
        var eid = String(e.ID || '');
        if (eid && !seenElapsedIds[eid]) {
          seenElapsedIds[eid] = true;
          allElapsed.push(e);
          hasDirectElapsed = true;
        }
      });
    });

    console.log('[DL] Phase 1 (прямой elapsed): ' + allElapsed.length + ' записей');

    /* ─── Собрать задачи из Phase 2 + Phase 3, дедупликация ─── */
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

    console.log('[DL] Phase 2+3 (задачи): ' + allTasks.length + ' задач (дедуплицировано)');

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

    /* ─── Если прямые elapsed есть → финализация ─── */
    if (hasDirectElapsed) {
      /* Найти потерянные задачи (elapsed на задачах без метаданных) */
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

      return _prLoadOrphanTasks(orphanTaskIds, tasksMeta, allTasks).then(function() {
        return _prLoadBatchElapsedAndFinish(allElapsed, seenElapsedIds, allTasks, tasksMeta, range, fromStr, toStr);
      });
    }

    /* ─── Прямой elapsed не сработал → batch-загрузка по задачам ─── */
    console.log('[DL] Прямой elapsed не дал результатов, batch-загрузка по задачам');

    var taskIdList = [];
    Object.keys(tasksMeta).forEach(function(id) {
      if (!EXCLUDE_GROUPS[tasksMeta[id].groupId]) {
        taskIdList.push(id);
      }
    });

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
        }).catch(function() {})
      );
    }

    return Promise.all(batchProms).then(function() {
      /* Фильтр по периоду и разработчикам */
      var devIdSet = {};
      DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

      allElapsed = allElapsed.filter(function(e) {
        var d = (e.CREATED_DATE || '').substring(0, 10);
        if (d < fromStr || d > toStr) return false;
        return devIdSet[String(e.USER_ID)];
      });

      /* Найти потерянные задачи из batch elapsed */
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

      return _prLoadOrphanTasks(orphanTaskIds, tasksMeta, allTasks).then(function() {
        return _prFinishData(allElapsed, tasksMeta, allTasks, range, fromStr, toStr);
      });
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Финальная обработка: загрузка batch elapsed + фильтрация + проекты
   ═══════════════════════════════════════════════════════════════ */
function _prLoadBatchElapsedAndFinish(allElapsed, seenElapsedIds, allTasks, tasksMeta, range, fromStr, toStr) {
  /* Загрузить elapsed для задач из поиска (чтобы получить списания
     ВСЕХ пользователей на этих задачах, не только целевого) */
  var taskIdList = [];
  Object.keys(tasksMeta).forEach(function(id) {
    if (!EXCLUDE_GROUPS[tasksMeta[id].groupId]) {
      taskIdList.push(id);
    }
  });

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
      }).catch(function() {})
    );
  }

  return Promise.all(batchProms).then(function() {
    return _prFinishData(allElapsed, tasksMeta, allTasks, range, fromStr, toStr);
  });
}

/* ═══════════════════════════════════════════════════════════════
   Общая финализация: фильтрация elapsed + загрузка проектов + лог
   ═══════════════════════════════════════════════════════════════ */
function _prFinishData(allElapsed, tasksMeta, allTasks, range, fromStr, toStr) {
  var devIdSet = {};
  DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

  /* Фильтр: период + наши разработчики */
  allElapsed = allElapsed.filter(function(e) {
    var d = (e.CREATED_DATE || '').substring(0, 10);
    if (d < fromStr || d > toStr) return false;
    return devIdSet[String(e.USER_ID)];
  });

  /* Создать плейсхолдеры для задач без метаданных */
  allElapsed.forEach(function(e) {
    var tid = String(e.TASK_ID || '');
    if (tid && !tasksMeta[tid]) {
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

  /* Загрузка проектов */
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
