import { createSupabaseServerClient, createSupabaseServiceClient } from './supabase-server';

// Acceso al CRM: SOLO usuarios con rol owner/admin en `tenant_members` — el
// mismo boundary de autorización que usa el dashboard de Sentinel (misma
// cuenta, mismo Supabase Auth). Reemplaza al esquema anterior de contraseña
// compartida + cookie firmada: una contraseña compartida puede filtrarse a
// los vendedores; el rol no.
const CRM_ROLES = new Set(['owner', 'admin']);

export async function hasCrmAccess(userId: string): Promise<boolean> {
  if (!userId) return false;

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('tenant_members')
    .select('role')
    .eq('user_id', userId);

  if (error) return false;
  return (data ?? []).some((row) => CRM_ROLES.has(String((row as { role: string | null }).role ?? '')));
}

export async function getCrmAccessState() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return {
    session,
    allowed: session ? await hasCrmAccess(session.user.id) : false,
  };
}
