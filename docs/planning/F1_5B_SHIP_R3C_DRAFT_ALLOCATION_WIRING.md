# F1-5B-SHIP-R3C — Shipment Draft → Canonical FIFO Allocation Wiring

**Outcome: IMPLEMENTED (frontend-only wiring).** Closes the last seam: the Shipment Draft flow now reconciles
canonical DRAFT allocations through the ONE R3A authority before Confirm & Dispatch (R3B), with a fail-closed
readiness gate. No new allocator, no frontend FIFO, no schema change, no backend change. Baseline: R3A `bfa9bed`,
R3B `cffc42a`.

## §1 audited chain (before → after)
Shipment Draft = `shipping-history.js` (`#shipment-draft-section`). Confirm & Dispatch flow = `shConfirmShipment` →
`_shOpenConfirmModal` → **`_shRunConfirm`**, which did: `updateShipment` (Save physical fields) → `confirmShipmentAndDispatch`
(R3B). **Gap:** no step ever generated draft allocations, so R3B always failed `SHIPMENT_PO_ALLOCATION_MISSING`.

**After R3C** `_shRunConfirm` does: `updateShipment` (Save) → **`generateShipmentLineAllocations {shipment_id}`**
(the R3A shipment-scoped authority — reconciles all lines in one call) → readiness gate → `confirmShipmentAndDispatch`
(R3B). New thin DB adapter `window.KM.DB.generateShipmentLineAllocations` (mirrors `confirmShipmentAndDispatch`;
refreshes the cache on success).

## §21 Completion report
1. PRE HEAD — chat · 2. POST HEAD — chat.
3. Shipment Draft page owner = `shipping-history.js` (`renderShipmentDraft`/`_shRenderDbCard`).
4. Physical Save owner = `window.KM.DB.updateShipment` (via `_shCollectExec`). 5. shipment_lines mutation owner = backend `createShipmentFromApprovedPlan_` (unchanged) — the draft page never edits line qty.
6. Allocation trigger before R3C = **none** (draft allocations were never generated). 7. After R3C = `generateShipmentLineAllocations` in `_shRunConfirm`, after Save, before dispatch.
8. R3A canonical backend owner = `handleGenerateShipmentLineAllocations_` (32_). 9. Router/API action = `generateShipmentLineAllocations` (R3A). 10. Reconciliation grain = **shipment-scoped** (one call → all lines).
11. Save→allocation sequence = `updateShipment` → `generateShipmentLineAllocations` → readiness gate → `confirmShipmentAndDispatch` (never allocate-then-save).
12. Quantity authority = `shipment_lines.shipment_qty` (backend). 13. FIFO authority = R3A only. 14. Capacity authority = R3A (`completed − shipped − other-draft`) / R3B (in-lock revalidation). 15. Company authority = `shipments.company` (backend). 16. Factory authority = `procurementResolveFactoryId_(source_warehouse_id)` (backend).
17. Shared-factory proof = preserved at R3A/R3B (frontend adds no matching logic; guard test: no company/factory inference in the page).
18–22. New line / qty-increase / qty-decrease / removal / same-save-retry = all handled by the **R3A reconciliation** the wiring invokes (self-release + atomic replace; idempotent) — proven by R3A tests; R3C calls it once per dispatch.
23. Insufficient-capacity = `PO_CAPACITY_INSUFFICIENT` surfaced as "PO Allocation — Needs Attention" with backend need/available/short; **dispatch blocked, draft stays saved** (fail closed).
24. Readiness UI owner = the confirm-modal status line (compact, reuses existing presentation; no new component). 25. Confirm & Dispatch behavior = runs only after allocation is ready. 26. **R3B authority preserved = YES** (backend still validates + executes in-lock; frontend readiness is UX only).
27. Stale-capacity = R3B still fails closed `PO_CAPACITY_CHANGED_BEFORE_DISPATCH` (not weakened; frontend does not attempt to solve it).
28. Post-dispatch edit verdict = unchanged — line qty is read-only on the draft page; no path rewrites dispatched lineage (no `DISPATCHED_SHIPMENT_EDIT_POLICY_GAP` triggered). 29. Reversal verdict = **deferred** (`DISPATCHED_SHIPMENT_REVERSAL_POLICY_GAP`); not invented.
30. `shipment_lines.purchase_order_line_id` = untouched (not repurposed; multi-PO authority stays in allocations). 31. `shipment_line_allocations.shipped_qty` = untouched/reserved (never written; not authority).
32. Receipt impact = NONE. 33. On-the-Way impact = NONE. 34. Shipping Plan impact = NONE (no PO key forced).
35. Frontend FIFO/math audit = **none** (guard tests: no `order_date`, no `completed − shipped`, no `shipped_qty` write, no PO-line assignment, no allocator). 36. API fan-out = **one** shipment-scoped call (no `Promise.all`/per-SKU burst).
37. Files changed = `assets/js/pages/shipping-history.js`, `assets/js/api/operation-system-db-api.js`, new `shipment-draft-allocation-wiring-f1-5b-ship-r3c.test.js`.
38. Tests = 1 new (22). 39. Focused = R3C 22/22. 40. R3A regression = 43/43. 41. R3B regression = 29/29. 42. Full regression = **197 pass / 4 known baseline**.
43. **Apps Script sync = NO.** 44. Frontend deploy = `shipping-history.js` + `operation-system-db-api.js`. 45. Bundle rebuild = NO (no `assets/js/core/*`).
46. DB/schema impact = NONE. 47. API impact = frontend adapter for an existing router action (no new backend action). 48. Formula = NONE. 49. Inventory = NONE. 50. PO = NONE (reconciliation/execution unchanged). 51. Shipment = draft allocations now generated before dispatch (behavioral enablement; no schema/qty change).
52. Commit = chat.
53. USER live verification = open a Shipment Draft with `shipment_lines`, click Confirm & Dispatch → status shows "Preparing PO allocation…" → if capacity is sufficient, draft allocations are generated and the shipment dispatches (R3B flips them executed + reconciles `shipped_qty`); if insufficient, "PO Allocation — Needs Attention" with need/available/short and **no dispatch** (draft remains saved).
54. Remaining gaps = post-dispatch reversal (deferred); optional richer readiness surface on the draft card (not built — kept minimal per §7/§8); a non-dispatch "Save" that also reconciles (current trigger is at Confirm, the correctness-critical moment).
55. Next authorized slice = **F1-5C** — persisted final-output seam audit (Shipment → lines → allocations → PO → Shipping Detail snapshot → UPC/document fields → Export), then full production E2E.

## §22 FINAL GATE
physical Save first ✓ · canonical R3A reconciles after Save, before dispatch ✓ · one FIFO authority ✓ · no frontend FIFO ✓ · no frontend PO-capacity math ✓ · no browser SKU fan-out ✓ · Σ draft = shipment_qty when ready (R3A) ✓ · qty changes reconcile (R3A) ✓ · removed lines release reservation (R3A) ✓ · insufficient capacity visible + fails closed ✓ · draft may stay saved while blocked ✓ · Confirm & Dispatch backend-authoritative ✓ · R3B capacity revalidation preserved ✓ · executed allocations not silently rewritten ✓ · no reversal invented ✓ · shared factory preserved, factory ⇎ company ✓ · Shipping Plan = logistics intent ✓ · shipment_lines = physical truth ✓ · allocations = PO-consumption authority ✓ · allocation shipped_qty non-authoritative ✓ · Receipt / On-the-Way / AI Plan / Request Order / RO→PO unchanged ✓ · Export not started ✓ · no schema change ✓ · no second engine ✓ · no unrelated refactor ✓.

**STOP after R3C.** Export Center, Shipping-Detail redesign, post-dispatch reversal, and full AI Plan E2E are NOT started.
