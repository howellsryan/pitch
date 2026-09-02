/**
 * modules/managerCareer.js — P6 WP2: manager match-record accrual and bounded
 * in-season club review checkpoints. Pure/DOM-free; `p6Runtime.js` owns the
 * IndexedDB-touching weekly tick that calls into this module.
 *
 * Scope note: this slice only acts on a dismissal outcome for AI clubs. The
 * user's manager is still scored at each checkpoint for visibility (a future
 * Inbox/Home surface can read the resulting reputation/warning) but a
 * 'dismiss' outcome is never applied to the user here — real user job
 * movement stays gated behind the resignation/application/handover work in
 * WP5/WP6, so this checkpoint must not strand the user's own club.
 *
 * Record-accrual scope note: `accrueManagerRecordsForWeek` only sees this
 * week's `fixtures` store rows, which is league-only (cup/European results
 * live in `save.cups`/`save.worldCompetitions`, a separate ledger). A
 * manager's `record.matches/wins/draws/losses` is therefore a league-only
 * count for now; folding in cup/European results is deferred to a later
 * work package rather than expanding this slice's scope.
 */

export const MANAGER_REVIEW_INTERVAL_GWS = 10;
export const MIN_TENURE_GWS_BEFORE_REVIEW = 6;
export const MAX_MANAGER_TICK_KEYS = 60;

function outcomeFor(gf, ga) {
  return gf > ga ? 'win' : gf === ga ? 'draw' : 'loss';
}

function addOutcome(record, outcome) {
  return {
    ...record,
    matches:(record.matches ?? 0) + 1,
    wins:(record.wins ?? 0) + (outcome === 'win' ? 1 : 0),
    draws:(record.draws ?? 0) + (outcome === 'draw' ? 1 : 0),
    losses:(record.losses ?? 0) + (outcome === 'loss' ? 1 : 0),
  };
}

/**
 * Accrue W/D/L for every manager whose club played a settled fixture this
 * world week, across every competition (league and cup alike count as real
 * matches for a manager's record). Returns only the managers that changed.
 */
export function accrueManagerRecordsForWeek(managers, fixtures) {
  const managerByClub = new Map(
    managers.filter(manager => manager.status === 'employed' && manager.currentClubId)
      .map(manager => [manager.currentClubId, manager]),
  );
  const outcomesByManagerId = new Map();
  const recordOutcome = (clubId, outcome) => {
    const manager = managerByClub.get(clubId);
    if (!manager) return;
    outcomesByManagerId.set(manager.id, [...(outcomesByManagerId.get(manager.id) ?? []), outcome]);
  };
  for (const fixture of fixtures ?? []) {
    if (!fixture?.played) continue;
    const hg = Number(fixture.homeGoals);
    const ag = Number(fixture.awayGoals);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    recordOutcome(fixture.homeTeamId, outcomeFor(hg, ag));
    recordOutcome(fixture.awayTeamId, outcomeFor(ag, hg));
  }
  if (!outcomesByManagerId.size) return [];
  return managers
    .filter(manager => outcomesByManagerId.has(manager.id))
    .map(manager => ({
      ...manager,
      record:outcomesByManagerId.get(manager.id).reduce(addOutcome, manager.record),
    }));
}

export function reviewCheckpointKey(save) {
  return `${save?.season ?? 'unknown'}:${Number(save?.currentGameweek ?? 0)}`;
}

/** A review checkpoint is due on a fixed cadence, at most once per world week. */
export function isReviewCheckpointDue(save) {
  const gw = Number(save?.currentGameweek ?? 0);
  if (gw <= 0 || gw % MANAGER_REVIEW_INTERVAL_GWS !== 0) return false;
  const key = reviewCheckpointKey(save);
  return !(save?.managerMarket?.reviewedCheckpoints ?? []).includes(key);
}

function tenureGWs(manager, save) {
  if (!manager?.employment?.startDate || !save?.currentDate) return Infinity;
  const start = new Date(manager.employment.startDate).getTime();
  const now = new Date(save.currentDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(now) || now <= start) return 0;
  return Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Reputation-rank-vs-actual-position heuristic. AI clubs don't have a P7
 * board contract yet, so this is a deliberately bounded stand-in: a club
 * performing far worse than its reputation within its own league, with a
 * losing recent record, is a review risk. `leagueTeams` must be every team
 * sharing `team.league` so the reputation ranking is meaningful.
 */
export function evaluateClubReview({ manager, team, standing, leagueTeams, save }) {
  if (!manager || !team || !standing || manager.status !== 'employed') {
    return { outcome:'ok', reputationDelta:0, marginRanks:0 };
  }
  const sortedByReputation = [...leagueTeams].sort((a, b) => (b.reputation ?? 50) - (a.reputation ?? 50));
  const expectedRank = Math.max(1, sortedByReputation.findIndex(candidate => candidate.id === team.id) + 1);
  const actualRank = Number(standing.position) || expectedRank;
  const marginRanks = expectedRank - actualRank; // positive = overperforming
  const recentForm = (standing.form ?? []).slice(-5);
  const formPoints = recentForm.reduce((sum, result) => sum + (result === 'W' ? 1 : result === 'L' ? -1 : 0), 0);

  if (tenureGWs(manager, save) < MIN_TENURE_GWS_BEFORE_REVIEW) {
    return { outcome:'ok', reputationDelta:0, marginRanks };
  }

  const severelyUnderperforming = marginRanks <= -6 && formPoints <= -2;
  const underperforming = marginRanks <= -3 && formPoints < 0;
  if (severelyUnderperforming) return { outcome:'dismiss', reputationDelta:-8, marginRanks };
  if (underperforming) return { outcome:'warning', reputationDelta:-3, marginRanks };
  if (marginRanks >= 3 && formPoints > 0) return { outcome:'ok', reputationDelta:2, marginRanks };
  return { outcome:'ok', reputationDelta:0, marginRanks };
}

export function applyReputationDelta(manager, delta) {
  if (!delta) return manager;
  const overall = Math.max(15, Math.min(96, Math.round((manager.reputation?.overall ?? 60) + delta)));
  return { ...manager, reputation:{ ...manager.reputation, overall } };
}

/**
 * Dismiss a manager and hand the club to a caretaker in the same step, so no
 * club is ever left without an active manager between review checkpoints —
 * WP3/WP4 later replace the caretaker through the real appointment flow.
 */
export function dismissAndCaretake(manager, caretaker, { weekKey, reason = 'dismissed' } = {}) {
  const dismissed = {
    ...manager,
    status:'unemployed',
    currentClubId:null,
    employment:{ clubId:null, startDate:null, contractEndSeason:null },
    record:{ ...manager.record, sackings:(manager.record?.sackings ?? 0) + 1 },
    history:[
      ...(manager.history ?? []),
      { clubId:manager.currentClubId, endReason:reason, endedWeekKey:weekKey },
    ],
  };
  return {
    dismissedManager:dismissed,
    caretakerManager:caretaker,
    vacancy:{
      id:`vac_${manager.currentClubId}_${weekKey}`,
      clubId:manager.currentClubId,
      openedWeekKey:weekKey,
      reason,
      previousManagerId:manager.id,
      caretakerManagerId:caretaker.id,
      status:'caretaker',
    },
  };
}
