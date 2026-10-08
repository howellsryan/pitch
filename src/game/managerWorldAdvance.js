import { getManager, getSave } from '../modules/db.js';
import { advanceOneFixture } from '../modules/gameweek.js';
import { canManageClub } from '../modules/managerEmployment.js';

/** Drain the normal one-event queue to its next world-week boundary. */
export async function advanceUnemployedWorldWeek({
  readSave = getSave, readManager = getManager, advance = advanceOneFixture,
} = {}) {
  let save = await readSave();
  if (!save || save._deleted) throw new Error('NO_ACTIVE_SAVE');
  let manager = save.userManagerId ? await readManager(save.userManagerId) : null;
  if (canManageClub(save, manager)) throw new Error('MANAGER_ALREADY_EMPLOYED');
  const season = save.season;
  const gameweek = save.currentGameweek;
  for (let resolved = 0; resolved < 100; resolved++) {
    const pendingBefore = JSON.stringify(save.pendingEvents ?? []);
    await advance();
    save = await readSave();
    if (!save || save._deleted) throw new Error('NO_ACTIVE_SAVE');
    if (save.season !== season || save.currentGameweek !== gameweek) return save;
    manager = save.userManagerId ? await readManager(save.userManagerId) : null;
    if (canManageClub(save, manager)) return save;
    if (JSON.stringify(save.pendingEvents ?? []) === pendingBefore) throw new Error('WORLD_WEEK_DID_NOT_ADVANCE');
  }
  throw new Error('WORLD_WEEK_DID_NOT_ADVANCE');
}
