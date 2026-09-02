import { describe, expect, it } from 'vitest';

import { withDefaultCoaching } from './coaching.js';
import { durableLevel } from './playerDevelopment.js';
import {
  MAX_SCOUTING_ASSIGNMENTS,
  MAX_SCOUTING_ASSIGNMENT_ROWS,
  MAX_SCOUTING_REPORTS,
  advanceScoutingState,
  assignmentScoutingReports,
  cancelScoutingAssignment,
  createScoutingAssignment,
  createScoutingState,
  latestScoutingReport,
  normalizeScoutingState,
  observedPlayerProfile,
} from './scouting.js';
import { projectScoutedPlayerView } from './scoutingView.js';
import { formAdjustedValue, minimumOffer } from './transfers.js';

function target(overrides = {}) {
  return {
    id:'target', name:'Scout Target', teamId:'seller', position:'ST', age:23,
    attack:77, midfield:48, defence:35, goalkeeping:9,
    value:41_000_000, wage:88_000, potentialRating:88,
    fitness:100, form:50, individualMorale:52, sharpness:60,
    appearances:6, minutes:430, positionSuitability:{ ST:1 }, traits:[],
    ...overrides,
  };
}

const userTeam = withDefaultCoaching({ id:'user', reputation:76, league:'Premier League' });
const seller = { id:'seller', reputation:72, league:'Premier League' };
const teamsById = new Map([['user', userTeam], ['seller', seller]]);

function weekContext(season, gameweek, players) {
  return { season, gameweek, players, userTeam, teamsById, valueFor:p => p.value };
}

describe('dedicated full scout', () => {
  it('returns an exact reading after a single completed gameweek', () => {
    const player = target();
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    expect(state.assignments[0].mode).toBe('full');
    expect(state.assignments[0].stage).toBe('assigned');

    const advanced = advanceScoutingState(state, weekContext('2025/26', 5, [player]));
    const report = latestScoutingReport(advanced.state, 'target');

    expect(advanced.state.assignments[0].status).toBe('complete');
    expect(advanced.state.assignments[0].weeks).toBe(1);
    expect(report.exact).toBe(true);
    expect(report.stage).toBe('complete');
    expect(report.confidenceLabel).toBe('Complete');

    // A completed scout reports durable ability, not today's form-inflated reading.
    const level = Math.round(Number(durableLevel(player)));
    expect(report.current).toMatchObject({ min:level, max:level });
    expect(report.future).toMatchObject({ min:88, max:88 });
    expect(report.current.max).toBeLessThanOrEqual(report.future.min);
    expect(report.financial).toMatchObject({
      feeMin:player.value, feeMax:player.value, wageMin:player.wage, wageMax:player.wage,
    });
  });

  it('still stores observations only, never authoritative attribute rows', () => {
    const player = target();
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const report = latestScoutingReport(advanceScoutingState(state, weekContext('2025/26', 5, [player])).state, 'target');
    expect(report).not.toHaveProperty('attack');
    expect(report).not.toHaveProperty('potentialRating');
    expect(report.playerId).toBe('target');
  });

  it('a survey assignment still takes four weeks and keeps a range', () => {
    const player = target();
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', playerId:'target' }, { season:'2025/26', gameweek:4 });
    expect(state.assignments[0].mode).toBe('survey');

    let advanced = advanceScoutingState(state, weekContext('2025/26', 5, [player]));
    expect(advanced.state.assignments[0].status).toBe('active');
    expect(latestScoutingReport(advanced.state, 'target').exact).toBeUndefined();

    for (const gw of [6, 7, 8]) advanced = advanceScoutingState(advanced.state, weekContext('2025/26', gw, [player]));
    const report = latestScoutingReport(advanced.state, 'target');
    expect(advanced.state.assignments[0].status).toBe('complete');
    expect(report.exact).toBeUndefined();
    expect(report.current.max).toBeGreaterThan(report.current.min);
  });

  it('projects an exact report without rounding attributes into a band', () => {
    const player = target();
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const settled = advanceScoutingState(state, weekContext('2025/26', 5, [player])).state;

    const view = projectScoutedPlayerView(player, settled, { season:'2025/26', gameweek:5, teamsById, userTeam });
    expect(view.fullyScouted).toBe(true);
    expect(view.attack).toBe(Math.round(Number(durableLevel(player))));
    expect(view.midfield).toBe(player.midfield);
    expect(view.defence).toBe(player.defence);
    expect(view.potentialRating).toBe(player.potentialRating);
    expect(view.value).toBe(player.value);
    expect(view.wage).toBe(player.wage);
  });

  it('reprojects a current-season exact entitlement from the live player row', () => {
    const player = target();
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const settled = advanceScoutingState(state, weekContext('2025/26', 5, [player])).state;
    const stored = latestScoutingReport(settled, 'target');

    const developed = target({
      attack:81,
      potentialRating:91,
      value:47_000_000,
      wage:96_000,
      form:84,
    });
    const current = observedPlayerProfile(developed, settled, {
      season:'2025/26', gameweek:9, teamsById, userTeam, valueFor:formAdjustedValue,
    });

    // The persisted report remains the GW5 observation, while the season-long
    // exact entitlement is projected from the latest canonical player row.
    expect(stored.observedGameweek).toBe(5);
    expect(stored).not.toHaveProperty('refreshedGameweek');
    expect(stored.current.min).not.toBe(Math.round(Number(durableLevel(developed))));
    expect(current.observedGameweek).toBe(5);
    expect(current.refreshedGameweek).toBe(9);
    expect(current.current).toMatchObject({
      min:Math.round(Number(durableLevel(developed))),
      max:Math.round(Number(durableLevel(developed))),
    });
    expect(current.future).toMatchObject({ min:91, max:91 });
    expect(current.financial).toMatchObject({
      feeMin:formAdjustedValue(developed),
      feeMax:formAdjustedValue(developed),
      wageMin:developed.wage,
      wageMax:developed.wage,
    });

    const view = projectScoutedPlayerView(developed, settled, {
      season:'2025/26', gameweek:9, teamsById, userTeam, valueFor:formAdjustedValue,
    });
    expect(view.attack).toBe(Math.round(Number(durableLevel(developed))));
    expect(view.value).toBe(formAdjustedValue(developed));
    expect(Math.floor(view.value * .88)).toBe(minimumOffer(developed));
  });

  it('expires the report when the season rolls over', () => {
    const player = target();
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const settled = advanceScoutingState(state, weekContext('2025/26', 5, [player])).state;

    const thisSeason = observedPlayerProfile(player, settled, { season:'2025/26', gameweek:20, teamsById, userTeam });
    expect(thisSeason.exact).toBe(true);
    // Late in the same season the exact report neither widens nor goes stale.
    expect(thisSeason.current.min).toBe(thisSeason.current.max);
    expect(thisSeason.stale).toBeUndefined();

    const nextSeason = observedPlayerProfile(player, settled, { season:'2026/27', gameweek:3, teamsById, userTeam });
    expect(nextSeason.exact).toBeUndefined();
    expect(nextSeason.source).toBe('public');
    expect(nextSeason.current.max).toBeGreaterThan(nextSeason.current.min);

    const nextSeasonView = projectScoutedPlayerView(player, settled, { season:'2026/27', gameweek:3, teamsById, userTeam });
    expect(nextSeasonView.fullyScouted).toBe(false);
  });

  it('drops expired reports and frees the assignment slot in the new season', () => {
    const players = Array.from({ length:MAX_SCOUTING_ASSIGNMENTS }, (_, i) => target({ id:`t${i}`, name:`Target ${i}` }));
    let state = createScoutingState();
    for (const player of players) {
      state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:player.id }, { season:'2025/26', gameweek:4 });
    }
    expect(() => createScoutingAssignment(state, { type:'player', mode:'full', playerId:'overflow' }, { season:'2025/26', gameweek:4 }))
      .toThrow('SCOUTING_ASSIGNMENT_CAP');

    const settled = advanceScoutingState(state, weekContext('2025/26', 5, players)).state;
    expect(settled.reports).toHaveLength(MAX_SCOUTING_ASSIGNMENTS);

    // A new season retires last season's scouts rather than letting them hold slots.
    const nextSeason = createScoutingAssignment(settled, { type:'player', mode:'full', playerId:'t0' }, { season:'2026/27', gameweek:2 });
    expect(nextSeason.assignments).toHaveLength(1);
    expect(nextSeason.assignments[0].season).toBe('2026/27');

    const nextWeek = advanceScoutingState(nextSeason, weekContext('2026/27', 3, players)).state;
    expect(nextWeek.reports.every(report => report.observedSeason === '2026/27')).toBe(true);
  });

  it('clamps exact potential against durable ability, not the effective level', () => {
    // An in-form, fully fit player reads above their durable ability; clamping
    // there would let an "exact" potential exceed the real value and drift.
    const hot = target({ potentialRating:80, form:95, individualMorale:95, fitness:100, sharpness:100 });
    let state = createScoutingState();
    // Guards the pairing: an exact ceiling must never sit below the exact
    // current reading, which is what mixing effective and durable levels did.
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const report = latestScoutingReport(advanceScoutingState(state, weekContext('2025/26', 5, [hot])).state, 'target');
    expect(report.future).toMatchObject({ min:80, max:80 });
    expect(report.current).toMatchObject({ min:77, max:77 });
    expect(report.current.max).toBeLessThanOrEqual(report.future.min);
  });

  it('does not let completed scouts exhaust the network', () => {
    // FULL_SCOUT_WEEKS is 1, so five dedicated scouts finish in a single week.
    // If the cap counted finished work, the network would be dead after one.
    const players = Array.from({ length:MAX_SCOUTING_ASSIGNMENTS }, (_, i) => target({ id:`p${i}` }));
    let state = createScoutingState();
    for (const player of players) {
      state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:player.id }, { season:'2025/26', gameweek:4 });
    }
    const settled = advanceScoutingState(state, weekContext('2025/26', 5, players)).state;
    expect(settled.assignments.every(item => item.status === 'complete')).toBe(true);

    const next = createScoutingAssignment(settled, { type:'player', mode:'full', playerId:'fresh' }, { season:'2025/26', gameweek:6 });
    expect(next.assignments.filter(item => item.status === 'active')).toHaveLength(1);
    // The finished ones stay reachable so their reports can still be opened.
    expect(next.assignments.length).toBeGreaterThan(1);
  });

  it('does not let a broad survey overwrite a completed exact report', () => {
    const player = target({ position:'ST' });
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    state = createScoutingAssignment(state, { type:'position', position:'ST' }, { season:'2025/26', gameweek:4 });

    const settled = advanceScoutingState(state, weekContext('2025/26', 5, [player])).state;
    const report = latestScoutingReport(settled, 'target');
    expect(report.exact).toBe(true);
    expect(report.current.min).toBe(report.current.max);
  });

  it('does not reuse an assignment id after one is cancelled in the same week', () => {
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'position', position:'ST' }, { season:'2025/26', gameweek:4 });
    state = createScoutingAssignment(state, { type:'position', position:'CB' }, { season:'2025/26', gameweek:4 });
    state = cancelScoutingAssignment(state, state.assignments[0].id);
    state = createScoutingAssignment(state, { type:'position', position:'GK' }, { season:'2025/26', gameweek:4 });

    const ids = state.assignments.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('refuses to double-assign the same scout in the same week', () => {
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    expect(() => createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 }))
      .toThrow('SCOUTING_ALREADY_ASSIGNED');
  });

  it('lets a finished scout be sent out again, and keeps its report through a trim', () => {
    const player = target();
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const settled = advanceScoutingState(state, weekContext('2025/26', 5, [player])).state;
    expect(settled.assignments[0].status).toBe('complete');

    // A completed assignment is history, not a scout still in the field.
    const again = createScoutingAssignment(settled, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:6 });
    expect(again.assignments.filter(item => item.playerId === 'target')).toHaveLength(2);

    // A season of survey reports must not evict the one that was paid for.
    const crowd = Array.from({ length:MAX_SCOUTING_REPORTS + 20 }, (_, i) => target({ id:`f${i}`, position:'CB', defence:60 }));
    let busy = createScoutingAssignment(settled, { type:'position', position:'CB' }, { season:'2025/26', gameweek:6 });
    for (let gw = 7; gw < 40; gw++) busy = advanceScoutingState(busy, weekContext('2025/26', gw, [player, ...crowd])).state;
    expect(busy.reports.length).toBeLessThanOrEqual(MAX_SCOUTING_REPORTS);
    expect(latestScoutingReport(busy, 'target').exact).toBe(true);
  });

  it('retires last season\'s scouts instead of letting them keep filing reports', () => {
    const player = target();
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'position', position:'ST' }, { season:'2025/26', gameweek:4 });
    const settled = advanceScoutingState(state, weekContext('2025/26', 5, [player])).state;
    expect(settled.assignments).toHaveLength(1);

    const nextSeason = advanceScoutingState(settled, weekContext('2026/27', 3, [player])).state;
    expect(nextSeason.assignments).toHaveLength(0);
    expect(nextSeason.reports).toHaveLength(0);
  });

  it('never lets the report ledger grow past its cap', () => {
    const crowd = Array.from({ length:40 }, (_, i) => target({ id:`c${i}`, position:'CB', defence:60 }));
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'position', position:'CB' }, { season:'2025/26', gameweek:4 });
    for (const player of crowd.slice(0, MAX_SCOUTING_ASSIGNMENTS - 1)) {
      state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:player.id }, { season:'2025/26', gameweek:4 });
    }
    for (let gw = 5; gw < 45; gw++) state = advanceScoutingState(state, weekContext('2025/26', gw, crowd)).state;
    expect(state.reports.length).toBeLessThanOrEqual(MAX_SCOUTING_REPORTS);
  });

  it('adopts a pre-season-field legacy assignment instead of pinning it forever', () => {
    // Careers created before assignments carried a season have none. Left alone
    // they would read as "current" in every season and hold a slot for good.
    const player = target();
    const legacy = {
      id:'scout:legacy:1', type:'position', position:'ST', playerIds:[],
      weeks:0, stage:'assigned', status:'active', lastAdvancedKey:null,
    };
    const state = { ...createScoutingState(), assignments:[legacy] };

    const settled = advanceScoutingState(state, weekContext('2025/26', 5, [player])).state;
    expect(settled.assignments[0].season).toBe('2025/26');

    const nextSeason = advanceScoutingState(settled, weekContext('2026/27', 3, [player])).state;
    expect(nextSeason.assignments).toHaveLength(0);
  });

  it('does not let a replacement assignment inherit a cancelled scout\'s reports', () => {
    const player = target();
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'position', position:'ST' }, { season:'2025/26', gameweek:4 });
    const firstId = state.assignments[0].id;
    const settled = advanceScoutingState(state, weekContext('2025/26', 5, [player])).state;
    expect(assignmentScoutingReports(settled, firstId, '2025/26')).toHaveLength(1);

    const cancelled = cancelScoutingAssignment(settled, firstId);
    const replacement = createScoutingAssignment(cancelled, { type:'position', position:'ST' }, { season:'2025/26', gameweek:4 });
    const replacementId = replacement.assignments.at(-1).id;

    expect(replacementId).not.toBe(firstId);
    expect(assignmentScoutingReports(replacement, replacementId, '2025/26')).toHaveLength(0);
  });

  it('maps a CAM\'s scouted ability onto the attribute the player model uses', () => {
    // playerModel treats CAM as an attacker; re-listing positions in the view
    // had the exact reading landing in Midfield instead.
    const cam = target({ position:'CAM', attack:74, midfield:52, potentialRating:84, positionSuitability:{ CAM:1 } });
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const settled = advanceScoutingState(state, weekContext('2025/26', 5, [cam])).state;
    const view = projectScoutedPlayerView(cam, settled, { season:'2025/26', gameweek:5, teamsById, userTeam });
    expect(view.attack).toBe(Math.round(Number(durableLevel(cam))));
    expect(view.midfield).toBe(cam.midfield);
  });

  it('prices a report on the same basis the engine accepts offers against', () => {
    // minimumOffer is 0.88 x formAdjustedValue. A report priced off the raw
    // value put an in-form player's whole offer UI below the engine's floor.
    const hot = target({ form:88 });
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const settled = advanceScoutingState(state, {
      season:'2025/26', gameweek:5, players:[hot], userTeam, teamsById, valueFor:formAdjustedValue,
    }).state;

    const report = latestScoutingReport(settled, 'target');
    expect(report.financial.feeMin).toBe(formAdjustedValue(hot));
    expect(report.financial.feeMin).toBeGreaterThanOrEqual(minimumOffer(hot));

    const view = projectScoutedPlayerView(hot, settled, { season:'2025/26', gameweek:5, teamsById, userTeam });
    expect(view.value).toBeGreaterThanOrEqual(minimumOffer(hot));
  });

  it('puts survey and exact reports on one basis, so paying for a scout only narrows', () => {
    // A survey reading the form-inflated effective level while an exact report
    // read durable ability made the number visibly drop after paying a scout.
    const hot = target({ form:92, individualMorale:90, fitness:100, sharpness:95 });
    const durable = Math.round(Number(durableLevel(hot)));

    let survey = createScoutingState();
    survey = createScoutingAssignment(survey, { type:'player', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const surveyReport = latestScoutingReport(advanceScoutingState(survey, weekContext('2025/26', 5, [hot])).state, 'target');

    let exact = createScoutingState();
    exact = createScoutingAssignment(exact, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const exactReport = latestScoutingReport(advanceScoutingState(exact, weekContext('2025/26', 5, [hot])).state, 'target');

    // The survey brackets the same durable figure the exact report lands on.
    expect(surveyReport.current.min).toBeLessThanOrEqual(durable);
    expect(surveyReport.current.max).toBeGreaterThanOrEqual(durable);
    expect(exactReport.current).toMatchObject({ min:durable, max:durable });
    // And no report can claim an ability above the player's own ceiling.
    expect(surveyReport.current.min).toBeLessThanOrEqual(surveyReport.future.max);
  });

  it('never evicts a scout still in the field to make room for history', () => {
    // Finished dedicated scouts pile up (one week each) and no longer count
    // against the active cap, so history can grow past the row ceiling behind a
    // still-running survey. The trim must drop the history, not the live scout.
    const active = { id:'scout:live', type:'position', position:'ST', mode:'survey', season:'2025/26', status:'active', weeks:1, playerIds:[] };
    const history = Array.from({ length:MAX_SCOUTING_ASSIGNMENT_ROWS * 2 }, (_, i) => ({
      id:`scout:done:${i}`, type:'player', mode:'full', playerId:`p${i}`, season:'2025/26', status:'complete', weeks:1, playerIds:[],
    }));

    const normalized = normalizeScoutingState({ assignments:[active, ...history] });
    expect(normalized.assignments.find(item => item.id === 'scout:live')).toBeDefined();
    expect(normalized.assignments.length).toBeLessThanOrEqual(MAX_SCOUTING_ASSIGNMENT_ROWS);
    // The history it does keep is the most recent.
    expect(normalized.assignments.at(-1).id).toBe(`scout:done:${history.length - 1}`);
  });

  it('credits every assignment that covered a player, not just the one that won', () => {
    // Only one report is stored per player. Without recording each covering
    // assignment, an overlapping survey showed "0 players found" for a player
    // it genuinely scouted.
    const striker = target({ position:'ST' });
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'position', position:'ST' }, { season:'2025/26', gameweek:4 });
    state = createScoutingAssignment(state, { type:'player', mode:'full', playerId:'target' }, { season:'2025/26', gameweek:4 });
    const [surveyId, scoutId] = state.assignments.map(item => item.id);

    const settled = advanceScoutingState(state, weekContext('2025/26', 5, [striker])).state;

    // The dedicated scout's exact report is the one kept...
    expect(latestScoutingReport(settled, 'target').exact).toBe(true);
    // ...and both assignments can still show the player they looked at.
    expect(assignmentScoutingReports(settled, scoutId, '2025/26')).toHaveLength(1);
    expect(assignmentScoutingReports(settled, surveyId, '2025/26')).toHaveLength(1);
  });

  it('groups reports by the assignment that produced them', () => {
    const strikers = [target({ id:'a', name:'A' }), target({ id:'b', name:'B' })];
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'position', position:'ST' }, { season:'2025/26', gameweek:4 });
    const assignmentId = state.assignments[0].id;
    const settled = advanceScoutingState(state, weekContext('2025/26', 5, strikers)).state;

    const reports = assignmentScoutingReports(settled, assignmentId, '2025/26');
    expect(reports.map(report => report.playerId).sort()).toEqual(['a', 'b']);
    expect(assignmentScoutingReports(settled, assignmentId, '2026/27')).toHaveLength(0);
    expect(assignmentScoutingReports(settled, 'scout:missing')).toHaveLength(0);
  });
});
