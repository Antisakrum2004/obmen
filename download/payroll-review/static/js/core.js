/* ═══════════════════════════════════════════════════════════════
   core.js — Зарплатный обзор (Payroll Review)
   Совместим с архитектурой dashboard V187
   ═══════════════════════════════════════════════════════════════ */

var APP_VERSION = 'ПР-5.4.0';

/* ─── Константы ─── */
var PH = 7;
var CL = ['#4f8bff','#22d47e','#f5a623','#7c5cfc','#ff4f6a','#00d4ff','#ff8c42','#a8ff78'];
var МЕСЯЦЫ_КР = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
var МЕСЯЦЫ_ПОЛН = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
var ДНИ_НЕД = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
/* Оставляем английские алиасы для обратной совместимости */
var MONTHS_RU = МЕСЯЦЫ_КР;
var MONTHS_FULL = МЕСЯЦЫ_ПОЛН;
var DAYS_RU = ДНИ_НЕД;

/* ─── Разработчики (реальные из 1С-АйтиЛаб Bitrix24) ─── */
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

/* ─── Ставка по умолчанию (1000 р/час) ─── */
var СТАВКА_ПО_УМОЛЧ = 1000;

/* ─── Ставки (MVP: временный конфиг, можно менять в таблице) ─── */
var DEV_RATES = {
  '1':   1000,
  '18':  1000,
  '38':  1000,
  '54':  1000,
  '80':  1000,
  '82':  1000,
  '92':  1000,
  '94':  1000,
  '96':  1000,
  '98':  1000,
  '116': 1000
};

/* ─── Базовая часть (оклад/премия) — можно менять в админке ─── */
var DEV_BASE = {
  '1':   0,
  '18':  0,
  '38':  0,
  '54':  0,
  '80':  0,
  '82':  0,
  '92':  0,
  '94':  0,
  '96':  0,
  '98':  0,
  '116': 0
};

/* ─── ИНН разработчиков ─── */
var DEV_INN = {
  '1':   '',
  '18':  '',
  '38':  '',
  '54':  '',
  '80':  '',
  '82':  '',
  '92':  '',
  '94':  '',
  '96':  '',
  '98':  '',
  '116': ''
};

/* ─── Проекты (из GROUP_ID Bitrix24) ─── */
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

/* ─── STAGE_MAP — проекты, у которых есть пайплайны стадий ─── */
var STAGE_MAP = {
  '2':  {name:'Обучение 1с', stages:['Новые','Работа','Контроль','Готово']},
  '4':  {name:'Живое пиво', stages:['Новые','Работа','Контроль','Готово']},
  '6':  {name:'Бигап', stages:['Новые','Работа','Контроль','Готово']},
  '20': {name:'ВДЛ', stages:['Новые','Работа','Контроль','Готово']},
  '22': {name:'Тацинка', stages:['Новые','Работа','Контроль','Готово']},
  '24': {name:'Обучение 1с скрам', stages:['Новые','Работа','Контроль','Готово']},
  '32': {name:'Дакар', stages:['Новые','Работа','Контроль','Готово']},
  '36': {name:'Медицина КЗ', stages:['Новые','Работа','Контроль','Готово']},
  '42': {name:'ИТ Контроль', stages:['Новые','Работа','Контроль','Готово']},
  '48': {name:'[APP GBL] Просроченные', stages:['Новые','Работа','Контроль','Готово']},
  '50': {name:'ИП Белолапотко', stages:['Новые','Работа','Контроль','Готово']},
  '52': {name:'ООО ОПТИМАПЛАСТ', stages:['Новые','Работа','Контроль','Готово']},
  '60': {name:'Кондитеры', stages:['Новые','Работа','Контроль','Готово']},
  '62': {name:'Нейс-Юг', stages:['Новые','Работа','Контроль','Готово']},
  '64': {name:'Завод Милл ФАУЗ', stages:['Новые','Работа','Контроль','Готово']},
  '66': {name:'ИП Иванов', stages:['Новые','Работа','Контроль','Готово']},
  '70': {name:'МАРКДЖЕТ ООО', stages:['Новые','Работа','Контроль','Готово']},
  '72': {name:'Керамика Фабрика', stages:['Новые','Работа','Контроль','Готово']},
  '74': {name:'Керамика', stages:['Новые','Работа','Контроль','Готово']},
  '76': {name:'1с Разработка Валерий Вишневский', stages:['Новые','Работа','Контроль','Готово']},
  '82': {name:'ЮРИСТЫ БИГАП', stages:['Новые','Работа','Контроль','Готово']}
};
/* ⚠️ Проекты БЕЗ STAGE_MAP (нет пайплайнов): 8,10,12,14,16,26,30,34,38,40,44,54,58,68 */

/* ─── Исключённые проекты (служебные группы) ─── */
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

/* ─── Вебхук (зашит прямо в код) ─── */
var PR_DEFAULT_HOOK = 'https://1c-cms.bitrix24.ru/rest/116/48yuunr8ss2u18qm/';
var HOOK = '';
try { HOOK = localStorage.getItem('bx_hook') || PR_DEFAULT_HOOK; } catch(e) { HOOK = PR_DEFAULT_HOOK; }

/* ─── Режим мок ───
   PR_FORCE_MOCK = true  → всегда мок (тест без API)
   PR_FORCE_MOCK = false → живые данные через Bitrix24 API
   Переключатель в UI: кнопка МОК/ЖИВОЙ в топбаре
*/
var PR_FORCE_MOCK = true;
var PR_MOCK_MODE = PR_FORCE_MOCK || !HOOK;

/* ─── Утилиты ─── */
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
  /* Сначала из сохранённых настроек, потом из конфига */
  var saved = prLoadDevSettings(developerId);
  if (saved && saved.rate) return saved.rate;
  return DEV_RATES[String(developerId)] || СТАВКА_ПО_УМОЛЧ;
}

function prGetBase(developerId) {
  var saved = prLoadDevSettings(developerId);
  if (saved && saved.base) return saved.base;
  return DEV_BASE[String(developerId)] || 0;
}

function prGetInn(developerId) {
  var saved = prLoadDevSettings(developerId);
  if (saved && saved.inn) return saved.inn;
  return DEV_INN[String(developerId)] || '';
}

function prGetDevName(developerId) {
  var saved = prLoadDevSettings(developerId);
  if (saved && saved.name) return saved.name;
  return DEVELOPERS[String(developerId)] || ('ID ' + developerId);
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
    .catch(function(e) { console.error('СЕТЬ', method, e); return {error: e.message}; });
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
    .catch(function(e) { console.error('СЕТЬ-asDev', method, e); return {error: e.message}; });
}

function fetchTasksPaginated(body, maxPages) {
  var all = [], start = 0, pages = 0, maxP = maxPages || 20;
  function step() {
    pages++;
    if (pages > maxP) {
      console.warn('fetchTasksPaginated: лимит ' + maxP + ' страниц, ' + all.length + ' задач');
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

/* ─── Помощники периода ─── */
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

/* ─── Глобальное состояние ─── */
var allData = null;
var prCurrentPeriod = prGetCurrentMonth();
