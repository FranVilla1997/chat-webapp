import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { hasCrmAccess } from '@/lib/crm-access';

const PAYMENT_METHODS = new Set(['Transferencia', 'Tarjeta', 'Efectivo', 'Cheque', 'Otro']);
const SALE_STATUSES = new Set(['Confirmada', 'Pendiente de pago', 'Cancelada']);

// Edición/eliminación de ventas: SOLO dueño (rol owner/admin). Los vendedores
// registran, el dueño corrige — así el ranking y las comisiones no se tocan
// sin control.
async function requireOwner() {
  const auth = createSupabaseServerClient();
  const { data: { session } } = await auth.auth.getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  if (!(await hasCrmAccess(session.user.id))) {
    return { error: NextResponse.json({ error: 'Solo el dueño puede modificar ventas.' }, { status: 403 }) };
  }

  const { data: profile } = await auth
    .from('seller_profiles')
    .select('client_id')
    .eq('user_id', session.user.id)
    .single();
  if (!profile?.client_id) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };

  return { clientId: profile.client_id as string };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const gate = await requireOwner();
    if ('error' in gate) return gate.error;

    const body = await req.json() as {
      description?: string;
      amount?: number | string;
      purchaseDate?: string;
      paymentMethod?: string;
      status?: string;
      sellerRecordId?: string | null;
    };

    const updates: Record<string, unknown> = {};

    if (body.description !== undefined) updates.notes = String(body.description).trim();

    if (body.amount !== undefined) {
      const match = String(body.amount).match(/-?[0-9][0-9.,]*/);
      let token = match ? match[0] : '';
      const lastComma = token.lastIndexOf(',');
      const lastDot = token.lastIndexOf('.');
      if (lastComma > lastDot) token = token.replace(/\./g, '').replace(',', '.');
      else if (lastDot > -1 && lastComma > -1) token = token.replace(/,/g, '');
      else if (lastDot > -1 && token.length - lastDot - 1 === 3 && token.split('.').length === 2) token = token.replace(/\./g, '');
      const amount = Number(token.replace(/,/g, ''));
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Monto inválido.' }, { status: 400 });
      }
      updates.amount = amount;
    }

    if (body.purchaseDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.purchaseDate))) {
        return NextResponse.json({ error: 'Fecha inválida.' }, { status: 400 });
      }
      updates.created_at = `${body.purchaseDate}T12:00:00Z`;
    }

    if (body.paymentMethod !== undefined) {
      if (!PAYMENT_METHODS.has(String(body.paymentMethod))) {
        return NextResponse.json({ error: 'Método de pago inválido.' }, { status: 400 });
      }
      updates.payment_method = String(body.paymentMethod).toLowerCase();
    }

    if (body.status !== undefined) {
      const status = String(body.status);
      if (!SALE_STATUSES.has(status)) {
        return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
      }
      updates.payment_status = status === 'Confirmada' ? 'confirmed' : status === 'Cancelada' ? 'cancelled' : 'pending';
      updates.confirmed_at = status === 'Confirmada' ? new Date().toISOString() : null;
    }

    if (body.sellerRecordId !== undefined) {
      updates.seller_id = body.sellerRecordId ? String(body.sellerRecordId) : null;
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'Nada para actualizar.' }, { status: 400 });
    }

    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from('sales')
      .update(updates)
      .eq('id', params.id)
      .eq('client_id', gate.clientId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Venta no encontrada.' }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const gate = await requireOwner();
    if ('error' in gate) return gate.error;

    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from('sales')
      .delete()
      .eq('id', params.id)
      .eq('client_id', gate.clientId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Venta no encontrada.' }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
