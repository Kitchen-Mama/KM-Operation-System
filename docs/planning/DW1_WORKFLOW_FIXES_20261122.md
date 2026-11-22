# DW1 Workflow Fixes

Release: `r6.9-dw1`, 2026-11-22 Asia/Taipei. Final local package: `output/dw1-workflow-20261122/release-5`.
`release-1` through `release-4` are superseded. Base DS1, AD4 and frozen AD3 inputs were not changed. No live business/master data was written.

## Findings And Changes

| Area | Root Cause / Change |
| --- | --- |
| Domestic customs | An Amazon plan has no actual FC yet. The server now proves its same-company, same-physical-country planned Amazon lane from active masters. Actual dispatch still requires its real eligible destination. UK/GB aliases use the country authority. Cross-border, factory, unknown and ambiguous identities keep customs requirements. |
| Transport selection | Proven domestic plans show Domestic Transport only. Export plans keep their applicable quote/customs controls; no duplicate domestic block. SPD/LTL is represented by method + last mile, without an extra selector. Carrier tuple validation remains. |
| Draft customs | Read-only server check disables Customs for a proven domestic lane. Disabled N/A is not submitted as a customs code. Existing saved customs history is not silently deleted. |
| Missing rate | When the server proves no applicable active quote exists, saved carrier/method/cargo can proceed through the normal confirmation dialog. Cost stays blank/pending. No manual reason, exception-save round trip, automatic resend, or invented zero. An applicable quote deliberately left unapplied still requires its explicit exception. Unknown/partial writes are not bypassed. |
| Documents | Accept the existing `shipment_detail_sheet` template type as Shipment Detail. Active/validity/scope/ambiguity checks remain. For an already eligible overseas no-PO transfer with no allocations, the factory PO placeholder may be blank. Physical quantity still comes from the frozen line model. Factory PO requirements remain. |
| Factory quantities | Production read returned `SOURCE_REVISION_PENDING`. The former adapter hid that code and the frontend latched FAILED. A display-only read can now use the stock lock and a content revision while a global marker is pending. If busy, retry at most 3 times. Live submit/approve stock guards remain uncached and unchanged. No marker/property is deleted. |
| Concurrent tickets | Different plan/shipment commands can overlap; same-ticket duplicates remain blocked. Plan refreshes after writes are ordered to prevent an earlier refresh superseding a later one. Backend shared-stock critical sections still serialize and can return a conflict/timeout; no automatic write replay. |
| Copy | Remove the timestamp-heavy Planning warnings banner and irrelevant exclusion chatter. Keep actionable warnings. Simplify main transport/cost/source wording and carrier names; technical document error codes stay under Details. No layout redesign. |

## APPS_SCRIPT_SYNC_REQUIRED

Owner-only, whole-file copy from the correct environment, then save and create/update the deployment version. GitHub push does not deploy Apps Script.

Production: `output/dw1-workflow-20261122/release-5/candidate/Production/apps-script/`

1. `11_shipping_plan_handlers.gs`
2. `12_shipment_handlers.gs`
3. `34_shipment_final_output_handlers.gs`
4. `39_document_runtime_service.gs`
5. `71_api_v1_factory_stock_guard.gs`
6. `63_api_v1_system_health.gs`
7. `01_router.gs`

Sandbox: same first six files from `candidate/Sandbox/apps-script/`; no router delta in this release. Never copy Production files into Sandbox.

`BUNDLE_REBUILD_REQUIRED = false`. No `00_config*`, `84_*`, schema migration, master activation or test-data cleanup.
Production frontend and its router/profile/health pins must move together; a mixed deployment deliberately refuses commands until the full GS set is installed.

Package INSTALL SHA-256: `eaf3ffb0c0f6e90e2f7b0f7327730c84af7ab1c9115389629d0bc3eecc55ebe7`.
Expected health: `expected/expected-health-prod-dw1.json` and `expected/expected-health-sbx-dw1.json`.

## Verification

- Real public GS handlers + synthetic sheets: `node assets/tests/domestic-workflow-dw1.cjs`: 39/0.
- Repeat with `DW1_GS=output/dw1-workflow-20261122/release-5/candidate/Sandbox/apps-script`: Sandbox handlers 39/0.
- Browser controls + actual normal Confirm entry + bounded stock recovery, desktop/mobile: `node assets/tests/domestic-workflow-browser-dw1.cjs`: 26/0.
- Existing AD4 server suite: 35/0 per environment against this candidate.
- DS1 service declarations: 59/0. DS2 Search scope: 13/0. DS2 actual Search browser: 96/0.
- Document template runtime: 63/0. Published 60-module bundle AST/runtime identity unchanged.
- Package: 747 hashes, 8 production guard checks, 2 health-checker checks, Production mirror equality.
- Known baseline test gap: `document-runtime-end-to-end-f1-7n-fb-1b.test.js` fails its old Drive-primitive assertion and stops at missing extracted `dgsFileNameLeft_`. Identically reproduced with HEAD's pre-change 39_ source. Do not report this legacy suite green.
- No real confirm/dispatch/DB write or Drive file generation was run. Owner UAT after GS deployment remains required.

## Owner Validation Checklist

- [ ] Install the complete GS set, deploy it, and verify no stale/absent modules or production-profile mismatch.
- [ ] Hard-refresh Production. Across relevant stations, confirm CN/TW quantities load; known zero stays zero, failed read stays unknown.
- [ ] AMZL -> Amazon before FC selection: Domestic Transport only, no customs requirement, no redundant SPD/LTL selector.
- [ ] AMZL -> WINIT: method + last mile save and survive reload; no customs requirement on an eligible same-country transfer.
- [ ] CN/TW -> overseas: export controls/customs remain; no Domestic Transport block.
- [ ] Draft: choose the real destination FC, save and reopen. Domestic Customs is disabled; quantity, method and last mile are retained.
- [ ] No active applicable quote: one normal Confirm flow, no reason entry or extra approval click; freight stays pending, not zero.
- [ ] Confirm an authorized test shipment: Shipment Detail is generated with correct SKU/physical quantity, blank factory PO for approved no-PO transfer, and correct identity/dates/cartons.
- [ ] Different tickets: overlap Submit/Approve/Save, then refresh and verify each DB row independently. Same-ticket double click must not duplicate a shipment or stock reservation.
- [ ] Actionable planning warnings remain; irrelevant exclusion logs and backend codes no longer dominate the main view.

## Open Incident: First Submit Not In DB

Owner reports first overseas Submit appeared sent but no DB row; second attempt succeeded. **OPEN / NOT REPRODUCED / NOT CLAIMED FIXED.**
Reported test context: plan `WSP-20261122-2` (`SP-00E78A51-1`), shipment `SH-E3906B93-1`, external shipment `RESUS-AMZ-261122-01`, source AMZLG&S, SKU CO1100-S, 120 units / 3 cartons.
These identify the successful retry context, not proof of the first failed request. On recurrence preserve time, response code, request/operation ID and a DB readback. Do not blindly resend an UNKNOWN write.
