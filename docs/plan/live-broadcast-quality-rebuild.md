# Live Broadcast quality and recovery rebuild

## 7 September 2026

### Why this changed

A real-device recording of PR #35 exposed a presentation failure that unit tests did not catch: the visible players lagged materially behind the accelerated hidden Broadcast simulation, team shapes collapsed towards the centre, and disconnected authoritative phases could be bridged visually as impossible long possession transfers. In the clearest case, a goalkeeper holding the ball at one end could appear to play directly to the other goalkeeper when the next authoritative phase named that keeper as its actor.

The same recording also showed a recovery problem. Play Key Moments state is durable, but a browser refresh always booted an existing save to Home. The saved match could be restored only after navigating back to Match, which made a recoverable refresh look like a crash or lost match.

### Product decision

Pitch should not try to disguise every authoritative phase boundary as one continuous physical sequence. The authoritative match engine remains the source of football outcomes; Broadcast is a tactical presentation of those outcomes.

The quality target for the 2D live view is therefore:

- recognisable formation and team width;
- believable local movement around the ball;
- goalkeepers constrained to credible own-goal zones except explicit rush behaviour;
- fast, coherent interpolation for normal movement;
- a deliberate tactical scene cut when two authoritative snapshots are too disconnected to join honestly;
- no invented pass, tackle or dribble solely to hide an engine phase transition;
- stable mobile presentation that prioritises readability over fake continuous physics.

This is intentionally different from trying to reproduce Football Manager 26's character-animation stack. Pitch keeps its browser-first, licence-free 2D tactical view and spends complexity on causality, readability and stability instead.

### Ownership

- `matchEngine.js` continues to decide authoritative possession, action and result.
- `broadcastSimulation.js` continues to project the authoritative ledger into tactical scene targets.
- `liveBroadcastMotionSmoother.js` is the final presentation adapter. It may stabilise shape, cap goalkeeper regions, separate overlapping markers and choose a scene cut for an implausible visual discontinuity. It must never alter a score, scorer, ledger record or match result.
- `ui/renderers.js` owns boot routing. If the active save contains a persisted Play Key Moments session or competition shootout session, refresh routes directly to Match so the existing MatchScreen recovery code can restore it.

### Presentation rules introduced

1. **Formation anchoring** — non-engaged players retain most of their formation anchor instead of all chasing aggressive hidden targets. Engaged carriers, receivers, pressers and rushing players are allowed more freedom.
2. **Goalkeeper bounds** — keepers remain in a bounded horizontal channel and their own end zone. A side swap at half-time is treated explicitly rather than interpolated through midfield.
3. **Marker separation** — overlapping outfield markers receive a small presentation-only separation so the team remains readable on a phone.
4. **Discontinuity cuts** — long non-shot ball changes and large player jumps are scene changes, not slow cross-pitch animations. Real shot flight gets a larger threshold and remains animated.
5. **Catch-up speed** — ordinary visible movement catches the projected simulation materially faster than the old DOM smoother, reducing the chance that the next authoritative phase begins while the manager is still watching the previous one.
6. **Recovery routing** — active persisted playable/shootout state makes Match the boot destination; ordinary careers still boot Home.

### Verification contract

Automated contracts cover the pure presentation policy rather than browser pixels:

- normal movement remains interpolated and bounded;
- the ball may move faster than players;
- impossible long non-shot ball transitions classify as scene cuts;
- real shots remain continuous within the larger shot threshold;
- goalkeeper targets cannot wander into midfield;
- formation width is retained when hidden targets collapse centrally;
- overlapping markers are separated;
- app boot routes persisted playable/shootout sessions to Match and leaves ordinary careers on Home.

Repository policy still forbids an E2E/browser test suite. The final release gate therefore remains hands-on inspection of the deployed branch preview on a phone and a wider viewport, with the supplied recording used as the before-state reference.

### Deferred, not hidden

This rebuild makes the current 2D presentation honest and coherent; it does not claim that every `broadcastSimulation.js` scene is now Football Manager-quality choreography. A later visual-depth pass can add richer tactical motifs (pressing traps, switches, overlaps, compact block movement and camera framing) on top of these rules without changing match authority. If those motifs cannot reach the required quality, the correct fallback is a more abstract tactical highlight view, not another layer that fabricates continuous football between unrelated engine phases.
