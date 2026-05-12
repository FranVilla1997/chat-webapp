import type { AirtableLead } from './types';

const HEADERS = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
};

export interface AirtableSource {
  baseId?: string;
  tableId?: string;
}

function getBaseUrl(source?: AirtableSource): string {
  const baseId = source?.baseId || process.env.AIRTABLE_BASE_ID;
  const tableId = source?.tableId || process.env.AIRTABLE_LEADS_TABLE_ID;

  if (!baseId || !tableId) {
    throw new Error('Missing Airtable base or table');
  }

  return `https://api.airtable.com/v0/${baseId}/${tableId}`;
}

function extractUrl(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'object' && v !== null && 'url' in v) return String((v as Record<string, unknown>).url ?? '');
  return String(v);
}

function mapRecord(record: { id: string; fields: Record<string, unknown> }): AirtableLead {
  const f = record.fields;
  return {
    RecordID:              record.id,
    phone:                 String(f['phone'] ?? ''),
    whatsapp_display_name: String(f['whatsapp_display_name'] ?? ''),
    name:                  String(f['name'] ?? ''),
    client:                String(f['client'] ?? ''),
    client_record_id:      String(f['client_record_id'] ?? ''),

    CHAT:               extractUrl(f['CHAT']),
    bot_status_display: String(f['bot_status_display'] ?? ''),
    bot_can_reply:      String(f['bot_can_reply'] ?? ''),
    bot_can_followup:   String(f['bot_can_followup'] ?? ''),
    bot_paused_by:      String(f['bot_paused_by'] ?? ''),
    bot_paused_at:      String(f['bot_paused_at'] ?? ''),
    bot_resume_at:      String(f['bot_resume_at'] ?? ''),

    source_instance: String(f['source_instance'] ?? ''),

    vendedor_asignado: String(f['Vendedor Asignado'] ?? ''),

    current_stage:        String(f['current_stage'] ?? ''),
    previous_stage:       String(f['previous_stage'] ?? ''),
    score:                String(f['score'] ?? ''),
    qualification_reason: String(f['qualification_reason'] ?? ''),
    qualified_at:         String(f['qualified_at'] ?? ''),
    stage_changed_at:     String(f['stage_changed_at'] ?? ''),

    dolor_principal:  String(f['dolor_principal'] ?? ''),
    tipo_producto:    String(f['tipo_producto'] ?? ''),
    medidas_info:     String(f['medidas_info'] ?? ''),
    zona_instalacion: String(f['zona_instalacion'] ?? ''),
    urgencia_compra:  String(f['urgencia_compra'] ?? ''),

    last_message_at:      String(f['last_message_at'] ?? ''),
    last_message_summary: String(f['last_message_summary'] ?? ''),
    last_message_from:    String(f['last_message_from'] ?? ''),
    total_messages:       String(f['total_messages'] ?? ''),

    next_followup_at: String(f['next_followup_at'] ?? ''),
    followup_count:   String(f['followup_count'] ?? ''),

    proposal_sent_at: String(f['proposal_sent_at'] ?? ''),
    proposal_amount:  String(f['proposal_amount'] ?? ''),
    won_amount:       String(f['won_amount'] ?? ''),
    lost_reason:      String(f['lost_reason'] ?? ''),

    source:     String(f['source'] ?? ''),
    tags:       String(f['tags'] ?? ''),
    notes:      String(f['notes'] ?? ''),
    created_at: String(f['created_at'] ?? ''),
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

    const data = await res.json() as {
      records: { id: string; fields: Record<string, unknown> }[];
      offset?: string;
    };

    leads.push(...data.records.map(mapRecord));
    offset = data.offset;
  } while (offset);

  const STAGE_ORDER: Record<string, number> = {
    calificado:       0,
    en_calificacion:  1,
    propuesta_enviada:2,
    en_proceso:       3,
    nuevo:            4,
    no_responde:      5,
    cerrado_ganado:   6,
    cerrado_perdido:  7,
  };

  return leads.sort((a, b) => {
    const sa = STAGE_ORDER[a.current_stage] ?? 99;
    const sb = STAGE_ORDER[b.current_stage] ?? 99;
    if (sa !== sb) return sa - sb;
    if (!a.last_message_at) return 1;
    if (!b.last_message_at) return -1;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });
}

export async function getLeadById(recordId: string, source?: AirtableSource): Promise<AirtableLead | null> {
  const res = await fetch(`${getBaseUrl(source)}/${recordId}`, { headers: HEADERS, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Airtable error: ${res.status}`);
  const data = await res.json() as { id: string; fields: Record<string, unknown> };
  return mapRecord(data);
}

export async function updateLeadFields(recordId: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/${recordId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Airtable error: ${res.status} ${await res.text()}`);
}
