import type { SentinelState } from '@/lib/types';

export function IntentBar({ state }: { state: SentinelState }) {
  const fill = Math.max(8, Math.min(100, state.intentScore));
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 58, height: 4, borderRadius: 999, background: 'var(--ink-5)', position: 'relative', display: 'inline-block', overflow: 'hidden' }}>
        <span style={{
          position: 'absolute',
          inset: '0 auto 0 0',
          width: `${fill}%`,
          background: state.temperature === 'caliente' ? 'var(--green)' : state.temperature === 'tibio' ? 'var(--blue-300)' : 'var(--text-4)',
        }} />
      </span>
      <span style={{ color: state.temperature === 'caliente' ? 'var(--hot)' : state.temperature === 'tibio' ? 'var(--text-2)' : 'var(--text-3)', fontSize: 11, fontWeight: 650, textTransform: 'capitalize' }}>
        {state.temperature}
      </span>
    </span>
  );
}
