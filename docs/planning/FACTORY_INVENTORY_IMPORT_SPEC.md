# Factory Inventory Initial Stock Import — F0-HOTFIX-FI1 (2026-08-06)

> **Status: IMPLEMENTED (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED).** A bounded Factory Inventory write
> path: bulk-**SET** beginning Factory Current Stock from a validated template. Identity = `warehouse_id + sku`.
> No supplier, no marketplace, no site_sku. Reuses the generic ExcelJS template builder and the factory
> adjust/FC-write safety scaffolding. No DB/schema change. No formula change. No cross-module writes.

## Actions (two-phase; thin router registration in `01_router.gs`)
- **`factoryInventory.import.validate`** → `handleFactoryInventoryImportValidate_` — server-computed preview +
  summary + issues. **ZERO writes.**
- **`factoryInventory.import.commit`** → `handleFactoryInventoryImportCommit_` — re-validates the whole batch
  (`ATOMIC_BATCH_VALIDATION`; any blocking issue ⇒ zero writes), then under a `LockService` script lock re-reads
  `factory_stock` (drift), **SETs `fac_current_stock`** (reserved untouched), creates missing rows, and appends
  one `factory_stock_movements` row per **changed** row. Business logic lives in `21_factory_inventory_handlers.gs`.

## Import mode
**`SET_CURRENT_STOCK` only.** The imported `current_stock_qty` **becomes** the current stock for `warehouse_id + sku`
(never an increment). No ADD mode; no reserved / in-production / pending-shipout import.

## Identity & authority
- **Factory identity** = `warehouse_id` (canonical, required). `warehouse_code` is a human-readable check only and
  never overrides the id; a conflict is `WAREHOUSE_ID_CODE_MISMATCH`. Each warehouse must exist, be **active**, and be
  a **factory** warehouse (`is_factory_warehouse`).
- **SKU identity** = `sku` from `sku_details` (required; **not** `site_sku`).
- **No supplier** anywhere in the path (Phase 2).

## Template (`Factory_Inventory_Import_Template.xlsx`, via `KM.templateExport.buildAndDownload`)
Columns: `warehouse_id`, `warehouse_code`, `sku`, `current_stock_qty`, `effective_date`, `note`. `current_stock_qty`
is a required non-negative integer (0 valid; **blank = missing, not zero**; negative/decimal invalid). `effective_date`
optional ISO `YYYY-MM-DD` (audit only; never defaulted from browser time in the parser). `note` optional, ≤ 500 chars.
Upload accepts **.xlsx or .csv** (browser-parsed; cell values only, formulas read as computed results, `_SYSTEM` sheet
and the `row_type=example` row skipped). **Helper reference sheets are not supported by the generic builder**, so
canonical `warehouse_id` values are offered as a dropdown and both identity columns carry a comment — users must match
canonical values (§5 fallback).

## Quantity field mapping
Current stock = **`fac_current_stock`** (legacy fallback `current_stock`). `available` is DERIVED (`current − reserved`)
by the existing owner and is never written. New rows mirror `ensureFactoryStockBaseline_`: `fac_current_stock = imported`,
`fac_reserved_stock = 0`, `factory_stock_id = 'FS-'+warehouse_id+'-'+sku`.

## Movement / audit (existing `factory_stock_movements` schema — not a parallel table)
One row per **changed** row: `movement_type = 'inventory_import'`, `related_entity_type = 'factory_inventory_import'`,
`related_entity_id = <import_batch_id>`, signed `qty = after − before`, `before/after_current_stock`,
`before/after_reserved_stock` (equal — reserved untouched), `movement_date = effective_date || write-date`, `note`,
`created_by`, `created_at`. **UNCHANGED rows write nothing** (no false movement).

## Idempotency & concurrency
Import batch id `FII-{YYYYMMDD}-{suffix}` (client-generated at validate, reused on commit + retry). Per-row idempotency
via `related_entity_id === import_batch_id` lookup on `factory_stock_movements` (existing field; **no schema expansion**)
— a retry resumes and never double-writes. `LockService` serializes; validate-before-mutate; exact Spreadsheet-ID gate
(`prodAssertDbTarget_`); no runtime sheet/header creation or repair (fail closed). On a stock-committed-but-audit-failed
row the stock cell is compensated and the batch returns `IMPORT_AUDIT_WRITE_FAILED` (never a false full success).

## UI (Warehouse → Factory Inventory)
"Import Inventory" button sits immediately to the **left** of "Inventory Adjustment". Modal: Download Template → upload
→ server validate → preview (Row · Factory · SKU · Existing · Imported · Difference · Status · Issue · Note; Difference is
presentational only, never the write quantity) → confirm (states **SET, not ADD**) → result (created/updated/unchanged/
movements/batch id). Double-click sends **one** commit; the committed ack is **decoupled** from a **targeted** readback
(`refreshFactoryStockTables` re-GETs only `factory_stock` + `factory_stock_movements` — never a whole-DB reload); a
readback failure shows "Import committed. Reconfirming…" and never resends.

## Deployment
- **APPS_SCRIPT_SYNC_REQUIRED:** `21_factory_inventory_handlers.gs`, `01_router.gs`.
- **FRONTEND_GITHUB_PAGES_REQUIRED:** `factory-stock.js`, `operation-system-db-api.js`, `factory-stock.html`, `factory-stock.css`.
- **DB/schema changes:** none. **Bundle rebuild:** none (no supply-planning bundle source touched).

## Not this round (Phase 2 / non-goals)
Supplier / supplier SKU; ADD mode; reserved / in-production / pending-shipout import; stock transfer / borrowing;
Forecast / Recommendation / Execution Plan / Allocation Draft / Submit / Request Order / Purchase Order / Shipment;
document generation; whole-DB reload; broad Inventory UI redesign.
