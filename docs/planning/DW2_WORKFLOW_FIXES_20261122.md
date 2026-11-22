# DW2 Workflow Repair

Base: DW1 r6.9, Git `61313824`. Candidate: r6.10-dw2. No live business writes, schema migrations, dispatch or ticket merges were performed by Codex.

## Confirmed Causes

- The Git mirror of 37_ was older than the reviewed AD3-c2 renderer used by 39_: no `planWorkbook`, no multi-tab fill/recovery IO, and a numeric supported-type flag instead of the MIME string used by Drive readiness. Restored from the identical reviewed Production/Sandbox public renderer, with a new mandatory DFO health pin.
- The adjacent Git mirrors 35_, 36_ and 38_ also predated their frozen installation counterparts. Their reviewed environment-specific versions are included unchanged to make the document chain coherent. Sandbox 36_/38_ come from the Sandbox stable tree explicitly named by AD3's own builder; Production versions come from the frozen Production candidate. No Production-only layout code is imported into Sandbox.
- Production's manifest lacked the Drive scope. Owner confirmed this and has added/saved the three scopes below; authorization and new deployment are still required. Folder/file sharing can only be confirmed by the deployer's subsequent read-only check.
- The old shipment-state diagnostic used generic table reads for tables the legacy allowlist does not expose. The button now uses the existing, shipment-scoped document diagnostic. That diagnostic and document-value checks are narrowly enabled in Production.
- Grouping policy's handler still rejected Production as Sandbox-only, and Production blocked its save action. Both are corrected without enabling unrelated administration actions.
- Factory availability could remain FAILED on re-entry, or retain a completed timeout promise until its network read settled. Re-entry/focus now resumes a fresh bounded read, including the late-settlement case. Unknown stock is never changed to zero.

## Behavior

- Submit selects completed, persisted routes only. Local incomplete/unsaved rows are excluded, disclosed in confirmation, and retained in recovery storage after successful submit.
- A persisted draft with an incomplete local edit is withheld as a whole, including its sibling lines. Header-level route fields cannot safely be partially submitted. Other eligible draft headers can proceed. The confirmation identifies this exclusion; the backend verifies the exact selected line set and expected draft versions before writing.
- Unknown saves, in-flight writes, pending cancellations and unverified database state remain blocking. No UNKNOWN write is replayed automatically.
- Removing a local unfinished row clears its model/cache and queued local identity. A locally minted line ID without a persisted header is not sent to database cancellation. Saved rows still require confirmed cancellation/readback.
- Delete banners are concise, with technical IDs under Details. JP destination helper text is removed, not destination validation.
- Submit batches adjacent lifecycle cells, reuses header rows already validated under the same lock, and checks all transition statuses with one readback. Approve/Submit use a 180-second action-specific client bound; the shared timeout and Request Order Send budget are unchanged. Lock contention is a proven zero-write refusal, not an assertion that the same plan/execution is already running. Production latency improvement still needs owner measurement.
- Transient AUTH infrastructure/rate-limit responses no longer discard a locally valid session. Invalid/expired/refused session responses still sign out. No auth gate, TTL or server session check is bypassed. `KM.passwordAccess.lastFailure()` returns only the last AUTH code/time for diagnosis. A general solution to every reported sign-out cannot be claimed without its actual failure code; the private auth module was not read or changed.
- Grouping settings affect subsequent shipment creation/approval, not retroactive merges of existing tickets. The three owner test tickets were inspected read-only; no tickets were cancelled or merged. Cross-company grouping still requires the approved shared destination mapping and consistent reservation/line lineage.

## Owner Sync

Use only the environment-specific candidate from the DW2 release directory. Do not mix Production and Sandbox routers or configuration. Preserve 00_config and 84_ files, credentials, triggers and existing master data.

Copy these ten GS files, then save:

1. `01_router.gs`
2. `11_shipping_plan_handlers.gs`
3. `12_shipment_handlers.gs`
4. `16_shipping_allocation_handlers.gs`
5. `35_shipment_document_renderer.gs`
6. `36_document_template_handlers.gs`
7. `37_shipment_document_file_renderer.gs`
8. `38_document_output_folder_resolver.gs`
9. `39_document_runtime_service.gs`
10. `63_api_v1_system_health.gs`

Manifest: merge these scopes into the existing `oauthScopes` array if absent. Preserve all other scopes, advanced services, timezone, web-app settings and project configuration; do not replace an environment's complete manifest merely to merge scopes.

```json
"https://www.googleapis.com/auth/drive",
"https://www.googleapis.com/auth/documents",
"https://www.googleapis.com/auth/script.external_request"
```

In the Apps Script editor, signed in as the account that deploys the web app, run `documentWorkflowAuthorizationCheck`. Complete Google's authorization dialog. This helper only opens configured template/folder identities and logs read-only checks; it creates no files or folders and changes no shipment state. If a check fails, retain the shipment unchanged and return its safe diagnostic. An inaccessible folder after authorization may still require sharing with the deployment account; this package does not change sharing.

Create a new deployment version, preserving the existing endpoint and execution identity. Refresh the site after frontend publication and GS deployment are both complete. The new frontend policy and mandatory renderer pin intentionally reject a half-updated deployment.

No generated 90_ bundle rebuild. No 00_config or 84_ sync. No migration, cleanup, source-revision deletion, master activation, new folder or live dispatch is part of installation.

## Verification And UAT

Local suites: `domestic-workflow-dw2.cjs`, `domestic-workflow-submit-dw2.cjs`, `domestic-workflow-browser-dw2.cjs`, DW1 regression, DS1/DS2 regression and unchanged bundle equivalence. DW2 executes the actual default renderer IO against synthetic Drive/Sheets, including workbook preflight/fill and PDF orchestration. Its full 16_ core tests exercise exact selection, lifecycle stamping, version refusal and downstream refusal with recording boundaries for adjacent authorities. It does not substitute for a real Google authorization/file-generation test. Older extraction-based document and Submit harnesses have existing missing-helper assumptions; they are not claimed green.

After deployment, run the supplied environment health checker against a fresh health capture. Verify that `DFO_BUILD_VERSION_ = DW2-RENDERER-20261122` is present, no modules are stale/absent, and the Production policy hash matches the frontend.

Owner UAT, one operation at a time before concurrency:

1. Run Diagnose on one factory and one approved overseas-transfer ticket. Verify preflight, actual field problems and Drive checks. Overseas Shipment Detail must not require a factory PO; factory lineage remains mandatory. Do not dispatch solely to obtain a diagnosis.
2. Use an owner-approved test dispatch to verify real Sheet/PDF output, quantities, carton numbers, Shipment ID/reference and the correct folder. Confirm must still refuse incomplete mandatory data.
3. Submit a saved route beside an incomplete local route. Only the saved route is proposed; the local edit survives returning. Remove the local row, leave/re-enter and confirm it does not return.
4. Submit, leave Inventory, return without a browser reload. CN/TW shares must refresh; unavailable stock remains unknown with Refresh available.
5. Load/save/read back grouping policies with explicit actor/reason. Choose policy before creating new test shipments. Existing owner test tickets remain unchanged unless the owner explicitly operates on them.
6. Run concurrent operations on different entities; measure elapsed time and read back each result. A timed-out write stays UNKNOWN with no automatic resend. If signed out, report the safe last AUTH code/time, not session tokens.

Publication and GS deployment are separate. GitHub push is authorized for this repair; only the owner deploys Apps Script and performs live business UAT.
