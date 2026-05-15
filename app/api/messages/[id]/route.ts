import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import {
  deleteWhatsAppMessageForEveryone,
  updateWhatsAppMessage,
  type EvolutionMessageKey,
} from '@/lib/evolution';

type StoredMessage = {
  id: string | number;
  role: string;
  client_id: string;
  whatsapp_message_id?: string | null;
  whatsapp_remote_jid?: string | null;
  whatsapp_from_me?: boolean | null;
  whatsapp_message_key?: EvolutionMessageKey | null;
};

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

function whatsappKeyFromMessage(message: StoredMessage): EvolutionMessageKey | null {
  if (message.whatsapp_message_key?.id && message.whatsapp_message_key.remoteJid) {
    return message.whatsapp_message_key;
  }

  if (!message.whatsapp_message_id || !message.whatsapp_remote_jid) return null;
  return {
    id: message.whatsapp_message_id,
    remoteJid: message.whatsapp_remote_jid,
    fromMe: message.whatsapp_from_me ?? true,
  };
}

function whatsappSyncInput(body: unknown) {
  const input = body as { leadPhone?: unknown; instance?: unknown };
  return {
    leadPhone: typeof input.leadPhone === 'string' ? input.leadPhone : '',
    instance: typeof input.instance === 'string' ? input.instance : '',
  };
}

async function findMessage(id: string, clientId: string) {
  const service = createSupabaseServiceClient();
  return service
    .from('messages')
    .select('*')
    .eq('id', id)
    .eq('client_id', clientId)
    .single();
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileClientId();
  if (profile.error) return profile.error;

  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const { leadPhone, instance } = whatsappSyncInput(body);

  if (!content) {
    return NextResponse.json({ error: 'El mensaje no puede quedar vacio' }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { data: message, error: findError } = await findMessage(params.id, profile.clientId);

  if (findError || !message) {
    return NextResponse.json({ error: findError?.message ?? 'Mensaje no encontrado' }, { status: findError ? 500 : 404 });
  }

  if (message.role !== 'human_agent') {
    return NextResponse.json({ error: 'Solo se pueden editar en WhatsApp los mensajes enviados por el vendedor.' }, { status: 409 });
  }

  const key = whatsappKeyFromMessage(message as StoredMessage);
  if (!key || !leadPhone || !instance) {
    return NextResponse.json({
      error: 'Este mensaje no tiene ID de WhatsApp guardado. Solo los mensajes nuevos enviados desde SCALA se pueden editar en WhatsApp.',
    }, { status: 409 });
  }

  await updateWhatsAppMessage(instance, leadPhone, key, content, profile.clientId);

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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileClientId();
  if (profile.error) return profile.error;

  const body = await req.json().catch(() => ({}));
  const { instance } = whatsappSyncInput(body);
  const service = createSupabaseServiceClient();
  const { data: message, error: findError } = await findMessage(params.id, profile.clientId);

  if (findError || !message) {
    return NextResponse.json({ error: findError?.message ?? 'Mensaje no encontrado' }, { status: findError ? 500 : 404 });
  }

  if (message.role !== 'human_agent') {
    return NextResponse.json({ error: 'Solo se pueden eliminar en WhatsApp los mensajes enviados por el vendedor.' }, { status: 409 });
  }

  const key = whatsappKeyFromMessage(message as StoredMessage);
  if (!key || !instance) {
    return NextResponse.json({
      error: 'Este mensaje no tiene ID de WhatsApp guardado. Solo los mensajes nuevos enviados desde SCALA se pueden eliminar en WhatsApp.',
    }, { status: 409 });
  }

  await deleteWhatsAppMessageForEveryone(instance, key, profile.clientId);

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
