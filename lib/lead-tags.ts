/**
 * Etiquetas manuales de leads (tablas lead_tags + lead_tag_assignments del
 * backend, migración 002_lead_tags). Son aparte del pipeline: una etiqueta no
 * mueve la etapa ni le cambia nada al bot, y un lead puede tener varias. El
 * catálogo es de todo el cliente: lo que crea un vendedor lo ven los demás y
 * el panel de dueños (que usa las mismas tablas).
 *
 * Este archivo es puro (sin Supabase): lo importan componentes de cliente y
 * rutas por igual. Las consultas están en lead-tags-server.ts.
 */

export const TAG_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'pink', 'teal', 'gray'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface LeadTag {
  id: string;
  name: string;
  color: TagColor;
}

export interface LeadTagWithCount extends LeadTag {
  /** Leads del vendedor que la tienen. */
  count: number;
}

export const TAG_NAME_MAX = 40;
/** Tope de etiquetas por cliente: más que esto ya no se puede leer en la barra. */
export const MAX_TAGS_PER_CLIENT = 50;

/** Colores de pantalla por clave (la clave es la que guarda lead_tags.color, compartida con el panel). */
export const TAG_PALETTE: Record<TagColor, string> = {
  blue: '#3b7ef5',
  green: '#6bdda1',
  amber: '#f59e0b',
  red: '#f87171',
  violet: '#a78bfa',
  pink: '#e879f9',
  teal: '#22d3ee',
  gray: '#848484',
};

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

/**
 * Crear y poner etiquetas puede cualquiera que use la app (en Roller los que
 * atienden son vendedores, y el dueño no entra acá); renombrar y borrar es
 * del dueño, desde el panel. Esto decide sólo eso último.
 */
export function canManageTags(roles: string[]): boolean {
  return roles.some((r) => MANAGER_ROLES.has(r));
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Nombre limpio (sin espacios de más) o null si no sirve. */
export function normalizeTagName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name || name.length > TAG_NAME_MAX) return null;
  return name;
}

export function normalizeTagColor(raw: unknown): TagColor | null {
  return TAG_COLORS.includes(raw as TagColor) ? (raw as TagColor) : null;
}

export function sortTagsByName<T extends { name: string }>(tags: T[]): T[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}
