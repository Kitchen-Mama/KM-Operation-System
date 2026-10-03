# S8 Standing DB Authorization Gate

**Status:** STANDING GOVERNANCE — authoritative for S8-R3A and every remaining S8 round.
**Frozen:** 2026-10-03, against frontend `26e5f10`, backend `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40`, contract `18`.

This gate does not expire with the round that created it and does not need restating in a later prompt. Where
a task instruction and this gate could be read two ways, **the more restrictive data-safety reading wins and
the round STOPS for operator approval.**

> **A note on provenance.** The operator's governance message carried the placeholder
> `[PASTE THE FULL "STANDING S8 OPERATOR DB AUTHORIZATION GATE" BELOW]` with no text under it. The §4 block of
> the same round is titled *STANDING S8 DB AUTHORIZATION GATE* and contains the full field list and rules, so it
> is taken as the referent and is reproduced here. If different text was intended, this document is wrong and
> must be replaced before the next round runs.

---

## 1 — The rule

**Before EVERY remaining S8 execution round, produce a DB TOUCH PREFLIGHT and STOP for operator approval.**

For every physical table the round will touch:

```
TABLE                   =
CLASSIFICATION          =   PROTECTED_MASTER | TEST_OWNED_TRANSACTION |
                            REBUILDABLE_OPERATIONAL_STATE | READ_ONLY_DERIVED | UNAUTHORIZED_UNKNOWN
ACCESS                  =   READ / INSERT / UPDATE / DELETE
PURPOSE                 =
EXPECTED_SCOPE          =
EXPECTED_MAX_ROW_COUNT  =
RUNTIME_OWNER           =
DIRECT_CELL_WRITE       =   always NO
TEST_LINEAGE            =
RECOVERY / CLEANUP MODEL =
OPERATOR_APPROVAL_REQUIRED =
```

## 2 — The nine refusals

| # | Condition | Outcome |
|---|---|---|
| 1 | a table is **omitted** from the preflight | **not authorized** — touching it is out of scope |
| 2 | READ was approved and the round wants to WRITE | **READ does not imply WRITE** — new approval required |
| 3 | the table is `UNAUTHORIZED_UNKNOWN` | **STOP** |
| 4 | a write would land on `PROTECTED_MASTER` | **STOP** |
| 5 | a schema change (table, column, migration, backfill) | **STOP** |
| 6 | a direct harness cell write | **STOP** — writes reach the DB only through canonical runtime owners |
| 7 | a table is discovered mid-round | **STOP** — the round does not widen its own scope while running |
| 8 | movement rows | **RETAINED** — never a delete target |
| 9 | gap write fatigue | **UNAUTHORIZED** — unchanged by any later round until §6 of S8-R2 is reopened |

`factory_stock` / `overseas_inventory_snapshot` may be mutated **only** through canonical runtime owners and
are recovered by runtime reconciliation plus an operator canonical re-import.

## 3 — Where the gate is enforced in code

Governance that lives only in a document is governance until somebody is in a hurry. These are the checks:

| Rule | Enforced by |
|---|---|
| unknown table → STOP | `KMS8CLASS.classify()` fails closed; `authorizeWrite()` returns `UNAUTHORIZED_UNKNOWN_TABLE` |
| protected write → STOP | `authorizeWrite()` → `PROTECTED_MASTER_WRITE_FORBIDDEN` |
| gap write → STOP | `authorizeWrite()` → `DERIVED_TABLE_WRITE_FORBIDDEN` |
| direct cell write → STOP | `authorizeWrite(t, via)` accepts only `via === 'RUNTIME_OWNER'`; `directCellWriteAuthorized()` returns false for **every** table |
| movement delete → refused | `authorizeDelete()` → `DELETE_FORBIDDEN_BY_POLICY`; `MOVEMENT_DELETE_ALLOWED = false` |
| approval request shape | `KMS8CLASS.approvalRequest()` validates all seven fields and both trigger vocabularies |
| prefix / time / non-manifest delete | `KMS8CLEAN.selectByPrefix()` and `selectByTime()` always throw; `planCandidates()` reads only the manifest |
| no executor | `KMS8CLEAN.execute()` always throws |

`assets/tests/s8-r2-fatigue-harness-safety.test.js` — 315 assertions, 24 mutants, 0 survived.

## 4 — The extra live tabs

The live census observed **43 physical tabs outside the 58-table registry**. They are **recorded, not
registered**: naming them does not authorize them and does not change the write surface. Every one classifies
`UNAUTHORIZED_UNKNOWN` / `NEVER_TOUCH` exactly as an unnamed table would.

```
EXTRA_TABS_NOT_IN_REGISTRY_COUNT  = 43
EXTRA_TAB_DEFAULT_CLASSIFICATION  = UNAUTHORIZED_UNKNOWN
WRITE   requires operator approval, always
READ    must be DECLARED in the DB TOUCH PREFLIGHT so the operator can see it
```

Recording them buys one thing: `classify()` can now distinguish **"observed live in Production, never
audited"** from **"never heard of it"**. Those have different next steps — the first needs an audit round, the
second might be a typo.

They fall into six groups, which is itself a finding:

| Group | Tabs | Note |
|---|---|---|
| 3PL / WMS integration | 13 | `warehouse_integrations`, `warehouse_inbounds`, `warehouse_receipts`, `warehouse_outbounds`, `external_sku_mappings`, … — **no deployed `.gs` reads any of them**, so there is a warehouse-integration data layer in the database with no Phase-1 backend owner |
| Amazon-derived snapshots | 2 | `amazon_monthly_sales_summary_snapshot`, `amazon_inventory_health_snapshot` |
| replenishment / shipment / carrier extensions | 11 | includes `carrier_import_jobs` / `_details` — the Import Job Framework the DB map lists as *planned* |
| planning / ERP / procurement | 11 | includes `sales_orders`, `sales_order_lines`, `production_schedule`, `factory_price_list` — all listed as *future / SPEC ONLY* in `DATABASE_RELATIONSHIP_MAP.md`, so the spec is behind the database |
| legacy / backup | 3 | `*_legacy_pre_v2_*`, `*_backup` |
| pre-migration snapshots | 3 | `PRE__pricing_list__*`, `PRE__pricing_change_log__*`, `PREBASE__pricing_list__*` |

**The last two groups are never a test target under any circumstances.** They are the recovery copies.

## 5 — Registry vs physical reality

```
registry entries     58
physically present   57
absent               replenishment_demand_allocation_rules
```

Its absence **confirms** the classification rather than contradicting it: storage was retired to Script
Properties (`50_api_v1_warehouse_allocation_config.gs`), it is still a canonical read key in
`supply-planning-production-source.js`, and the reader already treats it as optional. It stays registered and
stays `PROTECTED_MASTER`.

```
58 registered + 43 observed-extra = 101 physical tabs accounted for; 57 of the 58 confirmed present
```

## 6 — The S8T identity, closed

```
CENSUS_COMPLETE            = true
LIVE_S8T_COLLISION_COUNT   = 0     namespace 0 · actor 0 · lineage_type 0
tables_scanned             = 57
S8T_NAMESPACE_APPROVED     = YES
zero-write proof: db_writes 0 · rows_deleted 0 · rows_modified 0 · schema_changes 0 ·
                  drive_writes 0 · property_writes 0 · locks_taken 0
```

Zero on **all three tokens**, not just the prefix — which matters, because `S8_FATIGUE_TEST` begins `S8_` and a
prefix-only census would have reported a clean namespace while an actor collision sat waiting to satisfy guard
G2 for a row no test ever made.

```
TEST_NAMESPACE  = S8T        FATIGUE_TEST_RUN_ID_FORMAT = S8T-<YYYYMMDD>-R<NNN>
TEST_ACTOR      = S8_FATIGUE_TEST
```

## 7 — Development worktree authority

```
FUTURE_S8_DEVELOPMENT_WORKTREE = feature/product-strategy-board-p0
```

Main is not a development workspace. Every remaining S8 round implements, tests and commits in the feature
worktree. The flow is: **sandbox feature → implementation → tests → local commit → operator review →
authorized push / main fast-forward when approved.** The agent never pushes and never fast-forwards main.

---

*Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>*
