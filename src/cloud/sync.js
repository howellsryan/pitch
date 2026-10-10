// Cloud-save push/pull. P0 scopes every operation to the stable active
// career slot so syncing one career can never overwrite another one.
import {
  buildCloudSaveBlob,
  deleteCareerSlot,
  getActiveSlotId,
  getCareerSlotSummaries,
  getSave,
  restoreFromCloudBlob,
} from '../modules/db.js';
import { api, isSignedIn } from './api.js';

let activePush = null;
const deletingSlots = new Set();

export async function pushSaveToCloud() {
  if (!isSignedIn()) return { ok:false, reason:'signed_out' };
  if (activePush) return { ok:false, reason:'busy' };
  const slotId = getActiveSlotId();
  if (deletingSlots.has(slotId)) return { ok:false, reason:'deleting' };

  const promise = (async () => {
    try {
      const { blob, meta } = await buildCloudSaveBlob(slotId);
      const res = await api.putSave(slotId, blob, meta);
      return {
        ok:true,
        slotId,
        updatedAt:res?.updatedAt ?? null,
        saveRevision:res?.save_revision ?? null,
      };
    } catch (err) {
      return { ok:false, reason:err?.message || 'cloud_save_failed' };
    }
  })();
  activePush = { slotId, promise };
  try {
    return await promise;
  } finally {
    if (activePush?.promise === promise) activePush = null;
  }
}

export function cloudSaveCheckpoint() {
  if (!isSignedIn()) return;
  void pushSaveToCloud();
}

/**
 * Delete the remote row first. Removing IndexedDB first would let boot() pull
 * the still-existing cloud row straight back in on the following reload.
 */
export async function deleteCareerEverywhere(slotId = getActiveSlotId()) {
  deletingSlots.add(slotId);
  try {
    if (isSignedIn()) {
      if (activePush?.slotId === slotId) await activePush.promise;
      await api.deleteSave(slotId);
    }
    await deleteCareerSlot(slotId);
    return { ok:true, slotId };
  } finally {
    deletingSlots.delete(slotId);
  }
}

export async function pullAndApplyCloudSave(slotId = null) {
  if (!isSignedIn()) return { applied:false, reason:'signed_out' };
  const initialSlotId = getActiveSlotId();
  try {
    const localSave = await getSave();
    if (localSave && !localSave._deleted) return { applied:false, reason:'local_career_exists', slotId:initialSlotId };
    // New careers use generated IDs. A clean browser has only the default
    // legacy pointer, so discover the latest remote career before restoring.
    if (!slotId) {
      const slots = await listCloudCareerSlots();
      const latest = slots
        .filter(slot => typeof slot?.slotId === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(slot.slotId))
        .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0) || a.slotId.localeCompare(b.slotId))[0];
      slotId = latest?.slotId ?? initialSlotId;
    }
    const res = await api.getSave(slotId);
    if (!res?.save?.save_blob) return { applied:false, reason:'no_cloud_save', slotId };
    // Network waits must not let a late restore overwrite a career started
    // meanwhile, or an existing career in a different local slot.
    const freshSave = await getSave();
    const localSlots = await getCareerSlotSummaries();
    if (getActiveSlotId() !== initialSlotId || freshSave && !freshSave._deleted || localSlots.some(slot => slot.slotId === slotId)) {
      return { applied:false, reason:'local_career_exists', slotId };
    }
    const meta = await restoreFromCloudBlob(res.save.save_blob, slotId);
    return { applied:true, slotId, meta };
  } catch (err) {
    return { applied:false, reason:err?.message || 'cloud_pull_failed', slotId };
  }
}

export async function listCloudCareerSlots() {
  if (!isSignedIn()) return [];
  try {
    const res = await api.listSaves();
    return Array.isArray(res?.slots) ? res.slots : [];
  } catch {
    return [];
  }
}
