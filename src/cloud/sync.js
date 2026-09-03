// Cloud-save push/pull. P0 scopes every operation to the stable active
// career slot so syncing one career can never overwrite another one.
import {
  buildCloudSaveBlob,
  deleteCareerSlot,
  getActiveSlotId,
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

export async function pullAndApplyCloudSave(slotId = getActiveSlotId()) {
  if (!isSignedIn()) return { applied:false, reason:'signed_out' };
  try {
    const res = await api.getSave(slotId);
    if (!res?.save?.save_blob) return { applied:false, reason:'no_cloud_save', slotId };
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
