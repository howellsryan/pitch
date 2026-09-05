import { describe, expect, it } from 'vitest';
import {
  LEGACY_MATCH_EVENT_TYPES,
  MATCH_ACTION_ATTRIBUTES,
  MATCH_ACTION_DEFINITIONS,
  MATCH_ACTION_OUTCOMES,
  MATCH_ACTION_VOCABULARY_VERSION,
  MATCH_LEDGER_EVENT_TYPES,
} from './matchActionVocabulary.js';

describe('match action vocabulary', () => {
  it('has stable unique identifiers and only references declared values', () => {
    const ids = MATCH_ACTION_DEFINITIONS.map((definition) => definition.id);
    expect(MATCH_ACTION_VOCABULARY_VERSION).toBe(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(MATCH_ACTION_ATTRIBUTES).size).toBe(MATCH_ACTION_ATTRIBUTES.length);
    expect(new Set(MATCH_ACTION_OUTCOMES).size).toBe(MATCH_ACTION_OUTCOMES.length);
    expect(ids).toEqual([
      'circulation',
      'direct_pass',
      'pass_into_space',
      'carry',
      'wide_delivery',
      'aerial_duel',
      'shot',
      'high_press',
      'interception_tackle',
      'recovery_defence',
      'attacking_set_piece',
    ]);

    for (const definition of MATCH_ACTION_DEFINITIONS) {
      expect(definition.stage).toMatch(/^(control|progression|chance|finish|defence|restart)$/);
      expect(definition.actorState).toMatch(/^(in_possession|out_of_possession)$/);
      expect(definition.actorAttributes.length).toBeGreaterThan(0);
      expect(definition.counterAttributes.length).toBeGreaterThan(0);
      expect(definition.outcomes.length).toBeGreaterThan(0);
      expect(definition.actorAttributes.every((attribute) => MATCH_ACTION_ATTRIBUTES.includes(attribute))).toBe(true);
      expect(definition.counterAttributes.every((attribute) => MATCH_ACTION_ATTRIBUTES.includes(attribute))).toBe(true);
      expect(definition.outcomes.every((outcome) => MATCH_ACTION_OUTCOMES.includes(outcome))).toBe(true);
    }
  });

  it('keeps current engine events separate from the planned ledger categories', () => {
    expect(LEGACY_MATCH_EVENT_TYPES).toEqual(['goal', 'yellow', 'injury', 'sub']);
    expect(MATCH_LEDGER_EVENT_TYPES).toEqual([
      'phase', 'action', 'chance', 'shot', 'restart', 'discipline', 'injury', 'substitution',
    ]);
  });
});
