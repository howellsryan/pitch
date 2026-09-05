# T5.3 — recruitment, loans and squad-planning tactical fit plan gate

**Workstream:** Attribute-to-Tactics Causality 2.0  
**Phase:** T5.3 — recruitment, loans and squad planning  
**Status:** Approved implementation boundary

## Goal

Reuse the same squad-aware tactical identity and action-relevant player attributes across squad planning, permanent recruitment, player interest and loan pathways without allowing tactical fit to override the career systems that are already authoritative for need, playing time, budget, contracts, reputation or transfer legality.

## Authority and invariants

- `aiTacticalIdentity.js` remains the only selector for an AI club's squad-aware tactical identity.
- `tacticalProjection.js` remains the shared definition of tactic-driven action usage, role participation and action-relevant detailed attributes.
- A new pure career tactical-fit adapter may combine those two contracts; downstream career modules must not reimplement action weights or archetype feasibility.
- `squadPlanning.js` remains authoritative for position/group need, ability bands, age profile and budget allocation.
- `transferMarket.js` remains authoritative for player interest, hard blockers, contract terms, reputation, rivalry and negotiation state.
- `academyPathways.js` remains authoritative for expected loan minutes, role, coaching/facility pathway and development reporting.
- No save/database version changes, no new persistence fields and no authoritative match RNG/action-ledger changes are allowed in T5.3.

## Shared career tactical-fit contract

For a club and its current senior squad:

1. resolve the club's current squad-aware AI tactical identity once;
2. choose the candidate/player's existing tactical role using that selected profile;
3. retain `roleSuitability()` as the structural/role component;
4. calculate an action-execution component only from actions the chosen role actually participates in, weighted by the profile's `tacticalActionUsage()` and `ROLE_ACTION_WEIGHTS`;
5. resolve those actions using the same `TACTICAL_ACTION_DEFS[action].execution` detailed-attribute weights used by the T3/T4 action model;
6. combine role and action components into one bounded multiplier suitable for career ranking, plus internal diagnostics for tests.

The adapter must be deterministic, pure and non-mutating. Missing detailed attributes must continue through the existing player-model fallback rather than creating a second rating system.

## Need-first permanent recruitment

- Position/group eligibility remains a hard filter before tactical fit is considered.
- Ability band, affordability, signing likelihood, scouting evidence and age profile retain their existing authority.
- Tactical/action fit may reorder otherwise comparable candidates but must be bounded so a luxury tactical fit cannot beat a materially better need/ability/value candidate.
- `rankStandoutRecruitmentCandidates()` may use a smaller fit nudge for opportunity signings, but current ability/potential remain the reason that candidate entered the standout pool.
- Existing listed/unlisted managed-player targeting percentages remain unchanged.

## Player interest

- Player interest must consume the buyer's actual squad-aware identity by evaluating against `buyerSquad` rather than falling back to the hash-only archetype.
- Tactical fit remains one negotiable preference among club stature, league prestige, wage, playing time, morale and contract security.
- Tactical fit must not become a new hard blocker and must not bypass rivalry/reputation/moved-this-season blockers.

## Loan pathways

- Expected minutes remains the largest loan-destination component.
- Tactical/action fit is evaluated against the receiving club's actual squad-aware identity and remains secondary to likely minutes.
- Coaching, facilities, affordability and level fit retain their existing roles.
- The output remains deterministic and manager-facing because the loaned player belongs to the user's club; no opponent hidden-attribute exposure is introduced.

## Legacy module order

The new `careerTacticalFit.js` depends on:

`tactics -> playerModel -> tacticalProjection -> aiTacticalIdentity`

and must load before `academyPathways`, `squadPlanning` and `transferMarket` in `src/build.py`. It has no persistence or runtime side effects.

## Verification

- Same team + same squad + same candidate => identical tactical role/action fit/profile id.
- Input team/player/squad objects are not mutated.
- A player with action-relevant detailed attributes that suit the selected plan outranks an otherwise comparable player with the same headline ability but poor action attributes.
- Wrong-position candidates remain excluded regardless of tactical fit.
- A materially stronger/cheaper need-fitting candidate is not displaced solely by tactical fit.
- Player interest uses the same squad-aware profile id as the career evaluator for that buyer squad.
- Two otherwise similar loan destinations prefer the club offering better likely minutes even if the lower-minutes club has a modest tactical-fit edge; tactical fit breaks closer pathways.
- Existing transfer legality, budget/reputation/rivalry contracts remain green.
- Quick Sim/Watch parity, the unchanged 600-match/5s regression, balance guardrails, builds, lint, UI audit and accent checks remain unchanged.

## Rollback boundary

T5.3 is isolated to the pure career tactical-fit adapter and the four bounded career consumers above. Reverting it restores pre-T5.3 career ranking without changing T5.1/T5.2 AI match identity, tactics v2 persistence, transfer-market state, loan state or authoritative match outcomes.
