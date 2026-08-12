# F1-5B-SHIP-R3B — Confirm & Dispatch → Canonical PO Allocation Execution

**Outcome: IMPLEMENTED.** Extends the EXISTING Confirm & Dispatch owner to execute draft `shipment_line_allocations`
(draft → executed) and reconcile `purchase_order_lines.shipped_qty` / `remaining_qty`, inside the same ScriptLock +
rollback boundary as the existing factory-stock deduction. No second engine, no second FIFO, zero schema change.
Includes the mandated **live-schema correction** of R3A. Baseline: R3A `bfa9bed`.

## Live-schema correction (pre-R3B audit)
The R3A report claimed 19 headers; the **live** `shipment_line_allocations` has **14**:
`shipment_line_allocation_id, shipment_line_id, purchase_order_line_id, sku, allocated_qty, shipped_qty,
allocation_status, created_by, created_at, updated_at, released_by, released_at, release_reason, note`.

- `SHIPMENT_LINE_ALLOCATIONS_HEADERS_` in `32_` updated to the exact 14. **No re-migration** (USER confirmed the live table exists).
- R3A persist bug fixed: it wrote `sku: ''` — now writes the real sku; and no longer emits the 5 nonexistent columns (`shipment_id/purchase_order_id/company/factory_id/fifo_rank/executed_at/…`) that `procurementAppendByHeader_` was silently dropping.
- R3A reconciliation/self-release verified to depend only on live columns (`shipment_line_id`, `purchase_order_line_id`, `allocated_qty`, `allocation_status`) — works against the 14-col schema.
- **`shipped_qty` (allocation-level) audit:** currently **unused/reserved** — no reader/writer anywhere. R3B does **NOT** write it and does **NOT** treat it as authority (avoids `SHIPMENT_ALLOCATION_SHIPPED_QTY_SEMANTIC_CONFLICT`). PO shipped is reconciled from `Σ executed allocated_qty`.
- **Schema sufficiency gate: SUFFICIENT** — execution uses `allocation_status`, `allocated_qty`, `shipment_line_id`, `purchase_order_line_id`, `updated_at`; no `executed_at`/`executed_by` needed → **zero schema change**.

## What was built (backend, no new engine)
- `32_shipment_line_allocation_handlers.gs` — two **no-lock** helpers (run inside the dispatch lock, no nesting): `slaPrepareExecution_` (validate + plan) and `slaApplyExecution_` (flip + reconcile under a caller rollback stack). No FIFO here — the ONE FIFO authority stays in R3A.
- `22_shipment_dispatch_handlers.gs` — `handleConfirmShipmentAndDispatch_` extended: (1) validate the PO allocation plan **before any write** (fail-closed → no partial dispatch); (2) execute it as staged write **step 5**, pushing compensation onto the existing `rollback` stack (all-or-nothing with factory stock + shipment lifecycle).

## §27 Completion report
1. PRE HEAD — chat · 2. POST HEAD — chat.
3. R3A schema present? Live 14-col table exists (USER-confirmed); runtime corrected to it.
4. Confirm & Dispatch owner = `handleConfirmShipmentAndDispatch_` ([22_:35](../../assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs#L35)).
5. Frontend dispatch trigger = `confirmShipmentAndDispatch` from `shipping-history.js` (unchanged). 6. Router/API = `confirmShipmentAndDispatch` action (unchanged). 7. ScriptLock owner = 22_ (existing). 8. Factory-stock deduction owner = 22_ `deductPlan` (existing, preserved). 9. Allocation execution owner = `slaPrepareExecution_`/`slaApplyExecution_` (32_).
10. Allocation status before = `draft`. 11. After = `executed`.
12. Physical shipment qty owner = `shipment_lines.shipment_qty` (unchanged; not touched).
13. PO shipped_qty authority before = none (never written). 14. After = **derived reconciliation from executed allocations**.
15. shipped_qty formula = `shipped_qty(PO line) = Σ allocated_qty WHERE purchase_order_line_id = line AND allocation_status = executed` (SET, never `+=`).
16. remaining_qty formula = `max(0, completed_qty − shipped_qty)` (unchanged; recomputed after reconciliation).
17. Draft-allocation validation = every qty>0 line's draft|executed sum == `shipment_qty` (else `SHIPMENT_PO_ALLOCATION_MISSING` / `SHIPMENT_PO_ALLOCATION_QTY_MISMATCH`).
18. Capacity revalidation = inside lock, `newShipped(PO line) = other-executed + this-shipment consumption ≤ completed_qty` (else `PO_CAPACITY_CHANGED_BEFORE_DISPATCH`).
19. Current-shipment self-reservation = its own drafts are the ones being executed (never counted as an "other" reservation against itself).
20. Other-shipment reservation = only **executed** allocations of other shipments reduce availability at execution (drafts are reservations, not shipped).
21. Multi-PO execution = each consumed PO line reconciled independently (test B; example §19).
22. Idempotency authority = reconciliation from persisted executed allocations (re-run → same shipped_qty).
23. Retry = short-circuits at the existing `already_confirmed` pre-check; re-preparing is a no-op set (test D).
24. Two-tab = existing ScriptLock serializes; second sees already-dispatched → idempotent no-op.
25. Lost-response = same as retry (idempotent).
26. Factory stock = deducted exactly once (existing path, unchanged; same lock).
27. Factory/company independence preserved = execution trusts persisted allocation lineage (R3A already scoped by sku+company+factory); no re-match in dispatch (guard test).
28. FIFO owner = R3A (32_ allocator). 29. No second FIFO = proven (dispatch + execution helpers contain no `order_date`/`po_no`/`sort`; guard tests).
30. Pre-dispatch edit = R3A reconciliation updates drafts; dispatch validates `Σ draft = shipment_qty`, fail-closed if stale (never executes stale qty).
31. Post-dispatch edit verdict = not implemented; existing shipment line qty is read-only after dispatch (R1/R3A). No `DISPATCHED_SHIPMENT_EDIT_POLICY_GAP` triggered (no path mutates dispatched line qty).
32. Reversal verdict = **deferred** (`DISPATCHED_SHIPMENT_REVERSAL_POLICY_GAP`); `released_*` columns reserved, not used.
33. Legacy shipped_qty drift audit = at execution, persisted `shipped_qty` must equal `Σ executed allocation` for the PO line; unexplained legacy value → `PO_SHIPPED_QTY_LEGACY_BASELINE_UNRESOLVED` (test S). New POs have `shipped_qty=0` → consistent.
34. **Historical backfill performed? NO.**
35. Receipt impact = NONE (still consumes `shipment_lines`). 36. On-the-Way impact = NONE. 37. Shipping Detail future-lineage = now complete: `shipment → shipment_lines → executed shipment_line_allocations → purchase_order_lines → purchase_orders` (report only; Export deferred). 38. Export impact = NONE.
39. AI Plan = NONE. 40. Request Order = NONE. 41. RO→PO = NONE.
42. Files changed = `32_shipment_line_allocation_handlers.gs` (schema fix + R3B helpers), `22_shipment_dispatch_handlers.gs` (+validate +execute), `shipment-dispatch-po-execution-f1-5b-ship-r3b.test.js` (new), `shipment-fifo-allocation-f1-5b-ship-r3a.test.js` (schema assertion updated), R3A doc (correction banner), this doc.
43. Tests = 1 new (29). 44. Focused = R3B 29/29, R3A 43/43. 45. Full regression = **196 pass / 4 known baseline**.
46. **Apps Script sync = YES** (`32_`, `22_`). 47. Frontend deploy = NO. 48. Bundle rebuild = NO (no `core/*`).
49. DB/schema impact = **NONE** (uses the live 14-col table; `shipped_qty`/`remaining_qty` are existing PO columns). 50. API = additive response fields only. 51. Formula = NONE (remaining formula unchanged). 52. Inventory = NONE. 53. Shipment = executes allocation lineage + reconciles PO ledger; physical `shipment_lines` untouched. 54. PO = `shipped_qty`/`remaining_qty` now reconciled (were inert); `ordered_qty`/`completed_qty` unchanged.
55. Commit = chat.
56. USER live verification = with the live table present + `32_`/`22_` synced: Confirm & Dispatch a shipment whose draft allocations sum to each line's shipment_qty → allocations flip to `executed`, `purchase_order_lines.shipped_qty = Σ executed`, `remaining = completed − shipped`, factory stock deducted once; retry → idempotent (`already_confirmed`, no double consumption); a shipment missing/mismatched allocations or exceeding completed capacity fails closed and does NOT dispatch.
57. Remaining gaps = post-dispatch reversal (`DISPATCHED_SHIPMENT_REVERSAL_POLICY_GAP`, deferred); the frontend trigger that calls `generateShipmentLineAllocations` from the Shipment Draft before dispatch (must exist so drafts are present — currently the R3A action is callable but not auto-invoked by the UI).
58. Next authorized slice = bounded Shipment-finalization → Shipping-Detail/UPC/Export seam audit, then full AI Plan→…→Export E2E.

## §28 FINAL GATE
R3A authority preserved ✓ · Confirm & Dispatch single execution boundary ✓ · draft→executed only at dispatch ✓ · Σ executed = shipment_qty ✓ · shipped_qty = Σ executed (SET, no += ) ✓ · remaining = completed − shipped ✓ · ordered/completed unchanged ✓ · capacity revalidated in lock ✓ · no over-consumption ✓ · multi-PO ✓ · retry/two-tab/lost-response cannot double-consume ✓ · factory stock deducted once, separate ledger ✓ · shared-factory architecture preserved, no factory→company inference ✓ · shipment physical qty unchanged ✓ · receipt / On-the-Way unchanged ✓ · historical identity not guessed ✓ · no second FIFO / dispatch engine ✓ · AI Plan / Request Order / RO→PO unchanged ✓ · Export not started ✓ · no unrelated refactor ✓.

**STOP after R3B.** Export Center, Shipping-Detail redesign, post-dispatch reversal, and full AI Plan E2E are NOT started.

## Deployment order
1. (Already done) live `shipment_line_allocations` table exists — no migration.
2. Apps Script sync: `32_shipment_line_allocation_handlers.gs` + `22_shipment_dispatch_handlers.gs` (+ `01_router.gs` from R3A if not yet synced).
3. No frontend deploy, no bundle rebuild.
4. Live-verify per §56.
