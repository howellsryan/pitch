# Playable Key Moments — Phase 6 plan gate

## Goal

Deliver Phase 6 on top of the consolidated Playable Key Moments stack: authoritative/playable headers, running headers, volleys and half-volleys plus broader goalkeeper save semantics, without introducing a second match engine, continuous movement, external animation assets, Blender work, or Phase 7 shootout behaviour.

## Live baseline

- Integration base: PR #35 head `aedf70f67e91095ea9c15e1414ecb550823be88e`.
- Current PR #35 head has green GitHub build/skills checks and a successful Cloudflare Workers preview build.
- Existing Play Key Moments session contract has exactly one durable pending interaction and one committed receipt.
- Phase 5 already owns final-pass / through-ball / cutback / cross continuation actions. A cosmetic rebound was deliberately deferred because a genuine post-shot second stage needs a multi-stage pending contract.
- `matchEngine.js` remains authoritative; renderers return normalized intent only.
- Existing 14-field RNG packet and T7 3,000/5,000 balance guardrails are not to be weakened.

## Unknowns and verification

1. **Can Phase 6 produce a genuine finishing contact without adding the multi-stage pending model deferred from Phase 5?**
   - Verify by deriving a contact opportunity only after a deterministic engine-owned continuation preview succeeds and creates a downstream chance, then persisting that contact plan as the *single* pending interaction before terminal finish.
   - Ordinary Quick Sim / Watch Match must remain on the existing automatic path.

2. **Can the current procedural Three.js figure produce materially different headers/volleys without external animation assets?**
   - Verify with deterministic motion-frame tests for contact height, approach/jump/kick differences, mirror behaviour and bounded pose values.
   - Verify the deployed branch preview visually at mobile and wider widths when available.

3. **Can goalkeeper catch/parry/smother/spread semantics be authoritative without changing who decides goal vs save?**
   - Classify only after the authoritative save decision using target, xG/context, power, keeper intent/reach and canonical goalkeeping ability.
   - Tests must prove renderer/presentation cannot promote a goal into a save or vice versa.

## Success criteria

- Pure, versioned Phase 6 contact domain covers at least:
  - standing header;
  - running header;
  - volley;
  - half-volley.
- Contact actor/type is engine-owned and prepared pre-finish; presentation cannot choose the shooter/contact family.
- Continuation failure never produces a contact attempt.
- Contact resolution remains sensitive to canonical existing attributes only (shooting / physical / pace plus defensive context); no hidden heading/volley rating is introduced.
- Perfect input cannot make a weak player perform like an elite player across the deterministic calibration matrix.
- Saved playable shots can authoritatively distinguish catch / parry / smother / spread-style interventions where context permits, while `finish:'saved'` remains the governing result.
- Contact/save presentation is coherent with the committed result and uses the existing procedural, licence-free renderer path.
- Renderer failure resolves the same saved pending moment automatically.
- Earlier ground shot, penalty, direct-free-kick and continuation interactions stay regression-covered.
- Fresh final-head verification passes:
  - `npm run build:legacy`;
  - `npm run build:app`;
  - `npm run lint`;
  - `npm run test`;
  - unchanged 3,000-simulation standard balance gate;
  - unchanged 5,000-simulation T7 deep guardrail;
  - `npm run check:accents`.
- Cloudflare branch-preview check succeeds for the final pushed SHA.

## Delivery steps

1. Add a pure Phase 6 contact/keeper domain and deterministic tests.
2. Integrate playable-only pre-finish contact preparation into the existing continuation seam, keeping the one-pending session lifecycle.
3. Resolve contact shots through the authoritative match resolver and ledger without duplicate possession/chance/shot/stat writes.
4. Extend the existing procedural Three.js shot scene and overlay for contact-specific motion/input/result language and broader keeper actions.
5. Add deterministic Phase 6 calibration and integration/regression coverage.
6. Review the actual diff for authority leaks, persistence issues, duplicate stats, unnecessary scope and test quality.
7. Run the complete repository + Cloudflare verification, write evidence/handoff, then open the Phase 6 PR against PR #35's integration branch.

## Edge cases

- continuation preview fails or succeeds without a downstream chance;
- controlled team is defending and receives a goalkeeper contact moment;
- high/low/wide contact target coherence;
- weak attacker with near-perfect input;
- elite attacker under strong pressure;
- low/high keeper quality against the same contact;
- catch classification on an impossible high-power/wide ball must be rejected;
- renderer failure / reduced motion / Simulate path;
- phase and RNG cursor advance exactly once;
- one contact attempt produces one ledger shot, one xG contribution and at most one goal event.

## Out of scope

- rebounds / second balls and their multi-stage persistence;
- playable corners as a new family;
- shootout rules or Phase 7 competition changes;
- new durable player attributes such as heading, jumping, volleying or reflexes;
- continuous/manual 11v11 control;
- external paid/free animation-pack dependency;
- user-operated or scripted Blender pipeline;
- Phase 8 audio/replay/quality-tier polish.

## Architecture preference

Keep the existing one-pending interaction contract. For Play Key Moments only, a continuation may be deterministically previewed using pre-finish packet fields to establish whether a genuine receiving contact exists. If it does, persist the engine-owned contact plan and expose the finishing contact as the single pending moment. The resolver then commits the upstream continuation plus the contact shot atomically in the existing authoritative phase. If the live code cannot support this without result leakage or duplicate authority, stop and re-plan rather than forcing the design.
