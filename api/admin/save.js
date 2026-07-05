import { put } from '@vercel/blob';

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

  /* API-ключ из query или заголовка */
  const apiKey = req.query.key || req.headers['x-api-key'] || '';
  const validKey = process.env.PAYROLL_API_KEY || 'pr_api_2026';
  if (apiKey !== validKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  try {
    const body = req.body;
    if (!body || !body.period) {
      return res.status(400).json({ error: 'Missing period in body' });
    }

    const periodKey = body.period; // e.g. "2026-05"
    const blobKey = `payroll-snapshot-${periodKey}.json`;

    /* Добавляем метаданные */
    const snapshot = {
      ...body,
      savedAt: new Date().toISOString(),
      version: 1
    };

    /* Сохраняем в Vercel Blob (private store) */
    const blob = await put(blobKey, JSON.stringify(snapshot), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false
    });

    return res.status(200).json({
      ok: true,
      period: periodKey,
      url: blob.url,
      savedAt: snapshot.savedAt
    });

  } catch (err) {
    console.error('[admin/save] Error:', err.message);
    if (err.message && err.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return res.status(500).json({
        error: 'Vercel Blob not configured. Enable Blob storage in your Vercel project dashboard.',
        details: err.message
      });
    }
    return res.status(500).json({ error: 'Save failed', details: err.message });
  }
}
