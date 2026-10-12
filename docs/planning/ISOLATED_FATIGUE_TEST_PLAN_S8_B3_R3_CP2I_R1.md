# ISOLATED FATIGUE TEST PLAN — S8-B3-R3-CP2I-R1 (REV 2)

**STATUS: PLAN ONLY. NOTHING HAS BEEN CREATED, SEEDED, WRITTEN, CLEANED, SCHEDULED OR RUN.**
No live write, no seeding, no cleanup, no schema change, no endpoint change, no Properties or Triggers change,
and no schedule suspension has been performed. Every step below is pending Owner approval.

> **REV 2 — the premise changed.** Rev 1 proposed a separate Spreadsheet, a separate Apps Script project and a
> repointed frontend. Owner has directed that controlled testing use the **existing Sheet** against **verified
> fake transaction / fake inventory scopes**. That replaces *environment* isolation with *row-level* isolation,
> which is a harder guarantee: there is no longer any structural barrier between the test and real data, so
> every control below has to be a **proof about rows**, carried in the data itself.

---

## 0. THE SENTENCE THIS PLAN IS BUILT AROUND

> **"Do not assume an entire table is expendable because most rows are fake."**

Every control here follows from that. The unit of safety is **the row**, never the table, and a row is in scope
only when it is **proved** test-owned by the predicate in §2 — not when it looks like test data, not when it sits
in a table that is mostly test data, and not when someone remembers creating it.

**The repository cannot answer which rows are fake.** That is a property of the live Sheet, not of the code. This
document therefore specifies the **census that establishes the scope** (§2) and refuses to guess its result.

---

## 1. EXACT WRITABLE TABLES

Derived from the committed sources at the candidate HEAD — every `getSheetByName` target that is reached by an
`appendRow` / `setValue` / `setValues` call, grouped by what the Owner's constraint makes of it.

### 1.A — MASTER / REFERENCE: **READ-ONLY. NOT IN SCOPE. NOT WRITTEN BY ANY TEST.**

`marketplaces` · `sku_details` · `marketplace_skus` · `sku_regional_details` · `warehouses` · `carriers` ·
`carrier_rate_cards` · `carrier_lead_times` · `fc_target_rules` · `pricing_list` · `tax_referral_rates` ·
`shipment_route_templates` · `shipment_route_template_nodes` · `document_templates` ·
`document_template_fields` · `campaigns` · `campaign_sku_lines` · `fc_special_events`

These all **have** write handlers. They are excluded by Owner policy, not by the absence of a writer — so the
exclusion must be enforced by **not dispatching those actions**, and verified afterwards by §5 reconciliation.

### 1.B — AMAZON / IMPORT: **READ-ONLY. NOT IN SCOPE.**

`amazon_inventory_snapshot` · `import_sync_runs` · `import_sync_issues` · `fc_regular_forecast`

`runAmazonSnapshotImports` is a scheduled background writer of these (§3). The test neither triggers it nor
writes what it owns.

### 1.C — TRANSACTION / INVENTORY: **CANDIDATE SCOPE, row-by-row, subject to §2**

| Flow | Tables |
|---|---|
| Shipping plan | `shipping_plans` · `shipping_plan_lines` · `shipping_allocation_drafts` |
| Shipment | `shipments` · `shipment_lines` · `shipment_routes` · `shipment_events` · `shipment_line_allocations` |
| Procurement | `request_orders` · `request_order_lines` · `request_order_line_sources` · `request_order_allocation_drafts` · `purchase_orders` · `purchase_order_lines` |
| Inventory + ledgers | `factory_stock` · `factory_stock_movements` · `overseas_inventory_snapshot` · `overseas_inventory_movements` |
| Documents | `generated_documents` |

**`factory_stock` and `overseas_inventory_snapshot` are the dangerous two.** They are *inventory*, not
transactions: a row is a **(sku, warehouse) balance**, shared by every scope that touches that pair. A fake
shipment drawing on a real SKU at a real warehouse mutates a **real balance**. This is precisely the trap the
Owner's sentence warns about, and it is why the scope in §2 is keyed on **(sku, warehouse)** and not on the
transaction that happens to reference them.

### 1.D — TEST-OWNED SCOPE: **TO BE ESTABLISHED, NOT ASSUMED**

The test-owned scope is the triple **(SKU set, warehouse set, marketplace scope)**. **This plan does not name
its members**, because naming them from the repository would be the assumption the Owner prohibited. §2 is how
they are determined; §7.1 is the Owner confirmation required before any of them is treated as expendable.

---

## 2. THE OWNERSHIP PREDICATE AND THE VERIFYING CENSUS — all READ-ONLY

A row is **TEST-OWNED** only if **all five** hold. Any row failing any one of them is **REAL** for this plan's
purposes, whatever it looks like.

1. **Named by the Owner**, from §7.1 — an explicit list of SKUs, warehouses and marketplace scopes the Owner
   confirms are fake. Nothing is inferred from naming conventions.
2. **Not referenced by any row outside the scope.** A fake shipment line pointing at a real PO line makes that
   PO line reachable. The census walks the foreign keys **outward** and fails the row if it escapes.
3. **Not a master row** (§1.A) and not Amazon-owned (§1.B).
4. **Its (sku, warehouse) balance rows are themselves test-owned** — the §1.C warning, enforced.
5. **It holds no live reservation or exposure owned by anything outside the scope**, per §4.

**THE CENSUS (read-only, dispatched through existing read actions only — `getTable`, `rawInventory.get`,
`inventoryScope.registry.get`, `document.list`).** It produces, per candidate table: total rows, rows satisfying
1–5, rows failing each predicate **with the reason**, and the FK edges that cross the boundary. **It writes
nothing.** Its output is the scope proposal the Owner approves or rejects in §7.1.

**The existing precedent, and where it stops.** `TEMP_demo_shipping_shipment_map_seed_v2.gs` already establishes
the house pattern for controlled writes into the live Sheet: a deterministic id prefix, a fixed FK-safe write
order, a declared read-only authority list, five-way state classification
(`ABSENT_ALL` / `PRESENT_EXACT_ALL` / `PARTIAL_PRESENT` / `CONTENT_DRIFT` / `DUPLICATE_DEMO_ID`) that commits
**only** on the first two and refuses the rest *before any mutation*, a durable journal, and inserted-only
reverse-FK rollback. **This plan adopts all of it.**

**But it is not sufficient, and the difference matters.** That seed states plainly that it *"NEVER calls a
production Submit/create/dispatch/receive handler (rows are inserted directly)"* and is *"VISUAL-DEMO data only.
It does NOT live-verify the operational workflow."* A fatigue test exists precisely to call those handlers. So
the seed's safety machinery transfers; its safety *argument* — that no production code path runs — does not.
**That gap is the central residual risk of this plan** (§6.1).

---

## 3. ACTIVE BACKGROUND WRITERS AND THE PROPOSED TEST WINDOW

**No schedule is suspended by this plan.** The window is chosen to avoid the writers; the writers are not moved.

| Writer | Handler | DEFAULT cadence (Asia/Taipei) | Default state | Writes |
|---|---|---|---|---|
| Amazon / Site Data import | `runAmazonSnapshotImports` | **DAILY 12:30** | enabled | §1.B tables |
| Inventory Gap materialization | `runDailyInventoryGapMaterialization` | **DAILY 13:30** | enabled | gap / replenishment materialization |
| Order-planning Gap materialization | `runDailyOrderPlanningGapMaterialization` | **DAILY 03:30** | enabled | order-planning materialization |
| Weekly Inventory Recommendation | `runWeeklyInventoryRecommendation` | WEEKLY Monday 14:00 | **disabled** (opt-in) | recommendation drafts |
| Monthly Order Recommendation | `runMonthlyOrderRecommendation` | MONTHLY day 10, 14:00 | **disabled** (opt-in) | recommendation drafts |
| Job continuations | `gapJobContinue_`, weekly-reco + overseas-preview continuations | **`.after(ms)` self-chaining — NO fixed hour** | n/a | job state |

**These are the code DEFAULTS, not the live schedule.** The effective configuration lives in Script Properties
and may differ in time or in enabled state. **Read it with `automationSchedule.get` (read-only) before fixing the
window** — this plan must not be the reason a run collides with a job somebody re-timed.

The three enabled defaults cluster **12:30 / 13:30** and the two opt-in jobs land at **14:00**, so the daytime
busy band is roughly **12:00–14:30**, with a second at **03:00–04:30**.

**The project timezone authority is Asia/Taipei**, and `atHour` only matches if the project timezone is set to
it — so the two daily times above are only trustworthy if that is still true. **Verify before the window**, via
the read-only `automationSchedule.get`, which also returns the configurable cadences this table cannot fix.

**THE LOCK IS THE REAL CONSTRAINT, AND IT IS NOT A SCHEDULING PROBLEM.** `LockService.getScriptLock()` is **one
lock for the whole project**. `gapJobContinue_` holds it for up to **240 s**. A continuation trigger is chained
with `.after(ms)` and therefore **has no fixed hour** — a Gap job started before the window can still be holding
the lock inside it. The honest consequence: **`LOCK_UNAVAILABLE` refusals are an expected result, not a failure**,
and the run must be able to tell a contention refusal from a defect. That distinction is a test case (§5 F-6),
not an obstacle to remove.

**PROPOSED WINDOW — for Owner approval, not adoption:** a **two-hour attended** window inside roughly
**16:00–21:00 Asia/Taipei**, which clears both busy bands by a wide margin, on a day that is neither Monday nor
the 10th (so the two opt-in jobs cannot matter even if they have since been enabled), and confirmed against the
live `automationSchedule.get` answer rather than against the defaults above. **Attended** is a requirement, not a preference: §6.4 quota exhaustion is shared with
Production and the run must be abortable by a human at any moment.

---

## 4. RESERVATION, RELEASE AND WHAT MUST RECONCILE

The frozen model, from the sources — this is what reconciliation checks, and the vocabulary matters:

- **A RESERVATION is owned by a SHIPMENT and only by a shipment.** `FSTX_RESERVATION_OWNER_TYPE_` and
  `OVSTX_RESERVATION_OWNER_TYPE_` are both `'shipment'`, and both acquire sites pass a `shipment_id` as owner.
- **A PLAN owns EXPOSURE, not a reservation.** `KMFSG` derives exposure from plan status, counting `approved`
  and releasing on `cancelled` / `completed`. **Cancelling the plan IS the release** — there is no quantity to
  move and no movement row to write.
- **The baton passes exactly once:** a transferred plan stops holding exposure in the same moment its shipment
  starts holding a reservation — *"no window in which both count and none in which neither does."* **That
  sentence is the single most important thing a fatigue test can falsify**, and it has never been tested live.
- **`UNKNOWN` is its own answer.** An unresolvable shipment lookup refuses (`SHIPMENT_EXISTENCE_UNKNOWN`,
  `SHIPMENT_STATE_SEAM_MISSING`) rather than being read as ABSENT, which would release the exposure of a plan
  whose shipment still holds a reservation.
- **The ledgers are the evidence:** `factory_stock_movements` and `overseas_inventory_movements`, with a closed
  `movement_type` vocabulary including reserve-acquire and reserve-release.

**RECONCILIATION — run before and after, and the diff is the result.**

1. **Exposure/reservation closure:** at window end, every test-owned shipment is terminal and holds **zero**
   reservation; every test-owned plan is terminal and holds **zero** exposure. A non-zero residue is a leak and
   is reported as one.
2. **Ledger conservation:** per (sku, warehouse) in scope, `Σ acquire − Σ release = 0` across the run, and the
   closing balance equals the opening balance. **To the unit.**
3. **Boundary integrity:** **zero** movement rows, **zero** balance deltas and **zero** modified rows for any
   (sku, warehouse) **outside** the scope. This is the proof that §1.C's trap was avoided.
4. **Master immutability:** every §1.A and §1.B table has an unchanged row count and unchanged `updated_at` /
   `updated_by` across the window. **This is the proof that the Owner's read-only constraint held.**
5. **Attribution:** every changed row in scope is claimable by a §5 run ID. **A changed row that cannot be
   claimed is an unexplained diff and fails the run** — it is not investigated and partially accepted.

---

## 5. RUN IDS, EXPECTED CHANGES AND THE CASES

**RUN ID.** `FTG-<yyyyMMdd-HHmm>-<nn>` per run; every case carries `FTG-…-<case>` in `updated_by` on every write
it causes, and all synthetic entity ids carry a fixed deterministic prefix, following the `DEMO-` precedent. The
run manifest records the run ID, the approved scope (§7.1), the window, the pre-run census and the §4 opening
balances. **A write that cannot be attributed to a run ID is treated as not ours — which is how a leak is
detected rather than argued about.**

**EXPECTED CHANGES are declared BEFORE the run, per case**: which tables, how many rows, which (sku, warehouse)
balances and by how much. **The run is checked against the declaration, not against itself.** A case whose actual
changes exceed its declaration halts the run (§6 stop condition 3).

| # | Case | What it falsifies |
|---|---|---|
| **F-1** | Reservation acquire | A shipment holds the reserve immediately; a second draft cannot take the same quantity. |
| **F-2** | Cancellation / reversal | Cancel releases **exactly** what was held — never more (inflates availability), never less (strands stock). Measured on the ledger, not on a status field. |
| **F-3** | Baton pass | §4's "no window in which both count and none in which neither does", tested at the plan→shipment transfer under concurrent reads. |
| **F-4** | Count-once | One demand unit appears in exactly one plan when replenishment and order-planning run on overlapping test scope. |
| **F-5** | Conservation | `requested = allocated + unallocated + rejected`; `received ≤ dispatched ≤ planned`. **Per scope and in total** — a totals-only check passes while two scopes swap quantities. |
| **F-6** | Concurrency + lock | Two clients on one test scope. `LOCK_UNAVAILABLE` is an **expected** outcome; what must never appear is a half-applied document or a refusal that wrote something. |
| **F-7** | Duplicate submission | The same request twice (double-click, retry, stale tab) causes **one** effect. The `km_rid` / `request_id` seam already exists in `01_router.gs`; this establishes **which handlers honour it**. **Expect findings.** |
| **F-8** | Timeout | Client killed mid-request at each stage. Every outcome classifies into the four S3-R10 states, and **`CONFIRMED_REJECTED` never appears without zero-write evidence** — the CP2C defect. |
| **F-9** | Document failure | A failed render leaves no shipment in a state no action can exit, and `document.retry` never yields a second document for one shipment. |

### EXCLUDED, AND REPORTED AS **UNTESTED** — not worked around

- **Real-SKU Gap materialization** — excluded by Owner. The daily jobs are neither triggered nor suppressed, and
  no conclusion about gap behaviour is drawn from this run.
- **`marketplace.allocationPriority.set` — THIS ROUND'S OWN WRITER. See §6.2. UNTESTED under fatigue.**

---

## 6. UNRESOLVED OWNERSHIP AND ISOLATION RISKS

### 6.1 The seed precedent's safety argument does not transfer *(highest severity)*
The `DEMO-` seed is safe partly because it **never calls a production handler**. A fatigue test must. So a
defect in a production write path can damage data the seed never could, and the blast radius is bounded only by
the §2 scope being correct. **If the scope is wrong, every other control in this document fails with it.**

### 6.2 The CP2I writer cannot be fatigue-tested under the current constraint *(decision required)*
`marketplace.allocationPriority.set` writes the **`marketplaces`** table — which is a **Master** (§1.A), and
Masters are read-only by Owner direction. The writer this round exists to harden therefore **cannot be exercised
live** without one of:

- **(a)** a **test-owned marketplace row**, Owner-named and Owner-confirmed as fake — a *Master write*, requiring
  explicit Owner approval and narrowly scoped to that one row; or
- **(b)** accepting it as **UNTESTED under fatigue**, resting on the 438 offline assertions and the 720-run
  bounded stress.

**Recommendation: (b) for this cycle, (a) only as its own separately-approved micro-test.** The offline evidence
covers behaviour; what it cannot cover is the *real* Apps Script runtime — real `LockService` contention, real
`SpreadsheetApp.flush()`, real execution limits — and that gap stays open and is stated rather than closed.
**This plan does not take that decision.**

### 6.3 There is no structural barrier at all
With one Sheet and one project, the only thing between a test write and real data is the correctness of the
scope and of the code under test. Rev 1's environment separation provided a barrier that no longer exists; its
absence is the cost of testing against real structure, and it should be acknowledged rather than mitigated with
confidence.

### 6.4 Shared quota and a shared lock
Execution and Drive quotas belong to the account, not the test. Exhausting them degrades **Production
availability** even though no Production *data* is touched. The lock is one per project, so the run competes with
live operators and with job continuations that have no fixed hour (§3).

### 6.5 Ownership that cannot be resolved from the repository
Which rows are fake · whether the project timezone is still Asia/Taipei · the configured Amazon-import cadence ·
whether a test-owned `document_templates` row with its own `output_folder_id` may exist (§7 — a config write) ·
whether any fake row is referenced by a real one. **All of these are live-data questions and are left open.**

### 6.6 The audit-column prerequisite is live and unverified
From CP2I-R1: if the live `marketplaces` tab lacks `updated_by` or `updated_at`, every priority save now refuses
with `SCHEMA_MISSING_COLUMN`. **This is checkable read-only, before any test**, and should be — it is a
deployment prerequisite independent of fatigue testing.

---

## 7. RECOVERY, THE TEST DRIVE FOLDER, AND WHAT OWNER MUST STILL DO

### 7.A RECOVERY PROCEDURE — ordered, and honest about what it cannot do

1. **BACKUP FIRST, CONFIRMED BY OWNER.** A full Sheet copy taken immediately before the window, its location and
   timestamp recorded in the run manifest. **No fatigue step begins until Owner confirms the backup exists.**
   This is the only recovery control that works regardless of what goes wrong.
2. **Journal.** Every write the run causes is recorded — table, row key, before-image, run ID — following the
   `DEMO4A_JOURNAL_KEY_` pattern, with an integrity checksum, so recovery never depends on inference.
3. **Reverse-FK, inserted-only rollback** of test-owned rows, in reverse write order, matching the seed
   precedent. It removes what the run *inserted*.
4. **Ledger compensation is NOT rollback.** Movement rows are append-only history; a reservation is released by
   a **compensating movement**, never by deleting the acquire. Recovery restores the *balance*, and the history
   correctly keeps showing that the test happened.
5. **If the journal is incomplete, STOP and restore from the §7.A.1 backup.** Do not reconstruct by inspection.
6. **A Master or Amazon table changed → STOP and escalate immediately.** Do not self-repair: the fact that it
   changed is more important than the change, and repairing it destroys the evidence.

### 7.B DEDICATED TEST DRIVE FOLDER

Generated documents are routed by **`document_templates.output_folder_id`** — the single root authority; no Drive
id is hardcoded (a test asserts this), and the field may legitimately hold a full URL, which is normalised before
reaching Drive. A dedicated test folder is therefore achieved by a **test-only `document_templates` row** whose
`output_folder_id` is a new, empty, Owner-created Drive folder used by nothing else.

**This is a write to a shared config table (§1.A) and needs explicit Owner approval.** The alternative — reusing
a production template — would write test documents into a production folder and is rejected. If neither is
approved, **document cases F-9 are UNTESTED** and no document is generated at all.

### 7.C WHAT OWNER MUST STILL DO — none of it has been done

1. **Approve the §2 census being run** (read-only) and then **confirm the resulting SKU / warehouse / marketplace
   scope**. Nothing is treated as fake before this.
2. **Decide §6.2** — (a) a test-owned marketplace row, or (b) accept the priority writer as UNTESTED.
3. **Approve or refuse the §7.B `document_templates` row** and create the Drive folder if approved.
4. **Confirm the backup exists** (§7.A.1), and **approve scope, scale and test window** explicitly.
5. **Confirm the project timezone** and the configured Amazon-import cadence, so §3's window is sound.
6. **Accept the §6.4 shared-quota exposure**, and staff the window — it must be attended.

---

## 8. SCOPE LIMITS OF THIS DOCUMENT

Nothing here has been executed. No live write, seeding, cleanup, schema change, endpoint change, Properties or
Triggers change, or schedule suspension has been performed or is proposed as part of this planning step.
**Before any fatigue testing: STOP for Owner backup confirmation and explicit approval of scope, scale and test
window.**
