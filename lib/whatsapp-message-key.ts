import type { EvolutionMessageKey, EvolutionMessageResponse } from './evolution';

export function messageKeyFromEvolution(response: EvolutionMessageResponse): EvolutionMessageKey | null {
  if (!response.key?.id || !response.key.remoteJid) return null;
  return {
    remoteJid: response.key.remoteJid,
    fromMe: response.key.fromMe ?? true,
    id: response.key.id,
    ...(response.key.participant ? { participant: response.key.participant } : {}),
  };
}

export function whatsappMessageFields(response: EvolutionMessageResponse) {
  const key = messageKeyFromEvolution(response);
  if (!key) return {};

  return {
    whatsapp_message_id: key.id,
    whatsapp_remote_jid: key.remoteJid,
    whatsapp_from_me: key.fromMe,
    whatsapp_message_key: key,
  };
}
