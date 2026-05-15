import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppAudio } from '@/lib/evolution';
import { whatsappMessageFields } from '@/lib/whatsapp-message-key';
import { insertMessageWithOptionalWhatsappKey } from '@/lib/insert-message';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { leadPhone, leadId, clientId, instance, audioBase64, duration } = await req.json();

    if (!leadPhone || !leadId || !clientId || !instance || !audioBase64) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Send audio via Evolution API
    const evolutionResponse = await sendWhatsAppAudio(instance, leadPhone, audioBase64, clientId);

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
