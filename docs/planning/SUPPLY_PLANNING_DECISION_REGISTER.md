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

### D-F1-4B-FM5-R2A (supplemental freeze) — receiver-count rule + independent pools

Supplements/overrides the FM5-R2A defaults with the frozen business authority:
- **Receiver-count rule:** 0 eligible receivers → allocate NOTHING (ready, empty; no fabricated destination);
  exactly 1 eligible receiver → it receives **100% of the eligible pool** (deterministic single-receiver case, a
  direct assignment respecting overseas lane eligibility + factory warehouse eligibility — NOT KMALLOC's demand
  cap, NOT a new formula); >1 → the canonical KMALLOC allocator (demand-capped, conserved).
- **Overseas + Factory are INDEPENDENT pools** — each allocated on the receiver's own demand and INDEPENDENTLY
  conserved. This **supersedes the earlier FM5-R2A "overseas→factory residual (waterfall)" default** (decision 3);
  there is no residual sequencing between the two pools.
- **Eligible receiver set is SKU-specific** (caller-owned via marketplace_skus in R2b): a marketplace not carrying
  the SKU is not a competing receiver.
- Company/SKU/lane eligibility + KMCID country identity (UK ≡ GB) + lineage-net pools (caller-supplied; adapter
  never guesses by SKU+qty) all preserved. `receiverCount` is surfaced on the result.
- Bundle rebuilt: 35 modules; `--check` PASS; `bundle_sha256 41d64956a28ad4a774bf5792cfec4436435d56fc54f2a3c56a66d8c0758a678f`.
- **R2b (unchanged scope):** wire KMMSA into the Order Planning batch — SKU-specific receiver set +
  KMSF lineage-net pool construction + per-receiver KMTPP opening (Site Stock + allocated Overseas + allocated
  Factory) + order_planning_gap + CO1100-R end-to-end trace. If the repo cannot source-prove the shipped-lineage
  transition for a source path, HALT only that path and report the missing field/table (never invent a deduction).

### D-F1-4B-FM5-R2b — Order Planning MONTHLY supply-allocation runtime integration (KMMSA wired end-to-end)

Wires the frozen KMMSA marketplace-receiver contract (FM5-R2A + supplemental) into the Order Planning batch so a
MONTHLY marketplace receiver's opening supply = **Site Stock + allocated eligible Overseas + allocated eligible
Factory** (§1/§7). Additive only; no new allocator; no Inventory change; no scheduler; no DB/schema change.

- **Competition-scope decisions (user-frozen this round):** (1) **Overseas = per (company, canonical country)** —
  the frozen `KMALLOC.allocateOverseasSharedPool` requires a single country and R2b forbids a new allocator, so one
  overseas 3PL pool is conserved only among same-country marketplaces; **Factory = company-wide** (`FACTORY_SHARED`,
  `allocateFactoryDeterministic` is country-agnostic). (2) **Overseas allocatable pool = THREE_PL only** — FBA current
  stock IS the marketplace Site Stock (`amazon_inventory_snapshot`), so including it would double-count; overseas pool
  is `overseas_inventory_snapshot` 3PL current stock only. Overseas + Factory stay INDEPENDENT pools, independently
  conserved (supersedes no waterfall).
- **Lineage-net BY SOURCE CONSTRUCTION:** only the current-stock snapshots enter the pool; a quantity transitioned to
  `SHIPPED_IN_TRANSIT` lives in `shipments` (surfaced ETA-dated as qualified incoming), never in these snapshots — so
  NO heuristic subtraction and NO SKU+qty dedup (§4/§5/§16). The same physical lineage is never counted twice (§8).
- **Source authorities (all frozen / DB-confirmed / derived-upstream):** receiver set = `marketplace_skus`
  (platform_fulfilled, active/plannable); `allocation_priority` = `marketplaces.allocation_priority` (§20.4);
  `eligibleFactoryWarehouseIds` = `warehouses.is_factory_warehouse` (§40/§35); overseas eligibility = `warehouses`
  3PL+active join (§23.6/§24.9); Site Stock owner unchanged (Authority A); demand reused verbatim (KMPD; §9).
- **Owners:** `recoWsComposeOpeningSupply_` (42; PURE opening-supply composition — addition only, no allocation math);
  `gapOpReadSupplyPoolFacts_` + `gapOpBuildSupplyAllocation_` + rewritten `handleRecalculateOrderPlanningGapBatch_`
  (43; harvest competing set → allocate shared pools ONCE conserved → re-project per receiver with injected
  allocation → UPSERT `order_planning_gap`). Injection is additive `payload.supplyAllocationByReceiver` (absent →
  Site-Stock-only monthly opening, byte-identical to pre-R2b; Inventory D18/D30/D45/D90 opening stays Site-only).
- **Tests:** `order-planning-supply-allocation-f1-4b-fm5r2b` (40 assertions, A–AD). `gap-materialization-f1-4b-fm5`
  N1 updated to the R2b authority (batch legitimately READS factory_stock + overseas_inventory_snapshot; still writes
  only the gap tables). Bundle UNCHANGED (no core-module edit): 35 modules, `41d64956…`, `--check` PASS.
- **Documented limitation (remaining blocker):** cross-company FACTORY_SHARED pool conservation is per-company (each
  real company's batch sees the full shared factory pool); only relevant if multiple real companies draw the same
  physical factory pool — requires a separate freeze if that becomes live (KM is currently the sole company).

### D-F1-4B-FM5-R2b (supplemental) — fulfillment-stock owner freeze (MARKETPLACE vs self_fulfilled/WAREHOUSE)

Audit-first verification of the opening-stock authority per fulfillment mode; the existing paths ALREADY satisfy the
invariant, so this is a regression-lock (no code change), preserving the frozen distinction:

- **Resolver:** `recoWsResolveFulfillment_` (42) — `marketplaces.fulfillment_model`: platform_fulfilled → MARKETPLACE,
  self_fulfilled → WAREHOUSE, else DESTINATION_AUTHORITY_UNRESOLVED (never guessed).
- **PLATFORM_FULFILLED opening owner = the frozen Amazon Site Stock owner** `KMDR.resolveMarketplaceCurrentStock`:
  `amazon_inventory_snapshot.available_qty + fc_transfer_qty + fc_processing_qty`; customer orders + unsellable
  EXCLUDED; any warehouse-identified row EXCLUDED (so FBA/3PL/factory is never re-added as Site Stock). available_qty
  missing → missing (never a fabricated 0); explicit 0 → 0. R2b Overseas/Factory allocation is composed SEPARATELY
  (THREE_PL pool excludes FBA) — no re-add of FBA through the Overseas pool.
- **self_fulfilled/WAREHOUSE opening owner = `recoWsWarehouseOpeningStock_` (42)** = Σ the warehouse's OWN
  `CURRENT_STOCK` lifecycle rows (KMPS `supplySourceEntries`), filtered to its own `warehouse_id`; NOT the Amazon
  formula. Each warehouse is projected INDEPENDENTLY by KMTPP (warehouse isolation); the SITE row is the SUM across
  the per-warehouse lines in the materialization aggregation (`gapOpMapFromLines_`, 43) — summed ONLY AFTER each
  warehouse is independently projected, never pool-then-invent. Valid-zero → 0; missing → null (KMTPP fails closed).
- **Conservation:** each physical warehouse's stock is attributed to exactly one `warehouse_id`/destination line, so a
  site receives only its own warehouses' stock (WH-A 600 + WH-B 400 = Site X 1000, matching the frozen example). NO
  Amazon-formula leak into the self_fulfilled path (verified: the WAREHOUSE expander never references
  amazonInventory / resolveMarketplaceCurrentStock / available_qty·fc_transfer·fc_processing).
- **Regression lock:** `self-fulfilled-opening-stock-f1-4b-fm5r2b` (17 assertions). No code change; no new formula.
- **Documented boundary:** a single physical warehouse SHARED across multiple self_fulfilled marketplace receivers is
  outside the frozen warehouse-isolation model; were it to become live, it would need the same cross-scope conserved
  allocation as the R2b marketplace Overseas/Factory pools (a separate freeze) — analogous to the cross-company
  FACTORY_SHARED boundary. Not present in the current model (warehouse = one destination).
- **SUPERSEDED (hybrid clause only), F1-7N-D-2h:** the `else DESTINATION_AUTHORITY_UNRESOLVED` branch of the resolver
  bullet above is superseded FOR `fulfillment_model = 'hybrid'` by decision **D-F1-7N-D-2h** below (per-SKU
  resolution). The platform_fulfilled → MARKETPLACE and self_fulfilled → WAREHOUSE mappings, and the fail-close for a
  truly unknown/blank marketplace-level model, remain frozen and unchanged.

### D-F1-7N-D-2h — Hybrid marketplace destination is PER-SKU; self_fulfilled destination grain is warehouse-level (USER-approved)

USER-approved business authority (F1-7N-D-2h). Supersedes ONLY the hybrid fail-close of D-F1-4B-FM5-R2b.

- **Hybrid destination is PER-SKU, not per-marketplace.** A marketplace-level `fulfillment_model = 'hybrid'` does NOT
  itself determine the destination; the canonical decider is the SKU-level `marketplace_skus.fulfillment_model`:
  `self_fulfilled → WAREHOUSE`, `platform_fulfilled → MARKETPLACE` (frozen logical marketplace_id destination, no
  fabricated warehouse), `hybrid | blank | unknown` (a SKU genuinely using both lanes) → `DESTINATION_AUTHORITY_UNRESOLVED`
  (fail-closed; no split invented — explicit lane-allocation authority is still undefined). A single hybrid marketplace
  may therefore emit BOTH a WAREHOUSE lane and a MARKETPLACE lane for different SKUs; the whole marketplace is never
  classified as one destination type.
- **Owner (narrow, additive):** the per-SKU effective mode is resolved inside `handleRecommendationWorkspaceGet_`'s
  SKU loop (42), consulting `recoWsFulfillmentModelBySku_` ONLY when the marketplace-level model is 'hybrid'. The shared
  `recoWsResolveFulfillment_` is UNCHANGED; every non-hybrid marketplace keeps its exact prior mode + fulfillment model
  (no Site-Inventory / Gap / order-planning / monthly behavior change). No marketplace-name / country / warehouse-name
  heuristic; no new K3 axis; FBA logical destination authority unchanged.
- **Self_fulfilled destination grain = warehouse-level.** Each destination warehouse is an INDEPENDENT inventory / gap /
  replenishment node. `replenishment_demand_allocation_rules` distributes FC/Sales demand BETWEEN warehouses (e.g.
  WH-A 0.3 / WH-B 0.7 of demand 100 → 30 / 70), and each warehouse computes its own stock/gap; warehouse inventory is
  never pooled and the split conserves total demand exactly once. `SINGLE_WAREHOUSE_RULE_POLICY = EXPLICIT_1_REQUIRED`:
  the frozen validator fail-closes (`DEMAND_ALLOCATION_RULE_NOT_CONFIGURED`) on zero rows — there is NO implicit 1.0
  single-warehouse fallback (D-F1-4B-E0R-3 forbids defaulting). A hybrid marketplace's self_fulfilled SKUs therefore
  require allocation-rule rows for that scope; its platform_fulfilled SKUs do NOT (they resolve MARKETPLACE directly).
- **Tests:** `weekly-ai-plan-hybrid-per-sku-destination-f1-7n-d-2h-r1` (25). No allocation formula / §7 / survival /
  incremental / carton / source-priority / K3 / count-once / monthly change. Handler-only (42; not bundled) → no bundle
  rebuild; `APPS_SCRIPT_SYNC_REQUIRED` for 42.

### D-F1-7N-D-2i-R1 — Planning destination ≠ physical shipment warehouse; allocation rules ARE the self-fulfilled membership authority (USER-approved)

Planning/recommendation destination and shipment-execution destination are SEPARATE concepts (USER-frozen, F1-7N-D-2i).

- **Self_fulfilled planning-destination membership = active `replenishment_demand_allocation_rules` rows only.** The
  runtime already enforces this: `recoWsExpandWarehouse_` (42) plans ONLY to `ruleset.warehouses` (the warehouses named
  by active rules for the scope), never by enumerating the `warehouses` table. Mere presence in `warehouses` — even
  `active + same-company + non-factory` — does NOT create a planning destination. So the allocation-rule table is a
  sufficient explicit membership authority; **no per-warehouse "planning-eligible" schema field is needed** (CASE B).
  No runtime/schema change — this decision records the existing correct behavior and corrects misleading wording.
- **`warehouses` intentionally holds physical marketplace/FBA FCs** (e.g. `WH-KM-US-FBA-ONT8`/`-ABE2`/`-AMAZON`, ~86 for
  KM/US) retained ONLY for **Shipment Draft / shipment-execution** candidate selection (`SHIPMENT_CENTER_SPEC` FBA
  filter `warehouse_type='FBA'`). They MUST NOT be inferred as self-fulfilled planning destinations. Weekly recommends
  a logical destination (`CN → Amazon`), never a physical FC grain (`CN → Amazon ONT8`).
- **Grains re-proved:** PLATFORM `(company,country,marketplace,sku) → logical MARKETPLACE` (no rule; FC deferred to
  shipment). SELF `(company,country,marketplace,sku,destination_warehouse_id) →` one INDEPENDENT inventory/gap/
  replenishment node per rule-configured warehouse (ratios split DEMAND, not inventory; conserve once; never pooled).
  HYBRID per-SKU into one of the above (D-F1-7N-D-2h).
- **Consequence for KM/US:** only the self warehouse(s) a user configures in rules participate — NOT all 88 warehouses.
  Amazon/Newegg (platform) and the Walmart platform lane need NO rows; Shopify/Target and the Walmart self lane (2 SKUs)
  need rows only for their explicitly-chosen self warehouse(s) (the 2 KM 3PL nodes `WH-KM-US-3PL-AMZLGS` / `-WINIT`).
- **Correction:** `REPLENISHMENT_DEMAND_ALLOCATION_RULES_SPEC.md` §3a added (membership authority) and §5 example fixed
  (was a stale Amazon warehouse-split example; Amazon is platform_fulfilled → no rule). Docs-only; no code/DB change.

### D-F1-7N-D-2j — Site Inventory Warehouse Allocation config UX + first canonical rule writer (USER-approved)

USER-approved Phase-1 edit surface (F1-7N-D-2j): warehouse demand-allocation ratios are editable from **Site Inventory
→ More Options → Warehouse Allocation** — no code change, no manual spreadsheet maintenance. SSOT is unchanged:
`replenishment_demand_allocation_rules` (D-F1-7N-D-2i-R1); this adds the FIRST canonical writer for it.

- **Config grain** = `(company, country, marketplace)`; applies ONLY to SELF_FULFILLED demand. Platform lanes use no
  rules; a HYBRID marketplace's per-SKU self lanes consume them, its platform lanes stay logical MARKETPLACE (D-2h).
- **Writer** = router action `replenishmentDemandAllocation.save` → `handleReplenishmentDemandAllocationSave_` (03),
  LockService-serialized, mirroring `handleUpsertMarketplace_`. Scope-safe reconciliation: upsert selected warehouses
  (status=active, ratios, effective_from, version+1) and **deactivate (never delete)** previously-active scope rows no
  longer selected (status=inactive, effective_to=today). PURE planner `replenDemandAllocationPlan_` (Node-verified).
  Enforces the frozen ratio contract (forecast & sales each sum to exactly 100%) and REJECTS execution/source
  destinations (`warehouse_type` ∈ {FBA, RETURN, FACTORY} or `is_factory_warehouse`) — admitting 3PL and future
  non-execution self types (exclusion, not a 3PL-only inclusion). Read served client-side from the loaded cache
  (`getReplenishmentDemandAllocationRules`); no new read action.
- **Picker candidate authority (Phase-1, convenience only):** the modal OFFERS the frozen 3PL-inclusion set
  (`warehouse_type='3PL' + active + company + country`, mirroring `eligible3plWarehouses`/§23.6) UNIONed with
  warehouses already referenced by active rules (so current membership is never hidden). FBA/RETURN/FACTORY execution
  FCs are excluded from the picker. This is a UI candidate filter, NOT the membership authority (rules remain the SSOT).
- **PHASE-2 FOLLOW-UP (not built):** the picker's 3PL-inclusion filter cannot surface a future **self-operated,
  non-3PL** inventory warehouse as an option; per `SHIPMENT_CENTER_SPEC.md:1216`/`WAREHOUSE_OPERATIONS_SPEC.md:126` a
  durable warehouse planning-eligibility authority (`is_receiving_enabled` / `is_selectable_for_shipment`, PROPOSED /
  NOT IMPLEMENTED) should replace the type-name filter in Phase-2. Until then such a warehouse is reachable only by
  adding its rule row directly (the SAVE writer already admits it; only the picker omits it).
- **Single-warehouse:** UI convenience auto-fills 100/100 but SAVE persists an EXPLICIT `1.0/1.0` row
  (`SINGLE_WAREHOUSE_RULE_POLICY = EXPLICIT_1_REQUIRED`; never a runtime fallback).
- **No** allocation formula / §7 / survival / incremental / carton / source-priority / K3 / count-once / FBA-logical /
  monthly change; recommendation stays draft-only (no RO/PO/shipment/inventory mutation; no schema change). After Save
  the UI advises "Recalculate this scope to apply" — never auto-launches a batch. Tests:
  `warehouse-allocation-config-f1-7n-d-2j-r1` (35). Changed: `03_master_data_handlers.gs`, `01_router.gs`,
  `operation-system-db-api.js`, `inventory-replenishment.js/.html` → `APPS_SCRIPT_SYNC_REQUIRED` (03/01) +
  `FRONTEND_DEPLOY_REQUIRED`; no bundled core changed → no 90_ rebuild.
- **SUPERSEDED (storage owner only) by D-F1-7N-D-2k-R1:** the SSOT storage moved from the
  `replenishment_demand_allocation_rules` Sheet tab to the `KM_WAREHOUSE_ALLOCATION_CONFIG` Script-Property blob. The
  edit surface, grain, ratio contract, picker authority, single-warehouse policy, and Phase-2 follow-up above are all
  UNCHANGED — only the persistence medium and the modal's read path changed.

### D-F1-7N-D-2k-R1 — Warehouse Allocation persists in a Script-Property config (no user-managed Sheet tab); rule MODEL preserved (USER-approved, CASE B)

USER DECISION (F1-7N-D-2k): Warehouse Allocation ratios are configured through the Operation System UI (Site Inventory
→ More Options → Warehouse Allocation) but must **NOT** require a user-managed `replenishment_demand_allocation_rules`
Google Sheet tab. The setting must still be persistent AND backend/scheduler-readable (Weekly AI Plan + scheduled
automation consume the same settings) — never browser-only.

- **Audit → chosen owner:** the only existing config storage suitable for shared operational settings that are
  backend-writable AND readable by time-driven triggers with no browser session is `PropertiesService.getScriptProperties()`
  (precedent: `45_api_v1_automation_schedule.gs` — one JSON blob under `KM_AUTOMATION_SCHEDULE_CONFIG`, read headlessly
  by triggers). There is no generic settings sheet/table/API and no key/value config owner. So a NEW dedicated
  Script-Property key `KM_WAREHOUSE_ALLOCATION_CONFIG` (owner `50_api_v1_warehouse_allocation_config.gs`) mirrors that
  pattern. Classification **A** (shared operational config).
- **CASE B (reconciliation):** the frozen KMDA engine (`supply-planning-demand-allocation.js`) is intrinsically
  ROW/ruleset-oriented (cross-row ratio-sum = 100%, per-warehouse fan-out, largest-remainder) but STORAGE-AGNOSTIC —
  it consumes an INJECTED array of flat rule rows (`_toRuleRow` accepts snake OR DB-normalized camel). So the RULE
  MODEL is unchanged; only the STORAGE OWNER moved. The blob is materialized on read into the SAME snake-case rule
  rows (`warehouseAllocationConfigToRuleRows_`). NO calc-core edit; no 90_ bundle rebuild.
- **Config shape (blob):** `{ version:1, scopes:{ "<CO>||<COUNTRY>||<MKT>": { company, country, marketplace,
  warehouses:[{ warehouse_id, forecast_ratio, sales_ratio }], updated_by, updated_at } } }`. One scope = one
  `(company,country,marketplace)`; SELF_FULFILLED only. Single warehouse still persists EXPLICIT `1.0/1.0`.
- **Write** = SAME router action `replenishmentDemandAllocation.save` → `handleReplenishmentDemandAllocationSave_` (03),
  LockService-serialized. It still reads the `warehouses` sheet to VALIDATE destinations via the unchanged PURE planner
  `replenDemandAllocationPlan_` (canonical/active/same-company/non-execution, ratios 100%), then REPLACES the scope's
  membership in the blob atomically (`warehouseAllocationUpsertScope_`); unselected warehouses are dropped. No Sheet-tab
  read/write remains.
- **Read (modal hydrate)** = NEW router action `warehouseAllocation.get` → `handleWarehouseAllocationConfigGet_` (50);
  frontend `getWarehouseAllocationConfig(scope)` (scope-targeted backend fetch, NOT the whole-DB cache). The modal open
  is now async.
- **Server planning authority (SINGLE):** `handleRecommendationWorkspaceGet_` (42) is the SOLE caller of
  `recoWsExpandWarehouse_`; at its ONE read boundary it OVERRIDES the `replenishmentDemandAllocationRules` snapshot with
  the config-materialized snapshot (`warehouseAllocationSnapshot_`) before expansion. Every planning path (workspace GET,
  Gap batch, headless scheduled Weekly AI Plan) therefore reads the identical config with no browser session. The
  expander stays storage-agnostic; the retired Sheet snapshot is discarded, never read → **no second authority**.
- **Migration/compat:** production `replenishment_demand_allocation_rules` sheet never existed → no data to migrate.
  The bundled `CANONICAL_TABLES` registration for that key is left in place but INERT for planning (its snapshot is
  overridden). No schema change, no DB migration.
- **Unchanged:** D-2h hybrid per-SKU, FBA logical-destination authority, count-once, survival, §7, incremental windows,
  source priority, carton, K3, Monthly Order. No RO/PO/shipment/inventory side effect; no browser/localStorage
  persistence. Tests: `warehouse-allocation-config-persistence-f1-7n-d-2k-r1` (35) + `warehouse-allocation-config-f1-7n-d-2j-r1`
  (35, still green). Changed: NEW `50_api_v1_warehouse_allocation_config.gs`, `03_master_data_handlers.gs`, `01_router.gs`,
  `42_api_v1_recommendation_workspace.gs`, `operation-system-db-api.js`, `inventory-replenishment.js` →
  `APPS_SCRIPT_SYNC_REQUIRED` (50/03/01/42) + `NEW_EXEC_REQUIRED` + `FRONTEND_DEPLOY_REQUIRED`; no bundled core → no 90_ rebuild.

### D-F1-4B-FM5-R3 — Gap Materialization Scheduler + post-import orchestration (schedule-only; rollover HALT)

Productionizes the proven materialized gap batches as scheduled jobs. ORCHESTRATION ONLY — no formula/stock/
allocation/KMHP/KMTPP/KMMSA/KMALLOC/KMQI/DB-schema/UI-calc change. New file `44_gap_materialization_scheduler.gs`.

- **Frozen cadence (Asia/Taipei):** source imports ~12:00–13:00 (Day D; `runAmazonSnapshotImports`, unchanged) →
  `runDailyInventoryGapMaterialization()` **13:30 Day D** → (future warnings consume the fresh
  inventory_replenishment_gap; never recalc) → `runDailyOrderPlanningGapMaterialization()` **03:30 Day D+1**.
  Same-day-import → same-day Inventory gap → **next-day (D+1)** Order Planning gap is frozen (no 15h-vs-same-day
  ambiguity).
- **Owners = the existing batch owners** (manual "Recalculate All Sites" and scheduler share ONE pathway):
  `handleRecalculateInventoryReplenishmentGapBatch_` / `handleRecalculateOrderPlanningGapBatch_`. Scheduler is thin
  (validate config → invoke owner → structured summary); no second formula, no per-SKU HTTP, no browser dependency.
- **Execution lock (§5):** bounded `LockService.getScriptLock().tryLock(10s)` at orchestration level; held → return
  `SKIPPED_LOCKED` and DO NOT run (no overlapping full-site recalc). No DB lock, no new schema.
- **Idempotency (§4):** delegated to the latest-state UPSERT batches (key company+country+marketplace+sku); the
  scheduler writes no rows itself, so re-running a day is safe (overwrites the same snapshot).
- **Failure (§6):** READY/BLOCKED/ERROR preserved verbatim; summary = job/status/startedAt/finishedAt/timezone/
  scopesProcessed/rowsProcessed/readyCount/blockedCount/errorCount/calculatedAt/batchErrors; batch success:false →
  status ERROR (no fake success).
- **Trigger mechanism:** manual USER attachment in the Apps Script UI (no `ScriptApp.newTrigger` in source
  historically). A guarded, USER-RUN `installGapMaterializationTriggers_()` is provided — duplicate-protection
  deletes ONLY the two gap handlers, NEVER `runAmazonSnapshotImports`; project timezone must be Asia/Taipei.
- **Monday recommendation flow:** boundary frozen — weekly recommendation must READ inventory_replenishment_gap after
  materialization, never recalc. No automated weekly-recommendation owner exists in source → **SOURCE_MISSING**;
  stopped at the materialization boundary (no AI/Execution Plan, no shipment write this round).
- **CALC-DATE / -MONTH ROLLOVER — HALTED (§7):** `RECOMMENDATION_CALCULATION_DATE` +
  `RECOMMENDATION_CALCULATION_MONTH` are READ-ONLY Script Properties (no setter in source) → manually maintained. The
  scheduler validates them (frozen resolvers) and returns `CONFIG_BLOCKED` if missing/malformed; it NEVER auto-rolls.
  **CALCULATION_DATE_ROLLOVER_AUTHORITY_NOT_FROZEN** + **CALCULATION_MONTH_ROLLOVER_AUTHORITY_NOT_FROZEN** — authorize
  deterministic rollover in a separate round.
- **Tests:** `gap-materialization-scheduler-f1-4b-fm5r3` (27 assertions A–L + config-HALT). Bundle UNCHANGED (35
  modules, `41d64956…`). No DB/schema, no frontend deploy.

### D-F1-4B-FM5-R3 (supplemental) — materialized-gap LIFECYCLE freeze (latest-state; authority-based cleanup deferred)

`inventory_replenishment_gap` + `order_planning_gap` are **LATEST-STATE** materialized tables, NOT historical
snapshots. Regression-lock only (audit confirmed the existing behavior already complies); no code change.

- **UPSERT identity = company + country + marketplace + sku** (`GAP_KEY_COLS_`). A newer successful calculation
  UPDATES the existing row in place (`gapUpsertByKey_` → insert on a new key, update on an existing key); it NEVER
  appends a historical version. A newer value supersedes the previous automatically.
- **Timestamps:** `calculated_at` = when the canonical gap calculation completed; `updated_at` = when the
  materialized row was last written. Both advance on each successful (or blocked) write of that row.
- **Metadata for later staleness detection:** both tables expose `calculation_status` (READY/BLOCKED/ERROR),
  `calculated_at`, `updated_at` — sufficient to identify stale rows in a future maintenance round.
- **Safety invariant (frozen):** an active/plannable SKU row is NEVER deleted merely because its calculation is old
  or a scheduler/import run failed. A failed/blocked recalculation UPDATES the row's status — it never removes the
  row. (`gapUpsertByKey_` has no delete path; the batch/scheduler perform no row deletion.)
- **Cleanup owner:** **MATERIALIZED_GAP_CLEANUP_OWNER = SOURCE_MISSING** — no purge/cleanup owner and no age-only
  deletion exists in source (verified: no `deleteRow`/`clearContent`/`updated_at < N days` logic in 43 or 44).
  Deletion logic is DEFERRED to a separate maintenance round.
- **Future maintenance rule (frozen intent, NOT implemented):** a gap row is purge-eligible ONLY when its identity
  no longer belongs to the current canonical plannable SKU universe (marketplace_skus / active receiver authority)
  AND it has exceeded a configurable grace period — i.e., **active-source-identity check → grace period → safe
  purge**. NEVER age-only deletion.
- **Test:** `materialized-gap-lifecycle-f1-4b-fm5r3` (19 assertions: UPSERT latest-state, metadata exposure, safety
  invariant, no purge/age-deletion owner).

### D-F1-4B-FM5-R4 — deterministic calculation date/month rollover authority (removes the R3 CONFIG_BLOCKED)

Freezes + implements ONE canonical Asia/Taipei calculation-context owner for scheduled + manual gap materialization,
resolving the R3 `CALCULATION_DATE/MONTH_ROLLOVER_AUTHORITY_NOT_FROZEN` HALT. Orchestration/context only — no
formula/stock/allocation/KMHP/KMTPP/KMMSA/KMALLOC/KMQI/gap-schema/read-behavior/manual-Order-Qty change.

- **Canonical owner (43):** `gapCalcContextForJob_` + `gapCalcResolveContext_` + `gapCalcTaipeiYmd_` /
  `gapCalcPrevYmd_` / `gapCalcYmdValid_`. `calculationDate = YYYY-MM-DD`; `calculationMonth = date's YYYY-MM`;
  `planningCycle = RECO-{month}` — month + cycle DERIVE from the date (no longer independent). Asia/Taipei = fixed
  UTC+8 (no DST) → the calendar date is pure epoch arithmetic (shift + getUTC*), and the previous-day is
  calendar-correct string arithmetic — no UTC/DST rollover bug. Previous owners: `recoWsResolveCalcDate_`
  (RECOMMENDATION_CALCULATION_DATE) + `recoWsResolveCalcContext_` (RECOMMENDATION_CALCULATION_MONTH), independent.
- **Job rule (§2/§3):** INVENTORY calculationDate = the execution's Asia/Taipei date (13:30 Day D). ORDER_PLANNING
  calculationDate = the PREVIOUS Asia/Taipei date (03:30 Day D+1 runs before that day's 12:00–13:00 source refresh →
  latest COMPLETED source cycle = Day D). Proven: A (2026-08-07 13:30→2026-08-07), B (2026-08-08 03:30→2026-08-07),
  C month-boundary (2026-09-01 03:30→2026-08-31/2026-08), D (2026-09-01 13:30→2026-09-01/2026-09), E leap
  (2028-03-01→2028-02-29; 2026-02-29 invalid), F year-boundary (2027-01-01 03:30→2026-12-31/2026-12).
- **Injection, not mutation (§5):** the scheduler (44) derives the context and INJECTS it into the batch io
  (`gapMaterializationDefaultIo_(ctx)` → recoIo.configDate/configMonth); the manual/router path (batch owner, no io)
  derives the SAME context via the SAME owner (INVENTORY today / ORDER_PLANNING prev day). Script Properties are
  NEVER written and are NO LONGER required for scheduled OR manual runs — they remain an optional debug/override
  authority for a direct `recommendation.workspace.get`. Manual + scheduled share ONE owner (§6/§G).
- **Fail-closed (§10):** an invalid deterministic context → CONFIG_BLOCKED; never UTC/browser/stale/blank/fabricated.
- **DB mapping (§8):** stored `calculation_date` (inventory_replenishment_gap) / `calculation_month`
  (order_planning_gap) come from the workspace `meta` driven by the injected context = the canonical values. No
  columns added, no history — FM5-R3 latest-state UPSERT + `MATERIALIZED_GAP_CLEANUP_OWNER = SOURCE_MISSING` preserved.
- **No frontend clock authority (§7):** pages read the context from server `env.meta`; the gap batch derives context
  server-side and never consumes a browser-supplied calculationDate/Month.
- **Tests:** `gap-calc-context-f1-4b-fm5r4` (23: A–F, leap, year, month-boundary, cycle, TZ integrity, fail-closed);
  `gap-materialization-scheduler-f1-4b-fm5r3` updated to the R4 injection surface (31). Bundle UNCHANGED (35 modules,
  `41d64956…`). No DB/schema, no frontend deploy. Remaining blocker cleared: scheduled runs need no manual property.

### D-F1-4B-FM5-R4UI — Inventory materialized-gap UI simplification (presentation only)

Presentation-only cleanup of the Inventory Replenishment materialized-gap card; NO formula / materialization / DB /
scheduler / allocation / runtime-owner change. Frontend files only (`inventory-replenishment.js` + `.css`).

- **Normal view = the fixed 4-window outlook table ONLY** (Window | Gap | Suggested Qty | Note) under the outer
  "Recommendation Summary" title. Removed from the normal view: the "Replenishment Outlook" sub-title, the
  "Materialized" badge, and the panel-level note/status/calc-date/as-of. Those engineering facts are DEMOTED under a
  collapsed **Diagnostics** `<details>` (`_irMatMetaHtml`). The actionable "stale" warning stays visible.
- **Row-level Note preserved:** `_irMatToLine` sets a truthful per-window Note for non-READY rows (the stored reason)
  and leaves READY rows to the derived business note (No shortage / Replenishment required) via `_irRecoHorizonNote_`
  (now prefers an explicit `h.note`; live-workspace path unaffected). Valid zero → 0; BLOCKED → "—" + truthful Note.
- **Stable structure:** `.replen-horizon-table--outlook` gains `table-layout: fixed` + data-independent column widths
  (Window 22% / Gap 19% / Suggested 19% / Note flexible); still inside `.replen-horizon-tablewrap` (overflow-x) so a
  large value scrolls internally and never widens the card. All four windows always render.
- **No structural regression:** materialized-read remains primary; expand does not calculate; Recalculate All Sites,
  Execution Plan, Diagnostics, and top-level Suggested Qty behavior unchanged. Tests:
  `inventory-gap-ui-simplification-f1-4b-fm5r4ui` (27); FM5-R1 INV3 updated to the R4UI surface. Bundle unchanged.

---

## F1-4B-FM5-R4UI-R3 — Planning Model demand split FROZEN + wired (resolves the R4UI-R2 AUTHORITY_NOT_FROZEN HALT)

- **Decision (user-frozen this round):** Inventory Replenishment horizon demand splits on `marketplace_skus.replenishment_model`.
  - **sales_driven** — daily demand = the canonical `KMCALC.normalizedAvgSalesPerDay` run-rate (§22: latest ≤30 confirmed NORMAL days in the 90 completed-day window ÷ actual normal-day count; <3 → `weekly_7d ÷ 7`), applied FLAT per elapsed calendar day. Regular FC and Target% NEVER enter this path.
  - **forecast_driven** — unchanged: monthly Target%-adjusted regular FC (Authority E) ÷ that month's real days.
  - **Special events** (Authority F, `KMPD.scopedSpecialEventPreps`) are additive in BOTH paths, count-once, on the canonical prep date.
  - **Unknown / missing model** → KMHP fails closed (`PLANNING_MODEL_UNKNOWN`); a Sales-Driven SKU whose run-rate cannot be resolved fails closed (`SALES_BASIS_UNAVAILABLE`) → materialized BLOCKED. Never a silent forecast/sales substitution, never a fabricated 0.
- **Owners changed:** `KMHP.projectHorizons` (demandMode + avgSalesPerDay; ONE KMTPP call; VERSION `kmhp-fm5r4uir3-1`); `KMPS` canonical tables +`amazon_daily_sales_snapshot` +`amazon_weekly_sales_snapshot`; `42` `recoWsResolvePlanningModel_` + `recoWsResolveSalesRate_` wired into the marketplace + warehouse horizon paths. Site Stock opening owner + Factory/Overseas exclusion UNCHANGED. Bundle `1c0002372d32f380eb3c603f6af48c9f0f91a1ef8c3ef4d3cfafc21a17fe4e93`.
- **Proof:** the old forecast-derived D45=2804 cannot occur for a Sales-Driven SKU — its D45 is now `max(0, avgSalesPerDay×45 − Site Stock − timely incoming)`. Tests: `planning-model-demand-split-f1-4b-fm5r4uir3` (27), `planning-model-wiring-f1-4b-fm5r4uir3` (14).
- **Narrow HALT (authorized §14):** global-header vertical compaction — the header is a SINGLE shared owner (`layout.css .top-header` + `base.css --header-height`) consumed by every page's layout offset/sidebar/content height; changing it ripples cross-page and is not live-verifiable here. Inventory page CSS does NOT touch it. Owner reported; deferred to a dedicated cross-page round.
- **Known follow-ups (bounded, not blocking):** (1) the Sales-Driven run-rate wiring supplies `campaigns:[]`/`events:[]` to the owner, so campaign/event contamination-day EXCLUSION is not yet marshalled (needs the `campaign_sku_lines` join + `fc_special_events` selling-window); (2) daily-sales company attribution stamps the scope company (correct for single-company scopes; a genuinely multi-company scope fails closed rather than guessing). Both require LIVE observation before FM5-R5.

### F1-4B-FM5-R4UI-R3a — Sales run-rate input completeness (closes the R3 contamination follow-up)

- **Resolved:** the Sales-Driven run-rate wiring now marshals the CANONICAL contamination-day facts into `KMCALC.normalizedAvgSalesPerDay` instead of `[]`. campaigns (`start_date`/`end_date`/`status`) join `campaign_sku_lines` (`marketplace_sku_id` identity) → the owner's campaign `skuLines`; `fc_special_events` (`event_start_date`/`event_end_date`/`status`/`marketplace_id`) → the owner's `events`; scope `marketplaceId` resolved from `marketplaces`. The owner (unchanged) OWNS the match/exclude logic and its ambiguous-identity fail-fast — no new contamination definition invented.
- **KMPS** +`campaigns` +`campaign_sku_lines` canonical tables (workspace read now 17 tables). Bundle `fb4824d12796d0f13a9389b7bfc772a3f5e2c0d1d91e8da449d9c50f3ce06ee5`.
- **Differentiation (§3), never collapsed:** (A) present-but-empty source = legitimate zero contaminated days; (B) missing source sheet → `CONTAMINATION_SOURCE_UNAVAILABLE` (fail closed, never assumed empty); (C) ambiguous identity / owner throw → `SALES_BASIS_AMBIGUOUS`. No-daily-history → `SALES_BASIS_UNAVAILABLE`.
- **Proof:** spike days 25–27 (1000 u) vs normal (100 u): no campaign → avg 370; campaign covering 25–27 → 3 days excluded → NORMAL=7 → avg 100. Historical event selling window excluded from the rate while the FUTURE planned event is still added once by KMHP (different concepts, no double count). Test `planning-model-wiring-f1-4b-fm5r4uir3` (22).
- **Remaining follow-up:** multi-company daily-sales attribution still stamps the scope company (single-company scopes correct; genuinely multi-company scopes fail closed). Needs live observation before FM5-R5.

### F1-4B-FM5-R4UI-R4 — Table geometry + stable summary schema + recalc reliability (5 live defects)

- **§5 READY→BLOCKED root cause (highest priority):** the R3a contamination-source check fail-closed
  (`CONTAMINATION_SOURCE_UNAVAILABLE`) whenever `campaigns`/`campaign_sku_lines`/`fc_special_events` was
  missing OR empty — turning previously-READY sales-driven rows BLOCKED after recalc. **Fix (source-marshalling
  only, no formula change per §10):** contamination is now a best-effort OPTIONAL filter — present-empty AND absent
  both mean "no exclusion" (the frozen owner's own contract); a contamination identity conflict degrades to an
  un-excluded basis via a retry. Fail-closed is reserved for the daily-sales BASIS (`SALES_BASIS_UNAVAILABLE` /
  `SALES_BASIS_AMBIGUOUS`). Batch↔workspace snapshot parity CONFIRMED (both read the same 17 canonical tables via
  `handleRecommendationWorkspaceGet_ → KMPS.readCanonicalSnapshots`). Documented secondary coupling: a sales-driven
  SKU with NO regular forecast has null Site Stock (opening) → BLOCKED (pre-existing opening/forecast coupling, not
  this round's defect). Tests: `inventory-recalc-determinism-f1-4b-fm5r4uir4` (READY→recalc→READY deterministic;
  present-empty ≠ absent ≠ block).
- **§6/§7 HTTP_TRANSPORT_ERROR:** a lost browser response no longer reports failure. Both recalc buttons now treat a
  transport error as "server result unknown" → refetch the materialized READ ONLY (never re-run the WRITE batch →
  no duplicate expensive recalc) and confirm completion from a newer stored `calculated_at` (never a fabricated
  success). Shared contract across Inventory + Order Planning (§11.P). §8 batch response is already a compact
  summary (counts only; no per-SKU payload) — confirmed by test.
- **§3/§4 Recommendation Summary:** now a fixed 4-row schema with stable `data-ir-{gap,suggested,note}-window`
  cell identities; a materialized-READY refetch PATCHES cells in place (no table rebuild). Diagnostics
  (status/calc-date/as-of/note) removed from the normal card — emitted only behind
  `window.KM_FLAGS.IR_DEBUG_DIAGNOSTICS`. Compact card spacing (shorthand only, no position hack).
- **§2 sticky active row:** the expand no longer applies position:sticky (that clamped a near-top row downward =
  the jump). Expand adds a highlight-only class; `.is-active-sticky` (position:sticky) is promoted lazily on the
  first scroll → zero jump on expand, pins under the header only as the row scrolls away, collapse clears both.
- **§1 header geometry:** verified — the three rowspan/tall cells (SKU / Planning Model / AI Action) already span
  EXACTLY the compact two-row total via `var(--km-sticky-header-total)` (= 34+34 = 68px); no stale hardcoded height
  remains (the R3 note-span token fix established this), so no gray third band in the current code. Locked by test.
- **No formula change** (KMHP/KMTPP/KMCALC/KMPD/KMMSA/KMALLOC untouched); no DB/schema change; bundle unchanged
  (`fb4824d1…`). Order Planning + Execution Plan formulas untouched.

### F1-4B-FM5-R4UI-R5 — Final UI + materialization repair (9 outcomes; 7 fixed, 2 HALT)

- **§4 (highest priority) READY→BLOCKED / HORIZONS_NOT_AVAILABLE root cause + fix:** the unified MARKETPLACE
  resolver (supply-planning-destination-runtime.js) returns `line:null` when the MONTHLY forecast demand is not
  resolvable — BEFORE computing Site Stock. So a Sales-Driven SKU with a valid Site Stock + sales basis but NO
  regular forecast lost `L.currentStockQty` → null horizon opening → HORIZONS_NOT_AVAILABLE. Classification =
  **MARSHALLING** (transport coupling), not a formula defect. **Fix (page-marshalling only):** the horizon opening
  now resolves Site Stock DIRECTLY from the canonical `KMDR.resolveMarketplaceCurrentStock` (the SAME owner, forecast-
  independent) when `L.currentStockQty` is null. Forecast SKUs keep `L.currentStockQty` verbatim; a genuinely
  missing/conflicting Site Stock stays null → truthfully BLOCKED. Deterministic READY→recalc→READY proven with and
  without forecast (`inventory-recalc-determinism` §4 case).
- **§1 header gray band root cause + fix:** `--km-sticky-header-total` (defined at :root = 96px) was never re-derived
  when R3/R4 compacted the two row tokens to 34px, so every container + rowspan cell stayed 96px vs 68px of rows = a
  ~28px gray band AND a 28px-too-low §2 sticky offset. **Fix:** `#ops-section` now re-derives
  `--km-sticky-header-total = row1 + row2` → 68px. This resolves §1 (band) AND §2 (the sticky row now pins exactly
  under the header; R4's defer-to-scroll already removed the expand jump — no overlay clone needed).
- **§5 Inventory top Suggested Qty:** now materialized — reads `inventory_replenishment_gap.d90_suggested_qty` (the
  FURTHEST cumulative checkpoint = the ONE actionable total; D18/D30/D45/D90 are cumulative so summing double-counts).
  READY→value, BLOCKED/missing→—, loading→…. No page-side math.
- **§6A OP top Suggest Order:** materialized `t1+t2+t3_suggested_qty` (T4 visibility-only, excluded); §6B Demand
  Summary gains a **Suggested** column mapping the canonical tier `suggestedOrderQty` (t{1..4}) for all four tiers,
  T4 rendered as a read-only cell (non-writable). Same stored owner as Order Allocation → internally consistent.
- **§3 Recommendation Summary:** green container + green left border removed (white body / neutral). **§8:** the
  platform_fulfilled/self_fulfilled badge hidden in the normal UI (`.ir-ff-badge{display:none}`; data-fulfillment +
  ir-fulfillment--* class retained — internal authority + card ordering untouched).
- **§7 90-Days Demand — HALT:** the canonical 90-day planning demand is KMHP's D90 `demandQty` (both modes + special
  events, count-once), but it is NOT materialized (the gap table stores gap/suggested only). Surfacing it on the
  materialized-read main table needs either a new materialized column (**DB schema change — forbidden by §0 + the
  FINAL GATE**) or page-side arithmetic (forbidden). Kept the "60 days FC" label rather than mislead. **Follow-up:**
  a schema-authorized round adds `d90_demand_qty` to inventory_replenishment_gap (written from the already-computed
  D90 demandQty) → then relabel to "90 Days Demand".
- **§9 SKU white block — HALT:** the audit could not identify the geometry owner with confidence (candidates:
  `.fixed-col` scrollbar-gutter/border, or expand-panel background). A blind CSS change risks the frozen-column
  alignment/readability the spec requires preserved. Owners documented; needs live inspection.
- **No formula change** (KMHP/KMTPP/KMCALC/KMPD/KMMSA/KMALLOC untouched); no DB/schema change; no API/DTO change;
  bundle unchanged (`fb4824d1…`). Order Planning + Execution Plan formulas untouched; materialized-expand stays
  read-only.

## F1-4B-FM5-R4UI-R6 — Inventory Live Defect Closeout (fresh-recalc freeze + sticky/header/summary; 2026-08-08)
- **§1–§4 BLOCKED root cause = DEPLOYMENT STALENESS, not a live calc defect.** Audit proved the fresh-state
  recalculation invariant is ALREADY satisfied in code: (a) the materialization map (`gapInvMapFromLines_` /
  `gapOpMapFromLines_`) is a PURE function of `(lines, scope, sku, calcAuthority)` — it reads no prior row and no
  `calculation_status`; (b) `gapUpsertByKey_` OVERWRITES status+values+note on the same business-key row every run;
  (c) the canonical workspace (`42`) has ZERO references to the gap tables (previous status can never be a calc
  input); (d) the frontend `refreshInventoryGapAfterRecalc_` clears `loadedOk`+`scopeKey` then force-refetches.
  The live "previously-READY SKUs are BLOCKED" symptom is the R5 §4 fix (`resolveMarketplaceCurrentStock`
  horizon-opening decoupling) being committed LOCAL-ONLY (`6306a7c`) and never pushed — origin/Apps Script run R4
  (`b7421cd`), which returns `line:null`/HORIZONS_NOT_AVAILABLE for sales-driven no-forecast SKUs. **Fix = deploy R5.**
- **§2/§12/§13 FREEZE:** every recalculation is stateless wrt the previous gap status (OUTPUT ONLY). No
  status-carry-forward / stale-row-reuse / HORIZONS_NOT_AVAILABLE-preservation coupling exists; locked by a
  BLOCKED→READY→BLOCKED→READY same-row test (`inventory-recalc-freeze-ui`).
- **§4 real reason preserved:** the map surfaces the specific `L.blockedReason` (SALES_BASIS_MISSING /
  SITE_STOCK_MISSING / DEMAND_NOT_READY …); generic HORIZONS_NOT_AVAILABLE only when horizons are empty AND the line
  is not otherwise blocked. Unchanged; test-locked.
- **§5 sticky REWRITE (native → fixed overlay clone):** root cause of the persistent jump = the real rows live inside
  `.fixed-col`/`.scroll-col`, both `overflow-x:auto` scroll containers, so `position:sticky` stuck to the WRONG
  containing block (a box that scrolls only horizontally) — no `top` patch could fix it. The real rows are now NEVER
  position:sticky; a fixed-position `#ir-sticky-overlay` (clone of the active fixed-row + scroll-row, pointer-events
  none, no layout footprint) is shown only while the master row is behind the header, pinned just below it, with the
  scroll half mirroring the live `scrollLeft`. Removed/hidden on collapse or return-into-view.
- **§7 global chrome compaction (USER-authorized):** `--header-height` 80px → 56px at its single canonical owner
  (base.css); `.top-header` padding 1.5rem → 0.5rem. All consumers (app-layout margin, sidebar top/height,
  main-content height, top-header min-height) derive from the one token → consistent across every page, no per-page
  offset. §8 inventory two-level header stays 68px (34+34; all tall/rowspan cells key off the re-derived total).
- **§9–§11 Recommendation Summary + Monthly Achievement:** NEUTRAL light-gray headers (`#f1f5f9`) replacing the warm
  beige (no green, no beige); data bodies white; recsum table margin 10px → 2px for density parity.
- **§6 white gutter — HALT (again, honestly):** static CSS audit proved neither `.fixed-col` nor `.scroll-col`
  reserves a RIGHT-side gutter (both `overflow-y:hidden` + `scrollbar-gutter:stable` ⇒ bottom-only). The remaining
  candidate owner cannot be pinned without a live computed-DOM reading, and §6 explicitly forbids speculative CSS.
  Deferred to a one-line live DevTools check (inspect the white strip → report selector/width/background).
- **No formula change** (KMHP/KMTPP/KMCALC/KMMSA/KMALLOC untouched); no DB/schema change; no API/DTO change; no gap
  business-key change; core modules + generated bundle UNCHANGED (`fb4824d1…`; only page CSS/JS + shared chrome CSS +
  tests changed). Order Planning T1–T4 math + Execution Plan untouched; materialized-expand stays read-only.

## F1-4B-FM5-R4UI-R7 — Inventory BLOCKED closure + 90-Day FC reference + UI (2026-08-08)
- **§1 CO1100-R BLOCKED root cause (reopened from scratch; CODE, not deployment):** for a Sales-Driven SKU the
  day-horizon is gated by `mHz = (planModel==='sales_driven' && salesRate===null) ? null : recoWsBuildHorizons_(…)`.
  When the canonical run-rate (`recoWsResolveSalesRate_` → KMCALC.normalizedAvgSalesPerDay) does NOT resolve, `mHz`
  was set to a silent null and `gapInvMapFromLines_` reported the GENERIC `HORIZONS_NOT_AVAILABLE` — masking the
  real reason (audit Q9 = YES). Two proven defects fixed at the FIRST broken boundary:
    (A) **Reason masking:** `recoWsExpandMarketplace_`/`recoWsExpandWarehouse_` now stamp
        `line.horizonsBlockedReason` = the specific sales reason (SALES_BASIS_UNAVAILABLE / SALES_BASIS_AMBIGUOUS /
        HORIZON_PROJECTION_UNAVAILABLE); `gapInvMapFromLines_` surfaces it verbatim. The BLOCKED note now tells the
        user WHY (so CO1100-R's true cause is visible instead of the generic token).
    (B) **Country-identity marshalling:** `recoWsResolveSalesRate_` matched the daily/weekly snapshots by RAW
        `country` string equality; the snapshot country (sourced from Amazon's "Marketplace" field) and
        marketplace_skus.country can encode the same country differently (the UK≡GB class the repo repairs
        elsewhere). A mismatch dropped every scoped row → false SALES_BASIS_UNAVAILABLE. Now canonicalized via KMCID
        (`recoWsCanonC`), both sides. Marshalling correctness — NO formula change, NO second averaging engine.
  Snapshot parity VERIFIED: the batch reads amazon_daily/weekly_sales_snapshot via KMPS.readCanonicalSnapshots
  (same reader as live expand). Fresh-state invariant re-confirmed (map is pure; no prior status read) + test-locked.
- **§F "90 days FC" is a USER REFERENCE field** (business freeze): `IR.forecast60d` rewritten = SUM(next 3 forecast
  months' Base FC) + SUM(Special Event fc_qty whose applicable month ∈ those 3 months, counted once). NO Target%,
  NO Avg Sales/day, NO inventory subtraction, NO gap, NOT D90 demandQty. Reuses the SAME fc_regular_forecast +
  fc_special_events facts as Forecast Breakdown / Upcoming Event; model-independent. Header renamed 60 → 90 days FC.
  The 3PL 18-day site-planning allocation is DECOUPLED to a new planning-only owner `_irForecastPlanning2mo` (the
  pre-R7 2-month Target%-adjusted logic, byte-for-byte) so NO planning/shortage formula consumes the reference field.
- **§2 expanded-row pin REMOVED (supersedes the R6 overlay):** any pin — native sticky OR a floating overlay clone —
  necessarily floats over the content scrolling beneath it, which occluded the top of the second-level detail (the
  reported R6 defect). No offset removes that for free vertical scroll. Resolution: the active master row keeps ONLY
  the `.is-active-selected` highlight (no reposition, no float) and scrolls as ONE natural unit with its detail —
  zero jump, zero occlusion, zero detachment. Legacy overlay node torn down defensively.
- **§4 Recommendation Summary** density parity with Monthly Achievement (3px 6px cells, tight wrapper margins);
  neutral-gray header (#f1f5f9), white body, fixed 4-row schema (unchanged). **§5** shared logo scales to the 56px
  header via a layout.css rule (max-height 36px, width auto — aspect ratio preserved; not an Inventory-only hack).
- **§3 left/right expanded height:** the canonical owner is the shared `.table-body-bar` flex `align-items:stretch`
  chain (2026-08-07 hotfix) — reactive to async content by construction; left untouched (removing the overlay also
  removes a layout perturbation). **§6 white strip — HALT:** static audit proved neither `.fixed-col` nor
  `.scroll-col` reserves a right-side gutter (both overflow-y:hidden + scrollbar-gutter:stable ⇒ bottom-only); the
  "disappears after scroll" clue points to a state/reflow owner that cannot be source-proven without a live
  computed-DOM reading. §6 forbids speculative CSS → deferred with the requested evidence template.
- **§7 Inventory top Suggested = D90** and **§8 Order Planning (t1+t2+t3; T4 non-writable)** preserved unchanged.
- No Inventory D18–D90 / Order Planning formula change; no DB/schema change; no gap business-key change; core modules
  + generated bundle UNCHANGED (only the 42/43 `.gs` handlers — not bundled — + page JS/CSS/HTML + shared logo CSS +
  tests changed). Full suite 133/134 (only pre-existing replen-header-toggle A2); Golden PASS.

## F1-4B-FM5-R4UI-R7V — Live-closure: self-diagnosing sales-basis BLOCKED note (2026-08-08)
- **Execution boundary (honest):** this agent has NO live browser / Apps Script runtime / Google Sheet / DevTools
  access, so it cannot run "Recalculate All Sites", read the live `inventory_replenishment_gap`, produce live
  numeric horizons, or capture live computed styles. No live values are fabricated. Also note R7 (`cf54747`) is
  UNPUSHED (origin at R6 `48aeb17`) — the "current R7 deployment" the round assumes has not happened; the R7
  reason-unmask + country-canon are not live yet, so the live note is still R6's generic HORIZONS_NOT_AVAILABLE.
- **§1 the one safe, code-provable advance:** each `recoWsResolveSalesRate_` fail-closed reason now carries a
  compact `detail` (matched daily-row count · distinct channel set incl. `(blank)` · resolved country); the
  marketplace + warehouse paths append it to `horizonsBlockedReason`, so once R7+R7V are deployed the LIVE BLOCKED
  note self-explains — e.g. `SALES_BASIS_AMBIGUOUS: channels=2 [FBA,(blank)]` or `SALES_BASIS_UNAVAILABLE: no daily
  rows @ US/Amazon`. DIAGNOSTIC ONLY: no threshold moved, no fail-closed rule relaxed (still `!daily.length` /
  `chKeys.length !== 1`), reason token unchanged. This turns the live BLOCKED into a self-serve data-fix signal
  (the round's real goal) without the agent needing live access.
- **§4 white strip — HALT (unchanged):** requires the live DevTools evidence the round itself specifies; no
  speculative CSS. **§1 CO1100-R READY** cannot be asserted from here — after deploy+recalc it is READY iff the
  live basis resolves; otherwise the enriched note names the exact live gap (channel/rows/country) to fix in data.
- No formula / DB / schema / bundle change (only the 42 `.gs` handler — not bundled — + tests). Full suite 134/135
  (pre-existing replen-header-toggle A2 only); Golden PASS.

## F1-4B-FM5-R4UI-R5A — Sales-basis weekly-fallback live repair + Inventory UI polish (2026-08-08)
- **§1/§2 CO1100-R BLOCKED — ROOT CAUSE FOUND & FIXED (code, proven end-to-end):** the Inventory UI Avg Sales/day
  (~178.4) is `IR.avgSalesPerDay` reading the WEEKLY snapshot (`salesUnits7d/7`), while the canonical
  `recoWsResolveSalesRate_` returned `SALES_BASIS_UNAVAILABLE` the instant there were 0 scoped DAILY rows — so the
  frozen §22/§29E ladder rung "<3 NORMAL days → weekly_7d ÷ 7" was UNREACHABLE for a weekly-only SKU. Classification
  = DAILY_SOURCE_MAPPING / WEEKLY_FALLBACK unreachable. Fix: resolve the channel from daily when present, else from
  weekly (`chSource = daily.length ? daily : weeklyAll`); fail-close only when NEITHER source has rows. KMCALC then
  applies the ladder (empty dailySales + a valid weekly7d → weekly7d/7), so the canonical rate reconciles with the
  UI (both = weekly_7d/7 ≈ 178.43). NO forecast fallback, NO fabricated value, NO second averaging engine, NO
  page-side rate — the same frozen KMCALC.normalizedAvgSalesPerDay owner, now correctly routed to its own weekly
  rung. Proven functionally through BUNDLE+42 in `inventory-sales-weekly-fallback` (weekly-only → READY 178.43;
  neither source → BLOCKED; ≥3 daily → normalized_30d; ambiguous channel → still fail-closed).
- **§3 BLOCKED-reason transparency:** the normal Recommendation Summary now shows a user-safe "Calculation
  unavailable" instead of raw internal codes (SALES_BASIS_* / HORIZONS_NOT_AVAILABLE / …). The technical reason is
  UNCHANGED in the DB note and still visible under Diagnostics (IR_DEBUG_DIAGNOSTICS). (Supersedes the earlier
  fm5r4ui BK3 which surfaced the raw code — updated to the new contract, not weakened.)
- **§7 active blue background covers the full logical row:** the highlight is now applied per-cell
  (`.scroll-row.is-active-selected .scroll-cell`), so every cell — including those off-screen until horizontal
  scroll — stays blue; DoS severity survives via its bold coloured TEXT. Presentation-only.
- **§9 header logo +15%** (shared shell): max-height 36→41px (layout.css) + inline max-width 150→172px (index.html),
  aspect ratio preserved, vertically centered; header stays ~56px.
- **§5 left/right expanded height & §6 white gutter:** the canonical height owner remains the shared
  `.table-body-bar` flex `align-items:stretch` chain (untouched — correct by construction). The residual white strip
  still cannot be source-proven without a live computed-DOM reading (both `.fixed-col`/`.scroll-col` reserve only a
  bottom gutter); the §7 per-cell paint removes any active-state strip, but a persistent static strip needs one
  DevTools reading. No speculative CSS applied.
- No Inventory/Order Planning formula change; no DB/schema change; no gap-key change; core modules + generated
  bundle UNCHANGED (only 42 `.gs` — not bundled — + page JS/CSS + shared logo CSS/HTML + tests). Full suite 135/136
  (pre-existing replen-header-toggle A2 only); Golden PASS.

## F1-4B-FM5-R4UI-R5B — Canonical sales-basis owner MARSHALLING repair (CO1100-R run-rate owner error) (2026-08-08)
- **Root cause PROVEN:** the live note `SALES_BASIS_UNAVAILABLE: run-rate owner error` is the R7V `catch(e2)` branch —
  i.e. the frozen `KMCALC.normalizedAvgSalesPerDay` THREW even on the no-contamination retry. So the weekly fallback
  (R5A) IS reached; the owner rejects the CALLER's inputs. Two marshalling defects fixed (owner math untouched):
    1. **snapshot_date format** — the batch feeds KMCALC the raw Sheet cell; a JS Date object / 'YYYY/MM/DD' /
       'M/D/YYYY' fails KMCALC's strict `_parseIso` ('YYYY-MM-DD') → throw. Fix: `toYmd()` coerces Date/slash forms
       to strict YYYY-MM-DD before the owner call (a valid YMD is re-emitted unchanged; an unknown value passes
       through so KMCALC still validates it). Also applied to calcDate (`calcYmd`).
    2. **weekly-only blank channel** — a 0-daily basis whose weekly rows carry a BLANK channel: KMCALC requires a
       non-empty channel identity and throws, even though the weekly_7d rung's result (weekly7d/7) never depends on
       channel (KMCALC uses channel only to filter daily rows + scope contamination, both inert with empty
       dailySales). Fix: a stable `'WEEKLY_ONLY'` channel token for THAT exact case only
       (`!daily.length && !channel`); daily-driven paths keep the real channel — identity is NOT loosened (a
       daily-driven blank channel still fails closed with the surfaced channel error).
  Plus: the real owner exception message is surfaced in the detail (`run-rate owner error: <message>`) so any future
  owner throw names itself in the live BLOCKED note. NO formula change, NO second averaging engine, NO forecast
  fallback, NO copying the UI Avg Sales/day — the same frozen KMCALC owner, now fed contract-valid inputs.
  Proven end-to-end (BUNDLE+42): weekly-only blank-channel → READY 178.43; Date/slash snapshot_date → READY
  normalized; unparseable date → BLOCKED with the named owner error; daily blank channel → still BLOCKED.
- **§2 dual-layer header band & §3 fixed/scroll white strip:** header cells all derive from the one
  `--km-sticky-header-total` token (68px on both sides; no stray hardcoded 96px) — no source-provable owner for the
  residual band; the white strip likewise has no static owner (both columns reserve only a bottom gutter). No
  speculative CSS applied (per §0 / "Do not guess"); both need one live computed-DOM reading to name the owner.
- **§4 full-row active bg / §5 summary density / §6 user-safe BLOCKED note** were delivered in R5A — but R5A
  (`0914560`) + this R5B are UNPUSHED (origin at R7V `473f890`), so those are not live yet; deploying R5A+R5B is
  required for the geometry/summary/note fixes AND the CO1100-R READY result to appear.
- No Inventory/Order Planning formula change; no DB/schema/scheduler change; core modules + generated bundle
  UNCHANGED (only 42 `.gs` — not bundled — + one test). Full suite 136/137 (pre-existing replen-header-toggle A2);
  Golden PASS.

### F1-4B-FM5-R4UI-R5C — Deployment/version-parity PROBE + live-path proof (audit-first; one additive read-only marker) — 2026-08-08
- **Trigger:** after push + Apps Script sync + "Recalculate All Sites", CO1100-R still BLOCKED, `updated_at` still
  advances, logo looks new but the Inventory page looks stale. Static analysis cannot read the live server/DOM, so
  the round classifies parity and adds the smallest possible probe to make ONE Network response decisive.
- **Git parity (Phase 1):** HEAD == `origin/main` == `3640fa7` — R5A (`0914560`) AND R5B (`3640fa7`) are BOTH on
  origin (the earlier "origin at 473f890" note is superseded; the user has since pushed). So the frontend GIT SOURCE
  is current; whether the SERVED GitHub-Pages assets match is not statically provable.
- **Frontend mixed-version root cause (Phase 1/7):** assets load WITHOUT any cache-busting query
  (`href="assets/css/pages/inventory-replenishment.css"`, no `?v=`); NO service worker; exactly ONE inventory
  stylesheet (no duplicate old CSS; page CSS loads after components/layout so R5A rules win at equal specificity).
  ⇒ the "new logo, stale Inventory page" split is explained by browser/Pages HTTP caching of un-versioned assets,
  NOT wrong code. No cache-busting implemented this round (spec: only once a live mismatch is proven).
- **Client endpoint (Phase 2):** the READ adapter `operation-system-db-api.js` hardcodes a specific `…/exec`
  literal; the COMMAND transport (Foundation) resolves at call time `deps.baseUrl → KM.DB.getApiBaseUrl →
  KM.config.operationDbWebAppUrl`. "Recalculate All Sites" is a COMMAND → it uses the Foundation transport, so the
  live endpoint is whatever `KM.config.operationDbWebAppUrl` is set to at runtime (not statically resolvable here).
  STALE_OR_WRONG_ENDPOINT remains possible until the probe below confirms the live handler token.
- **Sales path (Phase 3):** `recoWsResolveSalesRate_` is the SOLE sales-rate owner — `KMCALC.normalizedAvgSalesPerDay`
  is invoked exactly once (inside it); two call sites (marketplace §551 + warehouse §602) both feed the same
  `avgSalesPerDay`. No alternate/old path bypasses the R5B fix. All R5B markers present (toYmd, WEEKLY_ONLY,
  chSource daily-else-weekly, surfaced owner error).
- **Version PROBE (Phase 4, the one code change) — additive READ-ONLY response metadata only:**
    1. `43` `gapBatchEnvelope_` → `meta.gapMaterializationHandlerVersion = 'fm5-r4ui-r5c'` on BOTH success and
       failure. This is the envelope the browser receives from "Recalculate All Sites" — ONE Network response now
       proves which gap-materialization handler is live.
    2. `42` `recoWsEnvelope_` → `meta.recommendationWorkspaceHandlerVersion = 'fm5-r4ui-r5c'`. Any direct
       `recommendation.workspace.get` response proves the R5B sales-basis repair is the live code.
  Chosen because NO existing field is a deploy/handler version: `meta.apiVersion:'1'` is a static contract version
  and `formulaVersion`/`sourceDataAsOf` are DATA versions from config — none change when new handler code deploys.
  NO DB write, NO schema, NO formula, NO page-side business logic; business/summary fields untouched (marker on meta).
- **Materialization (Phase 6):** Recalculate = ONE browser command → `handleRecalculateInventoryReplenishmentGapBatch_`
  → `gapRunBatch_` (enumerate scopes → one `io.workspaceGet` per scope → `gapInvMapFromLines_` → `gapUpsertByKey_`
  overwrite-by-business-key). `updated_at` advancing proves the batch executes and UPSERTs — but does NOT prove WHICH
  handler ran; that is exactly what the new `gapMaterializationHandlerVersion` disambiguates. No retry, no duplicate
  write (upsert by key).
- **§2 header band / §3 white strip:** unchanged from R5A/R5B — no source-provable static owner; need one live
  computed-DOM reading. No speculative CSS.
- **Classification:** cannot yet assert #4 (CURRENT_CODE_LIVE) vs #1/#2/#3 without reading the live probe. The probe
  makes the NEXT recalc self-classifying: if the response shows `gapMaterializationHandlerVersion="fm5-r4ui-r5c"`
  (and a workspace GET shows the workspace token) AND CO1100-R still BLOCKED → CURRENT_CODE_LIVE + a real remaining
  defect whose exact first-failing owner is already surfaced in the note; if the token is ABSENT/old → DEPLOYMENT_STALE
  / wrong endpoint / stale asset.
- No formula/DB/schema/scheduler change; core + generated bundle UNCHANGED (only 42 & 43 `.gs` — neither bundled —
  + one new test). Full suite 137/138 (pre-existing replen-header-toggle A1/A2); Golden PASS (39/40, #34 pending).

### F1-4B-FM5-R4UI-R5D — EU Sales-Basis region→source-country membership + aggregation (identity/marshalling) — 2026-08-09
- **Root cause:** `recoWsResolveSalesRate_` matched the daily/weekly sales snapshots by EXACT canonical country
  (`recoWsCanonC(r.country) === scopeCountryC`). An **EU** planning/marketplace scope (country='EU') therefore never
  matched its DE/FR/IT/ES source rows → false `SALES_BASIS_UNAVAILABLE` → the Sales-Driven horizon fail-closed and
  the SKU materialized **BLOCKED**. EU is a planning REGION, not a country alias.
- **Canonical owner (reused, not invented):** the FROZEN frontend authority `IRCountry.SALES_AGG =
  { EU:['IT','DE','ES','FR'] }` (assets/js/utils/inventory-compat.js) — Amazon-only, "sum each member market's own
  latest week", NO legacy country='EU' fallback. This set was taken VERBATIM from that authority (not guessed).
- **Runtime owner added:** `KMCID.sourceCountriesForScope(country, marketplace)` in
  supply-planning-country-identity.js (the same module that already mirrors IRCountry's UK≡GB alias for the runtime)
  → `{ members:[canonical source-country codes], aggregate:bool }`. `aggregate:true` ONLY for Amazon EU; single
  markets → `{members:[self/alias], aggregate:false}` (US→[US], UK→[GB]). `EU != DE/FR/IT/ES` (identity intact:
  `canonicalCountryCode('EU')==='EU'`, `countryMatches('EU','DE')===false`). Bundle REBUILT (KMCID is bundled).
- **42 marshalling change (no formula):** the daily/weekly filter now matches by canonical source-country
  MEMBERSHIP (`recoWsInSrc_`) instead of exact equality — byte-equivalent for every single-market scope. For an
  aggregate (EU) scope: (a) DAILY summed by the SAME canonical date across eligible members → one canonical EU
  series (never per-country days, never averaged averages); (b) WEEKLY = each eligible member's OWN latest
  week_end_date `sales_units_7d`, summed ONCE across members. A stable synthetic `EU_AGG` channel token satisfies
  KMCALC's non-empty-channel contract without changing the run-rate (member sites are distinct channels; the frozen
  weekly authority ignores channel for EU). **KMCALC remains the sole run-rate owner** — no second averaging engine,
  no forecast fallback, no UI-side aggregation.
- **Missing ≠ zero preserved:** real zero → 0; no eligible daily but valid weekly → weekly fallback; no eligible
  daily AND no eligible weekly → truthful `SALES_BASIS_UNAVAILABLE` (detail names the EU source set). Single-market
  channel-ambiguity rule unchanged; marketplace/SKU isolation preserved; company isolation is structural (the daily
  snapshot has no company column — one scope = one company; scope.company is stamped, never used to pool).
- No DB/schema change, no new table, no scheduler/AI/Order-Planning change, no UI change. Apps Script sync: 90 bundle
  (rebuilt, sha256 14141b5d…) + 42_api_v1_recommendation_workspace.gs. Tests: new EU suite (22/22) + updated
  R5B/R5C/R7/bundle assertions to the new (as-strong) contract. Full suite 140/141 (pre-existing replen-header-
  toggle); Golden PASS.

## D-F1-4B-FM6-R3 — Recommendation → Allocation-Draft persistence: canonical engine + AI Plan wiring ✅ DECISION MADE (audit-only, 2026-08-10) 🟠 BLOCKS live AI Plan persistence

- **Round intent:** complete the real Phase-1 AI Plan flow (materialized gap → recommendation → shared-pool allocation → EXISTING allocation-draft tables → frontend READ), **reusing** the four frozen draft tables (`shipping_allocation_drafts`/`_lines`, `request_order_allocation_drafts`/`_lines`); no parallel execution table.
- **Audit outcome (four owners, code-verified):**
  - `SCHEMA_GAP = NONE`. The existing headers/lines (`planning_cycle`, `generation_type`, `calculation_run_id`, `formula_version`, `calculated_at`, `source_data_as_of`, `draft_version`, `recommended_qty`, snapshot columns) are **sufficient** for source lineage / deterministic rerun / stale detection / draft replacement. **No `recommendation_decisions` / `recommendation_execution_lines` / `recommendation_tiers` / parallel table is required.**
  - **Two recommendation engines exist.** (1) **KMREC/KMREX** (`assets/js/core/supply-recommendation.js` `kmrec-fm6r1-1` + `supply-execution-handoff.js` `kmrex-fm6r2-1`) — pure, read materialized gap rows, **display-only, NOT wired to persistence**; the AI Plan buttons (`handleReplenAiPlan`, `handleRequestOrderAiPlan`) compute a transient browser DTO (`_irRecoByKey`/`_roRecoByKey`) and persist nothing. (2) **KMPB/KMPW** — a routed, end-to-end **persisting** pipeline (`generateRecommendationDraftLocked` → `handleGenerateRecommendationDraftLocked_`, `24_recommendation_orchestrator.gs`) that keyed-delta-writes into **both** draft families over **KMPS production facts** (not the materialized gap tables), with a Production Safety S0 schema gate and LockService + optimistic-token concurrency.
  - **Shared-pool conservation owner (§5) = KMALLOC (`supply-planning-allocations.js`) + KMMSA (`supply-planning-marketplace-supply-allocation.js`)** — the single canonical batch conservation owner (`allocateOverseasSharedPool`/`allocateFactoryDeterministic`, company-isolated, `verifyConservation`). KMREX does NOT run the competition (allocates one recommendation against already-resolved availabilities).
  - Inventory `shipping` upsert handlers (`16_`) are deployed + self-contained; the **Order-Planning line writer** (`handleUpsertRequestOrderAllocationDraftLines_` → `KMPR.applyUserDecisionEdits`) and the **entire KMPB/KMPW pipeline + `24_` orchestrator + `90_generated_supply_planning_bundle.gs`** are **SOURCE MIRROR / NOT DEPLOYED**.
- **DECISION (user, 2026-08-10):** the **canonical persister is the EXISTING KMPB/KMPW pipeline** (`generateRecommendationDraftLocked`). **KMREC/KMREX stay display-only** (the green Recommended-Action summary). Wiring KMREC/KMREX to persist is REJECTED — it would create the prohibited "second execution persistence architecture." This supersedes the spec's `Materialized Gap → KMREC → KMREX → persist` diagram for the persistence lane.
- **Consequence / blockers to live AI Plan persistence (all deployment/authorization, not schema):**
  1. `CANONICAL_PERSISTER_UNDEPLOYED` — KMPB/KMPW + `24_` + `90` bundle must be deployed (and D-1's `RECOMMENDATION_TARGET_SPREADSHEET_ID_` S0 schema provisioned) before `generateRecommendationDraftLocked` returns anything but a fail-closed "bundle not present"/`RECOMMENDATION_SCHEMA_NOT_READY`. Ties directly to **D-1** (verification-copy target) and **D-2**.
  2. `ENGINE_SEMANTICS_DIVERGENCE` — KMPB/KMPW resolves KMPS production facts and has **no GAP-DONE gate and no materialized-gap read**; the spec's KMREC/KMREX-specific acceptance criteria (§4/§6/§8/§14 CO1100-R Overseas-first/Factory-second/uncovered, T1–T3 KMREC total) **do not map onto this engine** and must be re-specified before a code round.
  3. `INVENTORY_MULTISOURCE_VS_K3` — a two-source recommendation (Overseas + Factory) needs two source routes, but the shipping K3 (`planning_cycle+company+country+marketplace+source_page`) permits only ONE active draft per scope (>1 = `BLOCKED_CONFLICT`); `recommendation_group_no` is Phase-1-excluded from the key. Multi-source persistence requires a frozen-key clarification, not a new table.
  4. `OP_LINE_WRITER_UNDEPLOYED` — Order-Planning line persistence depends on the undeployed bundle (`KMPR`), and its deployed route is the user-edit path (needs `expectedToken`).
- **Blocks implementation?** **Yes** for live AI Plan persistence — gated on deploying the KMPB/KMPW bundle (D-1/D-2) and re-specifying the AI Plan wiring to the KMPS-facts engine.
- **Impact this round:** **audit + decision only — NO code, NO schema, NO formula, NO scheduler, NO frontend change.** Next step (a later round, after the bundle is deployed): wire the AI Plan buttons + a `window.KM.DB.generateRecommendationDraftLocked` command to the existing persister (write → read-back), and add the missing Order-Planning draft-read render path — re-specified against the KMPS-facts engine.

## D-F1-4B-FM6-R3B — Canonical persister runtime readiness + Inventory multi-source HALT 🟠 audit-only, 2026-08-10 · HALT before schema change

- **Round intent:** make the FM6-R3 canonical persister (`generateRecommendationDraftLocked` / KMPB→KMPC→KMPPB→KMPL→KMPR, facts via KMPS) source-side runtime-ready and freeze the exact contract R4 will call; HALT (never invent) on any of the §17 tokens.
- **Infrastructure readiness — code-verified, source-side complete:**
  - **Bundle complete + current.** All nine namespaces `rpoBundle_` requires (KMORCH/KMPR/KMPL/KMPB/KMPPB/KMPC/KMPS/KMSP/KMPW) are defined in `90_generated_supply_planning_bundle.gs` and listed in `build-apps-script-bundle.js` MODULE_ORDER+GLOBALS; every orchestrator-called fn present (`KMPW.persistProductionRecommendation`/`assertAuthorizedSchemasReady`, `KMPR.TABLES`/`loadActiveDraftContext`/`loadDraftSnapshot`/`computeExpectedToken`/`validatePersistencePlan`/`applyPersistencePlan`, `KMPL.executeLockedPersistence`, `KMORCH.computeKeyedDeltaWrites`/`runRecommendationGeneration`, `KMPS.resolveProductionFacts`). `--check` = up-to-date, hash `02d5a897…4098a5`. **No source-side bundle/tooling gap.**
  - **Route registered:** `generateRecommendationDraftLocked` at `01_router.gs:316` → `handleGenerateRecommendationDraftLocked_` (`24_recommendation_orchestrator.gs`). **ONE callable serves BOTH products** via `body.recommendationType` (`WEEKLY_SHIPPING` → shipping tables; `MONTHLY_ORDER` → request-order tables), fail-closed on unknown type (`KMPR.TABLES[type]` guard). No second orchestration engine required.
  - **The only non-HALT blocker is DEPLOYMENT (USER-owned):** `24_` + `90` bundle are `SOURCE MIRROR / NOT DEPLOYED`; live calls fail-closed via `rpoBundle_()` / `RECOMMENDATION_SCHEMA_NOT_READY` until synced + the S0 schema (`RECOMMENDATION_TARGET_SPREADSHEET_ID_`) is provisioned. Ties to **D-1/D-2**. This is not a repo-fixable gap and not faked.
- **Frozen answers (for R4):**
  - **§6 KMPS = classification (A).** Reads raw canonical tables (`sku_details, marketplace_skus, warehouses, marketplaces, fc_regular_forecast, fc_special_events, amazon_inventory_snapshot, overseas_inventory_snapshot, factory_stock, shipping_plans, shipments, replenishment_demand_allocation_rules, fc_target_rules, amazon_daily/weekly_sales_snapshot, campaigns, campaign_sku_lines`), **not** `inventory_replenishment_gap`/`order_planning_gap` nor gap-job state. Owns no gap/total/day-horizon formula; delegates to the frozen resolver (§14/§31) + allocators (§40). **Contradicts NO frozen authority** — parallel independent lineage from the KMREC summary path.
  - **§7 GAP-DONE final authority:** the persisted-draft path has **NO** GAP-DONE gate; `GAP_JOB_NOT_DONE` exists only in the non-persistent KMREC summary path (`47_…gs:59-88`). Rule: **KMPB/KMPW/KMPS recomputes from raw canonical tables → materialized-gap DONE is NOT a prerequisite for persisted-draft generation.** Its gate is `assertAuthorizedSchemasReady` (S0).
  - **§9/§11–13 shared-pool = wired.** `KMALLOC.allocateOverseasSharedPool`/`allocateFactoryDeterministic` invoked via `KMSF.projectAllocationInputs` (`supply-planning-source-facts.js:477/512`), one physical pool across all receivers per `(company,country,masterSku)` — no double-count. KMMSA present but NOT wired into this path.
  - **§10 OP writer ready.** KMPB/KMPW/KMPR persists BOTH `request_order_allocation_drafts` header + `_lines` via the plan path (not the `15_` user-edit adapter); user `order_qty` preserved across regen (`preserveUserQty` when `prev.userEdited`); recommended_qty immutable snapshot.
  - **§11 idempotency (frozen).** `KMPR.loadActiveDraftContext`: 0 active → CREATE · 1 → REUSE/reconcile · >1 → BLOCKED_CONFLICT. `ACTIVE_DRAFT_STATUSES={draft,site_confirmed}`. Reconcile supersedes (never hard-deletes) terminal rows. Identical rerun does not create a duplicate active draft.
  - **§13 stale/current rule (no new field).** Compare persisted `draft.{calculation_run_id, formula_version, calculated_at, source_data_as_of}` vs the latest authoritative run's values; newer `calculated_at`/`calculation_run_id` ⇒ stale. `draft_version` = concurrency lineage. `source_fingerprint` NOT required (`SCHEMA_GAP=NONE` upheld).
  - **§12 output contract (frozen for R4):** `{ success, data: { product, recommendationType, draftId, status, generationType, calculationRunId, calculatedAt, draftVersion, created|reused, lines[] } }` from `KMPW.persistProductionRecommendation`; lines expose the persisted snapshot/decision columns (UI renders DB values, never recomputes).
- **HALT (§8/§17) — `INVENTORY_MULTI_SOURCE_DRAFT_REPRESENTATION_BLOCKED` + `SCHEMA_CHANGE_REQUIRED`.** A multi-source Inventory recommendation (e.g. Overseas warehouse A + Factory warehouse B for one SKU, per FM6-R3 CO1100-R) **cannot be represented in one active shipping draft as frozen**, proven by two structural facts: (1) `KMPR.TABLES.WEEKLY_SHIPPING.lineKey = ['sku','site_sku','window_code']` excludes source/route → two source lines for the same SKU/window collide as `DUPLICATE_LINE_KEY`; (2) source is a **singular header** attribute (`recommended_source_warehouse_id`) and the active-draft scope excludes it → multi-source forces either >1 active draft (`BLOCKED_CONFLICT`) or multiple same-key lines (forbidden). The KMPB header builder does not even populate `recommended_source_warehouse_id`/method today. **Minimal delta (proposal only — HALT before applying, per §2):** add a keyed per-line source (`source_warehouse_id` and/or `route_no`) to `shipping_allocation_draft_lines` AND add it to `WEEKLY_SHIPPING.lineKey`, so one active draft holds one line per `(sku, site_sku, window_code, source)` with per-line source lineage. No new table; additive column + lineKey extension only. **Do NOT apply without authorization.**
- **§17 tokens NOT triggered:** `CANONICAL_PERSISTER_CONTRADICTS_FROZEN_FORMULA_AUTHORITY` (KMPS = A), `SHARED_POOL_OWNER_MISSING` (KMALLOC wired), `ORDER_PLANNING_PERSISTENCE_OWNER_MISSING` (KMPB path persists OP header+lines), `TWO_CANONICAL_PERSISTERS_REQUIRED` (one callable, both products).
- **Impact this round:** **audit + HALT only — NO code, NO schema, NO formula, NO scheduler, NO frontend, NO bundle change.** R4 (AI Plan → persisted draft → Execution Plan/Order Allocation UI) is **NOT yet authorized** — it is gated on (i) the schema decision for the Inventory multi-source line grain above, and (ii) deploying the KMPB/KMPW bundle + S0 schema (D-1/D-2). Order-Planning persistence is source-ready and unblocked; Inventory persistence is representation-blocked.

## D-F1-4B-FM6-R3C — Inventory multi-source line: additive schema delta is doable, but per-source quantity is a frozen-formula conflict 🔴 HALT (audit-only, 2026-08-10) · re-spec required

- **Round intent:** apply the minimal additive schema delta (`source_warehouse_id` + `source_warehouse_code_snapshot` on `shipping_allocation_draft_lines`, + extend `WEEKLY_SHIPPING.lineKey`) so the canonical KMPB/KMPW persister can write one shipping draft with multiple source-route lines — WITHOUT a new table, second persister, or formula change.
- **Code-verified audit (two owner traces):**
  - **The additive schema delta itself is clean + authorized.** Append the two columns at the END of the line header in `supply-planning-production-writer.js:50` (`DRAFT_HEADERS.WEEKLY_SHIPPING.lines`) + `16_shipping_allocation_handlers.gs:62-63` (`SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_`); writers are name-based (order-agnostic) and the schema validator allows trailing extras (`validateCanonicalHeaders`, prefix match). Extend `WEEKLY_SHIPPING.lineKey` at `supply-planning-persistence-repository.js:48` (independent of `MONTHLY_ORDER.lineKey:54`). Adding `source_warehouse_id` to the key correctly makes two same-SKU/window/different-source lines DISTINCT (INSERT, not supersede) and does not disturb `planned_qty` user-edit protection. Requires: deterministic sentinel normalization (blank key parts are HARD-REJECTED at `plan-builder.js:54` / `persistence-repository.js:195`), a **bundle rebuild** (KMPR/KMPB/KMPPB/KMPW are bundled), and header-count/lineKey-arity test updates (`allocation-draft-30-28-reconcile`, `allocation-draft-schema-audit`, `supply-planning-plan-builder`, `supply-planning-persistence-repository`).
  - **But producing multi-source LINES is blocked by a forbidden change.** (1) The per-source `allocationBreakdown[]` (Overseas/Factory each with `sourceWarehouseId`+`allocatedQty`, kept separate end-to-end from `KMSF.projectAllocationRecords(...,'OVERSEAS'|'FACTORY')`) survives only in **non-authoritative `metadata.lineMetaByKey`** (`plan-bridge.js:143/207`), NEVER threaded into the `planFact` KMPB consumes. (2) KMPB/KMPPB emit **exactly one row per `(sku,site_sku,window_code)`**, guarded by a **triple duplicate-key reject** (`source-facts.js:617`, `plan-bridge.js:171`, `plan-builder.js:127`). (3) **Decisive:** the canonical `recommended_qty` is **one carton-FLOOR over the summed `totalAllocated`** (`source-facts.js:643` `CALC.calculateShippingAndResidual`), NOT per-source; the raw per-source quantities (1100/3000) do **not** sum to that cartonized aggregate. §4's per-source-`recommended_qty` representation is exactly the **KMREX allocated+uncovered decomposition rejected as the persister in R3** (see [[D-F1-4B-FM6-R3]]), and producing it requires changing KMPB's frozen cartonization/quantity semantics — which R3C's own objective forbids ("Do NOT change recommendation formulas").
- **Conflict (the HALT):** §4 (per-source `recommended_qty` lines) and the objective ("no recommendation formula change") are **mutually exclusive under the frozen KMPB one-cartonized-aggregate model**. `SCHEMA_GAP` is still NONE for lineage; the blocker is a **quantity-semantics/plan-builder-contract** decision, not a missing field.
- **DECISION (user, 2026-08-10): HALT, no code — re-spec.** No engine/schema/bundle change this round. The next spec must first resolve the multi-source quantity model, choosing one of: **(A)** schema-ready + single-source-only (add columns, thread the single `lineage.sourceWarehouseId`, keep KMPB cartonization frozen; defer true multi-source fan-out); **(B)** explicitly authorize a bounded per-source quantity-semantics change (fan out per-source lines using KMALLOC's per-source `allocatedQty`, dropping/relocating the single carton-FLOOR); or **(C)** a different representation that keeps one cartonized aggregate line. Until then WEEKLY_SHIPPING multi-source writer = NOT READY; MONTHLY_ORDER writer remains READY (R3B).
- **Impact this round:** **audit + HALT only — NO code, NO schema, NO formula, NO bundle, NO scheduler, NO frontend change.** FM6-R4 (AI Plan → persisted draft → UI) stays gated on this decision + the D-1/D-2 deployment. Edit points above are recorded so an authorized re-spec can implement immediately.

## D-F1-4B-FM6-R3C2 — Aggregate-recommendation vs source-allocation semantics FROZEN + multi-source schema delta IMPLEMENTED ✅ (2026-08-10)

- **Resolves [[D-F1-4B-FM6-R3C]].** The R3C HALT was that persisting per-source `recommended_qty` would change the frozen cartonization. R3C2 reframes the model so no formula changes: **`recommended_qty` = the canonical aggregate (KMPB, cartonized ONCE per sku/site/window), preserved verbatim on every source line (non-summable); the per-source execution quantity is a SEPARATE additive snapshot.**
- **Phase-2 decision:** `planned_qty` is the user-editable decision column (`userQty`, edit-preserved) → NOT overloaded. Added `source_allocated_qty_snapshot`.
- **Schema delta (additive, appended; no new table):** `shipping_allocation_draft_lines` gains `source_warehouse_id`, `source_warehouse_code_snapshot`, `source_allocated_qty_snapshot` (28 → 31 cols) in BOTH `supply-planning-production-writer.js` (`DRAFT_HEADERS.WEEKLY_SHIPPING.lines`) and `16_shipping_allocation_handlers.gs`. Order-agnostic name-based writers; validator allows trailing extras. `MONTHLY_ORDER` unchanged.
- **Line key:** `WEEKLY_SHIPPING.lineKey` = `[sku, site_sku, window_code, source_warehouse_id, route_no]` with `nullableLineKey = {source_warehouse_id, route_no}` (Phase-3 deterministic nullable normalization). Blank source = genuinely-empty (unsourced/all-uncovered/historical) — **NOT a fabricated warehouse**; `validatePersistencePlan` + `KMPB.buildLineKey` + `applyUserDecisionEdits` relaxed to accept blank nullable parts; `naturalKeyStr` already maps blank→'' deterministically. `route_no` reused (no new route field).
- **Fan-out (Phase-8 threading):** the bridge (`supply-planning-plan-bridge.js`) threads KMALLOC/KMMSA `allocationBreakdown` verbatim into the planFact lineage; `KMPB.buildRecommendation` expands ONE recommendation fact into one execution line per physical source (grouped by `source_warehouse_id`+`route_no`, summing pool entries → no duplicate key), each carrying the aggregate `recommended_qty` + `source_allocated_qty_snapshot`. Blocked / no-allocation → one blank-source line. `MONTHLY_ORDER` stays 1:1. KMPPB/KMPR/Core unchanged beyond the shared cfg.
- **CO1100-R proof:** 4200 aggregate → OVERSEAS 1100 + FACTORY 3000 lines (recommended_qty=4200 on each, non-summable) + uncovered 100 (= recommended − Σallocated; derived, not a line). Σsource_allocated ≤ recommended; conservation preserved; no per-source cartonization.
- **DB/schema migration action (USER-owned):** add the 3 trailing columns to the live `shipping_allocation_draft_lines` sheet (blank on historical rows — they stay readable via nullable normalization). No backfill of historical source (blank when unknown).
- **Impact:** bundle REBUILT (KMPR/KMPB/KMPPB/KMPW; sha256 `5c1fa95f…`). NO gap/sales/forecast/cartonization formula change; NO KMREC/KMREX persister; NO PO/shipment/stock write; Order Planning unchanged. Tests: new `shipping-multisource-execution-f1-4b-fm6r3c2` (21) + updated schema-count/key-arity assertions; full suite 2855 pass / 2 pre-existing (replen-header-toggle). **WEEKLY_SHIPPING writer = READY (single + multi-source); MONTHLY_ORDER = READY.** Next slice: **FM6-R4** AI Plan → `generateRecommendationDraftLocked` → persisted draft → Execution Plan / Order Allocation UI (still gated on the D-1/D-2 bundle deployment).

## D-F1-4B-FM6-R3D — Whole-carton source EXECUTION allocation FROZEN + persistence readiness ✅ (2026-08-10)

- **Resolves the last R3C multi-source blocker.** R3C2 froze *representation* (aggregate `recommended_qty` repeated per source + raw `source_allocated_qty_snapshot`). R3D freezes the *auto-allocation rule* and wires the correct per-source **execution** quantity into `planned_qty`, so the persister no longer over-plans multi-source lines.
- **Newly frozen business rule (§2):** automatic source allocation uses **WHOLE CARTONS ONLY**. `wholeCartonAvailable(x,UPC)=floor(max(0,x)/UPC)*UPC`. Overseas fills before Factory; within a tier, sources are consumed in KMALLOC allocation-sequence order. A source contributes only whole cartons of **its own** available units — **loose residual units are NEVER auto-allocated** (cartons cannot be combined across physical warehouses; a human may later override, §4). `overseasAllocated + factoryAllocated + uncovered == R`; every per-source allocation is a carton multiple; `uncovered ≥ 0`.
- **Two quantity concepts (frozen, §1/§7):** **A. `recommended_qty`** = canonical aggregate demand authority (KMCALC cartonizes ONCE upstream; **NOT re-run** here), preserved verbatim per source (non-summable). **B. `planned_qty` (`userQty`)** = per-source cartonized EXECUTION allocation. `source_allocated_qty_snapshot` keeps the RAW per-source availability so loose stock stays visible. No new field / no schema delta (all columns present since R3C2).
- **Owner:** new pure `KMPB.allocateWholeCartonSources(recommendedQty, unitsPerCarton, sources)` (+ `wholeCartonAvailable`) in `supply-planning-plan-builder.js` — DECOMPOSITION of R, never a second recommendation formula (never increases any qty, never exceeds R). Available input = KMALLOC's **conserved** per-source `allocatedQty`, so carton flooring (which only REDUCES) can never over-allocate a shared pool (§5/§G).
- **Wiring (execution mapping boundary):** `expandSourceFacts` groups the threaded `allocationBreakdown` by `(source_warehouse_id, route_no)`, classifies tier from `sourcePoolType` (FBA/THREE_PL → Overseas, FACTORY → Factory), runs the decomposition, and sets each line's `executionQty` → `commandLine.userQty`. `unitsPerCarton` now threaded source-facts → bridge (WEEKLY `lineageObj`) → plan-builder. The Persistence **Core** (`supply-planning-persistence.js`) inits `userQty`/`order_qty` from `pl.userQty` when present, else the recommendation snapshot (KMPPB already read `nl.userQty`). MONTHLY + single-source/unsourced lines carry no `executionQty` → unchanged (planned/order = recommended).
- **§8 header:** `recommended_source_warehouse_id`/`_code` on the draft header is never populated per-line in the core (blank by default); line-level `source_warehouse_id` is authoritative. No MULTI sentinel exists / none invented.
- **CO1100-R / §3 proof (end-to-end through the real builder + Core):** R=2000, UPC=40, Overseas avail 1149 → whole-carton 1120 (loose 29 excluded), Factory avail 880 → 880, uncovered 0. `planned_qty` = 1120 / 880 (Σ = 2000 = R), NOT 2000 / 2000. `recommended_qty` = 2000 on each line (Σ 4000 — never summed as demand). `source_allocated_qty_snapshot` = raw 1149 / 880.
- **Negative constraints upheld:** NO gap / sales-rate / recommended-qty / cartonization formula change; NO loose-carton auto-consumption; NO second persister; 47.gs not a persister; no `recommendation_decisions` / parallel tables; no PO / shipment / stock write; manual `order_qty` preserved (`applyUserEdit` + `preserveUserQty`); Order Planning math untouched.
- **Impact:** bundle REBUILT (plan-builder/plan-bridge/source-facts/persistence bundled; sha256 `aea141da…`). Tests: new `whole-carton-source-allocation-f1-4b-fm6r3d` (50) covering §13 A–J + assertions + §3 end-to-end; reconciled 3 stale-key tests (`supply-planning-plan-builder`, `supply-planning-persistence-repository`, `supply-planning-user-edit`) + `shipping-multisource-execution-f1-4b-fm6r3c2` (UPC fixture) to the frozen 5-part key; full suite 164 files green except pre-existing `replen-header-toggle`. **AI Plan button NOT wired (deferred to the next slice per §11).** Next slice: Inventory/Order-Planning AI Plan → `generateRecommendationDraftLocked` → persisted draft → reload → Execution Plan / Order Allocation UI (still gated on D-1/D-2 bundle + S0 deployment).

## D-F1-4B-FM7-R1 — FC Share + Inventory Health + Shortage Competition authority FROZEN (audit-only) 🟢 (2026-08-10)

- **Round type:** AUDIT + CONTRACT FREEZE ONLY. NO allocation runtime, NO schema/formula/scheduler change, NO PO/shipment/stock write. Sole artifact = this register entry. Code-verified across four parallel audits (FC share/demand, health/18-day/Air, allocation_priority/KMALLOC, DB mappings/conservation).
- **Frozen authority contract:**
  - **FC_SHARE_ROLE = NORMAL PROPORTIONAL BASELINE (not a reservation/entitlement/priority).** Owner = `KMAF.projectAllocationFacts` §7/§24.5 `demandWeight = basis_i / Σ_group basis` ([supply-planning-allocation-facts.js:195-204]). Calculated on the fly (NEVER persisted; the DB `fc_regular_forecast.fc_share` column is a dead blank placeholder). Normalized within the **company+country** group; ONE level only (per-receiver SKU×marketplace/site) — no separate global/company-level share exists in code (the `factory_stock_allocation_plans.forecast_share` company/site split is specced-unimplemented, [[D-2]]). Basis: Sales-Driven → §22 `dailyDemand`; Forecast-Driven → `forecastShareQty` = Σ Regular FC M+1..M+4 (KMPCX, Special-Event excluded). Conservation: shares sum to 1 when `totalBasis>0`, else fail-closed `DEMAND_WEIGHT_UNRESOLVED` (never faked).
  - **Demand authority (one canonical owner per model):** Sales-Driven = `KMCALC.normalizedAvgSalesPerDay` ([supply-planning-calculations.js:290]); Forecast-Driven = `KMCALC.calculateForecastDrivenRemainingNeed` ([:489]). `KMHP.projectHorizons` consumes the resolved rate (no second averaging). The **allocation chain (KMAF→KMSF→KMALLOC) consumes ONLY these canonical owners.**
  - **OVERSEAS_POOL_ROLE = shared physical pool, conserved.** Owner `KMALLOC.allocateOverseasSharedPool`; lane-separated FBA/THREE_PL; qty=`effectiveSupplyQty`; company from `identity.company`. **FACTORY_POOL_ROLE = shared physical pool, conserved, NEVER reserved by FC share.** Owner `KMALLOC.allocateFactoryDeterministic` (§35 FIFO by required-by); pool stamped `FACTORY_SHARED` (cross-company, warehouse+SKU keyed) — FC share is planning baseline only, factory stock stays shared until recommendation/execution allocates it. Conservation proof: per-pool `remaining` monotonic decrement ([allocations.js:239/:364]) + `verifyConservation` strict `allocated+unused===totalSupply` ([:403-410], called :291/:392). One physical unit is never allocated twice **within a run**.
  - **18_DAY_ROLE = safety/shipping-risk + survival floor; NOT the priority-activation trigger.** `SURVIVAL_HORIZON_DAYS = 18` ([supply-planning-source-facts.js:391]) → `survivalNeedQty = ceil(18×dailyDemand)` per receiver. Per-site coverage `<18` is only a UI risk alert ([inventory-replenishment.js:1248/3938], hardcoded). **Proof `<18 ≠ competition`:** the allocator enters SHORTAGE only when the POOL cannot cover Σ survival (`poolSupply < Σ survivalNeed`, [allocations.js:199]); a single site below 18-day coverage does NOT trigger shortage/priority if the shared pool still covers everyone's survival.
  - **COMPETITION_TRIGGER = pool-level `poolSupply < Σ survivalNeed` (existing SHORTAGE_ALLOCATION mode), NOT per-site coverage.** No explicit NORMAL/RISK/CRITICAL/COMPETITION state machine exists; the binary SHORTAGE mode is the current competition detector.
  - **ALLOCATION_PRIORITY_ROLE = scarcity-arbitration preference, NOT normal-allocation order.** `marketplaces.allocation_priority` (numeric, default 0, PM-editable via `03_master_data_handlers.gs`), wired end-to-end into KMALLOC. Runtime status = **PARTIAL**: it drives allocated QUANTITY only in the overseas SHORTAGE branch (`weight = survivalNeed × max(priority,1)`, [allocations.js:202]); in NORMAL/PROTECTED, factory, and the monthly KMMSA path it is a deterministic leftover TIE-BREAK only (does not re-weight the proportional split). Amazon 100 > Walmart 90 therefore does NOT mean "always fully supply Amazon first" under normal supply. (Note: KMALLOC does not itself filter inactive marketplaces — receiver-set active-filtering is a caller responsibility to confirm in FM7-R2.)
  - **CARTONIZATION_ROLE = R3D whole-carton, UNCHANGED.** `recommendedQty = FLOOR(min(gap, totalAllocated)/UPC)×UPC` + per-source whole-carton execution decomposition ([[D-F1-4B-FM6-R3D]]). §4's example (required 2000, UPC 40, overseas 1149 → 1120, residual 29 = real physical stock, not fake-uncovered) is exactly R3D's frozen behavior — **no cartonization conflict.**
  - **AIR_RECOMMENDATION_ROLE = shipping/execution decision, NOT an allocation formula — AUTHORITY_GAP.** No Ocean-vs-Air/lead-time recommendation owner exists; `recommended_shipping_method` is a user-entered persisted header field ([16_shipping_allocation_handlers.gs:205]); route engine is FROZEN_NOT_IMPLEMENTED. Report-only per §F (not invented this round).
- **AUTHORITY GAPS (deferred to FM7-R2, none invented this round):** (1) `SCARCITY_WEIGHT_AUTHORITY_GAP = TRUE` — no priority+demand+health scarcity-weighting owner exists (only `survival×priority` in shortage); per §H the weighting DECISION is HALTed for the next slice. (2) Inventory-health NORMAL/RISK/CRITICAL classifier — AUTHORITY_GAP (only allocation modes + UI `needsAlert`/`dosColorClass`). (3) Projected-stockout DATE — AUTHORITY_GAP (only fixed-horizon D18/D30/D45/D90 gap via KMHP). (4) Canonical days-of-supply engine — AUTHORITY_GAP (UI-only `inventory-replenishment.js:670`). (5) Air/shipping-method owner — AUTHORITY_GAP (above).
- **CONFLICTS (known/pre-existing, non-blocking for the freeze):** (a) Demand-authority display divergence — legacy page `avgSalesPerDay = sales_units_7d/7` ([inventory-replenishment.js:303]) + target replicas (KMPD, request-order.js, forecast-engine.js) coexist with canonical KMCALC; already mid-migration to `horizonBasis.avgSalesPerDay` ([[D-F1-4B-FM5-R4J-LIVE9]] / LIVE9V). The canonical ALLOCATION path is unaffected (uses KMCALC). (b) Two allocation lineages — the live weekly page `sitePlanningAllocation` vs the canonical KMAF/KMALLOC path; FM7-R2 must build on the canonical one. (c) 18-day duplication — page hardcodes `ceil(daily×18)` instead of importing `SURVIVAL_HORIZON_DAYS` (same value/formula; consolidation nit, not a divergence). (d) Factory `FACTORY_SHARED` pool conservation is proven only WITHIN a single one-company `projectAllocationInputs` call — concurrent multi-company runs over the same physical `factory_stock` rows are NOT cross-run-reserved; FM7-R2 must define cross-run factory conservation.
- **SCHEMA_GAP = NONE** (all required columns/authorities exist; no migration). **NOT a round-blocking HALT** — the canonical allocation authority (FC Share → KMALLOC pools, conserved; priority = shortage-only arbitration; R3D cartonization) is coherent and freezable; the scarcity-weighting formula is the single decision explicitly deferred to FM7-R2 per §H.
- **EXACT NEXT AUTHORIZED SLICE (FM7-R2):** implement the allocation runtime on the canonical pipeline — Canonical Demand → KMAF FC Share baseline → KMALLOC shared-pool conservation → R3D whole-carton execution → post-allocation health (build on `KMHP.projectHorizons` + allocator `allSafe`) → 18-day NORMAL/RISK/CRITICAL classification → (gap) Air recommendation → COMPETITION (`poolSupply < Σ survival`) → **the scarcity-weighting decision must be specced FIRST** (priority + demand-share + health) before any `final_weight` formula is written; define cross-run factory conservation. No second engine, no second demand formula, no new tables.

## D-F1-4B-FM7-R2A — Scarcity arbitration FROZEN; cross-run Factory conservation HALTED (audit-only) 🟡 partial-freeze + bounded HALT (2026-08-10)

- **Round type:** AUDIT + BUSINESS CONTRACT FREEZE ONLY. No runtime/schema/formula/reservation/scheduler/UI change. Sole artifact = this entry. Builds on [[D-F1-4B-FM7-R1]] (frozen) and [[D-F1-4B-FM6-R3D]] (frozen); reopens neither.

### PART A — SCARCITY ARBITRATION = REUSE EXISTING (FROZEN, no invention)
- **SCARCITY_ARBITRATION_AUTHORITY = the existing KMALLOC overseas SHORTAGE branch** (supply-planning-allocations.js:196-208): weight = `min(survivalNeedQty, demandQty) × max(allocationPriority, 1)`, distributed by `distributeByWeightCapped(poolSupply, …)` capped at `demandQty`, conserved by per-pool `remaining` + `verifyConservation`. Source-proven and **consistent with FM7-R1** (priority affects quantity ONLY under proven competition; a bounded preference multiplier, never an entitlement or normal-order). **Result token: SCARCITY_AUTHORITY_REUSE_EXISTING.** A strict "cover every receiver's survival floor first, then priority for the residual" waterfall would be a future SCARCITY_AUTHORITY_REQUIRES_BOUNDED_CHANGE needing explicit authority — NOT adopted (would be invention).
- **COMPETITION_TRIGGER (unchanged from FM7-R1):** `poolSupply < Σ min(survivalNeedQty, demandQty)` → `SHORTAGE_ALLOCATION` (:199). Pool-level, not per-site coverage.
- **NORMAL_ALLOCATION_AUTHORITY:** KMALLOC NORMAL/PROTECTED = pure `demandWeight` (KMAF FC-share) split; priority is leftover-integer TIE-BREAK only, never re-weights the proportional split. Scarcity never silently becomes the normal formula (mode gate at :199).
- **ALLOCATION_PRIORITY_ACTIVATION:** quantity effect ONLY inside the SHORTAGE branch; elsewhere tie-break only.
- **PRIORITY_ZERO_SEMANTICS (FROZEN):** `max(priority,1)` ⇒ a stored/absent `0` is the **LOWEST VALID priority (still eligible)**, NOT "unconfigured→ineligible". Absent `marketplaces.allocation_priority` column ⇒ default `0` (db-api.js:373) ⇒ same lowest-valid floor. Priority never removes a receiver from the competing set.
- **SCARCITY_TIE_BREAK (FROZEN, deterministic, no RNG / no insertion-order):** overseas shortage = `priority desc → survivalNeed desc → marketplace asc → receiverKey asc` (:205-207); factory FIFO = `requiredByDate asc → priority desc → company asc → marketplace asc → destination asc → demandKey asc` (:349-353).
- **Decision cases:** A (pool 1200 ≥ Σsurvival 1000) → NO competition, NORMAL demand-share, priority no quantity effect. B (pool 800 < Σsurvival 1000; A 500/pri100, B 500/pri90) → SHORTAGE priority-weighted survival: A≈421, B≈379 (survival×priority, capped, largest-remainder + priority tie-break) — **frozen = existing KMALLOC shortage**, not sequential full-priority (which would make priority an entitlement, contra FM7-R1). C (urgency) → **no projected-stockout-date authority exists; urgency is NOT an overseas scarcity input**; factory already uses `requiredByDate` FIFO — no fabricated urgency. D (equal priority) → the deterministic tie-break chain above. E (priority 0/missing) → lowest-valid, eligible (per PRIORITY_ZERO_SEMANTICS).

### PART B — CROSS-RUN / CROSS-COMPANY FACTORY CONSERVATION = **RESOLVED (F1-7N-FA-3A.0, 2026-08-20)**
> **DECISION (USER-OWNED, FROZEN):** Cross-company factory surplus utilization is **authorized in Phase 1 ONLY as ANALYSIS-ONLY / PLANNING-ONLY NETTING** for recommendation and Net Order Need calculation. It grants **no** reservation, physical movement, deduction, or ownership-transfer authority. **Physical factory conservation remains per-company** (FM5-R2A unchanged); the analysis-layer netting operates on DERIVED planning-availability / releasable-surplus facts and **MUST NOT mutate physical factory pools**. Physical cross-company borrowing/reservation stays deferred until [[D-4]] / Phase-2 reservation authority.
> - Therefore the prior HALT `FACTORY_CROSS_RUN_CONSERVATION_REQUIRES_RESERVATION_AUTHORITY` **no longer blocks FA-3 planning implementation.** The future execution boundary is preserved as the token **`PHYSICAL_CROSS_COMPANY_RESERVATION_DEFERRED`**.
> - The "CROSS-RUN DOUBLE-USE RISK" recorded below is a **physical-reservation** concern (Phase-2). It does NOT apply to Phase-1 planning netting, which never commits or deducts physical stock — the recommendation is advisory and the user-approved Order Qty remains the transaction authority.
> - Owner-of-record for the planning-netting math + post-reallocation Net Order Need chain = `SUPPLY_PLANNING_CALCULATION_RULES.md` **§41** (this round); orchestration ownership = FIELD_OWNERSHIP_MATRIX **F1-6** (planning-only). Runtime module (reserved, NOT IMPLEMENTED) = `assets/js/core/supply-planning-surplus-reallocation.js` (namespace **KMFSR**; `KMSR` is already the Source Reader).
>
> _The analysis below is retained as the rationale/history that led to this decision._
- **FACTORY physical pool key (proven):** `warehouse_id + sku` — `factory_stock` has **no company column** (company joined via `warehouses.warehouse_id`); pool built keyed by SKU only (43_api_v1_gap_materialization.gs:398-405), stamped `FACTORY_SHARED` at projection (source-projection.js:50/245).
- **FACTORY receiver universe (as currently run):** grouped `company||sku`; each `company||sku` group re-reads the **full** SKU pool (43_...:433-436); conservation is **explicitly per-company** ("NEVER cross-company pool sharing; a company is the exact conservation boundary" — FM5-R2A, 43_...:466-468, 46_...:21-26).
- **Existing cross-run protection = NONE beyond a global script lock over the WRITE section.** LockService is a single Apps-Script script lock guarding the draft/gap **write** section only (24_...:72-76, 46_...:390-392); it encodes no company/product/pool key and does not protect stock quantities. Allocation *calculation* (the `factory_stock` read) happens OUTSIDE the lock. **No reservation, no deduction, no allocation journal** touches `factory_stock` (only the `recommendation_calculation_runs` run-status journal exists).
- **CROSS-RUN DOUBLE-USE RISK = YES.** If a SKU is sold by >1 company, KM and ResUS/ResTW each independently allocate the SAME physical `factory_stock` quantity in full → cross-company over-commitment. Intended by the frozen per-company boundary, and directly conflicting with the FM7 target principle "one physical Factory unit → at most one active allocation decision."
- **Why the safe options are blocked:** (A) BATCH-LEVEL GLOBAL (one allocation across all companies for `warehouse+sku`) is technically supported by `allocateFactoryDeterministic` (cross-company FIFO) BUT **reverses the frozen FM5-R2A per-company conservation boundary** — a frozen-decision reversal needing explicit authority. (B) PERSISTED ACTIVE-DRAFT AVAILABILITY / reservation **requires the unresolved [[D-4]] B-8 release semantics** (reservation currently fail-closed) — forbidden this round. (C) LOCK-ONLY is insufficient (prevents concurrency, not sequential re-read double-use).
- **HALT token: `FACTORY_CROSS_RUN_CONSERVATION_REQUIRES_RESERVATION_AUTHORITY` — SUPERSEDED/RESOLVED (see PART B DECISION above).** This was the physical-reservation blocker; it no longer applies to Phase-1 planning netting. The remaining boundary is `PHYSICAL_CROSS_COMPANY_RESERVATION_DEFERRED`. _(Historical: the "smallest next decision" below has been answered — Phase-1 planning netting authorized; physical borrowing deferred to [[D-4]].)_ **Smallest next decision (historical, user-owned):**
  1. **Is a single `sku` ever sold by more than one company?** If SKUs are company-exclusive, the FM5-R2A per-company boundary is already physically safe (no shared pool) and cross-run conservation needs no change. If SKUs are shared across companies, over-commitment is real and one of:
  2. **(A)** authorize cross-company BATCH factory allocation (reopen FM5-R2A per-company boundary; factory becomes one conserved pool across all eligible companies per `warehouse+sku`), or **(B)** first resolve [[D-4]] to authorize a factory reservation/release ledger.
- **FACTORY_CROSS_RUN_CONSERVATION_AUTHORITY = FROZEN (planning-netting authorized; physical reservation deferred).** Superseded by the PART B DECISION above: Phase-1 analysis netting is authorized (no physical effect); physical cross-company reservation/borrowing = `PHYSICAL_CROSS_COMPANY_RESERVATION_DEFERRED` (Phase-2/[[D-4]]). OVERSEAS is unaffected (company-owned FBA/3PL; per-company conservation is physically correct).

### Other frozen contract items (source-proven, no invention)
- **OVERSEAS_COMPETITION_KEY = `company || canonicalCountry || sku`** (KMMSA receiverKey, marketplace-supply-allocation.js:51); **FACTORY_COMPETITION_KEY = `warehouse_id + sku`** physical (currently competed per `company||sku`); **RECEIVER_KEY = `company || canonicalCountry || marketplace || sku`**.
- **ELIGIBLE_RECEIVER_OWNER:** eligibility CRITERIA are source-proven (`marketplaces.status` db-api:375 + `marketplace_skus.marketplace_sku_status` db-api:272 + company/country scope + `fulfillment_model` + valid demand authority), BUT **no canonical runtime filter applies marketplace active-status in the allocation path today** (only warehouse `is_active` gates pools; the sole marketplace-status filter is the Add-SKU dropdown UI). **AUTHORITY_GAP** → FM7-R2B must add the caller-side active/plannable receiver filter (KMSF/KMAF projection). No inactive marketplace may compete once wired.
- **FC_SHARE_RUNTIME_MODEL = `SINGLE_NORMALIZED_RECEIVER_SHARE`** (KMAF per-receiver `demandWeight` within company+country). Sufficient for FM7-R2 runtime; separate global/company/within-company % NOT required for runtime (later reporting feature only). Do NOT persist into the dead `fc_regular_forecast.fc_share`.
- **PHASE1_HEALTH_STATE_AUTHORITY (FROZEN from existing facts, no new formula, no stockout date):** NORMAL = receiver survival satisfied after canonical allocation (`allocatedQty ≥ min(survivalNeedQty, demandQty)`; allocator `allSafe`). RISK = below the 18-day safe threshold but survival still satisfiable / pool can protect. CRITICAL = survival CANNOT be satisfied after canonical allocation for this receiver (`allocatedQty < survivalNeedQty`). COMPETITION = pool cannot satisfy all receivers' survival (`poolSupply < Σ survivalNeed`, the SHORTAGE mode). **PROJECTED_STOCKOUT_DATE = NOT required and NOT fabricated.**
- **AIR_RECOMMENDATION_BOUNDARY:** no Air/Ocean route engine (AUTHORITY_GAP, unchanged). Allocation runtime MAY surface a derived boolean **`requiresExpediteReview = (state ∈ {CRITICAL, COMPETITION})`** — a projection of the frozen health state, NO carrier/lead-time math, and it does **NOT** choose Air vs Ocean. Actual shipping-method selection remains a later bounded round.
- **R3D pipeline compatibility (CONFIRMED):** order is pool allocation (KMALLOC raw units, incl. shortage/scarcity) → `recommendedQty` cartonize FLOOR → R3D per-source whole-carton decomposition. Scarcity weighting runs on raw units BEFORE cartonization; whole-carton rounding is never inside scarcity. Separation already holds — no conflict.
- **FM6_R4_PARALLEL_COMPATIBILITY = YES.** FM6-R4 persists the R3D output shape (aggregate `recommended_qty` + per-source `planned_qty`/source snapshots), which FM7 does NOT change (it only changes how KMALLOC computes the numbers underneath). R4 wiring stays infrastructure-only and can proceed in parallel; it must persist the R3D shape (stable), not an FM7-specific structure.

### Round outcome
- **SCHEMA_GAP = NONE. Formula impact = NONE. DB write = NONE.** Scarcity authority FROZEN (reuse existing); Factory cross-run conservation **HALTED** pending the user decision above.
- **EXACT NEXT AUTHORIZED SLICE:** resolve the Factory cross-run decision (SKU-company cardinality → batch vs reservation), then **FM7-R2B** may implement the allocation runtime for OVERSEAS (fully frozen) + the scarcity/health/eligible-receiver contract; FACTORY runtime is blocked until cross-run conservation is frozen. FM6-R4 (AI Plan → DB → UI) may proceed in parallel regardless.

---

## D-S8-A1 / D-S8-B1 — country identity canonicalization + missing-priority fail-closed (USER-APPROVED 2026-10-10, implemented S8-B1-R1)

Two narrowly-scoped decisions, recorded together because they repair ONE defect seen from two ends. A core
producer that compared `country` as a raw trimmed string missed a row that `43_` / `71_` / KMMSA matched through
KMCID; the miss presented downstream as "no priority"; and the missing-to-0 fabrication then turned that miss
into a real priority nobody had set. Repairing either alone leaves the other able to produce the same wrong
allocation. `SUPPLY_PLANNING_CALCULATION_RULES.md` §45.C.1 required a named round for each — this is it.

### D-S8-A1 — canonical country identity in the two core producers

- **Scope:** `supply-planning-source-projection.js` and `supply-planning-production-assembly.js` resolve country
  identity through `KMCID.canonicalCountryCode`, applied to **both operands** of every comparison and to the
  country component of `mktIdentityKey`. Company and marketplace are **unchanged** (trim-only, case-SENSITIVE),
  because `03_master_data_handlers.gs` upserts that way and case-folding them would merge rows the canonical
  owner keeps apart.
- **UK is equivalent to GB** — the one alias KMCID owns, and the one the database actually carries on both sides
  (`marketplaces` writes `UK`, `amazon_inventory_snapshot` stores `GB`). Case and whitespace fold.
- **EU remains an independent region identity** and is NEVER expanded into IT/DE/ES/FR. KMCID's
  `sourceCountriesForScope` does expand EU for SALES-source membership and is deliberately NOT used for identity.
- **No alias is invented.** An unsupported spelling (`USA` against `US`) still MISSES rather than being guessed
  into a match, so an unknown identity can never silently attach to another receiver.
- **Stored and displayed country values are never rewritten.** This is identity resolution only; no DB migration.
- **Canonical identity collisions are REPORTED, not resolved by arrival order.** Canonicalization can place a
  `UK` row and a `GB` row on one key. When two such rows carry DIFFERENT priorities the key answers MISSING and
  an issue is raised (`CANONICAL_MARKETPLACE_IDENTITY_CONFLICT`); MISSING is the state the consumers already fail
  closed on. Rows that AGREE still resolve — agreement is the ordinary case, and first row wins so the answer
  cannot depend on read order.

### D-S8-B1 — KMMSA receiver priority normalization (supersedes D-F1-4B-FM5-R2A in this ONE respect)

- An `allocationPriority` that is missing, null, blank, negative, non-numeric or non-finite returns
  `blocked('RECEIVER_PRIORITY_UNRESOLVED')` **before any allocation**, naming company / country / marketplace /
  sku. It replaces `if (pr === null) pr = 0;`, which collapsed five distinct states into a real priority.
- **An explicit numeric 0 remains VALID** — the lowest priority, ranked last, keeping its share.
- All-or-nothing: a blocked call allocates nothing and is never reported ready, so no partial allocation can be
  mistaken for success.
- The refusal uses the adapter's EXISTING `blocked()` mechanism — the same one already used for a missing
  `demandQty`, a duplicate receiver, a cross-company receiver and an unresolved factory eligibility. Priority was
  the only unresolved input that opted out of that rule.
- **Explicitly UNCHANGED:** D-FM5-R2A-1 (monthly protection mapping — `survivalNeedQty` defaults 0,
  `demandWeight` defaults to `demandQty`), D-FM5-R2A-2 (waterfall), D-FM5-R2A-3 (company isolation), the
  supplemental receiver-count / independent-pool freeze, the 18-day survival rule, factory FC-ratio allocation,
  and every §20/§24/§35/§40 formula. The adapter still owns no arithmetic.

### Consequential layers repaired in the same round (all §45.B.1 fabrication sites except one)

- **`43_api_v1_gap_materialization.gs`** no longer substitutes `0` at the point of use; the omission its map
  already preserved now survives to the refusal. A blocked group additionally NAMES its receivers, so affected
  receivers are not silently absent from the coverage map and read downstream as zero-covered.
- **Weekly Harvest Adapter** carries an unresolved priority through as `null` instead of `0`. Note recorded
  because it is easy to get wrong: `Number('')` and `Number(null)` are both `0`, so the file's own `num()` helper
  answers `0` for a blank cell — the empty forms are tested before any numeric conversion.
- **Weekly Input Assembler** fails the lane closed with an `UNRESOLVED_ALLOCATION_PRIORITY` issue rather than
  coercing through `num0`. It EXCLUDES rather than forwarding `null`, because §40's `requireQty` throws a
  TypeError on a non-number and §40 is do-not-touch this round; the exclusion follows the same shape the loop
  already uses for `MISSING_DESTINATION_WAREHOUSE`. `num0` remains in use for the two QUANTITY fields.

### Still open after this round (deliberately NOT in scope)

- **§45.B.2** — both core producers still carry a blank, non-numeric or negative value through verbatim; §40
  refuses it downstream, so no wrong number is produced, but later than §45.A.3 intends. Characterized as
  deviations G14/G15/G16.
- **The Inventory Replenishment page** `|| 0` fallback (class B display) is untouched; `inventory-replenishment.js`
  was do-not-touch this round.
- **Country canonicalization POLICY beyond identity** (for example whether any further alias should exist) is not
  decided here; KMCID's table is used as-is and unchanged.

---

## D-S8-B5-1 / D-S8-B5-2 — carton quantity semantics (USER-APPROVED 2026-10-10, implemented S8-B5-R2)

Golden #34's end-to-end execution (S8-B5-R1) found the unit quantity correct at every boundary and one field
disagreeing with its own documents: `carton_qty`. Three sentences said it was the exact ratio and "may be
fractional"; eight shipped write sites (`13_` x5, `11_` x3), two document renderers and
`OVERSEAS_INBOUND_SPEC.md` all treated it as `CEILING`. The registry promotion was held rather than decided
unilaterally, and the decision package (S8-B5-D1) put both readings to the owner.

### D-S8-B5-1 — `carton_qty` is the estimated physical carton count (Option A)

- **Decision:** on request-order and purchase-order lines, `carton_qty = CEILING(qty / units_per_carton)` — an
  **integer** estimated physical carton count. The fractional carton equivalent is **not** persisted anywhere
  and requires **no new DB column and no migration**.
- **Why Option A and not a separate fractional column.** `carton_qty` is multiplied by **per-carton** constants
  downstream (`shipping_plan_lines.cbm = carton_qty x carton_cbm`, `shipment_lines.gross_weight =
  carton_qty x carton_weight`). A partial carton still occupies one box's volume and carries one box's
  packaging weight, so a fraction there would **understate freight and customs figures**. No consumer anywhere
  was found that wants a fractional carton: the PO document's `{{TOTAL_CARTONS}}`, `purchase_orders.total_cartons`,
  the carrier invoice / packing list `CARTON_QTY`, and `carton_no_start`/`carton_no_end` all require integers.
- **The protected rule is unchanged and was never in question:** `order_qty` / `approved_qty` / `ordered_qty`
  are exact unit quantities, **never re-CEILING'd, FLOOR'd or rounded** at any stage. No code reconstructs a
  quantity as `carton_qty x units_per_carton`, so the ceiling cannot inflate an order.
- **The partial carton is a decomposition, not a fraction:** `FLOOR(qty / upc)` full boxes plus `qty mod upc`
  loose units — already how `request-order.js` renders it, and derivable from any stored row, which is what
  makes the "no new DB column" override-fact contract work.
- **Confirmed packed cartons stay independent:** `shipment_lines.shipment_carton_qty` with its validated
  `carton_no_start`/`carton_no_end` range is a separate packing fact, not this estimate.
- **Contract text aligned (documentation only, no runtime):** `SUPPLY_PLANNING_CALCULATION_RULES.md` §36.3 and
  §37, `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §7.1 and §12.15. §37's "its exact `carton_qty`" is clarified
  as **copied, not re-derived** — which is what the shipped PO conversion already does (`13_:1775` copies the
  stored value and computes only when the column is absent).

### D-S8-B5-2 — scope of this round: 1 + 2 + 4 only

- **Authorized and done:** the documentation alignment above; Golden #34's contract assertions; the Golden
  Registry promotion.
- **Explicitly NOT authorized:** `15_` draft-line normalization, any other Apps Script runtime change, DB schema
  change, shipment or document change. No `.gs` moved, so **no release cut and no Apps Script sync**.

### Still open after this round (deliberately NOT in scope)

- **`15_` draft-line fractional `carton_qty` debt.** `handleUpsertRequestOrderAllocationDraftLines_` still
  forwards whatever `carton_qty` the client sends, including a fraction, onto
  `request_order_allocation_draft_lines`. It is **never read downstream** — `66_` forwards only `order_qty` and
  `units_per_carton`, so no fractional value can reach `request_order_lines` — which is why it was left alone
  rather than fixed in a documentation round. **Owner: a future bounded draft-normalization task. NOT closed.**

---

## D-S8-C1-1 / D-S8-C1-2 / D-S8-C1-3 — IR missing-priority fail-closed + canonical country (USER-APPROVED 2026-10-10, implemented S8-C1-R1)

The last §45.B.1 fabrication site. `assets/js/pages/inventory-replenishment.js` resolved a receiver's priority
as `(reg && reg.allocationPriority) || 0`, which collapsed FOUR different facts into one number — no marketplace
registration, null, blank, and an explicit 0 that is a VALID lowest priority (§45.A.1) — and §24.7's
`MAX(priority, 1)` then weighted all of them the same as a real priority of 1. The fabricated receiver took a
share of the pool, shrank every sibling's share, and the group was reported as a complete `SHORTAGE_ALLOCATION`.

### D-S8-C1-1 — fail closed at the independent allocation group (Option B)

- **Boundary:** company + country + Master SKU. That is already the pool boundary — `sharedPhysicalPool` and the
  sibling `marketplace_skus` filter use the same three keys — so one group is one pool and one competing
  receiver set, and blocking one cannot touch another.
- **Option A (block the whole operation) was REFUSED on contract grounds, not on effort.** Nothing exists above
  the group except the page, so "the operation" could only mean the page, and §45.A.5 classes A and D forbid
  withholding the listing and every priority-independent calculation.
- **Blocked result:** `state: 'PRIORITY_UNRESOLVED'`, `sitePlanningAvailable: null`, `allocatedToCurrent: null`,
  every allocation-derived figure null, **no `byKey`**, and `unresolvedReceivers: [{company, country,
  marketplace}]`. `_allocateShared` is **not called**. Preserved: the physical pool, the 3PL contributions, the
  18-day need and every non-priority figure.
- **Named, never dropped.** Silently excluding the unresolved receiver would hand its share to its competitors —
  the same wrong answer as the fabricated 0, only harder to see. A dedicated test proves the two differ.
- **MODE GATE (the one judgement in this round).** Only `SHORTAGE_ALLOCATION` blocks. §24.8 gives priority a
  role in NORMAL too, but that role is **§24.5 step 3** — distributing the surplus above the 18-day floor — and
  this page has never implemented step 3 (the surplus stays unallocated, a long-declared gap). As implemented,
  NORMAL and NO_DEMAND read no priority, and §45.A.5 class D is explicit that a calculation which does not read
  one must not be blocked by one. **Forward obligation: when §24.5 step 3 lands, NORMAL starts consuming a
  priority and the guard must widen with it.** The predicate is written as "would this mode read a priority"
  so the reason is visible at the point of change.

### D-S8-C1-2 — canonical country identity for the priority lookup

- The lookup resolves country through **KMCID** (`UK` = `GB`; `EU` stays an independent region, never expanded).
  Company and marketplace keep their existing comparison rules — **country only**.
- KMCID is loaded as a route asset on `ops`, ahead of the page. It is not a second alias table: KMCID declares
  itself a mirror of this page's own frozen `IRCountry.SAME_MARKET_ALIAS`, and a test asserts the two agree.
- **Deliberately NOT canonicalized:** the eligible-3PL-warehouse filter and the sibling `marketplace_skus`
  filter. Both decide **membership**, so changing them would move displayed physical quantities and the
  allocation denominator, which is outside a missing-priority round. Recorded in §45.B.3 as an open residue.

### D-S8-C1-3 — implement now

Done as a frontend-only correction. No `.gs`, no DB, no router, no new API action, no release cut.

### Still open after this round (deliberately NOT in scope)

- **§24.5 step 3** on this page (surplus above the 18-day floor) remains unimplemented; see the forward
  obligation above.
- **Pool / receiver-set country membership** still compares raw (§45.B.3 residue).
- **§45.B.1 remaining fabrication sites** are unaffected by this decision: `43_`, the Weekly Input Assembler and
  the Weekly Harvest Adapter were closed in R50; **KMMSA's frozen model-b adapter stands under D-F1-4B-FM5-R2A
  as narrowed by D-S8-B1**.

---

## D-S8-C2-1 / D-S8-C2-2 — §45.B.2 Producer Early Validation DEFERRED, scope fixed to both producers (USER-APPROVED 2026-10-10)

S8-C2-R1 traced G14 / G15 / G16 and found **one root cause, not three**: every one of them goes through
`projectRecommendationProductionSources` in `supply-planning-source-projection.js`, which stores
`priorityByMktKey[k] = r.allocation_priority` verbatim and emits it unvalidated. `has()` already keeps a MISSING
column missing and a canonical-identity CONFLICT already yields `undefined` + an issue; what is missing is a
check on a value that is PRESENT but unusable — blank (G14), non-numeric text (G15), negative (G16).

**The round STOPPED before implementation and was right to.** Both producers are compiled VERBATIM into
`90_generated_supply_planning_bundle.gs`, whose content hash is pinned in `63_api_v1_system_health.gs`
(`KM_BUNDLE_CONTENT_HASH_`). `build-apps-script-bundle.js --check` confirmed the bundle is currently in sync at
`a113e56e…`, so one character in either producer forces a bundle rebuild, a `63_` manifest update, a new release
identity and an Apps Script sync of two `.gs` files.

### D-S8-C2-1 — DEFER (no standalone R51)

- **Decision:** do NOT cut a release for this correction alone. Bundle it into the next backend release that is
  independently justified.
- **Why this is safe to defer:** no wrong number is produced today. `supply-planning-source-facts.js` refuses with
  `MISSING_OR_INVALID_ALLOCATION_PRIORITY` and the fact-set reports `clean: false` / `ready: false`, so the
  established fail-closed convention already holds. §45.B.2 describes the defect exactly — *"the refusal arrives
  later than this contract intends"*. This is **hardening, not an active-bug fix**, and it does not earn its own
  cut and manual sync.

### D-S8-C2-2 — BOTH PRODUCERS

- The correction must cover **`supply-planning-source-projection.js`** (emission sites `:457` receiverRows and
  `:467` factoryRows, each with a `has(f,'allocationPriority')` caller bypass that must also be validated) **and
  `supply-planning-production-assembly.js`** (`:190`, one emission site). The second carries the identical defect
  and has no G number only because the characterization suite never exercised it.
- **§45.B.2 stays OPEN until both producers pass their contract tests.** It may not be marked closed on the
  strength of the G-numbered producer alone.

### Constraints the future round inherits

- Validate at the EMISSION point, not in the map build: filtering invalid values out of `priorityByMktKey` would
  change canonical-identity conflict detection, which is R49-F / D-S8-A1 behaviour and is not authorized here.
- **Numeric strings stay VALID and are emitted VERBATIM.** This producer's established parsing contract already
  treats `100` and `'100'` as one answer (conflict comparison is on `str()` forms, with an in-source note that
  preserving the TYPE is deliberate). The core KMMSA input contract must NOT be broadened to accept strings.
- Blank/null → UNRESOLVED (§45.A.2), the same state as an absent column. Negative / non-numeric / non-finite →
  INVALID (§45.A.3), recorded as its own issue so it is distinguishable from absent, with the emitted value
  unresolved so nothing invalid travels.
- KMCID identity needs no change — D-S8-A1 already routes both producers' `mktIdentityKey` through it.

---

## D-S8-B3-1 … D-S8-B3-6 — Overseas Allocation Preview (USER-APPROVED 2026-10-10; implementation BLOCKED at GATE A)

**Approved and recorded:** action contract **18 → 19** (B3-1); one local **R51** cut (B3-2); **backend-first**
deployment (B3-3); the deferred **C2** producer fixes ride in the same release (B3-4); Preview ships **INACTIVE**
(B3-5); action name **`overseasAllocation.preview.get`** (B3-6).

**S8-B3-R1 did NOT implement them.** GATE A ("if membership semantics are unresolved, STOP before
implementation") fired on evidence, and §10's unresolved-architecture STOP with it. What the gate proved, and
what it could not resolve, is recorded here so the next round starts from facts rather than from this analysis
being redone.

### What GATE A PROVED — the server-side contract already exists and is deployed

`43_api_v1_gap_materialization.gs` is the existing server KMMSA caller, and the Preview must borrow it whole:

- **Pools** — `gapOpReadSupplyPoolFacts_` keys overseas pools `company||canonicalCountry||sku`, joining
  `overseas_inventory_snapshot` to `warehouses` on **3PL + active only** (FBA excluded), with missing ≠ 0 and a
  negative quantity fail-closed. Already reused by `46_` and `61_`, so a third reader is ordinary.
- **Group / receivers** — `gapOpBuildSupplyAllocation_` partitions `byCompanyCountrySku` and calls
  `KMMSA.allocateMarketplaceReceiverSupply({overseasPools, receivers, eligiblePoolTypes:['THREE_PL']})`.
- **UK/GB membership is ALREADY canonical on all three axes** — warehouse country
  (`whById[id].country = gapCanonCountry_(…)`), receiver country (`cc = gapCanonCountry_(r.country)`) and the
  priority key (`gapCanonCountry_(m.country)`) all resolve through KMCID. **This axis is NOT the blocker.**
- **Priority** — already fail-closed since D-S8-B1: `priorityByMkt` omits an unresolved priority and the harvest
  carries the absence through as `null`, so KMMSA refuses with `RECEIVER_PRIORITY_UNRESOLVED`.

### What GATE A could NOT resolve — three open decisions

1. **Receiver-set membership has no existing owner for this request shape.** `gapOpHarvestReceivers_(scopes, …)`
   is handed its `scopes` by the caller; nothing maps `company + country + masterSku` → the competing marketplace
   list. The two candidate sources give **different competing sets and therefore different allocations**:
   `marketplaces` / `64_api_v1_scope_registry.gs` (every active marketplace in the scope) versus
   `marketplace_skus` (only those carrying this Master SKU — the Inventory Replenishment convention, and the
   grain KMMSA competes at). Choosing is a business decision, not an implementation detail.
2. **Demand basis forces N live recommendation calculations per Preview.** Receiver `demandQty` is
   `L.allocatedForecastQty` from `io.workspaceGet`, which is the **live Order Planning workspace calculation**,
   explicitly "one workspaceGet/scope". Reusing it is mandatory (§2: no second demand engine) — but a Preview
   over a group of N marketplaces therefore costs N full recommendation projections synchronously. That is a
   first-load / latency architecture decision of the class that requires approval.
3. **The enumeration source compares country RAW.** `64_api_v1_scope_registry.gs` projects `marketplaces` with
   `scopeRegStr_(r.country)` and no KMCID, so a `UK`/`GB` split enumerates as two scopes while the pool and the
   receiver group resolve as one. §45.B.3's open residue lands exactly on this action's front door.

### Consequence

The Preview's request schema `{company, country, masterSku, asOf}` carries no marketplace list and no demand, so
the handler would have to **choose** 1 and **pay** 2. Both were refused rather than guessed. **R51 was not cut,
no runtime was written, and the C2 fixes stay deferred with it** — they were to ride in this release, and there
is now no release for them to ride in until the three questions above are answered.

---

## D-S8-B3-7 / B3-8 / B3-9 — Preview receiver membership, performance, country enumeration (S8-B3-D2, 2026-10-10)

### D-S8-B3-7 — Receiver membership = `marketplace_skus` — **VERIFIED, with one open sub-question**

- **Source:** `marketplace_skus` (`marketplace_sku_id`, `marketplace_id`, `sku`, `company`, `country`,
  `marketplace`, `site_sku`, `marketplace_sku_status`, `replenishment_model`, `fulfillment_model`), filtered
  `sku = masterSku AND company = scope.company AND canonicalCountry(country) = canonicalCountry(scope.country)`.
  This is the grain KMMSA competes at (per Master SKU) and the convention Inventory Replenishment already shows
  operators, so it introduces no new membership idea.
- **Fulfillment model must NOT filter.** `DATABASE_RELATIONSHIP_MAP.md` is explicit that a platform-fulfilled
  marketplace MAY still participate in the shared 3PL reserve - *"participation in the reserve is a
  warehouse-side question, not a fulfillment-model exclusion"* - and IR implements exactly that
  (`participates = true`). A platform-fulfilled receiver stays in the competing set.
- **Membership and missing data are DIFFERENT answers, and both are needed.** Not a member of the group -> the
  row is simply absent. A member whose required data is unresolved -> the member is **named and the group fails
  closed**, never dropped: dropping a receiver hands its share to its competitors, which is the same wrong
  answer as a fabricated priority. Measured against the real KMMSA, an unresolved priority returns
  `{blocked:true, ready:false, issues:[{code:'RECEIVER_PRIORITY_UNRESOLVED', ...}]}`.
- **OPEN SUB-QUESTION - `marketplace_sku_status`.** `marketplaces.status` has an eligibility precedent (the
  scope registry skips non-active), but **no existing contract filters the competing set on
  `marketplace_sku_status`**: IR's sibling-site filter does not consult it. Excluding an inactive marketplace
  SKU would be inventing eligibility semantics and would change allocation denominators, so it is NOT assumed.

### D-S8-B3-8 — Performance architecture — **PROPOSED / BLOCKED. Synchronous is NOT authorized.**

- **The call chain, traced:** `gapOpHarvestReceivers_(scopes, ...)` -> `io.workspaceGet` **once per scope** ->
  the LIVE Order Planning recommendation calculation (`recommendationWorkspaceDefaultIo_`) ->
  `L.allocatedForecastQty`. One scope = one marketplace, so an N-marketplace group is **N live recommendation
  calculations**.
- **Production already measured that this does not fit.** `46_api_v1_gap_materialization_job.gs` records that
  *"a multi-scope slice risked exceeding the Apps Script continuation execution budget (~6 min) and being
  KILLED mid-slice... One scope per slice keeps every continuation well inside budget."* The existing system
  was redesigned to **one scope per execution** after a multi-scope execution was killed in production. A
  Preview is a web request with a tighter bound still - the client read timeout is
  `KM_READ_TIMEOUT_MS_ = 45000`.
- **A real reuse opportunity exists and is partial.** `preReadSnapshots_` / `KMPS.readCanonicalSnapshots`
  already share the raw snapshot sheet reads across scopes, so the I/O floor is paid once; what remains per
  scope is the calculation. That lowers the slope but not the structure, and no trustworthy Apps Script latency
  figure can be produced from a Node measurement.
- **A materialized source exists but carries a DIFFERENT quantity.** `order_planning_gap` is already
  materialized per `company|country|marketplace|sku` with a read action (`handleGetOrderPlanningGap_`) - one
  bounded read, no recomputation. But its columns are `t1_gap_qty` / `t1_suggested_qty`, and the allocation
  competes on `allocatedForecastQty`, which is **not persisted**. Previewing from the gap table would allocate
  over a different demand basis than production did. That is a business-semantics choice, not a shortcut.
- **Therefore, per the task's own rule, no reliable synchronous upper bound was established, so synchronous
  implementation is NOT authorized.** This decision stays OPEN.

### D-S8-B3-9 — Country enumeration through KMCID — **VERIFIED, via a Preview-specific adapter**

- `64_api_v1_scope_registry.gs` compares country **raw** (`scopeRegStr_(r.country)`, no KMCID) and is consumed
  by `km-data-access.js` and `assets/js/core/scope-registry.js`, which drive the **Inventory Replenishment
  selectors**. Canonicalizing it in place would merge `UK` and `GB` in that page's Country selector and would
  need a `SCOPEREG_PROJECTION_VERSION_` cache invalidation - a user-visible change to an unrelated caller.
  **Decision: do NOT change `64_`; the Preview canonicalizes in its own adapter.**
- **Canonicalization can CREATE a duplicate receiver, and that is handled fail-closed.** Measured: a `UK` row
  and a `GB` row for the same company+marketplace+sku collapse to one canonical key and the real KMMSA returns
  `{blocked:true, issues:[{code:'RECEIVER_IDENTITY_CONFLICT', message:'duplicate receiver KM||GB||amazon||S'}]}`.
  No duplicate is silently merged and no pool is expanded.
- EU stays independent, no alias is invented, company and marketplace identity are untouched, and the physical
  pool eligibility contract (3PL + active, FBA excluded) is unchanged.

### Response conservation — **VERIFIED against the real allocator**

Deterministic fixture, pool 412 across three 3PL warehouses, run through
`KMMSA.allocateMarketplaceReceiverSupply`: SHORTAGE 207/137/68 = 412; NORMAL 150/150 with 112 unused; single
receiver 412; explicit priority 0 valid at 248/164. Every quantity an integer, and in every case
`SUM(contributions) = poolQty`, `SUM(receivers) = allocatedTotal`, and `allocatedTotal + unallocated = poolQty`.

**Response-schema corrections the real output requires** (the S8-B3-D1 draft was wrong on three points):
`blockedCode` does not exist - the shape is `{ready, blocked, issues:[{code,message}]}`; `mode` is
`overseas.allocationMode`; totals are `overseas.totalAllocatedQty` / `totalUnusedSupplyQty`; per-warehouse
attribution is available in `overseas.allocations[]` (`sourceWarehouseId`, `allocatedQty`); and a
**`singleReceiver: true`** success carries **no `overseas` object at all**, so the schema must treat an absent
mode as a valid success rather than a failure.

**Also surfaced:** `allocationMode` is §40's mode and is driven by `survivalNeedQty`, not by demand vs pool.
`43_`'s `msaReceivers` passes no `survivalNeedQty` (MONTHLY decision 2 defaults it to 0), so the monthly
overseas path reports `NORMAL_ALLOCATION` almost always. Sourcing a survival need for the Preview would be a
further decision; reporting §40's mode verbatim is the honest alternative.

---

## D-S8-B3-8 / B3-10 / B3-11 / B3-7a — Preview async architecture and demand contract (S8-B3-D3, 2026-10-10)

### D-S8-B3-8 — Async Preview — **ARCHITECTURE VERIFIED; one store question still OPEN**

- **The job lifecycle is reusable as a PATTERN, not as a shared product.** `46_api_v1_gap_materialization_job.gs`
  keeps job state in **Script Properties**, not a table:
  `GAP_JOB_PROP_KEYS_ = { INVENTORY: ..., ORDER_PLANNING: ... }` with `gapJobReadState_` / `gapJobWriteState_`
  over `env.props`. **So an async Preview needs NO new DB table for job state.**
- **Do NOT extend the gap job's product enum.** Adding a Preview product would edit
  `gapJobNormalizeProduct_`, `GAP_JOB_PROP_KEYS_`, `GAP_JOB_CONTINUATION_HANDLERS_`, `gapJobResultTableFor_`
  (which assumes a result TABLE the Preview does not have) and the status handler's
  `INVENTORY|ORDER_PLANNING` validation — i.e. it would change Gap Materialization to add a feature that is not
  gap materialization. **A separate Preview job module mirroring the proven lifecycle is the isolated choice.**
- **The script lock is GLOBAL.** `LockService.getScriptLock()` is per-script, so a Preview job and a gap job
  contend on one lock. That is acceptable under the existing bounded-wait design
  (`GAP_JOB_LOCK_MS_ = 10000`, `GAP_JOB_MAX_LOCK_WAITS_ = 8` then `RESCHEDULED_LOCKED`) but it means Preview and
  Gap Materialization are **serialized, not concurrent**, and that must be stated rather than discovered.
- **Proven budgets to inherit verbatim:** worker clean-exit budget `240000` ms (never relying on the ~6-min hard
  kill as flow control); stale/reclaim `600000` ms; self-heal recovery delay `420000` ms (deliberately LONGER
  than the hard kill, so it only fires on a kill); `MAX_RECOVERIES_ = 5`; `MAX_SLICE_ATTEMPTS_ = 3`.
- **The Preview slice is NARROWER than Order Planning's.** OP expands any sub-company selection to the whole
  company because the FACTORY pool competes company-wide. The overseas pool competes per
  (company, canonicalCountry, sku), so **one Preview slice = one allocation group** - the smallest conserved
  unit the frozen contract allows.
- **OPEN: where the Preview RESULT lives.** Script Properties allow ~9216 bytes per value and the job's own safe
  budget is 6912 (75%). A result with N receivers plus warehouse contributions can exceed that, and the existing
  code treats an oversized partition as a truthful terminal
  (`CONTENDED_FACTORY_PARTITION_SIZE_LIMIT`), never a silent fallback. `CacheService` is used **nowhere** in the
  deployed Apps Script (`60_` states "NOTHING IS PERSISTED. No sheet row, no Cach[e]"), so adopting it would be
  new infrastructure. A result table would be a new DB table. **This is a real decision and is not assumed.**

### D-S8-B3-10 — Demand basis stays `allocatedForecastQty` — **FROZEN**

- Produced by the LIVE Order Planning workspace calculation and read in `gapOpHarvestReceivers_` as
  `demandQty = gapNum_(L.allocatedForecastQty)`; a line with no quantified demand is not competing.
- **No existing materialized or cached output carries the same semantic value.** `order_planning_gap` persists
  `t1_gap_qty` / `t1_suggested_qty`; `calculatedGap` is the §41 residual basis. None of them is
  `allocatedForecastQty`. **No substitution** - `t1_gap_qty`, `t1_suggested_qty`, `requested_qty` and
  `planned_qty` are all refused as stand-ins absent a separate business decision.
- **Compute once per receiver, persist only a temporary Preview result.** The async job computes each receiver's
  demand exactly once per run and keeps it only in the run's own result, which expires. Nothing is written into
  a business table, and no second demand engine exists.

### D-S8-B3-11 — Survival need — **report KMMSA's actual mode; do NOT synthesize one**

- The authoritative inputs are §24.4 `minimum_18d_need = CEILING(daily_demand x 18)` for the survival-protected
  paths; the MONTHLY overseas path **deliberately defaults it to 0** - KMMSA:
  `survivalNeedQty: (qty(r.survivalNeedQty) === null ? 0 : ...)  // MONTHLY default 0 (decision 2)` and
  `demandWeight` defaulting to `demandQty`. "Decision 2" is **D-F1-4B-FM5-R2A**, which **D-S8-B1 left
  explicitly unchanged**.
- **Consequence, measured:** because survival is 0 on this path, §40 selects `NORMAL_ALLOCATION` in cases a
  demand-vs-pool reading would call a shortage. Supplying a survival need would therefore change **mode
  selection and the allocated numbers**, not merely a response label - so it is an allocation-algorithm change,
  not a presentation choice.
- **Decision: the Preview reports `overseas.allocationMode` verbatim** and never reinterprets or recomputes it.
  No 18-day survival calculation is invented inside Preview.

### D-S8-B3-7a — `marketplace_sku_status` is **INFORMATIONAL** — **FROZEN**

- No frozen eligibility rule exists: no planning spec makes it a filter, and IR's sibling-site filter does not
  consult it. `marketplaces.status` has an eligibility precedent (the scope registry skips non-active);
  `marketplace_sku_status` does not.
- **Decision: retain every Master SKU member row and report `marketplace_sku_status` as metadata.** Excluding
  inactive rows would invent eligibility semantics and move allocation denominators.

### Action surface — larger than B3-1 assumed, but the VERSION is unchanged

The proven async pattern is **Start / Status / Cancel**, with results served by a **separate read action** (the
gap job writes `order_planning_gap`; `handleGetOrderPlanningGap_` reads it). A Preview therefore needs **3-4
actions**, not the single action proposed in D-S8-B3-1. The contract VERSION still moves **18 -> 19**: the rule
is one bump per release in which actions are added, not one per action. `SYS_REQUIRED_ACTIONS_` stays unchanged
until a page depends on them.

---

## D-S8-B3-12 / B3-13 / B3-14 / B3-15 — Preview result store, snapshot consistency, lock impact (S8-B3-D4, 2026-10-10)

### D-S8-B3-12 — Preview result store = the EXISTING chunked Script-Property store — **FROZEN**

- **Correction to D-S8-B3-8.** That entry recorded the result store as OPEN because
  `46_api_v1_gap_materialization_job.gs:45-47` describes a ~9216 B per-value ceiling and a truthful terminal
  `CONTENDED_FACTORY_PARTITION_SIZE_LIMIT`. **That comment is stale.** F1-7N-FA-3C-PRE1 superseded it with
  `GAP_JOB_PARTITION_VERSION_ = 2` MULTI-PROPERTY chunked storage, and `CONTENDED_FACTORY_PARTITION_SIZE_LIMIT`
  now appears **only in that comment** - it is thrown nowhere in the shipped source.
  `SUPPLY_PLANNING_CALCULATION_RULES.md:2412` already records the supersession. **No new store is needed.**
- **The existing mechanism already provides exactly the integrity the Preview requires:**
  `gapJobPartitionWrite_` chunks under **generation-specific keys** and returns a META
  (`version` / `generationId` / `chunkCount` / `byteLength` / `checksum`) that the caller persists **LAST** - an
  atomic generation swap; `gapJobPartitionRead_` **FAILS CLOSED** on a missing chunk
  (`..._CHUNK_MISSING`), a byte-length mismatch or an FNV-1a checksum mismatch (`..._CHECKSUM_MISMATCH`) - it can
  never return a partial or mixed-generation result; `gapJobPartitionCleanup_` prunes stale generations bounded by
  exact key prefix, `gapJobPartitionPurge_` clears on job end. Proven by
  `assets/tests/contended-factory-partition-storage-f1-7n-fa-3c-pre1.test.js`.
- **MEASURED capacity** (real `KMMSA.allocateMarketplaceReceiverSupply` + real `gapJobChunkString_` /
  `gapJobUtf8Len_`; full envelope incl. run identity, scope, generation fingerprint, expiry, every receiver, every
  warehouse contribution, unused supply, unallocated demand and issues - **nothing truncated**):

  | receivers | warehouses | bytes | chunks | alloc records |
  |---|---|---|---|---|
  | 1 | 5 | 1,103 | 1 | 0 (singleReceiver) |
  | 5 | 5 | 10,895 | 2 | 9 |
  | 10 | 5 | 18,656 | 3 | 14 |
  | 20 | 5 | 34,180 | 5 | 24 |
  | 50 | 5 | 80,717 | 12 | 54 |
  | 50 | 20 | 89,102 | 13 | 69 |
  | 50 | 50 | 106,695 | 16 | 99 |

- **Structural bound, verified in every case:** allocation records = **receivers + pools - 1** exactly. The pool
  loop drains sequentially, so each record either exhausts a pool or satisfies a receiver. Result size is therefore
  **linear in receivers**, not receivers x warehouses.
- **MAX_SUPPORTED_GROUP_SIZE = 80 receivers**, from a declared `PREVIEW_RESULT_SAFE_BYTES_ = 131072` (128 KB =
  25% of the ~500 KB total Script-Properties store), leaving 75% for gap-job state and its partition chunks. At
  ~1,560 B/receiver this is ~84 receivers; 80 is the declared cap with a truthful terminal
  `PREVIEW_RESULT_SIZE_LIMIT` above it - **never a silent truncation**. Headroom is large: §2412 records 228
  receivers for an ENTIRE company across all scopes, and a Preview group is ONE (company, country, master SKU).
- **The whole store is shared.** 300 receivers = 92% of the 500 KB store and 400 = 123%, so an uncapped Preview
  could starve the gap job's own state. The cap is what prevents that, and it is the reason the cap is declared
  rather than left implicit.

### D-S8-B3-13 — Four actions, HOUSE naming — **FROZEN**

The router convention is `<feature>.job.start` / `gapJob.status.get` / `<feature>.job.cancel` (01_router.gs:722-737),
not the `overseasAllocation.preview.*` spelling proposed in the task. **Adopt the house convention:**
`overseasAllocationPreview.job.start` · `overseasAllocationPreview.job.status` ·
`overseasAllocationPreview.result.get` · `overseasAllocationPreview.job.cancel`.
The results action is **not optional**: the proven pattern separates the job from its output (the gap job writes
`order_planning_gap`; `handleGetOrderPlanningGap_` reads it). Status carries progress, never the result payload.

### D-S8-B3-14 — Synchronous `overseasAllocation.preview.get` is **RETIRED**

Superseded by the async surface. D-S8-B3-6 is closed.

### D-S8-B3-15 — Global script lock — **AMENDED, cannot be accepted as proposed**

- **Traced:** `gapJobContinue_` acquires the script lock at its top (`:432`) and releases it only in the closing
  `finally` (`:603`) - **the lock spans the ENTIRE slice loop, up to `GAP_JOB_WORKER_BUDGET_MS_` = 240000 ms**
  (longer if the worker is hard-killed). `LockService.getScriptLock()` is per-SCRIPT, so a Preview worker shares it.
- **The bounded-wait budget cannot absorb that hold.** `GAP_JOB_MAX_LOCK_WAITS_` = 8 at
  `GAP_JOB_CONTINUATION_DELAY_MS_` = 1000 ms is ~8 s nominal against a 240 s hold - two orders of magnitude short.
  The loser does not degrade; it takes the truthful terminal `LOCK_UNAVAILABLE_TIMEOUT` -> **FAILED**.
- **The asymmetry is the whole finding.** Preview losing to a gap job is tolerable (truthful BUSY, retryable).
  **A gap job losing to Preview is a REGRESSION of a shipped production job**, because its 8x1 s budget would
  expire against a long Preview hold. So the new entrant must never be the long holder.
- **Smallest safe design change, confined to the new Preview module - no edit to `46_`:**
  1. The Preview worker **holds the script lock only for brief state transitions** (the pattern START already
     uses: *"a quick write that acquires the script lock ... and returns IMMEDIATELY (no calculation in the
     request)"*, 01_router.gs:718-721). It is **never held across sheet reads or allocation computation**, so it
     cannot starve a gap worker.
  2. Preview-vs-Preview exclusion uses the **existing optimistic guard**, not a longer lock: re-read state before
     committing and abort if `live.runId !== state.runId` (the proven check at `46_:563`).
  3. A Preview-local lock-retry delay sized to outlast a gap worker (8 waits x 60000 ms = 480 s > 360 s), so
     Preview waiting on Gap ends in a retry, not a FAILED.
- **No new concurrency system is invented**; triggers stay isolated because `gapJobClearContinuationTriggers_`
  deletes only its own exact handler name (`gapJobDeleteTriggersByHandler_`), so a Preview trigger is never
  collected by the gap job and vice versa.

### Snapshot consistency — A, B and C are NOT equivalent, and only C matters

- **Traced:** `gapJobProcessSlice_` (`46_:648`) builds a **fresh io** and runs a **fresh**
  `gapOpReadSupplyPoolFacts_(ss)` on **every continuation**. Only the calc context
  (`calculationDate` / `calculationMonth` / `planningCycle`, frozen at START) and the persisted factory-contention
  partition are carried across slices. **Receiver membership, marketplace priority, overseas inventory and forecast
  demand are RE-READ per slice from the live spreadsheet.**
- Therefore: **(A) same runId** is guaranteed by job state; **(B) same calculation generation** holds only for the
  frozen calc context, not for the business inputs; **(C) an actual consistent source snapshot across slices is
  NOT provided by the existing infrastructure.** No atomic snapshot isolation is claimed.
- **Resolution, by construction rather than by validation:** a Preview **allocation group is indivisible** -
  conservation requires the complete competing receiver set in one call, so a group can never be split across
  slices. A Preview run scoped to ONE (company, canonicalCountry, masterSku) is therefore **one slice, one
  execution, one read** - cross-slice drift cannot arise. Consistency C is achieved by scope, not by locking.
- **Where C genuinely cannot be guaranteed** (a future multi-group Preview), each group carries its OWN
  `snapshotGenerationId` + per-source `inputFingerprint`, groups are never summed across generations, and a result
  whose inputs do not all attribute to one generation is reported **stale/void**, never served as a number.

### Retry idempotency — **MEASURED, 13/13**

Against the real allocator: three identical runs produce identical per-receiver allocation **and** identical
contribution records; **reversed receiver input order** and **reversed pool input order** both produce identical
output (a re-read may return rows in a different sheet order, so this is the property that matters); a duplicated
receiver is **blocked** `RECEIVER_IDENTITY_CONFLICT`, never silently merged; a foreign company is **blocked**
`CROSS_COMPANY_POOL_FORBIDDEN`; conservation holds on every run
(`SUM(receivers) = totalAllocated`, `totalAllocated + totalUnused = totalSupply`); and the comparison is
**non-vacuous** - a changed input does change the result, so drift is detectable. A retried slice recomputes a
whole group from a fresh read and replaces the result atomically via the generation swap, so a retry can never
produce a partial or duplicated result. **Frozen inputs are therefore NOT required for deterministic retries**, and
no extra storage cost arises.

---

## S8-B3-R1A — R51 IMPLEMENTED: Overseas Allocation Preview + §45.B.2 producer closure (2026-10-10)

**D-S8-B3-12 / B3-13 / B3-14 / B3-15 are APPROVED and IMPLEMENTED. D-S8-C2-1 / C2-2 are DISCHARGED.**

### What landed

- **`74_api_v1_overseas_allocation_preview_job.gs` (NEW)** — a READ-ONLY async Preview of the frozen §20/§24
  overseas shared-pool allocation for ONE allocation group (company + canonical country + master SKU). It owns
  **no formula**: pool eligibility from `gapOpReadSupplyPoolFacts_`, demand from `gapOpHarvestReceivers_`
  (`allocatedForecastQty`), distribution from `KMMSA.allocateMarketplaceReceiverSupply`. Numbered 74_ and not 47_
  because `47_api_v1_recommendation_generation.gs` already exists.
- **Four router actions**, house naming: `overseasAllocationPreview.job.start` / `.job.status` / `.result.get` /
  `.job.cancel`. **Action contract 18 → 19** (one bump; the rule counts releases, not actions).
  `SYS_REQUIRED_ACTIONS_` and the list version do **not** move — no page depends on the Preview.
- **`OVERSEAS_ALLOCATION_PREVIEW_ENABLED_ = false`** in `00_config.gs`. The gate is checked **before** the env is
  built, so a disabled Preview opens no spreadsheet, writes no job state and arms no trigger; the continuation
  handler checks it too, so a stray trigger cannot work after a rollback. **EXECUTED, not asserted** (suite §A).
- **§45.B.2 producer corrections** rode the same release, as D-S8-C2-1 deferred them to. Zero extra `.gs` files:
  R51 already rebuilds `90_` and already moves `63_`.

### D-S8-B3-15 — the short-lock contract, as implemented

`gapJobContinue_` holds the shared per-script lock across its whole slice loop (≤ 240000 ms) while its bounded
wait is 8 × 1000 ms. **Preview losing that race is tolerable; a Gap job losing it is a regression of a shipped
job.** So the Preview is never the long holder:

1. Lock held ONLY for short state transitions — **never** across a sheet read, a `workspaceGet`, a KMMSA
   allocation or result serialization. **Executed**: the fake lock is instrumented and the expensive calls record
   whether it was held; all three report `false`, and the run is proven to have acquired it at all (non-vacuous).
2. Preview-vs-Preview exclusion is the **optimistic `runId` guard**, not a longer lock.
3. `OAP_LOCK_RETRY_DELAY_MS_` (60000) × `OAP_MAX_LOCK_WAITS_` (8) = **480000 ms**, which outlasts both a Gap
   worker's 240000 ms clean-exit hold and a ~360000 ms hard kill — so waiting ends in a RETRY, never a FAILED.
4. **`46_` is NOT modified.** The chunk primitives (`gapJobChunkString_` / `gapJobUtf8Len_` / `gapJobFnv1a_` /
   `gapJobPad4_`) are product-agnostic top-level functions and are called directly; the gap job's state keys,
   state writer and partition writer are never reached into.

### Snapshot consistency — by SCOPE, not by machinery

An allocation group is **indivisible** (conservation needs the complete competing set in one KMMSA call), so a
Preview run is one slice, one execution, one set of reads — cross-slice drift cannot arise. What a single
execution still cannot rule out is drift **between the read and the publication**, so the inputs are
fingerprinted at read time and **revalidated immediately before publishing**; a mismatch is `SOURCE_DRIFT`,
bounded-retried, and never published. **No atomic spreadsheet snapshot is claimed.** The fingerprint is
**order-independent**, so a re-read returning rows in a different order is not mistaken for drift.

### Result store — the EXISTING mechanism

Generation-keyed chunked Script Properties under a Preview-owned prefix; META committed LAST (atomic
publication); fail-closed on a missing chunk, a byte-length mismatch or a checksum mismatch; cleanup bounded by
exact prefix. **Enforcement is on serialized UTF-8 BYTES** (`OAP_RESULT_SAFE_BYTES_` = 131072), with the 80-receiver
cap as a policy guard — both are truthful typed failures, never truncation. The 128 KB budget leaves 380928 B of
the shared ~500 KB store for the Gap job, which is the reason the cap is declared rather than left implicit.

### Deviations from the task spec, with reasons

- **Module numbered 74_, not 47_** — `47_api_v1_recommendation_generation.gs` already exists and a duplicate
  numeric prefix is a sync hazard.
- **No frontend cache token was rotated.** The two corrected producers are **server-side only** — no page loads
  them; they reach Apps Script through `90_` and the browser through nothing. The only browser file touched is
  `operation-system-db-api.js`, whose contract pin moves 18 → 19 to stay EQUAL to the deployment. Rotating a token
  would assert a frontend change that did not happen.

---

## S8-B3-R2 — R51 ACCEPTANCE AUDIT — **BLOCKED, ONE CORRECTIVE PATCH REQUIRED** (2026-10-11)

Independent read-only audit of R51 at `8c0bd487`. **R51 is NOT accepted for deployment authorization.** One
runtime defect reaches a required property; one coverage gap does not block but should ride the same patch.

### F1 — BLOCKING — a superseded worker deletes a NEWER run's result chunks

`oapJobContinue_` phase 3, superseded branch:

```js
oapResultPurge_(env, (live && live.resultMeta) ? live.resultMeta.generationId : null);
```

`oapResultPurge_` deletes **every** key under the Preview prefix except the one generation it is told to keep.
When the newer run has written its chunks but has **not yet committed its META** — precisely the window the
generation-keyed design exists to survive — `live.resultMeta` is `null`, the keep-set is empty, and the stale
worker deletes the newer run's chunks.

**Reachable by a plain operator action, EXECUTED, not reasoned:** Cancel, then Start again, while the previous
worker is still inside its unlocked phase 2. Cancel makes the old run terminal instantly, which is what lets the
new START succeed; the old worker then reaches phase 3, sees a different runId and purges. Staleness is NOT the
path — a worker idle past `OAP_STALE_MS_` (600000) would have been hard-killed at ~360000 and never reach phase 3.

**Consequence:** the new run commits a META pointing at chunks that no longer exist, and `result.get` answers
`RESULT_INTEGRITY_FAILURE` / `PREVIEW_RESULT_CHUNK_MISSING`. It **fails closed** — no wrong number, no mixed
generation, no business data touched — but a valid run is destroyed and the operator is shown an integrity error
instead of a result. §7's required property *"Cleanup cannot delete a newer run's chunks"* does not hold.

**Required corrective patch** (NOT applied by this round):

```js
// delete only the chunks THIS worker wrote; a superseded worker has no business
// deciding which chunks belong to anyone else
function oapResultPurgeGeneration_(env, generationId) {
  if (!env.props.keys || !generationId) return 0;
  var pfx = OAP_RESULT_PREFIX_ + ':' + generationId + ':';
  var all = env.props.keys() || [], removed = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].indexOf(pfx) === 0) { try { env.props.del(all[i]); removed++; } catch (_e) {} }
  }
  return removed;
}
```

and in the superseded branch, `oapResultPurgeGeneration_(env, generationId)` in place of the keep-set call.

**The DONE branch is correct as written and must NOT be changed.** There, the worker has already verified under
the lock that it IS the live run, so every other generation is genuinely an orphan; and a competing START cannot
interleave because START needs the same lock.

### F2 — NON-BLOCKING — the calculation context is outside the input fingerprint

`oapFingerprint_(receivers, pools)` takes two arguments. `calculationMonth` is read, published in
`generation.calculationMonth`, and **never compared**. EXECUTED: a month rollover between the read and the
revalidation does **not** raise `SOURCE_DRIFT`; the control case (a changed demand quantity) **does**, so the
guard is live and the gap is specific.

**Why this is not a correctness defect.** `calculationMonth` is never passed to KMMSA. It reaches the allocation
only through `demandQty` and `requiredByDate`, both of which ARE fingerprinted — so no allocation-relevant input
escapes the guard, and a published result's month always describes the numbers it accompanies. What can happen is
a result published under month M while the system has moved to M+1; it is internally coherent and expires within
`OAP_RESULT_TTL_MS_`. §6 nonetheless lists calculation month/context as required coverage, and the hardening is
one line: thread the context into the digest and compare it with the rest.

### Verified and holding

- **§5 lock safety.** No blocking wait exists: `OAP_LOCK_RETRY_DELAY_MS_` is only ever passed to
  `scheduleContinuation`, and the execution returns `RESCHEDULED_LOCKED` immediately. The 480000 ms budget is
  wall-clock across eight separate executions, never a held wait. The lock is proven (by instrumentation, not
  inspection) not held during the sheet read, the workspaceGet/harvest or scope enumeration.
- **§8 transitive writes.** Code-only call graph is `KMCID.canonicalCountryCode`, `KMMSA.allocate…`,
  `gapCalcResolveContext_`, `gapEnumerateScopes_`, `gapOpReadSupplyPoolFacts_`, `gapOpHarvestReceivers_`, the four
  chunk primitives, `gapMaterializationDefaultIo_`, plus Properties/Lock/ScriptApp/Utilities. **None of the four
  43_ helpers contains a write primitive**, and `gapOpHarvestReceivers_` touches `io.workspaceGet` and nothing
  else. No business table is reachable for writing, directly or indirectly.
- **§3 cumulative delta R49 → R51 is SIX Apps Script files** — `00_`, `01_`, `43_` (carried from the unshipped
  R50), `63_`, `74_`, `90_` — which matches the reported sync list exactly, verified against git rather than
  against the report.
- **§7 everything except the cleanup property**: runId and cancellation checked at publication, META after chunks,
  checksum and expiry both block reads (non-vacuously — restoring the chunk unblocks), result identity matches
  the requested scope, no old run overwrites a newer one.
- **§9 / §10** parity and the full C2 matrix hold; §11 gates are green and the bundle reproduces.

### Note for whoever writes the deployment plan

The cumulative **frontend** delta since R49 is **not empty** — `index.html`, `app.js`, two page scripts, two
stylesheets and the API client all changed across the unshipped R50/B2/C1 rounds, and the cache token in the tree
is `r50-irpriority-20261010`. R51 itself rotates no token and that remains correct, but a deployment plan that
treats "R51 changed no frontend" as "no frontend publication is pending" would be wrong.

---

## S8-B3-R2-FIX1 — R51 CORRECTIVE PATCH — F1 and F2 CLOSED (2026-10-11)

Both findings from the S8-B3-R2 acceptance audit are fixed inside R51. **No new release identity**: R51 keeps
`F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51`, action contract stays 19, the client pin stays 19, `90_` is NOT rebuilt
(`74_` is not a bundled module — verified, not assumed) and its hash still reproduces at `3de64364…`. No frontend
cache token rotated. One runtime file changed.

### F1 — CLOSED — a superseded worker may delete only its own generation

**Root cause.** The superseded branch called `oapResultPurge_(env, live.resultMeta ? … : null)`, whose contract is
*"delete everything under the prefix EXCEPT the generation you name"*. When the run that superseded us has written
its chunks but has not yet committed its META — exactly the window the generation-keyed design exists to survive —
there is no generation to name, the keep-set is empty, and the stale worker deletes the live run's chunks.

**Fix.** A new `oapResultPurgeGeneration_(env, generationId)` deletes only keys under
`OAP_PREVIEW_RESULT:<generationId>:` and the superseded branch calls it with its OWN `generationId`. A superseded
worker knows exactly one thing for certain — which generation it wrote — so it is given no way to express an
opinion about anyone else's. **FAIL-SAFE: a missing, null or empty generationId deletes NOTHING**; a cleanup that
has lost track of its subject must never fall back to deleting broadly.

**Generation ownership (§4), asserted rather than assumed.** `generationId` = `<runId>-<8 hex fingerprint>`, and
the store key appends `:`. Neither a runId (`OAP-<digits>-<digits>`) nor a hex fingerprint can contain `:`, so
`genA + ':'` can be a prefix of `genB + ':'` only if `genB` begins with `genA + ':'` — unrepresentable. Tested
against a generation whose id EXTENDS ours, one that is a PREFIX of ours, a foreign generation, an
already-deleted generation, an empty id, and a store with no `keys()`: in every case exactly the intended keys
move, the Gap job's state and partition chunks are untouched, and the fail-safe cases delete nothing.

**The DONE branch is unchanged, deliberately.** There the worker has already verified UNDER THE LOCK that it is
the live run, so every other generation really is an orphan, and a competing START cannot interleave because
START needs the same lock. That ownership check is what makes the broad form safe — and its absence is precisely
what made the superseded branch unsafe. A regression assertion proves DONE cleanup still removes an eligible
orphan generation.

### F2 — CLOSED — the calculation context is part of the fingerprint

`oapFingerprint_` now takes `(receivers, pools, contextKey)`, where `oapCalcContextKey_` composes
`calculationDate`, `calculationMonth`, `planningCycle` and the harvested calculation month. The values come from
the EXISTING owner `gapCalcResolveContext_` (43_) through a single `env.calcContext` — **no second resolver**, and
the materialization io is built from that SAME resolved context, so the window the Preview fingerprints is by
construction the window it calculates in. `planningCycle` is `'RECO-' + calculationMonth` at that owner, so it is
derived rather than independent; it is included because the fingerprint should record what the context SAID
rather than a guess about which of its fields can move alone.

### Non-vacuity — both fixes are proven against the PRE-FIX code

The suite de-patches the shipped source in memory and re-runs the same scenarios. **Pre-fix: run B's chunks are
destroyed, 0 of 2 survive** (so the post-fix assertion is a real regression guard), and **pre-fix: a month
rollover between the read and the revalidation publishes a result** (so the drift assertion is real too). A
source-level section additionally pins the production wiring, because `oapReadGroup_` reads the context through
an optional guard and an env that lost `calcContext` would silently reinstate F2.

### Evidence

`overseas-preview-superseded-cleanup-s8-b3-r2-fix1.test.js` **76/0** · Preview suite **133/0** (unchanged) ·
producers **37/0** · R49-G **78/0** · action registry **208/0** · deploy surface **106/0** · release stamp gate
**111/0, 0 survived, vacuity clean** · Golden Registry **206/0, 40/40** · contended-partition storage **22/0** ·
Gap Materialization job **145/0** (untouched by this patch, asserted).

### Addendum — the release gate this correction had to teach a distinction

The post-commit sweep flagged `E4` in
`ai-plan-advice-boundary-transit-safe-method-f1-7n-fc-1b-e3-r4-a2-r1-r5.test.js`: *"no single-stamp manifest owner
carries a stamp older than its own last change"*. `74_` declares R51 and changed again after R51 was cut, so by
that method its stamp looked unrotated.

**The method is right and was kept.** What it could not express is a CORRECTION INSIDE AN UNSHIPPED CUT. The
R49 → R50 precedent is the sharp edge and it points the other way: R49 was CUT, **SYNCED and DEPLOYED**, so new
bytes under the R49 id would have made one id name two different trees, and three gates correctly refused it.
That reasoning depends entirely on the cut having SHIPPED. No Apps Script project carries R51, so there is no
deployed tree for this correction to diverge from and the id still names exactly one tree.

The exemption is therefore narrow and self-cancelling: it applies only to a stamp equal to the CURRENT
`SYS_DEPLOYMENT_RELEASE_`, and only while the ledger records that release as `NOT DEPLOYED`. The moment R51 is
synced and the ledger says so, every file stamped R51 is policed exactly as before. A stamp naming an OLDER
release that changed later is still caught — that is the defect this gate exists for — and marching a stamp
forward to look current is caught by the release-stamp gate's own C-series. Exempted files are **named in the
output**, never silently skipped, and both conditions carry non-vacuity assertions (`E4c`, `E4d`).

**Scope note:** this is a test-file change outside the Preview suites, admitted under the task's "release
metadata: only if an actual release gate requires a correction". It was required, and the reason is recorded here.

---

## S8-B3-R2-RECHECK — R51 RE-AUDIT — **READY_FOR_DEPLOYMENT_AUTHORIZATION** (2026-10-11)

Independent re-audit at `13729cce`, with its own harness and fixtures rather than a re-read of the fixing
round's. Both findings are closed, the E4 exemption survives six negative tests, and the cumulative package is
complete. **A READY classification does not authorize deployment.**

### F1 — closed, re-proven independently

The original race was reproduced from scratch — A starts, A cancelled, B starts, B writes chunks with no META,
A resumes — and every §3 property holds: A deletes only its own generation (0 of its own keys remain), **B's two
chunks survive**, B's state and its trigger are intact, B's META commits and its Result GET succeeds, A cannot
serve under its own runId, and zero business writes are attempted. **The Gap job's state and partition chunks are
byte-identical**, before and after. Against a de-patched pre-fix source the same harness destroys both of B's
chunks, so the guard is load-bearing rather than decorative. (Pre-fix, the Gap job was never at risk either — the
defect was always Preview-internal.)

### F2 — closed, and the "missing context" question is answered with a measurement

§4 asked whether a missing context can SILENTLY BYPASS F2 in production. It cannot.

1. **`env.calcContext` is always present in production.** `oapDefaultEnv_` declares it, so the optional guard in
   `oapReadGroup_` can never take the false branch there.
2. **A context can still fail to RESOLVE.** `gapCalcResolveContext_` returns `{ok:false, code, message}` on an
   invalid execution date — reachable only through a broken clock, since `gapCalcTaipeiYmd_` is pure arithmetic,
   but structurally real.
3. **Measured, that degrades rather than bypasses.** A healthy context key is
   `2026-10-10~2026-10~RECO-2026-10~2026-10`; a broken one is `~~~2026-10`. The three resolver fields drop out,
   **but the harvested calculation month remains**, so a month rollover is STILL caught. The degraded key is
   deterministic, so it raises no false drift either. Each of the four fields was separately shown to move the
   digest.

**Therefore NOT blocked.** The classification question §4 posed has a measured answer rather than an argued one.

### E4 exemption — six negative tests against the SHIPPED predicate

The exemption's own text was lifted out of the suite and evaluated against mutated inputs, so what is under test
is the shipped predicate and not a restatement of it. Exemption **GRANTED** only for the baseline (stamp = current
release, ledger says NOT DEPLOYED); **REJECTED** when the release is marked DEPLOYED, for an R52 identity absent
from the ledger, for a ledger entry with the status removed, for an unknown/garbled status, for a release missing
from the ledger entirely, for a file stamped with an older (R41) release, for a future stamp, and for an empty
stamp. After shipping, a future stamp is not exempt by default. The live ledger does record R51 as NOT DEPLOYED
and Production as R49, so the baseline measures the real file.

**The normal gate is not weakened for future releases.** The exemption requires a release to be BOTH current AND
recorded unshipped — a deliberate act, never a default — and it cancels itself the moment the ledger says
otherwise, with no further edit.

### Cumulative package

**Apps Script (6):** `00_config.gs` · `01_router.gs` · `43_api_v1_gap_materialization.gs` (carried from the
unshipped R50) · `74_api_v1_overseas_allocation_preview_job.gs` · `90_generated_supply_planning_bundle.gs` ·
**`63_api_v1_system_health.gs` LAST**.

**Pending FRONTEND publication since R49 — six browser files**, and this is a SEPARATE claim from "R51 rotated no
cache token", which is also true: `index.html`, `assets/js/app.js`, `assets/js/api/operation-system-db-api.js`,
`assets/js/pages/inventory-replenishment.js`, `assets/js/pages/site-priority.js`,
`assets/css/pages/inventory-replenishment.css`, `assets/css/pages/site-priority.css`. The five changed
`assets/js/core/*` modules are **not** in this set — verified, not assumed: neither `index.html` nor `app.js`
references any of them; they reach Apps Script through `90_` and the browser through nothing.

### Backend-first compatibility

The client check is `deployed < expected` — a MINIMUM — so an R49 frontend runs against an R51 backend. The R51
frontend requires contract 19 and the deployment reports 19. No browser file references the Preview actions, no
Preview page or navigation entry exists, the flag ships `false` and is checked before the env is built, and there
is **no Apply action anywhere** in `74_` or `01_router.gs`. Gap Materialization (145/0), IR C1 and Site Priority
B2 are unchanged.

### Classification

**READY_FOR_DEPLOYMENT_AUTHORIZATION.** Three operations remain distinct and user-owned: (A) backend source
synchronisation, `63_` last; (B) Apps Script deployment version publication; (C) frontend publication of the six
pending browser files. None of them is performed by this round.

### Remaining deviations

1. **Pre-existing, not a FIX1 regression, and out of this round's scope:** `workspaceIo` hard-codes `ok: true`
   while copying `calculationDate` / `calculationMonth` / `planningCycle` from the resolved context, so a
   `{ok:false}` resolution is laundered into a context `gapMaterializationDefaultIo_` accepts as valid. Verified
   present at `8c0bd487` (R1A) and unchanged since, so FIX1 neither introduced nor worsened it — FIX1 in fact
   improved the neighbourhood, because the fingerprint and the io now share ONE resolution and can no longer
   disagree across a rollover. Worth a future round; it is not a Preview-specific defect and it is not reachable
   without a broken clock.
2. Carried and unchanged: module numbered `74_` (name collision with `47_api_v1_recommendation_generation.gs`);
   the E4 exemption exists at all; the frontend publication backlog described above.

---

## S8-B3-R3-GATE1 — R51 DEPLOYMENT ENVIRONMENT VERIFICATION & CACHE SAFETY (2026-10-11)

Deployment prerequisites closed ahead of the R51 release. **No release identity, no runtime handler and no
contract moved**: `index.html` carries one corrected cache token, one new test suite enforces the rule behind
it, and the release runbook is now a permanent document rather than a scratchpad draft.

### F-PD1 — CLOSED. One token, and the commit that should have rotated it

`0172443e` (S8-C1) added the four `.replen-tp-unresolved*` rules to
`assets/css/pages/inventory-replenishment.css` **and, in the same commit, rotated every other browser cache
token** to `r50-irpriority-20261010` — leaving this one `index.html` line at `irrestinglayout-20261008`, the
value set back in `230525a2`. So the file changed and its URL did not, and a browser holding the live
stylesheet would never have refetched it: the S8-C1 fail-closed priority diagnostic would have rendered
UNSTYLED for every returning operator.

**The first correction was wrong, and the existing suites caught it.** Setting the stylesheet to the
application token `r50-irpriority-20261010` looked right — it is the value its cohort received in the very
commit that changed the file — and it broke 28 suites, because this stylesheet is deliberately NOT in the
application series. `assets/css/pages/inventory-replenishment.css` owns an append-only family ledger
(`IR_CSS_TOKEN_SERIES` in `assets/tests/_release-order.js`) and three suites assert the two families are
never crossed, one by checking the token's SHAPE. The shipped correction is therefore a NEW member of the
stylesheet's OWN family, **`irtpunresolved-20261011`**, appended to that ledger with its reason beside the
six entries before it. **No stylesheet content was modified and no unrelated token was rotated.**

The lesson is recorded rather than tidied away: a round that rotates a cache token must first ask WHICH
FAMILY the asset belongs to, because the repository has four and the obvious value is frequently the wrong
one.

### The rule the gate actually enforces, and the rule it deliberately does not

The obvious phrasing — every token must have been set at or after its file's last change — is true as a style
rule and WRONG as a gate, because it fires on history that was published long ago and is therefore already
correct in every cache. Measured at this commit it names three files and only ONE is a live risk:

| file | since the live release | token | verdict |
|---|---|---|---|
| `assets/css/pages/inventory-replenishment.css` | CHANGED | IDENTICAL | **the real defect** |
| `assets/js/api/operation-system-db-api.js` | CHANGED | ROTATED (r49 -> r50) | safe |
| `assets/js/pages/overseas-ops-preview.js` | UNCHANGED | — | safe, long published |

So the gate asks the question that actually decides whether a browser gets stale bytes: **did the CONTENT
change since the bytes the live site is serving, and if so, did the URL change too?** The stricter census is
still printed, named and non-failing, so drift is visible on the round that creates it without failing a
release over bytes the world already has.

The new gate COMPLEMENTS `cache-token-rotation-s8-r4c-p1.test.js` rather than replacing it. That suite owns
the FAMILY rule — which series an asset belongs to, and that the families never cross. The new one owns the
PUBLICATION rule — whether a file whose content changed since the live release actually reaches the browser.
F-PD1 slipped between them precisely because the content changed while the family did not rotate, and no gate
was asking that question.

`assets/tests/frontend-cache-token-publication-s8-b3-r3-gate1.test.js` — 21 assertions, both hosts
(`index.html` and `app.js`), both asset kinds. The baseline commit is pinned WITH self-checks (it must exist,
be an ancestor of HEAD, declare R49, and the ledger must still record Production as R49), so a stale pin fails
loudly instead of quietly measuring against the wrong tree. **Re-anchor that pin when R51 ships.**
Non-vacuity is proven rather than asserted: de-patching the correction in memory makes the gate report exactly
one stale publication and name the right file, while a changed asset WITH a rotated token stays classified
safe — so green means something.

### PAGES_SOURCE_UNCONFIRMED — and the push that does not publish

The GitHub Pages publishing source is a repository SETTING, not a file, and `gh` is not installed on this
machine, so no read-only API query was possible. What the repository can settle, it settles: **no GitHub
Actions workflow is involved** (there is no `.github/` and no `*.yml` anywhere — a confirmed negative, not an
inference); a `gh-pages` source is excluded (a read-only `git ls-remote` shows exactly three branches and none
of them is `gh-pages`); and a `main /docs` source is excluded (`docs/` has no `index.html`). The working
hypothesis is `main` + root, supported independently by operator-written ledger procedure. **It remains
UNCONFIRMED and the user must read Settings -> Pages before any push.**

The operational consequence is the useful part. In this repository a push to the publishing branch IS the
frontend publication, which would collapse backend-first ordering into a single act. But
`feature/product-strategy-board-p0` already exists on the remote and is not a Pages candidate under any
surviving possibility — so **pushing there first puts the release commit on GitHub, making the deployment
reproducible from a pushed hash, without publishing the frontend.** That is what makes true backend-first
ordering achievable, and the runbook sequence is rebuilt around it.

### `43_` — the file no probe can check

`43_api_v1_gap_materialization.gs` declares no build symbol and has no row in `SYS_MODULE_BUILD_STAMPS_`, so
`system.health` cannot report it missing, stale or absent. That is deliberate — a stamp would satisfy the copy
ledger and break the stamp ledger — and this round does NOT modify the `43_` runtime merely to make it
checkable. Instead the runbook carries a five-marker editor check (`gapBlockedIssue_` = 3 at R51 vs 0 at R49;
`priorityByMkt[pkey] : null)` = 1 vs 0; `: 0)` = 0 vs 1; `receiverKeys` = 1 vs 0; 890 lines) to be run after
pasting and recorded as positive evidence BEFORE the deployment version is created.

### Two stop conditions the release now carries

**ROLLBACK_TARGET_UNCONFIRMED** — the live Apps Script deployment version number cannot be recovered once a
new version is created, so it must be recorded first or the backend rollback procedure does not exist.
**PAGES_SOURCE_UNCONFIRMED** — see above. Both are user-side lookups; neither is derivable from the
repository.

---

## S8-B3-R3-CP2A — R51 FINAL OPERATIONAL GATE — **PRODUCTION_PRIORITY_EXPOSURE_UNVERIFIED** (2026-10-11)

Documentation only. No runtime file, no release identity, no contract, no production write.

### The priority exposure audit could not be performed, and no number was invented

R51 carries R50's D-S8-B1 correction, so an unresolved `allocation_priority` now fails closed. The question
this gate exists to answer is how much live data that affects, and it is **answerable only from production**.

The attempt was made and is recorded honestly. The production Web App endpoint IS configured in the shipped
source, so a read-only `getOperationDb` query is structurally available; it was issued once, read-only, and
the deployment answered an unauthenticated caller with Google's generic "page not found" page (HTTP 404, no
sign-in prompt, no JSON). The Web App is not readable without a signed-in session, and this agent holds no
credential and went looking for none. **Classification: `PRODUCTION_PRIORITY_EXPOSURE_UNVERIFIED`. No count
is reported, because a fabricated count is worse than an absent one** — it would be used to size a blast
radius.

A corollary worth naming: the same wall means the operator check "the current frontend points at the
deployment version 307 belongs to" cannot be verified from here either. It is a signed-in browser task.

### What the exposure WOULD mean, which is why it is a stop condition rather than a note

The refusal is **all-or-nothing by design** — KMMSA refuses before KMALLOC is called, so there is no partial
allocation reported as success. **One unranked marketplace blocks the entire company + country + SKU
allocation group**, not merely its own row. And the UI that sets a priority is the Site Priority page, which
does not reach the browser until the frontend is published at step H. At R49 no live page writes
`allocation_priority`: the existing "Add Marketplace" form writes seven fields and not that one.

So between publishing the backend and publishing the frontend there is a window in which an unranked
marketplace means blocked coverage with no browser-side remedy. That is intended behaviour meeting an
ordering constraint, not a defect — but its size must be known BEFORE the sync, which is why it is now
stop condition **S-4** rather than a paragraph someone might skim.

One reassuring fact, checked rather than assumed: the live form cannot ERASE a priority.
`03_master_data_handlers.gs:628` writes the column only when the supplied value is non-blank, so an omitted
field is preserved on update. A marketplace CREATED during the window will have none, though.

**No remediation was performed and none is proposed inside this round.** Backfilling priorities is a
production data write; it needs its own authorization, its own evidence and its own rollback story. KMMSA is
untouched and the fail-closed rule is not weakened.

### Runbook aligned to the approved workflow

The earlier draft proposed pushing the remote feature branch first, to get the commit onto GitHub without
publishing the frontend. **Retracted by decision**: the approved workflow is the existing Kitchen Mama one,
Sandbox -> Main -> Production Verification, with no additional branches and no feature-branch push. The
reasoning behind the retracted step was not needed anyway, because no push is required before the sync at
all — the Apps Script editor reads nothing from GitHub. The commit reaches the remote at step H, after the
backend is live and verified: the same backend-first guarantee by a simpler route and one fewer remote write.
The procedural worry it addressed (a deployment whose bytes exist in no pushed commit) is bounded and
deliberate — the window is E to H, and the Git-commit-to-deployment-version pairing is recorded before the
sync begins.

The runbook now carries the approved A-I sequence, a step-B exposure measurement, stop condition S-4, a
fourth rollback precondition (**P-8: the previous version must remain SELECTABLE, not merely recorded** — a
number that cannot be chosen is not a rollback target), and `U-6` for the unverified exposure.

---

### D-S8-B3-16 — `marketplaces.allocation_priority` has exactly ONE writer — **FROZEN (R52)**

**Decision.** `marketplace.allocationPriority.set`, owned by `03_master_data_handlers.gs`, is the only writer of
`marketplaces.allocation_priority`. `upsertMarketplace` **REFUSES** any request containing that field — including
`0`, `''` and `null` — before any mutation. A payload carrying no `allocation_priority` key at all is normal Add
Marketplace and keeps every existing semantic.

**Why a dedicated ACTION and not a guarded FIELD.** An old deployment *ignores* an unknown field but *cannot*
ignore an unknown action. A guard field would be silently dropped by a pre-R52 project and the write would
proceed down the unguarded path — the exact failure the guard exists to prevent. An unknown action falls through
to `01_router.gs`'s terminal response and refuses before any sheet is opened.

**Why the old door is CLOSED rather than guarded.** `upsertMarketplace` could write the column with no
canonical-collision check, no `marketplace_id` identity guard and no compare-and-set, and on no match it
**appended a new row**. Leaving that reachable would have placed an unguarded door beside every protection R52
adds, one field away on an action that has existed for rounds.

**What the bounded handler may touch.** `allocation_priority`, `updated_by`, `updated_at`. Three cells, one row,
already identified. It never appends, merges, renumbers or backfills.

---

### D-S8-B3-17 — Compare-and-set is MANDATORY and carries its own STATE — **FROZEN (R52)**

**Decision.** `expected_allocation_priority_state` is **required** and must be `SET` or `MISSING`; when `SET`,
`expected_allocation_priority` must be a finite number ≥ 0. A request without it is refused with `CAS_REQUIRED`.
"Mandatory" means **there is no unguarded path**, not "checked when supplied" — the client refuses to dispatch
such a payload and the handler refuses to act on one.

**Why a STATE and not a bare null.** After a JSON round trip an absent field and a null field are
indistinguishable, and the difference between them is precisely the difference between "I believe this cell is
empty" and "I forgot to say". MISSING is sent as a state and never as a number, because a blank cell is not a
zero — the §45.A rule every layer beneath this has already been repaired for.

**An INVALID stored value does not satisfy MISSING.** An unreadable cell is not an empty one; overwriting it
silently would destroy the evidence of a bad row. It refuses with `PRIORITY_CHANGED`.

**What this buys.** Two operators holding stale pages can no longer overwrite each other without trace. The
second is refused and told to Refresh; after refreshing, the same save succeeds. The gate is staleness, not a
lock-out.

---

### D-S8-B3-18 — Both `marketplaces` writers share the script lock — **FROZEN (R52)**

**Decision.** `handleUpsertMarketplace_` and `handleSetMarketplaceAllocationPriority_` both take
`LockService.getScriptLock()` at `tryLock(30000)` and release in `finally`.

**Why the legacy writer had to change too.** The lock is per-SCRIPT. `handleUpsertMarketplace_` was the sheet's
**only** writer and took no lock at all, so a lock added to the new handler alone would have serialised that
handler against itself and against nothing else — security theatre.

**The cost, accepted.** Add Marketplace gains one refusal it never had: `LOCK_UNAVAILABLE`, zero-write. This is a
new *instance* of a behaviour ~20 handlers across 11 files already have, not a new *class* of one.

**A bound that can be exceeded, recorded rather than discovered.** `gapJobContinue_` holds this same lock across
its entire slice loop, up to `GAP_JOB_WORKER_BUDGET_MS_` = 240 000 ms. A marketplace write landing inside a Gap
Materialization run therefore **refuses rather than queues**. Already true of every other locked writer; now also
true of Add Marketplace.

**What the lock does NOT do.** It serialises executions of *this Apps Script project only*. It does not prevent,
and cannot detect, a human editing the sheet in the browser, another Apps Script project, a Sheets API write or
an add-on. **No guarantee of detecting every external edit.**

---

### D-S8-B3-19 — `success: false` is not evidence of a zero write — **FROZEN (R52)**

**Decision.** The four outcome states are the ones S3-R10 established for `pricing.update`, reused verbatim:
`CONFIRMED_COMMITTED`, `CONFIRMED_REJECTED`, `CONFIRMED_NOT_STARTED`, `OUTCOME_UNKNOWN`. Two halves of one system
must not hold two vocabularies for "nothing was written".

**The rule.** `01_router.gs`'s `doPost` catch returns `{ success:false, error }` with **no `zero_write` field**
for any exception thrown anywhere inside a handler — including one thrown *after* a `setValue` has run. So only
an explicit `zero_write === true` from the handler counts as proof. Everything else that is not a recognised
unknown-action response is `OUTCOME_UNKNOWN`. Treating a bare `success:false` as a refusal is how a
partially-applied write gets reported to an operator as "nothing happened".

**Partial writes are not hidden.** Apps Script has no multi-cell transaction. The priority is written **first**,
deliberately: the outcomes are then "the priority landed and the audit stamp may be stale" or "nothing landed" —
never "the audit says someone changed it and the value did not move". Unrelated columns are **never** rewritten
to simulate atomicity.

**A matching value after an UNKNOWN outcome is NOT a confirmed save.** The read cannot attribute the stored value
to that request rather than to a concurrent one, and cannot say whether the audit columns completed. It is shown
in a distinct WARN state and labelled unconfirmed. **No automatic resend, ever.**

**OPEN, not closed by R52.** Closing the attribution gap needs a write-receipt store (`write_id` plus a status
lookup, as `pricing.update` has). Deliberately not proposed this round: the CAS plus the identity-safe read-back
is proportionate for a single weight on one row, and the residual limit is recorded here rather than papered over.

---

### D-S8-B3-20 — Read-back verifies IDENTITY, not just value — **FROZEN (R52)**

**Decision.** After a save, the page re-reads through the reference owner and checks **four** things before the
word "verified" is used: canonical uniqueness is still 1 · the raw company/country/marketplace are the ones sent ·
the row's `marketplace_id` equals the one the save was prepared against · the stored priority equals the request.

**Why.** A read-back that asks only "does some row now show 90?" is satisfied by a different marketplace, by a
duplicate row, or by a value somebody else wrote. That is the vacuous check CP2D removed once already, and
re-admitting it in a weaker form would undo the round that found it.

**Cache invalidation is tied to CONFIRMED success only.** One key — `marketplaces` — and nothing else. A refusal
invalidates nothing. An unknown outcome forces a fresh read through the existing `invalidate(key)` mechanism,
because the writer never reached its own invalidation and a memoized answer would "prove" the value was not
stored without ever asking the server.

---

### D-S8-B3-21 — A coercion is not a reading: `allocation_priority` is TYPE-checked — **FROZEN (R52, CP2I-R1)**

**Decision.** `mpClassifyPriority_` admits only `typeof 'number'` and `typeof 'string'`. An array, object,
boolean, Date or function is `INVALID` — never `MISSING`, and never a number. The compare-and-set **state** must
be an actual string, and the client guard type-checks *before* it normalises so it cannot launder one either.

**Why.** The classifier opened with `String(v).trim()`, and `String([5])` is `'5'`. An array arrived as a
confident `SET 5` and was **written to the sheet**; `['SET']` satisfied the compare-and-set — the one guard that
makes this action safe; `[50]` satisfied the staleness comparison. Every gate was present and every gate was
reading a coercion rather than the value it was guarding. An object with `toString`/`valueOf` did the same.

**An empty array is INVALID, not MISSING.** `String([])` is `''`, which used to make it indistinguishable from a
blank cell. The caller *did* send something; §45.A exists to keep "no value" and "an unreadable value" apart.

**What did NOT change**, and is asserted in both directions: numbers, numeric strings, padded strings, decimals
and an explicit `0` still commit. A type gate that cost a legitimate weight would be a worse defect than the one
it fixed. Sheet cells reach the same classifier and are unaffected — a Date or boolean cell was already INVALID
by coercion and still is.

---

### D-S8-B3-22 — `updated_by` and `updated_at` are REQUIRED SCHEMA — **FROZEN (R52, CP2I-R1), Owner-confirmed**

**Decision.** Both audit columns are mandatory for the priority writer. Absent, the write is refused with
`SCHEMA_MISSING_COLUMN` and `zero_write: true`, **resolved with the rest of the schema** — before the identity
gates and far before the first setter. The refusal names the missing columns. No provisioning, no header append,
no auto-repair.

**Why.** They were resolved at the write block and skipped when absent (`if (ubCol !== -1)`). That is the exact
silent-skip shape this action was created to remove from the priority column itself: a save reporting success
while storing less than it claimed — here, a shared planning weight changed with no record of who or when.
Checking them upstream rather than at the setter is what makes the refusal *provably* zero-write instead of
merely ordered before a write.

**Scope.** This gate belongs to the priority writer. `upsertMarketplace` owns its own columns and is unaffected.

---

### D-S8-B3-23 — The dedicated action is PINNED and the DTO is BUILT — **FROZEN (R52, CP2I-R1)**

**Decision.** `KM.DB.setMarketplaceAllocationPriority` constructs its request body field by field from the
declared contract and pins `action: 'marketplace.allocationPriority.set'`. A caller-supplied `action` is ignored.
No undeclared field reaches the wire. The expected CAS **value** is sent only in the `SET` state that defines it.

**Why.** The body was `Object.assign({ action: FIXED }, payload)` — the caller came **last**, so a payload
carrying its own `action` replaced the fixed one. This wrapper is the only path to one action and carries that
action's CAS guard, its `site-priority` deployment preflight and its priority-shaped body; a payload could point
all of that at a different action. Assigning the action after the spread would have fixed only half: the other
half is that every undeclared field was forwarded, so the client could not state what it sends — including a
`zero_write` a caller could try to plant, and the collateral columns R52 had just removed from this path.

**Preserved deliberately**, and asserted: the deployment preflight still runs and still runs first (a foreign
action cannot route around it), transport stays bounded, and there is still no automatic resend.

---

### D-S8-B3-24 — The responsive evidence is taken against the REAL shell — **FROZEN (CP2M-R2)**

**Decision.** Any visual acceptance of a page is captured from `index.html` itself, with the shipped header,
sidebar, `.main-content` and stylesheet order, reached by clicking the page's own menu item. A harness may
substitute **data** and may **redirect business requests**; it may not restyle the layout under test. The
evidence hash covers `index.html` and the shell's stylesheets, not only the page's own files.

**Why.** The CP2M-R1 runner wrote its own shell — `nav.sidebar{display:none}`, `.main-content{margin-left:0}` —
with a comment asserting the sidebar is "collapsed on phones". It is not: `layout.css` fixes it at 240px and no
media query in the build changes that. So the real content column at a 360px viewport is **105px**, and the R1
capture measured a 360px column. It reported "no overflow at every width" and passed 80 assertions about a page
the application never produces.

**What it hid**, now measured and fixed: the Country and Company selects cut off by 86px at 360px (a
`min-width: 180px` that `width: 100%` cannot override), and at 768px the **entire Edit column invisible** behind
`overflow: hidden`, with the last row impossible to operate at all. A hidden overflow has no visible edge, so
nothing on screen said anything was missing.

**Scope.** `.sp-table-wrap` now scrolls (`overflow-x: auto`, the `.km-table-scroll` pattern
`responsive-foundation.css` already names canonical) and the narrow controls release their min-width. The
application shell is **unchanged**; that it has no mobile breakpoint at all is recorded as a separate finding.

---

### D-S8-B3-25 — Performance observation is OFF by absence, and measures the SCREEN — **FROZEN (CP2M-R2)**

**Decision.** `assets/js/core/perf-observer.js` is **not referenced by `index.html`**. A release candidate
carries zero bytes of it, registers no listener and has nothing to switch off; the Sandbox harness injects it
deliberately, and `enable()` must still be called. It issues no request, writes no storage, uploads nothing, and
stores no URL query string, page text or field value. Its wrappers call through with `apply(this, arguments)`
and `disable()` restores the original function objects **by identity**.

**Why `apply(this, arguments)` is a contract and not a style.** `switchTo` reads `navToken === undefined` to
mean "a fresh intent" (CP2M). A wrapper forwarding a fixed arity would turn every tokenless call into a tokened
one and silently rewrite the navigation authority the previous two rounds were spent establishing.

**Decision.** Every sample records **two** paint timestamps, both taken after a double `requestAnimationFrame`:
`t_shell_visible` (any content, a spinner satisfies it) and `t_data_visible` (real content, no loading
affordance). The summary reports the gap.

**Why.** A promise resolving means the data is in a variable; the operator is not looking at a variable. One
number conflating them is how "we added a skeleton" gets written up as "we fixed the latency". The gap is the
part a loading state cannot move, so it is reported separately rather than averaged away.

---

### D-S8-B3-26 — The Map canvas is verified in pixels, with a noise floor — **FROZEN (CP2M-R2)**

**Decision.** The globe is verified by decoding Chrome's screenshot, not by querying the DOM, and the experiment
has **three** runs: two identical ones establish the noise floor, a third performs a real pointer drag.

**Why the DOM cannot answer.** `km-globe.js` creates its context without `preserveDrawingBuffer`, so after
compositing `toDataURL` and `drawImage` both return a blank image. The screenshot is the only place the pixels
survive. And "WebGL is available" — the CP2M-R1 answer — is a fact about the browser, not about whether this
application drew anything.

**Why three runs.** Comparing a dragged frame with an undragged one proves nothing alone: if the scene were
animated or clock-seeded, two identical runs would differ too and the drag would take the credit. Measured:
noise floor **0.0000** changed pixels (desktop and mobile), drag effect **0.3731** desktop / **0.6718** mobile.
The zero floor is also a test of the renderer's claim to consult neither a clock nor a PRNG.

**Not claimed.** The shipment overlay is not exercised — the harness answers the scoped workspace read with a
generic empty envelope rather than inventing a shape, so the page draws its formal empty state. The globe, its
geometry, its texture and its zh-Hant labels are the shipped ones and do render.

---

### D-S8-B3-27 — Two routes leave the boot path, and the clock is not the evidence — **FROZEN (CP2M-R3)**

**Decision.** `carrier-rate-card.js` and `overseas-stock.js` become route-owned. The boot payload drops from
67 scripts / 4,007,712 B to **65 / 3,803,037 B** — **204,675 bytes and two requests removed**.

**Why only two.** Each was cleared BY NAME, not by heuristic: neither publishes a symbol any other file
references, neither is named by an `index.html` inline handler, neither registers a `DOMContentLoaded` handler,
and each already loads its own partial from its own literal. Their one load-time side effect is
`KM.lifecycle.register`, which load-before-mount performs before `switchTo` by construction. The CP2M-R2 census
listed `KM_SCOPED_PAGE_READS` as a shared global both of them published; it is neither — the detecting regex
matched the `=` inside `!==`, and the only assignment-shaped lines are COMMENTS describing an operator kill
switch. The other nineteen page scripts remain blocked and each still needs its own argument.

**And the wall clock did not improve.** 63 runs each side: DOMContentLoaded **+9.2 ms**, first contentful paint
**+8.0 ms** — the wrong direction, inside spreads of 256–406 ms and 261–521 ms. That is noise. **No cold-start
speed-up is claimed.** On loopback 200 KB costs nothing to transfer; the benefit is bytes over a real link and
is modelled, not measured. This is the S4-R1 failure mode — a delta inside its own spread — and recording the
byte census instead of a timing claim is the whole point.

**Four guards fired and were corrected at the declaration, never at the gate:** the token reader now follows the
file into the route registry; a mutant's hardcoded set size is derived; two declared censuses moved 67→65 and
18→20. The fifth, S4-R5's `A1c`, pinned the live tree to that round's post-state — a claim about one round
acting as a veto on every later one — and is now *at or below*: a script rejoining boot still fails, undeclared
drift still fails `A1d`, and the exact census is still asserted in `s7-r2b1`.

---

### D-S8-B3-28 — The shell is responsive, and the drawer is a behaviour — **FROZEN (CP2M-R3)**

**Decision.** Below **1024px** the sidebar leaves the flow and becomes an overlay drawer. Above it, nothing
changes: the fixed 240px rail and its collapse control are byte-for-byte what they were.

**Why.** `.sidebar` was a fixed 240px and `.main-content` carried a 240px margin at EVERY width, with no media
query in the build changing either. Measured against the real `index.html`: a 360px phone got a **105px**
content column, a 390px one 135px, inside an `overflow-x: hidden` that made anything past it unreachable. After:
**345px** and **375px**; a 768px tablet goes from 528px to its full 768px.

**The header overlap had the same shape.** `.header-left` is `position: absolute; left: 50%`, so the logo is
centred OUT OF FLOW and the flex row reserves no space for it — at narrow widths the account text was drawn
straight through the logo. In flow below the breakpoint, it simply takes its share.

**A drawer is a behaviour, so it is tested as one** (50 assertions, mutation-verified): the control opens and
shuts it, focus moves INTO it and RETURNS to the opener, Escape closes it and is not swallowed when it is shut,
the backdrop closes it and a click inside does not, a valid navigation closes it and a REFUSED one leaves it
exactly as it was, and crossing back to desktop does not strand it open. A closed drawer is `visibility: hidden`
so it is out of the tab order. The breakpoint is ONE number, asserted identical in `layout.css` and `app.js`.

**And the cascade order is the override.** The base `.km-nav-open { display: none }` was written AFTER the media
query that reveals it; at equal specificity the later rule won and the opener never rendered — a header with no
way to reach the menu. The suite now asserts the base rule precedes the override.

---

### D-S8-B3-29 — A fixture is derived from its consumer, never guessed — **FROZEN (CP2M-R3)**

**Decision.** Every synthetic envelope is built from the code that READS it, and validated against that code
before it is used. `_cp2m-r3-fixtures.js` carries the derivation for each field.

**Why, with the receipts.** Five plausible-looking shapes were wrong, and each would have produced a confident
measurement of the wrong thing:

| what looked right | what the consumer requires |
|---|---|
| no `request_id` echo | the transport correlates every read; not echoing is `RESPONSE_CORRELATION_UNPROVEN`, which surfaces as *"the answer belonged to a different request"* |
| `data.rows` | `data.normalizedRows` — the first attempt returned `sourceState: OK` with **zero rows**, an empty board reporting success |
| `filterOptions` as string arrays; no `analysis_permitted` | arrays of objects with a string `value`; a boolean flag. Both surface as the SAME generic `RESPONSE_NOT_READABLE` panel, so the symptom named neither cause |
| `sourceState: 'OK'` | `'READY'` — `OK` is the live adapter's VERDICT vocabulary, not the server's |
| `lifecycle_status` | the adapter reads `live.lifecycle`; the other is its OUTPUT name |

**The consequence of getting this right** is that the Product Strategy board renders (37 → 184–417 elements per
view) and the map draws 8 shipments instead of its formal empty state — so both are now measured as pages an
operator would see, rather than as refusal panels.
---

### D-S8-B3-30 — The drag stores a WEIGHT, and the weight is the only thing stored — **FROZEN (CP2M-R4)**

**Decision.** Reordering Site Priority by dragging computes **one number** that sits strictly where the row
was dropped, and saves it through the **existing** R52 single-row compare-and-set. No rank column, no
sequence, no renumbering, and **no neighbour is written**. One drag is one row, which is what makes it
incapable of a cross-row partial failure (D-S8-B3-xx / §5 of the proposal).

**The rules, as built:**

| Position | Rule |
|---|---|
| top | `hi × 1.1` — pure, no `+1` minimum |
| bottom | `lo × 0.9` — pure. **Replaces** Rev 3's `lo − max(1, lo × 0.1)`, which still carried the term the top rule had already dropped |
| between | `lo + (hi − lo) / 2` |
| `hi = 0`, or no comparison basis | **REFUSED** — the operator is asked to set a value explicitly |
| `lo = 0` | **REFUSED** — nothing is below zero |
| precision | **none imposed**: no 2dp rounding, no minimum gap. The computed double is stored |

**Display order** is weight DESC within a company, ties broken by **canonical identity** — a total order, so
the list cannot reshuffle because an unrelated row was inserted above two equal weights. This is a DISPLAY
decision and is explicitly *not* the allocator's tiebreak (§1.C).

**Why the midpoint is `lo + (hi − lo) / 2` and not `(hi + lo) / 2`.** The obvious form builds a SUM that is
unrepresentable while the ANSWER is perfectly representable: for two large legal weights it overflows to
`Infinity`. Verified against `Number.MAX_VALUE`, where the naive form returns `Infinity` and the shipped one
lands strictly between.

**Why every computed weight is re-checked against its neighbours.** Because "multiplying a positive number by
1.1 increases it" is **false** at the bottom of the double range: `Number.MIN_VALUE * 1.1 === Number.MIN_VALUE`.
The arithmetic is never trusted to have moved; top, bottom and midpoint alike are re-compared against the
neighbours they came from and refused as `INDISTINGUISHABLE` if they did not land strictly between.

---

### D-S8-B3-31 — A weight that cannot be DERIVED is REQUIRED, not invented — **FROZEN (CP2M-R4, corrected CP2M-R4-R1)**

**Decision.** Where no arithmetic can turn a dropped position into a weight — the leader is `0`, or the
ordered list is empty — the drag is **REFUSED** and the operator is told to set a value explicitly with Edit.

> **CORRECTION (CP2M-R4-R1): THIS WAS NOT A REVERSAL, AND RECORDING IT AS ONE WAS WRONG.** CP2M-R4 wrote
> that Owner had "reversed" `TOP_FROM_ZERO = 1.0`. Owner has since confirmed that **auto-filling 1.0 was
> never approved at all**. Rev 3 listed it in its own DECIDED table under D3; that entry was the proposal
> claiming an approval it did not have. What CP2M-R4 did is therefore **withdraw a mis-recorded decision**,
> not change an Owner direction — and the distinction is not pedantry: a register showing the Owner
> reversing themselves misrepresents who decided what, and not misrepresenting that is the register's job.

**Rev 3's argument for `1.0`** was that it is the smallest weight distinguishable in both of the roles
priority plays — strictly above `0` in all three comparators, and exactly
where `Math.max(priority, 1)` stops clamping. That argument is sound **and it does not reach the conclusion**:
it establishes which value a system would pick, not that the system should pick one. Dragging a row to the top
expresses a POSITION; where that position has no derivable weight, the honest answer is to say so.

The constant is **gone from the code**, not defaulted differently. `TOP_FROM_ZERO` survives only as the NAME
OF THE REFUSAL, and the suite asserts it is never assigned a value.

**AND A WEIGHT OF 0 DOES NOT SWITCH A SITE OFF.** Recorded here because the page's own comments had drifted
towards implying it. `0` is the lowest VALID weight — the site still takes a share, and in a shortage it
receives the **same multiplier as a site at 1**, since `Math.max(priority, 1)` clamps both. `0` ranks a site
last; it does not disable it. What stops an allocation is a **MISSING** priority, which the allocator refuses
outright rather than treating as 0.

---

### D-S8-B3-32 — The rounding rule was not adopted, so its unresolved case stopped existing — **FROZEN (CP2M-R4)**

**Decision.** No computed weight is rounded, and there is no minimum gap. Rev 3's U3 (2dp + a `0.01` floor) is
**not adopted**.

**And that DISSOLVED Rev 3's U4 rather than resolving it.** U4 was `hi × 1.1` collapsing back onto `hi` for
`hi ≤ 0.04` — a case that existed **only because of the rounding that created it**: `0.04 × 1.1 = 0.044`
rounded back to `0.04`. Unrounded, the value is `0.044000000000000004`, strictly above `0.04`, and the drag
accepts. **None of U4's three candidate fixes was chosen.**

**What replaces the `0.01` floor** is `INDISTINGUISHABLE`: the drag is refused when no double lies strictly
between the two neighbours. The floor was a guess at where usefulness ends and would have refused a perfectly
usable gap of `0.001`; this is the point at which the number system actually runs out, and it needs no
constant. The depletion argument Rev 1–3 made is still true — repeated midpointing halves the gap — it is
simply **detected rather than predicted**.

**The second reason for rounding is also rejected, on its own terms.** A weight round-trips through a
spreadsheet cell as text, and `80.00000000000001` is an ugly cell. That is a presentation concern, and
rounding costs more than it buys: it changes the value AFTER it was checked, and a value changed after the
check can land outside the position it was checked for. That is precisely how U4 came to exist.

---

### D-S8-B3-33 — A drop is a PROPOSAL; only Save writes — **FROZEN (CP2M-R4)**

**Decision.** Dropping a row produces a **draft and a preview**, never a write. Cancel is a zero write from
every stage. Save dispatches **at most one row**, and it is the only thing that dispatches.

**Before dispatching, the page re-reads the target AND both neighbours — really re-reads.** `loadRows()` goes
through the shared reference cache, which would happily answer from the memo the preview itself was computed
from; a "re-read" answered from that snapshot proves nothing. The page invalidates its own key first — one
key, this page's own resource, the existing mechanism. The preflight then checks four things, each for a
reason the others do not cover:

1. the target is still a single row, still the same record, still holding the value the CAS will claim
2. each neighbour still exists, in the same company, at the weight the proposal was computed from
3. the two neighbours are still **ADJACENT** — a third row inserted between them changes the position even
   when both their weights are untouched, which no weight comparison would catch
4. the computed value still strictly brackets

**Its exact limit, stated where it is implemented:** a read is not a latch. A neighbour can change between the
check and the write. The window narrows from "however long the operator deliberated" to one round trip. That
residual is ACCEPTED (D5) and is not closed here.

**After the write settles, the operator is shown the READ-BACK weight AND the READ-BACK position**, never the
previewed one — a weight alone does not answer "where did it land" when the whole intent was a position.

**`OUTCOME_UNKNOWN` holds the dragged position, visibly unconfirmed, and withdraws Save.** It may not snap
back (that asserts a zero write nobody proved) and it may not show the value as stored. No automatic resend,
no backfill, no rollback. Dismissing the marker undoes nothing, because nothing here knows whether there is
anything to undo.

---

### D-S8-B3-34 — A refusal belongs BEFORE the gesture — **FROZEN (CP2M-R4)**

**Decision.** A row that cannot be moved does not get a handle that refuses on drop; it gets a **disabled
handle carrying the reason**. Three rows are in that state, for three different reasons:

| | Why |
|---|---|
| an INVALID row | it has no position to move from, and placing it would mean guessing what its unreadable value was meant to be |
| the only weighted site in its company | there is nothing to position it against — every drop would be `NO_BASIS` |
| **any row of a company with siblings hidden by a filter** | the rows that LOOK adjacent may not be, and a midpoint computed from the wrong pair would save perfectly happily |

The last one is measured per company, not assumed from which select is set: the **Company** filter removes
whole companies and can never split one; the **Country** filter can, and does.

**And a filter change or a Refresh while a draft is pending is neither obeyed nor ignored** — the control is
put back and the operator is asked to Save or Cancel. Both would re-derive the list the preview was computed
against, so the preview would silently come to mean something else.

**The guards live where they are enforced, not in the markup.** Withholding a handle is a rendering decision;
the keyboard path, a stale handle left by a re-render, and the exported test hook all reach the lift directly,
so the same rules are restated in `beginLift`. A mutation that removed the renderer's check alone was caught
by a suite that could reach past it.

---

### D-S8-B3-35 — The gesture is verified in a browser, because it cannot be verified anywhere else — **FROZEN (CP2M-R4)**

**Decision.** The RULE is tested as arithmetic in node. The GESTURE is tested in a real browser, at five
widths, with real `PointerEvent`s and `KeyboardEvent`s. **Neither stands in for the other, and the split is
recorded rather than blurred:** a headless DOM has no layout, so `getBoundingClientRect` returns zeros and a
pointer path driven there would be measuring the shim.

**Mouse, touch and keyboard are one implementation.** Pointer Events — not HTML5 drag-and-drop, which never
fires for touch on any mobile browser and would have been a desktop feature wearing a general name. All three
inputs call the same lift / move / drop functions, and the capture asserts all three land the same row in the
same slot at the same weight at 360, 390, 768, 1280 and 1920.

**`touch-action: none` is read as COMPUTED, not as written.** Without it the browser claims the gesture as a
scroll and cancels the pointer stream, so the drag would work with a mouse, do nothing on a phone, and look
correct in every desktop test. A declaration that is present in the stylesheet but overridden would pass a
source grep and fail a finger.

**The probe counts writes.** The write wrapper is replaced by a counter for its duration, so a gesture that
dispatched a save would appear as a number rather than as a changed fixture nobody looked at. It is **0** at
every width.

**Two defects were found by LOOKING at the capture, not by reading the code:**

1. an **empty bordered box** on every width — `#sp-draft` sets `display: flex`, which beats the UA stylesheet's
   `[hidden] { display: none }` on specificity, so the move bar was drawn whenever there was no move. The
   sibling `.sp-status` escaped this only because it never sets `display` at all.
2. a **drag handle on a row the suite believed had none** — see D-S8-B3-36.

---

### D-S8-B3-36 — An unparseable priority never reaches the page as INVALID — **RECORDED, NOT FIXED (CP2M-R4)**

**Finding.** The shipped reader (`operation-system-db-api.js`) normalises `allocation_priority` with
`Number()` and stores **`null`** when the result is not finite — deliberately, so a malformed cell does not
become a confident wrong number. The consequence is that `'7abc'` arrives at Site Priority as `null` and is
drawn as **Missing**, offering a first set. Only a **negative** value — which that normaliser preserves on
purpose, so §40's refusal is the one that is seen — presents as **INVALID**.

**This is pre-existing** and applies to the Edit path exactly as it does to the drag. It is **not** introduced
by CP2M-R4, and it is **not fixed here**: changing it would change the reader's contract, which this round is
not authorised to touch.

**How it was found matters more than the finding.** Two test fixtures used `'7abc'` as their INVALID row —
a value `classify()` does read as INVALID, and which **no real read can produce**. The node suite asserted the
row had no drag handle and passed; the browser capture, going through the real normaliser, drew one. Both
fixtures now use a negative, and the suite pins the normaliser's two lines so they cannot drift back to a
shape the application does not have.
---

### D-S8-B3-37 — A late answer is identified by its OPERATION, not by whether the page is still open — **FROZEN (CP2M-R4-R1)**

**Decision.** A save whose preflight is still in flight is identified by three things — the **operation**, the
**draft** it belongs to, and the **mount generation** it started in. `opIsLive(op)` is the single definition,
and every continuation consults it: before committing data, before writing a banner, and again immediately
before dispatching the writer.

**What it replaces.** CP2M-R4's continuation asked `if (!_mounted)`. That is a question about the PAGE, and
every failure here was a question about the OPERATION:

| | What happened |
|---|---|
| Cancel | leaves the page mounted, so the write went out **after the operator cancelled it** |
| Leave and return | sets `_mounted` true again, so a preflight spanning the round trip dispatched a write for an abandoned operation |
| A newer draft | is also "mounted", so the stale continuation cleared its `_busy`, dropped it with `_move = null`, and wrote its banner over it |
| The data and the DOM | `preflightMove` assigned `_rows` and redrew **before** anything was checked |

Each is covered by a test written to FAIL first (`site-priority-save-cancellation-s8-b3-r3-cp2m-r4-r1.test.js`,
54 assertions), driven through the real Cancel control rather than the exported helper.

**HONEST LIMIT, measured by mutation.** The three identities are **mutually redundant by construction**:
`cancelMove` and `unmount` both clear `_op` AND `_move`, so either alone recognises every superseded
operation this page can currently produce. Dropping ALL THREE is caught; keeping only the mount generation is
caught; keeping only `_op`, or only the draft id, is NOT. The pre-dispatch re-check and the draft-id guard in
`done` are unreachable today and are kept as defence in depth. **This is recorded rather than presented as
six killed mutants**, because a count that quietly included the unreachable ones would be the worse number.

---

### D-S8-B3-38 — Cancel means two different things, and the page says which — **FROZEN (CP2M-R4-R1)**

**Decision.** A move carries a `phase`:

| phase | Cancel does | The page may say |
|---|---|---|
| `draft` | prevents a write that was never dispatched | "nothing was sent" |
| `checking` | same — the preflight is a read | "nothing has been sent yet" |
| `sent` | **nothing** | *"This save has already been sent and cannot be cancelled. Nothing here can call a request back."* |

In the `sent` phase the Cancel control is **not offered**, and reaching it another way refuses. The move
**survives** the click, because the request is outstanding and its outcome may be `OUTCOME_UNKNOWN` — the row
has to stay on screen to receive that answer. CAS, partial failure, `OUTCOME_UNKNOWN` and the no-auto-resend
rule are all unchanged.

**A mutation found the gap in the first version of this test.** It asserted only that nothing was written and
that no sentence said "undone" — both of which stay true if Cancel simply drops the draft. What must be true
is that the move SURVIVES.

---

### D-S8-B3-39 — The map canvas vanished because the host left the document, not because the engine was rebuilt — **FROZEN (CP2M-R4-R1)**

**Decision.** `render()` called `detachGlobe()` **before** the `state.loading` early-return, and only the full
render path calls `attachGlobe()` again. For the whole of a forced refresh the globe host was therefore off
the page. A load that has something to preserve no longer replaces anything: the previous workspace stays,
with a non-destructive busy marker, and the full render happens when the data arrives. The first load still
shows the spinner, because then there genuinely is nothing to show.

**MEASURED, NOT INFERRED.** A lifecycle probe was added FIRST, with no behaviour change, so the before capture
came from the same code path the operator runs:

| | before | after |
|---|---|---|
| samples with the host OUT of the document, during a forced refresh | **13 of 40** | **0** |
| samples where `state.loading` was true | 13 | 13 *(the wait was not hidden)* |
| globe instances created / destroyed / contexts lost | 1 / 0 / 0 | 1 / 0 / 0 |

**The engine was never rebuilt and no context was ever lost** — which is exactly why the probe was built
before the fix. `detachGlobe` keeps the host AND `state.globe`, so "the canvas is gone" is not evidence of a
renderer fault, and the fix would have been aimed at the wrong layer. **No wait limit was raised and no run
was cherry-picked.**

**LEAVE-AND-RETURN DID NOT REPRODUCE, and that is recorded rather than quietly fixed anyway.** On re-entry the
read model is cached, so `ensureDb` calls back synchronously: `state.loading` is true and false inside one
tick and the detach never survives a frame. The reachable teardown is the FORCED refresh.

**Also added:** a navigation generation. `ensureDb` already dropped a superseded READ, but nothing stopped a
load that outlived a navigation from rendering onto the next page; `unmount` now retires both.

**Not changed:** the globe engine, the geometry, the textures, the transport, and `detachGlobe` itself — the
fix is about WHEN the host is on the page, not about what is drawn on it. The MAP token family rotated
(`map-canvaslifecycle-r12-20261013`); the application token was NOT used, because crossing the families is the
misplaced-token defect the release-order rules check in both directions.

---

### D-S8-B3-40 — An unreadable priority is refused by the server, and the page stops sending operators to a control that cannot work — **FROZEN (CP2M-R4-R1)**

**Verified end to end, through both REAL implementations** — the shipped reader sliced out of
`operation-system-db-api.js` and the shipped classifier sliced out of `03_master_data_handlers.gs`:

| raw cell | normalised | page reads | page sends | server reads | verdict |
|---|---|---|---|---|---|
| `7abc`, `high`, `1,000`, `Infinity` | `null` | MISSING | MISSING | **INVALID** | **PRIORITY_CHANGED — zero write** |
| `-5` (text or number) | `-5` | INVALID | MISSING | **INVALID** | **PRIORITY_CHANGED — zero write** |
| `''`, whitespace | `null` | MISSING | MISSING | MISSING | writes |
| `0`, `'0'`, `80` | number | SET | SET | SET | writes |

**An unreadable cell is never overwritten.** The refusal lands above the line the handler itself marks
*"EVERYTHING ABOVE THIS LINE IS PROVABLY ZERO-WRITE"*.

**AND THE CONSEQUENCE THAT HAD TO CHANGE.** Because the contract has only SET and MISSING, the page can never
express "I expect an unreadable value" — so **every** save against such a row is refused, from the editor
exactly as from the drag. CP2M-R4's text told the operator to *"fix it with Edit first"*, which is advice to
use a control whose save fails every time. Both messages now say the value must be corrected where it is
stored, and explain why this page cannot do it.

**The reader's contract is NOT changed this round** (D-S8-B3-36 stands): an unparseable cell still normalises
to `null`.

**Also corrected, as instructed: a weight of 0 does not switch a site off.** It is the lowest VALID weight —
the site still takes a share, and in a shortage receives the **same multiplier as a weight of 1**, because
`Math.max(priority, 1)` clamps both. `0` ranks a site last. What stops an allocation is **MISSING**.

---

### D-S8-B3-41 — A warm/cold gate with no resolution, corrected at the GATE and said so — **FROZEN (CP2M-R4-R1)**

**The gate's FORM changed, which is called out rather than slipped in.** `E2` compared warm and cold MEDIANS
and allowed any one route to flip anonymously. It has no resolution: the capture CP2M-R4 shipped passed it
with a map route whose warm median sat **1.6 ms** below its cold median inside ranges spanning **18 ms** and
**10 ms**. Across four captures this round the "flipped" set changed every time — carrier-rate-card, then
site-priority, then site-priority — and two of those routes were touched by nothing.

**The corrected form asks whether the difference is distinguishable at all:** warm median above cold median
**and the two ranges not overlapping**. It is **stricter where it matters** — the old form let one arbitrary
route fail silently every run; the new one names the only genuinely slower route and fails if a second joins
it or a different one replaces it.

> **OPEN, NOT CLOSED: `global-logistics-map` IS genuinely slower on a return visit** — warm and cold ranges
> disjoint in the later captures. The obvious reading is that this round's map change caused it, and that
> reading was **tested rather than assumed**: a counterfactual capture with this round's render guard disabled
> and everything else identical shows the same result (warm 44.0 vs cold 36.1, ranges still disjoint).
> **The finding predates the change and is NOT attributed to it — and it is not fixed.**
> Evidence: `docs/evidence/cp2m-r4r1-perf/warm-cold-counterfactual.json`.

---

### D-S8-B3-42 — The same frozen-tree gate, in the same suite, a second time — **FROZEN (CP2M-R4-R1)**

**`s4-r5-route-payloads` G4 asserted `git diff HEAD` over the map files was EMPTY** — *"not one byte of any
map file changed this round"*. True for the round that wrote it; a **veto on every round after it**. CP2M-R3
corrected `A1c` in this same suite for exactly this shape, and this is the second instance.

**It was also weaker than it looked.** `git diff HEAD` sees only UNCOMMITTED work, so the moment a round
commits, the diff is empty again and the assertion passes whatever changed. A gate that can only fire before
a commit, and never after, is not protecting the thing it names.

**What it was really for is kept:** this runner does not measure map fidelity, and must not be read as
evidence that icons, tooltips or multi-leg behaviour still work. That assertion is unchanged.

**What replaces the frozen diff** is the invariant that actually protects an operator: a map file that
changes must rotate the **MAP** token, that token must be served, the application token must still be served
for application assets, and the two families must not be crossed. A map file rejoining boot on a stale token
still fails; the exact map-fidelity evidence still lives in the map suites, by name.

> **Two gate FORMS changed this round — E2 (D-S8-B3-41) and G4 — and both are named here rather than
> adjusted quietly.** Both were corrected because the gate could not support the claim it made, not because
> this round's work was inconvenient to them: E2 passed its previous capture on a 1.6 ms difference across an
> 18 ms spread, and G4 passes trivially after any commit.
---

### D-S8-B3-43 — A mount continuation belongs to a NAVIGATION, and the map's never asked which — **FROZEN (CP2M-R4-R2)**

**Decision.** The map's lifecycle `mount` captures its identity at the ORIGINAL mount — the page's own
navigation generation, plus the shell's `commitGuard(epoch, sectionId)` — and the `ensureMarkup().then`
refuses before it marks the section active, before it boots and before it resizes.

**Why boot's existing guard could not cover this.** CP2M-R4-R1 taught `boot()`'s read callback to drop a
superseded answer by capturing `var myNav = _glmNavGen` **inside boot**. In this path boot is CALLED after the
navigation, so the generation matches, the guard passes, and the work proceeds. The identity has to be taken
at the moment the continuation is created, which is the mount.

**MEASURED, before and after, in a real browser against the REAL lifecycle manager and the REAL partial
loader.** The markup is answered late by the server, which restores the production ordering rather than
inventing one: app.js sends a route's partial and its scripts together, `loadPartial` fetches with
`{ cache: 'no-store' }` and the scripts are cacheable, so on a return visit the markup is routinely the LAST
thing to arrive.

| scenario | | boots | workspace reads (counted at the SERVER) | renders | globes built | superseded mounts refused |
|---|---|---|---|---|---|---|
| mount → Home | before | 1 | 1 | 2 | **1** | — |
| | **after** | **0** | **0** | **0** | **0** | **1** |
| mount → another route | before | 1 | 1 | 2 | **1** | — |
| | **after** | **0** | **0** | **0** | **0** | **1** |
| leave and return | before | **2** | 1 | 3 | 1 | — |
| | **after** | **1** | 1 | 2 | 1 | **1** |

**The worst of it was not the `.active` flag.** A continuation that outlived its navigation **built a WebGL
globe for a page the operator was not on**, having first dispatched a workspace read and rewritten the map
body.

**AND THE THIRD CASE IS THE ONE NO OBSERVER COULD HAVE CAUGHT.** On leave-and-return both mounts join the
SAME in-flight partial, so both continuations fire in one tick and both call `boot()`. The map IS the active
section throughout, so `.active` is CORRECT and the shell's MutationObserver has nothing to revert. The
defect is that one navigation performed two loads. This round was told not to accept a late `.active`
correction as a fix, and this is the case that shows why.

**The duplicate read was ISSUED, not avoided** — the server saw one request because the transport shares an
OPEN read between identical callers, and the transport's own `coalesced` counter reads 1 before the fix and
0 after. Reporting "one request, so no duplicate" would have credited the page with something another layer
did for it.

**Nothing new was invented:** `commitGuard(epoch, sectionId)` is the lifecycle manager's own contract, already
used by `site-priority.js`, `fc-summary.js` and `request-order.js`. The globe engine, the read strategy, the
geometry and the transport are untouched, and the MAP token family is the one that rotates.

---

### D-S8-B3-44 — An unreadable priority leaves the drag handle LIVE, and the fail-closed point is the server — **FROZEN (CP2M-R4-R2)**

**Correction to a statement made in the CP2M-R4-R1 acceptance list.** That list told the Owner that a row
holding a garbled `allocation_priority` would show *Missing* **and a disabled handle**. The first half is
right; the second is wrong, and the two halves cannot both be true:

- the page disables the handle when `classify(...)` says **INVALID**;
- `normalizeMarketplaceRecord` produces INVALID only for a value it CAN read and reject — a negative number;
- unreadable TEXT becomes `null`, which the page reads as **MISSING**, not INVALID.

So a garbled row looks exactly like a site nobody has prioritised yet, and it can be picked up and dropped.
The save then goes out, the server reads the RAW cell, classifies it INVALID, and refuses with
`PRIORITY_CHANGED` above the line the handler marks *"PROVABLY ZERO-WRITE"*.

**The contract is unchanged and fail-closed; the refusal simply does not happen at the handle.** D-S8-B3-36
and D-S8-B3-40 both stand. What changes is what an acceptance list may promise — and that such a check
belongs in an isolated fixture, never by asking an Owner to put a garbled value into the live master.

---

### D-S8-B3-45 — Two handoff documents stated things they had not read — **FROZEN (CP2M-R4-R2)**

**The errors were not details; they were a method.** Where a handler had not been read, the first edition
filled the gap with something that reads like a fact — the shape of the chain, or a count of occurrences.

| was | is, per the shipped handler |
|---|---|
| the reservation is taken at **dispatch** | acquired at **DRAFT CREATION**; dispatch **CONSUMES** it; cancel **RELEASES** it, pre-dispatch only |
| "a reservation exists **iff** the shipment is dispatched" | **DELETED.** False both ways — a draft holds one before any dispatch, and a dispatched shipment holds none |
| `W*` means "a partial state no rollback undoes" | five of these steps carry a compensating rollback; `createShippingPlansBatch`'s is DURABLE, in Script Property `SPCFL_JOURNAL_<execution_key>` |
| factory stock grain "factory + SKU" | **`warehouse_id` + `sku`**; factory `available` is DERIVED, overseas `wh_available_stock` is STORED, and the two must not share arithmetic |
| every `W1` is recoverable by writing the old value back | **wrong as a general rule** — only one writer's CAS is verified, the restore re-stamps the audit columns, and a row is not always the whole effect |
| counts offered as evidence (111, 67, trigger and Drive call sites) | **withdrawn.** A count cannot distinguish a write from a comment, a constant or a comparison |

**Two Script Property keys were missing entirely** — `SPCFL_JOURNAL_*` and `PRW_RCPT_*` — which is the
concrete reason each row now records whether its literal was read this round.

**`SPCFL_JOURNAL_*` is a new kind of hazard in that list.** It is written BEFORE the first mutation so a crash
is recoverable from a later execution, and deleted on both endings. A leftover key therefore means an
execution died mid-write, and deleting it as housekeeping destroys the only durable record of the intent.

**Everything not re-read is now marked UNVERIFIED**, which is a different statement from "absent".
Status-transition legality remains unenumerated except for `cancelShipmentDraft`, whose three sets ARE now
recorded, and remains the first item of next-round work.

---

### D-S8-B3-46 — A matrix that holds the real cause constant answers confidently about everything else — **FROZEN (CP2O-R2)**

**Decision.** The map pixel capture is taken by `assets/tests/_cp2o-r2-map-capture.js`, which runs the
existing capture flow **without** the forced `--use-gl=swiftshader`. `_cp2m-r2-map-runner.js` stays
byte-identical. The evidence now records the renderer it was produced on.

**What was actually blocking it.** The software rasteriser on the capture machine creates a WebGL context
and loses it after roughly 1.3 s. A capture needs about four seconds. The canvas was therefore built,
measured as present, and gone before the screenshot. The machine has a working GPU — measured, under five
launch configurations, holding a context for 9.8-11.0 s with 304-538 real frames.

**The method error, which is the part worth freezing.** CP2O-R1 ruled out the fixture, the selector,
scheduling and host detach with a fixed 2x2 matrix, and confirmed that the context is lost. All of that
stands. It then attributed the loss to the host machine degrading — and **every cell of that matrix passed
`--use-gl=swiftshader`.** The experiment varied the branch and the viewport and held the rasteriser fixed,
so it had no power to say anything about the rasteriser. A confident conclusion about everything else is
exactly what such a design produces.

| was | is |
|---|---|
| "the host cannot hold a WebGL context" | the **software rasteriser** cannot; the GPU holds one for 10 s |
| "re-capture cannot succeed on this machine" | it succeeds on both viewports, noise floor **0** |
| "why the host degrades is outside this repository" | still **UNVERIFIED**, and no longer load-bearing |

**Why the pinned runner was not simply edited.** Its SHA is hashed against disk by two sibling suites
through `cp2m-r4r1-map/after.json` and `cp2m-r4r2-mount/after.json`, and `map-canvas-lifecycle-...-r4-r1`
additionally pins a sample count equal between its "after" run and a "before" run that cannot be re-taken.
A one-line edit would have traded one blocked suite for two, with one of them unrecoverable. The launch
parameters moved to a new entry point instead; the shared builder, fixture, server, scenes and page frame
are used **by reference**, so the two entry points cannot drift apart in anything they share.

**No threshold was loosened, no SHA pin edited, no hash faked, no gate cancelled, no browser terminated.**
The suite's assertions are the ones that were failing before the re-capture.

---

### D-S8-B3-47 — The expand latency is nine full-table assemblies; the obvious fix was measured and withdrawn — **FROZEN (CP2P)**

**Decision.** No change was made to the expand path. The measurement, the withdrawn variant and the cache
proposal go to the Owner.

**Where the time goes, on the real page at 100 SKUs.** The dispatch was never the cost: click to handler
entry is under a millisecond. `toggleReplenRow` builds the panel synchronously, and the panel needs
`getReplenishmentData()` — which re-assembles EVERY row of the station from twelve source tables. Three
callers do it (the handler, `_irRevealSkuData_`, `_irRecoRerenderSummariesRender_`), so one expand pays for
it about nine times at ~20 ms each. Median click to first paint **83 ms**; click to a resolved Execution
panel **241 ms**.

**The variant that was built and withdrawn.** A loading shell inserted in the click pass, the panel built
two frames later. First paint **83 ms -> 8 ms**. Total completion **later in TEN of TEN interleaved pairs**,
median **+39.5 ms (+15%)**. The round forbids buying a first paint with a later finish, so it was withdrawn
rather than shipped against the rule. Deferring by a frame costs a frame by construction; no variant of the
approach escapes it.

**THE METHOD IS THE PART WORTH FREEZING.** An earlier comparison — four runs per side, **pooled** rather
than paired — showed the variant **22% FASTER**, and on that basis it was already implemented, committed to
in a token rotation, and three map captures had been re-taken to match. The shipped side alone varies run to
run by 216-279 ms, which is larger than the effect. **A pooled comparison across a drifting machine is not a
measurement of the change.** Only interleaved pairs, each its own control, separated them. An earlier
single-frame variant had been rejected for a different measured reason: one `requestAnimationFrame` runs
before the browser lays out the frame the shell was inserted in, so the build still forced that layout and
identical calls went from a 23 ms mean to a 43 ms mean.

**What is offered instead, and why it is not taken unilaterally.** The nine assemblies are redundant: the
same array, rebuilt nine times inside one interaction with no data change between them. Removing the
redundancy means memoising a data assembly — a CACHE change, and a cache that serves a stale station is a
worse defect than a slow one. It would improve first paint AND total completion rather than trading one for
the other. It needs the Owner.

**Not reproduced:** the ~1 s the Owner reports. The worst first paint measured on the shipped handler is
about 106 ms, at 100 SKUs, on one machine, over loopback. The production figure stays UNVERIFIED.

### D-S8-B3-48 — The Recommendation Summary timeout is the scoped-read bound, not the transport bound — **FROZEN (CP2P)**

**Traced, and nothing on this path was changed.**

`loadInventoryGap_` -> `KM.DB.getInventoryReplenishmentGap` -> `_kmGapRead_('inventoryReplenishmentGap.get')`
-> `_kmFetchBounded_(url, init, 'read')`, whose bound is **`KM_READ_TIMEOUT_MS_` = 45 000 ms** — NOT the
shared transport's 60 000 ms. On expiry `_kmTimeoutError_` returns `REQUEST_TIMEOUT`; `loadInventoryGap_`
stores `READ_ERROR`; `classifyReadFailure` sees a code containing TIMEOUT and returns the readiness code
`REQUEST_TIMEOUT`; `_irRevealErrorHtml_` prints that code. That is the string the Owner reported.

| what happened | `_irMatState.status` | `error.code` | transport sample |
|---|---|---|---|
| no scope yet | `CONTEXT_NOT_READY` | none | none |
| still in flight | `LOADING` | none | **none — samples are recorded on settle** |
| the 45 s bound elapsed | `READ_ERROR` | `REQUEST_TIMEOUT` | `REQUEST_TIMEOUT`, ms near 45 000 |
| transport/contract failure | `READ_ERROR` | the typed transport code | phase not SUCCESS |
| server answered `success:false` | `READ_ERROR` | the server code | **phase SUCCESS** |
| read fine, no rows | `EMPTY` | none | phase SUCCESS |

**Two of those rows are measured, not reasoned.** A refused read records phase **SUCCESS** — the sample
describes the pipe, not the answer — and a read still in flight records **nothing at all**, so "no sample"
must never be read as "never dispatched".

**Checked and clear:** one gap read per confirmed Search (`_irRecoTrigger` is reached only from
`_irApplySearch_`; two searches produced exactly two reads), no dispatch from expanding a row, no auto-retry
of a timeout, and `ERROR` is never degraded into `EMPTY` or a zero — those are separate branches of
`recommendationReadiness`.

**Still UNVERIFIED:** whether the production read actually ran the full 45 s. Only the Owner-side sample can
say, and the one-line passive command for it is in the acceptance list.

---

### D-S8-B3-49 — One synchronous render shares one assembly, and nothing outlives it — **FROZEN (CP2P-R1)**

**Decision, under Owner approval.** The callers of `getReplenishmentData()` that run in the SAME SYNCHRONOUS
TASK share one row assembly. The share is released by a microtask, and a dependency that moved forces a
rebuild even inside that task.

**Measured, eight interleaved pairs, 100 SKUs** (`docs/evidence/cp2p-r1-share/`):

| | baseline | shared | paired delta |
|---|---|---|---|
| click -> first paint | 73.8 ms | 56.3 ms | **-20.1 ms, better in 8 of 8** |
| click -> Execution resolved | 239.8 ms | **123.0 ms** | **-113 ms, better in 8 of 8** |
| synchronous handler | 48.0 ms | 30.1 ms | |

Both improved. CP2P withdrew a variant that bought one with the other; this one does not, and the
measurement is paired for the reason CP2P learned the hard way.

**The dependency set, which is the whole boundary.** Scope (country, marketplace_id), the live LTS filter,
the Search generation, the workspace model BY IDENTITY, the exposure entry BY IDENTITY, exposure readiness,
and workspace-vs-legacy mode. An equal-looking new model object is a DIFFERENT source. The release is a
microtask and deliberately not a timer: a timer runs in a LATER task, which is exactly the lifetime the
approval excludes.

**Why it is safe to share an array.** Every call site reads through `find`, `filter` or `forEach`; none
sorts, pushes or splices it; none assigns to a row. That was checked across all fourteen call sites before
the share was written, not assumed.

**THE CALL COUNT IS NOT THE METRIC, and the baseline gates say so.** The callers still call about nine times
per expand. What changed is what a repeat costs. The CP2P assertions that recorded the historical redundancy
are relabelled BASELINE and read the baseline captures; one of them carried a sentence ("with no memo of any
kind") that CP2P-R1 made false while its regex stayed true, and the sentence was corrected rather than left
to pass silently.

**Unchanged:** the assembly itself, its twelve source tables, the Loader, the Boot Arbiter, the 13+6, every
write path, and every readiness rule.

### D-S8-B3-50 — The gap read cannot say where its 45 seconds went, and that is a code fact — **FROZEN (CP2P-R1)**

**Owner evidence, treated as complete and not re-requested:** 45013 ms / REQUEST_TIMEOUT, on
`marketplace_id = MKT-RESUS-US-AMAZON`, `company = ResUS`, `country = US`, `marketplace = Amazon`, with the
Runtime Master and `gapRequestedScope` in agreement. The company was taken from that record, never inferred
from US/Amazon and never from the demo fixture.

**What 45013 ms is.** `_kmFetchBounded_` aborts at `KM_READ_TIMEOUT_MS_` = 45 000 ms; the remainder is
client overhead. It proves the CLIENT gave up. **It does not prove the server was slow** — reaching a
client bound and a slow backend are different claims, and only one of them is in evidence.

**Why the client cannot narrow it, and this is the finding.** `01_router.gs` builds `rtrEntryEvidence_()`
— `routerEntryAt`, `routerRequestId`, `routerToHandlerMs` — and its own comment says it exists to
"find the execution belonging to a client request that timed out". `60_` (the inventory workspace read)
carries it. **`43_` never calls it**, and `gapBatchEnvelope_` emits only a handler-version marker: no
`serverDurationMs`, no router entry. So of the three reads one Search dispatches within 44 ms of each other,
the ONE that times out is the only one that cannot report where its time went.

**What the handler does.** `gapReadScopeRows_` -> `gapReadObjects_` -> `sh.getDataRange().getValues()`
reads the ENTIRE `inventory_replenishment_gap` sheet and filters for the one station in memory. The cost
scales with the whole table, not with the requested scope.

**The stages that remain indistinguishable from the client**, and none may be asserted over the others:
browser dispatch; Apps Script dispatch, cold start or per-user execution contention; the handler itself
(`openTarget` plus the full-sheet read); the 302 hop to googleusercontent; or a server that finished after
the client had already aborted.

**NOT DONE, deliberately:** no timeout raised, no retry added, no front-end calculation, no Recalculate or
AI Support, and no ERROR degraded to EMPTY or 0.

**Two minimal proposals, both requiring Owner approval because both touch GS:**

1. **Make the gap read able to answer the question.** Have `gapBatchEnvelope_` carry `rtrEntryEvidence_()`
   and a `serverDurationMs`, exactly as 40_/42_/60_ already do. Additive meta only: no formula, no schema,
   no new table, no behaviour change. Roughly three lines in 43_. **Limit: it can only describe requests
   that COMPLETE.** A request that times out still returns nothing, so this buys the ability to separate
   "queued" from "executing" on the slow-but-successful reads, and nothing more.
2. **Stop reading the whole table to answer for one station.** A scoped read in place of
   `getDataRange().getValues()`. This is a read-strategy change, it is materially larger than (1), and its
   benefit is unknown until the row count of the live table is known — so it should not be started on
   the strength of a guess.

**The one server-side artefact that would localise the stage** is named in the report, requested once.

---

### D-S8-B3-51 — A microtask is not the end of a synchronous scope — **FROZEN (CP2P-R2)**

**The defect was mine, and it was in the part I argued was safe.** CP2P-R1 released the shared row assembly
with `Promise.resolve().then(release)` and reasoned that a microtask runs after the current task and before
any later one, so nothing outside the render could reach it.

**That is false whenever a microtask was already queued.** The release is appended to the BACK of the
microtask queue at the moment the result is stored, so any continuation queued EARLIER runs first, while the
result is still live:

    somePromise.then(cb)       cb is queued as microtask #1
    getReplenishmentData()     stores the result, queues the release as microtask #2
    ...the synchronous task ends...
    cb runs                    AND READS THE SHARE. It is #1; the release is #2.

An ordinary awaited continuation is exactly such a callback. The share therefore leaked into async work that
had nothing to do with the render — the one thing the approval excluded. Reproduced before the fix:
a callback queued before the render saw `assemblies === 1` where it must see 2, and three queued callbacks
all inherited the render's rows.

**The correction.** An explicit synchronous render scope: a depth counter opened by the render entry points
(`toggleReplenRow`, `renderReplenishment`, `_irRecoRerenderSummariesRender_`) and closed in a `finally`. It
ends when the render ends rather than when a queue happens to drain, survives a throw, and nests. **Outside
a scope nothing is stored and nothing is consulted**, so there is no residue for a later reader to hit —
which is a stronger property than a short expiry, and it is not a timing argument.

**Identity is not a content guarantee, and the suite records what it cannot see.** The dependency snapshot
compares the read model and the exposure entry BY IDENTITY. An entry mutated IN PLACE is the same object
with different contents and is not detected. Inside one synchronous task nothing can mutate them, which is
the only reason the comparison is sufficient — and that reason exists solely because the scope is
genuinely synchronous. CP2P-R1 leaned on identity while its scope was not; this round removes the lean by
fixing the scope, not by widening the comparison.

**Not done:** the lifetime was not extended anywhere to protect a performance figure.

### D-S8-B3-52 — "No correlatable record" is UNKNOWN, not "never arrived" — **FROZEN (CP2P-R2)**

**Correcting my own handoff.** CP2P-R1 offered a decision rule ending "no execution = never reached the
handler". That is wrong, and it is wrong twice.

1. **Absence of a findable record is not evidence that the request never arrived.** It is absence of
   evidence. The only honest verdict is **UNKNOWN**.
2. **There is no correlation key in the log to find it by.** `01_router.gs` captures the client's `km_rid`
   into `RTR_ENTRY_RID_` and returns it in the RESPONSE meta; it is never written to any server-side log
   (`Logger.log` appears twice in that file, both for error stacks). So the Apps Script Executions list
   carries function, start time, duration and status — and no request id. "No correlatable record" is
   therefore the EXPECTED state, not a signal about the request.

**The segments, which must not be collapsed into "the backend was slow":**

| segment | what it covers | observable today |
|---|---|---|
| pre-router | client dispatch -> `doGet` begins executing: front-end, dispatch queue, cold start, per-user contention | **No.** The client sample records elapsed ms, not an absolute dispatch instant; the server writes no entry line |
| in-router | router entry -> handler start | `routerToHandlerMs` EXISTS in `rtrEntryEvidence_()`, but 43_ never calls it, and it ships only in a response |
| handler | handler start -> response built | the `serverDurationMs` pattern exists in 40_/42_; 43_ emits none |
| return | response built -> client receives it, including the 302 hop | **No** |

**AND ALL FOUR RIDE ON A RESPONSE.** A request that times out produces none. So the additive response-meta
proposal **cannot observe the failing case at all** — it can only characterise slow-but-successful reads.
That limit was stated in CP2P-R1 and is restated here because the proposal reads like an answer and is not
one.

**What would observe it** is a server-side record written DURING the execution, carrying the client's
`km_rid` from router entry. That is a GS change. **It is NOT approved and was not implemented**, and neither
was the scoped-read proposal.

**Retained, not re-requested:** 45.013 s / REQUEST_TIMEOUT, `marketplace_id = MKT-RESUS-US-AMAZON`,
`company = ResUS`, `country = US`, `marketplace = Amazon`, Runtime Master and `gapRequestedScope` in
agreement.

**Current verdict on which segment consumed the 45 seconds: UNKNOWN.** A time-window match against the
Executions list is circumstantial — one Search dispatches three reads within 44 ms of each other, so
several `doGet` executions sit in the same window with nothing to tell them apart.

---

### D-S8-B3-53 — A marketplace SKU resolved without `company` is resolved by sheet row order — **FROZEN (CP2R)**

**The owner was right; the identity handed to it was wrong.** `KMCALC.normalizedAvgSalesPerDay` isolates
campaign contamination strictly by `scope.marketplaceSkuId`, refuses to guess by master SKU, and fail-fasts
on a line that cannot prove site membership. All of that is correct and unchanged. What was wrong sat one
layer above it: `recoWsResolveSalesRate_` resolved that id out of `marketplace_skus` by
`sku + country + marketplace` and took the FIRST matching row.

`DATABASE_RELATIONSHIP_MAP.md` states that `company` on that table is **required** and that
`company + country + marketplace` is what distinguishes operational ownership; the match grain is
`sku + company + country + marketplace`. The sibling reader `recoWsSiteSkuBySku_`, in the same file, already
matched all three. So when KM and ResUS both sell one master SKU into US / Amazon, **sheet row order decided
whose marketplace_sku_id was used**, and therefore whose campaign days were removed from whose average.

Reproduced before the fix, with the real resolver over the real owner: asking for ResUS twice, changing
nothing but the order of two rows, returned `16.55` in one order and `13.10` in the other, excluding
`2026-10-07` (the KM campaign day) instead of `2026-10-06` (the ResUS one). The two spikes in the fixture
differ ON PURPOSE — with equal spikes the published rate comes out the same whichever day is wrongly
excluded, and the defect hides behind a number that looks right.

**The repair** adds `company` to that one match. No new API, no schema change, no formula change, no second
averaging engine, and no change to the frozen owner.

**Not done:** the country comparison on that lookup is still a RAW string match while the sales-snapshot
match is canonical (`KMCID`). Making them consistent is a separate question because the EU aggregate scope
resolves `scope.country = 'EU'` while member rows carry IT/DE/ES/FR — changing it blind would risk the EU
path. Recorded as an open item, not silently altered.

### D-S8-B3-54 — A blocked horizon must not delete the sales history — **FROZEN (CP2R)**

`mLine.horizonBasis` carries `avgSalesPerDay` and the four §22 quality fields. It was assigned **inside**
`if (mHz)`, so a line whose day-horizon could not be built published **no basis at all**. A horizon fails for
forecast-side reasons — a covered month's regular FC missing, an unresolvable Site-Stock opening — none of
which say anything about whether the SKU has 29 clean normal days of sales history. The page then showed
`--` for Avg Sales and Days of Supply, and the API was right while the screen was wrong.

R46 had already moved the RESOLVER call out of the `sales_driven` branch. This moves the PUBLICATION out of
the horizon branch, which is the same mistake one layer further down.

**What stays guarded:** `mLine.horizons` is still assigned only when a horizon was built — a horizon is
never fabricated. And the basis still fabricates nothing: every field reads `sr.ok ? ... : null`, so an
unresolved basis is null in every field and a confirmed **zero** is published as zero. Valid 0, missing and
quality-error remain three distinguishable states.

**`contaminationApplied` / `contaminationSource` now travel with the basis.** The resolver legitimately
recomputes WITHOUT the campaign/event filter when a campaign line cannot prove site membership, because
contamination must never gate READY. That retry was **invisible**: an un-excluded rate and a clean one are
the same number shape. The flag was already returned by the resolver and was being dropped at this boundary.
Carrying it is what makes the degradation observable rather than silent.

**Superseded gate:** `sales-horizon-reconciliation-f1-4b-fm5r4jlive8` asserted
`if (mHz) { ... mLine.horizons = mHz` — an assertion that REQUIRED the defect. It is replaced by the two
invariants that were actually worth protecting (the horizon stays guarded; the basis fabricates nothing),
with the reason recorded at the assertion.

### D-S8-B3-55 — Seven post-handler assemblies, three turns, one scope per callback — **FROZEN (CP2R)**

**Measured before scoped.** With the handler already scoped by CP2P-R2, a 100-SKU expand still ran **seven**
full-station assemblies AFTER the handler returned, about 150 ms. The number of calls is not the question
that decides whether a scope can help — a render scope may only share inside ONE synchronous turn. So every
call was stamped with its turn (a marker microtask queued at the first call of a turn; anything still in that
task reads the same number). The answer: **7 calls, 3 turns, and one turn assembling 5 times.** Four of the
seven are capturable without a share ever outliving the callback that made it.

**The scope is the callback and nothing larger.** Each reveal callback runs inside `_irWithRenderPass_`,
released in a `finally` the moment it returns. Nothing is stored or consulted outside a scope, so the next
frame, the other panel's callback and every later continuation each assemble for themselves. This is
deliberately NOT a memo across callbacks or frames — that was the CP2P-R1 defect and the approval excludes
it.

**Wrapped at the gate registration site, not inside the paints.** `_irRecoRevealPaint_` and
`_irExecRevealPaint_` are extracted BY NAME and executed by several suites; putting the helper call inside
their bodies would make those extractions depend on a helper outside the slice they take — the exact
coupling that broke six suites in CP2P-R2. The suite that exercises the gate declares the dependency
explicitly instead.

---

### D-S8-B3-56 — An un-excluded average is not a normal average — **FROZEN (CP2R-R1)**

**CP2R made the wrong thing observable instead of removing it.** When a campaign line cannot prove site
membership, the frozen owner throws. `recoWsResolveSalesRate_` caught that and **recomputed with
`compute([], [])`** — no campaign filter, no event filter — and returned the result as `ok: true`. CP2R
noticed the retry was silent and carried a `contaminationApplied: false` flag to the line so a reader could
tell. That was an improvement on hiding it and it was still the wrong answer.

The number that retry produces is **inflated by exactly the campaign days §22 exists to remove**. Publishing
it as a legitimate rate asks every surface, and every human, to notice a boolean before trusting a figure
that otherwise looks like every other figure in the column. The rule "contamination must never gate READY"
was read as "therefore publish something"; the correct reading is that contamination must not gate READY
**for reasons that are not about the data**, and an unresolved identity is about the data.

**Now:** the retry is gone. An owner throw returns `{ ok: false, reason:
'SALES_BASIS_CONTAMINATION_UNRESOLVED', detail: <the owner message> }` and **no rate is published**.

**What was deliberately NOT swept up with it**, because fail-closed is easy to over-apply:

| case | disposition | why |
|---|---|---|
| contamination source **present and empty** | resolves normally, `PRESENT` | a site that ran no campaign has nothing to exclude |
| contamination source **absent** | resolves normally, `ABSENT` | differentiated from present-empty, as before |
| **fewer than 3 normal days** | resolves via `weekly_7d`, warning `insufficient_normal_days` | the frozen §22 fallback rung is a legitimate basis |
| **confirmed zero** sales | publishes `0` | zero is an answer, not a gap |
| **no marketplace_sku_id AND no campaigns** | resolves normally | identity was never needed |
| **no marketplace_sku_id WITH campaigns** | fails closed | identity is needed and cannot be proven |

### D-S8-B3-57 — One operational scope, one marketplace SKU id — **FROZEN (CP2R-R1)**

CP2R stopped the resolver reading **another company's** row. It still took the **first** row that matched,
which is correct only while the complete scope maps to exactly one id. When it maps to two there is no right
answer to pick, and picking one is a guess with a 50% error rate that **changes with sheet row order** — the
same class of defect CP2R had just removed, one step later.

`company + country + marketplace + sku` now collects the **distinct** ids. Two or more returns
`{ ok: false, reason: 'MARKETPLACE_SKU_AMBIGUOUS', detail: <the colliding ids> }`. Two rows carrying the
**same** id are not ambiguous — that is one site listed twice.

### D-S8-B3-58 — A quality error that lives in metadata is one nobody acts on — **FROZEN (CP2R-R1)**

The Avg Sales column printed a number or `--`, and `--` meant at least four different things: no sales
history, an ambiguous channel, an unresolvable identity, and a horizon that happened to fail. Meanwhile
§22's `source` and `warning` reached the row object and stopped there.

**Two surfaces now carry it.** `horizonBasis.basisQualityError` carries the **named** reason on the line —
which matters most for `forecast_driven`, because that path never sets `horizonsBlockedReason` and so had
nowhere at all to say why its rate was missing. And the cell renders it: the word **unavailable** where no
trustworthy rate exists, a quiet **!** beside a real number drawn from a thin sample, nothing at all when
the basis is clean, and the full sentence as a title in every case. An unmapped future code renders the code
rather than a blank.

**The stylesheet rotated with it** (`irtpunresolved-20261011` → `iravgquality-20261015`). Five new classes
would otherwise have **zero rules** in any browser holding the cached copy, and the word `unavailable` would
arrive as bare body text inside a numeric column — the `.psb-state` failure for the fourth time, which is
precisely why that token family exists.

**Planning is untouched in both directions.** `sales_driven` already fails closed rather than recommending
from a rate it cannot trust, and now does so with the specific reason. `forecast_driven` still plans from
regular FC + Target%: the historical field is published beside its horizon and **never switches the formula**.

### D-S8-B3-59 — The correctness fix paid for itself in bytes — **RECORDED (CP2R-R1)**

CP2R left **72 bytes** of headroom and the ledger escalated that as release-blocking. R1 had to add an
ambiguity check to the same file. It **fits — but only just, and not for the reason the first draft of this entry claimed.**

```
BEFORE R1 (b1061f31)   4,599,928   headroom   72
R1  42_ only                 +41
AFTER  R1              4,599,969   headroom   31
```

**THE NUMBER MOVED TWICE AND BOTH CORRECTIONS BELONG HERE.** Removing the `compute([], [])` retry and the
paragraph defending it returned **−497 bytes**, and this entry was first written around that figure with the
observation that a defensive fallback nobody should rely on costs bytes twice — once for the code, once for
the prose. That observation is still true and it was not the whole story.

The full regression then found that collapsing both catch arms into one had made **every** owner throw
report `SALES_BASIS_CONTAMINATION_UNRESOLVED`, including an unparseable `snapshot_date`, which is a broken
basis and has nothing to do with exclusions. Naming two different failures the same way is the defect this
round exists to remove, so the throw is now discriminated — and that correction costs ~538 bytes, which is
what turns −497 into **+41**.

(An even earlier draft said −493. That was arithmetic on a byte count taken with a lossy encoding of the
§ and em-dash characters in the comment being deleted. The audit instrument is the authority in all three
readings, and every figure above is its output rather than a subtraction.)

**Nothing was raised, retired or compressed.** 31 bytes is the tightest this budget has been, and it is
reported rather than relieved.

**Nothing was raised, retired or compressed to achieve this.** It is recorded because it is the opposite of
the usual direction and the reason is reusable: **a defensive fallback nobody should rely on costs bytes
twice** — once for the code and once for the paragraph explaining why it is safe.

---

### D-S8-B3-60 — A derived period that the operator may edit is not derived — **FROZEN (FCB1 §A)**

"Adjust From Previous Month Forecast" names its own source: the month before the Target. The builder
rendered that as two **editable** fields seeded with the answer, so the sentence the method describes
and the value it used were free to disagree — and `_regularBuildPreview` read the **fields**, not the
Target, so a disagreement won.

Three defects, one shape, at increasing distance from the user:

| | before | now |
|---|---|---|
| **derivation** | Based Year/Month editable, seeded from Target | `_regularDerivedBasePeriod_` is the single pure owner; the fields are `readonly` / `disabled` |
| **staleness** | `regular-target-year` had **no change handler at all**; `regular-target-month` re-seeded the fields and left the preview standing | `onRegularTargetChange()` re-derives **and** clears the preview, which is what disables Save |
| **trust** | the preview read the period back out of the DOM | the preview derives its **own** copy and records `baseYear`/`baseMonth` on itself |

The staleness one is the one worth naming. `saveRegularUpdate` writes the period captured in
`_regularPreview`, so a stale preview did **not** write the wrong month — it wrote the month the
operator could no longer see. Preview Jan, switch the Target to Feb, Save: the write was internally
consistent and the screen was not, which is the hardest kind of wrong number to notice.

A blank Target Month also stopped defaulting to `'0'`. The one field that decides which month gets
written may not have a fallback: missing is missing, not January.

**Deliberately NOT swept up:** the *Apply Growth Rate* Base Year/Month stay **editable**. That period
is an operator choice, not a derivation, and locking it would be this round over-applying its own rule.

### D-S8-B3-61 — `actual` has never meant actual sales — **RECORDED (FCB1 §A/D)**

The internal value behind the label *Apply Growth Rate* is `'actual'`. Its basis is, and has always
been, the existing `fc_regular_forecast` row for the chosen Base Year + Base Month. FCB1 is the round
that brings historical-sales reading to this page, which is precisely when a name like `actual`
becomes an invitation. §D of the suite pins the basis so the invitation has to be declined explicitly.

### D-S8-B3-62 — The only source that can prove a historical month is one no request can reach — **RECORDED (FCB1 §B, read-only)**

The Owner-approved interval rule requires, per month: **daily** rows, **provable month completeness**,
**daily** campaign/event-day exclusion, and **company** isolation. Survey of every sales source the
repository actually has:

| source | horizon | why it cannot answer |
|---|---|---|
| `amazon_daily_sales_snapshot` (Sheet) | **rolling 90 completed days, older rows PRUNED** (`06_` config 4, `retentionDays: 90`; `09_amazonUpsertRollingSnapshot_` prunes) | cannot reach last year's same month, or any range older than ~3 months |
| `amazon_weekly_sales_snapshot` (Sheet) | full rewrite from an external "Combined Sheet"; horizon **not determinable from this repository** | weekly grain cannot prove **month** completeness, weeks straddle month boundaries, and daily selling-day exclusion is impossible |
| BigQuery `amazon-database-489810.AmazonSales.Raw Daily Sales` | **full history, never pruned** | the only source that satisfies the rule — and **no request-time read path exists**. It is reached only by the scheduled import runner (`07_`/`08_`), never by an action, and never by the client |

**And a second, independent blocker that no amount of history fixes.** Neither snapshot carries a
`company` column — `normalizeAmazonDailySalesSnapshotRecord` has no company field at all, and
`supply-planning-calculations.js` states company "is NOT a column of amazon_daily_sales_snapshot and is
NEVER inferred". The server works around this with the assumption recorded in `42_`, "one scope = one
company". The FC Builder's scope is `company|country|marketplace`, and KM and ResUS **both** operate
US/Amazon, so a client-side average over the broad cache could not isolate company **by construction**
— the same class of defect D-S8-B3-57 has just made fail-closed one layer down. A browser-side
interval average is therefore not a smaller version of the feature; it is the feature computed wrong.

Also noted, read-only, not acted on: the `06_` comment above config 4 still says "a rolling 30
completed days" while `retentionDays` is 90. The code is the authority; the prose is stale.

**Consequence:** the interval mode needs a **server-side owner**, which is a GS change. The smallest
comparable module in the directory is `55_api_v1_lead_time_owner.gs` at **8,712 bytes**; a lean
handler reusing `amazonRunBigQuery_` and the existing per-date coverage prober
`amazonQuerySourceDateCoverage_` would still be several kilobytes. **Headroom is 31 bytes.** It is not
short by a margin that trimming reaches, and nothing was raised, retired or compressed to pretend
otherwise. Queued behind it, still unimplemented: CP2Q's narrowed gap-timeout diagnostic (1,423 bytes).

---

### D-S8-B3-63 — A token is spent when its bytes have been SERVED, and that is a fact about the remote — **RECORDED (FCB1-R1)**

The previous round reported `r57-avgsalesidentity-20261015` as unpublished and therefore reusable,
and declined to rotate. **That was true when it was written and is not true now.** `origin/main` has
since moved to `45be6010` and the live site is serving r57. The only thing that changed is that the
Owner pushed.

So FCB1 **does** owe a rotation, and `r58-derivedbaseperiod-20261015` is minted. A browser holding r57
keeps a builder whose Based Year/Month are editable, whose Target Year has no change handler, and
whose Preview reads the period back out of those fields — it can still Save a preview built for a
month the form no longer shows. The defect is page-side, so a stale page keeps it.

**The reusable lesson is the one this costs least to learn:** *spendable* is a property of the remote,
never of the working tree, and it has to be re-checked each round rather than carried forward from the
last report. A round that opens by reading its own previous conclusion about publication state is
reading a cached value with no invalidation.

**The MAP series is deliberately NOT rotated**, and not by omission. The R12 note records a condition:
if CP2M-R4-R1 shipped *before* R4-R2, R12 is spent and R4-R2 owes its own entry. The condition **did
not occur** — `5d6e4a18` and `65eb95b5` are both ancestors of the same published main, so they were
served together and R12 names both. The IR stylesheet series is untouched for the same reason: no IR
file changed in R1.

### D-S8-B3-64 — Five captures, derived rather than recalled — **RECORDED (FCB1-R1)**

96 evidence files carry a `sources` map and most of them pin `index.html` or `app.js`, so a token
rotation looks at first like a 20-file re-capture. It is five, and the derivation is what says so:
**only the suites that hash a capture against the CURRENT source can be invalidated by changing it.**

A `before.json` is never hashed against current source — it is compared against its `after` sibling
(`BEFORE.sources[x] !== AFTER.sources[x]`), which is the assertion that the two captures were taken on
*different* code. Those files are ALREADY stale by several rounds and are **supposed** to be. Re-taking
one would delete the only record of the state the fix was measured against.

Derived set, each from its own evidence file rather than from memory:

| suite | capture it hash-verifies |
|---|---|
| `map-canvas-acceptance-s8-b3-r3-cp2m-r2` | `cp2m-r2-map/map.json` |
| `map-canvas-lifecycle-s8-b3-r3-cp2m-r4-r1` | `cp2m-r4r1-map/after.json` |
| `map-mount-continuation-s8-b3-r3-cp2m-r4-r2` | `cp2m-r4r2-mount/after.json` |
| `navigation-performance-observation-s8-b3-r3-cp2m-r2` | `cp2m-r2-perf/perf.json` |
| `site-priority-viewport-acceptance-s8-b3-r3-cp2m-r2` | `cp2m-r2-viewport/measurements.json` |

Every one was captured to a scratch directory and **compared before installing**, because a degraded
capture that is structurally valid overwrites a good one silently. All five differ from their
predecessors **only** in the two token-bearing hashes plus timing jitter (sample counts, `leftAt`,
`markupArrivedAt`); every structural and behavioural field is unchanged — viewport `results` is
byte-identical, perf is 63/63 ok runs with 0 page errors, lifecycle holds 1 create / 0 destroys /
0 context losses, mount holds the same 0/0/1 · 0/0/1 · 1/1/1.

`boot-census.json` is not hash-pinned but is recomputed from the live `index.html`, and it moved
**+13**: the token grew one character across its 13 occurrences in `app.js`. `index.html` carries 54
more occurrences that do not count, because it is the file that *lists* the boot scripts and is not
one of them.

### D-S8-B3-65 — The single-month write is proved by a fixture, not by an operator — **FROZEN (FCB1-R1)**

§D asserted the write contract at source level, which proves the line is still written and nothing
about what it produces. "Only the Target month changes" was therefore a claim an operator could only
confirm by pressing Save on production data — and **acceptance must never require a production
write**.

§E now executes the real `saveRegularUpdate` against a fake write API. The fixture gives the eleven
other months **distinct** values including an explicit `0` and a **blank**, because twelve equal
numbers cannot tell "preserved" from "rewritten with the same thing". A mutant that rewrites every
month kills 13 assertions. The stored `0` stays `0` and the blank stays blank: neither is forced
through a numeric default on the way out.

Owner acceptance for this round is therefore **Preview / Cancel only**.

---

### D-S8-B3-66 — One undated row deleted eighty-four dated ones — **FROZEN (CP2S A), BLOCKED ON BUDGET**

The Owner export holds 10,342 daily rows, **353 with an empty `snapshot_date`**. US / CO1150-AG holds 84
perfectly dated rows and publishes **no average at all**, because one undated row reaches the frozen
owner, which requires a strict date and throws.

**The asymmetry is the proof, and it is inside one function.** The EU aggregate branch of
`recoWsResolveSalesRate_` has always skipped undated rows. The single-market branch handed every scoped
row straight through. Two branches, one boundary, one of them already correct. The fix moves that
decision to the **one boundary both branches read from**, and deletes the EU branch now-dead guard.

**Blank only, and counted.** A non-empty value this layer cannot parse is a cell somebody wrote: it
still fails closed with the owner own message rather than vanishing into a tally. `blankDateRows`
travels on the resolved basis and appears in the "no daily or weekly rows" detail, because *there are
no rows* and *the rows were all undated* are different facts and only the second tells the Owner what
to repair. **No date is ever substituted** - not `synced_at`, not today, not a neighbouring row.

**Deliberately not swallowed**, each pinned: confirmed zero still publishes 0; all-undated reaches the
legitimate weekly rung and says `insufficient_normal_days`; undated daily **and** no weekly publishes
nothing rather than a fabricated 0; an unresolvable campaign identity still fails closed as
contamination and is not relabelled a date problem; a resolvable campaign still excludes its day.

**IT DOES NOT FIT.**

```
BUDGET                  4,600,000
at ab624f30             4,599,969    headroom      31
with the fix            4,601,373    OVER BY    1,373
executable change alone    +270 B    OVER BY      239
```

The second line settles it: strip **every word** of explanation and the code alone is still 239 bytes
over. There is no version that fits, so this is a **budget decision, not a craft decision**. Budget not
raised, no module retired, nothing in another file compressed. All 46 suites reading 42_ are CLEAN; the
load-surface gate is the single red light, red by exactly the number above.

**SETTLED — the Owner raised it to 4,610,000 (D-S8-B3-74).** The 4,600,000 above is kept as the
figure this round was measured against and **is no longer an open question**; a reader arriving here
should not re-open it. What is recorded here is still worth keeping: the refusal to trim prose or
retire a module to buy 239 bytes, and the executable-only floor that proved no version fit. The raise
that followed covers **only** the three IR items named in D-S8-B3-74, and the headroom it left is not
a licence for anything else.

### D-S8-B3-67 — A response in which every average failed is still a response — **FROZEN (CP2S B7)**

`_irRecoRefreshVelocityCells_` repaints only when `_irRecoHasCanonicalBasis_()` is true, and that
predicate asked for one line **with a rate**. So a response in which every SKU resolved to a NAMED
quality error was **indistinguishable from a response that never arrived**: nothing repainted, and the
column kept the placeholder it had before the request was issued.

A permanent `--` reads as *no sales*. What happened is *I asked, and every answer was an error I can
name*. CP2R-R1 gave the server the words (D-S8-B3-56) and the cell the markup (D-S8-B3-58); this was
the gate in between, throwing the whole answer away for being bad news.

**Now:** a basis carrying either a rate **or** a named quality error counts as an answer. A basis with
**neither** still says nothing and still does not earn a full table render; the S8-R4D-F1A stale-scope
guard is untouched. **Page-side only - zero GS bytes.**

### D-S8-B3-68 — The historical average reaches two of four destination lanes — **RECORDED (CP2S B5/B6), SERVER-SIDE GAP**

| destination | demand mode | carries `horizonBasis`? |
|---|---|---|
| MARKETPLACE | sales_driven | **yes** |
| MARKETPLACE | forecast_driven | **yes** (D-S8-B3-55 decoupled it from the horizon) |
| WAREHOUSE | sales_driven | **no** |
| WAREHOUSE | forecast_driven | **no** |

`horizonBasis` is assigned in exactly one place, inside `recoWsExpandMarketplace_`.
`recoWsExpandWarehouse_` never mentions it. The fulfillment model routes each site to **one** lane:
`self_fulfilled` to WAREHOUSE. So a self-fulfilled site produces **no MARKETPLACE line at all**, the
page picker finds nothing, and the column shows `--`.

**That is "not sent", and the page renders it as "no sales".** Widening the picker alone cannot fix it:
there is nothing on a warehouse line to find. The repair is server-side, in the same file that is
already 1,373 bytes over budget, so it is recorded and **not attempted**. The suite pins the gap and
will fail when the server half lands, which is the point.

### D-S8-B3-69 — The CORS message and the 500 are almost certainly one event — **RECORDED (CP2S D), ATTRIBUTION UNKNOWN**

**The screenshot did not reach this session**, so the failing action is **UNKNOWN** and is not guessed.
What the code settles:

**The page issues exactly three server actions**, so the candidate set is closed:
`getWorkspace('inventoryReplenishment')` (4 call sites), `getWorkspace('recommendation')` (1), and
`inventoryReplenishmentGap.get` (1 - the action already known to time out at ~45 s, CP2Q).

**Why one event and not two.** Apps Script answers every `/exec` POST with a 302 to
`script.googleusercontent.com`. An Apps Script **exception page carries no
`Access-Control-Allow-Origin`**, so the browser rejects it *before* JavaScript can read the status: the
page observes `TypeError: Failed to fetch` and DevTools labels it a CORS error. The 500 is the real
server failure; "CORS" is how a browser reports that a failed response had no CORS headers. Treating
them as two faults would send the repair to the wrong layer.

**The stage.** The request ARRIVED - otherwise the router would have answered with its structured
envelope, which this transport does classify (`DEPLOYMENT_CONTRACT_MISMATCH`,
`REQUEST_METHOD_DOWNGRADED`, `AUTH_OR_ACCESS_HTML`, `HTTP_NOT_FOUND_HTML`). Those paths all require a
**readable** response; a CORS-blocked one is not readable at all, so none can fire and the transport
falls to its least specific code, `TRANSPORT_ERROR`. **The failure is inside the handler, after entry,
and only the Apps Script execution log can see it.**

**Why each forbidden shortcut is wrong, specifically:** `no-cors` makes the response *opaque* (status 0,
body unreadable) - it hides the 500 rather than fixing it; a higher timeout does nothing for a 500; an
auto-retry re-runs a read already known to spend 45 seconds; disabling verification removes the only
machinery that can name the fault.

**What would settle it, and it already half exists:** the request id. `km_rid` is already placed on the
query string by the transport, and `01_router.gs rtrMarkEntry_` already captures it on every request.
The correlation key exists **on both sides today**; what is missing is the log read - which is exactly
CP2Q proposal, still unimplemented and now behind a budget wall.

---

### D-S8-B3-70 — Deployment state is a fact about the Apps Script project, not about Git — **FROZEN (FCB1-R1 correction)**

The FCB1-R1 report listed, under its release list:

```
APPS_SCRIPT_SYNC_REQUIRED   (none — FCB1/R1 touched no .gs)
前輪遺留(仍待 Owner 同步)   assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs
```

The first line is correct. **The second is an inference Git cannot support.** "This commit changed
42_, and I have not seen a sync happen" is not evidence that 42_ is unsynced — the sync is a manual
Google-UI action by the Owner that leaves **no trace in this repository at all**. The ledger
(`DEPLOYMENT_RELEASE_LOG.md`) records *intent*; only a live `system.health` probe reports what
Production is running, which is already recorded as D-"release log is intent, not live state".

**This is the same error as the r57 one, one category over.** There, publication state was read from
the working tree instead of the remote. Here, deployment state was read from the commit graph instead
of the deployment. Both are properties of a system outside the repository, and **both have to be
checked rather than inferred, every round.**

**Corrected release list for `45be6010..ab624f30` (FCB1 + FCB1-R1):**

```
APPS_SCRIPT_SYNC_REQUIRED   none          — no .gs in the range
BUNDLE_REBUILD_REQUIRED     NO
```

**42_ deployment status: listed separately, and UNKNOWN.** The file last changed in `45be6010`
(CP2R-R1) and changed again in `68a395a8` (CP2S, which is over budget and not releasable). Whether
the `45be6010` version is live in the Apps Script project **cannot be determined from this repository
and is not asserted in either direction.**

**And the probe does not settle it either — a correction to the line that said it would.** The
sentence above originally ended "a `system.health` probe, or the Owner, settles it". For 42_ that is
not true, and the reason is checkable in this repository:

- 42_ **publishes no build symbol.** The per-file stamp manifest in `63_api_v1_system_health.gs`
  carries `01_`, `03_`, `47_`, `56_`, `59_`, `66_`, `69_` and others; **42_ has no row and no
  `*_BUILD_VERSION_` constant of its own.** `mixed_deployment` therefore has nothing to compare.
- **The CP2S / CP2S-R1 changes add no action.** They alter what the recommendation workspace computes
  internally; the router's action list is identical before and after. 63_'s own comments already state
  this failure mode for `20_` and `58_`: "a partial sync of this file was invisible to `system.health`".
  An action list cannot see a change that adds no action.
- `build_id` is the **release**, not a per-module fact — already recorded as "deployment release vs
  module stamp". A uniform `build_id` is consistent with a stale 42_.

**So the correct status after a clean health probe is still UNKNOWN.** Only the Owner stating that the
file was copied, or a stamp being added to 42_ in some future round and then probed, can answer it.
A probe that cannot distinguish the revisions returning "healthy" is **not** evidence of a sync, and
recording it as one would be the same inference error one level further out: this time reading
deployment state from an instrument that was never pointed at it.

### D-S8-B3-71 — The source contract's evidence now carries an as-of date — **FROZEN (FCB1-R1 correction)**

The contract reported the **2026-08-03** duplicate analysis (12,882 rows, 6,382 duplicate groups) as
the current condition and instructed the reader to "assume duplicates are present". It is a dated
observation, and the register now holds three readings instead of one:

| as of | source | duplicate groups |
|---|---|---|
| 2026-08-03 (A2-DATA) | export analysed in the import spec | 6,382 · 243 conflicting |
| 2026-08-03 (A3-PREP) | same export, authorised refinement — **PROVISIONAL**, execution **BLOCKED** | 0 conflicting · 6,382 auto-eligible |
| latest Owner attachment | destination sheet, read-only | **0 duplicate · 0 conflicting** |

Latest attachment in full: **10,342 rows · 9,989 valid unique keys · 0 duplicate groups · 0
conflicting groups · 353 invalid date keys.** 9,989 + 353 = 10,342 exactly, so **every row is either
a valid unique key or an invalid date key**, and there are no duplicates among the valid ones.

**It is an attachment, not a BigQuery reading, and it is not treated as one.** It describes the
destination sheet; the source's own duplicate state remains UNKNOWN. **No historical cleanup is
requested**, and `MISSING_OWNER_INPUT #2` is withdrawn rather than left open as pressure.

Recorded as an observation and not asserted as the explanation: the affected range was 2026-06-03 to
2026-07-30, and the rolling 90-day window as of 2026-10-15 begins around 2026-07-17, so most of that
range has aged out of the sheet on its own.

**And the 353 connects to CP2S.** D-S8-B3-66 skips rows whose `snapshot_date` is **blank** and keeps
failing closed on a value that is present but unreadable. The attachment counts **invalid date keys**,
which is the wider category.

**ANSWERED, and the UNKNOWN is withdrawn (FCB1-R1 freeze, 2026-10-16).** This entry said it was
unknown how many of the 353 were blank versus present-but-unparseable, and that the split decided how
much of the 353 the skip recovers. **The Owner has stated that all 353 are blank.** In this
attachment the wider category and the narrower one hold the same rows, so the skip covers all of
them; the question it was named to keep open is closed by evidence rather than by assumption, which
is why it was named rather than guessed.

**Scope, and what does not change.** This is one read-only export of the destination sheet at one
moment. It is **not** a statement about the live sheet now and **not** a statement about BigQuery
`Raw Daily Sales`. **The present-but-unreadable path is not relaxed**: a `snapshot_date` somebody
wrote and this layer cannot parse still fails closed with the owner's own message. A count of zero
occurrences in one export is not a reason to delete the branch that handles them.

### D-S8-B3-72 — Three completeness questions, and the zero-row rule was never ours to impose — **FROZEN (FCB1-R1 correction)**

The contract ran source completeness, import completeness and per-SKU presence together. They have
different authorities and different failure modes:

| | question | what answers it |
|---|---|---|
| **Q1** | is the **raw source** complete for this month? | a source-side completion signal. The destination can never answer this. |
| **Q2** | did the **import** land **as many distinct keys** as the source had? | `amazonReadDailyGapAware_`, per date, destination distinct-key **count** vs source — already built |
| **Q3** | is **this SKU** missing on this date? | an enumeration over scope+SKU, not a table-wide total |

A perfect import of an incomplete extract passes Q2 and fails Q1.

**Q2 is a COVERAGE check, and the first draft read it as more (FCB1-R1 freeze).** It compares *counts*
of distinct natural keys, so it proves a date is **not short** — and it does not prove the two sides
hold the **same** keys (equal counts over a different key set pass), it compares **no sales values**
at any point, and it says nothing about whether the SKU being averaged is among them. Useful, and
smaller than "the import landed everything".

**And the first draft said a complete month requires a physical row per SKU per date. That was an
overreach.** Zero-row omission is a normal and often better reporting design. **It is provable with
three parts, not two** — the earlier version of this entry named only the first two:

- **(a)** a trustworthy per-date source-completion signal; **and**
- **(b)** a stated omit-zero rule; **and**
- **(c) evidence that this scope+SKU was within that date's reporting coverage.**

**(c) was missing, and without it (a) and (b) do not reach the conclusion.** Together they license
*"nothing absent from this complete date sold"*; they do not license *"this SKU sold nothing"*. A SKU
that was delisted, not yet launched, outside the report's scope or owned by another entity is absent
for a reason unrelated to sales, and counting those days as zeros puts days in the denominator that
were never in the numerator's universe — the average falls by arithmetic rather than by trade. It is
the Q3 population error arriving one step later. **(c) does not prescribe an instrument**: a listing
status history, a per-date report-scope manifest, or a stated coverage rule each satisfy it; what it
forbids is the reader inferring coverage from the rows it happens to see.

**With any one of the three missing, an absent row is MISSING and the month is refused — that
default is unchanged and is not negotiable.** What changed is that a workable alternative proof is
now named instead of excluded by a rule this document had no standing to impose.

---

### D-S8-B3-73 — I inferred an execution stage from a browser-side symptom — **CORRECTED (CP2S-R1)**

D-S8-B3-69 wrote: *"The request ARRIVED - otherwise the router would have answered with its structured
envelope... The failure is inside the handler, after entry, and only the Apps Script execution log can
see it."*

**That is an inference from an absence, and the absence has more than one cause.** A browser that is
refused by CORS cannot read the status, the body, or the headers. From that position it is impossible
to tell apart:

- the request never reached the deployment (wrong URL, revoked access, project disabled);
- it reached the router and the router itself threw before dispatch;
- it reached the handler and the handler threw;
- it reached the handler, the handler returned, and the response was lost in the redirect chain.

The structured envelope is missing in **every** one of those, so its absence names none of them. I
reasoned "the classifier paths all need a readable response, therefore the failure is deep" - but the
same unreadability is exactly what makes the depth unknowable. **The conclusion was shaped by the one
hypothesis I had already formed.**

**Corrected status, all three UNCONFIRMED:**

| | status |
|---|---|
| which action | **UNCONFIRMED** - the page issues three; nothing narrows it further without the screenshot |
| whether the handler was entered | **UNCONFIRMED** |
| which stage failed | **UNCONFIRMED** |

**What survives, because it is about the mechanism rather than the incident:** an Apps Script exception
page carries no `Access-Control-Allow-Origin`, so a server-side 500 and a browser-side "CORS error"
**can** be one event. That remains a reason not to treat them as two separate faults. It is **not**
evidence about where execution reached.

**Nothing was added to find out.** No CP2Q logging, no transport change, no timeout change, no retry,
no validation bypass. The correlation key (`km_rid` on the query string, `rtrMarkEntry_` on the router)
already exists on both sides; reading it is CP2Q, which is out of scope for the approved budget.

### D-S8-B3-74 — The size budget moved by exactly what was granted, and the guards did not — **FROZEN (CP2S-R1)**

`SIZE_BUDGET` 4,600,000 → **4,610,000**, Owner-approved, covering exactly three things: the blank-date
skip, the WAREHOUSE historical-average chain, and the diagnostic-field propagation those need.

```
BUDGET (approved)       4,610,000
before this round       4,601,373
after                   4,604,127      headroom 5,873
```

**What did not change, deliberately.** The gate is still load-bearing in both directions (`C3b`:
headroom must be positive AND under 200,000). The three never-retired modules are still pinned by name
(`C3c`). The measurement is still committed/LF through the same instrument. And a new assertion pins
the raise itself: `C3b2` fails if `SIZE_BUDGET - 4600000 !== 10000`, so the number cannot be rounded up
later without a decision. **A raise that also relaxed the guards would not be a raise; it would be a
removal wearing one as a disguise.**

### D-S8-B3-75 — The warehouse lane carries ONE basis, and that is the point rather than a saving — **FROZEN (CP2S-R1)**

`horizonBasis` was built inline in the MARKETPLACE expander and nowhere else, which is why a
`self_fulfilled` site - routed to the WAREHOUSE lane, producing no marketplace line at all - published
no historical average and showed the same dash it shows for "no sales". A second inline copy would have
been the same defect with a longer fuse, so there is now **one builder**, `recoWsBasisOf_`, and both
lanes call it.

**Resolved once per site SKU, shared by every warehouse line.** Building it per warehouse is how a
reader starts believing the warehouses have different averages - the per-warehouse split and the
averaged average this round must not introduce. The suite pins that the resolver and the builder are
**absent from inside the per-warehouse loop**, with the loop slice bounded at both ends so the
post-loop attachment cannot be mistaken for one.

**Attached after the loop, to every line including the blocked ones.** A warehouse that failed to
normalize, a ruleset that would not assemble and a horizon that could not be built are reasons about
*that warehouse*; none is a reason to withhold the site SKU's sales history. Attaching inside the loop
would have meant five attachment points and four early returns that each had to remember.

**`horizonOpeningQty` and `qualifiedIncomingCount` stay null on a warehouse basis** - they are
per-warehouse horizon inputs, and per-warehouse numbers on a shared object is precisely how the
"different averages" misreading starts. The builder renders them `null`, never `0`.

**The resolver now runs for BOTH demand modes in that lane**, as it has in the marketplace lane since
CP2R. `whSalesRate` - the PLANNING input - is still assigned only under `sales_driven`, so no demand,
allocation, gap or inventory formula moved.

### D-S8-B3-76 — The async arrival writes two cells, not a table — **FROZEN (CP2S-R1)**

CP2S made the arrival repaint by calling `renderReplenishment()`, and accepted *"render was called
once"* as the acceptance. That proves the right numbers arrive and says nothing about what arriving
costs. `renderReplenishment` rebuilds the whole main table, and this runs on an async read that can
land seconds after the paint: **an expanded row collapses, its Execution Plan nodes are destroyed, a
half-typed input loses its value, focus moves to the body and the scroll position jumps.**

Only Avg Sales and Days of Supply depend on the basis. `_irRecoUpdateVelocityCells_` writes those two
cells per row and touches nothing else. The values still come from `getReplenishmentData()` - the same
producer `renderReplenishment` uses - so nothing is computed here that was not computed there.

**The acceptance is now what SURVIVES**, asserted over a hand-built DOM by **node identity**: the
Execution Plan node and the input are the *same objects* afterwards, the half-typed value is intact,
focus still points at a node that still exists, the scroll offsets are untouched, a neighbouring cell
is unchanged, and `renderReplenishment` is not called at all. A row absent from the current data keeps
what it had rather than being blanked, and a recovered cell loses its stale tooltip instead of keeping
an empty one.

**The stylesheet rotated with it** (`iravgquality-20261015` → `iravgcell-20261016`). The two cells need
stable hooks to be found, and a class the stylesheet never mentions is not a surface - the `.psb-state`
lesson - so `.replen-avg-cell` / `.replen-dos-cell` carry the rule a numeric column actually wants
(tabular figures, so the column does not shiver when a value updates). **Publication was checked against
the remote this round, not carried forward: `45be6010` is on `origin/main`, so the old token is spent.**

### D-S8-B3-77 — Four claims narrowed to what was actually searched — **FROZEN (FCB1-R1 doc freeze)**

The source contract is frozen at this round. No FC Builder feature was added, no BQ path, no API, no
cache. What changed is four claims that were **wider than their evidence**, and the pattern is the same
in all four: a search over this repository was written up as a fact about the world.

| claim as written | what was actually searched | corrected to |
|---|---|---|
| Walmart / Shopify / Target are **UNSUPPORTED** | four import configs, two readers, one option list — all in this repo | **no source identified here**; absence here proves this code cannot read one, not that none exists |
| BQ `Raw Daily Sales` is **the only** source that could satisfy the rule | the same files | the only one **among the sources this repository identifies** |
| the per-date key-count check proves the import **landed everything** | the function's own code | a **coverage** check: catches a short date; no key identities, no values |
| the 353 invalid date keys split is **UNKNOWN** | — | **ANSWERED: all 353 blank**, Owner-stated, scoped to that attachment (D-S8-B3-71) |

**The behaviour is identical under the narrower wording, and that is the reason to prefer it rather
than an argument against bothering.** "Unsupported" and "no source identified here" both produce a
named refusal. But they imply different next moves: the first tells the Owner to go build a feed, the
second tells them to go ask whether one already exists. **A document that is read for decisions has to
be right about which question is open**, not only about which output is correct.

**Added in the same pass, and it does change behaviour:** the confirmed-zero proof now needs a
**third** part — evidence that the scope+SKU was within that date's reporting coverage (D-S8-B3-72).
And `MISSING_OWNER_INPUT #3` now has three parts (a)/(b)/(c) rather than two.

**Also recorded:** the size budget is **4,610,000** (D-S8-B3-74) and the previous 4,600,000 is history
rather than a pending decision (D-S8-B3-66); 42_'s live deployment state stays **UNKNOWN** even after
a clean `system.health` probe, because 42_ publishes no build stamp and its change adds no action
(D-S8-B3-70).

**This freeze is documentation only.** No source file changed, no test was relaxed, and nothing here
means the IR mainline (S8 / CP2S-R1) has been accepted — that remains with the Owner.

### D-S8-B3-78 — The picker dropped every warehouse basis one call before the cell — **FIXED (CP2S-R2)**

CP2S-R1 reported that all four destination/demand combinations carry a historical average. It was proved at
TWO boundaries — the server's `recoWsBasisOf_` and the page's `_irRecoMapLine` — with a third between them
that no suite ran. `_irCanonicalSalesBasis_` accepted a line only when `destinationType === 'MARKETPLACE'`.

**That filter was true of the DATA until R1 and false afterwards.** A `self_fulfilled` site routes to the
WAREHOUSE lane and produces no marketplace line at all, so the rate was computed, serialized, mapped into
page state, and dropped one call before the cell.

**It was worse than a no-op.** `_irRecoHasCanonicalBasis_()` scans the same lines WITHOUT the destination
filter, so it answered true: the refresh fired, the in-place updater ran, and it repainted the cells with
the placeholder they already had. The gate and the picker disagreed about whether an answer existed and
nothing compared them — the new suite now asserts they agree.

**One site SKU, one history, and neither forbidden shortcut.** No sum and no average across warehouses: the
server resolves once per site SKU and shares one object, so agreement returns that one answer unchanged. A
genuine disagreement is NOT settled by taking the first line — first-in-array is sheet order wearing the
costume of a decision — it is published as `SALES_BASIS_LINE_CONFLICT` with no rate. An uninformative basis
(no rate AND no named error) is SKIPPED, because silence must not outrank a line that resolved. A rate of 0
is an ANSWER, so the test is `!= null` and never truthiness. The agreement test is inline because ten
harnesses slice this function out by name (the CP2P-R2 rule).

**Superseded, with reasons:** live9's A asserted "ignores WAREHOUSE lines" over a fixture that put 999 on a
warehouse line beside 139.08 on a marketplace one. That described the data, not a rule — 999 was a sentinel
for a field that was never populated. A response cannot carry both lanes for one SKU in any case (the
handler routes a SKU to exactly one expander), so two rates under one SKU is now a named conflict. What
that section protects — carry-not-recompute, and the scope guard — is asserted unchanged beside it.

### D-S8-B3-79 — The ruleset gate returned before the basis was attached, and the assertion that should have caught it passed — **FIXED (CP2S-R2)**

R1 attached the basis after the per-warehouse loop and wrote there that "a ruleset that would not assemble
... is not a reason to withhold the site SKU's sales history". **The gate returns sixty lines above that
attachment.** A site with no demand-allocation rule published no average at all. The comment described an
intent the code did not implement.

**And C6a is the reason to distrust the pair that was supposed to guard it.** It asserted the attachment
sits after the LAST `lines.push(` and called that "so no early return can miss it". Both it and C6 PASSED on
the broken build: the early return's push is textually earlier, so the ordering check was satisfied by the
very return that defeated it. **A statement about CONTROL FLOW was tested by comparing two string offsets.**

Now: the resolver runs above the gate and both exits go through one `whReturn_`, which is what makes a third
exit safe. The replacement assertion runs the real expander against a scope with no allocation rule.

### D-S8-B3-80 — Once counted, always reported — **FIXED (CP2S-R2)**

Five failure paths below the blank-date filter dropped `blankDateRows`: ambiguous channel, ambiguous
marketplace SKU, contamination unresolved, run-rate owner error, non-finite average. **null means "not
counted" and 0 means "counted none"; a failure that drops the number turns the first into the second.** The
two returns ABOVE the filter still carry nothing, because they genuinely never counted.

### D-S8-B3-81 — The in-place acceptance compared the harness to itself — **REPLACED (CP2S-R2)**

R1 accepted the two-cell update with a hand-built DOM in node, and that fixture tracked focus with a LOCAL
VARIABLE the code under test was never handed: `focused === T.panels['SKU-A'].input` **would have passed
against a function that cleared focus.** There was no `document.activeElement`, no layout, no scrolling,
because a fake object has none of them.

`_cp2s-r2-inplace-dom-runner.js` drives the real page in real Chrome and lets a SECOND real
`recommendation.workspace.get` land while a row is open and a field half-typed. Avg **7.0 -> 11.0**, DoS
**155.6 -> 99**, while `document.activeElement` is still the same marked node, the half-typed `1234` is
intact, the expanded card is the same node, both scroll offsets are unchanged, and `renderReplenishment` was
called **zero** times. Both halves are required: a table that never updates preserves everything.

**Two checks the PAGE makes impossible are recorded as NOT_MEASURABLE with their reasons, not scored as
passes** — caret position (the only editable field in the open panel is `<input type=number>`, which exposes
no `selectionStart` in Chrome) and window scroll (the window does not scroll). The first version of the
runner scored both as passing, by comparing null to null and 0 to 0.

### D-S8-B3-82 — C9: the four points are separated; the first-frame work is NOT removed — **PARTIAL (CP2S-R2)**

**Done:** `_cp2s-r2-c9-frame-runner.js` measures outline-visible, each fill callback by name, chart/layout
and full-ready as four separate points, in one run so a first-frame win paid for out of full-ready cannot be
reported as a win. CP2R's `ms_click_to_paint` blended the first three.

**The inventory, which is the point of separating them:** 2-3 FULL row assemblies run before the panel has a
layout box — 37-60 ms of the 39-76 ms wait. **No fill callback runs before the outline**, so the fills were
never the first-frame cost. Two of those assemblies are inside ONE synchronous render pass, which the
CP2P-R2 scope should collapse; the pass is invalidated mid-handler because `exposureEntry` / `exposureState`
move while the handler runs.

**NOT done, and not claimed:** the removal. One hypothesis was tried and REVERTED — asking for the second
layer before the rows are built, so the handler would not invalidate its own pass, did **not** reduce the
assemblies (still 2, 41.8-43.9 ms) and did not improve the outline. A change that does not produce the
effect it was made for is not a fix even when it is harmless.

**Also not claimed: the chart cost.** The harness serves a `Chart` stub, so point 3 locates charts in time
and does not price them.

**The expand delay is not fixed**, and nothing in this round should be read as saying it is.

### D-S8-B3-83 — Two measuring instruments that measured themselves — **CORRECTED (CP2S-R2)**

Recorded because both produced confident, wrong numbers that looked fine:

- **`--virtual-time-budget` zeroed every duration.** The flag runs timers on a virtual clock that
  `performance.now()` also reports, so the thing being measured and the ruler moved together and the first
  C9 run reported 0 ms for every callback. Removed; real wall clock.
- **The first in-place runner found the PREVIOUS panel.** Every expand reported "outline visible: 0 ms"
  because the frame search started while the last panel was still on screen. A zero from measuring the
  wrong element is worse than no number. The runner now proves the panel is absent before the click, and
  proves a scroll container by moving it and reading it back rather than trusting `scrollHeight`.

### D-S8-B3-84 — A cached answer outlived the shape it was stored for — **FIXED (CP2T P0, Owner-approved)**

The live report after the 42_ sync was `unavailable` on some rows and `--` on others. Two symptoms in one
column is the shape of two causes, and **one stale cache record produces both**.

The recommendation session cache stored a successful envelope under a SCOPE-ONLY key with **no marker of
the response shape it was built from**, and `loadRecommendationWorkspace_` consults it BEFORE issuing a
request. sessionStorage survives a reload, so a tab opened before the sync kept being served its PRE-SYNC
envelope with zero HTTP:

| what the stale record holds | what the column shows |
|---|---|
| pre-CP2S-R1 WAREHOUSE lines — no `horizonBasis` at all | the picker finds nothing — **`--`** |
| bases that are named quality errors | **`unavailable`** |

**In that state the new deployment is never asked**, so no amount of correct server behaviour can reach
the screen — and the symptom looks exactly like a mis-configured source.

**The shape is NAMED, not sniffed.** Inspecting a record to guess whether it looks new enough would pass
any future shape that happens to resemble this one. A record declares the shape it was written for, and a
record that does not declare THIS one is not read. The storage key moves with the shape, and the
superseded key is removed rather than left in the operator's session.

**Strictly inside the approval:** no new cache, no second store, no longer retention, no change to WHAT is
cached (a success, including a valid zero and a named quality error), to the key's scope, to the F1A
stale-RESPONSE guard, or to any read policy, formula, loader, transport or timeout.

### D-S8-B3-85 — The page knew which answer it was showing and never said — **FIXED (CP2T P0)**

`_irRecoState.fromCache` has been set on the restore path since FM3a and **read nowhere**. So "the operator
is looking at a result stored before the sync" and "the new deployment answered this" were
indistinguishable from outside — including from a screenshot, which is what a live report arrives as.

`_irRecoAnswerSource_()` reports `SESSION_CACHE` / `SERVER` / `NONE` with the requestId, calculation month,
planning cycle and `sourceDataAsOf` **already on the state**. Nothing is computed. A restored answer
reports the requestId of the response that was STORED, which is the identifier that correlates with the
server log of that earlier request.

**This is a prerequisite for diagnosing the column, not a fix for it.** Clearing a cache is not a diagnosis
and must never be reported as one (approval item 5).

### D-S8-B3-86 — Every way the column can refuse, tied to the words it refuses with — **RECORDED (CP2T P0)**

Run through the whole chain — real row reader, real resolver, real frozen KMCALC owner, real basis
builder, real page mapping, real picker, real cell — over a fixture using the destination sheet's own
column names and **every date representation the shipped normaliser accepts** (Date object, `YYYY-MM-DD`,
`YYYY/MM/DD`, `M/D/YYYY`) plus the blank one the attachment contained:

| condition | code on the row | cell |
|---|---|---|
| no daily and no weekly rows | `SALES_BASIS_UNAVAILABLE` | unavailable |
| two `marketplace_sku_id` for one scope+SKU | `MARKETPLACE_SKU_AMBIGUOUS` | unavailable |
| two channels in the scoped rows | `SALES_BASIS_AMBIGUOUS` | unavailable |
| a campaign line with no `marketplace_sku_id` **— or a campaign / event date the owner cannot read (CP2T-R1)** | `SALES_BASIS_CONTAMINATION_UNRESOLVED` | unavailable |
| no calculation date | `CALCULATION_DATE_NOT_CONFIGURED` | unavailable, `blankDateRows` null |
| a line carrying NO `horizonBasis` | — none — | **`--`** |

**The two dashes are different**, and that decides where to look: a dash with no reason is an answer that
was never published (pre-sync envelope, or a lane that published nothing); a dash beside `unavailable`
is a published refusal that names itself.

**And none of the shortcuts is present:** an unresolved campaign identity does not fall back to an
un-excluded rate, no history does not become 0 (while a REPORTED zero still prints `0.0`), an ambiguous
channel is not averaged across, and the weekly rung is always marked `insufficient_normal_days`.

**Also corrected in 42_:** the resolver's header comment ended "a contamination identity conflict degrades
to an un-excluded basis — never a block". That stopped being true in CP2R-R1, which made it fail CLOSED.
**A comment that denies a reason the code returns is read by whoever is trying to find out why a row
refused**, which is this round exactly.

> **CORRECTED BY CP2T-R1.** This entry read `SALES_BASIS_CONTAMINATION_UNRESOLVED` as an identity failure,
> because that was the cause it had reproduced. It is also what a campaign or event whose START / END DATE
> the owner cannot parse produces — the catch in 42_ discriminates on the owner's error LABEL
> (`campaigns[i]` / `events[i]`), and BOTH throws carry it. The code alone does not separate them; the
> DETAIL does. See D-S8-B3-90. The page's hover text, which said the same thing to the operator, is
> corrected too.

### D-S8-B3-87 — r59, because r58 is published now — **FROZEN (CP2T)**

`origin/main` is `37d9db8c` and `ab624f30` is an ancestor of it, **checked against the remote this round**
rather than carried forward. R58 is spent, so the page change this round owes its own token:
`r59-cacheshape-20261017`, 54 references in `index.html` and 13 in `app.js`.

The reason it must rotate is the round's own subject: a browser holding the previous page beside the new
storage key would be the stale-answer defect reintroduced by the cache that serves the page itself.

### D-S8-B3-88 — The prevMonth builder, operated rather than inspected — **VERIFIED (CP2T P1)**

Target 2027 / January derives Based **2026 / December**; both Based fields are user-agent locked; Preview
is withdrawn and Save re-disabled when Target changes; **Apply Growth Rate keeps its own Base editable**.

**Two instrument errors found on the way, and both would have produced a confident wrong answer:**

- **The builder is not reached by calling its opener.** `openRegularUpdateModal()` REFUSES when the
  prerequisites are not loaded and re-opens the mode-select modal. The first run called it directly and
  reported "modal not visible" — which reads as a page defect and is a harness defect. The operator's
  route is the button, the card and Next, which loads the prerequisites first.
- **A programmatic assignment is not editing.** The first lock check set `el.value` and concluded the field
  was editable when it stuck. `readonly` and `disabled` restrain the USER AGENT, not a script, so **that
  check would have failed against a perfectly locked field**. What the browser enforces is checked
  instead: a disabled control cannot take focus (observed refused), and the readonly input is reported as
  readOnly plus off the tab order — with the keystroke half stated as NOT tested rather than implied.

**And the defence that holds when the lock does not:** with Based FORCED to 1999 / June by script, Preview
still computed for **Jan 2027**. The lock stops the operator; deriving the period from Target is what stops
everything else, and that is what FCB1 actually repaired.

### D-S8-B3-89 — C9 with a real Chart is NOT done — **OPEN (CP2T P2)**

P2 asks for the first-frame work to be measured against a REAL Chart build, with layout box and actually-
visible recorded separately. **Neither is delivered this round.** No Chart.js is vendored — the page loads
it from a CDN and every runner in this repo substitutes a stub, so point 3 of the C9 capture locates charts
in time and does not price them (D-S8-B3-82, unchanged). Separating "has a layout box" from "is actually
visible" needs a signal the current capture does not take.

**What it would need, named rather than guessed at:** a real Chart build available to an offline run, and a
visibility signal beyond a bounding box. Neither was started, and **the expand delay remains unfixed**.
Data correctness was the stated priority and is where this round went.

### D-S8-B3-90 — A Sheet date CELL was reported as an identity failure — **FIXED (CP2T-R1 P0)**

`recoWsResolveSalesRate_` normalises `snapshot_date` through a `toYmd` CLOSURE. `recoWsBuildContaminationFacts_`
— a **different function**, which cannot see that closure — marshalled `campaigns.start_date`,
`campaigns.end_date`, `fc_special_events.event_start_date` and `fc_special_events.event_end_date` through
`recoWsStr_`, which is `String().trim()` and nothing else.

A Google Sheets date cell arrives in Apps Script as a **JS Date OBJECT**. `String(Date)` is
`"Mon Sep 28 2026 00:00:00 GMT+0800 (Taipei Standard Time)"`. The frozen owner demands strict `YYYY-MM-DD`
and throws; the throw is labelled `campaigns[0].start`; 42_'s catch matches `/campaigns\[/` and returns
`SALES_BASIS_CONTAMINATION_UNRESOLVED`, which CP2R-R1 made fail CLOSED. **So the cell printed `unavailable`
and its hover text blamed an unmatched campaign line for a date-format problem.**

| campaign / event start+end written as | before | after |
|---|---|---|
| Date object (what `getValues()` returns) | refused | resolves |
| `YYYY-MM-DD` | resolved | resolves |
| `YYYY/MM/DD` | refused | resolves |
| `M/D/YYYY` | refused | resolves |

**The coercion is the one that already existed**, moved to `recoWsYmd_` at module scope so both callers read
the same one; `toYmd` delegates to it and both resolver branches read unchanged. **LOCAL CALENDAR
COMPONENTS, never `toISOString()`** — in Asia/Taipei a Date at local midnight is 16:00 of the PREVIOUS day in
UTC, so an ISO slice moves a campaign off its own day. That is asserted from a child process pinned to
`TZ=Asia/Taipei`, which first shows the trap is live there (`toISOString().slice(0,10)` on local midnight
2026-09-05 reports the 4th) and then that the shipped answer reports the 5th.

**Nothing was bought with the number.** The exclusion still happens: 27 normal days at 10 units beside 3
campaign days at 100 resolve to **10.0**, and the control with no campaign resolves to **19.0**, so a repair
that dropped the campaign would be visible. An unreadable date (`'next Tuesday'`, blank, `2026-09-31`, an
Invalid Date object) still refuses BY NAME and still publishes no rate; the campaign is still PASSED to the
owner rather than filtered out; and a FUTURE campaign is still passed for the **owner** to clip to the window
(this layer owns no window and must not start filtering by date). Frozen KMCALC untouched, no validation
loosened, company and site isolation unchanged.

**Executed, not inspected:** `campaign-event-date-passing-s8-b3-r3-cp2t-r1.test.js` — **46 passed / 51 failed
before the repair, 97 / 0 after**, over reader — marshaller — frozen owner — basis — mapping — picker — cell.

### D-S8-B3-91 — A matching SHAPE is not a compatible COMPUTATION — **FIXED (CP2T-R1 P0)**

CP2T stamped the response SHAPE on every cache record so a build could not read an envelope it did not
understand (D-S8-B3-84). **A record written by the handler that String()-ed the campaign dates has exactly
the shape this build reads** — `horizonBasis` present, every field in place — and the wrong values inside
it: a named refusal where there is a real history. A shape check cannot see that, and **a record that is
merely WRONG is more dangerous than one that is unreadable, because it renders.**

So compatibility is now declared on the computation as well, reusing the marker that already exists:
`RECO_WS_HANDLER_VERSION_` (42_), stamped on every envelope as `meta.recommendationWorkspaceHandlerVersion`,
bumped `fm5-r4ui-r5c` —> `fm5-r4ui-r5d`. The page names the versions whose output it will cache
(`_IR_RECO_CACHE_HANDLERS`). An answer from any other version is **still DISPLAYED** when the server sends it
live — it is the current truth, and hiding it would make an unsynced deployment look like an empty one — but
it is never stored, and a stored one is dropped on the way past. The acceptance is a **named list, not a
comparison**, so a version this build has never heard of is refused rather than assumed compatible, however
new it looks.

`_irRecoAnswerSource_()` now reports `handlerVersion` and `handlerAccepted` beside the cache / server source,
so one console line says **which deployed handler computed the answer on screen**. `handlerVersion: null` on a
loaded result is itself the answer: a deployment older than the marker.

**NOT added:** a second cache, another store, a longer retention, a TTL, polling, an automatic retry, or any
change to WHAT is cached, to the key's scope, to the F1A stale-RESPONSE guard, or to any read policy,
formula, loader, transport or timeout. `reco-session-cache-compat` 23 —>  **36 passed / 0 failed**.

**And the two handler markers are no longer one constant.** The probe suite tied 42_ and 43_ to a single
`VER`, which said they move together. They are deployed and change independently — this round repaired 42_
only — so the suite now carries `VER_WS` and `VER_GAP`, and marching 43_ to r5d would have stamped a change
onto a file that did not change. It also now checks that the PAGE accepts exactly the version the server
stamps: accepting one the server never sends means the cache can never hit, and accepting one it no longer
sends means serving a pre-repair answer.

### D-S8-B3-92 — "No rows" is FOUR facts, and the fourth prints a number — **RECORDED (CP2T-R1 P1)**

A CA row still refuses after the date repair, and the question asked of it was which of four things
happened. All of them read `no daily or weekly rows @ CA/Amazon`, which names the symptom and no cause.

| what happened | how it now reads | the repair it needs |
|---|---|---|
| the table was never in the read | `daily ABSENT, 0 rows, 0 for this SKU` | the read scope, not the data |
| read, nothing for this SKU anywhere | `daily PRESENT, 30 rows, 0 for this SKU` | the only one that means what the dash looks like |
| rows for this SKU, none for this site | `daily PRESENT, 30 rows, 30 for this SKU` | a MAPPING repair (country / marketplace / channel) |
| matched, dated, outside the window | **never reaches a refusal at all** | see below |

**THE FOURTH IS NOT AMONG THE REFUSALS.** Rows that match the scope but fall outside the 90-day window pass
to the frozen owner, which samples none of them, counts **zero** normal days and drops to the weekly rung.
Whether that publishes a rate depends on whether a weekly source can be read: with one, the weekly rate
divided by seven, `normalDayCount: 0` and `source: 'weekly_7d'`; **without one it must refuse** (D-S8-B3-95).

> **CORRECTED BY CP2T-R2.** This entry said the no-weekly case "publishes a RATE: `0.0`" and treated that as
> the behaviour to look for. It was the defect written down as the design — `0.0` there was divided out of a
> weekly total that had never been read. The acceptance suite asserted it too, and **a suite that accepts a
> defect protects it**; it protected this one for exactly one round. See D-S8-B3-95.

**The planning model is not one of the four.** A `forecast_driven` SKU has a real historical average and
publishes it (CP2S-R1); the model selects which HORIZON formula consumes the rate, not whether the site has
a sales history. "It is forecast_driven" is the explanation that most invites itself here, and it explains
nothing. Pinned for both models, and for a SKU with no `marketplace_skus` row at all (which resolves to the
documented DB default, not to a blocked line).

Diagnostics only: the reason code, `blankDateRows` and every published value are unchanged.
`avg-sales-no-rows-census-s8-b3-r3-cp2t-r1.test.js` — **36 / 7 before, 43 / 0 after**.

**STILL OPEN:** which of these the live CA row actually is. This round makes the four separable and prints
the census in the refusal detail; which one it prints for that row is read off the live response.

### D-S8-B3-93 — r59 is CARRIED, not rotated — **FROZEN (CP2T-R1)**

`origin/main` is `37d9db8c`; `b382644d`, which introduced `r59-cacheshape-20261017`, is **not an ancestor of
it**, checked against the remote this round rather than carried forward. **r59 has never been served**, so
the iteration on top of it reuses it: a token that no browser has ever received cannot be holding a stale
page anywhere. `index.html` and `app.js` are therefore **untouched this round**.

Which is also why the capture estate barely moved. The delta is two files; 42_ is pinned by no capture;
`inventory-replenishment.js` is pinned by many, but only **three** batches have an acceptance suite that
enforces its hash (`cp2r-reveal-scope`, `cp2s-r2-inplace`, `cp2s-r2-c9`) — each failing on exactly that one
assertion and nothing else. The five cascade captures pin `index.html`, which did not move, so they are
**not** re-taken. Deriving the set from what each capture hashes AND which arm an enforcing suite compares
against current source is what keeps a re-capture from becoming a re-run of everything.

### D-S8-B3-94 — C9 with a real Chart is still NOT done — **OPEN (carried from D-S8-B3-89)**

Unchanged by this round and not claimed. No Chart.js is vendored, "has a layout box" is still not separated
from "is actually visible", and **the expand delay remains unfixed**. Data correctness was the stated
priority for CP2T-R1 as it was for CP2T, and is where both rounds went.

### D-S8-B3-95 — A missing weekly source is not a week in which nothing sold — **FIXED (CP2T-R2 P0)**

The frozen ladder is "3 or more normal days —> normalized_30d, else weekly_7d — 7". 42_ initialises `weekly7d`
to **0** and leaves it there whenever the weekly cell cannot be read, so below three normal days the owner
divided a total that was never observed and the column printed a confident **`0.0`**.

| what the weekly source actually was | what `weekly7d` became | what the column printed |
|---|---|---|
| table absent from the read | 0 | `0.0` |
| no row for the resolved channel / SKU / country | 0 | `0.0` |
| row present, `sales_units_7d` **blank** | 0 (`recoWsNum_` —> null) | `0.0` |
| `null`, non-numeric, `Infinity` | 0 | `0.0` |
| **negative** — a data error, not an observation | 0 (clamped) | `0.0` |
| EU: no eligible member week at all | 0 (a sum over nothing) | `0.0` |
| **explicit `0`** — a real reported week | 0 | `0.0` **(legitimate)** |

**A fabricated zero is the worst answer available here.** It is indistinguishable from a real "nothing sold",
it feeds Days of Supply as **infinite cover**, and it silently reports that the site needs no replenishment.
The last row of that table is why `weekly7d` alone cannot carry the distinction: **0 is both the reading and
the absence of one.**

**So availability is recorded WHERE THE CELL IS READ** (`weeklyOk`, set only for a finite non-negative value),
and the refusal keys on **the rung the owner actually selected** (`res.source === 'weekly_7d'`), never on a
day count re-derived here. Consequences, each pinned:

- an **explicit 0** still resolves on the weekly rung with the unchanged `insufficient_normal_days` warning;
- a site with **enough normal days** is never refused for a fallback it does not use (3 is still the frozen
  threshold, and 3 days still carries `low_sample_warning`);
- a **confirmed zero** day count still publishes `0` on `normalized_30d`;
- a **blank latest week is not rescued by an older readable one** — reaching back a week would be a second
  window policy invented at this layer;
- EU refuses with **no usable member week**, while **one** member reporting an explicit 0 resolves, and a
  readable member beside an unreadable one sums the readable one only. **No per-member coverage threshold,
  freshness rule or TTL was introduced** — one usable member is what the frozen roll-up already accepted;
- the **more specific reasons still win**: an unreadable campaign date or an untieable campaign line keeps
  `SALES_BASIS_CONTAMINATION_UNRESOLVED`, an ambiguous channel keeps its own, and a scope with no rows at all
  keeps `SALES_BASIS_UNAVAILABLE`. The new code is for **a rung that was reached and found empty**.

New reason `SALES_BASIS_WEEKLY_UNAVAILABLE`, with operator-facing words rather than a bare token. Frozen
KMCALC, its ladder, its window, its division and its latest-week pick are all untouched; no formula and no
schema changed. **`weekly-fallback-source-s8-b3-r3-cp2t-r2.test.js` — 51 passed / 47 failed before the
repair, 98 / 0 after**, over both planning models, both lanes and the full cell chain. The cell now refuses
instead of printing `0.0`, and **Days of Supply refuses with it**.

### D-S8-B3-96 — r5e, and the cache case a shape check cannot see — **FROZEN (CP2T-R2)**

`RECO_WS_HANDLER_VERSION_` moves `fm5-r4ui-r5d` —> **`fm5-r4ui-r5e`**, and the page's accept list with it.
The superseded list now has **two** entries and they fail differently:

| version | what its stored answers hold |
|---|---|
| `fm5-r4ui-r5c` | campaign / event date cells mis-read — a refusal where there is a real history |
| `fm5-r4ui-r5d` | **readable, correctly shaped, and carrying a fabricated `0`** |

**r5d is the sharper case for this whole guard.** An r5d record has exactly the shape this build reads and
values that pass every structural check; only the computation version distinguishes its `0` from a real
reported zero. That is the argument for an allow-list on the computation, made concrete.

### D-S8-B3-97 — r59 carried a second time, re-checked again — **FROZEN (CP2T-R2)**

`origin/main` is `37d9db8c` and `b382644d`, which introduced `r59-cacheshape-20261017`, is still not an
ancestor of it. **r59 has never been served**, so it is carried rather than succeeded, and `index.html` and
`app.js` are untouched for a second round. The check was re-run against the remote; the note in
`_release-order.js` is not the evidence and never becomes it.

The Owner has since reported that **main `37d9db8c` is published, 42_ is synced and the deployment updated**
— so the live handler is the `fm5-r4ui-r5c` that ships at that commit, and the live `index.html` carries
**r58**. Neither r5d nor r5e has ever run in Production.

### D-S8-B3-98 — The MARKETPLACE lane withholds the basis on an inactive destination — **RECORDED, NOT FIXED**

Found while repairing this round's own fixture, and recorded because it is the same shape as a defect this
branch has already fixed once. `recoWsExpandMarketplace_` blocks on `MARKETPLACE_DESTINATION_INACTIVE`
**before the basis is attached**, so the line carries no `horizonBasis` at all and the cell prints the bare
dash — even for a site with 30 days of readable history. CP2S-R1/R2 repaired exactly this for the WAREHOUSE
lane, where a missing demand-allocation rule withheld the site SKU's sales history (D-S8-B3-79).

**Not repaired this round**, which was scoped to the weekly fallback source. Pinned as an executed
observation in `weekly-fallback-source-s8-b3-r3-cp2t-r2.test.js` §K4 so it cannot quietly become normal.

### D-S8-B3-99 — A failed read and an empty answer printed the same dash — **FIXED (CP2U-R1, page only)**

Two columns, the same shape of defect, and in both the state that needed an operator was the least visible.

**AVG SALES HAD ONE SYMBOL FOR FIVE FACTS.** `_irCanonicalSalesBasis_` returns `null` for each of them, and
`null` is a perfectly good answer to "what is the rate" — it is not an answer to "why is there no number":

| what actually happened | what the cell printed |
|---|---|
| the read is still in flight | `--` |
| the read **FAILED** (thrown, or answered `success:false`) | `--` |
| the result belongs to a site no longer displayed | `--` |
| the scope resolved with no line for this SKU | `--` |
| a line exists carrying **no basis at all** (D-S8-B3-98) | `--` |
| a NAMED quality refusal | `--` **plus the words**, which already worked |

The dash was already taken: a refusal prints it too. So "retry", "wait" and "chase the data" were one glyph.

**SUGGESTED QTY HAD TWO SYMBOLS AND STILL NOT ENOUGH.** `READ_ERROR`, a read that succeeded over zero rows, a
READY answer with no row for this SKU, and a row the calculation **BLOCKED** all returned `{ state: 'NONE' }`
— so a transport fault was indistinguishable from a business answer.

**THE ATTRIBUTION CP2U GAVE WAS WRONG, AND IS CORRECTED HERE.** CP2U reported that `_irRecoBlank` leaves
`scope` null during LOADING and that this was the cause. It is not. The LOADING assignment overwrites it on
the very next line, stamping both `scope` and `appliedScopeKey` at issue time, so **a LOADING state carries
its requested scope and satisfies the scope guard**; what is empty is `linesBySku`. The two failure arms are
not alike either — a read the server ANSWERED with `success:false` goes through `_irRecoApplyEnvelope` and
is given a scope, while a THROWN read keeps the blank and is not. **A `scope === null` test would therefore
have classified one of those as the other.** So `_irAvgSalesCellState_` reads `status` directly and asks the
scope guard by name, and section A of the suite pins the actual state objects rather than restating this.

**WHAT CHANGED, ALL PAGE-SIDE.** `_irAvgSalesCellState_` (new) returns
`READY | PENDING | READ_FAILED | REFUSED | NONE | DISABLED` with a specific reason; `IR_AVG_STATE_TEXT` gives
each one operator-facing words; a PENDING cell prints `…` instead of borrowing the dash, and Days of Supply
waits with it; a FAILED read takes the error class and the words **read failed**, never `unavailable`, which
is reserved for a refusal. `_irSuggestedQtyState_` keeps `state: 'NONE'` — it is still the right answer to
"is there a number", and consumers are written against it — and carries `reason` plus `detail`/`note`.

**THE RENDERING-COST GUARD AND THE SLICE RULE, both of which bit once already.** The projection already
resolves the basis, so the authority accepts it as a parameter rather than resolving it a second time per row.
And the call is `typeof`-guarded exactly as the picker beside it is: the seven older avg-sales suites slice
that block into a `new Function` binding the picker alone, so an unguarded call would have thrown in every one
of them — the same harness defect CP2T-R1 shipped and had to repair. Unbound, the block behaves exactly as it
did before this round, which is why **none of those suites changed**. For the same reason
`_irRecommendationWorkspaceEnabled` is typeof-guarded: the new authority sits inside the `__IRRECO__`
extraction region and that predicate is declared outside it (CP2P-R2 rule).

**NOT STYLED, AND RECORDED AS SUCH.** `replen-suggested-cell__value--read-failed` has no CSS rule — and
neither do the `--none` and `--pending` modifiers beside it. It follows the convention already in the file;
what the operator reads is the glyph and the title. Styling those four states is a UI question and is deferred
rather than answered halfway. **No stylesheet changed, so the CSS token does not move.**

`read-state-distinction-s8-b3-r3-cp2u-r1.test.js` — **6 passed / 1 failed then a hard `ReferenceError` at B1
before the repair** (the authority did not exist), **155 / 0 after**, over every state transition, both
columns, cross-site, late responses, and the title escaping. **GS delta: 0 bytes** — `assets/js/pages` is not
on the Apps Script load surface.

### D-S8-B3-100 — The three reads were one stage, and a sum was named like a clock — **FIXED (CP2U-R1)**

`IR_READ_STAGES_` merged `recommendation.workspace.get`, `inventoryReplenishmentGap.get` and
`gapJob.status.get` into a single `recommendation_read` stage, so **separating the reads was impossible by
construction**. And `_irReadStageReport_` reported
`client_total_elapsed_ms = Σ sample.ms` — a sum over intervals that **overlap by construction**, because
`_irRecoTrigger` fires `loadInventoryGap_()` and `loadRecommendationWorkspace_()` back to back and awaits
neither. It sat directly beside `page_boot_elapsed_ms`, which IS a wall clock, so subtracting one from the
other invented a gap that never existed.

**NOTHING NEW WAS INSTRUMENTED.** `window.KM.transport.timeline()` has recorded `dispatch_ms`, `settled_ms`,
`elapsed_ms`, `server_ms`, `concurrent_at_dispatch`, `overlapped_with`, `code`, `phase`, `request_id`,
`attempts` and `marks_source` for every request all along, and computes overlap from the recorded intervals
rather than guessing. The page simply never asked. `_irReadTimingReport_()` (new, read-only) asks, and keeps
four rules: **server_ms is reported or NULL, never derived** from a client duration; **marks_source travels
with every row**, so an `EXTERNAL_RECONSTRUCTED` interval cannot pass as a measured one and the whole report
downgrades its own classification when one is present; `observed_span_ms` **declares that it is derived**;
and a read that never dispatched is `not_observed`, **not a duration of zero**.

The stage map now has `recommendation_read` (the recommendation read only), `materialized_gap_read` and
`gap_job_status`. `client_total_elapsed_ms` is **kept** — a pinned contract and its callers read it, and
renaming it would have been a second defect in place of the first — beside `client_elapsed_sum_ms`,
`client_elapsed_sum_is_not_wall_clock` and `wall_clock_basis`, which say what it is.

Over a timeline where two reads provably overlap, the suite shows a **sum of 5,390 ms against a span of
4,000 ms**: the arithmetic proof that the sum was never elapsed time.

### D-S8-B3-101 — calculationDate was served and discarded; the Gap read had no probe — **FIXED (CP2U-R1)**

42_ reads `RECOMMENDATION_CALCULATION_DATE` from Script Properties under a strict `yyyy-MM-dd` guard **with no
clock fallback**, and stamps it on `meta.calculationDate` of every successful response beside the month and the
cycle. `_irRecoApplyEnvelope` kept the month and the cycle and **dropped the date** — the one field that
places the 90-day window — so the only way to obtain it was to open Properties, a write-capable surface, to
answer a read-only question. It is now kept and reported by `_irRecoAnswerSource_`. **No Property was read,
written or probed by this round.**

`window._irMatAnswerSource_()` (new) is the materialized Gap counterpart to the recommendation probe that has
existed since CP2T. It reports scope, status, error, row count and, for the SKUs under investigation
(`CO1200-B`, `CO1200-O`, `CO1200-WR` by default), the six stored fields — `calculation_status`, `note`,
`calculation_date`, `calculated_at`, `d90_gap_qty`, `d90_suggested_qty` — which previously required
`IR_DEBUG_DIAGNOSTICS` **and** an expand, and whose `note` the normal card replaces with generic wording. It
also reports what the CELL does with each row, from the cell own authority, so probe and screen cannot
disagree about which is right.

**AND THE PROCEDURE CP2U PROPOSED IS WITHDRAWN.** That report offered a console one-liner calling
`getWorkspace('recommendation', { pagination: { size: 1 } })` to read the calculation date out of a live
response. **`size` is a PAGINATION bound, not a work bound** — the handler still expands destinations and
loops SKUs before anything is paginated, so `size: 1` buys a smaller payload at close to full server cost, on
a page whose read cost is the subject of the investigation. A diagnostic that spends the thing it is measuring
is not a diagnostic. The date is kept from the response the page **already** received instead, and nothing is
re-requested.

**IT ISSUES NO REQUEST, and says so.** `issued_request: false`, and `reflects` states that this is the
response already applied — not a fresh read and not a freshness claim. A probe that re-read to answer would
add a request to the page whose read cost is the thing under investigation.

**42_ AND 43_ VERSION INDEPENDENTLY.** The gap read now carries `gapMaterializationHandlerVersion` from 43_,
reported alone and deliberately **not** checked against the 42_ recommendation accept list. The two markers
currently read `fm5-r4ui-r5c` and `fm5-r4ui-r5e`: they look like one series and are two, and the 42_ list
genuinely does not accept `r5c`, so conflating them would have inverted the answer.

### D-S8-B3-102 — r59 has shipped, so the carry ends — **FROZEN (CP2U-R1)**

`origin/main` is `1778efc3` and `b382644d`, which introduced `r59-cacheshape-20261017`, **IS** an ancestor of
it. r59 has been served and **may never be reused**. It was carried through two rounds on the strength of the
same check that now says the opposite, which is exactly why the check is re-run every round instead of read
off `_release-order.js`.

`inventory-replenishment.js` changes this round and `app.js` pins it with the shipped r59 query string, so a
browser holding the published copy would keep serving the OLD file — which here would mean the two cells
keep printing the single dash this round exists to split while every new diagnostic reports the new
behaviour. **The whole co-deployed set rotates onto `r60-readstate-20261016`**: 54 entries in `index.html` and
13 in `app.js`, because a half-rotated set is strictly worse than an unrotated one.

**CORRECTED IN PLACE:** the CP2T-R2 note in `_release-order.js` had been applied **twice, word for word**,
each copy announcing the same second re-check. Two identical records are not two checks; one copy is kept.

### D-S8-B3-103 — What CP2U-R1 does NOT claim — **RECORDED**

This round changes **what the page can say about a read it already made**. It changes nothing about what is
read, when, from where, or how long it takes.

- **The EU root cause is NOT fixed.** `EU_SALES_SOURCE_` still resolves `IT+DE+ES+FR` and was not touched. The
  asymmetry CP2U found — the member-row filter canonicalises `country` through KMCID and compares
  `marketplace` as a raw string — is **unchanged**, and remains diagnosable only through the CP2T-R1 census
  detail. What this round adds is that an EU scope still LOADING no longer looks like one with no source.
- **No read got faster.** No request was added, removed, reordered or retimed.
- **No data is more current.** The Gap probe reports the response already applied; `calculated_at` is when the
  batch computed the row, and nothing here recomputes anything.
- **D-S8-B3-98 is still OPEN.** Section B5 makes the withheld basis VISIBLE as `BASIS_WITHHELD` instead of a
  bare dash. Naming a defect is not repairing it.
- Also still open and untouched: the **C9 expand delay**, the **Gap timeout diagnostic**, and the **FC
  historical-sales features**.

### D-S8-B3-104 — The invalidated capture set, DERIVED rather than listed — **RECORDED (CP2U-R1)**

Many batches PIN a file; far fewer ENFORCE it. The authoritative question is which arm of which acceptance
suite compares a stored hash against CURRENT source, and the only way to answer it is to RUN the
capture-consuming suites. Thirteen evidence directories pin one of the three files this round changed; **nine
batches actually refused**, in two distinct groups.

**From the page edit (3):** `cp2s-r2-inplace`, `cp2s-r2-c9`, `cp2r-reveal-scope`. The CP2P batches pin the
page file too but assert `!==` — they are historical arms that MUST differ — so the edit moved them further
from, not toward, failing.

**From the token rotation (6):** `cp2m-r2-map`, `cp2m-r2-perf`, `cp2m-r4r1-map`, `cp2m-r4r2-mount`,
`cp2t-fc-prevmonth`, `cp2m-r2-viewport`. None of these has anything to do with Avg Sales; they pin `index.html` and `app.js`,
which a token rotation edits by definition. **This is the same churn CP2T paid once already** and it is the
price of a token rotation, not a surprise.

**One assertion was re-measured instead of re-captured.** `navigation-performance-observation` §G2 compares a
live byte total against `boot-census.json`, and it was off by exactly **13 bytes**: `r59-cacheshape-20261017`
is 23 characters, `r60-readstate-20261016` is 22, and `app.js` carries 13 of them. That field is computed from
`index.html` and the files on disk, so it was RE-MEASURED locally rather than re-captured in a browser, with
the arithmetic recorded in the census note. `inventory-replenishment.js` is router-loaded and is not a boot
script, so `pageScriptBytes` is unchanged — which is why a 21 KB page growth moved this number by minus 13.

**THREE PROCESS FAILURES OF MINE ARE RECORDED, because each one changes how the next round should work:**

1. **A timing batch was contaminated by my own concurrent work.** The first CP2R batch ran while I was
   executing other node processes against this repo. `assembly after handler` still came back 6 of 6 at
   −60.4 ms, but `click → full ready` came back **5 of 6** with three outliers — 2 746 ms in one SCOPED run
   against 87–90 ms in five others, and 1 385 and 490 ms in two UNSCOPED runs. **Outliers in BOTH arms cannot
   be an effect of the round under test.** The batch was re-taken on a quiet machine (6 of 6, −63.8 ms) and
   **the discarded batch is documented in the CP2R README**, because "re-run until the expected answer
   appears" looks identical to this in a diff and is its opposite in method. What makes it legitimate is that
   a specific defect in HOW the measurement was produced was identified first, and that the row the scope
   actually affects reproduced in both batches.
2. **A failed capture overwrote a good record before it could be inspected.** The first `cp2m-r4r2-mount` run
   returned `ok: false` with every scenario null, and had already written over `after.json`. It was restored
   from git. **Every capture after that was written to a TEMP directory, inspected, and promoted only on
   `ok: true`** — a runner that writes straight onto the evidence it is replacing has no safe failure mode.
3. **Captures were taken before the source was final, so two had to be taken twice.** `cp2s-r2-inplace` and
   `cp2s-r2-c9` were re-taken before the token rotation and the rotation invalidated them again; worse, the
   c9 run was still in flight WHILE `index.html` was being rotated, so it recorded a post-rotation hash for a
   page its browser may have loaded pre-rotation. Both were re-taken once every source edit was final.
   **A capture is only valid if nothing it pins changes after it starts.**

**AND MY DERIVATION MISSED ONE, WHICH IS THE POINT OF RUNNING THE SWEEP.** I mapped
`docs/evidence/cp2m-r2-viewport` to `site-priority-drag-s8-b3-r3-cp2m-r4` because that suite names the
directory, and that suite passes. Its real enforcing consumer is
`site-priority-viewport-acceptance-s8-b3-r3-cp2m-r2`, which the first full regression caught at 307 / 2. A
derivation by grep answers "which suite MENTIONS this directory"; only execution answers "which suite REFUSES
this source". The ninth batch was re-taken and the suite reads 309 / 0.

**Two further defects of this round were found by that same regression and by nothing before it:**

- `co1100r-live-hydration-closure` **crashed** with `ReferenceError: escapeReplenHtml is not defined`. It
  slices `_irSuggestedCellHtml` into a bare `new Function`, and this round made that function build its title
  through the shipped escaper — a helper declared OUTSIDE the slice. That is the CP2P-R2 rule, and the fix is
  the CP2T-R1 one: the harness now EXTRACTS `escapeReplenHtml` rather than stubbing it, because a stub that
  does not escape would let the suite pass an unescaped cell. Two other suites touch that function and neither
  was affected — one only mentions it in a comment, the other drives it in a real browser where the escaper
  exists.
- `shared-transport-timeout-classification` §G4 pinned the stage count at **6**, and the split made it **8**.
  The assertion guards against reads being MERGED, so a larger count is the direction it protects; it is
  RAISED to 8 rather than loosened to `>= 6`, because the exact count is what would catch a merge going the
  other way.

All nine batches, plus the three CP2P batches that must differ and this round's own suite, verified green
against the final source state.

