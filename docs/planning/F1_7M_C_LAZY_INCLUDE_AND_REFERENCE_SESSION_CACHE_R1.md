# F1-7M-C-LAZY-INCLUDE-AND-REFERENCE-SESSION-CACHE-R1

**Mode:** AUDIT → SAFE CACHE/LAZY-LOAD CLASSIFICATION → ATOMIC IMPLEMENTATION → VALIDATION.
**Goal:** reduce repeated REFERENCE / secondary-data requests WITHOUT caching business facts and WITHOUT reintroducing a global Operation DB cache.
**PRE HEAD:** `b76c69b` (on origin). **Baseline:** `F1_7M_PERFORMANCE_AND_INTERACTION_BASELINE_R1.md`.

Frozen invariants held: `WRITE_FORCES_FULL_RELOAD=0` · `ACTIVE_PRIMARY_BROAD=0` · `ACTIVE_SECONDARY_BROAD=0` · `APP_PRIME_READ_DEPENDENCY=0` · `CANONICAL_STARTUP_WHOLE_DB_PRIME=0`. No `window._opDbCache` authority / whole-DB read / writer full reload / startup prime / silent broad fallback reintroduced. No business-fact / formula / schema change.

**Implemented (frontend-only):** the reusable `KM.referenceCache` infra + **C1** (marketplace master session dedup + invalidation).
**Deferred / no-op (source-grounded):** C2 warehouse, C3 carrier, C4 SKU options (marginal / sync-getter / broad reroute); C5 IR lazy-include (needs coordinated backend + IR row-builder refactor + Apps Script deploy); C6 once-guards (**all already exist** — nothing to change).

---

## §1 Cache classification matrix

| Data | Class | Cacheable? | Reason |
|---|---|---|---|
| `marketplaces` master | **SESSION_REFERENCE_SAFE** / WRITE_INVALIDATE | **YES (C1 implemented)** | reference master; all callers share the identical full universe (same normalizer + `marketplaceId\|\|marketplace` filter, no active-filter baked in); one writer (`upsertMarketplace`) |
| `warehouses` master | SESSION_REFERENCE_SAFE | classified, **not implemented** | no frontend writer exists (safest), but consumers read it **synchronously** off `_opDbCache`/workspace read-models — routing through an async reference cache would touch many pages (broad); some workspaces intentionally return a 2-field scoped subset (must not conflate). Deferred to avoid broad blast radius. |
| `carriers` identity | SESSION_REFERENCE_SAFE | classified, **not implemented** | only carrier identity is reference; read via sync `getCarriers()` off `_opDbCache` (reroute is broad); low repeated-fetch pressure |
| `carrier_rate_cards`, `carrier_lead_times` | **ALWAYS_FRESH_BUSINESS_FACT** | **NO** | effective-date rate/method + transit-day facts (IR method/ETA derivation) — volatile business data |
| `sku_details` rows | **ALWAYS_FRESH_BUSINESS_FACT** | **NO** | lifecycle/dimensions/pricing |
| category/series option universe | PAGE_SESSION (derivable) | **not implemented** | marginal — no page fetches `sku_details` SOLELY to derive it (RO/IR already hold the rows for business math; FC derives from `fc_regular_forecast`) → a shared `{categories,series}` cache would have no adopters without rerouting pages that already load the rows |
| inventory / forecast / gap / recommendation / allocation-draft / PO / shipment / factory / overseas quantities & status | **ALWAYS_FRESH_BUSINESS_FACT** | **NO** | operational state — never session cached |

## §2 Reference invalidation matrix

| Reference key | Source table | Getter | Invalidate after (writer) | Implemented? |
|---|---|---|---|---|
| `marketplaces` | `marketplaces` | `getMarketplaceReference()` | `upsertMarketplace` (success only) | **YES** |
| (`warehouses`) | `warehouses` | `getWarehouses()` | **no frontend writer** — would invalidate only on manual reload | deferred |
| (`carriers`) | `carriers` | `getCarriers()` | `importCarrierRateCards` (template spans carrier rows) | deferred |
| (category/series) | `sku_details` cols | derived per-page | `upsertSkuDetail` / `updateSkuLifecycle` | deferred (marginal) |

Note: `importMarketplaceSkusBatch` writes `marketplace_skus`, **not** `marketplaces` → does NOT invalidate the marketplace master (correct — no over-invalidation).

## §3 Lazy-include matrix (C5)

| IR table | Class | Currently | Verdict |
|---|---|---|---|
| marketplaces, marketplace_skus, sku_details, warehouses, amazon_inventory_snapshot, amazon_inventory_health_snapshot, amazon_weekly_sales_snapshot, fc_regular_forecast, fc_target_rules, fc_special_events, overseas_inventory_snapshot, factory_stock | PRIMARY_RENDER_REQUIRED | always-read | keep (primary grid cells) |
| amazon_daily_sales_snapshot, shipments, shipment_lines, shipping_plans, shipping_plan_lines, shipping_allocation_drafts, shipping_allocation_draft_lines | **FIRST_EXPAND_REQUIRED** (business facts) | always-read (eager) | **candidate for lazy include — DEFERRED** |
| carrier_lead_times, carrier_rate_cards | secondary (already `include:'carrierPlanning'`) | already lazy + once-guarded (`_irCarrierModel`) | no change |

**C5 deferral reason:** the 7 expand-only base tables are operational **business facts** (incoming shipments, allocation-draft recommendations) — per §1/C they are NOT cacheable; the only safe optimization is deferring their READ to first-expand via the existing `include` mechanism (`60_…:106` skips un-requested include tables). That requires (a) tagging the 7 specs with an `include:` flag in `60_api_v1_inventory_replenishment_workspace.gs` (an **additive backward-compatible** 60_ change, but it changes the default payload so the frontend must ship in lockstep), AND (b) refactoring the single synchronous IR row builder `_getCloudReplenishmentData` (which eagerly computes expand fields for every row) to tolerate the deferred tables and re-fetch+recompute on first-expand (mirroring `_irLoadCarrierPlanning_`), AND (c) an Apps Script deployment. That couples a frontend reference-cache round to a backend deploy + a core-render refactor on the most production-sensitive page (Site Inventory) → deferred to a dedicated, separately-gated slice. IR primary render is UNCHANGED this round (§8 "Do NOT change the primary visible row facts" honored).

## §4 Request before/after matrix

| Scenario | Before | After | Class |
|---|---|---|---|
| RO opened twice in one session (marketplace ref) | 2 `getTable('marketplaces')` GETs | **1** (2nd shares the settled cache) | REQUEST_COUNT_REDUCTION |
| Any future consumer of `getMarketplaceReference()` in the same session | 1 GET each | 1 GET total (shared) until invalidated | REQUEST_COUNT_REDUCTION |
| Concurrent first calls for the marketplace ref | N GETs | **1** (shared in-flight promise) | REQUEST_COUNT_REDUCTION |
| After `upsertMarketplace` | (n/a) | next `getMarketplaceReference()` refetches (invalidated) | correctness |
| IR primary first-open | 19 base tables | **19 (unchanged — C5 deferred)** | — |

Absolute ms = `LIVE_MEASUREMENT_REQUIRED`.

---

## Implementation

### `KM.referenceCache` (new, `operation-system-db-api.js`)
Minimal keyed promise-memo installed at the KM namespace init: `get(key, loader)` shares ONE in-flight request per key and retains the settled **success** value for the session; a **failed** loader is deleted (never retained → next `get` retries); `invalidate(key)` / `invalidateMany(keys)` / `clear()` force refetch; an epoch counter drops a load that resolves **after** an invalidation (no stale retain). REFERENCE-ONLY, keyed by resource, in-memory, **no LocalStorage / no cross-session persistence, no TTL, no hidden background refresh, no business-table keys**. It does NOT reintroduce `window._opDbCache` authority — it is a separate memo layered ABOVE `getOperationDbTableFromSheet` (whose `_ts=Date.now()`+`no-store` deliberately defeats HTTP caching, so all dedup value comes from the promise memo, invalidated by the writer).

### C1 — marketplace reference
`getMarketplaceReference()` now returns `KM.referenceCache.get('marketplaces', loader)` where `loader` is the byte-identical prior body (`getOperationDbTableFromSheet('marketplaces')` → `normalizeMarketplaceRecord` → `marketplaceId||marketplace` filter). `upsertMarketplace` calls `referenceCache.invalidate('marketplaces')` **after** the `json.success` guard (a failed write throws first → cache stays valid). Defensive fallback to a raw fetch if the cache is somehow absent.

## §11 Failure semantics (tested)
First load success → cached · second call → no network · concurrent first calls → one shared promise · first-load failure → not cached · next call after failure → retries server · write success → invalidate → refetch · write failure → cache remains valid · stale in-flight resolving after invalidate → dropped. No stale-on-error fallback.

## Safety
Business fact cached? **NO** (only the marketplace reference master; rate-cards/lead-times/sku_details rows/quantities/status explicitly excluded and asserted). Business authority / formula / schema / API contract changed? **NO**. Stale-on-error fallback? **NO**. Writer reload 0 / app prime 0 / canonical broad 0: **all preserved**.

## Tests
- New focused `api-reference-session-cache-f1-7m-c-r1.test.js` — 45/0 (dedupe, shared in-flight, no-cache-on-failure, invalidation, stale-in-flight drop, key isolation, no-business-fact-keys; C5 deferral + C6 guards lock-in; invariants).
- Contract update: `api-bounded-reference-include-extensions-f1-7j-a2-r1` (getMarketplaceReference shape now routes through the cache; pipeline byte-identical) — ALL GREEN.
- Full regression: **234 suites pass; 4 fail = the 4 known historical baseline failures** (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`). **Zero new failures.**

## Deployment
Apps Script sync = **NO** · router = **NO** · new /exec = **NO** · bundle = **NO** · DB/schema = **NONE** · **frontend deploy = YES**.
Frontend files changed: `assets/js/api/operation-system-db-api.js` only.

## Rollback
Revert the single commit. C1 is backward-compatible (`getMarketplaceReference` falls back to a raw fetch if the cache is absent; the loader is byte-identical to the prior body); the cache is additive and touched by exactly one writer.

## Recommended next task
**F1-7M-D** (DOM row patch / pagination / shipping-plan section render / On-the-Way debounce / button feedback) per the baseline roadmap — OR a dedicated, separately-gated slice for the C5 IR lazy-include + the B1/B3/B6 bounded endpoints (all require an Apps Script deployment + coordinated frontend). Do not begin automatically.
