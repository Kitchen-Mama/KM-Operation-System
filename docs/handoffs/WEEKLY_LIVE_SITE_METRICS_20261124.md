# Weekly Current Site Metrics Handoff

## Scope And Status

Complete: backend current-stock / normalized-average-sales / DoS display enrichment, plus future Submit source attribution in explicitly installed Production and Sandbox profiles.

This subtask changes only `16_shipping_allocation_handlers.gs` sadSite source/snapshot helpers and `40_api_v1_weekly_workspace.gs` optional read enrichment. It adds `assets/tests/weekly-live-site-metrics.test.cjs`. No grouping, GS11 card-check, consolidation, frontend, router, configuration, secret/private files, production spreadsheet writes or deployment work belongs to this change. Parent owns the shared GS11 card-check update; Copernicus/parent owns frontend opt-in and display.

Original `SP_BUILD_VERSION_` and `SAD_BUILD_VERSION_` stamps are unchanged. GS40 has no new build stamp. Do not change router/profile pins for this patch.

## Source Authority

- `sadSiteScopeActive1k_` recognizes either existing explicit marker: `RTR_SANDBOX_GATE_.env === 'KM_SANDBOX'` or `RTR_PRODUCTION_PROFILE_.environment === 'KM_PRODUCTION'`. No profile means `SITE_SOURCE_SCOPE_UNDECIDED`, not account attribution.
- Recognition is necessary but not sufficient: only the original Amazon report scope is admitted, and marketplaces must contain exactly one matching country/marketplace row with a nonblank company equal to the requested company. Duplicate rows, multiple companies, another owner, blank owner and another marketplace retain typed refusals. UK/GB matching remains supported.
- Future Submit still uses its existing snapshot capture/replay path. Only the erroneous Sandbox-only attribution restriction is lifted. Stock rows with missing country cannot leak into another country.
- `sadSiteCurrentStock1g_(ss, scope, sourceRows?, skuSet?)` and `sadSiteCompanies13_(ss, scope, sourceRows?)` accept pre-read rows. Existing callers remain compatible. GS40 uses the pre-read form, once per requested scope, without repeated sheet fetches.

## Frontend Contract

Request: `weeklyShipping.workspace.get` with `payload.include.siteMetrics: true` and `details !== false`. Without opt-in, the original five-table Weekly read remains unchanged; an empty page or details:false performs no additional canonical read.

Response: `data.detailsByPlanId[planId].lines[].liveSiteMetrics`:

```js
{
  state: 'READY', // otherwise 'UNKNOWN'
  company, country, marketplace, sku,
  currentStock, avgSalesPerDay, daysOfSupply,
  source, date, calculationDate, scopeValidated, warning
}
```

- READY requires independent current source/scope validation and at least one known nonnegative finite measured value. Unknown values are `null`, never fabricated zero. Actual zero stock and zero average remain numeric zero. DoS is rounded to one decimal only when average > 0; zero average leaves DoS null.
- The sidecar uses the exact plan company/country and the line marketplace (required for MULTI). A contradictory header/line identity is `SITE_METRICS_SCOPE_INVALID`, not a cross-site lookup.
- `source` is the canonical rate source (`normalized_30d` or `weekly_7d`) when available, otherwise `amazon_inventory_snapshot` for a valid stock-only reading. `date` is the stock snapshot date when stock is known, otherwise the calculation date. `calculationDate` always identifies the normalized-sales calculation date when available.
- Warning is freshly derived from current source validation, stock availability and the canonical sales owner. All immutable `line.raw.snapshot_*` values and their old warnings remain exactly unchanged.
- Copernicus's actual `_spLiveSiteMetrics_` / `_spLineDisplay` functions are exercised by the new tests: a matching fresh READY reading may recover the obsolete `SITE_SOURCE_SCOPE_UNDECIDED` warning. Historical stronger company/marketplace warnings remain protected by the frontend; mismatched sidecar identity cannot recover anything.
- Optional metric read/dependency/schema failures do not fail or hide the Weekly plan list. They produce UNKNOWN/null sidecars and typed warnings (`SITE_METRICS_READ_FAILED`, `SITE_METRICS_ENRICHMENT_FAILED`, source-specific refusals). Independently validated stock stays READY if sales/date/runtime inputs are unavailable.
- `meta.siteMetrics` reports keys/scopes/additional tablesRead; page work is deduplicated by site+SKU and capped at 1000 keys. Excess keys get `SITE_METRICS_PAGE_LIMIT`, not unbounded enrichment.

## Minimal Reads And Dependencies

Exactly one `KMPS.readCanonicalSnapshots(ss, {only: [...]})` call per opted-in nonempty workspace, with these eight keys:

| Key | Sheet |
| --- | --- |
| marketplaces | marketplaces |
| marketplaceSkus | marketplace_skus |
| amazonInventorySnapshot | amazon_inventory_snapshot |
| amazonDailySalesSnapshot | amazon_daily_sales_snapshot |
| amazonWeeklySalesSnapshot | amazon_weekly_sales_snapshot |
| campaigns | campaigns |
| campaignSkuLines | campaign_sku_lines |
| fcSpecialEvents | fc_special_events |

No full recommendation workspace, per-plan canonical read, per-SKU fetch or broad Operation DB getter is called. Raw rows are read once per table, reused per scope, and sales inputs are limited in memory to page SKU/source-country/site facts. Complete relevant campaign line identity is retained so canonical identity failures cannot be silently cleaned up by projection. Only bounded detail sidecars are returned, not those source tables.

Delivery changes: GS16 + GS40 for this subtask; GS11 is part of the parent's combined pricing delivery. Existing runtime prerequisites (retain compatible installed versions, no changes made here):

- GS11 `shippingPlanReadObjects_` for existing Submit/default sadSite readers. The optional GS40 pre-read path does not fetch through it.
- GS42 `recoWsResolveSalesRate_` plus its same-file helpers, and `recoWsDailyInventoryContext_` for the existing INVENTORY calculation date. Missing sales helpers do not suppress validated stock.
- GS43 `gapCalcResolveContext_`, called by the existing GS42 daily-date authority.
- GS90 bundled `KMPS.readCanonicalSnapshots` and `KMPS.tablesFor` with working `config.only` support; `KMCALC.normalizedAvgSalesPerDay`; canonical `KMCID` country/source-country helpers. The reader refuses a baseline that ignores `only` rather than silently reading all canonical tables.
- Existing profile globals supplied by the installed router/profile. No GS00/GS84/router edits are required or included.

## Verification

- `node assets/tests/weekly-live-site-metrics.test.cjs`: **18 passed**. Actual GS16/40/42, actual KMPS/KMCALC/KMCID modules, in-memory read-only sheets, and a labelled INVENTORY date seam. Includes Production + Sandbox, future Submit capture, normalized campaign/event exclusions, weekly fallback and explicit zero week, scope isolation, immutable raw snapshots, one read per table, stock-only runtime recovery, blank-marketplace guards, key backstop, reader failure and unexpected dependency/schema exception preservation.
- `node assets/tests/km-api-weekly-workspace.test.js`: **66 passed**.
- Additional broader legacy suites were attempted but are not passing in their unowned sections: `avg-sales-identity-and-blocked-horizon-s8-b3-r3-cp2r.test.js` fails a whitespace-sensitive GS42 blocked-horizon slice (`'  var mHz ...'`) and crashes on missing horizonBasis; `weekly-fallback-source-s8-b3-r3-cp2t-r2.test.js` passes its backend rate checks but its frontend extract omits `_irScopeTitle16_`; `supply-planning-calculations.test.js` reports 319 passed / 6 failed because old event-preparation expectations use 30 days while the current core returns the 45-day dates. None was edited to expand this task's ownership.

## Observed SHA256

Recomputed after final pricing/wildcard integration; recompute again if shared files change:

```text
11_shipping_plan_handlers.gs
0E9FB10FC4BAD7CDFD35E85AB2CD700306A08653D3E6BACD0CED427D53535171
16_shipping_allocation_handlers.gs
E92E026293DA699EB573D7BC3D547E9AA0F3D139CDB7EAD426D1E9C0AAC80043
40_api_v1_weekly_workspace.gs
93B899513EBD585343145EDC6402DC6F38A3CB670162BFEA110970EA68079AA8
```
