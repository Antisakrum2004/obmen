'use client';

import { useEffect } from 'react';

/* ═══════════════════════════════════════════════════════════════
   Зарплатный обзор — Редирект на статический HTML
   Версия: ПР-8.6.0 — Вкладка ПЛАН интегрирована
   ═══════════════════════════════════════════════════════════════ */

export default function PayrollReviewRedirect() {
  useEffect(() => {
    // Редирект на статический HTML с зарплатным обзором
    window.location.replace('/index.html');
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0B0F17',
      color: '#F3F7FF',
      fontFamily: "'Inter', sans-serif",
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '2px solid rgba(255,255,255,0.1)',
        borderTopColor: '#4f8bff',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite'
      }} />
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '12px',
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em'
      }}>
        Загрузка Зарплатного обзора...
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
