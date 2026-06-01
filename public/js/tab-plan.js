/* ═══════════════════════════════════════════════════════════════
   tab-plan.js — Вкладка ПЛАН (План-факт контроль выработки)
   v3.0.0 — Реальные данные из Bitrix24, план-факт по разрабам

   Логика:
   - Выбор разработчика → таблица по дням
   - План = 8ч × ставка разраба в день
   - Факт = Σ (часы_к_выставлению × ставка) по задачам дня
   - Клик на дату → модалка задач
   - Поле «часы к выставлению» — вручную, по умолчанию = факт часы
   - Факт пересчитывается по часам выставления, не по фактическим
   - Все изменения пишутся в лог событий
   ═══════════════════════════════════════════════════════════════ */

var _plan = {
  container: null,
  styleEl: null,
  data: null,              /* raw data from prLoadPeriodData */
  selectedDevId: '',       /* current developer ID */
  dailyMap: {},            /* dateStr -> {plan, fact, tasks[]} */
  billableOverrides: {},   /* taskId -> billable hours (saved overrides) */
  dayComments: {},         /* dateStr -> comment text */
  eventLog: [],            /* log of all changes */
  modalOpen: null,         /* null | 'tasks' | 'taskDetail' | 'admin' */
  modalDate: '',           /* date for tasks modal */
  modalTaskId: '',         /* taskId for detail modal */
  loading: false,
  adminSaveMsg: null,      /* flash message after save */
  adminChangedDevs: {}     /* devId -> true for green highlight */
};

/* ═══════════════════════════════════════════════════════════════
   РЕГИСТРАЦИЯ МОДУЛЯ
   ═══════════════════════════════════════════════════════════════ */
window.TabPlan = {
  render: function(container) {
    if (!container) return;
    _plan.container = container;
    if (!_plan.styleEl && typeof PLAN_CSS !== 'undefined') {
      _plan.styleEl = document.createElement('style');
      _plan.styleEl.textContent = PLAN_CSS;
      document.head.appendChild(_plan.styleEl);
    }
    _planLoadOverrides();
    _planLoadComments();
    _planLoadEventLog();
    _planLoadData();
  },
  destroy: function() {
    if (_plan.styleEl && _plan.styleEl.parentNode) {
      _plan.styleEl.parentNode.removeChild(_plan.styleEl);
      _plan.styleEl = null;
    }
    _plan.container = null;
    _plan.data = null;
  },
  refresh: function() {
    _planLoadData();
  }
};

/* ═══════════════════════════════════════════════════════════════
   ХРАНИЛИЩЕ ПЕРЕОПРЕДЕЛЕНИЙ (overrides) и ЛОГА
   ═══════════════════════════════════════════════════════════════ */
function _planStorageKey() {
  return 'pr_plan_bill_' + prCurrentPeriod.year + '_' + String(prCurrentPeriod.month).padStart(2, '0');
}
function _planLogKey() {
  return 'pr_plan_log_' + prCurrentPeriod.year + '_' + String(prCurrentPeriod.month).padStart(2, '0');
}

function _planLoadOverrides() {
  try {
    var raw = localStorage.getItem(_planStorageKey());
    _plan.billableOverrides = raw ? JSON.parse(raw) : {};
  } catch(e) { _plan.billableOverrides = {}; }
}

function _planSaveOverrides() {
  try {
    localStorage.setItem(_planStorageKey(), JSON.stringify(_plan.billableOverrides));
  } catch(e) {}
}

function _planCommentsKey() {
  return 'pr_plan_cmt_' + prCurrentPeriod.year + '_' + String(prCurrentPeriod.month).padStart(2, '0');
}

function _planLoadComments() {
  try {
    var raw = localStorage.getItem(_planCommentsKey());
    _plan.dayComments = raw ? JSON.parse(raw) : {};
  } catch(e) { _plan.dayComments = {}; }
}

function _planSaveComments() {
  try {
    localStorage.setItem(_planCommentsKey(), JSON.stringify(_plan.dayComments));
  } catch(e) {}
}

function _planLoadEventLog() {
  try {
    var raw = localStorage.getItem(_planLogKey());
    _plan.eventLog = raw ? JSON.parse(raw) : [];
  } catch(e) { _plan.eventLog = []; }
}

function _planSaveEventLog() {
  try {
    /* Keep last 200 entries */
    if (_plan.eventLog.length > 200) _plan.eventLog = _plan.eventLog.slice(-200);
    localStorage.setItem(_planLogKey(), JSON.stringify(_plan.eventLog));
  } catch(e) {}
}

function _planLogEvent(action, detail) {
  _plan.eventLog.push({
    ts: new Date().toISOString(),
    dev: _plan.selectedDevId ? prGetDevName(_plan.selectedDevId) : '',
    action: action,
    detail: detail
  });
  _planSaveEventLog();
}

/* ═══════════════════════════════════════════════════════════════
   ЗАГРУЗКА ДАННЫХ
   ═══════════════════════════════════════════════════════════════ */
function _planLoadData() {
  if (!_plan.container) return;
  _plan.loading = true;
  _planRenderAll();

  prLoadPeriodData(prCurrentPeriod.year, prCurrentPeriod.month).then(function(data) {
    _plan.data = data;
    _plan.loading = false;
    /* Auto-select first dev if none selected */
    if (!_plan.selectedDevId && typeof ACTIVE_DEV_IDS !== 'undefined' && ACTIVE_DEV_IDS.length) {
      _plan.selectedDevId = String(ACTIVE_DEV_IDS[0]);
    }
    _planBuildDailyMap();
    _planRenderAll();
  }).catch(function(e) {
    console.error('_planLoadData error', e);
    _plan.loading = false;
    _planRenderAll();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ПОСТРОЕНИЕ КАРТЫ ПО ДНЯМ
   ═══════════════════════════════════════════════════════════════ */
function _planBuildDailyMap() {
  _plan.dailyMap = {};
  if (!_plan.data || !_plan.selectedDevId) return;

  var devId = _plan.selectedDevId;
  var rate = prGetRate(devId);
  var year = prCurrentPeriod.year;
  var month = prCurrentPeriod.month;
  var daysInMonth = new Date(year, month, 0).getDate();

  /* Init all days */
  for (var d = 1; d <= daysInMonth; d++) {
    var dt = new Date(year, month - 1, d);
    var dow = dt.getDay();
    var isWknd = (dow === 0 || dow === 6);
    var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    _plan.dailyMap[dateStr] = {
      plan: isWknd ? 0 : 8 * rate,
      fact: 0,
      tasks: [],
      isWeekend: isWknd
    };
  }

  /* Group elapsed by date for this developer */
  var elapsed = _plan.data.elapsed || [];
  var tasksMeta = _plan.data.tasksMeta || {};

  elapsed.forEach(function(e) {
    if (String(e.USER_ID) !== String(devId)) return;
    var dateStr = (e.CREATED_DATE || '').substring(0, 10);
    if (!_plan.dailyMap[dateStr]) return;

    var taskId = String(e.TASK_ID);
    var factMinutes = parseInt(e.MINUTES || e.SECONDS / 60 || 0);
    var factHours = safeRound(factMinutes / 60, 2);

    /* Check if task already in this day */
    var existing = null;
    _plan.dailyMap[dateStr].tasks.forEach(function(t) {
      if (t.taskId === taskId) existing = t;
    });

    if (existing) {
      existing.factHours = safeRound(existing.factHours + factHours, 2);
      existing.factMinutes += factMinutes;
      existing.elapsedEntries.push(e);
    } else {
      var meta = tasksMeta[taskId] || {};
      var overrideKey = taskId + '_' + dateStr;
      var billableHours = (_plan.billableOverrides[overrideKey] !== undefined)
        ? _plan.billableOverrides[overrideKey]
        : factHours;

      _plan.dailyMap[dateStr].tasks.push({
        taskId: taskId,
        title: meta.title || ('Задача ' + taskId),
        projectName: meta.groupName || '',
        projectId: meta.groupId || '',
        status: meta.status || '',
        factHours: factHours,
        factMinutes: factMinutes,
        billableHours: billableHours,
        comment: e.COMMENT_TEXT || '',
        elapsedEntries: [e]
      });
    }
  });

  /* Calculate fact per day = Σ (billableHours × rate) */
  Object.keys(_plan.dailyMap).forEach(function(dateStr) {
    var day = _plan.dailyMap[dateStr];
    var factSum = 0;
    day.tasks.forEach(function(t) {
      factSum += t.billableHours * rate;
    });
    day.fact = Math.round(factSum);
  });
}

function safeRound(n, d) {
  var f = Math.pow(10, d || 0);
  return Math.round(n * f) / f;
}

/* ═══════════════════════════════════════════════════════════════
   РЕНДЕРИНГ
   ═══════════════════════════════════════════════════════════════ */
function _planRenderAll() {
  if (!_plan.container) return;
  var h = '';
  h += _planRenderHeader();
  if (_plan.loading) {
    h += '<div class="plan-loading"><div class="pr-ring"></div><div>Загрузка данных...</div></div>';
  } else if (!_plan.data) {
    h += '<div class="plan-empty">Нет данных. Нажмите обновить.</div>';
  } else {
    h += _planRenderSummary();
    h += _planRenderTable();
    h += _planRenderEventLog();
  }
  /* Modals rendered outside main flow */
  h += _planRenderTasksModal();
  h += _planRenderTaskDetailModal();
  h += _planRenderAdminModal();
  _plan.container.innerHTML = h;
  _planAttachKeys();
}

/* ─── Header with dev selector ─── */
function _planRenderHeader() {
  var h = '<div class="plan-doc-header">';
  h += '<div class="plan-doc-title">';
  h += 'План-факт контроль';
  if (_plan.selectedDevId) {
    h += ' <span class="plan-doc-num">' + esc(prGetDevName(_plan.selectedDevId)) + '</span>';
  }
  h += ' <span class="plan-doc-date">' + (typeof МЕСЯЦЫ_ПОЛН !== 'undefined' ? МЕСЯЦЫ_ПОЛН[prCurrentPeriod.month - 1] + ' ' + prCurrentPeriod.year : '') + '</span>';
  h += '</div>';

  h += '<div class="plan-actions">';
  h += '<select class="plan-req-input plan-dev-select" onchange="_planOnDevChange(this.value)">';
  if (typeof ACTIVE_DEV_IDS !== 'undefined') {
    ACTIVE_DEV_IDS.forEach(function(id) {
      var sel = String(id) === String(_plan.selectedDevId) ? ' selected' : '';
      h += '<option value="' + id + '"' + sel + '>' + esc(prGetDevName(String(id))) + '</option>';
    });
  }
  h += '</select>';

  /* Period select */
  h += '<select class="plan-req-input" onchange="_planOnPeriodChange(this.value)">';
  var now = new Date();
  for (var i = 0; i < 3; i++) {
    var dd = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var yy = dd.getFullYear(), mm = dd.getMonth() + 1;
    var sel2 = (yy === prCurrentPeriod.year && mm === prCurrentPeriod.month) ? ' selected' : '';
    var lbl = (typeof МЕСЯЦЫ_ПОЛН !== 'undefined') ? МЕСЯЦЫ_ПОЛН[mm - 1] + ' ' + yy : yy + '-' + mm;
    h += '<option value="' + yy + '-' + mm + '"' + sel2 + '>' + esc(lbl) + '</option>';
  }
  h += '</select>';

  h += '<button class="plan-btn plan-btn-ghost" onclick="window.TabPlan.refresh()">&#8635; Обновить</button>';
  h += '<button class="plan-btn plan-btn-yellow" onclick="_planOpenAdmin()">&#9881; Админка</button>';
  h += '</div>';

  /* Info line */
  if (_plan.selectedDevId) {
    var rate = prGetRate(_plan.selectedDevId);
    var base = prGetBase(_plan.selectedDevId);
    h += '<div class="plan-info-line">';
    h += '<span>Ставка: <strong>' + rate + ' р/ч</strong></span>';
    h += '<span>План/день: <strong>' + _planFmtMoney(8 * rate) + '</strong></span>';
    if (base > 0) h += '<span>Оклад: <strong>' + _planFmtMoney(base) + '</strong></span>';
    h += '</div>';
  }

  h += '</div>';
  return h;
}

/* ─── Summary block ─── */
function _planRenderSummary() {
  var totalPlan = 0, totalFact = 0, workDays = 0;
  Object.keys(_plan.dailyMap).forEach(function(dateStr) {
    var day = _plan.dailyMap[dateStr];
    totalPlan += day.plan;
    totalFact += day.fact;
    if (!day.isWeekend) workDays++;
  });
  var diff = totalFact - totalPlan;
  var diffCls = diff >= 0 ? 'val-diff-pos' : 'val-diff-neg';
  var diffPrefix = diff >= 0 ? '+ ' : '';
  var pct = totalPlan > 0 ? Math.round(totalFact / totalPlan * 100) : 0;

  var h = '<div class="plan-summary">';
  h += '<div class="plan-summary-title">Итого за период</div>';
  h += '<div class="plan-summary-grid">';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">Раб. дней</div><div class="plan-summary-value" style="font-size:18px;color:var(--text2)">' + workDays + '</div></div>';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">План</div><div class="plan-summary-value val-plan">' + _planFmtMoney(totalPlan) + '</div></div>';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">Факт</div><div class="plan-summary-value val-fact">' + _planFmtMoney(totalFact) + '</div></div>';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">Разница (' + pct + '%)</div><div class="plan-summary-value ' + diffCls + '">' + diffPrefix + _planFmtMoney(diff) + '</div></div>';
  h += '</div></div>';
  return h;
}

/* ─── Main table ─── */
function _planRenderTable() {
  var h = '<div class="plan-table-wrap" style="max-height:520px;overflow-y:auto">';
  h += '<table class="plan-table" style="table-layout:fixed">';
  h += '<colgroup>';
  h += '<col style="width:30px">';
  h += '<col style="width:90px">';
  h += '<col style="width:80px">';
  h += '<col style="width:80px">';
  h += '<col style="width:80px">';
  h += '<col style="width:40px">';
  h += '<col style="width:40%">';
  h += '</colgroup>';
  h += '<thead><tr>';
  h += '<th>N</th>';
  h += '<th>Дата</th>';
  h += '<th style="text-align:right">План</th>';
  h += '<th style="text-align:right">Факт</th>';
  h += '<th style="text-align:right">Разн.</th>';
  h += '<th style="text-align:center">∑</th>';
  h += '<th>Комментарий</th>';
  h += '</tr></thead><tbody>';

  var idx = 0;
  var totalPlan = 0, totalFact = 0;
  var dates = Object.keys(_plan.dailyMap).sort();
  var rate = prGetRate(_plan.selectedDevId);

  dates.forEach(function(dateStr) {
    var day = _plan.dailyMap[dateStr];
    idx++;
    var diff = day.fact - day.plan;
    var diffCls = diff >= 0 ? 'pos' : 'neg';
    var diffPrefix = diff >= 0 ? '+' : '';
    var wkendCls = day.isWeekend ? ' class="row-weekend"' : '';
    var dayName = _planGetDayName(dateStr);
    var taskCount = day.tasks.length;
    var comment = _plan.dayComments[dateStr] || '';

    totalPlan += day.plan;
    totalFact += day.fact;

    h += '<tr' + wkendCls + '>';
    h += '<td class="cell-num">' + idx + '</td>';
    h += '<td class="cell-date" style="cursor:pointer" onclick="_planOpenTasksModal(\'' + dateStr + '\')">' + _planFormatDateRu(dateStr) + '<span class="day-name">' + dayName + '</span></td>';
    h += '<td class="cell-money">' + (day.plan > 0 ? _planFmtMoney(day.plan) : '—') + '</td>';
    h += '<td class="cell-money" style="color:var(--green)">' + (day.fact > 0 ? _planFmtMoney(day.fact) : '—') + '</td>';
    h += '<td class="cell-money ' + diffCls + '">' + (day.plan > 0 || day.fact > 0 ? diffPrefix + _planFmtMoney(diff) : '—') + '</td>';
    h += '<td style="text-align:center">' + (taskCount > 0 ? '<span class="plan-task-count">' + taskCount + '</span>' : '—') + '</td>';
    h += '<td class="cell-comment"><input class="plan-comment-input" type="text" value="' + esc(comment) + '" data-date="' + dateStr + '" onchange="_planOnCommentChange(this)" placeholder="Комментарий..." onclick="event.stopPropagation()" onfocus="this.select()"></td>';
    h += '</tr>';
  });

  h += '</tbody>';
  var totalDiff = totalFact - totalPlan;
  var totalDiffCls = totalDiff >= 0 ? 'pos' : 'neg';
  var totalDiffPrefix = totalDiff >= 0 ? '+ ' : '';
  h += '<tfoot><tr>';
  h += '<td colspan="2" style="font-weight:700;color:var(--text)">Итого:</td>';
  h += '<td class="cell-money" style="color:var(--accent)">' + _planFmtMoney(totalPlan) + '</td>';
  h += '<td class="cell-money" style="color:var(--green)">' + _planFmtMoney(totalFact) + '</td>';
  h += '<td class="cell-money ' + totalDiffCls + '">' + totalDiffPrefix + _planFmtMoney(totalDiff) + '</td>';
  h += '<td></td>';
  h += '<td></td>';
  h += '</tr></tfoot></table></div>';
  return h;
}

/* ─── Tasks modal (click on date) ─── */
function _planRenderTasksModal() {
  if (_plan.modalOpen !== 'tasks') return '';
  var day = _plan.dailyMap[_plan.modalDate];
  if (!day) return '';

  var rate = prGetRate(_plan.selectedDevId);
  var h = '<div class="modal-overlay open" id="planTasksModal" onclick="if(event.target===this)_planCloseModal()">';
  h += '<div class="modal" style="max-width:900px">';
  h += '<div class="modal-header">';
  h += '<span class="modal-title">Задачи — ' + _planFormatDateRu(_plan.modalDate) + ' (' + _planGetDayName(_plan.modalDate) + ')</span>';
  h += '<button class="modal-close" onclick="_planCloseModal()">&times;</button>';
  h += '</div>';
  h += '<div class="modal-body" style="padding:12px 16px">';

  if (!day.tasks.length) {
    h += '<div class="plan-empty">Нет задач за этот день</div>';
  } else {
    h += '<table class="plan-table" style="min-width:auto">';
    h += '<thead><tr>';
    h += '<th>Задача</th>';
    h += '<th style="width:90px;text-align:right">Факт ч.</th>';
    h += '<th style="width:110px;text-align:right">Часы выставл.</th>';
    h += '<th style="width:100px;text-align:right">Сумма</th>';
    h += '</tr></thead><tbody>';

    day.tasks.forEach(function(t) {
      var amount = t.billableHours * rate;
      var overrideKey = t.taskId + '_' + _plan.modalDate;
      var isOverridden = _plan.billableOverrides[overrideKey] !== undefined;

      h += '<tr class="plan-task-row" onclick="_planOpenTaskDetail(\'' + t.taskId + '\',\'' + _plan.modalDate + '\')" style="cursor:pointer">';
      h += '<td>';
      h += '<div class="plan-task-title">' + esc(t.title) + '</div>';
      if (t.projectName) h += '<div class="plan-task-project">' + esc(t.projectName) + '</div>';
      h += '</td>';
      h += '<td class="cell-money">' + t.factHours.toFixed(1) + '</td>';
      h += '<td style="text-align:right">';
      h += '<input class="plan-edit' + (isOverridden ? ' changed' : '') + '" type="text" value="' + t.billableHours.toFixed(1) + '" data-task="' + t.taskId + '" data-date="' + _plan.modalDate + '" onchange="_planOnBillableChange(this)" onclick="event.stopPropagation()" onfocus="this.select()">';
      h += '</td>';
      h += '<td class="cell-money" style="color:var(--green)">' + _planFmtMoney(amount) + '</td>';
      h += '</tr>';
    });

    h += '</tbody></table>';
  }

  h += '</div>';
  h += '<div class="modal-footer">';
  h += '<span style="font-family:var(--mono);font-size:9px;color:var(--text3)">Клик на задачу — детали | Часы выставл. — редактируются</span>';
  h += '<button class="plan-btn plan-btn-ghost" onclick="_planCloseModal()">Закрыть (Esc)</button>';
  h += '</div></div></div>';
  return h;
}

/* ─── Task detail modal ─── */
function _planRenderTaskDetailModal() {
  if (_plan.modalOpen !== 'taskDetail') return '';
  /* Find the task */
  var day = _plan.dailyMap[_plan.modalDate];
  if (!day) return '';
  var task = null;
  day.tasks.forEach(function(t) { if (t.taskId === _plan.modalTaskId) task = t; });
  if (!task) return '';

  var rate = prGetRate(_plan.selectedDevId);
  var h = '<div class="modal-overlay open" id="planTaskDetailModal" onclick="if(event.target===this)_planCloseTaskDetail()">';
  h += '<div class="modal" style="max-width:700px">';
  h += '<div class="modal-header">';
  h += '<span class="modal-title">' + esc(task.title) + '</span>';
  h += '<button class="modal-close" onclick="_planCloseTaskDetail()">&times;</button>';
  h += '</div>';
  h += '<div class="modal-body">';

  h += '<div class="plan-detail-grid">';
  h += '<div class="plan-detail-item"><span class="plan-detail-label">Проект</span><span class="plan-detail-val">' + esc(task.projectName || '—') + '</span></div>';
  h += '<div class="plan-detail-item"><span class="plan-detail-label">ID задачи</span><span class="plan-detail-val">' + esc(task.taskId) + '</span></div>';
  h += '<div class="plan-detail-item"><span class="plan-detail-label">Факт часы</span><span class="plan-detail-val" style="color:var(--accent)">' + task.factHours.toFixed(1) + ' ч</span></div>';
  h += '<div class="plan-detail-item"><span class="plan-detail-label">Часы к выставлению</span><span class="plan-detail-val" style="color:var(--green)">' + task.billableHours.toFixed(1) + ' ч</span></div>';
  h += '<div class="plan-detail-item"><span class="plan-detail-label">Ставка</span><span class="plan-detail-val">' + rate + ' р/ч</span></div>';
  h += '<div class="plan-detail-item"><span class="plan-detail-label">Сумма к выплате</span><span class="plan-detail-val" style="color:var(--orange)">' + _planFmtMoney(task.billableHours * rate) + '</span></div>';
  h += '</div>';

  /* Elapsed entries */
  if (task.elapsedEntries && task.elapsedEntries.length) {
    h += '<div class="plan-detail-section">Списания времени</div>';
    h += '<table class="plan-table" style="min-width:auto;margin-top:6px">';
    h += '<thead><tr><th>Время</th><th>Комментарий</th></tr></thead><tbody>';
    task.elapsedEntries.forEach(function(e) {
      var mins = parseInt(e.MINUTES || (parseInt(e.SECONDS || 0) / 60) || 0);
      var hrs = safeRound(mins / 60, 2);
      h += '<tr><td class="cell-money">' + hrs.toFixed(1) + ' ч</td>';
      h += '<td style="font-family:var(--sans);font-size:11px;color:var(--text2)">' + esc(e.COMMENT_TEXT || '—') + '</td></tr>';
    });
    h += '</tbody></table>';
  }

  h += '</div>';
  h += '<div class="modal-footer">';
  h += '<button class="plan-btn plan-btn-ghost" onclick="_planCloseTaskDetail()">Назад (Esc)</button>';
  h += '</div></div></div>';
  return h;
}

/* ─── Event log ─── */
function _planRenderEventLog() {
  if (!_plan.eventLog.length) return '';
  var h = '<div class="plan-log-section">';
  h += '<div class="plan-log-title">Лог изменений</div>';
  h += '<div class="plan-log-body">';

  /* Show last 20 entries, newest first */
  var entries = _plan.eventLog.slice(-20).reverse();
  entries.forEach(function(e) {
    var ts = e.ts ? e.ts.substring(11, 19) : '';
    h += '<div class="plan-log-row">';
    h += '<span class="plan-log-time">' + ts + '</span>';
    h += '<span class="plan-log-dev">' + esc(e.dev) + '</span>';
    h += '<span class="plan-log-action">' + esc(e.action) + '</span>';
    h += '<span class="plan-log-detail">' + esc(e.detail) + '</span>';
    h += '</div>';
  });

  h += '</div></div>';
  return h;
}

/* ═══════════════════════════════════════════════════════════════
   ОБРАБОТЧИКИ
   ═══════════════════════════════════════════════════════════════ */
function _planOnDevChange(devId) {
  _plan.selectedDevId = String(devId);
  _planLoadOverrides();
  _planLoadComments();
  _planBuildDailyMap();
  _planLogEvent('Выбор разработчика', prGetDevName(devId));
  _planRenderAll();
}

function _planOnPeriodChange(val) {
  var parts = val.split('-');
  prCurrentPeriod.year = parseInt(parts[0]);
  prCurrentPeriod.month = parseInt(parts[1]);
  _planLoadOverrides();
  _planLoadComments();
  _planLoadEventLog();
  _planLoadData();
}

function _planOpenTasksModal(dateStr) {
  _plan.modalOpen = 'tasks';
  _plan.modalDate = dateStr;
  _planRenderAll();
}

function _planCloseModal() {
  _plan.modalOpen = null;
  _plan.modalDate = '';
  _planRenderAll();
}

function _planOpenTaskDetail(taskId, dateStr) {
  _plan.modalOpen = 'taskDetail';
  _plan.modalDate = dateStr;
  _plan.modalTaskId = taskId;
  _planRenderAll();
}

function _planCloseTaskDetail() {
  _plan.modalOpen = 'tasks';
  _plan.modalTaskId = '';
  _planRenderAll();
}

function _planOnBillableChange(el) {
  var taskId = el.getAttribute('data-task');
  var dateStr = el.getAttribute('data-date');
  var raw = el.value.replace(/[^\d.,]/g, '').replace(',', '.');
  var val = parseFloat(raw) || 0;

  var overrideKey = taskId + '_' + dateStr;
  var oldVal = _plan.billableOverrides[overrideKey];

  _plan.billableOverrides[overrideKey] = val;
  _planSaveOverrides();

  /* Update the task in dailyMap */
  var day = _plan.dailyMap[dateStr];
  if (day) {
    day.tasks.forEach(function(t) {
      if (t.taskId === taskId) {
        var oldBill = t.billableHours;
        t.billableHours = val;
      }
    });
    /* Recalculate day fact */
    var rate = prGetRate(_plan.selectedDevId);
    var factSum = 0;
    day.tasks.forEach(function(t) { factSum += t.billableHours * rate; });
    day.fact = Math.round(factSum);
  }

  /* Log the change */
  var taskTitle = 'Задача ' + taskId;
  if (day) {
    day.tasks.forEach(function(t) { if (t.taskId === taskId) taskTitle = t.title; });
  }
  _planLogEvent('Часы выставл.', taskTitle.substring(0, 40) + ': ' + (oldVal !== undefined ? oldVal : 'факт') + ' → ' + val);

  _planRenderAll();
}

function _planOnCommentChange(el) {
  var dateStr = el.getAttribute('data-date');
  var val = el.value.trim();
  var oldVal = _plan.dayComments[dateStr] || '';

  if (val) {
    _plan.dayComments[dateStr] = val;
  } else {
    delete _plan.dayComments[dateStr];
  }
  _planSaveComments();

  if (val !== oldVal) {
    _planLogEvent('Комментарий', _planFormatDateRu(dateStr) + ': ' + (oldVal || '—') + ' → ' + (val || '—'));
  }
}

/* ═══════════════════════════════════════════════════════════════
   АДМИНКА ПЛАНА — Настройка ставок разработчиков
   ═══════════════════════════════════════════════════════════════ */

function _planOpenAdmin() {
  _plan.modalOpen = 'admin';
  _plan.adminSaveMsg = null;
  _plan.adminChangedDevs = {};
  _planRenderAll();
}

function _planCloseAdmin(e) {
  if (e && e.target && !e.target.classList.contains('pr-modal-overlay')) return;
  _plan.modalOpen = null;
  _plan.adminSaveMsg = null;
  _plan.adminChangedDevs = {};
  _planRenderAll();
}

function _planRenderAdminModal() {
  if (_plan.modalOpen !== 'admin') return '';

  var h = '<div class="pr-modal-overlay" onclick="_planCloseAdmin(event)">';
  h += '<div class="pr-modal" onclick="event.stopPropagation()" style="max-width:960px">';

  /* Header */
  h += '<div class="pr-modal-header">';
  h += '<span class="pr-modal-title">&#9881; Настройка ставок — План-факт</span>';
  h += '<button class="pr-modal-close" onclick="_planCloseAdmin()">&times;</button>';
  h += '</div>';

  /* Body */
  h += '<div class="pr-modal-body" id="planAdminBody">';
  h += _planRenderAdminBody();
  h += '</div>';

  /* Footer */
  h += '<div class="pr-modal-footer">';
  if (_plan.adminSaveMsg) {
    h += '<div style="display:flex;align-items:center;gap:6px;margin-right:auto;padding:6px 12px;background:rgba(34,212,126,.12);border:1px solid rgba(34,212,126,.3);border-radius:6px">';
    h += '<span style="color:var(--green);font-size:14px">&#10003;</span>';
    h += '<span style="font-family:var(--mono);font-size:11px;color:var(--green);font-weight:600">' + esc(_plan.adminSaveMsg) + '</span>';
    h += '</div>';
  }
  h += '<button class="plan-btn plan-btn-ghost" onclick="_planCloseAdmin()">Отмена</button>';
  h += '<button class="plan-btn plan-btn-green" onclick="_planSavePlanAdmin()">Сохранить</button>';
  h += '</div>';

  h += '</div></div>';
  return h;
}

function _planRenderAdminBody() {
  var h = '';
  h += '<div style="margin-bottom:14px;font-family:var(--mono);font-size:11px;color:var(--text3)">Ставки используются для расчёта Плана (8ч × ставка) и Факта (часы_выставл. × ставка) во вкладке План-факт</div>';
  h += '<div class="plan-admin-cards-grid">';

  var activeIds = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS : (typeof DEV_IDS !== 'undefined' ? DEV_IDS : []);
  activeIds.forEach(function(id) {
    var sid = String(id);
    var name = prGetDevName(sid);
    var rate = prGetRate(sid);
    var clientRate = (typeof prGetClientRate === 'function') ? prGetClientRate(sid) : 0;
    var isChanged = _plan.adminChangedDevs[sid];
    var initials = name.split(' ').map(function(w) { return w.charAt(0); }).join('').substring(0, 2);
    var cardBorder = isChanged ? 'border-color:var(--green);box-shadow:0 0 8px rgba(34,212,126,.2)' : '';

    h += '<div class="plan-admin-card" style="' + cardBorder + '">';
    h += '<div class="plan-admin-card-hdr">';
    h += '<div class="plan-admin-card-avatar">' + esc(initials) + '</div>';
    h += '<div class="plan-admin-card-name">' + esc(name) + '</div>';
    h += '</div>';
    h += '<div class="plan-admin-card-fields">';
    h += '<div class="plan-admin-field"><label>Ставка (р/ч)</label><input class="plan-admin-input" type="text" inputmode="numeric" value="' + rate + '" data-devid="' + sid + '" data-field="rate" onfocus="this.select()"></div>';
    h += '<div class="plan-admin-field"><label style="color:var(--cyan)">Ставка клиента</label><input class="plan-admin-input" type="text" inputmode="numeric" value="' + clientRate + '" data-devid="' + sid + '" data-field="clientRate" style="color:var(--cyan)" onfocus="this.select()"></div>';
    h += '</div>';
    h += '</div>';
  });

  h += '</div>';
  return h;
}

function _planSavePlanAdmin() {
  var inputs = document.querySelectorAll('.plan-admin-input');
  var changedDevs = [];

  inputs.forEach(function(inp) {
    var devId = inp.getAttribute('data-devid');
    var field = inp.getAttribute('data-field');
    if (!devId || !field) return;

    var raw = inp.value.replace(/[^\d.,]/g, '').replace(',', '.');
    var val = parseInt(raw) || 0;

    var settings = (typeof _prLoadDevSettings === 'function') ? _prLoadDevSettings(devId) : {};
    if (!settings) settings = {};

    if (field === 'rate') {
      var defaultRate = (typeof СТАВКА_ПО_УМОЛЧ !== 'undefined') ? СТАВКА_ПО_УМОЛЧ : 500;
      var newRate = val > 0 ? val : defaultRate;
      if (newRate !== (settings.rate || defaultRate)) {
        settings.rate = newRate;
        changedDevs.push(devId);
      }
    }
    if (field === 'clientRate') {
      var newCR = val > 0 ? val : 0;
      if (newCR !== (settings.clientRate || 0)) {
        settings.clientRate = newCR;
        changedDevs.push(devId);
      }
    }

    if (typeof _prSaveDevSettings === 'function') {
      _prSaveDevSettings(devId, settings);
    }
  });

  /* Update cards behind the modal if _pr is active */
  if (changedDevs.length > 0 && typeof _pr !== 'undefined' && _pr.rows) {
    var devSet = {};
    changedDevs.forEach(function(id) { devSet[String(id)] = true; });
    _pr.rows.forEach(function(r) {
      if (devSet[String(r.developerId)]) {
        r.rate = prGetRate(r.developerId);
        r.clientRate = prGetClientRate(r.developerId);
        r.base = prGetBase(r.developerId);
        r.payrollAmount = Math.round((r.payrollHours || 0) * r.rate);
      }
    });
  }

  /* Show success */
  _plan.adminChangedDevs = {};
  changedDevs.forEach(function(id) { _plan.adminChangedDevs[String(id)] = true; });
  _plan.adminSaveMsg = changedDevs.length > 0
    ? 'Ставки обновлены: ' + changedDevs.map(function(id) { return prGetDevName(id); }).join(', ')
    : 'Без изменений';

  _planLogEvent('Админка: ставки', _plan.adminSaveMsg);

  /* Rebuild daily map with new rates */
  _planBuildDailyMap();

  /* Partial render of admin body + footer */
  var body = document.getElementById('planAdminBody');
  if (body) body.innerHTML = _planRenderAdminBody();

  /* Re-render the main table area too */
  _planRenderAll();
}

/* ─── Keyboard: Esc closes modals ─── */
function _planAttachKeys() {
  document.onkeydown = function(e) {
    if (e.key === 'Escape') {
      if (_plan.modalOpen === 'admin') {
        _planCloseAdmin();
        e.preventDefault();
      } else if (_plan.modalOpen === 'taskDetail') {
        _planCloseTaskDetail();
        e.preventDefault();
      } else if (_plan.modalOpen === 'tasks') {
        _planCloseModal();
        e.preventDefault();
      }
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   УТИЛИТЫ
   ═══════════════════════════════════════════════════════════════ */
function _planFmtMoney(n) {
  var neg = n < 0;
  var abs = Math.abs(n);
  var str = abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return neg ? ('- ' + str) : str;
}

function _planGetDayName(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  var days = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  return days[d.getDay()];
}

function _planFormatDateRu(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}
