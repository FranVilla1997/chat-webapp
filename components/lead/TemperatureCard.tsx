import type { SentinelState } from '@/lib/types';

export function TemperatureCard({ score, state }: { score?: string; state: SentinelState }) {
  const value = Number(score ?? state.intentScore) || state.intentScore;
  const angle = Math.min(100, Math.max(0, value)) * 3.6;
  const tone = state.temperature === 'caliente' ? 'var(--hot)' : state.temperature === 'tibio' ? 'var(--warm)' : 'var(--green)';
  const trend = value >= 45 ? 'en aumento' : 'estable';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: `conic-gradient(${tone} 0deg, ${tone} ${angle}deg, var(--ink-4) ${angle}deg)`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--ink-2)', display: 'grid', placeItems: 'center', color: 'var(--text)', fontFamily: 'var(--display)', fontSize: 17 }}>
          {value}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: tone, fontSize: 14, fontWeight: 750, textTransform: 'capitalize' }}>
          {state.temperature} · {trend}
        </div>
        <p style={{ color: 'var(--text-3)', margin: '4px 0 0', fontSize: 12 }}>Confianza IA {state.confidence}%</p>
      </div>
    </div>
  );
}
