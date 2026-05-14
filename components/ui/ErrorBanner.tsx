'use client';

import { useState } from 'react';

interface ErrorBannerProps {
  error: string;
}

function friendlyMessage(error: string) {
  const lower = error.toLowerCase();
  if (lower.includes('evolution') || lower.includes('whatsapp') || lower.includes('unauthorized') || lower.includes('401')) {
    return 'No se pudo enviar el mensaje por un error de conexión con WhatsApp.';
  }
  if (lower.includes('audio')) return 'No se pudo enviar el audio. Revisá la conexión e intentá nuevamente.';
  if (lower.includes('archivo') || lower.includes('media')) return 'No se pudo enviar el archivo. Revisá la conexión e intentá nuevamente.';
  return 'No se pudo completar la acción. Intentá nuevamente.';
}

export function ErrorBanner({ error }: ErrorBannerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      margin: '10px 18px',
      border: '1px solid rgba(255,107,107,0.22)',
      background: 'rgba(255,107,107,0.08)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 12px',
      color: 'var(--text)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--hot)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, lineHeight: 1.35 }}>{friendlyMessage(error)}</span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', padding: 4 }}
        >
          {open ? 'Ocultar detalle' : 'Ver detalle técnico'}
        </button>
      </div>
      {open && (
        <pre style={{
          margin: '10px 0 0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'var(--text-3)',
          background: 'rgba(0,0,0,0.22)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8,
          padding: 10,
          fontSize: 11,
          lineHeight: 1.45,
        }}>{error}</pre>
      )}
    </div>
  );
}
