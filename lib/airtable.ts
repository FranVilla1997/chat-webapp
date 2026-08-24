// Capa de datos de leads/ventas/etapas/vendedores.
//
// Desde el corte de Airtable (2026-07-14) esta capa lee y escribe las tablas de
// Sentinel en Supabase (deals + contacts + pipeline_stages + seller_profiles +
// sales). Se conservan las firmas y shapes históricos (AirtableLead, etc.) para
// no tocar el resto de la app: `RecordID` ahora es el UUID del deal, que es el
// mismo valor que usan messages/followup_queue/message_attachments como lead_id.
//
// Los IDs legacy `rec...` de Airtable siguen resolviendo vía deals.external_lead_id
// (links viejos a /conversation).
import { createSupabaseServiceClient } from './supabase-server';
import type { AirtableLead, AirtableSale, AirtableSaleAttachment, SellerRankingEntry } from './types';

const DEFAULT_CLIENT_ID = process.env.SENTINEL_CLIENT_ID || 'rece0aEMD5iowEALZ';

export interface AirtableSource {
  baseId?: string;
  tableId?: string;
}

export interface AirtableSeller {
  id: string;
  name: string;
  active: boolean;
}

export interface AirtableStage {
  id: string;
  name: string;
  displayName: string;
  order: number;
}

export interface CreateSaleInput {
  leadRecordId?: string;
  sellerRecordId?: string;
  description: string;
  amount: number;
  purchaseDate: string;
  paymentMethod: 'Transferencia' | 'Tarjeta' | 'Efectivo' | 'Cheque' | 'Otro';
  status?: 'Confirmada' | 'Pendiente de pago' | 'Cancelada';
  observations?: string;
  receipts?: {
    url: string;
    filename: string;
    storagePath?: string;
  }[];
}

// ────────────────────────────────────────────────────────────────
// Filas Supabase
// ────────────────────────────────────────────────────────────────

interface DealRow {
  id: string;
  client_id: string;
  contact_id: string;
  stage: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  bot_can_reply: boolean | null;
  bot_can_followup: boolean | null;
  bot_paused_by: string | null;
  bot_paused_until: string | null;
  score: string | number | null;
  qualified: boolean | null;
  last_message_at: string | null;
  last_message_from: string | null;
  followup_count: number | null;
  assigned_seller_id: string | null;
  won_amount: number | null;
  external_lead_id: string | null;
  contacts?: ContactRow | null;
}

interface ContactRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string | null;
}

interface SellerRow {
  id: string;
  client_id: string;
  name: string | null;
  airtable_seller_name: string | null;
  active: boolean | null;
}

interface SaleRow {
  id: string;
  client_id: string;
  deal_id: string | null;
  seller_id: string | null;
  amount: number | null;
  payment_method: string | null;
  payment_status: string | null;
  notes: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  receipt_storage_path: string | null;
}

interface StageRow {
  id: string;
  stage_name: string;
  display_name: string | null;
  order_index: number | null;
}

type Supabase = ReturnType<typeof createSupabaseServiceClient>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function allRows<T>(
  supabase: Supabase,
  table: string,
  select: string,
  filters: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    // El order por PK no es cosmético: paginar con range SIN order deja el
    // orden a merced del heap de Postgres, que se mueve con cada escritura
    // (y cada mensaje entrante actualiza su deal). Con eso, entre una página
    // y la siguiente los límites se corren: leads repetidos en la bandeja
    // ("Mónica Beatriz" multiplicada) y otros que desaparecen en silencio.
    const { data, error } = await filters(supabase.from(table).select(select))
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Supabase ${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function getSellersMap(supabase: Supabase, clientId: string): Promise<Map<string, SellerRow>> {
  const rows = await allRows<SellerRow>(supabase, 'seller_profiles', 'id, client_id, name, airtable_seller_name, active', (q) =>
    q.eq('client_id', clientId)
  );
  return new Map(rows.map((r) => [r.id, r]));
}

function sellerDisplayName(seller?: SellerRow | null): string {
  if (!seller) return '';
  return seller.airtable_seller_name || seller.name || '';
}

function meta(obj: Record<string, unknown> | null | undefined, key: string): string {
  const v = obj?.[key];
  if (v === null || v === undefined) return '';
  return String(v);
}

function mapDealToLead(deal: DealRow, contact: ContactRow | null | undefined, sellers: Map<string, SellerRow>): AirtableLead {
  const dm = deal.metadata ?? {};
  const cm = contact?.metadata ?? {};
  const seller = deal.assigned_seller_id ? sellers.get(deal.assigned_seller_id) : null;
  const paused = Boolean(deal.bot_paused_until && new Date(deal.bot_paused_until).getTime() > Date.now());

  return {
    RecordID: deal.id,
    phone: String(contact?.phone ?? ''),
    whatsapp_display_name: meta(cm, 'whatsapp_display_name'),
    name: String(contact?.full_name ?? ''),
    client: 'Roller Cheaper',
    client_record_id: deal.client_id,

    CHAT: '',
    bot_status_display: paused
      ? 'Pausado'
      : deal.bot_can_reply === false
        ? 'Apagado'
        : 'Activo',
    bot_can_reply: deal.bot_can_reply === null ? '' : String(deal.bot_can_reply),
    bot_can_followup: deal.bot_can_followup === null ? '' : String(deal.bot_can_followup),
    bot_paused_by: String(deal.bot_paused_by ?? ''),
    bot_paused_at: meta(dm, 'bot_paused_at') || (paused ? String(deal.updated_at ?? '') : ''),
    bot_resume_at: String(deal.bot_paused_until ?? ''),

    source_instance: meta(dm, 'source_instance'),

    vendedor_asignado: sellerDisplayName(seller),

    current_stage: String(deal.stage ?? ''),
    previous_stage: meta(dm, 'previous_stage'),
    score: deal.score === null || deal.score === undefined ? '' : String(deal.score),
    qualification_reason: meta(cm, 'qualification_reason') || meta(dm, 'qualification_reason'),
    qualified_at: meta(dm, 'qualified_at'),
    stage_changed_at: String(deal.updated_at ?? ''),

    dolor_principal: meta(cm, 'dolor_principal'),
    tipo_producto: meta(cm, 'tipo_producto'),
    medidas_info: meta(cm, 'medidas_info'),
    zona_instalacion: meta(cm, 'zona_instalacion'),
    urgencia_compra: meta(cm, 'urgencia_compra'),

    last_message_at: String(deal.last_message_at ?? ''),
    needs_reply_dismissed_at: meta(dm, 'needs_reply_dismissed_at'),
    last_message_summary: meta(dm, 'last_message_summary'),
    last_message_from: String(deal.last_message_from ?? ''),
    total_messages: meta(dm, 'total_messages'),

    next_followup_at: meta(dm, 'next_followup_at'),
    followup_count: deal.followup_count === null ? '' : String(deal.followup_count),

    proposal_sent_at: meta(dm, 'proposal_sent_at'),
    proposal_amount: meta(dm, 'proposal_amount'),
    won_amount: deal.won_amount === null || deal.won_amount === undefined ? '' : String(deal.won_amount),
    lost_reason: meta(dm, 'lost_reason'),

    source: String(contact?.source ?? ''),
    tags: '',
    notes: meta(dm, 'notes'),
    created_at: String(deal.created_at ?? ''),
  };
}

async function fetchDeals(
  supabase: Supabase,
  clientId: string,
  filters: (q: any) => any,
): Promise<DealRow[]> {
  // Embed del contact via FK deals.contact_id → contacts.id
  return allRows<DealRow>(
    supabase,
    'deals',
    '*, contacts(*)',
    (q) => filters(q.eq('client_id', clientId)),
  );
}

function normalizeStageName(stage?: string): string {
  const value = String(stage ?? '').trim();
  const lower = value.toLowerCase();
  if (lower === 'propuesta_enviada' || lower === 'propuesta enviada') return 'Propuesta enviada';
  return value;
}

const STAGE_ORDER: Record<string, number> = {
  calificado: 0,
  en_calificacion: 1,
  'Propuesta enviada': 2,
  propuesta_enviada: 2,
  en_proceso: 3,
  en_negociacion: 3,
  nuevo: 4,
  no_responde: 5,
  cerrado_ganado: 6,
  cerrado_perdido: 7,
};

export async function getLeadsBySellerName(sellerName: string, _source?: AirtableSource): Promise<AirtableLead[]> {
  const supabase = createSupabaseServiceClient();
  const name = sellerName.trim();

  const { data: sellerRows, error } = await supabase
    .from('seller_profiles')
    .select('id, client_id, name, airtable_seller_name, active')
    .or(`airtable_seller_name.eq."${name}",name.eq."${name}"`);
  if (error) throw new Error(`Supabase seller_profiles: ${error.message}`);
  const seller = (sellerRows ?? [])[0] as SellerRow | undefined;
  if (!seller) return [];

  const deals = await fetchDeals(supabase, seller.client_id, (q) => q.eq('assigned_seller_id', seller.id));
  const sellers = new Map([[seller.id, seller]]);

  const leads = deals.map((d) => mapDealToLead(d, d.contacts, sellers));

  return leads.sort((a, b) => {
    const sa = STAGE_ORDER[normalizeStageName(a.current_stage)] ?? 99;
    const sb = STAGE_ORDER[normalizeStageName(b.current_stage)] ?? 99;
    if (sa !== sb) return sa - sb;
    if (!a.last_message_at) return 1;
    if (!b.last_message_at) return -1;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });
}

export async function getAllLeads(_source?: AirtableSource): Promise<AirtableLead[]> {
  const supabase = createSupabaseServiceClient();
  const clientId = DEFAULT_CLIENT_ID;
  const [deals, sellers] = await Promise.all([
    fetchDeals(supabase, clientId, (q) => q),
    getSellersMap(supabase, clientId),
  ]);

  const leads = deals.map((d) => mapDealToLead(d, d.contacts, sellers));

  return leads.sort((a, b) => {
    const aTime = new Date(a.last_message_at || a.created_at || 0).getTime();
    const bTime = new Date(b.last_message_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

async function findDealRow(supabase: Supabase, recordId: string): Promise<DealRow | null> {
  const byExternal = recordId.startsWith('rec') && !isUuid(recordId);
  const { data, error } = await supabase
    .from('deals')
    .select('*, contacts(*)')
    .eq(byExternal ? 'external_lead_id' : 'id', recordId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Supabase deals: ${error.message}`);
  return (data as DealRow | null) ?? null;
}

export async function getLeadById(recordId: string, _source?: AirtableSource): Promise<AirtableLead | null> {
  const supabase = createSupabaseServiceClient();
  const deal = await findDealRow(supabase, recordId);
  if (!deal) return null;
  const sellers = await getSellersMap(supabase, deal.client_id);
  return mapDealToLead(deal, deal.contacts, sellers);
}

// ────────────────────────────────────────────────────────────────
// Escrituras sobre deals (traducción de field names legacy)
// ────────────────────────────────────────────────────────────────

function coerceBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'checked' || s === '1';
}

export async function updateLeadFields(recordId: string, fields: Record<string, unknown>, _source?: AirtableSource): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const deal = await findDealRow(supabase, recordId);
  if (!deal) throw new Error(`Deal no encontrado: ${recordId}`);

  const updates: Record<string, unknown> = {};
  const metaUpdates: Record<string, unknown> = {};
  let metaTouched = false;

  for (const [key, value] of Object.entries(fields)) {
    switch (key) {
      case 'bot_can_reply':
        updates.bot_can_reply = value === null ? null : coerceBool(value);
        break;
      case 'bot_can_followup':
        updates.bot_can_followup = value === null ? null : coerceBool(value);
        break;
      case 'bot_resume_at':
        updates.bot_paused_until = value ? String(value) : null;
        break;
      case 'bot_paused_by':
        updates.bot_paused_by = value ? String(value) : null;
        break;
      case 'bot_paused_at':
        metaUpdates.bot_paused_at = value ? String(value) : null;
        metaTouched = true;
        break;
      case 'current_stage': {
        const raw = Array.isArray(value) ? value[0] : value;
        const rawStr = String(raw ?? '').trim();
        if (!rawStr) break;
        if (isUuid(rawStr)) {
          const { data: stageRow } = await supabase
            .from('pipeline_stages')
            .select('stage_name')
            .eq('id', rawStr)
            .maybeSingle();
          if (stageRow?.stage_name) updates.stage = stageRow.stage_name;
        } else {
          updates.stage = rawStr.toLowerCase() === 'propuesta enviada' ? 'propuesta_enviada' : rawStr;
        }
        break;
      }
      case 'stage_changed_at':
        break; // updated_at lo maneja el trigger
      case 'won_amount': {
        const amount = Number(value);
        if (Number.isFinite(amount)) {
          updates.won_amount = amount;
          updates.won_at = new Date().toISOString();
          updates.status = 'won';
        }
        break;
      }
      default:
        metaUpdates[key] = value;
        metaTouched = true;
    }
  }

  if (metaTouched) {
    const merged: Record<string, unknown> = { ...(deal.metadata ?? {}) };
    for (const [k, v] of Object.entries(metaUpdates)) {
      if (v === null || v === undefined || v === '') delete merged[k];
      else merged[k] = v;
    }
    updates.metadata = merged;
  }

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase.from('deals').update(updates).eq('id', deal.id);
  if (error) throw new Error(`Supabase deals update: ${error.message}`);
}

export async function getPipelineStages(clientId: string = DEFAULT_CLIENT_ID): Promise<AirtableStage[]> {
  const supabase = createSupabaseServiceClient();
  const rows = await allRows<StageRow>(supabase, 'pipeline_stages', 'id, stage_name, display_name, order_index', (q) =>
    q.eq('client_id', clientId)
  );

  return rows
    .filter((r) => r.stage_name)
    .map((r) => ({
      id: r.id,
      name: r.stage_name,
      displayName: (r.display_name ?? r.stage_name).trim(),
      order: r.order_index ?? 999,
    }))
    .sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName));
}

export async function updateLeadStage(recordId: string, stageRecordId: string): Promise<void> {
  await updateLeadFields(recordId, {
    current_stage: [stageRecordId],
    stage_changed_at: new Date().toISOString(),
  });
}

export async function getAirtableSellers(clientId: string = DEFAULT_CLIENT_ID): Promise<AirtableSeller[]> {
  const supabase = createSupabaseServiceClient();
  const rows = await allRows<SellerRow>(supabase, 'seller_profiles', 'id, client_id, name, airtable_seller_name, active', (q) =>
    q.eq('client_id', clientId)
  );

  return rows
    .map((r) => ({
      id: r.id,
      name: sellerDisplayName(r),
      active: r.active !== false,
    }))
    .filter((s) => s.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ────────────────────────────────────────────────────────────────
// Ventas
// ────────────────────────────────────────────────────────────────

function paymentStatusEs(status: string | null): string {
  const s = String(status ?? '').toLowerCase();
  if (s.includes('confirm')) return 'Confirmada';
  if (s.includes('cancel')) return 'Cancelada';
  return 'Pendiente de pago';
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function mapSaleRow(row: SaleRow, sellerName: string): AirtableSale {
  const createdAt = row.created_at ?? '';
  // El comprobante se sirve vía endpoint propio que firma la URL al momento.
  const receipts: AirtableSaleAttachment[] = row.receipt_storage_path
    ? [{
        url: `/api/sales/${row.id}/receipt`,
        filename: row.receipt_storage_path.split('/').pop() ?? 'comprobante',
      }]
    : [];
  return {
    id: row.id,
    createdTime: createdAt,
    description: String(row.notes ?? ''),
    amount: Number(row.amount ?? 0),
    purchaseDate: createdAt ? createdAt.slice(0, 10) : '',
    registeredAt: createdAt,
    paymentMethod: capitalize(String(row.payment_method ?? '')),
    status: paymentStatusEs(row.payment_status),
    sellerName,
    leadRecordIds: row.deal_id ? [row.deal_id] : [],
    receipts,
    observations: '',
  };
}

export async function getSalesBySellerName(sellerName: string): Promise<AirtableSale[]> {
  const supabase = createSupabaseServiceClient();
  const name = sellerName.trim();

  const { data: sellerRows, error } = await supabase
    .from('seller_profiles')
    .select('id, client_id, name, airtable_seller_name, active')
    .or(`airtable_seller_name.eq."${name}",name.eq."${name}"`);
  if (error) throw new Error(`Supabase seller_profiles: ${error.message}`);
  const seller = (sellerRows ?? [])[0] as SellerRow | undefined;
  if (!seller) return [];

  const rows = await allRows<SaleRow>(supabase, 'sales', '*', (q) =>
    q.eq('client_id', seller.client_id).eq('seller_id', seller.id)
  );

  return rows
    .map((r) => mapSaleRow(r, sellerDisplayName(seller)))
    .sort((a, b) => saleTimestamp(b) - saleTimestamp(a));
}

export async function getAllSales(): Promise<AirtableSale[]> {
  const supabase = createSupabaseServiceClient();
  const clientId = DEFAULT_CLIENT_ID;
  const [rows, sellers] = await Promise.all([
    allRows<SaleRow>(supabase, 'sales', '*', (q) => q.eq('client_id', clientId)),
    getSellersMap(supabase, clientId),
  ]);

  return rows
    .map((r) => mapSaleRow(r, sellerDisplayName(r.seller_id ? sellers.get(r.seller_id) : null)))
    .sort((a, b) => saleTimestamp(b) - saleTimestamp(a));
}

export async function createSaleRecord(input: CreateSaleInput): Promise<{ id: string }> {
  const supabase = createSupabaseServiceClient();

  let dealId: string | null = null;
  let clientId = DEFAULT_CLIENT_ID;
  if (input.leadRecordId?.trim()) {
    const deal = await findDealRow(supabase, input.leadRecordId.trim());
    if (deal) {
      dealId = deal.id;
      clientId = deal.client_id;
    }
  }

  const status = input.status ?? 'Confirmada';
  const confirmed = status === 'Confirmada';
  const createdAt = /^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate)
    ? `${input.purchaseDate}T12:00:00Z`
    : input.purchaseDate || new Date().toISOString();

  const notes = [
    input.description.trim(),
    input.observations?.trim() ?? '',
    input.receipts?.length ? `comprobantes: ${input.receipts.map((r) => r.filename).join(', ')}` : '',
  ].filter(Boolean).join(' · ');

  const { data, error } = await supabase
    .from('sales')
    .insert({
      client_id: clientId,
      deal_id: dealId,
      seller_id: input.sellerRecordId?.trim() || null,
      amount: input.amount,
      currency: 'ARS',
      payment_method: input.paymentMethod.toLowerCase(),
      payment_status: confirmed ? 'confirmed' : status === 'Cancelada' ? 'cancelled' : 'pending',
      notes,
      created_at: createdAt,
      confirmed_at: confirmed ? createdAt : null,
      receipt_storage_path: input.receipts?.[0]?.storagePath ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Supabase sales insert: ${error.message}`);
  return { id: (data as { id: string }).id };
}

// ────────────────────────────────────────────────────────────────
// Rankings (calculados en memoria desde sales; ya no se persisten)
// ────────────────────────────────────────────────────────────────

function saleTimestamp(sale: Pick<AirtableSale, 'purchaseDate' | 'registeredAt' | 'createdTime'>): number {
  const source = sale.purchaseDate || sale.registeredAt || sale.createdTime;
  if (!source) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return new Date(`${source}T12:00:00Z`).getTime();
  return new Date(source).getTime() || 0;
}

function monthKeyForDate(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 7);

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : '';
}

export function saleMonthKey(sale: AirtableSale): string {
  return monthKeyForDate(sale.purchaseDate || sale.registeredAt || sale.createdTime);
}

function isConfirmedSale(sale: AirtableSale): boolean {
  return sale.status.toLowerCase().includes('confirm');
}

export function currentArgentinaMonthKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : '';
}

export function buildSellerRanking(sales: AirtableSale[], month: string): SellerRankingEntry[] {
  const totals = new Map<string, { totalAmount: number; confirmedSales: number }>();

  for (const sale of sales) {
    const sellerName = sale.sellerName.trim();
    if (!sellerName || !isConfirmedSale(sale) || saleMonthKey(sale) !== month) continue;
    const current = totals.get(sellerName) ?? {
      totalAmount: 0,
      confirmedSales: 0,
    };
    current.totalAmount += sale.amount || 0;
    current.confirmedSales += 1;
    totals.set(sellerName, current);
  }

  return [...totals.entries()]
    .map(([sellerName, value]) => ({
      month,
      sellerName,
      position: 0,
      totalAmount: value.totalAmount,
      confirmedSales: value.confirmedSales,
      averageTicket: value.confirmedSales > 0 ? value.totalAmount / value.confirmedSales : 0,
      calculatedAt: new Date().toISOString(),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount || b.confirmedSales - a.confirmedSales || a.sellerName.localeCompare(b.sellerName))
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

export async function getSellerRankingHistory(): Promise<SellerRankingEntry[]> {
  const sales = await getAllSales();
  const months = [...new Set(sales.map(saleMonthKey).filter(Boolean))];
  const rankings = months.flatMap((month) => buildSellerRanking(sales, month));
  return rankings.sort((a, b) => b.month.localeCompare(a.month) || a.position - b.position || b.totalAmount - a.totalAmount);
}

export async function syncSellerRankingMonth(month: string): Promise<SellerRankingEntry[]> {
  const normalizedMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentArgentinaMonthKey();
  const sales = await getAllSales();
  return buildSellerRanking(sales, normalizedMonth);
}
