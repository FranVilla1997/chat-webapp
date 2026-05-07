'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface Followup {
  id: number;
  lead_id: string;
  client_id: string;
  stage_name: string;
  attempt_number: number;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'cancelled' | 'failed' | string;
  trigger_type: string;
  tone: string;
  intent: string;
  instructions: string;
  sent_at: string | null;
  cancel_reason: string | null;
  error_message: string | null;
  created_at: string;
}

export function useFollowups(leadId: string, clientId: string) {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId || !clientId) return;

    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('followup_queue')
        .select('*')
        .eq('lead_id', leadId)
        .eq('client_id', clientId)
        .order('scheduled_at', { ascending: true });
      setFollowups(data ?? []);
      setLoading(false);
    }

    fetch();

    const channel = supabase
      .channel(`followups-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'followup_queue' }, (payload) => {
        const row = (payload.new ?? payload.old) as Followup;
        if (String(row.lead_id) !== String(leadId)) return;
        fetch();
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [leadId, clientId]);

  return { followups, loading };
}
