/** modules/matchEngine.js — Simulation core. ATK→goals, MID→possession, DEF+GK→resistance. GK never scores. */

const ATT = new Set(['ST','CF','RW','LW','CAM']);
const MID = new Set(['CM','CDM','CAM','RM','LM']);
const DEF = new Set(['CB','RB','LB']);

function positionGroup(pos) {
  if (ATT.has(pos)) return 'ATT';
  if (MID.has(pos)) return 'MID';
  if (DEF.has(pos)) return 'DEF';
  if (pos === 'GK')  return 'GK';
  return 'MID';
}

function primaryRating(player) {
  const g = positionGroup(player.position);
  if (g === 'ATT') return player.attack;
  if (g === 'MID') return player.midfield;
  if (g === 'DEF') return player.defence;
  return player.goalkeeping;
}

// ─── Formation presets ───────────────────────────────────
const FORMATIONS = {
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

function pickAIFormation() {
  const keys = Object.keys(FORMATIONS);
  return keys[Math.floor(Math.random() * keys.length)];
}

// ─── Select best 11 for a formation ──────────────────────────
function selectEleven(players, formation = '4-3-3', lineup = null) {
  const avail  = players.filter(p => !p.injured && !p.suspended && p.inSquad !== false);
  const slots  = { ...FORMATIONS[formation] ?? FORMATIONS['4-3-3'] };
  const chosen = [];
  const used   = new Set();

  // If a saved lineup is provided, use those players exactly as set —
  // including any injured players. The pre-match modal blocks play if
  // an injured player is in the lineup; selectEleven must not auto-replace them.
  if (lineup && lineup.length === 11) {
    const allById = new Map(players.map(p => [p.id, p]));
    for (const pid of lineup) {
      const pl = allById.get(pid);
      if (pl && !used.has(pl.id)) { chosen.push(pl); used.add(pl.id); }
    }
    // Only return the saved lineup intact — don't auto-fill missing slots
    if (chosen.length === 11) return chosen;
    // Fewer than 11 found (players removed from squad entirely) — fall through to auto-fill
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

function selectBench(players, eleven) {
  const usedIds = new Set(eleven.map(p => p.id));
  return players
    .filter(p => !p.injured && !p.suspended && p.inSquad !== false && !usedIds.has(p.id))
    .sort((a,b) => primaryRating(b) - primaryRating(a));
}

// ─── Team strength — all 11 players contribute ────────────────
// Instead of only averaging positional subsets, we weight EVERY player's
// relevant stat so that a weak link in the lineup actually drags the team.
//
// Attack: forwards heavily weighted, mids partially, defenders minimally
// Midfield: mids heavily weighted, forwards/defenders partially
// Defence: defenders heavily weighted, mids partially, GK minimally
// GK: only the goalkeeper (weighted fully)
function teamStrength(eleven) {
  const ATTACK_W    = { ST:1.0, CF:1.0, RW:0.85, LW:0.85, CAM:0.70,
                        CM:0.25, CDM:0.10, RM:0.40, LM:0.40,
                        CB:0.05, RB:0.08, LB:0.08, GK:0.0 };
  const MIDFIELD_W  = { CAM:1.0, CM:1.0, CDM:0.85, RM:0.90, LM:0.90,
                        ST:0.20, CF:0.25, RW:0.35, LW:0.35,
                        CB:0.15, RB:0.25, LB:0.25, GK:0.0 };
  const DEFENCE_W   = { CB:1.0, RB:0.90, LB:0.90, CDM:0.60, CM:0.25,
                        RM:0.15, LM:0.15, CAM:0.10,
                        ST:0.05, CF:0.05, RW:0.05, LW:0.05, GK:0.0 };

  function weightedAvg(attr, weightMap) {
    let sum = 0, wt = 0;
    for (const p of eleven) {
      const w = weightMap[p.position] ?? 0.1;
      sum += (p[attr] ?? 50) * w;
      wt  += w;
    }
    return wt > 0 ? sum / wt : 50;
  }

  const gk = eleven.find(p => p.position === 'GK');

  return {
    attack:      weightedAvg('attack', ATTACK_W),
    midfield:    weightedAvg('midfield', MIDFIELD_W),
    defence:     weightedAvg('defence', DEFENCE_W),
    goalkeeping: gk ? gk.goalkeeping : 50,
    eleven,
  };
}

// ─── Age-based fitness drain multiplier ──────────────────────
// Older players tire faster during matches
function ageDrain(age) {
  if (age >= 36) return 1.35;
  if (age >= 33) return 1.20;
  if (age >= 30) return 1.10;
  return 1.00;
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
// Real-world Premier League averages: ~2.65 goals/game total (~1.4 home, ~1.25 away).
// 120 phases per game; midfield share splits phases between teams.
// A balanced match (50/50 mid) gives each team ~60 attacking phases.
// Target: ~1.30 goals/team in a perfectly equal match → 0.0217/phase.
//
// Rating influence: uses a logistic-style curve so the difference between
// an 85-rated and 65-rated attacker is MEANINGFUL (not just 85/99 vs 65/99).
// We normalise ratings on a curve centred at 75 (mid-tier club average).
//
// Defence model: separate DEF and GK stats, each on the same curve.
// GK = 30% of resistance, outfield DEF = 70%. High-rated GKs matter a lot.
function ratingFactor(rating, centre) {
  // Logistic curve: returns ~0.5 at centre, ~1.0 at 99, ~0.18 at 40.
  // Steepness 0.07 gives a meaningful spread without being too extreme.
  return 1 / (1 + Math.exp(-0.07 * (rating - centre)));
}

function goalChance(attStr, defStr, isHome) {
  // Base probability per attacking phase for a perfectly average match.
  // Calibrated so average teams (~75 rated) produce ~2.65 goals/90 total.
  const base = 0.011;

  // Attack quality — centred at 75 (average PL attacker ~75-78)
  const attFactor = ratingFactor(attStr.attack, 75);

  // Defensive resistance: outfield DEF (70%) + GK (30%)
  const defFactor = ratingFactor(defStr.defence, 75);
  const gkFactor  = ratingFactor(defStr.goalkeeping, 75);
  const defResist = defFactor * 0.70 + gkFactor * 0.30;

  // Core probability: attack quality vs defensive resistance
  // Both on same scale so ratio ≈ 1.0 for equal teams.
  // We multiply by 2 so the base×ratio restores the calibrated target rate.
  let prob = base * (attFactor / defResist) * 2.0;

  // Slight home advantage (~6%) — real PL home teams score ~12% more
  if (isHome) prob *= 1.06;

  // Clamp: floor 0.005 (not impossible), ceiling 0.16 (elite attack vs poor def)
  return Math.min(Math.max(prob, 0.005), 0.16);
}

// ─── Scorer picker — GK CANNOT score ─────────────────────────
// Weights reflect real-world goal distribution.
// Individual attack rating is raised to power 2 so elite finishers
// score disproportionately more than average ones (realistic).
function pickScorer(eleven) {
  const POS_WEIGHTS = {
    'ST': 40, 'CF': 38,
    'RW': 20, 'LW': 20, 'CAM': 15,
    'CM': 8,  'CDM': 3,
    'RM': 10, 'LM': 10,
    'CB': 2,  'RB': 2, 'LB': 2,
    'GK': 0,  // GK NEVER SCORES
  };
  const weights = eleven.map(p => {
    const base = POS_WEIGHTS[p.position] ?? 1;
    if (base === 0) return 0;
    // Quadratic rating bonus: a 90-rated attacker is ~2.3× more likely to
    // score than a 70-rated one at the same position (not just 28% more)
    const norm = (p.attack / 99);
    const attackBonus = norm * norm * 1.5 + 0.5; // range ~0.5–2.0
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

// ─── Mentality modifiers ──────────────────────────────────────
// Each mentality tweaks goal probability, phase share, possession tendency.
//
// defensive:  Low block, compact shape. Hard to break down, but limited in
//             attack. Fewer phases going forward, lower goal prob, but much
//             better defensive resistance. Suits teams looking to grind.
//
// balanced:   Default. No modifiers applied.
//
// possession: Patient, methodical. High midfield share (more phases) but the
//             team is selective — they probe for the right moment. Goal prob
//             slightly lower per phase (patient) but shots on target quality
//             is better. Teams with this style dominate possession stats.
//
// attacking:  High press, expansive, direct. Many more attacking phases and
//             higher goal prob, but defensive line is high and they are
//             susceptible to the counter — opponents get more phases too.
//
function getMentalityMods(mentality) {
  switch (mentality) {
    case 'defensive':
      return {
        goalProbMult:    0.72,   // less attacking threat
        defResistMult:   1.30,   // compact, hard to break down
        midShareBoost:  -0.07,   // fewer attacking phases
        phasesBoostOpp:  0.04,   // opponents get slightly more ball from defensive shape
        shotsMultSelf:   0.80,   // fewer shots created
        shotsMultOpp:    0.88,   // opponents get fewer clear chances too (compact)
      };
    case 'possession':
      return {
        goalProbMult:    0.88,   // patient — probing, fewer rushed efforts
        defResistMult:   1.08,   // more organised positional defence
        midShareBoost:   0.09,   // dominate possession via midfield supremacy
        phasesBoostOpp: -0.04,   // starve opposition of the ball
        shotsMultSelf:   0.90,   // fewer but higher quality shots
        shotsMultOpp:    0.82,   // opposition barely see the ball
      };
    case 'attacking':
      return {
        goalProbMult:    1.32,   // progressive, direct — high press creates chances
        defResistMult:   0.78,   // high line leaves gaps for counters
        midShareBoost:   0.06,   // push forward, more attacking phases
        phasesBoostOpp:  0.08,   // opponent gets counter opportunities
        shotsMultSelf:   1.20,   // many shots, aggressive transitions
        shotsMultOpp:    1.15,   // exposed defensively — opponents profit too
      };
    case 'balanced':
    default:
      return {
        goalProbMult:    1.00,
        defResistMult:   1.00,
        midShareBoost:   0.00,
        phasesBoostOpp:  0.00,
        shotsMultSelf:   1.00,
        shotsMultOpp:    1.00,
      };
  }
}


function shouldSub(fitness, minute, trailsBy) {
  if (minute < 55) return false;
  if (fitness < 65) return true;
  if (fitness < 75 && minute > 70) return true;
  if (trailsBy > 0 && minute > 65 && fitness < 80) return true;
  return false;
}

// ─── Core simulation ─────────────────────────────────────────
function simulateMatch(homeTeam, awayTeam, homePlayers, awayPlayers, homeFormation, awayFormation, homeLineup, awayLineup, homeMentality, awayMentality) {
  const hFm    = homeFormation ?? '4-3-3';
  const aFm    = awayFormation ?? pickAIFormation();
  const hElev  = selectEleven(homePlayers, hFm, homeLineup ?? null);
  const aElev  = selectEleven(awayPlayers, aFm, awayLineup ?? null);
  const hBench = selectBench(homePlayers, hElev);
  const aBench = selectBench(awayPlayers, aElev);

  const hStr   = teamStrength(hElev);
  const aStr   = teamStrength(aElev);

  // Mentality modifiers
  const hMods = getMentalityMods(homeMentality ?? 'balanced');
  const aMods = getMentalityMods(awayMentality ?? 'balanced');

  // Midfield controls possession/phases: stronger midfield = more attacking phases
  // Mentality midShareBoost shifts the balance further
  const rawMidShare = (hStr.midfield + aStr.midfield) > 0
    ? hStr.midfield / (hStr.midfield + aStr.midfield) : 0.5;
  const hMidShare = Math.min(0.85, Math.max(0.15, rawMidShare + hMods.midShareBoost - aMods.midShareBoost));

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

    // Fitness degrades each phase — older players tire faster
    for (const p of attActive) attFitMap.set(p.id, Math.max(0, (attFitMap.get(p.id) ?? 90) - 0.18 * ageDrain(p.age ?? 24)));
    for (const p of defActive) defFitMap.set(p.id, Math.max(0, (defFitMap.get(p.id) ?? 90) - 0.12 * ageDrain(p.age ?? 24)));

    // Average fitness of attacking outfield players
    const attOutfield = attActive.filter(p => p.position !== 'GK');
    const avgAttFit   = attOutfield.reduce((s,p) => s+(attFitMap.get(p.id)??90),0) / Math.max(1,attOutfield.length);

    // Use ATTACK stat of attacking team, DEFENCE+GK of defending team
    // Apply mentality: attacker's goalProbMult × defender's defResistMult
    const attStr = isHome ? hStr : aStr;
    const defStr = isHome ? aStr : hStr;
    const attMods = isHome ? hMods : aMods;
    const defMods = isHome ? aMods : hMods;
    const gProb  = goalChance(attStr, defStr, isHome) * fitMult(avgAttFit)
                   * attMods.goalProbMult / defMods.defResistMult;

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

    // Injury check — target ~20 injuries per team per season (~0.4 per match across ~50 games)
    // Rate: 0.40/match ÷ (10 outfield × 120 phases) = 0.000333 per outfield per phase
    if (typeof rollInjuryCheck === 'function') {
      for (const side of [
        { active: hActive, team: homeTeam, fitMap: hFitness },
        { active: aActive, team: awayTeam, fitMap: aFitness },
      ]) {
        for (const p of side.active) {
          if (p.injured || p._injuredThisMatch) continue;
          const isGK = p.position === 'GK';
          const perPhaseRate = isGK ? 0.000120 : 0.000333;
          if (Math.random() > perPhaseRate) continue;
          const inj = rollInjuryCheck(p, false, true);
          if (inj) {
            events.push({ type: 'injury', minute, teamId: side.team.id, playerId: p.id, playerName: p.name, injuryName: inj.injuryName, injuryGWsLeft: inj.injuryGWsLeft });
            p._injuredThisMatch = true;
          }
        }
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
          hFitness.set(sub.id, Math.min(100, sub.fitness ?? 90)); hSubsLeft--;
          events.push({ type:'sub', minute, teamId:homeTeam.id, outId:out.id, outName:out.name, inId:sub.id, inName:sub.name });
        }
      }
      if (aSubsLeft > 0) {
        const tired = aActive.filter(p => p.position !== 'GK' && shouldSub(aFitness.get(p.id) ?? 90, minute, trailA));
        for (const out of tired.slice(0, aSubsLeft)) {
          const sub = aBenchLeft.shift(); if (!sub) break;
          aActive = aActive.map(p => p.id === out.id ? sub : p);
          aFitness.set(sub.id, Math.min(100, sub.fitness ?? 90)); aSubsLeft--;
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
    hPhases, aPhases, hStr, aStr, hMods.shotsMultSelf, aMods.shotsMultSelf
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
    homeMentality: homeMentality ?? 'balanced',
    awayMentality: awayMentality ?? 'balanced',
  };
}

// ─── Phased simulation for Watch Match mode ──────────────────
// Simulates phases from startPhase to endPhase (1-120) using
// provided live state. Returns events + updated live state.
// Live state can be mutated between segments for real-time interventions.
function simulateMatchSegment(homeTeam, awayTeam, liveState, startPhase, endPhase) {
  const {
    hActive, aActive, hFitness, aFitness,
    hBenchLeft, aBenchLeft, hSubsLeft, aSubsLeft,
    hGoals, aGoals, hPhases, aPhases, hStr, aStr, hMidShare,
    hMods: hModsRaw, aMods: aModsRaw,
  } = liveState;

  const hMods = hModsRaw ?? getMentalityMods('balanced');
  const aMods = aModsRaw ?? getMentalityMods('balanced');

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

    for (const p of attActive) attFitMap.set(p.id, Math.max(0, (attFitMap.get(p.id) ?? 90) - 0.18 * ageDrain(p.age ?? 24)));
    for (const p of defActive) defFitMap.set(p.id, Math.max(0, (defFitMap.get(p.id) ?? 90) - 0.12 * ageDrain(p.age ?? 24)));

    const attOutfield = attActive.filter(p => p.position !== 'GK');
    const avgAttFit = attOutfield.reduce((s,p) => s+(attFitMap.get(p.id)??90),0) / Math.max(1,attOutfield.length);

    const segAttStr = isHome ? hStr : aStr;
    const segDefStr = isHome ? aStr : hStr;
    const segAttMods = isHome ? hMods : aMods;
    const segDefMods = isHome ? aMods : hMods;
    const gProb = goalChance(segAttStr, segDefStr, isHome) * fitMult(avgAttFit)
                  * segAttMods.goalProbMult / segDefMods.defResistMult;

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

    // Injury check for watch match segment — rates match simulateMatch
    if (typeof rollInjuryCheck === 'function') {
      for (const side of [
        { active: curHActive, team: homeTeam, fitMap: hFitness },
        { active: curAActive, team: awayTeam, fitMap: aFitness },
      ]) {
        for (const p of side.active) {
          if (p.injured || p._injuredThisMatch) continue;
          const isGK = p.position === 'GK';
          const perPhaseRate = isGK ? 0.000120 : 0.000333;
          if (Math.random() > perPhaseRate) continue;
          const inj = rollInjuryCheck(p, false, true);
          if (inj) {
            segEvents.push({ type: 'injury', minute, teamId: side.team.id, playerId: p.id, playerName: p.name, injuryName: inj.injuryName, injuryGWsLeft: inj.injuryGWsLeft });
            p._injuredThisMatch = true;
          }
        }
      }
    }

    if (phase % 10 === 0) {
      const trailH = curAGoals - curHGoals, trailA = curHGoals - curAGoals;
      if (curHSubs > 0) {
        const tired = curHActive.filter(p => p.position !== 'GK' && shouldSub(hFitness.get(p.id) ?? 90, minute, trailH));
        for (const out of tired.slice(0, curHSubs)) {
          const sub = curHBench.shift(); if (!sub) break;
          curHActive = curHActive.map(p => p.id === out.id ? sub : p);
          hFitness.set(sub.id, Math.min(100, sub.fitness ?? 90)); curHSubs--;
          segEvents.push({ type:'sub', minute, teamId:homeTeam.id, outId:out.id, outName:out.name, inId:sub.id, inName:sub.name });
        }
      }
      if (curASubsLeft > 0) {
        const tired = curAActive.filter(p => p.position !== 'GK' && shouldSub(aFitness.get(p.id) ?? 90, minute, trailA));
        for (const out of tired.slice(0, curASubsLeft)) {
          const sub = curABench.shift(); if (!sub) break;
          curAActive = curAActive.map(p => p.id === out.id ? sub : p);
          aFitness.set(sub.id, Math.min(100, sub.fitness ?? 90)); curASubsLeft--;
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
function buildLiveMatchState(homeTeam, awayTeam, homePlayers, awayPlayers, homeFormation, awayFormation, homeLineup, awayLineup, homeMentality, awayMentality) {
  const hFm   = homeFormation ?? '4-3-3';
  const aFm   = awayFormation ?? pickAIFormation();
  const hElev = selectEleven(homePlayers, hFm, homeLineup ?? null);
  const aElev = selectEleven(awayPlayers, aFm, awayLineup ?? null);
  const hBench = selectBench(homePlayers, hElev);
  const aBench = selectBench(awayPlayers, aElev);
  const hStr  = teamStrength(hElev);
  const aStr  = teamStrength(aElev);
  const hMods = getMentalityMods(homeMentality ?? 'balanced');
  const aMods = getMentalityMods(awayMentality ?? 'balanced');
  const rawMidShare = (hStr.midfield + aStr.midfield) > 0
    ? hStr.midfield / (hStr.midfield + aStr.midfield) : 0.5;
  const hMidShare = Math.min(0.85, Math.max(0.15, rawMidShare + hMods.midShareBoost - aMods.midShareBoost));

  return {
    hActive: [...hElev], aActive: [...aElev],
    hBenchLeft: [...hBench], aBenchLeft: [...aBench],
    hFitness: new Map(hElev.map(p => [p.id, Math.min(100, p.fitness ?? 90)])),
    aFitness: new Map(aElev.map(p => [p.id, Math.min(100, p.fitness ?? 90)])),
    hSubsLeft: 3, aSubsLeft: 3,
    hGoals: 0, aGoals: 0,
    hPhases: 0, aPhases: 0,
    hStr, aStr, hMidShare, hMods, aMods,
    hElev, aElev, hBench, aBench,
    homeFormation: hFm, awayFormation: aFm,
    homeMentality: homeMentality ?? 'balanced',
    awayMentality: awayMentality ?? 'balanced',
  };
}

// ─── Finalise a live match into the standard result shape ──────
function finaliseLiveMatch(homeTeam, awayTeam, liveState, allEvents) {
  const { hGoals, aGoals, hPhases, aPhases, hStr, aStr, hElev, aElev, hBench, aBenchLeft, hFitness, aFitness, homeFormation, awayFormation } = liveState;
  const fitnessUpdates = [];
  for (const p of hElev) fitnessUpdates.push({ id:p.id, teamId:homeTeam.id, newFitness:Math.max(30, hFitness.get(p.id) ?? 65) });
  for (const p of aElev) fitnessUpdates.push({ id:p.id, teamId:awayTeam.id, newFitness:Math.max(30, aFitness.get(p.id) ?? 65) });

  const hScorers = allEvents.filter(e => e.type === 'goal' && e.teamId === homeTeam.id);
  const aScorers = allEvents.filter(e => e.type === 'goal' && e.teamId === awayTeam.id);
  const hMods = liveState.hMods ?? getMentalityMods('balanced');
  const aMods = liveState.aMods ?? getMentalityMods('balanced');
  const stats = computeMatchStats(
    { homeGoals:hGoals, awayGoals:aGoals, homeTeamId:homeTeam.id, awayTeamId:awayTeam.id, events:allEvents },
    hPhases, aPhases, hStr, aStr, hMods.shotsMultSelf, aMods.shotsMultSelf
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
function computeMatchStats(result, hPhases, aPhases, hStr, aStr, hShotsMult, aShotsMult) {
  const total = (hPhases||60) + (aPhases||60);
  const homePoss = Math.round(((hPhases||60) / total) * 100);

  // Shots based on phases + attack quality + mentality
  const hAttack = hStr?.attack ?? 65;
  const aAttack = aStr?.attack ?? 65;
  const hSM = hShotsMult ?? 1.0;
  const aSM = aShotsMult ?? 1.0;
  const hShotsTotal  = Math.max(result.homeGoals, Math.round((hPhases||60) / 12 * (hAttack/75) * hSM + Math.random() * 2));
  const aShotsTotal  = Math.max(result.awayGoals, Math.round((aPhases||60) / 12 * (aAttack/75) * aSM + Math.random() * 2));
  const hOnTarget    = Math.max(result.homeGoals, Math.min(hShotsTotal, Math.round(hShotsTotal * (0.33 + Math.random() * 0.15))));
  const aOnTarget    = Math.max(result.awayGoals, Math.min(aShotsTotal, Math.round(aShotsTotal * (0.33 + Math.random() * 0.15))));

  // xG: shots on target × conversion rate based on attack/gk quality
  // Real-world on-target conversion ~0.32 (1 in 3 on-target shots scores)
  // xG per shot on target in real football: ~0.25-0.35 range
  const hGK = aStr?.goalkeeping ?? 75;
  const aGK = hStr?.goalkeeping ?? 75;
  const hXG = parseFloat((hOnTarget * (0.28 + (hAttack/99)*0.10 - (hGK/99)*0.08)).toFixed(2));
  const aXG = parseFloat((aOnTarget * (0.28 + (aAttack/99)*0.10 - (aGK/99)*0.08)).toFixed(2));

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

