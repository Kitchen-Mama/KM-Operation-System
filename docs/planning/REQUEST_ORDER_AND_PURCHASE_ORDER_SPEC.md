# Request Order & Purchase Order — Procurement Layer Phase 1 Spec

**Status:** 🟢 Phase 1 — UI + Mapping + DB Handler Foundation (API-ready, no auto-procurement engine)
**Last Updated:** 2026-07-01
**Maintained By:** Development Team
**Related:** [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md) (extended / future design — three-layer sources, payment terms, multi-PO links), [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md)

> **This is the Phase-1 IMPLEMENTED design** for the Procurement Layer (Request Order Draft, Purchase Order Overview, Purchase Order List). It intentionally uses a **flat, directly-implementable** schema (header carries `company` / `supplier` / `factory_id`) so the UI + Apps Script handlers + API adapter can ship now.
>
> The sibling [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md) (v1.3) remains the **extended / future design** — three-layer request structure with `request_order_line_sources`, `supplier_price_list` / `payment_terms` masters, and `request_order_po_links` for multi-PO splits. When the future calculation engine and multi-company source breakdown are built, this Phase-1 schema migrates toward that design (additively; no field removed here is reused with a different meaning there).
>
> **Guardrails honored:** no Factory Stock deduction · no Factory Allocation Engine · no Carrier Rate Engine · no Export/Template Center · no payment/invoice settlement · no full auto-procurement algorithm · no Role & Permission implementation. Actor fields are placeholder identities.

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
- `purchase_orders` **never** writes `request_orders` (except the one-time `request_orders.status = converted_to_po` marker set on the request itself at conversion — that is the request layer recording its own conversion, not the PO editing the request).
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
- **Line identity = `company` + `sku` + `request_bucket`.** **One company = one `request_order_line`** (one company = one `request_order_line_source`, §3.8).
- **`request_bucket`** = **canonical `T1` / `T2` / `T3`** — **`tier_type` MUST NOT be used on this table** (deprecated; never re-add). `request_month` = `YYYY-MM`.
- **`km_qty` / `resus_qty` / `restw_qty`** = per-company allocation — the matched company column carries the qty (= `approved_qty`), others `0` (never blank). Recomputed on `approved_qty` edit; validated so the row Approved = `km_qty + resus_qty + restw_qty` (Manual Allocation Mode, §13).
- **`recommended_qty`** = engine/allocation-draft recommendation snapshot (blank when no formula). **`requested_qty`** = requested from the Order Allocation draft. **`approved_qty`** = editable approval qty (decision). **`shortage_qty` / `reallocation_qty`** = allocation snapshots (blank when no formula).
- **`factory_item_no` / `factory_item_name`** = factory's own item number/name (from supplier/factory master when available; blank otherwise). **`supplier_warehouse_id`** = supplier/factory warehouse reference.
- **`inspection_date` / `expected_ready_date` / `expected_ship_date`** — line-level schedule; per tier, written to every line of the tier on Save. **`expected_ready_date` is the source of the PO `expected_completion_date` / `supplier_expected_ready_date`** at conversion (§C mapping / §3.3).
- **`line_status`** = `draft` / `submitted` / `approved` / `cancelled` — **must always be populated**. **`cancelled` is terminal + immutable** (§13.4 / §G): `cancelled_by` / `cancelled_at` / `cancel_reason` record the soft-cancel; the row is never reactivated or deleted.
- **`purchase_order_line_id`** = the created PO line (traceability) — **replaces the deprecated `linked_purchase_order_line_id`**; blank until Convert to PO.
- **`calculation_method`** = source label (`manual_order_allocation` …).

> All columns are **additive** — `sheetEnsureColumns_` appends any missing header; existing columns are never altered, and **deleted headers are missing-header-safe** (code never re-creates removed columns).

**DEPRECATED — no longer written or ensured** (kept only if physically present; NOT source of truth; code must **not** re-create): on `request_order_lines` → `final_order_qty`, `forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `source_company_count`, `source_site_count`, **`tier_type`**, `product_name`, `need_reason`, `related_entity_type`, `related_entity_id`, **`linked_purchase_order_line_id`** (replaced by `purchase_order_line_id`); on `request_orders` → `status` (replaced by `request_status`), header `inspection_date`/`expected_ready_date`/`expected_ship_date` (line-level only). Forecast / stock / on-the-way snapshot detail is owned by **`request_order_line_sources`** (§3.8) and **must NOT be re-added to `request_order_lines`**.

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
- **Company allocation snapshot is MANDATORY:** **`km_qty` / `resus_qty` / `restw_qty`** copied from `request_order_lines` (one company = one line, so exactly one is non-zero per line). **`request_bucket`** (original `T1`/`T2`/`T3`) is **mandatory**. **`line_status`** is **mandatory**.
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

- **Draft → Saved** — `Save` persists edits without changing status (still `draft`; "Saved" is the persisted-Draft state, not a separate DB value). **Saved → Submitted** = `submit` (`draft → pending_approval`). **Submitted → Approved** = `approve`. **Approved → Converted to PO** = `convert` (creates the Purchase Order snapshot — `PURCHASE_ORDER_SPEC.md` §8A PO Snapshot Rule; sets `request_orders.status = converted_to_po`). **Converted to PO → Completed** = `done` (`completed_at`/`completed_by`; leaves the default view, row never deleted).
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
- **Partial Completed / Completed** — driven by **`completed_qty`** via the **Receive flow** (`PURCHASE_ORDER_SPEC.md` §4A/§4B): each Receive does `completed_qty += receive_qty`, `remaining_qty = ordered_qty − completed_qty`. `Σ completed_qty` between 0 and `Σ ordered_qty` → `partial_completed` (stays In Production); **all lines `completed_qty ≥ ordered_qty` → `completed`** (+ `completed_at`/`completed_by` if available; PO leaves the active Workspace list). **Receive updates the PO only** — never the Request Order or a Shipment.
- **Partial Shipped / Shipped** — driven by **`shipped_qty`**.
- **Closure** — **auto** (all lines fully shipped: `shipped_qty ≥ ordered_qty`) or **manual** (required `closure_reason` + `closed_by`/`closed_at`), see §6.1.
- **Cancelled = terminal:** a cancelled PO **cannot be updated by the normal execution flow**; any future **restore must be explicit and audited** (never automatic). Row is never deleted.
- **Status-value mapping:** DB enum values below (`issued` = Issued/Sent PO; supplier confirmation is recorded on the PO record and the legacy `confirmed` state maps to "Supplier Confirmed").

**PO `status` enum (target — authoritative):**
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

1. **Auto Closure** — when **every** PO line is **fully shipped** (`shipped_qty ≥ ordered_qty`), the system **may** auto-transition the PO `status → closure` (target behavior; not an auto-procurement algorithm — a simple completion check). *(Note: `remaining_qty = completed_qty − shipped_qty = 0` alone is NOT a closure signal — it is also true for a brand-new PO with nothing completed.)*
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
- **✕ (cancel tier):** soft cancel — sets `request_order_lines.line_status = 'cancelled'` for the tier's lines (kept in DB, block hidden). If **no active line remains** on the request, `request_orders.request_status = 'cancelled'` + `cancelled_by/at`. Handler `cancelRequestOrderTier`. *(request_order_line_sources rows are append-only and not status-updated on cancel — follow-up.)*
- **+ Add Note:** reveals a textarea; Save writes the note to the tier's `request_order_lines.note` (line-level note field).
- **Validation:** Save/Submit blocked when a row's company split ≠ Approved, or Approved is not a full carton (multiple of `units_per_carton`).
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

**Receive flow (In Production cards):** **Receive** opens a modal scoped to one PO with line columns **SKU · Ordered Qty · Completed Qty (read-only/gray) · Remaining Qty (`ordered − completed`) · Receive Qty (defaults to Remaining)**. Partial receive allowed (`Receive Qty ≤ Remaining`); cannot exceed remaining or re-receive completed. On confirm: `completed_qty += receive_qty`, `remaining_qty = ordered_qty − completed_qty`. **All lines completed → `order_status = completed`** (+ `completed_at`/`completed_by` if available; PO leaves the active Workspace list). **Partial → `order_status = partial_completed`** (stays In Production). **Receive updates the PO ONLY — never the Request Order, never a Shipment;** Shipment allocation later *consumes* PO remaining/completed (read-only). Full rules: `PURCHASE_ORDER_SPEC.md` §4A / §4B.

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
| Ongoing Orders | Σ open-PO `remaining_qty` (fallback `ordered − max(shipped, completed)`) over `purchase_order_lines` ⋈ `purchase_orders.status ∈ {issued, in_production, partial_completed, partial_shipped, ready_to_ship, confirmed}` (per SKU) | **Connected (v2, best-effort)** — `--` if no open PO |
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
6. **Order Allocation** — **Month · Bucket** · Suggested · **Order Qty (editable)** · Carton · Note. Rows T1/T2/T3 (T1 = next month, T2 = next 2 months, T3 = next 3 months). **Display order is Month → Bucket** (stored data keys unchanged). Order Qty is held in local state and persisted on **Send Request** (`request_order_allocation_drafts` / `_lines`, §3.7).

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

**Send Request data integrity (下單系統):**
1. Send Request first creates/updates `request_order_allocation_drafts` + `_lines` (planning scratchpad), then creates the official `request_orders` + `request_order_lines`. **Draft suggestion data is never treated as official until Send Request runs.**
2. **Full-carton gate:** every selected line's `order_qty` must be an exact multiple of `units_per_carton` (when known) — otherwise Send is **blocked** with a per-SKU message.
3. **Site-confirmation gate (bucket-aware):** Send T1/T2/T3 requires confirmation for that bucket; **All Request** requires T1 ∧ T2 ∧ T3 (Confirm All treats all visible scopes as confirmed) — see §12.10.
4. Each request line keeps `request_bucket` = `T1/T2/T3`; allocation-draft lines carry snapshots (`factory_stock_snapshot`, `site_stock_snapshot`, `third_party_stock_snapshot`, `fc_qty_snapshot`, `target_pct_snapshot`), and request lines carry `forecast_qty` / `current_stock` from the same sources.

**Phasing (Part E):** Phase 1 (this task) = keep the current page/selector but preserve bucket + data integrity on every line. Phase 2 = T1/T2/T3 tabs (Draft / Pending Approval / Approved inside each). Phase 3 = Purchase Order Overview grouping assistant. UI tabs are **not** added in Phase 1; the data model already preserves bucket.

### 12.14 Decision layer vs Execution layer (finalized) + company-split storage note

- **Request Order Draft = Decision Layer.** All ordering decisions finish here: **Approved qty, KM/ResUS/ResTW company split, T1 vs T2+T3, schedule dates, tier cancel**. See §7.1.
- **Purchase Order Overview = Execution Layer.** It **inherits the approved request result** and handles execution info only (supplier / factory / payment / delivery dates). **PO Overview split/merge logic is PAUSED** — it must not re-decide T1/T2/T3 split/merge until an explicit future design. Request↔PO traceability → `request_order_po_links` (future).
- **Factory display** = `warehouses.warehouse_name`; **`warehouse_id` remains the source of truth** (shown only when no name exists; default Tier 1 = `WH-TW-CN-FACTORY-YOUXIN`).
- **Company-split storage:** the KM/ResUS/ResTW split is stored **two ways** — (1) denormalized per-line `km_qty` / `resus_qty` / `restw_qty` on `request_order_lines` (matched company = approved, others 0), and (2) the append-only **`request_order_line_sources`** rows (source of truth for company/site/month). Each `request_order_line` maps to **one company**. **Manual Allocation Mode (finalized):** re-allocating Approved to a company that has **no existing line** for a `(sku, bucket)` **automatically creates that company's `request_order_line`** (and its `request_order_line_sources` row) — one company = one line = one source, **no ratio allocation**, each company owns its own `approved_qty`. Full rule: **§13 Allocation Persistence Rules**.

### 3.5 `request_order_site_confirmations` (IMPLEMENTED — Fix 1)

Records per-site confirmation before Series aggregation (site-level review → confirm → Send Request). **DB-backed:** handler `16_request_site_confirmation_handlers.gs` (`upsertRequestOrderSiteConfirmations`), router action, `getRequestOrderSiteConfirmations` getter + `normalizeRequestOrderSiteConfirmationRecord`. Table auto-creates with the header below (missing-header safe). Records **approval only** — Confirm Site never creates `request_orders` and never moves stock.

| Column | Note |
|---|---|
| `site_confirmation_id` | PK (`SC-XXXXXXXXXX`) |
| `planning_cycle` | planning cycle (year of the bucket's month, e.g. `2026`) |
| `company` | (locked to the scope's company; `All` = every company) |
| `country` | (`All` = every country) |
| `marketplace` | (`All` = every marketplace) |
| `series` | (`All` = every series) |
| `bucket` | **`T1` / `T2` / `T3`** — the planning bucket confirmed (T1 = next month … T3 = +3) |
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

## 3.6 `shipping_allocation_drafts` / `shipping_allocation_draft_lines` (draft layer — spec only)

**Purpose:** persist the **Inventory Replenishment second-layer** Shipping Allocation / Execution Plan (user input **or** AI suggestions) so a page reload does not lose the working draft. **This table does NOT reserve stock and does NOT deduct stock.** Only **Submit Plan** creates formal `shipping_plans` / `shipping_plan_lines` (Decision Layer). It is a *planning scratchpad*, not an execution record.

**`shipping_allocation_drafts` (header):**

| Column | Note |
|---|---|
| `allocation_draft_id` | PK |
| `source_page` | origin (e.g. `inventory_replenishment`) |
| `company` · `country` · `marketplace` · `sku` | scope grain |
| `plan_month` | planning month `YYYY-MM` |
| `target_window` | target-days / window label (display only) |
| `source_type` | `manual` / `ai_suggested` |
| `status` | `draft` / `site_confirmed` / `submitted` / `cancelled` |
| `created_by` · `created_at` · `updated_by` · `updated_at` · `note` | audit + note |

**`shipping_allocation_draft_lines`:**

| Column | Note |
|---|---|
| `allocation_line_id` | PK |
| `allocation_draft_id` | FK → header |
| `route_no` | route sequence within the draft |
| `ship_from` · `destination` | route endpoints |
| `qty` | allocated qty (planning only — no movement) |
| `allocation_method` | how the qty was derived (tag; no formula in this task) |
| `source_factory_warehouse_id` | factory pool reference |
| `available_stock_snapshot` | available stock at draft time (snapshot, not a live reservation) |
| `note` · `created_at` · `updated_at` | audit + note |

**Status enum:** `draft` / `site_confirmed` / `submitted` / `cancelled`. **Not implemented in this task (spec only).**

## 3.7 `request_order_allocation_drafts` / `request_order_allocation_draft_lines` (draft layer — implemented)

**Purpose:** persist the **Request Order page second-layer** Order Allocation (T1/T2/T3 editable draft) **before Send Request**, so user edits survive a reload and become the **source for Request Order Draft creation**. **No stock movement / reservation.**

**Buckets:** **T1 = next month, T2 = next two months, T3 = next three months.** Each month can be pushed independently. **No calculation formula in this task** (Suggested/Recommended are placeholders or `--`).

**`request_order_allocation_drafts` (header):**

| Column | Note |
|---|---|
| `request_allocation_draft_id` | PK |
| `planning_cycle` | planning cycle (e.g. `2026`) |
| `company` · `country` · `marketplace` · `sku` · `category` · `series` | scope grain |
| `status` | `draft` / `site_confirmed` / `submitted` / `cancelled` |
| `source_type` | `manual` / `ai_suggested` |
| `created_by` · `created_at` · `updated_by` · `updated_at` | audit |
| `submitted_by` · `submitted_at` | set when Send Request submits the draft |
| `note` | free text |

**`request_order_allocation_draft_lines`:**

| Column | Note |
|---|---|
| `request_allocation_line_id` | PK |
| `request_allocation_draft_id` | FK → header |
| `request_month` | the pushed month `YYYY-MM` |
| `request_bucket` | `T1` / `T2` / `T3` |
| `recommended_qty` | placeholder (no formula) |
| `order_qty` | **editable** user order qty (drives Request Order Draft line) |
| `carton_qty` · `units_per_carton` | carton math inputs (snapshot; may be blank) |
| `factory_stock_snapshot` · `site_stock_snapshot` · `third_party_stock_snapshot` | stock snapshots at edit time |
| `fc_qty_snapshot` · `target_pct_snapshot` | forecast + target% snapshots (display) |
| `allocation_method` | tag (no formula) |
| `note` · `created_at` · `updated_at` | audit + note |

**Status enum:** `draft` / `site_confirmed` / `submitted` / `cancelled`.

**Wiring (this task):** Apps Script `getRequestOrderAllocationDrafts` (read via `getOperationDb`), `upsertRequestOrderAllocationDraft`, `upsertRequestOrderAllocationDraftLines`, `submitRequestOrderAllocationDrafts`; adapter `KM.DB.getRequestOrderAllocationDrafts()` / `getRequestOrderAllocationDraftLines()` / `upsertRequestOrderAllocationDraft()` / `upsertRequestOrderAllocationDraftLines()` / `submitRequestOrderAllocationDrafts()`. **Send Request** reads eligible (`draft` / `site_confirmed`) lines with `order_qty > 0`, creates `request_orders` / `request_order_lines` via the existing `createRequestOrderDraft` handler (grouped by series + supplier/factory when available; else series with supplier/factory = `--`/pending), then marks the allocation drafts `submitted`. **Demo Mode:** in-memory only (no DB writes; clearly labelled).

## 3.8 `request_order_line_sources` — **FINAL schema (company/site/month source breakdown)**

**Purpose:** the **append-only** company / site / month **source-of-truth breakdown** behind each request line. Read by the **Company Allocation popup** (Request Order Draft → SKU In Total → click a KM/ResUS/ResTW value). **This is the source-detail table — it MAY keep snapshot fields (forecast / stock / on-the-way / etc.); those must NOT be re-added to `request_order_lines` (§3.2).**

**PK standardized to `request_order_line_source_id`** (the legacy name `line_source_id` is retired; a physical legacy column may be dual-read, never the canonical key).

**Final columns (canonical):**

| Column | Note |
|---|---|
| `request_order_line_source_id` | **PK** (standard; replaces `line_source_id`) |
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

**Rules (finalized):**
- **One company = one `request_order_line_source`** for each `request_order_line` (mirrors the one-company-per-line rule, §3.2 / §13).
- **`approved_qty` MUST equal** the matching `request_order_lines.approved_qty` for the **same company + sku + bucket** — **no ratio allocation**.
- **Sync on Save / Submit / Convert to PO** (same decision qty; snapshot fields never overwritten by sync).
- **Cancelled request lines must NOT update source rows** (§13.4 / §G).
- **`tier_type` / `source_bucket`** both store the `T1`/`T2`/`T3` source bucket (kept in sync). `site_sku` is populated from `marketplace_skus` / `sku_regional_details` when resolvable.

**Status:** write + read implemented (`handleCreateRequestOrderDraft_` appends one row per line; adapter `KM.DB.getRequestOrderLineSources()` + `normalizeRequestOrderLineSourceRecord`). The Company Allocation popup shows real source rows and falls back to `request_order_lines` grouped by company (**"Site-level source pending."**) for legacy requests. *(Doc standardizes the PK + full column set; runtime header reconciliation is a runtime-phase follow-up — no code change in this task.)*

---

## 13. Allocation Persistence Rules (official architecture rule)

This is a **foundational architecture rule** for the whole procurement/supply chain layer. It governs how company allocation is persisted and synchronized, and is the basis for **Shipment Allocation**, **Purchase Orders**, and **Factory Allocation**.

### 13.1 Company-based persistence

Request Order persistence is **Company-based**. Primary identity:

```
request_order_id + company + sku + tier   (tier = request_bucket: T1 / T2 / T3)
```

- **One Company = one `request_order_line`.**
- **One Company = one `request_order_line_source`.**
- Each `request_order_line` carries exactly **one** `company`; its `km_qty` / `resus_qty` / `restw_qty` place `approved_qty` on the matched company column (others `0`, never blank).

### 13.2 Manual Allocation Mode

- When a company row **does not exist** for a `(request_order_id, sku, tier)`, the system **automatically creates it** (both the `request_order_line` and its `request_order_line_source`).
- **No ratio allocation.** Quantities are never split proportionally.
- **Each company owns its own `approved_qty`** — the row total (Approved) must equal the sum of the per-company allocations (`km_qty + resus_qty + restw_qty`), validated before Save/Submit.

### 13.3 Synchronization rule

```
request_order_line_sources.approved_qty  MUST ALWAYS EQUAL  request_order_lines.approved_qty
        for the same  Company + SKU + Tier
```

- Synchronization runs the **same decision quantity** into both tables in parallel — **no ratio, no proportional distribution**.
- Only `approved_qty` (+ `updated_at`) is synchronized; **snapshot fields on `request_order_line_sources`** (forecast_qty / current_stock / on_the_way_qty / shortage_qty / reallocation_qty / recommended_qty / requested_qty / source_month / source_bucket / source_priority / site_sku / marketplace_product_id) are **never** overwritten by sync.
- **Synchronization occurs on:** **Save** · **Submit** · **Convert to PO**.

### 13.4 Cancelled-line immutability (terminal — official)

**`request_order_lines.line_status = cancelled` is TERMINAL and immutable.** Once cancelled (records `cancelled_by` / `cancelled_at` / `cancel_reason`, §3.2):
- **Save must NOT overwrite** cancelled lines (no qty / date / status / company-split change).
- **Submit must NOT reactivate** cancelled lines — Submit **ignores** them (no re-status, no re-stamp).
- **Approve must NOT approve** cancelled lines — they are skipped.
- **Convert to PO EXCLUDES** cancelled lines (never copied into the PO snapshot, §15).
- **`request_order_line_sources` sync IGNORES** cancelled lines (their source rows are not updated).
- Excluded from company-split validation and from `total_sku` / `total_qty` / `total_cartons` totals.
- **Rows remain in the DB for audit** — never deleted.
- **Restore** (if ever needed) must be a **future explicit, audited action** — never automatic.

### 13.5 Downstream foundation

This rule is the **foundation** for:
- **Shipment Allocation** — company-owned quantities flow to shipment allocation without ratio splitting.
- **Purchase Orders** — the PO company-split snapshot (`purchase_order_lines.km_qty / resus_qty / restw_qty`, §3.4) is captured per company from the synchronized request source.
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

**Phase 1 — UI + mapping + DB handler foundation. API-ready. No auto-procurement engine, supplier API, payment flow, or formal document generation.**

**End of Document**
