# Playable Key Moments — Phase 6 Evidence

Status: **PASS — engineering / architecture gate**

Phase 6 extends the single authoritative Playable Key Moments pipeline with headers, volleys and broader goalkeeper-save presentation. It does not introduce a second football engine, a second persistence queue, hidden player ratings, external animation assets, Blender work, or Phase 7 shootout state.

## Delivered scope

### Contact vocabulary

The authoritative resolver can now prepare and commit four engine-owned finishing contacts:

- standing header
- running header
- volley
- half-volley

A contact is only eligible after the existing authoritative continuation has succeeded and produced a downstream chance. The user cannot substitute the shooter, defender, contact type or upstream service.

The contact action is versioned (`MATCH_CONTACT_ACTION_VERSION = 1`) and carries pre-finish geometry, contact height, source continuation family, canonical participants and bounded xG. The match action resolver advances to version 5 while retaining RNG packet version 1 and the unchanged 14 packet fields.

### Canonical football inputs

No synthetic `heading`, `volley`, `reflexes` or hidden Phase 6 ratings were introduced.

- standing headers: shooting + physical + pace
- running headers: shooting + physical + pace with more pace weight
- volleys / half-volleys: shooting + physical + pace
- pressure: defending + physical + pace
- saves: the existing effective goalkeeping attribute

User input contributes placement, power and timing only. Calibration proves that strong execution improves the result without allowing a weak player to erase a large canonical ability gap.

### Goalkeeper interventions

Save authority remains unchanged: an intervention is classified only **after** the resolver has decided `finish: 'saved'`.

Supported presentation semantics are:

- catch
- parry
- smother
- spread

Ordinary automatic and interactive ground shots can carry the same intervention metadata without changing whether they were goals or saves. Legacy saved presentation without intervention metadata still defaults to the established parry animation.

### Persistence and idempotency

Phase 6 keeps the existing one-pending-moment architecture.

When a contact is selected, the persisted continuation contains:

1. the same prepared authoritative phase,
2. the already-authorized successful upstream continuation,
3. the versioned contact action.

One resume commits one ledger record, one shot/xG contribution and at most one goal. A rejected contact candidate returns to the original automatic continuation rather than committing the playable-only enriched action.

No new database table, queue, save envelope version or rebound-style second pending state was required.

### Procedural presentation

The existing Three.js procedural pipeline remains the only renderer path.

Phase 6 adds deterministic motion for:

- incoming ball flight to the authoritative contact point,
- standing header body/head contact,
- stronger running-header approach/jump,
- volley leg/body contact,
- lower half-volley contact,
- goalkeeper catch/hold,
- parry rebound,
- low smother,
- spread-style intervention,
- bounded recovery to neutral poses.

All geometry/motion remains authored in code. No paid/free downloaded animation pack, external player model, stadium asset or Blender operation was introduced.

The in-match overlay now describes header/volley semantics explicitly and explains that contact type, attacker and upstream service are authoritative while user placement/power/timing remain bounded by player and keeper quality.

## Verification

Implementation verification head before this evidence-only commit:

`d1303ae5ba15cdab0e59a81b6b8523fce34b3b12`

GitHub `Build and validate`: **PASS**

- `npm ci`: PASS, 0 vulnerabilities on the preceding full run
- legacy build: PASS
- Vite application build: PASS
- lint: PASS
- Vitest: **130 files, 1,016 tests PASS**
- Phase 6 contact-domain tests: PASS
- Phase 6 motion tests: **8/8 PASS**
- Phase 6 calibration matrix: **16/16 PASS**
- Phase 6 real-match integration: **2/2 PASS**
- existing Playable Moments POC regression pack: **16/16 PASS**
- UI emoji audit: PASS
- unchanged standard match-balance gate: **3,000 simulations PASS**
- unchanged deep match calibration: **5,000 simulations PASS**
- accent audit: PASS
- artifact upload: PASS

GitHub `Agent workflows`: **PASS**

Cloudflare `Workers Builds: pitch`: **PASS**

Stable branch preview:

`https://feat-playable-key-moments-phase6-pitch.rlh.workers.dev`

Verified implementation-version preview:

`https://43ab9d6e-pitch.rlh.workers.dev`

## Regression / authority review

The final Phase 6 diff was reviewed specifically for:

- second-engine drift — none introduced;
- RNG packet widening — remains version 1 / 14 fields;
- automatic Quick Sim / Watch Match result drift — existing 3,000 + 5,000 gates remain green;
- user-controlled participant substitution — rejected by contact resolver;
- visual finish disagreement — target/contact/keeper presentation comes from the committed authoritative result;
- duplicate ledger/xG/goal writes — real-match integration proves one phase record and at most one goal;
- renderer authority — renderer consumes moment + resolution only;
- legacy flattened-bundle helper collisions — new Phase 6 helpers are namespaced;
- Phase 7 leakage — no shootout state or competition progression changes are included.

## Human-observable boundary

As with earlier Playable Key Moments phases, CI cannot honestly certify subjective game feel, mobile touch feel or visual quality on the user's physical device. The branch preview above is the product-review surface for those observations.

No browser/E2E suite was added to manufacture visual evidence; the repository's existing verification policy remains intact.

## Phase 6 exit classification

**Engineering / architecture: PASS.**

The implementation now satisfies the Phase 6 roadmap fence: headers and volleys are authoritative bounded interactions, goalkeeper saves are materially distinct without becoming result authority, canonical player/keeper quality remains causal, ground interactions remain regression-covered, and the unattended procedural asset/motion pipeline is preserved.

Phase 7 may now build from this exact architecture without changing the Phase 6 authority boundary.
