import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCareerEventsState, createEventInstance, createCareerEventFollowUp } from './careerEvents.js';

const state = vi.hoisted(() => ({ save:null, players:[] }));
vi.mock('./db.js', async importOriginal => ({
  ...await importOriginal(),
  getAllPlayers:async () => { throw new Error('Story progression must not load unrelated world players'); },
  getPlayersByTeam:async id => state.players.filter(player => player.teamId === id),
  getPlayer:async id => state.players.find(player => player.id === id),
  getTeam:async () => ({ id:'home', budget:20_000_000 }), getAllTeams:async () => [],
  getAllStandings:async () => [], getFixturesByGW:async () => [], getManager:async () => ({ status:'employed' }),
  getSave:async () => state.save, putSave:async save => { state.save = save; },
}));

import { advanceP8StoryWeek } from './p8Runtime.js';

describe('story participant reads', () => {
  beforeEach(() => {
    state.save = { season:'2026/27', currentGameweek:5, userTeamId:'home', userManagerId:'manager', careerEvents:createCareerEventsState() };
    state.players = [{ id:'home-player', teamId:'home', age:30, value:1_000_000, contractExpiry:2030 }];
  });

  it('distinguishes a moved participant from a missing participant without loading the world', async () => {
    state.players.push({ id:'moved', teamId:'away' });
    state.save.careerEvents.active = [createEventInstance({ templateId:'broken_promise', participantIds:{ playerId:'moved' }, tokens:{} }, state.save)];
    const result = await advanceP8StoryWeek(state.save);
    expect(result.invalidated).toHaveLength(1);
    expect(result.invalidated[0].resolutionCode).toBe('participant_moved');
  });

  it('resolves the real loan pathway for a follow-up participant registered elsewhere', async () => {
    state.players.push({ id:'loan', teamId:'away', onLoan:true, loanOriginalTeamId:'home' });
    const event = createEventInstance({ templateId:'youngster_loan', participantIds:{ playerId:'loan' }, tokens:{} }, { ...state.save, currentGameweek:2 });
    state.save.careerEvents.pendingFollowUps = [createCareerEventFollowUp(event, 'stay_path', { ...state.save, currentGameweek:2 })];
    const result = await advanceP8StoryWeek(state.save);
    expect(result.autoResolved).toHaveLength(1);
    expect(result.autoResolved[0].resolutionCode).toBe('pathway_loaned');
  });
});
