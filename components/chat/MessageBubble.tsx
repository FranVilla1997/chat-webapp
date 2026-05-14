import type { Message } from '@/lib/types';

interface MessageBubbleProps {
  message: Message;
  isOptimistic?: boolean;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  return lines.map((line, index) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const content = bullet ? bullet[1] : line;
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={index} style={{ display: 'block', paddingLeft: bullet ? 14 : 0, position: 'relative' }}>
        {bullet && <span style={{ position: 'absolute', left: 0, color: 'var(--green)' }}>•</span>}
        {parts.map((part, partIndex) => part.startsWith('**') && part.endsWith('**')
          ? <strong key={partIndex} style={{ color: 'var(--text)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
          : <span key={partIndex}>{part}</span>
        )}
      </span>
    );
  });
}

function roleMeta(role: Message['role']) {
  if (role === 'assistant') {
    return {
      label: 'Sentinel',
      dot: 'var(--green)',
      color: 'var(--green)',
      align: 'flex-start' as const,
      bubble: {
        background: 'rgba(107,221,161,0.08)',
        border: '1px solid rgba(107,221,161,0.35)',
        borderLeft: '2px solid var(--green)',
      },
    };
  }
  if (role === 'human_agent') {
    return {
      label: 'Vos',
      dot: 'var(--blue-200)',
      color: 'var(--blue-200)',
      align: 'flex-end' as const,
      bubble: {
        background: 'rgba(24,93,232,0.18)',
        border: '1px solid rgba(24,93,232,0.42)',
        borderRight: '2px solid var(--blue-200)',
      },
    };
  }
  return {
    label: 'Lead',
    dot: 'var(--text-3)',
    color: 'var(--text-2)',
    align: 'flex-start' as const,
    bubble: {
      background: 'var(--ink-3)',
      border: '1px solid var(--line)',
    },
  };
}

export function MessageBubble({ message, isOptimistic }: MessageBubbleProps) {
  if (message.role === 'system') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <span className="scala-alt" style={{ color: 'var(--text-3)', border: '1px solid var(--line)', background: 'var(--ink-1)', padding: '5px 12px', fontSize: 9.5 }}>
          {message.content}
        </span>
      </div>
    );
  }

  const meta = roleMeta(message.role);
  const isRight = meta.align === 'flex-end';

  return (
    <div style={{ display: 'flex', justifyContent: meta.align, opacity: isOptimistic ? 0.55 : 1 }}>
      <div style={{ width: 'min(72%, 560px)', display: 'flex', flexDirection: 'column', alignItems: isRight ? 'flex-end' : 'flex-start', gap: 5 }}>
        <div className="scala-alt" style={{ display: 'flex', alignItems: 'center', gap: 6, color: meta.color, fontSize: 9.5, fontWeight: 800 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.dot }} />
          {meta.label}
        </div>
        <div style={{
          ...meta.bubble,
          padding: '10px 14px',
          color: 'var(--text)',
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {message.was_audio && (
            <span className="scala-alt" style={{ display: 'block', color: 'var(--text-3)', fontSize: 9, marginBottom: 5 }}>Audio transcripto</span>
          )}
          {message.role === 'assistant' ? renderMarkdown(message.content) : message.content}
        </div>
        <span className="scala-alt" style={{ color: 'var(--text-4)', fontSize: 9.5, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  );
}
