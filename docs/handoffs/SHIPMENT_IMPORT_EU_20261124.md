# Shipment Import EU Destination Fix

Date: 2026-11-24 (Asia/Taipei)
Baseline: 38abd04ce7d384496140964add42ca6ac11291f1

## Scope

Allow business scope `EU` to use a physical destination warehouse in an EU member state, including PL. Exact national scopes remain national. UK/GB, CH and NO are not included in EU membership. Legacy exact EU-to-EU records keep their previous behavior.

The delivery rule is separate from the frozen four-market forecast/inventory planning set. That set, sales aggregation, company isolation and SKU identity are unchanged.

Country membership source: https://eur-lex.europa.eu/EN/legal-content/glossary/member-states.html (27 member states checked 2026-11-24).

## Implementation

- `22_shipment_dispatch_handlers.gs`: shared `csdShipmentDestinationCountryOk_` owns the shipping-only membership check. The existing route resolver still prefers the actual destination country's template, with an EU-wide template fallback. Route terminal binding uses the saved warehouse identity.
- `80_api_v1_shipment_import.gs`: delegates destination validation to the shared rule. Carrier service and quote resolution for EU use the unique physical destination country's code, not another member's lane. Both Add New and equivalent-label checks in Update use the same physical country. The persisted shipment country remains EU.
- Duplicate/unknown warehouses, wrong owner, inactive/factory destination, transport freeze, ambiguity, digest recheck and idempotency protections remain in place.
- Historical imports still do not deduct/reserve stock. FBA remains DISPLAY_ONLY; 3PL remains COUNTED. Nothing changes receipt behavior or document generation.

## Production Installation

Build the standalone delta with `node assets/tools/build-shipment-import-eu.cjs`.
Install BOTH complete files from `output/shipment-import-eu-20261124/release-1/Production/apps-script/` into the corresponding existing Apps Script files. Save both, then create a new deployment version for the EXISTING Production Web App deployment, retaining its URL and access settings.

No frontend, manifest, 00_config, 84_, 90_ bundle, OAuth scope, DB schema or master-data migration is required. Do not replace unrelated modules. Keep the prior manual-allocation 01/15/63 and shipment-overview 57 updates installed. Git push does not deploy Apps Script.

Discard the failed/stale import preview and validate the workbook again after deployment. Verify EU -> PL succeeds for an active same-company destination and a carrier with the real physical lane. Re-importing a committed batch must remain idempotent.

The screenshot also reports duplicate warehouse ID `WH-RESTW-DE-FBA-DTM2`. That independent master-data issue is intentionally NOT bypassed or edited. It can still block the batch until its warehouse identity is made unique by the data owner.

This is a Production delta only. No running Sandbox files, settings or GS deployment were changed. Rollback files are the exact public-source baseline above; no live DB rollback is performed.

## Verification

- `node --test assets/tests/shipment-import-eu.cjs`: 49 tests, all EU member destinations, exclusions, physical carrier lane, preserved country, actual route/position commit and later ROUTE_INIT, master drift, partial installation refusal, supply modes and replay.
- `node assets/tests/shipment-import-eu-browser.cjs`: 18 checks at 1440/390 widths; actual downloaded ExcelJS workbook, parser, real GS validation, PL route preview, reviewed Apply state and rejected nonmember destination.
- Regressions: source warehouse (20), overview logistics (15), Production manual allocation (10), and frozen EU sales basis (25 assertions).
- Synthetic Sheets only; no live business import, dispatch, receipt, stock mutation, Drive write or cloud deployment performed.
- Release validation reruns the focused tests against the packaged GS files, verifies their syntax, manifest hashes and baseline rollback contents.
