# design-canvas-v2 — total-redesign direction sketches

**Status: undecided. Nothing here is settled, and none of it is built.**

Four candidate directions for a from-scratch redesign, requested explicitly as a
total redesign that takes *no* inspiration from the current Broadcast Kit look
(`design-canvas/`, `docs/plan/02-design-system.md`). Those two remain the
authority on what ships today; this folder does not supersede them unless and
until a direction is picked.

Each direction is two artboards — the marketing home page and the in-game
dashboard — because a direction that works on a landing page can still fail
under real data density (the league table, and Transfers' ~3,000 rows).

| | Direction | Shorthand |
|---|---|---|
| A | Editorial | Broadsheet sports desk — cream/ink, Instrument Serif, hard rules |
| B | Almanac | Sticker album — warm cream, keylines, offset shadow, Bricolage |
| C | Boardroom | Swiss data instrument — cool greys, hairlines, Chivo + Plex Mono |
| D | Floodlight | Stadium at night — green-black, sodium amber, Anton |

`Main.dc.html` is direction A (the canvas format requires a `Main`); it carries
no more weight than the other three.

All four share one information architecture, so the sketches isolate look and
feel:

- The marketing home page **is** the entry point. One primary action — choose a
  club — with no sign-up wall in front of it; returning players get "continue"
  beneath it.
- Five flat nav destinations (Home, Squad, Table, Market, Club). **Play is not a
  nav slot** — it sits on the card already on screen, one tap from landing. This
  is a deliberate departure from the current raised centre FAB.
- Club data is real (`src/data/plTeams.js`); gameweek, budget and the league
  slice are mid-season sample values.

## Rebuilding the canvas

The `.dc.html` files and `canvas.json` are the sources. The seeded
`.html` is a 2.5 MB build artifact and is gitignored — regenerate it with the
`design` skill's `seed-canvas.mjs`, then publish. Same convention as
`design-canvas/`.

## Note on ui-ux-pro-max

The redesign was asked to use `nextlevelbuilder/ui-ux-pro-max-skill`. Running its
`--design-system` generator against this product returned "Minimalism & Swiss
Style / trust-blue + orange CTA / Outfit + Work Sans" — generic SaaS, and exactly
the templated look the redesign is trying to escape. This independently confirms
the warning already recorded in `docs/plan/02-design-system.md`: **use that skill
for UX, accessibility and touch data, never for taste.** Its guidance on target
size (WCAG 2.2 AA 24px web / 44pt iOS), 8px target spacing and focus appearance
is good and is being held to.
