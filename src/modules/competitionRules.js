/**
 * modules/competitionRules.js — authoritative tournament-format data.
 *
 * P0 deliberately keeps presentation metadata (names/icons/colours) in
 * cups.js, but football structure lives here: entry rounds, replay policy,
 * two-legged ties, league-phase size/match count and UEFA advancement.
 */

export const COMPETITION_RULES_VERSION = 1;
export const UEFA_COMPETITION_IDS = new Set(['ucl', 'uel', 'uecl']);

const europeanKnockout = {
  twoLegPairs: [
    ['Knockout Play-off (Leg 1)', 'Knockout Play-off (Leg 2)'],
    ['R16 (Leg 1)', 'R16 (Leg 2)'],
    ['QF (Leg 1)', 'QF (Leg 2)'],
    ['SF (Leg 1)', 'SF (Leg 2)'],
  ],
  replay: false,
  singleMatchDrawResolution: 'extra_time_penalties',
};

export const COMPETITION_RULES = Object.freeze({
  fa_cup: {
    format: 'knockout',
    rounds: ['R1', 'R2', 'R3', 'R4', 'R5', 'QF', 'SF', 'Final'],
    roundGWs: [7, 13, 20, 24, 27, 30, 33, 37],
    entryRound: { 'League Two': 0, 'League One': 0, Championship: 2, 'Premier League': 2 },
    replay: false,
    twoLegPairs: [],
    singleMatchDrawResolution: 'extra_time_penalties',
    nation: 'England',
  },
  league_cup: {
    format: 'knockout',
    rounds: ['R1', 'R2', 'R3', 'R4', 'QF', 'SF (Leg 1)', 'SF (Leg 2)', 'Final'],
    roundGWs: [1, 3, 6, 9, 12, 17, 20, 30],
    entryRound: { 'League Two': 0, 'League One': 0, Championship: 0, 'Premier League': 1 },
    europeanEntrantRound: 2,
    replay: false,
    twoLegPairs: [['SF (Leg 1)', 'SF (Leg 2)']],
    singleMatchDrawResolution: 'penalties',
    nation: 'England',
  },
  copa_del_rey: {
    format: 'knockout',
    rounds: ['R32', 'R16', 'QF', 'SF (Leg 1)', 'SF (Leg 2)', 'Final'],
    roundGWs: [8, 14, 22, 28, 32, 37],
    replay: false,
    twoLegPairs: [['SF (Leg 1)', 'SF (Leg 2)']],
    singleMatchDrawResolution: 'extra_time_penalties',
    nation: 'Spain',
  },
  supercopa: {
    format: 'knockout',
    rounds: ['SF', 'Final'],
    roundGWs: [4, 5],
    replay: false,
    twoLegPairs: [],
    singleMatchDrawResolution: 'extra_time_penalties',
    nation: 'Spain',
  },
  dfb_pokal: {
    format: 'knockout',
    rounds: ['R1', 'R2', 'R3', 'QF', 'SF', 'Final'],
    roundGWs: [3, 8, 16, 24, 30, 37],
    replay: false,
    twoLegPairs: [],
    singleMatchDrawResolution: 'extra_time_penalties',
    nation: 'Germany',
  },
  dfb_supercup: {
    format: 'knockout',
    rounds: ['Final'],
    roundGWs: [2],
    replay: false,
    twoLegPairs: [],
    singleMatchDrawResolution: 'extra_time_penalties',
    nation: 'Germany',
  },
  coppa_italia: {
    format: 'knockout',
    rounds: ['R32', 'R16', 'QF', 'SF (Leg 1)', 'SF (Leg 2)', 'Final'],
    roundGWs: [5, 12, 22, 27, 31, 37],
    replay: false,
    twoLegPairs: [['SF (Leg 1)', 'SF (Leg 2)']],
    singleMatchDrawResolution: 'extra_time_penalties',
    nation: 'Italy',
  },
  supercoppa: {
    format: 'knockout',
    rounds: ['SF', 'Final'],
    roundGWs: [3, 4],
    replay: false,
    twoLegPairs: [],
    singleMatchDrawResolution: 'extra_time_penalties',
    nation: 'Italy',
  },
  coupe_de_france: {
    format: 'knockout',
    rounds: ['R6', 'R5', 'R4', 'R3', 'QF', 'SF', 'Final'],
    roundGWs: [5, 10, 16, 22, 27, 33, 37],
    replay: false,
    twoLegPairs: [],
    singleMatchDrawResolution: 'penalties',
    nation: 'France',
  },
  trophee_des_champions: {
    format: 'knockout',
    rounds: ['Final'],
    roundGWs: [2],
    replay: false,
    twoLegPairs: [],
    singleMatchDrawResolution: 'penalties',
    nation: 'France',
  },
  knvb_beker: {
    format: 'knockout',
    rounds: ['R2', 'R3', 'QF', 'SF', 'Final'],
    roundGWs: [6, 14, 22, 30, 37],
    replay: false,
    twoLegPairs: [],
    singleMatchDrawResolution: 'extra_time_penalties',
    nation: 'Netherlands',
  },
  ucl: {
    format: 'uefa_league_phase',
    leaguePhase: {
      teams: 36,
      matches: 8,
      homeMatches: 4,
      awayMatches: 4,
      gws: [5, 7, 9, 11, 13, 15, 17, 19],
      direct: [1, 8],
      playoff: [9, 24],
      directRoundIndex: 2,
      playoffRoundIndex: 0,
    },
    rounds: ['Knockout Play-off (Leg 1)', 'Knockout Play-off (Leg 2)', 'R16 (Leg 1)', 'R16 (Leg 2)', 'QF (Leg 1)', 'QF (Leg 2)', 'SF (Leg 1)', 'SF (Leg 2)', 'Final'],
    roundGWs: [23, 24, 26, 27, 30, 31, 34, 35, 40],
    ...europeanKnockout,
  },
  uel: {
    format: 'uefa_league_phase',
    leaguePhase: {
      teams: 36,
      matches: 8,
      homeMatches: 4,
      awayMatches: 4,
      gws: [5, 7, 9, 11, 13, 15, 17, 19],
      direct: [1, 8],
      playoff: [9, 24],
      directRoundIndex: 2,
      playoffRoundIndex: 0,
    },
    rounds: ['Knockout Play-off (Leg 1)', 'Knockout Play-off (Leg 2)', 'R16 (Leg 1)', 'R16 (Leg 2)', 'QF (Leg 1)', 'QF (Leg 2)', 'SF (Leg 1)', 'SF (Leg 2)', 'Final'],
    roundGWs: [23, 24, 27, 28, 31, 32, 35, 36, 39],
    ...europeanKnockout,
  },
  uecl: {
    format: 'uefa_league_phase',
    leaguePhase: {
      teams: 36,
      matches: 6,
      homeMatches: 3,
      awayMatches: 3,
      gws: [5, 7, 9, 11, 13, 15],
      direct: [1, 8],
      playoff: [9, 24],
      directRoundIndex: 2,
      playoffRoundIndex: 0,
    },
    rounds: ['Knockout Play-off (Leg 1)', 'Knockout Play-off (Leg 2)', 'R16 (Leg 1)', 'R16 (Leg 2)', 'QF (Leg 1)', 'QF (Leg 2)', 'SF (Leg 1)', 'SF (Leg 2)', 'Final'],
    roundGWs: [23, 24, 27, 28, 31, 32, 35, 36, 40],
    ...europeanKnockout,
  },
});

export function getCompetitionRules(cupId) {
  return COMPETITION_RULES[cupId] ?? null;
}

export function isUefaCompetition(cupId) {
  return UEFA_COMPETITION_IDS.has(cupId);
}

export function isTwoLegRound(cupId, roundName, legNum) {
  const pairs = getCompetitionRules(cupId)?.twoLegPairs ?? [];
  return pairs.some(([leg1, leg2]) => (legNum === 1 ? leg1 : leg2) === roundName);
}

export function resolveTwoLegTie(leg1, leg2, rng = Math.random) {
  const userAgg = Number(leg1?.userGoals ?? 0) + Number(leg2?.userGoals ?? 0);
  const oppAgg = Number(leg1?.oppGoals ?? 0) + Number(leg2?.oppGoals ?? 0);
  if (userAgg > oppAgg) return { userWon: true, penalties: false, extraTime: false, userAgg, oppAgg };
  if (oppAgg > userAgg) return { userWon: false, penalties: false, extraTime: false, userAgg, oppAgg };

  // UEFA removed away goals from 2021/22. Domestic two-legged ties configured
  // here also resolve a level aggregate through extra time / penalties, never
  // by venue-scored goals.
  return {
    userWon: rng() < 0.5,
    penalties: true,
    extraTime: true,
    userAgg,
    oppAgg,
  };
}

export function getLeaguePhaseQualification(cupId, position) {
  const phase = getCompetitionRules(cupId)?.leaguePhase;
  if (!phase || !Number.isInteger(position) || position < 1 || position > phase.teams) {
    return { route: 'eliminated', status: 'eliminated', roundIndex: 0, seed: null };
  }
  if (position >= phase.direct[0] && position <= phase.direct[1]) {
    return { route: 'direct', status: 'active', roundIndex: phase.directRoundIndex, seed: position };
  }
  if (position >= phase.playoff[0] && position <= phase.playoff[1]) {
    return { route: 'playoff', status: 'active', roundIndex: phase.playoffRoundIndex, seed: position };
  }
  return { route: 'eliminated', status: 'eliminated', roundIndex: 0, seed: position };
}

/**
 * League-phase ranking controls return-leg venue advantage throughout the
 * bracket. Positions 9–16 are seeded in the knockout play-off; positions 1–8
 * are seeded in the round of 16. Under the 2026/27 UEFA regulations, league-
 * phase ranks 1–4 also hold a quarter-final return-leg seed and ranks 1–2 a
 * semi-final return-leg seed. A lower-ranked club can inherit one of those
 * later-round bracket seeds by eliminating its holder; that inherited state
 * must be supplied by the future bracket-state layer rather than guessed from
 * the lower club's original league-phase position here.
 */
export function getUefaKnockoutSeeding(cupId, position, roundName) {
  if (!isUefaCompetition(cupId) || !Number.isInteger(position)) {
    return { seeded:null, secondLegHome:null };
  }
  if (roundName?.startsWith('Knockout Play-off')) {
    if (position >= 9 && position <= 16) return { seeded:true, secondLegHome:true };
    if (position >= 17 && position <= 24) return { seeded:false, secondLegHome:false };
    return { seeded:null, secondLegHome:null };
  }
  if (roundName?.startsWith('R16')) {
    if (position >= 1 && position <= 8) return { seeded:true, secondLegHome:true };
    if (position >= 9 && position <= 24) return { seeded:false, secondLegHome:false };
    return { seeded:null, secondLegHome:null };
  }
  if (roundName?.startsWith('QF')) {
    if (position >= 1 && position <= 4) return { seeded:true, secondLegHome:true };
    if (position >= 5 && position <= 8) return { seeded:false, secondLegHome:false };
    return { seeded:null, secondLegHome:null };
  }
  if (roundName?.startsWith('SF')) {
    if (position >= 1 && position <= 2) return { seeded:true, secondLegHome:true };
    if (position >= 3 && position <= 8) return { seeded:false, secondLegHome:false };
    return { seeded:null, secondLegHome:null };
  }
  return { seeded:null, secondLegHome:null };
}

/**
 * Return the league-phase/bracket seeds that can occupy the opposite side of
 * the user's current UEFA draw path. After a seeded team is eliminated, the
 * winner inherits that bracket seed, so QF/SF paths can be expressed entirely
 * in terms of the persisted bracketSeed without needing P1's full world draw.
 */
export function getUefaKnockoutOpponentSeeds(cupId, position, roundName) {
  if (!isUefaCompetition(cupId) || !Number.isInteger(position)) return [];

  if (roundName?.startsWith('Knockout Play-off')) {
    if (position === 9 || position === 10) return [23, 24];
    if (position === 11 || position === 12) return [21, 22];
    if (position === 13 || position === 14) return [19, 20];
    if (position === 15 || position === 16) return [17, 18];
    if (position === 17 || position === 18) return [15, 16];
    if (position === 19 || position === 20) return [13, 14];
    if (position === 21 || position === 22) return [11, 12];
    if (position === 23 || position === 24) return [9, 10];
    return [];
  }

  if (roundName?.startsWith('R16')) {
    if (position === 1 || position === 2) return [15, 16, 17, 18];
    if (position === 3 || position === 4) return [13, 14, 19, 20];
    if (position === 5 || position === 6) return [11, 12, 21, 22];
    if (position === 7 || position === 8) return [9, 10, 23, 24];
    if ([9, 10, 23, 24].includes(position)) return [7, 8];
    if ([11, 12, 21, 22].includes(position)) return [5, 6];
    if ([13, 14, 19, 20].includes(position)) return [3, 4];
    if ([15, 16, 17, 18].includes(position)) return [1, 2];
    return [];
  }

  if (roundName?.startsWith('QF')) {
    if (position === 1 || position === 2) return [7, 8];
    if (position === 7 || position === 8) return [1, 2];
    if (position === 3 || position === 4) return [5, 6];
    if (position === 5 || position === 6) return [3, 4];
    return [];
  }

  if (roundName?.startsWith('SF')) {
    if (position === 1 || position === 2) return [3, 4];
    if (position === 3 || position === 4) return [1, 2];
  }

  return [];
}

function hasVenueRunLongerThanTwo(venues) {
  let run = 1;
  for (let i = 1; i < venues.length; i++) {
    run = venues[i] === venues[i - 1] ? run + 1 : 1;
    if (run > 2) return true;
  }
  return false;
}

export function buildLeaguePhaseVenuePlan(cupId, rng = Math.random) {
  const phase = getCompetitionRules(cupId)?.leaguePhase;
  if (!phase) return [];

  const validPlans = [];
  const combinations = 2 ** phase.matches;
  for (let mask = 0; mask < combinations; mask++) {
    const venues = Array.from({ length:phase.matches }, (_, index) => Boolean(mask & (1 << index)));
    if (venues.filter(Boolean).length !== phase.homeMatches) continue;
    if (venues[0] === venues[1]) continue;
    if (venues[venues.length - 2] === venues[venues.length - 1]) continue;
    if (hasVenueRunLongerThanTwo(venues)) continue;
    validPlans.push(venues);
  }

  if (!validPlans.length) return [];
  const raw = Number(rng());
  const bounded = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999999, raw)) : 0;
  return [...validPlans[Math.floor(bounded * validPlans.length)]];
}

export function buildLeaguePhaseState(cupId, opponents = [], rng = Math.random) {
  const phase = getCompetitionRules(cupId)?.leaguePhase;
  if (!phase) return null;
  return {
    matchday: 0,
    points: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    opponents: opponents.slice(0, phase.matches),
    venues: buildLeaguePhaseVenuePlan(cupId, rng),
    position: null,
    qualificationRoute: null,
    table: null,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Complete a compact 36-club UEFA table when the user's league phase ends.
 * Pitch does not yet have P1's full world ledger, so the other 35 rows are
 * simulated once here from a bounded distribution. P1 can replace these
 * rows with canonical world-match records without changing the P0 contract.
 */
export function finaliseLeaguePhaseTable(cupId, leaguePhase, userTeamId, rng = Math.random) {
  const rules = getCompetitionRules(cupId)?.leaguePhase;
  if (!rules) return null;

  const matches = rules.matches;
  const table = [];
  for (let i = 0; i < rules.teams - 1; i++) {
    const strengthBand = 0.22 + ((i * 17) % 61) / 100;
    const variance = (rng() - 0.5) * 0.24;
    const winRate = clamp(strengthBand + variance, 0.08, 0.82);
    const drawRate = clamp(0.31 - Math.abs(winRate - 0.45) * 0.2, 0.16, 0.33);
    let wins = Math.round(matches * winRate);
    let draws = Math.round(matches * drawRate);
    if (wins + draws > matches) draws = matches - wins;
    const losses = Math.max(0, matches - wins - draws);
    const gf = Math.max(1, wins * 2 + draws + Math.floor(rng() * 5));
    const ga = Math.max(0, losses * 2 + draws + Math.floor(rng() * 5));
    table.push({
      teamId: `${cupId}_field_${i + 1}`,
      played: matches,
      wins,
      draws,
      losses,
      points: wins * 3 + draws,
      gf,
      ga,
      gd: gf - ga,
    });
  }

  table.push({
    teamId: userTeamId,
    played: matches,
    points: Number(leaguePhase?.points ?? 0),
    gf: Number(leaguePhase?.gf ?? 0),
    ga: Number(leaguePhase?.ga ?? 0),
    gd: Number(leaguePhase?.gd ?? 0),
  });

  table.sort((a, b) =>
    b.points - a.points ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    String(a.teamId).localeCompare(String(b.teamId))
  );

  return table.map((row, index) => ({ ...row, position: index + 1 }));
}

export function finishLeaguePhase(cupId, leaguePhase, userTeamId, rng = Math.random) {
  const table = finaliseLeaguePhaseTable(cupId, leaguePhase, userTeamId, rng);
  if (!table) return null;
  const userRow = table.find(row => row.teamId === userTeamId);
  const qualification = getLeaguePhaseQualification(cupId, userRow?.position ?? 36);
  return {
    table,
    position: userRow?.position ?? 36,
    ...qualification,
  };
}
