# F1-7B-API-SHARED-INFRA-AND-WEEKLY-SHIPPING-CUTOVER-R1 — scoped read/loading/invalidation + first proven consumer

**Outcome: IMPLEMENTED (bounded transport/loading migration; BEFORE == AFTER).** Baseline HEAD `d6d4a2b`. Weekly
Shipping's primary production render is now driven by the scoped `weeklyShipping` workspace — no broad Operation DB,
no post-write full-DB reload, no silent broad fallback, no business authority moved to the client. One page migrated;
no unrelated page touched.

## §1 Business behavior frozen
No formula/identity/quantity/status/write/validation/persistence change. The read SOURCE and the loading path changed;
the rendered Decision-Snapshot output is identical for the same fixture (proven by the equivalence tests).

## §2 Canonical read owner — REUSED (not re-created)
- Owner: `40_api_v1_weekly_workspace.gs`; action `weeklyShipping.workspace.get`; input grain = scope
  `{filters, sort, page, include}`; output grain = a page View-Model `{summary, plans[], detailsByPlanId, filterOptions,
  pagination}` with each line carrying the **frozen shipping_plan_lines row via `raw` (§22 passthrough)** — including
  `snapshot_current_stock / snapshot_avg_sales_per_day / snapshot_days_of_supply / snapshot_target_days / cbm /
  gross_weight / net_weight`. Tables read = the 4 Weekly tables only (never `getOperationDb`). No business fact
  recomputed server-side beyond the existing resolver. **DTO already sufficient → NOT extended.** No V2/second engine.

## §3 Shared workspace client — REUSED
`window.KM.api.getWorkspace(name, scope, options)` already exists (km-api-foundation.js) — scoped, deterministic,
existing envelope/error/requestId/stale-sequence handling, no full-DB fallback, no mock, no business math. **No change.**

## §4 Shared loading-state contract — NEW (smallest)
New `assets/js/api/km-loading-state.js` → `window.KM.loadState`: a PURE state machine (`INITIAL_LOADING · READY ·
REFRESHING · EMPTY · ERROR`) + a thin region binding (`bindElement`). Transport/UI only — no business data. A region
enters INITIAL_LOADING on first load (no content) or REFRESHING on a reload/post-write refresh (content stays visible);
the page render transitions it to READY/EMPTY, errors to ERROR. Illegal transitions are ignored. A failure in the
Weekly region is region-scoped and never blanks unrelated app regions. Unit-tested in Node (pure).

## §5 Scoped invalidation — REUSED (re-fetch the scope; no second cache)
The workspace client holds NO persistent client cache (TTL 0), so "invalidation" = re-request the scoped
`weeklyShipping` workspace. After a successful write, `_spReadbackAfterWrite_` (Workspace branch) re-reads ONLY that
scoped workspace — it never sets `_opDbCache = null` or reloads the whole Operation DB. No new cache/TTL introduced.

## §6/§10 Read cutover — primary render no longer needs the broad Operation DB
- Activated `weeklyShipping` as a **CANONICAL** workspace in km-api-foundation.js (`WORKSPACE_CANONICAL.weeklyShipping =
  true`, per-workspace flag defaults ON) — the same production-cutover contract as `recommendation`. It is
  master-flag-independent; the single kill switch is `KM.api.setWorkspaceEnabled('weeklyShipping', false)`.
- Gated the Shipping Plan mount: in Workspace mode it renders **directly from the scoped workspace** (no
  `loadOperationDb`); the broad load remains ONLY on the Legacy branch. First-paint dependency is now
  `Shipping Plan → weeklyShipping workspace`, not `Shipping Plan → whole Operation DB → filter/join → render`.

## §7 No hidden broad fallback (fail closed)
`loadWeeklyShippingReadModel_` Workspace branch contains no `getOperationDb/loadOperationDb/_opDbCache`. On workspace
unavailability/error it returns a structured error → `_spRenderReadError_` shows a bounded region error (never a
"No records" empty-state, never a silent Legacy fallback). Proven by test.

## §8 Write path cutover
| Write | Path (unchanged) | Post-write refresh (Workspace mode) |
|---|---|---|
| updateShippingPlanLineQty (Save) | KM.DB (legacy write API) | scoped workspace re-read (`renderShippingPlan`) |
| updateShippingPlanStatus submit/approve/reject/cancel | KM.DB | scoped workspace re-read |
| completeShippingPlan (Done) | KM.DB | scoped workspace re-read |
| appendShippingPlanNote | KM.DB | scoped workspace re-read |
All writes flow through the single `_spRunCommand_ → _spReadbackAfterWrite_`, which in Workspace mode does the scoped
re-read and **never `loadOperationDb({force:true})`**. Write API, validation, idempotency (per-key in-flight guard +
`ALREADY_IN_TARGET_STATE`), error codes, and success UX unchanged. No write authority moved to the frontend.

## §9 `_spLineDisplay` classification
In production (canonical Workspace, `live = null`) it is **DISPLAY_ONLY**: it renders the frozen Decision-Snapshot
values (`snapshot_current_stock / snapshot_avg_sales_per_day / snapshot_days_of_supply`) straight from the DTO; when a
snapshot cell is absent it shows `0 / 0.0 / --` and derives **nothing**. The stock/avg-sales/days-of-supply derivation
(`available+fc_transfer+fc_processing`, `sales_7d/7`, `stock/avgSales`) runs ONLY on the Legacy `live`-map fallback,
which is now bypassed in production (behind the kill switch). The F1-7A `BUSINESS_AUTHORITY_RISK` is therefore
neutralized for production **without touching the DTO or any formula** — the workspace already froze the values.

## §11 app.js global prime
Fire-and-forget: `app.js:382 loadOperationDb({force:true}).then(...)` only logs; `switchTo('home-section')` runs
synchronously, so **section mounts never await it**. After this cutover Weekly Shipping (Workspace) renders fully
independently of the global prime. **Removal is NOT yet globally safe** — ~13 legacy pages still consume `_opDbCache`
via getters; keep the prime until enough consumers are independent (Batch F). Verdict: KEEP.

## §12/§13 Tests
New `api-weekly-shipping-cutover-f1-7b-r1.test.js` **41/0**: loading-state machine; canonical activation + kill switch;
mount/readback have no `getOperationDb/loadOperationDb/_opDbCache` in the Workspace path; fail-closed (no silent
fallback); `_spLineDisplay` DISPLAY_ONLY + **BEFORE == AFTER** (Workspace `live=null` output identical to Legacy
`live=maps` when the snapshot is present); adapter equivalence; no frontend FIFO/Gap/Recommendation/allocation.
Updated to the post-cutover contract (weeklyShipping canonical): `km-api-weekly-workspace` 66/0, `km-api-foundation`
58/0, `km-api-foundation-compat` 49/0, `km-api-transport-wiring` 30/0. **Full regression: 217 files, only the 4 known
baseline failures (none new).** Bundle unchanged (`aaf5b07`, --check PASS).

## §14 Version / deployment
- **PRE HEAD** `d6d4a2b` · **POST HEAD** = this commit.
- Files: `assets/js/api/km-loading-state.js` (new), `assets/js/api/km-api-foundation.js`, `assets/js/pages/shipping-plan.js`,
  `index.html`, 1 new test + 4 updated tests, this doc + master-plan delta.
- **Apps Script sync: NO** — no `.gs` changed. (The `weeklyShipping` workspace `40_` was delivered in API-2; its
  presence in the deployed `/exec` is a pre-existing deployment fact = **USER_VERIFY**. If `40_` is not yet deployed,
  the Weekly read fails-closed with a visible error — never legacy — until the USER syncs it.)
- **New /exec deployment: NO** by this change (no router/handler change).
- **Frontend deploy: YES** — `index.html` + `assets/js/api/km-loading-state.js` + `km-api-foundation.js` + `pages/shipping-plan.js`.
- **Bundle rebuild: NO** — none of these are `assets/js/core/*` bundle sources (`aaf5b07` --check PASS).
- **DB/schema: NONE.**
- **API contract delta: NONE** — no route/DTO added or changed; only the `weeklyShipping` per-workspace flag default
  flipped to canonical-ON (client behavior), plus a new client-only `KM.loadState` helper.
- **Rollback:** revert to `d6d4a2b`; runtime kill switch `KM.api.setWorkspaceEnabled('weeklyShipping', false)` instantly
  restores the Legacy read path without a deploy.

## FINAL GATE — PASS
Weekly Shipping primary render is scoped-API driven ✓ · does not require the full Operation DB ✓ · post-write refresh is
scoped ✓ · business output equivalent ✓ · no business authority moved to the frontend ✓ · no silent broad-DB fallback ✓
· no new regression failures ✓.

**Weekly Shipping read migration: NOT_STARTED → DONE.**

**Recommended next slice:** the Weekly **write** targeted-invalidation is already scoped in Workspace mode; the next
independent page is **BATCH C** — implement the `purchaseOrder` (or `requestOrder`) workspace and cut over its page the
same way (activate canonical → gate mount broad-load → scoped readback → equivalence tests), retiring that page's
LEGACY_PARALLEL client math onto the DTO. STOP after F1-7B-R1; do not begin it automatically.
