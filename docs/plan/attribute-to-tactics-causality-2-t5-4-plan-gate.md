# T5.4 — scouting and training tactical integration plan gate

**Workstream:** Attribute-to-Tactics Causality 2.0  
**Phase:** T5.4 — scouting and training  
**Status:** Approved implementation boundary

## Goal

Make scouting and training speak the same football language as the T3/T4 action model without leaking hidden player attributes, creating a second tactical-fit formula, or changing development maths. Scouting should report how well a player appears to fit the user's selected plan at the confidence the manager has actually earned; training should explain which existing development plan best supports the actions that player is expected to perform.

## Authority and invariants

- `careerTacticalFit.js` remains the shared role/action-fit evaluator introduced in T5.3. Scouting and training must consume it or its underlying canonical T3/T4 definitions rather than reimplement action weights.
- `scouting.js` remains authoritative for report confidence, observation ranges, staleness, exact-report entitlement and manager-facing masking.
- `training.js` remains authoritative for development-plan definitions and automatic recommendations.
- `playerDevelopment.js` and the existing weekly settlement remain authoritative for actual development maths. T5.4 does not add a new growth multiplier or mutate detailed attributes directly.
- User-selected tactics remain authoritative. Training recommendations may explain a fit but must never change tactics, roles or development plans automatically.
- No save/database version, action-ledger version, RNG packet width or match-engine formula changes are allowed in T5.4.
- Manager DNA remains observational. T5.4 must not infer hidden player ability or label one tactical setup objectively optimal.

## Scouting tactical-fit contract

### Exact/full reports

A completed dedicated report may evaluate the canonical player row against the user's current tactical plan and squad context because full scouting already grants exact season-scoped player knowledge.

The report may expose:

- likely/best role;
- coarse fit label (`Strong`, `Good`, `Stretch`);
- a short manager-facing explanation of the action family that drives the fit.

It must not expose raw action weights, exact tactical-fit scores, hidden AI feasibility scores or internal detailed-attribute calculations.

### Partial/public reports

Partial reports must preserve the existing uncertainty boundary.

- Tactical fit must be calculated from a scouting-masked proxy derived only from the report's observed current range/confidence plus attributes that are already legitimately known at that stage.
- Unrevealed detailed PAC/SHO/PAS/DRI/DEF/PHY values must not be fed directly into a manager-facing partial-report fit label.
- Lower confidence may widen/coarsen the tactical assessment; it must never become more precise than the underlying report.
- Stale reports retain their original tactical observation rather than silently re-reading current hidden attributes.
- Public/no-assignment reports should remain deliberately broad.

## User tactical context

Scouting fit should evaluate the player's role/action requirements against the user's actual current tactics where available, not `getAITacticalProfile(userTeam)`.

The caller may provide:

- canonical tactics v2 instructions/profile;
- user squad where needed for context;
- selected player role when explicitly assigned.

If that context is unavailable, scouting falls back safely to the existing stable profile behaviour rather than inventing certainty.

## Training recommendation contract

`automaticPlanRecommendation()` may accept optional tactical context while preserving its current safe one-argument API.

Hard wellbeing/pathway priorities remain first:

1. injury/rehabilitation => `recovery`;
2. low sharpness => `sharpness`;
3. active position conversion => `position_conversion`.

For a match-fit player, the recommendation may then use the selected tactical role and the same role/action participation model to identify the dominant development family:

- finishing/shot execution => `finishing`;
- circulation/creation/space progression/wide delivery => `creation`;
- interception/recovery/pressing defensive actions => `defending`;
- physical/recovery-heavy role requirements => `physical` only where that action demand is materially dominant;
- otherwise retain `role` / existing positional fallback.

The recommendation is advisory only. It does not modify `player.developmentPlan`, tactics, roles, headline ratings or detailed attributes.

## UI boundary

The existing Development Plan panel may pass the current save's tactics/player-role context into the recommendation and show one concise reason beneath the recommendation. Existing plan buttons and manager control remain unchanged.

Scouting screens should continue rendering the existing report `tactical` object shape where possible; additive coarse explanation fields are preferred over a parallel report model.

Any UI change requires the repository's normal production build, lint, UI audit and rendered mobile/wide verification where an accessible preview is available. Lack of an accessible preview must be recorded rather than claimed as visually verified.

## Verification

### Scouting

- Full report tactical fit uses the user's supplied canonical tactical profile and matches the shared evaluator's coarse result.
- Two identical partial scouting reports produce identical tactical output.
- Changing hidden detailed attributes while keeping the same partial observed report does not change its manager-facing tactical fit.
- Increasing scouting confidence may narrow/strengthen the assessment but never exposes raw hidden attributes or exact fit scores.
- A stale partial report does not silently refresh tactical fit from current hidden player data.
- Existing exact-report season/staleness/financial/current-ability contracts remain green.

### Training

- Recovery, sharpness and position conversion still override tactical suggestions.
- Two otherwise similar players assigned different tactical roles/plans can receive different recommendations when their required action families differ.
- Recommendation calls are deterministic and non-mutating.
- Calling `automaticPlanRecommendation(player)` with no tactical context remains backward compatible.
- Applying a recommendation still uses the existing manager command/development-plan contract; no automatic plan mutation is introduced.

### Regression

- Existing T5.3 career-fit contracts remain green.
- Quick Sim/Watch parity remains exact.
- The unchanged 600-match sample and 5s ceiling remain unchanged.
- `npm run balance:match:check`, legacy build, Vite build, lint, UI emoji and accent checks remain green.

## Rollback boundary

T5.4 is isolated to scouting tactical projection, training recommendation/explanation and the minimal UI context adapter. Reverting it restores the previous scouting/training presentation without changing T5.1/T5.2 AI match identity, T5.3 career ranking, development settlement, tactics persistence or authoritative match outcomes.
