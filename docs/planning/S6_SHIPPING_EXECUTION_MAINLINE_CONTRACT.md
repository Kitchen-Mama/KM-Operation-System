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
| CURRENT_OWNER | none — no writer | 11_ `spUpdateShippingPlanStatusCore_` | declared 21_, written 31_ | 13_ `poReceiptEvaluateLine_` | none — table unread |
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

---

# PART IV — S6-R3 INVENTORY / SHIPPING DB + MAPPING FREEZE

*Mapping freeze. No runtime implementation, no migration, no production write. Base `fc3c67d`.*
Round evidence: `docs/evidence/s6-r3-mapping-freeze/MAPPING_FREEZE.md`.
Machine-checkable half: `assets/tests/s6-r3-inventory-shipping-mapping-freeze.test.js`, which reads every
token below out of THIS document.

---

## §22. The domain model, frozen

```
FACTORY_OVERSEAS_STORAGE_MERGED = NO
FACTORY_OVERSEAS_RESERVATION_OWNER_MERGED = NO
OVERSEAS_PRODUCTION_SEMANTICS_ADDED = NO
CAN_ACT_AS_SHIPPING_SOURCE = YES   (both domains, separate storage models)
```

The domains are separate because their **availability arithmetic genuinely differs**, not because their
fields are named differently:

```
FACTORY_AVAILABLE_FORMULA  = fac_current_stock - fac_reserved_stock          (DERIVED, 21_/KMFSG)
OVERSEAS_AVAILABLE_FORMULA = wh_available_stock                              (STORED, source-reported)
OVERSEAS_THIRD_BUCKET = wh_damaged_stock   — no factory counterpart; the factory formula ignores it
```

`INVENTORY_TABLE_MAPPING_SPEC.md` §3.1 makes `wh_available_stock` the preserved source value where it is not
reconstructable. Applying the factory derivation to overseas rows would overwrite a 3PL's own answer and
count damaged units as shippable.

## §23. KMFSG — the frozen input contracts

```
CURRENT_KMFSG_INPUT_CONTRACT = FACTORY_BALANCES_PLUS_DOMAIN_NEUTRAL_EXPOSURE
    availableToAllocate({ balances, draftExposure, planExposure })
    balances = normalizeBalances(factory_stock, { eligibleWarehouseIds: is_factory_warehouse })
    physical term DERIVED as current - reserved
    draftExposure / planExposure apply NO factory filter — they are already domain-neutral

TARGET_KMFSG_INPUT_CONTRACT = OPTION_B
    separate Factory / Overseas PHYSICAL availability owners, composed above KMFSG,
    over ONE shared pool keyspace and the ONE existing exposure pair.

KMFSG_INPUT_CONTRACT_CHANGED = NO
OVERSEAS_ADDED_BY_FILTER_LOOSENING = NO
SOURCE_DOMAIN_IDENTITY_PRESERVED = YES
SECOND_AVAILABILITY_CALCULATION_PATH_CREATED = NO
SECOND_EXPOSURE_CALCULATION_PATH_CREATED = NO
```

Pool keys are warehouse-scoped — `WH:<warehouse_id>||<sku>` — so a Factory pool and an Overseas pool can
never be the same key and are never summed. Domain identity is preserved **structurally, by the key**.

## §24. Overseas stock identity, frozen

```
OVERSEAS_POOL_KEY = WH:<warehouse_id>||<sku>
OVERSEAS_WAREHOUSE_ID_FIELD = overseas_inventory_snapshot.warehouse_id
OVERSEAS_SKU_FIELD = overseas_inventory_snapshot.sku
OVERSEAS_CURRENT_STOCK_FIELD = wh_physical_stock     [SUPERSEDED BY R3A - see PART V §30]
OVERSEAS_RESERVED_STOCK_FIELD = wh_reserved_stock
OVERSEAS_AVAILABLE_STOCK_FIELD = wh_available_stock
OVERSEAS_DAMAGED_STOCK_FIELD = wh_damaged_stock

OVERSEAS_RESERVED_FIELD_ALREADY_EXISTS = YES
OVERSEAS_MOVEMENT_CAN_REPRESENT_RESERVATION = YES
OVERSEAS_STOCK_TYPE_ALLOWED_SET_DECLARED_IN_CODE = NO
```

The `from_stock_type` / `to_stock_type` columns exist in both live overseas movement headers, and
`INVENTORY_TABLE_MAPPING_SPEC.md` §3.2 canonically models `available -> reserved` and `reserved -> available`
on them. The **allowed set is not declared in code** — it appears once as a comment at `05_:296`, and the only
value any writer writes is `available`. Declaring that constant is R4 work and is not a vocabulary expansion.

## §25. Overseas availability and lifecycle, frozen

```
OVERSEAS_AVAILABLE_FORMULA = wh_available_stock - active_allocation_draft_exposure - active_shipping_plan_exposure
OVERSEAS_RESERVED_IS_SUBTRACTED_FROM_AVAILABLE = NO
```

An overseas reserve is an `available -> reserved` bucket transfer, so reserved units are already out of the
available bucket. Subtracting `wh_reserved_stock` as well would remove them twice. The factory subtracts its
reserved term; the overseas domain must not. Both satisfy the same invariant — a reservation moves no physical
units.

```
OVERSEAS_RESERVE_OWNER_COUNT = 1
OVERSEAS_RELEASE_OWNER_COUNT = 1
OVERSEAS_CONSUME_OWNER_COUNT = 1
OVERSEAS_RESERVE_CONSUMES_PHYSICAL_STOCK = NO
OVERSEAS_CONSUME_DEDUCTS_TWICE = NO

DOUBLE_SUBTRACTION_PATH_COUNT = 0
DOUBLE_ALLOCATION_PATH_COUNT = 0
DOUBLE_ALLOCATION_PATH_IF_SOURCE_UNBLOCKED_ALONE = 1
R4_MUST_LAND_AS_ONE_CHANGE = YES
```

`planExposure` releases on `TRANSFERRED_TO_SHIPMENT`. For factory, `fac_reserved_stock` takes over in the same
transaction; for overseas there is no term to take over. Unblocking the overseas source before the reserve
writer and the availability term exist would therefore open a real double-allocation hole at the
plan-to-shipment handoff. The availability term, the reserve writer and the source unblock land together.

```
OVERSEAS_ORIGIN_TODAY = REFUSED_AT_SUFFICIENCY_PRECHECK
    12_ createShipmentFromApprovedPlan_ -> factoryStockReadBalanceTx_ returns available 0
    -> reason INSUFFICIENT_FACTORY_STOCK, zero writes. Fail-closed; the defect's surface is a
    misleading refusal naming factory stock for a warehouse that is not a factory.
```

## §26. Transfer, destination and source identity, frozen

```
FACTORY_TO_OVERSEAS_SOURCE_OWNER = 22_ dispatch -> factoryStockApplyDeltaTx_ (shipment_out)
FACTORY_TO_OVERSEAS_DESTINATION_OWNER = 31_ shipment receipt overseas posting
DESTINATION_INVENTORY_INCREASE_EVENT = WAREHOUSE_RECEIPT
DELIVERED_INCREASES_OVERSEAS_AVAILABLE = NO
FACTORY_TO_OVERSEAS_SCHEMA_CHANGE_REQUIRED = NO

OVERSEAS_TO_FBA_SUPPORTED_BY_MODEL = YES
OVERSEAS_TO_OVERSEAS_SUPPORTED_BY_MODEL = YES
OVERSEAS_SELF_FULFILLED_SUPPORTED_BY_MODEL = YES
SEPARATE_SHIPMENT_ENGINE_PER_SOURCE_TYPE = NO
OMS_INTEGRATION_IN_S6 = NO

SOURCE_WAREHOUSE_ID_OWNER = shipping_plans.source_warehouse_id -> shipments.source_warehouse_id
SOURCE_DOMAIN_OWNER = warehouses.is_factory_warehouse + warehouses.warehouse_type
SOURCE_DOMAIN_INFERENCE_AMBIGUOUS = NO
SOURCE_DOMAIN_COLUMN_REQUIRED = NO
```

## §27. Plan lifecycle, movements, receiving, authority — frozen

```
APPROVED_CANCEL_OWNER = 11_ spUpdateShippingPlanStatusCore_
NO_SHIPMENT_PROOF = shipmentStateForPlan_   [RESTATED BY R5 — was shipmentFindForPlan_; see PART VII §49]
APPROVED_WITH_SHIPMENT_CAN_CANCEL = NO
GHOST_PLAN_EXPOSURE_AFTER_CANCEL = NO
APPROVED_CANCEL_SCHEMA_CHANGE_REQUIRED = NO
APPROVED_CANCEL_EXPOSURE_RELEASE_OWNER = KMFSG.PLAN_RELEASED_STATUSES

FACTORY_MOVEMENT_ENUM = FSTX_MOVEMENT_TYPES_
OVERSEAS_MOVEMENT_ENUM_DECLARED_TODAY = NO
SHIPMENT_RECEIPT_CURRENT_CLASSIFICATION = FACTORY_LIST_NEITHER_AXIS_OVERSEAS_WRITER
SHIPMENT_RECEIPT_TARGET_CLASSIFICATION = OVERSEAS_DECLARED_VOCABULARY
MOVEMENT_VOCABULARY_EXPANDED = NO
SEVEN_WAS_A_CROSS_DOMAIN_COUNT = YES
FACTORY_DECLARED_TYPES_AFTER_R4 = 6
OVERSEAS_DECLARED_TYPES_AFTER_R4 = 4   [RESTATED BY R6 — 6 declared, 5 written; see PART VIII §54]
NEW_MOVEMENT_SEMANTIC_INVENTED = NO

OVER_RECEIPT_VALIDATION_OWNER = poReceiptEvaluateLine_
VALIDATION_BEFORE_MUTATION = YES
SILENT_CLAMP_PATH_COUNT = 0
OVER_RECEIPT_CHANGE_REQUIRED = NO

SOURCE_FACTORY_AUTHORITY = factory_stock_allocation_plans.warehouse_id
DEPRECATED_NON_AUTHORITY_FIELD = factory_stock_allocation_plans.source_factory_warehouse_id
SOURCE_FACTORY_AUTHORITY_COUNT = 1
SOURCE_FACTORY_TABLE_REFERENCE_COUNT = 0
SOURCE_FACTORY_MIGRATION_THIS_ROUND = NO
```

## §28. Schema, quantity, write owners, boundary — frozen

```
NEW_TABLE_REQUIRED = NO
SCHEMA_EXTENSION_REQUIRED = NO
DB_MIGRATION_REQUIRED = NO
BUSINESS_TRUTH_NOT_REPRESENTABLE_TODAY = NONE

SHIPPING_QTY_OWNER = shipping_plan_lines.approved_qty
SHIPMENT_QTY_OWNER = shipment_lines.shipment_qty
RECEIPT_QTY_OWNER = shipment_lines.shipment_received_qty
SHIPMENT_QTY_IMMUTABLE = YES
PARTIAL_RECEIPT_PERMITTED = YES
PARTIAL_SHIPMENT_PERMITTED = NO
S5_RECOMMENDATION_IS_SHIPPING_QTY_AUTHORITY = NO
REQUEST_ORDER_IS_SHIPPING_QTY_AUTHORITY = NO
PO_IS_SHIPPING_QTY_AUTHORITY = NO

FACTORY_RESERVE_OWNER = factoryStockAcquireReservationTx_
FACTORY_RELEASE_OWNER = factoryStockReleaseReservationTx_
FACTORY_CONSUME_OWNER = factoryStockApplyDeltaTx_
SHIPPING_PLAN_STATUS_OWNER = spUpdateShippingPlanStatusCore_
SHIPMENT_DRAFT_CREATION_OWNER = createShipmentFromApprovedPlan_
SHIPMENT_DISPATCH_OWNER = 22_shipment_dispatch_handlers.gs
WAREHOUSE_RECEIPT_OWNER = 31_shipment_receipt_route_handlers.gs
SECOND_SHIPPING_WRITE_PATH_COUNT = 0
DORMANT_WRITE_SHAPED_PATHS = 1
DORMANT_WRITE_SHAPED_PATH_CLASSIFICATION = SAFE_DORMANT
DORMANT_PATH_REMOVED_THIS_ROUND = NO

AUTOREPLAY_PRESENT = NO
UNKNOWN_OUTCOME_POSSIBLE = YES
OVERSEAS_WRITE_USES_CALLER_LOCK_AND_JOURNAL = YES

CROSS_MAINLINE_AUTO_EXECUTION_COUNT = 0
PHASE2_ORCHESTRATION_COUNT = 0
REFURBISH_IMPLEMENTATION_COUNT = 0
```

## §29. Position after R3

```
S6_MAPPING_FREEZE_COMPLETE = YES
BEHAVIOR_CHANGED = NO   PRODUCTION_ROWS_WRITTEN = 0   DB_MIGRATION_REQUIRED = NO
NEXT_TASK = S6-R4 — first implementation slice from the frozen mapping
```

---

# PART V — S6-R3A OVERSEAS OPERATIONAL QUANTITY MODEL AMENDMENT

*Contract / business-semantics amendment. No runtime implementation, no migration, no production write.*
Base `7b8bb81`. Round evidence: `docs/evidence/s6-r3a-overseas-quantity-model/QUANTITY_MODEL.md`.
Machine-checkable half: `assets/tests/s6-r3a-overseas-quantity-model.test.js`.

This Part amends exactly ONE token frozen in Part IV. Every other Part IV token stands. The superseded
line is left in §24 with a pointer rather than rewritten, so the R3 freeze remains readable as what R3
actually decided — and `s6-r3-inventory-shipping-mapping-freeze.test.js` still pins it there.

## §30. The operator decision, frozen

```
D_S6_OVERSEAS_OPERATIONAL_QUANTITY_MODEL = A
D_S6_OVERSEAS_OPERATIONAL_QUANTITY_MODEL_STATUS = FROZEN
S6_OVERSEAS_QUANTITY_MODEL_FREEZE = YES
SUPERSEDED_S6_R3_TOKEN_COUNT = 1
```

Phase-1 overseas bucket semantics:

```
wh_available_stock  OPERATIONAL AVAILABLE — units allocatable to a new shipment reservation
wh_reserved_stock   OPERATIONAL RESERVED  — units held by a Shipment Draft, unavailable to another
wh_damaged_stock    separate NON-AVAILABLE bucket; no Phase-1 lifecycle, no refurbish semantics
wh_physical_stock   PRESENT IN SCHEMA, NOT AN OPERATIONAL AUTHORITY — unmaintained; never backfilled,
                    never derived, never used for availability, never decremented on dispatch
```

The amended token, superseding Part IV §24:

```
OVERSEAS_CURRENT_STOCK_FIELD = wh_available_stock
OVERSEAS_CURRENT_STOCK_FIELD_SUPERSEDES = wh_physical_stock (PART IV §24)
OVERSEAS_CURRENT_STOCK_DOMAIN = PHASE1_SHIPPING_EXECUTION_AND_AVAILABILITY
PHYSICAL_STOCK_DECREMENT_ON_DISPATCH = NO
OVERSEAS_PHYSICAL_STOCK_LIFECYCLE_PHASE = DEFERRED
OVERSEAS_DAMAGED_STOCK_LIFECYCLE_PHASE = DEFERRED
OVERSEAS_REFURBISH_PHASE1 = NO
```

R4A proved `wh_physical_stock` has zero writers in the entire tree — a statement about code, not about a
blank sample. A current-stock authority nothing writes is not an authority; naming one was the single
place where the R3 freeze ran ahead of live evidence.

## §31. Reservation arithmetic, frozen

```
OVERSEAS_AVAILABILITY_AUTHORITY = wh_available_stock
OVERSEAS_RESERVED_AUTHORITY = wh_reserved_stock
OVERSEAS_RESERVE_MODEL = AVAILABLE_TO_RESERVED_TRANSFER
OVERSEAS_RELEASE_MODEL = RESERVED_TO_AVAILABLE_TRANSFER
OVERSEAS_DISPATCH_MODEL = RESERVED_DECREMENT_ONLY
OVERSEAS_PHYSICAL_PARTICIPATES_IN_PHASE1_ARITHMETIC = NO
```

```
RESERVE   wh_available_stock -= qty   wh_reserved_stock += qty   wh_physical_stock unchanged
RELEASE   wh_reserved_stock  -= qty   wh_available_stock += qty   wh_physical_stock unchanged
DISPATCH  wh_reserved_stock  -= qty   wh_available_stock unchanged   wh_physical_stock unchanged
```

```
100/0 --reserve 30--> 70/30 --cancel 30--> 100/0
100/0 --reserve 30--> 70/30 --dispatch 30--> 70/0
```

Because RESERVE already moves the quantity out of `wh_available_stock`, no consumer may compute
`available - reserved` for the same pool. Part IV §25's `OVERSEAS_RESERVED_IS_SUBTRACTED_FROM_AVAILABLE
= NO` is not merely preserved by this amendment — it is the invariant the amendment depends on.

```
OVERSEAS_DOUBLE_SUBTRACTION_GUARD = RESERVED_NEVER_SUBTRACTED_FROM_AVAILABLE
OVERSEAS_CONSUME_DEDUCTS_TWICE = NO
```

## §32. Domain boundary — unchanged, restated

```
FACTORY_OVERSEAS_STORAGE_MERGED = NO
FACTORY_OVERSEAS_RESERVATION_OWNER_MERGED = NO
OVERSEAS_PRODUCTION_SEMANTICS_ADDED = NO
OVERSEAS_CAN_PRODUCE = NO
OVERSEAS_CAN_SHIP = YES
OVERSEAS_CAN_BE_TRANSFER_SOURCE = YES
OVERSEAS_CAN_RECEIVE_FACTORY_REPLENISHMENT = YES
OVERSEAS_ADDED_BY_FILTER_LOOSENING = NO
```

Adopting Option A makes the two domains' arithmetic look *similar* — both now transfer between an
available term and a reserved term — and that similarity is the new pressure on the boundary. It is not
a reason to merge. Factory availability stays DERIVED (`fac_current_stock - fac_reserved_stock`);
overseas availability stays STORED. An overseas row through `normalizeBalances` must keep failing closed
as `fac_current_stock` unreadable rather than being admitted by relaxing the factory filter.

## §33. Import field authority — the critical safety contract

```
IMPORT_FIELD_AUTHORITY_MATRIX = 5 fields classified
IMPORT_WRITES_RESERVED = NO           (target; TODAY = YES — this is the R4 blocking hazard)
ABSENT_COLUMN_SEMANTIC = NO_WRITE     (target; TODAY = WRITE_ZERO)
BLANK_CELL_SEMANTIC = NO_WRITE        (target; TODAY = WRITE_ZERO)
IMPORT_ZERO_REQUIRES_EXPLICIT_ZERO = YES
```

| FIELD | IMPORT_AUTHORITY | RUNTIME_AUTHORITY | BLANK_IMPORT_SEMANTIC | NONBLANK_IMPORT_SEMANTIC | CONFLICT_POLICY |
|---|---|---|---|---|---|
| `wh_available_stock` | YES (primary) | YES (reserve/release/receipt/adjust) | today 0 · **target NO_WRITE** | absolute set, CEILING | **GATED — see §34** |
| `wh_reserved_stock` | today YES · **target NO** | YES (reserve/release/dispatch) | today 0 · **target NO_WRITE** | today overwrite · **target IGNORED** | RUNTIME_WINS_ALWAYS |
| `wh_damaged_stock` | YES (sole) | NO (no Phase-1 writer) | today 0 · **target NO_WRITE** | absolute set, CEILING | IMPORT_WINS (no contender) |
| `wh_physical_stock` | NO (not in `qtyFields`) | NO (zero writers) | n/a — never written | n/a — never written | NOT_APPLICABLE |
| `wh_on_the_way_qty` | YES (sole) | NO | today 0 · **target NO_WRITE** | absolute set, CEILING | IMPORT_WINS (no contender) |

```
IMPORT_PROTECTION_OWNER_COUNT = 2
  SERVER  05_ handleImportOverseasInventorySnapshotBatch_   qtyFields loop, both branches
  CLIENT  assets/js/pages/overseas-stock.js                 OVERSEAS_QTY_FIELDS loop + import template
```

The client half is not cosmetic and it is not optional. `overseas-stock.js` materialises all four
quantities onto every payload row — `if (v === '') { qtyObj[f] = 0; }` for a blank cell **and for a
column that is not in the file at all** (`ci === -1`) — and then `OVERSEAS_QTY_FIELDS.forEach(function
(f) { obj[f] = qtyObj[f]; })` puts every one of them on the request. So by the time a row reaches the
server, "the operator omitted `reserved_stock`" and "the operator wrote 0" are the same request. A
server-only fix cannot recover a distinction the client has already destroyed.

The shipped import template is the delivery mechanism: it emits a `reserved_stock` column annotated
*"Number >= 0. Blank = 0."* and an example row carrying `reserved_stock: 0`. The tree currently hands
the operator a file that instructs them to zero the reservation bucket.

```
IMPORT_TEMPLATE_RESERVED_COLUMN = REMOVED (target)
IMPORT_TEMPLATE_BLANK_COMMENT_CHANGED = YES (target) — "Blank = leave unchanged"
IMPORT_DOC_OWNER = assets/specs/active/pages/OVERSEAS_STOCK_SPEC.md (Import + template sections)
```

Dropping `reserved_stock` from the template is semantically right, not merely safe: under Option A the
column means *KM's* reservations, and a 3PL has no way to report those. A source-reported reserved
quantity has no destination in the Phase-1 model, because `wh_available_stock` is already net of the
source's own holdbacks (Part IV §22 · R4A §3).

```
EXTERNAL_SYNC_ARCHITECTURE_INTRODUCED = NO
WH_AVAILABLE_EXTERNAL_SYNC_OWNER = NONE
OVERSEAS_STOCK_SOURCE_TODAY = OPERATOR_IMPORT
```

## §34. Import + active reservation invariant — FROZEN INVARIANT, GATED ARITHMETIC

The invariant is frozen and is not negotiable:

```
ACTIVE_RESERVATION_SURVIVES_IMPORT = YES (REQUIRED)
IMPORT_MAY_ZERO_ACTIVE_RESERVATION = NO
IMPORT_MAY_MAKE_RESERVED_UNITS_ALLOCATABLE_TWICE = NO
```

Preserving `wh_reserved_stock` is **necessary and not sufficient**. Given `available 70 / reserved 30`
and a refresh reporting 100, writing `100 / 30` holds 130 units against 100 — the same defect as
`100 / 0`, reached by a different route. The forbidden outcome is any post-import state in which the
reserved units are allocatable again, not merely the state in which the reserved column is zero.

What the imported `available` figure MEANS relative to a KM reservation is therefore load-bearing, and
it is not decidable from the repository:

```
IMPORT_AMBIGUITY_COUNT = 1
UNRESOLVED_IMPORT_DECISION_COUNT = 1   [SUPERSEDED BY R3B — now 0; see PART VI §48]
GATE = IMPORT_AVAILABLE_SEMANTIC   STATUS = OPEN — OPERATOR DECISION REQUIRED
                                   [RESOLVED BY R3B — Option I / GROSS frozen; see PART VI §40]
```

| OPTION | STORED AVAILABLE | RESERVED | 70/30 + refresh(100) | COST |
|---|---|---|---|---|
| **I — GROSS** *(recommended)* | `X - R`, refuse row if `X < R` | untouched | `70 / 30` | one named, ledgered subtraction |
| II — NET | `X` verbatim | untouched | `100 / 30` — **forbidden state** | requires the operator to subtract units the 3PL portal does not show them |
| III — REFUSE | not written when `R > 0` | untouched | `70 / 30`, row reported skipped | routine refreshes stop updating exactly the rows under shipment |

Option I is recommended because two established facts point at it: a KM reservation moves no physical
units (Part IV §25 · `OVERSEAS_RESERVE_CONSUMES_PHYSICAL_STOCK = NO`), and there is no outbound sync by
which a source could learn of one (R4A §10 — no WMS feed, no scheduled job, no external sync owner in
either direction). A source figure therefore necessarily counts the units KM is holding.

It is nonetheless **not frozen here**, because the argument assumes the imported file is a faithful
source export rather than one the operator has already netted by hand. That is an operational fact about
how the file is produced, and no amount of code reading can settle it. Under Option I a hand-netted file
double-subtracts silently; under Option II a source export over-reports silently. The gate is one
sentence wide and only the operator holds the sentence.

```
IMPORT_ARITHMETIC_GUESSED = NO
IMPORT_SILENT_SUBTRACTION_INTRODUCED = NO
GATE_BLAST_RADIUS = rows with wh_reserved_stock > 0   (production count today: 0)
```

Whichever option is frozen, R4 must make the import's effect on both buckets auditable:

```
IMPORT_WRITES_MOVEMENT_ROW = YES (target)
  movement_type = inventory_import   movement_scope = available_stock
  wh_before/after_available_stock and wh_before/after_reserved_stock both real
```

## §35. Movement ledger mapping — no new vocabulary

```
NEW_MOVEMENT_TYPES_REQUIRED = 0
MOVEMENT_SCHEMA_EXTENSION_REQUIRED = NO
OVERSEAS_MOVEMENT_CAN_REPRESENT_RESERVATION = YES
```

| EVENT | movement_type | movement_scope | from_stock_type | to_stock_type | BALANCE PAIRS WRITTEN |
|---|---|---|---|---|---|
| reserve | `reservation_acquire` | `reserved_stock` | `available` | `reserved` | available + reserved (physical carried unchanged) |
| release | `reservation_release` | `reserved_stock` | `reserved` | `available` | available + reserved (physical carried unchanged) |
| dispatch | `shipment_out` | `reserved_stock` | `reserved` | `none` | reserved (available + physical carried unchanged) |
| import | `inventory_import` | `available_stock` | `''` | `available` | available + reserved |

Every name above is already declared. `reservation_acquire` · `reservation_release` · `shipment_out` ·
`inventory_import` are four of the seven types in the closed vocabulary at §8, carrying in the overseas
ledger exactly the meaning they carry in the factory one. `available` · `reserved` · `none` are three of
the five values in the `from_stock_type` / `to_stock_type` allowed set. Nothing is invented and nothing
is overloaded.

Every column the mapping needs exists on the live `overseas_inventory_movements` header, including all
three before/after balance pairs. `wh_before/after_physical_stock` are carried unchanged on every row,
exactly as `05_`'s adjustment handler already does — a ledger truthfully recording that a bucket with no
lifecycle did not move.

```
DISPATCH_RELEASE_RIDES_THE_SHIPMENT_OUT_ROW = YES
DISPATCH_WRITES_SEPARATE_RELEASE_ROW = NO
```

The dispatch row carries its own reserved drop, as `22_` already does for factory. A second
`reservation_release` row beside it would be the double count — §8 records the round that proved it.

## §36. Receiving — unchanged

```
DELIVERED_INCREASES_OVERSEAS_AVAILABLE = NO
WAREHOUSE_RECEIPT_IS_THE_INVENTORY_INCREASE_EVENT = YES
OVERSEAS_RECEIPT_OWNER_COUNT = 1
SECOND_RECEIPT_OWNER_CREATED = NO
```

`31_` adds the received delta to `wh_available_stock` and never touches `wh_reserved_stock` on an
existing row; it writes `wh_reserved_stock: 0` only when creating a row that cannot yet hold a
reservation. Received units land in the available bucket, which is where the amended model wants them.
Receiving needs no change in R4.

## §37. Schema gate

```
NEW_TABLE_REQUIRED = NO
SCHEMA_EXTENSION_REQUIRED = NO
DB_MIGRATION_REQUIRED = NO
NEW_COLUMNS_REQUIRED = NONE
TABLES_AFFECTED = NONE
BACKFILL_REQUIRED = NO
```

Every column Option A needs is live: both operational buckets on the snapshot, all three before/after
pairs plus the direction columns on the movements sheet. This amendment asks the operator to approve a
meaning, not a column.

## §38. S6-R4 implementation plan — ONE atomic change

```
R4_MUST_LAND_AS_ONE_CHANGE = YES
R4_IMPLEMENTATION_OWNER_COUNT = 8
R4_DEPLOYABLE_INTERMEDIATE_STATES = 0
```

| # | OWNER | FILE | WHAT LANDS |
|---|---|---|---|
| A | overseas availability owner | new `assets/js/core/` overseas guard + its composition point | STORED availability minus the existing draft/plan exposure pair; composed ABOVE KMFSG, never inside it |
| B | reservation acquire | `05_overseas_inventory_handlers.gs` | available -= qty, reserved += qty, one ledger row |
| C | reservation release | `05_overseas_inventory_handlers.gs` | the inverse; gives back at most what this owner holds; holding nothing is a no-op |
| D | dispatch consume | `22_shipment_dispatch_handlers.gs` | reserved -= qty on the `shipment_out` row; available and physical untouched |
| E | source enablement | `12_shipment_handlers.gs` | the sufficiency precheck and the acquire/release call sites route by source domain instead of reading `factory_stock` for a 3PL |
| F | import protection (server) | `05_overseas_inventory_handlers.gs` | reserved never written; absent column and blank cell stop meaning zero; §34's frozen arithmetic |
| F | import protection (client) | `assets/js/pages/overseas-stock.js` | stop materialising absent/blank quantities onto the payload; drop `reserved_stock` from the template |
| G | movement truthfulness | `05_` / `22_` | §35's mapping, all balance pairs real |
| H | failure atomicity | `05_` | the `05_` compensation pattern: ledger after balance, revert the balance if the ledger append throws |
| — | documentation | `assets/specs/active/pages/OVERSEAS_STOCK_SPEC.md` | import contract + template columns restated |

```
SPLIT_FORBIDDEN_ACROSS_DEPLOYS = source enablement · reservation lifecycle · dispatch consume · import protection
```

The reason is Part IV §25, unchanged and now sharper: `planExposure` releases on
`TRANSFERRED_TO_SHIPMENT`, and for overseas there is no term to take over unless the reservation writer
exists. Unblocking the source alone opens a real double-allocation hole at the plan-to-shipment handoff.
Landing the reservation lifecycle without the import protection is the mirror image of the same defect —
the first routine stock refresh after the first reservation destroys it, and the exposure ledger goes on
insisting the units are held.

```
KMFSG_INPUT_CONTRACT_CHANGED = NO
SECOND_AVAILABILITY_CALCULATION_PATH_CREATED = NO
SECOND_EXPOSURE_CALCULATION_PATH_CREATED = NO
REQUEST_ORDER_BEHAVIOR_CHANGED = NO
PO_BEHAVIOR_CHANGED = NO
S5_RECOMMENDATION_BEHAVIOR_CHANGED = NO
SHIPPING_TO_ORDERING_AUTO_ORCHESTRATION = NO
```

## §39. Position after R3A

```
S6_OVERSEAS_QUANTITY_MODEL_FREEZE = YES
UNRESOLVED_IMPORT_DECISION_COUNT = 1     [SUPERSEDED BY R3B — now 0; see PART VI §48]
S6_R4_RUNTIME_IMPLEMENTATION_AUTHORIZED = NO   [SUPERSEDED BY R3B — now YES; see PART VI §48]
BEHAVIOR_CHANGED = NO   PRODUCTION_ROWS_WRITTEN = 0   DB_MIGRATION_REQUIRED = NO
S5_READY_FOR_INTEGRATION = YES   S5_DEPLOYMENT = HOLD   S6_DEPLOYMENT = HOLD
NEXT_TASK = S6-R3B — IMPORT_AVAILABLE_SEMANTIC decision gate (§34), then S6-R4B
```

The quantity model is frozen and the schema gate is clean. R4B is held on one open business decision —
§34's gate — because R4 must land as one change and the importer is inside it.

# PART VI — S6-R3B IMPORT AVAILABLE SEMANTIC DECISION FREEZE

```
ROUND = S6-R3B   MODE = CONTRACT / BUSINESS-SEMANTICS DECISION FREEZE
BEHAVIOR_CHANGED = NO   PRODUCTION_ROWS_WRITTEN = 0   RUNTIME_IMPLEMENTED = NONE
SUPERSEDES = §34's open gate (annotated in place, not rewritten)
```

R3A froze the quantity model and stopped at one sentence it could not write: what an imported `available`
figure means when KM already holds a reservation. The operator has now written it. PART VI records the
decision, derives everything that follows from it, and implements no runtime.

## §40. The operator decision, frozen

```
D_S6_IMPORT_AVAILABLE_SEMANTIC = GROSS          STATUS = FROZEN
```

The `available` quantity an Overseas Inventory import supplies is the **source-reported** available quantity
**before** KM's internal reservation is applied. This is §34's Option I, and the operational facts behind it
are now stated by the operator rather than inferred:

```
EXTERNAL_SOURCE_KNOWS_KM_RESERVATION = NO
OUTBOUND_RESERVATION_SYNC_EXISTS = NO
CURRENT_IMPORT_COVERAGE = primarily initial available stock
DAMAGED_REWORK_AUTHORITATIVE_IMPORT_FLOW = NOT_YET_POPULATED
KM_RESERVATION_LIFECYCLE = SYSTEM_OWNED, SEPARATE
```

GROSS is **not** a reinterpretation of `wh_physical_stock`. Physical remains outside Phase-1 operational
arithmetic, exactly as §31 and §32 froze it. A source figure counting the units KM is holding is not the same
statement as a warehouse's physical count, and nothing in this amendment moves physical into the arithmetic.

## §41. The frozen import arithmetic

Given a source row reporting `available = S` and a canonical row holding `wh_reserved_stock = R`:

```
GUARD             refuse the row when S < R          <- evaluated FIRST
wh_available_stock := S - R
wh_reserved_stock  := R                              <- unchanged; import never writes it
wh_physical_stock  := untouched                      <- never in this arithmetic
```

```
IMPORT_AVAILABLE_FORMULA = S - R
IMPORT_WRITES_RESERVED = NO
ALLOCATABLE_OVERSEAS_QTY = wh_available_stock        (NOT available - reserved)
```

**§2 of the task and §5 of the task meet here, and the order settles them.** §2 writes the stored value as
`max(0, S - R)`; §5 forbids silently clamping. Both hold only if the refusal is checked **before** the
subtraction — then `S - R` is never negative and the floor never engages. Apply the floor first and §5 is
violated by construction: `max(0, 20 - 30)` is a silent clamp wearing a formula's clothes, and it erases ten
reserved units by arithmetic instead of by assignment.

```
CLAMP_REACHABLE_UNDER_GUARD = NO
IMPORT_AVAILABLE_CLAMP = NOT_REQUIRED   (redundant given the guard; the GUARD is the safety property)
```

The guard is what is frozen. Whether R4B additionally writes a `max(0, …)` floor is an implementation
detail with no reachable behaviour — but a floor that exists invites a later reordering to reach it, so the
contract names the guard and not the floor as the thing that must be true.

The worked case, end to end:

```
canonical   available 70   reserved 30
source      available 100
post-import available 70   reserved 30        <- S - R = 100 - 30

NOT 100 / 30   (130 units held against 100 — §34's forbidden state, reached by preservation alone)
NOT 100 / 0    (the reservation erased)
```

## §42. Source semantic is not operational semantic

```
SOURCE_AVAILABLE_SEMANTIC    = gross, source-reported, BEFORE KM reservation
CANONICAL_AVAILABLE_SEMANTIC = operational, AFTER KM reservation has moved units out of it
```

The import field named `available` and the canonical column `wh_available_stock` share a word and not a
meaning. They coincide exactly while `R = 0`, which is every row in production today, and that coincidence is
why the defect has never been visible: the moment the first reservation exists the two diverge by `R`.

```
COLUMN_RENAME_IN_THIS_ROUND = NO
NEW_COLUMNS_REQUIRED = NONE
```

No column is added to carry the distinction, because the distinction is between an **input** and a **stored
value**, and a stored value already exists for each. A column holding "the last source-reported gross figure"
would be a second availability authority, which §8 forbids and §34 already ruled out.

## §43. Importer ownership — the three reserved cases, frozen

Both owners are unchanged from §33 and both were re-read this round:

```
IMPORTER_CLIENT_NORMALIZATION_OWNER = assets/js/pages/overseas-stock.js
                                      OVERSEAS_QTY_FIELDS loop (blank AND absent -> 0) + import template
IMPORTER_SERVER_WRITE_OWNER         = 05_overseas_inventory_handlers.gs
                                      handleImportOverseasInventorySnapshotBatch_ qtyFields loop, BOTH branches
```

Today, on both sides, three distinct operator intents collapse into one request:

| OPERATOR INTENT | CLIENT TODAY | SERVER TODAY | REACHES THE SHEET AS |
|---|---|---|---|
| column absent from the file | `ci === -1` -> `''` -> `0` | `sv === ''` -> `0` | `0` |
| cell present but blank | `''` -> `0` | `''` -> `0` | `0` |
| operator wrote `0` | `0` | `0` | `0` |

The frozen target separates them, and for `wh_reserved_stock` it collapses them the other way — to *no
write at all*:

```
MISSING_RESERVED         -> PRESERVE canonical R   (no write)
BLANK_RESERVED           -> PRESERVE canonical R   (no write) — blank NEVER means "clear the reservation"
EXPLICIT_SOURCE_RESERVED -> IGNORED as write authority
```

**§4 asks whether the safest target is to stop accepting reserved as an import authority once the canonical
row exists. It is safer still to stop accepting it at all**, and the new-row case is the reason. A source
that reports `reserved = 5` on a SKU KM has never reserved is reporting *the source's own* holdback, not a KM
reservation; writing it would mint a KM reservation KM does not own and immediately hide five units from
allocation with no lifecycle able to release them. So:

```
IMPORT_WRITES_RESERVED = NO   (unconditionally — new rows and existing rows alike)
NEW_ROW_RESERVED_SOURCE = row initialization (0), NOT the import payload
```

An explicitly supplied source `reserved` is not an error and is not written. R4B may surface it as an
advisory diagnostic on the row result; it may not reach a cell.

## §44. New row vs existing row

The two cases are separated by the lookup the handler already performs (`bkToRow[warehouse_id|sku]`). No new
read, no new key, no second resolution path.

| CASE | R BEFORE | SOURCE S | RESULT | WHY |
|---|---|---|---|---|
| NEW row | none | 100 | `available 100 / reserved 0` | `S - 0`; reserved initialized, not imported |
| EXISTING, no reservation | 0 | 100 | `available 100 / reserved 0` | `S - 0`; identical arithmetic, not a special case |
| EXISTING, reserved 30 | 30 | 100 | `available 70 / reserved 30` | `S - R` |
| EXISTING, fully reserved | 100 | 100 | `available 0 / reserved 100` | `S - R = 0`; nothing allocatable, nothing lost |
| EXISTING, contradiction | 30 | 20 | **refused, no mutation** | §45 |

```
NEW_ROW_BEHAVIOR      = available := S      reserved := 0
EXISTING_ROW_BEHAVIOR = available := S - R  reserved := R (untouched)
ONE_ARITHMETIC_TWO_CASES = YES   (the new row is R = 0, not a different rule)
```

The new row is not given its own formula. It is the existing formula with `R = 0`, which is the property that
makes a re-import of a row that has since acquired a reservation behave correctly without anyone remembering
to update a second code path.

## §45. Contradiction — fail closed

```
CONDITION   S < R
BEHAVIOR    the row is REFUSED and NOTHING on it is written
CODE        IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE
SHAPE       per-row result { status: 'error', code: <token>, message, snapshot_id: '' }
SCOPE       ROW-level. The batch continues; other rows import normally.
```

Four outcomes are forbidden by name, because each one is a plausible-looking way to make the number fit:

```
NEGATIVE_AVAILABLE_WRITTEN     = NO
RESERVED_SILENTLY_REDUCED      = NO
AVAILABLE_SILENTLY_CLAMPED     = NO
PHYSICAL_INVENTED_TO_BALANCE   = NO
```

**Vocabulary.** The existing tokens were surveyed before a new one was named: `INSUFFICIENT_FACTORY_STOCK` is
the factory-domain refusal for a withdrawal larger than a balance; `FACTORY_RESERVATION_LEDGER_MISMATCH` is a
consistency check inside a reservation ledger; `IMPORT_WAREHOUSE_SCOPE_INVALID` / `_MISMATCH` are this
handler's own import refusals. None of them means *a source figure contradicts a reservation this system
owns*, so one token is added rather than an existing one bent to fit.

```
EXISTING_TOKEN_REUSED = NO   (surveyed; no equivalent)
NEW_TOKENS_ADDED = 1
NAMING_CONVENTION_SOURCE = 05_'s own IMPORT_* row/scope refusal prefix
```

Row-level and not batch-level, deliberately. The batch-level gate in this handler exists for a scope error
that makes the *whole file* wrong. A contradiction on one SKU says nothing about the other rows, and failing
the batch would stop a routine refresh from updating dozens of correct rows because one SKU is under
shipment — which is §34's Option III cost, arriving through the back door.

```
BUSINESS_DECISION_BEYOND_GROSS_REQUIRED = NO
```

The refusal follows from GROSS without a further decision: under GROSS, `S < R` asserts that the source holds
fewer units than KM has already committed, and there is no truthful post-import state — so the truthful act is
to write nothing and say which row and why.

## §46. Import template contract

```
IMPORT_TEMPLATE_DECISION = A — REMOVE `reserved_stock` FROM THE SHIPPED TEMPLATE
```

The shipped template today emits a `reserved_stock` column commented *"Number >= 0. Blank = 0."* with an
example row carrying `0`. Under GROSS that is a file instructing the operator to clear a KM-owned lifecycle
value, and the comment states the exact rule §43 forbids.

Option B — keep the column, ignore it as a write authority — was rejected for one reason: a column that is
shipped, filled in, uploaded and then silently discarded teaches the operator that they control a number they
do not. The template is documentation that happens to be a file.

```
IMPORT_TEMPLATE_RESERVED_COLUMN = REMOVED
IMPORT_TEMPLATE_BLANK_COMMENT = "Blank = leave unchanged"   (for the remaining quantity columns)
TEMPLATE_REMOVAL_IS_SUFFICIENT = NO
```

**Removal is necessary and not sufficient**, and this is the same shape of finding as §34's. The template is
not the only way a file acquires a column: an operator-built or previously-downloaded file may still carry
`reserved_stock`, and the client resolves columns by header name, not by template. The guarantee is §43's
server-side rule that reserved is never written. The template removal stops the system *teaching* the hazard;
the code change stops it *being* one.

## §47. Ownership and the authorization boundary — restated, unchanged

```
KM_RESERVATION_AUTHORITY_COUNT = 1          OWNER = the S6-R4B reservation lifecycle
IMPORTER_IS_RESERVATION_OWNER = NO
RECEIVING_IS_RESERVATION_OWNER = NO
EXTERNAL_SOURCE_IS_RESERVATION_OWNER = NO
SECOND_RESERVATION_LIFECYCLE = NONE
SECOND_AVAILABILITY_CALCULATION_PATH = NONE
```

```
RECOMMENDATION_RESERVES_INVENTORY = NO
SCHEDULED_CALCULATION_RESERVES_INVENTORY = NO
RESERVATION_ACQUIRED_ONLY_BY = the authorized shipping execution path
AUTO_CREATE_SHIPMENT = NO   AUTO_SUBMIT_SHIPPING_PLAN = NO
REQUEST_ORDER_TOUCHED = NO  PO_TOUCHED = NO
S5_S6_AUTHORITY_SEPARATION = INTACT
```

Automation calculates and recommends; Submit is the human authorization boundary. This amendment moves
nothing across it.

## §48. Schema gate and position after R3B

```
NEW_TABLE_REQUIRED = NO        SCHEMA_EXTENSION_REQUIRED = NO
DB_MIGRATION_REQUIRED = NO     NEW_COLUMNS_REQUIRED = NONE
BACKFILL_REQUIRED = NO         TABLES_AFFECTED = NONE
DB_CHANGE_DECISION_REQUIRED = NO
```

Nothing in GROSS needs a column. `S` is an input and is not stored; `R` is stored and is not written by the
import; the subtraction happens in the handler between a payload value and a cell it already reads.

```
BACKFILL_REQUIRED = NO — and the reason is worth recording: every production overseas row has
wh_reserved_stock = 0 today, so S - R === S for all of them and no historical row is mis-stated by the
frozen semantic. The decision has no retroactive effect. It has only a forward one.
```

### What GROSS changes about R4B's ordering

One consequence is worth carrying into R4B, because it re-prioritises §38's owner F. Freezing
`IMPORT_WRITES_RESERVED = NO` makes the **client's** blank-and-absent collapse harmless *for reserved* — the
server will ignore that field whatever the client puts on the payload. It does nothing for the other three:

```
CLIENT_COLLAPSE_BLAST_RADIUS_AFTER_R3B:
  wh_reserved_stock   NEUTRALISED by the server-side ignore
  wh_available_stock  UNCHANGED — a file missing the column still zeroes available (or, with R > 0,
                      now trips §45's guard and refuses, which is safer but is not the fix)
  wh_damaged_stock    UNCHANGED
  wh_on_the_way_qty   UNCHANGED
```

So the client fix is still required and is still inside the one atomic change; what changed is that the
server rule now protects the one bucket that had a lifecycle, and the client rule protects the three that do
not.

```
S6_OVERSEAS_QUANTITY_MODEL_FREEZE = YES
S6_IMPORT_SEMANTIC_FREEZE = YES
UNRESOLVED_IMPORT_DECISION_COUNT = 0
OPEN_S6_BLOCKERS = NONE
S6_R4_RUNTIME_IMPLEMENTATION_AUTHORIZED = YES
BEHAVIOR_CHANGED = NO   PRODUCTION_ROWS_WRITTEN = 0   DB_MIGRATION_REQUIRED = NO
S5_DEPLOYMENT = HOLD    S6_DEPLOYMENT = HOLD
NEXT_TASK = S6-R4B — overseas availability + reserve/release/consume + shipping-source enablement
```

R4B inherits §38's eight owners unchanged, plus three obligations from this round: the §41 guard evaluated
before the subtraction, the `IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE` token registered where the
repository registers canonical codes, and the template column removed with the blank comment rewritten.

---

# PART VII — S6-R5: THE APPROVED-PLAN CANCELLATION, IMPLEMENTED

## §49. What R5 changed about §27's frozen tokens

`NO_SHIPMENT_PROOF` named `shipmentFindForPlan_`, and that function could not carry the claim. It answered
with a string, and the empty string meant three different things: there is no shipment, there is no
`shipments` sheet in this spreadsheet, and this sheet has no column that references a plan. Every caller it
had reads all three the same way — as "creation is still pending" — which is safe, because the answer it
offers is a retry.

Cancellation is the first caller for which they are not the same. It RELEASES exposure, so reading "could
not tell" as "there is none" would release the hold of a plan whose shipment is alive and reserving
against it. `12_` therefore answers in three values — `EXISTS` / `ABSENT` / `UNKNOWN` — and
`shipmentFindForPlan_` became a projection of it with its contract bit-for-bit unchanged, so its existing
callers did not move.

```
NO_SHIPMENT_PROOF = shipmentStateForPlan_   (12_, the shipments owner)
SHIPMENT_STATE_VALUES = EXISTS | ABSENT | UNKNOWN
ABSENT_IS_A_POSITIVE_FINDING = YES     the sheet was read, it carries a plan reference, no row names it
UNKNOWN_MAY_BE_SPENT_AS_ABSENT = NO    UNKNOWN refuses; releasing on an assumption is the one mistake
                                       this path can make
TRANSFER_MARKER_MAY_ALLOW_A_CANCEL = NO   it may only REFUSE — every allow requires ABSENT from the read
```

## §50. What R5 did NOT implement, and why

The round's own §3/§4 asked for a reservation release on cancellation, with a worked example: overseas
`70 / 30`, approved plan cancelled before a Shipment exists, result `100 / 0`. **That state is unreachable
under the frozen ownership model, and R5 did not manufacture it.**

```
FACTORY_RESERVATION_OWNER_TYPE  = 'shipment'      (21_, FSTX_RESERVATION_OWNER_TYPE_)
OVERSEAS_RESERVATION_OWNER_TYPE = 'shipment'      (05_, OVSTX_RESERVATION_OWNER_TYPE_)
ACQUIRE_CALL_SITES_IN_PROJECT   = 5, all in 12_, all passing a shipment_id as the owner
PLAN_OWNED_RESERVATION_POSSIBLE = NO
```

A plan never owns a reservation. The `30` in the example could only have been reserved by a shipment, and
if a shipment exists the cancellation is refused by §0, §2 and §6. Producing `100 / 0` would require
either cancelling a plan whose Shipment owns the stock, or giving a plan a reservation of its own — a
second reservation owner, which the frozen model does not have and which R4B's §11 forbids inventing.

What a plan owns is EXPOSURE, and KMFSG DERIVES that from status:

```
PLAN_EXPOSURE_STATUSES  = draft | pending_approval | approved      (and NOT transferred)
PLAN_RELEASED_STATUSES  = cancelled | completed
PLAN_EXPOSURE_RELEASE_ON_CANCEL = the status write ITSELF — no arithmetic, no movement row
FACTORY_RESERVATION_RELEASE_ON_CANCEL  = NOT_REACHABLE (a plan holding one has a Shipment; refused)
OVERSEAS_RESERVATION_RELEASE_ON_CANCEL = NOT_REACHABLE (same reason)
```

The baton passes exactly once: a plan stops holding exposure in the same moment its shipment starts
holding a reservation, inside one lock and one journal (R4B §14). There is no window in which both count
and none in which neither does — which is why `GHOST_PLAN_EXPOSURE_AFTER_CANCEL = NO` needs no new
mechanism to be true.

## §51. The eligibility contract

```
APPROVED_WITHOUT_SHIPMENT_CAN_CANCEL = YES
APPROVED_WITH_SHIPMENT_CAN_CANCEL    = NO
CANCEL_ELIGIBLE_STATUSES = draft | pending_approval | approved
SHIPPING_PLAN_STATUS_MUTATION_OWNER       = 11_ spUpdateShippingPlanStatusCore_
SHIPPING_PLAN_STATUS_MUTATION_OWNER_COUNT = 1

REFUSAL TOKENS (all zero_write, all evaluated BEFORE the first setCell):
  PLAN_ALREADY_TRANSFERRED_TO_SHIPMENT   the plan recorded a handoff
  SHIPMENT_EXISTS_FOR_PLAN               the shipments table names one
  SHIPMENT_EXISTENCE_UNKNOWN             the question could not be answered
  SHIPMENT_STATE_SEAM_MISSING            12_ is not in this project (a mixed deployment)

CANCEL_WRITE_TRUTH_OWNER = the status read-back, inside 11_'s existing spTxn journal
CANCEL_ATOMICITY_OWNER   = the same journal + the ScriptLock 11_ already holds
PARTIAL_CANCEL_COMMIT_REACHABLE = NO — the exposure release and the status change are ONE cell write
CANCEL_CREATE_RACE_OWNER = the single ScriptLock domain both paths take
```

## §52. Schema

```
NEW_TABLE_REQUIRED = NO   NEW_COLUMNS_REQUIRED = NONE   SCHEMA_EXTENSION_REQUIRED = NO
DB_MIGRATION_REQUIRED = NO   BACKFILL_REQUIRED = NO   DB_CHANGE_DECISION_REQUIRED = NO
```

`status`, `cancelled_by` and `cancelled_at` already existed and were already written by the draft/pending
cancel path. R5 writes the same five cells for an approved plan and nothing else — no approved quantity is
rewritten to ease the transition, and no plan line is touched.

```
S6_R5_CANCELLATION_SEAL = YES
NEXT_TASK = S6-R6 — movement / receipt vocabulary + source authority closure
```

R6 inherits one open item from this round rather than a defect: §50's `NOT_REACHABLE` pair is a statement
about the CURRENT ownership model. If a later round ever wants a plan to hold stock directly, that is a
decision about reservation ownership and belongs in a decision round, not in a cancellation handler.

---

# PART VIII — S6-R6: THE MOVEMENT VOCABULARY, DERIVED FROM ITS WRITERS

## §53. The Factory vocabulary is SIX

R1 declared seven and its own axis table recorded the defect in the seventh:

```
shipment_receipt   axis: neither   table: overseas_inventory_movements
```

It was listed in the FACTORY enum so that a reader of the factory ledger could not call the type unknown.
But no factory writer has ever emitted it — the only writer is `31_`, the warehouse receipt, which appends
to the OVERSEAS ledger — so the one thing its membership bought was the opposite of what the list is for: a
`shipment_receipt` row appearing in `factory_stock_movements` would have been silently accepted as known,
when it is precisely the misfiling worth reporting. R3 measured this (`SEVEN_WAS_A_CROSS_DOMAIN_COUNT =
YES`); R6 moves the member to the domain that writes it.

```
FACTORY_MOVEMENT_ENUM_OWNER = 21_ FSTX_MOVEMENT_TYPES_
FACTORY_MOVEMENT_TYPE_COUNT = 6
FACTORY_MOVEMENT_TYPES = inventory_import · manual_adjustment · po_receipt ·
                         reservation_acquire · reservation_release · shipment_out
SHIPMENT_RECEIPT_FACTORY_ENUM_COUNT_POST = 0
```

## §54. The Overseas vocabulary is SIX declared, FIVE written

R6's instruction expected four (`reservation_acquire`, `reservation_release`, `shipment_out`,
`shipment_receipt`). Derived from the writers, that is not the set. **`manual_adjustment` is written to
`overseas_inventory_movements` by `05_`'s own adjustment handler and has been since long before R4B**, and
it was not in the declared vocabulary either. It is not a synonym and not new; it is an existing event the
declared list did not name — which is the one way a "closed" vocabulary can be wrong without anybody
noticing.

```
OVERSEAS_MOVEMENT_ENUM_OWNER = 05_ OVSTX_MOVEMENT_TYPES_
OVERSEAS_MOVEMENT_TYPE_COUNT = 6 declared, 5 written

  reservation_acquire   05_ ovsAcquireReservationTx_    available -, reserved +
  reservation_release   05_ ovsReleaseReservationTx_    available +, reserved -
  shipment_out          05_ ovsConsumeReservationTx_    reserved - only
  manual_adjustment     05_ adjustOverseasInventory     available only
  shipment_receipt      31_ shipReceiptPostToOverseas_  available +
  inventory_import      DECLARED, NOT YET WRITTEN

SHIPMENT_RECEIPT_OVERSEAS_ENUM_COUNT_POST = 1
MOVEMENT_VOCABULARY_EXPANDED = NO   no meaning was invented; two existing meanings were declared
```

`inventory_import` is kept rather than removed. PART V §35 named it deliberately and the snapshot importer
updates balances without appending a ledger row. Removing a declaration R4B made is a decision about that
round's contract, not this round's to take, and the importer growing a ledger row would be a change to the
writer rather than to the meaning.

## §55. The guard and the vocabulary are now two different things

`ovsApplyDeltaTx_` validated against the vocabulary itself, which conflated "is this a real overseas
movement type" with "may the reservation transaction write it". Widening the first would have widened the
second, and the shared transaction would have accepted a request to book a warehouse receipt through the
reservation path.

```
OVSTX_MOVEMENT_TYPES_    the ledger vocabulary (6)
OVSTX_TX_WRITABLE_TYPES_ what ovsApplyDeltaTx_ may emit (3) — a STRICT SUBSET
```

The split makes the guard **stricter** than it was: it previously accepted `inventory_import`, which no
caller passes.

## §56. Receipt, source authority and the things R6 found already correct

Audited and unchanged — each was already right, and R6 changed none of them:

```
SHIPMENT_QTY_AUTHORITY           shipment_lines.shipment_qty (IMMUTABLE once frozen)
RECEIPT_QTY_AUTHORITY            shipment_lines.shipment_received_qty (CUMULATIVE)
INVENTORY_INCREASE_QTY_AUTHORITY shipReceiptPostAmount_ = current cumulative - last posted cumulative
                                 (the DELTA, reconciled through the ledger — never shipment_qty)
PARTIAL_RECEIPT_SUPPORTED   YES
RECEIPT_REMAINING_QTY_OWNER max(shipment_qty - shipment_received_qty, 0), 31_
OVER_RECEIPT_REACHABLE      NO   shipReceiptValidateLine_ -> RECEIPT_OVER before any write
RECEIPT_IDEMPOTENCY_OWNER   shipReceiptMovementRef_ = shipment_line_id + ':' + cumulative,
                            read back out of the ledger's reference_ids
PO_OVER_RECEIPT_BEHAVIOR    REFUSE (PO_RECEIPT_EXCEEDS_REMAINING_QTY), 0 mutations, 0 clamp paths

SOURCE_FACTORY_AUTHORITY              factory_stock_allocation_plans.warehouse_id
SOURCE_FACTORY_AUTHORITY_COUNT        1
SOURCE_FACTORY_DEPRECATED_FIELD       source_factory_warehouse_id
DEPRECATED_FIELD_RUNTIME_AUTHORITY_COUNT 0    (a comment in the site-allocation core, and an OUTPUT
                                              field name in a read-only diagnostic that DERIVES it from
                                              pool.warehouse_id — neither decides anything)
COLUMN_DELETE_REQUIRED                NO
SHIPPING_SOURCE_IDENTITY   warehouse_id, end to end       SOURCE_IDENTITY_DRIFT_COUNT = 0
DELIVERED_INVENTORY_MUTATION_COUNT = 0   delivered is a STATUS; shipment_receipt is the mutation
```

```
S6_R6_MOVEMENT_RECEIPT_SEAL = YES
NEXT_TASK = S6-R7 — shipping / inventory operator read-model + end-to-end execution conformance
```
