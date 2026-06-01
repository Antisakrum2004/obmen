'use client';

import { useEffect, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════
   Зарплатный обзор — iframe для статического HTML
   Версия: ПР-9.0.0
   ═══════════════════════════════════════════════════════════════ */

export default function PayrollReviewPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const iframe = document.getElementById('payroll-frame') as HTMLIFrameElement;
    if (iframe) {
      iframe.onload = () => setLoading(false);
    }
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B0F17',
          color: '#F3F7FF',
          fontFamily: "'Inter', sans-serif",
          flexDirection: 'column',
          gap: '16px',
          zIndex: 10
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
      )}
      <iframe
        id="payroll-frame"
        src="/payroll.html"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block'
        }}
        title="Зарплатный обзор"
      />
    </div>
  );
}
