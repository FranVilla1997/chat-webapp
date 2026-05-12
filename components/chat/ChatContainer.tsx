'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMessages } from '@/hooks/useMessages';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useFollowups } from '@/hooks/useFollowups';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { LeadPanel } from './LeadPanel';
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

type QuoteUrlItem = {
  familia: string;
  producto?: string;
  tela?: string;
  ancho: string;
  alto: string;
  cantidad: string;
  unidadAncho: 'cm';
  unidadAlto: 'cm';
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

function parseLeadMeasurements(value?: string): { width?: string; height?: string } {
  if (!value) return {};
  const normalized = value.replace(',', '.');
  const directMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:cm|m)?\s*(?:ancho|width)?\s*(?:x|por)\s*(\d+(?:\.\d+)?)\s*(?:cm|m)?\s*(?:alto|height)?/i);
  if (directMatch) return { width: directMatch[1], height: directMatch[2] };

  const widthBeforeLabel = normalized.match(/(\d+(?:\.\d+)?)\s*(?:cm|m)?\s*(?:de\s*)?(?:ancho|width)/i);
  const heightBeforeLabel = normalized.match(/(\d+(?:\.\d+)?)\s*(?:cm|m)?\s*(?:de\s*)?(?:alto|height)/i);
  const widthAfterLabel = normalized.match(/(?:ancho|width)\D*(\d+(?:\.\d+)?)/i);
  const heightAfterLabel = normalized.match(/(?:alto|height)\D*(\d+(?:\.\d+)?)/i);

  return {
    width: widthBeforeLabel?.[1] ?? widthAfterLabel?.[1],
    height: heightBeforeLabel?.[1] ?? heightAfterLabel?.[1],
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

    const measurePattern = /(?:(\d+)\s*(?:de|x|u|un|unidades?)\s*)?(\d+(?:\.\d+)?)\s*(?:cm|m)?\s*x\s*(\d+(?:\.\d+)?)\s*(?:cm|m)?/gi;
    for (const match of chunk.body.matchAll(measurePattern)) {
      items.push({
        familia: family,
        producto: rollerProduct ?? product.product,
        tela: product.fabric,
        ancho: match[2],
        alto: match[3],
        cantidad: match[1] ?? '1',
        unidadAncho: 'cm',
        unidadAlto: 'cm',
      });
    }
  }

  return items;
}

function buildQuoteUrl(params: { leadPhone: string; instance: string; leadInfo?: LeadInfo }): string {
  const url = new URL(QUOTE_APP_URL);
  const query = url.searchParams;
  const product = normalizeProductForQuote(params.leadInfo?.productType);
  const measurements = parseLeadMeasurements(params.leadInfo?.measurementsInfo);
  const measurementItems = parseMeasurementItems(params.leadInfo?.measurementsInfo, params.leadInfo?.productType);

  if (params.leadInfo?.name) query.set('nombre', params.leadInfo.name);
  query.set('telefono', params.leadPhone);
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
    query.set('cantidad', '1');
  }

  return url.toString();
}

export function ChatContainer({ leadPhone, leadId, clientId, instance, leadInfo, showBack }: ChatContainerProps) {
  const router = useRouter();
  const {
    messages, loading, error, realtimeStatus,
    addOptimisticMessage, replaceOptimisticMessage,
  } = useMessages(leadId, clientId);

  const { sendMessage, sending, sendError } = useSendMessage({
    leadPhone, leadId, clientId, instance,
    onOptimistic: addOptimisticMessage,
    onReplace: replaceOptimisticMessage,
  });

  const [audioSending, setAudioSending] = useState(false);
  const [audioError, setAudioError]     = useState<string | null>(null);
  const [stageUpdating, setStageUpdating] = useState(false);
  const [stageError, setStageError]       = useState<string | null>(null);

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

  const { followups } = useFollowups(leadId, clientId);

  const bottomRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [presupuestoEnviado, setPresupuestoEnviado] = useState(false);
  const hasLeadInfo = !!(leadInfo?.name || leadInfo?.stage || leadInfo?.score || leadInfo?.fields?.length);

  const isCalificado = leadInfo?.stage?.toLowerCase() === 'calificado';

  async function handlePresupuestar() {
    setStageUpdating(true);
    setStageError(null);
    try {
      const quoteUrl = buildQuoteUrl({ leadPhone, instance, leadInfo });
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
            leadInfo={leadInfo}
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
          </div>

          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '24px 24px 8px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.03em' }}>
                  Sin mensajes aún
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOptimistic={String(msg.id).startsWith('temp-')}
                />
              ))
            )}
            <div ref={bottomRef} style={{ height: 8 }} />
          </div>

          {(sendError || audioError || stageError) && (
            <div style={{ padding: '8px 24px', background: 'rgba(229,62,62,0.06)', borderTop: '1px solid rgba(229,62,62,0.15)' }}>
              <p style={{ fontSize: 11, color: '#e53e3e' }}>{sendError || audioError || stageError}</p>
            </div>
          )}

          <MessageInput
            onSend={sendMessage}
            onSendAudio={handleSendAudio}
            sending={sending || audioSending}
          />
        </div>

        {/* Lead info panel */}
        {hasLeadInfo && (
          <LeadPanel
            lead={{ ...leadInfo, phone: leadPhone }}
            followups={followups}
            open={effectivePanelOpen}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
