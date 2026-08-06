# Supply Planning — Decision Register (Phase F1-0)

> **READ-ONLY.** Only **genuinely unresolved** decisions that affect the Phase-F1 formula-runtime implementation are listed. **Already-frozen rules are NOT re-opened** here — the formula set (`SUPPLY_PLANNING_CALCULATION_RULES.md` v4.7), the §2F interim ETA authority, the K3 Active-Draft key, the recommendation persistence/orchestration contract (`RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md §Persist-Orch`), B-1/B-2/B-3/B-5/B-7 (decision-only) are settled and are not decisions. Baseline HEAD `9324086`, 2026-08-05.
>
> Each decision: **Issue · Conflicting sources · Current runtime behavior · User impact · Safe default · Blocks implementation? · Exact user decision required.** Referenced by `PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md`.

---

## D-1 — Recommendation-runtime deployment target: Verification Copy vs Production  🔴 BLOCKS live runtime

- **Issue:** the recommendation persistence lane is source-present + test-verified but has never run live. `RECOMMENDATION_TARGET_SPREADSHEET_ID_` is unified to `PRODUCTION_DB_SPREADSHEET_ID_` (`00_config.gs:25`), so a naive deploy would target **Production**, where a data incident remains OPEN.
- **Conflicting sources:** `SYSTEM_RUNTIME_ARCHITECTURE.md §SAFE` / Production Safety S0.5 mandate "the next round must target a duplicated verification Spreadsheet, not Production" — vs the config currently pointing at Production.
- **Current runtime behavior:** fail-closed (`KMPW.assertAuthorizedSchemasReady` throws `SCHEMA_NOT_PROVISIONED` because `recommendation_calculation_runs` is not migrated); nothing writes live.
- **User impact:** until resolved, no recommendation output can be produced/persisted live; the UI stays honest-empty.
- **Safe default:** provision a **duplicated Verification-Copy Spreadsheet**, migrate the additive columns + journal there, and set `RECOMMENDATION_TARGET_SPREADSHEET_ID_` to the copy id; Production untouched.
- **Blocks implementation?** **Yes** — gates F1-7, F1-4, F1-6 live execution (not the pure F1-3).
- **Exact decision required:** *Approve creating a Verification-Copy Spreadsheet and provisioning the additive schema there, with the recommendation target pointed at the copy — yes/no, and supply the copy's Spreadsheet ID.*

## D-2 — Provision `factory_stock_allocation_plans`  🟠 BLOCKS F1-5

- **Issue:** the FIFO factory allocator is implemented + tested but its result is never persisted or displayed; the target table `factory_stock_allocation_plans` (+ `forecast_share`, `allocated_factory_stock_qty`, `calculation_method`, `allocation_version`, `status`) exists in **no** `.gs` file.
- **Conflicting sources:** the table is specified in `SHIPMENT_CENTER_SPEC.md §9`, `DATABASE_RELATIONSHIP_MAP.md §6.7/§8B`, `BLUEPRINT §230/§377` (which also says "engine not built") — but has no code.
- **Current runtime behavior:** factory allocation = calculated (pure, test-only), not persisted, not displayed.
- **User impact:** no visibility into how the shared factory pool is split across companies/sites.
- **Safe default:** create the table **additively on the Verification Copy** with an engine-owned writer; keep it separate from the live physical `factory_stock` writer (`21_`, untouched).
- **Blocks implementation?** **Yes** — F1-5 cannot persist without it.
- **Exact decision required:** *Approve the additive `factory_stock_allocation_plans` schema + confirm the recommendation engine (not a manual UI) owns the writer — yes/no.*

## D-3 — Allocation-Draft Submit → Weekly Shipping Plan: lineage + idempotency  🔴 BLOCKS Submit handoff

- **Issue:** the Submit handoff is HALTED. Emitting `shipping_plans`/`shipping_plan_lines` from a submitted draft needs (a) **deterministic** plan ids (today `Utilities.getUuid()` at `11_…:289/329/392`), (b) an **`allocation_draft_id`/`allocation_draft_line_id` lineage column** on `shipping_plans`/`shipping_plan_lines` (none exists), and (c) a transaction/compensation over the append loop (none exists). Adding a lineage column is a **schema change**, which prior rounds prohibited.
- **Conflicting sources:** `ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md §9` (Submit HALT + no-schema-change) vs `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` (idempotent plan emission needs source-row identity).
- **Current runtime behavior:** `16_…:handleSubmitShippingAllocationDrafts_` flips `status='submitted'` and stops (`:352`, HALT `:359-365`). A **parallel legacy path** (`submitReplenishmentPlans → createShippingPlansBatch`) still creates plans from local UI state with no lineage.
- **User impact:** the persisted Allocation-Draft workflow dead-ends at Submit; plan creation is only the untraceable legacy path.
- **Safe default:** keep Submit **HALTED**; do not add the lineage column or emit plans until authorized.
- **Blocks implementation?** **Yes** — gates the F1-8 Submit sub-scope (explicitly excluded from active F1 rounds).
- **Exact decision required:** *Authorize (i) an additive `allocation_draft_id`/`allocation_draft_line_id` lineage column on `shipping_plans`/`shipping_plan_lines`, and (ii) a deterministic plan-id scheme — yes/no. Until yes, Submit stays HALTED and the legacy local path remains the only plan creator.*

## D-4 — B-8 cancellation / reopen / release mapping  🔴 BLOCKS reservation + Submit completeness

- **Issue:** how a cancelled/reopened shipment or plan **releases** previously-counted qualified incoming (count-once) and any reserved stock is unresolved (B-8). This underpins both the two-axis reservation model (reserve-at-draft / deduct-both-at-confirm) and a safe Submit.
- **Conflicting sources:** `SUPPLY_PLANNING_CALCULATION_RULES.md §2E` (count-once) + `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md §8A.1` (B-1 reserve trigger) name the need; no owner spec defines the release transition (B-8 UNRESOLVED across the calc-rules + recommendation-runtime specs).
- **Current runtime behavior:** Confirm-and-Ship deducts `current_stock` only (`22_…`), never touches `reserved_stock` or PO `shipped_qty`; no reservation is written at draft; cancellation release is undefined.
- **User impact:** without a release contract, reservation would leak (stock reserved but never released on cancel), so reservation cannot be safely implemented.
- **Safe default:** **fail-closed** — do not implement reservation or the second deduction axis; keep the single current-stock deduction until B-8 is frozen.
- **Blocks implementation?** **Yes** — gates the Ready-to-Ship reservation link and part of the execution pipeline (not the F1 recommendation slices).
- **Exact decision required:** *Freeze the B-8 cancel/reopen/release state transitions (what releases qualified-incoming and reserved stock, and when) — or confirm reservation stays deferred to a later phase.*

## D-5 — B-4 residual Qualified-Incoming live-source runtime items  🟠 affects F1-3 completeness

- **Issue:** wiring live shipment rows through §2E needs three residual B-4 runtime items resolved: (a) the **double-count owner** between `overseas_inventory_snapshot.wh_on_the_way_qty` and Shipment-derived incoming, (b) **`destination_warehouse_id` persistence/derivation** for shipment rows, (c) confirmation that the **frozen §2F interim ETA authority** (`shipments.eta` + lead-time fallback, since `shipment_events` is not implemented) is acceptable for F1-3.
- **Conflicting sources:** `SUPPLY_PLANNING_CALCULATION_RULES.md §2E`/§2F list these as B-4 "IMPLEMENTATION_REQUIRED"; `SUPPLY_CHAIN_SYSTEM_FLOW.md §11 B-4` owns the registry.
- **Current runtime behavior:** the production path bypasses §2E entirely (status-map shortcut), so none of these are exercised; `wh_on_the_way_qty` and Shipment-derived incoming could both count.
- **User impact:** if unresolved, qualified incoming could be double-counted (understating the gap) once §2E is wired.
- **Safe default:** treat **Shipment-derived incoming as the single authority** and `wh_on_the_way_qty` as display-only; use the frozen §2F interim ETA; derive `destination_warehouse_id` from the shipment's routing.
- **Blocks implementation?** **Partially** — F1-3 can land the reconciliation with the safe default; a definitive double-count owner is needed before F1-3 is declared complete.
- **Exact decision required:** *Confirm the single incoming authority (Shipment-derived) + `wh_on_the_way_qty` = display-only, and the §2F interim ETA — or specify the alternative owner.*

## D-6 — B-6 Request → PO atomicity  🟢 non-blocking near-term

- **Issue:** Convert-to-PO writes are sequential (create PO header(s) → lines → write-back `request_status`), not a single transaction; a mid-sequence failure could leave a partial conversion.
- **Conflicting sources:** `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` (Phase-1, sequential, works) vs `REQUEST_ORDER_AND_PO_SPEC.md` (future atomic `request_order_po_links`); B-6 UNRESOLVED.
- **Current runtime behavior:** conversion works and is live-reachable; atomicity is best-effort.
- **User impact:** rare partial-conversion risk; not a blocker for the recommendation runtime.
- **Safe default:** keep the current sequential conversion; add idempotent re-run guards later.
- **Blocks implementation?** **No** — does not block any F1 recommendation slice; only a later hardening round.
- **Exact decision required:** *Later — freeze B-6 (transaction/compensation for Request→PO). No action needed for F1-3…F1-7.*

## D-7 — Forecast Target% — apply-and-persist vs retire the dead resolver  🟠 BLOCKS F1-1 direction

- **Issue:** a stored Target% currently changes nothing — the `calculateEffectiveFC`/`getEffectiveTargetPct` resolver is DEAD (reachable only via `window.fcDebug.getEffectiveFc`, `fc-summary.js:1548`); the FC table shows raw months. Either Target% should **apply** (produce a persisted/derived effective FC) or the resolver should be **retired** (Target% is a downstream planning input, not a forecast adjuster).
- **Conflicting sources:** `FC_SUMMARY_SPEC.md §4` implies the resolver reads live rows and applies — vs the code, where it is never invoked; and `SUPPLY_PLANNING_CALCULATION_RULES.md §2D`, where Target% adjusts **Regular FC inside the demand engine** (not in the FC Summary display).
- **Current runtime behavior:** Target% is persisted (`fc_target_rules`) and consumed **only** inside the (unbuilt) demand engine per §2D; the FC-Summary "effective FC" display is dead.
- **User impact:** users may believe a saved Target% adjusts the forecast when it does not.
- **Safe default:** **retire** the dead FC-Summary resolver; keep Target% as the §2D demand-engine input (matching current live behavior and the formula owner), and surface "effective FC" only inside the F1-6 recommendation output.
- **Blocks implementation?** **Yes (direction only)** — F1-1 needs this decision to either wire or delete the resolver.
- **Exact decision required:** *Should Target% adjust the FC-Summary displayed/persisted forecast (wire the resolver), or is Target% purely the §2D demand-engine input (retire the dead FC-Summary resolver)?*

## D-F1-5B-1 — Destination authority (Phase-1)  ✅ RESOLVED / FROZEN FOR PHASE 1 (2026-08-06)

- **Decision:** `destinationWarehouseId` is an **explicit caller-owned canonical input** (a valid `warehouse_id`). The
  Planning Context Runtime **validates** it (exists + active + same company; no cross-company borrowing) but **never
  auto-selects or infers** it — no first-row / display-name / country-default / latest-wins / cheapest-route / random.
- **Tokens:** `MISSING_DESTINATION_WAREHOUSE` / `DESTINATION_NOT_ELIGIBLE` (invalid/inactive/cross-company) /
  `DESTINATION_AUTHORITY_CONFLICT` (>1 distinct authority).
- **Consistent with:** SC-11.3 (D-3) — destination caller/planning-scope-owned, never inferred. No contradiction.
- **Phase 2:** automated selection via `replenishment_route_rules` (CARRIER_AND_ROUTE_SPEC §5A — "future source /
  Spec only"). **No route-rules table created this round; no DB column/table.** Supersedes F1-5-B "unresolved seam #1".

## D-F1-5B-2 — Demand driver (Phase-1)  ✅ RESOLVED / FROZEN FOR PHASE 1 (2026-08-06)

- **Decision:** Phase-1 Inventory-Replenishment recommendations are **`demandDriver = FORECAST`** — a **frozen policy,
  not a fallback**. Authoritative demand = Regular Forecast + Special Event demand (existing frozen event rules). Sales
  run-rate stays available for diagnostics + the existing daily-demand/survival owner, but is **not** an automatic
  classifier and **must not** override Forecast-driven replenishment. **No dynamic Sales/Forecast classification; no
  `demand_driver` DB column.** A non-FORECAST explicit driver → `UNSUPPORTED_PHASE1_DEMAND_DRIVER`.
- **Consistent with:** §2C/§2D/§20.5 (both modes exist; nothing mandates a given SKU be Sales-driven). No contradiction.
- **Phase 2:** Sales-driven recommendation policy + classifier. Supersedes F1-5-B "unresolved seam #2".

## D-F1-5B-3 — Forecast weight anchor (Phase-1)  ✅ RESOLVED / FROZEN FOR PHASE 1 (2026-08-06)

- **Decision:** calculation month **M** (injected `YYYY-MM`, never browser-current); Forecast weight window =
  **M+1, M+2, M+3, M+4**; `forecastWeightAnchor = M`; **`forecastShareQty = Σ Regular FC over M+1..M+4` (Regular FC
  ONLY)**. Special Event demand stays part of recommendation demand via the existing event rules but is **never
  double-counted inside the Regular-FC weight basis**. Explicit monthly zero = valid zero; a **missing** required month
  is **not** auto-zero (`MISSING_FORECAST_WEIGHT_SOURCE`).
- **Consistent with:** §7 ("rolling future 4-month FC window") + §27 T1-T4 (Month+1..+4). Pins the previously-unpinned
  anchor; no contradicting anchor exists. Tokens: `MISSING_FORECAST_WEIGHT_SOURCE` / `INVALID_FORECAST_WEIGHT_VALUE` /
  `FORECAST_WEIGHT_SOURCE_CONFLICT` / `FORECAST_WEIGHT_ANCHOR_UNRESOLVED`. §7 SHARE normalization remains F1-5-A-owned.
- Supersedes F1-5-B "unresolved seam #3". **No DB column/table.**

> **Runtime:** all three landed in the pure `assets/js/core/supply-planning-planning-context.js`
> (`resolveRecommendationPlanningContext`, `KMPCX`, F1-5-BD) — bundled, test-verified (39 assertions), feeding F1-5-A →
> real allocator → real resolver. F1-5-B's audit (`PHASE_F1_5B_PLANNING_CONTEXT_AUTHORITY_HALT.md`) is retained as
> historical evidence, **marked RESOLVED FOR PHASE 1** by these decisions.

---

## Decisions explicitly NOT re-opened (already frozen — listed to prevent accidental re-litigation)

- Formula set (Engine A/B, §2C.1/§31/§14/§22/§27A/§32A/§34A/§39/§40) — FROZEN v4.7.
- §2F interim ETA authority (`shipments.eta` + lead-time), K3 Active-Draft key, deterministic `calculation_run_id`, `draft_version` optimistic token — FROZEN.
- Recommendation persistence/orchestration public contract — FROZEN (`§Persist-Orch`).
- Persist-vs-on-request policy — FROZEN (`CALC_RULES §4`: live analysis not persisted; scheduled/manual recommendation persisted).
- B-1/B-2/B-3/B-5/B-7 — RESOLVED (decision-only).
- Pooling Phase-1 vs Phase-2 boundary (no cross-company borrowing in Phase-1) — FROZEN; audit confirmed no premature implementation.
