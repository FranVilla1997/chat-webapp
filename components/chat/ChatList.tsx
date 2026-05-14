'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { buildLeadInfoFromAirtable } from '@/lib/utils';
import { deriveSentinelState } from '@/lib/sentinel/deriveSentinelState';
import { Logo } from '@/components/brand/Logo';
import { Eyebrow } from '@/components/brand/Eyebrow';
import { StageTag } from '@/components/inbox/StageTag';
import { IntentBar } from '@/components/inbox/IntentBar';
import { ChatContainer } from './ChatContainer';
import type { AirtableLead } from '@/lib/types';
import type { LastMessage } from '@/app/chats/page';

interface ChatListProps {
  initialLeads: AirtableLead[];
  sellerName: string | null;
  clientId: string;
  lastMessages: Record<string, LastMessage>;
  airtableBaseId?: string;
  airtableTableId?: string;
}

const STAGES = [
  { key: 'nuevo', label: 'Nuevo' },
  { key: 'en_calificacion', label: 'Calificando' },
  { key: 'calificado', label: 'Calificado' },
  { key: 'propuesta_enviada', label: 'Propuesta' },
  { key: 'cerrado_ganado', label: 'Ganado' },
];

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'needs', label: 'Necesitan vos' },
  { key: 'bot', label: 'Bot activo' },
  { key: 'hot', label: 'Calientes' },
  { key: 'old', label: 'Sin actividad 24h' },
];

function formatTime(iso: string) {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now.getTime() - 86400000);
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' });
}

function olderThan24h(iso?: string) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() > 24 * 60 * 60 * 1000;
}

function currentAction(lead: AirtableLead) {
  const state = deriveSentinelState(lead);
  if (state.priority === 'stuck') return { label: 'Requiere intervención', color: 'var(--warm)', prefix: 'Atención' };
  if (state.currentGoal === 'presupuesto') return { label: 'Listo para presupuesto', color: 'var(--blue-200)', prefix: 'Acción' };
  return { label: state.currentAction, color: 'var(--green)', prefix: 'Sentinel' };
}

export function ChatList({ initialLeads, sellerName, clientId, lastMessages, airtableBaseId, airtableTableId }: ChatListProps) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [selectedLead, setSelectedLead] = useState<AirtableLead | null>(initialLeads[0] ?? null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeStage, setActiveStage] = useState('nuevo');
  const [search, setSearch] = useState('');
  const [msgPreviews, setMsgPreviews] = useState(lastMessages);
  const [loggingOut, setLoggingOut] = useState(false);
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  useEffect(() => {
    const channel = supabase
      .channel('lead-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notifications' }, async (payload) => {
        const notifClientId = (payload.new as { client_id?: string }).client_id;
        if (clientId && notifClientId && notifClientId !== clientId) return;
        const params = new URLSearchParams();
        if (airtableBaseId) params.set('airtable_base_id', airtableBaseId);
        if (airtableTableId) params.set('airtable_table_id', airtableTableId);
        const res = await fetch(`/api/leads${params.size ? `?${params.toString()}` : ''}`);
        if (!res.ok) return;
        const { leads: fresh } = await res.json() as { leads: AirtableLead[] };
        setLeads(fresh);
        if (!selectedLead && fresh.length) setSelectedLead(fresh[0]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, airtableBaseId, airtableTableId, selectedLead]);

  useEffect(() => {
    const channel = supabase
      .channel('new-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as { lead_id: string; role: string; content: string; created_at: string };
        if (!leadsRef.current.some((lead) => lead.RecordID === msg.lead_id)) return;
        setMsgPreviews((prev) => ({ ...prev, [msg.lead_id]: { content: msg.content, role: msg.role, created_at: msg.created_at } }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const counts = useMemo(() => {
    const byStage: Record<string, number> = {};
    let needs = 0;
    let stuck = 0;
    let hot = 0;
    for (const lead of leads) {
      byStage[lead.current_stage] = (byStage[lead.current_stage] ?? 0) + 1;
      const state = deriveSentinelState(lead);
      if (state.needsHuman) needs += 1;
      if (state.priority === 'stuck') stuck += 1;
      if (state.priority === 'hot') hot += 1;
    }
    return { byStage, needs, stuck, hot };
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter((lead) => {
      const state = deriveSentinelState(lead);
      const matchesSearch = !q ||
        lead.whatsapp_display_name.toLowerCase().includes(q) ||
        lead.name.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        lead.medidas_info.toLowerCase().includes(q) ||
        lead.tipo_producto.toLowerCase().includes(q);
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'needs' && state.needsHuman) ||
        (activeFilter === 'stuck' && state.priority === 'stuck') ||
        (activeFilter === 'bot' && !state.needsHuman) ||
        (activeFilter === 'hot' && state.priority === 'hot') ||
        (activeFilter === 'old' && olderThan24h(lead.last_message_at));
      return matchesSearch && matchesFilter;
    });
  }, [leads, search, activeFilter]);

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 330px minmax(0, 1fr)', height: '100svh', background: 'var(--ink-0)', overflow: 'hidden' }}>
      <aside style={{ background: '#0b0e13', borderRight: '1px solid var(--line)', padding: 18, overflowY: 'auto' }}>
        <div style={{ marginBottom: 20 }}><Logo /></div>

        <div className="scala-panel" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 12, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--ink-5)', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)' }}>{sellerName?.charAt(0).toUpperCase() ?? 'S'}</div>
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', color: 'var(--text)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sellerName ?? 'Vendedor'}</strong>
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>Vendedor · RC</span>
          </div>
        </div>

        <div style={{ border: '1px solid var(--line)', background: 'linear-gradient(135deg, var(--ink-2), #141922)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 24, boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Pipeline de hoy</div>
          <div className="scala-display" style={{ color: 'var(--text)', fontSize: 34, marginTop: 8 }}>{leads.length}</div>
          <div style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>
            {counts.needs} requieren respuesta · {counts.hot} calientes
          </div>
        </div>

        <div style={{ display: 'grid', gap: 22 }}>
          <section>
            <Eyebrow>Bandeja</Eyebrow>
            <nav style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              <SideItem color="var(--warm)" label="Requieren respuesta" count={counts.needs} active={activeFilter === 'needs'} onClick={() => setActiveFilter('needs')} />
              <SideItem color="var(--text-4)" label="Bot trabado" count={counts.stuck} active={activeFilter === 'stuck'} onClick={() => setActiveFilter('stuck')} />
              <SideItem color="var(--green)" label="Listos para presupuesto" count={counts.byStage.calificado ?? 0} active={activeFilter === 'hot'} onClick={() => setActiveFilter('hot')} />
            </nav>
          </section>
          <section>
            <Eyebrow>Etapas</Eyebrow>
            <nav style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              {STAGES.map((stage) => (
                <SideItem key={stage.key} color="var(--blue)" label={stage.label} count={counts.byStage[stage.key] ?? 0} active={activeStage === stage.key} onClick={() => { setActiveStage(stage.key); setActiveFilter('all'); }} />
              ))}
            </nav>
          </section>
        </div>

        <button onClick={handleLogout} disabled={loggingOut} className="scala-button" style={{ width: '100%', marginTop: 26 }}>Cerrar sesión</button>
      </aside>

      <section style={{ background: 'var(--ink-1)', borderRight: '1px solid var(--line)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text)', fontWeight: 760 }}>Leads</h1>
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{filtered.length} / {leads.length}</span>
          </div>
          <input data-scala-search value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, teléfono, ambiente..." style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--text)', borderRadius: 12, padding: '10px 12px', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 7, overflowX: 'auto', marginTop: 12, paddingBottom: 4 }}>
            {FILTERS.map((filter) => (
              <button key={filter.key} onClick={() => setActiveFilter(filter.key)} className="scala-button" style={{ flexShrink: 0, minHeight: 32, background: activeFilter === filter.key ? 'var(--blue)' : 'var(--ink-2)', borderColor: activeFilter === filter.key ? 'var(--blue)' : 'var(--line)', color: activeFilter === filter.key ? 'white' : 'var(--text-2)' }}>
                {filter.label} {filter.key === 'all' ? leads.length : ''}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 12px' }}>
          <div style={{ position: 'sticky', top: -8, zIndex: 1, background: 'rgba(13,16,20,0.94)', backdropFilter: 'blur(10px)', padding: '10px 8px' }}>
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Ahora</span>
          </div>
          {filtered.length ? filtered.map((lead) => (
            <LeadCard
              key={lead.RecordID}
              lead={lead}
              selected={selectedLead?.RecordID === lead.RecordID}
              lastMessage={msgPreviews[lead.RecordID]}
              onClick={() => setSelectedLead(lead)}
            />
          )) : (
            <div style={{ padding: 28, color: 'var(--text-4)', textAlign: 'center' }}>
              <p style={{ fontSize: 13 }}>Sin resultados</p>
              <button className="scala-button" onClick={() => { setSearch(''); setActiveFilter('all'); }}>Limpiar filtros</button>
            </div>
          )}
        </div>
      </section>

      <main style={{ minWidth: 0 }}>
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
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-4)' }}>
            Seleccioná un lead
          </div>
        )}
      </main>
    </div>
  );
}

function SideItem({ color, label, count, active, onClick }: { color: string; label: string; count: number; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', alignItems: 'center', gap: 8, border: '1px solid transparent', borderRadius: 10, background: active ? 'var(--vendor-soft)' : 'transparent', color: active ? 'var(--text)' : 'var(--text-2)', minHeight: 34, padding: '0 9px', cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 12 }}>{label}</span>
      <span style={{ minWidth: 22, textAlign: 'center', borderRadius: 999, background: active ? 'var(--blue)' : 'var(--ink-3)', color: active ? 'white' : color, fontSize: 11, fontWeight: 700 }}>{count}</span>
    </button>
  );
}

function LeadCard({ lead, selected, lastMessage, onClick }: { lead: AirtableLead; selected: boolean; lastMessage?: LastMessage; onClick: () => void }) {
  const state = deriveSentinelState(lead);
  const action = currentAction(lead);
  const name = lead.whatsapp_display_name || lead.name || lead.phone;
  const initial = name.charAt(0).toUpperCase();
  const pip = state.priority === 'stuck' ? 'var(--warm)' : state.priority === 'hot' ? 'var(--hot)' : 'var(--green)';
  const preview = lastMessage?.content || lead.last_message_summary || 'Sin mensajes aún';
  const needsHuman = state.needsHuman || lastMessage?.role === 'user';

  return (
    <button onClick={onClick} style={{ width: '100%', display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 11, border: `1px solid ${selected ? 'rgba(84,142,226,0.34)' : 'transparent'}`, borderRadius: 14, background: selected ? 'rgba(24,93,232,0.13)' : 'transparent', padding: '12px 10px', cursor: 'pointer', textAlign: 'left', marginBottom: 6 }}>
      <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 12, background: 'var(--ink-5)', display: 'grid', placeItems: 'center', color: 'var(--text)', fontFamily: 'var(--display)' }}>
        {initial}
        <span style={{ position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: '50%', background: pip, border: '2px solid var(--ink-1)' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ color: 'var(--text)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</strong>
          {needsHuman && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warm)' }} />}
        </div>
        <div style={{ color: action.color, fontSize: 12, fontWeight: 700, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {action.prefix}: {action.label}
        </div>
        <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '5px 0 9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StageTag stage={lead.current_stage} />
          <IntentBar state={state} />
        </div>
      </div>
      <span style={{ color: needsHuman ? 'var(--warm)' : 'var(--text-3)', fontSize: 11, fontWeight: needsHuman ? 700 : 500 }}>
        {formatTime(lastMessage?.created_at ?? lead.last_message_at)}
      </span>
    </button>
  );
}
