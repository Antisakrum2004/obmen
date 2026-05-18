/* ═══════════════════════════════════════════════════════════════
   payroll-review-engine.js — Движок ревью
   Строит TaskReview[] из нормализованных данных.
   Управляет состоянием ревью, статусами, сохранением.
   НЕ зависит от DOM.

   v1.1.0 — Single Source of Truth: NormalizedReviewModel
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   NORMALIZED REVIEW MODEL — Единый источник истины

   Все чтения данных проходят через NormalizedReviewModel.
   Для immutable периодов (approved/locked/exported/paid):
     источник = snapshot из storage
   Для draft/review периодов:
     источник = live elapsed + сохранённые ревью из storage
   ═══════════════════════════════════════════════════════════════ */

/**
 * Построить NormalizedReviewModel для периода
 * Единая точка входа для всех потребителей данных.
 *
 * Если период immutable — читает из snapshot (замороженные данные).
 * Если период draft/review — строит из live elapsed + saved reviews.
 *
 * @param {Object} options
 *   - periodKey: String ("2026-05")
 *   - periodStatus: String (draft/review/approved/locked/exported/paid)
 *   - rawData: Object|null (elapsed, tasks, tasksMeta, projects) — только для draft/review
 *   - savedReviews: Object|null (map[reviewKey]) — только для draft/review
 *   - rateProvider: Object|null — { getRate, getBase, getName }
 * @returns {Object} NormalizedReviewModel
 */
function buildNormalizedModel(options) {
  var opts = options || {};
  var periodKey = opts.periodKey || '';
  var periodStatus = opts.periodStatus || PR_PERIOD_STATUS.DRAFT;
  var isImmutable = typeof isPeriodSnapshotImmutable === 'function' &&
    isPeriodSnapshotImmutable(periodStatus);

  var model = {
    periodKey: periodKey,
    periodStatus: periodStatus,
    source: isImmutable ? 'snapshot' : 'live',
    rows: [],
    qualityReport: null,
    snapshotId: null,
    snapshotChecksum: null,
    snapshotIntegrity: null,
    builtAt: Date.now()
  };

  if (isImmutable) {
    /* ── IMMUTABLE: источник = snapshot ── */
    var snapshot = null;
    if (typeof PayrollStorage !== 'undefined') {
      snapshot = PayrollStorage.loadSnapshot(periodKey);
    }

    if (snapshot) {
      /* Проверить целостность */
      if (typeof verifySnapshotIntegrity === 'function') {
        model.snapshotIntegrity = verifySnapshotIntegrity(snapshot);
      }

      /* Восстановить TaskReview[] из snapshot */
      model.rows = _restoreRowsFromSnapshot(snapshot);
      model.snapshotId = snapshot.snapshotId || null;
      model.snapshotChecksum = snapshot.checksum || null;
      model.qualityReport = null; /* Для snapshot не нужен */
    } else {
      /* Snapshot не найден — fallback на live data */
      console.warn('buildNormalizedModel: Период ' + periodKey +
        ' в статусе ' + periodStatus + ', но snapshot не найден. Fallback на live.');
      model.source = 'live_fallback';
      model.rows = _buildRowsFromLive(opts.rawData, opts.savedReviews, opts.rateProvider);
    }
  } else {
    /* ── DRAFT/REVIEW: источник = live elapsed + saved reviews ── */
    model.rows = _buildRowsFromLive(opts.rawData, opts.savedReviews, opts.rateProvider);
  }

  return model;
}

/**
 * Восстановить TaskReview[] из PeriodSnapshot
 * @param {Object} snapshot — PeriodSnapshot
 * @returns {Array} TaskReview[]
 */
function _restoreRowsFromSnapshot(snapshot) {
  if (!snapshot || !snapshot.reviews) return [];

  var rows = [];
  snapshot.reviews.forEach(function(snap) {
    if (!snap) return;
    var review = createTaskReview({
      taskId: snap.taskId,
      taskTitle: snap.taskTitle,
      projectId: snap.projectId,
      projectName: snap.developerName ? '' : '', /* projectName не в snapshot, возьмём из review */
      developerId: snap.developerId,
      developerName: snap.developerName,
      factHours: snap.factHours,
      billableHours: snap.billableHours,
      payrollHours: snap.payrollHours,
      rate: snap.rate,
      base: snap.base,
      reviewStatus: snap.reviewStatus,
      managerComment: snap.managerComment,
      entryCount: 0, /* В snapshot нет entryCount — не важно для immutable */
      createdAt: snap.snapshotAt || Date.now(),
      updatedAt: snap.snapshotAt || Date.now()
    });

    /* Восстановить payrollAmount */
    review = calculateReviewAmount(review);
    rows.push(review);
  });

  /* Сортировка как в live */
  rows.sort(function(a, b) {
    if (a.reviewStatus === PR_REVIEW_STATUS.PENDING && b.reviewStatus !== PR_REVIEW_STATUS.PENDING) return -1;
    if (a.reviewStatus !== PR_REVIEW_STATUS.PENDING && b.reviewStatus === PR_REVIEW_STATUS.PENDING) return 1;
    var dComp = a.developerName.localeCompare(b.developerName);
    if (dComp !== 0) return dComp;
    return a.taskTitle.localeCompare(b.taskTitle);
  });

  return rows;
}

/**
 * Построить TaskReview[] из live данных
 * @param {Object} rawData
 * @param {Object} savedReviews
 * @param {Object} rateProvider
 * @returns {Array} TaskReview[]
 */
function _buildRowsFromLive(rawData, savedReviews, rateProvider) {
  var result = buildReviewRows(rawData, savedReviews, rateProvider);
  /* Note: qualityReport нужно получать отдельно из buildReviewRows */
  return result.rows;
}

/* ═══════════════════════════════════════════════════════════════
   Построение строк ревью из данных
   ═══════════════════════════════════════════════════════════════ */

/**
 * Построить массив TaskReview из сырых данных периода
 * Главная функция — заменяет buildTaskReviewRows() из calc.js
 *
 * @param {Object} data — { elapsed, tasks, tasksMeta, projects }
 * @param {Object} savedReviews — сохранённые ревью из storage
 * @param {Object} rateProvider — { getRate(devId), getBase(devId), getName(devId) }
 * @returns {Object} { rows, qualityReport }
 */
function buildReviewRows(data, savedReviews, rateProvider) {
  if (!data || !data.elapsed) return { rows: [], qualityReport: null };

  var rp = rateProvider || _defaultRateProvider();
  var tasksMeta = data.tasksMeta || {};
  var tasks = data.tasks || [];
  var projects = data.projects || {};

  /* Шаг 1: Нормализация elapsed */
  var fromStr = data.fromStr || '';
  var toStr = data.toStr || '';
  var normResult = normalizeElapsedBatch(data.elapsed, {
    fromStr: fromStr,
    toStr: toStr
  });

  /* Шаг 2: Группировка */
  var groups = groupElapsedByTask(normResult.valid);
  var factMap = buildFactHoursMap(groups);

  /* Шаг 3: Словарь названий задач */
  var taskTitles = {};
  tasks.forEach(function(t) {
    var id = String(t.id || t.ID || '');
    var ti = t.title || t.TITLE || '';
    if (id && ti) taskTitles[id] = ti;
  });
  Object.keys(tasksMeta).forEach(function(tid) {
    if (!taskTitles[tid] && tasksMeta[tid].title) {
      taskTitles[tid] = tasksMeta[tid].title;
    }
  });

  /* Шаг 4: Построение TaskReview[] */
  var rows = [];
  Object.keys(factMap).forEach(function(key) {
    var agg = factMap[key];
    var meta = tasksMeta[agg.taskId] || {};
    var gid = meta.groupId || '0';
    var projectName = (projects[gid] && projects[gid].name) || meta.groupName ||
      (typeof PROJECTS !== 'undefined' ? PROJECTS[gid] : '') || 'Без проекта';
    var developerName = rp.getName(agg.userId);
    var rate = rp.getRate(agg.userId);
    var base = rp.getBase(agg.userId);

    /* Загрузить сохранённое ревью (корректировки менеджера) */
    var reviewKey = agg.taskId + '_' + agg.userId;
    var saved = (savedReviews && savedReviews[reviewKey]) || null;

    var review = createTaskReview({
      taskId: agg.taskId,
      taskTitle: taskTitles[agg.taskId] || ('Задача #' + agg.taskId),
      projectId: gid,
      projectName: projectName,
      developerId: agg.userId,
      developerName: developerName,
      factHours: agg.factHours,
      factMinutes: agg.factMinutes,
      billableHours: saved ? saved.billableHours : agg.factHours,
      payrollHours: saved ? saved.payrollHours : agg.factHours,
      rate: saved ? saved.rate : rate,
      base: saved ? saved.base : base,
      reviewStatus: saved ? saved.reviewStatus : PR_REVIEW_STATUS.PENDING,
      managerComment: saved ? saved.managerComment : '',
      entryCount: agg.entryCount,
      createdAt: saved ? saved.createdAt : Date.now(),
      updatedAt: saved ? saved.updatedAt : Date.now(),
      /* Profitability — из сохранённых или defaults */
      clientRate: saved ? (saved.clientRate || 0) : 0,
      clientAmount: saved ? (saved.clientAmount || 0) : 0,
      grossMargin: saved ? (saved.grossMargin || 0) : 0,
      marginPercent: saved ? (saved.marginPercent || 0) : 0,
      overburnHours: saved ? (saved.overburnHours || 0) : 0
    });

    /* Вычислить сумму */
    review = calculateReviewAmount(review);
    rows.push(review);
  });

  /* Шаг 5: Фильтр исключённых проектов */
  var exGroups = _normGetExcludeGroups();
  rows = rows.filter(function(r) {
    return !exGroups[String(r.projectId)];
  });

  /* Шаг 6: Сортировка */
  rows.sort(function(a, b) {
    if (a.reviewStatus === PR_REVIEW_STATUS.PENDING && b.reviewStatus !== PR_REVIEW_STATUS.PENDING) return -1;
    if (a.reviewStatus !== PR_REVIEW_STATUS.PENDING && b.reviewStatus === PR_REVIEW_STATUS.PENDING) return 1;
    var dComp = a.developerName.localeCompare(b.developerName);
    if (dComp !== 0) return dComp;
    return a.taskTitle.localeCompare(b.taskTitle);
  });

  /* Шаг 7: Quality report */
  var qualityReport = generateQualityReport(normResult, groups, tasksMeta);

  return { rows: rows, qualityReport: qualityReport };
}

/**
 * Дефолтный provider ставок (совместимость с core.js)
 * @returns {Object}
 */
function _defaultRateProvider() {
  return {
    getRate: function(devId) {
      if (typeof prGetRate === 'function') return prGetRate(devId);
      if (typeof DEV_RATES !== 'undefined') return DEV_RATES[String(devId)] || 1000;
      return 1000;
    },
    getBase: function(devId) {
      if (typeof prGetBase === 'function') return prGetBase(devId);
      if (typeof DEV_BASE !== 'undefined') return DEV_BASE[String(devId)] || 0;
      return 0;
    },
    getName: function(devId) {
      if (typeof prGetDevName === 'function') return prGetDevName(devId);
      if (typeof DEVELOPERS !== 'undefined') return DEVELOPERS[String(devId)] || ('ID ' + devId);
      return 'ID ' + devId;
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   Операции над отдельным ревью
   ═══════════════════════════════════════════════════════════════ */

/**
 * Обновить поле ревью с валидацией
 * @param {Object} review — TaskReview (НЕ мутируется)
 * @param {String} field — 'billableHours' | 'payrollHours' | 'managerComment'
 * @param {*} value
 * @param {String} periodStatus — статус периода для проверки lock
 * @returns {Object} { review: updatedReview, audit: auditEntry|null, error: string|null }
 */
function updateReviewField(review, field, value, periodStatus) {
  if (!review) return { review: null, audit: null, error: 'no_review' };

  /* Проверить, можно ли редактировать */
  if (!isReviewEditable(review, periodStatus)) {
    return { review: review, audit: null, error: 'period_locked' };
  }

  var updated = shallowClone(review);
  var oldValue = review[field];

  /* Валидация по полю */
  if (field === 'billableHours' || field === 'payrollHours') {
    var numVal = parseFloat(value);
    if (isNaN(numVal) || numVal < 0) numVal = 0;
    numVal = safeRound(numVal, 1);
    updated[field] = numVal;
  } else if (field === 'managerComment') {
    updated[field] = String(value || '');
  } else {
    return { review: review, audit: null, error: 'invalid_field' };
  }

  /* Пересчитать сумму */
  updated = calculateReviewAmount(updated);
  updated.updatedAt = Date.now();

  /* Increment version for optimistic locking */
  updated.version = (review.version || 0) + 1;
  updated.revisionId = 'rev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

  /* Создать audit entry */
  var audit = createAuditEntry(
    'update_' + field,
    'review',
    review._reviewKey,
    { field: field, oldValue: oldValue, newValue: updated[field], version: updated.version }
  );

  /* Fire event */
  if (typeof PayrollEvents !== 'undefined') {
    PayrollEvents.emit('review:updated', {
      reviewKey: review._reviewKey,
      field: field,
      oldValue: oldValue,
      newValue: updated[field],
      version: updated.version
    });
  }

  return { review: updated, audit: audit, error: null };
}

/**
 * Переключить статус ревью
 * @param {Object} review
 * @param {String} targetStatus
 * @param {String} periodStatus
 * @returns {Object} { review, audit, error }
 */
function transitionReviewStatus(review, targetStatus, periodStatus) {
  if (!review) return { review: null, audit: null, error: 'no_review' };

  /* Проверить допустимость перехода */
  if (!canTransitionReviewStatus(review.reviewStatus, targetStatus)) {
    return { review: review, audit: null, error: 'invalid_transition' };
  }

  /* Заблокированный период — нельзя менять статус */
  if (periodStatus === PR_PERIOD_STATUS.LOCKED ||
      periodStatus === PR_PERIOD_STATUS.EXPORTED ||
      periodStatus === PR_PERIOD_STATUS.PAID) {
    return { review: review, audit: null, error: 'period_locked' };
  }

  var updated = shallowClone(review);
  var oldStatus = updated.reviewStatus;
  updated.reviewStatus = targetStatus;
  updated.updatedAt = Date.now();

  /* Increment version for optimistic locking */
  updated.version = (review.version || 0) + 1;
  updated.revisionId = 'rev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

  var audit = createAuditEntry(
    'change_status',
    'review',
    review._reviewKey,
    { oldStatus: oldStatus, newStatus: targetStatus, version: updated.version }
  );

  return { review: updated, audit: audit, error: null };
}

/**
 * Подтвердить все ожидающие ревью
 * @param {Array} reviews — TaskReview[]
 * @param {String} periodStatus
 * @returns {Object} { reviews, auditEntries }
 */
function approveAllPending(reviews, periodStatus) {
  var updated = [];
  var auditEntries = [];

  (reviews || []).forEach(function(r) {
    if (r.reviewStatus === PR_REVIEW_STATUS.PENDING) {
      var result = transitionReviewStatus(r, PR_REVIEW_STATUS.APPROVED, periodStatus);
      updated.push(result.review || r);
      if (result.audit) auditEntries.push(result.audit);
    } else {
      updated.push(r);
    }
  });

  return { reviews: updated, auditEntries: auditEntries };
}

/* ═══════════════════════════════════════════════════════════════
   Сериализация ревью для storage
   ═══════════════════════════════════════════════════════════════ */

/**
 * Сериализовать массив TaskReview для сохранения
 * @param {Array} reviews
 * @returns {Object} map[reviewKey] = serialized data
 */
function serializeReviews(reviews) {
  var map = {};
  (reviews || []).forEach(function(r) {
    map[r._reviewKey] = {
      billableHours: r.billableHours,
      payrollHours: r.payrollHours,
      rate: r.rate,
      base: r.base,
      reviewStatus: r.reviewStatus,
      managerComment: r.managerComment,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
      /* Profitability fields */
      clientRate: r.clientRate || 0,
      clientAmount: r.clientAmount || 0,
      grossMargin: r.grossMargin || 0,
      marginPercent: r.marginPercent || 0,
      overburnHours: r.overburnHours || 0,
      /* Version conflict protection */
      version: r.version || 1,
      revisionId: r.revisionId || ''
    };
  });
  return map;
}

/**
 * Десериализовать сохранённые ревью
 * @param {Object} map — из storage
 * @returns {Object} map[reviewKey] = saved data (уже в нужном формате)
 */
function deserializeReviews(map) {
  return map || {};
}
