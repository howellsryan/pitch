import { STARTING_FREE_AGENT_NAMES } from '../data/startingFreeAgents.js';
import { getAllPlayers, getSave, putPlayersBulk, putSave } from './db.js';
import { selectEleven } from './matchEngine.js';

export { STARTING_FREE_AGENT_NAMES };

/**
 * Starting free agents are generated from the current roster source by
 * tools/refresh-player-data.mjs. Fresh careers only apply the list to names
 * already present in Pitch's canonical player dataset, so IDs/ratings remain
 * canonical and a player is never synthesized into an existing save.
 */
export function normalizeFreeAgentName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const STARTING_FREE_AGENT_KEYS = new Set(STARTING_FREE_AGENT_NAMES.map(normalizeFreeAgentName));

export function isVerifiedStartingFreeAgent(playerOrName) {
  const name = typeof playerOrName === 'string' ? playerOrName : playerOrName?.name;
  return STARTING_FREE_AGENT_KEYS.has(normalizeFreeAgentName(name));
}

export function prepareStartingFreeAgent(player) {
  return {
    ...player,
    teamId:'free_agents',
    contractExpiry:null,
    signedThisSeason:false,
    transferListed:false,
    inSquad:false,
    onLoan:false,
    loanedFrom:null,
    loanOriginalTeamId:null,
    loanSeason:null,
    squadRole:null,
    squadRoleSource:null,
    squadRoleTeamId:null,
    playingTimeAgreement:null,
  };
}

/**
 * Run exactly once from startNewGame after the canonical player rows exist.
 * Returns the actual intersection count, which is intentionally data-driven:
 * names absent from Pitch are ignored rather than synthesised.
 */
export async function seedVerifiedStartingFreeAgents() {
  const [save, players] = await Promise.all([getSave(), getAllPlayers()]);
  if (!save || !players.length) return { moved:0, playerIds:[] };

  const moved = players.filter(player => player.teamId !== 'free_agents' && isVerifiedStartingFreeAgent(player));
  if (!moved.length) return { moved:0, playerIds:[] };

  const movedIds = new Set(moved.map(player => String(player.id)));
  const preparedById = new Map(moved.map(player => [String(player.id), prepareStartingFreeAgent(player)]));
  await putPlayersBulk(moved.map(player => preparedById.get(String(player.id))));

  const nextRoles = { ...(save.playerRoles ?? {}) };
  for (const id of movedIds) delete nextRoles[id];

  const userPlayers = players
    .filter(player => String(player.teamId) === String(save.userTeamId) && !movedIds.has(String(player.id)))
    .map(player => preparedById.get(String(player.id)) ?? player);
  const nextXi = selectEleven(userPlayers, save.formation ?? '4-3-3', null).map(player => player.id);
  const lineupWasAffected = Array.isArray(save.lineup) && save.lineup.some(id => movedIds.has(String(id)));

  await putSave({
    ...save,
    playerRoles:nextRoles,
    lineup:lineupWasAffected ? (nextXi.length === 11 ? nextXi : null) : save.lineup,
    bench:Array.isArray(save.bench) ? save.bench.filter(id => !movedIds.has(String(id))) : save.bench,
    startingFreeAgentsSeeded:true,
  });

  return { moved:moved.length, playerIds:[...movedIds] };
}
