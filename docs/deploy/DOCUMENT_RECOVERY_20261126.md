# Shipment Document Recovery, 2026-11-26

## Install

This is a four-file follow-up to SHIPPING_LOOP_20261126. Replace all four same-named
files in the existing Production Apps Script project, then update the existing web
app deployment to a new version. Keep the same /exec URL.

- `01_router.gs`
- `39_document_runtime_service.gs`
- `57_api_v1_shipment_workspace.gs`
- `63_api_v1_system_health.gs`

Generate the verified local package with:

```powershell
node assets/tools/build-document-recovery-release.cjs
```

Package: `output/document-recovery-20261126/gs/`. README and MANIFEST.json are not GS.
Do not replace any other files, particularly 00_config, 66_, 84_, or the generated bundle.
No migration, schema change, PO/stock adjustment, or dispatch replay is required.
Previous warehouse-address and optional-contact fixes remain prerequisites.

Policy SHA-256: `bc5fbba6d72658b1dd4aa5095b75b5b53017f383671236715115069ac5c6b15c`.
Runtime stamp ends `WH1-DG1`; shipment workspace stamp ends `SO7-DG1`.
Frontend accepts the exact previous shipping-loop policy during manual deployment.

## What Was Fixed

- A confirmed shipment with a Confirm-owned digest but no live generated-document
  rows now reports CONFIRMED_RETRY_REQUIRED instead of NONE in both document reads.
- Its document panel offers Generate Documents through the existing document.retry
  authority. This reads the final snapshot and reuses READY outputs; it never calls
  Confirm, consumes stock, or changes PO allocation quantities.
- The recovered-confirmation modal replaces its original dispatch button/event
  listener with View Documents. Direct confirmation also offers View Documents.
  Navigation awaits readback, clears the old draft-status filter, expands the active
  card rather than a hidden duplicate card, and exposes real registry URLs only.
- Diagnostic field checks now use the exact generation payload resolver, including
  physical-SKU projection, worksheet-scoped repeaters, country/overseas rules and
  filenames. The old direct mapper falsely reported DOCUMENT_MERGE_NOT_IMPLEMENTED
  for physical lines with multiple PO allocations.
- Missing manifest outputs appear in the diagnostic even when no attempt was
  registered; an eligible zero-output shipment is no longer NOTHING_TO_RETRY.
- The generator records its attempt before model rendering, records unexpected
  per-class mapping/render errors, continues other classes, and does not report
  success when configuration-required outputs remain.
- The panel handles nested generation failures and uncertain network outcomes;
  downloads appear only for files actually returned by the registry.

These paths are shared by all carriers. They do not waive genuinely missing business
fields, template ambiguity, inaccessible Drive assets or currency requirements.

## Verified Production Recovery

The affected shipment was already shipped with a final snapshot, while its output
folder was empty and generated_documents had no attempts. A documents-only retry
returned two READY classes, zero failures and zero configuration blockers. Drive was
then verified to contain both native workbooks and their PDFs. The shipping-detail
workbook contains six physical lines totalling 2,210 units and 57 cartons, retaining
all nine PO allocations without repeating physical quantities.

The initial execution's exact termination cause is not proven by the available
records. This recovery does not claim that the diagnostic's obsolete merge warning
caused the original empty folder, or that other carriers were dispatched in Production.

## Verification

```powershell
node assets/tests/shipment-document-recovery.cjs
node assets/tests/shipment-document-recovery-browser.cjs
node assets/tests/carrier-document-contract-r2.cjs
node assets/tests/carrier-document-r3.cjs
node assets/tests/document-contract-hotfix-r1.cjs
node --test assets/tests/warehouse-document-destination.test.cjs
node assets/tests/manual-allocation-production.cjs
node assets/tests/document-retry-browser-guard-dr4.cjs
node assets/tests/shipment-overview-logistics-browser.cjs
```

Carrier fixtures cover TOP_SEALAND, AGL and SINOTRANS real saved mappings/token
matrices with synthetic Sheets/Drive writes. Browser checks use desktop/mobile
viewports with all network requests blocked. No test performs a business mutation.

The historical `s7-r2b-document-panel-audit.test.js` cannot start because its
`G39 pure prelude` text anchor has drifted. The same failure was reproduced against
the pre-change HEAD runtime. It is not included in the passing targeted checks.
`domestic-workflow-dw1.cjs` also stops at its unchanged shipping-plan command harness
because `_spPlanNotice_` is not stubbed; this was reproduced with the pre-change
runtime/page files. Its preceding document and stock-read fixtures pass, but the
suite is not counted as passing. No unrelated test-harness rewrite is included.

After deployment, refresh the browser and run the existing read-only deployment
probe. Both updated module stamps must match; stale/absent modules must be empty.
For the already-recovered shipment, verify both READY outputs and open/download
links. Do not dispatch it again. A read-only document diagnostic should no longer
show DOCUMENT_MERGE_NOT_IMPLEMENTED for its multi-PO physical SKU rows.
