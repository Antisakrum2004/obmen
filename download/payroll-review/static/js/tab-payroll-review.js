/* ═══════════════════════════════════════════════════════════════
   tab-payroll-review.js — Главный модуль UI
   v5.0.0 — FAST-FIRST: Inverted pipeline + cache + partial render

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
  periodStatus: 'draft',
  auditLog: [],
  qualityReport: null,
  modelSource: 'live',
  snapshotId: null,
  snapshotChecksum: null,
  /* v4.0: new UI state */
  densityMode: 'comfortable',    /* 'comfortable' | 'compact' */
  viewMode: 'cards',             /* 'cards' | 'table' */
  expandedCards: {},              /* devId -> true if expanded */
  _renderScheduled: false,
  /* v5.0: performance tracking */
  _perf: { loadStart: 0, loadEnd: 0, renderStart: 0, renderEnd: 0, normStart: 0, normEnd: 0, apiCalls: 0, cacheHits: 0 },
  _taskDateCache: {}              /* taskId -> dateStr cache for timeline */
};

/* ─── Density mode persistence ─── */
function _prLoadDensity() {
  try {
    var v = localStorage.getItem('pr_density_mode');
    if (v === 'compact' || v === 'comfortable') return v;
  } catch(e) {}
  return 'comfortable';
}

function _prSaveDensity(mode) {
  try { localStorage.setItem('pr_density_mode', mode); } catch(e) {}
}

/* ─── View mode persistence ─── */
function _prLoadViewMode() {
  try {
    var v = localStorage.getItem('pr_view_mode');
    if (v === 'cards' || v === 'table') return v;
  } catch(e) {}
  return 'cards';
}

function _prSaveViewMode(mode) {
  try { localStorage.setItem('pr_view_mode', mode); } catch(e) {}
}

/* Уничтожение */
function _prDestroy() {
  _pr.intervals.forEach(function(id) { clearInterval(id); });
  _pr.intervals = [];
  if (_pr.styleEl && _pr.styleEl.parentNode) {
    _pr.styleEl.parentNode.removeChild(_pr.styleEl);
    _pr.styleEl = null;
  }
  if (typeof invalidateProjectionCache === 'function') {
    invalidateProjectionCache();
  }
  if (typeof PayrollEvents !== 'undefined') {
    PayrollEvents.off();
  }
  _pr.container = null;
  _pr.rows = [];
  _pr.projection = [];
  _pr.totals = null;
  _pr.data = null;
  _pr.dirty = false;
  _pr.auditLog = [];
  _pr.qualityReport = null;
  _pr.expandedCards = {};
}

/* ═══════════════════════════════════════════════════════════════
   РЕГИСТРАЦИЯ МОДУЛЯ
   ═══════════════════════════════════════════════════════════════ */
window.TabPayrollReview = {
  render: function(container) {
    if (!container) return;
    _prDestroy();
    _pr.container = container;
    _pr.densityMode = _prLoadDensity();
    _pr.viewMode = _prLoadViewMode();

    _pr.styleEl = document.createElement('style');
    _pr.styleEl.textContent = PR_CSS;
    document.head.appendChild(_pr.styleEl);

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
    if (!_pr.loading) {
      /* Stage 12: Invalidate cache on manual refresh */
      if (typeof PayrollCache !== 'undefined') {
        var pk = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
        PayrollCache.invalidate('data:' + pk);
      }
      _prLoadData();
    }
  }
};

/* ═══════════════════════════════════════════════════════════════
   ЗАГРУЗКА ДАННЫХ
   ═══════════════════════════════════════════════════════════════ */
function _prLoadData() {
  _pr.loading = true;
  _pr._perf.loadStart = Date.now();
  _prLoadSteps = []; /* Reset step log */
  /* Hide body scrollbar during loading to prevent ugly scrollbar flash */
  document.body.style.overflow = 'hidden';
  _prRenderLoading();

  var year = prCurrentPeriod.year;
  var month = prCurrentPeriod.month;
  var periodKey = prGetPeriodKey(year, month);

  _prLoadPeriodState(periodKey);
  _pr.auditLog = _prLoadAuditLog(periodKey);

  _prAddLoadStep('\u25B6', 'Загрузка данных за ' + МЕСЯЦЫ_ПОЛН[month - 1] + ' ' + year + '...');

  prLoadPeriodData(year, month, _prLoadProgressCallback).then(function(data) {
    _pr._perf.loadEnd = Date.now();
    _pr.data = data;
    _pr._taskDateCache = {}; /* Clear date cache on new data */

    var elapsedCount = (data && data.elapsed) ? data.elapsed.length : 0;
    var taskCount = (data && data.tasks) ? data.tasks.length : 0;
    var devCount = Object.keys(DEVELOPERS).length;
    _prAddLoadStep('\u2713', 'Данные загружены: ' + devCount + ' разраб., ' + elapsedCount + ' elapsed, ' + taskCount + ' задач');

    _prAddLoadStep('\u25B6', 'Нормализация...');
    _pr._perf.normStart = Date.now();

    var savedReviews = _prLoadReviews(year, month);

    if (typeof buildNormalizedModel === 'function') {
      var model = buildNormalizedModel({
        periodKey: periodKey,
        periodStatus: _pr.periodStatus,
        rawData: data,
        savedReviews: savedReviews,
        rateProvider: _prRateProvider()
      });
      _pr.rows = model.rows;
      _pr.modelSource = model.source;
      _pr.snapshotId = model.snapshotId;
      _pr.snapshotChecksum = model.snapshotChecksum;
      _pr.qualityReport = model.qualityReport;
    } else {
      var result = buildReviewRows(data, savedReviews, _prRateProvider());
      _pr.rows = result.rows;
      _pr.qualityReport = result.qualityReport;
      _pr.modelSource = 'live_fallback';
    }

    _pr._perf.normEnd = Date.now();

    var normMs = _pr._perf.normEnd - _pr._perf.normStart;
    _prAddLoadStep('\u2713', 'Нормализация: ' + _pr.rows.length + ' строк за ' + normMs + 'мс');

    /* Safety warning for large datasets */
    if (_pr.rows.length > 300) {
      console.warn('SAFETY: ' + _pr.rows.length + ' rows exceeds 300 limit');
      _prAddLoadStep('\u26A0', 'SAFETY: ' + _pr.rows.length + ' строк (лимит 300)');
    }

    _prAddLoadStep('\u25B6', 'Построение прогнозов...');
    _pr.projection = typeof buildMonthlyProjectionCached === 'function'
      ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
    _pr.totals = typeof buildPeriodTotalsCached === 'function'
      ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);

    /* Ensure ALL developers appear in projection, even those with 0 elapsed */
    _prEnsureAllDevsInProjection();

    _prAddLoadStep('\u2713', 'Прогнозы: ' + _pr.projection.length + ' разработчиков');

    _pr.dirty = false;
    _pr.loading = false;

    var totalMs = _pr._perf.loadEnd - _pr._perf.loadStart + normMs;
    _prAddLoadStep('\u2713', 'Готово! Общее время: ' + totalMs + 'мс');

    /* Restore body scrollbar after loading completes */
    document.body.style.overflow = '';
    _prScheduleRender();
  }).catch(function(e) {
    console.error('Ошибка загрузки', e);
    _pr.loading = false;
    /* Restore body scrollbar on error too */
    document.body.style.overflow = '';
    _prAddLoadStep('\u2717', 'ОШИБКА: ' + (e.message || 'Неизвестная ошибка'));
    _prRenderError(e.message || 'Ошибка загрузки данных. Проверьте подключение и режим (МОК/ЖИВОЙ).');
  });
}

/* Progress callback for data loader — called from mock-data.js */
function _prLoadProgressCallback(step, detail) {
  _prAddLoadStep('\u25B6', step + (detail ? ': ' + detail : ''));
}

/* ─── Scheduled render (batch updates via rAF) ─── */
function _prScheduleRender() {
  if (_pr._renderScheduled) return;
  _pr._renderScheduled = true;
  requestAnimationFrame(function() {
    _pr._renderScheduled = false;
    _prRenderAll();
  });
}

/* ═══════════════════════════════════════════════════════════════
   STORAGE DELEGATION
   ═══════════════════════════════════════════════════════════════ */
function _prStorage() {
  if (typeof PayrollStorage !== 'undefined') return PayrollStorage;
  return null;
}

function _prLoadReviews(year, month) {
  var store = _prStorage();
  if (store) return store.loadReviews(year, month);
  if (typeof prLoadReviews === 'function') return prLoadReviews(year, month);
  return {};
}

function _prSaveReviews(year, month, reviews) {
  var store = _prStorage();
  if (store) {
    var result = store.saveReviews(year, month, reviews);
    if (result && !result.success) {
      console.warn('_prSaveReviews: blocked -', result.error);
      if (result.error === 'period_immutable') {
        alert('Невозможно сохранить: период заблокирован для изменений');
      }
      return false;
    }
    return result ? result.success : false;
  }
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
  if (store) {
    var result = store.savePeriodState(periodKey, state);
    if (result && !result.success) {
      console.warn('_prSavePeriodState: blocked -', result.error, result.message || '');
      if (result.error === 'invalid_transition') {
        alert('Недопустимый переход статуса: ' + (result.message || ''));
      }
      return false;
    }
    return result ? result.success : false;
  }
  return false;
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

/* Loading step log — each step shows as a line in the loading panel */
var _prLoadSteps = [];

function _prAddLoadStep(icon, text) {
  _prLoadSteps.push({icon: icon || '\u25CB', text: text, time: Date.now()});
  _prRenderLoadingSteps();
}

function _prRenderLoadingSteps() {
  var el = document.getElementById('pr-loading-steps');
  if (!el) return;
  var h = '';
  _prLoadSteps.forEach(function(step, idx) {
    var isLast = idx === _prLoadSteps.length - 1;
    var color = isLast ? 'var(--accent)' : 'var(--green)';
    var checkmark = idx < _prLoadSteps.length - 1 ? '\u2713' : '\u25B6';
    h += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;color:' + color + '">' +
      '<span style="font-size:10px;width:14px;text-align:center">' + checkmark + '</span>' +
      '<span style="font-family:var(--mono);font-size:10px">' + esc(step.text) + '</span>' +
      '</div>';
  });
  el.innerHTML = h;
  /* Force scroll to bottom */
  el.scrollTop = el.scrollHeight;
}

function _prRenderLoading() {
  if (!_pr.container) return;
  _prLoadSteps = [];
  var modeLabel = PR_MOCK_MODE ? 'МОК' : 'ЖИВОЙ';
  _pr.container.innerHTML =
    '<div class="pr-loading" style="gap:14px;align-items:flex-start;max-width:500px;margin:0 auto;padding:32px 24px">' +
    '<div style="display:flex;align-items:center;gap:10px;width:100%">' +
      '<div class="pr-ring"></div>' +
      '<div>' +
        '<div id="pr-loading-msg" style="font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text)">Загрузка данных за ' + esc(МЕСЯЦЫ_ПОЛН[prCurrentPeriod.month - 1] + ' ' + prCurrentPeriod.year) + '</div>' +
        '<div style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-top:2px">Режим: ' + modeLabel + ' | Pipeline: elapsed-first v5.0</div>' +
      '</div>' +
    '</div>' +
    '<div id="pr-loading-steps" style="width:100%;max-height:200px;overflow-y:hidden;padding:8px 12px;background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:8px;margin-top:4px"></div>' +
    '</div>';
  _prAddLoadStep('\u25B6', 'Инициализация...');
}

function _prRenderError(msg) {
  if (!_pr.container) return;
  _pr.container.innerHTML = '<div class="pr-empty" style="color:var(--red)"><div style="font-size:24px">&#9888;</div><div>' + esc(msg) + '</div></div>';
}

function _prRenderAll() {
  if (!_pr.container) return;
  _pr._perf.renderStart = Date.now();
  var h = '';
  h += _prRenderHeader();
  h += _prRenderKPIs();
  h += _prRenderHeatmap();
  h += _prRenderFilters();
  /* Stage 11: Safety limit warning banner */
  h += _prRenderSafetyBanner();
  if (_pr.viewMode === 'cards') {
    h += _prRenderDevCards();
  } else {
    h += _prRenderTable();
  }
  h += _prRenderFinFooter();
  h += _prRenderSaveBar();
  h += _prRenderDebug();
  h += _prRenderAdminModal();
  _pr.container.innerHTML = h;
  _pr._perf.renderEnd = Date.now();
}

/* Stage 7: Partial card render — only update a single dev card DOM */
function _prRenderCardPartial(devId) {
  if (!_pr.container) return;
  var cardEl = document.getElementById('pr-card-' + devId);
  if (!cardEl) { _prScheduleRender(); return; }
  /* Find matching projection */
  var dev = null;
  _pr.projection.forEach(function(d) {
    if (String(d.developerId) === String(devId)) dev = d;
  });
  if (!dev) return;
  var tmp = document.createElement('div');
  tmp.innerHTML = _prRenderOneDevCard(dev);
  var newCard = tmp.firstChild;
  if (newCard && cardEl.parentNode) {
    cardEl.parentNode.replaceChild(newCard, cardEl);
  }
}

/* Stage 11: Safety limit warning banner */
function _prRenderSafetyBanner() {
  var warnings = [];
  var elapsedCount = (_pr.data && _pr.data.elapsed) ? _pr.data.elapsed.length : 0;
  if (_pr.rows.length > 300) {
    warnings.push('Строк обзора: ' + _pr.rows.length + ' (лимит 300). Данные обрезаны.');
  }
  if (elapsedCount > 5000) {
    warnings.push('Elapsed записей: ' + elapsedCount + ' (лимит 5000). Данные обрезаны.');
  }
  if (!warnings.length) return '';
  var h = '<div style="background:rgba(255,79,106,.1);border:1px solid rgba(255,79,106,.3);border-radius:8px;padding:8px 14px;margin-bottom:8px;display:flex;align-items:center;gap:8px">';
  h += '<span style="color:var(--red);font-size:16px">&#9888;</span>';
  h += '<span style="font-family:var(--mono);font-size:11px;color:var(--red)">SAFETY: ' + esc(warnings.join(' | ')) + '</span>';
  h += '</div>';
  return h;
}

/* ═══════════════════════════════════════════════════════════════
   ШАПКА
   ═══════════════════════════════════════════════════════════════ */
function _prRenderHeader() {
  var modeBadge = PR_MOCK_MODE
    ? '<span class="pr-badge pr-badge-mock">МОК</span>'
    : '<span class="pr-badge pr-badge-live">ЖИВОЙ</span>';

  var devCount = Object.keys(DEVELOPERS).length;
  var taskCount = _pr.rows.length;

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

  /* Выбор периода — только текущий + предыдущий (Stage 2: period boundaries) */
  h += '<select class="pr-select" id="prPeriodSelect" onchange="_prOnPeriodChange()">';
  var now = new Date();
  for (var i = 0; i < 2; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var y = d.getFullYear(), m = d.getMonth() + 1;
    var sel = (y === prCurrentPeriod.year && m === prCurrentPeriod.month) ? ' selected' : '';
    h += '<option value="' + y + '-' + m + '"' + sel + '>' + МЕСЯЦЫ_ПОЛН[m - 1] + ' ' + y + '</option>';
  }
  h += '</select>';

  h += '<button class="pr-btn pr-btn-ghost" onclick="window.TabPayrollReview.refresh()" title="Обновить данные">&#8635;</button>';

  /* View toggle: Cards / Table */
  h += '<div class="pr-view-toggle">';
  h += '<button class="pr-view-btn' + (_pr.viewMode === 'cards' ? ' active' : '') + '" onclick="_prSetViewMode(\'cards\')">Карточки</button>';
  h += '<button class="pr-view-btn' + (_pr.viewMode === 'table' ? ' active' : '') + '" onclick="_prSetViewMode(\'table\')">Таблица</button>';
  h += '</div>';

  /* Density toggle */
  h += '<div class="pr-density-toggle">';
  h += '<button class="pr-density-btn' + (_pr.densityMode === 'comfortable' ? ' active' : '') + '" onclick="_prSetDensity(\'comfortable\')">Компактно</button>';
  h += '<button class="pr-density-btn' + (_pr.densityMode === 'compact' ? ' active' : '') + '" onclick="_prSetDensity(\'compact\')">Плотно</button>';
  h += '</div>';

  h += '<button class="pr-btn pr-btn-orange" onclick="_prOpenAdmin()">&#9881; Админка</button>';
  h += '<button class="pr-btn pr-btn-green" onclick="_prExport()">&#11015; CSV</button>';
  h += '<button class="pr-btn pr-btn-ghost" onclick="_prExportDetailed()" title="Детальный CSV">CSV+</button>';
  h += '<button class="pr-btn pr-btn-primary" onclick="_prApproveAll()">&#10003; Подтвердить все</button>';

  h += '</div></div>';
  return h;
}

/* ─── View/Density handlers ─── */
function _prSetViewMode(mode) {
  _pr.viewMode = mode;
  _prSaveViewMode(mode);
  _prRenderAll();
}

function _prSetDensity(mode) {
  _pr.densityMode = mode;
  _prSaveDensity(mode);
  _prRenderAll();
}

/* ═══════════════════════════════════════════════════════════════
   KPI КАРТОЧКИ (top overview)
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   TEAM HEATMAP BAR — Sticky overview
   ═══════════════════════════════════════════════════════════════ */
function _prRenderHeatmap() {
  if (!_pr.projection.length) return '';
  var h = '<div class="pr-heatmap">';
  h += '<div class="pr-heatmap-title">Команда</div>';
  h += '<div class="pr-heatmap-row">';

  _pr.projection.forEach(function(dev) {
    var risks = _prCalcDevRisks(dev);
    var riskLevel = risks.length > 0 ? (risks.indexOf('OVERBURN') >= 0 || risks.indexOf('NEGATIVE MARGIN') >= 0 ? 'red' : 'yellow') : 'green';
    var marginPct = _prCalcMarginPct(dev);
    var marginCls = marginPct >= 0 ? 'pos' : 'neg';
    var marginTxt = marginPct >= 0 ? ('+' + marginPct + '%') : (marginPct + '%');
    var firstName = getFirstName(dev.developerName);

    h += '<div class="pr-heatmap-chip" onclick="_prScrollToDev(\'' + esc(dev.developerId) + '\')">';
    h += '<span class="pr-heatmap-dot ' + riskLevel + '"></span>';
    h += '<span class="pr-heatmap-name">' + esc(firstName) + '</span>';
    h += '<span class="pr-heatmap-hours">' + dev.totalFactHours.toFixed(0) + 'h</span>';
    h += '<span class="pr-heatmap-margin ' + marginCls + '">' + marginTxt + '</span>';
    if (risks.length > 0) {
      h += '<span class="pr-heatmap-risk">' + risks[0] + '</span>';
    }
    h += '</div>';
  });

  h += '</div></div>';
  return h;
}

function _prScrollToDev(devId) {
  var el = document.getElementById('pr-card-' + devId);
  if (el) {
    el.scrollIntoView({behavior: 'smooth', block: 'center'});
    el.style.boxShadow = '0 0 0 2px var(--accent), 0 4px 16px rgba(79,139,255,.2)';
    setTimeout(function() { el.style.boxShadow = ''; }, 1500);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ФИЛЬТРЫ
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   DEV PERFORMANCE CARDS — ETAP 1
   ═══════════════════════════════════════════════════════════════ */
function _prRenderDevCards() {
  if (!_pr.projection.length) return '<div class="pr-empty"><div style="font-size:24px">&#128203;</div><div>Нет данных за выбранный период</div></div>';

  var filtered = _prGetFilteredProjection();
  if (!filtered.length) return '<div class="pr-empty"><div style="font-size:24px">&#128203;</div><div>Нет задач за выбранный период</div></div>';

  var densityCls = _pr.densityMode === 'compact' ? ' pr-compact' : '';
  var h = '<div class="pr-dev-cards' + densityCls + '">';

  filtered.forEach(function(dev) {
    h += _prRenderOneDevCard(dev);
  });

  h += '</div>';
  return h;
}

/* ─── Ensure ALL developers appear in projection (even with 0 elapsed) ─── */
function _prEnsureAllDevsInProjection() {
  if (typeof DEVELOPERS === 'undefined') return;
  var existingDevs = {};
  _pr.projection.forEach(function(dev) {
    existingDevs[String(dev.developerId)] = true;
  });
  var missingCount = 0;
  Object.keys(DEVELOPERS).forEach(function(devId) {
    if (!existingDevs[devId]) {
      /* This developer has no elapsed in the current period — add empty entry */
      _pr.projection.push({
        developerId: devId,
        developerName: prGetDevName(devId),
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
        approvalRate: 0,
        margin: 0,
        projectCount: 0,
        projectNames: '',
        projects: {}
      });
      missingCount++;
    }
  });
  if (missingCount > 0) {
    console.log('_prEnsureAllDevsInProjection: добавлено ' + missingCount + ' разработчиков с 0 часов');
    /* Re-sort: by totalAmount desc, then by name */
    _pr.projection.sort(function(a, b) {
      if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
      return a.developerName.localeCompare(b.developerName);
    });
  }
}

function _prGetFilteredProjection() {
  var f = _pr.filters;
  return _pr.projection.filter(function(dev) {
    if (f.developer && String(dev.developerId) !== String(f.developer)) return false;
    if (f.project) {
      /* Check if this developer has tasks in this project */
      var hasProject = false;
      _pr.rows.forEach(function(r) {
        if (String(r.developerId) === String(dev.developerId) && String(r.projectId) === String(f.project)) {
          hasProject = true;
        }
      });
      if (!hasProject) return false;
    }
    if (f.status) {
      /* Check if this developer has tasks with this status */
      var hasStatus = false;
      _pr.rows.forEach(function(r) {
        if (String(r.developerId) === String(dev.developerId) && r.reviewStatus === f.status) {
          hasStatus = true;
        }
      });
      if (!hasStatus) return false;
    }
    return true;
  });
}

function _prRenderOneDevCard(dev) {
  var risks = _prCalcDevRisks(dev);
  var riskCls = risks.length > 0 ? (risks.indexOf('OVERBURN') >= 0 || risks.indexOf('NEGATIVE MARGIN') >= 0 ? ' risk-high' : ' risk-warn') : '';
  var marginPct = _prCalcMarginPct(dev);
  var cutHours = safeRound(dev.totalFactHours - dev.totalBillable, 1);
  var cardStatus = _prCalcDevStatus(dev);
  var isExpanded = _pr.expandedCards[dev.developerId];
  var firstName = getFirstName(dev.developerName);
  var rate = prGetRate(dev.developerId);
  var avgPerTask = dev.taskCount > 0 ? safeRound(dev.totalFactHours / dev.taskCount, 1) : 0;

  /* Calculate weekend/overtime from raw data */
  var weekendH = 0;
  var overtimeH = 0;
  var devRows = _pr.rows.filter(function(r) { return String(r.developerId) === String(dev.developerId); });
  devRows.forEach(function(r) {
    if (r.factHours > 8) overtimeH += safeRound(r.factHours - 8, 1);
  });

  var h = '<div class="pr-dev-card' + riskCls + '" id="pr-card-' + dev.developerId + '">';

  /* ─── HEADER ─── */
  h += '<div class="pr-card-inner">';
  h += '<div class="pr-card-hdr">';
  h += '<div class="pr-card-avatar">' + esc(firstName.charAt(0)) + '</div>';
  h += '<div class="pr-card-identity">';
  h += '<div class="pr-card-name">' + esc(dev.developerName) + '</div>';
  h += '<div class="pr-card-role">' + rate + ' р/ч</div>';
  h += '</div>';
  h += '<span class="pr-card-status ' + cardStatus.cls + '">' + cardStatus.label + '</span>';
  h += '</div>';

  /* ─── PRIMARY KPI (L1) ─── */
  h += '<div class="pr-card-kpi">';
  h += '<div class="pr-kpi-primary">';
  h += '<div class="pr-kpi-hours">' + dev.totalFactHours.toFixed(1) + '</div>';
  h += '<div class="pr-kpi-hours-label">Факт часов</div>';
  h += '</div>';
  h += '<div class="pr-kpi-primary">';
  h += '<div class="pr-kpi-money">' + _prFmtMoney(dev.totalAmount) + '</div>';
  h += '<div class="pr-kpi-money-label">К выплате</div>';
  h += '</div>';
  h += '</div>';

  /* ─── SECONDARY METRICS (L2) ─── */
  h += '<div class="pr-card-secondary">';
  h += '<div class="pr-sec-item primary-sec"><span class="pr-sec-label">Billable</span><span class="pr-sec-val billable">' + dev.totalBillable.toFixed(1) + 'h</span></div>';
  h += '<div class="pr-sec-divider"></div>';
  if (cutHours > 0) {
    h += '<div class="pr-sec-item primary-sec"><span class="pr-sec-label">Cut</span><span class="pr-sec-val cut">-' + cutHours.toFixed(1) + 'h</span></div>';
  } else {
    h += '<div class="pr-sec-item primary-sec"><span class="pr-sec-label">Cut</span><span class="pr-sec-val" style="color:var(--text3)">0h</span></div>';
  }
  h += '<div class="pr-sec-divider"></div>';
  var marginCls = marginPct >= 0 ? 'margin-pos' : 'margin-neg';
  h += '<div class="pr-sec-item"><span class="pr-sec-label">Margin</span><span class="pr-sec-val ' + marginCls + '">' + (marginPct >= 0 ? '+' : '') + marginPct + '%</span></div>';
  h += '</div>';

  /* ─── PROGRESS BARS (L3) ─── */
  h += '<div class="pr-card-progress">';

  /* Workload: fact / 160 */
  var workloadPct = Math.min(safeRound(dev.totalFactHours / 160 * 100, 0), 100);
  var workloadColor = workloadPct > 100 ? 'red' : workloadPct > 80 ? 'green' : workloadPct > 50 ? 'yellow' : 'red';
  h += '<div class="pr-progress-row">';
  h += '<span class="pr-progress-label">Загрузка</span>';
  h += '<div class="pr-progress-track"><div class="pr-progress-fill ' + workloadColor + '" style="width:' + workloadPct + '%"></div></div>';
  h += '<span class="pr-progress-val">' + dev.totalFactHours.toFixed(0) + '/160h</span>';
  h += '</div>';

  /* Billable efficiency: billable / fact */
  var billPct = dev.totalFactHours > 0 ? Math.min(safeRound(dev.totalBillable / dev.totalFactHours * 100, 0), 100) : 0;
  var billColor = billPct >= 95 ? 'green' : billPct >= 80 ? 'yellow' : 'red';
  h += '<div class="pr-progress-row">';
  h += '<span class="pr-progress-label">Billable</span>';
  h += '<div class="pr-progress-track"><div class="pr-progress-fill ' + billColor + '" style="width:' + billPct + '%"></div></div>';
  h += '<span class="pr-progress-val">' + billPct + '%</span>';
  h += '</div>';

  /* Margin quality */
  var marginBarPct = Math.min(Math.abs(marginPct), 100);
  var marginBarColor = marginPct >= 30 ? 'green' : marginPct >= 10 ? 'yellow' : marginPct >= 0 ? 'accent' : 'red';
  h += '<div class="pr-progress-row">';
  h += '<span class="pr-progress-label">Маржа</span>';
  h += '<div class="pr-progress-track"><div class="pr-progress-fill ' + marginBarColor + '" style="width:' + marginBarPct + '%"></div></div>';
  h += '<span class="pr-progress-val">' + (marginPct >= 0 ? '+' : '') + marginPct + '%</span>';
  h += '</div>';

  h += '</div>';

  /* ─── RISK BADGES ─── */
  if (risks.length > 0) {
    h += '<div class="pr-card-risks">';
    risks.forEach(function(risk) {
      var riskCls2 = 'risk-' + risk.toLowerCase().replace(/\s+/g, '');
      h += '<span class="pr-risk-pill ' + riskCls2 + '">' + risk + '</span>';
    });
    h += '</div>';
  }

  h += '</div>'; /* end .pr-card-inner */

  /* ─── FOOTER METRICS ─── */
  h += '<div class="pr-card-footer">';
  h += '<div class="pr-footer-metric"><div class="pr-footer-val">' + dev.taskCount + '</div><div class="pr-footer-label">Задач</div></div>';
  h += '<div class="pr-footer-metric"><div class="pr-footer-val">' + avgPerTask.toFixed(1) + 'h</div><div class="pr-footer-label">Ср/зад</div></div>';
  h += '<div class="pr-footer-metric"><div class="pr-footer-val">' + weekendH.toFixed(0) + '</div><div class="pr-footer-label">Выходн</div></div>';
  h += '<div class="pr-footer-metric"><div class="pr-footer-val">' + overtimeH.toFixed(0) + '</div><div class="pr-footer-label">Сверхур</div></div>';
  h += '</div>';

  /* ─── EXPAND / TIMELINE ─── */
  var expandCls = isExpanded ? ' open' : '';
  h += '<div class="pr-card-expand' + expandCls + '" onclick="_prToggleCard(\'' + dev.developerId + '\')">';
  h += '<span class="pr-card-expand-icon">&#9660;</span> ';
  h += isExpanded ? 'Свернуть' : ('Задачи (' + dev.taskCount + ')');
  h += '</div>';

  if (isExpanded) {
    h += _prRenderTimeline(dev.developerId);
  }

  h += '</div>'; /* end .pr-dev-card */
  return h;
}

/* ─── Dev card helpers ─── */
function _prCalcDevRisks(dev) {
  var risks = [];
  var cutHours = safeRound(dev.totalFactHours - dev.totalBillable, 1);
  var marginPct = _prCalcMarginPct(dev);
  var rate = prGetRate(dev.developerId);

  if (dev.totalFactHours > dev.totalBillable * 1.3) risks.push('OVERBURN');
  if (dev.totalFactHours < 80) risks.push('LOW LOAD');
  if (cutHours > 5) risks.push('CUT HOURS');
  if (!rate || rate <= 0) risks.push('NO RATE');
  if (dev.pendingCount > 0 && dev.approvedCount === 0) risks.push('UNREVIEWED');
  if (marginPct < 0) risks.push('NEGATIVE MARGIN');

  return risks;
}

function _prCalcMarginPct(dev) {
  if (dev.totalBillable <= 0) return 0;
  var rate = prGetRate(dev.developerId) || 0;
  var clientRevenue = dev.totalBillable * rate;
  var payrollCost = dev.totalAmount;
  if (clientRevenue <= 0) return 0;
  return safeRound((clientRevenue - payrollCost) / clientRevenue * 100, 0);
}

function _prCalcDevStatus(dev) {
  if (dev.approvedCount === dev.taskCount && dev.taskCount > 0) {
    return {label: 'APPROVED', cls: 's-approved'};
  }
  if (dev.approvedCount > 0) {
    return {label: 'REVIEW', cls: 's-review'};
  }
  return {label: 'DRAFT', cls: 's-draft'};
}

function _prToggleCard(devId) {
  _pr.expandedCards[devId] = !_pr.expandedCards[devId];
  /* Stage 7: Partial render — only re-render the affected card, not the whole dashboard */
  _prRenderCardPartial(devId);
}

/* ═══════════════════════════════════════════════════════════════
   TIMELINE VIEW — ETAP 4
   ═══════════════════════════════════════════════════════════════ */
function _prRenderTimeline(devId) {
  var devRows = _pr.rows.filter(function(r) {
    return String(r.developerId) === String(devId) &&
           r.reviewStatus !== 'excluded';
  });

  if (!devRows.length) {
    return '<div class="pr-timeline"><div style="font-family:var(--mono);font-size:10px;color:var(--text3);padding:8px">Нет задач</div></div>';
  }

  /* Group by date if we have elapsed entries with dates */
  var byDate = {};
  var noDate = [];

  devRows.forEach(function(r, idx) {
    /* Try to get date from elapsed entries */
    var dateStr = _prGetTaskDate(r.taskId);
    if (dateStr) {
      if (!byDate[dateStr]) byDate[dateStr] = [];
      byDate[dateStr].push({row: r, idx: _pr.rows.indexOf(r)});
    } else {
      noDate.push({row: r, idx: _pr.rows.indexOf(r)});
    }
  });

  var densityCls = _pr.densityMode === 'compact' ? ' pr-compact' : '';
  var h = '<div class="pr-timeline' + densityCls + '">';

  /* Sort dates descending */
  var dates = Object.keys(byDate).sort().reverse();
  dates.forEach(function(dateStr) {
    h += '<div class="pr-tl-day">';
    h += '<div class="pr-tl-date">' + _prFormatDate(dateStr) + '</div>';
    byDate[dateStr].forEach(function(item) {
      h += _prRenderTimelineItem(item.row, item.idx);
    });
    h += '</div>';
  });

  /* Tasks without dates */
  if (noDate.length) {
    h += '<div class="pr-tl-day">';
    if (dates.length > 0) h += '<div class="pr-tl-date">Без даты</div>';
    noDate.forEach(function(item) {
      h += _prRenderTimelineItem(item.row, item.idx);
    });
    h += '</div>';
  }

  h += '</div>';
  return h;
}

function _prRenderTimelineItem(r, realIdx) {
  var cutHours = safeRound(r.factHours - r.billableHours, 1);
  var isCut = cutHours > 0;

  var h = '<div class="pr-tl-item">';
  h += '<span class="pr-tl-hours">+' + r.factHours.toFixed(1) + 'h</span>';
  h += '<span class="pr-tl-task" title="' + esc(r.taskTitle) + '">' + esc(truncate(r.taskTitle, 40)) + '</span>';
  if (isCut) {
    h += '<span class="pr-tl-cut">-' + cutHours.toFixed(1) + 'h</span>';
  }
  h += '<span class="pr-tl-status ' + r.reviewStatus + '" onclick="_prCycleStatus(' + realIdx + ')">' + _prStatusLabel(r.reviewStatus) + '</span>';
  h += '</div>';
  return h;
}

function _prGetTaskDate(taskId) {
  /* Use cache to avoid repeated linear scans */
  if (_pr._taskDateCache[taskId] !== undefined) return _pr._taskDateCache[taskId];
  if (!_pr.data || !_pr.data.elapsed) { _pr._taskDateCache[taskId] = null; return null; }
  for (var i = 0; i < _pr.data.elapsed.length; i++) {
    var e = _pr.data.elapsed[i];
    if (String(e.TASK_ID) === String(taskId)) {
      var d = _normParseDate(e.CREATED_DATE || e.DATE_START);
      if (d) {
        var result = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        _pr._taskDateCache[taskId] = result;
        return result;
      }
    }
  }
  _pr._taskDateCache[taskId] = null;
  return null;
}

function _prFormatDate(dateStr) {
  var parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  var monthIdx = parseInt(parts[1], 10) - 1;
  return МЕСЯЦЫ_КР[monthIdx] + ' ' + parseInt(parts[2], 10);
}

/* ═══════════════════════════════════════════════════════════════
   STICKY FINANCIAL FOOTER — ETAP 5
   ═══════════════════════════════════════════════════════════════ */
function _prRenderFinFooter() {
  if (!_pr.totals) return '';
  var t = _pr.totals;
  var marginPct = t.totalBillable > 0
    ? safeRound((t.totalBillable * (t.totalPayroll > 0 ? t.totalPayrollAmount / t.totalPayroll : 0) - t.totalPayrollAmount) / (t.totalBillable * (t.totalPayroll > 0 ? t.totalPayrollAmount / t.totalPayroll : 0) || 1) * 100, 0)
    : 0;
  var marginCls = marginPct >= 0 ? 'margin-pos' : 'margin-neg';

  var h = '<div class="pr-fin-footer">';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Факт часы</div><div class="pr-fin-val fact">' + t.totalFactHours.toFixed(1) + '</div></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Billable</div><div class="pr-fin-val billable">' + t.totalBillable.toFixed(1) + '</div></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">К выплате</div><div class="pr-fin-val payroll">' + t.totalPayroll.toFixed(1) + '</div></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Сумма</div><div class="pr-fin-val" style="color:var(--orange)">' + _prFmtMoney(t.totalPayrollAmount) + '</div></div>';
  h += '<div class="pr-fin-spacer"></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Маржа</div><div class="pr-fin-val ' + marginCls + '">' + (marginPct >= 0 ? '+' : '') + marginPct + '%</div></div>';
  h += '</div>';
  return h;
}

/* ═══════════════════════════════════════════════════════════════
   TABLE VIEW (legacy, accessible via toggle)
   ═══════════════════════════════════════════════════════════════ */
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

    h += '<td class="c-num"><span class="pr-readonly">' + r.factHours.toFixed(1) + '</span></td>';

    var billChanged = r.billableHours !== r.factHours;
    h += '<td class="c-num"><input class="pr-editable' + (billChanged ? ' changed' : '') + '" type="number" step="0.5" min="0" value="' + r.billableHours.toFixed(1) + '" data-idx="' + idx + '" data-field="billableHours" onchange="_prOnEdit(this)"></td>';

    var payChanged = r.payrollHours !== r.factHours;
    h += '<td class="c-num"><input class="pr-editable' + (payChanged ? ' changed' : '') + '" type="number" step="0.5" min="0" value="' + r.payrollHours.toFixed(1) + '" data-idx="' + idx + '" data-field="payrollHours" onchange="_prOnEdit(this)"></td>';

    h += '<td class="c-num"><span class="pr-readonly pr-rate-display">' + r.rate + '</span></td>';
    h += '<td class="c-num"><span class="pr-readonly pr-amount">' + _prFmtMoney(r.payrollAmount) + '</span></td>';

    h += '<td><span class="pr-status pr-status-' + r.reviewStatus + '" data-idx="' + idx + '" onclick="_prCycleStatus(' + idx + ')">' + _prStatusLabel(r.reviewStatus) + '</span></td>';

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

/* ═══════════════════════════════════════════════════════════════
   ПАНЕЛЬ СОХРАНЕНИЯ
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   ОТЛАДКА
   ═══════════════════════════════════════════════════════════════ */
function _prRenderDebug() {
  var h = '<div class="pr-debug">';
  h += '<div class="pr-debug-title">ОТЛАДКА (' + (PR_MOCK_MODE ? 'МОК' : 'ЖИВОЙ') + ')</div>';
  h += '<div class="pr-debug-row">Версия: ' + APP_VERSION + '</div>';
  h += '<div class="pr-debug-row">Pipeline: elapsed-first v5.0</div>';

  /* ── Performance metrics ── */
  var loadMs = _pr._perf.loadEnd > 0 ? (_pr._perf.loadEnd - _pr._perf.loadStart) : 0;
  var normMs = _pr._perf.normEnd > 0 ? (_pr._perf.normEnd - _pr._perf.normStart) : 0;
  var renderMs = _pr._perf.renderEnd > 0 ? (_pr._perf.renderEnd - _pr._perf.renderStart) : 0;
  var totalMs = loadMs + normMs + renderMs;
  h += '<div class="pr-debug-row" style="color:var(--cyan)">Load: ' + loadMs + 'ms | Norm: ' + normMs + 'ms | Render: ' + renderMs + 'ms | Total: ' + totalMs + 'ms</div>';

  /* Cache stats */
  if (typeof PayrollCache !== 'undefined') {
    var cs = PayrollCache.stats();
    h += '<div class="pr-debug-row">Cache: hits=' + cs.hits + ' misses=' + cs.misses + ' stale=' + cs.staleHits + ' rate=' + cs.hitRate + '</div>';
  }

  h += '<div class="pr-debug-row">Elapsed записей: ' + (_pr.data && _pr.data.elapsed ? _pr.data.elapsed.length : 0) + '</div>';
  h += '<div class="pr-debug-row">Строк обзора: ' + _pr.rows.length + '</div>';
  h += '<div class="pr-debug-row">Task date cache: ' + Object.keys(_pr._taskDateCache).length + ' entries</div>';
  h += '<div class="pr-debug-row">Разработчики: ' + Object.keys(DEVELOPERS).length + '</div>';
  h += '<div class="pr-debug-row">Проекты (не исключённые): ' + Object.keys(PROJECTS).filter(function(gid) { return !EXCLUDE_GROUPS[gid]; }).length + '</div>';
  h += '<div class="pr-debug-row">Вебхук: ' + esc(HOOK ? HOOK.substring(0, 50) + '...' : 'не задан') + '</div>';
  h += '<div class="pr-debug-row">Режим: ' + (PR_MOCK_MODE ? 'МОК' : 'ЖИВОЙ') + '</div>';
  h += '<div class="pr-debug-row">Период: ' + prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0') + '</div>';
  h += '<div class="pr-debug-row">Статус периода: ' + esc(_pr.periodStatus) + '</div>';
  h += '<div class="pr-debug-row">Источник данных: ' + esc(_pr.modelSource || 'live') + '</div>';
  h += '<div class="pr-debug-row">Ставка по умолчанию: ' + СТАВКА_ПО_УМОЛЧ + ' р/час</div>';
  h += '<div class="pr-debug-row">Вид: ' + _pr.viewMode + ' | Плотность: ' + _pr.densityMode + '</div>';

  /* Safety warnings */
  if (_pr.rows.length > 300) {
    h += '<div class="pr-debug-row" style="color:var(--red)">SAFETY WARNING: ' + _pr.rows.length + ' rows (max 300)</div>';
  }
  var elapsedCount = (_pr.data && _pr.data.elapsed) ? _pr.data.elapsed.length : 0;
  if (elapsedCount > 5000) {
    h += '<div class="pr-debug-row" style="color:var(--red)">SAFETY WARNING: ' + elapsedCount + ' elapsed (max 5000)</div>';
  }

  if (_pr.qualityReport) {
    h += '<div class="pr-debug-row">Качество данных: ' + esc(_pr.qualityReport.quality) + '</div>';
    h += '<div class="pr-debug-row">Orphan задач: ' + _pr.qualityReport.orphanTasks + '</div>';
  }
  if (_pr.data && _pr.data.elapsed && _pr.data.elapsed.length > 0) {
    var sample = _pr.data.elapsed[0];
    h += '<div class="pr-debug-row">Пример elapsed: ID=' + sample.ID + ' ЗАД=' + sample.TASK_ID + ' СЕК=' + sample.SECONDS + '</div>';
  }
  var devTaskCount = {};
  _pr.rows.forEach(function(r) {
    if (!devTaskCount[r.developerId]) devTaskCount[r.developerId] = {name: r.developerName, count: 0, hours: 0};
    devTaskCount[r.developerId].count++;
    devTaskCount[r.developerId].hours += r.factHours;
  });
  Object.keys(devTaskCount).forEach(function(did) {
    var d = devTaskCount[did];
    h += '<div class="pr-debug-row">' + esc(d.name) + ': ' + d.count + ' задач, ' + d.hours.toFixed(1) + ' ч</div>';
  });
  h += '<div class="pr-debug-row">Доменная модель: v' + (typeof PR_DOMAIN_VERSION !== 'undefined' ? PR_DOMAIN_VERSION : '?') + '</div>';
  h += '<div class="pr-debug-row">Аудит записей: ' + _pr.auditLog.length + '</div>';

  var snapPeriodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
  var store = _prStorage();
  if (store) {
    var snap = store.loadSnapshot(snapPeriodKey);
    if (snap) {
      h += '<div class="pr-debug-row">Snapshot: ' + (snap.snapshotId || 'N/A') + '</div>';
      h += '<div class="pr-debug-row">Snapshot версия: ' + (snap.snapshotVersion || 'N/A') + '</div>';
      h += '<div class="pr-debug-row">Snapshot checksum: ' + (snap.checksum || 'N/A') + '</div>';
      h += '<div class="pr-debug-row">Snapshot immutable: ' + (snap._immutable ? 'YES' : 'NO') + '</div>';
      if (typeof verifySnapshotIntegrity === 'function') {
        var integrity = verifySnapshotIntegrity(snap);
        h += '<div class="pr-debug-row">Snapshot целостность: ' + (integrity.valid ? 'OK' : 'НАРУШЕНА') + '</div>';
      }
    } else {
      h += '<div class="pr-debug-row">Snapshot: не создан</div>';
    }
  }

  h += '</div>';
  return h;
}

/* ═══════════════════════════════════════════════════════════════
   МОДАЛКА АДМИНКА
   ═══════════════════════════════════════════════════════════════ */
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
  /* Invalidate data cache for new period */
  if (typeof PayrollCache !== 'undefined') {
    PayrollCache.invalidate('data:*');
  }
  invalidateProjectionCache();
  _prLoadData();
}

function _prOnFilterChange() {
  var devSel = document.getElementById('prFilterDev');
  var projSel = document.getElementById('prFilterProj');
  if (devSel) _pr.filters.developer = devSel.value;
  if (projSel) _pr.filters.project = projSel.value;
  _prSaveFilters(_pr.filters);
  _prScheduleRender();
}

function _prToggleStatusFilter(status) {
  if (_pr.filters.status === status) {
    _pr.filters.status = '';
  } else {
    _pr.filters.status = status;
  }
  _prSaveFilters(_pr.filters);
  _prScheduleRender();
}

function _prOnEdit(input) {
  var idx = parseInt(input.getAttribute('data-idx'));
  var field = input.getAttribute('data-field');
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;

  if (typeof isPeriodSnapshotImmutable === 'function' &&
      isPeriodSnapshotImmutable(_pr.periodStatus)) {
    var row = filtered[idx];
    if (row) input.value = row[field] ? row[field].toFixed(1) : '0.0';
    return;
  }

  var row = filtered[idx];
  var realIdx = _pr.rows.indexOf(row);
  if (realIdx < 0) return;

  var result = updateReviewField(_pr.rows[realIdx], field, input.value, _pr.periodStatus);
  if (result.error) {
    console.warn('Update blocked:', result.error);
    return;
  }

  _pr.rows[realIdx] = result.review;

  if (result.audit) {
    _pr.auditLog.push(result.audit);
    var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    _prAppendAuditLog(periodKey, result.audit);
  }

  _pr.dirty = true;
  _pr.projection = typeof buildMonthlyProjectionCached === 'function' ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function' ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  _prScheduleRender();
}

function _prCycleStatus(idx) {
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;

  if (typeof isPeriodSnapshotImmutable === 'function' &&
      isPeriodSnapshotImmutable(_pr.periodStatus)) {
    return;
  }

  var row = filtered[idx];
  var realIdx = _pr.rows.indexOf(row);
  if (realIdx < 0) return;

  var currentStatus = _pr.rows[realIdx].reviewStatus;
  var statusFlow = ['pending', 'approved', 'disputed', 'excluded'];
  var currentIdx = statusFlow.indexOf(currentStatus);
  var nextStatus = statusFlow[(currentIdx + 1) % statusFlow.length];

  var result = transitionReviewStatus(_pr.rows[realIdx], nextStatus, _pr.periodStatus);
  if (result.error) {
    console.warn('Status transition blocked:', result.error);
    return;
  }

  _pr.rows[realIdx] = result.review;

  if (result.audit) {
    _pr.auditLog.push(result.audit);
    var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    _prAppendAuditLog(periodKey, result.audit);
  }

  _pr.dirty = true;
  _pr.projection = typeof buildMonthlyProjectionCached === 'function' ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function' ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  _prScheduleRender();
}

function _prSort(field) {
  if (_pr.sortField === field) {
    _pr.sortDir = -_pr.sortDir;
  } else {
    _pr.sortField = field;
    _pr.sortDir = 1;
  }
  _pr.rows = sortReviews(_pr.rows, field, _pr.sortDir);
  _prScheduleRender();
}

function _prSortInd(field) {
  if (_pr.sortField !== field) return '';
  return _pr.sortDir > 0 ? ' &#9650;' : ' &#9660;';
}

function _prSaveAll() {
  var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);

  if (typeof isPeriodSnapshotImmutable === 'function' &&
      isPeriodSnapshotImmutable(_pr.periodStatus)) {
    alert('Невозможно сохранить: период в статусе "' +
      (typeof PR_PERIOD_STATUS_LABELS !== 'undefined' ? PR_PERIOD_STATUS_LABELS[_pr.periodStatus] : _pr.periodStatus) +
      '". Разблокируйте период для редактирования.');
    return;
  }

  var savedReviews = _prLoadReviews(prCurrentPeriod.year, prCurrentPeriod.month);
  if (savedReviews && typeof savedReviews === 'object') {
    var currentSerialized = serializeReviews(_pr.rows);
    var conflictFound = false;
    Object.keys(currentSerialized).forEach(function(key) {
      if (savedReviews[key] && currentSerialized[key].version && savedReviews[key].version) {
        if (savedReviews[key].version > currentSerialized[key].version) {
          conflictFound = true;
        }
      }
    });
    if (conflictFound) {
      if (!confirm('Обнаружен конфликт версий! Данные были изменены в другой вкладке. Перезаписать?')) {
        return;
      }
    }
  }

  var reviews = serializeReviews(_pr.rows);
  var saveResult = _prSaveReviews(prCurrentPeriod.year, prCurrentPeriod.month, reviews);
  if (!saveResult) return;

  _prSavePeriodState(periodKey, {
    status: _pr.periodStatus,
    snapshotId: null,
    updatedAt: Date.now()
  });

  _pr.dirty = false;
  _prScheduleRender();
}

function _prApproveAll() {
  if (!_pr.rows.length) return;

  if (typeof isPeriodSnapshotImmutable === 'function' &&
      isPeriodSnapshotImmutable(_pr.periodStatus)) {
    alert('Невозможно изменить: период находится в статусе "' +
      (typeof PR_PERIOD_STATUS_LABELS !== 'undefined' ? PR_PERIOD_STATUS_LABELS[_pr.periodStatus] : _pr.periodStatus) +
      '". Сначала верните период в редактируемое состояние.');
    return;
  }

  if (!confirm('Подтвердить все ожидающие задачи?')) return;

  var result = approveAllPending(_pr.rows, _pr.periodStatus);
  _pr.rows = result.reviews;

  if (result.auditEntries.length > 0) {
    var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    _prAppendAuditLog(periodKey, result.auditEntries);
  }

  if (typeof createPeriodSnapshot === 'function') {
    var snapPeriodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    var snapshot = createPeriodSnapshot(snapPeriodKey, _pr.rows);
    var store = _prStorage();
    if (store) {
      var saveResult = store.saveSnapshot(snapPeriodKey, snapshot);
      if (saveResult && !saveResult.success) {
        console.warn('Snapshot save blocked:', saveResult.error);
      }
    }
  }

  _pr.dirty = true;
  _pr.projection = typeof buildMonthlyProjectionCached === 'function' ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function' ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  /* Stage 12: Invalidate data cache on review approve */
  if (typeof PayrollCache !== 'undefined') {
    var pk = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    PayrollCache.invalidate('data:' + pk);
  }
  _prScheduleRender();
}

function _prExport() {
  if (!_pr.rows.length) return;
  _prSaveAll();
  /* Stage 12: Invalidate cache on export */
  if (typeof PayrollCache !== 'undefined') {
    var pk = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    PayrollCache.invalidate('data:' + pk);
  }

  if (typeof createPayrollExportDTO === 'function' && typeof serializeDTOToAggregatedCSV === 'function') {
    var dto = createPayrollExportDTO(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
    if (!dto.aggregated.length) {
      alert('Нет данных для экспорта');
      return;
    }
    var csv = serializeDTOToAggregatedCSV(dto);
    var filename = 'зарплата_' + prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0') + '.csv';
    downloadCSV(csv, filename);
  } else if (typeof prExportCSV === 'function') {
    prExportCSV(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
  }
}

function _prExportDetailed() {
  if (!_pr.rows.length) return;
  _prSaveAll();

  if (typeof createPayrollExportDTO === 'function' && typeof serializeDTOToDetailedCSV === 'function') {
    var dto = createPayrollExportDTO(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
    if (!dto.detailed.length) {
      alert('Нет данных для экспорта');
      return;
    }
    var csv = serializeDTOToDetailedCSV(dto);
    var filename = 'зарплата_детально_' + prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0') + '.csv';
    downloadCSV(csv, filename);
  } else if (typeof prExportDetailedCSV === 'function') {
    prExportDetailedCSV(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
  }
}

/* ─── Админка ─── */
function _prOpenAdmin() {
  _pr.modalOpen = true;
  _prScheduleRender();
}

function _prCloseAdmin(e) {
  if (e && e.target && !e.target.classList.contains('pr-modal-overlay')) return;
  _pr.modalOpen = false;
  _prScheduleRender();
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

  if (auditEntries.length > 0) {
    var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    _prAppendAuditLog(periodKey, auditEntries);
  }

  _pr.modalOpen = false;
  _prLoadData();
}

/* ═══════════════════════════════════════════════════════════════
   ПОМОЩНИКИ
   ═══════════════════════════════════════════════════════════════ */
function _prGetFilteredRows() {
  return filterReviews(_pr.rows, _pr.filters);
}

function _prStatusLabel(status) {
  if (typeof PR_REVIEW_STATUS_LABELS !== 'undefined') {
    return PR_REVIEW_STATUS_LABELS[status] || status;
  }
  return status;
}

function _prFmtMoney(n) {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  return n.toLocaleString('ru-RU');
}

function _prProjStat(val, lbl, color) {
  return '<div class="pr-proj-stat"><div class="pr-proj-stat-val" style="color:' + (color || 'var(--text)') + '">' + val + '</div><div class="pr-proj-stat-lbl">' + lbl + '</div></div>';
}

/* ═══════════════════════════════════════════════════════════════
   v5.0: SOFT REFRESH (for stale-while-revalidate)
   ═══════════════════════════════════════════════════════════════ */
function _prSoftRefresh(freshData) {
  if (!freshData || _pr.loading) return;
  _pr.data = freshData;
  _pr._taskDateCache = {};
  var year = prCurrentPeriod.year;
  var month = prCurrentPeriod.month;
  var periodKey = prGetPeriodKey(year, month);
  var savedReviews = _prLoadReviews(year, month);
  if (typeof buildNormalizedModel === 'function') {
    var model = buildNormalizedModel({
      periodKey: periodKey,
      periodStatus: _pr.periodStatus,
      rawData: freshData,
      savedReviews: savedReviews,
      rateProvider: _prRateProvider()
    });
    _pr.rows = model.rows;
  }
  _pr.projection = typeof buildMonthlyProjectionCached === 'function'
    ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function'
    ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  _prScheduleRender();
  console.log('PR: soft refresh applied from background revalidation');
}

/* ═══════════════════════════════════════════════════════════════
   v5.0: PERFORMANCE DIAGNOSTICS
   window.__PAYROLL_PERF()
   ═══════════════════════════════════════════════════════════════ */
window.__PAYROLL_PERF = function() {
  var p = _pr._perf;
  var loadMs = p.loadEnd > 0 ? (p.loadEnd - p.loadStart) : 0;
  var normMs = p.normEnd > 0 ? (p.normEnd - p.normStart) : 0;
  var renderMs = p.renderEnd > 0 ? (p.renderEnd - p.renderStart) : 0;
  var result = {
    version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'unknown',
    pipeline: 'elapsed-first v5.0',
    timing: {
      loadData: loadMs + 'ms',
      normalization: normMs + 'ms',
      render: renderMs + 'ms',
      total: (loadMs + normMs + renderMs) + 'ms'
    },
    data: {
      elapsedRecords: (_pr.data && _pr.data.elapsed) ? _pr.data.elapsed.length : 0,
      reviewRows: _pr.rows.length,
      developers: typeof DEVELOPERS !== 'undefined' ? Object.keys(DEVELOPERS).length : 0,
      projects: typeof PROJECTS !== 'undefined' ? Object.keys(PROJECTS).length : 0,
      taskDateCacheSize: Object.keys(_pr._taskDateCache).length
    },
    cache: typeof PayrollCache !== 'undefined' ? PayrollCache.stats() : 'PayrollCache not loaded',
    safety: {
      maxTasks: 300,
      maxElapsed: 5000,
      maxConcurrent: 3,
      rowsExceeded: _pr.rows.length > 300,
      elapsedExceeded: ((_pr.data && _pr.data.elapsed) ? _pr.data.elapsed.length : 0) > 5000
    },
    ui: {
      viewMode: _pr.viewMode,
      densityMode: _pr.densityMode,
      expandedCards: Object.keys(_pr.expandedCards).length,
      dirty: _pr.dirty,
      loading: _pr.loading,
      period: prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0'),
      periodStatus: _pr.periodStatus,
      modelSource: _pr.modelSource
    }
  };
  console.log('=== PAYROLL PERFORMANCE REPORT ===');
  console.log('Version:', result.version);
  console.log('Pipeline:', result.pipeline);
  console.log('Timing:', result.timing);
  console.log('Data:', result.data);
  console.log('Cache:', result.cache);
  console.log('Safety:', result.safety);
  console.log('UI:', result.ui);
  return result;
};
