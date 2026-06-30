/**
 * CORS-прокси к Bitrix24.
 *
 * Фронтенд не может напрямую ходить на 1c-cms.bitrix24.ru (CORS),
 * поэтому все вызовы bxPost() идут через этот эндпоинт.
 *
 * Маршрут:  /api/bx/<method>?hook=<encoded_hook_url>
 *           body: любой JSON (для POST)
 *
 * Vercel.json rewrite: /api/bx/:method -> /api/bx-proxy.js?method=:method
 *
 * Пример:   POST /api/bx/task.elapseditem.getlist?hook=https%3A%2F%2F1c-cms.bitrix24.ru%2Frest%2F116%2F48yuunr8ss2u18qm%2F
 *           body: [0, {}, {">=CREATED_DATE":"2026-06-05","<=CREATED_DATE":"2026-06-05 23:59:59"}, ["ID","TASK_ID","USER_ID","MINUTES","SECONDS","CREATED_DATE","COMMENT_TEXT"]]
 *           -> форвардится на: POST https://1c-cms.bitrix24.ru/rest/116/48yuunr8ss2u18qm/task.elapseditem.getlist.json
 *
 * Заменяет старый Python Flask прокси из api/index.py.
 */

const DEFAULT_HOOK = 'https://1c-cms.bitrix24.ru/rest/116/48yuunr8ss2u18qm/';

export default async function handler(req, res) {
  /* CORS для браузера */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  /* method приходит из query (?method=... после Vercel rewrite) */
  const method = req.query.method;
  if (!method || typeof method !== 'string') {
    return res.status(400).json({ error: 'Missing method. Use /api/bx/<method>' });
  }

  /* hook из query, иначе дефолтный */
  const hook = (req.query.hook || DEFAULT_HOOK).trim();
  if (!hook.startsWith('http')) {
    return res.status(400).json({ error: 'Invalid hook URL' });
  }

  /* URL = hook + method + .json */
  const targetUrl = hook.replace(/\/+$/, '') + '/' + method + '.json';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const fetchOpts = {
      method: req.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    };

    if (req.method === 'POST' || req.method === 'PUT') {
      fetchOpts.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    }

    const bxResp = await fetch(targetUrl, fetchOpts);
    clearTimeout(timeout);

    if (!bxResp.ok) {
      const txt = await bxResp.text().catch(() => '');
      return res.status(bxResp.status).json({
        error: 'Bitrix24 returned ' + bxResp.status,
        url: targetUrl,
        body: txt.slice(0, 500),
      });
    }

    const data = await bxResp.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('[bx-proxy] Error for', method, ':', err.message);
    return res.status(502).json({
      error: 'Proxy error: ' + err.message,
      method: method,
      url: targetUrl,
    });
  }
}
