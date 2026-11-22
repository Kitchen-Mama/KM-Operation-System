# Document Contract Hotfix R1 (2026-11-22)

## Scope

Owner authorized this code fix and GitHub push on 2026-11-22. Apps Script sync,
deployment and live shipment confirmation remain owner-operated.

The reported ticket's Drive readiness was READY but system readiness was BLOCKED:

- `shipments.shipping_method_label` was absent from the document source registry.
- Missing filename-only `TOTAL_QTY` and `TOTAL_CARTONS` definitions were borrowed
  across active shipment templates and rejected when those templates differed.
- The pre-dispatch filename model used an empty line list, which would incorrectly
  yield zero totals even after removing the ambiguity.

## Fix

- Register the canonical shipment label source against the frozen model header.
  Keep the legacy rate-card source alias compatible. Neither mapping reads the
  current rate-card label while rendering a finalized document. Existing snapshot
  column and rate-card readiness checks remain in effect.
- For missing **shipment filename** tokens only, define `TOTAL_QTY` as
  `shipments.shipment_total_qty` and `TOTAL_CARTONS` as
  `shipments.shipment_total_cartons`. Existing explicit local scalar definitions
  remain authoritative; unrelated ambiguous/undefined tokens still block.
- During pre-dispatch filename checks, sum `shipment_qty` and
  `shipment_carton_qty` from this shipment's active lines, using the shared
  document totals function. Exclude the canonical removed-line predicates.
  Missing/invalid quantities and an empty shipment remain unknown, not fake zero.
  Preserve fractional cartons without rounding.
- Final document filenames use the finalized model's totals, not live lines.
- No template-row edits, master changes, schema changes, stock changes, shipment
  status changes, OAuth changes or production writes are part of this release.

## Manual Production Update

Prerequisite: DW2 release-4 is already installed. This is a two-file overlay,
not a replacement for that cumulative release. Never overwrite release-4.

Use `output/document-contract-r1-20261122/release-2/candidate/Production/apps-script/`.
The `release-1` directory is an incomplete packaging attempt, not an installable release.
Copy the entire contents of exactly these files into the matching Production
Apps Script files:

1. `36_document_template_handlers.gs` - APPS_SCRIPT_SYNC_REQUIRED
2. `39_document_runtime_service.gs` - APPS_SCRIPT_SYNC_REQUIRED

For Sandbox use only the package's Sandbox folder. Each environment starts from
its own pinned release-4 source; no Production profile is copied into Sandbox.
The router, policy hashes, health stamps and frontend are unchanged. Verify the
two file hashes in `INSTALL.sha256.txt`; the old health stamps alone cannot prove
this content-only hotfix was installed. No bundle rebuild or manifest change.

Save, then update the **existing** Web App deployment to a new version. Preserve
its endpoint and execute-as-deployer setting. No agent deployment is performed.

## Owner Verification

1. Refresh the website and run Diagnose (read only) on the reported ticket.
2. Require `system_readiness_verdict: READY`, `drive_readiness_verdict: READY`
   and `confirm_shipment_verdict: READY` before considering confirmation. If any
   blocker remains, stop and provide its complete details.
3. On an intentionally selected test shipment only, the owner may confirm after
   reviewing quantities, destination and the inventory consequences.
4. Compare the filename quantities/cartons with the finalized shipment totals;
   verify file contents and employee access to the output links separately.

Local synthetic tests do not prove live generation/dispatch, Drive write access,
all other templates or employee sharing. No live smoke test is claimed.

Rollback: restore the preceding Apps Script deployment version. Do not edit
business rows or delete generated files as a code rollback.

## Verification Commands

```text
node assets/tests/document-contract-hotfix-r1.cjs
node assets/tests/domestic-workflow-dw2.cjs
node assets/tests/domestic-workflow-submit-dw2.cjs
node assets/tools/build-document-contract-hotfix-r1.cjs
node assets/tools/verify-document-contract-hotfix-r1.cjs
```

Tests and packaging tools are GIT_ONLY; this document is DOCUMENTATION_ONLY.
No FRONTEND_GITHUB_PAGES_REQUIRED or BUNDLE_REBUILD_REQUIRED files changed.
