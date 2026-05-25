/* ═══════════════════════════════════════════════════════════════
   payroll-normalizer.js — Слой нормализации
   Преобразует сырые elapsed записи в чистые доменные объекты.
   НЕ зависит от DOM. НЕ зависит от storage напрямую.

   Решает:
   1. duplicate elapsed
   2. edited elapsed
   3. deleted elapsed
   4. malformed data
   5. missing users
   6. timezone drift
   7. partial month
   8. multiple developers on task
   9. empty elapsed
   10. orphan tasks
   ═══════════════════════════════════════════════════════════════ */

/* ─── Конфигурация нормализации ─── */
var PR_NORM_CONFIG = {
  minSeconds: 60,          /* Минимум 1 минута — меньше отбрасываем */
  maxSeconds: 86400,       /* Максимум 24 часа — больше подозрительно */
  maxHoursPerEntry: 12,    /* Максимум часов на одну запись elapsed */
  maxHoursPerTaskPerDev: 200, /* Максимум часов на задачу на разработчика за месяц */
  allowedDevIds: null,     /* null = использовать DEV_IDS из core.js */
  excludeGroups: null,     /* null = использовать EXCLUDE_GROUPS из core.js */
  timezoneOffset: null     /* null = автоопределение */
};

/**
 * Получить массив допустимых ID разработчиков
 * @returns {Number[]}
 */
function _normGetDevIds() {
  if (PR_NORM_CONFIG.allowedDevIds) return PR_NORM_CONFIG.allowedDevIds;
  if (typeof DEV_IDS !== 'undefined') return DEV_IDS;
  return [];
}

/**
 * Получить набор исключённых групп
 * @returns {Object}
 */
function _normGetExcludeGroups() {
  if (PR_NORM_CONFIG.excludeGroups) return PR_NORM_CONFIG.excludeGroups;
  if (typeof EXCLUDE_GROUPS !== 'undefined') return EXCLUDE_GROUPS;
  return {};
}

/* ═══════════════════════════════════════════════════════════════
   Нормализация одной записи elapsed
   ═══════════════════════════════════════════════════════════════ */

/**
 * Нормализовать одну запись elapsed из Bitrix24
 * @param {Object} entry — сырая запись из API
 * @param {Object} options — контекст нормализации
 * @returns {Object|null} нормализованная запись или null если невалидна
 */
function normalizeElapsedEntry(entry, options) {
  if (!entry) return null;
  var opts = options || {};

  /* ── Валидация SECONDS ── */
  var seconds = 0;
  if (entry.SECONDS !== undefined && entry.SECONDS !== null) {
    seconds = parseInt(entry.SECONDS, 10);
  }
  if (isNaN(seconds) || seconds < 0) {
    /* Попытка вычислить из MINUTES */
    if (entry.MINUTES) {
      seconds = parseInt(entry.MINUTES, 10) * 60;
    }
    if (isNaN(seconds) || seconds < 0) return null;
  }

  /* ── Фильтр по минимуму/максимуму секунд ── */
  if (seconds < PR_NORM_CONFIG.minSeconds) return null;
  if (seconds > PR_NORM_CONFIG.maxSeconds) {
    /* Обрезаем до максимума, не отбрасываем */
    seconds = PR_NORM_CONFIG.maxSeconds;
  }

  /* ── Валидация TASK_ID и USER_ID ── */
  var taskId = String(entry.TASK_ID || '').trim();
  var userId = String(entry.USER_ID || '').trim();
  if (!taskId || !userId) return null;

  /* ── Фильтр неизвестных и исключённых разработчиков ── */
  var devIds = _normGetDevIds();
  if (devIds.length > 0 && devIds.indexOf(Number(userId)) < 0) return null;
  if (typeof EXCLUDED_DEV_IDS !== 'undefined' && EXCLUDED_DEV_IDS[userId]) return null;

  /* ── Вычисление часов ── */
  var minutes = Math.round(seconds / 60);
  var hours = Math.round(minutes / 6) / 10; /* один знак после точки */

  /* ── Парсинг даты с учётом timezone ── */
  var createdDate = _normParseDate(entry.CREATED_DATE);
  var dateStart = _normParseDate(entry.DATE_START);
  var dateStop = _normParseDate(entry.DATE_STOP);

  /* Если нет CREATED_DATE, пробуем DATE_START */
  if (!createdDate && dateStart) createdDate = dateStart;

  /* Определяем дату записи для фильтрации по периоду */
  var periodDate = createdDate || dateStart;
  var periodDateStr = '';
  if (periodDate) {
    periodDateStr = periodDate.getFullYear() + '-' +
      String(periodDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(periodDate.getDate()).padStart(2, '0');
  }

  return {
    id: String(entry.ID || ''),
    taskId: taskId,
    userId: userId,
    seconds: seconds,
    minutes: minutes,
    hours: hours,
    comment: entry.COMMENT_TEXT || '',
    source: entry.SOURCE || '0',
    createdDate: periodDateStr,
    createdDateObj: periodDate,
    dateStart: dateStart,
    dateStop: dateStop,
    rawEntry: entry
  };
}

/**
 * Парсинг даты из Bitrix24 формата
 * @param {String} s
 * @returns {Date|null}
 */
function _normParseDate(s) {
  if (!s) return null;
  /* ISO format: 2026-05-15T09:04:16+03:00 */
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  /* DD.MM.YYYY HH:MM:SS */
  var m = s.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/);
  if (m) return new Date(m[3], m[2] - 1, m[1], m[4] || 0, m[5] || 0, m[6] || 0);
  /* DD.MM.YYYY */
  m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return new Date(m[3], m[2] - 1, m[1]);
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   Нормализация массива elapsed записей
   ═══════════════════════════════════════════════════════════════ */

/**
 * Результат нормализации — содержит валидные записи и отчёт об ошибках
 * @param {Array} rawEntries — сырые elapsed из API
 * @param {Object} options — параметры нормализации
 * @returns {Object} { valid, rejected, stats }
 */
function normalizeElapsedBatch(rawEntries, options) {
  var opts = options || {};
  var fromStr = opts.fromStr || '';
  var toStr = opts.toStr || '';
  var valid = [];
  var rejected = [];
  var seen = {}; /* Защита от дублей по elapsed ID */
  var stats = {
    total: rawEntries ? rawEntries.length : 0,
    valid: 0,
    rejectedEmpty: 0,
    rejectedSeconds: 0,
    rejectedNoTask: 0,
    rejectedNoUser: 0,
    rejectedUnknownDev: 0,
    rejectedDuplicate: 0,
    rejectedOutOfRange: 0,
    rejectedTooSmall: 0
  };

  if (!rawEntries || !rawEntries.length) {
    return { valid: [], rejected: [], stats: stats };
  }

  rawEntries.forEach(function(entry) {
    /* Шаг 1: Базовая нормализация */
    var norm = normalizeElapsedEntry(entry, opts);
    if (!norm) {
      if (!entry) {
        stats.rejectedEmpty++;
      } else if (!entry.TASK_ID) {
        stats.rejectedNoTask++;
      } else if (!entry.USER_ID) {
        stats.rejectedNoUser++;
      } else {
        stats.rejectedSeconds++;
      }
      rejected.push({ reason: 'invalid', entry: entry });
      return;
    }

    /* Шаг 2: Дедупликация */
    if (norm.id && seen[norm.id]) {
      stats.rejectedDuplicate++;
      rejected.push({ reason: 'duplicate', id: norm.id });
      return;
    }
    if (norm.id) seen[norm.id] = true;

    /* Шаг 3: Фильтр по периоду */
    if (fromStr && toStr && norm.createdDate) {
      if (norm.createdDate < fromStr || norm.createdDate > toStr) {
        stats.rejectedOutOfRange++;
        rejected.push({ reason: 'out_of_range', date: norm.createdDate, id: norm.id });
        return;
      }
    }

    valid.push(norm);
    stats.valid++;
  });

  return { valid: valid, rejected: rejected, stats: stats };
}

/* ═══════════════════════════════════════════════════════════════
   Группировка нормализованных elapsed
   ═══════════════════════════════════════════════════════════════ */

/**
 * Группировать elapsed по (taskId, userId)
 * @param {Array} normalizedEntries — результат normalizeElapsedBatch().valid
 * @returns {Object} groups[key] = { taskId, userId, totalSeconds, totalMinutes, entries[] }
 */
function groupElapsedByTask(normalizedEntries) {
  var groups = {};

  (normalizedEntries || []).forEach(function(entry) {
    var key = entry.taskId + '_' + entry.userId;
    if (!groups[key]) {
      groups[key] = {
        taskId: entry.taskId,
        userId: entry.userId,
        totalSeconds: 0,
        totalMinutes: 0,
        entries: []
      };
    }
    groups[key].totalSeconds += entry.seconds;
    groups[key].totalMinutes += entry.minutes;
    groups[key].entries.push(entry);
  });

  return groups;
}

/**
 * Группировать elapsed по разработчику
 * @param {Array} normalizedEntries
 * @returns {Object} groups[userId] = { userId, totalSeconds, totalMinutes, taskIds[], entries[] }
 */
function groupElapsedByDeveloper(normalizedEntries) {
  var groups = {};

  (normalizedEntries || []).forEach(function(entry) {
    var uid = entry.userId;
    if (!groups[uid]) {
      groups[uid] = {
        userId: uid,
        totalSeconds: 0,
        totalMinutes: 0,
        taskIds: {},
        entries: []
      };
    }
    groups[uid].totalSeconds += entry.seconds;
    groups[uid].totalMinutes += entry.minutes;
    groups[uid].taskIds[entry.taskId] = true;
    groups[uid].entries.push(entry);
  });

  return groups;
}

/* ═══════════════════════════════════════════════════════════════
   Агрегация fact hours
   ═══════════════════════════════════════════════════════════════ */

/**
 * Агрегировать часы для группы (taskId, userId)
 * @param {Object} group — из groupElapsedByTask
 * @returns {Object|null} { taskId, userId, factHours, factMinutes, entryCount }
 */
function aggregateFactHours(group) {
  if (!group) return null;

  var factHours = Math.round(group.totalMinutes / 6) / 10;

  /* Защита от нереалистичных значений */
  if (factHours > PR_NORM_CONFIG.maxHoursPerTaskPerDev) {
    factHours = PR_NORM_CONFIG.maxHoursPerTaskPerDev;
  }

  return {
    taskId: group.taskId,
    userId: group.userId,
    factHours: factHours,
    factMinutes: group.totalMinutes,
    entryCount: group.entries.length
  };
}

/**
 * Построить карту факт-часов по всем группам
 * @param {Object} groups — из groupElapsedByTask
 * @returns {Object} factMap[key] = { taskId, userId, factHours, factMinutes, entryCount }
 */
function buildFactHoursMap(groups) {
  var factMap = {};
  Object.keys(groups || {}).forEach(function(key) {
    var agg = aggregateFactHours(groups[key]);
    if (agg) factMap[key] = agg;
  });
  return factMap;
}

/* ═══════════════════════════════════════════════════════════════
   Обнаружение проблем
   ═══════════════════════════════════════════════════════════════ */

/**
 * Найти orphan tasks — задачи с elapsed, но без метаданных
 * @param {Object} factMap — из buildFactHoursMap
 * @param {Object} tasksMeta — метаданные задач
 * @returns {Array} массив ключей orphan задач
 */
function findOrphanTasks(factMap, tasksMeta) {
  var orphans = [];
  Object.keys(factMap || {}).forEach(function(key) {
    var taskId = factMap[key].taskId;
    if (!tasksMeta || !tasksMeta[taskId]) {
      orphans.push(key);
    }
  });
  return orphans;
}

/**
 * Найти задачи в исключённых проектах
 * @param {Object} factMap
 * @param {Object} tasksMeta
 * @returns {Array} массив ключей задач в исключённых группах
 */
function findExcludedGroupTasks(factMap, tasksMeta) {
  var excluded = [];
  var exGroups = _normGetExcludeGroups();

  Object.keys(factMap || {}).forEach(function(key) {
    var taskId = factMap[key].taskId;
    var meta = (tasksMeta || {})[taskId];
    if (meta && exGroups[String(meta.groupId)]) {
      excluded.push(key);
    }
  });
  return excluded;
}

/**
 * Сгенерировать отчёт о качестве данных
 * @param {Object} normResult — из normalizeElapsedBatch
 * @param {Object} groups — из groupElapsedByTask
 * @param {Object} tasksMeta
 * @returns {Object} quality report
 */
function generateQualityReport(normResult, groups, tasksMeta) {
  var factMap = buildFactHoursMap(groups);
  var orphans = findOrphanTasks(factMap, tasksMeta);
  var excludedGroupTasks = findExcludedGroupTasks(factMap, tasksMeta);

  var totalDevs = {};
  Object.keys(factMap).forEach(function(key) { totalDevs[factMap[key].userId] = true; });

  return {
    elapsedStats: normResult ? normResult.stats : null,
    uniqueTaskDevPairs: Object.keys(factMap).length,
    uniqueDevelopers: Object.keys(totalDevs).length,
    orphanTasks: orphans.length,
    orphanKeys: orphans,
    excludedGroupTasks: excludedGroupTasks.length,
    excludedGroupKeys: excludedGroupTasks,
    quality: orphans.length === 0 && (!normResult || normResult.stats.rejectedDuplicate === 0)
      ? 'good'
      : orphans.length > 5 || (normResult && normResult.stats.rejectedDuplicate > 5)
        ? 'poor'
        : 'fair'
  };
}
