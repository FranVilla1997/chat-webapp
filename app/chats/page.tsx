import { redirect } from 'next/navigation';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import {
  getLeadsPageForSeller,
  getPipelineStages,
  getRecentlyActiveLeadsForSeller,
  getStageCountsForSeller,
  resolveSellerByName,
} from '@/lib/airtable';
import type { AirtableLead } from '@/lib/types';
import { getSellerProfile } from '@/lib/auth';
import { hasCrmAccess } from '@/lib/crm-access';
import { fetchLastMessages } from '@/lib/last-messages';
import { ChatList } from '@/components/chat/ChatList';

export interface LastMessage {
  content: string;
  role: string;
  created_at: string;
}

interface ChatsPageProps {
  searchParams: {
    airtable_base_id?: string;
    airtable_table_id?: string;
    base_id?: string;
    table_id?: string;
  };
}

export default async function ChatsPage({ searchParams }: ChatsPageProps) {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  // El lookup vive en getSellerProfile: service client + tolerancia a
  // duplicados, para que ni un perfil repetido ni un cambio de RLS vuelvan a
  // dejar a los vendedores sin bandeja.
  const profile = await getSellerProfile();

  // Hay sesión pero no perfil: mandarlo a /login lo mete en un loop de
  // redirects (middleware rebota /login a / con sesión). Ver app/sin-perfil.
  if (!profile) redirect('/sin-perfil');

  const airtableBaseId = searchParams.airtable_base_id ?? searchParams.base_id;
  const airtableTableId = searchParams.airtable_table_id ?? searchParams.table_id;

  // Primera ventana de la bandeja (no la cartera entera): la página de los
  // más recientes, los conteos por etapa y los leads con actividad reciente.
  // El resto lo pide ChatList a /api/leads al filtrar, buscar o cargar más.
  let leads: AirtableLead[] = [];
  let recent: AirtableLead[] = [];
  let total = 0;
  let counts: Record<string, number> = { all: 0 };
  let lastMessages: Record<string, LastMessage> = {};

  const seller = profile.airtable_seller_name
    ? await resolveSellerByName(profile.airtable_seller_name)
    : null;
  if (seller) {
    const [page, stageCounts, recentAll] = await Promise.all([
      getLeadsPageForSeller(seller),
      getStageCountsForSeller(seller),
      getRecentlyActiveLeadsForSeller(seller),
    ]);
    leads = page.leads;
    total = page.total;
    counts = stageCounts;
    const inPage = new Set(leads.map((l) => l.RecordID));
    recent = recentAll.filter((l) => !inPage.has(l.RecordID));

    // Último mensaje por lead vía RPC (sin ventana — ver lib/last-messages.ts).
    const service = createSupabaseServiceClient();
    lastMessages = await fetchLastMessages(service, profile.client_id, [...leads, ...recent].map(l => l.RecordID));
  }

  const crmAccess = await hasCrmAccess(profile.user_id);

  // Etapas del pipeline del tenant para la barra lateral. Antes estaban
  // hardcodeadas con las de Roller y un tenant con otro pipeline (SCALA)
  // tenía leads en etapas que no se podían filtrar.
  const stages = await getPipelineStages(profile.client_id).catch(() => []);

  return (
    <ChatList
      initialLeads={leads}
      initialTotal={total}
      initialCounts={counts}
      initialRecent={recent}
      sellerName={profile.name}
      clientId={profile.client_id}
      lastMessages={lastMessages}
      airtableBaseId={airtableBaseId}
      airtableTableId={airtableTableId}
      crmAccess={crmAccess}
      stages={stages}
    />
  );
}
