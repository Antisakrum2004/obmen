/* ═══════════════════════════════════════════════════════════════
   payroll-review-styles.js — Полные стили зарплатного обзора
   v6.0.0 — STABILIZATION ROLLBACK: полный CSS для всех компонентов
   ═══════════════════════════════════════════════════════════════ */

var PR_CSS = '\
/* ─── Layout ─── */\
.pr-wrap{display:flex;flex-direction:column;gap:16px}\
.pr-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:0 0 8px}\
.pr-title{font-family:var(--mono);font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text);display:flex;align-items:center;gap:10px}\
.pr-title::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green)}\
.pr-header-info{display:flex;align-items:center;gap:12px}\
.pr-header-stat{font-family:var(--mono);font-size:10px;color:var(--text3);padding:3px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px}\
.pr-version{font-family:var(--mono);font-size:9px;color:var(--text3);opacity:.6}\
\
/* ─── Badges ─── */\
.pr-badge{font-family:var(--mono);font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;display:inline-flex;align-items:center;gap:4px}\
.pr-badge-mock{background:rgba(245,166,35,.1);color:var(--yellow);border:1px solid rgba(245,166,35,.25)}\
.pr-badge-live{background:rgba(34,212,126,.1);color:var(--green);border:1px solid rgba(34,212,126,.25)}\
.pr-badge-cache{background:rgba(0,212,255,.1);color:var(--cyan);border:1px solid rgba(0,212,255,.25);font-size:9px}\
.pr-badge-refreshing{background:rgba(245,166,35,.08);color:var(--yellow);border:1px solid rgba(245,166,35,.2);font-size:9px;animation:prpulse 1s infinite}\
\
/* ─── Controls ─── */\
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
\
/* ─── Toggle Groups (View, Role, Density) ─── */\
.pr-view-toggle,.pr-role-toggle,.pr-density-toggle{display:flex;gap:2px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:2px}\
.pr-view-btn,.pr-role-btn,.pr-density-btn{font-family:var(--mono);font-size:10px;font-weight:600;padding:4px 10px;border-radius:6px;border:none;background:transparent;color:var(--text3);cursor:pointer;transition:all .15s;white-space:nowrap}\
.pr-view-btn:hover,.pr-role-btn:hover,.pr-density-btn:hover{color:var(--text2)}\
.pr-view-btn.active{background:var(--accent);color:#fff}\
.pr-role-btn.active{background:var(--cyan);color:#000}\
.pr-density-btn.active{background:var(--bg3);color:var(--text)}\
\
/* ─── KPI Cards ─── */\
.pr-kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}\
@media(max-width:1000px){.pr-kpi-grid{grid-template-columns:repeat(3,1fr)}}\
@media(max-width:600px){.pr-kpi-grid{grid-template-columns:repeat(2,1fr)}}\
.pr-kpi{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;position:relative;overflow:hidden;box-shadow:var(--shadow-card),var(--highlight)}\
.pr-kpi::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:var(--kc,var(--accent))}\
.pr-kpi-label{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}\
.pr-kpi-value{font-family:var(--mono);font-size:24px;font-weight:700;color:var(--text);line-height:1}\
.pr-kpi-sub{font-size:10px;color:var(--text3);margin-top:4px}\
\
/* ─── Heatmap ─── */\
.pr-heatmap{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:8px}\
.pr-heatmap-title{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}\
.pr-heatmap-row{display:flex;gap:6px;flex-wrap:wrap}\
.pr-heatmap-chip{display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;transition:all .15s;user-select:none}\
.pr-heatmap-chip:hover{border-color:var(--border2);background:var(--bg-hover)}\
.pr-heatmap-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}\
.pr-heatmap-dot.green{background:var(--green);box-shadow:0 0 4px var(--green)}\
.pr-heatmap-dot.yellow{background:var(--yellow);box-shadow:0 0 4px var(--yellow)}\
.pr-heatmap-dot.red{background:var(--red);box-shadow:0 0 4px var(--red)}\
.pr-heatmap-name{font-family:var(--mono);font-size:10px;color:var(--text2)}\
.pr-heatmap-hours{font-family:var(--mono);font-size:10px;color:var(--text3)}\
.pr-heatmap-margin{font-family:var(--mono);font-size:9px;font-weight:600}\
.pr-heatmap-margin.pos{color:var(--green)}\
.pr-heatmap-margin.neg{color:var(--red)}\
\
/* ─── Filters ─── */\
.pr-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0}\
.pr-filter-chip{font-family:var(--mono);font-size:10px;font-weight:600;padding:4px 10px;border-radius:6px;cursor:pointer;border:1px solid var(--border);background:var(--bg2);color:var(--text3);transition:all .15s;user-select:none}\
.pr-filter-chip:hover{border-color:var(--border2);color:var(--text2)}\
.pr-filter-chip.active{background:var(--accent);color:#fff;border-color:var(--accent)}\
.pr-filter-chip.chip-green.active{background:var(--green);color:#000;border-color:var(--green)}\
.pr-filter-chip.chip-yellow.active{background:var(--yellow);color:#000;border-color:var(--yellow)}\
.pr-filter-chip.chip-red.active{background:var(--red);color:#fff;border-color:var(--red)}\
\
/* ─── Dev Cards Grid ─── */\
.pr-dev-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:14px;margin-top:12px}\
.pr-dev-cards.pr-compact{grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px}\
\
/* ─── Dev Card ─── */\
.pr-dev-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-card),var(--highlight);transition:all .2s}\
.pr-dev-card:hover{border-color:var(--border2);box-shadow:var(--shadow-card-hover),var(--highlight-strong)}\
.pr-dev-card.risk-high{border-color:rgba(255,79,106,.3)}\
.pr-dev-card.risk-warn{border-color:rgba(245,166,35,.3)}\
\
/* ─── Card Inner ─── */\
.pr-card-inner{padding:16px 18px 10px}\
.pr-card-hdr{display:flex;align-items:center;gap:10px;margin-bottom:12px}\
.pr-card-avatar{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;background:var(--bg3);border:1px solid var(--glass-border);color:var(--accent);flex-shrink:0}\
.pr-card-identity{flex:1;min-width:0}\
.pr-card-name{font-weight:600;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.pr-card-role{font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:1px}\
.pr-card-status{font-family:var(--mono);font-size:9px;font-weight:600;padding:3px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}\
.pr-card-status.s-approved{background:rgba(34,212,126,.12);color:var(--green);border:1px solid rgba(34,212,126,.25)}\
.pr-card-status.s-review{background:rgba(79,139,255,.12);color:var(--accent);border:1px solid rgba(79,139,255,.25)}\
.pr-card-status.s-draft{background:rgba(161,174,195,.08);color:var(--text3);border:1px solid rgba(161,174,195,.15)}\
\
/* ─── Card Primary KPI ─── */\
.pr-card-kpi{display:flex;gap:16px;margin-bottom:12px;align-items:flex-end}\
.pr-kpi-primary{flex:1}\
.pr-kpi-hours{font-family:var(--mono);font-size:28px;font-weight:700;color:var(--accent);line-height:1}\
.pr-kpi-hours-label{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px}\
.pr-kpi-money{font-family:var(--mono);font-size:22px;font-weight:700;color:var(--orange);line-height:1}\
.pr-kpi-money-label{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px}\
\
/* ─── Card Secondary Metrics ─── */\
.pr-card-secondary{display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap}\
.pr-sec-item{display:flex;align-items:center;gap:4px}\
.pr-sec-item.primary-sec{background:var(--bg3);padding:3px 8px;border-radius:4px}\
.pr-sec-label{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em}\
.pr-sec-val{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--text)}\
.pr-sec-val.billable{color:var(--green)}\
.pr-sec-val.cut{color:var(--red)}\
.pr-sec-divider{width:1px;height:14px;background:var(--border);margin:0 2px}\
\
/* ─── Margin Values ─── */\
.margin-pos{color:var(--green) !important}\
.margin-neg{color:var(--red) !important}\
\
/* ─── Card Progress Bars ─── */\
.pr-card-progress{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}\
.pr-progress-row{display:flex;align-items:center;gap:6px}\
.pr-progress-label{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;width:60px;flex-shrink:0}\
.pr-progress-track{flex:1;height:4px;background:var(--bg);border-radius:2px;overflow:hidden}\
.pr-progress-fill{height:100%;border-radius:2px;transition:width .3s}\
.pr-progress-fill.green{background:var(--green)}\
.pr-progress-fill.yellow{background:var(--yellow)}\
.pr-progress-fill.red{background:var(--red)}\
.pr-progress-fill.accent{background:var(--accent)}\
.pr-progress-val{font-family:var(--mono);font-size:9px;color:var(--text3);min-width:40px;text-align:right}\
\
/* ─── Risk Badges ─── */\
.pr-card-risks{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}\
.pr-risk-pill{font-family:var(--mono);font-size:8px;font-weight:700;padding:2px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:.04em}\
.risk-overburn{background:rgba(255,79,106,.12);color:var(--red);border:1px solid rgba(255,79,106,.25)}\
.risk-low_load{background:rgba(245,166,35,.12);color:var(--yellow);border:1px solid rgba(245,166,35,.25)}\
.risk-cut_hours{background:rgba(245,166,35,.12);color:var(--yellow);border:1px solid rgba(245,166,35,.25)}\
.risk-no_rate{background:rgba(255,79,106,.12);color:var(--red);border:1px solid rgba(255,79,106,.25)}\
.risk-unreviewed{background:rgba(161,174,195,.08);color:var(--text3);border:1px solid rgba(161,174,195,.15)}\
.risk-negative_margin{background:rgba(255,79,106,.12);color:var(--red);border:1px solid rgba(255,79,106,.25)}\
\
/* ─── Card Footer ─── */\
.pr-card-footer{display:flex;gap:0;padding:8px 18px;background:rgba(0,0,0,.15);border-top:1px solid var(--border)}\
.pr-footer-metric{flex:1;text-align:center;padding:4px 0}\
.pr-footer-val{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--text2)}\
.pr-footer-label{font-family:var(--mono);font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-top:1px}\
\
/* ─── Card Expand/Collapse ─── */\
.pr-card-expand{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 18px;font-family:var(--mono);font-size:10px;color:var(--text3);cursor:pointer;transition:all .15s;border-top:1px solid var(--border);background:rgba(0,0,0,.08)}\
.pr-card-expand:hover{color:var(--text);background:rgba(0,0,0,.15)}\
.pr-card-expand-icon{font-size:8px;transition:transform .2s}\
.pr-card-expand.open .pr-card-expand-icon{transform:rotate(180deg)}\
\
/* ─── Timeline ─── */\
.pr-timeline{padding:10px 14px;background:rgba(0,0,0,.12)}\
.pr-timeline.pr-compact .pr-tl-item{padding:4px 8px}\
.pr-tl-day{margin-bottom:4px}\
.pr-tl-date{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;padding:4px 0 2px;border-bottom:1px solid var(--border);margin-bottom:4px}\
.pr-tl-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;transition:background .15s}\
.pr-tl-item:hover{background:rgba(79,139,255,.06)}\
.pr-tl-hours{font-family:var(--mono);font-size:10px;font-weight:600;color:var(--green);min-width:40px}\
.pr-tl-task{font-size:11px;color:var(--text2);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.pr-tl-cut{font-family:var(--mono);font-size:9px;color:var(--red);font-weight:600}\
.pr-tl-status{font-family:var(--mono);font-size:8px;font-weight:600;padding:2px 6px;border-radius:3px;cursor:pointer;text-transform:uppercase;letter-spacing:.03em;transition:all .15s}\
.pr-tl-status:hover{transform:scale(1.05)}\
.pr-tl-status.pending{background:rgba(161,174,195,.1);color:var(--text3);border:1px solid rgba(161,174,195,.15)}\
.pr-tl-status.approved{background:rgba(34,212,126,.1);color:var(--green);border:1px solid rgba(34,212,126,.2)}\
.pr-tl-status.disputed{background:rgba(255,79,106,.1);color:var(--red);border:1px solid rgba(255,79,106,.2)}\
.pr-tl-status.excluded{background:rgba(107,122,144,.06);color:var(--text3);border:1px solid rgba(107,122,144,.1)}\
\
/* ─── Hours Editor ─── */\
.pr-hours-editor{padding:8px 12px;background:rgba(0,0,0,.2);border-top:1px solid var(--border)}\
.pr-hours-editor-table{padding:2px 0;background:transparent;border-top:none}\
.pr-hours-slider{-webkit-appearance:none;width:100%;height:4px;border-radius:2px;background:var(--bg3);outline:none;cursor:pointer}\
.pr-hours-slider::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:var(--accent);cursor:pointer;border:2px solid var(--bg)}\
.pr-hours-slider::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--accent);cursor:pointer;border:2px solid var(--bg)}\
.pr-preset-btn{font-family:var(--mono);font-size:9px;font-weight:600;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer;transition:all .15s}\
.pr-preset-btn:hover{border-color:var(--accent);color:var(--accent)}\
\
/* ─── Financial Footer ─── */\
.pr-fin-footer{display:flex;align-items:center;gap:0;padding:10px 0;margin-top:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}\
.pr-fin-item{flex:1;text-align:center;padding:6px 10px;border-right:1px solid var(--border)}\
.pr-fin-item:last-child{border-right:none}\
.pr-fin-label{font-family:var(--mono);font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}\
.pr-fin-val{font-family:var(--mono);font-size:13px;font-weight:700;color:var(--text)}\
.pr-fin-val.fact{color:var(--accent)}\
.pr-fin-val.billable{color:var(--green)}\
.pr-fin-spacer{flex:1}\
\
/* ─── Table ─── */\
.pr-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg2)}\
.pr-table-wrap::-webkit-scrollbar{height:5px}\
.pr-table-wrap::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}\
.pr-table{width:100%;border-collapse:collapse;table-layout:auto;min-width:1100px}\
.pr-table th{font-family:var(--mono);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;padding:10px 8px;text-align:left;border-bottom:1px solid var(--glass-border);background:rgba(18,21,31,.5);white-space:nowrap;cursor:pointer;user-select:none;transition:color .15s}\
.pr-table th:hover{color:var(--text2)}\
.pr-table th.c-num{text-align:right}\
.pr-table td{padding:8px 8px;border-bottom:1px solid var(--border);font-size:12px;vertical-align:middle;white-space:nowrap}\
.pr-table tbody tr{transition:background .15s}\
.pr-table tbody tr:hover{background:var(--bg-hover)}\
.pr-table tbody tr.row-approved{opacity:.7}\
.pr-table tbody tr.row-excluded{opacity:.35;text-decoration:line-through}\
.pr-table tfoot td{background:rgba(18,21,31,.35);font-weight:700;padding:10px 8px;border-bottom:none;font-family:var(--mono);font-size:11px}\
.pr-task-link{color:var(--accent);text-decoration:none;font-weight:500;cursor:pointer}\
.pr-task-link:hover{text-decoration:underline}\
.pr-dev-name{font-weight:600;display:flex;align-items:center;gap:6px}\
.pr-dev-av{width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:var(--bg3);border:1px solid var(--glass-border);color:var(--text2);flex-shrink:0}\
.pr-rate-display{color:var(--text2)}\
.pr-amount{font-weight:600;color:var(--text)}\
.pr-proj-tag{font-family:var(--mono);font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(79,139,255,.08);color:var(--accent);border:1px solid rgba(79,139,255,.15);white-space:nowrap}\
\
/* ─── Status ─── */\
.pr-status{display:inline-flex;align-items:center;font-family:var(--mono);font-size:9px;padding:3px 8px;border-radius:4px;font-weight:600;white-space:nowrap;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;transition:all .15s;gap:4px}\
.pr-status:hover{transform:translateY(-1px)}\
.pr-status-pending{background:rgba(161,174,195,.1);color:var(--text2);border:1px solid rgba(161,174,195,.2)}\
.pr-status-approved{background:rgba(34,212,126,.1);color:var(--green);border:1px solid rgba(34,212,126,.25)}\
.pr-status-disputed{background:rgba(255,79,106,.1);color:var(--red);border:1px solid rgba(255,79,106,.25)}\
.pr-status-excluded{background:rgba(107,122,144,.08);color:var(--text3);border:1px solid rgba(107,122,144,.15)}\
\
/* ─── Editable Fields ─── */\
.pr-editable{background:rgba(18,21,31,.6);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono);font-size:11px;padding:3px 6px;outline:none;width:60px;text-align:right;transition:border-color .15s}\
.pr-editable:focus{border-color:var(--accent)}\
.pr-editable.changed{border-color:var(--yellow);background:rgba(245,166,35,.04)}\
.pr-readonly{font-family:var(--mono);font-size:11px;color:var(--text2)}\
.pr-comment-input{background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--sans);font-size:11px;padding:4px 8px;outline:none;width:120px;transition:border-color .15s}\
.pr-comment-input:focus{border-color:var(--accent)}\
\
/* ─── Section / Project Cards ─── */\
.pr-section-title{font-family:var(--mono);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text);margin-bottom:12px;display:flex;align-items:center;gap:8px}\
.pr-section-title::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--cyan);box-shadow:0 0 6px var(--cyan)}\
.pr-proj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}\
.pr-proj-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow-card),var(--highlight)}\
.pr-proj-dev{display:flex;align-items:center;gap:12px;margin-bottom:10px}\
.pr-proj-dev-info{flex:1;display:flex;flex-direction:column;gap:2px}\
.pr-proj-dev-name{font-weight:600;font-size:13px}\
.pr-proj-dev-meta{font-family:var(--mono);font-size:9px;color:var(--text3)}\
.pr-proj-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}\
@media(max-width:600px){.pr-proj-stats{grid-template-columns:repeat(3,1fr)}}\
.pr-proj-stat{text-align:center;padding:3px}\
.pr-proj-stat-val{font-family:var(--mono);font-size:13px;font-weight:700}\
.pr-proj-stat-lbl{font-family:var(--mono);font-size:7px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-top:1px}\
.pr-proj-bar{height:4px;background:var(--bg);border-radius:2px;margin-top:10px;overflow:hidden}\
.pr-proj-bar-fill{height:100%;border-radius:2px;transition:width .3s}\
\
/* ─── Empty / Loading / Error ─── */\
.pr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;gap:10px;color:var(--text3);font-family:var(--mono);font-size:12px}\
.pr-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;gap:10px;color:var(--text3);font-family:var(--mono);font-size:12px}\
.pr-ring{width:28px;height:28px;border:2px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:prspin .7s linear infinite}\
@keyframes prspin{to{transform:rotate(360deg)}}\
\
/* ─── Save Bar ─── */\
.pr-save-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(245,166,35,.06);border:1px solid rgba(245,166,35,.15);border-radius:8px;margin-top:4px}\
.pr-save-indicator{width:8px;height:8px;border-radius:50%;transition:background .3s}\
.pr-save-indicator.saved{background:var(--green);box-shadow:0 0 6px var(--green)}\
.pr-save-indicator.dirty{background:var(--yellow);box-shadow:0 0 6px var(--yellow);animation:prpulse 1s infinite}\
@keyframes prpulse{0%,100%{opacity:1}50%{opacity:.5}}\
\
/* ─── Debug ─── */\
.pr-debug{margin-top:16px;padding:12px 16px;background:rgba(0,0,0,.3);border:1px solid rgba(245,166,35,.15);border-radius:8px;font-family:var(--mono);font-size:10px;color:var(--text3)}\
.pr-debug-title{color:var(--yellow);font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em}\
.pr-debug-row{padding:2px 0;border-bottom:1px solid rgba(255,255,255,.03)}\
\
/* ─── Diagnostics Panel ─── */\
.pr-diagnostics{margin-top:8px;padding:10px 14px;background:rgba(0,212,255,.03);border:1px solid rgba(0,212,255,.1);border-radius:8px;font-family:var(--mono);font-size:10px;color:var(--text3)}\
.pr-diagnostics-title{color:var(--cyan);font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;user-select:none}\
\
/* ─── Modal ─── */\
.pr-modal-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px}\
.pr-modal{background:var(--bg1);border:1px solid var(--border2);border-radius:var(--radius);width:100%;max-width:800px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.5)}\
.pr-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);gap:12px}\
.pr-modal-title{font-family:var(--mono);font-size:13px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}\
.pr-modal-close{background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;padding:4px 8px;transition:color .15s;flex-shrink:0}\
.pr-modal-close:hover{color:var(--text)}\
.pr-modal-body{padding:20px;overflow-y:auto;flex:1}\
.pr-modal-footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 20px;border-top:1px solid var(--border);align-items:center}\
\
/* ─── Admin Tabs ─── */\
.pr-admin-tabs{display:flex;gap:2px;margin-left:auto}\
.pr-admin-tab{font-family:var(--mono);font-size:10px;font-weight:600;padding:4px 12px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text3);cursor:pointer;transition:all .15s}\
.pr-admin-tab:hover{border-color:var(--border2);color:var(--text2)}\
.pr-admin-tab.active{background:var(--accent);color:#fff;border-color:var(--accent)}\
\
/* ─── Admin Cards Grid ─── */\
.pr-admin-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}\
.pr-admin-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;transition:border-color .2s}\
.pr-admin-card:hover{border-color:var(--border2)}\
.pr-admin-card-hdr{display:flex;align-items:center;gap:8px;margin-bottom:10px}\
.pr-admin-card-avatar{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:var(--bg3);border:1px solid var(--glass-border);color:var(--accent);flex-shrink:0}\
.pr-admin-card-name{font-weight:600;font-size:12px;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.pr-admin-card-fields{display:grid;grid-template-columns:1fr 1fr;gap:6px}\
.pr-admin-field{display:flex;flex-direction:column;gap:2px}\
.pr-admin-field label{font-family:var(--mono);font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em}\
\
/* ─── Admin Table ─── */\
.pr-admin-table{width:100%;border-collapse:collapse}\
.pr-admin-table th{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;padding:8px 6px;text-align:left;border-bottom:1px solid var(--border);background:rgba(18,21,31,.5)}\
.pr-admin-table td{padding:6px;border-bottom:1px solid var(--border)}\
.pr-admin-input{background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono);font-size:11px;padding:6px 8px;outline:none;width:100%;transition:border-color .15s}\
.pr-admin-input:focus{border-color:var(--accent)}\
\
/* ─── Project Cards ─── */\
.pr-project-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;transition:border-color .2s}\
.pr-project-card:hover{border-color:var(--border2)}\
.pr-project-card.pr-project-card-active{border-color:rgba(34,212,126,.3)}\
.pr-project-card-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}\
.pr-project-card-name{font-weight:600;font-size:12px;color:var(--text)}\
.pr-project-card-id{font-family:var(--mono);font-size:9px;color:var(--text3)}\
.pr-project-card-fields{display:grid;grid-template-columns:1fr 1fr;gap:6px}\
\
/* ─── Admin Sub-Modal ─── */\
.pr-admin-submodal{position:absolute;inset:0;z-index:10;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;border-radius:var(--radius)}\
.pr-admin-submodal-inner{background:var(--bg1);border:1px solid var(--border2);border-radius:var(--radius);padding:20px;max-width:500px;width:90%;display:flex;flex-direction:column;gap:8px;box-shadow:0 8px 32px rgba(0,0,0,.5)}\
.pr-admin-submodal-title{font-family:var(--mono);font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px}\
\
/* ─── Animations ─── */\
@keyframes prspin{to{transform:rotate(360deg)}}\
@keyframes prpulse{0%,100%{opacity:1}50%{opacity:.5}}\
';

/* ═══ PLAN TAB STYLES ═══ */
var PLAN_CSS = '\
.plan-doc-header{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;margin-bottom:16px;box-shadow:var(--shadow-card),var(--highlight)}\
.plan-doc-title{font-family:var(--mono);font-size:15px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:.04em;display:flex;align-items:center;gap:10px;margin-bottom:12px}\
.plan-doc-title::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 8px var(--cyan)}\
.plan-doc-num{color:var(--accent);font-size:13px}\
.plan-doc-date{color:var(--text3);font-size:11px;font-weight:400}\
.plan-dirty{color:var(--yellow);font-size:16px;margin-left:4px}\
.plan-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}\
.plan-btn{font-family:var(--mono);font-size:10px;font-weight:700;padding:6px 14px;border-radius:8px;cursor:pointer;border:1px solid;text-transform:uppercase;letter-spacing:.04em;transition:all .15s;box-shadow:var(--shadow-btn),var(--highlight)}\
.plan-btn:hover{transform:translateY(-1px)}\
.plan-btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}\
.plan-btn-yellow{background:var(--yellow);color:#000;border-color:var(--yellow)}\
.plan-btn-green{background:var(--green);color:#000;border-color:var(--green)}\
.plan-btn-ghost{background:transparent;color:var(--text3);border-color:var(--border)}\
.plan-btn-ghost:hover{color:var(--text);border-color:var(--border2)}\
.plan-reqs{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px}\
@media(max-width:800px){.plan-reqs{grid-template-columns:1fr 1fr}}\
.plan-req{display:flex;flex-direction:column;gap:3px}\
.plan-req label{font-family:var(--mono);font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em}\
.plan-req-input{background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px;padding:7px 10px;outline:none;transition:border-color .15s}\
.plan-req-input:focus{border-color:var(--accent)}\
.plan-req-val{font-family:var(--mono);font-size:12px;color:var(--text2);padding:7px 0}\
.plan-summary{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 20px;margin-bottom:16px;box-shadow:var(--shadow-card),var(--highlight)}\
.plan-summary-title{font-family:var(--mono);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;display:flex;align-items:center;gap:6px}\
.plan-summary-title::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--orange);box-shadow:0 0 6px var(--orange)}\
.plan-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}\
@media(max-width:700px){.plan-summary-grid{grid-template-columns:1fr 1fr}}\
.plan-summary-item{text-align:center;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px}\
.plan-summary-label{font-family:var(--mono);font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}\
.plan-summary-value{font-family:var(--mono);font-size:20px;font-weight:700;color:var(--text);line-height:1}\
.plan-summary-value.val-plan{color:var(--accent)}\
.plan-summary-value.val-fact{color:var(--green)}\
.plan-summary-value.val-diff-pos{color:rgba(34,212,126,.9)}\
.plan-summary-value.val-diff-neg{color:rgba(255,110,120,.9)}\
.plan-table-controls{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}\
.plan-search{background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--mono);font-size:11px;padding:6px 12px;outline:none;transition:border-color .15s;width:200px}\
.plan-search:focus{border-color:var(--accent)}\
.plan-search::placeholder{color:var(--text3)}\
.plan-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg2);box-shadow:var(--shadow-card),var(--highlight)}\
.plan-table-wrap::-webkit-scrollbar{height:5px}\
.plan-table-wrap::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}\
.plan-table{width:100%;border-collapse:collapse;table-layout:auto;min-width:900px}\
.plan-table th{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;padding:10px 10px;text-align:left;border-bottom:1px solid var(--glass-border);background:rgba(18,21,31,.5);white-space:nowrap;user-select:none;position:sticky;top:0;z-index:2}\
.plan-table td{padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;vertical-align:middle;font-family:var(--mono)}\
.plan-table tbody tr{transition:background .15s}\
.plan-table tbody tr:hover{background:var(--bg-hover)}\
.plan-table tbody tr.row-weekend{background:rgba(245,166,35,.03)}\
.plan-table tbody tr.row-weekend td{color:var(--text3)}\
.plan-table tfoot td{background:rgba(18,21,31,.5);font-weight:700;padding:12px 10px;border-bottom:none;font-family:var(--mono);font-size:12px;position:sticky;bottom:0;z-index:2}\
.cell-num{width:40px;text-align:center;color:var(--text3);font-size:11px}\
.cell-date{white-space:nowrap;color:var(--text2);font-size:12px}\
.cell-date .day-name{font-size:9px;color:var(--text3);margin-left:4px}\
.cell-money{text-align:right;font-size:12px;padding-right:14px!important}\
.cell-money.pos{color:rgba(34,212,126,.9)}\
.cell-money.neg{color:rgba(255,110,120,.9)}\
.cell-avg{text-align:right;color:var(--cyan);font-size:11px}\
.plan-edit{background:rgba(18,21,31,.6);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono);font-size:12px;padding:4px 8px;outline:none;width:100px;text-align:right;transition:border-color .15s,background .15s}\
.plan-edit:focus{border-color:var(--accent);background:rgba(79,139,255,.06)}\
.plan-edit.changed{border-color:var(--yellow);background:rgba(245,166,35,.06)}\
.plan-edit.active-cell{background:rgba(245,166,35,.1);border-color:var(--yellow)}\
.plan-comment-edit{background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text2);font-family:var(--sans);font-size:11px;padding:4px 8px;outline:none;width:100%;min-height:28px;resize:vertical;transition:border-color .15s;line-height:1.4}\
.plan-comment-edit:focus{border-color:var(--accent)}\
.plan-footer{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 20px;margin-top:16px;box-shadow:var(--shadow-card),var(--highlight)}\
.plan-footer-comment{margin-bottom:12px}\
.plan-footer-comment label{font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;display:block}\
.plan-footer-comment textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--sans);font-size:12px;padding:8px 12px;outline:none;min-height:60px;resize:vertical;transition:border-color .15s}\
.plan-footer-comment textarea:focus{border-color:var(--accent)}\
.plan-footer-totals{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px}\
.plan-total-item{display:flex;align-items:center;gap:6px}\
.plan-total-label{font-family:var(--mono);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em}\
.plan-total-value{font-family:var(--mono);font-size:14px;font-weight:700;color:var(--text)}\
.plan-total-value.val-plan{color:var(--accent)}\
.plan-total-value.val-fact{color:var(--green)}\
.plan-total-value.val-diff-pos{color:rgba(34,212,126,.9)}\
.plan-total-value.val-diff-neg{color:rgba(255,110,120,.9)}\
.plan-admin-badge{display:inline-flex;align-items:center;gap:4px;font-family:var(--mono);font-size:9px;font-weight:600;padding:3px 8px;border-radius:4px;background:rgba(245,166,35,.1);color:var(--yellow);border:1px solid rgba(245,166,35,.25);cursor:pointer;transition:all .15s;margin-left:8px}\
.plan-admin-badge:hover{background:rgba(245,166,35,.18);border-color:rgba(245,166,35,.4)}\
.admin-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}\
.admin-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;transition:border-color .2s}\
.admin-card:hover{border-color:var(--border2)}\
.admin-card-hdr{display:flex;align-items:center;gap:8px;margin-bottom:10px}\
.admin-card-avatar{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:var(--bg3);border:1px solid var(--glass-border);color:var(--accent);flex-shrink:0}\
.admin-card-name{font-weight:600;font-size:12px;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.admin-card-fields{display:grid;grid-template-columns:1fr 1fr;gap:6px}\
.admin-field{display:flex;flex-direction:column;gap:2px}\
.admin-field label{font-family:var(--mono);font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em}\
.admin-input{background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono);font-size:11px;padding:6px 8px;outline:none;width:100%;transition:border-color .15s}\
.admin-input:focus{border-color:var(--accent)}\
.admin-input.input-rate{color:var(--green)}\
.admin-input.input-client-rate{color:var(--cyan)}\
@media(max-width:600px){.plan-reqs{grid-template-columns:1fr}.plan-summary-grid{grid-template-columns:1fr 1fr}.plan-doc-header{padding:12px 14px}.plan-actions{gap:4px}.plan-btn{font-size:9px;padding:5px 10px}}\
';
