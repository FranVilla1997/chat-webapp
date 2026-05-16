export interface Message {
  id: string | number;
  lead_id: string;
  client_id: string;
  role: 'user' | 'assistant' | 'human_agent' | 'system';
  content: string;
  was_audio: boolean;
  created_at: string;
  whatsapp_message_id?: string | null;
  whatsapp_remote_jid?: string | null;
  whatsapp_from_me?: boolean | null;
  whatsapp_message_key?: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  } | null;
  attachments?: MessageAttachment[];
}

export type MessageAttachmentMediaType = 'audio' | 'image' | 'video' | 'document';

export interface MessageAttachment {
  id: string;
  message_id: string;
  lead_id: string;
  client_id: string;
  storage_bucket: string;
  storage_path: string;
  media_type: MessageAttachmentMediaType;
  mime_type: string;
  file_name: string;
  caption?: string | null;
  duration_seconds?: number | null;
  created_at?: string;
}

export interface ConversationParams {
  lead_phone: string;
  lead_id: string;
  instance: string;
  client_id: string;
}

export interface N8nChatHistoryMessage {
  type: 'ai' | 'human';
  text: string;
}

export interface LeadField {
  label: string;
  value: string;
}

export interface LeadInfo {
  name?: string;
  stage?: string;
  score?: string;
  phone?: string;
  sourceInstance?: string;
  sellerName?: string;
  productType?: string;
  measurementsInfo?: string;
  qualificationReason?: string;
  qualifiedAt?: string;
  stageChangedAt?: string;
  proposalSentAt?: string;
  proposalAmount?: string;
  wonAmount?: string;
  botPausedAt?: string;
  botResumeAt?: string;
  botPausedBy?: string;
  fields?: LeadField[];
}

export interface SellerProfile {
  id: string;
  user_id: string;
  client_id: string;
  name: string | null;
  airtable_seller_name: string | null;
  created_at: string;
}

export interface AirtableLead {
  // Identificación
  RecordID: string;
  phone: string;
  whatsapp_display_name: string;
  name: string;
  client: string;
  client_record_id: string;

  // Routing y estado del bot
  CHAT: string;
  bot_status_display: string;
  bot_can_reply: string;
  bot_can_followup: string;
  bot_paused_by: string;
  bot_paused_at: string;
  bot_resume_at: string;

  // Instancia WhatsApp
  source_instance: string;

  // Vendedor
  vendedor_asignado: string;

  // Etapas y calificación
  current_stage: string;
  previous_stage: string;
  score: string;
  qualification_reason: string;
  qualified_at: string;
  stage_changed_at: string;

  // Información del producto (usada por el agente de IA)
  dolor_principal: string;
  tipo_producto: string;
  medidas_info: string;
  zona_instalacion: string;
  urgencia_compra: string;

  // Mensajes
  last_message_at: string;
  last_message_summary: string;
  last_message_from: string;
  total_messages: string;

  // Seguimiento
  next_followup_at: string;
  followup_count: string;

  // Propuesta comercial
  proposal_sent_at: string;
  proposal_amount: string;
  won_amount: string;
  lost_reason: string;

  // Metadata
  source: string;
  tags: string;
  notes: string;
  created_at: string;
}
