# API Migration Master Plan — Phase API-0 Output (2026-08-04)

> **Round:** PHASE API-0 (READ-ONLY audit). This plan is produced FROM the evidence in `API_CURRENT_TRANSPORT_ACTION_INVENTORY.md` and `FUNCTIONAL_REACHABILITY_AUDIT.md`. **No implementation is authorized by this document.** It defines the boundaries, phase order, first vertical slice, and the F1–F6 functional-gap checkpoints that gate the migration.
> **Repo/HEAD:** `Operation System` @ `8dfbb3d`. **Accepted state:** system-wide runtime schema safety SOURCE-PRESENT/TEST-VERIFIED (S0/S0.5); recommendation runtime backend-only; live incident OPEN; Verification Copy not started; Submit blocked; Golden 39/1/0; #34 Pending.

---

## 1. Architecture boundaries (must be preserved by any API layer)

1. **One transport, one endpoint.** Today: `WEB_APP_FETCH` → one Apps Script Web App; `window.KM.DB.*` is the only client surface. The API layer **wraps** this surface — it does not add a second transport per domain.
2. **Runtime authority stays server-side.** Business logic lives in the `.gs` handlers + the generated bundle (`90_…`, built by `assets/tools/build-apps-script-bundle.js` — **never edit the generated file**; edit `assets/js/core/*.js`). The API layer must not duplicate business authority in the client (see §Duplicate-authority).
3. **Schema safety is frozen (S0/S0.5).** Every Canonical write already routes through the validate-only ensure chokepoint + exact-Spreadsheet-ID gate + Header/structural barriers (`SYSTEM_RUNTIME_ARCHITECTURE.md` §SAFE). The API layer inherits this — it must not reintroduce auto-create/auto-repair.
4. **Readback is canonical.** Every write currently forces a whole-DB reload. The API layer should replace whole-DB reload with **targeted invalidation** but must preserve read-after-write correctness.
5. **Submit commitment boundary is inviolate.** The Production Writer explicitly does not Submit or create downstream business records; Submit stays out of API implementation until its business boundary is frozen (§Submit).
6. **Mirror = contract source.** The `.gs` source mirror is the contract of record; the 5 missing-handler actions prove the mirror can drift from the deploy. API-1 must reconcile mirror↔deploy or record the delta (live status UNKNOWN today).

---

## 2. Duplicate-authority hazards to eliminate during migration (evidence)

- **Recommendation vs manual allocation.** The full recommendation runtime (KMPW/KMORCH/KMPR/KMPL, S0/S0.5) is backend-only and **not loaded in the browser**, while the frontend persists **user-entered** allocation drafts (`upsertRequestOrderAllocationDraft*`, `upsertShippingAllocationDraft*`). API migration must not freeze BOTH as competing "recommendation" authorities — the recommendation-seeded path is deferred (Engine B), the manual path is live.
- **fc-summary legacy Edit vs builder.** Two code paths edit the same forecast: the connected *builder* (`importFcRegularForecastBatch` / `upsertCampaign*`) and the P0 false-success *legacy inline Edit* (`saveFcChanges`/`saveEventChanges`). Retire the legacy path; do not API-expose it.
- **Shipment creation.** `updateShippingPlanStatus{approve}` auto-creates the shipment server-side; `createShipmentFromPlan` is an unused retry twin. One authority only.
- **Weekly L1/L2.** Carrier rationale/select/combine exist as transport writers with missing handlers and no UI — decide one owner before exposing.

---

## 3. API migration classification (per action → see Inventory §3 for the full table)

| Class | Actions (representative) |
|---|---|
| **WRAP_AS_API_V1** | sku/marketplace/tax/fc-target/fc-event/campaign upserts, shipping-plan status/qty/note/complete, shipment update, request-order + PO lifecycle, factory/overseas adjust, `getTable` |
| **MERGE_INTO_WORKSPACE_API** | `getOperationDb` (whole-DB) → per-page workspace reads (§Workspace) |
| **SPLIT_READ_WRITE** | `getShippingMethodCandidates`, imports (rate/fc/marketplace/overseas) where read-candidates + write-commit are entangled |
| **KEEP_AS_INTERNAL_RUNTIME** | `confirmShipmentAndDispatch` (atomic), allocation-draft upserts + `updateRecommendationDecisionLocked`, `getRecommendationDraftToken`, `runAmazonSnapshotImports`, tax-component |
| **REPLACE_LEGACY_TRANSPORT** | (whole surface — `WEB_APP_FETCH` `text/plain` POST → formal API transport, business unchanged) |
| **RETIRE_AFTER_API_CUTOVER** | `createShipmentFromPlan` (retry twin), `updatePurchaseOrderLine` (superseded by header edit until UI decided) |
| **DO_NOT_API_YET** | `generateRecommendationDraftLocked`, `submitRequestOrderAllocationDrafts`, `submitShippingAllocationDrafts`, admin one-offs (audit/backfill/retire/seed) — Submit & engine boundaries unresolved |
| **REMOVE_DEAD_CODE_LATER** | fc `saveNewSku`/`openAddSkuModal` (dead), home Add-Todo dead render, legacy fc Edit buttons |
| **CONTRACT_PENDING_IMPLEMENTATION** | `getWeeklyPlanRateCandidates` (engine `shippingRoughRateCandidates_` exists, orphaned — needs handler), `updateShippingPlanRationale`, `selectShippingPlanCarrier` — WSR-1 reconciled: never committed, contract canonical (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.1A); land as a later Weekly **advanced** slice |
| **DEAD_OR_LEGACY_CANDIDATE** | `combineShippingPlans`, `uncombineShippingPlans` — WSR-1: **SPEC-SUPERSEDED** by the derived-`MULTI` model (B-2); do not implement; retire stubs later (user decision). See `WEEKLY_SHIPPING_PLAN_HANDLER_RECONCILIATION.md` |

---

## 4. Workspace API opportunities (evidence-based)

The #1 performance + coupling problem is **whole-DB read** (`getOperationDb` = all 44 tabs) on every page load AND after every write (`loadOperationDb({force:true})`). Per-page workspace reads replace it.

| Candidate | Current calls | Tables needed | Proposed sections | Write actions kept separate |
|---|---|---|---|---|
| `getInventoryReplenishmentWorkspace` | whole-DB + amazon snapshots + shipping_allocation_drafts | marketplace_skus, sku_details, overseas/amazon snapshots, fc_*, shipping_allocation_drafts | scope filters · replen rows · draft recovery | createShippingPlansBatch, upsertShippingAllocationDraft* |
| `getWeeklyShippingPlanWorkspace` | whole-DB | shipping_plans(+lines), carriers, carrier_rate_cards, sku_details | plans by status · rate candidates | update*Status/LineQty, complete, note |
| `getRequestOrderWorkspace` | whole-DB | request_orders(+lines,+sources,+site_confirmations), fc_*, marketplace_skus | drafts · tiers · allocations | create/update/cancel/convert |
| `getPurchaseOrderWorkspace` | whole-DB | purchase_orders(+lines), request_orders | overview · list/gantt | receive/status/header |
| `getShipmentWorkspace` | whole-DB | shipments(+lines), shipping_plans, carriers, warehouses | draft · overview | update/confirm |
| `getFCSummaryWorkspace` | whole-DB | fc_regular_forecast, fc_special_events, fc_target_rules, campaigns(+lines), marketplace_skus | regular · event · targets | import/upsert/delete |
| `getSkuDetailsWorkspace` / `getSkuRegionalWorkspace` | whole-DB | sku_details, marketplace_skus, tax_* , sku_regional_details | table · tax · regional | upserts |
| `getRecommendationWorkspace` | (none yet — engine not wired) | production source tables + drafts | preview facts · drafts · decisions | **DO_NOT_API_YET** |

Cache suitability: master-data sections (sku_details, marketplaces, carriers) are long-lived → cache + invalidate on their upserts; transactional sections (plans/orders/shipments/drafts) → invalidate on their own writes only, not whole-DB.

---

## 5. Performance audit (classified)

| Issue | Evidence | Class |
|---|---|---|
| Whole-DB read on every load + after every write | `getOperationDb` all-44-tabs; `loadOperationDb({force:true})` after each write | SHEET_IO_LATENCY + DUPLICATE_WORK |
| No request cancellation / stale overwrite | no AbortController in transport | STALE_RESPONSE_RISK |
| Repeated master-data reload | master tables re-read on every workspace refresh | DUPLICATE_WORK |
| Multi-step writes issue N sequential POSTs (e.g. request-order Send Request = 4 calls) | `request-order.js:2273-2319` | TRANSPORT_LATENCY |
| Large response payload | whole-DB JSON | SHEET_IO_LATENCY |
| Server-side Sheet scans / header mapping | handlers `getDataRange()` per action | SHEET_IO_LATENCY (UNKNOWN magnitude; server not profiled) |

**API transport alone does not fix Sheet I/O** — workspace batching + targeted invalidation + server-side read reduction are required together.

---

## 6. Phased implementation plan

> **Reconciliation (2026-08-04):** the **contract freeze** and the **dormant foundation implementation** were delivered together in the round issued as **"API-1 — Foundation Implementation (Round A)"** — see `API_FOUNDATION_ARCHITECTURE.md`. The two bullets below are therefore folded into a single completed **API-1**, and the first vertical slice becomes **API-2** (matching that round's own "Next Slice"). Later phase numbers shift by one accordingly.

- **API-1 — Foundation Contract Freeze + Implementation (✅ SOURCE-PRESENT / TEST-VERIFIED, DORMANT — 2026-08-04).** Frozen: one envelope `{success,data,meta,errors}`; error taxonomy (incl. `FORBIDDEN_OPERATION` mapping the S0/S0.5 safety tokens); the 7-workspace Registry (REGISTERED only); transport contract (`text/plain` POST + GET action, configured-guarded `ApiTransport`); feature flag `USE_WORKSPACE_API=false`; memory Cache interface (TTL=0). Built: `assets/js/api/km-api-foundation.js` (ApiClient → ApiTransport → ApiDispatcher → WorkspaceResolver → ResponseEnvelope/ErrorEnvelope/Cache/LegacyAdapter), **zero business logic**, 100% backward-compatible (legacy delegation, additive `<script>`, inert while flag off), 56/0 tests. Action-registry reconciliation of the 5 missing handlers mirror↔deploy stays a **live-deploy** task (not resolvable from source) — deferred to the Verification-Copy phase.
- **API-2 — First Read-Only Vertical Slice (✅ RESOLVER SOURCE-PRESENT / TEST-VERIFIED, NOT DEPLOYED, NO CUTOVER — 2026-08-04).** Implemented `weeklyShipping.workspace.get` — the first real Workspace resolver (`weeklyShipping` graduated `REGISTERED → IMPLEMENTED`). Server owner `40_api_v1_weekly_workspace.gs` (+ thin `01_router.gs` dispatch): targeted read of only the 4 Weekly tables (never `getOperationDb`), S0/S0.5 exact-ID + validate-only guards, pure page-oriented View Model (filters/summary/plans/details/pagination/dataVersion), canonical envelope + `requestId` + `serverDurationMs`. Foundation gained the **per-workspace flag** (global master AND `WORKSPACE_API_ENABLED`, all default false), the Weekly client resolver, and abort/stale-sequence readiness. **No page cutover, no write, no business change**; multi-currency never aggregated; business-failure never false-success. Tests: `km-api-weekly-workspace.test.js` 64/0; API-1 57/0 + F2 compat 42/0 updated. See `API_WEEKLY_SHIPPING_WORKSPACE_SPEC.md` + `API_WEEKLY_SHIPPING_PARITY_REPORT.md`. **Page cutover deferred to API-3.**
- **API-3A — Weekly READ page cutover (✅ SOURCE-PRESENT / TEST-VERIFIED, NOT DEPLOYED, DEFAULT LEGACY — 2026-08-04).** The Weekly Shipping Plan page's **read** path routes to `getWorkspace("weeklyShipping")` behind the effective per-workspace flag (default false → Legacy) via one reversible boundary `loadWeeklyShippingReadModel_`; snapshot-primary render, stale-seq guard, visible errors (no silent fallback), all writes stay Legacy. Minimal §22 read-only Workspace extension (`raw` passthrough). No page cutover to Production. See `API_WEEKLY_SHIPPING_CUTOVER_SPEC.md` + `API_WEEKLY_SHIPPING_F3A_REPORT.md`. **API-3B = Verification-Copy browser validation (next).**
- **API-3 (write slice) — First Draft Write Vertical Slice.** Wrap that slice's writes (status/qty/note) with the frozen envelope + targeted invalidation (the Cache seam, currently TTL=0). *(Follows API-3B verification.)*
- **API-4 — Verification Copy End-to-End.** Run API-2/3 against a **duplicated verification Spreadsheet** (set `PRODUCTION_DB_SPREADSHEET_ID_`), full before/after diff + rollback — the S0.5 gate; reconcile the 5 missing-handler actions mirror↔deploy here. **No Production.**
- **API-5+ — Remaining domains** in dependency order: SKU/Tax → FC/Campaign → Inventory/Overseas → Request Order/PO → Shipment → (Recommendation LAST, after Submit boundary freeze).

*(Legacy pre-reconciliation numbering: the old API-1/API-2 split is now API-1; old API-3/4/5/6 are API-2/3/4/5+. The F1–F6 checkpoint names in §10 are unchanged — they are keyed to events, not phase numbers.)*

---

## 7. Recommended first vertical slice — evidence-based

**Recommendation: `getWeeklyShippingPlanWorkspace` (read) + shipping-plan status writes (API-4).**

| Criterion | Why shipping-plan wins |
|---|---|
| Runtime maturity | Handlers exist + are fully connected end-to-end today (FULLY_CONNECTED, F1) |
| User value | Core weekly workflow; high-frequency page |
| Performance impact | Currently whole-DB read; clean workspace win |
| Write risk | Status transitions are idempotent-ish, non-destructive, already readback-verified |
| Testability | Golden/route-inventory + shipment tests exist; easy parity check |
| Dependency count | Reads a bounded table set (plans/lines/carriers/sku_details) |
| Unresolved boundaries | **None** — unlike Recommendation (engine + Submit unresolved) |

**Why NOT Recommendation first** (despite the round's default expectation): the recommendation pipeline is **backend-only, not loaded in the browser, has no UI, and its Submit boundary is explicitly deferred** (F1 §1.2). Making it the first slice would require building UI + engine wiring + Submit decisions simultaneously — highest risk, lowest immediate value. Recommendation is scheduled **last** (API-6+), after Submit boundary freeze and after the read/write API pattern is proven on shipping-plan.

---

## 8. Submit boundary (frozen constraint)

- Current Submit reality: **MONTHLY_ORDER** manual path reaches an immutable submitted snapshot + Request Orders via `submitRequestOrderAllocationDrafts` (seeded by USER qty, not a generated recommendation). **WEEKLY_SHIPPING** reaches `shipping_plans` (Draft) via `createShippingPlansBatch`, promoted by `updateShippingPlanStatus{approve}` (auto-shipment). `submitShippingAllocationDrafts` exists but has **no UI**.
- The **recommendation→submitted-snapshot** path (Production Writer) does **NOT** Submit by design (S0). 
- **Rule:** `submit*` actions and `generateRecommendationDraftLocked` are `DO_NOT_API_YET`. Submit enters API implementation only after its business boundary (immutable snapshot identity, downstream record creation, reopen/revision) is separately frozen. **Do not expose Submit in API-1…API-4.**

---

## 9. Legacy retirement strategy

1. Nothing retired until its replacement passes F3/F4 on the Verification Copy.
2. **REMOVE_DEAD_CODE_LATER** (fc `saveNewSku`/`openAddSkuModal`, home Add-Todo dead render, fc legacy Edit false-success buttons) — retire only after confirming the connected path covers the function; the P0 fc Edit buttons should be **disabled/removed** (not given a fake handler) once the builder path is the sole editor.
3. `WEB_APP_FETCH` legacy transport stays live (RETIRE_AFTER_API_CUTOVER) until the new API passes F5.
4. Every retirement gated by **F4** (prove a working replacement exists).

---

## 10. Functional gap checkpoints (part of the API roadmap)

- **F1 — Post-Inventory Functional Gap Baseline** — *produced by this round* (`FUNCTIONAL_REACHABILITY_AUDIT.md`).
- **F2 — After API Foundation:** re-run the F1 matrix; confirm **no currently-connected function lost** (parity with `KM.DB.*`). **✅ ESTABLISHED (source/test-proven) 2026-08-04, Round API-1.5** — `API_FUNCTIONAL_COVERAGE_F2.md` + `API_FOUNDATION_COMPATIBILITY_AUDIT.md`: Foundation inert/zero-I/O, `KM.DB` authority preserved via **call-time resolution** (one stale-capture defect found + fixed), flag-off legacy parity, flag-on unimplemented workspaces fail-closed, no dual execution, no false-success (rejection→`success:false`; resolved `{success:false}` preserved in `data`), 62/62 Router actions guard-allowed, all pages source-proven unaffected (live rendering = browser-smoke, OPEN). New tests: `km-api-foundation-compat.test.js` 41/0 (+ API-1 56/0 = 97). Browser-smoke + per-slice flag + requestId/timing remain API-2 items.
- **F3 — After each Vertical Slice (API-3/4…):** diff old vs new reachability for the migrated page; every FULLY_CONNECTED control must remain FULLY_CONNECTED.
- **F4 — Before Legacy Retirement:** prove every retired action has a working replacement (SOURCE- or TEST-PROVEN).
- **F5 — Before Production Cutover:** full page-by-page functional verification on the **Verification Copy** (S0.5 gate; before/after diff + rollback).
- **F6 — Post-Cutover:** verify all navigation, controls, writes, readbacks, and error paths on Production.

---

## 10a. Release governance (added 2026-08-04)

All API migration releases (API-1 onward) follow the **manual, user-controlled** deployment process frozen in `DEPLOYMENT_RELEASE_GOVERNANCE.md` + `DEPLOYMENT_RELEASE_LOG.md`: Git push and Apps Script deployment are separate explicit user steps; only Completion-Report-approved `APPS_SCRIPT_SYNC_REQUIRED` files are synced; the generated bundle is never manually edited; each release records commit ↔ deployment version ↔ bundle hash ↔ smoke-test result. Nothing auto-deploys because code changed. (This note only; API-0 findings above are unchanged.)

## 11. Verification Copy gate (inherited from S0.5)

No live API verification touches Production. API-5 and F5 run on a **duplicated verification Spreadsheet** with `PRODUCTION_DB_SPREADSHEET_ID_` set to the copy (currently empty → fail-closed). Only after F5 passes on the copy is a **separate** Production authorization considered. The live data incident remains OPEN until then.

---

## 12. Immediate non-API follow-ups surfaced by F1 (NOT this round; NO silent repair)

- **P0:** retire fc-summary `saveFcChanges`/`saveEventChanges` false-success buttons (builder path already persists).
- **P1:** route campaign-risk Add/Delete Promotion to `upsertCampaign`/`upsertCampaignSkuLines` (backend exists) OR relabel as local-only.
- **P2:** decide owner + UI for Weekly L1/L2 (handler missing); expose or remove `updatePurchaseOrderLine` + PO advanced transitions + `submitShippingAllocationDrafts`.
- Each is recorded as a future task with evidence in `FUNCTIONAL_REACHABILITY_AUDIT.md`; none are implemented here.

---

*Companions:* `API_CURRENT_TRANSPORT_ACTION_INVENTORY.md`, `FUNCTIONAL_REACHABILITY_AUDIT.md`. Documentation only — no code, DB, router, endpoint, or deploy change. Golden 39/1/0; Scenario #34 Pending.

---

## 13. F1-7A-R1 refresh (2026-08-13, HEAD `2f43ed9`) — current-evidence delta (does NOT supersede §1–§12)

Full evidence map: `F1_7A_SYSTEM_API_TRANSPORT_LOADING_AUDIT_R1.md`. This refresh re-verifies §1–§12 against current HEAD and adds detail; the phase order (API-1…API-5+), Submit boundary (§8), F1–F6 checkpoints (§10), and Verification-Copy gate (§11) remain authoritative.

**State confirmed at `2f43ed9`:**
- **API-1 foundation** (`km-api-foundation.js` registry) present; **API-2 `weeklyShipping.workspace.get` IMPLEMENTED**; **API-3A weekly read cutover present but flag default LEGACY (OFF)** — i.e. the first workspace is built and inert, matching §6. The other 6 registry workspaces (`recommendation` [active], `skuDetails`, `fcSummary`, `requestOrder`/`purchaseOrder`, `shipment`) are **REGISTERED-not-IMPLEMENTED** (recommendation resolver is the one active canonical read).
- **97 router actions** (A2/B9/C53/D11/E8/F7/G7); only ~5 domains have a scoped read; **14 actions exist but are unconsumed** (the whole Final Output document read chain `finalize/getFinalOutput/renderDocument/documentTemplate.*/shipmentDocument.get|list`, plus `generateRecommendationDraftLocked`, `requestOrderDraft.generateFromGap`, and 5 admin one-offs).
- **`getOperationDb` still whole-DB; `_opDbCache` still a global no-TTL singleton; ~40 writers still `loadOperationDb({force:true})`** (WRITE_FORCES_FULL_RELOAD, HIGH) — §5 hazard persists. 17 broad-load call sites; REQUIRED_SYSTEM_SNAPSHOT = 0.

**Business-authority-risk client math to route through canonical backend read-models during the matching phase (extends §2 duplicate-authority):** campaign-risk `calculateSkuRisk`; fc-summary Event-Assist (the only one that WRITES a browser-derived canonical value); request-order PO-remaining fallback + stock aggregations; purchase-order-list `remaining=completed−shipped`; shipping-plan `_spLineDisplay` stock/avg/days; inventory-replenishment incoming-remaining + receiver attribution; global-logistics-map `derivedReceiptStatus` (watch). Display mirrors are acceptable; browser-authored canonical writes are not.

**Recommended immediate next slice (consistent with §6/§7):** finish **API-3B verification** of the already-built `weeklyShipping` read cutover, then flip API-3A to Workspace on the Verification Copy, then **API-3 weekly writes with targeted invalidation** (the Cache seam) — this is the smallest reversible step that first breaks the WRITE_FORCES_FULL_RELOAD pattern on one proven page before generalizing. Then implement `purchaseOrder`/`requestOrder`/`fcSummary`/`shipment` workspaces in the §6 API-5+ dependency order (Recommendation LAST). Each slice reports the §14-style version block and preserves the §12 frozen contracts (BEFORE == AFTER on the same fixture).

**E2E status:** `F1-PHASE1-LIVE-ACCEPTANCE-R2 = PAUSED_BY_USER_FOR_API_MIGRATION` (ledgers preserved; resumes after the migration final gate).

### F1-7B-R1 delta (2026-08-13) — Weekly Shipping read migration DONE
`weeklyShipping` is now a **CANONICAL** workspace (master-flag-independent; kill switch
`KM.api.setWorkspaceEnabled('weeklyShipping', false)`) — joining `recommendation`. The Shipping Plan page's primary
production render is scoped-workspace driven with **no broad Operation DB** and **scoped post-write refresh** (no
full-DB reload). Shared `KM.loadState` loading-state contract added (`km-loading-state.js`). `_spLineDisplay` proven
DISPLAY_ONLY in Workspace mode (derivation survives only as the dormant Legacy fallback). BEFORE == AFTER
(41/0 equivalence suite; full regression only the 4 known baseline failures). No `.gs`/DB/bundle change; frontend
deploy only; `40_` deployment presence = USER_VERIFY. app.js global prime KEPT (removal not yet globally safe).
See `F1_7B_API_SHARED_INFRA_WEEKLY_SHIPPING_CUTOVER_R1.md`. Next: BATCH C (purchaseOrder/requestOrder workspace).

### F1-7C-R1 delta (2026-08-13) — Purchase Order scoped read DONE
`purchaseOrder` is now a CANONICAL workspace (new backend `50_api_v1_purchase_order_workspace.gs` + router action
`purchaseOrder.workspace.get`; kill switch `setWorkspaceEnabled('purchaseOrder', false)`). Both PO pages
(`purchase-order-overview.js`, `purchase-order-list.js`) render from the scoped workspace — no broad Operation DB for
primary render, scoped post-write refresh. **remaining_qty is backend-owned** (`max(0, completed - shipped)`, the same
projection 13_ persists); the list page's client fallback is downgraded to Legacy-only. Adapter reuses the canonical
db-api normalizers → BEFORE == AFTER. shipped_qty passed verbatim; no FIFO/shipment/factory-stock touched.
**Apps Script sync + new /exec REQUIRED** (new route/handler) — deploy backend before/with the frontend (canonical-ON),
or hold with the kill switch. Bundle/DB unchanged. Full regression only the 4 known baseline failures. Batch F still
owns the ~40-writer internal WRITE_FORCES_FULL_RELOAD + app.js global-prime removal. See
`F1_7C_PO_WORKSPACE_AND_CUTOVER_R1.md`. Next: `requestOrder` or `shipment` workspace.

### F1-7D-R1 delta (2026-08-13) — Request Order scoped read DONE
`requestOrder` is now a CANONICAL workspace (new backend `51_api_v1_request_order_workspace.gs` + router action
`requestOrder.workspace.get`; kill switch `setWorkspaceEnabled('requestOrder', false)`). The Request Order **Draft page**
(`request-order-draft.js` — persisted Draft/Pending/Approved cards) renders from the scoped workspace — no broad
Operation DB for primary render, scoped post-write refresh, fail-closed on error, `KM.loadState` region. The workspace
composes ONLY persisted `request_orders`/`request_order_lines` (+ masters the page consumes) — **no Gap/Forecast/
Recommendation, no draft generation/persistence, no RO→PO, no second engine**; `request_order_line_sources` read
OPTIONAL/missing-safe (write path documented PENDING). Adapter reuses the canonical + master db-api normalizers with the
same per-array filters → BEFORE == AFTER. **Scope note:** the larger `request-order.js` (AI-Plan/下單系統 first-layer
table) is a DIFFERENT read model that reconstructs Forecast/stock/PO-remaining client-side and owns `_opMatCache`; its
gap/draft path is already scoped. It is **NOT migrated** this round (would need a backend Forecast/inventory read owner,
forbidden by the transport-only guardrail) — deferred as its own bounded round. `_opMatCache` unchanged. Writes stay on
`KM.DB.*` (payload/authority unchanged); the ~40-writer internal WRITE_FORCES_FULL_RELOAD + app.js global-prime removal
remain Batch F. **Apps Script sync + new /exec REQUIRED** (new route/handler) — deploy backend before/with the frontend
(canonical-ON), or hold with the kill switch. Bundle/DB unchanged. Full regression only the 4 known baseline failures.
See `F1_7D_REQUEST_ORDER_WORKSPACE_AND_CUTOVER_R1.md`. Next: `shipment` workspace (or `fcSummary`/`skuDetails`); the
`request-order.js` first-layer table as a separate Forecast/inventory-read-owner round.

### F1-7E-R1 delta (2026-08-13) — AI-Plan first-layer cutover HALTED (audit-only)
Attempted to cut `request-order.js`'s first-layer planning table off the broad Operation DB. **HALT** —
`FORECAST_BACKEND_AUTHORITY_NOT_ESTABLISHED` + `INVENTORY_BACKEND_AUTHORITY_NOT_ESTABLISHED`. Audit proved NO reusable
canonical backend read owner composes the first-layer per-SKU columns: the raw `basicT3`/special-event forecast Σ (over
an Asia/Taipei-`now` window) has no owner and does NOT equal the recommendation workspace's Target%-adjusted blended
`allocatedForecastQty` (reusing it = `BUSINESS_EQUIVALENCE_FAILED`); raw factory_stock/overseas Σ per SKU exist only as
*allocated* qty inside the gap allocator, not raw pools; open-PO-remaining-per-SKU has no owner (F1-7C `remaining_qty` is
PO-line-keyed); lead-time is read by no backend. Backing the page = ≥4 new read authorities + relocating four browser-only
business rules → forbidden by §2/§4/§5/§14/§19. The second-layer Gap/Recommendation path (materialized `order_planning_gap`
+ `recommendation.workspace.get`) is ALREADY scoped and unchanged; `_opMatCache` unchanged (transient canonical-DTO cache,
not a second authority). No `.gs`/router/frontend/bundle/DB change. **Smallest prerequisite:** PREREQ-0 DECISION round
(redefine columns to canonical facts vs. build raw-aggregate owners), then PREREQ-1 open-PO-remaining-per-SKU (canonical
F1-7C reuse), PREREQ-2 fcSummary forecast owner, PREREQ-3 scoped inventory owner, PREREQ-4 lead-time, then the composed
first-layer cutover. See `F1_7E_PLANNING_READ_OWNERS_AND_AI_PLAN_CUTOVER_R1.md`. request-order.js remains broad-cache-
dependent (first-layer + Target-Rules editor + forecast-breakdown surfaces); global-prime removal stays Batch F.

### F1-7E-PREREQ-0-R1 delta (2026-08-13) — AI-Plan Three-Layer Fact Authority Contract (decision only)
Formal fact-authority contract for the AI-Plan first layer. No runtime change. Establishes a **three-layer fact model**:
**Layer 1 RAW/OPERATIONAL** (Basic FC, Special Event FC, Site/Overseas/Factory Stock, Open-PO Remaining, Lead Time — raw
aggregations of persisted operational rows), **Layer 2 CANONICAL PLANNING** (adjusted demand, allocated supply, gap,
recommended/suggested — owned by the existing engine; already scoped via 42_/43_), **Layer 3 HUMAN DECISION** (chosen
order qty, manual allocation → RO → PO). Every first-layer field classified + mapped to its authority + future owner in
`F1_7E_PREREQ_0_AI_PLAN_FACT_AUTHORITY_DECISION_R1.md`. FINAL GATE PASS (Raw ≠ Canonical ≠ Human, unambiguous). No HALT.

**FROZEN API-MIGRATION CONTRACT (governs all remaining API-migration rounds):**
1. API migration = TRANSPORT / READ-OWNER migration unless a separate business-change task explicitly authorizes otherwise.
2. Migration MUST NOT silently change displayed business semantics.
3. RAW OPERATIONAL FACT and CANONICAL PLANNING FACT are DIFFERENT authority classes.
4. Existing canonical Planning APIs MUST NOT be reused for Raw Facts when the semantic meaning differs (e.g. raw forecast
   ≠ Target%-adjusted demand; `factory_stock_raw_qty` 1,200 ≠ `allocated_factory_supply_qty` 700).
5. Browser-side Raw Fact aggregation SHOULD move to backend scoped read owners.
6. Moving aggregation backend MUST preserve BEFORE FACT == AFTER FACT.
7. Canonical Planning facts MUST NEVER be recomputed in the frontend.
8. The AI-Plan read workspace is a COMPOSER, not a second engine.
9. HUMAN DECISION FACTS remain distinct from both Raw and Planning facts.
10. Shared Factory: `factory_id` NEVER determines company; KM / ResTW / ResUS remain independent company scopes even when
    sharing a factory.

Two PRODUCT_DECISION_REQUIRED items recorded for implementers: PDR-1 (Open-PO-Remaining fallback `max(0, ordered −
max(shipped, completed))` differs from canonical `max(0, completed − shipped)` — decide reproduce-exact vs converge);
PDR-2 (freeze the N+1..N+3 time-anchor as client-supplied/frozen cycle, not server clock). Next: **PREREQ-1
Open-PO-Remaining-per-SKU scoped read owner** (canonical F1-7C reuse). F1-PHASE1-LIVE-ACCEPTANCE-R2 =
PAUSED_BY_USER_FOR_API_MIGRATION (unchanged).
