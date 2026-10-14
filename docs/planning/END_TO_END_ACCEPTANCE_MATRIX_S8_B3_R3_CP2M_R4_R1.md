# END-TO-END ACCEPTANCE MATRIX — SHIPPING / REPLENISHMENT and REQUEST ORDER / PURCHASE ORDER

> **STATUS: READ-ONLY SURVEY. NOTHING HERE IS A DESIGN CHANGE.** Compiled at S8-B3-R3-CP2M-R4-R1 from the
> shipped router (`01_router.gs`, 148 POST/GET actions), the handler files it dispatches to, and the
> canonical specs. No business logic was redesigned, nothing was renamed, and no step below is a proposal.
>
> **WHAT THIS IS FOR:** an acceptance pass needs to know which steps exist, which of them WRITE, and what a
> failure at each step leaves behind. Where the code and a spec disagree, the CODE is reported and the
> disagreement is named.
>
> **WHAT IT IS NOT:** it is not a test result. Nothing in this document has been executed this round. Every
> row is a step to be acceptance-tested, not a step that has passed.
>
> ---
>
> ### CORRECTED AT S8-B3-R3-CP2M-R4-R2 — five statements were wrong, and the wrong ones were the confident ones
>
> The first edition reasoned about the reservation from the SHAPE of the chain rather than from the handlers,
> and it reasoned about rollback from the general truth that Apps Script has no multi-row transaction. Both
> readings are plausible and both are wrong here. What changed:
>
> | was | is, per the shipped handler |
> |---|---|
> | the reservation is taken at **dispatch** (S12) | it is acquired at **DRAFT CREATION** (S11), and dispatch CONSUMES it |
> | "a reservation exists **iff** the shipment is dispatched" | **REMOVED.** It is false in both directions: a draft holds a reservation before anything is dispatched, and a dispatched shipment holds none - it spent it |
> | `W*` means "a partial state **no rollback undoes**" | five of these steps carry a COMPENSATING ROLLBACK, one of them durable in a Script Property. The residual is narrower and differently shaped |
> | `createShippingPlansBatch`: "all-or-nothing is NOT available" | it verifies by READBACK and performs an inserted-only reverse-FK rollback of exactly its own batch |
> | factory stock grain "factory + SKU" | **`warehouse_id` + `sku`**, and `available` is DERIVED (`fac_current_stock - fac_reserved_stock`), not stored |
>
> Every claim below that was NOT re-read against a handler this round is now marked **UNVERIFIED**. An
> occurrence count is not a contract and is no longer used as one.

---

## 0. HOW TO READ THE "WRITES" COLUMN

| Marker | Meaning |
|---|---|
| **R** | read only — refusal is always a zero write |
| **W1** | writes ONE row (or one cell set) under a lock; a refusal before the first setter is provably zero-write |
| **W*** | writes MANY rows. Whether a partial state survives depends on the step - see the correction below |
| **J** | runs as a JOB with state in Script Properties; interruption leaves the job record behind |
| **D** | produces a Drive artefact (document) |

`W*` is still the row that matters most in an acceptance pass, but the blanket claim that went with it was
wrong. Apps Script has no DECLARATIVE transaction; several of these handlers build one by hand.

**VERIFIED this round, by reading the handler:**

| step | compensation | what it does NOT cover |
|---|---|---|
| S11 `createShipmentFromPlan` | a shared journal of cell/row entries carrying the previous value; a failed reservation rolls back the WHOLE draft | an execution killed outright - the journal is in memory and dies with it |
| S12 `confirmShipmentAndDispatch` | its own rollback stack, the same shape, covering deduction, routes and events | the same |
| S13 `cancelShipmentDraft` | release and cancel in ONE journalled transaction | the same |
| P16 `receivePurchaseOrderLines` | `factoryStockRollbackJournal_(journal)` in its catch | the same |
| S7 `createShippingPlansBatch` | **DURABLE**: a journal written to Script Property `SPCFL_JOURNAL_<execution_key>` BEFORE the first mutation, plus a READBACK check and an inserted-only reverse-FK rollback of exactly this batch | an absent execution key - then it rolls back in-execution only, with no durable record |

So the honest residual is narrower and differently shaped: **a caught failure is compensated; an execution
that is KILLED (the 6-minute ceiling, a quota stop) is not**, because the compensation is code that has to
run. S7 is the only step whose evidence survives the execution that wrote it.

**Every other `W*` step in this document is UNVERIFIED for compensation.** It is not claimed to have one and
not claimed to lack one. The acceptance question stays *"what does the operator see, and what is safe to
retry"* - and for the five rows above, *"what happens when the execution is killed rather than failing."*

---

## 1. SHIPPING / REPLENISHMENT

### 1.1 The chain, in the order an operator walks it

| # | Step | Action | Writes | Sheets touched | Acceptance question |
|---|---|---|---|---|---|
| S1 | Read the replenishment picture | `inventoryReplenishment.workspace.get` | R | — | Does a cold entry load without a broad DB read? |
| S2 | Compute the gap | `inventoryReplenishmentGap.get` / `.recalculate.all` | R / J | — | Does a cancelled job (`.job.cancel`) leave no half-written gap? |
| S3 | Gap as a long job | `inventoryReplenishmentGap.job.start` / `.job.cancel` | J | — | Script Property `GAP_JOB_INVENTORY`; is it cleared on cancel AND on crash? |
| S4 | Site priority (this round's page) | `marketplace.allocationPriority.set` | **W1** | `marketplaces` | CAS refusal is zero-write; `OUTCOME_UNKNOWN` must not be retried |
| S5 | Overseas allocation preview | `overseasAllocationPreview.job.start` / `.status` / `.result.get` / `.job.cancel` | J | — | Property `OAP_PREVIEW_JOB`; a preview is NOT a commitment |
| S6 | Save the demand allocation | `replenishmentDemandAllocation.save` | **W*** | `shipping_plans`, `shipping_plan_lines` | Partial save: which lines landed? |
| S7 | Create shipping plans | `createShippingPlansBatch` | **W*** | `shipping_plans`, `shipping_plan_lines`, Property `SPCFL_JOURNAL_*` | Readback + inserted-only rollback EXIST. Test the two outcomes it distinguishes: `COMMIT_FAILED_ROLLED_BACK` (zero_write) vs `COMMIT_FAILED_ROLLBACK_UNVERIFIED` (NOT zero_write) |
| S8 | Shipping allocation draft | `getShippingAllocationDraftWorkspace` / `cancelShippingAllocationDraft` | R / **W1** | `shipping_allocation_drafts` | Does cancel prove zero write? |
| S9 | Choose the method | `getShippingMethodCandidates` | R | — | An unpriced lane needs BOTH `carrier_rate_cards` and `carrier_lead_times` |
| S10 | Line allocations | `generateShipmentLineAllocations` | **W*** | `shipment_lines` | Partial generation |
| S11 | Create the shipment **and ACQUIRE the reservation** | `createShipmentFromPlan` | **W*** | `shipments`, `shipment_lines`, `shipping_plans`, **`factory_stock` / `overseas_inventory_snapshot` + their movement ledgers** | **THIS is the reservation step.** The shipment row is written FIRST so the reservation has a resolvable owner (`related_entity_type='shipment'`); if the acquire fails the whole draft is rolled back. Two legal outcomes: a shipment WITH its reservation, or neither |
| S12 | Confirm and dispatch - **CONSUMES its own reservation** | `confirmShipmentAndDispatch` | **W*** | `shipments`, `shipment_events`, `shipment_routes`, stock + movements | It spends what it holds: the release is capped at what this shipment actually holds, and the held map is decremented so two lines for one key cannot consume it twice. **Factory** writes the stock delta and the reserved delta in ONE row; **overseas** moves reserved DOWN and touches available NOT AT ALL (the units left available at reservation) |
| S13 | Cancel a draft shipment - **RELEASES its own hold** | `cancelShipmentDraft` | **W*** | `shipments`, stock + movement ledgers in BOTH domains | Legal ONLY from `draft` / `ready_to_ship`. Refused when the status is dispatched, **and refused on physical evidence alone** (a stock movement, a route row or an event) even when the status does not say so. Releases from its OWN ledger, never another shipment's, never more than it holds; it sweeps both domains and holding nothing is a no-op |
| S14 | Complete the plan | `completeShippingPlan` | **W1** | `shipping_plans` | Terminal state; is it reversible? |
| S15 | Final output | `finalizeShipmentFinalOutput` / `getShipmentFinalOutput` | **W1** / R | `shipments` | — |
| S16 | Documents | `renderShipmentDocument`, `document.get/list/retry` | **D** | Drive | A retry must not produce a second document |
| S17 | Notes | `appendShippingPlanNote` | **W1** | `shipping_plans` | Append-only |

### 1.2 Where this line can leave a partial state — **CORRECTED**

**The reservation's actual lifecycle, read from the handlers:**

```
S11 createShipmentFromPlan      ACQUIRE   a draft holds the units from the moment it exists
S12 confirmShipmentAndDispatch  CONSUME   the dispatch spends its own hold, capped at what it holds
S13 cancelShipmentDraft         RELEASE   pre-dispatch only, and only what this shipment holds
```

1. **S11 — acquire-or-undo.** The acquire runs AFTER the shipment row exists, so the hold has an owner. A
   failure rolls the draft back through the shared journal.
   *Acceptance:* force a reservation failure and confirm **neither** a shipment nor a hold remains -
   and that the approved plan is still recoverable.
2. **S12 — consume, not acquire.** The money-consequence failure here is NOT "a dispatch without a
   reservation" (there is always one, from S11). It is a dispatch that deducts stock while leaving the hold
   standing, which double-counts the same units.
   *Acceptance:* dispatch, interrupt, and check that **deducted and released moved together** — for factory
   they are written in one row; for overseas, that the stored available bucket did **not** move a second time.
   **Still the single highest-value test in the line.**
3. **S13 — release, and the guard in front of it.** The guard is the more interesting half: cancel is
   refused on physical evidence even when the status disagrees.
   *Acceptance:* a draft with a stray route row or event must be REFUSED, not cancelled.
4. **S6 / S10 — multi-row writes with UNVERIFIED compensation.** Not claimed to have one, not claimed to
   lack one. *Acceptance:* interrupt each and record exactly what remains.

### 1.3 Known, already-recorded

- A **MISSING** `allocation_priority` is refused by the allocator rather than treated as 0 (§45.A). A weight
  of **0 is valid and does not disable a site** — it ranks last and, in a shortage, receives the same
  multiplier as a weight of 1.
- An **unparseable** priority reaches the browser as `null` and displays as *Missing*; every save against
  such a row is refused by the server, zero-write (D-S8-B3-36, verified this round).
- **AND THE DRAG HANDLE ON SUCH A ROW IS LIVE — corrected at CP2M-R4-R2.** The page disables the handle on
  an **INVALID** row, and the browser normalizer only produces INVALID for a value it CAN read and reject
  (a negative number). Unreadable TEXT normalizes to `null`, which is **MISSING**, not INVALID — so the row
  looks like any other unset site and can be picked up. The refusal happens at the server, which reads the
  raw cell, classifies it INVALID and returns `PRIORITY_CHANGED` with no write. **Fail-closed, but not at
  the handle**, and an acceptance list that promises a disabled handle for every garbled row is wrong.

---

## 2. REQUEST ORDER / PURCHASE ORDER

### 2.1 The chain

| # | Step | Action | Writes | Sheets touched | Acceptance question |
|---|---|---|---|---|---|
| P1 | Read the workspace | `requestOrder.workspace.get` | R | — | Cold entry |
| P2 | Order-planning gap | `orderPlanningGap.get` / `.job.start` / `.job.cancel` / `.recalculate.all` | R / J | — | Job property cleanup |
| P3 | Draft from gap | `requestOrderDraft.generateFromGap` | **W*** / J | `request_orders`, `request_order_lines` | Property `REQ_ORDER_DRAFT_JOB` |
| P4 | Resume / cancel the draft job | `requestOrderDraft.job.continue` / `.job.cancel` / `.job.status` | J | — | Does continue after a crash duplicate lines? |
| P5 | Read the active draft | `requestOrderDraft.getActive` | R | — | — |
| P6 | Allocation draft | `requestOrder.allocationDraft.ensureAndEdit` | **W*** | `request_order_lines`, `request_order_line_sources` | `line_sources` is the grain that drifts |
| P7 | Submit allocation drafts | `submitRequestOrderAllocationDrafts` | **W*** | `request_order_lines` | Partial submit |
| P8 | Cancel a tier | `cancelRequestOrderTier` | **W*** | `request_orders`, `request_order_lines` | — |
| P9 | Build the send workset | `requestOrder.sendWorkset.get` | R | — | — |
| P10 | **Send** | `requestOrder.send.orchestrate` / `.send.status` | **W*** | `request_orders`, `request_order_lines` | **Not authorised to exercise this round** |
| P11 | Send diagnostics / reconcile | `system.requestOrderSendDiagnostic{,Status}`, `system.requestOrderSendReconcile` | R / **W*** | `request_orders` | Reconcile WRITES — treat as a repair tool |
| P12 | PO from request | `createPurchaseOrderFromRequest` | **W*** | `purchase_orders`, `purchase_order_lines` | The RO→PO hand-off |
| P13 | Read the PO workspace | `purchaseOrder.workspace.get` | R | — | — |
| P14 | Edit header / line | `updatePurchaseOrderHeader` / `updatePurchaseOrderLine` | **W1** | `purchase_orders` / `purchase_order_lines` | Whether either carries a compare-and-set is **UNVERIFIED** — not traced this round, and not assumed from the R52 writer |
| P15 | Status transition | `updatePurchaseOrderStatus` | **W1** | `purchase_orders` | Which transitions are legal? |
| P16 | Receive lines | `receivePurchaseOrderLines` | **W*** | `purchase_order_lines`, `factory_stock`, `factory_stock_movements` | **Receiving moves stock. Second-hardest test.** It rolls back through `factoryStockRollbackJournal_` on a CAUGHT failure; a killed execution is not covered |
| P17 | Factory stock guard | `factoryStockGuard.get` | R | — | — |
| P18 | Adjust factory inventory | `adjustFactoryInventory` | **W*** | `factory_stock`, `factory_stock_movements` | Movement + balance must agree |
| P19 | Factory import | `factoryInventory.import.validate` / `.commit` | R / **W*** | `factory_stock` | Validate-then-commit is two calls: state can change between them |
| P20 | Factory config | `factoryOperationConfig.get` / `.save` | R / **W1** | Script Property `KM_FACTORY_OPERATION_CONFIG` | Config lives in Properties, not a sheet |
| P21 | Documents | `document.diagnostic.purchaseOrder`, `documentTemplate.*` | R / **D** | Drive | — |

### 2.2 The three places this line can leave a partial state

1. **P16 — receiving.** It writes the PO line, the factory stock balance and a movement row, at the grain
   **`warehouse_id` + `sku`**. Any two of three landing is a stock figure that disagrees with its own audit
   trail. Note that factory `available` is DERIVED (`fac_current_stock - fac_reserved_stock`), so a balance
   row that lands without its movement row changes availability with no ledger entry explaining it.
2. **P12 — the RO→PO hand-off.** Two sheets, header and lines; a header with no lines is the visible shape.
3. **P19 — validate-then-commit.** Two round trips with no latch between them; the same one-round-trip
   residual this round accepted for Site Priority (D5), on a much larger write.

---

## 3. WHAT AN ACCEPTANCE PASS SHOULD DO FIRST

Ranked by *consequence of being wrong*, not by order of use:

| Rank | Test | Why |
|---|---|---|
| 1 | **S12** deduction ↔ reservation-consumption agreement under interruption | the only failure that silently changes stock. NOT "is there a reservation" — S11 made one |
| 2 | **P16** receive ↔ factory stock ↔ movement agreement | same shape, different table |
| 3 | **S13** cancel releases its own hold, provably — AND refuses on dispatch evidence | a leak nothing displays, and a cancel that should have been refused |
| 4 | **P12** RO→PO leaves no header without lines | visible, but easy to miss |
| 5 | **J-steps** every `.job.cancel` clears its Script Property | a stale job blocks the next run |
| 5a | **S11** a failed reservation leaves NEITHER a shipment nor a hold | the two-state contract the handler claims |
| 5b | **S7** which of the two rollback outcomes is reported, and whether `zero_write` is right in each | the one durable journal in the line |
| 6 | **S16 / P21** a document retry does not duplicate the artefact | Drive has no CAS |

---

## 4. GAPS IN THIS SURVEY, STATED

- **Status transition legality is not enumerated here.** The enums observed in these handlers are `draft`,
  `submitted`, `confirmed`, `received`, `cancelled`, `open`, `in_transit`, `delivered`, `closed`, `active`,
  but WHICH transitions each handler permits was not traced action by action. That tracing is listed as a
  next-round item (§5 of the write-set inventory) rather than guessed at here.
- **No step was executed.** This round was not authorised to Submit, to send email, to generate documents or
  to run fatigue write tests, and did none of them.
- **Carrier lane completeness** (`carrier_rate_cards` AND `carrier_lead_times`, both required for a routable
  lane) is a known precondition for S9 and is not re-derived here.
- **UNVERIFIED, named rather than implied (CP2M-R4-R2).** Each of these was either asserted too confidently
  in the first edition or inferred from a count, and neither is a contract:
  - the exact write SET of every step not re-read this round — only S4, S7, S11, S12, S13 and P16 were;
  - compensation / rollback for every `W*` step other than those five;
  - whether `updatePurchaseOrderHeader` / `updatePurchaseOrderLine` / `updatePurchaseOrderStatus` carry a CAS;
  - whether `document.retry` is idempotent;
  - which status transitions each handler permits (below).
- **Occurrence counts are no longer cited as evidence.** The first edition wrote "`reserved_stock` is touched
  111 times" and "`cancelled` is the most frequently written terminal state (67 occurrences)" as if frequency
  implied a contract. It does not: a count cannot distinguish a write from a comment, a constant or a read.
