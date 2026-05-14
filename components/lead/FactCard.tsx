interface FactCardProps {
  label: string;
  value?: string;
  span?: 1 | 2;
}

export function FactCard({ label, value, span = 1 }: FactCardProps) {
  const missing = !value;
  return (
    <div style={{
      gridColumn: span === 2 ? 'span 2' : undefined,
      minHeight: 68,
      border: '1px solid var(--line)',
      borderRadius: 12,
      padding: '10px 11px',
      background: missing ? 'rgba(255,255,255,0.018)' : 'var(--ink-3)',
    }}>
      <div style={{ color: 'var(--text-4)', fontSize: 11, marginBottom: 7 }}>
        {label}
      </div>
      <div style={{ color: missing ? 'var(--text-4)' : 'var(--text)', fontSize: 13, fontWeight: missing ? 500 : 700, lineHeight: 1.35 }}>
        {value || 'Pendiente'}
      </div>
    </div>
  );
}
