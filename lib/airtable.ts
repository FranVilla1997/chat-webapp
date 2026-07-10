import type { AirtableLead, AirtableSale, AirtableSaleAttachment, SellerRankingEntry } from './types';

const HEADERS = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
};

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
  }[];
}

function getBaseUrl(source?: AirtableSource): string {
  const baseId = source?.baseId || process.env.AIRTABLE_BASE_ID;
  const tableId = source?.tableId || process.env.AIRTABLE_LEADS_TABLE_ID;

  if (!baseId || !tableId) {
    throw new Error('Missing Airtable base or table');
  }

  return `https://api.airtable.com/v0/${baseId}/${tableId}`;
}

function getTableUrl(tableId: string): string {
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!baseId || !tableId) {
    throw new Error('Missing Airtable base or table');
  }
  const tableRef = tableId.startsWith('tbl') ? tableId : encodeURIComponent(tableId);
  return `https://api.airtable.com/v0/${baseId}/${tableRef}`;
}

function salesTableId(): string {
  return process.env.AIRTABLE_SALES_TABLE_ID || 'tblS74HxfH5MHAga3';
}

function sellersTableId(): string {
  return process.env.AIRTABLE_SELLERS_TABLE_ID || 'tblEcyyvFdnQYlTl6';
}

function stagesTableId(): string {
  return process.env.AIRTABLE_STAGES_TABLE_ID || 'tblFMvB5bjBmq5Hl8';
}

function sellerRankingsTableId(): string {
  return process.env.AIRTABLE_SELLER_RANKINGS_TABLE_ID || 'Rankings vendedores';
}

function extractUrl(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'object' && v !== null && 'url' in v) return String((v as Record<string, unknown>).url ?? '');
  return String(v);
}

function normalizeStageName(stage?: string): string {
  const value = String(stage ?? '').trim();
  const lower = value.toLowerCase();
  if (lower === 'propuesta_enviada' || lower === 'propuesta enviada') return 'Propuesta enviada';
  return value;
}

function escapeAirtableFormulaValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function extractLinkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function extractTextValue(value: unknown): string {
  if (Array.isArray(value))
    return value
      .map((item) => String(item))
      .filter(Boolean)
      .join(', ');
  return String(value ?? '');
}

function extractSellerNameFromSale(value: unknown, sellersById: Map<string, string>): string {
  if (!Array.isArray(value)) return extractTextValue(value);
  return value
    .map((item) => sellersById.get(String(item)) ?? String(item))
    .filter(Boolean)
    .join(', ');
}

function extractSaleAttachments(value: unknown): AirtableSaleAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const attachment = item as Record<string, unknown>;
    const url = String(attachment.url ?? '');
    if (!url) return [];

    return [
      {
        id: attachment.id ? String(attachment.id) : undefined,
        url,
        filename: String(attachment.filename ?? 'comprobante'),
        type: attachment.type ? String(attachment.type) : undefined,
      },
    ];
  });
}

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

function rankingKey(month: string, sellerName: string): string {
  return `${month}-${sellerName}`.trim();
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

function mapRecord(record: { id: string; fields: Record<string, unknown> }): AirtableLead {
  const f = record.fields;
  return {
    RecordID: record.id,
    phone: String(f['phone'] ?? ''),
    whatsapp_display_name: String(f['whatsapp_display_name'] ?? ''),
    name: String(f['name'] ?? ''),
    client: String(f['client'] ?? ''),
    client_record_id: String(f['client_record_id'] ?? ''),

    CHAT: extractUrl(f['CHAT']),
    bot_status_display: String(f['bot_status_display'] ?? ''),
    bot_can_reply: String(f['bot_can_reply'] ?? ''),
    bot_can_followup: String(f['bot_can_followup'] ?? ''),
    bot_paused_by: String(f['bot_paused_by'] ?? ''),
    bot_paused_at: String(f['bot_paused_at'] ?? ''),
    bot_resume_at: String(f['bot_resume_at'] ?? ''),

    source_instance: String(f['source_instance'] ?? ''),

    vendedor_asignado: String(f['Vendedor Asignado'] ?? ''),

    current_stage: String(f['current_stage'] ?? ''),
    previous_stage: String(f['previous_stage'] ?? ''),
    score: String(f['score'] ?? ''),
    qualification_reason: String(f['qualification_reason'] ?? ''),
    qualified_at: String(f['qualified_at'] ?? ''),
    stage_changed_at: String(f['stage_changed_at'] ?? ''),

    dolor_principal: String(f['dolor_principal'] ?? ''),
    tipo_producto: String(f['tipo_producto'] ?? ''),
    medidas_info: String(f['medidas_info'] ?? ''),
    zona_instalacion: String(f['zona_instalacion'] ?? ''),
    urgencia_compra: String(f['urgencia_compra'] ?? ''),

    last_message_at: String(f['last_message_at'] ?? ''),
    last_message_summary: String(f['last_message_summary'] ?? ''),
    last_message_from: String(f['last_message_from'] ?? ''),
    total_messages: String(f['total_messages'] ?? ''),

    next_followup_at: String(f['next_followup_at'] ?? ''),
    followup_count: String(f['followup_count'] ?? ''),

    proposal_sent_at: String(f['proposal_sent_at'] ?? ''),
    proposal_amount: String(f['proposal_amount'] ?? ''),
    won_amount: String(f['won_amount'] ?? ''),
    lost_reason: String(f['lost_reason'] ?? ''),

    source: String(f['source'] ?? ''),
    tags: String(f['tags'] ?? ''),
    notes: String(f['notes'] ?? ''),
    created_at: String(f['created_at'] ?? ''),
  };
}

function mapSaleRecord(record: { id: string; createdTime?: string; fields: Record<string, unknown> }, sellerName?: string): AirtableSale {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: String(record.createdTime ?? ''),
    description: String(f['Descripción'] ?? ''),
    amount: Number(f['Monto de la venta'] ?? 0),
    purchaseDate: String(f['Fecha de compra'] ?? ''),
    registeredAt: String(f['Fecha de registro'] ?? ''),
    paymentMethod: String(f['Método de pago'] ?? ''),
    status: String(f['Estado de la venta'] ?? ''),
    sellerName: sellerName ?? extractTextValue(f['Vendedor responsable']),
    leadRecordIds: extractLinkedIds(f['Lead cerrado']),
    receipts: extractSaleAttachments(f['Comprobante de pago']),
    observations: String(f['Observaciones'] ?? ''),
  };
}

function mapRankingRecord(record: { id: string; fields: Record<string, unknown> }): SellerRankingEntry {
  const f = record.fields;
  return {
    id: record.id,
    month: String(f['Mes'] ?? ''),
    sellerName: String(f['Vendedor'] ?? ''),
    position: Number(f['Posicion'] ?? 0),
    totalAmount: Number(f['Monto total'] ?? 0),
    confirmedSales: Number(f['Ventas confirmadas'] ?? 0),
    averageTicket: Number(f['Ticket promedio'] ?? 0),
    calculatedAt: String(f['Fecha de calculo'] ?? ''),
  };
}

export async function getLeadsBySellerName(sellerName: string, source?: AirtableSource): Promise<AirtableLead[]> {
  const leads: AirtableLead[] = [];
  let offset: string | undefined;
  const baseUrl = getBaseUrl(source);

  do {
    const formula = encodeURIComponent(`{Vendedor Asignado}="${sellerName}"`);
    let url = `${baseUrl}?filterByFormula=${formula}&pageSize=100&cellFormat=string&timeZone=America%2FArgentina%2FBuenos_Aires&userLocale=es`;
    if (offset) url += `&offset=${offset}`;

    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Airtable error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      records: { id: string; fields: Record<string, unknown> }[];
      offset?: string;
    };

    leads.push(...data.records.map(mapRecord));
    offset = data.offset;
  } while (offset);

  const STAGE_ORDER: Record<string, number> = {
    calificado: 0,
    en_calificacion: 1,
    'Propuesta enviada': 2,
    propuesta_enviada: 2,
    en_proceso: 3,
    nuevo: 4,
    no_responde: 5,
    cerrado_ganado: 6,
    cerrado_perdido: 7,
  };

  return leads.sort((a, b) => {
    const sa = STAGE_ORDER[normalizeStageName(a.current_stage)] ?? 99;
    const sb = STAGE_ORDER[normalizeStageName(b.current_stage)] ?? 99;
    if (sa !== sb) return sa - sb;
    if (!a.last_message_at) return 1;
    if (!b.last_message_at) return -1;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });
}

export async function getAllLeads(source?: AirtableSource): Promise<AirtableLead[]> {
  const leads: AirtableLead[] = [];
  let offset: string | undefined;
  const baseUrl = getBaseUrl(source);

  do {
    let url = `${baseUrl}?pageSize=100&cellFormat=string&timeZone=America%2FArgentina%2FBuenos_Aires&userLocale=es`;
    if (offset) url += `&offset=${offset}`;

    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Airtable error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      records: { id: string; fields: Record<string, unknown> }[];
      offset?: string;
    };

    leads.push(...data.records.map(mapRecord));
    offset = data.offset;
  } while (offset);

  return leads.sort((a, b) => {
    const aTime = new Date(a.last_message_at || a.created_at || 0).getTime();
    const bTime = new Date(b.last_message_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

export async function getLeadById(recordId: string, source?: AirtableSource): Promise<AirtableLead | null> {
  const res = await fetch(`${getBaseUrl(source)}/${recordId}`, {
    headers: HEADERS,
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Airtable error: ${res.status}`);
  const data = (await res.json()) as {
    id: string;
    fields: Record<string, unknown>;
  };
  return mapRecord(data);
}

export async function getSalesBySellerName(sellerName: string): Promise<AirtableSale[]> {
  const sales: AirtableSale[] = [];
  let offset: string | undefined;
  const baseUrl = getTableUrl(salesTableId());
  const formula = encodeURIComponent(`{Vendedor responsable}="${escapeAirtableFormulaValue(sellerName)}"`);

  do {
    let url = `${baseUrl}?filterByFormula=${formula}&pageSize=100`;
    if (offset) url += `&offset=${offset}`;

    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`Airtable sales error: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as {
      records: {
        id: string;
        createdTime?: string;
        fields: Record<string, unknown>;
      }[];
      offset?: string;
    };

    sales.push(...data.records.map((record) => mapSaleRecord(record, sellerName)));
    offset = data.offset;
  } while (offset);

  return sales.sort((a, b) => saleTimestamp(b) - saleTimestamp(a));
}

export async function getAllSales(): Promise<AirtableSale[]> {
  const sales: AirtableSale[] = [];
  let offset: string | undefined;
  const baseUrl = getTableUrl(salesTableId());
  const sellers = await getAirtableSellers();
  const sellersById = new Map(sellers.map((seller) => [seller.id, seller.name]));

  do {
    let url = `${baseUrl}?pageSize=100`;
    if (offset) url += `&offset=${offset}`;

    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`Airtable sales error: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as {
      records: {
        id: string;
        createdTime?: string;
        fields: Record<string, unknown>;
      }[];
      offset?: string;
    };

    sales.push(...data.records.map((record) => mapSaleRecord(record, extractSellerNameFromSale(record.fields['Vendedor responsable'], sellersById))));
    offset = data.offset;
  } while (offset);

  return sales.sort((a, b) => saleTimestamp(b) - saleTimestamp(a));
}

export async function getSellerRankingHistory(): Promise<SellerRankingEntry[]> {
  const rankings: SellerRankingEntry[] = [];
  let offset: string | undefined;
  const baseUrl = getTableUrl(sellerRankingsTableId());

  do {
    let url = `${baseUrl}?pageSize=100`;
    if (offset) url += `&offset=${offset}`;

    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`Airtable rankings error: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as {
      records: { id: string; fields: Record<string, unknown> }[];
      offset?: string;
    };

    rankings.push(...data.records.map(mapRankingRecord).filter((entry) => entry.month && entry.sellerName));
    offset = data.offset;
  } while (offset);

  return rankings.sort((a, b) => b.month.localeCompare(a.month) || a.position - b.position || b.totalAmount - a.totalAmount);
}

export async function syncSellerRankingMonth(month: string): Promise<SellerRankingEntry[]> {
  const normalizedMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentArgentinaMonthKey();
  const sales = await getAllSales();
  const ranking = buildSellerRanking(sales, normalizedMonth);
  const existing = await getSellerRankingHistory();
  const existingByKey = new Map(existing.filter((entry) => entry.month === normalizedMonth && entry.id).map((entry) => [rankingKey(entry.month, entry.sellerName), entry.id as string]));

  for (const entry of ranking) {
    const fields = {
      Clave: rankingKey(entry.month, entry.sellerName),
      Mes: entry.month,
      Vendedor: entry.sellerName,
      Posicion: entry.position,
      'Monto total': entry.totalAmount,
      'Ventas confirmadas': entry.confirmedSales,
      'Ticket promedio': entry.averageTicket,
      'Fecha de calculo': entry.calculatedAt,
    };
    const existingId = existingByKey.get(rankingKey(entry.month, entry.sellerName));
    const url = existingId ? `${getTableUrl(sellerRankingsTableId())}/${existingId}` : getTableUrl(sellerRankingsTableId());
    const res = await fetch(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(`Airtable ranking sync error: ${res.status} ${await res.text()}`);
  }

  return ranking;
}

export async function updateLeadFields(recordId: string, fields: Record<string, unknown>, source?: AirtableSource): Promise<void> {
  const res = await fetch(`${getBaseUrl(source)}/${recordId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Airtable error: ${res.status} ${await res.text()}`);
}

export async function getPipelineStages(): Promise<AirtableStage[]> {
  const stages: AirtableStage[] = [];
  let offset: string | undefined;
  const baseUrl = getTableUrl(stagesTableId());

  do {
    let url = `${baseUrl}?pageSize=100&cellFormat=string&timeZone=America%2FArgentina%2FBuenos_Aires&userLocale=es`;
    if (offset) url += `&offset=${offset}`;

    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`Airtable stages error: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as {
      records: { id: string; fields: Record<string, unknown> }[];
      offset?: string;
    };

    stages.push(
      ...data.records.flatMap((record) => {
        const name = String(record.fields['stage_name'] ?? '').trim();
        if (!name) return [];
        return [
          {
            id: record.id,
            name,
            displayName: String(record.fields['stage_display_name'] ?? name).trim(),
            order: Number(record.fields['stage_order'] ?? 999),
          },
        ];
      })
    );
    offset = data.offset;
  } while (offset);

  return stages.sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName));
}

export async function updateLeadStage(recordId: string, stageRecordId: string): Promise<void> {
  await updateLeadFields(recordId, {
    current_stage: [stageRecordId],
    stage_changed_at: new Date().toISOString(),
  });
}

export async function getAirtableSellers(): Promise<AirtableSeller[]> {
  const sellers: AirtableSeller[] = [];
  let offset: string | undefined;
  const baseUrl = getTableUrl(sellersTableId());

  do {
    let url = `${baseUrl}?pageSize=100&cellFormat=string&timeZone=America%2FArgentina%2FBuenos_Aires&userLocale=es`;
    if (offset) url += `&offset=${offset}`;

    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`Airtable sellers error: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as {
      records: { id: string; fields: Record<string, unknown> }[];
      offset?: string;
    };

    sellers.push(
      ...data.records
        .map((record) => {
          const checkboxActive = record.fields['Activo'];
          const status = String(record.fields['Estado'] ?? '')
            .trim()
            .toLowerCase();

          return {
            id: record.id,
            name: String(record.fields['Nombre'] ?? ''),
            active: Boolean(checkboxActive) || status === 'activo',
          };
        })
        .filter((seller) => seller.name)
    );
    offset = data.offset;
  } while (offset);

  return sellers.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createSaleRecord(input: CreateSaleInput): Promise<{ id: string }> {
  const fields: Record<string, unknown> = {
    Descripción: input.description,
    'Monto de la venta': input.amount,
    'Fecha de compra': input.purchaseDate,
    'Método de pago': input.paymentMethod,
    'Estado de la venta': input.status ?? 'Confirmada',
  };

  if (input.leadRecordId?.trim()) fields['Lead cerrado'] = [input.leadRecordId.trim()];
  if (input.sellerRecordId?.trim()) fields['Vendedor responsable'] = [input.sellerRecordId.trim()];
  if (input.observations?.trim()) fields['Observaciones'] = input.observations.trim();
  if (input.receipts?.length) {
    fields['Comprobante de pago'] = input.receipts.map((receipt) => ({
      url: receipt.url,
      filename: receipt.filename,
    }));
  }

  const res = await fetch(getTableUrl(salesTableId()), {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) throw new Error(`Airtable sale error: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}
