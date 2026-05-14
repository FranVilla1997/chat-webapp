interface StairsAccentProps {
  color?: string;
  align?: 'left' | 'right';
}

export function StairsAccent({ color = 'var(--green)', align = 'right' }: StairsAccentProps) {
  const widths = [56, 40, 24];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      {widths.map((width) => (
        <span key={width} style={{ display: 'block', width, height: 6, background: color }} />
      ))}
    </div>
  );
}
