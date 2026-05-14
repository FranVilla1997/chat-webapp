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
  if (!first) return 'Primer contacto s/d';
  const minutes = Math.max(1, Math.round((Date.now() - new Date(first).getTime()) / 60000));
  if (minutes < 60) return `Primer contacto hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `Primer contacto hace ${hours} h`;
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

  return (
    <header style={{ minHeight: 74, borderBottom: '1px solid var(--line)', background: 'var(--ink-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {onBack && <button aria-label="Volver" onClick={onBack} className="scala-button" style={{ width: 32, padding: 0 }}>‹</button>}
        <button aria-label="Lead anterior" onClick={onPrev} className="scala-button" style={{ width: 28, padding: 0 }}>‹</button>
        <button aria-label="Lead siguiente" onClick={onNext} className="scala-button" style={{ width: 28, padding: 0 }}>›</button>
        <div style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', background: 'var(--ink-5)', border: '1px solid var(--line-2)', color: 'var(--text)', fontFamily: 'var(--display)', fontSize: 14 }}>
          {initial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <strong style={{ color: 'var(--text)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</strong>
            <span className="scala-alt" style={{ border: '1px solid var(--line-2)', color: 'var(--text-3)', padding: '2px 6px', fontSize: 8.5, fontWeight: 800 }}>Whatsapp</span>
          </div>
          <div className="scala-alt" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', marginTop: 5, color: 'var(--text-3)', fontSize: 9.5, fontWeight: 700 }}>
            <span>{formatPhone(leadPhone)}</span>
            {leadInfo?.sourceInstance && <span>Instancia <b style={{ color: 'var(--text)' }}>{leadInfo.sourceInstance}</b></span>}
            <span>{firstContact(messages)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {!active && realtimeStatus && (
          <span className="scala-alt" style={{ color: 'var(--warm)', fontSize: 9.5 }}>Reconectando...</span>
        )}
        <div className="scala-alt" style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid rgba(107,221,161,0.35)', background: 'rgba(107,221,161,0.08)', color: 'var(--green)', padding: '6px 10px', fontSize: 10, fontWeight: 800 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: sentinelState?.priority === 'stuck' ? 'var(--warm)' : 'var(--green)', boxShadow: '0 0 0 4px rgba(107,221,161,0.12)' }} />
          {sentinelState?.priority === 'stuck' ? 'Sentinel trabado' : 'Sentinel activo'}
        </div>
        {onTogglePanel && (
          <button aria-label={panelOpen ? 'Cerrar info del lead' : 'Abrir info del lead'} onClick={onTogglePanel} className="scala-button" style={{ width: 32, padding: 0 }}>
            {panelOpen ? '×' : 'i'}
          </button>
        )}
        <button aria-label="Más acciones" className="scala-button" style={{ width: 32, padding: 0 }}>...</button>
      </div>
    </header>
  );
}
