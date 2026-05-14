'use client';

import { useEffect, useMemo, useState } from 'react';

interface BotPauseControlProps {
  recordId: string;
  initialResumeAt?: string;
  onPause: (resumeAt: string) => Promise<void>;
  onResume: () => Promise<void>;
  busy?: boolean;
}

const OPTIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: '2 horas', minutes: 120 },
  { label: '4 horas', minutes: 240 },
  { label: 'Mañana', minutes: 24 * 60 },
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toLocalDatetimeValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRemaining(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
}

export function BotPauseControl({ recordId, initialResumeAt, onPause, onResume, busy }: BotPauseControlProps) {
  const [open, setOpen] = useState(false);
  const [resumeAt, setResumeAt] = useState(initialResumeAt ?? '');
  const [customValue, setCustomValue] = useState(toLocalDatetimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setResumeAt(initialResumeAt ?? '');
  }, [initialResumeAt]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const pauseUntil = useMemo(() => {
    if (!resumeAt) return null;
    const date = new Date(resumeAt);
    return Number.isFinite(date.getTime()) ? date : null;
  }, [resumeAt]);

  const remainingMs = pauseUntil ? pauseUntil.getTime() - now : 0;
  const isPaused = remainingMs > 0;

  async function applyPause(target: Date) {
    const iso = target.toISOString();
    setResumeAt(iso);
    await onPause(iso);
    setOpen(false);
  }

  async function resumeBot() {
    await onResume();
    setResumeAt('');
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {isPaused && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 11px', borderRadius: 999,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
            color: '#fbbf24', fontSize: 11, fontWeight: 700,
          }}>
            Bot pausado {formatRemaining(remainingMs)}
          </span>
        )}
        {isPaused ? (
          <button
            type="button"
            onClick={() => void resumeBot()}
            disabled={busy}
            style={{
              padding: '8px 14px', borderRadius: 10,
              border: '1px solid rgba(53,229,138,0.22)',
              background: 'rgba(53,229,138,0.08)',
              color: 'var(--green)', fontSize: 12, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Reanudando...' : 'Reanudar bot'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={busy}
            style={{
              padding: '8px 14px', borderRadius: 10,
              border: '1px solid rgba(245,158,11,0.35)',
              background: 'rgba(245,158,11,0.08)',
              color: 'var(--warm)', fontSize: 12, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Pausando...' : 'Pausar bot'}
          </button>
        )}
      </div>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 420,
            background: 'var(--ink-3)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            boxShadow: '0 20px 80px rgba(0,0,0,0.5)',
            padding: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <h2 style={{ color: 'var(--text)', fontSize: 16, margin: 0 }}>Pausar bot</h2>
                <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '5px 0 0' }}>
                  Elegí cuánto tiempo Sentinel queda sin responder este lead.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: 'transparent', border: 0, color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 20 }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 18 }}>
              {OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  disabled={busy}
                  onClick={() => void applyPause(new Date(Date.now() + option.minutes * 60 * 1000))}
                  style={{
                    padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'rgba(255,255,255,0.035)',
                    color: 'var(--text)', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={{ display: 'grid', gap: 7, color: 'var(--text-3)', fontSize: 12, fontWeight: 700 }}>
                Fecha y hora específica
                <input
                  type="datetime-local"
                  value={customValue}
                  min={toLocalDatetimeValue(new Date(Date.now() + 60_000))}
                  onChange={(event) => setCustomValue(event.target.value)}
                  style={{
                    background: 'var(--ink-4)', color: 'var(--text)',
                    border: '1px solid var(--line)',
                    borderRadius: 8, padding: '10px 12px', fontSize: 13,
                  }}
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyPause(new Date(customValue))}
                style={{
                  width: '100%', marginTop: 10, padding: '10px 12px',
                  borderRadius: 8, border: 0,
                  background: '#f59e0b', color: '#09090f',
                  fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                Pausar hasta esa fecha
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
