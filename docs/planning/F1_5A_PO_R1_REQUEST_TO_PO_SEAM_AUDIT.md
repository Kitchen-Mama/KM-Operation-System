# F1-5A-PO-R1 — Request Order → Procurement / PO Seam Audit

**MODE:** AUDIT-FIRST → BOUNDED INTEGRATION · **Outcome:** **HALT — `PO_EXECUTION_IDEMPOTENCY_GAP`**
**Date:** 2026-08-12 · **Baseline:** FM6 / R4E5B frozen · `request_order_line_sources.request_allocation_draft_id` = **LIVE (PRESENT)**, USER-added; no migration/backfill performed or proposed.

The §0 owner map is proven below. It proves the canonical Request→PO path **and** proves the PO
creator lacks durable exactly-once protection. Per the FINAL GATE (“If PO exactly-once cannot be
proven: HALT with PO_EXECUTION_IDEMPOTENCY_GAP”) this round **stops at audit — no code written.**

---

## §0 Owner map (all 19 traced; classified)

| # | Owner | Where | Class |
|---|---|---|---|
| 1 | `request_orders` writer | `roCreateRequestOrderCore_` [13_:733,885](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L885) | **CANONICAL** (ScriptLock + ROEXEC) |
| 2 | `request_order_lines` writer | `roCreateRequestOrderCore_` [13_:800](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L800) | **CANONICAL** |
| 3 | `request_order_line_sources` writer | [13_:843](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L843), lineage FK [13_:870](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L870) | **CANONICAL** |
| 4 | Request Order Draft page reader | `request-order-draft.js` → `getRequestOrders()` [db-api:2341](../../assets/js/api/operation-system-db-api.js#L2341) | **CANONICAL** (display/reader) |
| 5 | RO status lifecycle | `handleUpdateRequestOrderStatus_` [13_:963-1004](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L963-L1004) | **CANONICAL** |
| 6 | Approval / selected-for-PO | transition `approve` [13_:974-978](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L974-L978) → `request_status='approved'` | **CANONICAL** |
| 7 | Procurement / PO Workspace page | `purchase-order-overview.js`, `purchase-order-list.js` | **CANONICAL** (display) — KEEP |
| 8 | PO Workspace data reader | `getPurchaseOrders()` → `db.purchase_orders` [db-api:2351](../../assets/js/api/operation-system-db-api.js#L2351) | **CANONICAL** (reader) |
| 9 | convertToPO / PO creation owner | `handleCreatePurchaseOrderFromRequest_` [13_:1534](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1534) | **CANONICAL but IDEMPOTENCY-DEFICIENT** ⚠ |
| 10 | `purchase_orders` writer | creator [13_:1680](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1680); sample seed [13_:2209](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L2209) | **CANONICAL** + **LEGACY** (dev seed, not in RO→PO flow) |
| 11 | `purchase_order_lines` writer | [13_:1628](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1628) | **CANONICAL** |
| 12 | supplier / factory owner | `procurementResolveFactoryId_` [13_:1748](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1748) + RO supplier fields | **CANONICAL** |
| 13 | company owner | `request_orders.company` (roVal) [13_:1560](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1560) | **CANONICAL** |
| 14 | currency owner | `request_orders.currency` [13_:1567](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1567) | **CANONICAL** |
| 15 | request month / required-by | request line `request_month`/`request_bucket` + `inspection/expected_ready/expected_ship` copied to PO [13_:1661-1663](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1661-L1663) | **CANONICAL** (preserved from RO) |
| 16 | PO qty owner | `approved_qty → ordered_qty` [13_:1619,1649](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1649) | **CANONICAL** |
| 17 | PO number owner | `'PO-'+date+uuid+groupKey` [13_:1607](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1607) | **CANONICAL** (non-deterministic — part of the gap) |
| 18 | RO → PO linkage | PO line `request_order_line_id`/`request_order_id` [13_:1631-1632](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1631-L1632); RO line back-ref `purchase_order_line_id` [13_:1671](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1671); `purchase_orders.request_order_id` [13_:1704](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1704) | **CANONICAL** (durable) |
| 19 | PO → Shipment linkage | PO line `related_shipment_id` (blank at create [13_:1664](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1664); populated by shipment handlers) | **CANONICAL** (exists) |

**No PARALLEL/CONFLICTING production PO creator exists** — the only other `purchase_orders` writer is a dev sample-seed. §9 satisfied (one canonical creator).

## §1 Request Order = execution input — CONFIRMED
`handleCreatePurchaseOrderFromRequest_` reads **only** `request_orders` + `request_order_lines`. It
never reads `order_planning_gap`, AI recommendation, `request_order_allocation_drafts`, KMREC, FC
Share, or live Factory allocation for quantity. Allocation drafts are lineage/history only. ✓

## §2 Quantity authority — CONFIRMED, no recompute
`order_qty` (persisted allocation) → `request_order_lines.requested_qty` (=`approved_qty`, approved
defaults to requested at RO creation) → PO `ordered_qty` = `approved_qty` [13_:1619,1649]. No
re-suggest, no re-ceil (existing `carton_qty` reused), `recommended_qty` copied as a **display
snapshot only** [13_:1646] — never used as the order quantity. ✓ Golden B holds.

## §3 Eligibility — proven vocabulary
Lifecycle: `draft → (submit) → pending_approval → (approve) → approved → (convert) → converted_to_po`;
`reject → draft`; `cancel → cancelled` (from draft/pending_approval); `done` stamps completion on
approved/converted. **PO-eligible = `request_status === 'approved'` only** [13_:1551]; `converted_to_po`
rejected [13_:1550]. No invented statuses.

## §4/§12 Linkage & lineage — durable, preserved
`request_order_allocation_draft → request_order_line_sources.request_allocation_draft_id → request_order
→ request_order_line → purchase_order_line → purchase_order`. The final segment exists (row 18). Convert
does **not** destroy upstream lineage (it only appends PO rows + one back-ref + the RO status flip). ✓

## §5 Split-PO grain — proven
**1 Request Order → up to 2 Purchase Orders by bucket group**: `T1` → one PO; `T2`+`T3` → one combined
`T2_T3` PO [13_:1578,1602]. NOT split by factory/supplier/company. Each PO line keeps its original
`request_bucket`. Conservation holds trivially: every active line is converted once at full
`approved_qty` (no split-quantity formula).

## §6 Factory / supplier authority — CANONICAL (not the blocker)
`factory_id = procurementResolveFactoryId_(warehouse_id → warehouses master → RO factory_id → warehouse_id)`
[13_:1566,1748]; supplier/company/currency from `request_orders`. **No free-text/SKU-name inference.**
→ **No `PO_FACTORY_SUPPLIER_AUTHORITY_GAP`.**

## §7 Dates — preserved from RO
`inspection_date`, `expected_completion_date ← expected_ready_date`, `expected_ship_date` copied
date-only from the request line; supplier-confirmation dates + `order_date`/`deposit_due_date` blank at
Convert (stamped later at Send PO). No carrier/shipping lead-time logic introduced. ✓

## §11 Partial conversion — UNIMPLEMENTED (whole-line only)
Convert takes **all** active (non-cancelled) lines at full `approved_qty`; there is no
`converted_qty`/`remaining-to-PO` tracking on `request_order_lines` (the `remaining_qty` on
`purchase_order_lines` is a PO-internal `completed − shipped`, unrelated to RO conversion). Partial
RO→PO is not a current capability; over-conversion is prevented only by the whole-RO status guard —
which is exactly the gap below.

---

## ⛔ HALT — `PO_EXECUTION_IDEMPOTENCY_GAP`

**Exactly-once for PO creation cannot be proven.** `handleCreatePurchaseOrderFromRequest_`:

- has **no `LockService`/ScriptLock** (the lock at [13_:718](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L718) belongs to the R4E5B **RO** creator, not this handler);
- has **no deterministic idempotency key** (unlike ROEXEC — PO ids/nos are random UUIDs [13_:1606-1607]);
- guards duplicates only by a **non-atomic read-check-write**: read `request_status` → reject if
  `converted_to_po` [13_:1550] → … create PO(s)/lines … → write `converted_to_po` **at the very end**
  [13_:1734];
- the frontend `convertToPo` has only a `confirm()` dialog — no in-flight disable [request-order-draft.js:770](../../assets/js/pages/request-order-draft.js#L770).

**Failure scenario (concrete):** user double-clicks Convert (or two tabs, or a retry after a timed-out
but actually-successful first call). Both invocations read `request_status='approved'`, both pass the
guard, both create a full PO set (up to 2 POs + their lines), both stamp `converted_to_po`. Result:
**duplicate `purchase_orders` + `purchase_order_lines`**, and the second run **overwrites** the RO
line's `purchase_order_line_id` back-ref [13_:1671], orphaning the first PO's lineage. There is no
compensation and no post-hoc dedupe.

**Why this is a hard HALT:** the spec forbids weak frontend-only protection and forbids implementing
before the seam is proven safe. A correct fix is a backend durable-idempotency change to a
production-critical PO writer — it must be its own authorized, spec’d slice (mirroring the R4E5B
pattern), not an unbounded add-on inside an audit round.

### Required fix (next slice — NOT executed here)
Bring the PO creator to the **R4E5B exactly-once bar**, reusing existing patterns (no new engine/table):
1. Wrap `handleCreatePurchaseOrderFromRequest_` in the canonical **ScriptLock** and **re-read
   `request_status` inside the lock** before creating (closes the read-check-write race), **or**
2. add a **deterministic PO execution key** (e.g. `POEXEC-<sha256(request_order_id | bucket_group)>`
   stored on `purchase_orders`, pre-checked like `roFindByExecutionKey_`), giving true converge-to-one
   on double-click/retry — the stronger option, matching ROEXEC; plus compensation on partial write.

Either option is an **additive, backend-owned** change with focused exactly-once tests — to be
authorized as **F1-5A-PO-R2** before any integration wiring.

---

## Completion report

1. **PRE/POST HEAD** — in chat. 2. **RO reader owner** — `getRequestOrders` (db-api:2341) + Request Order Draft page. 3. **RO lifecycle** — draft→pending_approval→approved→converted_to_po (+reject→draft, cancel, done). 4. **Procurement Workspace owner** — `purchase-order-overview.js` / `purchase-order-list.js`. 5. **PO Workspace data source** — `getPurchaseOrders()` → `db.purchase_orders`. 6. **Quantity authority** — `order_qty→requested_qty(=approved_qty)→ordered_qty`, no recompute. 7. **Eligible RO rule** — `request_status='approved'` only. 8. **RO→PO lineage** — durable (row 18). 9. **PO business grain** — 1 RO → up to 2 POs by bucket group (T1 / T2_T3). 10. **Split-PO** — by bucket group only; whole-line, conserved. 11. **Factory/supplier authority** — canonical `procurementResolveFactoryId_` + RO fields. 12. **Company authority** — `request_orders.company`. 13. **Currency authority** — `request_orders.currency`. 14. **Required-by/date** — preserved from RO line (date-only). 15. **Canonical PO creator** — `handleCreatePurchaseOrderFromRequest_` (single). 16. **Duplicate-PO / idempotency verdict** — **GAP (HALT)**: no lock, no key, racy status check. 17. **Partial conversion authority** — none (whole-line). 18. **Remaining-qty authority** — n/a at RO→PO (PO `remaining_qty` = completed−shipped). 19. **RO post-conversion status** — `converted_to_po`. 20. **Lineage preservation** — intact. 21/22. **Page before/after** — unchanged (no edits this round). 23. **Files changed** — this audit doc only. 24/25. **Tests added/changed / focused** — none (audit only). 26. **Full regression** — not re-run (no runtime change); last known 192 pass / 4 baseline. 27. **Apps Script sync** — none. 28. **Frontend deploy** — none. 29. **Bundle rebuild** — none. 30. **DB/schema impact** — none. 31. **API contract** — unchanged. 32. **Formula impact** — none. 33. **Stock/shipment impact** — none. 34. **Commit hash** — in chat. 35. **USER live verification** — n/a (no change). 36. **Exact blocker** — `PO_EXECUTION_IDEMPOTENCY_GAP` (see above). 37. **Next authorized slice** — **F1-5A-PO-R2**: backend durable exactly-once for the PO creator (ScriptLock + re-read, or POEXEC key + compensation) with focused tests; integration wiring only after.

## FINAL GATE

REQUEST ORDER = PROCUREMENT INPUT ✓ · PERSISTED requested_qty = PO INPUT ✓ · NO AI/GAP RECOMPUTE ✓ ·
ONE CANONICAL PO CREATOR ✓ · REQUEST→PO LINEAGE PRESERVED ✓ · FACTORY/SUPPLIER CANONICAL ✓ ·
DOWNSTREAM PO PAGES PRESERVED ✓ · NO SECOND PROCUREMENT ENGINE ✓ · NO UNAUTHORIZED SCHEMA CHANGE ✓ ·
**PO EXACTLY-ONCE NOT PROVEN → HALT PO_EXECUTION_IDEMPOTENCY_GAP** ⛔ (no code written; no integration performed)
