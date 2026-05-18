/* ═══════════════════════════════════════════════════════════════
   tab-payroll-review.js — Главный модуль UI
   Обзор задач + Корректировки менеджера + Прогноз выплат + Экспорт CSV

   v2.0.0 — Рефакторинг: бизнес-логика вынесена в payroll/* модули
   Этот файл отвечает ТОЛЬКО за:
   - Состояние UI (_pr state)
   - Рендеринг (innerHTML)
   - Обработку событий (onclick handlers)
   - Делегирование бизнес-операций в domain модули
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
  modalOpen: false,
  periodStatus: 'draft',      /* NEW: статус периода из domain */
  auditLog: [],                /* NEW: буфер аудиторских записей */
  qualityReport: null          /* NEW: отчёт о качестве данных */
};

/* Уничтожение */
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
  _pr.auditLog = [];
  _pr.qualityReport = null;
}

/* ═══════════════════════════════════════════════════════════════
   РЕГИСТРАЦИЯ МОДУЛЯ
   ═══════════════════════════════════════════════════════════════ */
window.TabPayrollReview = {
  render: function(container) {
    if (!container) return;
    _prDestroy();
    _pr.container = container;

    _pr.styleEl = document.createElement('style');
    _pr.styleEl.textContent = PR_CSS;
    document.head.appendChild(_pr.styleEl);

    /* Загрузить фильтры через абстракцию storage */
    _pr.filters = _prLoadFilters();

    _prRenderLoading();
    _prLoadData();

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
   ЗАГРУЗКА ДАННЫХ
   ═══════════════════════════════════════════════════════════════ */
function _prLoadData() {
  _pr.loading = true;
  _prRenderLoading();

  var year = prCurrentPeriod.year;
  var month = prCurrentPeriod.month;
  var periodKey = prGetPeriodKey(year, month);

  /* Загрузить состояние периода */
  _prLoadPeriodState(periodKey);

  /* Загрузить аудиторский лог */
  _pr.auditLog = _prLoadAuditLog(periodKey);

  prLoadPeriodData(year, month).then(function(data) {
    _pr.data = data;

    /* Загрузить сохранённые ревью через абстракцию storage */
    var savedReviews = _prLoadReviews(year, month);

    /* Построить строки ревью через domain engine */
    var result = buildReviewRows(data, savedReviews, _prRateProvider());
    _pr.rows = result.rows;
    _pr.qualityReport = result.qualityReport;

    /* Построить projection и totals через domain функции */
    _pr.projection = buildMonthlyProjection(_pr.rows);
    _pr.totals = buildPeriodTotals(_pr.rows);
    _pr.dirty = false;
    _pr.loading = false;
    _prRenderAll();
  }).catch(function(e) {
    console.error('Ошибка загрузки', e);
    _pr.loading = false;
    _prRenderError(e.message || 'Ошибка загрузки');
  });
}

/* ═══════════════════════════════════════════════════════════════
   STORAGE DELEGATION — доступ к storage через PayrollStorage
   ═══════════════════════════════════════════════════════════════ */
function _prStorage() {
  /* Используем новый PayrollStorage если доступен, иначе legacy */
  if (typeof PayrollStorage !== 'undefined') return PayrollStorage;
  return null;
}

function _prLoadReviews(year, month) {
  var store = _prStorage();
  if (store) return store.loadReviews(year, month);
  /* Fallback на legacy */
  if (typeof prLoadReviews === 'function') return prLoadReviews(year, month);
  return {};
}

function _prSaveReviews(year, month, reviews) {
  var store = _prStorage();
  if (store) return store.saveReviews(year, month, reviews);
  if (typeof prSaveReviews === 'function') return prSaveReviews(year, month, reviews);
  return false;
}

function _prLoadFilters() {
  var store = _prStorage();
  if (store) return store.loadFilters();
  if (typeof prLoadFilters === 'function') return prLoadFilters();
  return {developer: '', project: '', status: ''};
}

function _prSaveFilters(filters) {
  var store = _prStorage();
  if (store) return store.saveFilters(filters);
  if (typeof prSaveFilters === 'function') return prSaveFilters(filters);
}

function _prLoadDevSettings(devId) {
  var store = _prStorage();
  if (store) return store.loadDevSettings(devId);
  if (typeof prLoadDevSettings === 'function') return prLoadDevSettings(devId);
  return null;
}

function _prSaveDevSettings(devId, settings) {
  var store = _prStorage();
  if (store) return store.saveDevSettings(devId, settings);
  if (typeof prSaveDevSettings === 'function') return prSaveDevSettings(devId, settings);
}

function _prLoadPeriodState(periodKey) {
  var store = _prStorage();
  if (store) {
    var state = store.loadPeriodState(periodKey);
    _pr.periodStatus = state ? state.status : 'draft';
    return;
  }
  _pr.periodStatus = 'draft';
}

function _prSavePeriodState(periodKey, state) {
  var store = _prStorage();
  if (store) return store.savePeriodState(periodKey, state);
}

function _prLoadAuditLog(periodKey) {
  var store = _prStorage();
  if (store) return store.loadAuditLog(periodKey);
  return [];
}

function _prAppendAuditLog(periodKey, entries) {
  var store = _prStorage();
  if (store) return store.appendAuditLog(periodKey, entries);
}

/* Rate provider — адаптер для domain engine */
function _prRateProvider() {
  return {
    getRate: function(devId) { return prGetRate(devId); },
    getBase: function(devId) { return prGetBase(devId); },
    getName: function(devId) { return prGetDevName(devId); }
  };
}

/* ═══════════════════════════════════════════════════════════════
   РЕНДЕРИНГ
   ═══════════════════════════════════════════════════════════════ */
function _prRenderLoading() {
  if (!_pr.container) return;
  _pr.container.innerHTML = '<div class="pr-loading"><div class="pr-ring"></div><div>Загрузка данных за ' + esc(МЕСЯЦЫ_ПОЛН[prCurrentPeriod.month - 1] + ' ' + prCurrentPeriod.year) + '...</div></div>';
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
  h += _prRenderAdminModal();
  _pr.container.innerHTML = h;
}

/* ─── Шапка ─── */
function _prRenderHeader() {
  var modeBadge = PR_MOCK_MODE
    ? '<span class="pr-badge pr-badge-mock">МОК</span>'
    : '<span class="pr-badge pr-badge-live">ЖИВОЙ</span>';

  var devCount = Object.keys(DEVELOPERS).length;
  var taskCount = _pr.rows.length;

  /* Бейдж статуса периода */
  var psLabel = typeof PR_PERIOD_STATUS_LABELS !== 'undefined'
    ? (PR_PERIOD_STATUS_LABELS[_pr.periodStatus] || _pr.periodStatus)
    : _pr.periodStatus;

  var h = '<div class="pr-header">';
  h += '<div class="pr-title">Зарплатный обзор ' + modeBadge + ' <span class="pr-version">v' + APP_VERSION + '</span></div>';
  h += '<div class="pr-header-info">';
  h += '<span class="pr-header-stat">' + devCount + ' разраб.</span>';
  h += '<span class="pr-header-stat">' + taskCount + ' задач</span>';
  h += '<span class="pr-header-stat" style="color:var(--cyan)">' + esc(psLabel) + '</span>';
  h += '</div>';
  h += '<div class="pr-controls">';

  /* Выбор периода */
  h += '<select class="pr-select" id="prPeriodSelect" onchange="_prOnPeriodChange()">';
  var now = new Date();
  for (var i = 0; i < 6; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var y = d.getFullYear(), m = d.getMonth() + 1;
    var sel = (y === prCurrentPeriod.year && m === prCurrentPeriod.month) ? ' selected' : '';
    h += '<option value="' + y + '-' + m + '"' + sel + '>' + МЕСЯЦЫ_ПОЛН[m - 1] + ' ' + y + '</option>';
  }
  h += '</select>';

  /* Обновить */
  h += '<button class="pr-btn pr-btn-ghost" onclick="window.TabPayrollReview.refresh()" title="Обновить данные">&#8635;</button>';

  /* Админка */
  h += '<button class="pr-btn pr-btn-orange" onclick="_prOpenAdmin()">&#9881; Админка</button>';

  /* Экспорт */
  h += '<button class="pr-btn pr-btn-green" onclick="_prExport()">&#11015; CSV</button>';

  /* Детальный экспорт */
  h += '<button class="pr-btn pr-btn-ghost" onclick="_prExportDetailed()" title="Детальный CSV по задачам">CSV+</button>';

  /* Подтвердить все */
  h += '<button class="pr-btn pr-btn-primary" onclick="_prApproveAll()">&#10003; Подтвердить все</button>';

  h += '</div></div>';
  return h;
}

/* ─── KPI Карточки ─── */
function _prRenderKPIs() {
  if (!_pr.totals) return '';
  var t = _pr.totals;
  var h = '<div class="pr-kpi-grid">';
  h += _prKpiCard('Факт часы', t.totalFactHours.toFixed(1), 'var(--accent)', t.totalTasks + ' задач');
  h += _prKpiCard('Опл. клиенту', t.totalBillable.toFixed(1), 'var(--green)', t.approvedTasks + ' подтв.');
  h += _prKpiCard('К выплате часы', t.totalPayroll.toFixed(1), 'var(--yellow)', t.pendingTasks + ' ожидает');
  h += _prKpiCard('Сумма выплат', _prFmtMoney(t.totalPayrollAmount), 'var(--orange)', t.disputedTasks + ' споров');
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

/* ─── Фильтры ─── */
function _prRenderFilters() {
  var f = _pr.filters;
  var h = '<div class="pr-filters">';

  h += '<select class="pr-select" id="prFilterDev" onchange="_prOnFilterChange()">';
  h += '<option value="">Все разработчики</option>';
  var devSet = {};
  _pr.rows.forEach(function(r) { devSet[r.developerId] = r.developerName; });
  Object.keys(devSet).sort(function(a, b) { return devSet[a].localeCompare(devSet[b]); }).forEach(function(id) {
    var sel = f.developer === id ? ' selected' : '';
    h += '<option value="' + id + '"' + sel + '>' + esc(devSet[id]) + '</option>';
  });
  h += '</select>';

  h += '<select class="pr-select" id="prFilterProj" onchange="_prOnFilterChange()">';
  h += '<option value="">Все проекты</option>';
  var projSet = {};
  _pr.rows.forEach(function(r) { projSet[r.projectId] = r.projectName; });
  Object.keys(projSet).sort(function(a, b) { return projSet[a].localeCompare(projSet[b]); }).forEach(function(id) {
    var sel = f.project === id ? ' selected' : '';
    h += '<option value="' + id + '"' + sel + '>' + esc(projSet[id]) + '</option>';
  });
  h += '</select>';

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

/* ─── Основная таблица ─── */
function _prRenderTable() {
  var filtered = _prGetFilteredRows();
  if (!filtered.length) return '<div class="pr-empty"><div style="font-size:24px">&#128203;</div><div>Нет задач за выбранный период</div></div>';

  var h = '<div class="pr-table-wrap"><table class="pr-table"><thead><tr>';
  h += '<th onclick="_prSort(\'taskTitle\')">Задача ' + _prSortInd('taskTitle') + '</th>';
  h += '<th onclick="_prSort(\'projectName\')">Проект ' + _prSortInd('projectName') + '</th>';
  h += '<th onclick="_prSort(\'developerName\')">Разработчик ' + _prSortInd('developerName') + '</th>';
  h += '<th class="c-num" onclick="_prSort(\'factHours\')">Факт\u00A0(ч) ' + _prSortInd('factHours') + '</th>';
  h += '<th class="c-num">Опл.\u00A0клиенту\u00A0(ч)</th>';
  h += '<th class="c-num">К\u00A0выплате\u00A0(ч)</th>';
  h += '<th class="c-num">Ставка\u00A0(р/ч)</th>';
  h += '<th class="c-num" onclick="_prSort(\'payrollAmount\')">Сумма\u00A0(р) ' + _prSortInd('payrollAmount') + '</th>';
  h += '<th>Статус</th>';
  h += '<th>Комментарий</th>';
  h += '</tr></thead><tbody>';

  filtered.forEach(function(r, idx) {
    var rowCls = r.reviewStatus === 'approved' ? ' row-approved' : '';
    rowCls += r.reviewStatus === 'excluded' ? ' row-excluded' : '';

    h += '<tr class="' + rowCls.trim() + '">';
    h += '<td><span class="pr-task-link" title="' + esc(r.taskTitle) + '">' + esc(truncate(r.taskTitle, 35)) + '</span></td>';
    h += '<td><span class="pr-proj-tag">' + esc(truncate(r.projectName, 18)) + '</span></td>';

    var firstName = getFirstName(r.developerName);
    h += '<td><span class="pr-dev-name"><span class="pr-dev-av">' + esc(firstName.charAt(0)) + '</span>' + esc(firstName) + '</span></td>';

    /* Факт (только чтение) */
    h += '<td class="c-num"><span class="pr-readonly">' + r.factHours.toFixed(1) + '</span></td>';

    /* Оплачиваемые (Billable) — редактируемое */
    var billChanged = r.billableHours !== r.factHours;
    h += '<td class="c-num"><input class="pr-editable' + (billChanged ? ' changed' : '') + '" type="number" step="0.5" min="0" value="' + r.billableHours.toFixed(1) + '" data-idx="' + idx + '" data-field="billableHours" onchange="_prOnEdit(this)"></td>';

    /* К выплате (Payroll) — редактируемое */
    var payChanged = r.payrollHours !== r.factHours;
    h += '<td class="c-num"><input class="pr-editable' + (payChanged ? ' changed' : '') + '" type="number" step="0.5" min="0" value="' + r.payrollHours.toFixed(1) + '" data-idx="' + idx + '" data-field="payrollHours" onchange="_prOnEdit(this)"></td>';

    /* Ставка — только отображение */
    h += '<td class="c-num"><span class="pr-readonly pr-rate-display">' + r.rate + '</span></td>';

    /* Сумма */
    h += '<td class="c-num"><span class="pr-readonly pr-amount">' + _prFmtMoney(r.payrollAmount) + '</span></td>';

    /* Статус */
    h += '<td><span class="pr-status pr-status-' + r.reviewStatus + '" data-idx="' + idx + '" onclick="_prCycleStatus(' + idx + ')">' + _prStatusLabel(r.reviewStatus) + '</span></td>';

    /* Комментарий */
    h += '<td><input class="pr-comment-input" type="text" value="' + esc(r.managerComment) + '" data-idx="' + idx + '" data-field="managerComment" onchange="_prOnEdit(this)" placeholder="..."></td>';

    h += '</tr>';
  });

  h += '</tbody><tfoot><tr>';
  h += '<td colspan="3">ИТОГО (' + filtered.length + ')</td>';
  h += '<td class="c-num">' + sumReviewField(filtered, 'factHours').toFixed(1) + '</td>';
  h += '<td class="c-num">' + sumReviewField(filtered, 'billableHours').toFixed(1) + '</td>';
  h += '<td class="c-num">' + sumReviewField(filtered, 'payrollHours').toFixed(1) + '</td>';
  h += '<td></td>';
  h += '<td class="c-num">' + _prFmtMoney(sumReviewField(filtered, 'payrollAmount')) + '</td>';
  h += '<td colspan="2"></td>';
  h += '</tr></tfoot></table></div>';

  return h;
}

/* ─── Прогноз выплат ─── */
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
    h += _prProjStat(d.totalBillable.toFixed(1), 'Опл. клиенту', 'var(--green)');
    h += _prProjStat(d.totalPayroll.toFixed(1), 'К выплате', 'var(--yellow)');
    h += _prProjStat(_prFmtMoney(d.totalAmount), 'Сумма', 'var(--orange)');
    h += '</div>';

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

/* ─── Панель сохранения ─── */
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

/* ─── Отладка (только в режиме МОК) ─── */
function _prRenderDebug() {
  if (!PR_MOCK_MODE) return '';
  var h = '<div class="pr-debug">';
  h += '<div class="pr-debug-title">ОТЛАДКА (МОК)</div>';
  h += '<div class="pr-debug-row">Elapsed записей: ' + (_pr.data && _pr.data.elapsed ? _pr.data.elapsed.length : 0) + '</div>';
  h += '<div class="pr-debug-row">Строк обзора: ' + _pr.rows.length + '</div>';
  h += '<div class="pr-debug-row">Разработчики: ' + Object.keys(DEVELOPERS).length + '</div>';
  h += '<div class="pr-debug-row">Проекты (не исключённые): ' + Object.keys(PROJECTS).filter(function(gid) { return !EXCLUDE_GROUPS[gid]; }).length + '</div>';
  h += '<div class="pr-debug-row">Вебхук: ' + esc(HOOK ? HOOK.substring(0, 50) + '...' : 'не задан') + '</div>';
  h += '<div class="pr-debug-row">Режим: ' + (PR_MOCK_MODE ? 'МОК' : 'ЖИВОЙ') + '</div>';
  h += '<div class="pr-debug-row">Период: ' + prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0') + '</div>';
  h += '<div class="pr-debug-row">Статус периода: ' + esc(_pr.periodStatus) + '</div>';
  h += '<div class="pr-debug-row">Ставка по умолчанию: ' + СТАВКА_ПО_УМОЛЧ + ' р/час</div>';
  if (_pr.qualityReport) {
    h += '<div class="pr-debug-row">Качество данных: ' + esc(_pr.qualityReport.quality) + '</div>';
    h += '<div class="pr-debug-row">Orphan задач: ' + _pr.qualityReport.orphanTasks + '</div>';
  }
  if (_pr.data && _pr.data.elapsed && _pr.data.elapsed.length > 0) {
    var sample = _pr.data.elapsed[0];
    h += '<div class="pr-debug-row">Пример elapsed: ID=' + sample.ID + ' ЗАД=' + sample.TASK_ID + ' СЕК=' + sample.SECONDS + '</div>';
  }
  h += '<div class="pr-debug-row">Доменная модель: v' + (typeof PR_DOMAIN_VERSION !== 'undefined' ? PR_DOMAIN_VERSION : '?') + '</div>';
  h += '<div class="pr-debug-row">Аудит записей: ' + _pr.auditLog.length + '</div>';
  h += '</div>';
  return h;
}

/* ─── Модалка «Админка» — редактирование данных разработчиков ─── */
function _prRenderAdminModal() {
  if (!_pr.modalOpen) return '';
  var h = '<div class="pr-modal-overlay" onclick="_prCloseAdmin(event)">';
  h += '<div class="pr-modal" onclick="event.stopPropagation()">';

  h += '<div class="pr-modal-header">';
  h += '<span class="pr-modal-title">&#9881; Админка — Данные разработчиков</span>';
  h += '<button class="pr-modal-close" onclick="_prCloseAdmin()">&times;</button>';
  h += '</div>';

  h += '<div class="pr-modal-body">';
  h += '<table class="pr-admin-table"><thead><tr>';
  h += '<th>ID</th><th>ФИО</th><th>ИНН</th><th>Ставка (р/ч)</th><th>Базовая (р)</th>';
  h += '</tr></thead><tbody>';

  DEV_IDS.forEach(function(id) {
    var sid = String(id);
    var name = prGetDevName(sid);
    var inn = prGetInn(sid);
    var rate = prGetRate(sid);
    var base = prGetBase(sid);

    h += '<tr>';
    h += '<td class="c-num">' + id + '</td>';
    h += '<td><input class="pr-admin-input" type="text" value="' + esc(name) + '" data-devid="' + sid + '" data-field="name"></td>';
    h += '<td><input class="pr-admin-input" type="text" value="' + esc(inn) + '" data-devid="' + sid + '" data-field="inn" placeholder="ИНН"></td>';
    h += '<td><input class="pr-admin-input" type="number" step="100" min="0" value="' + rate + '" data-devid="' + sid + '" data-field="rate" style="width:80px"></td>';
    h += '<td><input class="pr-admin-input" type="number" step="1000" min="0" value="' + base + '" data-devid="' + sid + '" data-field="base" style="width:100px"></td>';
    h += '</tr>';
  });

  h += '</tbody></table>';
  h += '</div>';

  h += '<div class="pr-modal-footer">';
  h += '<button class="pr-btn pr-btn-ghost" onclick="_prCloseAdmin()">Отмена</button>';
  h += '<button class="pr-btn pr-btn-primary" onclick="_prSaveAdmin()">Сохранить всё</button>';
  h += '</div>';

  h += '</div></div>';
  return h;
}

/* ═══════════════════════════════════════════════════════════════
   ОБРАБОТЧИКИ СОБЫТИЙ
   ═══════════════════════════════════════════════════════════════ */
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
  _prSaveFilters(_pr.filters);
  _prRenderAll();
}

function _prToggleStatusFilter(status) {
  if (_pr.filters.status === status) {
    _pr.filters.status = '';
  } else {
    _pr.filters.status = status;
  }
  _prSaveFilters(_pr.filters);
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

  /* Используем domain engine для обновления */
  var result = updateReviewField(_pr.rows[realIdx], field, input.value, _pr.periodStatus);
  if (result.error) {
    console.warn('Update blocked:', result.error);
    return;
  }

  _pr.rows[realIdx] = result.review;

  /* Сохранить audit entry */
  if (result.audit) {
    _pr.auditLog.push(result.audit);
    var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    _prAppendAuditLog(periodKey, result.audit);
  }

  _pr.dirty = true;
  _pr.projection = buildMonthlyProjection(_pr.rows);
  _pr.totals = buildPeriodTotals(_pr.rows);
  _prRenderAll();
}

function _prCycleStatus(idx) {
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;

  var row = filtered[idx];
  var realIdx = _pr.rows.indexOf(row);
  if (realIdx < 0) return;

  var currentStatus = _pr.rows[realIdx].reviewStatus;
  var statusFlow = ['pending', 'approved', 'disputed', 'excluded'];
  var currentIdx = statusFlow.indexOf(currentStatus);
  var nextStatus = statusFlow[(currentIdx + 1) % statusFlow.length];

  /* Используем domain engine для перехода статуса */
  var result = transitionReviewStatus(_pr.rows[realIdx], nextStatus, _pr.periodStatus);
  if (result.error) {
    console.warn('Status transition blocked:', result.error);
    return;
  }

  _pr.rows[realIdx] = result.review;

  /* Сохранить audit entry */
  if (result.audit) {
    _pr.auditLog.push(result.audit);
    var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    _prAppendAuditLog(periodKey, result.audit);
  }

  _pr.dirty = true;
  _pr.projection = buildMonthlyProjection(_pr.rows);
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
  /* Используем domain сортировку (возвращает новый массив) */
  _pr.rows = sortReviews(_pr.rows, field, _pr.sortDir);
  _prRenderAll();
}

function _prSortInd(field) {
  if (_pr.sortField !== field) return '';
  return _pr.sortDir > 0 ? ' &#9650;' : ' &#9660;';
}

function _prSaveAll() {
  var reviews = serializeReviews(_pr.rows);
  _prSaveReviews(prCurrentPeriod.year, prCurrentPeriod.month, reviews);

  /* Сохранить состояние периода */
  var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
  _prSavePeriodState(periodKey, {
    status: _pr.periodStatus,
    snapshotId: null,
    updatedAt: Date.now()
  });

  _pr.dirty = false;
  _prRenderAll();
}

function _prApproveAll() {
  if (!_pr.rows.length) return;
  if (!confirm('Подтвердить все ожидающие задачи?')) return;

  var result = approveAllPending(_pr.rows, _pr.periodStatus);
  _pr.rows = result.reviews;

  /* Сохранить все audit entries */
  if (result.auditEntries.length > 0) {
    var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    _prAppendAuditLog(periodKey, result.auditEntries);
  }

  _pr.dirty = true;
  _pr.projection = buildMonthlyProjection(_pr.rows);
  _pr.totals = buildPeriodTotals(_pr.rows);
  _prRenderAll();
}

function _prExport() {
  if (!_pr.rows.length) return;
  _prSaveAll();

  /* Используем domain export функцию */
  if (typeof prExportCSV === 'function') {
    prExportCSV(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
  }
}

function _prExportDetailed() {
  if (!_pr.rows.length) return;
  _prSaveAll();

  /* Используем domain export функцию */
  if (typeof prExportDetailedCSV === 'function') {
    prExportDetailedCSV(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
  }
}

/* ─── Админка ─── */
function _prOpenAdmin() {
  _pr.modalOpen = true;
  _prRenderAll();
}

function _prCloseAdmin(e) {
  if (e && e.target && !e.target.classList.contains('pr-modal-overlay')) return;
  _pr.modalOpen = false;
  _prRenderAll();
}

function _prSaveAdmin() {
  var inputs = document.querySelectorAll('.pr-admin-input');
  var devData = {};
  inputs.forEach(function(inp) {
    var devId = inp.getAttribute('data-devid');
    var field = inp.getAttribute('data-field');
    if (!devData[devId]) devData[devId] = {};
    devData[devId][field] = inp.value;
  });

  var auditEntries = [];
  Object.keys(devData).forEach(function(devId) {
    var d = devData[devId];
    var settings = _prLoadDevSettings(devId) || {};
    if (d.name) settings.name = d.name;
    if (d.inn !== undefined) settings.inn = d.inn;
    if (d.rate !== undefined) {
      var newRate = parseInt(d.rate) || СТАВКА_ПО_УМОЛЧ;
      if (newRate !== settings.rate) {
        auditEntries.push(createAuditEntry('change_rate', 'developer', devId, {
          oldRate: settings.rate || СТАВКА_ПО_УМОЛЧ,
          newRate: newRate
        }));
      }
      settings.rate = newRate;
    }
    if (d.base !== undefined) {
      var newBase = parseInt(d.base) || 0;
      if (newBase !== settings.base) {
        auditEntries.push(createAuditEntry('change_base', 'developer', devId, {
          oldBase: settings.base || 0,
          newBase: newBase
        }));
      }
      settings.base = newBase;
    }
    _prSaveDevSettings(devId, settings);
  });

  /* Сохранить audit entries */
  if (auditEntries.length > 0) {
    var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    _prAppendAuditLog(periodKey, auditEntries);
  }

  _pr.modalOpen = false;
  /* Перезагрузить данные с новыми настройками */
  _prLoadData();
}

/* ═══════════════════════════════════════════════════════════════
   ПОМОЩНИКИ
   ═══════════════════════════════════════════════════════════════ */
function _prGetFilteredRows() {
  return filterReviews(_pr.rows, _pr.filters);
}

function _prStatusLabel(status) {
  if (typeof PR_REVIEW_STATUS_LABELS !== 'undefined' && PR_REVIEW_STATUS_LABELS[status]) {
    return PR_REVIEW_STATUS_LABELS[status];
  }
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
