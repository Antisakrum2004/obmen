/* ═══════════════════════════════════════════════════════════════
   payroll-projection.js — Слой прогнозов и агрегации
   Вычисляет прогнозы выплат, маржу, итоги периода.
   НЕ зависит от DOM. НЕ читает DOM.
   ═══════════════════════════════════════════════════════════════ */

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
    d.approvalRate = d.taskCount > 0 ? Math.round(d.approvedCount / d.taskCount * 100) : 0;

    /* Маржа: billable revenue - payroll cost */
    d.margin = safeRound(d.totalBillable * d.totalAmount / (d.totalPayroll || 1) - d.totalAmount, 0);
    /* Если нет payroll часов, маржа = 0 */
    if (d.totalPayroll === 0) d.margin = 0;

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
      totals.totalBase += r.base;
      totals.totalPayrollAmount += r.payrollAmount;
    }
  });

  totals.totalFactHours = safeRound(totals.totalFactHours, 1);
  totals.totalBillable = safeRound(totals.totalBillable, 1);
  totals.totalPayroll = safeRound(totals.totalPayroll, 1);
  totals.totalPayrollAmount = Math.round(totals.totalPayrollAmount);

  /* Маржа: разница между billable revenue и payroll cost */
  var avgRate = totals.totalPayroll > 0 ? totals.totalPayrollAmount / totals.totalPayroll : 0;
  totals.totalMargin = safeRound(totals.totalBillable * avgRate - totals.totalPayrollAmount, 0);

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
