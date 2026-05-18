/* ═══════════════════════════════════════════════════════════════
   payroll-storage.js — Абстракция хранения
   Единая точка доступа к данным. НЕ зависит от DOM.
   Легко заменить localStorage на серверный API.

   Интерфейс:
   - PayrollStorage.saveReview(key, data)
   - PayrollStorage.loadReview(key)
   - PayrollStorage.saveReviews(year, month, reviews)
   - PayrollStorage.loadReviews(year, month)
   - PayrollStorage.saveSnapshot(periodKey, snapshot)
   - PayrollStorage.loadSnapshot(periodKey)
   - PayrollStorage.saveDevSettings(devId, settings)
   - PayrollStorage.loadDevSettings(devId)
   - PayrollStorage.saveFilters(filters)
   - PayrollStorage.loadFilters()
   - PayrollStorage.savePeriodState(periodKey, state)
   - PayrollStorage.loadPeriodState(periodKey)
   - PayrollStorage.saveAuditLog(periodKey, entries)
   - PayrollStorage.loadAuditLog(periodKey)
   - PayrollStorage.clearAll()
   - Paylistorage.getSavedPeriods()
   ═══════════════════════════════════════════════════════════════ */

var PayrollStorage = (function() {

  /* ─── Конфигурация ─── */
  var VERSION = 3;
  var PREFIX = 'pr_';

  /* ─── Внутренние ключи ─── */
  function _key(name) { return PREFIX + name; }
  function _periodKey(year, month) { return _key('reviews_' + year + '_' + String(month).padStart(2, '0')); }
  function _snapshotKey(periodKey) { return _key('snap_' + periodKey); }
  function _periodStateKey(periodKey) { return _key('pstate_' + periodKey); }
  function _auditKey(periodKey) { return _key('audit_' + periodKey); }

  /* ─── Низкоуровневые операции ─── */
  function _get(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e) {
      console.warn('PayrollStorage._get error', key, e);
      return null;
    }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch(e) {
      console.warn('PayrollStorage._set error', key, e);
      return false;
    }
  }

  function _remove(key) {
    try { localStorage.removeItem(key); } catch(e) {}
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  return {

    /* ─── Версия ─── */
    version: function() { return VERSION; },

    /* ═══════ REVIEWS ═══════ */

    /**
     * Загрузить ревью за период
     * @param {Number} year
     * @param {Number} month
     * @returns {Object} map[reviewKey] = review data
     */
    loadReviews: function(year, month) {
      var data = _get(_periodKey(year, month));
      if (!data || data._v !== VERSION) return {};
      return data.reviews || {};
    },

    /**
     * Сохранить ревью за период
     * @param {Number} year
     * @param {Number} month
     * @param {Object} reviews — map[reviewKey] = review data
     * @returns {Boolean}
     */
    saveReviews: function(year, month, reviews) {
      return _set(_periodKey(year, month), {
        _v: VERSION,
        _ts: Date.now(),
        reviews: reviews || {}
      });
    },

    /**
     * Сохранить одно ревью
     * @param {Number} year
     * @param {Number} month
     * @param {String} reviewKey
     * @param {Object} reviewData
     * @returns {Boolean}
     */
    saveSingleReview: function(year, month, reviewKey, reviewData) {
      var reviews = this.loadReviews(year, month);
      reviews[reviewKey] = reviewData;
      return this.saveReviews(year, month, reviews);
    },

    /**
     * Удалить одно ревью
     */
    deleteSingleReview: function(year, month, reviewKey) {
      var reviews = this.loadReviews(year, month);
      delete reviews[reviewKey];
      return this.saveReviews(year, month, reviews);
    },

    /* ═══════ SNAPSHOTS ═══════ */

    /**
     * Сохранить snapshot периода
     * @param {String} periodKey — "2026-05"
     * @param {Object} snapshot — PeriodSnapshot
     * @returns {Boolean}
     */
    saveSnapshot: function(periodKey, snapshot) {
      return _set(_snapshotKey(periodKey), {
        _v: VERSION,
        _ts: Date.now(),
        snapshot: snapshot
      });
    },

    /**
     * Загрузить snapshot периода
     * @param {String} periodKey
     * @returns {Object|null} PeriodSnapshot
     */
    loadSnapshot: function(periodKey) {
      var data = _get(_snapshotKey(periodKey));
      if (!data || data._v !== VERSION) return null;
      return data.snapshot || null;
    },

    /**
     * Удалить snapshot периода
     */
    deleteSnapshot: function(periodKey) {
      _remove(_snapshotKey(periodKey));
    },

    /* ═══════ PERIOD STATE ═══════ */

    /**
     * Сохранить состояние периода
     * @param {String} periodKey
     * @param {Object} state — { status, snapshotId, updatedAt }
     * @returns {Boolean}
     */
    savePeriodState: function(periodKey, state) {
      return _set(_periodStateKey(periodKey), {
        _v: VERSION,
        _ts: Date.now(),
        state: state
      });
    },

    /**
     * Загрузить состояние периода
     * @param {String} periodKey
     * @returns {Object|null} { status, snapshotId, updatedAt }
     */
    loadPeriodState: function(periodKey) {
      var data = _get(_periodStateKey(periodKey));
      if (!data || data._v !== VERSION) return null;
      return data.state || null;
    },

    /* ═══════ AUDIT LOG ═══════ */

    /**
     * Сохранить аудиторский лог периода
     * @param {String} periodKey
     * @param {Array} entries — AuditLogEntry[]
     * @returns {Boolean}
     */
    saveAuditLog: function(periodKey, entries) {
      return _set(_auditKey(periodKey), {
        _v: VERSION,
        _ts: Date.now(),
        entries: entries || []
      });
    },

    /**
     * Загрузить аудиторский лог периода
     * @param {String} periodKey
     * @returns {Array} AuditLogEntry[]
     */
    loadAuditLog: function(periodKey) {
      var data = _get(_auditKey(periodKey));
      if (!data || data._v !== VERSION) return [];
      return data.entries || [];
    },

    /**
     * Добавить записи в аудиторский лог
     * @param {String} periodKey
     * @param {Array|Object} newEntries — одна запись или массив
     */
    appendAuditLog: function(periodKey, newEntries) {
      var existing = this.loadAuditLog(periodKey);
      var toAdd = Array.isArray(newEntries) ? newEntries : [newEntries];
      var combined = existing.concat(toAdd);
      /* Ограничение: храним максимум 1000 записей */
      if (combined.length > 1000) {
        combined = combined.slice(combined.length - 1000);
      }
      return this.saveAuditLog(periodKey, combined);
    },

    /* ═══════ DEVELOPER SETTINGS ═══════ */

    /**
     * Загрузить настройки разработчика
     * @param {String} devId
     * @returns {Object|null} { rate, base, inn, name }
     */
    loadDevSettings: function(devId) {
      return _get(_key('dev_' + devId));
    },

    /**
     * Сохранить настройки разработчика
     * @param {String} devId
     * @param {Object} settings — { rate, base, inn, name }
     * @returns {Boolean}
     */
    saveDevSettings: function(devId, settings) {
      return _set(_key('dev_' + devId), settings);
    },

    /**
     * Загрузить все настройки разработчиков
     * @returns {Object} map[devId] = settings
     */
    loadAllDevSettings: function() {
      var result = {};
      if (typeof DEV_IDS !== 'undefined') {
        DEV_IDS.forEach(function(id) {
          var s = _get(_key('dev_' + id));
          if (s) result[String(id)] = s;
        });
      }
      return result;
    },

    /* ═══════ FILTERS ═══════ */

    loadFilters: function() {
      var f = _get(_key('filters'));
      return f || { developer: '', project: '', status: '' };
    },

    saveFilters: function(filters) {
      return _set(_key('filters'), filters);
    },

    /* ═══════ SETTINGS ═══════ */

    loadSettings: function() {
      return _get(_key('settings')) || {};
    },

    saveSettings: function(settings) {
      return _set(_key('settings'), settings);
    },

    /* ═══════ HOOK ═══════ */

    loadHook: function() {
      try {
        return localStorage.getItem(_key('hook')) || '';
      } catch(e) { return ''; }
    },

    saveHook: function(hook) {
      try {
        localStorage.setItem(_key('hook'), hook);
      } catch(e) {}
    },

    /* ═══════ UTILITY ═══════ */

    /**
     * Очистить все данные модуля
     */
    clearAll: function() {
      var keysToRemove = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
      } catch(e) {}
    },

    /**
     * Получить список сохранённых периодов
     * @returns {Array} [{ year, month, periodKey, status }]
     */
    getSavedPeriods: function() {
      var periods = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(_key('reviews_')) === 0) {
            var parts = k.replace(_key('reviews_'), '').split('_');
            if (parts.length === 2) {
              var year = parseInt(parts[0]);
              var month = parseInt(parts[1]);
              var pk = year + '-' + String(month).padStart(2, '0');
              var pState = this.loadPeriodState(pk);
              periods.push({
                year: year,
                month: month,
                periodKey: pk,
                status: pState ? pState.status : 'draft'
              });
            }
          }
        }
      } catch(e) {}
      periods.sort(function(a, b) { return (b.year * 12 + b.month) - (a.year * 12 + a.month); });
      return periods;
    },

    /**
     * Получить размер хранилища в байтах (приблизительно)
     * @returns {Number}
     */
    getStorageSize: function() {
      var size = 0;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0) {
            size += (localStorage.getItem(k) || '').length * 2; /* UTF-16 */
          }
        }
      } catch(e) {}
      return size;
    }
  };
})();
