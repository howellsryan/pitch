# T5.2 — bounded AI adaptation and opponent insight plan gate

**Workstream:** Attribute-to-Tactics Causality 2.0  
**Phase:** T5.2 — bounded AI adaptation and opponent insight  
**Status:** Approved implementation boundary

## Goal

Make Team News describe the same squad-aware AI tactical identity that the authoritative match engine will actually use, while keeping match-context adaptation bounded and internally coherent. Do not expose hidden feasibility scores, detailed player attributes or internal thresholds to the manager-facing surface.

## Authority and invariants

- `aiTacticalIdentity.js` remains the only squad-aware AI identity selector.
- `matchEngine.js` remains the sole football-outcome authority and continues to consume the selected AI profile through its existing tactical-identity adapter.
- `managerTactics.js` remains the manager-facing tactical adapter and may consume the shared AI identity selector; it must not reimplement feasibility scoring.
- Team News must use the same opponent player set as the upcoming match: persisted squad rows when available; the existing deterministic stub-player fallback only for cup/European opponents where the match path already uses that fallback.
- Team News may surface likely style, shape, mentality, one threat and one opportunity only. It must not surface selector margins, archetype score tables, detailed attribute values or hidden adaptation thresholds.
- T5.2 adds no save/database version, no RNG draw, no action-ledger rule and no new tactical schema field.

## Legacy module-order change

`managerTactics.js` currently loads before the T5 action/fit stack in `src/build.py`. Because T5.2 makes it import `buildSquadAwareAITacticalProfile`, move `managerTactics.js` to load after:

`tactics -> matchActionVocabulary -> tacticalProjection -> tacticalPlanFeedback -> aiTacticalIdentity -> managerTactics`

and before `matchActionResolver` / `matchEngine` consumers. This is a dependency-order change only; no runtime lifecycle or persistence ordering changes.

## Bounded adaptation contract

- The chosen club archetype remains the identity; opponent/home-away context may only alter the existing bounded instruction set and formation/mentality rules.
- An away underdog adaptation that drops line/engagement and regroups must not retain contradictory aggressive pressing/counter-press instructions.
- A stronger home side may raise line/engagement/pressing within the existing bounds, but may not re-score every archetype against the opponent and replace club identity for that fixture.
- The adapted profile must normalize to tactics v2.

## Verification

- Team News and `resolveTeamTacticalIdentity()` return the same AI profile id/formation/mentality/instructions for the same team, squad and opponent context.
- Low-block/regroup adaptation cannot produce aggressive pressing or counter-press contradictions.
- Empty/legacy opponent squads retain the stable fallback profile without exposing fake precision.
- Manager-facing insight does not contain `margin`, `evaluations`, exact detailed attributes or exact feasibility/action scores.
- Existing Quick Sim/Watch parity, 600-match/5s regression, balance check, builds, lint, UI emoji and accent gates remain unchanged.

## Rollback boundary

T5.2 is isolated to AI context adaptation, the managed-opponent insight adapter, Team News opponent-player loading and the corresponding legacy module order. It can be reverted without changing T5.1 feasibility scoring, tactics v2 persistence, match action maths, transfer state or player-model data.
