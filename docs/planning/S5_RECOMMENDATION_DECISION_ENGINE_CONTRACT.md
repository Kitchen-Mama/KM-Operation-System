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

> **SUPERSEDED BY PART II (S5-R2, 2026-09-28).** Five of these six are now operator-resolved and frozen in
> Part II §21. **D-S5-1 is NOT resolved** — the operator's stated rule conflicts with live implemented
> behaviour, measured in Part II §18. The options and reasoning below are retained as the record of what was
> asked; Part II is authoritative for what was decided.
>
> **D-S5-1's premise below is CORRECTED in Part II §18.** It states that no owner "arbitrates between two
> eligible receivers competing for the same surplus". That is wrong: `KMFSR.runReallocation` arbitrates, by a
> deterministic receiver ordering, and has been live since FA-3B3b. S5-R1 read §41's prose, which fixes donor
> protection and per-pair feasibility, and did not read the loop, which encodes the contention rule the prose
> never spells out.

```
DECISION_REQUIRED_COUNT = 6   (at S5-R1; now 1 — see Part II §21)
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

# PART II — S5-R2 decision freeze (2026-09-28)

**Status: FIVE OF SIX DECISIONS FROZEN · ONE CONTRACT CONFLICT, STOPPED.**
Spec-only. `BEHAVIOR_CHANGED = NO`. Base `a119b62`.

Part II is authoritative over Part I §15 wherever they differ.

---

## §17. Carried unchanged from Part I

```
RECOMMENDATION_RECOMPUTES_FORECAST      = NO
RECOMMENDATION_RECOMPUTES_GAP           = NO
OVERSEAS_COVERAGE_DOUBLE_SUBTRACTION    = FORBIDDEN
FACTORY_COVERAGE_DOUBLE_SUBTRACTION     = FORBIDDEN
SHIPPING_REQUIRED_QTY_IS_PURCHASE_DEMAND = NO
SHIPMENT_PLAN_AUTO_CREATES_REQUEST_ORDER = NO      SHIPMENT_PLAN_AUTO_CREATES_PO = NO
PURCHASE_ORDER_QTY_AUTO_CREATES_SHIPMENT = NO      REQUEST_ORDER_QTY_AUTO_CREATES_SHIPMENT = NO
PHASE2_ORCHESTRATION_IMPLEMENTED         = NO
```

The two-sided double-count guard (Part I §5 DC-1) is re-run by the S5-R1 suite each round: the fold into
opening supply must exist, and the residual must not re-subtract it. Both green at `a119b62`.

Full ordering ↔ lead-time ↔ shipping orchestration remains Phase 2 and is not designed here.

---

## §18. D-S5-1 — CONTRACT CONFLICT (STOPPED, not frozen)

> **DISCHARGED BY PART III §31 (S5-R2A).** The operator resolved this in favour of the live policy:
> `D_S5_1_DONOR_CONTENTION = SEQUENTIAL_GREEDY`, frozen. The 50/50 split is rejected and is not a supported
> branch. This section is retained as the record of why the decision was re-put — the measurement below is
> what made the conflict visible — and is no longer a STOP.

**The operator's §3 rule contradicts live, implemented, wired behaviour.** Part I raised D-S5-1 on a premise
that was wrong, so the decision was taken without this on the table. Correcting it is the substance of this
section.

### What Part I got wrong

Part I §15 stated that §32A fixes per-pair eligibility and §41 fixes donor protection, *"but neither
arbitrates between two eligible receivers competing for the same surplus."* **That is false.**
`KMFSR.runReallocation` (`supply-planning-surplus-reallocation.js:169-231`) arbitrates explicitly:

```
receiverOrder = actionable sorted by requiredByDate asc -> allocationPriority desc -> demandKey asc
donorOrder    = actionable sorted by requiredByDate asc -> demandKey asc

for each receiver in receiverOrder:
    for each donor in donorOrder, while receiver shortage > 0:
        transfer MIN(receiverRemainingShortage, donorRemainingSurplus, timelyTransferableQty)
```

That is a **sequential greedy: serve each receiver in full, in a deterministic order**, over **N** receivers —
not two. It is live: `43_:762` calls `gapOpApplyFactorySurplusReallocation_`, which calls
`KMFSR.reallocatePreallocatedFactorySupply` (`43_:557`), landed by FA-3B3b.

S5-R1 read §41's prose, which fixes donor protection and per-pair feasibility, and did not read the loop —
where the contention rule actually lives and which the prose never states.

### The divergence, measured

The live module was executed against the operator's own three examples
(`s5-r2-decision-freeze.test.js` §C):

| Case | Operator rule (§3) | Live KMFSR (§41) | Agree |
|---|---|---|---|
| donor 100 · A 100 · B 100 | **50 / 50** | **100 / 0** | **NO** |
| donor 100 · A 20 · B 100 | 20 / 80 | 20 / 80 | yes |
| donor 100 · A 20 · B 30 | 20 / 30 (50 unused) | 20 / 30 (50 unused) | yes |

The two agreements are **coincidental to the shape, not structural**. Case 3 has no contention at all (donor
exceeds combined gap). Case 2 agrees only because A's gap is below its 50% share, so both rules give A its
whole gap and B the remainder. **The rules differ exactly where contention is real** — donor surplus below
combined receiver gap with both gaps above half — which is precisely the case §3 exists to legislate.

### What the two rules mean commercially

Both conserve supply and neither over-allocates; they answer a genuine business question differently.

- **Live (serve in full, most urgent first).** One receiver gets shippable, whole coverage; the other orders.
  Consistent with the carton rules the rest of the engine is built around (§31 FLOOR for shipment, CEILING for
  order), and with §35's ordering used everywhere else.
- **Operator §3 (share 50/50, cap, redistribute).** Both receivers get partial coverage. Under scarcity this
  can leave *both* sites short enough to still require an order, raising total ordering rather than lowering
  it — the outcome Part I §15 flagged as the risk of the proportional options.

### Also in tension: §43.4

§43.4 forbids *"largest-remainder / remainder redistribution"* for physical or committed supply *"unless a
separately frozen rule explicitly overrides this section."* Step 3 of §3 redistributes an uncapped share. This
is a **capacity** remainder, not a *rounding* remainder, so it is arguably outside §43.4's subject — but it is
close enough that adopting §3 must record an explicit, named override rather than leave the reader to decide.
Whichever way D-S5-1 resolves, §43.3 FLOOR still governs the integer conversion of the 0.5 ratio
(`FLOOR(donor x 0.5)`), and §43.5/§43.6 still bound the result and permit an unallocated residual.

### §18a — the rule is also under-specified for odd quantities

Found by executing it. With donor 101 and two gaps of 100, §43.3 FLOOR gives each receiver
`FLOOR(101 x 0.5) = 50`, leaving one unit. Step 3 then redistributes that unit — **to whichever receiver the
implementation reaches first.** §3 gives no receiver ordering, so the destination of the odd unit is an
artefact of iteration order, not a decision.

This is not a rounding question (§43 answers that) but an **ordering** question, and it is the same gap that
makes §3 silent at 3+ receivers: a proportional rule needs a tie-break, and the live greedy already has one
(`requiredByDate` asc -> `allocationPriority` desc -> `demandKey` asc). Whichever way D-S5-1 resolves, if §3 is
adopted it must name its receiver ordering, or two runs on the same data can differ by a unit.

### Why this is not frozen here

Part I's §6 gate is explicit: *"If Recommendation ordering differs from the live consumption order: STOP —
CONTRACT_CONFLICT."* It does. Freezing §3 as written would specify a **behaviour change to a live, tested,
production-wired allocator** inside a round whose own mandate is `BEHAVIOR_CHANGED = NO`, and would do it on a
premise the operator was given incorrectly.

```
D_S5_1_DONOR_CONTENTION = CONTRACT_CONFLICT — OPERATOR DECISION REQUIRED
```

**OPTION A — keep the live greedy.** No code changes, no regression, N receivers already covered. §3's
worked examples 2 and 3 already hold; only the symmetric-contention case differs. This is what Part I
recommended, and it is already the system's behaviour.

**OPTION B — adopt §3's 50/50 share.** Requires changing `KMFSR.runReallocation`, a frozen §41 core with 270 +
99 existing assertions, re-validating FA-3B3b's live wiring, and recording an explicit §43.4 override. It also
leaves 3+ receivers undefined (§19), so it must either stop at 2 or define N.

**OPTION C — split by residual gap rather than 50/50.** Generalises to N without a special case and needs no
"exactly two" rule, but is a larger change than B and still supersedes the live allocator.

**RECOMMENDATION — Option A**, and if the operator wants sharing under scarcity, take it as its own slice with
its own regression budget against §41, not as a spec clause inside a no-behaviour-change round.

---

## §19. Receiver-count behaviour — already owned

The task asks to freeze `eligible_receiver_count > 2 -> MANUAL_REVIEW` *"unless another existing canonical
spec already defines it."* **One does, and it is implemented.**

Executed: donor 100, three receivers with gaps 100/100/100 -> live KMFSR returns `{A:100, B:0, C:0}` — a
deterministic answer, no error, no manual-review path.

```
ZERO_RECEIVER_RULE       = no reallocation                       [frozen, §41 — no actionable receiver, no transfer]
ONE_RECEIVER_RULE        = may consume up to its full residual gap from eligible donor surplus   [frozen, §41/§32A]
TWO_RECEIVER_RULE        = CONTRACT_CONFLICT (§18)
THREE_PLUS_RECEIVER_RULE = ALREADY OWNED by KMFSR.runReallocation (deterministic sequential greedy over N)
```

```
THREE_PLUS_RECEIVER_BEHAVIOR = ALREADY_DEFINED — NOT MANUAL_REVIEW
MORE_THAN_TWO_RECEIVER_POLICY = OWNED BY §41 (live), NOT newly frozen here
```

**Specifying `MANUAL_REVIEW` at 3+ would be a regression**, not a guard: it would withdraw a working,
deterministic, tested answer and replace it with a stop. Recorded explicitly because the instruction's
default, applied without checking, would have done exactly that.

---

## §20. D-S5-1 §4 — donor safety, from existing owners only

All three quantities already have owners. None is invented here.

```
DONOR_AVAILABLE_QTY = releasableSurplusQty = MAX(0, initialFactoryAllocationQty - protectedFactoryQty)
                      [§41.4; implemented supply-planning-surplus-reallocation.js:126-127]

DONOR_SAFETY_FLOOR  = protectedFactoryQty  = MIN(initialFactoryAllocationQty, projectedRequirementQty)
                      [§41.4; implemented :126]  — a REQUIREMENT floor, not a safety-stock policy

DONOR_ALREADY_ALLOCATED_QTY = sourceSurplusRemaining[donor][warehouse], decremented once per transfer
                      [§41.9(5); implemented :212-215]
```

**A safety-stock policy for factory donors is `NOT_DEFINED`, and none is invented.** The 18-day survival floor
(§20.3/§24.4) governs *overseas shared-pool* allocation; it is not a factory donor protection and must not be
borrowed as one. What protects a factory donor is its own actionable T1–T3 requirement, nothing more.

Never consumable as donor surplus, each with its existing owner:

| Not consumable | Owner |
|---|---|
| reserved stock | availability is `MAX(fac_current_stock - fac_reserved_stock, 0)` (§13.1) — reserved is outside the pool |
| receiver-required stock | `protectedFactoryQty` (§41.4) — a donor is never reduced below its own requirement |
| already-allocated supply | per-source remaining decremented once per transfer (§41.9(5)) |
| same lineage twice | `supplyLineageRef` count-once; duplicate -> `SUPPLY_LINEAGE_CONFLICT`, effective qty 0 (§42.1) |
| delivered-not-received as current stock | distinct active bucket (§39.5/§44.5) |
| ineligible lifecycle bucket | `DRAFT` / `CANCELLED_INVALID` / `CORRECTION_REVERSAL` contribute 0 (§42.1) |
| unallocated physical residual | §43.6 — residual is NOT receiver-attributed releasable surplus; live path passes `unusedFactorySupplyQty = 0` |
| T4 / out-of-window | visibility-only, rank 0, excluded (§41.5) |

```
UNALLOCATED_SURPLUS_RULE = stays unallocated; never redistributed as donor surplus (§43.6)
```

---

## §21. Decisions frozen

> **SUPERSEDED BY PART III §39.** All six are now frozen and `UNRESOLVED_DECISION_COUNT = 0`.

```
D_S5_1_DONOR_CONTENTION = CONTRACT_CONFLICT — NOT FROZEN (§18)   [superseded: FROZEN, Part III §31]
D_S5_2_RECOMMENDATION_ACTION = FROZEN (§22)
D_S5_3_PRIORITY              = FROZEN (§23)
D_S5_4_EXPLAINABILITY        = FROZEN (§24)
D_S5_5_STATE                 = FROZEN — STATE_VOCABULARY_CHANGED = NO
D_S5_6_STALENESS             = FROZEN — DISPLAY_FLAG_ONLY

UNRESOLVED_DECISION_COUNT = 1
```

**D-S5-5.** The canonical model is unchanged: tier `draft | submitted | cancelled`, header
`draft | partially_submitted | submitted | cancelled`, plus `user_edited`, `user_edited_by`, `draft_version`.
No second recommendation lifecycle is introduced. A UI concept such as "approved" maps onto existing
semantics (an operator-set `tN_order_qty` on a `draft` tier) and must not become a competing status without a
separate operator decision.

**D-S5-6.** `STALE_RECOMMENDATION_BEHAVIOR = DISPLAY_FLAG_ONLY`. A recommendation may be presented as
`CURRENT` or `STALE`. Staleness is **derived at read time** — it is not a stored status, so it cannot collide
with the frozen vocabulary.

```
STALE_MUTATES_RECOMMENDATION     = NO
STALE_MUTATES_OPERATOR_DECISION  = NO
HISTORICAL_MUTATION_ALLOWED      = NO
```

Staleness must never cancel, rewrite, resubmit, change a quantity, change an operator decision, or change
historical run contents. This is enforceable today by three existing protections and needs no new one:
§36.1 (a changed live signal never overwrites a draft), §SC-1.11 (submitted-draft immutability), and PO-10
(the `{draft_version, userEditFingerprint}` token).

---

## §22. D-S5-2 — recommendation action (FROZEN)

```
RECOMMENDATION_TYPE_ENUM = { REALLOCATE, NEW_ORDER, NO_ACTION, MANUAL_REVIEW }
```

Closed set of four. **No shipment action** — that is the other mainline (§17). **No factory action**: factory
quantities exist upstream as *coverage*, and coverage is not an operator instruction. Whether coverage came
from own stock, overseas, factory or committed production is **evidence** (§24), not a separate action.

```
ACTION_DERIVATION_RULE  (evaluated in order; first match wins; derived, never stored in this round)

  MANUAL_REVIEW  <-  the engine cannot truthfully derive a deterministic action under frozen rules.
                     Today exactly: calculation_status = BLOCKED (missing units_per_carton, missing forecast
                     basis, SUPPLY_LINEAGE_CONFLICT, an unresolved destination), or any input the frozen rules
                     do not determine. A BLOCKED line is MANUAL_REVIEW and is never rendered as a zero.

  REALLOCATE     <-  reallocation_in_qty > 0 for this line — cross-company/internal reallocation is part of
                     how this line's residual was reduced.

  NEW_ORDER      <-  residualOrderNeedQty > 0 after all already-authoritative eligible supply logic.

  NO_ACTION      <-  residualOrderNeedQty = 0 and reallocation_in_qty = 0 — no actionable residual remains.
```

`REALLOCATE` is tested before `NEW_ORDER` deliberately: a line may need both, and the reallocation is the part
that requires an internal movement decision, whereas the residual is already carried by `recommendation_qty`.
A line that reallocates **and** still has a residual is `REALLOCATE` with a non-zero `recommendation_qty`, and
its `reason_tokens` carry `RESIDUAL_SHORTAGE` and `NEW_ORDER_REQUIRED` (§24) — so no information is lost by
the single-label enum.

**Store nothing yet.** The action is derivable from facts already produced; §25 confirms no column is needed.

---

## §23. D-S5-3 — priority (FROZEN)

```
RECOMMENDATION_PRIORITY  = EXISTING_CANONICAL_CONSUMPTION_ORDER
CONSUMPTION_ORDER_OWNER  = SUPPLY_PLANNING_CALCULATION_RULES.md §44.6 (live operation order),
                           composed with §41.3 (reallocation chain)
```

```
CONSUMPTION_ORDER  (§44.6, verbatim sequence)
  1  demand / gross gap
  2  opening Site/Destination supply
  3  Overseas coverage
  4  KMMSA / KMAR initial factory allocation
  5  §41 KMFSR surplus reallocation over the already-allocated coverage
  6  KMOOP/KMOTA ongoing-order site supply -> KMTPP incoming
  7  shipment ETA incoming
  8  KMTPP.projectTimePhasedSupply
  9  residualOrderNeedQty
 10  carton CEILING
 11  persistence
```

Steps 4–7 are composed as KMTPP opening/incoming inputs, **not** as a second residual formula. §41.3 fixes the
chain inside step 5: initial allocation -> protect the receiver's own requirement -> releasable surplus ->
legal reallocation -> remaining shortage.

**The recommendation creates no second optimization order.** It reports the outcome of this one. The only
place where a recommendation ordering could diverge is receiver contention inside step 5 — which is exactly
§18, and is why §18 is a STOP rather than a freeze.

---

## §24. D-S5-4 — explainability (FROZEN)

```
EXPLANATION_MODEL      = CLOSED_REASON_TOKENS + NUMERIC EVIDENCE + LINEAGE REFERENCES
FREE_TEXT_IS_AUTHORITY = NO
```

The operator `note` field stays free text and stays the operator's. **No business behaviour may read it.**

```
REASON_TOKEN_SET  (closed; derived from the actual branches of §22, one per branch plus evidence states)
  OWN_SUPPLY_APPLIED          opening site stock reduced this line's gap            (own_supply_used > 0)
  OVERSEAS_SUPPLY_APPLIED     allocated overseas coverage reduced it                (allocatedOverseasQty > 0)
  FACTORY_SUPPLY_APPLIED      allocated factory coverage reduced it                 (factory_supply_used > 0)
  COMMITTED_SUPPLY_APPLIED    ongoing-order incoming reduced it                     (committed_supply_used > 0)
  CROSS_COMPANY_REALLOCATION  donor surplus was reallocated in                      (reallocation_in > 0)
  RESIDUAL_SHORTAGE           a residual remained after all coverage                (residual > 0)
  NEW_ORDER_REQUIRED          that residual cartonizes to a positive order          (recommendation_qty > 0)
  NO_ACTION_REQUIRED          nothing actionable remained
  MANUAL_REVIEW_REQUIRED      the action could not be truthfully derived
```

Every token is **evidence-backed**: each is emitted only when its cited numeric field supports it, so a token
can never claim something the numbers do not. A token whose evidence field is unavailable is **not emitted** —
absence is honest, a fabricated token is not.

```
NUMERIC_EVIDENCE_FIELDS = starting_gap_qty · own_supply_used · cross_company_supply_used ·
                          factory_supply_used · committed_supply_used (where genuinely available) ·
                          remaining_shortage · recommendation_qty
SOURCE_LINEAGE_FIELDS   = calculation_run_id · demand sourceRef -> demandKey · supplyLineageRef ·
                          §41 transferLedger (sourceWarehouseId, donorDemandKey, receiverDemandKey, qty)
```

**Do not populate a number that cannot be sourced truthfully.** `MISSING` is never `0` (SC-2); a field with no
honest source is null and its token is absent.

---

## §25. Evidence field audit (§8) — computed vs emitted

Traced through the live path. `SAFE_TO_EXPOSE` means transport-only: the value already exists upstream and is
carried, **never recomputed downstream**.

| Field | COMPUTED | CURRENTLY EMITTED | SOURCE_OWNER | SAFE_TO_EXPOSE |
|---|---|---|---|---|
| `starting_gap_qty` | YES | **YES** — `tN_gap_qty` | KMTPP `remainingGapQty` via `43_ gapOpMapFromLines_` | already exposed |
| `own_supply_used` | YES — `composition.siteStockQty` | **NO** — runtime DTO only (`42_:662`) | `recoWsComposeOpeningSupply_` over KMDR site stock | YES |
| `overseas_supply_used` | YES — `composition.allocatedOverseasQty` | **NO** — runtime DTO only | KMMSA | YES |
| `factory_supply_used` (post-realloc) | YES — `composition.allocatedFactoryQty` | **DERIVABLE** — see below | KMMSA/KMAR + §41 | already recoverable |
| `cross_company_supply_used` | YES — `reallocationInQty` | **YES** — `reallocation_in_qty_snapshot` | `43_ gapOpApplyFactorySurplusReallocation_` | already exposed |
| `reallocation_out_qty` | YES | **YES** — `reallocation_out_qty_snapshot` | same | already exposed |
| `factory_available_qty` (pre-realloc) | YES | **YES** — `factory_available_qty_snapshot` | same | already exposed |
| `committed_supply_used` | YES — `mOngoing` events (`42_:647`) | **NO** — no total on the line, no column | KMOOR via `recoWsOngoingIncomingForReceiver_` | YES, with the caveat below |
| `remaining_shortage` | YES — `residualOrderNeedQty` | implicitly, via `tN_suggested_qty` | KMTPP | already exposed |
| `recommendation_qty` | YES | **YES** — `tN_recommended_qty` | KMCALC carton CEILING | already exposed |

**`factory_supply_used` needs no new column.** The live identity is exact
(`43_:566`): `factoryCoveredQty = MAX(0, initial - out + in)`, and all three inputs are already persisted
columns. So

```
factory_supply_used = MAX(0, factory_available_qty_snapshot
                            - reallocation_out_qty_snapshot
                            + reallocation_in_qty_snapshot)
```

This is **transport arithmetic over stored facts, not a recomputation of coverage** — it reproduces the
producer's own line rather than deriving coverage a second way.

**`committed_supply_used` caveat.** A PO line with a blank or non-ISO `expected_completion_date` fails closed
as `ONGOING_ORDER_ETA_UNRESOLVED` and contributes **zero timed incoming** while remaining admitted and
traceable. So the exposed total must be *"committed supply that is timed into this window"*, not *"committed
supply that exists"*. Exposing the second under the first field's name would overstate coverage.

**Two genuinely unexposed fields remain: `own_supply_used` and `overseas_supply_used`** (and
`committed_supply_used`). All three are computed today and dropped at the `order_planning_gap` boundary.

---

## §26. Storage (§12 re-audit after the action/explanation freeze)

```
STORAGE_OWNER = request_order_allocation_drafts  (flat V2, 53 columns)
                  -> recommendation qty  tN_recommended_qty
                  -> operator qty        tN_order_qty  ·  tN_carton_qty
                  -> state               tN_status  (header status)
                  -> version             draft_version
                  -> operator edit       tN_user_edited · tN_user_edited_by
                calculation evidence stays in order_planning_gap + recommendation_calculation_runs

NEW_TABLE_REQUIRED = NO   (re-confirmed after the model grew — see below)
DB_MIGRATION_REQUIRED = NO
```

The model did get richer, and the conclusion still holds:

- **Action** — derived, stored nowhere (§22). A closed four-value enum computable from `residualOrderNeedQty`,
  `reallocation_in_qty_snapshot` and `calculation_status` needs no column until something filters on it.
- **Reason tokens** — derived from the same fields (§24). Each token's condition is an existing stored or
  derivable number.
- **Staleness** — derived at read time (§21), never stored.
- **Factory supply used** — derivable from three stored columns (§25).

So the classification the task asks for is **B — derived runtime/read model only**, for everything except two
fields:

```
SCHEMA_EXTENSION_REQUIRED = NO for Phase 1 as specified
                            CONDITIONAL YES only if own_supply_used / overseas_supply_used /
                            committed_supply_used must be PERSISTED rather than recomputed per read
```

`PROPOSED_FIELDS_IF_ANY` — additive at the end of `OP_GAP_HEADERS_`, following the
`OP_GAP_FACTORY_SNAPSHOT_COLS_` precedent exactly (name-based readers, order-agnostic, live-sheet migration by
`prodMigrateAppendColumns_`), **proposed only, not created**:

| FIELD | TYPE | NULLABILITY | OWNER | SOURCE | MUTABILITY | AUDIT |
|---|---|---|---|---|---|---|
| `own_supply_qty_snapshot` | integer >= 0 | nullable (MISSING != 0) | KMTPP opening composition | `composition.siteStockQty` | immutable in a run | `calculation_run_id` |
| `overseas_supply_qty_snapshot` | integer >= 0 | nullable | KMMSA | `composition.allocatedOverseasQty` | immutable in a run | same |
| `committed_supply_qty_snapshot` | integer >= 0 | nullable | KMOOR | Σ timed ongoing incoming | immutable in a run | same |

No new recommendation table. Splitting the decision grain across two tables immediately after §44.19
deliberately flattened it would undo that decision for no gain.

---

## §27. Recommendation output contract (§11)

One row per `(planning_cycle, company, country, marketplace, sku, draft_purpose)` and tier `T1..T3`.
`AUTHORITY` is who may set the value; `DERIVATION` is how it is obtained.

| FIELD | SOURCE | DERIVATION | NULLABILITY | AUTHORITY |
|---|---|---|---|---|
| `calculation_run_id` | `recommendation_calculation_runs` | stamped at generation | NOT NULL | run journal |
| `request_allocation_draft_id` | flat-V2 identity | `RD::MONTHLY_ORDER::<YYYY-MM>::<sorted scopeKey>` | NOT NULL | deterministic, never minted twice |
| `master_sku` | `sku_details.sku` | stored | NOT NULL | SKU master |
| `company` | scope | stored | NOT NULL | scope |
| `destination_warehouse_id` | ledger grain | resolved; else `MISSING_DESTINATION_WAREHOUSE` | NOT NULL when resolved | warehouse master |
| `planning_cycle` | run parameter | `YYYY-MM`, Asia/Taipei | NOT NULL | scheduler / caller |
| `required_by_date` | tier month | `tN_month` -> required-by (KMTPP `tierByMonth`) | NOT NULL per populated tier | §27A / KMTPP |
| `recommendation_type` | **derived** | §22 ordered rule | NOT NULL when a tier is populated | recommendation engine |
| `recommendation_qty` | `tN_recommended_qty` | KMCALC carton CEILING of the residual | NOT NULL | engine; never back-filled from an operator qty |
| `source_company` | §41 `transferLedger.donorDemandKey` | present only when `REALLOCATE` | nullable | §41 |
| `source_warehouse_id` | §41 `transferLedger.sourceWarehouseId` | present only when `REALLOCATE` | nullable | §41 |
| `starting_gap_qty` | `tN_gap_qty` | stored | nullable (MISSING != 0) | KMTPP |
| `own_supply_used` | composition | §25 — transport, not recompute | nullable | KMTPP opening composition |
| `cross_company_supply_used` | `reallocation_in_qty_snapshot` | stored | nullable | §41 |
| `remaining_shortage` | `residualOrderNeedQty` | stored/derived | nullable | KMTPP (sole residual owner) |
| `reason_tokens` | **derived** | §24 closed set, evidence-gated | may be empty, never fabricated | recommendation engine |
| `source_refs` | lineage | `demandKey` · `supplyLineageRef` · transferLedger | nullable | ledgers / §41 |
| `tN_order_qty` | operator | defaults to recommendation, independent after | NOT NULL once set | **operator** |
| `tN_carton_qty` | derived | `order_qty / units_per_carton`; partial preserved, never re-rounded | nullable when UPC missing | §14/§37 |
| `tN_status` | lifecycle | `draft \| submitted \| cancelled` | NOT NULL | §21 |
| `tN_user_edited` | operator | stamped on a deliberate quantity edit | NOT NULL | operator |
| `draft_version` | persistence | bumped per generation under the optimistic token | NOT NULL | persistence |

**No field is added merely to complete the shape.** `source_company` / `source_warehouse_id` are nullable
because they exist only on a `REALLOCATE` line; `committed_supply_used` is deliberately absent from the stored
contract pending §26.

---

## §28. Idempotency and run history (§14)

```
RECOMMENDATION_IDENTITY = RD::MONTHLY_ORDER::<planning_cycle>::<sorted scopeKey>
                          scopeKey = company | country | draft_purpose | marketplace | sku  (alphabetical)
RUN_IDENTITY            = recommendation_calculation_runs.calculation_run_id
SUPERSEDE_RULE          = within a cycle, a new run UPSERTs the same identity and bumps draft_version under
                          the optimistic {draft_version, userEditFingerprint} token;
                          across cycles, a new planning_cycle creates a NEW draft and never overwrites a prior
                          month's (§36.2)
HISTORICAL_MUTATION_ALLOWED = NO
```

Same input + same run identity does not duplicate artifacts: the identity is deterministic and content-free
(no clock, no UUID), so a replay resolves to the same row. A new run may supersede the **presentation** state;
it may not alter a submitted decision, an operator quantity, or a historical run's contents.

---

## §29. Downstream boundary (§13)

```
DRAFT_ALLOCATION_INPUT
  gap tN_gap_qty -> (KMTPP residual, already applied) -> tN_recommended_qty
  gap tN_month                                        -> tN_month
  gap calculation_month                               -> planning_cycle (YYYY-MM)
  sku_details.units_per_carton                        -> units_per_carton
  run journal (calculation_run_id, formula_version, source_data_as_of) -> provenance columns
  scope (company,country,marketplace,sku,draft_purpose)                -> deterministic draft identity

REQUEST_ORDER_CANDIDATE_INPUT           (Send Request — S7, not implemented here)
  tN_order_qty > 0  -> one request_order_lines row per tier
  tN_order_qty = 0  -> tier EXCLUDED from the Send workset; draft stays ACTIVE and keeps its month
  tN_carton_qty     -> carton qty; partial-carton override preserved, never re-rounded
  units_per_carton missing -> Suggested BLOCKED and Send BLOCKED; no silent default (§14/§34)
```

```
AUTO_CREATE_REQUEST_ORDER = NO      AUTO_CREATE_PO = NO      AUTO_CREATE_SHIPMENT = NO
```

**No shipping execution mapping exists in S5.** S5 emits an ordering-mainline decision row and nothing else.

---

## §30. S5-R2 status

```
S5_DECISION_FREEZE_COMPLETE = NO     (5 of 6 frozen; D-S5-1 is a CONTRACT_CONFLICT)
UNRESOLVED_DECISION_COUNT   = 1
```

`NEXT_TASK = operator decision on D-S5-1 (§18)`. S5-R3 (schema / mapping implementation plan) is unblocked for
everything except receiver contention, but the contention rule determines §41's live behaviour and should be
settled before any implementation round touches that path.

# PART III — S5-R2A decision freeze completion (2026-09-28)

**Status: S5 BUSINESS DECISION FREEZE COMPLETE.** All six decisions frozen. `UNRESOLVED_DECISION_COUNT = 0`.
Spec-only. `BEHAVIOR_CHANGED = NO`. Base `32e5541`.

Part III is authoritative over Part II §18–§19 wherever they differ.

---

## §31. D-S5-1 — RESOLVED by operator decision

```
D_S5_1_DONOR_CONTENTION = SEQUENTIAL_GREEDY   (FROZEN)
```

**The operator accepted the already-live §41 policy.** The proposed 50/50 proportional split is **rejected and
not carried forward** — it is not a supported branch, not modelled, and not tested as one. No
receiver-count-specific rule is introduced.

Part II §18 recorded this as a `CONTRACT_CONFLICT` and stopped. The conflict is resolved in favour of the
running system, so §18's STOP is discharged; its measurement is retained as the record of why the decision was
re-put to the operator.

```
S5_R1_CONTENTION_PREMISE = SUPERSEDED_BY_S5_R2_EVIDENCE
```

S5-R1's statement that receiver contention had no frozen owner was **incorrect**. The actual owner is
`KMFSR.runReallocation`, wired live from `43_` since FA-3B3b. The historical S5-R1 evidence files are **not
rewritten** — they record what was believed at the time. This line is the correction of record.

---

## §32. The canonical contention contract (FROZEN)

```
RECEIVER_SORT      = requiredByDate ASC
                     -> allocationPriority DESC (higher priority first)
                     -> demandKey ASC (stable tie-break)

ALLOCATION_METHOD  = SEQUENTIAL_GREEDY

DONOR_START_QTY    = eligible available surplus only
                     = releasableSurplusQty = MAX(0, initialFactoryAllocationQty - protectedFactoryQty)

RECEIVER_CAP       = eligible residual gap (preTransferRemainingShortageQty)
```

```
for each receiver, in RECEIVER_SORT order:
    for each eligible donor, in canonical donor order:
        transfer MIN(receiver remaining residual, donor remaining surplus, timely transferable)
    until the receiver's residual is 0
continue until donor surplus is exhausted OR no receiver residual remains
```

Owner of record: `supply-planning-surplus-reallocation.js` `runReallocation` (:169-231), reached live through
`43_:762 -> 43_:557`.

**Invariants, all measured rather than asserted** (`s5-r2a-contention-policy-freeze.test.js`):

```
allocated_to_receiver <= receiver residual         RECEIVER_OVERFILL   = 0
total_allocated_from_donor <= donor available      OVER_ALLOCATION     = 0
same lineage cannot be consumed twice              DOUBLE_CONSUMPTION  = 0  (duplicate demandKey fails closed)
reserved / ineligible supply never enters the pool §43.6, unusedFactorySupplyQty = 0
deterministic, stable under input permutation      DETERMINISTIC       = YES
```

### One algorithm, every receiver count

```
ZERO_RECEIVER_RULE       = no actionable receiver -> no transfer
ONE_RECEIVER_RULE        = consumes up to its full residual gap from eligible donor surplus
TWO_RECEIVER_RULE        = SEQUENTIAL_GREEDY (no proportional split, no special case)
THREE_PLUS_RECEIVER_RULE = SEQUENTIAL_GREEDY (no MANUAL_REVIEW path, no special case)
```

**All four derive from the same algorithm.** There is no receiver-count branch anywhere, and the suite proves
it by running 0, 1, 2, 3 and 4 receivers against one model with no such branch (§D), and by planting a
count-specific branch at 2 as a mutant (E7).

---

## §33. Worked examples — executed, with the winner derived from the sort

Not a table of remembered numbers: each expectation is computed through the frozen `RECEIVER_SORT` and then
compared against the live module. Which receiver is served first comes from the sort contract, never from a
name. All receivers below share one `requiredByDate` and one `allocationPriority`, so the `demandKey` ASC
tie-break decides — which is why A precedes B precedes C here and would not if the earlier axes differed.

| # | Donor | Gaps | Result | Note |
|---|---|---|---|---|
| A | 100 | A 100 · B 100 | **A 100 · B 0** | first receiver served in full; second gets nothing |
| B | 100 | A 20 · B 100 | **A 20 · B 80** | A capped at its residual, remainder flows on |
| C | 100 | A 20 · B 30 | **A 20 · B 30**, 50 unallocated | donor exceeds combined demand; residual stays unallocated (§43.6) |
| D | 101 | A 100 · B 100 | **A 100 · B 1** | odd quantity needs no rounding rule — there is no proportional split to round |
| E | 100 | A/B/C 100 each | **A 100 · B 0 · C 0** | identical rule at three receivers; no special path |

**Example D settles the odd-quantity question Part II §18a raised.** That question only existed because a
proportional split has to divide an odd number. A sequential greedy never divides anything: each receiver is
capped at its own residual and the remainder flows to the next. `ROUNDING_POLICY = NOT_APPLICABLE`.

---

## §34. The donor cap is enforced three times (measured)

Found by two successive mutants that survived, not by reading the code. Three independent guards each cap a
donor at its real surplus:

1. `donorRemainingSurplus` — a term in the `MIN` inside `applyFeasibleReallocation`
2. `timelyTransferableQty` — the §41.5A pass-through, the **same** `avail`, in that same `MIN`
3. `df.releasableSurplusQty <= 0` — gates the donor loop, so an exhausted donor is skipped for the next receiver

Removing one changed nothing. Removing two changed nothing. Only removing all three produces over-allocation.
**A single-guard defect in this function cannot over-allocate a donor**, which is a stronger safety property
than the contract asked for, and it is now asserted in both directions: the full removal over-allocates (E5),
and the partial removal still conserves (E5a).

This is the fifth round in this repository in which a defence turned out to be doubled.

---

## §35. The other five decisions — carried unchanged

```
D_S5_2_RECOMMENDATION_ACTION = FROZEN  { REALLOCATE, NEW_ORDER, NO_ACTION, MANUAL_REVIEW }   derived, stored nowhere
D_S5_3_PRIORITY              = FROZEN  EXISTING_CANONICAL_CONSUMPTION_ORDER (§44.6 + §41.3)
D_S5_4_EXPLAINABILITY        = FROZEN  CLOSED_REASON_TOKENS + numeric evidence + lineage refs
                                       FREE_TEXT_IS_AUTHORITY = NO
D_S5_5_STATE                 = FROZEN  STATE_VOCABULARY_CHANGED = NO
                                       draft · submitted · cancelled · user_edited · draft_version
D_S5_6_STALENESS             = FROZEN  DISPLAY_FLAG_ONLY · STALE_MUTATES_DECISION = NO
```

Full definitions in Part II §22–§24 and §21; nothing in them changed.

---

## §36. Phase-1 mainline separation — reasserted

```
SHIPPING_REQUIRED_QTY_IS_PURCHASE_DEMAND = NO
SHIPMENT_PLAN_AUTO_CREATES_REQUEST_ORDER = NO      SHIPMENT_PLAN_AUTO_CREATES_PO = NO
REQUEST_ORDER_AUTO_CREATES_SHIPMENT      = NO      PO_AUTO_CREATES_SHIPMENT      = NO
PHASE2_ORCHESTRATION_IMPLEMENTED         = NO
```

Ordering/Supply Planning and Shipping/Logistics remain separate decision authorities in Phase 1. Shipping data
may be consumed as supply-state evidence; shipping demand is never a purchase-order quantity authority. Full
lead-time / order / shipping orchestration belongs to Phase 2 and is not designed here.

Measured each round over comment-stripped sources (Part I §2A): the ordering mainline calls no shipment
creator, and the shipping mainline names neither ordering table.

---

## §37. Double-count defence — re-run

```
RECOMMENDATION_RECOMPUTES_FORECAST = NO      RECOMMENDATION_RECOMPUTES_GAP = NO
OVERSEAS_DOUBLE_SUBTRACTION = 0              FACTORY_DOUBLE_SUBTRACTION = 0
```

The two-sided guard holds: the fold into KMTPP opening supply exists (`42_:458-463`), and the residual does
not re-subtract it (`42_:506-507`). Green at `32e5541` and at this round's HEAD.

---

## §38. Storage — reconfirmed after the freeze completed

```
STORAGE_OWNER = request_order_allocation_drafts (flat V2, 53 col) — recommendation qty, operator qty, state,
                version, operator edit
                order_planning_gap + recommendation_calculation_runs — calculation evidence and run lineage
NEW_TABLE_REQUIRED        = NO
SCHEMA_EXTENSION_REQUIRED = NO for Phase 1 as specified
DB_MIGRATION_REQUIRED     = NO
```

Nothing in the D-S5-1 resolution changed the storage picture: accepting the live policy adds no field. Action,
reason tokens and staleness remain **derived**; `factory_supply_used` remains derivable from three already
persisted columns via the `43_:566` identity.

Optional fields from Part II §26, **listed again and still not implemented**:

| FIELD | TYPE | NULLABILITY | OWNER | SOURCE |
|---|---|---|---|---|
| `own_supply_qty_snapshot` | integer >= 0 | nullable (MISSING != 0) | KMTPP opening composition | `composition.siteStockQty` |
| `overseas_supply_qty_snapshot` | integer >= 0 | nullable | KMMSA | `composition.allocatedOverseasQty` |
| `committed_supply_qty_snapshot` | integer >= 0 | nullable | KMOOR | Σ timed ongoing incoming |

Additive at the end of `OP_GAP_HEADERS_` following the `OP_GAP_FACTORY_SNAPSHOT_COLS_` precedent. **Proposed
only. Not created, not migrated.**

---

## §39. S5 decision freeze status

```
D_S5_1 = FROZEN     D_S5_2 = FROZEN     D_S5_3 = FROZEN
D_S5_4 = FROZEN     D_S5_5 = FROZEN     D_S5_6 = FROZEN

UNRESOLVED_DECISION_COUNT   = 0
S5_DECISION_FREEZE_COMPLETE = YES
```

`NEXT_TASK = S5-R3 — Recommendation schema / mapping + implementation plan.`

**End of Part III.**

---
---

# PART IV — S5-R3 SCHEMA / MAPPING FREEZE + IMPLEMENTATION PLAN

*Database-first mapping round. No runtime implementation, no migration, no deploy, no Apps Script sync.*
*Base `dce0550`. Sections §40–§52 are additive; Parts I–III are unchanged except where a banner says otherwise.*

---

## §40. The finding that reorders this round: the recommendation engine already exists

Parts I–III treated the recommendation ACTION as something S5 would introduce. **It is not greenfield.**
`assets/js/core/supply-recommendation.js` (`KMREC`, `VERSION = kmrec-fm6r1-1`) is already, in its own words,
*"ONE pure, deterministic Phase-1 Recommendation owner"*. It already:

- reads a **materialized** `order_planning_gap` row and owns no formula (`supply-recommendation.js:3-7`);
- produces `recommendationId = 'ORDER_PLANNING_GAP:' + company||country||marketplace||sku`;
- derives staleness — `isStale(dto, latestRow)` over `sourceFingerprint` (`:178-182`);
- cartonizes **once** through the canonical `KMCALC` owner, never per tier (`:145-149`);
- excludes T4 from the actionable total and keeps it as `forwardVisibility` (`:34`, `:130`);
- is driven by **both** the manual button and the scheduled job — one owner, two callers
  (`request-order.js:4416`, `47_api_v1_recommendation_generation.gs:81`).

```
RECOMMENDATION_ENGINE_IS_GREENFIELD = NO
RECOMMENDATION_ENGINE_OWNER         = KMREC (assets/js/core/supply-recommendation.js)
```

This is decisive for the whole round. **S5-R3 is not a new engine; it is a bounded additive derivation on an
existing one.** Every slice in §50 is written against `KMREC` for that reason, and the §44 rule
(`SECOND_CALCULATION_PATH_COUNT = 0`) is satisfied structurally rather than by promise.

---

## §41A. Canonical owners (§1) — reconfirmed against code, not naming

| CONCERN | OWNER | EVIDENCE |
|---|---|---|
| `GAP_OWNER` | `KMTPP.projectTimePhasedSupply`, materialized by `43_api_v1_gap_materialization.gs` into `order_planning_gap` | `42_:499`; `43_:143-186` |
| `REALLOCATION_OWNER` | `KMFSR.runReallocation` (§41 intra-company), `KMAR.allocateFactoryCrossCompany` (R2G-B cross-company pre-pass) | `supply-planning-surplus-reallocation.js:169-231`; `43_:573-620` |
| `RESIDUAL_OWNER` | `KMTPP` — sole owner (§44.4). `residualOrderNeedQty` is computed in `42_` with coverage terms pinned to literal `0` | `42_:505-507` |
| `RECOMMENDATION_QTY_OWNER` | `KMREC.generateOrderPlanningRecommendation` → `totalRecommendedQty`; cartonized once by `KMCALC.calculateSuggestedOrderQty` | `supply-recommendation.js:145-149` |
| `DRAFT_STORAGE_OWNER` | `KMRDV2` / `KMRDV2P` over `request_order_allocation_drafts` (flat V2, 53 columns) | `supply-planning-request-draft-v2.js:39-43` |
| `RUN_OWNER` | `KMPR` over `recommendation_calculation_runs` (16 columns, 7 frozen stages) | `supply-planning-persistence-repository.js:31-40` |
| `OPERATOR_DECISION_OWNER` | `KMRDV2.applyTierEdit` → `tN_order_qty` + `tN_user_edited`; **never** `tN_recommended_qty` | `supply-planning-request-draft-v2.js:141-150` |

```
NEW_OWNER_CREATED = NO      (every row above already existed before S5)
```

---

## §42. Current data shape (§2) — audited, not inferred

### 42.1 `order_planning_gap` — 24 columns

```
PRIMARY KEY   none (a Sheet tab; no surrogate id)
BUSINESS KEY  company | country | marketplace | sku          (GAP_KEY_COLS_, 43_:53)
WRITE OWNER   43_ gapUpsertByKey_ — latest-state UPSERT, no history, no duplicate
READ OWNER    KMREC, request-order.js, 47_ generation job
LIFECYCLE     overwritten in place per materialization run; calculated_at / updated_at are batch write stamps
FIELDS        company, country, marketplace, sku, calculation_status, calculation_month,
              t1..t4 { _month, _gap_qty, _suggested_qty }, note, calculated_at, updated_at,
              factory_available_qty_snapshot, reallocation_in_qty_snapshot, reallocation_out_qty_snapshot
```

**Three facts here govern the whole mapping, and each contradicts a natural reading of the field names.**

**(a) There is no `calculation_run_id` on this table.** `43_` upserts row by row keyed on the business key.
`supply-planning-snapshot-freshness.js:38-40` states it in the source: *"The materialized table carries no run_id
column … so 'this run finished' cannot be read off a row."* Any mapping that joins a gap row to a run by id is
therefore fiction.

**(b) There is no `destination_warehouse_id`, and on this mainline there cannot be one.** In the monthly
MONTHLY_ORDER path `destinationWarehouseId` is accepted only as **deprecated compatibility input**, recorded on
the result and *"NEVER used to drive fanout"* (`42_:60-63`, `:85`). A `platform_fulfilled` SKU expands to exactly
one MARKETPLACE line with no warehouse at all (`42_:927`); a `self_fulfilled` SKU expands to several WAREHOUSE
lines whose per-tier quantities `43_:167` then **sums into one row** — the warehouse axis is collapsed before
persistence, deliberately.

**(c) `tN_gap_qty` is the gap AFTER coverage, not before it.** Overseas and Factory coverage are folded into the
single KMTPP **opening supply** (`42_:458-463`), so the residual's coverage terms are pinned to literal zero and
`residualOrderNeedQty === destinationGapQty === remainingGapQty` (`42_:505-507`). `starting_gap_qty` and
`remaining_shortage` are **not two stored columns — they are the same one**, and the pre-coverage number is
nowhere on the row.

### 42.2 `request_order_allocation_drafts` — flat V2, 53 columns

```
PRIMARY KEY   request_allocation_draft_id = RD::MONTHLY_ORDER::<YYYY-MM>::<sorted scopeKey>
BUSINESS KEY  recommendationType | planning_cycle | company | country | marketplace | sku | draft_purpose
WRITE OWNER   KMRDV2P (plan) -> KMPR (apply, under the optimistic token + LockService)
LIFECYCLE     header status draft | partially_submitted | submitted | cancelled;
              tier status  draft | submitted | cancelled;  T1..T3 only (T4 never persisted)
```

The fields §3 asks about **already live here, by name**:

| ASKED | LIVES AS | EVIDENCE |
|---|---|---|
| recommended qty | `tN_recommended_qty` | `:36`, `:109` |
| operator qty | `tN_order_qty` | `:37`, `:110` |
| user edited | `tN_user_edited`, `tN_user_edited_by` | `:36-37`, `:150` |
| draft version | `draft_version` | `:41` |
| run lineage | `calculation_run_id`, `formula_version`, `calculated_at`, `source_data_as_of` | `:41-42` |

`state` does **not** live here as a recommendation state. `tN_status` is a *submission lifecycle*
(`draft|submitted|cancelled`), and the header `status` is its roll-up. Neither is the S5 recommendation state.

### 42.3 `recommendation_calculation_runs` — 16 columns

```
PRIMARY KEY   calculation_run_id
BUSINESS KEY  draft_id + planning_cycle + business_scope_key + draft_version
WRITE OWNER   KMPR.applyPersistencePlan (stage journal)
LIFECYCLE     run_status  RUNNING | PARTIAL | COMPLETED | FAILED
              current_stage over the FROZEN 7-stage sequence
              RUN_METADATA -> HEADER -> LINES -> RECONCILE -> LINEAGE -> TOTALS -> COMPLETED
RELATIONSHIP  draft_id -> request_order_allocation_drafts.request_allocation_draft_id  (1 draft : N runs)
              NO relationship to order_planning_gap — there is no run id on the gap row (§42.1a)
```

---

## §43. Mapping (§3) — with the three fields that cannot be filled

`AUTHORITY` is who may set the value. `PERSISTED` means a column exists today.

| TARGET_FIELD | SOURCE_OWNER | SOURCE / DERIVATION | NULLABILITY | P/D | AUTHORITY |
|---|---|---|---|---|---|
| `master_sku` | gap | `order_planning_gap.sku` (the gap table stores the MASTER sku; `site_sku` is not on it) | NOT NULL | P | SKU master |
| `company` | gap | `.company` | NOT NULL | P | scope |
| `destination_warehouse_id` | — | **NOT_AVAILABLE** — deprecated on this mainline (§42.1b) | — | — | — |
| `planning_cycle` | draft | `request_order_allocation_drafts.planning_cycle` (`YYYY-MM`) | NOT NULL | P | scheduler |
| `required_by_date` | — | **NOT_AVAILABLE as a date** — the monthly grain stores `tN_month` (`YYYY-MM`) only | — | D | see §43.1 |
| `starting_gap_qty` | — | **NOT_AVAILABLE** — the stored gap is post-coverage (§42.1c) | — | — | — |
| `own_supply_used` | KMTPP | `composition.siteStockQty` — computed at `42_:463`, **never persisted** | — | — | NOT_AVAILABLE |
| `cross_company_supply_used` | — | see §43.2 — the name does not match the stored number | — | — | corrected |
| `reallocated_in_supply_used` | §41 KMFSR | `reallocation_in_qty_snapshot` | nullable (MISSING != 0) | P | KMFSR |
| `factory_supply_used` | §41 identity | `MAX(0, factory_available_qty_snapshot − reallocation_out_qty_snapshot + reallocation_in_qty_snapshot)` — the `43_:565` identity, all three operands persisted | nullable | D | KMFSR |
| `committed_supply_used` | KMOOR | folded into KMTPP incoming; not separable from a stored column | — | — | NOT_AVAILABLE |
| `remaining_shortage` | KMTPP | `Σ tN_gap_qty` over T1–T3 (= `residualOrderNeedQty`, §42.1c) | nullable | P | KMTPP |
| `recommendation_type` | **derived** | §45 ordered rule over already-authoritative values | NOT NULL | D | KMREC |
| `recommendation_qty` | KMREC | `totalRecommendedQty` = `KMCALC.calculateSuggestedOrderQty(Σ raw T1–T3 gap, upc)` | nullable when UPC missing | D | KMREC |
| `source_company` | — | **NOT_AVAILABLE** — and §43.2 shows it would be the receiver's own company anyway | — | — | — |
| `source_warehouse_id` | §41 ledger | present in `transferLedger.sourceWarehouseId`, **discarded at `43_:567`** (reduced to a count) | — | — | NOT_AVAILABLE |
| `reason_tokens` | **derived** | §46, evidence-gated | may be empty | D | KMREC |
| `source_refs` | lineage | `calculation_run_id` + gap business key + `calculated_at` fingerprint | nullable | D | KMREC / KMPR |
| `state` | KMREC | `STATUS` ∈ `READY | NO_ACTION | BLOCKED` | NOT NULL | D | KMREC |
| `user_edited` | draft | `tN_user_edited` | NOT NULL | P | operator |
| `draft_version` | draft | `draft_version` | NOT NULL | P | KMPR |
| `calculation_run_id` | draft / run | `request_order_allocation_drafts.calculation_run_id` → `recommendation_calculation_runs` | NOT NULL | P | KMPR |

### §43.1 `required_by_date` — honest at the grain that exists

The monthly mainline's tier grain is a **month**, not a date. A `required_by_date` does exist inside the engine
— `42_:627` passes one to KMCALC and `KMFSR` sorts receivers on it (`supply-planning-surplus-reallocation.js:170`)
— but it is a *within-run* value, never persisted per tier.

```
REQUIRED_BY_DATE_PERSISTED     = NO
REQUIRED_BY_DATE_TIER_GRAIN    = MONTH (tN_month, YYYY-MM)
SYNTHESISING_A_DAY_FROM_A_MONTH = FORBIDDEN
```

Choosing a day-of-month would be inventing business policy. `tN_month` is exposed as the honest grain and the
field is reported `NOT_AVAILABLE` at day precision.

### §43.2 Correction — `reallocation_in_qty_snapshot` is **not** cross-company

Part II §27 mapped `cross_company_supply_used` to `reallocation_in_qty_snapshot`, and the frozen §24 token set
names the branch `CROSS_COMPANY_REALLOCATION`. **The stored number is intra-company.** `43_:542` groups §41
receivers as `var g = r.company + '||' + r.sku;` — every donor and receiver in a KMFSR group shares one company,
so a §41 transfer can never cross a company boundary.

Cross-company arbitration is a **different, earlier** step: the R2G-B pre-pass (`43_:573-620`) allocates a
contended physical Factory pool once across companies via `KMAR`. Its outcome lands inside
`factory_available_qty_snapshot` as part of the *initial* allocation — and **whether a SKU was contended is not
persisted**, so true cross-company usage cannot be read back from any stored column.

```
S5_R2_CROSS_COMPANY_FIELD_NAME = SUPERSEDED_BY_S5_R3_EVIDENCE
CROSS_COMPANY_SUPPLY_USED      = NOT_AVAILABLE   (contention flag not persisted)
REALLOCATED_IN_SUPPLY_USED     = AVAILABLE       (reallocation_in_qty_snapshot, intra-company)
```

The token rename this forces is §46.1. Parts I–III are **not** rewritten; the correction is recorded here, in the
same way S5-R2A recorded S5-R1's contention premise.

---

## §44. Do not recompute (§4)

Every mapped value in §43 is either read from a stored column or derived by an identity over stored columns.
No slice in §50 calls `KMTPP`, `KMMSA`, `KMALLOC`, `KMAR`, `KMFSR` or a forecast reader.

```
RECOMPUTES_FORECAST                = NO
RECOMPUTES_GAP                     = NO
RERUNS_ALLOCATION                  = NO
SUBTRACTS_COVERAGE_AGAIN           = NO     (see the two-sided guard below)
RECALCULATES_RECOMMENDATION_QTY    = NO     (KMREC remains the only producer of the actionable total)
SECOND_CALCULATION_PATH_COUNT      = 0
```

**One owner of the formula, several callers — and that is the intended shape.** The first version of this
round's probe asserted a single *caller* of `KMCALC.calculateSuggestedOrderQty` and failed against four real
ones (`supply-recommendation.js`, `supply-planning-destination-runtime.js`, `supply-planning-horizon-projection.js`,
`supply-planning-source-facts.js`). The probe was wrong, not the repo: each of those **delegates** to the frozen
owner, and per-tier cartonizing for display is explicitly legitimate — what must never happen is summing
per-tier rounded values into a total, which is why `KMREC` cartonizes the raw sum **once**
(`supply-recommendation.js:14-18`).

The invariant that actually carries the claim, and is what the suite now pins:

```
CARTON_CEILING_DEFINERS          = 1   (supply-planning-calculations.js)
INLINE_CARTON_REIMPLEMENTATIONS  = 1   (supply-planning-recommendation-audit.js — READ-ONLY authority audit,
                                        reproduces the published formula to EXPLAIN a discrepancy, computes no
                                        planning quantity, names KMCALC as owner)
```

That one exception is **named rather than filtered**, so it stays a recorded decision instead of becoming a gap
nobody can see.

**DC-1 restated for the mapping layer.** Because coverage is folded into opening supply, the stored
`tN_gap_qty` is already net of Overseas and Factory. A mapper that "helpfully" subtracts
`factory_supply_used` from `remaining_shortage` would subtract the same supply twice. `factory_supply_used` is
**explanatory only**: it may be displayed, and it may gate a reason token; it may never enter an arithmetic
path that produces a quantity.

---

## §45. Action derivation (§5) — pure, and at the grain the data supports

```
ACTION_ENUM  = { REALLOCATE, NEW_ORDER, NO_ACTION, MANUAL_REVIEW }     (frozen, Part II §22)
ACTION_GRAIN = ROW  (company, country, marketplace, sku) — NOT per tier
```

**Why the grain is the row and not the tier.** `reallocation_in_qty_snapshot` exists once per gap row, and
`totalRecommendedQty` is a single cartonize-once figure over T1–T3 (`supply-recommendation.js:34-37`). There is
no per-tier reallocation number anywhere in storage, so a per-tier `REALLOCATE` could not be evidenced. Tiers
remain display and trace, exactly as `KMREC` already treats them.

| ACTION | INPUT CONDITION | OUTPUT | EVIDENCE REQUIRED |
|---|---|---|---|
| `MANUAL_REVIEW` | `calculation_status !== 'READY'` | `MANUAL_REVIEW` | `calculation_status` verbatim; qty stays `null`, never `0` |
| `MANUAL_REVIEW` | `READY`, actionable gap > 0, but `totalRecommendedQty === null` (`UNITS_PER_CARTON_NOT_AVAILABLE`) | `MANUAL_REVIEW` | `totalUnavailableReason` |
| `REALLOCATE` | `READY` and `reallocation_in_qty_snapshot > 0` | `REALLOCATE` | the stored snapshot column |
| `NEW_ORDER` | `READY`, no reallocation in, and `totalRecommendedQty > 0` | `NEW_ORDER` | `actionableGapQty > 0` + cartonized total |
| `NO_ACTION` | `READY`, no reallocation in, `actionableGapQty <= 0` | `NO_ACTION` | all three actionable tier gaps ≤ 0 |

Evaluated **in that order**. `REALLOCATE` is tested before `NEW_ORDER` because a line may be both; the
reallocation is the part that must be acted on first, and a residual that survives it is carried in
`recommendation_qty` with `RESIDUAL_SHORTAGE` + `NEW_ORDER_REQUIRED` in the tokens, so nothing is lost.

`MISSING` is never `0`: a `BLOCKED` row yields `MANUAL_REVIEW` with a null quantity, never a zero that would
read as "checked, nothing needed".

```
ACTION_DERIVATION_IS_PURE     = YES   (a pure function of one row + the existing KMREC DTO)
ACTION_DERIVATION_MUTATES_STATE = NO
ACTION_DERIVATION_IS_PERSISTED  = NO
```

### §45.1 The enum collides with two live enums — and must not be conflated

`NO_ACTION` is already a member of two **different** live enums with a different meaning:

| enum | member set | meaning | file |
|---|---|---|---|
| `KMREC.STATUS` | `READY`, `NO_ACTION`, `BLOCKED` | **readiness** of a recommendation | `supply-recommendation.js:31` |
| `KMREX.STATUS` | `ACTION`, `PARTIAL`, `NO_ACTION`, `BLOCKED` | **coverage** of an execution draft | `supply-execution-handoff.js:35` |
| S5 action | `REALLOCATE`, `NEW_ORDER`, `NO_ACTION`, `MANUAL_REVIEW` | **what to do** | frozen, Part II §22 |

These are three axes that share one token. The S5 action is therefore **namespaced at the DTO level**
(`recommendationAction`), never assigned to `dto.status`, and every test that greps for it matches a whole token
in a named field — the S5-R1 `MANUAL_REVIEW` / `NEEDS_MANUAL_REVIEW` substring trap applies here verbatim.

---

## §46. Reason tokens (§6) — evidence, source, and when forbidden

| TOKEN | NUMERIC / LINEAGE EVIDENCE | SOURCE | WHEN EMITTED | WHEN FORBIDDEN |
|---|---|---|---|---|
| `FACTORY_SUPPLY_APPLIED` | `factory_supply_used > 0` | §41 identity over 3 stored columns | that identity is computable and positive | any operand MISSING |
| `FACTORY_SURPLUS_REALLOCATION_APPLIED` | `reallocation_in_qty_snapshot > 0` | stored column | strictly positive | MISSING, `0`, or negative |
| `RESIDUAL_SHORTAGE` | `Σ tN_gap_qty` (T1–T3) `> 0` | stored columns | `calculation_status === 'READY'` and the sum is positive | status not `READY` |
| `NEW_ORDER_REQUIRED` | `totalRecommendedQty > 0` | `KMREC` | the residual cartonizes to a positive order | UPC unavailable → total `null` |
| `NO_ACTION_REQUIRED` | `actionableGapQty <= 0` | `KMREC` | `READY` and nothing actionable | status not `READY` |
| `MANUAL_REVIEW_REQUIRED` | `calculation_status !== 'READY'` **or** UPC unavailable | stored column / `KMREC` | the action cannot be truthfully derived | a truthful action exists |
| `FORWARD_VISIBILITY_ONLY` | `t4_gap_qty > 0` and T1–T3 sum ≤ 0 | stored columns | need appears only in T4 | any actionable tier positive |

```
TOKEN_WITHOUT_EVIDENCE_COUNT = 0
```

### §46.1 Three frozen tokens are withdrawn, and why that is not a weakening

Part II §24 froze a nine-token set from the *branch names* of §22 rather than from stored evidence. Three of
them cannot be emitted from any persisted value, and §6 of this round is explicit that a token may not exist
because a branch name sounds plausible:

| FROZEN TOKEN | DISPOSITION | REASON |
|---|---|---|
| `CROSS_COMPANY_REALLOCATION` | **renamed** → `FACTORY_SURPLUS_REALLOCATION_APPLIED` | §43.2 — the evidence is real, the name is not. The new name is the live code's own: `transferLedger.reason = 'FACTORY_SURPLUS_REALLOCATION'` (`supply-planning-surplus-reallocation.js:225`) |
| `OWN_SUPPLY_APPLIED` | **withdrawn** | its cited evidence `own_supply_used` is never persisted (§43) |
| `OVERSEAS_SUPPLY_APPLIED` | **withdrawn** | its cited evidence `allocatedOverseasQty` is never persisted (§43) |
| `COMMITTED_SUPPLY_APPLIED` | **withdrawn** | not separable from a stored column (§43) |

Withdrawn tokens are **not deleted from history** — they return automatically, with no contract change, if the
three optional snapshot columns proposed in Part II §38 are ever added, because each withdrawal is stated as a
missing *column*, not as a missing concept. `FORWARD_VISIBILITY_ONLY` is added because `KMREC` already computes
and surfaces that exact distinction (`supply-recommendation.js:130-137`) and it was previously unnamed.

```
S5_R2_TOKEN_SET = SUPERSEDED_BY_S5_R3_EVIDENCE
REASON_TOKEN_SET_SIZE = 7   (was 9: 3 withdrawn, 1 renamed, 1 added)
```

---

## §47. Explanation fields currently dropped (§7)

| FIELD | COMPUTED | PERSISTED | EMITTED | OWNER | LOSS BOUNDARY | CLASS |
|---|---|---|---|---|---|---|
| `composition.siteStockQty` | YES `42_:463` | NO | runtime DTO only | KMTPP | not written by `43_ gapOpMapFromLines_` | **C** |
| `composition.allocatedOverseasQty` | YES `42_:463` | NO | runtime DTO only | KMMSA | same | **C** |
| `composition.allocatedFactoryQty` | YES `42_:463` | **derivable** | yes | KMFSR | — | **A** (§41 identity) |
| `factory_available_qty_snapshot` | YES | YES | yes | KMFSR | — | **A** |
| `reallocation_in_qty_snapshot` | YES | YES | yes | KMFSR | — | **A** |
| `reallocation_out_qty_snapshot` | YES | YES | yes | KMFSR | — | **A** |
| `transferLedger[]` (donor lineage) | YES | NO | **no** | KMFSR | reduced to `transfers += ledger.length` at `43_:567` | **C** |
| `requiredByDate` per tier | YES `42_:627` | NO | partial (`currentMonthRemaining` only) | KMCALC | monthly grain is a month | **D** |
| contention flag (R2G-B) | YES `43_:649` | NO | no | KMAR | partition consumed, flag discarded | **C** |
| `residualOrderNeedQty` | YES | YES (as `tN_gap_qty`) | yes | KMTPP | — | **A** |
| pre-coverage gap | **NO** | NO | no | — | never computed as a separate number (§42.1c) | **D** |

```
EXPLANATION_FIELD_CLASSIFICATION =
  A DERIVED_AT_READ_TIME          5
  B SAFE_TO_PERSIST_IN_EXISTING   0
  C NEEDS_SCHEMA_EXTENSION        4
  D CANNOT_BE_TRUTHFULLY_EXPOSED  2
```

**No column is added by this round.** Class C is a list of what a future authorized round *could* add; class D
is a statement that two of these are not recoverable by adding a column to `order_planning_gap` at all — the
pre-coverage gap is not computed anywhere, and a day-precision required-by date does not exist at the monthly
grain.

---

## §48. Storage decision (§8)

```
NEW_TABLE_REQUIRED        = NO      (reconfirmed — Part III §38 unchanged)
SCHEMA_EXTENSION_REQUIRED = NO      for the frozen Phase-1 scope as mapped in §43
DB_MIGRATION_REQUIRED     = NO
```

Action, reason tokens, staleness and `factory_supply_used` are all **derived**. Nothing in §43 needs a column to
become truthful; the fields that need one are reported `NOT_AVAILABLE` instead of being invented, which is the
whole point of the classification.

The Part II §38 optional columns are **not re-proposed here**. They were listed once, are unchanged, and adding
them is a separate authorized decision — restating a proposal each round is how a proposal quietly becomes a
plan.

```
PERSISTED_FIELDS     = master_sku · company · country · marketplace · planning_cycle · remaining_shortage ·
                       reallocated_in_supply_used · draft_version · calculation_run_id · user_edited ·
                       tN_recommended_qty · tN_order_qty · tN_month · tN_status
DERIVED_FIELDS       = recommendation_type · recommendation_qty · reason_tokens · state · source_refs ·
                       factory_supply_used · stale
NOT_AVAILABLE_FIELDS = destination_warehouse_id · required_by_date (day precision) · starting_gap_qty ·
                       own_supply_used · cross_company_supply_used · committed_supply_used ·
                       source_company · source_warehouse_id
```

---

## §49. Identities, staleness, and the operator boundary (§9–§11)

```
RECOMMENDATION_ID = 'ORDER_PLANNING_GAP:' + company||country||marketplace||sku     (KMREC, live)
DRAFT_ID          = RD::MONTHLY_ORDER::<YYYY-MM>::<sorted scopeKey>                (KMRDV2, live)
                    scopeKey = company | country | draft_purpose | marketplace | sku  (alphabetical)
RUN_ID            = recommendation_calculation_runs.calculation_run_id             (KMPR, live)
                    fallback when a caller supplies none: 'RUN::' + draftId + '::v' + draftVersion
GAP_ID            = company || country || marketplace || sku                       (GAP_KEY_COLS_ 43_:53, live)
SOURCE_REF_FORMAT = '<product>#<company>||<country>||<marketplace>||<sku>#<calculated_at>'
                    — this IS KMREC.fingerprint (supply-recommendation.js:69)

NEW_IDENTITY_MINTED = NO
```

### §49.1 Staleness (§10) — already derived, already owned

```
STALE_DERIVATION = KMREC.isStale(dto, latestGapRow)
                   := dto.sourceFingerprint !== fingerprint(sourceType, latestGapRow)
                   i.e. the gap row's calculated_at advanced under a recommendation generated from an older one
STALE_PERSISTED  = NO
STALE_MUTATES_RECOMMENDATION = NO      (display only — request-order.js:4372 renders a banner and nothing else)
```

A `calculation_run_id` comparison was considered and rejected on evidence: `order_planning_gap` has no run id
(§42.1a), so that comparison has no left-hand side. The fingerprint is what the data actually supports, and it
is already live on both consuming pages.

Schedule-aware freshness of the snapshot itself is a **separate** question with a separate owner, `KMSNF`
(`supply-planning-snapshot-freshness.js`). S5 does not duplicate it.

### §49.2 Operator edit boundary (§11) — enforced by live code at three sites

```
SYSTEM_VALUE_OWNER     = tN_recommended_qty   (KMREC -> KMRDV2.projectFlatDraftRow)
OPERATOR_VALUE_OWNER   = tN_order_qty         (KMRDV2.applyTierEdit; defaults to the recommendation, independent after)
FINAL_VALUE_RESOLUTION = tN_order_qty is the submitted quantity; the recommendation is never back-filled from it
SYSTEM_RECALC_OVERWRITES_USER_EDIT = NO
```

| site | guarantee | evidence |
|---|---|---|
| `KMRDV2.applyTierEdit` | writes `order_qty` / `carton_qty` / `note` and stamps `user_edited`; **never touches `recommended_qty`** | `supply-planning-request-draft-v2.js:141-150` |
| `KMRDV2.refresh` | `if (user_edited === true) return;` — an edited tier is skipped entirely | `:184` |
| `KMRDV2.regenerate` | overwrites only with `confirmRegenerateOverUserEdits === true`, and then clears the flag rather than leaving a stale claim | `:200-203` |
| `KMPR` line upsert | independently re-protects: edited **or legacy-unknown** rows have the user-qty column deleted from the write | `supply-planning-persistence-repository.js:331-349` |

The defence is doubled by design — `KMPR` treats an *unknown* `user_edited` as protected (`:151`, *"conservative
protect when unknown"*), which is the repo's `missing is never false` rule applied to an operator's decision.
The optimistic `{draft_version, userEditFingerprint}` token (`:104`) makes a concurrent edit a **conflict**, not
a silent overwrite.

---

## §50. Implementation slices (§14)

Ordered so that each is independently revertible and none changes behaviour until the last.

### Slice A — pure action + reason derivation

```
NAME            A · recommendationAction
FILES           assets/js/core/supply-recommendation.js   (additive export only)
ALLOWED_FILES   that file + its test
DO_NOT_TOUCH    42_, 43_, KMTPP, KMCALC, KMMSA, KMFSR, KMAR, any draft/persistence module
BEHAVIOR_CHANGE none — a new pure export; no existing return value changes
DEPENDENCIES    none
ACCEPTANCE      §45 truth table exhaustive; §46 token table exhaustive; pure (same input -> same output,
                no clock, no RNG, no mutation of the input row); ACTION never written to dto.status
ROLLBACK        delete the export (nothing consumes it yet)
```

### Slice B — explanation mapper

```
NAME            B · recommendationExplanation
FILES           assets/js/core/supply-recommendation.js   (additive export only)
ALLOWED_FILES   that file + its test
DO_NOT_TOUCH    as Slice A
BEHAVIOR_CHANGE none
DEPENDENCIES    A
ACCEPTANCE      factory_supply_used via the 43_:565 identity, null when any operand is MISSING;
                NOT_AVAILABLE fields absent from the DTO rather than present-and-null-and-labelled;
                no arithmetic path consumes factory_supply_used (DC-1)
ROLLBACK        delete the export
```

### Slice C — read-model exposure

```
NAME            C · workspace read model
FILES           47_api_v1_recommendation_generation.gs  OR  the request-order read path — ONE of them
ALLOWED_FILES   the chosen file + its test
DO_NOT_TOUCH    43_ gap materialization; any write path
BEHAVIOR_CHANGE additive response fields only; no existing field changes type or meaning
DEPENDENCIES    A, B
ACCEPTANCE      response is additive under the existing schema gate; a BLOCKED row exposes MANUAL_REVIEW with
                a null qty; stale is computed by KMREC.isStale and never stored
ROLLBACK        remove the additive fields
```

### Slice D — operator-facing workspace integration

```
NAME            D · UI surfacing
FILES           assets/js/pages/request-order.js
ALLOWED_FILES   that file + its test
DO_NOT_TOUCH    any core module; any handler
BEHAVIOR_CHANGE visible — the action and its tokens are rendered
DEPENDENCIES    C
ACCEPTANCE      MANUAL_REVIEW renders as a refusal with its cause, never as a zero; the existing stale banner
                is reused, not re-implemented; no new page-local recommendation state
ROLLBACK        revert the render
```

### Slice E — downstream candidate mapping

```
NAME            E · Request Order candidate
FILES           assets/js/core/supply-planning-request-draft-v2-persistence.js
ALLOWED_FILES   that file + its test
DO_NOT_TOUCH    PO handlers (13_), shipment handlers, shipment draft, carrier modules
BEHAVIOR_CHANGE none in Phase 1 — mapping is defined and tested, not wired to an auto-create
DEPENDENCIES    A
ACCEPTANCE      AUTO_CREATE_REQUEST_ORDER / _PO / _SHIPMENT all NO; a MANUAL_REVIEW action produces no candidate
ROLLBACK        revert the mapping
```

```
IMPLEMENTATION_SLICE_COUNT = 5
SLICES_AUTHORIZED_BY_THIS_ROUND = 0
```

---

## §51. Downstream mapping and Phase-1 separation (§12–§13)

`DRAFT_ALLOCATION_INPUT_MAPPING` — the live path, unchanged; S5 supplies the tier facts and nothing else:

| SOURCE | TARGET | TRANSFORMATION | REQUIRED |
|---|---|---|---|
| gap `company/country/marketplace/sku` | `scope` | verbatim | required |
| `planning_cycle` | `planning_cycle` | `normalizePlanningCycleMonthly` — `YYYY-MM` or throw | required |
| `tN_month` | `tN_month` | verbatim | required |
| `tN_suggested_qty` | `tN_recommended_qty` | verbatim (`nn()` floors MISSING to 0 at the draft boundary) | required |
| — | `tN_order_qty` | defaults to the recommendation; operator-owned thereafter | required |
| `units_per_carton` | `tN_carton_qty` | `deriveCarton(order_qty, upc)` | optional (null when UPC missing) |
| run lineage | `calculation_run_id`, `formula_version`, `calculated_at`, `source_data_as_of` | verbatim | required |
| **T4** | — | **dropped** — `tiersFromFactLines` skips any bucket outside T1–T3 | — |

`REQUEST_ORDER_CANDIDATE_MAPPING` — `KMRDV2.explodeSendRequestLines`, live and unchanged: tiers with
`order_qty > 0` and status not `cancelled` become `{sku, company, country, marketplace, request_bucket,
request_month, requested_qty, units_per_carton, carton_qty, request_allocation_draft_id}`. It is driven by the
**operator** quantity, never by the recommendation.

```
SHIPPING_REQUIRED_QTY_IS_PURCHASE_DEMAND = NO
AUTO_CREATE_REQUEST_ORDER = NO    AUTO_CREATE_PO = NO    AUTO_CREATE_SHIPMENT = NO
PHASE2_FIELD_OR_ACTION_COUNT = 0
```

No S5 field reads a shipping-required quantity, a carrier, a lane, a lead time or an ETA. `13_procurement_handlers.gs:2334`
remains the separation of record: *"Writes ONLY purchase_orders / purchase_order_lines. NEVER touches request
orders / shipments."*

---

## §52. Data safety (§16) and S5-R3 status

```
PRODUCTION_DATA_TABLES = order_planning_gap · request_order_allocation_drafts ·
                         request_order_allocation_draft_lines · shipping_allocation_drafts ·
                         shipping_allocation_draft_lines · recommendation_calculation_runs ·
                         marketplace_skus · sku_details · factory_stock · purchase_orders
TEST_DATA_TABLES       = none identified — no table in this path is test-only
MIXED_DATA_TABLES      = request_order_allocation_drafts · shipping_allocation_drafts
                         (carry demo-seeded rows alongside real operator drafts)
```

`shipping_allocation_draft_lines` held **real** duplicated operator rows at 11:18:11 / 11:19:53 / 11:20:07
(`PRODUCTION_DATA_INTEGRITY_CLOSURE_F1-7N-FB-4B.md` §B.2). These tables are production, and the round's default
stands: **real master and reference data is READ-ONLY.**

| slice | WRITE_TEST_REQUIRED | SAFE_TEST_TARGET | PRODUCTION_WRITE_AUTHORIZATION_REQUIRED |
|---|---|---|---|
| A | NO | in-memory row fixtures | NO |
| B | NO | in-memory row fixtures | NO |
| C | NO | fake sheet set (`KMPR` fixture precedent) | NO |
| D | NO | DOM fixture | NO |
| E | NO | in-memory draft row | NO |

No slice requires a production write. If a later round does, it needs its own explicit authorization — the
Order and Shipment tables must not be assumed test-only, and this record says so before anyone needs it to.

```
S5_MAPPING_FREEZE_READY = YES
NEXT_TASK = S5-R4 — first bounded runtime implementation slice (Slice A: pure action + reason derivation)
```

---

## §53. S5-R3 operator decisions — ACCEPTED

Both questions raised at the close of S5-R3 were answered by the operator. Neither changes the mapping; both
promote a recorded finding to a **decision**, which is the difference between "the evidence says this" and
"this is the rule".

### D-S5-7 — reason token correction: **ACCEPT**

> *"Reason token must be supported by actual live evidence. Unsupported / inaccurately named tokens are removed
> or renamed. Historical Part-II token list is superseded where evidence disproves it."*

```
D_S5_7_REASON_TOKEN_EVIDENCE_RULE = FROZEN
  A token exists only where a live, persisted (or identity-derivable) value supports it.
  A token whose NAME asserts a property its evidence does not establish is RENAMED, from the
  declaration in live code rather than from a new coinage.
  A token whose evidence is computed and discarded is WITHDRAWN, stated as a missing COLUMN.

PART_II_TOKEN_LIST = SUPERSEDED_WHERE_EVIDENCE_DISPROVES_IT
```

`D_S5_4_EXPLAINABILITY` is **unchanged and still FROZEN** — the explanation *model* was always
`CLOSED_REASON_TOKENS + numeric evidence + lineage refs`, and that model is what found the four bad members.
D-S5-7 amends the set, not the model. The frozen set is the §46 table, at seven members.

**Why withdrawal is reversible by construction.** Each withdrawal names the column whose absence causes it, so
none of the three is a judgement about the concept. If `own_supply_qty_snapshot` is ever added,
`OWN_SUPPLY_APPLIED` returns with no contract change and no re-litigation. `s5-r3-mapping-freeze.test.js` §F6
pins exactly that pairing — token absent **while** column absent — so the two can never drift apart silently.

### D-S5-8 — optional snapshot columns: **DO NOT ADD NOW**

```
D_S5_8_OPTIONAL_SNAPSHOT_COLUMNS = DEFERRED — NOT A PENDING PLAN

NEW_TABLE_REQUIRED        = NO
SCHEMA_EXTENSION_REQUIRED = NO
DB_MIGRATION_REQUIRED     = NO

own_supply_used · cross_company_supply_used · committed_supply_used · starting_gap_qty ·
destination_warehouse_id · required_by_date (day precision) · source_company · source_warehouse_id
  = NOT_AVAILABLE, and they stay NOT_AVAILABLE until a separate authorized round says otherwise.
```

**`NOT_AVAILABLE` is the deliverable here, not a gap in it.** The alternative to an unavailable field is not a
better field — it is a fabricated one, and §7 of this round is explicit that a number which cannot be sourced
truthfully must not be populated. A reader of a recommendation must be able to trust that a present number came
from somewhere.

Two of these are not reachable by adding a column at all, and that distinction survives this decision:

| field | class | why |
|---|---|---|
| `own_supply_used`, `cross_company_supply_used`, `committed_supply_used`, `source_warehouse_id` | **C** | computed, then discarded — a column would capture them |
| `starting_gap_qty` | **D** | never computed as a separate value; the coverage identity does not exist to be stored |
| `required_by_date` (day) | **D** | the monthly grain has no day; a column would need a policy, not a write |

So D-S5-8 defers four fields and closes two. Re-opening the four is a schema decision; re-opening the two would
first require a **business** decision about what the number means.

**This proposal is not restated again.** It was listed once in Part II §38 and is now deferred by decision.
Repeating an unexecuted proposal each round is how it quietly becomes a plan.

### Status

```
D_S5_1 = FROZEN   D_S5_2 = FROZEN   D_S5_3 = FROZEN   D_S5_4 = FROZEN
D_S5_5 = FROZEN   D_S5_6 = FROZEN   D_S5_7 = FROZEN   D_S5_8 = DEFERRED (decided)

UNRESOLVED_DECISION_COUNT   = 0
S5_DECISION_FREEZE_COMPLETE = YES
S5_MAPPING_FREEZE_COMPLETE  = YES
BEHAVIOR_CHANGED = NO   SCHEMA_CHANGED = NO   PRODUCTION_CODE_CHANGED = NO

NEXT_TASK = S5-R4 — Slice A: pure action + reason derivation
```

**End of Part IV.**
