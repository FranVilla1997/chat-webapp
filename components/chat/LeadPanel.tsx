import { Eyebrow } from '@/components/brand/Eyebrow';
import { FactCard } from '@/components/lead/FactCard';
import { FollowupCard } from '@/components/lead/FollowupCard';
import { TemperatureCard } from '@/components/lead/TemperatureCard';
import { TimelineItem } from '@/components/lead/TimelineItem';
import { stageLabel } from '@/components/inbox/StageTag';
import type { LeadInfo, SentinelState } from '@/lib/types';
import type { Followup } from '@/hooks/useFollowups';

interface LeadPanelProps {
  lead: LeadInfo;
  followups: Followup[];
  open: boolean;
  onClose: () => void;
  sentinelState: SentinelState;
}

function formatPhone(p?: string) {
  if (!p) return '';
  if (p.startsWith('549') && p.length >= 12) return `+54 9 ${p.slice(3, 5)} ${p.slice(5, 9)}-${p.slice(9)}`;
  return `+${p}`;
}

function getField(lead: LeadInfo, label: string) {
  return lead.fields?.find((field) => field.label.toLowerCase() === label.toLowerCase())?.value;
}

function buildSummary(lead: LeadInfo, state: SentinelState) {
  const product = lead.productType ?? getField(lead, 'Producto');
  const measures = lead.measurementsInfo ?? getField(lead, 'Medidas');
  const zone = getField(lead, 'Zona');
  const interest = product ? `Mostró interés en ${product}.` : 'Todavía no definió sistema o producto.';
  const missing: string[] = [];

  if (!measures) missing.push('medidas');
  if (!zone) missing.push('zona');
  if (!product) missing.push('sistema');

  return `${interest} ${missing.length ? `Falta confirmar ${missing.join(', ')}.` : 'Tiene los datos principales para avanzar.'} Confianza IA ${state.confidence}%.`;
}

function normalizeMeasureItem(item: string) {
  return item
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(\d+)\s+(?:de|x|×)\s+(\d+(?:[,.]\d+)?)\s*x\s*(\d+(?:[,.]\d+)?)(?:\s*cm)?$/i, '$1 × $2 x $3 cm');
}

function formatMeasurements(value?: string) {
  if (!value) return undefined;
  const text = value.replace(/×/g, 'x').trim();
  const labelPattern = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+):/g;
  const matches = Array.from(text.matchAll(labelPattern));

  if (!matches.length) return text;

  const groups = matches.map((match, index) => {
    const label = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const body = text.slice(start, end).replace(/[.;]\s*$/, '').trim();
    const items = body
      .split(/,\s*/)
      .map(normalizeMeasureItem)
      .filter(Boolean);

    return { label, items };
  });

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {groups.map((group) => (
        <div key={group.label}>
          <div style={{ color: 'var(--text)', fontWeight: 740, marginBottom: 3 }}>{group.label}</div>
          <div style={{ display: 'grid', gap: 2, color: 'var(--text-2)', fontWeight: 520 }}>
            {group.items.map((item) => <span key={item}>• {item}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeadPanel({ lead, followups, open, onClose, sentinelState }: LeadPanelProps) {
  const pending = followups.filter((f) => f.status === 'pending');
  const initial = (lead.name ?? lead.phone ?? '?').charAt(0).toUpperCase();
  const nextAction = sentinelState.currentGoal === 'presupuesto'
    ? 'Preparar y enviar presupuesto al cliente.'
    : sentinelState.missingFacts.length
      ? `Pedir ${sentinelState.missingFacts.join(' y ')} para avanzar.`
      : 'Continuar la conversación y validar intención de compra.';

  return (
    <aside style={{ width: open ? 320 : 0, minWidth: open ? 320 : 0, overflow: 'hidden', transition: 'width .2s ease, min-width .2s ease', borderLeft: open ? '1px solid var(--line)' : 'none', background: 'var(--ink-1)', flexShrink: 0 }}>
      <div style={{ width: 320, height: '100%', overflowY: 'auto', padding: 16, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 16, fontWeight: 760 }}>Info del lead</h2>
          <button onClick={onClose} aria-label="Cerrar info del lead" style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <section className="scala-panel" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(255,255,255,0.04))', border: '1px solid var(--line)', fontFamily: 'var(--display)', fontSize: 16 }}>{initial}</div>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', color: 'var(--text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name ?? 'Sin nombre'}</strong>
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{formatPhone(lead.phone)}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            <button className="scala-button">Llamar</button>
            <button className="scala-button">Notas</button>
            <button className="scala-button">Derivar</button>
          </div>
        </section>

        <section className="scala-panel" style={{ padding: 14 }}>
          <Eyebrow>Resumen del lead</Eyebrow>
          <p style={{ margin: '10px 0 0', color: 'var(--text-2)', fontSize: 13, lineHeight: 1.58 }}>
            {buildSummary(lead, sentinelState)}
          </p>
        </section>

        <section style={{ border: '1px solid rgba(96,165,250,0.18)', background: 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(255,255,255,0.025))', borderRadius: 'var(--radius-md)', padding: 14 }}>
          <div style={{ color: 'var(--blue-200)', fontSize: 12, fontWeight: 750, marginBottom: 8 }}>Próxima mejor acción</div>
          <p style={{ margin: 0, color: 'var(--text)', fontSize: 14, lineHeight: 1.48 }}>{nextAction}</p>
        </section>

        <section className="scala-panel" style={{ padding: 14 }}>
          <Eyebrow action={<span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700 }}>IA {sentinelState.confidence}%</span>}>Temperatura comercial</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <TemperatureCard score={lead.score} state={sentinelState} />
          </div>
        </section>

        <section className="scala-panel" style={{ padding: 14 }}>
          <Eyebrow>Datos capturados</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <FactCard span={2} label="Etapa" value={`Nuevo → ${stageLabel(lead.stage)}`} />
            <FactCard label="Producto" value={lead.productType ?? getField(lead, 'Producto')} />
            <FactCard label="Ambiente" value={getField(lead, 'Ambiente')} />
            <FactCard span={2} label="Medidas" value={formatMeasurements(lead.measurementsInfo ?? getField(lead, 'Medidas'))} />
            <FactCard label="Zona" value={getField(lead, 'Zona')} />
            <FactCard label="Presupuesto" value={getField(lead, 'Presupuesto')} />
            <FactCard label="Plazo" value={getField(lead, 'Urgencia')} />
            <FactCard span={2} label="Instancia" value={lead.sourceInstance} />
          </div>
        </section>

        <section className="scala-panel" style={{ padding: 14 }}>
          <Eyebrow action={pending.length > 0 && <span style={{ color: 'var(--warm)', fontSize: 11, fontWeight: 700 }}>{pending.length} pendiente</span>}>Seguimientos</Eyebrow>
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {pending.length ? pending.map((followup) => <FollowupCard key={followup.id} followup={followup} />) : <p style={{ color: 'var(--text-4)', fontSize: 13, margin: 0 }}>Sin seguimientos pendientes.</p>}
          </div>
        </section>

        <section style={{ padding: '4px 2px 12px' }}>
          <Eyebrow>Historial</Eyebrow>
          <div style={{ marginTop: 12, display: 'grid', gap: 10, opacity: 0.68 }}>
            <TimelineItem color="var(--green)" time="Hace 2 min">Sentinel mostró catálogo de sistemas.</TimelineItem>
            <TimelineItem color="var(--text-4)" time="Hace 4 min">Lead pidió más información.</TimelineItem>
          </div>
        </section>
      </div>
    </aside>
  );
}
