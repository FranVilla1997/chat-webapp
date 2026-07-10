'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;
const SESSION_KEY = 'scala_crm_month_cache';

export type CrmMonthOption = {
  month: string;
  href: string;
};

function readCachedMonths() {
  if (typeof window === 'undefined') return new Set<string>();

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? '{}') as Record<string, number>;
    return new Set(Object.keys(parsed));
  } catch {
    return new Set<string>();
  }
}

function markMonthCached(month: string) {
  if (typeof window === 'undefined') return;

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? '{}') as Record<string, number>;
    parsed[month] = Date.now();
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
  } catch {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ [month]: Date.now() }));
  }
}

export function CrmMonthPicker({
  months,
  selectedMonth,
}: {
  months: CrmMonthOption[];
  selectedMonth: string;
}) {
  const router = useRouter();
  const [loadingMonth, setLoadingMonth] = useState<string | null>(null);
  const [cachedMonths, setCachedMonths] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    markMonthCached(selectedMonth);
    setCachedMonths(readCachedMonths());
    setLoadingMonth(null);
  }, [selectedMonth]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      for (const option of months) {
        if (option.month !== selectedMonth) router.prefetch(option.href);
      }
    }, 350);

    return () => window.clearTimeout(handle);
  }, [months, router, selectedMonth]);

  const loadingCopy = useMemo(() => {
    if (!loadingMonth) return '';
    return cachedMonths.has(loadingMonth)
      ? 'Recuperando datos guardados de la sesion...'
      : 'Calculando ventas, mensajes y proyecciones...';
  }, [cachedMonths, loadingMonth]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        {months.map((option) => {
          const active = option.month === selectedMonth;

          return (
            <Link
              key={option.month}
              href={option.href}
              prefetch
              onMouseEnter={() => router.prefetch(option.href)}
              onFocus={() => router.prefetch(option.href)}
              onClick={() => {
                if (!active) setLoadingMonth(option.month);
              }}
              style={{
                border: `1px solid ${active ? 'rgba(24,93,232,0.45)' : 'rgba(255,255,255,0.08)'}`,
                background: active ? 'rgba(24,93,232,0.16)' : '#12121a',
                color: active ? '#8ab4ff' : '#a8a8b3',
                borderRadius: 999,
                padding: '7px 10px',
                textDecoration: 'none',
                fontSize: 11,
                fontWeight: 800,
                fontFamily: MONO,
                transition: 'border-color .15s ease, background .15s ease, color .15s ease',
              }}
            >
              {option.month}
            </Link>
          );
        })}
      </div>

      {loadingMonth ? (
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
                animation: 'crmMonthSpin .7s linear infinite',
                marginBottom: 16,
              }}
            />
            <h2 style={{ margin: 0, color: '#f2f2f4', fontSize: 18 }}>
              Cargando {loadingMonth}
            </h2>
            <p style={{ margin: '8px 0 0', color: '#848494', fontSize: 12, lineHeight: 1.45 }}>
              {loadingCopy}
            </p>
          </div>
          <style>{`
            @keyframes crmMonthSpin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      ) : null}
    </>
  );
}
