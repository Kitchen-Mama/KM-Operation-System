# API v1 — Weekly Shipping Plan READ Page Cutover Spec (Phase API-3A, 2026-08-04)

> **Status: SOURCE-PRESENT / TEST-VERIFIED. NOT DEPLOYED. PRODUCTION DEFAULT = LEGACY.** The Weekly Shipping Plan page's **read** path can now route to `window.KM.api.getWorkspace("weeklyShipping")` — but ONLY when the per-workspace flag is effective (global master AND `weeklyShipping` AND IMPLEMENTED), which defaults **false**. All Weekly **writes** stay on Legacy `KM.DB`. No command migration, no production enablement, no page rewrite of the render.
> **PRE HEAD:** `808050a`. **Files:** `assets/js/pages/shipping-plan.js` (read boundary), `assets/specs/active/apps-script/40_api_v1_weekly_workspace.gs` (§22 minimal read-only extension).

---

## 1. Page data-source boundary

One reversible boundary — `loadWeeklyShippingReadModel_()` — returns **one normalized read model** regardless of source, consumed by the existing render (`_spRenderReadModel_`). No two page implementations; flag checks live in exactly one place (`_spEffectiveWorkspace()` + the boundary), not scattered across render functions.

```
renderShippingPlan()
  └─ _spUseDb() || _spEffectiveWorkspace() ? renderShippingPlanFromDb() : <demo/sessionStorage>
renderShippingPlanFromDb()                      // async; stale-seq guarded
  └─ loadWeeklyShippingReadModel_()
        ├─ _spEffectiveWorkspace()==false → Legacy: getShippingPlans/Lines (+ live enrichment maps)
        └─ _spEffectiveWorkspace()==true  → KM.api.getWorkspace("weeklyShipping") → _spAdaptWorkspaceToRecords()
  └─ _spRenderReadModel_(model)                 // existing grouping + section render, unchanged
```

`_spEffectiveWorkspace()` = `window.KM.api.workspaceApiActive('weeklyShipping')` (the Foundation's own hybrid gate). Production defaults false → Legacy.

## 2. Flag behavior (reversible)

| Global `USE_WORKSPACE_API` | `WORKSPACE_API_ENABLED.weeklyShipping` | Read path |
|---|---|---|
| false | (any) | **Legacy** |
| true | false | **Legacy** |
| true | true | **Workspace** |

- **D (Workspace error):** the real structured error is shown; **no silent fallback to Legacy** after the Workspace request starts.
- **E (disable):** flipping `weeklyShipping` off → the next load immediately returns to Legacy.
- **No dual read**, no shadow read, no automatic parity double-call in Production. Parity is fixture-tested, not live-double-executed.

## 3. Legacy → page model normalization

The Legacy branch returns `{ source:'legacy', plans:getShippingPlans(), lines:getShippingPlanLines(), shipmentMap, live:{inv,weekly,mpCompany} }`. Its DB authority and backend behavior are unchanged; only the page-model shape is unified.

## 4. Workspace → page model adapter

`_spAdaptWorkspaceToRecords(data)` maps the API-2 View Model + the §22 `raw` passthrough into the **same normalized record shape** the render already consumes (`_spWorkspacePlanRecord` / `_spWorkspaceLineRecord`). Preserved: plan IDs, line IDs (by `lineId`, never position), raw + display status, warehouse id/code/name, carrier id/name, quantities, notes, page/filter state, the persisted Decision-Snapshot line fields (`snapshot_current_stock/avg_sales_per_day/days_of_supply/target_days`), and `raw` for the render's `_spHasRaw` presence checks. No field is invented.

## 5. Snapshot-primary render (live fallback boundary)

The current Legacy render displays Current Stock / Avg Sales / Days-of-Supply with priority **snapshot → cross-domain live fallback → 0/--** (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC` §7). The persisted **Decision Snapshot** is the canonical primary source and is present on every properly-Submitted plan line. **Workspace mode renders snapshot-primary with `live=null`** — it does **not** perform a cross-domain live fallback (amazon inventory / weekly sales / marketplaces / shipments), because that would either broaden the Workspace beyond its 4-table scope or require a hidden per-row Legacy call (both forbidden). For a line **without** a persisted snapshot (legacy/pre-snapshot rows only), Workspace mode shows `0/--` where Legacy mode would show a live-derived value. This is an **explicit, documented, tested** boundary (classified `EXPECTED_VIEWMODEL_NORMALIZATION` — snapshot-primary), **not** a silent degrade. The Done-button / transferred detection uses the plan's persisted `transferred_*` fields in Workspace mode (Legacy additionally uses a shipment scan).

## 6. §22 minimal read-only Workspace extension (this round)

To reproduce the existing render without broadening scope, `40_api_v1_weekly_workspace.gs` now adds a **`raw` passthrough** to each View-Model plan and line (the source row from the SAME `shipping_plans` / `shipping_plan_lines` tables already read). Read-only; no new table; no new column; no write. The typed View Model remains the forward interface; `raw` is a transitional cutover aid. API-2 parity tests updated (`km-api-weekly-workspace.test.js` VM6b/VM6c); the API-2 spec's response `meta` is unchanged and its View Model is a superset (additive).

## 7. Loading / empty / error / stale

- **LOADING:** only the newest request may update the page — a module `_spReadSeq` is bumped per load; a stale `.then` (older seq) is ignored.
- **SUCCESS_WITH_DATA:** existing grouping/section render.
- **SUCCESS_EMPTY:** the existing legitimate empty-state message (no demo fallback).
- **FAILURE:** `_spRenderReadError_` shows a structured error (code + message + requestId) — **never** a "No records" empty-state, and **no** silent Legacy fallback.
- **ABORTED/STALE:** an older response cannot overwrite newer page state (seq guard); the Foundation also exposes `AbortSignal` + a monotonic `meta.sequence` for future per-request cancellation. Browser abort is not claimed to cancel server execution.

## 8. Planning-cycle resolution

Outcome **B — FIELD_ABSENT_AND_UI_NOT_DEPENDENT.** The current Weekly page has no planning-cycle filter/column, and `shipping_plans` has no canonical `planning_cycle` header in the active read. The Workspace exposes `planningCycle` only when the raw row carries the field (else empty), and its `filterOptions.planningCycles` is empty when absent — **not** a misleading list. The page does **not** wire a planning-cycle control this round. No column added, no HALT (UI is not dependent).

## 9. Filter / search / sort / pagination

The current Weekly UI filters **client-side** (a country dropdown + a status filter, grouped-by-status view) and has **no** pagination/search/sort controls. Per "wire only controls actually present", the boundary requests the bounded full set (`page.size=100`, sorted `updated_at desc`) and the page applies its existing client-side country/status grouping. Server-side filter/sort/pagination DTO fields exist and are validated by API-2 but are **deferred** to when the UI gains those controls (documented, not silently dropped). Known bound: Workspace mode renders up to 100 plans per load (page has no pagination UI yet).

## 10. Detail expansion

Uses `detailsByPlanId` for returned-page plans only (identity = `planId`). No extra Legacy whole-DB call, no per-line request, no stale-page detail shown for another plan.

## 11. Summary & currency

Summary comes from the API-2 filtered-before-pagination result; the browser does not recompute a conflicting total. Multi-currency is **not** combined (API-2 `currencySummary` + `estimatedCost=null` unless single-currency); no FX conversion.

## 12. Write-control preservation (all Legacy)

Every visible Weekly write control keeps its existing Legacy `KM.DB` action, payload, and success/failure handling — **unchanged**:

| Control | Legacy action |
|---|---|
| Save qty | `updateShippingPlanLineQty` |
| Submit | `updateShippingPlanStatus{submit}` (+ qty save) |
| Approve / Reject / Cancel | `updateShippingPlanStatus{approve/reject/cancel}` |
| Done | `completeShippingPlan` |
| Add Note | `appendShippingPlanNote` |

No Workspace write endpoint exists; no dual write; the page never calls `KM.api.executeCommand`. **After a successful write**, the page refreshes through `renderShippingPlan()` — i.e. the **active read path** (Workspace when enabled, else Legacy). Rate/Rationale/Carrier remain excluded (later advanced slice); Combine/Uncombine remain spec-superseded.

## 13. Request-ID / diagnostics

Workspace-mode requests carry a `requestId` (Foundation-generated or client-supplied, correlation only — not an idempotency key); the response `requestId` is retained and surfaced in the error banner for diagnostics. No sensitive IDs are exposed in the normal success UI.

## 14. Browser-safe init / no mock fallback

The page stays functional when the Foundation is absent (`_spEffectiveWorkspace()` → false → Legacy; no crash). If the flag is effective but `KM.api.getWorkspace` is missing, the boundary returns a visible `WORKSPACE_UNAVAILABLE` error (never a fake success). In Workspace mode, an API error / missing table / empty dataset **never** activates demo/sample/localStorage data — the demo path is reachable only when neither DB nor Workspace is available.

## 15. No live enablement

Production flags are unchanged (both false). Enablement is via test injection / developer override only; no `localStorage` persistence of the production flag is added.

## 16. Release + Verification-Copy (API-3B) handoff

Release classification: `shipping-plan.js` = `FRONTEND_GITHUB_PAGES_REQUIRED`; `40_api_v1_weekly_workspace.gs` (§22 raw) = `APPS_SCRIPT_SYNC_REQUIRED`; `01_router.gs` unchanged this round; tests = `GIT_ONLY`; docs = `DOCUMENTATION_ONLY`; `BUNDLE_REBUILD_REQUIRED=false`. The API-3B manual Verification-Copy checklist is in `API_WEEKLY_SHIPPING_F3A_REPORT.md` §6 (not executed here).

---

*Companions:* `API_WEEKLY_SHIPPING_F3A_REPORT.md`, `API_WEEKLY_SHIPPING_WORKSPACE_SPEC.md`, `API_WEEKLY_SHIPPING_PARITY_REPORT.md`, `API_MIGRATION_MASTER_PLAN.md`. Not pushed, not deployed.
