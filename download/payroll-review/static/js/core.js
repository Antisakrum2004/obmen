/* ═══════════════════════════════════════════════════════════════
   core.js — Payroll Review Prototype
   Совместим с архитектурой dashboard V187
   ═══════════════════════════════════════════════════════════════ */

var APP_VERSION = 'PR-0.1.0';

/* ─── Constants ─── */
var PH = 7;
var CL = ['#4f8bff','#22d47e','#f5a623','#7c5cfc','#ff4f6a','#00d4ff','#ff8c42','#a8ff78'];
var MONTHS_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
var MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
var DAYS_RU = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

/* ─── Developers (из production dashboard) ─── */
var DEVELOPERS = {
  '1':  'Макаров Владимир',
  '18': 'Приходько Константин',
  '38': 'Соколовский Александр',
  '54': 'Попов Саша',
  '82': 'Забиров Тимур',
  '92': 'Кашина Елена',
  '98': 'Замшина Ольга',
  '116': 'Предеин Андрей'
};
var DEV_IDS = Object.keys(DEVELOPERS).map(Number);

/* ─── Rates (MVP: temporary config mapping) ─── */
var DEV_RATES = {
  '1':  800,
  '18': 1000,
  '38': 1300,
  '54': 900,
  '82': 1100,
  '92': 850,
  '98': 800,
  '116': 750
};

/* ─── Excluded projects ─── */
var EXCLUDE_GROUPS = {'2':1,'22':1,'24':1,'28':1,'42':1,'48':1};

/* ─── Hook ─── */
var HOOK = '';
try { HOOK = localStorage.getItem('bx_hook') || ''; } catch(e) {}

/* ─── Mock mode flag ─── */
var PR_MOCK_MODE = !HOOK;

/* ─── Utilities ─── */
function fmt(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function mhm(m) {
  var h = Math.floor(Math.abs(m) / 60), mm = Math.abs(m) % 60;
  return h + ':' + String(mm).padStart(2, '0');
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, n) {
  if (!s) return '';
  s = String(s).trim();
  return s.length <= n ? s : s.substring(0, n - 1) + '...';
}

function getFirstName(f) {
  return (f || '').split(' ')[1] || f;
}

function parseBitrixDate(s) {
  if (!s) return null;
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  var m = s.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/);
  if (m) return new Date(m[3], m[2] - 1, m[1], m[4] || 0, m[5] || 0, m[6] || 0);
  m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return new Date(m[3], m[2] - 1, m[1]);
  return null;
}

function prGetRate(developerId) {
  return DEV_RATES[String(developerId)] || 0;
}

/* ─── API ─── */
function bxPost(method, body) {
  body = body || {};
  if (!HOOK) return Promise.resolve(null);
  var u = '/api/' + method + '?hook=' + encodeURIComponent(HOOK.trim());
  return fetch(u, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  }).then(function(r) { return r.json(); })
    .then(function(d) { if (d.error) { console.error('BX', method, d.error); return d; } return d; })
    .catch(function(e) { console.error('NET', method, e); return {error: e.message}; });
}

function bxPostAsDev(method, body, devId) {
  body = body || {};
  if (!HOOK) return Promise.resolve(null);
  body.params = body.params || {};
  body.params.USER_ID = parseInt(devId);
  var u = '/api/' + method + '?hook=' + encodeURIComponent(HOOK.trim());
  return fetch(u, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  }).then(function(r) { return r.json(); })
    .then(function(d) { if (d.error) { console.error('BX-asDev', method, 'devId=' + devId, d.error); return d; } return d; })
    .catch(function(e) { console.error('NET-asDev', method, e); return {error: e.message}; });
}

function fetchTasksPaginated(body, maxPages) {
  var all = [], start = 0, pages = 0, maxP = maxPages || 20;
  function step() {
    pages++;
    if (pages > maxP) {
      console.warn('fetchTasksPaginated: limit ' + maxP + ' pages reached, ' + all.length + ' tasks');
      return all;
    }
    return bxPost('tasks.task.list', Object.assign({start: start}, body)).then(function(r) {
      var tasks = (r && r.result && r.result.tasks) || [];
      all = all.concat(tasks);
      if (r && r.next && tasks.length >= 50) { start = r.next; return step(); }
      return all;
    });
  }
  return step();
}

/* ─── Period helpers ─── */
function prGetCurrentMonth() {
  var n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() + 1 };
}

function prGetMonthRange(year, month) {
  var from = new Date(year, month - 1, 1);
  var to = new Date(year, month, 0);
  return { from: from, to: to, days: to.getDate() };
}

function prGetPeriodKey(year, month) {
  return year + '-' + String(month).padStart(2, '0');
}

/* ─── Global state ─── */
var allData = null;
var prCurrentPeriod = prGetCurrentMonth();
