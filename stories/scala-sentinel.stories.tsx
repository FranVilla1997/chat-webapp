import '../app/globals.css';
import { StairsAccent } from '@/components/brand/StairsAccent';
import { Eyebrow } from '@/components/brand/Eyebrow';
import { StageTag } from '@/components/inbox/StageTag';
import { IntentBar } from '@/components/inbox/IntentBar';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { SentinelContextStrip } from '@/components/chat/SentinelContextStrip';
import { FactCard } from '@/components/lead/FactCard';
import { FollowupCard } from '@/components/lead/FollowupCard';
import type { Followup } from '@/hooks/useFollowups';
import type { Message, SentinelState } from '@/lib/types';

const state: SentinelState = {
  currentGoal: 'calificar',
  currentAction: 'explicando catálogo',
  missingFacts: ['medidas', 'ambiente'],
  confidence: 82,
  intentScore: 62,
  temperature: 'tibio',
  needsHuman: false,
  priority: 'normal',
};

const message: Message = {
  id: '1',
  lead_id: 'lead',
  client_id: 'client',
  role: 'assistant',
  content: '**Fabricamos cortinas roller a medida.**\n- Blackout: oscuridad total\n- Sunscreen: privacidad con luz natural',
  was_audio: false,
  created_at: new Date().toISOString(),
};

const followup: Followup = {
  id: 1,
  lead_id: 'lead',
  client_id: 'client',
  stage_name: 'calificado',
  attempt_number: 1,
  scheduled_at: new Date().toISOString(),
  status: 'pending',
  trigger_type: 'manual',
  tone: 'casual',
  intent: 'reengagement',
  instructions: 'Preguntale si pudo tomar las medidas de las ventanas.',
  sent_at: null,
  cancel_reason: null,
  error_message: null,
  created_at: new Date().toISOString(),
};

export const BrandAtoms = () => (
  <div style={{ background: 'var(--ink-0)', color: 'var(--text)', padding: 24, display: 'grid', gap: 18 }}>
    <StairsAccent />
    <Eyebrow>Datos extraídos</Eyebrow>
    <StageTag stage="en_calificacion" />
    <IntentBar state={state} />
  </div>
);

export const ChatStates = () => (
  <div style={{ background: 'var(--ink-0)', color: 'var(--text)', padding: 24, display: 'grid', gap: 18 }}>
    <SentinelContextStrip state={state} />
    <MessageBubble message={message} />
  </div>
);

export const LeadPanelParts = () => (
  <div style={{ background: 'var(--ink-0)', color: 'var(--text)', padding: 24, display: 'grid', gridTemplateColumns: '160px 160px 320px', gap: 0 }}>
    <FactCard label="Medidas" value="270cm x 250cm" />
    <FactCard label="Ambiente" />
    <FollowupCard followup={followup} />
  </div>
);
