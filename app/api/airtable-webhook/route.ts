import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== process.env.AIRTABLE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    record_id?: string;
    client_id?: unknown;
    action?: string;
    event_message?: string;
    message?: string;
    event_type?: string;
    stage?: string;
    field_label?: string;
    field_value?: string;
  };
  const { record_id, action = 'created' } = body;

  // Airtable linked record fields come as ["recXXX"] — normalize to plain string
  let client_id: string | undefined;
  if (Array.isArray(body.client_id)) {
    client_id = body.client_id[0] as string;
  } else if (typeof body.client_id === 'string') {
    // Handle JSON-stringified array e.g. '["recXXX"]'
    try {
      const parsed = JSON.parse(body.client_id);
      client_id = Array.isArray(parsed) ? parsed[0] : body.client_id;
    } catch {
      client_id = body.client_id;
    }
  }

  if (!record_id || !client_id) {
    return NextResponse.json({ error: 'Missing record_id or client_id' }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from('lead_notifications')
    .insert({ record_id, client_id, action });

  if (error) {
    console.error('lead_notifications insert error:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  const eventMessage = body.event_message || body.message || buildEventMessage(body);
  if (eventMessage) {
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: record_id,
        client_id,
        role: 'system',
        content: eventMessage,
        was_audio: false,
      });

    if (messageError) {
      console.error('sentinel event message insert error:', messageError);
    }
  }

  return NextResponse.json({ ok: true });
}

function buildEventMessage(body: {
  action?: string;
  event_type?: string;
  stage?: string;
  field_label?: string;
  field_value?: string;
}) {
  const action = body.event_type || body.action;
  if (action === 'stage_updated' && body.stage) {
    return `Etapa actualizada: ${body.stage}`;
  }
  if (action === 'data_collected' && body.field_label && body.field_value) {
    return `Información recabada: ${body.field_label}: ${body.field_value}`;
  }
  if (action === 'qualified') {
    return 'Lead calificado por Sentinel.';
  }
  return '';
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
