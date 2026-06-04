/* ═══════════════════════════════════════════════════════════════
   pr-review.js — ReviewService

   Модуль обработки ревью: статусы, часы, слайдеры, пресеты,
   сохранение, подтверждение, сортировка, фильтры.

   Владеет state: dirty, sortField, sortDir, filters,
   expandedTaskEdit

   Зависимости: _pr (state), _prRebuildAndRender, _prScheduleRender,
   _prSaveReviews, _prLoadReviews, _prSavePeriodState,
   _prAppendAuditLog, _prStorage, _prSaveFilters,
   updateReviewField, transitionReviewStatus, approveAllPending,
   sortReviews, serializeReviews, createPeriodSnapshot,
   isPeriodSnapshotImmutable, prCurrentPeriod, prGetPeriodKey,
   PR_PERIOD_STATUS_LABELS, PayrollCache, PayrollEvents
   ═══════════════════════════════════════════════════════════════ */

var PR_REVIEW_VERSION = '1.0.0';

/* ═══════════════════════════════════════════════════════════════
   ФИЛЬТРЫ
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   INLINE EDITING
   ═══════════════════════════════════════════════════════════════ */
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

  _prRebuildAndRender({ source: 'onEdit' });
}

/* ═══════════════════════════════════════════════════════════════
   STATUS CYCLING
   ═══════════════════════════════════════════════════════════════ */
function _prCycleStatus(idx) {
  if (idx < 0 || idx >= _pr.rows.length) return;

  if (typeof isPeriodSnapshotImmutable === 'function' &&
      isPeriodSnapshotImmutable(_pr.periodStatus)) {
    return;
  }

  var realIdx = idx;

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

  _prRebuildAndRender({ source: 'cycleStatus' });
}

/* ═══════════════════════════════════════════════════════════════
   SORTING
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   SAVE ALL
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   APPROVE ALL
   ═══════════════════════════════════════════════════════════════ */
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

  _prRebuildAndRender({ source: 'approveAll' });
  /* Stage 12: Invalidate data cache on review approve */
  if (typeof PayrollCache !== 'undefined') {
    var pk = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    PayrollCache.invalidate('data:' + pk);
  }
  _prScheduleRender();
}

/* ═══════════════════════════════════════════════════════════════
   TASK EDIT TOGGLE
   ═══════════════════════════════════════════════════════════════ */
function _prToggleTaskEdit(editKey) {
  _pr.expandedTaskEdit[editKey] = !_pr.expandedTaskEdit[editKey];
  _prScheduleRender();
}

/* ═══════════════════════════════════════════════════════════════
   PRESET HOURS — кнопки быстрого выставления часов
   ═══════════════════════════════════════════════════════════════ */

/* v5.4: Preset hours buttons for timeline */
function _prPresetHours(editKey, realIdx, pct) {
  if (realIdx < 0 || realIdx >= _pr.rows.length) return;
  var fact = _pr.rows[realIdx].factHours;
  var newBill = safeRound(fact * pct, 1);
  var newPay = newBill;
  _pr.rows[realIdx].billableHours = newBill;
  _pr.rows[realIdx].payrollHours = newPay;
  _pr.rows[realIdx].payrollAmount = Math.round(newPay * _pr.rows[realIdx].rate);
  _prRebuildAndRender({ invalidateCache: true, source: 'presetHours' });
}

/* v5.4: Preset hours buttons for table view */
function _prPresetHoursTable(idx, pct) {
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;
  var row = filtered[idx];
  var rIdx = _pr.rows.indexOf(row);
  if (rIdx < 0) return;
  var fact = _pr.rows[rIdx].factHours;
  var newBill = safeRound(fact * pct, 1);
  var newPay = newBill;
  _pr.rows[rIdx].billableHours = newBill;
  _pr.rows[rIdx].payrollHours = newPay;
  _pr.rows[rIdx].payrollAmount = Math.round(newPay * _pr.rows[rIdx].rate);
  _prRebuildAndRender({ invalidateCache: true, source: 'presetHoursTable' });
}

/* ═══════════════════════════════════════════════════════════════
   SLIDER HANDLERS
   ═══════════════════════════════════════════════════════════════ */

/* v5.4: Slider handlers for timeline */
function _prSliderBillable(slider, realIdx) {
  if (realIdx < 0 || realIdx >= _pr.rows.length) return;
  var val = parseFloat(slider.value) || 0;
  _pr.rows[realIdx].billableHours = val;
  if (_pr.rows[realIdx].payrollHours > val) {
    _pr.rows[realIdx].payrollHours = val;
  }
  _pr.rows[realIdx].payrollAmount = Math.round(_pr.rows[realIdx].payrollHours * _pr.rows[realIdx].rate);
  _prRebuildAndRender({ invalidateCache: true, source: 'sliderBillable' });
}

function _prSliderPayroll(slider, realIdx) {
  if (realIdx < 0 || realIdx >= _pr.rows.length) return;
  var val = parseFloat(slider.value) || 0;
  _pr.rows[realIdx].payrollHours = val;
  _pr.rows[realIdx].payrollAmount = Math.round(val * _pr.rows[realIdx].rate);
  _prRebuildAndRender({ invalidateCache: true, source: 'sliderPayroll' });
}

/* v5.4: Slider handlers for table view */
function _prSliderBillableTable(slider, idx) {
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;
  var row = filtered[idx];
  var rIdx = _pr.rows.indexOf(row);
  if (rIdx < 0) return;
  var val = parseFloat(slider.value) || 0;
  _pr.rows[rIdx].billableHours = val;
  if (_pr.rows[rIdx].payrollHours > val) {
    _pr.rows[rIdx].payrollHours = val;
  }
  _pr.rows[rIdx].payrollAmount = Math.round(_pr.rows[rIdx].payrollHours * _pr.rows[rIdx].rate);
  _prRebuildAndRender({ invalidateCache: true, source: 'sliderBillableTable' });
}

function _prSliderPayrollTable(slider, idx) {
  var filtered = _prGetFilteredRows();
  if (idx < 0 || idx >= filtered.length) return;
  var row = filtered[idx];
  var rIdx = _pr.rows.indexOf(row);
  if (rIdx < 0) return;
  var val = parseFloat(slider.value) || 0;
  _pr.rows[rIdx].payrollHours = val;
  _pr.rows[rIdx].payrollAmount = Math.round(val * _pr.rows[rIdx].rate);
  _prRebuildAndRender({ invalidateCache: true, source: 'sliderPayrollTable' });
}

/* ═══════════════════════════════════════════════════════════════
   SOFT REFRESH — отложенный рендер без rebuild
   ═══════════════════════════════════════════════════════════════ */
function _prSoftRefresh() {
  _prRebuildAndRender({ markDirty: false, source: 'softRefresh' });
}
