import { createClient } from '@supabase/supabase-js';

interface SendTextPayload {
  number: string;
  text: string;
}

export interface EvolutionMessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
  participant?: string;
}

export interface EvolutionMessageResponse {
  key?: EvolutionMessageKey;
  [key: string]: unknown;
}

interface EvolutionInstanceRow {
  client_id: string | null;
  instance_name: string;
  display_name: string | null;
  base_url: string;
  api_key: string;
  is_default: boolean | null;
}

interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizeInstanceKey(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function envConfig(instance: string): EvolutionConfig | null {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: normalizeBaseUrl(baseUrl), apiKey, instanceName: instance.trim() };
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function pickInstance(rows: EvolutionInstanceRow[], requested: string, clientId?: string): EvolutionInstanceRow | null {
  const normalized = normalizeInstanceKey(requested);
  const sameName = rows.filter((row) =>
    normalizeInstanceKey(row.instance_name) === normalized ||
    normalizeInstanceKey(row.display_name) === normalized
  );
  if (!sameName.length) return null;
  return (
    sameName.find((row) => clientId && row.client_id === clientId) ??
    sameName.find((row) => !row.client_id) ??
    sameName[0] ??
    null
  );
}

async function configuredInstance(instance: string, clientId?: string): Promise<EvolutionInstanceRow | null> {
  const supabase = supabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('evolution_instances')
      .select('client_id, instance_name, display_name, base_url, api_key, is_default')
      .limit(100);

    if (error) return null;
    return pickInstance((data ?? []) as EvolutionInstanceRow[], instance, clientId);
  } catch {
    return null;
  }
}

async function resolveEvolutionConfig(instance: string, clientId?: string): Promise<EvolutionConfig> {
  const configured = await configuredInstance(instance, clientId);
  if (configured?.base_url && configured.api_key) {
    return {
      baseUrl: normalizeBaseUrl(configured.base_url),
      apiKey: configured.api_key,
      instanceName: configured.instance_name,
    };
  }

  const fallback = envConfig(instance);
  if (fallback) return fallback;

  throw new Error(`Evolution API no está configurada para la instancia "${instance}".`);
}

async function parseEvolutionError(response: Response): Promise<string> {
  const body = await response.text();
  return body || response.statusText;
}

async function parseEvolutionResponse(response: Response): Promise<EvolutionMessageResponse> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as EvolutionMessageResponse;
  } catch {
    return {};
  }
}

export async function sendWhatsAppMessage(
  instance: string,
  number: string,
  text: string,
  clientId?: string
): Promise<EvolutionMessageResponse> {
  const config = await resolveEvolutionConfig(instance, clientId);
  const payload: SendTextPayload = { number: normalizePhone(number), text };

  const response = await fetch(`${config.baseUrl}/message/sendText/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Evolution API error ${response.status}: ${await parseEvolutionError(response)}`);
  }

  return parseEvolutionResponse(response);
}

export async function sendWhatsAppAudio(
  instance: string,
  number: string,
  audioBase64: string,
  clientId?: string
): Promise<EvolutionMessageResponse> {
  const config = await resolveEvolutionConfig(instance, clientId);

  const response = await fetch(`${config.baseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
    body: JSON.stringify({ number: normalizePhone(number), audio: audioBase64, encoding: true }),
  });

  if (!response.ok) {
    throw new Error(`Evolution API audio error ${response.status}: ${await parseEvolutionError(response)}`);
  }

  return parseEvolutionResponse(response);
}

export type WhatsAppMediaType = 'image' | 'video' | 'document';

export async function sendWhatsAppMedia(
  instance: string,
  number: string,
  input: {
    mediaUrl: string;
    mediaType: WhatsAppMediaType;
    mimeType: string;
    fileName: string;
    caption?: string;
  },
  clientId?: string
): Promise<EvolutionMessageResponse> {
  const config = await resolveEvolutionConfig(instance, clientId);

  const response = await fetch(`${config.baseUrl}/message/sendMedia/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
    body: JSON.stringify({
      number: normalizePhone(number),
      mediatype: input.mediaType,
      mimetype: input.mimeType,
      media: input.mediaUrl,
      fileName: input.fileName,
      caption: input.caption ?? '',
    }),
  });

  if (!response.ok) {
    throw new Error(`Evolution API media error ${response.status}: ${await parseEvolutionError(response)}`);
  }

  return parseEvolutionResponse(response);
}

export async function updateWhatsAppMessage(
  instance: string,
  number: string,
  key: EvolutionMessageKey,
  text: string,
  clientId?: string
): Promise<void> {
  const config = await resolveEvolutionConfig(instance, clientId);
  const keyNumber = key.remoteJid.split('@')[0] || number;

  const response = await fetch(`${config.baseUrl}/chat/updateMessage/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
    body: JSON.stringify({
      number: normalizePhone(keyNumber),
      text,
      key: {
        remoteJid: key.remoteJid,
        fromMe: key.fromMe,
        id: key.id,
        ...(key.participant ? { participant: key.participant } : {}),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Evolution API update error ${response.status}: ${await parseEvolutionError(response)}`);
  }
}

export async function deleteWhatsAppMessageForEveryone(
  instance: string,
  key: EvolutionMessageKey,
  clientId?: string
): Promise<void> {
  const config = await resolveEvolutionConfig(instance, clientId);

  const response = await fetch(`${config.baseUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(config.instanceName)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
    body: JSON.stringify({
      id: key.id,
      remoteJid: key.remoteJid,
      fromMe: key.fromMe,
      ...(key.participant ? { participant: key.participant } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Evolution API delete error ${response.status}: ${await parseEvolutionError(response)}`);
  }
}
