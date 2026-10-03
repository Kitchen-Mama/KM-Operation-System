# S8 Standing DB Authorization Gate

**Status:** STANDING GOVERNANCE — authoritative for every remaining S8 round.
**Frozen:** 2026-10-03, against frontend `26e5f10`, backend `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40`, contract `18`.
**Revision:** S8-R3B — replaced with the operator's **AUTHORITATIVE VERSION**, which supersedes the abbreviated
text frozen in S8-R3A.

This gate does not expire with the round that created it and does not need restating in a later prompt. Where
a task instruction and this gate could be read two ways, **the more restrictive data-safety reading wins and
the round STOPS for operator approval.**

> **Provenance, resolved.** The S8-R3A governance message carried the placeholder
> `[PASTE THE FULL "STANDING S8 OPERATOR DB AUTHORIZATION GATE" BELOW]` with no text under it, so S8-R3A froze
> §4 of the same round as the referent and flagged the gap. The S8-R3B task supplied the full text and stated
> that it *"supersedes any abbreviated standing-gate text frozen earlier."* This document is now that text.
> The differences from the S8-R3A version are listed in §8 — they are real, not cosmetic.

---

## 1 — The rule

**Before implementing or executing each S8 task, produce a DB TOUCH PREFLIGHT and STOP for operator approval.**

For every physical table the proposed task may touch:

```
TABLE                      =
CLASSIFICATION             =   PROTECTED_PRODUCTION | TEST_OWNED_TRANSACTION |
                               REBUILDABLE_OPERATIONAL_STATE | MOVEMENT_RETAIN |
                               READ_ONLY_DERIVED | UNAUTHORIZED_UNKNOWN
ACCESS                     =   READ | INSERT | UPDATE | DELETE
PURPOSE                    =
EXPECTED_SCOPE             =
EXPECTED_MAX_ROW_COUNT     =
RUNTIME_OWNER              =
DIRECT_CELL_WRITE          =   YES / NO        (always NO — see rule 8)
TEST_LINEAGE               =
RECOVERY / CLEANUP MODEL   =
OPERATOR_APPROVAL_REQUIRED =   YES / NO
```

## 2 — The twelve global rules

| # | Rule |
|---|---|
| 1 | **READ, WRITE and DELETE are declared separately.** One line per access kind, never a combined "touches". |
| 2 | **A table omitted from the approved preflight is NOT authorized.** Silence is refusal, not permission. |
| 3 | **If execution discovers a new table requirement: STOP immediately.** The round does not widen its own scope while running. |
| 4 | **Never silently expand the write surface.** |
| 5 | Any INSERT / UPDATE / DELETE against a `PROTECTED_PRODUCTION` table: **STOP** and request explicit operator approval. |
| 6 | Any newly discovered physical table: classify `UNAUTHORIZED_UNKNOWN` and **STOP**. |
| 7 | Any schema change: **STOP**. |
| 8 | Any direct spreadsheet cell write from the fatigue harness: **STOP**. Operational writes go through the canonical runtime owner. |
| 9 | **Movement ledgers are retained permanently** unless the operator separately changes this policy. |
| 10 | `factory_stock` and `overseas_inventory_snapshot`: operational quantity mutation **is** authorized through canonical runtime; final recovery may use canonical inventory re-import. |
| 11 | **Gap write-fatigue remains NOT AUTHORIZED.** |
| 12 | **READ permission in one round does not imply WRITE permission** in that round or any later one. |

## 3 — The classification vocabulary, and how it maps to the code

The gate's vocabulary and the registry's enum are not spelled identically, and renaming the enum mid-round
would be a behavioural change to a safety gate for a cosmetic reason. The mapping is stated instead, and is
asserted by the suites rather than left to a reader to infer.

| Gate term | `KMS8CLASS` encoding | Tables |
|---|---|---|
| `PROTECTED_PRODUCTION` | `CLASS.PROTECTED_MASTER` | 29 |
| `TEST_OWNED_TRANSACTION` | `CLASS.TEST_OWNED_TRANSACTION` | 25 |
| `REBUILDABLE_OPERATIONAL_STATE` | `CLASS.REBUILDABLE_OPERATIONAL_STATE` + `POLICY.RECONCILE` | 2 — `factory_stock`, `overseas_inventory_snapshot` |
| `MOVEMENT_RETAIN` | `CLASS.TEST_OWNED_TRANSACTION` + `POLICY.RETAIN` | 3 — `factory_stock_movements`, `overseas_inventory_movements`, `factory_stock_override_audit` |
| `READ_ONLY_DERIVED` | `CLASS.READ_ONLY_DERIVED` | 2 — the two gap tables |
| `UNAUTHORIZED_UNKNOWN` | `CLASS.UNAUTHORIZED_UNKNOWN` | everything not in the 58-entry registry |

`MOVEMENT_RETAIN` is a POLICY in the code rather than a CLASS because retention is a statement about **deletion**,
not about ownership: the movement ledgers are test-owned (a fatigue run creates rows in them) and simultaneously
undeletable. A single enum cannot say both. Rule 9 is enforced at the delete gate, which is the only place it
can be enforced.

## 4 — Where the gate is enforced in code

Governance that lives only in a document is governance until somebody is in a hurry. These are the checks:

| Rule | Enforced by |
|---|---|
| 2 — omitted means unauthorized | `KMS8R3B.decide()` is **deny by default**: an action outside the approved set is refused with `ACTION_NOT_IN_APPROVED_SET` |
| 3, 6 — unknown table → STOP | `KMS8CLASS.classify()` fails closed; `authorizeWrite()` returns `UNAUTHORIZED_UNKNOWN_TABLE` |
| 5 — protected write → STOP | `authorizeWrite()` → `PROTECTED_MASTER_WRITE_FORBIDDEN` |
| 8 — direct cell write → STOP | `authorizeWrite(t, via)` accepts only `via === 'RUNTIME_OWNER'`; `directCellWriteAuthorized()` returns false for **every** table |
| 9 — movement delete → refused | `authorizeDelete()` → `DELETE_FORBIDDEN_BY_POLICY`; `MOVEMENT_DELETE_ALLOWED = false` |
| 11 — gap write → STOP | `authorizeWrite()` → `DERIVED_TABLE_WRITE_FORBIDDEN`; `KMS8R3B.FORBIDDEN_ACTIONS` refuses every gap job and recalculate action by name |
| 12 — READ ≠ WRITE | the two tables granted bounded READ in S8-R3B stay `UNAUTHORIZED_UNKNOWN` and their write is still refused — asserted by section J of the R3B suite |
| approval request shape | `KMS8CLASS.approvalRequest()` validates all seven fields and both trigger vocabularies |
| prefix / time / non-manifest delete | `KMS8CLEAN.selectByPrefix()` and `selectByTime()` always throw; `planCandidates()` reads only the manifest |
| no executor | `KMS8CLEAN.execute()` always throws |

```
assets/tests/s8-r2-fatigue-harness-safety.test.js      315 assertions · 24 mutants · 0 survived
assets/tests/s8-r3b-read-path-fatigue-safety.test.js   264 assertions · 24 mutants · 0 survived
```

## 5 — `gapJob.status.get` is not a read

**Standing, until the operator reopens it.** The action sits on the router's GET read table and the R4A1 suite
proves every action there performs zero write primitives when executed — but **that proof is conditional on the
state the action is executed against**, and the condition is not met in the test:

```
gapJobStatus_ (46_:611-640)
  if (gapJobStaleNonterminal_(state, now))            // a non-terminal job with no recent progress
     ├─ gapJobMarkStalled_      → PropertiesService.setProperty        (persists terminal STALLED)
     └─ gapJobRearmRecovery_    → clearContinuationTriggers()          ScriptApp trigger DELETE
                                → scheduleContinuation()               ScriptApp trigger CREATE
                                   └─ gapProcessScopeSlice_ → gapUpsertByKey_
                                      WRITES inventory_replenishment_gap / order_planning_gap
```

Read-path fatigue is repeated polling, which is exactly the shape that meets that precondition. No S8 round may
call it, poll it, or reach it indirectly until the operator reopens the decision.

**It is reachable from a page mount.** `_irResumeGapJobOnMount_` (`inventory-replenishment.js:10371`) fires it
on every Site Inventory mount, deferred behind the boot arbiter. It is *conditional* — `resumeIfRunning` skips
the read when the client holds no job-liveness evidence for `INVENTORY` — but the condition is client-side
state, not a server guarantee. **Consequence: the Site Inventory page cannot be exercised at route level by any
read-only S8 round.** Its three component reads can be, and are.

## 6 — The extra live tabs

The live census observed **43 physical tabs outside the 58-table registry**. They are **recorded, not
registered**: naming them does not authorize them and does not change the write surface. Every one classifies
`UNAUTHORIZED_UNKNOWN` exactly as an unnamed table would.

```
EXTRA_TABS_NOT_IN_REGISTRY_COUNT  = 43
EXTRA_TAB_DEFAULT_CLASSIFICATION  = UNAUTHORIZED_UNKNOWN
WRITE   requires operator approval, always
READ    must be DECLARED in the DB TOUCH PREFLIGHT so the operator can see it
```

Recording them buys one thing: `classify()` can now distinguish **"observed live in Production, never
audited"** from **"never heard of it"**. Those have different next steps — the first needs an audit round, the
second might be a typo.

| Group | Tabs | Note |
|---|---|---|
| 3PL / WMS integration | 13 | `warehouse_integrations`, `warehouse_inbounds`, `warehouse_receipts`, `warehouse_outbounds`, `external_sku_mappings`, … — **no deployed `.gs` reads any of them**, so there is a warehouse-integration data layer in the database with no Phase-1 backend owner |
| Amazon-derived snapshots | 2 | `amazon_monthly_sales_summary_snapshot`, `amazon_inventory_health_snapshot` |
| replenishment / shipment / carrier extensions | 11 | includes `carrier_import_jobs` / `_details` — the Import Job Framework the DB map lists as *planned* |
| planning / ERP / procurement | 11 | includes `sales_orders`, `sales_order_lines`, `production_schedule`, `factory_price_list` — all listed as *future / SPEC ONLY* in `DATABASE_RELATIONSHIP_MAP.md`, so the spec is behind the database |
| legacy / backup | 3 | `*_legacy_pre_v2_*`, `*_backup` |
| pre-migration snapshots | 3 | `PRE__pricing_list__*`, `PRE__pricing_change_log__*`, `PREBASE__pricing_list__*` |

**The last two groups are never a test target under any circumstances.** They are the recovery copies.

### Bounded READ is not registration

S8-R3B granted bounded READ on two of the 43 — `supplier_price_list` and `amazon_inventory_health_snapshot` —
and the operator was explicit that this does **not** register them. They remain `UNAUTHORIZED_UNKNOWN`, their
write is still refused, and `KMS8R3B.BOUNDED_READ_NOT_REGISTERED` records the distinction so a later round
cannot mistake *"we read it once under approval"* for *"it is in the registry"*.

## 7 — Registry vs physical reality

```
registry entries     58
physically present   57
absent               replenishment_demand_allocation_rules
```

Its absence **confirms** the classification rather than contradicting it: storage was retired to Script
Properties (`50_api_v1_warehouse_allocation_config.gs`), it is still a canonical read key in
`supply-planning-production-source.js`, and the reader already treats it as optional. It stays registered and
stays `PROTECTED_PRODUCTION`.

```
58 registered + 43 observed-extra = 101 physical tabs accounted for; 57 of the 58 confirmed present
```

## 8 — What changed from the S8-R3A text

Listed rather than silently merged, because an abbreviated gate that was *acted on* for a round is part of the
audit trail.

| | S8-R3A (abbreviated) | AUTHORITATIVE |
|---|---|---|
| rules | 9 | **12** |
| classification | 5 terms, `PROTECTED_MASTER` | **6 terms**, `PROTECTED_PRODUCTION`, adds `MOVEMENT_RETAIN` |
| `factory_stock` / `overseas_inventory_snapshot` | stated in prose below the table | **rule 10**, a numbered standing rule |
| gap write fatigue | rule 9, "unchanged until §6 of S8-R2 is reopened" | **rule 11**, unconditional |
| READ ≠ WRITE | rule 2, scoped to a round | **rule 12**, scoped to all rounds |
| preflight trigger | "before every remaining S8 **execution** round" | "before implementing **or** executing each S8 task" |

Nothing in the abbreviated version permitted something the authoritative version forbids, so no earlier round
needs revisiting. The widenings are in the *scope of the preflight obligation* (implementation now triggers it
too) and in the *permanence* of rules 11 and 12.

## 9 — The S8T identity, closed

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

The S8T token is reserved for test **data**. A read-only round puts it nowhere — S8-R3B's request ids are
`REQ-S8R3B-<n>`, deliberately outside the namespace, and the suite asserts it.

## 10 — Development worktree authority

```
FUTURE_S8_DEVELOPMENT_WORKTREE = feature/product-strategy-board-p0
```

Main is not a development workspace. Every remaining S8 round implements, tests and commits in the feature
worktree. The flow is: **sandbox feature → implementation → tests → local commit → operator review →
authorized push / main fast-forward when approved.** The agent never pushes `main` and never fast-forwards it.

---

*Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>*
