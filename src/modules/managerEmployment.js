import { getManager, getSave } from './db.js';

/** userTeamId also projects a former club's competitions while between jobs. */
export function canManageClub(save, manager) {
  if (!save || save._deleted || !save.userTeamId) return false;
  // Pre-P6 careers are playable while the normal manager backfill completes.
  if (!save.userManagerId) return !save.sacked && !save.dismissed;
  return manager?.status === 'employed'
    && String(manager.id) === String(save.userManagerId)
    && String(manager.currentClubId ?? '') === String(save.userTeamId);
}

/** Validate the persisted manager at a command boundary, never UI state. */
export async function requireClubEmployment(saveInput = null) {
  const save = saveInput ?? await getSave();
  if (!save || save._deleted) throw new Error('NO_ACTIVE_SAVE');
  const manager = save.userManagerId ? await getManager(save.userManagerId) : null;
  if (!canManageClub(save, manager)) throw new Error('MANAGER_NOT_EMPLOYED');
  return save;
}
