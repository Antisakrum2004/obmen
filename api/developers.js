/* ─── Справочник разработчиков ───
   Возвращает конфиг разработчиков (ставки, ИНН, реквизиты).
   Данные берутся из последнего сохранённого снапшота.
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

  const apiKey = req.query.key || req.headers['x-api-key'] || '';
  const validKey = process.env.PAYROLL_API_KEY || 'pr_api_2026';
  if (apiKey !== validKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  try {
    /* Ищем самый свежий снапшот */
    const { blobs } = await list({ prefix: 'payroll-snapshot-', limit: 1 });

    if (!blobs || blobs.length === 0) {
      return res.status(404).json({
        error: 'No data found',
        hint: 'Manager needs to save data first from the payroll dashboard'
      });
    }

    const snapshotResp = await fetch(blobs[0].url);
    if (!snapshotResp.ok) {
      return res.status(502).json({ error: 'Failed to fetch data from storage' });
    }

    const snapshot = await snapshotResp.json();

    /* Извлекаем только справочник разработчиков */
    const developers = (snapshot.developers || []).map(function(dev) {
      return {
        devId: dev.devId,
        fullName: dev.fullName,
        inn: dev.inn || '',
        selfEmployed: dev.selfEmployed || '',
        bank: dev.bank || '',
        contract: dev.contract || '',
        contractDate: dev.contractDate || '',
        rate: dev.rate || 0,
        clientRate: dev.clientRate || 0,
        base: dev.base || 0,
        fine: dev.fine || 0,
        fineComment: dev.fineComment || '',
        fines: dev.fines || [],
        notes: dev.notes || '',
        active: dev.active !== false
      };
    });

    return res.status(200).json({
      period: snapshot.period,
      savedAt: snapshot.savedAt,
      developers: developers
    });

  } catch (err) {
    console.error('[developers] Error:', err.message);
    if (err.message && err.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return res.status(500).json({
        error: 'Vercel Blob not configured. Enable Blob storage in your Vercel project dashboard.',
        details: err.message
      });
    }
    return res.status(500).json({ error: 'Failed to load data', details: err.message });
  }
}
