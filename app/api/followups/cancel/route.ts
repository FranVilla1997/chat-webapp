import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { followupIds, leadId, clientId, reason } = await req.json().catch(() => ({})) as {
    followupIds?: Array<number | string>;
    leadId?: string;
    clientId?: string;
    reason?: string;
  };

  const ids = (followupIds ?? [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));

  if (!ids.length && (!leadId || !clientId)) {
    return NextResponse.json({ error: 'Missing followupIds or leadId/clientId' }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const cancelReason = reason?.trim() || 'Cancelado manualmente desde SCALA Sentinel.';

  let query = service
    .from('followup_queue')
    .update({
      status: 'cancelled',
      cancel_reason: cancelReason,
      error_message: null,
    })
    .eq('status', 'pending')
    .select('id');

  if (ids.length) {
    query = query.in('id', ids);
  } else {
    query = query.eq('lead_id', leadId).eq('client_id', clientId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    cancelled: data?.length ?? 0,
  });
}
