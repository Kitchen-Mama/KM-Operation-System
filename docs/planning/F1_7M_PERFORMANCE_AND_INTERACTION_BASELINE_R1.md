# F1-7M-PERFORMANCE-AND-INTERACTION-BASELINE-R1 — measure/audit baseline (NO code change)

**AUDIT / MEASUREMENT / DECISION ONLY.** No runtime/business/schema change. Establishes the post-migration performance
baseline (source + request-count grounded) and a bounded optimization roadmap. PRE HEAD `70a90df`. Evidence: 5 read-only
source audits (core pages · secondary/modals · write flows · Apps Script handlers · DOM/UX). **Every absolute
millisecond/payload figure is `LIVE_MEASUREMENT_REQUIRED`** — this baseline counts requests/round-trips and classifies
structure; it invents no timings.

## §0 Frozen business behavior (unchanged, and out of scope for F1-7M)
Forecast/Inventory formulas, Gap, Recommendation, AI Plan, Request Order, Purchase Order, Shipping Plan, Shipment, FIFO,
Factory Stock, Receipt, Final Output, Documents, Automation — all frozen. Authority-redesign items stay SEPARATE product
tasks (§13): `EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED`, `INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED`,
sitePlanningAllocation cleanup. Performance work must preserve: same API facts, same business outputs, same error
semantics, same idempotency, same write authority.

## §2 Page first-open matrix (canonical posture; each `getWorkspace` = 1 POST that bundles the page's reference tables)
| Page | First-open blocking reqs | Scoped action(s) | Extra ref call? | Loading region | Notes |
|---|---|---|---|---|---|
| Inventory Replenishment | 1 (+1 post-render gap-status, conditional) | inventoryReplenishment.workspace.get (19 tables) | No | KM.loadState | heaviest read-model |
| **Request Order / AI Plan** | **2** | getTable('marketplaces') **+** aiPlanFirstLayer.get | **YES (separate)** | KM.loadState | **serial + independent → parallelizable (request-order.js:469)** |
| Request Order Draft | 1 | requestOrder.workspace.get (size 2000) | No | KM.loadState | — |
| Purchase Order (list, overview) | 1 each | purchaseOrder.workspace.get (size 2000) | No | KM.loadState | cross-page dup (list↔overview, no shared cache) |
| Weekly Shipping Plan | 1 | weeklyShipping.workspace.get (size 100) | No | KM.loadState | — |
| Shipment Overview | 1 | shipment.workspace.get (size 3000) | No | KM.loadState | cross-page dup w/ On-the-Way |
| On-the-Way | 1 | shipment.workspace.get +routes/events/locations/templates (size 3000) | No | **custom (not KM.loadState)** | heaviest include set |
| FC Summary | 1 | fcSummary.workspace.get | No | KM.loadState | — |
| SKU Details | 1 | skuDetails.workspace.get (BASE) | No | KM.loadState | — |
| Factory Stock | 1 wave / 4 parallel GET | loadScopedTables(factory_stock,movements,sku_details,warehouses) | bundled | **none (blank-until-data)** | session-guarded |
| Overseas Stock | 1 wave / 4 parallel GET | loadScopedTables(overseas snapshot,movements,warehouses,sku_details) | bundled | **none** | session-guarded |
| Carrier Rate Card | 1 wave / 3 parallel GET | loadScopedTables(carrier_rate_cards,carriers,carrier_lead_times) | bundled | **none** | eager despite search-gated; **no `_tried` guard** (re-fetches after a failed read) |
| SKU Handbook | 1 wave / 3 parallel GET | loadScopedTables(sku_details,product_features,summaries) | bundled | **none** | fail-closed empty on error |
| SKU Regional Details | 1 | skuDetails.workspace.get{regional} | No | KM.loadState (best UX: skeleton+retry) | **no once-guard → refetches every open** |

**Finding:** startup whole-DB prime = 0 (F1-7L holds); 12/14 pages are a clean single scoped read/wave. Only RO/AI-Plan
issues 2 (serial, parallelizable). No page depends on another page having loaded first.

## §3 Write-interaction matrix (POST_WRITE_ROUND_TRIPS = write POSTs + readback calls; canonical posture)
| Flow | Round trips | Readback scope | Dominant latency owner |
|---|---|---|---|
| IR Add/Edit SKU | 2 | **full IR workspace** (19 tables) for 1 sku change | SCOPED_READBACK (heaviest) |
| Factory adjust/import | **5** (1 + 4 parallel) | 4 tables — **sku_details/warehouses static, re-read anyway** | SCOPED_READBACK over-fetch |
| Overseas adjust/import | **5** (1 + 4 parallel) | same static-table over-fetch | SCOPED_READBACK over-fetch |
| FC save regular / Target% / CSV | 2 each | full fcSummary workspace (3 tables) for 1-table change | SCOPED_READBACK |
| **FC save special event** | **2 + N + 1** (serial per-SKU loop) | fcSummary workspace | **MULTIPLE_SERIAL_REQUESTS** |
| RO chosen-qty inline | 2 (token→write; +1 on conflict) | none on success (optimistic) | SERIAL (token fetch) |
| **RO Target%/FC edit** | **~9 in 3 serial waves** (1–3 write + 7 parallel + 1 composer) | **7 tables + composer for 1-table change** | **SERIAL + over-fetch (strongest interactive)** |
| **RO Send Request** | **≈13 serial** (per-draft 2–3 incl. hidden token + per-series + submit + readback) | getActiveRequestOrderDrafts | **MULTIPLE_SERIAL_REQUESTS** |
| RO Draft save/transition/submit | 2 (submit 3) | full requestOrder workspace (size 2000) | SCOPED_READBACK |
| PO header/status/receive | 2 each | full purchaseOrder workspace (size 2000) | SCOPED_READBACK |
| Weekly save/submit/approve/cancel/done | 2 (submit 3) | weeklyShipping page (size 100, +includes) | SCOPED_READBACK (ack decoupled) |
| Shipment save/ready/ship/done/advance | 2 each | **full shipment workspace (size 3000, +all map includes on map)** | SCOPED_READBACK (heaviest) |
| **Confirm & Dispatch** | **4 fully serial** (updateShipment→genAlloc→confirmDispatch→readback) | shipment workspace | **MULTIPLE_SERIAL_REQUESTS (transactional)** |
| Receipt / ETA / route-advance (map) | 2 each | **full shipment workspace + all map includes** for 1-shipment change | SCOPED_READBACK over-fetch |

## §4 Duplicate / serial request findings (evidence-cited)
- **RO/AI-Plan first-open serial chain** — `request-order.js:469` `_roLoadMarketplaceRef_().then(_opLoadFirstLayerComposer_)`; independent (marketplace ref does not feed the composer) → `Promise.all`-parallelizable. **SAFE_TO_PARALLELIZE: YES · freshness risk: none.**
- **RO Send hidden token fetch** — `operation-system-db-api.js:upsertRequestOrderAllocationDraftLines:3364` issues `getRecommendationDraftToken` serially before its write when `expectedToken` is omitted; the manual Send path (`request-order.js:3142`) always omits it though the grid already holds a token via `_roEnsureDraftToken_`. **Passing the held token eliminates one serial hop per manual draft. Freshness risk: none (same optimistic-lock token).**
- **RO Target%/FC double serial readback** — `request-order.js:_roReloadAndRerender:2568` runs `refreshCacheTables(7 tables)` THEN chained `getAiPlanFirstLayer` (composer). The 7-table wave re-fetches factory/warehouse/PO tables irrelevant to an FC/Target edit. **SAFE_TO_PARALLELIZE/NARROW: YES.**
- **FC save special event serial per-SKU loop** — `fc-summary.js:saveFcEvent~3182` `for … await upsertFcSpecialEvent` per line. Candidate for a batch endpoint or `Promise.all` (idempotent per-line writes). **Freshness risk: none (per-line idempotent).**
- **Confirm & Dispatch 4-serial chain** — `shipping-history.js:_shRunConfirm:1499`. **NOT safely parallelizable — these are ordered transaction steps** (save → allocate → dispatch → readback). Only the final readback is a bounded-narrowing candidate.
- **Cross-page duplicate reads (no shared cache)** — PO list↔overview (`purchaseOrder.workspace.get`), Shipment Overview↔On-the-Way (`shipment.workspace.get`, separate `_shReadModel`/`_glmReadModel`), and `sku_details` fetched independently by 4 pages. **SAFE_TO_CACHE_SESSION: reference/master only (§10); business facts NO.**

## §5 Scoped readback over-fetch (bounded-readback candidates, strongest first)
1. **Shipment** (`_shRefresh_:744`, `global-logistics-map ensureDb:133`) — full size-3000 workspace + all map includes per single-shipment write; `afterShipmentWrite(shipmentId)` already knows the one id. **READBACK_TOO_BROAD.**
2. **RO Target%/FC** (`_roReloadAndRerender:2568`) — 7 tables + composer for a 1-table change. **OVERFETCH + double wave.**
3. **IR** (`_irWorkspaceRefresh_:3698`) — full 19-table workspace per single marketplace_sku upsert.
4. **PO / RO Draft** — full workspace (size 2000) per single-order mutation.
5. **Factory / Overseas** (`_fsAfterWrite:24`, `_osAfterWrite:35`) — re-read `sku_details`+`warehouses` though only snapshot/movements change. **ALWAYS_INCLUDED_SECONDARY_DATA.**
6. **IR lazy carrier read** — `inventory-replenishment.js:3659` re-requests the full `inventoryReplenishment.workspace.get` (19 tables again) just to add 2 carrier tables. **DETAIL_SHOULD_BE_LAZY / carrier-only include.**

## §6 Apps Script backend read-cost map (severity · improvement)
- **43_ gap materialization batch (+46_ job) — HIGH · REDUCE_TABLE_READ.** `gapProcessScopeSlice_:301` / `gapOpHarvestReceivers_:600` call the reco workspace per scope, each re-reading all **19 canonical snapshots** (scope-independent whole-table reads) → ~19×K reads for K scopes (documented ~14m Inventory / ~13.5m OP). `buildProductionRecommendationSource` already accepts `preReadSnapshots`; `handleRecommendationWorkspaceGet_:816` (the batch entry) does not. **This is the largest ABSOLUTE backend cost — but a manual/scheduled batch ("Recalculate All Sites"), not a per-page read.**
- **42_ recommendation workspace — MEDIUM · INDEX_IN_MEMORY/REUSE_MAP.** `recoWsToRowObjects_:378` re-materializes constant-across-SKU snapshots inside the per-SKU loop (O(N_skus × M_tables)).
- **60_ IR workspace — MEDIUM · LAZY_INCLUDE.** Largest per-page read (17 full tables raw passthrough, cap 80000/table). Genuine lazy candidates: `shipping_allocation_drafts` + `shipping_allocation_draft_lines` (only when a row has a draft) and the `shipping_plans`/`shipping_plan_lines` lineage pair. Server-side scope reduction deferred by design (drift risk).
- **56_ AI-plan composer — LOW-MED · REUSE_MAP (future).** 11 full tables + per-row event/overseas scan.
- **58_ FC summary workspace — LOW-MED · PAGINATE (future).** Full FC passthrough (cap 50000).
- **All other read handlers (40/50/51/52/53/54/55/57/59, gap READ owners) — LOW · NO_ACTION.** Each opens the spreadsheet once, reads each table once, uses prebuilt maps (no nested O(N*M)), and paginates/bounds output. Include-gating correct on 57/59/60.

## §7 DOM / render findings (row/cell-patch pattern already EXISTS in-codebase — no framework needed)
- **IR `renderReplenishment:1650`** — whole table, **ALL rows, no pagination**; a one-row write rebuilds the whole grid. Patch-pattern exists (`_irRecoUpdateSuggestedCells:5915`, `_irRecoPatchSummaryCells:5891`). Risk: High (canonical grid).
- **shipping-plan `_spRenderDbSection` (×5)** — all 5 status sections rebuilt on **every** command, incl. a single-plan save. Cell-patch exists (`spDbOnQtyInput:1020`).
- **On-the-Way `render:305` + `updateGlobeLayers:530`** — full body rebuild + **full marker/arc recompute on every keystroke** (`renderKeepFocus:1013` from `oninput:978`). Debounce candidate.
- **sku-details `renderSkuLifecycleTable` (×4)** — no pagination; filter universe rebuilt every render.
- **shipping-history `renderHistoryResults:547`** — whole list, no pagination.
- **Good grain (keep):** request-order (page slice 25 + delegation), fc-summary (paginated + cell-level `updateFcMonth:736`).
- **No listener accumulation** anywhere (guarded/delegated/`.onX=` property assignment). **No duplicate read-model rebuild** within a single render.
- **Scaling risk (LIVE_MEASUREMENT_REQUIRED):** the 3 unpaginated all-row surfaces (IR grid, sku-details, shipment list) at production row counts.

## §8 Button-feedback / perceived-latency findings
- **Best-in-class (reuse as the template):** `request-order.js:_roBindEditModal:2596` and `shipping-history.js:_shRunConfirm:1499` — disable-on-click + saving label + double-click blocked + restore-on-failure + success only after readback + modal-scoped.
- **Gap — guard but no visual:** `shipping-plan.js:_spRunCommand_:1125` — has `_spInFlight` re-entry guard but never disables the button or shows a label (feels dead). Buttons don't receive the element to toggle.
- **Weakest — no guard, no visual:** `purchase-order-overview.js` `confirmReceive:542`/`confirmEdit:606`/`sendPo:643`/`cancel:656` — no disable, no in-flight flag; double-click fires two writes (backend idempotent, UI silent).
- **Blocking modals:** `alert()`/`confirm()`/`prompt()` success/confirm paths in fc-summary (`saveFcChanges:849`), shipping-plan, PO overview — the inline `role="status"` pattern already used elsewhere reads faster.
- **ACTUAL vs PERCEIVED:** actual = readback round-trips + full-rebuild cost + GLM per-keystroke recompute; perceived = shipping-plan + PO-overview silent buttons.

## §9 Modal / secondary lazy-load (already near-optimal)
All 6 audited surfaces are bounded + lazy + guarded: FC modals (`_fcEnsureBroadCacheThen`, 7-table once-guard `_fcSecondaryLoaded`, reset on write), RO L2 expand (`_roEnsureL2Tables`, 7-table once-guard `_roL2Ready`, force on write), IR carrier (bundled once-guard `_irCarrierModel`), PO detail modal + Weekly line-logistics (bundled at page load, **0-request expand**), Shipment docs (backend-fresh + idempotent + client result cache). **No surface refetches identical reference per open.** Static `<select>` DOM is rebuilt per open (DOM-only, cheap). Minor: SKU Regional (no once-guard → refetch every open), Carrier Rate Card (no `_tried` guard; eager despite search-gated).

## §10 Cache policy proposal (do NOT recreate a global DB cache)
| Class | Tables | Policy |
|---|---|---|
| REFERENCE_IMMUTABLE_SESSION (safe cross-page cache candidate) | marketplaces, warehouses, carriers, SKU category/series universe | change rarely; a lightweight **per-reference** session cache (NOT a global `_opDbCache`) could remove cross-page dup reads. Invalidate on the (rare) reference write. |
| NO_CACHE / ALWAYS_REFRESH_AFTER_WRITE (never cache) | inventory, forecast, gap, recommendation, PO status, shipment quantities, allocation drafts | business facts — always read fresh / scoped readback after write |
**Constraint:** any reference cache must be opt-in per table, invalidate on that table's write, and never hold a business fact. This is a P2 (evidence supports it via the cross-page dup finding, but the win is modest and must not resurrect global-cache coupling).

## §11 Live measurement contract (USER, DevTools — top 5 slowest candidate flows)
Every timing below is `LIVE_MEASUREMENT_REQUIRED`. Capture DevTools Network (per-request duration incl. Apps Script
`serverDurationMs` already in every envelope `meta`) + Performance (render):
1. **Confirm & Dispatch** (`_shRunConfirm`) — 4 serial Apps Script executions; measure each stage + total click-to-ready.
2. **RO Target%/FC save** — the 3-wave readback (write → 7-table refresh → composer); measure each wave.
3. **RO Send Request** — the ~13 serial round-trips for a multi-draft/multi-series send.
4. **Inventory Replenishment first-open + Search** — the 19-table workspace read payload/serialization + `renderReplenishment` all-row render at production row counts.
5. **On-the-Way** — per-keystroke `render()` + globe layer recompute cost; and first-open size-3000 + map-includes payload.
Also record: startup whole-DB requests (expect 0), requests-per-first-open, requests-per-Save/Submit, post-write readback count, full-list rerender count, time-to-loading-feedback, time-to-ready.

## §12 Priority (derived from evidence: frequency × wait × gain ÷ risk)
**P0 (high freq · high wait · low risk · high gain)**
- **Bounded post-write readback** for the 3 heaviest surfaces: Shipment (readback the single written shipment, not size-3000+all-map-includes), RO Target%/FC (re-read only the changed FC table + skip the composer double-wave), IR (single-sku slice). §5 #1–3.
- **RO/AI-Plan first-open serial→parallel** (`Promise.all`). §4.
- **RO Send hidden token fetch removal** (pass the held token). §4.

**P1 (clear win, slightly more surface)**
- Factory/Overseas: drop static `sku_details`/`warehouses` from the post-write re-read (mount-only). §5 #5.
- IR carrier lazy read: return **only** carrier tables (60_ carrier-only include or a bounded read), not the full 19 again. §5 #6.
- PO / RO Draft bounded post-write readback. §5 #4.
- shipping-plan section-scoped render + button feedback; On-the-Way keystroke debounce; PO-overview double-click guard. §7/§8.
- FC special-event per-SKU loop → batch/parallel. §4.

**P2**
- Reference session cache (cross-page dup). §10.
- Pagination for the 3 unpaginated all-row grids (pending live row-count evidence). §7.
- Loading-state regions for Factory/Overseas/Carrier/SKU-Handbook + On-the-Way. §2/§11.
- Blocking `alert/confirm` → inline status. §8.
- SKU Regional once-guard; Carrier `_tried` guard. §9.

**P3**
- 42_ recommendation per-SKU re-normalization (REUSE_MAP) — MEDIUM but bounded; needs live proof. §6.
- 56_ composer / 58_ FC-summary pagination — future. §6.

**Separate (largest ABSOLUTE cost, but batch + higher risk + touches recommendation source seam → own careful slice, NOT a quick interactive win):** 43_ gap batch per-scope 19-table re-read (REDUCE_TABLE_READ via the existing `preReadSnapshots` seam). Must NOT change recommendation/gap OUTPUTS. §6.

## §14 Proposed implementation batches (each preserves API facts / outputs / error semantics / idempotency / write authority)
- **F1-7M-A — P0 duplicate/serial elimination:** RO/AI-Plan parallelize first-open; RO Send pass the held token (remove hidden `getRecommendationDraftToken` hop); FC special-event write fan-out → batch/parallel. (Lowest-risk request-count wins.)
- **F1-7M-B — post-write scoped readback optimization:** bounded readbacks for Shipment (single-shipment), RO Target%/FC (single changed table, no composer double-wave), IR (single-sku), PO/RO-Draft, Factory/Overseas (drop static tables). Biggest interactive win.
- **F1-7M-C — lazy include / reference optimization:** IR carrier-only include (60_ + frontend); 60_ LAZY_INCLUDE for allocation-draft + shipping-plan-lineage; reference session cache; SKU Regional once-guard; Carrier `_tried` guard.
- **F1-7M-D — DOM/render + interaction feedback:** section-scoped render (shipping-plan), row-patch (IR grid / sku-details), On-the-Way keystroke debounce, pagination where live evidence warrants, button feedback (shipping-plan + PO-overview), inline status vs blocking alert, loading regions for the 4–5 pages missing them.
- **F1-7M-E — backend read-cost + final regression:** 43_ gap batch `preReadSnapshots` (largest absolute, batch — measure first), 42_/56_ REUSE_MAP; final performance regression + UX polish + success-metric re-measure.

## §15 Success metrics (request-count based; NO fake ms until baseline measured)
Invariant (must stay): startup whole-DB requests = **0** · writer full reload = **0** · active-primary/secondary broad = **0**
· app-prime dependency = **0**. Baseline → target (later batches): first-open serial waves per page (RO 2→1); post-write
round-trips (Shipment 2-with-full-readback → 2-with-bounded; RO Target%/FC ~9/3-waves → ≤3/2-waves; RO Send ~13-serial →
fewer/batched; Factory/Overseas 5→3); post-write readback table count (bounded to changed tables); full-list rerender
count (section/row-scoped); time-to-loading-feedback (add regions to the 5 pages lacking them). All wall-clock targets set
only AFTER the §11 live capture.

## Delivery
- **Files changed:** this doc + `API_MIGRATION_MASTER_PLAN.md` delta. **Runtime code: NONE. Apps Script sync: NO. Router:
  NO. New /exec: NO. Frontend deploy: NO. Bundle: NO. DB/schema: NONE.**
- **Tests:** none added (claims are request-count/structural, evidenced by the 5 source audits; no source behavior changed).
- **Guards:** business authority/formulas/API contract/writer-reload(0)/app-prime(0)/broad-canonical(0) all UNCHANGED.
- **HALT/risk tokens:** none. Authority-redesign items remain separate (§13).

**STOP after F1-7M baseline. Do NOT begin F1-7M-A automatically.**
