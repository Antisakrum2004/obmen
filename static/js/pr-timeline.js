/* ═══════════════════════════════════════════════════════════════
   pr-timeline.js — TimelineService

   Изолированный модуль таймлайна. Отвечает за рендер
   списка задач по датам внутри карточки разработчика.

   Зависимости: _pr (state), esc, truncate, safeRound,
   _prCycleStatus, _prToggleTaskEdit, _prPresetHours,
   _prSliderBillable, _prSliderPayroll, _prStatusLabel,
   _prScheduleRender, _normParseDate, МЕСЯЦЫ_КР
   ═══════════════════════════════════════════════════════════════ */

var PR_TIMELINE_VERSION = '1.0.0';

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
  var editKey = r.taskId + '_' + r.developerId;
  var isEditOpen = _pr.expandedTaskEdit[editKey];

  var h = '<div class="pr-tl-item" style="cursor:pointer" onclick="_prToggleTaskEdit(\'' + editKey + '\')">';
  h += '<span class="pr-tl-hours">+' + r.factHours.toFixed(1) + 'h</span>';
  h += '<span class="pr-tl-task" title="' + esc(r.taskTitle) + '">' + esc(truncate(r.taskTitle, 40)) + '</span>';
  if (isCut) {
    h += '<span class="pr-tl-cut">-' + cutHours.toFixed(1) + 'h</span>';
  }
  h += '<span class="pr-tl-status ' + r.reviewStatus + '" onclick="event.stopPropagation();_prCycleStatus(' + realIdx + ')">' + _prStatusLabel(r.reviewStatus) + '</span>';
  h += '</div>';
  /* v5.4: Inline hours editor panel */
  if (isEditOpen) {
    h += '<div class="pr-hours-editor">';
    h += '<div style="display:flex;gap:4px;margin-bottom:6px">';
    h += '<button class="pr-preset-btn" onclick="event.stopPropagation();_prPresetHours(\'' + editKey + '\',' + realIdx + ',1)">100%</button>';
    h += '<button class="pr-preset-btn" onclick="event.stopPropagation();_prPresetHours(\'' + editKey + '\',' + realIdx + ',0.5)">50%</button>';
    h += '<button class="pr-preset-btn" onclick="event.stopPropagation();_prPresetHours(\'' + editKey + '\',' + realIdx + ',0)">0%</button>';
    h += '</div>';
    h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
    h += '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);min-width:70px">Опл. клиенту</span>';
    h += '<input type="range" class="pr-hours-slider" min="0" max="' + r.factHours + '" step="0.5" value="' + r.billableHours + '" oninput="event.stopPropagation();_prSliderBillable(this,' + realIdx + ')" style="flex:1">';
    h += '<span style="font-family:var(--mono);font-size:10px;color:var(--text);min-width:60px">' + r.billableHours.toFixed(1) + 'ч из ' + r.factHours.toFixed(1) + 'ч</span>';
    h += '</div>';
    h += '<div style="display:flex;align-items:center;gap:6px">';
    h += '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);min-width:70px">К выплате</span>';
    h += '<input type="range" class="pr-hours-slider" min="0" max="' + r.billableHours + '" step="0.5" value="' + r.payrollHours + '" oninput="event.stopPropagation();_prSliderPayroll(this,' + realIdx + ')" style="flex:1">';
    h += '<span style="font-family:var(--mono);font-size:10px;color:var(--yellow);min-width:60px">' + r.payrollHours.toFixed(1) + 'ч</span>';
    h += '</div>';
    h += '</div>';
  }
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
