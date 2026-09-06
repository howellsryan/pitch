import { getAllFixtures } from './db.js';
import { selectEleven, simulateMatch } from './matchEngine.js';
import {
  COMPETITION_RULES,
  UEFA_COMPETITION_IDS,
  buildLeaguePhaseState,
  getCompetitionRules,
  isTwoLegRound,
  isUefaCompetition,
  resolveTwoLegTie,
} from './competitionRules.js';
import { COMPETITION_SHOOTOUT_VERSION } from './competitionShootouts.js';

/** modules/cups.js — competition state + match simulation adapters. */

// A shared 36+ club European opponent pool. P1's living-world ledger will
// replace the synthetic field with canonical qualified clubs; P0's contract
// already models the current 36-team league-phase structures and routes.
export const UCL_CLUBS = [
  { id:'man_city', name:'Man City', nation:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', strength:90 },
  { id:'arsenal', name:'Arsenal', nation:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', strength:85 },
  { id:'liverpool', name:'Liverpool', nation:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', strength:88 },
  { id:'chelsea', name:'Chelsea', nation:'🏴', strength:80 },
  { id:'newcastle', name:'Newcastle', nation:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', strength:79 },
  { id:'real_madrid', name:'Real Madrid', nation:'🇪🇸', strength:95 },
  { id:'barcelona', name:'Barcelona', nation:'🇪🇸', strength:92 },
  { id:'atletico', name:'Atlético', nation:'🇪🇸', strength:82 },
  { id:'real_sociedad', name:'R. Sociedad', nation:'🇪🇸', strength:72 },
  { id:'villarreal', name:'Villarreal', nation:'🇪🇸', strength:75 },
  { id:'leverkusen', name:'Leverkusen', nation:'🇩🇪', strength:82 },
  { id:'bayern', name:'Bayern', nation:'🇩🇪', strength:91 },
  { id:'dortmund', name:'Dortmund', nation:'🇩🇪', strength:78 },
  { id:'leipzig', name:'RB Leipzig', nation:'🇩🇪', strength:76 },
  { id:'frankfurt', name:'Frankfurt', nation:'🇩🇪', strength:74 },
  { id:'inter', name:'Inter Milan', nation:'🇮🇹', strength:84 },
  { id:'ac_milan', name:'AC Milan', nation:'🇮🇹', strength:78 },
  { id:'juventus', name:'Juventus', nation:'🇮🇹', strength:78 },
  { id:'napoli', name:'Napoli', nation:'🇮🇹', strength:76 },
  { id:'atalanta', name:'Atalanta', nation:'🇮🇹', strength:77 },
  { id:'roma', name:'Roma', nation:'🇮🇹', strength:75 },
  { id:'psg', name:'PSG', nation:'🇫🇷', strength:88 },
  { id:'monaco', name:'Monaco', nation:'🇫🇷', strength:72 },
  { id:'marseille', name:'Marseille', nation:'🇫🇷', strength:74 },
  { id:'lille', name:'Lille', nation:'🇫🇷', strength:73 },
  { id:'benfica', name:'Benfica', nation:'🇵🇹', strength:70 },
  { id:'porto', name:'Porto', nation:'🇵🇹', strength:68 },
  { id:'sporting_cp', name:'Sporting CP', nation:'🇵🇹', strength:76 },
  { id:'ajax', name:'Ajax', nation:'🇳🇱', strength:70 },
  { id:'psveindhoven', name:'PSV', nation:'🇳🇱', strength:76 },
  { id:'feyenoord', name:'Feyenoord', nation:'🇳🇱', strength:72 },
  { id:'celtic', name:'Celtic', nation:'🏴', strength:66 },
  { id:'galatasaray', name:'Galatasaray', nation:'🇹🇷', strength:70 },
  { id:'salzburg', name:'Salzburg', nation:'🇦🇹', strength:68 },
  { id:'club_brugge', name:'Club Brugge', nation:'🇧🇪', strength:67 },
  { id:'shakhtar', name:'Shakhtar', nation:'🇺🇦', strength:68 },
  { id:'olympiacos', name:'Olympiacos', nation:'🇬🇷', strength:66 },
  { id:'basel', name:'Basel', nation:'🇨🇭', strength:64 },
];

const CUP_DISPLAY = {
  fa_cup: { id:'fa_cup', name:'FA Cup', shortName:'FA Cup', icon:'🏆', color:'#f5c842', description:"The world's oldest cup competition", roundPrize:[4_500,9_000,82_350,90_000,180_000,360_000,450_000,2_000_000], runnerUpPrize:1_000_000 },
  league_cup: { id:'league_cup', name:'Carabao Cup', shortName:'League Cup', icon:'🥛', color:'#c084fc', description:'EFL League Cup' },
  copa_del_rey: { id:'copa_del_rey', name:'Copa del Rey', shortName:'Copa del Rey', icon:'👑', color:'#c8102e', description:"Spain's prestigious knockout cup" },
  supercopa: { id:'supercopa', name:'Supercopa de España', shortName:'Supercopa', icon:'🔴', color:'#f5c842', description:'Spanish Super Cup' },
  dfb_pokal: { id:'dfb_pokal', name:'DFB-Pokal', shortName:'DFB-Pokal', icon:'🏆', color:'#000000', description:"Germany's premier knockout cup" },
  dfb_supercup: { id:'dfb_supercup', name:'DFL-Supercup', shortName:'Supercup', icon:'⚡', color:'#d4a017', description:'German Super Cup' },
  coppa_italia: { id:'coppa_italia', name:'Coppa Italia', shortName:'Coppa Italia', icon:'🏆', color:'#009246', description:"Italy's national cup competition" },
  supercoppa: { id:'supercoppa', name:'Supercoppa Italiana', shortName:'Supercoppa', icon:'🔵', color:'#009246', description:'Italian Super Cup' },
  coupe_de_france: { id:'coupe_de_france', name:'Coupe de France', shortName:'Coupe de France', icon:'🏆', color:'#003189', description:"France's national cup" },
  trophee_des_champions: { id:'trophee_des_champions', name:'Trophée des Champions', shortName:'Trophée', icon:'🔵', color:'#e8151b', description:'French Super Cup' },
  knvb_beker: { id:'knvb_beker', name:'KNVB Beker', shortName:'KNVB Beker', icon:'🏆', color:'#FF6600', description:"The Netherlands' national knockout cup" },
  ucl: { id:'ucl', name:'Champions League', shortName:'UCL', icon:'⭐', color:'#3b82f6', description:"Europe's premier club competition — League Phase + Knockouts" },
  uel: { id:'uel', name:'Europa League', shortName:'UEL', icon:'🟠', color:'#f97316', description:'UEFA Europa League' },
  uecl: { id:'uecl', name:'Conference League', shortName:'UECL', icon:'🟢', color:'#22c55e', description:'UEFA Conference League' },
};

export const CUP_META = Object.freeze(Object.fromEntries(
  Object.entries(CUP_DISPLAY).map(([id, display]) => {
    const rules = COMPETITION_RULES[id] ?? {};
    return [id, {
      ...display,
      rounds: rules.rounds ?? [],
      roundGWs: rules.roundGWs ?? [],
      entryRound: rules.entryRound,
      nation: rules.nation,
      isGroupStage: rules.format === 'uefa_league_phase',
      groupStageGWs: rules.leaguePhase?.gws ?? [],
      knockoutStartRoundIndex: rules.leaguePhase?.playoffRoundIndex ?? 0,
      rulesVersion: 1,
    }];
  })
));

export function isLeaguePhaseResult(result) {
  return result?.isLeaguePhaseMatchday === true || result?.isUCLMatchday === true;
}

export function cupResultStageLabel(result, cupId = result?.cupId) {
  if (isLeaguePhaseResult(result)) {
    const matchday = Number(result?.matchday);
    return Number.isFinite(matchday) && matchday > 0 ? `League Phase · MD${matchday}` : 'League Phase';
  }
  return result?.roundName || CUP_META[cupId]?.rounds?.[result?.roundIdx] || 'Cup tie';
}

export function cupResultOutcome(result) {
  if (result?.result === 'W' || result?.result === 'D' || result?.result === 'L') return result.result;
  const shootoutWinner = result?.shootout?.winnerTeamId ?? result?.aggregate?.shootout?.winnerTeamId ?? null;
  if (shootoutWinner && result?.userTeamId) return shootoutWinner === result.userTeamId ? 'W' : 'L';
  const aggregateWon = typeof result?.aggregate?.userWon === 'boolean' ? result.aggregate.userWon : null;
  if (aggregateWon !== null) return aggregateWon ? 'W' : 'L';
  const decided = result?.penalties === true || result?.extraTime === true;
  if (decided && typeof result?.userWon === 'boolean') return result.userWon ? 'W' : 'L';

  const userGoals = Number(result?.userGoals ?? 0);
  const oppGoals = Number(result?.oppGoals ?? 0);
  if (userGoals !== oppGoals) return userGoals > oppGoals ? 'W' : 'L';
  return 'D';
}

export function describeCupResult(result, cupId = result?.cupId) {
  const outcome = cupResultOutcome(result);
  const stage = cupResultStageLabel(result, cupId);
  const score = `${Number(result?.userGoals ?? 0)}-${Number(result?.oppGoals ?? 0)}`;
  const opponent = result?.opponentName ?? 'Opponent';
  const points = isLeaguePhaseResult(result) && Number.isFinite(Number(result?.points))
    ? ` [${Number(result.points)} pts]`
    : '';
  const penalties = result?.shootout?.status === 'complete'
    ? ` [pens ${Number(result.shootout.homeScore ?? 0)}-${Number(result.shootout.awayScore ?? 0)}]`
    : '';
  const shortStage = isLeaguePhaseResult(result) && Number.isFinite(Number(result?.matchday))
    ? `MD${Number(result.matchday)}`
    : stage;
  return {
    outcome,
    stage,
    shortStage,
    won:outcome === 'W',
    label:`${stage}: ${outcome} vs ${opponent} (${score})${penalties}${points}`,
    shortLabel:`${shortStage}: ${outcome} vs ${opponent} (${score})${penalties}${points}`,
  };
}

export function cupRunStageLabel(cupId, state) {
  const meta = CUP_META[cupId];
  if (!meta) return 'In progress';
  if (meta.isGroupStage) {
    if (!state?.leaguePhaseComplete) {
      const matchday = Number(state?.leaguePhase?.matchday ?? 0);
      return matchday > 0 ? `League Phase · MD${matchday}` : 'League Phase';
    }
    const route = state.leaguePhase?.qualificationRoute ?? state.qualificationRoute;
    if (route === 'eliminated') return 'League Phase';
  }
  return meta.rounds?.[state?.roundIndex ?? 0] ?? 'Final';
}

export function cupRunStatusLabel(cupId, state) {
  if (state?.status === 'winner') return 'Trophy Won!';
  const stage = cupRunStageLabel(cupId, state);
  return state?.status === 'eliminated' ? `Out (${stage})` : stage;
}

export function upcomingCupFixtures(cupState, fromGameweek, { limit = 6, pendingEvents = [] } = {}) {
  const from = Number(fromGameweek) || 0;
  const pendingByCup = new Map();
  for (const event of pendingEvents ?? []) {
    if (event?.cupId) pendingByCup.set(event.cupId, event);
  }

  const rows = [];
  for (const [cupId, state] of Object.entries(cupState ?? {})) {
    if (state?.status !== 'active') continue;
    const meta = CUP_META[cupId];
    const rules = COMPETITION_RULES[cupId];
    if (!meta || !rules) continue;
    const pending = pendingByCup.get(cupId);

    if (rules.leaguePhase && !state.leaguePhaseComplete) {
      const played = Number(state.leaguePhase?.matchday ?? 0);
      const gws = rules.leaguePhase.gws ?? [];
      for (let index = played; index < Math.min(gws.length, rules.leaguePhase.matches); index++) {
        const gameweek = gws[index];
        if (gameweek < from) continue;
        const opponent = state.leaguePhase?.opponents?.[index] ?? null;
        rows.push({
          cupId,
          cupName:meta.name,
          cupShortName:meta.shortName ?? meta.name,
          gameweek,
          stage:`League Phase · MD${index + 1}`,
          leaguePhase:true,
          opponentName:opponent?.name ?? null,
          userIsHome:gameweek === from ? pending?.userIsHome ?? null : null,
        });
      }
      continue;
    }

    const roundIndex = Number(state.roundIndex ?? 0);
    const gameweek = meta.roundGWs?.[roundIndex];
    if (!Number.isFinite(gameweek) || gameweek < from) continue;
    rows.push({
      cupId,
      cupName:meta.name,
      cupShortName:meta.shortName ?? meta.name,
      gameweek,
      stage:meta.rounds?.[roundIndex] ?? 'Final',
      leaguePhase:false,
      opponentName:gameweek === from ? pending?.opponentName ?? null : null,
      userIsHome:gameweek === from ? pending?.userIsHome ?? null : null,
    });
  }

  return rows
    .sort((a, b) => a.gameweek - b.gameweek || a.cupId.localeCompare(b.cupId))
    .slice(0, limit);
}

export const LEAGUE_DOMESTIC_CUPS = {
  'Premier League': ['fa_cup', 'league_cup'],
  Championship: ['fa_cup', 'league_cup'],
  'League One': ['fa_cup', 'league_cup'],
  'League Two': ['fa_cup', 'league_cup'],
  'La Liga': ['copa_del_rey'],
  Bundesliga: ['dfb_pokal'],
  'Serie A': ['coppa_italia'],
  'Ligue 1': ['coupe_de_france'],
  Eredivisie: ['knvb_beker'],
};

export const INVITATION_ONLY_CUPS = new Set([
  'dfb_supercup', 'supercopa', 'supercoppa', 'trophee_des_champions',
]);

export function getDomesticCups(league) {
  return LEAGUE_DOMESTIC_CUPS[league] ?? ['fa_cup', 'league_cup'];
}

export function assignCups(userTeam) {
  const league = userTeam.league ?? 'Premier League';
  const cups = [...getDomesticCups(league)];
  const rep = userTeam.reputation ?? 70;
  const topTierLeagues = new Set(['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Eredivisie']);
  if (topTierLeagues.has(league)) {
    if (rep >= 90) cups.push('ucl');
    else if (rep >= 82) cups.push('uel');
    else if (rep >= 76) cups.push('uecl');
  }
  return cups;
}

export function isEuroLegRound(cupId, roundName, legNum) {
  return isUefaCompetition(cupId) && isTwoLegRound(cupId, roundName, legNum);
}

export function computeTwoLegOutcome(leg1, leg2, rng = Math.random) {
  return resolveTwoLegTie(leg1, leg2, rng);
}

function deterministicCupRoll(seed, salt = '') {
  return _synthHash(`${seed ?? 1}:${salt}`) / 4294967296;
}

export function resolveSingleLegKnockout(userGoals, oppGoals, seed) {
  if (userGoals > oppGoals) return { userWon:true, penalties:false, extraTime:false };
  if (oppGoals > userGoals) return { userWon:false, penalties:false, extraTime:false };
  return {
    userWon:deterministicCupRoll(seed, 'single-leg') < 0.5,
    penalties:true,
    extraTime:true,
  };
}

export function hasCommittedShootoutResult(cupState, shootoutId) {
  if (!shootoutId) return false;
  return (cupState?.results ?? []).some(result => (
    result?.shootout?.shootoutId === shootoutId
      || result?.aggregate?.shootout?.shootoutId === shootoutId
  ));
}

export function resolveCupProgress(cupId, roundName, roundIdx, cupState, userGoals, oppGoals, userWon, userIsHome, tieSeed = null, versionedResolution = null) {
  const rules = getCompetitionRules(cupId);
  const nextIdx = roundIdx + 1;
  const isFinal = nextIdx >= (rules?.rounds?.length ?? 99);

  if (isTwoLegRound(cupId, roundName, 1)) {
    return { roundIndex: nextIdx, status: 'active', aggregate: null };
  }
  if (isTwoLegRound(cupId, roundName, 2)) {
    let aggregate;
    if (versionedResolution?.version === COMPETITION_SHOOTOUT_VERSION) {
      aggregate = {
        userWon:Boolean(versionedResolution.userWon),
        penalties:Boolean(versionedResolution.penalties),
        extraTime:Boolean(versionedResolution.extraTime),
        userAgg:Number(versionedResolution.userAgg ?? 0),
        oppAgg:Number(versionedResolution.oppAgg ?? 0),
        shootout:versionedResolution.shootout ?? null,
      };
    } else {
      const leg1 = cupState?.results?.[cupState.results.length - 1];
      const tieRng = tieSeed == null
        ? Math.random
        : () => deterministicCupRoll(tieSeed, `${cupId}:${roundName}:aggregate`);
      aggregate = resolveTwoLegTie(
        { userGoals: leg1?.userGoals ?? 0, oppGoals: leg1?.oppGoals ?? 0, userIsHome: leg1?.userIsHome ?? true },
        { userGoals, oppGoals, userIsHome },
        tieRng,
      );
    }
    return {
      roundIndex: aggregate.userWon ? nextIdx : roundIdx,
      status: aggregate.userWon ? (isFinal ? 'winner' : 'active') : 'eliminated',
      aggregate,
    };
  }

  return {
    roundIndex: userWon ? nextIdx : roundIdx,
    status: userWon ? (isFinal ? 'winner' : 'active') : 'eliminated',
    aggregate: null,
  };
}

export function buildInitialCupState(cupIds, userTeamId, userLeague) {
  const state = {};
  const hasEurope = cupIds.some(id => UEFA_COMPETITION_IDS.has(id));

  cupIds.forEach(id => {
    const rules = getCompetitionRules(id);
    let entryRound = rules?.entryRound?.[userLeague ?? 'Premier League'] ?? 0;
    if (id === 'league_cup' && hasEurope && userLeague === 'Premier League') {
      entryRound = rules?.europeanEntrantRound ?? entryRound;
    }

    const phase = rules?.leaguePhase;
    state[id] = {
      id,
      rulesVersion: 1,
      roundIndex: entryRound,
      status: 'active',
      results: [],
      ...(phase ? {
        leaguePhase: buildLeaguePhaseState(id, buildEuropeanOpponents(id, userTeamId)),
        leaguePhaseComplete: false,
        qualificationRoute: null,
        seed: null,
      } : {}),
    };
  });

  return state;
}

export function buildEuropeanOpponents(cupId, excludeTeamId) {
  const matches = getCompetitionRules(cupId)?.leaguePhase?.matches ?? 8;
  const pool = excludeTeamId ? UCL_CLUBS.filter(c => c.id !== excludeTeamId) : UCL_CLUBS;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, matches);
}

export function buildUCLOpponents(excludeTeamId) {
  return buildEuropeanOpponents('ucl', excludeTeamId);
}

function drawOpponent(allTeams, userTeam, cupId, event) {
  if (isUefaCompetition(cupId)) {
    if (event?.opponentId) {
      const known = UCL_CLUBS.find(c => c.id === event.opponentId);
      return known ?? { id:event.opponentId, name:event.opponentName, nation:event.opponentCrest, strength:event.opponentRep ?? 72 };
    }
    const pool = UCL_CLUBS.filter(c => c.id !== userTeam.id);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  if (event?.opponentId) {
    return allTeams.find(t => t.id === event.opponentId)
      ?? { id:event.opponentId, name:event.opponentName, crest:event.opponentCrest ?? '⚽', reputation:event.opponentRep ?? 70 };
  }

  const rules = getCompetitionRules(cupId);
  const ENGLISH_LEAGUES = new Set(['Premier League', 'Championship', 'League One', 'League Two']);
  let pool;
  if (rules?.nation === 'England') {
    pool = allTeams.filter(t => t.id !== userTeam.id && ENGLISH_LEAGUES.has(t.league ?? 'Premier League'));
  } else {
    const userLeague = userTeam.league ?? 'Premier League';
    pool = allTeams.filter(t => t.id !== userTeam.id && (t.league ?? 'Premier League') === userLeague);
  }
  const eligible = pool.length ? pool : allTeams.filter(t => t.id !== userTeam.id);
  return eligible[Math.floor(Math.random() * eligible.length)];
}

/**
 * Reconstruct the final eligible on-pitch participants after automatic match
 * substitutions. Shootouts must never silently reintroduce a player who was
 * substituted off, and the goalkeeper must be whoever finished regulation in
 * goal. This projection is transient: only matchShootout's compact participant
 * snapshots/receipts are persisted if penalties are actually required.
 */
export function deriveFinalShootoutParticipants(players, formation, lineup, teamId, events = [], fitnessUpdates = []) {
  const byId = new Map((players ?? []).map(player => [player.id, player]));
  let active = selectEleven(players ?? [], formation ?? '4-3-3', lineup ?? null).map(player => ({ ...player }));
  for (const event of events ?? []) {
    if (event?.type !== 'sub' || event.teamId !== teamId) continue;
    const index = active.findIndex(player => player.id === event.outId);
    const incoming = byId.get(event.inId);
    if (index < 0 || !incoming) continue;
    const outgoing = active[index];
    active[index] = {
      ...incoming,
      matchPosition:outgoing.matchPosition ?? incoming.matchPosition ?? incoming.position,
    };
  }
  const fitness = new Map((fitnessUpdates ?? [])
    .filter(update => !update.teamId || update.teamId === teamId)
    .map(update => [update.id, Number(update.newFitness)]));
  return active.map(player => ({
    ...player,
    fitness:Number.isFinite(fitness.get(player.id)) ? fitness.get(player.id) : Number(player.fitness ?? 90),
  }));
}

export function simulateCupRound(userTeam, userPlayers, allTeams, playersByTeam, cupId, roundName, event) {
  const opponentRaw = drawOpponent(allTeams, userTeam, cupId, event);
  const opponent = {
    ...opponentRaw,
    crest: opponentRaw?.nation ?? opponentRaw?.crest ?? '⚽',
  };
  const strength = opponentRaw?.strength ?? opponentRaw?.reputation ?? event?.opponentRep ?? 70;
  const oppPlayers = playersByTeam.get(opponent.id) ?? buildSyntheticSquad(opponent.id, strength);

  const userIsHome = event?.userIsHome ?? (Math.random() < 0.5);
  const home = userIsHome ? userTeam : opponent;
  const away = userIsHome ? opponent : userTeam;
  const hPl = userIsHome ? userPlayers : oppPlayers;
  const aPl = userIsHome ? oppPlayers : userPlayers;
  const userFormation = event?.userFormation ?? '4-3-3';
  const userLineup = event?.userLineup ?? null;
  const userBench = event?.userBench ?? null;
  const hFormation = userIsHome ? userFormation : undefined;
  const aFormation = userIsHome ? undefined : userFormation;
  const hLineup = userIsHome ? userLineup : null;
  const aLineup = userIsHome ? null : userLineup;
  const hMentality = userIsHome ? (event?.userMentality ?? 'balanced') : undefined;
  const aMentality = userIsHome ? undefined : (event?.userMentality ?? 'balanced');
  const result = simulateMatch(home, away, hPl, aPl, hFormation, aFormation, hLineup, aLineup, hMentality, aMentality, {
    homeBench:userIsHome ? userBench : null,
    awayBench:userIsHome ? null : userBench,
  });
  const userGoals = userIsHome ? result.homeGoals : result.awayGoals;
  const oppGoals = userIsHome ? result.awayGoals : result.homeGoals;

  const twoLeg = isTwoLegRound(cupId, roundName, 1) || isTwoLegRound(cupId, roundName, 2);
  const knockout = twoLeg
    ? { userWon:userGoals > oppGoals, penalties:false, extraTime:false }
    : resolveSingleLegKnockout(userGoals, oppGoals, result.seed);

  const output = {
    cupId,
    roundName,
    userWon:knockout.userWon,
    penalties:knockout.penalties,
    extraTime:knockout.extraTime,
    userGoals,
    oppGoals,
    opponentId: opponent.id,
    opponentName: opponent.name,
    userIsHome,
    scorers: userIsHome ? result.homeScorers : result.awayScorers,
    oppScorers: userIsHome ? result.awayScorers : result.homeScorers,
    homeScorers: result.homeScorers,
    awayScorers: result.awayScorers,
    stats: result.stats,
    events: result.events ?? [],
    fitnessUpdates: result.fitnessUpdates ?? [],
    homeFormation:result.homeFormation,
    awayFormation:result.awayFormation,
    homeMentality:result.homeMentality,
    awayMentality:result.awayMentality,
    homeTactics:result.homeTactics,
    awayTactics:result.awayTactics,
    seed:result.seed,
  };

  Object.defineProperty(output, 'shootoutParticipants', {
    enumerable:false,
    configurable:false,
    writable:false,
    value:{
      home:deriveFinalShootoutParticipants(hPl, result.homeFormation, hLineup, home.id, result.events, result.fitnessUpdates),
      away:deriveFinalShootoutParticipants(aPl, result.awayFormation, aLineup, away.id, result.events, result.fitnessUpdates),
    },
  });
  return output;
}

export function simulateEuropeanLeaguePhaseMatchday(
  cupId,
  userTeam,
  userPlayers,
  cupState,
  userMentality,
  eventUserIsHome,
  playersByTeam,
  userFormation = '4-3-3',
  userLineup = null,
  userBench = null,
) {
  const rules = getCompetitionRules(cupId)?.leaguePhase;
  const lp = cupState?.leaguePhase;
  const md = lp?.matchday ?? 0;
  if (!rules || md >= rules.matches) return null;

  const rawOpp = lp?.opponents?.[md] ?? UCL_CLUBS[md % UCL_CLUBS.length];
  const opp = rawOpp.id === userTeam.id ? (UCL_CLUBS.find(c => c.id !== userTeam.id) ?? rawOpp) : rawOpp;
  const oppPlayers = playersByTeam?.get(opp.id) ?? buildSyntheticSquad(opp.id, opp.strength ?? 72);
  const userIsHome = eventUserIsHome ?? (Math.random() < 0.5);
  const home = userIsHome ? userTeam : { id:opp.id, name:opp.name, crest:opp.nation ?? '⚽', strength:opp.strength };
  const away = userIsHome ? { id:opp.id, name:opp.name, crest:opp.nation ?? '⚽', strength:opp.strength } : userTeam;
  const hPl = userIsHome ? userPlayers : oppPlayers;
  const aPl = userIsHome ? oppPlayers : userPlayers;
  const hFormation = userIsHome ? userFormation : undefined;
  const aFormation = userIsHome ? undefined : userFormation;
  const hLineup = userIsHome ? userLineup : null;
  const aLineup = userIsHome ? null : userLineup;
  const hMentality = userIsHome ? (userMentality ?? 'balanced') : undefined;
  const aMentality = userIsHome ? undefined : (userMentality ?? 'balanced');
  const r = simulateMatch(home, away, hPl, aPl, hFormation, aFormation, hLineup, aLineup, hMentality, aMentality, {
    homeBench:userIsHome ? userBench : null,
    awayBench:userIsHome ? null : userBench,
  });
  const userG = userIsHome ? r.homeGoals : r.awayGoals;
  const oppG = userIsHome ? r.awayGoals : r.homeGoals;
  const points = userG > oppG ? 3 : userG === oppG ? 1 : 0;

  return {
    cupId,
    matchday: md + 1,
    opponentId: opp.id,
    opponentName: opp.name,
    opponentNation: opp.nation ?? '🌍',
    userGoals: userG,
    oppGoals: oppG,
    userIsHome,
    points,
    gd:userG - oppG,
    result:userG > oppG ? 'W' : userG === oppG ? 'D' : 'L',
    homeScorers:r.homeScorers,
    awayScorers:r.awayScorers,
    scorers:userIsHome ? r.homeScorers : r.awayScorers,
    stats:r.stats,
    events:r.events ?? [],
    fitnessUpdates:r.fitnessUpdates ?? [],
    homeFormation:r.homeFormation,
    awayFormation:r.awayFormation,
    homeMentality:r.homeMentality,
    awayMentality:r.awayMentality,
    homeTactics:r.homeTactics,
    awayTactics:r.awayTactics,
    seed:r.seed,
  };
}

export function simulateUCLMatchday(userTeam, userPlayers, cupState, userMentality, eventUserIsHome, playersByTeam, userFormation = '4-3-3', userLineup = null, userBench = null) {
  return simulateEuropeanLeaguePhaseMatchday('ucl', userTeam, userPlayers, cupState, userMentality, eventUserIsHome, playersByTeam, userFormation, userLineup, userBench);
}

export const _SYNTH_FIRST = ['A.','B.','C.','D.','E.','F.','G.','H.','J.','K.','L.','M.','N.','O.','P.','R.','S.','T.','V.','W.'];
export const _SYNTH_LAST = [
  'Müller','Fernández','García','Rossi','Silva','Santos','Pereira','Costa','Martínez','López',
  'Andersen','Petrov','Johansson','Nakamura','Okafor','Diallo','El Ahmadi','Kovačić','Larsson','Tanaka',
  'Weber','Schneider','Hoffmann','Becker','Wagner','Fischer','Meyer','Richter','Koch','Bauer',
  'Dupont','Laurent','Bernard','Thomas','Robert','Richard','Petit','Simon','Michel','Martin',
  'Bruno','Conti','Ferrari','Romano','Greco','Marino','Fontana','Ricci','Leone','Moretti',
  'Gomes','Alves','Souza','Lima','Carvalho','Rocha','Cavalcanti','Ferreira','Teixeira','Nunes',
  'De Jong','Van Dijk','Bakker','Visser','Smit','De Boer','Jansen','Meijer','Peters','Kuiper',
  'Park','Kim','Choi','Lee','Jung','Yoon','Kwon','Han','Lim','Cho',
];

export function _synthHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}

export function buildSyntheticSquad(teamId, avgStr) {
  const positions = ['GK','CB','CB','RB','LB','CM','CM','CDM','RW','LW','ST','CM','ST','GK','CB'];
  const seed = _synthHash(String(teamId));
  return positions.map((pos, i) => {
    const fi = _synthHash(seed + i * 7) % _SYNTH_FIRST.length;
    const li = _synthHash(seed + i * 13 + 99) % _SYNTH_LAST.length;
    return {
      id: `${teamId}_s${i}`,
      name: `${_SYNTH_FIRST[fi]} ${_SYNTH_LAST[li]}`,
      position: pos,
      age: 26,
      attack: pos==='ST'||pos==='RW'||pos==='LW' ? Math.min(99, avgStr+5) : Math.max(10, avgStr-3),
      midfield: pos==='CM'||pos==='CDM' ? Math.min(99, avgStr+3) : Math.max(10, avgStr-4),
      defence: pos==='CB'||pos==='RB'||pos==='LB' ? Math.min(99, avgStr+4) : Math.max(10, avgStr-5),
      goalkeeping: pos==='GK' ? Math.min(99, avgStr+8) : 10,
      value: 10_000_000,
      wage: 50_000,
      fitness: 90,
      injured: false,
      suspended: false,
      inSquad: true,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      form: 50,
    };
  });
}

export async function getCupFixtures(cupId) {
  const all = await getAllFixtures();
  return all.filter(f => f.competition === cupId);
}
