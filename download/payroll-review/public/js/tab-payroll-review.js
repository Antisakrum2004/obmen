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
  roleMode: 'finance',           /* 'dev' | 'finance' | 'audit' */
  expandedCards: {},              /* devId -> true if expanded */
  _renderScheduled: false,
  _cacheBadge: null,              /* 'cached' | 'stale' | null — shows cache origin */
  /* v5.0: performance tracking */
  _perf: { loadStart: 0, loadEnd: 0, renderStart: 0, renderEnd: 0, normStart: 0, normEnd: 0, apiCalls: 0, cacheHits: 0, projectionRebuilds: 0, timelineDomCount: 0 },
  _taskDateCache: {},             /* taskId -> dateStr cache for timeline */
  adminSaveMsg: null,            /* legacy, kept for compat */
  adminSaveTime: null,           /* legacy, kept for compat */
  adminChangedDevs: {},          /* devId -> true, for green highlighting */
  /* v8.1: new admin state */
  adminSubModal: {open: false, devId: ''},  /* sub-modal state for dev settings */
  _adminScrollTop: 0             /* preserved scroll position for admin modal */
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

/* ─── Role mode persistence (dev/finance/audit) ─── */
function _prLoadRoleMode() {
  try {
    var v = localStorage.getItem('pr_role_mode');
    if (v === 'dev' || v === 'finance' || v === 'audit') return v;
  } catch(e) {}
  return 'finance';
}

function _prSaveRoleMode(mode) {
  try { localStorage.setItem('pr_role_mode', mode); } catch(e) {}
}

/* Уничтожение — full memory cleanup */
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
  /* Full cleanup: clear all state references to free memory */
  _pr.container = null;
  _pr.rows = [];
  _pr.projection = [];
  _pr.totals = null;
  _pr.data = null;
  _pr.dirty = false;
  _pr.auditLog = [];
  _pr.qualityReport = null;
  _pr.expandedCards = {};
  _pr._taskDateCache = {};
  _pr._cacheBadge = null;
  _pr._renderScheduled = false;
  /* Clear stale cache entries on destroy */
  if (typeof PayrollCache !== 'undefined') {
    PayrollCache.clearExpired();
  }
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
    _pr.roleMode = _prLoadRoleMode();

    _pr.styleEl = document.createElement('style');
    _pr.styleEl.textContent = PR_CSS;
    document.head.appendChild(_pr.styleEl);

    _pr.filters = _prLoadFilters();

    /* Try to show cached data immediately, load in background */
    _prLoadData({ silent: true });

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
function _prLoadData(opts) {
  var silent = (opts && opts.silent);
  _pr.loading = true;
  _pr._perf.loadStart = Date.now();
  _prLoadSteps = []; /* Reset step log */

  /* Don't show full-page loading screen — just a subtle indicator */
  if (!silent) {
    /* Only show loading spinner if no data rendered yet */
    if (!_pr.rows || !_pr.rows.length) {
      _prRenderLoading();
    }
  }

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
    var devCount = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS.length : Object.keys(DEVELOPERS).length;
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
    _pr._perf.projectionRebuilds++;
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

    _prScheduleRender();
  }).catch(function(e) {
    console.error('Ошибка загрузки', e);
    _pr.loading = false;
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

/* ─── Soft refresh: update UI with fresh data without full reload ─── */
function _prSoftRefresh(freshData) {
  if (!freshData || _pr.loading) return;
  console.log('_prSoftRefresh: applying fresh data from background refresh');
  _pr.data = freshData;
  _pr._taskDateCache = {};

  var savedReviews = _prLoadReviews(prCurrentPeriod.year, prCurrentPeriod.month);
  if (typeof buildNormalizedModel === 'function') {
    var model = buildNormalizedModel({
      periodKey: prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month),
      periodStatus: _pr.periodStatus,
      rawData: freshData,
      savedReviews: savedReviews,
      rateProvider: _prRateProvider()
    });
    _pr.rows = model.rows;
  } else {
    var result = buildReviewRows(freshData, savedReviews, _prRateProvider());
    _pr.rows = result.rows;
  }

  if (typeof invalidateProjectionCache === 'function') invalidateProjectionCache();
  _pr.projection = typeof buildMonthlyProjectionCached === 'function'
    ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function'
    ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  _prEnsureAllDevsInProjection();

  _pr._cacheBadge = null; /* data is now fresh */
  _prScheduleRender();
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
    getClientRate: function(devId) { return prGetClientRate(devId); },
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

  /* Preserve admin modal scroll position across re-renders */
  var _adminScrollEl = document.querySelector('.pr-modal-body');
  if (_adminScrollEl) {
    _pr._adminScrollTop = _adminScrollEl.scrollTop;
  }

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

  /* Restore admin modal scroll position after DOM is painted */
  if (_pr._adminScrollTop > 0) {
    var savedTop = _pr._adminScrollTop;
    /* Double RAF to ensure layout is complete before restoring scroll */
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        var el = document.querySelector('.pr-modal-body');
        if (el) el.scrollTop = savedTop;
      });
    });
  }

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

  var cacheBadge = '';
  if (_pr._cacheBadge === 'cached') cacheBadge = ' <span style="font-size:9px;color:var(--green);font-family:var(--mono)">(кэш)</span>';
  else if (_pr._cacheBadge === 'stale') cacheBadge = ' <span style="font-size:9px;color:var(--yellow);font-family:var(--mono)">(обновление...)</span>';

  var devCount = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS.length : Object.keys(DEVELOPERS).length;
  var taskCount = _pr.rows.length;

  var psLabel = typeof PR_PERIOD_STATUS_LABELS !== 'undefined'
    ? (PR_PERIOD_STATUS_LABELS[_pr.periodStatus] || _pr.periodStatus)
    : _pr.periodStatus;

  var h = '<div class="pr-header">';
  h += '<div class="pr-title">Зарплатный обзор ' + modeBadge + cacheBadge + ' <span class="pr-version">v' + APP_VERSION + '</span></div>';
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

  /* Role mode toggle: DEV | FINANCE | AUDIT */
  h += '<div class="pr-view-toggle">';
  h += '<button class="pr-view-btn' + (_pr.roleMode === 'dev' ? ' active' : '') + '" onclick="_prSetRoleMode(\'dev\')" title="Часы, выплаты, загрузка">Разраб</button>';
  h += '<button class="pr-view-btn' + (_pr.roleMode === 'finance' ? ' active' : '') + '" onclick="_prSetRoleMode(\'finance\')" title="Маржа, выручка, рентабельность">Фин.</button>';
  h += '<button class="pr-view-btn' + (_pr.roleMode === 'audit' ? ' active' : '') + '" onclick="_prSetRoleMode(\'audit\')" title="Снимки, версия, аудит">Аудит</button>';
  h += '</div>';

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
  h += '<button class="pr-btn pr-btn-ghost" onclick="_prUndoApproveAll()" title="Вернуть все подтверждённые в ожидание">&#8634; Отменить подтв.</button>';

  h += '</div></div>';
  return h;
}

/* ─── View/Density/Role handlers ─── */
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

function _prSetRoleMode(mode) {
  _pr.roleMode = mode;
  _prSaveRoleMode(mode);
  _prRenderAll();
}

/* ═══════════════════════════════════════════════════════════════
   KPI КАРТОЧКИ (top overview)
   ═══════════════════════════════════════════════════════════════ */
function _prRenderKPIs() {
  if (!_pr.totals) return '';
  var t = _pr.totals;
  var marginColor = t.totalMarginPct >= 30 ? 'var(--green)' : t.totalMarginPct >= 10 ? 'var(--yellow)' : t.totalMarginPct >= 0 ? 'var(--accent)' : 'var(--red)';
  var marginSign = t.totalMarginPct >= 0 ? '+' : '';
  var role = _pr.roleMode;
  var h = '<div class="pr-kpi-grid">';
  /* DEV view: hours, payout, workload */
  if (role === 'dev') {
    h += _prKpiCard('Факт часы', t.totalFactHours.toFixed(1), 'var(--accent)', t.totalTasks + ' задач');
    h += _prKpiCard('К выплате', _prFmtMoney(t.totalPayrollAmount), 'var(--orange)', t.pendingTasks + ' ожидает');
    h += _prKpiCard('Базовых', _prFmtMoney(t.totalBase || 0), 'var(--green)', (t.totalFine || 0) > 0 ? _prFmtMoney(t.totalFine) + ' штраф' : 'без штрафов');
  /* FINANCE view: margin, client revenue, payout */
  } else if (role === 'finance') {
    h += _prKpiCard('Опл. клиента', t.totalBillable.toFixed(1) + 'ч', 'var(--cyan)', _prFmtMoney(t.totalClientRevenue || 0) + ' р');
    h += _prKpiCard('К выплате', _prFmtMoney(t.totalPayrollAmount), 'var(--orange)', t.pendingTasks + ' ожидает');
    h += _prKpiCard('Маржа', marginSign + t.totalMarginPct + '%', marginColor, _prFmtMoney(t.totalMargin || 0) + ' р');
    h += _prKpiCard('Факт часы', t.totalFactHours.toFixed(1), 'var(--accent)', t.totalTasks + ' задач');
  /* AUDIT view: snapshot, version, data source */
  } else {
    h += _prKpiCard('Факт часы', t.totalFactHours.toFixed(1), 'var(--accent)', t.totalTasks + ' задач');
    h += _prKpiCard('К выплате', _prFmtMoney(t.totalPayrollAmount), 'var(--orange)', _pr.modelSource);
    h += _prKpiCard('Маржа', marginSign + t.totalMarginPct + '%', marginColor, _prFmtMoney(t.totalMargin || 0) + ' р');
    h += _prKpiCard('Снимок', _pr.snapshotId ? _pr.snapshotId.substring(0, 8) : 'нет', 'var(--text3)', _pr.snapshotChecksum ? _pr.snapshotChecksum.substring(0, 8) : '—');
  }
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
  var role = _pr.roleMode;
  var h = '<div class="pr-heatmap">';
  h += '<div class="pr-heatmap-title">Команда</div>';
  h += '<div class="pr-heatmap-row">';

  _pr.projection.forEach(function(dev) {
    var risks = _prCalcDevRisks(dev);
    var riskLevel = risks.length > 0 ? (risks.indexOf('ПЕРЕРАБОТКА') >= 0 || risks.indexOf('УБЫТОК') >= 0 ? 'red' : 'yellow') : 'green';
    var marginPct = _prCalcMarginPct(dev);
    var marginCls = marginPct >= 0 ? 'pos' : 'neg';
    var marginTxt = marginPct >= 0 ? ('+' + marginPct + '%') : (marginPct + '%');
    var firstName = getFirstName(dev.developerName);
    /* Hover tooltip with extra details */
    var cutHours = safeRound(dev.totalFactHours - dev.totalBillable, 1);
    var tipParts = [dev.totalFactHours.toFixed(0) + 'ч факт', _prFmtMoney(dev.totalAmount) + ' к выплате'];
    if (role !== 'dev') tipParts.push('Маржа ' + marginTxt);
    if (cutHours > 0) tipParts.push('Срез ' + cutHours.toFixed(1) + 'ч');
    if (risks.length > 0) tipParts.push(risks.join(', '));
    var tip = esc(tipParts.join(' | '));

    h += '<div class="pr-heatmap-chip" onclick="_prScrollToDev(\'' + esc(dev.developerId) + '\')" title="' + tip + '">';
    h += '<span class="pr-heatmap-dot ' + riskLevel + '"></span>';
    h += '<span class="pr-heatmap-name">' + esc(firstName) + '</span>';
    h += '<span class="pr-heatmap-hours">' + dev.totalFactHours.toFixed(0) + 'ч</span>';
    /* Margin only shown in finance/audit mode */
    if (role !== 'dev') {
      h += '<span class="pr-heatmap-margin ' + marginCls + '">' + marginTxt + '</span>';
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
  /* Include ALL active developers in filter, even those with 0 tasks */
  var filterIds = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS : DEV_IDS;
  filterIds.forEach(function(id) { devSet[String(id)] = prGetDevName(String(id)); });
  /* Also add any developers from rows that might not be in the registry */
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

/* ─── Ensure only ACTIVE developers appear in projection ─── */
function _prEnsureAllDevsInProjection() {
  if (typeof DEVELOPERS === 'undefined') return;

  /* Step 1: Remove phantom developers (not in DEVELOPERS or excluded) */
  var activeSet = {};
  var activeIds = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS : DEV_IDS;
  activeIds.forEach(function(id) { activeSet[String(id)] = true; });
  _pr.projection = _pr.projection.filter(function(dev) {
    return activeSet[String(dev.developerId)];
  });

  /* Step 2: Add missing active developers with 0 hours
     Even devs with 0 tasks can have base/fine — their totalAmount includes those */
  var existingDevs = {};
  _pr.projection.forEach(function(dev) {
    existingDevs[String(dev.developerId)] = true;
  });
  var missingCount = 0;
  activeIds.forEach(function(id) {
    var devId = String(id);
    if (!existingDevs[devId]) {
      /* This developer has no elapsed in the current period — add empty entry */
      var baseSalary = (typeof prGetBase === 'function') ? prGetBase(devId) : 0;
      var fine = (typeof prGetFine === 'function') ? prGetFine(devId) : 0;
      _pr.projection.push({
        developerId: devId,
        developerName: prGetDevName(devId),
        totalFactHours: 0,
        totalBillable: 0,
        totalPayroll: 0,
        totalBase: baseSalary,
        totalFine: fine,
        totalAmount: baseSalary - fine,
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
      /* Devs with base/fine but no tasks always show */
      if (dev.taskCount === 0 && dev.totalAmount > 0) return true;
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

  /* v8.0: Предеин (rate=0) показывает базовую выплату вместо ставки */
  var rateDisplay = rate > 0 ? (rate + ' р/ч') : ('БАЗОВАЯ ' + _prFmtMoney(prGetBase(dev.developerId)));

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
  h += '<div class="pr-card-role">' + rateDisplay + '</div>';
  h += '</div>';
  h += '<span class="pr-card-status ' + cardStatus.cls + '">' + cardStatus.label + '</span>';
  h += '</div>';

  /* ─── PRIMARY KPI (L1) — только общая сумма и часы ─── */
  var taskSum = dev.totalAmount - (dev.totalBase || 0) + (dev.totalFine || 0);
  var baseVal = dev.totalBase || 0;
  var fineVal = dev.totalFine || 0;

  h += '<div class="pr-card-kpi">';
  h += '<div class="pr-kpi-primary">';
  h += '<div class="pr-kpi-money">' + _prFmtMoney(dev.totalAmount) + '</div>';
  h += '<div class="pr-kpi-money-label">К выплате</div>';
  h += '</div>';
  h += '<div class="pr-kpi-primary">';
  h += '<div class="pr-kpi-hours">' + dev.totalFactHours.toFixed(1) + '</div>';
  h += '<div class="pr-kpi-hours-label">Факт часов</div>';
  h += '</div>';
  h += '</div>';

  /* ─── SECONDARY METRICS (L2) — role-dependent ─── */
  h += '<div class="pr-card-secondary">';
  if (_pr.roleMode === 'dev') {
    /* DEV: hours + workload only */
    h += '<div class="pr-sec-item"><span class="pr-sec-label">Опл. клиента</span><span class="pr-sec-val billable">' + dev.totalBillable.toFixed(1) + 'ч</span></div>';
    h += '<div class="pr-sec-divider"></div>';
    h += '<div class="pr-sec-item"><span class="pr-sec-label">Загрузка</span><span class="pr-sec-val">' + Math.round(dev.totalFactHours / 160 * 100) + '%</span></div>';
  } else {
    /* FINANCE/AUDIT: billable, cut, margin */
    h += '<div class="pr-sec-item primary-sec"><span class="pr-sec-label">Опл. клиента</span><span class="pr-sec-val billable">' + dev.totalBillable.toFixed(1) + 'ч</span></div>';
    h += '<div class="pr-sec-divider"></div>';
    if (cutHours > 0) {
      h += '<div class="pr-sec-item primary-sec"><span class="pr-sec-label">Срез</span><span class="pr-sec-val cut">-' + cutHours.toFixed(1) + 'ч</span></div>';
    } else {
      h += '<div class="pr-sec-item primary-sec"><span class="pr-sec-label">Срез</span><span class="pr-sec-val" style="color:var(--text3)">0ч</span></div>';
    }
    h += '<div class="pr-sec-divider"></div>';
    var marginCls = marginPct >= 0 ? 'margin-pos' : 'margin-neg';
    h += '<div class="pr-sec-item"><span class="pr-sec-label">Маржа</span><span class="pr-sec-val ' + marginCls + '">' + (marginPct >= 0 ? '+' : '') + marginPct + '%</span></div>';
  }
  h += '</div>';

  /* ─── PROGRESS BARS (L3) — role-dependent ─── */
  h += '<div class="pr-card-progress">';

  /* Workload: always shown */
  var workloadPct = Math.min(safeRound(dev.totalFactHours / 160 * 100, 0), 100);
  var workloadColor = workloadPct > 100 ? 'red' : workloadPct > 80 ? 'green' : workloadPct > 50 ? 'yellow' : 'red';
  h += '<div class="pr-progress-row">';
  h += '<span class="pr-progress-label">Загрузка</span>';
  h += '<div class="pr-progress-track"><div class="pr-progress-fill ' + workloadColor + '" style="width:' + workloadPct + '%"></div></div>';
  h += '<span class="pr-progress-val">' + dev.totalFactHours.toFixed(0) + '/160ч</span>';
  h += '</div>';

  /* Billable + Margin only in finance/audit mode */
  if (_pr.roleMode !== 'dev') {
    var billPct = dev.totalFactHours > 0 ? Math.min(safeRound(dev.totalBillable / dev.totalFactHours * 100, 0), 100) : 0;
    var billColor = billPct >= 95 ? 'green' : billPct >= 80 ? 'yellow' : 'red';
    h += '<div class="pr-progress-row">';
    h += '<span class="pr-progress-label">Опл. клиента</span>';
    h += '<div class="pr-progress-track"><div class="pr-progress-fill ' + billColor + '" style="width:' + billPct + '%"></div></div>';
    h += '<span class="pr-progress-val">' + billPct + '%</span>';
    h += '</div>';

    var marginBarPct = Math.min(Math.abs(marginPct), 100);
    var marginBarColor = marginPct >= 30 ? 'green' : marginPct >= 10 ? 'yellow' : marginPct >= 0 ? 'accent' : 'red';
    h += '<div class="pr-progress-row">';
    h += '<span class="pr-progress-label">Маржа</span>';
    h += '<div class="pr-progress-track"><div class="pr-progress-fill ' + marginBarColor + '" style="width:' + marginBarPct + '%"></div></div>';
    h += '<span class="pr-progress-val">' + (marginPct >= 0 ? '+' : '') + marginPct + '%</span>';
    h += '</div>';
  }

  h += '</div>';

  /* ─── RISK BADGES ─── */
  if (risks.length > 0) {
    h += '<div class="pr-card-risks">';
    var _riskCssMap = {'ПЕРЕРАБОТКА':'risk-overburn','МАЛО НАГРУЗКИ':'risk-lowload','СРЕЗ':'risk-cuthours','НЕТ СТАВКИ':'risk-norate','НЕ ПРОВЕРЕН':'risk-unreviewed','УБЫТОК':'risk-negmargin'};
    risks.forEach(function(risk) {
      var riskCls2 = _riskCssMap[risk] || ('risk-' + risk.toLowerCase().replace(/[\s]+/g, ''));
      h += '<span class="pr-risk-pill ' + riskCls2 + '">' + risk + '</span>';
    });
    h += '</div>';
  }

  h += '</div>'; /* end .pr-card-inner */

  /* ─── BREAKDOWN: по задачам + базовая − штраф (внизу карточки) ─── */
  if (baseVal > 0 || fineVal > 0) {
    h += '<div class="pr-card-breakdown">';
    h += '<span class="pr-bd-item">' + _prFmtMoney(taskSum) + ' по задачам</span>';
    if (baseVal > 0) h += ' <span class="pr-bd-sep">+</span> <span class="pr-bd-item pr-bd-green">' + _prFmtMoney(baseVal) + ' баз.</span>';
    if (fineVal > 0) {
      var fineComment = prGetFineComment(dev.developerId);
      h += ' <span class="pr-bd-sep">−</span> <span class="pr-bd-item pr-bd-red">' + _prFmtMoney(fineVal) + ' штраф' + (fineComment ? ' (' + esc(truncate(fineComment, 20)) + ')' : '') + '</span>';
    }
    h += '</div>';
  }

  /* ─── FOOTER METRICS ─── */
  h += '<div class="pr-card-footer">';
  h += '<div class="pr-footer-metric"><div class="pr-footer-val">' + dev.taskCount + '</div><div class="pr-footer-label">Задач</div></div>';
  h += '<div class="pr-footer-metric"><div class="pr-footer-val">' + avgPerTask.toFixed(1) + 'ч</div><div class="pr-footer-label">Ср/зад</div></div>';
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

  if (dev.totalFactHours > dev.totalBillable * 1.3) risks.push('ПЕРЕРАБОТКА');
  /* Skip LOW LOAD for devs with no tasks but base salary */
  if (dev.totalFactHours < 80 && dev.taskCount > 0) risks.push('МАЛО НАГРУЗКИ');
  if (cutHours > 5) risks.push('СРЕЗ');
  if (!rate || rate <= 0) risks.push('НЕТ СТАВКИ');
  if (dev.pendingCount > 0 && dev.approvedCount === 0) risks.push('НЕ ПРОВЕРЕН');
  if (marginPct < 0) risks.push('УБЫТОК');

  return risks;
}

function _prCalcMarginPct(dev) {
  /* v8.0: Margin рассчитывается из клиентских ставок ПО ПРОЕКТАМ,
     а не из единой ставки разработчика.
     Клиентская выручка = сумма по всем проектам: billable_hours_in_project × project_client_rate
     Если у проекта нет клиентской ставки — используется ставка разработчика */
  var clientRevenue = 0;
  if (dev.projects && typeof prGetProjectClientRate === 'function') {
    Object.keys(dev.projects).forEach(function(pid) {
      var projInfo = dev.projects[pid];
      if (!projInfo || !projInfo.billableHours) return;
      var projClientRate = prGetProjectClientRate(pid);
      if (projClientRate <= 0) projClientRate = (typeof prGetClientRate === 'function') ? prGetClientRate(dev.developerId) : prGetRate(dev.developerId);
      clientRevenue += projInfo.billableHours * projClientRate;
    });
  } else {
    /* Fallback: единая ставка разработчика */
    var clientRate = (typeof prGetClientRate === 'function') ? prGetClientRate(dev.developerId) : prGetRate(dev.developerId);
    clientRevenue = dev.totalBillable * clientRate;
  }
  var payrollCost = dev.totalAmount;
  if (clientRevenue <= 0) return 0;
  return safeRound((clientRevenue - payrollCost) / clientRevenue * 100, 0);
}

function _prCalcDevStatus(dev) {
  if (dev.taskCount === 0) {
    /* Dev with base/fine but no tasks */
    return dev.totalAmount > 0 ? {label: 'БАЗОВАЯ', cls: 's-approved'} : {label: 'DRAFT', cls: 's-draft'};
  }
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

  /* v8.2: Simple timeline item — just view, no sliders */
  var h = '<div class="pr-tl-item">';
  h += '<span class="pr-tl-hours">' + r.factHours.toFixed(1) + 'ч</span>';
  h += '<span class="pr-tl-task" title="' + esc(r.taskTitle) + '">' + esc(truncate(r.taskTitle, 30)) + '</span>';
  if (isCut) {
    h += '<span class="pr-tl-cut">-' + cutHours.toFixed(1) + 'ч</span>';
  }
  h += '<span class="pr-tl-status ' + r.reviewStatus + '" onclick="_prCycleStatus(' + realIdx + ')">' + _prStatusLabel(r.reviewStatus) + '</span>';
  h += '</div>';
  return h;
}

/* v8.1: Preset click handler — sets payrollHours based on billableHours * pct/100 */
function _prOnPresetClick(idx, pct) {
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;
  var row = filtered[idx];
  var realIdx = _pr.rows.indexOf(row);
  if (realIdx < 0) return;

  if (typeof isPeriodSnapshotImmutable === 'function' &&
      isPeriodSnapshotImmutable(_pr.periodStatus)) return;

  var newPayrollHours = safeRound(row.billableHours * pct / 100, 1);
  _pr.rows[realIdx].payrollHours = newPayrollHours;
  _pr.rows[realIdx].payrollAmount = Math.round(newPayrollHours * _pr.rows[realIdx].rate);

  _pr.dirty = true;
  _pr.projection = typeof buildMonthlyProjectionCached === 'function' ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function' ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  _prEnsureAllDevsInProjection();
  _prScheduleRender();
}

/* v8.1: Slider change handler — same as preset but with slider value */
function _prOnSliderChange(idx, value) {
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;
  var row = filtered[idx];
  var realIdx = _pr.rows.indexOf(row);
  if (realIdx < 0) return;

  if (typeof isPeriodSnapshotImmutable === 'function' &&
      isPeriodSnapshotImmutable(_pr.periodStatus)) return;

  var pct = parseInt(value) || 0;
  var newPayrollHours = safeRound(row.billableHours * pct / 100, 1);
  _pr.rows[realIdx].payrollHours = newPayrollHours;
  _pr.rows[realIdx].payrollAmount = Math.round(newPayrollHours * _pr.rows[realIdx].rate);

  _pr.dirty = true;
  _pr.projection = typeof buildMonthlyProjectionCached === 'function' ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function' ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  _prEnsureAllDevsInProjection();
  _prScheduleRender();
}

/* v8.3: Billable (Опл. клиента) slider/preset handlers */
function _prOnBillPresetClick(idx, pct) {
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;
  var row = filtered[idx];
  var realIdx = _pr.rows.indexOf(row);
  if (realIdx < 0) return;

  if (typeof isPeriodSnapshotImmutable === 'function' &&
      isPeriodSnapshotImmutable(_pr.periodStatus)) return;

  var newBillable = safeRound(row.factHours * pct / 100, 1);
  _pr.rows[realIdx].billableHours = newBillable;
  /* Recalc payroll based on current payout pct */
  var payoutPct = row.billableHours > 0 ? Math.round(row.payrollHours / row.billableHours * 100) : 100;
  _pr.rows[realIdx].payrollHours = safeRound(newBillable * payoutPct / 100, 1);
  _pr.rows[realIdx].payrollAmount = Math.round(_pr.rows[realIdx].payrollHours * _pr.rows[realIdx].rate);

  _pr.dirty = true;
  _pr.projection = typeof buildMonthlyProjectionCached === 'function' ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function' ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  _prEnsureAllDevsInProjection();
  _prScheduleRender();
}

function _prOnBillSliderChange(idx, value) {
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;
  var row = filtered[idx];
  var realIdx = _pr.rows.indexOf(row);
  if (realIdx < 0) return;

  if (typeof isPeriodSnapshotImmutable === 'function' &&
      isPeriodSnapshotImmutable(_pr.periodStatus)) return;

  var pct = parseInt(value) || 0;
  var newBillable = safeRound(row.factHours * pct / 100, 1);
  _pr.rows[realIdx].billableHours = newBillable;
  /* Recalc payroll based on current payout pct */
  var payoutPct = row.billableHours > 0 ? Math.round(row.payrollHours / row.billableHours * 100) : 100;
  _pr.rows[realIdx].payrollHours = safeRound(newBillable * payoutPct / 100, 1);
  _pr.rows[realIdx].payrollAmount = Math.round(_pr.rows[realIdx].payrollHours * _pr.rows[realIdx].rate);

  _pr.dirty = true;
  _pr.projection = typeof buildMonthlyProjectionCached === 'function' ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function' ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  _prEnsureAllDevsInProjection();
  _prScheduleRender();
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
  var marginPct = t.totalMarginPct || 0;
  var marginCls = marginPct >= 0 ? 'margin-pos' : 'margin-neg';

  var h = '<div class="pr-fin-footer">';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Факт часы</div><div class="pr-fin-val fact">' + t.totalFactHours.toFixed(1) + '</div></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Опл. клиента</div><div class="pr-fin-val billable">' + t.totalBillable.toFixed(1) + 'ч</div></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">От клиента</div><div class="pr-fin-val" style="color:var(--cyan)">' + _prFmtMoney(t.totalClientRevenue || 0) + ' р</div></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">К выплате</div><div class="pr-fin-val" style="color:var(--orange)">' + _prFmtMoney(t.totalPayrollAmount) + ' р</div></div>';
  h += '<div class="pr-fin-spacer"></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Маржа</div><div class="pr-fin-val ' + marginCls + '">' + (marginPct >= 0 ? '+' : '') + marginPct + '%  ' + _prFmtMoney(t.totalMargin || 0) + ' р</div></div>';
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
  h += '<th class="c-num">Опл.\u00A0клиента\u00A0%</th>';
  h += '<th class="c-num">Выплата\u00A0%</th>';
  h += '<th class="c-num">К\u00A0выплате\u00A0(ч)</th>';
  h += '<th class="c-num">Ставка\u00A0(р/ч)</th>';
  h += '<th class="c-num" onclick="_prSort(\'payrollAmount\')">Сумма\u00A0(р) ' + _prSortInd('payrollAmount') + '</th>';
  h += '<th>Статус</th>';
  h += '<th>Комментарий</th>';
  h += '</tr></thead><tbody>';

  filtered.forEach(function(r, idx) {
    var rowCls = r.reviewStatus === 'approved' ? ' row-approved' : '';
    rowCls += r.reviewStatus === 'excluded' ? ' row-excluded' : '';

    /* v8.2: Calculate slider pct */
    var sliderPct = r.billableHours > 0 ? Math.round(r.payrollHours / r.billableHours * 100) : 0;
    if (sliderPct < 0) sliderPct = 0;
    if (sliderPct > 100) sliderPct = 100;
    var activePreset = '';
    if (sliderPct === 0) activePreset = '0';
    else if (sliderPct === 50) activePreset = '50';
    else if (sliderPct === 100) activePreset = '100';

    h += '<tr class="' + rowCls.trim() + '">';
    h += '<td><span class="pr-task-link" title="' + esc(r.taskTitle) + '">' + esc(truncate(r.taskTitle, 35)) + '</span></td>';
    h += '<td><span class="pr-proj-tag">' + esc(truncate(r.projectName, 18)) + '</span></td>';

    var firstName = getFirstName(r.developerName);
    h += '<td><span class="pr-dev-name"><span class="pr-dev-av">' + esc(firstName.charAt(0)) + '</span>' + esc(firstName) + '</span></td>';

    h += '<td class="c-num"><span class="pr-readonly">' + r.factHours.toFixed(1) + '</span></td>';

    /* v8.3: Опл. клиента — пресеты 0/50/100% + ползунок от factHours */
    var billPct = r.factHours > 0 ? Math.round(r.billableHours / r.factHours * 100) : 0;
    if (billPct < 0) billPct = 0;
    if (billPct > 100) billPct = 100;
    var billActivePreset = '';
    if (billPct === 0) billActivePreset = '0';
    else if (billPct === 50) billActivePreset = '50';
    else if (billPct === 100) billActivePreset = '100';

    h += '<td class="c-num pr-table-slider-cell"><div class="pr-table-slider">';
    h += '<span class="pr-tl-preset' + (billActivePreset === '0' ? ' active' : '') + '" onclick="_prOnBillPresetClick(' + idx + ',0)">0%</span>';
    h += '<span class="pr-tl-preset' + (billActivePreset === '50' ? ' active' : '') + '" onclick="_prOnBillPresetClick(' + idx + ',50)">50%</span>';
    h += '<input type="range" class="pr-tl-slider" min="0" max="100" step="1" value="' + billPct + '" onchange="_prOnBillSliderChange(' + idx + ',this.value)" oninput="_prOnBillSliderChange(' + idx + ',this.value)">';
    h += '<span class="pr-tl-preset' + (billActivePreset === '100' ? ' active' : '') + '" onclick="_prOnBillPresetClick(' + idx + ',100)">100%</span>';
    h += '<span class="pr-table-slider-val">' + billPct + '%</span>';
    h += '</div></td>';

    /* v8.2: Slider + presets for payout % */
    h += '<td class="c-num pr-table-slider-cell"><div class="pr-table-slider">';
    h += '<span class="pr-tl-preset' + (activePreset === '0' ? ' active' : '') + '" onclick="_prOnPresetClick(' + idx + ',0)">0%</span>';
    h += '<span class="pr-tl-preset' + (activePreset === '50' ? ' active' : '') + '" onclick="_prOnPresetClick(' + idx + ',50)">50%</span>';
    h += '<input type="range" class="pr-tl-slider" min="0" max="100" step="1" value="' + sliderPct + '" onchange="_prOnSliderChange(' + idx + ',this.value)" oninput="_prOnSliderChange(' + idx + ',this.value)">';
    h += '<span class="pr-tl-preset' + (activePreset === '100' ? ' active' : '') + '" onclick="_prOnPresetClick(' + idx + ',100)">100%</span>';
    h += '<span class="pr-table-slider-val">' + sliderPct + '%</span>';
    h += '</div></td>';

    h += '<td class="c-num"><span class="pr-readonly">' + r.payrollHours.toFixed(1) + '</span></td>';

    h += '<td class="c-num"><span class="pr-readonly pr-rate-display">' + r.rate + '</span></td>';
    h += '<td class="c-num"><span class="pr-readonly pr-amount">' + _prFmtMoney(r.payrollAmount) + '</span></td>';

    h += '<td><span class="pr-status pr-status-' + r.reviewStatus + '" data-idx="' + idx + '" onclick="_prCycleStatus(' + idx + ')">' + _prStatusLabel(r.reviewStatus) + '</span></td>';

    h += '<td><input class="pr-comment-input" type="text" value="' + esc(r.managerComment) + '" data-idx="' + idx + '" data-field="managerComment" onchange="_prOnEdit(this)" placeholder="..."></td>';

    h += '</tr>';
  });

  h += '</tbody><tfoot><tr>';
  h += '<td colspan="3">ИТОГО (' + filtered.length + ')</td>';
  h += '<td class="c-num">' + sumReviewField(filtered, 'factHours').toFixed(1) + '</td>';
  h += '<td class="c-num">' + sumReviewField(filtered, 'billableHours').toFixed(1) + 'ч</td>';
  h += '<td></td>';
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
  h += '<div class="pr-debug-title">ДИАГНОСТИКА (' + (PR_MOCK_MODE ? 'МОК' : 'ЖИВОЙ') + ')</div>';
  h += '<div class="pr-debug-row">Версия: ' + APP_VERSION + ' | Pipeline: elapsed-first v5.1</div>';

  /* ── Performance metrics ── */
  var loadMs = _pr._perf.loadEnd > 0 ? (_pr._perf.loadEnd - _pr._perf.loadStart) : 0;
  var normMs = _pr._perf.normEnd > 0 ? (_pr._perf.normEnd - _pr._perf.normStart) : 0;
  var renderMs = _pr._perf.renderEnd > 0 ? (_pr._perf.renderEnd - _pr._perf.renderStart) : 0;
  var totalMs = loadMs + normMs + renderMs;
  h += '<div class="pr-debug-row" style="color:var(--cyan)">Load: ' + loadMs + 'ms | Norm: ' + normMs + 'ms | Render: ' + renderMs + 'ms | Total: ' + totalMs + 'ms</div>';

  /* Cache stats */
  if (typeof PayrollCache !== 'undefined') {
    var cs = PayrollCache.stats();
    h += '<div class="pr-debug-row">Cache: hits=' + cs.hits + ' misses=' + cs.misses + ' stale=' + cs.staleHits + ' rate=' + cs.hitRate + ' | keys=' + cs.memoryKeys + '</div>';
  }

  /* Timeline DOM count */
  var tlCount = document.querySelectorAll('.pr-tl-day').length;
  _pr._perf.timelineDomCount = tlCount;

  h += '<div class="pr-debug-row">Elapsed: ' + (_pr.data && _pr.data.elapsed ? _pr.data.elapsed.length : 0) + ' | Rows: ' + _pr.rows.length + ' | Timeline DOM: ' + tlCount + '</div>';
  h += '<div class="pr-debug-row">Projection rebuilds: ' + _pr._perf.projectionRebuilds + ' | Task date cache: ' + Object.keys(_pr._taskDateCache).length + '</div>';
  h += '<div class="pr-debug-row">Режим: ' + _pr.roleMode + '/' + _pr.viewMode + '/' + _pr.densityMode + ' | Период: ' + prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0') + '</div>';
  h += '<div class="pr-debug-row">Источник: ' + esc(_pr.modelSource || 'live') + ' | Статус: ' + esc(_pr.periodStatus) + ' | Кэш: ' + (_pr._cacheBadge || 'live') + '</div>';

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
   МОДАЛКА АДМИНКА v2 — Разделение: Разработчики / Клиенты
   ═══════════════════════════════════════════════════════════════ */
var _prAdminTab = 'devs'; /* 'devs' | 'clients' */

function _prRenderAdminModal() {
  if (!_pr.modalOpen) return '';
  var h = '<div class="pr-modal-overlay" onclick="_prCloseAdmin(event)">';
  h += '<div class="pr-modal" onclick="event.stopPropagation()" style="max-width:1200px">';

  h += '<div class="pr-modal-header">';
  h += '<span class="pr-modal-title">&#9881; Админка</span>';
  h += '<button class="pr-modal-close" onclick="_prCloseAdmin()">&times;</button>';
  h += '</div>';

  h += '<div class="pr-modal-body">';

  /* ── Табы: Разработчики / Клиенты ── */
  var activeDevs = _prAdminTab === 'devs';
  var activeClients = _prAdminTab === 'clients';
  h += '<div style="display:flex;gap:4px;margin-bottom:16px">';
  h += '<button class="pr-btn ' + (activeDevs ? 'pr-btn-primary' : 'pr-btn-ghost') + '" onclick="_prAdminTab=\'devs\';_prScheduleRender()" style="font-size:12px;padding:6px 16px">Разработчики</button>';
  h += '<button class="pr-btn ' + (activeClients ? 'pr-btn-primary' : 'pr-btn-ghost') + '" onclick="_prAdminTab=\'clients\';_prScheduleRender()" style="font-size:12px;padding:6px 16px">Клиенты (проекты)</button>';
  h += '</div>';

  if (activeDevs) {
    h += _prRenderAdminDevsSection();
  } else {
    h += _prRenderAdminClientsSection();
  }

  h += '</div>'; /* end pr-modal-body */

  h += '</div></div>';

  /* ── Sub-modal overlay (on top of admin) ── */
  if (_pr.adminSubModal.open) {
    h += _prRenderSubModal();
  }

  return h;
}

/* ─── Секция: Разработчики (CLEAN INPUT LAYOUT v8.4) ─── */
function _prRenderAdminDevsSection() {
  var h = '';
  var activeIds = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS : DEV_IDS;

  h += '<div style="font-family:var(--mono);font-size:10px;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid var(--border)">Активные разработчики</div>';

  activeIds.forEach(function(id) {
    var sid = String(id);
    var name = prGetDevName(sid);
    var rate = prGetRate(sid);
    var base = prGetBase(sid);
    var fines = prGetFines(sid);
    var firstName = getFirstName(name);

    h += '<div class="pr-admin-card" id="pr-admin-card-' + sid + '">';

    /* ── Header: name + settings chip ── */
    h += '<div class="pr-admin-card-top">';
    h += '<div class="pr-card-avatar" style="width:28px;height:28px;font-size:11px;border-radius:6px">' + esc(firstName.charAt(0)) + '</div>';
    h += '<div class="pr-admin-card-name">' + esc(name) + '</div>';
    h += '<span class="pr-admin-chip" onclick="_prOpenSubModal(\'' + sid + '\')">&#9881;</span>';
    h += '</div>';

    /* ── Ставка ── */
    h += '<div class="pr-admin-row">';
    h += '<span class="pr-admin-row-label">Ставка</span>';
    h += '<input class="pr-admin-row-input" type="number" id="pr-rate-' + sid + '" value="' + rate + '">';
    h += '<span class="pr-admin-row-unit">р/ч</span>';
    h += '<button type="button" class="pr-admin-confirm" id="pr-rate-btn-' + sid + '" onclick="_prSaveField(\'rate\',\'' + sid + '\')">&#10003;</button>';
    h += '</div>';

    /* ── Фикс сумма ── */
    h += '<div class="pr-admin-row">';
    h += '<span class="pr-admin-row-label">Фикс</span>';
    h += '<input class="pr-admin-row-input" type="number" id="pr-base-' + sid + '" value="' + base + '">';
    h += '<span class="pr-admin-row-unit">р</span>';
    h += '<button type="button" class="pr-admin-confirm" id="pr-base-btn-' + sid + '" onclick="_prSaveField(\'base\',\'' + sid + '\')">&#10003;</button>';
    h += '</div>';

    /* ── Штрафы ── */
    h += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.04)">';
    h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
    h += '<span class="pr-admin-row-label" style="color:var(--red)">&#9888; Штрафы</span>';
    h += '<button type="button" class="pr-admin-fine-add" onclick="_prAddFine(\'' + sid + '\')">+</button>';
    h += '</div>';
    fines.forEach(function(fine, fIdx) {
      h += '<div class="pr-admin-row">';
      h += '<input class="pr-admin-row-input pr-admin-fine-amount" type="number" id="pr-fine-' + sid + '-' + fIdx + '" value="' + (fine.amount || 0) + '" style="max-width:90px;color:#ff8a94">';
      h += '<input class="pr-admin-row-input" type="text" id="pr-finecomment-' + sid + '-' + fIdx + '" value="' + esc(fine.comment || '') + '" placeholder="Комментарий" style="max-width:200px">';
      h += '<button type="button" class="pr-admin-confirm" onclick="_prSaveFine(\'' + sid + '\',' + fIdx + ')">&#10003;</button>';
      h += '<button type="button" class="pr-admin-fine-remove" onclick="_prRemoveFine(\'' + sid + '\',' + fIdx + ')">&#10005;</button>';
      h += '</div>';
    });
    h += '</div>';

    h += '</div>'; /* end pr-admin-card */
  });

  /* ── Исключённые разработчики ── */
  var excludedIds = (typeof EXCLUDED_DEV_IDS !== 'undefined') ? Object.keys(EXCLUDED_DEV_IDS) : [];
  if (excludedIds.length > 0) {
    h += '<div style="margin-top:12px">';
    h += '<div style="font-family:var(--mono);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border)">Исключённые (не в расчётах)</div>';
    excludedIds.forEach(function(id) {
      var sid = String(id);
      var name = DEVELOPERS[sid] || ('ID ' + sid);
      h += '<div style="opacity:0.5;padding:4px 8px;font-family:var(--mono);font-size:11px;color:var(--text3)">' + esc(name) + '</div>';
    });
    h += '</div>';
  }

  return h;
}

/* ─── Секция: Клиенты (CLEAN INPUT LAYOUT v8.4) ─── */
function _prRenderAdminClientsSection() {
  var h = '';
  h += '<div style="margin-bottom:8px;font-family:var(--mono);font-size:10px;color:var(--text3);letter-spacing:.04em">';
  h += 'Ставка клиента — сколько клиент платит за час. По умолчанию 2500 р/ч.';
  h += '</div>';

  /* Список проектов: сначала оплачиваемые, затем неоплачиваемые */
  var projectIds = Object.keys(PROJECTS).sort(function(a, b) {
    var aUnpaid = !!UNPAID_GROUPS[a];
    var bUnpaid = !!UNPAID_GROUPS[b];
    if (aUnpaid && !bUnpaid) return 1;
    if (!aUnpaid && bUnpaid) return -1;
    return (PROJECTS[a] || '').localeCompare(PROJECTS[b] || '');
  });

  projectIds.forEach(function(pid) {
    var pname = PROJECTS[pid] || ('Проект ' + pid);
    var isUnpaid = !!UNPAID_GROUPS[pid];
    var clientRate = prGetProjectClientRate(pid);
    var fixSumma = prGetProjectFixSumma(pid);

    h += '<div class="pr-admin-card">';

    /* ── Header ── */
    h += '<div class="pr-admin-card-top">';
    h += '<div class="pr-admin-card-name">' + esc(pname) + '</div>';
    if (isUnpaid) {
      h += '<span style="font-family:var(--mono);font-size:9px;color:var(--yellow);background:rgba(245,166,35,.1);padding:2px 8px;border-radius:4px">НЕ ОПЛ.</span>';
    } else {
      h += '<span style="font-family:var(--mono);font-size:9px;color:var(--green);background:rgba(34,212,126,.1);padding:2px 8px;border-radius:4px">ОПЛ.</span>';
    }
    h += '</div>';

    /* ── Ставка клиента ── */
    if (isUnpaid) {
      h += '<div class="pr-admin-row" style="opacity:0.4">';
      h += '<span class="pr-admin-row-label">Ставка</span>';
      h += '<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">—</span>';
      h += '</div>';
    } else {
      h += '<div class="pr-admin-row">';
      h += '<span class="pr-admin-row-label">Ставка</span>';
      h += '<input class="pr-admin-row-input" type="number" id="pr-clientrate-' + pid + '" value="' + clientRate + '">';
      h += '<span class="pr-admin-row-unit">р/ч</span>';
      h += '<button type="button" class="pr-admin-confirm" onclick="_prSaveField(\'clientRate\',\'' + pid + '\')">&#10003;</button>';
      h += '</div>';
    }

    /* ── Фикс сумма ── */
    h += '<div class="pr-admin-row">';
    h += '<span class="pr-admin-row-label">Фикс</span>';
    h += '<input class="pr-admin-row-input" type="number" id="pr-fixsumma-' + pid + '" value="' + fixSumma + '">';
    h += '<span class="pr-admin-row-unit">р</span>';
    h += '<button type="button" class="pr-admin-confirm" onclick="_prSaveField(\'fixSumma\',\'' + pid + '\')">&#10003;</button>';
    h += '</div>';

    h += '</div>'; /* end pr-admin-card */
  });

  return h;
}

/* ─── Sub-modal: Настройки разработчика (v8.1) ─── */
function _prRenderSubModal() {
  var devId = _pr.adminSubModal.devId;
  var name = prGetDevName(devId);
  var fullname = prGetFullname(devId);
  var inn = prGetInn(devId);
  var contract = prGetContract(devId);
  var contractDate = prGetContractDate(devId);
  var selfEmployed = prGetSelfEmployed(devId);
  var bank = prGetBank(devId);
  var notes = prGetNotes(devId);

  var h = '<div class="pr-sub-modal-overlay" onclick="_prCloseSubModal(event)">';
  h += '<div class="pr-sub-modal" onclick="event.stopPropagation()">';

  h += '<div class="pr-sub-modal-header">';
  h += '<span class="pr-sub-modal-title">\uD83D\uDCCB ' + esc(name) + '</span>';
  h += '<button class="pr-modal-close" onclick="_prCloseSubModal()">&times;</button>';
  h += '</div>';

  h += '<div class="pr-sub-modal-body">';
  h += '<div class="pr-sub-modal-field"><label>ФИО полностью</label><input class="pr-admin-input" type="text" value="' + esc(fullname) + '" data-devid="' + devId + '" data-field="fullname" data-section="dev"></div>';
  h += '<div class="pr-sub-modal-field"><label>ИНН</label><input class="pr-admin-input" type="text" value="' + esc(inn) + '" data-devid="' + devId + '" data-field="inn" data-section="dev" placeholder="ИНН"></div>';
  h += '<div class="pr-sub-modal-field"><label>Номер договора</label><input class="pr-admin-input" type="text" value="' + esc(contract) + '" data-devid="' + devId + '" data-field="contract" data-section="dev" placeholder="Договор №"></div>';
  h += '<div class="pr-sub-modal-field"><label>Дата договора</label><input class="pr-admin-input" type="text" value="' + esc(contractDate) + '" data-devid="' + devId + '" data-field="contractDate" data-section="dev" placeholder="ДД.ММ.ГГГГ"></div>';
  h += '<div class="pr-sub-modal-field"><label>Самозанятый</label><select class="pr-admin-input" data-devid="' + devId + '" data-field="selfEmployed" data-section="dev">';
  h += '<option value="Нет"' + (selfEmployed === 'Нет' ? ' selected' : '') + '>Нет</option>';
  h += '<option value="Да"' + (selfEmployed === 'Да' ? ' selected' : '') + '>Да</option>';
  h += '<option value="ИП"' + (selfEmployed === 'ИП' ? ' selected' : '') + '>ИП</option>';
  h += '</select></div>';
  h += '<div class="pr-sub-modal-field"><label>Банк / Реквизиты</label><input class="pr-admin-input" type="text" value="' + esc(bank) + '" data-devid="' + devId + '" data-field="bank" data-section="dev" placeholder="Банк, р/с"></div>';
  h += '<div class="pr-sub-modal-field"><label>Примечание</label><input class="pr-admin-input" type="text" value="' + esc(notes) + '" data-devid="' + devId + '" data-field="notes" data-section="dev" placeholder="Заметки"></div>';
  h += '</div>';

  h += '<div class="pr-sub-modal-footer">';
  h += '<button class="pr-btn pr-btn-ghost" onclick="_prCloseSubModal()">Отмена</button>';
  h += '<button class="pr-btn pr-btn-primary" onclick="_prSaveSubModal()">Сохранить</button>';
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
  _prEnsureAllDevsInProjection();
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
  _prEnsureAllDevsInProjection();
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
  _prEnsureAllDevsInProjection();
  /* Stage 12: Invalidate data cache on review approve */
  if (typeof PayrollCache !== 'undefined') {
    var pk = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    PayrollCache.invalidate('data:' + pk);
  }
  _prScheduleRender();
}

function _prUndoApproveAll() {
  if (!_pr.rows.length) return;

  if (typeof isPeriodSnapshotImmutable === 'function' &&
      isPeriodSnapshotImmutable(_pr.periodStatus)) {
    alert('Невозможно изменить: период находится в статусе "' +
      (typeof PR_PERIOD_STATUS_LABELS !== 'undefined' ? PR_PERIOD_STATUS_LABELS[_pr.periodStatus] : _pr.periodStatus) +
      '". Сначала верните период в редактируемое состояние.');
    return;
  }

  /* Count approved tasks */
  var approvedCount = 0;
  _pr.rows.forEach(function(r) {
    if (r.reviewStatus === PR_REVIEW_STATUS.APPROVED) approvedCount++;
  });
  if (!approvedCount) {
    alert('Нет подтверждённых задач для отмены.');
    return;
  }

  if (!confirm('Вернуть ' + approvedCount + ' подтверждённых задач в статус "Ожидает"?')) return;

  var auditEntries = [];
  _pr.rows.forEach(function(r) {
    if (r.reviewStatus === PR_REVIEW_STATUS.APPROVED) {
      var result = transitionReviewStatus(r, PR_REVIEW_STATUS.PENDING, _pr.periodStatus);
      if (result.review) {
        /* Copy updated fields back */
        r.reviewStatus = result.review.reviewStatus;
        r.updatedAt = result.review.updatedAt;
        r.version = result.review.version;
        r.revisionId = result.review.revisionId;
      }
      if (result.audit) auditEntries.push(result.audit);
    }
  });

  if (auditEntries.length > 0) {
    var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    _prAppendAuditLog(periodKey, auditEntries);
  }

  _pr.dirty = true;
  _pr.projection = typeof buildMonthlyProjectionCached === 'function' ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function' ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  _prEnsureAllDevsInProjection();
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

/* ─── Админка (v8.1) ─── */
function _prOpenAdmin() {
  _pr.modalOpen = true;
  _pr.adminSubModal = {open: false, devId: ''};
  _prScheduleRender();
}

function _prCloseAdmin(e) {
  if (e && e.target && !e.target.classList.contains('pr-modal-overlay')) return;
  _pr.modalOpen = false;
  _pr.adminSubModal = {open: false, devId: ''};
  _prScheduleRender();
}

/* ─── v8.1: Sub-modal handlers ─── */
function _prOpenSubModal(devId) {
  _pr.adminSubModal = {open: true, devId: devId};
  _prScheduleRender();
}

function _prCloseSubModal(e) {
  if (e && e.target && !e.target.classList.contains('pr-sub-modal-overlay')) return;
  _pr.adminSubModal = {open: false, devId: ''};
  _prScheduleRender();
}

function _prSaveSubModal() {
  var devId = _pr.adminSubModal.devId;
  var settings = _prLoadDevSettings(devId) || {};
  var inputs = document.querySelectorAll('.pr-sub-modal .pr-admin-input');
  inputs.forEach(function(inp) {
    var field = inp.getAttribute('data-field');
    if (field) settings[field] = inp.value;
  });
  _prSaveDevSettings(devId, settings);
  _pr.adminSubModal = {open: false, devId: ''};
  _pr.adminChangedDevs[devId] = true;
  _prScheduleRender();
}

/* ─── v8.5: Fines add/remove — partial re-render of admin card only ─── */
function _prAddFine(devId) {
  var settings = _prLoadDevSettings(devId) || {};
  if (!settings.fines) settings.fines = [];
  settings.fines.push({amount: 0, comment: ''});
  var totalFine = 0;
  settings.fines.forEach(function(f) { totalFine += (f.amount || 0); });
  settings.fine = totalFine;
  _prSaveDevSettings(devId, settings);
  /* Partial re-render: only update this dev's card in admin */
  _prRenderAdminCardPartial(devId);
}

function _prRemoveFine(devId, fIdx) {
  var settings = _prLoadDevSettings(devId) || {};
  if (!settings.fines || fIdx >= settings.fines.length) return;
  settings.fines.splice(fIdx, 1);
  var totalFine = 0;
  settings.fines.forEach(function(f) { totalFine += (f.amount || 0); });
  settings.fine = totalFine;
  settings.fineComment = settings.fines.length > 0 ? settings.fines[0].comment : '';
  _prSaveDevSettings(devId, settings);
  /* Partial re-render: only update this dev's card in admin */
  _prRenderAdminCardPartial(devId);
}

/* ─── Partial re-render of a single admin card (preserves scroll) ─── */
function _prRenderAdminCardPartial(devId) {
  var cardEl = document.getElementById('pr-admin-card-' + devId);
  if (!cardEl) {
    /* Fallback: full re-render with scroll preservation */
    var scrollEl = document.querySelector('.pr-modal-body');
    if (scrollEl) _pr._adminScrollTop = scrollEl.scrollTop;
    _prScheduleRender();
    return;
  }

  /* Re-render just this one card */
  var sid = String(devId);
  var name = prGetDevName(sid);
  var rate = prGetRate(sid);
  var base = prGetBase(sid);
  var fines = prGetFines(sid);
  var firstName = getFirstName(name);

  var h = '';
  h += '<div class="pr-admin-card-top">';
  h += '<div class="pr-card-avatar" style="width:28px;height:28px;font-size:11px;border-radius:6px">' + esc(firstName.charAt(0)) + '</div>';
  h += '<div class="pr-admin-card-name">' + esc(name) + '</div>';
  h += '<span class="pr-admin-chip" onclick="_prOpenSubModal(\'' + sid + '\')">&#9881;</span>';
  h += '</div>';

  h += '<div class="pr-admin-row">';
  h += '<span class="pr-admin-row-label">Ставка</span>';
  h += '<input class="pr-admin-row-input" type="number" id="pr-rate-' + sid + '" value="' + rate + '">';
  h += '<span class="pr-admin-row-unit">р/ч</span>';
  h += '<button type="button" class="pr-admin-confirm" id="pr-rate-btn-' + sid + '" onclick="_prSaveField(\'rate\',\'' + sid + '\')">&#10003;</button>';
  h += '</div>';

  h += '<div class="pr-admin-row">';
  h += '<span class="pr-admin-row-label">Фикс</span>';
  h += '<input class="pr-admin-row-input" type="number" id="pr-base-' + sid + '" value="' + base + '">';
  h += '<span class="pr-admin-row-unit">р</span>';
  h += '<button type="button" class="pr-admin-confirm" id="pr-base-btn-' + sid + '" onclick="_prSaveField(\'base\',\'' + sid + '\')">&#10003;</button>';
  h += '</div>';

  h += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.04)">';
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
  h += '<span class="pr-admin-row-label" style="color:var(--red)">&#9888; Штрафы</span>';
  h += '<button type="button" class="pr-admin-fine-add" onclick="_prAddFine(\'' + sid + '\')">+</button>';
  h += '</div>';
  fines.forEach(function(fine, fIdx) {
    h += '<div class="pr-admin-row">';
    h += '<input class="pr-admin-row-input pr-admin-fine-amount" type="number" id="pr-fine-' + sid + '-' + fIdx + '" value="' + (fine.amount || 0) + '" style="max-width:90px;color:#ff8a94">';
    h += '<input class="pr-admin-row-input" type="text" id="pr-finecomment-' + sid + '-' + fIdx + '" value="' + esc(fine.comment || '') + '" placeholder="Комментарий" style="max-width:200px">';
    h += '<button type="button" class="pr-admin-confirm" onclick="_prSaveFine(\'' + sid + '\',' + fIdx + ')">&#10003;</button>';
    h += '<button type="button" class="pr-admin-fine-remove" onclick="_prRemoveFine(\'' + sid + '\',' + fIdx + ')">&#10005;</button>';
    h += '</div>';
  });
  h += '</div>';

  cardEl.innerHTML = h;
}

/* ─── v8.5: Admin — save individual field (NO re-render, scroll preserved) ─── */
function _prSaveField(field, id) {
  var val;

  if (field === 'rate') {
    var inp = document.getElementById('pr-rate-' + id);
    if (!inp) return;
    val = parseInt(inp.value) || 0;
    var settings = _prLoadDevSettings(id) || {};
    settings.rate = val;
    _prSaveDevSettings(id, settings);
    /* Also update runtime */
    if (typeof DEV_RATES !== 'undefined') DEV_RATES[String(id)] = val;
    /* Flash the confirm button green */
    var btn = document.getElementById('pr-rate-btn-' + id);
    if (btn) { btn.classList.add('saved'); setTimeout(function() { btn.classList.remove('saved'); }, 1200); }
    /* Update rows with new rate */
    _pr.rows.forEach(function(r) {
      if (String(r.developerId) === String(id)) {
        r.rate = val;
        r.payrollAmount = Math.round(r.payrollHours * r.rate);
      }
    });
    if (typeof invalidateProjectionCache === 'function') invalidateProjectionCache();
    _pr.projection = typeof buildMonthlyProjectionCached === 'function'
      ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
    _pr.totals = typeof buildPeriodTotalsCached === 'function'
      ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
    _prEnsureAllDevsInProjection();

  } else if (field === 'base') {
    var inp = document.getElementById('pr-base-' + id);
    if (!inp) return;
    val = parseInt(inp.value) || 0;
    var settings = _prLoadDevSettings(id) || {};
    settings.base = val;
    _prSaveDevSettings(id, settings);
    if (typeof DEV_BASE !== 'undefined') DEV_BASE[String(id)] = val;
    var btn = document.getElementById('pr-base-btn-' + id);
    if (btn) { btn.classList.add('saved'); setTimeout(function() { btn.classList.remove('saved'); }, 1200); }
    if (typeof invalidateProjectionCache === 'function') invalidateProjectionCache();
    _pr.projection = typeof buildMonthlyProjectionCached === 'function'
      ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
    _pr.totals = typeof buildPeriodTotalsCached === 'function'
      ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
    _prEnsureAllDevsInProjection();

  } else if (field === 'clientRate') {
    var inp = document.getElementById('pr-clientrate-' + id);
    if (!inp) return;
    val = parseInt(inp.value) || 0;
    if (typeof PayrollStorage !== 'undefined' && PayrollStorage.saveProjectSettings) {
      var existing = PayrollStorage.loadProjectSettings(String(id)) || {};
      existing.clientRate = val;
      PayrollStorage.saveProjectSettings(String(id), existing);
    }
    if (typeof PROJECT_CLIENT_RATES !== 'undefined') PROJECT_CLIENT_RATES[String(id)] = val;
    /* Flash confirm button */
    var btn = document.getElementById('pr-clientrate-btn-' + id);
    if (btn) { btn.classList.add('saved'); setTimeout(function() { btn.classList.remove('saved'); }, 1200); }

  } else if (field === 'fixSumma') {
    var inp = document.getElementById('pr-fixsumma-' + id);
    if (!inp) return;
    val = parseInt(inp.value) || 0;
    if (typeof PayrollStorage !== 'undefined' && PayrollStorage.saveProjectSettings) {
      var existing = PayrollStorage.loadProjectSettings(String(id)) || {};
      existing.fixSumma = val;
      PayrollStorage.saveProjectSettings(String(id), existing);
    }
    if (typeof PROJECT_FIX_SUMMA !== 'undefined') PROJECT_FIX_SUMMA[String(id)] = val;
    /* Flash confirm button */
    var btn = document.getElementById('pr-fixsumma-btn-' + id);
    if (btn) { btn.classList.add('saved'); setTimeout(function() { btn.classList.remove('saved'); }, 1200); }
  }

  /* No full re-render — just update projection in memory.
     Data is saved, button flashes green, scroll stays in place. */
}

/* ─── v8.4: Save individual fine ─── */
function _prSaveFine(devId, fIdx) {
  var amountInp = document.getElementById('pr-fine-' + devId + '-' + fIdx);
  var commentInp = document.getElementById('pr-finecomment-' + devId + '-' + fIdx);
  if (!amountInp) return;

  var amount = parseInt(amountInp.value) || 0;
  var comment = commentInp ? commentInp.value : '';

  var settings = _prLoadDevSettings(devId) || {};
  var fines = settings.fines || [];
  if (fIdx < fines.length) {
    fines[fIdx] = {amount: amount, comment: comment};
  } else {
    fines.push({amount: amount, comment: comment});
  }
  /* Recalc total fine */
  var totalFine = 0;
  fines.forEach(function(f) { totalFine += (f.amount || 0); });
  settings.fines = fines;
  settings.fine = totalFine;
  settings.fineComment = fines.length > 0 ? fines[0].comment : '';
  _prSaveDevSettings(devId, settings);

  /* Flash green on the confirm button */
  var row = amountInp.closest('.pr-admin-row');
  if (row) {
    var btn = row.querySelector('.pr-admin-confirm');
    if (btn) { btn.classList.add('saved'); setTimeout(function() { btn.classList.remove('saved'); }, 1200); }
  }

  /* Update projection */
  if (typeof invalidateProjectionCache === 'function') invalidateProjectionCache();
  _pr.projection = typeof buildMonthlyProjectionCached === 'function'
    ? buildMonthlyProjectionCached(_pr.rows) : buildMonthlyProjection(_pr.rows);
  _pr.totals = typeof buildPeriodTotalsCached === 'function'
    ? buildPeriodTotalsCached(_pr.rows) : buildPeriodTotals(_pr.rows);
  _prEnsureAllDevsInProjection();
  /* No full re-render — data saved, button flashes, scroll stays */
}

/* Apply new rate/base to all saved reviews for specified developers */
function _prApplyRateToSavedReviews(devIds) {
  var year = prCurrentPeriod.year;
  var month = prCurrentPeriod.month;
  var savedReviews = _prLoadReviews(year, month);
  if (!savedReviews || typeof savedReviews !== 'object') return;

  var devSet = {};
  devIds.forEach(function(id) { devSet[String(id)] = true; });

  var changed = false;
  Object.keys(savedReviews).forEach(function(reviewKey) {
    var review = savedReviews[reviewKey];
    if (!review || !devSet[String(review.developerId)]) return;
    var newRate = prGetRate(review.developerId);
    if (review.rate !== newRate) {
      review.rate = newRate;
      /* Recalculate payroll amount per task (base is NOT per-task, it's added once in projection) */
      review.payrollAmount = Math.round((review.payrollHours || 0) * newRate);
      changed = true;
    }
  });

  if (changed) {
    _prSaveReviews(year, month, savedReviews);
  }
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
  _prEnsureAllDevsInProjection();
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
