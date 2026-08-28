// Traducción de un fallo de envío a algo que el vendedor pueda entender —y que
// sea cierto.
//
// La versión anterior mostraba "revisá que la instancia tenga su API key
// correcta" ante CUALQUIER error de Evolution, porque todos los mensajes de ese
// módulo contienen la palabra "Evolution". Un 502 del servidor se leía como un
// problema de credenciales, y el vendedor no tenía cómo saber la diferencia:
// el detalle técnico se descartaba antes de llegar a la pantalla.

export interface SendFailure {
  /** Cadena cruda del servidor, para el detalle técnico. */
  detail: string;
  /** Status que devolvió Evolution, cuando el fallo vino de ahí. */
  evolutionStatus: number | null;
}

export function friendlySendError(failure: SendFailure): string {
  const { detail, evolutionStatus } = failure;
  const lower = detail.toLowerCase();

  if (evolutionStatus === 401 || evolutionStatus === 403) {
    return `WhatsApp rechazó las credenciales de la línea del lead (error ${evolutionStatus}). Avisá al equipo técnico: hay que revisar la API key de esa instancia.`;
  }

  if (evolutionStatus === 404) {
    return 'WhatsApp no encontró la línea del lead (error 404). Puede estar desconectada.';
  }

  if (evolutionStatus !== null && evolutionStatus >= 500) {
    return `WhatsApp no está respondiendo (error ${evolutionStatus}). Es del lado del servidor: esperá un momento y reintentá.`;
  }

  if (lower.includes('no está configurada')) {
    return 'La línea del lead no está configurada en el sistema. Avisá al equipo técnico.';
  }

  if (evolutionStatus !== null) {
    return `No se pudo enviar (error ${evolutionStatus} de WhatsApp). Reintentá en un momento.`;
  }

  if (lower.includes('audio')) return 'No se pudo enviar el audio. Revisá la conexión y reintentá.';
  if (lower.includes('archivo') || lower.includes('media')) return 'No se pudo enviar el archivo. Revisá la conexión y reintentá.';

  return 'No se pudo enviar el mensaje. Revisá tu conexión y reintentá.';
}

/** Lee la respuesta de error de /api/send-*, tolerando cuerpos no-JSON. */
export async function readSendFailure(response: Response): Promise<SendFailure> {
  try {
    const payload = await response.json() as { error?: string; evolutionStatus?: number | null };
    return {
      detail: payload.error ?? `HTTP ${response.status}`,
      evolutionStatus: payload.evolutionStatus ?? null,
    };
  } catch {
    return { detail: `HTTP ${response.status}`, evolutionStatus: null };
  }
}
