import type { AirtableLead, LeadInfo, LeadField } from './types';

export function buildLeadInfoFromAirtable(lead: AirtableLead): LeadInfo {
  const fields: LeadField[] = [];
  if (lead.source_instance) fields.push({ label: 'Instancia', value: lead.source_instance });
  if (lead.medidas_info)     fields.push({ label: 'Medidas',   value: lead.medidas_info });
  if (lead.tipo_producto)    fields.push({ label: 'Producto',  value: lead.tipo_producto });
  if (lead.zona_instalacion) fields.push({ label: 'Zona',      value: lead.zona_instalacion });
  if (lead.urgencia_compra)  fields.push({ label: 'Urgencia',  value: lead.urgencia_compra });
  if (lead.dolor_principal)  fields.push({ label: 'Dolor',     value: lead.dolor_principal });
  return {
    name:   lead.whatsapp_display_name || lead.name,
    stage:  lead.current_stage,
    score:  lead.score,
    phone:  lead.phone,
    sourceInstance: lead.source_instance,
    sellerName: lead.vendedor_asignado,
    productType: lead.tipo_producto,
    measurementsInfo: lead.medidas_info,
    botPausedAt: lead.bot_paused_at,
    botResumeAt: lead.bot_resume_at,
    botPausedBy: lead.bot_paused_by,
    fields,
  };
}
