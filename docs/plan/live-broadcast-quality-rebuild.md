# Live Match text broadcast and recovery rebuild

## 7 September 2026

### Why this changed

Real-device testing of PR #35 showed that the animated live-match pitch was lowering the perceived quality of the underlying simulation. Even after adding formation anchoring, goalkeeper bounds, marker separation and scene-cut logic, the visual layer still asked a lightweight browser renderer to imply continuous 22-player football it could not convincingly reproduce.

The clearest failure mode was presentation fiction: disconnected authoritative phases could look like one impossible football action, including goalkeeper-to-goalkeeper movement. The animation therefore made legitimate simulation state look broken.

The same testing also exposed a recovery problem. Play Key Moments state is durable, but a browser refresh previously booted an existing save to Home first. PR #35 now routes an active persisted playable match or competition shootout directly back into Match so the saved session can restore cleanly.

### Product decision

The animated 2D live-match pitch is retired.

`Watch Match` is now a **text-first tactical broadcast**. The authoritative match engine still advances the same 120 regulation phases and produces the same ledger, events, score and result. The broadcast layer exists only to pace and explain those authoritative phases in readable language.

Examples of the intended language:

- **Goalkeeper build-up · playing short** — explains that the keeper is drawing the first line of pressure before progressing.
- **Goalkeeper build-up · going direct** — explains that the team is bypassing the press and competing higher up the pitch.
- **Build-up · patient circulation** — explains that possession is being recycled to move the defensive block and open a safer progression lane.
- **Direct progression · breaking lines** — explains that an early forward ball is trying to bypass midfield pressure.
- **Run in behind · attacking space** — explains that the move is targeting the space behind an advanced defensive line.
- **Carry · committing the defence** — explains why driving at a defender can create a free player or passing lane.
- **Wide attack · delivery into the box** — explains that the move has reached crossing territory and is trying to overload the penalty area.
- Contest and shot outcomes then explain the consequence: pressure beaten, interception, turnover, free kick, line broken, chance created, save, miss, block, corner or goal.

### What remains on the live screen

- competition and live-status label;
- team crests and scoreboard;
- regulation clock;
- match progress;
- current tactical phase;
- a large `WHAT IS HAPPENING` commentary card;
- possession share;
- pause, skip and tactics controls;
- authoritative goal event cards;
- Play Key Moments overlays when that separate mode is selected.

There is no visible pitch, player marker or ball animation in `Watch Match`.

### Ownership

- `matchEngine.js` remains the sole source of authoritative football outcomes.
- `broadcastSimulation.js` remains temporarily as a **commentary sequencing adapter**. Its scene stages provide readable pacing within one authoritative ledger action; they are no longer rendered as footballer coordinates.
- `broadcastLedgerSemantics.js` owns text-first descriptions of route, contest and shot meaning. It may explain tactical intent implied by the authoritative route, but it must not invent a different action or result.
- `broadcastFrameSemantics.js` passes the ledger description through to the UI. The previous bug where semantic action titles were calculated but discarded has been fixed.
- `live-broadcast-tactical.css` now collapses the old pitch DOM and promotes the commentary card to the primary match surface.
- `liveBroadcastMotionSmoother.js` and its tests have been removed. No DOM coordinate smoother is installed at application boot.
- `ui/renderers.js` owns refresh routing for persisted playable/shootout sessions.

### Quality rules

1. **No fake football movement** — Watch Match does not attempt to show 22 players or a ball moving continuously.
2. **Explain the tactic, not just the event** — commentary should say what the route is trying to achieve, not merely repeat "pass" or "carry".
3. **Stay authoritative** — copy is derived from ledger route/outcome/stage. It must not invent a shot, goal, turnover or tactical decision that did not occur.
4. **Keep the hierarchy calm** — scoreboard and clock remain persistent; the current phase is the visual focal point; goal cards can temporarily take priority.
5. **Keep management controls available** — Pause, Skip and Tactics remain unchanged.
6. **Keep Play Key Moments separate** — interactive key-moment rendering is not the same product surface as Watch Match and is not removed by this decision.
7. **Recover directly** — browser refresh during a persisted playable/shootout session returns to Match rather than making the user find the fixture again.

### Verification contract

Automated checks cover:

- animated pitch primitives are hidden from the live-match presentation;
- the goal event card remains visible even though the pitch is retired;
- the old DOM motion smoother is not imported or installed;
- route semantics distinguish build-up, direct progression, space attacks, carries and wide deliveries;
- goalkeeper possession/build-up receives goalkeeper-specific language;
- contest and shot outcomes retain their authoritative meaning;
- semantic action titles are passed through to the UI rather than discarded;
- persisted playable/shootout sessions still resume through Match;
- production builds, lint, unit tests, deep match-balance and accent checks remain green.

### Future direction

Do not reintroduce animated player markers as incremental polish. If the live experience is expanded, improve the **information design** instead: richer tactical summaries, momentum/territory trends, pressing success, where progression is happening, which instruction is influencing the match, and larger event cards for goals, cards, injuries, substitutions and tactical changes.

If Pitch later adopts a genuinely capable animation stack, that should be treated as a separate product decision with its own proof-of-quality gate—not another attempt to make this retired renderer look more lifelike.
