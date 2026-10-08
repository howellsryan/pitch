# Playing and understanding Pitch

Pitch is a single-player football management simulator designed for a quick
browser session or a career across many seasons. You control selection,
recruitment and tactics; the simulation controls football outcomes.

## Your first week

Choose a club using its starting budget and squad strength. Strong clubs make
recruitment easier, but bring higher board expectations. Lower-division clubs
provide a promotion challenge with tighter finances.

**Home** shows the season rail, the next event, recent results and decisions
waiting in your inbox. **Squad** combines the team sheet with tactics: select
the XI, name a bench, choose a formation and review player availability.
Automatic selection remains available if you do not want to name every seat.

**Play** opens team news. An injured or suspended player in a manually selected
XI needs attention before kickoff. Choose **Sim Instantly** for a result or
**Kick Off** to watch Broadcast. Broadcast can be paused or accelerated and
lets you make tactical changes and substitutions. Continue through full time
to commit the result and see its effect on the table.

Some gameweeks contain multiple events. A league match and a cup tie sharing
one week require separate Play actions; the week advances after its event
queue is empty. Every other supported league also progresses through the
same world clock.

## Management decisions

| Surface | Decisions and consequences |
| --- | --- |
| Squad | XI, bench, formations, instructions, player roles and contracts; availability, fitness and suitability affect performance |
| Market | Scout players, negotiate club offers and wages, buy, sell or loan players; cash, obligations and player interest constrain deals |
| Academy | Invest, scout youth regions, review prospects, assign development plans and promote or release players |
| Table | Inspect supported leagues, European standings, club profiles and recent results |
| Inbox | Read match and transfer news and respond to career decisions |
| Settings | Export/import, manage the career, inspect finances, upgrade facilities and access the manager job market |

Scouting intentionally limits what you know about outside players. Reports
become more precise with confidence and dedicated assignments. Recruitment
filters and sorting use those observed estimates, so a fogged ability figure
is meaningful.

Transfer offers support an upfront fee and an optional deferred installment;
the fee structure schedules actual payments. Personal terms support wage,
contract length, squad role, signing bonus and a release clause. Standard loan
enquiries include the loan fee and wage contribution. Sell-on percentages and
loan options or obligations to buy are not executed in the current product,
so new offers do not present or automatically add those terms. Older saves
can retain their recorded terms without gaining an unsupported payout or
purchase action.

Training, coaching, match participation, age and development profiles shape
players over time. Injuries can require rehabilitation; an available player
is not necessarily ready for a full match. Squad roles and playing time also
affect individual morale and contract behaviour.

Club finances settle operating income and wages each world week. The starting
income baseline is fixed against the initial wage bill and reputation;
recruitment or staff upgrades raise costs without automatically raising that
income. Transfer commitments, facilities and season prize money also affect
cash. Board objectives give the career goals beyond a single fixture.
Manager jobs support resigning, applying, accepting approaches and taking over
a different club. While unemployed, advance the world and look for jobs from
Home instead of continuing to control the former club.

## Competitions and seasons

All nine supported leagues play matches through the authoritative engine;
background matches use its fast path. Player and club statistics derive from
completed results. Season rollover creates new fixtures and retains compact
history while handling development, aging, contracts and retirements.
The latest completed season retains detailed world player registrations; the
three most recent completed seasons retain individual world player and academy
totals. Earlier seasons retain leaders, award winners, tables, awards and club
history. Detailed player registrations and injury lists remain for each season's
managed club throughout the career. Idle unattached players without a
contribution do not get repeated archive rows.

England's supported divisions exchange clubs through promotion, relegation
and play-offs. Championship promotion uses two automatic places and a
3rd–6th play-off; League One uses the same promotion path with four relegation
places. League Two uses three automatic places and a 4th–7th play-off.
There is no simulated division below League Two.
Play-offs resolve automatically at season close using the match engine and the
outgoing squads. Their compact scores and winners are retained; detailed player
statistics and availability changes between play-off legs are not yet projected.

Domestic competitions use their configured entry rounds, match dates and tie
rules. Champions League and Europa League have eight league-phase matches;
Conference League has six. Their 36-team tables send the top eight directly
to the round of 16, positions 9–24 to knockout play-offs and the remaining
clubs out. Level two-legged aggregates do not use away goals.

## Saves and devices

Local play does not require an account. Careers occupy independent IndexedDB
slots in the browser, and the main menu can create or delete individual slots.
Export a `.pitch` file or save code from Settings to move a career between
devices. Import from a new-career picker creates a separate slot; importing
from an existing career replaces only that active slot.

Google sign-in/cloud-save routes are implemented, but availability depends on
the host's OAuth, D1 and secret configuration. Local saves and file transfers
do not depend on those services. A data refresh updates new careers; an
existing career's players remain its own evolving world.

## Data and format limits

The checked-in data contains **181 clubs and 5,092 players** in nine leagues.
The roster refresh report was generated **4 September 2026**, referencing
**1 September 2026** and the public EA SPORTS FC 27 feed. Club affiliation,
position and aggregate ability come from that snapshot; this is not a live
transfer feed.

The feed did not supply usable ages in that run: all 5,092 ages used existing
metadata or the importer's age-24 fallback. Consequently 3,012 starting rows
are age 24. Those ages are simulation inputs and are not a verified current
age database. Potential, wage and value also use retained or generated game
data rather than a claim of current real-world contracts.

The current CSV snapshot has four aggregate ability fields. Fine-grained
pace, shooting, passing, dribbling, defending and physical profiles can be
derived from those aggregates; the pipeline supports explicit detailed
profiles when a subsequent reviewed import supplies them.

League Two currently contains 22 clubs and the Eredivisie 15. Continental
second tiers and National League clubs are not modeled. European qualification
uses Pitch's simplified top-four/top-six/seventh-place allocation for supported
top divisions, rather than every nation's current access list or coefficient.
New careers begin in **2026/27** with the checked-in roster snapshot; the career
calendar is fixed rather than a real-date live start. Imported careers keep
their original season and dates.

## Product decisions

- **Simulator-only:** matches offer watchable football and management choices
  without manual movement, shooting or controller gameplay.
- **One result engine:** Quick Sim, Broadcast and the background world share
  football outcome ownership. Broadcast presents those outcomes.
- **One event queue:** one action resolves one pending event; only an empty
  queue advances the world week, keeping league and cup matches together.
- **Browser-first:** local storage and independent slots make an account
  optional; export/import gives a portable recovery path.
- **Bounded history:** previous seasons retain summaries instead of unlimited
  action ledgers, so long careers remain manageable.

For implementation ownership and invariants, see
[AGENTS.md](../AGENTS.md), the [simulation contract](engineering/simulation.md)
and the [persistence contract](engineering/persistence.md). Roadmaps are planning
and historical records; this guide describes the current playable surfaces.
