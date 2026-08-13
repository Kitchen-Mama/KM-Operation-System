# F1-UX-OVERSEAS-INVENTORY-SCOPED-IMPORT-R1 — context-scoped Overseas Inventory import

**Outcome: IMPLEMENTED (bounded UX + server-side safety).** Baseline HEAD `279d9d3`. The Warehouse → Overseas Inventory →
Import Inventory flow now requires a relationally-filtered **Company / Country / Warehouse** scope, downloads a template
scoped to ONE warehouse, and the server validates EVERY row against that warehouse — mixed/mismatched files fail closed.
No inventory quantity/formula change; no DB schema change; no AI-Plan/Gap/Recommendation change.

## §0 Current-flow audit (before)
1. **Modal owner:** `overseas-stock.js` `openOverseasImportModal` + `overseas-stock.html` `#overseas-import-modal`.
2. **Template owner:** `downloadOverseasImportTemplate` (KM.templateExport `.xlsx`; `.csv` fallback).
3. **CSV headers:** `warehouse_id, sku, available_stock, reserved_stock, damaged_stock, on_the_way_qty, on_the_way_eta, note`.
4. **Upload/import owner:** `runOverseasImport` → `_ovsProcessImportCells` → `KM.DB.importOverseasInventorySnapshotBatch`
   → backend `handleImportOverseasInventorySnapshotBatch_` (05_).
5. **warehouse_id validation:** per-row eligibility (`overseasImportWarehouseIssue_`: active + non-factory).
6. **company/country/warehouse source:** canonical `warehouses` master (resolved from `warehouse_id`; the snapshot stores
   only `warehouse_id`).
7. **Warehouse existence validated?** Yes (per row, active + non-factory).
8. **One CSV → multiple warehouse_ids?** **YES** (the template offered ALL eligible ids as a dropdown; mixed files were
   allowed and partially imported).
9. **company/country trusted from CSV?** No (not in the CSV; resolved from warehouse_id).
10. **Warehouse master provides company/country?** Yes (`warehouses.company` / `warehouses.country`; the normalizer +
    Adjust modal already read them).

## New flow
Select Company → Country → Warehouse (relationally filtered) → download warehouse-scoped template (`warehouse_id`
prefilled) → fill rows → upload → the request carries the selected `{company, country, warehouse_id}` → server validates
the scope + every row → import (fail-closed on any mismatch).

## §1 Canonical context authority
Company/Country/Warehouse options come ONLY from the canonical `warehouses` master, filtered to **eligible = active,
NON-factory (Overseas/3PL)** (`_ovsEligibleWarehouses`: `isFactoryWarehouse !== true && isActive !== false` — the SAME
`is_active`/`is_factory_warehouse` fields the server re-validates). Nothing hard-coded (no KM/ResTW/ResUS/US/CA literals).
**warehouse_id is the sole identity authority**; company/country are resolved from it (never inferred; factory never
implies company). No second warehouse registry.

## §2/§3 Relational selectors (frontend UX)
Three relationally-constrained selectors (`_ovsScopeOptions`): companies constrained by the current Country; countries by
the current Company; warehouses by BOTH. **Warehouse-first** (`onOverseasImportScopeChange('warehouse', …)`) converges
Company+Country to the warehouse's canonical values. Changing Company/Country **prunes** a now-incompatible warehouse (and
the other selector if the pair has no eligible warehouse). No eligible warehouses → empty selectors + disabled
Download/Import. A resolved-scope readout ("Import Scope — Company … · Country … · Warehouse …") shows the context. The
scope is valid only when company + country + warehouse are all set AND the warehouse canonically belongs to that
company/country (`_ovsImportScopeValid`).

## §4/§5/§6 Scoped template
`downloadOverseasImportTemplate` is gated on a valid scope. The `warehouse_id` column dropdown is scoped to the **single
selected warehouse** (`dropdown: [sc.warehouseId]`), the example row is **prefilled with the selected warehouse_id**, and
the instruction row names the scope ("This import updates ONE overseas warehouse only — Company/Country/Warehouse …; do
not mix warehouses"). Filename: `Overseas_Inventory_<Company>_<Country>_<WarehouseId>_Import_Template.xlsx` (sanitized;
`.csv` fallback mirrors it). The existing inventory columns are unchanged; **no company/country/warehouse_name data
columns are added** (they remain warehouse_id-derived); numeric guidance retained. The scope is also stamped into the
template's system metadata (`scope_company/scope_country/scope_warehouse_id`).

## §7/§13 Upload context + file-clear-on-change
The import request carries the selected `{company, country, warehouse_id}` in `options.scope` (the db-api wrapper already
passes `options` through — no wrapper change). File input + Import button start **disabled**; enabled only on a valid
scope + a chosen file. **Changing any selector clears the selected file** (`_ovsClearImportFile_`) so a file prepared for
a previous warehouse can never be silently uploaded.

## §8 Server-side validation (authority)
New PURE `overseasImportScopeCheck_(rows, scope, warehouseById)` (in the extractable `__OVSIMPORT_PURE__` block), run in
`handleImportOverseasInventorySnapshotBatch_` **BEFORE any mutation**. When a scope is declared it proves: (1) the selected
warehouse exists + is eligible (reuses `overseasImportWarehouseIssue_`); (2) the selected company/country match the
canonical `warehouses` facts (case-insensitive; never CSV-authoritative); (3) **every row's `warehouse_id` equals the
selected one**. Any failure returns fail-closed `{ success:false, code, message, details }` with diagnostics
(`expected_warehouse_id`, `row_number`, `actual_warehouse_id` / `expected_company` / `expected_country`) — **no partial
import, no silent row rewrite**. Codes: `IMPORT_WAREHOUSE_SCOPE_MISMATCH` (row/company/country mismatch),
`IMPORT_WAREHOUSE_SCOPE_INVALID` (selected warehouse unknown/inactive/factory). Absent scope → legacy per-row path
(backward compatible). The handler now also reads `warehouses.company` / `warehouses.country` into the per-warehouse map.

## §9/§10/§11 Authority & mutation preserved
Company/country never become CSV facts (not added to rows). The snapshot mutation semantics — business key
`warehouse_id + sku`, `wh_available/reserved/damaged/on_the_way_qty`, `on_the_way_eta`, `note`, snapshot_id/site_sku
preservation, CEILING numeric validation, audit timestamps — are **unchanged**. One import file = one warehouse (Phase-1).

## §17 Loading / API debt
The modal reads warehouses from `KM.DB.getWarehouses()` (broad `_opDbCache`, as the rest of the Overseas page already
does). Moving this single selector to a dedicated scoped warehouse API was NOT bounded within this UX task and no such
scoped warehouse-master read owner exists — recorded as **`OVERSEAS_IMPORT_MASTER_READ_API_DEBT`** (a future migration
concern), not broadened here. No second warehouse API created.

## §14/§15/§16 Tests
New `overseas-inventory-scoped-import-f1-ux-r1.test.js` **52/0**: backend scope gate (valid single-warehouse pass; row/
company/country mismatch → SCOPE_MISMATCH with diagnostics; unknown/inactive/factory → SCOPE_INVALID; file-for-A-scope-B;
no-scope legacy no-op; case-insensitive; gate-before-write, no partial mutation; reads canonical company/country);
relational filtering (factory + inactive excluded; company-first / country-first / warehouse-first convergence; change-
handler pruning via the real handler with a fake DOM; no-valid-warehouses; identity by warehouse_id only — code-collision
safe); scoped template (gated; dropdown = selected warehouse; example prefill; scoped filename; scope metadata; existing
columns retained; no company/country columns; numeric guidance); HTML modal selectors + disabled gating + scope send.
Existing `inventory-import-warehouse-safety-f1-r1.test.js` updated (1 assertion) to the new scoped-dropdown contract —
**27/0**. **Full regression: 225 files, only the 4 known baseline failures (none new).** Bundle unchanged (`aaf5b07`).

## §20 Deployment
- **PRE HEAD** `279d9d3` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `05_overseas_inventory_handlers.gs`** (new pure scope-check + handler gate).
- **New `/exec` deployment: YES** (handler behavior changed — the deployed Web App must include the scope gate for
  server-side enforcement). Backward-compatible: the scope gate only fires when `options.scope` is present; a frontend
  shipped ahead of the backend degrades to the existing per-row eligibility (no scope enforcement) until `05_` is live —
  so deploy backend with/before the frontend for full safety.
- **Router changed: NO** (reuses the existing `importOverseasInventorySnapshotBatch` action).
- **Frontend deploy: YES — `overseas-stock.js` + `overseas-stock.html`.** **Bundle: NO** (`05_` is not a bundle source).
  **DB/schema: NONE** (`warehouses.company`/`country` already exist).
- **API contract delta:** `importOverseasInventorySnapshotBatch` gains an optional `options.scope = {company, country,
  warehouse_id}`; response adds `code`/`details` on a scope failure. No existing field changed.
- **Rollback:** revert this commit (frontend reverts to the all-eligible template; backend scope gate no-ops without
  `options.scope`).

## HALT tokens
None (warehouse company/country authority unambiguous; eligibility rule reused; identity = warehouse_id; existing
per-row+scope gate is pre-write fail-closed; no schema/API-migration needed).

## FINAL GATE — PASS
Import requires a valid Company + Country + Warehouse ✓ · selectors relationally constrain one another ✓ · template
belongs to ONE warehouse ✓ · backend verifies EVERY row against that warehouse ✓ · mixed/mismatched files fail closed ✓ ·
company/country remain master-derived ✓ · no inventory business semantics/schema changed ✓.

**Return to:** F1-7E-PREREQ-5-AI-PLAN-FIRST-LAYER-COMPOSER-AND-CUTOVER-R1 (already complete) — i.e. the API-migration
sequence resumes at the user's next round. Remaining debt: `OVERSEAS_IMPORT_MASTER_READ_API_DEBT` (scoped warehouse-master
read for this modal).
