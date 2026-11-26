# Overseas Shipments Without Documents

## Rule

All server-proven overseas sources skip document requirements regardless of carrier
or destination. Confirm retains the existing source, destination, service, route,
stock reservation, allocation, idempotency and checked-rollback gates. It records
the same Shipped transaction and route/event evidence, without building a document
snapshot, reading templates, probing Drive, creating folders or generating files.
Factory and unknown sources retain the existing document gates. Client flags never
grant an exemption. A source change during Confirm invalidates an earlier exemption.

Document readiness, frozen values, generation, explicit generate/retry, diagnostics
and the workspace/list projection agree on NOT_REQUIRED. Existing registry rows and
Drive files remain untouched; they are not advertised as missing or retryable.
The workspace reuses its already-read warehouses instead of reading each source.

The normal Confirm dialog remains for the irreversible stock transaction, but has
no promise of Drive output. On successful overseas dispatch it closes and refreshes
the Shipped card immediately, without a document result screen. Lost responses only
read status, never redispatch; proven Shipped + NOT_REQUIRED takes the same path.
Factory document panels and result screens are unchanged.

## Deployment

Use the cumulative package in `output/overseas-no-documents-20261126/gs/`:

- 01_router.gs
- 12_shipment_handlers.gs
- 22_shipment_dispatch_handlers.gs
- 36_document_template_handlers.gs
- 39_document_runtime_service.gs
- 57_api_v1_shipment_workspace.gs
- 63_api_v1_system_health.gs
- 83_api_v1_weekly_draft_lines.gs

Replace these files, then publish a new version of the same web app; keep /exec.
12 and 83 carry the preceding EU/WRO5, no-rate and cancelled-plan SKU fixes unchanged.
Changed document owners 22, 36, 39 and 57 have OND1 stamps pinned in 01/63.
Do not install an older router or health file afterward. Keep private config, auth,
66 and the generated bundle unchanged. No sheet schema or data repair is required.
README.md and MANIFEST.json are not GS files.

Build: `node assets/tools/build-overseas-no-documents-release.cjs`.

## Verification

Synthetic tests only, with no live stock, PO, dispatch or Drive operations:

```powershell
node assets/tests/overseas-no-documents.cjs
node assets/tests/overseas-no-documents-browser.cjs
node assets/tests/shipment-document-recovery.cjs
node assets/tests/shipment-no-rate-policy.cjs
node assets/tests/shipment-no-rate-browser.cjs
node assets/tests/shipment-return-review.test.cjs
node assets/tests/manual-allocation-production.cjs
```

The overseas regression invokes the actual Confirm handler, actual overseas
reservation acquire/consume, route/event writes and idempotency readback. Document
templates, snapshots, registry and Drive access deliberately throw. Desktop/mobile
browser tests execute Save -> allocation preflight -> Confirm -> Shipped, with both
normal and deliberately lost Confirm responses, exactly one dispatch per scenario.
