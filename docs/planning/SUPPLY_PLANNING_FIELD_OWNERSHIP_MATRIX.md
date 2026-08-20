# Supply Planning — End-to-End Field Ownership Matrix (Phase F1-0)

> **READ-ONLY audit artifact.** No formula invented, no business logic / DB / deploy change. Companion to `SUPPLY_PLANNING_FORMULA_RUNTIME_RECONCILIATION.md`. Baseline HEAD `9324086`, 2026-08-05. Tests: 80/80 files PASS; Golden 39/1/0; #34 Pending.
>
> **Column legend (the round's required matrix fields):** each row carries **Runtime module:fn · Output DTO · DB table.column · Writer · Reader · UI · Test · Status · Gap→Next-owner**. To keep rows terse, the shared columns are factored per section:
> - **Formula owner / Input authority** — `SUPPLY_PLANNING_CALCULATION_RULES.md` (the § noted per row) over live Operation-DB snapshot inputs, unless a different owner is named.
> - **Edit authority** — the user, through the named UI page (or none where the field is a system snapshot).
> - **Submit authority** — user Send/Approve for business records; the recommendation engine never mutates a Submitted record (`RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md §G` / PO-8).
> - **Deployment caveat** — every `.gs` writer/reader below is `SOURCE_PRESENT_RUNTIME_UNVERIFIED` at the deployment layer (source mirror; no live Spreadsheet accessed).

Status tokens per round §4. `∅` = none / absent.

---

## A. Forecast

*Formula owner: CALC_RULES §5 / §2D + `FC_SUMMARY_SPEC.md`. Edit authority: FC Summary user.*

| Field | Runtime module:fn | DB table.column | Writer | Reader | UI | Test | Status | Gap → Next owner |
|---|---|---|---|---|---|---|---|---|
| regular forecast | `fc-summary.js:saveRegularUpdate(3242)` | `fc_regular_forecast.jan..dec/total_fc` | `04_marketplace_forecast_import.gs:handleImportFcRegularForecastBatch_(485)` | `operation-system-db-api.js:getFcRegularForecast(2173)` | fc-summary | `fc-base-edit-and-sidebar` | SOURCE_PRESENT_RUNTIME_UNVERIFIED | deployment verify → user |
| special-event forecast | `fc-summary.js:saveEventUpdate(3076)` | `fc_special_events.fc_qty` | `14_fc_write_handlers.gs:fcSpecialEventUpsert_(205)` | `…:getFcSpecialEvents(2231)` | fc-summary | `fc-special-event-persist` | SOURCE_PRESENT_RUNTIME_UNVERIFIED | 3-write non-atomic (orphan risk) → backend orchestrator |
| target percentage (rule) | `fc-summary.js:saveNewTargetRule(1189)` | `fc_target_rules.jan_pct..dec_pct` | `14_…:handleUpsertFcTargetRule_(427)` | `…:getFcTargetRules(2236)` | fc-summary | ∅ | SOURCE_PRESENT_RUNTIME_UNVERIFIED | rule persists but is **never applied** (next row) |
| **target% → adjusted/effective FC** | `fc-summary.js:calculateEffectiveFC(1287)` (via `getEffectiveFcSafe`) | ∅ (no effective value stored) | ∅ | ∅ (only `window.fcDebug.getEffectiveFc:1548`) | ∅ (table shows raw months) | ∅ | **DEAD_OR_LEGACY** | wire resolver into render/save **or** retire → F1-1 |
| forecast status (raw/adjusted/approved) | `04_…:handleImportFcRegularForecastBatch_(625, status='draft')` | `fc_regular_forecast.forecast_status` | `04_…` | `…:_getDbFcRegularData(3419)` (not surfaced) | ∅ (no approve control) | ∅ | SOURCE_PRESENT_RUNTIME_UNVERIFIED | no approval workflow → F1-1 (decision D-forecast-approval) |
| actual-sales / forecast accuracy | `forecast.js:updateSummaryStats(938)` hardcoded 95/92/88% | ∅ | ∅ | `data.js:getForecastReviewData(277)` (static) | forecast (Review) | ∅ | **MOCK_OR_DEMO_ONLY** | BigQuery actuals feed absent → F1-1 / BQ owner |

---

## B. Inventory Projection

*Formula owner: CALC_RULES §8 / §9 / §6 / §11. Input: `amazon_inventory_snapshot`, `overseas_inventory_snapshot`, `factory_stock`.*

| Field | Runtime module:fn / DTO | DB table.column | Writer | Reader | UI | Test | Status | Gap → Next owner |
|---|---|---|---|---|---|---|---|---|
| current stock | `supply-planning-source-projection.js:projectRecommendationProductionSources` → `byLifecycleBucket.CURRENT_STOCK` | `amazon_inventory_snapshot.available_qty` / `overseas_inventory_snapshot.wh_available_stock` / `factory_stock.fac_current_stock` | ∅ (read-only chain) | `supply-planning-source-reader.js:readSupplyEntries` | inventory-replenishment (label) | `source-projection` / `ledgers` | CONNECTED_NOT_PERSISTED | undeployed mirror; no writer → F1-3/F1-2 |
| available stock (physical−reserved−damaged) | ∅ (reads `wh_available_stock` verbatim) | `overseas_inventory_snapshot.wh_available_stock` | ∅ | source-projection | inventory-replenishment | `source-projection §H` | CONNECTED_NOT_PERSISTED | derivation not computed → F1-2 |
| reserved stock | ∅ | `overseas_inventory_snapshot.wh_reserved_stock` | ∅ | ∅ | ∅ | ∅ | DOCUMENT_ONLY | reservation = B-1 lane → F1-8/Phase-later |
| projected ending inventory (§8/§9) | ∅ — only `calculations.js:classifyProjectedBalance` (§11 classify) | ∅ | ∅ | ∅ | ∅ | `calculations` (classify only) | DOCUMENT_ONLY | **no projection engine** → F1-2 |
| days of supply | ∅ (pure) | ∅ | ∅ | ∅ | `inventory-replenishment.js:603/1174` current÷avg | ∅ | UI_ONLY | move to engine → F1-2 |
| target stock / target days | ∅ (pure) | `shipping_plan_lines.snapshot_target_days` (Submit only) | ∅ | ∅ | inventory-replenishment (input) | ∅ | DOCUMENT_ONLY | §6 coverage engine → F1-2 |
| source_data_as_of | `source-projection.js:maxAsOf` / `source-reader-production.js:readRawTableSnapshot` | `*_snapshot.snapshot_date` / `factory_stock.last_transaction_at→updated_at` | ∅ | production-source passthrough | ∅ | `source-projection §D` | CONNECTED_NOT_PERSISTED | persist onto run/journal → F1-7 |

---

## C. Qualified Incoming / Supply Ledger

*Formula owner: CALC_RULES §2E / §2F / §38 / §39. Input: `shipments`(+lines), `shipping_plans`, `purchase_orders`.*

| Field | Runtime module:fn / DTO | DB table.column | Writer | Reader | UI | Test | Status | Gap → Next owner |
|---|---|---|---|---|---|---|---|---|
| qualified incoming (§2E 10-gate) | `supply-planning-qualified-incoming.js:evaluateQualifiedIncoming` → `qualifiedIncomingQuantity` | (candidate inputs `shipments`/`shipment_lines`) | ∅ | `supply-planning-line-runtime.js` (test only) | ∅ (INVENTORY §22 read-model unbuilt) | `qualified-incoming` (106) | **IMPLEMENTED_NOT_CONNECTED** | not on production ledger path → **F1-3 (first slice)** |
| approved / committed supply | `source-projection.js` (shipping_plans site_confirmed→APPROVED_SHIPPING_PLAN) → ledger | `shipping_plans.approved_qty` | ∅ | `source-reader.js:readSupplyEntries` | ∅ | `source-projection §F` | CONNECTED_NOT_PERSISTED | PO committed-supply producer absent → F1-3 |
| shipped / in-transit | `source-projection.js:SHIPMENT_STATUS{shipped/in_transit/arrived}` → ledger | `shipments.shipment_qty` | ∅ | source-reader | ∅ | `source-projection §G` | CONNECTED_NOT_PERSISTED (CONFLICTING_AUTHORITY on `arrived`) | 3 status vocabularies → F1-3 reconcile |
| delivered-not-received | `ledgers.js` bucket + fixtures | `shipment_events` (SPEC-ONLY) | ∅ | ∅ | ∅ | `supply-lifecycle §L` | FROZEN_IMPLEMENTATION_PARTIAL | no receiving/event producer → F1-3+ |
| supply pool key / dedup | `ledgers.js:buildSupplyLedger` poolKey `company\|warehouseId\|masterSku\|poolType` | `warehouses.warehouse_id` | ∅ | ∅ | ∅ | `ledgers` (133) | FROZEN_AND_IMPLEMENTED | wire live feed → F1-3 |
| source warehouse | `source-projection.js` lineage `stock:FACTORY:<wh>:<sku>` | `factory_stock.warehouse_id` | `21_factory_inventory_handlers.gs` | alloc/sf/proj | ∅ | `allocation-input F1` | FROZEN_AND_IMPLEMENTED | — |

---

## D. Replenishment Recommendation (Weekly Shipping)

*Formula owner: CALC_RULES §2C.1 / §31 / §40. Output DTO: weekly recommendation facts (`source-facts.js`). DB: `shipping_allocation_draft_lines`.*

| Field | Runtime module:fn | DB column | Writer | Reader | UI | Test | Status | Gap → Next owner |
|---|---|---|---|---|---|---|---|---|
| calculated gap | `line-runtime.js:runSupplyPlanningLine`→`calculations.js:calculateGap(160)` | `calculated_gap_qty` (snapshot) | ∅ live (`production-writer.js`/`24_` test-mirror) | `inventory-replenishment.js:_recSummaryRows` | inventory-replenishment | `line-runtime`,`weekly-recommendation` | IMPLEMENTED_NOT_CONNECTED | no deployed writer → **F1-4** |
| recommended shipping qty (FLOOR) | `source-facts.js:resolveWeeklyRecommendationFacts`→`calculations.js:calculateShippingAndResidual` | `recommended_qty` | `16_…:sadUpsert…` (no live calc feeder) / test-mirror | `inventory-replenishment` | inventory-replenishment | `weekly-recommendation` (rec 96) | IMPLEMENTED_NOT_CONNECTED | writer → F1-4 |
| planned qty (user) | `inventory-replenishment.js:IRDraft` | `shipping_allocation_draft_lines.planned_qty` | `16_…:sadUpsertLinesKeyedCore_(253)` | `16_…:handleGetShippingAllocationDraftWorkspace_(432)` | inventory-replenishment | `allocation-draft-runtime-c2d2` | SOURCE_PRESENT_RUNTIME_UNVERIFIED | init = recommended_qty; deploy → F1-4 |
| survival need | `allocations.js:allocateOverseasSharedPool` | ∅ (allocator input; §40.10 no column) | ∅ | source-facts | ∅ | `allocations`,`allocation-input O6` | FROZEN_AND_IMPLEMENTED | §22 avg-sales producer upstream |
| factory available qty | `allocations.js:allocateFactoryDeterministic` | `factory_stock.fac_current_stock` (source) | `21_…` (physical) | alloc/sf/proj | ∅ | `allocation-input F1/F3` | FROZEN_IMPLEMENTATION_PARTIAL | eligibility resolver caller-supplied → F1-5 |
| route / shipping method | ∅ (no route engine) | `shipping_allocation_draft_lines.recommended_shipping_method/…_last_mile` | ∅ live | `_recSummaryRows` (`--`) | inventory-replenishment | ∅ | DOCUMENT_ONLY | `replenishment_route_rules` unbuilt → later F1 |
| recommendation reason/flags | `allocations.js` (allocationReason 244/369) | `…_lines.recommendation_reason/flags/line_status` | `24_` orchestrator (blocked) / test-mirror | `inventory-replenishment.js:l.recommendation_reason` | inventory-replenishment | `plan-builder C` | FROZEN_AND_IMPLEMENTED | persist via writer → F1-4 |

---

## E. Factory Stock Allocation

*Formula owner: CALC_RULES §7 / §13 / §35 / §39.6 / §40.9.*

| Field | Runtime module:fn | DB table.column | Writer | Reader | UI | Test | Status | Gap → Next owner |
|---|---|---|---|---|---|---|---|---|
| factory_stock (physical) | `21_factory_inventory_handlers.gs:handleAdjustFactoryInventory_` | `factory_stock.fac_current_stock/fac_reserved_stock` | `21_…` **(LIVE)** | `21_`, proj/pw | Inventory Adjustment modal | `production-source/writer` | FROZEN_AND_IMPLEMENTED | — |
| factory_stock_movements | `21_…` | `factory_stock_movements.*` (15 headers) | `21_…:fcWriteAppendByHeader_(146)` | ∅ | (adjust result) | ∅ | FROZEN_AND_IMPLEMENTED | — |
| FACTORY_SHARED pool + FIFO | `allocations.js:allocateFactoryDeterministic` | ∅ (sentinel token, not stored) | ∅ | proj/sf/alloc | ∅ | `allocations`,`source-projection D-1` | FROZEN_AND_IMPLEMENTED | wire to writer → F1-5 |
| allocated factory stock / forecast share / calculation_method / allocation_version / status | ∅ | `factory_stock_allocation_plans.*` | ∅ | ∅ | ∅ | ∅ | **DOCUMENT_ONLY** | table absent from all `.gs` → **F1-5** (schema+writer+UI decision) |

---

## F. Cross-Company Pooling / Borrowing

*Formula owner: CALC_RULES §11 / §12 / §32 / §32A; orchestration owner: CALC_RULES §41.*

> **F1-6 FROZEN (F1-7N-FA-3A.0, 2026-08-20) — Factory Surplus Reallocation Orchestration (PLANNING-ONLY).** F1-6's Phase-1 responsibility = planning-only donor/receiver enumeration, releasable-surplus orchestration, legal transfer *simulation* (analysis, §32/§32A), reallocation snapshots, post-reallocation remaining shortage, and the post-reallocation Net Order Need *producer* stage. It is explicitly **NOT** physical reservation, inventory movement, shipment allocation, or ownership transfer.
> **Phase distinction (resolves the prior ambiguity):** *analysis-layer surplus netting for recommendation math = Phase-1 (this section, AUTHORIZED)*; *physical reservation / borrowing / movement / ownership transfer = Phase-2 / [[D-4]]* (`PHYSICAL_CROSS_COMPANY_RESERVATION_DEFERRED`). Physical factory conservation stays per-company (FM5-R2A). Runtime module **IMPLEMENTED (F1-7N-FA-3A, PURE, NOT CONNECTED)**: `assets/js/core/supply-planning-surplus-reallocation.js` (namespace **KMFSR**, `KMFSR.projectSurplusReallocation`) — wraps §35/§40 `allocateFactoryDeterministic` + §32A `evaluateReallocationEligibility`/`feasibleReallocationQty`/`applyFeasibleReallocation` → §12 `sumRemainingShortages`; timely-transfer authority = §41.5A (CURRENT FACTORY STOCK tier gate; `timelyTransferableQty = donorRemainingReleasableSurplus`); 270 unit assertions. NOT wired to monthly / Gap / Weekly AI Plan / Request Order runtime (Phase-2 / FA-3B/FA-3H).

| Field | Runtime module:fn | DB column | Writer | Reader | UI | Test | Status | Gap → Next owner |
|---|---|---|---|---|---|---|---|---|
| total shortage | `calculations.js:sumRemainingShortages` | ∅ (live-only §36.1) | ∅ | ∅ | ∅ | `monthly-recommendation M5` | FROZEN_AND_IMPLEMENTED (Phase-1) | surface via resolver → F1-6 |
| total surplus / feasible reallocation | `calculations.js:feasibleReallocationQty`/`evaluateReallocationEligibility` | ∅ | ∅ | ∅ | ∅ | Golden #21/#22 | FROZEN_AND_IMPLEMENTED (Phase-1) | analysis-only (§32) |
| §41 factory surplus reallocation LIBRARY (§44) | `supply-planning-surplus-reallocation.js:KMFSR` (pure §41 library — NOT the live monthly factory allocator) | ∅ | ∅ | FA-3B3 adapter → KMMSA/KMAR coverage → KMTPP | ∅ | `supply-planning-surplus-reallocation-f1-7n-fa-3a` | IMPLEMENTED_NOT_PRODUCTION_CONNECTED | 270 assertions; live monthly initial factory allocation = **KMMSA/KMAR** (§44.1); KMFSR runs §41 AFTER, via preallocated-input adapter (FA-3B1); NOT a second allocator |
| reallocation in/out qty | ∅ (no producer) | `request_order_allocation_draft_lines.reallocation_in/out_qty_snapshot` | ∅ live (col ensured `15_…:43/63`) | `operation-system-db-api.js:1783-1784` | ∅ | ∅ | PERSISTED_NOT_READBACK_VERIFIED | Engine-B placeholder blank (never faked) → F1-6 |
| net order need — LIVE monthly (§44.4) | `42_:recoWsBuildMonthlyProjection_` → `KMTPP.projectTimePhasedSupply` residual `MAX(0, gap − overseas − factory)` | `…_lines.net_order_need_snapshot` | `47_`→`24_`→`KMPW` | api/gap | ∅ | live gap path | LIVE_OWNER (Architecture A) | single live residual owner; carton via `calculateSuggestedOrderQty` |
| net order need — standalone §41 model | `source-facts.js:resolveMonthlyRecommendationFacts` → `sumRemainingShortages` | `…_lines.net_order_need_snapshot` | ∅ live (short-circuited by gap-backed `body.facts`) | ∅ | ∅ | `monthly-recommendation M5/M7` | IMPLEMENTED_NOT_PRODUCTION_CONNECTED | NOT the live monthly owner (§44.4); `sumRemainingShortages` is a pure primitive only |

---

## G. Monthly Request Order + Order/PO Pipeline

*Formula owner: CALC_RULES §12/§14/§31 + `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` (Phase-1 authority). Edit authority: Request Order user. Submit authority: Send Request / Approve.*

| Field | Runtime module:fn | DB table.column | Writer | Reader | UI | Test | Status | Gap → Next owner |
|---|---|---|---|---|---|---|---|---|
| request_month / request_bucket T1-T3 | `request-order.js:handleSendRequest` | `request_order_allocation_draft_lines.request_month/request_bucket` (+ `request_order_lines`) | `15_request_allocation_handlers.gs` / `13_…:handleCreateRequestOrderDraft_` | request-order-draft | request-order | `request-order-data-connection`,`-supply-ui` | FROZEN_AND_IMPLEMENTED | T4 dropped (visibility-only) |
| source snapshots (regular/dest/3P/factory/target%) | `request-order.js:_buildRequestOrderRowsFromDb(383)` | `…_draft_lines.*_snapshot` | `15_…` | ∅ at analysis page | request-order | `request-order-marketplace-identity` | PERSISTED_NOT_READBACK_VERIFIED | no draft readback into analysis page → F1-6/F1-8 |
| calculated gap / recommended shipping / residual / net order need snapshots | ∅ live (demo engine only `request-order.js:968`) | `…_draft_lines.*_snapshot` | ∅ | ∅ | request-order (`--`) | `request-order-supply-ui` (live→null) | FROZEN_NOT_IMPLEMENTED | live engine invocation → F1-6 |
| recommended_qty (system suggestion) | ∅ (Engine B blank; Send omits it `:2291`) | `…_draft_lines.recommended_qty` (+`request_order_lines`) | ∅ | request-order-draft | request-order | `request-order-supply-ui` (null→"--") | FROZEN_NOT_IMPLEMENTED | writer → F1-6 |
| order qty (user decision) | `request-order.js:_roAllocEdit`+`handleSendRequest` | `…_draft_lines.order_qty`→`request_order_lines.requested_qty→approved_qty` | `15_…`→`25_…:handleUpdateRecommendationDecisionLocked_` (optimistic token) | request-order-draft | request-order | `request-order-supply-ui` | PERSISTED_NOT_READBACK_VERIFIED | not rehydrated on analysis reload → F1-8 |
| carton qty / units_per_carton | `request-order.js:_roCartonBreak`/`boxSize` | `…_lines.carton_qty/units_per_carton` (+PO) | `15_`(pass-through)/`13_`(ceil) | request-order-draft | request-order/draft | `request-order-supply-ui` | FROZEN_AND_IMPLEMENTED | partial-carton preserved; §SC-1M full-carton gate not enforced → F1-6 |
| PO creation / T1·T2_T3 split / receive | `13_…:handleCreatePurchaseOrderFromRequest_(1317)`/`handleReceivePurchaseOrderLines_(1801)` | `purchase_orders.*` / `purchase_order_lines.*` | `13_…` | purchase-order-overview | request-order-draft / purchase-order | `procurement-shipment-qty-source` | FROZEN_AND_IMPLEMENTED | shipment linkage absent → later |

---

## H. Weekly Execution + Lineage Fields

*Owner: `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` / `ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md`. Submit authority: user Approve; deduction at Confirm-and-Ship.*

| Field | Runtime module:fn | DB table.column | Writer | Reader | UI | Test | Status | Gap → Next owner |
|---|---|---|---|---|---|---|---|---|
| destination warehouse | `inventory-replenishment.js:IRDraft.buildDraftHeaderPayload` (header route) | `shipping_allocation_drafts.recommended_*` (header) | `16_…:sadUpsertDraftHeaderCore_` | `16_…:handleGetShippingAllocationDraftWorkspace_` | inventory-replenishment | `allocation-draft-30-28-reconcile` | SOURCE_PRESENT_RUNTIME_UNVERIFIED | deploy → F1-8 |
| shipping method / required-by date | (recommended fields, no engine) | `shipping_allocation_drafts.*` / `…_lines.required_by_date` | `16_…` | workspace readback | inventory-replenishment | `allocation-draft-runtime-c2d2` | FROZEN_IMPLEMENTATION_PARTIAL | route/method engine absent → later |
| **Allocation Draft Submit → shipping_plans** | `16_…:handleSubmitShippingAllocationDrafts_(352)` | `shipping_allocation_drafts.status='submitted'` only | `16_…` (status flip) | ∅ (no downstream reader) | inventory-replenishment | `allocation-draft-runtime-c2d2` (HALT asserted) | **FROZEN_IMPLEMENTATION_PARTIAL (HALTED 359-365)** | **first execution-link** → F1-8 (needs D-lineage, D-idempotency) |
| shipping_plans / lines | `11_shipping_plan_handlers.gs:handleCreateShippingPlansBatch_` | `shipping_plans.*` / `shipping_plan_lines.*` (random-UUID ids) | `11_…` | shipping-plan | shipping-plan | `shipping-plan-runtime` | IMPLEMENTED_NOT_CONNECTED | fed by legacy local UI, no `allocation_draft_id` → F1-8 |
| reservation / confirm deduction | `22_shipment_dispatch_handlers.gs:handleConfirmShipmentAndDispatch_` | `factory_stock.current_stock`↓ + `factory_stock_movements` | `22_…` (current only) | shipment | shipment center | `shipment-dispatch` | FROZEN_IMPLEMENTATION_PARTIAL | reserved_stock/PO shipped_qty untouched; B-1 reserve absent → later |

---

## I. Lineage / Run Identity (persistence lane — already implemented as pure modules)

*Owner: `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md §Persist-Orch`. DB: `recommendation_calculation_runs` (16 cols; additive, **NOT migrated live**).*

| Field | Runtime module:fn | DB table.column | Writer | Reader | Test | Status | Gap → Next owner |
|---|---|---|---|---|---|---|---|
| calculation_run_id (**deterministic**) | `supply-planning-persistence.js:runIdOf(56)` = `RUN::<draftId>::v<version>` | `recommendation_calculation_runs.calculation_run_id` (+draft header) | `supply-planning-persistence-repository.js:markStage(259)` | `…:loadIncompleteRun(154)` | `persistence-repository §D` | FROZEN_AND_IMPLEMENTED (pure) | deploy + migrate journal → F1-7 |
| formula_version | persistence.js(252)/plan-builder(47) | `…_runs.formula_version` + draft header | persistence-repository | repository readers | `persistence-repository` | FROZEN_AND_IMPLEMENTED (pure) | migrate → F1-7 |
| draft_version (optimistic token) | `persistence-locking.js:executeLockedPersistence(64)` + `computeExpectedToken(96)` | draft header `draft_version` + FNV-1a user-edit fingerprint | persistence-repository (under lock) | loadDraftSnapshot | `persistence-locking` (96) | FROZEN_AND_IMPLEMENTED (pure) | LockService (`ScriptLock`) deploy → F1-7 |
| recommendation_calculation_runs (journal) | `persistence-repository.js:RUN_JOURNAL_TABLE(40)`/`applyPersistencePlan(225)` | `recommendation_calculation_runs` (16 cols) | repository | repository | `persistence-repository §D` | FROZEN_AND_IMPLEMENTED (pure) / **not migrated live** | additive migration on Verification Copy → F1-7 (decision D-deploy-target) |

> **Note on run identity:** the recommendation lane's `calculation_run_id` is **deterministic**. This is a *different* concern from the random-UUID ids minted by `11_shipping_plan_handlers.gs:handleCreateShippingPlansBatch_` (`:289/329/392`) for `shipping_plans` — that non-determinism is one of the four Submit-HALT reasons in the execution lane, not a defect of the recommendation persistence lane.

---

## Status roll-up

| Status | Representative fields |
|---|---|
| **FROZEN_AND_IMPLEMENTED** (pure or live-write) | calculateGap, shipping FLOOR, order CEILING, avg-sales, ledgers, allocations, §2E engine (as a function), survival/priority/FIFO, persistence core+repository+lock+journal (pure), factory physical stock writer, FC raw CRUD, order_qty/carton, PO convert/receive, Approval |
| **IMPLEMENTED_NOT_CONNECTED** | §2E engine on the ledger path, recommended_qty/gap/net_order_need writer output, production source-read chain, weekly-plan writer (orphaned from Draft) |
| **FROZEN_NOT_IMPLEMENTED** | Inventory projection engine, route/method engine, request-order live calc snapshots, Ready-to-Ship reservation, PO↔shipment linkage |
| **DOCUMENT_ONLY** | §8/§9 projection, §6 target-stock, reserved-stock derivation, `factory_stock_allocation_plans`, `allocation_version` |
| **MOCK_OR_DEMO_ONLY / DEAD_OR_LEGACY / UI_ONLY** | forecast.js Review + FC-SKU-Decision (mock); request-order demo engine (mock); target%→effective-FC resolver (dead); Days-of-Supply, targetDays split (UI-only) |
| **CONNECTED_NOT_PERSISTED / PERSISTED_NOT_READBACK_VERIFIED** | production source reads (current/3P/approved/shipped/as-of); request-order source snapshots + order_qty |
| **CONFLICTING_AUTHORITY** | `arrived` bucket; 3 shipment-status vocabularies; two request-order specs (resolved by hierarchy) |
| **FROZEN_IMPLEMENTATION_PARTIAL** | Allocation Draft Submit (HALTED), Shipment Draft, Confirm deduction, full-carton validation |
| **IMPLEMENTED_NOT_PRODUCTION_CONNECTED** | §41 factory-surplus-reallocation library (`KMFSR`, FA-3A, 270 assertions) + §42 ongoing-order projection library (`KMOOP`, FA-3B0, 55 assertions). Both pure; live monthly engine = Architecture A (KMMSA/KMAR + KMTPP, §44); integration = FA-3B1/B2/B3. NOT wired to monthly/Gap/Weekly/Request-Order |
| **PHASE_2_DEFERRED** | event pull-forward; cross-company **physical** borrowing/reservation (`PHYSICAL_CROSS_COMPANY_RESERVATION_DEFERRED`; analysis-only netting is Phase-1 §41); amendment K2/line-grain/MULTI |

## G. Ongoing-Order supply + Supply-Lifecycle count-once (F1-7N-FA-3A.1 freeze)

*Contract owner: `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.5 + `SUPPLY_PLANNING_CALCULATION_RULES.md` §42.*

| Field / concept | Runtime owner | Status | Note |
|---|---|---|---|
| supply lifecycle count-once (buckets + `supplyLineageRef`) | `supply-planning-ledgers.js:buildSupplyLedger`; status→bucket map `supply-planning-source-facts.js` (`OMIT_TRANSFERRED`) | FROZEN_AND_IMPLEMENTED | one unit → one active bucket per run; shipped PO → `OMIT_TRANSFERRED` (Shipment is incoming owner); load-bearing cross-feed guard is the status map, not the ledger lineage dedupe |
| Ongoing-Order (unshipped PO) qty | derived `MAX(0, ordered_qty − completed_qty)` (**CORRECTED FA-3B0-PRE** — was `ordered − shipped`; received/completed qty is now physical Factory Stock, §42.3) | CONTRACT_FROZEN_RUNTIME_PENDING → FA-3B0 (projection); lifecycle handoff IMPLEMENTED | distinct supply type from §40/§41 factory, in-transit, received inventory; `completed − shipped` now = Factory Stock |
| PO Receive → Factory Stock count-once handoff | `13_procurement_handlers.gs:handleReceivePurchaseOrderLines_` + shared `21_:factoryStockApplyDeltaTx_` (movement `po_receipt`, lineage `related_entity_id=purchase_order_line_id`) | IMPLEMENTED_ATOMIC (backend) | atomic LockService + journal rollback; factory warehouse validated (fail closed); optional `idempotency_key` dedupe; APPS_SCRIPT_SYNC_REQUIRED |
| Ongoing-Order site allocation | `supply-planning-ongoing-order-projection.js:KMOOP.projectOngoingOrderSupply` — A1 = `request_order_line_sources.requested_qty` (immutable, per site); A2 = within-company monthly FC share (`KMPCX.forecastShareQty` basis, assembly; NOT weekly `demandWeight`, NOT KMDA `50_` warehouse ratios) | IMPLEMENTED_NOT_PRODUCTION_CONNECTED (FA-3B0; 55 assertions) | single-company PO line; §43 FLOOR + residual; projects only `MAX(0, ordered − completed)`; completed/shipped excluded. **Monthly timing owner = KMTPP-side, NOT KMOOP** (§44.3); live integration (FA-3B2) maps output → KMTPP incoming, gated by `ONGOING_ORDER_MONTHLY_TIMING_AUTHORITY_MISSING` |
| `related_shipment_id` (purchase_order_lines) | ∅ (declared, never populated) | DECLARED_UNUSED | real PO↔Shipment link = `shipment_line_allocations.purchase_order_line_id`; not a supply owner |

*End of matrix.*
