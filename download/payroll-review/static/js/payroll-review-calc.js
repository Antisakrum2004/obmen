/* ═══════════════════════════════════════════════════════════════
   payroll-review-calc.js — Normalization & Aggregation Layer
   Чистые функции, НЕ зависят от DOM
   SECONDS и MINUTES — строки из Bitrix24 API
   ═══════════════════════════════════════════════════════════════ */

/* ─── Normalize single elapsed entry ─── */
function normalizeElapsed(entry) {
  if (!entry) return null;

  /* SECONDS — строка из Bitrix24 ("11400"), parseInt корректно обработает */
  var seconds = parseInt(entry.SECONDS || 0, 10);
  if (isNaN(seconds) || seconds < 0) return null;

  var taskId = String(entry.TASK_ID || '');
  var userId = String(entry.USER_ID || '');
  if (!taskId || !userId) return null;

  /* Filter unknown developers */
  if (DEV_IDS.indexOf(Number(userId)) < 0) return null;

  /* MINUTES — тоже строка из Bitrix24 ("190"), но пересчитываем из SECONDS для точности */
  var minutes = Math.round(seconds / 60);

  return {
    id: String(entry.ID || ''),
    taskId: taskId,
    userId: userId,
    seconds: seconds,
    minutes: minutes,
    hours: Math.round(minutes / 6) / 10, /* one decimal */
    comment: entry.COMMENT_TEXT || '',
    createdDate: (entry.CREATED_DATE || '').substring(0, 10),
    rawEntry: entry
  };
}

/* ─── Group elapsed by (taskId, userId) ─── */
function groupElapsedByTask(elapsedEntries) {
  var groups = {};
  var seen = {}; /* duplicate protection */

  elapsedEntries.forEach(function(entry) {
    var norm = normalizeElapsed(entry);
    if (!norm) return;

    /* Duplicate protection: same elapsed ID */
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

/* ─── Aggregate hours for a group ─── */
function aggregateTaskHours(group) {
  if (!group) return null;
  return {
    taskId: group.taskId,
    userId: group.userId,
    factHours: Math.round(group.totalMinutes / 6) / 10, /* one decimal */
    factMinutes: group.totalMinutes,
    entryCount: group.entries.length
  };
}

/* ─── Build TaskReview rows from raw data ─── */
function buildTaskReviewRows(data, savedReviews) {
  if (!data || !data.elapsed) return [];

  var groups = groupElapsedByTask(data.elapsed);
  var tasksMeta = data.tasksMeta || {};
  var tasks = data.tasks || [];
  var projects = data.projects || {};

  /* Build task title lookup */
  var taskTitles = {};
  tasks.forEach(function(t) {
    var id = String(t.id || t.ID);
    var ti = t.title || t.TITLE || '';
    if (id && ti) taskTitles[id] = ti;
  });

  /* Merge with tasksMeta */
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
    var developerName = DEVELOPERS[agg.userId] || ('ID ' + agg.userId);
    var rate = prGetRate(agg.userId);

    /* Check for saved review (manager adjustments) */
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
      rate: saved ? saved.rate : rate,
      payrollAmount: 0, /* computed below */
      reviewStatus: saved ? saved.reviewStatus : 'pending',
      managerComment: saved ? saved.managerComment : '',
      updatedAt: saved ? saved.updatedAt : Date.now(),
      entryCount: agg.entryCount,
      _reviewKey: reviewKey
    });
  });

  /* Compute payrollAmount */
  rows.forEach(function(r) {
    r.payrollAmount = Math.round(r.payrollHours * r.rate);
  });

  /* Sort: pending first, then by developer name, then by task title */
  rows.sort(function(a, b) {
    if (a.reviewStatus === 'pending' && b.reviewStatus !== 'pending') return -1;
    if (a.reviewStatus !== 'pending' && b.reviewStatus === 'pending') return 1;
    var dComp = a.developerName.localeCompare(b.developerName);
    if (dComp !== 0) return dComp;
    return a.taskTitle.localeCompare(b.taskTitle);
  });

  return rows;
}

/* ─── Build PayrollProjection (per developer) ─── */
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
    d.totalAmount += r.payrollAmount;
    d.taskCount++;
    if (r.reviewStatus === 'approved') d.approvedCount++;
    if (r.reviewStatus === 'pending') d.pendingCount++;
    if (r.reviewStatus === 'disputed') d.disputedCount++;
  });

  /* Round values */
  Object.keys(byDev).forEach(function(uid) {
    var d = byDev[uid];
    d.totalFactHours = Math.round(d.totalFactHours * 10) / 10;
    d.totalBillable = Math.round(d.totalBillable * 10) / 10;
    d.totalPayroll = Math.round(d.totalPayroll * 10) / 10;
    d.approvalRate = d.taskCount > 0 ? Math.round(d.approvedCount / d.taskCount * 100) : 0;
  });

  /* Sort by totalAmount desc */
  var result = Object.values(byDev).sort(function(a, b) { return b.totalAmount - a.totalAmount; });
  return result;
}

/* ─── Compute period totals ─── */
function buildPeriodTotals(rows) {
  var totals = {
    totalFactHours: 0,
    totalBillable: 0,
    totalPayroll: 0,
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

  return totals;
}
