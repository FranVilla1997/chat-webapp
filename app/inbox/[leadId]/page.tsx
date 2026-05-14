import { redirect } from 'next/navigation';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getLeadById } from '@/lib/airtable';
import { buildLeadInfoFromAirtable } from '@/lib/utils';

interface InboxLeadPageProps {
  params: { leadId: string };
  searchParams: {
    airtable_base_id?: string;
    airtable_table_id?: string;
    base_id?: string;
    table_id?: string;
  };
}

export default async function InboxLeadPage({ params, searchParams }: InboxLeadPageProps) {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const lead = await getLeadById(params.leadId, {
    baseId: searchParams.airtable_base_id ?? searchParams.base_id,
    tableId: searchParams.airtable_table_id ?? searchParams.table_id,
  });

  if (!lead) redirect('/inbox');

  return (
    <ChatContainer
      leadPhone={lead.phone}
      leadId={lead.RecordID}
      clientId={lead.client_record_id}
      instance={lead.source_instance}
      leadInfo={buildLeadInfoFromAirtable(lead)}
      showBack
    />
  );
}
