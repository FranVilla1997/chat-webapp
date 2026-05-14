import type { SentinelState } from '@/lib/types';

interface SentinelContextStripProps {
  state: SentinelState;
  onTakeControl?: () => void;
  onQuote?: () => void;
}

function confidenceColor(value: number) {
  if (value >= 70) return 'var(--green)';
  if (value >= 40) return 'var(--warm)';
  return 'var(--hot)';
}

export function SentinelContextStrip({ state, onTakeControl, onQuote }: SentinelContextStripProps) {
  const stuck = state.priority === 'stuck';
  const missing = state.missingFacts.length ? state.missingFacts.join(' · ') : 'nada';

  return (
    <div style={{
      minHeight: 42,
      borderBottom: '1px solid var(--line)',
      background: stuck
        ? 'linear-gradient(90deg, rgba(255,174,92,0.16), rgba(255,174,92,0.04))'
        : 'linear-gradient(90deg, rgba(107,221,161,0.12), rgba(107,221,161,0.025))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '8px 18px',
    }}>
      <div className="scala-alt" style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, fontSize: 10.5, fontWeight: 700 }}>
        <span style={{ color: stuck ? 'var(--warm)' : 'var(--green)', letterSpacing: '0.18em' }}>
          {stuck ? 'Sentinel necesita ayuda' : 'Sentinel'}
        </span>
        <span style={{ width: 1, height: 16, background: 'var(--line)' }} />
        <span style={{ color: 'var(--text-2)' }}>Objetivo <b style={{ color: 'var(--text)' }}>{state.currentGoal}</b></span>
        <span style={{ width: 1, height: 16, background: 'var(--line)' }} />
        <span style={{ color: 'var(--text-2)' }}>Falta <b style={{ color: state.missingFacts.length ? 'var(--warm)' : 'var(--green)' }}>{missing}</b></span>
        <span style={{ width: 1, height: 16, background: 'var(--line)' }} />
        <span style={{ color: 'var(--text-2)' }}>Confianza <b style={{ color: confidenceColor(state.confidence) }}>{state.confidence}%</b></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button className="scala-button" onClick={onTakeControl}>Tomar control</button>
        <button className="scala-button scala-button-primary" onClick={onQuote}>Presupuestar</button>
      </div>
    </div>
  );
}
