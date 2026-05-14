import type { AirtableLead, LeadInfo, Message, SentinelState, AiSuggestion } from '@/lib/types';

function normalize(value?: string) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toScore(score?: string) {
  const parsed = Number(String(score ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}

function hasFutureDate(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now();
}

export function temperatureFromScore(score?: string): SentinelState['temperature'] {
  const n = toScore(score);
  if (n >= 75) return 'caliente';
  if (n >= 45) return 'tibio';
  return 'frio';
}

export function deriveSentinelState(input: AirtableLead | LeadInfo, messages: Message[] = []): SentinelState {
  const lead = input as AirtableLead & LeadInfo;
  const score = toScore(lead.score);
  const product = lead.tipo_producto ?? lead.productType;
  const measurements = lead.medidas_info ?? lead.measurementsInfo;
  const stage = normalize(lead.current_stage ?? lead.stage);
  const lastSummary = normalize(lead.last_message_summary);
  const lastMessagesText = normalize(messages.slice(-4).map((m) => m.content).join(' '));
  const missingFacts: string[] = [];

  if (!measurements) missingFacts.push('medidas');
  if (!product) missingFacts.push('sistema');
  if (!lead.zona_instalacion && !lead.fields?.some((field) => normalize(field.label).includes('zona'))) missingFacts.push('zona');

  const stuck = lastSummary.includes('false. false') || lastMessagesText.includes('false. false');
  const paused = hasFutureDate(lead.bot_resume_at ?? lead.botResumeAt);
  const hot = score >= 75 || stage.includes('calificado') || stage.includes('propuesta');
  const readyForQuote = Boolean(measurements && product && (stage.includes('calificado') || score >= 55));

  let currentGoal: SentinelState['currentGoal'] = 'calificar';
  if (!product) currentGoal = 'catalogo';
  else if (!measurements) currentGoal = 'medidas';
  else if (readyForQuote) currentGoal = 'presupuesto';
  else if (stage.includes('nuevo')) currentGoal = 'saludar';
  else if (stage.includes('propuesta')) currentGoal = 'seguimiento';

  let currentAction = 'calificando lead';
  if (paused) currentAction = 'bot pausado por vendedor';
  else if (stuck) currentAction = 'bot trabado';
  else if (!product) currentAction = 'explicando catálogo';
  else if (!measurements) currentAction = 'esperando medidas';
  else if (readyForQuote) currentAction = 'listo para presupuesto';
  else if (lead.last_message_from === 'user') currentAction = 'esperando respuesta humana';

  const needsHuman = stuck || readyForQuote || lead.last_message_from === 'user';
  const priority: SentinelState['priority'] = stuck ? 'stuck' : hot ? 'hot' : needsHuman ? 'needs_human' : 'normal';

  return {
    currentGoal,
    currentAction,
    missingFacts,
    confidence: stuck ? 28 : readyForQuote ? 86 : Math.max(42, Math.min(92, score + 18)),
    intentScore: score,
    temperature: temperatureFromScore(lead.score),
    needsHuman,
    needsHumanReason: stuck ? 'El Sentinel no logró avanzar' : readyForQuote ? 'Tiene datos para presupuestar' : undefined,
    nextAction: readyForQuote ? 'generar presupuesto' : missingFacts.length ? `pedir ${missingFacts[0]}` : 'seguir calificando',
    priority,
  };
}

export function buildAiSuggestions(lead: LeadInfo, state: SentinelState): AiSuggestion[] {
  if (state.currentGoal === 'presupuesto') {
    return [
      { id: 'quote', text: 'Te armo el presupuesto con estas medidas y te lo paso por acá en un momento.', confidence: 88 },
      { id: 'confirm', text: 'Antes de presupuestar, confirmame si la medida es de pared a pared o del paño exacto.', confidence: 76 },
      { id: 'pay', text: 'También te puedo pasar opciones de pago en cuotas, transferencia o efectivo.', confidence: 72 },
    ];
  }

  if (state.missingFacts.includes('medidas')) {
    return [
      { id: 'measure', text: '¿Me pasás ancho y alto aproximado? Con eso te puedo orientar mejor.', confidence: 84 },
      { id: 'room', text: '¿Para qué ambiente sería? Así te recomiendo el sistema que mejor se adapta.', confidence: 79 },
      { id: 'install', text: 'Si querés, también podemos verificar las medidas antes de producir.', confidence: 68 },
    ];
  }

  if (state.priority === 'stuck') {
    return [
      { id: 'recover', text: 'Perdón, te hago una pregunta puntual para avanzar: ¿buscás blackout, sunscreen o doble sistema?', confidence: 71 },
      { id: 'human', text: 'Te sigo yo desde acá para resolverlo más rápido.', confidence: 83 },
      { id: 'summary', text: 'Tengo registrado lo que veníamos hablando y lo ordeno para pasarte una propuesta clara.', confidence: 67 },
    ];
  }

  return [
    { id: 'budget', text: '¿Tenés un rango de presupuesto en mente o querés ver opciones primero?', confidence: 74 },
    { id: 'urgency', text: '¿Para cuándo lo necesitarías? Así veo tiempos de fabricación e instalación.', confidence: 70 },
    { id: 'catalog', text: `Para ${lead.productType ?? 'ese sistema'} tengo varias alternativas. Te recomiendo según luz, privacidad y presupuesto.`, confidence: 66 },
  ];
}
