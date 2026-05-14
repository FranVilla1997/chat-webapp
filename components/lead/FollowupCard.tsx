import type { Followup } from '@/hooks/useFollowups';

function formatDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString('es-AR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

export function FollowupCard({ followup }: { followup: Followup }) {
  return (
    <div style={{ border: '1px solid rgba(255,174,92,0.24)', background: 'rgba(255,174,92,0.08)', borderRadius: 'var(--radius-md)', padding: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <strong style={{ color: 'var(--warm)', fontSize: 13 }}>Follow-up #{followup.attempt_number}</strong>
        <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{formatDate(followup.scheduled_at)}</span>
      </div>
      <p style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>{followup.instructions}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <button className="scala-button">Reprogramar</button>
        <button className="scala-button scala-button-warm">Ejecutar ahora</button>
      </div>
    </div>
  );
}
