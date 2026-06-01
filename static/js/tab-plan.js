/* ═══════════════════════════════════════════════════════════════
   tab-plan.js — Вкладка ПЛАН (Планирование выработки)
   v1.0.0 — Моковая реализация, интеграция с core.js

   Отвечает за:
   - Ежедневный контроль выработки: План vs Факт
   - Расчёт отклонений и средней выработки
   - Админку ставок разработчика/клиента
   - Сохранение данных в localStorage (через prSaveSettings)
   ═══════════════════════════════════════════════════════════════ */

var _plan = {
  container: null,
  styleEl: null,
  rows: [],
  dirty: false,
  docNumber: '',
  docDate: '',
  period: null,          /* { year, month } */
  responsible: '',
  docComment: '',
  adminOpen: false
};

/* ═══════════════════════════════════════════════════════════════
   РЕГИСТРАЦИЯ МОДУЛЯ
   ═══════════════════════════════════════════════════════════════ */
window.TabPlan = {
  render: function(container) {
    if (!container) return;
    _plan.container = container;
    _plan.period = { year: prCurrentPeriod.year, month: prCurrentPeriod.month };
    /* Подключаем стили если ещё не подключены */
    if (!_plan.styleEl && typeof PLAN_CSS !== 'undefined') {
      _plan.styleEl = document.createElement('style');
      _plan.styleEl.textContent = PLAN_CSS;
      document.head.appendChild(_plan.styleEl);
    }
    _planLoadData();
    _planRenderAll();
  },
  destroy: function() {
    if (_plan.styleEl && _plan.styleEl.parentNode) {
      _plan.styleEl.parentNode.removeChild(_plan.styleEl);
      _plan.styleEl = null;
    }
    _plan.container = null;
    _plan.rows = [];
  },
  refresh: function() {
    _planLoadData();
    _planRenderAll();
  }
};

/* ═══════════════════════════════════════════════════════════════
   ДАННЫЕ
   ═══════════════════════════════════════════════════════════════ */
function _planStorageKey() {
  return 'pr_plan_' + _plan.period.year + '_' + String(_plan.period.month).padStart(2, '0');
}

function _planLoadData() {
  _plan.period = { year: prCurrentPeriod.year, month: prCurrentPeriod.month };
  try {
    var raw = localStorage.getItem(_planStorageKey());
    if (raw) {
      var data = JSON.parse(raw);
      if (data && data._v === 1) {
        _plan.rows = data.rows || [];
        _plan.docNumber = data.docNumber || _planGenNumber();
        _plan.docDate = data.docDate || _planNowStr();
        _plan.responsible = data.responsible || '';
        _plan.docComment = data.docComment || '';
        _plan.dirty = false;
        return;
      }
    }
  } catch(e) {}
  /* Нет сохранённых данных — генерируем по периоду */
  _plan.rows = _planGenerateRows();
  _plan.docNumber = _planGenNumber();
  _plan.docDate = _planNowStr();
  _plan.responsible = '';
  _plan.docComment = '';
  _plan.dirty = false;
}

function _planSaveData() {
  try {
    var data = {
      _v: 1,
      _ts: Date.now(),
      rows: _plan.rows,
      docNumber: _plan.docNumber,
      docDate: _plan.docDate,
      responsible: _plan.responsible,
      docComment: _plan.docComment
    };
    localStorage.setItem(_planStorageKey(), JSON.stringify(data));
    _plan.dirty = false;
  } catch(e) {
    console.warn('_planSaveData: ошибка', e);
  }
}

function _planGenNumber() {
  try {
    var cnt = parseInt(localStorage.getItem('pr_plan_counter') || '0') + 1;
    localStorage.setItem('pr_plan_counter', String(cnt));
    return String(cnt).padStart(9, '0');
  } catch(e) {
    return '000000001';
  }
}

function _planNowStr() {
  var d = new Date();
  return String(d.getDate()).padStart(2, '0') + '.' +
         String(d.getMonth() + 1).padStart(2, '0') + '.' +
         d.getFullYear() + ' ' +
         String(d.getHours()).padStart(2, '0') + ':' +
         String(d.getMinutes()).padStart(2, '0') + ':' +
         String(d.getSeconds()).padStart(2, '0');
}

/* Генерация строк по рабочим дням периода */
function _planGenerateRows() {
  var year = _plan.period.year;
  var month = _plan.period.month;
  var daysInMonth = new Date(year, month, 0).getDate();
  var dailyPlan = _planCalcDailyPlan();
  var rows = [];

  for (var day = 1; day <= daysInMonth; day++) {
    var d = new Date(year, month - 1, day);
    var dow = d.getDay();
    var isWknd = (dow === 0 || dow === 6);
    var dateStr = String(day).padStart(2, '0') + '.' +
                  String(month).padStart(2, '0') + '.' + year;
    rows.push({
      date: dateStr,
      plan: dailyPlan,
      fact: 0,
      comment: '',
      isWeekend: isWknd
    });
  }
  return rows;
}

/* Суточный план = суммарная ставка × 8ч / рабочие дни в месяце */
function _planCalcDailyPlan() {
  var workDays = 0;
  var year = _plan.period.year;
  var month = _plan.period.month;
  var daysInMonth = new Date(year, month, 0).getDate();
  for (var d = 1; d <= daysInMonth; d++) {
    var dt = new Date(year, month - 1, d);
    var dow = dt.getDay();
    if (dow !== 0 && dow !== 6) workDays++;
  }
  if (workDays === 0) return 6000;

  var totalHourlyRate = 0;
  if (typeof ACTIVE_DEV_IDS !== 'undefined') {
    ACTIVE_DEV_IDS.forEach(function(id) {
      totalHourlyRate += prGetRate(String(id));
    });
  }
  /* Если ставки 0 — дефолт 6000 */
  if (totalHourlyRate === 0) return 6000;
  return Math.round(totalHourlyRate * 8 / workDays);
}

/* ═══════════════════════════════════════════════════════════════
   РЕНДЕРИНГ
   ═══════════════════════════════════════════════════════════════ */
function _planRenderAll() {
  if (!_plan.container) return;
  var h = '';
  h += _planRenderHeader();
  h += _planRenderSummary();
  h += _planRenderTableControls();
  h += _planRenderTable();
  h += _planRenderFooter();
  h += _planRenderAdminModal();
  _plan.container.innerHTML = h;
}

/* ─── Document Header ─── */
function _planRenderHeader() {
  var periodLabel = (typeof МЕСЯЦЫ_ПОЛН !== 'undefined')
    ? МЕСЯЦЫ_ПОЛН[_plan.period.month - 1] + ' ' + _plan.period.year
    : _plan.period.year + '-' + String(_plan.period.month).padStart(2, '0');

  var h = '<div class="plan-doc-header">';
  h += '<div class="plan-doc-title">';
  h += 'Планирование <span class="plan-doc-num">' + esc(_plan.docNumber) + '</span>';
  h += ' <span class="plan-doc-date">от ' + esc(_plan.docDate) + '</span>';
  if (_plan.dirty) h += '<span class="plan-dirty" title="Несохранённые изменения">*</span>';
  h += '</div>';

  h += '<div class="plan-actions">';
  h += '<button class="plan-btn plan-btn-yellow" onclick="_planSaveClose()">Провести и закрыть</button>';
  h += '<button class="plan-btn plan-btn-green" onclick="_planSave()">Записать</button>';
  h += '<button class="plan-btn plan-btn-primary" onclick="_planPost()">Провести</button>';
  h += '<button class="plan-btn plan-btn-ghost" onclick="window.TabPlan.refresh()">&#8635; Обновить</button>';
  h += '<button class="plan-btn plan-btn-ghost" onclick="alert(\'Ещё: экспорт, печать, история\')">Ещё ▾</button>';
  h += '<span class="plan-admin-badge" onclick="_planOpenAdmin()">&#9881; Админка ставок</span>';
  h += '</div>';

  h += '<div class="plan-reqs">';
  h += '<div class="plan-req"><label>Номер</label><span class="plan-req-val">' + esc(_plan.docNumber) + '</span></div>';
  h += '<div class="plan-req"><label>Дата</label><input class="plan-req-input" type="datetime-local" value="' + _planIsoDate(_plan.docDate) + '" onchange="_plan.docDate=this.value;_plan.dirty=true"></div>';
  h += '<div class="plan-req"><label>Период</label>';

  /* Select периода — текущий + 2 предыдущих */
  h += '<select class="plan-req-input" onchange="_planOnPeriodChange(this.value)">';
  var now = new Date();
  for (var i = 0; i < 3; i++) {
    var dd = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var yy = dd.getFullYear(), mm = dd.getMonth() + 1;
    var sel = (yy === _plan.period.year && mm === _plan.period.month) ? ' selected' : '';
    var lbl = (typeof МЕСЯЦЫ_ПОЛН !== 'undefined') ? МЕСЯЦЫ_ПОЛН[mm - 1] + ' ' + yy : yy + '-' + String(mm).padStart(2, '0');
    h += '<option value="' + yy + '-' + mm + '"' + sel + '>' + esc(lbl) + '</option>';
  }
  h += '</select></div>';

  h += '<div class="plan-req"><label>Ответственный</label>';
  h += '<select class="plan-req-input" onchange="_plan.responsible=this.value;_plan.dirty=true">';
  h += '<option value="">—</option>';
  if (typeof ACTIVE_DEV_IDS !== 'undefined') {
    ACTIVE_DEV_IDS.forEach(function(id) {
      var name = prGetDevName(String(id));
      var sel = _plan.responsible === String(id) ? ' selected' : '';
      h += '<option value="' + id + '"' + sel + '>' + esc(name) + '</option>';
    });
  }
  h += '</select></div>';
  h += '</div></div>';
  return h;
}

/* ─── Summary Block ─── */
function _planRenderSummary() {
  var totalPlan = 0, totalFact = 0;
  _plan.rows.forEach(function(r) {
    totalPlan += r.plan;
    totalFact += r.fact;
  });
  var diff = totalFact - totalPlan;
  var diffCls = diff >= 0 ? 'val-diff-pos' : 'val-diff-neg';
  var diffPrefix = diff >= 0 ? '+ ' : '';
  var today = new Date();
  var todayStr = String(today.getDate()).padStart(2, '0') + '.' +
                 String(today.getMonth() + 1).padStart(2, '0') + '.' + today.getFullYear();

  var h = '<div class="plan-summary">';
  h += '<div class="plan-summary-title">Итог на текущую дату</div>';
  h += '<div class="plan-summary-grid">';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">Дата среза</div><div class="plan-summary-value" style="font-size:16px;color:var(--text2)">' + todayStr + '</div></div>';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">План</div><div class="plan-summary-value val-plan">' + _planFmtMoney(totalPlan) + '</div></div>';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">Факт</div><div class="plan-summary-value val-fact">' + _planFmtMoney(totalFact) + '</div></div>';
  h += '<div class="plan-summary-item"><div class="plan-summary-label">Разница</div><div class="plan-summary-value ' + diffCls + '">' + diffPrefix + _planFmtMoney(Math.abs(diff)) + '</div></div>';
  h += '</div></div>';
  return h;
}

/* ─── Table Controls ─── */
function _planRenderTableControls() {
  var h = '<div class="plan-table-controls">';
  h += '<button class="plan-btn plan-btn-green" onclick="_planAddRow()">+ Добавить</button>';
  h += '<button class="plan-btn plan-btn-ghost" onclick="alert(\'Мок: перемещение строки вверх\')">&#9650;</button>';
  h += '<button class="plan-btn plan-btn-ghost" onclick="alert(\'Мок: перемещение строки вниз\')">&#9660;</button>';
  h += '<input class="plan-search" type="text" placeholder="Поиск (Ctrl+F)..." oninput="_planFilterRows(this.value)">';
  h += '</div>';
  return h;
}

/* ─── Data Table ─── */
function _planRenderTable() {
  var h = '<div class="plan-table-wrap" style="max-height:520px;overflow-y:auto">';
  h += '<table class="plan-table" id="planTable">';
  h += '<thead><tr>';
  h += '<th style="width:40px">N</th>';
  h += '<th style="width:100px">Дата</th>';
  h += '<th style="width:110px;text-align:right">Сумма план</th>';
  h += '<th style="width:120px;text-align:right">Сумма факт</th>';
  h += '<th style="width:110px;text-align:right">Разница</th>';
  h += '<th style="width:120px;text-align:right">Сумма факт средняя</th>';
  h += '<th>Комментарий</th>';
  h += '</tr></thead><tbody>';

  var totalPlan = 0, totalFact = 0, factCount = 0, factSum = 0;

  _plan.rows.forEach(function(row, idx) {
    var diff = row.fact - row.plan;
    totalPlan += row.plan;
    totalFact += row.fact;
    if (row.fact > 0) { factSum += row.fact; factCount++; }
    var avg = factCount > 0 ? factSum / factCount : 0;
    var diffCls = diff >= 0 ? 'pos' : 'neg';
    var diffPrefix = diff >= 0 ? '+' : '';
    var wkendCls = row.isWeekend ? ' class="row-weekend"' : '';
    var dayName = _planGetDayName(row.date);

    h += '<tr' + wkendCls + ' data-idx="' + idx + '">';
    h += '<td class="cell-num">' + (idx + 1) + '</td>';
    h += '<td class="cell-date">' + esc(row.date) + '<span class="day-name">' + dayName + '</span></td>';
    h += '<td class="cell-money">' + _planFmtMoney(row.plan) + '</td>';
    h += '<td style="text-align:right"><input class="plan-edit' + (row.fact > 0 ? ' active-cell' : '') + '" type="text" value="' + _planFmtMoney(row.fact) + '" data-idx="' + idx + '" onchange="_planOnFactChange(this)" onfocus="this.select()"></td>';
    h += '<td class="cell-money ' + diffCls + '">' + diffPrefix + _planFmtMoney(diff) + '</td>';
    h += '<td class="cell-avg">' + (avg > 0 ? _planFmtMoney(avg) : '—') + '</td>';
    h += '<td><textarea class="plan-comment-edit" rows="1" data-idx="' + idx + '" onchange="_planOnCommentChange(this)">' + esc(row.comment) + '</textarea></td>';
    h += '</tr>';
  });

  h += '</tbody>';

  /* Footer */
  var totalDiff = totalFact - totalPlan;
  var totalDiffCls = totalDiff >= 0 ? 'pos' : 'neg';
  var totalDiffPrefix = totalDiff >= 0 ? '+ ' : '';
  h += '<tfoot><tr>';
  h += '<td colspan="2" style="font-weight:700;color:var(--text)">Итого:</td>';
  h += '<td class="cell-money" style="color:var(--accent)">' + _planFmtMoney(totalPlan) + '</td>';
  h += '<td class="cell-money" style="color:var(--green)">' + _planFmtMoney(totalFact) + '</td>';
  h += '<td class="cell-money ' + totalDiffCls + '">' + totalDiffPrefix + _planFmtMoney(totalDiff) + '</td>';
  h += '<td></td><td></td>';
  h += '</tr></tfoot></table></div>';
  return h;
}

/* ─── Footer ─── */
function _planRenderFooter() {
  var totalPlan = 0, totalFact = 0;
  _plan.rows.forEach(function(r) { totalPlan += r.plan; totalFact += r.fact; });
  var diff = totalFact - totalPlan;
  var diffCls = diff >= 0 ? 'val-diff-pos' : 'val-diff-neg';
  var diffPrefix = diff >= 0 ? '+ ' : '';

  var h = '<div class="plan-footer">';
  h += '<div class="plan-footer-comment"><label>Комментарий к документу</label>';
  h += '<textarea onchange="_plan.docComment=this.value;_plan.dirty=true" placeholder="Общие примечания к плану за период...">' + esc(_plan.docComment) + '</textarea></div>';
  h += '<div class="plan-footer-totals">';
  h += '<div class="plan-total-item"><span class="plan-total-label">Итого план:</span><span class="plan-total-value val-plan">' + _planFmtMoney(totalPlan) + '</span></div>';
  h += '<div class="plan-total-item"><span class="plan-total-label">Факт:</span><span class="plan-total-value val-fact">' + _planFmtMoney(totalFact) + '</span></div>';
  h += '<div class="plan-total-item"><span class="plan-total-label">Разница:</span><span class="plan-total-value ' + diffCls + '">' + diffPrefix + _planFmtMoney(diff) + '</span></div>';
  h += '</div></div>';
  return h;
}

/* ─── Admin Modal ─── */
function _planRenderAdminModal() {
  var h = '<div class="modal-overlay' + (_plan.adminOpen ? ' open' : '') + '" id="planAdminModal" onclick="if(event.target===this)_planCloseAdmin()">';
  h += '<div class="modal">';
  h += '<div class="modal-header"><span class="modal-title">&#9881; Админка — Ставки разработчиков</span><button class="modal-close" onclick="_planCloseAdmin()">&times;</button></div>';
  h += '<div class="modal-body"><div class="admin-cards-grid">';

  if (typeof ACTIVE_DEV_IDS !== 'undefined') {
    ACTIVE_DEV_IDS.forEach(function(id) {
      var name = prGetDevName(String(id));
      var rate = prGetRate(String(id));
      var clientRate = prGetClientRate(String(id));
      var base = prGetBase(String(id));
      var fine = (typeof prGetFine === 'function') ? prGetFine(String(id)) : 0;
      var initials = name.split(' ').map(function(w) { return w[0]; }).join('');

      h += '<div class="admin-card">';
      h += '<div class="admin-card-hdr"><div class="admin-card-avatar">' + esc(initials) + '</div><div class="admin-card-name">' + esc(name) + '</div></div>';
      h += '<div class="admin-card-fields">';
      h += '<div class="admin-field"><label>Ставка разраб. (р/ч)</label><input class="admin-input input-rate" type="number" value="' + rate + '" data-dev="' + id + '" data-field="rate"></div>';
      h += '<div class="admin-field"><label>Ставка клиента (р/ч)</label><input class="admin-input input-client-rate" type="number" value="' + clientRate + '" data-dev="' + id + '" data-field="clientRate"></div>';
      h += '<div class="admin-field"><label>Базовая / Оклад</label><input class="admin-input" type="number" value="' + base + '" data-dev="' + id + '" data-field="base"></div>';
      h += '<div class="admin-field"><label>Штраф</label><input class="admin-input" type="number" value="' + fine + '" data-dev="' + id + '" data-field="fine" style="color:rgba(255,110,120,.9)"></div>';
      h += '</div></div>';
    });
  }

  h += '</div></div>';
  h += '<div class="modal-footer">';
  h += '<button class="plan-btn plan-btn-ghost" onclick="_planCloseAdmin()">Отмена</button>';
  h += '<button class="plan-btn plan-btn-green" onclick="_planSaveAdminRates()">Сохранить ставки</button>';
  h += '</div></div></div>';
  return h;
}

/* ═══════════════════════════════════════════════════════════════
   ОБРАБОТЧИКИ
   ═══════════════════════════════════════════════════════════════ */
function _planOnFactChange(el) {
  var idx = parseInt(el.getAttribute('data-idx'));
  var raw = el.value.replace(/[^\d.,-]/g, '').replace(',', '.');
  var val = parseFloat(raw) || 0;
  if (idx >= 0 && idx < _plan.rows.length) {
    _plan.rows[idx].fact = val;
    _plan.dirty = true;
    _planRenderAll();
  }
}

function _planOnCommentChange(el) {
  var idx = parseInt(el.getAttribute('data-idx'));
  if (idx >= 0 && idx < _plan.rows.length) {
    _plan.rows[idx].comment = el.value;
    _plan.dirty = true;
  }
}

function _planAddRow() {
  var lastDate = _plan.rows.length > 0 ? _plan.rows[_plan.rows.length - 1].date : '01.01.2026';
  _plan.rows.push({ date: lastDate, plan: _planCalcDailyPlan(), fact: 0, comment: '', isWeekend: false });
  _plan.dirty = true;
  _planRenderAll();
}

function _planFilterRows(query) {
  var rows = document.querySelectorAll('#planTableBody tr');
  var q = query.toLowerCase();
  rows.forEach(function(tr) {
    var text = tr.textContent.toLowerCase();
    tr.style.display = !q || text.indexOf(q) >= 0 ? '' : 'none';
  });
}

function _planOnPeriodChange(val) {
  var parts = val.split('-');
  _plan.period = { year: parseInt(parts[0]), month: parseInt(parts[1]) };
  prCurrentPeriod.year = _plan.period.year;
  prCurrentPeriod.month = _plan.period.month;
  _planLoadData();
  _planRenderAll();
}

function _planSave() {
  _planSaveData();
  _planRenderAll();
}

function _planSaveClose() {
  _planSaveData();
  /* Переключаемся на Обзор */
  if (typeof switchTab === 'function') switchTab(0);
}

function _planPost() {
  _planSaveData();
  _planRenderAll();
}

function _planOpenAdmin() {
  _plan.adminOpen = true;
  _planRenderAll();
}

function _planCloseAdmin() {
  _plan.adminOpen = false;
  _planRenderAll();
}

function _planSaveAdminRates() {
  var inputs = document.querySelectorAll('#planAdminModal .admin-input');
  inputs.forEach(function(inp) {
    var devId = inp.getAttribute('data-dev');
    var field = inp.getAttribute('data-field');
    var val = parseFloat(inp.value) || 0;
    var settings = (typeof prLoadDevSettings === 'function') ? prLoadDevSettings(devId) : {};
    if (!settings) settings = {};
    settings[field] = val;
    if (typeof prSaveDevSettings === 'function') prSaveDevSettings(devId, settings);
  });
  _plan.adminOpen = false;
  _plan.dirty = true;
  /* Пересчитать план на день */
  var newDaily = _planCalcDailyPlan();
  _plan.rows.forEach(function(r) { r.plan = newDaily; });
  _planRenderAll();
}

/* ═══════════════════════════════════════════════════════════════
   УТИЛИТЫ
   ═══════════════════════════════════════════════════════════════ */
function _planFmtMoney(n) {
  var neg = n < 0;
  var abs = Math.abs(n);
  var str = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return neg ? ('- ' + str) : str;
}

function _planGetDayName(dateStr) {
  var parts = dateStr.split('.');
  var d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  var days = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  return days[d.getDay()];
}

function _planIsoDate(ruDateStr) {
  /* DD.MM.YYYY HH:MM:SS → YYYY-MM-DDTHH:MM */
  var m = ruDateStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s*(\d{2}):(\d{2})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4] + ':' + m[5];
  return '';
}
