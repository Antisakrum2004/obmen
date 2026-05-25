/* ═══════════════════════════════════════════════════════════════
   payroll-audit.js — Audit Module (v5.2.0)
   Snapshot management, timeline data preparation, audit log formatting.
   Extracted from tab-payroll-review.js for separation of concerns.
   All functions remain globally accessible for backward compatibility.
   ═══════════════════════════════════════════════════════════════ */

window.PayrollAudit = (function() {

  /**
   * Prepare snapshot data for storage
   * @param {String} periodKey
   * @param {Array} rows — TaskReview[]
   * @returns {Object} PeriodSnapshot
   */
  function prepareSnapshot(periodKey, rows) {
    if (typeof createPeriodSnapshot === 'function') {
      return createPeriodSnapshot(periodKey, rows);
    }
    return null;
  }

  /**
   * Save snapshot to both localStorage and IDB
   * @param {String} periodKey
   * @param {Object} snapshot
   * @returns {Object} save result
   */
  function saveSnapshot(periodKey, snapshot) {
    var result = { ls: false, idb: false };

    /* Save to localStorage via PayrollStorage */
    if (typeof PayrollStorage !== 'undefined' && PayrollStorage.saveSnapshot) {
      var lsResult = PayrollStorage.saveSnapshot(periodKey, snapshot);
      result.ls = lsResult ? lsResult.success : false;
    }

    /* Save to IDB (fire-and-forget) */
    if (typeof PayrollIDB !== 'undefined' && PayrollIDB.isSupported()) {
      PayrollIDB.save(PayrollIDB.STORES.snapshots, periodKey, snapshot).then(function() {
        result.idb = true;
      }).catch(function() {});
    }

    return result;
  }

  /**
   * Load snapshot from IDB first, fallback to localStorage
   * @param {String} periodKey
   * @returns {Promise<Object|null>}
   */
  function loadSnapshot(periodKey) {
    /* Try IDB first */
    if (typeof PayrollIDB !== 'undefined' && PayrollIDB.isSupported()) {
      return PayrollIDB.load(PayrollIDB.STORES.snapshots, periodKey).then(function(idbData) {
        if (idbData) return idbData;
        /* Fallback to localStorage */
        if (typeof PayrollStorage !== 'undefined' && PayrollStorage.loadSnapshot) {
          return PayrollStorage.loadSnapshot(periodKey);
        }
        return null;
      }).catch(function() {
        /* Fallback to localStorage on IDB error */
        if (typeof PayrollStorage !== 'undefined' && PayrollStorage.loadSnapshot) {
          return PayrollStorage.loadSnapshot(periodKey);
        }
        return null;
      });
    }

    /* No IDB — use localStorage directly */
    if (typeof PayrollStorage !== 'undefined' && PayrollStorage.loadSnapshot) {
      return Promise.resolve(PayrollStorage.loadSnapshot(periodKey));
    }
    return Promise.resolve(null);
  }

  /**
   * Prepare timeline data for a developer (not DOM rendering)
   * Groups rows by date for efficient rendering later
   * @param {String} devId
   * @param {Array} rows — all TaskReview[]
   * @returns {Object} { byDate: {}, noDate: [], totalCount }
   */
  function prepareTimelineData(devId, rows) {
    var devRows = (rows || []).filter(function(r) {
      return String(r.developerId) === String(devId) &&
             r.reviewStatus !== 'excluded';
    });

    var byDate = {};
    var noDate = [];

    devRows.forEach(function(r) {
      var dateStr = null;
      if (typeof _prGetTaskDate === 'function') {
        dateStr = _prGetTaskDate(r.taskId);
      }
      if (dateStr) {
        if (!byDate[dateStr]) byDate[dateStr] = [];
        byDate[dateStr].push(r);
      } else {
        noDate.push(r);
      }
    });

    return {
      byDate: byDate,
      noDate: noDate,
      totalCount: devRows.length
    };
  }

  /**
   * Format audit log entries for display
   * @param {Array} entries — AuditLogEntry[]
   * @returns {Array} formatted entries
   */
  function formatAuditLog(entries) {
    if (!entries || !entries.length) return [];
    return entries.map(function(entry) {
      var date = new Date(entry.timestamp);
      var timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      var dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      return {
        id: entry.id,
        time: dateStr + ' ' + timeStr,
        action: entry.action || '',
        entityType: entry.entityType || '',
        entityId: entry.entityId || '',
        details: entry.details || {},
        actor: entry.actor || 'manager'
      };
    });
  }

  /**
   * Get snapshot info for debug display
   * @param {String} periodKey
   * @returns {Object} snapshot info
   */
  function getSnapshotInfo(periodKey) {
    var info = { exists: false, source: 'none' };
    if (typeof PayrollStorage !== 'undefined' && PayrollStorage.loadSnapshot) {
      var snap = PayrollStorage.loadSnapshot(periodKey);
      if (snap) {
        info.exists = true;
        info.source = 'localStorage';
        info.snapshotId = snap.snapshotId || 'N/A';
        info.snapshotVersion = snap.snapshotVersion || 'N/A';
        info.checksum = snap.checksum || 'N/A';
        info.immutable = snap._immutable ? true : false;
        info.reviewCount = snap.reviewCount || (snap.reviews ? snap.reviews.length : 0);
        if (typeof verifySnapshotIntegrity === 'function') {
          var integrity = verifySnapshotIntegrity(snap);
          info.integrityValid = integrity.valid;
        }
      }
    }
    return info;
  }

  return {
    prepareSnapshot: prepareSnapshot,
    saveSnapshot: saveSnapshot,
    loadSnapshot: loadSnapshot,
    prepareTimelineData: prepareTimelineData,
    formatAuditLog: formatAuditLog,
    getSnapshotInfo: getSnapshotInfo
  };
})();
