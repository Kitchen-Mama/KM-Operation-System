# F1-7L-APP-PRIME-DEPENDENCY-RETIREMENT-AND-GLOBAL-PRIME-REMOVAL-R1 — remove the whole-DB startup prime

**Outcome: READ TRANSPORT / CACHE-DEPENDENCY retirement only. No business authority/formula/schema/writer/
idempotency change. FRONTEND-ONLY (6 JS files) — NO .gs / router / /exec / bundle / DB change.** Baseline PRE HEAD
`132f302`. The canonical app no longer fetches/normalizes the whole Operation DB at startup; the last read-side
dependencies on that prime (the IR allocation-draft hydrate + the 2 remaining canonical secondary surfaces) now load
their OWN bounded tables on demand. `_opDbCache` is no longer canonical startup state.

## §0 PRE-edit source audit (source-grounded, HEAD 132f302) — no drift
Complete `loadOperationDb` classification (4-agent fan-out): every remaining broad load is the startup prime, a
debug/manual util, the writer post-write seam, one lazy 2nd-layer expand, or a Legacy kill-switch else-branch — **no
CANONICAL_REQUIRED, no DEAD sites**. Per-page first-open: **all 16 pages SELF-SUFFICIENT** in canonical mode (each
self-loads its own scoped/bounded data). The 16 Legacy kill-switch branches each self-load broad DB on demand.
- `ACTIVE_PRIMARY_BROAD = 0` · `ACTIVE_SECONDARY_BROAD = 2` (RO 2nd-layer expand · FC Regular/Event builder modals) ·
  `APP_PRIME_DEPENDENT = 1` (IR allocation-draft hydrate — the only surface reading broad getters with NO self-load) ·
  `WRITER_FULL_RELOAD = 0`. **Matches the expected baseline — no drift.**

## §1/§2 IR allocation-draft hydrate — HALT E RESOLVED (byte-identical, no authority change)
`_hydrateAllocationDraftFromDb(ctx)` is a **sync** session-working-state recovery that reads the two canonical draft
tables via broad getters and applies a **country+marketplace + latest-`updated_at`** selection + a raw→`bySku`
transform. The scoped SSOT `getShippingAllocationDraftWorkspace` is **async** and requires
`planning_cycle`+exact-`company`+`source_page`, hard-conflicting on >1 active — a **different selection contract**, so
forcing it would change draft semantics (the exact reason F1-7J-A halted). **Resolution:** feed the UNCHANGED sync
hydrate from a BOUNDED scoped read of the SAME two canonical tables
(`refreshCacheTables(['shipping_allocation_drafts','shipping_allocation_draft_lines'])`) awaited in
`_restoreAllocationDraftFromSession` BEFORE the hydrate. Same tables + same `normalizeOperationDb` + same selection +
same transform → **byte-identical `bySku`**; only the data transport moved off the startup prime. No second draft
authority; draft business semantics untouched (deferred). `getShippingAllocationDraftWorkspace` remains the persistence
panel's SSOT (unchanged). Session/reload: on a fresh session the bounded load rehydrates the DB draft (DB wins); on
transport failure it falls through to the sessionStorage recovery cache exactly as before.

## §3/§4 Request Order Layer-2 expand + Send + save — bounded, BEFORE==AFTER, composer-refreshed
The 2nd-layer expand + Send read FC (regular/special/target), factory_stock, warehouses, purchase_orders/lines via broad
getters. New `_roEnsureL2Tables(force)` loads ONLY those 7 tables via `refreshCacheTables` (SAME normalizer → BEFORE==
AFTER), once per page (force re-reads after a write). Wiring: the expand (`_roToggleRowByKey`) lazy-loads them instead
of the old whole-DB `loadOperationDb`; `handleSendRequest` awaits it (Send is reachable without expanding);
`_roReloadAndRerender` — in canonical (composer) mode — re-reads the bounded FC tables then re-fetches the **scoped
first-layer composer** (`_opLoadFirstLayerComposer_`), NOT the legacy broad `_buildRequestOrderRowsFromDb` (which needs
first-layer-only tables absent from the bounded set). §4 freshness: a Target%/FC save now yields fresh Layer-2 facts via
this bounded readback + composer refresh (fixing the post-F1-7K reopen staleness) with NO whole-DB reload and no
optimistic patch. The first-layer composer / Layer-1↔Layer-2 boundaries are unchanged. The legacy kill-switch init
branch keeps its on-demand whole-DB self-load.

## §5/§6 FC Summary secondary modals — bounded; Event Assist calc UNCHANGED
`_fcEnsureBroadCacheThen` now loads exactly `_FC_SECONDARY_TABLES` = sku_details, marketplace_skus, campaigns,
pricing_list, fc_regular_forecast, fc_special_events, marketplaces via `refreshCacheTables` (bounded; SAME normalizer),
replacing the whole-DB lazy load — so the Regular/Special-Event/Event-Assist builder + CSV import modals keep every
displayed fact BEFORE==AFTER without the startup prime. `_fcAfterWrite` calls `_fcResetSecondaryCache()` so the next
modal open re-reads fresh. **Event Assist business calculation (`_evtApplyForecastAssist`, growth/adjust bases via
`_evtGrowthBaseForSku`/`_evtBaseFcForSku`) is byte-identical — only its read transport is bounded.**
`EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED` remains DEFERRED. The Target-Rule and CSV modals already read scoped and
were unaffected.

## §7 SKU Details "Refresh DB" — scoped in canonical
`handleRefreshDb` (the ⟳ Refresh DB menu action) now refreshes the scoped `skuDetails` workspace read-model
(`_skWorkspaceRefresh_` → re-render) in canonical mode — the old `reloadOperationDb` refreshed only the broad cache,
which the scoped render ignores, so it had no visible effect. The Legacy kill-switch posture keeps the whole-DB
`reloadOperationDb`. `window.reloadOperationDb` remains as the explicit manual/debug whole-DB util (unchanged).

## §8 app.js global prime — REMOVED
The `DOMContentLoaded` handler no longer calls `loadOperationDb({force:true})`. Startup does NO whole Operation DB
fetch/normalize/global-cache population. The legacy-localStorage-override warning (reads localStorage, not the
Operation DB) is preserved. No delayed/route-change/background prime introduced.

## §10 `_opDbCache` contract AFTER F1-7L
`_opDbCache` is **NOT canonical application state and is NOT populated at startup**. No canonical primary or secondary
render, no canonical writer, and no canonical business authority assumes it was pre-populated. It exists only as an
**on-demand bounded scratch**, created/patched slice-by-slice by `refreshCacheTables` for the documented compatibility
surfaces (RO 2nd-layer expand, FC builder/import modals, IR allocation-draft hydrate), by Legacy kill-switch branches
that self-load on demand, and by the explicit `reloadOperationDb` debug util. Each surface loads exactly the tables it
reads; bounded loads patch only their own slices (never a whole-DB replace).

## §11 Startup performance class
| | BEFORE | AFTER |
|---|---|---|
| Startup whole-DB fetch | 1 (`getOperationDb` → whole `normalizeOperationDb` → global cache) | **0** |
| App start | whole-DB request + full normalization + global cache, then page scoped reads | lightweight shell; each page issues its own bounded/scoped reads on mount |
Canonical startup whole-DB prime **1 → 0**. Whole-DB normalization on the startup path removed. No fixed ms claimed.

## §12/§13 Direct first-open + loading/empty/error
Every registered workspace page + every non-workspace scoped page + SKU Handbook + SKU Regional + On-the-Way loads from
its own scoped owner/read-model on first open (audited SELF-SUFFICIENT), each behind its existing `KM.loadState`
region (INITIAL_LOADING/READY/EMPTY/ERROR) — no page interprets "not loaded yet" as a valid empty dataset, and none
depends on another page having opened first.

## §14 Authority debts — UNCHANGED
Incoming Inventory reconstruction, sitePlanningAllocation 18-day 3PL pool, and FC Event Assist calculation are left
byte-identical (verified present + unmodified). Prime removal was NOT used to alter them.

## §18 Exact debt recount (PRE 132f302 → POST)
| Metric | PRE | POST |
|---|---|---|
| Writer full reload | 0 | **0** |
| ACTIVE_PRIMARY broad | 0 | **0** |
| ACTIVE_SECONDARY broad | 2 | **0** (RO expand + FC modals now bounded) |
| APP_PRIME_READ_DEPENDENT surfaces | 1 | **0** (IR hydrate bounded) |
| Canonical startup whole-DB prime | 1 | **0** |
| BACKGROUND broad | 2 (app prime, sku-details manual) | **1** (only the `reloadOperationDb` debug util; the prime is gone and sku-details Refresh is scoped in canonical) |
| LEGACY_ONLY broad (kill-switch self-load) | 16 | **16** (rollback preserved; self-load on demand) |
| Whole-DB reload CALLS in db-api | 2 | 2 (writer seam fallback + `reloadOperationDb` debug — unchanged) |

## Delivery
- **Files (6 runtime):** operation-system-db-api.js (expose `KM.DB.refreshCacheTables` + 15-table `_KM_TABLE_CACHE_KEY_`),
  inventory-replenishment.js (§1), request-order.js (§3/§4), fc-summary.js (§5), sku-details.js (§7), app.js (§8).
  Tests: NEW `api-app-prime-retirement-f1-7l-r1.test.js` (56/0) + 2 stale-contract assertion updates
  (api-ai-plan-first-layer-composer-f1-7e-prereq5, api-batch-f-writer-full-reload-retirement-f1-7k). Docs: this file +
  master-plan delta.
- **API contract delta** — NONE (reuses `getTable`; `refreshCacheTables` is a frontend db-api helper).
  **Apps Script sync: NO. Router: NO. New /exec: NO. Bundle: NO (`aaf5b07…2782`). DB/schema: NONE.** Frontend deploy
  YES: the 6 files above.
- **Tests** — new 56/0; full regression **234 files, only the 4 known baselines** (`gap-job-done-notice-f1-small-r1`,
  `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`).
- **Rollback** — revert the commit; OR re-add the one-line startup prime; OR engage a page's kill switch (each Legacy
  branch self-loads the broad DB on demand). The writer rollback flag `window.KM_WRITER_FULL_RELOAD` (F1-7K) is
  independent and unaffected.
- **HALT/risk tokens** — none. HALT E RESOLVED (bounded byte-identical hydrate). `EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED`
  remains DEFERRED (out of scope).

**FINAL GATE: PASS** — canonical posture achieves WRITE_FORCES_FULL_RELOAD = 0, ACTIVE_PRIMARY = 0, ACTIVE_SECONDARY = 0,
APP_PRIME_READ_DEPENDENCY = 0, CANONICAL_STARTUP_WHOLE_DB_PRIME = 0; IR allocation-draft, RO Layer-2, and FC secondary
behavior remain equivalent; no business authority/formula change; Legacy rollback remains on-demand usable; no new
regression.

**STOP after F1-7L. Do NOT begin authority redesign automatically. Do NOT begin generic performance/UI optimization
automatically.**
