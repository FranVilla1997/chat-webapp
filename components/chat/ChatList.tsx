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
  airtableBaseId?: string;
  airtableTableId?: string;
}

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;
const NOTIFICATION_SETTINGS_KEY = 'scala_notification_sound_settings';

type NotificationSound = 'scala' | 'ping' | 'bell' | 'soft';

type NotificationSoundSettings = {
  sound: NotificationSound;
  volume: number;
};

const NOTIFICATION_SOUNDS: { value: NotificationSound; label: string }[] = [
  { value: 'scala', label: 'SCALA' },
  { value: 'ping', label: 'Ping' },
  { value: 'bell', label: 'Campana' },
  { value: 'soft', label: 'Suave' },
];

const DEFAULT_SOUND_SETTINGS: NotificationSoundSettings = {
  sound: 'scala',
  volume: 0.85,
};

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

function lastActivityTime(lead: AirtableLead, previews: Record<string, LastMessage>) {
  const previewTime = previews[lead.RecordID]?.created_at;
  const leadTime = lead.last_message_at;
  const fallbackTime = lead.created_at;
  return new Date(previewTime || leadTime || fallbackTime || 0).getTime();
}

interface Toast {
  id: string;
  lead: AirtableLead;
  content: string;
}

export function ChatList({ initialLeads, sellerName, clientId, lastMessages, airtableBaseId, airtableTableId }: ChatListProps) {
  const router = useRouter();
  const [leads, setLeads] = useState<AirtableLead[]>(initialLeads);
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(new Set());
  const [activeStage, setActiveStage] = useState('all');
  const [selectedLead, setSelectedLead] = useState<AirtableLead | null>(null);
  const [msgPreviews, setMsgPreviews] = useState<Record<string, LastMessage>>(lastMessages);
  const [seenAt, setSeenAt] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [search, setSearch] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [soundSettings, setSoundSettings] = useState<NotificationSoundSettings>(DEFAULT_SOUND_SETTINGS);
  const leadsRef = useRef(leads);
  leadsRef.current = leads;
  const selectedLeadRef = useRef(selectedLead);
  selectedLeadRef.current = selectedLead;
  const knownPreviewTimesRef = useRef<Record<string, string>>(
    Object.fromEntries(Object.entries(lastMessages).map(([leadId, message]) => [leadId, message.created_at]))
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastSoundAtRef = useRef(0);

  function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (audioContextRef.current) return audioContextRef.current;

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) return null;
    audioContextRef.current = new AudioContextCtor();
    return audioContextRef.current;
  }

  function playNotificationSound(force = false) {
    const now = Date.now();
    if (!force && now - lastSoundAtRef.current < 900) return;

    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return;

    lastSoundAtRef.current = now;
    const start = ctx.currentTime;
    const volume = Math.max(0, Math.min(soundSettings.volume, 1));

    const playTone = (
      offset: number,
      duration: number,
      frequency: number,
      peak: number,
      type: OscillatorType = 'triangle'
    ) => {
      const toneStart = start + offset;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, toneStart);
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * volume), toneStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + duration);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneStart + duration + 0.03);
    };

    if (soundSettings.sound === 'ping') {
      playTone(0, 0.22, 1568, 0.22, 'sine');
      return;
    }

    if (soundSettings.sound === 'bell') {
      playTone(0, 0.34, 784, 0.16, 'triangle');
      playTone(0.08, 0.42, 1175, 0.11, 'sine');
      playTone(0.18, 0.42, 1568, 0.08, 'sine');
      return;
    }

    if (soundSettings.sound === 'soft') {
      playTone(0, 0.28, 740, 0.10, 'sine');
      playTone(0.16, 0.32, 988, 0.08, 'sine');
      return;
    }

    playTone(0, 0.15, 988, 0.17, 'triangle');
    playTone(0.15, 0.27, 1319, 0.15, 'triangle');
  }

  function shouldNotifyIncoming(
    leadId: string,
    message: LastMessage,
    options: { allowFirst?: boolean } = {}
  ) {
    if (message.role !== 'user') return false;

    const previous = knownPreviewTimesRef.current[leadId];
    knownPreviewTimesRef.current[leadId] = message.created_at;

    if (!previous) return Boolean(options.allowFirst);
    return new Date(message.created_at).getTime() > new Date(previous).getTime();
  }

  function showIncomingToast(lead: AirtableLead, content: string) {
    if (selectedLeadRef.current?.RecordID === lead.RecordID) return;

    const toastId = `${lead.RecordID}-${Date.now()}`;
    setToasts(prev => [...prev.slice(-2), { id: toastId, lead, content }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 8000);
  }

  function notifyIncomingMessage(lead: AirtableLead, message: LastMessage) {
    playNotificationSound();
    showIncomingToast(lead, message.content);
  }

  async function refreshLeads(options: { markNew?: boolean } = {}) {
    const params = new URLSearchParams();
    if (airtableBaseId) params.set('airtable_base_id', airtableBaseId);
    if (airtableTableId) params.set('airtable_table_id', airtableTableId);

    const res = await fetch(`/api/leads${params.size ? `?${params.toString()}` : ''}`, {
      cache: 'no-store',
    });
    if (!res.ok) return;

    const { leads: fresh } = await res.json() as { leads: AirtableLead[] };
    const currentIds = new Set(leadsRef.current.map(l => l.RecordID));
    const added = fresh.filter(l => !currentIds.has(l.RecordID)).map(l => l.RecordID);

    setLeads(fresh);
    setSelectedLead(current => {
      if (!current) return null;
      return fresh.find(l => l.RecordID === current.RecordID) ?? current;
    });

    if (options.markNew && added.length > 0) {
      setNewLeadIds(prev => new Set([...prev, ...added]));
    }
  }

  async function refreshMessagePreviews() {
    const leadIds = leadsRef.current.map(l => l.RecordID);
    if (!leadIds.length) return;

    const res = await fetch('/api/messages/latest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds }),
      cache: 'no-store',
    });
    if (!res.ok) return;

    const { lastMessages: fresh } = await res.json() as { lastMessages: Record<string, LastMessage> };
    for (const [leadId, message] of Object.entries(fresh)) {
      if (!shouldNotifyIncoming(leadId, message)) continue;
      const lead = leadsRef.current.find(l => l.RecordID === leadId);
      if (lead) notifyIncomingMessage(lead, message);
    }

    setMsgPreviews(prev => ({ ...prev, ...fresh }));
  }

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('scala_seen_leads') ?? '{}');
      setSeenAt(stored);
    } catch { /* empty */ }

    try {
      const storedSettings = JSON.parse(localStorage.getItem(NOTIFICATION_SETTINGS_KEY) ?? 'null') as Partial<NotificationSoundSettings> | null;
      const storedSound = storedSettings?.sound;
      if (
        storedSettings &&
        storedSound &&
        NOTIFICATION_SOUNDS.some((sound) => sound.value === storedSound) &&
        typeof storedSettings.volume === 'number'
      ) {
        setSoundSettings({
          sound: storedSound,
          volume: Math.max(0, Math.min(storedSettings.volume, 1)),
        });
      }
    } catch { /* empty */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(soundSettings));
  }, [soundSettings]);

  useEffect(() => {
    const unlockAudio = () => {
      const ctx = getAudioContext();
      ctx?.resume().catch(() => undefined);
    };

    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Realtime: nuevos leads
  useEffect(() => {
    const channel = supabase
      .channel('lead-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notifications' },
        async (payload) => {
          const notifClientId = (payload.new as { client_id?: string }).client_id;
          if (clientId && notifClientId && notifClientId !== clientId) return;
          await refreshLeads({ markNew: true });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, airtableBaseId, airtableTableId]);

  // Polling suave: mantiene leads y etapas al día aunque Realtime/Airtable no notifique.
  useEffect(() => {
    const interval = setInterval(() => {
      refreshLeads().catch(() => undefined);
    }, 12000);

    return () => clearInterval(interval);
  }, [airtableBaseId, airtableTableId]);

  // Polling suave de previews: evita tener que recargar para ver nuevas conversaciones.
  useEffect(() => {
    refreshMessagePreviews().catch(() => undefined);
    const interval = setInterval(() => {
      refreshMessagePreviews().catch(() => undefined);
    }, 4500);

    return () => clearInterval(interval);
  }, [clientId]);

  // Realtime: nuevos mensajes en cualquier lead
  useEffect(() => {
    const channel = supabase
      .channel('new-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as { lead_id: string; role: string; content: string; created_at: string; client_id: string };
          // Solo mensajes del lead (no bot/agente)
          if (msg.role !== 'user') return;
          // Solo leads de este vendedor
          const lead = leadsRef.current.find(l => l.RecordID === msg.lead_id);
          if (!lead) return;
          const latestMessage = { content: msg.content, role: msg.role, created_at: msg.created_at };
          if (shouldNotifyIncoming(msg.lead_id, latestMessage, { allowFirst: true })) {
            notifyIncomingMessage(lead, latestMessage);
          }

          // Actualizar preview del mensaje
          setMsgPreviews(prev => ({
            ...prev,
            [msg.lead_id]: latestMessage,
          }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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
      if (aNew !== bNew) return aNew - bNew;
      return lastActivityTime(b, msgPreviews) - lastActivityTime(a, msgPreviews);
    });
  }, [leads, activeStage, search, newLeadIds, msgPreviews]);

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
          <div style={{
            padding: '9px 10px',
            borderRadius: 5,
            border: '1px solid #1e1e2a',
            background: '#0f0f16',
            marginBottom: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: '#848484', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: MONO }}>
                Notificación
              </span>
              <button
                type="button"
                onClick={() => {
                  const ctx = getAudioContext();
                  ctx?.resume().then(() => playNotificationSound(true)).catch(() => undefined);
                }}
                style={{
                  border: '1px solid rgba(24,93,232,0.28)',
                  background: 'rgba(24,93,232,0.08)',
                  color: '#8ab4ff',
                  borderRadius: 4,
                  padding: '3px 7px',
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Probar
              </button>
            </div>

            <select
              value={soundSettings.sound}
              onChange={(event) => setSoundSettings((current) => ({
                ...current,
                sound: event.target.value as NotificationSound,
              }))}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: 8,
                borderRadius: 4,
                border: '1px solid #2a2a38',
                background: '#12121a',
                color: '#e4e4e8',
                padding: '6px 8px',
                fontSize: 11,
                outline: 'none',
              }}
            >
              {NOTIFICATION_SOUNDS.map((sound) => (
                <option key={sound.value} value={sound.value}>{sound.label}</option>
              ))}
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundSettings.volume}
                onChange={(event) => setSoundSettings((current) => ({
                  ...current,
                  volume: Number(event.target.value),
                }))}
                style={{ flex: 1, accentColor: '#185de8' }}
                aria-label="Volumen de notificación"
              />
              <span style={{ width: 30, textAlign: 'right', fontSize: 10, color: '#848484', fontFamily: MONO }}>
                {Math.round(soundSettings.volume * 100)}%
              </span>
            </div>
          </div>

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
            const lastMsg = msgPreviews[lead.RecordID];
            const seenTimestamp = seenAt[lead.RecordID];
            const leadWrote = lastMsg?.role === 'user' &&
              (!seenTimestamp || lastMsg.created_at > seenTimestamp);

            let msgPrefix = '';
            if (lastMsg?.role === 'human_agent') msgPrefix = 'Vos: ';
            else if (lastMsg?.role === 'assistant') msgPrefix = 'Sentinel: ';

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

      {/* ══ Toasts de mensaje nuevo ══ */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
        {toasts.map((toast) => {
          const initial = (toast.lead.whatsapp_display_name || toast.lead.name || toast.lead.phone).charAt(0).toUpperCase();
          const name = toast.lead.whatsapp_display_name || toast.lead.name || toast.lead.phone;
          return (
            <div
              key={toast.id}
              style={{ pointerEvents: 'all', animation: 'toastIn 0.25s ease' }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#12121a', border: '1px solid #2a2a38',
                borderLeft: '3px solid #f59e0b',
                borderRadius: 5, padding: '12px 14px',
                width: 300, cursor: 'pointer',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              }}
                onClick={() => {
                  setSelectedLead(toast.lead);
                  setActiveStage('all');
                  setToasts(prev => prev.filter(t => t.id !== toast.id));
                  const updated = { ...seenAt, [toast.lead.RecordID]: toast.content };
                  setSeenAt(updated);
                  localStorage.setItem('scala_seen_leads', JSON.stringify(updated));
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#f59e0b', fontFamily: MONO,
                }}>
                  {initial}
                </div>
                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e8' }}>{name}</span>
                    <span style={{ fontSize: 9, color: '#f59e0b', fontFamily: MONO, fontWeight: 700, letterSpacing: '0.06em' }}>NUEVO</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#848484', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {toast.content}
                  </p>
                </div>
                {/* Close */}
                <button
                  onClick={e => { e.stopPropagation(); setToasts(prev => prev.filter(t => t.id !== toast.id)); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#404050', padding: 2, flexShrink: 0, lineHeight: 1 }}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
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
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: #404050; }
        input:focus { border-color: #2a2a38 !important; }
        button:hover:not(:disabled) { opacity: 0.85; }
      `}</style>
    </div>
  );
}
