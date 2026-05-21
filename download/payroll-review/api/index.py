from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import requests as http_requests
import os, logging

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

DEFAULT_HOOK = 'https://1c-cms.bitrix24.ru/rest/116/48yuunr8ss2u18qm/'

_MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
}

# In Vercel serverless, files from includeFiles are at /var/task/
# The public/ prefix is stripped, so index.html is at /var/task/index.html
def _find_static_dir():
    # Vercel serverless: files are at /var/task/ with public/ prefix stripped
    vercel_root = '/var/task'
    if os.path.exists(os.path.join(vercel_root, 'index.html')):
        return vercel_root
    # Local dev: files are in public/ or static/
    for dirname in ['public', 'static']:
        candidate = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', dirname))
        if os.path.isdir(candidate) and os.path.exists(os.path.join(candidate, 'index.html')):
            return candidate
    return None

STATIC_DIR = _find_static_dir()

@app.route('/')
def index():
    if STATIC_DIR:
        return send_from_directory(STATIC_DIR, 'index.html')
    return jsonify({'error': 'Static dir not found'}), 404

@app.route('/js/<path:filename>')
def js_files(filename):
    if STATIC_DIR:
        return send_from_directory(os.path.join(STATIC_DIR, 'js'), filename)
    return jsonify({'error': 'Static dir not found'}), 404

@app.route('/css/<path:filename>')
def css_files(filename):
    if STATIC_DIR:
        return send_from_directory(os.path.join(STATIC_DIR, 'css'), filename)
    return jsonify({'error': 'Static dir not found'}), 404

@app.route('/api/<path:method>', methods=['GET', 'POST', 'OPTIONS'])
def proxy_api(method):
    if request.method == 'OPTIONS':
        return '', 204
    hook = request.args.get('hook', DEFAULT_HOOK)
    url = hook.rstrip('/') + '/' + method + '.json'
    timeout = 60 if 'batch' in method else 30
    try:
        if request.method == 'POST':
            json_data = request.get_json(silent=True) or {}
            resp = http_requests.post(url, json=json_data, timeout=timeout)
        else:
            params = {k: v for k, v in request.args.items() if k != 'hook'}
            resp = http_requests.get(url, params=params, timeout=timeout)
        result = resp.json()
        if isinstance(result, dict) and result.get('error'):
            app.logger.info('BX API %s -> error: %s', method, result.get('error'))
        return jsonify(result)
    except Exception as e:
        app.logger.error('Proxy error for %s: %s', method, str(e))
        return jsonify({'error': str(e), 'method': method}), 502

@app.route('/<path:filepath>')
def catch_all(filepath):
    if STATIC_DIR:
        full_path = os.path.join(STATIC_DIR, filepath)
        if os.path.isfile(full_path):
            directory = os.path.dirname(full_path)
            filename = os.path.basename(full_path)
            response = send_from_directory(directory, filename)
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            return response
        return send_from_directory(STATIC_DIR, 'index.html')
    return jsonify({'error': 'Static dir not found'}), 404

if __name__ == '__main__':
    app.run(debug=True, port=5000)
