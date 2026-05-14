import Image from 'next/image';
import type { Message, LeadInfo } from '@/lib/types';

interface ChatHeaderProps {
  leadPhone: string;
  leadInfo?: LeadInfo;
  messages: Message[];
  realtimeStatus?: string;
  panelOpen?: boolean;
  onTogglePanel?: () => void;
  onBack?: () => void;
}

function detectStatus(messages: Message[]): 'bot' | 'human' | 'paused' {
  if (!messages.length) return 'bot';
  const last = [...messages].reverse().find((m) => m.role !== 'system');
  if (!last) return 'bot';
  if (last.role === 'human_agent') return 'human';
  if (last.role === 'assistant') return 'bot';
  return 'paused';
}

function formatPhone(p: string) {
  if (p.startsWith('549') && p.length >= 12)
    return `+54 9 ${p.slice(3, 5)} ${p.slice(5, 9)}-${p.slice(9)}`;
  return `+${p}`;
}

const statusConfig = {
  bot:    { label: 'Sentinel activo',  dot: '#185de8', ring: 'rgba(24,93,232,0.3)' },
  human:  { label: 'Vendedor activo', dot: '#6bdda1', ring: 'rgba(107,221,161,0.3)' },
  paused: { label: 'Pausado',         dot: '#5a5a72', ring: 'rgba(90,90,114,0.3)' },
};
const monoFont = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export function ChatHeader({ leadPhone, leadInfo, messages, realtimeStatus, panelOpen, onTogglePanel, onBack }: ChatHeaderProps) {
  const status = detectStatus(messages);
  const { label, dot, ring } = statusConfig[status];
  const isConnected = realtimeStatus === 'SUBSCRIBED';
  const displayName = leadInfo?.name;

  return (
    <header style={{
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(6,6,12,0.98)',
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
      gap: 12,
    }}>
      {/* Left: back button + logo + lead info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        {onBack && (
          <button
            onClick={onBack}
            title="Volver a chats"
            style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <Image
          src="/logo/scala-logo.svg"
          alt="SCALA"
          width={72}
          height={9}
          priority
          style={{ filter: 'brightness(0) invert(1)', opacity: 0.85, flexShrink: 0 }}
        />

        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.09)', flexShrink: 0 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {displayName ? (
            <>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#f0f0f5', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.02em' }}>
                {formatPhone(leadPhone)}
              </span>
              {leadInfo?.sourceInstance && (
                <span style={{
                  fontSize: 10,
                  color: '#6bdda1',
                  fontFamily: monoFont,
                  letterSpacing: '0.03em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  Instancia: {leadInfo.sourceInstance}
                </span>
              )}
            </>
          ) : (
            <>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
                Lead
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#f0f0f5', letterSpacing: '0.02em', lineHeight: 1 }}>
                {formatPhone(leadPhone)}
              </span>
              {leadInfo?.sourceInstance && (
                <span style={{
                  fontSize: 10,
                  color: '#6bdda1',
                  fontFamily: monoFont,
                  letterSpacing: '0.03em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  Instancia: {leadInfo.sourceInstance}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: realtime + status + panel toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {!isConnected && realtimeStatus && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', animation: 'headerPulse 2s infinite' }} />
            sincronizando
          </span>
        )}

        {/* Status badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 12px', borderRadius: 24,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 8, height: 8 }}>
            <span style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: ring, animation: 'headerPing 2s cubic-bezier(0,0,0.2,1) infinite' }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap' }}>
            {label}
          </span>
        </div>

        {/* Panel toggle button */}
        {onTogglePanel && (
          <button
            onClick={onTogglePanel}
            title={panelOpen ? 'Cerrar panel' : 'Ver info del lead'}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: `1px solid ${panelOpen ? 'rgba(24,93,232,0.4)' : 'rgba(255,255,255,0.08)'}`,
              background: panelOpen ? 'rgba(24,93,232,0.12)' : 'rgba(255,255,255,0.04)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: panelOpen ? '#3b7ef5' : 'rgba(255,255,255,0.4)',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
              <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/>
            </svg>
          </button>
        )}
      </div>

      <style>{`
        @keyframes headerPing  { 75%,100%{ transform:scale(2); opacity:0 } }
        @keyframes headerPulse { 0%,100%{ opacity:1 } 50%{ opacity:.3 } }
      `}</style>
    </header>
  );
}
