import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import type { LastMessage } from '@/app/chats/page';
import { fetchLastMessages } from '@/lib/last-messages';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('seller_profiles')
    .select('client_id')
    .eq('user_id', session.user.id)
    .single();

  if (!profile?.client_id) {
    return NextResponse.json({ lastMessages: {} });
  }

  const body = await req.json().catch(() => ({}));
  const leadIds = Array.isArray(body.leadIds)
    ? body.leadIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0).slice(0, 20000)
    : [];

  if (!leadIds.length) {
    return NextResponse.json({ lastMessages: {} });
  }

  // Último mensaje por lead vía RPC (sin ventana — ver lib/last-messages.ts).
  const service = createSupabaseServiceClient();
  const lastMessages = await fetchLastMessages(service, profile.client_id, leadIds);

  return NextResponse.json({ lastMessages });
}
