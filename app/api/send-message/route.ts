import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/evolution';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { leadPhone, leadId, clientId, instance, text } = await req.json();

    if (!leadPhone || !leadId || !clientId || !instance || !text?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Send via Evolution API
    await sendWhatsAppMessage(instance, leadPhone, text.trim());

    // 2. Insert into messages table (lead_id = Airtable record ID)
    const { data: message, error: msgError } = await supabaseAdmin
      .from('messages')
      .insert({
        lead_id: leadId,
        client_id: clientId,
        role: 'human_agent',
        content: text.trim(),
        was_audio: false,
      })
      .select()
      .single();

    if (msgError) throw new Error(msgError.message);

    // 3. Insert into n8n_chat_histories (session_id = lead_phone without +)
    await supabaseAdmin.from('n8n_chat_histories').insert({
      session_id: leadPhone,
      message: { type: 'ai', text: text.trim() },
    });

    return NextResponse.json({ message });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
