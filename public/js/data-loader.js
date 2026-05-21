/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v6.5.1)
   Моковые данные УДАЛЕНЫ — всегда живые данные.

   Алгоритм загрузки (надёжный, проверенный):
   1. Загрузка задач по RESPONSIBLE / ACCOMPLICE / AUDITOR (по каждому разработчику)
   2. Загрузка задач по GROUP_ID всех известных проектов (гарантированно находит все задачи)
   3. Batch-загрузка elapsed для ВСЕХ найденных задач
   4. Фильтрация elapsed по периоду + нашим разработчикам
   5. Загрузка потерянных задач (batch tasks.task.list)
   6. Загрузка проектов (sonet_group.get)
   ═══════════════════════════════════════════════════════════════ */

/* ─── Загрузка данных за период ─── */
function prLoadPeriodData(year, month) {
  return PR_loadRealData(year, month);
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка задач по GROUP_ID (главный способ найти ВСЕ задачи)
   Для каждого известного проекта загружает недавние задачи.
   Это находит задачи, где разработчик не RESPONSIBLE/ACCOMPLICE/AUDITOR,
   но списывает на них время (случай Предеина).
   ═══════════════════════════════════════════════════════════════ */
function _prLoadTasksByGroups(lookbackStr) {
  var groupIds = Object.keys(PROJECTS).filter(function(gid) {
    return !EXCLUDE_GROUPS[gid];
  });

  var allTasks = [];
  var seenIds = {};

  /* Загружаем по 5 групп параллельно */
  var proms = [];
  for (var i = 0; i < groupIds.length; i += 5) {
    var chunk = groupIds.slice(i, i + 5);
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
          }, 5).then(function(tasks) {
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
    console.log('[DL] Задачи по группам: ' + allTasks.length + ' из ' + groupIds.length + ' групп');
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

  console.log('[DL] PR_loadRealData v6.5.1: ' + fromStr + ' — ' + toStr +
    ', devs=' + devIds.length);

  /* ═══ Phase 1: Поиск задач по разработчикам ═══
     RESPONSIBLE + ACCOMPLICE + AUDITOR — для метаданных задач. */
  var taskProms = [];
  devIds.forEach(function(devId) {
    taskProms.push(
      fetchTasksPaginated({
        filter: { RESPONSIBLE_ID: devId, '>=CREATED_DATE': lookbackStr },
        select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
        order: {ID: 'DESC'}
      }, 5).then(function(tasks) { return Array.isArray(tasks) ? tasks : []; })
        .catch(function() { return []; })
    );
    taskProms.push(
      fetchTasksPaginated({
        filter: { ACCOMPLICE: devId, '>=CREATED_DATE': lookbackStr },
        select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
        order: {ID: 'DESC'}
      }, 5).then(function(tasks) { return Array.isArray(tasks) ? tasks : []; })
        .catch(function() { return []; })
    );
    taskProms.push(
      fetchTasksPaginated({
        filter: { AUDITOR: devId, '>=CREATED_DATE': lookbackStr },
        select: ['ID','TITLE','GROUP_ID','STAGE_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','CLOSED_DATE'],
        order: {ID: 'DESC'}
      }, 5).then(function(tasks) { return Array.isArray(tasks) ? tasks : []; })
        .catch(function() { return []; })
    );
  });

  /* ═══ Phase 2: Загрузка задач по группам проектов ═══
     Находит задачи в известных проектах, где разработчик не имеет роли.
     Это самый надёжный способ найти задачи Предеина. */
  var groupTaskProm = _prLoadTasksByGroups(lookbackStr);

  /* ═══ Запуск обеих фаз параллельно ═══ */
  return Promise.all([
    Promise.all(taskProms),
    groupTaskProm
  ]).then(function(phases) {
    var taskArrays = phases[0];      /* [task[], task[], ...] */
    var groupTasks = phases[1];      /* task[] */

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
      if (!EXCLUDE_GROUPS[gid]) {
        taskIdList.push(id);
      }
    });

    if (!taskIdList.length) {
      console.warn('[DL] Нет задач для загрузки elapsed');
      return {
        elapsed: [], tasks: allTasks, projects: {}, tasksMeta: tasksMeta,
        from: range.from, to: range.to, days: range.days
      };
    }

    /* ═══ Phase 3: Batch-загрузка elapsed для ВСЕХ задач ═══ */
    console.log('[DL] Batch-загрузка elapsed для ' + taskIdList.length + ' задач...');

    var allElapsed = [];
    var seenElapsedIds = {};
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
      console.log('[DL] Elapsed загружено: ' + allElapsed.length + ' записей (до фильтрации)');

      /* ─── Фильтрация: период + наши разработчики ─── */
      var devIdSet = {};
      DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

      allElapsed = allElapsed.filter(function(e) {
        var d = (e.CREATED_DATE || '').substring(0, 10);
        if (d < fromStr || d > toStr) return false;
        return devIdSet[String(e.USER_ID)];
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
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка проектов + финальная сборка результата
   ═══════════════════════════════════════════════════════════════ */
function _prLoadProjectsAndFinish(allElapsed, allTasks, tasksMeta, range) {
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
