import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { updateLeadFields } from '@/lib/airtable';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { recordId, stage } = await req.json() as { recordId?: string; stage?: string };
  if (!recordId || !stage) {
    return NextResponse.json({ error: 'Missing recordId or stage' }, { status: 400 });
  }

  await updateLeadFields(recordId, { current_stage: stage });
  return NextResponse.json({ ok: true });
}
