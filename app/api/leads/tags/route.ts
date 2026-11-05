import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase-server';
import { getSellerProfile, getSession } from '@/lib/auth';
import { resolveSellerByName } from '@/lib/airtable';
import { canManageTags, isUuid } from '@/lib/lead-tags';
import { getTagIdsForDeal, getTenantRoles } from '@/lib/lead-tags-server';

/**
 * POST /api/leads/tags  { dealId, tagId, action: 'add' | 'remove' }
 * Pone o saca una etiqueta de un lead. No toca el deal (ni su etapa ni su
 * updated_at): sólo la tabla de asignaciones.
 *
 * Permisos: el lead tiene que ser del cliente de la sesión y estar asignado a
 * este vendedor (lo mismo que ve en su bandeja), salvo owner/admin/manager.
 * Devuelve las etiquetas con las que quedó el lead: { tagIds }.
 */
export async function POST(req: NextRequest) {
  const profile = await getSellerProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { dealId?: unknown; tagId?: unknown; action?: unknown };
  const { dealId, tagId, action } = body;
  if (!isUuid(dealId) || !isUuid(tagId) || (action !== 'add' && action !== 'remove')) {
    return NextResponse.json({ error: 'Pedido no válido' }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const [dealRes, tagRes, seller, roles] = await Promise.all([
    service.from('deals').select('id, assigned_seller_id').eq('id', dealId).eq('client_id', profile.client_id).maybeSingle(),
    service.from('lead_tags').select('id').eq('id', tagId).eq('client_id', profile.client_id).maybeSingle(),
    profile.airtable_seller_name ? resolveSellerByName(profile.airtable_seller_name) : Promise.resolve(null),
    getTenantRoles(service, profile.user_id, profile.client_id),
  ]);
  if (dealRes.error || tagRes.error) {
    return NextResponse.json({ error: (dealRes.error ?? tagRes.error)!.message }, { status: 500 });
  }
  const deal = dealRes.data as { id: string; assigned_seller_id: string | null } | null;
  // Mismo 404 para "no existe" y "no es tuyo": no conviene que la ruta sirva para enumerar leads ajenos.
  const visible = Boolean(deal) && (canManageTags(roles) || (Boolean(seller) && deal!.assigned_seller_id === seller!.id));
  if (!deal || !visible) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
  if (!tagRes.data) return NextResponse.json({ error: 'Esa etiqueta ya no existe' }, { status: 404 });

  const session = await getSession();
  if (action === 'add') {
    // Si ya la tenía no se pisa: queda la fecha en que se la pusieron primero.
    const { error } = await service.from('lead_tag_assignments').upsert(
      { deal_id: dealId, tag_id: tagId, client_id: profile.client_id, tagged_by: session?.user.email ?? profile.user_id },
      { onConflict: 'deal_id,tag_id', ignoreDuplicates: true },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await service
      .from('lead_tag_assignments')
      .delete()
      .eq('deal_id', dealId)
      .eq('tag_id', tagId)
      .eq('client_id', profile.client_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    return NextResponse.json({ tagIds: await getTagIdsForDeal(service, profile.client_id, dealId) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo leer el lead' }, { status: 500 });
  }
}
