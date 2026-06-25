/* ─── GET /api/payroll/{period}/billing ───
   Возвращает данные для 1С: задачи готовые к выставлению счёта и к оплате.
   Берёт снапшот за период + фильтрует по платёжному статусу:
     - invoices: paymentStatus === 'invoice'  → 1С формирует счёт клиенту
     - payouts:  paymentStatus === 'paid'     → 1С формирует акт + выплату разрабу
   Исключает задачи, уже помеченные как обработанные (через /api/admin/mark-processed).
   ──────────────────────────────────────────────── */

import { list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* API-ключ */
  const apiKey = req.query.key || req.headers['x-api-key'] || '';
  const validKey = process.env.PAYROLL_API_KEY || 'pr_api_2026';
  if (apiKey !== validKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  const { period } = req.query;
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'Invalid period format. Use YYYY-MM, e.g. 2026-05' });
  }

  try {
    /* 1. Загружаем снапшот за период */
    const snapshotKey = `payroll-snapshot-${period}.json`;
    const { blobs } = await list({ prefix: snapshotKey, limit: 1 });

    if (!blobs || blobs.length === 0) {
      return res.status(404).json({
        error: 'No data found for this period',
        period: period,
        hint: 'Manager needs to save data first from the payroll dashboard'
      });
    }

    const snapshotResp = await fetch(blobs[0].url);
    if (!snapshotResp.ok) {
      return res.status(502).json({ error: 'Failed to fetch snapshot from storage' });
    }
    const snapshot = await snapshotResp.json();

    /* 2. Загружаем список обработанных задач (если есть) */
    const processedKey = `payroll-processed-${period}.json`;
    let processedMap = {}; /* taskId -> {action, processedAt} */
    try {
      const procBlobs = await list({ prefix: processedKey, limit: 1 });
      if (procBlobs.blobs && procBlobs.blobs.length > 0) {
        const procResp = await fetch(procBlobs.blobs[0].url);
        if (procResp.ok) {
          const procData = await procResp.json();
          if (procData && Array.isArray(procData.items)) {
            procData.items.forEach(function(item) {
              processedMap[String(item.taskId)] = item;
            });
          }
        }
      }
    } catch (e) {
      console.warn('[billing] Не удалось загрузить processed-файл:', e.message);
    }

    /* 3. Готовим справочник разработчиков для удобства 1С */
    const devMap = {};
    (snapshot.developers || []).forEach(function(d) {
      devMap[String(d.devId)] = d;
    });

    /* 4. Группируем details по paymentStatus */
    const invoices = []; /* paymentStatus === 'invoice' и не обработаны */
    const payouts = [];  /* paymentStatus === 'paid' и не обработаны */

    (snapshot.details || []).forEach(function(d) {
      /* Пропускаем обработанные (двойная защита) */
      if (processedMap[String(d.taskId)]) return;

      if (d.paymentStatus === 'invoice') {
        invoices.push({
          taskId: d.taskId,
          taskTitle: d.taskTitle,
          projectId: d.projectId,
          projectName: d.projectName,
          stageId: d.stageId,
          stageName: d.stageName,
          developer: _billingDev(devMap[String(d.devId)]),
          hours: d.billableHours,
          rate: d.rate,
          amount: d.payrollAmount,
          clientRate: d.clientRate,
          clientAmount: d.clientAmount,
          date: d.date
        });
      } else if (d.paymentStatus === 'paid') {
        payouts.push({
          taskId: d.taskId,
          taskTitle: d.taskTitle,
          projectId: d.projectId,
          projectName: d.projectName,
          stageId: d.stageId,
          stageName: d.stageName,
          developer: _billingDev(devMap[String(d.devId)]),
          hours: d.billableHours,
          rate: d.rate,
          amount: d.payrollAmount,
          clientRate: d.clientRate,
          clientAmount: d.clientAmount,
          date: d.date
        });
      }
    });

    /* 5. Итоги */
    const invoicesTotal = invoices.reduce(function(s, i) { return s + i.amount; }, 0);
    const payoutsTotal = payouts.reduce(function(s, p) { return s + p.amount; }, 0);
    const clientInvoicesTotal = invoices.reduce(function(s, i) { return s + i.clientAmount; }, 0);
    const clientPayoutsTotal = payouts.reduce(function(s, p) { return s + p.clientAmount; }, 0);

    return res.status(200).json({
      period: snapshot.period,
      generatedAt: new Date().toISOString(),
      savedAt: snapshot.savedAt,
      version: snapshot.version,
      invoices: invoices,
      payouts: payouts,
      totals: {
        invoicesCount: invoices.length,
        invoicesAmount: Math.round(invoicesTotal),
        invoicesClientAmount: Math.round(clientInvoicesTotal),
        payoutsCount: payouts.length,
        payoutsAmount: Math.round(payoutsTotal),
        payoutsClientAmount: Math.round(clientPayoutsTotal),
        processedCount: Object.keys(processedMap).length
      }
    });

  } catch (err) {
    console.error('[billing] Error:', err.message);
    if (err.message && err.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return res.status(500).json({
        error: 'Vercel Blob not configured. Enable Blob storage in your Vercel project dashboard.',
        details: err.message
      });
    }
    return res.status(500).json({ error: 'Failed to load billing data', details: err.message });
  }
}

/* ─── Хелпер: извлечь реквизиты разработчика для 1С ─── */
function _billingDev(d) {
  if (!d) return null;
  return {
    devId: d.devId,
    fullName: d.fullName,
    inn: d.inn || '',
    selfEmployed: d.selfEmployed || '',
    bank: d.bank || '',
    contract: d.contract || '',
    contractDate: d.contractDate || ''
  };
}
