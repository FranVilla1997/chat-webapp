import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getPipelineStages, updateLeadStage } from '@/lib/airtable';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { recordId, stageId, stage } = await req.json() as { recordId?: string; stageId?: string; stage?: string };
  if (!recordId || (!stageId && !stage)) {
    return NextResponse.json({ error: 'Missing recordId or stage' }, { status: 400 });
  }

  const stages = await getPipelineStages();
  const selected = stageId
    ? stages.find((item) => item.id === stageId)
    : stages.find((item) => item.name === stage || item.displayName === stage);

  if (!selected) {
    return NextResponse.json({ error: 'Etapa no encontrada en Airtable' }, { status: 404 });
  }

  await updateLeadStage(recordId, selected.id);
  return NextResponse.json({ ok: true, stage: selected });
}
