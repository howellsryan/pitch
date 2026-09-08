# PR #35 presentation quality gate

Status: active acceptance contract for `plan/playable-key-moments-roadmap`.

This gate exists because functional correctness is not enough for Matchday. A green build must not allow a low-quality animation, unreadable mobile UI, misleading interaction, or synthetic-looking Watch Match experience to ship.

## 1. Football authority — blocking

- The match engine remains the only source of score, scorer, target, finish, RNG and fixture state.
- Play Key Moments may alter only the bounded interactive finish seam already owned by the playable-moment resolver.
- Presentation code may interpolate or embellish between fixed authoritative contacts, but it must not invent a goal, save, block, player or event.
- Replays are presentation-only and cannot re-resolve a committed moment.
- Sim Instantly and ordinary Watch Match retain their existing automatic football path.
- Retired contact, defending/goalkeeper and final-pass interactions stay automatic unless a future roadmap explicitly reintroduces them.

## 2. Interaction fairness — blocking

- The point where a shot/free-kick swipe ends remains the intended destination.
- Direct-free-kick swipe path may add signed curve; the same committed curve drives resolver, trajectory and strike style.
- A high-quality top-corner free kick must not be rejected by an artificial top-corner-only rule or excessive hidden spread.
- Wide/off-target input must not be converted into a goal by presentation.
- Keyboard/tap fallback remains deterministic and straight (`curve: 0`).
- Every interactive control must keep a minimum 44px touch target; mobile primary controls use at least 46px where already established.

## 3. Motion and contact quality — blocking

For open play, direct free kicks, penalties and shootouts:

- Feet may not skate through planted strike frames.
- The striking boot must meet the same committed contact point for laces, inside-foot and outside-of-the-boot variants.
- Limbs may not stretch, snap or pass visibly through the floor.
- Goalkeeper hands must meet the committed save/catch contact before the settle animation.
- Free-kick wall movement must be coordinated rather than identical cloned jumps.
- Ball curve may be visually enriched only between launch and terminal contact; it must be zero at authoritative launch/terminal endpoints.
- Camera movement during user aiming must remain fixed so pointer-to-goal mapping cannot drift.

## 4. Procedural graphics quality — blocking for code, human acceptance for final look

The current stack remains generated Three.js geometry. No paid/manual asset pipeline is required.

### Quality tiers

Low:
- 30fps target
- 1x pixel-ratio cap
- shadows disabled
- 512 shadow budget retained only as profile metadata
- reduced generated stadium/ball/net detail
- procedural environment lighting disabled

Medium:
- 45fps target
- 1.5x pixel-ratio cap
- soft shadows with 1024 shadow map
- medium generated stadium/ball/net detail
- procedural PMREM environment lighting enabled

High:
- 60fps target
- 2x pixel-ratio cap
- soft shadows with 2048 shadow map
- maximum current generated stadium/ball/net detail
- procedural PMREM environment lighting plus fill light enabled

High must be a visible fidelity tier, not merely a faster copy of Medium.

### Visual bar

- Generated footballers must read as adult footballers at the actual gameplay camera distance, not toy/blob figures.
- Club shirt/short colours and readable contrasting numbers must remain visible.
- Boots, gloves, goal, net and ball need enough material/lighting separation to read immediately.
- Stadium/crowd detail should frame the event without making the aiming surface noisy.
- No visual effect may be accepted solely because it looks good in a source-level test; final WebGL appearance is a device-rendered acceptance item.

## 5. Watch Match quality — blocking

Watch Match remains text-first. The retired pseudo-live pitch/player/ball animation must not return implicitly.

- No broadcast pitch, player-marker or ball DOM is rendered in Watch Match.
- Score, clock, status, progress, possession and tactics controls remain persistent.
- Routine engine phases are sampled; meaningful attacks, shots and set pieces receive priority.
- A goal is narrated through its buildup before the terminal `GOAL!` beat and score reveal.
- Half time is an intentional break; full time cannot be delayed by stale routine commentary.
- Commentary should read like football commentary, not engine/debug prose. Avoid user-facing terms such as `authoritative`, `resolver`, `packet`, `phase` (when referring to engine internals), or `synthetic`.
- Deterministic copy variation is allowed when it uses presentation state only and does not consume match RNG.

## 6. Typography and readability — blocking

Primary player-facing copy must be readable without zooming on a phone-sized viewport.

- Live commentary body: 16px minimum with approximately 1.6+ line height.
- Playable-moment explanatory body: 14px minimum.
- Important playable names/results: 15px+ body or display hierarchy.
- Operational/meta labels should normally be 10–11px minimum; 9px is not acceptable for information a player is expected to read.
- Headline/display type must not shrink on mobile below the hierarchy it is meant to establish.
- Long commentary is constrained to a readable measure rather than spanning the full desktop viewport.
- Text must wrap cleanly for long club/player names.

## 7. Accessibility and resilience — blocking

- Commentary remains `aria-live="polite"` and atomic.
- Pointer interaction retains accessible lane/height button fallback.
- `prefers-reduced-motion` renders the final state rather than hiding information.
- Renderer failure resolves the same saved pending moment automatically; it cannot manufacture a substitute result.
- A committed result cannot be auto-resolved again after renderer failure.

## 8. Performance — blocking automated, human final check

Automated:
- production Vite build passes
- ESLint passes
- full Vitest suite passes
- UI emoji audit passes
- standard match-balance check passes with unchanged thresholds
- T7 deep balance check passes with unchanged thresholds
- club accent audit passes
- pinned agent-workflow verification passes

Human/device:
- no obvious dropped-frame stall during one penalty, one curved free kick and one open-play/1v1 replay on a current phone
- High quality remains smooth on a capable desktop/device selected by Auto
- Medium remains the safe default for ordinary modern mobile hardware
- quality switching cannot change the committed football result

## 9. Required final acceptance pass

Before PR #35 is considered visually accepted, play the deployed preview on at least:

1. one physical phone in portrait
2. one desktop/laptop WebGL browser

Exercise:

- full Watch Match through first half, half time and full time
- open-play shot / 1v1
- penalty
- direct free kick with inside-foot curve
- direct free kick with opposite/outside-of-the-boot curve
- same-result replay
- reduced-motion mode
- Sound/Quality controls and accessible aim buttons

A GitHub-only agent may certify code, tests, deterministic contracts and deployment. It must not claim subjective final animation/graphics acceptance without this rendered device pass.
