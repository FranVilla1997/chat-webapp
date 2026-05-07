import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { updateLeadFields } from '@/lib/airtable';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { recordId, stageRecordId } = await req.json() as { recordId?: string; stageRecordId?: string };
  if (!recordId || !stageRecordId) {
    return NextResponse.json({ error: 'Missing recordId or stageRecordId' }, { status: 400 });
  }

  await updateLeadFields(recordId, { current_stage: [stageRecordId] });
  return NextResponse.json({ ok: true });
}
