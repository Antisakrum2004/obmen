/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v6.10.0)

   Ключевые изменения v6.10.0:
   - УДАЛЁН прямой поиск elapsed (task.elapseditem.list / tasks.elapseditem.list
     — оба метода НЕ СУЩЕСТВУЮТ в Bitrix, всегда ERROR_METHOD_NOT_FOUND)
   - Batch elapsed БЕЗ FILTER по дате в URL — фильтруем на клиенте
   - ORDER[ID]=DESC — сначала новые записи
   - BATCH_SIZE=50 (максимум Bitrix) — быстрее загрузка
   - ГЛУБОКАЯ ДИАГНОСТИКА: полный ответ первого батча, перечень задач
     с elapsed, проверка формата TASK_ID в batch
   - SEQUENTIAL FALLBACK: если batch дал 0 — прямые вызовы
     task.elapseditem.getlist для выборки задач
   - Явное сообщение если данных нет (возможно проблема прав вебхука)
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
function _dlExtractElapsedItems(cmdResult) {
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
   Batch-загрузка elapsed для задач

   v6.10.0: БЕЗ FILTER по дате в URL — фильтруем на клиенте.
   ORDER[ID]=DESC — сначала новые записи.
   BATCH_SIZE=50 (максимум Bitrix batch).
   Подробная диагностика каждого батча.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedBatch(taskIdList, seenElapsedIds) {
  var allElapsed = [];
  var batchProms = [];
  var BATCH_SIZE = 50;
  var _batchStats = { total: 0, success: 0, empty: 0, error: 0, tasksWithItems: 0 };
  var _firstBatchLogged = false;
  var _tasksWithItems = {}; /* taskId -> count */

  for (var i = 0; i < taskIdList.length; i += BATCH_SIZE) {
    var chunk = taskIdList.slice(i, i + BATCH_SIZE);
    var batchCmd = {};
    chunk.forEach(function(tid, idx) {
      /* v6.10.0: БЕЗ FILTER по дате — загружаем ВСЕ elapsed, фильтруем на клиенте */
      /* ORDER[ID]=DESC — сначала самые новые записи */
      batchCmd['e' + idx] = 'task.elapseditem.getlist?TASK_ID=' + tid + '&ORDER[ID]=DESC';
    });
    (function(batchIdx, batchChunk) {
      batchProms.push(
        _dlDelay(batchIdx * 200).then(function() {
          _batchStats.total++;
          return _dlBxPost('batch', { halt: 0, cmd: batchCmd }, 0);
        }).then(function(r) {
          if (r && r.error) { _batchStats.error++; return; }
          if (!r || !r.result || !r.result.result) { _batchStats.error++; return; }
          var results = r.result.result;
          if (typeof results !== 'object' || Array.isArray(results)) { _batchStats.error++; return; }

          /* Диагностика: логируем ПОЛНЫЙ ответ первого батча */
          if (!_firstBatchLogged) {
            _firstBatchLogged = true;
            var firstKey = Object.keys(results)[0];
            if (firstKey) {
              console.log('[DL] DIAG: Первый батч, ключ=' + firstKey +
                ', тип результата=' + (Array.isArray(results[firstKey]) ? 'array' : typeof results[firstKey]) +
                ', длина=' + (Array.isArray(results[firstKey]) ? results[firstKey].length : 'N/A'));
              if (results[firstKey] && typeof results[firstKey] === 'object' && !Array.isArray(results[firstKey])) {
                console.log('[DL] DIAG: Ключи результата=' + Object.keys(results[firstKey]).join(','));
              }
              /* Показать первый элемент если есть */
              var firstItems = _dlExtractElapsedItems(results[firstKey]);
              if (firstItems.length > 0) {
                console.log('[DL] DIAG: Первый elapsed элемент=' + JSON.stringify(firstItems[0]).substring(0, 300));
              } else {
                console.log('[DL] DIAG: Первый батч вернул 0 elapsed (taskId=' + batchChunk[0] + ')');
              }
            }
          }

          var batchHasItems = false;
          Object.keys(results).forEach(function(key, keyIdx) {
            var items = _dlExtractElapsedItems(results[key]);
            if (items.length > 0) {
              batchHasItems = true;
              var taskId = batchChunk[keyIdx] || '?';
              _tasksWithItems[taskId] = items.length;
              _batchStats.tasksWithItems++;
            }
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
    })(Math.floor(i / BATCH_SIZE), chunk);
  }

  return Promise.all(batchProms).then(function() {
    console.log('[DL] Batch elapsed: total=' + _batchStats.total +
      ' success=' + _batchStats.success + ' empty=' + _batchStats.empty +
      ' error=' + _batchStats.error +
      ' | задач с elapsed=' + _batchStats.tasksWithItems +
      ' | всего записей=' + allElapsed.length);

    /* Диагностика: показать задачи с elapsed */
    var twiKeys = Object.keys(_tasksWithItems);
    if (twiKeys.length > 0) {
      console.log('[DL] Задачи с elapsed (первые 20):');
      twiKeys.slice(0, 20).forEach(function(tid) {
        console.log('[DL]   Задача #' + tid + ': ' + _tasksWithItems[tid] + ' записей');
      });
    } else {
      console.log('[DL] ⚠️ НИ ОДНА задача не вернула elapsed записей!');
    }

    return allElapsed;
  });
}

/* ═══════════════════════════════════════════════════════════════
   SEQUENTIAL DIAGNOSTIC: Прямые вызовы task.elapseditem.getlist
   для выборки задач. Используется если batch дал 0 результатов.

   Вызывает API напрямую через POST body (как в v6.8.0 diagnostic),
   не через batch URL. Это исключает проблемы с форматом параметров.
   ═══════════════════════════════════════════════════════════════ */
function _prDiagnosticSequential(taskIdList, sampleSize) {
  var sample = taskIdList.slice(0, sampleSize || 30);
  console.log('[DL] DIAG: Последовательная проверка ' + sample.length + ' задач...');

  var results = [];
  var proms = [];
  sample.forEach(function(tid, idx) {
    proms.push(
      _dlDelay(idx * 300).then(function() {
        /* Используем POST body, НЕ batch URL — самый надёжный формат */
        return bxPost('task.elapseditem.getlist', [tid, {ID: 'DESC'}, {}]).then(function(r) {
          if (r && r.error) {
            console.log('[DL] DIAG: task#' + tid + ' → ОШИБКА: ' + r.error);
            return 0;
          }
          var items = [];
          if (r && r.result) {
            if (Array.isArray(r.result)) items = r.result;
            else if (r.result.result && Array.isArray(r.result.result)) items = r.result.result;
            else if (r.result.items && Array.isArray(r.result.items)) items = r.result.items;
          }
          if (items.length > 0) {
            console.log('[DL] DIAG: task#' + tid + ' → ' + items.length + ' elapsed записей' +
              ' (USER_IDs: ' + items.map(function(e) { return e.USER_ID; }).join(',') + ')' +
              ' (DATES: ' + items.map(function(e) { return (e.CREATED_DATE||'').substring(0,10); }).join(',') + ')');
            items.forEach(function(e) { results.push(e); });
          }
          return items.length;
        }).catch(function(e) {
          console.log('[DL] DIAG: task#' + tid + ' → ИСКЛЮЧЕНИЕ: ' + e);
          return 0;
        });
      })
    );
  });

  return Promise.all(proms).then(function(counts) {
    var totalFound = counts.reduce(function(s, c) { return s + c; }, 0);
    console.log('[DL] DIAG: Последовательная проверка: ' + totalFound + ' elapsed из ' + sample.length + ' задач');
    return results;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Проверка прав вебхука: пробуем загрузить elapsed для задач
   из группы 26 (Текущие задачи 1с) — где Предеин списывает время
   ═══════════════════════════════════════════════════════════════ */
function _prCheckWebhookPermissions(group26TaskIds) {
  if (!group26TaskIds || group26TaskIds.length === 0) {
    console.log('[DL] DIAG: Нет задач из группы 26 для проверки прав');
    return Promise.resolve(null);
  }

  /* Берём до 5 задач из группы 26 */
  var sample = group26TaskIds.slice(0, 5);
  console.log('[DL] DIAG: Проверка прав вебхука на задачах группы 26: ' + sample.join(','));

  var allItems = [];
  var proms = sample.map(function(tid, idx) {
    return _dlDelay(idx * 400).then(function() {
      return bxPost('task.elapseditem.getlist', [tid, {ID: 'DESC'}, {}]).then(function(r) {
        var items = [];
        if (r && r.result) {
          if (Array.isArray(r.result)) items = r.result;
          else if (r.result.result && Array.isArray(r.result.result)) items = r.result.result;
        }
        console.log('[DL] DIAG: task#' + tid + ' (гр.26): ' + items.length + ' elapsed' +
          (items.length > 0 ? ' USER_IDs=' + items.map(function(e){return e.USER_ID;}).join(',') : ''));
        items.forEach(function(e) { allItems.push(e); });
        return items.length;
      }).catch(function() { return 0; });
    });
  });

  return Promise.all(proms).then(function() {
    var predeinItems = allItems.filter(function(e) { return String(e.USER_ID) === '116'; });
    console.log('[DL] DIAG: Группа 26: всего ' + allItems.length + ' elapsed, Предеин=' + predeinItems.length);
    return { total: allItems.length, predein: predeinItems.length };
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
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);
  var devIds = ACTIVE_DEV_IDS;

  console.log('[DL] ═══ PR_loadRealData v6.10.0 ═══');
  console.log('[DL] Период: ' + fromStr + ' — ' + toStr + ', devs=' + devIds.length);

  /* ═══ Параллельная загрузка задач ═══ */
  var lookbackStr = fmt(new Date(year, month - 1 - 24, 1)); /* 24 мес lookback */

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

  return Promise.all([
    Promise.all(taskProms),
    groupTaskProm
  ]).then(function(phases) {
    var taskArrays = phases[0];
    var groupTasks = phases[1];

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
    var group26TaskIds = [];
    allTasks.forEach(function(t) {
      var gid = String(t.groupId || t.GROUP_ID || (t.group && t.group.id) || '0');
      groupIdStats[gid] = (groupIdStats[gid] || 0) + 1;
      if (gid === '26') {
        var tid = String(t.id || t.ID);
        group26TaskIds.push(tid);
      }
    });
    console.log('[DL] GroupId distribution: ' + JSON.stringify(groupIdStats));
    if (group26TaskIds.length > 0) {
      console.log('[DL] Группа 26 (Текущие задачи 1с): ' + group26TaskIds.length + ' задач, IDs: ' + group26TaskIds.slice(0, 10).join(','));
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

    /* ═══ Шаг 1: Batch elapsed для ВСЕХ задач ═══ */
    var seenElapsedIds = {};
    console.log('[DL] Запуск batch elapsed для ' + taskIdList.length + ' задач...');

    return _prLoadElapsedBatch(taskIdList, seenElapsedIds).then(function(batchElapsed) {

      /* ═══ Шаг 2: Диагностика — проверка прав и формата ═══ */
      var diagProm;
      if (batchElapsed.length === 0) {
        console.log('[DL] ⚠️ Batch дал 0 elapsed! Запускаю диагностику...');

        /* 2a: Последовательная проверка выборки задач */
        var seqProm = _prDiagnosticSequential(taskIdList, 30);

        /* 2b: Проверка прав на группе 26 */
        var permProm = _prCheckWebhookPermissions(group26TaskIds);

        diagProm = Promise.all([seqProm, permProm]).then(function(diagResults) {
          var seqItems = diagResults[0] || [];
          var permResult = diagResults[1];

          if (seqItems.length > 0) {
            console.log('[DL] DIAG: Последовательный вызов нашёл ' + seqItems.length + ' elapsed!' +
              ' → Проблема в batch-формате, а не в правах.');
            seqItems.forEach(function(e) {
              var eid = String(e.ID || '');
              if (eid && !seenElapsedIds[eid]) {
                seenElapsedIds[eid] = true;
                batchElapsed.push(e);
              }
            });
          } else {
            console.log('[DL] DIAG: Последовательный вызов тоже дал 0 elapsed.');
            if (permResult && permResult.total === 0) {
              console.log('[DL] ═══════════════════════════════════════════════════════');
              console.log('[DL] ⚠️ ВЕРОЯТНАЯ ПРОБЛЕМА: Вебхук пользователя 116 (Предеин)');
              console.log('[DL]   не имеет прав просматривать затраченное время других');
              console.log('[DL]   пользователей. Необходим вебхук администратора.');
              console.log('[DL] ═══════════════════════════════════════════════════════');
            } else if (permResult && permResult.total > 0 && permResult.predein === 0) {
              console.log('[DL] DIAG: Группа 26 содержит elapsed, но не от Предеина (USER_ID=116)');
              console.log('[DL]   Возможно Предеин ещё не списывал время в этом периоде');
            }
          }

          return batchElapsed;
        });
      } else {
        diagProm = Promise.resolve(batchElapsed);
      }

      return diagProm;
    }).then(function(allElapsed) {

      /* ═══ Шаг 3: Расширенная загрузка если batch дал мало ═══
         Если batch нашёл < 50 elapsed, пробуем загрузить ещё
         последовательными вызовами для задач каждого разработчика */
      var extendedProm;
      if (allElapsed.length > 0 && allElapsed.length < 50) {
        console.log('[DL] Мало elapsed (' + allElapsed.length + ') — пробуем расширенную загрузку...');

        /* Собираем задачи по каждому разработчику, которые ещё не проверены */
        var devTaskIds = {};
        devIds.forEach(function(devId) {
          var uid = String(devId);
          devTaskIds[uid] = [];
        });
        allTasks.forEach(function(t) {
          var rid = String(t.responsibleId || t.RESPONSIBLE_ID || '0');
          if (devTaskIds[rid]) {
            var tid = String(t.id || t.ID);
            devTaskIds[rid].push(tid);
          }
        });

        /* Для каждого разработчика берём до 50 его задач и загружаем последовательно */
        var seqProms = [];
        devIds.forEach(function(devId, idx) {
          var uid = String(devId);
          var tids = devTaskIds[uid].slice(0, 50);
          if (tids.length === 0) return;

          seqProms.push(
            _dlDelay(idx * 500).then(function() {
              console.log('[DL] Extended: ' + (DEVELOPERS[uid]||uid) + ' — проверяем ' + tids.length + ' задач');
              var promChain = Promise.resolve([]);
              tids.forEach(function(tid, tidx) {
                promChain = promChain.then(function(acc) {
                  return _dlDelay(150).then(function() {
                    return bxPost('task.elapseditem.getlist', [tid, {ID: 'DESC'}, {}]).then(function(r) {
                      var items = [];
                      if (r && r.result) {
                        if (Array.isArray(r.result)) items = r.result;
                        else if (r.result.result && Array.isArray(r.result.result)) items = r.result.result;
                      }
                      if (items.length > 0) {
                        items.forEach(function(e) { acc.push(e); });
                      }
                      return acc;
                    }).catch(function() { return acc; });
                  });
                });
              });
              return promChain;
            })
          );
        });

        extendedProm = Promise.all(seqProms).then(function(devResults) {
          var extendedItems = [];
          devResults.forEach(function(items) {
            items.forEach(function(e) {
              var eid = String(e.ID || '');
              if (eid && !seenElapsedIds[eid]) {
                seenElapsedIds[eid] = true;
                extendedItems.push(e);
              }
            });
          });
          if (extendedItems.length > 0) {
            console.log('[DL] Extended нашёл ' + extendedItems.length + ' дополнительных elapsed!');
            allElapsed = allElapsed.concat(extendedItems);
          }
          return allElapsed;
        });
      } else {
        extendedProm = Promise.resolve(allElapsed);
      }

      return extendedProm;
    }).then(function(allElapsed) {

      console.log('[DL] Всего elapsed (до фильтрации): ' + allElapsed.length + ' записей');

      /* ─── Диагностика: распределение по USER_ID и датам (до фильтрации) ─── */
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

      /* ─── Если данных НЕТ — понятное сообщение ─── */
      if (allElapsed.length === 0) {
        console.log('[DL] ═══════════════════════════════════════════════════════════');
        console.log('[DL] ⚠️ ЗАТРАЧЕННОЕ ВРЕМЯ НЕ НАЙДЕНО за ' + fromStr + ' — ' + toStr);
        console.log('[DL] Возможные причины:');
        console.log('[DL]   1. Вебхук пользователя 116 не имеет прав просмотра');
        console.log('[DL]      затраченного времени других пользователей');
        console.log('[DL]      → Решение: создать вебхук от имени администратора');
        console.log('[DL]   2. За указанный период никто не списывал время');
        console.log('[DL]   3. Затраченное время в задачах, не входящих в группы');
        console.log('[DL] ═══════════════════════════════════════════════════════════');
      }

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
