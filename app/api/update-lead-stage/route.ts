import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { getLeadById, getPipelineStages, updateLeadFields, updateLeadStage } from '@/lib/airtable';

function normalizeStage(stage?: string) {
  const value = String(stage ?? '').trim();
  const lower = value.toLowerCase();
  if (lower === 'propuesta_enviada' || lower === 'propuesta enviada') return 'propuesta enviada';
  return lower;
}

function isPausedLead(lead: Awaited<ReturnType<typeof getLeadById>>) {
  if (!lead) return false;

  const pausedAt = Boolean(lead.bot_paused_at.trim());
  const resumeAt = lead.bot_resume_at ? new Date(lead.bot_resume_at) : null;
  const hasFutureResume = Boolean(resumeAt && Number.isFinite(resumeAt.getTime()) && resumeAt.getTime() > Date.now());

  return pausedAt || hasFutureResume;
}

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
  const requestedStage = normalizeStage(stage);
  const selected = stageId
    ? stages.find((item) => item.id === stageId)
    : stages.find((item) => normalizeStage(item.name) === requestedStage || normalizeStage(item.displayName) === requestedStage);

  if (!selected) {
    return NextResponse.json({ error: 'Etapa no encontrada en Airtable' }, { status: 404 });
  }

  const leadBeforeUpdate = await getLeadById(recordId);

  await updateLeadStage(recordId, selected.id);
  if (normalizeStage(selected.name) === 'propuesta enviada' || normalizeStage(selected.displayName) === 'propuesta enviada') {
    if (!isPausedLead(leadBeforeUpdate)) {
      await updateLeadFields(recordId, { bot_can_followup: true });
    }
  }

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

    const { error: notificationError } = await service.from('lead_notifications').insert({
      record_id: recordId,
      client_id: clientId,
      action: 'stage_updated',
    });
    if (notificationError) console.error('manual stage notification insert error:', notificationError);
  }

  return NextResponse.json({ ok: true, stage: selected });
}
