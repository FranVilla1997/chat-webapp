'use client';

import { useState } from 'react';
import type { Message } from '@/lib/types';

interface SendOptions {
  leadPhone: string;
  leadId: string;
  clientId: string;
  instance: string;
  onOptimistic: (msg: Message) => void;
  onReplace: (tempId: string, real: Message) => void;
}

export function useSendMessage(opts: SendOptions) {
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    setSending(true);
    setSendError(null);

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      lead_id: opts.leadId,
      client_id: opts.clientId,
      role: 'human_agent',
      content: text,
      was_audio: false,
      created_at: new Date().toISOString(),
    };
    opts.onOptimistic(optimistic);

    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadPhone: opts.leadPhone,
          leadId: opts.leadId,
          clientId: opts.clientId,
          instance: opts.instance,
          text,
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error ?? 'Failed to send message');
      }

      const { message } = await response.json();
      opts.onReplace(tempId, message as Message);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSending(false);
    }
  }

  return { sendMessage, sending, sendError };
}
