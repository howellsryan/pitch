import { describe, expect, it } from 'vitest';
import {
  MATCH_PHASES,
  buildLiveMatchState,
  finaliseLiveMatch,
  simulateMatch,
  simulateMatchSegment,
} from '../modules/matchEngine.js';
import { createUserTacticalPlan } from '../modules/tactics.js';

const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW','ST','LB','CDM'];

function player(id, position, rating = 78) {
  const attacking = ['ST','CF','RW','LW','CAM'].includes(position);
  const midfield = ['CM','CDM','CAM','RM','LM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id,
    name:id,
    position,
    age:25,
    attack:attacking ? rating : rating - 10,
    midfield:midfield ? rating : rating - 8,
    defence:defending ? rating : rating - 18,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:94,
    form:50,
    individualMorale:50,
    sharpness:50,
    traits:[],
    injured:false,
    suspended:false,
    inSquad:true,
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:rating,
      shooting:attacking ? rating : rating - 12,
      passing:midfield || attacking ? rating : rating - 8,
      dribbling:attacking || midfield ? rating : rating - 8,
      defending:defending ? rating : rating - 18,
      physical:rating,
    },
  };
}

function squad(prefix) {
  return POSITIONS.map((position, index) => player(`${prefix}_${index}`, position, 78 + (index % 3) - 1));
}

function team(id, instructions = {}) {
  return { id, name:id, crest:'X', reputation:80, tacticalPlan:createUserTacticalPlan(instructions) };
}

function cloneSquad(players) {
  return players.map(subject => ({
    ...subject,
    traits:[...subject.traits],
    positionSuitability:{ ...subject.positionSuitability },
    attributeProfile:{ ...subject.attributeProfile },
  }));
}

function fullLedger(homeInstructions, seed) {
  const home = team('home', homeInstructions);
  const away = team('away', {
    defensiveLine:'mid', lineOfEngagement:'mid', pressing:'standard',
    defensiveTransition:'balanced', defensiveWidth:'balanced',
  });
  const state = buildLiveMatchState(
    home, away, squad('home'), squad('away'),
    '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
  );
  return simulateMatchSegment(home, away, state, 1, MATCH_PHASES).updatedState.actionLedger;
}

function routeCount(ledger, teamId, route) {
  return ledger.filter(record => record.teamId === teamId && record.route === route).length;
}

describe('T4 authoritative tactics-v2 consumption', () => {
  it('routes materially more attacks into space when Pass Into Space is selected', () => {
    let toFeetRoutes = 0;
    let intoSpaceRoutes = 0;

    for (let index = 0; index < 8; index += 1) {
      const seed = `t4-space-route-${index}`;
      toFeetRoutes += routeCount(fullLedger({ useOfSpace:'to_feet', ballCarrying:'balanced' }, seed), 'home', 'pass_into_space');
      intoSpaceRoutes += routeCount(fullLedger({ useOfSpace:'pass_into_space', ballCarrying:'balanced' }, seed), 'home', 'pass_into_space');
    }

    expect(intoSpaceRoutes).toBeGreaterThan(toFeetRoutes);
  });

  it('keeps Quick Sim and segmented Watch identical with asymmetric v2 instructions', () => {
    const home = team('home', {
      buildUp:'direct', tempo:'fast', useOfSpace:'pass_into_space', ballCarrying:'run_at_defence',
      shotSelection:'work_into_box', deliveryTiming:'early', attackingWidth:'wide', onWin:'counter',
      defensiveTransition:'counter_press', defensiveLine:'high', lineOfEngagement:'high', pressing:'aggressive',
      defensiveWidth:'narrow', defensiveApproach:'front_foot', setPieces:'attack',
    });
    const away = team('away', {
      buildUp:'patient', tempo:'slow', useOfSpace:'to_feet', ballCarrying:'dribble_less',
      shotSelection:'shoot_on_sight', attackingWidth:'narrow', onWin:'hold_shape',
      defensiveTransition:'regroup', defensiveLine:'low', lineOfEngagement:'low', pressing:'passive',
      defensiveWidth:'wide', defensiveApproach:'compact', setPieces:'secure',
    });
    const homePlayers = squad('home');
    const awayPlayers = squad('away');
    const seed = 't4-v2-quick-watch-parity';

    const quick = simulateMatch(
      home, away, cloneSquad(homePlayers), cloneSquad(awayPlayers),
      '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
    );

    let state = buildLiveMatchState(
      home, away, cloneSquad(homePlayers), cloneSquad(awayPlayers),
      '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
    );
    const events = [];
    for (let start = 1; start <= MATCH_PHASES; start += 7) {
      const segment = simulateMatchSegment(home, away, state, start, Math.min(MATCH_PHASES, start + 6));
      state = segment.updatedState;
      events.push(...segment.segEvents);
    }
    const watched = finaliseLiveMatch(home, away, state, events);

    expect({
      homeGoals:watched.homeGoals,
      awayGoals:watched.awayGoals,
      events:watched.events,
      stats:watched.stats,
      fitnessUpdates:watched.fitnessUpdates,
      actionResolverVersion:watched.actionResolverVersion,
      rngPacketVersion:watched.rngPacketVersion,
    }).toEqual({
      homeGoals:quick.homeGoals,
      awayGoals:quick.awayGoals,
      events:quick.events,
      stats:quick.stats,
      fitnessUpdates:quick.fitnessUpdates,
      actionResolverVersion:quick.actionResolverVersion,
      rngPacketVersion:quick.rngPacketVersion,
    });
  });
});