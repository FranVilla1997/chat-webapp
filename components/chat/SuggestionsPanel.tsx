import type { AiSuggestion } from '@/lib/types';

interface SuggestionsPanelProps {
  suggestions: AiSuggestion[];
  onPick: (text: string) => void;
  hidden?: boolean;
  onHide?: () => void;
}

export function SuggestionsPanel({ suggestions, onPick, hidden, onHide }: SuggestionsPanelProps) {
  if (hidden || suggestions.length === 0) return null;
  return (
    <section style={{ borderTop: '1px solid var(--line)', background: 'var(--ink-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 18px 6px' }}>
        <span className="scala-alt" style={{ color: 'var(--green)', fontSize: 10, fontWeight: 800 }}>
          ▲ Sentinel sugiere <span style={{ color: 'var(--text-3)' }}>· 3 respuestas para acelerar</span>
        </span>
        {onHide && (
          <button className="scala-alt" onClick={onHide} style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 9.5, cursor: 'pointer' }}>
            Ocultar
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gap: 6, padding: '0 18px 10px' }}>
        {suggestions.slice(0, 3).map((suggestion, index) => (
          <button
            key={suggestion.id}
            onClick={() => onPick(suggestion.text)}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr',
              alignItems: 'center',
              gap: 10,
              minHeight: 28,
              border: '1px solid var(--line)',
              background: 'var(--ink-2)',
              color: 'var(--text-2)',
              padding: '6px 10px',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span style={{ border: '1px solid var(--line-2)', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 10, textAlign: 'center', padding: '1px 0' }}>
              {index + 1}
            </span>
            <span style={{ fontSize: 12, lineHeight: 1.35 }}>{suggestion.text}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
