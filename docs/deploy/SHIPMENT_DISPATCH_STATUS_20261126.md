# Shipment Dispatch Status Recovery

Release: `shipment-dispatch-status-20261126-v1`
Prerequisite: `eu-document-customs-20261126-v1` (including the PL -> DE declaration compatibility owner in `34_`).

## Deploy

Replace these four public GS files in the existing Apps Script project, then deploy a new version of the same Web App `/exec`:

- `01_router.gs`
- `22_shipment_dispatch_handlers.gs`
- `39_document_runtime_service.gs`
- `63_api_v1_system_health.gs`

Use `output/shipment-dispatch-status-20261126/gs/`. Do not replace private config, credentials, `66_` or any `84_` file. No schema changes or production data repair scripts are included. Frontend assets are published separately through GitHub Pages.

## Cause And Behavior

`DATA_WRITE_IN_PROGRESS` means a global source-write marker exists. It does not prove this shipment is still executing: another writer may be active, or a terminated execution may have left a marker. The former Check status only read the shipment status and could retain a local pending-Confirm hold indefinitely when the row remained `ready_to_ship`.

The new `shipment.dispatch.status` action is a read, including when transported by POST. It never calls Confirm, allocates PO lines, changes stock or reservations, creates Drive output, deletes a property or clears a server write marker.

- A current writer marker or busy ScriptLock retains the hold.
- Invalid source metadata, missing evidence columns or unreadable state retain the hold.
- A stable source revision, ScriptLock, no dispatch evidence, legal current lines, unexecuted allocations, reconciled stock books and exact shipment-owned reservations are required to prove NOT_DISPATCHED.
- Partial movements/routes/events, executed allocations, unproven stock cells or mismatched reservations require review. A `ready_to_ship` row alone never permits retry.
- A proven completed dispatch is displayed without dispatching again. Overseas-origin shipments still bypass document generation.
- A verified NOT_DISPATCHED result clears only the local pending hold, refreshes the card and asks the operator to review and explicitly Confirm. It never automatically sends another write.
- Typed zero-write stock refusals and verified compensated rollbacks are shown as failures, not unknown dispatch outcomes. An unverified rollback keeps the hold.

The global marker lease is 10 minutes, above the documented 6-minute execution limit with a 4-minute margin ([Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)). Expiration only permits a read of the evidence; time alone never authorizes a retry. Expired marker identities remain in the source fingerprint until normal write completion cleans them, preventing reuse of the pre-write cache fingerprint.

Pre-dispatch document diagnostics now include the actual prospective-value check. They distinguish WAITING_FOR_WRITE, VALUES_UNVERIFIED, BLOCKED and READY. Files not yet generated before dispatch are not misreported as failed document outputs or offered document regeneration.

## User Recovery

After deployment, refresh the page and use Check status on `SH-F2D01718-5` / `FBA15MZFF9K5`. Do not manually clear local storage, server properties or shipment status. If a recent writer remains, wait and check again. If reconciliation proves NOT_DISPATCHED, review the refreshed shipment and explicitly Confirm. If it reports REVIEW_REQUIRED, preserve the card and use the reported reason for further diagnosis.

## Verification

Run the release builder and these local tests (synthetic Sheets/Drive only):

```text
node assets/tools/build-shipment-dispatch-status-release.cjs
node assets/tests/shipment-dispatch-status.cjs
node assets/tests/shipment-dispatch-status-browser.cjs
node assets/tests/manual-allocation-production.cjs
node assets/tests/shipment-document-recovery.cjs
node assets/tests/overseas-no-documents.cjs
node assets/tests/overseas-no-documents-browser.cjs
node assets/tests/eu-document-customs-scope.cjs
```

No live dispatch, inventory deduction, PO change or document retry was executed for this release.

Results: 14 dispatch-evidence cases, 40 desktop/mobile recovery assertions, 24 overseas normal/lost-response assertions, 38 current production-policy/router cases and 16 document-recovery assertions passed. The combined business regression run passed all 61 Node test entries (the custom document-recovery runner is counted as one entry there).

Known historical test limitation: `document-retry-production-dr4.cjs` still asserts the exact DR4-era whitelist, cache token and build suffix. It fails its whitelist assertion on the unmodified parent `630eb869` as well: eight subsequent allowed actions already existed before this release. It was left unchanged; current policy/hash/module/read-only transport contracts are covered by `manual-allocation-production.cjs`.
