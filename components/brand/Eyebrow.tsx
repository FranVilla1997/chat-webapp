interface EyebrowProps {
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function Eyebrow({ children, action }: EyebrowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
      <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {children}
      </span>
      {action}
    </div>
  );
}
