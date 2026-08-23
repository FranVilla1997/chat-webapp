import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';

// Los adjuntos se leen por acá y no directo desde el navegador: RLS bloquea
// message_attachments para el rol del cliente, así que la consulta client-side
// devolvía [] y las fotos/videos de los leads desaparecían del chat.
export async function POST(req: NextRequest) {
  try {
    const auth = createSupabaseServerClient();
    const { data: { session } } = await auth.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = createSupabaseServiceClient();
    const { data: profile } = await service
      .from('seller_profiles')
      .select('client_id')
      .eq('user_id', session.user.id)
      .single();

    if (!profile?.client_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    const body = await req.json() as { messageIds?: unknown };
    const messageIds = Array.isArray(body.messageIds)
      ? body.messageIds.map((id) => String(id)).filter(Boolean).slice(0, 1000)
      : [];

    if (!messageIds.length) {
      return NextResponse.json({ attachments: [] });
    }

    const { data, error } = await service
      .from('message_attachments')
      .select('*')
      .eq('client_id', profile.client_id)
      .in('message_id', messageIds)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    return NextResponse.json({ attachments: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
