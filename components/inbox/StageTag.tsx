const STAGE: Record<string, { label: string; color: string; bg: string }> = {
  nuevo: { label: 'Nuevo', color: 'var(--blue-200)', bg: 'rgba(37,99,235,0.16)' },
  en_calificacion: { label: 'Calificando', color: 'var(--text-2)', bg: 'rgba(255,255,255,0.055)' },
  calificado: { label: 'Calificado', color: 'var(--blue-200)', bg: 'rgba(37,99,235,0.2)' },
  propuesta_enviada: { label: 'Propuesta', color: 'var(--warm)', bg: 'rgba(245,158,11,0.14)' },
  cerrado_ganado: { label: 'Ganado', color: 'var(--green)', bg: 'rgba(53,229,138,0.14)' },
  cerrado_perdido: { label: 'Perdido', color: 'var(--hot)', bg: 'rgba(239,68,68,0.14)' },
  no_responde: { label: 'No responde', color: 'var(--text-3)', bg: 'var(--ink-5)' },
};

export function stageLabel(stage?: string) {
  return STAGE[stage ?? '']?.label ?? (stage ? stage.replace(/_/g, ' ') : 'Nuevo');
}

export function StageTag({ stage }: { stage?: string }) {
  const config = STAGE[stage ?? ''] ?? STAGE.nuevo;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 16,
      padding: '3px 8px',
      background: config.bg,
      color: config.color,
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
    }}>
      {config.label}
    </span>
  );
}
