# Factory Atomic Import, 2026-11-25

## Scope

The previous factory importer wrote PO rows before looping through individual stock and movement writes. A hard execution interruption can bypass its catch/undo path. A small row limit alone does not make those separate writes atomic.

The factory domains now stage the existing PO/stock writers against an isolated in-memory spreadsheet view. Only factory balances, movements, receipts, audit changes, and (for StockPO only) PO headers/lines may be changed. Masters are read-only; unrelated import domains retain their existing path.

One Advanced Sheets `Spreadsheets.batchUpdate` submits all business cell changes, required row expansion, audit rows, and the final COMMITTED receipt. An invalid request rejects the whole update. The existing shared Script Lock remains held across validation, staging, dispatch and verification. Untouched cells and their formulas/formats are not rewritten.

A separate COMMITTING intent receipt is persisted before dispatch. An interruption before dispatch leaves no business writes. An uncertain API outcome is never automatically resent or undone with inverse writes. Fresh `Values.batchGet` reads verify every changed cell, including the final receipt; lost responses can be recovered without another write. A failure to verify is reported as unknown, not success.

The receipt stores `atomic_commit: true`, `staged_readback_verified: true`, and `readback_verified: false`. The response sets the latter to true only after the actual post-commit native API read succeeds. This deliberately does not claim a future readback succeeded inside the atomic commit itself.

## Installation

Replace `78_api_v1_import_batch.gs` and add `82a_factory_atomic_commit.gs` together. The incremental package also includes the current `82_api_v1_po_factory_import.gs` with the existing 25-input-row guard; replace it if not already installed from the previous release. It differs here only in its guard comment.

Save and redeploy the existing Web App deployment as a new version, preserving its URL, access policy, Production authority profile, and pinned existing build stamps. The new module identifies itself as `FACTORY-ATOMIC-1-20261125`. No schema migration, new columns, credentials, or frontend release is needed. No Apps Script installation/deployment was performed remotely in this task.

The repository manifest already declares Advanced Google Sheets v4. If the installed project lacks the service, the new path refuses before writes. Missing 82a also refuses before writes; there is no fallback to the interrupted per-cell factory writer.

Do not replace compatible deployed 05_, 17_, or 21_ with older repository mirrors. The two previously queried 16_ and 40_ files are unchanged. The original operations repair ZIP and its extracted copy are not overwritten by this incremental package.

## Limits

- StockPO keeps the 25-input-row limit. Serialized atomic requests are capped at 1.8 MB before the intent is written; oversized commits are refused, not split or partly applied.
- The atomic guarantee concerns the requests submitted to Google Sheets. External collaborators or other projects that bypass the app's Script Lock can still edit spreadsheet cells. Baseline checks reduce that race but do not create a cross-project compare-and-swap guarantee.
- Existing interrupted imports are not replayed, automatically reconciled, or marked complete by this code. Separately authorized data recovery is documented only in local ignored output, not bundled as a runnable migration.
- Do not retry an unknown result with a new batch ID. Review the receipt and business books first.

## Verification

- 13 atomic-path tests, including zero-write staging failure, missing service/module, rejected final API request, lost responses, corrupt readback, external baseline edits, literal strings, row expansion, stock-only isolation, preserved reservations/dates, and a complete 25-row StockPO file.
- Related factory/site-SKU/boundary suites: 74 node test cases pass in aggregate (including the 13 above). The boundary file additionally performs eight explicit assertions.
- Procurement mainline, Request transactions and purchase setup: 85 tests pass. Shipment import source/EU regressions: 69 tests pass.
- Desktop/mobile real browser import -> PO workspace -> receive -> replay: 26 checks pass with synthetic business writes only.
- One older `po-receive-factory-stock-handoff-f1-7n-fa-3b0-pre.test.js` cannot initialize because its historical `__PORCV_PURE_START__` markers no longer exist in the unchanged 13_ source. It is not included in the passing counts.

Google's atomic batch contract: https://developers.google.com/workspace/sheets/api/guides/batch

Fresh value readback contract: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet
