# T5 — AI and career-system integration plan gate

**Workstream:** Attribute-to-Tactics Causality 2.0  
**Phase:** T5 — AI and career-system integration  
**Status:** Approved implementation boundary for the next delivery slice

## Goal

Make AI clubs choose and use tactical identities that their squads can actually execute, then reuse the same action/role fit signals across opponent insight, recruitment, loans, scouting and training. Keep club identity stable, adaptations bounded, and manager-facing information uncertain rather than omniscient.

## Authority and invariants

T5 does **not** create another match engine or another tactics schema.

The following remain authoritative and unchanged in ownership:

- `src/modules/tactics.js` owns normalized tactics v2, AI archetypes, player roles and Manager DNA.
- `src/modules/matchEngine.js` owns lineup selection, match-state construction and the authoritative action ledger.
- `src/modules/tacticalProjection.js` / `matchActionResolver.js` remain the action-quality and route-resolution model.
- Quick Sim and Watch must still resolve the same seeded match for the same inputs.
- T5 must not add RNG draws to the 14-value per-phase packet.
- User save schema is not changed by the first T5 slice.
- No hidden manager-facing exact opponent attributes or exact AI decision scores are exposed.

## Delivery slices

### T5.1 — Squad-aware AI archetype feasibility

Introduce a pure deterministic feasibility score for each existing AI tactical archetype using the club's available squad.

The score should:

- evaluate the formation's positional coverage;
- evaluate role suitability for the XI that would execute the archetype;
- evaluate only action-relevant detailed attributes for the archetype's selected routes;
- use diminishing returns and bounded weights so one elite player cannot define the whole identity;
- retain a stable club identity bias derived from the existing team hash;
- choose a different archetype only when the squad-fit advantage is material;
- return explanation metadata for tests/internal consumers without exposing exact scores in Team News.

Match-specific opponent/home-away adaptation stays bounded to a small number of instruction changes. It must not replace the chosen club identity every fixture.

**First-slice exit:** two equal-reputation clubs with deliberately different squad profiles can deterministically prefer different viable archetypes; the same club/squad returns the same profile; Quick Sim/Watch parity remains exact.

### T5.2 — Bounded AI adaptation and opponent insight

- Move existing reputation/home-away adaptation onto explicit bounded rules layered on top of the chosen identity.
- Prevent contradictory adaptations such as low engagement + aggressive counter-press unless intentionally supported.
- Team News should report likely style/shape, one threat and one opportunity using coarse language.
- Insight should never expose exact detailed attributes, exact feasibility scores, exact action weights or hidden AI thresholds.
- Where evidence is weak, wording should become less certain rather than fabricating precision.

### T5.3 — Recruitment, loans and squad planning

Reuse one tactical-fit evaluator for AI squad planning and recruitment.

- Position need remains primary: AI clubs must not buy a tactical luxury while leaving a required position uncovered.
- Within comparable candidates, tactical/action fit can influence ranking.
- Player interest can continue considering manager fit, but must consume the buyer's actual squad-aware identity.
- Loan destination fit should consider likely minutes first, then tactical role/action fit.
- Existing budget, reputation, contract, rivalry and transfer-window rules remain authoritative.

### T5.4 — Scouting and training

- Scouting reports should project role/tactical fit through the existing uncertainty model; unrevealed detailed attributes must stay masked/coarse.
- Training suggestions should point towards action-relevant development for the user's selected plan without silently changing the plan or player ratings.
- Manager DNA should summarize observed choices/results, not infer hidden ability or declare one objectively optimal tactic.

## First implementation boundary

The first T5 code slice is intentionally limited to **T5.1 plus the minimum adapter wiring required for match inputs and Team News to reference the same squad-aware AI identity**.

It may change AI formation/instruction selection before a match, so it is a simulation-input change and requires paired deterministic verification before promotion.

It will not yet change:

- transfer-market candidate generation;
- loan settlement;
- scouting persistence;
- training/development maths;
- match action formulas or RNG packet width;
- save/database versions.

## Verification

### Deterministic contracts

- same team + same squad + same opponent context => same AI identity/profile;
- input player/team objects are not mutated;
- empty/legacy squads fall back safely to the stable existing archetype selection;
- selected profile always normalizes to tactics v2;
- no invalid formation/instruction combination is produced.

### Feasibility scenarios

- passing/technical squad favours Controller over Vertical Press when identity priors are otherwise close;
- fast/direct squad favours Vertical Press or Compact Counter over Controller when materially better suited;
- wide creators/full-backs improve Wide Overload feasibility;
- slow recovery defenders penalise aggressive high-line identities;
- weak positional coverage prevents an otherwise attractive formation from winning purely on attributes;
- a small fit advantage does not erase stable club identity; a material fit advantage can.

### Regression gates

- exact Quick Sim/Watch parity at 1/7/10/30/120 phase segmentation;
- existing T4 tactic causality tests remain green;
- 600-match regression test retains the same sample and 5s ceiling;
- `npm run balance:match:check` stays inside reviewed product guardrails;
- production build, lint, UI emoji and accent checks pass.

## Rollback boundary

T5.1 is isolated behind the AI profile-selection function and its adapters. If calibration is wrong, the squad-feasibility selection can be reverted without changing tactics v2 persistence, the action ledger, user tactics, transfer state or player-model data.
