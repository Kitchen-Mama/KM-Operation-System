# NEXT-ROUND WRITE-SET INVENTORY

> **STATUS: READ-ONLY. A LIST OF WHAT WOULD BE WRITTEN, NOT A WRITE.** Compiled at S8-B3-R3-CP2M-R4-R1 by
> reading the shipped handlers. **Nothing here was executed.** This round was not authorised to Submit, to
> send mail, to generate documents, or to run fatigue write tests, and did none of them.
>
> **SCOPE, AS INSTRUCTED:** this round's KEY actions are verified BY HAND against the source. The write-set
> tooling is deliberately NOT rewritten — a tool that enumerates writes is itself a thing that can be wrong,
> and the point of this list is to be checkable by reading.

---

## 1. TABS (sheets) a next round would write

Counted from `getSheetByName(...)` in the shipping / replenishment and request-order / purchase-order
handlers. **Read-only tabs are excluded** — these are the ones a write path opens.

| Tab | Written by | Grain |
|---|---|---|
| `purchase_orders` | `createPurchaseOrderFromRequest`, `updatePurchaseOrderHeader`, `updatePurchaseOrderStatus` | one row per PO |
| `purchase_order_lines` | `createPurchaseOrderFromRequest`, `updatePurchaseOrderLine`, `receivePurchaseOrderLines` | one row per line |
| `request_orders` | `requestOrderDraft.generateFromGap`, `cancelRequestOrderTier`, `requestOrder.send.orchestrate`, `system.requestOrderSendReconcile` | one row per RO |
| `request_order_lines` | the same, plus `requestOrder.allocationDraft.ensureAndEdit`, `submitRequestOrderAllocationDrafts` | one row per line |
| `request_order_line_sources` | `requestOrder.allocationDraft.ensureAndEdit` | **the grain that drifts** — one row per line × source |
| `shipping_plans` | `replenishmentDemandAllocation.save`, `createShippingPlansBatch`, `completeShippingPlan`, `appendShippingPlanNote` | one row per plan |
| `shipping_plan_lines` | `replenishmentDemandAllocation.save`, `createShippingPlansBatch` | one row per line |
| `shipments` | `createShipmentFromPlan`, `confirmShipmentAndDispatch`, `cancelShipmentDraft`, `finalizeShipmentFinalOutput` | one row per shipment |
| `shipment_lines` | `generateShipmentLineAllocations`, `createShipmentFromPlan`, `cancelShipmentDraft` | one row per line |
| `shipment_events` | `confirmShipmentAndDispatch` | append-only audit |
| `shipping_allocation_drafts` | `cancelShippingAllocationDraft` | one row per draft |
| `factory_stock` | `receivePurchaseOrderLines`, `adjustFactoryInventory`, `factoryInventory.import.commit` | **balance** |
| `factory_stock_movements` | the same three | **append-only ledger that must agree with the balance** |
| `overseas_inventory_snapshot` | `importOverseasInventorySnapshotBatch` | snapshot |
| `overseas_inventory_movements` | `adjustOverseasInventory` | ledger |
| `marketplaces` | `marketplace.allocationPriority.set` (R52) | **three cells, one row** — this round's writer |
| `sku_details`, `marketplace_skus` | SKU / import handlers | master data |
| `warehouses` | warehouse handlers | master data |
| `carrier_rate_cards` | `importCarrierRateCards` | lane pricing |
| `fc_regular_forecast`, `fc_special_events`, `fc_target_rules` | FC import / write handlers | forecast |

**The pair to watch:** `factory_stock` (a balance) and `factory_stock_movements` (a ledger). Three different
actions write both, and the acceptance question for each is whether they can disagree.

---

## 2. DATA KEYS AND SCOPES

| Thing | Key | Note |
|---|---|---|
| Marketplace site | `company` + `country` + `marketplace`, verified against `marketplace_id` | country is CANONICAL (`KMCID`, UK ≡ GB); company and marketplace are **case-sensitive** |
| Allocation comparison | **company** | cross-company is BLOCKED by the allocator, so a priority is only ever ranked within its company |
| Request order | RO id + line id + **source** | `request_order_line_sources` is a third level most screens flatten |
| Purchase order | PO id + line id | — |
| Shipment | shipment id + line id; routes keyed by node with `latitude`/`longitude` | a route node without coordinates cannot be drawn |
| Factory stock | factory + SKU | movements carry the same pair plus a direction |
| Scope registry | `inventoryScope.registry.get` | the scoped-read posture; a broad DB read is the kill-switch path only |

---

## 3. INVENTORY RESERVATIONS

`reserved_stock` appears 111 times across the handlers; `reserve*` forms over 500 times. The write paths:

| Action | Effect on reservation |
|---|---|
| `confirmShipmentAndDispatch` | **takes** a reservation alongside the shipment row and its event |
| `cancelShipmentDraft` | **releases** it |
| `adjustOverseasInventory` / `adjustFactoryInventory` | adjust the balance the reservation is held against |
| `receivePurchaseOrderLines` | increases factory stock, which reservations are later held against |

**The invariant a next round must state and test:** a reservation exists **if and only if** the shipment
that justifies it exists in a dispatched state. Nothing currently proves this after an interruption, and
`W*` means an interruption can leave one without the other.

---

## 4. STATE TRANSITIONS

Enums observed in the shipping and ordering handlers: `draft`, `submitted`, `confirmed`, `received`,
`cancelled`, `open`, `in_transit`, `delivered`, `closed`, `active`.

**WHICH transitions each action permits is NOT enumerated here, and that is deliberate.** It would have to be
traced action by action through the guards, and a guessed transition table is worse than none — it would be
believed. **This is the first item of next-round work**, and it is the input every other item depends on.

What IS established: `cancelled` is by far the most frequently written terminal state (67 occurrences), and
`draft` the most frequent initial one (47) — so the cancel paths are the best-covered and the most worth
testing against partial failure.

---

## 5. SCRIPT PROPERTIES

Properties are **not** the spreadsheet DB, and they survive a deployment. A next round that writes any of
these must say how it is restored.

| Key | Written by | Restore |
|---|---|---|
| `GAP_JOB_INVENTORY` | inventory gap job | delete the key; the job re-derives |
| `OAP_PREVIEW_JOB` | overseas allocation preview job | delete the key |
| `REQ_ORDER_DRAFT_JOB` | request-order draft job | delete the key; **check for duplicated lines first** |
| `KM_AUTOMATION_SCHEDULE_CONFIG` | `automationSchedule.update` | **config, not a job** — snapshot before changing |
| `KM_FACTORY_OPERATION_CONFIG` | `factoryOperationConfig.save` | snapshot before changing |
| `KM_WAREHOUSE_ALLOCATION_CONFIG` | warehouse allocation config | snapshot before changing |
| `KM_WEEKLY_RECO_RUN` | weekly recommendation run | run marker |
| `RECOMMENDATION_CALCULATION_MONTH` / `_DATE` | recommendation orchestrator | calculation anchor — changing it moves every downstream number |
| journal keys (per job) | recommendation persistence | deleted on completion |

> **The three `KM_*_CONFIG` keys are the dangerous ones.** A job key is disposable; a config key is the
> system's standing configuration and has no copy anywhere else. **Snapshot all three before any round that writes them.**

---

## 6. TRIGGERS

`ScriptApp.newTrigger` ×10, `deleteTrigger` ×5, `getProjectTriggers` ×7.

Triggers are **account-bound and deployment-surviving**. A next round that installs one must record: what
installs it, what removes it, and what happens if two exist. **Recovery is manual** — the Apps Script trigger
list is the only place they can be seen, and a duplicate trigger runs the job twice.

---

## 7. DRIVE DOCUMENTS

`DriveApp.getFileById` ×6, `DriveApp.getFolderById` ×8, plus the `document.*` and `documentTemplate.*`
actions and `renderShipmentDocument`.

**Drive has no compare-and-set.** A retry that cannot see the first attempt's result produces a second
document. `document.retry` exists; whether it is idempotent is an acceptance question, not an assumption.
Recovery is manual: find and remove the duplicate.

---

## 8. RECOVERY, IN ONE TABLE

| Surface | Reversible? | How |
|---|---|---|
| A single-cell / single-row write (`W1`) | yes | write the previous value back; the CAS makes it safe |
| A multi-row write (`W*`) | **no automatic rollback** | identify what landed, repair by hand |
| Script Property (job key) | yes | delete the key |
| Script Property (`KM_*_CONFIG`) | **only from a snapshot** | restore the snapshot — take one first |
| Trigger | yes, manually | delete in the Apps Script trigger list |
| Drive document | **no** | locate and remove the duplicate by hand |
| Reservation | yes, in principle | release via the cancel path — **provided the cancel path completed** |

---

## 9. WHAT THIS ROUND VERIFIED BY HAND

Only the action this round actually touched:

- **`marketplace.allocationPriority.set`** — writes exactly three cells (`allocation_priority`, `updated_by`,
  `updated_at`) in one row of `marketplaces`, under a script lock, after a mandatory compare-and-set. Every
  refusal path returns above the line the file itself marks *"EVERYTHING ABOVE THIS LINE IS PROVABLY
  ZERO-WRITE"*. Verified this round end to end, through the **real** reader and the **real** server
  classifier, that an unreadable stored value is refused rather than overwritten
  (`invalid-priority-fail-closed-s8-b3-r3-cp2m-r4-r1.test.js`).

Everything else in this document is a READING of the source, not a verification of it.
