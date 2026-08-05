# Request Order & Purchase Order — Procurement Layer Phase 1 Spec

**Status:** 🟢 Phase 1 — UI + Mapping + DB Handler Foundation (API-ready, no auto-procurement engine). **B-5 RESOLVED — Decision Only (2026-08-03, §3.9):** `request_order_lines` / `request_order_line_sources` final grain, quantity authority, Monthly SKU split, and the Recommendation→Request writer boundary are canonical; **no writer / DB migration / Runtime implemented**. B-6 / B-8 remain open; B-7 unchanged.
**Last Updated:** 2026-08-03
**Maintained By:** Development Team
**Related:** [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md) (extended / future design — three-layer sources, payment terms, multi-PO links), [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md)
**Authoritative formula:** [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) (v4.1 FINALIZED). Net Order Need, Order CEILING, T1–T4 tiers, company reallocation, and missing-UPC handling are defined there; this spec only maps the procurement UI/DB and must not restate a divergent formula.

> **This is the Phase-1 IMPLEMENTED design** for the Procurement Layer (Request Order Draft, Purchase Order Overview, Purchase Order List). It intentionally uses a **flat, directly-implementable** schema (header carries `company` / `supplier` / `factory_id`) so the UI + Apps Script handlers + API adapter can ship now.
>
> The sibling [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md) (v1.3) remains the **extended / future design** — three-layer request structure with `request_order_line_sources`, `supplier_price_list` / `payment_terms` masters, and `request_order_po_links` for multi-PO splits. When the future calculation engine and multi-company source breakdown are built, this Phase-1 schema migrates toward that design (additively; no field removed here is reused with a different meaning there).
>
> **Guardrails honored:** no Factory Stock deduction · no Factory Allocation Engine · no Carrier Rate Engine · no Export/Template Center · no payment/invoice settlement · no full auto-procurement algorithm · no Role & Permission implementation. Actor fields are placeholder identities.

> **Phase 1 P1-B — Order + Allocation + Quantity Reconciliation (CANONICAL 2026-07-22).** Consolidated so Replenishment, Request/PO, Shipment and Inventory share **one** quantity/status vocabulary:
> - **Flow:** `Net Replenishment Need (SUPPLY_PLANNING §2A) → allocate qualified existing supply → residual uncovered gap → consolidate by SKU + Factory + required date → apply carton CEILING + production lead time → Order Recommendation → user approval → Request Order / PO`. **MOQ automation is a Future Extension (not applied to Suggested Order Qty in Phase 1)** — owner `SUPPLY_PLANNING_CALCULATION_RULES.md` §14.
> - **Source tracking:** `request_order_line_sources` records *why/where* a request line came from (demand-source traceability); it is the audit trail, not a second quantity authority.
> - **Company Allocation lifecycle:** allocation is a **recommendation** until explicitly approved/committed; only then is it a **locked** commitment. `shipment_line_allocations` (planned table) links a **Shipment Line ↔ PO Line** (the supply-source axis) — see `DATABASE_RELATIONSHIP_MAP.md` §8B.
> - **Canonical quantity fields (one definition everywhere):** `allocated_qty` (committed to a shipment line), `shipped_qty` (physically shipped), `completed_qty` (production completed / received-to-factory), `ordered_qty` (PO ordered). Derived (never stored):
>   - `remaining_qty  = MAX(completed_qty − shipped_qty, 0)`  (available-to-ship; **NOT** `ordered − completed`, **NOT** `ordered − shipped`)
>   - `unreceived_qty = MAX(ordered_qty − completed_qty, 0)`  (production still outstanding; Receive-modal / progress display only)
> - **Stock-movement timing (shared with `SHIPMENT_CENTER_SPEC.md` §15.1):** Shipment **Draft does NOT deduct `current_stock`**; pre-locking uses **`reserved_stock`**; **Confirm & Ship** is the single physical deduction + movement-ledger trigger. Cancel / partial ship / quantity adjustment / reversal movements must **never double-deduct** (each qty change appends a ledger row; balances are never blind-overwritten).
> - **PO committed-supply boundary for Qualified Incoming (B-4 contract repair, 2026-08-01; business predicate owned by `SUPPLY_PLANNING_CALCULATION_RULES.md` §2E).** A PO row contributes to the **Timely Approved / Committed Supply** term (never double-counted with Shipment Incoming), using only the **remaining production/shippable quantity not already represented by a Shipment**:
>   - `draft` → **excluded**. *(SOURCE_CONFIRMED)*
>   - `issued` / `in_production` / `partial_completed` / `completed` → **production-side Approved / Committed Supply**, quantity = **available-to-ship = `MAX(completed_qty − shipped_qty, 0)`** (not yet shipped). *(`issued`/`completed`/`cancel` transitions SOURCE_CONFIRMED in the runtime subset; `partial_completed` = SPEC_ONLY, receive flow not yet built.)*
>   - `partial_shipped` / `shipped` → the **Shipment becomes the incoming owner** for the shipped quantity (`shipped_qty`); the PO no longer counts that quantity. *(SPEC_ONLY — these PO transitions are not in the current runtime subset.)*
>   - `closure` / `cancelled` → **excluded**. *(canonical terminal token is `closure`, not legacy `closed`; SPEC_ONLY for `closure`.)*
>   - **`unreceived_qty = MAX(ordered_qty − completed_qty, 0)` is DERIVED ONLY — never a stored DB column; no migration is required.** `remaining_qty` is the persisted/materialized representation of `available_to_ship` where currently implemented. Shipment allocation **consumes** PO available-to-ship **read-only** (never writes back into the PO on receive) — the count-once boundary between PO-committed and Shipment-incoming. **A formal Shipment is the incoming owner once the quantity is on it; the earlier PO/plan committed bucket must not be counted for that same quantity.**

---

## 1. Purpose & Scope

Phase 1 builds the **first version UI + data flow foundation** for the Procurement Layer:

1. **Request Order Draft** = **Procurement Planning Draft** — the request approval workspace (Draft / Pending Approval / Approved).
2. **Purchase Order Overview** = **Procurement Commitment dashboard** — PO cards grouped by execution status.
3. **Purchase Order List** = **PO operational list / history** — filterable table view.

Phase 1 delivers: menu + pages + card/expand UI + status flows + the four DB tables + Apps Script basic handlers + API-ready normalizers/getters/writers. It does **not** build the auto-procurement algorithm, supplier API, payment flow, or formal document generation.

---

## 2. Layer Definition & Immutable Flow (authoritative)

| Term | Meaning |
|------|---------|
| **Request Order Draft** | **Procurement Planning Draft** — a proposed purchase request, editable and subject to approval. |
| **Purchase Order** | **Procurement Commitment** — the formal order to the supplier, created only from an approved request. |
| **Purchase Order List** | **PO operational list / history** — a read/query projection over PO tables. |

**Immutable Flow (must hold):**

```
Shipment / Inventory / Factory Stock          (upstream demand signals — read only)
        ↓  copy (never write back)
Request Order Draft   (request_orders + request_order_lines)      [Procurement Planning Draft]
        ↓  copy (never write back)
Purchase Order        (purchase_orders + purchase_order_lines)    [Procurement Commitment]
```

- **Downstream may copy upstream data but must NOT write back upstream.**
- `purchase_orders` **never** writes `request_orders` (except the one-time `request_orders.request_status = converted_to_po` marker set on the request itself at conversion — that is the request layer recording its own conversion, not the PO editing the request). *(Canonical: `request_status` is the only status field written; legacy `status` is read-only fallback for old rows and is never re-ensured/created/written.)*
- `request_orders` **never** writes `shipments` / inventory / `factory_stock`. Upstream references are copied into `source_ref_type` / `source_ref_id` / `related_entity_*` for traceability only.

---

## 3. DB Schema (Phase 1 — implemented; tables auto-created with documented header)

> Tables live in the OPERATION DB spreadsheet. `13_procurement_handlers.gs` **auto-creates** any missing procurement tab with its documented header row (missing-header-safe; existing tables never altered). Full column notes in [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §7.

### 3.1 `request_orders`
`request_order_id` (PK), `request_order_no`, `request_order_version`, `parent_request_order_id`, `company`, `supplier_id`, `supplier_name`, `factory_id`, **`warehouse_id`** (default = `WH-TW-CN-FACTORY-YOUXIN` / CN Youxin when none supplied), **`request_status`** (canonical), **`tier_group`**, `total_sku`, `total_qty`, `total_cartons`, `estimated_amount`, `currency`, `source`, `source_ref_type`, `source_ref_id`, `created_by`, `created_at`, `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejected_reason`, `cancelled_by`, `cancelled_at`, `completed_by`, `completed_at`, `note`, `updated_by`, `updated_at`.

- **`request_status`** is the **canonical header status** (`draft` / `pending_approval` / `approved` / `cancelled` / `converted_to_po`). The legacy **`status`** column is **NO LONGER written or ensured** (removed from the header array so it is not recreated). Handlers/normalizers read `request_status` first and fall back to `status` **only** for old rows.
- **`tier_group`** summarizes the buckets across the request's lines: **only T1 → `T1`; only T2/T3 → `T2_T3`; both → `mixed`; none → blank**.
- **Header-level dates are NOT written** — `inspection_date` / `expected_ready_date` / `expected_ship_date` are **line-level** (T1 and T2/T3 can differ); canonical source is `request_order_lines`.

### 3.2 `request_order_lines` — **FINAL schema (PO v2 mapping)**

**Final column order (canonical):**
`request_order_line_id` (PK) · `request_order_id` (FK) · `sku` · **`company`** · **`request_bucket`** · **`request_month`** · `series` · `supplier_id` · `supplier_name` · `supplier_sku` · **`factory_item_no`** · **`factory_item_name`** · **`supplier_warehouse_id`** · **`km_qty`** · **`resus_qty`** · **`restw_qty`** · **`recommended_qty`** · `requested_qty` · `approved_qty` · **`shortage_qty`** · **`reallocation_qty`** · `carton_qty` · `units_per_carton` · `unit_cost` · `estimated_amount` · `currency` · **`calculation_method`** · **`line_status`** · **`inspection_date`** · **`expected_ready_date`** · **`expected_ship_date`** · **`purchase_order_line_id`** · `note` · **`cancelled_by`** · **`cancelled_at`** · **`cancel_reason`** · `created_at` · `updated_at`.

**Line identity & rules:**
- **Line grain / identity — RESOLVED under B-5 (canonical, §3.9):** the line natural key is `(request_order_id, company, sku, request_bucket)` with `request_month` a cycle snapshot attribute (not identity). One company = one line **stands**, but **one line owns 1..N `request_order_line_sources`** (the prior "one company = one source" is now the degenerate single-marketplace case). Full authority: **§3.9** (supersedes the earlier "Blocked / legacy / provisional" wording).
- **`request_bucket`** = **canonical `T1` / `T2` / `T3`** — **`tier_type` MUST NOT be used on this table** (deprecated; never re-add). `request_month` = `YYYY-MM`.
- **`km_qty` / `resus_qty` / `restw_qty`** = per-company allocation — the matched company column carries the qty (= `approved_qty`), others `0` (never blank). Recomputed on `approved_qty` edit; validated so the row Approved = `km_qty + resus_qty + restw_qty` (Manual Allocation Mode, §13).
- **`recommended_qty`** = engine/allocation-draft recommendation snapshot (blank when no formula). **`requested_qty`** = requested from the Order Allocation draft. **`approved_qty`** = editable approval qty (decision). **`shortage_qty` / `reallocation_qty`** = allocation snapshots (blank when no formula).
- **`factory_item_no` / `factory_item_name`** = factory's own item number/name (from supplier/factory master when available; blank otherwise). **`supplier_warehouse_id`** = supplier/factory warehouse reference.
- **`inspection_date` / `expected_ready_date` / `expected_ship_date`** — line-level schedule; per tier, written to every line of the tier on Save. **`expected_ready_date` is the source of the PO `expected_completion_date` / `supplier_expected_ready_date`** at conversion (§C mapping / §3.3).
- **`line_status`** = `draft` / `submitted` / `approved` / `cancelled` — **must always be populated**. **`cancelled` is terminal + immutable** (§13.4 / §G): `cancelled_by` / `cancelled_at` / `cancel_reason` record the soft-cancel; the row is never reactivated or deleted.
- **`purchase_order_line_id`** = the created PO line (traceability) — **replaces the deprecated `linked_purchase_order_line_id`**; blank until Convert to PO.
- **`calculation_method`** = source label (`manual_order_allocation` …).

> All columns are **additive** — `sheetEnsureColumns_` appends any missing header; existing columns are never altered, and **deleted headers are missing-header-safe** (code never re-creates removed columns).

**DEPRECATED — no longer written or ensured** (kept only if physically present; NOT source of truth; code must **not** re-create): on `request_order_lines` → `final_order_qty`, `forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `source_company_count`, `source_site_count`, **`tier_type`**, `product_name`, `need_reason`, `related_entity_type`, `related_entity_id`, **`linked_purchase_order_line_id`** (replaced by `purchase_order_line_id`); on `request_orders` → `status` (replaced by `request_status`), header `inspection_date`/`expected_ready_date`/`expected_ship_date` (line-level only). Forecast / stock / on-the-way snapshot detail is owned by **`request_order_line_sources`** (§3.8) as **demand-provenance** (RESOLVED under B-5, §3.9) — and **must NOT be re-added to `request_order_lines`**.

### 3.3 `purchase_orders` — **FINAL schema (PO v2 mapping)**

**Final columns (canonical):**
`purchase_order_id` (PK) · **`po_no`** · **`km_po_no`** · **`warehouse_id`** · `supplier_name` · **`order_status`** · **`order_date`** · **`deposit_due_date`** · `inspection_date` · **`expected_completion_date`** · `expected_ship_date` · **`subtotal_amount`** · **`deposit_amount`** · **`balance_amount`** · **`paid_amount`** · **`payment_status`** · **`payment_term_id`** · `currency` · `note` · `purchase_order_no` · `po_version` · `parent_purchase_order_id` · `request_order_id` (FK, copied) · `company` · `supplier_id` · **`factory_id`** · `total_sku` · `total_qty` · **`total_cartons`** · `total_amount` · **`supplier_expected_ready_date`** · **`supplier_confirmed_ready_date`** · **`request_bucket`** · `created_by` · `created_at` · `updated_by` · `updated_at` · `issued_by` · `issued_at` · `confirmed_by` · `confirmed_at` · `cancelled_by` · `cancelled_at` · `completed_by` · `completed_at` · **`closure_reason`** · **`closed_by`** · **`closed_at`**.

**Field rules & mapping:**
- **`order_status`** is the **canonical** status (enum §6: `draft` / `issued` / `in_production` / `partial_completed` / `completed` / `partial_shipped` / `shipped` / `closure` / `cancelled`). The legacy **`status`** column is **DEPRECATED — never written or ensured** (read-fallback only for old rows).
- **PO numbers:** **`po_no`** = the canonical PO number assigned at **Send PO**. **`km_po_no`** = the KM-facing / internal PO number. **`purchase_order_no`** = retained full/legacy PO number (may equal `po_no`); kept for back-compat, not the canonical key.
- **`order_date` = the Send PO date** (when the PO is issued to the supplier) — **NOT** the create date. **`created_at`** = system row-creation time. (`issued_at` is also stamped at Send; `order_date` is the business-facing order date.)
- **`deposit_due_date` = `order_date` + 5 BUSINESS days** (Mon–Fri; Sat/Sun excluded; **holiday calendar deferred**). Stamped **at Send PO** together with `order_date`; **blank at Convert** (order_date blank). **Never computed from `created_at`.** Stored **date-only `yyyy-MM-dd`**. Editable in the PO Workspace header edit modal; a manual-override flag / auto-recalc-on-order_date-change is **deferred**.
- **Supplier timeline fields (supplier-specific, not globally required):** **`supplier_expected_ready_date`** = supplier-side expected ready date; **`supplier_confirmed_ready_date`** = supplier confirmed ready/completion date. Some suppliers/factories populate them, others leave blank — **do not force required**. The Workspace Production Timeline **may display `supplier_expected_ready_date`** when populated; document generation may later map **`SUPPLIER_DATE_FULL` ← `supplier_expected_ready_date`**.
- **`request_bucket`** on the PO **header** stores **`T1`** for a T1 PO or **`T2_T3`** for the combined T2+T3 PO (§F split rule). Each PO **line** keeps its original `T1`/`T2`/`T3` (§3.4).
- **`factory_id`** is **resolved from `request_orders.warehouse_id`** via the warehouse master at conversion; **`warehouse_id`** remains the source ID; **factory display = `warehouses.warehouse_name`**.
- **Ready/completion date mapping (finalized):** at conversion, `purchase_orders.expected_completion_date` ← the matching `request_order_lines.expected_ready_date` (by `request_order_id` + `request_bucket`; the tier's representative value). **`supplier_expected_ready_date` MIRRORS `expected_completion_date`** (same value) and is the canonical cross-doc "supplier timeline" name. **`supplier_confirmed_ready_date`** = blank at creation; set/updated on supplier confirmation or delay Update (append timeline history, §7.2). `inspection_date` / `expected_ship_date` are copied from the matching `request_order_lines` (same key).
- **Payment:** `subtotal_amount` = Σ line_amount; `deposit_amount` = `subtotal_amount × deposit ratio` when known (else blank); `balance_amount` = `subtotal_amount − deposit_amount` when deposit known (else blank); `paid_amount` / `payment_status` / `payment_term_id` track factory payment (Block 4).
- **`total_sku` = `COUNT(DISTINCT sku)`** (never row count — §7.4 Total SKU Rule). `total_qty` = Σ `ordered_qty`; **`total_cartons` = Σ `purchase_order_lines.carton_qty`**; `total_amount` = Σ `line_amount`. All are written at Convert to PO and kept in sync by any PO totals recalculation.

**DEPRECATED on `purchase_orders` — never written/recreated:** **`status`** (→ `order_status`), **`expected_ready_date`**, **`confirmed_ready_date`** (→ `supplier_expected_ready_date` / `supplier_confirmed_ready_date`; no mixed naming anywhere). Distinct from the Request Order line schedule `request_order_lines.expected_ready_date` (§3.2), which keeps its name and is the mapping source.

### 3.4 `purchase_order_lines` — **FINAL schema (PO v2 mapping)**

**Final columns (canonical):**
`purchase_order_line_id` (PK) · `purchase_order_id` (FK) · `request_order_line_id` (copied) · **`request_order_id`** (copied) · **`request_bucket`** · `sku` · **`company`** · `series` · **`factory_item_no`** · **`factory_item_name`** · `supplier_id` · `supplier_name` · `supplier_sku` · **`supplier_warehouse_id`** · **`km_qty`** · **`resus_qty`** · **`restw_qty`** · **`recommended_qty`** · **`requested_qty`** · **`approved_qty`** · `ordered_qty` · **`completed_qty`** · `shipped_qty` · `remaining_qty` · `carton_qty` · `units_per_carton` · `unit_cost` · `line_amount` · `currency` · **`line_status`** · `inspection_date` · **`expected_completion_date`** · `expected_ship_date` · `related_shipment_id` · `note` · `created_at` · `updated_at`.

**Field rules & mapping (snapshot — copied at Convert to PO):**
- **`product_name` is REMOVED** (not on `purchase_order_lines`). Product display joins `sku_details` by `sku` (display-label only).
- **Company allocation snapshot is MANDATORY:** **`km_qty` / `resus_qty` / `restw_qty`** copied from `request_order_lines` (exactly one non-zero per line — reflecting the request-side per-company grain, now **canonical (RESOLVED under B-5, §3.9)** — copied at Convert; the PO owns the snapshot). **`request_bucket`** (original `T1`/`T2`/`T3`) is **mandatory**. **`line_status`** is **mandatory**.
- **`ordered_qty` = `request_order_lines.approved_qty`** (the committed **execution** quantity). **`km_qty + resus_qty + restw_qty` must equal `ordered_qty`** (company allocation snapshot).
- **`requested_qty` / `approved_qty` / `recommended_qty` on `purchase_order_lines` are AUDIT SNAPSHOT fields only** — copied from the Request line at Convert for lineage/traceability. They are **NOT used for execution, receiving, remaining, or shipment allocation** (those all key off `ordered_qty` / `completed_qty` / `shipped_qty` / `remaining_qty`). Runtime currently does **not** read them (PO Workspace / PO Remaining Overview never reference `requested_qty` / `approved_qty`). Columns are **retained** (do not remove without an explicit later decision).
- **`completed_qty` starts `0`** (received / production-completed qty; drives `partial_completed`/`completed`; `+= receive_qty` on each Receive). **`shipped_qty` starts `0`**. **`remaining_qty` = `completed_qty − shipped_qty`** = **available-to-ship** (clamp ≥ 0), **= `0` at creation** (NOT `ordered_qty` — no completed goods means nothing available to ship). **`unreceived_qty` = `ordered_qty − completed_qty`** is production-outstanding, **derived only in the Receive modal — never stored** (see `PURCHASE_ORDER_SPEC.md` §4A/§4C).
- **`line_amount` = `ordered_qty × unit_cost`.**
- **Dates:** **`expected_completion_date` ← `request_order_lines.expected_ready_date`**; **`inspection_date` ← `request_order_lines.inspection_date`**; **`expected_ship_date` ← `request_order_lines.expected_ship_date`**.
- **`factory_item_no` / `factory_item_name` / `supplier_warehouse_id`** copied from `request_order_lines`.
- Header **`total_sku` uses `COUNT(DISTINCT sku)`** over these lines (§7.4).

> **Snapshot ownership:** after creation the PO line **owns** these fields. It must **not** live-read `request_order_lines`; later Request edits never mutate an existing PO line (§8A / §14 / §H Snapshot Completeness). `request_order_line_id` / `request_order_id` are lineage only.

---

## 4. Request Order Source (Phase 1)

Phase 1 supports two sources:

1. **Manual Draft** — the user manually creates a Request Order Draft (`source = manual`). **Implemented.**
2. **From Shipment / Inventory shortage** — a placeholder button + spec only; **not wired to an algorithm** in Phase 1.

**Future `source` enum (reserved — no auto engine now):**
`inventory_shortage` · `factory_stock_shortage` · `shipment_allocation_shortage` · `approved_shipment_demand` · `manual` · `ai_recommendation`.

> When a future engine populates a draft from upstream demand, it writes `source` + `source_ref_type` + `source_ref_id` (header) and `related_entity_type` + `related_entity_id` (line) — **copy only, never a write-back to the upstream record.**

---

## 5. Request Order Status Flow

### 5.0 Official Request Order Lifecycle (finalized)

```
Draft ─▶ Saved ─▶ Submitted ─▶ Approved ─▶ Converted to PO ─▶ Completed
                                                                    
Cancelled  =  TERMINAL state
```

- **Draft → Saved** — `Save` persists edits without changing status (still `draft`; "Saved" is the persisted-Draft state, not a separate DB value). **Saved → Submitted** = `submit` (`draft → pending_approval`). **Submitted → Approved** = `approve`. **Approved → Converted to PO** = `convert` (creates the Purchase Order snapshot — `PURCHASE_ORDER_SPEC.md` §8A PO Snapshot Rule; sets `request_orders.request_status = converted_to_po` — canonical field; legacy `status` is never written). **Converted to PO → Completed** = `done` (`completed_at`/`completed_by`; leaves the default view, row never deleted).
- **Status-value mapping:** the canonical `request_status` DB values are `draft` / `pending_approval` / `approved` / `converted_to_po` / `cancelled`; "Saved", "Submitted", "Completed" are lifecycle stages over those values (Saved = persisted draft; Submitted = `pending_approval`; Completed = `converted_to_po`/`approved` with `completed_at` set).

**Cancelled = terminal-state rules (finalized — see §13.4):**
- Cancelled `request_order_lines` are **immutable**.
- Cancelled lines **cannot** return to `draft` / `submitted` / `approved`.
- **Submit must ignore cancelled lines** (never reactivated).
- **Convert to PO must exclude cancelled lines** (never copied into the PO snapshot).
- Cancelled rows are **never deleted** (soft state; kept for audit).
- **Restore**, if ever needed, must be a **future explicit, audited action** — never automatic.

```
draft ──submit──▶ pending_approval ──approve──▶ approved ──convert──▶ converted_to_po
  ▲                    │
  └──── reject ────────┘   (rejected_reason required; version +1 on resubmit)

draft / pending_approval ──cancel──▶ cancelled   (soft; row + lines preserved; TERMINAL)
```

- **`draft`**: `approved_qty` editable; supplier selectable/defaulted; unit cost from supplier price list; **Save** persists without submitting; **Submit** → `pending_approval`; **Cancel** → `cancelled` (soft hide, DB kept).
- **`pending_approval`**: read-only; **Approve** → `approved`; **Reject** → back to `draft` with `rejected_reason` (required); resubmit bumps `request_order_version` +1 (MVP reuses the same row).
- **`approved`**: shows **Create PO / Convert to PO**; **Done** sets `completed_at` / `completed_by` so the card leaves the default Approved view (DB row never deleted).

---

## 6. Purchase Order Status Flow

### 6.0 Official Purchase Order Lifecycle (finalized)

```
Draft ─▶ Issued / Sent PO ─▶ Supplier Confirmed ─▶ In Production
      ─▶ Partial Completed ─▶ Completed ─▶ Partial Shipped ─▶ Shipped ─▶ Closure

Cancelled  =  TERMINAL state
```

- **Draft** — a PO can be **saved** or **sent** (Save persists execution edits; Send issues it).
- **Issued / Sent PO** — becomes the **official supplier-facing commitment**.
- **Supplier Confirmed** — records the supplier's confirmation (sets `supplier_confirmed_ready_date`, §2 naming).
- **In Production** — tracks production execution.
- **Partial Completed / Completed** — driven by **`completed_qty`** via the **Receive flow** (`PURCHASE_ORDER_SPEC.md` §4A/§4B): each Receive does `completed_qty += receive_qty`, then `remaining_qty = MAX(completed_qty − shipped_qty, 0)`. **`unreceived_qty = MAX(ordered_qty − completed_qty, 0)`** is production-outstanding — **derived, not stored** — and drives the completion check (it is NOT `remaining_qty`). `Σ completed_qty` between 0 and `Σ ordered_qty` → `partial_completed` (stays In Production); **all lines `completed_qty ≥ ordered_qty` → `completed`** (+ `completed_at`/`completed_by` if available; PO leaves the active Workspace list). **Receive updates the PO only** (never the Request Order or a Shipment) and **never modifies `shipped_qty`**.
- **Partial Shipped / Shipped** — driven by **`shipped_qty`**.
- **Closure** — **auto** (all lines fully shipped: `shipped_qty ≥ ordered_qty`) or **manual** (required `closure_reason` + `closed_by`/`closed_at`), see §6.1.
- **Cancelled = terminal:** a cancelled PO **cannot be updated by the normal execution flow**; any future **restore must be explicit and audited** (never automatic). Row is never deleted.
- **Status-value mapping:** DB enum values below (`issued` = Issued/Sent PO; supplier confirmation is recorded on the PO record and the legacy `confirmed` state maps to "Supplier Confirmed").

**PO `order_status` enum (target — authoritative):**
`draft` · `issued` · `in_production` · `partial_completed` · `completed` · `partial_shipped` · `shipped` · `closure` · `cancelled`.

```
draft ──issue──▶ issued ──▶ in_production ──▶ partial_completed ──▶ completed
                                                                        │
                                                     ──▶ partial_shipped ──▶ shipped
                                                                        │
                                    (all lines shipped_qty ≥ ordered_qty) ▼
                                                                    closure
any (non-completed/closure) ──cancel──▶ cancelled
```

- **`partial_completed`** — some (not all) ordered qty produced (`Σ completed_qty` between 0 and `Σ ordered_qty`).
- **`partial_shipped`** — some (not all) completed qty shipped; **`shipped`** — all shipped.
- **`closure`** — the PO is closed (see §6.1). **DB enum uses `closure`; the UI display name is "Closure".**

> **Phase-1 runtime note:** the current `updatePurchaseOrderStatus` handler implements a **subset** (`draft → issued → confirmed → in_production → ready_to_ship → completed`, `cancel`). The enum above is the **target**; `partial_completed` / `partial_shipped` / `shipped` / `closure` and the legacy `confirmed` / `ready_to_ship` are reconciled toward this set as production/shipment wiring lands. UI status labels already display all target values. Shipment linking (`shipment_lines.purchase_order_line_id`) is future.

**Actions by state (Phase 1):** Draft → Save / Send-Issue / Cancel · Issued → Confirm / Reject-Cancel / update supplier info · Confirmed/In Production → update ready date / production status · Ready to Ship → link to Shipment Draft (future) · Completed → read-only.

### 6.1 Closure Rule

`closure` has **two** sources:

1. **Auto Closure** — when **every** PO line is **fully shipped** (`shipped_qty ≥ ordered_qty`), the system **may** auto-transition the PO `order_status → closure` (canonical field `order_status`; legacy `status` is read-fallback only, never written) (target behavior; not an auto-procurement algorithm — a simple completion check). *(Note: `remaining_qty = completed_qty − shipped_qty = 0` alone is NOT a closure signal — it is also true for a brand-new PO with nothing completed.)*
2. **Manual Closure** — a user closes / writes off a PO for a special reason. **`closure_reason` is required**; the system records `closed_by` and `closed_at`.

**Suggested DB columns on `purchase_orders`:** `closure_reason`, `closed_by`, `closed_at` (added to the header schema; auto-created by `13_procurement_handlers.gs`). **`completed_qty` is added to `purchase_order_lines`** (production-completed quantity; drives `partial_completed` / `completed` and, with `shipped_qty`, `available_to_ship = completed_qty − shipped_qty`).

---

## 7. Page Specs (Phase 1 UI)

### 7.1 Request Order Draft — **Decision Layer** (finalized)
Three sections: **Draft / Pending Approval / Approved**. **Card/expand structure matches the Weekly Shipping Plan card** (`.sp-card`; `.sp-card-details` shown via `.is-expanded`; styles scoped to `#request-order-draft-section` in `procurement.css`).

> **Request Order Draft = the decision layer. All ordering decisions (approve qty, company split, T1 vs T2+T3, schedule, cancel) are completed here.** Purchase Order Overview = the **execution layer** — it inherits the approved result and only handles supplier / factory / payment / delivery dates. **PO Overview does NOT re-decide split/merge** (paused until an explicit future design).

- **First-layer header:** **Status · Request No · Company (companies included, e.g. KM / ResUS / ResTW, from the line `company` column) · Factory (`warehouses.warehouse_name`; `warehouse_id` is the source of truth but is NOT shown unless no name exists; default Tier 1 = `WH-TW-CN-FACTORY-YOUXIN`) · Series · Total Qty · Total Ctn · Est. Amount · Created**. Right-side actions: **Expand/Collapse · Save · Submit · Cancel** (Draft); Approve/Reject (Pending); Convert to PO/Done (Approved).
- **Expanded detail = exactly THREE stacked blocks:**
  - **Block 1 — SKU In Total (READ-ONLY):** `SKU · KM · ResUS · ResTW · Requested · Approved · Carton` (company columns are the distinct companies present). Footer: **Total SKUs · Total Approved · Total Ctn**. **Computed live** = Σ of Block 2 (T1) + Block 3 (T2+T3). Removed columns (no longer shown): Current Stock, Following 3 Month FC, Avg. Sales / FC, Days of Supply.
  - **Block 2 — T1 Request:** upper table `SKU · KM · ResUS · ResTW · Requested · Approved · Carton` (one row per `(sku, bucket)` so bucket integrity is kept). **Approved editable**; when **Approved == Requested** the KM/ResUS/ResTW split is **locked** (= requested split); when **Approved ≠ Requested** the split becomes **editable and must sum to Approved** (validated on Save/Submit). Each company cell = one real `request_order_line` (`company` column). Lower editable schedule: **Inspection Date · Expected Ready Date · Expected Ship Date** (written to all T1 lines on Save). Top-right actions: **✕ (cancel tier)** and **+ Add Note**.
  - **Block 3 — T2 + T3 Request:** identical structure/rules; groups buckets T2 and T3 (rows tagged T2/T3 to preserve bucket).
- **✕ (cancel tier):** soft cancel — sets `request_order_lines.line_status = 'cancelled'` for the tier's lines (kept in DB, block hidden). If **no active line remains** on the request, `request_orders.request_status = 'cancelled'` + `cancelled_by/at`. Handler `cancelRequestOrderTier`. *(The per-source cancel/release **status lifecycle** — whether `request_order_line_sources` rows are stamped/released on cancel — = **B-8** (still open); the line/source grain itself is canonical, §3.9.)*
- **+ Add Note:** reveals a textarea; Save writes the note to the tier's `request_order_lines.note` (line-level note field).
- **Validation:** Save/Submit blocked **only** when a row's company split ≠ Approved. **A partial-carton `Approved Qty` MUST NOT block Save/Submit/Approval** (canonical §37 partial-carton override end-to-end): an explicit partial-carton override is allowed through Approval — it is **not** auto-reverted to Suggested and **not** carton-CEILING'd; the override fact + note are preserved and `carton_qty` is the exact `Approved Qty ÷ units_per_carton` (may be fractional). *(Missing `units_per_carton` still blocks the system Suggested calculation + Send per §12.13 — that is a different gate.)*
- **Removed from this page:** the **Factory / Payment** block — detailed payment/factory confirmation belongs to Purchase Order Overview. Only **Est. Amount** remains (first-layer header).
- **Layout:** the three blocks render **horizontally, side by side, equal height** (`.ro-decision-grid`, 3 equal columns; stacks to one column ≤1100px). Each block's table scrolls inside its own wrapper — no page horizontal overflow.
- **Company Allocation popup (read-only):** in **SKU In Total**, KM/ResUS/ResTW values are **clickable when > 0**. Click opens a compact popover **"Company Allocation Detail"** — fields **Company · SKU · Tier · Month · Country · Marketplace · Requested · Approved · Shortage · Note**. Source = **`request_order_line_sources`** (§3.8) filtered to this request's lines for the SKU+company; when empty it **falls back** to `request_order_lines` grouped by company and shows **"Site-level source pending."** No fake site rows are invented. Clicking `0` / `--` does nothing (or "No allocation detail."). The popup is **read-only**, closes on ✕ / overlay / Esc, and never stacks (a new open closes the previous). Matches the KM modal style (`.pc-modal`).

### 7.2 Purchase Order Workspace — **Execution Layer, Card architecture (PO v2 — finalized; runtime NOT built)**

> **Page-role rename (conceptual — files NOT renamed):** the page previously titled **Purchase Order Overview** is now the **Purchase Order Workspace** (active management / execution / **receive**); the page previously titled **Purchase Order List** is now the **Purchase Order Overview / PO Remaining Overview** (read-oriented remaining/completed view — §7.3). Runtime files keep their names (`purchase-order-overview.*`, `purchase-order-list.*`) until a later rename task. Full authoritative page spec: [`PURCHASE_ORDER_SPEC.md`](./PURCHASE_ORDER_SPEC.md) §1.1.

Purchase Order Workspace adopts the **same Card architecture as Request Order Draft** (`.sp-card`; `.sp-card-details` shown via `.is-expanded`; one expandable Card per Purchase Order). It is the **execution layer** — it inherits the approved request result and does **not** re-decide split/merge (§12.14).

**Factory tab + selectors (top) — linked:**
- **Top Tabs = Factory:** **CN侑鑫** · **TW勝一** (each tab scopes the cards to that factory via `purchase_orders.factory_id` → fallback `warehouse_id` → `warehouses.warehouse_name`).
- **Top-right selectors:** **Series** · **PO No** (`purchase_orders.po_no`).
- **Linked rule:** the factory tab and the Series / PO selectors are **dependent** — CN tab lists only CN Series / CN POs; TW tab lists only TW Series / TW POs. **Changing the factory tab re-derives (narrows) the selectors and resets any now-invalid selection to "All"** (never silently keep a selection absent from the new factory). Options always come from the current factory-scoped set, never a global list.

**Card groups (below the selector):** **Draft** · **In Production** · **Completed** (three lifecycle groups). **Completed cards do NOT stay in the Workspace active list by default** (they are viewed from the PO Overview / Remaining Overview — §7.3). Each Purchase Order = one expandable Card.

**Card Header (display):**
- **PO No** (**lighter / normal weight — not heavy-bold**) · **Order Date** (`order_date` = Send PO date; `created_at` fallback) · **Series** · **Supplier Expected Ready** (`supplier_expected_ready_date`).
- **Parent PO No is REMOVED from the header display** (lineage kept in DB via `parent_purchase_order_id`; not surfaced).
- **Right actions by group:** **Draft →** Expand · Save · Send PO · Cancel. **In Production →** Expand · **Update** · **Receive**. **Completed →** not in active list by default (read / Update when surfaced).

**Update** — records supplier / production execution changes and **appends timeline history instead of silently overwriting**:
- **Supplier delay** · **Inspection update** · **Ready date update** (`supplier_expected_ready_date` / `supplier_confirmed_ready_date`) · **Ship date update** · **Production Timeline edits** (`inspection_date` / `expected_completion_date` / `expected_ship_date`, only via Update with reason/note).
- Each Update **appends** a timeline-history entry (prior value preserved); the system never blind-overwrites a confirmed supplier date. (History persistence table = future; the append-not-overwrite rule is the finalized behavior.)

**Expanded Card — exactly FOUR blocks:**

- **Block 1 — SKU Summary (aggregated by SKU):** **one row per distinct SKU** (company/bucket lines merged). Columns **SKU · KM · ResUS · ResTW · Ordered · Completed · Carton** = per-SKU sums (`km_qty`/`resus_qty`/`restw_qty`/`ordered_qty`/`completed_qty`/`carton_qty`). Footer: **Total SKU · Total Qty · Total Carton**; **Total SKU = `COUNT(DISTINCT sku)`** (§7.4). **Ordered qty is READ-ONLY once the PO exists — a PO does not allow order-qty edits after creation** (quantity is a Decision-Layer decision).
- **Block 2 — Production Timeline:** **Inspection Date · Expected Completion Date · Expected Ship Date · Outer Carton Lot (future) · Nameplate Version (future).** Prefilled from the PO snapshot; **changeable only via Update with reason/note — no silent overwrite.**
- **Block 3 — Factory Notes:** future attachment area (placeholder).
- **Block 4 — Factory Payment:** **Supplier · Deposit · Balance · Total · Payment Status.**

**Receive flow (In Production cards):** **Receive** opens a modal scoped to one PO with line columns **SKU · Ordered Qty · Completed Qty (read-only/gray) · Unreceived Qty (`ordered_qty − completed_qty`) · Receive Qty (defaults to Unreceived Qty)**. Partial receive allowed; validation **`0 < receive_qty ≤ unreceived_qty`** (cannot exceed unreceived or re-receive completed). On confirm: `completed_qty += receive_qty`, then `remaining_qty = MAX(completed_qty − shipped_qty, 0)`. **Receive must NOT modify `shipped_qty`.** **All lines completed → `order_status = completed`** (+ `completed_at`/`completed_by` if available; PO leaves the active Workspace list). **Partial → `order_status = partial_completed`** (stays In Production). **Receive updates the PO ONLY — never the Request Order, never a Shipment;** Shipment allocation later *consumes* PO available-to-ship/completed (read-only). *(`Unreceived Qty` = production outstanding = `MAX(ordered_qty − completed_qty, 0)`, derived not stored; `remaining_qty` = available-to-ship = `MAX(completed_qty − shipped_qty, 0)` — the two are distinct.)* Full rules: `PURCHASE_ORDER_SPEC.md` §4A / §4B.

**Pagination:** **25 Cards per page**, identical behavior to Request Order Draft (filter/tab/linked-selectors apply before pagination; page resets to 1 on tab / selector / lifecycle-group / filter change).

### 7.3 Purchase Order Overview / PO Remaining Overview — **PO remaining / production-status table** (the page formerly "Purchase Order List")

> **Role (renamed — §7.2):** the **human-readable** view of **PO remaining quantity, production status, and future shipment-allocation readiness**; the primary place to view **completed / historical** POs. **Shipment allocation** will later read PO remaining/completed state here. Full authoritative page spec: [`PURCHASE_ORDER_SPEC.md`](./PURCHASE_ORDER_SPEC.md) §7. File stays `purchase-order-list.*` until a later rename task.

**Main table — SKU rows VISIBLE, no expand required.** The main dimension is the **PO**, but each PO's **SKU rows show directly underneath**. **Final columns (9):**

| # | Column | Source (per SKU within a PO) |
|---|---|---|
| 1 | **PO** | `purchase_orders.po_no` (link to Workspace / PO card) + status badge + Ready Date (`expected_completion_date`) underneath |
| 2 | **Supplier / Factory** | `supplier_name` · `factory_id` → fallback `warehouse_id` → `warehouses.warehouse_name` |
| 3 | **Category** | `sku_details.category` (join by sku) |
| 4 | **Series** | `purchase_order_lines.series` → fallback `sku_details.series` |
| 5 | **SKU** | `purchase_order_lines.sku` |
| 6 | **Completed** | `SUM(completed_qty)` per SKU |
| 7 | **Shipped** | `SUM(shipped_qty)` per SKU |
| 8 | **Remaining** | `SUM(remaining_qty)` per SKU = **available-to-ship** (fallback `completed_qty − shipped_qty`, clamp ≥ 0) |
| 9 | **Note** | `purchase_order_lines.note` (fallback `--`) |

**Rules:** **PO / Supplier·Factory / Category / Series are visually merged (row-spanned)** when repeated within a PO group; **the same SKU within the same PO is aggregated into one row** (qty columns summed). **Company split (KM / ResUS / ResTW) is NOT shown here** — it is meaningful at creation / Receive / allocation snapshot, but becomes misleading once shipments begin. `remaining = 0` → done (green); `remaining > 0` → active/pending.

**Filters:** **Date · Status · Supplier (dropdown) · Category (dropdown) · Series (dropdown) · SKU (free text) · Search / Reset.** Supplier / Category / Series options are **derived from current PO data**; filters apply **before** tabs + pagination; page resets to 1 on filter/tab change. **Tabs:** In Production (issued / supplier_confirmed / in_production / **partial_completed**) vs Ready / Completed (completed / partial_shipped / shipped / closure). **`draft` POs are NEVER shown here** — this is the PO Remaining / historical overview; Draft POs belong only to the **Purchase Order Workspace**. **Cancelled hidden by default** unless the Status filter explicitly selects `cancelled`. **Pagination = 25 PO groups/page** (not SKU rows). The **PO column is rendered ~25% narrower** than the earlier layout (compact identifier column).

**Order Gantt panel (collapsible, between filters and table):** X = timeline (from visible POs' dates); Y = PO No; one bar/marker per PO across `inspection_date` → `expected_completion_date` → `expected_ship_date`; hover tooltip = PO No · SKU list · per-SKU qty · `expected_completion_date` · `order_status`. Uses the **same filtered PO set** as the table. Default **collapsed / collapsible**. Runtime MVP = simple HTML/CSS timeline (no external library unless already present); ship collapsible panel + data assembly even if bar rendering stays MVP — never fake a completed Gantt.

### 7.4 Total SKU Rule (official — global)

**`Total SKU = COUNT(DISTINCT sku)`, NEVER `COUNT(rows)`.**

- Applies **globally**: Request Order, Purchase Order (Overview + List), Weekly Shipping Plan, Shipment Overview, and any DB field named **`total_sku`** (`request_orders.total_sku`, `purchase_orders.total_sku`, `shipments.total_sku`, …).
- Because one SKU may appear on multiple lines (per company / per bucket / per tier / per route), row count over-counts. Distinct-SKU counting is the single source of truth for every "Total SKU" figure, card footer, and stored `total_sku` column.
- `Total Qty` / `Total Carton` remain **summations** over the (non-cancelled) lines; only the **SKU count** is distinct.

---

## 8. Supplier / Price Source (Phase 1)

- Unit cost first version is sourced from the **existing supplier price list** (`supplier_price_list` / `pricing_list`) where available.
- **If price fields are insufficient, fall back to displaying `--`.** Do **not** refactor the supplier price list for this task.
- **Future:** PO `unit_cost` should be preferred from the supplier price list; when absent, manual input is allowed but must be flagged for **future audit**.

---

## 9. API / Apps Script Actions (API-ready)

**Apps Script module `13_procurement_handlers.gs`** (routed via `01_router.gs`):
`createRequestOrderDraft` · `updateRequestOrderLineQty` (now also writes `inspection_date` / `expected_ready_date` / `expected_ship_date` / `note` per line) · **`cancelRequestOrderTier`** (soft-cancel a tier's lines → `line_status='cancelled'`; auto-cancel the request header when no active line remains) · `updateRequestOrderStatus` · `createPurchaseOrderFromRequest` · `updatePurchaseOrderStatus` · `updatePurchaseOrderLine`.

**Core / master sync:** `02_core_sheet_db.gs` `filterRows_` + `03_master_data_handlers.gs` `validTabs` include `request_orders`, `request_order_lines`, `purchase_orders`, `purchase_order_lines`.

**API adapter (`operation-system-db-api.js`):**
- Getters: `getRequestOrders()` · `getRequestOrderLines()` · `getPurchaseOrders()` · `getPurchaseOrderLines()`.
- Writers: `createRequestOrderDraft(payload)` · `updateRequestOrderStatus(payload)` · `updateRequestOrderLineQty(payload)` · **`cancelRequestOrderTier(payload)`** · `createPurchaseOrderFromRequest(payload)` · `updatePurchaseOrderStatus(payload)` · `updatePurchaseOrderLine(payload)`.

**API-ready principles:**
- The frontend must **not** depend on the DOM as the final source of truth.
- `sessionStorage` is used only for demo fallback / working-draft recovery.
- Writes are **header-based** (write only known columns); missing procurement tables are **auto-ensured** with the documented header; other tables are never altered.

---

## 10. Non-Goals (Phase 1)

Factory Stock deduction · Factory Allocation Engine · Carrier Rate Engine · Export Center · Template Center · payment / invoice settlement · full auto-procurement algorithm · Role & Permission · supplier API · formal document (PDF) generation. These are future work (some designed in [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md)).

---

## 11. Open Items

- Order calculation formula + auto-populate from upstream shortage (future engine).
- Reconciliation/migration path from this flat schema to the three-layer `request_order_line_sources` design.
- Supplier price list field alignment (unit_cost / currency / supplier_sku) and audit for manual overrides.
- PO number generation format; production completion (`completed_qty`) flow; shipment linking (`related_shipment_id` / `purchase_order_line_id`).
- `partially_shipped` full implementation; multi-PO split (`request_order_po_links`).

---

## 12. Request Order Analysis Page (下單系統) — Mapping v1 / v2

> **Scope note.** This section documents the **下單系統 / Request Order analysis page** (`assets/html/pages/request-order.html` + `assets/js/pages/request-order.js`) — the SKU × Country × Marketplace **analysis / suggestion view** that *feeds* the Request Order Draft (§7.1). It is **NOT** the Request Order Draft itself. **Calculation is intentionally not implemented**: Remaining / Risk / Suggested Order are placeholders.
>
> **v2 adds:** pagination (§12.8), **real source mapping** for Basic(T3) / Site Stock / 3rd Party / Ongoing Orders / Lead Time (§12.4), a clean second-layer UI (§12.7), and the Site Confirmation + Series-aggregation flow (§12.9 / §12.10). Lead Time source `supplier_price_list` now has a normalizer + `getSupplierPriceList()` getter (returns `[]` when the tab is absent).

### 12.1 Data source principle
- Rows are built from **normalized DB data**, never from the Inventory Replenishment page DOM.
- Source priority: **live DB (`getDataSourceMode() === 'google-sheet'`) → Demo Data → empty**.
- `_buildRequestOrderRowsFromDb()` assembles rows; the Inventory Replenishment / FC Summary DOM globals (`window.fcRegularData`, `window.factoryStockData`, …) are **not** a dependency of the DB path.

### 12.2 Filters (Part 1)
Filter bar = **Country · Marketplace · Risk · SKU · Search**. (Date and Category are **not** filters — Category is a tab; Date gating was removed.)

- **Country / Marketplace use OR semantics** (`_applyRequestOrderFilters`), never AND:
  - Country = All **and** Marketplace = All → show all.
  - Country selected, Marketplace = All → rows matching country.
  - Country = All, Marketplace selected → rows matching marketplace.
  - **Both selected → rows matching country OR marketplace.**
- **SKU** = keyword contains-match. **Search** button applies the SKU keyword.
- **Risk** = placeholder filter (fixed High/Medium/Low options); effectively a no-op until the risk engine exists.

### 12.3 Category tabs (Part 2)
- Main tabs are **Category-based**, sourced from **`sku_details.category`** (distinct values present in the data), with **All** first.
- Rows are filtered by the active Category tab. **Series is not used for tabs in v1.**

### 12.4 Main table mapping (Part 3)
Row identity = **SKU + Country + Marketplace** (`marketplace_skus`).

| Column | v1 source | Status |
|---|---|---|
| SKU | `marketplace_skus.sku` | **Real** |
| Country | `marketplace_skus.country` | **Real** |
| Marketplace | `marketplace_skus.marketplace` | **Real** |
| Category (tab) | `sku_details.category` (join by sku) | **Real** |
| Series | `sku_details.series` (join by sku) | **Real** |
| Risk | future risk/calculation engine | **Placeholder** → `--` |
| Basic (T3) | Σ `fc_regular_forecast` **next 3 months** (by sku+country+marketplace, month columns per year) | **Connected (v2)** — `--` if no FC row |
| Special Events | `fc_special_events` next 3 months (shown in the **second layer**, not the main table in v2) | **Placeholder** in main table → `--` |
| Site Stock | latest `amazon_inventory_snapshot` = `available_qty + fc_transfer_qty + fc_processing_qty` (same normalized source as Inventory Replenishment Current Stock; **never the DOM**) | **Connected (v2)** — `--` if no snapshot |
| 3rd Party | Σ `overseas_inventory_snapshot.available_stock` across same-country **non-factory** warehouses (same source as Inventory 3rd Party) | **Connected (v2)** — `--` if no snapshot |
| Factory Stock | **Σ `factory_stock.current_stock` for the SKU across factory warehouses** | **Real** |
| Ongoing Orders | Σ open-PO `remaining_qty` (fallback `ordered − max(shipped, completed)`) over `purchase_order_lines` ⋈ `purchase_orders.order_status ∈ {issued, in_production, partial_completed, partial_shipped, ready_to_ship, confirmed}` (canonical `order_status`; legacy `status` read-fallback only) (per SKU) | **Connected (v2, best-effort)** — `--` if no open PO |
| Remaining | calculation engine | **Placeholder** → `--` |
| Lead Time | `supplier_price_list.lead_time_days` — active row (`is_active ∈ {active,true,TRUE,yes,1}`), latest `effective_from` | **Connected (v2)** — `--` if table/getter absent or no active row |
| Suggested Order | calculation engine | **Placeholder** → `--` |

> Placeholder columns render `--`. No Remaining / Risk / Suggested Order **formula** is implemented. "Connected (v2)" columns read the normalized DB source and fall back to `--` when the source table is missing (never fabricated).
>
> **Ongoing Orders caveat:** PO lines carry no country/marketplace, so the open-PO total is **per-SKU** and is repeated across a SKU's country/marketplace rows (informational; do not sum across rows). **Site Stock ≠ 3rd Party** are always separate (see §12.5).

### 12.5 Site Stock / 3rd Party Stock rule (Part 4)
**Do NOT merge Site Stock and 3rd Party Stock — always two separate columns.**

- **Platform-warehouse replenishment model:** Site Stock = platform warehouse stock; 3rd Party = 3PL / overseas warehouse stock (if applicable).
- **Self-fulfilled / overseas-warehouse model:** Site Stock may be **0** (stock is not in the platform warehouse); **3rd Party Stock represents the available overseas warehouse stock** (often the main available stock).
- **Reason:** keeping both columns visible avoids hiding *where the inventory actually sits*. Merging them would misrepresent availability for self-fulfilled SKUs.

### 12.6 Supplier / Lead Time source (Part 5)
- **v1 lead time / cost source = `supplier_price_list`** (`supplier_price_list.lead_time_days`). Use the **active** supplier price row for the SKU; if multiple active rows exist, use the primary/latest-effective row, or show `--` until a supplier-selection rule is defined. *(No normalized getter for `supplier_price_list` exists yet, so Lead Time is currently a documented placeholder.)*
- **Mid-term — add a `suppliers` master table** (vendor master layer; **spec only, not implemented in this task**):

  | Column | Note |
  |---|---|
  | `supplier_id` | PK |
  | `supplier_name` | |
  | `supplier_type` | e.g. factory / trading / 3PL |
  | `contact_name` | |
  | `contact_email` | |
  | `contact_phone` | |
  | `country` | |
  | `city` | |
  | `payment_term_id` | FK → payment terms (future) |
  | `is_active` | |
  | `created_at` | |
  | `updated_at` | |
  | `note` | |

  - `supplier_price_list.supplier_warehouse_id` / `supplier_name_snapshot` remain the **price-detail layer**; **`suppliers` is the master vendor layer**. `supplier_price_list.supplier_id` → `suppliers.supplier_id` once the master exists.

### 12.7 Second-layer UI (v2 — Part 9)
Replaced the mock-only panel with a **clean v1 structure** that renders for both DB and demo rows (bug-guarded; no crash on missing fields). **Site Stock / 3rd Party are NOT duplicated here** (they live in the main table).

**Left side (under SKU):** two buttons —
- **Edit Target %** → modal loading the current `fc_target_rules` target for SKU+country+marketplace. **Read-only in v1** (future write target `fc_target_rules`; no save handler yet → notice shown).
- **FC Update** → modal loading the current `fc_regular_forecast` (next 3 months) for SKU+country+marketplace. **Read-only in v1** (future write target `fc_regular_forecast`; no save handler yet → notice shown).

**Three-column visual grouping (v2.2 layout — a true 3-column × 2-row grid; every block is its OWN card):**

Layout = CSS grid `.ro-sku-expand-grid--v5`, columns **A 34% · B 24% · C 42%**, two rows. Each of the six blocks is an **independent card** with visible spacing — Factory Stock is **not** merged with Factory Orders, and Recommendation Summary is **not** merged with Order Allocation. Because the cards are direct grid children, each grid **row auto-stretches to equal height**: the **top row** (Past Achievement / Factory Stock / Recommendation Summary) aligns, and the **bottom row** (Future Basic/Special FC / Factory Orders / Order Allocation) aligns. DOM order is column-major, so on ≤900px the grid collapses to one column and stacks each column's cards together (no horizontal overflow).

**Column A (top → bottom)**
1. **Past Achievement Rate (Past 3 Months)** — Month · Achievement Rate · FC Qty · Actual Qty · Sessions · USP. *FC Qty* is read from `fc_regular_forecast`; Achievement Rate / Actual / Sessions / USP are **not sourced yet → `--`** (need sales snapshots).
2. **Future Basic / Special FC** — *Basic FC* (Month · FC Qty · **Target %**, from `fc_regular_forecast` next 3 months; Target % from `fc_target_rules` → % else 100% placeholder) + *Upcoming Events* (Month · FC Qty, from `fc_special_events` next 3 months, best-effort → `--`).

**Column B (top → bottom)**
3. **Factory Stock** — **Factory · Current Stock · Reserved · Available** (no Warehouse column). **Factory display = `warehouses.warehouse_name`** (join `factory_stock.warehouse_id → warehouses.warehouse_id`); fallback `warehouse_id`, then `--`. Available = `current_stock − reserved_stock` only when reserved is present, else `--`.
4. **Factory Orders (Future 2 Months)** — Month · Qty · Expected Delivery Date (no reliable per-month source yet → `--`).

**Column C — Decision block (top → bottom)**
5. **Recommendation Summary** — Month · Recommended Qty · Reason (future 4 months). **Structure only — no formula.**
6. **Order Allocation** — **Month · Bucket** · Suggested · **Order Qty (editable)** · Carton · Note. Rows **T1 / T2 / T3** using the canonical **non-overlapping** tier definition (owner `SUPPLY_PLANNING_CALCULATION_RULES.md` §27): **T1 = current-month remaining period + Month+1**, **T2 = Month+2**, **T3 = Month+3** (T4 = Month+4 is visibility-only, never an Order Allocation row). Tiers do **not** overlap — Month+1 is counted only in T1, never re-added to T2. **Display order is Month → Bucket** (stored data keys unchanged). Order Qty is held in local state and persisted on **Send Request** (`request_order_allocation_drafts` / `_lines`, §3.7).

> **Recommendation Summary and Order Allocation belong to Column C (the Decision block)** — they are **NOT** placed under the Factory section. Factory Stock + Factory Orders occupy Column B only.

**Row identity:** the second layer expands by a **composite row key** `sku|company|country|marketplace` (not SKU alone), so two rows sharing a SKU on different sites (e.g. `CO1100-R / US / Amazon` vs `CO1100-R / CA / Amazon`) expand and collapse independently.

### 12.8 Top layout — filter row + action bar (v2 — Parts 1 & 2)
- **Filter row (left→right):** Country · Marketplace · Risk · **Show** · SKU · **Search**. `Show` sits **between Risk and SKU**; options **All / Confirmed / Pending / All Request** (Confirmed/Pending filter rows by their site-confirmation state; All / All Request show everything — no calculation).
- **Top action area:** **Confirm Site · All Request (select) · Send Request** live in a dedicated action bar **above the filter card** — **NOT** in the Category tabs row. The Category tabs row holds category tabs only.
- **Consistent controls:** Search, Confirm Site, All Request, Send Request share one height (`--filter-height`), border-radius (`--filter-border-radius`), font-size (`--filter-font-size`) and vertical alignment.

### 12.9 Pagination (v2 — Part 1 prior)
- Main table renders **max 25 rows per page** (`pageSize = 25`); never renders all rows at once.
- Controls: **‹ Previous / Page X / N / Next ›** + "Showing a–b of N rows".
- Filtering + Category tab apply **before** pagination; **page resets to 1** on Search / filter change / category-tab change / show-mode change.

### 12.10 Site Confirmation flow + Send Request gate (v2 — Parts 2 & 3)
Problem: if every site owner sends their own Request, the same SKU/Series gets split into many orders.
Flow: (1) each site owner views their own country/marketplace rows → (2) **Confirm Site** (opens a modal) marks that scope confirmed for the chosen planning month(s) → (3) system records the confirmations → (4) procurement can Send Request **only after all required sites in scope are confirmed** → (5) Send Request aggregates **by Series** → (6) the Request Order Draft expands to show each company/site/country/marketplace detail. **Confirm Site ≠ Send Request.**
- **Confirm Site modal fields:** **Planning Bucket(s) — T1 / T2 / T3, each shown with its month (multi-select)** · **Company (readonly, locked)** · **Country (readonly, locked)** · **Marketplace (selectable)** · **Series (All or specific)** · **Confirm All (checkbox)** · Status (fixed `confirmed`, hidden) · Note (optional). Company/Country prefill from the current data/filter scope and cannot be edited; Marketplace prefills from the filter when unambiguous. Buckets default to all three (checked). **Buttons: Save / Cancel only** (no Close). Save writes **one confirmation record per (scope × bucket)** and marks rows confirmed (Show = Confirmed / Pending reflects it). **Confirm All** applies to **every visible/eligible site scope** in the filtered view (one record per distinct company/country/marketplace[/series] × bucket).
- **Send Request gate (bucket-aware):** every distinct **site scope (country / marketplace / series)** in the current filtered view must be confirmed **for every requested bucket** — **Send T1** requires all scopes confirmed for T1, **Send T2/T3** likewise, **All Request** requires **T1 AND T2 AND T3**. If any scope/bucket is pending, Send is blocked with **"Please confirm all site scopes before sending this request."** (pending scopes listed).
- **Persistence (Fix 1 — implemented):** Confirm Site now **writes to `request_order_site_confirmations`** via `upsertRequestOrderSiteConfirmations` (Apps Script `16_request_site_confirmation_handlers.gs`, router action, `getRequestOrderSiteConfirmations` getter + normalizer). Confirmed state is **rehydrated from the DB on every render**, so it **persists across reloads**. Upsert key = `planning_cycle + company + country + marketplace + series + bucket` (same scope+bucket → update, never duplicate). **Demo mode = in-memory only.** Confirm Site records **approval state only** — it does **NOT** create `request_orders` and does **NOT** reserve / deduct stock (guardrail).

### 12.11 Request Order grouping principle (v2 — Part 8 prior)
- The analysis page shows **site-level rows** (SKU × country × marketplace).
- Site confirmation captures each site's need; **Send Request aggregates by Series** (not one order per site).
- The **Request Order Draft** then expands per Series → SKU / company / country / marketplace, avoiding the same SKU being split into too many orders.
- **Not implemented in this task** (aggregation is the future Send-Request/RO-Draft engine — guardrail); documented as the target.

### 12.12 Non-Goals (this task)
Procurement calculation engine · Remaining / Risk / Suggested Order formula · AI · real Request Order Draft aggregation / Send-Request engine · `suppliers` table · new DB tables / Apps Script handlers (spec note only) · PO status-flow change · FC Summary change · Shipment / Weekly Shipping Plan change · reliance on the Inventory Replenishment DOM.

### 12.13 T1 / T2 / T3 bucket rule + Send Request data integrity (FINALIZED)

**Finalized layer rule:**
- **Request Layer preserves T1 / T2 / T3.** Every `request_order_line` carries `request_bucket` (+ `request_month`); buckets are **never merged at the Request stage**.
- **PO Layer may merge T1 / T2 / T3 later** (T1 urgent PO separate; T2 + T3 merged normal PO; or custom grouping by supplier / factory / SKU / series) — decided in **Purchase Order Overview** (future Phase 3).
- **T1/T2/T3 are demand buckets, not direct PO-grouping rules.** Request↔PO traceability is preserved later via **`request_order_po_links`** (future). Send Request does **not** force three PO records.
- **T4 = Month+4 visibility only** (owner `SUPPLY_PLANNING_CALCULATION_RULES.md` §27). T4 is **display-only**: it does **not** enter current allocation, does **not** create a Request Order payload / `request_order_line`, creates **no** order commitment, and does **not** affect the T1–T3 send quantities this cycle. No `request_bucket = T4` is ever written.

**Send Request data integrity (下單系統):**
1. Send Request first creates/updates `request_order_allocation_drafts` + `_lines` (planning scratchpad), then creates the official `request_orders` + `request_order_lines`. **Draft suggestion data is never treated as official until Send Request runs.**

> **Monthly Order Recommendation cadence (canonical).** The order recommendation cadence is **monthly** (one recommendation per planning cycle), gated on source-data readiness — no partial/stale/empty-success Draft — and produces `request_order_allocation_drafts` → `_lines`. **The exact execution day, time, trigger window, and source-readiness schedule belong to Runtime scheduling configuration (`SYSTEM_RUNTIME_ARCHITECTURE.md` §7A); this spec does not define or invent an exact clock schedule.** Its scheduler entry point **requires Runtime verification — not claimed implemented; Runtime scheduler remains NOT IMPLEMENTED / PENDING VERIFICATION.** `recommended_qty` (system snapshot) **initializes** `order_qty` (user-editable); **daily reports never recalculate or overwrite the Draft or the user quantity.** **Do not create a new order recommendation every day; the same-month retry is idempotent (per planning cycle `YYYY-MM` + Scope — retries never duplicate/reset), and a new month creates a new cycle without overwriting a prior month's Draft.**
2. **Carton rule (v4.1 — owner `SUPPLY_PLANNING_CALCULATION_RULES.md` §14 / §31):**
   - **Suggested Order Qty** is always a full-carton multiple: `CEILING(Net Order Need ÷ units_per_carton) × units_per_carton` — **CEILING, never FLOOR**. `units_per_carton` comes **only** from the canonical SKU master.
   - **User Order Qty is independent.** When a valid `units_per_carton` exists, the user **MAY enter an explicit partial-carton `order_qty`**; a partial-carton override **does NOT block Send** and **does NOT rewrite** Suggested Order Qty. Send is **not** blocked merely because `order_qty` is not a full-carton multiple.
   - **Missing `units_per_carton`** blocks the **Suggested calculation and Send** (no silent default of 1, 12, or any value); see §14 / §34.
   - The payload preserves **Suggested Order Qty** (`recommended_qty`), **User Order Qty** (`order_qty`), the **partial-carton override fact**, and the **override note** using the existing column naming — **no new DB column**.
3. **Site-confirmation gate (bucket-aware):** Send T1/T2/T3 requires confirmation for that bucket; **All Request** requires T1 ∧ T2 ∧ T3 (Confirm All treats all visible scopes as confirmed) — see §12.10.
4. Each request line keeps `request_bucket` = `T1/T2/T3`; allocation-draft lines carry snapshots (`factory_available_qty_snapshot`, `destination_stock_snapshot`, `third_party_available_qty_snapshot`, `regular_demand_snapshot`, `target_pct_snapshot`), and request lines carry `forecast_qty` / `current_stock` from the same sources.

**Phasing (Part E):** Phase 1 (this task) = keep the current page/selector but preserve bucket + data integrity on every line. Phase 2 = T1/T2/T3 tabs (Draft / Pending Approval / Approved inside each). Phase 3 = Purchase Order Overview grouping assistant. UI tabs are **not** added in Phase 1; the data model already preserves bucket.

### 12.15 Order State Separation + Emergency Order + Partial-Carton End-to-End (CANONICAL v4.1 — owner §36/§37)

**Live Planning Signal vs Persisted Suggestion vs User Decision** (owner `SUPPLY_PLANNING_CALCULATION_RULES.md` §36):
- **Live** — the Request Order analysis view's T1–T4 Demand / Shortage is a **continuously-recalculated planning signal** (risk / review / emergency-order entry). Re-displaying it **never** overwrites a persisted Draft's `recommended_qty`, the user's `order_qty`, or `carton_qty`; it never auto-reverts a user edit; **Engine A shortage is never written straight to an order** (`Forecast Shortage ≠ Order Qty`).
- **Persisted System Suggestion** — a formal planning run (Engine A → Engine B reallocation → `Net Order Need` → T1–T3 Order carton CEILING) writes `request_order_allocation_drafts` (parent at the existing scope grain — company + country + marketplace + sku + category + series) → `request_order_allocation_draft_lines` (bucket / allocation child line; SKU is inherited from the parent via `request_allocation_draft_id`, the line row carries no `sku` column). **`recommended_qty`** = persisted snapshot of the **system** Suggested Order Qty; **`order_qty`** = the quantity the user will submit; **`carton_qty`** = from the actual `order_qty ÷ units_per_carton`. Cadence is **monthly** (§12.13 note), cycle key `YYYY-MM`; a single monthly run may create **many** scope/SKU parent records; a new month = a new cycle draft — **never overwrites** a prior month's Draft/Line.
- **User Decision** — user edit updates **`order_qty`** and recomputes **`carton_qty`**; **`recommended_qty` is preserved** (a user input never overwrites it). Uses existing fields only — **no new DB column**.

**Emergency Manual Order** (owner §36.4): a planner may trigger an order any time using the **same Engine A → Engine B → reallocation → `Net Order Need`** path (no second formula) → creates a **new** `request_order_allocation_drafts` + `_lines` with the current Suggested written as `recommended_qty`; the user may edit `order_qty` / `carton_qty` without overwriting `recommended_qty`. Emergency must not: use raw Forecast Shortage as Order Qty, skip reallocation, overwrite the month's existing recommendation or any other Draft, or write a **T4** line. Provenance (source / trigger / note) uses **existing fields** — no new schema.

**Partial-Carton Override end-to-end** (owner §37): an explicit partial-carton `order_qty` / `Approved Qty` is allowed through **Send (§12.13) → Approval (§7.1 / line-validation) → Purchase Order** and is **never re-rounded to a full carton**. Conversion to PO preserves the **exact approved quantity**, its exact `carton_qty`, the `units_per_carton` snapshot, the partial-carton override fact/note, and traceability to the system recommendation. **Request Order → PO mapping must NOT re-CEILING the quantity.** Missing `units_per_carton` still blocks the system Suggested + Send (§12.13). Uses existing fields/note contract — **no new DB column**.

### 12.14 Decision layer vs Execution layer (finalized) + company-split storage note

- **Request Order Draft = Decision Layer.** All ordering decisions finish here: **Approved qty, KM/ResUS/ResTW company split, T1 vs T2+T3, schedule dates, tier cancel**. See §7.1.
- **Purchase Order Overview = Execution Layer.** It **inherits the approved request result** and handles execution info only (supplier / factory / payment / delivery dates). **PO Overview split/merge logic is PAUSED** — it must not re-decide T1/T2/T3 split/merge until an explicit future design. Request↔PO traceability → `request_order_po_links` (future).
- **Factory display** = `warehouses.warehouse_name`; **`warehouse_id` remains the source of truth** (shown only when no name exists; default Tier 1 = `WH-TW-CN-FACTORY-YOUXIN`).
- **Company-split storage:** the KM/ResUS/ResTW split is recorded **two ways** — (1) denormalized per-line `km_qty` / `resus_qty` / `restw_qty` on `request_order_lines` (matched company = approved, others 0), and (2) the **`request_order_line_sources`** rows (company/site/month source breakdown). **Manual Allocation Mode (finalized — UI / user-decision workflow only):** the approved user workflow — re-allocating Approved to a company, with each company's `approved_qty` a direct user decision and **no ratio allocation** — is finalized. **DB grain (RESOLVED under B-5, §3.9):** `request_order_line_sources` is the **demand-provenance** breakdown for company/site/month; each `request_order_line` is keyed `(request_order_id, company, sku, request_bucket)` (one company) and owns **1..N** sources (the prior "one company = one source" is the degenerate single-marketplace case); `approved_qty` is the single authority. Full rule + boundary: **§3.9** and **§13 Allocation Persistence Rules**.

### 3.5 `request_order_site_confirmations` (IMPLEMENTED — Fix 1)

Records per-site confirmation before Series aggregation (site-level review → confirm → Send Request). **DB-backed:** handler `16_request_site_confirmation_handlers.gs` (`upsertRequestOrderSiteConfirmations`), router action, `getRequestOrderSiteConfirmations` getter + `normalizeRequestOrderSiteConfirmationRecord`. Table auto-creates with the header below (missing-header safe). Records **approval only** — Confirm Site never creates `request_orders` and never moves stock.

| Column | Note |
|---|---|
| `site_confirmation_id` | PK (`SC-XXXXXXXXXX`) |
| `planning_cycle` | **canonical monthly cycle key = `YYYY-MM`** (e.g. `2026-07`); a year-only value is not a valid monthly cycle. *(If the current Runtime persists year-only, that is a recorded Runtime Gap — canonical `YYYY-MM`, verify existing persistence, PENDING IMPLEMENTATION; no DB column/handler changed this round.)* |
| `company` | (locked to the scope's company; `All` = every company) |
| `country` | (`All` = every country) |
| `marketplace` | (`All` = every marketplace) |
| `series` | (`All` = every series) |
| `bucket` | **`T1` / `T2` / `T3`** — the planning bucket confirmed (non-overlapping: T1 = current-month remaining + Month+1, T2 = Month+2, T3 = Month+3; owner §27). T4 is visibility-only and never confirmed/sent. |
| `status` | enum: **`pending` / `confirmed` / `cancelled`** |
| `confirmed_by` | actor (placeholder identity until Role & Permission) |
| `confirmed_at` | |
| `note` | free text |
| `created_at` | |
| `updated_at` | |

**Rules:**
- **One `(scope × bucket)` = one confirmation record.** Confirming T1+T2+T3 for a scope creates **three records**; **Confirm All** multiplies across every visible scope.
- **Upsert key** = `planning_cycle + company + country + marketplace + series + bucket` — re-confirming the same scope+bucket **updates in place** (no duplicates).
- **Confirm Site ≠ Send Request.** Each site owner **Confirms** their scope/buckets; procurement verifies all required site scopes are `confirmed` for the requested bucket(s), then **Send Request** aggregates by Series into a Request Order Draft.
- **Send Request gate (bucket-aware):** Send T1/T2/T3 is blocked until every required site scope is `confirmed` for that bucket; **All Request** requires T1 AND T2 AND T3. A record with an empty `bucket` (legacy) covers all buckets.

---

## 3.6 `shipping_allocation_drafts` / `shipping_allocation_draft_lines` — FINALIZED canonical Draft model (spec + DB design only)

**Purpose:** persist the **Inventory Replenishment second-layer** recommendation cycle + its editable Execution Plan. The **system recommendation snapshot** and the **user execution value** are **separate columns on the same Draft Line** — there is **NO separate `shipping_allocation_suggestions` table** (do not create one). **This table does NOT reserve or deduct stock; a Draft is NOT Qualified Incoming.** Only **Submit Plan** creates formal `shipping_plans` / `shipping_plan_lines`. Spec + DB design only — **not implemented in code.**

> **PHASE-1 LANDING (reconciled Round C2-D1R, 2026-08-05):** The **approved live DB schema is the Phase-1 authority** — `shipping_allocation_drafts` = **30 columns** with **header-level** route context (`recommended_source_warehouse_id` / `recommended_destination_warehouse_id` / code snapshots / `recommendation_group_no` / `recommended_shipping_method` / `recommended_last_mile_delivery`), and `shipping_allocation_draft_lines` = **28 columns** (SKU + qty; **no** `selected_*`). Where this §3.6 model differs (recommended route fields shown on the line, or a `draft_version` uniqueness key), it is **superseded for Phase-1** by the reconciled contract. The Active-Draft/Submit key is **K3** (`… + source_page`, never `draft_version`; no `recommendation_group_no`). Owner: `docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md`.

### `shipping_allocation_drafts` (header — CANONICAL)

| Column | Note |
|---|---|
| `allocation_draft_id` | PK |
| `planning_cycle` | planning cycle key (e.g. ISO `YYYY-Www` for weekly; the cycle the Draft belongs to) |
| `source_page` | origin (e.g. `inventory_replenishment`) |
| `company` · `country` · `marketplace` | scope grain |
| `status` | `draft` / `site_confirmed` / `submitted` / `cancelled` |
| `generation_type` | **`scheduled` / `manual_refresh` / `user_created`** (replaces the old `source_type` generator indicator) |
| `calculation_run_id` | the calculation run that produced this Draft (idempotency / audit) |
| `formula_version` | formula version used for the recommendation (audit) |
| `calculated_at` | when the recommendation was computed |
| `source_data_as_of` | as-of timestamp of the analysis inputs used |
| `draft_version` | version counter (only if versioning is required; see uniqueness below) |
| `created_by` · `created_at` · `updated_by` · `updated_at` | audit |
| `submitted_by` · `submitted_at` | Submit-Plan handoff |
| `cancelled_by` · `cancelled_at` · `cancel_reason` | soft cancel |
| `note` | free note |

- **REMOVED from the header (canonical):** `sku` (grain moved to lines — a Draft covers many SKUs), `target_window` (per-line, not header), `source_type` (replaced by `generation_type`).
- **Cycle/scope uniqueness:** `planning_cycle + company + country + marketplace + draft_version` is unique. **A retry of the same `calculation_run_id` must be idempotent** (resume/upsert the existing Draft, never duplicate). *(PHASE-1 C2-D1: `draft_version` here is version/lineage — the Active-Draft/Submit **natural key is K3** without `draft_version`; see `ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md`.)*

### `shipping_allocation_draft_lines` (CANONICAL)

**Identity:** `allocation_draft_line_id` (PK) · `allocation_draft_id` (FK) · `sku` · `site_sku`.
**Window:** `window_code` · `window_start_date` · `window_end_date` · `required_by_date`.
**Recommendation input snapshots:** `regular_demand_snapshot` · `special_event_demand_snapshot` · `destination_stock_snapshot` · `qualified_incoming_snapshot` · `approved_supply_snapshot` · `calculated_gap_qty`.
**System recommendation snapshot — source/destination + sequence (immutable per generation):** `recommended_source_warehouse_id` · `recommended_destination_warehouse_id` · `recommended_source_warehouse_code_snapshot` · `recommended_destination_warehouse_code_snapshot` · `source_initial_available_qty_snapshot` · `source_available_before_allocation_snapshot` · `allocation_sequence`. *(`recommended_source_warehouse_id` renamed from `source_warehouse_id`; `source_initial_available_qty_snapshot` renamed from `source_available_qty_snapshot`; legacy names are read-only aliases.)*
**System recommendation snapshot — route / carrier / cost (immutable per generation):** `recommended_route_rule_id` · `recommended_rate_card_id` · `recommended_lead_time_id` · `recommended_carrier_id` · `recommended_shipping_method` · `recommended_last_mile_delivery` · `recommended_expected_arrival` · `recommended_estimated_cost` · `recommendation_reason` · `recommendation_flags` · `recommended_qty`.
**User Execution Plan (editable):** `planned_qty` · `selected_source_warehouse_id` · `selected_destination_warehouse_id` · `selected_source_warehouse_code_snapshot` · `selected_destination_warehouse_code_snapshot` · `selected_rate_card_id` · `selected_lead_time_id` · `selected_carrier_id` · `selected_shipping_method` · `selected_last_mile_delivery` · `expected_arrival` · `units_per_carton` · `route_no` · `override_reason`. *(`selected_source_warehouse_id` / `selected_destination_warehouse_id` rename the old `ship_from` / `destination`; legacy names are read-only aliases.)*
**Status / Audit:** `line_status` · `note` · `created_at` · `updated_at`.

**Canonical quantity names:**
- **`recommended_qty`** = the immutable **system suggestion snapshot** for that Draft generation. *(Legacy read/migration alias: `recommand_shipment_draft_qty` — the misspelling is a LEGACY ALIAS only, never the new canonical column name.)*
- **`planned_qty`** = the user-editable Execution Plan quantity. *(Legacy read/migration alias: `shipment_draft_qty` / `qty`.)*
- **On initial generation:** `planned_qty = recommended_qty`.
- After the user edits `planned_qty`: the weekly/daily refresh **must never overwrite it**; live analysis **must never silently change `recommended_qty`** in that Draft; a deliberate **Regenerate** action creates/updates per the versioning rule and preserves auditability (§8/§9 of the round instruction).

**Submit Plan reads ONLY:** `planned_qty` + the selected execution route fields (`selected_source_warehouse_id` / `selected_destination_warehouse_id` / `selected_*` / `expected_arrival`).
**Recommendation Summary reads ONLY:** `calculated_gap_qty` + `recommended_qty` + the `recommended_*` route fields + `recommendation_reason`.

**MUST NOT store** (derive at Runtime): `uncovered_qty` · `coverage_status` · `window_label` (use `window_code`) · route display string · source display name. **`required_by_date` IS a DB/calc field** (kept on the line) even though hidden from the compact Recommendation Summary table.

**Status enum:** `draft` / `site_confirmed` / `submitted` / `cancelled`. **Spec + DB design only — not implemented in code.**

## 3.7 `request_order_allocation_drafts` / `request_order_allocation_draft_lines` (draft layer — implemented)

**Purpose:** persist the **Request Order page second-layer** Order Allocation (T1/T2/T3 editable draft) **before Send Request**, so user edits survive a reload and become the **source for Request Order Draft creation**. **No stock movement / reservation.**

**Buckets (canonical non-overlapping, owner `SUPPLY_PLANNING_CALCULATION_RULES.md` §27):** **T1 = current-month remaining period + Month+1 · T2 = Month+2 · T3 = Month+3.** Month+1 is counted only in T1 (never re-added to T2). **T4 = Month+4 is visibility-only and is never a draft-line order commitment / never written as `request_bucket = T4`.** Each bucket can be pushed independently. **No calculation formula in this task** (Suggested/Recommended come from Engine B — owner §12/§14/§31).

**`request_order_allocation_drafts` (header):**

| Column | Note |
|---|---|
| `request_allocation_draft_id` | PK |
| `planning_cycle` | **canonical monthly cycle key = `YYYY-MM`** (e.g. `2026-07`); a year-only value is not a valid monthly cycle. *(If the current Runtime persists year-only, that is a recorded Runtime Gap — Canonical: `YYYY-MM`; Current Runtime: verify existing persistence; Status: PENDING IMPLEMENTATION. No DB column / handler / payload changed this round.)* |
| `company` · `country` · `marketplace` · `sku` | scope grain (SKU lives on this **parent**; child lines inherit it via `request_allocation_draft_id`) |
| `category_snapshot` · `series_snapshot` | Master SKU category / series captured at draft creation *(renamed from `category` / `series`; legacy names are read-only migration aliases)* |
| `status` | `draft` / `site_confirmed` / `submitted` / `partially_submitted` / `cancelled` |
| `generation_type` | **`scheduled` / `manual_refresh` / `user_created`** — the generator (**replaces the retired `source_type`**; `ai_suggested` is NOT used — the recommendation is a rules Engine, not AI). Manual Send Request = `user_created`. |
| `draft_purpose` | `regular` / `emergency` — the normal flow is always `regular`; `emergency` only when a Draft is created from the (future) Emergency Order entry |
| `calculation_run_id` · `formula_version` · `calculated_at` · `source_data_as_of` | calculation provenance — populated by Engine B when implemented; **blank in the current manual flow (never faked)** |
| `draft_version` | version counter (manual flow = `1`) |
| `created_by` · `created_at` · `updated_by` · `updated_at` | audit |
| `submitted_by` · `submitted_at` | set when Send Request fully submits the draft |
| `cancelled_by` · `cancelled_at` · `cancel_reason` | soft cancel |
| `note` | free text |

**REMOVED from the header (canonical):** `source_type` — superseded by `generation_type` (legacy `source_type` may be read as a migration fallback, never written).

**`request_order_allocation_draft_lines`:**

| Column | Note |
|---|---|
| `request_allocation_line_id` | PK |
| `request_allocation_draft_id` | FK → header |
| `request_month` | the pushed month `YYYY-MM` |
| `request_bucket` | `T1` / `T2` / `T3` (never `T4`; SKU inherited from the parent draft — no `sku` column on the line) |
| `regular_demand_snapshot` · `special_event_demand_snapshot` | forecast demand snapshots *(regular renamed from `fc_qty_snapshot`; legacy name is a read-only alias)* |
| `destination_stock_snapshot` · `third_party_available_qty_snapshot` · `qualified_incoming_snapshot` · `approved_supply_snapshot` · `factory_available_qty_snapshot` | supply / stock snapshots at edit time *(destination renamed from `site_stock_snapshot`; third-party from `third_party_stock_snapshot`; factory from `factory_stock_snapshot`; legacy names are read-only aliases)* |
| `target_pct_snapshot` | target% snapshot (display) |
| `calculated_gap_qty_snapshot` · `recommended_shipping_qty_snapshot` · `residual_production_required_snapshot` · `reallocation_in_qty_snapshot` · `reallocation_out_qty_snapshot` · `net_order_need_snapshot` | Engine A / Engine B calculation-output snapshots — **blank until the calculation runtime is implemented (never faked 0)** |
| `recommended_qty` | **persisted system Suggested Order snapshot** produced by Engine B (Net Order Need → carton CEILING) when the calculation runtime is implemented. **Current Runtime:** may remain blank / placeholder because Engine A and Engine B are **NOT IMPLEMENTED**. A user edit **never** overwrites it. |
| `order_qty` | **editable** user order qty (drives Request Order Draft line); user edit updates this + recomputes `carton_qty` and preserves `recommended_qty` |
| `carton_qty` · `units_per_carton` | carton math inputs (snapshot; may be blank) |
| `allocation_method` | tag (no formula) |
| `recommendation_reason` · `recommendation_flags` | Engine B recommendation annotations (blank in the current manual flow) |
| `line_status` | `draft` / `submitted` / `cancelled` — a new line starts `draft`; Send Request marks the submitted lines `submitted` (+ `submitted_by` / `submitted_at`); unsent `T1` / `T2` / `T3` lines stay `draft` |
| `submitted_by` · `submitted_at` | set on the line when it is submitted |
| `note` · `created_at` · `updated_at` | audit + note |

**Header status enum:** `draft` / `site_confirmed` / `submitted` / `partially_submitted` / `cancelled`. When only some buckets are sent, the header is `partially_submitted`; once every eligible line is submitted, the header is `submitted`.

**Wiring (this task):** Apps Script `getRequestOrderAllocationDrafts` (read via `getOperationDb`), `upsertRequestOrderAllocationDraft`, `upsertRequestOrderAllocationDraftLines`, `submitRequestOrderAllocationDrafts`; adapter `KM.DB.getRequestOrderAllocationDrafts()` / `getRequestOrderAllocationDraftLines()` / `upsertRequestOrderAllocationDraft()` / `upsertRequestOrderAllocationDraftLines()` / `submitRequestOrderAllocationDrafts()`. **Send Request** reads eligible (`draft` / `site_confirmed`) lines with `order_qty > 0`, creates `request_orders` / `request_order_lines` via the existing `createRequestOrderDraft` handler (grouped by series + supplier/factory when available; else series with supplier/factory = `--`/pending), then marks the allocation drafts `submitted`. **Demo Mode:** in-memory only (no DB writes; clearly labelled).

## 3.8 `request_order_line_sources` — **company/site/month demand-provenance breakdown (final grain / authority RESOLVED under B-5, §3.9)**

**Purpose:** the company / site / month **demand-provenance** breakdown behind each request line. Read by the **Company Allocation popup** (Request Order Draft → SKU In Total → click a KM/ResUS/ResTW value). **This is the source-detail table — it MAY keep snapshot fields (forecast / stock / on-the-way / etc.); those must NOT be re-added to `request_order_lines` (§3.2).** **B-5 RESOLVED (§3.9):** a source is a **demand-provenance snapshot**, **not** a second quantity authority and **not** supply/allocation provenance; **one line owns 1..N sources**; final grain = §3.9-3; natural key = §3.9-4. The `source_id` is the surrogate PK (legacy `line_source_id` read-only compatibility).

**`request_order_line_source_id`** is the surrogate PK; its unique-key role and the source natural key are now canonical (**§3.9-4**). A physical legacy `line_source_id` column may be dual-read. Runtime write-path realization remains a later implementation round (no code change here).

**Columns (final grain / natural key canonical — §3.9-3/-4; the runtime write path emits these at Send Request):**

| Column | Note |
|---|---|
| `request_order_line_source_id` | Surrogate PK (canonical, §3.9-4); legacy `line_source_id` read-only compat |
| `request_order_line_id` | FK → `request_order_lines` |
| `request_order_id` | FK (denormalized, for lookup) |
| **`tier_type`** | **`T1` / `T2` / `T3`** — the source bucket (mirrors `source_bucket`) |
| `company` | KM / ResUS / ResTW … |
| `country` · `marketplace` | site grain |
| `ownership_company` | owning company when it differs from the routing `company` |
| `warehouse_id` | site/warehouse reference |
| `site_sku` | **populated when available from `marketplace_skus` / `sku_regional_details`** |
| `forecast_qty` · `current_stock` · `on_the_way_qty` · `factory_allocated_qty` | snapshot inputs (blank when no source) |
| `shortage_qty` · `reallocation_qty` · `recommended_qty` | allocation snapshots |
| `requested_qty` · `approved_qty` | per-source quantities |
| `allocation_method` | e.g. `manual_order_allocation` |
| `source_bucket` | **`T1` / `T2` / `T3`** (mirrors `tier_type`) |
| `source_month` | **`YYYY-MM`** the demand belongs to |
| `source_priority` | T1=1 / T2=2 / T3=3 |
| `note` · `created_at` · `updated_at` | audit + note |

**Rules — canonical (RESOLVED under B-5, §3.9):**
- **One `request_order_line` owns 1..N `request_order_line_sources`** (each = a distinct site-level demand origin); every source's `company` equals the parent line's `company` (§3.9-3/-5).
- **`Σ(source.approved_qty) = line.approved_qty`** and `Σ(source.requested_qty) = line.requested_qty` (§3.9-7b). The source is a **rollup component, not an independent authority**; if they ever diverge the **LINE wins** (§3.9-7d). The current runtime write path emits one source per line (the 1→N-degenerate case) and syncs `source.approved_qty = line.approved_qty`; generalizing that sync to `line = Σ sources` is a later additive implementation step (§3.9-21).
- **Sync on Save / Submit / Convert to PO** copies the decision qty; snapshot fields are never overwritten by sync.
- **Cancelled lines** are terminal + immutable (§13.4 / §G); source-row cancel/release semantics = **B-8** (not decided here).
- **`tier_type` / `source_bucket`** both mirror the parent line's `request_bucket` (`T1`/`T2`/`T3`). `site_sku` is populated from `marketplace_skus` / `sku_regional_details` when resolvable.

**Status (runtime).** A write + read path exists (`handleCreateRequestOrderDraft_` appending one row per line; adapter `KM.DB.getRequestOrderLineSources()` + `normalizeRequestOrderLineSourceRecord`). The Company Allocation popup shows source rows and falls back to `request_order_lines` grouped by company (**"Site-level source pending."**) for legacy requests. The **grain, cardinality, and authority are now canonical (§3.9)**; the full 1→N writer realization is a later implementation round (no code change in this decision task).

---

## 3.9 B-5 Canonical Decision — Request Line / Source Grain, Quantity Authority, Monthly Split & Recommendation→Request Writer (RESOLVED — Decision Only, 2026-08-03)

> **Status: B-5 RESOLVED — Decision Only.** This section is the canonical owner of the final `request_order_lines` / `request_order_line_sources` grain, quantity authority, Monthly SKU split, and the Recommendation→Request writer boundary. It **supersedes** the "Blocked under B-5 / legacy / provisional" wording elsewhere in this spec (§3.2 line grain, §3.8, §13) and in `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 / `DATABASE_RELATIONSHIP_MAP.md` §7. **No writer, DB migration, column, index, backfill, or Runtime is implemented or authorized here** — it is a contract for later implementation. It does **not** decide B-6 (Request→PO atomicity) or B-8 (cancellation/release), and does **not** reopen B-7.

**Selected architecture — Company-on-Line with 1→N Demand-Provenance Sources.** Chosen on end-to-end writer + execution evidence (*not* because Phase-1 exists, and *not* the SKU-aggregated future grain because it is cleaner): the implemented Convert-to-PO maps one request line → one PO line 1:1 carrying `company` and the `km/resus/restw` snapshot (`km+resus+restw = ordered_qty`), and `SUPPLY_PLANNING_CALCULATION_RULES.md` §39 `demandKey` **excludes `marketplace`** — so `company` must live on the line and `marketplace`/site must live on the source. The SKU-aggregated future grain (`REQUEST_ORDER_AND_PO_SPEC.md`) would break the 1:1 conversion and the company-sum invariant; strict one-company=one-source cannot represent multi-marketplace demand in one line. Trade-off summary at the end of this section.

**1. `request_order_lines` grain (FINAL).** One line per `request_order_id + company + sku + request_bucket`. `request_month` (`YYYY-MM`) is a cycle snapshot attribute, **not** part of the natural key (`request_order_id` already scopes one monthly cycle). Buckets are never merged at the Request stage.

**2. `request_order_lines` natural key (FINAL).** `(request_order_id, company, sku, request_bucket)`, `request_bucket ∈ {T1,T2,T3}` (canonical; `tier_type` forbidden here). `request_order_line_id` remains the surrogate PK.

**3. `request_order_line_sources` grain (FINAL).** One row per **site-level demand origin** contributing to a line: `request_order_line_id + country + marketplace + site_sku + source_month` (existing columns), with `destination_warehouse_id` an **additive** demand-destination lineage dimension (joins the key once populated; currently blank → key stays valid). A source's `company` always equals the parent line's `company` (the line is company-scoped). A source row is a **demand-provenance snapshot** — "which site/marketplace/month need produced this line's quantity"; it is **not** a supply/allocation provenance record and **not** a second quantity authority.

**4. Source natural key (FINAL).** `(request_order_line_id, country, marketplace, site_sku, source_month)`; additive lineage dimensions `destination_warehouse_id` and `demand_key` (§39) join the key once populated. `request_order_line_source_id` is the surrogate PK; legacy `line_source_id` is read-only compatibility. `tier_type`/`source_bucket` mirror the parent line's `request_bucket`.

**5. Line ↔ Source cardinality (FINAL).** One line owns **1..N** source rows; one source belongs to exactly one line; all sources under a line share the line's `company`. Multiple marketplaces / countries / destination warehouses / source months may contribute to one line (each a distinct source). The prior "one company = one line = one source" is now the **degenerate single-marketplace case** of 1→N (the current runtime read/sync path is already 1→N-safe).

**6. Quantity authority matrix (FINAL).**
- `request_order_lines.approved_qty` = **THE decision authority** (editable in Draft; immutable after Submit).
- `request_order_lines.km_qty/resus_qty/restw_qty` = transitional per-company snapshot (matched company = `approved_qty`, others `0`).
- `request_order_lines.recommended_qty` (system snapshot), `requested_qty` (from draft `order_qty`), `shortage_qty`/`reallocation_qty` (allocation snapshots) = **audit only**.
- `request_order_line_sources.approved_qty/requested_qty` = per-source demand contribution — a **rollup component, not an independent authority**.
- `purchase_order_lines.ordered_qty` = `approved_qty` = execution authority at the PO layer; `requested/approved/recommended` on the PO line = audit only.

**7. Sum invariants (FINAL).** (a) Per line, for `company ∈ {KM,ResUS,ResTW}`: `km_qty + resus_qty + restw_qty = approved_qty`. (b) Per line: `Σ(source.approved_qty) = line.approved_qty` and `Σ(source.requested_qty) = line.requested_qty`. (c) At Convert: `ordered_qty = approved_qty`; company snapshot copied verbatim. (d) The writer computes `line = Σ sources`, so (b) holds by construction; if reconciliation ever finds `line ≠ Σ sources`, **the LINE quantity wins** (Convert-to-PO reads only the line).

**8. Editable vs immutable fields (FINAL).** Editable in Request Draft (`request_status=draft`): `approved_qty` (+ derived `km/resus/restw`, `carton_qty`, `estimated_amount`), schedule dates, `note`. Immutable after Submit (`pending_approval`+): all quantities, grain, and source rows — a Recommendation engine may never mutate them (B-7 Submit rule). `line_status=cancelled` is terminal + immutable. Source rows are written once and immutable after Submit (later recalculation never edits existing sources).

**9. Company ownership rule (FINAL).** `request_order_lines.company` is the canonical **demand/routing company** and part of line identity. `ownership_company` (source) is **planning metadata only** (default `ResTW`) — never accounting/intercompany. `km/resus/restw` are transitional compatibility snapshots, **not** the multi-company mechanism.

**10. Fixed company-column disposition (FINAL).** `km_qty/resus_qty/restw_qty` are **retained** (Phase-1 + PO wide-display compatibility) but **frozen** — no fourth company column is ever added. A new company is `line.company = <new company>` with `approved_qty` under it (the three fixed columns stay `0`). Canonical company quantity is always `(line.company, line.approved_qty)`; invariant 7(a) applies only to the legacy three.

**11. Marketplace / warehouse / site ownership (FINAL).** `country`, `marketplace`, `site_sku`, `marketplace_product_id`, `destination_warehouse_id`, `source_month` = **source identity/snapshot** — prohibited on the request line and header. `company` = line identity (+ source echo). `request_bucket` = line identity; `request_month` = line snapshot. Supplier/factory `warehouse_id`/`factory_id` = request **header** (procurement supply origin; default CN Youxin) — distinct from `destination_warehouse_id` (demand destination, a source dimension). `planning_cycle` = recommendation-draft identity (upstream), echoed as `request_month`/`source_month`.

**12. Monthly SKU split rule (FINAL — resolves the B-7 deferral).** One Master SKU splits into **separate request lines by `company` AND `request_bucket` only**. It does **not** split by marketplace/country/site_sku/destination_warehouse_id/source_month (→ **separate source rows** under one line), nor by supplier/factory (→ PO-conversion split, §15.1 / future `request_order_po_links`), nor by month beyond the bucket. Merge/separate: same `(company,sku,request_bucket)` → **one** line (site demands become distinct sources); differ in `company` OR `request_bucket` → **separate** lines; differ only in `country/marketplace/site_sku/destination_warehouse_id/source_month` → **one** line, **separate** sources. *Deterministic example* — Master SKU `ABC`, cycle `2026-08`: KM Amazon-US T1 100, KM Walmart-US T1 40, ResUS Amazon-US T2 60, ResTW T1 30 ⇒ **3 lines**: L1 (KM,ABC,T1, approved 140; `km_qty` 140) with **2 sources** (Amazon 100, Walmart 40); L2 (ResUS,ABC,T2, approved 60; `resus_qty` 60) 1 source; L3 (ResTW,ABC,T1, approved 30; `restw_qty` 30) 1 source.

**13. Recommendation→Request writer — input contract (FINAL identity; NOT implemented).** Input: `request_order_allocation_drafts` header (`planning_cycle`, `company`, `country`, `marketplace`, `sku`, `draft_purpose`, `draft_version`, `calculation_run_id`, `formula_version`) + `request_order_allocation_draft_lines` (`request_month`, `request_bucket`, `recommended_qty` [system], `order_qty` [user], demand/supply snapshots) + optional §39 `demandKey` / §40 allocation lineage. The writer **aggregates** site-level draft lines (`company+country+marketplace+sku+request_bucket+request_month`) up to request lines (`company+sku+request_bucket`), demoting `country/marketplace/site_sku/destination_warehouse_id/source_month` into source rows.

**14. Writer — output mapping (FINAL identity; NOT implemented).** `request_orders` (header `company=''` multi-company, `warehouse_id`=factory default, `request_status=draft`, `tier_group` derived) → `request_order_lines` (grain §3.9-1; `approved_qty=order_qty`; `km/resus/restw` derived from `company`; `recommended_qty` snapshot; `requested_qty=order_qty` at creation) → `request_order_line_sources` (one per site demand origin; `requested_qty/approved_qty` = per-source contribution; `demand_key` lineage when available).

**15. Writer idempotency identity (FINAL; NOT implemented).** Three-level: `(planning_cycle, recommendation_type, business_scope, draft_version)` → at most one non-cancelled `request_order`; `(request_order_id, company, sku, request_bucket)` → at most one line; source natural key (§3.9-4) → at most one source. The current caller's per-Send-Request new `RAD-…` id is **not** an idempotency mechanism (the scheduler must resolve the existing cycle draft first — `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md` §G). Lock/transaction realization = implementation, and Request→PO atomicity = **B-6** — not decided here.

**16. Zero-quantity behavior (FINAL).** A draft line with `order_qty=0` writes **no** `request_order_line` (and no source). A line later reduced to 0 is **cancelled** (`line_status=cancelled`, terminal), never deleted; Convert-to-PO excludes cancelled lines (§13.4 / §15).

**17. Blocked / conflict behavior (FINAL).** If the underlying §39 demand or §40 pool is `BLOCKED_CONFLICT`, the writer **fails closed** for the affected grain — never silently writes a normal line or fabricates a quantity, and never reports success after a partial write (`RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md` §G). Surfacing/release semantics = implementation + B-8.

**18. Partial-carton preservation (FINAL).** `order_qty → approved_qty → ordered_qty` copies the **exact** quantity; the writer and Convert-to-PO **never** re-CEILING/FLOOR/round (§37). `recommended_qty` stays the full-carton system snapshot, unchanged.

**19. Request snapshot boundary (FINAL).** `request_order_allocation_drafts/_lines` = editable recommendation scratchpad (regenerable). `request_orders/_lines/_line_sources` (Draft) own **copied** snapshots. Submitted request = immutable business record. Approved request = the Convert-to-PO source. Later recommendation recalculation never mutates existing request rows.

**20. PO snapshot boundary (FINAL).** Convert-to-PO copies `request_order_lines` (company, `km/resus/restw`, `approved_qty→ordered_qty`, dates) into `purchase_order_lines`; it does **not** read `request_order_line_sources`. The PO owns its snapshot and never live-reads the request (§14). `request_order_po_links` (future, not MVP) is the full request→many-PO relationship, natural key `(request_order_id, purchase_order_id)` split by `request_bucket` (implemented T1 vs T2_T3) and future `supplier_warehouse_id`; MVP uses `request_orders.converted_purchase_order_id` (1→1).

**21. Phase-1 compatibility / migration (FINAL — additive).** No column is added, removed, backfilled, or migrated by this decision — the change is canonical only: the grain/cardinality/authority above are now **canonical** (previously provisional). Existing 1:1 source rows are valid 1→N-degenerate and remain readable. Forward additive-only steps (each a later authorized round, none now): generalize the writer's `syncLineSourceApproved_` to `line = Σ sources`; optionally add `destination_warehouse_id` / `demand_key` lineage columns to `request_order_line_sources`; support new companies via generic `line.company`. The "Site-level source pending" fallback stays until sources are populated.

**22. Non-goals (explicit).** No writer/persistence/scheduler/LockService/transaction/idempotency implementation; no Apps Script/frontend/API/DB/schema/column/index change; no data migration or backfill; no Request→PO conversion change (B-6); no cancellation/release mapping (B-8); no B-7 reopen; no Scenario #34; no Calculation Runtime or test change.

**Trade-off summary (three architectures evaluated).**

| Dimension | A. Company-on-Line + 1→N sources (SELECTED) | B. SKU-aggregated line (future three-layer) | C. Strict 1:1 (one company = one source) |
|---|---|---|---|
| DB grain clarity | High — line=decision, source=provenance | Medium | High but too coarse |
| Lineage quality | High (N site sources + `demandKey`) | High | Low (single source only) |
| Multi-company | Native (company on line) | Via source only (needs PO fan-out) | Native |
| Multi-marketplace | Native (N sources) | Native | **Cannot** (forces marketplace into line grain) |
| Monthly split | Deterministic (company × bucket) | Ambiguous (company on source) | Explodes line count |
| PO conversion | 1:1, unchanged (implemented) | **Breaks** (needs company fan-out) | 1:1 |
| UI compatibility | Full (tall lines + popup) | Requires rework | Full but no multi-site popup |
| Phase-1 migration | Additive (canonize only) | Non-additive (drop company from line) | Additive |
| Fixed-column dependence | Removed as authority (company on line) | Removed | Retained |
| Writer complexity | Moderate (aggregate to line + fan sources) | High (split at PO) | Low |
| Qty divergence risk | Low (`line = Σ sources`; line wins) | Medium | Low |
| Future API suitability | High | High | Low |

---

## 13. Manual Allocation Workflow (DB grain now canonical — §3.9)

This section preserves the approved **Manual Allocation UI and user-decision workflow** (and the Round 1 lifecycle). The Canonical database grain, authority, uniqueness, and Recommendation→Request writer contract between `request_order_lines` and `request_order_line_sources` are now **RESOLVED under B-5 (§3.9)**; this section remains the reference for how company allocation is *presented* for **Shipment Allocation**, **Purchase Orders**, and **Factory Allocation**.

> **DB grain (RESOLVED — §3.9):** the UI content of this section is the **user-decision workflow** (each company's `approved_qty` is a direct user decision, with **no** proportional split) plus the **cancelled-line immutability** rule (§13.4). The DB-level facts are now canonical per **§3.9**: line natural key `(request_order_id, company, sku, request_bucket)` (§3.9-2); one line owns **1..N** sources with `Σ source.approved_qty = line.approved_qty` (§3.9-5/-7); `approved_qty` is the single decision authority (§3.9-6). The **full 1→N writer realization + lock/transaction is a later implementation round** (Request→PO atomicity = B-6; source cancel/release = B-8 — neither decided here).

### 13.1 Company-based persistence (canonical — §3.9)

Request Order persistence is **Company-based** — this is now the canonical line grain (RESOLVED under B-5, §3.9-1/-2). Line natural key:

```
request_order_id + company + sku + request_bucket   (request_bucket = T1 / T2 / T3)
```

- **One Company = one `request_order_line`** — canonical (§3.9-2).
- **One `request_order_line` owns 1..N `request_order_line_sources`** — canonical (§3.9-5); the prior "one company = one source" is the degenerate single-marketplace case. Every source's `company` = the line's `company`.
- Each `request_order_line` carries exactly **one** `company`; its `km_qty` / `resus_qty` / `restw_qty` place `approved_qty` on the matched company column (others `0`, never blank); no 4th company column is ever added (§3.9-10).

### 13.2 Manual Allocation Mode

- When a company row **does not exist** for a `(request_order_id, sku, request_bucket)`, the workflow **auto-creates** a `request_order_line` (and its source row(s)) at that canonical grain (§3.9-1/-3). *(approved user-decision workflow)*
- **No ratio allocation.** Quantities are never split proportionally. *(approved user-decision workflow)*
- **Each company owns its own `approved_qty`** — the row total (Approved) equals the sum of the per-company allocations (`km_qty + resus_qty + restw_qty`), validated before Save/Submit. *(approved user-decision workflow)*

### 13.3 Synchronization rule (canonical — §3.9)

The line/source `approved_qty` relationship is now canonical (§3.9-7b): **`Σ(request_order_line_sources.approved_qty) = request_order_lines.approved_qty`** per line; on divergence the **LINE wins** (§3.9-7d). The current runtime emits one source per line (the 1→N-degenerate case) and syncs the same decision quantity; generalizing to `line = Σ sources` is a later additive implementation step (§3.9-21).

```
Σ request_order_line_sources.approved_qty  =  request_order_lines.approved_qty   (canonical, §3.9-7b)
        per request_order_line  (company + sku + request_bucket)
        — line is the single authority; sources are demand-provenance rollup components
```

- Synchronization uses the **same decision quantity** — **no ratio, no proportional distribution**.
- Only `approved_qty` (+ `updated_at`) is synchronized; **snapshot fields on `request_order_line_sources`** (forecast_qty / current_stock / on_the_way_qty / shortage_qty / reallocation_qty / recommended_qty / requested_qty / source_month / source_bucket / source_priority / site_sku / marketplace_product_id) are **not** overwritten by sync.
- **Occurs on:** **Save** · **Submit** · **Convert to PO** (same decision quantity).

### 13.4 Cancelled-line immutability (terminal — official)

**`request_order_lines.line_status = cancelled` is TERMINAL and immutable.** Once cancelled (records `cancelled_by` / `cancelled_at` / `cancel_reason`, §3.2):
- **Save must NOT overwrite** cancelled lines (no qty / date / status / company-split change).
- **Submit must NOT reactivate** cancelled lines — Submit **ignores** them (no re-status, no re-stamp).
- **Approve must NOT approve** cancelled lines — they are skipped.
- **Convert to PO EXCLUDES** cancelled lines (never copied into the PO snapshot, §15).
- **`request_order_line_sources` sync** — a cancelled line's source rows are excluded from the `Σ source.approved_qty = line.approved_qty` rollup (§3.9-7b). The per-source cancel/release **status lifecycle** (whether source rows are stamped/released on cancel) = **B-8** (still open).
- Excluded from company-split validation and from `total_sku` / `total_qty` / `total_cartons` totals.
- **Rows remain in the DB for audit** — never deleted.
- **Restore** (if ever needed) must be a **future explicit, audited action** — never automatic.

### 13.5 Downstream foundation

This rule is the **foundation** for:
- **Shipment Allocation** — company-owned quantities flow to shipment allocation without ratio splitting.
- **Purchase Orders** — the PO company-split snapshot (`purchase_order_lines.km_qty / resus_qty / restw_qty`, §3.4) is captured per company from the request **line** at Convert (`km+resus+restw = ordered_qty = approved_qty`); the line/source relationship is canonical (`Σ source.approved_qty = line.approved_qty`, §3.9-7).
- **Factory Allocation** — factory-side allocation reads company-owned quantities, never a re-derived ratio.

---

## 14. Global Snapshot Architecture Principle (official)

**Each layer copies upstream data into its own snapshot when it commits.**

```
Forecast / Planning
        ↓  (copy at commit)
Request Snapshot        (request_orders / request_order_lines / request_order_line_sources)
        ↓  (copy at Convert to PO)
PO Snapshot             (purchase_orders / purchase_order_lines)          — see PURCHASE_ORDER_SPEC.md §8A
        ↓  (copy at execution commit)
Shipment Snapshot       (shipments / shipment_lines)
        ↓
History
```

**Rules:**
- **Downstream layers do NOT live-join upstream data for historical execution truth.** Each committed layer stands on its own stored snapshot.
- **Joins to master data are allowed only for display labels** — when the stored snapshot value is blank, or when the master label is intentionally display-only (e.g. `warehouse_id → warehouses.warehouse_name`, `sku → sku_details.category/series`). They must **never** replace a stored quantity / date / cost / allocation.
- **At commit, the downstream layer copies:** quantities, dates, costs, company allocation, supplier / factory decisions, and (for Shipment) execution data. After commit the downstream layer **owns** those fields.
- **Historical records remain stable** even if upstream planning data changes later — an edit to a Request never mutates an existing PO; an edit to a PO never mutates an existing Shipment.
- This principle supports **audit, export, BI, API, and future AI explanation** (every layer is independently reproducible from its own row).
- **Traceability keys** (`request_order_id`, `request_order_line_id`, `purchase_order_line_id`, …) are kept **for lineage only**, not for live recomputation.

### 14.1 Snapshot Completeness Principle (official)

**Every downstream snapshot must contain ALL data required to execute independently.** A downstream module must **never** depend on live upstream planning tables to reconstruct execution data.

- **PO must be executable without live-reading the Request Order** — every field it needs (qty, company split, dates, cost, supplier/factory, bucket) is copied at Convert to PO (§15).
- **Shipment must be executable without live-reading the Request Order** — it copies from **PO / Shipping Plan** execution snapshots, never recalculating from the Request.
- **History must remain stable** even if upstream data changes later.
- A downstream row that is missing a needed value **fills it at commit** (copy), not by a later live join; master-data joins remain display-label only.

---

## 15. Convert to PO — Field Mapping Table & Split Rule (finalized)

### 15.1 T1 vs T2+T3 PO Split Rule

When converting an **Approved** Request Order to PO:

- **Cancelled `request_order_lines` are EXCLUDED** (§13.4).
- Active **T1** lines create **one independent PO card** (`purchase_orders.request_bucket = T1`).
- Active **T2 and T3** lines create **one independent combined PO card** (`purchase_orders.request_bucket = T2_T3`).
- If only T1 exists → create only the **T1 PO**. If only T2/T3 exists → create only the **T2_T3 PO**. If both exist → create **two PO records** (`T1` and `T2_T3`).
- **Never merge T1 with T2/T3.**
- Each PO **header** stores `request_bucket` (`T1` or `T2_T3`); each PO **line** stores its **original** `request_bucket` (`T1` / `T2` / `T3`).

### 15.2 Request Order Header → Purchase Order Header

| Request Order (source) | Purchase Order (target) |
|---|---|
| `request_orders.request_order_id` | `purchase_orders.request_order_id` |
| `request_orders.request_order_no` | lineage / `note` only if needed |
| `request_orders.company` | `purchase_orders.company` |
| `request_orders.supplier_id` | `purchase_orders.supplier_id` |
| `request_orders.supplier_name` | `purchase_orders.supplier_name` |
| `request_orders.warehouse_id` | `purchase_orders.warehouse_id` |
| `request_orders.warehouse_id` + `warehouses` | `purchase_orders.factory_id` / factory display (`warehouse_name`) |
| `request_orders.currency` | `purchase_orders.currency` |
| `request_orders.note` | `purchase_orders.note` |
| `request_bucket` group (`T1` / `T2_T3`) | `purchase_orders.request_bucket` |
| matching request-bucket line dates | `purchase_orders.inspection_date` / `expected_completion_date` / `expected_ship_date` |
| created actor | `purchase_orders.created_by` |
| system timestamp | `purchase_orders.created_at` (and `order_date` = Send PO date) |

### 15.3 Request Order Line → Purchase Order Line

| Request Order Line (source) | Purchase Order Line (target) |
|---|---|
| `request_order_lines.request_order_line_id` | `purchase_order_lines.request_order_line_id` |
| `request_order_lines.request_order_id` | `purchase_order_lines.request_order_id` |
| `request_order_lines.request_bucket` | `purchase_order_lines.request_bucket` (original `T1`/`T2`/`T3`) |
| `request_order_lines.company` | `purchase_order_lines.company` |
| `request_order_lines.sku` | `purchase_order_lines.sku` |
| `request_order_lines.series` | `purchase_order_lines.series` |
| `request_order_lines.factory_item_no` | `purchase_order_lines.factory_item_no` |
| `request_order_lines.factory_item_name` | `purchase_order_lines.factory_item_name` |
| `request_order_lines.supplier_id` | `purchase_order_lines.supplier_id` |
| `request_order_lines.supplier_name` | `purchase_order_lines.supplier_name` |
| `request_order_lines.supplier_sku` | `purchase_order_lines.supplier_sku` |
| `request_order_lines.supplier_warehouse_id` | `purchase_order_lines.supplier_warehouse_id` |
| `request_order_lines.km_qty` | `purchase_order_lines.km_qty` |
| `request_order_lines.resus_qty` | `purchase_order_lines.resus_qty` |
| `request_order_lines.restw_qty` | `purchase_order_lines.restw_qty` |
| `request_order_lines.recommended_qty` | `purchase_order_lines.recommended_qty` |
| `request_order_lines.requested_qty` | `purchase_order_lines.requested_qty` |
| `request_order_lines.approved_qty` | `purchase_order_lines.approved_qty` (audit) |
| `request_order_lines.approved_qty` | `purchase_order_lines.ordered_qty` |
| `request_order_lines.shortage_qty` | audit only (no target column) |
| `request_order_lines.reallocation_qty` | audit only (no target column) |
| `request_order_lines.carton_qty` | `purchase_order_lines.carton_qty` |
| `request_order_lines.units_per_carton` | `purchase_order_lines.units_per_carton` |
| `request_order_lines.unit_cost` | `purchase_order_lines.unit_cost` |
| `request_order_lines.currency` | `purchase_order_lines.currency` |
| `request_order_lines.line_status` | `purchase_order_lines.line_status` |
| `request_order_lines.inspection_date` | `purchase_order_lines.inspection_date` |
| `request_order_lines.expected_ready_date` | `purchase_order_lines.expected_completion_date` |
| `request_order_lines.expected_ship_date` | `purchase_order_lines.expected_ship_date` |
| `request_order_lines.note` | `purchase_order_lines.note` |

### 15.4 Derived fields (computed at conversion)

| Field | Rule |
|---|---|
| `purchase_order_lines.completed_qty` | `0` |
| `purchase_order_lines.shipped_qty` | `0` |
| `purchase_order_lines.remaining_qty` | `0` (= `completed_qty − shipped_qty`; available-to-ship, both `0` at creation — NOT `ordered_qty`) |
| `purchase_order_lines.line_amount` | `ordered_qty × unit_cost` |
| `purchase_orders.total_sku` | `COUNT(DISTINCT purchase_order_lines.sku)` |
| `purchase_orders.total_qty` | `SUM(ordered_qty)` |
| `purchase_orders.total_cartons` | `SUM(purchase_order_lines.carton_qty)` |
| `purchase_orders.total_amount` | `SUM(line_amount)` |
| `purchase_orders.subtotal_amount` | `SUM(line_amount)` |
| `purchase_orders.deposit_amount` | `subtotal_amount × deposit ratio` if known, else blank |
| `purchase_orders.balance_amount` | `subtotal_amount − deposit_amount` if deposit known, else blank |
| `purchase_orders.supplier_expected_ready_date` | mirrors `expected_completion_date` (← `request_order_lines.expected_ready_date`) |
| `purchase_orders.supplier_confirmed_ready_date` | blank at creation; set on supplier confirmation / delay Update |
| `purchase_orders.order_date` | **blank** at Convert (stamped at Send PO) |
| `purchase_orders.deposit_due_date` | **blank** at Convert (= `order_date` + 5 business days; stamped at Send PO) |

---

## External-Origin Admission Cross-Reference (2026-08-01 Round 4D-C — cross-reference only; version retained)

PO committed supply (§P1-B) is a **KM canonical** admission-eligible source: it may enter Qualified Incoming under the planning-admission gate (`SUPPLY_PLANNING_CALCULATION_RULES.md` §38) and transfers ownership to a Formal Shipment **count-once** (§30; lineage `shipment_lines.purchase_order_line_id`). An **externally originated** PO / inbound record with no accepted KM lineage is **quarantined** and contributes **0** until an explicit human **Adopt** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §12). This spec's version is **retained** — cross-reference alignment only; nothing owned here changed.

---

---

## §SC-1M. Phase-1 Monthly Submit Contract — Allocation Draft → Request Order (FROZEN — Decision Only, 2026-08-04, Round SC-1)

> **Status: FROZEN — NOT IMPLEMENTED.** Domain mapping only; canonical owner = `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md` **§SC-1** (scope, quantity authority, blocked/carton gates, idempotency, logical transaction, immutability, command DTO, tokens, Phase-2 deferrals). Builds on **B-5 §3.9** (line grain). No Submit endpoint / writer / reservation / UI is implemented or authorized here.

- **Source → Target:** `request_order_allocation_drafts` / `request_order_allocation_draft_lines` → `request_orders` / `request_order_lines`. Active-lookup key (never `draft_version`): `MONTHLY_ORDER + planning_cycle(YYYY-MM) + company + country + marketplace + draft_purpose`. **Active-Draft count: 0 → NO_ACTIVE_DRAFT; 1 → proceed; >1 → BLOCKED_CONFLICT**; submitted/superseded/cancelled excluded.
- **Quantity authority:** per latest Active line, `submit_qty = order_qty` when explicit + valid, else `recommended_qty`; current version only (no cross-version carry-forward); non-negative integer; null recommendation never becomes 0; valid `line_status` only.
- **Full-carton gate (whole-draft block):** every submitted line — `units_per_carton` present and `> 0`, `submit_qty` divisible by `units_per_carton`, `carton_qty` derived/validated by the formula owner (`SUPPLY_PLANNING_CALCULATION_RULES.md`); never assume `units_per_carton = 1`; never silently round. Failure → `UNITS_PER_CARTON_MISSING` / `FULL_CARTON_REQUIRED` / `INVALID_CARTON_QUANTITY`.
- **Header grouping = Series × Supplier/Factory:** one `request_orders` header per (`request_order_lines.series` × `request_orders.supplier_id`/`factory_id`); multiple SKUs → multiple lines. **Company provenance is retained at line level** (`request_order_lines.company`, one company per line; B-5 line key `(request_order_id, company, sku, request_bucket)`, §3.9); **company is recorded but does NOT auto-split the header** — a shared factory may consolidate multiple companies' demand under one header (per-company detail also lives in `request_order_line_sources`, §3.8). Group by the schema identity (`supplier_id`/`factory_id`), never display name; different factories/suppliers → different Request Orders.
- **Month / bucket stay line-level:** `request_month` (`YYYY-MM`) + `request_bucket` (`T1`/`T2`/`T3`; never `tier_type`) remain on `request_order_lines`; Phase-1 does **not** create one header per month; `tier_group` (`T1`/`T2_T3`/`mixed`/blank) summarizes buckets; T1/T2/T3 are preserved through the Request Order (PO tier split is the existing §F rule, unchanged).
- **Whole-draft only + idempotency + transaction:** no line selection / no partial success; any blocking/carton/identity issue blocks the entire Submit. One `draft_id + draft_version` → at most one set of Request Orders (deterministic downstream identity; retry never duplicates); all-or-nothing build-all-headers+lines → verify → then mark Draft submitted (logical transaction; Sheets is not ACID). **Submitted Recommendation Allocation Draft is immutable; the resulting Request Order Draft keeps its own edit/Cancel lifecycle** (approved qty / inspection & ready & ship dates / note / cancel per current rules) and its edits never rewrite the submitted Draft snapshot.
- **Reservation:** Monthly Submit reserves/deducts nothing (procurement demand only). **Remaining uncertainty:** `request_orders.company` semantics under multi-company factory consolidation — see §SC-1.17(1) (owner: B-5 / §3.9; do not invent a column).

---

**Phase 1 — UI + mapping + DB handler foundation. API-ready. No auto-procurement engine, supplier API, payment flow, or formal document generation.**

**End of Document**
