import Image from 'next/image';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { getLeadById } from '@/lib/airtable';
import { buildLeadInfoFromAirtable } from '@/lib/utils';
import type { LeadInfo, LeadField } from '@/lib/types';

interface PageProps {
  searchParams: {
    lead_phone?: string;
    lead_id?: string;
    instance?: string;
    client_id?: string;
    lead_name?: string;
    lead_stage?: string;
    lead_score?: string;
    lead_fields?: string;
    vendedor?: string;
    seller?: string;
    sellerName?: string;
    producto?: string;
    product?: string;
    medidas?: string;
    measurements?: string;
  };
}

function parseLeadFields(raw?: string): LeadField[] {
  if (!raw) return [];
  return raw.split(',').flatMap((pair) => {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) return [];
    const label = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();
    if (!label || !value) return [];
    return [{ label, value }];
  });
}

export default async function ConversationPage({ searchParams }: PageProps) {
  const { lead_id } = searchParams;

  // Fetch lead from Airtable when lead_id is present
  const airtableLead = lead_id ? await getLeadById(lead_id) : null;

  // Resolve props: prefer Airtable data, fall back to URL params for backward compat
  const leadPhone  = airtableLead?.phone         ?? searchParams.lead_phone;
  const leadId     = airtableLead?.RecordID       ?? searchParams.lead_id;
  const instance   = airtableLead?.source_instance ?? searchParams.instance;
  const clientId   = airtableLead?.client_record_id ?? searchParams.client_id;

  const leadInfo: LeadInfo = airtableLead
    ? buildLeadInfoFromAirtable(airtableLead)
    : {
        name:   searchParams.lead_name,
        stage:  searchParams.lead_stage,
        score:  searchParams.lead_score,
        sellerName: searchParams.sellerName ?? searchParams.vendedor ?? searchParams.seller,
        productType: searchParams.producto ?? searchParams.product,
        measurementsInfo: searchParams.medidas ?? searchParams.measurements,
        fields: parseLeadFields(searchParams.lead_fields),
      };

  if (!leadPhone || !leadId || !instance || !clientId) {
    const missing = ['lead_phone / lead_id', 'instance', 'client_id'].filter((_, i) => {
      return [!leadPhone || !leadId, !instance, !clientId][i];
    });
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100svh',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 24px', textAlign: 'center',
      }}>
        <Image src="/logo/scala-logo.svg" alt="SCALA" width={100} height={13}
          style={{ filter: 'brightness(0) invert(1)', opacity: 0.5, marginBottom: 40 }} />
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="rgba(248,113,113,0.9)" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#f0f0f5', marginBottom: 8 }}>
          Lead no encontrado
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', marginBottom: 6 }}>
          {missing.length > 0
            ? <>Faltan: {missing.map(m => <code key={m} style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4, marginLeft: 4 }}>{m}</code>)}</>
            : 'No se pudo cargar el lead desde Airtable.'}
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', marginTop: 16, letterSpacing: '0.04em' }}>
          Accedé desde el link en Airtable o desde /chats
        </p>
      </div>
    );
  }

  return (
    <ChatContainer
      leadPhone={leadPhone}
      leadId={leadId}
      clientId={clientId}
      instance={instance}
      leadInfo={leadInfo}
      showBack
    />
  );
}
