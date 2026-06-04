/* ═══════════════════════════════════════════════════════════════
   pr-header.js — HeaderService

   Шапка дашборда: рендер заголовка, переключатели режимов
   (вид, плотность, роль), выбор периода, кнопки действий.

   Владеет state: viewMode, densityMode, roleMode, _cacheBadge

   Зависимости: _pr (state), APP_VERSION, МЕСЯЦЫ_ПОЛН,
   prCurrentPeriod, prGetPeriodKey, ACTIVE_DEV_IDS, DEVELOPERS,
   PR_PERIOD_STATUS_LABELS, _prSaveViewMode, _prSaveDensity,
   _prSaveRoleMode, _prScheduleRender, _prRenderAll, _prLoadData,
   invalidateProjectionCache, PayrollCache, _prOpenAdmin,
   _prExport, _prExportDetailed, _prApproveAll
   ═══════════════════════════════════════════════════════════════ */

var PR_HEADER_VERSION = '1.0.0';

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

/* ─── Role mode persistence (v5.1) ─── */
function _prLoadRoleMode() {
  try {
    var v = localStorage.getItem('pr_role_mode');
    if (v === 'dev' || v === 'fin' || v === 'audit') return v;
  } catch(e) {}
  return 'dev';
}

function _prSaveRoleMode(mode) {
  try { localStorage.setItem('pr_role_mode', mode); } catch(e) {}
}

function _prSetRoleMode(mode) {
  _pr.roleMode = mode;
  _prSaveRoleMode(mode);
  _prScheduleRender();
}

/* ═══════════════════════════════════════════════════════════════
   ШАПКА
   ═══════════════════════════════════════════════════════════════ */
function _prRenderHeader() {
  var modeBadge = '<span class="pr-badge pr-badge-live">ЖИВОЙ</span>';

  var devCount = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS.length : Object.keys(DEVELOPERS).length;
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

  /* Phase 3: Cache badge */
  if (_pr._cacheBadge === 'cache') {
    h += '<span class="pr-badge pr-badge-cache">кэш</span>';
  } else if (_pr._cacheBadge === 'refreshing') {
    h += '<span class="pr-badge pr-badge-refreshing">обновление...</span>';
  }

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

  /* Phase 5: Role mode toggle */
  h += '<div class="pr-role-toggle">';
  h += '<button class="pr-role-btn' + (_pr.roleMode === 'dev' ? ' active' : '') + '" onclick="_prSetRoleMode(\'dev\')" title="Режим разработчика: часы, оплата, загрузка">Разраб</button>';
  h += '<button class="pr-role-btn' + (_pr.roleMode === 'fin' ? ' active' : '') + '" onclick="_prSetRoleMode(\'fin\')" title="Финансовый режим: маржа, оплата клиента, cut">Фин.</button>';
  h += '<button class="pr-role-btn' + (_pr.roleMode === 'audit' ? ' active' : '') + '" onclick="_prSetRoleMode(\'audit\')" title="Режим аудита: снимок, источник, версия, контрольная сумма">Аудит</button>';
  h += '</div>';

  /* Density toggle */
  h += '<div class="pr-density-toggle">';
  h += '<button class="pr-density-btn' + (_pr.densityMode === 'compact' ? ' active' : '') + '" onclick="_prSetDensity(\'compact\')">Компактно</button>';
  h += '<button class="pr-density-btn' + (_pr.densityMode === 'comfortable' ? ' active' : '') + '" onclick="_prSetDensity(\'comfortable\')">Плотно</button>';
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

/* ─── Period change handler ─── */
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
