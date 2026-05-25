'use client';

import { useState } from 'react';

/* ═══════════════════════════════════════════════════════════════
   PAYROLL REVIEW DASHBOARD — UX/UI POLISH PREVIEW
   BEFORE (Current) vs AFTER (Proposed)
   NOT FOR PRODUCTION — MOCKUP ONLY
   ═══════════════════════════════════════════════════════════════ */

const DEVS = [
  { id: '18', name: 'Константин Приходько', rate: 1000, clientRate: 1800, base: 0, fine: 0, hours: 142.5, billable: 130, payroll: 130, tasks: 12, approved: 8, pending: 4, margin: 38 },
  { id: '38', name: 'Александр Соколовский', rate: 1300, clientRate: 2200, base: 0, fine: 0, hours: 158, billable: 150, payroll: 150, tasks: 15, approved: 15, pending: 0, margin: 41 },
  { id: '82', name: 'Дмитрий Черных', rate: 1000, clientRate: 1600, base: 0, fine: 5000, hours: 96, billable: 90, payroll: 90, tasks: 8, approved: 3, pending: 5, margin: 44 },
  { id: '92', name: 'Артём Васильев', rate: 1100, clientRate: 1900, base: 0, fine: 0, hours: 120, billable: 110, payroll: 110, tasks: 10, approved: 6, pending: 4, margin: 42 },
  { id: '116', name: 'Андрей Предеин', rate: 0, clientRate: 0, base: 200000, fine: 0, hours: 0, billable: 0, payroll: 0, tasks: 0, approved: 0, pending: 0, margin: -100 },
  { id: '1', name: 'Иван Админов', rate: 1200, clientRate: 2000, base: 0, fine: 0, hours: 168, billable: 160, payroll: 155, tasks: 18, approved: 18, pending: 0, margin: 29 },
  { id: '54', name: 'Михаил Козлов', rate: 900, clientRate: 1500, base: 0, fine: 10000, hours: 78, billable: 70, payroll: 70, tasks: 7, approved: 2, pending: 5, margin: 53 },
  { id: '98', name: 'Павел Морозов', rate: 1000, clientRate: 1700, base: 0, fine: 0, hours: 134, billable: 128, payroll: 128, tasks: 11, approved: 9, pending: 2, margin: 41 },
];

const TOTALS = {
  factHours: 896.5,
  billable: 838,
  payroll: 833,
  payrollAmount: 1033200,
  clientRevenue: 1480400,
  serviceIncome: 35000,
  margin: 35,
  marginRub: 482200,
  fines: 15000,
  tasks: 81,
  approved: 61,
  pending: 20,
};

type ViewMode = 'before' | 'after';

export default function PayrollPolishPreview() {
  const [view, setView] = useState<ViewMode>('after');
  const [showSection, setShowSection] = useState<string>('all');

  return (
    <div className={`min-h-screen ${view === 'after' ? 'bg-[#0a0c14]' : 'bg-[#0d1017]'}`}>
      {/* ─── TOP SWITCHER ─── */}
      <div className="sticky top-0 z-50 bg-[#0d1017]/90 backdrop-blur-md border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white/40 text-xs font-mono tracking-wider uppercase">Payroll UI Polish</span>
          <span className="text-white/20 text-xs">|</span>
          <span className={`text-xs font-mono ${view === 'after' ? 'text-emerald-400' : 'text-amber-400'}`}>
            {view === 'after' ? '✦ PROPOSED' : '● CURRENT'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('before')}
            className={`px-4 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
              view === 'before'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-white/5 text-white/40 border border-white/5 hover:text-white/60'
            }`}
          >
            BEFORE
          </button>
          <button
            onClick={() => setView('after')}
            className={`px-4 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
              view === 'after'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-white/5 text-white/40 border border-white/5 hover:text-white/60'
            }`}
          >
            AFTER
          </button>
          <span className="text-white/10 mx-2">|</span>
          <select
            value={showSection}
            onChange={(e) => setShowSection(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg text-white/60 text-xs font-mono px-3 py-1.5 outline-none"
          >
            <option value="all">All Sections</option>
            <option value="header">Header</option>
            <option value="kpi">KPI Cards</option>
            <option value="heatmap">Heatmap</option>
            <option value="cards">Dev Cards</option>
            <option value="footer">Financial Footer</option>
          </select>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {view === 'before' ? <BeforeDashboard showSection={showSection} /> : <AfterDashboard showSection={showSection} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BEFORE — Current Dashboard (recreated from CSS)
   ═══════════════════════════════════════════════════════════════ */
function BeforeDashboard({ showSection }: { showSection: string }) {
  return (
    <div className="space-y-3">
      {/* Header */}
      {(showSection === 'all' || showSection === 'header') && (
        <div className="flex items-center justify-between flex-wrap gap-3 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#22d47e]" />
            <span className="text-white font-mono text-sm font-bold uppercase tracking-wider">Зарплатный обзор</span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">ЖИВОЙ</span>
            <span className="font-mono text-[9px] text-white/30">v8.5.0</span>
          </div>
          <div className="flex items-center gap-2 text-white/30 font-mono text-[10px]">
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">8 разраб.</span>
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">81 задач</span>
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-400">Черновик</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">кэш</span>
            <select className="bg-white/5 border border-white/10 rounded-lg text-white/50 text-[11px] font-mono px-2.5 py-1.5">
              <option>Май 2026</option>
            </select>
            <button className="text-white/30 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] font-mono">↻</button>
            <div className="flex gap-0.5 bg-[#0d1017] border border-white/10 rounded-lg p-0.5">
              <button className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold bg-[#4f8bff] text-white">Карточки</button>
              <button className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold text-white/30">Таблица</button>
            </div>
            <div className="flex gap-0.5 bg-[#0d1017] border border-white/10 rounded-lg p-0.5">
              <button className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold bg-cyan-500 text-black">Разраб</button>
              <button className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold text-white/30">Фин.</button>
              <button className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold text-white/30">Аудит</button>
            </div>
            <div className="flex gap-0.5 bg-[#0d1017] border border-white/10 rounded-lg p-0.5">
              <button className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold text-white/30">Компактно</button>
              <button className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold bg-white/10 text-white">Плотно</button>
            </div>
            <button className="text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider">⚙ Админка</button>
            <button className="text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-lg px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider">⬇ CSV</button>
            <button className="text-white/30 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-mono">CSV+</button>
            <button className="text-white bg-[#4f8bff] border-[#4f8bff] rounded-lg px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider">✓ Подтвердить все</button>
          </div>
        </div>
      )}

      {/* KPI */}
      {(showSection === 'all' || showSection === 'kpi') && (
        <div className="grid grid-cols-5 gap-2.5">
          {[
            { label: 'Факт часы', val: '896.5', sub: '81 задач', color: '#4f8bff' },
            { label: 'Опл. клиента', val: '838.0', sub: '61 подтв.', color: '#22d47e' },
            { label: 'К выплате', val: '833.0', sub: '20 ожидает', color: '#f5a623' },
            { label: 'Сумма выплат', val: '1 033 200', sub: '2 споров', color: '#f5a623' },
            { label: 'Маржа', val: '+35%', sub: '482 200 р', color: '#22d47e' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: kpi.color }} />
              <div className="font-mono text-[9px] text-white/30 uppercase tracking-widest mb-1.5">{kpi.label}</div>
              <div className="font-mono text-2xl font-bold text-white leading-none">{kpi.val}</div>
              <div className="text-[10px] text-white/30 mt-1">{kpi.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Heatmap */}
      {(showSection === 'all' || showSection === 'heatmap') && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 px-3.5">
          <div className="font-mono text-[9px] text-white/30 uppercase tracking-widest mb-2">Команда</div>
          <div className="flex gap-1.5 flex-wrap">
            {DEVS.map((d) => {
              const risk = d.hours < 80 ? 'red' : d.hours < 120 ? 'yellow' : 'green';
              const firstName = d.name.split(' ')[0];
              return (
                <div key={d.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] cursor-pointer hover:border-white/10">
                  <span className={`w-1.5 h-1.5 rounded-full ${risk === 'green' ? 'bg-emerald-400 shadow-[0_0_4px_#22d47e]' : risk === 'yellow' ? 'bg-amber-400 shadow-[0_0_4px_#f5a623]' : 'bg-red-400 shadow-[0_0_4px_#ff4f6a]'}`} />
                  <span className="font-mono text-[10px] text-white/60">{firstName}</span>
                  <span className="font-mono text-[10px] text-white/30">{d.hours}h</span>
                  <span className={`font-mono text-[9px] font-semibold ${d.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {d.margin >= 0 ? '+' : ''}{d.margin}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      {(showSection === 'all' || showSection === 'header') && (
        <div className="flex items-center gap-2 py-2 flex-wrap">
          <select className="bg-white/5 border border-white/10 rounded-lg text-white/50 text-[11px] font-mono px-2.5 py-1.5">
            <option>Все разработчики</option>
          </select>
          <select className="bg-white/5 border border-white/10 rounded-lg text-white/50 text-[11px] font-mono px-2.5 py-1.5">
            <option>Все проекты</option>
          </select>
          <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider">Статус:</span>
          {['Ожидает', 'Подтв.', 'Спор', 'Исключено'].map((s, i) => (
            <span key={s} className="font-mono text-[10px] font-semibold px-2.5 py-1 rounded-md border border-white/[0.06] bg-white/[0.04] text-white/30 cursor-pointer">{s}</span>
          ))}
        </div>
      )}

      {/* Cards */}
      {(showSection === 'all' || showSection === 'cards') && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3.5 mt-3">
          {DEVS.map((dev) => {
            const riskCls = dev.hours < 80 ? 'border-red-500/30' : dev.pending > 3 ? 'border-amber-500/30' : '';
            const cutHours = dev.hours - dev.billable;
            return (
              <div key={dev.id} className={`bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden ${riskCls}`}>
                {/* Inner */}
                <div className="p-4 pb-2.5">
                  {/* Header */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold bg-white/[0.06] border border-white/[0.08] text-[#4f8bff]">
                      {dev.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-semibold text-sm truncate">{dev.name}</div>
                      <div className="font-mono text-[10px] text-white/30">{dev.rate} р/ч</div>
                    </div>
                    <span className={`font-mono text-[9px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                      dev.approved === dev.tasks && dev.tasks > 0 ? 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/25' :
                      dev.approved > 0 ? 'bg-[#4f8bff]/12 text-[#4f8bff] border border-[#4f8bff]/25' :
                      'bg-white/[0.04] text-white/30 border border-white/10'
                    }`}>
                      {dev.approved === dev.tasks && dev.tasks > 0 ? 'APPROVED' : dev.approved > 0 ? 'REVIEW' : 'DRAFT'}
                    </span>
                  </div>
                  {/* Primary KPI */}
                  <div className="flex gap-4 mb-3 items-end">
                    <div className="flex-1">
                      <div className="font-mono text-[28px] font-bold text-[#4f8bff] leading-none">{dev.hours.toFixed(1)}</div>
                      <div className="font-mono text-[9px] text-white/30 uppercase tracking-wider mt-0.5">Факт часов</div>
                    </div>
                    <div className="flex-1">
                      <div className="font-mono text-[22px] font-bold text-amber-400 leading-none">
                        {dev.base > 0 ? dev.base.toLocaleString('ru-RU') : (dev.payroll * dev.rate).toLocaleString('ru-RU')}
                      </div>
                      <div className="font-mono text-[9px] text-white/30 uppercase tracking-wider mt-0.5">К выплате</div>
                      {dev.base > 0 && (
                        <div className="font-mono text-[8px] text-white/20 mt-0.5">200 000 ЗП/Бонус</div>
                      )}
                      {dev.fine > 0 && (
                        <div className="font-mono text-[8px] text-amber-400/70 mt-0.5">{dev.fine.toLocaleString('ru-RU')} штраф → прибыль</div>
                      )}
                    </div>
                  </div>
                  {/* Secondary */}
                  <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                    <span className="bg-white/[0.06] px-2 py-0.5 rounded text-[9px] font-mono text-white/30">Billable</span>
                    <span className="font-mono text-[11px] font-semibold text-emerald-400">{dev.billable}h</span>
                    <span className="w-px h-3.5 bg-white/[0.06] mx-0.5" />
                    <span className="bg-white/[0.06] px-2 py-0.5 rounded text-[9px] font-mono text-white/30">Cut</span>
                    <span className="font-mono text-[11px] font-semibold text-red-400">-{cutHours}h</span>
                  </div>
                  {/* Progress */}
                  <div className="space-y-1.5 mb-2.5">
                    {[
                      { label: 'Загрузка', pct: Math.min(Math.round(dev.hours / 160 * 100), 100), val: `${dev.hours.toFixed(0)}/160h`, color: dev.hours > 128 ? '#22d47e' : dev.hours > 80 ? '#f5a623' : '#ff4f6a' },
                      { label: 'Billable', pct: dev.hours > 0 ? Math.round(dev.billable / dev.hours * 100) : 0, val: `${dev.hours > 0 ? Math.round(dev.billable / dev.hours * 100) : 0}%`, color: dev.hours > 0 && dev.billable / dev.hours >= 0.95 ? '#22d47e' : dev.hours > 0 && dev.billable / dev.hours >= 0.8 ? '#f5a623' : '#ff4f6a' },
                    ].map((bar) => (
                      <div key={bar.label} className="flex items-center gap-1.5">
                        <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider w-[60px] shrink-0">{bar.label}</span>
                        <div className="flex-1 h-1 bg-black/40 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${bar.pct}%`, background: bar.color }} />
                        </div>
                        <span className="font-mono text-[9px] text-white/30 min-w-[40px] text-right">{bar.val}</span>
                      </div>
                    ))}
                  </div>
                  {/* Risks */}
                  {dev.hours < 80 && (
                    <div className="flex gap-1 flex-wrap mb-2">
                      <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-400 border border-amber-500/25 uppercase tracking-wider">LOW LOAD</span>
                    </div>
                  )}
                  {dev.rate === 0 && (
                    <div className="flex gap-1 flex-wrap mb-2">
                      <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/12 text-red-400 border border-red-500/25 uppercase tracking-wider">RATE=0</span>
                    </div>
                  )}
                </div>
                {/* Footer */}
                <div className="flex bg-black/15 border-t border-white/[0.06]">
                  {[
                    { val: dev.tasks, label: 'Задач' },
                    { val: dev.tasks > 0 ? (dev.hours / dev.tasks).toFixed(1) + 'h' : '0h', label: 'Ср/зад' },
                    { val: '0', label: 'Выходн' },
                    { val: '0', label: 'Сверхур' },
                  ].map((m) => (
                    <div key={m.label} className="flex-1 text-center py-1.5">
                      <div className="font-mono text-xs font-bold text-white/60">{m.val}</div>
                      <div className="font-mono text-[8px] text-white/25 uppercase tracking-wider">{m.label}</div>
                    </div>
                  ))}
                </div>
                {/* Expand */}
                <div className="flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] text-white/30 cursor-pointer border-t border-white/[0.06] bg-black/[0.06] hover:bg-black/10">
                  <span className="text-[8px]">▼</span> Задачи ({dev.tasks})
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Financial Footer */}
      {(showSection === 'all' || showSection === 'footer') && (
        <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-xl mt-3 overflow-hidden">
          {[
            { label: 'Факт часы', val: '896.5', color: 'text-[#4f8bff]' },
            { label: 'Billable', val: '838.0', color: 'text-emerald-400' },
            { label: 'Выручка', val: '1 515 400', color: 'text-cyan-400' },
            { label: 'Затраты', val: '1 033 200', color: 'text-amber-400' },
            { label: 'Маржа', val: '+35% (482 200)', color: 'text-emerald-400' },
          ].map((item, i, arr) => (
            <div key={item.label} className={`flex-1 text-center py-2.5 px-3 ${i < arr.length - 1 ? 'border-r border-white/[0.06]' : ''}`}>
              <div className="font-mono text-[8px] text-white/30 uppercase tracking-widest mb-1">{item.label}</div>
              <div className={`font-mono text-[13px] font-bold ${item.color}`}>{item.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Debug */}
      {(showSection === 'all') && (
        <div className="mt-4 p-3 px-4 bg-black/30 border border-amber-500/15 rounded-lg font-mono text-[10px] text-white/30">
          <div className="text-amber-400 font-bold mb-1.5 uppercase tracking-widest">ОТЛАДКА (ЖИВОЙ)</div>
          <div className="py-0.5 border-b border-white/[0.03]">Версия: 8.5.0</div>
          <div className="py-0.5 border-b border-white/[0.03]">Pipeline: elapsed-first-daybyday v7.2.0</div>
          <div className="py-0.5 border-b border-white/[0.03]">Load: 2400ms | Norm: 180ms | Render: 95ms | Total: 2675ms</div>
          <div className="py-0.5 border-b border-white/[0.03]">Cache: hits=3 misses=1 stale=0 rate=75%</div>
          <div className="py-0.5 border-b border-white/[0.03]">Elapsed записей: 578</div>
          <div className="py-0.5">Строк обзора: 81</div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AFTER — Polished Dashboard
   ═══════════════════════════════════════════════════════════════ */
function AfterDashboard({ showSection }: { showSection: string }) {
  return (
    <div className="space-y-6">
      {/* ─── HEADER (Etape 4: Cleanup) ─── */}
      {(showSection === 'all' || showSection === 'header') && (
        <div className="flex items-center justify-between flex-wrap gap-4 pb-1">
          {/* Left: Title */}
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600" />
            <span className="text-white/90 font-mono text-[13px] font-semibold tracking-wide">Зарплатный обзор</span>
            <span className="font-mono text-[9px] px-2 py-0.5 rounded-md bg-emerald-500/8 text-emerald-400/80 border border-emerald-500/12">live</span>
            <span className="font-mono text-[8px] text-white/15 tracking-wider">v8.5.0</span>
          </div>
          {/* Center: Period + Stats */}
          <div className="flex items-center gap-3">
            <select className="bg-white/[0.03] border border-white/[0.06] rounded-lg text-white/50 text-[11px] font-mono px-3 py-1.5 outline-none hover:border-white/10 transition-colors">
              <option>Май 2026</option>
            </select>
            <div className="flex items-center gap-2 text-white/25 font-mono text-[10px]">
              <span>8 devs</span>
              <span className="text-white/10">·</span>
              <span>81 tasks</span>
              <span className="text-white/10">·</span>
              <span className="text-cyan-400/60">draft</span>
            </div>
            <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/6 text-cyan-400/50 border border-cyan-500/8">cached</span>
          </div>
          {/* Right: Grouped controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* View modes — subtle pill group */}
            <div className="flex gap-0.5 bg-white/[0.02] border border-white/[0.04] rounded-lg p-0.5">
              <button className="px-2.5 py-1 rounded-md text-[9px] font-mono font-medium bg-white/[0.08] text-white/60">Cards</button>
              <button className="px-2.5 py-1 rounded-md text-[9px] font-mono font-medium text-white/20 hover:text-white/30">Table</button>
            </div>
            <div className="flex gap-0.5 bg-white/[0.02] border border-white/[0.04] rounded-lg p-0.5">
              <button className="px-2.5 py-1 rounded-md text-[9px] font-mono font-medium bg-cyan-500/15 text-cyan-400/80">Dev</button>
              <button className="px-2.5 py-1 rounded-md text-[9px] font-mono font-medium text-white/20 hover:text-white/30">Fin</button>
              <button className="px-2.5 py-1 rounded-md text-[9px] font-mono font-medium text-white/20 hover:text-white/30">Audit</button>
            </div>
            {/* Action buttons — calm secondary style */}
            <button className="text-white/25 border border-white/[0.06] bg-transparent rounded-lg px-2.5 py-1.5 text-[10px] font-mono hover:text-white/40 hover:border-white/10 transition-all">↻</button>
            <button className="text-white/35 border border-white/[0.06] bg-white/[0.02] rounded-lg px-3 py-1.5 text-[10px] font-mono font-medium hover:border-white/10 hover:text-white/50 transition-all">⚙ Admin</button>
            <button className="text-white/35 border border-white/[0.06] bg-white/[0.02] rounded-lg px-3 py-1.5 text-[10px] font-mono font-medium hover:border-white/10 hover:text-white/50 transition-all">CSV</button>
            <button className="text-white bg-white/[0.08] border border-white/[0.1] rounded-lg px-3.5 py-1.5 text-[10px] font-mono font-semibold hover:bg-white/[0.12] transition-all">✓ Approve All</button>
          </div>
        </div>
      )}

      {/* ─── KPI CARDS (Etape 2: Visual Hierarchy) ─── */}
      {(showSection === 'all' || showSection === 'kpi') && (
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'Fact Hours', val: '896.5', sub: '81 tasks', color: '#4f8bff', accent: true },
            { label: 'Billable', val: '838.0', sub: '61 approved', color: '#22d47e', accent: false },
            { label: 'To Pay', val: '833.0', sub: '20 pending', color: '#f5a623', accent: false },
            { label: 'Total Payout', val: '1 033 200 ₽', sub: '', color: '#f5a623', accent: false },
            { label: 'Margin', val: '+35%', sub: '482 200 ₽', color: '#22d47e', accent: true },
          ].map((kpi) => (
            <div key={kpi.label} className="group relative rounded-xl overflow-hidden transition-all hover:scale-[1.01]">
              {/* Subtle gradient top line */}
              <div className="absolute top-0 left-0 right-0 h-px opacity-40" style={{ background: `linear-gradient(90deg, transparent, ${kpi.color}, transparent)` }} />
              {/* Card background with layered depth */}
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5 relative">
                {/* Inner glow on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `radial-gradient(ellipse at top, ${kpi.color}04, transparent 70%)` }} />
                <div className="relative">
                  <div className="font-mono text-[9px] text-white/20 uppercase tracking-[0.12em] mb-2">{kpi.label}</div>
                  <div className={`font-mono leading-none ${kpi.accent ? 'text-[26px] font-bold text-white/90' : 'text-[22px] font-semibold text-white/70'}`}>
                    {kpi.val}
                  </div>
                  {kpi.sub && <div className="text-[10px] text-white/15 mt-1.5 font-mono">{kpi.sub}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── HEATMAP (Etape 5: Simplification) ─── */}
      {(showSection === 'all' || showSection === 'heatmap') && (
        <div className="bg-white/[0.015] border border-white/[0.03] rounded-xl px-5 py-3">
          <div className="flex gap-2 flex-wrap">
            {DEVS.map((d) => {
              const risk = d.hours < 80 ? 'red' : d.hours < 120 ? 'yellow' : 'green';
              const firstName = d.name.split(' ')[0];
              return (
                <div
                  key={d.id}
                  className="group flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-all"
                  title={`${firstName}: ${d.hours}h | Billable: ${d.billable}h | Margin: ${d.margin >= 0 ? '+' : ''}${d.margin}%`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full transition-opacity ${
                    risk === 'green' ? 'bg-emerald-400/70' : risk === 'yellow' ? 'bg-amber-400/70' : 'bg-red-400/70'
                  }`} />
                  <span className="font-mono text-[10px] text-white/40 group-hover:text-white/60 transition-colors">{firstName}</span>
                  <span className="font-mono text-[10px] text-white/20">{d.hours}<span className="text-[8px]">h</span></span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── FILTERS ─── */}
      {(showSection === 'all' || showSection === 'header') && (
        <div className="flex items-center gap-3 flex-wrap">
          <select className="bg-white/[0.03] border border-white/[0.05] rounded-lg text-white/40 text-[10px] font-mono px-3 py-1.5 outline-none hover:border-white/8 transition-colors">
            <option>All Developers</option>
          </select>
          <select className="bg-white/[0.03] border border-white/[0.05] rounded-lg text-white/40 text-[10px] font-mono px-3 py-1.5 outline-none hover:border-white/8 transition-colors">
            <option>All Projects</option>
          </select>
          <span className="font-mono text-[8px] text-white/12 uppercase tracking-[0.12em] ml-1">Status</span>
          {['Pending', 'Approved', 'Disputed', 'Excluded'].map((s) => (
            <span key={s} className="font-mono text-[9px] font-medium px-2.5 py-1 rounded-md border border-white/[0.04] text-white/20 cursor-pointer hover:border-white/[0.08] hover:text-white/30 transition-all">{s}</span>
          ))}
        </div>
      )}

      {/* ─── DEV CARDS (Etape 2+3: Visual Hierarchy + Grid Breathing) ─── */}
      {(showSection === 'all' || showSection === 'cards') && (
        <div className="grid grid-cols-3 gap-5">
          {DEVS.map((dev) => {
            const cutHours = dev.hours - dev.billable;
            const payroll = dev.base > 0 ? dev.base : dev.payroll * dev.rate;
            const hasRisk = dev.hours < 80 || dev.rate === 0;
            return (
              <div key={dev.id} className={`group rounded-xl overflow-hidden transition-all duration-200 ${
                hasRisk
                  ? 'bg-white/[0.02] border border-white/[0.05]'
                  : 'bg-white/[0.02] border border-white/[0.03] hover:border-white/[0.06]'
              }`}>
                {/* ── L1: Primary (maximum readability) ── */}
                <div className="px-5 pt-5 pb-4">
                  {/* Header row */}
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-semibold bg-white/[0.04] border border-white/[0.05] text-white/40">
                      {dev.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white/80 font-medium text-[13px] truncate">{dev.name}</div>
                      <div className="font-mono text-[9px] text-white/20 mt-0.5">{dev.rate > 0 ? `${dev.rate} ₽/h` : 'Базовая ЗП'}</div>
                    </div>
                    <span className={`font-mono text-[8px] font-medium px-2 py-0.5 rounded-md tracking-wider ${
                      dev.approved === dev.tasks && dev.tasks > 0
                        ? 'bg-emerald-500/8 text-emerald-400/60 border border-emerald-500/10'
                        : dev.approved > 0
                        ? 'bg-[#4f8bff]/6 text-[#4f8bff]/50 border border-[#4f8bff]/8'
                        : 'bg-white/[0.02] text-white/15 border border-white/[0.04]'
                    }`}>
                      {dev.approved === dev.tasks && dev.tasks > 0 ? 'APPROVED' : dev.approved > 0 ? 'REVIEW' : 'DRAFT'}
                    </span>
                  </div>

                  {/* L1: Big numbers */}
                  <div className="flex items-baseline gap-6 mb-4">
                    <div>
                      <div className="font-mono text-[32px] font-bold text-white/85 leading-none tracking-tight">
                        {dev.hours.toFixed(1)}
                        <span className="text-[12px] text-white/15 font-normal ml-0.5">h</span>
                      </div>
                      <div className="font-mono text-[8px] text-white/15 uppercase tracking-[0.14em] mt-1">fact hours</div>
                    </div>
                    <div className="text-white/[0.06]">|</div>
                    <div>
                      <div className="font-mono text-[24px] font-semibold leading-none tracking-tight" style={{ color: dev.base > 0 ? 'rgba(245,166,35,0.7)' : 'rgba(255,255,255,0.55)' }}>
                        {payroll.toLocaleString('ru-RU')}
                        <span className="text-[11px] text-white/10 font-normal ml-0.5">₽</span>
                      </div>
                      <div className="font-mono text-[8px] text-white/15 uppercase tracking-[0.14em] mt-1">to pay</div>
                    </div>
                  </div>

                  {/* ── L2: Calm secondary ── */}
                  <div className="flex items-center gap-4 mb-4 text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-white/15 uppercase tracking-wider text-[8px]">Bill</span>
                      <span className="font-mono font-medium text-emerald-400/50">{dev.billable}h</span>
                    </div>
                    {cutHours > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-white/15 uppercase tracking-wider text-[8px]">Cut</span>
                        <span className="font-mono font-medium text-red-400/40">-{cutHours}h</span>
                      </div>
                    )}
                    {dev.margin !== -100 && (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-white/15 uppercase tracking-wider text-[8px]">Margin</span>
                        <span className={`font-mono font-medium ${dev.margin >= 0 ? 'text-emerald-400/40' : 'text-red-400/40'}`}>
                          {dev.margin >= 0 ? '+' : ''}{dev.margin}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Progress bars — thinner, calmer */}
                  <div className="space-y-2 mb-3">
                    {[
                      { label: 'Workload', pct: Math.min(Math.round(dev.hours / 160 * 100), 100), val: `${dev.hours.toFixed(0)}/160`, color: dev.hours > 128 ? 'rgba(34,212,126,0.4)' : dev.hours > 80 ? 'rgba(245,166,35,0.3)' : 'rgba(255,79,106,0.3)' },
                      { label: 'Billable', pct: dev.hours > 0 ? Math.round(dev.billable / dev.hours * 100) : 0, val: `${dev.hours > 0 ? Math.round(dev.billable / dev.hours * 100) : 0}%`, color: dev.hours > 0 && dev.billable / dev.hours >= 0.9 ? 'rgba(34,212,126,0.4)' : 'rgba(245,166,35,0.3)' },
                    ].map((bar) => (
                      <div key={bar.label} className="flex items-center gap-2">
                        <span className="font-mono text-[8px] text-white/12 uppercase tracking-[0.1em] w-[52px] shrink-0">{bar.label}</span>
                        <div className="flex-1 h-[3px] bg-white/[0.03] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${bar.pct}%`, background: bar.color }} />
                        </div>
                        <span className="font-mono text-[8px] text-white/12 min-w-[36px] text-right">{bar.val}</span>
                      </div>
                    ))}
                  </div>

                  {/* ── L3: Almost background ── */}
                  {/* Risks — subtle, not screaming */}
                  {hasRisk && (
                    <div className="flex gap-1.5 flex-wrap">
                      {dev.hours < 80 && (
                        <span className="font-mono text-[7px] font-medium px-1.5 py-0.5 rounded bg-amber-500/6 text-amber-400/30 border border-amber-500/5 tracking-wider">LOW LOAD</span>
                      )}
                      {dev.rate === 0 && (
                        <span className="font-mono text-[7px] font-medium px-1.5 py-0.5 rounded bg-red-500/6 text-red-400/30 border border-red-500/5 tracking-wider">RATE=0</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer — calm, muted */}
                <div className="flex border-t border-white/[0.03]">
                  {[
                    { val: dev.tasks, label: 'Tasks' },
                    { val: dev.tasks > 0 ? (dev.hours / dev.tasks).toFixed(1) : '0', label: 'Avg' },
                    { val: '0', label: 'Wknd' },
                    { val: '0', label: 'Over' },
                  ].map((m) => (
                    <div key={m.label} className="flex-1 text-center py-2.5">
                      <div className="font-mono text-[11px] font-medium text-white/25">{m.val}</div>
                      <div className="font-mono text-[7px] text-white/10 uppercase tracking-[0.1em] mt-0.5">{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Expand — minimal */}
                <div className="flex items-center justify-center py-2 font-mono text-[9px] text-white/12 cursor-pointer border-t border-white/[0.02] hover:text-white/20 hover:bg-white/[0.01] transition-all">
                  Tasks ({dev.tasks})
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── FINANCIAL FOOTER (Etape 8: Premium Fintech Feel) ─── */}
      {(showSection === 'all' || showSection === 'footer') && (
        <div className="relative mt-2">
          {/* Floating effect with subtle shadow */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl translate-y-1 blur-sm" />
          <div className="relative flex items-center bg-white/[0.025] border border-white/[0.04] rounded-xl overflow-hidden backdrop-blur-sm">
            {[
              { label: 'Fact Hours', val: '896.5', color: 'rgba(79,139,255,0.6)' },
              { label: 'Billable', val: '838.0', color: 'rgba(34,212,126,0.5)' },
              { label: 'Revenue', val: '1 515 400 ₽', color: 'rgba(0,212,255,0.5)' },
              { label: 'Costs', val: '1 033 200 ₽', color: 'rgba(245,166,35,0.5)' },
              { label: 'Margin', val: '+35%', sub: '482 200 ₽', color: 'rgba(34,212,126,0.7)' },
            ].map((item, i, arr) => (
              <div key={item.label} className={`flex-1 text-center py-4 px-4 ${i < arr.length - 1 ? 'border-r border-white/[0.03]' : ''}`}>
                <div className="font-mono text-[8px] text-white/15 uppercase tracking-[0.14em] mb-1.5">{item.label}</div>
                <div className="font-mono text-[15px] font-semibold" style={{ color: item.color }}>{item.val}</div>
                {item.sub && <div className="font-mono text-[9px] text-white/10 mt-0.5">{item.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── DEBUG (Etape 6: Reduction) ─── */}
      {showSection === 'all' && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer font-mono text-[8px] text-white/10 uppercase tracking-[0.16em] hover:text-white/20 transition-colors list-none">
            <svg className="w-2.5 h-2.5 transition-transform group-open:rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M6 6l8 4-8 4V6z"/></svg>
            Diagnostics
          </summary>
          <div className="mt-2 px-4 py-2.5 bg-white/[0.01] border border-white/[0.02] rounded-lg font-mono text-[8px] text-white/10 leading-relaxed">
            <div>v8.5.0 · elapsed-first-daybyday · Load 2400ms · Norm 180ms · Render 95ms</div>
            <div>Cache: 3 hits / 1 miss · 578 elapsed · 81 rows · 8 devs</div>
          </div>
        </details>
      )}
    </div>
  );
}
