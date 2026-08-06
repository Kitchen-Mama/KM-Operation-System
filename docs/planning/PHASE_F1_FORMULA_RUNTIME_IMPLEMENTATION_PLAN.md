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

---

## F1-3 Execution Status — HALTED / PARTIAL (2026-08-05, read-only Phase-A outcome)

> This section records the verified Phase-A root-cause map and the **genuine reconciliation conflict** that F1-3 must resolve before any code connection is safe. Per the round's HALT protocol, no frozen-semantics change and no runtime connection were landed; the analysis + options + recommendation are below. Evidence is code-verified (file:line) and doc-verified (SC-11.4 quoted).

### A. Root cause (single bypass, precisely located)
- The **sole** production supply-entry builder is `supply-planning-source-projection.js:projectRecommendationProductionSources` (line 109), reached via `production-source.js:resolveProductionFacts/buildProductionRecommendationSource` → `KMSP.projectAndRead`.
- **Current Stock** (FBA/THREE_PL/FACTORY, lines 196–238) reads inventory snapshots directly → `lifecycle_bucket:'CURRENT_STOCK'`. Legitimate; must stay.
- **shipping_plans** (240–257) and **shipments** (259–285) are mapped to lifecycle buckets by source-projection's **own** `SHIPPING_PLAN_STATUS` / `SHIPMENT_STATUS` / `LEGACY_STATUS` maps (lines 50–56). This is the bypass: raw status alone decides inclusion + bucket; the §2E `evaluateQualifiedIncoming` ten-gate (external-admission, ETA, count-once Gate 9/10) is never called on the ledger path.
- The **canonical QI→ledger bridge already exists**: `supply-planning-source-facts.js:projectSupplyLifecycle` (line 241) routes shipments through the REAL `evaluateQualifiedIncoming` (283–296) for count-once, encodes PO/plan count-once via `OMIT_TRANSFERRED` (lines 76/84), and calls the REAL `buildSupplyLedger`. It is exported (line 881) and test-covered (`supply-planning-supply-lifecycle.test.js`, 68 assertions) — but **no production caller invokes it** (grep: only source-facts + its test + the generated bundle).

The "obvious" F1-3 fix = make source-projection delegate shipments+plans to `projectSupplyLifecycle`. **That is blocked by the conflict below.**

### B. The genuine blocker (why a mechanical wiring is unsafe)
The existing canonical bridge (`projectSupplyLifecycle`) is **itself non-conforming to the frozen SC-11.4**, and **diverges from the already-conforming production projector** on several axes. Wiring the production path to it as-is would *regress* conformance and/or silently change frozen, test-locked semantics on multiple axes:

| Axis | `source-projection.js` (production, current) | `source-facts.js:projectSupplyLifecycle` (canonical bridge) | Frozen authority | Verdict |
|---|---|---|---|---|
| `arrived` status | `SHIPPED_IN_TRANSIT` (line 53); `DELIVERED_NOT_RECEIVED` only w/ `delivery_event` (270) | **`DELIVERED_NOT_RECEIVED`** unconditionally (line 93) — TESTED (supply-lifecycle.test.js:70,154) | **SC-11.4-B/C**: `arrived → SHIPPED_IN_TRANSIT`; DELIVERED only from a delivery-event authority, **never inferred from arrived** | **bridge VIOLATES SC-11.4**; source-projection conforms |
| `shipping_plans` status vocab | `site_confirmed → APPROVED_SHIPPING_PLAN` (line 50) | `approved → APPROVED_SHIPPING_PLAN` (line 82); no `site_confirmed` | `approved` (11_ handlers draft→pending_approval→approved; WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §3.2A) | `approved` canonical; source-projection's `site_confirmed` is the outlier; wiring → a live `site_confirmed` plan fails closed |
| delivered/received authority | gated on `delivery_event` / `receiving_authority` **flags** on the raw row (270–272) | delivered/received only via **separate** `routeEvents` / `receivingFacts` inputs (canonical authorities) — not shipment flags | SC-11.4-C/11.5: bucket requires a real delivery/receiving authority | source-projection's flags are a *non-canonical mechanism*; the bridge's separate-authority model is canonical, but source-projection does not feed those inputs → delivered/received would disappear from the production path |
| shipment lineage key | `ship:<shipment_line_id>` (+ synthetic `ship:wh:sku@i` fallback) | canonical B4-R3 `shipment:<shipmentId>:<shipmentLineId>` (supply-candidates.js:117) | B4-R3 lineage | different format; wiring changes every shipment lineage ref |

Also confirmed **not** blocking (resolved): PO→Shipment ownership (`PRODUCTION_STATUS_MAP` shipped/partial_shipped → `OMIT_TRANSFERRED`, REQUEST_ORDER §1); count-once identity exists (B4-R3 `lineageKey`); no DB/schema change needed; ETA-coverage gate correctly lives in the GAP path (`evaluateQualifiedIncoming`→`calculateGap` via line-runtime), so late supply is ledger-*visible* but contributes 0 to coverage per **§2F "visible, not covering"** — this is correct and is not a defect.

### C. Options (with impact on quantity / count-once / DB / F1-7)
- **Option A — wire source-projection → `projectSupplyLifecycle` as-is.** Eliminates the bypass + adds §2E count-once ✓. **Cost:** *regresses* SC-11.4 conformance on `arrived` (→DELIVERED); changes lineage format; drops the (non-canonical) delivery/receiving flag path; a live `site_confirmed` plan fails closed. Quantity-neutral among active buckets; count-once ✓; no DB change; forward-compatible with F1-7. **Rejected** — knowingly propagates a frozen-contract (SC-11.4) violation.
- **Option B (RECOMMENDED) — two clean, cited, individually-verifiable slices:**
  - **F1-3a — conform the canonical bridge to SC-11.4 first** (edit `source-facts.js` `SHIPMENT_STATUS_MAP` `arrived: DELIVERED_NOT_RECEIVED → SHIPPED_IN_TRANSIT`, cite SC-11.4-B/C; update the 3 `supply-lifecycle.test.js` `arrived` assertions with the citation; regenerate the bundle since source-facts is bundled). Small, surgical, quantity-neutral, verifiable via the suite. This is a frozen-semantics change and therefore requires explicit authorization (it corrects a test-locked contract violation).
  - **F1-3b — then wire** source-projection's shipments+plans to the now-conforming `projectSupplyLifecycle`, keep Current Stock direct, remove source-projection's status maps, adopt canonical `approved` plan vocab + B4-R3 lineage, drop the non-canonical delivery/receiving flags, update `source-projection.test.js` (F/G) with citations, add `supply-planning-qualified-ledger-connection-f1-3.test.js`, regenerate the bundle. Larger but built on a conforming bridge.
  - **Impact:** full SC-11.4 conformance + single canonical §2E/lifecycle path + count-once; no DB change; feeds F1-7 unchanged.
- **Option C — add only the §2E count-once signals to source-projection** (call `evaluateQualifiedIncoming` for Gate 9/10, keep source-projection's conforming status map). **Cost:** violates the round's "no second status allowlist" (criterion 1) — source-projection keeps a status map. **Rejected.**

### D. Recommendation
**Proceed with Option B, but F1-3a (the SC-11.4 `arrived` conformance fix to the canonical bridge) requires explicit authorization** because it changes a frozen, test-locked semantic (even though it is a cited correction to the frozen SC-11.4-B/C and is quantity-neutral). Once F1-3a is authorized + landed + verified, F1-3b (the production wiring) becomes a clean connection to a conforming bridge. **No code was changed in this round** (Phase A read-only); the bypass, the bridge non-conformance, and the divergences are documented above for the authorizing decision.

### E. Exact next authorized step
`F1-3a`: conform `source-facts.js:projectSupplyLifecycle` `SHIPMENT_STATUS_MAP.arrived` to SC-11.4-B/C (`SHIPPED_IN_TRANSIT`), update the cited `supply-lifecycle.test.js` assertions, regenerate the generated bundle, verify full suite green + Golden 39/1/0. Then `F1-3b` (production wiring) per Option B.

### F. F1-3a — COMPLETED (2026-08-05)
**Canonical-bridge SC-11.4 conformance = DONE.** `source-facts.js:projectSupplyLifecycle` `SHIPMENT_STATUS_MAP.arrived` changed `DELIVERED_NOT_RECEIVED → SHIPPED_IN_TRANSIT` (SC-11.4-B, RECOMMENDATION_SOURCE_CONTRACT_SPEC.md line 597; SC-11.4-C line 602-603: DELIVERED never inferred from arrived). Only this one mapping changed; `received`/`delivered`/route-event/receiving-fact authority pathways untouched. Delivery `DELIVERED_NOT_RECEIVED` still comes only from `routeEvents 'delivered'`; receiving `RECEIVED_NOT_REFLECTED` only from `receivingFacts`. **Quantity-neutral** (both are active buckets — no formula change). Current-Stock path unchanged; external quarantine unchanged. Bundle regenerated via `assets/tools/build-apps-script-bundle.js` (hash `6f0b654…`, `--check` reproducible); parity 56/PASS. Tests: `supply-lifecycle` 68→74 (+6 focused A–F), full suite 80/80, Golden 39/1/0, #34 Pending. `BUNDLE_REBUILD_REQUIRED=true` (generated bundle only; no handler/router sync). **Production Qualified-Incoming connection = NOT STARTED; F1-3b remains the next authorized slice** (wire source-projection to the now-conforming bridge). No formula / DB / schema / API / frontend change; no live DB; no push/deploy.

### G. F1-3b — COMPLETED → **F1-3 = COMPLETED** (2026-08-05)
**Production Qualified-Incoming → Supply-Ledger connection = DONE.** The sole production supply builder `source-projection.js:projectRecommendationProductionSources` now has exactly two supply-entry paths: **(A) Current Stock** (FBA/THREE_PL/FACTORY inventory) stays a DIRECT `CURRENT_STOCK` mapping (never through Qualified Incoming); **(B) shipping_plans + shipments** are shaped into the canonical `KMSF.projectSupplyLifecycle` input and classified ONLY by the frozen §2E `evaluateQualifiedIncoming` ten-gate + §39.5 lifecycle + `buildSupplyLedger`. The canonical lifecycle entries are reused **verbatim** (camelCase→snake_case shape adapter; `lifecycle_bucket` never re-translated). **source-projection's own `SHIPPING_PLAN_STATUS` / `SHIPMENT_STATUS` / `LEGACY_STATUS` maps are removed** — one canonical status authority. Canonical `approved` plan vocabulary (WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §3.2A; 11_ handlers) + canonical B4-R3 shipment lineage `shipment:<shipment_id>:<shipment_line_id>` (was `ship:<line_id>`) + canonical `shipping_plan:<id>:<line_id>` plan lineage. `evaluateQualifiedIncoming` is now on the production incoming-supply path.

**Two residual SC-11.4 authority corrections to the canonical bridge (§9-permitted, cited):** (1) **§4.1** `ROUTE_EVENT_MAP` `arrived`/`arrived_port` `DELIVERED_NOT_RECEIVED → SHIPPED_IN_TRANSIT` (SC-11.4-C: arrival ≠ delivery; CARRIER_AND_ROUTE §6A / SHIPMENT_CENTER §535); `delivered` still → `DELIVERED_NOT_RECEIVED`. (2) **§4.2** `SHIPMENT_STATUS_MAP.received` `RECEIVED_NOT_REFLECTED → OMIT_RECEIVING_AUTHORITY` (SC-11.4-B "only when backed by canonical warehouse receiving authority"; SC-11.5; OVERSEAS_INBOUND §10.6/§303) — raw status never itself a receiving authority; `RECEIVED_NOT_REFLECTED` only from `receivingFacts 'confirmed'`. Both spec owners were unanimous (code-only contradictions) → conformance fix, not a HALT.

**Count-once proven:** plan→shipment via canonical `OMIT_TRANSFERRED` (completed plan omitted); duplicate lineage via ledger dedup; cross-bucket lineage conflict fails closed (`SUPPLY_LINEAGE_CONFLICT`); posted-to-current-stock via Gate 9. **Late supply** (ETA > Required-By) stays ledger-visible (`SHIPPED_IN_TRANSIT`) but contributes 0 to coverage (`timelyQualifiedIncoming`) — §2F unchanged. **External quarantine** preserved (contributes 0; no production external table). **Reachable production buckets:** `APPROVED_SHIPPING_PLAN`, `SHIPPED_IN_TRANSIT`, `CURRENT_STOCK`. **Not reachable (separate slices, canonical authorities not wired):** `COMMITTED_PRODUCTION` (PO reads — deferred), `DELIVERED_NOT_RECEIVED` (routeEvents), `RECEIVED_NOT_REFLECTED` (receivingFacts). Non-canonical `delivery_event`/`receiving_authority`/`correction_reversal` raw-row flags dropped (operational source does not write `arrived+flag`/`received` today per SHIPMENT_CENTER §273 — quantity-neutral in practice).

**Tests:** new `supply-planning-qualified-ledger-connection-f1-3.test.js` (23 assertions, 22 §12 proofs); `supply-lifecycle` 74→76; `source-projection` F/G re-based to canonical (64); `production-source` F3 (43). Bundle regenerated via `assets/tools/build-apps-script-bundle.js` (hash `5795e29…`, `--check` reproducible); parity 56/PASS. Full suite **81/81**; Golden **39/1/0**; #34 Pending. `BUNDLE_REBUILD_REQUIRED=true` (generated bundle only; no handler/router sync). **No formula / DB / schema / API / frontend change; no live DB; no push/deploy.** **F1-7** (recommendation persistence/journal, gated by Decision D-1 Verification-Copy target) is the next slice.

### H. F1-5-A — Allocation-Fact Producer Runtime — COMPLETED (2026-08-05)
**The previously-missing planning-facts producer is IMPLEMENTED.** NEW pure module `assets/js/core/supply-planning-allocation-facts.js` (`KMAF` / `window.KM.allocationFacts`; `projectAllocationFacts(input)`) DERIVES the caller-owned planning facts the frozen Recommendation Runtime consumes (`receiverFacts` / `factoryDemandFacts` / `planningFacts`) by **invoking frozen owners** — it authors NO business formula:
- **daily demand** — §22 `normalizedAvgSalesPerDay` (Sales-Driven) / §2D `calculateForecastDrivenRemainingNeed.forecastDailyDemand` (Forecast-Driven), invoked from `KMCALC`.
- **survival** — NOT recomputed: the fact carries `dailyDemand` and the SINGLE `CEILING(18×dailyDemand)` owner (§20.3/§24.4) is the frozen consumer `projectAllocationInputs` (no second copy — §2).
- **demand weight** — §7/§24.5 proportional SHARE `basis_i ÷ Σ_group basis_i` over the company+country allocation group (Sales basis = §22 run-rate; Forecast basis = the §7 rolling-4-month FC share qty, a **caller-owned seam** because the window anchor is not canonically pinned).
- **pool eligibility** (§23.6/§24.9) + **factory eligibility** (§35/§40) — DERIVED from `warehouses` (company+country+`warehouse_type='3PL'`+`is_active`; `is_factory_warehouse`) + fulfillment composition.
- **gap / net-order-need** — NOT computed: the planning fact carries the four raw inputs and the frozen resolver invokes `calculateGap` (§31) / `sumRemainingShortages` (§12/§32).

**Caller-owned resolver SEAMS (fail-closed structured issue, never guessed/fake-defaulted):** `destinationWarehouseId` (D-3/SC-11.3 → `MISSING_DESTINATION_WAREHOUSE`), `windowCode`/`requiredByDate` (§6 → `MISSING_WINDOW_CODE`/`MISSING_REQUIRED_BY_DATE`), demand **driver** Sales-vs-Forecast (no canonical classifier/column → `DEMAND_WEIGHT_UNRESOLVED`), §7 forecast basis (`forecastShareQty`). Eligibility gaps → `POOL_ELIGIBILITY_UNRESOLVED`/`FACTORY_ELIGIBILITY_UNRESOLVED`; run-rate absent → `DAILY_DEMAND_SOURCE_MISSING`. MISSING is never 0; eligibility never defaults true.

**Integration (§11/§13):** `supply-planning-production-source.js` gains a backward-compatible `request.allocationFactsInput` seam — when present it runs `KMAF.projectAllocationFacts` and injects the produced `receiverFacts`/`factoryDemandFacts`/`planningFacts` into the projection request (producer issues surfaced into `sourceIssues`); when absent, existing behavior is unchanged. **Reachability TEST VERIFIED end-to-end:** producer output → REAL `projectAllocationInputs` (real overseas allocator) → REAL `resolveWeeklyRecommendationFacts` → real carton-FLOOR `recommendedQty`; `calculatedGap === calculateGap(...)` proven.

**Tests:** NEW `supply-planning-allocation-facts-f1-5a.test.js` (36 assertions: owned eligibility predicates, weight share, seams/structured issues, forecast §2D, determinism, monthly factory, end-to-end reachability). Bundle regenerated (26 modules, hash `710cdd36…`, `--check` reproducible); parity updated 25→26 (`supply-planning-apps-script-bundle.test.js`). Full suite **84 files / 0 failing**; Golden **39/1/0**; #34 Pending. `BUNDLE_REBUILD_REQUIRED=true` (generated bundle only; no handler/router sync). **No new business formula, no DB/schema/header change, no API/router/page change, no live DB, no push/deploy.** **Remaining upstream decision:** the demand-driver classifier (Sales vs Forecast) and the §7 rolling-4-month FC window anchor have no canonical authority — they remain caller-owned seams; a future decision may freeze them so the producer can derive the forecast weight basis without a caller seam.

### I. F1-5-BD — Phase-1 Planning Context decision closure + runtime — COMPLETED (2026-08-06)
**The three F1-5-B seams are FROZEN for Phase 1 (`SUPPLY_PLANNING_DECISION_REGISTER` D-F1-5B-1..3) and the Planning Context Runtime is IMPLEMENTED.** Decisions: **D-F1-5B-1** destination = explicit caller-owned `warehouse_id`, validated (exists+active+same-company; no cross-company borrowing), **never inferred** (auto-routing via `replenishment_route_rules` = Phase 2; no table created); **D-F1-5B-2** Phase-1 `demandDriver = FORECAST` (frozen policy, not a fallback; no dynamic classifier; no `demand_driver` column; non-FORECAST explicit → `UNSUPPORTED_PHASE1_DEMAND_DRIVER`); **D-F1-5B-3** forecast anchor = injected calc month M, weight window M+1..M+4, `forecastShareQty = Σ Regular FC over M+1..M+4` (Regular FC only; Special Event never double-counted in the weight basis; explicit 0 valid; missing month ≠ 0). None contradicts an active canonical owner (consistent with SC-11.3 D-3, §7, §27); no DB/schema change.

NEW pure module `assets/js/core/supply-planning-planning-context.js` (`KMPCX` / `window.KM.planningContext`; `resolveRecommendationPlanningContext(input, options)`) resolves destination-context / planningCycle / windowCode / windowStart-End / requiredByDate / demandDriver / forecastWeightAnchor / forecastWeightMonths / forecastShareQty + structured issues. Window = frozen 4-month window (start = first day M+1, end = last day M+4; never an invented 30/60/90-day horizon); Regular required-by = window start; **Special-Event required-by INVOKES the frozen §10 owner `KMCALC.eventPreparationDate`** (pull-forward — never duplicated). §7 SHARE normalization stays **F1-5-A-owned**; the context runtime supplies only the basis quantity (a narrow `toAllocationFactReceiver` bridge maps a context → a KMAF `FORECAST_DRIVEN` receiver with `forecastBasis.forecastShareQty`). Injected calc month (no `Date.now`/browser date); deterministic; permutation-invariant; input never mutated; MISSING never 0; JSON-safe.

**Reachability TEST VERIFIED end-to-end:** context → `toAllocationFactReceiver` → `KMAF.projectAllocationFacts` (share normalization once) → REAL `projectAllocationInputs` (real overseas allocator) → REAL `resolveWeeklyRecommendationFacts` → carton-FLOOR `recommendedQty`; `calculatedGap === calculateGap(...)` unchanged. **Tests:** NEW `supply-planning-planning-context-f1-5bd.test.js` (39). Bundle regenerated 26→27 modules (hash `7e766e35…`, `--check` reproducible); parity updated 26→27. Full suite **85 files / 0 failing**; Golden **39/1/0**; #34 Pending. **No new business formula (all math via frozen owners), no DB/schema/header change, no API/router/page change, no persistence, no live DB, no push/deploy.** F1-5-A untouched. F1-5-B audit retained (marked RESOLVED FOR PHASE 1). **Next:** F1-4B-PRE wires the context → producer → production-source with real canonical snapshots.

### J. F1-4B-PRE — Production Recommendation Fact Assembly — COMPLETED (2026-08-06)
**Raw canonical snapshots now reach the real resolver WITHOUT prebuilt planningFacts/receiverFacts.** NEW pure module `assets/js/core/supply-planning-production-assembly.js` (`KMPA` / `window.KM.productionAssembly`; `assembleProductionRecommendationFacts(rawSnapshots, request, options)`) assembles the production inputs: request validation → identity normalization (marketplace_skus/sku_details/warehouses/marketplaces/fc — canonical rows, never index/display-name) → `KMPCX.resolveRecommendationPlanningContext` → `KMPCX.toAllocationFactReceiver` + §2D forecast basis → `KMAF.projectAllocationFacts` → attach `calculatedGap` via the **frozen** `KMCALC.calculateGap` (source-projection routes only `calculated_gap_qty`) → `productionRequest {…, receiverFacts, factoryDemandFacts, planningFacts}` on source-projection's **native seam**. Authors NO formula.

**Gap model (matches the existing production fixture; no formula change):** per-receiver gap = Regular FC M+1 (= the demand-ledger `forecastMonth`), with `destinationCurrentStock`/`timelyQualifiedIncoming`/`timelyApprovedCommittedSupply` = **explicit 0** (a self-fulfilled receiver has no exclusive destination stock; current stock + qualified incoming pass through the UNCHANGED F1-3 path into the supply ledger as the allocation source). `forecastShareQty` (M+1..M+4, D-F1-5B-3) is the §7 weight basis (KMAF normalizes). Destination is explicit caller-owned + validated (KMPCX; never inferred). demandDriver = FORECAST.

**END-TO-END TEST VERIFIED:** a realistic canonical snapshot fixture (identity + 4-month FC + 3PL current stock + one qualified-incoming shipment — **no** prebuilt planningFacts/receiverFacts/demandWeight/eligiblePoolTypes/calculatedGap/recommendedQty) → `KMPA` → `KMPS.buildProductionRecommendationSource` → existing demand/supply ledger + allocator + resolver → **real recommendedQty = 96** (`FLOOR(MIN(gap 100, allocated)/12)×12`); `calculatedGap === calculateGap(...)`; carton-FLOOR owner unchanged. §12 preserved: current stock direct, qualified incoming canonical (F1-3), count-once, `arrived → SHIPPED_IN_TRANSIT`, late incoming visible-but-not-covering (ETA>required-by → recommendedQty unchanged), no cross-company borrowing, no missing→0, read-only (0 Sheet writes). **Tests:** NEW `supply-planning-production-assembly-f1-4b-pre.test.js` (30). Bundle 27→28 modules (hash `d40c3708…`, `--check` reproducible); parity updated 27→28. Full suite **86 files / 0 failing**; Golden **39/1/0**; #34 Pending. **No new formula, no DB/schema/header change, no API/router/page/persistence change, no live DB, no push/deploy.** KMPCX/KMAF/production-source untouched (native seam used; no KMAF `calculatedGap` change needed). **Next:** F1-4B — the read-only `recommendation.workspace.get` API seam (separately authorized).

### K. F1-4B-A — Read-Only Recommendation Workspace API — COMPLETED (2026-08-06)
**The F1-4B-PRE assembly is now exposed through one bounded read endpoint** `recommendation.workspace.get` (spec: `API_RECOMMENDATION_WORKSPACE_SPEC.md`). NEW Apps Script handler `assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs` (routed from `01_router.gs`): validate (mandatory scope + destination + calc month + planning cycle; size ≤ 100; **fails before any read**) → `io.openTarget()` exact-ID gate → `KMPS.readCanonicalSnapshots` (targeted 11 canonical tables, ONCE; never `getOperationDb`) → **per in-scope SKU** `KMPA.assembleProductionRecommendationFacts` → `KMPS.buildProductionRecommendationSource` (existing ledger/allocator/resolver) → map/filter/sort/paginate → canonical `{success,data,meta,errors}` envelope. Injectable `io` → testable with zero SpreadsheetApp. Authors NO formula. Pure READ boundary (no write/persistence/draft/plan/order/reservation/inventory; no header/sheet creation/repair).

**Source-proven outputs per line:** `currentStockQty` (Σ CURRENT_STOCK supply source), `qualifiedIncomingQty` (Σ SHIPPED_IN_TRANSIT supply source), `calculatedGap` (frozen `calculateGap` owner via the productionRequest planning fact), `recommendedQty` (existing resolver carton-FLOOR). **No** Coverage/DOS/Projected/Reason/Status invented (omitted). Missing source → structured failure (never fake zero); legitimate runtime zero → successful zero; filter miss → successful empty page. To surface source-proven current-stock/QI, `supply-planning-production-source.js` `buildProductionRecommendationSource` additively returns `supplySourceEntries`/`demandSourceEntries` (the projection's lifecycle-bucketed rows; not a formula/recommendation change) → bundle regenerated (28 modules, hash `a002c6a3…`, `--check` reproducible; parity 56).

**API Foundation:** `km-api-foundation.js` registers `recommendation` (IMPLEMENTED + resolver + bounded DTO builder); per-workspace flag `recommendation:false` and master `USE_WORKSPACE_API:false` remain **default false** (infrastructure-only; **no page cutover**; no dual execution; no silent legacy fallback). **Tests:** NEW `supply-planning-recommendation-workspace-f1-4b-a.test.js` (35 — end-to-end real recommendedQty 96 from raw snapshots, source-proven currentStock 100/QI 24/gap 100, validation-before-read, wrong-ID fail-closed, zero writes, pagination/filter, registration + default-false flags + no-fallback); `km-api-foundation`/`-compat` updated 7→8 workspaces. Full suite **87 files / 0 failing**; Golden **39/1/0**; #34 Pending. **No new formula, no DB/schema/header change, no page connection, no persistence, no live DB, no push/deploy.** **Next:** F1-4B-B — Inventory Replenishment page cutover behind the flag (separately authorized).
