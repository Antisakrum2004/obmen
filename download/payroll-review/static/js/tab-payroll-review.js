/* ═══════════════════════════════════════════════════════════════
   tab-payroll-review.js — Main Module
   Task Review + Manager Adjustment + Payroll Projection + CSV Export
   ═══════════════════════════════════════════════════════════════ */

var _pr = {
  container: null,
  styleEl: null,
  intervals: [],
  rows: [],
  projection: [],
  totals: null,
  data: null,
  dirty: false,
  loading: false,
  sortField: 'developerName',
  sortDir: 1,
  filters: {developer: '', project: '', status: ''},
  activeSection: 'review' /* review | projection */
};

/* Destroy helper */
function _prDestroy() {
  _pr.intervals.forEach(function(id) { clearInterval(id); });
  _pr.intervals = [];
  if (_pr.styleEl && _pr.styleEl.parentNode) {
    _pr.styleEl.parentNode.removeChild(_pr.styleEl);
    _pr.styleEl = null;
  }
  _pr.container = null;
  _pr.rows = [];
  _pr.projection = [];
  _pr.totals = null;
  _pr.data = null;
  _pr.dirty = false;
}

/* ═══════════════════════════════════════════════════════════════
   MODULE REGISTRATION
   ═══════════════════════════════════════════════════════════════ */
window.TabPayrollReview = {
  render: function(container) {
    if (!container) return;
    _prDestroy();
    _pr.container = container;

    /* Inject CSS */
    _pr.styleEl = document.createElement('style');
    _pr.styleEl.textContent = PR_CSS;
    document.head.appendChild(_pr.styleEl);

    /* Load saved filters */
    _pr.filters = prLoadFilters();

    /* Render initial state */
    _prRenderLoading();

    /* Load data */
    _prLoadData();

    /* Auto-refresh interval (5 min) */
    _pr.intervals.push(setInterval(function() {
      if (!_pr.loading) _prLoadData();
    }, 300000));
  },

  destroy: function() {
    _prDestroy();
  },

  refresh: function() {
    if (!_pr.loading) _prLoadData();
  }
};

/* ═══════════════════════════════════════════════════════════════
   DATA LOADING
   ═══════════════════════════════════════════════════════════════ */
function _prLoadData() {
  _pr.loading = true;
  _prRenderLoading();

  var year = prCurrentPeriod.year;
  var month = prCurrentPeriod.month;

  prLoadPeriodData(year, month).then(function(data) {
    _pr.data = data;
    var savedReviews = prLoadReviews(year, month);
    _pr.rows = buildTaskReviewRows(data, savedReviews);
    _pr.projection = buildPayrollProjection(_pr.rows);
    _pr.totals = buildPeriodTotals(_pr.rows);
    _pr.dirty = false;
    _pr.loading = false;
    _prRenderAll();
  }).catch(function(e) {
    console.error('prLoadData error', e);
    _pr.loading = false;
    _prRenderError(e.message || 'Ошибка загрузки');
  });
}

/* ═══════════════════════════════════════════════════════════════
   RENDERING
   ═══════════════════════════════════════════════════════════════ */
function _prRenderLoading() {
  if (!_pr.container) return;
  _pr.container.innerHTML = '<div class="pr-loading"><div class="pr-ring"></div><div>Загрузка данных за ' + esc(MONTHS_FULL[prCurrentPeriod.month - 1] + ' ' + prCurrentPeriod.year) + '...</div></div>';
}

function _prRenderError(msg) {
  if (!_pr.container) return;
  _pr.container.innerHTML = '<div class="pr-empty" style="color:var(--red)"><div style="font-size:24px">&#9888;</div><div>' + esc(msg) + '</div></div>';
}

function _prRenderAll() {
  if (!_pr.container) return;
  var h = '';
  h += _prRenderHeader();
  h += _prRenderKPIs();
  h += _prRenderFilters();
  h += _prRenderTable();
  h += _prRenderProjection();
  h += _prRenderSaveBar();
  h += _prRenderDebug();
  _pr.container.innerHTML = h;
  _prAttachEvents();
}

/* ─── Header ─── */
function _prRenderHeader() {
  var periodStr = MONTHS_FULL[prCurrentPeriod.month - 1] + ' ' + prCurrentPeriod.year;
  var modeBadge = PR_MOCK_MODE
    ? '<span class="pr-badge pr-badge-mock">MOCK</span>'
    : '<span class="pr-badge pr-badge-live">LIVE</span>';

  var devCount = Object.keys(DEVELOPERS).length;
  var taskCount = _pr.rows.length;

  var h = '<div class="pr-header">';
  h += '<div class="pr-title">Payroll Review ' + modeBadge + '</div>';
  h += '<div class="pr-header-info">';
  h += '<span class="pr-header-stat">' + devCount + ' разраб.</span>';
  h += '<span class="pr-header-stat">' + taskCount + ' задач</span>';
  h += '</div>';
  h += '<div class="pr-controls">';

  /* Period selector */
  h += '<select class="pr-select" id="prPeriodSelect" onchange="_prOnPeriodChange()">';
  var now = new Date();
  for (var i = 0; i < 6; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var y = d.getFullYear(), m = d.getMonth() + 1;
    var sel = (y === prCurrentPeriod.year && m === prCurrentPeriod.month) ? ' selected' : '';
    h += '<option value="' + y + '-' + m + '"' + sel + '>' + MONTHS_FULL[m - 1] + ' ' + y + '</option>';
  }
  h += '</select>';

  /* Refresh */
  h += '<button class="pr-btn pr-btn-ghost" onclick="window.TabPayrollReview.refresh()" title="Обновить данные">&#8635;</button>';

  /* Export */
  h += '<button class="pr-btn pr-btn-green" onclick="_prExport()">&#11015; CSV</button>';

  /* Approve All */
  h += '<button class="pr-btn pr-btn-primary" onclick="_prApproveAll()">&#10003; Подтвердить все</button>';

  h += '</div></div>';
  return h;
}

/* ─── KPI Cards ─── */
function _prRenderKPIs() {
  if (!_pr.totals) return '';
  var t = _pr.totals;
  var marginVal = Math.round((t.totalBillable - t.totalPayroll) * 1000) / 10;
  var h = '<div class="pr-kpi-grid">';
  h += _prKpiCard('Факт часы', t.totalFactHours.toFixed(1), 'var(--accent)', t.totalTasks + ' задач');
  h += _prKpiCard('Billable', t.totalBillable.toFixed(1), 'var(--green)', t.approvedTasks + ' подтв.');
  h += _prKpiCard('Payroll часы', t.totalPayroll.toFixed(1), 'var(--yellow)', t.pendingTasks + ' ожидает');
  h += _prKpiCard('Сумма выплаты', _prFmtMoney(t.totalPayrollAmount), 'var(--cyan)', t.disputedTasks + ' споров');
  h += _prKpiCard('Маржа (B-P)', _prFmtMoney(Math.round(marginVal * 100)), 'var(--orange)', 'Billable - Payroll');
  h += '</div>';
  return h;
}

function _prKpiCard(label, value, color, sub) {
  var h = '<div class="pr-kpi" style="--kc:' + color + '">';
  h += '<div class="pr-kpi-label">' + label + '</div>';
  h += '<div class="pr-kpi-value">' + value + '</div>';
  if (sub) h += '<div class="pr-kpi-sub">' + sub + '</div>';
  h += '</div>';
  return h;
}

/* ─── Filters ─── */
function _prRenderFilters() {
  var f = _pr.filters;
  var h = '<div class="pr-filters">';

  /* Developer filter */
  h += '<select class="pr-select" id="prFilterDev" onchange="_prOnFilterChange()">';
  h += '<option value="">Все разработчики</option>';
  var devSet = {};
  _pr.rows.forEach(function(r) { devSet[r.developerId] = r.developerName; });
  Object.keys(devSet).sort(function(a, b) { return devSet[a].localeCompare(devSet[b]); }).forEach(function(id) {
    var sel = f.developer === id ? ' selected' : '';
    h += '<option value="' + id + '"' + sel + '>' + esc(devSet[id]) + '</option>';
  });
  h += '</select>';

  /* Project filter */
  h += '<select class="pr-select" id="prFilterProj" onchange="_prOnFilterChange()">';
  h += '<option value="">Все проекты</option>';
  var projSet = {};
  _pr.rows.forEach(function(r) { projSet[r.projectId] = r.projectName; });
  Object.keys(projSet).sort(function(a, b) { return projSet[a].localeCompare(projSet[b]); }).forEach(function(id) {
    var sel = f.project === id ? ' selected' : '';
    h += '<option value="' + id + '"' + sel + '>' + esc(projSet[id]) + '</option>';
  });
  h += '</select>';

  /* Status chips */
  var statuses = [
    {key: 'pending', label: 'Ожидает', cls: ''},
    {key: 'approved', label: 'Подтв.', cls: 'chip-green'},
    {key: 'disputed', label: 'Спор', cls: 'chip-yellow'},
    {key: 'excluded', label: 'Исключено', cls: 'chip-red'}
  ];
  h += '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Статус:</span>';
  statuses.forEach(function(s) {
    var active = f.status === s.key ? ' active' : '';
    h += '<span class="pr-filter-chip ' + s.cls + active + '" onclick="_prToggleStatusFilter(\'' + s.key + '\')">' + s.label + '</span>';
  });

  h += '</div>';
  return h;
}

/* ─── Main Table ─── */
function _prRenderTable() {
  var filtered = _prGetFilteredRows();
  if (!filtered.length) return '<div class="pr-empty"><div style="font-size:24px">&#128203;</div><div>Нет задач за выбранный период</div></div>';

  var h = '<div class="pr-table-wrap"><table class="pr-table"><thead><tr>';
  h += '<th onclick="_prSort(\'taskTitle\')">Задача ' + _prSortIndicator('taskTitle') + '</th>';
  h += '<th onclick="_prSort(\'projectName\')">Проект ' + _prSortIndicator('projectName') + '</th>';
  h += '<th onclick="_prSort(\'developerName\')">Разработчик ' + _prSortIndicator('developerName') + '</th>';
  h += '<th class="c-num" onclick="_prSort(\'factHours\')">Факт ' + _prSortIndicator('factHours') + '</th>';
  h += '<th class="c-num">Billable</th>';
  h += '<th class="c-num">Payroll</th>';
  h += '<th class="c-num" onclick="_prSort(\'rate\')">Ставка ' + _prSortIndicator('rate') + '</th>';
  h += '<th class="c-num" onclick="_prSort(\'payrollAmount\')">Сумма ' + _prSortIndicator('payrollAmount') + '</th>';
  h += '<th>Статус</th>';
  h += '<th>Коммент</th>';
  h += '</tr></thead><tbody>';

  filtered.forEach(function(r, idx) {
    var rowCls = r.reviewStatus === 'approved' ? ' row-approved' : '';
    rowCls += r.reviewStatus === 'excluded' ? ' row-excluded' : '';

    h += '<tr class="' + rowCls.trim() + '">';

    /* Task */
    h += '<td><span class="pr-task-link" title="' + esc(r.taskTitle) + '">' + esc(truncate(r.taskTitle, 40)) + '</span></td>';

    /* Project */
    h += '<td><span class="pr-proj-tag">' + esc(truncate(r.projectName, 20)) + '</span></td>';

    /* Developer */
    var firstName = getFirstName(r.developerName);
    h += '<td><span class="pr-dev-name"><span class="pr-dev-av">' + esc(firstName.charAt(0)) + '</span>' + esc(firstName) + '</span></td>';

    /* Fact Hours (readonly) */
    h += '<td class="c-num"><span class="pr-readonly">' + r.factHours.toFixed(1) + '</span></td>';

    /* Billable Hours (editable) */
    var billChanged = r.billableHours !== r.factHours;
    h += '<td class="c-num"><input class="pr-editable' + (billChanged ? ' changed' : '') + '" type="number" step="0.5" min="0" value="' + r.billableHours.toFixed(1) + '" data-idx="' + idx + '" data-field="billableHours" onchange="_prOnEdit(this)"></td>';

    /* Payroll Hours (editable) */
    var payChanged = r.payrollHours !== r.factHours;
    h += '<td class="c-num"><input class="pr-editable' + (payChanged ? ' changed' : '') + '" type="number" step="0.5" min="0" value="' + r.payrollHours.toFixed(1) + '" data-idx="' + idx + '" data-field="payrollHours" onchange="_prOnEdit(this)"></td>';

    /* Rate */
    h += '<td class="c-num"><span class="pr-readonly">' + _prFmtMoney(r.rate) + '</span></td>';

    /* Amount */
    h += '<td class="c-num"><span class="pr-readonly pr-amount">' + _prFmtMoney(r.payrollAmount) + '</span></td>';

    /* Status */
    h += '<td><span class="pr-status pr-status-' + r.reviewStatus + '" data-idx="' + idx + '" onclick="_prCycleStatus(' + idx + ')">' + _prStatusLabel(r.reviewStatus) + '</span></td>';

    /* Comment */
    h += '<td><input class="pr-comment-input" type="text" value="' + esc(r.managerComment) + '" data-idx="' + idx + '" data-field="managerComment" onchange="_prOnEdit(this)" placeholder="..."></td>';

    h += '</tr>';
  });

  h += '</tbody><tfoot><tr>';
  h += '<td colspan="3">ИТОГО (' + filtered.length + ')</td>';
  h += '<td class="c-num">' + _prSumField(filtered, 'factHours').toFixed(1) + '</td>';
  h += '<td class="c-num">' + _prSumField(filtered, 'billableHours').toFixed(1) + '</td>';
  h += '<td class="c-num">' + _prSumField(filtered, 'payrollHours').toFixed(1) + '</td>';
  h += '<td></td>';
  h += '<td class="c-num">' + _prFmtMoney(_prSumField(filtered, 'payrollAmount')) + '</td>';
  h += '<td colspan="2"></td>';
  h += '</tr></tfoot></table></div>';

  return h;
}

/* ─── Projection Section ─── */
function _prRenderProjection() {
  if (!_pr.projection.length) return '';
  var h = '<div class="pr-projection">';
  h += '<div class="pr-section-title">Прогноз выплат по разработчикам</div>';

  h += '<div class="pr-proj-grid">';
  _pr.projection.forEach(function(d) {
    var pctPayroll = d.totalFactHours > 0 ? Math.round(d.totalPayroll / d.totalFactHours * 100) : 0;
    var barColor = pctPayroll > 100 ? 'var(--red)' : pctPayroll > 80 ? 'var(--yellow)' : 'var(--green)';
    h += '<div class="pr-proj-card">';
    h += '<div class="pr-proj-dev">';
    h += '<span class="pr-dev-av">' + esc(getFirstName(d.developerName).charAt(0)) + '</span>';
    h += '<div class="pr-proj-dev-info">';
    h += '<span class="pr-proj-dev-name">' + esc(d.developerName) + '</span>';
    h += '<span class="pr-proj-dev-meta">' + d.taskCount + ' задач | ' + d.approvedCount + ' подтв. | ' + d.pendingCount + ' ожидает</span>';
    h += '</div>';
    h += '<span class="pr-badge ' + (d.approvalRate >= 80 ? 'pr-badge-live' : 'pr-badge-mock') + '" style="font-size:9px">' + d.approvalRate + '%</span>';
    h += '</div>';

    h += '<div class="pr-proj-stats">';
    h += _prProjStat(d.totalFactHours.toFixed(1), 'Факт', 'var(--accent)');
    h += _prProjStat(d.totalBillable.toFixed(1), 'Billable', 'var(--green)');
    h += _prProjStat(d.totalPayroll.toFixed(1), 'Payroll', 'var(--yellow)');
    h += _prProjStat(_prFmtMoney(d.totalAmount), 'Сумма', 'var(--cyan)');
    h += '</div>';

    /* Mini bar: Payroll / Fact ratio */
    h += '<div class="pr-proj-bar">';
    h += '<div class="pr-proj-bar-fill" style="width:' + Math.min(pctPayroll, 100) + '%;background:' + barColor + '"></div>';
    h += '</div>';
    h += '</div>';
  });
  h += '</div>';

  h += '</div>';
  return h;
}

function _prProjStat(val, lbl, color) {
  return '<div class="pr-proj-stat"><div class="pr-proj-stat-val" style="color:' + (color || 'var(--text)') + '">' + val + '</div><div class="pr-proj-stat-lbl">' + lbl + '</div></div>';
}

/* ─── Save Bar ─── */
function _prRenderSaveBar() {
  var indCls = _pr.dirty ? 'dirty' : 'saved';
  var indTxt = _pr.dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены';
  var h = '<div class="pr-save-bar">';
  h += '<div class="pr-save-indicator ' + indCls + '"></div>';
  h += '<span style="font-family:var(--mono);font-size:10px;color:var(--text3)">' + indTxt + '</span>';
  if (_pr.dirty) {
    h += '<button class="pr-btn pr-btn-primary" onclick="_prSaveAll()" style="margin-left:auto">Сохранить</button>';
  }
  h += '</div>';
  return h;
}

/* ─── Debug info (only in MOCK mode) ─── */
function _prRenderDebug() {
  if (!PR_MOCK_MODE) return '';
  var h = '<div class="pr-debug">';
  h += '<div class="pr-debug-title">DEBUG (MOCK)</div>';
  h += '<div class="pr-debug-row">Elapsed записей: ' + (_pr.data && _pr.data.elapsed ? _pr.data.elapsed.length : 0) + '</div>';
  h += '<div class="pr-debug-row">TaskReview строк: ' + _pr.rows.length + '</div>';
  h += '<div class="pr-debug-row">Разработчики: ' + Object.keys(DEVELOPERS).length + '</div>';
  h += '<div class="pr-debug-row">Проекты (не исключённые): ' + Object.keys(PROJECTS).filter(function(gid) { return !EXCLUDE_GROUPS[gid]; }).length + '</div>';
  h += '<div class="pr-debug-row">Webhook: ' + esc(HOOK ? HOOK.substring(0, 50) + '...' : 'не задан') + '</div>';
  h += '<div class="pr-debug-row">Режим: ' + (PR_MOCK_MODE ? 'MOCK' : 'LIVE') + '</div>';
  h += '<div class="pr-debug-row">Период: ' + prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0') + '</div>';
  if (_pr.data && _pr.data.elapsed && _pr.data.elapsed.length > 0) {
    var sample = _pr.data.elapsed[0];
    h += '<div class="pr-debug-row">Пример elapsed: ID=' + sample.ID + ' TASK=' + sample.TASK_ID + ' SEC=' + sample.SECONDS + '</div>';
  }
  h += '</div>';
  return h;
}

/* ═══════════════════════════════════════════════════════════════
   EVENT HANDLERS
   ═══════════════════════════════════════════════════════════════ */
function _prAttachEvents() {
  /* Events are attached inline via onclick/onchange attributes */
}

function _prOnPeriodChange() {
  var sel = document.getElementById('prPeriodSelect');
  if (!sel) return;
  var parts = sel.value.split('-');
  prCurrentPeriod = {year: parseInt(parts[0]), month: parseInt(parts[1])};
  _prLoadData();
}

function _prOnFilterChange() {
  var devSel = document.getElementById('prFilterDev');
  var projSel = document.getElementById('prFilterProj');
  if (devSel) _pr.filters.developer = devSel.value;
  if (projSel) _pr.filters.project = projSel.value;
  prSaveFilters(_pr.filters);
  _prRenderAll();
}

function _prToggleStatusFilter(status) {
  if (_pr.filters.status === status) {
    _pr.filters.status = '';
  } else {
    _pr.filters.status = status;
  }
  prSaveFilters(_pr.filters);
  _prRenderAll();
}

function _prOnEdit(input) {
  var idx = parseInt(input.getAttribute('data-idx'));
  var field = input.getAttribute('data-field');
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;

  var row = filtered[idx];
  var realIdx = _pr.rows.indexOf(row);
  if (realIdx < 0) return;

  var val = input.value;
  if (field === 'billableHours' || field === 'payrollHours') {
    val = parseFloat(val);
    if (isNaN(val) || val < 0) val = 0;
    val = Math.round(val * 10) / 10;
  }

  _pr.rows[realIdx][field] = val;

  /* Recalculate payrollAmount */
  _pr.rows[realIdx].payrollAmount = Math.round(_pr.rows[realIdx].payrollHours * _pr.rows[realIdx].rate);
  _pr.rows[realIdx].updatedAt = Date.now();

  /* Mark dirty */
  _pr.dirty = true;

  /* Recalculate projection & totals */
  _pr.projection = buildPayrollProjection(_pr.rows);
  _pr.totals = buildPeriodTotals(_pr.rows);

  /* Re-render */
  _prRenderAll();
}

function _prCycleStatus(idx) {
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;

  var row = filtered[idx];
  var realIdx = _pr.rows.indexOf(row);
  if (realIdx < 0) return;

  var statusFlow = ['pending', 'approved', 'disputed', 'excluded'];
  var currentIdx = statusFlow.indexOf(_pr.rows[realIdx].reviewStatus);
  var nextIdx = (currentIdx + 1) % statusFlow.length;
  _pr.rows[realIdx].reviewStatus = statusFlow[nextIdx];
  _pr.rows[realIdx].updatedAt = Date.now();

  _pr.dirty = true;
  _pr.projection = buildPayrollProjection(_pr.rows);
  _pr.totals = buildPeriodTotals(_pr.rows);
  _prRenderAll();
}

function _prSort(field) {
  if (_pr.sortField === field) {
    _pr.sortDir = -_pr.sortDir;
  } else {
    _pr.sortField = field;
    _pr.sortDir = 1;
  }
  _pr.rows.sort(function(a, b) {
    var va = a[field], vb = b[field];
    if (typeof va === 'string') return va.localeCompare(vb) * _pr.sortDir;
    return (va - vb) * _pr.sortDir;
  });
  _prRenderAll();
}

function _prSortIndicator(field) {
  if (_pr.sortField !== field) return '';
  return _pr.sortDir > 0 ? ' &#9650;' : ' &#9660;';
}

function _prSaveAll() {
  var reviews = {};
  _pr.rows.forEach(function(r) {
    reviews[r._reviewKey] = {
      billableHours: r.billableHours,
      payrollHours: r.payrollHours,
      rate: r.rate,
      reviewStatus: r.reviewStatus,
      managerComment: r.managerComment,
      updatedAt: r.updatedAt
    };
  });
  prSaveReviews(prCurrentPeriod.year, prCurrentPeriod.month, reviews);
  _pr.dirty = false;
  _prRenderAll();
}

function _prApproveAll() {
  if (!_pr.rows.length) return;
  if (!confirm('Подтвердить все pending задачи?')) return;
  _pr.rows.forEach(function(r) {
    if (r.reviewStatus === 'pending') {
      r.reviewStatus = 'approved';
      r.updatedAt = Date.now();
    }
  });
  _pr.dirty = true;
  _pr.projection = buildPayrollProjection(_pr.rows);
  _pr.totals = buildPeriodTotals(_pr.rows);
  _prRenderAll();
}

function _prExport() {
  if (!_pr.rows.length) return;
  /* Save before export */
  _prSaveAll();
  prExportCSV(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function _prGetFilteredRows() {
  return _pr.rows.filter(function(r) {
    if (_pr.filters.developer && r.developerId !== _pr.filters.developer) return false;
    if (_pr.filters.project && r.projectId !== _pr.filters.project) return false;
    if (_pr.filters.status && r.reviewStatus !== _pr.filters.status) return false;
    return true;
  });
}

function _prStatusLabel(status) {
  switch(status) {
    case 'pending': return 'Ожидает';
    case 'approved': return 'Подтв.';
    case 'disputed': return 'Спор';
    case 'excluded': return 'Исключ.';
    default: return status;
  }
}

function _prFmtMoney(val) {
  if (typeof val !== 'number') val = 0;
  return val.toLocaleString('ru-RU') + ' р';
}

function _prSumField(rows, field) {
  var sum = 0;
  rows.forEach(function(r) {
    if (r.reviewStatus !== 'excluded') {
      sum += r[field] || 0;
    }
  });
  return sum;
}
