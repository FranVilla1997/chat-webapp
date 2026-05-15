import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase-server';
import type { MessageAttachmentMediaType } from '@/lib/types';

const ATTACHMENTS_BUCKET = 'chat-attachments';

interface InboundMediaPayload {
  leadId?: string;
  clientId?: string;
  role?: 'user' | 'assistant' | 'human_agent' | 'system';
  content?: string;
  mediaBase64?: string;
  mediaUrl?: string;
  mediaType?: MessageAttachmentMediaType | string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  durationSeconds?: number;
  createdAt?: string;
}

function safeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'archivo';
}

function mediaTypeFromMime(mimeType: string): MessageAttachmentMediaType {
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

function normalizeMediaType(value: string | undefined, mimeType: string): MessageAttachmentMediaType {
  const normalized = (value ?? '').toLowerCase();
  if (normalized.includes('audio')) return 'audio';
  if (normalized.includes('image') || normalized.includes('foto')) return 'image';
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('document') || normalized.includes('file') || normalized.includes('archivo')) return 'document';
  return mediaTypeFromMime(mimeType);
}

function defaultContent(mediaType: MessageAttachmentMediaType, caption?: string) {
  if (caption?.trim()) return caption.trim();
  if (mediaType === 'audio') return 'Audio recibido';
  if (mediaType === 'image') return 'Foto recibida';
  if (mediaType === 'video') return 'Video recibido';
  return 'Archivo recibido';
}

async function ensureBucket() {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase.storage.listBuckets();
  if (data?.some((bucket) => bucket.name === ATTACHMENTS_BUCKET)) {
    await supabase.storage.updateBucket(ATTACHMENTS_BUCKET, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: ['audio/*', 'image/*', 'video/*', 'application/pdf'],
    });
    return;
  }

  await supabase.storage.createBucket(ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: ['audio/*', 'image/*', 'video/*', 'application/pdf'],
  });
}

async function bytesFromPayload(payload: InboundMediaPayload) {
  if (payload.mediaBase64) {
    const base64 = payload.mediaBase64.includes(',')
      ? payload.mediaBase64.split(',').pop()!
      : payload.mediaBase64;
    return Buffer.from(base64, 'base64');
  }

  if (payload.mediaUrl) {
    const response = await fetch(payload.mediaUrl);
    if (!response.ok) throw new Error(`No se pudo descargar media entrante: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error('Missing mediaBase64 or mediaUrl');
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.N8N_MEDIA_WEBHOOK_SECRET ?? process.env.AIRTABLE_WEBHOOK_SECRET;
  const secret = req.headers.get('x-webhook-secret');
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await req.json() as InboundMediaPayload;
    const { leadId, clientId } = payload;
    const mimeType = payload.mimeType ?? 'application/octet-stream';
    const mediaType = normalizeMediaType(payload.mediaType, mimeType);
    const fileName = safeFileName(payload.fileName ?? `${mediaType}-${Date.now()}`);

    if (!leadId || !clientId) {
      return NextResponse.json({ error: 'Missing leadId or clientId' }, { status: 400 });
    }

    await ensureBucket();

    const bytes = await bytesFromPayload(payload);
    const storagePath = `${clientId}/${leadId}/inbound/${Date.now()}-${fileName}`;
    const supabase = createSupabaseServiceClient();

    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, bytes, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: leadId,
        client_id: clientId,
        role: payload.role ?? 'user',
        content: payload.content?.trim() || defaultContent(mediaType, payload.caption),
        was_audio: mediaType === 'audio',
        ...(payload.createdAt ? { created_at: payload.createdAt } : {}),
      })
      .select()
      .single();

    if (messageError) throw new Error(messageError.message);

    const { data: attachment, error: attachmentError } = await supabase
      .from('message_attachments')
      .insert({
        message_id: String(message.id),
        lead_id: leadId,
        client_id: clientId,
        storage_bucket: ATTACHMENTS_BUCKET,
        storage_path: storagePath,
        media_type: mediaType,
        mime_type: mimeType,
        file_name: fileName,
        caption: payload.caption?.trim() || null,
        duration_seconds: payload.durationSeconds ?? null,
      })
      .select()
      .single();

    if (attachmentError) throw new Error(attachmentError.message);

    return NextResponse.json({ message: { ...message, attachments: [attachment] } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
