import { describe, expect, it } from 'vitest';
import {
  MATCH_SIMULATION_VERSION_FIELDS,
  validateMatchSimulationVersion,
} from './matchSimulationVersion.js';

const current = {
  matchEngineVersion:2,
  actionResolverVersion:2,
  actionLedgerVersion:1,
  rngPacketVersion:1,
};

describe('T7 live match simulation version contract', () => {
  it('accepts and preserves a complete supported tuple', () => {
    const state = { ...current, seed:123 };
    const result = validateMatchSimulationVersion(state, current);
    expect(result).toEqual({ legacy:false, versions:current });
    expect(state).toEqual({ ...current, seed:123 });
  });

  it('retains the historical compatibility path when no version field exists', () => {
    expect(validateMatchSimulationVersion({ seed:123 }, current)).toEqual({ legacy:true, versions:null });
  });

  it('rejects partially stamped state instead of guessing missing versions', () => {
    expect(() => validateMatchSimulationVersion({ matchEngineVersion:2 }, current))
      .toThrow(/incomplete version tuple/i);
  });

  it.each(MATCH_SIMULATION_VERSION_FIELDS)('rejects an unsupported %s instead of silently relabelling the state', field => {
    expect(() => validateMatchSimulationVersion({ ...current, [field]:999 }, current))
      .toThrow(/Unsupported match simulation version/);
  });
});
