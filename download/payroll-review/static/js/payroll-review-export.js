/* ═══════════════════════════════════════════════════════════════
   payroll-review-export.js — Export Layer
   CSV generation for 1C import
   ═══════════════════════════════════════════════════════════════ */

/* ─── Build export rows from TaskReview[] ─── */
function buildExportRows(rows, year, month) {
  var periodStr = MONTHS_FULL[month - 1] + ' ' + year;
  var exportRows = [];

  /* Group by developer */
  var byDev = {};
  rows.forEach(function(r) {
    if (r.reviewStatus === 'excluded') return;
    var uid = r.developerId;
    if (!byDev[uid]) {
      byDev[uid] = {
        fullName: r.developerName,
        inn: '',
        totalPayrollHours: 0,
        rate: r.rate,
        totalAmount: 0,
        taskComments: []
      };
    }
    byDev[uid].totalPayrollHours += r.payrollHours;
    byDev[uid].totalAmount += r.payrollAmount;
    if (r.managerComment) {
      byDev[uid].taskComments.push(r.taskTitle + ': ' + r.managerComment);
    }
  });

  Object.keys(byDev).forEach(function(uid) {
    var d = byDev[uid];
    exportRows.push({
      fullName: d.fullName,
      inn: d.inn,
      period: periodStr,
      hours: Math.round(d.totalPayrollHours * 10) / 10,
      rate: d.rate,
      amount: Math.round(d.totalAmount),
      comment: d.taskComments.join('; ')
    });
  });

  return exportRows;
}

/* ─── Generate CSV content ─── */
function generateCSV(exportRows) {
  var sep = ';';
  var lines = [];

  /* Header */
  lines.push(['ФИО','ИНН','Период','Часы','Ставка','Сумма','Комментарий'].join(sep));

  /* Data rows */
  exportRows.forEach(function(r) {
    var row = [
      '"' + (r.fullName || '').replace(/"/g, '""') + '"',
      r.inn || '',
      '"' + r.period + '"',
      String(r.hours).replace('.', ','),
      String(r.rate).replace('.', ','),
      String(r.amount),
      '"' + (r.comment || '').replace(/"/g, '""') + '"'
    ];
    lines.push(row.join(sep));
  });

  return lines.join('\n');
}

/* ─── Download CSV file ─── */
function downloadCSV(csvContent, filename) {
  /* Add BOM for Excel to recognize UTF-8 */
  var BOM = '\uFEFF';
  var blob = new Blob([BOM + csvContent], {type: 'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename || 'payroll-export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Main export function ─── */
function prExportCSV(rows, year, month) {
  var exportRows = buildExportRows(rows, year, month);
  if (!exportRows.length) {
    alert('Нет данных для экспорта');
    return;
  }
  var csv = generateCSV(exportRows);
  var filename = 'payroll_' + year + '-' + String(month).padStart(2, '0') + '.csv';
  downloadCSV(csv, filename);
}
