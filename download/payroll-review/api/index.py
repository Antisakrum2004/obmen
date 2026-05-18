from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import requests as http_requests
import os

# Resolve absolute path to static directory
_STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static'))

app = Flask(__name__, static_folder=_STATIC_DIR, static_url_path='')
CORS(app)

# Webhook hardcoded for prototype
DEFAULT_HOOK = 'https://1c-cms.bitrix24.ru/rest/116/48yuunr8ss2u18qm/'

# MIME types for static files
_MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
}

def _mime_for(path):
    ext = os.path.splitext(path)[1].lower()
    return _MIME.get(ext, 'application/octet-stream')

@app.route('/')
def index():
    return send_from_directory(_STATIC_DIR, 'index.html')

@app.route('/js/<path:filename>')
def js_files(filename):
    return send_from_directory(os.path.join(_STATIC_DIR, 'js'), filename)

@app.route('/css/<path:filename>')
def css_files(filename):
    return send_from_directory(os.path.join(_STATIC_DIR, 'css'), filename)

@app.route('/api/<path:method>', methods=['GET', 'POST', 'OPTIONS'])
def proxy_api(method):
    if request.method == 'OPTIONS':
        return '', 204

    hook = request.args.get('hook', DEFAULT_HOOK)
    url = hook.rstrip('/') + '/' + method + '.json'

    try:
        if request.method == 'POST':
            json_data = request.get_json(silent=True) or {}
            resp = http_requests.post(url, json=json_data, timeout=30)
        else:
            params = {k: v for k, v in request.args.items() if k != 'hook'}
            resp = http_requests.get(url, params=params, timeout=30)

        return jsonify(resp.json())
    except Exception as e:
        return jsonify({'error': str(e), 'method': method}), 502

# Catch-all: serve any static file, or return index.html for SPA
@app.route('/<path:filepath>')
def catch_all(filepath):
    full_path = os.path.join(_STATIC_DIR, filepath)
    if os.path.isfile(full_path):
        directory = os.path.dirname(full_path)
        filename = os.path.basename(full_path)
        response = send_from_directory(directory, filename)
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return response
    # Fallback to index.html for SPA routing
    return send_from_directory(_STATIC_DIR, 'index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5000)
