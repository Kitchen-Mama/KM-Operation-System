# PL Declaration Compatibility

## Cause

Production's read-only result has 249 tax_referral_rates rows, with US, CA, FR, DE,
ES, UK, AU and JP only. There is no EU or PL record. The EU factory-origin shipment
to WRO5 therefore fails its embedded invoice with MISSING_DECLARED_VALUE. Switching
lookup to EU would not solve this either.

The user explicitly approved PL -> DE declaration compatibility on 2026-11-26.
Snapshot and currency preflight retain the physical PL lookup. An effective exact
PL record wins; only NOT_FOUND invokes DE with the same Series, origin and date.
Ambiguous/invalid PL records cannot be hidden by fallback. DE records with wrong
origin, invalid dates, duplicates, missing currency or nonpositive value still block.
This is an approved business rule, not a geographic inference or customs advice.

Only declaration unit value, currency, HS Code and origin are inherited. No duty,
VAT, port-tax or referral rates or VAT/EORI registrations are copied. Native PL rows
keep their own registrations. The selected DE tax_rate_id is frozen per line; the
existing readiness_detail JSON stores the compatibility policy and source per SKU.
No schema columns, master rows or existing snapshots are changed.

Consignee address/country, destination validation, transport quoting, lead times
and route binding remain PL for WRO5. Tax quotation and rate-card calculation are
not changed. FR/ES/EU/other jurisdictions do not acquire the DE fallback. All carriers
consume the same frozen declaration rather than maintaining individual rules.

Missing declaration errors now include SKU/line, the missing value/currency,
document duty_country, tax_match and tax_rate_id in Confirm and diagnostics. The
snapshot remains absent on refusal, with no stock/PO/Drive writes from that gate.
The preceding overseas-source no-document policy remains intact.

## Deployment

Apply on top of the completed overseas-no-documents update. Replace these four GS
files from `output/eu-document-customs-20261126/gs/`, then publish a new web-app
version at the same /exec URL:

- 01_router.gs
- 34_shipment_final_output_handlers.gs
- 39_document_runtime_service.gs
- 63_api_v1_system_health.gs

34 and 39 stamps end EUT1; 01/63 pin those exact owners. Do not restore an earlier
router afterward. Keep private config/auth, 66, bundle and all other GS unchanged.
No sheet migration or live data repair. README/manifest are not Apps Script files.

Build: `node assets/tools/build-eu-document-customs-release.cjs`.

## Verification

```powershell
node assets/tests/eu-document-customs-scope.cjs
node assets/tests/carrier-document-contract-r2.cjs
node assets/tests/overseas-no-documents.cjs
node assets/tests/overseas-no-documents-browser.cjs
node assets/tests/shipment-document-recovery.cjs
node assets/tests/manual-allocation-production.cjs
```

Synthetic tests execute the actual snapshot aggregator with real tax and party
resolvers, PO conservation and source tables, then the actual frozen-value gate
and invoice model. Only the external shippingTaxDay boundary uses the existing
19_ taxDate_ adapter for the ISO-day fixture; the rate-label and final mapping
boundary are isolated in the focused gate test. The carrier contract regression
separately exercises real saved mappings and synthetic workbook copy/fill/PDF.
No production dispatch, stock/PO update or Drive generation is performed.
