/* ─── GET /api/payroll/{period} ───
   Возвращает данные зарплатного дашборда за период.
   Читает снапшот из Vercel Blob (public store).
   ──────────────────────────────────── */

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

  const view = req.query.view || 'summary'; // summary | details

  try {
    const blobKey = `payroll-snapshot-${period}.json`;

    /* Ищем снапшот в Blob */
    const { blobs } = await list({ prefix: blobKey, limit: 1 });

    if (!blobs || blobs.length === 0) {
      return res.status(404).json({
        error: 'No data found for this period',
        period: period,
        hint: 'Manager needs to save data first from the payroll dashboard'
      });
    }

    /* Загружаем снапшот (public store — URL доступен напрямую) */
    const snapshotResp = await fetch(blobs[0].url);
    if (!snapshotResp.ok) {
      return res.status(502).json({ error: 'Failed to fetch snapshot from storage' });
    }

    const snapshot = await snapshotResp.json();

    /* Фильтруем по view */
    if (view === 'details') {
      return res.status(200).json({
        period: snapshot.period,
        savedAt: snapshot.savedAt,
        version: snapshot.version,
        developers: snapshot.developers || [],
        details: snapshot.details || []
      });
    }

    /* summary (по умолчанию) */
    return res.status(200).json({
      period: snapshot.period,
      savedAt: snapshot.savedAt,
      version: snapshot.version,
      developers: snapshot.developers || [],
      totals: snapshot.totals || {}
    });

  } catch (err) {
    console.error('[payroll/period] Error:', err.message);
    if (err.message && err.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return res.status(500).json({
        error: 'Vercel Blob not configured. Enable Blob storage in your Vercel project dashboard.',
        details: err.message
      });
    }
    return res.status(500).json({ error: 'Failed to load data', details: err.message });
  }
}
