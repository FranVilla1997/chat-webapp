export interface Message {
  id: string | number;
  lead_id: string;
  client_id: string;
  role: 'user' | 'assistant' | 'human_agent' | 'system';
  content: string;
  was_audio: boolean;
  created_at: string;
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
  botPausedAt?: string;
  botResumeAt?: string;
  botPausedBy?: string;
  fields?: LeadField[];
}

export type LeadPriority = 'normal' | 'needs_human' | 'stuck' | 'hot';

export type SentinelGoal = 'saludar' | 'calificar' | 'catalogo' | 'medidas' | 'presupuesto' | 'seguimiento';

export interface SentinelState {
  currentGoal: SentinelGoal;
  currentAction: string;
  missingFacts: string[];
  confidence: number;
  intentScore: number;
  temperature: 'frio' | 'tibio' | 'caliente';
  needsHuman: boolean;
  needsHumanReason?: string;
  nextAction?: string;
  priority: LeadPriority;
}

export interface AiSuggestion {
  id: string;
  text: string;
  reason?: string;
  confidence?: number;
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
