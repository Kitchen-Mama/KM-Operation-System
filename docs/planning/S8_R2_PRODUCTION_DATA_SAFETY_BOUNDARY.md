# S8-R2 — Production Data Safety Boundary, Namespace Census and Harness Skeleton

**Status:** BOUNDARY FROZEN · HARNESS SKELETON SEALED. Audit and infrastructure only.
**Frozen against:** frontend `7f877b7`, backend `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40`, action contract `18`.
**Date:** 2026-10-03. Supersedes S8-R1 §5/§6/§22 where they differ; S8-R1 otherwise stands.

```
PRODUCTION_ROWS_WRITTEN    = 0
PRODUCTION_ROWS_DELETED    = 0
PRODUCTION_FATIGUE_EXECUTED = NO
SCHEMA_CHANGE_REQUIRED      = NO
DESTRUCTIVE_EXECUTOR_IMPLEMENTED = NO
```

---

## §1 — THE PROTECTED PRODUCTION DATA SET (FROZEN)

S8 fatigues the **operational mainline**. It is not permission to mutate the master and reference data that
mainline reads from. 29 physical tables are READ-ONLY to the harness: `WRITE = NO`, `DELETE = NO`,
`TEST INSERT = NO`, and `READ` unrestricted.

```
PROTECTED_PRODUCTION_DATA_SET  (29)

  operator-named (§1)
    sku_details · sku_regional_details · marketplaces · marketplace_skus · pricing_list
    fc_regular_forecast · fc_special_events · campaigns · campaign_sku_lines · warehouses
    tax_rate_components · tax_referral_rates

  also protected unless separately authorized
    pricing_change_log · fc_target_rules · logistics_locations · company_legal_entities
    carriers · carrier_rate_cards · carrier_lead_times
    shipment_route_templates · shipment_route_template_nodes
    document_templates · document_template_fields
    amazon_inventory_snapshot · amazon_daily_sales_snapshot · amazon_weekly_sales_snapshot
    import_sync_runs · import_sync_issues · replenishment_demand_allocation_rules
```

Four of those deserve their reason stated, because "master data" is doing non-obvious work in each:

- **`document_templates`** is the Drive output-folder root authority (`38_:18`), and `dofResolveBatchRoot_`
  refuses a whole batch if templates disagree on a root. Editing it to point tests at a test folder would
  redirect where *real* documents are written. That is why the test-document folder strategy is naming
  (`external_shipment_id`), not routing.
- **`shipment_route_templates` / `_nodes`** are read by the dispatch path (`csdResolveTemplate_`,
  `csdTemplateNodes_`, `22_:536, :563`) and never written by it. Dispatch fatigue therefore needs no exception.
- **`pricing_change_log`** is the append-only log of `pricing_list`; a table and its log are protected together
  or neither is. Pricing is additionally behind `PRODUCT_STRATEGY_BOARD_ENABLED_`, server-owned, default false.
- **`replenishment_demand_allocation_rules`** is a legacy tab whose storage was retired to Script Properties
  (`50_`). It is still a canonical read, so it is still protected; it is simply no longer written by anything.

**Not inferred from writability.** Several of these have live write handlers (`upsertSkuDetail`,
`importCarrierRateCards`, `upsertCampaign`, `pricing.update`, …). Technical reachability is not authorization.

---

## §2 — REBUILDABLE OPERATIONAL STATE

```
REBUILDABLE_OPERATIONAL_STATE_SET = { factory_stock, overseas_inventory_snapshot }
INVENTORY_RECOVERY_MODEL = RUNTIME RECONCILIATION + OPERATOR CANONICAL RE-IMPORT
```

The operator will perform a canonical inventory re-import after fatigue testing, so exact pre-test balance
restoration is **no longer the only permitted cleanup model** for these two tables. That is a strengthening,
not a relaxation: a canonical re-import restores the number from the source of truth, whereas an arithmetic
inverse restores it from the harness's own bookkeeping and is therefore only as correct as that bookkeeping.

What did not change, and is enforced in code rather than left to intention:

| Rule | Where it is enforced |
|---|---|
| writes reach these tables ONLY through canonical runtime owners | `KMS8CLASS.authorizeWrite(t, via)` refuses any `via` but `RUNTIME_OWNER` |
| no direct cell write anywhere, including authorized tables | `KMS8CLASS.directCellWriteAuthorized()` returns false for every table |
| the canonical row is never deleted | policy `RECONCILE`; `authorizeDelete` refuses |
| movement lineage survives | policy `RETAIN` on both ledgers |
| every touched inventory identity is recorded | `KMS8RUN.recordInventoryTouch` **throws** on a missing identity field |

Before/after evidence is still captured — not as the restore mechanism, but as the diagnosis trail. Both
ledgers already write `before_*` / `after_*` on every row, so the pre-test value is recorded by the test's own
first movement rather than by a snapshot that can be stale before the write lands.

---

## §3 — MOVEMENT LEDGERS

```
MOVEMENT_RETAIN_SET = { factory_stock_movements, overseas_inventory_movements, factory_stock_override_audit }
MOVEMENT_DELETE_ALLOWED = NO
```

The first two are not an audit side-effect of the balance — they **are** the balance for the reserved axis.
`factoryStockOwnerReservedTx_` (`21_:448`) computes what an owner holds by summing its acquire/release rows, so
deleting them destroys the derivation that every reader depends on. `factory_stock_override_audit` joins them
because `71_` **requires** it before it will accept an overage confirmation: an override whose justification was
never written is the exact thing that ledger exists to make impossible.

Deterministic linkage back to the run is carried by fields that already exist:

| Ledger | run id | test entity | owner |
|---|---|---|---|
| `factory_stock_movements` | `reference_id` (caller-supplied, `21_:106`) | `created_by` | `related_entity_type` + `related_entity_id` = the owning shipment |
| `overseas_inventory_movements` | `reference_id` (caller-supplied, `05_:884`) | `created_by` | `reference_type` + `source_module` |
| `factory_stock_override_audit` | `created_by` + the plan it justifies | | the shipping plan |

---

## §4 — OPERATIONAL TRANSACTION WRITE DOMAIN

58 physical tables are registered in `assets/tools/s8-fatigue/s8-data-classification.js`, derived from the sheet
name literals in the 77 deployed `.gs` files plus `CANONICAL_TABLES` in
`assets/js/core/supply-planning-production-source.js`.

```
PROTECTED_MASTER                 29
TEST_OWNED_TRANSACTION           25     (22 DELETE_CANDIDATE + 3 RETAIN)
REBUILDABLE_OPERATIONAL_STATE     2
READ_ONLY_DERIVED                 2     (the two gap tables)
UNAUTHORIZED_UNKNOWN              0 known — and any unregistered name classifies as one
                                 ──
                                 58

AUTHORIZED_WRITE_TABLE_COUNT              27   (all via RUNTIME_OWNER; never a cell write)
DIRECT_CELL_WRITE_AUTHORIZED_TABLE_COUNT   0
OPERATOR_APPROVAL_REQUIRED_TABLE_COUNT    31   (29 protected + 2 gap)
```

`UNAUTHORIZED_UNKNOWN = 0` is a statement about today's registry, not a guarantee about tomorrow's spreadsheet.
`classify()` **fails closed**: a table nobody registered is UNAUTHORIZED_UNKNOWN and `authorizeWrite` refuses it
with a STOP that points at the §5 form. The census additionally reports `extra_tabs_not_in_registry`, so a tab
added by hand surfaces as a finding instead of being scanned as though the registry already knew about it.

**`TEST_OWNED_TRANSACTION` does not mean the table belongs to tests.** `request_orders` holds real business
orders. It means the *rows a fatigue run creates* in that table are owned by that run. Ownership is decided per
row by lineage, never by the table name — which is why class and cleanup policy are two separate axes.

---

## §5 — THE STANDING APPROVAL GATE

If a future fatigue scenario requires any of seven things, it **STOPS** and produces a request:

```
WRITE_UNAPPROVED_TABLE · INSERT_INTO_PROTECTED_TABLE · DELETE_FROM_NEW_TABLE
ADD_TABLE · ADD_COLUMN · SCHEMA_MIGRATION · BACKFILL
```

`KMS8CLASS.approvalRequest({...})` builds it with every field §5 names — table, operation, why required, test
scenario, expected row count, cleanup/recovery model — validates completeness, attaches the table's current
classification, and states plainly that filling the form in does not itself widen anything:

> The authorized write surface is NOT expanded by this request. It is expanded only by an operator decision that
> edits the KMS8CLASS registry.

That sentence is the mechanism. The write surface is a source file a human reviews, not a runtime flag.

---

## §6 — THE GAP TABLES: REBUILD IS SUPPORTED, WRITE FATIGUE IS NOT

```
GAP_CANONICAL_REBUILD_SUPPORTED = YES
GAP_REBUILD_OWNER  = inventoryReplenishmentGap.job.start / orderPlanningGap.job.start
                     (46_api_v1_gap_materialization_job.gs) driving the canonical slice processors in 43_
GAP_REBUILD_SCOPE  = ALL_SITES | CURRENT_COUNTRY | CURRENT_SCOPE
                     Order Planning EXPANDS any sub-company selection to the WHOLE COMPANY, because the
                     factory pool competes company-wide and a partial run must never silently change
                     allocation (46_:79-81). Inventory scopes are independent and are not expanded.
GAP_WRITE_FATIGUE_SAFE = NO  — remains EXCLUDED
```

Each of §6's six questions, answered:

1. **Canonical source inputs** — 21 tables, `CANONICAL_TABLES` in `supply-planning-production-source.js`.
2. **Deterministic materialization owner** — yes, and deterministic: company-chunked Order Planning yields
   *byte-identical* allocation to the monolithic run (46_ header). Job state lives in Script Properties; the two
   gap tables remain the only result store; no new table.
3. **Can re-materialization restore them?** Yes — but only once its inputs are canonical again.
4. **Can a test affect only the intended scope?** **No.** A gap row is keyed by
   `company|country|marketplace|sku`. §1 forbids inserting test rows into `sku_details` / `marketplace_skus`, so
   no test-owned key space can exist, so every gap write lands on a row that describes real business.
5. **Can normal Production planning observe transient test values?** **Yes.** The gap tables *are* the read
   store the pages serve from (`inventoryReplenishmentGap.get` / `orderPlanningGap.get`). There is no flag,
   filter or status that would hide a transient test value from a real operator reading Inventory Replenishment.
6. **Can re-materialization be proven complete?** **Yes** — `status === 'DONE' && scopesProcessed ===
   scopesTotal` (`46_:120, :287`), with a terminal set that a job always reaches (`46_:86`).

So the rebuild works, and the rebuild is not the problem. **The problem is the window.** Eight of the 21
canonical inputs are themselves mutated by operational-mainline fatigue:

```
factory_stock · overseas_inventory_snapshot · shipments · shipment_lines
shipping_plans · shipping_plan_lines · purchase_order_lines · request_order_line_sources
```

A rebuild run before those are canonical faithfully reproduces the contamination. So the rebuild is only
canonical *after* the test transaction rows are cleaned **and** the operator inventory re-import has completed —
which means the contaminated window is not minutes, it lasts until the operator finishes recovering. Even the
best case adds ~28 minutes of whole-system recalculation (~14m Inventory, ~13.5m Order Planning, 46_ header).

```
GAP_WRITE_FATIGUE_BLOCKERS
  NO_TEST_OWNED_KEY_SPACE          every gap write lands on a real business key
  NO_OBSERVATION_ISOLATION         the gap tables are the planning read store; nothing hides a test value
  REBUILD_ORDERING_DEPENDENCY      the rebuild reads 8 tables that fatigue mutates
  REBUILD_DURATION                 ~28 min of recalculation inside the window even at best
```

**R2 writes no gap row and adds no `fatigue_run_id` column.** The column was available via the existing additive
migration and is declined: it would mark the destructive write without making it reversible, and §6 explicitly
forbids adding it merely for identification.

---

## §7 — THE LIVE S8T COLLISION CENSUS

`assets/tools/apps-script-diagnostics/TEMP_S8T_NAMESPACE_COLLISION_CENSUS.gs` — editor-run, read-only, not
routed, not deployed, not in the 77-file runtime set.

### Declared scope

```
READ     58 registered Production tables → ONLY the bounded identifier columns required for collision
         detection: each table's primary key, the 10 identifier columns the guards read, the 15 actor
         (*_by) columns, and 1 lineage-type column.
WRITE    NONE        DELETE   NONE        SCHEMA   NONE
PRODUCTION BUSINESS DATA MUTATION   NONE
FREE-TEXT COLUMNS READ   0
```

**Free text is out of scope, and removing it changed the harness.** The first draft also read `note`,
`plan_name`, `rejected_reason`, `booking_no`, `invoice_no` and a dozen other free-text columns — because `note`
was then a lineage carrier, so its collision risk had to be measured. Reading every comment box in the database
to answer a question about identifiers is a far wider Production read than the question needs. So `note` was
removed from the guard input set (`KMS8RUN.LINEAGE_FIELDS`) instead. Every table that looked like it depended on
it has a structured carrier — `shipping_allocation_drafts` has `create_idempotency_key`,
`request_order_allocation_drafts` has `request_allocation_draft_id`, every child inherits through its FK — so
the removal costs nothing and buys two things: a bounded census, and a guard that cannot be satisfied by
something a human typed in a comment box. `note` is still written for readability; it is no longer evidence.

### Two tokens, because only one of the harness's identities begins with `S8T`

| Token | Match | Columns | Why |
|---|---|---|---|
| `S8T` | prefix | primary key + the 10 identifier columns | a guard keyed on the prefix could mistake a real business value for a test one |
| `S8_FATIGUE_TEST` | exact | the 15 actor columns | **`S8_FATIGUE_TEST` does not begin with `S8T`** — it begins `S8_` |
| `s8_fatigue_test` | exact | `source_ref_type` | the §15 lineage-type marker, likewise outside the prefix |

The second token is not belt-and-braces. A prefix-only census would have reported a clean namespace while an
existing row carrying `created_by = S8_FATIGUE_TEST` sat there ready to satisfy guard G2 for a row no test ever
made — the exact failure the census exists to rule out. The narrowing is what surfaced it.

### Properties

| Property | How |
|---|---|
| runs next to the data | pasted into the Apps Script project; counts inside Apps Script, never over the browser transport |
| bounded | reads **one column at a time** with `getRange(2, col, lastRow-1, 1)`; **no `getDataRange` anywhere** |
| targeted | column 1 plus 26 named identifier/actor/type headers — and nothing else |
| resumable | `S8T_CENSUS_START_INDEX_` / `S8T_CENSUS_MAX_TABLES_`; each slice reports where to resume |
| honest when incomplete | `CENSUS_COMPLETE` is false unless slice 0 covered every table, and the verdict then says in words that a zero *is not evidence the namespace is clean* |
| zero-write, structurally | contains no `setValue(s)`, `appendRow`, `insertSheet`, `deleteRow`, `clear*`, `LockService`, `DriveApp`, `PropertiesService` write or `UrlFetchApp` — asserted by the suite against the stripped source, not by trusting a comment |
| cannot drift | the suite asserts its 58-table list is **exactly** the `KMS8CLASS` registry, and its identity columns are **exactly** `KMS8RUN.LINEAGE_FIELDS` |

**The coupling invariant, checked in both directions.** A lineage carrier the census does not scan is a carrier
whose collision risk has never been measured. A column the census scans that no guard reads is a Production
read this scope does not authorize. So the two sets must be *equal*, not merely overlapping — and three mutants
move each half independently to prove the comparison notices.

```
LIVE_S8T_COLLISION_COUNT = NOT YET RUN — OPERATOR ACTION REQUIRED
```

The agent cannot run it: it executes inside the Apps Script editor, which is operator-owned under RG-1. Running
it is the first gate of S8-R3.

> **Operator procedure.** Open the Apps Script project bound to the Operation System Database → add a file →
> paste `TEMP_S8T_NAMESPACE_COLLISION_CENSUS.gs` → Run `TEMP_S8T_NAMESPACE_COLLISION_CENSUS` → copy the whole
> `[S8T-CENSUS]` log block back → **delete the file from the project**. If `LIVE_S8T_COLLISION_COUNT > 0`, the
> namespace is invalid and no fatigue round may write a row.

---

## §8 / §9 — RUN IDENTITY, LEDGER AND MANIFEST

```
FATIGUE_RUN_ID_OWNER = assets/tools/s8-fatigue/s8-run-identity.js   (KMS8RUN)
RUN_LEDGER_OWNER     = docs/planning/S8_FATIGUE_RUN_LOG.md  +  Script Properties key S8T_RUN_<RUN_ID>
MANIFEST_OWNER       = KMS8RUN.newManifest — and the manifest IS the cleanup authority
NEW_TABLE_REQUIRED   = NO      NEW_COLUMNS_REQUIRED = NO      SCHEMA_CHANGE_REQUIRED = NO
```

One namespace, one actor:

```
S8T-<YYYYMMDD>-R<NNN>      canonical          S8T-20261006-R001
S8T<YYYYMMDD>R<NNN>        compact, 15 chars  S8T20261006R001     (for alphanumeric-constrained tails)
TEST_ACTOR = S8_FATIGUE_TEST
```

The compact form is not a convenience. `factoryImportBatchId_` (`21_:857`) validates its tail as
`/^FII-\d{8}-[A-Za-z0-9]{1,16}$/`, which **rejects an underscore outright** and caps the length at 16. The suite
asserts both that `FII-20261006-S8T20261006R001` satisfies that live pattern and that the originally-proposed
underscore form does not — so the reason the format is what it is cannot be lost.

Script Properties is not a new mechanism here: `11_shipping_plan_handlers.gs:842-865` already stores a durable
rollback journal there and deletes it on success. It needs no OAuth scope and survives execution boundaries.

**Lineage** is one system with two mechanisms (S8-R1 §3): DIRECT where a writable field carries the run id *and*
an actor field equals `S8_FATIGUE_TEST`; INHERITED where the declared parent FK resolves to exactly one row that
is itself attributable to this run. Ambiguity is a refusal, never a tie-break — a child with two candidate
parents aborts rather than being assigned to one of them.

---

## §10 / §11 — CLEANUP MODEL AND GUARDS

```
DESTRUCTIVE_EXECUTOR_IMPLEMENTED = NO
PREFIX_ONLY_DELETE_REACHABLE     = NO
TIME_ONLY_DELETE_REACHABLE       = NO
NON_MANIFEST_DELETE_REACHABLE    = NO
CLEANUP_DEFAULT_EXECUTE = FALSE      CLEANUP_REQUIRES_DRY_RUN = YES      CLEANUP_GUARD_COUNT = 10
```

Per class:

| Class | Cleanup |
|---|---|
| `TEST_OWNED_TRANSACTION`, policy DELETE_CANDIDATE (22 tables) | may become candidates — **only** through the manifest |
| `TEST_OWNED_TRANSACTION`, policy RETAIN (3 ledgers) | never deleted |
| `REBUILDABLE_OPERATIONAL_STATE` (2) | canonical rows never deleted; reconcile and verify; final authority is the operator canonical re-import |
| `PROTECTED_MASTER` (29) | never deleted, and never *restored* by the harness either — because it must never have been written |
| `READ_ONLY_DERIVED` (2 gap) | not touched; pending the §6 determination |

The three refusals are enforced by absence or by a loud failure, not by a rule someone remembers:

- `selectByPrefix()` exists and **always throws**. It is a tombstone: a caller reaching for the obvious thing
  gets a named refusal explaining why, instead of finding no such function and writing their own loop.
- `selectByTime()` likewise. Creation time survives only as guard **G6**, which can *refuse* a candidate the
  manifest already named and can never *produce* one. A blank timestamp is explicitly not a refusal — the
  manifest is the authority, not the clock.
- `planCandidates(manifest, opts)` reads only `manifest.created_entity_ids`. There is no parameter through which
  a pattern, a query or a row set can enter it.

A namespace-matching row absent from the manifest is **LEAK / INVESTIGATION**, never a delete candidate: it
means either the manifest is wrong or something else is writing into the namespace, and deleting it destroys the
only evidence that would say which.

**A single guard refusal abandons the whole plan.** Not the row — the plan. A cleanup that silently skipped rows
reports exactly what a complete one reports, and the difference matters the next time somebody asks whether the
table is clean.

| | Per-row (ANDed) | | Per-execution |
|---|---|---|---|
| G1 | run id canonical and the one being cleaned | G7 | explicit `COMMIT`; default and absent both mean dry run |
| G2 | actor is `S8_FATIGUE_TEST` | G8 | confirmation matches a checksum **recomputed against the live rows** |
| G3 | lineage DIRECT or INHERITED to this run | G9 | rollback journal written **before** the first deletion |
| G4 | the id is in this run's own manifest | G10 | live count matches the dry run, and never exceeds what the run recorded creating |
| G5 | table policy permits deletion | | |
| G6 | creation window — **corroboration only** | | |

Execution belongs to a separately authorized, editor-run, dry-run-default `TEMP_` tool following the
`TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP` pattern (`68_:880-935`) — never to a router action. This system has no
routed delete and should not acquire one.

---

## §13 — CROSS-RUN ISOLATION

Proven against fixtures (suite section I):

| Claim | How it is refused |
|---|---|
| Run A deletes run B's row | not in A's manifest → never a candidate; and forcing it through the guards fails on **two** independent grounds (G3 lineage, G4 manifest) |
| Run A adopts run B's child | the child's parent resolves to B → `PARENT_NOT_THIS_RUN`. Two candidate parents → `LINEAGE_AMBIGUOUS`, a refusal |
| Run A claims run B's inventory mutation | the movement's `reference_id` carries B's run id → attributed to B |
| A row whose lineage resolves but which the run never recorded | `canAdopt` → `ROW_NOT_IN_RUN_MANIFEST`. Lineage is necessary, not sufficient |

**The one hole no id guard can close.** Allocation-draft ids are deterministic from the business key:
`sadK2DeterministicHeaderId_` returns `'SADH-K2-' + FNV1a(group key)` (`16_:936`). Two runs on the same business
dimensions compute the *same* id, and `sadK2ResolveActiveDraft_` (`16_:965-976`) answers `REUSE` — run B
legitimately adopting run A's row, with no bug anywhere. No id-based guard can prevent that, because the ids are
equal by design. The only fix is to prevent the collision:

> **Overlapping fatigue runs may not use the same business dimensions.**
> `KMS8RUN.dimensionConflict(a, b)` checks it before a run starts, rather than discovering it afterwards.

---

## §14 — SCALE TIERS (frozen; nothing executed)

```
T1  1 deterministic chain        max concurrent 1
T2  20 cycles                    max concurrent 1
T3  100 cycles                   max concurrent 1
T4  race                         max concurrent 2
T5  soak                         max concurrent 1
```

T4 is 2 and not more because `LockService.getScriptLock()` is used in 31 files and is a **single global lock**;
two writers is already the complete contention state. A third adds no new transition and only consumes the
deploying user's quota — the same pool the operator's manual testing runs on, since the deployment is
`executeAs: USER_DEPLOYING`.

---

## §15 — FUTURE MAINLINE FATIGUE AUTHORIZATION MAP

This is the authorization map for S8-R4 / R5. **Approval required** means the stage, as specified, needs an
operator decision before it may run.

### 1 · GAP / CALCULATION — **NOT AUTHORIZED**

| | |
|---|---|
| Reads | the 21 canonical inputs |
| Writes | `inventory_replenishment_gap`, `order_planning_gap` |
| Protected dependency | 13 of the 21 inputs |
| Test-owned | none possible |
| Rebuildable | n/a |
| Recovery | full canonical re-materialization, but only after cleanup and inventory re-import |
| **Approval required** | **YES — excluded by §6.** S8-R3 may exercise it READ-ONLY (`*.get`, `job.status`) |

### 2 · REQUEST ORDER (+ allocation drafts)

| | |
|---|---|
| Reads | `marketplace_skus`, `sku_details`, `fc_regular_forecast`, `factory_stock`, `overseas_inventory_snapshot`, `purchase_orders`, `purchase_order_lines`, `warehouses` |
| Writes | `request_orders`, `request_order_lines`, `request_order_line_sources`, `request_order_site_confirmations`, `request_order_allocation_drafts(+_lines)`, `shipping_allocation_drafts(+_lines)` |
| Protected dependency | READ ONLY — all 8 reads are protected or rebuildable |
| Test-owned | all 8 writes |
| Rebuildable | none written |
| Recovery | delete by manifest, order 14–21 |
| Lineage | `source_ref_type = 's8_fatigue_test'` + `source_ref_id = <run id>`, `created_by`. **Never** `source_ref_type = 'request_order_allocation_batch'` — there `source_ref_id` is the exactly-once execution key (`13_:675-690`) and the lineage mark would collide with the idempotency key |
| **Approval required** | **NO** |

### 3 · PURCHASE ORDER

| | |
|---|---|
| Reads | `request_orders`, `request_order_lines`, `warehouses`, `sku_details` |
| Writes | `purchase_orders`, `purchase_order_lines`; clears `request_order_lines.purchase_order_line_id` on compensation |
| Protected dependency | READ ONLY |
| Test-owned | both writes; lineage INHERITED via `request_order_id` |
| Recovery | delete by manifest, order 12–13 |
| **Approval required** | **NO** |

### 4 · SHIPPING PLAN

| | |
|---|---|
| Reads | `shipping_allocation_drafts(+_lines)`, `sku_details`, `warehouses`, `carriers`, `carrier_rate_cards` |
| Writes | `shipping_plans`, `shipping_plan_lines` |
| Protected dependency | READ ONLY — carrier reference is read, never written |
| Test-owned | both; lineage `submit_batch_id` + `created_by` |
| Recovery | delete by manifest, order 10–11 |
| Note | rollback journal lives in Script Properties (`11_:842`); a failure between journal write and rollback leaves the journal as the only evidence — a thing S8-R7 should deliberately provoke |
| **Approval required** | **NO** |

### 5 · SHIPMENT

| | |
|---|---|
| Reads | `shipping_plans(+_lines)`, `carriers`, `carrier_rate_cards`, `warehouses`, `sku_details` |
| Writes | `shipments`, `shipment_lines`, `shipment_line_allocations`, `shipment_final_output_*`, `generated_documents` |
| Protected dependency | READ ONLY. **`document_templates` is read for the Drive root and must not be edited** |
| Test-owned | all writes |
| Rebuildable | triggers reservation — see stage 6 |
| Recovery | delete by manifest, order 1–9, **after** step 0 releases reservations |
| Lineage | set `external_shipment_id = S8T-…-SH<nn>` **before** generating any document, so Drive folders are named after the run (`38_:151`) |
| **Approval required** | **NO** for rows; **YES** before any round that sets `generate_file: true`, pending the Drive-scope question |

### 6 · RESERVATION

| | |
|---|---|
| Reads | `factory_stock`, `factory_stock_movements`, `overseas_inventory_snapshot`, `overseas_inventory_movements` |
| Writes | `factory_stock.fac_reserved_stock`, `overseas_inventory_snapshot.wh_reserved_stock`, + one movement row per transition |
| Protected dependency | none |
| Test-owned | the movement rows (RETAIN) |
| Rebuildable | both balance tables |
| Recovery | `cancelShipmentDraft` releases exactly what this owner holds and never another's (`21_:500-508`); holding nothing is a no-op, which makes it replayable. Then reconcile, then operator re-import |
| **Approval required** | **NO** |

### 7 · DISPATCH

| | |
|---|---|
| Reads | `shipments`, `shipment_lines`, `shipment_route_templates`, `shipment_route_template_nodes` (**read-only**, `22_:536, :563`) |
| Writes | `shipments`, `shipment_lines`, `shipment_events`, `factory_stock`, `factory_stock_movements` |
| Protected dependency | route templates READ ONLY — confirmed, so no exception is needed |
| Test-owned | `shipment_events` and the shipment rows |
| Rebuildable | `factory_stock` (physical deduction + reservation release carried on the same row) |
| Recovery | rollback journal (`22_:123`); then reconcile; then operator re-import |
| **Approval required** | **NO** |

### 8 · RECEIPT

| | |
|---|---|
| Reads | `purchase_orders`, `purchase_order_lines`, `warehouses` |
| Writes | `purchase_orders`, `purchase_order_lines` (`completed_qty`/`remaining_qty`/`order_status`), `factory_stock`, `factory_stock_movements` (`po_receipt`); overseas receipt also writes `overseas_inventory_snapshot(+_movements)` and `shipment_routes` (`31_`) |
| Protected dependency | `warehouses` READ ONLY |
| Test-owned | PO rows, routes |
| Rebuildable | both inventory tables |
| Recovery | delete PO rows by manifest; reconcile inventory; operator re-import |
| Idempotency | `idempotency_key` (`PORCV-`, `13_:2421`); the receipt is **cumulative**, not incremental, so a replay is a no-op |
| **Approval required** | **NO** |

### 9 · FACTORY / OVERSEAS INVENTORY (direct adjustment)

| | |
|---|---|
| Writes | `factory_stock` / `overseas_inventory_snapshot` + one movement row |
| Recovery | `new_available` is **absolute state, not a delta** (`21_:50-54`), so a restore is idempotent by construction; `note` is **required** (`21_:48`), so a restoring write can never be anonymous |
| Known gap | `reference_id` is accepted but never checked for prior use (`21_:43, 106, 172`). A duplicate click leaves the balance correct and appends a **second zero-qty movement row**. S8-R7 decides whether that needs a real replay key — a runtime change, so not R2's to make |
| **Approval required** | **NO** |

### 10 · READ MODEL

| | |
|---|---|
| Reads | everything |
| Writes | nothing |
| Recovery | n/a |
| **Approval required** | **NO** — this is S8-R3's whole scope |

---

## §16 — TESTS

`assets/tests/s8-r2-fatigue-harness-safety.test.js` — **270 assertions, 0 failures, 24 mutants, 0 survived.**

Each mutant breaks one load-bearing guard and the suite must notice: the write gate failing open, the
protected-master refusal removed, the direct-cell-write bar lifted, a movement ledger made deletable, the gap
tables made writable, `GAP_WRITE_FATIGUE_SAFE` flipped without removing a blocker, cleanup selecting by prefix,
G4 removed, a refusal skipping the row instead of abandoning the plan, the row guards ORed instead of ANDed,
`selectByPrefix` returning quietly, the executor implemented, COMMIT no longer required, the journal no longer
required, reservation release reordered after the shipment delete, ambiguous parentage resolved by picking the
first, the actor check dropped, `FAILED_RETAINED` made cleanup-eligible, the overlap rule disabled, `canAdopt`
accepting a non-manifest row, and an unrecorded inventory touch accepted silently.

Three of the 24 exist for the §7 coupling invariant specifically, because it is the kind that rots silently —
both halves look fine on their own. They add a lineage carrier the census does not scan, remove one the census
still reads, and rename the actor to a value the prefix *would* have caught.

A vacuity section then proves the unmutated tree really does behave as the mutants assume, so a mutant cannot be
"caught" by an assertion that was already failing.

---

## §17 — OPEN BLOCKERS

| # | Blocker | Owner | Blocks |
|---|---|---|---|
| 1 | Run `TEMP_S8T_NAMESPACE_COLLISION_CENSUS` and report `LIVE_S8T_COLLISION_COUNT` | **OPERATOR** | every write round |
| 2 | §8 Drive OAuth scope — `37_` calls `DriveApp` but `appsscript.json` declares only `spreadsheets`, `script.scriptapp`, `bigquery`. Either the live deployment was authorized under a broader set, or `generate_file: true` fails at authorization | S8-R6, read-only | document fatigue |
| 3 | `adjustFactoryInventory` has no replay key — decide whether `reference_id` should become one | S8-R7 | nothing yet |

```
NEXT_TASK = S8-R3 — READ-PATH FATIGUE + PERFORMANCE BASELINE   (not begun)
```

---

*Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>*
