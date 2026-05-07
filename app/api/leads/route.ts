import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getLeadsBySellerName } from '@/lib/airtable';

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('seller_profiles')
    .select('*')
    .eq('user_id', session.user.id)
    .single();

  if (!profile?.airtable_seller_name) {
    return NextResponse.json({ leads: [], clientId: profile?.client_id ?? '' });
  }

  const leads = await getLeadsBySellerName(profile.airtable_seller_name);
  return NextResponse.json({ leads, clientId: profile.client_id });
}
