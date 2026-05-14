import type { SentinelState } from '@/lib/types';

export function TemperatureCard({ score, state }: { score?: string; state: SentinelState }) {
  const value = Number(score ?? state.intentScore) || state.intentScore;
  const angle = Math.min(100, Math.max(0, value)) * 3.6;
  const tone = state.temperature === 'caliente' ? 'var(--hot)' : state.temperature === 'tibio' ? 'var(--warm)' : 'var(--green)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: `conic-gradient(${tone} 0deg, var(--green) ${angle}deg, var(--ink-4) ${angle}deg)`, display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--ink-1)', display: 'grid', placeItems: 'center', color: 'var(--text)', fontFamily: 'var(--display)', fontSize: 17 }}>
          {value}
        </div>
      </div>
      <div>
        <div className="scala-alt" style={{ color: tone, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em' }}>
          {state.temperature} · en aumento
        </div>
        <p style={{ color: 'var(--text-3)', margin: '4px 0 0', fontSize: 11 }}>Pidió ver catálogo · 0 objeciones</p>
      </div>
      <span className="scala-alt" style={{ marginLeft: 'auto', background: 'rgba(107,221,161,0.12)', color: 'var(--green)', padding: '3px 7px', fontSize: 9, fontWeight: 800 }}>
        IA · {state.confidence}%
      </span>
    </div>
  );
}
