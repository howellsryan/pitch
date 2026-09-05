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
- Team News must use the same opponent player set as the upcoming match: persisted squad rows when available; the shared synthetic-player fallback only for cup/European opponents where the match path already uses that fallback.
- Team News may surface likely style, shape, mentality, one threat and one opportunity only. It must not surface selector margins, archetype score tables, detailed attribute values or hidden adaptation thresholds.
- T5.2 adds no save/database version, no action-ledger rule and no new tactical schema field. The authoritative 14-value per-phase match RNG packet is unchanged.

## Synthetic-opponent determinism correction

Implementation review found that the existing `generateStubPlayers()` fallback still used ambient `Math.random()`, despite this plan initially treating synthetic squads as deterministic. That would allow repeated preview/match resolution for the same external opponent to produce different input players before the authoritative engine even started.

T5.2 therefore makes the **input generator** deterministic by stable opponent identity + strength while leaving the authoritative match RNG packet and action resolution untouched. Team News stores and reuses that resolved opponent squad for kickoff. Synthetic `_stub_` players do not count as known-squad scouting evidence, so a fabricated squad cannot create false manager-facing certainty.

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
- The same synthetic opponent identity + strength produces the same synthetic player rows, and Team News reuses that player set for watched kickoff.
- Low-block/regroup adaptation cannot produce aggressive pressing or counter-press contradictions.
- Empty/legacy/synthetic-only opponent evidence uses cautious wording without exposing fake precision.
- Manager-facing insight does not contain `margin`, `evaluations`, exact detailed attributes or exact feasibility/action scores.
- Existing Quick Sim/Watch parity, 600-match/5s regression, balance check, builds, lint, UI emoji and accent gates remain unchanged.

## Rollback boundary

T5.2 is isolated to AI context adaptation, the managed-opponent insight adapter, deterministic synthetic opponent input, Team News opponent-player loading and the corresponding legacy module order. It can be reverted without changing T5.1 feasibility scoring, tactics v2 persistence, authoritative match action maths, transfer state or player-model data.
