import { describe, expect, it } from 'vitest';

import { liveBoardConfidence, nextJobSecurity } from './season.js';

const europeObjective = { id:'europe', label:'Qualify for Europe', kind:'position', target:7 };
const titleObjective = { id:'title', label:'Win the league', kind:'position', target:1 };
const surviveObjective = { id:'avoid_relegation', label:'Avoid relegation', kind:'avoid_relegation' };

describe('live board confidence', () => {
  // The reported symptom: a fresh save sits on jobSecurity 65 all season, so the
  // Home screen read "Under scrutiny" through a winning run in a qualifying spot.
  it('does not leave a winning run in a qualifying spot under scrutiny', () => {
    const save = { jobSecurity:65, boardObjective:europeObjective };
    const board = liveBoardConfidence(save, { position:5, totalTeams:20, form:['W','W','W','W','W'] });
    expect(board.objectiveState).toBe('on_track');
    expect(board.pct).toBeGreaterThan(65);
    expect(board.label).toBe('Backed');
  });

  it('treats sitting just short of the target as tracking it, not as failure', () => {
    const save = { jobSecurity:65, boardObjective:europeObjective };
    const board = liveBoardConfidence(save, { position:9, totalTeams:20, form:['W','D','W','D','W'] });
    expect(board.objectiveState).toBe('close');
    expect(board.label).toBe('Secure');
  });

  it('falls when the club is well behind target and losing', () => {
    const save = { jobSecurity:65, boardObjective:titleObjective };
    const board = liveBoardConfidence(save, { position:14, totalTeams:20, form:['L','L','L','L','D'] });
    expect(board.objectiveState).toBe('behind');
    expect(board.pct).toBeLessThan(40);
    expect(['On notice', 'Facing the axe', 'Under scrutiny']).toContain(board.label);
  });

  it('rises as results improve from the same stored figure', () => {
    const save = { jobSecurity:50, boardObjective:europeObjective };
    const losing = liveBoardConfidence(save, { position:8, totalTeams:20, form:['L','L','L','L','L'] });
    const winning = liveBoardConfidence(save, { position:8, totalTeams:20, form:['W','W','W','W','W'] });
    expect(winning.pct).toBeGreaterThan(losing.pct);
    expect(winning.stored).toBe(50);
    expect(losing.stored).toBe(50);
  });

  it('measures a survival brief against the relegation line, not first place', () => {
    const save = { jobSecurity:60, boardObjective:surviveObjective };
    expect(liveBoardConfidence(save, { position:15, totalTeams:20, form:['D','W'] }).objectiveState).toBe('on_track');
    expect(liveBoardConfidence(save, { position:20, totalTeams:20, form:['L','L'] }).objectiveState).toBe('behind');
  });

  it('stays inside 0-100 and falls back safely with no table position', () => {
    const save = { jobSecurity:98, boardObjective:titleObjective };
    const capped = liveBoardConfidence(save, { position:1, totalTeams:20, form:['W','W','W','W','W'] });
    expect(capped.pct).toBe(100);

    const noPosition = liveBoardConfidence(save, { position:null, totalTeams:20, form:[] });
    expect(noPosition.objectiveState).toBe('unknown');
    expect(noPosition.pct).toBe(98);

    const empty = liveBoardConfidence(null);
    expect(empty.pct).toBe(65);
    expect(empty.stored).toBe(65);
  });

  it('does not judge an unplayed table whose position is only alphabetical', () => {
    const save = { jobSecurity:65, boardObjective:europeObjective };
    const board = liveBoardConfidence(save, {
      position:20,
      totalTeams:20,
      played:0,
      form:[],
    });

    expect(board.pct).toBe(65);
    expect(board.label).toBe('Secure');
    expect(board.objectiveState).toBe('unknown');
    expect(board.objectivePoints).toBe(0);
  });

  it('is derived only — the stored figure still moves solely at the season review', () => {
    const save = { jobSecurity:65, boardObjective:europeObjective };
    const board = liveBoardConfidence(save, { position:2, totalTeams:20, form:['W','W','W'] });
    expect(save.jobSecurity).toBe(65);
    expect(board.stored).toBe(65);
    expect(nextJobSecurity(65, true, 5)).toBe(87);
  });
});
