/* ═══════════════════════════════════════════════════════════════
   payroll-domain.js — Domain Models & Constants
   Центральные сущности системы зарплатного обзора.
   НЕ зависит от DOM. НЕ зависит от storage.
   ═══════════════════════════════════════════════════════════════ */

/* ─── Версия доменной модели ─── */
var PR_DOMAIN_VERSION = '1.1.0';

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

    /* Money: Payroll side */
    rate:           Number(p.rate) || 0,             /* payroll rate (р/час) */
    base:           Number(p.base) || 0,             /* базовая часть (оклад) */
    payrollAmount:  Number(p.payrollAmount) || 0,     /* payrollHours * rate + base */

    /* Money: Client / Profitability side (MVP: значения по умолчанию) */
    clientRate:     Number(p.clientRate) || 0,        /* ставка для клиента (р/час) */
    clientAmount:   Number(p.clientAmount) || 0,      /* billableHours * clientRate */
    grossMargin:    Number(p.grossMargin) || 0,       /* clientAmount - payrollAmount */
    marginPercent:  Number(p.marginPercent) || 0,     /* grossMargin / clientAmount * 100 */
    overburnHours:  Number(p.overburnHours) || 0,     /* billableHours - payrollHours (если > 0) */

    /* Review state */
    reviewStatus:   p.reviewStatus || PR_REVIEW_STATUS.PENDING,
    managerComment: p.managerComment || '',

    /* Metadata */
    entryCount:     Number(p.entryCount) || 0,
    factMinutes:    Number(p.factMinutes) || 0,
    createdAt:      Number(p.createdAt) || Date.now(),
    updatedAt:      Number(p.updatedAt) || Date.now(),

    /* Version conflict protection */
    version:        Number(p.version) || 1,            /* optimistic locking version */
    revisionId:     p.revisionId || ('rev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8))
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
  /* payrollAmount per task = hours × rate. Base salary is added once per developer in projection, NOT per task. */
  r.payrollAmount = Math.round(r.payrollHours * r.rate);

  /* Profitability calculations */
  r = calculateProfitability(r);

  return r;
}

/**
 * Вычислить profitability поля для TaskReview
 * clientAmount = billableHours * clientRate
 * grossMargin = clientAmount - payrollAmount
 * marginPercent = grossMargin / clientAmount * 100 (если clientAmount > 0)
 * overburnHours = billableHours - payrollHours (если billable > payroll)
 * @param {Object} review
 * @returns {Object} review с profitability fields
 */
function calculateProfitability(review) {
  if (!review) return review;
  var r = review;

  /* Safe financial math: гарантируем валидные числа на каждом шаге */
  var billableHours = isValidNumber(r.billableHours) ? r.billableHours : 0;
  var payrollHours = isValidNumber(r.payrollHours) ? r.payrollHours : 0;
  var payrollAmount = isValidNumber(r.payrollAmount) ? r.payrollAmount : 0;

  /* clientAmount: если clientRate не задан, используем payroll rate как fallback */
  var effectiveClientRate = isValidNumber(r.clientRate) ? r.clientRate :
                            (isValidNumber(r.rate) ? r.rate : 0);
  r.clientRate = effectiveClientRate;
  r.clientAmount = Math.round(billableHours * effectiveClientRate);

  /* grossMargin: client revenue - payroll cost */
  r.grossMargin = r.clientAmount - payrollAmount;

  /* marginPercent: защита от division by zero и NaN */
  if (r.clientAmount > 0 && isValidNumber(r.grossMargin)) {
    r.marginPercent = safeRound(r.grossMargin / r.clientAmount * 100, 1);
  } else {
    r.marginPercent = 0;
  }

  /* overburnHours: если billable > payroll, это переработка */
  r.overburnHours = billableHours > payrollHours
    ? safeRound(billableHours - payrollHours, 1)
    : 0;

  /* Финальная проверка — ни одно поле не должно быть NaN/Infinity */
  if (!isValidNumber(r.clientAmount)) r.clientAmount = 0;
  if (!isValidNumber(r.grossMargin)) r.grossMargin = 0;
  if (!isValidNumber(r.marginPercent)) r.marginPercent = 0;
  if (!isValidNumber(r.overburnHours)) r.overburnHours = 0;

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
   REVIEW SNAPSHOT — Иммутабельный согласованный срез данных

   После создания snapshot НЕ может быть изменён.
   Deep clone protection: все вложенные объекты копируются.
   Snapshot versioning: snapshotVersion инкрементируется при пересоздании.
   Checksum: хеш данных для обнаружения порчи.
   Freeze: Object.freeze() предотвращает мутацию ссылок.
   ═══════════════════════════════════════════════════════════════ */

/* Счётчик версий snapshots */
var _prSnapshotVersionCounter = 0;

/**
 * Вычислить простой хеш строки для checksum
 * DJB2 алгоритм — быстрый, достаточный для целостности данных
 * @param {String} str
 * @returns {String} hex hash
 */
function _computeChecksum(str) {
  var hash = 5381;
  var s = String(str || '');
  for (var i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash = hash & hash; /* Convert to 32bit integer */
  }
  return 'cs_' + Math.abs(hash).toString(36);
}

/**
 * Проверить, находится ли период в immutable состоянии
 * Snapshots в approved/locked/exported/paid — immutable
 * @param {String} periodStatus
 * @returns {Boolean}
 */
function isPeriodSnapshotImmutable(periodStatus) {
  return periodStatus === PR_PERIOD_STATUS.APPROVED ||
         periodStatus === PR_PERIOD_STATUS.LOCKED ||
         periodStatus === PR_PERIOD_STATUS.EXPORTED ||
         periodStatus === PR_PERIOD_STATUS.PAID;
}

/**
 * Создать ReviewSnapshot из TaskReview
 * Иммутабельный: deep clone + Object.freeze
 * @param {Object} review
 * @param {String} periodKey
 * @returns {Object} ReviewSnapshot (frozen)
 */
function createReviewSnapshot(review, periodKey) {
  if (!review) return null;

  /* Deep clone managerAdjustments чтобы разорвать все ссылки */
  var adjustments = deepClone(detectManagerAdjustments(review));

  var snapshot = {
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

    /* Метаданные snapshot — immutability info */
    snapshotAt:     Date.now(),
    snapshotVersion: ++_prSnapshotVersionCounter,
    managerAdjustments: adjustments,
    _immutable:     true
  };

  /* Freeze: глубокая заморозка — включая вложенные объекты */
  try {
    _deepFreeze(adjustments);
    Object.freeze(snapshot);
  } catch(e) {
    /* Object.freeze не поддерживается в старых браузерах — не критично */
  }

  return snapshot;
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

  /* Deep freeze totals */
  try { Object.freeze(totals); } catch(e) {}

  /* Вычислить checksum данных snapshot */
  var checksumData = periodKey + '|' + reviewSnapshots.length + '|' +
    totals.totalFactHours + '|' + totals.totalBillable + '|' +
    totals.totalPayroll + '|' + totals.totalPayrollAmount;
  var checksum = _computeChecksum(checksumData);

  var snapshot = {
    snapshotId:     'snap_' + periodKey + '_' + Date.now(),
    periodKey:      periodKey,
    snapshotAt:     Date.now(),
    snapshotVersion: ++_prSnapshotVersionCounter,
    periodStatus:   PR_PERIOD_STATUS.APPROVED,
    reviewCount:    reviewSnapshots.length,
    reviews:        reviewSnapshots,
    totals:         totals,
    checksum:       checksum,
    _immutable:     true
  };

  /* Deep freeze всего snapshot (включая все вложенные объекты) */
  try {
    _deepFreeze(snapshot);
  } catch(e) {}

  return snapshot;
}

/**
 * Проверить целостность PeriodSnapshot
 * Сравнивает сохранённый checksum с пересчитанным
 * @param {Object} snapshot — PeriodSnapshot (из storage)
 * @returns {Object} { valid: Boolean, expectedChecksum: String, actualChecksum: String }
 */
function verifySnapshotIntegrity(snapshot) {
  if (!snapshot || !snapshot.checksum) {
    return { valid: false, expectedChecksum: '', actualChecksum: '', error: 'no_checksum' };
  }

  var totals = snapshot.totals || {};
  var checksumData = snapshot.periodKey + '|' + (snapshot.reviewCount || 0) + '|' +
    (totals.totalFactHours || 0) + '|' + (totals.totalBillable || 0) + '|' +
    (totals.totalPayroll || 0) + '|' + (totals.totalPayrollAmount || 0);
  var actualChecksum = _computeChecksum(checksumData);

  return {
    valid: actualChecksum === snapshot.checksum,
    expectedChecksum: snapshot.checksum,
    actualChecksum: actualChecksum,
    error: actualChecksum !== snapshot.checksum ? 'checksum_mismatch' : null
  };
}

/**
 * Проверить, является ли объект замороженным snapshot'ом
 * @param {Object} snapshot
 * @returns {Boolean}
 */
function isSnapshotFrozen(snapshot) {
  if (!snapshot || !snapshot._immutable) return false;
  try {
    /* Если Object.freeze сработал, запись в свойство молча проигнорируется
       в non-strict mode или выбросит TypeError в strict mode */
    var testKey = '__immutability_test__';
    snapshot[testKey] = true;
    var isFrozen = !snapshot[testKey];
    delete snapshot[testKey];
    return isFrozen;
  } catch(e) {
    /* Strict mode: присвоение выбрасывает TypeError = заморожен */
    return true;
  }
}

/* ═══════════════════════════════════════════════════════════════
   VERSION CONFLICT PROTECTION — Optimistic locking
   ═══════════════════════════════════════════════════════════════ */

/**
 * Проверить конфликт версий между двумя ревью
 * Если версия в storage новее — кто-то другой уже сохранил изменения
 *
 * @param {Object} currentReview — текущий TaskReview (в памяти)
 * @param {Object} storedReview — сохранённый TaskReview (из storage)
 * @returns {Object} { hasConflict: Boolean, currentVersion, storedVersion }
 */
function checkVersionConflict(currentReview, storedReview) {
  if (!currentReview || !storedReview) {
    return { hasConflict: false, currentVersion: 0, storedVersion: 0 };
  }

  var currentVersion = currentReview.version || 1;
  var storedVersion = storedReview.version || 1;

  return {
    hasConflict: storedVersion > currentVersion,
    currentVersion: currentVersion,
    storedVersion: storedVersion,
    message: storedVersion > currentVersion
      ? 'Конфликт версий: сохранённая версия (' + storedVersion +
        ') новее текущей (' + currentVersion + ')'
      : null
  };
}

/* ═══════════════════════════════════════════════════════════════
   VALIDATION ENGINE — Расширенная валидация
   ═══════════════════════════════════════════════════════════════ */

/**
 * Создать ValidationReport
 * @returns {Object} ValidationReport
 */
function createValidationReport() {
  return {
    errors: [],     /* Критические ошибки — блокируют операции */
    warnings: [],   /* Предупреждения — не блокируют, но информируют */
    info: [],       /* Информационные сообщения */
    isValid: true,
    hasWarnings: false,
    checkedAt: Date.now()
  };
}

/**
 * Добавить ошибку в ValidationReport
 * @param {Object} report — ValidationReport
 * @param {String} code — код ошибки
 * @param {String} message — описание
 * @param {Object} context — доп. контекст
 * @returns {Object} обновлённый report
 */
function addValidationError(report, code, message, context) {
  if (!report) report = createValidationReport();
  report.errors.push({
    code: code,
    message: message,
    context: context || {},
    severity: 'error'
  });
  report.isValid = false;
  return report;
}

/**
 * Добавить предупреждение в ValidationReport
 * @param {Object} report — ValidationReport
 * @param {String} code
 * @param {String} message
 * @param {Object} context
 * @returns {Object} обновлённый report
 */
function addValidationWarning(report, code, message, context) {
  if (!report) report = createValidationReport();
  report.warnings.push({
    code: code,
    message: message,
    context: context || {},
    severity: 'warning'
  });
  report.hasWarnings = true;
  return report;
}

/**
 * Валидировать TaskReview
 * Комплексная проверка всех полей
 * @param {Object} review — TaskReview
 * @param {Object} options — { periodStatus }
 * @returns {Object} ValidationReport
 */
function validateTaskReview(review, options) {
  var report = createValidationReport();
  if (!review) {
    addValidationError(report, 'null_review', 'Отсутствует объект ревью');
    return report;
  }

  var opts = options || {};

  /* Negative hours */
  if (review.billableHours < 0) {
    addValidationError(report, 'negative_billable', 'Billable hours не может быть отрицательным', {
      billableHours: review.billableHours, reviewKey: review._reviewKey
    });
  }
  if (review.payrollHours < 0) {
    addValidationError(report, 'negative_payroll', 'Payroll hours не может быть отрицательным', {
      payrollHours: review.payrollHours, reviewKey: review._reviewKey
    });
  }
  if (review.factHours < 0) {
    addValidationError(report, 'negative_fact', 'Fact hours не может быть отрицательным', {
      factHours: review.factHours, reviewKey: review._reviewKey
    });
  }

  /* Hours > 24/day per entry (heuristic: > 200 hours per task/month is suspicious) */
  if (review.billableHours > 200) {
    addValidationWarning(report, 'excessive_billable', 'Billable hours > 200 за месяц — подозрительно', {
      billableHours: review.billableHours, reviewKey: review._reviewKey
    });
  }

  /* Zero rate — warning (rate=0 is allowed, e.g. for internal/non-billable work) */
  if (review.rate <= 0 && review.payrollHours > 0) {
    addValidationWarning(report, 'zero_rate', 'Ставка = 0 при наличии payroll hours — это корректно для внутренних/неоплачиваемых задач', {
      rate: review.rate, payrollHours: review.payrollHours, reviewKey: review._reviewKey
    });
  }

  /* Invalid rate values */
  if (!isValidNumber(review.rate)) {
    addValidationError(report, 'invalid_rate', 'Ставка не является валидным числом', {
      rate: review.rate, reviewKey: review._reviewKey
    });
  }

  /* NaN/Infinity checks */
  if (!isValidNumber(review.factHours)) {
    addValidationError(report, 'nan_fact', 'Fact hours не является валидным числом', {
      factHours: review.factHours, reviewKey: review._reviewKey
    });
  }
  if (!isValidNumber(review.payrollAmount)) {
    addValidationError(report, 'nan_amount', 'Payroll amount не является валидным числом', {
      payrollAmount: review.payrollAmount, reviewKey: review._reviewKey
    });
  }

  /* Missing user */
  if (!review.developerId) {
    addValidationError(report, 'missing_developer', 'Отсутствует ID разработчика', {
      reviewKey: review._reviewKey
    });
  }

  /* Missing task */
  if (!review.taskId) {
    addValidationError(report, 'missing_task', 'Отсутствует ID задачи', {
      reviewKey: review._reviewKey
    });
  }

  /* Locked period mutation attempt */
  if (opts.periodStatus && isPeriodSnapshotImmutable(opts.periodStatus)) {
    addValidationError(report, 'locked_period_mutation', 'Попытка изменить immutable период', {
      periodStatus: opts.periodStatus, reviewKey: review._reviewKey
    });
  }

  /* Invalid status transition */
  if (review.reviewStatus && Object.keys(PR_REVIEW_STATUS).every(function(k) {
    return PR_REVIEW_STATUS[k] !== review.reviewStatus;
  })) {
    addValidationError(report, 'invalid_status', 'Неизвестный статус ревью', {
      reviewStatus: review.reviewStatus, reviewKey: review._reviewKey
    });
  }

  return report;
}

/**
 * Валидировать массив TaskReview
 * @param {Array} reviews — TaskReview[]
 * @param {Object} options
 * @returns {Object} ValidationReport
 */
function validateReviewBatch(reviews, options) {
  var report = createValidationReport();
  var seenKeys = {};

  (reviews || []).forEach(function(r) {
    var singleReport = validateTaskReview(r, options);
    report.errors = report.errors.concat(singleReport.errors);
    report.warnings = report.warnings.concat(singleReport.warnings);

    /* Duplicate detection */
    if (r._reviewKey) {
      if (seenKeys[r._reviewKey]) {
        addValidationError(report, 'duplicate_review', 'Дублирующийся reviewKey', {
          reviewKey: r._reviewKey
        });
      }
      seenKeys[r._reviewKey] = true;
    }
  });

  report.isValid = report.errors.length === 0;
  report.hasWarnings = report.warnings.length > 0;
  return report;
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
  /* Fire event через PayrollEvents */
  if (typeof PayrollEvents !== 'undefined') {
    PayrollEvents.emit('audit:created', {
      action: action,
      entityType: entityType,
      entityId: entityId
    });
  }

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

/**
 * Проверить и выполнить переход статуса периода с валидацией
 * Запрещает: paid→draft, locked mutation, exported rewrite, invalid rollback
 *
 * @param {String} current — текущий статус
 * @param {String} target — целевой статус
 * @returns {Object} { allowed: Boolean, error: String|null, auditAction: String|null }
 */
function validatePeriodTransition(current, target) {
  /* Запретить paid → что-либо */
  if (current === PR_PERIOD_STATUS.PAID) {
    return {
      allowed: false,
      error: 'paid_no_rollback',
      message: 'Оплаченный период не может быть изменён'
    };
  }

  /* Запретить locked → что-либо кроме exported */
  if (current === PR_PERIOD_STATUS.LOCKED && target !== PR_PERIOD_STATUS.EXPORTED) {
    return {
      allowed: false,
      error: 'locked_mutation',
      message: 'Заблокированный период можно только экспортировать'
    };
  }

  /* Запретить exported → rollback */
  if (current === PR_PERIOD_STATUS.EXPORTED && target !== PR_PERIOD_STATUS.PAID) {
    return {
      allowed: false,
      error: 'exported_no_rollback',
      message: 'Экспортированный период можно только отметить как оплаченный'
    };
  }

  /* Проверить допустимость перехода по state machine */
  if (!canTransitionPeriodStatus(current, target)) {
    return {
      allowed: false,
      error: 'invalid_transition',
      message: 'Переход ' + current + ' → ' + target + ' не допустим'
    };
  }

  return {
    allowed: true,
    error: null,
    message: null,
    auditAction: 'period_transition_' + current + '_to_' + target
  };
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
      /* КРИТИЧЕСКИ: НЕТ billableHours, НЕТ factHours, НЕТ clientAmount,
         НЕТ clientRate, НЕТ grossMargin, НЕТ marginPercent, НЕТ rate,
         НЕТ base, НЕТ payrollAmount, НЕТ overburnHours */
      reviewStatus: r.reviewStatus,
      managerComment: r.managerComment
    };
  });

  return {
    developerId: developerId,
    periodTasks: taskViews,
    summary: {
      taskCount: taskCount,
      totalPayrollHours: Math.round(totalPayrollHours * 10) / 10,
      /* КРИТИЧЕСКИ: НЕТ totalPayrollAmount, НЕТ rate — финансовая инфа */
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
 * Создать изменяемую копию замороженного snapshot
 * Снимает Object.freeze, позволяет редактировать данные
 * @param {Object} frozenSnapshot
 * @returns {Object} mutable deep copy
 */
function unfreezeSnapshot(frozenSnapshot) {
  return deepClone(frozenSnapshot);
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
 * Глубокая заморозка объекта (рекурсивный Object.freeze)
 * Замораживает все вложенные объекты, а не только верхний уровень.
 * @param {*} obj
 * @returns {*} замороженный объект
 */
function _deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  /* Сначала заморозить все вложенные объекты */
  Object.keys(obj).forEach(function(k) {
    var val = obj[k];
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      _deepFreeze(val);
    }
  });
  Object.freeze(obj);
  return obj;
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

/* ═══════════════════════════════════════════════════════════════
   PAYROLL EVENTS — Lightweight event bus

   Позволяет analytics, notifications, integrations, sync
   подписываться на события НЕ вторгаясь в core logic.

   События:
   - review:updated   — изменено поле ревью
   - review:approved  — ревью подтверждено
   - snapshot:created — создан snapshot
   - period:locked    — период заблокирован
   - export:generated — экспорт выполнен
   - validation:failed — валидация не прошла
   - audit:created    — создана запись аудита
   ═══════════════════════════════════════════════════════════════ */

var PayrollEvents = (function() {
  var _listeners = {};

  return {
    /**
     * Подписаться на событие
     * @param {String} event
     * @param {Function} callback
     * @returns {Function} unsubscribe function
     */
    on: function(event, callback) {
      if (typeof callback !== 'function') return function() {};
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(callback);

      /* Return unsubscribe function */
      return function() {
        if (!_listeners[event]) return;
        var idx = _listeners[event].indexOf(callback);
        if (idx >= 0) _listeners[event].splice(idx, 1);
      };
    },

    /**
     * Одноразовая подписка
     * @param {String} event
     * @param {Function} callback
     */
    once: function(event, callback) {
      var unsubscribe = this.on(event, function() {
        unsubscribe();
        callback.apply(null, arguments);
      });
      return unsubscribe;
    },

    /**
     * Отправить событие
     * @param {String} event
     * @param {Object} data
     */
    emit: function(event, data) {
      if (!_listeners[event]) return;
      var args = Array.prototype.slice.call(arguments, 1);
      _listeners[event].forEach(function(cb) {
        try {
          cb.apply(null, args);
        } catch(e) {
          console.error('PayrollEvents: error in listener for ' + event, e);
        }
      });
    },

    /**
     * Удалить все подписки для события
     * @param {String} event
     */
    off: function(event) {
      if (event) {
        delete _listeners[event];
      } else {
        _listeners = {};
      }
    },

    /**
     * Получить список событий с подписчиками (debug)
     * @returns {Array}
     */
    getActiveEvents: function() {
      var events = [];
      Object.keys(_listeners).forEach(function(k) {
        if (_listeners[k] && _listeners[k].length > 0) {
          events.push({ event: k, listenerCount: _listeners[k].length });
        }
      });
      return events;
    }
  };
})();
