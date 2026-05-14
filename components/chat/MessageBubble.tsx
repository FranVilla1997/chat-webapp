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
        {bullet && <span style={{ position: 'absolute', left: 1, color: 'var(--blue-200)' }}>•</span>}
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
      color: 'var(--green-300)',
      align: 'flex-end' as const,
      bubble: {
        background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(16,26,53,0.94))',
        border: '1px solid rgba(96,165,250,0.18)',
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
        background: 'linear-gradient(135deg, rgba(37,99,235,0.24), rgba(16,26,53,0.96))',
        border: '1px solid rgba(96,165,250,0.22)',
      },
    };
  }

  return {
    label: 'Lead',
    dot: 'var(--text-4)',
    color: 'var(--text-3)',
    align: 'flex-start' as const,
    bubble: {
      background: 'var(--ink-4)',
      border: '1px solid var(--line)',
    },
  };
}

export function MessageBubble({ message, isOptimistic }: MessageBubbleProps) {
  if (message.role === 'system') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
        <span style={{ color: 'var(--text-3)', border: '1px solid var(--line)', background: 'rgba(255,255,255,0.025)', padding: '6px 12px', borderRadius: 999, fontSize: 11 }}>
          {message.content}
        </span>
      </div>
    );
  }

  const meta = roleMeta(message.role);
  const isRight = meta.align === 'flex-end';

  return (
    <div style={{ display: 'flex', justifyContent: meta.align, opacity: isOptimistic ? 0.58 : 1, margin: '4px 0' }}>
      <div style={{ width: 'min(78%, 640px)', display: 'flex', flexDirection: 'column', alignItems: isRight ? 'flex-end' : 'flex-start', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: meta.color, fontSize: 11, fontWeight: 700 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot }} />
          {meta.label}
        </div>
        <div style={{
          ...meta.bubble,
          borderRadius: isRight ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
          padding: '13px 16px',
          color: 'var(--text)',
          fontSize: 14,
          lineHeight: 1.62,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxShadow: '0 12px 30px rgba(0,0,0,0.16)',
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
