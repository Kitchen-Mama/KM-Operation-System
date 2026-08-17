# F1-7M-A-P0-SERIAL-REQUEST-ELIMINATION-R1

**Mode:** AUDIT → ATOMIC IMPLEMENTATION → VALIDATION. Remove proven-unnecessary SERIAL request latency only.
**PRE HEAD:** `cad7b6e` · **Baseline:** `F1_7M_PERFORMANCE_AND_INTERACTION_BASELINE_R1.md`.
**Outcome:** ONE runtime change shipped (A1). A2 and FC audited → both left runtime-UNCHANGED with source-grounded classifications (A2 HALT, FC deferred).

Frozen invariants (unchanged): `WRITE_FORCES_FULL_RELOAD=0` · `ACTIVE_PRIMARY_BROAD=0` · `ACTIVE_SECONDARY_BROAD=0` · `APP_PRIME_READ_DEPENDENCY=0` · `CANONICAL_STARTUP_WHOLE_DB_PRIME=0`. No business authority / formula / schema / API-contract change.

---

## §1 — TARGET A1 · RO / AI-Plan first-open serial → parallel — IMPLEMENTED

### Root cause (BEFORE)
`assets/js/pages/request-order.js:initRequestOrderSection` routed the canonical first-open as:

```
_roLoadMarketplaceRef_().then(function () { _opLoadFirstLayerComposer_(); });
```

The bounded **marketplace reference** read (`KM.DB.getMarketplaceReference` → `getTable('marketplaces')`) and the **first-layer composer** read (`KM.DB.getAiPlanFirstLayer` → 56_ composer) are **independent** scoped reads, yet the composer request was withheld until the marketplace read resolved — a pure serial hop. The composer's `.then` renders via `_roRenderAll` → `_roRebuildMarketplaceDropdown`, which needs `_roMarketplaceRef` populated; that render-ordering dependency was the *only* reason for the serialization (not a data dependency).

### Change (AFTER)
Both reads now start in the **same synchronous wave**; the composer receives the ref promise as a **render gate** so the first `_roRenderAll` still waits for the marketplace dropdown data — identical render ordering, one fewer serial network hop.

```
if (_opUseFirstLayerComposer() && _opFirstLayerReady()) {
  var _mktRefPromise = _roLoadMarketplaceRef_();     // getMarketplaceReference() fires now
  _opLoadFirstLayerComposer_(_mktRefPromise);        // getAiPlanFirstLayer() fires now (same tick)
  return;
}
```

`_opLoadFirstLayerComposer_(refGate)` gains an **optional** gate param:
- **First-open** (gate supplied): on composer SUCCESS the READY/EMPTY render is deferred behind `Promise.resolve(refGate)` (the ref loader ALWAYS resolves — failure → `[]` — so it never blocks indefinitely). Stale-seq guard re-checked *after* the gate.
- **Reload/refresh** (`_roReloadAndRerender`, no gate): render stays synchronous inside the composer `.then` — byte-identical to prior behavior (the ref is already loaded at mount).
- **Composer FAILURE**: `_opFirstLayerError_` fires immediately, independent of the ref (bounded ERROR state unchanged).

### Request/wave proof
| metric | BEFORE | AFTER |
|---|---|---|
| `RO_FIRST_OPEN_REQUEST_COUNT` | 2 | **2** (unchanged — this is latency sequencing, NOT request elimination) |
| `RO_FIRST_OPEN_SERIAL_WAVES` | 2 (marketplace → composer) | **1** (both in flight together) |
| requests actually parallel? | no | **yes** |
| render waits for both? | yes (serially) | **yes** (gated) |
| error behavior equivalent? | — | **yes** (composer error path unchanged; ref failure → `[]`, never blocks) |

Latency win ≈ one marketplace-reference round-trip removed from the first-open critical path. `LIVE_MEASUREMENT_REQUIRED` for the absolute ms (agent has no production access).

---

## §2 — TARGET A2 · RO Send hidden token fetch — **HALT `RO_SEND_TOKEN_EQUIVALENCE_NOT_PROVEN`** (runtime UNCHANGED)

### Baseline premise vs. source (audit)
The F1-7M baseline (§ line 57) stated the manual Send path "always omits [`expectedToken`] though the grid already holds a token via `_roEnsureDraftToken_`." **Source audit disproves this:**

- `KM.DB.upsertRequestOrderAllocationDraftLines` (operation-system-db-api.js:3364) fetches `getRecommendationDraftToken('MONTHLY_ORDER', draftId)` **only when `payload.expectedToken === undefined`** — a fail-closed read-before-write conflict guard.
- Its **only** caller in `request-order.js` is the Send loop's **manual branch** (`d.isCanonical === false`, line ~3142). That branch creates a brand-new manual draft (`draft_version: 1`) and writes its lines. It does **NOT** call `_roEnsureDraftToken_` and holds **no** token.
- `_roEnsureDraftToken_` is called in exactly two places — the **canonical** confirm branch (line 3117) and the inline order-qty edit (line 3571) — **neither of which calls the lines-writer.** For a manual SKU, `_roEnsureDraftToken_` would return `null` anyway (`_roCanonicalDraftBySku` has no entry).

### Why no safe change exists
1. **No held token to pass** — the manual Send path has none; the db-api's single token GET is the *only* token read for that draft, i.e. **necessary, not redundant**. Obtaining it explicitly in the frontend first would issue the **same** `getRecommendationDraftToken` GET → **zero** net request reduction.
2. **Skipping it (passing `expectedToken: null`)** would make `null !== undefined`, disabling the db-api read-before-write AND sending a null token to the server → **bypasses optimistic locking**. Forbidden by §0 ("No weakening of conflict/token protection") and §3 ("Do not bypass optimistic locking").

§2 requires proving the Send flow *holds the same optimistic-lock authority the writer expects*. It holds none. Per §3, the correct outcome is **HALT `RO_SEND_TOKEN_EQUIVALENCE_NOT_PROVEN`** — no change. The manual lines-writer call site is left exactly as-is (verified: still passes no `expectedToken`; db-api guard intact). `RO_SEND_HIDDEN_TOKEN_FETCH_COUNT` remains **1 per manual draft** (necessary) — **not** reducible without weakening locking.

> Note for a future round: the only *legitimate* way to drop that GET would be a backend contract change so the lines-writer accepts a freshly-created draft (version 1) without a re-read, or returns the token from the header create — both are authority/contract changes out of scope for a frontend serial-elimination task.

---

## §4/§5 — FC Special Event — **`BATCH_ENDPOINT_REQUIRED`** (runtime UNCHANGED, deferred)

### Audit
`fc-summary.js:saveFcEvent` layer-3 writes events serially: `for (…) { await DB.upsertFcSpecialEvent(…) }` (one HTTP write per SKU). Backend chain: router `upsertFcSpecialEvent` → `handleUpsertFcSpecialEvent_` → `fcSpecialEventUpsert_` (14_fc_write_handlers.gs).

| dimension | finding |
|---|---|
| writer action | `fcSpecialEventUpsert_` — read whole-sheet snapshot → find row by `event_fc_id` / business key → **`sheet.appendRow`** (create) or `setCell` (update) |
| idempotency / uniqueness key | `campaign_id + campaign_sku_line_id` (distinct per line); backend owns `event_fc_id` PK; retry find-or-updates same row |
| LockService | **NONE** in 14_fc_write_handlers.gs. Router's only `LockService` is the recommendation-generation bridge (comment: "Legacy … unlocked writers remain for compatibility"). |
| can simultaneous writes race? | **YES** — concurrent Apps Script executions doing read-scan-then-`appendRow` on the same unlocked sheet can collide (lost/overwritten rows). Distinct business keys prevent *dedup* collisions but not the physical **append** race. |
| ordering / shared state | layers 1–2 (`upsertCampaign`, `upsertCampaignSkuLines`) are hard dependencies (provide `campaign_id` / line ids) — must stay serial before layer 3. |
| partial-failure semantics | serial loop stops on first throw; already-written events persist (idempotent on retry); `_fcAfterWrite` runs only on full success. |

### Classification: `BATCH_ENDPOINT_REQUIRED`
Not `SAFE_PARALLEL_EXISTING_WRITES` — the existing writer is unlocked, so firing `Promise.all` over the per-SKU writes would introduce a concurrent-append race. §5 forbids parallelizing in that case. A safe fix requires a **single-execution batch endpoint** that writes all `fc_special_events` lines for a campaign in one server call (one append transaction), eliminating both the N serial round-trips and the race. **Not built in this task** (§5). Runtime left serial + unchanged.

**Deferred batch contract** → `F1-7M-A2-FC-SPECIAL-EVENT-BATCH-R1`:
- New action `upsertFcSpecialEventsBatch` (or extend the existing handler): body `{ campaign_id, lines: [{ campaign_sku_line_id, company, country, marketplace, marketplace_id, scope_type, scope_id, sku, series, category, event_name, event_period, event_start_date, event_end_date, event_month, year, fc_qty, source, note }] }`.
- Server: acquire `LockService.getScriptLock()`, read the sheet **once**, upsert each line by `campaign_id + campaign_sku_line_id` (find-or-append within the single locked execution), return `{ lines: [{ sku, event_fc_id, created }] }`.
- Frontend: replace the layer-3 `for … await` loop with one batch call; preserve per-line idempotency, all payload fields, `_fcAfterWrite` readback, honest partial/total failure reporting. Requires an Apps Script deployment (backend change) — hence a separate task, not this frontend round.

---

## §6 — Request/wave summary

| flow | metric | BEFORE | AFTER |
|---|---|---|---|
| RO first-open | serial waves | 2 | **1** |
| RO first-open | request count | 2 | 2 (unchanged; sequencing only) |
| RO Send | hidden token fetch / manual draft | 1 | **1** (necessary — HALT, unchanged) |
| RO Send | request count | ~13 | ~13 (unchanged) |
| FC special event | serial waves (layer 3) | N (per SKU) | N (unchanged — deferred to batch) |

## §7 — Error / UX semantics
A1: no partial render (render gated on both), no uncaught rejection (ref loader self-catches), no permanent loading (ref always resolves), no duplicate composer request (single call; stale-seq guard preserved), composer error wording unchanged. A2 / FC: runtime untouched → semantics identical.

## §10 — Deployment classification
Apps Script sync = **NO** · router = **NO** · new /exec = **NO** · DB/schema = **NONE** · bundle = **NO** · **frontend deploy = YES**.
Frontend files changed: `assets/js/pages/request-order.js` (A1 only).
Test/doc files: `assets/tests/api-serial-request-elimination-f1-7m-a-r1.test.js` (new), `assets/tests/api-ai-plan-first-layer-composer-f1-7e-prereq5-r1.test.js` (contract update to the parallel shape), this doc, master-plan delta.

## Tests
- New focused: `api-serial-request-elimination-f1-7m-a-r1.test.js` — 28/0 (A1 structural + behavioral parallel-start / render-gate / single-request / bounded-error / stale-seq; A2 HALT lock-in; FC BATCH classification; invariants).
- Contract update: composer suite → 154/0 (parallel-wave assertion).
- Full regression: **232 suites pass; 4 fail = the 4 known historical baseline failures** (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`). **Zero new failures.**

## Rollback
Revert the single commit. A1 is isolated to `request-order.js` first-open wiring + the optional `refGate` param (backward-compatible: no-gate callers unchanged). No backend/schema/bundle surface touched.

## Risk / HALT tokens
`RO_SEND_TOKEN_EQUIVALENCE_NOT_PROVEN` (A2 — intentional, source-grounded; no change made). FC = `BATCH_ENDPOINT_REQUIRED` (deferred to `F1-7M-A2-FC-SPECIAL-EVENT-BATCH-R1`).
