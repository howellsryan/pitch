import { buildLeaguePhaseState, getCompetitionRules } from './competitionRules.js';
import { buildEuropeanOpponents } from './cups.js';

/**
 * modules/managerCompetitionHandoff.js — P6 WP6: the projection adapter
 * between the two competition representations the codebase already keeps
 * (see CLAUDE.md's "Gameweek event queue" section):
 *
 *   - save.cups[cupId]        — the controlled club's own single-perspective
 *                                progress, with synthetic UEFA opponents.
 *   - save.worldCompetitions  — every OTHER club's real progress, keyed by
 *                                team ID, simulated by the fast engine.
 *
 * These are not the same shape and this module does not try to make them
 * one — see the WP6 plan-gate note in CLAUDE.md for why a full unification
 * was judged higher-risk than a bounded, explicit projection. A club's
 * round/status survives a transfer; full match-by-match cup history does
 * not (save.cups never had real opponent identities for UEFA in the first
 * place, so this is not a new limitation this module introduces).
 *
 * Every function here is pure and takes/returns plain state — no IndexedDB,
 * no `save` object. managerClubHandover.js orchestrates these against a real
 * save/team/player set.
 */

/**
 * save.cups' leaguePhase state only tracks aggregate points/gf/ga/gd, not a
 * won/drawn/lost split, so a returning club's rebuilt UEFA table row has no
 * true history to copy. This picks the split with the most wins that is
 * still internally consistent (won+drawn+lost === played, won*3+drawn ===
 * points) — not necessarily the club's real match sequence (which save.cups
 * never recorded), but never a row where played disagrees with its own
 * won/drawn/lost, which worldCompetitions.js's updateUefaTable would
 * otherwise compound further with every future result.
 */
function deriveRecordFromPoints(played, points) {
  const maxWon = Math.max(0, Math.min(played, Math.floor(points / 3)));
  for (let won = maxWon; won >= 0; won--) {
    const drawn = points - won * 3;
    const lost = played - won - drawn;
    if (drawn >= 0 && lost >= 0) return { won, drawn, lost };
  }
  return { won:0, drawn:0, lost:Math.max(0, played) };
}

/** Read a club's current progress from a worldCompetitions competition entry, or null if never entered. */
export function readWorldFootprint(competitionState, clubId) {
  if (!competitionState) return null;
  const entry = competitionState.progressByTeam?.[clubId];
  if (!entry) return null;
  // Real pendingTies entries use {teamAId, teamBId, leg1} — see
  // resolvePendingTieByWalkover below for why this isn't a generic pair.
  const pendingTie = (competitionState.pendingTies ?? []).find(tie => tie.teamAId === clubId || tie.teamBId === clubId) ?? null;
  return {
    status:entry.status,
    roundIndex:entry.roundIndex ?? 0,
    roundName:entry.roundName ?? null,
    phase:entry.phase ?? 'knockout',
    entryRound:entry.entryRound ?? entry.roundIndex ?? 0,
    inCompetition:competitionState.activeTeamIds?.includes(clubId) ?? false,
    pendingTie,
  };
}

/**
 * Resolve a departing club's one pending tie (if any) via a coin-flip
 * walkover before removing them — the opponent cannot be left mid-fixture
 * with no resolution. `rng` is injectable for deterministic tests.
 *
 * Exported so `swapClubCompetitionControl` can call this *before*
 * `readWorldFootprint`: a club is always the one who exits a tie it's
 * being pulled out of mid-flight (never advances via walkover — see the
 * comment below), so the footprint projected into their fresh save.cups
 * entry must reflect that resolved elimination, not the stale mid-tie
 * state (round pinned at the tie's round, no real leg-1 score to show).
 * `removeClubFromWorldCompetition` also calls this itself so it stays
 * correct when used standalone; calling it twice for the same club is a
 * no-op the second time (no pending tie left to resolve).
 */
export function resolvePendingTieByWalkover(competitionState, clubId, rng = Math.random) {
  // Real pendingTies entries use {teamAId, teamBId, leg1}, matching how
  // worldCompetitions.js's advanceKnockout builds them — not a generic
  // home/away pair, so this reads the same field names.
  const tie = (competitionState.pendingTies ?? []).find(t => t.teamAId === clubId || t.teamBId === clubId);
  if (!tie) return competitionState;
  const opponentId = tie.teamAId === clubId ? tie.teamBId : tie.teamAId;
  const rules = getCompetitionRules(competitionState.id);
  // The tie being resolved belongs to the *current* round (where it was
  // opened); the winner advances to the *next* one — matching
  // worldCompetitions.js's own advanceKnockout, which increments
  // comp.roundIndex and re-marks winners at rules.rounds[roundIndex+1]
  // once every pending tie in a round is resolved.
  const tieRoundIndex = competitionState.roundIndex ?? 0;
  const nextRoundIndex = tieRoundIndex + 1;
  const eliminatedRoundName = rules?.rounds?.[tieRoundIndex] ?? null;
  const advancedRoundName = rules?.rounds?.[nextRoundIndex] ?? eliminatedRoundName;
  const nextProgress = { ...competitionState.progressByTeam };
  nextProgress[clubId] = { ...(nextProgress[clubId] ?? {}), status:'eliminated', roundIndex:tieRoundIndex, roundName:eliminatedRoundName, phase:'knockout', eliminatedBy:opponentId };
  nextProgress[opponentId] = { ...(nextProgress[opponentId] ?? {}), status:'active', roundIndex:nextRoundIndex, roundName:advancedRoundName, phase:'knockout' };
  void rng; // reserved for a future non-deterministic walkover variant; the outcome here is fixed by design (the departing club always exits).
  return {
    ...competitionState,
    pendingTies:(competitionState.pendingTies ?? []).filter(t => t !== tie),
    activeTeamIds:(competitionState.activeTeamIds ?? []).includes(opponentId)
      ? competitionState.activeTeamIds
      : [...(competitionState.activeTeamIds ?? []), opponentId],
    progressByTeam:nextProgress,
  };
}

/**
 * Splice a club fully out of a worldCompetitions entry: resolve any pending
 * tie first (see above), then remove them from every active-team tracking
 * structure. Their progressByTeam row is dropped rather than kept — once
 * back under user control via save.cups, the world engine must never
 * simulate a result for them again (that would create a second result for
 * an event the user might also resolve, exactly what P2's authoritative
 * boundary forbids).
 *
 * Known limitation: for a UEFA league phase, this mutates `activeTeamIds`
 * mid-competition, which shifts the deterministic round-robin pairing
 * (`roundRobinPairs`) for every remaining club in future matchdays. This is
 * accepted as a rare, disclosed side effect of an in-season manager move
 * rather than reason to block the whole transfer.
 */
export function removeClubFromWorldCompetition(competitionState, clubId, rng = Math.random) {
  if (!competitionState || !competitionState.progressByTeam?.[clubId]) return competitionState;
  let next = resolvePendingTieByWalkover(competitionState, clubId, rng);
  const progressByTeam = { ...next.progressByTeam };
  delete progressByTeam[clubId];
  const entrantsByRound = next.entrantsByRound
    ? Object.fromEntries(Object.entries(next.entrantsByRound).map(([round, ids]) => [round, ids.filter(id => id !== clubId)]))
    : next.entrantsByRound;
  return {
    ...next,
    activeTeamIds:(next.activeTeamIds ?? []).filter(id => id !== clubId),
    directTeamIds:(next.directTeamIds ?? []).filter(id => id !== clubId),
    entrantsByRound,
    table:next.table ? next.table.filter(row => row.teamId !== clubId) : next.table,
    progressByTeam,
  };
}

/**
 * Splice a departing user club's own save.cups[cupId] progress back into the
 * world so background simulation can pick them up from where they left off.
 * A club that was never in this competition (userCupEntry is null/eliminated
 * with no further rounds) is simply not added back — this satisfies the
 * guide's "handles a new club with no active cup entry" requirement in
 * reverse (an old club leaving with no active entry needs no action either).
 */
export function insertClubIntoWorldCompetition(competitionState, clubId, userCupEntry) {
  if (!competitionState || !userCupEntry || userCupEntry.status !== 'active') return competitionState;
  const rules = getCompetitionRules(competitionState.id);
  const activeTeamIds = competitionState.activeTeamIds?.includes(clubId)
    ? competitionState.activeTeamIds
    : [...(competitionState.activeTeamIds ?? []), clubId];

  // save.cups never clears `leaguePhase` once the phase completes — only
  // `leaguePhaseComplete` flips — so that flag, not leaguePhase truthiness,
  // is the real "still in league phase" test. Matches cups.js's own
  // cupRunStageLabel, which draws the same distinction for the same reason.
  const stillInLeaguePhase = Boolean(userCupEntry.leaguePhase) && !userCupEntry.leaguePhaseComplete;

  if (stillInLeaguePhase && competitionState.table) {
    const progressByTeam = {
      ...competitionState.progressByTeam,
      // worldCompetitions.js's own buildUefaState uses this exact literal
      // for an active league-phase entry, not a rules.rounds[...] lookup —
      // roundIndex 0 there indexes the *knockout* rounds array, not the phase.
      [clubId]:{ status:'active', roundIndex:userCupEntry.roundIndex, roundName:'League Phase', phase:'league_phase' },
    };
    const lp = userCupEntry.leaguePhase;
    const played = lp.matchday ?? 0;
    const { won, drawn, lost } = deriveRecordFromPoints(played, lp.points ?? 0);
    const table = competitionState.table.some(row => row.teamId === clubId)
      ? competitionState.table
      : [...competitionState.table, {
        teamId:clubId, played, won, drawn, lost,
        gf:lp.gf ?? 0, ga:lp.ga ?? 0, gd:lp.gd ?? 0, points:lp.points ?? 0, position:0,
      }];
    return { ...competitionState, activeTeamIds, progressByTeam, table };
  }

  // Knockout stage — either a domestic cup (never has leaguePhase) or a UEFA
  // club that has already finished its league phase. UEFA competitions have
  // no entrantsByRound at all; being in activeTeamIds is enough for
  // advanceKnockout's own participant/pairing logic to include them in the
  // next round it processes, the same way a domestic entrant does.
  const roundName = rules?.rounds?.[userCupEntry.roundIndex] ?? null;
  const progressByTeam = {
    ...competitionState.progressByTeam,
    [clubId]:{ status:'active', roundIndex:userCupEntry.roundIndex, roundName, phase:'knockout' },
  };
  const entrantsByRound = competitionState.entrantsByRound ? { ...competitionState.entrantsByRound } : competitionState.entrantsByRound;
  if (entrantsByRound) {
    const round = String(userCupEntry.roundIndex);
    entrantsByRound[round] = entrantsByRound[round]?.includes(clubId) ? entrantsByRound[round] : [...(entrantsByRound[round] ?? []), clubId];
  }
  return { ...competitionState, activeTeamIds, progressByTeam, entrantsByRound };
}

/**
 * Project the arriving club's world footprint into a fresh save.cups[cupId]
 * entry. A club with no footprint (never entered this competition) yields
 * null — the caller simply omits that cup ID from the new save.cups.
 */
export function projectWorldFootprintIntoUserCupState(cupId, footprint, clubId) {
  if (!footprint) return null;
  const status = footprint.status === 'winner' ? 'winner'
    : footprint.status === 'eliminated' ? 'eliminated'
      : 'active';
  const rules = getCompetitionRules(cupId);
  const base = {
    id:cupId, rulesVersion:1, roundIndex:footprint.roundIndex, status, results:[],
  };
  if (!rules?.leaguePhase) return base;
  // A club still genuinely in league phase gets a fresh live one (matching
  // buildInitialCupState's own shape for a new entrant); one already past it
  // needs a *completed* leaguePhase, or cupRunStageLabel's !leaguePhaseComplete
  // check would wrongly show them back in league phase despite roundIndex
  // already pointing at their real knockout round (see insertClubIntoWorldCompetition's
  // matching fix). The historical league-phase stats themselves aren't
  // recoverable from worldCompetitions' shape — a disclosed, not silent, gap.
  if (footprint.phase === 'league_phase') {
    return {
      ...base,
      leaguePhase:buildLeaguePhaseState(cupId, buildEuropeanOpponents(cupId, clubId)),
      leaguePhaseComplete:false,
      qualificationRoute:null,
      seed:null,
    };
  }
  return {
    ...base,
    leaguePhase:{
      matchday:rules.leaguePhase.matches ?? 0, points:0, gf:0, ga:0, gd:0,
      opponents:[], venues:[], table:[], position:null, qualificationRoute:'direct',
    },
    leaguePhaseComplete:true,
    qualificationRoute:'direct',
    seed:null,
  };
}

/**
 * The one orchestrating transfer, run once per competition ID:
 *
 *  1. resolve any pending tie the arriving club is mid-way through (walkover
 *     — see resolvePendingTieByWalkover) *before* reading their footprint,
 *     so a mid-tie club is captured at its actually-resolved round, never
 *     the stale mid-tie one (which would have no real leg-1 score for
 *     cups.js's own two-leg logic to find);
 *  2. read the arriving club's now-current world footprint and project it
 *     into a fresh save.cups entry for them;
 *  3. remove the arriving club from world tracking — they are now user-
 *     controlled, so the background engine must never simulate a second
 *     result for them (P2's authoritative-outcome boundary);
 *  4. splice the departing club's own save.cups progress back into world
 *     tracking so background simulation picks them up from where the user
 *     left off.
 *
 * A competition ID absent from `oldClubCups` (the departing club had no
 * active entry) simply isn't re-inserted — satisfies "handles a new club
 * with no active cup entry" in reverse for the club now leaving control.
 */
export function swapClubCompetitionControl(worldCompetitions, { oldClubId, oldClubCups, newClubId }, rng = Math.random) {
  const nextCompetitions = {};
  const cupsForNewClub = {};
  for (const [cupId, rawCompetitionState] of Object.entries(worldCompetitions?.competitions ?? {})) {
    const competitionState = resolvePendingTieByWalkover(rawCompetitionState, newClubId, rng);
    const newClubFootprint = readWorldFootprint(competitionState, newClubId);
    const projected = projectWorldFootprintIntoUserCupState(cupId, newClubFootprint, newClubId);
    if (projected) cupsForNewClub[cupId] = projected;

    let updated = removeClubFromWorldCompetition(competitionState, newClubId, rng);
    const oldClubEntry = oldClubCups?.[cupId] ?? null;
    if (oldClubEntry) updated = insertClubIntoWorldCompetition(updated, oldClubId, oldClubEntry);
    nextCompetitions[cupId] = updated;
  }
  return {
    worldCompetitions:{ ...worldCompetitions, competitions:nextCompetitions },
    cupsForNewClub,
  };
}
