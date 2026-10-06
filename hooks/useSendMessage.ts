'use client';

import { useRef, useState } from 'react';
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

type ReplyTo = { waId: string; preview: string; role: string } | null | undefined;

let contador = 0;
/** Id provisorio único: dos envíos en el mismo milisegundo chocaban con Date.now() solo. */
export function tempMessageId(): string {
  contador += 1;
  return `temp-${Date.now()}-${contador}`;
}

/**
 * Envíos en cola, como en WhatsApp: cada mensaje aparece en el chat apenas se
 * manda y sale cuando le toca, uno por uno y en orden. Antes la caja quedaba
 * bloqueada hasta que el servidor confirmaba el envío anterior (1 a 3 s), y
 * escribir tres mensajes seguidos era esperar tres veces.
 *
 * `enqueue` sirve para meter en la misma fila los audios y archivos, así no
 * se adelantan a un texto que ya estaba esperando.
 */
export function useSendMessage(opts: SendOptions) {
  const [pending, setPending] = useState(0);
  const [sendError, setSendError] = useState<SendFailure | null>(null);
  const queueRef = useRef<Array<() => Promise<void>>>([]);
  const runningRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  async function pump() {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const task = queueRef.current.shift()!;
        try {
          await task();
        } catch {
          // cada tarea reporta su propio error
        }
        setPending((n) => Math.max(0, n - 1));
      }
    } finally {
      runningRef.current = false;
    }
  }

  function enqueue(task: () => Promise<void>) {
    queueRef.current.push(task);
    setPending((n) => n + 1);
    void pump();
  }

  async function deliver(tempId: string, text: string, replyTo: ReplyTo) {
    const o = optsRef.current;
    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadPhone: o.leadPhone,
          leadId: o.leadId,
          clientId: o.clientId,
          instance: o.instance,
          text,
          ...(replyTo ? { replyTo } : {}),
        }),
      });

      if (!response.ok) {
        setSendError(await readSendFailure(response));
        o.onFailed(tempId);
        return;
      }

      const { message } = await response.json();
      o.onReplace(tempId, message as Message);
    } catch (err) {
      // Fallo de red: nunca se supo si el request llegó.
      setSendError({
        detail: err instanceof Error ? err.message : 'Unknown error',
        evolutionStatus: null,
      });
      o.onFailed(tempId);
    }
  }

  function sendMessage(text: string, replyTo?: ReplyTo) {
    if (!text.trim()) return;
    setSendError(null);

    const tempId = tempMessageId();
    const optimistic: Message = {
      id: tempId,
      lead_id: opts.leadId,
      client_id: opts.clientId,
      role: 'human_agent',
      content: text,
      was_audio: false,
      created_at: new Date().toISOString(),
      ...(replyTo
        ? {
            event_metadata: {
              reply_to_wa_id: replyTo.waId,
              reply_to_preview: replyTo.preview,
              reply_to_role: replyTo.role,
            },
          }
        : {}),
    };
    opts.onOptimistic(optimistic);
    enqueue(() => deliver(tempId, text, replyTo));
  }

  return { sendMessage, enqueue, sending: pending > 0, sendError };
}
