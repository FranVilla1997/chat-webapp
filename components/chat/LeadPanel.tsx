'use client';

import type { LeadInfo } from '@/lib/types';
import type { Followup } from '@/hooks/useFollowups';

interface LeadPanelProps {
  lead: LeadInfo;
  followups: Followup[];
  open: boolean;
  onClose: () => void;
}

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  pending:   { label: 'Pendiente', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.2)',  dot: '#f59e0b' },
  sent:      { label: 'Enviado',   color: '#6bdda1', bg: 'rgba(107,221,161,0.06)', border: 'rgba(107,221,161,0.2)', dot: '#6bdda1' },
  cancelled: { label: 'Cancelado', color: '#404050', bg: 'rgba(64,64,80,0.06)',    border: 'rgba(64,64,80,0.2)',    dot: '#404050' },
  failed:    { label: 'Error',     color: '#e53e3e', bg: 'rgba(229,62,62,0.06)',   border: 'rgba(229,62,62,0.2)',   dot: '#e53e3e' },
};

const stageColors: Record<string, { bg: string; text: string; border: string }> = {
  calificado:        { bg: 'rgba(107,221,161,0.1)', text: '#6bdda1', border: 'rgba(107,221,161,0.25)' },
  en_calificacion:   { bg: 'rgba(245,158,11,0.1)',  text: '#f59e0b', border: 'rgba(245,158,11,0.25)'  },
  propuesta_enviada: { bg: 'rgba(24,93,232,0.1)',   text: '#185de8', border: 'rgba(24,93,232,0.25)'   },
  nuevo:             { bg: 'rgba(59,126,245,0.1)',  text: '#3b7ef5', border: 'rgba(59,126,245,0.25)'  },
  en_proceso:        { bg: 'rgba(245,158,11,0.1)',  text: '#f59e0b', border: 'rgba(245,158,11,0.25)'  },
  no_responde:       { bg: 'rgba(132,132,132,0.1)', text: '#848484', border: 'rgba(132,132,132,0.2)'  },
  cerrado_ganado:    { bg: 'rgba(107,221,161,0.1)', text: '#6bdda1', border: 'rgba(107,221,161,0.25)' },
  cerrado_perdido:   { bg: 'rgba(229,62,62,0.1)',   text: '#e53e3e', border: 'rgba(229,62,62,0.2)'    },
};

function getStatus(s: string) { return statusConfig[s] ?? statusConfig.pending; }
function getStageBadge(s: string) { return stageColors[s.toLowerCase()] ?? stageColors['nuevo']; }

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

function isPast(iso: string) { return new Date(iso) < new Date(); }

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
      width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
      background: '#12121a', border: '1px solid #2a2a38',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 17, fontWeight: 700, color: '#e4e4e8', fontFamily: MONO,
    }}>
      {letter}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: '#404050', fontFamily: MONO, display: 'block', marginBottom: 5,
    }}>
      {children}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#1e1e2a' }} />;
}

function FollowupCard({ f }: { f: Followup }) {
  const st = getStatus(f.status);
  const past = f.status === 'pending' && isPast(f.scheduled_at);

  return (
    <div style={{
      borderRadius: 5,
      border: `1px solid ${st.border}`,
      borderLeft: f.status === 'pending' ? `3px solid ${st.dot}` : `1px solid ${st.border}`,
      background: st.bg,
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 7,
      opacity: f.status === 'cancelled' ? 0.55 : 1,
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#404050', letterSpacing: '0.08em', fontFamily: MONO, textTransform: 'uppercase' }}>
          Seguimiento #{f.attempt_number}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, fontFamily: MONO,
          color: st.color, background: '#000',
          border: `1px solid ${st.border}`,
          padding: '2px 7px', borderRadius: 3,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {st.label}
        </span>
      </div>

      {/* Time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="10" height="10" viewBox="0 0 16 16" fill={past && f.status === 'pending' ? '#f59e0b' : '#404050'}>
          <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/>
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/>
        </svg>
        <span style={{ fontSize: 11, color: past && f.status === 'pending' ? '#f59e0b' : '#848484', fontWeight: past ? 600 : 400, fontFamily: MONO }}>
          {f.status === 'sent' && f.sent_at ? `Enviado ${formatDate(f.sent_at)}` : formatDate(f.scheduled_at)}
        </span>
      </div>

      {/* Pills */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <Pill color="#6bdda1">{f.intent}</Pill>
        <Pill color="#848484">{f.tone}</Pill>
      </div>

      {/* Instructions */}
      <p style={{
        fontSize: 12, lineHeight: 1.55, color: '#848484', margin: 0,
        wordBreak: 'break-word',
        borderLeft: '2px solid #1e1e2a', paddingLeft: 8,
      }}>
        {f.instructions}
      </p>

      {f.cancel_reason && (
        <p style={{ fontSize: 10, color: '#404050', margin: 0, fontStyle: 'italic', fontFamily: MONO }}>
          {f.cancel_reason}
        </p>
      )}
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, fontFamily: MONO,
      color, border: `1px solid ${color}33`,
      padding: '2px 6px', borderRadius: 3,
      letterSpacing: '0.06em', textTransform: 'capitalize',
      background: `${color}10`,
    }}>
      {children}
    </span>
  );
}

export function LeadPanel({ lead, followups, open, onClose }: LeadPanelProps) {
  const phone = formatPhone(lead.phone);
  const stageBadge = lead.stage ? getStageBadge(lead.stage) : null;
  const pending = followups.filter(f => f.status === 'pending');
  const rest    = followups.filter(f => f.status !== 'pending');

  return (
    <aside style={{
      width: open ? 268 : 0, minWidth: open ? 268 : 0,
      overflow: 'hidden',
      transition: 'width 0.2s ease, min-width 0.2s ease',
      borderLeft: open ? '1px solid #1e1e2a' : 'none',
      background: '#0a0a0f',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{
        width: 268, height: '100%', overflowY: 'auto',
        padding: '16px 16px 24px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#404050', fontFamily: MONO }}>
            Info del lead
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#404050', lineHeight: 1, borderRadius: 4 }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
            </svg>
          </button>
        </div>

        {/* Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Avatar name={lead.name} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#e4e4e8', margin: 0, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {lead.name ?? 'Sin nombre'}
            </p>
            {phone && <p style={{ fontSize: 11, color: '#848484', margin: '3px 0 0', fontFamily: MONO }}>{phone}</p>}
          </div>
        </div>

        <Divider />

        {/* Stage + Score */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {lead.stage && stageBadge && (
            <div>
              <Label>Etapa</Label>
              <span style={{
                display: 'inline-block', padding: '3px 8px', borderRadius: 3,
                background: stageBadge.bg, border: `1px solid ${stageBadge.border}`,
                fontSize: 10, fontWeight: 700, color: stageBadge.text,
                fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {lead.stage.replace('_', ' ')}
              </span>
            </div>
          )}
          {lead.score && (
            <div>
              <Label>Score</Label>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: '#e4e4e8', lineHeight: 1, fontFamily: MONO }}>{lead.score}</span>
                <span style={{ fontSize: 9, color: '#404050', fontFamily: MONO }}>pts</span>
              </div>
            </div>
          )}
        </div>

        {/* Fields */}
        {lead.fields && lead.fields.length > 0 && (
          <>
            <Divider />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {lead.fields.map((f, i) => (
                <div key={i}>
                  <Label>{f.label}</Label>
                  <p style={{ fontSize: 13, color: '#e4e4e8', margin: 0, lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {f.value}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Followups */}
        {followups.length > 0 && (
          <>
            <Divider />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Label>Seguimientos</Label>
                {pending.length > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, fontFamily: MONO,
                    background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                    border: '1px solid rgba(245,158,11,0.25)',
                    padding: '2px 7px', borderRadius: 3,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {pending.length} pendiente{pending.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pending.map(f => <FollowupCard key={f.id} f={f} />)}
                {rest.length > 0 && (
                  <details>
                    <summary style={{
                      fontSize: 10, color: '#404050', fontFamily: MONO,
                      cursor: 'pointer', userSelect: 'none',
                      padding: '4px 0', listStyle: 'none',
                      display: 'flex', alignItems: 'center', gap: 4,
                      letterSpacing: '0.04em',
                    }}>
                      <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.4 }}>
                        <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"/>
                      </svg>
                      Historial ({rest.length})
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
            <p style={{ fontSize: 10, color: '#404050', textAlign: 'center', fontFamily: MONO, letterSpacing: '0.04em' }}>
              Sin seguimientos
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
