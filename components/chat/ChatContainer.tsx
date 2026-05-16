'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { useMessages } from '@/hooks/useMessages';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useFollowups } from '@/hooks/useFollowups';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { LeadPanel } from './LeadPanel';
import { BotPauseControl } from './BotPauseControl';
import { SaleModal } from './SaleModal';
import type { LeadInfo, Message } from '@/lib/types';

interface ChatContainerProps {
  leadPhone: string;
  leadId: string;
  clientId: string;
  instance: string;
  leadInfo?: LeadInfo;
  showBack?: boolean;
}

const QUOTE_APP_URL = process.env.NEXT_PUBLIC_QUOTE_APP_URL ?? 'https://roller-cheaper-quotes.vercel.app/quotes/new';
const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type SentinelEvent = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

type ChatTimelineItem =
  | { kind: 'message'; message: Message }
  | { kind: 'event'; event: SentinelEvent };

function friendlySendError(error: string) {
  const lower = error.toLowerCase();
  if (lower.includes('evolution') || lower.includes('unauthorized') || lower.includes('401') || lower.includes('whatsapp')) {
    return 'No se pudo enviar el mensaje por un error de conexión con WhatsApp. Revisá que la instancia del lead tenga su API key correcta.';
  }
  if (lower.includes('audio')) return 'No se pudo enviar el audio. Revisá la conexión e intentá nuevamente.';
  if (lower.includes('archivo') || lower.includes('media')) return 'No se pudo enviar el archivo. Revisá la conexión e intentá nuevamente.';
  return error;
}

type QuoteUrlItem = {
  familia: string;
  producto?: string;
  tela?: string;
  ancho: string;
  alto: string;
  cantidad: string;
  unidadAncho: 'cm' | 'm';
  unidadAlto: 'cm' | 'm';
};

function parseMeasurements(value?: string): { width?: string; height?: string } {
  if (!value) return {};
  const normalized = value.replace(',', '.');
  const directMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:cm|m)?\s*(?:x|×|por)\s*(\d+(?:\.\d+)?)/i);
  if (directMatch) return { width: directMatch[1], height: directMatch[2] };

  const widthMatch = normalized.match(/(?:ancho|width)\D*(\d+(?:\.\d+)?)/i);
  const heightMatch = normalized.match(/(?:alto|height)\D*(\d+(?:\.\d+)?)/i);
  return { width: widthMatch?.[1], height: heightMatch?.[1] };
}

function normalizeMeasureValue(value: string): string {
  return value.trim().replace(',', '.');
}

function inferMeasureUnit(value: string, explicitUnit?: string): 'cm' | 'm' {
  const unit = explicitUnit?.toLowerCase();
  if (unit?.startsWith('m')) return 'm';
  if (unit === 'cm') return 'cm';

  const normalized = normalizeMeasureValue(value);
  const parsed = Number(normalized);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 20 && /[,.]/.test(value)) return 'm';
  return 'cm';
}

function parseLeadMeasurements(value?: string): { width?: string; height?: string; widthUnit?: 'cm' | 'm'; heightUnit?: 'cm' | 'm' } {
  if (!value) return {};
  const normalized = value.replace(/×|Ã—/g, 'x');
  const directMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(cm|m|mts?|metros?)?\s*(?:ancho|width)?\s*(?:x|por)\s*(\d+(?:[.,]\d+)?)\s*(cm|m|mts?|metros?)?\s*(?:alto|height)?/i);
  if (directMatch) {
    return {
      width: normalizeMeasureValue(directMatch[1]),
      height: normalizeMeasureValue(directMatch[3]),
      widthUnit: inferMeasureUnit(directMatch[1], directMatch[2]),
      heightUnit: inferMeasureUnit(directMatch[3], directMatch[4]),
    };
  }

  const widthBeforeLabel = normalized.match(/(\d+(?:[.,]\d+)?)\s*(cm|m|mts?|metros?)?\s*(?:de\s*)?(?:ancho|width)/i);
  const heightBeforeLabel = normalized.match(/(\d+(?:[.,]\d+)?)\s*(cm|m|mts?|metros?)?\s*(?:de\s*)?(?:alto|height)/i);
  const widthAfterLabel = normalized.match(/(?:ancho|width)\D*(\d+(?:[.,]\d+)?)(?:\s*(cm|m|mts?|metros?))?/i);
  const heightAfterLabel = normalized.match(/(?:alto|height)\D*(\d+(?:[.,]\d+)?)(?:\s*(cm|m|mts?|metros?))?/i);
  const width = widthBeforeLabel?.[1] ?? widthAfterLabel?.[1];
  const height = heightBeforeLabel?.[1] ?? heightAfterLabel?.[1];
  const widthUnit = widthBeforeLabel?.[2] ?? widthAfterLabel?.[2];
  const heightUnit = heightBeforeLabel?.[2] ?? heightAfterLabel?.[2];

  return {
    width: width ? normalizeMeasureValue(width) : undefined,
    height: height ? normalizeMeasureValue(height) : undefined,
    widthUnit: width ? inferMeasureUnit(width, widthUnit) : undefined,
    heightUnit: height ? inferMeasureUnit(height, heightUnit) : undefined,
  };
}

function normalizeText(value?: string): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeProductForQuote(value?: string): { family?: string; product?: string; fabric?: string } {
  if (!value) return {};
  const text = normalizeText(value);

  if (text.includes('zebra') || text.includes('eclipse')) {
    const fabric = text.includes('capri') ? 'CAPRI' : text.includes('monza') ? 'MONZA' : text.includes('cairo') ? 'CAIRO' : undefined;
    return { family: 'zebra', fabric };
  }
  if (text.includes('banda')) return { family: 'bandas_verticales' };
  if (text.includes('cortinado') || text.includes('cortina')) return { family: 'cortinado' };
  if (text.includes('devon') && text.includes('trasluc')) return { family: 'roller', product: 'simple_traslucida_devon' };
  if (text.includes('rustico') && text.includes('black')) return { family: 'roller', product: 'simple_blackout_rustico' };
  if (text.includes('devon') && text.includes('black')) return { family: 'roller', product: 'simple_blackout_devon' };
  if (text.includes('premium')) return { family: 'roller', product: 'simple_blackout_premium' };
  if (text.includes('sunscreen') || text.includes('screen 5')) return { family: 'roller', product: 'simple_sunscreen_5' };
  if (text.includes('rustico') || text.includes('rustica')) return { family: 'roller', product: 'simple_rustico_3' };
  if (text.includes('trasluc')) return { family: 'roller', product: 'simple_traslucida' };
  if (text.includes('mesh')) return { family: 'roller', product: 'simple_mesh_8' };
  if (text.includes('black')) return { family: 'roller', product: 'simple_blackout_100' };
  if (text.includes('roller')) return { family: 'roller' };

  return {};
}

function rollerProductFromText(value?: string): string | undefined {
  const text = normalizeText(value);
  const isBlackout = text.includes('blackout') || text.includes('black out') || text.includes('black');
  const isSunscreen = text.includes('sunscreen') || text.includes('screen');
  const isDouble = text.includes('doble') || text.includes('sistema doble');

  if (isDouble && !isBlackout && !isSunscreen) {
    return 'doble_blackout_100_sunscreen_5';
  }

  if (isDouble && isBlackout && isSunscreen) {
    if (text.includes('premium')) return 'doble_blackout_premium_sunscreen_5';
    if (text.includes('devon')) return 'doble_blackout_devon_sunscreen_5';
    if (text.includes('rustico') || text.includes('rustica')) return 'doble_blackout_rustico_sunscreen_5';
    return 'doble_blackout_100_sunscreen_5';
  }

  if (isDouble && isBlackout) {
    if (text.includes('premium')) return 'doble_blackout_premium_sunscreen_5';
    if (text.includes('devon')) return 'doble_blackout_devon_sunscreen_5';
    if (text.includes('rustico') || text.includes('rustica')) return 'doble_blackout_rustico_sunscreen_5';
    return 'doble_blackout_100_sunscreen_5';
  }

  if (isSunscreen) return 'simple_sunscreen_5';
  if (text.includes('premium')) return 'simple_blackout_premium';
  if (text.includes('devon') && isBlackout) return 'simple_blackout_devon';
  if ((text.includes('rustico') || text.includes('rustica')) && isBlackout) return 'simple_blackout_rustico';
  if (text.includes('mesh')) return 'simple_mesh_8';
  if (isBlackout) return 'simple_blackout_100';
  return undefined;
}

function parseMeasurementItems(measurementsInfo?: string, productType?: string): QuoteUrlItem[] {
  if (!measurementsInfo) return [];

  const normalized = measurementsInfo.replace(/×/g, 'x').replace(/,/g, '.');
  const labelPattern = /(sistema\s+doble|solo\s+sunscreen|sunscreen|blackout|black\s*out|zebra|eclipse|bandas?|cortinado|cortina)\s*:/gi;
  const labels = [...normalized.matchAll(labelPattern)];
  const chunks = labels.length
    ? labels.map((label, index) => ({
        title: label[1],
        body: normalized.slice(label.index! + label[0].length, labels[index + 1]?.index ?? normalized.length),
      }))
    : [{ title: productType ?? '', body: normalized }];

  const items: QuoteUrlItem[] = [];

  for (const chunk of chunks) {
    const context = `${chunk.title} ${chunk.body} ${productType ?? ''}`;
    const product = normalizeProductForQuote(context);
    const rollerProduct = product.family === 'roller' || !product.family ? rollerProductFromText(context) : undefined;
    const family = product.family ?? (rollerProduct ? 'roller' : undefined);
    if (!family) continue;

    const measurePattern = /(?:(\d+)\s*(?:de|x|u|un|unidades?)\s*)?(\d+(?:\.\d+)?)\s*(cm|m|mts?|metros?)?\s*x\s*(\d+(?:\.\d+)?)\s*(cm|m|mts?|metros?)?/gi;
    for (const match of chunk.body.matchAll(measurePattern)) {
      items.push({
        familia: family,
        producto: rollerProduct ?? product.product,
        tela: product.fabric,
        ancho: match[2],
        alto: match[4],
        cantidad: match[1] ?? '1',
        unidadAncho: inferMeasureUnit(match[2], match[3]),
        unidadAlto: inferMeasureUnit(match[4], match[5]),
      });
    }
  }

  return items;
}

function buildQuoteUrl(params: { leadPhone: string; leadId: string; clientId: string; instance: string; leadInfo?: LeadInfo }): string {
  const url = new URL(QUOTE_APP_URL);
  const query = url.searchParams;
  const product = normalizeProductForQuote(params.leadInfo?.productType);
  const measurements = parseLeadMeasurements(params.leadInfo?.measurementsInfo);
  const measurementItems = parseMeasurementItems(params.leadInfo?.measurementsInfo, params.leadInfo?.productType);

  if (params.leadInfo?.name) query.set('nombre', params.leadInfo.name);
  query.set('telefono', params.leadPhone);
  if (params.leadId) query.set('leadId', params.leadId);
  if (params.clientId) query.set('clientId', params.clientId);
  if (params.leadInfo?.sellerName) query.set('vendedor', params.leadInfo.sellerName);
  if (params.instance) query.set('instancia', params.instance);
  if (product.family) query.set('familia', product.family);
  if (product.product) query.set('producto', product.product);
  if (product.fabric) query.set('tela', product.fabric);
  if (measurementItems.length) {
    query.set('items', JSON.stringify(measurementItems));
  } else {
    if (measurements.width) query.set('ancho', measurements.width);
    if (measurements.height) query.set('alto', measurements.height);
    if (measurements.widthUnit) query.set('unidadAncho', measurements.widthUnit);
    if (measurements.heightUnit) query.set('unidadAlto', measurements.heightUnit);
    query.set('cantidad', '1');
  }

  return url.toString();
}

function isValidDate(value?: string) {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

function sentinelEventDate(...values: Array<string | undefined>) {
  return values.find(isValidDate) ?? '1970-01-01T00:00:00.000Z';
}

function normalizeStageLabel(value?: string) {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function deriveSentinelEvents(leadInfo?: LeadInfo): SentinelEvent[] {
  if (!leadInfo) return [];

  const events: SentinelEvent[] = [];
  const collected = (leadInfo.fields ?? [])
    .filter((field) => field.value && field.label.toLowerCase() !== 'instancia')
    .slice(0, 6);

  if (collected.length) {
    events.push({
      id: `sentinel-info-${collected.map((field) => `${field.label}:${field.value}`).join('|')}`,
      title: 'Información recabada',
      body: collected.map((field) => `${field.label}: ${field.value}`).join('\n'),
      createdAt: sentinelEventDate(leadInfo.stageChangedAt, leadInfo.qualifiedAt),
    });
  }

  if (leadInfo.stage) {
    events.push({
      id: `sentinel-stage-${leadInfo.stage}-${leadInfo.stageChangedAt ?? ''}`,
      title: 'Etapa actualizada',
      body: `El lead quedó en ${normalizeStageLabel(leadInfo.stage)}.`,
      createdAt: sentinelEventDate(leadInfo.stageChangedAt, leadInfo.qualifiedAt),
    });
  }

  if (leadInfo.score || leadInfo.qualificationReason) {
    events.push({
      id: `sentinel-score-${leadInfo.score ?? ''}-${leadInfo.qualificationReason ?? ''}`,
      title: 'Calificación actualizada',
      body: [
        leadInfo.score ? `Score: ${leadInfo.score} pts` : '',
        leadInfo.qualificationReason ? `Motivo: ${leadInfo.qualificationReason}` : '',
      ].filter(Boolean).join('\n'),
      createdAt: sentinelEventDate(leadInfo.qualifiedAt, leadInfo.stageChangedAt),
    });
  }

  if (leadInfo.proposalSentAt || leadInfo.proposalAmount) {
    events.push({
      id: `sentinel-proposal-${leadInfo.proposalSentAt ?? ''}-${leadInfo.proposalAmount ?? ''}`,
      title: 'Propuesta registrada',
      body: leadInfo.proposalAmount ? `Monto propuesto: ${leadInfo.proposalAmount}` : 'El Sentinel registró una propuesta enviada.',
      createdAt: sentinelEventDate(leadInfo.proposalSentAt, leadInfo.stageChangedAt),
    });
  }

  return events;
}

function timelineTime(item: ChatTimelineItem) {
  const value = item.kind === 'message' ? item.message.created_at : item.event.createdAt;
  return new Date(value).getTime();
}

function SentinelEventCard({ event }: { event: SentinelEvent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
      <div style={{
        maxWidth: '78%',
        background: 'linear-gradient(135deg, rgba(107,221,161,0.08), rgba(24,93,232,0.05))',
        border: '1px solid rgba(107,221,161,0.16)',
        borderLeft: '3px solid #6bdda1',
        borderRadius: 7,
        padding: '9px 12px',
        color: '#d7d7de',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#6bdda1', boxShadow: '0 0 10px rgba(107,221,161,0.5)' }} />
          <span style={{ color: '#6bdda1', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {event.title}
          </span>
        </div>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.55 }}>
          {event.body}
        </p>
      </div>
    </div>
  );
}

export function ChatContainer({ leadPhone, leadId, clientId, instance, leadInfo, showBack }: ChatContainerProps) {
  const router = useRouter();
  const {
    messages, loading, error, realtimeStatus,
    addOptimisticMessage, replaceOptimisticMessage, updateLocalMessage, deleteLocalMessage,
  } = useMessages(leadId, clientId);

  const { sendMessage, sending, sendError } = useSendMessage({
    leadPhone, leadId, clientId, instance,
    onOptimistic: addOptimisticMessage,
    onReplace: replaceOptimisticMessage,
  });

  const [audioSending, setAudioSending] = useState(false);
  const [audioError, setAudioError]     = useState<string | null>(null);
  const [fileSending, setFileSending]   = useState(false);
  const [fileError, setFileError]       = useState<string | null>(null);
  const [stageUpdating, setStageUpdating] = useState(false);
  const [stageError, setStageError]       = useState<string | null>(null);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleNotice, setSaleNotice]       = useState<string | null>(null);
  const [currentStage, setCurrentStage]   = useState(leadInfo?.stage ?? '');

  async function handleSendAudio(base64: string, duration: number) {
    setAudioSending(true);
    setAudioError(null);

    const tempId = `temp-${Date.now()}`;
    addOptimisticMessage({
      id: tempId, lead_id: leadId, client_id: clientId,
      role: 'human_agent',
      content: duration ? `Audio (${duration}s)` : 'Audio',
      was_audio: true,
      created_at: new Date().toISOString(),
    });

    try {
      const res = await fetch('/api/send-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadPhone, leadId, clientId, instance, audioBase64: base64, duration }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error ?? 'Error al enviar audio');
      }
      const { message } = await res.json();
      replaceOptimisticMessage(tempId, message);
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Error al enviar audio');
    } finally {
      setAudioSending(false);
    }
  }

  async function handleSendFile(file: File, caption?: string) {
    setFileSending(true);
    setFileError(null);

    const kind = file.type.startsWith('image/') ? 'Foto' : file.type.startsWith('video/') ? 'Video' : 'Archivo';
    const tempId = `temp-${Date.now()}`;
    addOptimisticMessage({
      id: tempId,
      lead_id: leadId,
      client_id: clientId,
      role: 'human_agent',
      content: caption ? `${kind}: ${caption}` : `${kind} enviado: ${file.name}`,
      was_audio: false,
      created_at: new Date().toISOString(),
    });

    try {
      const uploadUrlRes = await fetch('/api/send-file/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          clientId,
          fileName: file.name,
          mimeType: file.type,
        }),
      });
      if (!uploadUrlRes.ok) {
        const { error } = await uploadUrlRes.json();
        throw new Error(error ?? 'Error al preparar archivo');
      }
      const upload = await uploadUrlRes.json() as { bucket: string; path: string; token: string };
      const { error: uploadError } = await supabaseBrowser.storage
        .from(upload.bucket)
        .uploadToSignedUrl(upload.path, upload.token, file);
      if (uploadError) throw new Error(uploadError.message);

      const res = await fetch('/api/send-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadPhone,
          leadId,
          clientId,
          instance,
          caption: caption ?? '',
          storagePath: upload.path,
          fileName: file.name,
          mimeType: file.type,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error ?? 'Error al enviar archivo');
      }
      const { message } = await res.json();
      replaceOptimisticMessage(tempId, message);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Error al enviar archivo');
    } finally {
      setFileSending(false);
    }
  }

  const { followups } = useFollowups(leadId, clientId);

  const bottomRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [presupuestoEnviado, setPresupuestoEnviado] = useState(false);
  const [botResumeAt, setBotResumeAt] = useState(leadInfo?.botResumeAt ?? '');
  const [pauseBusy, setPauseBusy] = useState(false);
  const enrichedLeadInfo: LeadInfo | undefined = leadInfo
    ? { ...leadInfo, stage: currentStage || leadInfo.stage, sourceInstance: leadInfo.sourceInstance || instance }
    : instance
      ? { stage: currentStage, sourceInstance: instance }
      : undefined;
  const hasLeadInfo = !!(
    enrichedLeadInfo?.name ||
    enrichedLeadInfo?.stage ||
    enrichedLeadInfo?.score ||
    enrichedLeadInfo?.sourceInstance ||
    enrichedLeadInfo?.fields?.length
  );

  const isCalificado = enrichedLeadInfo?.stage?.toLowerCase() === 'calificado';
  const sentinelEvents = useMemo(() => deriveSentinelEvents(enrichedLeadInfo), [
    enrichedLeadInfo?.fields,
    enrichedLeadInfo?.proposalAmount,
    enrichedLeadInfo?.proposalSentAt,
    enrichedLeadInfo?.qualificationReason,
    enrichedLeadInfo?.qualifiedAt,
    enrichedLeadInfo?.score,
    enrichedLeadInfo?.stage,
    enrichedLeadInfo?.stageChangedAt,
  ]);
  const timeline = useMemo<ChatTimelineItem[]>(() => {
    return [
      ...sentinelEvents.map((event) => ({ kind: 'event' as const, event })),
      ...messages.map((message) => ({ kind: 'message' as const, message })),
    ].sort((a, b) => timelineTime(a) - timelineTime(b));
  }, [messages, sentinelEvents]);

  useEffect(() => {
    setCurrentStage(leadInfo?.stage ?? '');
  }, [leadInfo?.stage, leadId]);

  async function handlePresupuestar() {
    setStageUpdating(true);
    setStageError(null);
    try {
      const quoteUrl = buildQuoteUrl({ leadPhone, leadId, clientId, instance, leadInfo: enrichedLeadInfo });
      window.open(quoteUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'No se pudo abrir el presupuestador');
    } finally {
      setStageUpdating(false);
    }
  }

  function handlePresupuestoEnviado() {
    alert('Bot activado y haciendo seguimiento');
  }

  async function pauseBot(resumeAt: string) {
    setPauseBusy(true);
    setStageError(null);
    try {
      const response = await fetch('/api/pause-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: leadId, resumeAt }),
      });
      const result = await response.json() as { error?: string; botResumeAt?: string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo pausar el bot');
      setBotResumeAt(result.botResumeAt ?? resumeAt);
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'No se pudo pausar el bot');
    } finally {
      setPauseBusy(false);
    }
  }

  async function resumeBot() {
    setPauseBusy(true);
    setStageError(null);
    try {
      const response = await fetch('/api/resume-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: leadId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo reanudar el bot');
      setBotResumeAt('');
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'No se pudo reanudar el bot');
    } finally {
      setPauseBusy(false);
    }
  }

  async function handleChangeStage(stageId: string) {
    setStageError(null);
    setSaleNotice(null);
    const response = await fetch('/api/update-lead-stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId: leadId, stageId }),
    });
    const result = await response.json().catch(() => ({})) as {
      error?: string;
      stage?: { name: string; displayName: string };
    };
    if (!response.ok || !result.stage) {
      throw new Error(result.error ?? 'No se pudo actualizar la etapa');
    }
    setCurrentStage(result.stage.name);
    setSaleNotice(`Etapa actualizada a ${result.stage.displayName}.`);
    return result.stage;
  }

  async function handleEditMessage(messageId: string | number, content: string) {
    const response = await fetch(`/api/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, leadPhone, instance }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string; message?: { content?: string } };
    if (!response.ok) throw new Error(result.error ?? 'No se pudo editar el mensaje');
    updateLocalMessage(messageId, result.message?.content ?? content);
  }

  async function handleDeleteMessage(messageId: string | number) {
    const response = await fetch(`/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'No se pudo eliminar el mensaje');
    deleteLocalMessage(messageId);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 28 }}>
          {[0.45, 0.7, 1].map((h, i) => (
            <div key={i} style={{
              width: 6, height: `${h * 100}%`, borderRadius: 3,
              background: 'linear-gradient(to top, #6bdda1, #185de8)',
              animation: `barPulse 1.4s ease-in-out ${i * 0.15}s infinite`,
            }} />
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Cargando conversación
        </p>
        <style>{`@keyframes barPulse { 0%,100%{opacity:.3;transform:scaleY(.7)} 50%{opacity:1;transform:scaleY(1)} }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <p style={{ fontSize: 14, color: '#f87171' }}>Error al cargar mensajes</p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>{error}</p>
      </div>
    );
  }

  const effectivePanelOpen = hasLeadInfo && panelOpen;

  return (
    <div style={{ height: '100svh', display: 'flex', justifyContent: 'center' }}>
      {/* Max-width wrapper */}
      <div style={{
        width: '100%',
        maxWidth: effectivePanelOpen ? 980 : 720,
        display: 'flex',
        transition: 'max-width 0.25s ease',
        borderLeft: '1px solid rgba(255,255,255,0.05)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}>

        {/* Chat column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <ChatHeader
            leadPhone={leadPhone}
            leadInfo={enrichedLeadInfo}
            messages={messages}
            realtimeStatus={realtimeStatus}
            panelOpen={effectivePanelOpen}
            onTogglePanel={hasLeadInfo ? () => setPanelOpen(p => !p) : undefined}
            onBack={showBack ? () => router.push('/chats') : undefined}
          />

          {/* Action bar */}
          <div style={{
            padding: '10px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', gap: 10, alignItems: 'center',
            background: 'rgba(6,6,12,0.8)',
          }}>
            {!presupuestoEnviado && (
              <button
                onClick={handlePresupuestar}
                disabled={stageUpdating}
                style={{
                  padding: '7px 16px',
                  borderRadius: 5,
                  border: isCalificado ? '1px solid rgba(107,221,161,0.4)' : '1px solid #1e1e2a',
                  background: isCalificado ? 'rgba(107,221,161,0.08)' : '#12121a',
                  color: isCalificado ? '#6bdda1' : '#848484',
                  fontSize: 11, fontWeight: 700, cursor: stageUpdating ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  animation: isCalificado && !stageUpdating ? 'presupuestoPulse 2s ease-in-out infinite' : 'none',
                  transition: 'all 0.15s',
                  opacity: stageUpdating ? 0.6 : 1,
                }}
              >
                {stageUpdating ? 'Abriendo…' : 'Presupuestar'}
              </button>
            )}

            {presupuestoEnviado && (
              <button
                onClick={handlePresupuestoEnviado}
                style={{
                  padding: '7px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(24,93,232,0.4)',
                  background: 'rgba(24,93,232,0.1)',
                  color: '#3b7ef5',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  letterSpacing: '0.04em',
                  transition: 'all 0.2s',
                }}
              >
                Presupuesto enviado
              </button>
            )}
            <style>{`@keyframes presupuestoPulse { 0%,100%{box-shadow:0 0 0 0 rgba(107,221,161,0)} 50%{box-shadow:0 0 0 6px rgba(107,221,161,0.25)} }`}</style>
            <BotPauseControl recordId={leadId} initialResumeAt={botResumeAt} onPause={pauseBot} onResume={resumeBot} busy={pauseBusy} />
            <button
              onClick={() => {
                setSaleNotice(null);
                setSaleModalOpen(true);
              }}
              style={{
                marginLeft: 'auto',
                padding: '7px 16px',
                borderRadius: 5,
                border: '1px solid rgba(24,93,232,0.45)',
                background: 'rgba(24,93,232,0.14)',
                color: '#8ab4ff',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Venta
            </button>
          </div>

          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '24px 24px 8px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {timeline.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.03em' }}>
                  Sin mensajes aún
                </p>
              </div>
            ) : (
              timeline.map((item) => item.kind === 'event' ? (
                <SentinelEventCard key={item.event.id} event={item.event} />
              ) : (
                <MessageBubble
                  key={item.message.id}
                  message={item.message}
                  isOptimistic={String(item.message.id).startsWith('temp-')}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                />
              ))
            )}
            <div ref={bottomRef} style={{ height: 8 }} />
          </div>

          {(sendError || audioError || fileError || stageError) && (
            <div style={{ padding: '8px 24px', background: 'rgba(229,62,62,0.06)', borderTop: '1px solid rgba(229,62,62,0.15)' }}>
              <p style={{ fontSize: 11, color: '#e53e3e' }}>{friendlySendError(sendError || audioError || fileError || stageError || '')}</p>
            </div>
          )}

          {saleNotice && (
            <div style={{ padding: '8px 24px', background: 'rgba(53,229,138,0.07)', borderTop: '1px solid rgba(53,229,138,0.16)' }}>
              <p style={{ fontSize: 11, color: '#6bdda1' }}>{saleNotice}</p>
            </div>
          )}

          <MessageInput
            onSend={sendMessage}
            onSendAudio={handleSendAudio}
            onSendFile={handleSendFile}
            sending={sending || audioSending || fileSending}
          />
        </div>

        {/* Lead info panel */}
        {hasLeadInfo && (
          <LeadPanel
            lead={{ ...enrichedLeadInfo, phone: leadPhone }}
            followups={followups}
            open={effectivePanelOpen}
            onClose={() => setPanelOpen(false)}
            onStageChange={handleChangeStage}
          />
        )}
      </div>
      <SaleModal
        open={saleModalOpen}
        leadId={leadId}
        clientId={clientId}
        leadPhone={leadPhone}
        leadInfo={enrichedLeadInfo}
        onClose={() => setSaleModalOpen(false)}
        onCreated={(saleId) => setSaleNotice(`Venta registrada en Airtable${saleId ? ` (${saleId})` : ''}.`)}
      />
    </div>
  );
}
