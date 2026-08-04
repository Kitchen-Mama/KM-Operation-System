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
- **API-2 — First Read-Only Vertical Slice.** Implement one `get…Workspace` read (flip a Registry entry `status → IMPLEMENTED`) + its page cutover behind the flag. **Recommended first slice: `getWeeklyShippingPlanWorkspace`** (see §7).
- **API-3 — First Draft Write Vertical Slice.** Wrap that slice's writes (status/qty/note) with the frozen envelope + targeted invalidation (the Cache seam, currently TTL=0).
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
