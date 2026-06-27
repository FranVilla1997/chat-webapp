import { createSupabaseServiceClient } from './supabase-server';

export async function cancelPendingFollowupsForLead(params: {
  leadId: string;
  clientId?: string;
  reason: string;
}) {
  const service = createSupabaseServiceClient();
  let query = service
    .from('followup_queue')
    .update({
      status: 'cancelled',
      cancel_reason: params.reason,
      error_message: null,
    })
    .eq('lead_id', params.leadId)
    .eq('status', 'pending')
    .select('id');

  if (params.clientId) query = query.eq('client_id', params.clientId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
