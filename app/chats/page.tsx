import { redirect } from 'next/navigation';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { getLeadsBySellerName } from '@/lib/airtable';
import { getSellerProfile } from '@/lib/auth';
import { hasCrmAccess } from '@/lib/crm-access';
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

  // Traer el último mensaje de Supabase para cada lead en una sola query
  const lastMessages: Record<string, LastMessage> = {};
  if (leads.length > 0) {
    const leadIds = leads.map(l => l.RecordID);
    const service = createSupabaseServiceClient();
    // Un solo query por cliente (últimos 1000 mensajes) filtrado en memoria:
    // con carteras grandes, in(leadIds) generaba una URL enorme que fallaba en
    // silencio y la bandeja arrancaba sin previews.
    const requested = new Set(leadIds);
    const { data: msgs } = await service
      .from('messages')
      .select('lead_id, role, content, created_at')
      .eq('client_id', profile.client_id)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (msgs) {
      for (const msg of msgs) {
        if (!requested.has(msg.lead_id)) continue;
        if (!lastMessages[msg.lead_id]) {
          lastMessages[msg.lead_id] = {
            content: msg.content,
            role: msg.role,
            created_at: msg.created_at,
          };
        }
      }
    }
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
