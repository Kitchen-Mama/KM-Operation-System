# Golden Scenario #34 — Partial-Carton Order Qty, end-to-end execution evidence

> **AUTHORITY.** This document owns **no rule**. It records what was MEASURED when Golden #34 was executed
> (S8-B5-R1, 2026-10-10) and names one unresolved disagreement between frozen owners. The rules belong to
> `SUPPLY_PLANNING_CALCULATION_RULES.md` §14 / §31 / §33 / §36 / §37, the schema to
> `DATABASE_RELATIONSHIP_MAP.md`, and the Request Order / PO lifecycle to
> `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`. Where this document and any of those disagree, they win.
>
> **Executing suite:** `assets/tests/golden-34-partial-carton-e2e-s8-b5-r1.test.js` — **120 assertions, 0 failed** (S8-B5-R2; 110 at first execution).

---

## 1. The expected contract, quoted not inferred

| Owner | Clause |
|---|---|
| §33 row #34 | "override saved; Suggested unchanged; flagged user override" · invariant **independence** |
| §14 | `Suggested Order Qty = CEILING(Net Order Need ÷ UPC) × UPC`; **user Order Qty is independent of it** |
| §36.3 | user edit updates `order_qty`, **`recommended_qty` stays unchanged**; `order_qty` is **never** re-CEILING'd / FLOOR'd / rounded |
| §37 | the override survives **Send → Approval → Purchase Order**; Send is **not blocked** by a partial carton; "Request Order → PO mapping must NOT re-round the quantity up to a full carton" |
| §14 / §17 | a **missing `units_per_carton`** still blocks the *system Suggested* and Send — a different gate, on a different field |

The fixture is the canonical one: **137 units at 40 per carton** — three full boxes and 17 loose. `160` is what a
carton CEILING would produce and is used throughout as the value that must never appear as a quantity.

---

## 2. The Order Qty path, as measured

| # | Boundary | Source field → destination field | Behaviour measured | How |
|---|---|---|---|---|
| 1 | Request Order Draft line | `order_qty` → locked decision edit | copied; `recommended_qty` travels separately as a snapshot; a **fractional** `carton_qty` passes through verbatim; `T4` dropped | shipped `handleUpsertRequestOrderAllocationDraftLines_` (15_), downstream locked command recorded |
| 2 | Send Request | `t<n>_order_qty` → `requested_qty` | plain copy, no arithmetic; blank ≠ 0; non-numeric → ABSENT | shipped `rosQty_` / `rosTierField_` (66_) + the mapping line pinned |
| 3 | `request_order_lines` creation | `requested_qty` → `requested_qty`, `approved_qty` | `approved_qty` defaults to `requested_qty`; `units_per_carton` snapshotted; company split exact | shipped `handleCreateRequestOrderDraft_` (13_), real sheets |
| 4 | User decision / approval | `approved_qty` | written exactly; `recommended_qty` untouched; note persisted | shipped `handleUpdateRequestOrderLineQty_` (13_) |
| 5 | Convert to PO | `approved_qty` → `ordered_qty` | exact; `recommended_qty`, `units_per_carton`, note and `request_order_line_id` all carried | shipped `handleCreatePurchaseOrderFromRequest_` (13_) |
| 6 | PO → Shipment | **no quantity copy** | the shipment quantity comes from `shipping_plan_lines.approved_qty`; the PO participates as **capacity** (`completed_qty − shipped_qty`) through a FIFO allocation | shipped `slaAllocateShipmentLine_` / `slaBuildPlan_` (32_), plus the 12_ writer line |

**Boundary 6 is the mapping finding of this round.** §37's quantity chain **ends at the Purchase Order**.
There is no PO → Shipment Draft quantity handoff to verify, because `shipment_lines.shipment_qty` is written
from the Shipping Plan, not from `ordered_qty`. What was verified downstream instead is that the PO capacity
allocation neither rounds nor duplicates, and that company, factory and SKU identity each gate it independently.

### The quantity ledger

Every decision-carrying stage holds **137**, and **160 appears at none of them**:

`draft order_qty` · `request line approved_qty` · `request header total_qty` · `PO line approved_qty` ·
`PO line ordered_qty` · `PO header total_qty`.

`request_order_lines.requested_qty` legitimately holds the originally requested **160** — the user edit changes
the decision field only — so it is deliberately absent from that ledger and asserted separately.

---

## 3. RESOLVED — `carton_qty` is the estimated physical carton count (D-S8-B5-1 Option A)

When this scenario was first executed (S8-B5-R1) three owners said `carton_qty` was the exact ratio and "may be
fractional", while eight shipped write sites (`13_` x5, `11_` x3), two document renderers and
`OVERSEAS_INBOUND_SPEC.md` all wrote `CEILING`. The registry promotion was held and the conflict was put to the
owner rather than patched. **Adopted 2026-10-10, Option A** — see `SUPPLY_PLANNING_DECISION_REGISTER.md`
D-S8-B5-1:

- `carton_qty` = **`CEILING(qty / units_per_carton)`**, an **integer estimated physical carton count**, on
  request-order and purchase-order lines. No fractional equivalent is persisted; **no new DB column, no migration.**
- **Why the ceiling is required, not tolerated:** `carton_qty` is multiplied by **per-carton** constants
  downstream (`shipping_plan_lines.cbm = carton_qty x carton_cbm`, `shipment_lines.gross_weight =
  carton_qty x carton_weight`). A partial carton still occupies one box's volume and carries one box's packaging
  weight, so a fraction would **understate freight and customs figures**. Every document consumer
  (`{{TOTAL_CARTONS}}`, `purchase_orders.total_cartons`, the carrier `CARTON_QTY`, `carton_no_start`/`_end`)
  needs an integer, and **no consumer that wants a fraction was found.**
- **The unit quantity rule is untouched:** `order_qty` / `approved_qty` / `ordered_qty` are exact and are never
  re-CEILING'd, FLOOR'd or rounded. Nothing reconstructs a quantity as `carton_qty x units_per_carton` — the
  suite now scans the shipped sources line by line to keep it that way (C9), with a non-vacuity check (C9a).
- **The partial carton is a decomposition, not a fraction:** full boxes + loose units, as `request-order.js`
  already renders it, and derivable from any stored row — which is what makes the "no new DB column"
  override-fact contract work.
- **Contract text aligned (documentation only):** calc §36.3, calc §37, REQ_PO §7.1 and §12.15. §37's "its exact
  `carton_qty`" now reads **copied, not re-derived**, which is what `13_:1775` already does.

The C-block of the executing suite changed from *measured divergence* to *positive contract assertions* and grew
from 110 to **120 assertions, 0 failed** — nothing was removed or weakened.

---

## 4. Registry status — PROMOTED (S8-B5-R2)

**Golden Registry: 40/40 canonical scenarios executed overall** = **39 by the Allocation Runtime** + **1
downstream under §37**. Pending implementation = **0**.

`supply-planning-golden-scenarios.test.js` remains the **Allocation Runtime** acceptance, and §40.17's exclusion
of #34 from that contract is untouched: **applicable = 39, excluded = 1, `notRun = [34]`**, and the suite still
prints that the §37 downstream acceptance "is reported SEPARATELY and is NOT claimed here."

#34 carries a purpose-built status, **`EXECUTED_DOWNSTREAM`**, naming both its §37 owner and the suite that
produced the evidence. It is deliberately **not** `EXECUTED_EXISTING_CORE`: §40.17 forbids that suite to run
#34, so folding it into that status would make the Allocation Runtime claim something it never ran.

---

## 5. Open debt, recorded not closed

`15_`'s draft-line route still forwards whatever `carton_qty` the client sends — including a fraction — onto
`request_order_allocation_draft_lines`. It is **never read downstream**: `66_` forwards only `order_qty` and
`units_per_carton`, so no fractional value can reach `request_order_lines`. Left alone deliberately, because
normalizing it moves a `.gs` and would require an Apps Script sync and a release cut.
**Owner: a future bounded draft-normalization task. NOT closed.**
