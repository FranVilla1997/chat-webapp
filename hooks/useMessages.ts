'use client';

import { useEffect, useState } from 'react';
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

export function useMessages(leadId: string, clientId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('connecting');

  useEffect(() => {
    if (!leadId || !clientId) return;

    async function fetchMessages() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('lead_id', leadId)
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setMessages(await loadAttachments((data ?? []) as Message[]));
      }
      setLoading(false);
    }

    fetchMessages();

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
              return next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
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
        if (status === 'CHANNEL_ERROR') startPolling();
      });

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (pollInterval) return;
      pollInterval = setInterval(async () => {
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('lead_id', leadId)
          .eq('client_id', clientId)
          .order('created_at', { ascending: true });
        if (data) setMessages(await loadAttachments(data as Message[]));
      }, 5000);
    }

    return () => {
      channel.unsubscribe();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [leadId, clientId]);

  function addOptimisticMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
  }

  function replaceOptimisticMessage(tempId: string, real: Message) {
    setMessages((prev) => prev.map((m) => (String(m.id) === String(tempId) ? real : m)));
  }

  return { messages, loading, error, realtimeStatus, addOptimisticMessage, replaceOptimisticMessage };
}
