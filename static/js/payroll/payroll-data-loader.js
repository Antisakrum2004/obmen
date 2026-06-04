/* ═══════════════════════════════════════════════════════════════
   payroll-data-loader.js — SAFE FETCH PIPELINE v3.0

   Deterministic Bitrix24 data ingestion layer.
   Гарантирует: полную загрузку, правильную пагинацию,
   защиту от race conditions, диагностику.

   Пайплайн:
   LOAD TASKS  → VERIFY PAGINATION → LOAD ELAPSED →
   VERIFY ELAPSED → BUILD NORMALIZED MODEL → CACHE → RENDER

   v3.0: Data freshness model, step callbacks, sync cursor,
         network hardening (exponential backoff, adaptive throttle,
         abort controller, retry classification)

   Strict ES5: var, function, prototype only.
   ═══════════════════════════════════════════════════════════════ */

/* ─── Loading State Machine ─── */
var PR_LOAD_STATE = {
  IDLE:     'idle',
  LOADING:  'loading',
  PARTIAL:  'partial',
  COMPLETE: 'complete',
  FAILED:   'failed'
};

/* ─── Глобальный объект диагностики ─── */
var PR_DataLoadReport = {
  state: PR_LOAD_STATE.IDLE,
  startedAt: 0,
  finishedAt: 0,
  tasksRequested: 0,
  tasksLoaded: 0,
  tasksPages: 0,
  elapsedRequested: 0,
  elapsedLoaded: 0,
  elapsedPages: 0,
  apiRequests: 0,
  failedRequests: 0,
  retries: 0,
  skippedBatches: 0,
  errors: [],
  warnings: [],
  missingTaskIds: [],
  orphanElapsedIds: [],
  duplicateElapsedIds: [],
  pageGaps: [],
  totalFromApi: 0,
  source: 'none',
  /* Phase 1: Data Freshness Model */
  datasetMeta: {
    lastSyncStartedAt: 0,
    lastSyncCompletedAt: 0,
    tasksSyncedCount: 0,
    elapsedSyncedCount: 0,
    failedRequests: 0,
    retries: 0,
    completenessVerified: false,
    syncDurationMs: 0
  }
};

/**
 * Сбросить отчёт диагностики
 */
function _prResetReport() {
  PR_DataLoadReport.state = PR_LOAD_STATE.IDLE;
  PR_DataLoadReport.startedAt = 0;
  PR_DataLoadReport.finishedAt = 0;
  PR_DataLoadReport.tasksRequested = 0;
  PR_DataLoadReport.tasksLoaded = 0;
  PR_DataLoadReport.tasksPages = 0;
  PR_DataLoadReport.elapsedRequested = 0;
  PR_DataLoadReport.elapsedLoaded = 0;
  PR_DataLoadReport.elapsedPages = 0;
  PR_DataLoadReport.apiRequests = 0;
  PR_DataLoadReport.failedRequests = 0;
  PR_DataLoadReport.retries = 0;
  PR_DataLoadReport.skippedBatches = 0;
  PR_DataLoadReport.errors = [];
  PR_DataLoadReport.warnings = [];
  PR_DataLoadReport.missingTaskIds = [];
  PR_DataLoadReport.orphanElapsedIds = [];
  PR_DataLoadReport.duplicateElapsedIds = [];
  PR_DataLoadReport.pageGaps = [];
  PR_DataLoadReport.totalFromApi = 0;
  PR_DataLoadReport.source = 'none';
  /* Phase 1: Reset datasetMeta */
  PR_DataLoadReport.datasetMeta = {
    lastSyncStartedAt: 0,
    lastSyncCompletedAt: 0,
    tasksSyncedCount: 0,
    elapsedSyncedCount: 0,
    failedRequests: 0,
    retries: 0,
    completenessVerified: false,
    syncDurationMs: 0
  };
}

/* ─── Конфигурация загрузчика ─── */
var PR_LOADER_CONFIG = {
  maxPages: 100,           /* Максимум страниц пагинации */
  pageSize: 50,            /* Размер страницы Bitrix24 */
  retryCount: 3,           /* Количество повторных попыток */
  retryDelay: 1000,        /* Задержка между повторами (мс) */
  requestTimeout: 30000,   /* Таймаут запроса (мс) */
  throttleDelay: 200,      /* Задержка между запросами (мс) — flood control */
  maxConcurrent: 3,        /* Максимум параллельных запросов */
  elapsedByDev: true,      /* Загружать elapsed по разработчикам (НЕ по задачам) */
  periodCentric: true      /* Phase 4: Period-centric loading flag — загрузка по периоду, не по задаче */
};

/* ─── Счётчик загрузок для race condition защиты ─── */
var _prLoadCounter = 0;

/* ═══════════════════════════════════════════════════════════════
   Phase 3: STEP CALLBACK — уведомление UI о текущем шаге загрузки
   ═══════════════════════════════════════════════════════════════ */
var PR_onLoadStep = null; /* callback function(stepId, progress, total) */

/* ═══════════════════════════════════════════════════════════════
   Phase 5: SYNC CURSOR — подготовка инкрементальной синхронизации
   ═══════════════════════════════════════════════════════════════ */
var PR_SyncCursor = {
  lastTaskSync: 0,      /* timestamp of last successful task sync */
  lastElapsedSync: 0,   /* timestamp of last successful elapsed sync */
  lastTaskCount: 0,     /* number of tasks at last sync */
  lastElapsedCount: 0   /* number of elapsed at last sync */
};

/* ═══════════════════════════════════════════════════════════════
   Phase 12: NETWORK HARDENING
   ═══════════════════════════════════════════════════════════════ */

/* ─── Request cancellation support ─── */
var _prAbortController = null;

function _prCancelPendingRequests() {
  if (_prAbortController) {
    try { _prAbortController.abort(); } catch(e) {}
    _prAbortController = null;
  }
}

/* ─── Retry classification ─── */
var PR_RETRY_CLASSIFICATION = {
  retryable: ['rate_limit', 'timeout', 'network', '500', '502', '503', 'flood'],
  nonRetryable: ['auth', 'not_found', 'invalid_method', 'access_denied'],
  unknown: true /* retry once for unknown errors */
};

/* ─── Adaptive throttle ─── */
var _prAdaptiveThrottle = {
  currentDelay: 200,
  minDelay: 200,
  maxDelay: 5000,
  increaseOnRateLimit: function() {
    this.currentDelay = Math.min(this.currentDelay * 2, this.maxDelay);
  },
  decreaseOnSuccess: function() {
    this.currentDelay = Math.max(Math.round(this.currentDelay * 0.9), this.minDelay);
  }
};

/* ─── Exponential backoff ─── */
function _prBackoffDelay(attempt) {
  var base = PR_LOADER_CONFIG.retryDelay;
  var delay = base * Math.pow(2, attempt);
  var jitter = Math.random() * base;
  return Math.min(delay + jitter, 30000); /* cap at 30s */
}

/* ═══════════════════════════════════════════════════════════════
   PAGINATED API CALLS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Безопасный вызов bxPost с retry и exponential backoff
 * @param {String} method
 * @param {Object} body
 * @param {Number} retries
 * @returns {Promise}
 */
function _prSafeBxPost(method, body, retries) {
  var maxRetries = (retries !== undefined) ? retries : PR_LOADER_CONFIG.retryCount;
  PR_DataLoadReport.apiRequests++;

  function attempt(remaining) {
    return bxPost(method, body).then(function(r) {
      if (r && r.error) {
        /* Phase 12: Classify error */
        var errStr = String(r.error).toLowerCase();
        var isRetryable = _prIsRetryableError(r.error);
        var isNonRetryable = PR_RETRY_CLASSIFICATION.nonRetryable.some(function(e) {
          return errStr.indexOf(e) >= 0;
        });

        if (isNonRetryable) {
          PR_DataLoadReport.failedRequests++;
          PR_DataLoadReport.errors.push({
            method: method,
            error: r.error,
            fatal: true
          });
          return r;
        }

        if (remaining > 0 && isRetryable) {
          PR_DataLoadReport.retries++;
          PR_DataLoadReport.datasetMeta.retries++;
          /* Phase 12: Adaptive throttle on rate limit */
          if (errStr.indexOf('rate') >= 0 || errStr.indexOf('limit') >= 0 || errStr.indexOf('flood') >= 0) {
            _prAdaptiveThrottle.increaseOnRateLimit();
          }
          /* Phase 12: Exponential backoff */
          return _prDelay(_prBackoffDelay(maxRetries - remaining)).then(function() {
            return attempt(remaining - 1);
          });
        }
        PR_DataLoadReport.failedRequests++;
        PR_DataLoadReport.datasetMeta.failedRequests++;
        PR_DataLoadReport.errors.push({
          method: method,
          error: r.error,
          fatal: remaining <= 0
        });
        return r;
      }
      /* Phase 12: Decrease throttle on success */
      _prAdaptiveThrottle.decreaseOnSuccess();
      return r;
    }).catch(function(e) {
      if (remaining > 0) {
        PR_DataLoadReport.retries++;
        PR_DataLoadReport.datasetMeta.retries++;
        return _prDelay(_prBackoffDelay(maxRetries - remaining)).then(function() {
          return attempt(remaining - 1);
        });
      }
      PR_DataLoadReport.failedRequests++;
      PR_DataLoadReport.datasetMeta.failedRequests++;
      PR_DataLoadReport.errors.push({
        method: method,
        error: e.message || String(e),
        fatal: true
      });
      return { error: e.message || 'Network error' };
    });
  }

  return attempt(maxRetries);
}

/**
 * Проверить, можно ли повторить запрос при этой ошибке
 * @param {String} error
 * @returns {Boolean}
 */
function _prIsRetryableError(error) {
  if (!error) return false;
  var errStr = String(error).toLowerCase();
  /* Retry on: rate limit, timeout, network, server errors */
  return errStr.indexOf('rate') >= 0 ||
         errStr.indexOf('limit') >= 0 ||
         errStr.indexOf('timeout') >= 0 ||
         errStr.indexOf('network') >= 0 ||
         errStr.indexOf('503') >= 0 ||
         errStr.indexOf('502') >= 0 ||
         errStr.indexOf('500') >= 0 ||
         errStr.indexOf('flood') >= 0;
}

/**
 * Загрузить ВСЕ страницы метода с пагинацией
 * Корректный цикл: while(next) — загружает до конца
 * @param {String} method — API метод (напр. 'tasks.task.list')
 * @param {Object} body — параметры запроса
 * @param {Function} extractItems — функция извлечения массива из ответа
 * @param {String} label — метка для диагностики
 * @returns {Promise<Array>} — все записи со всех страниц
 */
function _prFetchAllPages(method, body, extractItems, label) {
  var allItems = [];
  var start = 0;
  var pages = 0;
  var maxPages = PR_LOADER_CONFIG.maxPages;
  var totalFromApi = 0;
  var lastStart = -1; /* Защита от бесконечного цикла */

  function step() {
    pages++;
    if (pages > maxPages) {
      PR_DataLoadReport.warnings.push({
        source: label,
        message: 'Достигнут лимит страниц: ' + maxPages + ', загружено: ' + allItems.length
      });
      return allItems;
    }

    /* Защита от зацикливания: если start не изменился */
    if (start === lastStart && start > 0) {
      PR_DataLoadReport.warnings.push({
        source: label,
        message: 'Pagination stuck at start=' + start + ', breaking'
      });
      return allItems;
    }
    lastStart = start;

    var requestBody = Object.assign({}, body, { start: start });

    return _prSafeBxPost(method, requestBody).then(function(r) {
      if (!r || r.error) {
        PR_DataLoadReport.warnings.push({
          source: label,
          message: 'Ошибка на странице ' + pages + ': ' + (r ? r.error : 'no response')
        });
        /* Возвращаем что успели загрузить — частичные данные лучше чем ничего */
        return allItems;
      }

      var items = extractItems(r) || [];
      var next = r.next;

      /* ПРОВЕРКА: total из ответа API */
      if (r.total !== undefined) {
        totalFromApi = r.total;
      }

      /* ПРАВИЛЬНЫЙ concat — НЕ overwrite */
      allItems = allItems.concat(items);

      /* Обновить диагностику */
      if (label === 'tasks' || label.indexOf('tasks_dev') === 0) {
        PR_DataLoadReport.tasksPages = pages;
      } else if (label === 'elapsed' || label.indexOf('elapsed_dev') === 0) {
        PR_DataLoadReport.elapsedPages = pages;
      }

      /* ПРОВЕРКА: gap между страницами */
      var expectedStart = (pages - 1) * PR_LOADER_CONFIG.pageSize;
      if (start !== expectedStart && pages > 1) {
        PR_DataLoadReport.pageGaps.push({
          source: label,
          page: pages,
          expectedStart: expectedStart,
          actualStart: start
        });
      }

      /* ПРАВИЛЬНОЕ условие продолжения: только r.next */
      if (typeof next === 'number' && next > 0) {
        start = next;
        /* Phase 12: Adaptive throttle delay */
        return _prDelay(_prAdaptiveThrottle.currentDelay).then(function() {
          return step();
        });
      }

      /* Пагинация завершена — проверить total */
      if (totalFromApi > 0 && allItems.length < totalFromApi) {
        PR_DataLoadReport.warnings.push({
          source: label,
          message: 'Загружено ' + allItems.length + ' из ' + totalFromApi +
            ' (total из API). Возможна потеря данных.'
        });
      }

      return allItems;
    });
  }

  return step();
}

/* ═══════════════════════════════════════════════════════════════
   TASK LOADING — Стратегия: загрузить ВСЕ задачи по разработчикам

   Phase 4: PERIOD-CENTRIC LOADING
   Загрузка ведётся по ПЕРИОДУ, не по задачам.
   Все данные за период загружаются полностью, затем
   отношения разработчик-задача строятся локально.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Загрузить задачи для одного разработчика за период
 * Использует МНОЖЕСТВЕННЫЕ фильтры чтобы не потерять задачи:
 *   1. Созданные в периоде
 *   2. Закрытые в периоде
 *   3. В работе (status=3) — независимо от даты создания
 *   4. Изменённые в периоде
 * @param {Number} devId
 * @param {String} fromStr
 * @param {String} toStr
 * @returns {Promise<Array>} — уникальные задачи
 */
function _prLoadDevTasks(devId, fromStr, toStr) {
  var allTasks = [];
  var seenIds = {};

  /* Фильтр 1: Созданные в периоде (независимо от даты закрытия) */
  var prom1 = _prFetchAllPages('tasks.task.list', {
    filter: {
      RESPONSIBLE_ID: devId,
      '>=CREATED_DATE': fromStr
    },
    select: ['ID', 'TITLE', 'GROUP_ID', 'STAGE_ID', 'STATUS',
             'RESPONSIBLE_ID', 'CREATED_DATE', 'CLOSED_DATE']
  }, function(r) {
    return (r && r.result && r.result.tasks) || [];
  }, 'tasks_dev' + devId + '_created');

  /* Фильтр 2: В работе (status 3 = in progress) */
  var prom2 = _prFetchAllPages('tasks.task.list', {
    filter: {
      RESPONSIBLE_ID: devId,
      STATUS: '3'
    },
    select: ['ID', 'TITLE', 'GROUP_ID', 'STAGE_ID', 'STATUS',
             'RESPONSIBLE_ID', 'CREATED_DATE', 'CLOSED_DATE']
  }, function(r) {
    return (r && r.result && r.result.tasks) || [];
  }, 'tasks_dev' + devId + '_inprogress');

  /* Фильтр 3: Завершённые в периоде (могли быть созданы раньше) */
  var prom3 = _prFetchAllPages('tasks.task.list', {
    filter: {
      RESPONSIBLE_ID: devId,
      '>=CLOSED_DATE': fromStr,
      '<=CLOSED_DATE': toStr + ' 23:59:59'
    },
    select: ['ID', 'TITLE', 'GROUP_ID', 'STAGE_ID', 'STATUS',
             'RESPONSIBLE_ID', 'CREATED_DATE', 'CLOSED_DATE']
  }, function(r) {
    return (r && r.result && r.result.tasks) || [];
  }, 'tasks_dev' + devId + '_closed');

  /* Фильтр 4: Изменённые в периоде (могли получить elapsed, но не созданы/закрыты) */
  var prom4 = _prFetchAllPages('tasks.task.list', {
    filter: {
      RESPONSIBLE_ID: devId,
      '>=ACTIVITY_DATE': fromStr
    },
    select: ['ID', 'TITLE', 'GROUP_ID', 'STAGE_ID', 'STATUS',
             'RESPONSIBLE_ID', 'CREATED_DATE', 'CLOSED_DATE']
  }, function(r) {
    return (r && r.result && r.result.tasks) || [];
  }, 'tasks_dev' + devId + '_activity');

  return Promise.all([prom1, prom2, prom3, prom4]).then(function(batches) {
    /* Дедупликация по ID задачи */
    batches.forEach(function(tasks) {
      if (!Array.isArray(tasks)) return;
      tasks.forEach(function(t) {
        var id = String(t.id || t.ID || '');
        if (id && !seenIds[id]) {
          seenIds[id] = true;
          allTasks.push(t);
        }
      });
    });
    return allTasks;
  });
}

/* ═══════════════════════════════════════════════════════════════
   ELAPSED LOADING — Стратегия: BATCH API по ID задач

   Bitrix24 API task.elapseditem.getlist ТРЕБУЕТ TASK_ID.
   Без TASK_ID возвращает ERROR_CORE.
   Поэтому загружаем elapsed через batch API:
   - Группируем task IDs по 50 (лимит batch)
   - Каждый batch вызов = 1 HTTP запрос вместо 50
   - Это: ceil(N/50) запросов вместо N+1
   ═══════════════════════════════════════════════════════════════ */

/**
 * Загрузить ВСЕ elapsed для списка задач через batch API
 * Группирует taskIds по 50 и делает batch-запросы
 * @param {Array<String>} taskIds — массив ID задач
 * @returns {Promise<Array>} — все elapsed записи
 */
function _prLoadElapsedBatch(taskIds) {
  if (!taskIds || !taskIds.length) return Promise.resolve([]);

  var BATCH_SIZE = 50;
  var batches = [];
  for (var i = 0; i < taskIds.length; i += BATCH_SIZE) {
    batches.push(taskIds.slice(i, i + BATCH_SIZE));
  }

  var allElapsed = [];
  var batchIdx = 0;

  function nextBatch() {
    if (batchIdx >= batches.length) return allElapsed;

    var chunk = batches[batchIdx];
    batchIdx++;

    /* Строим cmd для batch: каждая команда = task.elapseditem.getlist?TASK_ID=X */
    var cmd = {};
    chunk.forEach(function(tid, idx) {
      cmd['e' + idx] = 'task.elapseditem.getlist?TASK_ID=' + parseInt(tid);
    });

    PR_DataLoadReport.apiRequests++;

    return _prSafeBxPost('batch', { cmd: cmd }).then(function(r) {
      if (!r || r.error) {
        PR_DataLoadReport.warnings.push({
          source: 'elapsed_batch',
          message: 'Batch ошибка: ' + (r ? r.error : 'no response')
        });
        /* Fallback: загрузить по одной задаче */
        return _prLoadElapsedFallback(chunk).then(function(fallbackElapsed) {
          allElapsed = allElapsed.concat(fallbackElapsed);
          PR_DataLoadReport.elapsedPages++;
          return _prDelay(_prAdaptiveThrottle.currentDelay).then(function() {
            return nextBatch();
          });
        });
      }

      /* Извлечь elapsed из batch-результата */
      var batchResult = (r.result && r.result.result) || {};
      var batchErrors = (r.result && r.result.result_error) || {};

      Object.keys(batchResult).forEach(function(key) {
        var items = batchResult[key];
        if (Array.isArray(items)) {
          allElapsed = allElapsed.concat(items);
        } else if (items && typeof items === 'object') {
          /* Альтернативный формат: объект вместо массива */
          allElapsed = allElapsed.concat(Object.values(items));
        }
      });

      /* Логируем ошибки отдельных команд в batch */
      Object.keys(batchErrors).forEach(function(key) {
        if (batchErrors[key]) {
          PR_DataLoadReport.warnings.push({
            source: 'elapsed_batch_cmd_' + key,
            message: 'Ошибка команды batch: ' + JSON.stringify(batchErrors[key])
          });
        }
      });

      PR_DataLoadReport.elapsedPages++;

      /* Phase 12: Adaptive throttle delay */
      return _prDelay(_prAdaptiveThrottle.currentDelay).then(function() {
        return nextBatch();
      });
    });
  }

  return nextBatch();
}

/**
 * Fallback: загрузить elapsed по одной задаче
 * Используется если batch API не работает
 * @param {Array<String>} taskIds
 * @returns {Promise<Array>}
 */
function _prLoadElapsedFallback(taskIds) {
  var proms = taskIds.map(function(tid) {
    return _prFetchAllPages('task.elapseditem.getlist', {
      TASK_ID: parseInt(tid)
    }, function(r) {
      if (r && r.result && Array.isArray(r.result)) return r.result;
      if (r && r.result && typeof r.result === 'object' && !Array.isArray(r.result)) {
        return Object.values(r.result);
      }
      return [];
    }, 'elapsed_task' + tid);
  });
  return Promise.all(proms).then(function(batches) {
    var all = [];
    batches.forEach(function(b) { if (Array.isArray(b)) all = all.concat(b); });
    return all;
  });
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DATA LOADER — Safe Fetch Pipeline
   ═══════════════════════════════════════════════════════════════ */

/**
 * Безопасная загрузка данных за период
   Пайплайн:
   LOAD TASKS → VERIFY → LOAD ELAPSED → VERIFY → BUILD RESULT

   Phase 4: PERIOD-CENTRIC — загрузка по периоду, не по задачам.
   Все данные за период загружаются полностью,
   отношения разработчик-задача строятся локально.

 * @param {Number} year
 * @param {Number} month
 * @param {Number} loadId — ID загрузки для защиты от race conditions
 * @returns {Promise<Object>} — данные периода
 */
function PR_SafeLoadPeriodData(year, month, loadId) {
  /* Обновить счётчик загрузок для race condition защиты */
  _prLoadCounter = loadId;

  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);

  /* Phase 12: Cancel pending requests from previous load */
  _prCancelPendingRequests();

  _prResetReport();
  PR_DataLoadReport.state = PR_LOAD_STATE.LOADING;
  PR_DataLoadReport.startedAt = Date.now();
  PR_DataLoadReport.source = 'live';
  /* Phase 1: Set datasetMeta fields */
  PR_DataLoadReport.datasetMeta.lastSyncStartedAt = Date.now();

  /* Phase 3: Step callback — loading tasks */
  if (typeof PR_onLoadStep === 'function') {
    PR_onLoadStep('tasks', 0, DEV_IDS.length);
  }

  /* ШАГ 1: Загрузить задачи для ВСЕХ разработчиков */
  PR_DataLoadReport.tasksRequested = DEV_IDS.length;

  var taskProms = DEV_IDS.map(function(devId, devIdx) {
    return _prLoadDevTasks(devId, fromStr, toStr).then(function(tasks) {
      /* Phase 3: Update progress */
      if (typeof PR_onLoadStep === 'function') {
        PR_onLoadStep('tasks', devIdx + 1, DEV_IDS.length);
      }
      return tasks;
    }).catch(function(e) {
      PR_DataLoadReport.errors.push({
        source: 'tasks_dev' + devId,
        error: e.message || String(e),
        fatal: false
      });
      return [];
    });
  });

  return Promise.all(taskProms).then(function(allTaskBatches) {
    /* ПРОВЕРКА: не устарела ли загрузка? */
    if (loadId !== _prLoadCounter) {
      PR_DataLoadReport.warnings.push({
        source: 'pipeline',
        message: 'Загрузка устарела (loadId=' + loadId + '), текущая=' + _prLoadCounter
      });
      return null;
    }

    /* Собираем уникальные задачи */
    var tasksMap = {};
    var allTasks = [];
    allTaskBatches.forEach(function(batch) {
      if (!Array.isArray(batch)) return;
      batch.forEach(function(t) {
        var id = String(t.id || t.ID);
        if (id && !tasksMap[id]) {
          tasksMap[id] = true;
          allTasks.push(t);
        }
      });
    });

    PR_DataLoadReport.tasksLoaded = allTasks.length;
    PR_DataLoadReport.datasetMeta.tasksSyncedCount = allTasks.length;
    PR_DataLoadReport.state = PR_LOAD_STATE.PARTIAL;

    /* Phase 3: Step callback — merging */
    if (typeof PR_onLoadStep === 'function') {
      PR_onLoadStep('merging', 1, 1);
    }

    /* ШАГ 2: Собрать ID задач */
    var taskIds = Object.keys(tasksMap);
    if (!taskIds.length) {
      PR_DataLoadReport.state = PR_LOAD_STATE.COMPLETE;
      PR_DataLoadReport.finishedAt = Date.now();
      PR_DataLoadReport.datasetMeta.lastSyncCompletedAt = Date.now();
      PR_DataLoadReport.datasetMeta.syncDurationMs = PR_DataLoadReport.finishedAt - PR_DataLoadReport.startedAt;
      PR_DataLoadReport.datasetMeta.completenessVerified = true;
      return _prBuildPeriodResult([], [], {}, {}, range, fromStr, toStr);
    }

    /* Phase 3: Step callback — loading elapsed */
    if (typeof PR_onLoadStep === 'function') {
      PR_onLoadStep('elapsed', 0, Math.ceil(taskIds.length / 50));
    }

    /* ШАГ 3: Загрузить elapsed — BATCH API по TASK_ID
       task.elapseditem.getlist ТРЕБУЕТ TASK_ID (без него ERROR_CORE).
       Используем batch API: группируем по 50 задач на запрос. */
    PR_DataLoadReport.elapsedRequested = taskIds.length;

    return _prLoadElapsedBatch(taskIds).then(function(allElapsed) {
      /* ПРОВЕРКА: не устарела ли загрузка? */
      if (loadId !== _prLoadCounter) {
        return null;
      }

      /* Phase 3: Step callback — integrity check */
      if (typeof PR_onLoadStep === 'function') {
        PR_onLoadStep('integrity', 0, 1);
      }

      /* Дедупликация elapsed */
      var seenElapsedIds = {};
      var dedupedElapsed = [];
      allElapsed.forEach(function(e) {
        var eid = String(e.ID || '');
        if (eid && seenElapsedIds[eid]) {
          PR_DataLoadReport.duplicateElapsedIds.push(eid);
          return;
        }
        if (eid) seenElapsedIds[eid] = true;
        dedupedElapsed.push(e);
      });
      allElapsed = dedupedElapsed;

      PR_DataLoadReport.elapsedLoaded = allElapsed.length;
      PR_DataLoadReport.datasetMeta.elapsedSyncedCount = allElapsed.length;

      /* ШАГ 4: Фильтр по периоду и разработчикам */
      allElapsed = allElapsed.filter(function(e) {
        var d = (e.CREATED_DATE || '').substring(0, 10);
        return d >= fromStr && d <= toStr &&
               DEV_IDS.indexOf(Number(e.USER_ID)) >= 0;
      });

      /* ШАГ 5: Собрать метаданные задач */
      var tasksMeta = {};
      var validTaskIds = {};
      allTasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        var gid = String(t.groupId || t.GROUP_ID || '0');
        var pname = (t.group && t.group.name) || '';
        if (!pname && typeof PROJECTS !== 'undefined') pname = PROJECTS[gid] || '';
        tasksMeta[id] = {
          groupId: gid,
          groupName: pname,
          title: t.title || t.TITLE || '',
          status: t.status || t.STATUS || '0',
          responsibleId: String(t.responsibleId || t.RESPONSIBLE_ID || '0')
        };
        if (typeof EXCLUDE_GROUPS !== 'undefined' && !EXCLUDE_GROUPS[gid]) {
          validTaskIds[id] = true;
        } else if (typeof EXCLUDE_GROUPS === 'undefined') {
          validTaskIds[id] = true;
        }
      });

      /* Фильтр elapsed по не-исключённым проектам */
      allElapsed = allElapsed.filter(function(e) {
        return validTaskIds[String(e.TASK_ID)];
      });

      /* ШАГ 6: Обнаружить orphan elapsed (elapsed без задачи) */
      allElapsed.forEach(function(e) {
        var tid = String(e.TASK_ID);
        if (!tasksMeta[tid]) {
          PR_DataLoadReport.orphanElapsedIds.push(e.ID || tid);
        }
      });

      /* Phase 3: Step callback — integrity complete */
      if (typeof PR_onLoadStep === 'function') {
        PR_onLoadStep('integrity', 1, 1);
      }

      /* ШАГ 7: Загрузить проекты */
      return _prSafeBxPost('sonet_group.get', {
        select: ['ID', 'NAME']
      }).then(function(r) {
        var projects = {};
        if (r && r.result) {
          var groups = r.result;
          if (!Array.isArray(groups)) groups = Object.values(groups);
          groups.forEach(function(g) {
            var id = String(g.ID || g.id);
            var nm = g.NAME || g.name || ('Группа ' + id);
            if (id && id !== '0') {
              if (typeof EXCLUDE_GROUPS === 'undefined' || !EXCLUDE_GROUPS[id]) {
                projects[id] = { id: id, name: nm };
              }
            }
          });
        }

        PR_DataLoadReport.state = PR_LOAD_STATE.COMPLETE;
        PR_DataLoadReport.finishedAt = Date.now();
        /* Phase 1: Set datasetMeta completion fields */
        PR_DataLoadReport.datasetMeta.lastSyncCompletedAt = Date.now();
        PR_DataLoadReport.datasetMeta.syncDurationMs = PR_DataLoadReport.finishedAt - PR_DataLoadReport.startedAt;
        /* Phase 1: Verify completeness — if total matches loaded */
        PR_DataLoadReport.datasetMeta.completenessVerified = (
          PR_DataLoadReport.failedRequests === 0 &&
          PR_DataLoadReport.errors.length === 0
        );

        /* Phase 5: Save sync cursor */
        PR_SyncCursor.lastTaskSync = Date.now();
        PR_SyncCursor.lastElapsedSync = Date.now();
        PR_SyncCursor.lastTaskCount = allTasks.length;
        PR_SyncCursor.lastElapsedCount = allElapsed.length;
        _prSaveSyncCursor(prGetPeriodKey(year, month), PR_SyncCursor);

        return _prBuildPeriodResult(allTasks, allElapsed, projects, tasksMeta, range, fromStr, toStr);
      });
    });
  }).catch(function(e) {
    PR_DataLoadReport.state = PR_LOAD_STATE.FAILED;
    PR_DataLoadReport.finishedAt = Date.now();
    PR_DataLoadReport.datasetMeta.syncDurationMs = PR_DataLoadReport.finishedAt - PR_DataLoadReport.startedAt;
    PR_DataLoadReport.errors.push({
      source: 'pipeline',
      error: e.message || String(e),
      fatal: true
    });
    throw e;
  });
}

/**
 * Собрать финальный объект данных периода
 * ВКЛЮЧАЕТ fromStr/toStr для нормализации!
 */
function _prBuildPeriodResult(allTasks, allElapsed, projects, tasksMeta, range, fromStr, toStr) {
  return {
    elapsed: allElapsed,
    tasks: allTasks,
    projects: projects,
    tasksMeta: tasksMeta,
    from: range.from,
    to: range.to,
    fromStr: fromStr,     /* КРИТИЧЕСКИ: для нормализации */
    toStr: toStr,         /* КРИТИЧЕСКИ: для нормализации */
    days: range.days
  };
}

/* ═══════════════════════════════════════════════════════════════
   Phase 5: SYNC CURSOR STORAGE
   ═══════════════════════════════════════════════════════════════ */
function _prSaveSyncCursor(periodKey, cursor) {
  try {
    if (typeof PayrollStorage !== 'undefined' && PayrollStorage.saveSyncCursor) {
      PayrollStorage.saveSyncCursor(periodKey, cursor);
    } else {
      localStorage.setItem('pr_sync_cursor_' + periodKey, JSON.stringify(cursor));
    }
  } catch(e) {}
}

function _prLoadSyncCursor(periodKey) {
  try {
    if (typeof PayrollStorage !== 'undefined' && PayrollStorage.loadSyncCursor) {
      return PayrollStorage.loadSyncCursor(periodKey);
    }
    var raw = localStorage.getItem('pr_sync_cursor_' + periodKey);
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   DATA CONSISTENCY CHECKS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Проверить целостность загруженных данных
 * @param {Object} data — результат загрузки
 * @returns {Object} { valid, errors, warnings }
 */
function PR_ValidateLoadedData(data) {
  var errors = [];
  var warnings = [];

  if (!data) {
    errors.push('Данные отсутствуют (null)');
    return { valid: false, errors: errors, warnings: warnings };
  }

  /* Проверка elapsed без задачи */
  if (data.elapsed && data.tasksMeta) {
    var taskIds = {};
    Object.keys(data.tasksMeta).forEach(function(tid) { taskIds[tid] = true; });
    data.elapsed.forEach(function(e) {
      var tid = String(e.TASK_ID);
      if (!taskIds[tid]) {
        warnings.push('Elapsed #' + (e.ID || '?') + ' ссылается на отсутствующую задачу #' + tid);
      }
    });
  }

  /* Проверка дубликатов elapsed */
  if (data.elapsed) {
    var seen = {};
    data.elapsed.forEach(function(e) {
      var id = String(e.ID || '');
      if (id && seen[id]) {
        errors.push('Дубликат elapsed ID: ' + id);
      }
      if (id) seen[id] = true;
    });
  }

  /* Проверка дубликатов задач */
  if (data.tasks) {
    var seenTasks = {};
    data.tasks.forEach(function(t) {
      var id = String(t.id || t.ID || '');
      if (id && seenTasks[id]) {
        warnings.push('Дубликат задачи ID: ' + id);
      }
      if (id) seenTasks[id] = true;
    });
  }

  /* Проверка fromStr/toStr */
  if (!data.fromStr || !data.toStr) {
    errors.push('Отсутствуют fromStr/toStr — нормализация не сможет фильтровать по периоду');
  }

  /* Проверка пустых данных */
  if (!data.elapsed || data.elapsed.length === 0) {
    warnings.push('Нет elapsed записей за период');
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: warnings
  };
}

/* ═══════════════════════════════════════════════════════════════
   DIAGNOSTIC MODE — window.__PAYROLL_DEBUG__
   ═══════════════════════════════════════════════════════════════ */

/**
 * Получить полный отчёт о состоянии загрузки
 * @returns {Object}
 */
function PR_GetDebugInfo() {
  var report = Object.assign({}, PR_DataLoadReport);
  report.loadCounter = _prLoadCounter;
  report.hook = (typeof HOOK !== 'undefined' && HOOK) ? HOOK.substring(0, 50) + '...' : 'не задан';
  report.mockMode = typeof PR_MOCK_MODE !== 'undefined' ? PR_MOCK_MODE : '?';
  report.period = typeof prCurrentPeriod !== 'undefined'
    ? prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0')
    : '?';
  report.devCount = typeof DEV_IDS !== 'undefined' ? DEV_IDS.length : 0;
  report.loaderConfig = Object.assign({}, PR_LOADER_CONFIG);
  report.adaptiveThrottle = Object.assign({}, _prAdaptiveThrottle);

  /* Phase 5: Sync cursor info */
  if (typeof prCurrentPeriod !== 'undefined') {
    var pk = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    report.syncCursor = _prLoadSyncCursor(pk);
  }

  /* Данные текущего рендера */
  if (typeof _pr !== 'undefined') {
    report.rowsCount = _pr.rows ? _pr.rows.length : 0;
    report.loadingState = _pr.loadState || 'unknown';
    report.dataElapsedCount = (_pr.data && _pr.data.elapsed) ? _pr.data.elapsed.length : 0;
    report.dataTasksCount = (_pr.data && _pr.data.tasks) ? _pr.data.tasks.length : 0;
    report.dataFromStr = (_pr.data && _pr.data.fromStr) || 'MISSING';
    report.dataToStr = (_pr.data && _pr.data.toStr) || 'MISSING';
  }

  return report;
}

/* Инициализация глобального debug объекта */
window.__PAYROLL_DEBUG = PR_GetDebugInfo;

/* ═══════════════════════════════════════════════════════════════
   UTILITY — задержка (promisified setTimeout)
   ═══════════════════════════════════════════════════════════════ */
function _prDelay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}
