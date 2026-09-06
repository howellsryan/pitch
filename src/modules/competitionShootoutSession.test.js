import { describe, expect, it } from 'vitest';
import { createShootoutState, getNextShootoutKick, runAutomaticShootout } from './matchShootout.js';
import {
  acknowledgeCompetitionShootoutSession,
  assertSupportedCompetitionShootoutSession,
  competitionShootoutPresentation,
  completedCompetitionShootout,
  createCompetitionShootoutSession,
  resolveCompetitionShootoutSession,
} from './competitionShootoutSession.js';

function player(id, position, rating = 80) {
  return {
    id,
    name:id,
    teamId:id.startsWith('h-') ? 'home' : 'away',
    position,
    matchPosition:position,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:86,
    form:55,
    individualMorale:55,
    sharpness:60,
    attributeProfile:{ shooting:rating, physical:rating, passing:rating, pace:rating, dribbling:rating, defending:rating },
  };
}

function side(prefix, rating = 80) {
  return [
    player(`${prefix}-gk`, 'GK', rating),
    ...Array.from({ length:10 }, (_, index) => player(`${prefix}-${index + 1}`, index < 2 ? 'ST' : 'CM', rating - index)),
  ];
}

const HOME = side('h', 84).map(playerRow => ({ ...playerRow, teamId:'home' }));
const AWAY = side('a', 78).map(playerRow => ({ ...playerRow, teamId:'away' }));

function state(seed = 12345) {
  return createShootoutState({
    seed,
    homeTeamId:'home',
    awayTeamId:'away',
    homePlayers:HOME,
    awayPlayers:AWAY,
    firstTeamId:'home',
  });
}

function regulationResult() {
  return {
    homeTeamId:'home', awayTeamId:'away', homeGoals:1, awayGoals:1,
    homeTeamName:'Home', awayTeamName:'Away', events:[], stats:{}, seed:12345,
  };
}

describe('Phase 7 playable competition shootout session', () => {
  it('persists the exact deterministic next kick and packet before presentation', () => {
    const initial = state();
    const nextKick = getNextShootoutKick(initial);
    const session = createCompetitionShootoutSession({
      shootoutState:initial,
      controlledTeamId:'home',
      regulationResult:regulationResult(),
    });
    expect(session.status).toBe('pending');
    expect(session.pending.kick).toEqual(nextKick);
    expect(session.pending.moment.kickId).toBe(nextKick.kickId);
    expect(session.pending.moment.mode).toBe('attack');
  });

  it('uses goalkeeper mode when the opponent takes the next kick', () => {
    let session = createCompetitionShootoutSession({ shootoutState:state(), controlledTeamId:'home', regulationResult:regulationResult() });
    session = resolveCompetitionShootoutSession(session, null).session;
    session = acknowledgeCompetitionShootoutSession(session);
    expect(session.status).toBe('pending');
    expect(session.pending.kick.teamId).toBe('away');
    expect(session.pending.moment.mode).toBe('goalkeeper');
  });

  it('commits one exact kick and keeps its presentation durable until acknowledgement', () => {
    const initial = createCompetitionShootoutSession({ shootoutState:state(), controlledTeamId:'home', regulationResult:regulationResult() });
    const intent = { attack:{ aimX:.62, aimY:.78, power:.75, timing:.84 } };
    const resolved = resolveCompetitionShootoutSession(initial, intent).session;
    expect(resolved.status).toBe('committed');
    expect(resolved.state.kicks).toHaveLength(1);
    expect(resolved.lastReceipt.kickId).toBe(initial.pending.kick.kickId);
    expect(resolved.lastMoment).toEqual(initial.pending.moment);

    const restored = structuredClone(resolved);
    assertSupportedCompetitionShootoutSession(restored);
    const presentation = competitionShootoutPresentation(restored);
    expect(presentation.moment.kickId).toBe(initial.pending.kick.kickId);
    expect(presentation.resolution.shot.finish).toBe(resolved.lastShot.finish);
  });

  it('Simulate resolves the same saved pending kick rather than drawing another packet', () => {
    const first = createCompetitionShootoutSession({ shootoutState:state(9191), controlledTeamId:'home', regulationResult:regulationResult() });
    const restored = structuredClone(first);
    const a = resolveCompetitionShootoutSession(first, null).session;
    const b = resolveCompetitionShootoutSession(restored, null).session;
    expect(a.lastReceipt).toEqual(b.lastReceipt);
    expect(a.state).toEqual(b.state);
  });

  it('acknowledging a committed kick changes presentation state only and prepares the deterministic next kick', () => {
    const first = createCompetitionShootoutSession({ shootoutState:state(), controlledTeamId:'home', regulationResult:regulationResult() });
    const committed = resolveCompetitionShootoutSession(first, null).session;
    const next = acknowledgeCompetitionShootoutSession(committed);
    expect(next.revision).toBe(committed.revision + 1);
    expect(next.state).toEqual(committed.state);
    expect(next.pending.kick).toEqual(getNextShootoutKick(committed.state));
  });

  it('can progress kick by kick to the same deterministic winner as the automatic domain', () => {
    const initialState = state(4444);
    const automatic = runAutomaticShootout(initialState);
    let session = createCompetitionShootoutSession({ shootoutState:initialState, controlledTeamId:'home', regulationResult:regulationResult() });
    let guard = 0;
    while (session.status !== 'complete') {
      if (guard++ > 40) throw new Error('test shootout did not complete');
      if (session.status === 'pending') session = resolveCompetitionShootoutSession(session, null).session;
      else session = acknowledgeCompetitionShootoutSession(session);
    }
    expect(session.state).toEqual(automatic);
    const completed = completedCompetitionShootout(session);
    expect(completed.summary.winnerTeamId).toBe(automatic.winnerTeamId);
    expect(completed.userWon).toBe(automatic.winnerTeamId === 'home');
    expect(completed.regulationResult.homeGoals).toBe(1);
  });

  it('does not expose the next kick until the committed result is acknowledged', () => {
    const pending = createCompetitionShootoutSession({ shootoutState:state(), controlledTeamId:'home', regulationResult:regulationResult() });
    const committed = resolveCompetitionShootoutSession(pending, null).session;
    expect(committed.pending).toBeNull();
    expect(() => resolveCompetitionShootoutSession(committed, null)).toThrow('COMPETITION_SHOOTOUT_SESSION_NOT_PENDING');
  });

  it('rejects a corrupted restored packet rather than rerolling it', () => {
    const session = createCompetitionShootoutSession({ shootoutState:state(), controlledTeamId:'home', regulationResult:regulationResult() });
    const corrupt = structuredClone(session);
    corrupt.pending.kick.packet.finish = .999999;
    expect(() => assertSupportedCompetitionShootoutSession(corrupt)).toThrow('COMPETITION_SHOOTOUT_PENDING_KICK_STALE');
  });
});
