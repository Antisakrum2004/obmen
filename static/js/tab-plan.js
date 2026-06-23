/* ═══════════════════════════════════════════════════════════════
   tab-plan.js — Вкладка ПЛАН (План-факт контроль выработки)
   v4.2.0 — Чипсы разрабов вместо dropdown + info-line
             Убрана вкладка Обзор, тёмные скроллбары
             Простои, Топ-5, Дельта, Экспорт

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
  adminChangedDevs: {},    /* devId -> true for green highlight */
  prevMonthTotals: null,   /* {plan, fact} from previous month for delta */
  topTasksExpanded: false,  /* toggle for top-5 tasks */
  taskDescCache: {}         /* taskId -> {description, deadline, statusText} */
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
      _plan.styleEl.textContent = PLAN_CSS + _PLAN_SCROLLBAR_CSS;
      document.head.appendChild(_plan.styleEl);
    }
    _planLoadOverrides();
    _planLoadComments();
    _planLoadEventLog();
    _planLoadPrevMonth();
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
  return 'pr_plan_cmt_' + prCurrentPeriod.year + '_' + String(prCurrentPeriod.month).padStart(2, '0') + '_' + _plan.selectedDevId;
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
   ФИЧА 8: Дельта с прошлым месяцем — загрузка итогов
   ═══════════════════════════════════════════════════════════════ */
function _planPrevMonthKey() {
  var pm = prCurrentPeriod.month === 1 ? 12 : prCurrentPeriod.month - 1;
  var py = prCurrentPeriod.month === 1 ? prCurrentPeriod.year - 1 : prCurrentPeriod.year;
  return 'pr_plan_totals_' + py + '_' + String(pm).padStart(2, '0');
}

function _planLoadPrevMonth() {
  try {
    var raw = localStorage.getItem(_planPrevMonthKey());
    _plan.prevMonthTotals = raw ? JSON.parse(raw) : null;
  } catch(e) { _plan.prevMonthTotals = null; }
}

function _planSaveTotals(plan, fact) {
  try {
    localStorage.setItem(_planStorageKey().replace('pr_plan_bill_', 'pr_plan_totals_'), JSON.stringify({plan: plan, fact: fact}));
  } catch(e) {}
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
        stageId: meta.stageId || '0',
        factHours: factHours,
        factMinutes: factMinutes,
        billableHours: billableHours,
        comment: e.COMMENT_TEXT || '',
        elapsedEntries: [e]
      });
    }
  });

  /* Calculate fact per day = Σ (billableHours × rate) */
  var totalPlan = 0, totalFact = 0;
  Object.keys(_plan.dailyMap).forEach(function(dateStr) {
    var day = _plan.dailyMap[dateStr];
    var factSum = 0;
    day.tasks.forEach(function(t) {
      factSum += t.billableHours * rate;
    });
    day.fact = Math.round(factSum);
    totalPlan += day.plan;
    totalFact += day.fact;
  });

  /* Save totals for delta feature (фича 8) */
  _planSaveTotals(totalPlan, totalFact);
}

function safeRound(n, d) {
  var f = Math.pow(10, d || 0);
  return Math.round(n * f) / f;
}

/* ═══════════════════════════════════════════════════════════════
   АНАЛИТИЧЕСКИЕ РАСЧЁТЫ (фичи 1, 4, 6, 7)
   ═══════════════════════════════════════════════════════════════ */

/* Фича 1: Burn Rate — прогноз на конец месяца */
function _planCalcBurnRate() {
  var rate = prGetRate(_plan.selectedDevId);
  var now = new Date();
  var dates = Object.keys(_plan.dailyMap).sort();
  var passedWorkDays = 0, passedFactSum = 0;
  var totalWorkDays = 0, remainingWorkDays = 0;
  var todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  dates.forEach(function(dateStr) {
    var day = _plan.dailyMap[dateStr];
    if (day.isWeekend) return;
    totalWorkDays++;
    if (dateStr <= todayStr) {
      passedWorkDays++;
      passedFactSum += day.fact;
    }
  });

  remainingWorkDays = totalWorkDays - passedWorkDays;
  if (passedWorkDays === 0 || remainingWorkDays <= 0) return null;

  var avgDailyFact = passedFactSum / passedWorkDays;
  var projectedTotal = passedFactSum + avgDailyFact * remainingWorkDays;
  var totalPlan = totalWorkDays * 8 * rate;
  var projectedPct = totalPlan > 0 ? Math.round(projectedTotal / totalPlan * 100) : 0;

  return { projectedPct: projectedPct, avgDaily: avgDailyFact, remainingDays: remainingWorkDays, totalPlan: totalPlan, projectedTotal: Math.round(projectedTotal) };
}

/* Фича 4: Подсветка простоев (рабочие дни с 0 списаний) */
function _planIsIdleDay(day) {
  return !day.isWeekend && day.fact === 0 && day.tasks.length === 0;
}

/* Фича 4: Подсветка переработок (факт > 120% плана) */
function _planIsOvertime(day) {
  if (day.isWeekend || day.plan === 0) return false;
  return day.fact > day.plan * 1.2;
}

/* Фича 6: Средний КПД */
function _planCalcEfficiency() {
  var dates = Object.keys(_plan.dailyMap).sort();
  var totalPct = 0, count = 0;
  dates.forEach(function(dateStr) {
    var day = _plan.dailyMap[dateStr];
    if (day.isWeekend || day.plan === 0) return;
    totalPct += day.fact / day.plan;
    count++;
  });
  return count > 0 ? Math.round(totalPct / count * 100) : 0;
}

/* Фича 7: Топ-5 задач месяца */
function _planCalcTopTasks() {
  var taskMap = {};
  var rate = prGetRate(_plan.selectedDevId);
  Object.keys(_plan.dailyMap).forEach(function(dateStr) {
    var day = _plan.dailyMap[dateStr];
    day.tasks.forEach(function(t) {
      var key = t.taskId;
      if (!taskMap[key]) {
        taskMap[key] = { taskId: t.taskId, title: t.title, projectName: t.projectName, totalBillable: 0, totalFact: 0 };
      }
      taskMap[key].totalBillable += t.billableHours;
      taskMap[key].totalFact += t.factHours;
    });
  });
  var arr = Object.keys(taskMap).map(function(k) { return taskMap[k]; });
  arr.sort(function(a, b) { return b.totalBillable - a.totalBillable; });
  return arr.slice(0, 5);
}

/* Фича 3: Распределение по проектам */
function _planCalcProjectDistribution() {
  var projMap = {};
  var rate = prGetRate(_plan.selectedDevId);
  Object.keys(_plan.dailyMap).forEach(function(dateStr) {
    var day = _plan.dailyMap[dateStr];
    day.tasks.forEach(function(t) {
      var pname = t.projectName || 'Без проекта';
      if (!projMap[pname]) projMap[pname] = { hours: 0, amount: 0 };
      projMap[pname].hours += t.billableHours;
      projMap[pname].amount += t.billableHours * rate;
    });
  });
  var arr = Object.keys(projMap).map(function(k) { return { name: k, hours: projMap[k].hours, amount: projMap[k].amount }; });
  arr.sort(function(a, b) { return b.amount - a.amount; });
  return arr;
}

/* Фича 8: Дельта с прошлым месяцем */
function _planCalcDelta(curPlan, curFact) {
  if (!_plan.prevMonthTotals) return null;
  var prevPlan = _plan.prevMonthTotals.plan || 0;
  var prevFact = _plan.prevMonthTotals.fact || 0;
  var planDelta = prevPlan > 0 ? Math.round((curPlan - prevPlan) / prevPlan * 100) : 0;
  var factDelta = prevFact > 0 ? Math.round((curFact - prevFact) / prevFact * 100) : 0;
  return { planDelta: planDelta, factDelta: factDelta };
}

/* ═══════════════════════════════════════════════════════════════
   ТЁМНЫЕ СКРОЛЛБАРЫ (добавляются к PLAN_CSS при инициализации)
   ═══════════════════════════════════════════════════════════════ */
var _PLAN_SCROLLBAR_CSS = '\
.modal-body::-webkit-scrollbar,.pr-modal-body::-webkit-scrollbar,.plan-log-body::-webkit-scrollbar{width:5px}\
.modal-body::-webkit-scrollbar-thumb,.pr-modal-body::-webkit-scrollbar-thumb,.plan-log-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}\
.modal-body::-webkit-scrollbar-track,.pr-modal-body::-webkit-scrollbar-track,.plan-log-body::-webkit-scrollbar-track{background:transparent}\
.modal-body,.pr-modal-body{scrollbar-width:thin;scrollbar-color:var(--border) transparent}\
.plan-log-body{scrollbar-width:thin;scrollbar-color:var(--border) transparent}\
.plan-dev-chips{display:flex;gap:6px;flex-wrap:wrap;padding:8px 0 0}\
.plan-dev-chip{display:inline-flex;align-items:center;padding:4px 12px;border-radius:16px;font-family:var(--mono);font-size:11px;font-weight:500;color:var(--text2);background:var(--bg2);border:1px solid var(--border);cursor:pointer;transition:all .15s;user-select:none;white-space:nowrap}\
.plan-dev-chip:hover{border-color:var(--border2);color:var(--text);transform:translateY(-1px)}\
.plan-dev-chip.active{color:#fff;background:var(--accent);border-color:var(--accent);box-shadow:0 0 8px rgba(79,139,255,.25)}\
';

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
    h += _planRenderAnalytics();
    h += _planRenderTable();
    h += _planRenderTopTasks();
    h += _planRenderEventLog();
  }
  /* Modals rendered outside main flow */
  h += _planRenderTasksModal();
  h += _planRenderTaskDetailModal();
  h += _planRenderAdminModal();
  _plan.container.innerHTML = h;
  _planAttachKeys();
}

/* ─── Header with dev chips ─── */
function _planRenderHeader() {
  var h = '<div class="plan-doc-header">';
  h += '<div class="plan-doc-title">';
  h += 'План-факт контроль';
  h += ' <span class="plan-doc-date">' + (typeof МЕСЯЦЫ_ПОЛН !== 'undefined' ? МЕСЯЦЫ_ПОЛН[prCurrentPeriod.month - 1] + ' ' + prCurrentPeriod.year : '') + '</span>';
  h += '</div>';

  h += '<div class="plan-actions">';

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

  /* Фича 10: Кнопка экспорта сводки */
  h += '<button class="plan-btn plan-btn-ghost" onclick="_planExportSummary()">&#128203; Сводка</button>';
  h += '<button class="plan-btn plan-btn-ghost" onclick="window.TabPlan.refresh()">&#8635; Обновить</button>';
  h += '<button class="plan-btn plan-btn-yellow" onclick="_planOpenAdmin()">&#9881; Админка</button>';
  h += '</div>';

  /* Dev chips */
  h += '<div class="plan-dev-chips">';
  if (typeof ACTIVE_DEV_IDS !== 'undefined') {
    ACTIVE_DEV_IDS.forEach(function(id) {
      var isActive = String(id) === String(_plan.selectedDevId);
      var cls = 'plan-dev-chip' + (isActive ? ' active' : '');
      var fullName = prGetDevName(String(id));
      var shortName = _planShortDevName(fullName);
      h += '<span class="' + cls + '" onclick="_planOnDevChange(' + id + ')" title="' + esc(fullName) + '">' + esc(shortName) + '</span>';
    });
  }
  h += '</div>';

  h += '</div>';
  return h;
}

/* Short name for chips: "Имя Ф." */
function _planShortDevName(fullName) {
  if (!fullName) return '?';
  var parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0] + ' ' + parts[1].charAt(0) + '.';
  return parts[0];
}

/* ─── Summary block (enhanced with Фича 6 КПД + Фича 8 Дельта) ─── */
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

  /* Фича 6: КПД */
  var efficiency = _planCalcEfficiency();
  var effCls = efficiency >= 95 ? 'val-kpd-good' : (efficiency >= 70 ? 'val-kpd-warn' : 'val-kpd-bad');

  /* Фича 8: Дельта */
  var delta = _planCalcDelta(totalPlan, totalFact);

  var h = '<div class="plan-summary">';
  h += '<div class="plan-summary-title">Итого за период</div>';
  h += '<div class="plan-summary-grid">';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">Раб. дней</div><div class="plan-summary-value" style="font-size:18px;color:var(--text2)">' + workDays + '</div></div>';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">План' + (delta ? ' <span class="plan-delta ' + (delta.planDelta >= 0 ? 'pos' : 'neg') + '">' + (delta.planDelta >= 0 ? '&#9650;' : '&#9660;') + Math.abs(delta.planDelta) + '%</span>' : '') + '</div><div class="plan-summary-value val-plan">' + _planFmtMoney(totalPlan) + '</div></div>';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">Факт' + (delta ? ' <span class="plan-delta ' + (delta.factDelta >= 0 ? 'pos' : 'neg') + '">' + (delta.factDelta >= 0 ? '&#9650;' : '&#9660;') + Math.abs(delta.factDelta) + '%</span>' : '') + '</div><div class="plan-summary-value val-fact">' + _planFmtMoney(totalFact) + '</div></div>';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">Разница (' + pct + '%)</div><div class="plan-summary-value ' + diffCls + '">' + diffPrefix + _planFmtMoney(diff) + '</div></div>';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">КПД</div><div class="plan-summary-value ' + effCls + '">' + efficiency + '%</div></div>';
  h += '</div></div>';
  return h;
}

/* ─── Analytics row: Burn Rate + Sparkline + Donut (Фичи 1, 2, 3) ─── */
function _planRenderAnalytics() {
  var rate = prGetRate(_plan.selectedDevId);
  var dates = Object.keys(_plan.dailyMap).sort();

  /* Фича 1: Burn Rate */
  var burn = _planCalcBurnRate();

  /* Фича 2: Sparkline SVG — кумулятивный план-факт */
  var cumPlan = 0, cumFact = 0;
  var sparkData = [];
  var maxVal = 1;
  dates.forEach(function(dateStr) {
    var day = _plan.dailyMap[dateStr];
    cumPlan += day.plan;
    cumFact += day.fact;
    sparkData.push({ plan: cumPlan, fact: cumFact });
    if (cumPlan > maxVal) maxVal = cumPlan;
    if (cumFact > maxVal) maxVal = cumFact;
  });

  /* Build SVG path */
  var svgW = 200, svgH = 48, padY = 4;
  var xStep = sparkData.length > 1 ? svgW / (sparkData.length - 1) : svgW;
  var planPath = '', factPath = '';
  sparkData.forEach(function(pt, i) {
    var x = i * xStep;
    var yPlan = svgH - padY - (pt.plan / maxVal * (svgH - padY * 2));
    var yFact = svgH - padY - (pt.fact / maxVal * (svgH - padY * 2));
    planPath += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yPlan.toFixed(1);
    factPath += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yFact.toFixed(1);
  });

  /* Фича 3: Donut — распределение по проектам */
  var projects = _planCalcProjectDistribution();
  var totalAmount = 0;
  projects.forEach(function(p) { totalAmount += p.amount; });

  var donutColors = ['#4f8bff','#22d47e','#f5a623','#ff4f6a','#00d4ff','#ff8c42','#a78bfa','#f472b6'];
  var donutSvg = '';
  if (totalAmount > 0) {
    var cx = 28, cy = 28, r = 20, rInner = 13;
    var cumAngle = 0;
    var arcs = '';
    projects.forEach(function(p, i) {
      var pctAngle = p.amount / totalAmount * Math.PI * 2;
      var startAngle = cumAngle - Math.PI / 2;
      var endAngle = cumAngle + pctAngle - Math.PI / 2;
      var x1 = cx + r * Math.cos(startAngle);
      var y1 = cy + r * Math.sin(startAngle);
      var x2 = cx + r * Math.cos(endAngle);
      var y2 = cy + r * Math.sin(endAngle);
      var x3 = cx + rInner * Math.cos(endAngle);
      var y3 = cy + rInner * Math.sin(endAngle);
      var x4 = cx + rInner * Math.cos(startAngle);
      var y4 = cy + rInner * Math.sin(startAngle);
      var large = pctAngle > Math.PI ? 1 : 0;
      var col = donutColors[i % donutColors.length];
      arcs += '<path d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' L' + x3.toFixed(1) + ',' + y3.toFixed(1) + ' A' + rInner + ',' + rInner + ' 0 ' + large + ' 0 ' + x4.toFixed(1) + ',' + y4.toFixed(1) + ' Z" fill="' + col + '" opacity="0.85"/>';
      cumAngle += pctAngle;
    });
    donutSvg = '<svg width="56" height="56" viewBox="0 0 56 56">' + arcs + '</svg>';
  }

  var h = '<div class="plan-analytics-row">';

  /* Фича 1: Burn Rate */
  if (burn) {
    var barPct = Math.min(burn.projectedPct, 120);
    var barW = Math.round(barPct / 120 * 100);
    var barCls = burn.projectedPct >= 95 ? 'plan-burn-good' : (burn.projectedPct >= 70 ? 'plan-burn-warn' : 'plan-burn-bad');
    h += '<div class="plan-analytics-card">';
    h += '<div class="plan-analytics-label">Прогноз на конец месяца</div>';
    h += '<div class="plan-burn-row"><div class="plan-burn-track"><div class="plan-burn-fill ' + barCls + '" style="width:' + barW + '%"></div></div><div class="plan-burn-val">' + burn.projectedPct + '%</div></div>';
    h += '<div class="plan-analytics-sub">Средняя выработка ' + _planFmtMoney(Math.round(burn.avgDaily)) + '/день | Осталось ' + burn.remainingDays + ' дн.</div>';
    h += '</div>';
  }

  /* Фича 2: Sparkline */
  h += '<div class="plan-analytics-card">';
  h += '<div class="plan-analytics-label">Кумулятивный план-факт</div>';
  h += '<div class="plan-sparkline-wrap">';
  h += '<svg width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + ' ' + svgH + '" class="plan-sparkline">';
  h += '<path d="' + planPath + '" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.5"/>';
  h += '<path d="' + factPath + '" fill="none" stroke="var(--green)" stroke-width="1.5"/>';
  h += '</svg>';
  h += '<div class="plan-sparkline-legend"><span style="color:var(--accent)">&#9644; План</span><span style="color:var(--green)">&#9644; Факт</span></div>';
  h += '</div></div>';

  /* Фича 3: Donut + project list */
  if (donutSvg && projects.length > 0) {
    h += '<div class="plan-analytics-card plan-donut-card">';
    h += '<div class="plan-analytics-label">По проектам</div>';
    h += '<div class="plan-donut-row">';
    h += '<div class="plan-donut-svg">' + donutSvg + '</div>';
    h += '<div class="plan-donut-legend">';
    projects.slice(0, 4).forEach(function(p, i) {
      var col = donutColors[i % donutColors.length];
      h += '<div class="plan-donut-item"><span class="plan-donut-dot" style="background:' + col + '"></span><span class="plan-donut-name">' + esc(p.name.substring(0, 18)) + '</span><span class="plan-donut-pct">' + (totalAmount > 0 ? Math.round(p.amount / totalAmount * 100) : 0) + '%</span></div>';
    });
    h += '</div></div></div>';
  }

  h += '</div>';
  return h;
}

/* ─── Main table (enhanced with Фича 4: idle + overtime) ─── */
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
  h += '<th style="text-align:center">&#8721;</th>';
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
    var dayName = _planGetDayName(dateStr);
    var taskCount = day.tasks.length;
    var comment = _plan.dayComments[dateStr] || '';

    /* Фича 4: Row class — idle / overtime */
    var rowCls = '';
    if (day.isWeekend) {
      rowCls = ' class="row-weekend"';
    } else if (_planIsIdleDay(day)) {
      rowCls = ' class="row-idle"';
    } else if (_planIsOvertime(day)) {
      rowCls = ' class="row-overtime"';
    }

    totalPlan += day.plan;
    totalFact += day.fact;

    h += '<tr' + rowCls + '>';
    h += '<td class="cell-num">' + idx + '</td>';
    h += '<td class="cell-date" style="cursor:pointer" onclick="_planOpenTasksModal(\'' + dateStr + '\')">' + _planFormatDateRu(dateStr) + '<span class="day-name">' + dayName + '</span>';
    /* Фича 4: Idle/Overtime badges */
    if (_planIsIdleDay(day)) h += '<span class="plan-badge-idle" title="Простой — нет списаний">&#9888;</span>';
    if (_planIsOvertime(day)) h += '<span class="plan-badge-overtime" title="Переработка >120% плана">&#128293;</span>';
    h += '</td>';
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

/* ─── Фича 7: Топ-5 задач месяца (expandable) ─── */
function _planRenderTopTasks() {
  var top = _planCalcTopTasks();
  if (!top.length) return '';

  var rate = prGetRate(_plan.selectedDevId);
  var expanded = _plan.topTasksExpanded;

  var h = '<div class="plan-top-tasks">';
  h += '<div class="plan-top-tasks-header" onclick="_planToggleTopTasks()">';
  h += '<span class="plan-top-tasks-title">&#127942; Топ-5 задач по часам</span>';
  h += '<span class="plan-top-tasks-toggle">' + (expanded ? '&#9650; скрыть' : '&#9660; показать') + '</span>';
  h += '</div>';
  if (expanded) {
    h += '<div class="plan-top-tasks-body">';
    top.forEach(function(t, i) {
      var amount = Math.round(t.totalBillable * rate);
      var barW = top[0].totalBillable > 0 ? Math.round(t.totalBillable / top[0].totalBillable * 100) : 0;
      h += '<div class="plan-top-task-row">';
      h += '<span class="plan-top-task-num">' + (i + 1) + '</span>';
      h += '<div class="plan-top-task-info">';
      h += '<div class="plan-top-task-name">' + esc(t.title.substring(0, 45)) + (t.title.length > 45 ? '...' : '') + '</div>';
      if (t.projectName) h += '<div class="plan-top-task-proj">' + esc(t.projectName) + '</div>';
      h += '</div>';
      h += '<div class="plan-top-task-bar-wrap"><div class="plan-top-task-bar" style="width:' + barW + '%"></div></div>';
      h += '<div class="plan-top-task-hours">' + t.totalBillable.toFixed(1) + 'ч</div>';
      h += '<div class="plan-top-task-amount">' + _planFmtMoney(amount) + '</div>';
      h += '</div>';
    });
    h += '</div>';
  }
  h += '</div>';
  return h;
}

function _planToggleTopTasks() {
  _plan.topTasksExpanded = !_plan.topTasksExpanded;
  _planRenderAll();
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
  var cached = _plan.taskDescCache[task.taskId] || {};
  var desc = cached.description || '';
  var deadline = cached.deadline || '';
  var statusText = cached.statusText || '';
  var hasDesc = desc.length > 0;
  var shortDesc = hasDesc && desc.length > 120 ? desc.substring(0, 120) + '...' : desc;

  /* Bitrix24 task URL — надёжное извлечение домена портала */
  var bxPortal = '';
  try { bxPortal = (HOOK || '').replace(/\/rest\/.*/, ''); } catch(e) {}
  if (!bxPortal || !bxPortal.startsWith('http')) bxPortal = 'https://1c-cms.bitrix24.ru';
  var bxTaskUrl = bxPortal + '/company/personal/user/' + _plan.selectedDevId + '/tasks/task/view/' + task.taskId + '/';

  var h = '<div class="modal-overlay open" id="planTaskDetailModal" onclick="if(event.target===this)_planCloseTaskDetail()">';
  h += '<div class="modal" style="max-width:600px;overflow:hidden">';

  /* ── Header: ← Назад | #taskId | проект-тег ── */
  h += '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border);overflow:hidden">';
  h += '<span style="color:var(--accent);cursor:pointer;font-family:var(--mono);font-size:12px;white-space:nowrap" onclick="_planCloseTaskDetail()">&larr; Назад</span>';
  h += '<a href="' + esc(bxTaskUrl) + '" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:11px;color:var(--accent);text-decoration:none;opacity:.8" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.8" title="Открыть задачку в Битрикс">#' + esc(task.taskId) + '</a>';
  if (task.projectName) {
    h += '<span style="font-family:var(--mono);font-size:10px;color:var(--accent);background:rgba(79,139,255,.1);padding:2px 8px;border-radius:10px;white-space:nowrap">' + esc(task.projectName) + '</span>';
  }
  h += '<span style="flex:1"></span>';
  h += '<button class="modal-close" onclick="_planCloseTaskDetail()">&times;</button>';
  h += '</div>';

  /* ── Body ── */
  h += '<div style="padding:16px">';

  /* Task title — truncate if too long */
  h += '<div style="font-size:16px;font-weight:600;color:var(--text);line-height:1.4;margin-bottom:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(task.title) + '">' + esc(task.title) + '</div>';

  /* ОПИСАНИЕ */
  if (hasDesc) {
    h += '<div style="margin-bottom:12px">';
    h += '<div style="font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Описание</div>';
    h += '<div id="taskDescShort" style="font-size:12px;color:var(--text2);line-height:1.5">' + esc(shortDesc) + '</div>';
    if (desc.length > 120) {
      h += '<div id="taskDescFull" style="font-size:12px;color:var(--text2);line-height:1.5;display:none">' + esc(desc) + '</div>';
      h += '<span id="taskDescToggle" style="color:var(--accent);font-family:var(--mono);font-size:11px;cursor:pointer" onclick="_planToggleDesc()">Показать &#9660;</span>';
    }
    h += '</div>';
  } else {
    h += '<div style="margin-bottom:12px">';
    h += '<div style="font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Описание</div>';
    h += '<div id="taskDescContent" style="font-size:12px;color:var(--text3);font-style:italic">Загрузка...</div>';
    h += '</div>';
  }

  /* ── Info grid ── */
  h += '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
  h += '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase">Проект</span>';
  h += '<span style="font-family:var(--mono);font-size:12px;color:var(--text2)">' + esc(task.projectName || '—') + '</span>';
  h += '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase">Списано</span>';
  h += '<span style="font-family:var(--mono);font-size:12px;color:var(--green)">' + task.factHours.toFixed(1) + ' ч</span>';
  h += '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase">К выставлению</span>';
  h += '<span style="font-family:var(--mono);font-size:12px;color:var(--accent)">' + task.billableHours.toFixed(1) + ' ч</span>';
  h += '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase">Сумма</span>';
  h += '<span style="font-family:var(--mono);font-size:12px;color:var(--orange)">' + _planFmtMoney(task.billableHours * rate) + '</span>';
  if (statusText) {
    h += '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase">Статус</span>';
    h += '<span style="font-family:var(--mono);font-size:12px;color:var(--text2)">' + esc(statusText) + '</span>';
  }
  if (deadline) {
    h += '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase">Крайний срок</span>';
    h += '<span style="font-family:var(--mono);font-size:12px;color:var(--red)">' + esc(deadline) + '</span>';
  }
  h += '</div>';

  h += '</div>'; /* end body padding */

  /* ── Footer: ссылка «Открыть в Битрикс» ── */
  h += '<div style="padding:8px 16px;border-top:1px solid var(--border);text-align:right">';
  h += '<a href="' + esc(bxTaskUrl) + '" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:10px;color:var(--accent);text-decoration:none;opacity:.7" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.7">Открыть в Битрикс &#8599;</a>';
  h += '</div>';

  h += '</div></div>';

  /* Fetch description if not cached */
  if (!hasDesc) {
    setTimeout(function() { _planFetchTaskDesc(task.taskId); }, 100);
  }

  return h;
}

/* Toggle description Показать/Свернуть */
function _planToggleDesc() {
  var shortEl = document.getElementById('taskDescShort');
  var fullEl = document.getElementById('taskDescFull');
  var toggleEl = document.getElementById('taskDescToggle');
  if (!shortEl || !fullEl) return;
  if (fullEl.style.display === 'none') {
    shortEl.style.display = 'none';
    fullEl.style.display = '';
    if (toggleEl) toggleEl.innerHTML = 'Свернуть &#9650;';
  } else {
    shortEl.style.display = '';
    fullEl.style.display = 'none';
    if (toggleEl) toggleEl.innerHTML = 'Показать &#9660;';
  }
}

/* Fetch task description from Bitrix24 on demand */
function _planFetchTaskDesc(taskId) {
  if (_plan.taskDescCache[taskId]) return;
  if (typeof bxPost !== 'function') return;

  bxPost('tasks.task.get', { taskId: taskId, select: ['ID','TITLE','DESCRIPTION','STATUS','DEADLINE','STATUS_PSEUDO'] }).then(function(r) {
    if (!r || r.error || !r.result || !r.result.task) {
      _plan.taskDescCache[taskId] = { description: '', deadline: '', statusText: '' };
      return;
    }
    var t = r.result.task;
    var desc = t.description || '';
    var deadline = t.deadline || '';
    var statusText = '';
    /* Status mapping */
    var s = parseInt(t.status, 10);
    if (s === 1 || t.statusPseudo === 'pending') statusText = 'Ждёт выполнения';
    else if (s === 2 || t.statusPseudo === 'in_progress') statusText = 'В работе';
    else if (s === 3 || t.statusPseudo === 'completed') statusText = 'Выполнена';
    else if (s === 4 || s === 5 || t.statusPseudo === 'deferred') statusText = 'Отложена';
    else if (t.statusPseudo === 'review') statusText = 'На проверке';

    if (deadline) {
      try {
        var dd = new Date(deadline);
        if (!isNaN(dd.getTime())) {
          var dDay = String(dd.getDate()).padStart(2, '0');
          var dMon = МЕСЯЦЫ_ПОЛН[dd.getMonth()];
          var dH = String(dd.getHours()).padStart(2, '0');
          var dM = String(dd.getMinutes()).padStart(2, '0');
          deadline = dDay + ' ' + dMon + ' ' + dH + ':' + dM;
        }
      } catch(e) {}
    }

    _plan.taskDescCache[taskId] = { description: desc, deadline: deadline, statusText: statusText };

    /* Re-render if still viewing this task */
    if (_plan.modalOpen === 'taskDetail' && _plan.modalTaskId === String(taskId)) {
      _planRenderAll();
    }
  }).catch(function() {
    _plan.taskDescCache[taskId] = { description: '', deadline: '', statusText: '' };
  });
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
  _planLoadPrevMonth();
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
  _planDebouncedApiSave();
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
    _planRenderAll();
    _planDebouncedApiSave();
  }
}

/* ═══════════════════════════════════════════════════════════════
   ФИЧА 10: Быстрый экспорт сводки
   ═══════════════════════════════════════════════════════════════ */
function _planExportSummary() {
  var totalPlan = 0, totalFact = 0, workDays = 0, idleDays = 0, overtimeDays = 0;
  Object.keys(_plan.dailyMap).forEach(function(dateStr) {
    var day = _plan.dailyMap[dateStr];
    totalPlan += day.plan;
    totalFact += day.fact;
    if (!day.isWeekend) {
      workDays++;
      if (_planIsIdleDay(day)) idleDays++;
      if (_planIsOvertime(day)) overtimeDays++;
    }
  });
  var diff = totalFact - totalPlan;
  var pct = totalPlan > 0 ? Math.round(totalFact / totalPlan * 100) : 0;
  var eff = _planCalcEfficiency();
  var devName = _plan.selectedDevId ? prGetDevName(_plan.selectedDevId) : '—';
  var monthName = (typeof МЕСЯЦЫ_ПОЛН !== 'undefined') ? МЕСЯЦЫ_ПОЛН[prCurrentPeriod.month - 1] + ' ' + prCurrentPeriod.year : prCurrentPeriod.year + '-' + prCurrentPeriod.month;
  var burn = _planCalcBurnRate();

  var text = 'План-факт ' + devName + ', ' + monthName + '\n';
  text += 'План: ' + _planFmtMoney(totalPlan) + ' | Факт: ' + _planFmtMoney(totalFact) + ' | Разница: ' + (diff >= 0 ? '+' : '') + _planFmtMoney(diff) + ' (' + pct + '%)\n';
  text += 'КПД: ' + eff + '% | Раб.дней: ' + workDays + ' | Простои: ' + idleDays + ' | Переработки: ' + overtimeDays;
  if (burn) text += '\nПрогноз: ' + burn.projectedPct + '% на конец месяца';

  /* Copy to clipboard */
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      _planLogEvent('Экспорт', 'Сводка скопирована');
      /* Brief visual feedback */
      var btn = document.querySelector('.plan-actions .plan-btn-ghost');
      if (btn) { var orig = btn.textContent; btn.textContent = 'Скопировано!'; setTimeout(function() { btn.textContent = orig; }, 1500); }
    });
  } else {
    /* Fallback */
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
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
  _plan.modalOpen = null;
  _plan.adminSaveMsg = null;
  _plan.adminChangedDevs = {};
  _planRenderAll();
}

function _planRenderAdminModal() {
  if (_plan.modalOpen !== 'admin') return '';

  var h = '<div class="modal-overlay open" id="planAdminModal" onclick="if(event.target===this)_planCloseAdmin()">';
  h += '<div class="modal" onclick="event.stopPropagation()" style="max-width:960px">';

  /* Header */
  h += '<div class="modal-header">';
  h += '<span class="modal-title">&#9881; Настройка ставок — План-факт</span>';
  h += '<button class="modal-close" onclick="_planCloseAdmin()">&times;</button>';
  h += '</div>';

  /* Body */
  h += '<div class="modal-body" id="planAdminBody" style="overflow-y:auto;padding:12px 16px">';
  h += _planRenderAdminBody();
  h += '</div>';

  /* Footer */
  h += '<div class="modal-footer">';
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

  /* Rebuild daily map with new rates (no API call, just recalc) */
  _planBuildDailyMap();

  /* Send snapshot to API (fire-and-forget) */
  _planSaveToApi();

  /* Close admin modal and render once */
  _plan.modalOpen = null;
  _planRenderAll();
}

/* ═══════════════════════════════════════════════════════════════
   API: отправка снапшота на сервер
   ═══════════════════════════════════════════════════════════════ */
var _PR_API_KEY = 'pr_api_2026';

function _planBuildApiSnapshot() {
  var periodKey = prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0');
  var developers = [];
  var details = [];
  var totals = { totalPlan: 0, totalFact: 0, totalPayrollAmount: 0, totalClientRevenue: 0, totalBase: 0, totalFine: 0 };

  if (typeof ACTIVE_DEV_IDS !== 'undefined') {
    ACTIVE_DEV_IDS.forEach(function(devId) {
      var sid = String(devId);
      var rate = prGetRate(sid);
      var clientRate = prGetClientRate(sid);
      var base = prGetBase(sid);
      var fine = prGetFine(sid);
      var fineComment = prGetFineComment(sid);
      var fines = prGetFines(sid);
      var devName = prGetDevName(sid);

      var devFactHours = 0;
      var devBillableHours = 0;
      var devPayrollAmount = 0;
      var devClientRevenue = 0;
      var devTaskCount = 0;

      /* Собираем данные по дням для этого разраба */
      var savedDevId = _plan.selectedDevId;
      _plan.selectedDevId = sid;
      _planBuildDailyMap();

      Object.keys(_plan.dailyMap).forEach(function(dateStr) {
        var day = _plan.dailyMap[dateStr];
        day.tasks.forEach(function(t) {
          devFactHours += t.factHours;
          devBillableHours += t.billableHours;
          devPayrollAmount += t.billableHours * rate;
          devClientRevenue += t.billableHours * clientRate;
          devTaskCount++;

          /* Определяем стадию задачи и платёжный статус */
          var stageInfo = (typeof prGetStageInfo === 'function')
            ? prGetStageInfo(t.projectId, t.stageId)
            : {stageId: 0, stageName: '', paymentStatus: 'unknown', isReadyForPayment: false};

          details.push({
            devId: parseInt(sid),
            fullName: devName,
            taskId: parseInt(t.taskId),
            taskTitle: t.title,
            projectId: t.projectId ? parseInt(t.projectId) : null,
            projectName: t.projectName || '',
            stageId: stageInfo.stageId,
            stageName: stageInfo.stageName,
            paymentStatus: stageInfo.paymentStatus,
            isReadyForPayment: stageInfo.isReadyForPayment,
            date: dateStr,
            factHours: t.factHours,
            billableHours: t.billableHours,
            rate: rate,
            payrollAmount: Math.round(t.billableHours * rate),
            clientRate: clientRate,
            clientAmount: Math.round(t.billableHours * clientRate),
            comment: _plan.dayComments[dateStr] || ''
          });
        });
      });

      var payrollAmount = Math.round(devPayrollAmount) + base - fine;
      var grossMargin = devClientRevenue - payrollAmount;

      developers.push({
        devId: parseInt(sid),
        fullName: devName,
        inn: prGetInn(sid),
        selfEmployed: prGetSelfEmployed(sid),
        bank: prGetBank(sid),
        contract: prGetContract(sid),
        contractDate: prGetContractDate(sid),
        rate: rate,
        clientRate: clientRate,
        base: base,
        fine: fine,
        fineComment: fineComment,
        fines: fines,
        notes: prGetNotes(sid),
        active: true,
        factHours: devFactHours,
        billableHours: devBillableHours,
        payrollAmount: payrollAmount,
        clientRevenue: devClientRevenue,
        grossMargin: grossMargin,
        taskCount: devTaskCount
      });

      totals.totalPayrollAmount += payrollAmount;
      totals.totalClientRevenue += devClientRevenue;
      totals.totalBase += base;
      totals.totalFine += fine;

      /* Восстанавливаем выбранного разраба */
      _plan.selectedDevId = savedDevId;
    });
  }

  /* Пересчитаем для текущего разраба */
  _planBuildDailyMap();

  return {
    period: periodKey,
    developers: developers,
    details: details,
    totals: totals
  };
}

function _planSaveToApi() {
  try {
    var snapshot = _planBuildApiSnapshot();
    var periodKey = snapshot.period;

    fetch('/api/admin/save?key=' + _PR_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot)
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.ok) {
        console.log('[API] Снапшот сохранён: ' + periodKey + ' → ' + data.url);
      } else {
        console.warn('[API] Ошибка сохранения:', data.error);
      }
    }).catch(function(e) {
      console.warn('[API] Сеть:', e.message);
    });
  } catch(e) {
    console.warn('[API] Ошибка формирования снапшота:', e.message);
  }
}

var _planApiSaveTimer = null;
function _planDebouncedApiSave() {
  if (_planApiSaveTimer) clearTimeout(_planApiSaveTimer);
  _planApiSaveTimer = setTimeout(function() { _planSaveToApi(); }, 3000);
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
