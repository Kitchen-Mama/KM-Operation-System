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

---

## 0. HOW TO READ THE "WRITES" COLUMN

| Marker | Meaning |
|---|---|
| **R** | read only — refusal is always a zero write |
| **W1** | writes ONE row (or one cell set) under a lock; a refusal before the first setter is provably zero-write |
| **W*** | writes MANY rows; a mid-sequence failure leaves a PARTIAL state that no rollback undoes |
| **J** | runs as a JOB with state in Script Properties; interruption leaves the job record behind |
| **D** | produces a Drive artefact (document) |

`W*` is the row that matters most in an acceptance pass. Apps Script has no multi-row transaction, so every
`W*` step has an observable partial-failure state, and the acceptance question is always *"what does the
operator see, and what is safe to retry."*

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
| S7 | Create shipping plans | `createShippingPlansBatch` | **W*** | `shipping_plans`, `shipping_plan_lines` | Batch semantics: all-or-nothing is NOT available |
| S8 | Shipping allocation draft | `getShippingAllocationDraftWorkspace` / `cancelShippingAllocationDraft` | R / **W1** | `shipping_allocation_drafts` | Does cancel prove zero write? |
| S9 | Choose the method | `getShippingMethodCandidates` | R | — | An unpriced lane needs BOTH `carrier_rate_cards` and `carrier_lead_times` |
| S10 | Line allocations | `generateShipmentLineAllocations` | **W*** | `shipment_lines` | Partial generation |
| S11 | Create the shipment | `createShipmentFromPlan` | **W*** | `shipments`, `shipment_lines`, `shipping_plans` | Does a failure leave a shipment with no lines? |
| S12 | Confirm and dispatch | `confirmShipmentAndDispatch` | **W*** | `shipments`, `shipment_events`, **reserved stock** | **The reservation step. The one to test hardest.** |
| S13 | Cancel a draft shipment | `cancelShipmentDraft` | **W*** | `shipments`, `shipment_lines` | Are reservations released, and provably? |
| S14 | Complete the plan | `completeShippingPlan` | **W1** | `shipping_plans` | Terminal state; is it reversible? |
| S15 | Final output | `finalizeShipmentFinalOutput` / `getShipmentFinalOutput` | **W1** / R | `shipments` | — |
| S16 | Documents | `renderShipmentDocument`, `document.get/list/retry` | **D** | Drive | A retry must not produce a second document |
| S17 | Notes | `appendShippingPlanNote` | **W1** | `shipping_plans` | Append-only |

### 1.2 The three places this line can leave a partial state

1. **S6 / S7 / S10 / S11 — multi-row writes.** Every one writes more rows than a lock can roll back.
   *Acceptance:* interrupt each one and record exactly what remains. The answer must be legible on screen.
2. **S12 — the reservation.** `reserved_stock` is touched 111 times across the handlers, and a dispatch
   that writes a shipment but not its reservation (or the reverse) is the one failure with a downstream
   money consequence.
   *Acceptance:* confirm a dispatch, then interrupt, and check whether reserved quantity and shipment state
   agree. **This is the single highest-value test in the line.**
3. **S13 — the release.** A cancel that does not release is a quiet inventory leak that no screen shows.

### 1.3 Known, already-recorded

- A **MISSING** `allocation_priority` is refused by the allocator rather than treated as 0 (§45.A). A weight
  of **0 is valid and does not disable a site** — it ranks last and, in a shortage, receives the same
  multiplier as a weight of 1.
- An **unparseable** priority reaches the browser as `null` and displays as *Missing*; every save against
  such a row is refused by the server, zero-write (D-S8-B3-36, verified this round).

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
| P14 | Edit header / line | `updatePurchaseOrderHeader` / `updatePurchaseOrderLine` | **W1** | `purchase_orders` / `purchase_order_lines` | Per-row; CAS? |
| P15 | Status transition | `updatePurchaseOrderStatus` | **W1** | `purchase_orders` | Which transitions are legal? |
| P16 | Receive lines | `receivePurchaseOrderLines` | **W*** | `purchase_order_lines`, `factory_stock`, `factory_stock_movements` | **Receiving moves stock. Second-hardest test.** |
| P17 | Factory stock guard | `factoryStockGuard.get` | R | — | — |
| P18 | Adjust factory inventory | `adjustFactoryInventory` | **W*** | `factory_stock`, `factory_stock_movements` | Movement + balance must agree |
| P19 | Factory import | `factoryInventory.import.validate` / `.commit` | R / **W*** | `factory_stock` | Validate-then-commit is two calls: state can change between them |
| P20 | Factory config | `factoryOperationConfig.get` / `.save` | R / **W1** | Script Property `KM_FACTORY_OPERATION_CONFIG` | Config lives in Properties, not a sheet |
| P21 | Documents | `document.diagnostic.purchaseOrder`, `documentTemplate.*` | R / **D** | Drive | — |

### 2.2 The three places this line can leave a partial state

1. **P16 — receiving.** It writes the PO line, the factory stock balance and a movement row. Any two of
   three landing is a stock figure that disagrees with its own audit trail.
2. **P12 — the RO→PO hand-off.** Two sheets, header and lines; a header with no lines is the visible shape.
3. **P19 — validate-then-commit.** Two round trips with no latch between them; the same one-round-trip
   residual this round accepted for Site Priority (D5), on a much larger write.

---

## 3. WHAT AN ACCEPTANCE PASS SHOULD DO FIRST

Ranked by *consequence of being wrong*, not by order of use:

| Rank | Test | Why |
|---|---|---|
| 1 | **S12** dispatch ↔ reservation agreement under interruption | the only failure that silently changes stock |
| 2 | **P16** receive ↔ factory stock ↔ movement agreement | same shape, different table |
| 3 | **S13** cancel releases the reservation, provably | a leak nothing displays |
| 4 | **P12** RO→PO leaves no header without lines | visible, but easy to miss |
| 5 | **J-steps** every `.job.cancel` clears its Script Property | a stale job blocks the next run |
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
