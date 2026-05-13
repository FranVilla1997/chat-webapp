import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppMedia, type WhatsAppMediaType } from '@/lib/evolution';

const ATTACHMENTS_BUCKET = 'chat-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function mediaTypeFromMime(mimeType: string): WhatsAppMediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

export async function POST(req: NextRequest) {
  try {
    const { leadPhone, leadId, clientId, instance, caption, storagePath, fileName, mimeType } = await req.json() as {
      leadPhone?: string;
      leadId?: string;
      clientId?: string;
      instance?: string;
      caption?: string;
      storagePath?: string;
      fileName?: string;
      mimeType?: string;
    };

    if (!leadPhone || !leadId || !clientId || !instance || !storagePath || !fileName || !mimeType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!storagePath.startsWith(`${clientId}/${leadId}/`)) {
      return NextResponse.json({ error: 'Ruta de archivo inválida.' }, { status: 400 });
    }

    const { data: signed, error: signedError } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signedError || !signed?.signedUrl) throw new Error(signedError?.message ?? 'No se pudo generar URL del archivo.');

    const mediaType = mediaTypeFromMime(mimeType);
    await sendWhatsAppMedia(instance, leadPhone, {
      mediaUrl: signed.signedUrl,
      mediaType,
      mimeType,
      fileName,
      caption: caption?.trim() ?? '',
    });

    const label = mediaType === 'image' ? 'Foto' : mediaType === 'video' ? 'Video' : 'Archivo';
    const content = caption?.trim() ? `${label}: ${caption.trim()}` : `${label} enviado: ${fileName}`;

    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        lead_id: leadId,
        client_id: clientId,
        role: 'human_agent',
        content,
        was_audio: false,
      })
      .select()
      .single();

    if (msgError) throw new Error(msgError.message);

    await supabase.from('n8n_chat_histories').insert({
      session_id: leadPhone,
      message: { type: 'ai', text: `[${label} enviado por el vendedor]${caption?.trim() ? ` ${caption.trim()}` : ''}` },
    });

    return NextResponse.json({ message });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
