# Supply Chain System Flow

**Status:** 🟡 Draft v1.2 — Architecture Specification (documentation only)
**Last Updated:** 2026-07-03
**Maintained By:** Development Team
**Related:** [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) (**authoritative architecture language**), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) (calculation logic), [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md) (Decision Layer / Submit Plan write contract), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), `assets/specs/active/SKU_MASTER_FLOW.md` (SKU/marketplace/pricing creation)

> This document defines the **operational supply chain flow** — the sequence of pages, actions, and records across Kitchen Mama's weekly supply cycle. It is **not** a formula specification; detailed shortage/surplus/order math lives in `SUPPLY_PLANNING_CALCULATION_RULES.md`. No code changes. No DB changes.

> **Update (2026-06-29):** Added the **Core Architecture Philosophy — Three-Layer Separation** (§2A: Analysis recalculates · Decision preserves planning · Execution preserves records · never mixed), the **Immutable Flow Principle** (downstream inherits/copies upstream, never mutates it), the **Single Source of Truth by layer** table, and the explicit **Decision Layer chain** (§5.1) — Inventory Replenishment → Submit Plan → Weekly Shipping Plan (Draft → Pending Approval → Approved) → Shipment Draft → Shipment Overview. Inventory Replenishment = **Analysis Layer**, Weekly Shipping Plan = **Decision Layer**, Shipment Draft/Overview = **Execution Layer**. The `shipping_plans` / `shipping_plan_lines` write contract (incl. six-value group key, `plan_version`, `submit_batch_id`, line-level snapshots) is defined in [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md).

> **Update (2026-07-03):** Finalized the **Factory Stock Allocation → Shipping workflow** (§5.2), the **Allocation Rule** (§5.3 — existing inventory = shared pool; allocation recalculated weekly by FC Share; never permanently bound to a company), and the **Reserved Stock lifecycle** (§5.4 — Submit Plan moves nothing; Shipment Draft raises `reserved_stock`; Ship lowers `current_stock` and `reserved_stock`). `factory_stock_allocation_plans` is a **weekly planning snapshot only** — it does **not** move, reserve, or change ownership of inventory. Column purposes for `factory_stock_allocation_plans` are documented in [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §6.

---

## 1. Purpose

This document describes **how work flows through the system** end-to-end: from inventory replenishment calculation, through shipment planning and execution, to forecast review and order requests, and finally document generation.

It defines:
- The **layers** the system operates across (physical, planning, ownership, document).
- The **roles** of companies and factories.
- The **main weekly flow** (9 operational steps).
- The **persistence and document rules** that govern what becomes a saved record.

It intentionally does **not** define calculation formulas (see the calculation rules doc) or accounting/ERP behavior (future scope).

---

## 2. System Layers

Kitchen Mama's supply chain operates across four conceptual layers that run in parallel:

| Layer | Concern | Examples |
|-------|---------|----------|
| **Physical Supply Chain Flow** | Movement of goods | Factory production → factory stock → shipment → marketplace/3PL |
| **Planning / Forecast Flow** | What we expect & plan to move | Inventory Replenishment, FC Summary, Request Order |
| **Ownership / ERP Flow** | Who owns / bills / accounts for goods | Company demand routing, SO/AR/AP (future ERP) |
| **Document / Export Flow** | Paper trail & outputs | Shipment docs, PO/SO, Invoice, Packing List, carrier booking |

```
Planning / Forecast Flow   →  decides quantities & timing
        ↓
Physical Supply Chain Flow →  moves the actual goods
        ↓
Ownership / ERP Flow       →  records who owns/pays (future)
        ↓
Document / Export Flow     →  produces the paperwork
```

These layers are **separate**: a physical shipment can occur independently of how ownership/billing is recorded, and documents are generated from execution records, not from plans.

---

## 2A. Core Architecture Philosophy — Three-Layer Separation

> **The full, stable architecture principles are centralized in [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md)** (layer language, Decision Commit, Decision Snapshot, Snapshot Provenance, Immutable Flow, Truth Flow Principle, Single Source of Truth, Business Object Identity). The summary below is kept here for flow context; that file governs the definitions.
>
> **Every layer owns its own truth. Every downstream layer copies the upstream truth into its own snapshot — but downstream must never mutate upstream.**

> ### 🧭 The core architecture philosophy of the Kitchen Mama Supply Chain System
>
> 1. **Inventory Replenishment always RECALCULATES.** It is the Analysis Layer — it re-derives stock, sales, Days of Supply, and suggestions from the latest data every time. It owns no decision and no execution record.
> 2. **Weekly Shipping Plan always PRESERVES planning decisions.** It is the Decision Layer — at Submit Plan it **snapshots** the decision basis (stock, avg sales, days of supply, suggested qty, target days, method) and never silently drifts with live data afterward.
> 3. **Shipment always PRESERVES execution records.** It is the Execution Layer — it copies the approved plan as an execution snapshot and tracks the physical movement; it never recalculates planning.
>
> **These three layers must NEVER be mixed.**
> - Analysis must not be treated as a decision.
> - A decision must not be re-derived from live analysis after it is made.
> - Execution must not recompute the planning decision.

See [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md) for how the Decision Layer snapshots and preserves the plan, and [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) for how the Execution Layer copies (never recalculates) the decision.

### Immutable Flow Principle

> **Every downstream layer inherits the upstream layer, but never mutates it.**

```
Inventory Replenishment
        ↓
Weekly Shipping Plan
```
- Weekly Shipping Plan **may copy** live analysis data into a **Decision Snapshot**.
- Weekly Shipping Plan **must never mutate** Inventory Replenishment data.

```
Weekly Shipping Plan
        ↓
Shipment
```
- Shipment **may copy** approved Weekly Shipping Plan data into an **Execution Snapshot**.
- Shipment **must never mutate** the Weekly Shipping Plan decision.

This is the **Immutable Flow** principle: each layer reads/copies from upstream into its own frozen snapshot and owns only its own records; it never writes back into the layer above it.

The companion **Truth Flow Principle** states the direction of authority: *truth flows downstream, context flows with it, authority never flows back* (Shipment inherits Shipping Plan but never edits it; Shipping Plan inherits Inventory Replenishment but never edits it; Inventory inherits Amazon Runtime Data but never edits it). Both are defined authoritatively in [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) §5 / §5A — referenced here, not redefined.

### Single Source of Truth (by layer)

| Layer | Source of Truth |
|-------|-----------------|
| **Analysis** | Live inventory + forecast + sales source data |
| **Decision** | `shipping_plans` + `shipping_plan_lines` |
| **Execution** | `shipments` + `shipment_lines` |
| **Procurement** | `purchase_orders` + `purchase_order_lines` |
| **Documents** | `generated_documents` |

> **No new DB is required for this principle** — it is a discipline over the existing tables: read upstream, freeze a snapshot, own only your layer's records.

---

## 3. Company Roles

| Company | Role |
|---------|------|
| **KM** | Kitchen Mama — brand and operating entity |
| **ResTW** | Procurement and supply chain hub (central coordination) |
| **ResUS** | US operating entity |

**Rules:**
- **KM and ResUS generally place demand/order requests through ResTW.**
- **ResTW acts as the central procurement / production coordination hub.**
- Detailed **AR/AP / accounting is future ERP scope**, not current system scope.

```
KM   ──demand──▶ ResTW (procurement hub) ──orders──▶ Factories
ResUS ─demand──▶ ResTW
```

---

## 4. Factory Roles

| Factory | Name | Role |
|---------|------|------|
| **CN_YOUXIN** | 東莞侑鑫 | Manufacturer / factory stock pool |
| **TW_SHENGYI** | 南投勝一 | Manufacturer / factory stock pool |

- Factories are **production resources, not company entities**.
- Factory stock is a **shared pool**; allocation to companies is a planning concern (see FC Share in the calculation rules doc).

---

## 5. Main Weekly Supply Flow

```
1. Inventory Replenishment ─▶ 2. Factory Stock / PO Validation ─▶ 3. Shipping Plan (Draft→Approval)
        ─▶ 4. Formal Shipment Creation ─▶ 5. Shipment On The Way ─▶ 6. Shipping History
   (parallel/periodic) 7. FC Summary Monthly Review ─▶ 8. Request Order / 下單系統 ─▶ 9. Export / Document Center
```

### 5.1 Decision Layer chain (Inventory Replenishment → Weekly Shipping Plan → Shipment)

The shipment-planning portion of Steps 1, 3, and 4 forms a three-layer chain. Weekly Shipping Plan is the **Decision Layer** that sits between inventory analysis and shipment execution:

```
Inventory Replenishment  (Analysis Layer — what the data says / suggests)
   ├─ Recommendation Summary  (system suggestion: Target Window / Suggested Qty / Route / Reason — READ-ONLY, never submitted)
   └─ Execution Plan          (PM's actual routes: Ship From / Destination / Suggested Qty / Shipping Method)
        ↓
Execution Plan Working Draft        (Temporary Decision — JS State + sessionStorage recovery;
                                     editable many times; creates NOTHING; "Shipping Allocation" = legacy name)
        ↓  Submit Plan = Decision Commit   (reads ONLY the Execution Plan; group by six-key; the ONLY creator of plans)
Weekly Shipping Plan — Draft        (Decision Layer; editable Shipping Qty)
        ↓  Submit for approval
Pending Approval                    (read-only; Manager → COO; Reject requires reason → back to Draft)
        ↓  Approve
Approved                            (read-only)
        ↓  Execution Commit  (Approved → Create Shipment Draft; copies Execution Snapshot)
Shipment Draft                      (Execution Layer; shipments.status = draft)
        ↓  Done  (Decision Layer Completion — plan leaves Active view; row preserved)
Weekly Shipping Plan Completed      (Decision Layer finished; completed_at set)
        ↓
Shipment Lifecycle                  (Execution Layer: Draft → Booked → Ready to Ship → Shipped → In Transit → Arrived → Received → Closed)
        ↓
Settlement Layer                    (final immutable records: documents / audit / KPI)
        ↓
History                             (Shipment History / Shipping History)
        ↓
Documents                           (Invoice / Packing List / Commercial Invoice / POD / generated_documents)
```

> **Four-layer lifecycle (Supply Chain Architecture v1.2):** Analysis → Decision → Execution → **Settlement**. **Decision Layer Completion (Done)** marks the plan Completed (`shipping_plans.completed_at`) — it is independent of the shipment lifecycle and does not change any shipment status. See [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) §10–§12.

**Execution Layer scope:** **Shipment Draft, Shipment Overview, and Shipping History all belong to the Execution Layer.** After **Execution Commit** they read/copy the Decision Snapshot into the **Execution Snapshot** and **must NOT recalculate the Decision** (Current Stock / Avg Sales / Days of Supply / Suggested Qty / Target Days / FC / Event context are copied, never re-derived). See [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) §3A (Execution Commit) + §4A (Execution Snapshot).

> **Phase 2 menu/pages (current).** The left menu groups **Shipment Center → Weekly Shipping Plan (Decision Layer) / Shipment Draft / Shipment Overview (Execution Layer)** — grouping only, not a layer merge.
> - **Shipment Draft = execution working area** (three sections: **Draft → Ready to Ship → Shipped**, `hidden_from_draft_at IS NULL`). Execution fields editable in Draft / Ready to Ship. **Save** updates fields only — it does **NOT** create history or enter Overview. **Ship** validates required fields (carrier, ETD, ETA, tracking-or-booking, totals) then `status = shipped` (+ `shipped_at` / `shipped_by`) — **only Ship makes a shipment official**. **Done** sets `hidden_from_draft_at` → the Shipped card leaves the Draft workspace (still in Overview; row never deleted).
> - **Shipment Overview = official shipped/history view**: shows only `shipped` / `in_transit` / `arrived` / `received` / `closed`; read-only fields; a per-card Advance → steps the post-ship lifecycle. `draft` / `ready_to_ship` never appear here.
> - Both pages read `shipments` / `shipment_lines`, **display Marketplace**, and show logistics + Decision Snapshot **read-only** (copied, never recalculated). **No factory-stock side effects** (deferred).

> **Overseas Inbound (planning input — spec [`OVERSEAS_INBOUND_SPEC.md`](./OVERSEAS_INBOUND_SPEC.md)):** an Inbound Draft created on **Overseas Stock** is a **planning input**, **not** a Shipment Draft. **Submit does NOT create a Shipment Draft directly — it creates a Weekly Shipping Plan + `shipping_plan_lines` (Decision Layer)**; only an **approved** plan advances to a Shipment Draft (existing Execution Commit). Overseas Stock (`overseas_inventory_snapshot`) is updated **only after the shipment is `received`** (via `overseas_inventory_movements`) — Submit/Approve never writes overseas available stock and never deducts `factory_stock`. Flow: `Overseas Stock → Inbound Draft → Submit to Weekly Shipping Plan → Pending Approval → Approved → Shipment Draft → Ship → received → Overseas Stock 入庫`. Planned design — not implemented.

- **Execution Plan Working Draft exists BEFORE Decision Commit** ("Shipping Allocation" = legacy name). It belongs to the **Analysis Layer / Temporary Decision** state — edited freely (ship-from / destination / qty / method per route), surviving collapse/expand and re-render via JS State + sessionStorage recovery. It **creates no `shipping_plans` / `shipping_plan_lines`** and **never updates** an existing Weekly Shipping Plan. The **Recommendation Summary** (system suggestion) is separate and **never submitted**. See [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) §8A and [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) §11.
- **Decision Snapshot begins only after Submit Plan.** **Submit Plan** writes `shipping_plans` + `shipping_plan_lines` and **snapshots the decision context** (Current Stock, Avg Sales/Day, Days of Supply, Suggested Qty, Target Days, Shipping Method, Inventory Snapshot Date) so the plan does not drift with daily inventory changes. See [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md).
- **Shipping Qty is editable only in Draft**; Pending Approval / Approved are read-only.
- **Immutable Flow:** every downstream layer **inherits/copies** the upstream truth into its own snapshot, but **never mutates upstream**. **Shipment does not recalculate planning** — it copies the approved plan as an execution snapshot (`SHIPMENT_CENTER_SPEC.md`). Plan-layer status (`draft / pending_approval / approved / rejected / cancelled`) is distinct from shipment execution status.

### 5.2 Factory Stock Allocation → Shipping workflow (finalized)

The finalized Factory → Shipping workflow. **Allocation is a planning snapshot only** — physical inventory is never moved, reserved, or re-owned by the allocation step.

```
Factory Stock / Overseas Stock
        ↓
Weekly inventory confirmation                 (manual now; future API)
        ↓
Calculate available stock allocation by FC Share
   (using fc_regular_forecast + target rules)
        ↓
Save allocation snapshot into
   factory_stock_allocation_plans             (NO inventory movement)
        ↓
Reflect allocated quantity to Inventory Replenishment
   (CN / TW available quantity display)
        ↓
Submit Plan
        ↓
Weekly Shipping Plan
        ↓
Approval
        ↓
Shipment Draft
   (reserved_stock += shipment qty)
   (current_stock unchanged)
        ↓
Ship
   (current_stock -= shipment qty)
   (reserved_stock -= shipment qty)
        ↓
Shipment Overview
```

> **`factory_stock_allocation_plans` is ONLY a planning snapshot.** It does **NOT**:
> - move inventory
> - reserve inventory
> - change ownership
>
> It records *how much factory stock a planning cycle intends to make available by FC Share* — the physical `factory_stock` balance is untouched by allocation. Actual inventory effects happen only later at Shipment Draft (reserve) and Ship (deduct). Column-level purposes are in [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §6.

### 5.3 Allocation Rule (shared pool, recalculated weekly)

- **Existing inventory = Shared Pool.** Factory stock is one shared pool across companies (§4).
- **New purchase orders may carry intended-company information**, **but** factory allocation is **recalculated weekly** and is **not** bound to that company permanently.
- **Do NOT permanently bind factory inventory to a company.** Ownership/company intent is metadata, not a physical partition of stock.
- **Allocation always follows the FC Share calculation** (`fc_regular_forecast` + target rules). A new `allocation_version` each cycle lets recalculation happen **without losing historical plans**.

### 5.4 Reserved Stock Rule (inventory-effect lifecycle)

Inventory quantities change **only** at the Execution Layer — never at planning:

| Action | `current_stock` | `reserved_stock` |
|--------|-----------------|------------------|
| **Submit Plan** | unchanged | unchanged — **no inventory movement** |
| **Shipment Draft created** | unchanged | **+= shipment qty** (soft hold) |
| **Shipment shipped (Ship)** | **−= shipment qty** | **−= shipment qty** (hold released as goods leave) |

- **Submit Plan / Weekly Shipping Plan / Approval move nothing** — they are Decision Layer records.
- **Reserve happens at Shipment Draft**, **deduction happens at Ship** — consistent with the Execution Layer owning all physical inventory effects (§2A).

### 5.5 Procurement lifecycle (finalized)

The finalized Request Order → Purchase Order chain. Draft layers are **editable recommendation scratchpads** (no procurement commitment); official records begin only at **Send Request** / **Approve**.

```
Recommendation Engine
        ↓
request_order_allocation_drafts
request_order_allocation_draft_lines      (editable recommendation — regenerable; no commitment)
        ↓  Send Request
request_orders
request_order_lines                       (OFFICIAL Request Order — created only on Send Request)
        ↓
request_order_line_sources                (every recommendation source per line — never deleted)
        ↓  Approve
purchase_orders
purchase_order_lines                      (Procurement Commitment)
        ↓
request_order_po_links                    (Request ↔ PO relationship; supports split/merge)
        ↓
Purchase Order Export Template            (ALWAYS from purchase_orders / purchase_order_lines)
```

**Rules:**
1. **`request_order_allocation_drafts` / `request_order_allocation_draft_lines`** — a **temporary, editable** recommendation **generated by the calculation engine**; **can be regenerated** at any time. No stock movement, no procurement commitment. (Persistence layer already documented — `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.7.)
2. **`request_orders` / `request_order_lines`** — the **official Request Order**, **created only after the user presses "Send Request"** (never auto-created from a draft).
3. **`request_order_line_sources`** — **the source of truth for company / site / month allocation detail**, storing **every recommendation source** that contributed to a request line: **FC, Inventory, Lead Time, Target Rules, Manual Adjustment, etc.**, plus **`tier_type` (T1/T2/T3)** and **`source_month` (YYYY-MM)**, and per-source `company` / `country` / `marketplace` / `requested_qty` / `approved_qty` / `shortage_qty` / `note`. Append-only, **never deleted**. **Read path is implemented** (surfaced in the Request Order Draft *Company Allocation* popup); the **write path is pending** — until it exists the popup falls back to `request_order_lines` grouped by company ("Site-level source pending"). Deprecated `request_order_lines` columns (`final_order_qty`, `forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `reallocation_qty`, `source_company_count`, `source_site_count`, `product_name`, `need_reason`, `related_entity_type`, `related_entity_id`) are **no longer source of truth** (kept for back-compat, not deleted).
4. **`request_order_po_links`** *(new — spec only)* — the **relationship table** between Request Orders and Purchase Orders. Supports **one Request → multiple POs**, **multiple Requests → one PO**, **supplier split**, **factory split**, and **future expansion**. (This is the many-to-many join; the legacy one-time `request_orders.status = converted_to_po` marker + copied `purchase_orders.request_order_id` remain valid for simple 1→1 traceability.)
5. **Purchase Order Export Template** — **always generated from `purchase_orders` / `purchase_order_lines`**, **never from a Draft** (Request Order / allocation draft). The template is an Execution/Commitment output, not a planning preview.
6. **T1 / T2 / T3 buckets are PRESERVED at the Request Layer** — `request_order_lines.request_bucket` (+ `request_month`) is set on every line and **never merged at the Request stage**. **T1/T2/T3 are demand buckets, NOT direct PO-grouping rules.** The **PO Layer may merge later** (T1 urgent PO / T2+T3 normal PO / custom supplier·factory·SKU·series grouping) via **`request_order_po_links`**. Send Request does not force three PO records. Full-carton qty is enforced before an order becomes official.
7. **Request Order Draft = Decision Layer; Purchase Order Overview = Execution Layer (finalized).** ALL ordering decisions — **Approved qty, company split (KM/ResUS/ResTW), T1 vs T2+T3, schedule dates, tier cancel** — are completed in **Request Order Draft**. **PO Overview inherits the approved result** and handles execution only (supplier / factory / payment / delivery dates); its **split/merge logic is PAUSED** and must not re-decide T1/T2/T3 until an explicit future design. Company split is stored as **one `request_order_line` per company** (`company` column); a structured `request_order_line_sources` company-split field remains spec-only. **Factory display = `warehouses.warehouse_name`; `warehouse_id` stays the source of truth** (default Tier 1 = `WH-TW-CN-FACTORY-YOUXIN`).

### 5.6 Shipment lifecycle (finalized)

The finalized Shipping Allocation → Shipment chain. Same discipline: draft = editable recommendation; official records begin at **Submit Plan** / **Approve**.

```
Recommendation Engine
        ↓
shipping_allocation_drafts
shipping_allocation_draft_lines           (editable recommendation — regenerable; no commitment)
        ↓  Submit Plan
shipping_plans
shipping_plan_lines                       (OFFICIAL Shipping Plan — created on Submit Plan)
        ↓  Approve
shipments
shipment_lines                            (OFFICIAL shipment — created after approval)
        ↓
shipment_events                           (complete shipment lifecycle log)
        ↓
Shipping Export Template                  (ALWAYS from shipments / shipment_lines)
```

**Rules:**
1. **`shipping_allocation_drafts` / `shipping_allocation_draft_lines`** — an **editable** recommendation **generated by the recommendation engine**; **can be regenerated**. No stock movement (planning scratchpad). (Documented — `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6.)
2. **`shipping_plans` / `shipping_plan_lines`** — the **official Shipping Plan**, **created after Submit Plan** (Decision Commit).
3. **`shipments` / `shipment_lines`** — the **official shipment**, **created after approval** (Execution Commit copies the approved plan as an execution snapshot).
4. **`shipment_events`** — the **complete shipment lifecycle log**, e.g. **Created / Approved / Booked / Loaded / Departed / Arrived / Custom Clearance / Delivered / Received / Cancelled**. Designed to **support future tracking integration** (carrier/API events append here).
5. **Shipping Export Template** — **always generated from `shipments` / `shipment_lines`**, **never from a Draft** (shipping-allocation draft / shipping plan draft).

> These two lifecycles are the **finalized** architecture for future implementation. `request_order_line_sources`, `request_order_po_links`, and `shipment_events` (as a full lifecycle log) are **documented, not yet implemented** — no schema/code change is made by this sync. Existing table names are unchanged; the Shipment Center execution behavior (`SHIPMENT_CENTER_SPEC.md`) is unchanged.

### Step 1 — Inventory Replenishment
- User selects **Country, Marketplace, Target Days**.
- System calculates current inventory, sales, forecast, factory stock, on-the-way, and **suggested replenishment**.
- **Recommendation Summary is a calculation preview only** (system suggestion; never submitted). The **Execution Plan** is the PM's actual plan that Submit Plan reads.
- A **persisted record starts only after Submit Plan**, which creates `shipping_plans` / `shipping_plan_lines`.
- **No separate `shipping_allocation` DB for MVP.**

### Step 2 — Factory Stock / PO Weekly Validation
- Factory users may review `factory_stock`, future purchase orders, and production schedule.
- Purpose: **verify stock and production availability before shipment planning**.
- Reduces the risk of submitting shipment details that factories cannot fulfill.
- **Weekly inventory confirmation** here feeds the **Factory Stock Allocation** step: available stock is allocated by **FC Share** and saved as a planning snapshot in `factory_stock_allocation_plans` (no inventory movement) — see §5.2–§5.4.

### Step 3 — Shipping Plan
- User reviews the **Draft** shipping plan.
- User can adjust **SKU qty, carrier, estimated cost, shipping method, notes**.
- **Submit** sends to approval.
- **Manager / COO can approve or reject with notes.**
- An **approved plan can be converted into a formal shipment**.

### Step 4 — Formal Shipment Creation
- **Formal Shipment is separate from Shipping Plan.** Shipping Plan = planning/approval; Shipment = actual logistics execution record.
- User fills `shipment_id` / `shipment_no`, `reference_id`, `warehouse_id`, and tracking / container / BL / invoice details as needed.
- **Header and line data are copied from `shipping_plans` and `shipping_plan_lines` as a shipment snapshot.**
- `shipments` / `shipment_lines` become the **source for documents and on-the-way visibility**.

### Step 5 — Shipment On The Way
- Reads `shipments` + `shipment_lines` + `shipment_events` + `shipment_routes`.
- Shows active in-transit status and **ETA buckets**.
- **On The Way is operational visualization, not a separate shipment DB.**

### Step 6 — Shipping History
- Reads `shipments` + `shipment_lines`.
- Historical table / search view of completed or all shipments.
- **No separate Shipping History DB.**

### Step 7 — FC Summary Monthly Review
- Monthly or periodic review of `fc_regular_forecast`.
- User can add/edit base forecast, special events, target rules.
- **Special event and target rules feed the future calculation engine.**
- **FC Summary is forecast management, not direct order execution.**
- **FC Summary does NOT create SKUs / FC base rows** (the "+ Add SKU" button is removed for data safety). SKU + FC base-row creation is owned by the **SKU Details / Inventory SKU flow** (and batch Import Forecast). See [`FC_SUMMARY_SPEC.md`](./FC_SUMMARY_SPEC.md) §1.1.
- **Special Event forecast** (`fc_special_events`) has two linked sources — **Campaign** (promotion source of truth) and **FC Summary direct** (supply-chain forecast source of truth) — joined by `campaign_id` / `campaign_sku_line_id`, never blind two-way synced. Event Flag = **Normal** creates no special-event row (baseline is `fc_regular_forecast`); Event Flag != Normal requires FC Qty. See [`FC_SUMMARY_SPEC.md`](./FC_SUMMARY_SPEC.md) §9–§10, §12.
- **FC Summary Special Event Builder v2** creates deal-priced events in **Single SKU** (≤8 rows) or **Category / Series** group-card mode (grouped by category + series + regular_price). Save target = `campaigns` → `campaign_sku_lines` → `fc_special_events`. Campaign / line writers are **PENDING** — live Save reports pending and writes nothing (no orphan `fc_special_events`, no fake success). See [`FC_SUMMARY_SPEC.md`](./FC_SUMMARY_SPEC.md) §9, §12.

### Step 8 — Request Order / 下單系統
- Existing page.
- Reads forecast, inventory, factory stock, on-the-way, warehouse stock.
- Calculates **shortage / surplus and final order need**.
- **Forecast shortage does NOT directly equal order qty.**
- Reallocation and order-need logic are defined in [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md).
- User can review, adjust, and send the request.
- Future output creates `purchase_orders` / `purchase_order_lines` and documents.

> **Procurement Layer Phase 1 (implemented — API-ready foundation):** the Procurement Center adds **Request Order Draft** (= Procurement Planning Draft; `request_orders` + `request_order_lines`; Draft / Pending Approval / Approved), **Purchase Order Overview** (= Procurement Commitment dashboard; `purchase_orders` + `purchase_order_lines`), and **Purchase Order List** (= PO operational list / history). **Immutable Flow:** `Shipment / Inventory / Factory Stock` → Request Order Draft → Purchase Order — downstream copies upstream, never writes back (PO ⇏ Request Order; Request Order ⇏ Shipment / Inventory / Factory Stock). No auto-procurement engine, supplier API, or payment flow in Phase 1. See [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md).

### Step 9 — Export / Document Center
- Future page / module. **Template Management is only a sub-tab.**
- Generated documents include:
  - 出貨明細 (shipment detail)
  - PO order
  - SO order
  - Invoice
  - Packing List
  - Carrier booking / 托單
- Uses `document_templates` and `generated_documents`.
- Advertising/sales reports may later use the same `generated_documents` pattern or a separate reporting module.

**Record creation summary:**

| Step | Reads | Writes (on explicit action) |
|------|-------|------------------------------|
| 1 Inventory Replenishment | inventory, sales, forecast, factory_stock | `shipping_plans`, `shipping_plan_lines` (on Submit Plan) |
| 2 Factory Stock / PO Validation | `factory_stock`, POs, production schedule | — (review only) |
| 3 Shipping Plan | `shipping_plans` / lines | status/approval updates |
| 4 Formal Shipment | `shipping_plans` / lines (snapshot) | `shipments`, `shipment_lines` |
| 5 On The Way | shipments, lines, events, routes | — (visualization) |
| 6 Shipping History | shipments, lines | — (read) |
| 7 FC Summary | `fc_regular_forecast` (+ events/targets) | forecast edits |
| 8 Request Order | forecast, inventory, factory, on-the-way | future `purchase_orders` / lines |
| 9 Document Center | `document_templates` | `generated_documents` |

---

## 6. Ownership Layer

- **Physical shipment flow and ownership/billing flow are separate.**
- Goods may be **produced by CN_YOUXIN or TW_SHENGYI**.
- **Operational demand may come from KM, ResTW, or ResUS.**
- **ResTW is the default procurement hub.**
- **Future SO/AR/AP accounting will be an ERP Phase**, not current MVP.
- `sales_orders` / `sales_order_lines` are **future scope**.

```
Physical:  Factory (CN_YOUXIN / TW_SHENGYI) ──▶ Shipment ──▶ Marketplace / 3PL
Ownership: Demand (KM / ResUS) ──▶ ResTW (hub) ──▶ [future SO/AR/AP — ERP]
```

> A single physical shipment does not, by itself, define ownership/billing. Ownership records (SO/AR/AP) are layered on later in the ERP phase and must not be assumed by the MVP execution records.

---

## 7. Data Persistence Rules

- **Calculation previews are not persisted unless the user submits.**
- **Recommendation Summary + Execution Plan preview does not require a DB in MVP** (the Execution Plan Working Draft lives in JS State + sessionStorage recovery only).
- **Approved plans become shipments through explicit user action** (Step 4), not automatically.
- **Shipments are historical snapshots** and **must not rely only on a `shipping_plans` join to reconstruct actual shipment state** — the snapshot (header + lines copied at creation) is the authoritative shipment record.

| Artifact | Persisted? | Trigger |
|----------|-----------|---------|
| Replenishment calculation | No | — (preview) |
| Recommendation Summary (system suggestion) | No | — (preview, never submitted) |
| Execution Plan preview / Working Draft | No | — (JS State + sessionStorage recovery, no DB in MVP) |
| `shipping_plans` / lines | Yes | Submit Plan |
| `shipments` / `shipment_lines` | Yes (snapshot) | Explicit "create shipment" |
| `generated_documents` | Yes | Document generation |

---

## 8. Document Generation Rules

- **Formal shipment can generate shipment-related documents** (出貨明細, Packing List, carrier booking / 托單, Invoice, etc.).
- **Request Order / PO can generate PO documents.**
- `generated_documents` stores **output file records** (the generated artifacts), produced from `document_templates`.

```
shipments / shipment_lines ──▶ shipment documents ──▶ generated_documents
purchase_orders / lines    ──▶ PO documents       ──▶ generated_documents
document_templates ─────────(template source)──────────┘
```

---

## 9. Non-goals

- **No accounting journal entries.**
- **No AR/AP automation.**
- **No email automation in MVP.**
- **No detailed formula implementation here** (see `SUPPLY_PLANNING_CALCULATION_RULES.md`).
- **No code.**

---

## 10. Open Items

- **Carton number automation rules** for Amazon / carrier docs.
- Future **`sales_orders` / `sales_order_lines`** (ownership/SO scope).
- **Exact shipment document templates** (layout/fields per document type).
- **Warehouse management UI**.
- **Permission / role model** (who can submit, approve, create shipment, generate documents).
- **Future ERP accounting layer** (AR/AP, journal, SO billing).

---

**Draft v1 Architecture Specification — subject to revision. Documentation only; no code or DB changes are implied by this document.**

**End of Document**
