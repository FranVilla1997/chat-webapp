import type { SupabaseClient } from '@supabase/supabase-js';

// Resuelve la línea (instancia Evolution) ACTIVA de un lead al momento de enviar:
// la última por la que escribió, que el backend de Sentinel mantiene en
// deal.metadata.source_instance en cada mensaje entrante. La UI manda la
// instancia que tenía cargada al abrir el chat, que queda vieja si el lead
// cambió de línea con la conversación abierta — por eso se resuelve acá.
export async function resolveActiveInstance(
  supabase: SupabaseClient,
  leadId: string,
  fallback: string,
): Promise<string> {
  try {
    const { data } = await supabase
      .from('deals')
      .select('metadata')
      .eq('id', leadId)
      .maybeSingle();
    const source = (data?.metadata as Record<string, unknown> | null | undefined)?.source_instance;
    if (typeof source === 'string' && source.trim()) return source.trim();
  } catch {
    // sin deal o error transitorio → usamos lo que mandó la UI
  }
  return fallback;
}
