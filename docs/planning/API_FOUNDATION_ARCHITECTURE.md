# API Foundation Architecture — Phase API-1 (Round A, 2026-08-04)

> **Status: SOURCE-PRESENT / TEST-VERIFIED, DORMANT.** A pure, dependency-free, **zero-business-logic** transport-foundation layer (`assets/js/api/km-api-foundation.js`) that becomes the base of the future Workspace API. It is loaded by `index.html` but **inert in production**: the feature flag `USE_WORKSPACE_API` defaults to `false`, so every request delegates to the existing legacy surface (`window.KM.DB.*` / `WEB_APP_FETCH`) exactly as today. **No business logic, no Submit, no recommendation/allocation/formula, no new endpoint, no `.gs` change, no DB change, no migration.**
>
> **Round numbering note:** `API_MIGRATION_MASTER_PLAN.md` §6 labels the foundation *implementation* "API-2" (contract-freeze being "API-1"). This round was issued as **"API-1 — Foundation Implementation"**; it delivers the frozen envelope/registry/flag contract **and** the dormant implementation together. The master plan's phase table is reconciled to this combined API-1; the next mainline slice (`getWeeklyShippingPlanWorkspace`) is **API-2** per this round's own "Next Slice".

---

## 1. Architecture diagram

```
                         window.KM.api  (default live instance — dormant while flag off)
                                 │
      ┌──────────────────────────┴───────────────────────────┐
      │                     ApiClient                          │   getWorkspace(name, params)
      │   feature-flag decides: legacy vs workspace mode       │   executeCommand(action, payload)
      └──────────────────────────┬───────────────────────────┘
                                 │  { kind, name, params/payload, mode }
                                 ▼
                          ApiDispatcher                          catches EVERYTHING → never throws
                                 │
             ┌───────────────────┼───────────────────────────────┐
             ▼                                                    ▼
      WorkspaceResolver  ── consults ──►  Workspace Registry (7 domains, REGISTERED only)
             │
   ┌─────────┴───────────┐
   ▼                     ▼
mode = LEGACY      mode = WORKSPACE (flag ON)
   │                     │
   ▼                     ▼
LegacyAdapter      (registered-only ⇒ WORKSPACE_NOT_IMPLEMENTED)
   │  delegates to
   ▼
window.KM.DB.*  /  WEB_APP_FETCH   ◄── ApiTransport (formal text/plain POST + GET, configured-guarded; future use)
   │
   ▼
Apps Script Web App  ──►  .gs handlers + KMSAFE (S0/S0.5)  ──►  Google Sheet DB

  Cross-cutting:  ResponseEnvelope {success,data,meta,errors}  ·  ErrorEnvelope errors[]{code,message,details}
                  Cache (memory only, TTL=0 → interface present, never caches)
                  Forbidden-op guard (KMSAFE mirror) — refuses create sheet / append header / modify schema / migrate
```

Each layer is **independent and separately testable** (exposed on the instance: `client`, `transport`, `dispatcher`, `workspaceResolver`, `registry`, `responseEnvelope`, `errorEnvelope`, `cache`, `legacyAdapter`, `isForbiddenAction`).

---

## 2. Workspace Registry (REGISTERED only — not implemented)

Seven canonical domain workspaces are registered with their read table-sets; **none is implemented this round** (`status = REGISTERED`, `implemented = false`). The registry is metadata only — it names tables a future workspace read will need; it contains no query, no calculation.

| Workspace (`name`) | Label | Representative tables |
|---|---|---|
| `weeklyShipping` | Weekly Shipping | shipping_plans, shipping_plan_lines, carriers, carrier_rate_cards, sku_details |
| `inventoryReplenishment` | Inventory Replenishment | marketplace_skus, sku_details, overseas/amazon snapshots, fc_regular_forecast, shipping_allocation_drafts |
| `requestOrder` | Request Order | request_orders(+lines,+sources), fc_regular_forecast, marketplace_skus |
| `purchaseOrder` | Purchase Order | purchase_orders(+lines), request_orders |
| `shipment` | Shipment | shipments(+lines), shipping_plans, carriers, warehouses |
| `fcSummary` | FC Summary | fc_regular_forecast, fc_special_events, fc_target_rules, campaigns(+lines), marketplace_skus |
| `skuDetails` | SKU Details | sku_details, marketplace_skus, tax_referral_rates, sku_regional_details |

`WorkspaceResolver.resolve(name)` → `{ found, status, implemented, def }`. Unknown → `{found:false}`; registered → `{implemented:false, status:'REGISTERED'}`.

---

## 3. Legacy compatibility (100% backward compatible)

- The module is **purely additive**: it defines `window.KM.apiFoundation` (factory) and `window.KM.api` (a default instance) and touches nothing else. Constructing it does **not** mutate `window.KM.DB` or any existing object, and issues **no** legacy call until a client method is invoked (proven inert — test B1/B2).
- With `USE_WORKSPACE_API = false` (production default) **every** request routes through the **LegacyAdapter**, which delegates to the existing `window.KM.DB.*` methods (`executeCommand`) or the existing whole-DB reader `getOperationDb` (`getWorkspace`) — i.e. today's exact transport behavior, including the post-write readback contract owned by the legacy layer.
- Existing pages are **not rewired**; they keep calling `window.KM.DB.*` directly. The foundation is an *insertable* base, not a cutover. `WEB_APP_FETCH` / `operation-system-db-api.js` remain the live transport (RETIRE_AFTER_API_CUTOVER — nothing retired here).

---

## 4. Feature flag

- `USE_WORKSPACE_API` — **default `false`** (production = legacy). `getFlags()` reads; `setWorkspaceApiEnabled(bool)` flips (tests/dev only).
- Routing rule: `if (!USE_WORKSPACE_API) → LegacyAdapter` else `→ Workspace path`. Because no workspace is implemented, flag-ON `getWorkspace`/workspace-command returns a structured `WORKSPACE_NOT_IMPLEMENTED` error — **safe to flip, never breaks a page** (it simply refuses, it does not fall through to undefined behavior).

---

## 5. Dispatcher

`dispatch({ kind, name, params/payload, mode })` normalizes a request and routes:
- `kind = 'command'` → `dispatchCommand`: forbidden-op check → mode split → LegacyAdapter delegate or `WORKSPACE_NOT_IMPLEMENTED`; unknown legacy action → `UNKNOWN_ACTION`; a throwing legacy method → structured error (never rethrown).
- `kind = 'workspace'` → `dispatchWorkspace`: unknown → `UNKNOWN_WORKSPACE`; flag-ON + registered-only → `WORKSPACE_NOT_IMPLEMENTED`; flag-OFF → LegacyAdapter whole-DB read.
- Unknown kind / non-object → `INVALID_REQUEST`.
- The dispatcher **catches everything** and always resolves to an envelope — it never throws and never rejects.

---

## 6. Workspace Resolver

Thin lookup over the Registry (§2). Returns the registered definition + implementation status. Registered-but-not-implemented is a **first-class, explicit** state (`WORKSPACE_NOT_IMPLEMENTED`), not an error of omission — this is what lets API-2 implement one resolver at a time behind the flag with zero risk to the others.

---

## 7. Response contract (frozen)

```
{ success: true,
  data:    <payload | null>,
  meta:    { apiVersion:'1', source:'legacy'|'workspace', mode, workspace, action, cached:false },
  errors:  [] }
```
Uniform for every current and future API response. `meta.cached` is always `false` this round (Cache TTL = 0). Deterministic + JSON-safe (no wall-clock, no RNG).

---

## 8. Error contract (frozen)

```
{ success: false, data: null, meta: {...},
  errors: [ { code, message, details } ] }
```
**A raw String is never thrown across the boundary.** Any thrown value (Error, safety token, even a bare string) is mapped by `errorFromException` into a structured `errors[]` entry. Canonical `code` taxonomy: `INVALID_REQUEST`, `UNKNOWN_ACTION`, `UNKNOWN_WORKSPACE`, `WORKSPACE_NOT_IMPLEMENTED`, `FORBIDDEN_OPERATION`, `LEGACY_ADAPTER_MISSING`, `TRANSPORT_NOT_CONFIGURED`, `TRANSPORT_ERROR`, `INTERNAL_ERROR`. A KMSAFE `safetyToken` maps to `FORBIDDEN_OPERATION` with the token preserved in `details`.

### 8.1 Contract clarifications (Round API-1.5, 2026-08-04)

- **`apiVersion` is the string `"1"`** (canonical) — not `"v1"`. `errors[]` (array) is canonical — there is no singular-`error` variant.
- **`envelope.success` is transport-level** — it means "the delegated/dispatched call resolved without throwing", **not** a reinterpretation of business status (that would be business logic). A **resolved** legacy `{success:false}` is preserved **verbatim in `data`** (business status intact); a legacy **rejection/throw** becomes `envelope.success:false`. When API-2 cuts a page over to `executeCommand`, that slice must map a resolved business `{success:false}` into `errors` (or read `data.success`).
- **Legacy authority is resolved at CALL TIME.** The LegacyAdapter no longer captures `window.KM.DB` once at construction; it resolves the currently-active `KM.DB` on each call (unless a fixed legacy is injected for tests). This removes any stale-reference risk if `KM.DB` is attached/replaced after the Foundation loads (API-1.5 fix; `API_FOUNDATION_COMPATIBILITY_AUDIT.md` §4).
- **`requestId` / server timing are NOT emitted** by the Foundation and are not claimed — deferred to API-2 hardening (`requestId` is a correlation id, **not** an idempotency key; server timing is never fabricated on the client).
- **Feature flag is a single GLOBAL boolean today.** Per-workspace enablement (enable Weekly Shipping alone) is a **frozen API-2 requirement**, not implemented here — see `API_FUNCTIONAL_COVERAGE_F2.md` §4.

---

## 9. Security — KMSAFE forbidden-operation guard

Continuing S0.5: **no workspace may create a sheet, append/write a header, modify schema, or migrate.** The server-side KMSAFE gate (`supply-planning-production-safety.js`) remains the ultimate authority; the API foundation adds a redundant **client-side fail-closed guard** so a forbidden action can never even be dispatched. `isForbiddenAction()` mirrors 100% of `KMSAFE.STRUCTURAL_OPS` + `WHOLE_SHEET_OPS` plus header-write/schema-migration verbs (exact, case-insensitive, or forbidden-verb-prefix). The guard fires in **both** modes and **before** any legacy delegation — verified that no forbidden op ever reaches the legacy surface, and that normal reads/writes (`getOperationDb`, `updateShippingPlanStatus`, upserts) are **not** falsely blocked.

---

## 10. Cache (memory only, TTL = 0)

Interface present (`get/set/invalidate/clear/size`, `ttl`), **no real caching**: TTL = 0 ⇒ `get()` always misses and `set()` is a no-op, so there is **zero stale-data risk**. This is the seam where API-2+ will add targeted invalidation (replacing whole-DB reload) — the interface is frozen now, the behavior is deliberately empty.

---

## 11. Test coverage

`assets/tests/km-api-foundation.test.js` — **56 assertions, 0 failed** (requires the real UMD module directly; no eval). Covers: module surface/constants; **Registry** (7 workspaces, registered-only, register/has/list); **Response Envelope**; **Error Envelope** (incl. thrown-string → structured); **Feature Flag** routing (legacy vs workspace); **Legacy Adapter** delegation + payload pass-through + unknown-action + throwing-method; **Dispatcher** validation; **Forbidden** ops (all blocked in both modes, KMSAFE cross-check = 21/21 STRUCTURAL_OPS covered, no false positives); **Cache** (TTL 0 misses); **determinism** + zero-business-logic source scan; **backward-compat inertness**.

---

## 12. Performance impact

**None this round.** The layer performs no I/O until called, adds no transport while dormant, and does not parallelize, optimize, or merge DB reads. It only frames where API-2+ will convert whole-DB reload → targeted workspace reads + invalidation (`API_MIGRATION_MASTER_PLAN.md` §4–5). One extra `<script>` (a small pure module) is loaded; it registers 7 workspace descriptors and returns.

---

## 13. Zero-business-logic proof

- Source scan (test Z3): none of `recommended_qty`, `planned_qty`, `order_qty`, `units_per_carton`, `reserved_stock`, `current_stock`, `submitRecommendation` appear in the module. Table **names** in the read-registry (e.g. `shipping_allocation_drafts`) are metadata, not logic.
- No `.gs`, no `assets/js/core/*.js`, no generated bundle, no recommendation/submit/allocation/formula/persistence/shipment runtime touched. The Apps Script bundle is **not** rebuilt (no `BUNDLE_REBUILD_REQUIRED`).
- Determinism scan (test Z2): no wall-clock, no RNG, no locale collation.

---

## 14. Next slice — API-2 (Weekly Shipping Workspace)

Implement `getWeeklyShippingPlanWorkspace` as the first real resolver (`status → IMPLEMENTED`) behind the flag: read the bounded plan/line/carrier/sku table-set, return the frozen envelope, add targeted invalidation on its own writes (status/qty/note/complete). Prove F2 parity (no connected function lost) then F3 (page cutover behind flag) per `API_MIGRATION_MASTER_PLAN.md` §6–7. Recommendation stays **last** (Submit boundary deferred). Verification-Copy-only (S0.5); no Production.

---

*Companions:* `API_MIGRATION_MASTER_PLAN.md`, `API_CURRENT_TRANSPORT_ACTION_INVENTORY.md`, `FUNCTIONAL_REACHABILITY_AUDIT.md`, `SYSTEM_RUNTIME_ARCHITECTURE.md` §14. Deployment governed by `DEPLOYMENT_RELEASE_GOVERNANCE.md` (frontend-only this round: `km-api-foundation.js` + `index.html` = `FRONTEND_GITHUB_PAGES_REQUIRED`; docs = `DOCUMENTATION_ONLY`; no `APPS_SCRIPT_SYNC_REQUIRED`).
