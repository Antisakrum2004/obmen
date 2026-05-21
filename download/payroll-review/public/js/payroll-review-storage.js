/* ═══════════════════════════════════════════════════════════════
   payroll-review-storage.js — Слой хранения
   localStorage с префиксом pr_ + версионирование
   ═══════════════════════════════════════════════════════════════ */

var PR_STORAGE_VERSION = 2;
var PR_STORAGE_PREFIX = 'pr_';

/* ─── Ключи ─── */
function prKey(name) {
  return PR_STORAGE_PREFIX + name;
}

function prPeriodKey(year, month) {
  return prKey('reviews_' + year + '_' + String(month).padStart(2, '0'));
}

/* ─── Загрузить ревью из localStorage ─── */
function prLoadReviews(year, month) {
  var key = prPeriodKey(year, month);
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return {};
    var data = JSON.parse(raw);
    if (!data || data._v !== PR_STORAGE_VERSION) return {};
    return data.reviews || {};
  } catch(e) {
    console.warn('prLoadReviews: ошибка', e);
    return {};
  }
}

/* ─── Сохранить ревью в localStorage ─── */
function prSaveReviews(year, month, reviews) {
  var key = prPeriodKey(year, month);
  try {
    var data = {
      _v: PR_STORAGE_VERSION,
      _ts: Date.now(),
      reviews: reviews
    };
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch(e) {
    console.warn('prSaveReviews: ошибка', e);
    return false;
  }
}

/* ─── Сохранить одно ревью ─── */
function prSaveSingleReview(year, month, reviewKey, reviewData) {
  var reviews = prLoadReviews(year, month);
  reviews[reviewKey] = reviewData;
  return prSaveReviews(year, month, reviews);
}

/* ─── Удалить одно ревью ─── */
function prDeleteSingleReview(year, month, reviewKey) {
  var reviews = prLoadReviews(year, month);
  delete reviews[reviewKey];
  return prSaveReviews(year, month, reviews);
}

/* ─── Настройки разработчика (ставка, базовая, ИНН) ─── */
function prLoadDevSettings(devId) {
  try {
    var raw = localStorage.getItem(prKey('dev_' + devId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) {
    return null;
  }
}

function prSaveDevSettings(devId, settings) {
  try {
    localStorage.setItem(prKey('dev_' + devId), JSON.stringify(settings));
  } catch(e) {
    console.warn('prSaveDevSettings: ошибка', e);
  }
}

function prLoadAllDevSettings() {
  var result = {};
  DEV_IDS.forEach(function(id) {
    var s = prLoadDevSettings(id);
    if (s) result[String(id)] = s;
  });
  return result;
}

/* ─── Загрузить настройки ─── */
function prLoadSettings() {
  try {
    var raw = localStorage.getItem(prKey('settings'));
    if (!raw) return {};
    return JSON.parse(raw);
  } catch(e) {
    return {};
  }
}

/* ─── Сохранить настройки ─── */
function prSaveSettings(settings) {
  try {
    localStorage.setItem(prKey('settings'), JSON.stringify(settings));
  } catch(e) {}
}

/* ─── Загрузить фильтры ─── */
function prLoadFilters() {
  try {
    var raw = localStorage.getItem(prKey('filters'));
    if (!raw) return {developer: '', project: '', status: ''};
    return JSON.parse(raw);
  } catch(e) {
    return {developer: '', project: '', status: ''};
  }
}

/* ─── Сохранить фильтры ─── */
function prSaveFilters(filters) {
  try {
    localStorage.setItem(prKey('filters'), JSON.stringify(filters));
  } catch(e) {}
}

/* ─── Очистить все данные ─── */
function prClearAllData() {
  var keysToRemove = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PR_STORAGE_PREFIX) === 0) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
  } catch(e) {}
}

/* ─── Список сохранённых периодов ─── */
function prGetSavedPeriods() {
  var periods = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(prKey('reviews_')) === 0) {
        var parts = k.replace(prKey('reviews_'), '').split('_');
        if (parts.length === 2) {
          periods.push({year: parseInt(parts[0]), month: parseInt(parts[1])});
        }
      }
    }
  } catch(e) {}
  periods.sort(function(a, b) { return (b.year * 12 + b.month) - (a.year * 12 + a.month); });
  return periods;
}
