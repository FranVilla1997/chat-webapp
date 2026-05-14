import type { Message } from '@/lib/types';

interface MessageBubbleProps {
  message: Message;
  isOptimistic?: boolean;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function renderMarkdown(text: string) {
  return text.split('\n').map((line, index) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const content = bullet ? bullet[1] : line;
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={index} style={{ display: 'block', paddingLeft: bullet ? 16 : 0, position: 'relative' }}>
        {bullet && <span style={{ position: 'absolute', left: 1, color: 'var(--green)' }}>•</span>}
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
        background: 'rgba(107,221,161,0.075)',
        border: '1px solid rgba(107,221,161,0.18)',
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
        background: 'rgba(24,93,232,0.16)',
        border: '1px solid rgba(84,142,226,0.22)',
      },
    };
  }
  return {
    label: 'Lead',
    dot: 'var(--text-4)',
    color: 'var(--text-3)',
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
      <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
        <span style={{ color: 'var(--text-3)', border: '1px solid var(--line)', background: 'var(--ink-2)', padding: '6px 12px', borderRadius: 999, fontSize: 11 }}>
          {message.content}
        </span>
      </div>
    );
  }

  const meta = roleMeta(message.role);
  const isRight = meta.align === 'flex-end';

  return (
    <div style={{ display: 'flex', justifyContent: meta.align, opacity: isOptimistic ? 0.58 : 1, margin: '2px 0' }}>
      <div style={{ width: 'min(76%, 620px)', display: 'flex', flexDirection: 'column', alignItems: isRight ? 'flex-end' : 'flex-start', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: meta.color, fontSize: 11, fontWeight: 700 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot }} />
          {meta.label}
        </div>
        <div style={{
          ...meta.bubble,
          borderRadius: isRight ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '12px 15px',
          color: 'var(--text)',
          fontSize: 14,
          lineHeight: 1.58,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxShadow: '0 10px 26px rgba(0,0,0,0.14)',
        }}>
          {message.was_audio && (
            <span style={{ display: 'block', color: 'var(--text-3)', fontSize: 11, marginBottom: 6 }}>Audio transcripto</span>
          )}
          {message.role === 'assistant' ? renderMarkdown(message.content) : message.content}
        </div>
        <span style={{ color: 'var(--text-4)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  );
}
