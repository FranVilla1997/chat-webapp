const STAGE: Record<string, { label: string; color: string; bg: string }> = {
  nuevo: { label: 'Nuevo', color: 'var(--blue-200)', bg: 'rgba(24,93,232,0.18)' },
  en_calificacion: { label: 'Calificando', color: 'var(--green)', bg: 'rgba(107,221,161,0.14)' },
  calificado: { label: 'Calificado', color: 'var(--blue-200)', bg: 'rgba(24,93,232,0.22)' },
  propuesta_enviada: { label: 'Propuesta', color: 'var(--warm)', bg: 'rgba(255,174,92,0.16)' },
  cerrado_ganado: { label: 'Ganado', color: 'var(--green)', bg: 'rgba(107,221,161,0.16)' },
  cerrado_perdido: { label: 'Perdido', color: 'var(--hot)', bg: 'rgba(255,107,107,0.14)' },
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
