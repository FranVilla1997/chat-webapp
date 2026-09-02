'use client';

import { useEffect, useState } from 'react';
import type { Message, MessageAttachment } from '@/lib/types';
import type { Followup } from '@/hooks/useFollowups';

interface MessageBubbleProps {
  message: Message;
  isOptimistic?: boolean;
  /** El envío falló: el mensaje NO salió por WhatsApp. */
  failed?: boolean;
  onRetry?: () => void;
  followup?: Followup;
  onEdit?: (messageId: string | number, content: string) => Promise<void>;
  onDelete?: (messageId: string | number) => Promise<void>;
  /** Responder citando este mensaje (solo mensajes con whatsapp_message_id). */
  onReply?: (message: Message) => void;
  /** Cita que este mensaje lleva (resuelta por el contenedor contra los messages cargados). */
  quoted?: { author: string; preview: string } | null;
}

/** Bloque de cita dentro de la burbuja (estilo respuesta de WhatsApp). */
function QuotedBlock({ quoted, onDark }: { quoted: { author: string; preview: string }; onDark?: boolean }) {
  return (
    <div style={{
      background: onDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.05)',
      borderLeft: `3px solid ${onDark ? 'rgba(255,255,255,0.55)' : '#185de8'}`,
      borderRadius: 4, padding: '5px 9px', marginBottom: 7,
    }}>
      <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: onDark ? 'rgba(255,255,255,0.8)' : '#6b9aef', letterSpacing: '0.04em' }}>
        {quoted.author}
      </span>
      <span style={{
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', fontSize: 12, lineHeight: 1.4,
        color: onDark ? 'rgba(255,255,255,0.72)' : '#a8a8b3',
      }}>
        {quoted.preview}
      </span>
    </div>
  );
}

function ReplyLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none', background: 'transparent', color: '#848484',
        fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline',
        fontFamily: MONO,
      }}
    >
      Responder
    </button>
  );
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

function AudioBadge() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 5, fontFamily: MONO }}>
      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M5 8.5a.5.5 0 0 0-1 0A4 4 0 0 0 7.5 12.46V14H6a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1H8.5v-1.54A4 4 0 0 0 12 8.5a.5.5 0 0 0-1 0 3 3 0 0 1-6 0z"/>
      </svg>
      Audio transcripto
    </span>
  );
}

type AttachmentDisplayType = 'audio' | 'image' | 'video' | 'document';

function attachmentExtension(attachment: MessageAttachment) {
  return attachment.file_name?.split('.').pop()?.toLowerCase() ?? '';
}

function getAttachmentDisplayType(attachment: MessageAttachment): AttachmentDisplayType {
  const mimeType = String(attachment.mime_type ?? '').toLowerCase();
  const extension = attachmentExtension(attachment);

  if (attachment.media_type === 'audio' || mimeType.startsWith('audio/') || ['ogg', 'oga', 'mp3', 'm4a', 'wav'].includes(extension)) return 'audio';
  if (attachment.media_type === 'image' || mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(extension)) return 'image';
  if (attachment.media_type === 'video' || mimeType.startsWith('video/') || ['mp4', 'm4v', 'mov', 'webm', 'ogv'].includes(extension)) return 'video';
  return 'document';
}

// Los href de "abrir" van al endpoint con ?redirect=1 (firma la URL en el
// momento del click): las URLs pre-firmadas vencen a los 10 min y un click
// tardío sobre un PDF daba error.
function attachmentOpenHref(attachment: MessageAttachment) {
  return `/api/message-attachments/${attachment.id}/signed-url?redirect=1`;
}

function FileOpenCard({ attachment, reason }: { attachment: MessageAttachment; reason?: string }) {
  return (
    <div style={{
      marginTop: 8,
      border: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(0,0,0,0.18)',
      borderRadius: 6,
      padding: '9px 10px',
      display: 'grid',
      gap: 7,
      maxWidth: 320,
    }}>
      <span style={{ color: '#e4e4e8', fontSize: 12, lineHeight: 1.35, wordBreak: 'break-word' }}>
        {attachment.file_name || 'Archivo recibido'}
      </span>
      {reason && <span style={{ color: '#848484', fontSize: 11, lineHeight: 1.35 }}>{reason}</span>}
      <a
        href={attachmentOpenHref(attachment)}
        target="_blank"
        rel="noreferrer"
        style={{
          justifySelf: 'start',
          border: '1px solid rgba(136,173,234,0.35)',
          background: 'rgba(24,93,232,0.12)',
          color: '#88adea',
          borderRadius: 4,
          padding: '6px 9px',
          fontSize: 11,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Abrir archivo
      </a>
    </div>
  );
}

function AttachmentViewer({ attachment }: { attachment: MessageAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const displayType = getAttachmentDisplayType(attachment);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(null);
    setRenderFailed(false);

    fetch(`/api/message-attachments/${attachment.id}/signed-url`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'No se pudo abrir el archivo');
        return body.url as string;
      })
      .then((signedUrl) => { if (alive) setUrl(signedUrl); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'No se pudo abrir el archivo'); });

    return () => { alive = false; };
  }, [attachment.id]);

  if (error) {
    return <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: 11 }}>{error}</p>;
  }

  if (!url) {
    return <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>Cargando archivo...</p>;
  }

  if (renderFailed) {
    return (
      <FileOpenCard
        attachment={attachment}
        reason="No se pudo previsualizar en el navegador, pero podés abrir el archivo."
      />
    );
  }

  if (displayType === 'audio') {
    return (
      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
        <audio
          controls
          preload="metadata"
          src={url}
          onError={() => setRenderFailed(true)}
          style={{ display: 'block', width: 'min(280px, 100%)' }}
        />
        <a href={attachmentOpenHref(attachment)} target="_blank" rel="noreferrer" style={{ color: '#88adea', fontSize: 11, textDecoration: 'none' }}>
          Abrir audio
        </a>
      </div>
    );
  }

  if (displayType === 'image') {
    return (
      <a href={attachmentOpenHref(attachment)} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={attachment.caption || attachment.file_name || 'Imagen enviada'}
          onError={() => setRenderFailed(true)}
          style={{ display: 'block', maxWidth: 280, maxHeight: 260, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', objectFit: 'cover' }}
        />
      </a>
    );
  }

  if (displayType === 'video') {
    return (
      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
        <video
          controls
          preload="metadata"
          src={url}
          onError={() => setRenderFailed(true)}
          style={{ display: 'block', maxWidth: 320, width: '100%', maxHeight: 260, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}
        />
        <a href={attachmentOpenHref(attachment)} target="_blank" rel="noreferrer" style={{ color: '#88adea', fontSize: 11, textDecoration: 'none' }}>
          Abrir video
        </a>
      </div>
    );
  }

  return <FileOpenCard attachment={attachment} />;
}

function Attachments({ attachments }: { attachments?: MessageAttachment[] }) {
  if (!attachments?.length) return null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {attachments.map((attachment) => <AttachmentViewer key={attachment.id} attachment={attachment} />)}
    </div>
  );
}

const msgText: React.CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.6,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  margin: 0,
};

const roleLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontFamily: MONO,
};

const messageTime: React.CSSProperties = {
  fontSize: 11,
  color: '#404050',
  fontFamily: MONO,
  whiteSpace: 'nowrap',
};

function followupValue(value?: string | number | null) {
  const clean = String(value ?? '').trim();
  if (!clean) return '-';
  return clean.replace(/_/g, ' ');
}

function FollowupDetails({ followup }: { followup: Followup }) {
  const sentAt = followup.sent_at ? formatTime(followup.sent_at) : '';
  const scheduledAt = followup.scheduled_at ? formatTime(followup.scheduled_at) : '';

  return (
    <details style={{
      width: '100%',
      border: '1px solid rgba(245,158,11,0.22)',
      background: 'rgba(245,158,11,0.055)',
      borderRadius: 5,
      padding: '7px 9px',
      color: '#d7d7df',
      boxSizing: 'border-box',
    }}>
      <summary style={{
        cursor: 'pointer',
        color: '#f59e0b',
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: MONO,
        listStylePosition: 'outside',
      }}>
        Seguimiento automatico #{followup.attempt_number} · {followupValue(followup.intent)}
      </summary>
      <div style={{
        display: 'grid',
        gap: 5,
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid rgba(245,158,11,0.14)',
        fontSize: 11,
        lineHeight: 1.45,
        color: '#a8a8b3',
      }}>
        <span><strong style={{ color: '#e4e4e8' }}>Etapa:</strong> {followupValue(followup.stage_name)}</span>
        <span><strong style={{ color: '#e4e4e8' }}>Tipo:</strong> {followupValue(followup.trigger_type)} · <strong style={{ color: '#e4e4e8' }}>Tono:</strong> {followupValue(followup.tone)}</span>
        {scheduledAt && <span><strong style={{ color: '#e4e4e8' }}>Programado:</strong> {scheduledAt}</span>}
        {sentAt && <span><strong style={{ color: '#e4e4e8' }}>Enviado:</strong> {sentAt}</span>}
        {followup.instructions && (
          <span style={{ whiteSpace: 'pre-wrap' }}>
            <strong style={{ color: '#e4e4e8' }}>Instrucciones:</strong> {followup.instructions}
          </span>
        )}
        {followup.error_message && (
          <span style={{ color: '#f87171', whiteSpace: 'pre-wrap' }}>
            <strong>Error:</strong> {followup.error_message}
          </span>
        )}
      </div>
    </details>
  );
}

function MessageActions({
  message,
  disabled,
  onEdit,
  onDelete,
}: {
  message: Message;
  disabled?: boolean;
  onEdit?: (messageId: string | number, content: string) => Promise<void>;
  onDelete?: (messageId: string | number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(message.content);
  }, [message.content, editing]);

  if (disabled || !onEdit || !['human_agent', 'assistant'].includes(message.role)) return null;

  async function saveEdit() {
    const content = draft.trim();
    if (!content || content === message.content) {
      setEditing(false);
      setDraft(message.content);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onEdit?.(message.id, content);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo editar');
    } finally {
      setBusy(false);
    }
  }

  async function deleteMessage() {
    const question = message.role === 'assistant'
      ? 'Eliminar este mensaje del Sentinel del chat? Si tiene ID de WhatsApp guardado tambien se intentara borrar para todos.'
      : 'Eliminar este mensaje de WhatsApp para todos?';
    if (!confirm(question)) return;

    setBusy(true);
    setError(null);
    try {
      await onDelete?.(message.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 6, width: '100%' }}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          autoFocus
          style={{
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(0,0,0,0.25)',
            color: '#e4e4e8',
            padding: '8px 10px',
            fontSize: 12,
            lineHeight: 1.45,
            outline: 'none',
          }}
        />
        {error && <span style={{ fontSize: 10, color: '#f87171' }}>{error}</span>}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            onClick={() => { setEditing(false); setDraft(message.content); setError(null); }}
            disabled={busy}
            style={{
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.55)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 10,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={saveEdit}
            disabled={busy}
            style={{
              border: '1px solid rgba(107,221,161,0.35)',
              background: 'rgba(107,221,161,0.12)',
              color: '#6bdda1',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', gap: 9, alignItems: 'center' }}>
      <button
        onClick={() => setEditing(true)}
        disabled={busy}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'rgba(255,255,255,0.35)',
          padding: 0,
          fontSize: 11,
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        Editar
      </button>
      {onDelete && (
        <button
          onClick={deleteMessage}
          disabled={busy}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'rgba(248,113,113,0.55)',
            padding: 0,
            fontSize: 11,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Eliminando...' : 'Eliminar'}
        </button>
      )}
      {error && <span style={{ fontSize: 11, color: '#f87171' }}>{error}</span>}
    </div>
  );
}

function MessageMetaRow({
  align,
  createdAt,
  actions,
}: {
  align: 'left' | 'right';
  createdAt: string;
  actions?: React.ReactNode;
}) {
  const time = (
    <span style={{ ...messageTime, paddingLeft: align === 'left' ? 2 : 0, paddingRight: align === 'right' ? 2 : 0 }}>
      {formatTime(createdAt)}
    </span>
  );

  if (align === 'right') {
    return (
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{actions}</div>
        {time}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      {time}
      <div style={{ minWidth: 0 }}>{actions}</div>
    </div>
  );
}

export function MessageBubble({ message, isOptimistic, failed, onRetry, followup, onEdit, onDelete, onReply, quoted }: MessageBubbleProps) {
  const { role, content, created_at, was_audio } = message;
  const hasWhatsAppKey = Boolean(message.whatsapp_message_key?.id || message.whatsapp_message_id);
  const canReply = Boolean(onReply) && hasWhatsAppKey && !isOptimistic && !String(message.id).startsWith('temp-');
  const replyLink = canReply ? <ReplyLink onClick={() => onReply?.(message)} /> : undefined;
  const canManage =
    !isOptimistic &&
    !String(message.id).startsWith('temp-') &&
    (message.role === 'assistant' || (message.role === 'human_agent' && hasWhatsAppKey));
  const canDelete = message.role === 'assistant' || (message.role === 'human_agent' && hasWhatsAppKey);

  /* ── System — centered pill ─────────────────── */
  if (role === 'system') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
        <div style={{
          maxWidth: '78%',
          fontSize: 11,
          color: '#a8a8b3',
          background: 'rgba(107,221,161,0.055)',
          border: '1px solid rgba(107,221,161,0.16)',
          borderLeft: '3px solid rgba(107,221,161,0.75)',
          padding: '8px 12px',
          borderRadius: 6,
          lineHeight: 1.45,
        }}>
          <span style={{ display: 'block', marginBottom: 3, color: '#6bdda1', fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: MONO }}>
            Actividad Sentinel
          </span>
          <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
        </div>
      </div>
    );
  }

  /* ── Lead — LEFT ────────────────────────────── */
  if (role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-start', opacity: isOptimistic ? 0.5 : 1 }}>
        <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ ...roleLabel, color: '#848484', paddingLeft: 2 }}>Lead</span>
          <div style={{
            background: '#1a1a25',
            border: '1px solid #2a2a38',
            borderRadius: '4px 6px 6px 6px',
            padding: '10px 14px',
          }}>
            {quoted && <QuotedBlock quoted={quoted} />}
            {was_audio && <AudioBadge />}
            <p style={{ ...msgText, color: '#e4e4e8' }}>{content}</p>
            <Attachments attachments={message.attachments} />
          </div>
          <MessageMetaRow align="left" createdAt={created_at} actions={replyLink} />
        </div>
      </div>
    );
  }

  /* ── Bot — RIGHT, azul primario ─────────────── */
  if (role === 'assistant') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: isOptimistic ? 0.5 : 1 }}>
        <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span style={{ ...roleLabel, color: followup ? '#f59e0b' : '#185de8', paddingRight: 2 }}>
            {followup ? `Sentinel · Seguimiento #${followup.attempt_number}` : 'Sentinel'}
          </span>
          <div style={{
            background: '#185de8',
            border: followup ? '1px solid rgba(245,158,11,0.35)' : 'none',
            borderRadius: '6px 4px 6px 6px',
            padding: '10px 14px',
          }}>
            {quoted && <QuotedBlock quoted={quoted} onDark />}
            {was_audio && <AudioBadge />}
            <p style={{ ...msgText, color: '#fff' }}>{content}</p>
            <Attachments attachments={message.attachments} />
          </div>
          {followup && <FollowupDetails followup={followup} />}
          <MessageMetaRow
            align="right"
            createdAt={created_at}
            actions={
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                {replyLink}
                <MessageActions message={message} disabled={!canManage} onEdit={onEdit} onDelete={canDelete ? onDelete : undefined} />
              </div>
            }
          />
        </div>
      </div>
    );
  }

  /* ── Vendedor — RIGHT, outlined ─────────────── */
  // Un mensaje fallido se muestra a opacidad plena y marcado: atenuarlo como a
  // uno "en vuelo" era justamente lo que lo hacía pasar por entregado.
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: isOptimistic && !failed ? 0.5 : 1 }}>
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <span style={{ ...roleLabel, color: '#6bdda1', paddingRight: 2 }}>Vos</span>
        <div style={{
          background: failed ? 'rgba(229,62,62,0.07)' : '#0d1a2e',
          border: failed ? '1px solid rgba(229,62,62,0.5)' : '1px solid rgba(24,93,232,0.4)',
          borderRadius: '6px 4px 6px 6px',
          padding: '10px 14px',
        }}>
          {quoted && <QuotedBlock quoted={quoted} />}
          {was_audio && <AudioBadge />}
          <p style={{ ...msgText, color: '#e4e4e8' }}>{content}</p>
          <Attachments attachments={message.attachments} />
        </div>
        {failed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 2 }}>
            <span style={{ fontSize: 10, color: '#e53e3e', fontFamily: MONO }}>
              ✕ No se envió
            </span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                style={{
                  border: 'none', background: 'transparent', color: '#e53e3e',
                  fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline',
                  fontFamily: MONO,
                }}
              >
                Reintentar
              </button>
            )}
          </div>
        ) : (
          <MessageMetaRow
            align="right"
            createdAt={created_at}
            actions={
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                {replyLink}
                <MessageActions message={message} disabled={!canManage} onEdit={onEdit} onDelete={canDelete ? onDelete : undefined} />
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
