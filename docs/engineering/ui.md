# UI and product contracts

Read for UI changes, together with ../../.claude/rules/svelte5.md.
Paths are repository-relative.

## 2) UI / product boundaries

- `src/lib/ui/` contains real Svelte 5 components mounted from `src/main.js`; avoid new screen-level `innerHTML` renderers.
- Entry/new-career UI lives in `EntryScreen.svelte`; saved-career selection lives in `CareerMenu.svelte`; living-world table/profile inspection lives in `LeagueScreen.svelte`.
- `EntryScreen` remains mounted behind the game shell and is reused for P0 New Career. Busy/loading state must therefore be reset after successful transitions, not only on errors.
- Mobile navigation and the main game surfaces are already redesigned. Do not reopen R0-R7 visual decisions incidentally during gameplay-system work.
- Any new/restyled surface must be verified from an actual rendered screenshot at the affected viewport; CSS reading correctly is not visual verification.
- Preserve accessibility basics: 44px touch targets where applicable, focus-visible states, reduced-motion support, readable contrast, safe-area spacing.
- P3 player state enriches existing Squad/Market/Academy surfaces rather than creating permanent dashboard clutter.

