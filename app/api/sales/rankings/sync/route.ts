import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { currentArgentinaMonthKey, syncSellerRankingMonth } from '@/lib/airtable';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({})) as { month?: string };
    const month = /^\d{4}-\d{2}$/.test(String(body.month ?? ''))
      ? String(body.month)
      : currentArgentinaMonthKey();

    const ranking = await syncSellerRankingMonth(month);
    return NextResponse.json({ ok: true, month, ranking });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
