import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';

// Marca un lead como "respondido/visto" sin enviar mensaje: persiste
// needs_reply_dismissed_at en deal.metadata. El flag se invalida solo si el
// lead vuelve a escribir DESPUÉS (la UI compara timestamps), así "gracias,
// buen día" se puede despachar sin ensuciar la cola de Sin responder.
export async function POST(req: NextRequest) {
  try {
    const auth = createSupabaseServerClient();
    const { data: { session } } = await auth.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await auth
      .from('seller_profiles')
      .select('client_id')
      .eq('user_id', session.user.id)
      .single();
    if (!profile?.client_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { leadId } = await req.json() as { leadId?: string };
    if (!leadId) return NextResponse.json({ error: 'Falta leadId' }, { status: 400 });

    const service = createSupabaseServiceClient();
    const { data: deal, error: dealError } = await service
      .from('deals')
      .select('id, client_id, metadata')
      .eq('id', leadId)
      .eq('client_id', profile.client_id)
      .maybeSingle();
    if (dealError) throw new Error(dealError.message);
    if (!deal) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });

    const dismissedAt = new Date().toISOString();
    const metadata = { ...((deal.metadata as Record<string, unknown> | null) ?? {}), needs_reply_dismissed_at: dismissedAt };
    const { error } = await service.from('deals').update({ metadata }).eq('id', deal.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ dismissedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
