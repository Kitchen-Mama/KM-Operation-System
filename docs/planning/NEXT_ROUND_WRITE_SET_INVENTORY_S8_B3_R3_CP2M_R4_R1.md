# NEXT-ROUND WRITE-SET INVENTORY

> **STATUS: READ-ONLY. A LIST OF WHAT WOULD BE WRITTEN, NOT A WRITE.** Compiled at S8-B3-R3-CP2M-R4-R1 by
> reading the shipped handlers. **Nothing here was executed.** This round was not authorised to Submit, to
> send mail, to generate documents, or to run fatigue write tests, and did none of them.
>
> **SCOPE, AS INSTRUCTED:** this round's KEY actions are verified BY HAND against the source. The write-set
> tooling is deliberately NOT rewritten — a tool that enumerates writes is itself a thing that can be wrong,
> and the point of this list is to be checkable by reading.
>
> ---
>
> ### CORRECTED AT S8-B3-R3-CP2M-R4-R2 — and the corrections are about METHOD, not detail
>
> The first edition reached for counts when it could not reach for a handler, and it stated a reservation
> invariant it had not traced. Both are the same error: filling a gap with something that reads like a fact.
>
> | was | is |
> |---|---|
> | "a reservation exists **if and only if** the shipment that justifies it exists in a dispatched state" | **DELETED.** False in both directions — a reservation is acquired at DRAFT creation and is SPENT by dispatch |
> | `confirmShipmentAndDispatch` **takes** a reservation | it **consumes** the one the draft took |
> | factory stock grain "factory + SKU" | **`warehouse_id` + `sku`** |
> | "`reserved_stock` appears 111 times; `reserve*` over 500" | **removed as evidence.** A count cannot tell a write from a comment |
> | "`cancelled` is the most frequently written terminal state (67 occurrences)" | **removed as evidence.** Same reason |
> | every `W1` is recoverable by "writing the previous value back; the CAS makes it safe" | **wrong as a general rule** — see §8 |
> | a Properties list with no verification marks | each key now says whether its literal was READ this round |
>
> Anything not re-read against a handler this round is marked **UNVERIFIED**, which is a different statement
> from "absent".

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
| `factory_stock` | `receivePurchaseOrderLines`, `adjustFactoryInventory`, `factoryInventory.import.commit`, **and the shipment reservation lifecycle** (acquire at draft, consume at dispatch, release at cancel) | **balance**, at `warehouse_id` + `sku`. `available` is DERIVED (`fac_current_stock - fac_reserved_stock`), never stored |
| `factory_stock_movements` | the same three | **append-only ledger that must agree with the balance** |
| `overseas_inventory_snapshot` | `importOverseasInventorySnapshotBatch`, **and the same reservation lifecycle** | snapshot. Here `wh_available_stock` **IS** the allocatable quantity, so a reserve TRANSFERS: available down, reserved up, in one row |
| `overseas_inventory_movements` | `adjustOverseasInventory`, the reservation lifecycle, and the warehouse receipt (31_) | ledger |
| `marketplaces` | `marketplace.allocationPriority.set` (R52) | **three cells, one row** — this round's writer |
| `sku_details`, `marketplace_skus` | SKU / import handlers | master data |
| `warehouses` | warehouse handlers | master data |
| `carrier_rate_cards` | `importCarrierRateCards` | lane pricing |
| `fc_regular_forecast`, `fc_special_events`, `fc_target_rules` | FC import / write handlers | forecast |

**The pair to watch:** `factory_stock` (a balance) and `factory_stock_movements` (a ledger). Several actions
write both, and the acceptance question for each is whether they can disagree.

**AND THE TWO DOMAINS DO NOT USE THE SAME ARITHMETIC**, which is the most plausible wrong line in any future
change here:

| | where availability lives | what a reserve does |
|---|---|---|
| **factory** | DERIVED: `fac_current_stock - fac_reserved_stock` | raises reserved; available falls out of the subtraction |
| **overseas** | STORED: `wh_available_stock` **is** the allocatable quantity | TRANSFERS: available down AND reserved up, together |

Writing `available - reserved` for overseas would hold the same units twice. The shipped code keeps that rule
in one function per domain for exactly that reason.

---

## 2. DATA KEYS AND SCOPES

| Thing | Key | Note |
|---|---|---|
| Marketplace site | `company` + `country` + `marketplace`, verified against `marketplace_id` | country is CANONICAL (`KMCID`, UK ≡ GB); company and marketplace are **case-sensitive** |
| Allocation comparison | **company** | cross-company is BLOCKED by the allocator, so a priority is only ever ranked within its company |
| Request order | RO id + line id + **source** | `request_order_line_sources` is a third level most screens flatten |
| Purchase order | PO id + line id | — |
| Shipment | shipment id + line id; routes keyed by node with `latitude`/`longitude` | a route node without coordinates cannot be drawn |
| Factory stock | **`warehouse_id` + `sku`** (verified at the reader) | movements carry the same pair plus a direction. NOT "factory + SKU" — the first edition's phrasing named a concept the sheet does not key on |
| Overseas stock | `warehouse_id` + `sku` | same pair; the movement ledger also carries `site_sku` |
| A reservation | `(owner_type, owner_id)` + `warehouse_id` + `sku` | the owner is the SHIPMENT; the per-owner held quantity is computed FROM the movement rows, so the ledger is simultaneously the lifecycle state and the idempotency check |
| Scope registry | `inventoryScope.registry.get` | the scoped-read posture; a broad DB read is the kill-switch path only |

---

## 3. INVENTORY RESERVATIONS

**CORRECTED — the lifecycle, read from the handlers rather than inferred from the chain.**

| Action | Effect on reservation | Verified |
|---|---|---|
| `createShipmentFromPlan` | **ACQUIRES.** The shipment row is written first so the hold has a resolvable owner; if the acquire throws, the entire draft is rolled back through the shared journal | yes, 12_ |
| `confirmShipmentAndDispatch` | **CONSUMES ITS OWN.** It releases at most what this shipment holds, and decrements the held map so two lines for one key cannot consume it twice | yes, 22_ |
| `cancelShipmentDraft` | **RELEASES ITS OWN**, from `draft` / `ready_to_ship` only; sweeps BOTH domains, and holding nothing is a no-op | yes, 12_ |
| `adjustOverseasInventory` / `adjustFactoryInventory` | adjust the balance the reservation is held against. The factory adjustment explicitly **never touches reserved** | yes (factory), UNVERIFIED (overseas) |
| `receivePurchaseOrderLines` | increases factory stock, which reservations are later held against | yes, 13_ |

**THE OLD INVARIANT IS DELETED.** "A reservation exists if and only if the shipment exists in a dispatched
state" is false in both directions:

- a shipment in `draft` holds a reservation and nothing has been dispatched;
- a shipment that HAS dispatched holds none — it spent it.

**What replaces it, and it is narrower on purpose:**

1. A shipment that exists in a pre-dispatch status either holds its full reservation or does not exist —
   the two-state contract `createShipmentFromPlan` claims. **Not proven after a killed execution.**
2. A dispatch moves the deduction and the release **together**: factory writes both in one ledger row;
   overseas moves reserved down and available not at all. **Not proven after a killed execution.**
3. No shipment can release or consume another shipment's hold — enforced by computing the held quantity
   from the owner's own movement rows.

**The guard worth testing as much as the release:** cancel is refused not only on a dispatched STATUS but on
physical evidence alone — a stock movement, a route row or an event — so a draft whose status lies cannot be
cancelled into a double release.

---

## 4. STATE TRANSITIONS

Enums observed in the shipping and ordering handlers: `draft`, `submitted`, `confirmed`, `received`,
`cancelled`, `open`, `in_transit`, `delivered`, `closed`, `active`.

**WHICH transitions each action permits is NOT enumerated here, and that is deliberate.** It would have to be
traced action by action through the guards, and a guessed transition table is worse than none — it would be
believed. **This is the first item of next-round work**, and it is the input every other item depends on.

**The occurrence counts the first edition cited here are withdrawn.** "`cancelled` appears 67 times" was
offered as a reason to test the cancel paths first; a count of a string in a source tree cannot distinguish a
write from a comparison, a constant, an error code or a comment, so it was never evidence of anything.

**What IS established, by reading `cancelShipmentDraft`** — one action, three enumerated sets:

| set | members |
|---|---|
| cancellable FROM | `draft`, `ready_to_ship` |
| refuses as already dispatched | `shipped`, `in_transit`, `arrived`, `received`, `closed`, `completed`, `delivered`, `partial_received` |
| writes | `cancelled` |

It **fails closed on anything else**: a status in neither set is refused with `SHIPMENT_STATUS_NOT_CANCELLABLE`
rather than guessed at. That is one action out of roughly forty that write a status, and the other
transition tables remain **UNVERIFIED** and are still the first item of next-round work.

---

## 5. SCRIPT PROPERTIES

Properties are **not** the spreadsheet DB, and they survive a deployment. A next round that writes any of
these must say how it is restored.

Each row says whether the key's LITERAL was read this round. A key reached through a generic `set(k, v)`
adapter is marked as such: the adapter was read, the call sites that pass each key were not.

| Key | Written by | Literal read this round | Restore |
|---|---|---|---|
| `KM_AUTOMATION_SCHEDULE_CONFIG` | `automationSchedule` (45_) | **yes** | **config, not a job** — snapshot before changing |
| `KM_FACTORY_OPERATION_CONFIG` | `factoryOperationConfig.save` (62_) | **yes** | snapshot before changing |
| `KM_WAREHOUSE_ALLOCATION_CONFIG` | warehouse allocation config (50_) | **yes** | snapshot before changing |
| `SPCFL_JOURNAL_<execution_key>` | `createShippingPlansBatch` (11_) | **yes** | **NOT a config and NOT disposable** — see below |
| `PRW_RCPT_<...>` | pricing write receipts (73_) | **yes** | UNVERIFIED — a receipt prefix, lifecycle not traced |
| `GAP_JOB_INVENTORY`, `GAP_JOB_ORDER_PLANNING` | gap materialization job (46_) | yes (two keys, not one) | delete the key; the job re-derives |
| `OAP_PREVIEW_JOB` | overseas allocation preview job (74_) | yes | delete the key |
| `REQ_ORDER_DRAFT_JOB` | request-order draft job (48_) | yes | delete the key; **check for duplicated lines first** |
| `KM_WEEKLY_RECO_RUN` | weekly recommendation run (49_) | yes | run marker |
| `RECOMMENDATION_CALCULATION_MONTH` / `_DATE` | recommendation workspace (42_) | yes | calculation anchor — changing it moves every downstream number |
| per-job journal keys | recommendation persistence | **UNVERIFIED** — not traced to a literal | stated as "deleted on completion" in the first edition; that is not re-asserted here |

> **Two different dangerous shapes, and the first edition only named one.**
>
> **The three `KM_*_CONFIG` keys** are the system's standing configuration with no copy anywhere else.
> Snapshot all three before any round that writes them.
>
> **`SPCFL_JOURNAL_<execution_key>` is the opposite danger.** It is written BEFORE the first business
> mutation precisely so a crash in one execution is recoverable from the next, and it is deleted on BOTH
> outcomes — success and rolled-back failure. A leftover `SPCFL_JOURNAL_*` key therefore means an execution
> died between writing the journal and reaching either ending. **Deleting one as housekeeping destroys the
> only durable record of what that execution intended to write.** Read it before touching it.

**The first edition missed `SPCFL_JOURNAL_*` and `PRW_RCPT_*` entirely**, which is the concrete reason this
section now records how each line was established.

---

## 6. TRIGGERS

**UNVERIFIED, and the counts the first edition gave are withdrawn as evidence.** `ScriptApp.newTrigger`,
`deleteTrigger` and `getProjectTriggers` all appear in the tree; WHICH actions install or remove WHICH
trigger, and under what conditions, was **not traced this round**. A count of call sites does not say that.

What remains true independently of any count, and is the reason this still needs doing: triggers are
**account-bound and deployment-surviving**, the Apps Script trigger list is the only place they can be seen,
**recovery is manual**, and a duplicate trigger runs its job twice. A next round that installs one must
record what installs it, what removes it, and what happens if two exist — by reading those call sites.

---

## 7. DRIVE DOCUMENTS

**UNVERIFIED**, and the `DriveApp` call-site counts are withdrawn for the same reason as above. The
`document.*` and `documentTemplate.*` actions and `renderShipmentDocument` exist and are routed; what each
one writes to Drive, and where, was not traced this round.

**Drive has no compare-and-set**, which is a property of Drive and not a claim about this code. A retry that
cannot see the first attempt's result produces a second document. `document.retry` exists; **whether it is
idempotent is an acceptance question, not an assumption**, and this round did not answer it. Recovery is
manual: find and remove the duplicate.

---

## 8. RECOVERY, IN ONE TABLE

**THE FIRST EDITION'S FIRST ROW WAS THE WORST LINE IN THIS DOCUMENT**, and it is corrected rather than
softened. It said a `W1` is reversible by "writing the previous value back; the CAS makes it safe". That
generalises one verified writer to every single-row write in the system, and it is wrong in three separate
ways:

1. **Only `marketplace.allocationPriority.set` is KNOWN to carry a mandatory CAS.** Whether the purchase-order
   writers carry one is UNVERIFIED. Without a CAS, writing the old value back is a blind write that will
   happily overwrite a change someone else made in between.
2. **Writing the old value back is a NEW write, not an undo.** It stamps `updated_by` / `updated_at` again,
   so the row afterwards is not the row before — the audit trail now says the current actor set this value,
   and the original one is gone.
3. **A single-row write can have consequences outside its row.** A status change derives parent state; a
   balance write has a ledger row beside it. Restoring the cell restores neither.

| Surface | Reversible? | How |
|---|---|---|
| `marketplace.allocationPriority.set` (**W1**, CAS verified) | yes, with a caveat | write the previous value back; the CAS makes the WRITE safe. It does **not** restore `updated_by` / `updated_at` — the audit trail keeps both events, which is correct and is not an undo |
| Any other **W1** | **UNVERIFIED** | do not assume a CAS, and do not assume the row is the whole effect. Establish both before relying on a restore |
| **W*** with a verified compensation (S7, S11, S12, S13, P16) | on a CAUGHT failure, yes | the handler's own rollback runs and reports which of the two outcomes it achieved |
| **W*** after a KILLED execution | **no** | the compensation is code that must run. Identify what landed and repair by hand |
| Any other **W*** | **UNVERIFIED** | not claimed to have a rollback, not claimed to lack one |
| Script Property (job key) | yes | delete the key |
| Script Property (`KM_*_CONFIG`) | **only from a snapshot** | restore the snapshot — take one first |
| Script Property `SPCFL_JOURNAL_*` | **read it, do not delete it** | its presence means an execution died mid-write; it is the only durable record of the intent |
| Trigger | manually, **UNVERIFIED which action owns which** | delete in the Apps Script trigger list |
| Drive document | **no** | locate and remove the duplicate by hand |
| Reservation | yes, through the cancel path | **and only while the shipment is still pre-dispatch.** After dispatch the hold is already spent, and cancel refuses — a dispatched shipment is reversed, never cancelled |

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
