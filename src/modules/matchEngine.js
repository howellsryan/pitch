import { rollInjuryCheck } from './injuries.js';
import {
  DEFAULT_TEAM_INSTRUCTIONS,
  chooseAIRole,
  getAITacticalProfile,
  getRoleTeamModifiers,
  getTacticalModifiers,
  isUserTacticalPlan,
  normalizeTeamInstructions,
  resolvePlayerRole,
  stableStringHash,
} from './tactics.js';

/**
 * modules/matchEngine.js — authoritative P2 simulation core.
 *
 * Quick Sim and Watch Match both construct the same live state and call the
 * same phased runner. The RNG state is serialisable and travels inside the
 * live state, so slicing a match into broadcast ticks cannot change its result.
 */

export const ATT = new Set(['ST','CF','RW','LW','CAM']);
export const MID = new Set(['CM','CDM','CAM','RM','LM']);
export const DEF = new Set(['CB','RB','LB']);
export const MATCH_INJURY_CHECK_INTERVAL = 6;
export const MATCH_PHASES = 120;

export function matchInjuryIntervalRate(perPhaseRate, interval = MATCH_INJURY_CHECK_INTERVAL) {
  return 1 - Math.pow(1 - perPhaseRate, interval);
}

export function positionGroup(pos) {
  if (ATT.has(pos)) return 'ATT';
  if (MID.has(pos)) return 'MID';
  if (DEF.has(pos)) return 'DEF';
  if (pos === 'GK') return 'GK';
  return 'MID';
}

export function primaryRating(player) {
  const g = positionGroup(player.position);
  if (g === 'ATT') return player.attack;
  if (g === 'MID') return player.midfield;
  if (g === 'DEF') return player.defence;
  return player.goalkeeping;
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

function randomValue(rng) { return typeof rng === 'function' ? rng() : Math.random(); }

export function pickAIFormation(rng = Math.random) {
  const keys = Object.keys(FORMATIONS);
  return keys[Math.floor(randomValue(rng) * keys.length)];
}

export function selectEleven(players, formation = '4-3-3', lineup = null) {
  const avail = players.filter(p => !p.injured && !p.suspended && p.inSquad !== false);
  const slots = { ...(FORMATIONS[formation] ?? FORMATIONS['4-3-3']) };
  const chosen = [];
  const used = new Set();

  if (lineup && lineup.length === 11) {
    const allById = new Map(players.map(p => [p.id, p]));
    for (const pid of lineup) {
      const pl = allById.get(pid);
      if (pl && !used.has(pl.id)) { chosen.push(pl); used.add(pl.id); }
    }
    if (chosen.length === 11) return chosen;
  }

  if (!chosen.some(p => p.position === 'GK')) {
    const gks = avail.filter(p => p.position === 'GK' && !used.has(p.id)).sort((a,b) => (b.goalkeeping ?? 0) - (a.goalkeeping ?? 0));
    if (gks[0]) { chosen.push(gks[0]); used.add(gks[0].id); }
  }

  const posMap = {
    ST:['ST','CF'], CF:['CF','ST'], RW:['RW','LW','CAM'], LW:['LW','RW','CAM'],
    CAM:['CAM','CM'], CM:['CM','CDM','CAM'], CDM:['CDM','CM'], RM:['RM','CM'], LM:['LM','CM'],
    CB:['CB'], RB:['RB','CB'], LB:['LB','CB'],
  };

  for (const [pos, count] of Object.entries(slots)) {
    if (pos === 'GK') continue;
    const acceptable = posMap[pos] ?? [pos];
    for (let n = 0; n < count; n++) {
      const cand = avail.find(p => !used.has(p.id) && acceptable.includes(p.position));
      if (cand) { chosen.push(cand); used.add(cand.id); }
    }
  }

  if (chosen.length < 11) {
    const rem = avail.filter(p => !used.has(p.id) && p.position !== 'GK')
      .sort((a,b) => (primaryRating(b) ?? 0) - (primaryRating(a) ?? 0));
    for (const p of rem) {
      if (chosen.length >= 11) break;
      chosen.push(p); used.add(p.id);
    }
  }
  return chosen.slice(0, 11);
}

export function selectBench(players, eleven) {
  const usedIds = new Set(eleven.map(p => p.id));
  return players
    .filter(p => !p.injured && !p.suspended && p.inSquad !== false && !usedIds.has(p.id))
    .sort((a,b) => (primaryRating(b) ?? 0) - (primaryRating(a) ?? 0));
}

export function teamStrength(eleven) {
  const ATTACK_W = { ST:1.0, CF:1.0, RW:.85, LW:.85, CAM:.70, CM:.25, CDM:.10, RM:.40, LM:.40, CB:.05, RB:.08, LB:.08, GK:0 };
  const MIDFIELD_W = { CAM:1.0, CM:1.0, CDM:.85, RM:.90, LM:.90, ST:.20, CF:.25, RW:.35, LW:.35, CB:.15, RB:.25, LB:.25, GK:0 };
  const DEFENCE_W = { CB:1.0, RB:.90, LB:.90, CDM:.60, CM:.25, RM:.15, LM:.15, CAM:.10, ST:.05, CF:.05, RW:.05, LW:.05, GK:0 };
  function weightedAvg(attr, weights) {
    let sum = 0, wt = 0;
    for (const p of eleven) {
      const w = weights[p.position] ?? .1;
      sum += Number(p?.[attr] ?? 50) * w;
      wt += w;
    }
    return wt > 0 ? sum / wt : 50;
  }
  const gk = eleven.find(p => p.position === 'GK');
  return {
    attack:weightedAvg('attack', ATTACK_W),
    midfield:weightedAvg('midfield', MIDFIELD_W),
    defence:weightedAvg('defence', DEFENCE_W),
    goalkeeping:gk ? Number(gk.goalkeeping ?? 50) : 50,
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

export function pickScorer(eleven, rng = Math.random) {
  const POS_WEIGHTS = {
    'ST': 40, 'CF': 38, 'RW': 20, 'LW': 20, 'CAM': 15, 'CM': 8, 'CDM': 3,
    'RM': 10, 'LM': 10, 'CB': 2, 'RB': 2, 'LB': 2,
    'GK': 0,
  };
  const weights = eleven.map(p => {
    const base = POS_WEIGHTS[p.position] ?? 1;
    if (!base) return 0;
    const norm = Number(p.attack ?? 50) / 99;
    return base * (norm * norm * 1.5 + .5);
  });
  const total = weights.reduce((a,b) => a + b, 0);
  if (!total) return eleven.find(p => p.position !== 'GK') ?? eleven[0];
  let roll = randomValue(rng) * total;
  for (let i = 0; i < eleven.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return eleven[i];
  }
  return eleven[eleven.length - 1];
}

export function pickAssister(eleven, scorerId, rng = Math.random) {
  const cands = eleven.filter(p => p.id !== scorerId);
  if (!cands.length) return null;
  const POS_WEIGHTS = { CAM:30, CM:22, CDM:8, RM:20, LM:20, RW:18, LW:18, RB:8, LB:8, ST:10, CF:12, CB:2, GK:0 };
  const weights = cands.map(p => {
    const base = POS_WEIGHTS[p.position] ?? 5;
    if (!base) return 0;
    return base * ((Number(p.midfield ?? 50) / 99) * .6 + .4);
  });
  const total = weights.reduce((a,b) => a + b, 0);
  if (!total) return cands[0];
  let roll = randomValue(rng) * total;
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
    .map(p => [p.id, p.position, Math.round(Number(p.fitness ?? 90)), Number(p.appearances ?? 0), Number(p.goals ?? 0), Number(p.assists ?? 0), p.tacticalRole ?? ''].join(':'))
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
  const profile = getAITacticalProfile(team, opponent, isHome);
  const roles = {};
  for (const player of players ?? []) roles[player.id] = chooseAIRole(player, profile);
  return { ...profile, profileId:profile.id, profileLabel:profile.label, roles };
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

export function buildLiveMatchState(homeTeam, awayTeam, homePlayers, awayPlayers, homeFormation, awayFormation, homeLineup, awayLineup, homeMentality, awayMentality, options = {}) {
  const hIdentity = resolveTeamTacticalIdentity(homeTeam, awayTeam, homePlayers, homeFormation, homeMentality, true);
  const aIdentity = resolveTeamTacticalIdentity(awayTeam, homeTeam, awayPlayers, awayFormation, awayMentality, false);
  const rawHElev = selectEleven(homePlayers, hIdentity.formation, homeLineup ?? null);
  const rawAElev = selectEleven(awayPlayers, aIdentity.formation, awayLineup ?? null);
  const rawHBench = selectBench(homePlayers, rawHElev);
  const rawABench = selectBench(awayPlayers, rawAElev);
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
  let state = refreshLiveMatchState(liveState);
  const cursor = cursorFrom(state.rngState ?? state.seed);
  let curHActive = [...state.hActive], curAActive = [...state.aActive];
  let curHBench = [...state.hBenchLeft], curABench = [...state.aBenchLeft];
  const hFitness = new Map(state.hFitness), aFitness = new Map(state.aFitness);
  let curHSubs = state.hSubsLeft, curASubs = state.aSubsLeft;
  let curHGoals = state.hGoals, curAGoals = state.aGoals;
  let curHPhases = state.hPhases, curAPhases = state.aPhases;
  let hStr = state.hStr, aStr = state.aStr;
  const segEvents = [];

  const inferredControlled = controlledTeamId
    ?? (state.homePlanSource === 'user' && state.awayPlanSource !== 'user' ? homeTeam.id
      : state.awayPlanSource === 'user' && state.homePlanSource !== 'user' ? awayTeam.id : null);

  for (let phase = startPhase; phase <= endPhase; phase++) {
    const minute = Math.ceil((phase / MATCH_PHASES) * 90);
    const hBaseMods = combinedMods(state.homeMentality, state.homeTactics, state.awayTactics);
    const aBaseMods = combinedMods(state.awayMentality, state.awayTactics, state.homeTactics);
    const hMods = scoreAdjustedMods(hBaseMods, state.homePlanSource, curHGoals, curAGoals, minute);
    const aMods = scoreAdjustedMods(aBaseMods, state.awayPlanSource, curAGoals, curHGoals, minute);
    const hMidShare = midfieldShare(hStr, aStr, hMods, aMods);
    const isHome = cursor.next() < hMidShare;
    if (isHome) curHPhases++; else curAPhases++;

    const attActive = isHome ? curHActive : curAActive;
    const defActive = isHome ? curAActive : curHActive;
    const attTeam = isHome ? homeTeam : awayTeam;
    const defTeam = isHome ? awayTeam : homeTeam;
    const attFitMap = isHome ? hFitness : aFitness;
    const defFitMap = isHome ? aFitness : hFitness;
    const attMods = isHome ? hMods : aMods;
    const defMods = isHome ? aMods : hMods;

    for (const p of attActive) {
      const next = (attFitMap.get(p.id) ?? 90) - .18 * ageDrain(p.age ?? 24) * attMods.fitnessDrainMult;
      attFitMap.set(p.id, Math.max(0, next));
    }
    for (const p of defActive) {
      const next = (defFitMap.get(p.id) ?? 90) - .12 * ageDrain(p.age ?? 24) * defMods.fitnessDrainMult;
      defFitMap.set(p.id, Math.max(0, next));
    }

    const attOutfield = attActive.filter(p => p.position !== 'GK');
    const avgAttFit = attOutfield.reduce((sum,p) => sum + (attFitMap.get(p.id) ?? 90), 0) / Math.max(1, attOutfield.length);
    const attStr = isHome ? hStr : aStr;
    const defStr = isHome ? aStr : hStr;
    const lateDef = minute >= 70 ? defMods.lateDefResistMult : 1;
    const gProb = goalChance(attStr, defStr, isHome) * fitMult(avgAttFit)
      * attMods.goalProbMult / Math.max(.5, defMods.defResistMult * lateDef);

    if (attActive.length >= 7 && cursor.next() < gProb) {
      const scorer = pickScorer(attActive, () => cursor.next());
      const assistProb = .55 + (attStr.midfield / 99) * .25;
      const assister = cursor.next() < assistProb ? pickAssister(attActive, scorer.id, () => cursor.next()) : null;
      if (isHome) curHGoals++; else curAGoals++;
      segEvents.push({
        type:'goal', minute, teamId:attTeam.id, playerId:scorer.id, playerName:scorer.name,
        assistId:assister?.id ?? null, assistName:assister?.name ?? null,
      });
    }

    if (cursor.next() < .004 * defMods.yellowRiskMult && defActive.length) {
      const candidates = defActive.filter(p => p.position !== 'GK');
      if (candidates.length) {
        const weights = candidates.map(p => DEF.has(p.position) ? 4 : p.position === 'CDM' ? 3 : 1);
        const total = weights.reduce((a,b) => a + b, 0);
        let roll = cursor.next() * total;
        let target = candidates[0];
        for (let i = 0; i < candidates.length; i++) {
          roll -= weights[i];
          if (roll <= 0) { target = candidates[i]; break; }
        }
        segEvents.push({ type:'yellow', minute, teamId:defTeam.id, playerId:target.id, playerName:target.name });
      }
    }

    if (typeof rollInjuryCheck === 'function' && phase % MATCH_INJURY_CHECK_INTERVAL === 0) {
      for (const side of [
        { active:curHActive, team:homeTeam, mods:hMods },
        { active:curAActive, team:awayTeam, mods:aMods },
      ]) {
        for (const player of side.active) {
          if (player.injured || player._injuredThisMatch) continue;
          const perPhaseRate = player.position === 'GK' ? .000120 : .000333;
          const intervalRate = matchInjuryIntervalRate(perPhaseRate) * side.mods.injuryRiskMult;
          if (cursor.next() > intervalRate) continue;
          const injury = rollInjuryCheck(player, side.mods.fitnessDrainMult > 1.1, true, () => cursor.next());
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
      if (curHSubs > 0 && homeTeam.id !== inferredControlled) {
        const tired = curHActive.filter(p => p.position !== 'GK' && shouldSub(hFitness.get(p.id) ?? 90, minute, trailH));
        for (const out of tired.slice(0, curHSubs)) {
          const sub = curHBench.shift(); if (!sub) break;
          curHActive = curHActive.map(p => p.id === out.id ? sub : p);
          hFitness.set(sub.id, Math.min(100, Number(sub.fitness ?? 90))); curHSubs--;
          segEvents.push({ type:'sub', minute, teamId:homeTeam.id, outId:out.id, outName:out.name, inId:sub.id, inName:sub.name });
        }
      }
      if (curASubs > 0 && awayTeam.id !== inferredControlled) {
        const tired = curAActive.filter(p => p.position !== 'GK' && shouldSub(aFitness.get(p.id) ?? 90, minute, trailA));
        for (const out of tired.slice(0, curASubs)) {
          const sub = curABench.shift(); if (!sub) break;
          curAActive = curAActive.map(p => p.id === out.id ? sub : p);
          aFitness.set(sub.id, Math.min(100, Number(sub.fitness ?? 90))); curASubs--;
          segEvents.push({ type:'sub', minute, teamId:awayTeam.id, outId:out.id, outName:out.name, inId:sub.id, inName:sub.name });
        }
      }
      hStr = effectiveTeamStrength(curHActive, state.homeRoles, state.homeTactics);
      aStr = effectiveTeamStrength(curAActive, state.awayRoles, state.awayTactics);
    }
  }

  const hMods = combinedMods(state.homeMentality, state.homeTactics, state.awayTactics);
  const aMods = combinedMods(state.awayMentality, state.awayTactics, state.homeTactics);
  return {
    segEvents,
    updatedState:{
      ...state,
      hActive:curHActive, aActive:curAActive, hBenchLeft:curHBench, aBenchLeft:curABench,
      hFitness, aFitness, hSubsLeft:curHSubs, aSubsLeft:curASubs,
      hGoals:curHGoals, aGoals:curAGoals, hPhases:curHPhases, aPhases:curAPhases,
      hStr, aStr, hMods, aMods, hMidShare:midfieldShare(hStr, aStr, hMods, aMods), rngState:cursor.state,
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
  return finaliseLiveMatch(homeTeam, awayTeam, updatedState, segEvents);
}

export function finaliseLiveMatch(homeTeam, awayTeam, liveState, allEvents) {
  const state = refreshLiveMatchState(liveState);
  const fitnessUpdates = [];
  for (const p of state.hElev) fitnessUpdates.push({ id:p.id, teamId:homeTeam.id, newFitness:Math.max(30, state.hFitness.get(p.id) ?? 65) });
  for (const p of state.aElev) fitnessUpdates.push({ id:p.id, teamId:awayTeam.id, newFitness:Math.max(30, state.aFitness.get(p.id) ?? 65) });
  const events = [...(allEvents ?? [])].sort((a,b) => a.minute - b.minute);
  const hScorers = events.filter(e => e.type === 'goal' && e.teamId === homeTeam.id);
  const aScorers = events.filter(e => e.type === 'goal' && e.teamId === awayTeam.id);
  const cursor = cursorFrom(state.rngState ?? state.seed);
  const stats = computeMatchStats(
    { homeGoals:state.hGoals, awayGoals:state.aGoals, homeTeamId:homeTeam.id, awayTeamId:awayTeam.id, events },
    state.hPhases, state.aPhases, state.hStr, state.aStr,
    state.hMods.shotsMultSelf, state.aMods.shotsMultSelf,
    () => cursor.next(),
  );
  return {
    homeTeamId:homeTeam.id, awayTeamId:awayTeam.id,
    homeTeamName:homeTeam.name, awayTeamName:awayTeam.name,
    homeTeamCrest:homeTeam.crest ?? '⚽', awayTeamCrest:awayTeam.crest ?? '⚽',
    homeGoals:state.hGoals, awayGoals:state.aGoals,
    homeScorers:hScorers, awayScorers:aScorers, events,
    outcome:state.hGoals > state.aGoals ? 'home_win' : state.hGoals < state.aGoals ? 'away_win' : 'draw',
    fitnessUpdates, stats,
    homeFormation:state.homeFormation, awayFormation:state.awayFormation,
    homeMentality:state.homeMentality, awayMentality:state.awayMentality,
    homeTactics:state.homeTactics, awayTactics:state.awayTactics,
    homeProfileId:state.homeProfileId, awayProfileId:state.awayProfileId,
    seed:state.seed,
  };
}

export function computeMatchStats(result, hPhases, aPhases, hStr, aStr, hShotsMult, aShotsMult, rng = Math.random) {
  const total = (hPhases || 60) + (aPhases || 60);
  const homePoss = Math.round(((hPhases || 60) / Math.max(1,total)) * 100);
  const hAttack = hStr?.attack ?? 65;
  const aAttack = aStr?.attack ?? 65;
  const hSM = hShotsMult ?? 1;
  const aSM = aShotsMult ?? 1;
  const hShotsTotal = Math.max(result.homeGoals, Math.round((hPhases || 60) / 12 * (hAttack / 75) * hSM + randomValue(rng) * 2));
  const aShotsTotal = Math.max(result.awayGoals, Math.round((aPhases || 60) / 12 * (aAttack / 75) * aSM + randomValue(rng) * 2));
  const hOnTarget = Math.max(result.homeGoals, Math.min(hShotsTotal, Math.round(hShotsTotal * (.33 + randomValue(rng) * .15))));
  const aOnTarget = Math.max(result.awayGoals, Math.min(aShotsTotal, Math.round(aShotsTotal * (.33 + randomValue(rng) * .15))));
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
      home:result.events.filter(e => e.type === 'yellow' && e.teamId === result.homeTeamId).length,
      away:result.events.filter(e => e.type === 'yellow' && e.teamId === result.awayTeamId).length,
    },
    substitutions:{
      home:result.events.filter(e => e.type === 'sub' && e.teamId === result.homeTeamId).length,
      away:result.events.filter(e => e.type === 'sub' && e.teamId === result.awayTeamId).length,
    },
    corners:{
      home:Math.round(2 + randomValue(rng) * 6 + (homePoss > 55 ? 1 : 0)),
      away:Math.round(2 + randomValue(rng) * 6 + (homePoss < 45 ? 1 : 0)),
    },
    fouls:{ home:Math.round(8 + randomValue(rng) * 7), away:Math.round(8 + randomValue(rng) * 7) },
  };
}
