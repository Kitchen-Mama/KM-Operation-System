# Document Carton Order, 2026-11-26

## Update

Replace the same-named public GS files, then update the existing web-app deployment
to a new version with the same /exec URL. No schema migration is required.

- `01_router.gs`
- `36_document_template_handlers.gs`
- `39_document_runtime_service.gs`
- `57_api_v1_shipment_workspace.gs`
- `63_api_v1_system_health.gs`

This package includes the previous document-recovery fix. If that four-file package
is already installed, only 01, 36 and 63 changed in this upgrade; 39 and 57 are identical.
Keep all other GS files, particularly 00_config, 66_, 84_ and the generated bundle.

Build: `node assets/tools/build-document-carton-order-release.cjs`.
Package: `output/document-carton-order-20261126/gs/`.
README.md and MANIFEST.json are not Apps Script files.

Policy SHA-256: `354126dc9ac9f5af0b9e36c09619aa2cce443d08cfb932ad4e86ce799adc4e07`.
`DOCUMENT_LAYOUT_BUILD_VERSION_` now ends `WH1-CS1`.

## Behavior

Every shipment document line collection is sorted by the numeric positive
`carton_no_start` before placeholder mapping and PO-allocation expansion. Thus
`1 - 10` appears before `11 - 25`, then `26 - 40`; `2` appears before `10`.
The same shared mapper is used by Shipping Detail, carrier Booking, Packing List
and Commercial Invoice, including worksheet-specific collections and their PDFs.

Sorting runs after the existing SKU/Series projection, so non-contiguous lines
returned by a grouping fallback still appear in carton order. Row facts, grouping
policy, quantities, weights, totals, and PO allocations are unchanged. Equal starts
retain the original order, including mixed-carton rows. Blank/invalid starts remain
blank/invalid and sort last in their existing order; no carton number is invented.

This is presentation-only for newly produced files. Existing READY output files
continue to be reused and are not rewritten, renumbered or automatically regenerated.
No dispatch, inventory or PO write, or live document generation was performed for
this upgrade.

## Verification

```powershell
node assets/tests/document-carton-order.cjs
node assets/tests/carrier-document-contract-r2.cjs
node assets/tests/carrier-document-r3.cjs
node assets/tests/shipment-document-recovery.cjs
node assets/tests/document-contract-hotfix-r1.cjs
node assets/tests/manual-allocation-production.cjs
node assets/tests/document-retry-browser-guard-dr4.cjs
```

Tests use synthetic models and the real saved TOP_SEALAND, AGL and SINOTRANS
template/token fixtures. They cover numeric order, stable ties, missing starts,
PO expansion, all four document classes, grouped fallback lines, immutable source
facts, and compatibility while GS is updated manually. Tests make no live requests.
