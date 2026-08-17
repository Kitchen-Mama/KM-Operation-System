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

### F1-7E-PREREQ-1-R1 delta (2026-08-13) — Open-PO-Remaining raw read owner DONE
New backend owner `52_api_v1_open_po_remaining_owner.gs` + router action `openPoRemaining.raw.get` exposes the AI-Plan
Layer-1 RAW fact `open_po_remaining_raw_qty` per SKU. **PDR-1 resolved = OPTION (a):** the owner reproduces the CURRENT
browser `ongoing()` exactly — persisted `remaining_qty` preferred, else the browser fallback `max(0, ordered −
max(shipped, completed))` (NOT the canonical `max(0, completed − shipped)` on blank rows; convergence is a separate
business task). Grain = per SKU, OPEN-PO statuses {issued, in_production, partial_completed, partial_shipped,
ready_to_ship, confirmed} (verified == source RO_OPEN_PO_STATUS), **company-independent** (shared factory pipeline;
`scope` echoed, never filters — factory_id never determines company). Dedicated owner (NOT folded into 50_) to keep the
canonical PO-line `remaining_qty` (50_) and this Layer-1 informational aggregate as distinct authority classes; 50_
untouched. Reads only purchase_orders + purchase_order_lines; never getOperationDb; read-only; no FIFO/shipment/second
engine. **BEFORE == AFTER proven** by a gold-standard suite (28/0) running the real `ongoing()` over real db-api
normalizers vs the real backend on raw rows, incl. KM/ResTW/ResUS shared-factory. No AI-Plan cutover (request-order.js
still broad-cache; owner composed later in PREREQ-5). **Apps Script sync + new /exec REQUIRED** (52_ + router; safe to
deploy independently — nothing consumes it yet). No frontend/bundle/DB change. Full regression: only the 4 known baseline
failures. See `F1_7E_PREREQ_1_OPEN_PO_REMAINING_SCOPED_OWNER_R1.md`.

**PREREQ status:** PREREQ-0 = DONE · PREREQ-1 = DONE · PREREQ-2 = NOT_STARTED · PREREQ-3 = NOT_STARTED · PREREQ-4 =
NOT_STARTED · PREREQ-5 = NOT_STARTED. Next: **PREREQ-2 fcSummary scoped raw-forecast owner** (raw fc_regular_forecast +
fc_special_events prep-month, no Target%/blend; honor PDR-2 time-anchor).

### F1-7E-PREREQ-2-R1 delta (2026-08-13) — FC-Summary raw forecast read owner DONE
New backend owner `53_api_v1_fc_summary_raw_owner.gs` + router action `fcSummary.raw.get` exposes two AI-Plan Layer-1 RAW
facts per SKU/site/cycle: `basicFcRawT3Qty` (raw fc_regular_forecast N+1..N+3 sum) and `specialEventFcRawQty` (raw
fc_special_events prep-month sum). **PDR-2 resolved:** time authority = `planning_cycle` "RECO-YYYY-MM" (REQUIRED,
fail-closed on malformed); window = anchor+1..anchor+3 with year wrap (== browser `_roMonthWindow(1,3)`); never the
server/browser clock. Reproduces `basicT3()` (group by UPPER(sku)|UPPER(country)|LOWER(marketplace), company-independent;
per-window-month row-by-year-else-first; parseFloat month cells) and `_roSpecialEventsTotal()` (conditional-wildcard scope
incl. company + scope_type=sku; prep-month = start−30d with the period-fallback ported; 100% each event once) EXACTLY —
no Target%, no blending, Basic and Special kept separate. Dedicated bounded owner (action `.raw.get`, NOT the broader
`fcSummary.workspace.get` slot — no authority conflict); reads only fc_regular_forecast + fc_special_events, missing-safe
(match browser graceful-empty); never getOperationDb; read-only; no second forecast engine; KMPD/recommendation/gap
untouched. **BEFORE == AFTER proven** by a gold-standard suite (40/0) running the real browser basicT3()/
_roSpecialEventsTotal() over real db-api normalizers with a frozen `_roTpeNow` anchor == planning_cycle, incl. year
crossing. No AI-Plan cutover (request-order.js still broad-cache; composed later in PREREQ-5). **Apps Script sync + new
/exec REQUIRED** (53_ + router; safe to deploy independently — nothing consumes it yet). No frontend/bundle/DB change.
Full regression: only the 4 known baseline failures. See `F1_7E_PREREQ_2_FC_SUMMARY_RAW_FORECAST_OWNER_R1.md`.

**PREREQ status:** PREREQ-0 DONE · PREREQ-1 DONE · PREREQ-2 DONE · PREREQ-3 NOT_STARTED · PREREQ-4 NOT_STARTED ·
PREREQ-5 NOT_STARTED. Next: **PREREQ-3 scoped raw-inventory read owner** (raw amazon_inventory_snapshot latest strict
scope + overseas_inventory_snapshot Σ + factory_stock Σ; raw pools only, no allocation).

### F1-7E-PREREQ-3-R1 delta (2026-08-13) — scoped raw-inventory read owner DONE
New backend owner `54_api_v1_raw_inventory_owner.gs` + router action `rawInventory.get` exposes three AI-Plan Layer-1 RAW
facts per SKU/site: `siteStockRawQty` (latest amazon_inventory_snapshot row for the site: available+fc_transfer+
fc_processing), `overseasStockRawQty` (Σ overseas_inventory_snapshot.available_stock over same-country NON-factory
warehouses, POOLED — no latest dedup), `factoryStockRawQty` (Σ factory_stock.current_stock per SKU, company/factory-
INDEPENDENT shared pool). Reproduces browser siteStock()/thirdParty()/factoryBySku EXACTLY (incl. blank-marketplace→
'Amazon' default, lexicographic latest-snapshot, warehouse country + is_factory exclusion, canonical fac_current_stock).
Per-fact scope asymmetry preserved (site: sku+country+marketplace; overseas: sku+country; factory: sku only —
company/factory always IGNORED). Dedicated bounded owner (does NOT reuse KMPS/KMHP/KMTPP allocated supply — different
facts); reads only the 4 inventory/warehouse tables, missing-safe; never getOperationDb; read-only; NO allocation/gap/
recommendation/second engine. **Shared-factory proven:** KM==ResTW==ResUS == same raw factory pool (1200). **BEFORE ==
AFTER proven** by a gold-standard suite (46/0) running the real browser aggregations over real db-api normalizers vs the
real backend on raw rows. No AI-Plan cutover (request-order.js still broad-cache; composed later in PREREQ-5). **Apps
Script sync + new /exec REQUIRED** (54_ + router; safe to deploy independently). No frontend/bundle/DB change. Full
regression: only the 4 known baseline failures. See `F1_7E_PREREQ_3_SCOPED_RAW_INVENTORY_OWNER_R1.md`.

**PREREQ status:** PREREQ-0 DONE · PREREQ-1 DONE · PREREQ-2 DONE · PREREQ-3 DONE · PREREQ-4 NOT_STARTED · PREREQ-5
NOT_STARTED. Next: **PREREQ-4 lead-time read** (supplier_price_list latest-active lead_time_days per SKU; reproduce browser
leadTime()).

### F1-7E-PREREQ-4-R1 delta (2026-08-13) — lead-time read owner DONE; all Layer-1 facts now have backend owners
New backend owner `55_api_v1_lead_time_owner.gs` + router action `leadTime.raw.get` exposes `leadTimeDays` per SKU.
Reproduces browser `leadTime()` EXACTLY: group supplier_price_list by UPPER(sku) (SKU-only — company/country/marketplace/
supplier/factory ALL ignored/CONTEXT_ONLY); filter active (is_active ∈ {active,true,yes,1}); sort effective_from DESC
(stable, V8 both sides); take first; leadTimeDays = null when no active row / blank cell, else parseFloat||0 (EMPTY null
!= ZERO 0). Dedicated bounded owner (no existing supplier_price_list lead-time read owner; carrier/master-data lead_time
are different concepts); reads only supplier_price_list, missing-safe; never getOperationDb; read-only; no cross-domain
reads / second engine. **BEFORE == AFTER proven** by a gold-standard suite (27/0) running the real browser leadTime() over
the real db-api normalizer vs the real backend on raw rows. No AI-Plan cutover. **Apps Script sync + new /exec REQUIRED**
(55_ + router; deploy independently). No frontend/bundle/DB change. Full regression: only the 4 known baseline failures.
See `F1_7E_PREREQ_4_LEAD_TIME_SCOPED_OWNER_R1.md`.

**PREREQ status:** PREREQ-0 DONE · PREREQ-1 DONE · PREREQ-2 DONE · PREREQ-3 DONE · PREREQ-4 DONE · PREREQ-5 NOT_STARTED.
**All AI-Plan Layer-1 facts now have a backend authority** (Basic FC + Special FC → `53_` fcSummary.raw.get; Site/Overseas/
Factory → `54_` rawInventory.get; Open-PO-Remaining → `52_` openPoRemaining.raw.get; Lead Time → `55_` leadTime.raw.get;
Gap → `43_` orderPlanningGap.get; Recommendation → `42_` recommendation.workspace.get). Next: **PREREQ-5 AI-Plan
first-layer COMPOSER + cutover** (compose the owners + already-scoped Gap/Recommendation; cut request-order.js first-layer
off _opDbCache; a COMPOSER, not a second engine).

### F1-7E-PREREQ-5-R1 delta (2026-08-13) — AI-Plan first-layer scoped read DONE
New backend COMPOSER `56_api_v1_ai_plan_first_layer.gs` + router action `aiPlanFirstLayer.get` returns the AI-Plan
first-layer rows byte-identical to `_buildRequestOrderRowsFromDb`, by REUSING the 52_/53_/54_/55_ pure Layer-1 fact
functions + identity (marketplace_skus/sku_details) — NO new formula, NO second engine, NO duplicated arithmetic. Reads a
targeted table set (never getOperationDb). NULL-fidelity preserved exactly (facts feed both the display "--"/"0"/"-"
distinctions AND the allocation-draft snapshot writes). planning_cycle is client-resolved from `_roTpeNow()` (PDR-2;
server never uses its clock). **Frontend cutover:** `request-order.js` first-layer primary read = `KM.DB.getAiPlanFirstLayer`
(scoped) → only the DATA SOURCE of `requestOrderState.data` changed (all render/filter/second-layer/allocation logic
untouched → whole-page BEFORE == AFTER); no broad Operation DB in the first-layer assembly; fail-closed bounded ERROR (no
silent legacy fallback); `KM.loadState` region; kill switch `window.KM_FLAGS.USE_AI_PLAN_FIRST_LAYER_COMPOSER` (canonical
default ON). Secondary same-page panels (Edit Target %/FC Update/forecast breakdown — reachable only from an expanded row)
lazy-load the broad cache on first expand, so the first-layer stays composer-only. Legacy `_buildRequestOrderRowsFromDb`
is DORMANT (kill-switch only). `_opMatCache` unchanged (second-layer materialized-gap cache, not the first-layer
authority). Composer uses `KM.DB` (not a foundation workspace) → km-api-foundation.js untouched, no registry contract
churn. **BEFORE == AFTER proven** by a master gold-standard suite (154/0) running the real `_buildRequestOrderRowsFromDb`
over real db-api normalizers vs the real composer, comparing every row field (KM/ResTW/ResUS, shared factory, null-vs-zero,
year-crossing, empty, error). Full regression: only the 4 known baseline failures. Bundle unchanged (aaf5b07); DB NONE.
**Apps Script sync + new /exec REQUIRED — CUMULATIVE: sync 52_+53_+54_+55_+56_+01_router.gs together (PREREQ-1..5 may not
have been individually deployed); backend before the canonical-ON frontend.** Frontend deploy: request-order.js +
operation-system-db-api.js. See `F1_7E_PREREQ_5_AI_PLAN_FIRST_LAYER_COMPOSER_AND_CUTOVER_R1.md`.

**PREREQ status:** PREREQ-0..5 ALL DONE. **AI Plan first-layer scoped read = DONE.** (Full system API migration NOT
complete — Shipment/On-the-Way, the ~40-writer WRITE_FORCES_FULL_RELOAD, app.js global prime, and request-order.js
SECONDARY surfaces remain.) Live Acceptance remains PAUSED_BY_USER_FOR_API_MIGRATION.

### F1-7F-R1 delta (2026-08-13) — Shipment + On-the-Way scoped read DONE
`shipment` is now a CANONICAL workspace (new backend `57_api_v1_shipment_workspace.gs` + router action
`shipment.workspace.get`; kill switch `setWorkspaceEnabled('shipment', false)`). Both active Shipment surfaces render
from the scoped workspace — `shipping-history.js` (Draft + Overview) off the BASE tables (shipments, shipment_lines,
warehouses, carrier_rate_cards), and `global-logistics-map.js` (On-the-Way) additionally off the include-gated MAP tables
(shipment_routes, shipment_events, logistics_locations, shipment_route_templates, shipment_route_template_nodes) — no
broad Operation DB for primary render, scoped post-write refresh, fail-closed (no silent legacy fallback), `KM.loadState`
region. The db-api `adaptShipmentWorkspace` re-normalizes the DTO raw arrays with the SAME normalizers + per-array filters
as `normalizeOperationDb` → BEFORE == AFTER. `derivedReceiptStatus` proven DISPLAY_ONLY (backend `v.status` remains
authoritative); no FIFO/allocation/PO-shipped/receipt/factory-stock/Final-Output authority moved (57_ is read-only; source
guards). MAP-extra tables read only when the include flag is set (bounded includes; missing-safe). **Apps Script sync +
new /exec REQUIRED** (57_ + router; deploy backend before/with the canonical-ON frontend, or hold with the kill switch).
Frontend deploy: km-api-foundation.js + operation-system-db-api.js + shipping-history.js + global-logistics-map.js.
Bundle/DB unchanged. Contract tests repointed the REGISTERED-only example shipment → inventoryReplenishment + added the
two shipment pages to CUTOVER_PAGES. Full regression: only the 4 known baseline failures. Batch F still owns the
~40-writer internal WRITE_FORCES_FULL_RELOAD + app.js global-prime removal. See
`F1_7F_SHIPMENT_AND_ON_THE_WAY_WORKSPACE_CUTOVER_R1.md`.

**Workspace status:** IMPLEMENTED/canonical = weeklyShipping, recommendation, purchaseOrder, requestOrder, shipment.
REGISTERED-only = inventoryReplenishment, fcSummary, skuDetails. Next: fcSummary/skuDetails workspaces, request-order.js
secondary surfaces, or Batch F (writer-reload + global-prime retirement).

### F1-7G-R1 delta (2026-08-13) — FC Summary scoped read DONE (Event Assist redesign DEFERRED)
`fcSummary` is now a CANONICAL workspace (new backend `58_api_v1_fc_summary_workspace.gs` + router action
`fcSummary.workspace.get`; kill switch `setWorkspaceEnabled('fcSummary', false)`) — DISTINCT from the bounded `53_`
`fcSummary.raw.get` AI-Plan Layer-1 owner (no collision). `fc-summary.js`'s PRIMARY render (Regular / Special-Event /
Target-Rule tables + the Year dropdown + the non-cascading filter universes) sources fc_regular_forecast /
fc_special_events / fc_target_rules / marketplaces from the scoped workspace — no broad Operation DB for the primary
render, scoped post-write refresh (`_fcAfterWrite`), fail-closed (`FC_SUMMARY_READ_FAILED`; no silent legacy fallback),
`KM.loadState` region. The workspace returns RAW passthrough of the FULL four tables (bounded by a non-silent `capped`
backstop) — server-side period/scope narrowing would shrink the Year/filter universes, so it stays a follow-up (BEFORE ==
AFTER). db-api `adaptFcSummaryWorkspace` re-normalizes with the SAME normalizers + per-array filters as
`normalizeOperationDb` → arrays byte-identical to getFcRegularForecast/getFcSpecialEvents/getFcTargetRules/getMarketplaces
(proven: the ACTUAL `_getDbFcRegularData`/`_getDbFcEventData`/`_getDbTargetRules` yield identical render shapes from the
read-model vs the getters). RAW vs ADJUSTED forecast authorities stay distinct: 58_ emits ONLY raw persisted rows (no
Target%, no blending, no Gap/Recommendation). **Target% is NOT applied to any displayed/written forecast on this page**
(the browser `base×target%` multiply is debug-only/unwired) → no frontend parallel canonical Forecast READ authority.
The page's SECONDARY builder/import modals still read the broad cache, **lazy-loaded on modal open** (`_fcEnsureBroadCacheThen`),
so the primary render never depends on it. **§4 Event Assist — `EVENT_ASSIST_FRONTEND_WRITE_AUTHORITY_PRESENT`:** the
growth/adjust magnitude is browser-computed (`Math.round(base×(1+g/100))`) and persisted verbatim as `fc_special_events.fc_qty`
(the backend validates but does not recompute it). Correcting it needs a NEW backend forecast-derivation owner + a changed
Special Event write contract = a Forecast redesign → **`EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED`**, raised as a SCOPED,
DEFERRED write-authority HALT (NOT mixed into this transport cutover; the Special Event write path is left byte-identical).
**Apps Script sync + new /exec REQUIRED** (58_ + router; deploy backend before/with the canonical-ON frontend, or hold
with the kill switch). Frontend deploy: km-api-foundation.js + operation-system-db-api.js + fc-summary.js. Bundle/DB
unchanged. Contract tests: PREREQ-2 workspace-slot assertion updated (slot now legitimately filled, distinct handler);
foundation R3b now "the other two" (inventoryReplenishment, skuDetails); compat CUTOVER_PAGES += fc-summary.js. Full
regression: only the 4 known baseline failures. See `F1_7G_FC_SUMMARY_WORKSPACE_AND_CUTOVER_R1.md`.

**Workspace status:** IMPLEMENTED/canonical = weeklyShipping, recommendation, purchaseOrder, requestOrder, shipment, **fcSummary**.
REGISTERED-only = inventoryReplenishment, skuDetails. Next: skuDetails workspace, fc-summary.js SECONDARY surfaces +
the DEFERRED Event Assist authority redesign, request-order.js secondary surfaces, or Batch F (writer-reload +
global-prime retirement). Do NOT begin automatically.

### F1-7H-R1 delta (2026-08-13) — SKU Details scoped read DONE (regional page DEFERRED)
`skuDetails` is now a CANONICAL workspace (new backend `59_api_v1_sku_details_workspace.gs` + router action
`skuDetails.workspace.get`; kill switch `setWorkspaceEnabled('skuDetails', false)`) — the registered stub is now
IMPLEMENTED. `sku-details.js`'s PRIMARY render (the four SKU lifecycle tables + the per-Series HS-code / Tax subpage)
sources sku_details / tax_referral_rates / tax_rate_components from the scoped workspace — no broad Operation DB for the
primary render, scoped post-write refresh (`_skAfterWrite`), fail-closed (`SKU_DETAILS_READ_FAILED`; no silent legacy
fallback), `KM.loadState` region. The workspace returns RAW passthrough of the FULL tables (bounded by a non-silent
`capped` backstop; the pages' lifecycle sections + Category/Series universes need the complete set) with the `regional`
tables (marketplace_skus + sku_regional_details) **include-gated** and ready for the deferred sku-regional-details.js
cutover. db-api `adaptSkuDetailsWorkspace` re-normalizes with the SAME normalizers + per-array filters as
`normalizeOperationDb` → arrays byte-identical to getSkuDetails/getTaxReferralRates/getTaxRateComponents/getMarketplaceSkus/
getSkuRegionalDetails (proven: the ACTUAL `getAllSkuDataWithOverrides` grouping + `_skuDistinctValues` universes yield
identical output from the read-model vs the getters). The shared `getAllSkuDataWithOverrides(sourceItems)` gained an
optional read-model arg (backward compatible). **§1/§12 Factory Stock invariant PROVEN unchanged:** master-SKU creation
initializes a `factory_stock` (=0) baseline ONLY on the non-running → "Running in the Market" transition
(`handleUpsertSkuDetail_` → `ensureFactoryStockBaseline_`), NOT on mere creation and NOT on marketplace-SKU creation — no
divergence; this READ workspace never touches factory_stock and the write paths (upsertSkuDetail, updateSkuLifecycle,
upsertTaxReferralRate) are byte-identical. **§6 HS-code** stays owned by tax_referral_rates (upsertTaxReferralRate);
read-only transport. **Apps Script sync + new /exec REQUIRED** (59_ + router; deploy backend before/with the canonical-ON
frontend, or hold with the kill switch). Frontend deploy: km-api-foundation.js + operation-system-db-api.js +
sku-details.js + utils/sku-overrides.js. Bundle/DB unchanged. Contract tests: foundation R3b now "only
inventoryReplenishment REGISTERED-only" (+ skuDetails IMPLEMENTED); compat CUTOVER_PAGES += sku-details.js; skuDetails
registration table list updated to include tax_rate_components. Full regression: only the 4 known baseline failures. See
`F1_7H_SKU_DETAILS_WORKSPACE_AND_CUTOVER_R1.md`.

**Workspace status:** IMPLEMENTED/canonical = weeklyShipping, recommendation, purchaseOrder, requestOrder, shipment,
fcSummary, **skuDetails**. REGISTERED-only = inventoryReplenishment. Next: sku-regional-details.js (the deferred SECONDARY
SKU surface — trivial: same workspace + include.regional), inventoryReplenishment workspace, the DEFERRED Event Assist
authority redesign, request-order.js secondary surfaces, or Batch F (writer-reload + global-prime retirement). Do NOT
begin automatically.

### F1-7I-R1 delta (2026-08-13) — Inventory Replenishment scoped read DONE (LAST registered-only workspace → 0 remaining)
`inventoryReplenishment` is now a CANONICAL workspace (new backend `60_api_v1_inventory_replenishment_workspace.gs` +
router action `inventoryReplenishment.workspace.get`; kill switch `setWorkspaceEnabled('inventoryReplenishment', false)`) —
the registered stub is now IMPLEMENTED. **This was the LAST registered-only workspace: 0 registered-only remain.**
`inventory-replenishment.js`'s PRIMARY render (the main replenishment table assembled by `_getCloudReplenishmentData`)
sources its 19 tables from the scoped workspace via a single choke point (the assembly's local `get()` + `_replenActiveMarketplaces`
now consult the read-model) — no broad Operation DB for the primary render (mount + search fetch the workspace instead of
`loadOperationDb({force:true})`), scoped post-write refresh (`_irAfterWrite`), fail-closed (`INVENTORY_REPLENISHMENT_READ_FAILED`;
no silent legacy fallback), `KM.loadState` region. The workspace returns raw passthrough of the FULL tables (bounded by a
non-silent `capped` backstop; the page derives scope + assembles client-side, so server-side narrowing would risk drift).
db-api `adaptInventoryReplenishmentWorkspace` maps each table through the SAME normalizer + per-array filter as
`normalizeOperationDb`, **keyed by getter name**, so `get(name)` returns byte-identical arrays to the legacy getters
(proven 66/0). **§2 frozen quantity authorities preserved**; **Gap (inventoryReplenishmentGap.get), Recommendation
(recommendation.workspace.get), allocation-draft SSOT (getShippingAllocationDraftWorkspace) stay on their EXISTING separate
scoped owners** — the workspace does NOT duplicate them. **§18 FLOW-A guard PROVEN**: the page/workspace create NO Request
Order / Purchase Order / Order-Planning-Gap / AI Plan (Inventory Gap → Recommendation → Shipping Plan → Shipment); Submit
Plan → `createShippingPlansBatch` (Weekly Shipping Plan runtime). **§10 Add-SKU** initializes marketplace_skus + pricing_list
+ fc_regular_forecast, **never factory_stock** (boundary intact). **§8 Incoming-inventory — `INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED`
(scoped, DEFERRED):** the frontend `_irBuildShipmentRemainingByReceiver` reconstructs a canonical incoming fact
(MAX(0, shipment_qty − shipment_received_qty) + ETA bucketing + shipping-plan-lineage receiver attribution); NO backend
authority exposes the same fact (shipment.workspace.get deliberately leaves remaining/attribution presentation-side; the
code self-flags MERGED_SHIPMENT_FROZEN_SHARE_AUTHORITY_GAP / SHIPMENT_OVERDUE_BUCKET_AUTHORITY_GAP). Moving it to a new
canonical incoming owner = a receipt-semantics redesign → DEFERRED (not mixed into this transport cutover); the
reconstruction stays presentation-side over the scoped raw rows → BEFORE == AFTER (§20 allows a non-backend-owned incoming
formula + display math). **Apps Script sync + new /exec REQUIRED** (60_ + router; deploy backend before/with the canonical-ON
frontend, or hold with the kill switch). Frontend deploy: km-api-foundation.js + operation-system-db-api.js +
inventory-replenishment.js. Bundle/DB unchanged. Contract tests: all four "unimplemented/non-canonical example" tests
(foundation R3b/R6/F2/F3/L4, compat NS1/NS2/FF4, weekly CR2/OW1, recommendation-cutover A6) repointed to a synthetic
`customWs` since no registered-only workspace remains. Full regression: only the 4 known baseline failures. See
`F1_7I_INVENTORY_REPLENISHMENT_WORKSPACE_AND_CUTOVER_R1.md`.

**Workspace status:** IMPLEMENTED/canonical = weeklyShipping, recommendation, purchaseOrder, requestOrder, shipment,
fcSummary, skuDetails, **inventoryReplenishment**. **REGISTERED-only = NONE (0).** All 8 registered page workspaces are now
scoped-read canonical. **The primary-read API migration is COMPLETE for every registered page workspace** — but the full
system migration is NOT done: DEFERRED secondary surfaces remain (sku-regional-details.js; fc-summary.js builder + Event
Assist redesign; request-order.js secondary panels; inventory-replenishment.js expand-panel Monthly Achievement / Execution
Plan; the incoming-inventory authority redesign) and **Batch F** (retire the ~40-writer WRITE_FORCES_FULL_RELOAD + app.js
global prime). Do NOT begin automatically.

### F1-7J-R1 delta (2026-08-17) — FINAL remaining-migration MASTER AUDIT (AUDIT ONLY; no runtime change)
Baseline HEAD `c636c8a` (= origin/main). Whole-system audit after 8/8 registered page workspaces became canonical. Replaces
the approximate figures ("~40 writers", "≈6 broad-cache") with EXACT counts. Full map: `F1_7J_REMAINING_SECONDARY_SURFACES_AND_AUTHORITY_MASTER_AUDIT_R1.md`.
- **Workspaces:** 8/8 IMPLEMENTED + canonical; **REGISTERED-only = 0**. Primary render of every canonical workspace page
  requires NO broad DB. `getOperationDb(` JS accessor = **0 active** (1 dead defensive call at db-api.js:889).
- **Broad-cache canonical-active consumers = 60**: 6 PRIMARY (non-workspace pages: factory-stock, overseas-stock,
  overseas-ops-preview, campaign-risk, carrier-rate-card, sku-regional-details) + 5 SECONDARY lazy-load sites (fc-summary
  builders + RO expand) + 2 BACKGROUND (app.js prime, sku-details manual refresh) + 47 WRITE-REFRESH. Excluded: ~12
  kill-switch legacy fallbacks (gated OFF in canonical mode), 1 dead, console/debug helpers.
- **Secondary broad-cache surfaces = 14** (§2): 3 self-heal via lazy load; the rest read broad getters directly. Fixes:
  most reuse an EXISTING workspace/readModel (`_irWsGet`, `_polReadModel`, weeklyShipping sku_details, recommendation
  marketplaces, scoped allocation-draft SSOT); only carrier_lead_times (IR Execution-Plan ETA) needs a new bounded read.
- **Writer full-reload = EXACTLY 47** (§4), by domain: SKU 7, Settings 1, Tax 2, Forecast 8, Request Order 8, Purchase
  Order 5, Shipping Plan 5, Shipment 7, Inventory 3, Carrier 1. 8 are wired but have NO page caller; 39 live-callable. 44
  map to a canonical workspace (Batch-F-ready via scoped invalidation — consumer pages already re-read scoped post-write);
  the 3 Inventory + 1 Carrier writers are blocked until their non-workspace pages migrate.
- **app.js prime-dependent surfaces = 7** (§5): 1 PRIMARY (SKU Handbook — needs product_features + sku_handbook_summaries,
  a new bounded read) + 6 SECONDARY (S2 weekly line-logistics, S3 PO-list view modal, S4 RO scope resolver, S5 IR reference
  lookups, S6 IR carrier_lead_times [new read], S7 IR allocation-draft hydrate). 5 fixable by wiring to an existing
  workspace, 2 need a new bounded read, 0 need authority redesign. The 6 self-loading non-workspace pages don't fail
  without the prime but keep it useful → prime removal is gated on migrating both sets.
- **Frontend business authority debt = 3** (§3), NONE blocks Batch F (all persisted writes already scoped-reconcile):
  incoming-inventory reconstruction (`INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED`, read-side, deferred), site-planning
  18-day 3PL pool (`FRONTEND_PLANNING_AUTHORITY_REMAINS`, display, deferred), Event Assist persisted fc_qty
  (`EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED`, deferred).
- **Domain boundaries (§7): NO active violation** — IR = Gap→Recommendation→ShippingPlan→Shipment (not Request Order);
  Procurement = Gap→AI Plan→RO→PO; Shipment consumes existing PO lines via FIFO; shared factory ≠ company; raw ≠ allocated/adjusted.
- **Ordered remaining plan (§10):** F1-7J-A (secondary surfaces reusing existing workspaces) → F1-7J-A2 (small include
  extensions: SKU Handbook, carrier_lead_times) → F1-7J-A3 (remaining 6 non-workspace pages → scoped reads) → F1-7J-B
  (incoming-inventory authority) → F1-7J-C (Event Assist authority) → F1-7J-D (site-planning pool + residual cleanup) →
  F1-7K Batch F (retire 47 writer full-reloads) → F1-7L (remove app.js prime) → F1-7M (performance) → resume
  F1-PHASE1-LIVE-ACCEPTANCE-R2. No Apps Script sync / /exec / frontend deploy / DB change (audit only). Do NOT begin automatically.

### F1-7J-A-R1 delta (2026-08-17) — existing-workspace secondary wiring + SKU Regional primary cutover (3 done, 3 HALT)
PRE HEAD `2d35c7f`. TRANSPORT/WIRING only; BEFORE==AFTER; NO new API/workspace/formula/authority/schema/writer/app-prime
change. Full detail: `F1_7J_A_EXISTING_WORKSPACE_SECONDARY_AND_SKU_REGIONAL_CUTOVER_R1.md`.
- **DONE B** — PO detail modal `view()` (purchase-order-list.js) now read-model-first (`_polReadModel.orders/lines`, the
  same accessor as `renderRows`); zero broad fetch on open; `remaining_qty` stays backend-owned (no fallback promoted).
- **DONE D** — 7 IR reference/registry lookups (marketplaces ×6 + `_irctxWarehouses`) routed through the existing
  `_irWsGet` choke point (Workspace → `_irReadModel`; Legacy → getter). BEFORE==AFTER (same normalizers, F1-7I). The
  Execution-Plan warehouse read (`:3020`) + carrier reads stay for A2/A3.
- **DONE F** — **sku-regional-details.js WHOLE PAGE** cut over to the EXISTING `skuDetails` workspace with
  `include.regional` (59_ already returns marketplace_skus + sku_regional_details under include.regional; adapter already
  maps them). Mirrors F1-7H: read-model-first accessors, KM.loadState region, fail-closed (no silent broad fallback),
  scoped post-write `_srdAfterWrite`. Write path (upsertSkuRegionalDetail + marketplace_skus identity sync) UNCHANGED; NO
  Factory Stock init; NO company-from-factory; shared KM/ResUS/ResTW rows distinct. **NO new workspace/API** (reuses
  skuDetails). Legacy kill-switch retained.
- **HALT A** `F1_7J_A_UNEXPECTED_BACKEND_REQUIREMENT` — the weekly payload does NOT emit sku_details (40_
  `weeklyWorkspaceBuild_` reads only plans/lines/warehouses/carriers; sku_details is read-SCOPE only, not projected); the
  line-logistics live recompute needs carton dims → requires a 40_ projection (A2). **Corrects the F1-7J audit's imprecise
  "sku_details already in weeklyShipping payload".** shipping-plan.js unchanged.
- **HALT C** `REQUEST_ORDER_SCOPE_EXISTING_READ_MODEL_NOT_EQUIVALENT` — request-order.js (AI-plan page) has no on-page
  scoped read model carrying the full marketplace master (composer returns `{rows}`; recommendation marketplaces are lazy +
  scope-subset). Resolver unchanged.
- **HALT E** `IR_ALLOCATION_DRAFT_SSOT_NOT_BEFORE_EQUALS_AFTER` — §7 forbids the BEFORE==AFTER `_irWsGet` raw-table route
  and mandates the SSOT `getShippingAllocationDraftWorkspace`, but that SSOT is async + requires a complete
  planning_cycle scope + returns a different `{draft,lines}` shape → not equivalent to the sync country/marketplace hydrate.
  Impasse → product decision (J-B/J-D). Hydrate unchanged.
- **Debt Δ:** active broad-cache loaders 60→59; secondary broad surfaces 14→~10; **writer full-reloads 47→47 (untouched)**;
  app-prime-dependent surfaces 7→4 (S3 PO-view + S5 IR reference resolved; SKU-Regional primary-broad dependency removed);
  workspaces 8/8, registered-only 0 (no new workspace). Tests: new suite 45/0; full regression 230 files, only the 4 known
  baselines; bundle unchanged (aaf5b07). Deploy: frontend only (purchase-order-list.js, inventory-replenishment.js,
  sku-regional-details.js) + compat test repoint; NO Apps Script sync / /exec / DB / bundle. Do NOT begin A2 automatically.

### F1-7J-A2-R1 delta (2026-08-17) — bounded reference/include extensions: A, C, S6 all RESOLVED
PRE HEAD `6452ab1`. TRANSPORT/REFERENCE only; BEFORE==AFTER; ADDITIVE backend; NO new authority/formula/schema/writer/
app-prime change. Full detail: `F1_7J_A2_BOUNDED_REFERENCE_AND_INCLUDE_EXTENSIONS_R1.md`. Resolves the three F1-7J-A HALTs.
- **A DONE** — weekly line-logistics: `40_` now projects a BOUNDED `skuDetails` set (only the returned page's line SKUs;
  raw passthrough; gated with include.details; tablesRead 4→5). shipping-plan.js `_spSkuDetail` reads the projection
  (re-normalized via new `KM.DB.normalizeSkuDetail`) in Workspace mode; `_spLineLogistics` display math unchanged →
  BEFORE==AFTER. `F1_7J_A_UNEXPECTED_BACKEND_REQUIREMENT` cleared.
- **C DONE (REUSE, no new API)** — RO marketplace scope: new db-api `KM.DB.getMarketplaceReference()` REUSES the existing
  generic `getTable('marketplaces')` action (server `filterRows_` keeps marketplace_id||marketplace — same as the client
  filter) → equals `getMarketplaces()`. request-order.js loads it once at mount (before the composer) into
  `_roMarketplaceRef`; `_roActiveMarketplaces`/`_roScopeModalPrefill_` read `_roMarketplaceUniverse()` (fail-closed, no
  broad fallback). Full active universe preserved (BEFORE scope options == AFTER). `REQUEST_ORDER_SCOPE_EXISTING_READ_MODEL_
  NOT_EQUIVALENT` cleared.
- **S6+S8 DONE** — IR carrier planning: `60_` gains `carrier_lead_times` + `carrier_rate_cards` as INCLUDE-gated
  (`carrierPlanning`) tables (read + build loops skip them when not requested → base primary payload byte-identical). db-api
  adapter maps getCarrierLeadTimes/getCarrierRateCards. inventory-replenishment.js lazily fetches
  `include.carrierPlanning` ONCE when the Execution Plan renders (`_irLoadCarrierPlanning_` → `_irCarrierModel`), and
  `_irComputeRouteEta`/`_execRateCardMethods` read `_irCarrierGet` (fail-closed); `_execWarehouseCandidates` →
  `_irWsGet('getWarehouses')`. ETA + method logic unchanged (no server-side carrier selection) → BEFORE==AFTER.
- **HALT E untouched** (`_hydrateAllocationDraftFromDb` unchanged); Incoming Inventory / sitePlanningAllocation / Event
  Assist / RO expand / FC builders byte-identical.
- **Debt Δ:** broad-cache loaders 59→59 (routes broad-getter READS, not loader calls); secondary broad surfaces ~10→~6;
  **writer full-reloads 47→47 (untouched)**; app-prime-dependent surfaces 4→1 (only S1 SKU Handbook remains; S7
  allocation-draft = HALT E, IR Monthly-Achievement = dead-stub — out of scope). Tests: new suite 29/0 + 5 additive-contract
  repoints; full regression 231 files, only the 4 baselines; bundle unchanged (aaf5b07). **Deploy: Apps Script sync YES (40_,
  60_) + new /exec; frontend YES (operation-system-db-api.js, shipping-plan.js, request-order.js, inventory-replenishment.js);
  router NO; DB/bundle NO.** All additive/backward-compatible — deploy backend before the canonical frontend. **Batch F NOT
  ready** (A3 + deferred authority items remain). Do NOT begin A3 automatically.

### F1-7J-A3-R1 delta (2026-08-17) — remaining 6 non-workspace primary pages scoped (ACTIVE_PRIMARY broad = 0)
PRE HEAD `b08be3c`. TRANSPORT/READ-MODEL only; BEFORE==AFTER; **FRONTEND-ONLY** (reuses the existing `getTable` action —
NO .gs/router/exec). Full detail: `F1_7J_A3_REMAINING_NON_WORKSPACE_PRIMARY_SCOPED_READ_CUTOVER_R1.md`.
- **Enabler:** new frontend `KM.DB.loadScopedTables(names)` = per-table `getTable` fetch + the SAME `normalizeOperationDb`
  → a `_opDbCache`-shaped object with exactly those tables (byte-identical to the broad getters), other tables []. Never
  mutates the global cache; fail-closed (no silent broad fallback). Proven partial-normalize == full for the scoped tables.
- **6 pages cut over** (read-model-first accessor + bounded scoped mount load + `KM_SCOPED_PAGE_READS` kill switch + scoped
  `_xAfterWrite` on writers): **factory-stock** (factory_stock/movements/sku_details/warehouses; shared-factory NOT
  company-owned, no init change), **overseas-stock** (overseas snapshot/movements/warehouses/sku_details), **overseas-ops-preview**
  (warehouses/overseas_snapshot/shipments/shipment_lines; preview, no writes), **campaign-risk** (`_crDB()` shim;
  campaigns/campaign_sku_lines/marketplace_skus/sku_details/marketplaces; calc untouched), **carrier-rate-card**
  (carrier_rate_cards/carriers/carrier_lead_times; own bounded owner, NOT the IR carrierPlanning include),
  **sku-handbook** (sku_details/product_features/sku_handbook_summaries via the SAME buildSkuKnowledgeItems; fail-closed —
  renders with empty `_opDbCache`; the last legitimate app-prime read surface, resolved).
- **§11 Batch-F blocker reconciliation (source-grounded):** **0 of 4** deferred authority debts (Incoming Inventory,
  sitePlanningAllocation, Event Assist, allocation-draft hydrate) technically block Batch F — none couples a writer
  full-reload to a consumer for its fact with no scoped alternative. Only the **IR allocation-draft hydrate** blocks
  app.js-prime removal (bare broad getters; HALT E). **Corrects A2 §19:** those authority items are NOT Batch-F prerequisites.
- **Debt Δ:** ACTIVE_PRIMARY non-workspace broad surfaces **6→0** (§12 PASS target met); ACTIVE_PRIMARY loadOperationDb
  5→0 (→LEGACY_ONLY 8→13); ACTIVE_SECONDARY 2 (unchanged); BACKGROUND 2; **writer full-reload 47→47 (untouched)**;
  app-prime-dependent surfaces **2→1** (only IR allocation-draft hydrate). Tests: new suite 49/0 + 1 harness repoint; full
  regression 232 files, only the 4 baselines; bundle unchanged (aaf5b07). **Deploy: Apps Script sync NO, router NO, /exec
  NO, DB/bundle NO; frontend YES** (operation-system-db-api.js + the 6 pages). Kill switch `window.KM_SCOPED_PAGE_READS=false`.
- **Readiness:** Batch F (F1-7K) = READY to start (no authority blocker; it is the writer-invalidation work). app.js prime
  removal (F1-7L) = NOT ready — gated on the IR allocation-draft hydrate (HALT E) + the 2 secondary lazy reads + the broad
  load still used by the 13 Legacy branches + 47 writers. Do NOT begin Batch F / prime removal / authority redesign automatically.

## F1-7K-BATCH-F-WRITER-FULL-RELOAD-RETIREMENT-R1 (WRITE_FORCES_FULL_RELOAD: 47 → 0) — Batch F = **DONE**
PRE HEAD `655d3bc`. TRANSPORT/INVALIDATION only; no formula/authority/schema/response-shape/idempotency/transaction
change; **FRONTEND-ONLY** (operation-system-db-api.js + inventory-replenishment.js — NO .gs/router/exec/bundle/DB). Full
detail: `F1_7K_BATCH_F_WRITER_FULL_RELOAD_RETIREMENT_R1.md`.
- **PRE inventory confirmed EXACTLY 47** (43 direct + 4 via `_kmShippingPost_(…,reloadAfter=true)`); no drift. The
  `_kmWeeklyCommand_` writers already did NO reload (the target pattern); page callers already re-read scoped after write.
- **Mechanism (no new cache, no TTL):** ONE seam `_kmWriterPostWrite_()` replaces every writer reload; it reloads the
  whole DB ONLY when `_kmScopedPostureActive_()` is false (an auto-coupled read-only probe of `KM_WRITER_FULL_RELOAD` /
  `KM_SCOPED_PAGE_READS` / all 8 canonical `workspaceApiActive`). Default posture → does NOTHING → **47→0**; any read-side
  kill switch AUTO-re-arms the old reload (single-lever rollback stays fresh). Plus a bounded `_kmRefreshCacheTables_`
  (§13 targeted slice patch) for `upsertRequestOrderSiteConfirmations` (broad-cache primary surface in every mode), and a
  1-line IR CSV-import readback routed through the existing `_irAfterWrite` (matches the single-row Add path).
- **Error/idempotency:** the seam sits in each writer's SUCCESS branch only → a failed write never invalidates; token/lease/
  double-click guards untouched. **§14 secondary readers** (RO 2nd-layer expand, fc-summary modals) left in place —
  self-heal on open (documented, not redesigned). **app.js prime UNCHANGED** (F1-7L owns removal).
- **Debt Δ:** **writer full-reload 47→0**; whole-DB reload CALLS in db-api 45→2 (seam fallback + debug util); ACTIVE_PRIMARY
  broad 0 (unchanged); ACTIVE_SECONDARY 2; BACKGROUND 2; LEGACY_ONLY 13; app-prime-dependent 1 (HALT E, untouched). Tests:
  new suite 152/0 + 5 stale-contract assertion updates; full regression 233 files, only the 4 baselines; bundle unchanged
  (aaf5b07). **Deploy: Apps Script sync NO, router NO, /exec NO, DB/bundle NO; frontend YES** (operation-system-db-api.js +
  inventory-replenishment.js). Rollback: revert, or `window.KM_WRITER_FULL_RELOAD=true`.
- **Readiness:** Batch F = DONE. app.js prime removal (F1-7L) still NOT ready (HALT E + secondary lazy reads + 13 Legacy
  branches). Full API migration NOT done. Do NOT begin F1-7L / authority redesign automatically.

## F1-7L-APP-PRIME-DEPENDENCY-RETIREMENT-AND-GLOBAL-PRIME-REMOVAL-R1 (CANONICAL_STARTUP_WHOLE_DB_PRIME: 1 → 0) — **DONE**
PRE HEAD `132f302`. READ TRANSPORT / CACHE-DEPENDENCY retirement only; no authority/formula/schema/writer/idempotency
change; **FRONTEND-ONLY** (6 JS files — NO .gs/router/exec/bundle/DB). Full detail:
`F1_7L_APP_PRIME_DEPENDENCY_RETIREMENT_AND_GLOBAL_PRIME_REMOVAL_R1.md`.
- **Audit (no drift):** PRIMARY 0, SECONDARY 2 (RO 2nd-layer expand, FC Regular/Event modals), APP_PRIME_DEPENDENT 1
  (IR allocation-draft hydrate), WRITER 0. All 16 pages first-open SELF-SUFFICIENT; all 16 Legacy branches self-load.
- **HALT E RESOLVED (byte-identical):** the sync IR `_hydrateAllocationDraftFromDb` is fed by a BOUNDED scoped read of
  the SAME two canonical draft tables (`refreshCacheTables`) awaited before it — same tables/normalizer/selection/
  transform → byte-identical; the async, `planning_cycle`+company-scoped SSOT was rejected as it changes the selection
  contract. Draft authority untouched (deferred).
- **Secondary → bounded:** RO expand+Send+save use `_roEnsureL2Tables` (7 tables) + save re-reads then re-fetches the
  scoped composer (not the broad `_buildRequestOrderRowsFromDb`); FC modals use `_fcEnsureBroadCacheThen`→bounded
  `_FC_SECONDARY_TABLES` (7) + reset-on-write. Event Assist calc byte-identical (transport only). SKU-Details Refresh-DB
  → scoped `_skWorkspaceRefresh_` in canonical (legacy keeps whole-DB).
- **Prime removed:** app.js `DOMContentLoaded` makes NO `loadOperationDb` (localStorage warning preserved). `_opDbCache`
  is NOT canonical startup state — only an on-demand bounded scratch (doc §10). No delayed/background prime.
- **Debt Δ:** startup whole-DB prime **1→0**; ACTIVE_SECONDARY broad **2→0**; APP_PRIME_DEPENDENT **1→0**; writer 0;
  PRIMARY 0; BACKGROUND 2→1 (only the `reloadOperationDb` debug util); LEGACY_ONLY 16 (rollback preserved). Enabler:
  `KM.DB.refreshCacheTables` + 15-table `_KM_TABLE_CACHE_KEY_`. Tests: new suite 56/0 + 2 stale-contract updates; full
  regression 234 files, only the 4 baselines; bundle unchanged (aaf5b07). **Deploy: Apps Script sync NO, router NO,
  /exec NO, DB/bundle NO; frontend YES** (6 files). Rollback: revert, re-add the prime line, or a page kill switch.
- **STATUS — READ-SIDE API MIGRATION COMPLETE (canonical posture):** WRITE_FORCES_FULL_RELOAD 0 · ACTIVE_PRIMARY 0 ·
  ACTIVE_SECONDARY 0 · APP_PRIME_READ_DEPENDENCY 0 · CANONICAL_STARTUP_WHOLE_DB_PRIME 0. Remaining transport debt is
  Legacy-rollback-only (16 kill-switch self-loads + `reloadOperationDb` debug util — intentionally retained). Deferred
  product/authority rounds (NOT transport): Event Assist authority redesign, Incoming Inventory reconstruction,
  sitePlanningAllocation. Do NOT begin authority redesign or generic perf/UI optimization automatically.
