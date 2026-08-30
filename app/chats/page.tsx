import { redirect } from 'next/navigation';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { getLeadsBySellerName } from '@/lib/airtable';
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
  const airtableSource = { baseId: airtableBaseId, tableId: airtableTableId };

  const leads = profile.airtable_seller_name
    ? await getLeadsBySellerName(profile.airtable_seller_name, airtableSource)
    : [];

  // Último mensaje por lead vía RPC (sin ventana — ver lib/last-messages.ts).
  let lastMessages: Record<string, LastMessage> = {};
  if (leads.length > 0) {
    const service = createSupabaseServiceClient();
    lastMessages = await fetchLastMessages(service, profile.client_id, leads.map(l => l.RecordID));
  }

  const crmAccess = await hasCrmAccess(profile.user_id);

  return (
    <ChatList
      initialLeads={leads}
      sellerName={profile.name}
      clientId={profile.client_id}
      lastMessages={lastMessages}
      airtableBaseId={airtableBaseId}
      airtableTableId={airtableTableId}
      crmAccess={crmAccess}
    />
  );
}
