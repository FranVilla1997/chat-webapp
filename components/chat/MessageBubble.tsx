import type { Message } from '@/lib/types';

interface MessageBubbleProps {
  message: Message;
  isOptimistic?: boolean;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function AudioBadge() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 5 }}>
      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M5 8.5a.5.5 0 0 0-1 0A4 4 0 0 0 7.5 12.46V14H6a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1H8.5v-1.54A4 4 0 0 0 12 8.5a.5.5 0 0 0-1 0 3 3 0 0 1-6 0z"/>
      </svg>
      Audio transcripto
    </span>
  );
}

/* Shared text style — no overflow, no truncation */
const msgText: React.CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.65,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  margin: 0,
};

export function MessageBubble({ message, isOptimistic }: MessageBubbleProps) {
  const { role, content, created_at, was_audio } = message;

  /* ── System — centered pill ─────────────────── */
  if (role === 'system') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
        <span style={{
          fontSize: 11, color: 'rgba(255,255,255,0.22)',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          padding: '3px 14px', borderRadius: 20,
        }}>
          {content}
        </span>
      </div>
    );
  }

  /* ── Lead — LEFT, neutral ───────────────────── */
  if (role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-start', opacity: isOptimistic ? 0.55 : 1 }}>
        <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', paddingLeft: 2 }}>
            Lead
          </span>
          <div style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '4px 16px 16px 16px',
            padding: '10px 14px',
          }}>
            {was_audio && <AudioBadge />}
            <p style={{ ...msgText, color: 'rgba(240,240,245,0.88)' }}>{content}</p>
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', paddingLeft: 2 }}>
            {formatTime(created_at)}
          </span>
        </div>
      </div>
    );
  }

  /* ── Bot — RIGHT, green mint ────────────────── */
  if (role === 'assistant') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: isOptimistic ? 0.55 : 1 }}>
        <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6bdda1', paddingRight: 2 }}>
            Bot
          </span>
          <div style={{
            background: 'rgba(107,221,161,0.1)',
            border: '1px solid rgba(107,221,161,0.22)',
            borderRadius: '16px 4px 16px 16px',
            padding: '10px 14px',
          }}>
            {was_audio && <AudioBadge />}
            <p style={{ ...msgText, color: 'rgba(240,240,245,0.9)' }}>{content}</p>
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', paddingRight: 2 }}>
            {formatTime(created_at)}
          </span>
        </div>
      </div>
    );
  }

  /* ── Vendedor — RIGHT, blue ─────────────────── */
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: isOptimistic ? 0.55 : 1 }}>
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#185de8', paddingRight: 2 }}>
          Vos
        </span>
        <div style={{
          background: 'linear-gradient(135deg, #1e6aff 0%, #185de8 100%)',
          borderRadius: '16px 4px 16px 16px',
          padding: '10px 14px',
          boxShadow: '0 2px 16px rgba(24,93,232,0.28)',
        }}>
          {was_audio && <AudioBadge />}
          <p style={{ ...msgText, color: '#fff' }}>{content}</p>
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', paddingRight: 2 }}>
          {formatTime(created_at)}
        </span>
      </div>
    </div>
  );
}
