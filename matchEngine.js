/** modules/matchEngine.js — Simulation core. ATK→goals, MID→possession, DEF+GK→resistance. GK never scores. */

const ATT = new Set(['ST','CF','RW','LW','CAM']);
const MID = new Set(['CM','CDM','CAM','RM','LM']);
const DEF = new Set(['CB','RB','LB']);

export function positionGroup(pos) {
  if (ATT.has(pos)) return 'ATT';
  if (MID.has(pos)) return 'MID';
  if (DEF.has(pos)) return 'DEF';
  if (pos === 'GK')  return 'GK';
  return 'MID';
}

export function primaryRating(player) {
  const g = positionGroup(player.position);
  if (g === 'ATT') return player.attack;
  if (g === 'MID') return player.midfield;
  if (g === 'DEF') return player.defence;
  return player.goalkeeping;
}

// ─── Formation presets ───────────────────────────────────
export const FORMATIONS = {
  '4-3-3':   { GK:1, CB:2, RB:1, LB:1, CM:2, CDM:1, RW:1, LW:1, ST:1 },
  '4-2-3-1': { GK:1, CB:2, RB:1, LB:1, CDM:2, CAM:1, RW:1, LW:1, ST:1 },
  '4-4-2':   { GK:1, CB:2, RB:1, LB:1, CM:2, RM:1, LM:1, ST:2 },
  '3-5-2':   { GK:1, CB:3, CM:2, CDM:1, RM:1, LM:1, ST:2 },
  '3-4-3':   { GK:1, CB:3, CM:2, RM:1, LM:1, RW:1, LW:1, ST:1 },
  '5-3-2':   { GK:1, CB:3, RB:1, LB:1, CM:3, ST:2 },
  '4-5-1':   { GK:1, CB:2, RB:1, LB:1, CM:3, RM:1, LM:1, ST:1 },
};

export function pickAIFormation() {
  const keys = Object.keys(FORMATIONS);
  return keys[Math.floor(Math.random() * keys.length)];
}

// ─── Select best 11 for a formation ──────────────────────────
export function selectEleven(players, formation = '4-3-3', lineup = null) {
  const avail  = players.filter(p => !p.injured && !p.suspended && p.inSquad !== false);
  const slots  = { ...FORMATIONS[formation] ?? FORMATIONS['4-3-3'] };
  const chosen = [];
  const used   = new Set();

  // If a saved lineup is provided, use those players first (in order)
  if (lineup && lineup.length === 11) {
    const byId = new Map(avail.map(p => [p.id, p]));
    for (const pid of lineup) {
      const pl = byId.get(pid);
      if (pl && !used.has(pl.id)) { chosen.push(pl); used.add(pl.id); }
    }
    // If all 11 are still available, return them directly
    if (chosen.length === 11) return chosen;
    // Otherwise fall through to fill remaining slots automatically
  }

  // GK first - must be a goalkeeper (skip if already chosen via lineup)
  if (!chosen.some(p => p.position === 'GK')) {
    const gks = avail.filter(p => p.position === 'GK' && !used.has(p.id)).sort((a,b) => b.goalkeeping - a.goalkeeping);
    if (gks[0]) { chosen.push(gks[0]); used.add(gks[0].id); }
  }

  const posMap = {
    ST:['ST','CF'], CF:['CF','ST'], RW:['RW','LW','CAM'], LW:['LW','RW','CAM'],
    CAM:['CAM','CM'], CM:['CM','CDM','CAM'], CDM:['CDM','CM'], RM:['RM','CM'],
    LM:['LM','CM'], CB:['CB'], RB:['RB','CB'], LB:['LB','CB'],
  };

  // Fill positional slots
  for (const [pos, count] of Object.entries(slots)) {
    if (pos === 'GK') continue;
    const acceptable = posMap[pos] ?? [pos];
    for (let n = 0; n < count; n++) {
      const cand = avail.find(p => !used.has(p.id) && acceptable.includes(p.position));
      if (cand) { chosen.push(cand); used.add(cand.id); }
    }
  }

  // Fill any remaining spots with best outfield players
  if (chosen.length < 11) {
    const rem = avail.filter(p => !used.has(p.id) && p.position !== 'GK')
                     .sort((a,b) => primaryRating(b) - primaryRating(a));
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
    .sort((a,b) => primaryRating(b) - primaryRating(a));
}

// ─── Team strength — using the RIGHT attributes for each phase ─
function teamStrength(eleven) {
  const byPos = (positions) => eleven.filter(p => positions.includes(p.position));

  // Attack strength: ST/CF/RW/LW/CAM attack rating
  const attackers = byPos(['ST','CF','RW','LW','CAM']);
  const midfielders = byPos(['CM','CDM','CAM','RM','LM']);
  const defenders  = byPos(['CB','RB','LB']);
  const gk         = byPos(['GK']);

  const avg = (arr, attr) => arr.length ? arr.reduce((s,p) => s + (p[attr]||50), 0) / arr.length : 50;

  return {
    // Attack: how dangerous in front of goal
    attack:      avg(attackers, 'attack'),
    // Midfield: controls possession, chance creation, assists
    midfield:    avg(midfielders, 'midfield'),
    // Defence: how hard to break down
    defence:     avg(defenders, 'defence'),
    // GK: last line of defence
    goalkeeping: avg(gk, 'goalkeeping'),
    eleven,
  };
}

// ─── Fitness degradation ──────────────────────────────────────
function fitMult(fitness) {
  if (fitness >= 80) return 1.00;
  if (fitness >= 65) return 0.95;
  if (fitness >= 50) return 0.88;
  if (fitness >= 35) return 0.78;
  return 0.65;
}

// ─── Goal probability per attacking phase ─────────────────────
// Uses ATTACK rating of attackers vs DEFENCE + GK rating of defenders
function goalChance(attStr, defStr, isHome) {
  // Base rate: ~2.7 goals per 90 minutes total across 120 phases
  const base     = 0.031;  // Tuned: ~2.5-3.2 goals/game across both teams
  // Attack quality: how well forwards finish
  const attBonus = attStr.attack / 99;         // 0→1
  // Defence quality: how well they stop attacks
  const defBlock = defStr.defence / 99;        // 0→1
  // GK quality: how well keeper saves
  const gkSave   = defStr.goalkeeping / 99;    // 0→1

  // Formula: base × attack_quality / (defence_quality × gk_factor)
  // GK contributes ~30% of defensive resistance, defence ~70%
  const defResistance = (defBlock * 0.70 + gkSave * 0.30);
  let   prob = base * (attBonus / defResistance);

  // Slight home advantage
  if (isHome) prob *= 1.06;

  // Midfield advantage: if one team dominates midfield, they get more chances
  // (handled separately via phase distribution)

  return Math.min(Math.max(prob, 0.008), 0.18);
}

// ─── Scorer picker — GK CANNOT score ─────────────────────────
// Weights reflect real-world goal distribution:
//   ST/CF: ~40% of goals, RW/LW: ~20%, CAM: ~12%, CM: ~10%, CDM: ~5%, DEF: ~5%, GK: ~0%
function pickScorer(eleven) {
  const POS_WEIGHTS = {
    'ST': 40, 'CF': 38,
    'RW': 20, 'LW': 20, 'CAM': 15,
    'CM': 8,  'CDM': 3,
    'RM': 10, 'LM': 10,
    'CB': 2,  'RB': 2, 'LB': 2,
    'GK': 0,  // GK NEVER SCORES
  };
  // Weight by position × attack rating bonus (more clinical = more goals)
  const weights = eleven.map(p => {
    const base = POS_WEIGHTS[p.position] ?? 1;
    if (base === 0) return 0;
    // Players with higher attack ratings score more
    const attackBonus = (p.attack / 99) * 0.5 + 0.5;
    return base * attackBonus;
  });

  const total = weights.reduce((a,b) => a+b, 0);
  if (total === 0) return eleven.find(p => p.position !== 'GK') ?? eleven[0];

  let roll = Math.random() * total;
  for (let i = 0; i < eleven.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return eleven[i];
  }
  return eleven[eleven.length - 1];
}

// ─── Assister picker — midfielders create most chances ────────
// Weights reflect: playmakers and wide midfielders provide most assists
function pickAssister(eleven, scorerId) {
  const cands = eleven.filter(p => p.id !== scorerId);
  if (!cands.length) return null;

  const POS_WEIGHTS = {
    'CAM': 30, 'CM': 22, 'CDM': 8,
    'RM': 20,  'LM': 20,
    'RW': 18,  'LW': 18,
    'RB': 8,   'LB': 8,
    'ST': 10,  'CF': 12,
    'CB': 2,   'GK': 0,
  };

  const weights = cands.map(p => {
    const base = POS_WEIGHTS[p.position] ?? 5;
    if (base === 0) return 0;
    // Midfield rating drives assist probability
    const midBonus = (p.midfield / 99) * 0.6 + 0.4;
    return base * midBonus;
  });

  const total = weights.reduce((a,b) => a+b, 0);
  if (total === 0) return cands[0];

  let roll = Math.random() * total;
  for (let i = 0; i < cands.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return cands[i];
  }
  return cands[0];
}

// ─── AI substitution logic ────────────────────────────────────
function shouldSub(fitness, minute, trailsBy) {
  if (minute < 55) return false;
  if (fitness < 65) return true;
  if (fitness < 75 && minute > 70) return true;
  if (trailsBy > 0 && minute > 65 && fitness < 80) return true;
  return false;
}

// ─── Core simulation ─────────────────────────────────────────
export function simulateMatch(homeTeam, awayTeam, homePlayers, awayPlayers, homeFormation, awayFormation, homeLineup, awayLineup) {
  const hFm    = homeFormation ?? '4-3-3';
  const aFm    = awayFormation ?? pickAIFormation();
  const hElev  = selectEleven(homePlayers, hFm, homeLineup ?? null);
  const aElev  = selectEleven(awayPlayers, aFm, awayLineup ?? null);
  const hBench = selectBench(homePlayers, hElev);
  const aBench = selectBench(awayPlayers, aElev);

  const hStr   = teamStrength(hElev);
  const aStr   = teamStrength(aElev);

  // Midfield controls possession/phases: stronger midfield = more attacking phases
  const hMidShare = (hStr.midfield + aStr.midfield) > 0
    ? hStr.midfield / (hStr.midfield + aStr.midfield) : 0.5;

  // Fitness tracking
  const hFitness = new Map(hElev.map(p => [p.id, Math.min(100, p.fitness ?? 90)]));
  const aFitness = new Map(aElev.map(p => [p.id, Math.min(100, p.fitness ?? 90)]));

  let hActive = [...hElev], aActive = [...aElev];
  const hBenchLeft = [...hBench], aBenchLeft = [...aBench];
  let hSubsLeft = 3, aSubsLeft = 3;

  let hGoals = 0, aGoals = 0;
  let hPhases = 0, aPhases = 0;
  const events = [];

  for (let phase = 1; phase <= 120; phase++) {
    const minute   = Math.ceil((phase / 120) * 90);
    const isHome   = Math.random() < hMidShare;

    if (isHome) hPhases++; else aPhases++;

    const attActive  = isHome ? hActive  : aActive;
    const defActive  = isHome ? aActive  : hActive;
    const attTeam    = isHome ? homeTeam : awayTeam;
    const defTeam    = isHome ? awayTeam : homeTeam;
    const attFitMap  = isHome ? hFitness : aFitness;
    const defFitMap  = isHome ? aFitness : hFitness;

    // Fitness degrades each phase
    for (const p of attActive) attFitMap.set(p.id, Math.max(0, (attFitMap.get(p.id) ?? 90) - 0.22));
    for (const p of defActive) defFitMap.set(p.id, Math.max(0, (defFitMap.get(p.id) ?? 90) - 0.15));

    // Average fitness of attacking outfield players
    const attOutfield = attActive.filter(p => p.position !== 'GK');
    const avgAttFit   = attOutfield.reduce((s,p) => s+(attFitMap.get(p.id)??90),0) / Math.max(1,attOutfield.length);

    // Use ATTACK stat of attacking team, DEFENCE+GK of defending team
    const attStr = isHome ? hStr : aStr;
    const defStr = isHome ? aStr : hStr;
    const gProb  = goalChance(attStr, defStr, isHome) * fitMult(avgAttFit);

    // Goal?
    if (attActive.length >= 7 && Math.random() < gProb) {
      const scorer   = pickScorer(attActive);
      // Assister probability increased by midfield quality
      const assistProb = 0.55 + (attStr.midfield / 99) * 0.25; // 55-80%
      const assister   = Math.random() < assistProb ? pickAssister(attActive, scorer.id) : null;
      if (isHome) hGoals++; else aGoals++;
      events.push({
        type:'goal', minute,
        teamId:     attTeam.id,
        playerId:   scorer.id,
        playerName: scorer.name,
        assistId:   assister?.id   ?? null,
        assistName: assister?.name ?? null,
      });
    }

    // Yellow card (~0.4% per phase — more likely from defenders)
    if (Math.random() < 0.004 && defActive.length) {
      // More likely to be a defender/CDM (hard tackles)
      const yellowCands = defActive.filter(p => p.position !== 'GK');
      if (yellowCands.length) {
        const defWeights = yellowCands.map(p => DEF.has(p.position) ? 4 : p.position === 'CDM' ? 3 : 1);
        const total = defWeights.reduce((a,b) => a+b, 0);
        let roll = Math.random() * total;
        let target = yellowCands[0];
        for (let i = 0; i < yellowCands.length; i++) { roll -= defWeights[i]; if (roll <= 0) { target = yellowCands[i]; break; } }
        events.push({ type:'yellow', minute, teamId:defTeam.id, playerId:target.id, playerName:target.name });
      }
    }

    // AI substitutions (every 10 phases)
    if (phase % 10 === 0) {
      const trailH = aGoals - hGoals, trailA = hGoals - aGoals;
      if (hSubsLeft > 0) {
        const tired = hActive.filter(p => p.position !== 'GK' && shouldSub(hFitness.get(p.id) ?? 90, minute, trailH));
        for (const out of tired.slice(0, hSubsLeft)) {
          const sub = hBenchLeft.shift(); if (!sub) break;
          hActive = hActive.map(p => p.id === out.id ? sub : p);
          hFitness.set(sub.id, 90); hSubsLeft--;
          events.push({ type:'sub', minute, teamId:homeTeam.id, outId:out.id, outName:out.name, inId:sub.id, inName:sub.name });
        }
      }
      if (aSubsLeft > 0) {
        const tired = aActive.filter(p => p.position !== 'GK' && shouldSub(aFitness.get(p.id) ?? 90, minute, trailA));
        for (const out of tired.slice(0, aSubsLeft)) {
          const sub = aBenchLeft.shift(); if (!sub) break;
          aActive = aActive.map(p => p.id === out.id ? sub : p);
          aFitness.set(sub.id, 90); aSubsLeft--;
          events.push({ type:'sub', minute, teamId:awayTeam.id, outId:out.id, outName:out.name, inId:sub.id, inName:sub.name });
        }
      }
    }
  }

  const hScorers = events.filter(e => e.type === 'goal' && e.teamId === homeTeam.id);
  const aScorers = events.filter(e => e.type === 'goal' && e.teamId === awayTeam.id);

  // Fitness updates after match
  const fitnessUpdates = [];
  const allPlayed = new Set([...hElev, ...hBench.filter(p => !hBenchLeft.includes(p))].map(p=>p.id));
  for (const p of hElev)  fitnessUpdates.push({ id:p.id, teamId:homeTeam.id, newFitness:Math.max(30, hFitness.get(p.id) ?? 65) });
  for (const p of aElev)  fitnessUpdates.push({ id:p.id, teamId:awayTeam.id, newFitness:Math.max(30, aFitness.get(p.id) ?? 65) });

  const stats = computeMatchStats(
    { homeGoals:hGoals, awayGoals:aGoals, homeTeamId:homeTeam.id, awayTeamId:awayTeam.id, events },
    hPhases, aPhases, hStr, aStr
  );

  return {
    homeTeamId:   homeTeam.id,    awayTeamId:   awayTeam.id,
    homeTeamName: homeTeam.name,  awayTeamName: awayTeam.name,
    homeTeamCrest: homeTeam.crest ?? '⚽', awayTeamCrest: awayTeam.crest ?? '⚽',
    homeGoals: hGoals, awayGoals: aGoals,
    homeScorers: hScorers, awayScorers: aScorers,
    events: events.sort((a,b) => a.minute - b.minute),
    outcome: hGoals > aGoals ? 'home_win' : hGoals < aGoals ? 'away_win' : 'draw',
    fitnessUpdates, stats,
    homeFormation: hFm, awayFormation: aFm,
  };
}

// ─── Phased simulation for Watch Match mode ──────────────────
// Simulates phases from startPhase to endPhase (1-120) using
// provided live state. Returns events + updated live state.
// Live state can be mutated between segments for real-time interventions.
export function simulateMatchSegment(homeTeam, awayTeam, liveState, startPhase, endPhase) {
  const {
    hActive, aActive, hFitness, aFitness,
    hBenchLeft, aBenchLeft, hSubsLeft, aSubsLeft,
    hGoals, aGoals, hPhases, aPhases, hStr, aStr, hMidShare,
  } = liveState;

  let curHGoals = hGoals, curAGoals = aGoals;
  let curHPhases = hPhases, curAPhases = aPhases;
  let curHActive = [...hActive], curAActive = [...aActive];
  let curHBench = [...hBenchLeft], curABench = [...aBenchLeft];
  let curHSubs = hSubsLeft, curASubsLeft = aSubsLeft;
  const segEvents = [];

  for (let phase = startPhase; phase <= endPhase; phase++) {
    const minute = Math.ceil((phase / 120) * 90);
    const isHome = Math.random() < hMidShare;
    if (isHome) curHPhases++; else curAPhases++;

    const attActive = isHome ? curHActive : curAActive;
    const defActive = isHome ? curAActive : curHActive;
    const attTeam   = isHome ? homeTeam   : awayTeam;
    const defTeam   = isHome ? awayTeam   : homeTeam;
    const attFitMap = isHome ? hFitness   : aFitness;
    const defFitMap = isHome ? aFitness   : hFitness;

    for (const p of attActive) attFitMap.set(p.id, Math.max(0, (attFitMap.get(p.id) ?? 90) - 0.22));
    for (const p of defActive) defFitMap.set(p.id, Math.max(0, (defFitMap.get(p.id) ?? 90) - 0.15));

    const attOutfield = attActive.filter(p => p.position !== 'GK');
    const avgAttFit = attOutfield.reduce((s,p) => s+(attFitMap.get(p.id)??90),0) / Math.max(1,attOutfield.length);

    const segAttStr = isHome ? hStr : aStr;
    const segDefStr = isHome ? aStr : hStr;
    const gProb = goalChance(segAttStr, segDefStr, isHome) * fitMult(avgAttFit);

    if (attActive.length >= 7 && Math.random() < gProb) {
      const scorer = pickScorer(attActive);
      const assistProb = 0.55 + (segAttStr.midfield / 99) * 0.25;
      const assister = Math.random() < assistProb ? pickAssister(attActive, scorer.id) : null;
      if (isHome) curHGoals++; else curAGoals++;
      segEvents.push({
        type: 'goal', minute,
        teamId: attTeam.id, playerId: scorer.id, playerName: scorer.name,
        assistId: assister?.id ?? null, assistName: assister?.name ?? null,
      });
    }

    if (Math.random() < 0.004 && defActive.length) {
      const yellowCands = defActive.filter(p => p.position !== 'GK');
      if (yellowCands.length) {
        const defWeights = yellowCands.map(p => DEF.has(p.position) ? 4 : p.position === 'CDM' ? 3 : 1);
        const total = defWeights.reduce((a,b) => a+b, 0);
        let roll = Math.random() * total;
        let target = yellowCands[0];
        for (let i = 0; i < yellowCands.length; i++) { roll -= defWeights[i]; if (roll <= 0) { target = yellowCands[i]; break; } }
        segEvents.push({ type:'yellow', minute, teamId:defTeam.id, playerId:target.id, playerName:target.name });
      }
    }

    if (phase % 10 === 0) {
      const trailH = curAGoals - curHGoals, trailA = curHGoals - curAGoals;
      if (curHSubs > 0) {
        const tired = curHActive.filter(p => p.position !== 'GK' && shouldSub(hFitness.get(p.id) ?? 90, minute, trailH));
        for (const out of tired.slice(0, curHSubs)) {
          const sub = curHBench.shift(); if (!sub) break;
          curHActive = curHActive.map(p => p.id === out.id ? sub : p);
          hFitness.set(sub.id, 90); curHSubs--;
          segEvents.push({ type:'sub', minute, teamId:homeTeam.id, outId:out.id, outName:out.name, inId:sub.id, inName:sub.name });
        }
      }
      if (curASubsLeft > 0) {
        const tired = curAActive.filter(p => p.position !== 'GK' && shouldSub(aFitness.get(p.id) ?? 90, minute, trailA));
        for (const out of tired.slice(0, curASubsLeft)) {
          const sub = curABench.shift(); if (!sub) break;
          curAActive = curAActive.map(p => p.id === out.id ? sub : p);
          aFitness.set(sub.id, 90); curASubsLeft--;
          segEvents.push({ type:'sub', minute, teamId:awayTeam.id, outId:out.id, outName:out.name, inId:sub.id, inName:sub.name });
        }
      }
    }
  }

  return {
    segEvents,
    updatedState: {
      ...liveState,
      hActive: curHActive, aActive: curAActive,
      hBenchLeft: curHBench, aBenchLeft: curABench,
      hSubsLeft: curHSubs, aSubsLeft: curASubsLeft,
      hGoals: curHGoals, aGoals: curAGoals,
      hPhases: curHPhases, aPhases: curAPhases,
    },
  };
}

// ─── Build initial live state for Watch Match mode ─────────────
export function buildLiveMatchState(homeTeam, awayTeam, homePlayers, awayPlayers, homeFormation, awayFormation, homeLineup, awayLineup) {
  const hFm   = homeFormation ?? '4-3-3';
  const aFm   = awayFormation ?? pickAIFormation();
  const hElev = selectEleven(homePlayers, hFm, homeLineup ?? null);
  const aElev = selectEleven(awayPlayers, aFm, awayLineup ?? null);
  const hBench = selectBench(homePlayers, hElev);
  const aBench = selectBench(awayPlayers, aElev);
  const hStr  = teamStrength(hElev);
  const aStr  = teamStrength(aElev);
  const hMidShare = (hStr.midfield + aStr.midfield) > 0
    ? hStr.midfield / (hStr.midfield + aStr.midfield) : 0.5;

  return {
    hActive: [...hElev], aActive: [...aElev],
    hBenchLeft: [...hBench], aBenchLeft: [...aBench],
    hFitness: new Map(hElev.map(p => [p.id, Math.min(100, p.fitness ?? 90)])),
    aFitness: new Map(aElev.map(p => [p.id, Math.min(100, p.fitness ?? 90)])),
    hSubsLeft: 3, aSubsLeft: 3,
    hGoals: 0, aGoals: 0,
    hPhases: 0, aPhases: 0,
    hStr, aStr, hMidShare,
    hElev, aElev, hBench, aBench,
    homeFormation: hFm, awayFormation: aFm,
  };
}

// ─── Finalise a live match into the standard result shape ──────
export function finaliseLiveMatch(homeTeam, awayTeam, liveState, allEvents) {
  const { hGoals, aGoals, hPhases, aPhases, hStr, aStr, hElev, aElev, hBench, aBenchLeft, hFitness, aFitness, homeFormation, awayFormation } = liveState;
  const fitnessUpdates = [];
  for (const p of hElev) fitnessUpdates.push({ id:p.id, teamId:homeTeam.id, newFitness:Math.max(30, hFitness.get(p.id) ?? 65) });
  for (const p of aElev) fitnessUpdates.push({ id:p.id, teamId:awayTeam.id, newFitness:Math.max(30, aFitness.get(p.id) ?? 65) });

  const hScorers = allEvents.filter(e => e.type === 'goal' && e.teamId === homeTeam.id);
  const aScorers = allEvents.filter(e => e.type === 'goal' && e.teamId === awayTeam.id);
  const stats = computeMatchStats(
    { homeGoals:hGoals, awayGoals:aGoals, homeTeamId:homeTeam.id, awayTeamId:awayTeam.id, events:allEvents },
    hPhases, aPhases, hStr, aStr
  );
  return {
    homeTeamId: homeTeam.id,    awayTeamId: awayTeam.id,
    homeTeamName: homeTeam.name, awayTeamName: awayTeam.name,
    homeTeamCrest: homeTeam.crest ?? '⚽', awayTeamCrest: awayTeam.crest ?? '⚽',
    homeGoals: hGoals, awayGoals: aGoals,
    homeScorers: hScorers, awayScorers: aScorers,
    events: allEvents.sort((a,b) => a.minute - b.minute),
    outcome: hGoals > aGoals ? 'home_win' : hGoals < aGoals ? 'away_win' : 'draw',
    fitnessUpdates, stats,
    homeFormation, awayFormation,
  };
}

// ─── Rich match statistics ────────────────────────────────────
export function computeMatchStats(result, hPhases, aPhases, hStr, aStr) {
  const total = (hPhases||60) + (aPhases||60);
  const homePoss = Math.round(((hPhases||60) / total) * 100);

  // Shots based on phases + attack quality
  const hAttack = hStr?.attack ?? 65;
  const aAttack = aStr?.attack ?? 65;
  const hShotsTotal  = Math.max(result.homeGoals, Math.round((hPhases||60) / 12 * (hAttack/75) + Math.random() * 2));
  const aShotsTotal  = Math.max(result.awayGoals, Math.round((aPhases||60) / 12 * (aAttack/75) + Math.random() * 2));
  const hOnTarget    = Math.max(result.homeGoals, Math.min(hShotsTotal, Math.round(hShotsTotal * (0.33 + Math.random() * 0.15))));
  const aOnTarget    = Math.max(result.awayGoals, Math.min(aShotsTotal, Math.round(aShotsTotal * (0.33 + Math.random() * 0.15))));

  // xG: shots on target × conversion rate based on attack/gk quality
  const hGK = aStr?.goalkeeping ?? 75;
  const aGK = hStr?.goalkeeping ?? 75;
  const hXG = parseFloat((hOnTarget * (0.12 + (hAttack/99)*0.06 - (hGK/99)*0.04)).toFixed(2));
  const aXG = parseFloat((aOnTarget * (0.12 + (aAttack/99)*0.06 - (aGK/99)*0.04)).toFixed(2));

  return {
    possession:    { home: homePoss, away: 100 - homePoss },
    shots:         { home: hShotsTotal, away: aShotsTotal },
    shotsOnTarget: { home: hOnTarget, away: aOnTarget },
    xG:            { home: Math.max(0, hXG), away: Math.max(0, aXG) },
    yellowCards:   { home: result.events.filter(e=>e.type==='yellow'&&e.teamId===result.homeTeamId).length, away: result.events.filter(e=>e.type==='yellow'&&e.teamId===result.awayTeamId).length },
    substitutions: { home: result.events.filter(e=>e.type==='sub'&&e.teamId===result.homeTeamId).length, away: result.events.filter(e=>e.type==='sub'&&e.teamId===result.awayTeamId).length },
    corners:       { home: Math.round(2 + Math.random()*6 + (homePoss>55?1:0)), away: Math.round(2 + Math.random()*6 + (homePoss<45?1:0)) },
    fouls:         { home: Math.round(8 + Math.random()*7), away: Math.round(8 + Math.random()*7) },
  };
}
