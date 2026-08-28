import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from './supabase-server';

// Los ids legacy de Airtable (`rec...`) siguen llegando por URL y resuelven vía
// deals.external_lead_id — mismo criterio que findDealRow en lib/airtable.ts.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthorizedLead {
  /** deals.id real (el body puede traer el id legacy `rec...`). */
  leadId: string;
  /** client_id del seller_profile de la sesión — NO el que mandó el body. */
  clientId: string;
  /** contacts.phone del lead — NO el que mandó el body. */
  leadPhone: string;
}

export type AuthorizeLeadResult =
  | { ok: true; lead: AuthorizedLead }
  | { ok: false; response: NextResponse };

function deny(error: string, status: number): AuthorizeLeadResult {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

// El embed to-one de PostgREST llega como objeto, pero según cómo se infiera el
// tipo puede venir envuelto en array: aceptamos las dos formas.
function contactPhone(contacts: unknown): string {
  const row = Array.isArray(contacts) ? contacts[0] : contacts;
  const phone = (row as { phone?: unknown } | null | undefined)?.phone;
  return typeof phone === 'string' ? phone.trim() : '';
}

/**
 * Puerta de entrada de los envíos salientes (send-message / send-audio / send-file).
 *
 * Estas rutas usan la service role key, así que RLS no las cubre: sin esta
 * verificación cualquiera que conociera la URL del deploy podía mandar WhatsApps
 * en nombre de cualquier cliente y a cualquier número. El middleware tampoco
 * ayuda: su guard sólo redirige /chats y /conversation, las /api pasan derecho.
 *
 * Devuelve los datos del lead resueltos DESDE LA BASE, no desde el body: el
 * request sólo elige a qué lead se le escribe, nunca a qué número ni en nombre
 * de qué cliente.
 */
export async function authorizeLead(
  service: SupabaseClient,
  leadId: unknown,
  opts: {
    /** Teléfono que mandó el body; sólo se usa si el contacto no tiene uno. */
    leadPhone?: unknown;
    /** false para las rutas que no mandan nada por WhatsApp (ej. firmar una subida). */
    requirePhone?: boolean;
  } = {},
): Promise<AuthorizeLeadResult> {
  const auth = createSupabaseServerClient();
  // getUser() y no getSession(): getSession() decodifica la cookie sin validar
  // la firma del JWT contra el servidor de auth, así que como control de acceso
  // se puede falsificar.
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return deny('Unauthorized', 401);

  const { data: profile } = await service
    .from('seller_profiles')
    .select('client_id')
    .eq('user_id', user.id)
    .single();

  if (!profile?.client_id) return deny('Profile not found', 403);

  const requestedId = typeof leadId === 'string' ? leadId.trim() : '';
  if (!requestedId) return deny('Missing required fields', 400);

  const byExternal = requestedId.startsWith('rec') && !UUID_RE.test(requestedId);
  // Un id que no es uuid ni `rec...` rompería la query con un 22P02 de Postgres
  // (invalid input syntax for uuid); se corta acá como lead inexistente.
  if (!byExternal && !UUID_RE.test(requestedId)) return deny('Lead no encontrado', 404);

  const { data: deal, error } = await service
    .from('deals')
    .select('id, client_id, contacts(phone)')
    .eq(byExternal ? 'external_lead_id' : 'id', requestedId)
    .eq('client_id', profile.client_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  // Mismo 404 para "no existe" y "es de otro cliente": distinguirlos convertiría
  // la ruta en un oráculo para enumerar leads ajenos.
  if (!deal) return deny('Lead no encontrado', 404);

  const phone = contactPhone((deal as { contacts?: unknown }).contacts);
  const fallbackPhone = typeof opts.leadPhone === 'string' ? opts.leadPhone.trim() : '';
  // El contacto manda. El fallback al body sólo cubre los leads sin teléfono
  // cargado, que es el flujo legacy donde /conversation lo recibe por URL; ahí
  // el envío ya quedó acotado a un deal que pertenece al cliente de la sesión.
  const leadPhone = phone || fallbackPhone;
  if (!leadPhone && opts.requirePhone !== false) {
    return deny('El lead no tiene teléfono asociado.', 400);
  }

  return {
    ok: true,
    lead: {
      leadId: String((deal as { id: string }).id),
      clientId: String((deal as { client_id: string }).client_id),
      leadPhone,
    },
  };
}
