# Shipment Presentation, 2026-11-26

Replace the same-named public GS files, then publish a new version of the existing
web-app deployment with the same /exec URL. No schema changes or data repair.

- 01_router.gs
- 36_document_template_handlers.gs
- 39_document_runtime_service.gs
- 57_api_v1_shipment_workspace.gs
- 63_api_v1_system_health.gs

If the document-carton-order package is already installed, only 01, 57 and 63
changed. 36 and 39 are included unchanged to retain document recovery and carton
ordering. Keep all other GS files, especially 00_config, 66_, 84_ and the bundle.
README.md and MANIFEST.json are not Apps Script files.

Build: `node assets/tools/build-shipment-presentation-release.cjs`.
Package: `output/shipment-presentation-20261126/gs/`.
Policy SHA-256: `b7f1312171e1c458337dd16653f649d231418d0bddc7c8b61e6319ead8f62ed8`.

## Changes

Tracking displays dates without times, adds ETD and exact linked Plan creation
dates, and leaves transport/version timestamps intact. ISO instants are displayed
in the system Taiwan timezone; date-only and unzoned database calendar dates keep
their date. Unknown or ambiguous Plan dates remain blank, never shipment-created
dates. Optional `include.planDates` reads the plan table once and exposes only the
returned shipments' linked plan IDs and creation dates. No plan notes are exposed.

Plan Review and Shipment Draft prefer the configured customs_type_label for
display, with canonical fallback. Select values and saved customs codes stay intact.
The Tracking drawer clears the fixed global header.

Rejected remains an editable Draft with a rejection badge and audit history.
The real Reject -> SKU add/remove/quantity save -> Submit path is covered, including
automatic repricing, version increment and Pending Approval edit refusal.

Existing cancellation already returns linked plans to Pending Approval and retains
the cancelled shipment. Full Cancel -> Reject -> Submit -> Approve tests verify new
shipment ID, shipment number, external ID and line IDs; fresh reservation ownership;
and zero-write approval/old cancellation replays. No production ID writer was changed.
The synthetic full-approval test models GAS same-execution lock reacquisition:
https://developers.google.com/apps-script/reference/lock/lock#tryLock(Integer)

## Verification

Synthetic tests only; no live dispatch, stock/PO mutation or document generation.

```powershell
node assets/tests/shipment-presentation.cjs
node assets/tests/shipment-presentation-browser.cjs
node assets/tests/shipment-return-review.test.cjs
node assets/tests/weekly-draft-repricing.test.cjs
node assets/tests/shared-enum-display.test.js
node assets/tests/manual-allocation-production.cjs
node assets/tests/document-carton-order.cjs
node assets/tests/shipment-document-recovery.cjs
```

Browser coverage uses actual application assets at 1440px and 390px, including
drawer date fields, custom labels with unchanged save codes, editable Rejected
controls, nonblank WebGL pixel checks, globe interaction, and no outbound requests.
