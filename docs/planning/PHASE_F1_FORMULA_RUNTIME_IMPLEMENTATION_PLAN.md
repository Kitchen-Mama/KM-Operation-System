# Phase F1 — Formula Runtime Implementation Plan (atomic, ordered)

> **READ-ONLY planning artifact (F1-0).** This plan sequences the work; it implements nothing. Companion to `SUPPLY_PLANNING_FORMULA_RUNTIME_RECONCILIATION.md`, `SUPPLY_PLANNING_FIELD_OWNERSHIP_MATRIX.md`, `SUPPLY_PLANNING_DECISION_REGISTER.md`. Baseline HEAD `9324086`, 2026-08-05.
>
> **Governing facts from the audit:** the pure Calculation Runtime is COMPLETE + test-verified (Golden 39/1/0). The gap is Lane 2 — reading live source, invoking the pure chain, persisting output, reading it back into the UI, and scheduling. Therefore **every F1 round below is wiring / connection / migration work, not formula work. No formula may be invented or changed** (owner `SUPPLY_PLANNING_CALCULATION_RULES.md`).
>
> **Cross-cutting prerequisite (owned by Production Safety S0/S0.5, `SYSTEM_RUNTIME_ARCHITECTURE.md §SAFE`):** any round that runs a live recommendation/persistence write is **BLOCKED until a duplicated Verification-Copy Spreadsheet is provisioned** with the additive columns + `recommendation_calculation_runs` journal, and `RECOMMENDATION_TARGET_SPREADSHEET_ID_` is pointed at it. The live data incident remains OPEN; Production is not a valid target. This is **Decision D-1** in the register — it gates F1-4/F1-6/F1-7 live execution (but **not** the pure/no-deploy rounds).

---

## Global rules for every F1 round

- **Test-first, pure-first.** New logic lands in `assets/js/core/supply-planning-*.js` as a pure, dependency-injected function with Node unit tests before any `.gs`/frontend wiring. Match the existing extract+eval / fake-sheet test idiom.
- **Additive-only schema.** No column shift, no table drop/clear/rebuild; new columns via `sheetEnsureColumns_`; provisioned on the Verification Copy first (D-1). `KMSAFE` validate-never-repair stays in force.
- **No whole-DB reload for calc.** New reads are targeted-table reads (§10 of the reconciliation); a write invalidates only the affected draft/journal cache.
- **Bundle discipline.** Any `assets/js/core/*.js` change ⇒ `BUNDLE_REBUILD_REQUIRED=true` (regenerate `90_generated_supply_planning_bundle.gs` via `assets/tools/build-apps-script-bundle.js`; `supply-planning-apps-script-bundle.test.js` must prove sha256 parity).
- **Governance.** Local commit is the maximum default; `APPS_SCRIPT_SYNC_REQUIRED` / `FRONTEND_GITHUB_PAGES_REQUIRED` files are listed per round for the **user** to deploy; never push/deploy from the agent.
- **Submit → Weekly Plan stays out** until its prerequisites (D-3 lineage/idempotency, D-4 B-8 cancellation-release) are provably satisfied (round §10 rule).

---

## Recommended execution order (dependency-derived, differs from the numeric labels)

`F1-3` → `F1-7` → `F1-4` → `F1-6` → `F1-2` → `F1-5` → `F1-9` → `F1-1` → (`F1-8` gated). Rationale: correctness of the ledger input (F1-3) and a persistable journal (F1-7) must precede any recommendation writer (F1-4/F1-6); the projection engine (F1-2) and factory-plan persistence (F1-5) build on a trustworthy ledger; UI/verification (F1-9) and forecast closure (F1-1) are parallelizable; the execution handoff (F1-8) is decision-gated.

---

## F1-3 — Qualified Incoming / Supply-Ledger Production Connection  ★ FIRST SLICE (pure, no deploy)

- **Scope:** route real shipment/plan rows through the frozen §2E ten-gate engine before they enter the Supply Ledger, and collapse the three divergent shipment-status vocabularies to the single frozen SC-11.4 map. Fix the stale `arrived→DELIVERED_NOT_RECEIVED` in `source-facts.js`. Assemble B4-R3 candidate DTOs (with §2F interim ETA authority = `shipments.eta` + lead-time fallback, per D-5) from the already-read snapshots and feed `evaluateQualifiedIncoming`; pipe its `qualifiedIncomingQuantity` into `buildSupplyLedger` / `calculateGap.timelyQualifiedIncoming`.
- **Allowed files:** `supply-planning-source-projection.js`, `supply-planning-source-facts.js`, `supply-planning-recommendation-source-integration.js` (wiring only), plus a new/extended candidate adapter; tests `supply-planning-source-projection.test.js`, `-source-facts.test.js`, `-qualified-incoming.test.js`, a new `supply-planning-qualified-incoming-ledger-integration.test.js`.
- **DB tables:** none written; read contract only (`shipments`, `shipment_lines`, `shipping_plans`).
- **No-go files:** any `.gs` handler beyond regenerating the bundle; all frontend; DB schema.
- **Prerequisites:** none (all inputs frozen + implemented). This is why it is the first slice.
- **Tests:** prove that a shipment with `ETA > Required-By` contributes **0** to the ledger (currently it wrongly contributes), that external-origin rows are quarantined (§38), that `arrived` maps to one bucket everywhere, and that Golden supply scenarios still pass unchanged.
- **Acceptance:** one canonical status vocabulary; `evaluateQualifiedIncoming` is on the production ledger path; no Golden regression; ≥ existing assertion count.
- **Live verification required:** **No** (pure Node).
- **Rollback boundary:** one commit; pure-module revert restores the status-map shortcut.
- **Expected UI result:** none yet (no UI wired) — this is a correctness prerequisite.

## F1-7 — Formula Result Persistence + Calculation-Run Journal (deploy to Verification Copy)

- **Scope:** make the *already-implemented* persistence lane live on the Verification Copy — migrate the additive `recommendation_calculation_runs` (16 cols) + `user_edited`/`user_edited_by` columns, deploy `23/24/25_*.gs` + the regenerated bundle, and prove the deterministic `calculation_run_id` / `draft_version` optimistic-lock / journal round-trip against the copy. No new formula, no new column beyond the frozen additive set.
- **Allowed files:** `00_config.gs` (Verification-Copy id), `23/24/25_*.gs`, `90_generated_supply_planning_bundle.gs` (regenerate); tests `supply-planning-persistence*.test.js`, `-apps-script-bundle.test.js`.
- **DB tables (Verification Copy):** additive columns on `shipping_allocation_drafts(+_lines)`, `request_order_allocation_drafts(+_lines)`; new `recommendation_calculation_runs`.
- **No-go files:** frontend; formula core; Production Spreadsheet.
- **Prerequisites:** **D-1 (Verification-Copy target)**. 
- **Tests:** existing 96 (locking) + 74 (repository) pass; a copy-targeted smoke proves fail-open once schema is provisioned (no more `SCHEMA_NOT_PROVISIONED`).
- **Acceptance:** journal + draft header/line write + read-back + optimistic CONFLICT all verified on the copy; Production untouched.
- **Live verification required:** **Yes** (Verification Copy only, never Production).
- **Rollback boundary:** revert config id → fail-closed again; the copy is disposable.
- **Expected UI result:** none yet.

## F1-4 — Replenishment (Weekly Shipping) Recommendation Runtime Integration

- **Scope:** connect live source → §39 Ledger → §40 Allocation → `resolveWeeklyRecommendationFacts` → Plan Builder → locked persistence, writing `recommended_qty`/`calculated_gap_qty`/`recommendation_reason` into `shipping_allocation_draft_lines` under the lock, via the existing `generateRecommendationDraft` command (WEEKLY_SHIPPING). Wire a UI hydration path so `inventory-replenishment.js` reads the persisted draft instead of the `needBuckets()=0` stub.
- **Allowed files:** `supply-planning-recommendation-orchestrator.js`/`-source-integration.js` (wiring), `24_recommendation_orchestrator.gs`, `01_router.gs` (a read action for hydration), `operation-system-db-api.js` (targeted adapter), `inventory-replenishment.js` (replace stub read); bundle regenerate; corresponding tests + a new integration test.
- **DB tables (Verification Copy):** `shipping_allocation_drafts(+_lines)`, `recommendation_calculation_runs`.
- **No-go files:** `calculations.js`/`ledgers.js`/`allocations.js` (frozen — reuse, never edit); Submit handoff; Production.
- **Prerequisites:** F1-3, F1-7, D-1, D-5 (ETA authority).
- **Tests:** live-source fixtures → persisted `recommended_qty` matches the pure Golden result; UI hydration renders the persisted value; scheduler/manual parity (`generateRecommendationDraft` from both entry points yields identical output).
- **Acceptance:** Inventory Replenishment shows a **real** Suggested Qty from the persisted draft (not 0, not demo, not local IRMap); refresh re-reads the persisted draft; regenerate mints a new `calculation_run_id`.
- **Live verification required:** **Yes** (Verification Copy).
- **Rollback boundary:** feature-flag the UI hydration (default legacy stub) + one commit; revert restores the honest-empty state.
- **Expected UI result:** truthful Suggested Qty + reason on Inventory Replenishment.

## F1-6 — Monthly Request Order Calculation Runtime

- **Scope:** the same wiring for MONTHLY_ORDER — invoke Engine A/B + reallocation primitives from live source, persist `net_order_need_snapshot`/`recommended_qty` + source snapshots into `request_order_allocation_draft_lines`, and hydrate `request-order.js` so the analysis page shows real Suggested/Recommended instead of `--` and rehydrates `order_qty` on reload. Enforce the §SC-1M full-carton / missing-UPC gate at Send.
- **Allowed files:** `source-facts.js` (monthly resolver wiring), `24_/25_*.gs`, `15_request_allocation_handlers.gs`, `operation-system-db-api.js`, `request-order.js`; bundle regenerate; tests.
- **DB tables (Verification Copy):** `request_order_allocation_drafts(+_lines)`, `recommendation_calculation_runs`.
- **No-go files:** frozen formula core; PO conversion (already live); Production.
- **Prerequisites:** F1-3, F1-7, D-1; **D-6 (B-6 Request→PO atomicity)** only if the round touches conversion (it should not).
- **Tests:** live→persisted `recommended_qty` = CEILING Golden result; `order_qty` rehydration; full-carton block on `upc=0`; Scenario #34 partial-carton acceptance may graduate here (downstream owner).
- **Acceptance:** Request Order analysis page shows real numbers, persists, and reads back on reload.
- **Live verification required:** **Yes** (Verification Copy).
- **Rollback boundary:** flag + one commit.
- **Expected UI result:** real monthly Suggested/Recommended + rehydrated Order Qty.

## F1-2 — Inventory Projection Runtime (new pure engine, then integration)

- **Scope:** build the **missing** §8/§9 month-by-month projection engine (opening → +qualified incoming/approved − forecast/event demand → closing), §6 target-stock coverage, and a Days-of-Supply engine — as a **new pure module** consuming the ledger output, replacing the UI-only `current÷avg` and the document-only projection. Compute `available = physical − reserved − damaged` from source columns.
- **Allowed files:** new `supply-planning-projection.js` + test; `source-facts.js` (feed); later `inventory-replenishment.js` (display). Formula strictly per §8/§9/§6/§11 — no invention.
- **DB tables:** none persisted (live analysis is a Runtime recompute per §4; not stored).
- **No-go files:** frozen calc primitives (reuse `classifyProjectedBalance`); Production.
- **Prerequisites:** F1-3 (trustworthy qualified incoming feeds projection).
- **Tests:** boundary sweep of the §8/§9 recursion; DoS; reserved/damaged subtraction; equality to any worked example in §8/§9.
- **Acceptance:** a real projected ending balance + DoS per month, matching the frozen spec.
- **Live verification required:** No for the engine (pure); Yes for the eventual UI read.
- **Rollback boundary:** one commit; new module is additive.
- **Expected UI result:** truthful projected balance / DoS (when the display slice lands).

## F1-5 — Factory Stock Allocation Runtime (schema decision required)

- **Scope:** persist the FIFO allocator's factory result. Requires **D-2**: create `factory_stock_allocation_plans` (+ `forecast_share`, `allocated_factory_stock_qty`, `calculation_method`, `allocation_version`, `status`) — this table exists in **no** `.gs` today. Then wire `allocateFactoryDeterministic` output → a new writer → the table, and a read-only planning display.
- **Allowed files:** new `21_`-adjacent factory-allocation handler + `01_router.gs` action; `operation-system-db-api.js`; a factory-allocation page/panel; bundle regenerate; tests. `allocations.js` reused, never edited.
- **DB tables (Verification Copy):** new `factory_stock_allocation_plans`.
- **No-go files:** `factory_stock`/`factory_stock_movements` physical writer (`21_`, already live — do not disturb); Production.
- **Prerequisites:** **D-2 (create factory_stock_allocation_plans)**, F1-7, D-1.
- **Tests:** allocator output persists + reads back; `allocation_version` increments on recompute without losing history; `FACTORY_SHARED` pool served once across companies.
- **Acceptance:** factory allocation is displayed + persisted (today it is calculated-only).
- **Live verification required:** Yes (Verification Copy).
- **Rollback boundary:** one commit; new table on the copy is disposable.
- **Expected UI result:** factory allocation plan visible per site.

## F1-9 — User Formula Verification Workspace

- **Scope:** a read-only page (or panel) that runs the pure chain against selected scope and shows every intermediate (demand basis, qualified incoming, ledger, allocation, gap, FLOOR/CEILING, reason) with `formula_version` + `source_data_as_of` — so the user can verify a recommendation before trusting the writer. Reuses the existing verification-diagnostics module (`supply-planning-verification-diagnostics.js`).
- **Allowed files:** new page + `28_recommendation_verification_diagnostics.gs` (already read-only); `operation-system-db-api.js`; tests.
- **DB tables:** read-only.
- **No-go files:** any writer; Production.
- **Prerequisites:** F1-3, F1-4/F1-6 (something to verify).
- **Tests:** the workspace output equals the pure Golden intermediates.
- **Acceptance:** user can audit a recommendation end-to-end on screen.
- **Live verification required:** read-only, Verification Copy safe.
- **Rollback boundary:** one commit; additive page.
- **Expected UI result:** a transparency/verification screen.

## F1-1 — Forecast Input & Adjustment Runtime Closure (parallelizable)

- **Scope:** decide and close the **DEAD** Target%→effective-FC resolver — either wire `getEffectiveFcSafe` into `renderFcRegularTable`/save so a stored Target% produces a persisted/derived effective FC, **or** retire the dead block (**D-7**). Optionally add the forecast approval state and connect the BigQuery actuals feed for Forecast-Review accuracy (currently hardcoded mock) — the latter gated on a BQ-source decision.
- **Allowed files:** `fc-summary.js`, `forecast.js`, `04_/14_*.gs` (only if a persisted effective-FC column is chosen — additive), `data.js` (retire mock); tests.
- **DB tables:** `fc_regular_forecast` (only if effective-FC is persisted — additive, D-7).
- **No-go files:** the calc formula core; Production.
- **Prerequisites:** **D-7 (apply-vs-retire Target%)**; BQ decision for accuracy.
- **Tests:** effective FC = base × Target% per the FC_SUMMARY_SPEC precedence; Review reads live actuals (or the mock is removed and the section honestly empty).
- **Acceptance:** no dead resolver; no hardcoded accuracy presented as real.
- **Live verification required:** Yes for the FC writes (Verification Copy).
- **Rollback boundary:** one commit.
- **Expected UI result:** Target% actually affects the displayed/derived forecast (or is cleanly gone).

## F1-8 — Formula → Allocation-Draft / Request-Order-Draft Pipeline  ⚠ PARTIALLY GATED

- **Scope (allowed now):** ensure the recommendation writer's output flows into the *existing* Allocation-Draft persistence (already save/cancel/readback-capable) and Request-Order-Draft, and that the UI hydrates from it. This is the persist+hydrate seam, **not** the Submit handoff.
- **Scope (BLOCKED — do not implement this round):** **Allocation Draft Submit → Weekly Shipping Plan.** Blocked by **D-3** (deterministic ids + `allocation_draft_id`/`allocation_draft_line_id` lineage + transaction/compensation on `shipping_plans`/`shipping_plan_lines` — currently random-UUID, no lineage column, no transaction) and **D-4** (B-8 cancellation/reopen/release). Per the round rule, Submit is excluded until these are provably satisfied.
- **Allowed files (allowed scope):** `inventory-replenishment.js`, `request-order.js`, adapters; **not** `11_shipping_plan_handlers.gs` submit path, **not** `16_…:handleSubmitShippingAllocationDrafts_`.
- **Prerequisites:** F1-4, F1-6. Submit sub-scope additionally needs D-3 + D-4 resolved.
- **Live verification required:** Yes for hydration (Verification Copy); Submit sub-scope not scheduled.
- **Rollback boundary:** one commit for the hydration seam.
- **Expected UI result:** drafts persist recommendation output and reload truthfully; Submit remains HALTED with the honest banner.

---

## §11. First implementation slice — selection & justification

**Selected first slice: F1-3 (Qualified Incoming / Supply-Ledger Production Connection).**

The round's preferred candidate is *Inventory Projection Runtime Integration* (F1-2), **but the evidence shows it is not ready**: (a) there is **no projection engine** at all (§8/§9 is DOCUMENT_ONLY); (b) it has an unresolved status/lifecycle mapping blocker (three shipment-status vocabularies + the `arrived` conflict + the §2E bypass); (c) it has no writer and is not deployed. Per the round's rule ("if not ready, select the smallest prerequisite closure"), the smallest prerequisite closure is **F1-3**, because it:

- **Uses only already-frozen + already-implemented + already-tested pieces** — `evaluateQualifiedIncoming` (106 assertions), `buildSupplyLedger` (133), the source read chain — so it invents nothing and carries the **lowest rework risk**.
- **Resolves the highest-severity active conflict** (§2E bypass + 3 status vocabularies + `arrived` divergence), which otherwise silently corrupts every downstream number — the **highest correctness value**.
- **Is a hard prerequisite** for a truthful Inventory Projection (F1-2) and Replenishment/Monthly recommendation (F1-4/F1-6): all of them consume qualified incoming.
- **Is fully Node-testable with zero live-DB, zero deploy, zero schema change, read-only** — the **lowest business risk** and it needs no Verification-Copy decision to begin.

The first *user-visible* value (a real Suggested Qty on screen) arrives at **F1-4**, but F1-4 depends on F1-3 (correct input) and F1-7 (a place to persist), and F1-7 depends on **Decision D-1** (Verification-Copy deployment target). Starting at F1-3 makes real progress immediately while the D-1 deployment decision is taken in parallel.
