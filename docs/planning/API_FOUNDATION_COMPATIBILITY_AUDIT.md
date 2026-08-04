# API Foundation Compatibility & Readiness Audit — Phase API-1.5 (2026-08-04)

> **Round:** API-1.5 — READ-ONLY compatibility audit + test hardening. **Scope guards:** no Workspace resolver implemented, no page cutover, no business endpoint, no `.gs` / bundle / Recommendation / Submit change, no flag flipped true by default, no live fetch / Spreadsheet.
> **Result:** **F2 COMPATIBILITY ESTABLISHED.** The Dormant API Foundation (API-1, `d957e45`) coexists safely with the legacy transport; one proven infrastructure defect (stale `KM.DB` capture) was fixed within the Foundation and test-covered. Golden 39/1/0; Scenario #34 Pending; pre-existing `replen-draft-completeness` P29–P31 unchanged.
> **PRE HEAD:** `d957e45` — *feat(api): add dormant zero-business-logic API foundation (Phase API-1)*.

---

## 1. Load-order audit (`index.html`) — SAFE

Actual browser `<script>` order (single tags, no defer/async):

| # | Script | Role |
|---|---|---|
| 371 | `core/namespace.js` | creates `window.KM` |
| 372 | `core/lifecycle.js` | |
| 373 | `core/state.js` | |
| … | utils/* | |
| 392 | `api/operation-system-db-api.js` | defines `window.KM.DB.*` + `WEB_APP_FETCH` |
| **394** | **`api/km-api-foundation.js`** | **Foundation (this work)** |
| 395–427 | `pages/*.js` | active pages |
| 428 | `js/app.js` | router/bootstrap |

- `window.KM` exists **before** the Foundation (namespace @371 < foundation @394). ✅
- `window.KM.DB` exists **before** the Foundation (api @392 < foundation @394). ✅
- **Exactly one** Foundation `<script>` (no duplicate load). ✅
- No `defer`/`async` on the Foundation tag → deterministic order. ✅
- `app.js` and every page load **after** the Foundation. ✅
- **No stale reference risk even if order changes:** the Foundation now resolves `KM.DB` **at call time** (§4), so a KM.DB attached/replaced after load is still honored.

*Verdict:* **SAFE, no load-order correction needed.** (Tests LO1–LO6.)

---

## 2. Namespace + re-initialization safety

| Scenario | Behavior | Proof |
|---|---|---|
| A `window.KM` absent before load | UMD does `window.KM = window.KM || {}` — no throw | NS (browser-sim) |
| B `KM` present, `KM.DB` absent | Foundation constructs; adapter resolves `{}` until DB attached | NS1 |
| C `KM.DB` present before Foundation | delegates immediately | FF2 |
| D `KM.DB` attached / **replaced** after Foundation | **resolved live on the next call** (fix) | NS1/NS2 |
| E Foundation loaded twice | `if (!window.KM.api)` guard → **existing instance kept** (idempotent attach) | NS5 |
| F partial remount | Foundation is stateless w.r.t. pages; nothing to leak | (source) |
| G full refresh | fresh deterministic construction | (source) |

- Loading the module **does not clobber** existing `KM` members (NS3). No duplicate Registry across loads (each instance seeds its own registry; `window.KM.api` is attach-guarded). No competing `KM.DB` is ever created.

*Verdict:* **SAFE.**

---

## 3. Feature-flag contract — deterministic, fail-closed

- Default `USE_WORKSPACE_API = false` (production). Model is a **single GLOBAL boolean** today (FF7).
- **flag = false:** every request → LegacyAdapter delegation; no resolver, no cache execution, payload shape unchanged, business errors observable. **Exactly one** legacy invocation per command — **no dual execution** (FF3).
- **flag = true:** registered-but-unimplemented workspace → `WORKSPACE_NOT_IMPLEMENTED`; unknown workspace → `UNKNOWN_WORKSPACE`; unknown command → `UNKNOWN_ACTION`. **No silent fallback to legacy** after a workspace path is selected (FF5). Forbidden ops stay blocked in both modes.
- **Per-slice readiness:** a single global boolean **cannot** enable Weekly Shipping alone without exposing the other six. The frozen future model (implement in **API-2**, not here) — see §7 of `API_FUNCTIONAL_COVERAGE_F2.md`:
  - keep the global master `USE_WORKSPACE_API` (default false) **AND** add a per-workspace enable map `{ weeklyShipping:true, … }`, default false, unlisted ⇒ false;
  - a workspace runs its resolver only if `master && map[name] && status==IMPLEMENTED`; else fail-closed legacy/`NOT_IMPLEMENTED`;
  - rollback = flip Weekly's map entry false. No per-command dual execution.

*Verdict:* **SAFE; per-slice enablement is an API-2 requirement (documented, not implemented).**

---

## 4. Foundation defect found + fixed — stale `KM.DB` capture

**Defect (proven):** API-1 captured the legacy authority once at factory construction (`var legacy = deps.legacy || window.KM.DB || {}`). A probe that constructed the Foundation **before** attaching `window.KM.DB` then read a workspace failed with `LEGACY_ADAPTER_MISSING` — the later-attached DB was invisible. This violates the audit requirement "*LegacyAdapter resolves the current active KM.DB authority*."

**Fix (infrastructure-only, test-covered):** the LegacyAdapter now calls `resolveLegacy()` **at call time** — returns an explicitly injected legacy (tests) or the live `window.KM.DB` otherwise. Also: `command`/`read` now return a **rejected Promise** (instead of a sync throw) on a missing/throwing legacy, so failures always compose into a structured `success:false` envelope. No active page code, no `.gs`, no business logic touched. Existing 56 API-1 tests still pass; new tests NS1/NS2 prove attach-after and replace-after both resolve live.

*Classification:* `FRONTEND_GITHUB_PAGES_REQUIRED` (Foundation source only). No other defect found.

---

## 5. Legacy Adapter parity + error observability — NO false-success

Representative delegation verified for Weekly Shipping / FC / Inventory / Request Order / PO / Shipment / SKU domains (via method delegation + payload pass-through):

- **Payload preserved**, single invocation, return value preserved (ER-series, FF2/FF3).
- **The compatibility boundary (chosen + documented):** `envelope.success` is **transport-level** ("the delegated call resolved without throwing"). It is **not** a reinterpretation of business status — doing so would be business logic, which the Foundation must not contain.
  - A **resolved** legacy `{success:false, error}` is **preserved verbatim in `envelope.data`** (ER1) — business status is **not lost** and **not converted** to a richer success.
  - A legacy **rejection / throw** becomes `envelope.success:false` with a structured `errors[]` (ER2/ER3) — **never masked**.
  - `null` / string / malformed legacy responses are preserved as `data` without crash or fabrication (ER4/ER5).
- Every failure envelope carries a machine-readable `errors[].code` (ER6) — the frontend distinguishes success/failure **without parsing message text**.
- **API-2 obligation:** when a page is cut over to `executeCommand`, that slice must map a resolved business `{success:false}` into `envelope.errors` (or the page must read `data.success`). Recorded as an API-2 gate in the F2 doc.

*Verdict:* **No false-success path. Dispatcher "never throws" does NOT create invisible failure** — it converts every rejection/throw into a visible `success:false` envelope.

---

## 6. Forbidden-op guard vs all Router actions — 0 false positives / 0 false negatives

Cross-checked the client guard against **all 62** live `01_router.gs` actions (API-0 recorded 61; `importFcSpecialEventsBatch` was added later):

| Classification | Count | Notes |
|---|---|---|
| Correctly ALLOWED (business actions) | **62 / 62** | incl. `create*` domain actions (`createRequestOrderDraft`, `createPurchaseOrderFromRequest`, `createShippingPlansBatch`) — **not** false-positives |
| Correctly BLOCKED (structural/schema/migration) | n/a among Router actions | none of the 62 is a structural/schema op |
| Ambiguous / false positive / false negative | **0** | |

Structural/schema/migration verbs **are** blocked including case/space variants (`createSheet`, `CREATESHEET`, `  migrate  `, `appendHeader`) — GD3. The guard mirrors 100% of KMSAFE `STRUCTURAL_OPS` + `WHOLE_SHEET_OPS` (21/21, API-1 test G5). **The client guard never replaces server-side KMSAFE (S0/S0.5)** — every backend write still requires server validation; the guard is a redundant fail-closed pre-filter.

*Verdict:* **SAFE — no legitimate action blocked; every structural/schema op refused.**

---

## 7. Active-page non-impact (source-proven) + cache / serialization / transport

- **Pages:** every `assets/js/pages/*.js` module (and `app.js`) source-scanned — **none references `KM.api` / the Foundation** (PG1/PG2). Pages are `UNAFFECTED_SOURCE_PROVEN`; live rendering is `NEEDS_BROWSER_SMOKE` (no deployment/browser evidence this round — honestly flagged).
- **Cache:** TTL=0 → `set` no-op, `get` miss, `meta.cached=false` (CA1/CA2). API-2 can add targeted caching without changing business DTOs.
- **Serialization:** `undefined`→`null`, non-finite detail→JSON `null`, JSON-safe envelopes; a genuinely circular detail throws at `JSON.stringify` (caller-visible, never a silent "success") — SZ1–SZ3.
- **Transport:** `configured()==false` while dormant; GET/POST without `baseUrl` reject with `TRANSPORT_NOT_CONFIGURED`; no secrets, no auto-retry on writes, no auto URL discovery; legacy remains the only active transport while flag false (TR1–TR3).
- **Zero-I/O init:** constructing the Foundation issues **zero** legacy calls (IO1).

---

## 8. Response-envelope + apiVersion decision (contract clarification)

Canonical envelope (frozen, single variant — **no second undocumented variant exists**):
```
success: boolean            // transport-level (see §5)
data:    <payload> | null
meta:    { apiVersion:"1", source, mode, workspace, action, cached:false, requestId?, ... }
errors:  [ { code, message, details } ]   // [] on success
```
- **`apiVersion` = the string `"1"`** (not `"v1"`) — decided canonical. Document version numbers like "Draft v1.5" in other specs are unrelated.
- **`errors[]` array** (not a singular `error`) is canonical. `API_MIGRATION_MASTER_PLAN.md` §6 was already reconciled to `{success,data,meta,errors}` in API-1; `API_FOUNDATION_ARCHITECTURE.md` clarified in §7/§8 accordingly.
- **requestId / timing:** the current Foundation does **not** emit `requestId` / `serverDurationMs` and **does not claim to** — classified as an **API-2 hardening requirement** (client `requestId` for correlation; server timing owned by the server, never fabricated on the client). Not an F2 blocker. `requestId` ≠ idempotency key.

---

## 9. Defects, changes, tests

- **Foundation defects found:** 1 (stale `KM.DB` capture). **Fixed:** 1 (call-time resolution + rejected-promise adapter). Both test-covered.
- **Tests:** NEW `assets/tests/km-api-foundation-compat.test.js` (**41 assertions, 0 failed**) executing the real Foundation source. Existing `km-api-foundation.test.js` (**56/0**) unchanged and still green. Combined API-foundation assertions = **97**.
- **Regression:** full suite — total `FAIL` lines = 3, all from the pre-existing `replen-draft-completeness` P29–P31 (honestly reported, unrelated). Golden 39/1/0; Scenario #34 Pending.

---

## 10. Release classification

| File | Classification |
|---|---|
| `assets/js/api/km-api-foundation.js` (defect fix) | `FRONTEND_GITHUB_PAGES_REQUIRED` |
| `assets/tests/km-api-foundation-compat.test.js` (new) | `GIT_ONLY` |
| `assets/tests/km-api-foundation.test.js` (unchanged) | `GIT_ONLY` |
| `docs/planning/API_FOUNDATION_COMPATIBILITY_AUDIT.md` (new) | `DOCUMENTATION_ONLY` |
| `docs/planning/API_FUNCTIONAL_COVERAGE_F2.md` (new) | `DOCUMENTATION_ONLY` |
| `docs/planning/API_MIGRATION_MASTER_PLAN.md` (update) | `DOCUMENTATION_ONLY` |
| `docs/planning/API_FOUNDATION_ARCHITECTURE.md` (update) | `DOCUMENTATION_ONLY` |

**No** `APPS_SCRIPT_SYNC_REQUIRED`, **no** `BUNDLE_REBUILD_REQUIRED`. Manual, user-controlled release (`DEPLOYMENT_RELEASE_GOVERNANCE.md`). Not pushed, not deployed.

---

*Companions:* `API_FUNCTIONAL_COVERAGE_F2.md`, `API_FOUNDATION_ARCHITECTURE.md`, `API_MIGRATION_MASTER_PLAN.md`, `FUNCTIONAL_REACHABILITY_AUDIT.md` (F1). F1 baseline is **not** rewritten.
