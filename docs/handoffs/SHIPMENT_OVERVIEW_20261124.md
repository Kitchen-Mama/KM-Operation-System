# Shipment Overview Production Overlay

Baseline: `30267ee835bc8e5abba47685e73c5e67e3659441`.

## Scope

- Hide display-only/opening timestamp metadata from Overview headers only. Remove empty Plan labels.
- Give Overview IDs and status badges independent grid tracks; responsive details and scrollable SKU tables.
- Historical imports derive missing carton count, line-total cubic metres, gross kg and net kg from an exact, unique SKU Details reference. Net uses item weight, matching Shipping Plan.
- Saved totals win; invalid saved metrics and absent/duplicate references stay unknown. Incomplete totals show `--`, not partial sums disguised as complete totals. No invented carton number ranges.
- Optional `skuLogistics` include in 57_ reads SKU Details once and projects only logistics columns for returned active lines. The adapter preserves omitted (old backend) versus empty references. Targeted readback refreshes the affected SKU references.
- Operational/nonhistorical shipment metrics, Draft workflow, supply eligibility, dispatch limits, stock, receipts, routes and document generation are unchanged. Estimates are not persisted or document snapshots.

## Installation

Artifact: `output/shipment-overview-20261124/release-1`.

Replace only `Production/apps-script/57_api_v1_shipment_workspace.gs`, save and update the existing Web App deployment to a new version. Keep the endpoint, DB binding and all environment-specific configuration unchanged. No migration, initializer, reimport or 90_ bundle rebuild.

The existing SO7 coarse module stamp remains for compatibility with 63_/router policy. A matching System Health stamp does not prove the optional projection is deployed: the `/exec` workspace response must carry `skuLogistics` when requested. Old GS remains readable but cannot provide inferred missing metrics. Refresh frontend after both pieces are published.

The local Sandbox server and frozen cumulative Sandbox package are deliberately untouched by this Production overlay.

## Verification

- `node --test assets/tests/shipment-overview-logistics.cjs assets/tests/shipment-draft-marketplaces.cjs assets/tests/shipment-import-source-warehouse.cjs`
- `node assets/tests/shipment-overview-logistics-browser.cjs`: actual 57_ DTO -> adapter -> card, 3840/1440/390, alignment, no overlap, expand, inferred/incomplete totals, old GS compatibility, targeted readback, immutable input and no outgoing network.
- `node assets/tests/api-shipment-workspace-f1-7f-r1.test.js`: 45 checks.
- `node assets/tests/shipment-overview-multiselect.test.js`: 22 checks.
- `node assets/tests/shipment-draft-expand-and-map-fidelity-f1-7n-fa-4a-v3g6a.test.js`: 112 checks.
- `node assets/tests/shipment-draft-marketplaces-browser.cjs`: desktop/mobile regression.
- `node assets/tests/order-mainline-browser-c2.cjs`: 39 checks, synthetic mainline through PO document, receipt and Overview.
- `domestic-workflow-dw2.cjs` against frozen DW2 release-4 Production GS: 40 checks.

All executed business handlers use synthetic Sheets/Drive. No live Production imports, dispatches, receipts or document creation.

Known pre-existing test limitation: `shipment-receipt-route-f1-shipment-receipt-r1b.test.js` and `shipment-receipt-overseas-posting-f1-shipment-receipt-r3.test.js` stop before assertions because their `__SHIP_RECEIPT_PURE_START__` marker is absent in baseline HEAD's unchanged 31_. They are not counted as passed; this narrow display change does not claim new live receipt UAT.
