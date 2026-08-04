# API v1 — Weekly Shipping Workspace ↔ Legacy Parity Report (Phase API-2, 2026-08-04)

> **Purpose:** prove the new `weeklyShipping.workspace.get` View Model preserves the Weekly business result vs the legacy read of the same source rows. **Fixture-based** (no live Spreadsheet, no deployment). Differences are classified; **no business result was silently "improved".**
> **Verdict: PARITY HOLDS** — 0 `MAPPING_DEFECT`, 0 `MISSING_SOURCE`. All differences are `EXPECTED_VIEWMODEL_NORMALIZATION` (page-shape only).

---

## 1. Method

The legacy Weekly read normalizes `shipping_plans` / `shipping_plan_lines` / `warehouses` / `carriers` via `normalizeShippingPlanRecord` / `normalizeShippingPlanLineRecord` / `normalizeWarehouseRecord` / `normalizeCarrierRecord` (canonical field names in `operation-system-db-api.js`). The workspace builder (`weeklyWorkspaceBuild_`) reads the **same raw rows** and produces a page-oriented View Model. The parity test (`km-api-weekly-workspace.test.js` §Legacy ↔ Workspace parity) recomputes the legacy-derived expectation directly from the raw fixtures and diffs it against the workspace output.

## 2. Fields compared

| Field | Legacy source | Workspace field | Result |
|---|---|---|---|
| plan count | `shipping_plans` rows (id present) | `pagination.totalItems` | **MATCH** |
| plan identity | `shipping_plan_id` | `plans[].planId` | **MATCH** |
| status (raw) | `status` | `plans[].status` (+ `statusLabel` display) | **MATCH** (raw retained) |
| quantities | Σ line `approved_qty`>0 else `requested_qty` | `plans[].totalQty` | **MATCH** |
| source/dest warehouse | `source/destination_warehouse_id` → `warehouses` | `plans[].sourceWarehouse/destinationWarehouse` (id/code/name) | **MATCH** (join by id) |
| carrier display | `carrier_id` → `carriers.carrier_name` | `plans[].carrier.name` | **MATCH** (join by id) |
| line count | lines grouped by `shipping_plan_id` | `plans[].lineCount` | **MATCH** |
| line identity | `shipping_plan_line_id` | `detailsByPlanId[].lines[].lineId` | **MATCH** (never position) |
| currency | `currency` | `plans[].currency` | **MATCH** |
| notes/flags | `note` | line/plan `note` / `flags:[]` | **MATCH** (flags empty this slice) |
| summary | derived | `summary` (after filters, before pagination) | **MATCH** |
| filters | UI filter set | `filters.applied` / `filters.options` | see §3 |
| ordering | list order | stable sort + tie-break | see §3 |
| pagination | client-side | server-side | see §3 |

## 3. Difference classification

| Difference | Class | Note |
|---|---|---|
| Server-side pagination/sort replaces client-side list handling | `EXPECTED_VIEWMODEL_NORMALIZATION` | deterministic filter→sort(tie-break planId)→paginate; details only for the returned page |
| `statusLabel` added alongside raw `status` | `EXPECTED_VIEWMODEL_NORMALIZATION` | raw canonical status retained; label is display only |
| Multi-currency: `estimatedCost=null` + per-currency `currencySummary` | `EXPECTED_VIEWMODEL_NORMALIZATION` | prevents the legacy risk of a mixed-currency numeric total; **not** a business change |
| Filter options are ID-based deduped lists | `EXPECTED_VIEWMODEL_NORMALIZATION` | warehouse options keep id/code/name/type |
| `MAPPING_DEFECT` | **0** | none found |
| `LEGACY_DISPLAY_BUG_NOT_CARRIED` | **0** | no legacy display bug identified in the fixture set |
| `MISSING_SOURCE` | **0** | every fixture plan mapped |
| `UNKNOWN` | **0** | — |

## 4. Non-goals honored

No status transition, no quantity recomputation, no recommendation quantity invented in the Weekly workspace, no same-SKU line merge, no FX conversion, no write. The workspace **does not "improve" any business result** — it reshapes the same values into a page DTO.

## 5. Evidence gaps (browser/live)

Parity is **fixture-proven at source/test level**. Live parity against real `shipping_plans` data on the Verification Copy is an **API-3 / F5-class** item (deployment required) — **OPEN**. No live Spreadsheet was accessed and no Apps Script function was executed this round.

---

*Companions:* `API_WEEKLY_SHIPPING_WORKSPACE_SPEC.md`, `API_FUNCTIONAL_COVERAGE_F2.md`. Not pushed, not deployed.
