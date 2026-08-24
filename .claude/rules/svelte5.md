# Svelte 5 (runes) — house rules

Models reliably emit Svelte 4 syntax from memory. This file exists so that
mistake is caught by review and by `eslint-plugin-svelte` in CI, before the
codebase accumulates two dialects. `svelte.config.mjs` sets
`compilerOptions.runes: true`, so legacy syntax is a build error, not a warning.

## Use

| Concern | Svelte 5 (use this) |
|---|---|
| Local state | `let count = $state(0)` |
| Derived value | `const doubled = $derived(count * 2)` |
| Side effect | `$effect(() => { … })` |
| Props | `let { player, onSelect } = $props()` |
| Two-way prop | `let { value = $bindable() } = $props()` |
| Event handler | `onclick={handler}` — a normal attribute |
| Content slot | `{@render children?.()}` with `let { children } = $props()` |

## Never

- `export let foo` for props → `$props()`
- `$:` reactive statements → `$derived` / `$effect`
- `on:click` → `onclick`
- `<slot />` → `{@render children?.()}`
- `createEventDispatcher` → pass callback props (`onSelect`)
- Writable stores for component-local state → `$state`

## Project-specific

- **`modules/` stays DOM-free.** A component may import from `src/modules/`;
  `src/modules/` may never import a component or touch `document`. That
  boundary is why this is a UI rebuild and not a rewrite.
- **Anything that computes rather than renders belongs in `src/game/`**, not in
  a component — the substitution rules (GK↔GK, outfield↔outfield, 3-sub limit)
  are the standard example.
- **The Play button pops exactly one event off `save.pendingEvents`.** It does
  not advance a gameweek. A design that simulates a whole week in one tap
  silently breaks cups and Europe.
- **Reordering lists get `animate:flip`** — the league table after a gameweek is
  the reason Svelte was chosen.
- **The club accent is `var(--color-club)`**, set at runtime by
  `src/lib/theme.mjs`. Never hard-code a club's hex, and never use the accent
  to mean "good" — green (`--color-live`) is the only semantic positive.
