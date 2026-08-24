# 02 — Design & UX

## The direction: settled

**Broadcast Kit.** Broadcast-graphics vocabulary carries the football identity; a
runtime club accent carries the career-mode identity.

Drafted across Home, Live match and Squad, with a club-theming study and two
alternates:

**https://claude.ai/code/artifact/ba8a8511-c76c-44cc-887c-13d8d1388465**

Sources live in `design-canvas/`. The mockups use real data out of pitch's own
CSVs — Arsenal's squad with actual ratings, potentials, ages and values; club
colours from `pl_teams.csv`.

The two alternates (**Matchday Programme**, **Scout Console**) sit on the canvas's
second page, low-fi, each with its honest trade-off. If either pulls harder, it
gets built out before Phase 3 starts — after that the cost of switching rises fast.

## Tokens

Derived from pitch's existing system, deliberately not identical to it.

```css
@theme {
  --color-ground:  #0A0E14;   /* deep, faintly blue-black */
  --color-surface: #131A23;
  --color-raised:  #1C2530;
  --color-line:    rgba(255,255,255,0.07);

  --color-tx:      #EDF1F5;
  --color-tx-2:    #8695A8;
  --color-tx-3:    #5A6878;

  --color-club:    #EF0107;   /* set at runtime from the club's primary_color */

  --color-live:    #2BD97C;   /* semantic only */
  --color-warn:    #F5B93D;
  --color-bad:     #F0576B;

  --font-display:  "Saira Condensed", "Arial Narrow", sans-serif;
  --font-body:     "Figtree", system-ui, sans-serif;
  --font-mono:     "IBM Plex Mono", ui-monospace, monospace;
}
```

**The one substantive palette change: green stops being the brand colour.** pitch
currently uses `--acc: #12a864` for the logo, active nav, focus rings, positive
deltas and primary buttons all at once, which leaves nothing distinct to mean
"good". Here the club colour owns identity and action; green means live, positive,
fit, and nothing else.

Club theming is one line, because Tailwind v4 tokens are real custom properties:

```js
document.documentElement.style.setProperty('--color-club', club.primary_color);
```

**Dark clubs need a guard.** Newcastle is `#241F20`; as an accent on a `#0A0E14`
ground it disappears. The theming layer raises lightness in oklch until text on
the accent clears 4.5:1, and clamps chroma so it stays recognisably the club's
colour. Write this once, in `src/lib/theme.ts`, and test it against all 186 clubs
— several will need it.

Typography replaces pitch's Bebas Neue / DM Sans / Space Mono. Bebas has no lower
case and only one weight, which is why pitch's labels are set at 8–10px in mono
instead — a condensed face with a real weight range removes the need for that.

## What changes from the live build

Measured against pitch as it ships today:

| | Today | Proposed |
|---|---|---|
| Nav | 9 sidebar items → 7 on mobile | **5**, with Play raised in the centre |
| Smallest text | 8px (`.sq-tbl-hdr`, `.tbl-hdr`, `.mc-lbl`) | **11px floor**, 13–15px for anything read rather than scanned |
| Squad list | 11-column CSS grid at 8px | Two-line rows, one large rating, tap for detail |
| Crests | emoji (`🔴`, `🦁`) | SVG shields tinted with the club's own colour |
| Primary action | a button among buttons | The centre nav action, always one thumb away |
| Modals | `showModal()`, blocked during live matches | Bottom sheets; live match is a route, so the constraint goes away |

Nine screens into five tabs: Tactics under Squad; Academy and Trophies under Home;
Inbox in the context bar with its badge; Settings under Home.

## Mobile UX specification

Target 390×844, portrait, one thumb, Safari and Chrome. Wider screens get a wider
layout, never a different information architecture.

### Structure
- **Bottom sheets, not modals.** Drag to dismiss, never full-screen except matchday.
- **Cards below 768px, tables above** — except the league table, which stays
  tabular with sticky position and club columns.
- **Sticky context bar**: crest, GW n/38, budget. Those three drive every decision.
- **Safe areas** — `env(safe-area-inset-bottom)` on the tab bar,
  `viewport-fit=cover`. `100dvh`, never `100vh`.
- **`overscroll-behavior: contain`** on scroll containers.
- **Virtualize the transfer list** — the only unbounded list in the game.

### Interaction
- **44×44px minimum** targets, 8px minimum spacing.
- **No hover-only affordances.** pitch's sidebar `.tip` tooltips have no touch
  equivalent today; the bottom nav carries visible labels instead.
- **Feedback within 100ms** on every action.
- **Haptics** on goal, whistle and transfer accepted, via feature-detected
  `navigator.vibrate`.
- **Motion 150–300ms**, all inside `prefers-reduced-motion` guards.

### Matchday — five beats
1. **Team news** — XI on the pitch, opposition strength, last chance to change shape
2. **Kickoff** — a short deliberate transition; where a 600ms animation is earned
3. **Live** — ticking clock, event feed, score bug reacting to goals, 1× / 4× / skip
4. **Full time** — result card, scorers, one-line verdict
5. **After** — ratings, injuries, your row animating to its new table position

Steps 1, 4 and 5 individually skippable in Settings; never skipped by default.

### Quality floor — before any screen is called done
- [ ] Text contrast ≥ 4.5:1, verified — including the club accent, for all 186 clubs
- [ ] Visible `:focus-visible` ring on every interactive element
- [ ] SVG icons only — no emoji as icons (this includes crests)
- [ ] Touch targets ≥ 44×44, ≥ 8px apart
- [ ] No horizontal page scroll at 320px
- [ ] `prefers-reduced-motion` respected
- [ ] Loading and empty states designed, not defaulted
- [ ] Zoom not disabled
- [ ] 320 / 390 / 768 / 1280px all correct
- [ ] Screenshotted on a real phone

### Component inventory

Build before the screens; they are most of the app.

`Screen` · `ContextBar` · `TabBar` · `Sheet` · `Card` · `SectionHeader` · `Stat` ·
`Button` · `SegmentedControl` · `Chip` · `PlayerRow` · `PlayerDetail` · `Crest` ·
`FormGuide` · `ScoreBug` · `FixtureRow` · `TableRow` · `Pitch` · `PositionSlot` ·
`MentalityPicker` · `Money` · `Sparkline` · `PotentialMeter` · `Toast` ·
`EmptyState` · `Skeleton`

## Process notes

Read `frontend-design` before any new screen. Run `web-design-guidelines` and
`ui-ux-pro-max --domain ux` as a review pass afterwards.

**Do not query `ui-ux-pro-max` for taste.** Asked for a design system for this
project it returns *"Dark Mode (OLED) / Orbitron / JetBrains Mono / vault dark
blue + secure green"*. Orbitron is a spaceship typeface. Its UX, accessibility and
touch data is excellent; its style picks are pattern-matched from generic product
categories and will steer you into exactly the templated look to avoid.

One open item: pitch renders potential as star ratings (`getPotentialStars`). The
mockups use a number plus a growth arrow instead, because five elite prospects all
render as five stars. Worth deciding explicitly rather than by default.
