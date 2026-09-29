# S6 — SHIPPING / INVENTORY EXECUTION MAINLINE CONTRACT

> **Document Role.** The owner-of-record for the S6 series, as `S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md`
> is for S5. It records what the Phase-1 shipping mainline **already is**, verified from live code, and the
> boundaries every later S6 round must hold.
> **Not owner for:** schema (`DATABASE_RELATIONSHIP_MAP.md`), the end-to-end business flow
> (`SUPPLY_CHAIN_SYSTEM_FLOW.md`), the Decision-Layer write contract
> (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`), the Execution-Layer record contract (`SHIPMENT_CENTER_SPEC.md`).
> **Machine-checkable half:** `assets/tests/s6-r1-shipping-mainline-contract.test.js`.

---

# PART I — S6-R1 MAINLINE CONTRACT AUDIT

*Architecture audit + existing-owner reconciliation. No runtime implementation, no migration, no production
write, no deploy. Base `5bb3fa0`.*

---

## §1. The finding that governs the whole series

**S6 is not greenfield, and it is further along than the canonical documents say.**

The Phase-1 shipping mainline is implemented end to end, deployed, and holding real factory-stock
reservations in production. What S6 needs is not construction; it is reconciliation — because at least two
canonical documents describe a system that was superseded eight rounds ago, and a round that designed from them
would build a second owner for something that already has one. That is the S5-R5 mistake with a different noun.

```
S6_IS_GREENFIELD = NO
PHASE1_SHIPPING_MAINLINE_IMPLEMENTED = YES
PHASE2_ORCHESTRATION_IMPLEMENTED = NO
```

---

## §2. The mainline, owner by owner

Every owner below was read out of live code this round. Nothing is carried from a prior report.

```
INVENTORY_STATE_OWNER        factory_stock  (factory domain)          via 21_ factoryStockReadBalanceTx_
                             overseas_inventory_snapshot (overseas)   via 05_ — SEPARATE DOMAINS, never merged
AVAILABLE_TO_SHIP_OWNER      KMFSG.availableToAllocate  (pure module), read into by 71_ fsgReadInventoryFacts_
SHIPPING_ALLOCATION_OWNER    16_ sadAtomicUpsertCore_  (via handleUpsertShippingAllocationDraftAtomic_)
SHIPPING_RECOMMENDATION      61_ handleGenerateWeeklyAiPlanDraft_ -> weeklyAiPlanGenerateK2_  (writes THROUGH 16_)
WEEKLY_PLAN_OWNER            11_ shippingPlanCommitFromLines_  — the single shipping_plans mutation authority
SHIPMENT_DRAFT_OWNER         12_ createShipmentFromApprovedPlan_  — the ONLY creator of a shipments row
CARRIER_OWNER                17_ (rate cards + lead times master) · 11_ rough quote · 12_ exact rate card
SHIPMENT_EXECUTION_OWNER     22_ handleConfirmShipmentAndDispatch_
SHIPMENT_STATUS_OWNER        12_ handleUpdateShipment_ (allowlisted) · 31_ receipt/route promotions
ROUTE_LEG_OWNER              22_ snapshots shipment_routes at dispatch · 31_ advances the current point
ON_THE_WAY_OWNER             57_ shipment workspace (include-gated) -> global-logistics-map.js
PO_SOURCE_ALLOCATION_OWNER   32_ slaApplyExecution_  (FIFO against purchase_order_lines)
FINAL_OUTPUT_OWNER           34_ (immutable post-dispatch snapshot) — the S7 seam

SECOND_SHIPPING_CALCULATION_PATH_COUNT = 0
SECOND_SHIPPING_WRITE_PATH_COUNT = 0
```

### The one name that is a constraint rather than a label

`createShipmentFromApprovedPlan_` **must** stay the only creator of a `shipments` row, and the factory-stock
primitives **must** stay only in `21_`. Both are pinned by name in the suite, because both are exactly what a
Phase-2 orchestration round would duplicate without noticing. FC-1A's central finding was that `21_`'s own
comment claimed *"No second stock-mutation implementation lives in any other file"* while `22_` carried its own
inline `setValue` + movement append — the comment described the ownership somebody wished for. The check is now
an equality over the whole handler surface rather than a sentence.

---

## §3. The dormant second write path

`61_` builds a complete `KMPR`/`KMPL` `WEEKLY_SHIPPING` persistence dependency object on **every** generation —
lock acquisition, optimistic token, staged plan apply, keyed delta write — and hands it to
`weeklyAiPlanGenerateK2_`, which **never touches it**. The live write goes through `16_`'s atomic allocation
endpoint, which `61_` itself declares as its only write handler.

```
DORMANT_WRITE_CONSTRUCTOR_COUNT = 1   (61_ weeklyAiPlanPersistenceDeps_)
LIVE_ALLOCATION_DRAFT_WRITERS   = 1   (16_ sadAtomicUpsertCore_)
```

It is harmless today and it is the exact shape that made S5-R5 name the wrong owner: a real, complete,
plausible writer that nothing calls. Pinned as **dormant** rather than tolerated — the day anything starts
using it, the suite fails and the round that did it has to say so. Removal is proposed in slice R7, not here,
because deleting code is a runtime change and this is an audit round.

---

## §4. Available-to-Ship — already canonical, already implemented

```
AVAILABLE_TO_SHIP_ALREADY_IMPLEMENTED = YES
AVAILABLE_TO_SHIP_OWNER   = KMFSG.availableToAllocate
AVAILABLE_TO_SHIP_GRAIN   = pool = warehouse_id || sku      (NEVER narrowed by company)
AVAILABLE_TO_SHIP_FORMULA =
    factory_available_stock = fac_current_stock - fac_reserved_stock
    available_to_allocate   = factory_available_stock
                              - active allocation-draft exposure
                              - active shipping-plan exposure NOT yet transferred to a shipment
```

Three properties worth stating, because each one is a decision somebody could reverse by accident:

- **The pool is never company-filtered.** Company / country / marketplace are the *destination*; a factory
  supplies all of them, so exposure has to be summed across every company before anything is compared. That is
  the opposite of the scope filter every other read in this system applies.
- **Shipment exposure needs no term of its own.** A shipment's claim already lives in `fac_reserved_stock`, so
  `current − reserved` has already subtracted it. Adding a shipment term would be the same carton twice — which
  is also why a plan stamped `transferred_shipment_id` stops counting.
- **A negative headroom is reported, not clamped.** Clamping to zero would hide the size of an existing breach.

The lifecycle matrix is written as data, per table, because a status name that means one thing on an allocation
draft means another on a shipping plan. `submitted` holds exposure on a draft *line* and releases it on a draft
*header*; `rejected` is absent from both plan sets on purpose, because reject writes the status back to `draft`.

---

## §5. Reservation — one owner type, three events, derived lifecycle

```
RESERVATION_OWNER    21_ factoryStockAcquireReservationTx_ / factoryStockReleaseReservationTx_
RESERVATION_IDENTITY related_entity_type = 'shipment'  +  related_entity_id = <shipment_id>
                     keyed on origin factory warehouse_id + sku
RESERVE_EVENT        Shipment Draft creation (the Approved-Plan -> Draft Execution Commit)   12_:660
RELEASE_EVENT        cancelShipmentDraft (draft | ready_to_ship)                             12_:883
                     + source_warehouse_id edit = release at old, acquire at new, one lock   12_:1132
CONSUME_EVENT        Confirm Shipment & Dispatch — deduction and release in ONE movement row 22_:258
LIFECYCLE            DERIVED: Sum(acquire) - Sum(release) per owner per (warehouse, sku). Never stored.
```

**`RESERVE_EVENT` is the correction this audit owes.** Two canonical documents
(`SUPPLY_CHAIN_SYSTEM_FLOW.md` §5.4 / §11 B-1 and `DATABASE_RELATIONSHIP_MAP.md` §6.0) state that reservation
happens at the **Ready to Ship** transition, that Create Shipment Draft does **not** reserve, and that *"no
reserve write exists in code; Implementation / Runtime / Deployment Not Started."* All three statements were
true when written and all three are now false: F1-7N-FC-1A moved the reserve to Shipment Draft creation and
implemented it, and `12_`/`21_`/`22_` are at `F1-7N-FC-1A-R1`, unchanged since the last deployed baseline — so
the reservation is **live in production**. The documents are annotated as superseded rather than rewritten,
because superseding B-1 is the operator's call, not an editor's.

Why the earlier trigger was the wrong one, on the evidence: the collision used to surface at **Confirm
Shipment**, after documents were prepared. Reserving at the Execution Commit moves it to the moment the claim is
made. Measured with 1000 on hand and two sites each wanting 800 — Site A's draft is created, Site B's is
**refused with zero partial rows**, and Site B is unblocked by Site A's cancellation rather than by a timer.

**Double-use risks, and what closes each:**

| risk | closed by |
|---|---|
| two Shipment Drafts on the same physical units | the reservation itself — availability is `current − reserved` |
| two allocation drafts / plans on the same units | draft + plan exposure in `availableToAllocate` |
| a dispatch releasing another shipment's hold | release is owner-scoped (`factoryStockOwnerReservedTx_`) |
| a dispatch releasing more than it holds | `min(held, take)`; `after_reserved >= 0` checked before any write |
| a cancelled draft still holding units | `cancelShipmentDraft` releases atomically and clears the plan handoff |
| a cancelled draft being dispatched anyway | `SHIPMENT_CANCELLED` refusal (a refusal, not an idempotent success) |
| `updateShipment{status:'cancelled'}` bypassing the release | refused **by name** with `USE_CANCEL_SHIPMENT_DRAFT` |

**One risk is NOT closed and is not new:** there is no reservation on the **overseas** side. An overseas-origin
shipment reserves nothing, because `wh_reserved_stock` has no writer — the Overseas Outbound Lock lifecycle is
specified and unimplemented. Carried as `D-S6-1`.

---

## §6. Quantity authorities — shipping demand is not purchase demand

| quantity | owner | grain | means |
|---|---|---|---|
| `fac_current_stock` / `fac_reserved_stock` | 21_ | warehouse × sku | physical / claimed |
| `available_to_allocate` | KMFSG | pool | headroom for a NEW claim |
| allocation draft `planned_qty` | 16_ (operator) / 61_ (AI proposal) | draft line | proposal, commits nothing |
| `shipping_plan_lines.requested_qty` | 11_ at Submit Plan | plan line | the decision |
| `shipping_plan_lines.approved_qty` | 11_ at approval | plan line | the approved decision |
| `shipment_lines.shipment_qty` | 12_ at Execution Commit | shipment line | **immutable** execution snapshot |
| `shipment_line_allocations.allocated_qty` | 32_ FIFO | shipment line × PO line | which PO supplied it |
| `shipment_received_qty` | 31_ | shipment line | what arrived |

```
SHIPPING_QTY_AUTHORITY      = shipping_plan_lines.approved_qty -> shipment_lines.shipment_qty
SHIPPING_REQUIRED_QTY_IS_PURCHASE_DEMAND    = NO
S5_RECOMMENDATION_IS_SHIPPING_QTY_AUTHORITY = NO
SECOND_SHIPPING_QUANTITY_AUTHORITY_COUNT    = 0
```

`shipment_lines.shipment_qty` is absent from `SHIPMENT_EDITABLE_FIELDS_` and written by no handler after
creation. That immutability is what keeps the reservation matching the shipment, and it is pinned — the day it
becomes editable the two silently diverge.

---

## §7. The two mainlines, and the one place they touch

```
SHIPMENT_NEED_AUTO_CREATES_REQUEST_ORDER = NO      REQUEST_ORDER_AUTO_CREATES_SHIPMENT = NO
SHIPMENT_NEED_AUTO_CREATES_PO            = NO      PO_AUTO_CREATES_SHIPMENT            = NO
S5_RECOMMENDATION_AUTO_SHIPMENT          = NO      WEEKLY_PLAN_AUTO_CREATES_PO / RO    = NO
```

The single seam is `shipment_line_allocations` (32_), and its direction is the safe one: a shipment that
**already exists** consumes PO supply by FIFO (`order_date` ASC → `po_no` ASC → `purchase_order_line_id` ASC).
It is a **supply-source** axis, never a demand trigger. It reads PO lines and writes only its own rows; the
`shipped_qty` mutation belongs to dispatch, not to the draft stage.

`S5_FACTS_VISIBLE_TO_S6` = factory stock, PO completion/remaining, warehouse master, SKU logistics, forecast
share. `S5_EXECUTION_ARTIFACTS_VISIBLE_TO_S6` = `purchase_order_lines` (as FIFO supply, through 32_ only).
Neither includes a recommendation, a recommended quantity, or a request-order row.

---

## §8. Status, movement and write truth

**Shipment status is a closed set**, declared as data and enforced on write:

```
SHIPMENT_PRE_DISPATCH_STATUSES_  draft · ready_to_ship
SHIPMENT_DISPATCHED_STATUSES_    shipped · in_transit · arrived · received · closed
                                 completed · delivered · partial_received
+ cancelled (only via cancelShipmentDraft)   + stuck (recognised, not reachable by advance)
```

`updateShipment` had **no allowlist** until FC-1A-R1: it wrote whatever string arrived, so
`status:'cancelled'` would have persisted with zero reservation release — units held by a shipment nobody can
dispatch, availability permanently reduced for stock physically on the floor, no error and no evidence except a
ledger nobody was reading. Cancellation is now refused by name and an unrecognised status is refused too,
because a shipment in an unknown status is invisible to every page that filters by the known set.

**The movement vocabulary is seven**, and the asymmetry in it is the most double-countable fact in the ledger:

```
declared      inventory_import · manual_adjustment · po_receipt · reservation_acquire ·
              reservation_release · shipment_out · shipment_receipt
current axis  inventory_import · manual_adjustment · po_receipt · shipment_out
reserved axis reservation_acquire · reservation_release
neither axis  shipment_receipt — declared in the FACTORY vocabulary but written only onto
              overseas_inventory_movements by 31_. Recorded as D-S6-10, not repaired here.

shipment_out is on the CURRENT axis only — its reservation release rides the before/after_reserved pair on the
SAME row, never a second row. A reader that sums `qty` for a physical report must exclude the reserved axis.

INVENTORY_MUTATION_OWNER_COUNT = 1   (21_ factoryStockApplyDeltaTx_ and the two reservation primitives)
```

**Write truth:**

```
SHIPPING_WRITE_IDENTITY     deterministic K2/K4 identity (SADH-K2-<fnv1a>) + execution_key witness
SHIPMENT_IDEMPOTENCY_RULE   dispatch guards on STATUS *and* physical evidence (route rows, event rows,
                            a shipment_out movement) — an interrupted Confirm can leave either one first
UNKNOWN_OUTCOME_POSSIBLE    YES — COMMITTED_UNVERIFIED / RECONCILIATION_REQUIRED are reported as unknown
AUTOREPLAY_PRESENT          NO — no timer, no self-retry, in any shipping write owner
```

---

## §9. Second-layer read cost

```
EXPANDABLE_S6_WORKSPACES   Shipment Draft / Shipment Overview (shipping-history.js)
                           Inventory Replenishment row -> Recommendation Summary + Execution Plan
FIRST_LAYER_OWNER          57_ shipment workspace  ·  60_ inventory replenishment workspace
SECOND_LAYER_OWNER         the same read — the detail travels with the scope read

FIRST_SKU_EXPAND_REQUEST_COUNT  = 0   (carrier catalogue ADOPTED from the workspace read)
SECOND_SKU_EXPAND_REQUEST_COUNT = 0
N_PLUS_ONE_RISK                 = none measured
```

The contract holds today and holds structurally: `_irAdoptCarrierCatalogue_` seeds the method registry from the
read the page already completed, and the lazy `ensureLoaded` behind it is deduped per applied scope, so the
fallback path costs at most one request per scope and never one per SKU.

---

## §10. Phase 1 vs Phase 2

```
PHASE1_S6_SCOPE
  available-to-ship from current approved/available inventory · shipping allocation draft (manual + AI)
  Submit Plan -> Weekly Shipping Plan -> approval -> Shipment Draft (+ reservation)
  carrier / rate card / customs selection · dispatch (deduct + release + route snapshot + first event)
  route point advance · receipt -> overseas inventory · cancellation · On-the-Way map · final-output snapshot

PHASE2_DEFERRED_SCOPE
  ordering <-> production lead time <-> shipping lead time <-> ETA cross-mainline orchestration
  automatic schedule coordination · carrier lead time back-propagating into ordering decisions
  overseas outbound Lock / wh_reserved_stock reservation lifecycle
  shipment consolidation (many plans -> one shipment via shipment_plan_links)

ORDERING_SHIPPING_ORCHESTRATION_IMPLEMENTED = NO
```

Verified, not assumed: no ordering owner (42_ / 43_ / 47_ / 48_) reads `carrier_lead_times`, and the ordering
draft job touches no shipping table.

---

## §11. Debt, carried

| # | debt | class |
|---|---|---|
| D-S6-1 | overseas-origin shipments reserve nothing — `wh_reserved_stock` has no writer | OPEN, not new |
| D-S6-2 | `carrier_lead_times` has no maintenance handler; rows are typed into the tab by hand | OPEN, not new |
| D-S6-3 | the dormant `KMPR` WEEKLY_SHIPPING deps in 61_ | OPEN, proposed R7 |
| D-S6-4 | `SUPPLY_CHAIN_SYSTEM_FLOW` §5.4 / §11 B-1 and `DATABASE_RELATIONSHIP_MAP` §6.0 describe a superseded reserve trigger | annotated this round; formal supersession = operator |
| D-S6-5 | `shipment_routes` / `shipment_events` are labelled *spec only* in the DB map and are written by 22_/31_ | annotated this round |
| D-S6-6 | PO over-receipt is a **clamp**, not a refusal (frozen behaviour, FC-1A §H.4) | OPEN, operator confirm |
| D-S6-7 | `shipment_plan_links` consolidation is specified and not implemented | Phase-2 |
| D-S6-8 | `getShippingMethodCandidates`, `finalizeShipmentFinalOutput`, `document.list` routed with no caller | OPEN, S7 |
| D-S6-9 | production data classification for every S6 table is unverified from the repo | OPEN, operator |
| D-S6-10 | `shipment_receipt` is declared in the factory movement vocabulary but written only onto the overseas ledger | OPEN, cosmetic |

`BLOCKING_DEBT = none` — nothing on this list stops S6-R2.

---

## §12. The S7 seam

```
S6_OUTPUTS_NEEDED_BY_S7
  the immutable post-dispatch final-output snapshot (34_), built from persisted canonical truth only
  shipment_lines.shipment_qty (physical) · shipment_line_allocations (multi-PO lineage)
  shipper/seller from company_legal_entities · consignee from destination_warehouse_id -> logistics_locations
  GS1 from sku_details · HS / origin / declared value from tax_referral_rates
  shipment_routes (leg grain) · shipment_events (append-only history)

S7_HANDOFF_FIELDS  the finalized snapshot id + its frozen party / SKU / customs / PO-number facts
```

Finalization is a **separate idempotent post-dispatch action**, deliberately outside the dispatch transaction: a
physical dispatch is never rolled back because a snapshot write failed. S6 must not pull a renderer or an
Export Center into itself.

---

## §13. Proposed S6 slices

| slice | goal | owners | write risk | decision required |
|---|---|---|---|---|
| **R2** | operator decision freeze — the six questions in the round report | docs only | none | **YES — 6** |
| **R3** | mapping/schema reconciliation seal: the two stale canonical statements, the `spec only` labels, `factory_stock_allocation_plans.warehouse_id` vs `source_factory_warehouse_id` | planning docs + a census suite | none | 1 (the duplicate column) |
| **R4** | availability + reservation seal: exercise `evaluateAiGuard` / `evaluateOverage` / `evaluateShipmentDraftAdmission` against fixtures; close the overseas reservation gap **as a decision**, not code | KMFSG, 71_, 12_, 21_ | none (no write) | 1 (D-S6-1) |
| **R5** | Shipment Draft lifecycle seal: create / edit / source-move / cancel / status allowlist, all four write-truth states | 12_, 21_ | none (fixtures) | none |
| **R6** | Weekly Plan + carrier seal: group key, rough quote vs exact rate card, the lead-time authority gap | 11_, 16_, 17_, 61_ | none | 1 (D-S6-2) |
| **R7** | execution + movement seal: dispatch, receipt, route advance, the seven-type ledger; **remove the dormant 61_ deps** | 22_, 31_, 32_, 61_ | **low — one deletion of unreachable code** | none |
| **R8** | closing readiness seal + deferred production write validation, folded into the post-S7 gate | all | none | none |

Derived from the architecture that exists, not from the shape §21 sketched: there is no "build the inventory
availability" slice because it is built, and there is a reconciliation slice because the documents are behind.

---

## §14. The closing position of R1

```
S6_CONTRACT_AUDIT_COMPLETE = YES
BEHAVIOR_CHANGED           = NO
DB_MIGRATION_REQUIRED      = NO
APPS_SCRIPT_SYNC_REQUIRED  = NO
FRONTEND_DEPLOY_REQUIRED   = NO
DECISION_REQUIRED_COUNT    = 6
NEXT_TASK                  = S6-R2 — operator shipping decision freeze
```
