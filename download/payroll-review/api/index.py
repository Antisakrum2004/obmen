from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests as http_requests
import os

# Resolve absolute path to static directory
_STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static'))

app = Flask(__name__, static_folder=_STATIC_DIR, static_url_path='')
CORS(app)

DEFAULT_HOOK = 'https://1c-cms.bitrix24.ru/rest/116/48yuunr8ss2u18qm/'

@app.route('/')
def index():
    return send_from_directory(_STATIC_DIR, 'index.html')

@app.route('/js/<path:filename>')
def js_files(filename):
    return send_from_directory(os.path.join(_STATIC_DIR, 'js'), filename)

@app.route('/api/<path:method>', methods=['GET', 'POST', 'OPTIONS'])
def proxy_api(method):
    if request.method == 'OPTIONS':
        return '', 204
    hook = request.args.get('hook', DEFAULT_HOOK)
    url = f"{hook.rstrip('/')}/{method}.json"

    if request.method == 'POST':
        json_data = request.get_json(silent=True) or {}
        resp = http_requests.post(url, json=json_data, timeout=30)
    else:
        params = {k: v for k, v in request.args.items() if k != 'hook'}
        resp = http_requests.get(url, params=params, timeout=30)

    return jsonify(resp.json())

if __name__ == '__main__':
    app.run(debug=True, port=5000)
