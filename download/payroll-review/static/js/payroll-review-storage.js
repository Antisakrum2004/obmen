/* ═══════════════════════════════════════════════════════════════
   payroll-review-storage.js — Persistence Layer
   localStorage with prefix pr_ + versioning
   ═══════════════════════════════════════════════════════════════ */

var PR_STORAGE_VERSION = 1;
var PR_STORAGE_PREFIX = 'pr_';

/* ─── Key helpers ─── */
function prKey(name) {
  return PR_STORAGE_PREFIX + name;
}

function prPeriodKey(year, month) {
  return prKey('reviews_' + year + '_' + String(month).padStart(2, '0'));
}

/* ─── Read reviews from localStorage ─── */
function prLoadReviews(year, month) {
  var key = prPeriodKey(year, month);
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return {};
    var data = JSON.parse(raw);
    if (!data || data._v !== PR_STORAGE_VERSION) return {};
    return data.reviews || {};
  } catch(e) {
    console.warn('prLoadReviews: failed', e);
    return {};
  }
}

/* ─── Save reviews to localStorage ─── */
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
    console.warn('prSaveReviews: failed', e);
    return false;
  }
}

/* ─── Save single review ─── */
function prSaveSingleReview(year, month, reviewKey, reviewData) {
  var reviews = prLoadReviews(year, month);
  reviews[reviewKey] = reviewData;
  return prSaveReviews(year, month, reviews);
}

/* ─── Delete single review ─── */
function prDeleteSingleReview(year, month, reviewKey) {
  var reviews = prLoadReviews(year, month);
  delete reviews[reviewKey];
  return prSaveReviews(year, month, reviews);
}

/* ─── Load settings ─── */
function prLoadSettings() {
  try {
    var raw = localStorage.getItem(prKey('settings'));
    if (!raw) return {};
    return JSON.parse(raw);
  } catch(e) {
    return {};
  }
}

/* ─── Save settings ─── */
function prSaveSettings(settings) {
  try {
    localStorage.setItem(prKey('settings'), JSON.stringify(settings));
  } catch(e) {}
}

/* ─── Load filter state ─── */
function prLoadFilters() {
  try {
    var raw = localStorage.getItem(prKey('filters'));
    if (!raw) return {developer: '', project: '', status: ''};
    return JSON.parse(raw);
  } catch(e) {
    return {developer: '', project: '', status: ''};
  }
}

/* ─── Save filter state ─── */
function prSaveFilters(filters) {
  try {
    localStorage.setItem(prKey('filters'), JSON.stringify(filters));
  } catch(e) {}
}

/* ─── Clear all payroll-review data ─── */
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

/* ─── Get list of saved periods ─── */
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
