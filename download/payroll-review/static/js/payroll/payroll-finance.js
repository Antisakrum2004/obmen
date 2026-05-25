/* ═══════════════════════════════════════════════════════════════
   payroll-finance.js — Finance Calculations (v5.2.0)
   Extracted from tab-payroll-review.js for separation of concerns.
   All functions remain globally accessible for backward compatibility.
   ═══════════════════════════════════════════════════════════════ */

window.PayrollFinance = (function() {

  /**
   * Calculate margin percentage for a developer
   * Client Revenue = billable_hours × client_rate
   * Our Costs = totalAmount (taskEarnings + base - fines)
   * Margin = Client Revenue - Our Costs
   * Margin % = Margin / Client Revenue × 100
   *
   * @param {Object} dev — DeveloperProjection
   * @returns {Number} margin percentage
   */
  function calculateDeveloperMargin(dev) {
    if (!dev || dev.totalBillable <= 0) return 0;
    var rate = (typeof prGetRate === 'function') ? (prGetRate(dev.developerId) || 0) : 0;
    var clientRevenue = dev.totalBillable * rate;
    var payrollCost = dev.totalAmount;
    if (clientRevenue <= 0) return 0;
    return (typeof safeRound === 'function')
      ? safeRound((clientRevenue - payrollCost) / clientRevenue * 100, 0)
      : Math.round((clientRevenue - payrollCost) / clientRevenue * 100);
  }

  /**
   * Calculate team-wide margin from projection array
   * @param {Array} projection — DeveloperProjection[]
   * @returns {Object} { totalClientRevenue, totalPayrollCost, totalMargin, marginPct }
   */
  function calculateTeamMargin(projection) {
    if (!projection || !projection.length) {
      return { totalClientRevenue: 0, totalPayrollCost: 0, totalMargin: 0, marginPct: 0 };
    }
    var totalClientRevenue = 0;
    var totalPayrollCost = 0;

    projection.forEach(function(dev) {
      var rate = (typeof prGetRate === 'function') ? (prGetRate(dev.developerId) || 0) : 0;
      totalClientRevenue += dev.totalBillable * rate;
      totalPayrollCost += dev.totalAmount;
    });

    var totalMargin = totalClientRevenue - totalPayrollCost;
    var marginPct = totalClientRevenue > 0
      ? Math.round(totalMargin / totalClientRevenue * 100)
      : 0;

    return {
      totalClientRevenue: Math.round(totalClientRevenue),
      totalPayrollCost: Math.round(totalPayrollCost),
      totalMargin: Math.round(totalMargin),
      marginPct: marginPct
    };
  }

  /**
   * Calculate client revenue for a single developer
   * Client Revenue = billable_hours × client_rate (only tasks, NOT base salary)
   * @param {Object} dev — DeveloperProjection
   * @returns {Number}
   */
  function calculateClientRevenue(dev) {
    if (!dev) return 0;
    var rate = (typeof prGetRate === 'function') ? (prGetRate(dev.developerId) || 0) : 0;
    return Math.round(dev.totalBillable * rate);
  }

  /**
   * Calculate payroll cost for a single developer
   * Our Costs = taskEarnings + base - fines (totalAmount)
   * @param {Object} dev — DeveloperProjection
   * @returns {Number}
   */
  function calculatePayrollCost(dev) {
    if (!dev) return 0;
    return dev.totalAmount || 0;
  }

  /**
   * Format money value (exposed globally as _prFmtMoney if not already defined)
   * @param {Number} n
   * @returns {String}
   */
  function fmtMoney(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return n.toLocaleString('ru-RU');
  }

  /**
   * Format bytes into human-readable string
   * @param {Number} bytes
   * @returns {String}
   */
  function fmtBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    var val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return val.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }

  /* Expose globally for backward compatibility */
  window._prCalcMarginPct = calculateDeveloperMargin;
  window._prFmtMoney = window._prFmtMoney || fmtMoney;
  window._prFmtBytes = fmtBytes;

  return {
    calculateDeveloperMargin: calculateDeveloperMargin,
    calculateTeamMargin: calculateTeamMargin,
    calculateClientRevenue: calculateClientRevenue,
    calculatePayrollCost: calculatePayrollCost,
    fmtMoney: fmtMoney,
    fmtBytes: fmtBytes
  };
})();
