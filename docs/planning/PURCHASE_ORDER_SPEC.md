# Purchase Order v2 — Spec (Execution Layer, Card architecture)

**Status:** 🟡 Documentation First — **finalized design, runtime NOT built** (Discuss → Spec → DB Mapping → Runtime; this task is Spec + DB Mapping only)
**Last Updated:** 2026-07-08
**Maintained By:** Development Team
**Related:** [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) (Procurement Layer Phase 1 — §6 PO status flow, §7.2 Overview, §7.3 List, §7.4 Total SKU Rule, §13 Allocation Persistence Rules), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) (§7.3 `purchase_orders`, §7.4 `purchase_order_lines`, §7.5A/§7.5B rules), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`TEMPLATE_UI_STANDARD_SPEC.md`](./TEMPLATE_UI_STANDARD_SPEC.md)

> **Documentation First.** This document defines the finalized **Purchase Order v2** architecture so the spec, DB naming, and DB mapping are aligned **before** any runtime/UI is written. **No runtime, handler, adapter, or UI is implemented in this task.** The authoritative status-flow / closure rules remain in `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §6; this spec details the **page architecture** (Overview cards + List) and the **naming / counting / persistence** standards.

---

## 1. Positioning

- **Purchase Order = Procurement Commitment / Execution Layer.** It **inherits the approved Request Order result** and handles execution info only: supplier / factory / production timeline / payment / delivery dates / **receiving**.
- **PO Workspace does NOT re-decide split/merge.** All ordering decisions (approved qty, KM/ResUS/ResTW company split, T1 vs T2+T3, schedule, cancel) are finalized in **Request Order Draft = Decision Layer** (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §7.1 / §12.14). Split/merge in PO Workspace is **paused** until an explicit future design.
- **Immutable Flow:** `Request Order` → **copy** → `Purchase Order`. PO **never writes back** to `request_orders` (except the one-time `request_orders.status = converted_to_po` marker set on the request side at conversion).

### 1.1 Page Roles (renamed — conceptual; files NOT renamed yet)

Two PO pages, re-scoped by role. **This is a documentation rename only** — the runtime files (`purchase-order-overview.*`, `purchase-order-list.*`) keep their current names until a later runtime task.

| New conceptual role | Was called | Current file(s) | Purpose |
|---|---|---|---|
| **Purchase Order Workspace** | Purchase Order Overview | `purchase-order-overview.{js,html}` | Active **management / execution / receive** workspace — expandable cards grouped by **Draft / In Production / Completed**; where a PO is saved, sent, updated, and **received**. |
| **Purchase Order Overview** (a.k.a. **PO Remaining Overview**) | Purchase Order List | `purchase-order-list.{js,html}` | Read-oriented **order remaining / production-status** table (PO-oriented, one row per PO, expandable to SKU lines); where **completed / historical** POs are primarily viewed and where future **Shipment allocation** reads PO remaining/completed state. |

- **Workspace = act on live POs** (Draft → In Production → receive to Completed). **Overview = view remaining/completed state** across all POs.
- **Completed POs leave the Workspace active view** and are primarily browsed from the **PO Overview / Remaining Overview** (§4B).

---

## 2. Purchase Order DB Naming & Final Schema (official)

**Canonical status + retired fields:**

| Deprecated (never written / recreated on `purchase_orders`) | Official DB field |
|---|---|
| `status` | **`order_status`** (canonical enum, §9 / RO&PO §6) |
| `expected_ready_date` | **`supplier_expected_ready_date`** |
| `confirmed_ready_date` | **`supplier_confirmed_ready_date`** |

- **`order_status` is canonical**; `status` is deprecated (read-fallback only for old rows). **No mixed naming anywhere.**
- **PO numbers:** **`po_no`** = canonical PO number (assigned at Send PO). **`km_po_no`** = KM-facing/internal PO number. **`purchase_order_no`** = retained full/legacy number (may equal `po_no`).
- **`order_date` = Send PO date** (not create date); **`created_at`** = system row-creation time.
- **`deposit_due_date` = `order_date` + 5 BUSINESS days** (weekends excluded; holidays deferred); stamped **at Send PO** with `order_date`, **blank at Convert**, **never from `created_at`**, stored date-only. Editable in the Workspace header modal; override-flag / auto-recalc deferred (§4B / RO&PO §3.3).
- **Supplier timeline fields** `supplier_expected_ready_date` / `supplier_confirmed_ready_date` are **supplier-specific, not globally required** (blank allowed); Workspace timeline may display `supplier_expected_ready_date`; doc generation may map `SUPPLIER_DATE_FULL` from it.
- **`request_bucket`** stored on the PO **header** (`T1` or `T2_T3`); PO **lines** keep the original `T1`/`T2`/`T3`.
- **`factory_id`** resolved from `request_orders.warehouse_id` via the warehouse master; **`warehouse_id`** = source ID; **factory display = `warehouses.warehouse_name`**.
- **Ready/completion date mapping (finalized):** `expected_completion_date` ← `request_order_lines.expected_ready_date` (by `request_order_id` + `request_bucket`); **`supplier_expected_ready_date` MIRRORS `expected_completion_date`** (canonical supplier-timeline name); **`supplier_confirmed_ready_date`** blank at creation, set on supplier confirmation / delay Update.
- **`total_sku` = `COUNT(DISTINCT sku)`** (never row count).
- **Distinct from the Request Order line schedule.** `request_order_lines.inspection_date` / `expected_ready_date` / `expected_ship_date` keep their names and are the mapping source.
- **Full final schemas:** `purchase_orders` → RO&PO §3.3; `purchase_order_lines` → RO&PO §3.4 (`product_name` removed; `km_qty`/`resus_qty`/`restw_qty`, `request_bucket`, `line_status` mandatory). Field-by-field **Convert to PO** mapping → RO&PO §15. Also `DATABASE_RELATIONSHIP_MAP.md` §7.3 / §7.4.

---

## 3. Purchase Order Workspace — Card architecture

**Purchase Order Workspace** (the page formerly titled "Purchase Order Overview" — §1.1) adopts the **same Card architecture as Request Order Draft** (`.sp-card`; `.sp-card-details` shown via `.is-expanded`). **Each Purchase Order is displayed as one expandable Card.**

### 3.1 Factory tab + selectors (top) — **linked**

- **Top Tabs = Factory:**
  - **CN侑鑫**
  - **TW勝一**
  - Each tab scopes the cards to that factory (`purchase_orders.factory_id` → fallback `warehouse_id` → `warehouses.warehouse_name`).
- **Top-right selectors:**
  - **Series**
  - **PO No** (`purchase_orders.po_no`)

**Linked-filter rule (official):** the factory tab and the right-hand selectors are **dependent**, not independent.
- When **CN侑鑫** is selected, the **Series** selector lists **only Series present on CN POs**, and the **PO No** selector lists **only CN POs**. Same for **TW勝一**.
- **Changing the factory tab re-derives (narrows) the Series / PO selectors from the new factory's POs** and **resets any now-invalid selection to "All"** (a selection that does not exist under the new factory must not silently persist).
- Selector options are always derived from the **current factory-scoped card set** — never a global list. Filtering (tab → selectors) applies **before** pagination (§5).

### 3.2 Card groups (below the selector) — **three lifecycle groups**

- **Draft** — PO **created but not sent** / production not started (`order_status = draft`).
- **In Production** — PO **sent/issued** and **waiting for production / receiving** (`order_status ∈ {issued, supplier_confirmed/confirmed, in_production, partial_completed}`).
- **Completed** — **all ordered_qty received/completed** (`order_status ∈ {completed, closure}`).

**Completed cards do NOT remain in the Workspace active list by default** (§4B). Completed / historical POs are primarily viewed from **PO Overview / Remaining Overview** (§1.1). (Cancelled = terminal; shown only when explicitly filtered, never mixed into active production.)

### 3.3 Card Header

**Display (left):**
- **PO No** — shown in a **lighter / normal weight** (not heavy-bold; it is an identifier, not a headline).
- **Order Date** (`order_date` = Send PO date; `created_at` fallback for un-sent drafts)
- **Series**
- **Supplier Expected Ready** (`supplier_expected_ready_date`)

> **Parent PO No is REMOVED from the card header display** (parent/version lineage still exists in DB via `parent_purchase_order_id`, but is not surfaced in the header). This declutters the header now that split/merge is paused.

**Right actions — by lifecycle group:**

| Group | Actions |
|---|---|
| **Draft** | **Expand · Save · Send PO · Cancel** |
| **In Production** | **Expand · Update · Receive** |
| **Completed** | (not in active Workspace list by default — §4B; when surfaced, read-oriented / **Update** only) |

- **Send PO** appears **only on Draft** cards (Draft → issue).
- **Receive** appears **only on In Production** cards and opens the **Receive modal** (§4A).
- **Update** (In Production / surfaced Completed) records execution changes via the append-not-overwrite rule (§3.4).

### 3.4 Update — append, never overwrite

**Update** records supplier / production execution changes:
- **Supplier delay**
- **Inspection update**
- **Ready date update** (`supplier_expected_ready_date` / `supplier_confirmed_ready_date`)
- **Ship date update**
- **Production Timeline edits** (`inspection_date` / `expected_completion_date` / `expected_ship_date`) — **only through Update, with a reason/note; no silent overwrite** (§4 Block 2).

**Rule: the system appends timeline history instead of silently overwriting.** Every Update **appends** a timeline-history entry (the prior value is preserved); a confirmed supplier date is never blind-overwritten. *(The history persistence table is future work; the append-not-overwrite behavior is the finalized rule.)*

---

## 4. Purchase Order Card Layout — four blocks

The expanded Card contains **exactly four blocks**.

### Block 1 — SKU Summary (**aggregated by SKU**)

**One row per distinct SKU** — company/bucket lines for the same SKU are **merged into a single visual row** (a PO may carry the same SKU across companies/buckets):

| Column | Source (aggregated per SKU) |
|---|---|
| **SKU** | `purchase_order_lines.sku` (group key) |
| **KM** | `SUM(km_qty)` per SKU |
| **ResUS** | `SUM(resus_qty)` per SKU |
| **ResTW** | `SUM(restw_qty)` per SKU |
| **Ordered** | `SUM(ordered_qty)` per SKU |
| **Completed** | `SUM(completed_qty)` per SKU |
| **Carton** | `SUM(carton_qty)` per SKU |

**Footer:** **Total SKU · Total Qty · Total Carton.**
- **Total SKU = `COUNT(DISTINCT sku)`** (§6 Total SKU Rule), **not** row count.
- Total Qty / Total Carton = summations over the PO lines.

**Rules:**
- **Same SKU rows merge visually** into one aggregated row (KM/ResUS/ResTW/Ordered/Completed/Carton are per-SKU sums).
- **Ordered qty is READ-ONLY once the PO exists.** A PO **does not allow order-qty edits after creation** — quantity decisions are finalized in the Request Order (Decision Layer). Block 1 is a **display/summary** table, not an editor.
- The retired columns **Shipped / Remaining** are not shown in Block 1 (remaining is tracked via the Receive flow / PO Overview; Block 1 focuses on the ordered-vs-completed production picture).

### Block 2 — Production Timeline

Displays the PO timeline **prefilled from the PO snapshot** (copied at Convert to PO):
- **Inspection Date** (`inspection_date`)
- **Expected Completion Date** (`expected_completion_date`)
- **Expected Ship Date** (`expected_ship_date`)
- **Outer Carton Lot** *(future)*
- **Nameplate Version** *(future)*

**Rules:**
- These three dates are **prefilled from the PO snapshot** and **can only change through the Update action, with a reason/note** (§3.4).
- **No silent overwrite** — every change appends a timeline-history entry (prior value preserved). `supplier_expected_ready_date` mirrors `expected_completion_date` at creation and is only re-set on supplier confirmation / delay Update.

### Block 3 — Factory Notes

- **Future attachment area** (placeholder — no runtime in this task).

### Block 4 — Factory Payment

- **Supplier**
- **Deposit**
- **Balance**
- **Total**
- **Payment Status**
- **Deposit Due Date** (`deposit_due_date` = `order_date` + 5 business days; display + editable via the header edit modal)

---

## 4A. Receive Flow (finalized)

**Receive** is available on **In Production** cards only (§3.3). It opens a **modal scoped to a single PO** and records production/receiving progress against that PO's lines.

> **Quantity definitions (authoritative — see also §4C):**
> - `ordered_qty` = PO ordered quantity.
> - `completed_qty` = received / production-completed quantity.
> - `shipped_qty` = already-shipped quantity.
> - **`remaining_qty` = `completed_qty − shipped_qty`** = **available-to-ship** quantity (NOT `ordered − completed`, NOT `ordered − shipped`).
> - **`unreceived_qty` = `ordered_qty − completed_qty`** = production still outstanding; **derived only in the Receive modal** (never stored).

### 4A.1 Receive modal — line columns

| Column | Source / definition |
|---|---|
| **SKU** | `purchase_order_lines.sku` |
| **Ordered Qty** | `purchase_order_lines.ordered_qty` (read-only) |
| **Completed Qty** | `purchase_order_lines.completed_qty` — already received/completed (read-only / **gray**) |
| **Unreceived Qty** | `ordered_qty − completed_qty` (read-only, derived — **not** `remaining_qty`) |
| **Receive Qty** | editable input; **defaults to Unreceived Qty** |

> Receive modal rows are **per `purchase_order_line`** (company/bucket granularity), so completed/unreceived stay accurate per allocation. (Block 1's SKU aggregation is a display view; receiving operates on the underlying lines.)

### 4A.2 Rules

- **Completed Qty** = the quantity already received/completed on that line; it is **read-only / gray** and can **never be re-received**.
- **Unreceived Qty** = `ordered_qty − completed_qty`.
- **Receive Qty defaults to Unreceived Qty**; the user may **partially receive** by entering `Receive Qty ≤ Unreceived Qty`.
- **Cannot receive more than `unreceived_qty`** (validation blocks `Receive Qty > Unreceived Qty`); **cannot re-receive** already-completed qty.
- **On confirm (per line):**
  - `completed_qty += receive_qty`
  - `remaining_qty = completed_qty − shipped_qty` (available-to-ship; clamp ≥ 0). **`shipped_qty` is not touched.**
- Confirm applies to the whole modal (all lines with a positive Receive Qty) as one PO update.

### 4A.3 Snapshot rule (Receive touches PO only)

- **Receive updates the Purchase Order ONLY** (`purchase_order_lines.completed_qty` / `remaining_qty`, and PO `order_status` / completion audit — §4B).
- **Do NOT mutate the Request Order** (`request_orders` / `request_order_lines`).
- **Do NOT mutate any Shipment.**
- **Shipment allocation will later CONSUME** the PO remaining/completed state (read-only) — it does not write back into the PO during receive. This preserves the Global Snapshot Architecture (§8B): each layer owns its own snapshot; downstream reads upstream, never mutates it.

---

## 4B. Receive Status Transition + Completed disappearance (finalized)

Driven by the receive result (aggregated across the PO's lines):

- **If every line `completed_qty ≥ ordered_qty`** (all ordered qty received):
  - `order_status = completed`
  - `completed_at` / `completed_by` populated **if available**.
  - The PO then **leaves the Workspace active list by default** (Draft / In Production view) and is **primarily viewed from PO Overview / Remaining Overview** (§1.1). Auto-`closure` still applies when all lines `remaining_qty = 0` (RO&PO §6.1).
- **If only partially received** (some but not all ordered qty completed):
  - `order_status = partial_completed`
  - The PO **stays in the In Production group** (partial_completed is an In-Production state — §3.2), showing updated Completed / Remaining so the next receive can continue.

**Completed = terminal for the Workspace active view:** a completed PO is not shown in the active Workspace list by default; it remains fully available (read + Update) from the PO Overview / Remaining Overview and via explicit status filtering.

---

## 4C. `purchase_order_lines` quantity definitions (authoritative)

| Field | Meaning | Formula |
|---|---|---|
| `ordered_qty` | PO ordered quantity | copied from `request_order_lines.approved_qty` at Convert; **read-only after creation** |
| `completed_qty` | received / production-completed quantity | `+= receive_qty` on each Receive (§4A) |
| `shipped_qty` | already-shipped quantity | set by the Shipment layer (not by Receive) |
| **`remaining_qty`** | **available-to-ship** (completed but not yet shipped) | **`completed_qty − shipped_qty`** (clamp ≥ 0) |
| `unreceived_qty` | production still outstanding | **`ordered_qty − completed_qty`** — **derived only in the Receive modal**; **never stored** |

- **`remaining_qty` is NOT `ordered_qty − completed_qty` and NOT `ordered_qty − shipped_qty`.** It is the quantity **available to ship** = `completed_qty − shipped_qty`, so the PO Remaining Overview and future Shipment allocation read a correct available-to-ship figure.
- **At Convert to PO:** `completed_qty = 0`, `shipped_qty = 0`, therefore **`remaining_qty = 0`** (no completed goods → nothing available to ship).
- **`unreceived_qty`** is a display/progress figure for the Receive modal and production tracking only; do not add it as a stored column or an Overview column in this scope.

---

## 5. Pagination

- **Purchase Order Workspace = 25 Cards per page.**
- Pagination is **identical to Request Order Draft**: filtering + factory tab + **linked** selectors (§3.1) apply **before** pagination; the page **resets to 1** on tab change / selector change / filter change / lifecycle-group change.

---

## 6. Total SKU Rule (official — global)

**`Total SKU = COUNT(DISTINCT sku)`, NEVER `COUNT(rows)`.**

- Applies **globally**: Request Order, Purchase Order (Overview card footer + List), Weekly Shipping Plan, Shipment Overview.
- Any DB field named **`total_sku`** (`request_orders.total_sku`, `purchase_orders.total_sku`, `shipments.total_sku`, …) follows this rule.
- Because one SKU may appear on multiple lines (per company / bucket / tier / route), row count over-counts. Distinct-SKU counting is the single source of truth for every "Total SKU" figure, card footer, and stored `total_sku` column.
- `Total Qty` / `Total Carton` remain summations; only the SKU **count** is distinct.

---

## 7. Purchase Order Overview / PO Remaining Overview (the page formerly "Purchase Order List")

Per the role rename (§1.1), the page previously called **Purchase Order List** is the **Purchase Order Overview / PO Remaining Overview** — a **human-readable PO remaining / production-status** table. It exists to show, at a glance: **PO remaining quantity, production status, and (future) shipment-allocation readiness**. It is where **completed / historical** POs are primarily viewed and where **Shipment allocation** will later read PO remaining/completed state. *(File stays `purchase-order-list.*` until a later rename task.)*

### 7.1 Main table — SKU rows visible, NO expand required

**The main table must NOT require expanding to see SKU lines.** The main dimension is the **PO**, but each PO's **SKU rows are shown directly underneath it**.

**Final main columns (9):**

| # | Column | Source (per SKU, within a PO) |
|---|---|---|
| 1 | **PO** | `purchase_orders.po_no` (link to Workspace / PO card); under it a **status badge** + **Ready Date** (`expected_completion_date`) |
| 2 | **Supplier / Factory** | `supplier_name` · `factory_id` → fallback `warehouse_id` → `warehouses.warehouse_name` |
| 3 | **Category** | `sku_details.category` (join by sku) |
| 4 | **Series** | `purchase_order_lines.series` → fallback `sku_details.series` |
| 5 | **SKU** | `purchase_order_lines.sku` |
| 6 | **Completed** | `SUM(completed_qty)` per SKU |
| 7 | **Shipped** | `SUM(shipped_qty)` per SKU |
| 8 | **Remaining** | `SUM(remaining_qty)` per SKU = **available-to-ship** (fallback `completed_qty − shipped_qty`, clamp ≥ 0) |
| 9 | **Note** | `purchase_order_lines.note` (fallback `--`) |

**Display / aggregation rules:**
- **Main dimension = PO**; **SKU lines are visible directly** under each PO (no expand needed as primary UX).
- **Visually merge / row-span** repeated **PO · Supplier/Factory · Category · Series** cells within the same PO group (do not repeat identical values line by line).
- **Aggregate the same SKU within the same PO into one row** — `completed_qty` / `shipped_qty` / `remaining_qty` are **summed** across that PO's lines for that SKU.
- **Do NOT show the company split (KM / ResUS / ResTW) on this overview.** Company split is meaningful at PO creation / Receive / allocation snapshot, but once shipments begin the company display can become misleading — so it is deliberately **not surfaced here**.
- **Remaining is visually clear:** `remaining = 0` → done (green); `remaining > 0` → active/pending.
- **The PO column is rendered ~25% narrower** (compact identifier column) versus the earlier layout.

### 7.2 Tabs

- **`draft` POs are NEVER shown on this page.** This page is the **PO Remaining / historical overview**; Draft POs belong **only** to the **Purchase Order Workspace** (§3). Draft is excluded before tab-split / pagination, and remains excluded even if the Status filter is set to `draft`.
- **In Production:** `issued` · `supplier_confirmed` · `in_production` · **`partial_completed`**.
- **Ready / Completed:** `completed` · `partial_shipped` · `shipped` · `closure`.
- **Cancelled:** **hidden by default**; shown **only when the Status filter explicitly selects `cancelled`** (never mixed into active production).

### 7.3 Filters

**Date · Status · Supplier (dropdown) · Category (dropdown) · Series (dropdown) · SKU (free text) · Search / Reset.**
- **Supplier / Category / Series dropdown options are derived from the current PO data** (not a global master list).
- **Filtering applies BEFORE tabs + pagination.** Page **resets to 1** on any filter / tab change.

### 7.4 Order Gantt panel (collapsible — between filters and main table)

A **collapsible "Order Gantt" panel** sits **between the filter bar and the main table**. **Default collapsed / collapsible.**

- **X axis = timeline** (date range derived from the **visible** POs' dates).
- **Y axis = PO No** (one lane per PO).
- **One bar/marker per PO** spanning its schedule from `inspection_date` → `expected_completion_date` → `expected_ship_date` (whichever are present).
- **Hover tooltip** shows: **(a) PO No · (b) SKU list · (c) per-SKU qty · (d) `expected_completion_date` · (e) `order_status`.**
- **Same filters + tabs as the main table** (the Gantt renders the same filtered PO set).
- **Runtime MVP:** a simple HTML/CSS timeline is acceptable — **no external library** required unless one is already present. If the full bar rendering is too large for one pass, ship the **collapsible panel + data assembly** and clearly mark the bar rendering as MVP/placeholder — **do not fake a completed Gantt**.

### 7.5 Pagination

**Paginate by PO group — 25 PO groups per page** (not by SKU row). Filters + tabs apply before pagination.

Full page spec mirror: `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §7.3.

---

## 8. Allocation Persistence (foundation)

Purchase Orders inherit the **Allocation Persistence Rules** (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §13 / `DATABASE_RELATIONSHIP_MAP.md` §7.5B):

- **Company-based** identity (`request_order_id + company + sku + tier`); **one Company = one line = one source**.
- **No ratio allocation** — each company owns its own `approved_qty`; the PO company-split snapshot (`purchase_order_lines.km_qty / resus_qty / restw_qty`) is captured **per company** at PO creation (RO&PO §3.4), so the commitment layer never recomputes the Request source.
- **Sync** (`request_order_line_sources.approved_qty == request_order_lines.approved_qty` for the same Company + SKU + Tier) occurs on Save · Submit · **Convert to PO**.
- **Cancelled lines are immutable** and never converted (RO&PO §13.4).

---

## 8A. PO Snapshot Rule (official)

**A Purchase Order is an Execution / Commitment Snapshot.** At **PO creation (Convert to PO)**, the approved Request Order data is **copied** into `purchase_orders` / `purchase_order_lines`. After creation the PO **owns** its execution data.

**Copied at creation (summary — full field-by-field table in RO&PO §15):**

| Request Order source | PO snapshot target |
|---|---|
| `request_order_id` | `purchase_orders.request_order_id` / `purchase_order_lines.request_order_id` (traceability) |
| `request_order_line_id` | `purchase_order_lines.request_order_line_id` (traceability) |
| `request_bucket` group → `T1` / `T2_T3` | `purchase_orders.request_bucket` (header); original `T1`/`T2`/`T3` on `purchase_order_lines.request_bucket` |
| `company` | `purchase_order_lines.company` (+ header `company`) |
| `sku` / `series` / `factory_item_no` / `factory_item_name` / `supplier_warehouse_id` | same on `purchase_order_lines` |
| **`approved_qty` → `ordered_qty`** (+ `approved_qty` audit) | `purchase_order_lines.ordered_qty` / `approved_qty` |
| `km_qty` / `resus_qty` / `restw_qty` / `recommended_qty` / `requested_qty` | same on `purchase_order_lines` (company snapshot — mandatory) |
| `line_status` | `purchase_order_lines.line_status` (mandatory) |
| `supplier_id` / `supplier_name` | `purchase_orders` + `purchase_order_lines` |
| `warehouse_id` (+ `warehouses`) | `purchase_orders.warehouse_id` → `factory_id` / factory display |
| `expected_ready_date` | `purchase_order_lines.expected_completion_date`; header `expected_completion_date`; **`supplier_expected_ready_date` mirrors it** |
| `inspection_date` / `expected_ship_date` | same on `purchase_order_lines` + header |
| `unit_cost` / `currency` / `carton_qty` / `units_per_carton` | same on `purchase_order_lines` |
| `note` | `purchase_order_lines.note` |
| *(derived)* | `completed_qty=0`, `shipped_qty=0`, **`remaining_qty=0`** (= `completed_qty − shipped_qty`; NOT `ordered_qty` — no completed goods means no available-to-ship qty), `line_amount=ordered_qty×unit_cost`; header `total_sku=COUNT(DISTINCT sku)`, `total_qty=Σ ordered_qty`, **`total_cartons=Σ carton_qty`**, `subtotal_amount=total_amount=Σ line_amount` |

**Rules:**
- `product_name` is **not** stored on `purchase_order_lines` (join `sku_details` for display only).
- **Execution quantity = `ordered_qty`** (= `request_order_lines.approved_qty` at Convert); **`km_qty + resus_qty + restw_qty` must equal `ordered_qty`**. **`requested_qty` / `approved_qty` / `recommended_qty` on `purchase_order_lines` are AUDIT SNAPSHOT fields only** — lineage, **not** used for execution / receiving / remaining / shipment allocation, and not read by runtime. Columns retained (no removal without an explicit later decision).
- **`total_cartons` = Σ `purchase_order_lines.carton_qty`** — written at Convert and kept in sync by PO totals recalculation (alongside `total_sku` / `total_qty` / `total_amount`).
- **Factory item fields** (`factory_item_no` / `factory_item_name` / `factory_item_unit`, and `unit_cost` when sourced) should resolve from the planned **`factory_price_list`** (Factory Cost/Source Master — `DATABASE_RELATIONSHIP_MAP.md` §7.7) when generating PO lines / documents; the PO line still **snapshots** them at Convert. **Sensitive factory costs live in `factory_price_list`, never in `sku_details`.**
- The PO must **not live-read** the Request Order for execution data; later Request edits **do not mutate** an existing PO.
- The PO keeps `request_order_id` / `request_order_line_id` **only for traceability** (lineage, not recomputation); it **owns** its execution fields and **never recalculates** request allocation.
- **PO export uses the PO snapshot only** (never a live Request join).
- **Cancelled Request lines are excluded** (Convert to PO copies non-cancelled lines only — RO&PO §13.4). **T1 vs T2+T3 split** per RO&PO §15.1.
- **Snapshot Completeness (RO&PO §14.1):** the PO must contain everything needed to execute independently.

## 8B. Global Snapshot Architecture Principle

The PO Snapshot Rule is one link in the system-wide principle **"each layer copies upstream data into its own snapshot when it commits"**: `Forecast / Planning → Request Snapshot → PO Snapshot → Shipment Snapshot → History`. Downstream layers do not live-join upstream for historical execution truth; master-data joins are display-label only. Full statement: `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §14 / `DATABASE_RELATIONSHIP_MAP.md` §7.5C.

## 8C. Document Generation / Export (reference)

Purchase Order export / document generation uses the **Document Generation System** ([`DOCUMENT_GENERATION_SYSTEM_SPEC.md`](./DOCUMENT_GENERATION_SYSTEM_SPEC.md)):
- **PO export uses the PO Snapshot only** (`purchase_orders` + `purchase_order_lines`); it never live-reads the Request Order (§8A). Product display joins `sku_details` for **labels only**.
- **PO template mapping** (token → field, scalar + `LINE_ITEMS` collection) lives in **`document_template_fields`** (`document_type = PURCHASE_ORDER`, `related_entity_type = purchase_order`; line collection = `purchase_order_lines`).
- **PO generated files are recorded in `generated_documents`** (append-only history; generation never mutates the PO).
- **PO export runtime is NOT implemented** (deferred to Export Center).

## 9. Status Flow (reference)

The authoritative PO status enum, **official lifecycle**, and Closure rule live in `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §6 / §6.0 / §6.1:

```
Draft → Issued / Sent PO → Supplier Confirmed → In Production
      → Partial Completed → Completed → Partial Shipped → Shipped → Closure     (Cancelled = terminal)
```
DB enum: `draft · issued · in_production · partial_completed · completed · partial_shipped · shipped · closure · cancelled`.
- The Overview **Draft / Completed** groups (§3.2) are the card-grouping view over this enum (Draft group = pre-completion states; Completed group = completed/closure). Detailed per-state actions remain in §6.
- **Cancelled = terminal:** a cancelled PO cannot be updated by the normal execution flow; any future restore is explicit + audited.

---

## 10. Non-Goals (this task)

Runtime / UI implementation · **Receive flow runtime** (modal + `completed_qty`/`remaining_qty` write + receive-driven status transition) · Apps Script handlers · API adapter changes · timeline-history persistence table · payment settlement · Outer Carton Lot / Nameplate Version data · Import/Export Center · split/merge in PO Workspace · **file renames** (page-role rename is conceptual/documentation only — §1.1) · Shipment consumption of PO remaining · Role & Permission. **Documentation only — no runtime files changed.**

---

**Purchase Order v2 — finalized design. Documentation First. No runtime implemented.**

**End of Document**
