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

export function LeadPanel({ lead, followups, open, onClose, sentinelState }: LeadPanelProps) {
  const pending = followups.filter((f) => f.status === 'pending');
  const initial = (lead.name ?? lead.phone ?? '?').charAt(0).toUpperCase();

  return (
    <aside style={{ width: open ? 288 : 0, minWidth: open ? 288 : 0, overflow: 'hidden', transition: 'width .2s ease, min-width .2s ease', borderLeft: open ? '1px solid var(--line)' : 'none', background: 'var(--ink-1)', flexShrink: 0 }}>
      <div style={{ width: 288, height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 14px 12px' }}>
          <span className="scala-alt" style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 700 }}>Info del lead</span>
          <button onClick={onClose} aria-label="Cerrar info del lead" style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>×</button>
        </div>

        <section style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', background: 'var(--ink-5)', border: '1px solid var(--line-2)', fontFamily: 'var(--display)', fontSize: 16 }}>{initial}</div>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', color: 'var(--text)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name ?? 'Sin nombre'}</strong>
              <span style={{ color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--mono)' }}>{formatPhone(lead.phone)}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginTop: 12 }}>
            <button className="scala-button">Llamar</button>
            <button className="scala-button">Notas</button>
            <button className="scala-button">Derivar</button>
          </div>
        </section>

        <section style={{ padding: 14, borderBottom: '1px solid var(--line)' }}>
          <Eyebrow action={<span className="scala-alt" style={{ color: 'var(--green)', fontSize: 9, fontWeight: 800 }}>IA · {sentinelState.confidence}%</span>}>Temperatura</Eyebrow>
          <div style={{ marginTop: 14 }}>
            <TemperatureCard score={lead.score} state={sentinelState} />
          </div>
        </section>

        <section style={{ padding: 14, borderBottom: '1px solid var(--line)' }}>
          <Eyebrow action={<span className="scala-alt" style={{ color: 'var(--green)', fontSize: 9, fontWeight: 800 }}>Sentinel</span>}>Datos extraídos</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginTop: 14 }}>
            <FactCard span={2} label="Etapa" value={`Nuevo → ${stageLabel(lead.stage)}`} />
            <FactCard label="Ambiente" value={getField(lead, 'Ambiente')} />
            <FactCard label="Medidas" value={lead.measurementsInfo ?? getField(lead, 'Medidas')} />
            <FactCard label="Sistemas mostrados" value={lead.productType ?? getField(lead, 'Producto')} />
            <FactCard label="Instancia" value={lead.sourceInstance} />
            <FactCard label="Presupuesto estimado" value={getField(lead, 'Presupuesto')} />
            <FactCard label="Plazo" value={getField(lead, 'Urgencia')} />
          </div>
        </section>

        <section style={{ padding: 14, borderBottom: '1px solid var(--line)' }}>
          <Eyebrow action={pending.length > 0 && <span className="scala-alt" style={{ color: 'var(--warm)', fontSize: 9, fontWeight: 800 }}>{pending.length} pendiente</span>}>Seguimientos</Eyebrow>
          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            {pending.length ? pending.map((followup) => <FollowupCard key={followup.id} followup={followup} />) : <p style={{ color: 'var(--text-4)', fontSize: 12 }}>Sin seguimientos pendientes.</p>}
          </div>
        </section>

        <section style={{ padding: 14 }}>
          <Eyebrow>Historial</Eyebrow>
          <div style={{ marginTop: 14, display: 'grid', gap: 12, borderLeft: '1px solid var(--line-2)', paddingLeft: 10 }}>
            <TimelineItem color="var(--green)" time="04:10 · hace 2 min">Sentinel mostró catálogo de sistemas.</TimelineItem>
            <TimelineItem color="var(--text-3)" time="04:08 · hace 4 min">Lead pidió más información.</TimelineItem>
          </div>
        </section>
      </div>
    </aside>
  );
}
