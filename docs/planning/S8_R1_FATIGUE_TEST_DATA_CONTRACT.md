# S8-R1 — Fatigue Test Data Namespace, Lineage and Safe Cleanup Contract

**Status:** CONTRACT FROZEN (spec only). No Production row was written, no Production row was deleted, no
runtime file was modified by this round.
**Frozen against:** frontend `37151bf`, backend `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40`, action contract `18`.
**Date:** 2026-10-03.

This document is the authority for every later S8 fatigue round. Where it disagrees with a memory, a habit or
an earlier proposal, this document wins — but where it disagrees with the *code*, the code wins and this
document is wrong and must be amended before the round that found the disagreement proceeds.

---

## §0 — THE THREE FINDINGS THAT SHAPE EVERYTHING BELOW

Three facts were measured in this round that invalidate the obvious design. They are stated first because the
rest of the contract is built around them.

### §0.1 — There is no delete executor, and that is a feature

Every `deleteRow` in the backend (12 sites across 10 files) is a **compensation or rollback path scoped to one
execution's own ids**. Not one of them is reachable as a router action. The closest things to a public delete
are `deleteFcSpecialEvent` and `deleteFcTargetRule` — two forecast master-data rows — and three `cancel*`
actions that change status and release reservations rather than removing rows.

```
ROUTER POST ACTIONS                            ~140
ROUTER ACTIONS THAT DELETE A TRANSACTION ROW   0
NON_TEST_DELETE_REACHABLE                      NO  (over the network)
```

So fatigue cleanup cannot be a new API action without inventing the exact capability this system has spent its
whole life refusing to have. It must instead follow the pattern the repository already built for this:
`assets/tools/apps-script-diagnostics/` — 34 editor-run `TEMP_*` tools, not routed, dry-run by default.

The canonical one is `TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP` in
`assets/specs/active/apps-script/68_api_v1_execution_plan_conflict_diagnostic.gs:880-935`. It already does
everything §10 of the task asks for: a mode constant defaulting to `DRY_RUN`, a confirmation checksum computed
over the exact rows and re-verified against the live table, a rollback journal of the exact row bytes logged
*before* the first deletion, a script lock, and a post-cleanup re-run of the read-only diagnostic requiring
zero remaining candidates. §9/§10 below adopt that shape rather than inventing a second one.

### §0.2 — The two gap tables cannot carry lineage, and they overwrite in place

`inventory_replenishment_gap` and `order_planning_gap` (`43_api_v1_gap_materialization.gs:30-45`) are keyed by
`GAP_KEY_COLS_ = ['company','country','marketplace','sku']` and written by `gapUpsertByKey_`
(`43_:190-213`), which locates the matching row and calls `setValues` on it. There is:

- no `created_by`, no run id, no actor column, no timestamp of the previous value;
- a `note` column that is **server-authored** (`gapInvMapFromLines_`, `43_:105-112`, writes `''` or a blocked
  reason such as `RECOMMENDATION_LINE_NOT_FOUND`) and therefore cannot carry a caller's run id;
- no before/after ledger anywhere, unlike every inventory table.

**A fatigue run that recalculates a gap for a real SKU destroys the previous planning number with no inverse
and no record that it ever existed.** This is the single most dangerous surface in the system for this kind of
testing, and it is dangerous in a way that neither deletion-scoping nor lineage marking can fix.

### §0.3 — Reserved stock is derived from the movement ledger, not stored independently

`factoryStockOwnerReservedTx_` (`21_factory_inventory_handlers.gs:448`) computes what an owner holds by summing
`reserve_acquire` / `reserve_release` movement rows for `(ownerType, ownerId)`. `FSTX_RESERVATION_OWNER_TYPE_ =
'shipment'` (`21_:405`) is the only reservation owner in the frozen model. `05_overseas_inventory_handlers.gs`
mirrors this.

Two consequences, both load-bearing:

1. **Movement rows must never be deleted.** They are not an audit side-effect of the balance; they *are* the
   balance for the reserved axis. Deleting a test run's movements destroys the derivation other rows depend on.
2. **A test shipment's reservation must be released through the runtime before its rows are removed.** Deleting
   a `shipments` row whose reservation is still held orphans that reservation permanently: the owner id no
   longer exists, so nothing will ever release it, and `fac_reserved_stock` carries the test's number forever.

---

## §1 — TEST RUN IDENTITY (FROZEN)

```
FATIGUE_TEST_RUN_ID_FORMAT  =  S8T-<YYYYMMDD>-R<NNN>
EXAMPLE                     =  S8T-20261006-R001
COMPACT_FORM                =  S8T<YYYYMMDD>R<NNN>        e.g. S8T20261006R001   (15 chars, alphanumeric)
REGEX                       =  /^S8T-\d{8}-R\d{3}$/
```

**Why hyphens and not `S8TEST_<...>_<...>`.** The task proposed an underscore form and asked that the final
format be derived from repository constraints. It was. Every generated id in this system uses `-` as its only
separator (`RO-`, `POL-`, `SADH-K2-`, `OVMV-`, `GDOC-`, `FII-YYYYMMDD-XXXX`), and one field validates its tail
with a pattern that **rejects underscores outright**:

```js
// 21_factory_inventory_handlers.gs:857-862
function factoryImportBatchId_(provided) {
  var p = String(provided == null ? '' : provided).trim();
  if (/^FII-\d{8}-[A-Za-z0-9]{1,16}$/.test(p)) return p;   // <- alphanumeric tail, max 16
  ...
}
```

A run id that must survive being embedded there has to be alphanumeric and at most 16 characters. The compact
form is exactly 15. So `FII-20261006-S8T20261006R001` is a valid, caller-supplied, self-identifying factory
import batch id — which it would not be with an underscore. The hyphenated form is canonical everywhere else;
the compact form exists solely for alphanumeric-constrained tails and is mechanically derivable from it.

The id is unique (date + monotonic serial per day), human readable, searchable by a single `Ctrl-F` for `S8T-`
in any sheet, deterministic (an operator can reconstruct it from the run log), and safe in a spreadsheet cell
— it begins with a letter, so Sheets will never coerce it to a date or a number.

---

## §2 — TEST ENTITY NAMESPACE

```
TEST_NAMESPACE = S8T          (ONE prefix. QA_ and LOADTEST_ are rejected and must never appear.)
```

### Who mints ids

Every transaction id in this system is minted **server-side** from `Utilities.getUuid()`. The 73 call sites were
enumerated. The caller may supply an id at only nine of them:

| Entity | Field | Caller may supply? | Evidence |
|---|---|---|---|
| `request_order_allocation_drafts` | `request_allocation_draft_id` | **YES** | `15_:205` `if (!id) id = 'RAD-' + …` |
| `shipping_allocation_drafts` | `allocation_draft_id` | **YES, but** | `16_:776, 2151`, see note |
| factory import batch | `import_batch_id` | **YES (validated)** | `21_:857` `FII-\d{8}-[A-Za-z0-9]{1,16}` |
| shipping plan submit batch | `submit_batch_id` | **YES** | `11_:640` `providedKey \|\|` |
| PO receipt | `idempotency_key` | **YES** | `13_:2421` `PORCV-` fallback |
| factory / overseas adjust | `reference_id` | **YES** | `21_:106`, `05_:884` `refIdIn \|\|` |
| `campaigns` | `campaign_id` | YES | `20_:394` `r.id \|\|` |
| `marketplace_skus` | `marketplace_sku_id` | YES | `04_:406` — **master data, out of scope** |
| fc tables | row id | YES | `14_:201` — **master data, out of scope** |

> **Note on `shipping_allocation_drafts`.** Although the writer accepts a supplied id, the *resolver* mints
> deterministic ids from the business key: `sadK2DeterministicHeaderId_` returns `'SADH-K2-' + FNV1a(group key)`
> (`16_:936`) and `ricK4DeterministicHeaderId_` returns `'SADH-K4-' + …` (`69_route_identity:160`). An id that
> does not match its own group key makes `group_id_matches_stored_id` false and every reader disagree about
> which key the row belongs to. **A test must not force a prefixed id here.** This draft is identified by
> lineage fields, not by its id.

### Frozen answer

```
TEST_PREFIX_EMBEDDABLE_ENTITY_TYPES =
    factory_import_batch_id            FII-<YYYYMMDD>-S8T<YYYYMMDD>R<NNN>
    shipping_plan.submit_batch_id      S8T-<YYYYMMDD>-R<NNN>-SB<nn>
    purchase_order_receipt.idempotency_key   S8T-<YYYYMMDD>-R<NNN>-RCV<nn>
    factory_stock_movements.reference_id     S8T-<YYYYMMDD>-R<NNN>-ADJ<nn>
    overseas_inventory_movements.reference_id  same shape
    request_order_allocation_drafts.request_allocation_draft_id  S8T-<YYYYMMDD>-R<NNN>-RAD<nn>
    shipments.external_shipment_id (via updateShipment)          S8T-<YYYYMMDD>-R<NNN>-SH<nn>
    request_orders.source_ref_id   (see §3 — carries a condition)

TEST_PREFIX_NON_EMBEDDABLE_ENTITY_TYPES =
    request_orders.request_order_id / request_order_no          server UUID
    request_order_lines / request_order_line_sources            server UUID
    purchase_orders / purchase_order_lines                      server UUID
    shipping_plans / shipping_plan_lines                        server UUID
    shipments.shipment_id / shipment_no                         server UUID
    shipment_lines / shipment_line_allocations                  server UUID
    shipment_events / shipment_routes                           server UUID
    shipment_final_output_*                                     server UUID
    generated_documents.document_id                             server UUID (GDOC-)
    overseas_inventory_snapshot.snapshot_id (OISN-)             server UUID
    factory_stock_movements.factory_stock_movement_id (FSMV-)   server UUID
    overseas_inventory_movements.movement_id (OVMV-)            server UUID
    pricing_change_log.log_id (PCL-)                            server UUID
    shipping_allocation_drafts.allocation_draft_id              DETERMINISTIC from the business key
    inventory_replenishment_gap / order_planning_gap            NO ID COLUMN AT ALL
```

**`external_shipment_id` is the most valuable embeddable id in the list** and deserves its own sentence. It is
in `SHIPMENT_EDITABLE_COLUMNS` (`12_:85-96`), and it is the component
`dofResolveShipmentFolder_` uses to name the Drive output folder
(`38_document_output_folder_resolver.gs:151`: root → BUCKET → `{external_shipment_id}_{yyyyMMdd}`). Setting it
makes every Drive artefact of a test run land in a folder whose name begins with the run id. See §8.

---

## §3 — LINEAGE OWNER (FROZEN — ONE SYSTEM)

```
TEST_RUN_LINEAGE_OWNER = the (TEST_ACTOR, FATIGUE_TEST_RUN_ID) pair, written into the row's own
                         existing lineage field where one is writable, and inherited through the
                         declared foreign key where one is not.
```

That is **one** lineage system with two mechanisms, not two systems. A row is attributable to a run if and only
if it satisfies *either* of:

- **DIRECT** — the row's designated lineage field (per §4) contains the run id, **and** its actor field equals
  `S8_FATIGUE_TEST`; or
- **INHERITED** — the row's declared parent FK resolves to exactly one row that is itself DIRECT or INHERITED,
  and that ancestor's run id is the one being cleaned.

Inheritance is what makes the server-minted ids tractable. A `purchase_order_lines` row cannot carry a run id,
but it carries `purchase_order_id` → `purchase_orders.request_order_id` → `request_orders.source_ref_id`, and
that chain is already enforced by the writer (`13_:1780-1790` sets both FKs on every PO line it creates).

**No second lineage system is permitted.** In particular: no "created after time T" rule, no "all rows in the
last N minutes", no run-id-shaped substring search across arbitrary columns. §7 and §10 restate this as a
hard refusal.

### Fields that are genuinely writable by a caller

Measured, not assumed. `00_config.gs:95` states the position outright: *"no RBAC, no server-side identity,
`created_by` client-asserted, Login/RBAC scheduled for P2-A."* So the actor field is fully controllable, which
is the reason §13's actor guard works at all.

| Field | Caller-settable | Evidence |
|---|---|---|
| `created_by` / `generated_by` / `started_by` | YES | 10 `created_by: actor` sites; 4 `created_by \|\| 'operation-system'` |
| `note` | YES on most writers | `13_:709` body docstring; `21_:41` (**required**, not optional); `12_:96` |
| `reference_id` (movements) | YES | `21_:106`, `05_:884` |
| `related_entity_type` / `related_entity_id` (movements) | Server-set from the owner | `21_:921`, `21_:489` |
| `source` / `source_ref_type` / `source_ref_id` (request_orders) | YES | `13_:709`, `13_:724` |
| `external_shipment_id` (shipments) | YES, post-create | `12_:85` |

> **Condition on `request_orders.source_ref_id`.** When `source_ref_type === 'request_order_allocation_batch'`,
> `source_ref_id` is the **exactly-once execution key** and is pre-checked under the script lock to refuse a
> duplicate create (`13_:675-690, 715-716`). A fatigue run may use it for lineage **only** with a run-scoped
> `source_ref_type` of `s8_fatigue_test`, never with the allocation-batch type — otherwise the lineage mark and
> the idempotency key become the same field with two different owners, and the second test order of a run would
> be refused as a replay of the first.

---

## §4 — TABLE INVENTORY AND PER-TABLE LINEAGE MAP

54 tables are referenced by the backend. The table below covers every one that a fatigue run can reach.
`CLEANUP_ORDER` is the position in §9; `—` means the table is never cleaned.

| TABLE | WRITE_OWNER (.gs) | TEST_CAN_CREATE | TEST_MUTATES_EXISTING | LINEAGE_FIELD | PARENT | CLEANUP_ORDER | CLEANUP_SAFE |
|---|---|---|---|---|---|---|---|
| `request_orders` | 13_ | YES | no | `source_ref_id` + `created_by` + `note` | — (root) | 17 | YES |
| `request_order_lines` | 13_ | YES | YES (qty edit) | `note`; inherited | `request_order_id` | 16 | YES |
| `request_order_line_sources` | 13_ | YES | no | inherited | `request_order_id` | 15 | YES |
| `request_order_site_confirmations` | 16_site | YES | no | inherited | `request_order_id` | 14 | YES |
| `request_order_allocation_drafts` | 15_ | YES | YES | id prefix + `created_by` + `note` | — (root) | 21 | YES |
| `request_order_allocation_draft_lines` | 15_ | YES | YES | inherited | draft id | 20 | YES |
| `purchase_orders` | 13_ | YES | YES (status) | `created_by` + `note`; inherited | `request_order_id` | 13 | YES |
| `purchase_order_lines` | 13_ | YES | YES (receipt) | inherited | `purchase_order_id` | 12 | YES |
| `shipping_allocation_drafts` | 16_ | YES | YES | `created_by` + `note` **only** (id is deterministic) | — (root) | 19 | YES |
| `shipping_allocation_draft_lines` | 16_ | YES | YES | inherited | `allocation_draft_id` | 18 | YES |
| `shipping_plans` | 11_ | YES | YES (status) | `submit_batch_id` + `created_by` + `note` | — (root) | 11 | YES |
| `shipping_plan_lines` | 11_ | YES | YES (qty) | inherited | `shipping_plan_id` | 10 | YES |
| `shipments` | 12_ | YES | YES | `external_shipment_id` + `created_by` + `note` | `shipping_plan_id` | 9 | **CONDITIONAL** |
| `shipment_lines` | 12_ | YES | YES | inherited | `shipment_id` | 8 | YES |
| `shipment_line_allocations` | 32_ | YES | YES | inherited | `shipment_line_id` | 5 | YES |
| `shipment_routes` | 31_ | YES | YES | inherited | `shipment_id` | 7 | YES |
| `shipment_events` | 31_ | YES | no | `created_by` + `note`; inherited | `shipment_id` | 6 | YES |
| `shipment_final_output_snapshots` | 34_ | YES | no | inherited | `shipment_id` | 4 | YES |
| `shipment_final_output_lines` | 34_ | YES | no | inherited | snapshot | 3 | YES |
| `shipment_final_output_line_pos` | 34_ | YES | no | inherited | output line | 2 | YES |
| `generated_documents` | 36_/39_ | YES | YES (retry) | `generated_by` + `note` + `related_entity_id` | shipment / PO | 1 | YES (registry only) |
| `factory_stock` | 21_ | **no** (row ensured by master) | **YES** | none — balance row | — | 24 restore | **NO — restore, never delete** |
| `factory_stock_movements` | 21_/12_/22_ | YES | no | `reference_id` + `created_by` + `note` + `related_entity_*` | — | **RETAIN** | **NO — never delete (§0.3)** |
| `overseas_inventory_snapshot` | 05_/31_ | YES | **YES** | none — balance row | — | 24 restore | **NO — restore, never delete** |
| `overseas_inventory_movements` | 05_/31_ | YES | no | `reference_id` + `created_by` + `note` | — | **RETAIN** | **NO — never delete (§0.3)** |
| `factory_stock_override_audit` | 71_ | YES | no | `created_by` | plan | **RETAIN** | NO — append-only ledger |
| `recommendation_calculation_runs` | 23_ | YES | YES | `started_by` + `draft_id` | draft | 22 | YES |
| `inventory_replenishment_gap` | 43_/46_ | YES (by key) | **YES — OVERWRITES** | **NONE** | — | **23, conditional** | **NO — see §0.2 / §6** |
| `order_planning_gap` | 43_/46_ | YES (by key) | **YES — OVERWRITES** | **NONE** | — | **23, conditional** | **NO — see §0.2 / §6** |
| `import_sync_runs` / `import_sync_issues` | 07_/09_ | YES | truncate+rewrite | `sync_run_id` | — | — | out of scope (Amazon sync) |

### Count

```
TESTABLE_ENTITY_TYPE_COUNT = 22   (tables a fatigue run creates rows in and that cleanup may delete from,
                                   counting the gap pair as 2 and excluding the 4 retained ledgers)
```

---

## §5 — MASTER DATA PROTECTION

```
PROTECTED_MASTER_TABLE_SET = {
  sku_details, sku_regional_details, marketplaces, marketplace_skus,
  warehouses, logistics_locations, company_legal_entities,
  carriers, carrier_rate_cards, carrier_lead_times,
  shipment_route_templates, shipment_route_template_nodes,
  pricing_list, pricing_change_log,
  tax_referral_rates, tax_rate_components,
  fc_regular_forecast, fc_special_events, fc_target_rules,
  campaigns, campaign_sku_lines,
  document_templates, document_template_fields,
  amazon_inventory_snapshot, import_sync_runs, import_sync_issues,
  factory_stock, overseas_inventory_snapshot,
  factory_stock_movements, overseas_inventory_movements, factory_stock_override_audit
}                                                                      // 31 tables

TEST_OWNED_ROW_SET = { every row satisfying §3 DIRECT or INHERITED, in the 22 tables of §4 }
```

These are disjoint **by table**, which is the strong form: no row in any of the 31 protected tables is ever a
cleanup candidate, regardless of what it contains or who created it. Cleanup does not need to reason about
whether a protected row "looks like" a test row, because it never looks at those tables at all.

Three entries deserve their reason stated, because each is counter-intuitive:

- **`factory_stock` and `overseas_inventory_snapshot` are protected even though tests mutate them.** They hold
  one balance row per `(warehouse, sku)` and that row is shared with real operations. A test changes the
  *value*; it never owns the *row*. Cleanup restores the value (§6) and must never delete the row — deleting it
  would destroy a real warehouse balance to clean up a test.
- **The two movement ledgers are protected even though tests create rows in them.** §0.3: the reserved balance
  is derived from them. They are append-only by design and stay that way.
- **`pricing_change_log` is protected** for the same reason, and `pricing_list` is additionally gated:
  `PRODUCT_STRATEGY_BOARD_ENABLED_` is server-owned and defaults false (`00_config.gs:88+`), and
  `pricing.fxReconcile` is *deliberately absent* from the required-action list (`63_:513`). Pricing stays out of
  fatigue scope until a round explicitly brings it in.

---

## §6 — SHARED ROW MUTATION (THE HARD PROBLEM)

```
SHARED_ROW_MUTATION_CLEANUP_MODEL =
    FACTORY / OVERSEAS      LEDGER-DERIVED INVERSE through the RUNTIME + reconciliation proof
    GAP TABLES              NO SAFE MODEL EXISTS — excluded from write fatigue (see the decision gate)
```

Factory and overseas were assessed independently, as the task required. They turn out to need the same model,
and the gap tables need a different one that does not exist.

### 6A — Factory and overseas: restore by ledger, not by snapshot

Both ledgers record an exact before/after pair on **every** row:

```
factory_stock_movements     before_current_stock  after_current_stock
                            before_reserved_stock after_reserved_stock
overseas_inventory_movements wh_before_available_stock  wh_after_available_stock
                             wh_before_reserved_stock   wh_after_reserved_stock
                             wh_before_physical_stock   wh_after_physical_stock
```

So the pre-test value is not something the harness has to remember — it is **written into the first movement
row the test itself creates**. A pre-test snapshot is therefore *not required for correctness*; it is required
only as a cross-check, and it is a weaker one, because a snapshot taken at T can be stale by the time the test
writes at T+ε whereas the ledger's `before_*` is the value the write actually saw under the lock.

The restore is performed **through the runtime**, never by editing a cell:

| Axis | Restore mechanism | Why |
|---|---|---|
| reserved (factory) | `cancelShipmentDraft` → `factoryStockReleaseReservationTx_` | Release "gives back at most what THIS owner actually holds" (`21_:500-508`), so it can never release another owner's reservation and never drives the balance negative. Holding nothing is a no-op, which makes it replayable. |
| reserved (overseas) | same, via `05_` | mirrors `21_` |
| current (factory) | `adjustFactoryInventory` with `new_available` = the recorded pre-test value | `new_available` is **absolute state, not a delta** (`21_:50-54`), so the restore is idempotent by construction and a duplicate restore is a no-op with a zero-qty movement row. |
| available (overseas) | `adjustOverseasInventory` with the pre-test absolute value | same shape |

Both adjust actions require a `note` (`21_:48`: *"Note is required"*), so the restoring write is forced to carry
the run id. That is convenient rather than accidental — it means a restore can never be anonymous.

**Required order.** The reserved axis must be restored **before** the owning rows are deleted (§0.3). The
current axis must be restored **after** all test transaction rows are gone, so that nothing re-derives a
demand against the restored number.

**Reconciliation proof.** `factoryStockReconcileReservations_` (`21_:554`) recomputes reserved from the ledger
and compares it to the stored balance. The cleanup acceptance (§20) requires it to return zero drift.

### 6B — The gap tables: no mechanism exists

There is no inverse, because there is no record of what was overwritten (§0.2). The three options are:

1. **Exclude the gap path from write fatigue.** Exercise recalculation read-only and against the existing
   stored rows; never trigger a materialization. Costs coverage of the single busiest write path in the system.
2. **Pre-test snapshot and restore the affected gap rows.** Racy: a real recalculation between snapshot and
   restore is silently reverted by the restore, which is a *worse* failure than the one being prevented, because
   it looks like nothing happened.
3. **Give the fatigue run its own key space** — a test SKU cohort, so `(company,country,marketplace,sku)` is
   never a real key. Costs a change to master data and makes the test SKUs visible on real pages.

Option 3 is the only one that is both safe and complete, and it is an operator decision because of its cost.
It is stated as such in §22.

---

## §7 — MOVEMENT LEDGER SAFETY

```
TEST_MOVEMENT_IDENTIFIABLE = YES
MOVEMENT_CLEANUP_MODEL     = RETAIN PERMANENTLY — no movement row is ever deleted by fatigue cleanup
```

Both ledgers carry every field needed:

```
factory_stock_movements    reference_id (caller-supplied) · created_by (caller-supplied) · note
                           related_entity_type + related_entity_id (= the owning shipment, server-set)
overseas_inventory_movements  the same, plus reference_type and source_module
```

A fatigue run sets `reference_id = S8T-<YYYYMMDD>-R<NNN>-ADJ<nn>` and `created_by = S8_FATIGUE_TEST` on every
adjustment it makes, and the reservation rows it causes are attributable through
`related_entity_id = <the test shipment id>` which §3 INHERITED resolves to the run.

**The refusal, stated as a rule rather than left to judgement:**

> Cleanup MUST NOT select a movement row by date, by time range, by `movement_date`, by `created_at`, or by any
> combination of those with a table name. A movement row is selected only through §3 lineage, and having been
> selected it is **reported**, never deleted.

Retention is not a limitation accepted reluctantly — it is what keeps goal 10 ("auditability after cleanup")
true. After a run is cleaned, the ledger is the only remaining evidence that it happened, and §20's
`SHARED_ROW_BALANCE_RESTORED` is provable precisely because the ledger survived.

---

## §8 — DOCUMENT SAFETY

```
DOCUMENT_CLEANUP_MODEL = REGISTRY ROW DELETED · DRIVE FILE RETAINED (deletion is not possible)
```

**The backend cannot delete a Drive file, and cannot be made to without a new OAuth scope.** Two independent
pieces of evidence:

```
grep -c "setTrashed|removeFile|Drive.Files.remove"  across all 77 .gs   =   0
appsscript.json oauthScopes = [ spreadsheets, script.scriptapp, bigquery ]     <- no drive scope
```

So there is no orphan-file problem to design away — there is a guaranteed orphan, and the contract says so
rather than pretending otherwise. What the contract can do is make the orphan **findable and disposable in one
gesture**, which it does through the folder naming rule:

`dofResolveShipmentFolder_` (`38_:151`) builds `root → {BUCKET} → {external_shipment_id}_{yyyyMMdd}`. Since
`external_shipment_id` is caller-settable post-create (§2), a fatigue run sets it to
`S8T-<YYYYMMDD>-R<NNN>-SH<nn>` **before** generating any document. Every Drive artefact of that run then lands
in folders whose names begin with the run id, and the operator removes them by deleting those folders in the
Drive UI.

**The folder root cannot be redirected to a test tree.** The root comes from
`document_templates.output_folder_id` and `dofResolveBatchRoot_` (`38_:106-119`) refuses the whole batch with
`OUTPUT_FOLDER_ROOT_CONFLICT` if templates disagree. Pointing a template at a test folder would be a master-data
edit that changes where *real* documents go. Rejected.

```
DRIVE_CLEANUP_OWNER        = USER (manual, Drive UI, by folder name)
TEST_DRIVE_FILE_REMAINS    = EXPECTED > 0 until the operator removes the run's folders
ORPHAN_REGISTRY_ROWS       = 0  (registry rows are deleted at cleanup order 1)
```

> **Open question carried to S8-R6.** `37_shipment_document_file_renderer.gs` calls `DriveApp` for
> `makeCopy`, `createFolder` and PDF export, but `appsscript.json` declares no Drive scope. Either the live
> deployment was authorized under a broader scope set than the manifest now declares, or `generate_file: true`
> fails at authorization in production. This was not resolved in this round because resolving it requires a
> live document generation, which is a Production write. **S8-R6 must determine which, read-only, before it
> plans any document fatigue.**

---

## §9 — SAFE CLEANUP ORDER (DERIVED FROM ACTUAL REFERENCES)

Derived from the FK columns the writers actually set, not from the conceptual direction in the task. Two steps
are **runtime actions**, not deletions, and they are in the list because their position matters more than any
deletion's.

```
SAFE_CLEANUP_ORDER = [
   0.  RELEASE RESERVATIONS        runtime: cancelShipmentDraft for every test shipment holding stock.
                                   MUST precede step 9. Orphaned reservations are unrecoverable (§0.3).
   1.  generated_documents         registry rows only; Drive files retained (§8)
   2.  shipment_final_output_line_pos
   3.  shipment_final_output_lines
   4.  shipment_final_output_snapshots
   5.  shipment_line_allocations
   6.  shipment_events
   7.  shipment_routes
   8.  shipment_lines
   9.  shipments
  10.  shipping_plan_lines
  11.  shipping_plans
  12.  purchase_order_lines        + clear request_order_lines.purchase_order_line_id back-refs
                                   (13_:1928+ already does exactly this in its compensation path)
  13.  purchase_orders
  14.  request_order_site_confirmations
  15.  request_order_line_sources
  16.  request_order_lines
  17.  request_orders
  18.  shipping_allocation_draft_lines
  19.  shipping_allocation_drafts
  20.  request_order_allocation_draft_lines
  21.  request_order_allocation_drafts
  22.  recommendation_calculation_runs
  23.  gap rows for test keys       ONLY IF a test SKU cohort exists (§22). Otherwise this step does not run.
  24.  RESTORE SHARED BALANCES     runtime: adjustFactoryInventory / adjustOverseasInventory to the
                                   pre-test absolute value read from the run's first movement row
  25.  RETAIN                      both movement ledgers + factory_stock_override_audit: untouched
  26.  VERIFY                      re-run the dry run; require CLEANUP_CANDIDATE_COUNT = 0 (§20)
]
```

Within every step, rows are deleted **bottom-up by sheet row index**, which is what all twelve existing delete
sites do (`13_:702`, `11_:456`, `15_:97`, `68_:926`) because a top-down loop invalidates the indices below it.

---

## §10 — CLEANUP GUARDS

```
CLEANUP_DEFAULT_EXECUTE   = FALSE
CLEANUP_REQUIRES_DRY_RUN  = YES
CLEANUP_GUARD_COUNT       = 10
```

Six guards are evaluated **per row** and all six must pass (AND, never OR). Four are evaluated **per execution**.
A failure of any guard aborts the entire cleanup with zero deletions — it never skips the row and continues,
because a cleanup that silently skipped something is indistinguishable from one that completed.

**Per row — all must hold:**

| # | Guard | Refusal code |
|---|---|---|
| G1 | the run id matches `/^S8T-\d{8}-R\d{3}$/` and equals the run being cleaned | `RUN_ID_NOT_CANONICAL` |
| G2 | the actor field (`created_by` / `generated_by` / `started_by`) === `S8_FATIGUE_TEST` | `ACTOR_NOT_TEST` |
| G3 | the row is §3 DIRECT, or §3 INHERITED via a parent that resolves to **exactly one** row of **this** run | `LINEAGE_UNRESOLVED` / `LINEAGE_AMBIGUOUS` |
| G4 | the row's id appears in **this run's own observability manifest** (§19) — candidates are matched against what the run recorded creating, never discovered by scanning | `ROW_NOT_IN_RUN_MANIFEST` |
| G5 | the table is not in `PROTECTED_MASTER_TABLE_SET` | `PROTECTED_TABLE` |
| G6 | `created_at` ∈ [run.started_at − 1h, run.completed_at + 24h] — a **corroborating** check, never a selector | `CREATION_WINDOW_IMPLAUSIBLE` |

**Per execution — all must hold:**

| # | Guard | Refusal code |
|---|---|---|
| G7 | `S8T_CLEANUP_MODE_ === 'COMMIT'` (the constant's default is `'DRY_RUN'`) | stays a dry run |
| G8 | `S8T_CLEANUP_CONFIRMATION_` matches the checksum the dry run computed over the exact candidate rows, recomputed live | `CONFIRMATION_STALE` |
| G9 | the rollback journal — the exact bytes of every row about to be removed — is logged **before** the first deletion | `JOURNAL_NOT_WRITTEN` |
| G10 | the live candidate count equals the count the dry run displayed **and** does not exceed the run's own recorded created-row count | `CANDIDATE_COUNT_DRIFT` |

G4 and G10 together are what make this different from a filter. The run records what it created; cleanup
removes what the run recorded. A row the run did not record is not cleaned — it is *reported* as a leak (§19),
which is the honest outcome, because a row that matches the namespace but is not in the manifest means either
the manifest is wrong or something else is writing into the namespace, and deleting it would destroy the
evidence needed to tell which.

G6 is explicitly demoted to a corroborator. The task's §7 refusal — "cleanup must NEVER delete a movement row
merely by date/time range" — is generalised here to every table: **no row is ever selected by time.**

This guard set is the `TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP` pattern (`68_:880-935`) with G1–G6 and G10 added.
G7, G8 and G9 are that function's existing behaviour, adopted unchanged.

---

## §11 — CROSS-RUN ISOLATION

```
CROSS_RUN_ISOLATION_KEY   = FATIGUE_TEST_RUN_ID
RUN_A_CANNOT_DELETE_RUN_B = YES
RUN_A_CANNOT_ADOPT_RUN_B_CHILD = YES
CROSS_RUN_ISOLATION_PROVEN = BY CONSTRUCTION — see below; to be proven EMPIRICALLY in S8-R2
```

**Cannot delete.** G1 pins the run id to the one being cleaned and G4 requires presence in *that run's* manifest.
Run B's rows carry B's id and are absent from A's manifest, so they fail two independent guards.

**Cannot adopt.** G3 requires the parent chain to resolve to exactly one row of the same run. A child whose
parent belongs to B resolves to B, not to A, and `LINEAGE_AMBIGUOUS` is a refusal rather than a tie-break — a
child with two candidate parents aborts the cleanup instead of guessing.

**Cannot read as expected result.** Every assertion a fatigue run makes is scoped to ids in its own manifest. A
run never asserts over a table scan.

**The one real collision risk, and its mitigation.** Deterministic allocation-draft ids
(`SADH-K2-<FNV1a(group key)>`) are a function of the business key alone. Two runs using the *same* business
dimensions produce the *same* draft id, and the resolver's `sadK2ResolveActiveDraft_` (`16_:965-976`) will
return `REUSE` — run B legitimately adopting run A's row. **Mitigation: the group key must differ between runs.**
Since the K2 key is composed of route/site dimensions, this is satisfied automatically by a test SKU cohort
(§22) and must otherwise be satisfied by never running two concurrent fatigue runs against overlapping
dimensions. S8-R2 must assert this explicitly.

---

## §12 — FAILURE RETENTION AND RUN STATUS

```
RUN_STATUS = PLANNED · RUNNING · FAILED_RETAINED · READY_FOR_CLEANUP · CLEANED · CLEANUP_FAILED
```

Transitions: `PLANNED → RUNNING → {READY_FOR_CLEANUP | FAILED_RETAINED}`;
`READY_FOR_CLEANUP → {CLEANED | CLEANUP_FAILED}`; `FAILED_RETAINED → READY_FOR_CLEANUP` only by an explicit
operator decision. **Only `READY_FOR_CLEANUP` is eligible for cleanup.** `FAILED_RETAINED` is a refusal state:
G7 is not enough to clean it, because the whole point of retaining a failed run is that its evidence outlives
the impulse to tidy up.

```
NEW_TEST_RUN_TABLE_REQUIRED = NO
```

Run metadata lives in two places that already exist, neither of which is a schema change:

1. **`PropertiesService.getScriptProperties()`** under key `S8T_RUN_<RUN_ID>`. This is not a new idea in this
   codebase — `11_shipping_plan_handlers.gs:842-865` already stores a durable rollback journal there and deletes
   it on success. It is used in 13 files, needs no OAuth scope, and survives execution boundaries.
2. **A committed ledger file in the repository**, `docs/planning/S8_FATIGUE_RUN_LOG.md`, in the shape of the
   existing `DEPLOYMENT_RELEASE_LOG.md`. This is the durable, reviewable, diffable record; the Script Property
   is the runtime copy.

`recommendation_calculation_runs` was evaluated as a host and **rejected**. Its columns
(`recommendation_type`, `draft_id`, `planning_cycle`, `business_scope_key`, `draft_version`, `current_stage`,
`formula_version`) are recommendation-specific, and rows written there are read by the recommendation workspace.
Putting fatigue-run rows in it would make a production reader see records of a kind it has no model for — the
precise failure mode this whole contract exists to prevent.

---

## §13 — TEST ACTOR IDENTITY

```
TEST_ACTOR = S8_FATIGUE_TEST
```

One value, stamped into `created_by` / `updated_by` / `generated_by` / `started_by` on every row a fatigue run
creates. It is checked against the existing default actors and collides with none of them:
`operation-system`, `system_user`, `sample`, `inventory-replenishment`, `Carrier Rate Card page -> Master
Template`.

It **does not** impersonate a real user, and it carries no run id — the run id lives in the designated lineage
field per §4. Two fields, two questions: the actor answers *"was this made by a test?"*, the run id answers
*"by which one?"*. Guard G2 needs the first to be answerable without parsing, and guard G1 needs the second to
be answerable without inference.

---

## §14 — PRODUCTION DATA COLLISION

```
CURRENT_REAL_DATA_PREFIX_COLLISION_COUNT = 0
  SCOPE OF THIS NUMBER:  (a) the full repository — every .gs, .js, test, fixture and planning document
                         (b) the closed domain of every server-side id generator
  NOT YET COVERED:       a census of live Production rows — see below
```

**(a) Repository.** `S8T` appears nowhere in the repository outside this document.

**(b) Generator domain — the stronger argument.** Every transaction id in this system is emitted by one of the
73 `Utilities.getUuid()` call sites, and each produces a fixed literal prefix. The complete set is:

```
RO- ROL- ROLS- REQ- PO- POL- SP- SPL- SB- SH- SHL- SHP- SLA- SEV- SAD- SADH-K2- SADH-K4- SADL- SADL-K2-
RAD- SC- OVMV- OISN- FSMV- FII- ADJ- GDOC- CRC- CRCB- SRD- CMP- CSL- MPSKU- PRC- FC- EFC- RUN- SYNC-
ISS- PCL- PRW- PORCV- SFOL- SFOP- HEALTH- FLOW- SADDIAG- SADSCHEMA- ROSEND- TWOFLOW- ROREC- SCOPEREG- tok-
fc_target_rules-
```

`S8T` is not in that set and is not producible by any of them — no generator concatenates a caller string ahead
of its prefix. Therefore **no server-generated id can ever collide with the namespace**, which is a stronger
guarantee than "none does today", because it does not expire.

**What is not yet proven.** Caller-supplied id fields (§2, nine of them) accept arbitrary strings, so a human
could in principle have typed `S8T…` into one. A live census would settle it. It was **not** run in this round,
for a reason worth stating rather than hiding: the available read path returns whole tables through a transport
that truncates, and a truncated census reporting zero collisions would be *worse than no census* — it would
manufacture confidence from an incomplete read. S8-R2 must run it as a bounded, editor-run, read-only
`TEMP_S8T_NAMESPACE_COLLISION_CENSUS` that counts per table inside Apps Script and returns only counts.

**Gate:** if that census returns > 0, the namespace is invalid and must be changed before any fatigue round
writes a row.

---

## §15 — SCALE POLICY

Maximum per tier, per run, **before** operator approval. These are ceilings, not targets.

| Tier | Shape | Max request orders | Max plans | Max shipments | Max documents | Max adjustments | Max concurrent |
|---|---|---|---|---|---|---|---|
| T1 | deterministic smoke | 1 | 1 | 1 | 1 | 2 | 1 |
| T2 | repeated cycles | 20 | 20 | 20 | 10 | 40 | 1 |
| T3 | volume | 100 | 100 | 100 | 25 | 200 | 1 |
| T4 | concurrency / race | 10 | 10 | 10 | 5 | 20 | **2** |
| T5 | long-run soak | 100 | 100 | 100 | 25 | 200 | 1 |

**Why T4 is capped at 2 concurrent and not more.** `LockService.getScriptLock()` is used in 31 files and is a
**single global lock for the whole project** — there is no per-table or per-entity lock anywhere. Two writers is
therefore already the complete contention state: one holds, one waits. A third actor adds no new state
transition; it only consumes quota and risks cascading the 30-second `tryLock` timeout into refusals that look
like defects but are just queue depth.

Every tier above T1 requires explicit operator approval for its round. T3 and T5 additionally require the
preceding tier to have completed with `leak_count = 0` and `non_test_row_touched = 0`.

---

## §16 — RATE AND QUOTA SAFETY

Derived from this deployment's own configuration, not from generic Apps Script limits.

```
DEPLOYMENT   executeAs: USER_DEPLOYING · access: ANYONE_ANONYMOUS   (appsscript.json)
```

**The consequence that governs everything here:** every fatigue request consumes the *deploying user's* quota —
the same account the operator's own manual testing runs on. A fatigue run and the operator's parallel manual
test are not independent; they share a quota pool **and the single global script lock.**

| Bound | Value | Source |
|---|---|---|
| read timeout | 45 000 ms | `KM_READ_TIMEOUT_MS_` |
| write timeout | 90 000 ms | `KM_WRITE_TIMEOUT_MS_`; `66_` pins `ROS_CLIENT_WRITE_TIMEOUT_MS_` equal, 2 suites assert it |
| `weeklyAiPlan.generate` | 180 000 ms | `KM_ACTION_WRITE_TIMEOUT_MS_` — already half the 6-minute platform ceiling |
| lock acquisition | 30 000 ms `tryLock` | every lock site |
| gap read page | 5 000 SKUs | `GAP_MAX_SKUS_` |

**Frozen limits for every future fatigue round:**

```
MAX_CONCURRENT_OPERATIONS   2         (= the global lock's full contention state; see §15)
MAX_WRITES_PER_CYCLE        25
COOLDOWN_BETWEEN_CYCLES     >= 5 s    (and >= 30 s after any cycle containing weeklyAiPlan.generate)
RETRY_POLICY                NONE on a write. A timed-out write is ACK_UNKNOWN / INDETERMINATE and is
                            RECONCILED by a read, never resent. This is not a new rule — it is
                            WRITE_AUTOREPLAY_ADDED = NO, already enforced in the API layer
                            (operation-system-db-api.js:4204, :6564).
LOOPS                       every loop bounded by an explicit iteration count. No `while (true)`,
                            no time-based termination, no retry-until-success.
ABORT                       the run halts on the first ACK_UNKNOWN and does not proceed to the next
                            cycle until the reconciling read has settled it.
```

---

## §17 — IDEMPOTENCY TEST CONTRACT (expected outcomes; not implemented this round)

| Scenario | Action | Identity key | EXPECTED OUTCOME | Evidence |
|---|---|---|---|---|
| duplicate click | `createRequestOrderDraft` | `source_ref_type` + `source_ref_id` | second call REUSES the first row; 0 new rows | `13_:675-690` |
| duplicate click | `upsertShippingAllocationDraftAtomic` CREATE_NEW_ROUTE | `create_idempotency_key` | second call reuses; **refuses with 0 writes if the column is absent** | `16_:1973-1988` |
| duplicate click | `submitAllocationDraftsToShippingPlans` | `submit_batch_id` | second call reuses the batch | `11_:640` |
| duplicate click | `receivePurchaseOrderLines` | `idempotency_key` (`PORCV-`) | second call is a no-op | `13_:2421` |
| duplicate click | `adjustFactoryInventory` | **none** | **balance unchanged** (absolute-state write), **plus one extra movement row with qty 0** | `21_:50-54, 100-107` |
| duplicate click | `pricing.update` | `write_id` (`PRW-`) | second call reuses; status readable via `pricing.write.status` | `db-api:2803, 2820` |
| transport timeout after commit | any write | — | `ACK_UNKNOWN` / `REQUEST_TIMEOUT_WRITE_INDETERMINATE`; **no auto-replay**; reconcile by read | `db-api:4094, 6564` |
| retry after unknown outcome | any write | the action's own key | reconcile first; a retry reusing the SAME key is safe, a new key is a second write | `db-api:4179` |
| same absolute-state write twice | `adjustFactoryInventory` / `adjustOverseasInventory` | — | balance unchanged; movement row appended | `21_:103` |
| same entity create twice | `createShipmentFromPlan` | `shipping_plan_id` + `transferred_to_shipment_id` | second refused or reuses | `11_` plan header |
| same dispatch twice | `confirmShipmentAndDispatch` | shipment id + status | second refused on `expected_status` | `22_` |
| same receipt cumulative value twice | `receivePurchaseOrderLines` | cumulative `completed_qty` | idempotent — cumulative, not incremental | `13_` |
| same document retry twice | `document.retry` | active `generated_documents` row | reuses the active row | `36_:20-22` |
| same cancellation twice | `cancelShipmentDraft` | reservation ledger | release of nothing is a **no-op, not an error** | `21_:506` |

The `adjustFactoryInventory` row is the one genuine gap and is flagged accordingly: it has **no replay key**.
Its `reference_id` is accepted but never checked against prior use (`21_:43, 106, 172` — stamped, never
queried). The absolute-state design makes the *balance* safe; the *ledger* still gains a duplicate row. S8-R7
must decide whether that is acceptable or whether `reference_id` should become a real replay key — a runtime
change, and therefore not this round's to make.

---

## §18 — CONCURRENCY CONTRACT

Every entry below holds the **same single global `LockService.getScriptLock()`**. There is no finer-grained
lock anywhere in the project, which is itself the most important fact in this table.

| Operation | Lock owner (.gs) | Identity key | Expected 2nd-actor result | Partial-commit risk |
|---|---|---|---|---|
| recommendation generation | `24_` `applyPersistencePlanWithLock` | `draft_id` + `draft_version` | serialized; stale version refused | LOW — `23_` notes the unlocked variant is NOT race-safe and must not be called |
| request-order submit / send | `66_` + `13_` | `source_ref_id` execution key | REUSE (exactly-once, pre-checked under the lock) | LOW — `roDeleteRequestOrderById_` compensates across all 3 tables |
| shipping-plan submit | `11_` | `submit_batch_id` | REUSE | **MEDIUM** — compensation is a 3-step rollback with a journal in Script Properties (`11_:842`); a failure between journal write and rollback leaves the journal as the only evidence |
| shipment creation | `12_` | `shipping_plan_id` | refused / reuse | LOW |
| reservation acquire | `21_` / `05_` | `(ownerType, ownerId, warehouse, sku)` | `ALREADY_RESERVED` — no-op, tops up a partial | LOW — ledger-derived |
| reservation release | `21_` / `05_` | same | `NO_RESERVATION` — no-op | LOW |
| dispatch | `22_` | shipment id + `expected_status` | refused on status | **MEDIUM** — journal-based rollback (`22_:123`) |
| receipt | `13_` | `idempotency_key` | no-op | LOW — cumulative |
| inventory adjustment | `21_` / `05_` | **NONE** | **both apply; the second is a zero-delta movement row** | LOW for balance, **ledger duplicate** |
| document generation / retry | `36_` / `39_` | active `generated_documents` row | reuse | **MEDIUM** — a Drive file may exist without its registry row being updated; and see the §8 scope question |
| pricing writes | `73_` | `write_id` | reuse; readable via `pricing.write.status` | LOW — **out of fatigue scope** (§5) |

---

## §19 — OBSERVABILITY: MINIMUM REPORT SCHEMA

Every fatigue run emits exactly this object, JSON, logged and committed to the run ledger. It is also the
**cleanup manifest** that guard G4 reads — which is why created ids are recorded as a list rather than a count.

```json
{
  "fatigue_test_run_id": "S8T-20261006-R001",
  "test_actor": "S8_FATIGUE_TEST",
  "tier": "T2",
  "run_status": "READY_FOR_CLEANUP",
  "started_at": "2026-10-06 09:14:02",
  "completed_at": "2026-10-06 09:41:55",
  "frontend_sha": "37151bf",
  "backend_build_id": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40",
  "action_contract_version": 18,

  "action_counts":   { "<action>": { "attempted": 0, "success": 0, "refused": 0, "unknown": 0 } },
  "outcome_totals":  { "success": 0, "refusal": 0, "ack_unknown": 0, "transport_error": 0 },

  "created_entity_ids": { "<table>": ["<id>", "..."] },
  "mutated_shared_rows": [
    { "table": "factory_stock", "warehouse_id": "", "sku": "",
      "axis": "current|reserved",
      "before": 0, "after": 0, "restored_to": null,
      "evidence_movement_id": "FSMV-xxxxxxxx" }
  ],
  "movement_ids":  { "factory_stock_movements": [], "overseas_inventory_movements": [] },
  "document_ids":  [],
  "drive_folder_names": [],

  "cleanup": {
    "dry_run_at": null, "executed_at": null,
    "confirmation_checksum": "",
    "candidates_by_table": { "<table>": 0 },
    "deleted_by_table":    { "<table>": 0 },
    "retained_by_policy":  { "factory_stock_movements": 0, "overseas_inventory_movements": 0,
                             "drive_files": 0 },
    "restored_shared_rows": 0,
    "reservations_released": 0,
    "guard_refusals": [],
    "post_cleanup_candidate_count": null
  },

  "leak_count": 0,
  "leaked_rows": [],
  "non_test_row_touched_count": 0,
  "non_test_rows_touched": []
}
```

`leak_count` counts rows matching the namespace that are **not** in `created_entity_ids` — the manifest/reality
disagreement of §10 G4. `non_test_row_touched_count` must be 0 in every run and is the single most important
number in the report; any value above 0 halts the whole S8 programme pending investigation.

---

## §20 — SAFE CLEANUP ACCEPTANCE

```
TEST_PARENT_ROW_REMAINS          = 0
TEST_CHILD_ROW_REMAINS           = 0
TEST_DOCUMENT_REGISTRY_REMAINS   = 0
TEST_DRIVE_FILE_REMAINS          = EXPECTED > 0   (policy: retained; §8 — deletion is impossible)
TEST_MOVEMENT_ROW_REMAINS        = EXPECTED > 0   (policy: retained permanently; §7)
SHARED_ROW_BALANCE_RESTORED      = YES
  proof A: every mutated_shared_rows entry has after == the recorded pre-test value
  proof B: factoryStockReconcileReservations_ (21_:554) reports zero drift
  proof C: the restoring movement row exists and its after_* equals the original before_*
NON_TEST_ROW_CHANGED_BY_CLEANUP  = 0
RESERVATIONS_RELEASED            = every test shipment that held stock
```

A **second dry run** is then executed. Required: `CLEANUP_CANDIDATE_COUNT = 0`.

If it is not 0, the run moves to `CLEANUP_FAILED` and the rollback journal from G9 is the recovery path. A
`CLEANUP_FAILED` run is never re-cleaned automatically.

---

## §21 — WHAT THIS ROUND DID NOT DO

```
PRODUCTION_ROWS_WRITTEN   = 0
PRODUCTION_ROWS_DELETED   = 0
DELETE_EXECUTOR_WRITTEN   = NO
RUNTIME_FILES_MODIFIED    = 0
BACKEND_CHANGED           = NO
FRONTEND_CHANGED          = NO
LIVE_PRODUCTION_READ      = NONE   (§14 explains why the collision census was deferred rather than guessed)
```

---

## §22 — DB DECISION GATE — **STOP**

```
NEW_TEST_RUN_TABLE_REQUIRED     = NO
NEW_TEST_LINEAGE_COLUMN_REQUIRED = CONDITIONAL — NO for 20 of the 22 testable tables,
                                   YES for inventory_replenishment_gap and order_planning_gap
                                   IF AND ONLY IF gap materialization enters write-fatigue scope
SCHEMA_CHANGE_REQUIRED          = OPERATOR DECISION REQUIRED (see below)
```

**Why 20 of 22 need nothing.** Each has a caller-writable actor field and either a caller-writable lineage field
or a declared FK to a parent that has one (§3, §4). The lineage is carried by fields that already exist and are
already written on every row.

**Why the two gap tables cannot be made to work with the existing schema.** Restating §0.2 as the gate requires:
they have no id column, no actor column and no caller-writable field; their only free-text column (`note`) is
server-authored; their primary key is entirely composed of real business dimensions; and `gapUpsertByKey_`
overwrites the matched row in place with no record of the prior value. There is no field in which to write a run
id and no ledger from which to recover what was overwritten. This is not a preference about where to put a
marker — it is the absence of any place to put one.

### THE DECISION

Three mutually exclusive options. S8-R2 cannot start until one is chosen.

| | Option | What it costs | What it buys |
|---|---|---|---|
| **A** | **Exclude gap materialization from write fatigue.** Exercise the gap path read-only; never trigger a recalculation. | No automated coverage of the busiest write path in the system. Race conditions in `gapUpsertByKey_` stay untested. | Zero schema change, zero master-data change, zero risk to real planning numbers. Available immediately. |
| **B** | **Add a lineage column** (`fatigue_run_id`) to both gap tables via the existing `prodMigrateAppendColumns_` additive migration. | A schema change to two Production tables; a migration round; readers must be confirmed order-agnostic. **Does not solve the overwrite problem** — it marks the row but still destroys the real value that was there. | Identifiability only. **Not recommended** — it buys the lesser half of the problem. |
| **C** | **Create a permanent test SKU cohort** — a small set of `sku_details` + `marketplace_skus` rows, operator-created once by authorized migration, **never deleted by any cleanup**, treated as permanent master data. | Master-data rows are created (though never cleaned). The test SKUs are **visible on real pages** — FC Summary, SKU Details, Request Order — because a SKU that is filtered out of planning cannot exercise planning (`VALID_LIFECYCLES_`: only `Running in the Market` triggers the factory-stock baseline, `00_config.gs:9, 03_:160`). | Solves §6 almost entirely. Every gap key becomes test-owned, so no real planning number is ever overwritten. Every `factory_stock` / `overseas_inventory_snapshot` row the test touches is the cohort's own, so there is no shared balance to restore. No new column anywhere. |

**Recommendation: C, with A as the interim.** C is the only option that makes the *data* safe rather than merely
*labelled*; B labels a destructive write without making it reversible. C's cost is visibility, and visibility is
a cost the operator can see and judge, which is the right kind of cost. Begin with A so S8-R2 and S8-R3 are not
blocked, and adopt C before any round that triggers materialization.

**This round stops here and does not implement any of them.**

---

## §23 — S8 ROADMAP (proposed; none begun)

| Round | Scope | Entry condition |
|---|---|---|
| **S8-R2** | Namespace collision census (live, bounded, read-only, editor-run) + harness skeleton + run ledger file + cross-run isolation proof. **No Production write.** | the §22 decision |
| **S8-R3** | Read-path fatigue + performance baseline. Zero writes. Carries §24 C and D. | R2 census = 0 collisions |
| **S8-R4** | Ordering mainline deterministic write fatigue, Tier 1 → Tier 2, with full cleanup proof. **The first round that writes to Production.** | R3 baseline; explicit operator authorization per tier |
| **S8-R5** | Shipping + reservation + inventory fatigue, including the §6 restore contract end-to-end | R4 cleanup proven at `leak_count = 0` |
| **S8-R6** | Document flow fatigue — **must first settle the §8 Drive scope question read-only** | R5 |
| **S8-R7** | Concurrency, timeout, replay, idempotency (§17/§18), including the `adjustFactoryInventory` replay-key decision | R6 |
| **S8-R8** | System-wide soak (T5) + cleanup proof at scale | R7 |
| **S8-R9** | Known-debt closure — §24 A, B, E, F | R8 |
| **S8-R10** | Final Production fatigue acceptance / S8 seal | R9 |

---

## §24 — CARRIED S8 ACCEPTANCE DEBT (not addressed in R1)

- **A. AVG SALES RUNTIME PROOF** — 90-day lookback, up to the latest 30 eligible NORMAL sales days, Campaign /
  Special-Event actual dates excluded, denominator = the actual eligible-day count; prove the Promotion
  Risk/Event source reaches the calculation. → S8-R9
- **B. FC SUMMARY** — Edit Event Date; More Options toolbar cleanup for Regular/Special; stability/performance.
  → S8-R9
- **C. SKU DETAILS / REGIONAL** — cold/warm performance; prior timeout debt. → S8-R3
- **D. BOOT / LOADING** — boot payload and loading architecture; truthful loading; request leaks / duplication.
  → S8-R3
- **E. TEST HARNESS** — `s2-r4b-shipping-history-and-fc-warm-race :: FAIL A3` prints FAIL while the suite exits
  0. The sweep is exit-code blind. → S8-R9
- **F. READ CONTRACT** — duplicate client-side derivations of factory available / receipt remaining;
  `CURRENT_PRE_SCHEDULE` age bound. → S8-R9
- **G. BRANDING** — dark-mode wordmark contrast: the transparent header logo's wordmark is `rgb(61,61,61)` and
  will need a light variant or a CSS filter. → not an S8 item; carried to the dark-mode round.

---

## §25 — OPEN BLOCKERS

| # | Blocker | Owner | Blocks |
|---|---|---|---|
| 1 | §22 decision: A, B or C | OPERATOR | S8-R2 |
| 2 | Live `S8T` namespace collision census | S8-R2 (read-only) | any write round |
| 3 | §8 Drive OAuth scope: does `generate_file: true` work in production, given `appsscript.json` declares no Drive scope? | S8-R6 (read-only) | document fatigue |
| 4 | Phase-1 read-only Production smoke §8–§18 — the operator-owned portion recorded as PASS in this task's context but never itemised in a report | OPERATOR | nothing in R1; noted for the record |

---

*Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>*
