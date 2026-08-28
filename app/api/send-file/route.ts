import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppMedia, type WhatsAppMediaType } from '@/lib/evolution';
import { resolveActiveInstance } from '@/lib/lead-instance';
import { authorizeLead } from '@/lib/authorize-lead';
import { whatsappMessageFields } from '@/lib/whatsapp-message-key';
import { insertMessageWithOptionalWhatsappKey } from '@/lib/insert-message';
import { sendErrorResponse, type SendErrorContext } from '@/lib/send-error';

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

function attachmentMediaType(mimeType: string): 'image' | 'video' | 'document' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

export async function POST(req: NextRequest) {
  const context: SendErrorContext = { route: 'send-file' };

  try {
    const body = await req.json() as {
      leadPhone?: string;
      leadId?: string;
      clientId?: string;
      instance?: string;
      caption?: string;
      storagePath?: string;
      fileName?: string;
      mimeType?: string;
    };
    const { instance, caption, storagePath, fileName, mimeType } = body;

    Object.assign(context, { leadId: body.leadId, clientId: body.clientId, instance, uiInstance: instance });

    if (!instance || !storagePath || !fileName || !mimeType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // El lead, su teléfono y el cliente salen de la base contra la sesión: del
    // body sólo se acepta a qué lead se le escribe.
    const auth = await authorizeLead(supabase, body.leadId, { leadPhone: body.leadPhone });
    if (!auth.ok) return auth.response;
    const { leadId, clientId, leadPhone } = auth.lead;
    Object.assign(context, { leadId, clientId });

    // Con clientId/leadId resueltos contra la sesión, este prefijo ya acota de
    // verdad qué archivo del bucket se puede firmar y mandar; antes el request
    // controlaba los dos lados de la comparación y cumplirla era trivial.
    if (!storagePath.startsWith(`${clientId}/${leadId}/`)) {
      return NextResponse.json({ error: 'Ruta de archivo inválida.' }, { status: 400 });
    }

    const { data: signed, error: signedError } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signedError || !signed?.signedUrl) throw new Error(signedError?.message ?? 'No se pudo generar URL del archivo.');

    const mediaType = mediaTypeFromMime(mimeType);
    const activeInstance = await resolveActiveInstance(supabase, leadId, instance);
    context.instance = activeInstance;
    const evolutionResponse = await sendWhatsAppMedia(activeInstance, leadPhone, {
      mediaUrl: signed.signedUrl,
      mediaType,
      mimeType,
      fileName,
      caption: caption?.trim() ?? '',
    }, clientId);

    const label = mediaType === 'image' ? 'Foto' : mediaType === 'video' ? 'Video' : 'Archivo';
    const content = caption?.trim() ? `${label}: ${caption.trim()}` : `${label} enviado: ${fileName}`;

    const { data: message, error: msgError } = await insertMessageWithOptionalWhatsappKey(
      supabase,
      {
        lead_id: leadId,
        client_id: clientId,
        role: 'human_agent',
        content,
        was_audio: false,
        ...whatsappMessageFields(evolutionResponse),
      }
    );

    if (msgError) throw new Error(msgError.message);

    const { data: attachment, error: attachmentError } = await supabase
      .from('message_attachments')
      .insert({
        message_id: String(message.id),
        lead_id: leadId,
        client_id: clientId,
        storage_bucket: ATTACHMENTS_BUCKET,
        storage_path: storagePath,
        media_type: attachmentMediaType(mimeType),
        mime_type: mimeType,
        file_name: fileName,
        caption: caption?.trim() || null,
      })
      .select()
      .single();

    if (attachmentError) {
      console.error('message_attachments insert error:', attachmentError);
    }

    await supabase.from('n8n_chat_histories').insert({
      session_id: leadPhone,
      message: { type: 'ai', text: `[${label} enviado por el vendedor]${caption?.trim() ? ` ${caption.trim()}` : ''}` },
    });

    return NextResponse.json({ message: attachment ? { ...message, attachments: [attachment] } : message });
  } catch (err) {
    return sendErrorResponse(err, context);
  }
}
