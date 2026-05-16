'use client';

import { useEffect, useState } from 'react';
import type { Message, MessageAttachment } from '@/lib/types';

interface MessageBubbleProps {
  message: Message;
  isOptimistic?: boolean;
  onEdit?: (messageId: string | number, content: string) => Promise<void>;
  onDelete?: (messageId: string | number) => Promise<void>;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
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

function AttachmentViewer({ attachment }: { attachment: MessageAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(null);

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

  if (attachment.media_type === 'audio') {
    return (
      <audio
        controls
        preload="metadata"
        src={url}
        style={{ display: 'block', width: 'min(280px, 100%)', marginTop: 8 }}
      />
    );
  }

  if (attachment.media_type === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={attachment.caption || attachment.file_name || 'Imagen enviada'}
          style={{ display: 'block', maxWidth: 280, maxHeight: 260, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', objectFit: 'cover' }}
        />
      </a>
    );
  }

  if (attachment.media_type === 'video') {
    return (
      <video
        controls
        preload="metadata"
        src={url}
        style={{ display: 'block', maxWidth: 320, width: '100%', maxHeight: 260, marginTop: 8, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}
      />
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{ display: 'inline-flex', marginTop: 8, color: '#88adea', fontSize: 12, textDecoration: 'none' }}
    >
      Ver archivo: {attachment.file_name}
    </a>
  );
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
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontFamily: MONO,
};

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
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
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
    <div style={{ display: 'inline-flex', gap: 8, marginTop: 4 }}>
      <button
        onClick={() => setEditing(true)}
        disabled={busy}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'rgba(255,255,255,0.35)',
          padding: 0,
          fontSize: 10,
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
            fontSize: 10,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Eliminando...' : 'Eliminar'}
        </button>
      )}
      {error && <span style={{ fontSize: 10, color: '#f87171' }}>{error}</span>}
    </div>
  );
}

export function MessageBubble({ message, isOptimistic, onEdit, onDelete }: MessageBubbleProps) {
  const { role, content, created_at, was_audio } = message;
  const hasWhatsAppKey = Boolean(message.whatsapp_message_key?.id || message.whatsapp_message_id);
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
            {was_audio && <AudioBadge />}
            <p style={{ ...msgText, color: '#e4e4e8' }}>{content}</p>
            <Attachments attachments={message.attachments} />
            <MessageActions message={message} disabled={!canManage} onEdit={onEdit} onDelete={canDelete ? onDelete : undefined} />
          </div>
          <span style={{ fontSize: 10, color: '#404050', paddingLeft: 2, fontFamily: MONO }}>
            {formatTime(created_at)}
          </span>
        </div>
      </div>
    );
  }

  /* ── Bot — RIGHT, azul primario ─────────────── */
  if (role === 'assistant') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: isOptimistic ? 0.5 : 1 }}>
        <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span style={{ ...roleLabel, color: '#185de8', paddingRight: 2 }}>Sentinel</span>
          <div style={{
            background: '#185de8',
            borderRadius: '6px 4px 6px 6px',
            padding: '10px 14px',
          }}>
            {was_audio && <AudioBadge />}
            <p style={{ ...msgText, color: '#fff' }}>{content}</p>
            <Attachments attachments={message.attachments} />
            <MessageActions message={message} disabled={!canManage} onEdit={onEdit} onDelete={canDelete ? onDelete : undefined} />
          </div>
          <span style={{ fontSize: 10, color: '#404050', paddingRight: 2, fontFamily: MONO }}>
            {formatTime(created_at)}
          </span>
        </div>
      </div>
    );
  }

  /* ── Vendedor — RIGHT, outlined ─────────────── */
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: isOptimistic ? 0.5 : 1 }}>
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <span style={{ ...roleLabel, color: '#6bdda1', paddingRight: 2 }}>Vos</span>
        <div style={{
          background: '#0d1a2e',
          border: '1px solid rgba(24,93,232,0.4)',
          borderRadius: '6px 4px 6px 6px',
          padding: '10px 14px',
        }}>
          {was_audio && <AudioBadge />}
          <p style={{ ...msgText, color: '#e4e4e8' }}>{content}</p>
          <Attachments attachments={message.attachments} />
          <MessageActions message={message} disabled={!canManage} onEdit={onEdit} onDelete={canDelete ? onDelete : undefined} />
        </div>
        <span style={{ fontSize: 10, color: '#404050', paddingRight: 2, fontFamily: MONO }}>
          {formatTime(created_at)}
        </span>
      </div>
    </div>
  );
}
