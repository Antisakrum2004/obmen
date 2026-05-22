/* ═══════════════════════════════════════════════════════════════
   data-loader.js — Загрузчик данных из Bitrix24 (v7.2.0)

   ═══ ELAPSED-FIRST DAY-BY-DAY PIPELINE ═══

   АРХИТЕКТУРНЫЙ СДВИГ v7.2.0:

   ПРОБЛЕМА v7.1.0:
     RESPONSIBLE_ID + DATE_ACTIVITY фильтр на tasks.task.list
     → Терялись задачи где разработчик ACCOMPLICE
     → Терялись задачи с May elapsed но старой DATE_ACTIVITY
     → 711:39 часов вместо полного объёма

   РЕШЕНИЕ v7.2.0 (по мотивам bitrix-dashboard reference):
     Идём ОТ ОБРАТНОГО — сначала ВСЕ записи времени за месяц,
     потом подтягиваем метаданные задач.

     1. task.elapseditem.getlist с DATE фильтром ДЕНЬ ЗА ДНЁМ
        Формат: [0, {}, {>=CREATED_DATE, <=CREATED_DATE}, select]
        31 параллельный вызов — по одному на каждый день месяца
     2. Фильтруем elapsed по USER_ID наших разработчиков
     3. Извлекаем уникальные TASK_ID
     4. Загружаем метаданные задач batch-запросами (по 50 ID)
     5. Загружаем проекты (sonet_group.get)

   ПОЧЕМУ ЭТО РАБОТАЕТ:
     - elapsed записи — источник истины для зарплатного обзора
     - Если есть elapsed за май — задача ТОЧНО была в мае
     - Не зависит от RESPONSIBLE_ID / ACCOMPLICE
     - Не зависит от DATE_ACTIVITY (ненадёжный фильтр)
     - Гарантированно находим ВСЕ часы за период

   МАСШТАБ:
     31 API call для elapsed (1 на день)
     + 2-5 API calls для метаданных задач (batch по 50)
     + 1 API call для проектов
     = ~35 API calls total
     Ожидаемый результат: ПОЛНЫЕ данные за месяц

   FALLBACK:
     Если task.elapseditem.getlist с датой не работает (ошибка API),
     переключаемся на DAY-BY-DAY TASKS-FIRST:
     tasks.task.list с CREATED_DATE фильтром по дням (без RESPONSIBLE_ID)
     + per-task elapsed как в v7.1.0

   КРИТИЧЕСКИЕ ПРАВИЛА:
   - Таймаут 10с на каждый запрос
   - Если часть упала — продолжать с тем что есть
   - КЭШ: TTL 5 мин, PayrollCache
   - Максимум 3 страницы на день для elapsed (150 записей/день)

   ═══════════════════════════════════════════════════════════════ */

/* ─── Мьютекс и generation ─── */
var _dlLoadGeneration = 0;

/* ─── Hard limits ─── */
var _DL_REQUEST_TIMEOUT = 10000;
var _DL_MAX_PAGES_PER_DAY = 3;   /* Макс страниц на день для elapsed */
var _DL_PAGE_SIZE = 50;           /* Bitrix24 default page size */

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
  /* Формат ответа может быть разный */
  if (Array.isArray(r.result)) return r.result;
  if (r.result.result && Array.isArray(r.result.result)) return r.result.result;
  if (r.result.items && Array.isArray(r.result.items)) return r.result.items;
  /* Ответ с пагинацией: result = массив, next = offset */
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
   ШАГ 1: ELAPSED-FIRST DAY-BY-DAY

   Для каждого дня месяца вызываем:
     task.elapseditem.getlist([
       0,  // без привязки к конкретной задаче
       {}, // без сортировки
       {'>=CREATED_DATE': dayStr, '<=CREATED_DATE': dayStr + ' 23:59:59'},
       ['ID','TASK_ID','USER_ID','MINUTES','SECONDS','CREATED_DATE','COMMENT_TEXT']
     ])

   Если API не поддерживает этот формат (возвращает ошибку),
   устанавливаем флаг _elapsedDateApiWorks = false и
   переключаемся на FALLBACK (tasks-first day-by-day).

   31 запрос параллельно, каждый с пагинацией до 3 страниц.
   ═══════════════════════════════════════════════════════════════ */
var _elapsedDateApiWorks = null; /* null = не проверено, true/false */

function _prLoadElapsedDayByDay(year, month, devIdSet) {
  var range = prGetMonthRange(year, month);
  var daysInMonth = range.days;
  var allElapsed = [];
  var seenIds = {};
  var totalApiCalls = 0;
  var totalErrors = 0;
  var totalTimeouts = 0;
  var totalDaysWithData = 0;

  console.log('[DL] ELAPSED-FIRST DAY-BY-DAY: ' + daysInMonth + ' дней, ' +
    Object.keys(devIdSet).length + ' разработчиков');

  /* Генерируем даты */
  var dates = [];
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    dates.push(ds);
  }

  /* Для каждого дня — загружаем elapsed с пагинацией */
  var dayPromises = dates.map(function(ds) {
    var dayElapsed = [];
    var start = 0;

    function loadPage(pageNum) {
      if (pageNum > _DL_MAX_PAGES_PER_DAY) return dayElapsed;

      totalApiCalls++;
      return _dlBxPost('task.elapseditem.getlist', [
        0,  /* без привязки к задаче — все записи за день */
        {}, /* order */
        {
          '>=CREATED_DATE': ds,
          '<=CREATED_DATE': ds + ' 23:59:59'
        },
        ['ID', 'TASK_ID', 'USER_ID', 'MINUTES', 'SECONDS', 'CREATED_DATE', 'COMMENT_TEXT']
      ]).then(function(r) {
        if (r && r._timeout) {
          totalTimeouts++;
          return dayElapsed;
        }
        if (r && r.error) {
          totalErrors++;
          /* Если ошибка — помечаем что API не поддерживает этот формат */
          if (_elapsedDateApiWorks === null) {
            console.log('[DL] ELAPSED DATE API вернул ошибку: ' + JSON.stringify(r.error));
            _elapsedDateApiWorks = false;
          }
          return dayElapsed;
        }

        /* API работает! */
        if (_elapsedDateApiWorks === null) {
          _elapsedDateApiWorks = true;
          console.log('[DL] ELAPSED DATE API РАБОТАЕТ!');
        }

        var items = _dlParseElapsedItems(r);
        if (items.length > 0) {
          totalDaysWithData++;
          items.forEach(function(e) {
            dayElapsed.push(e);
          });
        }

        /* Проверяем пагинацию */
        var nextOffset = (r && r.next) ? r.next : null;
        var hasMore = items.length >= _DL_PAGE_SIZE && nextOffset !== null;
        if (hasMore && pageNum < _DL_MAX_PAGES_PER_DAY) {
          /* Загружаем следующую страницу */
          return loadPage(pageNum + 1);
        }
        return dayElapsed;
      }).catch(function(e) {
        totalErrors++;
        return dayElapsed;
      });
    }

    return loadPage(1);
  });

  return Promise.all(dayPromises).then(function(dayResults) {
    /* Собираем все записи, дедуплицируем, фильтруем по разработчикам */
    dayResults.forEach(function(dayItems) {
      if (!Array.isArray(dayItems)) return;
      dayItems.forEach(function(e) {
        var eid = String(e.ID || '');
        /* Фильтруем по нашим разработчикам */
        if (!devIdSet[String(e.USER_ID)]) return;
        if (eid && !seenIds[eid]) {
          seenIds[eid] = true;
          allElapsed.push(e);
        }
      });
    });

    /* Пересчитываем уникальные дни с данными */
    var uniqueDaysWith = {};
    allElapsed.forEach(function(e) {
      var dayStr = (e.CREATED_DATE || '').substring(0, 10);
      uniqueDaysWith[dayStr] = true;
    });

    console.log('[DL] ELAPSED DAY-BY-DAY завершён: ' +
      allElapsed.length + ' записей за ' + Object.keys(uniqueDaysWith).length + ' дней' +
      ', API calls=' + totalApiCalls +
      ', ошибок=' + totalErrors + ', таймаутов=' + totalTimeouts);

    return {
      elapsed: allElapsed,
      apiWorks: _elapsedDateApiWorks === true,
      apiCalls: totalApiCalls,
      errors: totalErrors,
      timeouts: totalTimeouts
    };
  });
}

/* ═══════════════════════════════════════════════════════════════
   FALLBACK: TASKS-FIRST DAY-BY-DAY

   Если task.elapseditem.getlist с датой не работает,
   используем улучшенный tasks-first подход:
   - Для каждого дня: tasks.task.list с CREATED_DATE (без RESPONSIBLE_ID!)
   - Per-task elapsed как в v7.1.0

   КЛЮЧЕВОЕ ОТЛИЧИЕ от v7.1.0:
   - Нет фильтра RESPONSIBLE_ID — загружаем ВСЕ задачи за день
   - Фильтр по CREATED_DATE вместо DATE_ACTIVITY
   - Пагинация по 1 странице (50 задач/день по условию)
   ═══════════════════════════════════════════════════════════════ */
function _prLoadTasksDayByDay(year, month, devIdSet) {
  var range = prGetMonthRange(year, month);
  var daysInMonth = range.days;
  var allTasks = [];
  var seenIds = {};

  console.log('[DL] FALLBACK TASKS-FIRST DAY-BY-DAY: ' + daysInMonth + ' дней');

  var dates = [];
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    dates.push(ds);
  }

  /* Для каждого дня загружаем задачи по CREATED_DATE */
  var dayPromises = dates.map(function(ds) {
    return _dlWithTimeout(
      fetchTasksPaginated({
        filter: {
          '>=CREATED_DATE': ds,
          '<=CREATED_DATE': ds + ' 23:59:59'
        },
        select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','DATE_ACTIVITY'],
        order: {ID: 'DESC'}
      }, 1), /* 1 страница = 50 задач на день (по условию) */
      10000
    );
  });

  return Promise.all(dayPromises).then(function(results) {
    results.forEach(function(tasks) {
      if (!tasks || tasks._timeout) return;
      var arr = Array.isArray(tasks) ? tasks : [];
      arr.forEach(function(t) {
        var id = String(t.id || t.ID);
        if (!seenIds[id]) {
          seenIds[id] = true;
          allTasks.push(t);
        }
      });
    });

    console.log('[DL] DAY-BY-DAY задач: ' + allTasks.length + ' (дедуплицировано)');

    /* Per-task elapsed — параллельно чанками */
    var taskIds = allTasks.map(function(t) { return String(t.id || t.ID); });
    return _prLoadElapsedConcurrent(taskIds).then(function(allElapsed) {
      /* Фильтруем elapsed по нашим разработчикам и месяцу */
      var fromStr = fmt(range.from);
      var toStr = fmt(range.to);
      allElapsed = allElapsed.filter(function(e) {
        var d = (e.CREATED_DATE || '').substring(0, 10);
        if (d < fromStr || d > toStr) return false;
        return devIdSet[String(e.USER_ID)];
      });

      return { tasks: allTasks, elapsed: allElapsed };
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Параллельная загрузка elapsed через per-task POST (FALLBACK)

   Используется только в tasks-first fallback.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadElapsedConcurrent(taskIds) {
  var allElapsed = [];
  var seenIds = {};
  var totalChecked = 0;
  var totalWithItems = 0;
  var totalErrors = 0;
  var totalTimeouts = 0;
  var CONCURRENT = 10;
  var CHUNK_DELAY = 100;

  var chunks = [];
  for (var i = 0; i < taskIds.length; i += CONCURRENT) {
    chunks.push(taskIds.slice(i, i + CONCURRENT));
  }

  console.log('[DL] Per-task elapsed: ' + taskIds.length +
    ' задач, ' + chunks.length + ' чанков');

  var chain = Promise.resolve();
  chunks.forEach(function(chunk, chunkIdx) {
    chain = chain.then(function() {
      if (chunkIdx > 0) return _dlDelay(CHUNK_DELAY);
    }).then(function() {
      return Promise.all(chunk.map(function(tid) {
        return _dlBxPost('task.elapseditem.getlist', [parseInt(tid) || 0, {ID: 'DESC'}, {}]).then(function(r) {
          totalChecked++;
          if (r && r._timeout) { totalTimeouts++; return []; }
          var items = _dlParseElapsedItems(r);
          if (items.length > 0) totalWithItems++;
          return items;
        }).catch(function() { totalChecked++; totalErrors++; return []; });
      }));
    }).then(function(results) {
      if (!results) return;
      results.forEach(function(items) {
        if (!items || !items.length) return;
        items.forEach(function(e) {
          var eid = String(e.ID || '');
          if (eid && !seenIds[eid]) { seenIds[eid] = true; allElapsed.push(e); }
        });
      });
    });
  });

  return chain.then(function() {
    console.log('[DL] Per-task elapsed завершён: ' +
      totalChecked + ' проверено, ' + totalWithItems + ' с данными, ' +
      allElapsed.length + ' записей');
    return allElapsed;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка метаданных задач по ID (batch по 50)

   После получения elapsed records извлекаем TASK_ID
   и загружаем заголовки/группы/статусы задач.
   ═══════════════════════════════════════════════════════════════ */
function _prLoadTaskMetadata(taskIds) {
  if (!taskIds.length) return Promise.resolve({});

  var tasksMeta = {};
  var batches = [];
  for (var i = 0; i < taskIds.length; i += 50) {
    batches.push(taskIds.slice(i, i + 50));
  }

  console.log('[DL] Загрузка метаданных: ' + taskIds.length +
    ' задач, ' + batches.length + ' батчей');

  var batchProms = batches.map(function(batch, idx) {
    return _dlDelay(idx * 150).then(function() {
      return _dlBxPost('tasks.task.list', {
        filter: { ID: batch },
        select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID','CREATED_DATE','DATE_ACTIVITY']
      });
    }).then(function(r) {
      if (!r || r.error || !r.result) return;
      var tasks = r.result.tasks || r.result || [];
      if (!Array.isArray(tasks)) tasks = [];
      tasks.forEach(function(t) {
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
    }).catch(function() {});
  });

  return Promise.all(batchProms).then(function() {
    console.log('[DL] Метаданные загружены: ' + Object.keys(tasksMeta).length + ' задач');
    return tasksMeta;
  });
}

/* ═══════════════════════════════════════════════════════════════
   Загрузка потерянных задач (orphan — есть elapsed, но нет метаданных)
   ═══════════════════════════════════════════════════════════════ */
function _prLoadOrphanTasks(orphanTaskIds, tasksMeta) {
  if (!orphanTaskIds.length) return Promise.resolve();

  var unique = [];
  var seen = {};
  orphanTaskIds.forEach(function(tid) {
    if (!seen[tid]) { seen[tid] = true; unique.push(tid); }
  });

  if (unique.length > 100) {
    console.log('[DL] Много потерянных задач: ' + unique.length + ', обрезаем до 100');
    unique = unique.slice(0, 100);
  }

  console.log('[DL] Потерянные задачи: ' + unique.length);

  var batches = [];
  for (var i = 0; i < unique.length; i += 50) {
    batches.push(unique.slice(i, i + 50));
  }

  var batchProms = batches.map(function(batch) {
    return _dlBxPost('tasks.task.list', {
      filter: { ID: batch },
      select: ['ID','TITLE','GROUP_ID','STATUS','RESPONSIBLE_ID']
    }).then(function(r) {
      if (!r || r.error || !r.result) return;
      var tasks = r.result.tasks || r.result || [];
      if (!Array.isArray(tasks)) tasks = [];
      tasks.forEach(function(t) {
        var id = String(t.id || t.ID);
        var gid = String(t.groupId || t.GROUP_ID || (t.group && t.group.id) || '0');
        var pname = (t.group && t.group.name) || PROJECTS[gid] || '';
        if (tasksMeta[id]) {
          tasksMeta[id].groupId = gid || tasksMeta[id].groupId;
          if (pname) tasksMeta[id].groupName = pname;
          if (t.title || t.TITLE) tasksMeta[id].title = t.title || t.TITLE;
          tasksMeta[id].status = t.status || t.STATUS || tasksMeta[id].status;
          tasksMeta[id].responsibleId = String(t.responsibleId || t.RESPONSIBLE_ID || tasksMeta[id].responsibleId);
        } else {
          tasksMeta[id] = {
            groupId: gid,
            groupName: pname,
            title: t.title || t.TITLE || 'Задача #' + id,
            status: t.status || t.STATUS || '0',
            responsibleId: String(t.responsibleId || t.RESPONSIBLE_ID || '0')
          };
        }
      });
    }).catch(function() {});
  });

  return Promise.all(batchProms);
}

/* ═══════════════════════════════════════════════════════════════
   Главная функция загрузки реальных данных

   ELAPSED-FIRST DAY-BY-DAY PIPELINE v7.2.0:
   1. task.elapseditem.getlist с DATE фильтром по дням
   2. Фильтрация по нашим разработчикам
   3. Загрузка метаданных задач (batch)
   4. Загрузка потерянных задач (orphan)
   5. Загрузка проектов + финальная сборка

   FALLBACK:
   Если elapsed date API не работает — tasks-first day-by-day
   ═══════════════════════════════════════════════════════════════ */
function PR_loadRealData(year, month, progressCb) {
  var gen = ++_dlLoadGeneration;
  var range = prGetMonthRange(year, month);
  var fromStr = fmt(range.from);
  var toStr = fmt(range.to);
  var devIds = ACTIVE_DEV_IDS;

  var devIdSet = {};
  devIds.forEach(function(id) { devIdSet[String(id)] = true; });

  /* Метрики */
  var metrics = {
    pipelineVersion: '7.2.0',
    pipelineMode: 'elapsed-first',  /* или 'tasks-first-fallback' */
    periodKey: prGetPeriodKey(year, month),
    loadStartMs: Date.now(),
    loadEndMs: 0,
    elapsedRecords: 0,
    uniqueTasks: 0,
    orphanTasks: 0,
    apiCalls: 0,
    errors: 0,
    timeouts: 0
  };

  console.log('[DL] ═══ PR_loadRealData v7.2.0 (gen=' + gen + ') ═══');
  console.log('[DL] Период: ' + fromStr + ' — ' + toStr);
  console.log('[DL] Разработчиков: ' + devIds.length);
  console.log('[DL] Pipeline: ELAPSED-FIRST DAY-BY-DAY');

  if (progressCb) progressCb('Загрузка elapsed', fromStr + ' — ' + toStr);

  /* ═══ Шаг 1: ELAPSED-FIRST DAY-BY-DAY ═══ */
  return _prLoadElapsedDayByDay(year, month, devIdSet).then(function(elapsedResult) {
    /* Проверка поколения */
    if (gen !== _dlLoadGeneration) {
      console.log('[DL] Отмена загрузки gen=' + gen);
      return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days, _metrics: metrics };
    }

    var allElapsed = elapsedResult.elapsed;
    metrics.apiCalls = elapsedResult.apiCalls;
    metrics.errors = elapsedResult.errors;
    metrics.timeouts = elapsedResult.timeouts;
    metrics.elapsedRecords = allElapsed.length;

    /* ═══ Проверяем: работает ли elapsed date API ═══ */
    if (!elapsedResult.apiWorks || allElapsed.length === 0) {
      console.log('[DL] ELAPSED DATE API не работает или вернул 0 записей.');
      console.log('[DL] Переключаемся на FALLBACK: TASKS-FIRST DAY-BY-DAY');
      metrics.pipelineMode = 'tasks-first-fallback';

      if (progressCb) progressCb('Fallback: загрузка задач по дням', '');

      return _prLoadTasksDayByDay(year, month, devIdSet).then(function(fallbackResult) {
        if (gen !== _dlLoadGeneration) {
          return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days, _metrics: metrics };
        }

        allElapsed = fallbackResult.elapsed;
        var allTasks = fallbackResult.tasks;
        metrics.elapsedRecords = allElapsed.length;

        /* Строим tasksMeta из загруженных задач */
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

        /* Orphan tasks — elapsed есть, но задачи нет в allTasks */
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
        metrics.orphanTasks = orphanTaskIds.length;

        metrics.uniqueTasks = Object.keys(tasksMeta).length;

        if (progressCb) progressCb('Финализация', allElapsed.length + ' elapsed');

        return _prLoadOrphanTasks(orphanTaskIds, tasksMeta).then(function() {
          return _prLoadProjectsAndFinish(allElapsed, allTasks, tasksMeta, range, metrics);
        });
      });
    }

    /* ═══ ELAPSED-FIRST путь (API работает!) ═══ */
    console.log('[DL] ELAPSED-FIRST: ' + allElapsed.length + ' записей получено');

    if (progressCb) progressCb('Elapsed загружен', allElapsed.length + ' записей');

    /* Диагностика */
    if (allElapsed.length > 0) {
      var uidStats = {};
      var dateStats = {};
      allElapsed.forEach(function(e) {
        var uid = String(e.USER_ID || '?');
        uidStats[uid] = (uidStats[uid] || 0) + 1;
        var d = (e.CREATED_DATE || '').substring(0, 10);
        dateStats[d] = (dateStats[d] || 0) + 1;
      });
      console.log('[DL] USER_ID distribution: ' + JSON.stringify(uidStats));
      console.log('[DL] DATE distribution: ' + JSON.stringify(dateStats));
    }

    /* ═══ Шаг 2: Извлечь уникальные TASK_ID ═══ */
    var taskIds = [];
    var taskIdSeen = {};
    allElapsed.forEach(function(e) {
      var tid = String(e.TASK_ID || '');
      if (tid && !taskIdSeen[tid]) {
        taskIdSeen[tid] = true;
        taskIds.push(tid);
      }
    });

    console.log('[DL] Уникальных задач из elapsed: ' + taskIds.length);

    if (progressCb) progressCb('Загрузка метаданных', taskIds.length + ' задач');

    /* ═══ Шаг 3: Загрузить метаданные задач batch ═══ */
    return _prLoadTaskMetadata(taskIds).then(function(tasksMeta) {
      if (gen !== _dlLoadGeneration) {
        return { elapsed: [], tasks: [], projects: {}, tasksMeta: {}, from: range.from, to: range.to, days: range.days, _metrics: metrics };
      }

      /* Orphan tasks — elapsed есть, но метаданных нет */
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
      metrics.orphanTasks = orphanTaskIds.length;
      metrics.uniqueTasks = Object.keys(tasksMeta).length;

      if (progressCb) progressCb('Финализация', allElapsed.length + ' elapsed');

      /* ═══ Шаг 4: Загрузить orphan + проекты ═══ */
      /* Строим allTasks из метаданных для совместимости */
      var allTasks = [];
      Object.keys(tasksMeta).forEach(function(tid) {
        var meta = tasksMeta[tid];
        allTasks.push({
          id: tid,
          title: meta.title,
          groupId: meta.groupId,
          status: meta.status,
          responsibleId: meta.responsibleId
        });
      });

      return _prLoadOrphanTasks(orphanTaskIds, tasksMeta).then(function() {
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

    /* Обновляем groupName из проектов */
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

    /* Диагностика по каждому разработчику */
    var devMinutes = {};
    var devTaskCount = {};
    var devIdSet = {};
    ACTIVE_DEV_IDS.forEach(function(id) { devIdSet[String(id)] = true; });

    allElapsed.forEach(function(e) {
      var uid = String(e.USER_ID);
      if (!devIdSet[uid]) return;
      var mins = parseInt(e.MINUTES || Math.floor(parseInt(e.SECONDS || '0', 10) / 60), 10);
      devMinutes[uid] = (devMinutes[uid] || 0) + mins;
      var tid = String(e.TASK_ID);
      if (!devTaskCount[uid]) devTaskCount[uid] = {};
      devTaskCount[uid][tid] = true;
    });

    console.log('[DL] ═══ Загрузка завершена ═══');
    console.log('[DL] Pipeline: ' + metrics.pipelineMode);
    console.log('[DL] Результат: ' + allElapsed.length + ' elapsed, ' +
      Object.keys(tasksMeta).length + ' задач, ' +
      Object.keys(projects).length + ' проектов');
    console.log('[DL] Время загрузки: ' + loadTimeSec + 'с');
    console.log('[DL] API calls: ' + metrics.apiCalls + ', ошибок: ' + metrics.errors);

    ACTIVE_DEV_IDS.forEach(function(id) {
      var uid = String(id);
      var mins = devMinutes[uid] || 0;
      var tasks = devTaskCount[uid] ? Object.keys(devTaskCount[uid]).length : 0;
      console.log('[DL]   ' + (DEVELOPERS[uid] || uid) + ': ' + mhm(mins) + ' ч, ' + tasks + ' задач');
    });

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
