import { describe, expect, it } from 'vitest';
import {
  insertClubIntoWorldCompetition,
  projectWorldFootprintIntoUserCupState,
  readWorldFootprint,
  removeClubFromWorldCompetition,
  swapClubCompetitionControl,
} from './managerCompetitionHandoff.js';

function knockoutState(overrides = {}) {
  return {
    id:'fa_cup', format:'knockout', season:'2025/26', roundIndex:2,
    activeTeamIds:['club_a', 'club_c'], // club_b is eliminated and correctly absent, matching real advanceKnockout behavior
    entrantsByRound:{ 0:['club_a', 'club_b', 'club_c'] },
    pendingTies:[], pendingByes:[],
    progressByTeam:{
      club_a:{ status:'active', roundIndex:2, roundName:'R3', phase:'knockout' },
      club_b:{ status:'eliminated', roundIndex:1, roundName:'R2', phase:'knockout', eliminatedBy:'club_c' },
      club_c:{ status:'active', roundIndex:2, roundName:'R3', phase:'knockout' },
    },
    winnerId:null, runnerUpId:null, results:[], processedGameweeks:[],
    ...overrides,
  };
}

function uefaState(overrides = {}) {
  return {
    id:'ucl', format:'uefa_league_phase', season:'2025/26', phase:'league_phase',
    leaguePhaseMatchday:3, activeTeamIds:['club_x', 'club_y'], directTeamIds:[],
    table:[
      { teamId:'club_x', played:3, won:2, drawn:0, lost:1, gf:5, ga:3, gd:2, points:6, position:1 },
      { teamId:'club_y', played:3, won:1, drawn:1, lost:1, gf:4, ga:4, gd:0, points:4, position:2 },
    ],
    roundIndex:0, pendingTies:[], pendingByes:[],
    progressByTeam:{
      club_x:{ status:'active', roundIndex:0, roundName:'League Phase', phase:'league_phase' },
      club_y:{ status:'active', roundIndex:0, roundName:'League Phase', phase:'league_phase' },
    },
    winnerId:null, runnerUpId:null, results:[], processedGameweeks:[],
    ...overrides,
  };
}

describe('readWorldFootprint', () => {
  it('returns null for a club that never entered', () => {
    expect(readWorldFootprint(knockoutState(), 'never_entered')).toBeNull();
  });

  it('reads status/round for a club still in the competition', () => {
    const footprint = readWorldFootprint(knockoutState(), 'club_a');
    expect(footprint).toMatchObject({ status:'active', roundIndex:2, roundName:'R3', inCompetition:true });
  });

  it('reads an eliminated club correctly, including inCompetition:false', () => {
    const footprint = readWorldFootprint(knockoutState(), 'club_b');
    expect(footprint).toMatchObject({ status:'eliminated', inCompetition:false });
  });

  it('surfaces a genuinely pending two-leg tie using the real {teamAId, teamBId} shape', () => {
    const state = knockoutState({
      pendingTies:[{ teamAId:'club_a', teamBId:'club_c', leg1:{ homeGoals:1, awayGoals:1 } }],
    });
    expect(readWorldFootprint(state, 'club_a').pendingTie).toMatchObject({ teamAId:'club_a', teamBId:'club_c' });
    expect(readWorldFootprint(state, 'club_c').pendingTie).toMatchObject({ teamAId:'club_a', teamBId:'club_c' });
  });
});

describe('removeClubFromWorldCompetition', () => {
  it('is a no-op for a club with no footprint', () => {
    const state = knockoutState();
    expect(removeClubFromWorldCompetition(state, 'nowhere')).toBe(state);
  });

  it('removes an active club from every tracking structure', () => {
    const next = removeClubFromWorldCompetition(knockoutState(), 'club_a');
    expect(next.activeTeamIds).not.toContain('club_a');
    expect(next.entrantsByRound[0]).not.toContain('club_a');
    expect(next.progressByTeam.club_a).toBeUndefined();
    // Untouched clubs are unaffected.
    expect(next.progressByTeam.club_c).toBeDefined();
  });

  it('resolves a pending two-leg tie by walkover before removing the departing club, advancing the opponent to the next round', () => {
    const state = knockoutState({
      roundIndex:2, // the leg-2 round, matching worldCompetitions.js: roundIndex is already incremented once a tie is pending
      pendingTies:[{ teamAId:'club_a', teamBId:'club_c', leg1:{ homeGoals:1, awayGoals:1 } }],
    });
    const next = removeClubFromWorldCompetition(state, 'club_a');
    expect(next.pendingTies).toHaveLength(0);
    expect(next.progressByTeam.club_a).toBeUndefined();
    expect(next.progressByTeam.club_c).toMatchObject({ status:'active', roundIndex:3 });
    expect(next.activeTeamIds).toContain('club_c');
  });

  it('removes a UEFA club from activeTeamIds and its table row', () => {
    const next = removeClubFromWorldCompetition(uefaState(), 'club_x');
    expect(next.activeTeamIds).not.toContain('club_x');
    expect(next.table.find(row => row.teamId === 'club_x')).toBeUndefined();
    expect(next.progressByTeam.club_x).toBeUndefined();
  });
});

describe('insertClubIntoWorldCompetition', () => {
  it('is a no-op without an active user cup entry', () => {
    const state = knockoutState();
    expect(insertClubIntoWorldCompetition(state, 'new_club', null)).toBe(state);
    expect(insertClubIntoWorldCompetition(state, 'new_club', { status:'eliminated', roundIndex:1 })).toBe(state);
  });

  it('adds a knockout club at their achieved round', () => {
    const state = removeClubFromWorldCompetition(knockoutState(), 'club_a');
    const next = insertClubIntoWorldCompetition(state, 'returning_club', { status:'active', roundIndex:3 });
    expect(next.activeTeamIds).toContain('returning_club');
    expect(next.progressByTeam.returning_club).toMatchObject({ status:'active', roundIndex:3 });
    expect(next.entrantsByRound['3']).toContain('returning_club');
  });

  it('does NOT add a table row for a club that has already finished its league phase, even though leaguePhase is still present', () => {
    // save.cups never clears `leaguePhase` after leaguePhaseComplete flips —
    // only the flag changes. A club now in the knockout rounds must be
    // routed to the knockout branch, not mistaken for still-in-league-phase.
    const next = insertClubIntoWorldCompetition(uefaState(), 'returning_club', {
      status:'active', roundIndex:2,
      leaguePhase:{ matchday:8, points:15, gf:20, ga:5, gd:15 }, // stale/frozen snapshot
      leaguePhaseComplete:true,
    });
    expect(next.table.find(row => row.teamId === 'returning_club')).toBeUndefined();
    expect(next.activeTeamIds).toContain('returning_club');
    expect(next.progressByTeam.returning_club).toMatchObject({ status:'active', roundIndex:2, phase:'knockout' });
  });

  it('labels a club still genuinely in league phase with "League Phase", not a knockout-round-array lookup at roundIndex 0', () => {
    const next = insertClubIntoWorldCompetition(uefaState(), 'returning_club', {
      status:'active', roundIndex:0,
      leaguePhase:{ matchday:3, points:6, gf:5, ga:3, gd:2 },
      leaguePhaseComplete:false,
    });
    expect(next.progressByTeam.returning_club).toMatchObject({ roundName:'League Phase', phase:'league_phase' });
  });

  it('adds a UEFA club with a table row derived from their league-phase progress', () => {
    const next = insertClubIntoWorldCompetition(uefaState(), 'returning_club', {
      status:'active', roundIndex:0,
      leaguePhase:{ matchday:2, points:4, gf:5, ga:3, gd:2 },
    });
    expect(next.activeTeamIds).toContain('returning_club');
    const row = next.table.find(r => r.teamId === 'returning_club');
    expect(row).toMatchObject({ played:2, points:4, gf:5, ga:3, gd:2 });
    // The reconstructed won/drawn/lost must be internally consistent with
    // played and points, even though save.cups never recorded the real split.
    expect(row.won + row.drawn + row.lost).toBe(row.played);
    expect(row.won * 3 + row.drawn).toBe(row.points);
  });

  it('derives an internally consistent record across a range of played/points combinations', () => {
    for (const [played, points] of [[0, 0], [1, 3], [1, 1], [3, 9], [3, 5], [5, 7], [8, 8]]) {
      const next = insertClubIntoWorldCompetition(uefaState(), 'returning_club', {
        status:'active', roundIndex:0, leaguePhase:{ matchday:played, points, gf:0, ga:0, gd:0 },
      });
      const row = next.table.find(r => r.teamId === 'returning_club');
      expect(row.won + row.drawn + row.lost).toBe(played);
      expect(row.won * 3 + row.drawn).toBe(points);
      expect(row.won).toBeGreaterThanOrEqual(0);
      expect(row.drawn).toBeGreaterThanOrEqual(0);
      expect(row.lost).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('projectWorldFootprintIntoUserCupState', () => {
  it('returns null for no footprint', () => {
    expect(projectWorldFootprintIntoUserCupState('fa_cup', null, 'club')).toBeNull();
  });

  it('projects an eliminated knockout footprint faithfully', () => {
    const projected = projectWorldFootprintIntoUserCupState('fa_cup', { status:'eliminated', roundIndex:1, roundName:'R2' }, 'club_b');
    expect(projected).toMatchObject({ id:'fa_cup', status:'eliminated', roundIndex:1 });
    expect(projected.leaguePhase).toBeUndefined();
  });

  it('projects an active UEFA league-phase footprint with a fresh synthetic-opponent leaguePhase', () => {
    const projected = projectWorldFootprintIntoUserCupState('ucl', { status:'active', roundIndex:0 }, 'club_x');
    expect(projected.status).toBe('active');
    expect(projected.leaguePhase).toBeTruthy();
    expect(Array.isArray(projected.leaguePhase.opponents)).toBe(true);
  });
});

describe('swapClubCompetitionControl — the full orchestration', () => {
  it('handles no active entry on either side without touching the competition', () => {
    const worldCompetitions = { version:1, season:'2025/26', competitions:{ fa_cup:knockoutState() } };
    const { worldCompetitions:next, cupsForNewClub } = swapClubCompetitionControl(
      worldCompetitions, { oldClubId:'old_club', oldClubCups:{}, newClubId:'nowhere' },
    );
    expect(cupsForNewClub).toEqual({});
    expect(next.competitions.fa_cup).toEqual(worldCompetitions.competitions.fa_cup);
  });

  it('projects an arriving club with a genuinely pending tie at its walkover-resolved outcome, not the stale mid-tie state', () => {
    // The arriving club (club_a) has an unresolved leg-2 tie against club_c
    // at the moment of transfer. It must be resolved (walkover — the
    // arriving club always exits it) BEFORE their save.cups entry is built,
    // so they land as 'eliminated' with a real round, not 'active' with an
    // empty results array pointing at a leg they can never actually play.
    const worldCompetitions = {
      version:1, season:'2025/26',
      competitions:{ fa_cup:knockoutState({ pendingTies:[{ teamAId:'club_a', teamBId:'club_c', leg1:{ homeGoals:1, awayGoals:2 } }] }) },
    };
    const { worldCompetitions:next, cupsForNewClub } = swapClubCompetitionControl(
      worldCompetitions, { oldClubId:'old_club', oldClubCups:{}, newClubId:'club_a' },
    );
    expect(cupsForNewClub.fa_cup.status).toBe('eliminated');
    // The opponent correctly advances in the world, reflecting the same walkover.
    expect(next.competitions.fa_cup.progressByTeam.club_c.status).toBe('active');
    expect(next.competitions.fa_cup.pendingTies).toHaveLength(0);
  });

  it('moves the arriving club out of the world and the departing club back in, for the same competition', () => {
    const worldCompetitions = { version:1, season:'2025/26', competitions:{ fa_cup:knockoutState() } };
    const oldClubCups = { fa_cup:{ id:'fa_cup', rulesVersion:1, roundIndex:1, status:'active', results:[] } };
    const { worldCompetitions:next, cupsForNewClub } = swapClubCompetitionControl(
      worldCompetitions, { oldClubId:'old_club', oldClubCups, newClubId:'club_a' },
    );

    // The arriving club (club_a) is projected into a fresh save.cups entry and removed from the world.
    expect(cupsForNewClub.fa_cup).toMatchObject({ status:'active', roundIndex:2 });
    expect(next.competitions.fa_cup.progressByTeam.club_a).toBeUndefined();
    expect(next.competitions.fa_cup.activeTeamIds).not.toContain('club_a');

    // The departing club (old_club) is spliced back into the world at its own progress.
    expect(next.competitions.fa_cup.progressByTeam.old_club).toMatchObject({ status:'active', roundIndex:1 });
    expect(next.competitions.fa_cup.activeTeamIds).toContain('old_club');
  });

  it('is idempotent-safe: calling it twice with the same already-transferred world does not duplicate or crash', () => {
    const worldCompetitions = { version:1, season:'2025/26', competitions:{ fa_cup:knockoutState() } };
    const oldClubCups = { fa_cup:{ id:'fa_cup', rulesVersion:1, roundIndex:1, status:'active', results:[] } };
    const first = swapClubCompetitionControl(worldCompetitions, { oldClubId:'old_club', oldClubCups, newClubId:'club_a' });
    const second = swapClubCompetitionControl(first.worldCompetitions, { oldClubId:'old_club', oldClubCups, newClubId:'club_a' });
    const activeIds = second.worldCompetitions.competitions.fa_cup.activeTeamIds;
    expect(activeIds.filter(id => id === 'old_club')).toHaveLength(1); // no duplicate entry
  });

  it('never touches competitions the departing club had no entry in, leaving other clubs alone', () => {
    const worldCompetitions = { version:1, season:'2025/26', competitions:{ fa_cup:knockoutState(), ucl:uefaState() } };
    const { worldCompetitions:next } = swapClubCompetitionControl(
      worldCompetitions, { oldClubId:'old_club', oldClubCups:{}, newClubId:'club_x' },
    );
    // club_x leaves ucl (was in it), but old_club is never added since oldClubCups has no ucl entry.
    expect(next.competitions.ucl.progressByTeam.old_club).toBeUndefined();
    expect(next.competitions.ucl.progressByTeam.club_y).toEqual(worldCompetitions.competitions.ucl.progressByTeam.club_y);
    // fa_cup is entirely untouched since neither club was involved there... except club_x isn't in fa_cup anyway.
    expect(next.competitions.fa_cup).toEqual(worldCompetitions.competitions.fa_cup);
  });
});
