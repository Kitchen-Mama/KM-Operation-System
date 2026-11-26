# Cancelled Plan SKU Edit, 2026-11-26

## Cause And Scope

After Cancel Shipment Draft -> Pending Approval -> Reject, the Plan is a Draft
again, but WDL still called the conservative Plan cancellation guard. That guard
correctly reports ANY historical Shipment as EXISTS; it is not an editable-Plan
guard. Thus retained cancelled history produced SHIPMENT_EXISTS_FOR_PLAN.
The editor hid that issue behind the generic IMPORT_VALIDATION_FAILED message.

The WDL-only edit check now accepts cancelled history only after checking the
cleared Plan handoff, unique stamped cancelled shipments, no dispatch evidence,
reconciled reservation books, zero remaining reservations in the owner ledgers,
and no executable PO allocations. Allocation ownership is resolved through the
existing shipCancelAllocPrepare_ line-ID reader, not a guessed shipment_id column.
Live shipments, unknown cancellations, residue and inconsistent books stay blocked.
The shared Plan cancellation guard and shipment history are unchanged.

New rejected additions still require active same-site SKU master data and the real
factory availability guard. No stock or PO is changed by editing Plan lines.
The existing journal reprices the final line contents and preserves rejection
history; Submit/Approve creates a fresh shipment with the new lines and new IDs.

Invalid initial validation now returns structured issues immediately instead of
entering Commit only to get a generic message. Existing receipts still reach the
receipt-first Commit path, preserving zero-write replay and unknown-outcome holds.
The editor renders specific issues from raw or canonical adapter envelopes, keeps
entered values after a validation refusal, and never retries automatically.

Earlier tests isolated Rejected editing and cancellation/reapproval separately;
this release adds the complete combined path with the real ownership and stock
guards, plus an actual desktop/mobile editor -> DB command adapter -> WDL journal
regression. The old packing fixture's ownership stub is not used by this regression.

## Deploy

This latest package includes the immediately preceding no-rate/lithium quote fix.
Use this package rather than installing the earlier no-rate package afterward.
Apply on top of the EU/WRO5 package; replace these public GS files and publish a new
version of the existing web app, keeping the same /exec URL:

- 01_router.gs
- 12_shipment_handlers.gs
- 83_api_v1_weekly_draft_lines.gs
- 63_api_v1_system_health.gs

12_ is unchanged from the no-rate package (EUD1-NR1). If that package is already
installed, only 01, 83 and 63 changed. Keep all other GS files, private config,
authentication, 66_ and the generated bundle unchanged. No schema migration or
manual record changes. README.md and MANIFEST.json are not Apps Script files.

Build: `node assets/tools/build-cancelled-plan-sku-edit-release.cjs`.
Package: `output/cancelled-plan-sku-edit-20261126/gs/`.
83_ stamp ends V2-CANCEL1. Policy SHA-256:
`8cbae3c11b6e6444e65c90cfc1f14097a222969e71e0151f9e5d953c9b566f08`.

## Verification

```powershell
node assets/tests/shipment-return-review.test.cjs
node assets/tests/weekly-cancelled-plan-edit.cjs
node assets/tests/weekly-cancelled-plan-edit-browser.cjs
node assets/tests/weekly-draft-repricing.test.cjs
node assets/tests/mixed-carton-extra.test.cjs
node assets/tests/manual-allocation-production.cjs
node assets/tests/shipment-no-rate-policy.cjs
node assets/tests/shipment-no-rate-browser.cjs
```

All business data in tests is synthetic. No live shipment cancellation, dispatch,
stock/PO mutation or document generation is performed. Browser tests include
specific stock refusal, preserved input, explicit retry, one readback, no automatic
resends, exact journal persistence, and unchanged cancelled history and reservations.
