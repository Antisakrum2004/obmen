/* ═══════════════════════════════════════════════════════════════
   payroll-review-styles.js — CSS Styles for Payroll Review Tab
   Каждая строка заканчивается \ (CSS-as-JS-string pattern)
   ═══════════════════════════════════════════════════════════════ */

var PR_CSS = '\
.pr-wrap{display:flex;flex-direction:column;gap:16px}\
.pr-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:0 0 8px}\
.pr-title{font-family:var(--mono);font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text);display:flex;align-items:center;gap:10px}\
.pr-title::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green)}\
.pr-header-info{display:flex;align-items:center;gap:12px}\
.pr-header-stat{font-family:var(--mono);font-size:10px;color:var(--text3);padding:3px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px}\
.pr-badge{font-family:var(--mono);font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;display:inline-flex;align-items:center;gap:4px}\
.pr-badge-mock{background:rgba(245,166,35,.1);color:var(--yellow);border:1px solid rgba(245,166,35,.25)}\
.pr-badge-live{background:rgba(34,212,126,.1);color:var(--green);border:1px solid rgba(34,212,126,.25)}\
.pr-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\
.pr-select{background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text2);font-family:var(--mono);font-size:11px;padding:6px 10px;outline:none;cursor:pointer;transition:border-color .15s}\
.pr-select:focus{border-color:var(--accent)}\
.pr-btn{font-family:var(--mono);font-size:11px;font-weight:700;padding:7px 14px;border-radius:8px;cursor:pointer;border:1px solid;text-transform:uppercase;letter-spacing:.04em;transition:all .15s;box-shadow:var(--shadow-btn),var(--highlight)}\
.pr-btn:hover{transform:translateY(-1px);box-shadow:var(--shadow-btn-hover),var(--highlight-strong)}\
.pr-btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}\
.pr-btn-primary:hover{background:var(--accent-hover)}\
.pr-btn-green{background:var(--green);color:#000;border-color:var(--green)}\
.pr-btn-orange{background:rgba(245,166,35,.1);color:var(--yellow);border-color:rgba(245,166,35,.3)}\
.pr-btn-ghost{background:transparent;color:var(--text3);border-color:var(--border)}\
.pr-btn-ghost:hover{color:var(--text);border-color:var(--border2)}\
.pr-btn:disabled{opacity:.4;cursor:not-allowed;transform:none}\
.pr-kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}\
@media(max-width:1000px){.pr-kpi-grid{grid-template-columns:repeat(3,1fr)}}\
@media(max-width:600px){.pr-kpi-grid{grid-template-columns:repeat(2,1fr)}}\
.pr-kpi{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;position:relative;overflow:hidden;box-shadow:var(--shadow-card),var(--highlight)}\
.pr-kpi::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:var(--kc,var(--accent))}\
.pr-kpi-label{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}\
.pr-kpi-value{font-family:var(--mono);font-size:24px;font-weight:700;color:var(--text);line-height:1}\
.pr-kpi-sub{font-size:10px;color:var(--text3);margin-top:4px}\
.pr-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0}\
.pr-filter-chip{font-family:var(--mono);font-size:10px;font-weight:600;padding:4px 10px;border-radius:6px;cursor:pointer;border:1px solid var(--border);background:var(--bg2);color:var(--text3);transition:all .15s;user-select:none}\
.pr-filter-chip:hover{border-color:var(--border2);color:var(--text2)}\
.pr-filter-chip.active{background:var(--accent);color:#fff;border-color:var(--accent)}\
.pr-filter-chip.chip-green.active{background:var(--green);color:#000;border-color:var(--green)}\
.pr-filter-chip.chip-yellow.active{background:var(--yellow);color:#000;border-color:var(--yellow)}\
.pr-filter-chip.chip-red.active{background:var(--red);color:#fff;border-color:var(--red)}\
.pr-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg2)}\
.pr-table-wrap::-webkit-scrollbar{height:5px}\
.pr-table-wrap::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}\
.pr-table{width:100%;border-collapse:collapse;table-layout:auto;min-width:900px}\
.pr-table th{font-family:var(--mono);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;padding:10px 12px;text-align:left;border-bottom:1px solid var(--glass-border);background:rgba(18,21,31,.5);white-space:nowrap;cursor:pointer;user-select:none;transition:color .15s}\
.pr-table th:hover{color:var(--text2)}\
.pr-table th.sorted{color:var(--cyan)}\
.pr-table th.c-num{text-align:right}\
.pr-table td{padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;vertical-align:middle;white-space:nowrap}\
.pr-table tbody tr{transition:background .15s}\
.pr-table tbody tr:hover{background:var(--bg-hover)}\
.pr-table tbody tr.row-approved{opacity:.7}\
.pr-table tbody tr.row-excluded{opacity:.35;text-decoration:line-through}\
.pr-table tfoot td{background:rgba(18,21,31,.35);font-weight:700;padding:10px 12px;border-bottom:none;font-family:var(--mono);font-size:11px}\
.pr-task-link{color:var(--accent);text-decoration:none;font-weight:500;cursor:pointer}\
.pr-task-link:hover{text-decoration:underline}\
.pr-dev-name{font-weight:600;display:flex;align-items:center;gap:6px}\
.pr-dev-av{width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:var(--bg3);border:1px solid var(--glass-border);color:var(--text2);flex-shrink:0}\
.pr-status{display:inline-flex;align-items:center;font-family:var(--mono);font-size:9px;padding:3px 8px;border-radius:4px;font-weight:600;white-space:nowrap;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;transition:all .15s;gap:4px}\
.pr-status:hover{transform:translateY(-1px)}\
.pr-status-pending{background:rgba(161,174,195,.1);color:var(--text2);border:1px solid rgba(161,174,195,.2)}\
.pr-status-approved{background:rgba(34,212,126,.1);color:var(--green);border:1px solid rgba(34,212,126,.25)}\
.pr-status-disputed{background:rgba(255,79,106,.1);color:var(--red);border:1px solid rgba(255,79,106,.25)}\
.pr-status-excluded{background:rgba(107,122,144,.08);color:var(--text3);border:1px solid rgba(107,122,144,.15)}\
.pr-editable{background:rgba(18,21,31,.6);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono);font-size:11px;padding:3px 6px;outline:none;width:60px;text-align:right;transition:border-color .15s}\
.pr-editable:focus{border-color:var(--accent)}\
.pr-editable.changed{border-color:var(--yellow);background:rgba(245,166,35,.04)}\
.pr-readonly{font-family:var(--mono);font-size:11px;color:var(--text2)}\
.pr-amount{font-weight:600;color:var(--text)}\
.pr-proj-tag{font-family:var(--mono);font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(79,139,255,.08);color:var(--accent);border:1px solid rgba(79,139,255,.15);white-space:nowrap}\
.pr-section-title{font-family:var(--mono);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text);margin-bottom:12px;display:flex;align-items:center;gap:8px}\
.pr-section-title::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--cyan);box-shadow:0 0 6px var(--cyan)}\
.pr-proj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px}\
.pr-proj-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow-card),var(--highlight)}\
.pr-proj-dev{display:flex;align-items:center;gap:12px;margin-bottom:10px}\
.pr-proj-dev-info{flex:1;display:flex;flex-direction:column;gap:2px}\
.pr-proj-dev-name{font-weight:600;font-size:13px}\
.pr-proj-dev-meta{font-family:var(--mono);font-size:9px;color:var(--text3)}\
.pr-proj-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}\
@media(max-width:600px){.pr-proj-stats{grid-template-columns:repeat(2,1fr)}}\
.pr-proj-stat{text-align:center;padding:4px}\
.pr-proj-stat-val{font-family:var(--mono);font-size:16px;font-weight:700}\
.pr-proj-stat-lbl{font-family:var(--mono);font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px}\
.pr-proj-bar{height:4px;background:var(--bg);border-radius:2px;margin-top:10px;overflow:hidden}\
.pr-proj-bar-fill{height:100%;border-radius:2px;transition:width .3s}\
.pr-comment-input{background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--sans);font-size:11px;padding:4px 8px;outline:none;width:140px;transition:border-color .15s}\
.pr-comment-input:focus{border-color:var(--accent)}\
.pr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;gap:10px;color:var(--text3);font-family:var(--mono);font-size:12px}\
.pr-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;gap:10px;color:var(--text3);font-family:var(--mono);font-size:12px}\
.pr-ring{width:28px;height:28px;border:2px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:prspin .7s linear infinite}\
@keyframes prspin{to{transform:rotate(360deg)}}\
.pr-hint{font-family:var(--mono);font-size:9px;color:var(--text3);opacity:.6}\
.pr-save-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(245,166,35,.06);border:1px solid rgba(245,166,35,.15);border-radius:8px;margin-top:4px}\
.pr-save-indicator{width:8px;height:8px;border-radius:50%;transition:background .3s}\
.pr-save-indicator.saved{background:var(--green);box-shadow:0 0 6px var(--green)}\
.pr-save-indicator.dirty{background:var(--yellow);box-shadow:0 0 6px var(--yellow);animation:prpulse 1s infinite}\
@keyframes prpulse{0%,100%{opacity:1}50%{opacity:.5}}\
.pr-debug{margin-top:16px;padding:12px 16px;background:rgba(0,0,0,.3);border:1px solid rgba(245,166,35,.15);border-radius:8px;font-family:var(--mono);font-size:10px;color:var(--text3)}\
.pr-debug-title{color:var(--yellow);font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em}\
.pr-debug-row{padding:2px 0;border-bottom:1px solid rgba(255,255,255,.03)}\
';
