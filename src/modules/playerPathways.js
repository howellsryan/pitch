/*
 * modules/playerPathways.js — pure P3 position/trait pathways.
 *
 * This module owns configuration and deterministic progression only. It does
 * not read IndexedDB or UI state, and it never changes a player's primary
 * position implicitly.
 */

export const SUPPORTED_POSITIONS = Object.freeze([
  'GK','CB','RB','LB','CDM','CM','CAM','RM','LM','RW','LW','CF','ST',
]);

const POSITION_SET = new Set(SUPPORTED_POSITIONS);
const POSITION_FAMILY = Object.freeze({
  GK:'GK', CB:'DEF', RB:'DEF', LB:'DEF', CDM:'MID', CM:'MID', CAM:'MID', RM:'WIDE', LM:'WIDE',
  RW:'WIDE', LW:'WIDE', CF:'ATT', ST:'ATT',
});

const RELATED_POSITIONS = Object.freeze({
  CB:['RB','LB','CDM'], RB:['CB','RM','RW'], LB:['CB','LM','LW'],
  CDM:['CM','CB'], CM:['CDM','CAM','RM','LM'], CAM:['CM','CF','RW','LW'],
  RM:['RW','CM','RB'], LM:['LW','CM','LB'], RW:['RM','LW','CAM','ST'], LW:['LM','RW','CAM','ST'],
  CF:['ST','CAM'], ST:['CF','RW','LW'],
});

export const PLAYER_TRAIT_DEFS = Object.freeze({
  finisher:{ id:'finisher', label:'Finisher', attribute:'attack', modifier:1.4, positions:['ST','CF','RW','LW'] },
  creator:{ id:'creator', label:'Creator', attribute:'midfield', modifier:1.3, positions:['CAM','CM','RM','LM','RW','LW'] },
  ball_winner:{ id:'ball_winner', label:'Ball winner', attribute:'defence', modifier:1.3, positions:['CDM','CM','CB'] },
  aerial_presence:{ id:'aerial_presence', label:'Aerial presence', attribute:'defence', modifier:1.0, positions:['CB','ST','CF'] },
  wide_runner:{ id:'wide_runner', label:'Wide runner', attribute:'attack', modifier:.8, positions:['RB','LB','RM','LM','RW','LW'] },
  sweeper_keeper:{ id:'sweeper_keeper', label:'Sweeper keeper', attribute:'goalkeeping', modifier:1.0, positions:['GK'] },
});

const TRAIT_IDS = new Set(Object.keys(PLAYER_TRAIT_DEFS));

function pathClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function pathRound2(value) { return Math.round(value * 100) / 100; }

function pathStableHash(value) {
  let h = 2166136261;
  for (const ch of String(value ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pathDeterministicUnit(seed) {
  let t = pathStableHash(seed) + 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function isSupportedPosition(position) {
  return POSITION_SET.has(position);
}

/**
 * Compatibility fallback used when an old row has not learned an explicit
 * secondary position yet. WP4 makes this a real cost rather than treating all
 * missing entries as perfect fit.
 */
export function defaultPositionSuitability(primary, target) {
  if (!primary || !target) return 0;
  if (primary === target) return 1;
  if (!POSITION_SET.has(primary) || !POSITION_SET.has(target)) return 0;
  if (primary === 'GK' || target === 'GK') return 0;
  if (RELATED_POSITIONS[primary]?.includes(target)) return .72;
  if (POSITION_FAMILY[primary] === POSITION_FAMILY[target]) return .62;
  if ((POSITION_FAMILY[primary] === 'MID' && POSITION_FAMILY[target] === 'WIDE')
    || (POSITION_FAMILY[primary] === 'WIDE' && POSITION_FAMILY[target] === 'MID')) return .48;
  if ((POSITION_FAMILY[primary] === 'ATT' && POSITION_FAMILY[target] === 'WIDE')
    || (POSITION_FAMILY[primary] === 'WIDE' && POSITION_FAMILY[target] === 'ATT')) return .45;
  return .28;
}

export function slotSuitability(player, targetPosition) {
  if (!player || !targetPosition) return 0;
  if (player.position === targetPosition) return 1;
  const stored = Number(player.positionSuitability?.[targetPosition]);
  if (Number.isFinite(stored)) return pathClamp(stored, 0, 1);
  return defaultPositionSuitability(player.position, targetPosition);
}

export function normalizeConfiguredTraits(traits) {
  if (!Array.isArray(traits)) return [];
  const out = [];
  const seen = new Set();
  for (const value of traits) {
    if (!TRAIT_IDS.has(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= 3) break;
  }
  return out;
}

/** Deterministic low-cardinality defaults; never more than two auto traits. */
export function assignDefaultTraits(player) {
  if (!player) return player;
  const existing = normalizeConfiguredTraits(player.traits);
  if (existing.length) return existing;
  const candidates = Object.values(PLAYER_TRAIT_DEFS).filter(def => def.positions.includes(player.position));
  if (!candidates.length) return [];
  const primaryAttr = player.position === 'GK' ? 'goalkeeping'
    : ['CB','RB','LB'].includes(player.position) ? 'defence'
      : ['CM','CDM','RM','LM'].includes(player.position) ? 'midfield'
        : 'attack';
  const rating = Number(player[primaryAttr] ?? 0);
  if (rating < 68) return [];
  const first = candidates[pathStableHash(player.id ?? player.name) % candidates.length];
  if (rating < 82 || candidates.length < 2) return [first.id];
  const second = candidates[(pathStableHash(`${player.id}:secondary`) % (candidates.length - 1) + 1) % candidates.length];
  return first.id === second.id ? [first.id] : [first.id, second.id];
}

/**
 * Hot match/player selector. Preserve normalizeConfiguredTraits semantics
 * (valid unique traits, input order, maximum three) without allocating a
 * normalized array and Set on every effective-rating calculation.
 */
export function traitAttributeModifier(player, attribute) {
  const traits = Array.isArray(player?.traits) ? player.traits : [];
  const seen = [];
  let modifier = 0;
  let accepted = 0;
  for (const trait of traits) {
    if (!TRAIT_IDS.has(trait) || seen.includes(trait)) continue;
    seen.push(trait);
    accepted++;
    const def = PLAYER_TRAIT_DEFS[trait];
    if (def?.attribute === attribute) modifier += def.modifier;
    if (accepted >= 3) break;
  }
  return pathRound2(pathClamp(modifier, 0, 2.5));
}

export function traitRecruitmentLabels(player) {
  return normalizeConfiguredTraits(player?.traits).map(id => PLAYER_TRAIT_DEFS[id]?.label).filter(Boolean);
}

export function startPositionConversion(player, targetPosition, season = null, gameweek = null) {
  if (!player || !POSITION_SET.has(targetPosition) || targetPosition === player.position) return player;
  if (player.position === 'GK' || targetPosition === 'GK') return player;
  const key = `${String(season ?? 'unknown')}:${Number(gameweek ?? 0)}`;
  const currentSuitability = slotSuitability(player, targetPosition);
  if (currentSuitability >= .95) return player;
  return {
    ...player,
    positionConversion:{
      targetPosition,
      progress:pathRound2(currentSuitability),
      startedKey:key,
      lastSettledKey:null,
      status:'active',
    },
  };
}

export function cancelPositionConversion(player) {
  if (!player?.positionConversion) return player;
  return { ...player, positionConversion:null };
}

export function settlePositionConversion(player, gameweek, season = null) {
  const conversion = player?.positionConversion;
  if (!conversion || conversion.status !== 'active') return player;
  const target = conversion.targetPosition;
  if (!POSITION_SET.has(target) || target === player.position) return { ...player, positionConversion:null };
  const key = `${String(season ?? 'unknown')}:${Number(gameweek)}`;
  if (!Number.isInteger(Number(gameweek)) || Number(gameweek) < 0 || conversion.lastSettledKey === key) return player;

  const age = Number(player.age ?? 25);
  const ageFactor = age <= 21 ? 1.18 : age <= 25 ? 1.08 : age <= 29 ? 1 : .88;
  const sharpnessFactor = .85 + pathClamp(Number(player.sharpness ?? 50), 0, 100) / 500;
  const deterministicVariance = .92 + pathDeterministicUnit(`${player.id}:${target}:${key}`) * .16;
  const gain = .035 * ageFactor * sharpnessFactor * deterministicVariance;
  const before = slotSuitability(player, target);
  const next = pathRound2(pathClamp(before + gain, 0, 1));
  const complete = next >= .92;
  return {
    ...player,
    positionSuitability:{ ...(player.positionSuitability ?? {}), [player.position]:1, [target]:complete ? 1 : next },
    positionConversion:complete ? null : {
      ...conversion,
      progress:next,
      lastSettledKey:key,
    },
  };
}

export function positionFitLabel(suitability) {
  const value = pathClamp(Number(suitability) || 0, 0, 1);
  if (value >= .95) return 'Natural';
  if (value >= .75) return 'Comfortable';
  if (value >= .55) return 'Familiar';
  if (value >= .35) return 'Makeshift';
  return 'Emergency';
}
