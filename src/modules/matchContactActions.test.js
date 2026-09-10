import { describe, expect, it } from 'vitest';
import {
  MATCH_CONTACT_ACTION_VERSION,
  MATCH_CONTACT_TYPES,
  buildContactPlayableGeometry,
  classifyGoalkeeperIntervention,
  derivePlayableContactAction,
  normalizeContactIntent,
  resolveContactShotOutcome,
} from './matchContactActions.js';

function player(id, position, rating = 78, overrides = {}) {
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:94,
    form:50,
    individualMorale:50,
    sharpness:50,
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:rating,
      shooting:rating,
      passing:rating,
      dribbling:rating,
      defending:rating,
      physical:rating,
      ...(overrides.attributeProfile ?? {}),
    },
    ...overrides,
  };
}

function packet(overrides = {}) {
  return {
    version:1,
    possession:.2, route:.5, actor:.4, target:.4, defender:.4,
    execution:.18, outcome:.9, chance:.08, shooter:.4, shot:.45,
    finish:.52, assist:.4, discipline:.8, injury:.8,
    ...overrides,
  };
}

function preparedFor(family, phase = 1, rating = 82) {
  const shooter = player('receiver', 'ST', rating);
  const passer = player('passer', family === 'cross' || family === 'cutback' ? 'RW' : 'CAM', rating);
  const defender = player('defender', 'CB', 79);
  const goalkeeper = player('keeper', 'GK', 80);
  return {
    version:1,
    phase,
    minute:Math.ceil(phase * .75),
    teamId:'home',
    opponentTeamId:'away',
    packet:packet(),
    attackers:[passer, shooter],
    defenders:[defender, goalkeeper],
    actor:passer,
    target:shooter,
    defender,
    continuationAction:{
      version:1,
      family,
      phase,
      attackingTeamId:'home',
      defendingTeamId:'away',
      passerId:passer.id,
      receiverId:shooter.id,
    },
  };
}

function continuationFor(prepared, xg = .24) {
  return {
    version:1,
    family:prepared.continuationAction.family,
    success:true,
    outcome:'chance_created',
    passerId:prepared.actor.id,
    receiverId:prepared.target.id,
    interceptorId:prepared.defender.id,
    downstreamChance:{
      shooterId:prepared.target.id,
      assistId:prepared.actor.id,
      pressureDefenderId:prepared.defender.id,
      xg,
      chanceProbability:.32,
    },
  };
}

function findContact(family, wanted = null) {
  for (let phase = 1; phase <= 240; phase += 1) {
    const prepared = preparedFor(family, phase);
    const action = derivePlayableContactAction(prepared, continuationFor(prepared));
    if (action && (!wanted || action.type === wanted)) return { prepared, action };
  }
  throw new Error(`No ${wanted ?? 'contact'} found for ${family}`);
}

describe('Phase 6 authoritative contact preparation', () => {
  it('never manufactures a contact when the upstream continuation fails or creates no chance', () => {
    const prepared = preparedFor('cross');
    expect(derivePlayableContactAction(prepared, { ...continuationFor(prepared), success:false, downstreamChance:null })).toBeNull();
    expect(derivePlayableContactAction(prepared, { ...continuationFor(prepared), downstreamChance:null })).toBeNull();
  });

  it('covers all four contact families from deterministic engine-owned context', () => {
    const standing = findContact('cross', 'standing_header').action;
    const running = findContact('cross', 'running_header').action;
    const volley = findContact('cutback', 'volley').action;
    const halfVolley = findContact('cutback', 'half_volley').action;

    expect([standing.type, running.type, volley.type, halfVolley.type].sort()).toEqual([...MATCH_CONTACT_TYPES].sort());
    for (const action of [standing, running, volley, halfVolley]) {
      expect(action.version).toBe(MATCH_CONTACT_ACTION_VERSION);
      expect(action.shooterId).toBe('receiver');
      expect(action.pressureDefenderId).toBe('defender');
      expect(action.xg).toBeGreaterThan(0);
      expect(action).not.toHaveProperty('finish');
      expect(action).not.toHaveProperty('shot');
    }
  });

  it('builds pre-finish contact geometry with the authoritative contact height and no locomotion control', () => {
    const { action } = findContact('cross', 'running_header');
    const geometry = buildContactPlayableGeometry(action);
    expect(geometry.staging.contactType).toBe('running_header');
    expect(geometry.staging.contactHeight).toBe(action.contactHeight);
    expect(geometry.ball.y).toBe(action.contactHeight);
    expect(geometry.continuousLocomotion).toBe(false);
    expect(geometry.legalActions.attack).toEqual(['aim','power','timing']);
  });
});

describe('Phase 6 contact input and resolution', () => {
  it('clamps contact input without accepting an actor/contact override', () => {
    expect(normalizeContactIntent({
      attack:{ aimX:9, aimY:-8, power:3, timing:-2, contactType:'goal' },
      goalkeeper:{ x:-9, y:4, timing:2 },
      shooterId:'invented',
    })).toEqual({
      version:1,
      attack:{ aimX:1.25, aimY:-.2, power:1, timing:0 },
      goalkeeper:{ x:-1, y:1, timing:1 },
    });
  });

  it('rejects participant substitution even when the submitted intent is otherwise valid', () => {
    const { prepared, action } = findContact('cutback', 'volley');
    expect(() => resolveContactShotOutcome({
      action,
      shooter:player('invented', 'ST', 99),
      defender:prepared.defender,
      defenders:prepared.defenders,
      packet:prepared.packet,
      intent:{ attack:{ aimX:0, aimY:.5, power:.7, timing:.9 } },
    })).toThrow('participants do not match authoritative action');
  });

  it('keeps visibly wide contact input from becoming a goal', () => {
    const { prepared, action } = findContact('cutback', 'half_volley');
    const result = resolveContactShotOutcome({
      action,
      shooter:prepared.target,
      defender:prepared.defender,
      defenders:prepared.defenders,
      packet:packet({ outcome:.99, shot:.5, finish:.5 }),
      intent:{ attack:{ aimX:1.25, aimY:.5, power:action.preferredPower, timing:1 } },
    });
    expect(result.goal).toBe(false);
    expect(result.finish).toBe('missed');
    expect(result.contactType).toBe(action.type);
  });

  it('keeps canonical player quality causal under the same contact intent and packet', () => {
    const elitePrepared = preparedFor('cutback', 12, 94);
    const weakPrepared = preparedFor('cutback', 12, 52);
    const eliteAction = derivePlayableContactAction(elitePrepared, continuationFor(elitePrepared));
    const weakAction = eliteAction && {
      ...eliteAction,
      shooterId:weakPrepared.target.id,
      pressureDefenderId:weakPrepared.defender.id,
    };
    expect(eliteAction).toBeTruthy();

    const commonPacket = packet({ outcome:.99, shot:.77, finish:.79 });
    const intent = { attack:{ aimX:.45, aimY:.68, power:eliteAction.preferredPower, timing:.96 } };
    const elite = resolveContactShotOutcome({
      action:eliteAction, shooter:elitePrepared.target, defender:elitePrepared.defender,
      defenders:elitePrepared.defenders, packet:commonPacket, intent,
    });
    const weak = resolveContactShotOutcome({
      action:weakAction, shooter:weakPrepared.target, defender:weakPrepared.defender,
      defenders:weakPrepared.defenders, packet:commonPacket, intent,
    });

    expect(elite.contactAbility).toBeGreaterThan(weak.contactAbility);
    expect(elite.presentation.target.executionQuality).toBeGreaterThan(weak.presentation.target.executionQuality);
  });
});

describe('Phase 6 goalkeeper intervention authority', () => {
  it('classifies only saves and never changes the governing finish', () => {
    expect(classifyGoalkeeperIntervention({ finish:'goal', target:{ x:0, y:.2 } })).toBeNull();
    expect(classifyGoalkeeperIntervention({ finish:'missed', target:{ x:0, y:.2 } })).toBeNull();
  });

  it('distinguishes smother, spread, catch and parry from authoritative save context', () => {
    expect(classifyGoalkeeperIntervention({
      finish:'saved', target:{ x:.1, y:.12 }, power:.62, xg:.22, goalkeeping:82,
    })).toBe('smother');
    expect(classifyGoalkeeperIntervention({
      finish:'saved', target:{ x:.58, y:.34 }, power:.78, xg:.36, goalkeeping:82, keeper:{ x:.55 }, contactType:'half_volley',
    })).toBe('spread');
    expect(classifyGoalkeeperIntervention({
      finish:'saved', target:{ x:.15, y:.48 }, power:.48, xg:.12, goalkeeping:92,
    })).toBe('catch');
    expect(classifyGoalkeeperIntervention({
      finish:'saved', target:{ x:.88, y:.82 }, power:.92, xg:.18, goalkeeping:78,
    })).toBe('parry');
  });
});
