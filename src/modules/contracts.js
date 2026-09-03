import { addTransfer, getPlayer, getSave, getTeam, putPlayer, putSave, putTeam } from './db.js';
import { applyLedgerMovement } from './clubFinance.js';

/**
 * Contract termination is a release, not a transfer. The managed club pays
 * every remaining weekly salary in the current deal and the same canonical
 * player row moves into the shared free-agent pool.
 */
export function remainingContractWeeks(player, save) {
  const currentYear = Number.parseInt(String(save?.season ?? '').split('/')[0], 10) || 0;
  // Pre-contract saves historically treat a missing expiry as two years left;
  // termination must preserve that compatibility rather than permit a free release.
  const expiryYear = player?.contractExpiry == null ? currentYear + 2 : Number(player.contractExpiry);
  if (!Number.isFinite(expiryYear) || expiryYear <= currentYear) return 0;

  const weeksPerSeason = Math.max(1, Number(save?.worldTotalGameweeks ?? save?.totalGameweeks ?? 38) || 38);
  const currentWeek = Math.max(1, Number(save?.currentGameweek ?? 1) || 1);
  const currentSeasonWeeks = Math.max(0, weeksPerSeason - currentWeek + 1);
  const futureFullSeasons = Math.max(0, expiryYear - currentYear - 1);
  return currentSeasonWeeks + futureFullSeasons * weeksPerSeason;
}

export function contractTerminationQuote(player, save) {
  const weeks = remainingContractWeeks(player, save);
  const weeklyWage = Math.max(0, Math.round(Number(player?.wage) || 0));
  return { weeks, weeklyWage, payout:weeks * weeklyWage };
}

export function releasePlayerToFreeAgency(player) {
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

export async function terminateManagedPlayerContract(playerId) {
  const [save, player] = await Promise.all([getSave(), getPlayer(playerId)]);
  if (!save || !player || String(player.teamId) !== String(save.userTeamId)) throw new Error('PLAYER_NOT_IN_SQUAD');
  if (player.onLoan || player.loanedFrom) throw new Error('PLAYER_ON_LOAN');

  const team = await getTeam(save.userTeamId);
  if (!team) throw new Error('TEAM_NOT_FOUND');

  const quote = contractTerminationQuote(player, save);
  const releasedPlayer = releasePlayerToFreeAgency(player);
  const updatedTeam = applyLedgerMovement(team, {
    category:'contract_termination',
    amount:-quote.payout,
    description:`Contract termination: ${player.name}`,
    weekKey:`${save.season}:${save.currentGameweek ?? 1}`,
  });

  const playerRoles = { ...(save.playerRoles ?? {}) };
  delete playerRoles[player.id];
  const updatedSave = {
    ...save,
    lineup:Array.isArray(save.lineup) ? save.lineup.filter(id => String(id) !== String(player.id)) : save.lineup,
    playerRoles,
  };

  // IndexedDB does not expose a generic cross-store transaction helper here.
  // Keep the writes adjacent and compensate the two authoritative records if
  // a later write fails, so a failed release cannot silently charge the club.
  try {
    await putTeam(updatedTeam);
    await putPlayer(releasedPlayer);
    await putSave(updatedSave);
    await addTransfer({
      playerId:player.id,
      playerName:player.name,
      fromTeamId:save.userTeamId,
      toTeamId:'free_agents',
      fee:0,
      payout:quote.payout,
      type:'contract_termination',
      date:save.currentDate,
    });
  } catch (error) {
    await Promise.allSettled([putTeam(team), putPlayer(player), putSave(save)]);
    throw error;
  }

  return { success:true, player:releasedPlayer, payout:quote.payout, weeks:quote.weeks };
}
