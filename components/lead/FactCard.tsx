import type { ReactNode } from 'react';

interface FactCardProps {
  label: string;
  value?: ReactNode;
  span?: 1 | 2;
}

export function FactCard({ label, value, span = 1 }: FactCardProps) {
  const missing = !value;

  return (
    <div style={{
      gridColumn: span === 2 ? 'span 2' : undefined,
      minHeight: 68,
      border: '1px solid var(--line)',
      borderRadius: 14,
      padding: '10px 11px',
      background: missing ? 'rgba(255,255,255,0.018)' : 'var(--ink-4)',
    }}>
      <div style={{ color: 'var(--text-4)', fontSize: 11, marginBottom: 7 }}>
        {label}
      </div>
      {missing ? (
        <span style={{ display: 'inline-flex', width: 'fit-content', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 8px', color: 'var(--text-3)', fontSize: 12 }}>
          Pendiente
        </span>
      ) : (
        <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 680, lineHeight: 1.42 }}>
          {value}
        </div>
      )}
    </div>
  );
}
