export const PLAYABLE_PRESENTATION_HISTORY_LIMIT = 24;
export const PLAYABLE_PRESENTATION_METADATA_BUDGET_BYTES = 4096;

function text(value, max = 40) {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

function integer(value, min, max) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : null;
}

export function compactPlayablePresentationReceipt(receipt = {}) {
  return {
    version:integer(receipt.version, 1, 99) ?? 1,
    scenario:text(receipt.scenario, 32) ?? 'open_play',
    renderer:text(receipt.renderer, 32) ?? null,
    quality:text(receipt.quality, 16) ?? 'medium',
    fallback:Boolean(receipt.fallback),
    replayCount:integer(receipt.replayCount, 0, 3) ?? 0,
  };
}

export function compactPlayablePresentationHistory(history = []) {
  return history
    .slice(-PLAYABLE_PRESENTATION_HISTORY_LIMIT)
    .map(compactPlayablePresentationReceipt);
}

function utf8Bytes(value) {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function playablePresentationMetadataBytes(value) {
  try { return utf8Bytes(JSON.stringify(value ?? null)); }
  catch { return Number.POSITIVE_INFINITY; }
}

export function presentationHistoryWithinBudget(history = []) {
  const compact = compactPlayablePresentationHistory(history);
  const bytes = playablePresentationMetadataBytes(compact);
  return {
    compact,
    bytes,
    budgetBytes:PLAYABLE_PRESENTATION_METADATA_BUDGET_BYTES,
    withinBudget:bytes <= PLAYABLE_PRESENTATION_METADATA_BUDGET_BYTES,
  };
}

export function stripNonDurablePresentationState(value = {}) {
  const { scene, frames, replayFrames, audioState, rendererState, ...durable } = value ?? {};
  void scene; void frames; void replayFrames; void audioState; void rendererState;
  return durable;
}
