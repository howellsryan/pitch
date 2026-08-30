# Post-R7 Career Depth Roadmap

> Strategic continuation after the R0-R7 redesign. This roadmap targets a **free, browser-first football career simulator** with FIFA/EA SPORTS FC Career Mode accessibility and ambition, while remaining **simulator-only**: there is no manual on-pitch football gameplay.

**Baseline:** `main` after PR #14 (`767b31656d58f00acc42431cc3bca6df131b1b5b`) — R0-R7 shipped.

**Benchmark reviewed:** EA SPORTS FC 27 Manager Career (Career Deep Dive, July 2026), with relevant Manager Market ideas carried forward from FC 26. This is not a parity checklist. Pitch should take the parts that create meaningful management decisions and, where a browser simulator has an advantage, go deeper systemically rather than imitate AAA presentation.

**Existing roadmap:** `ROADMAP.md` remains the historical/operational tracker for the gameplay-depth work already shipped (European ties, wages, contracts, board/job security, morale, academy investment, cloud save setup, etc.). This document is the strategic post-R7 continuation and folds the remaining old items into a dependency-aware programme.

---

## 1. Product direction

Pitch should become a **living football career**, not a collection of disconnected screens.

The strongest version of the game is:

- FIFA/EA SPORTS FC Career Mode-like in accessibility, pace and recognisable career loops;
- deeper than FIFA where simulation, history, tactics and consequences can be represented cheaply in data;
- much lighter than Football Manager in administration and UI burden;
- mobile-first and fast enough to play comfortably in a browser;
- fully usable without manually controlling footballers;
- capable of producing long-running careers whose stories emerge from the simulation rather than scripted linear content.

### Core rule: systems must feed systems

Every major new system should affect at least one other major system.

Examples:

- form affects match performance, morale, development, value and transfer interest;
- tactics affect results, fitness, recruitment fit and manager reputation;
- playing time affects morale, current level, contract behaviour and transfer requests;
- world results affect jobs, transfers, finances, stories and club reputation;
- scouting affects transfer risk rather than merely revealing decorative information;
- manager movement changes club tactics and therefore changes recruitment behaviour.

If an important number exists only to be displayed in the UI, it is probably not deep enough.

---

## 2. Simulator-only scope fence

Pitch does **not** want manual/live football play.

Do not roadmap:

- controller-based movement, shooting, passing or defending;
- playable set pieces;
- 11v11 manual training matches;
- skill games;
- Player Career gameplay;
- manual-match gameplay sliders whose only purpose is controller feel;
- cinematic features that do not change a management decision.

When FC introduces a manual-play feature that solves a useful management problem, translate the **purpose**, not the implementation. For example, FC's Practice Arena can inspire a simulated tactical scrimmage/report, not a playable training match.

The existing Broadcast match view remains a **watchable simulation/presentation layer**. It should become more causally faithful to the authoritative result engine, but it must not become manual football.

---

## 3. Post-R7 baseline: what Pitch already has

R0-R7 now provide a strong product shell and a meaningful career foundation:

- marketing entry, club selection and Continue/New Career flow;
- mobile-first navigation and responsive surfaces;
- Home season spine;
- combined Squad/Tactics surface;
- watchable Broadcast match presentation plus Quick Sim;
- dense Market and Table;
- Academy, Trophies, Settings and Inbox;
- 9 leagues / 186 clubs;
- English four-tier promotion/relegation and play-offs;
- domestic cups plus Champions League, Europa League and Conference League concepts;
- multi-season aging, retirement, player development and potential;
- injuries, fitness and form;
- 14 formation presets plus mentality controls;
- transfers, loans, inbound offers, AI-to-AI transfers and free agents;
- wages and contracts;
- board objectives and job security;
- stored team morale with gameplay effect;
- academy investment;
- trophy/honours history;
- local save/export/import and cloud-save infrastructure.

This is enough foundation to stop prioritising screen creation. The next programme should primarily add **simulation depth and interconnection**.

---

## 4. Correctness issues found during the final audit

These should be treated as roadmap input, not silently carried forward.

### 4.1 UEFA away-goals rule is obsolete

The existing European tie implementation/documentation uses an away-goals tiebreak. UEFA abolished the away-goals rule from the 2021/22 season. A level aggregate should proceed according to the current competition rules, without giving away goals extra value.

Reference: <https://www.uefa.com/news-media/news/026a-1298aeb73a7a-5b64cb68d920-1000--abolition-of-the-away-goals-rule-in-all-uefa-club-competi/>

### 4.2 UEFA league-phase formats need modernisation

Current UEFA club competitions use a 36-team league phase:

- Champions League: 8 league-phase matches;
- Europa League: 8 league-phase matches;
- Conference League: 6 league-phase matches;
- positions 1-8 advance directly to the round of 16;
- positions 9-24 enter two-legged knockout-phase play-offs;
- positions 25-36 are eliminated;
- later knockout placement is shaped by league-phase ranking/seeding.

Reference: <https://www.uefa.com/uefachampionsleague/accesslist/>

Pitch's European competition model should be data-driven enough that rule changes are not scattered through unrelated match/cup code.

### 4.3 Formation count is not the tactics gap

`matchEngine.js` already defines 14 formation presets. The gap is **tactical causality**: role instructions, pressing/build-up choices, tactical matchups, AI tactical identity and those choices materially changing simulation outcomes.

---

## 5. Gap matrix against the modern FC Career benchmark

| Area | Post-R7 Pitch | Strategic gap |
|---|---|---|
| Competition rules | Broad competition coverage, some simplified/outdated rules | Medium/high |
| World simulation | Richest around the user's current context | **Critical** |
| Historical world data | Trophy history exists; player/club season history is shallow | **Critical** |
| Formations | 14 presets | Low |
| Tactical instructions/roles | Mostly broad formation + mentality effects | **Critical** |
| Match-engine tactical causality | Functional result engine, limited tactical matchup depth | **Critical** |
| Player development | Potential + growth points + aging foundation | Medium |
| Dynamic current ability | No coherent FC27-like effective/current level | **Critical** |
| Individual morale | Team-level morale only | High |
| Squad roles / promises | Missing | High |
| Multiple positions | Limited/rigid primary-position model | High |
| Career growth profiles | Peak-age logic exists, trajectories still comparatively uniform | High |
| Injuries | Good catalogue/risk foundation | Medium |
| Return fitness / reinjury | Missing as a meaningful management phase | High |
| Transfers | Good basic market, values, negotiations and AI activity | Medium/high |
| Staged negotiations | Missing | High |
| Clauses / installments | Mostly missing | High |
| Player interest | Reputation-driven more than player-choice-driven | High |
| AI recruitment philosophy | Primarily rating/budget/squad logic | **Critical** |
| Club relationships/rivalries | Missing mechanically | Medium/high |
| Scouting | Market knowledge is too immediate/omniscient | **Critical** |
| Coaches/staff | Essentially absent | High |
| Training/development plans | Missing | High |
| Academy | Good intake/investment base | Medium |
| Loan development | Too shallow | High |
| Board/job security | Strong foundation | Low/medium |
| Manager career movement | Planned historically, not yet a full career market | **Critical** |
| AI managers | Missing | **Critical** |
| Club economy | Budgets/wages/prize money, limited operating model | High |
| Events/narratives | Inbox is informative rather than decision-driven | High |
| Press/fan pressure | Minimal | Medium/high |
| Career challenge creation | Missing | High replayability opportunity |
| Career save slots | Active career flow exists; multi-career model is limited | Medium/high |
| Simulation settings | Limited configurability | Medium |
| Content breadth | Strong 9-league base; non-English second tiers thin/missing | Medium |
| International management | Missing | Later breadth |
| Create-a-Club | Missing | Later breadth |

---


## 5.1 Delivery contract for future agents

This document is a **plan only**. P0-P12 are programme phases, not instructions to implement the entire phase in one pull request. Each phase below has a high-level delivery route and suggested commit slices so a later agent can pick it up without reopening the main product and architecture decisions.

### Phase packaging

- Start each phase from the latest green `main` on a dedicated branch and open a draft pull request after the first coherent slice.
- Treat each numbered work package as independently reviewable. Do not mix a later roadmap phase into the current phase merely because adjacent code is visible.
- Before changing IndexedDB, the event queue, simulation maths, module ordering or the data pipeline, run the repository's `plan-gate` process and record the affected invariants in the pull request.
- Reconcile `AGENTS.md` with the live plan at phase kickoff if its status is stale; do not create a second competing architecture guide.
- Keep every pushed commit runnable and every completed work package playable. Temporary adapters are acceptable only when they preserve existing saves and both Quick Sim and Broadcast flows.

### Commit and push cadence

For **every** roadmap phase:

1. commit and push the contract/test scaffold;
2. commit and push each domain or data-model slice;
3. commit and push persistence/migration work separately;
4. commit and push user-facing integration separately;
5. commit and push regression coverage, documentation and cleanup as the final slice.

Aim for small, named commits around coherent behaviour rather than one phase-sized commit. Push after every slice so CI and the preview can expose regressions early. Do not claim a phase complete until the final pushed SHA is green and its affected mobile flows have been exercised.

### Programme-wide definition of done

A phase is complete only when:

- old saves migrate or fail safely with an actionable recovery path;
- Quick Sim and Broadcast consume the same authoritative football outcome;
- deterministic unit/regression coverage exists for new domain rules;
- the 390px mobile journey works, with wider responsive checks where the surface changed;
- long-career storage and performance budgets have not regressed materially;
- `AGENTS.md`, the phase status and user-facing help/settings are updated where behaviour changed;
- the pull request explains shipped scope, deferred scope, migration impact and the next work package.

# 6. Priority roadmap

The order below is dependency-driven. A later phase may be designed early, but should not be fully implemented before the systems it depends on exist.

## P0 — Football authenticity and career foundation

**Priority:** immediate correctness/foundation pass.

### Build

1. Remove obsolete away-goals tiebreak behaviour from UEFA competitions.
2. Move UEFA competitions toward the current 36-team league-phase structures, including knockout-phase play-offs and ranking/seeding rules.
3. Audit domestic cup entry, replay/extra-time, two-leg and qualification assumptions rather than fixing UEFA only.
4. Introduce a clear competition-rules/data layer so tournament structure is not hard-coded across multiple unrelated modules.
5. Add proper multiple career slots locally and design cloud saves so multiple slots can be supported without another format rewrite.
6. Make each slot clearly show manager, club, season, current league position and last played date, with Continue / Export / Delete.
7. Add save-version/migration discipline before the next major schema expansion; the post-R7 programme will require persistent new fields.

### Acceptance

- Current European two-legged ties never use away goals as a tiebreak.
- UEFA league phases and qualification paths match the configured season's rules.
- Starting a second career does not require destroying/exporting the first.
- Existing `.pitch` saves remain importable through explicit migration/version handling.

### Delivery plan (high level)

**Locked decisions**

- Deliver competition rules and save architecture as two separate P0 work packages; both must finish before P1 expands persistent world state.
- Competition behaviour comes from one versioned rules definition consumed by fixtures, cups, standings and season rollover. Do not add a second tournament engine.
- Introduce a versioned save envelope with a stable `slotId`; existing careers migrate into a default first slot. Local and cloud storage share the same slot metadata contract even if cloud activation remains optional.
- New Career creates isolated records for the selected slot rather than relying on the current single-save assumption or clearing another career's data.

**Route**

1. Characterise current domestic and UEFA behaviour with deterministic rule tests, then remove away goals and correct aggregate/extra-time/penalty handling.
2. Extract competition format, entry, scheduling, tiebreak and advancement rules behind the existing event-queue flow; add the 36-team UEFA league phases without bypassing that queue.
3. Add the save envelope, ordered migrators and import/export compatibility before changing IndexedDB stores or keys.
4. Add slot-aware local repositories and then the Continue / New Career / Export / Delete UI. Extend the Worker/D1 contract only after local migration and rollback paths are proven.
5. Run multi-season competition tests, old-save fixtures, slot-isolation tests and mobile entry-flow E2E coverage.

**Commit/push slices:** rule characterisation; competition rules layer; UEFA format; save envelope/migrators; local slots; cloud-compatible contract; slot UI/E2E/docs.


---

## P1 — The Living Football World

**Priority:** #1 major feature.

This is the most important foundation for everything that follows.

Pitch should continuously simulate its football world, not merely manufacture enough context for the user's club.

### Build

For every supported league and associated competition, maintain real ongoing:

- fixtures and results;
- standings;
- cup progress;
- appearances and minutes;
- goals and assists;
- clean sheets;
- cards/suspensions;
- injuries;
- player form and match ratings;
- transfers and loans;
- club form;
- season awards.

Persist historical records by season:

**Player history**

- club(s);
- appearances/minutes;
- goals/assists/clean sheets;
- average rating;
- major injuries;
- transfer history;
- trophies and individual awards.

**Club history**

- league finish;
- manager;
- cup/European runs;
- trophies;
- record/significant transfers;
- seasonal budget/reputation trajectory.

**Competition history**

- champion/winner;
- promoted/relegated clubs;
- top scorer;
- top assists;
- clean sheets;
- player/team records where affordable to store.

### World longevity

Add a balanced generated-player/newgen pipeline so retirement does not slowly empty the world or inflate/deflate average quality. Generated players should inherit believable nationality, position, growth-profile and ability distributions from their football context rather than being arbitrary replacements.

### Performance constraint

Nine leagues are an advantage only if the browser remains fast. World simulation must be incremental/batched and benchmarked on mobile-class hardware. Do not run hundreds of Broadcast simulations; background fixtures use the authoritative fast match engine.

### Acceptance

If the user is managing Arsenal in October and inspects Barcelona, Dortmund or Ajax, that club has actually played a coherent season with inspectable form, players and statistics. A manager can make scouting and job decisions from real simulated history.

---

## P2 — Match Engine 2.0, Tactics and Manager DNA

**Priority:** #2.

Because Pitch is simulator-only, tactical decision quality is core gameplay.

### Keep the architecture boundary

- `matchEngine.js` remains authoritative for football outcomes.
- Broadcast remains a deterministic presentation/spatial layer around authoritative events.
- Do not let prettier Broadcast behaviour fabricate a different football result.

### Add team instructions

Examples:

- build-up: patient / balanced / direct;
- tempo: slow / balanced / fast;
- defensive line: low / mid / high;
- pressing: passive / standard / aggressive;
- width: narrow / balanced / wide;
- transition: hold shape / counter;
- chance creation: work ball / balanced / early delivery;
- defensive approach: compact / balanced / front-foot;
- set-piece priorities.

### Add player roles

Examples:

- poacher;
- target forward;
- false nine;
- inside forward;
- wide creator;
- advanced playmaker;
- deep playmaker;
- box-to-box midfielder;
- ball winner/anchor;
- ball-playing centre-back;
- stopper/cover defender;
- overlapping/inverted/full-back roles;
- goalkeeper/sweeper-keeper concepts where the engine can support them.

Roles should be constrained by the player's attributes/positions and should not be cosmetic labels.

### Tactical causality

Examples of desired trade-offs:

- high line increases territory/pressure but is vulnerable to pace/direct balls;
- aggressive press can create turnovers but costs fitness and can increase late-match vulnerability;
- narrow shape protects central zones but yields width/crossing opportunities;
- direct play can bypass midfield pressure but lowers possession/control;
- overlapping full-backs add attacking width but expose transition space;
- player-role suitability affects the value of a tactic.

### Opposition and AI

Give AI managers tactical profiles and allow them to adapt within sensible limits. Create pre-match opposition insights from actual world data: common shape, threat areas, form, likely style and key performers.

### Manager DNA

Track a manager's emerging identity from actual choices/results: preferred shapes, press intensity, possession/directness, youth use and risk profile. This later feeds job suitability, club identity and recruitment.

### Testability requirement

Simulation changes must gain deterministic/injectable RNG support and statistical regression tests. The existing standing risk — stochastic balance without a reliable automated gate — becomes unacceptable once tactics materially alter results.

---

## P3 — Player Model 2.0

**Priority:** #3.

Make squad selection and rotation produce consequences beyond energy and static potential.

### Separate player concepts

1. **Baseline ability** — durable football quality.
2. **Current effective level** — what the player is capable of now.
3. **Potential** — long-term ceiling, not perfectly known.
4. **Growth profile** — shape of development/peak/decline.
5. **Form** — recent performance.
6. **Individual morale/confidence** — personal state.
7. **Match fitness/sharpness** — preparedness separate from raw energy.
8. **Squad role** — crucial / important / rotation / squad / prospect.
9. **Playing-time expectation** — promised vs delivered involvement.
10. **Preferred positions** — multiple playable positions with varying suitability.
11. **Traits/style characteristics** — enough distinction that equal ratings do not imply identical players.

### Dynamic current level

Adopt the useful principle behind FC27 Dynamic OVR without copying it mechanically. Current performance should respond to form, morale, match fitness, injuries, minutes and competition for places while preserving an underlying baseline ability.

### Development

Evolve the current potential/growth-point system so sustained performance can influence long-term development and different players follow different growth profiles: early peak, normal, late development, extended peak, rapid decline, etc.

Potential should become an estimate/range in relevant UI rather than a perfectly known immutable truth.

### Injury return pathway

Move from binary injured/healthy to:

`injured -> rehabilitation -> medically available/high reinjury risk -> match fit`

The manager can accelerate a return at a meaningful risk rather than waiting for a boolean to flip.

### Acceptance

Rotation, development, selection, contracts, transfers and injuries all read from the same coherent player state rather than independent meters.

---

## P4 — Transfer Market and Contracts 2.0

**Priority:** #4.

The current transfer foundation is useful; now turn deals into an evolving process and make AI recruitment intentional.

### Staged deals

A transfer should progress through time, for example:

`interest/enquiry -> seller terms -> club negotiation -> player negotiation -> completion`

Deals should be capable of:

- rival bids;
- hijack attempts;
- changed asking prices;
- expiring offers;
- deadline pressure;
- a player choosing another club.

### Deal structures

Prioritise the structures that create decisions:

- installments;
- sell-on percentage;
- player exchange;
- loan-to-buy;
- loan-back;
- release clause;
- performance/appearance bonuses;
- future transfer arrangements where technically sensible.

### Contract negotiation

Add meaningful negotiation around:

- base wage;
- contract length;
- squad role;
- signing bonus;
- appearance/goal/clean-sheet bonuses;
- optional promotion/relegation salary clauses.

### Player interest

Interest should combine:

- club reputation;
- league/competition prestige;
- European football;
- wages;
- promised role;
- likelihood of minutes;
- manager/tactical fit;
- current club status;
- age/career stage;
- transfer request/unhappiness;
- selected rivalry/club-relationship constraints.

### AI recruitment

AI clubs should create needs before targets. Example:

> left-footed CB, under 25, strong enough for a high line, budget <= £30m

rather than simply buying one of the best affordable players.

Inputs should include squad depth, aging, contracts, injuries, tactical identity, club philosophy, finances and current performance.

### Transfer world

Maintain season-long transfer history, rumours/shortlist stories and visible competing activity so the market feels like a world rather than the user's shopping catalogue.

---

## P5 — Scouting, Coaching, Training and Squad Planning

**Priority:** #5.

Reduce omniscience without creating Football Manager-style admin overload.

### Scouting reports

Use a compact staged report model:

- **Current:** how good/effective is the player now?
- **Tactical:** how well would they fit our system/roles?
- **Future:** likely ceiling and growth profile, expressed with uncertainty;
- **Financial:** expected fee/wages/clauses;
- **Status:** happiness, likely availability and interest in joining.

Better scouts narrow uncertainty and complete reports faster. Do not hide every basic attribute purely to create grind.

### Coaches

Keep staffing deliberately lightweight. Coaching departments can map to Goalkeeping / Defence / Midfield / Attack, with quality and tactical/development specialisms.

Coaches should affect assessment and development quality, not provide giant arbitrary rating boosts.

### Training/development plans

Allow a player to focus on a small number of meaningful plans: finishing, creation, defensive work, physical development, role conversion, position conversion, recovery/sharpness etc.

### Squad planner

Add present and projected depth views:

- current XI/rotation/depth by role;
- contract expiry risks;
- aging risk;
- loaned players returning;
- academy players approaching first-team level;
- projected gaps in 1-3 seasons.

This should feed the recruitment model for both user and AI clubs.

### Simulator translation of Practice Arena

Optional: a **simulated tactical scrimmage/lab** against reserves that returns a report on shape, chance profile, possession, fatigue and vulnerabilities. Never make it manually playable.

---

## P6 — Manager Career and Living Manager Market

**Priority:** #6.

This absorbs and expands the old `ROADMAP.md` Manager Career Progression item.

### Manager profile

Persist:

- reputation;
- current club;
- clubs managed;
- matches / W-D-L;
- trophies;
- promotions/relegations;
- sackings/resignations;
- tactical DNA;
- youth-development reputation;
- financial/transfer reputation;
- notable achievements.

### User movement

Support:

- resignation;
- sacking;
- club approaches;
- applications;
- realistic vacancy offers;
- changing clubs without resetting football-world history.

### AI managers

AI clubs should have managers with tactical identity, reputation and job security. Managers can be sacked, poached, resign, retire or take new jobs.

A manager change should alter meaningful club behaviour:

`manager -> tactics -> squad-role fit -> recruitment needs -> transfers -> results`

This is where P1/P2/P4 become a single living system rather than separate features.

---

## P7 — Club Identity, Finance, Board and Facilities

**Priority:** #7.

Make clubs behave differently over many seasons.

### Club philosophy

Examples:

- youth factory;
- buy-to-sell;
- financially cautious;
- superstar recruitment;
- domestic-first;
- European ambition;
- possession identity;
- direct/high-intensity identity.

Club philosophy influences board objectives, manager fit, budgets and AI recruitment.

### Lightweight club economy

Track enough to create consequences without becoming an accounting simulator:

- transfer budget/cash position;
- wage bill;
- future transfer installments;
- competition/prize income;
- base/commercial income abstraction;
- debt/financial pressure;
- transfer revenue;
- academy/facility spending.

### Board evolution

Expand from one finish objective to a small weighted set of sporting, financial and youth expectations. Add warning states before dismissal and let club circumstances change expectations.

### Facilities

Optional persistent upgrades with clear mechanics:

- academy;
- training;
- medical/recovery;
- scouting network.

Avoid decorative upgrade trees that only add percentages without meaningful trade-offs.

---

## P8 — Story Engine, Press, Fans and Rivalries

**Priority:** #8.

R7's Inbox is the correct delivery surface. Turn it from a news log into a state-driven decision engine.

### Event design

Events should be triggered by real conditions wherever possible:

- captain repeatedly dropped;
- promised minutes not delivered;
- youngster wants a loan;
- star wants a new contract;
- player requests a transfer;
- teammate objects to a sale;
- dressing-room disagreement;
- disciplinary/training issue;
- early return from injury decision;
- owner changes expectations;
- budget cut or financial problem;
- points deduction/appeal scenario;
- supporter anger after major sale/derby run;
- board pressure after poor form;
- takeover/investment event;
- manager/club rivalry narrative.

Events may chain across several weeks and remember previous decisions.

### Choices

Avoid obvious good/bad dialogue options. Decisions should trade one benefit against another: player vs squad, short-term performance vs injury risk, finances vs morale, star retention vs wage structure, youth minutes vs immediate results.

### Press

Use press moments sparingly at genuinely important points: derby, final, title/relegation run-in, major transfer saga, serious internal event. Answers should connect to real player/squad/board state.

### Fan/media pressure

Keep these mostly as inputs, not permanent dashboard clutter. They can influence board confidence, event probability and narrative tone.

---

## P9 — Academy, Loans and Development Pathways 2.0

**Priority:** #9.

Build on the existing Academy and investment systems.

### Youth scouting

Allow regional assignments and broad briefs such as position group, physical/technical preference or tactical role. Quality should be uncertain until observed/developed.

### Academy development

Add:

- development plans;
- academy/youth match simulation;
- form/development evidence;
- role/position growth;
- clearer path to first-team readiness.

### Loans

A loaned player should actually live inside the world simulation:

- appearances/minutes;
- match ratings;
- form/morale;
- development;
- injuries;
- club tactical fit.

Provide periodic loan reports and recall rules where agreements allow.

AI clubs should request loans to solve genuine squad needs.

---

## P10 — Career Setup, Difficulty and Simulation Controls

**Priority:** #10, with pieces allowed to land alongside earlier phases.

Depth should be configurable rather than forcing every user into maximum simulation complexity.

### Presets

- Casual;
- Authentic;
- Hardcore;
- Custom.

### Candidate controls

- simulation variance;
- injury frequency;
- reinjury severity;
- transfer strictness/activity;
- board strictness;
- financial pressure;
- scouting uncertainty;
- development speed;
- event frequency;
- AI transfer activity;
- optional world-simulation breadth if performance requires it.

All presets must be documented/config-driven so balance can be changed without branching game logic everywhere.

---

## P11 — Creator Challenges and Live Careers

**Priority:** #11; major replayability/community opportunity.

Pitch's browser/data-driven nature makes this unusually suitable.

### Challenge definition

A challenge can define:

- club;
- season/date/gameweek;
- table position/points;
- squad edits/injuries/suspensions;
- budget/debt;
- transfer embargo;
- points deduction;
- nationality/age/signing restrictions;
- academy-only or homegrown rules;
- tactical restrictions;
- objectives and completion conditions.

Examples:

- survive with six matches left and five points to recover;
- take a League Two club into Europe using academy graduates only;
- recover from administration with debt and a transfer embargo;
- win Europe without signing anyone over 23;
- save a giant from relegation;
- sell every player over 30 and rebuild.

### Sharing

Start with a compact versioned JSON definition. Later add Cloudflare-backed short share codes, discovery, completion counts and voting/moderation if the community feature proves useful.

### Live starts

Real-world live start points are a later extension of the same architecture, but require a reliable, legal and maintainable current-data pipeline before becoming a product promise.

---

## P12 — Long-term content expansion

**Priority:** after systemic depth.

### First expansion: non-English second tiers

Prioritise second divisions in Spain, Germany, Italy and France ahead of simply adding more top-flight-only countries. They dramatically improve manager-career movement, promotion stories and the living world.

The repo already has/prepares data concepts for several additional second tiers; complete them with the same reconciliation/data-quality standards as existing leagues.

### Later candidates

- international management with qualification and major tournaments;
- Create-a-Club using bespoke/unlicensed visual identity;
- more leagues where data quality can be maintained;
- women's club football as a deliberate content expansion;
- deeper continental qualification/coefficient systems.

Content breadth must not outrun simulation quality or data maintenance capacity.

---

# 7. Existing roadmap items: where they now live

| Existing `ROADMAP.md` item | Treatment |
|---|---|
| Two-legged European knockouts | Keep shipped foundation, correct obsolete away-goals rule in P0 |
| Wages | Keep shipped; expand economy in P7 |
| Contracts | Keep shipped; expand negotiation/clauses in P4 |
| Board objectives/job security | Keep shipped; expand in P7 and feed P6/P8 |
| Team morale | Keep shipped; add individual morale in P3 |
| Academy investment | Keep shipped; expand pathways in P9 |
| Cloud save / Google | Keep operational work tracked in `ROADMAP.md`; design P0 save slots to be cloud-compatible |
| Manager career progression | Superseded/expanded by P6 |
| Data completeness polish | Ongoing hygiene; major league breadth moves to P12 |
| Club badges | Visual polish can ship opportunistically; not a blocker for systemic phases |

---

# 8. R8 quality/PWA remains a parallel quality stream

The redesign plan already defines R8 as quality floor, light mode and PWA work. Keep that separate from P0-P12 rather than renumbering it into gameplay depth.

R8 should continue to cover:

- light-mode token set;
- PWA install/offline expectations;
- real-device iOS/Android passes;
- reduced motion;
- focus-visible/accessibility;
- 320/390/768/1280 responsive validation;
- club accent contrast checks.

Gameplay phases must not be allowed to regress this quality floor.

---

# 9. Engineering guardrails for the programme

## 9.1 Preserve authoritative simulation boundaries

Broadcast may visualise outcomes; it must not become a second conflicting result engine.

## 9.2 Deterministic balance testing before deeper simulation maths

Injectable/seeded RNG and statistical regression tests should be established before large P2/P3 changes. A green UI/build suite cannot prove goal rates, tactical advantages or development distributions are sane.

## 9.3 Add a real persistence migration path

P1 onward introduces substantial persistent state. Do not rely on ad-hoc backfills forever. Version save envelopes and migrate old saves explicitly.

## 9.4 Mobile performance is a product requirement

Benchmark world-simulation batches, IndexedDB size and career-load time as history grows. A 15-season career must remain usable on a phone.

## 9.5 Avoid unnecessary server authority

Pitch is primarily a single-player simulator. Keep deterministic gameplay/local simulation client-side unless server authority is required for community/shared features, account data, abuse prevention or future competitive systems.

## 9.6 Data/licensing discipline

Do not solve content gaps by importing assets/data that create licensing risk. Bespoke club identity and maintainable data pipelines are preferable to copying protected game assets.

## 9.7 Every phase ends playable

Follow the existing plan discipline: no phase may leave the career half-migrated or one route dependent on unfinished follow-up work. Build, lint, unit tests and browser tests must pass before a phase is considered complete.

---

# 10. Recommended execution order

| Order | Phase | Primary payoff |
|---:|---|---|
| 0 | P0 — authenticity + save/migration foundation | Correctness and safe foundation |
| 1 | P1 — Living Football World | The game becomes a persistent football universe |
| 2 | P2 — Match Engine 2.0 + Tactics/Manager DNA | Core simulator gameplay depth |
| 3 | P3 — Player Model 2.0 | Meaningful selection, rotation and development |
| 4 | P4 — Transfers/Contracts 2.0 | Rich recurring squad-building loop |
| 5 | P5 — Scouting/Coaching/Training | Less omniscience; strategic planning |
| 6 | P6 — Manager Career + AI Manager Market | A career across clubs, not one club forever |
| 7 | P7 — Club/Finance/Board ecosystem | Clubs gain persistent identities and pressures |
| 8 | P8 — Story/Press/Fans/Rivalries | Systems turn into memorable narratives |
| 9 | P9 — Academy/Loans 2.0 | Deep long-term player pathways |
| 10 | P10 — Career settings | Depth remains approachable/configurable |
| 11 | P11 — Creator Challenges/Live starts | Replayability and community sharing |
| 12 | P12 — Second tiers/internationals/Create-a-Club/content | Breadth after depth |

---

# 11. North-star career test

A mature version of this roadmap should make the following career possible without special scripting:

> A manager starts at a League Two club, develops a late-blooming academy midfielder, builds a pressing identity, earns promotion, loses the midfielder to a richer rival after a staged transfer saga, gets recruited by a struggling Championship club whose previous manager was sacked, changes their recruitment to fit the new tactic, reaches the Premier League, later takes a Bundesliga job, finds the former academy player has developed into an international-level star in another simulated league, and eventually meets his club in Europe — with every table, transfer, manager move and player season having actually occurred inside the saved football world.

If Pitch can routinely produce stories like that from interacting systems, it will have moved materially toward the best parts of modern FIFA/EA SPORTS FC Career Mode while retaining a distinct simulator identity.

---

# 12. Benchmark references

These references are for product benchmarking and football-rule verification, not implementation copying:

- EA SPORTS FC 27 Career Deep Dive: <https://forums.ea.com/blog/ea-sports-fc-game-info-hub-en/ea-sports-fc%E2%84%A2-27--career-deep-dive/13603463>
- UEFA away-goals abolition: <https://www.uefa.com/news-media/news/026a-1298aeb73a7a-5b64cb68d920-1000--abolition-of-the-away-goals-rule-in-all-uefa-club-competi/>
- UEFA current club competition league-phase overview: <https://www.uefa.com/uefachampionsleague/accesslist/>

Re-review the external benchmark before implementing later phases: FC features and real competition formats will continue to change, while this document's product principles should remain stable.
