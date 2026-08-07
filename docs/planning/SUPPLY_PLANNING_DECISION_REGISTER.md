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

## D-F1-4B-E0R — Recommendation destination node + Phase-1 fixed multi-warehouse demand allocation ✅ AUTHORIZED (2026-08-06)

- **D-F1-4B-E0R-1 — Destination node types.** Recommendation destinations are `MARKETPLACE` (canonical marketplace/
  site identity; **no fake `warehouse_id`**; the actual Amazon FC is assigned later at Shipment creation) or
  `WAREHOUSE` (canonical `warehouse_id`; stock/incoming/demand/gap stay warehouse-specific).
- **D-F1-4B-E0R-2 — Multi-warehouse demand allocation.** When one company/country/marketplace demand scope serves
  multiple overseas warehouses and the canonical Forecast/Sales source has **no `warehouse_id` dimension**, allocate
  Forecast (and Sales/run-rate, same ratio unless a source-proven rule exists) to each warehouse by an **explicit
  configured fixed ratio** (e.g. KM/US/Amazon 30% / 70%). Calculate each warehouse **independently**; **never pool**
  destination Current Stock or Qualified Incoming; **no silent surplus transfer**. This **supersedes the prior blanket
  prohibition** on proportional warehouse demand allocation. Cross-warehouse transfer stays Phase-2 (separately frozen).
- **D-F1-4B-E0R-3 — Ratio is configuration, not a constant.** The ratio is read from ONE canonical authority
  (`replenishment_demand_allocation_rules`, `REPLENISHMENT_DEMAND_ALLOCATION_RULES_SPEC.md`). **Forbidden:** hard-coding
  0.3/0.7 in calculation modules; inferring from inventory / warehouse order; equal split on missing config; first-
  warehouse-gets-remainder; silent latest-wins; copying 100% demand to every warehouse.
- **D-F1-4B-E0R-4 — Separate warehouse calculations.** Per warehouse, `allocatedForecastQty` / `allocatedSalesQty` /
  `destinationCurrentStock` / `destinationQualifiedIncoming` / `calculatedGap` / `recommendedQty` / `remainingShortage`
  are computed + returned **separately**; A's stock/incoming never count as B's.
- **Runtime (this round F1-4B-E0R):** pure building blocks only — `assets/js/core/supply-planning-demand-allocation.js`
  (destination DTO/key, targeted rule reader, ratio validator with integer basis points, deterministic largest-
  remainder allocator **reusing the frozen §24.7 policy**). No wiring into KMPCX/KMAF/KMPA/KMPS; no UI/Submit/Shipment/
  persistence; config table is a user-owned provisioning prerequisite (no runtime table creation).

## D-F1-4B-FM1 — Unified Destination-Node core runtime (MARKETPLACE order-need + WAREHOUSE replenishment) ✅ AUTHORIZED (2026-08-06)

Resolves the three F1-4B-FM escalations (D-1/D-2/D-3). Core runtime ONLY — no page cutover, Workspace request
redesign, Apps Script handler fanout, UI, persistence, Submit/Shipment/PO/Coverage (deferred to the transport round).

- **D-F1-4B-FM1-1 — MARKETPLACE semantics = `MARKETPLACE_ORDER_NEED`.** "How much total additional supply this
  marketplace still needs after confirmed marketplace stock + confirmed Qualified Incoming." Uses the **existing frozen
  Monthly order-need owner** `KMCALC.calculateSuggestedOrderQty` (carton CEILING). **Never** the Weekly pool allocator;
  **never** a fabricated Amazon warehouse. (Adopts the F1-4B-FM audit's recommended D-1 = A.)
- **D-F1-4B-FM1-2 — WAREHOUSE semantics = `WAREHOUSE_REPLENISHMENT`.** "How much this overseas warehouse should
  receive, subject to source-pool availability." Uses the **existing frozen Weekly resolver owner**
  `KMCALC.calculateShippingAndResidual` (FLOOR, allocator-capped) over the frozen ratio fanout.
- **D-F1-4B-FM1-3 — Qualified-Incoming uncertainty is NEVER a fake zero.** Only **source-proven** marketplace incoming
  (identity resolved to a unique active `marketplaces` row) is summed, through the existing `KMQI` count-once
  lifecycle. `incomingCompleteness ∈ {COMPLETE, PARTIAL, UNAVAILABLE}`; active potentially-relevant **unresolved**
  incoming ⇒ PARTIAL ⇒ canonical `recommendedQty` is **BLOCKED**; a `provisionalOrderNeed` may be returned for
  diagnostics but is never labeled/persisted as `recommendedQty`. Missing source ⇒ UNAVAILABLE (never a confirmed 0).
- **D-F1-4B-FM1-4 — Identity refactor (NOT a formula change).** KMPCX destination validation is refactored to accept a
  normalized DestinationNode (MARKETPLACE ⇒ `marketplace_id`, `warehouseId=null`, no warehouse eligibility / no
  source-pool decomposition; WAREHOUSE/legacy ⇒ byte-identical). No frozen formula / allocator / count-once / QI gate /
  carton rule rewritten. `MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED` persists as the honest disposition when shipments
  carry no canonical `marketplace_id` (no source-proven shipment→marketplace mapping exists).
- **Runtime (this round F1-4B-FM1):** NEW pure `assets/js/core/supply-planning-destination-runtime.js`
  (`window.KM.destinationRuntime`: `normalizeRecommendationDestination` re-export, `resolveMarketplaceCurrentStock`,
  `resolveMarketplaceIncomingIdentity`, `resolveMarketplaceQualifiedIncoming`, `resolveMarketplaceDemand`,
  `resolveMarketplaceRecommendation`, `resolveWarehouseRecommendation`, `resolveUnifiedDestinationRecommendation`);
  `normalizeRecommendationDestination` consolidated into `supply-planning-demand-allocation.js`; KMPCX (bundled)
  refactored additively → bundle regenerated via the build tool (`--check` parity). The new runtime module is **not
  bundled** (no server handler calls it yet — transport is the next round). No live DB; no page/handler/router change.

## Decisions explicitly NOT re-opened (already frozen — listed to prevent accidental re-litigation)

- Formula set (Engine A/B, §2C.1/§31/§14/§22/§27A/§32A/§34A/§39/§40) — FROZEN v4.7.
- §2F interim ETA authority (`shipments.eta` + lead-time), K3 Active-Draft key, deterministic `calculation_run_id`, `draft_version` optimistic token — FROZEN.
- Recommendation persistence/orchestration public contract — FROZEN (`§Persist-Orch`).
- Persist-vs-on-request policy — FROZEN (`CALC_RULES §4`: live analysis not persisted; scheduled/manual recommendation persisted).
- B-1/B-2/B-3/B-5/B-7 — RESOLVED (decision-only).
- Pooling Phase-1 vs Phase-2 boundary (no cross-company borrowing in Phase-1) — FROZEN; audit confirmed no premature implementation.

## D-F1-4B-FM3b — Canonical Time-Phased Supply Projection owner (KMTPP)

**Owner (NEW, frozen):** `assets/js/core/supply-planning-time-phased-projection.js` →
`KM.core.timePhasedProjection.projectTimePhasedSupply(input)` (VERSION `kmtpp-fm3b-1`). Pure / deterministic /
READ-ONLY. It owns ONLY chronological mechanics; it owns NO fact.

**Reused frozen owners (unchanged):** opening current stock (amazon_inventory_snapshot.available_qty for
MARKETPLACE; warehouse-specific stock for WAREHOUSE), Qualified Incoming eligibility + ETA (KMQI), Regular FC
by month + M+1..M+4 window (KMPCX `_forecastWeightMonths`; window start = first day of M+1, end = last day of
M+4), Special-Event preparation/pull-forward date (KMCALC §10, Event Start − 30 calendar days), demand
allocation split (KMDA), destination identity (KMDR), units-per-carton + carton CEIL/FLOOR + scalar
calculateGap (KMCALC). The projection NEVER recomputes any of these.

**New ownership (this decision):**
1. **Event ordering** — a single merged event stream (INCOMING, DEMAND, CHECKPOINT), sorted ONCE by
   (canonical ISO date → kind → lexicographic id). Same-date order: INCOMING (0) before DEMAND (1) before
   CHECKPOINT (2), so incoming available on date D may cover demand required by D and a same-day checkpoint
   reflects both. Never browser clock / locale sort / insertion order. No `Date.now()` / `new Date()` / RNG.
2. **Opening balance** — `openingSupplyQty` (a canonical destination-specific fact). Missing → `ready:false`
   `OPENING_SUPPLY_UNAVAILABLE` (missing ≠ zero). Negative → `OPENING_SUPPLY_INVALID`.
3. **Supply event application** — `balance += incoming.qty` at its available date, applied EXACTLY ONCE
   (count-once across all tiers/checkpoints — one shipment can never cover two tiers).
4. **Demand event consumption** — `covered = min(balance, demand.qty)`; `balance -= covered`;
   `shortage = demand.qty − covered`. Demand consumed chronologically.
5. **Carry-forward** — remaining balance flows to the next tier. A tier's `openingSupplyQty` = the running
   balance at the moment the tier's FIRST event is reached (remaining after all prior tiers). Opening stock is
   consumed ONCE — NEVER `max(0, demand − opening)` re-evaluated per tier (that double-use is forbidden).
6. **Checkpoint emission** — snapshot `{cumulativeDemandQty, cumulativeCoveredQty, remainingSupplyQty, gapQty}`
   at each requested checkpoint (kind 'MONTH' | 'DAY'); plus a T1..T4 `monthlyProjection[]` rollup
   `{tier, month, openingSupplyQty, incomingAddedQty, demandQty, coveredQty, remainingSupplyQty, remainingGapQty}`.

**Zero / missing / blocked semantics:** valid canonical 0 demand → valid 0 gap (supply intact). Missing opening
supply / invalid dates / invalid qty → fail closed with a structured issue (never 0). The owner does not itself
mark lines "blocked" — the caller preserves the frozen MARKETPLACE PARTIAL/UNAVAILABLE fail-closed semantics.

**MARKETPLACE:** destination identity passed through; NO fabricated `warehouse_id`; marketplace-level FBA stock
only. **WAREHOUSE:** one independent projection per warehouse node; warehouse-specific stock + incoming; NO
cross-warehouse pooling; totals conserved by construction.

**BOUNDED HALT — day horizons (D18/D30/D45/D90):** NOT produced this round. Two required authorities are
missing and NOT frozen: (a) no authoritative calculation-DAY / asOf anchor from which +18/+30/+45/+90 start
(KMPCX derives only month-boundary dates and forbids browser-date inference); (b) no frozen intra-month
day-demand distribution rule (monthly FC ÷ daysInMonth and avgSales × days are explicitly NOT authorized). The
owner's checkpoint mechanism is generic and ready to snapshot day horizons the moment both authorities are
frozen — but it never fabricates day demand or a day anchor. See the FM3b completion report for the exact
missing-authority statement (business freeze required).

**recommendedQty / carton conversion:** intentionally NOT performed inside this owner (separation of projection
vs recommendation). The downstream frozen resolver (KMCALC carton CEIL/FLOOR) consumes `remainingGapQty`.

## D-F1-4B-FM3c-1 — Qualified Incoming Event Exposure (additive; no qualification/allocation change)

**MARKETPLACE owner:** `KMQI.evaluateQualifiedIncoming` (supply-planning-qualified-incoming.js) → surfaced via
`resolveMarketplaceQualifiedIncoming` and the MARKETPLACE line in
`KMDR.resolveUnifiedDestinationRecommendation` (supply-planning-destination-runtime.js).
**Status:** Outcome A — event facts already existed in `candidateResults`; now surfaced additively as
`qualifiedEvents: [{ incomingId, eta, eligibleQty, sourceType, state }]`.
- **incomingId authority** = KMQI candidate `lineageKey` (the canonical count-once identity; dedup already
  collapses identical lineages, so no shipment appears twice).
- **ETA authority** = KMQI candidate `eta` (strict YYYY-MM-DD; no fabrication; missing ETA → not QUALIFIED →
  not an event).
- **quantity authority** = KMQI `qualifiedQuantity` (the QUALIFIED state's eligible qty).
- **completeness authority** = unchanged: `confirmedQualifiedIncomingQty` + `incomingCompleteness`
  (COMPLETE/PARTIAL/UNAVAILABLE) are byte-for-byte semantically unchanged. Only `qualificationState ===
  'QUALIFIED'` becomes an event; LATE_RISK / REVIEW / EXCLUDED / quarantined-external stay OUT (never a fake
  usable qty); UNAVAILABLE → `qualifiedEvents: []`.
- **Explicit:** ADDITIVE EXPOSURE ONLY — no eligibility, ETA rule, count-once, PARTIAL/UNAVAILABLE, or
  allocation formula was changed.

**WAREHOUSE owner:** `KMSF` supply-lifecycle (`supply-planning-source-facts.js`
`buildSupplyLedger`/`projectSupplyLifecycle`) → `supply-planning-source-projection.js` supplyRows → KMPS
`supplySourceEntries`.
**Status:** Outcome B — **BOUNDED HALT (unresolved).** Granularity-loss point: the shipment lifecycle ENTRY
carries `supplyLineageRef, warehouseId, poolType, lifecycleBucket, quantity` but **DROPS the per-shipment
`eta`** (the candidate `c.eta` is consumed by the ETA gate but never preserved on the output entry); source-
projection supplyRows likewise carry no `eta`. So no ETA-dated, destination-specific warehouse incoming EVENT
exists downstream — warehouse incoming reaches the handler only as an aggregate `qualifiedIncomingQty`.
`supply-planning-source-facts.js` is OUTSIDE this round's authorized file scope, so no change was made.
**Smallest proposed future authority change (FM3c-1b, requires authorization):** additively preserve the
already-validated `eta` (and `destinationWarehouseId`) onto the KMSF lifecycle entry, then copy it onto the
source-projection supplyRow — a pure fact-preservation of an existing validated value, NO allocation/
qualification math change. That would make WAREHOUSE Outcome A. NOT a per-tier KMPS algorithm.

Bundle: KMQI + KMDR are bundled modules → `90_generated_supply_planning_bundle.gs` regenerated via the build
tool (30 modules; sha256 904d45cb0a4550eea87064aa1c0b5ba8642fa4fd0c7aa68dd56be996798c8e23). KMTPP NOT bundled
this round.

## D-F1-4B-FM3c-1b — Warehouse Qualified Incoming ETA Lineage Preservation (additive; resolves FM3c-1 WAREHOUSE HALT)

**Resolves** the FM3c-1 WAREHOUSE bounded HALT (Outcome B) — makes WAREHOUSE **Outcome A** by additive fact
preservation only. NO qualification, allocation, quantity, destination, or formula change.

**ETA authority (frozen):** the ALREADY-KNOWN canonical shipment ETA `c.eta` — the SAME value KMQI's ETA gate
consumed. Never a new date source; never `source_data_as_of` / required-by / month start-end / clock / any
derived date. Missing ETA stays missing (never fabricated).

**Preservation chain (each additive, evidence only):**
1. `KMSF.projectSupplyLifecycle` (supply-planning-source-facts.js) — the shipment lifecycle entry now carries
   `eta: (nonEmpty(c.eta) ? str(c.eta) : null)` alongside the unchanged `supplyLineageRef / warehouseId /
   poolType / lifecycleBucket / quantity`. (The generic explicit-row builder likewise carries `r.eta` when
   present — uniform, additive.) This is the exact former granularity-loss point.
2. `supply-planning-source-projection.js` — the `lifecycle.entries → supplyRows` push carries `eta` through.
3. Production supply facts — `supplySourceEntries` is the RAW supplyRows array (not the fixed-header
   `toSnapshot`), surfaced verbatim by `KMPS.buildProductionRecommendationSource`; ETA is NOT stripped on the
   FM3c-2 consumer path.

**Warehouse qualifiedEvents owner (additive; surfaced, never reconstructed):** `supply-planning-source-projection.js`
derives `warehouseQualifiedEvents: [{ incomingId, eta, eligibleQty, warehouseId, sourceType, state }]` from the
SAME `SHIPPED_IN_TRANSIT` supply rows the handler already aggregates (`recoWsSupplyBySku_`:
`qualifiedIncomingQty = Σ SHIPPED_IN_TRANSIT`). Surfaced additively on `KMPS.buildProductionRecommendationSource`.
- **incomingId** = `supply_lineage_ref` (`shipment:<id>:<lineId>`, count-once, per-line → one destination
  warehouse; legitimate multi-warehouse splits are distinct lineageKeys → distinct events, never deduped).
- **eta** = the preserved canonical shipment ETA. Only a row WITH an ETA becomes a dated event; a missing-ETA
  in-transit row stays counted in the aggregate but is NOT a dated event.
- **eligibleQty** = the row's existing `SHIPPED_IN_TRANSIT` quantity — EVIDENCE over existing supply, NOT
  additional supply, so `Σ eligibleQty == Σ SHIPPED_IN_TRANSIT` (conservation; no double count).
- **Explicit:** no qualification/allocation/quantity/destination/formula change; no monthly-projection wiring;
  no handler cutover; no Order Planning / Inventory UI change.

Bundle: KMSF + KMSP + KMPS are bundled → `90_generated_supply_planning_bundle.gs` regenerated via the build tool
(30 modules; `--check` PASS; bundle_sha256 beecbee3a50e6db8d6682acbcf592fc239a4e12d29ffc13fcb7e477798993a0b).
KMTPP still NOT bundled (FM3c-2). FM3c-2 may now consume ETA-dated warehouse incoming events for both
destination types (MARKETPLACE via FM3c-1, WAREHOUSE via this round).

## D-F1-4B-FM3c-2 — Monthly Projection Transport Wiring (additive DTO; KMTPP bundled + wired; no formula/UI)

**Bundles + wires** the frozen KMTPP owner into `recommendation.workspace.get` so each canonical line additively
exposes `line.monthlyProjection[]` for T1..T4. Transport only — reuses frozen owners, invents no formula, no UI.

- **KMTPP bundle registration:** `supply-planning-time-phased-projection` added to the build tool MODULE_ORDER
  (standalone, no deps) + GLOBALS (`KMTPP`). Bundle regenerated → **31 modules**; `--check` PASS;
  bundle_sha256 `16a393c4748e594f58f95d7a8926287a5a25f1cb93d17f3ecc5c833689a750ef`. Never hand-edited.
- **Month/tier authority:** the existing `KMPCX._forecastWeightMonths(calculationMonth)` window; T1..T4 = M+1..M+4;
  each tier checkpoint/required-by = the tier month first day (`YYYY-MM-01`) — allowed derivation, NO clock, NO
  day-horizon (D18/30/45/90 remain authority-blocked).
- **Assembly owner:** `recoWsBuildMonthlyProjection_` (handler `42_api_v1_recommendation_workspace.gs`) — builds
  demand/incoming events, calls `KMTPP.projectTimePhasedSupply` EXACTLY ONCE per destination, and appends a
  per-tier `suggestedOrderQty` from the frozen `KMCALC.calculateSuggestedOrderQty` carton-CEIL owner over
  `remainingGapQty`. It owns NO chronological/gap/ceil math.
- **MARKETPLACE:** opening = `line.currentStockQty`; demand = the SAME `fcByMonth` (all 4 months required, else
  truthful block); incoming = the FM3c-1 `line.qualifiedEvents` (ETA-dated, count-once, QUALIFIED-only — never
  reconstructed from `confirmedQualifiedIncomingQty`). One KMTPP call.
- **WAREHOUSE:** one INDEPENDENT KMTPP call per warehouse; opening = that warehouse's OWN Σ CURRENT_STOCK
  (`recoWsWarehouseOpeningStock_`; missing → null → truthful unavailable, never pooled, never fake 0); demand =
  the per-warehouse monthly split (`override[warehouseId]`); incoming = ONLY `warehouseQualifiedEvents` whose
  `warehouseId` matches (FM3c-1b; strictly isolated). NOTE: the workspace WAREHOUSE runtime path is
  PRE-EXISTINGLY blocked `ALLOCATION_FACTS_NOT_READY` (WEEKLY allocation/receiver facts not derivable from raw
  snapshots — unrelated to this round), so the wiring lives in the (currently unreached) success branch; a
  blocked line correctly carries NO `monthlyProjection` (§12 absent-on-blocked). Warehouse projection/isolation
  semantics are proven directly at the KMTPP-helper level.
- **Additive DTO:** `line.monthlyProjection = [{ tier, month, openingSupplyQty, incomingAddedQty, demandQty,
  coveredQty, remainingSupplyQty, remainingGapQty, suggestedOrderQty }]`. All pre-existing scalar fields
  (allocatedForecastQty / currentStockQty / qualifiedIncomingQty / calculatedGap / recommendedQty /
  provisionalOrderNeed / residualShortageQty / blocked / blockedReason) are byte-compatible. `line.monthlyProjection`
  is ABSENT when it cannot be built truthfully (missing forecast month, opening unavailable, blocked, KMTPP absent).
- **Bounded property (documented, not a HALT):** MARKETPLACE incoming events are QUALIFIED against the existing
  required-by = T1 (M+1) first day, so they represent incoming available by T1; later marketplace arrivals are (by
  the frozen gate, unchanged to preserve scalar `confirmedQualifiedIncomingQty`) not in `qualifiedEvents` and thus
  not time-phased this round. WAREHOUSE `warehouseQualifiedEvents` span the whole window (status-based, not
  required-by-gated). Read count unchanged (ONE targeted read); zero writes; FM3a session cache stores `env.data`
  verbatim → `monthlyProjection` persists.

## D-F1-4B-FM3d — Order Planning monthlyProjection consumer cutover (UI presentation only; no formula/write)

**Frontend-only** consumer cutover in `request-order.js` (+ minimal `request-order.css`). No runtime formula, no
Apps Script handler, no bundle, no DB, no write-flow change. Presentation is PURE — the page authors no
gap/carry-forward/carton/suggested math (all server/KMTPP/KMCALC owned in FM3c-2).

- **Demand Summary (T1–T4)** — on the recommendation-enabled path gains a **Gap** column: `Demand ←
  monthlyProjection.demandQty`, `Gap ← monthlyProjection.remainingGapQty` (the ONLY owner of monthly T1–T4
  shortage). When a projection is unavailable, Demand falls back to the existing page authority
  (`_roDemandForMonth`) and Gap renders "—" (never fabricated). Workspace OFF → legacy demand-only, byte-unchanged.
- **Order Allocation Suggested (T1–T3)** — `Suggested ← monthlyProjection.suggestedOrderQty` (server KMCALC
  carton-CEIL). Legacy page `_roTierSuggested` is retired ONLY for this DISPLAY column; it REMAINS the owner of
  the Order Qty default + Send Request (frozen write path, §18) and the workspace-OFF fallback.
- **Manual Order Qty / Send Request** — UNCHANGED. The async projection patch (`_opRecoPatchCanonicalCells`)
  rewrites ONLY the Demand/Gap/Suggested cells (keyed by `data-ro-{demand,gap,suggested}-tier` identity), never
  the Order Qty / Carton / Note inputs → no reset, no focus loss, no auto-overwrite.
- **Valid-zero contract** — `_opRecoFmtQty`: finite (incl. 0) → number; null → "…" while loading, "—" once
  settled. Never 0→dash, never null→0.
- **Primary projection selection** — the single loaded destination line that carries a monthlyProjection
  (MARKETPLACE case). Multiple lines (warehouse fanout) or none → null → truthful unavailable (no page-side merge).
  WAREHOUSE lines are pre-existingly blocked `ALLOCATION_FACTS_NOT_READY` (FM3c-2) → Gap/Suggested "—".
- **Standalone "Recommendation — Order Need" table retired** — demoted to a COLLAPSED `<details>` "Recommendation
  diagnostics" area (`_opRecoSubsectionHtml`); all runtime states (status / recommended / blockedReason /
  requestId / cycle) preserved as diagnostics, no longer the decision surface.
- **T4** — shown in Demand Summary (visibility) but NOT made a writable Order Allocation tier (stays T1–T3).
- Request lifecycle / dedupe / AbortController / stale-guard / FM3a cache — unchanged. One request per expand.

## D-F1-4B-FM4a — Canonical day-horizon (D18/D30/D45/D90) projection authority (runtime owner; no UI)

Freezes the two authorities FM3b left open and implements ONE canonical owner. Additive; no new engine; no
formula rewrite; no DB/write; no Inventory UI (that is FM4b).

- **Calculation-DAY authority (FROZEN):** new server Script Property **`RECOMMENDATION_CALCULATION_DATE`**
  (`YYYY-MM-DD`), owner `recoWsResolveCalcDate_` (42_api). Separate from `RECOMMENDATION_CALCULATION_MONTH` —
  never derived from it. No browser/server clock, no `new Date()`. Missing → `RECOMMENDATION_CALCULATION_DATE_NOT_CONFIGURED`;
  malformed → `RECOMMENDATION_CALCULATION_DATE_INVALID` (fail closed). It gates ONLY `line.horizons`; the existing
  monthly/OP response is unaffected when absent (additive).
- **Daily regular-FC distribution (FROZEN):** for each calendar day, `dailyRate = monthlyRegularFC / daysInMonth`
  using the month's REAL length (28/29-leap/30/31). Owner = **KMHP** (`supply-planning-horizon-projection.js`).
  NOT `FC × days`, NOT avg-sales/day. Carried at FULL PRECISION per day; never pre-rounded. Special events are
  **EXCLUDED** — consistent with the frozen recommendation demand authority (monthlyProjection is regular-FC only);
  the prep-date special-event authority is available for a future round if the business freezes its inclusion (no
  silent semantic change; not a conflict because we are NOT adding it).
- **Rounding owner (FROZEN):** `hround = Math.round` applied ONCE at checkpoint emission inside KMHP — the single
  quantity-rounding owner for day horizons; `gapQty = max(0, hround(cumDemand − cumCovered))` from the full-precision
  KMTPP values. No independent rounding in any consumer.
- **Chronology (REUSED, not duplicated):** KMHP calls the frozen **KMTPP** once per destination with per-day demand
  events + ETA-dated incoming + dated checkpoints D{N} = calcDate + N days (`kind:'DAY'`). KMTPP got ONE additive
  field — `checkpoint.cumulativeIncomingQty` — isolated from monthlyProjection (which passes no checkpoints), so
  T1–T4 is byte/semantically unchanged (CO1100-R regression re-proven: gap 1714/4282/7500/0, sug 1720/4320/7520/0).
- **Cumulative + count-once:** ONE timeline — opening supply consumed once (never reset per horizon), each incoming
  applied once on its ETA (before D18 → covers D18; after D18/before D30 → covers D30+; after D90 → no horizon).
- **Suggested (REUSED):** `KMCALC.calculateSuggestedOrderQty` carton-CEIL over `gapQty`; gap 0 → 0; missing UPC → null.
- **DTO:** `line.horizons = [{ windowCode, requiredByDate, demandQty, openingSupplyQty, incomingAddedQty,
  coveredQty, remainingSupplyQty, gapQty, suggestedOrderQty }]` for D18/D30/D45/D90. A horizon whose window covers a
  month with missing FC → all quantities null (opening still shown) — truthful, never a fabricated 0.
- **MARKETPLACE** — no fake warehouse; **WAREHOUSE** — one independent KMHP call per warehouse (own opening; only
  its own `warehouseQualifiedEvents`; never pooled). WAREHOUSE `ALLOCATION_FACTS_NOT_READY` block preserved (unfixed).
- Bundle: KMTPP + KMHP bundled → regenerated (32 modules; `--check` PASS; bundle_sha256
  `56b225e60792b1202a95270a92fa536dcb211c53a5c64b5372ac1a5c685234d6`). FM4b (Inventory UI) consumes `line.horizons`.

## D-F1-4B-FM3f-1 — Canonical planning-input correction, Commit 1 (Authorities A/D/E/F; runtime only)

User-frozen (FM3f-1) + implemented at the runtime/source-fact layer — NO page-side formula, NO write, NO DB/schema
change, NO FM4b UI. Corrects the monthlyProjection/horizons INPUTS (the prior HALT's root cause), not the KMTPP/KMHP
chronology. New canonical owner **KMPD** (`supply-planning-planning-demand.js`, bundled; VERSION `kmpd-fm3f1-1`)
replicates the frozen page owners so Order Planning + Inventory + monthlyProjection + horizons share ONE demand
authority.
- **A · Site Stock (OPENING_DESTINATION_STOCK):** `KMDR.resolveMarketplaceCurrentStock` = `available_qty +
  fc_transfer_qty + fc_processing_qty` (customer_order + unfulfillable EXCLUDED). available_qty is the required base
  (missing → still missing, never fabricated 0); transfer/processing absent → 0; NEVER modeled as qualified incoming
  (KMQI = shipments only) → no double count. Single marketplace planning-stock owner all consumers reuse.
- **E · Target %:** `KMPD.adjustedRegularFc` = round(Base × TargetPct/100); TargetPct from `fc_target_rules` via the
  SAME matching as page `_roTargetPct` ({month}_pct → target_percentage → 100 default; no rules → 100).
  `fc_target_rules` added to KMPS.CANONICAL_TABLES → 13 tables/request.
- **F · Special Event FC:** 100% (never target-adjusted), assigned ONCE to prep month (eventStartDate − 30d),
  scoped+active. Monthly demand = adjusted regular + special.
- **D · Current-month remaining (PRE-T1):** `KMPD.currentMonthRemainingDemand` = adjusted current-month FC ÷ real
  days-in-month × days AFTER RECOMMENDATION_CALCULATION_DATE + prep-in-window special; consumed BEFORE T1 (tier=null
  event at current-month end; reduces T1 opening; surfaced additively as `line.currentMonthRemaining`).
- **DTO (additive):** per tier `openingDestinationSupplyQty`, `qualifiedIncomingQty`, `destinationGapQty`,
  `overseasCoveredQty`(0), `factoryCoveredQty`(0), `residualOrderNeedQty` (= destinationGap − overseas − factory);
  `suggestedOrderQty` = cartonized RESIDUAL new-order need. Existing fields byte-compatible. horizons consume the
  same adjusted+special demand (KMHP gained additive `specialEventDemands`).
- **CO1100-R corrected:** Site Stock 7374; pre-T1 Aug 8–31 = 2400 → T1 opening 4974; **T1 Sep 7000 → destinationGap
  2026, suggested 2040** (replaces wrong 1714); T2 4282; T3 7500; T4 0. Bundle 33 modules; `--check` PASS;
  bundle_sha256 `b1fc01ad2d9e16cc77b56f7d0d2abc32a82b8549276cd8ab15fab091381cf33d`.
- **Commit 2 (next, authorized, within-request):** B overseas + C factory allocation (deterministic, read-only,
  source consumed ≤ once per request; no persistent reservation) → overseasCoveredQty/factoryCoveredQty > 0,
  residualOrderNeedQty < destinationGap. Inventory Replenishment vs Order Planning stay distinct models (numbers not
  reconciled).

## D-F1-4B-FM4b-R — Transport safe-parse recovery + Inventory Horizon Summary consumer cutover (frontend only)

Two frontend-only fixes; NO formula/runtime/DTO/bundle/Apps-Script change. Neither file is bundled into Apps Script,
so there is **no bundle rebuild and no Apps Script sync** — GitHub Pages deploy only.
- **Transport (root cause of live `Unexpected token '<' … TRANSPORT_ERROR`):** the Workspace invoke did a blind
  `resp.json()`, so any HTML body (Apps Script login/redirect/exception page, stale/wrong deployment, or a GitHub
  Pages fallback page) surfaced as an opaque `SyntaxError`. Fix: `km-api-foundation.js` now reads the body as **text**
  and, on a non-JSON/HTML body, throws the canonical **`TRANSPORT_NON_JSON_RESPONSE`** carrying ONLY safe diagnostics
  (HTTP status, Content-Type, sanitized ≤200-char prefix) — never full HTML, never a secret. Valid JSON is unchanged.
  The `<!DOCTYPE>` itself is a **deployment/access** condition (USER action: confirm the Web App `/exec` URL, redeploy
  a current version, and set access to "Anyone"); the router already registers `recommendation.workspace.get`.
- **Inventory FM4b UI cutover:** Inventory Replenishment now consumes the server-owned **`line.horizons[]`
  (D18/D30/D45/D90)** as the PRIMARY decision surface — Window / Required By / Demand / Covered / Gap / Suggested
  rendered verbatim (no page math, no `Math.*`, cumulative windows NEVER summed), valid `0` → "0", missing → "—",
  blocked truthful, one subsection per MARKETPLACE / WAREHOUSE destination (never pooled). The old technical table
  (Destination/Mode/Demand-Gap/Stock/Incoming/Recommended/Status/Reason) is DEMOTED verbatim under
  `<details>Diagnostics</details>`. Session cache preserves horizons with zero refetch.
- **Top-table Suggested Qty owner UNCHANGED:** still `_irAggregateActionableRecommendedQty` (Σ actionable canonical
  `recommendedQty`, FM3a) — NOT a sum of horizon gaps. Order Planning monthlyProjection + manual Order Qty untouched.

## D-F1-4B-FM5 — Materialized Gap tables + manual all-site batch recalculation

Moves Inventory Replenishment / Order Planning toward READING precomputed DB results instead of recomputing on
expand. New server owner `43_api_v1_gap_materialization.gs` (NOT bundled) + router actions
`inventoryReplenishmentGap.recalculate.all` / `orderPlanningGap.recalculate.all`. NO new formula, NO second
engine, NO browser math, NO Inventory↔Order convergence — it reuses the canonical calc
(`handleRecommendationWorkspaceGet_` → KMHP horizons / KMTPP monthlyProjection).
- **Two USER-CREATED tables (no schema change this round):** `inventory_replenishment_gap` (D18/D30/D45/D90 gap+
  suggested) and `order_planning_gap` (T1–T4 month+gap+suggested). Business key = company+country+marketplace+sku;
  **latest result only, bounded UPSERT, no history**. Fails CLOSED via `prodRequireSheet_` (S0.5 validate-only) if
  the table/header is missing — never auto-creates/repairs.
- **Status semantics:** READY | BLOCKED | ERROR. READY+0 = canonical valid zero; BLOCKED/ERROR leave qty blank.
  **missing/unresolved NEVER becomes 0.** `note` carries the concise canonical token.
- **Multi-warehouse:** each destination calculated INDEPENDENTLY by the frozen runtime (warehouse isolation); the
  site row = **SUM** of per-destination window/tier results. Materialization AGGREGATION, never inventory pooling.
  Destination routing stays Execution Plan authority and is NOT stored in the gap tables.
- **Manual batch:** one "Recalculate All Sites" button per page → `KM.DB.recalculate*GapAll()` (canonical text-first
  command runner) → ONE bounded server batch (enumerate scopes → ONE canonical read per scope → batched UPSERT).
  **Never a per-SKU HTTP loop.** Timestamps: calculation_date/month from frozen config authority (server, not
  clock); calculated_at/updated_at = batch write time. Writes ONLY the two gap tables.
- **Read cutover = NOT YET (bounded):** the write path + manual button ship now; the page render still uses the live
  runtime. Materialized-read render cutover (behind an explicit flag, materialized primary) is the next slice.
- **Scheduler audit:** entry `runAmazonSnapshotImports()`; only `amazon_daily_sales_snapshot` has a `scheduleTime`
  (16:00 Asia/Taipei); **NO `ScriptApp` time-trigger and NO recommendation/warning/Monday/Order-Planning scheduler
  exist in the repo mirror (UI-owned).** No scheduler created this round (documented cadence only): 12:00–13:00
  import → 13:10 Inventory Gap batch → 13:20 alerts → Mon 13:30 shipping reco (after that day's gap) → 15:00–16:00
  Order Planning gap. Preferred long-term: import-success → invalidate affected scopes → recalc, not wall-clock.

## D-F1-4B-FM6 — Replenishment Outlook FROZEN primary + UI layout containment (frontend only)

Implements the FM4c presentation freeze and the UI LAYOUT HARD RULE. Frontend-only (inventory-replenishment.js +
.css); NO formula, NO runtime/DTO/bundle/Apps-Script change.
- **FROZEN primary surface** = the compact `Window | Gap | Suggested Qty | Note` table ONLY
  (`_irRecoHorizonOutlookTableHtml`). `Required By` is a subtle sub-line under Window (not a column); `Note` is a
  truthful per-window state derived ONLY from the canonical gap (`No shortage` / `Replenishment required`; missing
  → `—`) — no page formula. Destination / Mode / Demand / Covered / Stock / Incoming / Status / Reason are NOT
  primary columns.
- **Technical detail DEMOTED to Diagnostics:** the full 6-column horizon detail (Required By / Demand / Covered /
  Gap / Suggested) + the legacy destination table live under the collapsed `<details>Diagnostics`.
- **Containment HARD RULE:** the result always stays inside the expanded-SKU card. `.replen-recsum-ws` max-width
  100%; the outlook table + every wide diagnostics table are wrapped in an `overflow-x:auto` container
  (`replen-horizon-tablewrap` / `replen-recsum-ws__scroll`) so a very large number or a narrow viewport scrolls
  INTERNALLY, never overflowing the card. Numeric Gap/Suggested cells are right-aligned `nowrap`; the `Note` cell
  is `max-width`-bounded with `overflow-wrap:anywhere/word-break` so a long Note never determines table width; long
  blocked/na reason + canonical error tokens word-break inside their own containers.
- Tests: inventory-outlook-containment-f1-4b-fm6 (NEW, 33) — states A–H (normal / large qty / long reason /
  MARKETPLACE_STOCK_MISSING / HORIZONS_NOT_AVAILABLE / all windows / Diagnostics / long error) + CSS containment
  rules. All prior Inventory tests unchanged (Demand/Covered/Required By now assert against the Diagnostics detail).

## D-F1-4B-FM5-R1 — Materialized gap READ cutover + root-cause proofs (UK stock / US horizons)

Cuts both pages over to reading the FM5 materialized gap tables as the PRIMARY display; live
recommendation.workspace.get is demoted to batch owner + diagnostic/fallback. NO formula change, NO scheduler,
NO Overseas/Factory allocation, NO AI-Plan/Execution-Plan change.
- **New READ owners (43_, NOT bundled):** `inventoryReplenishmentGap.get` / `orderPlanningGap.get` — bounded
  scope read (company+country+marketplace(+sku)); stored rows returned VERBATIM (valid 0 stays 0; blank stays
  blank → UI "—", never a fabricated 0); fail-closed via `prodRequireSheet_`. KM.DB readers
  `getInventoryReplenishmentGap` / `getOrderPlanningGap` are text-first + fail-safe (never silently fall back to a
  browser calc).
- **Flag `USE_MATERIALIZED_GAP_READ` (default true):** changes READ SOURCE only — not a second engine.
  Inventory: expand renders the frozen Replenishment Outlook from the stored row (gap-row → horizons shape → the
  frozen `_irRecoHorizonOutlookTableHtml`); NO live workspace call on expand; states READY / NOT_CALCULATED /
  BLOCKED / READ_ERROR / STALE. Order Planning: expand reads stored T1–T4 (synthesized monthlyProjection →
  existing patch); NO getWorkspace; manual Order Qty / Carton / Note untouched; no writable T4. Both live-path
  test suites stay green because the delegation is gated on the reader being present (tests stub only KM.api).
- **Manual recalc:** after the FM5 batch succeeds, the materialized-read cache is invalidated + refetched (no page
  reload, no per-SKU live calc).
- **UK / Amazon / CO1100-R root cause (PROVEN, repair scoped as its own slice):** the canonical stock reader
  `KMDR.resolveMarketplaceCurrentStock` matches the snapshot by EXACT `eqv(country)` + `eqv(marketplace)`, but
  `amazon_inventory_snapshot` stores `country='GB'` for the UK market and `marketplace` defaults to `'Amazon'`;
  the page matches with the alias-aware `IRCountry` (UK≡GB). FIRST divergence = **country alias**. The only alias
  authority (`IRCountry`, inventory-compat.js) is FRONTEND-ONLY — there is NO country-alias authority in the
  server/bundle runtime. Mirroring it into KMDR is a bundled change (bundle rebuild + broad test/Apps-Script
  impact) and is deferred to its own micro-slice (FM5-R1b) rather than folded into this read-cutover commit —
  reported, not invented, not patched in the page.
- **US / Amazon / CO1100-R HORIZONS_NOT_AVAILABLE (PROVEN, FM4c):** deployment/config gate — stale deployed
  handler/bundle (pre-FM4a) and/or unset `RECOMMENDATION_CALCULATION_DATE` (additive gate → `line.horizons`
  omitted). NOT a DTO/consumer defect. USER action: sync current 33-module bundle + handler, set the Script
  Property. A CONFIG_NOT_READY condition is never shown as DATA_MISSING.
- **Aggregation authority (Goal 4):** site/SKU SUM of per-destination D18–D90 / T1–T4 is CORRECT under the frozen
  warehouse-isolation authority (stock A can never cover B → independent shortages sum), cited by the FM5 batch
  test + the cutover-b "distinct per-warehouse, never merged" assertions. Single-destination Marketplace is a
  1-element sum (unchanged). Preserved, not changed.

## D-F1-4B-FM5-R1b — Canonical country identity owner (UK ≡ GB) for runtime matching

Repairs the one FM5-R1 canonical defect: the domain/scope spells the market `UK` while
`amazon_inventory_snapshot` stores the ISO code `GB`, so the exact-equality runtime matcher returned
MARKETPLACE_STOCK_MISSING for UK sites. NO Inventory-only special case, NO scattered `UK||GB` checks — ONE owner.
- **New bundled owner KMCID** (`supply-planning-country-identity.js`, VERSION `kmcid-fm5r1b-1`, no deps) mirrors the
  FROZEN frontend authority `IRCountry.SAME_MARKET_ALIAS = { UK:[UK,GB], GB:[UK,GB] }`. Deterministic canonical
  code = the ISO value **GB** (IRCountry documents "GB is the ISO code"), applied identically to both operands:
  `canonicalCountryCode('UK')='GB'`, `countryMatches('UK','GB')=true`; every other code is exact/unchanged
  (`US↔US`, `DE↔DE`); blank on either side → false; NO EU aggregation (identity only). Identity resolution only —
  NEVER rewrites stored DB values.
- **Applied to identity matching only:** `KMDR.resolveMarketplaceCurrentStock` now matches the snapshot country via
  `KMCID.countryMatches` (`countryEqv`); marketplace + sku stay EXACT. It is the only raw source-row country
  comparison in the runtime (incoming/destination identity resolve via the marketplaces table, which uses the
  domain `UK` on both sides — no divergence). Falls back to exact equality when KMCID is absent (a unit test that
  requires KMDR in isolation → unchanged legacy behavior).
- **Site Stock authority UNCHANGED:** still `available + fc_transfer + fc_processing` (customer orders + unsellable
  excluded; missing ≠ 0; explicit 0 stays 0). Regression (fixture only, never hard-coded): UK scope + GB snapshot
  `233 + 1 + 0 = 234`; the materialized batch no longer returns MARKETPLACE_STOCK_MISSING for the UK/GB fixture.
- **Bundle rebuilt** (KMCID added first in load order): **34 modules**, `--check` PASS,
  `bundle_sha256 91fefda1cbd1ef561a3d869ed356939955e39666be9d054b35dadc2e87e356bc`. US HORIZONS_NOT_AVAILABLE
  (deployment/config) is untouched — this is the country repair only.

## D-F1-4B-FM5-R2A — MARKETPLACE-receiver monthly supply-allocation contract (model b)

Freezes the marketplace-receiver allocation contract chosen in FM5-R2 (model b): a platform_fulfilled MARKETPLACE
is a valid MONTHLY_ORDER receiver of the eligible Overseas / Factory shared pools, WITHOUT a destination warehouse.
New bundled adapter **KMMSA** (`supply-planning-marketplace-supply-allocation.js`, `kmmsa-fm5r2a-1`; deps: KMALLOC +
KMCID). It is a thin DTO adapter — ALL distribution math stays in the frozen `KMALLOC.allocateOverseasSharedPool`
(§20/§24) and `KMALLOC.allocateFactoryDeterministic` (§35); the adapter only normalizes receiver facts + pools
into the allocator DTOs and reads each receiver's allocated qty back.
- **No fake warehouse:** the allocator-required `destinationWarehouseId` field carries the canonical RECEIVER KEY
  (company‖canonicalCountry‖marketplace‖sku identity label), NEVER a physical warehouse and NEVER a
  marketplace→warehouse mapping. Country identity uses KMCID (UK ≡ GB).
- **Frozen decisions (D-FM5-R2A-1..3):** (1) MONTHLY protection mapping — `survivalNeedQty` defaults 0 (18-day
  survival is a WEEKLY concept), `demandWeight` defaults to `demandQty` (proportional split); a caller MAY override
  both when a frozen value exists (passthrough). (2) Waterfall (frozen FM3f-1: … → Overseas → Factory → Residual):
  overseas allocated first, factory demand per receiver = `max(0, demandQty − allocatedOverseas)` (input
  normalization, not distribution). (3) Company isolation — all receivers/pools in one call MUST share the company
  (cross-company → BLOCKED); no cross-company pooling. eligiblePoolTypes defaults [THREE_PL, FBA].
- **Conservation** (KMALLOC-owned): Σ receiver allocations ≤ eligible physical pool; proven by fixture (factory
  1000, US 600 + CA 400 = 1000; neither sees the full 1000). **Lineage:** the caller supplies pools ALREADY net of
  SHIPPED_IN_TRANSIT (canonical source-fact lifecycle); the adapter never re-derives duplication by qty guessing.
- **Scope:** R2A ships the CONTRACT owner + unit tests only (19 assertions). **R2b** wires KMMSA into the Order
  Planning batch: source-fact lineage-net pool construction (reusing KMSF), the competing-receiver set, per-receiver
  KMTPP opening-supply composition (Site Stock + allocated Overseas + allocated Factory), and order_planning_gap
  materialization + the CO1100-R end-to-end trace. Inventory D18/D30/D45/D90 and all formulas untouched.
- Bundle rebuilt (KMMSA after allocations + country-identity): **35 modules**, `--check` PASS,
  `bundle_sha256 01ece8dc2a7678f43e8ec609f2b37d3e56d3dc6696f2b6a69bc63810b2db1bed`.
