# Map Country Filter and Amazon Receipt Tracking

Baseline: `53122973237cdcbc5b1a729fa5929c48ce101165`.

## Behavior

- Map Controls replaces Destination (warehouse name) with Destination Country. The actual saved destination warehouse's country wins over a planning region such as EU; only one unambiguous master row is accepted. Fallback is the shipment country; UK normalizes to GB. This is client-side filtering of already loaded data, with the same filtered population for cards and map layers.
- Committed Amazon opening records (`IMPORT_HISTORICAL` + `DISPLAY_ONLY`) may record cumulative receipts through the existing `shipment.receipt.update` handler. DISPLAY_ONLY remains excluded from planning supply and inventory posting. It is not a prohibition on tracking receipts.
- Amazon receives the existing per-line Received / Remaining controls, Receive All (draft only), derived partial/full status and lifecycle events. Cards also show received / total / remaining. Partial receipt stays active, and its drawer stays open on mobile after readback.
- Full receipt removes the shipment from the active map/cards only after all lines, server status and the final receipt event agree, with no held/incomplete receipt. Received Today remains a statistic, not a completed-card filter. Records remain available in Shipment Overview.
- Amazon receipts always return SKIP_PLATFORM for posting, including a replay, even if the destination master later changes. No Amazon/overseas/factory stock, stock movement, PO or allocation is changed by this Amazon receipt. Non-posting destinations no longer consult unrelated overseas stock books. Normal 3PL receipt posting remains ledger-first and delta-only.
- Existing validation, lock, version conflict, replay and imported-route proof gates remain. Pending/unknown imports are still non-receivable. Manual arrival reports are allowed for committed Amazon tracking records, not unfinished/unknown imports; arrival is never an automatic receipt.
- Update Existing cannot change an Amazon opening total or its basis time after any receipt quantity exists, even if the header status write was interrupted. The shipped baseline is not silently reduced alongside received quantities.
- Cache keys updated for app.js, shipping-history.js and the lazily loaded map. No auth, API action, endpoint, source/destination ID, configuration, trigger or geographic renderer changes.

## Deployment

Git push and cloud Apps Script installation are separate operations. This package does not auto-deploy Apps Script or write Production business data.

1. In the existing Production Apps Script project, replace only these two files together from `Production/apps-script/`:
   - `31_shipment_receipt_route_handlers.gs`
   - `80_api_v1_shipment_import.gs`
2. Save both, then edit the existing Web App deployment to use a new version. Keep its existing deployment/endpoint. Do not copy 00_, 01_, auth files, credentials, other modules, or rollback files into Production.
3. The frontend files under `Production/site/` are committed to main for the existing GitHub Pages publish. Refresh the browser after publication and the backend update. An old backend still refuses Amazon receipt tracking; do not interpret the frontend alone as a completed backend deployment.
4. Confirm a real Amazon shipment accepts a partial receipt, reports the correct remainder and leaves Site Inventory Current Stock unchanged. Confirm full receipt leaves the active map and remains in Overview. Do this only as an intentional business receipt, not as a deployment test on arbitrary live stock.

**No DB columns or migrations are required.** Existing shipment_received_qty, shipment status, updated_at and shipment_events are reused.

## Sandbox Boundary

This change does not synchronize or overwrite Sandbox. Git push updates the repository and its configured Pages frontend; it is not an Apps Script project copy or a database synchronization. Local output packages are excluded by .gitignore. A later Production-to-Sandbox synchronization should separately inventory code versions, preserve Sandbox's own endpoint/DB/auth identity, and decide whether any data should be copied. No such copy was performed here.

## Verification

- `node --test assets/tests/map-country-amazon-receipt.cjs`: 15 tests, real receipt handler, partial/full/replay/incomplete/conflict/invalid lines, missing event, manual arrival, import-total freeze, country resolution, completed-card exclusion and actual 3PL posting regression.
- `node assets/tests/map-country-amazon-receipt-browser.cjs`: 26 checks across 1440 and 390px. Real UI + real receipt handler over isolated Sheets boundaries. Nonblank WebGL pixels and pointer movement checked, country/clear filters exercised, partial/full receipt saved, draft-only Receive All and no-stock effects verified. Screenshots under `output/map-country-amazon-receipt-20261124/browser/`.
- Existing import suites `shipment-method-tail.cjs`, `shipment-import-source-warehouse.cjs`, `shipment-import-eu.cjs`: 82 tests passed. Existing panel suite `shipment-map-control-panel-r12.test.js`: 41 assertions passed, with its expected filter key updated to the new contract.
- Stock compatibility fixture uses the frozen Production 05_/21_ helpers from DW2 release-4; these are not modified or deployed in this package. Baseline 31_ was verified byte-equivalent (normalized line endings) to that Production release.
- Legacy test limitations: `shipment-map-route-eta-receiving-f1-shipment-map-r10.test.js` has two pre-existing source-regex failures (44 pass, 2 fail), reproduced with the unmodified HEAD map: one expects an obsolete UI busy pattern, another mistakes read-model status literals for status writes. `shipment-receipt-route-f1-shipment-receipt-r1b.test.js` cannot extract its removed PURE_START marker from the baseline source. These old suites are not claimed green; the new handler/browser tests exercise the actual receipt path instead. No full-repository sweep claimed.
- No authenticated Production receipt, DB mutation, Apps Script deployment, trigger change, credential read or Sandbox write was performed by Codex.

## Rollback

Restore the six files under `rollback/` together. Reinstall the two rollback GS files in the same cloud project and redeploy its existing endpoint; reverting Git alone is not a backend rollback. Existing recorded receipts are business facts and are not undone by a code rollback. Do not delete receipt quantities or events to restore the old display.
