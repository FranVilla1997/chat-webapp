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
      minHeight: 62,
      border: '1px solid var(--line)',
      padding: '9px 10px',
      background: missing
        ? 'repeating-linear-gradient(135deg, var(--ink-2), var(--ink-2) 7px, var(--ink-3) 7px, var(--ink-3) 14px)'
        : 'var(--ink-2)',
    }}>
      <div className="scala-alt" style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 800, marginBottom: 7 }}>
        {label}
      </div>
      <div style={{ color: missing ? 'var(--text-4)' : 'var(--text)', fontSize: 12.5, fontWeight: missing ? 400 : 700, fontStyle: missing ? 'italic' : 'normal', lineHeight: 1.35 }}>
        {value || 'por consultar'}
      </div>
    </div>
  );
}
