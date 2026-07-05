/* ─── POST /api/admin/mark-processed ───
   Backlink от 1С: отмечает задачи как обработанные.
   1С вызывает после формирования счетов/актов, чтобы при следующей выгрузке
   эти задачи не попали повторно.

   Тело запроса:
   {
     "period": "2026-05",
     "items": [
       { "taskId": 1234, "action": "invoice_created", "processedAt": "2026-06-02T10:00:00Z" },
       { "taskId": 5678, "action": "paid_out",        "processedAt": "2026-06-02T10:05:00Z" }
     ]
   }

   action:
     'invoice_created' — 1С сформировала счёт клиенту (для задач из invoices)
     'paid_out'        — 1С провела акт + выплату разрабу (для задач из payouts)

   Логика:
   - Читаем существующий payroll-processed-{period}.json (если есть)
   - Дополняем/обновляем записи из пришедшего items[]
   - Сохраняем обратно в Vercel Blob
   ──────────────────────────────────────────────── */

import { put, list } from '@vercel/blob';

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } }
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* API-ключ */
  const apiKey = req.query.key || req.headers['x-api-key'] || '';
  const validKey = process.env.PAYROLL_API_KEY || 'pr_api_2026';
  if (apiKey !== validKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  try {
    const body = req.body;
    if (!body || !body.period || !Array.isArray(body.items)) {
      return res.status(400).json({ error: 'Missing period or items[] in body' });
    }

    const periodKey = body.period;
    const blobKey = `payroll-processed-${periodKey}.json`;

    /* 1. Загружаем существующий processed-файл */
    let existingItems = [];
    try {
      const { blobs } = await list({ prefix: blobKey, limit: 1 });
      if (blobs && blobs.length > 0) {
        const resp = await fetch(blobs[0].url);
        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.items)) existingItems = data.items;
        }
      }
    } catch (e) {
      console.warn('[mark-processed] Не удалось прочитать существующий файл:', e.message);
    }

    /* 2. Merge: существующие + новые. Перезаписываем по taskId. */
    const map = {};
    existingItems.forEach(function(it) {
      map[String(it.taskId)] = it;
    });
    body.items.forEach(function(it) {
      if (!it.taskId) return;
      map[String(it.taskId)] = {
        taskId: parseInt(it.taskId, 10),
        action: it.action || 'unknown',
        processedAt: it.processedAt || new Date().toISOString()
      };
    });

    const allItems = Object.keys(map).map(function(k) { return map[k]; });

    /* 3. Сохраняем в Vercel Blob */
    const payload = {
      period: periodKey,
      updatedAt: new Date().toISOString(),
      itemsCount: allItems.length,
      items: allItems
    };

    const blob = await put(blobKey, JSON.stringify(payload), {
      contentType: 'application/json',
      addRandomSuffix: false
    });

    return res.status(200).json({
      ok: true,
      period: periodKey,
      itemsCount: allItems.length,
      url: blob.url,
      updatedAt: payload.updatedAt
    });

  } catch (err) {
    console.error('[mark-processed] Error:', err.message);
    if (err.message && err.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return res.status(500).json({
        error: 'Vercel Blob not configured. Enable Blob storage in your Vercel project dashboard.',
        details: err.message
      });
    }
    return res.status(500).json({ error: 'Save failed', details: err.message });
  }
}
