const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 5000;
const STATIC = path.join(__dirname, 'static');
const DEFAULT_HOOK = 'https://1c-cms.bitrix24.ru/rest/116/48yuunr8ss2u18qm/';

const MIME = {'.html':'text/html;charset=utf-8','.js':'application/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json;charset=utf-8','.svg':'image/svg+xml'};

http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  
  // API proxy
  if (u.pathname.startsWith('/api/')) {
    const method = u.pathname.replace('/api/', '');
    const hook = u.query.hook || DEFAULT_HOOK;
    const apiUrl = hook.replace(/\/$/, '') + '/' + method + '.json';
    
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const opts = { method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 60000 };
        const proxy = https.request(apiUrl, opts, pRes => {
          res.writeHead(pRes.statusCode, {'Content-Type': 'application/json'});
          pRes.pipe(res);
        });
        proxy.on('error', e => { res.writeHead(502); res.end(JSON.stringify({error: e.message})); });
        proxy.write(body || '{}');
        proxy.end();
      });
    } else {
      https.get(apiUrl, pRes => {
        res.writeHead(pRes.statusCode, {'Content-Type': 'application/json'});
        pRes.pipe(res);
      }).on('error', e => { res.writeHead(502); res.end(JSON.stringify({error: e.message})); });
    }
    return;
  }
  
  // Static files
  let fp = path.join(STATIC, u.pathname === '/' ? 'index.html' : u.pathname);
  try {
    const data = fs.readFileSync(fp);
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    res.end(data);
  } catch(e) {
    // SPA fallback
    try {
      const data = fs.readFileSync(path.join(STATIC, 'index.html'));
      res.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});
      res.end(data);
    } catch(e2) {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
});
