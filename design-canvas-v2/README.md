# design-canvas-v2 — total-redesign direction sketches

**Status: undecided. Nothing here is settled, and none of it is built.**

Candidate directions for a from-scratch redesign, requested explicitly as a total
redesign taking *no* inspiration from the current Broadcast Kit look
(`design-canvas/`, `docs/plan/02-design-system.md`). Those two remain the
authority on what ships today; this folder does not supersede them unless and
until a direction is picked.

Two rounds, on two canvas pages.

## Round 2 — the live candidates (`page-1`)

Round 1 was rejected as not ambitious enough, and correctly: four palettes rather
than four ideas. Round 2's three directions each change what the app fundamentally
*is*, and each one **moves** — the sketches carry real CSS animation, because
sitting still is most of what made round 1 read as dead.

| | Direction | The idea | Where it breaks |
|---|---|---|---|
| I | **Spine** | The career is one continuous timeline; home *is* the season, a rail of gameweeks you pull through. Horizontal is time, vertical drags up context — that replaces navigation. | The rail metaphor doesn't stretch to the market or the table; those become plain lists. Also the most engineering (momentum scroll + sheet layer + virtualised list, on mobile Safari). |
| II | **Broadcast** | The game is a televised match. Perspective pitch with a moving ball, a score bug that flies in, events as lower-thirds. Nav is one floating pill that fans out. | Heavy on a mid-range phone; needs a reduced-motion path that isn't just "nothing moves". A floating pill is less discoverable than a labelled bar. |
| III | **Chalk** | The pitch *is* the app — one persistent surface. Squad, tactics and team news collapse into one screen, and kickoff is the same pitch now live. Shortest click path of the three. | A pitch is a poor container for 3,014 transfer rows or a 20-row table, so those screens leave the metaphor. 42px player discs are near the touch floor. |

Each direction is three artboards: the entry/marketing page, its signature screen,
and a third chosen to stress-test it. `Main.dc.html` is Broadcast's matchday (the
canvas format requires a `Main`); it carries no more weight than the other two.

**Likely answer is a hybrid** — Chalk for squad/tactics, Broadcast for matchday,
Spine for home, plain fast lists for market and table. That is three metaphors in
one app and would need one palette and one type system unifying it, not stapling.

### Open questions blocking the build

1. **Light or dark by default.** All three round-2 directions are dark, which
   suits matchday and little else. A stranger opening the marketing page on a
   phone in daylight is the case for light-first with a dark match mode.
2. **How loud the club colour gets.** Spine drives everything off Arsenal red;
   Broadcast keeps club colour to the bug stripe and uses its own broadcast
   yellow. Louder feels personal, quieter keeps the design's own identity — and
   186 clubs includes white (Leeds, Fulham) and near-black (Newcastle), which
   need a contrast guard either way.

## Round 1 — kept for reference (`page-2`)

Four rejected directions: Editorial, Almanac, Boardroom, Floodlight. Kept visible
because the Editorial and Boardroom **type systems** are still the best thing
drawn so far for dense data, and whichever round-2 direction wins needs exactly
that for the market and the league table. They also set the floor.

## Shared across every sketch

- The marketing home page **is** the entry point. One primary action — choose a
  club — with no sign-up wall in front of it; returning players get "continue"
  beneath it.
- **Play is not a nav slot.** It sits on the card already on screen, one tap from
  landing. A deliberate departure from the current raised centre FAB.
- Club data is real (`src/data/plTeams.js`); gameweek, budget and the league slice
  are mid-season sample values.
- Every artboard carries a `prefers-reduced-motion` guard, and touch targets are
  held at 44px+.

## Rebuilding the canvas

The `.dc.html` files and `canvas.json` are the sources. The seeded `.html` is a
~2.5 MB build artifact and is gitignored — regenerate it with the `design`
skill's `seed-canvas.mjs`, then publish. Same convention as `design-canvas/`.

## Note on ui-ux-pro-max

The redesign was asked to use `nextlevelbuilder/ui-ux-pro-max-skill`. Running its
`--design-system` generator against this product returned "Minimalism & Swiss
Style / trust-blue + orange CTA / Outfit + Work Sans" — generic SaaS, and exactly
the templated look the redesign is trying to escape. This independently confirms
the warning already recorded in `docs/plan/02-design-system.md`: **use that skill
for UX, accessibility and touch data, never for taste.** Its guidance on target
size (WCAG 2.2 AA 24px web / 44pt iOS), 8px target spacing and focus appearance is
good and is being held to.
