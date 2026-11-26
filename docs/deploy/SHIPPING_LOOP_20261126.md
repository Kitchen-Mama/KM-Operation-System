# Shipping Review and Warehouse Document Fix

## Install

Frontend changes are published through Git. Replace these nine public GS files
together in the existing production Apps Script project from
`output/shipping-loop-20261126/`:

1. `01_router.gs`
2. `12_shipment_handlers.gs`
3. `20_campaign_write_handlers.gs`
4. `33_party_authority_handlers.gs`
5. `34_shipment_final_output_handlers.gs`
6. `36_document_template_handlers.gs`
7. `39_document_runtime_service.gs`
8. `63_api_v1_system_health.gs`
9. `83_api_v1_weekly_draft_lines.gs`

Save all nine, create a new version and update the existing Web App deployment.
Keep its existing `/exec` URL. Do not upload the whole source folder, configuration,
password files or the older local Request Order Send module. No schema migration
or live database edit is needed. Unchanged `20_` and `83_` carry the prior Campaign
append and automatic Edit SKUs repricing prerequisites.

Expected policy: `0026f8ebcc150b0ed8cfd9e411d1ceefa13053283af228a42025dfd40c55d4f7`.
Expected party resolver: `PARTY-WAREHOUSE-DESTINATION-20261126-V1`.
The exact previous policy remains accepted while the GS update is manual. New
destination and cancellation behavior is not active until GS is deployed.

Generate and verify this package with:

```powershell
node assets/tools/build-shipping-loop-release.cjs
```

## Behavior

- Shipment document readiness and final snapshots share the same destination
  resolver. An existing logistics location remains authoritative. When no location
  mapping exists at all, an exact, unique, active warehouse ID may provide its
  warehouse name, street, city, state, postal code and country. Missing name,
  street, city or country blocks. No warehouse-code guessing, inactive/duplicate
  bypass, fabricated address or live Sheet mutation is introduced.
- The consignee name is the warehouse name. `warehouses.contact_name` is now a
  supported alias for that frozen name. Blank phone/email were already allowed
  by the shared field mapper; resolving the correct consignee removes the false
  identity-mismatch blocker. Invalid emails and mismatched identities still block.
  All carriers use these shared owners, not a carrier-specific exception.
- Review countries come from active marketplace master rows plus persisted plans.
  Rejected plans remain editable Draft records, displayed as Rejected. A later
  Submit shows Pending Approval. Raw rejection notes and audit history are kept.
- Successfully transferred approvals leave Review. An approval whose Shipment
  creation failed stays visible as Shipment Draft Pending, retaining recovery.
- Cancel Shipment Draft releases stock reservations and draft PO allocations,
  cancels the old shipment and returns every linked plan to Pending Approval in
  one existing lock/journal. Handoffs, approval and completion metadata are cleared;
  review state is read back. Reapproval creates a new shipment. Old cancellation
  replay writes nothing, even after the new draft exists. Dispatched shipments
  remain non-cancellable. Failure uses the existing checked rollback.
- Explicit Clear local wait clears the shared liveness hint only after a second
  server read proves it is still idle. Late callbacks cannot resurrect its held
  state/button; mounting without a held calculation resets an obsolete label.
  Unknown or active server jobs do not become fabricated successes.

## Verification

Local fixtures execute the actual resolver, field contract, final-model mapping,
stock reservation/release, cancellation journal, rollback and handoff code.
Browser fixtures use shipped scripts/partials/CSS on desktop and mobile with
network requests blocked. No real dispatch, stock mutation, recalculation,
production campaign mutation or Drive document generation was performed.

- `warehouse-document-destination.test.cjs`: 7 tests, three carrier identities.
- `document-contract-hotfix-r1.cjs`: 24 checks.
- `carrier-document-contract-r2.cjs`: 27 checks, 105 saved mappings.
- `shipment-return-review.test.cjs`: 5 tests, including consolidated plans, replay,
  reapproval, reservation restoration and injected-write rollback.
- `shipping-review-loop-browser.cjs`: 16 desktop/mobile checks.
- `manual-gap-unlinked-status-browser.cjs`: 68 checks, including late callbacks.

After deployment, read the deployment contract in the signed-in browser before
retrying the existing shipment's Confirm preflight. Local tests cannot attest
the actual production Drive workbook rendering or dispatch outcome.
