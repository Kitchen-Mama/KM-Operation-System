# S8 Fatigue Run Log

The durable, reviewable, diffable record of every S8 fatigue run. One row per run, newest last.

**There is no database test-run table and there will not be one** (S8-R1 §12, S8-R2 §9). Run metadata lives in
exactly two places, and neither is a schema change:

1. **Script Properties**, key `S8T_RUN_<RUN_ID>` — the runtime copy, written by the harness, read by the cleanup
   tool. Not a new mechanism: `11_shipping_plan_handlers.gs:842-865` already keeps a durable rollback journal
   there. It needs no OAuth scope and survives execution boundaries.
2. **This file** — the committed record. A Script Property can be cleared; a commit cannot.

`recommendation_calculation_runs` was evaluated as a host and rejected: its columns are recommendation-specific
and its rows are read by the recommendation workspace, so fatigue rows there would make a production reader see
records of a kind it has no model for.

---

## The manifest is the cleanup authority

The full manifest shape is produced by `KMS8RUN.newManifest()` in
[assets/tools/s8-fatigue/s8-run-identity.js](../../assets/tools/s8-fatigue/s8-run-identity.js) and is the
**only** thing cleanup is allowed to believe. Its `created_entity_ids` map is the candidate list; cleanup
replays it. It never scans.

A row that matches the `S8T` namespace but is absent from the manifest is **LEAK / INVESTIGATION**, never a
delete candidate — it means either the manifest is wrong or something else is writing into the namespace, and
deleting it destroys the only evidence that would say which.

```
run_id            S8T-<YYYYMMDD>-R<NNN>
test_actor        S8_FATIGUE_TEST
status            PLANNED → RUNNING → { READY_FOR_CLEANUP | FAILED_RETAINED }
                  READY_FOR_CLEANUP → { CLEANED | CLEANUP_FAILED }
                  FAILED_RETAINED is a REFUSAL state — only an explicit operator decision releases it
scope             the business dimensions this run occupies (§13)
tier              T1 | T2 | T3 | T4 | T5
started_at / finished_at
created_entity_ids            { table: [id, ...] }   ← THE cleanup authority
touched_inventory_identities  { table, warehouse_id, sku, axis, before, after, evidence_movement_id }
movement_ids                  retained permanently; never a cleanup candidate
document_ids / drive_folder_names
cleanup                       dry_run_at, executed_at, confirmation_checksum, candidates_by_table,
                              deleted_by_table, retained_by_policy, reconciled_inventory_identities,
                              reservations_released, guard_refusals, post_cleanup_candidate_count
leak_count / leaked_rows
non_test_row_touched_count    MUST be 0. Any value above 0 halts the S8 programme.
```

## S8T identity — CLOSED, operator-executed 2026-10-03

The live collision census was run manually in the Production Apps Script project and the namespace is
approved. Recorded here because a Script Property can be cleared and a commit cannot.

```
CENSUS_COMPLETE            = true
LIVE_S8T_COLLISION_COUNT   = 0      namespace 0 · actor 0 · lineage_type 0
tables_scanned             = 57     (58 registered; replenishment_demand_allocation_rules is absent)
EXTRA_TABS_NOT_IN_REGISTRY = 43     all UNAUTHORIZED_UNKNOWN
S8T_NAMESPACE_APPROVED     = YES

zero-write proof: db_writes 0 · rows_deleted 0 · rows_modified 0 · schema_changes 0 ·
                  drive_writes 0 · property_writes 0 · locks_taken 0
```

Zero on **all three tokens**, which is the part that matters: `S8_FATIGUE_TEST` begins `S8_`, not `S8T`, so a
prefix-only census would have approved the namespace while an actor collision sat waiting to satisfy guard G2
for a row no test ever made.

Rule 1 below is therefore satisfied. The census file is removed from the Production project by the operator.

---

## Rules a run must satisfy before it starts

1. `LIVE_S8T_COLLISION_COUNT = 0` from a **complete** census (`CENSUS_COMPLETE: true`). A zero from a partial
   slice is not evidence.
2. Its scope does not overlap any concurrently-running run's business dimensions. Allocation-draft ids are
   deterministic from the business key (`16_:936`), so two runs on the same dimensions would compute the same
   id and the resolver would answer `REUSE` — run B adopting run A's row, with no bug anywhere.
   `KMS8RUN.dimensionConflict()` checks this.
3. Every table it will write is `TEST_OWNED_TRANSACTION` or `REBUILDABLE_OPERATIONAL_STATE` in
   `KMS8CLASS`, and every write goes through a canonical runtime owner.
4. Its tier is approved for that round, and `max_concurrent` is respected (T4 = 2; every other tier = 1).

---

## Runs

| run_id | status | tier | scope | started | finished | created rows | inventory touched | leaks | non-test touches | cleanup |
|---|---|---|---|---|---|---|---|---|---|---|
| _(none yet — S8-R2 executed no fatigue)_ | | | | | | | | | | |

```
PRODUCTION_FATIGUE_EXECUTED = NO
PRODUCTION_ROWS_WRITTEN     = 0
PRODUCTION_ROWS_DELETED     = 0
```
