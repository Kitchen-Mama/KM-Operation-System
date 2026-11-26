# Shipment Workspace And Scoped Dispatch Status

Release: `shipment-workspace-scoped-20261126-v1`
Prerequisite: previous dispatch-status release, including `39_document_runtime_service.gs` ending `EUT1-DSR1` and PL -> DE declaration compatibility in `34_`.

## Deploy

Replace these three public script files completely, save, and publish a new version of the existing Web App deployment without changing its `/exec` URL:

- `01_router.gs`
- `22_shipment_dispatch_handlers.gs`
- `63_api_v1_system_health.gs`

Copies: `output/shipment-scoped-status-20261126/gs/`. No changes to private config, credentials, `66_`, `84_`, or schema. The release builder verifies both `doGet` and `doPost` exist at module scope. The unchanged `39_` file from the preceding release must remain deployed.

## WRO5 Status Investigation

The user confirmed concurrent writes elsewhere while `SH-F2D01718-5` remained `ready_to_ship`. The prior status check required all global write markers to be absent, so other shipments/calculations could keep this shipment waiting even when its own books were consistent. This evidence does not prove the production shipment has dispatched or that any particular active writer is safe to disregard.

The router now records a bounded command context beside each existing numeric marker: version, action and shipment ID only. Credentials, notes and arbitrary payload fields are never stored in that context. Normal writer completion removes both properties and advances the global source revision. Global cache invalidation remains conservative while any writer is active.

The dispatch-status READ can distinguish explicitly single-shipment commands on another shipment and a small verified list of calculation-only actions. It ignores those markers only for this targeted status check, not for caching. The existing ScriptLock, stable before/after marker fingerprint, stock-cell/ledger reconciliation, own reservations, route/event/movement/PO evidence and version checks are still mandatory before NOT_DISPATCHED is returned. No automatic Confirm is sent.

Same-shipment writers, unsupported actions, missing/conflicting scope, legacy timestamp-only markers and malformed contexts still block. Such responses now include the operation (when known), elapsed age and remaining conservative lease time. Read checks never delete or expire a marker by writing. Legacy markers from executions begun before this release remain conservative until normal completion or the existing ten-minute lease boundary; do not manually clear properties or the pending local hold.

After deployment, refresh the browser and press Check status. A proven NOT_DISPATCHED result refreshes the card and permits an explicit reviewed Confirm; a real active or unknown writer remains visible with its reason and timing. Production dispatch itself was not executed as part of this release.

## Workspace Separation

- Shipment Workspace renders only Draft and Ready to Ship, including its Status and Country filters.
- Shipment Overview includes Shipped, existing later lifecycle states and Cancelled. It retains cancellation reason as escaped read-only text and filters cancellations by `cancelled_at` before falling back to creation date.
- Cancelled records without documents do not offer document generation. The existing dispatch/document/stock mutation behavior is unchanged.
- The shared read model retains all rows. Only presentation is filtered; no shipment is deleted or relabelled.
- View Documents preloads Overview markup, navigates through the existing page entry point, clears incompatible Overview filters and uses the existing targeted readback before expanding the record.

## Verification

```text
node assets/tools/build-shipment-scoped-status-release.cjs
node assets/tests/shipment-dispatch-status.cjs
node assets/tests/shipment-dispatch-status-browser.cjs
node assets/tests/shipment-workspace-active-browser.cjs
node assets/tests/shipment-document-recovery-browser.cjs
node assets/tests/overseas-no-documents-browser.cjs
node assets/tests/manual-allocation-production.cjs
node assets/tests/shipment-document-recovery.cjs
node assets/tests/eu-document-customs-scope.cjs
```

All browser business operations use synthetic data and block outbound requests. No live inventory, PO, shipment or Drive mutation is performed. The older DR4-era whitelist test's pre-existing historical-baseline mismatch remains documented in the preceding deployment notes; current policy/hash/module contracts use the current production-policy suite.

Verification includes 25 dispatch-evidence tests; 46 scoped-status, 26 Workspace separation, 38 document-recovery and 24 overseas normal/lost-response browser assertions; and the existing Overview logistics checks at 3840/1440/390 pixels. The combined current business/policy Node suites pass, including the owner-approved PL -> DE declaration cases. Production dispatch still requires the user's deployment and subsequent status check.
