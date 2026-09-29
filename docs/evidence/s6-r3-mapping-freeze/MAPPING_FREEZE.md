# S6-R3 — inventory / shipping DB + mapping freeze

**Base** `fc3c67d` (gate required `6adf2e5` or descendant — satisfied) · mapping freeze only
`PRODUCTION_ROWS_WRITTEN = 0` · `BEHAVIOR_CHANGED = NO` · `DB_MIGRATION_REQUIRED = NO`

Suite: `assets/tests/s6-r3-inventory-shipping-mapping-freeze.test.js`.
Frozen tokens live in `docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md` Part IV; the suite reads them
back out of that document, so a freeze deleted there fails here.

---

## Gate

```
S3_FINAL_SEAL = YES (s4-r1 ARCHITECTURE_CENSUS)      S4_FINAL_SEAL = YES (s4-r7 FINAL_SEAL)
S5_READY_FOR_INTEGRATION = YES (s5-r8 MAINLINE_SEAL + S5 contract §3280)
S6_CONTRACT_AUDIT_COMPLETE = YES (contract §355)     S6_DECISION_FREEZE_COMPLETE = YES (contract §607)
UNRESOLVED_DECISION_COUNT = 0                        seven decisions D-S6-A … D-S6-G all FROZEN

PRE_SHA = fc3c67d   HEAD = fc3c67d   branch = feature/product-strategy-board-p0
origin/main = 2b82288   origin/feature = 2b82288   WORKTREE_CLEAN_AT_START = YES
S5_DEPLOYMENT = HOLD    S6_DEPLOYMENT = HOLD
```

---

## The finding that shapes this round

**The two inventory domains do not compute availability the same way, and that — not naming — is why they
cannot share an availability owner.**

`KMFSG.availableToAllocate` derives the physical term as `current − reserved`
(`supply-planning-factory-stock-guard.js:401`), which is 21_'s own definition of factory availability.
The overseas snapshot does not work that way. `INVENTORY_TABLE_MAPPING_SPEC.md` §3.1 is explicit:

> `wh_available_stock` = `wh_physical_stock − wh_reserved_stock − wh_damaged_stock` **where the source reports a
> reconstructable value; the snapshot may also carry a source-reported `wh_available_stock` that is not
> reconstructable from the other columns — preserve the source value.**

Two consequences, both arithmetic rather than stylistic:

1. Overseas availability is a **stored, source-reported authority bucket**. Recomputing it from the other
   columns would overwrite a 3PL's own answer with a derivation the spec says may not reconstruct it.
2. Overseas carries a **third bucket** — `wh_damaged_stock` — that the factory domain has no counterpart for.
   `current − reserved` ignores it, so feeding overseas rows through the factory arithmetic would count
   damaged units as shippable.

That is the concrete reason §2's forbidden shortcuts are forbidden. Not "the fields are named differently" —
**the same formula returns a different number, and one of them is wrong.**

### The keyspace already keeps the domains apart, for free

`KMFSG.poolKey` returns `WH:<warehouse_id>||<sku>` (or `POOL:<inventory_pool_id>||<sku>`). A pool key is
**warehouse-scoped**, so a Factory pool and an Overseas pool can never be the same key and never need summing.
Source domain identity is preserved **structurally, by the key**, not by a tag anyone has to remember to set.

```
SOURCE_DOMAIN_IDENTITY_PRESERVED = YES — by construction, not by convention
```

### Half of KMFSG is already domain-neutral

`draftExposure` and `planExposure` apply **no factory filter at all**. They key purely on the line's
`source_warehouse_id` (draft) or the header's `source_warehouse_id` (plan) plus sku. Only `normalizeBalances`
— and 71_'s `eligibleWarehouseIds` set, built from `is_factory_warehouse` — is factory-specific.

So the overseas work is **one new physical term**, not a second availability engine. The exposure half stays
single-owner and is reused byte-for-byte.

```
SECOND_AVAILABILITY_CALCULATION_PATH_CREATED = NO
```

---

## §2 — KMFSG contracts

```
CURRENT_KMFSG_INPUT_CONTRACT
  availableToAllocate({ balances, draftExposure, planExposure })
  balances     = normalizeBalances(factory_stock rows, { eligibleWarehouseIds })   [71_:117-127]
                 eligibility = warehouses.is_factory_warehouse
                 fields fac_current_stock | current_stock , fac_reserved_stock | reserved_stock
                 physical term DERIVED: available = current − reserved
  draftExposure = shipping_allocation_drafts + _lines     (DOMAIN-NEUTRAL, no factory filter)
  planExposure  = shipping_plans + shipping_plan_lines    (DOMAIN-NEUTRAL, no factory filter)
  pool key      = WH:<warehouse_id>||<sku>  |  POOL:<inventory_pool_id>||<sku>
  output field names are factory_*; contract string says "one shared factory pool"

TARGET_KMFSG_INPUT_CONTRACT = OPTION B
  separate Factory / Overseas PHYSICAL availability owners, composed above KMFSG,
  over ONE shared pool keyspace and the ONE existing exposure pair.

  KMFSG                     unchanged. Still factory balances, still `current − reserved`.
  overseas physical owner    NEW. Reads overseas_inventory_snapshot, keyed by the SAME KMFSG.poolKey,
                             physical term = STORED wh_available_stock (never recomputed).
  draftExposure/planExposure REUSED UNCHANGED for both domains.
  composition                union by pool key. Keys are warehouse-scoped, so nothing is ever summed
                             across domains and no domain tag is required.
```

Option A (one domain-tagged generic contract) is **rejected on evidence**: it would have to carry two
different physical-term formulas behind one interface, which is the merge the freeze forbids wearing a
parameter as a disguise. Option C was not needed — B reuses every existing owner and adds exactly one.

```
OVERSEAS_ADDED_BY_FILTER_LOOSENING = NO
```

### What happens today if overseas rows are fed to the factory owner

Measured, not assumed. `normalizeBalances` reads `fac_current_stock` falling back to `current_stock`. The
overseas snapshot has neither — its physical column is `wh_physical_stock` (legacy `physical_stock`). So
`cur === null` and the row lands in `unreadable`, and the guard reports an unreadable pool rather than a zero.

**It fails closed.** That is worth stating precisely because it is the one shortcut that would have looked
like it worked: `reserved_stock` *is* picked up by the fallback, so a careless reader could conclude the
mapping "mostly" lines up. It does not — the current-stock side is unreadable and the damaged bucket is
invisible.

---

## §3 — Overseas canonical stock identity

```
OVERSEAS_POOL_KEY        KMFSG.poolKey(warehouse_id, sku)  →  WH:<warehouse_id>||<sku>
WAREHOUSE_ID_FIELD       overseas_inventory_snapshot.warehouse_id
SKU_FIELD                overseas_inventory_snapshot.sku
CURRENT_STOCK_FIELD      wh_physical_stock            (legacy fallback physical_stock)
RESERVED_STOCK_FIELD     wh_reserved_stock            (legacy fallback reserved_stock)
AVAILABLE_STOCK_FIELD    wh_available_stock           (legacy fallback available_stock)
DAMAGED_STOCK_FIELD      wh_damaged_stock             — NO factory counterpart
AVAILABLE_STOCK_FORMULA  = the STORED wh_available_stock. NOT recomputed, NOT derived.
```

### R2A's field claims, verified — and one of them overstated

R2A §20 A said the ledger "declares `from_stock_type` / `to_stock_type` with `reserved` in its allowed set".

```
wh_reserved_stock            EXISTS  snapshot column (spec §3.1) + 05_ qtyFields
wh_before_reserved_stock     EXISTS  05_ OVS_MOV_HEADERS, 31_ SHIP_RECEIPT_OVS_MOV_HEADERS_
wh_after_reserved_stock      EXISTS  same two headers
from_stock_type              EXISTS  same two headers
to_stock_type                EXISTS  same two headers

OVERSEAS_RESERVED_FIELD_ALREADY_EXISTS = YES
OVERSEAS_MOVEMENT_CAN_REPRESENT_RESERVATION = YES
```

**The allowed set is not declared in code.** `available|reserved|damaged|on_the_way|none` appears once, in a
comment at `05_:296`. There is no enum constant, no validator, and no `to_stock_type` value other than
`'available'` is written anywhere — 05_:440 and 31_:611 are the only two writers and both write `'available'`.

The canonical *specification* does carry it: `INVENTORY_TABLE_MAPPING_SPEC.md` §3.2 states
`from_stock_type → to_stock_type` models `available → reserved` (hold) and `reserved → available` (release),
and names this ledger the intended reservation mechanism while stating that **no reservation logic, write path
or UI is implemented**. So the direction is canonically owned; only the enforcement is missing.

The correction matters because "comments are not code" is precisely the failure this series exists to catch,
and this time the loose sentence was **mine**, in R2A. Declaring the constant is part of R4's work — and
declaring a constant that names existing values is not expanding a vocabulary.

---

## §4 — Overseas available-to-ship

### The formula, and the one rule that keeps it correct

```
OVERSEAS_AVAILABLE_FORMULA
    available_to_allocate(pool)
      = wh_available_stock                                  (stored authority bucket)
      − active allocation-draft exposure                    (KMFSG.draftExposure, unchanged)
      − active shipping-plan exposure not yet transferred    (KMFSG.planExposure, unchanged)

  wh_reserved_stock is NOT subtracted. Ever.
```

That last line is the whole of the double-subtraction defence, and it follows from how the reservation is
written rather than from a preference. An overseas reserve is an `available → reserved` **bucket transfer**:
it decrements `wh_available_stock` and increments `wh_reserved_stock` on one movement. The reserved units are
therefore *already out of* the available bucket. Subtracting them again would remove them twice.

Note that this is a different **arithmetic** from the factory's while satisfying the identical **invariant**:

| | factory | overseas |
|---|---|---|
| reserve touches physical? | no — `fac_current_stock` untouched | no — `wh_physical_stock` untouched |
| availability expressed as | derived `current − reserved` | stored bucket, decremented |
| so availability owner must | subtract reserved | **not** subtract reserved |

Copying the factory's arithmetic across would have been the double subtraction. This is exactly what
D-S6-B §2 meant by "not by copying factory_stock".

### Lifecycle table

| STATE | CAN_ALLOCATE | ACTIVE_EXPOSURE | PHYSICAL_RESERVED | CURRENT_STOCK_REDUCED | AVAILABLE_TO_SHIP_EFFECT |
|---|---|---|---|---|---|
| no commitment | yes | — | no | no | full `wh_available_stock` |
| allocation draft `draft` / `site_confirmed` / `partially_submitted` | yes | **A** exposure only | no | no | − draft qty |
| allocation draft `submitted` / `cancelled` / `expired` | — | released | no | no | restored |
| plan `draft` / `pending_approval` / `approved`, not transferred | yes | **A** exposure only | no | no | − plan qty |
| plan `cancelled` / `completed` | — | released | no | no | restored |
| plan transferred → Shipment Draft | — | **released** (`TRANSFERRED_TO_SHIPMENT`) | **B** yes | no | − reserved, via the bucket move |
| Shipment Draft cancelled | — | — | released (**B** reversed) | no | restored |
| dispatched | — | — | released on the same row | **C** yes | already out |
| in transit / delivered | — | — | no | yes (source side) | no further effect |
| destination warehouse receipt | — | — | no | **destination** `wh_available_stock` += | + at destination only |

The handoff row is the one that matters. `planExposure` releases the moment `transferred_shipment_id` is set;
for factory, `fac_reserved_stock` takes over in the same transaction. **For overseas there is no term to take
over.** So:

```
DOUBLE_SUBTRACTION_PATH_COUNT = 0     (target mapping, given the "never subtract wh_reserved_stock" rule)
DOUBLE_ALLOCATION_PATH_COUNT  = 0     (target mapping)

DOUBLE_ALLOCATION_PATH_COUNT_TODAY = 0 — but only because overseas-origin creation is refused outright
DOUBLE_ALLOCATION_PATH_IF_SOURCE_UNBLOCKED_ALONE = 1
```

**This fixes the order of R4 and is the single most important operational finding in this round.** Unblocking
the overseas source *before* the reserve writer and the availability term exist would open a real
double-allocation hole at the plan→shipment handoff: exposure released, nothing reserved, the units free
again while a shipment holds them. The three changes must land in one commit.

### What actually happens today, measured

`createShipmentFromApprovedPlan_` (12_:430-471) runs a sufficiency pre-check **before any write**.
`factoryStockReadBalanceTx_` on a non-factory warehouse returns `{found:false, current:0, reserved:0,
available:0}`, so `0 < need` and the call returns `INSUFFICIENT_FACTORY_STOCK` with zero writes.

So an overseas-origin plan is refused at the gate — fail-closed, nothing corrupted — but the refusal says
*"Insufficient available factory stock at WH-…"* about a warehouse that is not a factory. The defect's user
surface is a **misleading refusal**, not data damage. The deeper defence (`factoryStockApplyDeltaTx_` would
throw on `afterCurrent − afterReserved < 0` and the journal would delete the row it appended) is never
reached.

---

## §5 — Overseas reserve / release / consume

| | RESERVE | RELEASE | CONSUME |
|---|---|---|---|
| EVENT | Overseas-origin Shipment Draft becomes canonical | that draft cancelled before dispatch | that shipment dispatches |
| OWNER | **new** overseas movement writer, called from 12_ `createShipmentFromApprovedPlan_` | same writer, from 12_ `handleCancelShipmentDraft_` | same writer, from 22_ dispatch |
| TABLE | `overseas_inventory_snapshot` + `overseas_inventory_movements` | same | same |
| MOVEMENT_TYPE | `reservation_acquire` | `reservation_release` | `shipment_out` |
| from → to stock type | `available` → `reserved` | `reserved` → `available` | `reserved` → `''` |
| movement_scope | `reserved_stock` | `reserved_stock` | `physical_stock` |
| RELATED_ENTITY_TYPE | `shipment` (mirrors `FSTX_RESERVATION_OWNER_TYPE_`) | `shipment` | `shipment` |
| RELATED_ENTITY_ID | `shipment_id` | `shipment_id` | `shipment_id` |
| wh_physical_stock delta | **0** | **0** | **− qty** |
| wh_available_stock delta | − qty | + qty | 0 (already out) |
| wh_reserved_stock delta | + qty | − qty | − qty (on the same row) |
| IDEMPOTENCY_IDENTITY | per-owner held quantity, `(reference_type, reference_id) = ('shipment', shipment_id)` summed from the ledger — the shape `factoryStockOwnerReservedTx_` already uses | same; releasing more than held is impossible | `reference_id = shipment_line_id + ':' + cumulative`, the shape 31_ already uses |
| ROLLBACK / RELEASE RULE | acquire tops up the shortfall only (`qty − alreadyHeld`); any failure rolls the whole draft back through the shared journal | gives back at most what this owner holds; holding nothing is a no-op, not an error | release carried on the `shipment_out` row itself — **never** a second release row |

```
OVERSEAS_RESERVE_OWNER_COUNT = 1     OVERSEAS_RELEASE_OWNER_COUNT = 1     OVERSEAS_CONSUME_OWNER_COUNT = 1
```

**Reserve consumes no physical stock** — `wh_physical_stock` is untouched by both reservation movements, which
is the overseas statement of the same invariant 21_ holds for `fac_current_stock`.

**Consume must not deduct twice**, and the factory ledger already shows exactly how that goes wrong: 21_'s
reconciliation comment records a round where excluding the `shipment_out` reserved drop produced a mismatch on
every healthy row. The rule that survives is *a dispatch writes no separate release row*, and the overseas
mapping copies that rule (not the implementation).

---

## §6 — Factory → Overseas

```
FACTORY_TO_OVERSEAS_SOURCE_OWNER       22_ dispatch → factoryStockApplyDeltaTx_
                                       (movement_type shipment_out, deltaQty −take, reservedDelta −give)
FACTORY_TO_OVERSEAS_DESTINATION_OWNER  31_ shipment receipt → overseas posting
DESTINATION_INVENTORY_INCREASE_EVENT   canonical warehouse receipt (action shipment.receipt.update)
DELIVERED_INCREASES_OVERSEAS_AVAILABLE = NO
SCHEMA_CHANGE_REQUIRED                 NO — this lifecycle is already implemented end to end
```

31_ classifies the destination by the **existing** canonical overseas eligibility (`is_active` and NOT
`is_factory_warehouse`); platform / FBA / blank / factory / inactive / unknown destinations succeed with **no**
local posting, which is correct — FBA stock is `amazon_inventory_snapshot`'s, never this table's. Posting is
exactly-once against the ledger by `reference_id = shipment_line_id + ':' + cumulative`, reconciled from the
ledger rather than the in-request delta, so a crash between the `shipment_received_qty` write and the
inventory write repairs itself on the next call. `delivered_date` is an editable shipment field and drives
nothing; only the receipt handler posts.

**Factory → Overseas is the one overseas lifecycle that already works completely.** The destination half of
D-S6-B needs nothing. Only the source half is missing.

---

## §7 — Overseas → destination

```
OVERSEAS_TO_FBA_SUPPORTED_BY_MODEL            YES   destination_type = marketplace
OVERSEAS_TO_OVERSEAS_SUPPORTED_BY_MODEL       YES   destination_type = warehouse
OVERSEAS_SELF_FULFILLED_SUPPORTED_BY_MODEL    YES   at the inventory / shipment model level
SEPARATE_SHIPMENT_ENGINE_PER_SOURCE_TYPE      NO
```

`destination_type` is `warehouse | marketplace`, derived from the destination identity (16_:2632, 69_:129) and
never from whether a column happened to be non-blank. The shipment header carries `source_warehouse_id` and
`destination_warehouse_id` as independent endpoints with no source-type branch anywhere. So one engine already
covers all three, and all three are blocked by the same single missing thing: the source-side availability and
reservation term.

Model support and external execution are separated as §7 requires: a self-fulfilled outbound is representable
as a shipment today; whether an OMS executes it is **not S6 work and none is proposed**.

---

## §8 — Shipping source identity

```
SOURCE_WAREHOUSE_ID_OWNER
    allocation layer   shipping_allocation_draft_lines.source_warehouse_id
                       (header recommended_source_warehouse_id is the fallback)
    decision layer     shipping_plans.source_warehouse_id
    execution layer    shipments.source_warehouse_id  →  shipment_lines carry it per line
SOURCE_DOMAIN_OWNER            warehouses.is_factory_warehouse + warehouses.warehouse_type   (DERIVED)
SOURCE_DOMAIN_INFERENCE_AMBIGUOUS = NO
SOURCE_DOMAIN_COLUMN_REQUIRED     = NO — and one must NOT be added
```

`warehouse_id` + canonical `warehouse_type` **is** sufficient, and the derivation is unambiguous because the
precedence is the same in both owners that apply it: `isFactory` is tested first and wins in
`inventory-compat.buildCandidates`, and `overseasImportWarehouseIssue_` (05_) rejects an `isFactory` warehouse
from the overseas domain before it looks at anything else. A warehouse that does not resolve is fail-closed,
which is a refusal and not an ambiguity. Source candidates are structurally `FACTORY ∪ 3PL` — `buildCandidates`
admits nothing else into `from`.

Adding a `source_domain` column would be a second copy of a fact two master fields already carry, and this
repository's own record of duplicated state is that it eventually disagrees.

---

## §9 — Approved-plan cancellation (D-S6-C)

```
APPROVED_CANCEL_OWNER      11_ spUpdateShippingPlanStatusCore_ — the `cancel` branch (11_:1155-1164)
NO_SHIPMENT_PROOF          shipmentFindForPlan_(ss, planId) === ''      (12_:188)
                           scans `shipments` for shipping_plan_id | source_shipping_plan_id | plan_id.
                           NOT UI state, NOT the plan's own transferred_shipment_id column.
STATUS_TRANSITION          approved → cancelled
EXPOSURE_RELEASE_OWNER     KMFSG.PLAN_RELEASED_STATUSES — `cancelled` is ALREADY in the set.
                           No new release mechanism; setting the status releases the exposure.
AUDIT_FIELDS               cancelled_by, cancelled_at, updated_by, updated_at, note   (all already written)
APPROVED_WITH_SHIPMENT_CAN_CANCEL = NO
GHOST_PLAN_EXPOSURE_AFTER_CANCEL  = NO
SCHEMA_CHANGE_REQUIRED            = NO
```

Today the precondition is `curStatus !== 'draft' && curStatus !== 'pending_approval'` → refuse. The change is
**one precondition in one branch**: admit `approved` when and only when `shipmentFindForPlan_` returns empty.

Why an existing shipment must forbid it, in the model's own terms: once the plan is transferred, its plan
exposure is already released (`TRANSFERRED_TO_SHIPMENT`) and the shipment's reservation holds the units.
Cancelling the plan at that point would release nothing and change nothing about the physical hold — it would
only make the plan lie about a shipment that exists. The refusal is not a safety margin; it is the only
truthful answer.

The ghost is real and it is the reason D-S6-C exists: an approved plan with no shipment sits in
`PLAN_EXPOSURE_STATUSES` forever with no terminal transition available, holding pool exposure permanently.

---

## §10 — Movement vocabulary, and a count that was wrong

```
FACTORY_MOVEMENT_ENUM   FSTX_MOVEMENT_TYPES_ (21_:378) — DECLARED, 7 entries:
    inventory_import · manual_adjustment · po_receipt · reservation_acquire
    reservation_release · shipment_out · shipment_receipt
  axis membership:
    FSTX_RESERVED_AXIS_TYPES_ = [reservation_acquire, reservation_release]
    FSTX_CURRENT_AXIS_TYPES_  = [inventory_import, manual_adjustment, po_receipt, shipment_out]
    → shipment_receipt is on NEITHER factory axis.

OVERSEAS_MOVEMENT_ENUM  NONE DECLARED. There is no constant anywhere for the overseas domain.
  live literals actually written to overseas_inventory_movements:
    manual_adjustment   05_:437   (handleAdjustOverseasInventory_)
    shipment_receipt    31_:610   (shipment receipt posting)

SHIPMENT_RECEIPT_CURRENT_CLASSIFICATION
    declared in the FACTORY list, on neither factory axis, and written ONLY to the OVERSEAS ledger.
    grep-verified: nothing writes shipment_receipt to factory_stock_movements.
SHIPMENT_RECEIPT_TARGET_CLASSIFICATION
    the OVERSEAS declared vocabulary; removed from FSTX_MOVEMENT_TYPES_.

MOVEMENT_VOCABULARY_EXPANDED = NO
```

**"Seven stays seven" was a cross-domain count, and §10 gives explicit permission to correct it.** The seven
were never seven *factory* movements: one of them belongs to the other domain. After R4:

```
factory declared    6   inventory_import · manual_adjustment · po_receipt
                        reservation_acquire · reservation_release · shipment_out
overseas declared   4   manual_adjustment · shipment_receipt
                        reservation_acquire · reservation_release
```

No new type name is invented and no existing semantic is overloaded. `reservation_acquire` /
`reservation_release` appear in the overseas list carrying **exactly** the meaning they already carry in the
factory domain, against the overseas domain's own buckets — which is reuse of a settled vocabulary in a second
domain, not expansion of it.

I am flagging that reading explicitly rather than burying it: if the operator intends D-S6-D to mean *no type
name may appear in a domain it does not appear in today*, then the overseas reservation needs a naming
decision before R4 and this line is the place to say so. My reading is that D-S6-D forbids **inventing**
semantics, and this invents none.

---

## §11 — PO over-receipt (re-verified only)

```
OVER_RECEIPT_VALIDATION_OWNER   13_ poReceiptEvaluateLine_   (13_:2356)
VALIDATION_BEFORE_MUTATION      YES
SILENT_CLAMP_PATH_COUNT         0
```

The refusal runs in the **collect** pass (13_:2504-2530) while `journal` is still empty, returns
`PO_RECEIPT_EXCEEDS_REMAINING_QTY` with `attempted` / `remaining` / `excess` / `ordered` / `completed` and
`zero_write: true`, and fails the **whole** request closed. `if (recv > maxRecv) recv = maxRecv;` exists
nowhere. **DO NOT TOUCH.**

### A name I had wrong for three rounds

The function is **`poReceiptEvaluateLine_`**. `poRcvEvaluateLine_` does not exist — it appears only in my own
`s6-r2a/ACCEPTANCE.md` §and the contract's §20 table. Both are corrected in this commit. The prefix `poRcv`
is real (`poRcvTruthy_`), which is presumably how I produced a plausible name and never checked it. The
verdict it supported was right; the citation was not, and a citation nobody can grep is worth nothing.

---

## §12 — Source-factory authority

```
factory_stock_allocation_plans — references in shipped .gs / .js:
    warehouse_id                     READ 0   WRITE 0
    source_factory_warehouse_id      READ 0   WRITE 0
    the TABLE ITSELF                 0 references (only the R2A guard suite names it)

SOURCE_FACTORY_AUTHORITY        factory_stock_allocation_plans.warehouse_id
DEPRECATED_NON_AUTHORITY_FIELD  factory_stock_allocation_plans.source_factory_warehouse_id
SOURCE_FACTORY_AUTHORITY_COUNT  1
MIGRATION / DELETION THIS ROUND NO
```

One disambiguation that matters for anyone grepping later: the string `source_factory_warehouse_id` **does**
occur in shipped code — as a diagnostic output field of the S5 pool census
(`supply-planning-factory-site-allocation.js:35`, and the frozen census JSON in the S5 suite). That is a
different object: a computed field name on a report, not the deprecated column on this table. The deprecated
column has zero readers because the table has zero readers.

Freezing this costs nothing today and is worth doing precisely because it is free: the day something starts
reading that table, the choice is already made and asserted.

---

## §13 — Schema decision

```
NEW_TABLE_REQUIRED       NO
SCHEMA_EXTENSION_REQUIRED NO
DB_MIGRATION_REQUIRED    NO
```

How the existing schema carries the frozen model, field by field:

| need | existing field | owner |
|---|---|---|
| overseas physical | `overseas_inventory_snapshot.wh_physical_stock` | 05_ import |
| overseas availability | `overseas_inventory_snapshot.wh_available_stock` | 05_ import / adjust, 31_ receipt |
| overseas reservation balance | `overseas_inventory_snapshot.wh_reserved_stock` | **no writer yet** — R4 |
| reservation audit trail | `overseas_inventory_movements.wh_before/after_reserved_stock` | header exists in both writers |
| reservation transition | `from_stock_type` → `to_stock_type` | columns exist; constant to be declared |
| reservation owner lineage | `reference_type` + `reference_id` | mirrors the factory ledger's related_entity pair |
| exactly-once identity | `reference_id` | 31_ already uses `line:cumulative` |
| source domain | `warehouses.is_factory_warehouse` + `warehouse_type` | derived, §8 |
| approved-plan cancel audit | `shipping_plans.cancelled_by` / `cancelled_at` | already written by the draft/pending path |
| "does a shipment exist" | `shipments.shipping_plan_id` | `shipmentFindForPlan_` |
| shipment qty immutability | `shipment_lines.shipment_qty` absent from `SHIPMENT_EDITABLE_FIELDS_` | 12_ |
| receipt cumulative | `shipment_lines.shipment_received_qty` | 31_ |

`BUSINESS_TRUTH_NOT_REPRESENTABLE_TODAY` = **none.** Every fact the frozen model needs has a column.

One pre-R4 **data-state** check, which is not a schema gap: 05_ and 31_ both still carry legacy-header
fallbacks (`available_stock`, `reserved_stock`, `physical_stock`) "until the live sheet is renamed". Whether
the production sheet has been renamed to the `wh_*` namespace is a fact about the sheet, not the schema, and
R4 should confirm it before relying on a canonical header being present.

---

## §14 — Write owner map

```
FACTORY_RESERVE_OWNER    21_ factoryStockAcquireReservationTx_        OWNER_COUNT 1
FACTORY_RELEASE_OWNER    21_ factoryStockReleaseReservationTx_        OWNER_COUNT 1
FACTORY_CONSUME_OWNER    22_ dispatch → 21_ factoryStockApplyDeltaTx_ OWNER_COUNT 1
   every factory balance mutation funnels through factoryStockApplyDeltaTx_ — one invariant gate.

OVERSEAS_RESERVE_OWNER   TARGET: one new overseas movement writer (05_/31_ domain)   TODAY: none
OVERSEAS_RELEASE_OWNER   TARGET: the same writer                                     TODAY: none
OVERSEAS_CONSUME_OWNER   TARGET: the same writer, called from 22_                    TODAY: none
   OWNER_COUNT 1 each in the target. One writer, three events — mirroring 21_'s shape, not its code.

SHIPPING_PLAN_STATUS_OWNER   11_ spUpdateShippingPlanStatusCore_        OWNER_COUNT 1
SHIPMENT_DRAFT_CREATION_OWNER 12_ createShipmentFromApprovedPlan_       OWNER_COUNT 1
SHIPMENT_DISPATCH_OWNER      22_ (CSD_MOV_TYPE_ = shipment_out)         OWNER_COUNT 1
WAREHOUSE_RECEIPT_OWNER      31_ shipment receipt + overseas posting    OWNER_COUNT 1
ALLOCATION_DRAFT_WRITE_OWNER 16_ sadAtomicUpsertCore_                   OWNER_COUNT 1
```

### Dormant / parallel write-shaped paths

```
61_ weeklyAiPlanPersistenceDeps_          SAFE_DORMANT   (classification refined — see below)
```

R1 recorded this as "builds a complete KMPR/KMPL persistence object that is never used". **Measured precisely
this round: the function IS called** — `61_:243`, on every enabled generation — and the object it returns,
including `lockedApply` → `KMPL.executeLockedPersistence` → `rpoKeyedDeltaWrite_`, is passed as parameter 4 to
`weeklyAiPlanGenerateK2_`.

`weeklyAiPlanGenerateK2_` then **never references `deps` again** in its ~780-line body. Verified by count: one
occurrence in the file region, the parameter declaration itself. It writes exclusively through
`handleUpsertShippingAllocationDraftAtomic_` — the same endpoint manual save uses, which funnels to the one
allocation-draft writer.

```
SECOND_SHIPPING_WRITE_PATH_COUNT = 0
classification = SAFE_DORMANT — constructed, passed, and ignored.
```

Two reasons to keep watching it rather than relaxing: the whole path is additionally staged off
(`INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false`, `00_config.gs:88`), so it is dormant twice over; and a
fully-wired second writer that is inert only because one callee declines to use its argument becomes a real
second write path the moment someone "fixes" an unused parameter. **Not removed in R3**, per §14. Pinned by a
mutant.

---

## §15 — Quantity authority

```
SHIPPING_QTY_OWNER   shipping_plan_lines.approved_qty
                     (requested_qty until approval; at submit approved := requested, 11_:751)
SHIPMENT_QTY_OWNER   shipment_lines.shipment_qty  — copied from approved_qty at creation (12_:622)
                     IMMUTABLE: absent from SHIPMENT_EDITABLE_FIELDS_, and 12_:1076 states it is the
                     immutable Execution Snapshot.
RECEIPT_QTY_OWNER    shipment_lines.shipment_received_qty — CUMULATIVE, written by 31_
                     remaining = max(shipment_qty − shipment_received_qty, 0), runtime-derived

PARTIAL_RECEIPT_PERMITTED   YES — cumulative receipt is the designed mechanism; `received` is reached when
                            every line's shipment_received_qty == shipment_qty
PARTIAL_SHIPMENT_PERMITTED  NO at the plan→shipment boundary: creation transfers the whole approved qty and
                            marks the plan transferred. Partial fulfilment is expressed by receipt, not by
                            a second shipment off the same plan (one plan → at most one shipment).

S5_RECOMMENDATION_IS_SHIPPING_QTY_AUTHORITY = NO
REQUEST_ORDER_IS_SHIPPING_QTY_AUTHORITY     = NO
PO_IS_SHIPPING_QTY_AUTHORITY                = NO
```

---

## §16 — Failure / idempotency

| write | LOCK_OWNER | IDEMPOTENCY_KEY | STALE_TOKEN | DUPLICATE_REPLAY | UNKNOWN_OUTCOME_POSSIBLE | AUTOREPLAY |
|---|---|---|---|---|---|---|
| factory reserve | 12_'s `fcLock_`, held across the whole creation | per-owner held qty from the ledger | plan `transferred_shipment_id` | tops up shortfall only; a full replay is `ALREADY_RESERVED`, zero delta | yes (client-side) | **NO** |
| factory release | 12_ cancel lock | per-owner held qty | shipment status | holding nothing → `NO_RESERVATION`, no-op | yes | **NO** |
| factory consume | 22_ dispatch lock | shipment status + ledger | shipment status | reserved drop carried on the `shipment_out` row; no second release row | yes | **NO** |
| **overseas reserve/release/consume** | **TARGET**: the same 12_/22_ locks, so the reservation is in the shipment's own transaction | `(reference_type, reference_id) = ('shipment', shipment_id)` summed from the ledger | same | same shapes | yes | **NO** |
| approved cancel | 11_ `spTxn` journal + lock | plan status is the guard: a second cancel finds `cancelled`, not `approved`, and is refused | plan `status` | naturally idempotent | yes | **NO** |
| receipt | 31_ lock | `reference_id = shipment_line_id + ':' + cumulative` | cumulative level | same cumulative → proven no-op | yes | **NO** |

```
AUTOREPLAY_PRESENT = NO   UNKNOWN_OUTCOME_POSSIBLE = YES (client-side, per ACK_UNKNOWN — held, never replayed)
```

**Implementation debt recorded for R4**, not resolved here: the overseas ledger has no `LockService` usage of
its own outside `handleAdjustOverseasInventory_`. The target mapping puts overseas reserve/release/consume
**inside the calling shipment transaction's lock** rather than giving the overseas writer a second independent
lock — two locks over one logical commit is how a half-written reservation becomes reachable. R4 must either
use the caller's lock or prove the two-lock ordering, and it must journal through the caller's journal so a
rolled-back shipment cannot leave a reservation behind.

---

## §17 — Phase boundary

```
CROSS_MAINLINE_AUTO_EXECUTION_COUNT = 0
PHASE2_ORCHESTRATION_COUNT          = 0
REFURBISH_IMPLEMENTATION_COUNT      = 0
```

Nothing in the frozen mapping creates purchase demand from a shipping shortage, creates a Request Order or PO
from a Shipping Plan, creates a Shipment from a Request Order or PO, creates production from an overseas
shortage, invokes refurbish, or crosses lead-time orchestration between S5 and S6. Factory → Overseas remains
classified as **shipping execution**, per §2B.

---

## §18 — Implementation slices

```
R4  Overseas availability + reserve / release / consume.
    MUST land as ONE change: the overseas physical availability term, the reserve writer, and the
    source unblock. Shipping any subset — especially the source unblock alone — opens the
    double-allocation path documented in §4.
    Includes: the declared overseas movement vocabulary constant; the from/to stock-type allowed set.

R5  Approved-plan cancellation + ghost-exposure closure.
    One precondition in 11_'s cancel branch, gated on shipmentFindForPlan_. No schema, no new field.
    Small and independent — it could bundle with R6 if R4 runs long.

R6  Movement/receipt mapping correction + source authority record.
    shipment_receipt leaves FSTX_MOVEMENT_TYPES_; the overseas vocabulary declares it.
    Bundling note: R6's vocabulary constant is a PREREQUISITE of R4's reservation types, so if the
    constant lands in R4 then R6 is only the factory-list removal and the source-authority note.

R7  Shipping operator / read-model integration + lifecycle truth.
    The overseas source stops being offered-then-refused; availability is shown per domain.

R8  S6 closing / integration-readiness seal.
```

Large fatigue and the production write smoke remain deferred to the pre-S8 cross-system gate (D-S6-G).

---

## Results

```
FOCUSED   s6-r3-inventory-shipping-mapping-freeze   152 passed / 0 failed
MUTATION  6 caught / 6 planted
DEPENDENT s6-r1 · s6-r2 · s6-r2a · fc-id-r1 · fc-id-r1b · fc-summary-stability-r1   all exit 0
FILES_CHANGED  1 new suite · 1 new evidence doc · contract Part IV · 2 citation corrections
BEHAVIOR_CHANGED NO · PRODUCTION_ROWS_WRITTEN 0 · DB_MIGRATION_REQUIRED NO
APPS_SCRIPT_SYNC_REQUIRED NO · FRONTEND_DEPLOY_REQUIRED NO
```

Five assertions failed on the first run, and all five were **mine**, not the code's:

- a frozen-token value pre-escaped for a helper that already escapes;
- a cancel-branch anchor that matched the **Combined-Parent guard**, because that rule mentions
  `transition === 'cancel'` earlier in the file than the branch does;
- a `to_stock_type` pattern loose enough to read the **next column name in the header array** as a written
  value — which would have reported a header list as a writer;
- a spec quotation with the backticks in the wrong places;
- a reference walk that counted `90_generated_supply_planning_bundle.gs`, a build output that echoes every
  string in the core modules it is generated from.

The fourth is trivial. The third is the one worth keeping: a pattern that matches a *declaration* and reports
it as an *execution* is the same error class as reading a comment as code, which this series has now hit three
times in different costumes.

## Sweep

```
FULL_SWEEP_RESULT = <filled after sweep>
CANONICAL_FAILURE_SET_CHANGED = <filled after sweep>
CANONICAL_DIGEST = <filled after sweep>
WORKTREE_CLEAN_AT_END = <filled after sweep>
```
