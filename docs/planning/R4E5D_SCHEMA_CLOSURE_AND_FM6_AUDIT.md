# F1-4B-FM6-R4E5D — Production Schema Closure + FM6 Closure Audit

**MODE:** MINIMAL · NO HISTORICAL DATA GUESSING · NO BUSINESS-LOGIC CHANGE
**Date:** 2026-08-12 · **Baseline:** R4E5B `b43e666` · R4E5C `d3dcc4f` · R4E5C-LIVE-PREP `e414c25`

Live audit is frozen in
[R4E5C_HISTORICAL_COLLISION_AUDIT.md](R4E5C_HISTORICAL_COLLISION_AUDIT.md) → **R4E5B APPROVED**;
0 active collisions, 0 duplicate ROEXEC, 0 CAT-D; the 6 legacy Request Orders + 20 historical
submitted allocations are `HISTORICAL_IDENTITY_UNAVAILABLE` and are **not** touched. This doc
performs the only remaining work: **production schema closure** and **temp-diagnostic removal**,
plus the FM6 closure audit.

---

## 1. Schema-management owner (STEP 2 audit) — found; reused, not reinvented

The repo has **one** authorized additive-column owner, layered under the production-safety adapter:

| Layer | Function | Behavior |
|---|---|---|
| Runtime **assertion** (NOT an adder) | `sheetEnsureColumns_` → `prodRequireColumns_` [29_:69](../../assets/specs/active/apps-script/29_production_safety_adapter.gs#L69) | **Throws** `MISSING_REQUIRED_HEADER` if a column is absent; **never adds** it. |
| Authorized **additive migration** | `prodMigrateAppendColumns_(sheet, names, migrationAuth)` [29_:103](../../assets/specs/active/apps-script/29_production_safety_adapter.gs#L103) | Appends **only** missing header cells (`getRange(1, live.length+1, …).setValues([missing])`); **no data-row write, no backfill**. Requires a valid Migration DTO. |
| DTO validator | `KMSAFE.validateMigrationAuthorization` [supply-planning-production-safety.js:216](../../assets/js/core/supply-planning-production-safety.js#L216) | Requires `migrationId, expectedSpreadsheetId, expectedSheetName, expectedOldHeaderHash, expectedNewHeaderHash, backupReference, execute(boolean), actor`. A boolean is never sufficient. |

**Root cause the live audit exposed:** R4E5B calls `sheetEnsureColumns_(srcSheet, ['request_allocation_draft_id'])`
inside `roCreateRequestOrderCore_` ([13_:741](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L741))
wrapped in `try { … } catch (eCol) { /* best-effort */ }`. Because that helper is an **assertion**,
on a live sheet lacking the column it **throws and is swallowed** — the column is never created, and
`procurementAppendByHeader_` (which writes only physically-present columns) silently drops the lineage
value. That is why the live schema check returned **ABSENT**, and why the column must be closed by an
**explicit one-time authorized migration** before production Send execution can persist lineage.

**Decision:** reuse `prodMigrateAppendColumns_` (the existing owner). **No second migration engine,
no new idempotency table, no new execution key.** The canonical header registry already lists the
column (`REQUEST_ORDER_LINE_SOURCES_HEADERS_` [13_:57-67](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L57-L67));
R4E5B). Only the physical live sheet needs the one additive header cell.

> Because this is achievable through the existing authorized owner without any row mutation, there is
> **no** `R4E5D_SCHEMA_INITIALIZATION_OWNER_GAP`. HALT not required.

## 2. Production schema-closure procedure (STEP 2/3) — USER-run, additive header only

Run **once** in the production Apps Script editor (all runtime dependencies — `prodMigrateAppendColumns_`,
`prodSafetyBundle_`/`KMSAFE` — are already deployed in `29_` and the bundle). It appends **one header
cell** and writes **no data rows** and **no backfill**. Supply a real `backupReference` (a manual
copy/snapshot of the spreadsheet you took first) — the DTO validator rejects a blank one.

```javascript
// F1-4B-FM6-R4E5D TEMPORARY one-shot schema closure. Reuses the EXISTING authorized additive-column
// owner (prodMigrateAppendColumns_ + KMSAFE.validateMigrationAuthorization). Additive header ONLY:
// no setValues on data rows, no appendRow, no backfill, no fake draft ids, no Request Order created.
// Delete after running. backupReference MUST be a real pre-migration backup you already made.
function r4e5dCloseLineageSchema(backupReference) {
  var backup = String(backupReference || '').trim();
  if (!backup) { Logger.log('ABORT: pass a real backupReference (e.g. the name/URL of your pre-migration copy).'); return; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('request_order_line_sources');
  if (!sh) { Logger.log('SHEET_ABSENT — request_order_line_sources will be created WITH the column on first allocation Send; no migration needed now.'); return; }

  var live = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(function (h) { return String(h).trim(); });
  if (live.indexOf('request_allocation_draft_id') !== -1) { Logger.log('ALREADY_PRESENT — no change made.'); return; }

  var S = prodSafetyBundle_();                       // the deployed KMSAFE bundle (existing owner)
  var newHeaders = live.concat(['request_allocation_draft_id']);
  var dto = {
    migrationId: 'R4E5D-ADD-REQUEST-ALLOCATION-DRAFT-ID',
    expectedSpreadsheetId: ss.getId(),
    expectedSheetName: 'request_order_line_sources',
    expectedOldHeaderHash: S.headerHash(live),
    expectedNewHeaderHash: S.headerHash(newHeaders),
    backupReference: backup,
    execute: true,
    actor: (Session.getActiveUser() && Session.getActiveUser().getEmail()) || 'request-order-admin'
  };
  var added = prodMigrateAppendColumns_(sh, ['request_allocation_draft_id'], dto);  // authorized additive header append
  Logger.log(added > 0 ? 'MIGRATED: appended request_allocation_draft_id (additive header only).' : 'NO_CHANGE (already present).');
}
```

**STEP 3 verification (read-only):** after running the closure, run `r4e5cSchemaColumnCheck()` (below)
and confirm it logs **`LIVE_SCHEMA_COLUMN_PRESENT`**. The check never writes.

## 3. Historical compatibility (STEP 4) — proven, no retrofit

- **Legacy rows with blank `request_allocation_draft_id` remain valid.** Every source-row reader passes
  the value through `r4e2Str_` (blank → `''`) and never requires it — e.g. `recGenLinesForDraft_`
  ([47_:219-230](../../assets/specs/active/apps-script/47_api_v1_recommendation_generation.gs#L219-L230))
  keys on `request_allocation_draft_id` only to *match forward-written* lineage; a blank historical row
  simply doesn't participate in new lineage joins. No reader throws on blank. The 6 legacy Request
  Orders and 20 historical submitted allocations are **not** retrofitted.
- **New R4E5B executions populate the exact id.** The frontend sends `request_allocation_draft_id: d.allocDraftId`
  on every line ([request-order.js:2964](../../assets/js/pages/request-order.js#L2964)); the backend writes it
  verbatim ([13_:870](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L870)) — **once the physical
  column exists** (this closure). It is never derived from sku/status/time; blank only for pre-contract history.

## 4. FM6 closure audit (STEP 6) — final chain verified from source

`AI Plan → canonical allocation draft → persisted recommended_qty → editable persisted order_qty →
site_confirmed → deterministic ROEXEC execution → Request Order → submitted`

| # | Claim | Verdict | Authority |
|---|---|---|---|
| 1 | One active allocation authority per grain | ✅ | `recGenActiveHeadersForSku_` [47_:206-217](../../assets/specs/active/apps-script/47_api_v1_recommendation_generation.gs#L206-L217); live collisions = 0 |
| 2 | AI Plan + Send never create competing drafts | ✅ | canonical → confirm-in-place same id [request-order.js:3007](../../assets/js/pages/request-order.js#L3007); manual → deterministic id idempotent upsert [3019](../../assets/js/pages/request-order.js#L3019) |
| 3 | Send quantity = persisted `order_qty` | ✅ | `requested_qty: l.orderQty` [request-order.js:2960](../../assets/js/pages/request-order.js#L2960) (no live recompute) |
| 4 | `recommended_qty` immutable snapshot | ✅ | never sent by Send; server holds it immutable within a draft_version (a user edit updates `order_qty` only — [15_:56-57](../../assets/specs/active/apps-script/15_request_allocation_handlers.gs#L56-L57)) |
| 5 | Deterministic ROEXEC prevents duplicate Request Orders | ✅ | `roExecutionKey_` + pre-check `handleCreateRequestOrderDraft_` [13_:710-729](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L710-L729); live dup ROEXEC = 0 |
| 6 | Allocation lineage persisted for new executions | ✅ | write [13_:870](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L870), **after schema closure** (§2) |
| 7 | `submitted` only after successful Request Order execution | ✅ | submit-after-execution [request-order.js:3077-3080](../../assets/js/pages/request-order.js#L3077-L3080) |
| 8 | Retry / double-click / two-tab converge | ✅ | ScriptLock + reuse-by-key [13_:718-728](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L718-L728) |
| 9 | `submitted` leaves the ACTIVE set | ✅ | ACTIVE = {draft, site_confirmed} only [47_:214](../../assets/specs/active/apps-script/47_api_v1_recommendation_generation.gs#L214); submitted reported via `submittedSkus` [47_:240-251](../../assets/specs/active/apps-script/47_api_v1_recommendation_generation.gs#L240-L251) |
| 10 | Historical blank lineage remains readable | ✅ | §3 above |
| 11 | No frontend recommendation/gap recomputation | ✅ | Send uses persisted `order_qty`; no gap/recommendation math in `handleSendRequest` |
| 12 | No second request-order execution engine | ✅ | single owner `handleCreateRequestOrderDraft_`; this round adds none |

**FM6 chain integrity: CONFIRMED.** Exactly-once authority = deterministic `ROEXEC-*` key
(`source_ref_type=request_order_allocation_batch`, `source_ref_id=ROEXEC-…`). Lifecycle authority =
allocation status `draft → site_confirmed → submitted`. Quantity authority = persisted `order_qty`.
`recommended_qty` = immutable snapshot.

## 5. Preserved read-only diagnostic (STEP 5) — for future audits

The temporary runtime file `assets/specs/active/apps-script/99_r4e5c_live_audit_temp.gs` is **removed**
from the source tree this round (it must not become permanent architecture). Its READ-ONLY code is
preserved here for re-running future audits — paste temporarily, run, delete.

```javascript
// READ-ONLY: verify only whether the lineage column exists (never adds it).
function r4e5cSchemaColumnCheck() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('request_order_line_sources');
  if (!sh) { Logger.log('LIVE_SCHEMA_COLUMN_NOT_VERIFIED (sheet absent)'); return; }
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  Logger.log(h.indexOf('request_allocation_draft_id') !== -1
    ? 'LIVE_SCHEMA_COLUMN_PRESENT'
    : 'LIVE_SCHEMA_COLUMN_NOT_VERIFIED (column absent — run r4e5dCloseLineageSchema)');
}
```

The full `r4e5cCollisionAudit()` body is preserved verbatim in the fenced block of
[R4E5C_HISTORICAL_COLLISION_AUDIT.md §D](R4E5C_HISTORICAL_COLLISION_AUDIT.md#d-live-diagnostic--user-runs-this-read-only-no-mutation).

---

## USER exact production steps

1. **Back up first** — make a manual copy/snapshot of the production spreadsheet; note its name/URL.
2. In the production Apps Script editor, paste the `r4e5dCloseLineageSchema` function from §2 (temporary).
3. **Run** `r4e5dCloseLineageSchema('<your backup name/URL>')`. Read the log → expect `MIGRATED:` (or `ALREADY_PRESENT`).
4. Run `r4e5cSchemaColumnCheck` (already in the pasted `99_` file, or paste from §5). Read the log → expect **`LIVE_SCHEMA_COLUMN_PRESENT`**.
5. **Delete** the temporary `99_r4e5c_live_audit_temp.gs` file **and** the `r4e5dCloseLineageSchema` function from the production Apps Script project.
6. No deployment version is required — both were run manually from the editor and are not wired to the web-app router.

No destructive migration, no row writes, no backfill were performed at any step.

## Completion report

1. **PRE/POST HEAD** — in chat (this round: doc updates + temp-file removal).
2. **Live audit conclusion recorded** — YES (R4E5C doc "LIVE RESULT — FROZEN").
3. **Active collision count** — 0. 4. **Duplicate ROEXEC** — 0. 5. **Legacy unresolved** — 6.
6. **Submitted historical no-lineage** — 20 (`HISTORICAL_IDENTITY_UNAVAILABLE`).
7. **Destructive migration performed** — **NO**.
8. **Schema owner found** — `prodMigrateAppendColumns_` + `KMSAFE.validateMigrationAuthorization` (existing).
9. **Schema init mechanism** — one-shot USER-run `r4e5dCloseLineageSchema` reusing that owner; additive header only.
10. **Additive column status** — closure defined; live becomes PRESENT after step 3 (was ABSENT).
11. **Historical blank-lineage compatibility** — proven readable; no retrofit.
12. **New-execution lineage proof** — [request-order.js:2964](../../assets/js/pages/request-order.js#L2964) → [13_:870](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L870) (post-closure).
13. **Temporary diagnostic removed** — YES (`99_…` git-removed; USER deletes editor copy after step 4).
14. **FM6 final chain** — confirmed (§4, all 12).
15. **Exactly-once authority** — deterministic `ROEXEC-*` key.
16. **Lifecycle authority** — `draft → site_confirmed → submitted`.
17. **Quantity authority** — persisted `order_qty`.
18. **recommended_qty authority** — immutable snapshot.
19. **Files changed** — this doc (new); R4E5C doc (live result); removed `99_r4e5c_live_audit_temp.gs`.
20. **Tests** — R4E4 28/28, R4E5B 40/40; full regression 192 pass / 4 known baseline.
21. **Full regression** — 192 pass / 4 fail (baseline: gap-job-done-notice, order-planning-monthly-projection-consumer, replen-header-toggle, supply-planning-route-inventory).
22. **Apps Script sync required** — NO permanent runtime change; USER runs the manual schema-closure once (no file to sync into shipping runtime).
23. **Frontend deploy required** — NO. 24. **Bundle rebuild required** — NO (no `assets/js/core/*` change).
25. **DB/schema impact** — one additive header (`request_order_line_sources.request_allocation_draft_id`) via authorized migration; no row mutation, no backfill.
26. **USER exact production steps** — see the list above.
27. **Commit hash** — in chat.
28. **Next authorized slice** — Procurement / PO workspace integration (NOT started here).

## FINAL GATE

R4E5B APPROVED ✓ · NO DESTRUCTIVE MIGRATION ✓ · NO HISTORICAL GUESSING/BACKFILL ✓ ·
EXISTING SCHEMA OWNER REUSED (no new engine) ✓ · ADDITIVE HEADER ONLY ✓ · HISTORICAL BLANK LINEAGE READABLE ✓ ·
NEW-EXECUTION LINEAGE REQUIRED POST-CLOSURE ✓ · TEMP DIAGNOSTIC REMOVED ✓ · FM6 CHAIN CONFIRMED ✓ ·
NO FORMULA/PLANNING/INVENTORY/SHIPMENT/PO CHANGE ✓
