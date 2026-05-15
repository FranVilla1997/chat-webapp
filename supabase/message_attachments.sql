-- Soporte para reproducir/ver media de WhatsApp en SCALA Sentinel.
-- Ejecutar una vez en Supabase SQL Editor del proyecto de chat.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  52428800,
  array['audio/*', 'image/*', 'video/*', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  lead_id text not null,
  client_id text not null,
  storage_bucket text not null default 'chat-attachments',
  storage_path text not null,
  media_type text not null check (media_type in ('audio', 'image', 'video', 'document')),
  mime_type text not null,
  file_name text not null,
  caption text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists message_attachments_message_id_idx
  on public.message_attachments (message_id);

create index if not exists message_attachments_lead_client_idx
  on public.message_attachments (lead_id, client_id);

alter table public.message_attachments enable row level security;

drop policy if exists "Sellers can read own client attachments" on public.message_attachments;
create policy "Sellers can read own client attachments"
on public.message_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.seller_profiles sp
    where sp.user_id = auth.uid()
      and sp.client_id = message_attachments.client_id
  )
);
