/* ═══════════════════════════════════════════════════════════════
   pr-export-svc.js — ExportService

   Изолированный модуль экспорта CSV. Две функции:
   _prExport (агрегированный) и _prExportDetailed (детальный).

   Зависимости: _pr (state), _prSaveAll, prCurrentPeriod,
   prGetPeriodKey, createPayrollExportDTO, serializeDTOToAggregatedCSV,
   serializeDTOToDetailedCSV, downloadCSV, prExportCSV,
   prExportDetailedCSV, PayrollCache
   ═══════════════════════════════════════════════════════════════ */

var PR_EXPORT_SVC_VERSION = '1.0.0';

function _prExport() {
  if (!_pr.rows.length) return;
  _prSaveAll();
  /* Stage 12: Invalidate cache on export */
  if (typeof PayrollCache !== 'undefined') {
    var pk = prGetPeriodKey(prCurrentPeriod.year, prCurrentPeriod.month);
    PayrollCache.invalidate('data:' + pk);
  }

  if (typeof createPayrollExportDTO === 'function' && typeof serializeDTOToAggregatedCSV === 'function') {
    var dto = createPayrollExportDTO(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
    if (!dto.aggregated.length) {
      alert('Нет данных для экспорта');
      return;
    }
    var csv = serializeDTOToAggregatedCSV(dto);
    var filename = 'зарплата_' + prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0') + '.csv';
    downloadCSV(csv, filename);
  } else if (typeof prExportCSV === 'function') {
    prExportCSV(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
  }
}

function _prExportDetailed() {
  if (!_pr.rows.length) return;
  _prSaveAll();

  if (typeof createPayrollExportDTO === 'function' && typeof serializeDTOToDetailedCSV === 'function') {
    var dto = createPayrollExportDTO(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
    if (!dto.detailed.length) {
      alert('Нет данных для экспорта');
      return;
    }
    var csv = serializeDTOToDetailedCSV(dto);
    var filename = 'зарплата_детально_' + prCurrentPeriod.year + '-' + String(prCurrentPeriod.month).padStart(2, '0') + '.csv';
    downloadCSV(csv, filename);
  } else if (typeof prExportDetailedCSV === 'function') {
    prExportDetailedCSV(_pr.rows, prCurrentPeriod.year, prCurrentPeriod.month);
  }
}
