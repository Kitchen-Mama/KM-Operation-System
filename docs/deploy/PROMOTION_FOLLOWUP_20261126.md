# Promotion Follow-Up (2026-11-26)

## Frontend

Release token: `promo-ratio-20261126-v1`.

- Mixed-carton editor waits for the complete active site-SKU catalogue, disables interim choices, and displays the loaded count. Catalogue failure is not presented as a card-only selection.
- Risk uses distinct positive-sales dates from `amazon_daily_sales_snapshot`. The numerator is the union of Campaign and Special Event dates intersecting those selling dates. Safe <30%, Warning 30%-50%, High Risk >50%. Future campaign windows end the day before their own start; incomplete observations are marked, and missing observations are never advertised as Safe.
- Campaign Performance > Campaign Overview lists canonical Campaign/SKU rows, including both authoring entry points. Eight requested filters, inclusive activity-period overlap, shared Shipment Overview date modal, pagination, read errors and refresh are included.
- Add Promotion styling is unchanged. Special Event retains Growth, Adjust %, Adjust fixed quantity and Manual calculations.

## Required Backend Delta

Generate with `node assets/tools/build-promotion-followup-release.cjs`. Output: `output/promotion-followup-20261126`.

Replace these THREE files together in the existing Apps Script project, then deploy a new version to the SAME `/exec` deployment:

1. `01_router.gs`
2. `20_campaign_write_handlers.gs`
3. `63_api_v1_system_health.gs`

This delta assumes the previous Carrier version repair is installed. Do not deploy the entire local source mirror: in particular, do not copy `66_api_v1_request_order_send.gs` over the newer live version. No private configuration, password module, generated shared bundle, schema migration or business-data edit is included.

Expected Campaign module: `CAMPAIGN-BUILDER-APPEND-20261126-V2`. Expected policy hash is recorded in `MANIFEST.json`. The frontend accepts the exact pre-append production policy during rollout, preserving existing reads and commands. Appending new SKUs is NOT fixed on the live backend until this delta is deployed.

Same site, name, window, promotion type and event flag reuse one existing Campaign header. Only new SKU lines and linked period FC rows are appended. Existing headers, SKU prices and FC remain unchanged. Duplicate SKU or conflicting header identity is refused. The shared import journal retains locking, idempotent replay, verified readback and rollback. Receipt counts describe the whole saved Campaign graph; added counts are reported separately.

## Verification

Focused tests cover two sequential UI saves into one unchanged Campaign, failure rollback preserving the original graph, replay, overlap/duplicate refusal, exact threshold boundaries, date deduplication, source ownership, future anchors, truncated-source refusal, all eight overview filters, shared date modal and desktop/mobile screenshots.

Tests use synthetic fixtures and actual repository handlers/normalizers; no live Campaign, Shipment or recalculation was created. Backend production acceptance remains owner-deployment dependent. Read-only Google Sheets sampling confirmed the source column names; records with missing dates are not assigned invented sale dates.

The legacy whole-site suites are not all green: `route-mount-registration-boot-fc-r2-f1` retains three baseline failures (password-management registration, obsolete blocking-script count and its dependent mutation check); its new-route HTML-as-JavaScript harness issue is corrected. `s4-r3-route-owned-code` reports thirteen failures, including stale release-token expectations and obsolete mutation anchors/cadence expectations. Its nine A-F failures were reproduced against unmodified HEAD using an in-memory read overlay. These suites are reported separately from the passing feature/browser tests; this release does not claim a green repository-wide suite.
