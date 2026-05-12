import { redirect } from 'next/navigation';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { getLeadsBySellerName } from '@/lib/airtable';
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

  const { data: profile } = await supabase
    .from('seller_profiles')
    .select('*')
    .eq('user_id', session.user.id)
    .single();

  if (!profile) redirect('/login');

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
    const { data: msgs } = await service
      .from('messages')
      .select('lead_id, role, content, created_at')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false })
      .limit(leadIds.length * 10);

    if (msgs) {
      for (const msg of msgs) {
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

  return (
    <ChatList
      initialLeads={leads}
      sellerName={profile.name}
      clientId={profile.client_id}
      lastMessages={lastMessages}
      airtableBaseId={airtableBaseId}
      airtableTableId={airtableTableId}
    />
  );
}
