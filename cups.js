/** modules/cups.js — Cup competitions: CUP_META, UCL_CLUBS, simulateCupRound, simulateUCLMatchday */
import { getAllFixtures, putFixture } from './db.js';
import { simulateMatch }              from './matchEngine.js';

// ─── Real UCL 2025/26 participants ────────────────────────────
export const UCL_CLUBS = [
  // PL
  { id:'man_city',    name:'Man City',    nation:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', strength:90 },
  { id:'arsenal',     name:'Arsenal',     nation:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', strength:85 },
  { id:'liverpool',   name:'Liverpool',   nation:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', strength:88 },
  { id:'chelsea',     name:'Chelsea',     nation:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', strength:80 },
  // La Liga
  { id:'real_madrid', name:'Real Madrid', nation:'🇪🇸', strength:95 },
  { id:'barcelona',   name:'Barcelona',   nation:'🇪🇸', strength:92 },
  { id:'atletico',    name:'Atlético',    nation:'🇪🇸', strength:82 },
  { id:'real_sociedad',name:'R. Sociedad',nation:'🇪🇸', strength:72 },
  // Bundesliga
  { id:'bayer_leverkusen',name:'Leverkusen',nation:'🇩🇪', strength:82 },
  { id:'bayern',      name:'Bayern',      nation:'🇩🇪', strength:91 },
  { id:'bvb',         name:'Dortmund',    nation:'🇩🇪', strength:78 },
  { id:'rb_leipzig',  name:'RB Leipzig',  nation:'🇩🇪', strength:76 },
  // Serie A
  { id:'inter',       name:'Inter Milan', nation:'🇮🇹', strength:84 },
  { id:'ac_milan',    name:'AC Milan',    nation:'🇮🇹', strength:78 },
  { id:'juventus',    name:'Juventus',    nation:'🇮🇹', strength:78 },
  { id:'napoli',      name:'Napoli',      nation:'🇮🇹', strength:76 },
  // Ligue 1
  { id:'psg',         name:'PSG',         nation:'🇫🇷', strength:88 },
  { id:'monaco',      name:'Monaco',      nation:'🇫🇷', strength:72 },
  // Others
  { id:'benfica',     name:'Benfica',     nation:'🇵🇹', strength:70 },
  { id:'porto',       name:'Porto',       nation:'🇵🇹', strength:68 },
  { id:'ajax',        name:'Ajax',        nation:'🇳🇱', strength:66 },
  { id:'celtic',      name:'Celtic',      nation:'🏴󠁧󠁢󠁳󠁣󠁴', strength:60 },
  { id:'psveindhoven',name:'PSV',         nation:'🇳🇱', strength:70 },
  { id:'sporting_cp', name:'Sporting CP', nation:'🇵🇹', strength:67 },
];

// ─── Cup metadata with fixed per-round GW schedules ──────────
export const CUP_META = {
  fa_cup: {
    id:'fa_cup', name:'FA Cup', shortName:'FA Cup', icon:'🏆', color:'#f5c842',
    description:"The world's oldest cup competition",
    rounds:    ['R3','R4','R5','QF','SF','Final'],
    roundGWs:  [22,  25,  28,  31,  34,  37],   // Fixed GW for each round
  },
  league_cup: {
    id:'league_cup', name:'Carabao Cup', shortName:'League Cup', icon:'🥛', color:'#c084fc',
    description:'EFL League Cup',
    rounds:    ['R2','R3','QF','SF (1st leg)','SF (2nd leg)','Final'],
    roundGWs:  [3,   7,   12,  17,            20,            24],
  },
  ucl: {
    id:'ucl', name:'Champions League', shortName:'UCL', icon:'⭐', color:'#3b82f6',
    description:"Europe's premier club competition — League Phase + Knockouts",
    rounds:    ['R16','QF','SF','Final'],
    roundGWs:  [22,  27,  31,  35],            // Knockout rounds only
    isGroupStage:  true,
    groupStageGWs: [5,7,9,11,13,15,17,19],    // 8 matchdays
    knockoutStartRoundIndex: 0,                 // roundIndex 0 = R16 after phase ends
  },
  uel: {
    id:'uel', name:'Europa League', shortName:'UEL', icon:'🟠', color:'#f97316',
    description:'UEFA Europa League',
    rounds:    ['League Phase','R32','R16','QF','SF','Final'],
    roundGWs:  [6,            21,   25,   29,  33,  36],
  },
  uecl: {
    id:'uecl', name:'Conference League', shortName:'UECL', icon:'🟢', color:'#22c55e',
    description:'UEFA Europa Conference League',
    rounds:    ['League Phase','R16','QF','SF','Final'],
    roundGWs:  [6,            22,   27,  31,  35],
  },
};

// ─── Assign cups based on league position and reputation ──────
export function assignCups(userTeam) {
  const cups = ['fa_cup', 'league_cup'];
  const rep  = userTeam.reputation ?? 70;
  if      (rep >= 85) cups.push('ucl');
  else if (rep >= 76) cups.push('uel');
  else                cups.push('uecl');
  return cups;
}

// ─── Build initial cup state ──────────────────────────────────
export function buildInitialCupState(cupIds, userTeamId) {
  const state = {};
  cupIds.forEach(id => {
    const isUCL = id === 'ucl';
    state[id] = {
      id,
      roundIndex: 0,
      status: 'active',
      results: [],
      ...(isUCL ? {
        leaguePhase: {
          matchday: 0,
          points: 0,
          gd: 0,
          opponents: buildUCLOpponents(userTeamId),
        },
        leaguePhaseComplete: false,
      } : {}),
    };
  });
  return state;
}

function buildUCLOpponents(excludeTeamId) {
  const pool = excludeTeamId
    ? UCL_CLUBS.filter(c => c.id !== excludeTeamId)
    : UCL_CLUBS;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 8);
}

// ─── Simulate a cup round for the user ───────────────────────
export function simulateCupRound(userTeam, userPlayers, allTeams, playersByTeam, cupId, roundName, event) {
  let opponent, oppPlayers;

  if (cupId === 'ucl' || cupId === 'uel' || cupId === 'uecl') {
    // European opponent: use pre-drawn from event, or fall back to random
    if (event?.opponentId) {
      const preDrawn = UCL_CLUBS.find(c => c.id === event.opponentId) ?? { id: event.opponentId, name: event.opponentName, nation: event.opponentCrest, strength: event.opponentRep ?? 72 };
      opponent   = { id: preDrawn.id, name: preDrawn.name, crest: preDrawn.nation ?? preDrawn.crest ?? '⚽' };
      oppPlayers = buildSyntheticSquad(preDrawn.id, preDrawn.strength ?? event.opponentRep ?? 72);
    } else {
      const pool = UCL_CLUBS.filter(c => c.id !== userTeam.id);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      opponent   = { id: pick.id, name: pick.name, crest: pick.nation };
      oppPlayers = buildSyntheticSquad(pick.id, pick.strength);
    }
  } else {
    // Domestic cup: use pre-drawn opponent from event, or fall back to same-league random
    if (event?.opponentId) {
      const preDrawn = allTeams.find(t => t.id === event.opponentId);
      opponent   = preDrawn ?? { id: event.opponentId, name: event.opponentName, crest: event.opponentCrest ?? '⚽', reputation: event.opponentRep ?? 70 };
      oppPlayers = playersByTeam.get(opponent.id) ?? buildSyntheticSquad(opponent.id, opponent.reputation ?? 65);
    } else {
      const userLeague = userTeam.league ?? 'Premier League';
      const others = allTeams.filter(t => t.id !== userTeam.id && (t.league ?? 'Premier League') === userLeague);
      const pool   = others.length > 0 ? others : allTeams.filter(t => t.id !== userTeam.id);
      const pick   = pool[Math.floor(Math.random() * pool.length)];
      opponent     = pick;
      oppPlayers   = playersByTeam.get(pick.id) ?? buildSyntheticSquad(pick.id, 65);
    }
  }

  const userIsHome = event?.userIsHome ?? (Math.random() < 0.5);
  const home       = userIsHome ? userTeam    : opponent;
  const away       = userIsHome ? opponent    : userTeam;
  const hPl        = userIsHome ? userPlayers : oppPlayers;
  const aPl        = userIsHome ? oppPlayers  : userPlayers;

  const result   = simulateMatch(home, away, hPl, aPl);
  let userGoals  = userIsHome ? result.homeGoals : result.awayGoals;
  let oppGoals   = userIsHome ? result.awayGoals : result.homeGoals;

  // Extra time / pens if draw in knockouts
  if (userGoals === oppGoals) {
    if (Math.random() < 0.5) userGoals++; else oppGoals++;
  }

  return {
    cupId, roundName,
    userWon:      userGoals > oppGoals,
    userGoals, oppGoals,
    opponentId:   opponent.id,
    opponentName: opponent.name,
    userIsHome,
    scorers:      userIsHome ? result.homeScorers : result.awayScorers,
  };
}

// ─── Simulate UCL league phase matchday ──────────────────────
export function simulateUCLMatchday(userTeam, userPlayers, cupState) {
  const lp  = cupState.leaguePhase;
  const md  = lp?.matchday ?? 0;
  if (md >= 8) return null;

  // Guard: never face yourself (fallback if opponents list was built without exclusion)
  const rawOpp = lp.opponents?.[md] ?? UCL_CLUBS[md % UCL_CLUBS.length];
  const opp    = rawOpp.id === userTeam.id
    ? (UCL_CLUBS.find(c => c.id !== userTeam.id) ?? rawOpp)
    : rawOpp;

  const oppPlayers = buildSyntheticSquad(opp.id, opp.strength ?? 72);
  const userIsHome = Math.random() < 0.5;
  const home       = userIsHome ? userTeam    : { id:opp.id, name:opp.name, crest:opp.nation??'⚽' };
  const away       = userIsHome ? { id:opp.id, name:opp.name, crest:opp.nation??'⚽' } : userTeam;
  const hPl        = userIsHome ? userPlayers : oppPlayers;
  const aPl        = userIsHome ? oppPlayers  : userPlayers;

  const r       = simulateMatch(home, away, hPl, aPl);
  const userG   = userIsHome ? r.homeGoals : r.awayGoals;
  const oppG    = userIsHome ? r.awayGoals : r.homeGoals;
  const pts     = userG > oppG ? 3 : userG === oppG ? 1 : 0;

  return {
    matchday: md + 1,
    opponentName: opp.name,
    opponentNation: opp.nation ?? '🌍',
    userGoals: userG, oppGoals: oppG,
    userIsHome,
    points: pts, gd: userG - oppG,
    result: userG > oppG ? 'W' : userG === oppG ? 'D' : 'L',
    homeScorers: r.homeScorers,
    awayScorers: r.awayScorers,
    scorers: userIsHome ? r.homeScorers : r.awayScorers,
  };
}

// ─── Synthetic squad for non-PL clubs ─────────────────────────
function buildSyntheticSquad(teamId, avgStr) {
  const positions = ['GK','CB','CB','RB','LB','CM','CM','CDM','RW','LW','ST','CM','ST','GK','CB'];
  return positions.map((pos, i) => ({
    id: `${teamId}_s${i}`, name: `Player ${i+1}`, position: pos, age: 26,
    attack:      pos==='ST'||pos==='RW'||pos==='LW' ? Math.min(99, avgStr+5) : Math.max(10, avgStr-3),
    midfield:    pos==='CM'||pos==='CDM' ? Math.min(99, avgStr+3) : Math.max(10, avgStr-4),
    defence:     pos==='CB'||pos==='RB'||pos==='LB' ? Math.min(99, avgStr+4) : Math.max(10, avgStr-5),
    goalkeeping: pos==='GK' ? Math.min(99, avgStr+8) : 10,
    value: 10_000_000, wage: 50_000, fitness: 90,
    injured: false, suspended: false, inSquad: true,
    goals: 0, assists: 0, cleanSheets: 0,
  }));
}

export async function getCupFixtures(cupId) {
  const all = await getAllFixtures();
  return all.filter(f => f.competition === cupId);
}
