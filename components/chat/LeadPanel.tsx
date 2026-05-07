'use client';

import type { LeadInfo } from '@/lib/types';
import type { Followup } from '@/hooks/useFollowups';

interface LeadPanelProps {
  lead: LeadInfo;
  followups: Followup[];
  open: boolean;
  onClose: () => void;
}

/* ── Status config ───────────────────────────── */
const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  pending:   { label: 'Pendiente', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)',  icon: '⏳' },
  sent:      { label: 'Enviado',   color: '#6bdda1', bg: 'rgba(107,221,161,0.1)', border: 'rgba(107,221,161,0.25)', icon: '✓' },
  cancelled: { label: 'Cancelado', color: '#5a5a72', bg: 'rgba(90,90,114,0.1)',   border: 'rgba(90,90,114,0.2)',    icon: '✕' },
  failed:    { label: 'Error',     color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)',  icon: '!' },
};

function getStatus(s: string) {
  return statusConfig[s] ?? statusConfig.pending;
}

/* ── Stage badge ─────────────────────────────── */
const stageColors: Record<string, { bg: string; text: string; border: string }> = {
  calificado:   { bg: 'rgba(107,221,161,0.1)',  text: '#6bdda1', border: 'rgba(107,221,161,0.25)' },
  interesado:   { bg: 'rgba(107,221,161,0.1)',  text: '#6bdda1', border: 'rgba(107,221,161,0.25)' },
  'en proceso': { bg: 'rgba(24,93,232,0.12)',   text: '#3b7ef5', border: 'rgba(24,93,232,0.25)' },
  cerrado:      { bg: 'rgba(248,113,113,0.1)',  text: '#f87171', border: 'rgba(248,113,113,0.2)' },
  perdido:      { bg: 'rgba(248,113,113,0.1)',  text: '#f87171', border: 'rgba(248,113,113,0.2)' },
};
function getStageBadge(s: string) {
  return stageColors[s.toLowerCase()] ?? { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.55)', border: 'rgba(255,255,255,0.1)' };
}

/* ── Date formatting ─────────────────────────── */
function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString();
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (isToday) return `Hoy ${time}`;
  if (isTomorrow) return `Mañana ${time}`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) + ` ${time}`;
}

function isPast(iso: string) {
  return new Date(iso) < new Date();
}

/* ── Phone formatting ────────────────────────── */
function formatPhone(p?: string) {
  if (!p) return null;
  if (p.startsWith('549') && p.length >= 12)
    return `+54 9 ${p.slice(3, 5)} ${p.slice(5, 9)}-${p.slice(9)}`;
  return `+${p}`;
}

function Avatar({ name }: { name?: string }) {
  const letter = name ? name.trim()[0].toUpperCase() : '?';
  return (
    <div style={{
      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, rgba(24,93,232,0.3), rgba(107,221,161,0.2))',
      border: '1px solid rgba(255,255,255,0.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 18, fontWeight: 700, color: '#f0f0f5',
    }}>
      {letter}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
      {children}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '2px 0' }} />;
}

/* ── Followup card ───────────────────────────── */
function FollowupCard({ f }: { f: Followup }) {
  const st = getStatus(f.status);
  const past = f.status === 'pending' && isPast(f.scheduled_at);

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${st.border}`,
      background: st.bg,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      opacity: f.status === 'cancelled' ? 0.6 : 1,
    }}>
      {/* Top row: attempt + status badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
          Seguimiento #{f.attempt_number}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: st.color,
          background: `rgba(0,0,0,0.2)`,
          border: `1px solid ${st.border}`,
          padding: '2px 7px', borderRadius: 10,
          letterSpacing: '0.04em',
        }}>
          {st.icon} {st.label}
        </span>
      </div>

      {/* Scheduled time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill={past && f.status === 'pending' ? '#f59e0b' : 'rgba(255,255,255,0.3)'}>
          <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/>
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/>
        </svg>
        <span style={{ fontSize: 11, color: past && f.status === 'pending' ? '#f59e0b' : 'rgba(255,255,255,0.5)', fontWeight: past ? 600 : 400 }}>
          {f.status === 'sent' && f.sent_at ? `Enviado ${formatDate(f.sent_at)}` : formatDate(f.scheduled_at)}
        </span>
      </div>

      {/* Intent + tone pills */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <Pill color="rgba(107,221,161,0.7)">{f.intent}</Pill>
        <Pill color="rgba(255,255,255,0.3)">{f.tone}</Pill>
      </div>

      {/* Instructions */}
      <p style={{
        fontSize: 12, lineHeight: 1.55, color: 'rgba(240,240,245,0.75)',
        margin: 0, wordBreak: 'break-word',
        borderLeft: '2px solid rgba(255,255,255,0.1)',
        paddingLeft: 8,
      }}>
        {f.instructions}
      </p>

      {/* Cancel reason */}
      {f.cancel_reason && (
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0, fontStyle: 'italic' }}>
          {f.cancel_reason}
        </p>
      )}
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 500,
      color, border: `1px solid ${color}`,
      padding: '2px 7px', borderRadius: 8,
      letterSpacing: '0.04em', textTransform: 'capitalize',
      background: 'rgba(0,0,0,0.15)',
    }}>
      {children}
    </span>
  );
}

/* ── Main component ──────────────────────────── */
export function LeadPanel({ lead, followups, open, onClose }: LeadPanelProps) {
  const phone = formatPhone(lead.phone);
  const stageBadge = lead.stage ? getStageBadge(lead.stage) : null;

  const pending   = followups.filter(f => f.status === 'pending');
  const rest      = followups.filter(f => f.status !== 'pending');

  return (
    <aside style={{
      width: open ? 268 : 0,
      minWidth: open ? 268 : 0,
      overflow: 'hidden',
      transition: 'width 0.25s ease, min-width 0.25s ease',
      borderLeft: open ? '1px solid rgba(255,255,255,0.06)' : 'none',
      background: '#06060e',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{
        width: 268,
        height: '100%',
        overflowY: 'auto',
        padding: '18px 14px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>

        {/* Panel header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
            Info del lead
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,0.3)', lineHeight: 1, borderRadius: 4 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
            </svg>
          </button>
        </div>

        {/* Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Avatar name={lead.name} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f5', margin: 0, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {lead.name ?? 'Sin nombre'}
            </p>
            {phone && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{phone}</p>}
          </div>
        </div>

        <Divider />

        {/* Stage + Score row */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {lead.stage && stageBadge && (
            <div style={{ flex: 1 }}>
              <Label>Etapa</Label>
              <div style={{ marginTop: 5, display: 'inline-flex', padding: '4px 10px', borderRadius: 16, background: stageBadge.bg, border: `1px solid ${stageBadge.border}` }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: stageBadge.text }}>{lead.stage}</span>
              </div>
            </div>
          )}
          {lead.score && (
            <div>
              <Label>Score</Label>
              <div style={{ marginTop: 5, display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: '#f0f0f5', lineHeight: 1 }}>{lead.score}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>pts</span>
              </div>
            </div>
          )}
        </div>

        {/* Custom fields */}
        {lead.fields && lead.fields.length > 0 && (
          <>
            <Divider />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lead.fields.map((f, i) => (
                <div key={i}>
                  <Label>{f.label}</Label>
                  <p style={{ fontSize: 12.5, color: 'rgba(240,240,245,0.82)', margin: '4px 0 0', lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {f.value}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Followups section ── */}
        {followups.length > 0 && (
          <>
            <Divider />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Label>Seguimientos</Label>
                {pending.length > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                    border: '1px solid rgba(245,158,11,0.3)',
                    padding: '2px 7px', borderRadius: 10,
                  }}>
                    {pending.length} pendiente{pending.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Pending first */}
                {pending.map(f => <FollowupCard key={f.id} f={f} />)}

                {/* Rest (sent/cancelled/failed) */}
                {rest.length > 0 && (
                  <details style={{ marginTop: pending.length ? 4 : 0 }}>
                    <summary style={{
                      fontSize: 11, color: 'rgba(255,255,255,0.28)',
                      cursor: 'pointer', userSelect: 'none',
                      padding: '4px 0', listStyle: 'none',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}>
                        <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"/>
                      </svg>
                      Ver historial ({rest.length})
                    </summary>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      {rest.map(f => <FollowupCard key={f.id} f={f} />)}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </>
        )}

        {followups.length === 0 && (
          <>
            <Divider />
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', margin: 0 }}>Sin seguimientos programados</p>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
