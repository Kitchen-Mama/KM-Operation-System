# API v1 — Weekly Shipping F2 → F3A Functional Reachability Report (Phase API-3A, 2026-08-04)

> **F3A = "After the Weekly READ page cutover"** functional diff. **Goal: every FULLY_CONNECTED Weekly control stays connected; reads gain a reversible Workspace path; writes stay Legacy.** Source/test-proven; **no page cutover to Production, no flag enabled by default, no live Spreadsheet.**
> **Verdict: F3A PASS (source/test-proven)** — 0 regression; reads selectably Workspace-connected; all writes Legacy; no Router-only stub exposed; no false-success.

---

## 1. Weekly function matrix (F2 → F3A)

| Function | F2 | F3A | Class |
|---|---|---|---|
| Weekly page load (plans/lines) | Legacy | **selectable** Legacy ↔ Workspace (`getWorkspace`) | `READ_WORKSPACE_CONNECTED` |
| Country filter / status grouping | Legacy client-side | unchanged (client-side over the active read model) | `READ_WORKSPACE_CONNECTED` |
| Expand plan details | Legacy | Workspace `detailsByPlanId` (returned page) / Legacy | `READ_WORKSPACE_CONNECTED` |
| Summary / cost display | Legacy | Workspace summary (multi-currency separated) / Legacy | `READ_WORKSPACE_CONNECTED` |
| Save qty (`updateShippingPlanLineQty`) | Legacy | **Legacy** (unchanged) | `WRITE_LEGACY_CONNECTED` |
| Submit (`updateShippingPlanStatus{submit}`) | Legacy | **Legacy** | `WRITE_LEGACY_CONNECTED` |
| Approve/Reject/Cancel (`updateShippingPlanStatus`) | Legacy | **Legacy** | `WRITE_LEGACY_CONNECTED` |
| Done (`completeShippingPlan`) | Legacy | **Legacy** | `WRITE_LEGACY_CONNECTED` |
| Add Note (`appendShippingPlanNote`) | Legacy | **Legacy** | `WRITE_LEGACY_CONNECTED` |
| Rate candidates / Rationale / Carrier | deferred | deferred | `ADVANCED_FUNCTION_DEFERRED` |
| Combine / Uncombine | superseded | superseded | `SPEC_SUPERSEDED` |
| Demo/sessionStorage render | present | present (only when neither DB nor Workspace available) | `MOCK_OR_DEMO` |
| Any Weekly control | — | — | `REGRESSION` = **NONE** |

- **All Weekly reads** are connected through the new **selectable** Workspace path; **all writes remain Legacy**; **no existing control becomes unreachable**; **no new false-success**; **no Router-only stub exposed** (the page never calls rate/rationale/carrier/combine).

## 2. Read functions connected (Workspace-selectable)

Page load, filter/status grouping, detail expansion, summary/cost — all route through `loadWeeklyShippingReadModel_()`; Workspace when the flag is effective, Legacy otherwise. Snapshot-primary in Workspace mode (see cutover spec §5).

## 3. Legacy write functions preserved

`updateShippingPlanLineQty`, `updateShippingPlanStatus` (submit/approve/reject/cancel), `completeShippingPlan`, `appendShippingPlanNote` — event listeners, payloads, backend actions, and success/failure handling **unchanged**; post-write readback goes through the active read path (one refresh). No `KM.api.executeCommand`; no Workspace write; no dual write. (Tests SR1–SR3.)

## 4. Regressions

**None.** Full suite: only the pre-existing `replen-draft-completeness` P29–P31 fail (honest, unrelated). Golden 39/1/0; Scenario #34 Pending; production-safety 85/85. F2 compat updated: `shipping-plan.js` is now the ONLY page using `KM.api` (READ only) — the other 21 pages remain independent (compat PG1/PG1b).

## 5. Evidence gaps (browser / live)

Source/test-proven only. **OPEN (API-3B / F5-class, deployment required):** live browser render parity between Legacy and Workspace on the Verification Copy; confirming zero writes from read-only interactions against live data; snapshot-primary vs live-fallback visual diff for any pre-snapshot legacy rows. No live Spreadsheet accessed, no Apps Script executed this round.

## 5a. Transport wiring (Hotfix T1, 2026-08-04)

The browser previously showed `TRANSPORT_NOT_CONFIGURED` in Workspace mode because `ApiTransport` had no Web App URL. **Fixed:** the transport now resolves the **existing canonical** exec URL at call time via `window.KM.DB.getApiBaseUrl()` (no duplicate literal, no `.gs` change). With the flag enabled and a valid URL, the Weekly page issues `weeklyShipping.workspace.get` (POST, text/plain, canonical body) and no longer fails with `TRANSPORT_NOT_CONFIGURED`; malformed URL → `TRANSPORT_URL_INVALID`; missing → `TRANSPORT_NOT_CONFIGURED`; no silent Legacy fallback. Status flags for this environment:

- `TRANSPORT_WIRING_VERIFIED` (source/test — `km-api-transport-wiring.test.js` 30/0).
- `GLOBAL_LEGACY_BOOTSTRAP_STILL_ACTIVE` — the app still loads `getOperationDb` at startup (not this round's scope). `WEEKLY_TARGETED_READ_READY`; `GLOBAL_BOOTSTRAP_OPTIMIZATION_NOT_STARTED`.
- Primary DB is the actively bound target; the copy is an emergency rollback backup only → **all live write/readback verification is `LIVE_WRITE_READBACK_NOT_VERIFIED` / `VERIFICATION_COPY_WRITE_READBACK_NOT_PERFORMED`** until the copy is actively bound.

## 6. API-3B manual verification checklist — READ-ONLY on the primary DB (DO NOT RUN THIS ROUND)

> **Environment constraint (2026-08-05):** the user is testing against the **primary** bound Database; the copy is only an emergency rollback backup. Therefore browser verification is **READ-ONLY**; **no** controlled Legacy write test may run against the primary DB, and any write/readback result is marked `LIVE_WRITE_READBACK_NOT_VERIFIED`.

1. Confirm `01_router.gs` dispatches `weeklyShipping.workspace.get` and `40_api_v1_weekly_workspace.gs` (incl. §22 `raw`) is synced; create a deployment version. **Do not change the configured Spreadsheet ID; do not create/repair any Sheet/Header.**
2. Push the approved frontend commit; redeploy GitHub Pages (`shipping-plan.js` + `km-api-foundation.js` + `operation-system-db-api.js`).
3. **Before** verification, record: `shipping_plans` row count, `shipping_plan_lines` row count, Header rows, and confirm no shipments/stock-movement baseline changes expected.
4. In the browser, enable the Weekly workspace flag (global + `weeklyShipping`) for this session only; confirm `KM.api.getTransportStatus().configured === true` and the masked endpoint (no Script ID).
5. Confirm the Weekly page issues `weeklyShipping.workspace.get` (POST) and **no** `TRANSPORT_NOT_CONFIGURED`; confirm the Weekly read boundary triggers **no** `getOperationDb` (the global bootstrap `getOperationDb` is separate/expected).
6. **READ-ONLY compare** Legacy vs Workspace displays (counts, status, qty, warehouse/carrier, notes, summary/currency) by toggling the flag — **no writes**.
7. Exercise ONLY read interactions: filters/status grouping, detail expansion, refresh. **Do NOT run** Add Note / Qty / Status / Submit / Approve / Reject / Complete / Cancel / Shipment creation / reservation / stock deduction.
8. **After** verification, re-confirm: `shipping_plans` + `shipping_plan_lines` row counts unchanged; Headers unchanged; no shipments or stock-movement records created.
9. Mark live write→readback as `LIVE_WRITE_READBACK_NOT_VERIFIED` (deferred until the copy is the actively bound verification target).
10. Capture `requestId` / `serverDurationMs` / `tablesRead` from the response meta.
11. Toggle the Weekly flag **off**; confirm the next load returns to Legacy (rollback). **No Production enablement persisted.** Do **not** claim full API-3B PASS from read-only production evidence.

1. Manually sync the API-2 `.gs` files into the Apps Script project: **`40_api_v1_weekly_workspace.gs`** (incl. the §22 `raw` passthrough) + confirm `01_router.gs` already dispatches `weeklyShipping.workspace.get`.
2. Create a new Apps Script **deployment version**; confirm the bound **Verification Copy** Spreadsheet ID (`PRODUCTION_DB_SPREADSHEET_ID_` set to the copy — never Production).
3. Manually push the approved frontend commit; redeploy GitHub Pages (`shipping-plan.js` + `km-api-foundation.js`).
4. In the controlled verification environment **only**, enable the Weekly workspace flag (global master + `weeklyShipping`); leave the other six false.
5. Compare the Legacy display vs the Workspace display for the same plans (counts, status, qty, warehouse/carrier, notes, summary/currency).
6. Exercise filters/status grouping/detail expansion; confirm the network shows the Weekly workspace read (4 tables) and **no** whole-DB `getOperationDb`.
7. Verify **no writes** occurred from any read-only interaction (before/after row counts + Header integrity unchanged; S0/S0.5 tokens clean).
8. Perform one existing **Legacy** write (e.g. Save qty / Add Note); confirm the readback refresh renders through the active (Workspace) path.
9. Toggle the Weekly flag **off**; confirm the next load returns to Legacy (rollback).
10. Capture `requestId` / `serverDurationMs` / `tablesRead` from the response meta; record before/after row counts + Header integrity.
11. **No Production enablement.** On any failure, disable the Weekly flag (instant Legacy rollback) and open a scoped hotfix.

---

*Companions:* `API_WEEKLY_SHIPPING_CUTOVER_SPEC.md`, `API_FUNCTIONAL_COVERAGE_F2.md` (F2 — not rewritten), `API_MIGRATION_MASTER_PLAN.md`. Not pushed, not deployed.
