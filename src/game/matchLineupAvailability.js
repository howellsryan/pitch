import { selectEleven } from '../modules/matchEngine.js';
import { isSeniorEligiblePlayer } from '../modules/playerStatus.js';

/** Null means engine-selected; an explicit XI retains the manager's choices. */
export function lineupAvailability(userLineup, userPlayers = [], formation = '4-3-3') {
  const seniorPlayers = userPlayers.filter(player => isSeniorEligiblePlayer(player));
  const lineup = userLineup == null
    ? selectEleven(seniorPlayers, formation, null).map(player => player.id)
    : Array.isArray(userLineup) ? userLineup : [];
  const injuredInLineup = userPlayers.filter(player => player.injured && lineup.includes(player.id));
  const suspendedInLineup = userPlayers.filter(player => player.suspended && lineup.includes(player.id));
  const lineupIncomplete = lineup.length !== 11 || new Set(lineup).size !== 11
    || lineup.some(playerId => !seniorPlayers.some(player => player.id === playerId));
  return {
    injuredInLineup, suspendedInLineup, lineupIncomplete,
    lineupBlocked:injuredInLineup.length > 0 || suspendedInLineup.length > 0 || lineupIncomplete,
  };
}
