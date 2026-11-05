'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TAG_PALETTE, sortTagsByName, type LeadTag, type LeadTagWithCount } from '@/lib/lead-tags';

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

/** Color de pantalla de una etiqueta (la clave es la que guarda lead_tags.color). */
export function tagColor(tag: Pick<LeadTag, 'color'>): string {
  return TAG_PALETTE[tag.color] ?? TAG_PALETTE.gray;
}

interface TagChipProps {
  tag: Pick<LeadTag, 'name' | 'color'>;
  /** xs para la fila de la bandeja y el header, sm para el panel del lead. */
  size?: 'xs' | 'sm';
  /** Si viene, el chip muestra una × para sacar la etiqueta. */
  onRemove?: () => void;
  disabled?: boolean;
}

/** Etiqueta manual de un lead. Va en color y en minúsculas de texto, para no confundirse con la etapa. */
export function TagChip({ tag, size = 'sm', onRemove, disabled }: TagChipProps) {
  const color = tagColor(tag);
  return (
    <span
      title={tag.name}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%',
        padding: size === 'xs' ? '1px 6px' : '2px 8px', borderRadius: 3,
        border: `1px solid ${color}55`, background: `${color}1a`, color,
        fontSize: size === 'xs' ? 9 : 10, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.03em',
        lineHeight: size === 'xs' ? '13px' : '15px', whiteSpace: 'nowrap', overflow: 'hidden',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          disabled={disabled}
          aria-label={`Sacar la etiqueta ${tag.name}`}
          style={{ background: 'none', border: 'none', padding: 0, marginLeft: 1, color: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer', opacity: 0.7, fontSize: 12, lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </span>
  );
}

interface LeadTagsControlProps {
  /** ID del deal. */
  dealId: string;
  /** Catálogo del cliente, con conteos. */
  tags: LeadTagWithCount[];
  /** Etiquetas que trae el lead desde el servidor. */
  tagIds: string[];
  /** Avisa con las etiquetas con las que quedó el lead (para la lista de la bandeja). */
  onChange?: (tagIds: string[]) => void;
  /** Se creó una etiqueta nueva: para sumarla al catálogo en memoria. */
  onTagCreated?: (tag: LeadTagWithCount) => void;
}

/**
 * Etiquetas manuales del lead, en su panel lateral: ponerlas, sacarlas y crear
 * una nueva ahí mismo. Son aparte del pipeline: no mueven la etapa ni le
 * cambian nada al bot. Pedido de Roller (05/11/2026): sus vendedoras no podían
 * etiquetar leads ni filtrar por etiqueta desde esta app.
 */
export function LeadTagsControl({ dealId, tags, tagIds, onChange, onTagCreated }: LeadTagsControlProps) {
  const [applied, setApplied] = useState<string[]>(tagIds);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lo que llega del servidor (polling de la bandeja) manda, salvo mientras
  // hay un cambio propio en vuelo: una respuesta vieja no lo deshace.
  const tagIdsKey = [...tagIds].sort().join(',');
  useEffect(() => {
    if (pendingRef.current === 0) setApplied(tagIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagIdsKey]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  // Una etiqueta borrada del catálogo deja de mostrarse aunque el lead todavía la traiga.
  const appliedTags = sortTagsByName(applied.map((id) => tagById.get(id)).filter((t): t is LeadTagWithCount => Boolean(t)));

  const term = query.replace(/\s+/g, ' ').trim();
  const matches = term ? tags.filter((t) => t.name.toLowerCase().includes(term.toLowerCase())) : tags;
  const exact = tags.find((t) => t.name.toLowerCase() === term.toLowerCase());
  const canCreate = term.length > 0 && !exact;

  async function toggle(tag: LeadTagWithCount) {
    if (busy.has(tag.id)) return;
    const had = applied.includes(tag.id);
    setError(null);
    setApplied((prev) => (had ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]));
    setBusy((prev) => new Set(prev).add(tag.id));
    pendingRef.current++;
    try {
      const res = await fetch('/api/leads/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, tagId: tag.id, action: had ? 'remove' : 'add' }),
      });
      const body = (await res.json().catch(() => ({}))) as { tagIds?: string[]; error?: string };
      if (!res.ok || !body.tagIds) throw new Error(body.error ?? 'No se pudo actualizar la etiqueta');
      // Con otro cambio todavía en vuelo se deja lo que se ve; lo ordena el último.
      if (pendingRef.current === 1) setApplied(body.tagIds);
      onChange?.(body.tagIds);
    } catch (err) {
      setApplied((prev) => (had ? (prev.includes(tag.id) ? prev : [...prev, tag.id]) : prev.filter((id) => id !== tag.id)));
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la etiqueta');
    } finally {
      pendingRef.current--;
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(tag.id);
        return next;
      });
    }
  }

  async function createAndApply() {
    if (!canCreate || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: term }),
      });
      const body = (await res.json().catch(() => ({}))) as { tag?: LeadTagWithCount; error?: string };
      if (!res.ok || !body.tag) throw new Error(body.error ?? 'No se pudo crear la etiqueta');
      onTagCreated?.(body.tag);
      setQuery('');
      await toggle(body.tag);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la etiqueta');
    } finally {
      setCreating(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (exact) void toggle(exact);
    else if (matches.length === 1 && !canCreate) void toggle(matches[0]);
    else if (canCreate) void createAndApply();
  }

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#404050', fontFamily: MONO }}>
          Etiquetas
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            background: open ? 'rgba(59,126,245,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${open ? 'rgba(59,126,245,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: open ? '#3b7ef5' : '#848484',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: MONO,
          }}
        >
          {open ? 'Cerrar' : '+ Agregar'}
        </button>
      </div>

      {appliedTags.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {appliedTags.map((tag) => (
            <TagChip key={tag.id} tag={tag} disabled={busy.has(tag.id)} onRemove={() => void toggle(tag)} />
          ))}
        </div>
      ) : (
        !open && <p style={{ fontSize: 11, color: '#404050', margin: 0 }}>Sin etiquetas</p>
      )}

      {open && (
        <div style={{ border: '1px solid #2a2a38', background: '#0f0f16', borderRadius: 5, overflow: 'hidden' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            maxLength={40}
            placeholder="Buscar o crear…"
            style={{
              width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none',
              borderBottom: '1px solid #1e1e2a', padding: '7px 10px', fontSize: 12, color: '#e4e4e8', outline: 'none',
            }}
          />
          <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 0' }}>
            {tags.length === 0 && !canCreate && (
              <p style={{ padding: '8px 10px', margin: 0, fontSize: 11, color: '#848484', lineHeight: 1.4 }}>
                Todavía no hay etiquetas. Escribí un nombre y Enter para crear la primera.
              </p>
            )}
            {matches.map((tag) => {
              const isOn = applied.includes(tag.id);
              const color = tagColor(tag);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => void toggle(tag)}
                  disabled={busy.has(tag.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    opacity: busy.has(tag.id) ? 0.6 : 1,
                  }}
                >
                  <span style={{
                    width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                    border: `1px solid ${isOn ? '#e4e4e8' : '#2a2a38'}`,
                    background: isOn ? '#e4e4e8' : 'transparent',
                    color: '#000', fontSize: 10, fontWeight: 900, lineHeight: '13px', textAlign: 'center',
                  }}>
                    {isOn ? '✓' : ''}
                  </span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#e4e4e8' }}>
                    {tag.name}
                  </span>
                  <span style={{ fontSize: 10, color: '#404050', fontFamily: MONO }}>{tag.count}</span>
                </button>
              );
            })}
            {tags.length > 0 && matches.length === 0 && !canCreate && (
              <p style={{ padding: '8px 10px', margin: 0, fontSize: 11, color: '#848484' }}>Ninguna etiqueta con ese nombre</p>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => void createAndApply()}
                disabled={creating}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  background: 'transparent', border: 'none', borderTop: tags.length ? '1px solid #1e1e2a' : 'none',
                  cursor: 'pointer', textAlign: 'left', color: '#6bdda1', fontSize: 12, opacity: creating ? 0.6 : 1,
                }}
              >
                <span style={{ fontWeight: 900 }}>+</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {creating ? 'Creando…' : `Crear «${term}»`}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p style={{ margin: 0, color: '#f87171', fontSize: 10 }}>{error}</p>}
    </div>
  );
}
