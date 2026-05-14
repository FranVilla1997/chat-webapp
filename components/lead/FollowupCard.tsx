import type { Followup } from '@/hooks/useFollowups';

function formatDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString('es-AR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

export function FollowupCard({ followup }: { followup: Followup }) {
  return (
    <div style={{ border: '1px solid rgba(255,174,92,0.45)', borderLeft: '2px solid var(--warm)', background: 'linear-gradient(90deg, rgba(255,174,92,0.12), rgba(255,174,92,0.04))', padding: 12 }}>
      <div className="scala-alt" style={{ color: 'var(--warm)', fontSize: 10, fontWeight: 800, marginBottom: 8 }}>
        Seguimiento #{followup.attempt_number}
      </div>
      <div className="scala-alt" style={{ color: 'var(--text-2)', fontSize: 9.5, marginBottom: 8 }}>
        Hoy {formatDate(followup.scheduled_at)}
      </div>
      <p style={{ color: 'var(--text)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{followup.instructions}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12 }}>
        <button className="scala-button">Reprogramar</button>
        <button className="scala-button scala-button-warm">Hacer ahora</button>
      </div>
    </div>
  );
}
