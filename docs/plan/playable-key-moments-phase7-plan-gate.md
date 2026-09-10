# Playable Key Moments — Phase 7 Plan Gate

Status: **GO — build Phase 7 only**

Base: verified Phase 6 head `5f4e86a050382ca5a5e611e64d3cfc569297abaf`

## Goal

Replace Pitch's aggregate deterministic knockout shootout verdict with one versioned, rules-correct, resumable per-kick authoritative process, then reuse the proven Phase 4 penalty interaction for managed-team shootout kicks and saves.

## Authority boundary

The competition/domain layer owns:

- eligible taker order;
- goalkeeper identity;
- kick index and round;
- which team takes next;
- normal five-kick score and remaining kicks;
- early mathematical conclusion;
- transition to sudden death;
- paired sudden-death completion;
- final winner/loser;
- durable committed kick receipts;
- competition advancement eligibility.

The renderer may return only the existing normalized penalty intent. It cannot choose the taker, goalkeeper, result, shootout winner or competition progression.

## Preferred architecture

```text
Knockout tie requires penalties
        |
        v
createShootoutState(versioned inputs)
        |
        v
nextAuthoritativeKick
(taker + keeper + kick index + deterministic packet)
        |
   automatic / managed intent
        |
        v
existing resolvePenaltyOutcome
        |
        v
commitShootoutKick
        |
        +--> complete? -> competition progression exactly once
        |
        +--> pending?  -> persist state -> next kick
```

A shootout is not a second match engine. It is a bounded post-match competition-resolution state machine which delegates each football action to the existing authoritative penalty resolver.

## 7A — pure per-kick shootout domain

Create a small DOM-free module owning:

- `SHOOTOUT_STATE_VERSION`;
- deterministic eligible taker ordering from explicitly supplied eligible on-pitch players;
- explicit goalkeeper IDs;
- stable per-kick deterministic packet derivation from the match/tie seed + kick index + taker/keeper identity;
- `createShootoutState`;
- `getNextShootoutKick`;
- `resolveAutomaticShootoutKick` using `resolvePenaltyOutcome`;
- `commitShootoutKick` with duplicate-index/idempotency protection;
- `runAutomaticShootout`;
- score/remaining/round/sudden-death derivation.

### Rules

Normal phase:

- alternating kicks;
- up to five kicks per team;
- after every committed kick, calculate whether either side is mathematically unreachable using that side's remaining normal kicks;
- if both teams complete five and remain level, enter sudden death.

Sudden death:

- each round is a pair of kicks;
- a winner can be declared only after both teams have taken the same sudden-death round;
- if still level, begin the next pair;
- taker order cycles only after every eligible outfield taker has been used.

Goalkeepers do not enter the taker order while eligible outfield players remain. The domain accepts final eligible participants explicitly so competition integration cannot silently use a player substituted off earlier.

## 7B — automatic competition integration

Only after 7A tests are green:

- replace new-version single-leg aggregate penalty verdicts with `runAutomaticShootout`;
- replace tied two-leg aggregate penalty verdicts with the same per-kick process;
- keep extra-time metadata separate from the penalty winner;
- store compact shootout summary/state with the authoritative cup result;
- update result display to read the committed shootout winner;
- integrate domestic cup and UEFA paths without moving their existing ownership;
- make advancement receipt/idempotency explicit so retry/reload cannot advance twice.

Existing old result/save shapes remain readable; Phase 7 applies to newly resolved versioned ties.

## 7C — playable managed-team kicks

After automatic parity and progression are proven:

- expose a pending shootout kick only when the managed team is either taker or defending goalkeeper;
- reuse the existing Phase 4 penalty moment/intent/resolver;
- persist the same kick before presentation;
- Simulate resolves that exact kick automatically;
- submitting intent resolves that exact kick once;
- post-submit Skip skips presentation only;
- AI-v-AI / opponent kicks remain deterministic and automatic;
- recovery from local/export/cloud save resumes the same kick index and packet without rerolling;
- final competition progression happens only from the completed committed shootout state.

## Success criteria

### Domain

- identical seed + participants produces identical complete shootout;
- normal alternating order is correct;
- early conclusion works after either team's kick;
- a side can never be declared eliminated while it can still mathematically draw/lead with remaining normal kicks;
- sudden death never concludes after only the first kick of a pair;
- sudden death concludes immediately after the second kick of a pair creates a lead;
- taker cycling is deterministic;
- committed kick replay cannot append a duplicate or change the result;
- every kick uses the existing authoritative penalty resolver.

### Competition

- domestic single-leg cup ties use the per-kick state;
- UEFA/final single-leg ties use the per-kick state;
- tied two-leg aggregate paths use the per-kick state where penalties are required;
- progression happens exactly once;
- stored result/display winner matches the shootout winner;
- old stored results remain readable.

### Playable

- managed taker and keeper kicks use the same persisted kick contract;
- refresh/retry cannot reroll;
- Simulate and user input resolve the same kick;
- final advancement waits for committed completion.

### Regression

- no change to regulation match RNG packet or 120-phase engine;
- Quick Sim / Watch Match remain deterministic;
- unchanged 3,000 + 5,000 balance gates pass;
- full Vitest/build/lint/UI/accent gates pass;
- Cloudflare preview builds successfully;
- no E2E/browser suite is added.

## Edge cases

- one side has fewer eligible outfield takers;
- goalkeeper missing from supplied eligible participants;
- duplicated player IDs in eligible input;
- duplicate/replayed kick commit;
- corrupted state whose next team/kick index disagrees with committed receipts;
- early win after the first team in a normal round takes a kick;
- sudden-death first kick creates a lead but opponent has not replied;
- sudden-death pair restores equality;
- shootout extends beyond one full taker-order cycle;
- tab closes immediately before or after a kick commit;
- competition progression retried after shootout already completed.

## Explicitly out of scope

- continuous manual football;
- new penalty physics or a second penalty resolver;
- Phase 8 scene-director/audio/replay work;
- shootout-specific paid/free animation assets;
- changing regulation goals/xG to make shootouts more dramatic;
- weakening existing balance thresholds.

## Plan handoff

Build 7A first. Do not wire competition progression around an unproven state machine. Once exhaustive pure tests are green, integrate automatic competition ownership, then add the persisted playable kick seam. If existing save architecture cannot persist one current shootout safely, re-plan that boundary rather than adding a parallel persistence system.
