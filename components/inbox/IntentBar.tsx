import type { SentinelState } from '@/lib/types';

export function IntentBar({ state }: { state: SentinelState }) {
  const fill = Math.max(8, Math.min(100, state.intentScore));
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 60, height: 3, background: 'var(--ink-5)', position: 'relative', display: 'inline-block' }}>
        <span style={{
          position: 'absolute',
          inset: '0 auto 0 0',
          width: `${fill}%`,
          background: 'linear-gradient(90deg, var(--green), var(--warm), var(--hot))',
        }} />
      </span>
      <span className="scala-alt" style={{ color: state.temperature === 'caliente' ? 'var(--hot)' : state.temperature === 'tibio' ? 'var(--text-2)' : 'var(--text-3)', fontSize: 9, fontWeight: 700 }}>
        {state.temperature}
      </span>
    </span>
  );
}
