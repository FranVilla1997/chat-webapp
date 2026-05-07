import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== process.env.AIRTABLE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { record_id?: string; client_id?: unknown; action?: string };
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

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
