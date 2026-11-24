# Production: Direct Shipment Service and Active PO Workspace

Baseline: `491b3c8525f8edf9650278bf1e1038ed10c0e8be`.
Use `output/shipment-method-tail-20261124/release-2`; it supersedes the local release-1 package and also removes the obsolete rate-card-label instruction from the Carrier column.

## Changes

- New shipment templates offer transport method tokens only: `air`, `sea`, `sea_express`, `truck`, plus active master vocabulary. Last mile is separately required (`parcel` / `truck`). No rate-card labels in the dropdown.
- `_SYSTEM.scope.service_input=METHOD_LAST_MILE_V1` identifies the new input rule. Existing SHTPL1 label files retain their old interpretation; no schema or historical import identity change.
- Update exports show the stored method and Last mile separately; both remain read-only. Import cannot change an already dispatched shipment's transport.
- Matching route templates remain independent of quotes. The existing dispatch matcher can also prove EU-wide service when the generic carrier capability reader only accepts physical-country lanes. Missing/unreadable rate cards leave a missing-quote diagnostic; they do not block a new token file's proven route.
- Country, active carrier, warehouse ownership, route identity, origin, tail-mode and destination checks remain. No guessed position, first-match selection, invented rate or automatic stock write.
- PO Workspace lists Draft / unfinished In Production only. Completed and post-production orders remain available in Purchase Order Overview. Filtering occurs before selectors and pagination. No database rows are removed.
- PO Workspace mobile card summaries and action buttons stack vertically, avoiding compressed/overlapping columns.
- Existing import locking and idempotency are unchanged. `Another save is in progress` means the lock was not acquired; retry later, not a route error.

## Production Deployment

1. Push publishes the frontend through the existing GitHub Pages workflow. It does NOT deploy Apps Script.
2. In the existing **Production** Apps Script project, replace only `80_api_v1_shipment_import.gs` with `Production/apps-script/80_api_v1_shipment_import.gs` from this package.
3. Save, then Manage deployments > Edit the existing Web App > New version > Deploy. Keep the existing URL, permissions and configuration.
4. Keep the existing current Production `12_`, `17_`, `22_` and `87_` modules. The earlier EU shipment fix in `22_` must already be installed. Do not bulk-copy older root modules or replace the DW2 stock writers.
5. Refresh Production. Download a NEW Shipment Add New workbook. Verify the method dropdown has tokens, Last mile is required, and its note no longer asks for a rate-card label. Fill `truck` + `parcel`, not `卡派`.
6. Validate first: a matching active route should appear even with quote unavailable. Creating a route still requires the existing route/current-position selection; no actual position is inferred from ETD.
7. Verify completed POs have left Workspace, remain in Overview, and partially received POs still have Receive available.

No database migration, OAuth scope, router, PIN, credential or Sandbox change. This release does not populate DE route/rate-card master data, redesign the Rate Card UI, or apply any real import/receipt.

## Verification

- `node --test assets/tests/shipment-method-tail.cjs assets/tests/shipment-import-eu.cjs assets/tests/shipment-import-source-warehouse.cjs`
- `node assets/tests/shipment-method-tail-browser.cjs`
- `node assets/tests/po-active-workspace-browser.cjs`
- `node assets/tests/po-factory-unproduced-browser.cjs`
- `node assets/tests/order-mainline-browser-c1.cjs`
- `node assets/tests/order-mainline-browser-c2.cjs`

Browser runs use isolated in-memory Sheets/Drive fixtures and block real outbound requests. Screenshots and generated test workbooks live under `output/`; no live business data is modified.

## Rollback

Restore this package's `rollback/` copies for the touched frontend and `80_`, then redeploy the existing Production Web App as a new version. No data rollback or deletion is needed. Re-download templates after switching versions; old backend versions do not enforce the new `service_input` rule.
