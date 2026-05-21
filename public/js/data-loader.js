/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v6.7.0)

   Ключевые изменения v6.7.0:
   - УДАЛЁН _prLoadElapsedByUser (tasks.elapseditem.list НЕ СУЩЕСТВУЕТ
     в Битрикс24 — вызывает ERROR_METHOD_NOT_FOUND + бесконечный ретрай)
   - _dlBxPost: НЕ ретраит невосстановимые ошибки (METHOD_NOT_FOUND и т.п.)
   - Batch elapsed: улучшена диагностика, обработка ошибок в batch-ответах
   - Добавлен тестовый вызов task.elapseditem.getlist для одной задачи
     при нулевых результатах — чтобы понять, работает ли метод вообще
   - Для Предеина: последовательная загрузка elapsed по задачам из группы 26
     если batch не нашёл его записи

   Алгоритм загрузки:
   1. Загрузка задач по RESPONSIBLE (по каждому разработчику)
   2. Загрузка задач по GROUP_ID ВСЕХ проектов (включая исключённые!)
   3. Batch-загрузка elapsed для ВСЕХ найденных задач
   4. Диагностика: если Predein=0, загрузка elapsed по задачам группы 26
   5. Фильтрация elapsed по периоду + нашим разработчикам
   6. Загрузка проектов (sonet_group.get)
   ═══════════════════════════════════════════════════════════════ */

/* ─── Невосстановимые ошибки API (НЕ ретраить!) ─── */
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

/* ─── Утилита: задержка ─── */
function _dlDelay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

/* ─── Утилита: bxPost с retry (ТОЛЬКО для восстанимых ошибок!) ─── */
function _dlBxPost(method, body, retries) {
  retries = retries || 1;
  return bxPost(method, body).then(function(r) {
    if (r && r.error) {
      /* Невосстановимая ошибка — НЕ ретраим, сразу возвращаем */
      if (_dlIsNonRetryable(r.error)) {
        console.warn('[DL] НЕretryable ' + method + ': ' + r.error);
        return r;
      }
      /* Восстановимая ошибка (502, таймаут) — ретраим */
      if (retries > 0) {
        console.warn('[DL] Retry ' + method + ' (' + retries + ' left): ' + r.error);
        return _dlDelay(2000).then(function() {
          return _dlBxPost(method, body, retries - 1);
        });
      }
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
   ═══════════════════════════════════════════════════════════════ */
function _prLoadTasksByGroups(lookbackStr) {
  var groupIds = Object.keys(PROJECTS); /* ВСЕ группы, без EXCLUDE_GROUPS! */

  var allTasks = [];
  var seenIds = {};

  /* Загружаем по 3 группы параллельно (anti-502) */
  var proms = [];
  for (var i = 0; i < groupIds.length; i += 3) {
    var chunk = groupIds.slice(i, i + 3);
    (function(groupChunk, chunkIdx) {
      proms.push(
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
    console.log('[DL] Задачи по группам: ' + allTasks.length + ' из ' + groupIds.length + ' групп');
    return allTasks;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка метаданных потерянных задач
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
   Диагностика: тестовый вызов elapsed для одной задачи
   Вызывается если batch вернул 0 записей — чтобы понять,
   работает ли метод вообще и какой формат ответа.
   ═══════════════════════════════════════════════════════════════ */
function _dlDiagElapsed(testTaskId) {
  if (!testTaskId) return Promise.resolve();
  console.log('[DL] DIAG: тестовый task.elapseditem.getlist для задачи #' + testTaskId);
  return bxPost('task.elapseditem.getlist', { TASK_ID: testTaskId }).then(function(r) {
    if (r && r.error) {
      console.warn('[DL] DIAG: task.elapseditem.getlist ERROR: ' + r.error + ' — ' + (r.error_description || ''));
      /* Пробуем task.elapseditem.list */
      return bxPost('task.elapseditem.list', { TASK_ID: testTaskId }).then(function(r2) {
        if (r2 && r2.error) {
          console.warn('[DL] DIAG: task.elapseditem.list ERROR: ' + r2.error + ' — ' + (r2.error_description || ''));
        } else {
          var items2 = r2 && r2.result;
          console.log('[DL] DIAG: task.elapseditem.list OK! items=' + (Array.isArray(items2) ? items2.length : typeof items2));
          if (items2 && !Array.isArray(items2)) {
            console.log('[DL] DIAG: result type=' + typeof items2 + ' keys=' + (typeof items2 === 'object' ? Object.keys(items2).join(',') : ''));
          }
          if (Array.isArray(items2) && items2.length > 0) {
            console.log('[DL] DIAG: sample item keys=' + Object.keys(items2[0]).join(','));
          }
        }
        return r2;
      });
    }
    var items = r && r.result;
    console.log('[DL] DIAG: task.elapseditem.getlist OK! items=' + (Array.isArray(items) ? items.length : typeof items));
    if (items && !Array.isArray(items)) {
      console.log('[DL] DIAG: result type=' + typeof items + ' keys=' + (typeof items === 'object' ? Object.keys(items).join(',') : ''));
    }
    if (Array.isArray(items) && items.length > 0) {
      console.log('[DL] DIAG: sample item keys=' + Object.keys(items[0]).join(','));
    }
    return r;
  }).catch(function(e) {
    console.error('[DL] DIAG: ошибка', e);
  });
}

/* ═══════════════════════════════════════════════════════════════
   Fallback для Предеина: загрузка elapsed по задачам группы 26
   Вызывается последовательно (не batch), по 5 задач за раз.
   Это медленно, но надёжно — batch может молча проглатывать ошибки.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedForPredein(taskIds, seenElapsedIds, allElapsed) {
  if (!taskIds || !taskIds.length) return Promise.resolve(0);

  console.log('[DL] Fallback Предеин: загрузка elapsed для ' + taskIds.length + ' задач последовательно...');
  var added = 0;
  var proms = [];

  /* Обрабатываем по 5 задач одновременно */
  for (var i = 0; i < taskIds.length; i += 5) {
    var chunk = taskIds.slice(i, i + 5);
    (function(taskChunk, chunkIdx) {
      proms.push(
        _dlDelay(chunkIdx * 200).then(function() {
          return Promise.all(taskChunk.map(function(tid) {
            return bxPost('task.elapseditem.getlist', { TASK_ID: tid }).then(function(r) {
              if (r && r.error) return; /* Нет elapsed или ошибка — пропускаем */
              var items = r && r.result;
              if (!Array.isArray(items)) return;
              items.forEach(function(e) {
                /* Фильтруем только Предеина */
                if (String(e.USER_ID) !== '116') return;
                var eid = String(e.ID || '');
                if (eid && !seenElapsedIds[eid]) {
                  seenElapsedIds[eid] = true;
                  allElapsed.push(e);
                  added++;
                }
              });
            }).catch(function() {}); /* Молча игнорируем ошибки отдельных задач */
          }));
        })
      );
    })(chunk, Math.floor(i / 5));
  }

  return Promise.all(proms).then(function() {
    if (added > 0) {
      console.log('[DL] Fallback Предеин: добавлено ' + added + ' elapsed записей');
    }
    return added;
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

  /* Look back 6 месяцев */
  var lookbackDate = new Date(year, month - 1 - 6, 1);
  var lookbackStr = fmt(lookbackDate);

  console.log('[DL] PR_loadRealData v6.7.0: ' + fromStr + ' — ' + toStr +
    ', devs=' + devIds.length);

  /* ═══ Phase 1: Поиск задач по RESPONSIBLE ═══ */
  var taskProms = [];
  devIds.forEach(function(devId, idx) {
    taskProms.push(
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

  /* ═══ Phase 2: Загрузка задач по ВСЕМ группам проектов ═══ */
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
      taskIdList.push(id);
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
    var BATCH_SIZE = 25;
    /* Статистика для диагностики */
    var _batchStats = { total: 0, success: 0, empty: 0, error: 0, errorSamples: [] };

    for (var i = 0; i < taskIdList.length; i += BATCH_SIZE) {
      var chunk = taskIdList.slice(i, i + BATCH_SIZE);
      var batchCmd = {};
      chunk.forEach(function(tid, idx) {
        batchCmd['e' + idx] = 'task.elapseditem.getlist?TASK_ID=' + tid;
      });
      (function(batchIdx, chunkSize) {
        batchProms.push(
          _dlDelay(batchIdx * 300).then(function() {
            _batchStats.total++;
            return _dlBxPost('batch', { halt: 0, cmd: batchCmd }, 0); /* 0 retries для batch */
          }).then(function(r) {
            if (r && r.error) {
              /* Весь batch упал */
              _batchStats.error++;
              if (_batchStats.errorSamples.length < 3) {
                _batchStats.errorSamples.push(r.error);
              }
              return;
            }
            if (!r || !r.result || !r.result.result) {
              _batchStats.error++;
              return;
            }
            var results = r.result.result;
            if (typeof results !== 'object' || Array.isArray(results)) {
              _batchStats.error++;
              return;
            }

            var batchHasItems = false;
            var batchErrorCount = 0;
            Object.keys(results).forEach(function(key) {
              var items = results[key];
              /* Если это объект с error — задача без elapsed или ошибка */
              if (items && typeof items === 'object' && !Array.isArray(items) && items.error) {
                batchErrorCount++;
                return; /* Это нормально — не у всех задач есть elapsed */
              }
              if (!Array.isArray(items)) return;
              if (items.length > 0) batchHasItems = true;
              items.forEach(function(e) {
                var eid = String(e.ID || '');
                if (eid && !seenElapsedIds[eid]) {
                  seenElapsedIds[eid] = true;
                  allElapsed.push(e);
                }
              });
            });

            if (batchHasItems) {
              _batchStats.success++;
            } else {
              _batchStats.empty++;
            }
            if (batchErrorCount > 0 && batchErrorCount === chunkSize) {
              /* Все задачи в батче вернули ошибку — подозрительно */
              if (_batchStats.errorSamples.length < 3) {
                var sampleKey = Object.keys(results)[0];
                _batchStats.errorSamples.push('all-errors: ' + JSON.stringify(results[sampleKey]).substring(0, 200));
              }
            }
          }).catch(function(e) {
            _batchStats.error++;
            if (_batchStats.errorSamples.length < 3) {
              _batchStats.errorSamples.push(String(e));
            }
          })
        );
      })(Math.floor(i / BATCH_SIZE), chunk.length);
    }

    return Promise.all(batchProms).then(function() {
      /* ─── Диагностика batch ─── */
      console.log('[DL] Batch stats: total=' + _batchStats.total +
        ' success=' + _batchStats.success + ' empty=' + _batchStats.empty +
        ' error=' + _batchStats.error);
      if (_batchStats.errorSamples.length > 0) {
        console.warn('[DL] Batch error samples: ' + _batchStats.errorSamples.join(' | '));
      }

      console.log('[DL] Elapsed загружено: ' + allElapsed.length + ' записей (до фильтрации)');

      /* ─── Диагностика: сколько elapsed у Предеина (user=116) ─── */
      var predeinBefore = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
      console.log('[DL] Предеин (116): ' + predeinBefore.length + ' записей до фильтрации');

      /* ─── Если elapsed = 0 — диагностика: тестовый вызов для одной задачи ─── */
      if (allElapsed.length === 0 && taskIdList.length > 0) {
        return _dlDiagElapsed(taskIdList[0]).then(function() {
          return _prContinueAfterElapsed(allElapsed, seenElapsedIds, allTasks, tasksMeta, taskIdList, range, fromStr, toStr, devIds);
        });
      }

      return _prContinueAfterElapsed(allElapsed, seenElapsedIds, allTasks, tasksMeta, taskIdList, range, fromStr, toStr, devIds);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Продолжение после загрузки elapsed: fallback для Предеина,
   фильтрация, потерянные задачи, проекты
   ═══════════════════════════════════════════════════════════════ */
function _prContinueAfterElapsed(allElapsed, seenElapsedIds, allTasks, tasksMeta, taskIdList, range, fromStr, toStr, devIds) {

  /* ─── Fallback: загрузка elapsed для Предеина по задачам группы 26 ─── */
  var predeinBefore = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
  var predeinFallbackNeeded = predeinBefore.length === 0;

  var fallbackProm;
  if (predeinFallbackNeeded) {
    /* Собрать задачи из группы 26 или задачи, где Предеин не ответственный,
       но мог списывать время */
    var group26TaskIds = [];
    var predeinNotResponsibleIds = [];
    taskIdList.forEach(function(tid) {
      var meta = tasksMeta[tid];
      if (meta && String(meta.groupId) === '26') {
        group26TaskIds.push(tid);
      }
      /* Также: задачи, где Предеин НЕ ответственный — он мог списывать на чужие */
      if (meta && String(meta.responsibleId) !== '116') {
        predeinNotResponsibleIds.push(tid);
      }
    });

    /* Ограничиваем список — только задачи из группы 26 + до 100 чужих задач */
    var fallbackTaskIds = group26TaskIds.slice();
    predeinNotResponsibleIds.forEach(function(tid) {
      if (fallbackTaskIds.indexOf(tid) < 0 && fallbackTaskIds.length < 200) {
        fallbackTaskIds.push(tid);
      }
    });

    console.log('[DL] Fallback Предеин: группа 26 задач=' + group26TaskIds.length +
      ', всего для проверки=' + fallbackTaskIds.length);
    fallbackProm = _prLoadElapsedForPredein(fallbackTaskIds, seenElapsedIds, allElapsed);
  } else {
    fallbackProm = Promise.resolve(0);
  }

  return fallbackProm.then(function() {
    /* Обновить диагноз Предеина */
    predeinBefore = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
    console.log('[DL] Предеин (116): ' + predeinBefore.length + ' записей (после fallback)');
    predeinBefore.forEach(function(e) {
      console.log('[DL]   Предеин elapsed: TASK=' + e.TASK_ID + ' DATE=' + (e.CREATED_DATE || '').substring(0,10) +
        ' MIN=' + e.MINUTES + ' SEC=' + e.SECONDS);
    });

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
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка проектов + финальная сборка результата
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
