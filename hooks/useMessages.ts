'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Message, MessageAttachment } from '@/lib/types';

function messageId(message: Pick<Message, 'id'>) {
  return String(message.id);
}

async function loadAttachments(messages: Message[]): Promise<Message[]> {
  const ids = messages.map(messageId);
  if (!ids.length) return messages;

  const { data } = await supabase
    .from('message_attachments')
    .select('*')
    .in('message_id', ids)
    .order('created_at', { ascending: true });

  const byMessage = new Map<string, MessageAttachment[]>();
  for (const attachment of (data ?? []) as MessageAttachment[]) {
    const list = byMessage.get(attachment.message_id) ?? [];
    list.push(attachment);
    byMessage.set(attachment.message_id, list);
  }

  return messages.map((message) => ({
    ...message,
    attachments: byMessage.get(messageId(message)) ?? [],
  }));
}

function byCreatedAt(a: Message, b: Message) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function fingerprint(messages: Message[]) {
  return messages
    .map((message) => {
      const attachments = (message.attachments ?? [])
        .map((attachment) => `${attachment.id}:${attachment.media_type}:${attachment.storage_path}`)
        .join(',');
      return `${messageId(message)}:${message.role}:${message.content}:${message.created_at}:${attachments}`;
    })
    .join('|');
}

function mergeMessages(current: Message[], fresh: Message[]) {
  const nextById = new Map<string, Message>();

  for (const message of fresh) {
    nextById.set(messageId(message), message);
  }

  // Preserve optimistic messages until the send endpoint replaces them with the
  // persisted record. This keeps polling from making just-sent messages flicker.
  for (const message of current) {
    const id = messageId(message);
    if (id.startsWith('temp-') && !nextById.has(id)) {
      nextById.set(id, message);
    }
  }

  return Array.from(nextById.values()).sort(byCreatedAt);
}

export function useMessages(leadId: string, clientId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('connecting');
  const fingerprintRef = useRef('');

  useEffect(() => {
    if (!leadId || !clientId) return;
    let cancelled = false;
    fingerprintRef.current = '';

    async function fetchMessages(options: { initial?: boolean } = {}) {
      if (options.initial) {
        setLoading(true);
        setError(null);
      }

      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('lead_id', leadId)
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        if (options.initial) setError(fetchError.message);
      } else {
        const fresh = await loadAttachments((data ?? []) as Message[]);
        if (cancelled) return;

        setMessages((prev) => {
          const merged = mergeMessages(prev, fresh);
          const nextFingerprint = fingerprint(merged);
          if (nextFingerprint === fingerprintRef.current) return prev;
          fingerprintRef.current = nextFingerprint;
          return merged;
        });
      }

      if (options.initial && !cancelled) setLoading(false);
    }

    fetchMessages({ initial: true });
    const pollInterval = setInterval(() => {
      fetchMessages();
    }, 3500);

    const channel = supabase
      .channel(`messages-${leadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = { ...(payload.new as Message), attachments: [] };
          if (
            String(newMsg.lead_id) === String(leadId) &&
            String(newMsg.client_id) === String(clientId)
          ) {
            setMessages((prev) => {
              const exists = prev.some((m) => String(m.id) === String(newMsg.id));
              if (exists) return prev;
              const next = [...prev, newMsg];
              fingerprintRef.current = fingerprint(next);
              return next.sort(byCreatedAt);
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_attachments' },
        (payload) => {
          const attachment = payload.new as MessageAttachment;
          if (
            String(attachment.lead_id) === String(leadId) &&
            String(attachment.client_id) === String(clientId)
          ) {
            setMessages((prev) => prev.map((message) => {
              if (messageId(message) !== attachment.message_id) return message;
              const current = message.attachments ?? [];
              if (current.some((item) => item.id === attachment.id)) return message;
              return { ...message, attachments: [...current, attachment] };
            }));
          }
        }
      )
      .subscribe((status) => {
        setRealtimeStatus(status);
      });

    return () => {
      cancelled = true;
      channel.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [leadId, clientId]);

  function addOptimisticMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
  }

  function replaceOptimisticMessage(tempId: string, real: Message) {
    setMessages((prev) => prev.map((m) => (String(m.id) === String(tempId) ? real : m)));
  }

  function updateLocalMessage(messageId: string | number, content: string) {
    setMessages((prev) => prev.map((message) => (
      String(message.id) === String(messageId) ? { ...message, content } : message
    )));
  }

  function deleteLocalMessage(messageId: string | number) {
    setMessages((prev) => prev.filter((message) => String(message.id) !== String(messageId)));
  }

  return {
    messages,
    loading,
    error,
    realtimeStatus,
    addOptimisticMessage,
    replaceOptimisticMessage,
    updateLocalMessage,
    deleteLocalMessage,
  };
}
