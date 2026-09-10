import { describe, expect, it } from 'vitest';
import {
  MATCH_SET_PIECE_VERSION,
  buildPlayableMoment,
  deriveAuthoritativeSetPiece,
  resolveDirectFreeKickOutcome,
  resolvePenaltyOutcome,
} from './matchActionResolver.js';
import { isPlayableTopCornerTarget, playablePenaltyKeeperDive } from './matchSetPieces.js';

function player(id, position, rating = 78) {
  const isKeeper = position === 'GK';
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    age:25,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:isKeeper ? rating : 10,
    fitness:100,
    form:50,
    individualMorale:50,
    sharpness:50,
    traits:[],
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:rating,
      shooting:rating,
      passing:rating,
      dribbling:rating,
      defending:rating,
      physical:rating,
    },
  };
}

function packet(overrides = {}) {
  return {
    version:1,
    possession:.4,
    route:.5,
    actor:.4,
    target:.5,
    defender:.4,
    execution:.8,
    outcome:.08,
    chance:.01,
    shooter:.25,
    shot:.35,
    finish:.45,
    assist:.55,
    discipline:.65,
    injury:.75,
    ...overrides,
  };
}

function prepared(overrides = {}) {
  const shooter = overrides.shooter ?? player('taker', 'ST', 84);
  const keeper = overrides.keeper ?? player('keeper', 'GK', 82);
  const defenders = overrides.defenders ?? [
    keeper,
    player('cb-1', 'CB', 84),
    player('cb-2', 'CB', 82),
    player('dm-1', 'CDM', 80),
    player('fb-1', 'LB', 78),
    player('fb-2', 'RB', 76),
  ];
  return {
    version:1,
    phase:44,
    minute:33,
    teamId:'home',
    opponentTeamId:'away',
    attackers:[shooter, player('wing', 'LW', 80), player('mid', 'CAM', 79)],
    defenders,
    packet:packet(),
    route:'carry',
    actor:shooter,
    target:null,
    defender:defenders[1],
    execution:76,
    counter:82,
    context:0,
    successChance:.42,
    mentality:'balanced',
    riskMode:'normal',
    outcome:'foul_won',
    xg:null,
    chance:null,
    shooter:null,
    assistId:null,
    pressureDefender:null,
    ...overrides,
  };
}

describe('Phase 4 authoritative set-piece domain', () => {
  it('derives a penalty from pre-finish foul context without reading shot or finish rolls', () => {
    const first = deriveAuthoritativeSetPiece(prepared({ packet:packet({ chance:.01, shot:.01, finish:.01 }) }));
    const second = deriveAuthoritativeSetPiece(prepared({ packet:packet({ chance:.01, shot:.99, finish:.99 }) }));

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version:MATCH_SET_PIECE_VERSION,
      kind:'penalty',
      awardReason:'penalty_area_foul',
      attackingTeamId:'home',
      defendingTeamId:'away',
      goalkeeperId:'keeper',
      location:{ distance:11, channel:0 },
      wall:null,
    });
    expect(first.takerId).toBeTruthy();
    expect(first.xg).toBeGreaterThan(.65);
  });

  it('derives a direct free kick with deterministic location and authoritative wall participants', () => {
    const setPiece = deriveAuthoritativeSetPiece(prepared({
      packet:packet({ chance:.07, target:.18, shooter:.72, assist:.19 }),
    }));

    expect(setPiece.kind).toBe('direct_free_kick');
    expect(setPiece.directAttemptEligible).toBe(true);
    expect(setPiece.location.distance).toBeGreaterThanOrEqual(18);
    expect(setPiece.location.distance).toBeLessThanOrEqual(28);
    expect(setPiece.location.channel).toBeLessThan(0);
    expect(setPiece.wall.size).toBe(setPiece.wall.members.length);
    expect(setPiece.wall.size).toBeGreaterThanOrEqual(2);
    expect(setPiece.wall.distanceFromBall).toBe(9.15);
    expect(new Set(setPiece.wall.members.map(member => member.id)).size).toBe(setPiece.wall.members.length);
  });

  it('keeps non-shooting-range fouls as ordinary foul_won phases', () => {
    const setPiece = deriveAuthoritativeSetPiece(prepared({ packet:packet({ chance:.55 }) }));
    expect(setPiece).toBeNull();
  });

  it('keeps automatic penalties on their calibrated result path', () => {
    const setPiece = deriveAuthoritativeSetPiece(prepared({ packet:packet({ chance:.01 }) }));
    const goal = resolvePenaltyOutcome({
      setPiece,
      shooter:player('elite-taker', 'ST', 94),
      defenders:[player('average-gk', 'GK', 76)],
      packet:packet({ chance:.01, shot:.70, finish:.10 }),
    });
    const miss = resolvePenaltyOutcome({
      setPiece,
      shooter:player('weak-taker', 'ST', 58),
      defenders:[player('elite-gk', 'GK', 94)],
      packet:packet({ chance:.01, shot:.01, finish:.99 }),
    });

    expect(goal.finish).toBe('goal');
    expect(goal.restart).toBe('kickoff');
    expect(miss.finish).toBe('missed');
    expect(miss.restart).toBe('goal_kick');
    expect(goal.setPieceType).toBe('penalty');
  });

  it('chooses playable penalty keeper direction from RNG independently of shot aim', () => {
    const leftPacket = packet({ chance:.01, defender:.10, outcome:.20, shot:.50, finish:.50 });
    const centrePacket = packet({ chance:.01, defender:.50, outcome:.50, shot:.50, finish:.50 });
    const rightPacket = packet({ chance:.01, defender:.90, outcome:.80, shot:.50, finish:.50 });

    expect(playablePenaltyKeeperDive(leftPacket, 80).x).toBeLessThan(0);
    expect(playablePenaltyKeeperDive(centrePacket, 80).x).toBe(0);
    expect(playablePenaltyKeeperDive(rightPacket, 80).x).toBeGreaterThan(0);
    expect(playablePenaltyKeeperDive(leftPacket, 80)).toEqual(playablePenaltyKeeperDive(leftPacket, 80));

    const setPiece = deriveAuthoritativeSetPiece(prepared({ packet:leftPacket }));
    const aimRight = resolvePenaltyOutcome({
      setPiece,
      shooter:player('taker', 'ST', 86),
      defenders:[player('keeper', 'GK', 82)],
      packet:leftPacket,
      intent:{ attack:{ aimX:.72, aimY:.62, power:.76, timing:.90 } },
    });
    const aimLeft = resolvePenaltyOutcome({
      setPiece,
      shooter:player('taker', 'ST', 86),
      defenders:[player('keeper', 'GK', 82)],
      packet:leftPacket,
      intent:{ attack:{ aimX:-.72, aimY:.62, power:.76, timing:.90 } },
    });

    expect(aimRight.presentation.keeper.x).toBe(aimLeft.presentation.keeper.x);
    expect(aimRight.presentation.keeperDiveRng).toBe(true);
    expect(aimLeft.presentation.keeperDiveRng).toBe(true);
  });

  it('keeps automatic direct free kicks on the existing wall/save/miss/goal model', () => {
    const setPiece = deriveAuthoritativeSetPiece(prepared({ packet:packet({ chance:.07 }) }));
    const blocked = resolveDirectFreeKickOutcome({
      setPiece,
      shooter:player('fk-taker', 'CAM', 84),
      defenders:prepared().defenders,
      packet:packet({ chance:.07, assist:.01, shot:.70, finish:.10 }),
    });
    const goal = resolveDirectFreeKickOutcome({
      setPiece,
      shooter:player('fk-taker', 'CAM', 94),
      defenders:[player('gk', 'GK', 70), ...prepared().defenders.slice(1)],
      packet:packet({ chance:.07, assist:.99, shot:.20, finish:.01 }),
    });

    expect(blocked.finish).toBe('blocked');
    expect(blocked.restart).toBe('defensive_restart');
    expect(blocked.presentation.blockerId).toBeTruthy();
    expect(goal.finish).toBe('goal');
    expect(goal.restart).toBe('kickoff');
  });

  it('keeps a well-executed top-corner free kick in the scoring zone despite execution spread', () => {
    const base = prepared({ packet:packet({ chance:.07, target:.50 }) });
    const setPiece = deriveAuthoritativeSetPiece(base);
    const difficultPacket = packet({ chance:.07, assist:.01, shot:0, finish:0 });
    const shot = resolveDirectFreeKickOutcome({
      setPiece,
      shooter:player('fk-taker', 'CAM', 90),
      defenders:base.defenders,
      packet:difficultPacket,
      intent:{ attack:{ aimX:.82, aimY:.84, power:.70, timing:.96, curve:-.55 } },
    });

    expect(isPlayableTopCornerTarget(shot.presentation.target)).toBe(true);
    expect(shot.finish).toBe('goal');
    expect(shot.presentation.wallCleared).toBe(true);
    expect(shot.presentation.curve).toBe(-.55);
  });

  it('allows a curved on-target free kick outside the exact top-corner gate to clear the wall and beat a committed keeper', () => {
    const base = prepared({ packet:packet({ chance:.07, target:.50 }) });
    const setPiece = deriveAuthoritativeSetPiece(base);
    const curved = resolveDirectFreeKickOutcome({
      setPiece,
      shooter:player('fk-taker', 'CAM', 90),
      defenders:base.defenders,
      packet:packet({ chance:.07, assist:.99, shot:.50, finish:.50, defender:.10, actor:.50, target:.50 }),
      intent:{ attack:{ aimX:.56, aimY:.66, power:.72, timing:.98, curve:.65 } },
    });

    expect(isPlayableTopCornerTarget(curved.presentation.target)).toBe(false);
    expect(curved.presentation.wallCleared).toBe(true);
    expect(curved.presentation.curve).toBe(.65);
    expect(['inside','outside']).toContain(curved.presentation.kickStyle);
    expect(curved.finish).toBe('goal');
  });

  it('maps mirrored free-kick curl to different inside and outside strike techniques', () => {
    const base = prepared({ packet:packet({ chance:.07, target:.50 }) });
    const setPiece = deriveAuthoritativeSetPiece(base);
    const resolverPacket = packet({ chance:.07, assist:.99, shot:.50, finish:.50, defender:.50, actor:.50, target:.50 });
    const leftCurl = resolveDirectFreeKickOutcome({
      setPiece,
      shooter:player('fk-taker', 'CAM', 90),
      defenders:base.defenders,
      packet:resolverPacket,
      intent:{ attack:{ aimX:.56, aimY:.66, power:.72, timing:.98, curve:-.65 } },
    });
    const rightCurl = resolveDirectFreeKickOutcome({
      setPiece,
      shooter:player('fk-taker', 'CAM', 90),
      defenders:base.defenders,
      packet:resolverPacket,
      intent:{ attack:{ aimX:.56, aimY:.66, power:.72, timing:.98, curve:.65 } },
    });

    expect(new Set([leftCurl.presentation.kickStyle, rightCurl.presentation.kickStyle])).toEqual(new Set(['inside','outside']));
    expect(leftCurl.presentation.curve).toBe(-rightCurl.presentation.curve);
  });

  it('projects penalties and free kicks into attacking-only geometry with the free-kick wall intact', () => {
    const penaltyPrepared = prepared({ packet:packet({ chance:.01 }) });
    penaltyPrepared.setPiece = deriveAuthoritativeSetPiece(penaltyPrepared);
    penaltyPrepared.shooter = penaltyPrepared.attackers.find(item => item.id === penaltyPrepared.setPiece.takerId);
    penaltyPrepared.xg = penaltyPrepared.setPiece.xg;
    penaltyPrepared.chance = 'set_piece';

    const freeKickPrepared = prepared({ packet:packet({ chance:.07, target:.82 }) });
    freeKickPrepared.setPiece = deriveAuthoritativeSetPiece(freeKickPrepared);
    freeKickPrepared.shooter = freeKickPrepared.attackers.find(item => item.id === freeKickPrepared.setPiece.takerId);
    freeKickPrepared.xg = freeKickPrepared.setPiece.xg;
    freeKickPrepared.chance = 'set_piece';

    const penalty = buildPlayableMoment(penaltyPrepared, 'home');
    const freeKick = buildPlayableMoment(freeKickPrepared, 'home');

    expect(penalty.mode).toBe('attack');
    expect(penalty.geometry.staging.variant).toBe('penalty');
    expect(penalty.geometry.distance).toBe(11);
    expect(penalty.geometry.wall).toBeNull();
    expect(penalty.geometry.legalActions).toEqual({ attack:['aim','power','timing'] });
    expect(freeKick.mode).toBe('attack');
    expect(freeKick.geometry.staging.variant).toBe('direct_free_kick');
    expect(freeKick.geometry.wall.members.map(member => member.id)).toEqual(freeKickPrepared.setPiece.wall.members.map(member => member.id));
    expect(freeKick.geometry.continuousLocomotion).toBe(false);
    expect(freeKick.geometry.legalActions).toEqual({ attack:['aim','power','timing','curve'] });
  });
});
