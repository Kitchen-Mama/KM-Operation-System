# S5 — Recommendation / Decision Engine Contract

**Status: CONTRACT FROZEN WHERE THE SYSTEM ALREADY DECIDED — DECISIONS OPEN WHERE IT NEVER DID.**
Spec-only round (S5-R1). No runtime, no Apps Script, no bundle, no schema, no migration, no DB write.
Base `3f48f58` (S4 final seal). `BEHAVIOR_CHANGED = NO`.

This document is the **S5 owner-of-record for the decision pipeline as a whole** — the seam from a materialized
gap to an operator-approved quantity. It **authors no formula**. Every quantity rule below is cited to its
existing owner; where an owner exists this document points at it and changes nothing, and where no owner exists
it says so and stops.

Audience: the operator (who owns the §15 decisions) and the rounds that implement S5-R2 onward.

---

## §0. The finding that shapes this round

**S5 is not greenfield.** The task frames the pipeline

> MATERIALIZED GAP → OWN SUPPLY → CROSS-COMPANY → FACTORY → RESIDUAL → RECOMMENDATION → OPERATOR DECISION → DOWNSTREAM DRAFT

as something to be designed. Seven of those eight stages are already **frozen and live**. The monthly
Order-Planning engine computes gap, folds own/overseas/cross-company/factory coverage into opening supply, runs
one time-phased projection, produces a residual and a carton-rounded suggested quantity, persists it as a
per-tier decision row, and lets the operator override it. That chain is Architecture A
(`SUPPLY_PLANNING_CALCULATION_RULES.md` §44.1), and S5 must not re-author it.

What is genuinely missing is narrower and more interesting than a pipeline:

1. **There is no recommendation ACTION.** The engine emits a *quantity* (`suggestedOrderQty`). It never says
   *what to do* — transfer, draw factory stock, place a new order, do nothing, review by hand. The read
   workspace forbids exactly this vocabulary today, by name
   (`API_RECOMMENDATION_WORKSPACE_SPEC.md`: "Forbidden/omitted: … ORDER/TRANSFER/BORROW/NO_ACTION").
2. **The explanation is partial.** Three of the seven §8 evidence fields now transport to persistence; the
   rest live as runtime DTO diagnostics that are dropped before the operator sees them.
3. **The state vocabulary is frozen, and it is not the one §9 proposes.**

So S5-R1 freezes the seam, records what the pipeline already owns, and puts the genuinely-unowned business
policy in front of the operator (§15) instead of inventing it.

---

## §1. Canonical sources read

`CANONICAL_INPUT_SPECS` — read in full or at the cited sections, not from memory:

| Spec | What it owns for S5 |
|---|---|
| `SUPPLY_PLANNING_CALCULATION_RULES.md` (v4.7, 2440 ln) | every quantity rule: §11 shortage/surplus · §12/§32/§32A reallocation · §13/§35/§35A factory · §14/§31 carton + residual · §36 order-state separation · §39 ledgers · §40 allocators · §41 surplus reallocation · §42 count-once + ongoing PO · §43 integer rounding · §44 monthly architecture |
| `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md` (1020 ln) | §Persist-Orch run/draft/idempotency · §SC-1 Submit contract · §Weekly-AIPlan |
| `RECOMMENDATION_SOURCE_CONTRACT_SPEC.md` (652 ln) | SC-1 field lineage · SC-2 value semantics · SC-3 run-level ownership · SC-11 frozen projection contract |
| `SUPPLY_CHAIN_SYSTEM_FLOW.md` · `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` | three-layer separation, immutable flow |
| `DATABASE_RELATIONSHIP_MAP.md` §7.5/§7.5C | draft-layer tables, snapshot architecture |
| `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` | §2 immutable flow · §3.5–3.8 schemas · §12.13 tier rule |
| `REQUEST_ORDER_ALLOCATION_DRAFT_V2_FLATTEN_DESIGN_FREEZE.md` | the live flat decision row (53 columns) |
| `REQUEST_ORDER_ALLOCATION_DRAFT_CREATION_BOUNDARY.md` | when a draft may be created |
| `DUAL_MAINLINE_CONTRACT_AUDIT_F1-7N-FC-0A.md` | the measured 31-stage two-mainline topology |
| `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A/§7B/§7C | cadence, pure-vs-production boundary, command concurrency |
| `SUPPLY_PLANNING_DECISION_REGISTER.md` (1365 ln) | the standing decision ledger this round appends to |
| `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` · `SHIPMENT_CENTER_SPEC.md` · `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` | the shipping mainline and SKU identity, read to fix the §2A boundary |

`CONFLICTS_FOUND = 3` (all pre-existing, all already resolved in their owners; recorded so S5 does not
re-open them):

| # | Conflict | Resolution already on record |
|---|---|---|
| C-1 | §41.7 named `KMCALC.sumRemainingShortages` the "sole Net Order Need owner"; §44.4 names `KMTPP.projectTimePhasedSupply` | **§44.4 wins.** `sumRemainingShortages` is a pure §12 primitive and the terminal of the *standalone* §41 model only. Exactly one live monthly residual owner. |
| C-2 | Two ongoing-PO supply paths were designed (KMSF `committedProduction` vs KMOOP/KMOTA) | **§44.12.** One chained runtime: KMSF admits → KMOOP attributes to sites → KMOTA dates → KMTPP consumes. Not two engines. |
| C-3 | §44.14 halted on `order_planning_gap` having no slot for the §41 diagnostics | **Resolved.** `OP_GAP_FACTORY_SNAPSHOT_COLS_` (3 additive columns) landed under `D-B4-GAP-TRANSPORT-SCHEMA` Option A. |

`DECISIONS_ALREADY_FROZEN` — S5 inherits and does not re-litigate: the §39 ledger grains · the §40 allocator
contracts · §43 FLOOR-and-retain-residual · §44.1 Architecture A as the live monthly engine · §44.5 monthly
count-once buckets · the §41 planning-only boundary (`PHYSICAL_CROSS_COMPANY_RESERVATION_DEFERRED`) · the
flat-V2 draft identity · §36 order-state separation.

---

## §2. The S5 decision pipeline — stage owners

Each stage names the owner that already exists. **No stage is skipped, and no stage gets a second owner.**

```
MATERIALIZED GAP ─► OWN AVAILABLE SUPPLY ─► CROSS-COMPANY ─► FACTORY / COMMITTED ─►
RESIDUAL SHORTAGE ─► RECOMMENDATION ─► OPERATOR DECISION ─► DOWNSTREAM DRAFT
```

| Stage | Owner (live) | Status |
|---|---|---|
| `DEMAND_INPUT` | forecast/event/run-rate assembly → `buildDemandLedger` (§39.3) | FROZEN |
| `SUPPLY_INPUT` | `buildSupplyLedger` (§39.4), buckets §44.5 | FROZEN |
| `GAP_INPUT` | `order_planning_gap` (materialized), produced by `43_api_v1_gap_materialization.gs` | FROZEN — §4 |
| `ALLOCATION_STAGE` | `KMMSA.allocateMarketplaceReceiverSupply` + R2G-B `KMAR.allocateFactoryCrossCompany`, then §41 `KMFSR.reallocatePreallocatedFactorySupply` | FROZEN — §5/§6/§7 |
| `RESIDUAL_STAGE` | `KMTPP.projectTimePhasedSupply` → `residualOrderNeedQty` (single owner, §44.4) | FROZEN |
| `RECOMMENDATION_STAGE` | `KMCALC.calculateSuggestedOrderQty` (carton CEILING, §14/§31) — **quantity only; no action type** | PARTIAL — §7 |
| `APPROVAL_STAGE` | flat-V2 `request_order_allocation_drafts` `tN_order_qty` / `tN_status` / `tN_user_edited` | FROZEN — §9 |
| `DOWNSTREAM_STAGE` | Send Request (`66_`) → `request_orders` → `createPurchaseOrderFromRequest` (`13_`) | FROZEN — §12 |

**Coverage does not enter as a subtraction.** Overseas and factory coverage are folded into KMTPP's *opening
supply* (`recoWsComposeOpeningSupply_`, `42_:458-463`), so `remainingGapQty` is already net of them. The
residual line therefore reads `MAX(0, destinationGapQty − 0 − 0)` (`42_:506-507`) **by design**. See the
double-count table in §5 — this is the one place where an apparently obvious repair would be a defect.

---

## §2A. Phase-1 mainline separation (OPERATOR-AUTHORITATIVE — verified in code)

Ordering/Supply Planning and Shipping/Logistics are connected business flows but remain **separate decision
authorities** in Phase 1.

```
ORDERING   Forecast → materialized Gap → Recommendation → Allocation → Request Order → Purchase Order
SHIPPING   available/approved supply → Shipment Draft → Weekly Shipping Plan → Carrier → Overview/On-the-Way
```

```
SHIPPING_REQUIRED_QTY_IS_PURCHASE_DEMAND    = NO
SHIPMENT_PLAN_AUTO_CREATES_REQUEST_ORDER    = NO
SHIPMENT_PLAN_AUTO_CREATES_PO               = NO
PURCHASE_ORDER_QTY_AUTO_CREATES_SHIPMENT    = NO
REQUEST_ORDER_QTY_AUTO_CREATES_SHIPMENT     = NO
```

Shipping data **may** be consumed as supply-state / execution-state evidence (committed, in-transit,
delivered-not-received). Shipping demand **must not** become a purchase-order quantity authority, and an
approved PO quantity does not imply a Shipment Draft.

**Measured, not assumed** (`s5-r1-recommendation-contract-freeze.test.js` §B, over comment-stripped sources):

| Claim | Evidence |
|---|---|
| PO creation touches no shipment | `13_procurement_handlers.gs:2334` — *"Writes ONLY purchase_orders / purchase_order_lines. NEVER touches request orders / shipments"*; no `createShipment*` call in the file |
| Send Request touches no shipment | `66_api_v1_request_order_send.gs` — zero shipment references in 1556 lines |
| The shipping mainline creates no request order / PO | `16_shipping_allocation_handlers.gs` — zero `request_orders` / `purchase_orders` references |
| Shipment ↔ PO link is lineage, not quantity | `12_shipment_handlers.gs:63` — `purchase_order_line_id` is a shipment-line provenance column |
| Site confirmation is not Send | `16_request_site_confirmation_handlers.gs:10-11` — *"Confirm Site ONLY records approval state"* |

The one intra-mainline automatic creation that does exist — Approve Shipping Plan → Shipment Draft
(`11_` → `createShipmentFromApprovedPlan_`) — is **inside the shipping mainline** and therefore not a §2A
violation. Its known non-atomicity is the pre-existing `S6 CONNECTED_NOT_ATOMIC` finding, owned by the dual
mainline audit; S5 does not touch it.

> Any proposal to introduce automatic cross-mainline creation or quantity propagation requires
> `OPERATOR_DECISION_REQUIRED = YES`.

---

## §3. Ledger contract carried forward

```
DEMAND_LEDGER_CONTRACT_CHANGED = NO
SUPPLY_LEDGER_CONTRACT_CHANGED = NO
```

Carried from S2 / Round 9A **unchanged**, and verified against the shipped implementation rather than the prose:

- **Demand key excludes marketplace.** `supply-planning-ledgers.js:121-123` —
  `[company, destinationWarehouseId, masterSku, planningCycle, demandType, sourceRef]`, or
  `[…, planningCycle, eventId]` for `SPECIAL_EVENT`. The module's own comment states it: *"marketplace never in
  the key"* (`:98`). `country` / `marketplace` ride along as attributes; they do not identify.
- **Demand input fields:** `demandType · masterSku · company · destinationWarehouseId · planningCycle ·
  requiredByDate · eventId (SPECIAL_EVENT only) · sourceRef · quantity`.
- **Supply input fields:** `supplyLineageRef · masterSku · company · warehouseId · poolType · lifecycleBucket ·
  quantity`.
- **Pool key** = `company + warehouseId + masterSku + poolType` (`supply-planning-ledgers.js:195`).
  **Marketplace is not a supply-pool key.**
- **Delivered-not-received remains distinct** — `DELIVERED_NOT_RECEIVED` is its own active bucket, separate
  from `RECEIVED_NOT_REFLECTED` and `CURRENT_STOCK` (§39.5, §42.1).

Any proposed change to either ledger is an operator decision, not an S5 implementation detail.

---

## §4. Gap input authority

```
GAP_TABLE / MODEL      = order_planning_gap                   (MONTHLY_ORDER mainline)
                         inventory_replenishment_gap          (WEEKLY replenishment mainline — not S5's input)
GAP_KEY                = company + country + marketplace + sku          (GAP_KEY_COLS_, 43_:54)
GAP_QUANTITY_FIELD     = tN_gap_qty       (N ∈ 1..4)
SUGGESTED_FIELD        = tN_suggested_qty (N ∈ 1..4)
PLANNING_MONTH / CYCLE = calculation_month (gap row)  ·  planning_cycle YYYY-MM Asia/Taipei (draft)
COMPANY                = company
DESTINATION            = country + marketplace  (the site scope; destinationWarehouseId is the ledger-grain identity)
MASTER_SKU             = sku
STATUS                 = calculation_status ∈ { READY, BLOCKED }    (BLOCKED carries `note`, never a fake 0)
```

Full header (`OP_GAP_HEADERS_`, `43_:41-47`), 24 columns: the 4 key columns, `calculation_status`,
`calculation_month`, four `tN_month` / `tN_gap_qty` / `tN_suggested_qty` triples, `note`, `calculated_at`,
`updated_at`, then the three additive §41 transport columns `factory_available_qty_snapshot` /
`reallocation_in_qty_snapshot` / `reallocation_out_qty_snapshot`.

```
RECOMMENDATION_RECOMPUTES_FORECAST = NO
RECOMMENDATION_RECOMPUTES_GAP      = NO
```

The Recommendation stage consumes the **materialized** row. It does not re-run Forecast and does not re-run the
gap. `order_planning_gap` does **not** own the calculation of anything in it — it is the persisted latest result,
UPSERTed by business key, and (for the three §41 columns) pure transport.

**Tier semantics carried, not restated:** T1–T3 are **actionable**; **T4 is visibility-only and must not
participate in allocation or reallocation** (§41.5). The flat-V2 decision row carries `T1/T2/T3` only — there is
no `t4_*` decision column, and that is deliberate.

---

## §5. Available supply definitions

Frozen per pool. `WHEN_CONSUMABLE` is the planning question ("may this quantity offset a gap in this run?"), not
a physical-movement permission.

| Pool | SOURCE_TABLE | QUANTITY_RULE | WHEN_CONSUMABLE | WHEN NOT | Lifecycle position |
|---|---|---|---|---|---|
| **Destination / site current** | `amazon_inventory_snapshot` (FBA) · `overseas_inventory_snapshot` (3PL) | `KMDR.resolveMarketplaceCurrentStock`; available qty at the destination | always — it is the opening balance | missing → `OPENING_SUPPLY_UNAVAILABLE` (missing ≠ 0); negative → `OPENING_SUPPLY_INVALID` | `DESTINATION_CURRENT` |
| **Own company overseas** | `overseas_inventory_snapshot` | `wh_available_stock` | when the warehouse is eligible for the receiver (§23.6/§24.9 pool-type boundary) | fulfillment-model mismatch; not `is_active` | `OVERSEAS_CURRENT` |
| **Other company overseas** | same | same | **NOT in Phase 1.** Overseas is company-owned FBA/3PL; per-company conservation is physically correct | always, in Phase 1 | — |
| **Factory current** | `factory_stock` | `MAX(fac_current_stock − fac_reserved_stock, 0)` — the canonical available figure, **never raw current_stock** | when the factory is an eligible source for the receiver (§13.1: CN → all companies; TW → ResUS only) | reserved portion; ineligible receiver set | `FACTORY_CURRENT` |
| **Committed production (ongoing PO)** | `purchase_order_lines` (+ `request_order_line_sources`) | `MAX(0, ordered_qty − completed_qty)` — **not** `ordered − shipped` | admitted by KMSF, attributed by KMOOP, dated by KMOTA from `expected_completion_date` | blank/invalid date → `ONGOING_ORDER_ETA_UNRESOLVED`, contributes zero timed incoming | `ONGOING_ORDER_NOT_RECEIVED` |
| **In transit** | `shipments` (+ lines) | qualified incoming with an ETA | ETA present and lands before required-by | **missing ETA → visible, not counted** (§34) | `SHIPMENT_IN_TRANSIT` |
| **Delivered-not-received** | shipment/receiving events | — | — | spec-only layer; reads empty today | `DELIVERED_NOT_RECEIVED` (distinct) |
| **Reserved stock** | `factory_stock.fac_reserved_stock` | subtracted, never consumed | never | always | excluded from availability |

```
DOUBLE_COUNT_RISK_TABLE
```

| # | Risk | Why it cannot happen today | What would break it |
|---|---|---|---|
| **DC-1** | **Coverage subtracted twice in the monthly residual** | Overseas + factory coverage enter KMTPP as **opening supply** (`42_:458-463`), so `remainingGapQty` is already net of them; the residual line keeps `overseasCoveredQty = factoryCoveredQty = 0` (`42_:506-507`) | Replacing those two `0`s with `rAlloc.overseasCoveredQty` / `rAlloc.factoryCoveredQty` — which reads like an obvious bug-fix and is the single most dangerous edit in the pipeline. **This is a live one-line risk and is guarded by test.** |
| DC-2 | Completed-not-shipped PO units counted as both ongoing order and factory stock | PO Receive posts received units into `factory_stock` (§42.3), and ongoing is `ordered − completed`, so completed units leave the ongoing bucket as they enter the physical one | Reverting to `ordered_qty − shipped_qty` |
| DC-3 | Shipped PO units counted as both committed production and in-transit | Status→bucket map sends `partial_shipped` / `shipped` to `OMIT_TRANSFERRED`; the Shipment becomes sole incoming owner | Adding those statuses to an active bucket |
| DC-4 | One physical unit in two lifecycle buckets | `supplyLineageRef` count-once; same lineage in >1 `(poolKey,bucket)` fail-closes `SUPPLY_LINEAGE_CONFLICT` with `effectiveSupplyQty = 0` | Synthesizing lineage refs per consumer |
| DC-5 | The same donor surplus consumed by two receivers | §41.9 invariants (5)/(6): each transfer decrements donor surplus and receiver shortage exactly once | A reallocation loop that recomputes surplus from the initial allocation |
| DC-6 | Unallocated physical residual treated as donor surplus | §43.6: `UNALLOCATED PHYSICAL RESIDUAL ≠ RECEIVER-ATTRIBUTED RELEASABLE SURPLUS`; `unusedFactorySupplyQty = 0` on the live §41 path | Feeding the pool remainder into §41 as surplus |
| DC-7 | Two engines producing a Net Order Need | §44.4 — exactly one live owner (KMTPP residual) | Wiring `sumRemainingShortages` into the live monthly path |

---

## §6. Cross-company reallocation rule

Carried from §12 / §32 / §32A / §41 **unchanged**. The canonical form is feasibility-gated; the group-net
shorthand in §12 is the special case where every surplus is feasibly transferable.

```
Feasible Reallocation Qty(donor→receiver)
  = MIN(Receiver Remaining Shortage, Donor Remaining Surplus, Timely Transferable Qty)

Net Order Need = Σ (Remaining Shortage after all legal reallocation)
```

| Slot | Frozen value |
|---|---|
| `ELIGIBLE_DONOR` | a receiver holding `releasableSurplusQty = MAX(0, initialFactoryAllocationQty − protectedFactoryQty) > 0`, at an eligible source, in an actionable tier |
| `ELIGIBLE_RECEIVER` | same Master SKU · same planning cycle · actionable tier T1–T3 · the source is eligible to serve it (`eligibleFactoryWarehouseIds`, §13.1 source policy) |
| `DONOR_SAFETY_RULE` | a donor is **never** reduced below its own protected actionable T1–T3 requirement; only `releasableSurplusQty` may be donated (§41.4) |
| `ALLOCATION_ORDER` | initial allocation **precedes** reallocation (§41.3). Initial = KMMSA + R2G-B KMAR (live). Demand order = §35: earliest required-by → higher `allocation_priority` → stable destination key |
| `TWO_RECEIVER_SPLIT_RULE` | **NOT FROZEN — `DECISION_REQUIRED` (D-S5-1).** See §15 |
| `ROUNDING_RULE` | §43: ratio never truncated before multiplication; integer conversion is **FLOOR**; ROUND/CEIL/largest-remainder/remainder-redistribution forbidden for physical/committed supply; `Σ allocated ≤ available` never exceeded by one unit; residual may remain unallocated |
| `RESIDUAL_RULE` | `remainingShortageQty` after all legal reallocation → `KMTPP` residual → `KMCALC.calculateSuggestedOrderQty` carton CEILING (§14/§31) |

**Tier rule.** `donorRank ≤ receiverRank`, both > 0. An earlier/same-tier surplus may cover a same-or-later
shortage; **a later surplus never covers an earlier protected requirement.** T4 rank is 0 — excluded.

**Timely transfer, for current factory stock only.** Once `evaluateReallocationEligibility` returns
`eligible = true`, `timelyTransferableQty = donorRemainingReleasableSurplusQty` (§41.5A). This is an explicit
canonical pass-through — **not** Infinity, not a lead-time assumption, not shipment feasibility. The
orchestrator must not introduce route/carrier/lead-time math.

**Planning-only.** No physical reservation, deduction, movement, borrowing or ownership transfer.
`PHYSICAL_CROSS_COMPANY_RESERVATION_DEFERRED` stands. Physical conservation stays per-company; planning netting
never mutates a pool. This is **not** a generic optimizer and must not be expanded into one.

---

## §7. Factory / new-order decision

After reallocation the residual is either covered or it is not. What the system does with that is where S5's
genuine gap sits.

**What exists:** a residual quantity and a carton-rounded suggested quantity, per tier, per SKU, per site.

**What does not exist:** any classification of *which action* the residual calls for. There is no
`RECOMMENDATION_TYPE` enum in the action sense anywhere in the codebase; the only `recommendation_type` is the
**run** type `{ WEEKLY_SHIPPING, MONTHLY_ORDER }` (`recommendation_calculation_runs.recommendation_type`), which
is a different question and must not be overloaded.

```
RECOMMENDATION_TYPE enum = DECISION_REQUIRED (D-S5-2)   — proposed, NOT frozen:
                           { NO_ACTION, USE_OWN_SUPPLY, TRANSFER, USE_FACTORY_STOCK,
                             USE_COMMITTED_PRODUCTION, NEW_ORDER, MANUAL_REVIEW }
RECOMMENDED_QTY          = KMCALC.calculateSuggestedOrderQty(residualOrderNeedQty, unitsPerCarton)   [FROZEN]
SOURCE_COMPANY           = donor company                       (present in the §41 transfer ledger; not persisted)
SOURCE_WAREHOUSE         = donor sourceWarehouseId             (preserved as factoryBySource; not persisted)
DESTINATION_COMPANY      = gap row `company`                   [FROZEN]
DESTINATION_WAREHOUSE    = ledger `destinationWarehouseId`     [FROZEN]
REQUIRED_BY_DATE         = per-tier month → required-by         [FROZEN, §27A / KMTPP tierByMonth]
PLANNING_CYCLE           = YYYY-MM, Asia/Taipei                [FROZEN]
```

**No ranking and no automation is frozen here**, because no canonical rule ranks these outcomes. The ordered
chain §41.3 fixes the order in which *supply is consumed*; it does not say which *action* to recommend when
several remain possible. That ordering is `D-S5-3`.

---

## §8. Recommendation explainability

Every recommendation must be explainable. Minimum evidence, and its honest status today:

| Evidence field | Produced | Reaches the operator |
|---|---|---|
| `starting_gap_qty` | yes — `destinationGapQty` | yes — `tN_gap_qty` on the gap row |
| `own_supply_used` | yes — `composition.siteStockQty` | **no** — runtime DTO only |
| `cross_company_supply_used` | yes — `reallocationInQty` | yes — `reallocation_in_qty_snapshot` (FA-3B4-R1) |
| `factory_supply_used` | yes — `composition.allocatedFactoryQty` (post-reallocation) | partly — `factory_available_qty_snapshot` |
| `committed_supply_used` | yes — ongoing incoming events | **no** — no column; `qualified_incoming_snapshot` is the nearest and is not the same fact |
| `remaining_shortage` | yes — `residualOrderNeedQty` | implicitly, via `tN_suggested_qty` |
| `recommendation_qty` | yes | yes — `tN_recommended_qty` |
| `reallocation_out_qty` | yes | yes — `reallocation_out_qty_snapshot` |

```
WHY_THIS_RECOMMENDATION = DECISION_REQUIRED (D-S5-4) — no per-line reason token vocabulary exists
SOURCE_REFS             = demand `sourceRef` → `demandKey`; supply `supplyLineageRef`; §41 `transferLedger`   [produced, not persisted]
CALCULATION_RUN_ID      = recommendation_calculation_runs.calculation_run_id → draft `calculation_run_id`     [FROZEN]
INPUT_VERSION           = formula_version + source_data_as_of, captured from the read snapshots, never invented [FROZEN, SC-3]
```

**No opaque recommendation.** A recommendation whose evidence cannot be shown is a `MANUAL_REVIEW`, not a
quantity. `calculation_status = BLOCKED` with a `note` is the existing honest form of this, and a blocked line
must never be rendered as a zero.

---

## §9. Recommendation authority and states

**The state vocabulary is already frozen, and it is not the one the task proposes.** The live flat-V2 row
(`supply-planning-request-draft-v2.js:26-43`) carries per tier:

```
TIER_STATUS    = { draft, submitted, cancelled }
HEADER_STATUS  = { draft, partially_submitted, submitted, cancelled }
```

plus `tN_recommended_qty` · `tN_order_qty` · `tN_carton_qty` · `tN_user_edited` · `tN_user_edited_by` ·
`tN_submitted_by` · `tN_submitted_at` · `tN_note`, and at header level `generation_type ∈ { ai_plan,
user_created }` and `draft_version`.

Mapped onto the four authorities the task asks about:

| Authority | Where it lives | Rule |
|---|---|---|
| SYSTEM RECOMMENDATION | `tN_recommended_qty` | written once per generation; **never** back-filled from a user quantity |
| OPERATOR APPROVED QTY | `tN_order_qty` | defaults to the recommendation; independent thereafter |
| OPERATOR OVERRIDE | `tN_user_edited` + `tN_user_edited_by` | stamped on a deliberate quantity edit |
| FINAL EXECUTION QTY | the submitted `tN_order_qty` → Request Order line | partial cartons preserved end to end (§37) |

The §36.3 rule is absolute and S5 inherits it verbatim: **a user input never overwrites `recommended_qty`, and
re-displaying the live signal must never auto-revert `order_qty` to the system value.**

Reconciliation with the task's proposed vocabulary (informative only — **not** a rename proposal):

```
PROPOSED   ≈ tN_status = draft, tN_recommended_qty > 0, tN_user_edited = false
APPROVED   ≈ tN_order_qty set by the operator, still draft
OVERRIDDEN ≈ tN_user_edited = true  (order_qty ≠ recommended_qty)
REJECTED   ≈ tN_order_qty = 0  (tier excluded from the Send workset) or tN_status = cancelled
SUPERSEDED ≈ a new draft_version, or a new planning_cycle (a new month never overwrites a prior month)
EXECUTED   ≈ tN_status = submitted  (+ submitted_by / submitted_at)
```

**Renaming the frozen vocabulary to the proposed one is `D-S5-5`** and is *not recommended* — it would rewrite a
live 53-column schema, its writers, its readers and its migration for a naming preference.

---

## §10. Database model

```
EXISTING_TABLES_REUSABLE = YES (for the decision snapshot and the run journal)
NEW_TABLE_REQUIRED       = NO  (for S5-R1 scope)  ·  CONDITIONAL YES if D-S5-2 and D-S5-4 are adopted
DB_MIGRATION_REQUIRED    = NO
```

**Reusable, and already the right shape:**

| Table | Role | Why it is not overloaded |
|---|---|---|
| `order_planning_gap` | calculation evidence (latest result per key) | not an execution artifact; UPSERT of the latest gap |
| `recommendation_calculation_runs` | run journal / lineage — `calculation_run_id`, `recommendation_type`, `planning_cycle`, `business_scope_key`, `draft_version`, `run_status`, `current_stage`, `formula_version`, `source_data_as_of`, attempt/actor/timestamps | purpose-built for exactly this |
| `request_order_allocation_drafts` (flat V2, 53 col) | the **decision** snapshot + provenance pointer | §44.19 deliberately stripped it to decision + provenance; calculation evidence stays in the two above |

**Deliberately NOT overloaded**, per the task and per §44.19: `request_order_allocation_draft_lines`
(`DEPRECATED_PENDING_MIGRATION`), `request_orders` / `request_order_lines`, `purchase_orders` /
`purchase_order_lines`, and every shipment table. These are execution artifacts.

**What a recommendation *action* layer would need — proposed schema only, NOT created, NOT migrated.**
Required only if `D-S5-2` (action enum) and/or `D-S5-4` (reason vocabulary) are adopted. The smallest honest
shape is **additive columns on the existing flat-V2 row**, not new tables — the decision grain is already
one row per `(cycle, company, country, marketplace, sku)` with three tiers:

| FIELD | TYPE | NULLABILITY | OWNER | SOURCE | MUTABILITY | AUDIT |
|---|---|---|---|---|---|---|
| `tN_recommendation_type` | enum (D-S5-2) | NOT NULL when `tN_recommended_qty` present | recommendation engine | derived at generation | immutable within a `draft_version` | carried by `calculation_run_id` |
| `tN_recommendation_reason` | short token list (D-S5-4) | nullable | recommendation engine | derived at generation | immutable within a `draft_version` | as above |
| `tN_own_supply_used` | integer ≥ 0 | nullable (missing ≠ 0) | KMTPP opening composition | `composition.siteStockQty` | immutable | transported, never recomputed |
| `tN_committed_supply_used` | integer ≥ 0 | nullable (missing ≠ 0) | KMOOR ongoing incoming | ongoing events for the tier | immutable | transported, never recomputed |

If adopted, these transport through the same gap-row path the §41 columns already use
(`OP_GAP_FACTORY_SNAPSHOT_COLS_` precedent: additive at the end, name-based readers, order-agnostic, live-sheet
migration via `prodMigrateAppendColumns_`). A new `recommendation_lines` table is **not** recommended — it would
split the decision grain across two tables immediately after §44.19 deliberately flattened it.

**No migration is performed or authorized by this round.**

---

## §11. Idempotency and versioning

```
RUN_ID                       = recommendation_calculation_runs.calculation_run_id
CALCULATION_RUN_ID ↔ DRAFT   = stamped onto the draft row as `calculation_run_id`; the draft points at the run, never the reverse
INPUT_SNAPSHOT               = formula_version + source_data_as_of, captured from the read pass; one `sourceDataAsOf` per generation, never invented (SC-3.1)
RE-RUN_BEHAVIOR              = deterministic identity `RD::MONTHLY_ORDER::<YYYY-MM>::<sorted scopeKey>`; a re-run UPSERTs the same row and bumps `draft_version` under the optimistic token
SUPERSEDE_BEHAVIOR           = a new `draft_version` supersedes within a cycle; a new `planning_cycle` never overwrites a prior month's draft (§36.2)
HISTORICAL_DECISION_MUTATION_ALLOWED = NO
```

Three existing protections make the last line enforceable, and S5 adds none:

- **§36.1** — a changed live signal must not overwrite an existing draft's `recommended_qty`, the user's
  `order_qty` or `carton_qty`, and must not mutate any sent/approved/PO-converted historical quantity.
- **§SC-1.11** — submitted-draft immutability.
- **PO-10** — user-edit detection and protection via the `{draft_version, userEditFingerprint}` token.

A recommendation run is reproducible from the canonical tables plus the run journal; the OUTPUT snapshot is
already immutable per `draft_version`. Frozen *input* snapshots (Option B of the source contract) remain a
deliberate future upgrade, not a Phase-1 requirement.

---

## §12. Downstream boundary

**S5 does not create a final Purchase Order or a Shipment.** It stops at a persisted, operator-editable
decision row.

```
S5_OUTPUT_CONTRACT = one flat-V2 request_order_allocation_drafts row per
                     (planning_cycle, company, country, marketplace, sku, draft_purpose),
                     carrying per tier T1..T3:
                       tN_month, tN_recommended_qty, tN_order_qty, tN_carton_qty,
                       tN_status, tN_user_edited, tN_note
                     plus provenance: calculation_run_id, formula_version, calculated_at,
                       source_data_as_of, units_per_carton, generation_type, draft_version
```

```
DRAFT_ALLOCATION_INPUT_MAPPING
  gap row tN_gap_qty        ─► (KMTPP residual, already applied) ─► tN_recommended_qty
  gap row tN_month          ─► tN_month
  gap row calculation_month ─► planning_cycle (YYYY-MM)
  sku_details.units_per_carton ─► units_per_carton
  run journal calculation_run_id / formula_version / source_data_as_of ─► provenance columns
  scope (company,country,marketplace,sku,draft_purpose) ─► deterministic draft identity

REQUEST_ORDER_INPUT_MAPPING   (Send Request — S7, NOT implemented by S5)
  tN_order_qty > 0          ─► one request_order_lines row per tier
  tN_order_qty = 0          ─► tier EXCLUDED from the Send workset; draft stays ACTIVE and keeps its month
  tN_carton_qty             ─► carton qty, partial-carton override preserved and never re-rounded
  units_per_carton missing  ─► Suggested BLOCKED and Send BLOCKED; no silent default (§14/§34)
```

**Draft-creation boundary carried unchanged** (`REQUEST_ORDER_ALLOCATION_DRAFT_CREATION_BOUNDARY.md`): AI Plan
is the initial/default source but not the exclusive one; a deliberate user quantity edit also creates or updates
the canonical draft, at edit time and not at Send; Send consumes persisted drafts only; a `RAD-M-…` identity is
never minted again; a note-only edit creates nothing.

No downstream write is implemented, authorized or designed here. That is S7.

---

## §13. Manual / auto boundary

```
SYSTEM CALCULATES · OPERATOR DECIDES · DOWNSTREAM EXECUTION IS EXPLICIT

AUTO_CREATE_REQUEST_ORDER = NO
AUTO_CREATE_PO            = NO
AUTO_CREATE_SHIPMENT      = NO
```

**May run automatically:** gap materialization on its schedule (`44_gap_materialization_scheduler.gs`,
`runDailyOrderPlanningGapMaterialization`); recommendation generation into a **draft**; re-generation that
bumps `draft_version` without touching a user quantity.

**Requires an operator:** every quantity that leaves the draft layer. Send Request, approval, PO creation, and
every shipping-mainline transition.

**§41.10 is inherited verbatim:** the recommendation is advisory. Even when Suggested Order = 0 because planning
surplus covered the shortage, the operator may still enter an Order Qty. The engine must not disable the input,
overwrite a user quantity, or force acceptance. **User-approved `order_qty` remains the transaction authority.**

---

## §14. UI model (minimum — no redesign)

The live Order Planning workspace (`assets/js/pages/request-order.js`) already carries the first layer and the
second-level per-SKU detail; S4-R7 froze how that detail is prepared. S5 adds **no** new page and no new read.

```
RECOMMENDATION_LIST_ROW  = sku · company/country/marketplace · tier month ·
                           gap qty · own-supply coverage · cross-company coverage ·
                           factory coverage · residual · recommended action* · recommended qty ·
                           order qty (editable) · approval state
RECOMMENDATION_DETAIL    = the per-tier evidence of §8 + lineage refs + calculation_run_id +
                           formula_version + source_data_as_of + blocked reason when BLOCKED
DECISION_ACTIONS         = edit order qty · set 0 (exclude tier) · note · submit (Send Request) · cancel tier
```

`*` **recommended action is blocked on `D-S5-2`.** Until that enum is frozen the column must not be rendered —
an action label invented by the UI would become a second authority.

Two display rules are inherited and are not S5's to change: a `BLOCKED` line shows
`Calculation Blocked / Manual Review Required`, never a zero; and a missing value is never drawn as 0.

---

## §15. Decision gate

```
DECISION_REQUIRED_COUNT = 6
```

No S5 implementation may proceed around any of these. Each is genuinely unowned — verified by searching the
canonical specs, not assumed.

---

### D-S5-1 — Two-receiver split of a shared surplus

**QUESTION.** When one donor surplus can feasibly serve **two or more** receivers whose combined remaining
shortage exceeds it, how is it divided?

*Searched and not found:* no "split between two", minimum-transfer or receiver-proration rule exists in any
canonical spec. §12's worked example nets a group total and never divides a donor across receivers; §41 fixes
donor protection and per-pair feasibility but not contention between receivers.

| | |
|---|---|
| **OPTION A** | **Deterministic priority order — serve receivers in full, in §35 order** (earliest required-by → higher `allocation_priority` → stable destination key) until the surplus is exhausted. The last receiver may be partly served; later ones get nothing. |
| **OPTION B** | **Proportional split by remaining shortage**, integer-converted by §43 FLOOR with the residual retained. Every contending receiver gets a share; none is made whole. |
| **OPTION C** | **Proportional by forecast/demand weight** (the §7/§24.5 `demandWeight` basis), FLOOR per §43. |

**BUSINESS_EFFECT.** A protects the most urgent site and produces whole, shippable coverage for it; the loser
orders. B spreads thin coverage everywhere and can leave *every* site short enough to still need an order,
raising total ordering. C follows commercial weight rather than urgency.
**SYSTEM_EFFECT.** A reuses the §35 ordering already implemented and adds no arithmetic. B and C add a
proportional step and inherit §43 FLOOR + residual, so `Σ transferred ≤ surplus` still holds.
**RECOMMENDATION — Option A.** It is the only option that requires no new formula, it matches the ordering the
rest of the engine already uses, and partial coverage of an urgent tier is the outcome the carton rules
(§31 FLOOR for shipment, CEILING for order) are already built around.

---

### D-S5-2 — Recommendation action enum

**QUESTION.** Should a recommendation carry *what to do*, not only *how much*?

*Searched and not found:* no action enum exists. `API_RECOMMENDATION_WORKSPACE_SPEC.md` explicitly forbids
`ORDER/TRANSFER/BORROW/NO_ACTION` in its response today.

| | |
|---|---|
| **OPTION A** | **Freeze the enum and derive it** from facts the engine already has: `NO_ACTION` (residual 0, no coverage used) · `USE_OWN_SUPPLY` · `TRANSFER` (cross-company reallocation in) · `USE_FACTORY_STOCK` · `USE_COMMITTED_PRODUCTION` · `NEW_ORDER` (residual > 0 after all coverage) · `MANUAL_REVIEW` (`BLOCKED`). Derived, not stored, in R2; stored only if the UI needs to filter on it. |
| **OPTION B** | **Keep quantity-only.** The operator infers the action from the coverage columns. |
| **OPTION C** | Freeze the enum but as **multi-label** (a line may be both `USE_FACTORY_STOCK` and `NEW_ORDER` when coverage is partial). |

**BUSINESS_EFFECT.** A/C make the workspace answer "what am I being asked to do"; B leaves that to the reader.
Partial coverage is the common case, which is what makes C tempting and A lossy at the margin.
**SYSTEM_EFFECT.** A is derivable from existing facts with no new input. C needs a label-set representation and
a UI that renders more than one. B needs nothing.
**RECOMMENDATION — Option A, derived only.** Freeze the vocabulary in R2 so nothing else invents one, compute
it from existing facts, and do not add a column until a workspace actually filters on it.

---

### D-S5-3 — Residual outcome ordering

**QUESTION.** When a residual could be met by more than one remaining source, which is recommended first?

*Searched and not found:* §41.3 fixes the order supply is **consumed** (initial allocation → protect →
releasable surplus → reallocation → residual). It does not rank what to *recommend* when, for example,
committed production and a new order could both cover a T3 residual.

| | |
|---|---|
| **OPTION A** | **Consumption order is the recommendation order** — whatever §41.3 leaves uncovered is `NEW_ORDER`. No new ranking. |
| **OPTION B** | An explicit **cost/lead-time preference** (e.g. prefer existing committed production over a new order even when it lands later). |

**BUSINESS_EFFECT.** A never recommends against the engine's own arithmetic. B could reduce new orders but
needs a cost or lead-time authority that does not exist — `55_` returns a SKU-scalar lead time only, with no
origin/destination grain.
**SYSTEM_EFFECT.** A adds nothing. B requires a new authority and would be a second decision engine.
**RECOMMENDATION — Option A.** B is not implementable today without inventing the authority it depends on.

---

### D-S5-4 — Reason token vocabulary

**QUESTION.** Does `WHY_THIS_RECOMMENDATION` become a closed token set, or free text?

| | |
|---|---|
| **OPTION A** | **Closed token set**, e.g. `GAP_FROM_FORECAST` · `COVERED_BY_OWN_STOCK` · `COVERED_BY_TRANSFER` · `COVERED_BY_FACTORY` · `COVERED_BY_COMMITTED` · `RESIDUAL_REQUIRES_ORDER` · `BLOCKED_MISSING_UPC` · `BLOCKED_MISSING_FORECAST`. Machine-checkable, translatable, testable. |
| **OPTION B** | Free-text note per line. |
| **OPTION C** | No reason field — the evidence numbers of §8 are the explanation. |

**BUSINESS_EFFECT.** A is auditable and can be filtered; B reads better but cannot be checked; C is honest but
makes the operator do the arithmetic.
**SYSTEM_EFFECT.** A extends the existing `note` / blocked-reason token discipline already used
(`RECOMMENDATION_LINE_NOT_FOUND`, `ONGOING_ORDER_ETA_UNRESOLVED`). B needs no schema but no guard either.
**RECOMMENDATION — Option A**, reusing the existing blocked-reason token style, with `note` left to the
operator. Do not mix system reasons into the operator's `note` field.

---

### D-S5-5 — Decision state vocabulary

**QUESTION.** Keep the frozen flat-V2 vocabulary, or rename to
`PROPOSED / APPROVED / OVERRIDDEN / REJECTED / SUPERSEDED / EXECUTED`?

| | |
|---|---|
| **OPTION A** | **Keep** `draft / submitted / cancelled` + `user_edited` + `draft_version`. The six proposed states already map onto it (§9). |
| **OPTION B** | Rename to the proposed vocabulary. |

**BUSINESS_EFFECT.** Identical — the same distinctions are representable either way.
**SYSTEM_EFFECT.** B rewrites a live 53-column schema, its writers, readers, the V2 cutover flag and a sheet
migration, for a naming preference, and would break the `RD::MONTHLY_ORDER::…` identity round-trip tests.
**RECOMMENDATION — Option A, strongly.**

---

### D-S5-6 — Recommendation expiry

**QUESTION.** Does a recommendation go stale, and if so what happens to an un-actioned one?

*Searched and not found:* no expiry, TTL or staleness rule exists for a recommendation anywhere. The cadence is
monthly and a new cycle creates a new draft, but nothing marks last month's un-actioned draft as expired.

| | |
|---|---|
| **OPTION A** | **No expiry.** A draft stays actionable until submitted or cancelled; a new cycle simply creates a new draft alongside it. (This is today's behaviour.) |
| **OPTION B** | **Auto-supersede at cycle rollover** — when cycle M+1 generates, an un-actioned M draft moves to `cancelled` with a reason. |
| **OPTION C** | **Flag, do not mutate** — mark it stale for display, leave the row alone. |

**BUSINESS_EFFECT.** A can leave a months-old quantity submittable against a gap that no longer exists. B is
tidy but mutates a historical decision row, which §11 forbids. C warns without mutating.
**SYSTEM_EFFECT.** A: none. B: conflicts with `HISTORICAL_DECISION_MUTATION_ALLOWED = NO` unless an explicit
carve-out is written. C: a derived display flag, no schema change.
**RECOMMENDATION — Option C.** It gives the operator the warning without breaking the immutability rule this
document just froze.

---

## §16. Non-goals for S5-R1 (and what this round did not do)

Not done, by instruction and in fact: no recommendation runtime implemented · no PO created · no Shipment
created · no Forecast recomputed · no materialized Gap recomputed · no R9A demand/supply ledger semantics
changed · no AI/LLM introduced as a calculation authority · marketplace not used as a supply-pool key · no
reserved stock silently consumed · no company boundary silently crossed · no DB migrated · no schema changed ·
no Apps Script touched · no bundle rebuilt.

The pre-existing A0 §G.9 operator-label violation at `carrier-rate-card.js:840` is untouched — it is not a
runtime or business defect and no file this round changed goes near it.

---

**End of contract.** `S5_CONTRACT_FREEZE_READY = YES` for the frozen sections; the six §15 decisions gate
S5-R2.
