export function TimelineItem({ color, time, children }: { color: string; time: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '12px 1fr', gap: 8 }}>
      <span style={{ width: 6, height: 6, background: color, marginTop: 5 }} />
      <div>
        <div className="scala-alt" style={{ color: 'var(--text-3)', fontSize: 9 }}>{time}</div>
        <div style={{ color: 'var(--text-2)', fontSize: 11, lineHeight: 1.4 }}>{children}</div>
      </div>
    </div>
  );
}
