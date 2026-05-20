import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { updateLeadFields } from '@/lib/airtable';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { recordId, airtableBaseId, airtableTableId } = await req.json() as {
      recordId?: string;
      airtableBaseId?: string;
      airtableTableId?: string;
    };
    if (!recordId) {
      return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
    }

    await updateLeadFields(recordId, {
      bot_can_reply: true,
      bot_can_followup: true,
      bot_paused_at: null,
      bot_resume_at: null,
      bot_paused_by: '',
    }, {
      baseId: airtableBaseId,
      tableId: airtableTableId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
