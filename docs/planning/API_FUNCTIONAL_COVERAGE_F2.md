# API Functional Coverage — F2 Gate (Phase API-1.5, 2026-08-04)

> **F2 = "After API Foundation"** functional-compatibility checkpoint from `API_MIGRATION_MASTER_PLAN.md` §10. It re-runs the **F1** reachability baseline (`FUNCTIONAL_REACHABILITY_AUDIT.md`, API-0) against the state **after** the Dormant API Foundation (API-1 `d957e45`) + the API-1.5 stale-capture fix. **Goal: prove no currently-connected function was lost.** F1 is **not** rewritten here.
> **Verdict: F2 PASS (source/test-proven).** Zero regression; zero page cutover; seven workspaces registered, zero implemented. Browser-smoke items are explicitly flagged (no deployment this round).

---

## 1. F1 → F2 coverage diff

| Category | F1 (API-0) | F2 (now) | Δ |
|---|---|---|---|
| `CONNECTED_LEGACY_UNCHANGED` | all live `KM.DB.*` page paths | **identical** — no page rewired, no `KM.DB` method changed | 0 |
| `FOUNDATION_AVAILABLE_NOT_USED` | — | `window.KM.api` present, delegates to legacy, **used by no page** | +1 surface |
| `WORKSPACE_REGISTERED_NOT_IMPLEMENTED` | — | 7 workspaces registered, 0 resolvers | +7 registered |
| `BACKEND_ONLY_UNCHANGED` | recommendation runtime (KMPW/KMORCH/KMPR/KMPL), Submit | **unchanged** — not loaded in browser, not API-exposed | 0 |
| `FRONTEND_ONLY_UNCHANGED` | local UI/mock paths | unchanged | 0 |
| `MOCK_LOCAL_UNCHANGED` | demo data paths | unchanged | 0 |
| `INTENTIONALLY_DEFERRED` | Weekly L1/L2 rate/rationale/carrier; combine/uncombine; Submit; Recommendation | unchanged (still deferred) | 0 |
| `REGRESSION` | — | **NONE** (full suite: only pre-existing replen P29–P31) | 0 |
| `UNKNOWN_BROWSER_EVIDENCE` | (F1 browser gaps) | + live rendering of pages with the new inert `<script>` present = `NEEDS_BROWSER_SMOKE` | flagged |

**No F1-connected function moved out of `CONNECTED_LEGACY_UNCHANGED`.** The only additions are the inert Foundation surface and 7 registered-but-unimplemented workspaces.

---

## 2. Per-page non-impact (all page modules, source-proven)

Every `assets/js/pages/*.js` module + `app.js` was source-scanned: **none references `KM.api` / `apiFoundation` / the Foundation script**. Therefore each page's mount, `KM.DB` calls, event handlers, save/load actions, navigation keys, and loading/error UI are **unchanged by construction**.

| Page (module) | Result |
|---|---|
| home, inventory-replenishment, factory-stock, overseas-stock, overseas-ops-preview, overseas-inbound, overseas-outbound, fc-summary, forecast, request-order, request-order-draft, sku-details, sku-regional-details, shipping-plan, shipping-history, supplychain, sku-handbook, campaign-risk, purchase-order-overview, purchase-order-list, carrier-rate-card, global-logistics-map (+ overseas-preview) | **UNAFFECTED_SOURCE_PROVEN** |
| Live rendering with the Foundation `<script>` present (all pages) | **NEEDS_BROWSER_SMOKE** (no deployment/browser evidence this round) |

*No page is `FOUNDATION_CONFLICT`. No page is `UNKNOWN` at source level.* A Foundation script error cannot block later page scripts (separate `<script>` tags; and the module is guarded + zero-I/O), but live confirmation remains a browser-smoke item.

---

## 3. Domain migration matrix (current)

| Domain | Registry | Resolver | Query API | Command API | Page cutover | Legacy fallback | Verification Copy | Functional parity | Next slice |
|---|---|---|---|---|---|---|---|---|---|
| **Weekly Shipping** | REGISTERED | none | none | none | none | active (legacy) | not started | legacy parity | **API-2 (first)** |
| Inventory Replenishment | REGISTERED | none | none | none | none | active (legacy) | not started | legacy parity | API-5+ |
| Request Order | REGISTERED | none | none | none | none | active (legacy) | not started | legacy parity | API-5+ |
| Purchase Order | REGISTERED | none | none | none | none | active (legacy) | not started | legacy parity | API-5+ |
| Shipment | REGISTERED | none | none | none | none | active (legacy) | not started | legacy parity | API-5+ |
| FC Summary | REGISTERED | none | none | none | none | active (legacy) | not started | legacy parity | API-5+ |
| SKU Details | REGISTERED | none | none | none | none | active (legacy) | not started | legacy parity | API-5+ |
| **Recommendation** | **not registered** | none | none | none | none | n/a (backend-only) | not started | backend-only | **LAST** (after Submit freeze) |

**Summary:** 7 registered · **0 implemented** · **0 page cutovers** · all functionality remains Legacy · Recommendation stays backend-only and outside the first slices.

---

## 4. Per-slice feature-flag requirement (frozen; implement in API-2)

The current flag is a single **global** boolean and **cannot** enable Weekly Shipping alone. Frozen future model (API-2, default-off, no dual execution):

```
USE_WORKSPACE_API            : boolean (global master, default false)
workspaceApiEnabled          : { <workspaceName>: boolean }  // default {}, unlisted ⇒ false
run resolver  ⇔  USE_WORKSPACE_API && workspaceApiEnabled[name] === true && status === IMPLEMENTED
otherwise      ⇒  fail-closed: legacy delegation (if a slice defines fallback) OR WORKSPACE_NOT_IMPLEMENTED
rollback       ⇒  set workspaceApiEnabled[name] = false  (Weekly only)
```

- No per-command dual execution; a workspace is either resolver-served or legacy/`NOT_IMPLEMENTED`, never both.
- Enabling Weekly must **not** activate the other six (they stay `false`/unlisted).

---

## 5. API-2 authorization gate (all must hold)

- [x] Foundation init inert + zero-I/O
- [x] `window.KM` / `KM.DB` authority preserved (call-time resolution)
- [x] Load order safe; single Foundation script
- [x] Legacy transport behavior preserved (payload/return/rejection semantics)
- [x] `USE_WORKSPACE_API=false` production default
- [x] Flag-on unimplemented workspaces fail closed
- [x] No legacy↔workspace dual execution
- [x] Errors cannot become false-success (rejection→`success:false`; resolved business `{success:false}` preserved in `data`)
- [x] Canonical response envelope consistent (`apiVersion:"1"`, `errors[]`)
- [x] All active pages source/test-proven unaffected (live = browser-smoke)
- [x] F1→F2 diff recorded, no regression
- [x] 7 registered, 0 active
- [x] Per-slice flag requirement defined
- [x] Cache disabled (TTL=0)
- [x] Golden 39/1/0; #34 Pending
- [ ] **Browser smoke** of the 22 pages with the Foundation present — **OPEN** (needs deployment; F5-class, Verification-Copy)
- [ ] **Per-slice flag** implemented — **API-2 work item**
- [ ] **requestId / server timing** — **API-2 hardening**

**Gate result:** **F2 PASS at source/test level.** API-2 (`getWeeklyShippingPlanWorkspace`) is authorized to begin **only after** a new user round, and its own F3 gate must add the browser-smoke + per-slice-flag + business-failure mapping items above.

---

*Companions:* `API_FOUNDATION_COMPATIBILITY_AUDIT.md`, `FUNCTIONAL_REACHABILITY_AUDIT.md` (F1 — not rewritten), `API_MIGRATION_MASTER_PLAN.md` §10.
