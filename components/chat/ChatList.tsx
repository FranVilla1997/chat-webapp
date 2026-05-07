'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { ChatContainer } from './ChatContainer';
import { buildLeadInfoFromAirtable } from '@/lib/utils';
import type { AirtableLead } from '@/lib/types';
import type { LastMessage } from '@/app/chats/page';

interface ChatListProps {
  initialLeads: AirtableLead[];
  sellerName: string | null;
  clientId: string;
  lastMessages: Record<string, LastMessage>;
}

/* ── Etapas del embudo ── */
const FUNNEL: { key: string; label: string; dot: string; glow: string }[] = [
  { key: 'all',             label: 'Todos',        dot: 'rgba(255,255,255,0.3)', glow: 'transparent' },
  { key: 'calificado',      label: 'Calificado',   dot: '#6bdda1',              glow: 'rgba(107,221,161,0.35)' },
  { key: 'en_calificacion', label: 'Calificando',  dot: '#3b7ef5',              glow: 'rgba(59,126,245,0.3)' },
  { key: 'nuevo',           label: 'Nuevo',        dot: 'rgba(255,255,255,0.3)', glow: 'transparent' },
  { key: 'en_proceso',      label: 'En proceso',   dot: '#f59e0b',              glow: 'rgba(245,158,11,0.3)' },
  { key: 'cerrado',         label: 'Cerrado',      dot: '#6bdda1',              glow: 'transparent' },
  { key: 'perdido',         label: 'Perdido',      dot: '#f87171',              glow: 'transparent' },
];

const STAGE_BADGE: Record<string, { bg: string; color: string }> = {
  calificado:       { bg: 'rgba(107,221,161,0.12)', color: '#6bdda1' },
  en_calificacion:  { bg: 'rgba(59,126,245,0.12)',  color: '#3b7ef5' },
  nuevo:            { bg: 'rgba(255,255,255,0.06)',  color: 'rgba(255,255,255,0.4)' },
  en_proceso:       { bg: 'rgba(245,158,11,0.1)',    color: '#f59e0b' },
  cerrado:          { bg: 'rgba(107,221,161,0.08)',  color: '#6bdda1' },
  perdido:          { bg: 'rgba(248,113,113,0.1)',   color: '#f87171' },
};

function formatTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600000 * 24 && d.getDate() === now.getDate())
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 3600000 * 48) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export function ChatList({ initialLeads, sellerName, clientId, lastMessages }: ChatListProps) {
  const router = useRouter();
  const [leads, setLeads] = useState<AirtableLead[]>(initialLeads);
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(new Set());
  const [activeStage, setActiveStage] = useState('all');
  const [selectedLead, setSelectedLead] = useState<AirtableLead | null>(null);
  const [seenAt, setSeenAt] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('scala_seen_leads') ?? '{}');
      setSeenAt(stored);
    } catch { /* empty */ }
  }, []);
  const [search, setSearch] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  // Realtime: suscribir a cualquier INSERT en lead_notifications
  useEffect(() => {
    const channel = supabase
      .channel('lead-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lead_notifications',
        },
        async (payload) => {
          // Ignorar notificaciones de otros clientes si tenemos clientId
          const notifClientId = (payload.new as { client_id?: string }).client_id;
          if (clientId && notifClientId && notifClientId !== clientId) return;

          const res = await fetch('/api/leads');
          if (!res.ok) return;
          const { leads: fresh } = await res.json() as { leads: AirtableLead[] };

          const currentIds = new Set(leadsRef.current.map(l => l.RecordID));
          const added = fresh.filter(l => !currentIds.has(l.RecordID)).map(l => l.RecordID);

          setLeads(fresh);
          if (added.length > 0) {
            setNewLeadIds(new Set(added));
            setTimeout(() => setNewLeadIds(new Set()), 5000);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: leads.length };
    for (const l of leads) m[l.current_stage] = (m[l.current_stage] ?? 0) + 1;
    return m;
  }, [leads]);

  const calificadosCount = counts['calificado'] ?? 0;

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const matchStage = activeStage === 'all' || l.current_stage === activeStage;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        l.whatsapp_display_name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.name.toLowerCase().includes(q);
      return matchStage && matchSearch;
    });
  }, [leads, activeStage, search]);

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', height: '100svh', overflow: 'hidden' }}>

      {/* ══ PANEL 1: Embudo ══ */}
      <aside style={{
        width: 200,
        flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(6,6,12,0.98)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 24,
      }}>
        {/* Logo */}
        <div style={{ padding: '0 18px 20px' }}>
          <Image src="/logo/scala-logo.svg" alt="SCALA" width={66} height={8} priority
            style={{ filter: 'brightness(0) invert(1)', opacity: 0.8 }} />
        </div>

        {/* Seller chip */}
        {sellerName && (
          <div style={{ padding: '0 14px 18px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 11px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(24,93,232,0.2)', border: '1px solid rgba(24,93,232,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#3b7ef5',
              }}>
                {sellerName.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#f0f0f5', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sellerName}
                </p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0 }}>Vendedor</p>
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 14px 14px' }} />

        {/* Calificados destacados */}
        {calificadosCount > 0 && (
          <button
            onClick={() => setActiveStage('calificado')}
            style={{
              margin: '0 14px 14px',
              padding: '10px 14px',
              borderRadius: 11,
              border: '1px solid rgba(107,221,161,0.3)',
              background: activeStage === 'calificado' ? 'rgba(107,221,161,0.12)' : 'rgba(107,221,161,0.06)',
              cursor: 'pointer',
              textAlign: 'left',
              animation: activeStage !== 'calificado' ? 'calPulse 2.5s ease-in-out infinite' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6bdda1' }}>Calificados</span>
              <span style={{
                fontSize: 12, fontWeight: 800, color: '#06060e',
                background: '#6bdda1', borderRadius: 20, padding: '1px 8px',
              }}>{calificadosCount}</span>
            </div>
            <p style={{ fontSize: 10, color: 'rgba(107,221,161,0.6)', margin: '3px 0 0' }}>
              Listos para presupuesto
            </p>
          </button>
        )}

        {/* Filtros del embudo */}
        <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 18px', marginBottom: 6 }}>
          Etapas
        </p>
        <nav style={{ flex: 1, overflowY: 'auto' }}>
          {FUNNEL.filter(s => s.key === 'all' || (counts[s.key] ?? 0) > 0).map((s) => {
            const isActive = activeStage === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setActiveStage(s.key)}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 18px',
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: 'none',
                  borderLeft: `2px solid ${isActive ? s.dot : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: s.dot, flexShrink: 0,
                  boxShadow: isActive ? `0 0 6px ${s.glow}` : 'none',
                }} />
                <span style={{ fontSize: 13, color: isActive ? '#f0f0f5' : 'rgba(255,255,255,0.38)', fontWeight: isActive ? 600 : 400, flex: 1, textAlign: 'left' }}>
                  {s.label}
                </span>
                <span style={{ fontSize: 11, color: isActive ? s.dot : 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
                  {counts[s.key] ?? 0}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '14px 14px 20px' }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 12 }} />
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 11px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.03)',
              color: 'rgba(255,255,255,0.28)', fontSize: 12,
              cursor: loggingOut ? 'not-allowed' : 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ══ PANEL 2: Lista de chats ══ */}
      <div style={{
        width: 320,
        flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(8,8,16,0.7)',
      }}>
        {/* Search */}
        <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={2}
              style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              style={{
                width: '100%', boxSizing: 'border-box',
                paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.04)',
                color: '#f0f0f5', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', margin: '8px 0 0', letterSpacing: '0.04em' }}>
            {filtered.length} {filtered.length === 1 ? 'chat' : 'chats'}
          </p>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.18)' }}>Sin chats</p>
            </div>
          ) : filtered.map((lead) => {
            const isSelected = selectedLead?.RecordID === lead.RecordID;
            const isCalif = lead.current_stage === 'calificado';
            const isNew = newLeadIds.has(lead.RecordID);
            const badge = STAGE_BADGE[lead.current_stage] ?? STAGE_BADGE['nuevo'];
            const initial = (lead.whatsapp_display_name || lead.name || lead.phone).charAt(0).toUpperCase();
            const lastMsg = lastMessages[lead.RecordID];
            const seenTimestamp = seenAt[lead.RecordID];
            const leadWrote = lastMsg?.role === 'user' &&
              (!seenTimestamp || lastMsg.created_at > seenTimestamp);

            let msgPrefix = '';
            if (lastMsg?.role === 'human_agent') msgPrefix = 'Vos: ';
            else if (lastMsg?.role === 'assistant') msgPrefix = 'Bot: ';

            const msgPreview = lastMsg
              ? `${msgPrefix}${lastMsg.content}`
              : 'Sin mensajes aún';

            return (
              <button
                key={lead.RecordID}
                onClick={() => {
                  setSelectedLead(lead);
                  if (lastMsg) {
                    const updated = { ...seenAt, [lead.RecordID]: lastMsg.created_at };
                    setSeenAt(updated);
                    localStorage.setItem('scala_seen_leads', JSON.stringify(updated));
                  }
                }}
                style={{
                  width: '100%', display: 'flex', gap: 12, padding: '13px 14px',
                  background: isNew
                    ? 'rgba(107,221,161,0.06)'
                    : isSelected
                      ? 'rgba(24,93,232,0.1)'
                      : leadWrote ? 'rgba(245,158,11,0.04)' : 'transparent',
                  borderLeft: `2px solid ${isNew ? '#6bdda1' : isSelected ? '#185de8' : leadWrote ? '#f59e0b' : 'transparent'}`,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  transition: 'background 0.1s',
                  boxShadow: isNew ? 'inset 0 0 20px rgba(107,221,161,0.05)' : 'none',
                }}
                onMouseEnter={e => {
                  if (!isSelected && !isNew) (e.currentTarget as HTMLElement).style.background = leadWrote ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.03)';
                }}
                onMouseLeave={e => {
                  if (!isSelected && !isNew) (e.currentTarget as HTMLElement).style.background = leadWrote ? 'rgba(245,158,11,0.04)' : 'transparent';
                }}
              >
                {/* Avatar */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: isNew
                      ? 'rgba(107,221,161,0.18)'
                      : isCalif ? 'rgba(107,221,161,0.14)' : 'rgba(24,93,232,0.12)',
                    border: `1px solid ${isNew ? 'rgba(107,221,161,0.5)' : isCalif ? 'rgba(107,221,161,0.3)' : 'rgba(24,93,232,0.18)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700,
                    color: isNew ? '#6bdda1' : isCalif ? '#6bdda1' : '#3b7ef5',
                    boxShadow: isNew ? '0 0 12px rgba(107,221,161,0.3)' : isCalif ? '0 0 10px rgba(107,221,161,0.2)' : 'none',
                  }}>
                    {initial}
                  </div>
                  {leadWrote && !isNew && (
                    <span style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 11, height: 11, borderRadius: '50%',
                      background: '#f59e0b',
                      border: '2px solid #080810',
                      animation: 'leadAlert 1.8s ease-in-out infinite',
                    }} />
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: isCalif || isNew ? 700 : 600, color: isNew ? '#e8f9f2' : isCalif ? '#e8f9f2' : '#f0f0f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                      {lead.whatsapp_display_name || lead.name || lead.phone}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 4 }}>
                      {isNew && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, color: '#06060e',
                          background: '#6bdda1', borderRadius: 20, padding: '1px 6px',
                          letterSpacing: '0.03em', textTransform: 'uppercase',
                          animation: 'newLeadPulse 1.5s ease-in-out infinite',
                        }}>
                          nuevo
                        </span>
                      )}
                      {!isNew && leadWrote && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          nuevo
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>
                        {formatTime(lead.last_message_at)}
                      </span>
                    </div>
                  </div>
                  <p style={{
                    fontSize: 11, margin: '0 0 5px',
                    color: isNew ? 'rgba(107,221,161,0.7)' : leadWrote ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)',
                    fontWeight: isNew || leadWrote ? 500 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {isNew ? 'Lead nuevo ingresado' : msgPreview}
                  </p>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: badge.bg, color: badge.color }}>
                      {lead.current_stage === 'en_calificacion' ? 'Calificando' : lead.current_stage.replace('_', ' ')}
                    </span>
                    {lead.score && (
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}>
                        {lead.score}pts
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ PANEL 3: Chat abierto ══ */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {selectedLead ? (
          <ChatContainer
            key={selectedLead.RecordID}
            leadPhone={selectedLead.phone}
            leadId={selectedLead.RecordID}
            clientId={selectedLead.client_record_id}
            instance={selectedLead.source_instance}
            leadInfo={buildLeadInfoFromAirtable(selectedLead)}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: 0.4 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', margin: 0 }}>
              Seleccioná un chat para abrir la conversación
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes calPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(107,221,161,0); }
          50%       { box-shadow: 0 0 0 4px rgba(107,221,161,0.2); }
        }
        @keyframes leadAlert {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
          50%       { box-shadow: 0 0 0 3px rgba(245,158,11,0.35); }
        }
        @keyframes newLeadPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
        }
        input::placeholder { color: rgba(255,255,255,0.18); }
        input:focus { border-color: rgba(107,221,161,0.3) !important; }
        nav::-webkit-scrollbar { width: 3px; }
        nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 2px; }
      `}</style>
    </div>
  );
}
