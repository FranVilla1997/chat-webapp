import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';

// Redirige al comprobante de una venta con URL firmada de corta duración.
// Puede verlo cualquier usuario logueado del mismo cliente (vendedores ven
// los suyos en Mis ventas; el dueño, todos).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = createSupabaseServerClient();
  const { data: { session } } = await auth.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await auth
    .from('seller_profiles')
    .select('client_id')
    .eq('user_id', session.user.id)
    .single();
  if (!profile?.client_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createSupabaseServiceClient();
  const { data: sale } = await service
    .from('sales')
    .select('id, client_id, receipt_storage_path')
    .eq('id', params.id)
    .eq('client_id', profile.client_id)
    .maybeSingle();

  if (!sale?.receipt_storage_path) {
    return NextResponse.json({ error: 'Esta venta no tiene comprobante adjunto.' }, { status: 404 });
  }

  const { data: signed, error } = await service.storage
    .from('chat-attachments')
    .createSignedUrl(sale.receipt_storage_path, 600);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: 'No se pudo generar el acceso al comprobante.' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
