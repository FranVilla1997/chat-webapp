interface EyebrowProps {
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function Eyebrow({ children, action }: EyebrowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span className="scala-alt" style={{ color: 'var(--text-3)', fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
        — {children}
      </span>
      <span style={{ height: 1, flex: 1, background: 'var(--line)' }} />
      {action}
    </div>
  );
}
