import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/evolution';
import { whatsappMessageFields } from '@/lib/whatsapp-message-key';
import { insertMessageWithOptionalWhatsappKey } from '@/lib/insert-message';
import { resolveActiveInstance } from '@/lib/lead-instance';
import { authorizeLead } from '@/lib/authorize-lead';
import { sendErrorResponse, type SendErrorContext } from '@/lib/send-error';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  // Se llena a medida que avanza el request para que el catch pueda loguear con
  // qué lead e instancia falló.
  const context: SendErrorContext = { route: 'send-message' };

  try {
    const body = await req.json();
    const { instance, text } = body;
    Object.assign(context, { leadId: body.leadId, clientId: body.clientId, instance, uiInstance: instance });

    if (!instance || !text?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // El lead, su teléfono y el cliente salen de la base contra la sesión: del
    // body sólo se acepta a qué lead se le escribe.
    const auth = await authorizeLead(supabaseAdmin, body.leadId, { leadPhone: body.leadPhone });
    if (!auth.ok) return auth.response;
    const { leadId, clientId, leadPhone } = auth.lead;
    Object.assign(context, { leadId, clientId });

    // 1. Send via Evolution API por la línea activa del lead
    const activeInstance = await resolveActiveInstance(supabaseAdmin, leadId, instance);
    context.instance = activeInstance;
    const evolutionResponse = await sendWhatsAppMessage(activeInstance, leadPhone, text.trim(), clientId);

    // 2. Insert into messages table (lead_id = Airtable record ID)
    const { data: message, error: msgError } = await insertMessageWithOptionalWhatsappKey(
      supabaseAdmin,
      {
        lead_id: leadId,
        client_id: clientId,
        role: 'human_agent',
        content: text.trim(),
        was_audio: false,
        ...whatsappMessageFields(evolutionResponse),
      }
    );

    if (msgError) throw new Error(msgError.message);

    // 3. Insert into n8n_chat_histories (session_id = lead_phone without +)
    await supabaseAdmin.from('n8n_chat_histories').insert({
      session_id: leadPhone,
      message: { type: 'ai', text: text.trim() },
    });

    return NextResponse.json({ message });
  } catch (err) {
    return sendErrorResponse(err, context);
  }
}
