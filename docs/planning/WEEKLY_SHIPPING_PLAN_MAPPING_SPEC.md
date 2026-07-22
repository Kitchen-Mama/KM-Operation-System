# Weekly Shipping Plan — Mapping Spec (Decision Layer)

**Status:** 🟡 Draft v1.12 — Mapping + Submit-Plan write contract (mapping spec; the v1.6–v1.12 UI/mapping fixes are recorded as implemented in the frontend/API/Apps Script per the changelog + project-current-state; any item not confirmed there requires runtime verification)
**Last Updated:** 2026-07-01
**Maintained By:** Development Team
**Authority / context (read, not overridden):** [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) (**authoritative architecture language — Decision Commit / Decision Snapshot / Immutable Flow / layer source-of-truth**), [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) (**authoritative for all formulas**), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md).

> **Spec only.** This document defines how a Submit Plan action in Inventory Replenishment becomes **Weekly Shipping Plan** records, the **`shipping_plans` / `shipping_plan_lines` column schema** (previously undefined — see the implementation-readiness audit), the plan status/approval flow, and the hand-off to Shipment Draft. It introduces **no** code, frontend, Apps Script, API, DB migration, or runtime change. Calculation formulas remain owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`; shipment execution remains owned by `SHIPMENT_CENTER_SPEC.md`.

> **Changelog:**
> - **Draft v1.12 (2026-07-01)** — **Execution Plan terminology (§2A/§3):** the pre-Submit Working Draft is now the **Execution Plan Working Draft** ("Shipping Allocation" is legacy). Submit Plan reads the **Execution Plan** (Ship From / Destination / Suggested Qty / Shipping Method per route) — never the **Recommendation Summary** (system suggestion). `ship_from` / `destination` / `shipping_method` now come from the Execution Plan route (future default: `replenishment_route_rules`, `CARRIER_AND_ROUTE_SPEC.md` §5A). See `INVENTORY_TABLE_MAPPING_SPEC.md` §11. Frontend implemented in `inventory-replenishment.js`; no backend/DB change.
> - **Draft v1.11 (2026-07-01)** — **Done bug fix (§12.2):** `handleCompleteShippingPlan_` now detects the transfer **robustly** — if `transferred_shipment_id` is blank it looks up an existing `shipments` row (by `shipping_plan_id` / `source_shipping_plan_id` / `plan_id`) and **backfills** `transferred_shipment_id` + `transferred_to_shipment_at` before writing `completed_at` / `completed_by`. Fixes *"Plan has not been transferred to a Shipment Draft yet"* when the Draft existed but the metadata was never persisted. Implemented in `11_shipping_plan_handlers.gs` + a shared `shipmentFindForPlan_` helper in `12_shipment_handlers.gs`.
> - **Draft v1.10 (2026-06-30)** — **Decision Layer Completion** (Supply Chain Architecture v1.2): added `completed_at` / `completed_by` to `shipping_plans` (§4) and **§12.2 Done / Completed rules** — an Approved+transferred plan shows a **Done** button (`completeShippingPlan`: writes only `completed_at`/`completed_by`, never touches Shipment); **Completed plans leave the Active view** (`completed_at IS NULL` only) but are preserved and viewable via the new **Completed** filter (§9B). **Supersedes the v1.8 "Converted auto-hide on transfer"** — visibility is now completion-driven; transferred-but-not-completed plans stay in Approved with the Done button. Implemented in `11_shipping_plan_handlers.gs` (+2 headers + `handleCompleteShippingPlan_`), `01_router.gs`, `operation-system-db-api.js`, `shipping-plan.js` + `shipping-plan.html` (Done button + Completed section/filter).
> - **Draft v1.9 (2026-06-30)** — Logistics runtime: added **`carton_cbm`** / `cbm` / `gross_weight` / `net_weight` to `shipping_plan_lines` as **logistics Decision Snapshot** (§5.1, §5.4), computed from `sku_details` carton dims/weights at **Submit Plan** and **recomputed on every Draft Save** (§8, §9A). `carton_cbm` = single-carton CBM (L×W×H/1e6, cm). Header **Total CBM / Total Gross Wt / Total Net Wt** are **Runtime** Σ of the line values (not stored on the header; §6). Execution Commit **copies** these into `shipment_lines` and sums `shipments.total_cbm/total_gross_weight/total_net_weight` (`SHIPMENT_CENTER_SPEC.md` §15.3). Implemented in `11_shipping_plan_handlers.gs` (+3 line headers + logistics map/compute on create & save), `12_shipment_handlers.gs` (copy + header totals), `operation-system-db-api.js` (normalizer), `shipping-plan.js` (runtime header totals + live recompute + Save patch).
> - **Draft v1.8 (2026-06-30)** — Converted visibility after Execution Commit: added `transferred_shipment_id` / `transferred_to_shipment_at` **handoff metadata** to `shipping_plans` (§4); §12.1 — on Approve→Create Shipment Draft the backend stamps these (status stays `approved`; rows + Decision Snapshot preserved; Immutable Flow intact); a **Converted** plan is hidden from the default view and shown only via the new **Converted** Status-filter option (§9B). Implemented in `11_shipping_plan_handlers.gs` (+2 headers), `12_shipment_handlers.gs` (writeback on Execution Commit), `shipping-plan.js` + `shipping-plan.html` (Converted section + filter), `operation-system-db-api.js` (normalizer).
> - **Draft v1.7 (2026-06-30)** — Save / Submit / Cancel button semantics finalized: added **§9A** (Save = Draft-only save of `approved_qty`/`carton_qty` + note append, **no status change, no `submitted_at`**; Submit = `draft → pending_approval` + `submitted_at`/`submitted_by`; **Cancel = soft cancel from Draft OR Pending Approval**, `status = cancelled` + `cancelled_at`/`cancelled_by`, **rows + lines preserved, never deleted**) and **§9B** (default view excludes cancelled; Status filter adds **Cancelled**). Added **`cancelled_by`, `cancelled_at`, `updated_by`** columns to `shipping_plans` (§4) and **§13A People/Actor placeholder rule** (actors are placeholders until the Role & Permission module exists; never block the flow). Implemented in `11_shipping_plan_handlers.gs` (cancel now allows pending_approval; writes `cancelled_*` / `updated_by`), `shipping-plan.js` + `shipping-plan.html` (Cancelled section + filter; Cancel on Pending cards), `operation-system-db-api.js` (normalizer).
> - **Draft v1.6 (2026-06-29)** — Weekly Shipping Plan UI / mapping fixes before the Execution phase: (1) **`shipping_plans.company` resolution** server-side (`marketplace_skus` → `marketplaces` → payload → blank; §3.3). (2) **Carton Quantity Validation** (§3.4) — Shipping Qty must be a `units_per_carton` multiple; missing UPC or non-multiple **blocks Submit Plan**, never silently rounds (§8 aligned). (3) **Removed Total SKU from the Layer 1 card** (§6) and **moved it to the SKU Shipping Details footer** alongside Total Qty / Total Cartons (§7.1). (4) **Snapshot-first display rule** for Current Stock / Avg. Sales / Days of Supply with live fallback then `0` / `--` (§7). (5) **Add Note reconfirmed** append-only to `shipping_plans.note`, never overwriting `rejected_reason` (§10; `appendShippingPlanNote`). (6) **Cost Breakdown placeholder** always visible before the Carrier Price Spec (§11). These are implemented in `shipping-plan.js` / `inventory-replenishment.js` / `operation-system-db-api.js` / `11_shipping_plan_handlers.gs` / `01_router.gs`.
> - **Draft v1.5 (2026-06-29)** — Normalized Avg Sales alignment (no logic change): renamed the Avg-Sales method/source snapshot field to **`snapshot_avg_sales_source`** (records the source, not an algorithm); defined `snapshot_avg_sales_source` as a fixed enum (`weekly_7d` / `normalized_30d` / `manual_override` / `forecast_override` / `ai_adjusted`; runtime uses the first two); **decoupled Source from Warning** (removed combined tokens; §5.3); noted that the pre-submit Avg Sales value is a **Runtime result, persisted only at Submit Plan** (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22.6).
> - **Draft v1.4 (2026-06-29)** — Added the **Shipping Allocation Working Draft** section (§2A): the pre-Submit temporary decision inside Inventory Replenishment (JS State + sessionStorage recovery) that **creates nothing** and **never updates** a Weekly Shipping Plan; Submit Plan reads it and is the **only** creator of `shipping_plans` / `shipping_plan_lines`; draft lifetime (keep on collapse/expand/edit/re-render; clear on submit success / context change / clear search) and the context-scoped sessionStorage rule. Governed by `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.
> - **Draft v1.3 (2026-06-29)** — Extended the Decision Snapshot for the **Normalized Avg Sales** rule (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22): added 4 `shipping_plan_lines` fields — `snapshot_avg_sales_source` (the Avg-Sales source field; renamed in v1.5), `snapshot_normal_days_count`, `snapshot_excluded_event_days_count`, `snapshot_avg_sales_warning` (§5). `snapshot_avg_sales_per_day` is retained and now holds the **final adopted** Avg Sales/Day (normalized or weekly fallback).
> - **Draft v1.2 (2026-06-29)** — Finalized reject/resubmit version behavior + audit fields: (1) **Reject → Draft → Resubmit keeps the SAME `shipping_plan_id`** (one MVP row); only `plan_version` increments (§4.1). (2) Added **`parent_shipping_plan_id`** (MVP = `shipping_plan_id`; future one-row-per-version model) (§4.3). (3) Added **`batch_status`** — batch-level helper summarizing all plans sharing a `submit_batch_id`; `shipping_plans.status` remains the primary approval status (§4.4). (4) Added a **Glossary** defining **Decision Commit** (Submit Plan) and **Decision Snapshot** (§0).
> - **Draft v1.1 (2026-06-29)** — Finalized architecture before implementation: (1) **Shipping Plan Group Key** is now the **six-value tuple** Company + Country + Marketplace + Ship From + Destination + Shipping Method (§3) — supersedes the method-only grouping; `company` added to `shipping_plans`. (2) Added **`plan_version`** (decision-revision counter) and **`submit_batch_id`** (one Submit Plan action → many plans) to `shipping_plans` (§4). (3) **Snapshot location finalized to `shipping_plan_lines` only** — planning snapshots are per-SKU and are NOT stored on `shipping_plans` (§5). (4) Shipment Draft inherits line snapshots without recalculation (§12).
> - **Draft v1 (2026-06-29)** — Created. Defines the Decision Layer, the Submit-Plan write contract, the `shipping_plans` / `shipping_plan_lines` schema, the decision snapshot rule, the card + SKU-detail mapping, the editable-only-in-Draft rule, the Draft → Pending Approval → Approved/Rejected/Cancelled flow, and the Shipment Draft hand-off. Fills the `shipping_plans`/lines schema gap noted in the readiness audit.

---

## 0. Glossary

> **These terms are formally governed by [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md)** (§3 Decision Commit, §4 Decision Snapshot). The definitions below are the Weekly-Shipping-Plan-scoped restatement; the architecture file is authoritative if they ever diverge.

### Decision Commit

The action point where **analysis output becomes a saved planning decision**. In this system, **Submit Plan is the Decision Commit.**

- **Before Decision Commit:** Inventory Replenishment recalculates from live data; **no planning record is persisted.**
- **After Decision Commit:** `shipping_plans` + `shipping_plan_lines` are created; the line-level **Decision Snapshot** is frozen; the plan **must not silently drift** with live inventory data.

### Decision Snapshot

The **immutable per-SKU planning context captured at Decision Commit**, stored on `shipping_plan_lines` (§5.2). It includes:

- `snapshot_current_stock`
- `snapshot_avg_sales_per_day`
- `snapshot_days_of_supply`
- `snapshot_suggested_qty`
- `snapshot_target_days`
- `snapshot_fc_context`
- `snapshot_event_context`

Plus the Avg-Sales source/quality fields `snapshot_avg_sales_source`, `snapshot_normal_days_count`, `snapshot_excluded_event_days_count`, `snapshot_avg_sales_warning` (§5.3).

It becomes the **single source of truth for Shipment execution** and **must never be recalculated after commit**.

---

## 1. Layer Positioning (authoritative)

| Layer | Module | Concern | Owns |
|-------|--------|---------|------|
| **Analysis Layer** | Inventory Replenishment (貨物庫存表) | What the data says / what is suggested | snapshots, AI suggestion, Days of Supply |
| **Decision Layer** | **Weekly Shipping Plan** | What we decide to ship, by which method, at what cost, with approval | `shipping_plans`, `shipping_plan_lines` |
| **Execution Layer** | Shipment Draft / Shipment Overview | Physically shipping, tracking, documents | `shipments`, `shipment_lines`, `shipment_line_allocations` *(PLANNED — not implemented; current runtime uses the single link `shipment_lines.purchase_order_line_id`)* |

- **Inventory Replenishment analyzes; Weekly Shipping Plan decides; Shipment executes.**
- The Decision Layer is the **system of record for the shipping decision**: it must preserve the data basis used at decision time (see §5 Snapshot Rule) and must **not** be re-derived from live inventory after creation.
- **Shipment must not recalculate planning logic** — it copies the approved decision as an execution snapshot (§12).

> **DB note:** `DATABASE_RELATIONSHIP_MAP.md` §8 lists `shipping_plans` / `shipping_plan_lines` in the Shipping / Logistics layer but does not define their columns. **This spec is the authoritative column definition** for those two tables (planned design; not yet migrated).

---

## 2. Core Flow

```
Inventory Replenishment  (Analysis)
        ↓  Submit Plan
Create shipping_plans                 (one per shipping_method)
        ↓
Create shipping_plan_lines            (one per SKU under that method)
        ↓
Weekly Shipping Plan — Draft          (Decision Layer; editable)
        ↓  Submit for approval
Pending Approval                      (read-only; Manager → COO)
        ↓  Approve
Approved                              (read-only)
        ↓  Convert (Shipment Center)
Shipment Draft                        (Execution Layer; shipments.status = draft)
        ↓
Shipment Overview                     (tracking / history)
```

---

## 2A. Execution Plan Working Draft *(formerly "Shipping Allocation Working Draft")*

The **Execution Plan Working Draft** is the **pre-Submit temporary decision** inside Inventory Replenishment. It backs the **Execution Plan** block (Inventory Replenishment second-layer right panel — `INVENTORY_TABLE_MAPPING_SPEC.md` §11). It is **not** a Decision Snapshot (architecture: `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A).

> **Naming:** "Shipping Allocation" is a **legacy name**. The block is now the **Execution Plan**; its backing state is the **Execution Plan Working Draft** (`window.KM.shippingAllocationDraft`, key kept for back-compat). The **Recommendation Summary** (system suggestion) is separate and is **never submitted** — Submit Plan reads only the Execution Plan.

**Rules:**
- Exists **only inside Inventory Replenishment, before Submit Plan**.
- May be stored in **JS State** and **sessionStorage** (recovery only).
- **Must NOT write `shipping_plans`.**
- **Must NOT write `shipping_plan_lines`.**
- **Must NOT update** a Weekly Shipping Plan.
- **Submit Plan reads the Working Draft and creates `shipping_plans` / `shipping_plan_lines`** (the only Decision Commit).
- **Submit success clears the Working Draft** from JS State and sessionStorage.

**Working Draft lifetime — KEEP on:**
- Collapse panel · Expand panel
- Edit shipping method · Edit ship from · Edit destination · Edit shipping qty
- Re-render of the same search result
- Same Company / Country / Marketplace context

**Working Draft lifetime — CLEAR on:**
- Submit success
- Refresh page **only after a successful submit, or if no recoverable sessionStorage exists**
- Change Company · Change Country · Change Marketplace
- Clear Search
- Manual Clear Draft action (if added later)

**sessionStorage rule:**
- On page load, if sessionStorage contains a Working Draft for the **same Company / Country / Marketplace context**, restore it.
- If the context differs, **discard** it.
- The sessionStorage value must **include / validate context**: `company`, `country`, `marketplace`.
- sessionStorage is **temporary recovery only** — it is **not** a committed decision record (the committed record is `shipping_plans` / `shipping_plan_lines` after Submit Plan).

> **Each Working Draft line** preserves at minimum: `company`, `country`, `marketplace`, `sku`, `shipping_method`, `ship_from`, `destination`, `qty`, `target_days`, `source_reason`, `note`. At Submit Plan these become `shipping_plan_lines` (with the per-SKU Decision Snapshot frozen, §5).

---

## 3. Shipping Plan Group Key (FINAL) + Submit Plan Rule

When the user clicks **Submit Plan** in Inventory Replenishment, the system creates Weekly Shipping Plan records.

### 3.1 Shipping Plan Group Key (authoritative system rule)

A Shipping Plan is **uniquely grouped by the following six values**:

1. **Company**
2. **Country**
3. **Marketplace**
4. **Ship From**
5. **Destination**
6. **Shipping Method**

- **Only when ALL six values are identical** may SKUs belong to the **same** `shipping_plan`.
- **If any one of the six differs, a new `shipping_plan` is created.**
- This is the **official system grouping rule** and supersedes the earlier "one shipping method = one plan" wording (shipping method is now just one of the six keys).
- Each `shipping_plan` owns its own `shipping_plan_lines`.

> The six group-key values are persisted on `shipping_plans` as `company`, `country`, `marketplace`, `ship_from`, `destination`, `shipping_method` (§4). `ship_from` / `destination` / `shipping_method` come from the **Execution Plan route** the PM built (future default source: `replenishment_route_rules`, `CARRIER_AND_ROUTE_SPEC.md` §5A) — until route rules are implemented they are whatever the PM entered on the Execution Plan route (blank counts as a distinct value).

**Example (same Company/Country/Marketplace/Ship From/Destination, differing only by Method):**
```
Air Freight:  SKU A, SKU B
Sea Freight:  SKU C, SKU D

→ shipping_plan 1 = …/Air Freight  (lines: SKU A, SKU B)
→ shipping_plan 2 = …/Sea Freight  (lines: SKU C, SKU D)
```
If, say, two SKUs share the same Method but have different `ship_from`, they still split into **two** plans (the Ship From key differs).

### 3.2 Submit Plan behavior

- One Submit Plan action may produce **multiple** `shipping_plan` rows (one per distinct six-value group). All of them share the **same** `submit_batch_id` (§4).
- Each plan is created in `status = draft`, `plan_version = 1`.
- **No factory-stock reservation or deduction happens at Submit Plan** — reservation/deduction belongs to Shipment Center (`SHIPMENT_CENTER_SPEC.md` §7, §8, §15.1).
- `shipping_plans.company` is **resolved from the marketplace context** at write time (§3.3).

### 3.3 Company resolution (FINAL — `shipping_plans.company` is a persisted snapshot, never blank when a source exists)

`company` is **copied from marketplace master data into `shipping_plans.company` at Submit Plan / Decision Commit** — it is a **persisted layer snapshot**, not a display-only field. It is resolved per this priority:

1. `marketplaces.company` by `country + marketplace` (**PRIMARY** — company is marketplace-level ownership),
2. else `marketplace_skus.company` by `country + marketplace + sku` (fallback when the marketplace row is missing),
3. else the existing payload `company` (if already resolved by the frontend; the `--` placeholder counts as blank),
4. else blank — **and log a warning** (the unresolved gap must be visible; only happens when no source exists).

Resolution happens **server-side in `createShippingPlansBatch`** so the value is authoritative regardless of what the frontend payload carried. Because `company` is **group key 1** (§3.1), it is resolved **per line before grouping** — `company` is **part of the group key, not display-only**.

> **Snapshot-flow rule:** `marketplaces.company` → `shipping_plans.company` (Decision Commit) → `shipments.company` (Execution Commit, §12). Each layer **copies** company into its own header; downstream layers must **not** live-join `marketplaces` to recover company for historical records (legacy blank rows may fall back to a live join for display only — §6). Company lives on the **header**, never duplicated onto `shipping_plan_lines` / `shipment_lines` (lines inherit it via `shipping_plan_id` / `shipment_id`).

### 3.4 Carton Quantity Validation (FINAL — required before Submit Plan)

Every Execution Plan route qty submitted must be an **integer multiple of `sku_details.units_per_carton`**.

- If `units_per_carton` is **missing** for a SKU → show a validation error and **block Submit Plan**.
- If a qty is **not a multiple** of `units_per_carton` → show small red text under the Execution Plan block: **「Shipping Qty must be a full carton multiple. Units per carton: {units_per_carton}.」**
- **Submit Plan must NOT proceed** if any draft allocation has an invalid carton quantity. **Do not silently round.**
- Examples: with `units_per_carton = 40`, qty **41 is invalid**; qty **40 / 80 / 120 are valid**.
- An invalid allocation **does not create any `shipping_plans`**.

> **Current implementation note (non-binding):** today's frontend `submitReplenishmentPlans()` writes a method-grouped structure to `sessionStorage` (`allShippingPlans`) — a placeholder. This spec is the contract to replace it with real `shipping_plans` / `shipping_plan_lines` writes grouped by the six-value key.

---

## 4. `shipping_plans` — DB Mapping (plan header / one per method)

| Field | Source / Rule |
|-------|---------------|
| `shipping_plan_id` | system generated (PK) |
| `shipping_plan_no` | system generated (human-readable no.) |
| `plan_name` | system generated (e.g. `{company}-{country}-{marketplace}-{method}-{date}`) |
| `company` | **persisted snapshot** copied from marketplace master data at Submit Plan (**group key 1**, §3.1; resolution priority §3.3). Not display-only. |
| `country` | current selected Inventory Replenishment **country** (**group key 2**) |
| `marketplace` | current selected Inventory Replenishment **marketplace** (**group key 3**) |
| `ship_from` | from the **Execution Plan** route **From** selector (active Factory Warehouses — §4A) (future default: `replenishment_route_rules`) (**group key 4**) |
| `destination` | from the **Execution Plan** route **To** selector (site-filtered warehouse candidates — §4A) (future default: `replenishment_route_rules`) (**group key 5**) |
| `shipping_method` | the **Execution Plan** route's selected method (**group key 6**, §3.1) |
| `plan_version` | decision-revision counter (§4.1); default `1` |
| `parent_shipping_plan_id` | version-lineage anchor (§4.3); **MVP = `shipping_plan_id`** |
| `submit_batch_id` | shared id for all plans created by one Submit Plan action (§4.2) |
| `batch_status` | batch-level summary across the `submit_batch_id` group (§4.4); **helper, not the primary status** |
| `carrier_id` | selected in the Weekly Shipping Plan card Cost Breakdown |
| `carrier_unit_rate` | from the selected carrier rate |
| `carrier_rate_type` | from the selected carrier rate |
| `estimated_freight_cost` | calculated after carrier confirmation (§11) |
| `estimated_duty` | calculated after carrier confirmation (§11) |
| `estimated_total_cost` | `estimated_freight_cost + estimated_duty` |
| `currency` | from carrier / marketplace context |
| `status` | enum (§9); default `draft` |
| `created_by` | placeholder actor (§13A) |
| `created_at` | system timestamp (used as "Submitted Date" display, §6) |
| `submitted_by` | placeholder actor set on Submit (§13A) |
| `submitted_at` | system timestamp set on Submit |
| `approved_by` | placeholder actor (§13A) |
| `approved_at` | system timestamp |
| `rejected_by` | placeholder actor (§13A) |
| `rejected_at` | system timestamp |
| `rejected_reason` | **required when status = rejected** |
| `cancelled_by` | placeholder actor set on Cancel (§13A) |
| `cancelled_at` | system timestamp set on Cancel (soft cancel, §9A) |
| `transferred_shipment_id` | the `shipment_id` created at Execution Commit; **handoff metadata** (§12.1). Non-blank ⇒ the Approved card shows the **Done** button (§12.2). |
| `transferred_to_shipment_at` | system timestamp when the plan was converted to a Shipment Draft (§12.1) |
| `completed_at` | **Decision Layer Completion** timestamp set by **Done** (§12.2). Non-blank ⇒ plan leaves the Active view (preserved in DB). |
| `completed_by` | placeholder actor that pressed Done (`system_user`; future Role & Permission) (§12.2, §13A) |
| `note` | user note / rejection reason / plan rationale (append-only history, §10) |
| `source` | `inventory_replenishment_submit_plan` |
| `updated_by` | placeholder actor of the last write (§13A) |
| `updated_at` | system timestamp |

### 4A. Execution Plan Site + Warehouse Selection (CANONICAL target — 2026-07-20; NOT IMPLEMENTED)

The Inventory Replenishment page already carries the current **company + country + marketplace** context, so the Execution Plan From/To are **warehouse-driven selectors**, never free text (this supersedes the interim "whatever the PM entered / blank/manual" wording in §3.1 / §14 for the target design).

**Ship To Site** (read-only) — the **current page context** (e.g. `UK / Amazon`). Do **not** offer unrelated marketplace choices; another marketplace is **never** selectable as a Ship To Site.

**From** — load **active Factory Warehouses:** `is_active = TRUE AND is_factory_warehouse = TRUE`. A shared Factory source may be available to **all** site/company planning contexts per the finalized supply rule; **do NOT filter a shared Factory out solely because `warehouses.company` differs from the destination company.**

**To** — filter candidates by the **current site context:**
- **FBA candidates:** `is_active = TRUE` ∧ `warehouse_type = FBA` ∧ `company = current company` ∧ `country ∈ current country scope` ∧ `marketplace = current marketplace` (normally `Amazon`).
- **3PL exception:** `is_active = TRUE` ∧ `warehouse_type = 3PL` ∧ `company = current company` ∧ `country ∈ current country scope` ∧ `marketplace` may be **blank/shared**. A shared 3PL may appear for Amazon, Walmart and Shopify contexts, **but the Plan retains its original marketplace snapshot**.

**Persistence:** when a physical warehouse is selected, **persist `warehouse_id`** (canonical identity); **display** `warehouse_code + warehouse_name + location`. (`warehouse_id` is canonical per `SHIPMENT_CENTER_SPEC.md` §22.0; `warehouse_code` is not globally unique.)

### 4B. Planning Destination Scope vs Physical Warehouse (transitional)

The existing country-level aggregate destination rows — **AMZ FBA US · KM AMZ FBA US · AMZ FBA CA · AMZ FBA JP · AMZ FBA UK · AMZ FBA EU · AMZ FBA AU · AMZ FBA SG** — are classified as **LEGACY / TRANSITIONAL PLANNING DESTINATION SCOPE**. They are **not physical receiving warehouses** and MUST NOT be used for: Warehouse Receiving · physical-address documents · Shipment Route final nodes · FC-level inventory · final Shipment warehouse identity once the exact FC is known. Planning may use them **temporarily** only when the physical Amazon FC is unknown.

**Target future separation:** `Execution Plan.destination_scope → Shipment Draft.warehouse_id`. A **Destination Scope Master** is recorded as a **future design decision** — its DB is **NOT created** in this task.

### 4.1 `plan_version` (decision-revision counter) + reject/resubmit rule (FINAL MVP)

- **Default = 1** on creation.
- **Editing inside Draft does NOT increase the version** (normal editing is not a new decision).
- **Reject → back to Draft → resubmit = `plan_version + 1`** (a rejected-then-resubmitted plan is a new decision revision).
- `plan_version` represents **decision revisions only** — not edit count, not status changes.

**Reject / Resubmit keeps the SAME row (FINAL MVP behavior):**
- Reject → Draft → Resubmit **does NOT create a new `shipping_plan_id`** — the **same row** is reused.
- **Only `plan_version` increments**; `shipping_plan_id` is unchanged.

```text
SP-001 | plan_version = 1 | status = pending_approval
   │  Reject
   ▼
SP-001 | plan_version = 1 | status = draft
   │  Resubmit
   ▼
SP-001 | plan_version = 2 | status = pending_approval
```

### 4.2 `submit_batch_id`

- **One Submit Plan action may generate multiple `shipping_plans`** (one per distinct six-value group key, §3.1).
- **All plans generated in the same Submit Plan action share the same `submit_batch_id`.**
- Used for **history, audit, AI analysis, and reporting** (e.g. "show everything pushed in this submit").

### 4.3 `parent_shipping_plan_id` (version-lineage anchor)

- **MVP rule:** because MVP keeps the **same row / same `shipping_plan_id`** across reject/resubmit (§4.1), set:
  ```text
  parent_shipping_plan_id = shipping_plan_id
  ```
- **Purpose:** future version-history support, audit, AI analysis, and a clean upgrade path to a **one-row-per-version** model **without changing the conceptual model**.
- **Future advanced version model (NOT MVP — for reference only):** each version becomes its own row that points back to the original via `parent_shipping_plan_id`:
  ```text
  SP-001  version 1  parent_shipping_plan_id = SP-001
  SP-018  version 2  parent_shipping_plan_id = SP-001
  SP-027  version 3  parent_shipping_plan_id = SP-001
  ```
- **MVP does NOT create new rows per version** — it only increments `plan_version` on the same row.

### 4.4 `batch_status` (batch-level summary helper)

- **Meaning:** the status of the **Submit Plan batch** this Shipping Plan belongs to (the `submit_batch_id` group, §4.2). `submit_batch_id` groups multiple Shipping Plans from one Submit Plan action; **each plan still owns its own `status`.**
- **Suggested values:** `open`, `partial_approved`, `approved`, `rejected`, `cancelled`, `mixed`.
- **MVP rule:** **may be derived** from all plans sharing the same `submit_batch_id` (a roll-up / helper) — it is **not** persisted decision state on its own.
- **Do NOT treat `batch_status` as the primary approval status.** The primary approval status remains **`shipping_plans.status`** (§9).

---

## 5. `shipping_plan_lines` — DB Mapping (one per SKU) + Snapshot Rule

### 5.1 Core line fields

| Field | Source / Rule |
|-------|---------------|
| `shipping_plan_line_id` | system generated (PK) |
| `shipping_plan_id` | FK → `shipping_plans` |
| `sku` | submitted SKU |
| `requested_qty` | original Submit Plan qty |
| `approved_qty` | editable qty in Draft; final qty after Submit |
| `carton_qty` | `approved_qty ÷ units_per_carton` |
| `units_per_carton` | `sku_details.units_per_carton` |
| `source_page` | `inventory_replenishment` |
| `source_reason` | `ai_suggestion` / `manual_submit` / `pm_adjustment` |
| `inventory_snapshot_date` | snapshot date of the Amazon inventory snapshot used at Submit Plan time |
| `note` | line note |
| `created_at` | system timestamp |
| `updated_at` | system timestamp |
| `snapshot_current_stock` | snapshot — see §5.2 |
| `snapshot_avg_sales_per_day` | snapshot — the **final adopted** Avg Sales/Day (normalized or weekly fallback) — see §5.2 |
| `snapshot_days_of_supply` | snapshot — see §5.2 |
| `snapshot_suggested_qty` | snapshot — see §5.2 |
| `snapshot_target_days` | snapshot — see §5.2 |
| `snapshot_fc_context` | snapshot — see §5.2 |
| `snapshot_event_context` | snapshot — see §5.2 |
| `snapshot_avg_sales_source` | which Avg Sales source the decision used — see §5.3 |
| `snapshot_normal_days_count` | normal (non-event) days available in the 30-day window — see §5.3 |
| `snapshot_excluded_event_days_count` | event/promotion days excluded from the window — see §5.3 |
| `snapshot_avg_sales_warning` | data-quality warning for the Avg Sales calc — see §5.3 |
| `carton_cbm` | **logistics Decision Snapshot** — single-carton CBM `carton_length × carton_width × carton_height ÷ 1,000,000` (cm) (§5.4) |
| `cbm` | **logistics Decision Snapshot** — `carton_qty × carton_cbm` (§5.4) |
| `gross_weight` | **logistics Decision Snapshot** — `carton_qty × carton_weight` (§5.4) |
| `net_weight` | **logistics Decision Snapshot** — `approved_qty × item_weight` (§5.4) |

### 5.2 Snapshot Rule (FINAL — snapshots live on `shipping_plan_lines` only)

**Submit Plan must preserve the decision context.** Inventory data changes daily, so the Weekly Shipping Plan must **not** depend only on live Inventory data after creation — it must store the basis the PM saw when deciding.

> **Weekly Shipping Recommendation cadence (canonical, `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A).** The shipping recommendation runs **once per week — Monday 14:00 Asia/Taipei** (trigger window Mon 14:00–15:00; after the 12:00 Daily Report Pipeline and the 13:00–14:00 validation buffer; gated on pipeline success — no partial/stale/empty-success Draft), producing `shipping_allocation_drafts` → `_lines` for the ISO-week Scope. Its scheduler entry point **requires Runtime verification — not claimed implemented**. **`recommended_qty`** (system snapshot; canonical 2026-07-22, legacy alias `recommand_shipment_draft_qty`) **initializes** **`planned_qty`** (user-editable; legacy alias `shipment_draft_qty`); **daily report updates never recalculate or overwrite the Draft or the user quantity** — the two remain independently visible. **No daily Draft versioning.** Idempotent per **ISO Year + ISO Week + Scope** (retries never duplicate/reset). NOT IMPLEMENTED.

**Snapshot values are per-SKU and are stored ONLY on `shipping_plan_lines`. Do NOT store planning snapshots on `shipping_plans`.**

**Required snapshot fields (on `shipping_plan_lines`):**

| Snapshot column | Meaning |
|-----------------|---------|
| `snapshot_current_stock` | Current Stock at submit (`available_qty + fc_transfer_qty + fc_processing_qty`) |
| `snapshot_avg_sales_per_day` | **Final adopted** Avg Sales / Day at submit (normalized 30-day value, or weekly fallback `sales_units_7d ÷ 7`) — see §5.3 |
| `snapshot_days_of_supply` | Days of Supply at submit (`Current Stock ÷ Avg Sales/Day`) |
| `snapshot_suggested_qty` | AI/engine Suggested Qty at submit |
| `snapshot_target_days` | Inventory Replenishment Target Days at submit (stored per line so each line is self-contained for inheritance) |
| `snapshot_fc_context` | FC context if available (e.g. 60-day FC) |
| `snapshot_event_context` | Event context if available (e.g. upcoming event qty) |

- Snapshots are **frozen at Submit Plan time** and are **not** recomputed from live data afterward.
- Definitions follow `INVENTORY_TABLE_MAPPING_SPEC.md` (§4, §13): `Current Stock = available_qty + fc_transfer_qty + fc_processing_qty`; `Days of Supply = Current Stock ÷ Avg Sales/Day`. **Avg Sales/Day** follows the Normalized Avg Sales rule (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22) — see §5.3.
- **Weekly Shipping Plan UI (SKU Shipping Details, §7) displays these snapshot values after Submit.**
- **Shipment Draft inherits these snapshot values from the line without recalculation** (§12).
- `Shipping Qty` is `requested_qty` (and `approved_qty` after edit); `Shipping Method` lives on the plan header as a group key (§3.1) — neither is a separate snapshot column.

> **Why lines, not the header:** every snapshot value is intrinsically per-SKU (stock, sales, DoS, suggestion). Keeping them on the line makes each line self-contained for the Shipment Draft hand-off and avoids ambiguous plan-level aggregates. Even `snapshot_target_days` (plan-wide at submit) is stored on each line so a line carries its full decision basis.

### 5.3 Avg Sales source / quality snapshot fields (Normalized Avg Sales)

These freeze **which Avg Sales source** the decision adopted and its **data quality** at Decision Commit, so the decision basis is auditable and inheritable. Governed by `SUPPLY_PLANNING_CALCULATION_RULES.md` §22. **`source` and `warning` are independent fields — never combined.**

| Snapshot column | Meaning / allowed values |
|-----------------|--------------------------|
| `snapshot_avg_sales_source` | Which Avg Sales **source** the decision used. **Fixed enum:** `weekly_7d` · `normalized_30d` · `manual_override` · `forecast_override` · `ai_adjusted`. **Runtime currently produces only `weekly_7d` / `normalized_30d`**; the other three are reserved Future Extension. |
| `snapshot_normal_days_count` | Number of **normal** (non-event/promotion) sales days available in the 30-day window after exclusion |
| `snapshot_excluded_event_days_count` | Number of event/promotion days **excluded** from the 30-day window |
| `snapshot_avg_sales_warning` | Data-quality warning. **Fixed enum:** blank · `low_sample_warning` · `insufficient_normal_days` · `event_contaminated_weekly_sales` |

- `snapshot_avg_sales_per_day` always stores the **final adopted** value; `snapshot_avg_sales_source` records **which source** produced it.
- **Source and Warning are fully decoupled** (per §22.3). Example — **correct:** `source = normalized_30d`, `warning = low_sample_warning`. **Wrong:** a single combined token like `normalized_30d_low_sample`. A warning must **never** change the `source` value.
- Source ↔ warning by normal-day count (per §22.3): `≥7` → `source=normalized_30d`, `warning=blank`; `3–6` → `source=normalized_30d`, `warning=low_sample_warning`; `<3` → `source=weekly_7d`, `warning=insufficient_normal_days`. No contamination → `source=weekly_7d`, `warning=blank` (or `event_contaminated_weekly_sales` if weekly data was event-affected but still used).
- These are **frozen at submit and never recalculated** (Immutable Flow / Decision Snapshot, `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`). Before submit, the Avg Sales value is a **Runtime result, not persisted** (§22.6).

> **Snapshot Provenance (Architecture Reserved).** Per the snapshot model in `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §4B, a snapshot is **Value + Source + Provenance**. The fields above persist the **Value** (`snapshot_avg_sales_per_day`) and the **Source** (`snapshot_avg_sales_source`). The **Provenance** — *which engine / decision produced the value* (e.g. AI Engine, Forecast Engine, Planning Engine, Promotion Normalization, Current MVP Rule) — is **architecture-reserved for a future AI Audit Trail and is NOT persisted here. No new column is added.**

### 5.4 Logistics snapshot fields — `cbm` / `gross_weight` / `net_weight` (FINAL)

`carton_cbm`, `cbm`, `gross_weight`, `net_weight` are **part of the Decision Snapshot** (persisted on `shipping_plan_lines`, **not** a runtime cache, **not** temporary). They are computed from `sku_details` logistics columns (`SKU_DETAILS_LOGISTICS_SPEC.md` §4) at **Submit Plan** and **recomputed on every Draft Save**.

```
carton_cbm   = carton_length × carton_width × carton_height / 1,000,000     (carton_dimension_unit = cm; other units reserved → 0)
cbm          = carton_qty × carton_cbm
gross_weight = carton_qty × carton_weight
net_weight   = approved_qty × item_weight
```

- **`carton_cbm` (single-carton CBM) is persisted on the line** alongside `cbm` (it normally does not change with qty, but is re-derived on each Save for consistency).
- **Editable while Draft** (recomputed each Save, §8). **Read-only** in Pending Approval / Approved (frozen Decision Snapshot).
- **Header totals are RUNTIME, not stored** — see §6 (Total CBM / Gross / Net = Σ of the line values).
- **Units are read from `sku_details`, never hard-coded** (`*_dimension_unit` default `cm`, `*_weight_unit` default `kg`). The non-cm dimension branch is reserved (Phase 1 contributes 0 cbm for non-cm).
- **`item_*_2` secondary size is NOT used** in any logistics calc.
- At Execution Commit the plan logistics are copied into `shipment_lines` as the Execution Snapshot (`SHIPMENT_CENTER_SPEC.md` §15.3) — never recalculated. **CBM mapping (2026-07):** the plan's **line-total** `cbm` is copied into **`shipment_lines.shipment_carton_cbm`** (LINE-TOTAL — the per-carton × carton-qty multiplication already happened here at §5.4, and must **not** be applied again downstream). `gross_weight` / `net_weight` (line totals) copy directly. Per-carton `carton_cbm` is only a fallback source (× `shipment_carton_qty`, once) when the plan line-total `cbm` is blank. The shipment header `shipment_total_cbm = Σ shipment_carton_cbm`.

---

## 6. Weekly Shipping Plan Card Mapping (Layer 1 — collapsed)

Each `shipping_plan` renders one card.

| Card field | Source |
|------------|--------|
| Status | `shipping_plans.status` |
| Submitted Date | `shipping_plans.created_at` |
| Company | `shipping_plans.company` (persisted snapshot, §3.3) |
| Country | `shipping_plans.country` |
| Marketplace | `shipping_plans.marketplace` |
| Shipping Method | `shipping_plans.shipping_method` |
| Total Pcs | Σ `shipping_plan_lines.approved_qty` |
| Total Cartons | Σ `shipping_plan_lines.carton_qty` |
| Total CBM | **Runtime** Σ `shipping_plan_lines.cbm` (not stored on the header) |
| Total Gross Wt | **Runtime** Σ `shipping_plan_lines.gross_weight` (not stored) |
| Total Net Wt | **Runtime** Σ `shipping_plan_lines.net_weight` (not stored) |
| Total Cost | `shipping_plans.estimated_total_cost` |
| Unit Cost | `Total Cost ÷ Total Pcs` (display; guard divide-by-zero → blank/`--`) |

> **Header logistics totals are RUNTIME** (summed from the line Decision-Snapshot values at render and live while editing qty in Draft). They are **not persisted on `shipping_plans`**. A future Carrier Cost step reads these Runtime totals.

> **Total SKU is NOT shown on the Layer 1 card.** The SKU count moved to the **SKU Shipping Details footer** (§7) so the collapsed card stays focused on plan-level totals.

> **Company display rule:** the card reads **`shipping_plans.company`** (the persisted snapshot). **Do NOT live-join `marketplaces` for display.** A **live join is allowed only as a fallback for legacy rows where `company` is blank** (rows created before company was persisted); **new rows always persist company** (§3.3), so the fallback should rarely fire.

---

## 7. SKU Shipping Details Mapping (Layer 2 — expanded)

| Column | Source (priority order) |
|--------|-------------------------|
| SKU | `shipping_plan_lines.sku` |
| Current Stock | 1) `shipping_plan_lines.snapshot_current_stock` → 2) live `amazon_inventory_snapshot.available_qty + fc_transfer_qty + fc_processing_qty` → 3) `0` |
| Avg. Sales | 1) `shipping_plan_lines.snapshot_avg_sales_per_day` → 2) live `amazon_weekly_sales_snapshot.sales_units_7d ÷ 7` → 3) `0` |
| Days of Supply | 1) `shipping_plan_lines.snapshot_days_of_supply` → 2) `Current Stock ÷ Avg. Sales` → 3) `--` |
| Shipping Qty | `shipping_plan_lines.approved_qty` |
| Cartons | `shipping_plan_lines.approved_qty ÷ shipping_plan_lines.units_per_carton` |

**Snapshot-first display rule (FINAL):** the detail table **displays the line snapshot value first**; it falls back to the **live** calculation only when the snapshot cell is **absent/empty**, and to `0` / `--` when neither exists. This guarantees Current Stock and Avg. Sales always render for a committed plan (the snapshot is written at Submit Plan, §5.2), while still showing a live reference if a legacy line has no snapshot.

### 7.1 SKU Shipping Details footer (total row)

The SKU Shipping Details table ends with a **footer total row**:

| Footer cell | Value |
|-------------|-------|
| SKU column | **Total SKU** = count of `shipping_plan_lines` under this plan |
| Shipping Qty column | **Total Qty** = Σ `approved_qty` |
| Cartons column | **Total Cartons** = Σ `carton_qty` |
| Current Stock / Avg. Sales / Days of Supply | blank or `—` |

- The footer Total Qty / Total Cartons stay **in sync with the Layer 1 card totals** while editing Shipping Qty in Draft.
- **Total SKU lives only in this footer** (it was removed from the Layer 1 card, §6).

---

## 8. Editable Field Rule

**Draft:** `Shipping Qty` is **editable**. Editing + **Save** updates, in order:
1. `shipping_plan_lines.approved_qty`
2. `shipping_plan_lines.carton_qty` (= `approved_qty ÷ units_per_carton`)
3. `shipping_plan_lines.carton_cbm` / `cbm` / `gross_weight` / `net_weight` (recomputed, §5.4) — **Save updates these too; no need to wait for Submit**
4. `shipping_plans` Total Pcs / Total Cartons + Runtime Total CBM / Gross / Net (header, §6)
5. Cost Breakdown — only if a carrier has already been selected (re-derive `estimated_freight_cost` / `estimated_total_cost`)

> **Save behavior (FINAL):** Save persists `approved_qty`, `carton_qty`, **and `carton_cbm` / `cbm` / `gross_weight` / `net_weight`** for the Draft line — immediately, on every Save (§9A). Pending Approval / Approved are **read-only** (logistics snapshot frozen).

**Pending Approval:** `Shipping Qty` is **read-only**.
**Approved:** `Shipping Qty` is **read-only**.

**On Reject:**
- User **must** provide `rejected_reason`.
- System writes `rejected_reason` (+ `rejected_by` / `rejected_at`).
- System **appends** the reason to `note` (preserving existing notes).
- Status returns to `draft`; the Draft becomes editable again.
- On the **next resubmit**, `plan_version` increments by 1 (§4.1) — the reject→edit→resubmit cycle is a new decision revision (in-Draft edits alone do not bump the version).

> Carton multiples: `approved_qty` must be a `units_per_carton` multiple (consistent with carton rounding in `SUPPLY_PLANNING_CALCULATION_RULES.md` §14). This is **enforced at Submit Plan** (§3.4 — invalid qty or missing `units_per_carton` blocks the submit) and surfaced inline while editing the allocation. In-Draft qty edits should likewise stay on carton multiples.

---

## 9. Status Flow

**Allowed statuses (stored / display):** `draft` (Draft), `pending_approval` (Pending Approval), `approved` (Approved), `rejected` (Rejected), `cancelled` (Cancelled).

```
Draft ──Submit──▶ Pending Approval ──Approve──▶ Approved ──Convert──▶ Shipment Draft
  │                      │
  │                      └──Reject (requires rejected_reason)──▶ Draft (editable again)
  │                      │
  └────────Cancel────────┴──▶ Cancelled (SOFT — row + lines preserved, hidden by default)
```

- **Reject requires `rejected_reason`** and returns the plan to `draft`.
- **Cancel is allowed from `draft` OR `pending_approval`** and is a **soft cancel** (§9A) — it never deletes rows.
- **Approved records are not editable** except by an explicit **future admin override** (out of scope here).
- This plan-layer status set is **distinct** from the shipment execution status set (`draft / planned / ready_to_ship / in_transit / partial_received / completed / cancelled / stuck` in `SHIPMENT_CENTER_SPEC.md` §3). The Weekly Shipping Plan owns the **planning/approval** lifecycle; the shipment owns the **execution** lifecycle. They must not be conflated.
- **Approval actors:** per `SUPPLY_CHAIN_SYSTEM_FLOW.md` Step 3, approval is Manager → COO. MVP may model this as a single `pending_approval` → `approved` transition; multi-step approval actor granularity is an Open Question (§15).

---

## 9A. Save / Submit / Cancel Button Semantics (FINAL)

These three actions have **distinct** meaning and must not be conflated.

### Save (Draft only)
- **Allowed only when `status = draft`.**
- Saves the Draft's editable content: writes `shipping_plan_lines.approved_qty`, **recomputes `carton_qty`** (= `approved_qty ÷ units_per_carton`), and **recomputes the logistics snapshot `carton_cbm` / `cbm` / `gross_weight` / `net_weight`** (§5.4) — all on every Save, not deferred to Submit; if a note was added it **appends** to `shipping_plans.note`.
- **Does NOT change `status`. Does NOT write `submitted_at` / `submitted_by`.**
- **Save ≠ Submit.** After Save, the plan stays in Draft and the user stays on the Weekly Shipping Plan page.
- Backend: Save uses `updateShippingPlanLineQty` (and `appendShippingPlanNote` for notes) — it must **NOT** call a status transition.

### Submit (Draft → Pending Approval)
- **Allowed only when `status = draft`.**
- `status: draft → pending_approval`; writes `submitted_at = now` and `submitted_by` (placeholder actor, §13A).
- Backend: `updateShippingPlanStatus { transition: 'submit' }`. A resubmit after a prior rejection bumps `plan_version` (§4.1).

### Cancel (Soft Cancel — Draft or Pending Approval → Cancelled)
- **Allowed from `status = draft` OR `status = pending_approval`.**
- **Soft cancel only:** `status = cancelled`; writes `cancelled_at = now` and `cancelled_by` (placeholder actor, §13A).
- **Does NOT delete `shipping_plans`. Does NOT delete `shipping_plan_lines`.** Rows and lines are preserved for audit/history.
- **UI default hides cancelled plans;** they appear only when the Status filter = **Cancelled** (§9B).
- Backend: `updateShippingPlanStatus { transition: 'cancel' }`.

> **Cancel is NOT Delete.** There is no hard delete / row removal anywhere in this flow.

## 9B. Cancelled Display Rule

- The Weekly Shipping Plan page **default view excludes `status = cancelled`** (the Status filter default is **All Active**).
- The Status filter offers: **All Active** (draft + pending_approval + approved, `completed_at IS NULL`), **Draft**, **Pending Approval**, **Approved**, **Completed** (Decision Layer finished, §12.2), **Cancelled**.
- **Cancelled plans are shown only when the Status filter = Cancelled.** **Completed plans are shown only when the Status filter = Completed.** Both are preserved in DB.
- An **Approved plan that has been transferred** to a Shipment Draft still appears under **All Active / Approved** (with a **Done** button) until it is marked Completed.

---

## 10. Plan Rationale Mapping

The Plan Rationale block displays:
- **Target Days** = the Target Days at Submit Plan time (`shipping_plan_lines.snapshot_target_days`; all lines in a plan share the same submit value, so read from any line).
- **Method** = `shipping_plans.shipping_method`.

**Add Note button (FINAL — always present in Plan Rationale):**
- The Plan Rationale block **always shows an Add Note button**.
- Saving a note **appends** to `shipping_plans.note` (append-only history).
- **Must preserve** existing rejection notes and system notes — **append, never overwrite**.
- **Must NOT overwrite `rejected_reason`.** The Reject comment is written to `shipping_plans.rejected_reason` (the formal field, §8); the reject reason may **also** be appended into `note` for history, but `rejected_reason` remains authoritative.
- Backend contract: `appendShippingPlanNote { shipping_plan_id, note, actor? }` — reads the existing `note`, appends a timestamped line, writes back; never touches `rejected_reason`.

---

## 11. Cost Breakdown (placeholder — final logic in Carrier Price Spec)

Cost Breakdown is a **placeholder** here; the final calculation is defined in a future **Carrier Price Spec**.

> **The Cost Breakdown block is ALWAYS visible in the expanded card — even before the Carrier Price Spec exists.** It renders next to Plan Rationale (side by side). Before carrier pricing is implemented, the fields show stored values or `--` placeholders (Carrier Name, Carrier Fee, Duty / Custom, Total Cost, Unit Cost). No pricing formula is computed yet.

Expected fields:

- `carrier_id`
- `carrier_name`
- `carrier_unit_rate`
- `carrier_rate_type`
- `estimated_freight_cost`
- `estimated_duty`
- `estimated_total_cost`
- `currency`
- `unit_cost` (= `estimated_total_cost ÷ Total Pcs`)

Carrier confirmation updates the `shipping_plans` cost fields (`carrier_id`, `carrier_unit_rate`, `carrier_rate_type`, `estimated_freight_cost`, `estimated_duty`, `estimated_total_cost`, `currency`).

> Default-method guidance (`SUPPLY_PLANNING_CALCULATION_RULES.md` §21): the planning default leans to the slowest/cheapest mode (45-day sea freight) and escalates to faster only to protect the 18-day minimum survival stock — never default to air.

---

## 12. Relationship to Shipment Draft

> **Shipment Draft inherits the Decision Snapshot and creates an Execution Snapshot. The Execution Snapshot is immutable. Shipment never mutates the Decision Snapshot.** (Architecture: `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §3A Execution Commit, §4A Execution Snapshot.)

### 12.1 Execution Commit handoff metadata (FINAL)

When the Execution Commit (Approve → Create Shipment Draft) succeeds, the plan is marked as **handed off to the Execution Layer**:

- The backend writes **`transferred_shipment_id` = the new `shipment_id`** and **`transferred_to_shipment_at` = now** onto `shipping_plans` (and bumps `updated_at`).
- **`shipping_plans` and `shipping_plan_lines` are NOT deleted.** The Decision Snapshot on the lines is **never modified** — these two fields are **Decision-Layer handoff metadata**, not part of the Decision Snapshot, so the **Immutable Flow is preserved** (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`).
- **`status` stays `approved`.** It is NOT changed to `deleted` or any new status.
- **The Approved card STAYS visible** (in the Approved section) after the Execution Commit, now showing a **Done** button (§12.2). *(This supersedes the earlier v1.8 "Converted = auto-hidden on transfer" rule — visibility is now driven by **Decision Layer Completion**, not by the transfer itself.)*
- Idempotent: re-running the Execution Commit for an already-transferred plan does not create a second shipment and does not overwrite the original handoff metadata.

### 12.2 Decision Layer Completion — Done / Completed (FINAL)

The Decision Layer lifecycle is **Draft → Pending Approval → Approved → Execution Commit → Completed** (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §10).

**Done button (Approved card):**
- Shown when **`status = approved` AND `completed_at` is empty AND** the Execution Commit has already created the Shipment Draft — detected by `transferred_shipment_id` / `transferred_to_shipment_at` **OR robustly by an existing `shipments` row whose `shipping_plan_id` = this plan** (so the button appears even if the `transferred_*` columns were never persisted on an older tab).
- Confirm dialog: *"This shipping plan has already been transferred to Shipment Draft. Mark this planning task as completed?"*
- **Auto-migration:** `completeShippingPlan` **auto-adds `completed_at` / `completed_by` columns** to the `shipping_plans` tab if missing (no manual migration), so Done persists and the plan hides after refresh.

**Done behavior (`completeShippingPlan`):**
- **Robust transfer detection + backfill:** the handler no longer relies solely on `transferred_shipment_id`. If that column is blank it looks up an existing `shipments` row referencing this plan (by `shipping_plan_id` / `source_shipping_plan_id` / `plan_id`); when found it **backfills `transferred_shipment_id` + `transferred_to_shipment_at`** (auto-adding the columns first) so a plan that truly has a Shipment Draft can always be completed. *(Fixes the "Plan has not been transferred to a Shipment Draft yet" error when the Draft existed but the transfer metadata was never persisted.)*
- Writes **`completed_at = now`** and **`completed_by` = placeholder actor** (`system_user`; §13A) (+ `updated_*`).
- **Writes nothing else** on the Shipment side — `status` stays `approved`; **Shipment / `shipment_lines` are NOT touched**; **no row is deleted**; Decision/Execution Snapshot unchanged.
- Guard: only an **Approved** plan that **has a Shipment Draft** (recorded or detected) may be completed.

**Completed = Decision Layer finished its job** (the Execution Layer has taken over). It does **NOT** mean the shipment shipped / arrived — only that the **decision** is complete; the Decision Snapshot is **preserved permanently**.

**Completed visibility rule (FINAL):**
- The Weekly Shipping Plan **Active view shows only `completed_at IS NULL`**. A Completed plan **leaves the Active view** and stays hidden **after refresh**.
- Completed plans are **preserved in DB** and viewable via the **Completed** Status-filter option (§9B).
- The **Shipment is completely unaffected** by Done.

- An **Approved** Weekly Shipping Plan can be **converted into a Shipment Draft** (this conversion is the **Execution Commit**).
- Shipment Draft must **copy from the Weekly Shipping Plan as an execution snapshot** — it does **not** recalculate planning logic.
- **Planning decision is owned by Weekly Shipping Plan; shipment execution is owned by Shipment Center.**
- On conversion, the Shipment Center creates `shipments` + `shipment_lines` with `shipments.status = draft` and performs factory-stock reservation (`SHIPMENT_CENTER_SPEC.md` §3, §7, §15 step 10).
- **Plan → Shipment field copy (initial mapping):**

| `shipping_plans` / `shipping_plan_lines` | → | `shipments` / `shipment_lines` |
|---|---|---|
| `country` / `marketplace` | → | `shipments.country` / `marketplace` |
| `ship_from` / `destination` | → | `shipments.ship_from` / `destination` |
| `shipping_method` | → | `shipments.shipping_method` |
| `carrier_id` | → | `shipments.carrier_id` |
| `shipping_plan_id` | → | `shipments.shipping_plan_id` (provenance) |
| `company` | → | **`shipments.company`** (copied at Execution Commit; **not** live-joined from `marketplaces`) |
| line `sku` | → | `shipment_lines.sku` |
| line `approved_qty` | → | `shipment_lines.shipment_qty` *(canonical; legacy `qty` read-fallback only)* |
| line `plan_carton_qty` / `units_per_carton` | → | `shipment_lines.shipment_carton_qty` / `units_per_carton` *(canonical; legacy `carton_qty` read-fallback only)* |
| line `snapshot_*` (§5.2) | → | inherited as the line's decision basis (carried, **not recalculated**) |

> **Shipment inherits the line snapshots without recalculation.** The per-SKU `snapshot_current_stock` / `snapshot_avg_sales_per_day` / `snapshot_days_of_supply` / `snapshot_suggested_qty` / `snapshot_target_days` / `snapshot_fc_context` / `snapshot_event_context` travel with the line into the Shipment Draft as the frozen decision basis. Shipment never re-derives planning values.
> Exact remaining shipment fields (carton number start/end, ETD/ETA, container/BL/invoice) are completed in Shipment Draft (`SHIPMENT_CENTER_SPEC.md` §4) — not copied from the plan.

---

## 13A. People / Actor Fields (MVP placeholder)

The following actor fields are **reserved now but not yet wired to a real user/permission system**:

- `created_by`, `submitted_by`, `approved_by`, `rejected_by`, `cancelled_by`, `completed_by`, `updated_by`

**MVP rule:**
- They may be written with a **placeholder identity** — e.g. `system_user`, `current_user`, or `admin@kitchenmama.com` (the current implementation uses the request `actor`, defaulting to a placeholder).
- A missing actor **must NEVER block** Save / Submit / Cancel / Approve / Reject — the action proceeds with the placeholder.
- The backend resolves each actor as `body.<field> || body.updated_by || actor || 'system_user'`.

**Future:** once the **Role & Permission / User Management** spec is complete, these fields are replaced with the real `user_id` / `user_email` identity. No schema change is needed then — only the value source changes.

---

## 13. Non-Goals

- **Do not** define the Carrier pricing formula here (future Carrier Price Spec).
- **Do not** implement Role & Permission / User Management here — actor fields stay placeholders (§13A).
- **Do not** define Request Order / PO conversion here (`REQUEST_ORDER_AND_PO_SPEC.md`).
- **Do not** implement the Shipping Allocation algorithm here (`ship_from` / `destination` finalized logic deferred).
- **Do not** implement Monthly Sales / Achievement Rate here.
- **No code, frontend, Apps Script, API, DB migration, or BigQuery.**

---

## 14. Open Questions

- **`shipping_plan_no` / `plan_name` generation format** (prefix, sequence, per-week reset?).
- **Approval actor model** — single `pending_approval` vs explicit Manager → COO sub-states; permission model (out of scope, but fields needed).
- **`ship_from` / `destination` source** — finalized by the future Shipping Allocation spec; until then these may be blank/manual (and, being group keys §3.1, a blank value still counts as a distinct group).
- ~~**Cancel semantics from Pending Approval**~~ **RESOLVED (§9A):** Cancel is allowed directly from **Draft OR Pending Approval**, as a **soft cancel** (status → `cancelled`, rows preserved, hidden by default).
- **Re-submit `submitted_at`** — whether `submitted_at` is overwritten on each resubmit or a per-version submit history is kept (MVP increments `plan_version` on the same row; whether to log each submit timestamp is open).
- **`batch_status` derivation precedence** — exact roll-up rule for `mixed` / `partial_approved` when plans in a batch differ.
- **Cost recalculation trigger** — exact recompute rule when qty changes after carrier selection (deferred to Carrier Price Spec).

> **Resolved (this version):** Reject→Draft→Resubmit keeps the **same `shipping_plan_id`**, only `plan_version` increments (§4.1); `parent_shipping_plan_id = shipping_plan_id` in MVP (§4.3); `batch_status` is a derived helper, `shipping_plans.status` stays primary (§4.4); Decision Commit = Submit Plan and Decision Snapshot lives on `shipping_plan_lines` (§0, §5.2). Earlier-resolved: six-value group key (§3.1); one Submit Plan action shares one `submit_batch_id` (§4.2).

---

**Draft v1.12 — Weekly Shipping Plan Mapping Spec. Decision Layer between Inventory Analysis and Shipment Execution.** Cumulative through v1.12: the v1.6/v1.7 UI/mapping fixes (company resolution, carton validation, card/footer layout, snapshot-first display, Add Note, Cost Breakdown placeholder, Save/Submit/Cancel semantics + soft cancel, placeholder actor fields), the v1.11 Done/transfer robustness backfill (`11_shipping_plan_handlers.gs` + `shipmentFindForPlan_`), and the v1.12 Execution Plan Working Draft terminology are recorded as implemented in the frontend/API/Apps Script per the changelog above + project-current-state; **implementation status of anything not confirmed there requires runtime verification.** New `shipping_plans` columns across these versions: `cancelled_by` / `cancelled_at` / `updated_by` (+ handoff metadata `transferred_shipment_id` / `transferred_to_shipment_at` and completion `completed_at` / `completed_by`). Formulas owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`; execution owned by `SHIPMENT_CENTER_SPEC.md`. Handoff = explicit **Execution Commit** (Approved → Create Shipment Draft), idempotent (§12.1); Approval alone does not create a Shipment.**

**End of Document**
