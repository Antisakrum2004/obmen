/* ═══════════════════════════════════════════════════════════════
   core.js — Payroll Review Prototype
   Совместим с архитектурой dashboard V187
   ═══════════════════════════════════════════════════════════════ */

var APP_VERSION = 'PR-0.2.0';

/* ─── Constants ─── */
var PH = 7;
var CL = ['#4f8bff','#22d47e','#f5a623','#7c5cfc','#ff4f6a','#00d4ff','#ff8c42','#a8ff78'];
var MONTHS_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
var MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
var DAYS_RU = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

/* ─── Developers (реальные из 1С-АйтиЛаб Bitrix24) ─── */
var DEVELOPERS = {
  '1':   'Владимир Макаров',
  '18':  'Константин Приходько',
  '38':  'Александр Соколовский',
  '54':  'Александр Попов',
  '80':  'Сергей Приходько',
  '82':  'Тимур Забиров',
  '92':  'Елена Кашина',
  '94':  'Denius Coder',
  '96':  'Марина Савчук',
  '98':  'Ольга Замшина',
  '116': 'Андрей Предеин'
};
var DEV_IDS = Object.keys(DEVELOPERS).map(Number);

/* ─── Rates (MVP: временный конфиг, потом из справочника) ─── */
var DEV_RATES = {
  '1':   800,
  '18':  1000,
  '38':  1300,
  '54':  900,
  '80':  1100,
  '82':  1100,
  '92':  850,
  '94':  750,
  '96':  800,
  '98':  800,
  '116': 750
};

/* ─── Projects (из GROUP_ID Bitrix24) ─── */
var PROJECTS = {
  '2':  'Обучение 1с',
  '4':  'Живое пиво',
  '6':  'Бигап',
  '8':  'Кровля',
  '10': 'Сантехмол',
  '12': 'АгроСервис',
  '14': 'АвтоБриф',
  '16': 'МС Лизинг',
  '18': 'Самокаты центр',
  '20': 'ВДЛ',
  '22': 'Тацинка',
  '24': 'Обучение 1с скрам',
  '26': 'Текущие задачи 1с',
  '30': 'Разработка и поддержка сайтов',
  '32': 'Дакар',
  '34': 'Награды',
  '36': 'Медицина КЗ',
  '38': 'Трезвый декларант',
  '40': 'АМР',
  '42': 'ИТ Контроль',
  '44': 'Приправы Дона',
  '48': '[APP GBL] Просроченные',
  '50': 'ИП Белолапотко',
  '52': 'ООО ОПТИМАПЛАСТ',
  '54': 'Рокас',
  '58': 'Милана',
  '60': 'Кондитеры',
  '62': 'Нейс-Юг',
  '64': 'Завод Милл ФАУЗ',
  '66': 'ИП Иванов',
  '68': 'Прочие',
  '70': 'МАРКДЖЕТ ООО',
  '72': 'Керамика Фабрика',
  '74': 'Керамика',
  '76': '1с Разработка Валерий Вишневский',
  '78': 'Backlog',
  '80': 'Все проекты',
  '82': 'ЮРИСТЫ БИГАП'
};

/* ─── Excluded projects (служебные группы) ─── */
var EXCLUDE_GROUPS = {
  '2':1,  /* Обучение 1с */
  '22':1, /* Тацинка */
  '24':1, /* Обучение 1с скрам */
  '26':1, /* Текущие задачи 1с */
  '42':1, /* ИТ Контроль */
  '48':1, /* [APP GBL] Просроченные */
  '78':1, /* Backlog */
  '80':1  /* Все проекты */
};

/* ─── Hook (зашит прямо в код) ─── */
var PR_DEFAULT_HOOK = 'https://1c-cms.bitrix24.ru/rest/116/48yuunr8ss2u18qm/';
var HOOK = '';
try { HOOK = localStorage.getItem('bx_hook') || PR_DEFAULT_HOOK; } catch(e) { HOOK = PR_DEFAULT_HOOK; }

/* ─── Mock mode ───
   PR_FORCE_MOCK = true  → всегда мок (тест без API)
   PR_FORCE_MOCK = false → живые данные через Bitrix24 API
   Переключатель есть в UI: кнопка MOCK/LIVE в топбаре
*/
var PR_FORCE_MOCK = true;
var PR_MOCK_MODE = PR_FORCE_MOCK || !HOOK;

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
