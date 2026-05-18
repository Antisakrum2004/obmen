# Payroll Review — Архитектурный анализ

## 1. Архитектура Dashboard V187 (reference)

### Общая схема
```
[Браузер] → [Vercel CDN] → index.html + js/*.js
                                ↓
                          /api/<method> (POST)
                                ↓
                     [Flask-прокси api/index.py]
                                ↓
                     [Bitrix24 REST API]
```

### Ключевые принципы
- Vanilla JS ES5 (var, function, без let/const/стрелок/template literals)
- Рендеринг через innerHTML + string concatenation
- CSS как JS-строки с `\` конкатенацией (каждая строка заканчивается `\`)
- Состояние в глобальных переменных с префиксом модуля
- localStorage для persistence (try/catch обязателен)
- Все запросы к Bitrix24 — ТОЛЬКО POST через bxPost()

## 2. Как подключаются новые tabs

Модуль регистрируется на window:
```js
window.TabPayrollReview = {
  render: function(container) { ... },
  destroy: function() { ... },
  refresh: function() { ... }
};
```

Роутер в shared.js:
```js
if(t===5 && window.TabPayrollReview)
  window.TabPayrollReview.render(document.getElementById('pr-container'));
```

Hash routing:
```js
var tabHashes = ['work','uchet','analytics','clients','inv','payroll'];
```

## 3. Lifecycle модулей

### render(container)
1. Guard: `if (!container) return;`
2. Self-destroy: `this.destroy()`
3. Store container ref
4. Inject CSS: `<style>.textContent = CSS_STRING`
5. Load persistent state из localStorage
6. Render UI через innerHTML
7. Start intervals (auto-refresh)
8. Register event listeners

### destroy()
1. Очистить все setInterval IDs
2. Удалить <style> элемент из document.head
3. Закрыть оверлеи
4. Удалить event listeners
5. Обнулить внутреннее состояние

### refresh()
1. Перезагрузить данные
2. Перерендерить UI

## 4. Shared utilities из core.js

| Функция | Назначение |
|---------|-----------|
| `bxPost(method, body)` | API-прокси к Bitrix24 |
| `bxPostAsDev(method, body, devId)` | Действия от лица разработчика |
| `fetchTasksPaginated(body, maxPages)` | Пагинированная загрузка задач |
| `esc(s)` | HTML-экранирование |
| `truncate(s, n)` | Обрезка строки с ... |
| `fmt(d)` | Дата → "YYYY-MM-DD" |
| `mhm(m)` | Минуты → "H:MM" |
| `parseBitrixDate(s)` | Парсинг дат Bitrix24 |
| `getPeriod()` | Текущий период (from, to, days) |

## 5. Existing API wrappers

### bxPost — основной
```js
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
```

### Elapsed loading pattern
```js
// По дням (из core.js loadPeriodData):
var b = JSON.stringify([0, {}, {
  '>=CREATED_DATE': ds,
  '<=CREATED_DATE': ds + ' 23:59:59'
}, ['ID','TASK_ID','USER_ID','SECONDS','CREATED_DATE']]);

// По задаче (из overlay):
var b = JSON.stringify([parseInt(taskId), {}, {},
  ['ID','TASK_ID','USER_ID','SECONDS','CREATED_DATE','COMMENT_TEXT']]);
```

## 6. Существующая пагинация

`fetchTasksPaginated` — рекурсивная загрузка:
- Bitrix24 возвращает max 50 записей
- `r.next` — offset для следующей страницы
- Default maxPages = 20 (1000 задач)
- Возвращает Promise<task[]>

## 7. localStorage patterns

```js
// Чтение (всегда в try/catch):
try { var data = JSON.parse(localStorage.getItem('key')); } catch(e) { data = null; }

// Запись:
try { localStorage.setItem('key', JSON.stringify(data)); } catch(e) {}

// Ключи с префиксом модуля:
// tw_ — tab-work
// ti_ — tab-invoice
// pr_ — payroll-review (НАШ МОДУЛЬ)
```

## 8. Существующий table rendering

Таблицы рендерятся строковой конкатенацией:
```js
var h = '<table class="tt"><thead><tr>';
h += '<th>Col1</th><th>Col2</th>';
h += '</tr></thead><tbody>';
items.forEach(function(item) {
  h += '<tr><td>' + esc(item.val) + '</td></tr>';
});
h += '</tbody></table>';
container.innerHTML = h;
```

## 9. Где можно переиспользовать код

| Компонент | Источник | Переиспользование |
|-----------|---------|-------------------|
| bxPost | core.js | Прямое использование |
| fetchTasksPaginated | core.js | Прямое использование |
| esc(), truncate() | core.js | Прямое использование |
| fmt(), mhm(), parseBitrixDate() | core.js | Прямое использование |
| CSS-переменные | index.html | Прямое использование (--bg, --accent, --text, etc.) |
| Карточки (kcard) | index.html | Аналогичный паттерн |
| Модальные окна (emodal) | index.html | Аналогичный паттерн |
| Таблицы (tt, wip-tt) | index.html | Аналогичный паттерн |
| Экспорт CSV | shared.js | Адаптация для payroll формата |

## 10. Что трогать НЕЛЬЗЯ

- core.js — глобальные функции и переменные
- shared.js — роутинг и основные табы
- Существующие модули TabWork, TabInvoice, TabClients
- api/index.py — Flask прокси (не добавлять новые эндпоинты без необходимости)
- Глобальную переменную allData (можно читать, нельзя мутировать)

## 11. Потенциальные риски

1. **Bitrix24 API timeout** — Vercel hobby = 10s лимит; загрузка за длинный период может таймаутиться
2. **Большой объём elapsed** — за месяц может быть 1000+ записей; нужна пагинация
3. **Race conditions** — параллельные загрузки данных; нужен guard
4. **localStorage overflow** — при большом количестве записей; нужен лимит
5. **Отсутствие UTC нормализации** — Bitrix24 возвращает локальное время; нужно аккуратно сравнивать даты
6. **Malformed elapsed** — SECONDS может быть 0 или null; нужен guard
7. **Missing users** — elapsed может быть от неизвестного пользователя
8. **Deleted elapsed** — пользователь мог удалить запись между загрузками
