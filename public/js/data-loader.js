/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v6.8.0)

   Ключевые изменения v6.8.0:
   - DIAGNOSTIC MODE: логирует формат batch-ответа, USER_ID и даты
     для ВСЕХ найденных elapsed записей
   - Обработка batch-ответа в ЛЮБОМ формате:
     прямой массив [...], объект {result:[...]}, объект {items:[...]}
   - Диагностика: тестовый вызов task.elapseditem.getlist для одной задачи,
     чтобы увидеть реальный формат ответа API
   - Логирование groupId для первых задач — понять, почему группа 26 = 0
   - Убран tasks.elapseditem.list (НЕ СУЩЕСТВУЕТ в Битрикс24)
   - _dlBxPost НЕ ретраит METHOD_NOT_FOUND и др. невосстановимые ошибки
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
      if (_dlIsNonRetryable(r.error)) {
        console.warn('[DL] НЕretryable ' + method + ': ' + r.error);
        return r;
      }
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

/* ═══════════════════════════════════════════════════════════════
   Извлечь массив elapsed из batch-результата одной команды.
   Формат может быть ЛЮБЫМ:
   - [...] — прямой массив
   - {result: [...]} — объект с полем result
   - {items: [...]} — объект с полем items
   - {error: "..."} — ошибка
   - null / false / число — нет данных
   ═══════════════════════════════════════════════════════════════ */
function _dlExtractElapsedItems(cmdResult, key) {
  if (!cmdResult) return [];

  /* Прямой массив */
  if (Array.isArray(cmdResult)) return cmdResult;

  /* Объект с ошибкой */
  if (typeof cmdResult === 'object' && cmdResult.error) return [];

  /* Объект с полем result (может быть массив) */
  if (typeof cmdResult === 'object' && cmdResult.result) {
    if (Array.isArray(cmdResult.result)) return cmdResult.result;
    /* result может быть объектом с items */
    if (typeof cmdResult.result === 'object' && cmdResult.result.items) {
      if (Array.isArray(cmdResult.result.items)) return cmdResult.result.items;
    }
  }

  /* Объект с полем items */
  if (typeof cmdResult === 'object' && cmdResult.items) {
    if (Array.isArray(cmdResult.items)) return cmdResult.items;
  }

  /* Неизвестный формат — логируем первые 3 */
  if (typeof cmdResult === 'object' && Object.keys(cmdResult).length > 0) {
    if (!_dlExtractElapsedItems._warnCount) _dlExtractElapsedItems._warnCount = 0;
    if (_dlExtractElapsedItems._warnCount < 3) {
      _dlExtractElapsedItems._warnCount++;
      console.warn('[DL] Неизвестный формат batch-результата для key=' + key +
        ': type=' + typeof cmdResult + ' keys=' + Object.keys(cmdResult).join(',') +
        ' sample=' + JSON.stringify(cmdResult).substring(0, 300));
    }
  }

  return [];
}

/* ─── Загрузка данных за период ─── */
function prLoadPeriodData(year, month) {
  return PR_loadRealData(year, month);
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка задач по GROUP_ID (ВСЕХ проектов)
   ═══════════════════════════════════════════════════════════════ */
function _prLoadTasksByGroups(lookbackStr) {
  var groupIds = Object.keys(PROJECTS);
  var allTasks = [];
  var seenIds = {};
  var groupCount = {}; /* Диагностика: сколько задач в каждой группе */

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
    /* Диагностика: сколько задач в каждой группе */
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
   Вызывается ВСЕГДА — чтобы увидеть формат ответа API.
   ═══════════════════════════════════════════════════════════════ */
function _dlDiagElapsed(testTaskId) {
  if (!testTaskId) return Promise.resolve();
  console.log('[DL] DIAG: тестовый task.elapseditem.getlist для задачи #' + testTaskId);
  return bxPost('task.elapseditem.getlist', { TASK_ID: testTaskId }).then(function(r) {
    if (r && r.error) {
      console.warn('[DL] DIAG: task.elapseditem.getlist ERROR: ' + r.error + ' — ' + (r.error_description || ''));
      /* Пробуем POST-вариант с параметром в теле */
      return bxPost('task.elapseditem.getlist', { TASK_ID: testTaskId, FILTER: {}, ORDER: { ID: 'ASC' } }).then(function(r2) {
        if (r2 && r2.error) {
          console.warn('[DL] DIAG: вариант2 тоже ERROR: ' + r2.error);
        } else if (r2 && r2.result) {
          var items2 = r2.result;
          console.log('[DL] DIAG: вариант2 OK! type=' + (Array.isArray(items2) ? 'array[' + items2.length + ']' : typeof items2));
          if (!Array.isArray(items2) && typeof items2 === 'object') {
            console.log('[DL] DIAG: keys=' + Object.keys(items2).join(','));
            if (items2.result && Array.isArray(items2.result)) {
              console.log('[DL] DIAG: items.result=' + items2.result.length + ' записей');
            }
          }
          if (Array.isArray(items2) && items2.length > 0) {
            console.log('[DL] DIAG: sample=' + JSON.stringify(items2[0]).substring(0, 500));
          }
        }
        return r2;
      });
    }
    var items = r && r.result;
    console.log('[DL] DIAG: task.elapseditem.getlist OK! type=' + (Array.isArray(items) ? 'array[' + items.length + ']' : typeof items));
    if (items && !Array.isArray(items) && typeof items === 'object') {
      console.log('[DL] DIAG: result keys=' + Object.keys(items).join(','));
      if (items.result && Array.isArray(items.result)) {
        console.log('[DL] DIAG: items.result=' + items.result.length + ' записей');
        items = items.result;
      }
    }
    if (Array.isArray(items) && items.length > 0) {
      console.log('[DL] DIAG: sample=' + JSON.stringify(items[0]).substring(0, 500));
      /* Логируем USER_ID и CREATED_DATE для всех записей */
      items.forEach(function(e, idx) {
        if (idx < 10) {
          console.log('[DL] DIAG:   #' + idx + ' ID=' + e.ID + ' USER_ID=' + e.USER_ID +
            ' TASK_ID=' + e.TASK_ID + ' DATE=' + (e.CREATED_DATE || '').substring(0, 19) +
            ' MIN=' + e.MINUTES + ' SEC=' + e.SECONDS);
        }
      });
    }
    return r;
  }).catch(function(e) {
    console.error('[DL] DIAG: ошибка', e);
  });
}

/* ═══════════════════════════════════════════════════════════════
   Fallback для Предеина: загрузка elapsed по задачам группы 26
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedForPredein(taskIds, seenElapsedIds, allElapsed) {
  if (!taskIds || !taskIds.length) return Promise.resolve(0);

  console.log('[DL] Fallback Предеин: загрузка elapsed для ' + taskIds.length + ' задач...');
  var added = 0;
  var proms = [];

  for (var i = 0; i < taskIds.length; i += 5) {
    var chunk = taskIds.slice(i, i + 5);
    (function(taskChunk, chunkIdx) {
      proms.push(
        _dlDelay(chunkIdx * 200).then(function() {
          return Promise.all(taskChunk.map(function(tid) {
            return bxPost('task.elapseditem.getlist', { TASK_ID: tid }).then(function(r) {
              if (r && r.error) return;
              var items = r && r.result;
              /* Обработка разных форматов */
              if (items && typeof items === 'object' && !Array.isArray(items) && items.result) {
                items = items.result;
              }
              if (!Array.isArray(items)) return;
              items.forEach(function(e) {
                if (String(e.USER_ID) !== '116') return;
                var eid = String(e.ID || '');
                if (eid && !seenElapsedIds[eid]) {
                  seenElapsedIds[eid] = true;
                  allElapsed.push(e);
                  added++;
                }
              });
            }).catch(function() {});
          }));
        })
      );
    })(chunk, Math.floor(i / 5));
  }

  return Promise.all(proms).then(function() {
    if (added > 0) {
      console.log('[DL] Fallback Предеин: добавлено ' + added + ' elapsed записей');
    } else {
      console.log('[DL] Fallback Предеин: 0 записей добавлено');
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

  var lookbackDate = new Date(year, month - 1 - 6, 1);
  var lookbackStr = fmt(lookbackDate);

  console.log('[DL] PR_loadRealData v6.8.0: ' + fromStr + ' — ' + toStr +
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

  /* ═══ Phase 2: Загрузка задач по ВСЕМ группам ═══ */
  var groupTaskProm = _prLoadTasksByGroups(lookbackStr);

  /* ═══ Запуск обеих фаз параллельно ═══ */
  return Promise.all([
    Promise.all(taskProms),
    groupTaskProm
  ]).then(function(phases) {
    var taskArrays = phases[0];
    var groupTasks = phases[1];

    /* ─── Собрать задачи, дедупликация ─── */
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

    /* ─── Диагностика: какие groupId у задач ─── */
    var groupIdStats = {};
    var g26Sample = null;
    allTasks.forEach(function(t) {
      var gid = String(t.groupId || t.GROUP_ID || (t.group && t.group.id) || '0');
      groupIdStats[gid] = (groupIdStats[gid] || 0) + 1;
      if (gid === '26' && !g26Sample) {
        g26Sample = t;
      }
    });
    console.log('[DL] GroupId distribution: ' + JSON.stringify(groupIdStats));
    if (g26Sample) {
      console.log('[DL] Группа 26 SAMPLE: id=' + g26Sample.id + ' title=' + (g26Sample.title||'').substring(0,60) +
        ' groupId=' + g26Sample.groupId + ' GROUP_ID=' + g26Sample.GROUP_ID +
        ' group=' + JSON.stringify(g26Sample.group).substring(0, 100));
    } else {
      console.log('[DL] НЕТ задач с groupId=26! Проверяем другие поля...');
      /* Логируем первые 5 задач и их group-поля */
      allTasks.slice(0, 5).forEach(function(t, idx) {
        console.log('[DL]   Задача #' + idx + ': id=' + t.id +
          ' groupId=' + t.groupId + ' GROUP_ID=' + t.GROUP_ID +
          ' group=' + JSON.stringify(t.group).substring(0, 100));
      });
    }

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

    if (!taskIdList.length) {
      console.warn('[DL] Нет задач для загрузки elapsed');
      return {
        elapsed: [], tasks: allTasks, projects: {}, tasksMeta: tasksMeta,
        from: range.from, to: range.to, days: range.days
      };
    }

    /* ═══ Phase 3: Batch-загрузка elapsed ═══ */
    console.log('[DL] Batch-загрузка elapsed для ' + taskIdList.length + ' задач...');

    var allElapsed = [];
    var seenElapsedIds = {};
    var batchProms = [];
    var BATCH_SIZE = 25;
    var _batchStats = { total: 0, success: 0, empty: 0, error: 0, errorSamples: [], formatSample: null };

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
            return _dlBxPost('batch', { halt: 0, cmd: batchCmd }, 0);
          }).then(function(r) {
            if (r && r.error) {
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
            Object.keys(results).forEach(function(key) {
              var cmdResult = results[key];

              /* Сохранить образец формата первого непустого результата */
              if (!_batchStats.formatSample && cmdResult && typeof cmdResult === 'object') {
                if (Array.isArray(cmdResult) && cmdResult.length > 0) {
                  _batchStats.formatSample = 'array[' + cmdResult.length + '] keys=' + Object.keys(cmdResult[0]).join(',');
                } else if (!Array.isArray(cmdResult) && !cmdResult.error) {
                  _batchStats.formatSample = 'object keys=' + Object.keys(cmdResult).join(',');
                }
              }

              /* Извлечь elapsed записи из любого формата */
              var items = _dlExtractElapsedItems(cmdResult, key);
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
      console.log('[DL] Batch format sample: ' + (_batchStats.formatSample || 'none'));
      if (_batchStats.errorSamples.length > 0) {
        console.warn('[DL] Batch error samples: ' + _batchStats.errorSamples.join(' | '));
      }

      console.log('[DL] Elapsed загружено: ' + allElapsed.length + ' записей (до фильтрации)');

      /* ─── ДЕТАЛЬНАЯ диагностика: USER_ID и даты ─── */
      var userIdStats = {};
      var dateStats = {};
      allElapsed.forEach(function(e, idx) {
        var uid = String(e.USER_ID || '?');
        userIdStats[uid] = (userIdStats[uid] || 0) + 1;
        var d = (e.CREATED_DATE || '').substring(0, 10);
        dateStats[d] = (dateStats[d] || 0) + 1;
        /* Логируем первые 20 записей подробно */
        if (idx < 20) {
          console.log('[DL]   elapsed #' + idx + ': ID=' + e.ID + ' USER=' + e.USER_ID +
            ' TASK=' + e.TASK_ID + ' DATE=' + (e.CREATED_DATE || '').substring(0, 19) +
            ' MIN=' + e.MINUTES + ' SEC=' + e.SECONDS);
        }
      });
      console.log('[DL] USER_ID distribution: ' + JSON.stringify(userIdStats));
      console.log('[DL] DATE distribution: ' + JSON.stringify(dateStats));

      /* ─── Предеин ─── */
      var predeinBefore = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
      console.log('[DL] Предеин (116): ' + predeinBefore.length + ' записей до фильтрации');

      /* ─── ВСЕГДА: тестовый вызов для одной задачи ─── */
      var testTaskId = taskIdList[0];
      /* Найти задачу с наибольшим количеством elapsed для более информативного теста */
      if (allElapsed.length > 0) {
        var taskElapsedCount = {};
        allElapsed.forEach(function(e) { taskElapsedCount[e.TASK_ID] = (taskElapsedCount[e.TASK_ID] || 0) + 1; });
        var maxTask = '';
        var maxCount = 0;
        Object.keys(taskElapsedCount).forEach(function(tid) {
          if (taskElapsedCount[tid] > maxCount) { maxCount = taskElapsedCount[tid]; maxTask = tid; }
        });
        if (maxTask) testTaskId = maxTask;
      }

      return _dlDiagElapsed(testTaskId).then(function() {
        return _prContinueAfterElapsed(allElapsed, seenElapsedIds, allTasks, tasksMeta, taskIdList, range, fromStr, toStr, devIds);
      });
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Продолжение: fallback Предеин, фильтрация, потерянные задачи
   ═══════════════════════════════════════════════════════════════ */
function _prContinueAfterElapsed(allElapsed, seenElapsedIds, allTasks, tasksMeta, taskIdList, range, fromStr, toStr, devIds) {

  /* ─── Fallback: загрузка elapsed для Предеина ─── */
  var predeinBefore = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
  var predeinFallbackNeeded = predeinBefore.length === 0;

  var fallbackProm;
  if (predeinFallbackNeeded) {
    /* Собрать задачи для проверки */
    var group26TaskIds = [];
    var predeinNotResponsibleIds = [];
    taskIdList.forEach(function(tid) {
      var meta = tasksMeta[tid];
      if (meta && String(meta.groupId) === '26') {
        group26TaskIds.push(tid);
      }
      if (meta && String(meta.responsibleId) !== '116') {
        predeinNotResponsibleIds.push(tid);
      }
    });

    console.log('[DL] Fallback Предеин: группа 26 задач=' + group26TaskIds.length +
      ', чужих задач=' + predeinNotResponsibleIds.length);

    var fallbackTaskIds = group26TaskIds.slice();
    predeinNotResponsibleIds.forEach(function(tid) {
      if (fallbackTaskIds.indexOf(tid) < 0 && fallbackTaskIds.length < 200) {
        fallbackTaskIds.push(tid);
      }
    });

    fallbackProm = _prLoadElapsedForPredein(fallbackTaskIds, seenElapsedIds, allElapsed);
  } else {
    fallbackProm = Promise.resolve(0);
  }

  return fallbackProm.then(function() {
    predeinBefore = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
    console.log('[DL] Предеин (116): ' + predeinBefore.length + ' записей (после fallback)');

    /* ─── Фильтрация: период + наши разработчики ─── */
    var devIdSet = {};
    DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

    /* Диагностика: какие USER_ID есть и кто в devIdSet */
    console.log('[DL] devIdSet: ' + Object.keys(devIdSet).join(','));

    var beforeFilter = allElapsed.length;
    allElapsed = allElapsed.filter(function(e) {
      var d = (e.CREATED_DATE || '').substring(0, 10);
      if (d < fromStr || d > toStr) return false;
      return devIdSet[String(e.USER_ID)];
    });

    console.log('[DL] Фильтрация: ' + beforeFilter + ' → ' + allElapsed.length +
      ' (период ' + fromStr + ' — ' + toStr + ')');

    /* Диагностика: Предеин после фильтрации */
    var predeinAfter = allElapsed.filter(function(e) { return String(e.USER_ID) === '116'; });
    console.log('[DL] Предеин (116): ' + predeinAfter.length + ' записей после фильтрации');

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
