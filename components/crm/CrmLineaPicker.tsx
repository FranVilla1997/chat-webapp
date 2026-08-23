'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export type CrmLineaOption = {
  linea: string; // '' = todas
  label: string;
  href: string;
};

// Selector de línea de WhatsApp del CRM. Mismo patrón que CrmMonthPicker:
// prefetch anticipado de todas las variantes (para que el server ya tenga el
// render listo) + overlay de carga al click — cambiar de línea navega a la
// misma ruta con otro searchParam y Next NO muestra loading.tsx en ese caso,
// así que sin esto el chip parecía "tildado" hasta que llegaba el render.
export function CrmLineaPicker({
  options,
  selected,
}: {
  options: CrmLineaOption[];
  selected: string;
}) {
  const router = useRouter();
  const [loadingLinea, setLoadingLinea] = useState<string | null>(null);

  useEffect(() => {
    setLoadingLinea(null);
  }, [selected]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      for (const option of options) {
        if (option.linea !== selected) router.prefetch(option.href);
      }
    }, 400);

    return () => window.clearTimeout(handle);
  }, [options, router, selected]);

  const loadingLabel = options.find((option) => option.linea === loadingLinea)?.label ?? loadingLinea;

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {options.map((option) => {
          const active = option.linea === selected;
          return (
            <Link
              key={option.linea || 'todas'}
              href={option.href}
              prefetch
              onMouseEnter={() => router.prefetch(option.href)}
              onFocus={() => router.prefetch(option.href)}
              onClick={() => {
                if (!active) setLoadingLinea(option.linea);
              }}
              style={{
                padding: '5px 11px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 800,
                textDecoration: 'none',
                border: `1px solid ${active ? 'rgba(24,93,232,0.55)' : '#1e1e2a'}`,
                background: active ? 'rgba(24,93,232,0.16)' : '#0a0a0f',
                color: active ? '#8ab4ff' : '#848494',
                transition: 'border-color .15s ease, background .15s ease, color .15s ease',
              }}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      {loadingLinea !== null ? (
        <div
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              width: 'min(92vw, 430px)',
              border: '1px solid #1e1e2a',
              background: '#0a0a0f',
              borderRadius: 12,
              padding: 26,
              boxShadow: '0 24px 90px rgba(0,0,0,0.55)',
              textAlign: 'center',
            }}
          >
            <Image
              src="/logo/scala-logo.svg"
              alt="SCALA"
              width={104}
              height={14}
              style={{ filter: 'brightness(0) invert(1)', opacity: 0.92, marginBottom: 22 }}
            />
            <span
              style={{
                width: 32,
                height: 32,
                display: 'inline-block',
                borderRadius: '50%',
                border: '3px solid rgba(24,93,232,0.18)',
                borderTopColor: '#185de8',
                animation: 'crmLineaSpin .7s linear infinite',
                marginBottom: 16,
              }}
            />
            <h2 style={{ margin: 0, color: '#f2f2f4', fontSize: 18 }}>
              Filtrando: {loadingLabel}
            </h2>
            <p style={{ margin: '8px 0 0', color: '#848494', fontSize: 12, lineHeight: 1.45 }}>
              Recalculando leads, ventas, mensajes y proyecciones de esa línea...
            </p>
          </div>
          <style>{`
            @keyframes crmLineaSpin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      ) : null}
    </>
  );
}
