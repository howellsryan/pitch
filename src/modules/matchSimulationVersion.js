export const MATCH_SIMULATION_VERSION_FIELDS = Object.freeze([
  'matchEngineVersion',
  'actionResolverVersion',
  'actionLedgerVersion',
  'rngPacketVersion',
]);

function versionTuple(source) {
  return Object.fromEntries(MATCH_SIMULATION_VERSION_FIELDS.map(field => [field, source?.[field]]));
}

function tupleLabel(tuple) {
  return MATCH_SIMULATION_VERSION_FIELDS.map(field => `${field}=${String(tuple?.[field])}`).join(', ');
}

/**
 * Validate a live match state's simulation contract before it advances.
 *
 * Historical/manual aggregate states with no version fields keep their legacy
 * compatibility path. Once any version field is present, however, the tuple is
 * authoritative: it must be complete and exactly supported by the loaded
 * simulator. This prevents a started/resumed state from being silently relabelled
 * as a newer engine during segmented play.
 */
export function validateMatchSimulationVersion(liveState, expectedVersions) {
  const incoming = versionTuple(liveState);
  const expected = versionTuple(expectedVersions);
  const present = MATCH_SIMULATION_VERSION_FIELDS.filter(field => incoming[field] != null);

  if (present.length === 0) return { legacy:true, versions:null };

  if (present.length !== MATCH_SIMULATION_VERSION_FIELDS.length) {
    const missing = MATCH_SIMULATION_VERSION_FIELDS.filter(field => incoming[field] == null);
    throw new Error(`Unsupported match simulation version: incomplete version tuple (missing ${missing.join(', ')}).`);
  }

  const unsupported = MATCH_SIMULATION_VERSION_FIELDS.filter(field => incoming[field] !== expected[field]);
  if (unsupported.length) {
    throw new Error(
      `Unsupported match simulation version: state [${tupleLabel(incoming)}], loaded simulator [${tupleLabel(expected)}]. Start a new fixture with the current simulator.`,
    );
  }

  return { legacy:false, versions:incoming };
}
