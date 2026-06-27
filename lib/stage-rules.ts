export function normalizePipelineStage(stage?: string | null) {
  return String(stage ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isProposalStage(stage?: string | null) {
  return normalizePipelineStage(stage) === 'propuesta enviada';
}

export function isTerminalStage(stage?: string | null) {
  const normalized = normalizePipelineStage(stage);
  return [
    'cerrado ganado',
    'ganado',
    'cerrado perdido',
    'perdido',
  ].includes(normalized);
}
