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

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

/* ── Etapas del embudo ── */
const FUNNEL: { key: string; label: string; color: string }[] = [
  { key: 'all',              label: 'Todos',            color: '#848484' },
  { key: 'calificado',       label: 'Calificado',       color: '#6bdda1' },
  { key: 'en_calificacion',  label: 'Calificando',      color: '#f59e0b' },
  { key: 'propuesta_enviada',label: 'Propuesta',        color: '#185de8' },
  { key: 'nuevo',            label: 'Nuevo',            color: '#3b7ef5' },
  { key: 'en_proceso',       label: 'En proceso',       color: '#f59e0b' },
  { key: 'no_responde',      label: 'No responde',      color: '#848484' },
  { key: 'cerrado_ganado',   label: 'Ganado',           color: '#6bdda1' },
  { key: 'cerrado_perdido',  label: 'Perdido',          color: '#e53e3e' },
];

const STAGE_BADGE: Record<string, { bg: string; color: string }> = {
  calificado:        { bg: 'rgba(107,221,161,0.10)', color: '#6bdda1' },
  en_calificacion:   { bg: 'rgba(245,158,11,0.10)',  color: '#f59e0b' },
  propuesta_enviada: { bg: 'rgba(24,93,232,0.10)',   color: '#185de8' },
  nuevo:             { bg: 'rgba(59,126,245,0.10)',  color: '#3b7ef5' },
  en_proceso:        { bg: 'rgba(245,158,11,0.10)',  color: '#f59e0b' },
  no_responde:       { bg: 'rgba(132,132,132,0.10)', color: '#848484' },
  cerrado_ganado:    { bg: 'rgba(107,221,161,0.10)', color: '#6bdda1' },
  cerrado_perdido:   { bg: 'rgba(229,62,62,0.10)',   color: '#e53e3e' },
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
  const [search, setSearch] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('scala_seen_leads') ?? '{}');
      setSeenAt(stored);
    } catch { /* empty */ }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('lead-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notifications' },
        async (payload) => {
          console.log('[Realtime] payload recibido:', payload);
          const notifClientId = (payload.new as { client_id?: string }).client_id;
          if (clientId && notifClientId && notifClientId !== clientId) {
            console.log('[Realtime] ignorado por clientId distinto:', notifClientId, 'vs', clientId);
            return;
          }
          const res = await fetch('/api/leads');
          console.log('[Realtime] fetch /api/leads status:', res.status);
          if (!res.ok) return;
          const { leads: fresh } = await res.json() as { leads: AirtableLead[] };
          console.log('[Realtime] leads frescos:', fresh.length);
          const currentIds = new Set(leadsRef.current.map(l => l.RecordID));
          const added = fresh.filter(l => !currentIds.has(l.RecordID)).map(l => l.RecordID);
          setLeads(fresh);
          if (added.length > 0) {
            setNewLeadIds(prev => new Set([...prev, ...added]));
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] status:', status, err ?? '');
      });
    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: leads.length };
    for (const l of leads) m[l.current_stage] = (m[l.current_stage] ?? 0) + 1;
    return m;
  }, [leads]);

  const filtered = useMemo(() => {
    const list = leads.filter((l) => {
      const matchStage = activeStage === 'all' || l.current_stage === activeStage;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        l.whatsapp_display_name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.name.toLowerCase().includes(q);
      return matchStage && matchSearch;
    });
    return list.sort((a, b) => {
      const aNew = newLeadIds.has(a.RecordID) ? 0 : 1;
      const bNew = newLeadIds.has(b.RecordID) ? 0 : 1;
      return aNew - bNew;
    });
  }, [leads, activeStage, search, newLeadIds]);

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const calificadosCount = counts['calificado'] ?? 0;

  return (
    <div style={{ display: 'flex', height: '100svh', overflow: 'hidden', background: '#000' }}>

      {/* ══ PANEL 1: Sidebar / Embudo (200px) ══ */}
      <aside style={{
        width: 200, flexShrink: 0,
        borderRight: '1px solid #1e1e2a',
        background: '#0a0a0f',
        display: 'flex', flexDirection: 'column',
        paddingTop: 22,
      }}>
        {/* Logo */}
        <div style={{ padding: '0 18px 20px' }}>
          <Image src="/logo/scala-logo.svg" alt="SCALA" width={64} height={8} priority
            style={{ filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
        </div>

        {/* Seller chip */}
        {sellerName && (
          <div style={{ padding: '0 12px 16px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 10px', borderRadius: 5,
              background: '#12121a', border: '1px solid #1e1e2a',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(24,93,232,0.18)', border: '1px solid rgba(24,93,232,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: '#185de8',
                fontFamily: MONO,
              }}>
                {sellerName.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sellerName}
                </p>
                <p style={{ fontSize: 9, color: '#848484', margin: 0, fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Vendedor</p>
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: '#1e1e2a', margin: '0 12px 14px' }} />

        {/* Calificados CTA */}
        {calificadosCount > 0 && (
          <button
            onClick={() => setActiveStage('calificado')}
            style={{
              margin: '0 12px 14px',
              padding: '10px 12px',
              borderRadius: 5,
              border: `1px solid ${activeStage === 'calificado' ? 'rgba(107,221,161,0.4)' : 'rgba(107,221,161,0.2)'}`,
              background: activeStage === 'calificado' ? 'rgba(107,221,161,0.1)' : 'rgba(107,221,161,0.05)',
              cursor: 'pointer', textAlign: 'left',
              animation: activeStage !== 'calificado' ? 'calPulse 2.5s ease-in-out infinite' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6bdda1', letterSpacing: '0.04em' }}>Calificados</span>
              <span style={{
                fontSize: 11, fontWeight: 800, color: '#000',
                background: '#6bdda1', borderRadius: 3, padding: '1px 7px',
                fontFamily: MONO,
              }}>{calificadosCount}</span>
            </div>
            <p style={{ fontSize: 10, color: 'rgba(107,221,161,0.5)', margin: '3px 0 0' }}>
              Listos para presupuesto
            </p>
          </button>
        )}

        {/* Etapas label */}
        <p style={{ fontSize: 9, fontWeight: 700, color: '#404050', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 18px', marginBottom: 4, fontFamily: MONO }}>
          Etapas
        </p>

        {/* Filtros */}
        <nav style={{ flex: 1, overflowY: 'auto' }}>
          {FUNNEL.filter(s => s.key === 'all' || (counts[s.key] ?? 0) > 0).map((s) => {
            const isActive = activeStage === s.key;
            const count = counts[s.key] ?? 0;
            return (
              <button
                key={s.key}
                onClick={() => setActiveStage(s.key)}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 16px',
                  background: isActive ? '#12121a' : 'transparent',
                  border: 'none',
                  borderLeft: `2px solid ${isActive ? s.color : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isActive ? s.color : '#2a2a38',
                  boxShadow: isActive ? `0 0 6px ${s.color}66` : 'none',
                  transition: 'all 0.1s',
                }} />
                <span style={{
                  fontSize: 12, flex: 1, textAlign: 'left',
                  color: isActive ? '#e4e4e8' : '#848484',
                  fontWeight: isActive ? 600 : 400,
                }}>
                  {s.label}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: MONO,
                  color: isActive ? s.color : '#404050',
                  background: isActive ? `${s.color}15` : 'transparent',
                  padding: isActive ? '1px 5px' : undefined,
                  borderRadius: 3,
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '12px 12px 20px' }}>
          <div style={{ height: 1, background: '#1e1e2a', marginBottom: 10 }} />
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 5,
              border: '1px solid #1e1e2a',
              background: 'transparent',
              color: '#404050', fontSize: 11,
              cursor: loggingOut ? 'not-allowed' : 'pointer',
              transition: 'all 0.1s',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ══ PANEL 2: Lista de chats (300px) ══ */}
      <div style={{
        width: 300, flexShrink: 0,
        borderRight: '1px solid #1e1e2a',
        display: 'flex', flexDirection: 'column',
        background: '#050508',
      }}>
        {/* Search */}
        <div style={{ padding: '14px 12px 10px', borderBottom: '1px solid #1e1e2a', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#404050" strokeWidth={2}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar lead..."
              style={{
                width: '100%', boxSizing: 'border-box',
                paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                borderRadius: 4, border: '1px solid #1e1e2a',
                background: '#12121a',
                color: '#e4e4e8', fontSize: 12, outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <p style={{ fontSize: 10, color: '#404050', margin: '7px 0 0', fontFamily: MONO, letterSpacing: '0.04em' }}>
            {filtered.length} {filtered.length === 1 ? 'lead' : 'leads'}
          </p>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40%' }}>
              <p style={{ fontSize: 12, color: '#404050' }}>Sin resultados</p>
            </div>
          ) : filtered.map((lead) => {
            const isSelected = selectedLead?.RecordID === lead.RecordID;
            const isNew = newLeadIds.has(lead.RecordID) && !isSelected;
            const badge = STAGE_BADGE[lead.current_stage] ?? STAGE_BADGE['nuevo'];
            const initial = (lead.whatsapp_display_name || lead.name || lead.phone).charAt(0).toUpperCase();
            const lastMsg = lastMessages[lead.RecordID];
            const seenTimestamp = seenAt[lead.RecordID];
            const leadWrote = lastMsg?.role === 'user' &&
              (!seenTimestamp || lastMsg.created_at > seenTimestamp);

            let msgPrefix = '';
            if (lastMsg?.role === 'human_agent') msgPrefix = 'Vos: ';
            else if (lastMsg?.role === 'assistant') msgPrefix = 'Bot: ';

            const msgPreview = isNew
              ? 'Lead nuevo ingresado'
              : lastMsg ? `${msgPrefix}${lastMsg.content}` : 'Sin mensajes aún';

            let rowBg = 'transparent';
            let leftBorder = 'transparent';
            if (isSelected)   { rowBg = 'rgba(24,93,232,0.1)';   leftBorder = '#185de8'; }
            else if (isNew)   { rowBg = 'rgba(107,221,161,0.06)'; leftBorder = '#6bdda1'; }
            else if (leadWrote) { rowBg = 'rgba(245,158,11,0.04)'; leftBorder = '#f59e0b'; }

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
                  width: '100%', display: 'flex', gap: 11, padding: '12px 12px',
                  background: rowBg,
                  borderLeft: `2px solid ${leftBorder}`,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  borderBottom: '1px solid #1e1e2a',
                  transition: 'background 0.1s',
                }}
              >
                {/* Avatar */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: isNew ? 'rgba(107,221,161,0.15)' : '#12121a',
                    border: `1px solid ${isNew ? 'rgba(107,221,161,0.4)' : '#2a2a38'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, fontFamily: MONO,
                    color: isNew ? '#6bdda1' : '#848484',
                  }}>
                    {initial}
                  </div>
                  {leadWrote && !isNew && (
                    <span style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 9, height: 9, borderRadius: '50%',
                      background: '#f59e0b', border: '2px solid #050508',
                      animation: 'leadAlert 1.8s ease-in-out infinite',
                    }} />
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 600,
                      color: isNew ? '#6bdda1' : '#e4e4e8',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140,
                    }}>
                      {lead.whatsapp_display_name || lead.name || lead.phone}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {isNew && (
                        <span style={{
                          fontSize: 8, fontWeight: 800, color: '#000',
                          background: '#6bdda1', borderRadius: 3, padding: '1px 5px',
                          letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: MONO,
                          animation: 'newBadge 1.5s ease-in-out infinite',
                        }}>NEW</span>
                      )}
                      {!isNew && leadWrote && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: MONO }}>
                          nuevo
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: '#404050', fontFamily: MONO }}>
                        {formatTime(lead.last_message_at)}
                      </span>
                    </div>
                  </div>
                  <p style={{
                    fontSize: 12, margin: '0 0 5px',
                    color: isNew ? 'rgba(107,221,161,0.6)' : leadWrote ? '#e4e4e8' : '#848484',
                    fontWeight: leadWrote || isNew ? 500 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {msgPreview}
                  </p>
                  <span style={{
                    display: 'inline-block',
                    fontSize: 9, fontWeight: 600, fontFamily: MONO,
                    padding: '2px 6px', borderRadius: 3,
                    background: badge.bg, color: badge.color,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {lead.current_stage === 'en_calificacion' ? 'calificando' : lead.current_stage.replace('_', ' ')}
                  </span>
                  {lead.score && (
                    <span style={{ fontSize: 9, color: '#404050', fontFamily: MONO, marginLeft: 5 }}>
                      {lead.score}pts
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ PANEL 3: Chat abierto ══ */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#000' }}>
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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1e1e2a" strokeWidth={1.5}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p style={{ fontSize: 12, color: '#404050', letterSpacing: '0.04em', fontFamily: MONO }}>
              Seleccioná un lead
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes calPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(107,221,161,0); }
          50%       { box-shadow: 0 0 0 4px rgba(107,221,161,0.15); }
        }
        @keyframes leadAlert {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
          50%       { box-shadow: 0 0 0 3px rgba(245,158,11,0.3); }
        }
        @keyframes newBadge {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
        }
        input::placeholder { color: #404050; }
        input:focus { border-color: #2a2a38 !important; }
        button:hover:not(:disabled) { opacity: 0.85; }
      `}</style>
    </div>
  );
}
