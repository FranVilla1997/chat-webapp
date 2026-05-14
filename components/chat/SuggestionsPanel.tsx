import type { AiSuggestion } from '@/lib/types';

interface SuggestionsPanelProps {
  suggestions: AiSuggestion[];
  onPick: (text: string) => void;
  hidden?: boolean;
  onHide?: () => void;
}

export function SuggestionsPanel({ suggestions, onPick, hidden, onHide }: SuggestionsPanelProps) {
  if (hidden || suggestions.length === 0) return null;
  const primary = suggestions[0];

  return (
    <section style={{ borderTop: '1px solid var(--line)', background: 'var(--ink-1)', padding: '12px 18px' }}>
      <div style={{
        border: '1px solid rgba(96,165,250,0.16)',
        background: 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(255,255,255,0.025))',
        borderRadius: 'var(--radius-lg)',
        padding: 14,
        display: 'grid',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ color: 'var(--blue-200)', fontSize: 11, fontWeight: 750, marginBottom: 4 }}>Sugerencia IA</div>
            <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.45 }}>{primary.text}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="scala-button scala-button-primary" onClick={() => onPick(primary.text)}>Usar sugerencia</button>
            <button className="scala-button" onClick={() => onPick(primary.text)}>Editar</button>
            {onHide && <button className="scala-button" onClick={onHide}>Ocultar</button>}
          </div>
        </div>
        {suggestions.length > 1 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {suggestions.slice(1, 3).map((suggestion, index) => (
              <button
                key={suggestion.id}
                onClick={() => onPick(suggestion.text)}
                style={{
                  flex: 1,
                  minWidth: 210,
                  border: '1px solid var(--line)',
                  background: 'rgba(255,255,255,0.025)',
                  color: 'var(--text-2)',
                  borderRadius: 12,
                  padding: '9px 10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: 1.35,
                }}
              >
                <span style={{ color: 'var(--text-4)', marginRight: 6 }}>{index + 2}.</span>
                {suggestion.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
