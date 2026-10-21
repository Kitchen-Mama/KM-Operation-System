# DC1-R1 — Main-Line Data Coherence and Gap: Audit, and the First Repaired Batch

**Status:** audit complete; first batch REPAIRED (frontend only). **Not pushed, not synced, not deployed.**
No `.gs` byte changed (GS 4,666,841 / 4,668,000). No Script Property, schema, schedule or persisted cache was
touched. No production recalculation, Save, Submit or write was made.

Premises taken from the Owner's latest response: Production is R55, action contract 21, required list 18,
required actions 50, `mixed_deployment=false`. FX: `fxRateBook.get` succeeds with `doc_version=0`, `rates=[]`,
`authority_reason=FX_AUTHORITY_NOT_CONFIGURED` — FX is NOT enabled and caller identifiability is not yet known.

---

## 1. Source → calculation → store → read → invalidation (existing owners, no redesign)

| Stage | Computed by | Stored in | Date it is "as of" | Read by (frontend) | What makes it stale / what refreshes it |
|---|---|---|---|---|---|
| Inventory, sales, FC, events, target rules, campaigns, overseas & factory stock, shipments, plans, PO lines, request-order line sources | import jobs (Amazon import daily 12:30, `45_`), page writers, shipment receipt (`31_`) | the canonical sheets (`KMPS CANONICAL_TABLES`, 21 tables) | each row's own `snapshot_date` | `inventoryReplenishment.workspace.get` (`60_`, 13 first-layer tables) → `_irReadModel` | **before DC1-R1:** only a first Search, a restored-mount revalidation, or `_irAfterWrite` (Add/Edit SKU, Import, AI Plan). **now:** also any Search after a planning write in this tab, or on a new Taipei day |
| Warehouse allocation config | `50_` | Script Property `KM_WAREHOUSE_ALLOCATION_CONFIG` | — | injected into every planning read (`42_`) | next calculation |
| **Avg Sales / Days of Supply** (canonical §22 rate) | `42_ recoWsResolveSalesRate_` → `KMCALC.normalizedAvgSalesPerDay({calcDate})` | not stored; travels as `line.horizonBasis` | **`RECOMMENDATION_CALCULATION_DATE` Script Property** (no clock fallback) | `loadRecommendationWorkspace_` → `_irRecoState` + sessionStorage cache → `_irCanonicalSalesBasis_` | **before:** nothing (`invalidateRecommendationSessionCache` had no caller; revision stored, never compared). **now:** the source-write epoch + Taipei day (§3) |
| Inventory Gap D18/D30/D45/D90 | `43_ gapProcessScopeSlice_` (runs the `42_` handler with an injected context) | `inventory_replenishment_gap` | **`calculation_date` = the job's Asia/Taipei execution date** (`43_ gapCalcContextForJob_`; the Property is ignored on this path) | `loadInventoryGap_` → `_irMatState` / `_irMatByScope` | daily 13:30 job, manual job, Retry; `_irMatInvalidateForRecalc_` (CURRENT_SCOPE / CURRENT_COUNTRY / ALL) |
| Order Planning Gap T1–T4 | `43_ gapProcessOrderPlanningScopeSlice_` (+ cross-company factory contention pre-pass) | `order_planning_gap` | `calculation_month` of the **previous** Taipei day (03:30 run) | `request-order.js` | daily 03:30 job, manual job |
| Recommendation (Inventory AI Plan / Weekly AI Plan) | client `KMREC` over materialised rows; `47_`, `61_` | `shipping_allocation_drafts` / `_lines` (`system_generated`) | lineage `source_data_as_of` = the gap job's date | `_irRunInventoryAiPlanGeneration_` → `_irAfterWrite` | manual; weekly schedule disabled by default |
| Execution allocation (manual) | operator, autosaved (400 ms debounce) via `upsertShippingAllocationDraftAtomic` | allocation draft tables | — | exposure map `_irExposureByScope` → `_hydrateAllocationDraftFromDb` | **before:** manual Refresh, `_irAfterWrite`. **now:** also Search / restored mount after an exposure write — **never while a manual plan is unsaved** (§3.4) |
| Submit → Shipping Plan → Shipment → receipt | `11_`, `12_`, `22_`, `31_`, `32_` | `shipping_plans`, `shipments`, receipt → `overseas_inventory_snapshot` | — | exposure map; first layer | the next gap job run; on this page now the write epoch |
| Request Order → PO | `66_` send saga, `13_` | `request_orders`, `request_order_line_sources`, POs | — | request-order / PO pages | — |

## 2. Findings

### 2.1 Avg Sales uses 2026-08-19, Gap uses an October date — two authorities, both legitimate, never stated
- **Avg Sales / Days of Supply** are read live from `recommendation.workspace.get`. Its window is anchored on the
  `RECOMMENDATION_CALCULATION_DATE` Script Property (`42_ recoWsResolveCalcDate_`, "no clock fallback"). The literal
  `2026-08-19` occurs in no `.gs`/`.js` code, so it is the live Property value. Nothing advances it.
  **Business meaning:** the rate is "up to 30 normal sales days in the 90 completed days before 2026-08-19".
- **Gap and Suggested Qty** are materialised rows whose `calculation_date` is the gap job's own Asia/Taipei run date
  (INVENTORY: same day; ORDER_PLANNING: previous day). `43_` injects that context and **ignores the Property**
  (`gapMaterializationDefaultIo_`, "the Script Properties remain the debug/override authority").
- **Consequence:** Gap/Suggested Qty are computed with the run-rate of the job's own window, while the Avg Sales and
  Days of Supply printed beside them come from a different, older window. The numbers do not have to agree, and the
  difference is real — but the screen gave no way to tell.
- **Not changed:** the Property, either date, either formula. **Repaired (traceability only):** the Avg Sales tooltip
  now names its anchor date and, only when it differs, the gap's date (§3.5).
- **Owner decision needed:** whether the live read's anchor should keep being a manually maintained Property
  (then it needs a maintenance step), or follow the gap job's date when the Property is absent (backend change; §4).

### 2.2 A source write never reached the answers Site Inventory holds (REPAIRED)
- Recommendation answer: `invalidateRecommendationSessionCache` had **no caller**; the cache stored a five-field
  revision and **compared it with nothing**; a settled in-memory answer was `ALREADY_SETTLED` forever. Leaving the page,
  importing a forecast / adjusting stock / confirming a shipment elsewhere, and returning: Current Inventory was
  re-read quietly, **Avg Sales and Days of Supply were restored with zero requests from before the write** — Days of
  Supply dividing fresh stock by a stale rate.
- First-layer read model: a Search with a loaded model read nothing, whatever had been written since.
- Exposure map: its own comment calls manual Refresh the only path "until a canonical write signal exists".

### 2.3 Site switch, page leave/return, late responses
- Late responses: the existing guards hold (`_irRecoSeq` + AbortController + `_irResultMatchesAppliedScope_`;
  `_irMatSeq` + `_irMatInFlight`; exposure `_irExposureByScope[key] !== entry`). Re-verified as controls (B11).
- Leave/return: CP2X-R4 keeps a settled answer; DC1-R1 now requires it to still be current (§3.2).

### 2.4 Shared stock pools
- Inventory Gap treats each scope independently; Order Planning pools factory stock per company (with a cross-company
  pre-pass) and overseas per company+country. Only a job run reconciles them.
- On the page, the 3PL "Site Planning Available" and the factory CN/TW split are recomputed per render from the
  scope-independent read model — so a write for one site affects every site's view, and **the write epoch is global
  across sites on purpose** (B3).

### 2.5 Summary vs Gap vs Suggested Qty
- Suggested Qty cell = stored `d90_suggested_qty`; Recommendation Summary = the four stored windows. Same source.
- Suggested is the carton ceiling of the gap, rounded per destination before summing (`43_`) — a gap of 95 with
  cartons of 24 is a Suggested Qty of 96, by design.
- Avg Sales / Days of Supply are a different read with a different date (§2.1). "On the Way" on the collapsed row
  is a literal 0 (spec §9 pending mapping). Inventory Gap opening stock = Site + ETA incoming only; Order Planning
  adds allocated overseas and factory stock. Each difference has a named cause; none was smoothed over.

### 2.6 System updates vs manual allocation
- Gap jobs write only the two gap tables. Weekly AI Plan is suppressed by an active manual draft
  (`SUPPRESSED_BY_ACTIVE_MANUAL_DRAFT`). Request-order scheduled refresh skips `user_edited` tiers; manual regenerate
  over edits needs explicit confirmation.
- On this page, the one path that can replace a manual plan is the exposure re-read → `_hydrateAllocationDraftFromDb`,
  which adopts the persisted drafts and clears the unsaved marks. DC1-R1's new re-reads are therefore **forbidden while
  any manual route is unpersisted** (§3.4).

## 3. The repaired batch (frontend only)

### 3.1 The source-write epoch (`operation-system-db-api.js`)
- Two per-tab counters in sessionStorage (`km_source_write_epoch.v1`): **planning** (anything `42_`/`60_` reads) and
  **exposure** (the six exposure tables). `KM.DB.sourceWriteEpoch()` reads them.
- Every write-capable KM.DB function is declared in ONE list with its families, or with a reason it has none
  (`_KM_SOURCE_WRITE_FAMILIES_`, `_KM_SOURCE_WRITE_EXEMPT_REASON_`), and wrapped in one place.
- **Bumped at dispatch and again at settle, whatever the outcome** — success, server failure, partial write,
  lost answer. Proving a zero write stays `zeroWriteProven`'s job; an unnecessary bump costs one re-read.
- The test scans the file for write-capable functions (93) and fails on any unclassified one.

### 3.0 Evidence
- `dc1-r1-source-write-epoch-and-reader-invalidation.test.js`: **52 failing against the pre-fix sources with all
  8 controls green** (`docs/evidence/dc1-r1-source-write-epoch/before-fix.txt`), **78/78 after**, 5 mutants caught
  (cache without verdict, dedupe trusting any settled answer, Search reusing any model, exposure retired over an
  unsaved plan, epoch moved only at settle).
- Cases: unchanged (controls), related source updated, unrelated source updated, cross-day and cross-month
  (Taipei midnight into November), duplicate notification, partial failure and lost answer, concurrent read,
  unknown version (no stamp) and unavailable signal, cross-site shared pool, late wrong-site answer (control),
  and the manual plan kept under each of its five unsaved states.
- The real writers run on the real db-api; the recommendation answer runs in the shipped IRRECO region; Search
  and the exposure loader are the shipped functions. In a real browser (cp2x-r4 revisit capture) a leave/return
  with nothing written still issues no recommendation request.

### 3.2 Recommendation answer (Avg Sales, Days of Supply)
- Stamped with the epoch + Asia/Taipei day **at issue**. Cache lookup: no stamp → `SOURCE_EPOCH_UNKNOWN`; a write
  since → `SOURCE_WRITTEN_SINCE`; a new Taipei day → `SOURCE_CYCLE_CHANGED`; no signal → `SOURCE_EPOCH_UNAVAILABLE`.
  None of them is served.
- The same-scope dedupe and the restored-mount `ALREADY_SETTLED` both require SAME.
- An answer whose read crossed a write is shown (it is the newest the page has) but stored under its issue stamp, so
  the next lookup re-reads.

### 3.3 First-layer read model
- Search reuses the loaded model only while it is SAME for `planning`; otherwise the Search performs the fresh read
  its own comment always promised. `_irSearch.lastModelReuse` records which.

### 3.4 Exposure map — and the manual plan
- Entries are stamped at issue. At an operator Search and at a restored mount, an entry that is not SAME for
  `exposure` is retired so the next expand reads it as a first visit does.
- **Kept, and recorded as `KEPT_FOR_LOCAL_PLAN`, while any route has a debounced write not yet sent, a write in
  flight, an edit that landed during a write, a pending line cancel, or a failed save.**

### 3.5 Avg Sales tooltip
- `_irAvgSalesWindowNote_`: "Avg Sales/day: up to 30 normal sales days in the 90 completed days before <anchor> (the
  recommendation calculation date)." plus, only when different, "Gap and Suggested Qty are calculated as of <date> -
  a different date, set by the gap calculation run." No anchor reported → no note. Values untouched.

## 4. Not covered by this batch — needs a backend change (plan only, NOT applied)

**Cross-tab writes, other users' writes, and the server's scheduled imports** are invisible to a per-tab signal. The
day boundary bounds the blind spot to the same Taipei day; it does not close it.

**Minimal plan — a server source revision:**
1. `01_router.gs doPost`: after a successful write in the planning/exposure families, set Script Property
   `KM_SOURCE_REVISION` = `{ planning, exposure, at }` (one `setProperty`, ~30–80 ms per write).
2. The Amazon import runner and the shipment-receipt writer bump it after commit.
3. `42_` and `60_` echo the revision in `meta`; a new read-only action `system.sourceRevision` returns it without
   opening the spreadsheet.
4. Frontend: the held answer's stamp becomes the server revision; one `system.sourceRevision` GET replaces the day
   boundary.

**GS cost (estimate, by the precedent of FX1-R4's measured router/contract rows):** router hook ~700 B, import/receipt
bumps ~300 B, `42_`/`60_` meta ~200 B, new action + router row ~600 B, action-contract 21→22 + required-action
manifest ~1,600 B — **about 3,400 B against 1,159 B of headroom.** It cannot be applied without an Owner-approved
ceiling raise or an equivalent trim, and it is a contract bump (a new release, R56) with an Apps Script sync.

**Avg anchor (§2.1), if the Owner wants it automatic:** in `recommendationWorkspaceDefaultIo_`, fall back to
`gapCalcResolveContext_('INVENTORY')` when `RECOMMENDATION_CALCULATION_DATE` is absent — ~250 B, no contract bump,
but it changes what the live read computes and must be an Owner decision. **The zero-code alternative:** the Owner
updates the Property when a new window is wanted.

## 5. Remaining (named, not repaired here)
- `km-data-access` `executionPlan` commands dispatch writes outside KM.DB; no page calls them today. If one is ever
  wired, it must go through the epoch (the scan in the DC1-R1 suite does not see that file).
- Materialised gap rows are not marked when a planning write in this tab post-dates their `calculated_at`
  (they are "as of" their own date by contract). A visible "sources changed since this gap was calculated"
  notice is a small UI round once §4 exists.
- The PSB bootstrap suite's early exit that left a mutant (FC1-R2) stays **OPEN** (D-S8-B3-188); its raw sweep
  record is kept in `docs/evidence/psb-early-exit-fc1r2/` and a later clean run is not taken as closing it.
