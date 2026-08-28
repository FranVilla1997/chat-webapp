'use client';

import { useState } from 'react';
import type { Message } from '@/lib/types';
import { readSendFailure, type SendFailure } from '@/lib/send-failure';

interface SendOptions {
  leadPhone: string;
  leadId: string;
  clientId: string;
  instance: string;
  onOptimistic: (msg: Message) => void;
  onReplace: (tempId: string, real: Message) => void;
  onFailed: (tempId: string) => void;
}

export function useSendMessage(opts: SendOptions) {
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<SendFailure | null>(null);

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
        setSendError(await readSendFailure(response));
        opts.onFailed(tempId);
        return;
      }

      const { message } = await response.json();
      opts.onReplace(tempId, message as Message);
    } catch (err) {
      // Fallo de red: nunca se supo si el request llegó.
      setSendError({
        detail: err instanceof Error ? err.message : 'Unknown error',
        evolutionStatus: null,
      });
      opts.onFailed(tempId);
    } finally {
      setSending(false);
    }
  }

  return { sendMessage, sending, sendError };
}
