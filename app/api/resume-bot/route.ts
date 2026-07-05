import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { getLeadById, updateLeadFields } from '@/lib/airtable';
import { isTerminalStage } from '@/lib/stage-rules';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { recordId, clientId, airtableBaseId, airtableTableId } = await req.json() as {
      recordId?: string;
      clientId?: string;
      airtableBaseId?: string;
      airtableTableId?: string;
    };
    if (!recordId) {
      return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
    }

    const lead = await getLeadById(recordId, {
      baseId: airtableBaseId,
      tableId: airtableTableId,
    });
    if (isTerminalStage(lead?.current_stage)) {
      await updateLeadFields(recordId, {
        bot_can_reply: false,
        bot_can_followup: false,
        bot_paused_at: null,
        bot_resume_at: null,
        bot_paused_by: '',
      }, {
        baseId: airtableBaseId,
        tableId: airtableTableId,
      });

      if (clientId) {
        const service = createSupabaseServiceClient();
        const { error: notificationError } = await service.from('lead_notifications').insert({
          record_id: recordId,
          client_id: clientId,
          action: 'bot_resume_blocked_terminal',
        });
        if (notificationError) console.error('bot terminal resume notification insert error:', notificationError);
      }

      return NextResponse.json({ error: 'El lead esta cerrado. No corresponde reanudar el bot ni los seguimientos.' }, { status: 409 });
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

    if (clientId) {
      const service = createSupabaseServiceClient();
      const { error: notificationError } = await service.from('lead_notifications').insert({
        record_id: recordId,
        client_id: clientId,
        action: 'bot_resumed',
      });
      if (notificationError) console.error('bot resume notification insert error:', notificationError);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
