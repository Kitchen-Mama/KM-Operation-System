# StockPO Unproduced Quantity Upgrade

Date: 2026-11-24 (Asia/Taipei)
Baseline: a5225611c7ea9012c9eceaa1876dd2a332fdca90
Target: Production only; Sandbox and live business data are untouched.

## Confirmed Contract

The user confirmed that ordered_qty=1000, quantity=200 and unproduced_qty=300 means 500 units were historically shipped/consumed. New receipt now offers the optional column `未生產數量 unproduced_qty` (technical and Chinese-only header aliases are accepted).

For a NEW PO with this column filled:

- quantity and unproduced_qty are nonnegative safe integers; ordered_qty is a positive safe integer.
- quantity + unproduced_qty <= ordered_qty. Excess is rejected before writes.
- historical consumed = ordered_qty - quantity - unproduced_qty.
- completed_qty = ordered_qty - unproduced_qty; shipped_qty = historical consumed; remaining_qty = quantity.
- The factory stock delta is quantity ONLY. Zero stock plus positive pending production is allowed and creates no stock movement.
- A fully pending PO is issued, partial production is partial_completed, and full production is completed. Issued and partial_completed are directly receivable in the existing Workspace, without a Draft approval or Send PO round trip.
- The existing receipt handler consumes only ordered_qty - completed_qty and posts newly received goods to factory stock. Existing reservation and receipt precondition/idempotency rules remain intact.

Example: import adds 200 stock, records completed=700/shipped=500/remaining=200, and leaves 300 receivable. Receiving 300 produces completed=1000/shipped=500/remaining=500 and physical stock=500, not 1000.

## Historical Evidence

Historical consumed units are a declared opening counter, NOT fabricated shipment rows, allocations, routes, or stock-out movements. opening_completed_qty records the initial completed total; opening_shipped_qty records declared consumed units; opening_lineage_qty stays zero. The initial physical balance is covered by this import's stock delta, so its opening reconciliation status is RECONCILED.

32_ accepts this baseline only for a po_factory_import parent and the same original line/import batch, with one COMMITTED NEW_RECEIPT receipt and matching CREATED audit facts for identity, quantities and opening status. Missing, changed, pending or duplicate evidence fails closed. Normal legacy shipped counter drift remains blocked. Execution reconciles `shipped_qty = proved historical consumed + executed allocations`, retaining capacity checks and retry behavior.

Preview explicitly displays ordered, stock receipt, pending production and historical consumed quantities before Apply. Readback verifies opening counters and import provenance as well as ordinary PO quantities. Landed movement failures and silently changed opening counters roll back the entire import's business writes.

## Compatibility

- Blank/omitted new column preserves legacy New receipt behavior; no historical consumption is inferred.
- Existing PO receipt rows still require exported line IDs and row_version. A filled unproduced_qty must exactly equal ordered - previous completed - this receipt; it cannot rewrite historical counters.
- The new declaration is limited to New receipt. Update current data and opening coverage modes retain their previous contracts.
- This upgrade does NOT backfill previously imported POs. Do not re-import existing stock as a new receipt to repair old history: existing-line corrections require a separately reviewed task.
- The browser omits the optional all-blank column from generated batch hashes, preserving old file identities. Explicit values, including zero, are part of the hash.
- No DB columns, OAuth scopes, config, PIN, router policy or schema migration changed. Retains the latest registered site-SKU behavior in 82_, not the older DW2 82_ baseline.

## Installation

Build: `node assets/tools/build-po-factory-unproduced.cjs`.
Release: `output/po-factory-unproduced-20261124/release-2` (supersedes the local release-1 candidate).

Update BOTH complete Production GS files: 32_shipment_line_allocation_handlers.gs and 82_api_v1_po_factory_import.gs. Save both before deploying a new version of the EXISTING Production Web App deployment, preserving its URL and access settings. 82_ refuses positive historical consumption if the new 32_ rule is missing. Git push does not deploy GS.

The four frontend files in Production/site-delta are published through GitHub Pages: index.html, assets/js/pages/factory-stock.js, assets/js/pages/purchase-order-list.js, assets/js/utils/po-factory-import.js. They only update optional-column batch hashing and cache versions; Workspace/Overview rendering and receipt code are reused.

Retain all previous installed fixes, including manual-allocation 01/15/63, shipment Overview 57 and EU delivery 22/80. Do not replace 00, 84, 90 or unrelated GS modules. Rollback files are exact public source from the baseline; rolling back code does not undo committed business data. Do not remove the new 32_ evidence reader after creating positive-consumption imports without reviewing those lines first.

After deployment refresh Production and download a NEW New receipt template. Fill unproduced_qty explicitly (zero means no pending production; blank means legacy behavior), validate, inspect the consumption preview, then apply. Test on an authorised business case only; all agent verification used synthetic data.

## Verification

- Focused Node suite: 33 tests covering declarations, boundary sums, zero-stock pending POs, legacy blanks, receipt, actual allocation execution/replay, unproved/reused history refusal, parent ownership, stale preview and rollback faults.
- Focused Playwright: 22 desktop/mobile checks covering actual XLSX download/parse/validate/commit, legacy batch identity, Workspace Receive and Overview readback, exact remaining production, full receipt and same-key retry.
- Combined Node regression: 134 tests passed including site-SKU imports (27), order mainline (15), monthly allocation Production gates (10), EU shipment imports (49), and this feature (33).
- Mainline browser regression: 64 checks passed. Import template XLSX extension/locking and 250-row roundtrip/gate checks passed.
- No live PO/stock import, receipt, dispatch, document creation, GS deployment or Sandbox update was performed.
