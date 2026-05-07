'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/types';

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
        setMessages(data ?? []);
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
          const newMsg = payload.new as Message;
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
        if (data) setMessages(data);
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
