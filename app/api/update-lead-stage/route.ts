import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { getPipelineStages, updateLeadStage } from '@/lib/airtable';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { recordId, stageId, stage, clientId } = await req.json() as {
    recordId?: string;
    stageId?: string;
    stage?: string;
    clientId?: string;
  };
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

  if (clientId) {
    const service = createSupabaseServiceClient();
    const now = new Date().toISOString();
    const event = {
      type: 'stage_updated',
      category: 'stage',
      title: 'Etapa actualizada',
      summary: selected.displayName,
      body: `El lead quedo en ${selected.displayName}.`,
      actor: 'humano',
      reason: 'Cambio manual realizado por un vendedor desde SCALA Sentinel.',
      createdAt: now,
    };
    const { error } = await service.from('messages').insert({
      lead_id: recordId,
      client_id: clientId,
      role: 'system',
      content: JSON.stringify(event),
      was_audio: false,
      created_at: now,
    });
    if (error) console.error('manual stage event insert error:', error);
  }

  return NextResponse.json({ ok: true, stage: selected });
}
