const WHATSAPP_KEY_FIELDS = [
  'whatsapp_message_id',
  'whatsapp_remote_jid',
  'whatsapp_from_me',
  'whatsapp_message_key',
];

function isMissingWhatsappColumnError(error: { message?: string; code?: string }) {
  const message = (error.message ?? '').toLowerCase();
  return error.code === 'PGRST204' || WHATSAPP_KEY_FIELDS.some((field) => message.includes(field));
}

function withoutWhatsappFields(payload: Record<string, unknown>) {
  const clone = { ...payload };
  for (const field of WHATSAPP_KEY_FIELDS) delete clone[field];
  return clone;
}

export async function insertMessageWithOptionalWhatsappKey(
  // Supabase's query builder is thenable, but its generic type is noisy across
  // server routes. Keep this helper intentionally loose and return the native
  // PostgREST result shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  payload: Record<string, unknown>
) {
  const result = await supabase.from('messages').insert(payload).select().single();
  if (!result.error) return result;

  // Allows production to keep sending while the SQL migration is being applied.
  if (isMissingWhatsappColumnError(result.error)) {
    return supabase.from('messages').insert(withoutWhatsappFields(payload)).select().single();
  }

  return result;
}
