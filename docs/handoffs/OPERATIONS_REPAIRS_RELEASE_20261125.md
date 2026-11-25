# Operations Repairs, 2026-11-25

## Frontend

- Review Submit adopts the Plan version acknowledged by its own quantity repricing. Genuine concurrent edits still refuse Submit. Urgent fix was published separately as 8ef85bea.
- Site Inventory shows overdue remaining quantities for FBA and 3PL incoming, with exact shipment-ID links to Global Shipment Tracking. Supply/Gap calculations are unchanged.
- Shipment-card selection preserves list and page scrolling; drawer focus does not scroll the page.
- Factory-share detail is wider, wraps all six columns, and has no horizontal table scrollbar at desktop/mobile fixture sizes.
- Review carrier/customs Save restores controls after a refusal and reports the actual code inline. Unverified/readback-failed outcomes require reconciliation, not a blind resend.
- Rate Card maintenance groups one service by carrier, origin/destination countries, method and last mile. Quick batch price updates carry optimistic tokens. New-service duplicates and exact duplicate rate rows are refused under a lock; tiers/destinations stay inside the service. Existing template workflows remain available.
- Country-only Plan pricing takes a deterministic representative active quote for each service and is labelled Estimated. It never writes a representative destination into the Plan. Concrete-destination Plan and Shipment Draft matching are unchanged.
- Order Planning waits for initiated allocation saves before Send. Blank notes on absent tiers no longer falsely count as unsaved edits. Positive unsaved quantities, nonblank notes, conflicts and invalid fields still block Send.

## Apps Script Installation

Replace the installed versions of:

- `01_router.gs`
- `11_shipping_plan_handlers.gs`
- `82_api_v1_po_factory_import.gs`

Add a new script file:

- `17b_carrier_rate_card_maintenance.gs`

The package also contains `16_shipping_allocation_handlers.gs` and `40_api_v1_weekly_workspace.gs` from the previous release, for installations that have not applied that package yet. Their source is unchanged by this release.

Do NOT replace the installed `17_carrier_handlers.gs` with this repository's older mirror. Preserve its compatible pricing/tax helpers and the existing 12_ engine. The new 17b_ module only owns maintenance and uses the existing importCarrierRateCards permission boundary. No new sheet columns, migrations, or credentials are needed.

Preserved existing build stamps because the Production profile pins those stamps. Use the package SHA256 manifest to verify source content. Save and redeploy the existing Web App deployment as a new version; preserve its URL and access policy. This work did not install or deploy Apps Script remotely.

## Import Guard And Existing Data

Synchronous PO / Factory Stock imports are now limited to 25 data rows per file, in both client and server. Large files are refused before business writes; no automatic splitting/replay. An unfinished batch gains a read-only residue report; it is never treated as committed by that report.

The separate live-data investigation is retained only in the local ignored output folder, not committed to the public repository. No production business rows, stock, movements, receipt statuses or emails were changed. Existing partial imports require a separately reviewed recovery; this code release does not repair them automatically.

## Verification

Focused offline suites exercise actual handlers and browser code, including optimistic conflicts, valid tiers/destinations, Save recovery, exact destination guards, overdue shipment identity, mobile modal layout, allocation-save draining and oversized import refusal. Map checks use the actual app with synthetic reads: scroll preservation, nonblank screenshot pixels and pointer-drag movement on desktop/mobile.

The historical `dc1-r1-source-write-epoch-and-reader-invalidation.test.js` has the same 35-pass / 8-fail result against both this worktree and the pre-change HEAD. These baseline cache/harness and stale writer-census failures were not altered here. No claim is made that every historical repository suite is green.
