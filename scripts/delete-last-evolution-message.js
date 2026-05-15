#!/usr/bin/env node
/*
  Emergency helper:
  Finds the latest message sent by the WhatsApp instance to a target number and
  calls Evolution API deleteMessageForEveryone.

  Usage:
    node scripts/delete-last-evolution-message.js --instance "RC Linea 2" --phone "549..." --confirm-delete

  Dry run:
    node scripts/delete-last-evolution-message.js --instance "RC Linea 2" --phone "549..."
*/

const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));

function args() {
  const out = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const item = process.argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = process.argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function normalizeInstanceKey(value = '') {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function printUsageAndExit(message) {
  if (message) console.error(`\nERROR: ${message}`);
  console.error(`
Usage:
  node scripts/delete-last-evolution-message.js --instance "RC Linea 2" --phone "549..." --confirm-delete

Dry run:
  node scripts/delete-last-evolution-message.js --instance "RC Linea 2" --phone "549..."

Optional:
  --client-id "..."
  --base-url "https://evolution.example.com"
  --api-key "..."
`);
  process.exit(1);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function resolveInstanceConfig(input) {
  if (input['base-url'] && input['api-key']) {
    return {
      baseUrl: normalizeBaseUrl(input['base-url']),
      apiKey: input['api-key'],
      instanceName: input.instance,
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    const url = `${normalizeBaseUrl(supabaseUrl)}/rest/v1/evolution_instances?select=client_id,instance_name,display_name,base_url,api_key&limit=200`;
    const rows = await fetchJson(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });

    const requested = normalizeInstanceKey(input.instance);
    const matches = (Array.isArray(rows) ? rows : []).filter((row) =>
      normalizeInstanceKey(row.instance_name) === requested ||
      normalizeInstanceKey(row.display_name) === requested
    );

    const picked =
      matches.find((row) => input['client-id'] && row.client_id === input['client-id']) ||
      matches.find((row) => !row.client_id) ||
      matches[0];

    if (picked?.base_url && picked.api_key && picked.instance_name) {
      return {
        baseUrl: normalizeBaseUrl(picked.base_url),
        apiKey: picked.api_key,
        instanceName: picked.instance_name,
      };
    }
  }

  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY) {
    return {
      baseUrl: normalizeBaseUrl(process.env.EVOLUTION_API_URL),
      apiKey: process.env.EVOLUTION_API_KEY,
      instanceName: input.instance,
    };
  }

  throw new Error(`No pude resolver credenciales de Evolution para instancia "${input.instance}".`);
}

function collectMessageObjects(value, acc = []) {
  if (!value) return acc;
  if (Array.isArray(value)) {
    for (const item of value) collectMessageObjects(item, acc);
    return acc;
  }
  if (typeof value !== 'object') return acc;

  if (value.key?.id && value.key?.remoteJid) {
    acc.push(value);
  }

  for (const item of Object.values(value)) {
    if (item && typeof item === 'object') collectMessageObjects(item, acc);
  }

  return acc;
}

function messageTime(message) {
  const raw =
    message.messageTimestamp ||
    message.message_timestamp ||
    message.timestamp ||
    message.createdAt ||
    message.created_at ||
    0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function messageKind(message) {
  const payload = message.message || {};
  return Object.keys(payload)[0] || 'unknown';
}

async function findMessages(config, remoteJid) {
  const url = `${config.baseUrl}/chat/findMessages/${encodeURIComponent(config.instanceName)}`;
  const body = await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.apiKey,
    },
    body: JSON.stringify({ where: { key: { remoteJid } } }),
  });
  return collectMessageObjects(body);
}

async function deleteForEveryone(config, key) {
  const url = `${config.baseUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(config.instanceName)}`;
  return fetchJson(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.apiKey,
    },
    body: JSON.stringify({
      id: key.id,
      remoteJid: key.remoteJid,
      fromMe: true,
      ...(key.participant ? { participant: key.participant } : {}),
    }),
  });
}

async function main() {
  const input = args();
  if (!input.instance) printUsageAndExit('Falta --instance');
  if (!input.phone) printUsageAndExit('Falta --phone');

  const phone = normalizePhone(input.phone);
  if (!phone) printUsageAndExit('El telefono no parece valido.');

  const config = await resolveInstanceConfig(input);
  const remoteJids = [`${phone}@s.whatsapp.net`, `${phone}@s.whatsapp.com`];

  console.log(`Instance: ${config.instanceName}`);
  console.log(`Target:   ${phone}`);
  console.log(`Mode:     ${input['confirm-delete'] ? 'DELETE' : 'DRY RUN'}\n`);

  const all = [];
  for (const remoteJid of remoteJids) {
    try {
      const found = await findMessages(config, remoteJid);
      all.push(...found);
      console.log(`findMessages ${remoteJid}: ${found.length} message objects`);
    } catch (err) {
      console.warn(`findMessages ${remoteJid} failed: ${err.message}`);
    }
  }

  const sent = all
    .filter((message) => message.key?.fromMe === true && message.key?.id)
    .sort((a, b) => messageTime(b) - messageTime(a));

  if (!sent.length) {
    throw new Error('No encontre mensajes enviados por la instancia hacia ese numero.');
  }

  const latest = sent[0];
  const key = latest.key;
  const when = messageTime(latest) ? new Date(messageTime(latest)).toISOString() : 'unknown';

  console.log('\nLatest sent message:');
  console.log(`  id:        ${key.id}`);
  console.log(`  remoteJid: ${key.remoteJid}`);
  console.log(`  kind:      ${messageKind(latest)}`);
  console.log(`  time:      ${when}`);

  if (!input['confirm-delete']) {
    console.log('\nDRY RUN only. Add --confirm-delete to delete this message for everyone.');
    return;
  }

  console.log('\nDeleting for everyone...');
  const result = await deleteForEveryone(config, key);
  console.log('Delete response:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
