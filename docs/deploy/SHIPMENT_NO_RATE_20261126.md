# Shipment No-Rate Policy, 2026-11-26

## Confirmed Cause

The production read for FBA15MZDZW3H shows CAR_TOP_SEALAND ASSIGNED, truck / parcel
saved, and matching ETD/ETA with lead time CLT-000012. There is no selected quote.
The actual refusal is LITHIUM_CARRIER_CLEARANCE_REQUIRED, not an unsaved carrier.
The automatic no-rate policy reused the old manual quote-exception rule, which
unconditionally refused lithium cargo before checking whether a quote existed.
The client then showed a generic service error and a misleading missing-carrier hint.

## Change

Automatic no-rate eligibility is distinct from manually leaving an available quote
unapplied. It permits known lithium classifications when no applicable rate exists,
keeps costs blank, and returns COST_PENDING_AUTO / COST_PENDING. It does not create
a zero quote, silently apply a non-lithium rate, select a different carrier, or assert
carrier clearance. A visible lithium reminder appears in the service editor and
Confirm modal. Carrier acceptance still needs independent operational confirmation.

The automatic path rechecks the active unique carrier, complete method/last-mile,
declared route service, valid SKU quantities and known battery classifications.
UK/GB use canonical same-country spelling in the service capability check.
Pending operations, selected quotes, stale cost fields, unknown classifications,
inactive/ambiguous carriers, unsupported services and cancelled shipments remain
blocked. An applicable quote still requires selection or explicit non-application.
Existing manual quote exceptions and unknown-outcome holds are not auto-cleared.

No-rate policy refusals expose their actual reason. An assigned carrier is no longer
reported as missing merely because an unrelated eligibility condition failed.
Freight cost pending is expected when no quote exists, not a failed service Save.
The shared 34_ document snapshot resolver uses the corrected 12_ policy, so both
the UI and actual document readiness agree; no change to 34_ is required.

## Deploy

Apply on top of the preceding EU/WRO5 package. Replace these same-named GS files,
then publish a new version of the existing web app, keeping the /exec URL:

- 01_router.gs
- 12_shipment_handlers.gs
- 63_api_v1_system_health.gs

No schema migration or live data repair. Keep all other GS files, private config,
authentication, 66_ and the generated bundle unchanged.
Build: `node assets/tools/build-shipment-no-rate-release.cjs`.
Package: `output/shipment-no-rate-20261126/gs/`.
README.md and MANIFEST.json are not Apps Script files.
12_ build now ends EUD1-NR1. Policy SHA-256:
`f1e0bdd348032e242d335b2e4496e573734672849237069cb23fff0f256b8762`.
The exact preceding policy remains accepted while GS is updated manually.

## Verification

```powershell
node assets/tests/shipment-no-rate-policy.cjs
node assets/tests/shipment-no-rate-browser.cjs
node assets/tests/manual-allocation-production.cjs
node assets/tests/shipment-return-review.test.cjs
node assets/tests/shipment-draft-eu-destination.cjs
node assets/tests/shipment-service-picker-browser.cjs
```

Tests use synthetic data only. They cover actual rate-options and document-label
resolution, all four battery categories, active quotes, service refusals, unresolved
operations, immutable blank costs, actual service Save and readback, and the normal
Confirm modal at desktop/mobile sizes. No live Dispatch, stock/PO mutation, or file
generation is performed.
