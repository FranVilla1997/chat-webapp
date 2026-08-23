import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { hasCrmAccess } from '@/lib/crm-access';

export default async function Home() {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  // El dueño (rol owner/admin en tenant_members) aterriza en el CRM;
  // los vendedores, en su bandeja de chats.
  redirect((await hasCrmAccess(session.user.id)) ? '/crm' : '/chats');
}
