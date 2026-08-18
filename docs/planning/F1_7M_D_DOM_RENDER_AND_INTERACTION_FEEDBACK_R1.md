# F1-7M-D-DOM-RENDER-AND-INTERACTION-FEEDBACK-R1

**Mode:** AUDIT → CLASSIFY → LOW-RISK IMPLEMENTATION → VALIDATION.
**Goal:** improve user-PERCEIVED interaction speed + reduce unnecessary frontend render work WITHOUT changing backend authority / API facts / write semantics / business formulas / persistence / readback freshness.
**PRE HEAD:** `d88daab` (on origin). **Baseline:** `F1_7M_PERFORMANCE_AND_INTERACTION_BASELINE_R1.md`.

Frozen invariants held: `WRITE_FORCES_FULL_RELOAD=0` · `ACTIVE_PRIMARY_BROAD=0` · `ACTIVE_SECONDARY_BROAD=0` · `APP_PRIME_READ_DEPENDENCY=0` · `CANONICAL_STARTUP_WHOLE_DB_PRIME=0`. No optimistic business fact, no whole-page blocking for local interactions, no business/formula/schema change.

**Implemented (frontend-only):** D3 PO Overview double-click guard + feedback · D2 On-the-Way search render debounce · D5 Factory/Overseas initial-loading state.
**Deferred (source-grounded):** D1 Weekly render-grain + button feedback · D5 Carrier/SKU-Handbook loading · D6/D7 pagination.

---

## §1 Audit target matrix

| Target | Classification | Action |
|---|---|---|
| D1 Weekly Shipping section render | mixed: Save Qty/Add Note = SAFE_RENDER_OPTIMIZATION; Submit/Approve/Reject/Cancel/Done = BUSINESS_SEMANTIC_RISK (bucket-move) | **DEFER** (guard exists → no correctness gap; card-render needs 2-section reconciliation, feedback needs template button-wiring) |
| D1 Weekly button feedback | SAFE_INTERACTION_FEEDBACK | **DEFER** (onclick passes only planId, not the element → needs template wiring; bundled with D1 render slice) |
| D2 On-the-Way search render | SAFE_RENDER_OPTIMIZATION | **IMPLEMENT** (debounce) |
| D3 PO Overview double-click | SAFE_INTERACTION_FEEDBACK + duplicate-write prevention | **IMPLEMENT** |
| D5 loading gaps | SAFE (Factory/Overseas/Carrier/SKU-Handbook) | **IMPLEMENT Factory+Overseas**; defer Carrier (already shows a Search-prompt placeholder) + SKU-Handbook (distinct mount, lower traffic) |
| D6 large-grid render | IR/SKU/Shipment/Weekly = full innerHTML rebuild | audited; no partial-render this round |
| D7 pagination | all grids = PAGINATION_LIVE_MEASUREMENT_REQUIRED (no production row-count evidence); PO Overview/List already paginate (NO_ACTION) | **DEFER** |

---

## §2 Interaction matrix

| Surface | Command/event | Before | After |
|---|---|---|---|
| PO Overview | Receive / Header Save / Send PO / Cancel | no in-flight guard, no feedback → double-click = 2 writes | keyed in-flight guard (po-id+action) suppresses the 2nd write; pressed button → "Processing…" + `aria-busy`; clears on success (after readback) & failure |
| On-the-Way | search keystroke | full render() (innerHTML + bindRuntime re-bind + globe setMarkers/setArcs; filteredVms ×3) per keystroke | filter state updated synchronously; the render is coalesced into ONE trailing ~180ms call |
| Factory / Overseas | first load | blank region until data | bounded INITIAL_LOADING affordance, replaced by the render |

## §3 Render grain before/after

| Surface | Before | After |
|---|---|---|
| On-the-Way, burst of N search keystrokes | N full renders + N globe recomputes | **1** coalesced render + globe recompute (latest input wins) |
| PO Overview write | full `#po-groups` rebuild (unchanged — via loadAndRender readback) | unchanged (correct — server-authoritative) |
| Weekly (deferred) | full 5-section rebuild per command | unchanged this round |

## §4 Button feedback matrix

| Command | Guard before | Guard after | Visual before | Visual after |
|---|---|---|---|---|
| PO confirmReceive | none | `id:receive` in-flight key | none | disable + "Processing…" + aria-busy on modal primary |
| PO confirmEdit | none | `id:edit` | none | same |
| PO sendPo | none (DOM status precheck only) | `id:issue` | none | disable + "Processing…" on the card button (`this`) |
| PO cancel | none | `id:cancel` | none | same |
| Weekly `_spRunCommand_` | `_spInFlight[key]` (correct) | unchanged | none | **deferred** (needs button-element wiring) |

## §5 Debounce / coalescing matrix

| Input | Debounced? | Value | Notes |
|---|---|---|---|
| On-the-Way filter search (`[data-filter]` text) | YES | 180ms trailing | state synchronous; render coalesced; latest wins; stale timer cancelled |
| On-the-Way reference search (`[data-ref]` text) | YES | 180ms trailing | same |
| On-the-Way selects / dates / checkboxes (`onchange`) | NO | — | discrete commit events; stay immediate |
| Enter / card selection (`[data-ship]`/`[data-loc]`) | NO | — | separate click handlers; unaffected |

180ms chosen for a free-typing-over-loaded-data pattern (no submit); list and map read the SAME `state.filters`/`state.ref` at render time, so a coalesced render can never desync them.

## §6 Loading-state matrix

| Page | Before | After |
|---|---|---|
| Factory Stock | blank `#factory-stock-scroll-body` during first scoped read | INITIAL_LOADING affordance (region-scoped), replaced by render |
| Overseas Stock | blank `#overseas-snapshot-scroll-body` | INITIAL_LOADING affordance, replaced by render |
| Carrier Rate Card | already shows a "Set filters and Search" placeholder in most states | **deferred** (gap already partially covered) |
| SKU Handbook | renders after load | **deferred** (distinct mount structure; lower traffic) |
| On-the-Way | already has a spinner/error/empty state machine | no change (already handled) |

## §7 Pagination decision
**DEFERRED — PAGINATION_LIVE_MEASUREMENT_REQUIRED.** No grid exposes a real production row count in source (the only numeric bounds are workspace fetch page-size caps: PO 2000, shipment 3000, weekly 100 — request caps, not measured counts). Inventory Replenishment + SKU Details are the most exposed (full-row render, full rebuild on write) but adding pagination requires live row-count/timing evidence AND must not alter the current all-rows-visible workflow. PO Overview + PO List already paginate at 25/page (NO_ACTION). Proposal (design only, NOT a fact): if a live capture shows IR/SKU render > ~16ms at production row counts, add windowed rendering keyed on the existing category-tab/section filter.

---

## Implementation detail

### D3 PO Overview (`purchase-order-overview.js`)
Added `_poInFlightCmds` + `_poBeginCmd(key, btn)` / `_poEndCmd(key, btn)`. Each of the 4 write handlers acquires a `po-id + ':' + action` key AFTER its validation/confirm and BEFORE the write; a second click while in-flight returns without firing a second write. The pressed control disables + shows "Processing…" + `aria-busy`; the key clears (and the button restores) in BOTH `.then` (after the canonical `loadAndRender` readback) and `.catch`. Card buttons now pass `this`. Backend idempotency untouched; the page is never globally disabled (only the one control).

### D2 On-the-Way (`global-logistics-map.js`)
Added `debouncedSearchRender(selector)` (180ms trailing, single shared timer, `clearTimeout` cancels the stale one). The two text-search `oninput` handlers set `state.filters[key]`/`state.ref[key]` synchronously then schedule the coalesced render; `renderKeepFocus` still restores caret/focus after the render. Select/date `onchange` unchanged (immediate). Pure client-side filter over pre-loaded `state.vms` — no API request is tied to the search input, so no request is added, delayed-then-duplicated, or dropped.

### D5 Factory/Overseas (`factory-stock.js`, `overseas-stock.js`)
Added `_fsShowInitialLoading_`/`_osShowInitialLoading_` calling `KM.loadState.bindElement(scrollBody, msg).beginLoad(false)` before the first `loadScopedTables`. Region-scoped INITIAL_LOADING; the page's own render fully replaces the placeholder (READY/EMPTY). No error-path change, no whole-app mask.

## §11 Render correctness
On-the-Way: the coalesced render reads current `state.filters`/`state.ref` (single source) → list + map stay consistent; no duplicate/stale cards (it is the SAME full render, just coalesced). PO: no partial render introduced — the canonical full `loadAndRender` readback is preserved, so counts/totals/status stay server-authoritative. No dangling listeners (On-the-Way re-binds via `bindRuntime` on each render as before; PO re-renders as before).

## Safety
Optimistic business patch introduced? **NO** (PO still awaits `loadAndRender`; no local qty/status mutation). Business authority / formula / API contract / error semantics changed? **NO** (existing `alert()` error paths + envelopes preserved). Writer reload 0 / app prime 0 / canonical broad 0: **all preserved**.

## Tests
- New focused `ui-render-and-interaction-feedback-f1-7m-d-r1.test.js` — 31/0 (PO guard suppresses duplicate + button feedback + per-key isolation + clears on both paths; On-the-Way coalesce/latest-wins/stale-cancel/immediate-selects + 180ms bound; Factory INITIAL_LOADING paints region-scoped; Weekly guard unchanged; no optimistic success; invariants).
- Full regression: **235 suites pass; 4 fail = the 4 known historical baseline failures** (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`). **Zero new failures.** No prior-suite contract updates were needed.

## Deployment
Apps Script sync = **NO** · router = **NO** · new /exec = **NO** · bundle = **NO** · DB/schema = **NONE** · **frontend deploy = YES**.
Frontend files changed: `purchase-order-overview.js`, `global-logistics-map.js`, `factory-stock.js`, `overseas-stock.js`.

## Rollback
Revert the single commit. Each change is additive and backward-compatible (PO guard helpers default to no-op when a button is absent; the debounce preserves the prior observable behavior; loading helpers are `try/catch` no-ops when loadState/region is unavailable).

## Performance / LIVE_MEASUREMENT_REQUIRED
- On-the-Way: N keystroke renders → 1 coalesced render per burst (render-storm eliminated). Absolute ms = LIVE_MEASUREMENT_REQUIRED.
- PO: 2-possible duplicate writes → 1 guaranteed in-flight write; immediate click feedback (perceived-latency improvement even at unchanged request duration).
- Factory/Overseas: blank-until-data → immediate INITIAL_LOADING feedback (perceived).

## Deferred performance items / recommended next task
Deferred: D1 Weekly section-render + button feedback (needs 2-section reconciliation proof + onclick element-wiring); D5 Carrier/SKU-Handbook loading; D6/D7 pagination (needs live row-count evidence). **Recommended next task: F1-7M-E** (backend algorithm cost — 43_ gap `preReadSnapshots`, 42_ recommendation per-SKU maps, 56_/58_ backend cost) per the baseline roadmap — a dedicated Apps Script slice requiring a deployment. Do not begin automatically.
