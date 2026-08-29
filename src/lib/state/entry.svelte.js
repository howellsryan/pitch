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
 * So the island stays inert until boot() flips this, rather than probing the
 * database on its own clock. It doubles as the cost gate: building the picker
 * walks 186 rosters and resolves an accent per distinct shirt colour, which a
 * returning player should never pay for.
 */
export const entryState = $state({ showing: false });
