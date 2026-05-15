-- Guarda la key real de WhatsApp devuelta por Evolution API.
-- Necesario para editar o eliminar mensajes en WhatsApp desde SCALA.

alter table public.messages
  add column if not exists whatsapp_message_id text,
  add column if not exists whatsapp_remote_jid text,
  add column if not exists whatsapp_from_me boolean,
  add column if not exists whatsapp_message_key jsonb;

create index if not exists messages_whatsapp_message_id_idx
  on public.messages (whatsapp_message_id);
