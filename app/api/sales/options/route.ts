import { NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { getAirtableSellers } from '@/lib/airtable';

function normalizeName(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('seller_profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .single();

    if (!profile?.client_id) {
      return NextResponse.json({ sellers: [], defaultSellerId: null });
    }

    const service = createSupabaseServiceClient();
    const { data: profiles } = await service
      .from('seller_profiles')
      .select('name, airtable_seller_name')
      .eq('client_id', profile.client_id);

    const allowedNames = new Set(
      (profiles ?? [])
        .flatMap((seller) => [seller.airtable_seller_name, seller.name])
        .map(normalizeName)
        .filter(Boolean)
    );

    const airtableSellers = await getAirtableSellers();
    const filtered = airtableSellers.filter((seller) => {
      if (!seller.active) return false;
      if (!allowedNames.size) return true;
      return allowedNames.has(normalizeName(seller.name));
    });

    const sellers = filtered.length ? filtered : airtableSellers.filter((seller) => seller.active);
    const defaultName = normalizeName(profile.airtable_seller_name ?? profile.name);
    const defaultSeller = sellers.find((seller) => normalizeName(seller.name) === defaultName) ?? sellers[0] ?? null;

    return NextResponse.json({
      sellers: sellers.map((seller) => ({ id: seller.id, name: seller.name })),
      defaultSellerId: defaultSeller?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
