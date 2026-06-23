/* ─── GET /api/projects ───
   Возвращает справочник проектов со стадиями.
   Данные статичны — берутся из STAGE_MAP (который задан в коде core.js).
   Чтобы не дублировать — описано прямо тут (синхронно с core.js).
   ──────────────────────────────────────────────── */

const STAGE_MAP = {
  '4':  {name:'Живое пиво', stages:[
    {id:80,  name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:756, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:82,  name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:402, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:406, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:758, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:84,  name:'Готово',  color:'7bd500', paymentStatus:'closed'},
    {id:404, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:408, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:410, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '6':  {name:'Бигап', stages:[
    {id:136, name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:534, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:138, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:188, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:190, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:258, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:140, name:'Готово',  color:'8ec82f', paymentStatus:'closed'},
    {id:192, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:194, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:196, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '20': {name:'ВДЛ', stages:[
    {id:150, name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:722, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:152, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:514, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:154, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:748, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:724, name:'Готово',  color:'7bd500', paymentStatus:'closed'},
    {id:726, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:728, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:730, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '32': {name:'Дакар', stages:[
    {id:86,  name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:736, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:528, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:204, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:198, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:746, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:90,  name:'Готово',  color:'7bd500', paymentStatus:'closed'},
    {id:508, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:200, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:202, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '36': {name:'Медицина КЗ', stages:[
    {id:292, name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:362, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:294, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:298, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:300, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:750, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:296, name:'Готово',  color:'7bd500', paymentStatus:'closed'},
    {id:308, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:302, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:306, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '50': {name:'ИП Белолапотко', stages:[
    {id:414, name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:428, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:532, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:416, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:530, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:420, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:418, name:'Готово',  color:'7bd500', paymentStatus:'closed'},
    {id:538, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:422, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:424, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '52': {name:'ООО ОПТИМАПЛАСТ', stages:[
    {id:430, name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:442, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:622, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:432, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:436, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:786, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:434, name:'Готово',  color:'7bd500', paymentStatus:'closed'},
    {id:440, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:438, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:444, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '62': {name:'Нейс-Юг', stages:[
    {id:564, name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:588, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:566, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:590, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:720, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:568, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:592, name:'Готово',  color:'7bd500', paymentStatus:'closed'},
    {id:594, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:752, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:754, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '66': {name:'ИП Иванов', stages:[
    {id:602, name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:604, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:740, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:632, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:630, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:744, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:606, name:'Готово',  color:'7bd500', paymentStatus:'closed'},
    {id:742, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:634, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:636, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '70': {name:'МАРКДЖЕТ ООО', stages:[
    {id:614, name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:620, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:616, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:618, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:760, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:762, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:764, name:'Готово',  color:'7bd500', paymentStatus:'closed'},
    {id:766, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:768, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:770, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '72': {name:'Керамика Фабрика', stages:[
    {id:624, name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:772, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:626, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:628, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:774, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:776, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:778, name:'Готово',  color:'7bd500', paymentStatus:'closed'},
    {id:780, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:782, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:784, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '82': {name:'ЮРИСТЫ БИГАП', stages:[
    {id:832, name:'Новые',   color:'a8afb3', paymentStatus:'not_ready'},
    {id:834, name:'Оценка',  color:'f5d220', paymentStatus:'not_ready'},
    {id:836, name:'Работа',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:838, name:'Правки',  color:'ff5752', paymentStatus:'not_ready'},
    {id:840, name:'Тест',    color:'9b51e0', paymentStatus:'not_ready'},
    {id:842, name:'Релиз',   color:'ffa900', paymentStatus:'not_ready'},
    {id:844, name:'Готово',  color:'8ec82f', paymentStatus:'closed'},
    {id:846, name:'Пауза',   color:'754c24', paymentStatus:'not_ready'},
    {id:848, name:'Счет',    color:'1db7f1', paymentStatus:'invoice'},
    {id:850, name:'Оплата',  color:'14b033', paymentStatus:'paid'}
  ]},
  '78': {name:'Backlog', stages:[
    {id:702, name:'Новые',  color:'a8afb3', paymentStatus:'not_ready'},
    {id:704, name:'Работа', color:'2fc6f6', paymentStatus:'not_ready'},
    {id:788, name:'Пауза',  color:'a46200', paymentStatus:'not_ready'},
    {id:706, name:'Готово', color:'7bd500', paymentStatus:'closed'}
  ]},
  '2':  {name:'Обучение 1с', stages:[
    {id:26, name:'Новые',        color:'a8afb3', paymentStatus:'not_ready'},
    {id:28, name:'Выполняются',  color:'2fc6f6', paymentStatus:'not_ready'},
    {id:30, name:'Сделаны',      color:'7bd500', paymentStatus:'closed'}
  ]},
  '18': {name:'Самокаты центр', stages:[
    {id:218, name:'Новые',       color:'a8afb3', paymentStatus:'not_ready'},
    {id:220, name:'Выполняются', color:'2fc6f6', paymentStatus:'not_ready'},
    {id:222, name:'Сделаны',     color:'7bd500', paymentStatus:'closed'}
  ]},
  '42': {name:'ИТ Контроль', stages:[
    {id:516, name:'Новые',       color:'a8afb3', paymentStatus:'not_ready'},
    {id:518, name:'Выполняются', color:'2fc6f6', paymentStatus:'not_ready'},
    {id:520, name:'Сделаны',     color:'7bd500', paymentStatus:'closed'}
  ]},
  '48': {name:'[APP GBL] Просроченные', stages:[
    {id:546, name:'Новые',       color:'a8afb3', paymentStatus:'not_ready'},
    {id:548, name:'Выполняются', color:'2fc6f6', paymentStatus:'not_ready'},
    {id:550, name:'Сделаны',     color:'7bd500', paymentStatus:'closed'}
  ]},
  '60': {name:'Кондитеры', stages:[
    {id:552, name:'Новые',       color:'a8afb3', paymentStatus:'not_ready'},
    {id:554, name:'Выполняются', color:'2fc6f6', paymentStatus:'not_ready'},
    {id:556, name:'Сделаны',     color:'7bd500', paymentStatus:'closed'}
  ]},
  '64': {name:'Завод Милл ФАУЗ', stages:[
    {id:596, name:'Новые',       color:'a8afb3', paymentStatus:'not_ready'},
    {id:598, name:'Выполняются', color:'2fc6f6', paymentStatus:'not_ready'},
    {id:600, name:'Сделаны',     color:'7bd500', paymentStatus:'closed'}
  ]},
  '74': {name:'Керамика', stages:[
    {id:714, name:'Новые',       color:'a8afb3', paymentStatus:'not_ready'},
    {id:716, name:'Выполняются', color:'2fc6f6', paymentStatus:'not_ready'},
    {id:718, name:'Сделаны',     color:'7bd500', paymentStatus:'closed'}
  ]},
  '76': {name:'1с Разработка Валерий Вишневский', stages:[
    {id:678, name:'Новые',       color:'a8afb3', paymentStatus:'not_ready'},
    {id:680, name:'Выполняются', color:'2fc6f6', paymentStatus:'not_ready'},
    {id:682, name:'Сделаны',     color:'7bd500', paymentStatus:'closed'}
  ]},
  '80': {name:'Все проекты', stages:[
    {id:482, name:'Новые',       color:'a8afb3', paymentStatus:'not_ready'},
    {id:484, name:'Выполняются', color:'2fc6f6', paymentStatus:'not_ready'},
    {id:486, name:'Сделаны',     color:'7bd500', paymentStatus:'closed'}
  ]}
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.query.key || req.headers['x-api-key'] || '';
  const validKey = process.env.PAYROLL_API_KEY || 'pr_api_2026';
  if (apiKey !== validKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  /* Преобразуем STAGE_MAP в удобный массив */
  const projects = Object.keys(STAGE_MAP).map(function(pid) {
    const p = STAGE_MAP[pid];
    return {
      projectId: parseInt(pid, 10),
      projectName: p.name,
      stagesCount: p.stages.length,
      stages: p.stages,
      /* Удобные shortcuts для 1С */
      invoiceStageId: (p.stages.find(function(s) { return s.paymentStatus === 'invoice'; }) || {}).id || null,
      paidStageId:    (p.stages.find(function(s) { return s.paymentStatus === 'paid';    }) || {}).id || null,
      closedStageId:  (p.stages.find(function(s) { return s.paymentStatus === 'closed';  }) || {}).id || null
    };
  });

  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    projectsCount: projects.length,
    projects: projects,
    /* Легенда paymentStatus */
    paymentStatusLegend: {
      'not_ready': 'Работа ещё не готова к оплате',
      'invoice':   'Стадия «Счет» — 1С формирует счёт клиенту',
      'paid':      'Стадия «Оплата» — клиент оплатил, 1С формирует акт+выплату разрабу',
      'closed':    'Стадия «Готово» — задача закрыта'
    }
  });
}
