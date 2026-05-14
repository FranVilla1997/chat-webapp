'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { useMessages } from '@/hooks/useMessages';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useFollowups } from '@/hooks/useFollowups';
import { buildAiSuggestions, deriveSentinelState } from '@/lib/sentinel/deriveSentinelState';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { LeadPanel } from './LeadPanel';
import { BotPauseControl } from './BotPauseControl';
import { SentinelContextStrip } from './SentinelContextStrip';
import { SuggestionsPanel } from './SuggestionsPanel';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import type { LeadInfo } from '@/lib/types';

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

function normalizeMeasureValue(value: string): string {
  return value.trim().replace(',', '.');
}

function inferMeasureUnit(value: string, explicitUnit?: string): 'cm' | 'm' {
  const unit = explicitUnit?.toLowerCase();
  if (unit?.startsWith('m')) return 'm';
  if (unit === 'cm') return 'cm';
  const parsed = Number(normalizeMeasureValue(value));
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 20 && /[,.]/.test(value)) return 'm';
  return 'cm';
}

function parseLeadMeasurements(value?: string): { width?: string; height?: string; widthUnit?: 'cm' | 'm'; heightUnit?: 'cm' | 'm' } {
  if (!value) return {};
  const normalized = value.replace(/[×]/g, 'x');
  const directMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(cm|m|mts?|metros?)?\s*(?:ancho|width)?\s*(?:x|por)\s*(\d+(?:[.,]\d+)?)\s*(cm|m|mts?|metros?)?\s*(?:alto|height)?/i);
  if (!directMatch) return {};
  return {
    width: normalizeMeasureValue(directMatch[1]),
    height: normalizeMeasureValue(directMatch[3]),
    widthUnit: inferMeasureUnit(directMatch[1], directMatch[2]),
    heightUnit: inferMeasureUnit(directMatch[3], directMatch[4]),
  };
}

function normalizeText(value?: string): string {
  return (value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeProductForQuote(value?: string): { family?: string; product?: string; fabric?: string } {
  const text = normalizeText(value);
  if (!text) return {};
  if (text.includes('zebra') || text.includes('eclipse')) return { family: 'zebra', fabric: text.includes('capri') ? 'CAPRI' : text.includes('monza') ? 'MONZA' : text.includes('cairo') ? 'CAIRO' : undefined };
  if (text.includes('banda')) return { family: 'bandas_verticales' };
  if (text.includes('cortinado') || text.includes('cortina')) return { family: 'cortinado' };
  if (text.includes('doble') && text.includes('sunscreen')) return { family: 'roller', product: text.includes('premium') ? 'doble_blackout_premium_sunscreen_5' : 'doble_blackout_100_sunscreen_5' };
  if (text.includes('devon') && text.includes('trasluc')) return { family: 'roller', product: 'simple_traslucida_devon' };
  if (text.includes('rustico') && text.includes('black')) return { family: 'roller', product: 'simple_blackout_rustico' };
  if (text.includes('devon') && text.includes('black')) return { family: 'roller', product: 'simple_blackout_devon' };
  if (text.includes('premium')) return { family: 'roller', product: 'simple_blackout_premium' };
  if (text.includes('sunscreen') || text.includes('screen')) return { family: 'roller', product: 'simple_sunscreen_5' };
  if (text.includes('rustico') || text.includes('rustica')) return { family: 'roller', product: 'simple_rustico_3' };
  if (text.includes('trasluc')) return { family: 'roller', product: 'simple_traslucida' };
  if (text.includes('mesh')) return { family: 'roller', product: 'simple_mesh_8' };
  if (text.includes('black')) return { family: 'roller', product: 'simple_blackout_100' };
  return {};
}

function rollerProductFromText(value?: string): string | undefined {
  return normalizeProductForQuote(value).product;
}

function parseMeasurementItems(measurementsInfo?: string, productType?: string): QuoteUrlItem[] {
  if (!measurementsInfo) return [];
  const normalized = measurementsInfo.replace(/[×]/g, 'x').replace(/,/g, '.');
  const labelPattern = /(sistema\s+doble|solo\s+sunscreen|sunscreen|blackout|black\s*out|zebra|eclipse|bandas?|cortinado|cortina)\s*:/gi;
  const labels = [...normalized.matchAll(labelPattern)];
  const chunks = labels.length
    ? labels.map((label, index) => ({ title: label[1], body: normalized.slice(label.index! + label[0].length, labels[index + 1]?.index ?? normalized.length) }))
    : [{ title: productType ?? '', body: normalized }];
  const items: QuoteUrlItem[] = [];
  for (const chunk of chunks) {
    const context = `${chunk.title} ${chunk.body} ${productType ?? ''}`;
    const product = normalizeProductForQuote(context);
    const family = product.family ?? (rollerProductFromText(context) ? 'roller' : undefined);
    if (!family) continue;
    const measurePattern = /(?:(\d+)\s*(?:de|x|u|un|unidades?)\s*)?(\d+(?:\.\d+)?)\s*(cm|m|mts?|metros?)?\s*x\s*(\d+(?:\.\d+)?)\s*(cm|m|mts?|metros?)?/gi;
    for (const match of chunk.body.matchAll(measurePattern)) {
      items.push({
        familia: family,
        producto: product.product,
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
  if (measurementItems.length) query.set('items', JSON.stringify(measurementItems));
  else {
    if (measurements.width) query.set('ancho', measurements.width);
    if (measurements.height) query.set('alto', measurements.height);
    if (measurements.widthUnit) query.set('unidadAncho', measurements.widthUnit);
    if (measurements.heightUnit) query.set('unidadAlto', measurements.heightUnit);
    query.set('cantidad', '1');
  }
  return url.toString();
}

export function ChatContainer({ leadPhone, leadId, clientId, instance, leadInfo, showBack }: ChatContainerProps) {
  const router = useRouter();
  const { messages, loading, error, realtimeStatus, addOptimisticMessage, replaceOptimisticMessage } = useMessages(leadId, clientId);
  const { sendMessage, sending, sendError } = useSendMessage({ leadPhone, leadId, clientId, instance, onOptimistic: addOptimisticMessage, onReplace: replaceOptimisticMessage });
  const { followups } = useFollowups(leadId, clientId);

  const [audioSending, setAudioSending] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [fileSending, setFileSending] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [botResumeAt, setBotResumeAt] = useState(leadInfo?.botResumeAt ?? '');
  const [pauseBusy, setPauseBusy] = useState(false);
  const [suggestionDraft, setSuggestionDraft] = useState('');
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const enrichedLeadInfo: LeadInfo = { ...(leadInfo ?? {}), sourceInstance: leadInfo?.sourceInstance || instance };
  const sentinelState = deriveSentinelState(enrichedLeadInfo, messages);
  const suggestions = buildAiSuggestions(enrichedLeadInfo, sentinelState);
  const botPaused = Boolean(botResumeAt && new Date(botResumeAt).getTime() > Date.now());
  const hasLeadInfo = Boolean(enrichedLeadInfo.name || enrichedLeadInfo.stage || enrichedLeadInfo.score || enrichedLeadInfo.sourceInstance || enrichedLeadInfo.fields?.length);
  const effectivePanelOpen = hasLeadInfo && panelOpen;

  function openQuote() {
    try {
      window.open(buildQuoteUrl({ leadPhone, leadId, clientId, instance, leadInfo: enrichedLeadInfo }), '_blank', 'noopener,noreferrer');
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'No se pudo abrir el presupuestador');
    }
  }

  async function pauseBot(resumeAt: string) {
    setPauseBusy(true);
    setStageError(null);
    try {
      const response = await fetch('/api/pause-bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId: leadId, resumeAt }) });
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
      const response = await fetch('/api/resume-bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId: leadId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo reanudar el bot');
      setBotResumeAt('');
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'No se pudo reanudar el bot');
    } finally {
      setPauseBusy(false);
    }
  }

  async function handleSendAudio(base64: string, duration: number) {
    setAudioSending(true);
    setAudioError(null);
    const tempId = `temp-${Date.now()}`;
    addOptimisticMessage({ id: tempId, lead_id: leadId, client_id: clientId, role: 'human_agent', content: duration ? `Audio (${duration}s)` : 'Audio', was_audio: true, created_at: new Date().toISOString() });
    try {
      const res = await fetch('/api/send-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadPhone, leadId, clientId, instance, audioBase64: base64, duration }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Error al enviar audio');
      replaceOptimisticMessage(tempId, result.message);
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
    addOptimisticMessage({ id: tempId, lead_id: leadId, client_id: clientId, role: 'human_agent', content: caption ? `${kind}: ${caption}` : `${kind} enviado: ${file.name}`, was_audio: false, created_at: new Date().toISOString() });
    try {
      const uploadUrlRes = await fetch('/api/send-file/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, clientId, fileName: file.name, mimeType: file.type }) });
      if (!uploadUrlRes.ok) throw new Error((await uploadUrlRes.json()).error ?? 'Error al preparar archivo');
      const upload = await uploadUrlRes.json() as { bucket: string; path: string; token: string };
      const { error: uploadError } = await supabaseBrowser.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, file);
      if (uploadError) throw new Error(uploadError.message);
      const res = await fetch('/api/send-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadPhone, leadId, clientId, instance, caption: caption ?? '', storagePath: upload.path, fileName: file.name, mimeType: file.type }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Error al enviar archivo');
      replaceOptimisticMessage(tempId, result.message);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Error al enviar archivo');
    } finally {
      setFileSending(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[data-scala-search]')?.focus();
        return;
      }
      if (isTyping) return;
      if (['1', '2', '3'].includes(event.key)) {
        const suggestion = suggestions[Number(event.key) - 1];
        if (suggestion) setSuggestionDraft(suggestion.text);
      }
      if (event.key.toLowerCase() === 'b') openQuote();
      if (event.key.toLowerCase() === 'p') {
        if (botPaused) resumeBot();
        else pauseBot(new Date(Date.now() + 60 * 60 * 1000).toISOString());
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [suggestions, botPaused]);

  if (loading) {
    return <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }} >Cargando conversación...</div>;
  }

  if (error) {
    return <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--hot)' }}>{error}</div>;
  }

  return (
    <div style={{ height: '100svh', display: 'flex', background: 'var(--ink-0)' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <ChatHeader
          leadPhone={leadPhone}
          leadInfo={enrichedLeadInfo}
          messages={messages}
          sentinelState={sentinelState}
          realtimeStatus={realtimeStatus}
          panelOpen={effectivePanelOpen}
          onTogglePanel={hasLeadInfo ? () => setPanelOpen((p) => !p) : undefined}
          onBack={showBack ? () => router.push('/inbox') : undefined}
        />
        <SentinelContextStrip state={sentinelState} onTakeControl={() => setSuggestionDraft('Te sigo yo desde acá para resolverlo más rápido.')} onQuote={openQuote} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderBottom: '1px solid var(--line)', background: 'var(--ink-1)' }}>
          <BotPauseControl recordId={leadId} initialResumeAt={botResumeAt} onPause={pauseBot} onResume={resumeBot} busy={pauseBusy} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '26px 24px 12px', display: 'flex', flexDirection: 'column', gap: 14, background: 'linear-gradient(180deg, var(--ink-0), #060812)' }}>
          {messages.length === 0 ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
              <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Sentinel está por enviar el saludo inicial.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>Hoy · {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>
              {messages.map((msg) => <MessageBubble key={msg.id} message={msg} isOptimistic={String(msg.id).startsWith('temp-')} />)}
              <div style={{ alignSelf: 'flex-start', color: 'var(--text-3)', border: '1px solid var(--line)', background: 'rgba(255,255,255,0.025)', borderRadius: 999, padding: '8px 12px', fontSize: 12 }}>
                <span style={{ color: 'var(--green)', marginRight: 6 }}>•</span>
                Sentinel está esperando respuesta del lead
              </div>
            </>
          )}
          <div ref={bottomRef} style={{ height: 8 }} />
        </div>

        {(sendError || audioError || fileError || stageError) && <ErrorBanner error={sendError || audioError || fileError || stageError || ''} />}

        <SuggestionsPanel suggestions={suggestions} onPick={(text) => setSuggestionDraft(text)} hidden={suggestionsHidden} onHide={() => setSuggestionsHidden(true)} />
        <MessageInput
          onSend={sendMessage}
          onSendAudio={handleSendAudio}
          onSendFile={handleSendFile}
          onBudget={openQuote}
          draftText={suggestionDraft}
          onDraftConsumed={() => setSuggestionDraft('')}
          botPaused={botPaused}
          onResumeBot={resumeBot}
          sending={sending || audioSending || fileSending}
        />
      </div>

      {hasLeadInfo && (
        <LeadPanel
          lead={{ ...enrichedLeadInfo, phone: leadPhone }}
          followups={followups}
          open={effectivePanelOpen}
          onClose={() => setPanelOpen(false)}
          sentinelState={sentinelState}
        />
      )}
    </div>
  );
}


