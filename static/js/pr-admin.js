/* ═══════════════════════════════════════════════════════════════
   pr-admin.js — AdminService

   Изолированный модуль админки. Рендерит ТОЛЬКО .pr-modal-body,
   не затрагивая остальной DOM — это решает баг со скроллом.

   Ключевой принцип: после сохранения админки пересоздаётся
   только содержимое модалки, а не вся страница (_prRenderAll).

   Зависимости: _pr (state), _prRebuildAndRender, PayrollEvents,
   _prScheduleRender, _prLoadDevSettings, _prSaveDevSettings,
   prGetRate/Base/Fine/ClientRate/Inn/DevName/FineComment,
   prGetProjectServiceIncome/ServiceNote/ProjectClientRate,
   createAuditEntry, _prAppendAuditLog, esc, СТАВКА_ПО_УМОЛЧ
   ═══════════════════════════════════════════════════════════════ */

var PR_ADMIN_VERSION = '1.0.0';

/* ═══════════════════════════════════════════════════════════════
   РЕНДЕР АДМИНСКОЙ МОДАЛКИ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Полный рендер админской модалки (overlay + modal + body + footer)
 * Вызывается из _prRenderAll() как и раньше
 * @returns {String} HTML
 */
function _prRenderAdminModal() {
  if (!_pr.modalOpen) return '';
  var h = '<div class="pr-modal-overlay" onclick="_prCloseAdmin(event)">';
  h += '<div class="pr-modal" onclick="event.stopPropagation()" style="max-width:960px">';

  h += '<div class="pr-modal-header">';
  h += '<span class="pr-modal-title">&#9881; Админка</span>';
  h += '<div class="pr-admin-tabs">';
  h += '<button class="pr-admin-tab' + (_pr.adminTab === 'devs' ? ' active' : '') + '" onclick="_prSetAdminTab(\'devs\')">Разработчики</button>';
  h += '<button class="pr-admin-tab' + (_pr.adminTab === 'projects' ? ' active' : '') + '" onclick="_prSetAdminTab(\'projects\')">Проекты</button>';
  h += '</div>';
  h += '<button class="pr-modal-close" onclick="_prCloseAdmin()">&times;</button>';
  h += '</div>';

  h += '<div class="pr-modal-body" id="prAdminBody">';
  h += _prRenderAdminBody();
  h += '</div>';

  /* Sub-modal for developer detail */
  if (_pr.adminDetailDevId) {
    h += _prRenderDevDetailSubmodal();
  }

  h += '<div class="pr-modal-footer">';
  if (_pr.adminSaveMsg) {
    h += '<div style="display:flex;align-items:center;gap:6px;margin-right:auto;padding:6px 12px;background:rgba(34,212,126,.12);border:1px solid rgba(34,212,126,.3);border-radius:6px">';
    h += '<span style="color:var(--green);font-size:14px">&#10003;</span>';
    h += '<span style="font-family:var(--mono);font-size:11px;color:var(--green);font-weight:600">' + esc(_pr.adminSaveMsg) + '</span>';
    h += '</div>';
  }
  h += '<button class="pr-btn pr-btn-ghost" onclick="_prCloseAdmin()">Отмена</button>';
  h += '<button class="pr-btn pr-btn-primary" onclick="_prSaveAdmin()">Сохранить всё</button>';
  h += '</div>';

  h += '</div></div>';
  return h;
}

/**
 * Рендер содержимого .pr-modal-body (без overlay/header/footer)
 * Используется для ЧАСТИЧНОГО обновления модалки без пересоздания
 * всего DOM — это решает баг со скроллом!
 * @returns {String} HTML
 */
function _prRenderAdminBody() {
  var h = '';

  /* ── DEVS TAB ── */
  if (_pr.adminTab === 'devs') {
    var activeIds = (typeof ACTIVE_DEV_IDS !== 'undefined') ? ACTIVE_DEV_IDS : DEV_IDS;
    h += '<div class="pr-admin-cards-grid">';
    activeIds.forEach(function(id) {
      var sid = String(id);
      var name = prGetDevName(sid);
      var rate = prGetRate(sid);
      var clientRate = prGetClientRate(sid);
      var base = prGetBase(sid);
      var fine = prGetFine(sid);
      var isChanged = _pr.adminChangedDevs[sid];
      var initials = name.split(' ').map(function(w) { return w.charAt(0); }).join('').substring(0, 2);
      var cardBorder = isChanged ? 'border-color:var(--green);box-shadow:0 0 8px rgba(34,212,126,.2)' : '';

      h += '<div class="pr-admin-card" style="' + cardBorder + '">';
      h += '<div class="pr-admin-card-hdr">';
      h += '<div class="pr-admin-card-avatar">' + esc(initials) + '</div>';
      h += '<div class="pr-admin-card-name">' + esc(name) + '</div>';
      h += '<button class="pr-btn pr-btn-green" style="font-size:9px;padding:2px 6px" onclick="_prOpenDevDetail(\'' + sid + '\')">&#8594; Детали</button>';
      h += '</div>';
      h += '<div class="pr-admin-card-fields">';
      h += '<div class="pr-admin-field"><label>Ставка (р/ч)</label><input class="pr-admin-input" type="text" inputmode="numeric" value="' + rate + '" data-devid="' + sid + '" data-field="rate" onfocus="this.select()"></div>';
      h += '<div class="pr-admin-field"><label style="color:var(--cyan)">Ставка клиента</label><input class="pr-admin-input" type="text" inputmode="numeric" value="' + clientRate + '" data-devid="' + sid + '" data-field="clientRate" style="color:var(--cyan)" onfocus="this.select()"></div>';
      var fineComment = (typeof prGetFineComment === 'function') ? prGetFineComment(sid) : '';
      h += '<div class="pr-admin-field"><label>ЗП/Бонус</label><input class="pr-admin-input" type="text" inputmode="numeric" value="' + base + '" data-devid="' + sid + '" data-field="base" onfocus="this.select()"></div>';
      h += '<div class="pr-admin-field"><label style="color:var(--red)">Штраф</label><input class="pr-admin-input" type="text" inputmode="numeric" value="' + fine + '" data-devid="' + sid + '" data-field="fine" style="color:var(--red)" onfocus="this.select()"></div>';
      h += '<div class="pr-admin-field" style="grid-column:1/-1"><label style="color:var(--yellow)">Коммент. штрафа</label><input class="pr-admin-input" type="text" value="' + esc(fineComment) + '" data-devid="' + sid + '" data-field="fineComment" style="color:var(--yellow)" placeholder="Причина штрафа" onfocus="this.select()"></div>';
      h += '</div>';
      h += '</div>';
    });
    h += '</div>';
  }

  /* ── PROJECTS TAB ── */
  if (_pr.adminTab === 'projects') {
    h += '<div class="pr-admin-cards-grid">';
    var projectIds = (typeof PR_WHITELIST_PROJECTS !== 'undefined') ? Object.keys(PR_WHITELIST_PROJECTS).sort(function(a, b) { return PR_WHITELIST_PROJECTS[a].localeCompare(PR_WHITELIST_PROJECTS[b]); }) : Object.keys(PROJECTS).sort(function(a, b) { return PROJECTS[a].localeCompare(PROJECTS[b]); });
    projectIds.forEach(function(pid) {
      var pname = (typeof PR_WHITELIST_PROJECTS !== 'undefined') ? PR_WHITELIST_PROJECTS[pid] : PROJECTS[pid];
      var serviceIncome = (typeof prGetProjectServiceIncome === 'function') ? prGetProjectServiceIncome(pid) : 0;
      var siNote = (typeof prGetProjectServiceNote === 'function') ? prGetProjectServiceNote(pid) : '';
      var hasIncome = serviceIncome > 0;

      h += '<div class="pr-project-card' + (hasIncome ? ' pr-project-card-active' : '') + '">';
      h += '<div class="pr-project-card-hdr">';
      h += '<span class="pr-project-card-name">' + esc(pname) + '</span>';
      h += '<span class="pr-project-card-id">ID ' + pid + '</span>';
      h += '</div>';
      h += '<div class="pr-project-card-fields">';
      var pClientRate = (typeof prGetProjectClientRate === 'function') ? prGetProjectClientRate(pid) : (typeof prGetClientRate === 'function' ? prGetClientRate(pid) : 0);
      h += '<div class="pr-admin-field"><label style="color:var(--cyan)">Ставка клиента</label><input class="pr-admin-input" type="text" inputmode="numeric" value="' + pClientRate + '" data-pid="' + pid + '" data-field="clientRate" style="color:var(--cyan)" onfocus="this.select()"></div>';
      h += '<div class="pr-admin-field"><label>Допы (доход/мес)</label><input class="pr-admin-input" type="text" inputmode="numeric" value="' + serviceIncome + '" data-pid="' + pid + '" data-field="serviceIncome" onfocus="this.select()"></div>';
      h += '</div>';
      h += '</div>';
    });
    h += '</div>';
  }

  return h;
}

/**
 * Рендер sub-modal деталей разработчика
 * @returns {String} HTML
 */
function _prRenderDevDetailSubmodal() {
  var devId = _pr.adminDetailDevId;
  var dName = prGetDevName(devId);
  var dInn = prGetInn(devId);
  var dNotes = '';
  var devSettings = _prLoadDevSettings(devId);
  if (devSettings && devSettings.notes) {
    dNotes = devSettings.notes;
  }
  var dSelfEmployed = '';
  if (devSettings && devSettings.selfEmployed) {
    dSelfEmployed = devSettings.selfEmployed;
  }

  var h = '<div class="pr-admin-submodal">';
  h += '<div class="pr-admin-submodal-inner">';
  h += '<div class="pr-admin-submodal-title">' + esc(dName) + ' — детали</div>';
  h += '<div class="pr-admin-field"><label>ИНН</label><input class="pr-admin-input" type="text" value="' + esc(dInn) + '" data-devid="' + devId + '" data-field="inn" placeholder="ИНН" onfocus="this.select()"></div>';
  h += '<div class="pr-admin-field"><label>ФИО (полное)</label><input class="pr-admin-input" type="text" value="' + esc(dName) + '" data-devid="' + devId + '" data-field="name" onfocus="this.select()"></div>';
  h += '<div class="pr-admin-field"><label>Самозанятый</label><input class="pr-admin-input" type="text" value="' + esc(dSelfEmployed) + '" data-devid="' + devId + '" data-field="selfEmployed" placeholder="Номер/статус" onfocus="this.select()"></div>';
  h += '<div class="pr-admin-field"><label>Заметки</label><input class="pr-admin-input" type="text" value="' + esc(dNotes) + '" data-devid="' + devId + '" data-field="notes" placeholder="Заметки" onfocus="this.select()"></div>';
  h += '<div style="display:flex;gap:8px;margin-top:10px">';
  h += '<button class="pr-btn pr-btn-ghost" onclick="_prCloseDevDetail()">Назад</button>';
  h += '<button class="pr-btn pr-btn-primary" onclick="_prCloseDevDetail();_prSaveAdmin()">Сохранить</button>';
  h += '</div>';
  h += '</div>';
  h += '</div>';
  return h;
}

/* ═══════════════════════════════════════════════════════════════
   ЧАСТИЧНЫЙ РЕНДЕР МОДАЛКИ — РЕШЕНИЕ СКРОЛЛ-БАГА
   ═══════════════════════════════════════════════════════════════ */

/**
 * Обновить ТОЛЬКО содержимое модалки без пересоздания DOM.
 * Сохраняет scroll position, не теряет фокус инпутов.
 * Это ключевой фикс бага «скролл прыгает наверх».
 */
function _prAdminPartialRender() {
  var body = document.getElementById('prAdminBody');
  if (!body) return;
  body.innerHTML = _prRenderAdminBody();
}

/* ═══════════════════════════════════════════════════════════════
   ОБРАБОТЧИКИ АДМИНКИ
   ═══════════════════════════════════════════════════════════════ */

function _prOpenAdmin() {
  _pr.modalOpen = true;
  _pr.adminSaveMsg = null;
  _pr.adminSaveTime = null;
  _pr.adminChangedDevs = {};
  _pr.adminTab = 'devs';
  _pr.adminDetailDevId = null;
  _prScheduleRender();
  if (typeof PayrollEvents !== 'undefined') {
    PayrollEvents.emit('admin:opened', {});
  }
}

function _prCloseAdmin(e) {
  if (e && e.target && !e.target.classList.contains('pr-modal-overlay')) return;
  _pr.modalOpen = false;
  _pr.adminSaveMsg = null;
  _pr.adminSaveTime = null;
  _pr.adminChangedDevs = {};
  _pr.adminDetailDevId = null;
  _prScheduleRender();
  if (typeof PayrollEvents !== 'undefined') {
    PayrollEvents.emit('admin:closed', {});
  }
}

function _prSetAdminTab(tab) {
  _pr.adminTab = tab;
  _pr.adminDetailDevId = null;
  /* ЧАСТИЧНЫЙ рендер — только модалка, без _prRenderAll */
  _prAdminPartialRender();
}

function _prOpenDevDetail(devId) {
  _pr.adminDetailDevId = devId;
  /* ЧАСТИЧНЫЙ рендер — подставляем sub-modal */
  _prScheduleRender();
}

function _prCloseDevDetail() {
  _pr.adminDetailDevId = null;
  /* ЧАСТИЧНЫЙ рендер — убираем sub-modal */
  _prAdminPartialRender();
}

/* ═══════════════════════════════════════════════════════════════
   СОХРАНЕНИЕ АДМИНКИ
   ═══════════════════════════════════════════════════════════════ */

function _prSaveAdmin() {
  var inputs = document.querySelectorAll('.pr-admin-input');
  var devData = {};
  var projData = {};
  inputs.forEach(function(inp) {
    var devId = inp.getAttribute('data-devid');
    var pid = inp.getAttribute('data-pid');
    var field = inp.getAttribute('data-field');
    if (devId) {
      if (!devData[devId]) devData[devId] = {};
      devData[devId][field] = inp.value;
    }
    if (pid) {
      if (!projData[pid]) projData[pid] = {};
      projData[pid][field] = inp.value;
    }
  });

  var auditEntries = [];
  var changedDevs = [];
  Object.keys(devData).forEach(function(devId) {
    var d = devData[devId];
    var settings = _prLoadDevSettings(devId) || {};
    var changed = false;
    if (d.name) settings.name = d.name;
    if (d.inn !== undefined) settings.inn = d.inn;
    if (d.rate !== undefined) {
      var rawRate = String(d.rate).replace(/[^\d.,]/g, '').replace(',', '.');
      var newRate = (rawRate !== '' && rawRate !== undefined && rawRate !== null) ? parseInt(rawRate) : СТАВКА_ПО_УМОЛЧ;
      if (isNaN(newRate)) newRate = СТАВКА_ПО_УМОЛЧ;
      if (newRate !== settings.rate) {
        auditEntries.push(createAuditEntry('change_rate', 'developer', devId, {
          oldRate: settings.rate !== undefined ? settings.rate : СТАВКА_ПО_УМОЛЧ,
          newRate: newRate
        }));
        changed = true;
      }
      settings.rate = newRate;
    }
    if (d.base !== undefined) {
      var newBase = parseInt(String(d.base).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      if (newBase !== settings.base) {
        auditEntries.push(createAuditEntry('change_base', 'developer', devId, {
          oldBase: settings.base || 0,
          newBase: newBase
        }));
        changed = true;
      }
      settings.base = newBase;
    }
    if (d.fine !== undefined) {
      var newFine = parseInt(String(d.fine).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      if (newFine !== (settings.fine || 0)) {
        auditEntries.push(createAuditEntry('change_fine', 'developer', devId, {
          oldFine: settings.fine || 0,
          newFine: newFine
        }));
        changed = true;
      }
      settings.fine = newFine;
    }
    if (d.fineComment !== undefined) {
      if (d.fineComment !== (settings.fineComment || '')) changed = true;
      settings.fineComment = d.fineComment;
    }
    if (d.clientRate !== undefined) {
      var rawCR = String(d.clientRate).replace(/[^\d.,]/g, '').replace(',', '.');
      var newClientRate = (rawCR !== '' && rawCR !== undefined && rawCR !== null) ? parseInt(rawCR) : 0;
      if (isNaN(newClientRate)) newClientRate = 0;
      if (newClientRate !== (settings.clientRate !== undefined ? settings.clientRate : 0)) {
        auditEntries.push(createAuditEntry('change_client_rate', 'developer', devId, {
          oldClientRate: settings.clientRate !== undefined ? settings.clientRate : 0,
          newClientRate: newClientRate
        }));
        changed = true;
      }
      settings.clientRate = newClientRate;
    }
    if (d.notes !== undefined) {
      if (d.notes !== (settings.notes || '')) changed = true;
      settings.notes = d.notes;
    }
    if (d.selfEmployed !== undefined) {
      if (d.selfEmployed !== (settings.selfEmployed || '')) changed = true;
      settings.selfEmployed = d.selfEmployed;
    }
    _prSaveDevSettings(devId, settings);
    if (changed) changedDevs.push(devId);
  });

  /* Save project service incomes + clientRate */
  Object.keys(projData).forEach(function(pid) {
    var p = projData[pid];
    if (p.serviceIncome !== undefined || p.serviceNote !== undefined) {
      var svcAmount = p.serviceIncome !== undefined ? (parseInt(String(p.serviceIncome).replace(/[^\d.,]/g, '').replace(',', '.')) || 0) : (typeof prGetProjectServiceIncome === 'function' ? prGetProjectServiceIncome(pid) : 0);
      var svcNote = p.serviceNote || '';
      if (typeof PayrollStorage !== 'undefined' && PayrollStorage.saveProjectServiceIncome) {
        PayrollStorage.saveProjectServiceIncome(pid, svcAmount, svcNote);
      } else {
        if (typeof PROJECT_SERVICE_INCOME !== 'undefined') {
          PROJECT_SERVICE_INCOME[pid] = svcAmount;
        }
      }
    }
    if (p.clientRate !== undefined) {
      var newProjClientRate = parseInt(String(p.clientRate).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      if (typeof PayrollStorage !== 'undefined' && PayrollStorage.saveProjectClientRate) {
        PayrollStorage.saveProjectClientRate(pid, newProjClientRate);
      } else if (typeof PROJECT_CLIENT_RATES !== 'undefined') {
        PROJECT_CLIENT_RATES[pid] = newProjClientRate;
      }
    }
  });

  if (auditEntries.length > 0) {
    var periodKey = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    _prAppendAuditLog(periodKey, auditEntries);
  }

  /* Apply new rate to all existing saved reviews for changed devs */
  if (changedDevs.length > 0) {
    _prApplyRateToSavedReviews(changedDevs);
  }

  /* Show success message */
  _pr.adminChangedDevs = {};
  changedDevs.forEach(function(id) { _pr.adminChangedDevs[String(id)] = true; });
  _pr.adminSaveMsg = changedDevs.length > 0
    ? 'Изменено: ' + changedDevs.map(function(id) { return prGetDevName(id); }).join(', ')
    : 'Данные сохранены';
  _pr.adminSaveTime = Date.now();

  /* Update rows in memory with new rates */
  if (changedDevs.length > 0) {
    var devSet = {};
    changedDevs.forEach(function(id) { devSet[String(id)] = true; });
    _pr.rows.forEach(function(r) {
      if (devSet[String(r.developerId)]) {
        r.rate = prGetRate(r.developerId);
        r.base = prGetBase(r.developerId);
        r.clientRate = prGetClientRate(r.developerId);
        r.payrollAmount = Math.round(r.payrollHours * r.rate);
        if (typeof calculateProfitability === 'function') {
          r = calculateProfitability(r);
        }
      }
    });
    _prRebuildAndRender({ invalidateCache: true, markDirty: false, source: 'saveAdmin' });
    /* Cancel the scheduled render — we'll do partial render for modal only */
    _pr._renderScheduled = false;

    /* ЧАСТИЧНЫЙ РЕНДЕР МОДАЛКИ — скролл НЕ прыгает! */
    _prAdminPartialRender();
    /* Обновить footer с сообщением об успехе */
    var footer = document.querySelector('.pr-modal-footer');
    if (footer) {
      var footerH = '';
      if (_pr.adminSaveMsg) {
        footerH += '<div style="display:flex;align-items:center;gap:6px;margin-right:auto;padding:6px 12px;background:rgba(34,212,126,.12);border:1px solid rgba(34,212,126,.3);border-radius:6px">';
        footerH += '<span style="color:var(--green);font-size:14px">&#10003;</span>';
        footerH += '<span style="font-family:var(--mono);font-size:11px;color:var(--green);font-weight:600">' + esc(_pr.adminSaveMsg) + '</span>';
        footerH += '</div>';
      }
      footerH += '<button class="pr-btn pr-btn-ghost" onclick="_prCloseAdmin()">Отмена</button>';
      footerH += '<button class="pr-btn pr-btn-primary" onclick="_prSaveAdmin()">Сохранить всё</button>';
      footer.innerHTML = footerH;
    }

    /* Обновить KPI/cards/timeline за пределами модалки */
    _prRenderAll();
  } else {
    /* Нет изменений в ставках — просто обновляем footer */
    _prAdminPartialRender();
    var footer2 = document.querySelector('.pr-modal-footer');
    if (footer2) {
      var footerH2 = '';
      if (_pr.adminSaveMsg) {
        footerH2 += '<div style="display:flex;align-items:center;gap:6px;margin-right:auto;padding:6px 12px;background:rgba(34,212,126,.12);border:1px solid rgba(34,212,126,.3);border-radius:6px">';
        footerH2 += '<span style="color:var(--green);font-size:14px">&#10003;</span>';
        footerH2 += '<span style="font-family:var(--mono);font-size:11px;color:var(--green);font-weight:600">' + esc(_pr.adminSaveMsg) + '</span>';
        footerH2 += '</div>';
      }
      footerH2 += '<button class="pr-btn pr-btn-ghost" onclick="_prCloseAdmin()">Отмена</button>';
      footerH2 += '<button class="pr-btn pr-btn-primary" onclick="_prSaveAdmin()">Сохранить всё</button>';
      footer2.innerHTML = footerH2;
    }
  }

  /* Auto-close modal after 2 seconds */
  setTimeout(function() {
    if (_pr.adminSaveTime && Date.now() - _pr.adminSaveTime >= 1800) {
      _pr.adminSaveMsg = null;
      _pr.adminSaveTime = null;
      _pr.modalOpen = false;
      _prScheduleRender();
    }
  }, 2000);

  if (typeof PayrollEvents !== 'undefined') {
    PayrollEvents.emit('admin:save-complete', { changedDevs: changedDevs });
  }
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
    var newBase = prGetBase(review.developerId);
    if (review.rate !== newRate || review.base !== newBase) {
      review.rate = newRate;
      review.base = newBase;
      review.payrollAmount = Math.round((review.payrollHours || 0) * newRate);
      changed = true;
    }
  });

  if (changed) {
    _prSaveReviews(year, month, savedReviews);
  }
}
