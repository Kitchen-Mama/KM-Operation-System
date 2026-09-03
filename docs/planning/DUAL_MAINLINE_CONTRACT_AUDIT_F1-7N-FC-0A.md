# F1-7N-FC-0A — Dual Mainline E2E Contract Audit

**PRE `f3302e0`** (the accepted F1-7N-FB-4G-A3 baseline; `origin/main` at the same commit — no divergence).
No live business mutation of any kind. Every number below is produced by
`assets/tests/dual-mainline-topology-audit-f1-7n-fc-0a.test.js`, which reads the shipped sources and executes
the two authorised stock mutators over grids it builds itself.

---

## §B — The dual-flow topology

Each stage is scored on five independent pieces of evidence taken from the shipped sources: a router dispatch,
exactly one handler owner, membership of `SYS_REQUIRED_ACTIONS_`, a browser adapter, and something in the
frontend that actually starts it. **Reachability has three legal forms** — a page calling the adapter, a module
naming the action literal, or `getWorkspace('<ns>')` which `km-api-foundation.js` turns into
`<ns>.workspace.get`. A probe that scores only the first reports six healthy readbacks as dead.

### Shipping mainline

| id | stage | action | owner | writes | class |
|---|---|---|---|---|---|
| S1 | Inventory Replenishment Summary | `inventoryReplenishment.workspace.get` | `60_` | — | CONNECTED |
| S1b | Replenishment gap materialization | `inventoryReplenishmentGap.get` | `43_` | `inventory_replenishment_gap` | CONNECTED |
| S2 | Shipping AI Plan | `weeklyAiPlan.generate` | `61_` | allocation drafts + lines | CONNECTED |
| S3 | Allocation Draft save / + Add Route | `upsertShippingAllocationDraftAtomic` | `16_` | allocation drafts + lines | COMPLETE_AND_TESTED |
| S3b | Allocation Draft readback | `getShippingAllocationDraftWorkspace` | `16_` | — | COMPLETE_AND_TESTED |
| S4 | Submit Plan | `submitAllocationDraftsToShippingPlans` | `16_` | `shipping_plans(+lines)`, draft → submitted | COMPLETE_AND_TESTED |
| S5 | Weekly Shipping Plan readback | `weeklyShipping.workspace.get` | `40_` | — | CONNECTED |
| S6 | Approve = Execution Commit → Shipment Draft | `updateShippingPlanStatus` | `11_` → `12_` | `shipping_plans`, `shipments(+lines)` | **CONNECTED_NOT_ATOMIC** |
| S6b | Shipment Draft creation **retry** | `createShipmentFromPlan` | `12_` | `shipments(+lines)` | **SERVER_ONLY** |
| S7 | Carrier / method selection | `updateShipment` | `12_` | `shipments` | CONNECTED |
| S7b | Method candidates for a shipment route | `getShippingMethodCandidates` | `17_` | — | **SERVER_ONLY** |
| S8 | Shipment document generation | `shipmentDocument.generate` | `36_` | `generated_documents` | CONNECTED |
| S8b | Shipment final-output snapshot | `finalizeShipmentFinalOutput` | `34_` | snapshot | **SERVER_ONLY** (and REQUIRED) |
| S9 | Confirm Shipment + dispatch | `confirmShipmentAndDispatch` | `22_` | shipments, routes, events, **factory_stock**, **movements** | COMPLETE_AND_TESTED |
| S11 | On the Way / route progress | `shipment.route.advance` | `31_` | routes, events, shipments | CONNECTED |
| S11b | Shipment workspace readback | `shipment.workspace.get` | `57_` | — | CONNECTED |
| S12 | Destination receiving → overseas inventory | `shipment.receipt.update` | `31_` | shipments, overseas snapshot + movements | CONNECTED |

### Purchase mainline

| id | stage | action | owner | writes | class |
|---|---|---|---|---|---|
| P1 | Order Planning calculation | `orderPlanningGap.get` | `43_` | `order_planning_gap` | CONNECTED |
| P2 | Order AI Plan (resumable job) | `requestOrderDraft.job.start` | `48_` | RO allocation drafts | CONNECTED |
| P3 | RO Allocation Draft edit | `requestOrder.allocationDraft.ensureAndEdit` | `15_` | RO drafts + lines | CONNECTED |
| P4 | Send Request | `requestOrder.send.orchestrate` | `66_` | `request_orders(+lines)` | CONNECTED |
| P5 | Request Order workspace readback | `requestOrder.workspace.get` | `51_` | — | CONNECTED |
| P6 | Request Order line qty edit | `updateRequestOrderLineQty` | `13_` | `request_order_lines` | CONNECTED |
| P7 | Request Order approval / rejection | `updateRequestOrderStatus` | `13_` | `request_orders` | CONNECTED |
| P8 | Purchase Order creation | `createPurchaseOrderFromRequest` | `13_` | `purchase_orders(+lines)` | CONNECTED |
| P10 | Document retry (PO + shipment panels) | `document.retry` | `39_` | `generated_documents` | CONNECTED |
| P10b | Document list (standalone) | `document.list` | `39_` | — | **SERVER_ONLY** (and REQUIRED) |
| P11 | PO Overview / List readback | `purchaseOrder.workspace.get` | `50_` | — | CONNECTED |
| P12 | Send PO / status advance | `updatePurchaseOrderStatus` | `13_` | `purchase_orders` | CONNECTED |
| P13 | Factory receipt → Factory Stock ↑ | `receivePurchaseOrderLines` | `13_` | PO lines, **factory_stock**, **movements** | COMPLETE_AND_TESTED |
| P14 | Manual factory stock adjustment | `adjustFactoryInventory` | `21_` | factory_stock, movements | CONNECTED |

**Every one of the 31 stages has exactly one handler owner and at least one router dispatch.** No stage is
`UI_ONLY` or `SPEC_ONLY`. **Every stage with an inventory effect is fully connected.**

---

## §K — The four measured gaps

| id | what is deployed | what is missing | severity |
|---|---|---|---|
| **S6b** | `createShipmentFromPlan` — router, handler, adapter | nothing in the frontend starts it | **HIGH** — it is the recovery the Approve failure message explicitly promises |
| **S7b** | `getShippingMethodCandidates` | no caller | MEDIUM — a shipment's method is edited freely with no candidate list |
| **S8b** | `finalizeShipmentFinalOutput` — a **REQUIRED** action | **no adapter at all** | MEDIUM — contract weight with no consumer |
| **P10b** | `document.list` — a **REQUIRED** action | no caller; panels use the workspace `include: { documents: true }` projection | LOW — superseded, not broken |

### S6 is CONNECTED_NOT_ATOMIC — measured

`handleUpdateShippingPlanStatus_` writes `status = 'approved'` and **then** calls
`createShipmentFromApprovedPlan_` inside a `try/catch` that does not undo the status. A failure there leaves an
**approved plan with no Shipment Draft**, and the page's own message says *"You can retry from Shipment
Overview"* — pointing at S6b, which nothing can start. The live census (§I) reports exactly this shape as
`APPROVED_PLAN_WITH_NO_SHIPMENT`.

---

## §G — The shared stock ledger, executed

**Closed movement vocabulary (5):** `inventory_import` · `manual_adjustment` · `po_receipt` · `shipment_out` ·
`shipment_receipt`. **Exactly three files** may append a movement: `13_`, `21_`, `22_`.

| principle | verdict | evidence |
|---|---|---|
| G.1 planning/draft actions do not change stock | **HOLDS** | A3 measured Submit Plan mutating only the plan and draft tables |
| G.2 every stock change has a movement row | **HOLDS** | executed; a mutant that deducts without a movement is caught |
| G.3 movement and snapshot are atomic | **HOLDS** | movement carries before/after; a throw after the deduction restored 1000 and removed the movement |
| G.4 shipment deduction happens exactly once | **HOLDS** | 1000 → 200; replay answers `already_confirmed` and changes not one cell |
| G.5 PO receipt increases stock exactly once | **HOLDS** | 1000 → 1200; replay under the same key adds nothing |
| G.6 reservation cannot survive deduction | **VACUOUS — see below** | |
| G.7 qualified incoming cannot survive receipt | consumed by the gap calculators, not a stored balance | |
| G.8 On the Way begins/ends at defined statuses | **HOLDS** | Confirm ends at `shipped`; `in_transit` is event-derived only |
| G.9 receiving updates the destination inventory | **HOLDS** | `31_` writes the overseas snapshot + movement |
| G.10 replay creates no duplicate movement | **HOLDS** | both mutators, executed |
| G.11 negative stock policy | **HOLDS, frozen, two implementations** | `21_` throws; `22_` refuses up front with `Insufficient factory stock … No stock was deducted` |
| G.12 warehouse identity is `warehouse_id` | **HOLDS** | one movement row per warehouse, each naming its own id |

### ⚠ G.6 — nothing ever reserves factory stock

Measured across every non-generated `.gs`: **no handler anywhere assigns a non-zero `fac_reserved_stock`.** The
column is initialised to 0, read into movement rows as `before/after`, and never written. Since
`available_factory_stock = fac_current_stock − fac_reserved_stock`, **availability always equals current stock**.

Consequence, executed: a Submit Plan and a Shipment Draft for 800 units leave availability reading the full
1000. Two sites both plan against the same physical units and neither is warned; the collision surfaces only at
`confirmShipmentAndDispatch`, which refuses with *"need 800, available 200"* — correct, safe, and **the last
possible moment**, after documents have been prepared.

This is a **product decision, not a defect to patch silently** — see §N.

### ⚠ Two stock-mutation implementations

`21_` owns `factoryStockApplyDeltaTx_`; `13_`'s PO receipt reuses it, and `13_`'s own comment states *"no second
stock-mutation implementation here"*. **`22_`'s dispatch deduction is a second one** — its own plan, its own
write, its own compensating rollback. Both honour the frozen negative-stock policy by different code. Not
broken; a duplication of authority worth a decision.

---

## §J — Cross-flow quantity conservation

| scenario | result |
|---|---|
| factory has stock → ship → deduct | 1000 − 800 = 200, one movement |
| factory short → partial ship + purchase | 700 out, 300 in, **closing 300 — ledger balances** |
| one SKU over two factory warehouses | two movements, one per `warehouse_id`, summing to 800 |
| two sites competing for one pool | second confirm **refused**, zero writes, exact shortfall named |
| PO receipt in two instalments | 300 + 200 = 500, two movements, line fully completed |
| shipment retry / PO receipt retry | no duplicate movement, no double count |
| cancelled PO receiving | refused, nothing written |
| failure after deduction | full rollback: balance restored, movement gone, status back to `ready_to_ship` |

---

## §F — A measured semantics correction

`purchase_order_lines.remaining_qty` is **`MAX(0, completed_qty − shipped_qty)`** — the quantity **received into
the factory and not yet shipped out**. It is *not* "ordered but not yet received". After a full receipt of 500
against an order of 500, `remaining_qty` is **500**, not 0. Any report reading it as an outstanding-order figure
is wrong by the whole received amount.

---

## §N — Decisions that require the user

1. **Reservation.** Should a Submit Plan / Shipment Draft hold factory stock? Options:
   **(a)** leave as is — collision detected at Confirm, simplest, already safe;
   **(b)** reserve at Shipment Draft creation and release at dispatch or cancel;
   **(c)** a soft *projected commitment* shown in the UI without a stored reservation.
   Nothing should be implemented here until this is chosen — (b) adds a release obligation to every cancel path.
2. **Stock-mutation authority.** Fold `22_`'s deduction into `21_`'s shared transaction, or keep two
   implementations and correct `13_`'s comment?
3. **S6 atomicity.** Roll the plan status back when the Shipment Draft fails, or keep the status and connect the
   S6b retry? (The retry is cheaper and preserves the approval decision.)
4. **S8b / P10b.** Connect them, or remove them from `SYS_REQUIRED_ACTIONS_`? A required action nothing calls
   makes every deployment check carry weight it does not use.

---

## §L — Proposed implementation batches

The spec's suggested grouping is kept, with **one evidence-driven change**: batches 1–2 are already
`COMPLETE_AND_TESTED` / `CONNECTED`, so the first work is not "build Submit Plan" but "close the four gaps that
already have servers". Cheap, low-risk, and it removes the one HIGH finding.

| # | batch | why here |
|---|---|---|
| **1** | **Connect S6b** (Shipment Draft retry) + make S6's failure recoverable | the only HIGH gap; the UI already promises it |
| 2 | Connect S7b (method candidates) so a shipment method is chosen from a list, not typed | same shape as the Execution Plan's registry |
| 3 | Decide §N.1 (reservation) — then implement or explicitly record "no reservation" | everything downstream depends on the answer |
| 4 | S8b / P10b: connect or de-require | contract hygiene |
| 5 | §N.2: single stock-mutation authority | after 3, so both paths change once |
| 6 | Controlled live acceptance of the **shipping** mainline end to end | it is the more complete of the two |
| 7 | Controlled live acceptance of the **purchase** mainline end to end | |
| 8 | Dual-flow regression suite over live-shaped data | |

---

## §K — Overall verdict

```
connected_not_atomic          : [S6]
server_only                   : [S6b, S7b, S8b, P10b]
stock_stages_all_connected    : true
overall                       : NOT_READY_FOR_UNCONDITIONAL_LIVE_ACCEPTANCE
```

The chain is **not** complete: S6 is not atomic and its stated recovery has no caller. Every stage that moves
stock is connected, once-only, atomic and replay-safe, so a **controlled** live acceptance of the shipping
mainline is defensible once batch 1 lands.

---

## §I — The read-only census

`assets/tools/apps-script-diagnostics/TEMP_dual_mainline_ledger_census_fc0a.gs`. One entry point, façade-only
reads, `DB_WRITES=0 · STOCK_MOVEMENTS_WRITTEN=0 · REPAIRS=0`. It reconciles every factory balance against its
movement chain (`BROKEN` / `BALANCE_DISAGREES` / `NO_SNAPSHOT`), finds duplicate and orphan movements, and lists
stranded lifecycle rows — `APPROVED_PLAN_WITH_NO_SHIPMENT`, `SHIPPED_WITH_NO_STOCK_MOVEMENT`,
`COMPLETED_QTY_WITH_NO_STOCK_MOVEMENT`, `RECEIPT_QUANTITY_UNRECONCILED`. It repairs nothing and never rounds an
unreconciled quantity into agreement.

## Deliberately not done

- No live AI Plan, Submit Plan, Send Request, PO issue, shipment confirm, stock write, document generation,
  repair, migration, push or deploy.
- **No source file was changed.** This round added a test, a read-only diagnostic and this record.
- No frozen rule was rewritten. Where code and expectation differ (G.6 reservation, `remaining_qty` semantics,
  duplicate stock authority) the finding is reported with options, per §G's stop condition.
