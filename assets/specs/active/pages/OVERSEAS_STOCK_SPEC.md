# Overseas Stock — Page Specification (MVP)

**Status:** 🟢 MVP Implemented
**Last Updated:** 2026-06-12
**Module group:** Warehouse Stock (`Warehouse Stock ├─ Factory Stock └─ Overseas Stock`)
**Related:** `docs/planning/SUPPLY_CHAIN_SYSTEM_FLOW.md`, `docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md`, `docs/planning/DATABASE_RELATIONSHIP_MAP.md`

> Overseas Stock is a **warehouse-side inventory snapshot page** (3PL / FBA / Marketplace warehouse). It mirrors the Factory Stock UI exactly (header, filter bar, dual-layer table, dropdown filters, button style). **It does NOT implement replenishment calculation, projection formulas, or Request Order integration** — MVP reads existing data and supports CSV import + manual adjustment + a movement log.

> **CANONICAL NAMING & SCOPE (2026-07-21).** The **user-facing page name is "Overseas Inventory"** (this page, historically labeled "Overseas Stock", is that page). It represents **overseas warehouse inventory** — `overseas_inventory_snapshot` + `overseas_inventory_movements`, warehouse-level balances, company/warehouse/SKU filters, and inventory history/adjustments. **It EXCLUDES Factory Inventory** (`factory_stock` / `factory_stock_movements` / factory balances) — Factory and Overseas inventory must **not** be mixed in one default dataset (Factory Stock is a separate page). **Overseas Inventory is one of three separate Warehouse pages** — Overseas Inventory / **Overseas Inbound** / **Overseas Outbound** (`WAREHOUSE_OPERATIONS_SPEC.md`). **Relationship to operations:** overseas balances change from **confirmed Overseas Inbound receipts** and **confirmed Overseas Outbound ship confirmations** (movement posting owned by the inventory / inbound specs); this page **displays** balances + movements and supports manual adjustment + import. **In-transit shipment goods are NOT counted here** until a confirmed receipt. Factory Inventory vs Overseas Inventory are separate domains — authority `DATABASE_RELATIONSHIP_MAP.md` §6.0.

---

## 1. Page Positioning

| Aspect | Value |
|--------|-------|
| Section id | `#overseas-stock-section` |
| Route key | `overseas-stock` → `overseas-stock-section` (in `app.js` `showSection` maps) |
| Nav | Under **Warehouse Stock** parent menu (sibling of Factory Stock) |
| Lifecycle | `KM.lifecycle.register('overseas-stock-section', { mount, unmount })` |
| Page JS | `assets/js/pages/overseas-stock.js` |
| Page CSS | `assets/css/pages/overseas-stock.css` (mirrors `factory-stock.css`, scoped to `#overseas-stock-section`) |
| Demo mode | No demo data layer. Always reads from `KM.DB` (Google Sheet). Empty DB → "尚未連接資料來源". |

---

## 2. Data Sources

| Table | Role | Access |
|-------|------|--------|
| `overseas_inventory_snapshot` | **Source of truth** for the snapshot rows | `KM.DB.getOverseasInventorySnapshot()` |
| `warehouses` | Join for company / country / warehouse_name / warehouse_type by `warehouse_id` | `KM.DB.getWarehouses()` |
| `sku_details` | Join for category / series by `sku` | `KM.DB.getSkuDetails()` |
| `overseas_inventory_movements` | Movement Log tab | `KM.DB.getOverseasInventoryMovements()` |

**Join rule:** `company / country / warehouse_name / warehouse_type` are **NOT** stored on the snapshot or movement rows. They are resolved from `warehouses` by `warehouse_id` at read time (and at write/validation time on the backend).

---

## 3. Tabs

1. **Stock Snapshot** — filter bar + action buttons + snapshot table.
2. **Movement Log** — read-only table of `overseas_inventory_movements`.

---

## 4. Filters (Stock Snapshot)

Company, Warehouse, Category, Series, SKU Search — behavior identical to Factory Stock (checkbox dropdowns; All / N selected; empty = no filter; AND between groups; SKU = substring). Options are built dynamically from the DB-joined snapshot data (no static/fake options).

**Country tabs** appear below the filter bar and above the table: a pill row generated from distinct joined `warehouses.country` (no hardcoded list; computed from already-loaded rows, no backend per click). Default selects **US** if present, else the first country; if no countries exist, no tabs are shown. The selected country combines (AND) with the other filters. Demo OFF shows only real DB countries.

## Movement Log search gating

The Movement Log tab renders **no rows on load**; it shows "Please select filters and click Search to view movement logs." A **Search** button (`btn btn-primary`, far right of the filter row) renders rows for the current filters. Changing any Movement Log filter (date / dropdowns / SKU) returns to the instruction state — the user must press Search again. After Search with no matches → "No data found". The Snapshot tab is unaffected.

---

## 5. Snapshot Table Columns

Fixed: **SKU**. Scroll: Company, **Country**, Category, Series, Warehouse Name, Available, Reserved, Damaged, On The Way Qty, **Warning**, **More Info**.

**Company / Country / Warehouse Name / Warehouse Type** are joined from `warehouses` by `warehouse_id` (never stored on the snapshot row). If `warehouse_id` is missing or has no matching `warehouses` row, the page does not break: Warehouse Name shows `Unknown`, Company/Country show blank, and More Info displays a "warehouse not found" warning.

### Warning (MVP, display-only)

Derived purely from existing snapshot data — **no replenishment calc / no projection formula**. Priority:

1. `DAMAGED` — `damaged_stock > 0`
2. `OVER STOCK` — `overstock_point > 0` **and** `available_stock >= overstock_point`
3. `LOW STOCK` — (`reorder_point > 0` and `available_stock <= reorder_point`) **or** (`reorder_point <= 0` and `available_stock <= 0`)
4. `-` — otherwise

`reorder_point` / `overstock_point` are **optional** snapshot columns (absent → 0 → rule skipped). This is a placeholder for the future Inventory Projection Engine.

### More Info (modal)

Shows: Warehouse ID, Site SKU, On The Way ETA, On The Way Bucket, **Shipment Status** (display label; backed by the unchanged `event_status` DB field), Last Movement At, Note (plus SKU + Warehouse Name for context).

---

## 6. Movement Log Table + Filters

Fixed: **SKU**. Scroll: Warehouse Name (joined), Movement Type, **From** (`from_stock_type`), **To** (`to_stock_type`), Quantity, Qty Before, Qty After, Reference Type, Reference ID, Created By, Created At, Note. Sorted most-recent-first.

### Movement Log Filters (Forecast Review style, label-on-top row)

| Filter | Source | Behavior |
|--------|--------|----------|
| **Date** | row `movement_date` (fallback `created_at`) | Forecast-Review-style **date range picker** (modal: preset list + start/end inputs + dual calendar + Apply/Cancel/Clear). Presets: Today / Yesterday / Last 7 / 30 / 60 / 90 days / Last month / Last 2 / 3 months / Last year. Trigger shows the selected range (or preset label); default **All dates** (no range = no date filtering). Apply keeps rows with `movement_date` (fallback `created_at`) within `[start, end]` inclusive; Cancel discards edits; Clear resets to All dates. Implemented as a **self-contained duplicate** under isolated `ovs-date-*` classes/ids — Forecast Review code is not called or modified. |
| **Country** | `warehouses.country` via `warehouse_id` join | Checkbox dropdown; distinct values from joined movement rows. |
| **Marketplace** | `warehouses.marketplace` via `warehouse_id` join | Checkbox dropdown; distinct values from joined movement rows. `marketplace` is an optional `warehouses` column surfaced by the normalizer — absent → empty (only "All", no fake data). Static distinct (no country dependency) for MVP. |
| **Category** | `sku_details.category` via `sku` join | Checkbox dropdown; distinct values. |
| **Series** | `sku_details.series` via `sku` join | Checkbox dropdown; distinct values. |
| **SKU Search** | movement `sku` | Text contains-match. |

Multiple groups combine with AND; within a group, checked values are OR. Options are built only from real joined DB data; empty DB → only the "All" entry. Filters are scoped to the Movement Log panel and do not affect the Stock Snapshot tab. Snapshot keeps its own Company / Warehouse / Category / Series / SKU filters. Read-only — no DB writes.

---

## 7. Import Overseas Inventory Snapshot

**UX:** mirrors Import FC / Import SKU (template download link, file picker, result summary, Done button on clean success).

> **Inventory namespace (finalized 2026-07-21):** overseas snapshot/movement columns are canonical `wh_*` (`wh_available_stock` / `wh_reserved_stock` / `wh_damaged_stock` / `wh_on_the_way_qty` / `wh_on_the_way_eta` / `wh_physical_stock` / `wh_on_the_way_bucket`; movements `wh_quantity` / `wh_quantity_before` / `wh_quantity_after`). The import handler accepts **both** the canonical and the legacy CSV keys (server dual-accept); the frontend template header switch to `wh_*` is **pending the live header migration**. See `DATABASE_RELATIONSHIP_MAP.md` Inventory Field Namespace Rule.

**CSV columns (template — legacy names until live migration; server also accepts `wh_*`):**
```
warehouse_id, sku, available_stock, reserved_stock, damaged_stock, on_the_way_qty, on_the_way_eta, note
```

**Rules:**
- `company / country / warehouse_name / warehouse_type` are **forbidden** in the CSV — resolved from `warehouse_id`.
- Quantity fields (canonical `wh_available_stock`, `wh_reserved_stock`, `wh_damaged_stock`, `wh_on_the_way_qty`; legacy names accepted) must be **numeric and ≥ 0**; decimals are **rounded UP** (ceiling); non-numeric → row error (not written). Blank → 0.
- `warehouse_id` must exist in `warehouses` (else row error).
- Business key = `warehouse_id + sku`. Existing → update stock fields / `wh_on_the_way_eta` / note / updated_at (preserve `snapshot_id`, `site_sku`). New → create with `snapshot_id = OISN-{8hex}`.
- **Import is a snapshot refresh and does NOT write movement rows.**

**Path:** `runOverseasImport()` → `KM.DB.importOverseasInventorySnapshotBatch(rows, opts)` → Apps Script `importOverseasInventorySnapshotBatch` → `handleImportOverseasInventorySnapshotBatch_`.

---

## 8. Manual Stock Adjustment

**Inputs (MVP):** `warehouse_id` (select), `sku`, `adjustment_qty` (whole number, may be negative, ≠ 0), `reason` (required), `note` (optional).

**Write behavior:**
- Targets the **`wh_available_stock`** bucket (MVP).
- `wh_quantity_before = current wh_available_stock`; `wh_quantity_after = before + adjustment_qty`; result must be ≥ 0 (else error, no write). *(⚠ `wh_quantity_before`/`wh_quantity_after` general semantics UNRESOLVED — here they are the `wh_available_stock` bucket; see `INVENTORY_TABLE_MAPPING_SPEC.md` §3.2.)*
- Updates `overseas_inventory_snapshot`: `wh_available_stock`, `last_movement_at`, `updated_at`.
- Inserts `overseas_inventory_movements` row: `movement_type = 'manual_adjustment'`, `wh_quantity`, `wh_quantity_before`, `wh_quantity_after`, `reference_type = 'manual'`, `reference_id = ''`, `source_module = 'overseas_stock'`, `created_by`, `created_at`, `movement_date`. `reason` → `reason` column if present, else prefixed into `note` as `[reason] note`. *(Handler resolves canonical `wh_*` headers, legacy fallback until live rename.)*
- The snapshot row must already exist (import first); otherwise error.

**Path:** `runOverseasAdjust()` → `KM.DB.adjustOverseasInventory(payload)` → Apps Script `adjustOverseasInventory` → `handleAdjustOverseasInventory_`.

---

## 9. Database Schemas (referenced by code; create tabs in the Google Sheet)

### warehouses
```
warehouse_id, company, country, warehouse_name, warehouse_type, status, created_at, updated_at, note
```
`warehouse_id` convention: `WH-{COMPANY}-{COUNTRY}-{TYPE}-{NAME}`.

### overseas_inventory_snapshot
```
snapshot_id, warehouse_id, sku, site_sku,
available_stock, reserved_stock, damaged_stock, on_the_way_qty,
on_the_way_eta, on_the_way_bucket, event_status,
reorder_point (optional), overstock_point (optional),
last_movement_at, note, created_at, updated_at
```
Business key: `warehouse_id + sku`. `snapshot_id = OISN-{8hex}`.

### overseas_inventory_movements
```
movement_id, movement_date, warehouse_id, sku, site_sku,
movement_type, from_stock_type, to_stock_type,
quantity, quantity_before, quantity_after,
reference_type, reference_id, source_module,
reason (optional), created_by, created_at, note
```
`movement_id = OVMV-{8hex}`. **No** company / country / warehouse_name / warehouse_type (join `warehouses`).

`from_stock_type` / `to_stock_type` are **additive** stock-direction fields (read gracefully; empty if columns absent). Allowed values: `available | reserved | damaged | on_the_way | none`. Direction examples: received `none→available`, reserved `available→reserved`, release_reserved `reserved→available`, damaged `available→damaged`, outbound `available→none`, adjustment `none→available`, transfer_out `available→none`, transfer_in `none→available`. Manual Adjustment writes `movement_type='adjustment'`, `from_stock_type='none'`, `to_stock_type='available'` (MVP targets the available bucket); these are written only when the columns exist.

> Required-header validation runs before any write in the import handler. For the import the snapshot tab must contain at least: `snapshot_id, warehouse_id, sku, site_sku, available_stock, reserved_stock, damaged_stock, on_the_way_qty, on_the_way_eta, note, created_at, updated_at`.

---

## 10. Out of Scope (explicitly NOT built)

Request Order, Shipment, Carrier, BigQuery, AI, Chart, Dashboard cards, Auto Sync, API connector, Permission, Company management, Marketplace management, replenishment/projection formulas. Factory Stock behavior is **unchanged**.

---

**End of Document**
