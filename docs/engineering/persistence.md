# Persistence and server contracts

Read before save, IndexedDB, migration or cloud changes. Paths are repository-relative.

### Persistence / career slots — P0 foundation

- IndexedDB access lives in `src/modules/db.js`; domain code should not open ad-hoc databases.
- Save envelope is **V2** with `schemaVersion` and stable `slotId`. Existing V1 `.pitch` saves migrate explicitly; future persistent changes must extend the ordered migration path rather than rely on ad-hoc backfills.
- Multiple careers are isolated by slot:
  - `legacy` keeps the original physical `pitch_fc` database so pre-P0 browsers remain discoverable;
  - deleting/resetting the legacy career **clears its stores in place** — do not physically delete/recreate that compatibility database;
  - generated career slots use separate `pitch_fc_slot_<slotId>` databases and may be physically deleted.
- New Career allocates an isolated slot only when a career/import is actually committed. Backing out must leave the existing active career untouched.
- Career Menu metadata contract: manager, club, season, league, league position, gameweek, last played, save schema version; UI adds active state separately.
- Local export/import and cloud save use the same versioned envelope/slot metadata contract.
- Cloud save API/D1 is slot-aware: rows are keyed by `(user_id, slot_id)`; pre-P0 cloud rows migrate to `legacy`.
- P1 legacy/current careers backfill living-world state through the existing migration/backfill path; do not require users to destroy a P0 career to gain the world model.
- Living-world backfill compacts only already-applied background cup records. The player/projection checkpoint clears their transient football payload atomically with its apply-once flag; pending records remain recoverable. Scores, seeds, versions, goals and competition history remain available without retaining weekly fitness updates and full tactical objects in the active save.
- P3 uses additive, idempotent player-row/domain backfills and does not increment `DB_VERSION` merely to add fields to existing rows. Preserve that pattern for compatible player-contract extensions.
- Managed match completion uses `db.commitMatchEventAtomic`: canonical league fixture or cup participant rows, cup progress, Manager DNA and queue consumption commit together. Failure aborts the whole checkpoint. The transaction re-reads the save and rejects a changed queue head.
- `pendingEventsWeekKey` identifies an initialized queue for the current season/week, including an empty queue awaiting world closeout. Its absence on older saves uses the normal queue builder; advancing the world week clears it. `lastResolvedEvent` retains one compact receipt so retrying a committed Broadcast result cannot consume the following event. These optional V2 fields do not create another save lifecycle or retain an unbounded result history.
- Season rollover runs inside `db.runSeasonRolloverAtomic`. All store reads and writes use the same transaction, including asynchronous domain work; aborting preserves the outgoing calendar, players, finances and history together. Keep rollover helpers on the normal database accessors so they participate in that transaction.
- Resignation and accepted club handover use `db.runCareerTransitionAtomic`, the same transaction owner. Manager status, club ownership and the saved vacancy or pending handover commit together; a failed write keeps the previous employment state and allows the handover to retry safely.
- Historical player detail is bounded: the latest completed world season stays detailed; three recent completed seasons keep individual contributor and academy totals. Earlier seasons retain world leaders/award winners, and every season keeps tables, awards, club summaries and detailed rows for that season's managed club. `compactHistoricalSeason` preserves retained IDs and registration clubs, omits idle unattached rows, and never mutates its input. Rollover compacts older records in the existing transaction. `ensureSeasonHistoryCompaction` backfills old/imported careers once during `initApp`, keeping the latest archive detailed and publishing its version-two marker atomically with the compacted rows. Do not delete active players to reduce archive size.
- Import validates the envelope before changing data, then clears and restores the target slot in one transaction. A failed restore preserves that slot's existing contents and restores the prior active-slot pointer, including failure to open the destination database.
- Empty-device cloud recovery discovers generated remote slots and restores the latest backup only while no local career exists. Recheck local state after network waits. Uploads currently replace a slot's backup; simultaneous devices have no conflict resolution, so the UI advises using one device at a time.

## 4) Server/cloud boundary

- `functions/` is Pitch's only server-side code: Worker request routing, Google OAuth/session support and D1 cloud saves.
- Pitch remains playable without an account; server authority is not required for core single-player simulation.
- `functions/_worker.js` manually dispatches API routes then falls through to `env.ASSETS.fetch(request)`.
- D1 migrations live in `migrations/`; P0 added the slot-aware saves migration. Treat migration order as production data history.
- Never put secrets in the repo. Cloudflare bindings/secrets are deployment configuration.

