/** modules/cups.js — Cup competitions: CUP_META, UCL_CLUBS, simulateCupRound, simulateUCLMatchday */
// ─── Real UCL 2025/26 participants ────────────────────────────
const UCL_CLUBS = [
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
  { id:'leverkusen',  name:'Leverkusen',  nation:'🇩🇪', strength:82 },
  { id:'bayern',      name:'Bayern',      nation:'🇩🇪', strength:91 },
  { id:'dortmund',    name:'Dortmund',    nation:'🇩🇪', strength:78 },
  { id:'leipzig',     name:'RB Leipzig',  nation:'🇩🇪', strength:76 },
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
// GW mapping: GW1=mid-Aug, GW38=late May. Post-season GWs (39-41)
// represent late May/early June for European finals AFTER the league ends.
// Real 2025/26: PL ends May 24, FA Cup Final May 17, League Cup Final Mar 16,
// UEL Final May 21, UECL Final May 28, UCL Final May 31.
//
// FA Cup entry rounds by league tier (real-life rules):
//   League Two / League One → enter at R1 (roundIndex 0)
//   Championship             → enter at R2 (roundIndex 1)
//   Premier League           → enter at R3 (roundIndex 2)
//
// Per-round FA Cup prize money (2024/25 actual FA figures):
//   R1: £4,500  R2: £9,000  R3: £82,350  R4: £90,000  R5: £180,000
//   QF: £360,000  SF: £450,000  Final: winners £2,000,000 / runners-up £1,000,000
//
// The `roundPrize` array maps to each round index (winner's prize for that round).
// `entryRound` maps league→roundIndex so buildInitialCupState sets the right start.
const CUP_META = {
  // ── English ──────────────────────────────────────────────
  fa_cup: {
    id:'fa_cup', name:'FA Cup', shortName:'FA Cup', icon:'🏆', color:'#f5c842',
    description:"The world's oldest cup competition",
    rounds:    ['R1','R2','R3','R4','R5','QF','SF','Final'],
    roundGWs:  [7,   13,  20,  24,  27,  30,  33,  37],
    // Prize money per round (paid on winning that round, real 2024/25 FA figures)
    roundPrize:[4_500, 9_000, 82_350, 90_000, 180_000, 360_000, 450_000, 2_000_000],
    runnerUpPrize: 1_000_000,
    // Which roundIndex each league tier enters at
    entryRound: { 'League Two':0, 'League One':0, 'Championship':1, 'Premier League':2 },
    nation: 'England',
  },
  league_cup: {
    id:'league_cup', name:'Carabao Cup', shortName:'League Cup', icon:'🥛', color:'#c084fc',
    description:'EFL League Cup',
    rounds:    ['R2','R3','QF','SF (1st leg)','SF (2nd leg)','Final'],
    roundGWs:  [3,   6,   12,  17,            20,            30],
  },
  // ── Spanish ──────────────────────────────────────────────
  copa_del_rey: {
    id:'copa_del_rey', name:'Copa del Rey', shortName:'Copa del Rey', icon:'👑', color:'#c8102e',
    description:"Spain's prestigious knockout cup",
    rounds:    ['R32','R16','QF','SF (1st leg)','SF (2nd leg)','Final'],
    roundGWs:  [8,    14,   22,  28,            32,            37],
  },
  supercopa: {
    id:'supercopa', name:'Supercopa de España', shortName:'Supercopa', icon:'🔴', color:'#f5c842',
    description:'Spanish Super Cup — top four clubs',
    rounds:    ['SF','Final'],
    roundGWs:  [4,   5],
  },
  // ── German ───────────────────────────────────────────────
  dfb_pokal: {
    id:'dfb_pokal', name:'DFB-Pokal', shortName:'DFB-Pokal', icon:'🏆', color:'#000000',
    description:"Germany's premier knockout cup",
    rounds:    ['R1','R2','R3','QF','SF','Final'],
    roundGWs:  [3,   8,   16,  24,  30,  37],
  },
  dfb_supercup: {
    id:'dfb_supercup', name:'DFL-Supercup', shortName:'Supercup', icon:'⚡', color:'#d4a017',
    description:'German Super Cup — league champion vs cup winner',
    rounds:    ['Final'],
    roundGWs:  [2],
  },
  // ── Italian ──────────────────────────────────────────────
  coppa_italia: {
    id:'coppa_italia', name:'Coppa Italia', shortName:'Coppa Italia', icon:'🏆', color:'#009246',
    description:"Italy's national cup competition",
    rounds:    ['R32','R16','QF','SF (1st leg)','SF (2nd leg)','Final'],
    roundGWs:  [5,    12,   22,  27,            31,            37],
  },
  supercoppa: {
    id:'supercoppa', name:'Supercoppa Italiana', shortName:'Supercoppa', icon:'🔵', color:'#009246',
    description:'Italian Super Cup',
    rounds:    ['Final'],
    roundGWs:  [3],
  },
  // ── French ───────────────────────────────────────────────
  coupe_de_france: {
    id:'coupe_de_france', name:'Coupe de France', shortName:'Coupe de France', icon:'🏆', color:'#003189',
    description:"France's national cup — open to all clubs",
    rounds:    ['R6','R5','R4','R3','QF','SF','Final'],
    roundGWs:  [5,   10,  16,  22,  27,  33, 37],
  },
  trophee_des_champions: {
    id:'trophee_des_champions', name:'Trophée des Champions', shortName:'Trophée', icon:'🔵', color:'#e8151b',
    description:'French Super Cup',
    rounds:    ['Final'],
    roundGWs:  [2],
  },
  knvb_beker: {
    id:'knvb_beker', name:'KNVB Beker', shortName:'KNVB Beker', icon:'🏆', color:'#FF6600',
    description:"The Netherlands' national knockout cup",
    rounds:    ['R2','R3','QF','SF','Final'],
    roundGWs:  [6,   14,  22,  30,  37],
  },
  // ── European ─────────────────────────────────────────────
  // UCL: League phase Sep-Jan (GW 5-19), Knockouts Feb-May, Final AFTER league ends
  // Real 2025/26: R16 Mar, QF Apr, SF Apr/May, Final May 30
  ucl: {
    id:'ucl', name:'Champions League', shortName:'UCL', icon:'⭐', color:'#3b82f6',
    description:"Europe's premier club competition — League Phase + Knockouts",
    rounds:    ['R16','QF','SF','Final'],
    roundGWs:  [26,   30,  34,  40],
    isGroupStage:  true,
    groupStageGWs: [5,7,9,11,13,15,17,19],
    knockoutStartRoundIndex: 0,
  },
  // UEL: League phase Sep-Jan, Knockouts Feb-May, Final May 20
  uel: {
    id:'uel', name:'Europa League', shortName:'UEL', icon:'🟠', color:'#f97316',
    description:'UEFA Europa League',
    rounds:    ['League Phase','R32','R16','QF','SF','Final'],
    roundGWs:  [6,            23,   27,   31,  35,  39],
  },
  // UECL: League phase Sep-Jan, Knockouts Feb-May, Final May 27
  uecl: {
    id:'uecl', name:'Conference League', shortName:'UECL', icon:'🟢', color:'#22c55e',
    description:'UEFA Europa Conference League',
    rounds:    ['League Phase','R16','QF','SF','Final'],
    roundGWs:  [6,            27,   31,  35,  40],
  },
};

// ─── Domestic cup IDs per league ─────────────────────────────
// Only open knockout cups that every team enters.
// Super cups (DFL-Supercup, Supercopa, Supercoppa, Trophée des Champions,
// Carabao/League Cup) are invitation-only — NOT assigned here.
// They are only shown in the UI if the team has actually played in them.
const LEAGUE_DOMESTIC_CUPS = {
  'Premier League': ['fa_cup',          'league_cup'],
  'Championship':   ['fa_cup',          'league_cup'],
  'League One':     ['fa_cup',          'league_cup'],
  'League Two':     ['fa_cup',          'league_cup'],
  'La Liga':        ['copa_del_rey'],
  'Bundesliga':     ['dfb_pokal'],
  'Serie A':        ['coppa_italia'],
  'Ligue 1':        ['coupe_de_france'],
  'Eredivisie':     ['knvb_beker'],
};

// Cups that require a specific qualifier (champion / cup winner) to enter.
// These are stored in save.cups when earned, never assigned blindly.
const INVITATION_ONLY_CUPS = new Set([
  'dfb_supercup', 'supercopa', 'supercoppa', 'trophee_des_champions',
]);

function getDomesticCups(league) {
  return LEAGUE_DOMESTIC_CUPS[league] ?? ['fa_cup', 'league_cup'];
}

// ─── Assign cups based on league + reputation ─────────────────
// Super cups and European cups are only assigned to genuinely qualifying clubs.
function assignCups(userTeam) {
  const league = userTeam.league ?? 'Premier League';
  const cups   = [...getDomesticCups(league)];
  const rep    = userTeam.reputation ?? 70;
  // Only top-tier leagues qualify for European competition
  const topTierLeagues = new Set([
    'Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Eredivisie',
  ]);
  if (topTierLeagues.has(league)) {
    if      (rep >= 90) cups.push('ucl');
    else if (rep >= 82) cups.push('uel');
    else if (rep >= 76) cups.push('uecl');
  }
  // Super cups: only truly dominant clubs (league champions / cup winners)
  // would realistically start with one — leave them out; they're earned.
  return cups;
}

// ─── Build initial cup state ──────────────────────────────────
// userLeague sets correct FA Cup entry round: L2/L1→R1(0), Champ→R2(1), PL→R3(2)
function buildInitialCupState(cupIds, userTeamId, userLeague) {
  const state = {};
  cupIds.forEach(id => {
    const isUCL = id === 'ucl';
    const meta  = CUP_META[id];
    const entryRound = meta?.entryRound?.[userLeague ?? 'Premier League'] ?? 0;
    state[id] = {
      id,
      roundIndex: entryRound,
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
function simulateCupRound(userTeam, userPlayers, allTeams, playersByTeam, cupId, roundName, event) {
  let opponent, oppPlayers;

  if (cupId === 'ucl' || cupId === 'uel' || cupId === 'uecl') {
    // European opponent: use pre-drawn from event, or fall back to random
    if (event?.opponentId) {
      const preDrawn = UCL_CLUBS.find(c => c.id === event.opponentId) ?? { id: event.opponentId, name: event.opponentName, nation: event.opponentCrest, strength: event.opponentRep ?? 72 };
      opponent   = { id: preDrawn.id, name: preDrawn.name, crest: preDrawn.nation ?? preDrawn.crest ?? '⚽' };
      oppPlayers = playersByTeam.get(preDrawn.id) ?? buildSyntheticSquad(preDrawn.id, preDrawn.strength ?? event.opponentRep ?? 72);
    } else {
      const pool = UCL_CLUBS.filter(c => c.id !== userTeam.id);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      opponent   = { id: pick.id, name: pick.name, crest: pick.nation };
      oppPlayers = playersByTeam.get(pick.id) ?? buildSyntheticSquad(pick.id, pick.strength);
    }
  } else {
    // Domestic cup: use pre-drawn opponent from event, or fall back to nation-wide draw
    if (event?.opponentId) {
      const preDrawn = allTeams.find(t => t.id === event.opponentId);
      opponent   = preDrawn ?? { id: event.opponentId, name: event.opponentName, crest: event.opponentCrest ?? '⚽', reputation: event.opponentRep ?? 70 };
      oppPlayers = playersByTeam.get(opponent.id) ?? buildSyntheticSquad(opponent.id, opponent.reputation ?? 65);
    } else {
      // Nation-wide draw: FA Cup allows any English team regardless of league tier
      const cupNation = CUP_META[cupId]?.nation;
      const ENGLISH_LEAGUES = new Set(['Premier League','Championship','League One','League Two']);
      let pool;
      if (cupNation === 'England') {
        pool = allTeams.filter(t => t.id !== userTeam.id && ENGLISH_LEAGUES.has(t.league ?? 'Premier League'));
      } else {
        const userLeague = userTeam.league ?? 'Premier League';
        pool = allTeams.filter(t => t.id !== userTeam.id && (t.league ?? 'Premier League') === userLeague);
      }
      const eligible = pool.length > 0 ? pool : allTeams.filter(t => t.id !== userTeam.id);
      const pick   = eligible[Math.floor(Math.random() * eligible.length)];
      opponent     = pick;
      oppPlayers   = playersByTeam.get(pick.id) ?? buildSyntheticSquad(pick.id, 65);
    }
  }

  const userIsHome = event?.userIsHome ?? (Math.random() < 0.5);
  const home       = userIsHome ? userTeam    : opponent;
  const away       = userIsHome ? opponent    : userTeam;
  const hPl        = userIsHome ? userPlayers : oppPlayers;
  const aPl        = userIsHome ? oppPlayers  : userPlayers;

  const hMentality = userIsHome ? (event?.userMentality ?? 'balanced') : 'balanced';
  const aMentality = userIsHome ? 'balanced' : (event?.userMentality ?? 'balanced');
  const result   = simulateMatch(home, away, hPl, aPl, undefined, undefined, undefined, undefined, hMentality, aMentality);
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
    oppScorers:   userIsHome ? result.awayScorers : result.homeScorers,
    stats: result.stats,
    events: result.events ?? [],
    fitnessUpdates: result.fitnessUpdates ?? [],
  };
}

// ─── Simulate UCL league phase matchday ──────────────────────
function simulateUCLMatchday(userTeam, userPlayers, cupState, userMentality, eventUserIsHome, playersByTeam) {
  const lp  = cupState.leaguePhase;
  const md  = lp?.matchday ?? 0;
  if (md >= 8) return null;

  // Guard: never face yourself (fallback if opponents list was built without exclusion)
  const rawOpp = lp.opponents?.[md] ?? UCL_CLUBS[md % UCL_CLUBS.length];
  const opp    = rawOpp.id === userTeam.id
    ? (UCL_CLUBS.find(c => c.id !== userTeam.id) ?? rawOpp)
    : rawOpp;

  const oppPlayers = (playersByTeam && playersByTeam.get(opp.id)) ?? buildSyntheticSquad(opp.id, opp.strength ?? 72);
  const userIsHome = eventUserIsHome ?? (Math.random() < 0.5);
  const home       = userIsHome ? userTeam    : { id:opp.id, name:opp.name, crest:opp.nation??'⚽' };
  const away       = userIsHome ? { id:opp.id, name:opp.name, crest:opp.nation??'⚽' } : userTeam;
  const hPl        = userIsHome ? userPlayers : oppPlayers;
  const aPl        = userIsHome ? oppPlayers  : userPlayers;

  const hMentality = userIsHome ? (userMentality ?? 'balanced') : 'balanced';
  const aMentality = userIsHome ? 'balanced' : (userMentality ?? 'balanced');
  const r       = simulateMatch(home, away, hPl, aPl, undefined, undefined, undefined, undefined, hMentality, aMentality);
  const userG   = userIsHome ? r.homeGoals : r.awayGoals;
  const oppG    = userIsHome ? r.awayGoals : r.homeGoals;
  const pts     = userG > oppG ? 3 : userG === oppG ? 1 : 0;

  return {
    matchday: md + 1,
    opponentId: opp.id,
    opponentName: opp.name,
    opponentNation: opp.nation ?? '🌍',
    userGoals: userG, oppGoals: oppG,
    userIsHome,
    points: pts, gd: userG - oppG,
    result: userG > oppG ? 'W' : userG === oppG ? 'D' : 'L',
    homeScorers: r.homeScorers,
    awayScorers: r.awayScorers,
    scorers: userIsHome ? r.homeScorers : r.awayScorers,
    stats: r.stats,
    events: r.events ?? [],
    fitnessUpdates: r.fitnessUpdates ?? [],
  };
}

// ─── Synthetic squad for non-PL clubs ─────────────────────────
// Large name pool — seeded by teamId so each club gets unique but consistent names
const _SYNTH_FIRST = ['A.','B.','C.','D.','E.','F.','G.','H.','J.','K.','L.','M.','N.','O.','P.','R.','S.','T.','V.','W.'];
const _SYNTH_LAST  = [
  'Müller','Fernández','García','Rossi','Silva','Santos','Pereira','Costa','Martínez','López',
  'Andersen','Petrov','Johansson','Nakamura','Okafor','Diallo','El Ahmadi','Kovačić','Larsson','Tanaka',
  'Weber','Schneider','Hoffmann','Becker','Wagner','Fischer','Meyer','Richter','Koch','Bauer',
  'Dupont','Laurent','Bernard','Thomas','Robert','Richard','Petit','Simon','Michel','Martin',
  'Bruno','Conti','Ferrari','Romano','Greco','Marino','Fontana','Ricci','Leone','Moretti',
  'Gomes','Alves','Souza','Lima','Carvalho','Rocha','Cavalcanti','Ferreira','Teixeira','Nunes',
  'De Jong','Van Dijk','Bakker','Visser','Smit','De Boer','Jansen','Meijer','Peters','Kuiper',
  'Park','Kim','Choi','Lee','Jung','Yoon','Kwon','Han','Lim','Cho',
];
function _synthHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}
function buildSyntheticSquad(teamId, avgStr) {
  const positions = ['GK','CB','CB','RB','LB','CM','CM','CDM','RW','LW','ST','CM','ST','GK','CB'];
  const seed = _synthHash(String(teamId));
  return positions.map((pos, i) => {
    const fi = (_synthHash(seed + i * 7) ) % _SYNTH_FIRST.length;
    const li = (_synthHash(seed + i * 13 + 99)) % _SYNTH_LAST.length;
    const name = `${_SYNTH_FIRST[fi]} ${_SYNTH_LAST[li]}`;
    return {
      id: `${teamId}_s${i}`, name, position: pos, age: 26,
      attack:      pos==='ST'||pos==='RW'||pos==='LW' ? Math.min(99, avgStr+5) : Math.max(10, avgStr-3),
      midfield:    pos==='CM'||pos==='CDM' ? Math.min(99, avgStr+3) : Math.max(10, avgStr-4),
      defence:     pos==='CB'||pos==='RB'||pos==='LB' ? Math.min(99, avgStr+4) : Math.max(10, avgStr-5),
      goalkeeping: pos==='GK' ? Math.min(99, avgStr+8) : 10,
      value: 10_000_000, wage: 50_000, fitness: 90,
      injured: false, suspended: false, inSquad: true,
      goals: 0, assists: 0, cleanSheets: 0, form: 50,
    };
  });
}

async function getCupFixtures(cupId) {
  const all = await getAllFixtures();
  return all.filter(f => f.competition === cupId);
}

