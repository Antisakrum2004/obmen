/* ═══════════════════════════════════════════════════════════════
   payroll-review-calc.js — Слой нормализации и агрегации
   Чистые функции, НЕ зависят от DOM
   SECONDS и MINUTES — строки из Bitrix24 API
   ═══════════════════════════════════════════════════════════════ */

/* ─── Нормализация одной записи elapsed ─── */
function normalizeElapsed(entry) {
  if (!entry) return null;

  /* SECONDS — строка из Bitrix24 ("11400"), parseInt обработает */
  var seconds = parseInt(entry.SECONDS || 0, 10);
  if (isNaN(seconds) || seconds < 0) return null;

  var taskId = String(entry.TASK_ID || '');
  var userId = String(entry.USER_ID || '');
  if (!taskId || !userId) return null;

  /* Фильтр неизвестных и исключённых разработчиков */
  if (DEV_IDS.indexOf(Number(userId)) < 0) return null;
  if (typeof EXCLUDED_DEV_IDS !== 'undefined' && EXCLUDED_DEV_IDS[userId]) return null;

  /* MINUTES — тоже строка ("190"), пересчитываем из SECONDS для точности */
  var minutes = Math.round(seconds / 60);

  return {
    id: String(entry.ID || ''),
    taskId: taskId,
    userId: userId,
    seconds: seconds,
    minutes: minutes,
    hours: Math.round(minutes / 6) / 10, /* один знак после точки */
    comment: entry.COMMENT_TEXT || '',
    createdDate: (entry.CREATED_DATE || '').substring(0, 10),
    rawEntry: entry
  };
}

/* ─── Группировка elapsed по (taskId, userId) ─── */
function groupElapsedByTask(elapsedEntries) {
  var groups = {};
  var seen = {}; /* защита от дублей */

  elapsedEntries.forEach(function(entry) {
    var norm = normalizeElapsed(entry);
    if (!norm) return;

    /* Защита от дублей: один и тот же elapsed ID */
    if (norm.id && seen[norm.id]) return;
    if (norm.id) seen[norm.id] = true;

    var key = norm.taskId + '_' + norm.userId;
    if (!groups[key]) {
      groups[key] = {
        taskId: norm.taskId,
        userId: norm.userId,
        totalSeconds: 0,
        totalMinutes: 0,
        entries: []
      };
    }
    groups[key].totalSeconds += norm.seconds;
    groups[key].totalMinutes += norm.minutes;
    groups[key].entries.push(norm);
  });

  return groups;
}

/* ─── Агрегация часов для группы ─── */
function aggregateTaskHours(group) {
  if (!group) return null;
  return {
    taskId: group.taskId,
    userId: group.userId,
    factHours: Math.round(group.totalMinutes / 6) / 10,
    factMinutes: group.totalMinutes,
    entryCount: group.entries.length
  };
}

/* ─── Построить строки TaskReview из сырых данных ─── */
function buildTaskReviewRows(data, savedReviews) {
  if (!data || !data.elapsed) return [];

  var groups = groupElapsedByTask(data.elapsed);
  var tasksMeta = data.tasksMeta || {};
  var tasks = data.tasks || [];
  var projects = data.projects || {};

  /* Словарь названий задач */
  var taskTitles = {};
  tasks.forEach(function(t) {
    var id = String(t.id || t.ID);
    var ti = t.title || t.TITLE || '';
    if (id && ti) taskTitles[id] = ti;
  });

  /* Дополнить из tasksMeta */
  Object.keys(tasksMeta).forEach(function(tid) {
    if (!taskTitles[tid] && tasksMeta[tid].title) {
      taskTitles[tid] = tasksMeta[tid].title;
    }
  });

  var rows = [];
  Object.keys(groups).forEach(function(key) {
    var group = groups[key];
    var agg = aggregateTaskHours(group);
    if (!agg) return;

    var meta = tasksMeta[agg.taskId] || {};
    var gid = meta.groupId || '0';
    var projectName = (projects[gid] && projects[gid].name) || meta.groupName || PROJECTS[gid] || 'Без проекта';
    var developerName = prGetDevName(agg.userId);
    var rate = prGetRate(agg.userId);
    var base = prGetBase(agg.userId);

    /* Проверка сохранённого ревью (корректировки менеджера) */
    var reviewKey = agg.taskId + '_' + agg.userId;
    var saved = (savedReviews && savedReviews[reviewKey]) || null;

    rows.push({
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
      rate: rate,  /* always use live rate from prGetRate() — admin changes apply to all tasks */
      base: base,  /* always use live base from prGetBase() */
      payrollAmount: 0, /* вычисляется ниже */
      reviewStatus: saved ? saved.reviewStatus : 'pending',
      managerComment: saved ? saved.managerComment : '',
      updatedAt: saved ? saved.updatedAt : Date.now(),
      entryCount: agg.entryCount,
      _reviewKey: reviewKey
    });
  });

  /* Вычислить payrollAmount = часы × ставка (БЕЗ base — базовая выплата добавляется один раз по разрабу) */
  rows.forEach(function(r) {
    r.payrollAmount = Math.round(r.payrollHours * r.rate);
  });

  /* Сортировка: ожидает первой, потом по имени разработчика, потом по задаче */
  rows.sort(function(a, b) {
    if (a.reviewStatus === 'pending' && b.reviewStatus !== 'pending') return -1;
    if (a.reviewStatus !== 'pending' && b.reviewStatus === 'pending') return 1;
    var dComp = a.developerName.localeCompare(b.developerName);
    if (dComp !== 0) return dComp;
    return a.taskTitle.localeCompare(b.taskTitle);
  });

  return rows;
}

/* ─── Построить прогноз выплат (по разработчикам) ─── */
function buildPayrollProjection(rows) {
  var byDev = {};
  rows.forEach(function(r) {
    if (r.reviewStatus === 'excluded') return;
    var uid = r.developerId;
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
        disputedCount: 0
      };
    }
    var d = byDev[uid];
    d.totalFactHours += r.factHours;
    d.totalBillable += r.billableHours;
    d.totalPayroll += r.payrollHours;
    d.totalBase += r.base;
    d.totalAmount += r.payrollAmount;
    d.taskCount++;
    if (r.reviewStatus === 'approved') d.approvedCount++;
    if (r.reviewStatus === 'pending') d.pendingCount++;
    if (r.reviewStatus === 'disputed') d.disputedCount++;
  });

  /* Округление + base/fine per developer */
  Object.keys(byDev).forEach(function(uid) {
    var d = byDev[uid];
    d.totalFactHours = Math.round(d.totalFactHours * 10) / 10;
    d.totalBillable = Math.round(d.totalBillable * 10) / 10;
    d.totalPayroll = Math.round(d.totalPayroll * 10) / 10;

    /* Базовая выплата добавляется ОДИН раз */
    var baseSalary = (typeof prGetBase === 'function') ? prGetBase(uid) : 0;
    d.totalBase = baseSalary;

    /* Штраф вычитается ОДИН раз */
    var fine = (typeof prGetFine === 'function') ? prGetFine(uid) : 0;
    d.totalFine = fine;

    /* totalAmount = сумма по задачам + базовая − штраф */
    d.totalAmount = d.totalAmount + baseSalary - fine;

    /* Клиентская выручка и маржа (клиент платит только за задачи по часам) */
    var clientRate = (typeof prGetClientRate === 'function') ? prGetClientRate(uid) : (typeof prGetRate === 'function' ? prGetRate(uid) : 0);
    d.clientRevenue = Math.round(d.totalBillable * clientRate);
    d.clientRate = clientRate;
    d.marginPct = d.clientRevenue > 0
      ? Math.round((d.clientRevenue - d.totalAmount) / d.clientRevenue * 100)
      : 0;

    d.approvalRate = d.taskCount > 0 ? Math.round(d.approvedCount / d.taskCount * 100) : 0;
  });

  /* Сортировка по сумме выплаты ↓ */
  var result = Object.values(byDev).sort(function(a, b) { return b.totalAmount - a.totalAmount; });
  return result;
}

/* ─── Итоги периода ─── */
function buildPeriodTotals(rows) {
  var totals = {
    totalFactHours: 0,
    totalBillable: 0,
    totalPayroll: 0,
    totalBase: 0,
    totalFine: 0,
    totalPayrollAmount: 0,
    totalTasks: 0,
    approvedTasks: 0,
    pendingTasks: 0,
    disputedTasks: 0,
    excludedTasks: 0
  };

  rows.forEach(function(r) {
    totals.totalTasks++;
    if (r.reviewStatus === 'approved') totals.approvedTasks++;
    if (r.reviewStatus === 'pending') totals.pendingTasks++;
    if (r.reviewStatus === 'disputed') totals.disputedTasks++;
    if (r.reviewStatus === 'excluded') totals.excludedTasks++;

    if (r.reviewStatus !== 'excluded') {
      totals.totalFactHours += r.factHours;
      totals.totalBillable += r.billableHours;
      totals.totalPayroll += r.payrollHours;
      totals.totalPayrollAmount += r.payrollAmount;
    }
  });

  totals.totalFactHours = Math.round(totals.totalFactHours * 10) / 10;
  totals.totalBillable = Math.round(totals.totalBillable * 10) / 10;
  totals.totalPayroll = Math.round(totals.totalPayroll * 10) / 10;
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

  /* Клиентская выручка и общая маржа (клиент платит только за задачи по часам) */
  var totalClientRevenue = 0;
  if (typeof prGetClientRate === 'function' || typeof prGetRate === 'function') {
    var devIds = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS :
                 (typeof DEV_IDS !== 'undefined') ? DEV_IDS : [];
    devIds.forEach(function(devId) {
      var cr = (typeof prGetClientRate === 'function') ? prGetClientRate(devId) : (typeof prGetRate === 'function' ? prGetRate(devId) : 0);
      /* Считаем billable часы этого разраба из rows */
      var devBillable = 0;
      rows.forEach(function(r) {
        if (String(r.developerId) === String(devId) && r.reviewStatus !== 'excluded') {
          devBillable += r.billableHours;
        }
      });
      totalClientRevenue += Math.round(devBillable * cr);
    });
  }
  totals.totalClientRevenue = totalClientRevenue;
  totals.totalMargin = totalClientRevenue - totals.totalPayrollAmount;
  totals.totalMarginPct = totalClientRevenue > 0
    ? Math.round(totals.totalMargin / totalClientRevenue * 100)
    : 0;

  return totals;
}
