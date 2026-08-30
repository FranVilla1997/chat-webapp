import type { SupabaseClient } from '@supabase/supabase-js';

export interface LastMessagePreview {
  content: string;
  role: string;
  created_at: string;
}

/**
 * Último mensaje por lead para los previews de la bandeja.
 *
 * Camino principal: RPC get_last_message_per_lead (scripts/20 del backend) —
 * una fila por lead, va por body (sin límite de URL) y SIN ventana temporal.
 * Antes esto se armaba con "los últimos 1000 mensajes del cliente" filtrados
 * en memoria: con el volumen actual eso es ~1-2 días de tráfico, y todo lead
 * sin actividad reciente aparecía como "Sin mensajes aún" aunque tuviera una
 * conversación de cientos de mensajes.
 *
 * Fallback: si el RPC todavía no está aplicado en la DB, cae al hack viejo
 * (ventana de 1000) para que el deploy no dependa del orden con la migración.
 */
export async function fetchLastMessages(
  service: SupabaseClient,
  clientId: string,
  leadIds: string[],
): Promise<Record<string, LastMessagePreview>> {
  const out: Record<string, LastMessagePreview> = {};
  if (!leadIds.length) return out;

  const { data, error } = await service.rpc('get_last_message_per_lead', {
    p_client_id: clientId,
    p_lead_ids: leadIds,
  });

  if (!error && Array.isArray(data)) {
    for (const m of data as Array<{ lead_id: string; role: string; content: string; created_at: string }>) {
      out[m.lead_id] = { content: m.content, role: m.role, created_at: m.created_at };
    }
    return out;
  }

  console.log(JSON.stringify({ event: 'last_messages_rpc_fallback', error: error?.message ?? null }));
  const requested = new Set(leadIds);
  const { data: msgs } = await service
    .from('messages')
    .select('lead_id, role, content, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1000);
  for (const msg of (msgs ?? []) as Array<{ lead_id: string; role: string; content: string; created_at: string }>) {
    if (requested.has(msg.lead_id) && !out[msg.lead_id]) {
      out[msg.lead_id] = { content: msg.content, role: msg.role, created_at: msg.created_at };
    }
  }
  return out;
}
