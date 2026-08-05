# Supply Planning Formula Runtime — Current-State Reconciliation (Phase F1-0)

> **Owner Boundary / Classification.** READ-ONLY reconciliation audit. This document **records** the current state of the supply-planning formula runtime (documentation ↔ code ↔ DB ↔ UI); it invents **no formula**, changes **no business logic**, alters **no DB schema**, deploys nothing, and accessed **no live Spreadsheet**. Formula authority remains `SUPPLY_PLANNING_CALCULATION_RULES.md`; schema authority remains `DATABASE_RELATIONSHIP_MAP.md`; cadence authority remains `SYSTEM_RUNTIME_ARCHITECTURE.md §7A`.
> - **Round:** F1-0 (Formula Runtime Current-State Reconciliation).
> - **Date:** 2026-08-05.
> - **Baseline HEAD at audit:** `9324086` (UI-GLOBE-01).
> - **Method:** full read of the canonical formula/spec set + all 25 `supply-planning-*` core modules + the recommendation/allocation/shipment Apps Script handlers + all 8 Phase-1 frontend pages + the shared adapter; **80/80 test files executed green** from Main (Golden Matrix 39 executed / 1 pending / 0 canonical-blocked; Scenario #34 Pending).
> - **Companion documents (this round):** `SUPPLY_PLANNING_FIELD_OWNERSHIP_MATRIX.md`, `PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md`, `SUPPLY_PLANNING_DECISION_REGISTER.md`.

---

## 0. Executive reconciliation — the one fact that governs everything

The system has **two distinct runtime lanes**, and the entire Phase-1 gap is the **seam between them**:

| Lane | State | Evidence |
|---|---|---|
| **Lane 1 — Calculation Pure Runtime** | ✅ **FUNCTIONALLY COMPLETE / TEST-VERIFIED / canonically closed** for every frozen contract. | `SUPPLY_PLANNING_CALCULATION_RULES.md` v4.7 §Calc-Closure; `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md §Calc-Closure`; Golden Matrix **39/1/0**; ~11 pure modules, **1,000+ assertions**. |
| **Lane 2 — Recommendation / Persistence / Orchestration Runtime** (live source read → invoke pure calc → persist output → read back into UI → schedule) | ❌ **NOT WIRED / NOT DEPLOYED / fail-closed.** Contract FROZEN; pure state-machine + repository slice implemented as **fake-sheet-tested modules**; scheduler / LockService / trigger / live-source read / **output writer** / Submit → all NOT IMPLEMENTED or NOT DEPLOYED. | `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md §Persist-Orch / §A–§K`; every `.gs` self-labels "SOURCE MIRROR / NOT DEPLOYED". |

**Consequence, stated plainly:** every formula the business asked for **is implemented and proven correct as a pure function**, but **no Phase-1 browser page can reach it** (`index.html` loads **zero** `supply-planning-*.js`; 0 of 8 pages reach the canonical core), and **no deployed writer persists a single recommendation output** — so `recommended_qty`, `calculated_gap_qty`, `net_order_need_snapshot` stay **blank** and the Inventory Replenishment UI renders the honest "recommendation engine is not active" state (`inventory-replenishment.js:3448-3451`, `IRMap.needBuckets()`→`suggestedQty:0` at `:629-633`).

This is **not** "the engine is broken." It is "the engine is built, tested, and disconnected." Phase F1 is the connection work, not calculation work.

---

## 1. Evidence base

- **Formula / spec authority read:** `SUPPLY_PLANNING_CALCULATION_RULES.md` (v4.7), `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md` (Draft v1.2), `RECOMMENDATION_SOURCE_CONTRACT_SPEC.md`, `INVENTORY_TABLE_MAPPING_SPEC.md`, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`, `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` + `REQUEST_ORDER_AND_PO_SPEC.md` + `PURCHASE_ORDER_SPEC.md`, `ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md`, `SHIPPING_ALLOCATION_TO_SHIPMENT_CANONICAL_AMENDMENT_2026-07-27.md`, `FC_SUMMARY_SPEC.md`, `project-current-state.md`.
- **Runtime read (in full):** all 25 `assets/js/core/supply-planning-*.js` modules; Apps Script `01_router.gs`, `04/14` (forecast), `05/21` (inventory), `11/12/16/22` (shipping/shipment/allocation/dispatch), `13/15` (procurement/request-allocation), `23/24/25/26/27/28/29` (recommendation persistence/orchestrator/source/safety), `40` (weekly workspace), `90_generated_supply_planning_bundle.gs` (manifest).
- **Frontend read (in full):** `forecast.js`, `fc-summary.js`, `inventory-replenishment.js`, `factory-stock.js`, `overseas-stock.js`, `request-order.js` + `request-order-draft.js`, `purchase-order-overview.js`, `shipping-plan.js`, `operation-system-db-api.js`, `km-api-foundation.js`, `index.html` load order.
- **Tests executed:** all `assets/tests/*.test.js` — **80 files, 80 PASS, 0 FAIL** (run 2026-08-05 from Main). Golden Matrix **39 executed / 1 pending / 0 canonical-blocked**; Scenario **#34 Pending** (downstream partial-carton Order Qty acceptance). The pre-existing `replen-draft-completeness` P29–P31 failures are **resolved** (Round C2-D1R retargeted the assertion to the private `sadUpsertLinesKeyedCore_` core); the file now passes — the API-1/API-2 ledger lines calling them "still failing" are **stale**.
- **One cross-audit discrepancy personally re-verified:** `calculateEffectiveFC` / `getEffectiveTargetPct` in `fc-summary.js` are exposed **only** on `window.fcDebug.getEffectiveFc` (`fc-summary.js:1548`); **no render/save path invokes them** → the Target%→adjusted-forecast layer is **DEAD_OR_LEGACY** (a claim that FC Summary applies Target% live was checked and rejected).

---

## 2. Status vocabulary (per round §4)

`FROZEN_AND_IMPLEMENTED` · `FROZEN_IMPLEMENTATION_PARTIAL` · `FROZEN_NOT_IMPLEMENTED` · `IMPLEMENTED_NOT_CONNECTED` · `CONNECTED_NOT_PERSISTED` · `PERSISTED_NOT_READBACK_VERIFIED` · `UI_ONLY` · `MOCK_OR_DEMO_ONLY` · `DOCUMENT_ONLY` · `SOURCE_PRESENT_RUNTIME_UNVERIFIED` · `CONFLICTING_AUTHORITY` · `PHASE_2_DEFERRED` · `DEAD_OR_LEGACY` · `UNKNOWN_EVIDENCE_REQUIRED`.

> Every `.gs` handler in the active tree is additionally `SOURCE_PRESENT_RUNTIME_UNVERIFIED` at the deployment layer — the repo is a **source mirror**; live execution of the deployed Web App version cannot be confirmed from the repository, and no live Spreadsheet was accessed this round.

---

## 3. Domain-by-domain reconciliation

### A. Forecast authority
- **Regular FC / Special-Event FC / Target-rule CRUD** — `SOURCE_PRESENT_RUNTIME_UNVERIFIED` (implemented + persisted + readback). Real chain UI→adapter→router→handler→Sheet: `fc-summary.js:saveFcChanges(826)/saveRegularUpdate(3242)` → `importFcRegularForecastBatch` (`01_router.gs:72`) → `04_marketplace_forecast_import.gs:handleImportFcRegularForecastBatch_(485)`; Special events → `14_fc_write_handlers.gs:fcSpecialEventUpsert_(205)`; target rules → `handleUpsertFcTargetRule_(427)`. Writers reload on success (readback wired). Values are **raw / `draft`**; there is **no approval workflow**.
- **Target% → adjusted / effective monthly forecast** — `DEAD_OR_LEGACY`. `getEffectiveTargetPct(1252)`→`calculateEffectiveFC(1287)`→`getEffectiveFcSafe(1439)` exist but are reachable **only** via `window.fcDebug` (`:1548`); `renderFcRegularTable` prints raw `item.months`. **A stored Target% changes nothing downstream** — this is the Forecast domain's first functional break.
- **Forecast Review accuracy / actuals** — `MOCK_OR_DEMO_ONLY`. Accuracy hardcoded `95/92/88%` (`forecast.js:1056-1058`); series fabricated via `Math.random` (`:576/582`); `forecast.js` has **zero `KM.DB` references**; the BigQuery actual-sales feed is PENDING.
- **Event pull-forward timing** — `PHASE_2_DEFERRED` (no lead-time/pull-forward allocation engine; supply timing guardrailed out per FC_SUMMARY_SPEC §10).
- **Grain vs upsert-key gap (documented):** row grain includes category/series but the upsert key excludes them (`04_…:532/583`) — a live collision risk labelled a "Known Contract Gap" in FC_SUMMARY_SPEC §1.

### B. Inventory Projection
- **§8/§9 month-by-month opening→closing projected balance, Days-of-Supply engine, §6 target-stock coverage** — `DOCUMENT_ONLY`. **There is no projection engine.** The pure core computes a single-window `calculateGap` (`supply-planning-calculations.js:160-167`) and only *classifies* a caller-supplied balance via `classifyProjectedBalance` (§11). Days-of-Supply in the UI is `UI_ONLY` (`inventory-replenishment.js:603/1174`, `current÷avg`).
- **Current / available / third-party / approved / shipped-in-transit / source_data_as_of / warehouse grain** — `CONNECTED_NOT_PERSISTED`. Real snapshot columns are read by the production source chain (`supply-planning-source-projection.js` → `-source-reader-production.js` → `-source-reader.js`), bound to `SpreadsheetApp.getActiveSpreadsheet()` only inside the **undeployed** `27_/24_.gs` mirror; `persistenceStatus: NOT_EXECUTED`; nothing persisted. **`available` is read verbatim** from `wh_available_stock` — the code never computes `physical − reserved − damaged`.
- **Reserved stock** — `DOCUMENT_ONLY` (no audited module reads/derives it; reservation is a downstream B-1 concern).

### C. Qualified Incoming / Supply Ledger
- **§2E ten-gate Qualified-Incoming engine** — `IMPLEMENTED_NOT_CONNECTED`. `supply-planning-qualified-incoming.js:evaluateQualifiedIncoming` (106 assertions) + B4-R4/R5 adapters are fully implemented and tested, **but are not on the production ledger path** — `source-projection.js` maps `shipments.status`→lifecycle bucket via its **own** status map and feeds `buildSupplyLedger` directly, so **real shipment rows reach the ledger unqualified** (no ETA≤Required-By gate, no count-once-vs-current-stock gate).
- **§39 Demand/Supply Ledger builders, dedup, pool key, FACTORY_SHARED, correction/reversal, unsupported-legacy fail-closed** — `FROZEN_AND_IMPLEMENTED` (`supply-planning-ledgers.js`, 133 assertions).
- **delivered-not-received / received-not-reflected** — `FROZEN_IMPLEMENTATION_PARTIAL` (bucket tokens + fixtures exist; **no live carrier/receiving producer** — `shipment_events` and the receiving layer are SPEC-ONLY).
- **Live production rows into the ledger:** possible **in source only**, through an undeployed READ-ONLY `.gs` mirror with **no output writer**, and **only** for CURRENT_STOCK + plan/shipment on-the-way buckets.

### D. Replenishment Recommendation
- **`calculateGap` (§2C.1/§31), shipping FLOOR + residual, order CEILING (§14), survival need, allocation priority, integer/largest-remainder, available-qty cap** — `FROZEN_AND_IMPLEMENTED` (pure; matches the §31 worked example 300/279/40 → ship 240 / residual 60 / order 80).
- **`recommended_qty` / `calculated_gap_qty` / `net_order_need_snapshot` reaching the DB** — `IMPLEMENTED_NOT_CONNECTED`. Resolvers (`supply-planning-source-facts.js:resolveWeekly/MonthlyRecommendationFacts`) + plan-builder + locked persistence are test-verified, but **no deployed writer feeds the columns**; they are blank in production (never faked). `supply-planning-plan-builder.js:35-38 LIVE_ANALYSIS_FORBIDDEN` deliberately throws if a live gap/shortage is persisted as authority — snapshot-vs-authority separation.
- **Route / method recommendation** — `DOCUMENT_ONLY` (no `replenishment_route_rules` engine; UI shows persisted method fields or `--`). Note a *separate* read-only method-candidate helper exists server-side (`getShippingMethodCandidates`) but is **called by no page** (backend-only).

### E. Factory Stock Allocation
- **Physical `factory_stock` / `factory_stock_movements` / manual adjustment** — `FROZEN_AND_IMPLEMENTED` and **the one live deployed writer in the supply domains** (`21_factory_inventory_handlers.gs:handleAdjustFactoryInventory_`, atomic + rollback-safe).
- **`FACTORY_SHARED` company-agnostic pool + deterministic FIFO allocator** (`supply-planning-allocations.js:allocateFactoryDeterministic`) — `FROZEN_AND_IMPLEMENTED` (pure, test-verified).
- **`factory_stock_allocation_plans` (+ `forecast_share`, `allocated_factory_stock_qty`, `calculation_method`, `allocation_version`, `status`)** — `DOCUMENT_ONLY`. The table appears in **zero** `.gs` files — no schema-ensure, no writer, no reader, no UI. **Verdict: factory allocation is CALCULATED (pure, test-only), NOT displayed, NOT persisted.**

### F. Cross-Company Pooling / Borrowing
- **Phase-1 pooling implemented:** shared `FACTORY_SHARED` **source** pool via Required-By FIFO; company-reallocation **primitives** `sumRemainingShortages` / `feasibleReallocationQty` / `evaluateReallocationEligibility` (§32A, Golden #21/#22); within-scope survival protection `PROTECTED_REALLOCATION` (same company+country). Company-level pooling **orchestration** (donor/receiver enumeration, pair ordering, iteration) = `FROZEN_IMPLEMENTATION_PARTIAL` (only the pure predicate + qty math exist; §32A.1 not started).
- **Phase-2 borrowing of *unused* allocation across sites/companies** — `PHASE_2_DEFERRED` (named Future Extension; no runtime).
- **✅ No accidental premature Phase-2 implementation.** The overseas allocator is hard-scoped to one company + one country (`allocations.js:191-267` never crosses company); `reallocation_in/out_qty_snapshot` are **blank Phase-1 Engine-B placeholders** ("never faked 0", `15_…:43/63`, read at `operation-system-db-api.js:1783-1784`) — schema + client-read only, no producer.

### G. Monthly Request Order Calculation
- **Source reads** (regular demand, destination stock, third-party, factory availability, target %) — `PERSISTED_NOT_READBACK_VERIFIED`: real reads, written to `request_order_allocation_draft_lines.*_snapshot` on Send, but the analysis page never reads the draft back (`getRequestOrderAllocationDraft` = 0 occurrences in `request-order.js`).
- **Calc outputs** (calculated_gap, recommended_shipping_qty, residual_production, reallocation in/out, net_order_need, recommended_qty) — `FROZEN_NOT_IMPLEMENTED` in live: Engine A/B runs **only** on seeded demo data (`request-order.js:968`); live `google-sheet` mode → every output renders `--`. `special_event_demand_snapshot` = `IMPLEMENTED_NOT_CONNECTED` (computed + displayed, never persisted).
- **User decision fields** (`order_qty`, `carton_qty`, `units_per_carton`) — `FROZEN_AND_IMPLEMENTED` / `PERSISTED_NOT_READBACK_VERIFIED`; user must hand-key `order_qty` because Suggested is blank in live. Concurrency token is injected read-before-write by the adapter (`operation-system-db-api.js:2842-2851`).
- **Full-carton validation** — `FROZEN_IMPLEMENTATION_PARTIAL`: Send warns on partial + blocks negative/non-numeric, but the §SC-1M whole-draft block and "missing-UPC blocks Send" gate are **not** enforced (`upc=0` still sends).

### H. Order / Purchase Pipeline
- **Everything downstream of a *decided* quantity is live-wired and reachable:** allocation-draft persist → `request_orders` / `request_order_lines` / `request_order_line_sources` (`13_procurement_handlers.gs:handleCreateRequestOrderDraft_`) → Decision-Layer edits (`request-order-draft.js`) → Convert-to-PO with T1 / T2_T3 split (`13_…:handleCreatePurchaseOrderFromRequest_(1317)`) → PO receive (`handleReceivePurchaseOrderLines_(1801)`). Status = `FROZEN_AND_IMPLEMENTED` / `SOURCE_PRESENT_RUNTIME_UNVERIFIED`.
- **`request_order_line_sources` 1→N grain** — `FROZEN_IMPLEMENTATION_PARTIAL` (writer real but **degenerate 1-per-line**; snapshots blank; B-5 §3.9 1→N is Decision-Only).
- **Shipment linkage** (`purchase_order_lines.related_shipment_id` / `shipment_lines.purchase_order_line_id`) — `FROZEN_NOT_IMPLEMENTED`.

### I. Weekly Shipping / Execution Pipeline
| Stage | Status | Note |
|---|---|---|
| Recommendation result → plan-bridge | `SOURCE_PRESENT_RUNTIME_UNVERIFIED` | pure translator, not scheduled, persists nothing |
| Execution Plan (pre-Submit working draft) | `UI_ONLY` | JS state + sessionStorage; creates nothing by contract |
| Allocation Draft header / Save (lines) / Cancel / targeted readback | `SOURCE_PRESENT_RUNTIME_UNVERIFIED` | keyed upsert, §D quantity protection (`recommended_qty` immutable, `planned_qty` editable), K3 resolver (0→CREATE/1→REUSE/>1→BLOCKED_CONFLICT), soft-cancel — all test-verified |
| **Allocation Draft Submit → Weekly Shipping Plan** | **`FROZEN_IMPLEMENTATION_PARTIAL` (HALTED)** | **`16_…:handleSubmitShippingAllocationDrafts_` writes `status='submitted'` and stops (`:352`); no handler reads a submitted draft to emit `shipping_plans`; HALT at `16_…:359-365`** |
| Weekly Shipping Plan / Lines writer | `IMPLEMENTED_NOT_CONNECTED` | `11_…:handleCreateShippingPlansBatch_` exists but is fed by a **legacy local UI path** (`inventory-replenishment.js:submitReplenishmentPlans→createShippingPlansBatch`, random-UUID ids, no `allocation_draft_id` lineage) — not by a submitted Draft |
| Approval | `FROZEN_AND_IMPLEMENTED` | draft→pending_approval→approved/reject/cancel |
| Shipment Draft | `FROZEN_IMPLEMENTATION_PARTIAL` | copies Decision→Execution snapshot, idempotent; writes **no** `shipment_plan_links`, **no** reservation |
| Ready-to-Ship Reservation | `FROZEN_NOT_IMPLEMENTED` | no `reserved_stock` / `shipment_line_allocations` write; B-1 reserve trigger absent |
| Confirm-and-Ship deduction | `FROZEN_IMPLEMENTATION_PARTIAL` | `22_…:handleConfirmShipmentAndDispatch_` deducts `current_stock` atomically (lock + rollback), but does **not** decrement `reserved_stock` nor increment PO `shipped_qty` |

---

## 4. Conflicting authorities

1. **Shipment `arrived` bucket (code-vs-code + code-vs-frozen-contract).** `supply-planning-source-facts.js:93 SHIPMENT_STATUS_MAP` maps `arrived → DELIVERED_NOT_RECEIVED`, contradicting the frozen SC-11.4-D-4 and `source-projection.js:53 arrived → SHIPPED_IN_TRANSIT`. `source-facts` is **stale**; `source-projection` follows the frozen contract. → Resolvable without a new decision by fixing `source-facts` (see plan F1-3).
2. **Three "contributes supply" status vocabularies** never reconciled into one enum: `incoming-adapters.js:ELIGIBLE_STATUSES` (B4-R4), `source-projection.js:SHIPMENT_STATUS`, `source-facts.js:SHIPMENT_STATUS_MAP`. Only the `source-projection` map is on the production ledger path.
3. **§2E bypass.** `SUPPLY_PLANNING_CALCULATION_RULES.md §2E` declares the ten-gate predicate the qualification authority, yet the production supply→ledger path never calls `evaluateQualifiedIncoming`. Doc says "qualified"; production path is **unqualified**.
4. **Two request-order specs — `CONFLICTING_AUTHORITY`, but resolved by explicit hierarchy.** `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` = current Phase-1 authority; `REQUEST_ORDER_AND_PO_SPEC.md` (v1.3) is banner-marked "🔵 EXTENDED / FUTURE … Phase-1 spec wins." Real divergences (line grain, `rejected` status, `closed`/`closure`, `final_order_qty`, header company) all resolve to the Phase-1 spec / current code.
5. **`calculated_gap_qty` column vs `plan-builder` forbidden-list** — a snapshot column coexists with a `LIVE_ANALYSIS_FORBIDDEN` guard on the same concept. Reconciled by intent (snapshot left blank until a writer exists; live analysis must not be persisted as authority) but is a foot-gun to flag.
6. **`allocation_version` (factory plans, future) vs `draft_version` (recommendation, implemented)** — two independent "version" concepts; only `draft_version` is real.
7. **Amendment 2026-07-27 vs Contract Freeze** — K2/line-grain/`marketplace=MULTI` divergences are all annotated `PHASE_2_DEFERRED` / SUPERSEDED; code follows the freeze + mapping spec. No live conflict.

---

## 5. Mock / demo / local-only findings (Phase-1 pages showing non-DB, non-Runtime data)

1. `forecast.js:1365-1446` — `generateMockFcSkuDecisionData()`: the entire "FC SKU Decision" table (achievement, 3-month forecast/actual, stock, shortage) is `Math.random()`, wired **unconditionally** (shown even Demo OFF).
2. `forecast.js:1390` — `mockAiRecommendedUnits = Math.round(500 + Math.random()*2000)`.
3. `forecast.js:1699` — "Send Request … (mock only, no real submit)" is an `alert()`.
4. `forecast.js` (whole) — Forecast Review reads `KM.DemoData` only; **no `KM.DB` reference**; Demo OFF ⇒ empty.
5. `inventory-replenishment.js:629-633` — `IRMap.needBuckets()` returns `suggestedQty:0` (stub), consumed live at `:3465` ⇒ live Suggested Qty always 0 ("engine inactive", `:3448-3451`).
6. `inventory-replenishment.js:3555-3571` — `_getDemoReplenishmentData()` computes `suggestedQty = avgDaily*90 − stock − onTheWay` — a real number **only in Demo mode**.
7. `inventory-replenishment.js:912-937` + `:989-1248` — hardcoded `replenishmentMockData` (the `:989-1248` block is **dead code** after `return` at `:988`, still present).
8. `inventory-replenishment.js:1959-1983` — Submit Plan silently writes `sessionStorage['allShippingPlans']` reporting success "(Demo / local mode)" when cloud-write is disabled.
9. `shipping-plan.js:28→31` — renders from `sessionStorage['allShippingPlans']` (the same demo store) when neither cloud DB nor the Weekly-workspace flag is active.
10. `fc-summary.js:66-67/1253/1934` — Demo ON substitutes local mock arrays (user-toggled; default OFF).
11. `operation-system-db-api.js:2085-2093` — on API failure `loadOperationDb` **silently** substitutes `_buildMockFallbackDb()` (`_sourceMode='mock'`, near-empty: only `skuDetails`, all transaction tables `[]`).

> Clean areas (no mock): the audited inventory **core** modules (all fixtures/fake sheets, no hard-coded stock); Factory Inventory, Overseas Inventory, Request Order Draft, Purchase Order pages (honest empty-state, "No live data is shown", no faked success).

---

## 6. Backend-only findings (engines that exist but are unreachable from any UI)

1. **The whole canonical supply-planning core** (~25 `assets/js/core/supply-planning-*.js`, incl. orchestrator/calculations/allocations/ledgers/line-runtime/plan-builder/persistence-repository) is **never `<script>`-loaded** — reachable only from the Apps Script bundle + tests. **0 of 8 Phase-1 pages reach it.**
2. `operation-system-db-api.js:2728-2738` — `getShippingMethodCandidates`, `getWeeklyPlanRateCandidates`, `updateShippingPlanRationale`, `selectShippingPlanCarrier`, `combine/uncombineShippingPlans` are defined but **called by no page** (Weekly Layer-1/2 carrier/rate/method engine with no UI entry).
3. `24_recommendation_orchestrator.gs` — the recommendation **generation** path is router-wired (`generateRecommendationDraftLocked`, `01_router.gs:267`) and reaches the deterministic-run-id persistence chain (KMPW→KMORCH→KMPL→KMPR) **in source**, but is `BACKEND_ONLY / DO_NOT_API_YET` (no transport writer, no UI) and fails closed via `KMPW.assertAuthorizedSchemasReady` when `recommendation_calculation_runs` is not provisioned live. (Note: `RECOMMENDATION_TARGET_SPREADSHEET_ID_` is **no longer empty** — S0.5 unified it to `PRODUCTION_DB_SPREADSHEET_ID_` at `00_config.gs:25`; the live gate is now schema-provisioning, not an empty id.)
4. `km-api-foundation.js` — full Workspace/transport layer, but `USE_WORKSPACE_API=false` and only `weeklyShipping` (read-only) is IMPLEMENTED; effectively dormant.

---

## 7. Existing-module reuse (no engine may be silently replaced)

| Module | Reuse label |
|---|---|
| `supply-planning-calculations.js` (formula SSOT, 325) | **KEEP_AS_CANONICAL** |
| `supply-planning-ledgers.js` (§39, 133) | **KEEP_AS_CANONICAL** |
| `supply-planning-allocations.js` (§40, 112) | **KEEP_AS_CANONICAL** |
| `supply-planning-qualified-incoming.js` (§2E, 106) | **KEEP_WITH_ADAPTER** — correct engine, needs a live candidate feeder + must be wired onto the ledger path |
| `supply-planning-incoming-adapters.js` / `-external-incoming-adapters.js` (B4-R4/R5) | **KEEP_WITH_ADAPTER** — off the production path; external adapter needs a real importer |
| `supply-planning-line-runtime.js` (B4-R7) | **KEEP_AS_CANONICAL** (thin glue) |
| `supply-planning-source-reader.js` / `-source-reader-production.js` / `-production-source.js` | **KEEP_AS_CANONICAL** (read chain) / `-production-source` **KEEP_WITH_WRITER_CONNECTION** |
| `supply-planning-source-projection.js` | **KEEP_WITH_MAPPING_FIX** — parallel status map bypassing §2E; reconcile |
| `supply-planning-source-facts.js` | **KEEP_WITH_MAPPING_FIX** — fix stale `arrived→DELIVERED_NOT_RECEIVED` |
| `supply-planning-persistence.js` / `-persistence-repository.js` / `-persistence-locking.js` / `-persistence-plan-builder.js` / `-user-edit.js` | **KEEP_AS_CANONICAL** (pure persistence engine + journal + optimistic lock) |
| `supply-planning-recommendation-orchestrator.js` / `-recommendation-source-integration.js` / `-plan-builder.js` | **KEEP_AS_CANONICAL** (pure glue; the composed reader→ledger→allocation→resolver→bridge chain already exists) |
| `21_factory_inventory_handlers.gs` | **KEEP_AS_CANONICAL** (the one live supply writer) |
| `24/25/26/27/28_*.gs`, `23_*.gs`, `40_*.gs` | **KEEP_WITH_DEPLOYMENT** (source mirrors; deploy to a Verification Copy) |
| `fc-summary.js` Target%→effective-FC resolver block | **KEEP_WITH_UI_CONNECTION** (wire into render/save or retire) |
| `forecast.js` Review + `data.js` `forecastReviewData` | **KEEP_WITH_UI_CONNECTION** / **RETIRE_LATER** (mock) |

**No new parallel calculation engine is warranted** — every formula already has a canonical pure owner.

---

## 8. First missing end-to-end link

**Primary (recommendation/planning chain):** the **deployed Recommendation Runtime seam** — a runtime that (1) reads live source facts, (2) invokes the *already-complete* pure chain (Ledger → Allocation → Weekly/Monthly resolver → Plan Builder), (3) persists `recommended_qty` / `calculated_gap_qty` / `net_order_need_snapshot` to the draft tables + the `recommendation_calculation_runs` journal via the locked writer, and (4) is read back into the UI. Everything **upstream** (source reads, pure calc) is present + test-verified; everything **downstream of a decided quantity** (draft save/readback, request-order decision layer, PO conversion, shipment, current-stock deduction) is live-wired. The calc→persistence→UI bridge is the single severed edge that starves every consumer.
- Two adjacent structural gaps sit just before it: **(a)** no §8/§9 month-by-month projection engine (document-only); **(b)** §2E Qualified-Incoming is bypassed in the ledger path (real rows enter unqualified).

**Secondary (execution chain):** **Allocation Draft Submit → Weekly Shipping Plan** (`16_…:352`, HALTED at `:359-365`) — the first broken edge in the shipping-execution sub-pipeline, independent of the calc seam.

---

## 9. Test evidence

- **80/80 test files PASS** (2026-08-05, Main). Supply-planning suites: calculations 325 · ledgers 133 · allocations 112 · qualified-incoming 106 · line-runtime 88 · external-incoming-adapters 82 · incoming-adapters 80 · supply-lifecycle 68 · source-projection 63 · supply-candidates 54 · source-reader 48 · production-source 43 · source-reader-production 38 · source-facts 37; persistence 96 (locking) / repository 74; recommendation-orchestrator, weekly-recommendation (rec 96), monthly-recommendation (24), plan-bridge, apps-script-bundle (25-module sha256 parity), production-safety (67) / schema-safety (21) / runtime-integration (85).
- **Golden Matrix = 39 executed / 1 pending / 0 canonical-blocked.** The one Pending = **Scenario #34** (user partial-carton Order Qty) — a **downstream Request-Order/PO/UI-state acceptance** (§37), not a Calculation-Pure-Runtime blocker.
- **No production code was modified to make any test pass.** No test conflicts with a frozen document were silently "fixed"; the `arrived` bucket divergence (§4.1) is reported, not patched.

---

## 10. Performance / API implications (for the later API migration; nothing changed here)

- **Every DB Phase-1 page depends on a whole-DB load** — `loadOperationDb()` issues one `getOperationDb` fetch (≈44 tables) cached in `window._opDbCache`, and **each mutation triggers a full-DB reload** (`loadOperationDb({force:true})`). Targeted reads exist only for the allocation-draft workspace (`getShippingAllocationDraftWorkspace`) and the dormant `weeklyShipping` workspace.
- **The recommendation runtime should be a command action, not a whole-DB dependency** — the pure chain consumes a bounded set (inventory snapshots + forecast + shipments/plans + warehouses/marketplaces + sku_details) and should read those tables targeted, compute, and write only the two draft tables + the journal. **Result should be persisted (draft snapshot + `recommendation_calculation_runs`), not recomputed per page load** (`SUPPLY_PLANNING_CALCULATION_RULES.md §4`: live analysis is a Runtime recompute and is NOT persisted; the *scheduled/manual recommendation* IS persisted).
- **Cache invalidation:** a recommendation write must invalidate `_opDbCache` for the two draft tables (or move those reads to the targeted workspace) to avoid a stale whole-DB cache masking a fresh write.
- **Read-only vs command split:** source reads + projection = read-only workspace; generate/submit/cancel = command actions behind the optimistic lock (already modelled in `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md §Persist-Orch`).

---

*End of reconciliation. See the field matrix, F1 plan, and decision register companions.*
