/* ═══════════════════════════════════════════════════════════════
   payroll-projection.js — Слой прогнозов и агрегации
   Вычисляет прогнозы выплат, маржу, итоги периода.
   НЕ зависит от DOM. НЕ читает DOM.

   v1.1.0 — Performance: memoization для projection/totals
   ═══════════════════════════════════════════════════════════════ */

/* ─── Кэш projections/totals для производительности ─── */
var _projectionCache = {
  key: null,
  projection: null,
  totals: null,
  rowsHash: null
};

/**
 * Вычислить простой хеш массива rows для инвалидации кэша
 * @param {Array} rows
 * @returns {String}
 */
function _computeRowsHash(rows) {
  if (!rows || !rows.length) return 'empty';
  var hash = 5381;
  /* Полный проход — не сэмплируем, чтобы не пропустить изменения в конце списка */
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var str = (r._reviewKey || '') + ':' +
      (r.payrollHours || 0) + ':' +
      (r.billableHours || 0) + ':' +
      (r.reviewStatus || '') + ':' +
      (r.payrollAmount || 0) + ':' +
      (r.version || 0);
    for (var j = 0; j < str.length; j++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(j);
      hash = hash & hash;
    }
  }
  return 'h_' + Math.abs(hash).toString(36) + '_' + rows.length;
}

/**
 * Получить MonthlyProjection с кэшированием
 * Кэш инвалидируется при изменении rows
 * @param {Array} reviews — TaskReview[]
 * @returns {Array} DeveloperProjection[]
 */
function buildMonthlyProjectionCached(reviews) {
  var hash = _computeRowsHash(reviews);
  if (_projectionCache.rowsHash === hash && _projectionCache.projection) {
    return _projectionCache.projection;
  }
  var projection = buildMonthlyProjection(reviews);
  _projectionCache.rowsHash = hash;
  _projectionCache.projection = projection;
  return projection;
}

/**
 * Получить PeriodTotals с кэшированием
 * @param {Array} reviews — TaskReview[]
 * @returns {Object} PeriodTotals
 */
function buildPeriodTotalsCached(reviews) {
  var hash = _computeRowsHash(reviews);
  if (_projectionCache.rowsHash === hash && _projectionCache.totals) {
    return _projectionCache.totals;
  }
  var totals = buildPeriodTotals(reviews);
  _projectionCache.rowsHash = hash;
  _projectionCache.totals = totals;
  return totals;
}

/**
 * Сбросить кэш projections/totals
 */
function invalidateProjectionCache() {
  _projectionCache.rowsHash = null;
  _projectionCache.projection = null;
  _projectionCache.totals = null;
}

/* ═══════════════════════════════════════════════════════════════
   Месячный прогноз по разработчикам
   ═══════════════════════════════════════════════════════════════ */

/**
 * Построить прогноз выплат по разработчикам
 * @param {Array} reviews — TaskReview[]
 * @returns {Array} DeveloperProjection[]
 */
function buildMonthlyProjection(reviews) {
  var byDev = {};

  (reviews || []).forEach(function(r) {
    if (r.reviewStatus === PR_REVIEW_STATUS.EXCLUDED) return;
    var uid = String(r.developerId);

    if (!byDev[uid]) {
      byDev[uid] = {
        developerId: uid,
        developerName: r.developerName,
        totalFactHours: 0,
        totalBillable: 0,
        totalPayroll: 0,
        totalBase: 0,
        totalFine: 0,
        totalAmount: 0,
        taskCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        disputedCount: 0,
        excludedCount: 0,
        projects: {}
      };
    }

    var d = byDev[uid];
    d.totalFactHours += r.factHours;
    d.totalBillable += r.billableHours;
    d.totalPayroll += r.payrollHours;
    d.totalBase += r.base;
    d.totalAmount += r.payrollAmount;
    d.taskCount++;

    if (r.reviewStatus === PR_REVIEW_STATUS.APPROVED) d.approvedCount++;
    if (r.reviewStatus === PR_REVIEW_STATUS.PENDING) d.pendingCount++;
    if (r.reviewStatus === PR_REVIEW_STATUS.DISPUTED) d.disputedCount++;

    /* Собрать проекты */
    if (r.projectId && !d.projects[r.projectId]) {
      d.projects[r.projectId] = r.projectName;
    }
  });

  /* Округление и вычисление approvalRate */
  var result = Object.keys(byDev).map(function(uid) {
    var d = byDev[uid];
    d.totalFactHours = safeRound(d.totalFactHours, 1);
    d.totalBillable = safeRound(d.totalBillable, 1);
    d.totalPayroll = safeRound(d.totalPayroll, 1);

    /* Базовая выплата добавляется ОДИН раз (не на задачу) */
    var baseSalary = (typeof prGetBase === 'function') ? prGetBase(uid) : 0;
    d.totalBase = baseSalary;

    /* Штраф вычитается ОДИН раз */
    var fine = (typeof prGetFine === 'function') ? prGetFine(uid) : 0;
    d.totalFine = fine;

    /* totalAmount = сумма по задачам + базовая − штраф */
    d.totalAmount = d.totalAmount + baseSalary - fine;

    d.approvalRate = d.taskCount > 0 ? Math.round(d.approvedCount / d.taskCount * 100) : 0;

    /* Маржа: клиентская выручка (billable × clientRate) минус наши затраты (totalAmount)
       Клиент платит только за задачи по часам. Базовая — наш расход, не доход клиента. */
    var clientRate = (typeof prGetClientRate === 'function') ? prGetClientRate(uid) : ((typeof prGetRate === 'function') ? prGetRate(uid) : 0);
    var clientRevenue = d.totalBillable * clientRate;
    d.clientRevenue = Math.round(clientRevenue);
    d.clientRate = clientRate;
    d.marginPct = clientRevenue > 0
      ? Math.round((clientRevenue - d.totalAmount) / clientRevenue * 100)
      : 0;
    d.margin = safeRound(clientRevenue - d.totalAmount, 0);

    /* Количество проектов */
    d.projectCount = Object.keys(d.projects).length;
    d.projectNames = Object.values(d.projects).join(', ');

    return d;
  });

  /* Сортировка по сумме выплаты ↓ */
  result.sort(function(a, b) { return b.totalAmount - a.totalAmount; });

  return result;
}

/* ═══════════════════════════════════════════════════════════════
   Итоги периода
   ═══════════════════════════════════════════════════════════════ */

/**
 * Вычислить итоги периода
 * @param {Array} reviews — TaskReview[]
 * @returns {Object} PeriodTotals
 */
function buildPeriodTotals(reviews) {
  var totals = {
    totalFactHours: 0,
    totalBillable: 0,
    totalPayroll: 0,
    totalBase: 0,
    totalFine: 0,
    totalPayrollAmount: 0,
    totalMargin: 0,
    totalTasks: 0,
    approvedTasks: 0,
    pendingTasks: 0,
    disputedTasks: 0,
    excludedTasks: 0
  };

  (reviews || []).forEach(function(r) {
    totals.totalTasks++;
    if (r.reviewStatus === PR_REVIEW_STATUS.APPROVED) totals.approvedTasks++;
    if (r.reviewStatus === PR_REVIEW_STATUS.PENDING) totals.pendingTasks++;
    if (r.reviewStatus === PR_REVIEW_STATUS.DISPUTED) totals.disputedTasks++;
    if (r.reviewStatus === PR_REVIEW_STATUS.EXCLUDED) totals.excludedTasks++;

    if (r.reviewStatus !== PR_REVIEW_STATUS.EXCLUDED) {
      totals.totalFactHours += r.factHours;
      totals.totalBillable += r.billableHours;
      totals.totalPayroll += r.payrollHours;
      totals.totalPayrollAmount += r.payrollAmount;
    }
  });

  totals.totalFactHours = safeRound(totals.totalFactHours, 1);
  totals.totalBillable = safeRound(totals.totalBillable, 1);
  totals.totalPayroll = safeRound(totals.totalPayroll, 1);
  totals.totalPayrollAmount = Math.round(totals.totalPayrollAmount);

  /* Add base salary and fines per developer (not per task) */
  var totalBaseAll = 0;
  var totalFineAll = 0;
  if (typeof prGetBase === 'function') {
    var devIds = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS :
                 (typeof DEV_IDS !== 'undefined') ? DEV_IDS : [];
    devIds.forEach(function(devId) {
      totalBaseAll += prGetBase(devId);
      if (typeof prGetFine === 'function') totalFineAll += prGetFine(devId);
    });
  }
  totals.totalBase = totalBaseAll;
  totals.totalFine = totalFineAll;
  totals.totalPayrollAmount = totals.totalPayrollAmount + totalBaseAll - totalFineAll;

  /* Клиентская выручка: только billable × clientRate (клиент платит только за задачи по часам)
     Базовая/премия — это наш расход, клиент за них не платит */
  var totalClientRevenue = 0;
  var devIds = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS :
               (typeof DEV_IDS !== 'undefined') ? DEV_IDS : [];
  devIds.forEach(function(devId) {
    var cr = (typeof prGetClientRate === 'function') ? prGetClientRate(String(devId)) : ((typeof prGetRate === 'function') ? prGetRate(String(devId)) : 0);
    /* Считаем billable часы этого разраба из reviews */
    var devBillable = 0;
    (reviews || []).forEach(function(r) {
      if (String(r.developerId) === String(devId) && r.reviewStatus !== PR_REVIEW_STATUS.EXCLUDED) {
        devBillable += r.billableHours;
      }
    });
    totalClientRevenue += Math.round(devBillable * cr);
  });

  totals.totalClientRevenue = totalClientRevenue;
  totals.totalMargin = totalClientRevenue - totals.totalPayrollAmount;
  totals.totalMarginPct = totalClientRevenue > 0
    ? Math.round(totals.totalMargin / totalClientRevenue * 100)
    : 0;

  return totals;
}

/* ═══════════════════════════════════════════════════════════════
   Расчёт суммы выплаты
   ═══════════════════════════════════════════════════════════════ */

/**
 * Рассчитать сумму выплаты для одной записи
 * @param {Number} payrollHours
 * @param {Number} rate
 * @param {Number} base
 * @returns {Number}
 */
function calculatePayrollAmount(payrollHours, rate, base) {
  return Math.round((payrollHours || 0) * (rate || 0)) + (base || 0);
}

/**
 * Рассчитать маржу для одной записи
 * @param {Number} billableHours
 * @param {Number} payrollHours
 * @param {Number} rate
 * @returns {Number}
 */
function calculateMargin(billableHours, payrollHours, rate) {
  var billableRevenue = (billableHours || 0) * (rate || 0);
  var payrollCost = (payrollHours || 0) * (rate || 0);
  return Math.round(billableRevenue - payrollCost);
}

/* ═══════════════════════════════════════════════════════════════
   Сводка по разработчику
   ═══════════════════════════════════════════════════════════════ */

/**
 * Построить сводку по конкретному разработчику
 * @param {String} developerId
 * @param {Array} reviews
 * @returns {Object} DeveloperSummary
 */
function calculateDeveloperSummary(developerId, reviews) {
  var devReviews = (reviews || []).filter(function(r) {
    return String(r.developerId) === String(developerId);
  });

  var totalFact = 0, totalBill = 0, totalPay = 0, totalAmt = 0;
  var taskCount = devReviews.length;
  var approved = 0, pending = 0, disputed = 0, excluded = 0;
  var projectSet = {};

  devReviews.forEach(function(r) {
    totalFact += r.factHours;
    totalBill += r.billableHours;
    totalPay += r.payrollHours;
    totalAmt += r.payrollAmount;

    if (r.reviewStatus === PR_REVIEW_STATUS.APPROVED) approved++;
    if (r.reviewStatus === PR_REVIEW_STATUS.PENDING) pending++;
    if (r.reviewStatus === PR_REVIEW_STATUS.DISPUTED) disputed++;
    if (r.reviewStatus === PR_REVIEW_STATUS.EXCLUDED) excluded++;

    projectSet[r.projectId] = r.projectName;
  });

  var rate = 0;
  if (devReviews.length > 0) {
    rate = devReviews[0].rate;
  }

  return {
    developerId: developerId,
    developerName: devReviews.length > 0 ? devReviews[0].developerName : '',
    totalFactHours: safeRound(totalFact, 1),
    totalBillable: safeRound(totalBill, 1),
    totalPayroll: safeRound(totalPay, 1),
    totalPayrollAmount: Math.round(totalAmt),
    rate: rate,
    taskCount: taskCount,
    approvedCount: approved,
    pendingCount: pending,
    disputedCount: disputed,
    excludedCount: excluded,
    approvalRate: taskCount > 0 ? Math.round(approved / taskCount * 100) : 0,
    projectCount: Object.keys(projectSet).length,
    projectNames: Object.values(projectSet).join(', '),
    margin: calculateMargin(totalBill, totalPay, rate)
  };
}

/* ═══════════════════════════════════════════════════════════════
   Фильтрация
   ═══════════════════════════════════════════════════════════════ */

/**
 * Отфильтровать массив ревью по критериям
 * @param {Array} reviews
 * @param {Object} filters — { developer, project, status }
 * @returns {Array}
 */
function filterReviews(reviews, filters) {
  var f = filters || {};
  return (reviews || []).filter(function(r) {
    if (f.developer && String(r.developerId) !== String(f.developer)) return false;
    if (f.project && String(r.projectId) !== String(f.project)) return false;
    if (f.status && r.reviewStatus !== f.status) return false;
    return true;
  });
}

/**
 * Сортировать массив ревью
 * @param {Array} reviews
 * @param {String} field
 * @param {Number} direction — 1 (asc) или -1 (desc)
 * @returns {Array} новый отсортированный массив
 */
function sortReviews(reviews, field, direction) {
  var dir = direction || 1;
  return (reviews || []).slice().sort(function(a, b) {
    var va = a[field], vb = b[field];
    if (typeof va === 'string') return va.localeCompare(vb) * dir;
    return ((va || 0) - (vb || 0)) * dir;
  });
}

/**
 * Получить уникальные значения из массива ревью по полю
 * @param {Array} reviews
 * @param {String} field — 'developerId', 'projectId', etc.
 * @returns {Array} [{ id, name }]
 */
function getUniqueFieldValues(reviews, field) {
  var seen = {};
  var result = [];
  (reviews || []).forEach(function(r) {
    var id = String(r[field] || '');
    if (!seen[id]) {
      seen[id] = true;
      var nameField = field === 'developerId' ? 'developerName' :
                      field === 'projectId' ? 'projectName' : field;
      result.push({ id: id, name: r[nameField] || id });
    }
  });
  result.sort(function(a, b) { return a.name.localeCompare(b.name); });
  return result;
}

/**
 * Суммировать поле по массиву ревью (исключая excluded)
 * @param {Array} reviews
 * @param {String} field
 * @returns {Number}
 */
function sumReviewField(reviews, field) {
  var sum = 0;
  (reviews || []).forEach(function(r) {
    if (r.reviewStatus !== PR_REVIEW_STATUS.EXCLUDED) {
      sum += (r[field] || 0);
    }
  });
  return sum;
}
