/* ═══════════════════════════════════════════════════════════════
   core.js — Зарплатный обзор (Payroll Review)
   Совместим с архитектурой dashboard V187
   ═══════════════════════════════════════════════════════════════ */

var APP_VERSION = 'ПР-7.0.0';

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
  '116': 0   /* Предеин: ставка по задачам = 0, оклад 200к */
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
  '116': 200000   /* Предеин: оклад 200к (3П) */
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

/* ─── Исключённые проекты (служебные группы)
   ⚠️ v6.6.0: EXCLUDE_GROUPS влияет ТОЛЬКО на UI-отображение
   (какие проекты показывать в Projects tab).
   На загрузку данных НЕ влияет — задачи из этих групп
   загружаются и обрабатываются полностью, т.к. Предеин
   списывает время в группе 26 «Текущие задачи 1с». ─── */
var EXCLUDE_GROUPS = {
  '2':1,  /* Обучение 1с */
  '22':1, /* Тацинка */
  '24':1, /* Обучение 1с скрам */
  '26':1, /* Текущие задачи 1с — Предеин списывает время здесь! */
  '42':1, /* ИТ Контроль */
  '48':1, /* [APP GBL] Просроченные */
  '78':1, /* Backlog */
  '80':1  /* Все проекты */
};

/* ─── Вебхук (зашит прямо в код) ─── */
var PR_DEFAULT_HOOK = 'https://1c-cms.bitrix24.ru/rest/116/48yuunr8ss2u18qm/';
var HOOK = '';
try { HOOK = localStorage.getItem('bx_hook') || PR_DEFAULT_HOOK; } catch(e) { HOOK = PR_DEFAULT_HOOK; }

/* ─── Режим данных ───
   Моковые данные УДАЛЕНЫ (v6.5.0) — всегда живые данные из Bitrix24.
   PR_MOCK_MODE оставлен для совместимости, всегда false.
*/
/* ─── Конфигурация нормализации ───
   v6.6.0: excludeGroups = {} — НЕ исключаем группы из расчётов!
   Предеин списывает время в группе 26 «Текущие задачи 1с».
   EXCLUDE_GROUPS влияет только на UI, не на данные. ─── */
var PR_NORM_CONFIG_OVERRIDE = {
  excludeGroups: {}   /* Пустой объект = не исключать никакие группы из расчётов */
};
var PR_MOCK_MODE = false;

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
  if (saved && saved.rate !== undefined && saved.rate !== null) return saved.rate;
  return DEV_RATES[String(developerId)] !== undefined ? DEV_RATES[String(developerId)] : СТАВКА_ПО_УМОЛЧ;
}

function prGetBase(developerId) {
  var saved = prLoadDevSettings(developerId);
  if (saved && saved.base !== undefined && saved.base !== null) return saved.base;
  return DEV_BASE[String(developerId)] !== undefined ? DEV_BASE[String(developerId)] : 0;
}

function prGetInn(developerId) {
  var saved = prLoadDevSettings(developerId);
  if (saved && saved.inn !== undefined && saved.inn !== null) return saved.inn;
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

/* ─── Исключённые разработчики (не участвуют в расчётах) ─── */
var EXCLUDED_DEV_IDS = { '80': true, '94': true, '96': true };

/* ─── Активные разработчики (все кроме исключённых) ─── */
var ACTIVE_DEV_IDS = DEV_IDS.filter(function(id) { return !EXCLUDED_DEV_IDS[String(id)]; });

/* ─── Клиентские ставки (р/ч) — доход от клиента за час работы разработчика ─── */
var DEV_CLIENT_RATES = {
  '1':   1500,
  '18':  1500,
  '38':  1500,
  '54':  1500,
  '82':  1500,
  '92':  1500,
  '98':  1500,
  '116': 0   /* Предеин: клиентская ставка 0 (ставка по задачам = 0) */
};

/* ─── Штрафы разработчиков ─── */
var DEV_FINES = {};

/* ─── Комментарии к штрафам ─── */
var DEV_FINE_COMMENTS = {};

/* ─── Доп. доход проектов (сервисное обслуживание) ─── */
var PROJECT_SERVICE_INCOME = {};

/* ─── Заметки к доп. доходу проектов ─── */
var PROJECT_SERVICE_NOTES = {};

/* ─── Клиентские ставки по проектам (переопределение) ─── */
var PROJECT_CLIENT_RATES = {};

/* ─── Whitelist проектов (только эти показывать в Projects tab) ─── */
var PR_WHITELIST_PROJECTS = {
  '6':  'Бигап',
  '20': 'ВДЛ',
  '32': 'Дакар',
  '36': 'Медицина КЗ',
  '78': 'Backlog',
  '82': 'ЮРИСТЫ БИГАП',
  '66': 'ИП Иванов',
  '4':  'Живое пиво',
  '50': 'ИП Белолапотко',
  '62': 'Нейс-Юг',
  '72': 'Керамика Фабрика',
  '18': 'Самокаты центр',
  '70': 'МАРКДЖЕТ',
  '76': '1с Разработка',
  '80': 'Все проекты'
};

/* ─── Помощники для ставок/штрафов ─── */
function prGetClientRate(devId) {
  var saved = prLoadDevSettings(devId);
  if (saved && saved.clientRate !== undefined && saved.clientRate !== null) return saved.clientRate;
  return DEV_CLIENT_RATES[String(devId)] !== undefined ? DEV_CLIENT_RATES[String(devId)] : prGetRate(devId);
}

function prGetFine(devId) {
  var saved = prLoadDevSettings(devId);
  if (saved && saved.fine !== undefined && saved.fine !== null) return saved.fine;
  return DEV_FINES[String(devId)] || 0;
}

function prGetFineComment(devId) {
  var saved = prLoadDevSettings(devId);
  if (saved && saved.fineComment !== undefined && saved.fineComment !== null) return saved.fineComment;
  return DEV_FINE_COMMENTS[String(devId)] || '';
}

function prGetProjectServiceIncome(pid) {
  return PROJECT_SERVICE_INCOME[String(pid)] || 0;
}

function prGetProjectServiceNote(pid) {
  return PROJECT_SERVICE_NOTES[String(pid)] || '';
}

function prGetProjectClientRate(pid) {
  return PROJECT_CLIENT_RATES[String(pid)] || 0;
}

/* ─── Глобальное состояние ─── */
var allData = null;
var prCurrentPeriod = prGetCurrentMonth();
