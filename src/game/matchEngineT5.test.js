import { describe, expect, it } from 'vitest';
import {
  MATCH_PHASES,
  buildLiveMatchState,
  finaliseLiveMatch,
  resolveTeamTacticalIdentity,
  simulateMatch,
  simulateMatchSegment,
} from '../modules/matchEngine.js';
import { createUserTacticalPlan, getAITacticalProfile } from '../modules/tactics.js';

function makePlayer(id, position, attributes = {}, rating = 80) {
  const attacking = ['ST','CF','RW','LW','CAM','RM','LM'].includes(position);
  const midfield = ['CM','CDM','CAM','RM','LM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id,
    name:id,
    position,
    age:25,
    attack:attacking ? rating : rating - 10,
    midfield:midfield ? rating : rating - 8,
    defence:defending ? rating : rating - 16,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:92,
    form:50,
    individualMorale:50,
    sharpness:50,
    injured:false,
    suspended:false,
    inSquad:true,
    traits:[],
    attributeProfile:{
      version:1,
      pace:attributes.pace ?? rating,
      shooting:attributes.shooting ?? (attacking ? rating : rating - 12),
      passing:attributes.passing ?? (midfield || attacking ? rating : rating - 8),
      dribbling:attributes.dribbling ?? (midfield || attacking ? rating : rating - 8),
      defending:attributes.defending ?? (defending ? rating : rating - 18),
      physical:attributes.physical ?? rating,
    },
  };
}

function compactCounterSquad(prefix = 'cc') {
  const stopper = { pace:44, passing:62, dribbling:38, defending:96, physical:97 };
  const fullBack = { pace:62, passing:68, dribbling:46, defending:91, physical:94 };
  const worker = { pace:76, passing:78, dribbling:45, defending:84, physical:94 };
  const wideRunner = { pace:94, passing:80, dribbling:58, shooting:78, defending:70, physical:92 };
  const runner = { pace:98, passing:74, dribbling:55, shooting:91, defending:42, physical:96 };
  return [
    makePlayer(`${prefix}_gk`,'GK',{ pace:42, passing:58, defending:78, physical:88 },80),
    makePlayer(`${prefix}_cb1`,'CB',stopper,84),
    makePlayer(`${prefix}_cb2`,'CB',stopper,84),
    makePlayer(`${prefix}_rb`,'RB',fullBack,82),
    makePlayer(`${prefix}_lb`,'LB',fullBack,82),
    makePlayer(`${prefix}_cm1`,'CM',worker,82),
    makePlayer(`${prefix}_cm2`,'CM',worker,82),
    makePlayer(`${prefix}_rm`,'RM',wideRunner,84),
    makePlayer(`${prefix}_lm`,'LM',wideRunner,84),
    makePlayer(`${prefix}_st1`,'ST',runner,86),
    makePlayer(`${prefix}_st2`,'ST',{ ...runner, pace:96, shooting:89 },85),
    makePlayer(`${prefix}_dm`,'CDM',{ ...worker, defending:90 },81),
    makePlayer(`${prefix}_cb3`,'CB',{ ...stopper, pace:46 },80),
  ];
}

function balancedSquad(prefix = 'user') {
  const positions = ['GK','CB','CB','RB','LB','CDM','CM','CM','RW','LW','ST','GK','CB','CM','ST'];
  return positions.map((position, index) => makePlayer(`${prefix}_${index}`, position, {}, 79 + (index % 3)));
}

function clonePlayers(players) {
  return players.map(player => ({
    ...player,
    traits:[...(player.traits ?? [])],
    attributeProfile:{ ...player.attributeProfile },
  }));
}

function finalShape(result) {
  return {
    homeGoals:result.homeGoals,
    awayGoals:result.awayGoals,
    events:result.events,
    stats:result.stats,
    fitnessUpdates:result.fitnessUpdates,
    seed:result.seed,
    homeFormation:result.homeFormation,
    awayFormation:result.awayFormation,
    homeMentality:result.homeMentality,
    awayMentality:result.awayMentality,
    homeTactics:result.homeTactics,
    awayTactics:result.awayTactics,
    homeProfileId:result.homeProfileId,
    awayProfileId:result.awayProfileId,
  };
}

const aiTeam = { id:'identity_5', name:'Specialist AI', league:'Premier League', reputation:78, crest:'A' };
const userTeam = {
  id:'managed', name:'Managed', league:'Premier League', reputation:78, crest:'U',
  tacticalPlan:createUserTacticalPlan(),
};

describe('T5 authoritative squad-aware AI identity', () => {
  it('uses the squad-aware identity in authoritative match state without replacing the user plan', () => {
    expect(getAITacticalProfile(aiTeam).id).toBe('controller');
    const aiPlayers = compactCounterSquad();
    const userPlayers = balancedSquad();

    const identity = resolveTeamTacticalIdentity(aiTeam, userTeam, aiPlayers, undefined, undefined, true);
    expect(identity.source).toBe('ai');
    expect(identity.profileId).toBe('compact_counter');
    expect(identity.formation).toBe('4-4-2');
    expect(identity.instructions.onWin).toBe('counter');
    expect(identity.instructions.defensiveLine).toBe('low');

    const state = buildLiveMatchState(
      aiTeam, userTeam, aiPlayers, userPlayers,
      undefined, '4-3-3', null, null, undefined, 'balanced',
      { seed:'t5-authoritative-identity' },
    );
    expect(state.homePlanSource).toBe('ai');
    expect(state.homeProfileId).toBe('compact_counter');
    expect(state.homeFormation).toBe('4-4-2');
    expect(state.awayPlanSource).toBe('user');
    expect(state.awayProfileId).toBe('manager');
  });

  it.each([1, 7, 10, 30, 120])('keeps Quick Sim and %i-phase Watch identical after squad-aware AI selection', (segmentSize) => {
    const aiPlayers = compactCounterSquad('parity_ai');
    const userPlayers = balancedSquad('parity_user');
    const seed = 't5-squad-aware-parity';

    const quick = simulateMatch(
      aiTeam, userTeam, clonePlayers(aiPlayers), clonePlayers(userPlayers),
      undefined, '4-3-3', null, null, undefined, 'balanced', { seed },
    );

    let state = buildLiveMatchState(
      aiTeam, userTeam, clonePlayers(aiPlayers), clonePlayers(userPlayers),
      undefined, '4-3-3', null, null, undefined, 'balanced', { seed },
    );
    const events = [];
    for (let start = 1; start <= MATCH_PHASES; start += segmentSize) {
      const part = simulateMatchSegment(
        aiTeam, userTeam, state, start, Math.min(MATCH_PHASES, start + segmentSize - 1), userTeam.id,
      );
      state = part.updatedState;
      events.push(...part.segEvents);
    }
    const watched = finaliseLiveMatch(aiTeam, userTeam, state, events);

    expect(state.homeProfileId).toBe('compact_counter');
    expect(finalShape(watched)).toEqual(finalShape(quick));
  });
});
