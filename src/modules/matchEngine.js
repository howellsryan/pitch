import { rollInjuryCheck } from './injuries.js';
import {
  currentEffectiveLevel,
  effectiveAttribute,
  playerPositionGroup,
  positionSuitabilityFor,
} from './playerModel.js';
import { rehabilitationReinjuryMultiplier } from './playerRehabilitation.js';
import {
  DEFAULT_TEAM_INSTRUCTIONS,
  chooseAIRole,
  getRoleTeamModifiers,
  getTacticalModifiers,
  isUserTacticalPlan,
  normalizeTeamInstructions,
  resolvePlayerRole,
  stableStringHash,
} from './tactics.js';
import { buildSquadAwareAITacticalProfile } from './aiTacticalIdentity.js';
import {
  MATCH_ACTION_LEDGER_VERSION,
  MATCH_ACTION_RESOLVER_VERSION,
  MATCH_RNG_PACKET_VERSION,
  deriveStatsFromActionLedger,
  fixedPhaseRngPacket,
  packetDerivedSeed,
  resolveAuthoritativePhase,
} from './matchActionResolver.js';
import { buildMatchTacticalAnalysis } from './matchTacticalAnalysis.js';
import { validateMatchSimulationVersion } from './matchSimulationVersion.js';

/**
 * modules/matchEngine.js — authoritative P2/P3/T3/T5 simulation core.
 *
 * T3 keeps this module as the orchestrator but moves football execution into a
 * pure action resolver. T5 keeps that authority boundary and makes AI tactical
 * identity squad-aware before the match starts. Quick Sim and Watch Match both
 * advance the same versioned action ledger with one fixed seeded RNG packet per
 * phase. Legacy goal/card/injury/substitution events remain the presentation /
 * persistence contract while score and core match stats derive from the ledger.
 */

export const MATCH_ENGINE_VERSION = 2;
export const ATT = new Set(['ST','CF','RW','LW','CAM']);
export const MID = new Set(['CM','CDM','CAM','RM','LM']);
export const DEF = new Set(['CB','RB','LB']);
export const MATCH_INJURY_CHECK_INTERVAL = 6;
export const MATCH_PHASES = 120;
export const MAX_MATCHDAY_BENCH = 9;

function currentSimulationVersions() {
  return {
    matchEngineVersion:MATCH_ENGINE_VERSION,
    actionResolverVersion:MATCH_ACTION_RESOLVER_VERSION,
    actionLedgerVersion:MATCH_ACTION_LEDGER_VERSION,
    rngPacketVersion:MATCH_RNG_PACKET_VERSION,
  };
}

export function matchInjuryIntervalRate(perPhaseRate, interval = MATCH_INJURY_CHECK_INTERVAL) {
  return 1 - Math.pow(1 - perPhaseRate, interval);
}

export function positionGroup(pos) {
  return playerPositionGroup(pos);
}

export function primaryRating(player) {
  const level = currentEffectiveLevel(player);
  return level == null ? level : Math.round(level);
}

export const FORMATIONS = {
  '3-4-3':   { GK:1, CB:3, CM:2, RM:1, LM:1, RW:1, LW:1, ST:1 },
  '3-5-2':   { GK:1, CB:3, CM:2, CDM:1, RM:1, LM:1, ST:2 },
  '3-4-1-2': { GK:1, CB:3, CM:2, RM:1, LM:1, CAM:1, ST:2 },
  '4-3-3':   { GK:1, CB:2, RB:1, LB:1, CM:2, CDM:1, RW:1, LW:1, ST:1 },
  '4-2-3-1': { GK:1, CB:2, RB:1, LB:1, CDM:2, CAM:1, RW:1, LW:1, ST:1 },
  '4-4-2':   { GK:1, CB:2, RB:1, LB:1, CM:2, RM:1, LM:1, ST:2 },
  '4-1-2-1-2':{ GK:1, CB:2, RB:1, LB:1, CDM:1, CM:2, CAM:1, ST:2 },
  '4-3-2-1': { GK:1, CB:2, RB:1, LB:1, CM:2, CDM:1, RW:1, LW:1, ST:1 },
  '4-5-1':   { GK:1, CB:2, RB:1, LB:1, CM:3, RM:1, LM:1, ST:1 },
  '4-4-1-1': { GK:1, CB:2, RB:1, LB:1, CM:2, RM:1, LM:1, CAM:1, ST:1 },
  '4-1-4-1': { GK:1, CB:2, RB:1, LB:1, CDM:1, CM:2, RM:1, LM:1, ST:1 },
  '5-3-2':   { GK:1, CB:3, RB:1, LB:1, CM:3, ST:2 },
  '5-4-1':   { GK:1, CB:3, RB:1, LB:1, CM:2, RM:1, LM:1, ST:1 },
  '5-2-3':   { GK:1, CB:3, RB:1, LB:1, CM:2, RW:1, LW:1, ST:1 },
};

function _matchRandomValue(rng) { return typeof rng === 'function' ? rng() : Math.random(); }

export function pickAIFormation(rng = Math.random) {
  const keys = Object.keys(FORMATIONS);
  return keys[Math.floor(_matchRandomValue(rng) * keys.length)];
}

function formationSlots(formation) {
  const shape = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
  return Object.entries(shape).flatMap(([position, count]) => Array.from({ length:count }, () => position));
}

function slotEligible(player, slot) {
  if (slot === 'GK') return player.position === 'GK';
  return player.position !== 'GK';
}

function slotRating(player, slot) {
  const level = currentEffectiveLevel(player, { position:slot });
  return Number.isFinite(level) ? level : -Infinity;
}

function createSlotRatingLookup() {
  const cache = new WeakMap();
  return (player, slot) => {
    let ratings = cache.get(player);
    if (!ratings) {
      ratings = new Map();
      cache.set(player, ratings);
    }
    if (!ratings.has(slot)) ratings.set(slot, slotRating(player, slot));
    return ratings.get(slot);
  };
}

function createPrimaryRatingLookup() {
  const cache = new WeakMap();
  return player => {
    if (!cache.has(player)) cache.set(player, primaryRating(player) ?? 0);
    return cache.get(player);
  };
}

function bestPlayerForSlot(players, slot, isAvailable, ratingFor) {
  let best = null;
  let bestRating = -Infinity;
  for (const player of players) {
    if (!isAvailable(player) || !slotEligible(player, slot)) continue;
    const rating = ratingFor(player, slot);
    if (best === null || rating > bestRating || (rating === bestRating && String(player.id).localeCompare(String(best.id)) < 0)) {
      best = player;
      bestRating = rating;
    }
  }
  return best;
}

function withMatchPosition(player, position) {
  return { ...player, matchPosition:position ?? player.position };
}

function assignRequestedLineup(players, formation) {
  const remaining = [...players];
  const assigned = [];
  const ratingFor = createSlotRatingLookup();
  for (const slot of formationSlots(formation)) {
    const player = bestPlayerForSlot(remaining, slot, () => true, ratingFor);
    if (!player) continue;
    assigned.push(withMatchPosition(player, slot));
    remaining.splice(remaining.findIndex(item => item.id === player.id), 1);
  }
  for (const player of remaining) assigned.push(withMatchPosition(player, player.position));
  return assigned.slice(0, 11);
}

export function selectEleven(players, formation = '4-3-3', lineup = null) {
  const avail = players.filter(p => !p.injured && !p.suspended && p.inSquad !== false);
  const used = new Set();

  if (lineup && lineup.length === 11) {
    const availableById = new Map(avail.map(p => [p.id, p]));
    const requested = [];
    for (const pid of lineup) {
      const player = availableById.get(pid);
      if (player && !used.has(player.id)) {
        requested.push(player);
        used.add(player.id);
      }
    }
    if (requested.length === 11) return assignRequestedLineup(requested, formation);
    used.clear();
  }

  const chosen = [];
  const ratingFor = createSlotRatingLookup();
  for (const slot of formationSlots(formation)) {
    const pick = bestPlayerForSlot(avail, slot, player => !used.has(player.id), ratingFor);
    if (!pick) continue;
    chosen.push(withMatchPosition(pick, slot));
    used.add(pick.id);
  }

  if (chosen.length < 11) {
    const primaryFor = createPrimaryRatingLookup();
    const rem = avail.filter(p => !used.has(p.id))
      .sort((a,b) => primaryFor(b) - primaryFor(a) || String(a.id).localeCompare(String(b.id)));
    for (const player of rem) {
      if (chosen.length >= 11) break;
      chosen.push(withMatchPosition(player, player.position));
      used.add(player.id);
    }
  }
  return chosen.slice(0, 11);
}

function automaticBench(available) {
  const chosen = available.slice(0, MAX_MATCHDAY_BENCH);
  const isKeeper = player => (player.matchPosition ?? player.position) === 'GK';
  if (chosen.length < MAX_MATCHDAY_BENCH || chosen.some(isKeeper)) return chosen;
  const keeper = available.find(isKeeper);
  if (!keeper) return chosen;
  return [...chosen.slice(0, MAX_MATCHDAY_BENCH - 1), keeper];
}

export function selectBench(players, eleven, benchIds = null) {
  const usedIds = new Set(eleven.map(p => p.id));
  const primaryFor = createPrimaryRatingLookup();
  const available = players
    .filter(p => !p.injured && !p.suspended && p.inSquad !== false && !usedIds.has(p.id))
    .sort((a,b) => primaryFor(b) - primaryFor(a) || String(a.id).localeCompare(String(b.id)));

  if (!Array.isArray(benchIds)) return automaticBench(available);

  const availableById = new Map(available.map(p => [p.id, p]));
  const chosen = [];
  const taken = new Set();
  for (const id of benchIds) {
    if (chosen.length >= MAX_MATCHDAY_BENCH) break;
    const player = availableById.get(id);
    if (!player || taken.has(player.id)) continue;
    chosen.push(player);
    taken.add(player.id);
  }
  return chosen;
}

export function pruneBenchToSquad(bench, squadPlayers = []) {
  if (!Array.isArray(bench) || !bench.length) return bench;
  const atClub = new Set(squadPlayers.map(player => String(player?.id)));
  const next = bench.filter(id => atClub.has(String(id)));
  return next.length === bench.length ? bench : next;
}

export function selectReserves(players, eleven, bench) {
  const namedIds = new Set([...eleven, ...bench].map(p => p.id));
  const primaryFor = createPrimaryRatingLookup();
  return players
    .filter(p => p.inSquad !== false && !namedIds.has(p.id))
    .sort((a,b) => primaryFor(b) - primaryFor(a) || String(a.id).localeCompare(String(b.id)));
}

function matchAttribute(player, attribute) {
  const value = Number(effectiveAttribute(player, attribute) ?? player?.[attribute] ?? 50);
  const slot = player?.matchPosition ?? player?.position;
  const suitability = positionSuitabilityFor(player, slot);
  const fitPenalty = (1 - suitability) * 8;
  return Math.max(1, Math.min(99, value - fitPenalty));
}

export function teamStrength(eleven) {
  const ATTACK_W = { ST:1.0, CF:1.0, RW:.85, LW:.85, CAM:.70, CM:.25, CDM:.10, RM:.40, LM:.40, CB:.05, RB:.08, LB:.08, GK:0 };
  const MIDFIELD_W = { CAM:1.0, CM:1.0, CDM:.85, RM:.90, LM:.90, ST:.20, CF:.25, RW:.35, LW:.35, CB:.15, RB:.25, LB:.25, GK:0 };
  const DEFENCE_W = { CB:1.0, RB:.90, LB:.90, CDM:.60, CM:.25, RM:.15, LM:.15, CAM:.10, ST:.05, CF:.05, RW:.05, LW:.05, GK:0 };
  function weightedAvg(attr, weights) {
    let sum = 0, wt = 0;
    for (const p of eleven) {
      const slot = p.matchPosition ?? p.position;
      const w = weights[slot] ?? .1;
      sum += matchAttribute(p, attr) * w;
      wt += w;
    }
    return wt > 0 ? sum / wt : 50;
  }
  const gk = eleven.find(p => (p.matchPosition ?? p.position) === 'GK');
  return {
    attack:weightedAvg('attack', ATTACK_W),
    midfield:weightedAvg('midfield', MIDFIELD_W),
    defence:weightedAvg('defence', DEFENCE_W),
    goalkeeping:gk ? matchAttribute(gk, 'goalkeeping') : 50,
    eleven,
  };
}

export function ageDrain(age) {
  if (age >= 36) return 1.35;
  if (age >= 33) return 1.20;
  if (age >= 30) return 1.10;
  return 1.00;
}

export function fitMult(fitness) {
  if (fitness >= 80) return 1.00;
  if (fitness >= 65) return .95;
  if (fitness >= 50) return .88;
  if (fitness >= 35) return .78;
  return .65;
}

export function ratingFactor(rating, centre) {
  return 1 / (1 + Math.exp(-.07 * (rating - centre)));
}

/** Historical P2 helper retained for callers/tests; T3 no longer uses it to score. */
export function goalChance(attStr, defStr, isHome) {
  const base = .011;
  const attFactor = ratingFactor(attStr.attack, 75);
  const defFactor = ratingFactor(defStr.defence, 75);
  const gkFactor = ratingFactor(defStr.goalkeeping, 75);
  const defResist = defFactor * .70 + gkFactor * .30;
  let prob = base * (attFactor / Math.max(.08, defResist)) * 2;
  if (isHome) prob *= 1.06;
  return Math.min(Math.max(prob, .005), .16);
}

/** Historical P2 helper retained for compatibility; T3 scorer comes from shot actions. */
export function pickScorer(eleven, rng = Math.random) {
  const POS_WEIGHTS = {
    'ST': 40, 'CF': 38, 'RW': 20, 'LW': 20, 'CAM': 15, 'CM': 8, 'CDM': 3,
    'RM': 10, 'LM': 10, 'CB': 2, 'RB': 2, 'LB': 2,
    'GK': 0,
  };
  const weights = eleven.map(p => {
    const slot = p.matchPosition ?? p.position;
    const base = POS_WEIGHTS[slot] ?? 1;
    if (!base) return 0;
    const norm = matchAttribute(p, 'attack') / 99;
    return base * (norm * norm * 1.5 + .5);
  });
  const total = weights.reduce((a,b) => a + b, 0);
  if (!total) return eleven.find(p => (p.matchPosition ?? p.position) !== 'GK') ?? eleven[0];
  let roll = _matchRandomValue(rng) * total;
  for (let i = 0; i < eleven.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return eleven[i];
  }
  return eleven[eleven.length - 1];
}

/** Historical P2 helper retained for compatibility; T3 assists come from pass chains. */
export function pickAssister(eleven, scorerId, rng = Math.random) {
  const cands = eleven.filter(p => p.id !== scorerId);
  if (!cands.length) return null;
  const POS_WEIGHTS = { CAM:30, CM:22, CDM:8, RM:20, LM:20, RW:18, LW:18, RB:8, LB:8, ST:10, CF:12, CB:2, GK:0 };
  const weights = cands.map(p => {
    const slot = p.matchPosition ?? p.position;
    const base = POS_WEIGHTS[slot] ?? 5;
    if (!base) return 0;
    return base * ((matchAttribute(p, 'midfield') / 99) * .6 + .4);
  });
  const total = weights.reduce((a,b) => a + b, 0);
  if (!total) return cands[0];
  let roll = _matchRandomValue(rng) * total;
  for (let i = 0; i < cands.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return cands[i];
  }
  return cands[0];
}

export function getMentalityMods(mentality) {
  switch (mentality) {
    case 'defensive': return { goalProbMult:.72, defResistMult:1.30, midShareBoost:-.07, phasesBoostOpp:.04, shotsMultSelf:.80, shotsMultOpp:.88 };
    case 'possession': return { goalProbMult:.88, defResistMult:1.08, midShareBoost:.09, phasesBoostOpp:-.04, shotsMultSelf:.90, shotsMultOpp:.82 };
    case 'attacking': return { goalProbMult:1.32, defResistMult:.78, midShareBoost:.06, phasesBoostOpp:.08, shotsMultSelf:1.20, shotsMultOpp:1.15 };
    default: return { goalProbMult:1, defResistMult:1, midShareBoost:0, phasesBoostOpp:0, shotsMultSelf:1, shotsMultOpp:1 };
  }
}

export function shouldSub(fitness, minute, trailsBy) {
  if (minute < 55) return false;
  if (fitness < 65) return true;
  if (fitness < 75 && minute > 70) return true;
  if (trailsBy > 0 && minute > 65 && fitness < 80) return true;
  return false;
}

function seededStep(state) {
  const nextState = (Number(state) + 0x6D2B79F5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state:nextState, value };
}

function normaliseSeed(seed) {
  if (Number.isFinite(seed)) return (Number(seed) >>> 0) || 1;
  return stableStringHash(seed) || 1;
}

export function createSeededRng(seed) {
  let state = normaliseSeed(seed);
  return () => {
    const next = seededStep(state);
    state = next.state;
    return next.value;
  };
}

function cursorFrom(state) {
  return {
    state:normaliseSeed(state),
    next() {
      const next = seededStep(this.state);
      this.state = next.state;
      return next.value;
    },
  };
}

function playerSeedSignature(players) {
  return [...(players ?? [])]
    .sort((a,b) => String(a.id).localeCompare(String(b.id)))
    .map(p => [
      p.id, p.position, Math.round(Number(p.fitness ?? 90)),
      Math.round(Number(currentEffectiveLevel(p) ?? 0) * 10),
      Number(p.appearances ?? 0), Number(p.goals ?? 0), Number(p.assists ?? 0),
      ...['pace','shooting','passing','dribbling','defending','physical']
        .map(attribute => Math.round(Number(p.attributeProfile?.[attribute] ?? 0))),
      p.tacticalRole ?? '', (p.traits ?? []).join(','), p.rehabilitation?.status ?? '',
    ].join(':'))
    .join(',');
}

export function deriveMatchSeed({ homeTeam, awayTeam, homePlayers, awayPlayers, homeFormation, awayFormation, homeMentality, awayMentality, homeTactics, awayTactics } = {}) {
  const signature = [
    homeTeam?.id ?? homeTeam?.name ?? 'home', awayTeam?.id ?? awayTeam?.name ?? 'away',
    homeFormation ?? '4-3-3', awayFormation ?? '4-3-3', homeMentality ?? 'balanced', awayMentality ?? 'balanced',
    JSON.stringify(normalizeTeamInstructions(homeTactics)), JSON.stringify(normalizeTeamInstructions(awayTactics)),
    playerSeedSignature(homePlayers), playerSeedSignature(awayPlayers),
  ].join('|');
  return stableStringHash(signature) || 1;
}

function cloneMatchPlayer(player) {
  const clone = { ...player };
  delete clone._injuredThisMatch;
  return clone;
}

export function resolveTeamTacticalIdentity(team, opponent, players, requestedFormation, requestedMentality, isHome) {
  if (isUserTacticalPlan(team)) {
    const instructions = normalizeTeamInstructions(team.tacticalPlan.instructions);
    const roles = {};
    for (const player of players ?? []) roles[player.id] = resolvePlayerRole(player, player.tacticalRole)?.id ?? null;
    return {
      source:'user', profileId:'manager', profileLabel:'Manager plan',
      formation:FORMATIONS[requestedFormation] ? requestedFormation : '4-3-3',
      mentality:requestedMentality ?? 'balanced', instructions, roles,
    };
  }
  const { profile } = buildSquadAwareAITacticalProfile({ team, opponent, isHome, players });
  const roles = {};
  for (const player of players ?? []) roles[player.id] = chooseAIRole(player, profile);
  return {
    ...profile,
    formation:FORMATIONS[requestedFormation] ? requestedFormation : profile.formation,
    mentality:requestedMentality ?? profile.mentality,
    profileId:profile.id,
    profileLabel:profile.label,
    roles,
  };
}

function effectiveTeamStrength(active, roles, instructions) {
  const base = teamStrength(active);
  const role = getRoleTeamModifiers(active, roles, instructions);
  return {
    ...base,
    attack:base.attack * role.attackMult,
    midfield:base.midfield * role.midfieldMult,
    defence:base.defence * role.defenceMult,
    goalkeeping:base.goalkeeping * role.defenceMult,
    roleScore:role.roleScore,
  };
}

function combinedMods(mentality, selfTactics, oppTactics) {
  const mentalityMods = getMentalityMods(mentality);
  const tactical = getTacticalModifiers(selfTactics, oppTactics);
  return {
    goalProbMult:mentalityMods.goalProbMult * tactical.goalProbMult,
    defResistMult:mentalityMods.defResistMult * tactical.defResistMult,
    midShareBoost:mentalityMods.midShareBoost + tactical.midShareBoost,
    phasesBoostOpp:mentalityMods.phasesBoostOpp,
    shotsMultSelf:mentalityMods.shotsMultSelf * tactical.shotsMult,
    shotsMultOpp:mentalityMods.shotsMultOpp,
    fitnessDrainMult:tactical.fitnessDrainMult,
    yellowRiskMult:tactical.yellowRiskMult,
    injuryRiskMult:tactical.injuryRiskMult,
    lateDefResistMult:tactical.lateDefResistMult,
  };
}

function midfieldShare(hStr, aStr, hMods, aMods) {
  const raw = (hStr.midfield + aStr.midfield) > 0 ? hStr.midfield / (hStr.midfield + aStr.midfield) : .5;
  return Math.min(.85, Math.max(.15, raw + hMods.midShareBoost - aMods.midShareBoost));
}

export function refreshLiveMatchState(liveState) {
  const hStr = effectiveTeamStrength(liveState.hActive, liveState.homeRoles, liveState.homeTactics);
  const aStr = effectiveTeamStrength(liveState.aActive, liveState.awayRoles, liveState.awayTactics);
  const hMods = combinedMods(liveState.homeMentality ?? 'balanced', liveState.homeTactics, liveState.awayTactics);
  const aMods = combinedMods(liveState.awayMentality ?? 'balanced', liveState.awayTactics, liveState.homeTactics);
  return { ...liveState, hStr, aStr, hMods, aMods, hMidShare:midfieldShare(hStr, aStr, hMods, aMods) };
}

function scoreAdjustedMods(base, source, ownGoals, oppGoals, minute) {
  if (source === 'user' || minute < 60) return base;
  if (ownGoals < oppGoals) {
    return {
      ...base,
      goalProbMult:base.goalProbMult * 1.08,
      defResistMult:base.defResistMult * .94,
      midShareBoost:base.midShareBoost + .018,
      fitnessDrainMult:base.fitnessDrainMult * 1.04,
    };
  }
  if (ownGoals > oppGoals && minute >= 72) {
    return {
      ...base,
      goalProbMult:base.goalProbMult * .94,
      defResistMult:base.defResistMult * 1.055,
      midShareBoost:base.midShareBoost - .012,
    };
  }
  return base;
}

function actionRiskMode(source, ownGoals, oppGoals, minute) {
  if (source === 'user') return 'normal';
  if (minute >= 60 && ownGoals < oppGoals) return 'chase';
  if (minute >= 72 && ownGoals > oppGoals) return 'protect';
  return 'normal';
}

const matchFitnessViewCache = new WeakMap();
const matchFitnessArrayCache = new WeakMap();

function withCurrentMatchFitness(players, fitnessMap) {
  let views = matchFitnessArrayCache.get(players);
  if (!views) {
    views = (players ?? []).map(player => {
      let view = matchFitnessViewCache.get(player);
      if (!view) {
        view = { ...player };
        matchFitnessViewCache.set(player, view);
      }
      return view;
    });
    matchFitnessArrayCache.set(players, views);
  }
  for (let index = 0; index < views.length; index += 1) {
    const player = players[index];
    views[index].fitness = fitnessMap.get(player.id) ?? player.fitness ?? 90;
  }
  return views;
}

function pickDisciplineTarget(candidates, roll) {
  if (!candidates.length) return null;
  const weights = candidates.map(player => {
    const slot = player.matchPosition ?? player.position;
    return DEF.has(slot) ? 4 : slot === 'CDM' ? 3 : 1;
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = roll * total;
  for (let index = 0; index < candidates.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}

export function buildLiveMatchState(homeTeam, awayTeam, homePlayers, awayPlayers, homeFormation, awayFormation, homeLineup, awayLineup, homeMentality, awayMentality, options = {}) {
  const hIdentity = resolveTeamTacticalIdentity(homeTeam, awayTeam, homePlayers, homeFormation, homeMentality, true);
  const aIdentity = resolveTeamTacticalIdentity(awayTeam, homeTeam, awayPlayers, awayFormation, awayMentality, false);
  const rawHElev = selectEleven(homePlayers, hIdentity.formation, homeLineup ?? null);
  const rawAElev = selectEleven(awayPlayers, aIdentity.formation, awayLineup ?? null);
  const rawHBench = selectBench(homePlayers, rawHElev, options.homeBench ?? null);
  const rawABench = selectBench(awayPlayers, rawAElev, options.awayBench ?? null);
  const hElev = rawHElev.map(cloneMatchPlayer);
  const aElev = rawAElev.map(cloneMatchPlayer);
  const hBench = rawHBench.map(cloneMatchPlayer);
  const aBench = rawABench.map(cloneMatchPlayer);

  const seed = normaliseSeed(options.seed ?? deriveMatchSeed({
    homeTeam, awayTeam, homePlayers, awayPlayers,
    homeFormation:hIdentity.formation, awayFormation:aIdentity.formation,
    homeMentality:hIdentity.mentality, awayMentality:aIdentity.mentality,
    homeTactics:hIdentity.instructions, awayTactics:aIdentity.instructions,
  }));

  return refreshLiveMatchState({
    ...currentSimulationVersions(),
    actionLedger:[],
    hActive:[...hElev], aActive:[...aElev], hBenchLeft:[...hBench], aBenchLeft:[...aBench],
    hFitness:new Map(hElev.map(p => [p.id, Math.min(100, Number(p.fitness ?? 90))])),
    aFitness:new Map(aElev.map(p => [p.id, Math.min(100, Number(p.fitness ?? 90))])),
    hSubsLeft:3, aSubsLeft:3, hGoals:0, aGoals:0, hPhases:0, aPhases:0,
    hElev, aElev, hBench, aBench,
    homeFormation:hIdentity.formation, awayFormation:aIdentity.formation,
    homeMentality:hIdentity.mentality, awayMentality:aIdentity.mentality,
    homeTactics:hIdentity.instructions, awayTactics:aIdentity.instructions,
    homeRoles:hIdentity.roles, awayRoles:aIdentity.roles,
    homePlanSource:hIdentity.source, awayPlanSource:aIdentity.source,
    homeProfileId:hIdentity.profileId, awayProfileId:aIdentity.profileId,
    homeProfileLabel:hIdentity.profileLabel, awayProfileLabel:aIdentity.profileLabel,
    seed, rngState:seed,
  });
}

export function simulateMatchSegment(homeTeam, awayTeam, liveState, startPhase, endPhase, controlledTeamId = null) {
  const versionCheck = validateMatchSimulationVersion(liveState, currentSimulationVersions());
  let state = refreshLiveMatchState(liveState);
  const attackingFitnessDrain = 0.18;
  const defendingFitnessDrain = 0.12;
  const cursor = cursorFrom(state.rngState ?? state.seed);
  let curHActive = [...state.hActive], curAActive = [...state.aActive];
  let curHBench = [...state.hBenchLeft], curABench = [...state.aBenchLeft];
  const hFitness = new Map(state.hFitness), aFitness = new Map(state.aFitness);
  let curHSubs = state.hSubsLeft, curASubs = state.aSubsLeft;
  let curHGoals = state.hGoals, curAGoals = state.aGoals;
  let curHPhases = state.hPhases, curAPhases = state.aPhases;
  let hStr = state.hStr, aStr = state.aStr;
  const actionLedger = [...(state.actionLedger ?? [])];
  const segEvents = [];
  const hBaseMods = combinedMods(state.homeMentality, state.homeTactics, state.awayTactics);
  const aBaseMods = combinedMods(state.awayMentality, state.awayTactics, state.homeTactics);

  const inferredControlled = controlledTeamId
    ?? (state.homePlanSource === 'user' && state.awayPlanSource !== 'user' ? homeTeam.id
      : state.awayPlanSource === 'user' && state.homePlanSource !== 'user' ? awayTeam.id : null);

  for (let phase = startPhase; phase <= endPhase; phase++) {
    const minute = Math.ceil((phase / MATCH_PHASES) * 90);
    const packet = fixedPhaseRngPacket(() => cursor.next());
    const hMods = scoreAdjustedMods(hBaseMods, state.homePlanSource, curHGoals, curAGoals, minute);
    const aMods = scoreAdjustedMods(aBaseMods, state.awayPlanSource, curAGoals, curHGoals, minute);
    const hMidShare = midfieldShare(hStr, aStr, hMods, aMods);
    const isHome = packet.possession < hMidShare;
    if (isHome) curHPhases++; else curAPhases++;

    const attActive = isHome ? curHActive : curAActive;
    const defActive = isHome ? curAActive : curHActive;
    const attTeam = isHome ? homeTeam : awayTeam;
    const defTeam = isHome ? awayTeam : homeTeam;
    const attFitMap = isHome ? hFitness : aFitness;
    const defFitMap = isHome ? aFitness : hFitness;
    const attMods = isHome ? hMods : aMods;
    const defMods = isHome ? aMods : hMods;
    const attPlanSource = isHome ? state.homePlanSource : state.awayPlanSource;
    const attMentality = isHome ? state.homeMentality : state.awayMentality;
    const attGoals = isHome ? curHGoals : curAGoals;
    const oppGoals = isHome ? curAGoals : curHGoals;

    for (const player of attActive) {
      const next = (attFitMap.get(player.id) ?? 90) - attackingFitnessDrain * ageDrain(player.age ?? 24) * attMods.fitnessDrainMult;
      attFitMap.set(player.id, Math.max(0, next));
    }
    for (const player of defActive) {
      const next = (defFitMap.get(player.id) ?? 90) - defendingFitnessDrain * ageDrain(player.age ?? 24) * defMods.fitnessDrainMult;
      defFitMap.set(player.id, Math.max(0, next));
    }

    const attForAction = withCurrentMatchFitness(attActive, attFitMap);
    const defForAction = withCurrentMatchFitness(defActive, defFitMap);
    const resolvedAction = resolveAuthoritativePhase({
      phase,
      minute,
      teamId:attTeam.id,
      opponentTeamId:defTeam.id,
      attackers:attForAction,
      defenders:defForAction,
      rolesById:isHome ? state.homeRoles : state.awayRoles,
      opponentRolesById:isHome ? state.awayRoles : state.homeRoles,
      instructions:isHome ? state.homeTactics : state.awayTactics,
      opponentInstructions:isHome ? state.awayTactics : state.homeTactics,
      mentality:attMentality,
      riskMode:actionRiskMode(attPlanSource, attGoals, oppGoals, minute),
      packet,
      isHome,
    });
    actionLedger.push(resolvedAction.record);
    if (resolvedAction.goalEvent) {
      if (isHome) curHGoals++; else curAGoals++;
      segEvents.push(resolvedAction.goalEvent);
    }

    const disciplineRng = createSeededRng(packetDerivedSeed(packet.discipline, `${phase}:${defTeam.id}:discipline`));
    if (disciplineRng() < .004 * defMods.yellowRiskMult && defActive.length) {
      const candidates = defActive.filter(player => (player.matchPosition ?? player.position) !== 'GK');
      const target = pickDisciplineTarget(candidates, disciplineRng());
      if (target) segEvents.push({ type:'yellow', minute, teamId:defTeam.id, playerId:target.id, playerName:target.name });
    }

    if (typeof rollInjuryCheck === 'function' && phase % MATCH_INJURY_CHECK_INTERVAL === 0) {
      for (const side of [
        { active:curHActive, team:homeTeam, mods:hMods },
        { active:curAActive, team:awayTeam, mods:aMods },
      ]) {
        const injuryRng = createSeededRng(packetDerivedSeed(packet.injury, `${phase}:${side.team.id}:injuries`));
        for (const player of side.active) {
          if (player.injured || player._injuredThisMatch) continue;
          const perPhaseRate = (player.matchPosition ?? player.position) === 'GK' ? .000120 : .000333;
          const intervalRate = matchInjuryIntervalRate(perPhaseRate)
            * side.mods.injuryRiskMult
            * rehabilitationReinjuryMultiplier(player);
          if (injuryRng() > intervalRate) continue;
          const injury = rollInjuryCheck(player, side.mods.fitnessDrainMult > 1.1, true, injuryRng);
          if (!injury) continue;
          player._injuredThisMatch = true;
          segEvents.push({
            type:'injury', minute, teamId:side.team.id, playerId:player.id, playerName:player.name,
            injuryName:injury.injuryName, injuryType:injury.injuryType, injuryGWsLeft:injury.injuryGWsLeft,
          });
        }
      }
    }

    if (phase % 10 === 0) {
      const trailH = curAGoals - curHGoals;
      const trailA = curHGoals - curAGoals;
      let hChanged = false;
      let aChanged = false;
      if (curHSubs > 0 && homeTeam.id !== inferredControlled) {
        const tired = curHActive.filter(player => (player.matchPosition ?? player.position) !== 'GK' && shouldSub(hFitness.get(player.id) ?? 90, minute, trailH));
        for (const out of tired.slice(0, curHSubs)) {
          const sub = curHBench.shift(); if (!sub) break;
          const replacement = withMatchPosition(sub, out.matchPosition ?? out.position);
          curHActive = curHActive.map(player => player.id === out.id ? replacement : player);
          hFitness.set(sub.id, Math.min(100, Number(sub.fitness ?? 90))); curHSubs--; hChanged = true;
          segEvents.push({ type:'sub', minute, teamId:homeTeam.id, outId:out.id, outName:out.name, inId:sub.id, inName:sub.name });
        }
      }
      if (curASubs > 0 && awayTeam.id !== inferredControlled) {
        const tired = curAActive.filter(player => (player.matchPosition ?? player.position) !== 'GK' && shouldSub(aFitness.get(player.id) ?? 90, minute, trailA));
        for (const out of tired.slice(0, curASubs)) {
          const sub = curABench.shift(); if (!sub) break;
          const replacement = withMatchPosition(sub, out.matchPosition ?? out.position);
          curAActive = curAActive.map(player => player.id === out.id ? replacement : player);
          aFitness.set(sub.id, Math.min(100, Number(sub.fitness ?? 90))); curASubs--; aChanged = true;
          segEvents.push({ type:'sub', minute, teamId:awayTeam.id, outId:out.id, outName:out.name, inId:sub.id, inName:sub.name });
        }
      }
      if (hChanged) hStr = effectiveTeamStrength(curHActive, state.homeRoles, state.homeTactics);
      if (aChanged) aStr = effectiveTeamStrength(curAActive, state.awayRoles, state.awayTactics);
    }
  }

  const versionFields = versionCheck.legacy ? {} : versionCheck.versions;
  return {
    segEvents,
    updatedState:{
      ...state,
      ...versionFields,
      actionLedger,
      hActive:curHActive, aActive:curAActive, hBenchLeft:curHBench, aBenchLeft:curABench,
      hFitness, aFitness, hSubsLeft:curHSubs, aSubsLeft:curASubs,
      hGoals:curHGoals, aGoals:curAGoals, hPhases:curHPhases, aPhases:curAPhases,
      hStr, aStr, hMods:hBaseMods, aMods:aBaseMods, hMidShare:midfieldShare(hStr, aStr, hBaseMods, aBaseMods), rngState:cursor.state,
    },
  };
}

export function simulateMatch(homeTeam, awayTeam, homePlayers, awayPlayers, homeFormation, awayFormation, homeLineup, awayLineup, homeMentality, awayMentality, options = {}) {
  const initial = buildLiveMatchState(
    homeTeam, awayTeam, homePlayers, awayPlayers,
    homeFormation, awayFormation, homeLineup, awayLineup, homeMentality, awayMentality, options,
  );
  const controlled = initial.homePlanSource === 'user' && initial.awayPlanSource !== 'user' ? homeTeam.id
    : initial.awayPlanSource === 'user' && initial.homePlanSource !== 'user' ? awayTeam.id : null;
  const { segEvents, updatedState } = simulateMatchSegment(homeTeam, awayTeam, initial, 1, MATCH_PHASES, controlled);
  const result = finaliseLiveMatch(homeTeam, awayTeam, updatedState, segEvents);
  return {
    ...result,
    homeMentality:initial.homeMentality,
    awayMentality:initial.awayMentality,
  };
}

export function finaliseLiveMatch(homeTeam, awayTeam, liveState, allEvents) {
  validateMatchSimulationVersion(liveState, currentSimulationVersions());
  const state = refreshLiveMatchState(liveState);
  const fitnessUpdates = [];
  for (const player of state.hElev) fitnessUpdates.push({ id:player.id, teamId:homeTeam.id, newFitness:Math.max(30, state.hFitness.get(player.id) ?? 65) });
  for (const player of state.aElev) fitnessUpdates.push({ id:player.id, teamId:awayTeam.id, newFitness:Math.max(30, state.aFitness.get(player.id) ?? 65) });
  const events = [...(allEvents ?? [])].sort((left, right) => left.minute - right.minute);
  const hasAuthoritativeLedger = Array.isArray(state.actionLedger);
  const ledger = hasAuthoritativeLedger ? state.actionLedger : [];
  const homeGoals = hasAuthoritativeLedger
    ? ledger.filter(record => record.teamId === homeTeam.id && record.finish === 'goal').length
    : state.hGoals;
  const awayGoals = hasAuthoritativeLedger
    ? ledger.filter(record => record.teamId === awayTeam.id && record.finish === 'goal').length
    : state.aGoals;
  const homeScorers = events.filter(event => event.type === 'goal' && event.teamId === homeTeam.id);
  const awayScorers = events.filter(event => event.type === 'goal' && event.teamId === awayTeam.id);
  const stats = hasAuthoritativeLedger
    ? deriveStatsFromActionLedger({ ledger, homeTeamId:homeTeam.id, awayTeamId:awayTeam.id, events })
    : computeMatchStats(
      { homeGoals, awayGoals, homeTeamId:homeTeam.id, awayTeamId:awayTeam.id, events },
      state.hPhases, state.aPhases, state.hStr, state.aStr,
      state.hMods.shotsMultSelf, state.aMods.shotsMultSelf,
      createSeededRng(state.rngState ?? state.seed),
    );
  const tacticalAnalysis = hasAuthoritativeLedger && (state.homePlanSource === 'user' || state.awayPlanSource === 'user')
    ? buildMatchTacticalAnalysis({ ledger, homeTeamId:homeTeam.id, awayTeamId:awayTeam.id })
    : null;

  return {
    matchEngineVersion:state.matchEngineVersion ?? MATCH_ENGINE_VERSION,
    actionResolverVersion:state.actionResolverVersion ?? MATCH_ACTION_RESOLVER_VERSION,
    actionLedgerVersion:state.actionLedgerVersion ?? MATCH_ACTION_LEDGER_VERSION,
    rngPacketVersion:state.rngPacketVersion ?? MATCH_RNG_PACKET_VERSION,
    homeTeamId:homeTeam.id, awayTeamId:awayTeam.id,
    homeTeamName:homeTeam.name, awayTeamName:awayTeam.name,
    homeTeamCrest:homeTeam.crest ?? '⚽', awayTeamCrest:awayTeam.crest ?? '⚽',
    homeGoals, awayGoals,
    homeScorers, awayScorers, events,
    outcome:homeGoals > awayGoals ? 'home_win' : homeGoals < awayGoals ? 'away_win' : 'draw',
    fitnessUpdates, stats, tacticalAnalysis,
    homeFormation:state.homeFormation, awayFormation:state.awayFormation,
    homeMentality:state.homeMentality, awayMentality:state.awayMentality,
    homeTactics:state.homeTactics, awayTactics:state.awayTactics,
    homeProfileId:state.homeProfileId, awayProfileId:state.awayProfileId,
    seed:state.seed,
  };
}

/** Historical P2 stat synthesiser retained for direct/manual legacy-state callers. */
export function computeMatchStats(result, hPhases, aPhases, hStr, aStr, hShotsMult, aShotsMult, rng = Math.random) {
  const total = (hPhases || 60) + (aPhases || 60);
  const homePoss = Math.round(((hPhases || 60) / Math.max(1,total)) * 100);
  const hAttack = hStr?.attack ?? 65;
  const aAttack = aStr?.attack ?? 65;
  const hSM = hShotsMult ?? 1;
  const aSM = aShotsMult ?? 1;
  const hShotsTotal = Math.max(result.homeGoals, Math.round((hPhases || 60) / 12 * (hAttack / 75) * hSM + _matchRandomValue(rng) * 2));
  const aShotsTotal = Math.max(result.awayGoals, Math.round((aPhases || 60) / 12 * (aAttack / 75) * aSM + _matchRandomValue(rng) * 2));
  const hOnTarget = Math.max(result.homeGoals, Math.min(hShotsTotal, Math.round(hShotsTotal * (.33 + _matchRandomValue(rng) * .15))));
  const aOnTarget = Math.max(result.awayGoals, Math.min(aShotsTotal, Math.round(aShotsTotal * (.33 + _matchRandomValue(rng) * .15))));
  const hGK = aStr?.goalkeeping ?? 75;
  const aGK = hStr?.goalkeeping ?? 75;
  const hXG = parseFloat((hOnTarget * (.28 + (hAttack / 99) * .10 - (hGK / 99) * .08)).toFixed(2));
  const aXG = parseFloat((aOnTarget * (.28 + (aAttack / 99) * .10 - (aGK / 99) * .08)).toFixed(2));
  return {
    possession:{ home:homePoss, away:100-homePoss },
    shots:{ home:hShotsTotal, away:aShotsTotal },
    shotsOnTarget:{ home:hOnTarget, away:aOnTarget },
    xG:{ home:Math.max(0,hXG), away:Math.max(0,aXG) },
    yellowCards:{
      home:result.events.filter(event => event.type === 'yellow' && event.teamId === result.homeTeamId).length,
      away:result.events.filter(event => event.type === 'yellow' && event.teamId === result.awayTeamId).length,
    },
    substitutions:{
      home:result.events.filter(event => event.type === 'sub' && event.teamId === result.homeTeamId).length,
      away:result.events.filter(event => event.type === 'sub' && event.teamId === result.awayTeamId).length,
    },
    corners:{
      home:Math.round(2 + _matchRandomValue(rng) * 6 + (homePoss > 55 ? 1 : 0)),
      away:Math.round(2 + _matchRandomValue(rng) * 6 + (homePoss < 45 ? 1 : 0)),
    },
    fouls:{ home:Math.round(8 + _matchRandomValue(rng) * 7), away:Math.round(8 + _matchRandomValue(rng) * 7) },
  };
}
