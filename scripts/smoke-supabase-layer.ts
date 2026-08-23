// Smoke test post-migración de lib/airtable.ts a Supabase. Uso: npx tsx scripts/smoke-supabase-layer.ts
import { getLeadsBySellerName, getPipelineStages, getAllSales, getAirtableSellers, getLeadById } from '../lib/airtable';

async function main() {
  const leads = await getLeadsBySellerName('Ludmi Ciarrocca');
  console.log('getLeadsBySellerName(Ludmi):', leads.length, '| primero:', leads[0]?.name, '| stage:', leads[0]?.current_stage, '| instancia:', leads[0]?.source_instance);
  const stages = await getPipelineStages();
  console.log('getPipelineStages:', stages.map((s) => `${s.name}(${s.order})`).join(', '));
  const sales = await getAllSales();
  console.log('getAllSales:', sales.length, '| primera:', sales[0]?.amount, sales[0]?.status, sales[0]?.sellerName);
  const sellers = await getAirtableSellers();
  console.log('getAirtableSellers:', sellers.map((s) => s.name + (s.active ? '✓' : '✗')).join(', '));
  const lead = await getLeadById(leads[0].RecordID);
  console.log('getLeadById(uuid):', lead?.name, '| vendedor:', lead?.vendedor_asignado, '| resume_at:', lead?.bot_resume_at || '(no pausado)');
}
main().catch((e) => { console.error('SMOKE FALLÓ:', e.message); process.exit(1); });
