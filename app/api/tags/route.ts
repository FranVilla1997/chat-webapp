import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase-server';
import { getSellerProfile, getSession } from '@/lib/auth';
import { resolveSellerByName } from '@/lib/airtable';
import { canManageTags, MAX_TAGS_PER_CLIENT, normalizeTagColor, normalizeTagName, TAG_COLORS, TAG_NAME_MAX } from '@/lib/lead-tags';
import { getTagCountsForSeller, getTenantRoles, listTags } from '@/lib/lead-tags-server';

/**
 * GET /api/tags
 * Catálogo de etiquetas del cliente con cuántos leads del vendedor tiene cada
 * una, y qué puede hacer el usuario (canManage = renombrar / borrar; crear y
 * poner puede cualquiera, ver lib/lead-tags.ts).
 */
export async function GET() {
  const profile = await getSellerProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const service = createSupabaseServiceClient();
    const seller = profile.airtable_seller_name ? await resolveSellerByName(profile.airtable_seller_name) : null;
    const [tags, counts, roles] = await Promise.all([
      listTags(service, profile.client_id),
      seller ? getTagCountsForSeller(service, profile.client_id, seller.id) : Promise.resolve({} as Record<string, number>),
      getTenantRoles(service, profile.user_id, profile.client_id),
    ]);
    return NextResponse.json({
      tags: tags.map((tag) => ({ ...tag, count: counts[tag.id] ?? 0 })),
      canManage: canManageTags(roles),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron cargar las etiquetas';
    console.error('GET /api/tags:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/tags  { name, color? }
 * Crea una etiqueta en el catálogo del cliente. Sin color, toma el primero de
 * la paleta que todavía no se usa.
 */
export async function POST(req: NextRequest) {
  const profile = await getSellerProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; color?: unknown };
  const name = normalizeTagName(body.name);
  if (!name) {
    return NextResponse.json({ error: `El nombre es obligatorio y puede tener hasta ${TAG_NAME_MAX} caracteres` }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { data: existing, error: listErr } = await service
    .from('lead_tags')
    .select('name, color')
    .eq('client_id', profile.client_id);
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const current = (existing ?? []) as { name: string; color: string }[];
  if (current.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: 'Ya existe una etiqueta con ese nombre' }, { status: 409 });
  }
  if (current.length >= MAX_TAGS_PER_CLIENT) {
    return NextResponse.json({ error: `Llegaron al tope de ${MAX_TAGS_PER_CLIENT} etiquetas. Pedile al dueño que borre alguna que no se use.` }, { status: 400 });
  }

  const used = new Set(current.map((t) => t.color));
  const color = normalizeTagColor(body.color) ?? TAG_COLORS.find((c) => !used.has(c)) ?? TAG_COLORS[current.length % TAG_COLORS.length];
  const session = await getSession();

  const { data, error } = await service
    .from('lead_tags')
    .insert({ client_id: profile.client_id, name, color, created_by: session?.user.email ?? profile.user_id })
    .select('id, name, color')
    .single();
  if (error) {
    // 23505: otro usuario la creó entre el chequeo y el insert.
    if (error.code === '23505') return NextResponse.json({ error: 'Ya existe una etiqueta con ese nombre' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tag: { ...(data as { id: string; name: string; color: string }), count: 0 } });
}
