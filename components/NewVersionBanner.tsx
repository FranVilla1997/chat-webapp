'use client';

import { useEffect, useState } from 'react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Detector de versión nueva: los vendedores dejan la pestaña abierta por días
// y siguen corriendo código viejo después de cada deploy (los fixes "no les
// llegan"). Compara el sello de build del bundle contra el del server (cada
// 5 min y al volver a la pestaña) y ofrece recargar cuando difieren.
export function NewVersionBanner() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    const localBuildId = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!localBuildId || localBuildId === 'dev') return;

    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const body = await res.json() as { buildId?: string };
        if (!cancelled && body.buildId && body.buildId !== 'dev' && body.buildId !== localBuildId) {
          setOutdated(true);
        }
      } catch {
        // sin red o deploy en curso: reintenta en el próximo ciclo
      }
    }

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    void check();

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!outdated) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: '#0d1a2e',
        border: '1px solid rgba(24,93,232,0.55)',
        borderRadius: 8,
        padding: '11px 16px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.55)',
      }}
    >
      <span style={{ color: '#e4e4e8', fontSize: 13 }}>
        Hay una versión nueva de la app.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          border: 'none',
          background: '#185de8',
          color: '#fff',
          borderRadius: 6,
          padding: '7px 14px',
          fontSize: 12.5,
          fontWeight: 800,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Recargar
      </button>
    </div>
  );
}
