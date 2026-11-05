import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase-server';
import {
  getLeadForSeller,
  getLeadsPageForSeller,
  getRecentlyActiveLeadsForSeller,
  getStageCountsForSeller,
  resolveSellerByName,
  LEADS_PAGE_MAX,
  LEADS_PAGE_SIZE,
} from '@/lib/airtable';
import { getSellerProfile } from '@/lib/auth';
import { fetchLastMessages } from '@/lib/last-messages';
import { canManageTags, isUuid } from '@/lib/lead-tags';
import { getTagCountsForSeller, getTenantRoles, listTags } from '@/lib/lead-tags-server';

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Bandeja paginada del vendedor.
 *   ?stage=<etapa>   filtra por etapa (sin param = todas)
 *   ?q=<texto>       busca por nombre / nombre de WhatsApp / teléfono
 *   ?tag=<lead_tags.id>  sólo los leads con esa etiqueta manual (se combina con etapa y búsqueda)
 *   ?limit=&offset=  ventana (default 200, tope 1000)
 *   ?recent=0        sin los leads de actividad reciente (para "cargar más")
 *   ?id=<deal.id>    un lead puntual → { lead } (aviso de un lead no cargado)
 *
 * Devuelve la página, el total del filtro, los conteos por etapa para la
 * barra, los leads con actividad reciente (`recent`, de cualquier etapa: de
 * ahí sale "Sin responder"), el último mensaje de todos ellos, y el catálogo
 * de etiquetas del cliente con cuántos leads del vendedor tiene cada una.
 */
export async function GET(req: NextRequest) {
  // Mismo lookup que la página (service client + tolerancia a duplicados):
  // con el client de sesión y .single(), un perfil repetido dejaba la
  // respuesta vacía y el polling vaciaba la bandeja.
  const profile = await getSellerProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const empty = { leads: [], total: 0, counts: { all: 0 }, recent: [], lastMessages: {}, clientId: profile.client_id ?? '', tags: [], tagCounts: {}, canManageTags: false };
  if (!profile.airtable_seller_name) return NextResponse.json(empty);

  const seller = await resolveSellerByName(profile.airtable_seller_name);
  if (!seller) return NextResponse.json(empty);

  const { searchParams } = new URL(req.url);

  const id = searchParams.get('id');
  if (id) {
    const lead = await getLeadForSeller(seller, id);
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ lead });
  }

  const stageParam = (searchParams.get('stage') ?? '').trim();
  const stage = /^[\wáéíóúñÁÉÍÓÚÑ \-]{1,80}$/.test(stageParam) ? stageParam : null;
  const withRecent = searchParams.get('recent') !== '0';
  const tagParam = (searchParams.get('tag') ?? '').trim();
  const tagId = isUuid(tagParam) ? tagParam : null;
  const service = createSupabaseServiceClient();

  const [page, counts, recentAll, tags, tagCounts, roles] = await Promise.all([
    getLeadsPageForSeller(seller, {
      stage,
      search: searchParams.get('q'),
      tagId,
      limit: intParam(searchParams.get('limit'), LEADS_PAGE_SIZE, 1, LEADS_PAGE_MAX),
      offset: intParam(searchParams.get('offset'), 0, 0, 1_000_000),
    }),
    getStageCountsForSeller(seller),
    withRecent ? getRecentlyActiveLeadsForSeller(seller) : Promise.resolve([]),
    // Si las tablas de etiquetas fallan, la bandeja sale igual (sin etiquetas).
    listTags(service, seller.clientId).catch(() => []),
    getTagCountsForSeller(service, seller.clientId, seller.id).catch(() => ({} as Record<string, number>)),
    getTenantRoles(service, profile.user_id, seller.clientId),
  ]);

  // Los que ya vienen en la página no se mandan dos veces.
  const previewIds = new Set(page.leads.map((l) => l.RecordID));
  const recent = recentAll.filter((l) => !previewIds.has(l.RecordID));
  for (const l of recent) previewIds.add(l.RecordID);
  const lastMessages = await fetchLastMessages(service, seller.clientId, Array.from(previewIds));

  return NextResponse.json({
    leads: page.leads,
    total: page.total,
    counts,
    recent,
    lastMessages,
    clientId: profile.client_id,
    tags: tags.map((tag) => ({ ...tag, count: tagCounts[tag.id] ?? 0 })),
    tagCounts,
    canManageTags: canManageTags(roles),
  });
}
