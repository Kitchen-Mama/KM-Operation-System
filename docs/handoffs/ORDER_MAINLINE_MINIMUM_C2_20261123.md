# Order Mainline Minimum C2

Date: 2026-11-23 (Asia/Taipei). Scope: minimum Order Planning -> Request -> PO document -> receipt -> Overview.

## Outcome

- R64 Send remains the persisted-allocation authority. No change to 66_, recommendation math, site allocation or shipment dispatch.
- An unpriced Request now opens Purchase Order Setup at conversion. Select an active production factory and a maintained supplier, Check Prices, then Create PO.
- The server resolves supplier_price_list by exact SKU/supplier, optional supplier warehouse, active flag and current effective window. Latest applicable effective_from wins; same-date duplicates, missing/invalid prices and mixed currencies refuse the whole conversion before writes.
- Blank cost is not zero. An explicit zero remains zero. supplier_name_snapshot compatibility is retained. A reviewed-price checksum prevents a changed quote from being accepted without another review.
- Approved Request quantities/site sources remain unchanged. Only the new PO freezes commercial facts and a quote-reference note. Existing conversion lock, compensation and replay protections remain in use.
- Workspace exposes a read-only purchase-setup capability only when the new 13_ owner is present. UI and API wrapper both refuse the new setup POST against an old/mixed backend. An old 13_ otherwise ignores preview fields and would convert, so this deployment guard is required.
- Existing fully priced Requests retain their original conversion path. PO Save/Send PO/production update/receipt and Overview/Gantt use their existing owners. No email is sent by Send PO.

## Verification

- Focused Node suites: 171 pass, 0 fail (mainline phases/A1/B1/new purchase setup/actual flat generation and R64 Send/site-SKU inventory/Amazon health detail exclusion/shipment import source).
- Actual Chrome controllers at 1440 and 390: C2 39 checks; C1 64 checks. Includes real Send transport, real flat writer and submit, unpriced Request, quote preview, changed quote, one PO on double click, document matrix/PDF boundary, partial/full receipt, retry/stale/lost-response safeguards and Overview schedule.
- Old workspace, old writer and a downgrade after workspace read all refuse setup with zero conversion POSTs and zero business writes.
- Existing PO workspace 56, Request workspace 58, carrier R3 17, DW2 40, and shipment-source XLSX browser 16 checks pass.
- Both environment candidates are tested using their actual packaged GS and frontend files. Sandbox additionally runs inventory-site-SKU, carrier and shipment-source regression suites.
- Sheets/Drive/PDF/network boundaries are synthetic. No live DB/Drive writes, receipt, dispatch, emails or Apps Script deployment. Real template permissions/PDF export and actual /exec acceptance remain owner UAT.
- No whole-repository green claim; older retired harness/source-drift failures remain outside this checkpoint.

## Packages

Final candidate: output/order-mainline-c2-20261123/release-7/. Earlier internal releases are superseded.

Production is a focused cumulative order-mainline overlay on the previously installed DW2/R3/DR4/import baseline:

- APPS_SCRIPT_SYNC_REQUIRED: 13_procurement_handlers.gs, 39_document_runtime_service.gs, 51_api_v1_request_order_workspace.gs.
- 13_ includes A1/B1/C2. 39_ is the cumulative A1 canonical-document dependency. 51_ adds the read-only capability handshake.
- Do not replace Production router, config, authentication, manifest or generated bundle for this overlay.
- Frontend publication is GitHub Pages; site-delta is also supplied as a reference.

Sandbox is a complete public GS cumulative set (86 .gs files plus appsscript.json), not a private project export:

- Starts from its own public AD2 Sandbox baseline and pinned DW2 Sandbox candidates, then its own carrier R3, A1/B1, C2, source-warehouse overlay, plus reviewed site-SKU and Amazon health-logging deltas.
- Includes the existing frozen Sandbox generated bundle; BUNDLE_REBUILD_REQUIRED: NO. Never use root 66_ R49: Sandbox package retains its own R64.
- Common tracked public frontend assets plus pinned Sandbox entry/guard and cumulative frontend updates are supplied in site-delta. Keep existing private/local Sandbox connection/PIN files.
- 00_config*, 84_*, actual PIN/local files, credentials and .env are excluded and must be retained from the correct existing environment. No Production router/profile is copied to Sandbox.
- User-reported saved Health is R71/action contract 24/required-list 20. The old health module hardcodes environment_mode=production even in the Sandbox source; that label alone does not establish DB identity. Saved editor output does not establish /exec version.
- Capture read-only health/capabilities from the actual Sandbox /exec after deployment, verify the Sandbox gate/module metadata using included tools, and confirm the configured DB is the intended Sandbox before any UAT write.
- SHA-256 manifests describe exact delivered bytes, not proof of the current remote source. Back up the current Apps Script project and DB before manual installation. No package is represented as a backup of the remote project.

## Owner Acceptance

1. Back up both environments separately. Install Sandbox first; do not paste Sandbox files into Production or vice versa.
2. Replace same-named public modules, save, and update the existing Web App deployment version. Do not create duplicate handler files or delete private/unlisted files.
3. Check actual Sandbox target and published health, then refresh the frontend.
4. In Sandbox, save a small Order Planning allocation, Send Request, Submit/Approve, select factory/supplier, Check Prices/Create PO. Confirm quantities and prices.
5. In PO Workspace Save inspection/completion/ship dates, Send PO, open/download the file, and verify SKU, quantity, cost, currency, amount and dates against the source/master.
6. Receive a partial quantity, then the remainder. Verify stock/movements once only and the correct completed/remaining quantities. Never receive real stock just for testing Production.
7. Open PO Overview; verify schedule/Gantt dates and In Production/Ready-Completed records.
8. After Sandbox acceptance, install only the three named Production GS files and redeploy. Existing Shipped shipments are not re-confirmed/re-dispatched.

Prerequisites: correct active factory, SKU carton metadata, a non-ambiguous effective supplier quote, and an active PO document template with required fields/permissions. Missing master/template data remains an explicit refusal, not invented business data.

## Deferred

Owner live UAT and actual Sandbox /exec/source identity remain required. Broader receipt-to-dispatch C3, overseas inventory allocation, mixed-SKU cartons and B/C routes are not claimed complete. After order mainline acceptance, overseas inventory allocation remains the next priority.

Owner explicitly authorized GitHub push after passing tests in this turn. Apps Script deployment remains owner-manual. Publication evidence is recorded after commit.
