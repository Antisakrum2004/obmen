/* ═══════════════════════════════════════════════════════════════
   payroll-export.js — Слой экспорта
   Генерация CSV и других форматов для 1С.
   НЕ зависит от DOM (кроме downloadCSV — триггер скачивания).
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   Построение строк экспорта
   ═══════════════════════════════════════════════════════════════ */

/**
 * Построить строки экспорта из TaskReview[]
 * Группировка по разработчику, агрегация часов и сумм
 * @param {Array} reviews — TaskReview[]
 * @param {Number} year
 * @param {Number} month
 * @param {Object} innProvider — { getInn(devId) } (опционально)
 * @returns {Array} PayrollExportRow[]
 */
function buildExportRows(reviews, year, month, innProvider) {
  var periodStr = '';
  if (typeof МЕСЯЦЫ_ПОЛН !== 'undefined') {
    periodStr = МЕСЯЦЫ_ПОЛН[month - 1] + ' ' + year;
  } else {
    periodStr = year + '-' + String(month).padStart(2, '0');
  }

  var byDev = {};
  (reviews || []).forEach(function(r) {
    if (r.reviewStatus === PR_REVIEW_STATUS.EXCLUDED) return;
    var uid = String(r.developerId);
    if (!byDev[uid]) {
      var inn = '';
      if (innProvider && typeof innProvider.getInn === 'function') {
        inn = innProvider.getInn(uid);
      } else if (typeof prGetInn === 'function') {
        inn = prGetInn(uid);
      }

      byDev[uid] = {
        fullName: r.developerName,
        inn: inn,
        totalPayrollHours: 0,
        rate: r.rate,
        base: r.base,
        totalAmount: 0,
        taskComments: [],
        taskCount: 0,
        tasks: []
      };
    }
    byDev[uid].totalPayrollHours += r.payrollHours;
    byDev[uid].totalAmount += r.payrollAmount;
    byDev[uid].taskCount++;
    if (r.managerComment) {
      byDev[uid].taskComments.push(r.taskTitle + ': ' + r.managerComment);
    }
    byDev[uid].tasks.push({
      taskId: r.taskId,
      taskTitle: r.taskTitle,
      projectName: r.projectName,
      payrollHours: r.payrollHours,
      payrollAmount: r.payrollAmount,
      reviewStatus: r.reviewStatus,
      managerComment: r.managerComment
    });
  });

  var exportRows = [];
  Object.keys(byDev).forEach(function(uid) {
    var d = byDev[uid];
    exportRows.push({
      fullName: d.fullName,
      inn: d.inn,
      period: periodStr,
      hours: safeRound(d.totalPayrollHours, 1),
      rate: d.rate,
      base: d.base,
      amount: Math.round(d.totalAmount),
      comment: d.taskComments.join('; '),
      taskCount: d.taskCount,
      tasks: d.tasks
    });
  });

  return exportRows;
}

/**
 * Построить детальный экспорт — одна строка на задачу
 * @param {Array} reviews — TaskReview[]
 * @param {Number} year
 * @param {Number} month
 * @returns {Array} DetailedExportRow[]
 */
function buildDetailedExportRows(reviews, year, month, innProvider) {
  var periodStr = '';
  if (typeof МЕСЯЦЫ_ПОЛН !== 'undefined') {
    periodStr = МЕСЯЦЫ_ПОЛН[month - 1] + ' ' + year;
  } else {
    periodStr = year + '-' + String(month).padStart(2, '0');
  }

  return (reviews || []).filter(function(r) {
    return r.reviewStatus !== PR_REVIEW_STATUS.EXCLUDED;
  }).map(function(r) {
    var inn = '';
    if (innProvider && typeof innProvider.getInn === 'function') {
      inn = innProvider.getInn(r.developerId);
    } else if (typeof prGetInn === 'function') {
      inn = prGetInn(r.developerId);
    }

    return {
      fullName: r.developerName,
      inn: inn,
      period: periodStr,
      taskId: r.taskId,
      taskTitle: r.taskTitle,
      projectName: r.projectName,
      factHours: r.factHours,
      billableHours: r.billableHours,
      payrollHours: r.payrollHours,
      rate: r.rate,
      base: r.base,
      payrollAmount: r.payrollAmount,
      reviewStatus: r.reviewStatus,
      managerComment: r.managerComment
    };
  });
}

/* ═══════════════════════════════════════════════════════════════
   CSV генерация
   ═══════════════════════════════════════════════════════════════ */

/**
 * Сгенерировать CSV из агрегированных строк (по разработчикам)
 * @param {Array} exportRows — из buildExportRows()
 * @returns {String} CSV content
 */
function generateCSV(exportRows) {
  var sep = ';';
  var lines = [];

  lines.push(['ФИО','ИНН','Период','Часы','Ставка','Базовая','Сумма','Комментарий'].join(sep));

  (exportRows || []).forEach(function(r) {
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

/**
 * Сгенерировать детальный CSV (одна строка на задачу)
 * @param {Array} detailedRows — из buildDetailedExportRows()
 * @returns {String}
 */
function generateDetailedCSV(detailedRows) {
  var sep = ';';
  var lines = [];

  lines.push([
    'ФИО','ИНН','Период','ID задачи','Задача','Проект',
    'Факт(ч)','Опл.клиенту(ч)','К выплате(ч)',
    'Ставка','Базовая','Сумма','Статус','Комментарий'
  ].join(sep));

  var statusLabels = {
    pending: 'Ожидает',
    approved: 'Подтверждено',
    disputed: 'Спор',
    excluded: 'Исключено'
  };

  (detailedRows || []).forEach(function(r) {
    var row = [
      '"' + (r.fullName || '').replace(/"/g, '""') + '"',
      r.inn || '',
      '"' + r.period + '"',
      r.taskId || '',
      '"' + (r.taskTitle || '').replace(/"/g, '""') + '"',
      '"' + (r.projectName || '').replace(/"/g, '""') + '"',
      String(r.factHours).replace('.', ','),
      String(r.billableHours).replace('.', ','),
      String(r.payrollHours).replace('.', ','),
      String(r.rate).replace('.', ','),
      String(r.base).replace('.', ','),
      String(r.payrollAmount),
      statusLabels[r.reviewStatus] || r.reviewStatus,
      '"' + (r.managerComment || '').replace(/"/g, '""') + '"'
    ];
    lines.push(row.join(sep));
  });

  return lines.join('\n');
}

/* ═══════════════════════════════════════════════════════════════
   Скачивание файлов
   ═══════════════════════════════════════════════════════════════ */

/**
 * Скачать CSV файл
 * @param {String} csvContent
 * @param {String} filename
 */
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

/**
 * Главная функция экспорта — сводный CSV по разработчикам
 * @param {Array} reviews
 * @param {Number} year
 * @param {Number} month
 */
function prExportCSV(reviews, year, month) {
  var exportRows = buildExportRows(reviews, year, month);
  if (!exportRows.length) {
    alert('Нет данных для экспорта');
    return;
  }
  var csv = generateCSV(exportRows);
  var filename = 'зарплата_' + year + '-' + String(month).padStart(2, '0') + '.csv';
  downloadCSV(csv, filename);
}

/**
 * Детальный экспорт — CSV с одной строкой на задачу
 * @param {Array} reviews
 * @param {Number} year
 * @param {Number} month
 */
function prExportDetailedCSV(reviews, year, month) {
  var detailedRows = buildDetailedExportRows(reviews, year, month);
  if (!detailedRows.length) {
    alert('Нет данных для экспорта');
    return;
  }
  var csv = generateDetailedCSV(detailedRows);
  var filename = 'зарплата_детально_' + year + '-' + String(month).padStart(2, '0') + '.csv';
  downloadCSV(csv, filename);
}
