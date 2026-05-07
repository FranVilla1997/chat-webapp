import { createSupabaseServerClient } from './supabase-server';
import type { SellerProfile } from './types';

export async function getSession() {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getSellerProfile(): Promise<SellerProfile | null> {
  const session = await getSession();
  if (!session) return null;

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('seller_profiles')
    .select('*')
    .eq('user_id', session.user.id)
    .single();

  return data ?? null;
}
