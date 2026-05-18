/* ═══════════════════════════════════════════════════════════════
   payroll-domain.js — Domain Models & Constants
   Центральные сущности системы зарплатного обзора.
   НЕ зависит от DOM. НЕ зависит от storage.
   ═══════════════════════════════════════════════════════════════ */

/* ─── Версия доменной модели ─── */
var PR_DOMAIN_VERSION = '1.0.0';

/* ═══════════════════════════════════════════════════════════════
   REVIEW STATUS — Статусы ревью задачи
   ═══════════════════════════════════════════════════════════════ */
var PR_REVIEW_STATUS = {
  PENDING:   'pending',
  APPROVED:  'approved',
  DISPUTED:  'disputed',
  EXCLUDED:  'excluded'
};

/* Допустимые переходы статусов */
var PR_REVIEW_TRANSITIONS = {
  pending:   ['approved', 'disputed', 'excluded'],
  approved:  ['disputed', 'excluded', 'pending'],
  disputed:  ['approved', 'excluded', 'pending'],
  excluded:  ['pending', 'approved', 'disputed']
};

/* Лейблы статусов */
var PR_REVIEW_STATUS_LABELS = {
  pending:  'Ожидает',
  approved: 'Подтв.',
  disputed: 'Спор',
  excluded: 'Исключ.'
};

/* ═══════════════════════════════════════════════════════════════
   PERIOD STATUS — Статусы расчётного периода
   ═══════════════════════════════════════════════════════════════ */
var PR_PERIOD_STATUS = {
  DRAFT:    'draft',
  REVIEW:   'review',
  APPROVED: 'approved',
  LOCKED:   'locked',
  EXPORTED: 'exported',
  PAID:     'paid'
};

/* Переходы для period state machine */
var PR_PERIOD_TRANSITIONS = {
  draft:    ['review'],
  review:   ['approved', 'draft'],
  approved: ['locked', 'review'],
  locked:   ['exported'],
  exported: ['paid'],
  paid:     []
};

/* Лейблы статусов периода */
var PR_PERIOD_STATUS_LABELS = {
  draft:    'Черновик',
  review:   'На проверке',
  approved: 'Согласовано',
  locked:   'Заблокировано',
  exported: 'Экспортировано',
  paid:     'Оплачено'
};

/* ═══════════════════════════════════════════════════════════════
   TASK REVIEW — Центральная доменная модель
   Одна строка ревью: задача + разработчик
   ═══════════════════════════════════════════════════════════════ */

/**
 * Создать TaskReview из сырых данных
 * @param {Object} params
 * @returns {Object} TaskReview
 */
function createTaskReview(params) {
  var p = params || {};
  var taskId = String(p.taskId || '');
  var developerId = String(p.developerId || '');
  var reviewKey = taskId + '_' + developerId;

  return {
    /* Identity */
    reviewId:       p.reviewId || reviewKey,
    _reviewKey:     reviewKey,

    /* Task info */
    taskId:         taskId,
    taskTitle:      p.taskTitle || ('Задача #' + taskId),
    projectId:      String(p.projectId || '0'),
    projectName:    p.projectName || 'Без проекта',

    /* Developer info */
    developerId:    developerId,
    developerName:  p.developerName || ('ID ' + developerId),

    /* Hours: 3 типа */
    factHours:      Number(p.factHours) || 0,       /* readonly, из elapsed */
    billableHours:  Number(p.billableHours) || 0,    /* editable менеджером */
    payrollHours:   Number(p.payrollHours) || 0,     /* editable менеджером */

    /* Money */
    rate:           Number(p.rate) || 0,
    base:           Number(p.base) || 0,
    payrollAmount:  Number(p.payrollAmount) || 0,

    /* Review state */
    reviewStatus:   p.reviewStatus || PR_REVIEW_STATUS.PENDING,
    managerComment: p.managerComment || '',

    /* Metadata */
    entryCount:     Number(p.entryCount) || 0,
    factMinutes:    Number(p.factMinutes) || 0,
    createdAt:      Number(p.createdAt) || Date.now(),
    updatedAt:      Number(p.updatedAt) || Date.now()
  };
}

/**
 * Вычислить payrollAmount для TaskReview
 * payrollAmount = payrollHours * rate + base
 * @param {Object} review
 * @returns {Object} review с обновлённым payrollAmount
 */
function calculateReviewAmount(review) {
  if (!review) return review;
  var r = shallowClone(review);
  r.payrollAmount = Math.round(r.payrollHours * r.rate) + r.base;
  return r;
}

/**
 * Проверить, можно ли редактировать ревью
 * Зависит от статуса периода
 * @param {Object} review
 * @param {String} periodStatus
 * @returns {Boolean}
 */
function isReviewEditable(review, periodStatus) {
  if (review.reviewStatus === PR_REVIEW_STATUS.EXCLUDED) return false;
  if (periodStatus === PR_PERIOD_STATUS.LOCKED) return false;
  if (periodStatus === PR_PERIOD_STATUS.EXPORTED) return false;
  if (periodStatus === PR_PERIOD_STATUS.PAID) return false;
  return true;
}

/**
 * Проверить допустимость перехода статуса ревью
 * @param {String} current
 * @param {String} target
 * @returns {Boolean}
 */
function canTransitionReviewStatus(current, target) {
  var allowed = PR_REVIEW_TRANSITIONS[current];
  if (!allowed) return false;
  return allowed.indexOf(target) >= 0;
}

/* ═══════════════════════════════════════════════════════════════
   REVIEW SNAPSHOT — Согласованный срез данных
   ═══════════════════════════════════════════════════════════════ */

/**
 * Создать ReviewSnapshot из TaskReview
 * @param {Object} review
 * @param {String} periodKey
 * @returns {Object} ReviewSnapshot
 */
function createReviewSnapshot(review, periodKey) {
  if (!review) return null;
  return {
    reviewId:       review.reviewId,
    _reviewKey:     review._reviewKey,
    periodKey:      periodKey || '',

    /* Согласованные часы (замороженные) */
    factHours:      review.factHours,
    billableHours:  review.billableHours,
    payrollHours:   review.payrollHours,

    /* Согласованные деньги */
    rate:           review.rate,
    base:           review.base,
    payrollAmount:  review.payrollAmount,

    /* Контекст */
    taskId:         review.taskId,
    taskTitle:      review.taskTitle,
    projectId:      review.projectId,
    developerId:    review.developerId,
    developerName:  review.developerName,

    /* Review state на момент snapshot */
    reviewStatus:   review.reviewStatus,
    managerComment: review.managerComment,

    /* Метаданные snapshot */
    snapshotAt:     Date.now(),
    managerAdjustments: detectManagerAdjustments(review)
  };
}

/**
 * Определить, какие корректировки внёс менеджер
 * @param {Object} review
 * @returns {Object}
 */
function detectManagerAdjustments(review) {
  var adj = {};
  if (review.billableHours !== review.factHours) {
    adj.billableHours = {
      from: review.factHours,
      to: review.billableHours
    };
  }
  if (review.payrollHours !== review.factHours) {
    adj.payrollHours = {
      from: review.factHours,
      to: review.payrollHours
    };
  }
  return adj;
}

/* ═══════════════════════════════════════════════════════════════
   PERIOD SNAPSHOT — Согласованный срез периода
   ═══════════════════════════════════════════════════════════════ */

/**
 * Создать PeriodSnapshot из массива TaskReview
 * @param {String} periodKey — "2026-05"
 * @param {Array} reviews — TaskReview[]
 * @returns {Object} PeriodSnapshot
 */
function createPeriodSnapshot(periodKey, reviews) {
  var reviewSnapshots = [];
  var totals = {
    totalFactHours: 0,
    totalBillable: 0,
    totalPayroll: 0,
    totalBase: 0,
    totalPayrollAmount: 0,
    totalTasks: 0,
    approvedTasks: 0,
    pendingTasks: 0,
    disputedTasks: 0,
    excludedTasks: 0
  };

  (reviews || []).forEach(function(r) {
    var snap = createReviewSnapshot(r, periodKey);
    reviewSnapshots.push(snap);

    totals.totalTasks++;
    if (r.reviewStatus === PR_REVIEW_STATUS.APPROVED) totals.approvedTasks++;
    if (r.reviewStatus === PR_REVIEW_STATUS.PENDING) totals.pendingTasks++;
    if (r.reviewStatus === PR_REVIEW_STATUS.DISPUTED) totals.disputedTasks++;
    if (r.reviewStatus === PR_REVIEW_STATUS.EXCLUDED) totals.excludedTasks++;

    if (r.reviewStatus !== PR_REVIEW_STATUS.EXCLUDED) {
      totals.totalFactHours += r.factHours;
      totals.totalBillable += r.billableHours;
      totals.totalPayroll += r.payrollHours;
      totals.totalBase += r.base;
      totals.totalPayrollAmount += r.payrollAmount;
    }
  });

  totals.totalFactHours = Math.round(totals.totalFactHours * 10) / 10;
  totals.totalBillable = Math.round(totals.totalBillable * 10) / 10;
  totals.totalPayroll = Math.round(totals.totalPayroll * 10) / 10;
  totals.totalPayrollAmount = Math.round(totals.totalPayrollAmount);

  return {
    periodKey: periodKey,
    snapshotAt: Date.now(),
    periodStatus: PR_PERIOD_STATUS.APPROVED,
    reviewCount: reviewSnapshots.length,
    reviews: reviewSnapshots,
    totals: totals
  };
}

/* ═══════════════════════════════════════════════════════════════
   AUDIT LOG ENTRY — Запись аудиторского следа
   ═══════════════════════════════════════════════════════════════ */

/**
 * Создать запись аудиторского следа
 * @param {String} action
 * @param {String} entityType
 * @param {String} entityId
 * @param {Object} details
 * @returns {Object} AuditLogEntry
 */
function createAuditEntry(action, entityType, entityId, details) {
  return {
    id: 'aud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    timestamp: Date.now(),
    action: action,          /* 'update_billable', 'update_payroll', 'change_rate', etc. */
    entityType: entityType,  /* 'review', 'period', 'developer', 'snapshot' */
    entityId: entityId,      /* reviewKey, periodKey, devId */
    details: details || {},
    actor: 'manager'         /* MVP: всегда manager, потом — из контекста */
  };
}

/* ═══════════════════════════════════════════════════════════════
   PERIOD — Расчётный период
   ═══════════════════════════════════════════════════════════════ */

/**
 * Создать объект периода
 * @param {Number} year
 * @param {Number} month
 * @returns {Object} PayrollPeriod
 */
function createPayrollPeriod(year, month) {
  var fromDate = new Date(year, month - 1, 1);
  var toDate = new Date(year, month, 0);
  return {
    year: year,
    month: month,
    periodKey: year + '-' + String(month).padStart(2, '0'),
    fromDate: fromDate,
    toDate: toDate,
    days: toDate.getDate(),
    fromStr: fromDate.getFullYear() + '-' + String(fromDate.getMonth() + 1).padStart(2, '0') + '-' + String(fromDate.getDate()).padStart(2, '0'),
    toStr: toDate.getFullYear() + '-' + String(toDate.getMonth() + 1).padStart(2, '0') + '-' + String(toDate.getDate()).padStart(2, '0'),
    status: PR_PERIOD_STATUS.DRAFT,
    snapshotId: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/**
 * Проверить допустимость перехода статуса периода
 * @param {String} current
 * @param {String} target
 * @returns {Boolean}
 */
function canTransitionPeriodStatus(current, target) {
  var allowed = PR_PERIOD_TRANSITIONS[current];
  if (!allowed) return false;
  return allowed.indexOf(target) >= 0;
}

/* ═══════════════════════════════════════════════════════════════
   DEVELOPER CABINET VIEW — Представление для разработчика
   Разработчик видит ТОЛЬКО свои payroll данные
   ═══════════════════════════════════════════════════════════════ */

/**
 * Создать представление кабинета разработчика
 * Фильтрует данные: убирает billable, margin, чужие данные
 * @param {String} developerId
 * @param {Array} reviews — TaskReview[]
 * @returns {Object} DeveloperCabinetView
 */
function createDevCabinetView(developerId, reviews) {
  var myReviews = (reviews || []).filter(function(r) {
    return String(r.developerId) === String(developerId) &&
           r.reviewStatus !== PR_REVIEW_STATUS.EXCLUDED;
  });

  var totalPayrollHours = 0;
  var totalPayrollAmount = 0;
  var taskCount = 0;
  var approvedCount = 0;
  var pendingCount = 0;

  var taskViews = myReviews.map(function(r) {
    totalPayrollHours += r.payrollHours;
    totalPayrollAmount += r.payrollAmount;
    taskCount++;
    if (r.reviewStatus === PR_REVIEW_STATUS.APPROVED) approvedCount++;
    if (r.reviewStatus === PR_REVIEW_STATUS.PENDING) pendingCount++;

    return {
      taskId: r.taskId,
      taskTitle: r.taskTitle,
      projectName: r.projectName,
      payrollHours: r.payrollHours,
      rate: r.rate,
      payrollAmount: r.payrollAmount,
      reviewStatus: r.reviewStatus,
      managerComment: r.managerComment,
      /* КРИТИЧЕСКИ: НЕТ billableHours, НЕТ factHours, НЕТ clientAmount */
    };
  });

  return {
    developerId: developerId,
    periodTasks: taskViews,
    summary: {
      taskCount: taskCount,
      totalPayrollHours: Math.round(totalPayrollHours * 10) / 10,
      totalPayrollAmount: Math.round(totalPayrollAmount),
      approvedCount: approvedCount,
      pendingCount: pendingCount
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   УТИЛИТЫ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Поверхностное клонирование объекта
 * @param {Object} obj
 * @returns {Object}
 */
function shallowClone(obj) {
  if (!obj) return obj;
  var clone = {};
  Object.keys(obj).forEach(function(k) { clone[k] = obj[k]; });
  return clone;
}

/**
 * Глубокое клонирование простых объектов (без функций, дат, циклов)
 * @param {*} obj
 * @returns {*}
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepClone);
  var clone = {};
  Object.keys(obj).forEach(function(k) { clone[k] = deepClone(obj[k]); });
  return clone;
}

/**
 * Проверить, что значение — валидное число
 * @param {*} val
 * @returns {Boolean}
 */
function isValidNumber(val) {
  return typeof val === 'number' && !isNaN(val) && isFinite(val);
}

/**
 * Безопасное округление до N знаков
 * @param {Number} val
 * @param {Number} decimals
 * @returns {Number}
 */
function safeRound(val, decimals) {
  if (!isValidNumber(val)) return 0;
  var d = decimals || 0;
  var factor = Math.pow(10, d);
  return Math.round(val * factor) / factor;
}
