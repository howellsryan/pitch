/**
 * Whether the entry route is the screen the player is actually looking at.
 *
 * boot() (src/ui/renderers.js) owns that decision — it may still be awaiting a
 * cloud-save pull when the island mounts (src/cloud/sync.js), and until that
 * settles there may yet turn out to be a career. EntryScreen must not offer a
 * "start a career" button during that window: a career started underneath the
 * pull gets overwritten by it, and boot() then reveals the shell a second
 * time, binding every [data-nav] handler twice.
 *
 * R7 also makes the title route reachable from Settings without deleting the
 * active career. `hasSave` lets the title/menu layer offer Continue while the
 * normal club picker remains the cold-start route only.
 *
 * P0 adds `newCareerRequested`: choosing New Career from the saved-career menu
 * reveals the existing picker without activating an empty IndexedDB slot.
 * EntryScreen creates the isolated slot only when the player actually starts
 * or imports a career, so abandoning/reloading the picker cannot hide an
 * existing career behind a blank active slot.
 */
export const entryState = $state({
  showing: false,
  hasSave: false,
  newCareerRequested: false,
});
