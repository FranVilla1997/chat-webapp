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

  // En tandas de 500: PostgREST capa CUALQUIER respuesta (RPC incluido) en
  // 1000 filas — con la cartera entera en una sola llamada, los previews se
  // truncaban de nuevo (medido: 6366 leads → 1000 filas justas). Con ≤500
  // ids por llamada cada tanda queda lejos del cap, y van en paralelo.
  const CHUNK = 500;
  const chunks: string[][] = [];
  for (let i = 0; i < leadIds.length; i += CHUNK) chunks.push(leadIds.slice(i, i + CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) =>
      service.rpc('get_last_message_per_lead', { p_client_id: clientId, p_lead_ids: chunk }),
    ),
  );
  const rpcError = results.find((r) => r.error)?.error ?? null;
  if (!rpcError) {
    for (const r of results) {
      for (const m of (r.data ?? []) as Array<{ lead_id: string; role: string; content: string; created_at: string }>) {
        out[m.lead_id] = { content: m.content, role: m.role, created_at: m.created_at };
      }
    }
    return out;
  }

  console.log(JSON.stringify({ event: 'last_messages_rpc_fallback', error: rpcError.message ?? null }));
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
