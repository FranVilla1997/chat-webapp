import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { updateLeadFields } from '@/lib/airtable';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { recordId, resumeAt, clientId, airtableBaseId, airtableTableId } = await req.json() as {
      recordId?: string;
      resumeAt?: string;
      clientId?: string;
      airtableBaseId?: string;
      airtableTableId?: string;
    };
    if (!recordId || !resumeAt) {
      return NextResponse.json({ error: 'Missing recordId or resumeAt' }, { status: 400 });
    }

    const resumeDate = new Date(resumeAt);
    if (!Number.isFinite(resumeDate.getTime()) || resumeDate.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'La fecha de reactivación debe ser futura.' }, { status: 400 });
    }

    const pausedAt = new Date().toISOString();
    const pausedBy = session.user.email ?? session.user.id;
    await updateLeadFields(recordId, {
      bot_can_reply: false,
      bot_can_followup: false,
      bot_paused_at: pausedAt,
      bot_resume_at: resumeDate.toISOString(),
      bot_paused_by: pausedBy,
    }, {
      baseId: airtableBaseId,
      tableId: airtableTableId,
    });

    if (clientId) {
      const service = createSupabaseServiceClient();
      const { error: notificationError } = await service.from('lead_notifications').insert({
        record_id: recordId,
        client_id: clientId,
        action: 'bot_paused',
      });
      if (notificationError) console.error('bot pause notification insert error:', notificationError);
    }

    return NextResponse.json({
      ok: true,
      botPausedAt: pausedAt,
      botResumeAt: resumeDate.toISOString(),
      botPausedBy: pausedBy,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
