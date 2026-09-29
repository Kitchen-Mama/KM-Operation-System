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
| D-S6-1 | **SUPERSEDED BY S6-R2 — understated here.** Overseas-origin shipments do not merely reserve nothing: they cannot be created at all, and the plan is then permanently stuck. See Part II / `D-S6-B`. | OPEN, raised |
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


---

# PART II — S6-R2 BUSINESS DECISION FREEZE

*Operator decision freeze. No implementation, no migration, no production write. Base `9c11eac`.*
Full board with options, examples and recommendations: `docs/evidence/s6-r2-decision-freeze/DECISION_BOARD.md`.
Machine-checkable half: `assets/tests/s6-r2-decision-board.test.js` (46/0).

---

## §15. Key authorities, frozen

```
FACTORY_RESERVATION_TIMING        SHIPMENT_DRAFT_CREATION (Execution Commit) — no plan transition reserves
OVERSEAS_RESERVATION_TIMING       NONE — no overseas movement addresses the reserved bucket
SOURCE_SELECTION_AUTHORITY        OPERATOR (Execution Plan From picker); the AI Plan proposes factory only
AUTOMATIC_SOURCE_PRIORITY_EXISTS  NO — marketplaces.allocation_priority is a RECEIVER priority
WEEKLY_PLAN_AUTHORITY             approves quantities AND triggers the Execution Commit on approval
                                  (it does not propose — the allocation draft does; it does not itself reserve)
CARRIER_RECOMMENDATION_OWNER      KMMR (transport method) + rate-card comparison at the plan layer
CARRIER_FINAL_SELECTION_AUTHORITY OPERATOR — the shipment resolves an EXACT rate card and never auto-switches
DESTINATION_AVAILABILITY_EVENT    WAREHOUSE_RECEIPT — `delivered` posts no inventory, ever
ROUTE_FREEZE_EVENT                CONFIRM_SHIPMENT_AND_DISPATCH
POST_DISPATCH_ROUTE_EDIT_ALLOWED  FORWARD ADVANCE ONLY — backward refused, no leg added or removed
ALREADY_FROZEN_COUNT              17
```

---

## §16. The two findings this round proved

**Overseas-origin shipping is blocked, not merely unreserved.** The Ship From picker offers an Active
overseas 3PL as a canonical source; `createShipmentFromApprovedPlan_` checks sufficiency against
`factory_stock` for whatever source the plan names, with no `is_factory_warehouse` branch; a missing row
reads `available = 0`; so every positive quantity is short and the draft is refused with
`INSUFFICIENT_FACTORY_STOCK`. Upstream, the guard asks the operator to *confirm a factory-stock overage*
against a pool whose `pool_row_found` is `false`, and that confirmation is `overridable`, so it lets the
approval through to a refusal one step later.

**An approved plan with no shipment has no exit.** The transition set is `submit / approve / reject /
cancel`; cancel requires `draft | pending_approval`, reject requires `pending_approval`, and Done requires
both `approved` and a transferred shipment. So the state is terminal in the wrong sense — and because
`approved` holds pool exposure until transfer, it permanently subtracts its full quantity from
`available_to_allocate` with no release event of any kind. A ghost reservation held at the Decision Layer.

Both are pinned as MECHANISM assertions rather than as "the bug exists", so a later round that changes
either one fails the suite and must update the decision record instead of resolving an operator decision on
the operator's behalf.

---

## §17. Decision status

```
DECISION_REQUIRED_COUNT = 7
  D-S6-A  formally supersede B-1 reserve trigger          recommend A (Shipment Draft creation)
  D-S6-B  overseas-origin shipping (supersedes D-S6-1)    recommend D for Phase 1, A for Phase 2
  D-S6-C  the approved-plan dead end (new this round)     recommend A (cancel from approved, no shipment)
  D-S6-D  movement vocabulary of seven + shipment_receipt recommend A
  D-S6-E  PO over-receipt clamp vs refuse                 recommend A (keep the clamp)
  D-S6-F  factory_stock_allocation_plans duplicate column recommend A (deprecate the second)
  D-S6-G  scope of S6 production write validation         recommend A (fold into the post-S7 gate)

PHASE2_DECISION_COUNT_IMPLEMENTED_NOW = 0
S6_DECISION_FREEZE_READY = YES — pending operator answers
NEXT_TASK = operator decisions, then S6-R3 — inventory / shipping mapping freeze
```


---

# PART III — S6-R2A OPERATOR DECISION FREEZE

*Decision acceptance. No runtime implementation, no migration, no production write. Base `61ca8e5`.*
Round evidence: `docs/evidence/s6-r2a-decision-freeze/ACCEPTANCE.md`.
Machine-checkable half: `assets/tests/s6-r2a-decision-freeze-guards.test.js`.

All seven decisions are FROZEN by the operator. Every token below is asserted by that suite, which reads
them out of THIS document — so a freeze that is deleted here fails the suite.

---

## §18. The seven frozen decisions

```
D_S6_A = FROZEN  option A   factory reservation trigger = Shipment Draft creation
D_S6_B = FROZEN  option A   overseas IS a Phase-1 shipping source, and must be protected
D_S6_C = FROZEN  option A   an approved plan with no shipment gets a cancellation escape
D_S6_D = FROZEN  option A   the movement vocabulary stays closed at seven
D_S6_E = FROZEN  option B   an over-receipt is refused, never silently clamped
D_S6_F = FROZEN  option A   one source-factory authority; the other is deprecated, not deleted
D_S6_G = FROZEN  option A   no standalone S6 write smoke; it joins the pre-S8 cross-system gate

UNRESOLVED_DECISION_COUNT = 0
```

### Reservation

```
FACTORY_RESERVATION_TIMING = SHIPMENT_DRAFT_CREATION
    reserve  Shipment Draft creation   ·   release  Shipment Draft cancellation
    consume  dispatch inventory movement
B-1 (Ready to Ship) is SUPERSEDED where it conflicts with deployed canonical code.

OVERSEAS_ORIGIN_SUPPORTED_PHASE1 = YES
OVERSEAS_RESERVATION_REQUIRED = YES
OVERSEAS_DOUBLE_ALLOCATION_ALLOWED = NO
The defect is NOT to be closed by removing overseas from the picker. S6-R3 determines the canonical
overseas reservation mechanism from the EXISTING overseas inventory domain — not by copying factory_stock.
```

### §2A — the overseas business role, frozen

```
FACTORY_CAN_PRODUCE = YES                         FACTORY_CAN_SHIP = YES
OVERSEAS_CAN_PRODUCE = NO                         OVERSEAS_CAN_SHIP = YES
OVERSEAS_CAN_RECEIVE_FACTORY_REPLENISHMENT = YES  OVERSEAS_CAN_TRANSFER_STOCK = YES
OVERSEAS_CAN_SUPPORT_SELF_FULFILLED_OUTBOUND = YES
CAN_ACT_AS_SHIPPING_SOURCE = YES  (both domains — but they remain SEPARATE storage models)

OVERSEAS_REFURBISH_PHASE1 = NO    OVERSEAS_REFURBISH = DEFERRED
Phase-1 overseas role: STORE -> ALLOCATE -> SHIP/TRANSFER -> TRACK LIFECYCLE -> RECEIVE.
Not manufacture, not refurbish. No refurbish status, movement, reservation or schema during S6.
```

### §2B — the overseas lifecycle to be mapped (not invented)

```
AVAILABLE -> ALLOCATED/RESERVED FOR SHIPPING -> DISPATCHED/IN TRANSIT -> DESTINATION RECEIPT
          (+ cancellation / release where applicable)
S6-R3 must express this through the EXISTING inventory-movement and shipment authorities before proposing
any schema change. Factory -> Overseas is a valid Phase-1 stock movement, and is SHIPPING EXECUTION:
it must never be read as shipping shortage -> purchase demand / Request Order / PO.
```

### Plan lifecycle · movements · receiving · source authority · validation

```
APPROVED_WITHOUT_SHIPMENT_CAN_CANCEL = YES        GHOST_PLAN_EXPOSURE_ALLOWED = NO
    allowed ONLY when no shipment has been created/transferred for that plan;
    must release exposure, restore availability, leave an auditable terminal state, delete no history,
    and may NEVER unwind a shipment that already exists.

MOVEMENT_VOCABULARY_EXPANDED = NO
    shipment_receipt is to be placed on the correct EXISTING axis/domain, not given a new type.
    No movement semantic may be silently overloaded.

PO_OVER_RECEIPT_SILENT_CLAMP = NO                 PO_OVER_RECEIPT_CAN_MUTATE_INVENTORY = NO
    refuse before any inventory mutation, returning remaining / entered / excess.
    No automatic PO increase, no exception inventory, no invented tolerance policy.

SOURCE_FACTORY_AUTHORITY_COUNT = 1
SOURCE_FACTORY_AUTHORITY = factory_stock_allocation_plans.warehouse_id
DEPRECATED_SOURCE_FACTORY_FIELD = factory_stock_allocation_plans.source_factory_warehouse_id
    DEPRECATED_NON_AUTHORITY. Not deleted, not migrated this round.

S6_LARGE_FATIGUE_DEFERRED = YES                   S6_PRODUCTION_WRITE_SMOKE_DEFERRED = YES
FUTURE_FATIGUE_GATE = PRE_S8_CROSS_SYSTEM_FATIGUE_WRITE_STABILITY_GATE
    sequence: S5 ready -> S6 ready -> S7 ready -> pre-S8 gate.
    This waives NOTHING else: focused, mutation, regression, canonical sweep and pure/harness write tests
    all remain required every round.
```

### Phase boundary (unchanged, re-frozen)

```
ORDERING_SHIPPING_ORCHESTRATION_IMPLEMENTED = NO  PHASE2_DECISION_COUNT_IMPLEMENTED_NOW = 0
WEEKLY_PLAN_AUTO_CREATES_PO = NO                  WEEKLY_PLAN_AUTO_CREATES_REQUEST_ORDER = NO
SOURCE_SELECTION_AUTHORITY = OPERATOR             AUTOMATIC_SOURCE_PRIORITY_EXISTS = NO
CARRIER_FINAL_SELECTION_AUTHORITY = OPERATOR
DESTINATION_AVAILABILITY_EVENT = WAREHOUSE_RECEIPT
ROUTE_FREEZE_EVENT = CONFIRM_SHIPMENT_AND_DISPATCH
POST_DISPATCH_ROUTE_EDIT_ALLOWED = FORWARD_ADVANCE_ONLY
ALREADY_FROZEN_COUNT = 17   (the S6-R2 rules, carried unchanged)
```

---

## §19. Two decisions were already true, and one of those is a correction I owe

**D-S6-A** matches deployed code exactly; freezing it closes the gap against the two stale planning
documents rather than changing anything.

**D-S6-E was already implemented, and both S6-R1 and S6-R2 said otherwise.** I reported a live silent clamp
and recommended keeping it, citing `FC-1A §H.4`. `FC-1A-R1 §K` had already replaced it with a typed
`PO_RECEIPT_EXCEEDS_REMAINING_QTY` refusal carrying `attempted` / `remaining` / `excess`, evaluated before
any mutation, with tolerance deliberately left unimplemented — which is precisely what the operator has now
frozen. `13_` is at `…R12`, its manifest expects `…R12`, and `63_` describes it as "the typed
`PO_RECEIPT_EXCEEDS_REMAINING_QTY` refusal (no silent clamp)". I carried a document claim forward across two
rounds without re-reading the code — the same failure this series exists to catch in other people's
documents. The decision needs no implementation.

```
ALREADY_SATISFIED_BY_DEPLOYED_CODE = D-S6-A, D-S6-E
AWAITING_S6_R3                     = D-S6-B, D-S6-C, D-S6-D  (+ D-S6-F as documentation)
```

---

## §20. S6-R3 mapping implications

Prepared, not implemented. Every answer below is from live code.

| | A · overseas reservation | B · approved-plan cancel | C · shipment_receipt | D · over-receipt | E · source factory |
|---|---|---|---|---|---|
| CURRENT_OWNER | none — no writer | 11_ `spUpdateShippingPlanStatusCore_` | declared 21_, written 31_ | 13_ `poRcvEvaluateLine_` | none — table unread |
| TARGET_OWNER | 05_/31_ overseas movement writers | the same function | the overseas domain | unchanged | `warehouse_id` |
| TABLES | `overseas_inventory_snapshot`, `overseas_inventory_movements` | `shipping_plans` | `overseas_inventory_movements` | `purchase_order_lines` | `factory_stock_allocation_plans` |
| FIELDS | `wh_reserved_stock`, `wh_available_stock`, `from_stock_type`→`to_stock_type`, `wh_before/after_reserved_stock` | `status`, `cancelled_by`, `cancelled_at`, `updated_*` | `movement_type` | — | `warehouse_id` vs `source_factory_warehouse_id` |
| SCHEMA_CHANGE_REQUIRED | **NO** | **NO** | **NO** | **NO** | **NO** |
| MIGRATION_REQUIRED | NO | NO | NO | NO | NO |
| WRITE_PATHS_AFFECTED | shipment create / cancel / dispatch, + a new overseas availability term in KMFSG | one status branch | one literal + one constant list | none | **0** |

**A — the overseas ledger already models what the reservation needs.** `overseas_inventory_movements`
declares `from_stock_type` / `to_stock_type` with `reserved` in its allowed set, and carries
`wh_before_reserved_stock` / `wh_after_reserved_stock` beside the available and physical pairs. So an
`available → reserved` movement is expressible today, on the existing header, with no column added. What
does not exist is a writer and an availability term: `KMFSG.availableToAllocate` reads factory balances only.
That is the shape of the R3 work — a second availability owner for a second domain, NOT a merged one.

**B — the escape needs no new field and no new release mechanism.** `KMFSG.PLAN_RELEASED_STATUSES` already
contains `cancelled`, so setting the status releases the exposure automatically; `cancelled_by` /
`cancelled_at` already exist and are already written by the draft/pending cancel path; and
`shipmentFindForPlan_` already answers "does a shipment exist". The change is one precondition in one branch.

**C — `shipment_receipt` is a misfiling, not a missing type.** It is declared in `FSTX_MOVEMENT_TYPES_` (the
factory vocabulary) and is on neither factory axis, while `31_` writes it onto `overseas_inventory_movements`.
The overseas domain declares no vocabulary constant at all. R3 gives the overseas domain its own declared
set and removes the type from the factory list. Seven stays seven.

**D — nothing to do.** See §19.

**E — the cheapest decision in the series.** `factory_stock_allocation_plans` has **zero** references in any
`.gs` or `.js` file in the repository. Naming `warehouse_id` the authority changes no write path and breaks
nothing; the suite asserts the zero-reference fact, so the day something starts reading the table the freeze
must be honoured in code rather than only here.

---

## §21. Position after R2A

```
S6_DECISION_FREEZE_COMPLETE = YES     UNRESOLVED_DECISION_COUNT = 0
BEHAVIOR_CHANGED = NO   PRODUCTION_ROWS_WRITTEN = 0   DB_MIGRATION_REQUIRED = NO
NEXT_TASK = S6-R3 — inventory / shipping DB + mapping freeze
```
