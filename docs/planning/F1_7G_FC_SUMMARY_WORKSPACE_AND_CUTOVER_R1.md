# F1-7G-FC-SUMMARY-WORKSPACE-AND-CUTOVER-R1 — FC Summary scoped workspace + primary-render cutover

**Outcome: IMPLEMENTED (transport/read-model migration; BEFORE FACT == AFTER FACT).** Baseline HEAD `6962d01`. The active
FC Summary page (`fc-summary.js`) now renders its PRIMARY tables (Regular Forecast / Special Event / Target Rules + the
Year dropdown + the non-cascading filter universes) from ONE scoped `fcSummary` workspace — no broad Operation DB for the
primary render, scoped post-write refresh, fail-closed on error. **No Forecast / Target Rule / Special Event business
semantics changed.** The browser-side Event Assist WRITE authority is formally flagged and **DEFERRED**
(`EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED`) — never mixed into this transport cutover.

## §0 Audit — 100% broad-cache page; Target% multiply is debug-only (no read-authority conflict)
`fc-summary.js` read exclusively from the broad `loadOperationDb` cache via 8 `KM.DB.getX` getters — **no scoped API
anywhere**. Every write forced a full broad-cache reload (the Event Builder reloads once per campaign + per line + per
event row). Classification of every browser calc confirmed the render/display is `DISPLAY_ONLY`/`FORMAT_ONLY`/
`FILTER_ONLY`/`READ_MODEL_ASSEMBLY`. **Critical:** the `base × target% / 100` multiply (`calculateEffectiveFC` /
`getEffectiveFcSafe`) is reachable **only via `window.fcDebug`** — unwired from render and write. So the page **does NOT
apply Target% to any displayed or written forecast** → the display/read path has **no frontend parallel canonical Forecast
authority**, and the read cutover is cleanly separable and BEFORE == AFTER-provable.

## §4 Event Assist — `EVENT_ASSIST_FRONTEND_WRITE_AUTHORITY_PRESENT` → `EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED` (DEFERRED)
The Special Event Builder's "Preview & Pre-fill" (`_evtApplyForecastAssist`) computes the growth/adjust magnitude in the
browser — `newFc = Math.round(base × (1 + growth/100))` (growth) or `Math.max(0, Math.round(base × (1+val/100) | base+val))`
(adjust) — from broad-cache reads, and on Save persists it **verbatim** as `fc_special_events.fc_qty` (`upsertFcSpecialEvent`
→ `handleUpsertFcSpecialEvent_`). The backend **validates** `fc_qty` (numeric ≥ 0) and owns the `event_fc_id` PK but
**does NOT recompute** the magnitude. So the authoritative planning number is browser-authored →
**`EVENT_ASSIST_FRONTEND_WRITE_AUTHORITY_PRESENT` = YES.** (The Regular Builder growth path `saveRegularUpdate` is the same
pattern for `fc_regular_forecast`.) **Smallest safe correction** = a NEW backend forecast-derivation owner + a changed
Special Event write payload (`{method, params, baseRef}` instead of the computed `fc_qty`) so the backend recomputes — a
new Forecast computation authority + a changed Special Event write contract. Per §4 ("Do not mix a Forecast redesign into a
transport cutover") + §5/§6 (Special Event contract unchanged) + §19 → **`EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED`**, raised
as a SCOPED, DEFERRED write-authority HALT. **This round does NOT touch the Event Assist / Special Event write path** (it
stays byte-identical) — it is a separate, future, explicitly-authorized round.

## §2/§3/§7/§8 FC Summary workspace (NEW backend `58_api_v1_fc_summary_workspace.gs`)
Action `fcSummary.workspace.get` (router dispatch added). Reads ONLY the FOUR primary-render tables — **never
`getOperationDb`**: `fc_regular_forecast` (Regular tab + Year dropdown distinct years), `fc_special_events` (Special Event
tab), `fc_target_rules` (Target tab), `marketplaces` (marketplace key → display label). **Distinct from `53_`
`fcSummary.raw.get`** (the bounded AI-Plan Layer-1 basicFcRawT3Qty/specialEventFcRawQty owner — not a page read; no
collision). The page's SECONDARY write/edit surfaces (Regular Builder, Special Event Builder incl. Event Assist, Target
Rule editor, CSV import) are **not** served here (they keep reading `marketplace_skus`/`sku_details`/`campaigns`/
`campaign_sku_lines`/`pricing_list` from the broad cache).

- **Input grain:** `{ include? }`. **Output grain:** `{ summary, fcRegularForecast[] (raw), fcSpecialEvents[] (raw),
  fcTargetRules[] (raw), marketplaces[] (raw), capped, counts }`. Same discipline as `53_`/`57_`: pure `fcsWorkspaceBuild_`
  + injectable `io`; S0/S0.5 exact-ID + validate-only presence; fail-closed on missing schema.
- **FULL-SET by design (BEFORE == AFTER):** fc-summary is deliberately NON-CASCADING — the Year dropdown lists ALL distinct
  `fc_regular_forecast` years and every filter dimension keeps its FULL distinct option set, built client-side from the
  COMPLETE dataset. Server-side year/scope narrowing would shrink those universes → a user-visible change. So the workspace
  returns RAW passthrough of the ENTIRE FC tables (bounded by a generous cap that is **never silently applied** — reported
  via `capped`), and the client keeps ALL filtering / SKU search / pagination. The workspace's win is table SCOPE (4 tables,
  never the ~44-tab getOperationDb), not server pagination. (Scoped/paginated server reads = documented follow-up.)

## §6 RAW vs ADJUSTED forecast — distinct authorities (source guards)
`58_` emits ONLY raw persisted forecast rows: no Target% adjustment, no blending, no Gap/Recommendation/allocation, no
second forecast engine (proven — the source has no `* (1 +`, no `Math.round`, no `target_percentage`/`_pct` application, no
`order_planning_gap`). It **writes nothing** and never touches the Special Event write path.

## §5 Target Rules
Unchanged. The Target Rule editor still submits user-entered `jan_pct..dec_pct` + `target_percentage` via `upsertFcTargetRule`
→ `handleUpsertFcTargetRule_` (frontend derives no canonical rule value). The Target tab render reads the workspace's raw
`fc_target_rules` (read-model) — same rows as `getFcTargetRules()`.

## §12 BEFORE == AFTER (gold-standard) — the adapter + the ACTUAL render getters
`KM.DB.adaptFcSummaryWorkspace` maps each workspace raw array through the **SAME** canonical normalizer with the **SAME
per-array filter** `normalizeOperationDb` applies (`normalizeFcRegularForecastRecord` / `…SpecialEvent` / `…TargetRule` /
`normalizeMarketplaceRecord`; filters `forecastId||sku`, `event||sku||scopeId`, `scopeId||ruleId`, `marketplaceId||marketplace`),
preserving the `.raw` passthrough the render getters read. The suite runs the **ACTUAL** browser
`_getDbFcRegularData()`/`_getDbFcEventData()`/`_getDbTargetRules()` from the Workspace read-model **and** from the Legacy
broad-cache getters, asserting IDENTICAL render shapes (incl. months/company/category/series, r.raw-derived
eventId/campaignId/eventName, per-month pct fallback, and marketplace label resolution). Junk-row filter parity, multi-company
(KM/ResTW/ResUS) passthrough with no company inference, year-crossing (2027 row feeds the Year universe), zero-FC (0 ≠ absent),
empty (EMPTY ≠ ERROR), and the non-silent `capped` backstop are all covered. `api-fc-summary-workspace-f1-7g-r1.test.js`
**52/0**.

## §9/§10 Frontend cutover (`fc-summary.js`)
- `_fcEffectiveWorkspace()` gates on canonical `fcSummary`; `_fcReadModel` sourced from `KM.api.getWorkspace('fcSummary')`
  → `KM.DB.adaptFcSummaryWorkspace`. Read-model-first accessors (`_fcGetRegularForecast`/`_fcGetSpecialEvents`/
  `_fcGetTargetRules`/`_fcGetMarketplaces`) swap the source (Workspace → DTO, Legacy → getters); the render getters + the
  marketplace-label helpers route through them → the primary render reads NO broad cache.
- `_fcSummaryEnsureDbAndRender` fetches the scoped workspace in canonical mode (fail-closed via `_fcRenderError_` /
  `FC_SUMMARY_READ_FAILED` — **no silent legacy broad fallback**; the broad load lives ONLY in the Legacy branch).
  `KM.loadState.createRegion` bounded loading/error region. Kill switch `setWorkspaceEnabled('fcSummary', false)` → instant
  Legacy.
- **Post-write:** `_fcAfterWrite(cb)` — in Workspace mode a SCOPED `fcSummary` re-read (`_fcWorkspaceRefresh_`) then the
  page's existing exit-edit/close-modal/re-render; Legacy mode render-only. Wired into all 7 live write success paths
  (Base-FC inline, Regular Builder, CSV import, Special-Event inline, Special Event Builder, Target-Rule save/delete). No
  page-level broad reload for the primary render.
- **SECONDARY builder modals** (`openRegularUpdateModal`, `openEventModal`) lazy-load the broad cache on open
  (`_fcEnsureBroadCacheThen`) — the primary render never depends on it.

## §11 Writes / refresh
| Write | Owner | Old refresh | New refresh |
|---|---|---|---|
| Base-FC inline (`saveFcChanges`) / Regular Builder (`saveRegularUpdate`) / CSV import (`runFcImport`) | 04_ | `loadOperationDb({force:true})` + render | scoped `fcSummary` re-read |
| Special-Event inline (`saveEventChanges`) | 14_ | broad reload + render | scoped `fcSummary` re-read |
| Special Event Builder (`saveEventUpdate`: `upsertCampaign`/`upsertCampaignSkuLines`/`upsertFcSpecialEvent`) | 20_/14_ | broad reload (per row) + render | scoped `fcSummary` re-read |
| Target Rule save/delete (`upsertFcTargetRule`/`deleteFcTargetRule`) | 14_ | broad reload + render | scoped `fcSummary` re-read |
Write API/validation/authority unchanged. **Boundary:** the shared `KM.DB.*` writers still `loadOperationDb({force:true})`
INTERNALLY (the ~40-writer pattern) — that populates `_opDbCache` the primary render now ignores; removing it is deferred
**Batch F**.

## §13 No Gap / Recommendation crossover
`58_` calculates no Gap, no Recommendation, no allocation, no PO remaining; reads no Shipment/FIFO data; writes no Request
Order. Forecast page stays in the Forecast domain.

## Tests / regression
New `api-fc-summary-workspace-f1-7g-r1.test.js` **52/0**. Contract tests updated for the graduation: PREREQ-2 raw-owner
(the `fcSummary.workspace.get` slot now legitimately exists → assert the raw owner stays a DISTINCT handler), foundation
R3b ("the other two" = inventoryReplenishment, skuDetails; + fcSummary IMPLEMENTED), compat CUTOVER_PAGES += fc-summary.js.
**Full regression: 227 files, only the 4 known baseline failures (none new).** Bundle unchanged (`aaf5b07`, --check PASS).

## §15/§17 app.js prime / broad-cache pages / deployment
- app.js global prime **unchanged (KEEP)**. **fc-summary.js primary render independent of broad DB: YES.** Remaining
  broad-cache pages ≈ 8 (inventory pages, sku pages, campaign-risk, request-order.js secondary surfaces, fc-summary.js
  SECONDARY builder modals, etc.). Global-prime removal remains Batch F.
- **PRE HEAD** `6962d01` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `58_api_v1_fc_summary_workspace.gs` (new) + `01_router.gs` (new dispatch).**
- **New `/exec` deployment: YES** — deploy the **backend FIRST** (canonical-ON), then the frontend, or hold with the kill
  switch. If the frontend ships first, FC Summary fails-closed with a bounded read error (never Legacy, never silent) until
  the backend is live.
- **Frontend deploy: YES** — `km-api-foundation.js`, `operation-system-db-api.js`, `fc-summary.js` (`index.html`/HTML
  unchanged). **Bundle rebuild: NO** (`58_` not a bundle source). **DB/schema: NONE.**
- **API contract delta:** +1 route `fcSummary.workspace.get`; no existing route/DTO changed.
- **Rollback:** revert this commit; or runtime kill switch `KM.api.setWorkspaceEnabled('fcSummary', false)` → instant
  Legacy broad-cache primary render (no deploy).

## FINAL GATE — PASS (transport/read mission) with the Event Assist WRITE authority explicitly DEFERRED
FC Summary primary render = scoped API ✓ · raw Forecast & adjusted Forecast retain distinct authorities ✓ · Target Rule /
Special Event contracts unchanged ✓ · **no frontend parallel canonical Forecast READ authority** (the Target% multiply is
debug-only/unwired) ✓ · BEFORE == AFTER (adapter = SAME normalizers + filters; the ACTUAL render getters equal; 52/0) ✓ ·
no broad Operation DB for the primary render ✓ · no silent legacy fallback ✓ · no new regression failures ✓.
**Carve-out:** the Event Assist WRITE authority (`EVENT_ASSIST_FRONTEND_WRITE_AUTHORITY_PRESENT`) remains, deliberately —
its correction is a Forecast redesign (`EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED`) deferred to a separate authorized round,
per §4 ("Do not mix a Forecast redesign into a transport cutover").

**FC Summary scoped read: DONE.**

**Exact next slice:** the DEFERRED **Event Assist authority redesign** (`EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED` — move
the growth/adjust forecast derivation to a canonical backend owner + a revised Special Event write contract), OR the
`skuDetails` workspace, OR fc-summary.js's SECONDARY builder surfaces off the broad cache, OR Batch F (retire the
~40-writer WRITE_FORCES_FULL_RELOAD + app.js global prime). Do NOT begin automatically.
