# F1-4B-FM6-R4E5C — Historical Allocation / Request-Order Collision Audit

**MODE:** AUDIT-ONLY · READ-ONLY · NO DESTRUCTIVE MIGRATION · NO DATA MUTATION
**Date:** 2026-08-12 · **R4E5B architecture:** FROZEN (not modified)

This round has two halves:

1. **Code-contract audit (§0, §3-logic, §7-ensure)** — executable in this repo; **DONE** below.
2. **Live row-level audit (§1–§5)** — requires the live Google Sheets DB rows for
   `request_order_allocation_drafts` / `request_orders` / `request_order_line_sources`.
   Those tables exist **only** in the live Apps Script spreadsheet; this repo holds code, not
   table data (the only local CSVs are `amazon_daily_sales_snapshot` and a logistics import
   template — neither is in scope). Therefore the live audit is **NOT AVAILABLE** in this
   environment and is delivered as an exact, ready-to-run **read-only diagnostic** in §D.

> **LIVE_PRODUCTION_COLLISION_AUDIT_NOT_AVAILABLE** *(from the repo environment — resolved live below)*

---

## LIVE RESULT — FROZEN (recorded 2026-08-12 under F1-4B-FM6-R4E5D)

The read-only diagnostic (`r4e5cCollisionAudit()` + `r4e5cSchemaColumnCheck()`) was run by the
USER against the live production spreadsheet. Verbatim result:

| Audit metric | Live count |
|---|---|
| §1 ACTIVE collisions (`ACTIVE_COUNT>1`) | **0** |
| §2 ROEXEC Request Orders (non-cancelled) | **0** |
| §2 duplicate ROEXEC execution keys | **0** |
| §2 legacy unresolved Request Orders (blank `source_ref_id`) | **6** |
| §3 dangling lineage | **0** |
| §3 allocation referenced by >1 distinct Request Order | **0** |
| §3 ROEXEC without source rows | **0** |
| §4A submitted allocation without lineage | **20** |
| §4C draft + site_confirmed collision (same grain) | **0** |
| §4D multiple active manual drafts | **0** |
| CAT-D critical | **0** |
| Schema: `request_order_line_sources.request_allocation_draft_id` | **ABSENT** (→ closed in R4E5D) |

**Classification of the non-zero rows — `HISTORICAL_IDENTITY_UNAVAILABLE` (NOT runtime corruption):**
- The **6 legacy unresolved Request Orders** and the **20 historical submitted allocations without
  new lineage** were created **before** the R4E5B execution-identity / lineage contract existed.
  Their allocation→Request-Order linkage was never persisted under any authority, so it cannot be
  reconstructed without guessing. Per the R4E5C/R4E5D negative constraints they are **NOT**
  matched, backfilled, cancelled, or rewritten — no dedupe by date/qty/SKU/series/timestamp/actor.
- ROEXEC count = 0 is expected: the exactly-once execution path had not yet run in production at
  audit time (and the lineage column was absent, so it could not have persisted lineage — see R4E5D).

**DECISION (frozen):** R4E5B architecture **APPROVED**. **No active collisions, no duplicate
executions, no CAT-D.** Destructive historical migration **performed = NO / authorized = NO**.
Remaining work = production schema closure + temp-diagnostic removal, executed in
[R4E5D_SCHEMA_CLOSURE_AND_FM6_AUDIT.md](R4E5D_SCHEMA_CLOSURE_AND_FM6_AUDIT.md).

---

## A. Release-contract audit (§0) — verified from source

Proven directly from the R4E5B runtime owners:

| # | Contract clause | Verdict | Authority (file:line) |
|---|---|---|---|
| A | New Send uses `source_ref_type = request_order_allocation_batch` | ✅ | `request-order.js:3068`; gate `13_procurement_handlers.gs:709,714` |
| B | `source_ref_id` is the deterministic `ROEXEC-*` key | ✅ | `roExecutionKey_` `13_:658-663`; stored `13_:906` |
| C | `request_order_line_sources` carries `request_allocation_draft_id` | ✅ | header `13_:57-67`; runtime ensure `13_:741`; write `13_:870` |
| D | `submitted` allocations are NOT in the ACTIVE lookup | ✅ | `recGenActiveHeadersForSku_` `47_:214` (`draft`/`site_confirmed` only) |
| E | No legacy path creates a 2nd `site_confirmed` beside an AI draft | ✅ | canonical → confirm-in-place same id `request-order.js:3007`; manual → deterministic id idempotent upsert `3019`, `_roManualDraftId_ :3389` |

**Exactly-once execution authority (unchanged, confirmed):**
- Idempotency key: `ROEXEC-<sha256(company | planning_cycle | series | sorted-unique draft-id set)>`
  — pure serializer `roExecCanonicalString_` (`13_:648-654`), independent of
  timestamp/actor/qty/row-order.
- Pre-check under ScriptLock: `roFindByExecutionKey_` (`13_:667`) → reuse (1) / `REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT` (>1) / create (0) — `handleCreateRequestOrderDraft_` `13_:710-729`.
- Compensation on write failure: `roDeleteRequestOrderById_` (`13_:686`) scoped to the one `request_order_id`.
- Submit-after-execution: allocation drafts advance to `submitted` **only after** the Request
  Order provably exists — `request-order.js:3077-3080`.

**Verdict: the R4E5B runtime owners are internally consistent. No architecture change proposed.**

## B. Canonical active grain (§1) — proven, not assumed

The production authority that decides "how many ACTIVE drafts exist for a logical unit" is
`recGenActiveHeadersForSku_` (`47_api_v1_recommendation_generation.gs:206-217`):

```
grain  = company + country + marketplace + sku   (+ planning_cycle when supplied, :212)
ACTIVE = status ∈ { draft, site_confirmed }        (:214)
```

A **collision** is `hs.length > 1` for that grain → surfaced today as `BLOCKED_CONFLICT`
(`47_:263`, `47_:343`). This is the exact grain the live diagnostic (§D) groups by — no guessing.

## C. Lineage-logic audit (§3) — invariants the diagnostic checks

- `request_order_line_sources.request_allocation_draft_id` is written **verbatim from the caller**
  (canonical DB truth), never derived from sku/status/time — `13_:868-870`.
- Column is runtime-ensured additively before any source write — `13_:741`.
- Expected invariants (checked live in §D §3): every non-blank lineage id resolves to a real
  `request_order_allocation_drafts` row; no draft id is referenced by **>1 distinct ROEXEC**
  Request Order (normally impossible under the key); no ROEXEC Request Order has zero source rows.

---

## D. Live diagnostic — user runs this (READ-ONLY; no mutation)

Because the row data is not reachable here, run the following **read-only** audit **once** against
the live spreadsheet. It only reads and `Logger.log`s a classification — it writes nothing (no
`setValue`, no `appendRow`, no delete, no schema change). Paste into a **temporary** script file
in the bound Apps Script project (or a standalone script bound to the same spreadsheet), run
`r4e5cCollisionAudit()`, read the Execution log, then **delete the temporary function** (do not
ship it). It reuses the exact grain and status semantics proven above.

```javascript
// F1-4B-FM6-R4E5C READ-ONLY historical collision audit. Reads + Logger.log only. Delete after running.
function r4e5cCollisionAudit() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function rows(name) {
    var sh = ss.getSheetByName(name); if (!sh) return { headers: [], data: [] };
    var v = sh.getDataRange().getValues(); if (v.length < 2) return { headers: (v[0] || []).map(String), data: [] };
    var h = v[0].map(function (x) { return String(x).trim(); });
    var out = []; for (var i = 1; i < v.length; i++) { var o = {}; for (var c = 0; c < h.length; c++) o[h[c]] = v[i][c]; out.push(o); }
    return { headers: h, data: out };
  }
  function s(v) { return String(v == null ? '' : v).trim(); }
  function lc(v) { return s(v).toLowerCase(); }

  var drafts = rows('request_order_allocation_drafts').data;
  var orders = rows('request_orders');
  var srcs   = rows('request_order_line_sources');
  var ACTIVE = { draft: 1, site_confirmed: 1 };

  // §1 ACTIVE collision by proven grain (company+country+marketplace+sku+planning_cycle)
  var byGrain = {};
  drafts.forEach(function (d) {
    if (!ACTIVE[lc(d.status)]) return;
    var k = [lc(d.company), lc(d.country), lc(d.marketplace), lc(d.sku), s(d.planning_cycle)].join('|');
    (byGrain[k] = byGrain[k] || []).push(d);
  });
  var collisions = [];
  Object.keys(byGrain).forEach(function (k) { if (byGrain[k].length > 1) collisions.push({ grain: k, rows: byGrain[k] }); });

  // §2 Request Order duplicate audit — split NEW (ROEXEC) vs LEGACY
  var ROTYPE = 'request_order_allocation_batch';
  var execGroups = {}, legacyUnresolved = 0, roexecCount = 0;
  orders.data.forEach(function (r) {
    var t = s(r.source_ref_type), id = s(r.source_ref_id), st = lc(r.request_status);
    if (st === 'cancelled') return;
    if (t === ROTYPE && id.indexOf('ROEXEC-') === 0) { roexecCount++; (execGroups[id] = execGroups[id] || []).push(r); }
    else if (!id) { legacyUnresolved++; } // LEGACY_EXECUTION_IDENTITY_UNRESOLVED — never weak-deduped
  });
  var dupExec = Object.keys(execGroups).filter(function (id) { return execGroups[id].length > 1; })
    .map(function (id) { return { execution_key: id, request_order_nos: execGroups[id].map(function (r) { return s(r.request_order_no); }) }; });

  // §3 lineage integrity
  var draftIdSet = {}; drafts.forEach(function (d) { draftIdSet[s(d.request_allocation_draft_id)] = 1; });
  var lineageByDraft = {}, dangling = [], roWithSources = {};
  srcs.data.forEach(function (r) {
    var did = s(r.request_allocation_draft_id), roId = s(r.request_order_id);
    if (roId) roWithSources[roId] = 1;
    if (!did) return;
    if (!draftIdSet[did]) dangling.push({ request_order_line_source_id: s(r.request_order_line_source_id), request_allocation_draft_id: did });
    (lineageByDraft[did] = lineageByDraft[did] || {})[roId] = 1;
  });
  var draftInMultiRO = Object.keys(lineageByDraft).filter(function (d) { return Object.keys(lineageByDraft[d]).length > 1; })
    .map(function (d) { return { request_allocation_draft_id: d, request_order_ids: Object.keys(lineageByDraft[d]) }; });
  var roexecRoIds = {}; orders.data.forEach(function (r) { if (s(r.source_ref_type) === ROTYPE && s(r.source_ref_id).indexOf('ROEXEC-') === 0) roexecRoIds[s(r.request_order_id)] = 1; });
  var roexecNoSources = Object.keys(roexecRoIds).filter(function (id) { return !roWithSources[id]; });

  // §4 lifecycle anomalies
  var submittedNoLineage = drafts.filter(function (d) { return lc(d.status) === 'submitted' && !lineageByDraft[s(d.request_allocation_draft_id)]; })
    .map(function (d) { return s(d.request_allocation_draft_id); });
  var draftBesideConfirmed = collisions.filter(function (c) {
    var hasDraft = false, hasConf = false; c.rows.forEach(function (r) { if (lc(r.status) === 'draft') hasDraft = true; if (lc(r.status) === 'site_confirmed') hasConf = true; });
    return hasDraft && hasConf;
  });
  var multiManualActive = collisions.filter(function (c) { return c.rows.filter(function (r) { return lc(r.generation_type) === 'user_created'; }).length > 1; });

  Logger.log('=== R4E5C READ-ONLY AUDIT ===');
  Logger.log('canonical active grain: company+country+marketplace+sku+planning_cycle | ACTIVE={draft,site_confirmed}');
  Logger.log('§1 active-draft collisions (ACTIVE_COUNT>1): %s', collisions.length);
  collisions.forEach(function (c) { Logger.log('  COLLISION %s :: %s', c.grain, c.rows.map(function (r) { return s(r.request_allocation_draft_id) + '[' + lc(r.status) + '/' + lc(r.generation_type) + ']'; }).join(', ')); });
  Logger.log('§2 ROEXEC request_orders (non-cancelled): %s', roexecCount);
  Logger.log('§2 duplicate execution-key groups (>1): %s', dupExec.length);
  dupExec.forEach(function (g) { Logger.log('  REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT %s -> %s', g.execution_key, g.request_order_nos.join(',')); });
  Logger.log('§2 LEGACY_EXECUTION_IDENTITY_UNRESOLVED (blank source_ref_id): %s', legacyUnresolved);
  Logger.log('§3 dangling lineage rows: %s', dangling.length);
  Logger.log('§3 draft referenced by >1 distinct Request Order: %s', draftInMultiRO.length);
  draftInMultiRO.forEach(function (x) { Logger.log('  MULTI-RO-LINEAGE %s -> %s', x.request_allocation_draft_id, x.request_order_ids.join(',')); });
  Logger.log('§3 ROEXEC Request Orders with zero source rows: %s', roexecNoSources.length);
  Logger.log('§4A submitted allocation w/o lineage: %s', submittedNoLineage.length);
  Logger.log('§4C draft beside site_confirmed (same grain): %s', draftBesideConfirmed.length);
  Logger.log('§4D multiple active manual drafts (same grain): %s', multiManualActive.length);
  var catA = draftBesideConfirmed.length, catD = dupExec.length, catC = legacyUnresolved > 0 ? 1 : 0;
  Logger.log('CLASSIFICATION → CAT-A(safe supersession candidates)=%s CAT-D(dup ROEXEC, CRITICAL)=%s CAT-C(legacy unresolved present)=%s',
    catA, catD, catC);
  Logger.log('DESTRUCTIVE MIGRATION PERFORMED = NO (read-only)');
}
```

**Also run the live schema-column check (§7):**

```javascript
function r4e5cSchemaColumnCheck() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('request_order_line_sources');
  if (!sh) { Logger.log('LIVE_SCHEMA_COLUMN_NOT_VERIFIED (sheet absent)'); return; }
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  Logger.log(h.indexOf('request_allocation_draft_id') !== -1 ? 'LIVE_SCHEMA_COLUMN_PRESENT' : 'LIVE_SCHEMA_COLUMN_NOT_VERIFIED (column absent — runtime ensure will add it on next allocation Send)');
}
```

### How to read the result

| Live output | Category | Action (separate authorization required) |
|---|---|---|
| all counts 0 | — | **Decision A** — no historical migration required |
| only §4C draft-beside-confirmed where the confirmed row has proven Request Order lineage | **CAT-A** | propose: keep executed authority, cancel redundant draft — **do NOT execute** |
| multiple active manual drafts, exactly one user-edited | **CAT-B** | human review picks authority |
| any `legacyUnresolved > 0` | **CAT-C** | no automatic migration (identity unproven) |
| any `dupExec > 0` | **CAT-D** | CRITICAL integrity — investigate, never auto-delete |
| anything else ambiguous | **CAT-E** | human review |

No dedupe by date/qty/series/timestamp/actor is performed anywhere — legacy identity is only
ever proven by a persisted `ROEXEC-*` key, never guessed.

---

## Completion report

1. **PRE / POST HEAD** — reported in the chat message (this round adds one doc-only commit).
2. **Canonical active allocation grain** — `company + country + marketplace + sku (+ planning_cycle)`; proven at `47_:206-217`.
3. **Active statuses** — `draft`, `site_confirmed` (`47_:214`).
4. **Active collision count** — **NOT COMPUTED HERE** (live data required) → run §D.
5. **Exact collision rows** — produced by §D `Logger.log` at runtime.
6. **ROEXEC Request Order count** — live-only (§D).
7. **Duplicate execution-key count** — live-only (§D).
8. **Legacy unresolved execution count** — live-only (§D).
9. **Lineage integrity result** — logic verified (§C); counts live-only (§D).
10. **Submitted-without-request anomalies** — live-only (§D §4A).
11. **Request-with-unsubmitted-allocation anomalies** — live-only (§D §4E).
12. **Category A/B/C/D/E counts** — live-only (§D classification table).
13. **Destructive migration performed** — **NO**.
14. **Schema column verification** — `LIVE_SCHEMA_COLUMN_NOT_VERIFIED` from this environment; runtime ensure present (`13_:741`); confirm live via `r4e5cSchemaColumnCheck()`.
15. **R4E5B release file verification** — present & consistent: `13_procurement_handlers.gs`, `47_api_v1_recommendation_generation.gs`, `assets/js/pages/request-order.js`, schema `request_order_line_sources.request_allocation_draft_id`.
16. **Files changed** — this doc only (`docs/planning/R4E5C_HISTORICAL_COLLISION_AUDIT.md`). No runtime code.
17. **Tests changed** — none.
18. **DB/schema impact** — none.
19. **Commit hash** — reported in the chat message.
20. **Recommended next slice** — run §D live; if all-zero → **Decision A**, authorize mainline = Procurement / PO workspace integration; else return the §D log for classification before any migration is authorized.

## Decision

**D — LIVE DATA NOT ACCESSIBLE.** Production audit procedure provided (§D); **no migration authorized**, none performed.

## FINAL GATE

NO DATA MUTATION ✓ · NO HISTORICAL GUESSING ✓ · NO WEAK DEDUPE ✓ · NO NEW EXECUTION ENGINE ✓ ·
R4E5B EXACTLY-ONCE AUTHORITY PRESERVED ✓ · LIVE ACCESS LIMITATION EXPLICIT ✓ · DESTRUCTIVE MIGRATION NOT RUN ✓
