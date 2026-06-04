/* ═══════════════════════════════════════════════════════════════
   pr-cards.js — CardsService

   Модуль рендеринга: KPI, heatmap, фильтры, карточки, таблица,
   футер, отладка, хелперы.

   Зависимости: _pr (state), esc, truncate, safeRound,
   getFirstName, prGetRate, prGetBase, prGetFine, prGetClientRate,
   prGetDevName, prGetFineComment, prGetProjectServiceIncome,
   sumReviewField, APP_VERSION, HOOK, DEVELOPERS, PROJECTS,
   ACTIVE_DEV_IDS, DEV_IDS, EXCLUDE_GROUPS, EXCLUDED_DEV_IDS,
   PR_DOMAIN_VERSION, PR_PERIOD_STATUS_LABELS,
   PayrollCache, _prStorage, verifySnapshotIntegrity,
   _prScheduleRender, _prRenderAll
   ═══════════════════════════════════════════════════════════════ */

var PR_CARDS_VERSION = '1.0.0';

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
   KPI КАРТОЧКИ (top overview)
   ═══════════════════════════════════════════════════════════════ */
function _prRenderKPIs() {
  if (!_pr.totals) return '';
  var t = _pr.totals;
  var rm = _pr.roleMode;
  var h = '<div class="pr-kpi-grid">';

  /* Phase 5: KPIs зависят от режима */
  if (rm === 'dev') {
    h += _prKpiCard('Факт часы', t.totalFactHours.toFixed(1), 'var(--accent)', t.totalTasks + ' задач');
    h += _prKpiCard('Опл. клиента', t.totalBillable.toFixed(1), 'var(--green)', t.approvedTasks + ' подтв.');
    h += _prKpiCard('К выплате', t.totalPayroll.toFixed(1), 'var(--yellow)', t.pendingTasks + ' ожидает');
    h += _prKpiCard('Сумма выплат', _prFmtMoney(t.totalPayrollAmount), 'var(--orange)', t.disputedTasks + ' споров');
  } else if (rm === 'fin') {
    h += _prKpiCard('Факт часы', t.totalFactHours.toFixed(1), 'var(--accent)', t.totalTasks + ' задач');
    h += _prKpiCard('Опл. клиента', t.totalBillable.toFixed(1), 'var(--green)', t.approvedTasks + ' подтв.');
    var finTotalRevenue = (t.totalClientRevenue || 0) + (t.totalServiceIncome || 0);
    h += _prKpiCard('Выручка', _prFmtMoney(finTotalRevenue), 'var(--cyan)', (t.totalServiceIncome || 0) > 0 ? 'клиент + доп. доход' : 'от клиента');
    h += _prKpiCard('Затраты', _prFmtMoney(t.totalPayrollAmount), 'var(--orange)', 'ЗП + баз.');
    if ((t.totalServiceIncome || 0) > 0) {
      h += _prKpiCard('Доп. доход', '+' + _prFmtMoney(t.totalServiceIncome || 0), 'var(--green)', (t.serviceProjectCount || 0) + ' проектов');
    }
    var finFines = t.totalFine || 0;
    var finMargin = finTotalRevenue > 0
      ? safeRound((finTotalRevenue - t.totalPayrollAmount + finFines) / finTotalRevenue * 100, 0)
      : 0;
    var finMarginCls = finMargin >= 0 ? 'var(--green)' : 'var(--red)';
    var finMarginRub = safeRound(finTotalRevenue - t.totalPayrollAmount + finFines, 0);
    h += _prKpiCard('Маржа', (finMargin >= 0 ? '+' : '') + finMargin + '%', finMarginCls, _prFmtMoney(finMarginRub) + ' р');
  } else if (rm === 'audit') {
    h += _prKpiCard('Факт часы', t.totalFactHours.toFixed(1), 'var(--accent)', t.totalTasks + ' задач');
    h += _prKpiCard('Опл. клиента', t.totalBillable.toFixed(1), 'var(--green)', t.approvedTasks + ' подтв.');
    var auditFines = t.totalFine || 0;
    var auditMargin = (t.totalClientRevenue || 0) > 0
      ? safeRound(((t.totalClientRevenue || 0) - t.totalPayrollAmount + auditFines) / (t.totalClientRevenue || 0) * 100, 0)
      : 0;
    var auditMarginCls = auditMargin >= 0 ? 'var(--green)' : 'var(--red)';
    h += _prKpiCard('Маржа', (auditMargin >= 0 ? '+' : '') + auditMargin + '%', auditMarginCls, 'прибыльность');
    var sourceLabel = _pr.modelSource === 'live' ? 'живые данные' : _pr.modelSource;
    h += _prKpiCard('Источник', sourceLabel, 'var(--cyan)', _pr.snapshotId ? 'снимок ' + _pr.snapshotId.substring(0, 12) : 'без снимка');
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

    /* Phase 6: title tooltip с полной информацией */
    var tooltipParts = [firstName + ': ' + dev.totalFactHours.toFixed(0) + 'h'];
    tooltipParts.push('Billable: ' + dev.totalBillable.toFixed(1) + 'h');
    tooltipParts.push('Маржа: ' + marginTxt);
    if (risks.length > 0) tooltipParts.push('Риски: ' + risks.join(', '));
    var tooltipText = esc(tooltipParts.join(' | '));

    h += '<div class="pr-heatmap-chip" onclick="_prScrollToDev(\'' + esc(dev.developerId) + '\')" title="' + tooltipText + '">';
    h += '<span class="pr-heatmap-dot ' + riskLevel + '"></span>';
    h += '<span class="pr-heatmap-name">' + esc(firstName) + '</span>';
    h += '<span class="pr-heatmap-hours">' + dev.totalFactHours.toFixed(0) + 'h</span>';
    /* Phase 6: Margin показываем только в Фин./Аудит режиме */
    if (_pr.roleMode === 'fin' || _pr.roleMode === 'audit') {
      h += '<span class="pr-heatmap-margin ' + marginCls + '">' + marginTxt + '</span>';
    }
    /* Phase 6: Risk badge убран из чипа, перенесён в title tooltip */
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

  /* v7.1.0: Диагностика — логируем какие разработчики рендерятся */
  console.log('[PR] _prRenderDevCards: projection=' + _pr.projection.length +
    ', filtered=' + filtered.length +
    ', filters=' + JSON.stringify(_pr.filters));
  filtered.forEach(function(dev) {
    console.log('[PR]   Рендер: ' + dev.developerName +
      ' (id=' + dev.developerId + ', fact=' + dev.totalFactHours.toFixed(1) +
      'h, base=' + (dev.totalBase || 0) + ', amount=' + dev.totalAmount + ')');
  });

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

  /* Step 2: Add missing active developers with 0 hours */
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
      var clientRate = (typeof prGetClientRate === 'function') ? prGetClientRate(devId) : 0;
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
        clientRate: clientRate,
        clientRevenue: 0,
        margin: -baseSalary + fine,
        marginPct: 0,
        projectCount: 0,
        projectNames: '',
        projects: {}
      });
      missingCount++;
    }
  });
  if (missingCount > 0) {
    console.log('[PR] _prEnsureAllDevsInProjection: добавлено ' + missingCount + ' разработчиков с 0 часов');
    /* Лог добавленных разработчиков */
    activeIds.forEach(function(id) {
      var devId = String(id);
      if (!existingDevs[devId]) {
        var base = (typeof prGetBase === 'function') ? prGetBase(devId) : 0;
        console.log('[PR]   Добавлен: ' + prGetDevName(devId) + ' (id=' + devId + ', base=' + base + ')');
      }
    });
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
    /* v7.1.0: Разработчики с baseSalary > 0 или payrollAmount > 0
       ВСЕГДА видимы, даже если у них 0 часов.
       Без этого фильтр по проекту/статусу скрывает Предеина и др. */
    var hasVisiblePayroll = dev.totalBase > 0 || dev.totalAmount > 0;
    var hasRows = false;
    _pr.rows.forEach(function(r) {
      if (String(r.developerId) === String(dev.developerId)) hasRows = true;
    });

    if (f.developer && String(dev.developerId) !== String(f.developer)) return false;
    if (f.project) {
      /* Check if this developer has tasks in this project */
      var hasProject = false;
      _pr.rows.forEach(function(r) {
        if (String(r.developerId) === String(dev.developerId) && String(r.projectId) === String(f.project)) {
          hasProject = true;
        }
      });
      /* v7.1.0: Разработчики с baseSalary > 0 всегда проходят проектный фильтр */
      if (!hasProject && !hasVisiblePayroll) return false;
    }
    if (f.status) {
      /* Check if this developer has tasks with this status */
      var hasStatus = false;
      _pr.rows.forEach(function(r) {
        if (String(r.developerId) === String(dev.developerId) && r.reviewStatus === f.status) {
          hasStatus = true;
        }
      });
      /* v7.1.0: Разработчики с baseSalary > 0 всегда проходят статусный фильтр */
      if (!hasStatus && !hasVisiblePayroll) return false;
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
  var rm = _pr.roleMode;
  var showFinancial = (rm === 'fin' || rm === 'audit');
  var showAudit = (rm === 'audit');

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
  /* Phase 5: показываем ставку клиента только в Фин./Аудит */
  if (showFinancial) {
    var clientRate = prGetClientRate(dev.developerId);
    h += '<div class="pr-card-role">' + rate + ' р/ч | клиент: ' + clientRate + ' р/ч</div>';
  } else {
    h += '<div class="pr-card-role">' + rate + ' р/ч</div>';
  }
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
  h += '<div class="pr-kpi-money-label">Затраты</div>';
  /* Breakdown: задачи + базовая, штрафы отдельно (идут в прибыль) */
  var taskSum = dev.totalAmount - (dev.totalBase || 0);
  var baseVal = dev.totalBase || 0;
  var fineVal = dev.totalFine || 0;
  h += '<div style="font-family:var(--mono);font-size:8px;color:var(--text3);margin-top:2px;line-height:1.4">';
  h += _prFmtMoney(taskSum) + ' по задачам';
  if (baseVal > 0) h += ' + <span style="color:var(--green)">' + _prFmtMoney(baseVal) + ' ЗП/Бонус</span>';
  if (fineVal > 0) h += ' | <span style="color:var(--yellow)">' + _prFmtMoney(fineVal) + ' штраф → прибыль</span>';
  h += '</div>';
  h += '</div>';
  h += '</div>';

  /* ─── SECONDARY METRICS (L2) — Phase 5: зависит от режима ─── */
  h += '<div class="pr-card-secondary">';
  h += '<div class="pr-sec-item primary-sec"><span class="pr-sec-label">Billable</span><span class="pr-sec-val billable">' + dev.totalBillable.toFixed(1) + 'h</span></div>';
  h += '<div class="pr-sec-divider"></div>';
  /* Phase 5: Cut показываем всегда, но в Разраб без цвета */
  if (cutHours > 0) {
    h += '<div class="pr-sec-item primary-sec"><span class="pr-sec-label">Cut</span><span class="pr-sec-val cut">-' + cutHours.toFixed(1) + 'h</span></div>';
  } else {
    h += '<div class="pr-sec-item primary-sec"><span class="pr-sec-label">Cut</span><span class="pr-sec-val" style="color:var(--text3)">0h</span></div>';
  }
  /* Phase 5: Margin показываем только в Фин./Аудит */
  if (showFinancial) {
    h += '<div class="pr-sec-divider"></div>';
    var marginCls = marginPct >= 0 ? 'margin-pos' : 'margin-neg';
    h += '<div class="pr-sec-item"><span class="pr-sec-label">Margin</span><span class="pr-sec-val ' + marginCls + '">' + (marginPct >= 0 ? '+' : '') + marginPct + '%</span></div>';
  }
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

  /* Phase 5: Margin progress bar — только в Фин./Аудит */
  if (showFinancial) {
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
    risks.forEach(function(risk) {
      var riskCls2 = 'risk-' + risk.toLowerCase().replace(/\s+/g, '');
      h += '<span class="pr-risk-pill ' + riskCls2 + '">' + risk + '</span>';
    });
    h += '</div>';
  }

  /* Phase 5: Аудит инфо — только в режиме Аудит */
  if (showAudit) {
    h += '<div style="font-family:var(--mono);font-size:8px;color:var(--text3);margin-bottom:8px;padding:6px 8px;background:rgba(0,212,255,.04);border:1px solid rgba(0,212,255,.1);border-radius:4px">';
    h += '<div>Источник: ' + esc(_pr.modelSource || 'live') + '</div>';
    h += '<div>Версия: ' + APP_VERSION + '</div>';
    h += '<div>Контрольная сумма: ' + esc(_pr.snapshotChecksum || 'нет') + '</div>';
    h += '<div>Снимок: ' + esc(_pr.snapshotId || 'нет') + '</div>';
    h += '</div>';
  }

  h += '</div>'; /* end .pr-card-inner */

  /* ─── FOOTER METRICS ─── */
  h += '<div class="pr-card-footer">';
  h += '<div class="pr-footer-metric"><div class="pr-footer-val">' + dev.taskCount + '</div><div class="pr-footer-label">Задач</div></div>';
  h += '<div class="pr-footer-metric"><div class="pr-footer-val">' + avgPerTask.toFixed(1) + 'h</div><div class="pr-footer-label">Ср/зад</div></div>';
  h += '<div class="pr-footer-metric"><div class="pr-footer-val">' + weekendH.toFixed(0) + '</div><div class="pr-footer-label">Выходн</div></div>';
  h += '<div class="pr-footer-metric"><div class="pr-footer-val">' + overtimeH.toFixed(0) + '</div><div class="pr-footer-label">Сверхур</div></div>';
  /* Штраф в футере, если есть */
  if (fineVal > 0) {
    var fineComment = prGetFineComment(dev.developerId);
    h += '<div class="pr-footer-metric" style="color:var(--red)"><div class="pr-footer-val" style="color:var(--red)">-' + _prFmtMoney(fineVal) + '</div><div class="pr-footer-label" style="color:var(--red)">Штраф' + (fineComment ? ' (' + esc(truncate(fineComment, 15)) + ')' : '') + '</div></div>';
  }
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
  if (!rate || rate <= 0) risks.push('RATE=0');
  if (dev.pendingCount > 0 && dev.approvedCount === 0) risks.push('UNREVIEWED');
  if (marginPct < 0) risks.push('NEGATIVE MARGIN');

  return risks;
}

function _prCalcMarginPct(dev) {
  if (dev.totalBillable <= 0) return 0;
  var clientRate = prGetClientRate(dev.developerId) || 0;
  var clientRevenue = dev.totalBillable * clientRate;
  /* v5.4: Добавляем доп. доход от проектов */
  var serviceIncome = dev.serviceIncome || 0;
  if (!serviceIncome && typeof prGetProjectServiceIncome === 'function') {
    var devProjects = dev.projects ? Object.keys(dev.projects) : [];
    devProjects.forEach(function(pid) {
      serviceIncome += prGetProjectServiceIncome(pid);
    });
  }
  /* Затраты = totalAmount (taskEarnings + base, БЕЗ штрафов)
     Штрафы идут обратно в прибыль */
  var payrollCost = dev.totalAmount;
  var fineBack = dev.totalFine || 0;
  if (clientRevenue <= 0 && serviceIncome <= 0) return 0;
  var totalRevenue = clientRevenue + serviceIncome;
  if (totalRevenue <= 0) return 0;
  return safeRound((totalRevenue - payrollCost + fineBack) / totalRevenue * 100, 0);
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
  /* STABILIZATION: Full deterministic render instead of partial card patching */
  _prRenderAll();
}

/* ═══════════════════════════════════════════════════════════════
   STICKY FINANCIAL FOOTER — ETAP 5
   ═══════════════════════════════════════════════════════════════ */
function _prRenderFinFooter() {
  if (!_pr.totals) return '';
  var t = _pr.totals;
  var clientRevenue = t.totalClientRevenue || 0;
  var serviceIncome = t.totalServiceIncome || 0;
  var totalRevenue = clientRevenue + serviceIncome;
  var fines = t.totalFine || 0;
  var marginPct = totalRevenue > 0
    ? safeRound((totalRevenue - t.totalPayrollAmount + fines) / totalRevenue * 100, 0)
    : 0;
  var marginCls = marginPct >= 0 ? 'margin-pos' : 'margin-neg';
  var marginRub = safeRound(totalRevenue - t.totalPayrollAmount + fines, 0);

  var h = '<div class="pr-fin-footer">';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Факт часы</div><div class="pr-fin-val fact">' + t.totalFactHours.toFixed(1) + '</div></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Billable</div><div class="pr-fin-val billable">' + t.totalBillable.toFixed(1) + '</div></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Выручка</div><div class="pr-fin-val" style="color:var(--cyan)">' + _prFmtMoney(totalRevenue) + '</div></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Затраты</div><div class="pr-fin-val" style="color:var(--orange)">' + _prFmtMoney(t.totalPayrollAmount) + '</div></div>';
  if (serviceIncome > 0) {
    h += '<div class="pr-fin-item"><div class="pr-fin-label">Доп. доход</div><div class="pr-fin-val" style="color:var(--green)">+' + _prFmtMoney(serviceIncome) + '</div></div>';
  }
  if (fines > 0) {
    h += '<div class="pr-fin-item"><div class="pr-fin-label">Штрафы</div><div class="pr-fin-val" style="color:var(--yellow)">+' + _prFmtMoney(fines) + '</div></div>';
  }
  h += '<div class="pr-fin-spacer"></div>';
  h += '<div class="pr-fin-item"><div class="pr-fin-label">Маржа</div><div class="pr-fin-val ' + marginCls + '">' + (marginPct >= 0 ? '+' : '') + marginPct + '% <span style="font-size:9px;color:var(--text3)">(' + _prFmtMoney(marginRub) + ')</span></div></div>';
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
    /* v5.4: Compact inline editor with preset buttons + slider */
    h += '<td class="c-num"><div class="pr-hours-editor pr-hours-editor-table">';
    h += '<div style="display:flex;gap:2px;margin-bottom:2px">';
    h += '<button class="pr-preset-btn" onclick="event.stopPropagation();_prPresetHoursTable(' + idx + ',1)">100%</button>';
    h += '<button class="pr-preset-btn" onclick="event.stopPropagation();_prPresetHoursTable(' + idx + ',0.5)">50%</button>';
    h += '<button class="pr-preset-btn" onclick="event.stopPropagation();_prPresetHoursTable(' + idx + ',0)">0%</button>';
    h += '</div>';
    h += '<div style="display:flex;align-items:center;gap:3px">';
    h += '<input type="range" class="pr-hours-slider" min="0" max="' + r.factHours + '" step="0.5" value="' + r.billableHours + '" oninput="_prSliderBillableTable(this,' + idx + ')" style="flex:1;width:50px">';
    h += '<span style="font-family:var(--mono);font-size:9px;min-width:30px">' + r.billableHours.toFixed(1) + '</span>';
    h += '</div>';
    h += '</div></td>';

    var payChanged = r.payrollHours !== r.factHours;
    h += '<td class="c-num"><div class="pr-hours-editor pr-hours-editor-table">';
    h += '<div style="display:flex;align-items:center;gap:3px">';
    h += '<input type="range" class="pr-hours-slider" min="0" max="' + r.billableHours + '" step="0.5" value="' + r.payrollHours + '" oninput="_prSliderPayrollTable(this,' + idx + ')" style="flex:1;width:70px">';
    h += '<span style="font-family:var(--mono);font-size:9px;min-width:30px;color:var(--yellow)">' + r.payrollHours.toFixed(1) + '</span>';
    h += '</div>';
    h += '</div></td>';

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
  h += '<div class="pr-debug-title">ОТЛАДКА (ЖИВОЙ)</div>';
  h += '<div class="pr-debug-row">Версия: ' + APP_VERSION + '</div>';
  h += '<div class="pr-debug-row">Pipeline: activity-filtered v7.0.0 (DATE_ACTIVITY)</div>';

  /* v7.0.0: Before/After pipeline metrics */
  if (_pr.data && _pr.data._metrics) {
    var m = _pr.data._metrics;
    var loadTimeSec = m.loadEndMs > 0 ? ((m.loadEndMs - m.loadStartMs) / 1000).toFixed(1) : '?';
    h += '<div class="pr-debug-row" style="color:var(--cyan);font-weight:600">PIPELINE v7.0.0 METRICS:</div>';
    h += '<div class="pr-debug-row">Задачи: ДО=' + m.oldTasksLoaded + ' → ПОСЛЕ=' + m.newTasksLoaded +
      ' (-' + Math.round((1 - m.newTasksLoaded / m.oldTasksLoaded) * 100) + '%)</div>';
    h += '<div class="pr-debug-row">Elapsed checks: ДО=' + m.oldElapsedChecks + ' → ПОСЛЕ=' + m.newElapsedChecks +
      ' (-' + Math.round((1 - m.newElapsedChecks / m.oldElapsedChecks) * 100) + '%)</div>';
    h += '<div class="pr-debug-row">API calls: ДО=' + m.oldApiCalls + ' → ПОСЛЕ=' + m.newApiCalls +
      ' (-' + Math.round((1 - m.newApiCalls / m.oldApiCalls) * 100) + '%)</div>';
    h += '<div class="pr-debug-row">Load time: ДО=минуты → ПОСЛЕ=' + loadTimeSec + 'с</div>';
  }

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
  h += '<div class="pr-debug-row">Режим: ЖИВОЙ (Bitrix24 API)</div>';
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

/* ═══════════════════════════════════════════════════════════════
   Phase 7: ДИАГНОСТИЧЕСКАЯ ПАНЕЛЬ
   ═══════════════════════════════════════════════════════════════ */
function _prRenderDiagnostics() {
  var isOpen = _pr._diagnosticsOpen;
  var h = '<div class="pr-diag-panel">';
  h += '<div class="pr-diag-header" onclick="_prToggleDiagnostics()">';
  h += '<span class="pr-diag-title">ДИАГНОСТИКА</span>';
  h += '<span class="pr-diag-toggle">' + (isOpen ? '▲' : '▼') + '</span>';
  h += '</div>';

  if (!isOpen) {
    h += '</div>';
    return h;
  }

  h += '<div class="pr-diag-body">';

  /* Timing */
  var p = _pr._perf;
  var loadMs = p.loadEnd > 0 ? (p.loadEnd - p.loadStart) : 0;
  var normMs = p.normEnd > 0 ? (p.normEnd - p.normStart) : 0;
  var renderMs = p.renderEnd > 0 ? (p.renderEnd - p.renderStart) : 0;
  h += '<div class="pr-diag-section">';
  h += '<div class="pr-diag-section-title">Тайминг</div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Load</span><span class="pr-diag-val">' + loadMs + ' ms</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Norm</span><span class="pr-diag-val">' + normMs + ' ms</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Render</span><span class="pr-diag-val">' + renderMs + ' ms</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Total</span><span class="pr-diag-val" style="color:var(--cyan)">' + (loadMs + normMs + renderMs) + ' ms</span></div>';
  h += '</div>';

  /* Cache stats */
  h += '<div class="pr-diag-section">';
  h += '<div class="pr-diag-section-title">Кэш</div>';
  if (typeof PayrollCache !== 'undefined') {
    var cs = PayrollCache.stats();
    h += '<div class="pr-diag-row"><span class="pr-diag-key">Hits</span><span class="pr-diag-val" style="color:var(--green)">' + cs.hits + '</span></div>';
    h += '<div class="pr-diag-row"><span class="pr-diag-key">Misses</span><span class="pr-diag-val" style="color:var(--red)">' + cs.misses + '</span></div>';
    h += '<div class="pr-diag-row"><span class="pr-diag-key">Stale</span><span class="pr-diag-val" style="color:var(--yellow)">' + cs.staleHits + '</span></div>';
    h += '<div class="pr-diag-row"><span class="pr-diag-key">Rate</span><span class="pr-diag-val">' + cs.hitRate + '</span></div>';
    h += '<div class="pr-diag-row"><span class="pr-diag-key">Keys in memory</span><span class="pr-diag-val">' + cs.memoryKeys + '</span></div>';
  } else {
    h += '<div class="pr-diag-row">PayrollCache не загружен</div>';
  }
  h += '</div>';

  /* Projection */
  h += '<div class="pr-diag-section">';
  h += '<div class="pr-diag-section-title">Данные</div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Projection rebuilds</span><span class="pr-diag-val">' + p.projectionRebuilds + '</span></div>';
  /* Timeline DOM count */
  var tlDomCount = 0;
  var tlEls = document.querySelectorAll('.pr-tl-item');
  if (tlEls) tlDomCount = tlEls.length;
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Timeline DOM</span><span class="pr-diag-val">' + tlDomCount + '</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Task date cache</span><span class="pr-diag-val">' + Object.keys(_pr._taskDateCache).length + '</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Elapsed records</span><span class="pr-diag-val">' + ((_pr.data && _pr.data.elapsed) ? _pr.data.elapsed.length : 0) + '</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Review rows</span><span class="pr-diag-val">' + _pr.rows.length + '</span></div>';
  h += '</div>';

  /* Mode & status */
  h += '<div class="pr-diag-section">';
  h += '<div class="pr-diag-section-title">Состояние</div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Режим</span><span class="pr-diag-val">' + _pr.roleMode + '</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Кэш статус</span><span class="pr-diag-val">' + (_pr._cacheBadge || 'нет') + '</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Вид</span><span class="pr-diag-val">' + _pr.viewMode + ' / ' + _pr.densityMode + '</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Период</span><span class="pr-diag-val">' + prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0') + '</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Статус периода</span><span class="pr-diag-val">' + esc(_pr.periodStatus) + '</span></div>';
  h += '<div class="pr-diag-row"><span class="pr-diag-key">Источник</span><span class="pr-diag-val">' + esc(_pr.modelSource || 'live') + '</span></div>';
  h += '</div>';

  h += '</div>'; /* end .pr-diag-body */
  h += '</div>'; /* end .pr-diag-panel */
  return h;
}
