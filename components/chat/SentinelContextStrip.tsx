import type { SentinelState } from '@/lib/types';

interface SentinelContextStripProps {
  state: SentinelState;
  onTakeControl?: () => void;
  onQuote?: () => void;
}

function sentenceGoal(goal: string) {
  const map: Record<string, string> = {
    saludar: 'Saludar y abrir conversación',
    calificar: 'Calificar el interés',
    catalogo: 'Explicar catálogo',
    medidas: 'Pedir medidas',
    presupuesto: 'Preparar presupuesto',
    seguimiento: 'Hacer seguimiento',
  };
  return map[goal] ?? goal;
}

export function SentinelContextStrip({ state, onTakeControl, onQuote }: SentinelContextStripProps) {
  const stuck = state.priority === 'stuck';
  const missing = state.missingFacts.length ? state.missingFacts.join(' · ') : 'No faltan datos críticos';
  const nextAction = stuck
    ? 'El Sentinel no logró avanzar. Conviene tomar control.'
    : state.currentGoal === 'presupuesto'
      ? 'El lead está listo para recibir una propuesta.'
      : `Próximo paso: ${state.nextAction ?? 'seguir calificando'}.`;

  return (
    <section style={{
      borderBottom: '1px solid var(--line)',
      background: 'linear-gradient(90deg, rgba(37,99,235,0.08), rgba(8,11,20,0.96) 58%)',
      padding: '14px 22px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 18,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: stuck ? 'var(--warm)' : 'var(--green)' }} />
          <span style={{ color: 'var(--text)', fontWeight: 720, fontSize: 14 }}>
            Próxima mejor acción
          </span>
          <span style={{ color: 'var(--text-4)', fontSize: 12 }}>Sentinel · confianza {state.confidence}%</span>
        </div>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13, lineHeight: 1.45 }}>
          {nextAction} <span style={{ color: state.missingFacts.length ? 'var(--warm)' : 'var(--green)' }}>Falta: {missing}</span>
          <span style={{ color: 'var(--text-4)' }}> · Objetivo: {sentenceGoal(state.currentGoal)}</span>
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button className="scala-button" onClick={onTakeControl}>Tomar control</button>
        <button className="scala-button scala-button-primary" onClick={onQuote}>Presupuestar</button>
      </div>
    </section>
  );
}
