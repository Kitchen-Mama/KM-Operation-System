# Carrier Document Contract R2 (2026-11-22)

## Evidence And Cause

The Owner reported AGL, TOP SEALAND and SINOTRANS refusing at the pre-dispatch
document gate. This is not a network repair or evidence of missing declared unit
prices. `DECLARED_CURRENCY` is a currency code, not a unit price.

Read-only inspection of the registry and three actual Google Sheet templates
confirmed the shapes captured in the sanitized regression fixture:

- AGL v1 has a fixed USD footer cell and no `DECLARED_CURRENCY` token. This was
  already explicitly approved in `CARRIER_BOOKING_MAPPING_SPEC.md` section 2.6.
  The strict token preflight did not honor that fixed-value contract.
- TOP SEALAND has real collection-controller tokens on both worksheets. Many
  saved line fields have blank collection keys; CARTON_REFERENCE instead has a
  transform name in its collection-key column. Warehouse-source aliases and a
  country formatter were missing from the current model interpreter.
- Five SINOTRANS total rows have `shipments` in data_scope, the short total field
  in data_source_table and the full path in data_source_field. Treating those
  values literally produced impossible source paths.

The R1 baseline is explicitly rerun against these fixtures and must reproduce
all three failures. Prior R1/DW2 synthetic tests did not cover these complete
carrier-specific saved mappings and cannot establish their live acceptance.

## Repair Boundaries

1. Add the documented warehouse aliases to the frozen consignee model; no live
   warehouse lookups are introduced during historical document rendering.
2. Interpret `country_to_iso2` in its saved format-rule position as the existing
   strict ISO alpha-2 transformation.
3. Interpret the customs label from the frozen canonical customs enum via the
   existing shared label function, consistent with legacy label compatibility.
4. Normalize only the recognized TOP SEALAND worksheet/controller shapes and the
   five exact SINOTRANS total-row shapes in memory. Never rewrite registry rows.
   Multiple/missing controllers, arbitrary collection names and unknown shifted
   source shapes remain blocked; the normalizer is immutable and idempotent.
5. AGL v1 alone receives an explicit fixed-USD worksheet policy. Require a real
   unique literal USD cell in the template and resolved USD in the frozen model.
   Do not remove its required currency mapping, invent a currency, rewrite fixed
   template content, or waive any other required token. Non-USD/missing currency
   remains blocked before file copy.

## Manual Install

Prerequisite: the cumulative DW2 release-4. This three-file overlay also contains
the earlier document-contract R1 fixes; the source for each environment starts
from its own pinned base. Do not copy Production files into Sandbox.

Package: `output/carrier-document-r2-20261122/release-2`.
The incomplete release-1 packaging attempt is not an installable release.
Production copy directory: `candidate/Production/apps-script/`.

Copy complete contents of only these three files into the corresponding Apps
Script files, save and update the existing Web App deployment to a new version:

1. `36_document_template_handlers.gs` - APPS_SCRIPT_SYNC_REQUIRED
2. `37_shipment_document_file_renderer.gs` - APPS_SCRIPT_SYNC_REQUIRED
3. `39_document_runtime_service.gs` - APPS_SCRIPT_SYNC_REQUIRED

Preserve the endpoint, execute-as-deployer setting and existing manifest/scopes.
No router, profile, policy, existing module stamp, frontend or generated bundle
change is required. The content hashes in INSTALL.sha256.txt identify this
hotfix; prior health stamps alone cannot prove its content was installed.

No live registry/template/master edits, migrations, stock writes, dispatches or
Drive file creation were performed by this release. Apps Script deployment is
manual and Owner-operated. GitHub push, if separately authorized, does not update
Apps Script. Tests/tools/fixture = GIT_ONLY; this document = DOCUMENTATION_ONLY.

## Owner Checks

1. After deployment, run Diagnose and Diagnose document values on one saved
   shipment per affected carrier. Report any remaining blocker in full.
2. For AGL v1, confirm the resolved declaration currency is USD. A different
   currency needs a separately reviewed template, not a forced USD substitution.
3. Require final readiness and document-value checks to pass before intentionally
   confirming a test shipment. Confirmation changes stock/reservations and status.
4. Open the generated Sheet/PDF and check line quantities, unit values, currency,
   totals, destination address, carton references, footer formulas and employee
   download access. Local tests are not proof of live file-generation acceptance.
5. On an unknown/timeout outcome, read the saved state; do not resend dispatch.

Rollback is the preceding Apps Script deployment version. Do not edit business
rows, master mappings or generated files as a code rollback.

## Local Verification

```text
node assets/tests/carrier-document-contract-r2.cjs
node assets/tests/document-contract-hotfix-r1.cjs
node assets/tests/domestic-workflow-dw2.cjs
node assets/tests/domestic-workflow-submit-dw2.cjs
node assets/tools/build-carrier-document-r2.cjs
node assets/tools/verify-carrier-document-r2.cjs
```

The new suite loads whole runtime modules and 105 saved mapping rows with the
actual template tokens/formulas (account data, file IDs and examples removed).
It exercises real preflight, frozen render models, payload mapping and workbook
fill on synthetic copies, including line expansion beyond AGL reserved capacity.
Negative checks retain wrong-currency, missing-token, unknown-value, ambiguous-
controller and unresolved-destination refusals. No whole-repository green claim.
