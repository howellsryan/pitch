/**
 * Stable vocabulary for the future attribute-driven action ledger.
 *
 * T0 deliberately does not import this module into the live match engine. It
 * gives later slices one reviewed language for actions and events without
 * changing the P2 outcome stream or the legacy bundle order.
 */

export const MATCH_ACTION_VOCABULARY_VERSION = 1;

export const MATCH_ACTION_ATTRIBUTES = Object.freeze([
  'pace',
  'shooting',
  'passing',
  'dribbling',
  'defending',
  'physical',
  'goalkeeping',
]);

export const MATCH_ACTION_OUTCOMES = Object.freeze([
  'retain',
  'progress',
  'turnover',
  'foul_won',
  'foul_committed',
  'possession_won',
  'press_bypassed',
  'challenge_missed',
  'intercepted',
  'blocked',
  'corner_won',
  'second_ball',
  'chance_created',
  'chance_conceded',
  'missed',
  'saved',
  'goal',
  'cleared',
]);

export const MATCH_ACTION_DEFINITIONS = Object.freeze([
  {
    id: 'circulation',
    stage: 'control',
    actorState: 'in_possession',
    actorAttributes: ['passing', 'dribbling', 'physical'],
    counterAttributes: ['defending', 'physical', 'pace'],
    outcomes: ['retain', 'progress', 'turnover', 'foul_won'],
  },
  {
    id: 'direct_pass',
    stage: 'progression',
    actorState: 'in_possession',
    actorAttributes: ['passing', 'pace', 'physical'],
    counterAttributes: ['defending', 'pace', 'physical'],
    outcomes: ['progress', 'intercepted', 'turnover', 'foul_won'],
  },
  {
    id: 'pass_into_space',
    stage: 'progression',
    actorState: 'in_possession',
    actorAttributes: ['passing', 'pace'],
    counterAttributes: ['defending', 'pace', 'physical'],
    outcomes: ['chance_created', 'intercepted', 'turnover'],
  },
  {
    id: 'carry',
    stage: 'progression',
    actorState: 'in_possession',
    actorAttributes: ['dribbling', 'pace', 'physical'],
    counterAttributes: ['defending', 'physical', 'pace'],
    outcomes: ['progress', 'turnover', 'foul_won', 'chance_created'],
  },
  {
    id: 'wide_delivery',
    stage: 'chance',
    actorState: 'in_possession',
    actorAttributes: ['passing', 'dribbling', 'pace'],
    counterAttributes: ['defending', 'pace', 'physical'],
    outcomes: ['blocked', 'corner_won', 'chance_created', 'turnover'],
  },
  {
    id: 'aerial_duel',
    stage: 'chance',
    actorState: 'in_possession',
    actorAttributes: ['physical', 'shooting', 'pace'],
    counterAttributes: ['defending', 'physical', 'goalkeeping'],
    outcomes: ['chance_created', 'cleared', 'foul_won', 'turnover'],
  },
  {
    id: 'shot',
    stage: 'finish',
    actorState: 'in_possession',
    actorAttributes: ['shooting', 'physical'],
    counterAttributes: ['defending', 'goalkeeping'],
    outcomes: ['missed', 'blocked', 'saved', 'goal'],
  },
  {
    id: 'high_press',
    stage: 'defence',
    actorState: 'out_of_possession',
    actorAttributes: ['defending', 'physical', 'pace'],
    counterAttributes: ['passing', 'dribbling', 'physical'],
    outcomes: ['possession_won', 'press_bypassed', 'foul_committed'],
  },
  {
    id: 'interception_tackle',
    stage: 'defence',
    actorState: 'out_of_possession',
    actorAttributes: ['defending', 'pace', 'physical'],
    counterAttributes: ['passing', 'dribbling', 'pace'],
    outcomes: ['possession_won', 'challenge_missed', 'foul_committed'],
  },
  {
    id: 'recovery_defence',
    stage: 'defence',
    actorState: 'out_of_possession',
    actorAttributes: ['defending', 'pace', 'physical'],
    counterAttributes: ['pace', 'dribbling', 'physical'],
    outcomes: ['intercepted', 'blocked', 'cleared', 'chance_conceded'],
  },
  {
    id: 'attacking_set_piece',
    stage: 'restart',
    actorState: 'in_possession',
    actorAttributes: ['passing', 'physical', 'shooting'],
    counterAttributes: ['defending', 'physical', 'goalkeeping'],
    outcomes: ['cleared', 'second_ball', 'chance_created', 'goal'],
  },
]);

// The planned ledger uses broad record categories. These are not claims that
// the current engine already emits the new action records.
export const MATCH_LEDGER_EVENT_TYPES = Object.freeze([
  'phase',
  'action',
  'chance',
  'shot',
  'restart',
  'discipline',
  'injury',
  'substitution',
]);

// T0 freezes the event names consumed by current Quick Sim/Broadcast code.
export const LEGACY_MATCH_EVENT_TYPES = Object.freeze(['goal', 'yellow', 'injury', 'sub']);
