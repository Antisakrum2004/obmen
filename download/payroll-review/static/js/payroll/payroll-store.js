/* ═══════════════════════════════════════════════════════════════
   payroll-store.js — Normalized Store (v5.2.0)
   O(1) lookup indices for elapsed, tasks, projections.
   Enables incremental updates without full rebuilds.
   ═══════════════════════════════════════════════════════════════ */

window.PayrollStore = (function() {

  /* ─── Indices ─── */
  var elapsedById = {};     /* elapsedId -> normalized entry */
  var elapsedByTask = {};   /* taskId -> [elapsedId, ...] */
  var elapsedByUser = {};   /* userId -> [elapsedId, ...] */
  var taskById = {};        /* taskId -> task metadata */
  var projectionByUser = {};/* userId -> DeveloperProjection */
  var totals = {};          /* PeriodTotals */
  var datasetMeta = {};     /* {elapsedCount, taskCount, devCount, builtAt} */

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */
  return {

    /**
     * Reset all indices
     */
    reset: function() {
      elapsedById = {};
      elapsedByTask = {};
      elapsedByUser = {};
      taskById = {};
      projectionByUser = {};
      totals = {};
      datasetMeta = {};
    },

    /**
     * Index normalized elapsed entries into O(1) lookup structures
     * @param {Array} entries — normalized elapsed entries from normalizeElapsedBatch
     */
    indexElapsed: function(entries) {
      if (!entries || !entries.length) return;
      /* Clear elapsed indices */
      elapsedById = {};
      elapsedByTask = {};
      elapsedByUser = {};

      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var eid = e.id || String(i);
        elapsedById[eid] = e;

        if (!elapsedByTask[e.taskId]) elapsedByTask[e.taskId] = [];
        elapsedByTask[e.taskId].push(eid);

        if (!elapsedByUser[e.userId]) elapsedByUser[e.userId] = [];
        elapsedByUser[e.userId].push(eid);
      }

      datasetMeta.elapsedCount = entries.length;
    },

    /**
     * Index task metadata into O(1) lookup
     * @param {Object} tasksMeta — map[taskId] = { groupId, groupName, title, ... }
     */
    indexTasks: function(tasksMeta) {
      if (!tasksMeta) return;
      taskById = {};
      var count = 0;
      Object.keys(tasksMeta).forEach(function(tid) {
        taskById[tid] = tasksMeta[tid];
        count++;
      });
      datasetMeta.taskCount = count;
    },

    /**
     * Build projection index from DeveloperProjection array
     * @param {Array} rows — TaskReview[] (used to build projection)
     */
    buildProjection: function(rows) {
      if (typeof buildMonthlyProjection === 'function') {
        var projection = (typeof buildMonthlyProjectionCached === 'function')
          ? buildMonthlyProjectionCached(rows) : buildMonthlyProjection(rows);
        projectionByUser = {};
        for (var i = 0; i < projection.length; i++) {
          projectionByUser[String(projection[i].developerId)] = projection[i];
        }
        if (typeof buildPeriodTotals === 'function') {
          totals = (typeof buildPeriodTotalsCached === 'function')
            ? buildPeriodTotalsCached(rows) : buildPeriodTotals(rows);
        }
        datasetMeta.devCount = projection.length;
        datasetMeta.builtAt = Date.now();
      }
    },

    /**
     * Patch a single developer's projection (incremental update)
     * @param {String} userId
     * @param {Object} newProjection — DeveloperProjection for this user
     */
    patchDeveloper: function(userId, newProjection) {
      projectionByUser[String(userId)] = newProjection;
    },

    /**
     * Patch totals by subtracting old dev values and adding new ones
     * @param {Object} oldDev — previous DeveloperProjection
     * @param {Object} newDev — new DeveloperProjection
     */
    patchTotals: function(oldDev, newDev) {
      if (!totals) return;
      /* Subtract old dev's contributions */
      if (oldDev) {
        totals.totalFactHours -= (oldDev.totalFactHours || 0);
        totals.totalBillable -= (oldDev.totalBillable || 0);
        totals.totalPayroll -= (oldDev.totalPayroll || 0);
        totals.totalPayrollAmount -= (oldDev.totalAmount || 0);
        totals.totalTasks -= (oldDev.taskCount || 0);
        totals.approvedTasks -= (oldDev.approvedCount || 0);
        totals.pendingTasks -= (oldDev.pendingCount || 0);
        totals.disputedTasks -= (oldDev.disputedCount || 0);
        totals.excludedTasks -= (oldDev.excludedCount || 0);
        totals.totalBase -= (oldDev.totalBase || 0);
        totals.totalFine -= (oldDev.totalFine || 0);
      }
      /* Add new dev's contributions */
      if (newDev) {
        totals.totalFactHours += (newDev.totalFactHours || 0);
        totals.totalBillable += (newDev.totalBillable || 0);
        totals.totalPayroll += (newDev.totalPayroll || 0);
        totals.totalPayrollAmount += (newDev.totalAmount || 0);
        totals.totalTasks += (newDev.taskCount || 0);
        totals.approvedTasks += (newDev.approvedCount || 0);
        totals.pendingTasks += (newDev.pendingCount || 0);
        totals.disputedTasks += (newDev.disputedCount || 0);
        totals.excludedTasks += (newDev.excludedCount || 0);
        totals.totalBase += (newDev.totalBase || 0);
        totals.totalFine += (newDev.totalFine || 0);
      }
      /* Round to avoid floating point drift */
      if (typeof safeRound === 'function') {
        totals.totalFactHours = safeRound(totals.totalFactHours, 1);
        totals.totalBillable = safeRound(totals.totalBillable, 1);
        totals.totalPayroll = safeRound(totals.totalPayroll, 1);
        totals.totalPayrollAmount = Math.round(totals.totalPayrollAmount || 0);
      }
    },

    /**
     * Get all elapsed IDs for a user
     * @param {String} userId
     * @returns {Array}
     */
    getElapsedForUser: function(userId) {
      return elapsedByUser[String(userId)] || [];
    },

    /**
     * Get all elapsed IDs for a task
     * @param {String} taskId
     * @returns {Array}
     */
    getElapsedForTask: function(taskId) {
      return elapsedByTask[String(taskId)] || [];
    },

    /**
     * Get developer projection by userId
     * @param {String} userId
     * @returns {Object|null}
     */
    getDeveloperProjection: function(userId) {
      return projectionByUser[String(userId)] || null;
    },

    /**
     * Get elapsed entry by ID
     * @param {String} elapsedId
     * @returns {Object|null}
     */
    getElapsedById: function(elapsedId) {
      return elapsedById[elapsedId] || null;
    },

    /**
     * Get task metadata by ID
     * @param {String} taskId
     * @returns {Object|null}
     */
    getTaskById: function(taskId) {
      return taskById[String(taskId)] || null;
    },

    /**
     * Get current totals
     * @returns {Object}
     */
    getTotals: function() {
      return totals;
    },

    /**
     * Get dataset metadata
     * @returns {Object}
     */
    getMeta: function() {
      return datasetMeta;
    },

    /**
     * Get all projection entries as array
     * @returns {Array}
     */
    getAllProjections: function() {
      var result = [];
      Object.keys(projectionByUser).forEach(function(uid) {
        result.push(projectionByUser[uid]);
      });
      return result;
    }
  };
})();
