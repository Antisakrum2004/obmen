/* ═══════════════════════════════════════════════════════════════
   payroll-review-export.js — Слой экспорта
   Генерация CSV для импорта в 1С
   ═══════════════════════════════════════════════════════════════ */

/* ─── Построить строки экспорта из TaskReview[] ─── */
function buildExportRows(rows, year, month) {
  var periodStr = МЕСЯЦЫ_ПОЛН[month - 1] + ' ' + year;
  var exportRows = [];

  /* Группировка по разработчику */
  var byDev = {};
  rows.forEach(function(r) {
    if (r.reviewStatus === 'excluded') return;
    var uid = r.developerId;
    if (!byDev[uid]) {
      byDev[uid] = {
        fullName: r.developerName,
        inn: prGetInn(uid),
        totalPayrollHours: 0,
        rate: r.rate,
        base: r.base,
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
      base: d.base,
      amount: Math.round(d.totalAmount),
      comment: d.taskComments.join('; ')
    });
  });

  return exportRows;
}

/* ─── Генерация CSV ─── */
function generateCSV(exportRows) {
  var sep = ';';
  var lines = [];

  lines.push(['ФИО','ИНН','Период','Часы','Ставка','Базовая','Сумма','Комментарий'].join(sep));

  exportRows.forEach(function(r) {
    var row = [
      '"' + (r.fullName || '').replace(/"/g, '""') + '"',
      r.inn || '',
      '"' + r.period + '"',
      String(r.hours).replace('.', ','),
      String(r.rate).replace('.', ','),
      String(r.base).replace('.', ','),
      String(r.amount),
      '"' + (r.comment || '').replace(/"/g, '""') + '"'
    ];
    lines.push(row.join(sep));
  });

  return lines.join('\n');
}

/* ─── Скачать CSV ─── */
function downloadCSV(csvContent, filename) {
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

/* ─── Главная функция экспорта ─── */
function prExportCSV(rows, year, month) {
  var exportRows = buildExportRows(rows, year, month);
  if (!exportRows.length) {
    alert('Нет данных для экспорта');
    return;
  }
  var csv = generateCSV(exportRows);
  var filename = 'зарплата_' + year + '-' + String(month).padStart(2, '0') + '.csv';
  downloadCSV(csv, filename);
}
