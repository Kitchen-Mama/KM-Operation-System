# Golden Scenario #34 — Partial-Carton Order Qty, end-to-end execution evidence

> **AUTHORITY.** This document owns **no rule**. It records what was MEASURED when Golden #34 was executed
> (S8-B5-R1, 2026-10-10) and names one unresolved disagreement between frozen owners. The rules belong to
> `SUPPLY_PLANNING_CALCULATION_RULES.md` §14 / §31 / §33 / §36 / §37, the schema to
> `DATABASE_RELATIONSHIP_MAP.md`, and the Request Order / PO lifecycle to
> `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`. Where this document and any of those disagree, they win.
>
> **Executing suite:** `assets/tests/golden-34-partial-carton-e2e-s8-b5-r1.test.js` — **110 assertions, 0 failed.**

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

## 3. The open divergence: `carton_qty` is CEILING'd, not exact

Three owners say the same thing:

- §36.3 — `carton_qty = order_qty ÷ units_per_carton`, "**may be fractional** for an explicit partial-carton override"
- §37 — the PO conversion preserves "its **exact** `carton_qty`"
- `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §7.1 — "`carton_qty` is the **exact** `Approved Qty ÷ units_per_carton` (may be fractional)"

The shipped code writes `Math.ceil(qty ÷ upc)` at **five** sites in `13_procurement_handlers.gs`: Request Order
creation, the Manual-Allocation new-company line, the Request-Order line edit, the PO conversion's computed
fallback, and the PO line edit. **Measured: 137 at upc 40 stores `carton_qty = 4`, not `3.425`** — on the
request line and on the PO line.

**The quantity is unaffected.** `ordered_qty` is 137 at every stage; this divergence is confined to one derived
column. It is pinned by assertions C1–C5 of the executing suite so it cannot drift unnoticed, and those
assertions record **what is**, not which side is right.

**Why it is not simply a bug to fix.** `purchase_orders.total_cartons = Σ purchase_order_lines.carton_qty`
(`DATABASE_RELATIONSHIP_MAP.md`), and that total is printed on shipping and customs documents as a **physical
box count**; `OVERSEAS_INBOUND_SPEC.md` independently defines `carton_qty = CEILING(qty ÷ units_per_carton)`.
A fractional `carton_qty` would make `total_cartons` fractional. So the two readings are:

- **(a) the spec reading** — `carton_qty` is the exact ratio, and a physical box count is a separate derived value;
- **(b) the implementation reading** — `carton_qty` **is** the physical box count, and §36.3/§37/§7.1 describe the ratio loosely.

Reading (b) is already recorded in a landed assertion (`po-exactly-once-f1-5a-por2.test.js` PC4/PC12/PC21,
"the PHYSICAL box count ceilings; the quantity does not").

**This needs an owner decision, not a patch.** Resolving it in favour of (a) changes five write sites, the
`total_cartons` aggregate, document output and three landed assertions. Resolving it in favour of (b) is a
one-line correction to three documents. **No runtime change was made in this round.**

---

## 4. Registry status — deliberately unchanged

`supply-planning-golden-scenarios.test.js` is the **Allocation Runtime** acceptance. §40.17 froze #34 **out** of
that contract, and the suite prints, correctly, that "§37 downstream E2E acceptance is reported SEPARATELY and
is NOT claimed here." That accounting is untouched: **39/39 applicable executed, #34 still the one
downstream-owned exclusion.**

#34 is now **executed downstream** by the suite named at the top of this document: all four §33 clauses hold
end-to-end against the real handlers. Promoting its `executionStatus` in the canonical inventory to
`EXECUTED` is **withheld**, because §3 above is open and promotion would read as a claim that the whole §37
contract passes. It cascades into three suites and belongs in the round that closes §3 — as one coherent change.
