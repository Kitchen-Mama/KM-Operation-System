# API v1 — Weekly Shipping Plan READ-ONLY Workspace Spec (Phase API-2, 2026-08-04)

> **Status: SOURCE-PRESENT / TEST-VERIFIED. NOT DEPLOYED. NO PAGE CUTOVER.** The first real Workspace resolver: `weeklyShipping.workspace.get`. Read-only — no write, no status/quantity change, no recommendation, no submit, no reservation, no schema change. The Weekly active page **remains on the legacy transport**; this round proves the resolver independently behind a default-OFF per-workspace flag.
> **PRE HEAD:** `1ca1a4e`. **Owner files:** server `assets/specs/active/apps-script/40_api_v1_weekly_workspace.gs` (+ thin dispatch in `01_router.gs`); client resolver in `assets/js/api/km-api-foundation.js`.

---

## 1. Canonical action + transport

- **Action:** `weeklyShipping.workspace.get` (registry workspace key `weeklyShipping`).
- **Transport:** a **body-carrying READ** dispatched in `doPost` (it needs a JSON request DTO for filters/sort/page). It performs **no writes** — POST is used only because the request carries a body. Legacy handler/action names are unchanged; no alias introduced.

## 2. Request DTO

```
{ apiVersion:"1", action:"weeklyShipping.workspace.get", requestId:"REQ-…",
  payload: {
    filters: { company, country, marketplace, status, planningCycle, sourceWarehouseId, destinationWarehouseId },
    search: <string|null>,
    sort:   [ { field:"updated_at", direction:"desc" } ],
    page:   { number:1, size:25 },
    include:{ summary:true, plans:true, details:true, filterOptions:true }
  },
  context: { actor:null, clientVersion:null } }
```

- Supported **filters** are exactly the seven above (derived from the Weekly view; `currency` is deliberately **not** a filter even though the column exists). Empty filter ⇒ no restriction. No hidden default company/country/site; no first/latest-row guessing.
- `page.number` is 1-based; `page.size` is bounded (default 25, **max 100**). Sort `field` is **allow-listed** (`updated_at`, `status`, `company`, `country`, `marketplace`, `total_qty`, `plan_version`, `plan_id`); anything else → `VALIDATION_FAILED`. Filter values are normalized deterministically (trim; empty→null).

## 3. RequestId (correlation, not idempotency)

- Client may supply `requestId`; validated against `^REQ-[A-Za-z0-9_-]{1,40}$`. Missing/invalid → server mints a safe correlation id `REQ-S<6-digit-seq>`. The response **always echoes** the final `requestId`; the server log includes `requestId + action`. Contains no business data. **Not** an idempotency key. Deterministic sequence is injectable for tests (`io.nextSeq`); wall-clock/RNG live only in the API diagnostic layer, never in the pure builder.

## 4. Per-workspace feature flag

```
USE_WORKSPACE_API        = false            // global master
WORKSPACE_API_ENABLED    = { weeklyShipping:false, inventoryReplenishment:false, requestOrder:false,
                             purchaseOrder:false, shipment:false, fcSummary:false, skuDetails:false }
effective(weeklyShipping) = USE_WORKSPACE_API && WORKSPACE_API_ENABLED.weeklyShipping && status==IMPLEMENTED
```

- **Hybrid gate:** master OFF → legacy always. master ON + **IMPLEMENTED** (weeklyShipping) → needs its per-workspace flag; if off → **legacy** (disabling Weekly restores Legacy immediately). master ON + **UNIMPLEMENTED** (the other six) → workspace path → `WORKSPACE_NOT_IMPLEMENTED` (fail-closed, no silent legacy fallback). **No dual execution / no dual read.** Default all false. Setters `setWorkspaceApiEnabled` / `setWorkspaceEnabled(name,bool)`; no admin UI.

## 5. Server owner + targeted batch read

`doPost → 01_router.gs (thin) → handleWeeklyShippingWorkspaceGet_(body, io) → weeklyWorkspaceBuild_ → canonical envelope`. One server execution: **open + exact-ID-validate the bound Spreadsheet ONCE**, read **each required table once**, build header maps, filter/join/group in memory, return one bounded response. It **never** calls `getOperationDb` (44 tabs). Business-heavy build lives in `40_…gs`, never in `01_router.gs`.

## 6. Tables read (minimum set)

| Table | Why | Key columns validated | Grain |
|---|---|---|---|
| `shipping_plans` | plan headers | `shipping_plan_id`, `status` | 1 row/plan |
| `shipping_plan_lines` | line detail + totals | `shipping_plan_id`, `sku` | 1 row/line |
| `warehouses` | source/dest warehouse join (id→code/name) | `warehouse_id` | ref |
| `carriers` | selected-carrier display (id→name) | `carrier_id` | ref |

**Excluded:** all shipment/PO/inventory/forecast/recommendation tables; `carrier_rate_cards` (rate candidates are a later advanced slice); the whole-DB read. Join identity is always the canonical **ID** (`warehouse_id`, `carrier_id`, `shipping_plan_id`, `shipping_plan_line_id`) — never display text or array position.

## 7. Safety (S0/S0.5 preserved)

Reuses `29_production_safety_adapter.gs`: exact Spreadsheet-ID gate (`prodAssertDbTarget_`, fail-closed on blank/wrong id, no id leaked); validate-only sheet resolver (`prodRequireSheet_`, no create/repair) + presence-only column check (`prodRequireColumns_`, order-independent). Missing Sheet → `SCHEMA_NOT_PROVISIONED`; missing column → `MISSING_REQUIRED_HEADER`; wrong target → `WRONG_SPREADSHEET_TARGET`. No Sheet creation, no Header repair/append, no structural mutation, no migration. Read-only does **not** relax the exact-target gate. Server KMSAFE remains the authority.

## 8. Response View Model

```
{ filters:{ options:{ companies[], countries[], marketplaces[], statuses:[{status,statusLabel}],
                       planningCycles[], sourceWarehouses:[{warehouseId,warehouseCode,name,type}],
                       destinationWarehouses:[…] }, applied:{…} },
  summary:{ totalPlans, draftPlans, approvedPlans, cancelledPlans, totalUnits,
            estimatedCost:<single-currency|null>, currencySummary:[{currency,amount}] },
  plans:[ { planId, planNo, planName, planningCycle, company, country, marketplace,
            status, statusLabel, sourceWarehouse:{id,code,name}, destinationWarehouse:{…},
            shippingMethod, lastMileDelivery, customsType, carrier:{id,name}, planVersion,
            totalQty, estimatedCost, currency, updatedAt, lineCount, flags:[] } ],
  detailsByPlanId:{ "<planId>":{ lines:[{lineId,planId,sku,siteSku,marketplace,requestedQty,approvedQty,
                                        cartonQty,unitsPerCarton,status,statusLabel,note,flags}],
                                 notes:[], readiness:{}, issues:[] } },
  pagination:{ pageNumber, pageSize, totalItems, totalPages },
  dataVersion:{ sourceDataAsOf, latestUpdatedAt } }
```

- **Status:** raw canonical `status` is **always retained**; `statusLabel` is display only (`WEEKLY_WS_STATUS_LABELS_`; unknown → humanized code). No new status enum.
- **Line mapping:** canonical `shipping_plan_line_id`; same-SKU lines are **not merged** (no aggregation invented). `totalQty` = Σ effective line qty (`approved_qty` when > 0 else `requested_qty`) — a display total, not a recommendation.
- **Summary:** computed **after filters, before pagination**. Multi-currency costs are **never** aggregated into one number — `currencySummary` lists per-currency sums; `estimatedCost` is non-null only when exactly one currency is present. No FX conversion.
- **Filter options:** deterministic, deduplicated, ID-based (warehouses keep id/code/name/type). Carrier options are selected-carrier references only; rate candidates excluded.
- **Pagination:** filter → stable sort (tie-break by `planId` asc) → paginate; details attached **only for returned-page plans**; out-of-range page → empty items with correct metadata.
- **dataVersion:** `latestUpdatedAt` = max `updated_at` among the filtered set (real source metadata; server time is **not** fabricated as data version). No DB column added; no optimistic concurrency for this read.

## 9. Envelope + error normalization

Canonical `{ success, data, meta, errors }`. `meta` carries `apiVersion:"1"`, `source:"workspace"`, `action`, `workspace`, `requestId`, `serverDurationMs` (diagnostic only — injectable clock; no SLA), `tablesRead`, `cached:false`. On any failure (wrong target, missing table/header, validation, build error) → `success:false`, `data:null`, `errors:[{code,message,details}]`. **A business failure can never become a false success**; a nested `{success:false}` is not treated as success; malformed builder/response fails closed; an empty legitimate dataset is `success:true` with empty arrays.

## 10. Client resolver (no page cutover)

`getWorkspace("weeklyShipping", params, opts)` → when effective flag true → `buildWeeklyRequestDTO` → `workspaceInvoke` (ApiTransport POST, injectable) → `normalizeWorkspaceEnvelope`. When false → legacy path. No dual execution; no legacy fallback after the workspace path is chosen; no auto-retry. `opts.signal` (AbortSignal) supported — a pre-aborted signal returns an `ABORTED` envelope without invoking; every response carries a monotonic `meta.sequence` so page-cutover code can ignore a stale result. **The Weekly page is NOT cut over** — the resolver is proven independently.

## 11. Cache

TTL = 0 (disabled) — no Weekly cache hits, no stale data, `meta.cached=false`. Targeted invalidation is the future write-slice seam; not implemented here.

## 12. Exclusions (API-2)

`getWeeklyPlanRateCandidates` / `updateShippingPlanRationale` / `selectShippingPlanCarrier` (later Weekly **advanced** slice); `combineShippingPlans` / `uncombineShippingPlans` (**spec-superseded**, not implemented); all Weekly **writes** (status/qty/note/complete/approval), shipment creation, reservation, stock deduction; Recommendation generation/submit. None are dependencies of this read.

## 13. Performance evidence

- Tables read per request: **4** (one read each), vs the legacy **44-table** `getOperationDb`. `meta.tablesRead=4`; `io._reads` proven = `[shipping_plans, shipping_plan_lines, warehouses, carriers]`; `getOperationDb(` never called (source + test).
- `meta.serverDurationMs` present (diagnostic). Representative fixture payload is a bounded page (default 25).
- **Classification: `ARCHITECTURALLY_REDUCED_IO` + `LIVE_LATENCY_UNVERIFIED`** — no production latency claim without live measurement.

## 14. Tests

`assets/tests/km-api-weekly-workspace.test.js` (**64 assertions, 0 failed**): pure builder (mapping, filter/sort/pagination, summary, multi-currency, filter options, line identity, dataVersion), handler with injected io (timing, requestId, tablesRead, targeted reads, fail-closed, empty dataset), client resolver (registry graduation, per-workspace flag, no dual execution, requestId propagation, abort, sequence, business-failure/malformed → no false success, cache, other-workspace non-impact), and legacy↔workspace parity fixtures. Existing API-1 (57) + F2 compat (42) updated for weeklyShipping's graduation and green.

## 15. API-3 gate (next, after a new authorized round)

Cut the Weekly page read over to `getWorkspace("weeklyShipping")` behind the per-workspace flag; add F3 reachability diff (every FULLY_CONNECTED control stays connected); browser-smoke on the Verification Copy; then the write slice (status/qty/note) with targeted invalidation. Recommendation stays last. **No cutover / no Production this round.**

---

*Companions:* `API_WEEKLY_SHIPPING_PARITY_REPORT.md`, `API_FOUNDATION_ARCHITECTURE.md`, `API_FUNCTIONAL_COVERAGE_F2.md`, `API_MIGRATION_MASTER_PLAN.md`. Release: `40_api_v1_weekly_workspace.gs` + `01_router.gs` = `APPS_SCRIPT_SYNC_REQUIRED`; `km-api-foundation.js` = `FRONTEND_GITHUB_PAGES_REQUIRED`; `BUNDLE_REBUILD_REQUIRED=false`. Not pushed, not deployed.
