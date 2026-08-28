import { NextResponse } from 'next/server';
import { EvolutionError } from './evolution';

export interface SendErrorContext {
  route: string;
  leadId?: string;
  clientId?: string;
  // La instancia con la que se intentó enviar (la línea activa del lead) y,
  // cuando difieren, la que traía la UI: si no coinciden, el chat estaba abierto
  // con una línea vieja.
  instance?: string;
  uiInstance?: string;
}

/**
 * Punto único de fallo de los envíos salientes.
 *
 * Antes el catch de cada ruta devolvía el mensaje pelado y no dejaba rastro en
 * el servidor: cuando un envío fallaba en producción no quedaba ni el status de
 * Evolution ni la instancia usada, así que el incidente era indiagnosticable a
 * posteriori. Acá se loguea todo eso y se le devuelve el status al cliente para
 * que la UI diga qué pasó en vez de adivinar.
 */
export function sendErrorResponse(err: unknown, context: SendErrorContext) {
  const detail = err instanceof Error ? err.message : 'Internal server error';
  const evolution = err instanceof EvolutionError ? err : null;

  console.error('[send-error] ' + JSON.stringify({
    ...context,
    detail,
    evolutionStatus: evolution?.status ?? null,
    evolutionInstance: evolution?.instanceName ?? null,
    // 'env' = se usó la EVOLUTION_API_KEY global porque falló la resolución por
    // instancia; es la pista de que el 401 puede ser de credenciales.
    credentialSource: evolution?.credentialSource ?? null,
  }));

  return NextResponse.json(
    { error: detail, evolutionStatus: evolution?.status ?? null },
    { status: 500 }
  );
}
