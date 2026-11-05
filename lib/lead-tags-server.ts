/** Consultas de etiquetas (ver lead-tags.ts). Reciben el service client: RLS no cubre estas tablas para escribir. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTagColor, type LeadTag } from './lead-tags';

type Service = SupabaseClient;

/** Roles del usuario en este cliente (tenant_members). */
export async function getTenantRoles(service: Service, userId: string, clientId: string): Promise<string[]> {
  const { data, error } = await service
    .from('tenant_members')
    .select('role')
    .eq('user_id', userId)
    .eq('client_id', clientId);
  if (error) return [];
  return ((data ?? []) as { role: string | null }[]).map((r) => String(r.role ?? '')).filter(Boolean);
}

function toTag(row: { id: string; name: string; color: string | null }): LeadTag {
  return { id: row.id, name: row.name, color: normalizeTagColor(row.color) ?? 'gray' };
}

/** Catálogo del cliente, por orden alfabético. Tira si la consulta falla. */
export async function listTags(service: Service, clientId: string): Promise<LeadTag[]> {
  const { data, error } = await service
    .from('lead_tags')
    .select('id, name, color')
    .eq('client_id', clientId)
    .order('name', { ascending: true });
  if (error) throw new Error(`Supabase lead_tags: ${error.message}`);
  return ((data ?? []) as { id: string; name: string; color: string | null }[]).map(toTag);
}

/**
 * Cuántos leads de ESTE vendedor tiene cada etiqueta, { [tag_id]: n }. Se
 * recorren las asignaciones de a 1000 (tope por respuesta de PostgREST); lo
 * normal es una sola página.
 */
export async function getTagCountsForSeller(service: Service, clientId: string, sellerId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .from('lead_tag_assignments')
      .select('tag_id, deals!inner(assigned_seller_id)')
      .eq('client_id', clientId)
      .eq('deals.assigned_seller_id', sellerId)
      .order('deal_id')
      .order('tag_id')
      .range(from, from + 999);
    if (error) throw new Error(`Supabase lead_tag_assignments: ${error.message}`);
    const rows = (data ?? []) as { tag_id: string }[];
    for (const row of rows) counts[row.tag_id] = (counts[row.tag_id] ?? 0) + 1;
    if (rows.length < 1000) return counts;
  }
}

/** Las etiquetas que tiene un lead ahora. */
export async function getTagIdsForDeal(service: Service, clientId: string, dealId: string): Promise<string[]> {
  const { data, error } = await service
    .from('lead_tag_assignments')
    .select('tag_id')
    .eq('deal_id', dealId)
    .eq('client_id', clientId);
  if (error) throw new Error(`Supabase lead_tag_assignments: ${error.message}`);
  return ((data ?? []) as { tag_id: string }[]).map((r) => r.tag_id);
}
