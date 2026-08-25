import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppAudio } from '@/lib/evolution';
import { resolveActiveInstance } from '@/lib/lead-instance';
import { whatsappMessageFields } from '@/lib/whatsapp-message-key';
import { insertMessageWithOptionalWhatsappKey } from '@/lib/insert-message';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { leadPhone, leadId, clientId, instance, audioBase64, duration, mimeType } = await req.json();

    if (!leadPhone || !leadId || !clientId || !instance || !audioBase64) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Send audio via Evolution API
    const activeInstance = await resolveActiveInstance(supabase, leadId, instance);
    const evolutionResponse = await sendWhatsAppAudio(activeInstance, leadPhone, audioBase64, clientId);

    // 2. Insert into messages table
    const { data: message, error: msgError } = await insertMessageWithOptionalWhatsappKey(
      supabase,
      {
        lead_id: leadId,
        client_id: clientId,
        role: 'human_agent',
        content: duration ? `Audio (${duration}s)` : 'Audio',
        was_audio: true,
        ...whatsappMessageFields(evolutionResponse),
      }
    );

    if (msgError) throw new Error(msgError.message);

    // 2b. Guardar el archivo de audio como attachment para poder reproducirlo
    // desde el chat (antes solo quedaba el texto "Audio (Ns)" y el audio del
    // vendedor se perdía). Best-effort: si Storage falla, el envío ya salió.
    try {
      const audioMime = typeof mimeType === 'string' && mimeType.startsWith('audio/')
        ? mimeType.split(';')[0]
        : 'audio/ogg';
      const ext = audioMime.includes('webm') ? 'webm' : audioMime.includes('mp4') ? 'm4a' : 'ogg';
      const storagePath = `${clientId}/${leadId}/outbound/${Date.now()}-audio.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(storagePath, Buffer.from(audioBase64, 'base64'), {
          contentType: audioMime,
          upsert: true,
        });
      if (uploadError) throw new Error(uploadError.message);

      const { error: attachmentError } = await supabase.from('message_attachments').insert({
        message_id: String((message as { id: string | number }).id),
        lead_id: leadId,
        client_id: clientId,
        storage_bucket: 'chat-attachments',
        storage_path: storagePath,
        media_type: 'audio',
        mime_type: audioMime,
        file_name: `audio-${duration ?? 0}s.${ext}`,
        duration_seconds: typeof duration === 'number' ? duration : null,
      });
      if (attachmentError) throw new Error(attachmentError.message);
    } catch (attachErr) {
      console.error('send-audio attachment save error:', attachErr);
    }

    // 3. Insert into n8n_chat_histories for bot context
    await supabase.from('n8n_chat_histories').insert({
      session_id: leadPhone,
      message: { type: 'ai', text: '[Audio enviado por el vendedor]' },
    });

    return NextResponse.json({ message });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
