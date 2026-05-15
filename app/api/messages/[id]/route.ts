import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';

async function getProfileClientId() {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('seller_profiles')
    .select('client_id')
    .eq('user_id', session.user.id)
    .single();

  if (!profile?.client_id) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 403 }) };
  }

  return { clientId: profile.client_id };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileClientId();
  if (profile.error) return profile.error;

  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  if (!content) {
    return NextResponse.json({ error: 'El mensaje no puede quedar vacío' }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('messages')
    .update({ content })
    .eq('id', params.id)
    .eq('client_id', profile.clientId)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Mensaje no encontrado' }, { status: error ? 500 : 404 });
  }

  return NextResponse.json({ message: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileClientId();
  if (profile.error) return profile.error;

  const service = createSupabaseServiceClient();
  const { data: message, error: findError } = await service
    .from('messages')
    .select('id')
    .eq('id', params.id)
    .eq('client_id', profile.clientId)
    .single();

  if (findError || !message) {
    return NextResponse.json({ error: findError?.message ?? 'Mensaje no encontrado' }, { status: findError ? 500 : 404 });
  }

  await service
    .from('message_attachments')
    .delete()
    .eq('message_id', params.id)
    .eq('client_id', profile.clientId);

  const { error } = await service
    .from('messages')
    .delete()
    .eq('id', params.id)
    .eq('client_id', profile.clientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
