# EU Shipment Destination, 2026-11-26

## Cause

WRO5 (WH-RESTW-PL-FBA-WRO5) is an active ResTW / Amazon warehouse in PL.
Shipment Draft's picker, saved destination validation, quote resolution and document
country resolution still used the forecast/inventory planning set: EU/DE/ES/IT/FR.
Shipment import and route binding already used the separate EU shipping rule in
22_ csdShipmentDestinationCountryOk_. The Draft and later document paths now agree
with that existing shipping rule, including PL, without changing sales aggregation
or source inventory eligibility.

## Update

Apply on top of the preceding Shipment Presentation update. Replace these public
GS files and publish a new version of the existing web app with the same /exec URL:

- 01_router.gs
- 12_shipment_handlers.gs
- 22_shipment_dispatch_handlers.gs
- 39_document_runtime_service.gs
- 63_api_v1_system_health.gs

22_ is an unchanged dependency included to ensure the existing shipping country
rule is present. Only 01, 12, 39 and 63 changed. Do not change the warehouse's PL
country to EU. Keep the remaining GS files, private config, authentication, 66_ and
the generated bundle unchanged. No sheet schema, migration or live data repair.

Build: `node assets/tools/build-eu-shipment-destination-release.cjs`.
Package: `output/eu-shipment-destination-20261126/gs/`.
README.md and MANIFEST.json are not Apps Script files.
Policy SHA-256: `21998a70bf573bb35f588b295dd0421eafb5336e12190542bc27ef954b7e0547`.
12_ and 39_ stamps now end EUD1. Frontend accepts the exact preceding policy during
manual rollout; saving PL requires the new GS validation, not just the new picker.

## Behavior And Verification

An EU / ResTW / Amazon Draft can select the active Amazon FBA WRO5 warehouse.
Save retains its exact ID and WRO5 code; shipment business scope remains EU.
Quotes, lead times, route binding and documents use the actual destination PL.
No DE lane is borrowed for a PL destination. National scopes stay national, and
other-company, inactive, factory, duplicate and non-member warehouses remain gated.
All carriers use the shared destination checks; no carrier-specific bypass.

Synthetic tests only, no live writes or document generation:

```powershell
node assets/tests/shipment-draft-eu-destination.cjs
node assets/tests/shipment-import-eu.cjs
node assets/tests/shipment-presentation-browser.cjs
node assets/tests/manual-allocation-production.cjs
node assets/tests/shipment-return-review.test.cjs
node assets/tests/warehouse-document-destination.test.cjs
node assets/tests/shipment-document-recovery.cjs
```

Browser coverage renders the actual Draft picker at 1440px and 390px and verifies
the exact WRO5 option, excluded warehouses and unchanged Save identity payload.
No live shipment was dispatched, saved or repriced by these tests.
