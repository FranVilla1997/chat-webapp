import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import type { LastMessage } from '@/app/chats/page';

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
    ? body.leadIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0).slice(0, 5000)
    : [];

  if (!leadIds.length) {
    return NextResponse.json({ lastMessages: {} });
  }

  // Un solo query por cliente con la ventana de mensajes recientes (últimos
  // 1000, ~días de tráfico), filtrado en memoria contra los leads pedidos.
  // Antes se tomaban los primeros 150 leadIds de una lista ordenada por etapa:
  // los leads de etapas tardías (ej. Propuesta enviada) nunca entraban al cupo
  // y jamás refrescaban su preview → un lead que respondía no aparecía en
  // "Sin responder" cuando Realtime perdía el evento.
  const requested = new Set(leadIds);
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('messages')
    .select('lead_id, role, content, created_at')
    .eq('client_id', profile.client_id)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lastMessages: Record<string, LastMessage> = {};
  for (const msg of data ?? []) {
    if (!requested.has(msg.lead_id)) continue;
    if (!lastMessages[msg.lead_id]) {
      lastMessages[msg.lead_id] = {
        content: msg.content,
        role: msg.role,
        created_at: msg.created_at,
      };
    }
  }

  return NextResponse.json({ lastMessages });
}
