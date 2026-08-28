import { createSupabaseServerClient, createSupabaseServiceClient } from './supabase-server';
import type { SellerProfile } from './types';

export async function getSession() {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Resuelve el perfil de vendedor de la sesión actual.
//
// La búsqueda va con el service client y tolera duplicados, porque este lookup
// es el eslabón que convirtió dos incidentes en un loop de redirects
// (sesión OK + perfil null → /login → middleware → / → página → /login…):
//   - perfiles duplicados por login: .single()/.maybeSingle() con 2 filas da
//     error, no data (ya pasó — ver scripts/11-dedupe-seller-profiles.sql del
//     backend y el upsert de sellers que "resucitaba" perfiles);
//   - RLS: con el client de sesión, un cambio de políticas puede devolver 0
//     filas para TODOS los vendedores a la vez (ya pasó con
//     message_attachments el 7-8/08).
// La autorización no se debilita: el user_id sale de la sesión verificada.
export async function getSellerProfile(): Promise<SellerProfile | null> {
  const session = await getSession();
  if (!session) return null;

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('seller_profiles')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[auth] no se pudo resolver el seller_profile', {
      userId: session.user.id, error: error.message,
    });
    return null;
  }

  const rows = (data ?? []) as (SellerProfile & { active?: boolean | null })[];
  if (rows.length > 1) {
    console.error('[auth] seller_profile duplicado — usando el más apto', {
      userId: session.user.id, perfiles: rows.length,
    });
  }

  // Con duplicados: preferir un perfil activo; si no, el más viejo (el original).
  return rows.find((row) => row.active !== false) ?? rows[0] ?? null;
}
