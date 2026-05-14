import { StageTag, stageLabel } from '@/components/inbox/StageTag';
import type { Message, LeadInfo, SentinelState } from '@/lib/types';

interface ChatHeaderProps {
  leadPhone: string;
  leadInfo?: LeadInfo;
  messages: Message[];
  sentinelState?: SentinelState;
  realtimeStatus?: string;
  panelOpen?: boolean;
  onTogglePanel?: () => void;
  onBack?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

function formatPhone(p: string) {
  if (p.startsWith('549') && p.length >= 12) return `+54 9 ${p.slice(3, 5)} ${p.slice(5, 9)}-${p.slice(9)}`;
  return `+${p}`;
}

function firstContact(messages: Message[]) {
  const first = messages[0]?.created_at;
  if (!first) return 'Primer contacto sin datos';
  const minutes = Math.max(1, Math.round((Date.now() - new Date(first).getTime()) / 60000));
  if (minutes < 60) return `Primer contacto hace ${minutes} min`;
  return `Primer contacto hace ${Math.round(minutes / 60)} h`;
}

function temperatureLabel(state?: SentinelState) {
  if (!state) return 'Temperatura sin datos';
  const suffix = state.intentScore >= 45 ? 'en aumento' : 'estable';
  return `${state.temperature} ${suffix} · ${state.confidence}%`;
}

export function ChatHeader({
  leadPhone,
  leadInfo,
  messages,
  sentinelState,
  realtimeStatus,
  panelOpen,
  onTogglePanel,
  onBack,
  onPrev,
  onNext,
}: ChatHeaderProps) {
  const displayName = leadInfo?.name ?? 'Lead sin nombre';
  const initial = displayName.charAt(0).toUpperCase();
  const active = realtimeStatus === 'SUBSCRIBED';
  const missing = sentinelState?.missingFacts.length ? sentinelState.missingFacts.join(' · ') : 'Nada crítico';

  return (
    <header style={{
      borderBottom: '1px solid var(--line)',
      background: 'linear-gradient(180deg, #11161d 0%, var(--ink-2) 100%)',
      padding: '18px 22px',
      display: 'grid',
      gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {onBack && <button aria-label="Volver" onClick={onBack} className="scala-button" style={{ width: 36, padding: 0 }}>‹</button>}
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            background: 'linear-gradient(135deg, #222a36, #171d26)',
            border: '1px solid var(--line-2)',
            color: 'var(--text)',
            fontFamily: 'var(--display)',
            fontSize: 17,
            flexShrink: 0,
          }}>
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 18, fontWeight: 750, letterSpacing: '-0.01em' }}>
                {displayName}
              </h2>
              <span style={{ border: '1px solid var(--line-2)', borderRadius: 999, color: 'var(--text-3)', padding: '4px 8px', fontSize: 11 }}>
                WhatsApp
              </span>
              {leadInfo?.stage && <StageTag stage={leadInfo.stage} />}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 6, color: 'var(--text-3)', fontSize: 12 }}>
              <span>{formatPhone(leadPhone)}</span>
              {leadInfo?.sourceInstance && <span>{leadInfo.sourceInstance}</span>}
              <span>{firstContact(messages)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {!active && realtimeStatus && (
            <span style={{ color: 'var(--warm)', fontSize: 12 }}>Reconectando...</span>
          )}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid rgba(107,221,161,0.24)',
            background: 'rgba(107,221,161,0.08)',
            color: 'var(--text)',
            borderRadius: 999,
            padding: '8px 11px',
            fontSize: 12,
            fontWeight: 650,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: sentinelState?.priority === 'stuck' ? 'var(--warm)' : 'var(--green)' }} />
            {sentinelState?.priority === 'stuck' ? 'Sentinel requiere atención' : 'Sentinel activo'}
          </div>
          <button aria-label="Lead anterior" onClick={onPrev} className="scala-button" style={{ width: 36, padding: 0 }}>‹</button>
          <button aria-label="Lead siguiente" onClick={onNext} className="scala-button" style={{ width: 36, padding: 0 }}>›</button>
          {onTogglePanel && (
            <button aria-label={panelOpen ? 'Cerrar info del lead' : 'Abrir info del lead'} onClick={onTogglePanel} className="scala-button" style={{ width: 36, padding: 0 }}>
              {panelOpen ? '×' : 'i'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <HeaderMetric label="Intención" value={sentinelState?.currentGoal ?? 'Calificar'} />
        <HeaderMetric label="Falta para avanzar" value={missing} warm={Boolean(sentinelState?.missingFacts.length)} />
        <HeaderMetric label="Temperatura" value={temperatureLabel(sentinelState)} />
        <HeaderMetric label="Etapa actual" value={leadInfo?.stage ? stageLabel(leadInfo.stage) : 'Nuevo'} />
      </div>
    </header>
  );
}

function HeaderMetric({ label, value, warm }: { label: string; value: string; warm?: boolean }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ color: 'var(--text-4)', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ color: warm ? 'var(--warm)' : 'var(--text)', fontSize: 13, fontWeight: 680, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
    </div>
  );
}
