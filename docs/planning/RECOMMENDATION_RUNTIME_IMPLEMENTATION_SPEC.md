# Recommendation Runtime Implementation Spec — Daily Pipeline, Weekly Shipping & Monthly Order Recommendations

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** Temporary **implementation contract** for the recommendation pipeline (Daily / Weekly Shipping / Monthly Order). NOT a permanent canonical owner.
> - **Classification:** Planning / Implementation.
> - **Lifecycle:** **Temporary** — once the pipeline is built and verified, this doc moves to History; the permanent rules live in its Canonical Owners.
> - **Canonical Owners (this doc restates none of them):** `SUPPLY_PLANNING_CALCULATION_RULES.md` (formulas) · `SYSTEM_RUNTIME_ARCHITECTURE.md` (cadence / service boundary) · `DATABASE_RELATIONSHIP_MAP.md` (schema) · `SUPPLY_CHAIN_SYSTEM_FLOW.md` (E2E flow).
> - **Canonical Owner For:** nothing permanent (implementation sequencing only).
> - **Not Owner For:** formulas, DB schema, Reserve Trigger (B-1 owner = `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1), cadence — all deferred to the owners above.
> - **Status:** Reviewed — B-1 / B-2 / B-3 RESOLVED (decision only); **B-4 CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED** (Runtime prerequisites open — see the B-4 Minimal Runtime Plan §B4-Plan below); **B-7 RESOLVED (2026-08-02, decision only — recommendation-cycle Composite Natural Key / Submit commitment boundary, §G; Runtime not implemented)**; **B-5 RESOLVED (2026-08-03, decision only — `request_order_lines` / `request_order_line_sources` grain + quantity authority + Monthly SKU split (`company` × `request_bucket`) + Recommendation→Request writer input/output/idempotency identity; owner `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.9; writer / persistence / Runtime NOT implemented)**; B-6 / B-8 UNRESOLVED. **Phase 2B Calculation Pure Runtime = FUNCTIONALLY COMPLETE / TEST VERIFIED (2026-08-03, Round 11A closure — see §Calc-Closure below): the entire pure calculation lane (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22/§27A/§32A/§34A + §39 Ledger + §40 Allocation + the B-4 Minimal Pure Runtime chain) is implemented and test-verified from Main; §33 Golden Matrix = 39 executed / 1 pending / 0 canonical-blocked (only #34, downstream). This is DISTINCT from — and does NOT imply — the Recommendation Persistence / Orchestration Runtime tracked by §A–§K below, which remains Not Started / Pending. This tracker is NOT retired.** **Recommendation Persistence / Orchestration Contract = FROZEN (2026-08-03, Phase 2C Round 1A — decision only; see §Persist-Orch): public commands, Active-Draft key, `calculation_run_id`, `draft_version`, user-edit protection, lock/logical-transaction, Submit boundary, B-5 Request handoff, Weekly-Plan handoff, idempotency, failure/recovery. Implementation = NOT STARTED (writer / scheduler / LockService / persistence NOT IMPLEMENTED).** **Recommendation Persistence CORE STATE MACHINE = IMPLEMENTED / TEST VERIFIED (2026-08-03, Round 1B — pure `assets/js/core/supply-planning-persistence.js`, 96 assertions).** **Production Persistence Adapter / Repository Contract = FROZEN (2026-08-03, Round 1C — decision only; see §Persist-Adapter): repository model B + Plan diff, table/header mapping, REQUIRED additive `user_edited`/`user_edited_by` + `recommendation_calculation_runs` journal table, natural-key upsert, optimistic-concurrency token, script-lock boundary, partial-write recovery, migration plan.** **Production Repository SLICE 1 = SOURCE PRESENT / TEST VERIFIED (2026-08-03, Round 1D — pure module `supply-planning-persistence-repository.js`, 74 fake-sheet assertions; additive line headers + `recommendation_calculation_runs` schema + `23_*.gs` source mirror; `15_` delete+replace → natural-key upsert). LockService / Scheduler / Trigger / calc-engine / Request-writer / Weekly-Plan / Submit NOT IMPLEMENTED; not deployed; no live migration.**
> - **Current Version:** Draft v1.2 (Batch B B-7 Landing Round 5C, 2026-08-02: landed the USER-CONFIRMED recommendation-cycle identity contract — Composite Natural Key (Option B), one Active Draft per `recommendation_type + planning_cycle + business scope`, Scheduler/Retry/Resume reuse + never overwrite user quantity, Manual Regenerate rebuild-with-confirmation, and the permanent Submit commitment boundary (a Recommendation Engine shall never mutate a Submitted Business Record). B-7 marked RESOLVED (Decision Only); §G status flipped from Blocked to Decision-completed / Implementation-pending. No Runtime / composite-lookup / LockService / scheduler / writer implemented.) Draft v1.1 (Round 4D-C: added the External-Origin-Aware Implementation Order + the Daily-Import / external-sync / scheduler no-auto-admit guards. The B-4 Minimal Pure Runtime plan B4-R1–B4-R8 is now COMPLETE and test-verified at its truthful source / pure-module / pure-orchestration / test-promotion levels: B4-R1/R2 source repairs, B4-R3 candidate, B4-R4 (+R4.1) KM adapter, B4-R5 external authority adapter, B4-R6 ten-gate Qualified-Incoming engine, B4-R7 Line-Runtime → calculateGap, and B4-R8 promoting Golden #12/#13/#14 through the real chain (Matrix now 28 executed / 12 implementation-pending / 0 canonical-blocked). Apps Script deployment / live Runtime / source-read / external ingestion / review actions / recommendation-writer / persistence / scheduler UNVERIFIED or NOT IMPLEMENTED. Next work returns to the Batch B registry.) Draft v1.0 (Batch B Round 1 registry sync — B-1 resolved).
> - **Last Reviewed:** 2026-08-04 (**Production Safety Round S0.5** — Active Runtime Safety Integration SOURCE PRESENT / TEST VERIFIED: the six shared auto-create/auto-append ensure helpers across Shipping/Procurement/Shipment/Inventory/Forecast-FC are now **validate-only** delegators to a shared `KMSAFE` Apps Script adapter (`29_production_safety_adapter.gs`) — normal Runtime can no longer create a missing Canonical Sheet (`SCHEMA_NOT_PROVISIONED`) or append/repair a Header (`MISSING_REQUIRED_HEADER`), the exact Spreadsheet-ID gate precedes every ensure-helper access (bound-db id unified + empty→fail-closed; Amazon runner gated on its own separate id), create/append is migration-only (unreachable from any router action), and authorized row-≥2 data writes still work; proven by `production-safety-runtime-integration.test.js` (85, extract+eval of the real .gs source over write-spy fakes). **live incident remains OPEN; live execution NOT performed; Verification Copy is the next authorized phase; Submit remains BLOCKED.** Full contract + domain matrix + migration registry: `SYSTEM_RUNTIME_ARCHITECTURE.md` §SAFE.INT / §SAFE.MIG. Prior: **Production Safety Round S0** — Production Spreadsheet Safety Layer SOURCE PRESENT / TEST VERIFIED: shared pure module `supply-planning-production-safety.js` (`KMSAFE`, bundled — manifest 24→25) enforces the exact Spreadsheet-ID gate, validate-never-repair Header validation, Header-row (row 1) write barrier, structural clear/delete/insert barrier, and the explicit-Migration-authorization boundary; the recommendation generate path (`24_recommendation_orchestrator.gs`) now VALIDATES via `KMPW.assertAuthorizedSchemasReady` and **fails closed before any lock/write** (missing `recommendation_calculation_runs` → `SCHEMA_NOT_PROVISIONED`, blank line Header → `HEADER_BLANK`, duplicate Active Draft → `BLOCKED_CONFLICT`) — the auto-creating ensure was removed from that path; config `RECOMMENDATION_TARGET_SPREADSHEET_ID_` intentionally EMPTY (fails closed until the verification-copy id is set). New tests: `supply-planning-production-safety.test.js` (67) + `supply-planning-recommendation-schema-safety.test.js` (21) + bundle/forensic updates. **Live data incident remains OPEN; live generation remains DISABLED; Submit remains BLOCKED; no live execution authorized — the next round must target a duplicated verification Spreadsheet, not Production.** Full permanent contract: `SYSTEM_RUNTIME_ARCHITECTURE.md` §SAFE. Prior: Phase 2C Round 1D Production Repository SLICE 1 IMPLEMENTED / TEST VERIFIED (74); Round 1C adapter contract FROZEN; Round 1B persistence core (96); Round 1A §Persist-Orch; Round 11A Calc closure.
> - **Depends On:** the four Canonical Owners above.
> - **Blocked By:** Batch B — **B-4 Runtime implementation prerequisites** (described in §B4-Plan) · B-6 / B-8 where applicable. **B-5 line/source grain + Recommendation→Request writer boundary is RESOLVED (2026-08-03, decision only — owner RO&PO §3.9; Runtime not implemented) and no longer blocks — the writer's target grain + input/output/idempotency identity are now frozen (the writer itself remains Not Started).** **B-7 persisted recommendation-cycle / unique-key design is RESOLVED (2026-08-02, decision only — Composite Natural Key, §G; Runtime not implemented) and no longer blocks.** **B-1 / B-2 / B-3 are RESOLVED (decision only); the B-4 contract is RESOLVED and B-4 Runtime implementation is IN PROGRESS (B4-R1 + B4-R2 SOURCE IMPLEMENTED — TEST VERIFIED at source level; B4-R3 PURE MODULE IMPLEMENTED — UNIT TEST VERIFIED; B4-R4 PURE ADAPTER IMPLEMENTED — UNIT / INTEGRATION-FIXTURE / DOWNSTREAM-PROJECTION-CONTRACT VERIFIED; B4-R5 PURE EXTERNAL-AUTHORITY ADAPTER IMPLEMENTED — UNIT / CROSS-ADAPTER-FIXTURE VERIFIED; B4-R6 PURE QUALIFIED-INCOMING ENGINE IMPLEMENTED — UNIT / CROSS-ADAPTER / TEN-GATE / DEDUP / REQUIRED-BY FIXTURES VERIFIED; B4-R7 PURE MINIMAL LINE-RUNTIME ORCHESTRATION IMPLEMENTED — QUALIFIED-INCOMING → CALCULATEGAP INTEGRATION / ONE-LINE FIXTURES VERIFIED; B4-R8 GOLDEN #12/#13/#14 PROMOTED — REAL B4 MINIMAL PURE RUNTIME CHAIN EXECUTED, MATRIX 28 EXECUTED / 12 IMPLEMENTATION_PENDING / 0 CANONICAL-BLOCKED; Apps Script deployment / live runtime / integration / external ingestion / review actions / source-read / recommendation-writer / persistence UNVERIFIED); there is no "next open decision = B-2". **The B-4 Minimal Pure Runtime plan (B4-R1–B4-R8) is COMPLETE; there is no next B4 Minimal Runtime batch. B-5 (line/source grain + writer boundary) and B-7 (cycle identity) are now RESOLVED (decision only); the next authorized work is the **Recommendation Persistence / Orchestration Contract** (now unblocked — its grain = B-5 §3.9, its cycle identity = B-7 §G), sequenced ahead of the remaining B-6 / B-8 decisions — none of which is implemented here.**

**Status:** 🟡 Draft v1.2 — **SPECIFICATION ONLY.** No Runtime, Apps Script, frontend, trigger, DB column, or sheet tab is created here. Function-level runtime status below was **verified by read-only audit** (2026-07-20).
**Last Updated:** 2026-08-03 (Round 11A — Calculation Pure Runtime closure sync: recorded §39 Ledger + §40 Allocation + Line Runtime + Qualified Incoming pure runtimes TEST_VERIFIED, Golden Matrix 39/1/0, #34 downstream; the Recommendation Persistence / Orchestration Runtime tracked here remains Not Started / Pending; documentation-only, no code change). Prior: 2026-08-02 (Round 5C — B-7 Composite Natural Key + Submit commitment boundary landed, Decision Only)
**Maintained By:** Development Team
**Related / Authority chain:**
- [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md) §7A — canonical cadence (this spec is its implementation contract).
- [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) §20/§23/§24 — the recommendation **calculation** authority (this spec does not restate formulas).
- [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md), [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) §3.6/§3.7 — Draft tables.
- [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md) — Daily Amazon import.
- [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) — schema authority.

> **Scope.** Implementation-ready Runtime contract for the recommendation pipeline: the existing Daily entry point, two **future** no-arg scheduler entry points, source-readiness, cycle idempotency, recommendation-vs-user-quantity protection, Draft persistence, and future trigger installation. **No formulas are redefined** (owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`).

> **Canonical cadence is owned by [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md) §7A** (Daily · validation buffer · Weekly · Monthly windows, Asia/Taipei — the exact times are defined there). This spec does **not** re-define or restate the cadence times — it references the §7A owner and sequences the implementation work against it.

---

## §Calc-Closure. Calculation Pure Runtime — CLOSED (CANONICAL 2026-08-03 — Round 11A; documentation only)

> This subsection records the **current** state and is the authority over any older matrix count that appears in the round-stamped historical headers below (§External-Origin-Aware Implementation Order, §B4-Plan). Those older headers are **historical snapshots** of their round and are preserved as-is.

**Calculation Pure Runtime = FUNCTIONALLY COMPLETE / TEST VERIFIED / CANONICALLY CLOSED for all currently frozen contracts.** Owner `SUPPLY_PLANNING_CALCULATION_RULES.md` (v4.7). Verified from Main:

| Layer | Module | Assertions |
|---|---|---|
| Calculation core (§22/§27A/§32A/§34A + primitives) | `supply-planning-calculations.js` | 325 |
| Supply candidate DTO (B4-R3) | `supply-planning-supply-candidates.js` | 54 |
| KM incoming adapter (B4-R4) | `supply-planning-incoming-adapters.js` | 80 |
| External incoming adapter (B4-R5) | `supply-planning-external-incoming-adapters.js` | 82 |
| §2E Qualified Incoming evaluator (B4-R6) | `supply-planning-qualified-incoming.js` | 106 |
| Line Runtime orchestration (B4-R7) | `supply-planning-line-runtime.js` | 88 |
| §39 Demand / Supply Ledger (R9B) | `supply-planning-ledgers.js` | 133 |
| §40 Overseas / Factory Allocation (R10B) | `supply-planning-allocations.js` | 112 |
| §33 Golden Matrix | `supply-planning-golden-scenarios.test.js` | 189 (**39 executed / 1 pending / 0 canonical-blocked**) |

**The single remaining §33 Pending is #34** (User partial-carton Order Qty) — a **downstream Request-Order / PO / UI-state / persistence acceptance** (`SUPPLY_PLANNING_CALCULATION_RULES.md` §37), **NOT** a Calculation Pure Runtime blocker; owned by `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` / `PURCHASE_ORDER_SPEC.md` + the Request/PO UI-state lane.

> **PERMANENT CANONICAL RULE (see `SYSTEM_RUNTIME_ARCHITECTURE.md` §7B):** Calculation Pure Runtime completion does **NOT** imply Recommendation Persistence, Production Integration, Deployment, or Business Execution completion. Everything in §A–§K below (recommendation calculation engine, no-arg schedulers, persistence writer, source-readiness batch identity, trigger installation) and B-7 Active-Draft enforcement remains **Not Started / Pending**.

**Recommendation Persistence / Orchestration Contract = FROZEN (2026-08-03 — Decision Only, see §Persist-Orch below).** The complete public contract (commands, DTOs, Active-Draft key, `calculation_run_id`, `draft_version`, user-edit protection, lock/logical-transaction, Submit boundary, B-5 Request handoff, Weekly-Plan handoff, idempotency, failure/recovery) is now frozen on top of B-5 (grain, RO&PO §3.9) + B-7 (cycle identity, §G). **The next authorized boundary is IMPLEMENTATION** of that contract (§J phases), sequenced ahead of the still-open **B-6** (Request→PO atomicity) and **B-8** (cancellation-release) — **NOT authorized here**. This tracker is **NOT retired**; retirement still requires the recommendation persistence/orchestration **implementation**, scheduler/retry/idempotency verification, permanent-rule absorption, and `project-current-state` synchronization.

---

## §Persist-Orch. Recommendation Persistence / Orchestration Contract (FROZEN — Decision Only, 2026-08-03)

> **Status: CONTRACT FROZEN — NOT IMPLEMENTED.** This section freezes the complete public contract for the Recommendation Persistence / Orchestration Runtime that §A–§K sequence. It builds on the frozen inputs (grain = **B-5 RESOLVED**, RO&PO §3.9; cycle identity + Submit boundary = **B-7 RESOLVED**, §G / ARCH §7A) and the pure Calculation Runtime (§39/§40, test-verified). **No scheduler / writer / LockService / persistence / API / UI / trigger is implemented or authorized here.** It does **not** decide **B-6** (Request→PO atomicity) or **B-8** (cancel/reopen/release), and does **not** reopen B-7. The permanent boundary owners are `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A/§7B (command + lock + Submit), `DATABASE_RELATIONSHIP_MAP.md` §7.5 (identities), `SUPPLY_CHAIN_SYSTEM_FLOW.md` §5.5 (flow).

### PO-1. Selected public architecture (decomposition audit)
Evaluated: **(A)** one god-orchestrator; **(B)** four flat public functions (resolve/upsert/regenerate/submit); **(C)** command-oriented orchestrator with a single shared core + one public entry per business command; **(D)** other. **Selected = C.** Rationale: the two no-arg scheduled entry points already exist by name (`runWeeklyShippingRecommendation` / `runMonthlyOrderRecommendation`, §B/§E/§I) and the manual "Recommend/Regenerate" UI action must produce the **identical** result (scheduler/manual parity) — so both funnel through **one** shared generation core rather than duplicating logic (rejects A's god-function and B's parity drift). `resolveActiveDraft` / `resolveCalculationRun` / user-edit detection are **internal helpers**, not public surface (rejects B's over-exposure). The result is the **smallest coherent** public set: 2 scheduled adapters + 1 generation core + 1 submit = 4 public commands; the downstream handoffs (Send Request = B-5 writer; Create/Update Weekly Plan = logistics layer) are owned by their downstream specs, not this orchestration.

### PO-2. Public commands (side-effecting; NOT pure)
1. `runWeeklyShippingRecommendation()` — no-arg scheduled adapter (Weekly); resolves in-scope cycles and calls the core per cycle+scope.
2. `runMonthlyOrderRecommendation()` — no-arg scheduled adapter (Monthly); same shape.
3. `generateRecommendationDraft(command)` — the shared generation/refresh/regenerate core (used by both schedulers **and** the manual Recommend/Regenerate action).
4. `submitRecommendationDraft(command)` — Draft → Submitted commitment boundary (B-7).

**Downstream handoff commands (owned elsewhere; referenced, not defined here):** monthly `Send Request` → the B-5 §3.9 Recommendation→Request writer; weekly `Create/Update Weekly Plan` → `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`. **Internal helpers** (private, named for the contract; realized later): `resolveActiveDraft`, `resolveOrCreateCalculationRun`, `checkSourceReadiness`, `buildRecommendationLines` (pure calc invocation), `upsertDraftHeader`, `upsertDraftLines`, `reconcileSupersededLines`, `detectUserEdits`, `acquireCycleLock`/`releaseCycleLock`, `markRunCompleted`.

### PO-3. Signatures & DTOs (contract-level, language-neutral; NOT implemented)
```
runWeeklyShippingRecommendation(): RunSummary
runMonthlyOrderRecommendation():   RunSummary
generateRecommendationDraft(cmd: GenerateCommand): DraftResult
submitRecommendationDraft(cmd: SubmitCommand):     SubmitResult

GenerateCommand = {
  recommendationType,          // "WEEKLY_SHIPPING" | "MONTHLY_ORDER"
  planningCycle,               // Weekly ISO "YYYY-Www" | Monthly "YYYY-MM" (Asia/Taipei)
  businessScope,               // per PO-5
  mode,                        // "SCHEDULED_REFRESH" | "MANUAL_REGENERATE"
  actor,                       // audit identity (system vs user actor class)
  confirmRegenerateOverUserEdits // bool; required true to regenerate when user edits exist
}
DraftResult = {
  status,                      // "COMPLETED" | "PARTIAL" | "FAILED" | "SKIPPED" | "BLOCKED"
  draftId, draftVersion, calculationRunId,
  counts: { created, updated, resumed, skipped, blocked },
  issues: [ { code, scope, detail } ]
}
SubmitCommand = { recommendationType, draftId /* or planningCycle+businessScope */, actor }
SubmitResult  = { status, draftId, submittedAt, immutable: true, issues: [] }
RunSummary    = { success, skipped, resumed, failed, issues }   // matches §B.10
```
All calculation is delegated to the pure §39/§40 + Engine A/B runtime (no formula here). These DTOs are in-memory contract shapes — **no DB column, table, or index is created**.

### PO-4. recommendation_type enum
`{ "WEEKLY_SHIPPING", "MONTHLY_ORDER" }` — exactly the two families with existing draft tables + schedulers. **Emergency Manual Order (§36.4) is NOT a separate type** — it is a `MONTHLY_ORDER` produced on-demand, distinguished only by `generation_type` (`manual_refresh`/`user_created`) and provenance, using the same tables + formulas. No new type is invented.

### PO-5. Business scope schema per type (B-7 §G, verbatim)
- **WEEKLY_SHIPPING:** `planning_cycle` (ISO `YYYY-Www`, Asia/Taipei) + `company` + `country` + `marketplace` + `source_page` (+ `draft_version`). Destination is line-level.
- **MONTHLY_ORDER:** `planning_cycle` (`YYYY-MM`, Asia/Taipei) + `company` + `country` + `marketplace` + `draft_purpose` (+ `draft_version`). Persisted request grain = `company` × `sku` × `request_bucket` → 1..N sources (B-5 §3.9). No `recommendation_cycle_id` now (future surrogate = DB hardening only).

### PO-6. Active Draft composite key & lookup
- **Full natural identity** = `recommendation_type + planning_cycle + <scope fields> + draft_version`.
- **Active-lookup key** = `recommendation_type + planning_cycle + <scope fields>` (WITHOUT `draft_version`). **Invariant: at most ONE Active Draft per Active-lookup key.** Among versions, only the latest is Active; prior versions are superseded (PO-11).
- **Active status set** = `{ draft, site_confirmed }` (non-terminal, editable). **Excluded (non-Active)** = `{ submitted, cancelled }` (+ any future completed/replaced).
- **Zero Active** → create a new draft (`draft_version = 1`). **One Active** → reuse it (resume/refresh). **>1 Active** → **CONFLICT: the run BLOCKS (fail-closed)** — no silent pick, **no latest-created-wins, no automatic repair**; surfaced for human resolution. Duplicate-active state blocks the run and never proceeds.

### PO-6a. WEEKLY_SHIPPING recommendation_group_no reconciliation (F1-7N-C0, 2026-08-19 — documentation only)
**Audit outcome: ALREADY RECONCILED to K3 — no key change.** The WEEKLY_SHIPPING Phase-1 Active-lookup key is
**K3** = `recommendation_type + planning_cycle + company + country + marketplace + source_page` (PO-5/PO-6);
`recommendation_group_no` is a stored HEADER column (Shipping Allocation Amendment §2.2) but is **NOT** part of the
Phase-1 Active identity. The amendment's §2.1 **K2** model (`… + recommendation_group_no + draft_version`) and any
air/sea multiple-Draft-Header split are explicitly **`PHASE_2_DEFERRED`** by the owner-of-record
`ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md` (D-C2-1 / D-C2-2 / D-C2-4 / §3) — with which the amendment,
`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6, and `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §807 are annotated to
agree. The current persistence core + repository (`supply-planning-persistence-repository.js` `TABLES.WEEKLY_SHIPPING.scope`)
already implement K3. **Therefore F1-7N-C persists a weekly recommendation as a SINGLE K3 Active Draft per site/cycle**
(coarse `recommended_shipping_method` / `recommended_last_mile_delivery` are single header fields; F1-7N-B emits no
multi-group split). Two different routes in the same week are Phase-1-handled via **separate Submit cycles / subsequent
Drafts**, never simultaneous multi-group Active Drafts. **Activating `recommendation_group_no` in the Active key (the
K2 model, enabling multiple coexisting Active Drafts) is a SEPARATE authorized Phase-2 slice — NOT F1-7N-C.** Guard:
`weekly-shipping-active-key-reconciliation-f1-7n-c0-r1.test.js` locks K3 and fails any silent drift. Schema: the
30-col header already carries `recommendation_group_no` → **no DB migration**. MONTHLY_ORDER key unchanged.

### PO-7. calculation_run_id contract
Business-meaningful run identity (**never a timestamp alone**). Generated per **new calculation run** (a scheduled run that (re)computes, or a manual Regenerate). **Retry/Resume of the SAME operation reuses the same `calculation_run_id`** (idempotent). **Manual Regenerate mints a NEW `calculation_run_id` and increments `draft_version`.** One `draft_version` ↔ one `calculation_run_id` (the run that produced that version's `recommended_qty`). `formula_version` + `source_data_as_of` are immutable lineage attributes of the run. Completed runs are immutable. (`calculation_run_id` exists on `shipping_allocation_drafts` and on the `15_*` request-draft header; not added anywhere here.)

### PO-8. draft_version contract
Initial `1` on first successful write. **Increments ONLY on a successful Manual Regenerate** (deliberate recalculation) — **never** on scheduler first-run / retry / resume / refresh (those reuse the current version and idempotently repair it). A **failed** regeneration does **not** consume a version (increment commits only after the regenerated snapshot is persisted → no version inflation from retries). Exactly **one** version is Active at a time; `draft_version` doubles as the optimistic-concurrency token under the lock. A Submitted record's `draft_version` is frozen.

### PO-9. Create / Update / Retry / Resume / Regenerate matrix
| Case | Lookup | Create/Update | calc_run_id | draft_version | recommended_qty | planned/order_qty | Confirm | Idempotency |
|---|---|---|---|---|---|---|---|---|
| A Scheduler first run | none found | create v1 | new | 1 | write (system) | init = recommended | no | Active-lookup key |
| B Scheduler retry after failure | reuse Active | update (repair) | **reuse** | unchanged | repair missing/incomplete system lines only | preserved | no | same run |
| C Scheduler resume after partial | reuse Active | update (finish) | **reuse** | unchanged | complete missing lines | preserved | no | same run |
| D Scheduler refresh, Active exists | reuse Active | update (repair only) | reuse | unchanged | **not recomputed** (immutable in version) | preserved | no | Active-lookup key |
| E Manual Recommend, no Active | create v1 | create | new | 1 | write | init = recommended | no | Active-lookup key |
| F Manual Recommend, Active exists, no user edits | reuse Active | regenerate | new | +1 | recompute | re-init = recommended | no | Active-lookup key |
| G Manual Recommend, Active exists, user edits present | reuse Active | regenerate **only if `confirmRegenerateOverUserEdits`** | new | +1 | recompute | **user edits preserved unless user confirms overwrite** | **YES (whole-draft)** | Active-lookup key |
| H Regenerate after source/formula change | reuse Active | regenerate | new | +1 | recompute | preserved-or-confirmed | YES if edits | Active-lookup key |
Blocked/conflict inputs in any case follow PO-13; a duplicate Active blocks all cases (PO-6).

### PO-10. User-edit detection & protection
- **Authoritative user fields:** Weekly = `planned_qty` (+ user `selected_*` logistics on the line); Monthly = `order_qty` (+ `carton_qty` + the partial-carton override, §37).
- **Detection MUST use explicit provenance — NOT bare value comparison.** A user field is "edited" when written by a user action (an explicit `user_edited` marker, or `updated_by` actor-class = user, or a user line generation). `planned_qty == recommended_qty` alone is **insufficient** (a user may deliberately keep the recommended value). Where no explicit signal exists today, an additive `user_edited`/actor-class signal is **REQUIRED at implementation** (no column added by this contract).
- **`updated_by`/actor metadata is required** to classify system vs user writes. `draft_version` comparison alone is **not** sufficient for line-level edit detection.
- **Untouched (system-owned, never user-edited) lines MAY be refreshed**; **user-edited quantities are NEVER auto-overwritten** by scheduled refresh (§D/§F). **Confirmation before overwrite** applies at **Regenerate** only, and is a **whole-draft gate** (if ANY user edit exists → confirm once before recomputing planning quantities, §G line 145).
- **Cancelled lines** are excluded from refresh and from the roll-up; never reactivated. **No scheduled refresh may overwrite user-edited `planned_qty`/`order_qty`.**

### PO-11. recommended_qty snapshot
Immutable within one `draft_version`; recomputed **only** when `draft_version` increments (Regenerate). Bound to `calculation_run_id` + `formula_version` + `source_data_as_of` of the producing run. **Versioning model = supersede-in-place at the line grain** (the Active header carries the current `draft_version`; system-owned line rows are updated to the new version's values on Regenerate, user fields preserved-or-confirmed). Prior `recommended_qty` is auditable via the immutable `calculation_run` lineage. **Physical per-version row retention (append versioned rows) is an OPTIONAL additive deferred to implementation — no DB migration is decided here.** Stale/removed lines are **superseded/cancelled, never silently deleted** (PO-15).

### PO-12. Lock & logical transaction
- **Lock scope key** = the Active-lookup key (`recommendation_type + planning_cycle + <scope>`); a coarser `recommendation_type + planning_cycle` lock is permitted. Realized via project `LockService` (pattern already used in `05/07/21/22_*.gs`; **absent** in the recommendation modules today).
- **Acquire BEFORE lookup.** The **critical section** = lookup → second-validation → header/line upsert → totals → mark run complete. **Calculation MAY run outside the lock** (expensive/pure), but a **second Active-draft validation under the lock is mandatory before any write**. **Release after the run is marked complete.**
- **No write on lock failure** — if another run holds the lock, abort safely (§B.1), never create a duplicate draft. Concurrent scheduler/manual runs serialize; concurrent Submit/Regenerate serialize on the same lock. Lock **timeout seconds are NOT frozen** (implementation detail; evidence does not require a specific value).
- **Logical transaction (Sheets has no ACID — do not pretend it does):** write order = (1) run metadata RUNNING → (2) resolve/create draft header → (3) upsert draft lines → (4) reconcile removed/superseded lines → (5) write lineage/snapshot refs (`calculation_run_id`, `source_data_as_of`, and for Monthly the `demand_key` lineage, B-5 §3.9) → (6) recompute header totals → (7) mark run COMPLETED → (8) release lock. **No success response before all required rows are consistent** (§B.11). Partial write → run stays `RUNNING`/`PARTIAL` and is resumable by reusing the same `calculation_run_id` and re-driving idempotent upserts.

### PO-13. Draft-line upsert keys & reconciliation
- **`shipping_allocation_draft_lines` natural upsert key** = `(allocation_draft_id, sku, site_sku, window_code)` (surrogate `allocation_draft_line_id` = PK). Current runtime upserts by line-id (`16_*`) — the contract freezes the **deterministic natural key** so retry resolves the same line without a client surrogate.
- **`request_order_allocation_draft_lines` natural upsert key** = `(request_allocation_draft_id, request_month, request_bucket)` (line carries **no** `sku`; sku is on the parent draft; surrogate `request_allocation_line_id` = PK).
- **Upsert-by-natural-key is canonical — NOT delete+replace.** (The current `15_*` request-draft handler delete+appends lines; that is superseded by this contract so user edits survive retry. The `16_*` shipping handler already upserts.)
- **recommended_qty update:** only on Regenerate (new version); untouched within a version. **planned/order_qty:** protected (PO-10). **New line:** insert, user qty init = recommended. **Missing line** (in draft, absent from new calc): mark superseded/cancelled — if user-edited, preserve + flag for review, never silently drop. **Blocked line** (PO-13 input conflict): written with `line_status = BLOCKED` + reason token, **never a fabricated quantity**. **Zero qty:** a genuine `0` recommendation may be written with `0` + reason or omitted; a BLOCKED/MISSING input is **never** converted to `0`. **Source lineage:** Monthly lines carry `demand_key` (B-5) when available; shipping lines carry the calc-snapshot refs. **Stable ordering** by natural key.

### PO-14. Blocked / conflict handling (ownership: §34A / §39 / §40)
| Input state | Scope | Behavior |
|---|---|---|
| `MISSING_SNAPSHOT` / `MISSING_FORECAST` / `MISSING_SALES_BASIS` (§34A) | line | line BLOCKED (calculation blocked/review), **never auto-0**; if the whole scope lacks inputs → Analysis Readiness fails → **no draft** (fail-closed, §H) |
| `STALE_SNAPSHOT` (§34A) | line | proceed **with staleness warning**, never auto-0 |
| `BLOCKED_CONFLICT` Demand (`DEMAND_EVENT_QTY_CONFLICT` / `DEMAND_SOURCE_QTY_CONFLICT`) | line | conflicting group contributes 0 and is quarantined; line BLOCKED with the §39 reason; never summed/picked |
| `BLOCKED_CONFLICT` Supply (`PHYSICAL_POOL_QTY_CONFLICT` / `SUPPLY_LINEAGE_CONFLICT`) | line/pool | pool excluded; line BLOCKED with the §39 reason |
| Allocation `blockedInputs[] {kind,key,reason}` / `PROTECTION_FLOOR_BLOCKED` (§40) | line | surfaced verbatim; affected demand/pool excluded; shortfall reported, never auto-0 |
| Duplicate Active Drafts | run | whole run BLOCKS (PO-6) — no silent pick |
| Malformed persisted row | row | fail-closed for that row; surface; never overwrite |
| Source data unavailable | run | readiness fails → no draft (§H) |
| Partial write detected | run | run `PARTIAL`/`FAILED`; resumable; no empty-success |
- **Whole-run blocks** only for: inputs unavailable / readiness fail / duplicate-active / structural violation. Otherwise **only the affected line blocks**; the Draft **can be saved with blocked lines**. **Submit is blocked** while unresolved BLOCKED lines remain (PO-16). The **previous Active Draft remains usable** and **user edits remain preserved**. Status/reason ownership: §34A owns missing/stale tokens, §39 owns ledger-conflict tokens, §40 owns `blockedInputs`; the persistence layer owns `line_status = BLOCKED` + an echoed reason. **Never convert unknown/blocked to 0.**

### PO-15. Failure / retry / resume matrix
| Outcome | Run status | Resume point | Idempotency key | Reused rows | Superseded | User action? | Prior Active visible |
|---|---|---|---|---|---|---|---|
| Calc failed before write | FAILED | re-run calc | Active-lookup key | none | none | after fixing source | yes (unchanged) |
| Header written, lines incomplete | PARTIAL | resume at lines | same calc_run_id | header + written lines | none | no (auto-resume) | yes |
| Lines written, totals incomplete | PARTIAL | resume at totals | same calc_run_id | header + lines | none | no | yes |
| Handoff (Send Request / Create Plan) failed | COMPLETED (draft) / handoff FAILED | retry handoff | handoff identity (PO-17) | draft intact | none | maybe | yes |
| Submit validation failed | draft stays Active | fix + resubmit | draft id | draft intact | none | yes (resolve blocked) | yes |
| Duplicate request | SKIPPED | — | Active-lookup key | existing draft | none | no | yes |
| Lock unavailable | SKIPPED | next run | lock key | — | none | no | yes |
| Source data stale | COMPLETED + warning | — | — | — | none | optional | yes |
| Source data missing | BLOCKED | fix source | — | — | none | yes | yes |
| Retry after partial | resumes to COMPLETED | last incomplete step | same calc_run_id | all consistent rows | none | no | yes |
**No empty-success ever** (§B.11 / §G). A failed/blocked new run **never destroys the prior good Active Draft**.

### PO-16. Submit boundary (B-7 permanent rule)
- **PERMANENT RULE: a Recommendation Engine (manual or automatic) shall NEVER mutate a Submitted Business Record** (ARCH §7A/§7B). After Submit → change follows Reject / Cancel / Reopen / New Revision (release mechanics = **B-8**, not decided).
- **Eligible pre-submit statuses** = `{ draft, site_confirmed }`. **Validation before Submit:** no unresolved BLOCKED lines (PO-14); required per-type completeness (Weekly manual line: from + to + `planned_qty>0` + method; Monthly: `order_qty` decided). Logistics/quote validation for shipping happens **downstream at the Weekly Plan**, not at allocation-draft submit.
- **Transition** `draft/site_confirmed → submitted`; writes `submitted_by`/`submitted_at`. **Immutable after Submit:** all quantities + grain + source rows.
- **The Submitted Draft REMAINS in the recommendation tables** (marked `submitted`, as audit lineage); the **official downstream record is COPIED** (request_orders / shipping_plans) by the **separate handoff command** — Recommendation Draft Submit does **not** itself create the Request Order or Weekly Plan (matches the amendment's "Create/Update Weekly Plan ≠ Submit"). For Monthly, the existing runtime couples "Send Request" (= B-5 write) with marking the source draft submitted in one logical transaction; the contract keeps that coupling for Monthly and keeps Weekly separated.
- **Failure:** fail-closed, no partial official record, resumable. **Idempotent repeated Submit:** a re-submit of an already-submitted/handed-off draft is a **no-op** — never a duplicate downstream record, never a mutation of the existing submitted record. **Interaction with B-5:** the Monthly handoff uses the B-5 §3.9 writer contract. **Excluded:** B-6 (Request→PO atomic conversion), B-8 (cancel/reopen/release).

### PO-17. Recommendation → Request Order handoff (uses B-5 §3.9 exactly)
- **Eligibility:** `submitted`/`site_confirmed` allocation-draft lines with `order_qty > 0`.
- **Input projection → output (B-5 §3.9-13/-14):** draft (`company, country, marketplace, sku, planning_cycle`) + lines (`request_month, request_bucket, order_qty`) → **aggregate to request lines at `company + sku + request_bucket`**, demoting site dims to **1..N `request_order_line_sources`**. `approved_qty = order_qty` at creation (single authority). **Partial-carton preserved** (§37 — never re-rounded). **Zero-qty excluded**; **BLOCKED_CONFLICT excluded**.
- **Idempotency identity (B-5 §3.9-15):** `(planning_cycle, recommendation_type, business_scope, draft_version)` → ≤1 non-cancelled `request_order`; line key `(request_order_id, company, sku, request_bucket)`; source natural key. **Successful-handoff marker:** `request_order` created + source draft marked `submitted` + linkage (`request_orders.source_ref_*` → draft). **Repeated handoff = idempotent no-op** (no duplicate request_order). **Request snapshot immutable; existing Submitted request rows never mutated.** The B-5 writer itself is **NOT implemented here**.

### PO-18. Shipping Recommendation → Weekly Plan handoff
- Boundary owner = `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` + `SHIPPING_ALLOCATION_TO_SHIPMENT_CANONICAL_AMENDMENT_2026-07-27.md`. Canonical invariant: **"Allocation Draft recommends; Weekly Plan decides; Shipment executes."**
- The Allocation Draft (recommendation workspace) **does NOT choose actual carrier/rate** and **does NOT reserve stock**. **"Create/Update Weekly Plan"** (promotes eligible `planned_qty` into `shipping_plans`/`_lines` + automatic Combine) is a **DISTINCT** command from **"Submit for Approval"** (draft → pending_approval) — both owned by the Weekly Plan layer, **outside** this orchestration.
- User-edited `planned_qty` preserved; the **Approved plan is immutable** (no later Combine/Submit alters it; explicit audited reopen only). The **Shipment Draft is the hard-reservation boundary** (reserve = the B-1 Ready-to-Ship transition, owner Architecture Principles §8A.1) — **no reservation at Draft or Plan**. This round does **not** re-decide B-2/B-3 or shipment execution.

### PO-19. Idempotency contract (summary)
Draft resolution = **Active-lookup key** (reuse existing Active). Lines = **natural upsert key** (PO-13). Calc run = **`calculation_run_id`** (retry reuses). Monthly handoff = **B-5 three-level identity** (PO-17). Weekly promotion = the Weekly Plan promotion key (downstream). Submit = **already-submitted → no-op**. The `note` field is **never** an idempotency key (§G line 148).

### PO-20. Purity vs side-effect boundary
The **calculation** (Engine A/B, §39 Ledgers, §40 Allocation, §34A classification) is **PURE / test-verified** — no I/O, no clock, no DB. The **orchestration** (lock, resolve, upsert, submit, handoff, readiness I/O) is **SIDE-EFFECTING**. The contract cleanly separates them: `buildRecommendationLines` invokes the pure core and returns immutable DTOs; the persistence helpers perform all side effects under the lock. `generateRecommendationDraft` is the only place calc-output meets persistence.

### PO-21. Non-goals (explicit)
No implementation of: scheduler, no-arg runners, writer, LockService, persistence, retry/resume, regenerate, user-confirmation dialog, API, UI, Request handoff (B-5 writer), Weekly Plan handoff, Submit guard. No Apps Script / JS / test / DB-header / column / table / index change. No data migration. No B-6 / B-8 decision. No B-7 reopen. No Scenario #34. No Calculation Runtime change. **Implementation status = NOT IMPLEMENTED / NOT STARTED.**

---

## §Weekly-AIPlan. Weekly Shipping AI Plan — Deterministic Pipeline & Logistics Boundary Contract (FROZEN — Decision Only, 2026-08-19, F1-7N-A2)

> **Status: CONTRACT FROZEN — NOT IMPLEMENTED.** Freezes the deterministic Weekly Shipping AI Plan pipeline so F1-7N-B can build it without inventing business logic. Source-priority authority = `SUPPLY_PLANNING_CALCULATION_RULES.md` **§35A** (weekly source axis) + **§35/§40** (frozen allocators, unchanged) + **§21** (logistics objective) + **§20/§24** (overseas) + **§31/§2C.1** (FLOOR). Layer boundary = `SHIPPING_ALLOCATION_TO_SHIPMENT_CANONICAL_AMENDMENT_2026-07-27.md`. Persistence = §Persist-Orch (`generateRecommendationDraft`, `recommendationType="WEEKLY_SHIPPING"`). **NO new Gap/Recommendation engine; NO §39/§40 formula change; NO schema; NO carrier decision in the draft.**

### WA-1. Reused authorities (owners — NOT re-implemented)
| Concern | Owner | Note |
|---|---|---|
| Need / Gap / Required-By | §2C/§2D Engine A + §26/§27A (materialized Inventory Gap) | consumed verbatim; **no second Gap** |
| Overseas allocation | `allocateOverseasSharedPool` (§20/§24/§40) | 18-day survival §20.3 first |
| Factory allocation | `allocateFactoryDeterministic` (§35/§40) | ascending-poolKey, function unchanged |
| Source priority (Overseas→CN→TW→unresolved) | **§35A** (NEW canonical axis) | sequential source passes; CN before TW |
| Shipping FLOOR / residual | `calculateShippingAndResidual` (§31/§2C.1) | `FLOOR(MIN(gap,allocated)/UPC)×UPC` |
| Weekly facts resolver (PURE, EXISTS) | `resolveWeeklyRecommendationFacts` (`supply-planning-source-facts.js`, Round 1M, 35 assertions) | consumes real §40 records; TEST_VERIFIED / UNWIRED |
| Coarse transport method | §21 (default sea; air only for safety) | draft carries coarse method + last-mile only |
| Persistence / orchestration | `generateRecommendationDraft` (§Persist-Orch PO-1..PO-21) | Active-Draft key PA-4 WEEKLY_SHIPPING |
| Draft/Plan/Shipment layer boundary | Shipping Allocation Amendment 2026-07-27 | recommends / decides / executes |

### WA-2. Deterministic pipeline (frozen)
INPUT: materialized Inventory Gap + Required-By · marketplace/site identity · warehouses · overseas inventory · factory inventory · SKU carton metadata (`units_per_carton`) · existing §40 allocation outputs.

1. Consume the EXISTING materialized Gap / Required-By (no recompute).
2. Enumerate eligible destination needs for the scope.
3. Order needs by the **§35 demand axis** (Required-By → `allocation_priority` → stable keys).
4. Allocate **Overseas** source (§20/§24) — 18-day survival protected first.
5. Allocate **Factory `CN_YOUXIN`** residual.
6. Allocate **Factory `TW_SHENGYI`** residual.
7. Apply the shipping **carton FLOOR** (§31) to the allocated qty → `recommended_qty`.
8. Preserve the **production-required residual separately** (unmet after Overseas+CN+TW) — never fabricated.
9. Derive the **coarse** `recommended_shipping_method` + `recommended_last_mile_delivery` from the §21 safety window (default sea; escalate only for 18-day safety / Required-By).
10. Group lines into canonical **Weekly Shipping Recommendation groups** (`recommendation_group_no`; one coarse main mode + one last-mile per group).
11. Build the **WEEKLY_SHIPPING Draft DTO** (header + lines).
12. Pass the DTO to the Recommendation Persistence layer (`generateRecommendationDraft`) — the only place calc-output meets persistence.

OUTPUT: canonical **WEEKLY_SHIPPING** Draft header/lines only.

### WA-3. Field → owner map (draft OUTPUT)
| Output field | Source / formula owner | Persistence owner |
|---|---|---|
| `recommended_source_warehouse_id` / `recommended_destination_warehouse_id` (+ code snapshots) | §35A source axis + §20/§40 records | line (`16_*`) |
| `calculated_gap_qty` / demand & supply snapshots | §2C/§2D + §39 Ledger | line |
| `allocation_sequence` / `recommendation_reason` / `recommendation_flags` | §40 records (modes/reason tokens preserved verbatim) | line |
| `recommended_qty` | `calculateShippingAndResidual` FLOOR (§31) | line (immutable snapshot) |
| `recommended_shipping_method` / `recommended_last_mile_delivery` (coarse) | §21 safety window | **header** (group-level) |
| `recommendation_group_no` | grouping (WA-2 step 10) | header |
| `calculation_run_id` / `draft_version` / `formula_version` / `source_data_as_of` | §Persist-Orch PO-8/PO-9 | header |

### WA-4. Deterministic ordering & reason/flag tokens
- Demand order = §35 (Required-By → priority → company → marketplace → destination → demandKey). Source order = §35A (Overseas → CN_YOUXIN → TW_SHENGYI → unresolved). Line identity = `sku|site_sku|window_code` (PO-13); duplicate → `RangeError`.
- Reason/flag tokens are **preserved verbatim** from §40 (`NORMAL_ALLOCATION` / `PROTECTED_REALLOCATION` / `SHORTAGE_ALLOCATION` / `FACTORY_DETERMINISTIC`, `THREE_PL_REPLENISHMENT_RESERVE`, etc.). New §35A tokens (frozen): `SOURCE_OVERSEAS`, `SOURCE_FACTORY_CN_YOUXIN`, `SOURCE_FACTORY_TW_SHENGYI`, `UNRESOLVED_PRODUCTION_NEED`.

### WA-5. Blocked / missing behavior (fail-closed)
- Missing `units_per_carton` / gap / window_code / sku, or a blocked Ledger demand → **blocked line, `recommended_qty = null`** with the reason (§34A / §39 / §40 ownership). **Valid zero stays 0** (0 ≠ missing). Unmet-after-all-sources → unresolved residual preserved (not blocked, not fabricated).
- MISSING never coerces to 0; no fabricated supply; no default air.

### WA-6. Logistics boundary (Phase 4 — do NOT implement carrier ranking here)
- **AI Plan (this contract):** emits the **coarse** transit type only (`recommended_shipping_method` main mode + `recommended_last_mile_delivery`). It selects **no** `carrier_id`, `rate_card_id`, `lead_time_id`, no exact ETA, no freight/duty/tax.
- **Weekly Shipping Plan (owned by `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` + the Amendment §4.1):** resolves candidate Carrier / Rate Card / Lead Time; rejects routes that cannot meet Required-By; among feasible candidates presents the lowest-cost option; re-quotes when quantity/endpoints/mode changes; user may override before approval; **approval freezes the decision snapshot.** `carrier_lead_times` / `carrier_rate_cards` are consumed **only** by the Weekly Plan, never by the draft.
- **Invariant:** **Allocation Draft recommends · Weekly Plan decides · Shipment executes.**

### WA-7. Runtime readiness map (next slices)
> **F1-7N-B status (2026-08-19): WEEKLY AI PLAN PURE SOURCE-ALLOCATION BUILDER = IMPLEMENTED / TEST VERIFIED** — `assets/js/core/supply-planning-weekly-source-allocation.js` (`window.KM.weeklySourceAllocation.buildWeeklySourceAllocation`), `weekly-ai-plan-source-allocation-f1-7n-b-r1.test.js` **40 assertions** (all 13 §35A.5 scenarios + monthly-unchanged + purity). PURE composition over the frozen `allocateOverseasSharedPool` / `allocateFactoryDeterministic` (§40 UNCHANGED — 112 assertions preserved; Golden #19 preserved) + `resolveWeeklyRecommendationFacts`; CN_YOUXIN→TW_SHENGYI via sequential source passes. **Persistence = NOT IMPLEMENTED · API = NOT IMPLEMENTED · UI = NOT IMPLEMENTED · Scheduler = NOT IMPLEMENTED · Weekly Plan promotion/logistics = NOT IMPLEMENTED.** No DB/schema/Apps Script/frontend; no reservation; no Request/PO.

| Slice | Scope |
|---|---|
| **F1-7N-B** | Weekly AI Plan **pure source-allocation builder** — realize §35A over `resolveWeeklyRecommendationFacts` (Overseas→CN→TW→unresolved; FLOOR; coarse method); test-first (the §35A.5 13 scenarios). No I/O. **— IMPLEMENTED (2026-08-19).** |
| **F1-7N-C** | Weekly Recommendation **Draft persistence/orchestrator wiring** — `generateRecommendationDraft(WEEKLY_SHIPPING)` → `shipping_allocation_drafts`/`_lines` via the frozen §Persist-Orch/§Persist-Adapter (LockService, natural-key upsert, user-edit protection). |
| **F1-7N-D** | **AI Plan UI → `generateRecommendationDraft(WEEKLY_SHIPPING)`** for the on-screen scope + **scheduled-run parity** (same core as `runWeeklyShippingRecommendation`). |
| **F1-7N-E** | **Weekly Shipping Plan promotion** + actual logistics/quote decision wiring (WA-6 Weekly Plan owner; Carrier/Rate/Lead-Time). |
| **F1-7N-F** | Scheduler acceptance / idempotency / retry / user-edit protection / live verification. |

### WA-8. Non-goals (explicit)
No second Gap engine; no second recommendation engine; no §39/§40 formula change; no frontend recommendation math; no factory→company inference; no new Request Order semantics; no schema/DB migration; no carrier/rate/lead-time/ETA/cost in the draft; no automatic approval; no automatic shipment creation; no stock reservation. **Implementation status = NOT IMPLEMENTED / NOT STARTED.**

### WA-9. Weekly demand-grain / survival / weight / factory-identity authority (FROZEN — F1-7N-D0-A, 2026-08-19; USER-confirmed; decision only)
> **Status: AUTHORITY FROZEN — assembler NOT IMPLEMENTED.** Owner of record = `SUPPLY_PLANNING_CALCULATION_RULES.md` **§35A.7** (full contract). This resolves the D0/D0-A HALTs (`WEEKLY_AI_PLAN_BACKEND_FACT_AUTHORITY_MISSING`, `FACTORY_IDENTITY_REFERENCE_VALUES_UNCONFIRMED`, `WEEKLY_SURVIVAL_NEED_GRAIN_NOT_DEFINED`, `WEEKLY_MULTIWINDOW_DEMAND_WEIGHT_DOUBLE_COUNT`) so the D0-B assembler can be built without inventing business logic. Executable guards: `assets/tests/weekly-ai-plan-demand-authority-f1-7n-d0-a-r1.test.js`.

- **Count-once global invariant** across horizons / receivers / demands / Overseas+CN+TW pools / survival / `demandWeight` / allocation / persisted lines (§35A.7).
- **Demand grain:** Horizon stays *cumulative* (`horizons[].gapQty`); the Weekly adapter projects *incremental* need `incrementalNeed(n) = max(0, cum(n) − runningMax(cum(1..n−1)))`. Only `incrementalNeed>0` becomes demand. Monthly `calculatedGap` is never weekly demand; `calculatedGap := incrementalNeedQty` is a DTO alias at the F1-7N-B boundary only.
- **Survival once:** `ceil(18 × canonicalDailyDemand)` (existing owner) attached to the **earliest `incrementalNeed>0` window** per `sku+destinationWarehouseId` lane; later windows 0.
- **`demandWeight` conserved:** `Σ(window demandWeight) == canonical lane demandWeight` (split ∝ incrementalNeed) — fixes the multi-window double-count in `allocateOverseasSharedPool` (no per-site grouping, `supply-planning-allocations.js:99-101`); time priority stays on Required-By / `allocation_priority`.
- **`demandKey` = `{sku}|{destinationWarehouseId}|{windowCode}`**, identical across facts / receivers / factory demands / allocation joins.
- **Factory identity (USER-confirmed exact `warehouse_id`; NO schema change):** `CN_YOUXIN → WH-TW-CN-FACTORY-YOUXIN`, `TW_SHENGYI → WH-TW-TW-FACTORY-RES`. Derived from the exact `warehouse_id` **only** (never country/company/name/code/token); each must be an existing `FACTORY` + `is_factory_warehouse=TRUE` + `is_active=TRUE` row, no overlap; unknown/overlap/missing → **FAIL CLOSED**.
- **`formula_version = WEEKLY_AI_PLAN_V1`** (never `ORDER_PLANNING_GAP`); **`source_data_as_of` = canonical `maxAsOf(...)`** (never `Date.now()`/execution time).
- **Weekly ≠ Procurement:** writes only `shipping_allocation_drafts`/`_lines`; no Request Order / PO; unresolved factory shortage is informational; monthly procurement separate.

**Readiness update:** `WEEKLY_DEMAND_GRAIN_AUTHORITY_READY = YES` · `WEEKLY_COUNT_ONCE_AUTHORITY_READY = YES` · `FACTORY_IDENTITY_AUTHORITY_READY = YES` · `D0_IMPLEMENTATION_AUTHORITY_READY = YES`.

**F1-7N-D0-B status (2026-08-19): backend fact assembler = IMPLEMENTED / TEST VERIFIED** — `assets/js/core/supply-planning-weekly-input-assembler.js` (`KM.weeklyInputAssembler.assembleWeeklySourceAllocationInput`), 56 guards, honoring §35A.7 (incremental projection · survival-once · weight conservation · demandKey · factory identity fail-closed) and feeding the frozen F1-7N-B builder. PURE; no I/O.

**F1-7N-D-1 status (2026-08-19): weekly generation-pipeline core + bundle integration = IMPLEMENTED / TEST VERIFIED.** `assets/js/core/supply-planning-weekly-recommendation-runtime.js` (`KM.weeklyRecommendationRuntime.generateWeeklyShippingRecommendationDraft(request, deps)`) is the ONE canonical generation owner brain — composes assembler → F1-7N-B builder → F1-7N-C1 persistence, returns a bounded result DTO, fail-closed (no persist) on bad scope / factory identity / active conflict; 29 guards (fake repo/lock deps). The Apps Script bundle now exports the weekly runtime globals **KMWSA / KMWIA / KMWRD / KMWRT** (`90_generated_supply_planning_bundle.gs`, 44 modules; bundle-export guard 29/0). **Still PURE — no `.gs` owner/router, no UI, no scheduler wired yet.** Runtime chain (harvest → generate → persist) proven end-to-end in Node via fakes; live verification is deferred to the wiring slices.

**Next (decomposed live-verified slices):** **F1-7N-D-2** — thin Apps Script I/O shell `generateWeeklyShippingRecommendationDraft_(request)` that harvests canonical facts (KMHP horizons · `gapOpReadSupplyPoolFacts_` · KMPA/KMAF/KMSF · `recGenUpcBySku_` · `maxAsOf`; KMPA/KMAF invoked once with the full multi-site receiver set so §7 `demandWeight` normalizes across sites) + wires real KMPR/KMPL deps into `KMWRT` + router action `weeklyAiPlan.generate`. **F1-7N-D-3** — manual AI Plan UI cutover (backend call + scoped draft readback; distinct from Recalculate). **F1-7N-D-4** — Monday scheduler parity (per-scope enumeration → SAME owner). Each requires USER live smoke after deploy.

---

## §Persist-Adapter. Production Persistence Adapter / Repository Contract (FROZEN — Decision Only, 2026-08-03, Phase 2C Round 1C)

> **Status: CONTRACT FROZEN (Round 1C) — SLICE 1 (Round 1D) — LOCKSERVICE (Round 1E) — PLAN BUILDER + APPS SCRIPT BUNDLE + LOCKED ORCHESTRATOR (Round 1G) — LOCKED-PATH ENFORCEMENT + LOCKED USER-EDIT + TERMINAL-GUARD UNIFICATION (Round 1H) all IMPLEMENTED / TEST VERIFIED (2026-08-03).** Maps the pure Round 1B core (`assets/js/core/supply-planning-persistence.js`, IMPLEMENTED / 96 tests) to the real Apps Script / Google Sheets tables.
>
> **Round 1H locked-path enforcement + locked user-edit + terminal-guard unification (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED):** every production-reachable Recommendation-Draft mutation route is now lock-enforced and no unlocked bypass remains (proven by an executable route-inventory audit — `assets/tests/supply-planning-route-inventory.test.js`, **32 assertions**, classifies every recommendation action and FAILS on any `FORBIDDEN_PUBLIC_WRITE`). (1) **Locked user-decision-edit** command `assets/js/core/supply-planning-user-edit.js` (`…user-edit.test.js`, **37 assertions**): `runUserDecisionEdit` runs acquire → reload → terminal guard → optimistic-token revalidation → `KMPR.applyUserDecisionEdits` (allowlisted decision fields + explicit `user_edited`/`user_edited_by`; **recommended_qty snapshot + lineage preserved; terminal LINES never mutated; INSERT/UPDATE/SUPERSEDE-reconcile; NO calculation run created**) → release-in-finally; a simple quantity edit is NEVER mapped to a regeneration. (2) **Canonical terminal vocabulary** now lives ONCE in `KMPR` (`TERMINAL_DRAFT_STATUSES`={submitted,cancelled}; `LINE_TERMINAL_STATUSES`=+superseded/superseded_user_review; `GENERATION_BLOCKED_STATUSES`=+partially_submitted, owner-derived from `15_`) and is shared by the orchestrator + user-edit; `EDITABLE_DECISION_FIELDS` is the per-type allowlist (`recommended_qty` is NOT editable). (3) **Apps Script enforcement (source mirror):** `25_recommendation_user_edit.gs` adds the locked user-edit handler (`updateRecommendationDecisionLocked`) + a read-only token getter (`getRecommendationDraftToken`) with a keyed-delta write; the legacy `15_` line route is now a thin ADAPTER into the locked user-edit (the prior unlocked delete/upsert body is retired — its tested canonical equivalent is `KMPR.applyUserDecisionEdits`); the `15_`/`16_` header routes + `16_` line route acquire the ScriptLock + terminal-guard before their (private) keyed cores; the client (`operation-system-db-api.js`) does read-before-write token delivery (§14). **Shipping (`16_`) remains DEPLOYMENT-GATED (scaffold): lock + terminal guard + keyed-by-line-id upsert enforced, but full optimistic-token + KMUE natural-key unification for shipping is a documented PENDING item.** **Source-facts reader = PENDING; Scheduler / Trigger / Submit / Request writer / Weekly-Plan / PO = NOT IMPLEMENTED; no B-6/B-8; no deploy / no live migration; the full-table `23_ rprWriteBack_` is NOT reachable from any locked route.**
>
> **Round 1J Production Source-Facts Reader — CONTRACT FROZEN + CLEAN SLICE (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED; 2026-08-03).** Decomposed (user-directed) into a frozen contract + the cleanly-owned, test-verifiable pure slice; the allocation-input projector + Weekly/Monthly `recommendedQty` assembly + Apps Script reader (`26_…`) + locked-orchestrator wiring are frozen below and deferred to the following implementation round.
>
> **§Source-Facts CONTRACT (FROZEN):** the reader is a PURE, READ-ONLY, JSON-safe, deterministic bridge (no clock/random/locale; MISSING is never silently 0 — only an explicit source 0 yields 0; identity ambiguity BLOCKS, never first/latest; never writes a decision). Public API (namespace **`KMSF`**, reserved for the deploy bundle next round): `classifySourceReadiness`, `resolveSourceIdentity`, `projectDemandLedger`, `projectCurrentStockSupplyLedger`, `adaptIncomingSupplyCandidates` (implemented now); `projectSupplyLifecycle` (shipment/incoming → §39 supply lifecycleBucket via the existing B4-R4/R6 adapters — **IMPLEMENTED / TEST VERIFIED in Round 1K**, see below); `projectAllocationInputs` (Ledger outputs + planning facts → §40 allocator DTOs → real allocators — **IMPLEMENTED / TEST VERIFIED in Round 1L**, see below); `resolveWeeklyRecommendationFacts` (allocation results + planning facts → Weekly Shipping recommendation facts via `calculateShippingAndResidual` — **IMPLEMENTED / TEST VERIFIED in Round 1M**, see below); and `resolveMonthlyRecommendationFacts` (Net Order Need + factory allocation → Monthly Order recommendation facts via `calculateSuggestedOrderQty` carton CEILING — **IMPLEMENTED / TEST VERIFIED in Round 1N**, see below). The whole frozen §Source-Facts public API is now source-present/test-verified (the Apps Script bundle port + orchestrator wiring remain the reader round). **Readiness vocabulary:** `OK / STALE_SNAPSHOT / MISSING_SNAPSHOT / MISSING_FORECAST / MISSING_SALES_BASIS` (owned by §34A `classifyPlanningDataState`, reused) + adapter-layer `IDENTITY_CONFLICT / DUPLICATE_SOURCE / BLOCKED_CONFLICT / SOURCE_NOT_AVAILABLE`. **`sourceDataAsOf`:** only Amazon snapshots + `overseas_inventory_snapshot` carry `snapshot_date` (+ Amazon `synced_at`); all other tables expose only `updated_at`/`created_at` — the reader computes a per-source as-of map + one summary; no `imported_at`/`source_data_as_of` column exists. **Allocation-input projector field-derivation contract (FROZEN, owners cited; NOT IMPLEMENTED):** `survivalNeedQty = CEILING(18 × daily_demand)` (§20.3/§24.4, `daily_demand` via `normalizedAvgSalesPerDay` §22 or forecast §2D); `allocationPriority = marketplaces.allocation_priority` (§20.4); `fulfillmentModel = marketplace_skus.fulfillment_model` (§24.1); `demandWeight = FC Share §7 (forecast-driven) | sales/run-rate share §24.5 (sales-driven)`; `eligiblePoolTypes` = warehouse-side eligibility `company+country+warehouse_type='3PL'+is_active` + FBA composition (§23.6/§24.9); `eligibleFactoryWarehouseIds` = `is_factory_warehouse` + company (§40/§35). **`recommendedQty` assembly contract (FROZEN, owners cited; NOT IMPLEMENTED):** Weekly = `calculateShippingAndResidual` FLOOR (§31/§2C.1) over §40 overseas/factory allocation output; Monthly = Engine A→B→reallocation→Net Order Need→`calculateSuggestedOrderQty` carton CEILING (§12/§32/§14 + REQ_PO §12.13/§527). **Shipment lifecycle → §39 bucket mapping is the adapter's responsibility (§39.5); canonical status enum post-B-4 is consistent** (`draft→ready_to_ship→shipped→in_transit`; `delivered`≠`received`; `arrived`/`received`/`closed` + event layer canonical-but-NOT-YET-EMITTED → those buckets read empty, never mis-derived).
>
> **Round 1J CLEAN SLICE (IMPLEMENTED / TEST VERIFIED):** `assets/js/core/supply-planning-source-facts.js` (`…source-facts.test.js`, **37 assertions**): (1) `classifySourceReadiness` reuses §34A `classifyPlanningDataState`; (2) `resolveSourceIdentity` — deterministic (warehouse_id authority, one Master SKU→many marketplaces, duplicate marketplace-SKU→`IDENTITY_CONFLICT`, duplicate master→`DUPLICATE_SOURCE`, never first/latest); (3) `projectDemandLedger` maps forecast/event/safety rows → §39 `buildDemandLedger` (REGULAR/SPECIAL_EVENT count-once/SAFETY; missing quantity → issue, never 0); (4) `projectCurrentStockSupplyLedger` maps FBA/THREE_PL/FACTORY inventory-authority rows → §39 `buildSupplyLedger` (`CURRENT_STOCK`; pools never merged; missing → issue, explicit 0 valid); (5) `adaptIncomingSupplyCandidates` reuses B4-R3 `buildKmShipmentSupplyCandidate` + B4-R4 `adaptKmShipmentIncomingCandidate` (no lifecycle-bucket invention). It is NOT yet in the Apps Script bundle and NOT wired into the orchestrator (the `24_` `SOURCE_READER_PENDING` stub is unchanged) — deferred to the implementation round. Live Calculation/Ledger reuse only; no reimplementation; no persistence; enforcement unchanged.
>
> **Round 1K SUPPLY LIFECYCLE PROJECTOR (SOURCE PRESENT / TEST VERIFIED):** `projectSupplyLifecycle` landed in `assets/js/core/supply-planning-source-facts.js` (`…supply-lifecycle.test.js`, **68 assertions**; existing `…source-facts.test.js` **37** preserved). It maps already-resolved source facts → canonical §39.5 `lifecycleBucket` entries and calls the REAL `buildSupplyLedger` (count-once owned by the Ledger, never duplicated). **Table-specific source-status mapping (adapter-owned per §39.2/§39.4):** Production/PO (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC §1`) `issued/in_production/partial_completed/completed → COMMITTED_PRODUCTION`, `draft → DRAFT`, `partial_shipped/shipped → OMIT (ownership transferred to the Shipment, count-once)`, `closure/cancelled → CANCELLED_INVALID`; Shipping Plan `approved → APPROVED_SHIPPING_PLAN`, `draft/pending_approval → DRAFT`, `cancelled → CANCELLED_INVALID`, `completed → OMIT (transferred)`; Shipment (via the REAL B4-R3/R4/R6 chain) `ready_to_ship → APPROVED_SHIPPING_PLAN` (pre-dispatch commit — reserved, NOT yet physically shipped, `SHIPMENT_CENTER_SPEC §4/§15.1`), `shipped/in_transit → SHIPPED_IN_TRANSIT`, `arrived → DELIVERED_NOT_RECEIVED`, `received → RECEIVED_NOT_REFLECTED`, `draft → DRAFT`, `cancelled → CANCELLED_INVALID`, `closed → OMIT (CURRENT_STOCK authority)`; Route/event `delivered/arrived → DELIVERED_NOT_RECEIVED`, `received → RECEIVED_NOT_REFLECTED`, `correction/reversal → CORRECTION_REVERSAL`; Receiving `confirmed → RECEIVED_NOT_REFLECTED`, `reversed → CORRECTION_REVERSAL`; Current Stock reuses the Round 1J shared builder (`CURRENT_STOCK`); Correction → `CORRECTION_REVERSAL`. **Qualified Incoming authority reused** for count-once (Gate 9 posted-to-current-stock / Gate 10 other-bucket → lineage skipped) with duplicate/qty conflicts left to `buildSupplyLedger` (`SUPPLY_LINEAGE_CONFLICT` / `PHYSICAL_POOL_QTY_CONFLICT`, fail-closed). Unknown status fails closed (issue, no active entry); missing quantity is an issue, never 0 (explicit 0 valid/visible); negative fails closed as an issue (no throw); malformed structural input → TypeError; deterministic + pure (permutation-invariant, fresh objects, input never mutated). **Real delivered/received/received-not-reflected production sources DO NOT yet emit** — the event ledger (`SHIPMENT_ROUTE_AND_EVENT_SPEC §Implementation status`) and receiving Runtime (`WAREHOUSE_OPERATIONS_SPEC`) are spec-only, so `DELIVERED_NOT_RECEIVED` / `RECEIVED_NOT_REFLECTED` read empty in production and are exercised by fixtures only; today only `CURRENT_STOCK` (inventory snapshot) and shipment on-the-way statuses are actually produced. **NOT in the Apps Script bundle (KMSF bundle inclusion pending the reader round); orchestrator `SOURCE_READER_PENDING` stub UNCHANGED; Weekly+Monthly `resolveRecommendationFacts` NOT IMPLEMENTED; Scheduler / Trigger NOT IMPLEMENTED; no deploy.** Golden Matrix unchanged **39 / 1 / 0**.
>
> **Round 1L ALLOCATION INPUT PROJECTOR (SOURCE PRESENT / TEST VERIFIED):** `projectAllocationInputs` landed in `assets/js/core/supply-planning-source-facts.js` (`…allocation-input.test.js`, **47 assertions**; existing `…source-facts.test.js` **37** + `…supply-lifecycle.test.js` **68** preserved). It consumes the REAL `buildDemandLedger` output (`effectiveDemandQty` is the demand authority — never recomputed; `BLOCKED_CONFLICT` entries surfaced + excluded) and the REAL `buildSupplyLedger` output (`effectiveSupplyQty` authority; FBA/THREE_PL vs FACTORY kept separate; blocked pools surfaced + excluded; no lifecycle reclassification), joins **caller-supplied planning facts** by `demandKey`, forms the exact §40 allocator DTOs, and calls the REAL `allocateOverseasSharedPool` + `allocateFactoryDeterministic` (never reimplemented — no mode selection / survival-first / weighted / largest-remainder / FIFO / conservation / tie-break copied). **Field ownership (pure Sheet-free round → planning facts REQUIRED explicitly, never fabricated; owners cited):** `survivalNeedQty` accepted explicit OR derived `= ceil(18 × dailyDemand)` (§20.3/§24.4); `allocationPriority` (marketplaces.allocation_priority §20.4), `demandWeight` (FC-share §7 / sales-share §24.5), `fulfillmentModel` (marketplace_skus.fulfillment_model §24.1, falls back to resolved `identity.fulfillmentModel`), `eligiblePoolTypes` (warehouse eligibility §23.6/§24.9; FBA/THREE_PL only, FACTORY rejected, deduped/sorted, empty = unallocated), `eligibleFactoryWarehouseIds` (is_factory_warehouse §40/§35; warehouse_id not code, deduped/sorted) — each missing/invalid fact → issue, no fabricated default. Overseas scope validated to one company/country/masterSku (mismatch fails closed). Real overseas NORMAL/PROTECTED/SHORTAGE modes, FBA/THREE_PL lane separation (no cross-type fallback), `THREE_PL_REPLENISHMENT_RESERVE` for platform_fulfilled, and factory earliest-requiredByDate FIFO are verified through the real allocators; conservation holds. Deterministic + pure (permutation-invariant, fresh objects, input never mutated; malformed → TypeError; explicit 0 valid). **Does NOT compute persisted `recommendedQty`; Plan Builder NOT invoked; NOT in the Apps Script bundle; orchestrator `SOURCE_READER_PENDING` stub UNCHANGED; Weekly+Monthly `resolveRecommendationFacts` / Apps Script Reader / Scheduler / Trigger NOT IMPLEMENTED; no deploy.** Golden Matrix unchanged **39 / 1 / 0**.
>
> **Round 1M WEEKLY RECOMMENDATION FACTS RESOLVER (SOURCE PRESENT / TEST VERIFIED):** `resolveWeeklyRecommendationFacts` landed in `assets/js/core/supply-planning-source-facts.js` (`…weekly-recommendation.test.js`, **35 assertions**; existing `…source-facts.test.js` **37** + `…supply-lifecycle.test.js` **68** + `…allocation-input.test.js` **47** preserved). It consumes the REAL `projectAllocationInputs` output (real `allocateOverseasSharedPool`/`allocateFactoryDeterministic` records — never re-run) + caller Weekly planning facts and produces deterministic Weekly Shipping recommendation lines. **Frozen Weekly grain** = `WEEKLY_SHIPPING` scope `planning_cycle+company+country+marketplace+source_page` + `lineKey = sku|site_sku|window_code` (persistence repo config); duplicate line identity → `RangeError`. **recommendedQty ownership:** the named `calculateShippingAndResidual` FLOOR helper (§31/§2C.1) over the ALLOCATED source — `recommendedShippingQty = FLOOR(MIN(calculatedGap, totalAllocated)/UPC)×UPC` — **never reimplemented, never the Monthly carton CEILING, never order_qty/planned_qty**; ≤ allocated ≤ gap (conservation). **calculatedGap ownership:** caller value OR the named `calculateGap` owner when its four inputs are supplied — never UI-displayed Gap. **Multi-source (frozen §20 schema B):** one consolidated line per demand + `allocationBreakdown[]` (per-source pool/warehouse/qty/sequence/reason preserved; the allocator's own survival vs weighted split kept); `sourcePoolKey/Type/WarehouseId` populated only for a single distinct source pool, else null. Allocation `NORMAL_ALLOCATION`/`PROTECTED_REALLOCATION`/`SHORTAGE_ALLOCATION`/`FACTORY_DETERMINISTIC` mode preserved (not re-derived); §40 reason tokens (incl. `THREE_PL_REPLENISHMENT_RESERVE`) preserved verbatim. **Blocked line → `recommendedQty = null`** (missing window_code / gap / UPC / sku, or a blocked Ledger demand) with the reason; **valid zero stays 0** (zero ≠ missing); unallocated demand preserved. Live UI Gap/Suggested Qty and any `planned_qty`/`order_qty` input are ignored (never authority; optional `liveAnalysis` echoed separately); output contains no decision-authority quantity. Deterministic + pure (permutation-invariant, fresh objects, input never mutated; malformed → TypeError; duplicate line key → RangeError). **Plan Builder compatibility (read-only check, NOT invoked):** `recommendationType/planningCycle/businessScope/formulaVersion/sourceDataAsOf/recommendedQty` directly compatible; a future mechanical adapter must remap the line's camelCase `masterSku/siteSku/windowCode` → snake_case lineKey columns `sku/site_sku/window_code` and `blockedReason`→blocked flag, and supply run-level `mode/calculationRunId/draftVersion` (orchestrator-owned) — no business-decision contract gap. **Monthly `resolveRecommendationFacts` / Apps Script Reader / orchestrator stub / Scheduler / Trigger NOT IMPLEMENTED; Plan Builder NOT invoked; NOT bundled; no deploy.** Golden Matrix unchanged **39 / 1 / 0**.
>
> **Round 1N MONTHLY RECOMMENDATION FACTS RESOLVER (SOURCE PRESENT / TEST VERIFIED):** `resolveMonthlyRecommendationFacts` landed in `assets/js/core/supply-planning-source-facts.js` (`…monthly-recommendation.test.js`, **42 assertions**; existing `…source-facts.test.js` **37** + `…supply-lifecycle.test.js` **68** + `…allocation-input.test.js` **47** + `…weekly-recommendation.test.js` **35** preserved). It consumes the REAL `projectAllocationInputs` factory-allocation records (real `allocateFactoryDeterministic` — never re-run) + caller Monthly planning facts and produces deterministic Monthly Order recommendation lines. **Frozen Monthly grain** = `MONTHLY_ORDER` scope `planning_cycle+company+country+marketplace+draft_purpose+sku` + `lineKey` internally `master_sku|request_month|request_bucket` (Plan Builder's `request_month|request_bucket` within a per-sku header); duplicate line identity → `RangeError`. **Net Order Need ownership:** accepted explicit OR the named owners — `sumRemainingShortages` (§12/§32) OR `calculateGap` Engine-A remaining need (§10) — never UI Suggested Order / edited order_qty / displayed Gap; clamps at 0 where the formula clamps; preserved UNROUNDED. **recommendedQty ownership:** the named `calculateSuggestedOrderQty` carton-CEILING helper (§14/§31) over Net Order Need — `recommendedQty = CEILING(netOrderNeed/UPC)×UPC` — **rounded exactly ONCE over the line total, demand-based (NOT capped by factory allocation), never the Weekly FLOOR, never reimplemented**; `recommendedQty ≥ netOrderNeed` when need > 0; `cartonQty = recommendedQty/UPC` is a display fact. **Factory allocation is preserved as lineage ONLY** (`allocationBreakdown[]` per-source pool/warehouse/qty/sequence/reason; `sourcePoolKey/WarehouseId` only for a single distinct pool, else null; `unallocatedQty` preserved) — it never caps the order recommendation. **Carton boundary:** `unitsPerCarton` must be finite positive integer (missing/zero/negative/fractional → line blocked; never defaulted to 1). **Blocked line → `netOrderNeed`/`recommendedQty` = null** (missing request_month/request_bucket/master_sku, missing/invalid Net Order Need, missing UPC, or a blocked Ledger demand) with the reason; **valid zero stays 0** (zero ≠ missing). User `order_qty`/`planned_qty`/`approved_qty`/partial-carton and live UI fields are ignored (never authority; optional `liveAnalysis` echoed separately); output contains no user/decision-authority quantity — **Scenario #34 remains IMPLEMENTATION_PENDING** (partial-carton user Order Qty / UI-state / persistence is downstream of the engine recommendation). Deterministic + pure (permutation-invariant, fresh objects, input never mutated; malformed → TypeError; duplicate line key → RangeError). **Plan Builder compatibility (read-only, NOT invoked):** `recommendationType/planningCycle/businessScope/formulaVersion/sourceDataAsOf/recommendedQty` directly compatible; a future mechanical adapter remaps camelCase `requestMonth/requestBucket` → snake_case lineKey columns `request_month/request_bucket`, `masterSku`→`scope.sku`, `blockedReason`→blocked flag, and supplies run-level `mode/calculationRunId/draftVersion` (orchestrator-owned) — no business-decision gap. **Apps Script Reader / orchestrator stub / Scheduler / Trigger NOT IMPLEMENTED; Plan Builder NOT invoked; Request Order/PO NOT created; NOT bundled; no deploy.** Golden Matrix unchanged **39 / 1 / 0**; Scenario #34 Pending.
>
> **Round 1O RECOMMENDATION FACTS → PLAN BUILDER BRIDGE (SOURCE PRESENT / TEST VERIFIED):** `bridgeRecommendationFactsToPlan` landed in the NEW pure module `assets/js/core/supply-planning-plan-bridge.js` (`…plan-bridge.test.js`, **60 assertions**; existing `…weekly-recommendation.test.js` **35** + `…monthly-recommendation.test.js` **42** + `…plan-builder.test.js` **50** + `…persistence-plan-builder.test.js` **44** + `…recommendation-orchestrator.test.js` **37** preserved). It is a PURE deterministic **schema translation only** — it consumes the EXACT output of `resolveWeeklyRecommendationFacts` / `resolveMonthlyRecommendationFacts` and returns the exact existing Plan Builder (`buildRecommendation`) input shape, verified by feeding the bridged output into the REAL Plan Builder in-test. **It recalculates NOTHING** (no Gap / Net Order Need / recommendedQty; no Allocation re-run) and preserves `recommendedQty/calculatedGap/netOrderNeed/cartonQty/unallocatedQty/formulaVersion/sourceDataAsOf` by exact equality. **Mechanical line remap** (SINGLE SOURCE OF TRUTH = persistence-repo `TABLES` grain): Weekly `masterSku/siteSku/windowCode` → `sku/site_sku/window_code`; Monthly `requestMonth/requestBucket` → `request_month/request_bucket` with `masterSku` validated against `scope.sku` (Monthly PB lineKey drops sku → it lives in scope). **Blocked semantics:** `blockedReason !== null` → Plan Builder `blocked = true` + `reason` (recommendedQty stays `null`, never a fabricated 0); a valid zero `recommendedQty` stays 0. **Run-level ownership:** `recommendationType/planningCycle/businessScope/formulaVersion/sourceDataAsOf` come from — and are propagated verbatim out of — the facts; `mode` (caller/orchestrator, mirror of Plan Builder `SCHEDULED_REFRESH`/`MANUAL_REGENERATE`) + `calculationRunId` (caller) are REQUIRED and NEVER generated (no clock / no random ID); `draftVersion` (caller/persistence) is a passthrough — preserved when a positive integer, `null` when absent (never generated), `RangeError` when invalid. **Structural-blocked lines with an incomplete Plan Builder natural key** (e.g. MISSING_SKU / empty site_sku / MISSING_WINDOW_CODE) CANNOT be Plan Builder lines → surfaced as DATA in `metadata.unmappableBlockedLines` (never thrown, never silently dropped); business-blocked lines that DO carry a full key are emitted as Plan Builder blocked line facts. **Allocation breakdown + full runtime lineage + preserved calc values** are kept in NON-authoritative `metadata.lineMetaByKey` (never re-persisted as authority, never used as Plan Builder natural identity; the Plan Builder line carries only the runtime-only lineage OBJECT slot Plan Builder accepts). **Fail-closed:** scope mismatch (line company/country/marketplace/`masterSku` vs run scope) → `RangeError`; duplicate mapped Plan Builder line key → `RangeError` (naturally reachable for Monthly when two SKUs share `request_month|request_bucket` and scope omits sku). Deterministic + pure (permutation-invariant, sorted by mapped key, fresh objects, input never mutated; malformed → TypeError). **Plan Builder compatibility = TEST VERIFIED** (real `buildRecommendation` accepts bridged Weekly + Monthly facts; `generation_type`/`userQty` column stay Plan-Builder/Persistence-owned; no duplicate line creation; deterministic). **Persistence bridge / PersistencePlan NOT implemented this round; Persistence NOT invoked; Apps Script Source Reader / orchestrator source stub / Scheduler / Trigger NOT IMPLEMENTED; KMSF + KMPBR bundle integration PENDING; Request Order / PO NOT created; Scenario #34 Pending; NOT bundled; no deploy.** Golden Matrix unchanged **39 / 1 / 0**.
>
> **Round 1P APPS SCRIPT RECOMMENDATION SOURCE READER (SOURCE PRESENT / TEST VERIFIED):** `supply-planning-source-reader.js` (NEW pure module; `…source-reader.test.js`, **48 assertions**; all prior suites preserved). It is the ONE canonical Source for the Recommendation Runtime and owns EXACTLY `Google Sheet Row → Domain Object → Runtime DTO` — ONLY row-mapping / null-normalize / type-normalize / enum-normalize / identity-normalize / column-rename / DTO-build. It owns NO business logic (× Gap / Demand / Forecast / Allocation / Recommendation / Priority / 18-day / company-allocation / factory-decision / any runtime decision) and never DERIVES a value — it reads whatever a source column already holds and renames/normalizes it. **Public API:** `readWeeklyRecommendationSource()` / `readMonthlyRecommendationSource()` + shared `createRecommendationSourceReader(config)` (no second reader), plus the identity linker `resolveDemandKeys(dto, demandLedger)`. **Input:** Apps Script Sheet values (2D header rows) OR mock row-objects (`{ sheets:{demand,supply,receivers|factoryDemands,planningFacts}, scope, planningCycle, formulaVersion, sourceDataAsOf, identityTables? }`) — no UI, no DB, no Browser, no SpreadsheetApp. **Output (Source DTO):** `{ recommendationType, planningCycle, businessScope, identity, formulaVersion, sourceDataAsOf, demandLedgerInput:{entries}, supplyLedgerInput:{entries}, receiverFacts|factoryDemandFacts, weeklyPlanningFacts|monthlyPlanningFacts, issues }` — feeds the resolver PIPELINE (buildDemandLedger/buildSupplyLedger → projectAllocationInputs → resolveWeekly/Monthly), NOT the Plan Builder directly. The Ledger-owned `demandKey` is NOT computed here (that is Ledger business logic); the reader emits each fact's natural `demandRef` and `resolveDemandKeys` LINKS it to the ledger-EMITTED demandKey by identity (never recomputing the key; ambiguous ref → fail closed). **Identity-normalize** reuses the frozen `resolveSourceIdentity` when identity tables are supplied (duplicate/ambiguity fail-closed). **Fail-closed, no fallback:** malformed input / non-array sheet / non-object row → TypeError; invalid enum (demand_type/pool_type/fulfillment_model/recommendation_type) → excluded + issue; missing required (source_ref/warehouse_id/quantity/…) → excluded + issue (MISSING ≠ ZERO — only explicit source 0 yields 0); duplicate line identity (sku|site_sku|window_code / sku|request_month|request_bucket) and ambiguous demandRef → RangeError; planning_cycle / formula_version row mismatch → excluded + issue. **Pure/deterministic** (No Date.now / No Math.random / No locale / No Cache / No LockService; input never mutated; fresh output). **Integration = TEST VERIFIED end-to-end** (Reader → Ledger → projectAllocationInputs → Weekly/Monthly Resolver → Bridge → Plan Builder; Weekly recommendedQty 96, Monthly CEILING 24; natural keys intact through Plan Builder; NO persistence invoked). **CANONICAL GROUNDING (Database-First survey, Round 1P):** DB-CONFIRMED source columns (cited: DATABASE_RELATIONSHIP_MAP / 15_/16_ draft-line headers / marketplaces / marketplace_skus / sku_details / warehouses) = `sku` (the Master SKU — NOT `master_sku`), `site_sku`, `units_per_carton`, `window_code`, `calculated_gap_qty`, `request_month`, `request_bucket`, `net_order_need_snapshot`, `warehouse_id`, `allocation_priority`, `fulfillment_model`, `company`, `country`, `marketplace`, `planning_cycle`, `formula_version`, `source_data_as_of`, `recommendation_type`, `source_page`, `draft_purpose`. **DECISION / REMAINING (flagged, not invented):** the canonical recommendation-SOURCE **input** sheet is NOT yet DB-defined — `demand_type`, `source_ref`, `pool_type`, `supply_lineage_ref`, `quantity`, `destination_warehouse_id`, `demand_source_ref`, `survival_need_qty`, `daily_demand`, `demand_weight`, `eligible_pool_types`, `eligible_factory_warehouse_ids` have NO canonical column (the runtime deliberately requires them as caller-supplied facts). The reader's DEFAULT names for those are the DTO-field snake_case rendering, **OVERRIDABLE** via `createRecommendationSourceReader({columns})`, pending a canonical source-sheet definition OR an upstream Forecast→Demand / inventory→Supply projector (both out of scope — forbidden derivation). **Orchestrator source stub NOT REPLACED; NOT bundled (KMSR bundle integration PENDING); Scheduler/Trigger/Submit/Request-writer/PO NOT IMPLEMENTED; Persistence NOT invoked; Scenario #34 Pending; no deploy.** Golden Matrix unchanged **39 / 1 / 0**.
>
> **Round 1S-P1 PRODUCTION SOURCE READER + PROJECTION BOUNDARY (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED):**
> the first Round 1S production prerequisite is implemented (Round 1S correctly HALTED on the production gate; this
> completes only the Apps Script production Sheet reader + projection wrapper + bundle integration — NOT Submit,
> NOT the orchestrator stub replacement, NOT writes). NEW pure module `assets/js/core/supply-planning-source-
> reader-production.js` (`window.KM.sourceReaderProduction` / bundle `KMSRP`; `…source-reader-production.test.js`,
> **38 assertions**) + NEW thin `.gs` wrapper `assets/specs/active/apps-script/26_recommendation_source_reader.gs`.
> **Architecture (all mapping/math REUSED, none reimplemented):** `Google Sheets → 26_…gs (SpreadsheetApp read-only)
> → raw table snapshot {sourceType,sheetName,headers,rows,rowCount,sourceDataAsOfEvidence} → KMSRP (registry +
> header/schema validation + value-preserving row collections) → Round 1P Source Reader (KMSR) → Round 1Q Source
> Integration (KMSI: ledgers → resolveDemandKeys → projectAllocationInputs → Weekly/Monthly resolver → bridge) →
> existing Plan Builder`. **`KMSRP.readRawTableSnapshot(spreadsheet, entry)` is inject-testable** (the `.gs` passes
> `SpreadsheetApp.getActiveSpreadsheet()`; tests pass a fake), so the production read path is Node-test-verified
> without live Sheets. **Read-only source-table registry** (structural facts only — sourceType/sheetName/required/
> optional/identity headers/asOfHeader/applicability; NO business formula): identity/master tables use real names
> (`sku_details`/`marketplace_skus`/`warehouses`); the recommendation source INPUT tables are DTO-convention sheet
> names (overridable via `config.sheetNames`). **Fail-closed (canonical tokens):** missing sheet →
> `SOURCE_NOT_AVAILABLE`, empty → `MISSING_SNAPSHOT`, missing/duplicate/blank required header →
> `MISSING_REQUIRED_HEADER`/`DUPLICATE_HEADER`, row-width → `INVALID_ROW_WIDTH`; a required-source schema failure
> blocks the run (never a fabricated draft). **Value preservation:** numeric 0 / blank / text `"0"` / Date / bool
> kept distinct via raw `getValues()` (no `||0`, no blanket `String`/`Number`, no display values as authority).
> **Identity/readiness + all projection reused** (`resolveSourceIdentity`, ledgers, `projectAllocationInputs`,
> resolvers, bridge) — the reader computes NO Gap/Forecast/survival/weight/recommendedQty/Net-Order-Need/carton.
> **TEST VERIFIED end-to-end (read-only, fake Sheets):** Weekly `recommendedQty 96` + Monthly CEILING(13/12)×12 =
> `24` reach the existing Plan Builder; natural keys intact; `sourceDataAsOf` from snapshot evidence (never the
> clock); demand qty passes through unchanged; NO Sheet writes / NO LockService / NO persistence; pure/deterministic;
> permutation-invariant. **Bundle integration:** the deterministic bundle now ports **20** modules (added
> `KMSF`/`KMBRIDGE`/`KMSR`/`KMSI`/`KMSRP`), reproducible byte-for-byte, full VM load verified (bundle test **45**).
> **Orchestrator NON-integration confirmed:** `24_recommendation_orchestrator.gs` `SOURCE_READER_PENDING` stub is
> UNCHANGED (still present) — its replacement is Round 1S-P2; no router/Web-App route added. **DEFERRED (honest):**
> the upstream `Recommendation Source Projection Runtime` that SHAPES raw DB tables (fc_regular_forecast jan..dec /
> inventory snapshots / calc-engine gap+net-order-need) INTO the DTO-convention source sheets remains SC-9 #1 (NOT
> implemented — forbidden business logic this round); production writer / LockService production enforcement /
> Submit remain NOT IMPLEMENTED / NOT VERIFIED; no deploy; no live Google Sheet verification. Golden Matrix
> unchanged **39 / 1 / 0**; Scenario #34 Pending.
>
> **Round 1S-P4 / 1S-P4-U PRODUCTION LIVE VERIFICATION (NOT PERFORMED — read-only diagnostics prepared):** live
> Google Sheet + real LockService verification of the persistence path is **NOT PERFORMED** (the implementation
> environment has no Apps Script / Sheets / clasp / gcloud / deployment / credential access; Round 1S-P4 correctly
> HALTED). Round 1S-P4-U prepared the **user-operated verification package** (documentation + READ-ONLY diagnostics
> only — no business/persistence logic change; no writes). NEW pure module
> `assets/js/core/supply-planning-verification-diagnostics.js` (`window.KM.verificationDiagnostics` / bundle `KMVD`;
> `…verification-diagnostics.test.js`, **27 assertions**) + NEW thin READ-ONLY `.gs`
> `assets/specs/active/apps-script/28_recommendation_verification_diagnostics.gs`. `KMVD` exposes (all read-only,
> reusing the frozen KMPR/KMPW as the single source of truth): `namespaceReport(env)` (bundle-load smoke —
> namespaces + public functions + module count), `auditDraftTables(spreadsheet)` (five authorized tables exist with
> the exact frozen §2 headers; row counts; Active-Draft grouping by the B-7 Composite Natural Key; duplicate-active
> conflicts; submitted/cancelled counts), `activeDraftAudit(spreadsheet, query)` (single-scope
> CREATE/REUSE/BLOCKED_CONFLICT decision). The `.gs` exposes **PUBLIC editor entrypoints (no trailing underscore →
> selectable in the Apps Script Run menu, Round 1S-P4-U-ENTRYPOINT hotfix):** `verifyRecommendationRuntimeNamespaces()`
> / `auditRecommendationDraftTables()` / `auditActiveDraftForScope(query)` — thin read-only delegators to the private
> `…_` helpers — and NEVER write (no
> setValues/appendRow/insertRow/deleteRow/clear/LockService/persistence; no router route added). **Bundle:** now
> **24** modules (added `KMVD`), reproducible byte-for-byte (hash `7b5ae11e…`), VM load verified (bundle test
> **53**). **LIVE VERIFICATION STATUS — unchanged / NOT PERFORMED:** Production Read Path / Projection Runtime /
> Production Writer / LockService write enforcement / Weekly + Monthly Draft persistence remain **TEST VERIFIED
> (local, fake Sheets + fake lock)** — NOT LIVE VERIFIED; deployment / live Google Sheet verification / rollback =
> NOT PERFORMED; Submit = NOT IMPLEMENTED. Submit Contract Closure stays BLOCKED pending returned live evidence.
> Golden Matrix unchanged **39 / 1 / 0**; Scenario #34 Pending.
>
> **Round 1S-P3 PRODUCTION RECOMMENDATION DRAFT WRITER (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED):** the
> LOCKED production WRITE path is completed and TEST VERIFIED end-to-end — it persists ONLY the four editable
> Recommendation Draft workspaces (NO Submit, NO downstream business record). NEW pure module
> `assets/js/core/supply-planning-production-writer.js` (`window.KM.productionWriter` / bundle `KMPW`;
> `…production-writer.test.js`, **49 assertions**). **Architecture (all persistence reused, none reimplemented):**
> `production facts (KMPS.resolveProductionFacts) → KMORCH.runRecommendationGeneration (active-draft lookup → Core
> replay → Plan Builder → Persistence Plan Builder → LOCKED apply via KMPL + KMPR) → shipping_allocation_drafts/
> _lines (Weekly) | request_order_allocation_drafts/_lines (Monthly)`. `KMPW` authors NO Calculation/Ledger/
> Allocation/recommendation/carton formula, NO active-draft resolution, NO lock policy, NO plan diffing, NO
> reconcile/user-edit rule — every decision is delegated to the frozen, test-verified modules; it only (1) seeds an
> in-memory sheet-set with the exact frozen §2 Draft schemas, (2) builds the Orchestrator deps over an injected
> sheet-set + lock + canonical spreadsheet (the node/test twin of the `.gs`), and (3) labels the persistence
> outcome. **`24_recommendation_orchestrator.gs` now delegates the generate action to
> `KMPW.persistProductionRecommendation(...)`** (the SAME entry the tests exercise) — the locked write, reread-under-
> lock, keyed-delta write-back, and LockService boundary are unchanged (Round 1G). **Public API:**
> `persistProductionRecommendation(command, deps)` (wraps KMORCH + adds `persistenceStatus`/`writtenTables`),
> `sheetSetDeps(env)`, `seedSheetSet(type)`, `persistToSheetSet(env)`. **TEST VERIFIED end-to-end (fake canonical
> Sheets → locked writer → Draft tables; NO SpreadsheetApp, fake lock):** Weekly CREATE → one
> `shipping_allocation_drafts` header + one line `recommended_qty 96`, `draft_version 1`, `calculation_run_id`
> persisted, submitted fields empty, lock acquired+released, only Draft + run-journal tables written; Monthly CREATE
> → one `request_order_allocation_drafts` header (per-sku) + line `recommended_qty 24`, `order_qty` initialized from
> recommendation per the frozen contract; **REUSE/REFRESH** (second scheduled run → coreAction `REFRESH`, same draft
> id, no duplicate header/line); **MANUAL_REGENERATE** (no user edits → `draft_version` increments, one Active
> Draft, `generationType manual_refresh`); **LOCKING** (lock unavailable → not completed, `persistenceStatus:
> 'NOT_EXECUTED'`, zero header rows written; released exactly once on success); **IDEMPOTENCY** (retry creates no
> duplicate rows); **schema** (seeded headers match the frozen §2 four-table schema); **no-downstream** (no
> shipping_plans/shipments/shipment_line_allocations/factory_stock/PO/inventory table present or written; no
> submitted/cancelled fields populated); **end-to-end reread** (persisted rows reconstruct the SAME single Active
> Draft via `KMPR.loadActiveDraftContext`/`loadDraftSnapshot`); **purity** (input immutable; deterministic; pure
> `KMPW` source-scanned — no SpreadsheetApp/LockService/clock/random/locale, no recommendation/carton formula).
> **Bundle:** now **23** modules (added `KMPW`), reproducible byte-for-byte (hash `5aaf070b…`), VM load verified
> (bundle test **51**). **STATUS: Production Read Path = SOURCE PRESENT / TEST VERIFIED; Production Persistence
> Writer = SOURCE PRESENT / TEST VERIFIED; Active Draft create/reuse = TEST VERIFIED; user-edit protection =
> TEST VERIFIED (via reused KMPC/KMPR); retry/resume/idempotency = TEST VERIFIED; LockService write enforcement =
> SOURCE PRESENT / TEST VERIFIED (via reused KMPL boundary); Weekly + Monthly Draft persistence = TEST VERIFIED;
> Submit / Weekly-Plan promotion / Request writer / PO creation / Scheduler / Trigger = NOT IMPLEMENTED; deployment
> / live Google Sheet verification = NOT PERFORMED.** Golden Matrix unchanged **39 / 1 / 0**; Scenario #34 Pending.
>
> **Round 1S-P2 APPS SCRIPT PRODUCTION SOURCE WIRING (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED):** the
> production READ-ONLY recommendation source path is wired end-to-end and the orchestrator `SOURCE_READER_PENDING`
> stub is REPLACED. NEW pure module `assets/js/core/supply-planning-production-source.js` (`window.KM.productionSource`
> / bundle `KMPS`; `…production-source.test.js`, **43 assertions**) + NEW thin `.gs`
> `assets/specs/active/apps-script/27_recommendation_production_source.gs`. **Architecture (READ-ONLY, all math
> reused):** `existing Canonical Operation DB Sheets → KMPS.readCanonicalSnapshots (inject-testable raw getValues;
> the `.gs` passes SpreadsheetApp, tests pass a fake) → the frozen Projection Runtime (KMSP) → the frozen Production
> Reader (KMSRP) → KMSR → KMSI → Ledger → Allocation → Weekly/Monthly Resolver → Plan Builder Bridge → Plan
> Builder (read-only)`. **NO physical `recommendation_source_*` Sheets are read** (the DTO snapshots are assembled in
> memory). `KMPS` owns ONLY the canonical Sheet-name registry, the inject-testable reader, the orchestrator
> `computeFacts` shape (`resolveProductionFacts`), and the read-only RecommendationPlan result
> (`buildProductionRecommendationSource` → `{…, recommendationPlan, persistenceStatus:'NOT_EXECUTED'}`) — it authors
> NO Calculation/Ledger/Allocation/lifecycle/recommendation formula and **NEVER writes** (no setValues/appendRow/
> insertRow/deleteRow/clear/LockService/CacheService/PersistencePlan/repository/draft). **Bundle:** the deterministic
> bundle now ports **22** modules (added `KMSP` + `KMPS`), reproducible byte-for-byte (hash `bb0d44ce…`), full VM
> load verified (bundle test **49**; `KMSP`/`KMPS` namespaces + API asserted). **Orchestrator seam REPLACED:**
> `24_recommendation_orchestrator.gs` `rpoResolveFacts_` now delegates to `KMPS.resolveProductionFacts(
> SpreadsheetApp.getActiveSpreadsheet(), body)` (bundled pure runtime; no `.gs` formula) — **the active
> `SOURCE_READER_PENDING` return is REMOVED** (only a historical comment reference remains); the bundle guard now
> requires `KMPS`/`KMSP`. **TEST VERIFIED (read-only, fake Sheets):** Weekly `recommendedQty 96` + Monthly
> CEILING(13/12)×12 = `24` reach the Plan Builder from fake CANONICAL Sheets (not DTO-convention Sheets); the
> production facts flow through the REAL `KMORCH.runRecommendationGeneration` with a fake locked-apply that CAPTURES
> the plan (recommended_qty 96 in the captured plan) with **ZERO Sheet writes**; `persistenceStatus:'NOT_EXECUTED'`;
> no draft id fabricated. Frozen decisions preserved via the reused runtime: **D-1** FACTORY pool `FACTORY_SHARED`
> (one factory_stock row → one pool; warehouse owner change does not alter it); **D-2** factory as-of missing →
> `SOURCE_AS_OF_MISSING`; **D-3** missing destination → `MISSING_DESTINATION_WAREHOUSE`; **D-4** legacy shipment
> status → `UNSUPPORTED_LEGACY_STATUS` (issues propagate fail-closed, never swallowed). **No router route added**
> (production source path is internal to the orchestrator; §20). Pure `KMPS` source-scanned (no SpreadsheetApp/
> LockService/Cache/clock/random/locale); `27_.gs` source-scanned (no write/lock/persistence method, no business
> formula). **STATUS: Projection Contract = FROZEN; Projection Runtime = SOURCE PRESENT / TEST VERIFIED; Apps Script
> canonical-table read wrapper = SOURCE PRESENT / TEST VERIFIED; Projection bundle integration = TEST VERIFIED;
> Production orchestrator source seam = SOURCE PRESENT / TEST VERIFIED; `SOURCE_READER_PENDING` active stub =
> REMOVED / REPLACED; read-only Weekly + Monthly production paths = TEST VERIFIED; Production Persistence Writer /
> LockService production write enforcement / Submit / Scheduler / Trigger = NOT IMPLEMENTED / NOT VERIFIED;
> deployment / live Google Sheet verification = NOT PERFORMED.** Golden Matrix unchanged **39 / 1 / 0**; Scenario
> #34 Pending.
>
> **Round 1S-P1.5B PRODUCTION SOURCE PROJECTION RUNTIME (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED):** the
> frozen Production Source Projection Contract (SC-10/SC-11) is IMPLEMENTED as ONE new pure module
> `assets/js/core/supply-planning-source-projection.js` (`window.KM.sourceProjection`; `…source-projection.test.js`,
> **63 assertions**). It is a PURE / DETERMINISTIC in-memory projection: `canonical Operation DB snapshots →
> projectRecommendationProductionSources → in-memory DTO-convention snapshots (origin PROJECTION_RUNTIME) →` the
> frozen Round 1S-P1 Production Reader (`KMSRP.buildRecommendationSourceFacts`, REUSED UNCHANGED) `→ KMSR → KMSI →
> Ledger → Allocation → Weekly/Monthly Resolver → Plan Builder Bridge → Plan Builder`. **NO persisted
> `recommendation_source_*` Sheets are created** (the convention snapshots exist only in memory); **no writes / no
> SpreadsheetApp / DB / Cache / LockService**; it ASSEMBLES facts and **duplicates NO Calculation / Ledger /
> Allocation formula** (the caller-owned planning facts with no stored column — survivalNeedQty / dailyDemand /
> demandWeight / eligiblePoolTypes / eligibleFactoryWarehouseIds / windowCode / requestMonth / requestBucket /
> calculatedGap / netOrderNeed — are ROUTED, not computed; `units_per_carton`/`allocation_priority`/
> `fulfillment_model` are joined from `sku_details`/`marketplaces`/`marketplace_skus`). **Public API:**
> `projectRecommendationProductionSources({recommendationType, planningCycle, businessScope, sourceSnapshots,
> planningFacts?, receiverFacts?, factoryDemandFacts?, routing?, requiredByDate?, forecastMonth?, formulaVersion?,
> sourceDataAsOf?})` → `{ready, status, reason, issues, …, sourceReaderInput, demandSourceEntries,
> supplySourceEntries, receiverFacts, factoryDemandFacts, planningFacts, sourceDataAsOf, sourceAsOfByType,
> lineage}`; plus `projectAndRead(input)` (projection → frozen KMSRP → whole chain, in memory). **Frozen decisions
> TEST VERIFIED:** **D-1** FACTORY current-stock pool `company = FACTORY_SHARED` (one factory row → ONE shared pool,
> never duplicated per receiver company; `warehouses.company` does not change pool ownership; lineage
> `stock:FACTORY:<wh>:<sku>` carries no company); **D-2** factory `source_data_as_of` = `last_transaction_at` →
> `updated_at` → `SOURCE_AS_OF_MISSING` (never the clock); **D-3** demand/receiver/factory `destination_warehouse_id`
> = explicit routing → frozen-scope destination → else `MISSING_DESTINATION_WAREHOUSE` (demand excluded, never
> inferred from country/marketplace/code/first-match); **D-4** table-specific status maps (`shipping_plans`:
> draft→DRAFT, site_confirmed→APPROVED_SHIPPING_PLAN, cancelled→CANCELLED_INVALID; `shipments`: draft→DRAFT,
> ready_to_ship→APPROVED_SHIPPING_PLAN, shipped/in_transit/arrived→SHIPPED_IN_TRANSIT, received→
> RECEIVED_NOT_REFLECTED only with receiving authority, closed→no bucket, cancelled→CANCELLED_INVALID; arrived +
> delivery-event→DELIVERED_NOT_RECEIVED; correction→CORRECTION_REVERSAL; legacy planned/completed/partial_received/
> partially_received/stuck + unknown → `UNSUPPORTED_LEGACY_STATUS`; **CURRENT_STOCK never derived from shipment
> status**). **Full pure-runtime paths TEST VERIFIED (no writes):** Weekly `recommendedQty 96` and Monthly
> CEILING(13/12)×12 = `24` reach the existing Plan Builder from schema-accurate fake canonical snapshots. **Current
> stock** FBA (`amazon_inventory_snapshot.available_qty`, run company) / THREE_PL (`overseas_inventory_snapshot.
> wh_available_stock`, company via `warehouse_id`→`warehouses`) / FACTORY (`factory_stock.fac_current_stock`,
> FACTORY_SHARED); same physical 3PL pool across marketplace rows shares lineage (Ledger dedups count-once). Pure /
> deterministic (input never mutated; deep-equal repeat; fresh objects; no clock/random/locale — source-scanned).
> **Bundle:** NOT added this round (the projection is not yet on the Apps Script path — orchestrator not wired;
> bundle inclusion is deferred to Round 1S-P2; bundle hash `2d0b276f…` unchanged). **Orchestrator NON-integration:**
> `24_recommendation_orchestrator.gs` `SOURCE_READER_PENDING` UNCHANGED (Round 1S-P2 owns the stub replacement); no
> `.gs`/router change. **STATUS: Production Source Projection Contract = FROZEN; Production Source Projection Runtime
> = SOURCE PRESENT / TEST VERIFIED; Production Source Reader = SOURCE PRESENT / TEST VERIFIED; Orchestrator
> `SOURCE_READER_PENDING` = STILL PRESENT; Production Writer / LockService production enforcement / Submit = NOT
> IMPLEMENTED / NOT VERIFIED; deployment / live verification = NOT PERFORMED.** Golden Matrix unchanged
> **39 / 1 / 0**; Scenario #34 Pending.
>
> **Round 1S-P1.5A-D PRODUCTION SOURCE PROJECTION DECISIONS LANDED (DOCUMENTATION LANDING — CONTRACT FROZEN):** the
> user confirmed the Round 1S-P1.5A HALT decisions D-1..D-4; this documentation-landing round freezes them as
> canonical contract in `RECOMMENDATION_SOURCE_CONTRACT_SPEC.md` **SC-11** (+ SC-STATUS) and the `FACTORY_SHARED`
> Supply-Ledger company-sentinel amendment in `SUPPLY_PLANNING_CALCULATION_RULES.md` §39.6 (no formula / no
> allocation change). **Documentation landing only — no JS / Apps Script / test / bundle / DB / schema / migration /
> km-lb change; no writes; `24_…` `SOURCE_READER_PENDING` UNCHANGED; no deploy.** Full regression re-run green
> (Golden **39/1/0**, bundle `2d0b276f…` unchanged, Production Reader **38**, Source Reader **48**, Source
> Integration **29**, Source Facts **37**, Lifecycle **68**, Ledger **133**, Allocation **112**, Bundle **45**,
> Orchestrator **37**, all PASS). **Decisions frozen:** **D-1** FACTORY supply company = canonical sentinel
> **`FACTORY_SHARED`** (company-agnostic cross-company shared pool; identity `FACTORY_SHARED|source_factory_
> warehouse_id|masterSku|FACTORY`; receiver demand keeps its real company; allocation formulas unchanged). **D-2**
> factory `source_data_as_of` = primary `factory_stock.last_transaction_at`, fallback `updated_at`, else
> **`SOURCE_AS_OF_MISSING`** (never clock/read-time; no dated factory snapshot required — future optional hardening).
> **D-3** demand `destination_warehouse_id` = caller/planning-scope-owned (explicit `destinationWarehouseId` →
> persisted same-scope Draft/Plan destination → else **`MISSING_DESTINATION_WAREHOUSE`** fail-closed; never inferred
> from country/marketplace/code/first-match/display/prev-shipment/array-order/default-FC; Manual Recommend needs
> explicit selection, Automatic needs pre-resolved routing). **D-4** table-specific shipment status→lifecycle map
> (`shipping_plans`: draft→DRAFT, site_confirmed→APPROVED_SHIPPING_PLAN, cancelled→CANCELLED_INVALID; `shipments`:
> draft→DRAFT, ready_to_ship→APPROVED_SHIPPING_PLAN, shipped/in_transit/arrived→SHIPPED_IN_TRANSIT, received→
> RECEIVED_NOT_REFLECTED [receiving-authority-backed only], closed→no direct bucket [CURRENT_STOCK only from
> inventory authority], cancelled→CANCELLED_INVALID; DELIVERED_NOT_RECEIVED only from a real delivery-event
> authority; Delivered ≠ Received; CURRENT_STOCK only from inventory authority; legacy `planned/completed/
> partial_received/partially_received/stuck` → fail-closed **`UNSUPPORTED_LEGACY_STATUS`**; correction/reversal →
> **`CORRECTION_REVERSAL`** visible-but-zero). **D-5** = implementation-availability gap (DELIVERED/RECEIVED emitted
> only when a real authority exists; missing support → source-unavailable issues, never synthetic facts) — NOT a
> contract blocker. **D-6** = production-readiness risk (no test-data marker; strict business-scope filtering only,
> no SKU/name filter, duplicate identity fail-closed; cleanup deferred) — NOT a contract blocker. **STATUS:
> Production Source Projection Contract = FROZEN; Projection Runtime = NOT IMPLEMENTED; Production Source Reader =
> SOURCE PRESENT / TEST VERIFIED; Orchestrator `SOURCE_READER_PENDING` = STILL PRESENT; Round 1S-P1.5B = AUTHORIZED
> NEXT TASK (build the Projection Runtime per the frozen contract); Round 1S-P2 = BLOCKED UNTIL P1.5B PASSES;
> Production Writer / LockService / Submit = NOT IMPLEMENTED; Deployment / Live Verification = NOT PERFORMED.**
> Golden Matrix unchanged **39 / 1 / 0**; Scenario #34 Pending.
>
> **Round 1S-P1.5A PRODUCTION SOURCE PROJECTION CONTRACT CLOSURE (DOCUMENTATION + READ-ONLY EVIDENCE — HALT, NOT
> FROZEN):** a Database-First read-only closure round for the mapping `Canonical DB tables → Projection Runtime →
> Recommendation Source DTOs → the frozen production Reader`. **No Runtime / Apps Script / bundle / DB / schema /
> migration / km-lb change; no writes; no orchestrator integration; no deploy.** Full regression re-run green
> (Golden **39/1/0**, bundle up-to-date `2d0b276f…`, Production Reader **38**, Source Reader **48**, Source
> Integration **29**, Orchestrator **37**, Bundle **45**, all suites PASS; `24_…` `SOURCE_READER_PENDING` UNCHANGED).
> **Delivered:** (1) **Architecture SELECTED = Option C** (upgraded from *recommended*): a `Recommendation Source
> Projection Runtime` that COMPOSES the frozen calc engine (`KMCALC`/`KMLEDGER`/`KMALLOC`) + source-facts projectors
> in memory — proven the *only* viable option because the demand/supply/planning-facts DTOs **cannot** be produced
> by reading tables alone (Option A impossible): `survival_need_qty`/`daily_demand`/`demand_weight`/`eligible_pool_
> types`/`eligible_factory_warehouse_ids`/`calculated_gap_qty`/`net_order_need_snapshot` and the whole demand-entry
> assembly are calc-engine OUTPUTS with NO stored column, and the Reader is forbidden from deriving them. Read-only
> STORED-CANONICAL (directly readable): `sku_details.units_per_carton`, `marketplaces.allocation_priority`,
> `marketplace_skus.fulfillment_model`, identity (`sku`/`site_sku`/`warehouse_id`), raw inventory quantities, raw
> forecast/sales/shipment/PO rows. (2) **Physical DTO source-sheet question RESOLVED = RETIRED:** the convention
> names `recommendation_source_*` are **NOT** adopted as canonical persisted tables — retained ONLY as the
> production reader's overridable registry defaults + a test-fixture convention (Option C assembles Reader input in
> memory; nothing new persisted; audit/replay = existing OUTPUT snapshot). (3) **Canonical source matrix** (identity
> / demand basis / supply basis / lifecycle) recorded with exact tables, keys, quantity + as-of authorities, and the
> frozen count-once boundary (confirmed Overseas Inbound Receipt = sole crossing into on-hand; **Delivered ≠
> Received**). **HALT — the contract is NOT declared FROZEN** because Round-spec §12 (status-conflict) and §23
> Final-Gate conditions are unmet. **DECISION-REQUIRED (exact list, now in `RECOMMENDATION_SOURCE_CONTRACT_SPEC.md`
> SC-10.4):** **D-1** `factory_stock` supply-company authority (no `company` column; company-agnostic *shared pool* —
> what `company` does a `FACTORY` supply row carry, given the Ledger `poolKey` requires one); **D-2** `factory_stock`
> source-as-of (no `snapshot_date`; live-balance table — is `updated_at`/`last_transaction_at` an acceptable
> `source_data_as_of`); **D-3** demand `destination_warehouse_id` routing owner (no source column, no routing
> runtime); **D-4** `shipments.status` §12 vocabulary conflict (three divergent canonical enums; `received`/
> `completed`/`partial_received` overloaded; origin `origin_warehouse_id` vs `source_warehouse_id`; reserve-release
> B-8 BLOCKED) → the §39.5 status→lifecycle-bucket map cannot be frozen. **Bounded by** **D-5** the receiving/
> incoming layer (`shipment_events` / `overseas_inbound_*` / structured `shipping_plans` cols) is SPEC-ONLY / NOT
> IMPLEMENTED (no `received_qty` column) → today only CURRENT_STOCK + on-the-way supply is producible; and **D-6**
> no canonical test/legacy data-class marker exists (residual; strict scope-key projection mitigates, no cleanup).
> **Round 1S-P2 (orchestrator `SOURCE_READER_PENDING` replacement) stays BLOCKED** until D-1..D-4 resolve. Two docs
> updated (this tracker + the source-contract spec SC-10/SC-STATUS); nothing else touched. Golden Matrix unchanged
> **39 / 1 / 0**; Scenario #34 Pending.
>
> **Round 1R CANONICAL RECOMMENDATION SOURCE CONTRACT (FROZEN — DECISION / DOCUMENTATION ONLY):** the canonical
> *source* contract for the Recommendation Runtime is investigated (Database-First), defined, and frozen in the new
> **`docs/planning/RECOMMENDATION_SOURCE_CONTRACT_SPEC.md`** (canonical owner; this tracker links to it — the two
> do not conflict, that spec cites this one's §Source-Facts CONTRACT owners and never overrides them). **No Runtime
> / Apps Script / bundle / DB / schema / migration / km-lb change** — documentation only; full regression re-run
> green (Golden **39/1/0**, Matrix **39/1/0**, Source Reader **48**, Source Integration **29**, Orchestrator **37**,
> Bundle **38**, all suites PASS). **Key frozen findings:** (1) **DB-CONFIRMED raw columns:** `sku`
> (`sku_details` — the Master SKU, not `master_sku`), `site_sku`, `units_per_carton` (`sku_details`), `warehouse_id`
> (`warehouses`), `allocation_priority` (`marketplaces`, §20.4), `fulfillment_model` (`marketplace_skus`, §24.1),
> quantity authorities (`overseas_inventory_snapshot.wh_available_stock` / `factory_stock.fac_current_stock` / FBA),
> and run-lineage `planning_cycle`/`formula_version`/`source_data_as_of`/`recommendation_type` (`recommendation_
> calculation_runs`) + `window_code`/`request_month`/`request_bucket`/`source_page`/`draft_purpose` (draft-line/
> header). (2) **DERIVED-UPSTREAM calc OUTPUTS (never Reader/wrapper):** `calculated_gap_qty` (§2C.1/§31 `calculateGap`)
> + `net_order_need_snapshot` (§12/§32 `sumRemainingShortages`) — persisted draft-line snapshots that stay **blank
> until the calc writer runtime exists, never faked 0** (REQ_PO §656). (3) **DECISION-REQUIRED convergence:**
> `survival_need_qty`/`daily_demand` (§20.3/§24.4/§22/§2D), `demand_weight` (§7/§24.5), `eligible_pool_types` /
> `eligible_factory_warehouse_ids` (§23.6/§24.9; §40/§35), and the whole **demand-entry assembly** (fc/events/sales
> → demand entries) have **NO canonical source column and NO implemented producer** — `projectAllocationInputs`
> CONSUMES these facts, it does not PRODUCE them, and the Reader is forbidden from deriving them. **No
> `recommendation_source*`/`planning_facts` table or sheet exists** (confirmed NOT FOUND). (4) **Recommended
> architecture = OPTION C** — a spec-defined `Recommendation Source Projection Runtime` composing the existing
> frozen source-facts projectors + closed Engine A/B to emit Reader-compatible rows per generation, **adding NO new
> canonical table/migration** (Option B per-run input-snapshot tables reserved as a future audit/replay upgrade,
> schema-only if ever adopted). (5) **Apps Script wrapper contract** (next round) and **Reader column override map**
> are defined in the source-contract spec (SC-6/SC-7). **SOURCE_READER_PENDING status:** pure-runtime seam REPLACED
> (Round 1Q); the `24_recommendation_orchestrator.gs` wrapper stub **remains** and is NOT touched — full-project
> removal is gated on the Projection Runtime + wrapper (SC-8/SC-9). No projection/wrapper/bundle/scheduler/
> persistence implemented; no deploy.
>
> **Round 1Q ORCHESTRATOR ↔ SOURCE READER INTEGRATION (SOURCE PRESENT / TEST VERIFIED):** `supply-planning-recommendation-source-integration.js` (NEW pure module `window.KM.recommendationSourceIntegration`; `…recommendation-source-integration.test.js`, **29 assertions**; all prior suites preserved — Orchestrator **37 unchanged**). It **replaces the pure-runtime `SOURCE_READER_PENDING` seam**: the injected `deps.computeFacts(query)` is now produced by the REAL Round 1P Source Reader composed with the frozen runtimes, wired in the mandated order — `caller-supplied source input → readWeekly/MonthlyRecommendationSource → buildDemandLedger/buildSupplyLedger → resolveDemandKeys → projectAllocationInputs → resolveWeekly/MonthlyRecommendationFacts → bridgeRecommendationFactsToPlan` → the Orchestrator's own Plan Builder → Core → Persistence Plan Builder → LOCKED apply. **The Orchestrator core is UNCHANGED** (hash `23f1cf9a…` preserved); integration is a new module consumed through the existing injection seam (no second reader, no alias, no re-mapping/normalize/identity/demandKey/Gap/NetOrderNeed/allocation logic — every stage is the real frozen module). **Public API:** `createRecommendationSourceIntegration(depsOverride?)`, `resolveRecommendationFactsFromSource(sourceInput, opts)` (rich testable result: `{recommendationType, planningCycle, businessScope, formulaVersion, sourceDataAsOf, sourceIssues, ledgerResult, allocationInput, resolverResult, bridgeResult, lines, ready, reason}`), `createComputeFacts(sourceInput, opts)` (returns the Orchestrator-shaped `{lines, ready, reason, formulaVersion, sourceDataAsOf, sourceIssues}`), `selectReaderName(type)`. **Routing** by `recommendationType`: WEEKLY_SHIPPING→Weekly reader, MONTHLY_ORDER→Monthly reader — the other reader is NEVER called (spy-verified). **Fail-closed, no fallback:** Reader-thrown TypeError/RangeError (invalid enum, duplicate line identity, ambiguous demandRef, unresolved identity, structural failure) PROPAGATE (never caught/degraded); Reader/allocation/resolver/bridge issues are all aggregated into `sourceIssues` and NEVER cleared; MISSING never→0; the integration NEVER supplies sourceDataAsOf/formulaVersion/planningCycle itself and uses no clock/random/locale/SpreadsheetApp/LockService/Cache. `ready = resolver clean AND ≥1 line`; insufficient valid input → `ready:false` → Orchestrator BLOCKS (no blank-but-successful plan). **demandKey ownership:** Ledger-EMITTED key only (via `resolveDemandKeys`), never recomputed; unknown demandRef → downstream blocked line (recommendedQty null), never fabricated. **Integration = TEST VERIFIED end-to-end** through the UNCHANGED locked Orchestrator (fake locked-apply captures the plan — **NO persistence write**): Weekly `recommended_qty 96` + Monthly CEILING(13/12)×12 = `24` reach the locked-apply plan; `generation_type` scheduled/manual_refresh; reader issues propagate with valid rows continuing; structural inputs fail closed; pure/deterministic. **Boundary (this round only wires the reader into the Orchestrator seam):** the Apps Script `24_recommendation_orchestrator.gs` `SOURCE_READER_PENDING` **wrapper stub remains** — binding SpreadsheetApp `getValues()` → this integration is the Apps-Script-wrapper round and requires the still-undefined **canonical recommendation-SOURCE sheet** (Round 1P decision), so it is deliberately NOT wired here (no SpreadsheetApp/DB/Cache/LockService dependency added; no canonical source table invented). **NOT bundled; Persistence NOT invoked; Scheduler/Trigger/Submit/Request-writer/Weekly-Plan-promotion/PO/Scenario #34 NOT IMPLEMENTED; Forecast→Demand / inventory→Supply projection NOT IMPLEMENTED; no deploy.** Golden Matrix unchanged **39 / 1 / 0**.
>
> **Round 1G Plan Builder + Apps Script module port + locked orchestrator (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED):** the Round 1F-R C3 blockers are closed. (1) **Plan Builder** `assets/js/core/supply-planning-plan-builder.js` (`…plan-builder.test.js`, **50 assertions**) projects RESOLVED recommendation facts → the Persistence-Core command + a per-line detail map: recommendation-snapshot only, `generation_type` mapping (`SCHEDULED_REFRESH→scheduled`, `MANUAL_REGENERATE→manual_refresh`; `user_created` reserved), **live analysis (gap/shortage/coverage/days_of_supply/suggested_qty) refused as persisted authority**, blocked lines carry no fabricated qty. (2) **Persistence Plan Builder** `assets/js/core/supply-planning-persistence-plan-builder.js` (`…persistence-plan-builder.test.js`, **44 assertions**) diffs prev→next Core StoreSlice into the frozen **PA-7 PersistencePlan** (header INSERT/UPDATE, line INSERT/UPDATE/SUPERSEDE, edited-line preservation, superseded_user_review, lineageOps, Core-owned totals, deterministic auditEvents, no Sheet refs), with **`expectedToken` captured from the PRIOR persisted snapshot** (never synthesized). (3) **Apps Script bundle/port** `assets/tools/build-apps-script-bundle.js` (`…apps-script-bundle.test.js`, **37 assertions**) deterministically ports the 14 canonical UMD modules into ONE generated `assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs` (verbatim wrap; require-shim; **no algorithm duplication**; reproducible byte-for-byte; exposes `KMPR/KMPL/KMPB/KMPPB/KMPC/KMORCH/…`) — verified to LOAD + RUN end-to-end in an Apps Script-like VM (no `require`/`module`/`window`). (4) **Locked orchestrator** `assets/js/core/supply-planning-recommendation-orchestrator.js` (`…recommendation-orchestrator.test.js`, **37 assertions**) runs validate → active/terminal guard → capture token → resolve facts (injected) → Plan Builder → Core → Persistence Plan Builder → **locked keyed-delta apply**, canonicalizing on the Core `draftId` (Core-replay reconstruction; foreign/legacy draft refused), with zero-write conflict/duplicate/terminal/source-not-ready guards and the locked apply as the ONLY write path. The Apps Script **source mirror** `24_recommendation_orchestrator.gs` wires it to LockService + a **keyed-delta write-back** (targeted changed/appended rows only — never the full-table `23_ rprWriteBack_`) + additive-schema/run-journal ensure, routed as `generateRecommendationDraftLocked` (`01_router.gs`). **Source facts reader = PENDING (injected; blocks `SOURCE_READER_PENDING` — never fabricates data). Scheduler / Trigger / Submit / Request writer / Weekly-Plan promotion / PO = NOT IMPLEMENTED; legacy `15_`/`16_` unlocked writers remain (locked-path enforcement is a later round); no B-6/B-8; no deploy / no live migration.**
>
> **Round 1D implementation slice (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED):** the production repository logic is authored + fake-sheet TEST VERIFIED as a pure module `assets/js/core/supply-planning-persistence-repository.js` (`assets/tests/supply-planning-persistence-repository.test.js`, **74 assertions**): additive-header ensure, `recommendation_calculation_runs` schema, Active-Draft reader, snapshot reader, incomplete-run reader, PersistencePlan validation, `{draft_version, userEditFingerprint}` token, shipping + procurement **natural-key upsert** (INSERT/UPDATE/SUPERSEDE) with user-edit preservation + conservative legacy protection, run-stage journal, idempotent replay + partial-write recovery. The Apps Script **source mirror** `assets/specs/active/apps-script/23_recommendation_persistence_repository.gs` is a thin Sheet-I/O adapter over that module (no algorithm duplication; **deploy UNVERIFIED**). Additive columns `user_edited`/`user_edited_by` are declared in the `15_`/`16_` line-header arrays and the `15_` procurement line writer is **migrated from delete+replace to natural-key upsert** (SOURCE PRESENT).
>
> **Round 1E LockService + optimistic-concurrency boundary (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED):** the race-safe write flow (PA-9/PA-10) is authored + fake-lock TEST VERIFIED as a pure, dependency-injected orchestrator `assets/js/core/supply-planning-persistence-locking.js` (`assets/tests/supply-planning-persistence-locking.test.js`, **96 assertions**): `executeLockedPersistence(command)` runs **acquire ScriptLock → reload Active-Draft context + snapshot UNDER the lock → recompute `{draft_version, userEditFingerprint}` → compare to the plan's captured token → `applyPersistencePlan` only on a match → release in `finally` (exactly once after acquisition)**. Token mismatch, duplicate Active Draft, and `submitted`/`cancelled` terminal status each return a zero-write conflict DTO (`CONFLICT` / `BLOCKED_CONFLICT`); lock-acquisition failure returns `LOCK_UNAVAILABLE` with zero writes and no release; a failed/partial repository apply is reported honestly (never converted to success); release failure is surfaced as an issue without hiding the primary result. The Apps Script **source mirror** adds `applyPersistencePlanWithLock` to `23_recommendation_persistence_repository.gs`, wiring these deps to `LockService.getScriptLock()` + `tryLock(30000)` (the established `05_/07_/21_/22_*.gs` convention) + the `KMPR` repository (no algorithm duplication; **deploy UNVERIFIED**). **Scheduler / Trigger / no-arg runners / calc engine / Request writer (B-5) / Weekly-Plan promotion / Submit = NOT IMPLEMENTED; no live migration; no deployment.** It does not decide B-6/B-8, reopen B-7, or touch #34. Evidence base: current handlers `15_request_allocation_handlers.gs` / `16_shipping_allocation_handlers.gs` / `13_procurement_handlers.gs` / `01_router.gs`; schema owner `DATABASE_RELATIONSHIP_MAP.md` §7.5; permanent boundary `SYSTEM_RUNTIME_ARCHITECTURE.md` §7C.

### PA-1. Selected pure-core ↔ repository model
Evaluated: **(A)** core returns full store → repo diffs+writes; **(B)** repo loads a snapshot → runs the pure core → derives a deterministic **Persistence Plan (diff)** → applies it under lock; **(C)** core emits explicit persistence commands; **(D)** other. **Selected = B** (with an explicit serializable Plan as the diff — a controlled B/C blend). Rationale: keeps the pure core (and its 96 tests) **unmodified** (no core-API change), minimizes Sheet writes (only the diff), makes each write-stage a resumable, idempotent, testable unit, revalidates the concurrency token under the lock before applying, and never mutates a Submitted row (terminal drafts are excluded from the Active snapshot). The pure core stays side-effect-free; only the repository touches Sheets.

### PA-2. Repository interface (smallest surface)
Three reads + one atomic-looking write (all realized in Apps Script later; named here):
- `loadActiveDraftContext(query)` **[read]** → `{ activeDrafts: [headerRow…], conflict: bool, activeKey }` — rows of the source table whose scope matches and whose `status ∈ {draft, site_confirmed}`.
- `loadDraftSnapshot(draftId)` **[read]** → an in-memory store slice `{ draft, lines, run }` in the exact Round 1B shape the pure core consumes.
- `loadIncompleteRun(draftId)` **[read]** → the newest `recommendation_calculation_runs` row with `run_status ∈ {RUNNING, PARTIAL}` or `null`.
- `applyPersistencePlan(plan, expectedToken)` **[write — the only mutating op]** → acquires the lock, reloads + revalidates `expectedToken` (PA-9), then drives the plan stage-by-stage (PA-8), marking each stage after its Sheet writes succeed; releases the lock in `finally`; returns `{ runStatus, stageReached, applied:{…counts}, conflict? }`. **Internal/private helpers** (never public): `markRunStage`, `upsertHeaderRow`, `upsertLineRow`, `supersedeLineRow`, `recomputeHeaderTotals`, `appendRunAudit`. This avoids a generic CRUD surface.

### PA-3. Repository DTOs
- `RepoQuery = { recommendationType, planningCycle, businessScope }` (same shape as the core query).
- `StoreSlice = { drafts:[draftRow], lines:[lineRow], runs:[runRow] }` — the core's store shape, mapped from Sheet rows (PA-4/-5).
- `PersistencePlan` = PA-7. `ExpectedToken` = PA-9. All DTOs are **plain JSON — no `Range`/`Sheet`/`SpreadsheetApp` object references** may appear in a Plan (serialization-safe, testable with a fake sheet).

### PA-4. Field/header mapping — classification legend
`EXISTING_HEADER` (present now) · `EXISTING_DIFFERENT_NAME` · `DERIVABLE` (computed, not stored) · `REQUIRED_ADDITIVE_HEADER` (must add, additively) · `OPTIONAL_FUTURE_HEADER` · `NOT_PERSISTED`. **No header is added in this round.**

**A. `shipping_allocation_drafts` (header) — `16_*`:** `recommendation_type`=DERIVABLE (the table itself ⇒ WEEKLY_SHIPPING); `planning_cycle`/`company`/`country`/`marketplace`/`source_page`=EXISTING_HEADER (business scope); `draft_version`/`calculation_run_id`/`formula_version`/`source_data_as_of`/`generation_type`/`status`=EXISTING_HEADER; `calculated_at`=EXISTING_HEADER; `updated_by`/`updated_at`/`submitted_by`/`submitted_at`=EXISTING_HEADER; `activeKey`=DERIVABLE; `totals`=DERIVABLE (recomputed).

**B. `shipping_allocation_draft_lines` (line) — `16_*`:** `lineKey`=DERIVABLE from `(allocation_draft_id, sku, site_sku, window_code)` (all EXISTING_HEADER); `recommended_qty`=EXISTING_HEADER (immutable snapshot); `planned_qty`=EXISTING_HEADER (user qty); `line_status`=EXISTING_HEADER (add enum VALUES `blocked`/`superseded`/`superseded_user_review`; `draft`≈ACTIVE); `reason`/blocked token → `recommendation_flags`=EXISTING_HEADER (or OPTIONAL_FUTURE `blocked_reason`); `demandKey`=NOT_PERSISTED for shipping (OPTIONAL_FUTURE); `calculation_run_id`/`source_data_as_of` on the line=NOT_PERSISTED today → DERIVABLE from header (stamp OPTIONAL_FUTURE); **`user_edited`=REQUIRED_ADDITIVE_HEADER; `user_edited_by`=REQUIRED_ADDITIVE_HEADER**.

**C. `request_order_allocation_drafts` (header) — `15_*`:** `recommendation_type`=DERIVABLE (⇒ MONTHLY_ORDER); `planning_cycle`/`company`/`country`/`marketplace`/`draft_purpose`/`sku`=EXISTING_HEADER; `draft_version`/`calculation_run_id`/`formula_version`/`source_data_as_of`/`calculated_at`/`generation_type`/`status`=EXISTING_HEADER; `updated_by`/`updated_at`/`submitted_by`/`submitted_at`=EXISTING_HEADER; `activeKey`/`totals`=DERIVABLE.

**D. `request_order_allocation_draft_lines` (line) — `15_*`:** `lineKey`=DERIVABLE from `(request_allocation_draft_id, request_month, request_bucket)` (EXISTING_HEADER; line has **no** `sku`); `recommended_qty`=EXISTING_HEADER (immutable); `order_qty`=EXISTING_HEADER (user qty); `carton_qty`=EXISTING_HEADER; `line_status`=EXISTING_HEADER (add enum VALUES as in B); `reason`→`recommendation_flags`=EXISTING_HEADER; `demandKey`=OPTIONAL_FUTURE (B-5 lineage); **`user_edited`=REQUIRED_ADDITIVE_HEADER; `user_edited_by`=REQUIRED_ADDITIVE_HEADER**.

**E. Calculation-run journal:** `calculation_run_id`/`draft_version`/`formula_version`/`source_data_as_of` exist on the draft **header**, but `run_status`/`current_stage`/`started_*`/`completed_*`/`error_summary`/`attempt_count` are **NOT_PERSISTED** anywhere → **REQUIRED new table** (PA-6). Header-only is insufficient (PA-6 rationale).

### PA-5. Required additive headers (frozen list; NOT added here)
On **both** line tables: `user_edited` (BOOLEAN, default `FALSE`) and `user_edited_by` (STRING, default `''`). Written by the **user-edit save path** (`applyUserEdit` handler) — set `TRUE`/actor when a user changes `planned_qty`/`order_qty`; the recommendation engine writes `FALSE` only when it (re)creates a system line. Plus additive **enum VALUES** on the existing `line_status` column (`blocked`, `superseded`, `superseded_user_review`) — a value extension, **not** a header change. Optional-future: `blocked_reason` (else reuse `recommendation_flags`); line-level `calculation_run_id`/`demand_key` stamps. Everything else the contract needs already exists (PA-4). Applied via the existing additive `sheetEnsureColumns_` path at a future implementation round.

### PA-6. Run-journal architecture & schema
Evaluated: **(A)** dedicated `recommendation_calculation_runs` table; **(B)** run metadata on the draft header only; **(C)** header + audit/event table; **(D)** other. **Selected = A** (a dedicated runs table). **Why header-only (B) is insufficient:** the draft header stores one `calculation_run_id` but no `run_status`/`current_stage`; a crash between a Sheet write and completion is then indistinguishable from success, so the runtime cannot prove which stage finished and cannot resume safely (PA-8 requires resumable stages). **Frozen minimum schema** (new table, NOT created here): `calculation_run_id` (PK) · `recommendation_type` · `draft_id` · `planning_cycle` · `business_scope_key` · `draft_version` · `run_status` (`RUNNING`/`PARTIAL`/`COMPLETED`/`FAILED`) · `current_stage` (`RUN_METADATA`…`COMPLETED`) · `formula_version` · `source_data_as_of` · `started_by` · `started_at` · `completed_by` · `completed_at` · `error_summary` · `attempt_count`. This is the persisted mirror of the Round 1B in-memory `run` row.

### PA-7. Persistence Plan DTO (explicit deterministic diff)
```
PersistencePlan = {
  recommendationType, sourceTables: { header, lines },     // e.g. "request_order_allocation_drafts" / "_lines"
  draftId, activeKey, calculationRunId, draftVersion, expectedToken,   // PA-9
  runMeta: { runStatus, currentStage, formulaVersion, sourceDataAsOf, action },
  headerOp: { op: "INSERT"|"UPDATE", naturalKey, row },
  lineOps:  [ { op: "INSERT"|"UPDATE"|"SUPERSEDE", naturalKey, row, reason? } ],  // stable order by natural key
  lineageOps: [ { naturalKey, calculationRunId, sourceDataAsOf } ],
  totals: { totalRecommendedQty, totalUserQty, activeLineCount, blockedCount, supersededCount },
  stages: ["RUN_METADATA","HEADER","LINES","RECONCILE","LINEAGE","TOTALS","COMPLETED"],
  auditEvents: [ { event, at?, by? } ]
}
```
- **Empty-plan behavior:** a no-op plan (identical snapshot) still advances the run to `COMPLETED` idempotently (no Sheet mutation). **Per-op idempotency key** = the row natural key (PA-4). **Validation:** reject a plan whose `expectedToken` is absent or whose `draftId`/`calculationRunId` are inconsistent. **Serialization-safe:** plain JSON only — **no Sheet/Range references** (PA-3).

### PA-8. Write ordering, stage markers & recovery
Stages (verbatim Round 1B): `RUN_METADATA → HEADER → LINES → RECONCILE → LINEAGE → TOTALS → COMPLETED`. **A stage marker means "successfully completed"** — written to `recommendation_calculation_runs.current_stage` **after** that stage's Sheet writes succeed. **Resume** = `loadIncompleteRun` → continue at the stage **after** `current_stage`. **If the process stops between a Sheet write and the marker write:** on resume that stage re-runs; because every op is an **idempotent upsert by natural key**, replay produces no duplicates. `run_status`: `PARTIAL` (stopped mid-way, resumable) vs `FAILED` (structural/unrecoverable — needs correction). **No empty-success:** `applyPersistencePlan` returns success only when the run reaches `COMPLETED`. A failed/blocked new run **never destroys the previous good Active Draft**.

### PA-9. Optimistic concurrency token
`draft_version` **alone is insufficient** — a user edit to a line's `planned_qty`/`order_qty` does not bump the header `draft_version`. **Frozen token = `{ draftVersion, userEditFingerprint }`**, where `userEditFingerprint` = a deterministic hash over the draft's lines sorted by natural key of `(lineKey, userQty, userEdited)`. Captured at **calculation time** (before the lock) and **re-checked at write time under the lock**. **Mismatch behavior:** the write does **not** overwrite — `applyPersistencePlan` returns `conflict`; a **SCHEDULED_REFRESH** may safely reload + re-derive the plan and retry (refresh never overwrites user edits anyway); a **MANUAL_REGENERATE** requires **renewed user confirmation** (a new edit appeared after the user confirmed). `updated_at` is audit-only, never the token.

### PA-10. LockService boundary (Apps Script reality)
Apps Script `LockService` offers only **Script / Document / User** locks — **no native per-key lock**. Frozen pattern (matching `05_/22_*.gs`): `LockService.getScriptLock()` → `lock.tryLock(30000)` (30 s is the established convention) → on failure return `{ success:false, stage:'lock' }` (**no write on lock failure**) → `releaseLock()` in `finally`. The **logical Active-Draft key is preserved in the revalidation/conflict check** (PA-9), not in the lock primitive — the doc must **not** claim a native keyed lock. Flow: **readiness → run the pure calculation OUTSIDE the lock → acquire script lock → reload snapshot + revalidate token (PA-9) → `applyPersistencePlan` → mark COMPLETED → release**. Pure calc outside the lock keeps the critical section short (Apps Script 6-min limit).

### PA-11. Active-Draft query & natural-key upsert mapping
- **Active query:** WEEKLY_SHIPPING → `shipping_allocation_drafts`; MONTHLY_ORDER → `request_order_allocation_drafts`. Scope columns exactly per PA-4 (shipping: `planning_cycle+company+country+marketplace+source_page`; monthly: `planning_cycle+company+country+marketplace+draft_purpose+sku`). Active `status ∈ {draft, site_confirmed}`. **No scope normalization** (blank ≠ wildcard). **>1 match ⇒ BLOCKED_CONFLICT** (no latest-row fallback, no auto-repair). **Legacy blank-scope rows** are matched literally (blank matches blank only) and are **never** treated as eligible wildcards.
- **Shipping line upsert** by `(allocation_draft_id, sku, site_sku, window_code)` — the current `16_*` already upserts by `allocation_draft_line_id`; the natural key is the deterministic resolver behind it. **Procurement line upsert** by `(request_allocation_draft_id, request_month, request_bucket)` — **the current `15_*` delete+replace (`raDeleteLinesByDraft_`) must migrate to natural-key upsert** (PA-12/E) so user edits and superseded rows survive. New→INSERT; existing→UPDATE (respecting user-edit protection); removed→SUPERSEDE (user-edited→`superseded_user_review`, never delete); blocked→`line_status='blocked'` + reason; stable write order by natural key; legacy duplicate rows are flagged for review, never silently merged.

### PA-12. Migration classification (NOT executed here)
- **(A) No schema change:** draft headers — `calculation_run_id`/`formula_version`/`source_data_as_of`/`draft_version`/`generation_type`/`status`/scope all present.
- **(B) Additive headers:** `user_edited` + `user_edited_by` on both line tables (default `FALSE`/`''`); additive `line_status` enum values (`blocked`/`superseded`/`superseded_user_review`). Applied via `sheetEnsureColumns_` (append-only; existing reads unaffected).
- **(C) New table:** `recommendation_calculation_runs` (PA-6).
- **(D) Backfill:** legacy line rows get `user_edited=FALSE` by default, **but** are treated **conservatively as protected** (PA-13) until rewritten by the new writer.
- **(E) Writer migration:** `15_*` procurement line writer delete+replace → natural-key upsert (behavioral; no schema).
- **(F) Reader fallback:** readers tolerate an absent `user_edited` column (absent ⇒ legacy-protected).
- **Deployment order:** additive headers → run-journal table → writer migration → reader fallback. **The current UI remains functional throughout** (additive columns don't break existing reads; delete+replace→upsert is transparent to the UI).

### PA-13. Legacy user-edit treatment
Pre-additive rows have no `user_edited` signal. **Conservative rule:** a legacy line is treated as **potentially user-edited (protected)** — the recommendation refresh **never auto-overwrites** its `order_qty`/`planned_qty` — until that row is next written through the new writer, which stamps the explicit `user_edited`/`user_edited_by`. **Value comparison (`order_qty != recommended_qty`) is NEVER used to infer edits** (PO-10). This errs toward preserving human input.

### PA-14. Future test contract & evidence levels
Future test layers (before any "verified" claim): (1) repository row-mapping unit tests; (2) fake-sheet integration tests; (3) lock/concurrency tests; (4) partial-write/resume tests; (5) legacy-row compatibility tests; (6) user-edit race tests; (7) duplicate-active tests; (8) idempotent-replay tests; (9) real Apps Script manual verification; (10) deployed-runtime verification. **Evidence levels:** `SOURCE_PRESENT` = code exists in the mirror; `TEST_VERIFIED` = layers 1–8 pass in Node/fake-sheet; `DEPLOYED` = pushed to the Apps Script project; `PRODUCTION_VERIFIED` = layers 9–10 confirmed on live data. **Source existence never implies production verification.**

### PA-15. Non-goals (explicit)
No repository / LockService / scheduler / trigger / Request writer / Weekly-Plan / Submit implementation; no Apps Script / JS / test change; **no DB header/column/table added, no data migrated** (all classified above are for a later authorized round); no B-6/B-8 decision; no B-7 reopen; no #34; no Calculation Runtime change. **Adapter status = NOT IMPLEMENTED.** Independent of B-6/B-8: the entire draft-persistence adapter (generate/refresh/regenerate/resume) needs neither and can be implemented next without them.

---

## A. Daily Report Pipeline

- **Entry point (Current Status: In Progress — Source Code Present: Verified; Deployment/Runtime UNVERIFIED):** `runAmazonSnapshotImports()` — `assets/specs/active/apps-script/07_amazon_import_runner.gs:14`, a no-argument loop over `IMPORT_CONFIGS` → `runAmazonSnapshotImport_(cfg,'scheduler',{})`. Safe as a no-arg time-trigger entry point. (Source mirror only; not proof of deployment or a successful run.)
- **What it does (source-verified by audit — source mirror; Deployment/Runtime UNVERIFIED):** imports the four configured Amazon sources and writes `amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_weekly_sales_snapshot` (full rewrite), `amazon_daily_sales_snapshot` (**`rolling_upsert`** — `amazonUpsertRollingSnapshot_`, wired from the runner, 90-day gap-aware config; **Runtime verification PENDING, owner `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`**), plus append-only logs `import_sync_runs` and `import_sync_issues`.
- **What it does NOT do (verified by audit):** it does **not** run Shared-FBM allocation, Days of Supply, or Suggested-Qty recalculation; it does **not** call any Weekly/Monthly recommendation; it has **no** link to `shipping_allocation_drafts`. **Do not claim otherwise.**
- **Canonical target cadence:** owned by [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md) §7A (this spec restates no times). **Whether the trigger is currently installed and running remains Deployment/Runtime UNVERIFIED.**
- **Legacy metadata:** `06_amazon_import_config.gs:184` `scheduleTime: '16:00'` is **LEGACY / SUPERSEDED / not consumed by Runtime** (only `scheduleTimezone` is read, for BQ date math/pruning) — it is **not** the current cadence and must not be presented as one. The daily trigger on `runAmazonSnapshotImports` targets the §7A cadence; whether it is installed and running is **Deployment/Runtime UNVERIFIED**. See §J (Phase 1) for the reconciliation sequence. **Do NOT prescribe a second duplicate same-day Daily Sales import.**
- **Auditable result:** each configured source must produce an auditable `import_sync_runs` row. A job is **not** source-ready merely because the outer function returned; **required configured sources must be individually successful for the applicable business date/batch**, and a partial source failure must remain visible and **block** dependent recommendation generation (§H).
- **Three separate readiness concepts (do not conflate):** (1) imported-source readiness; (2) Analysis-calculation readiness; (3) recommendation readiness (§H).

---

## B. Weekly Shipping Scheduler Contract — `runWeeklyShippingRecommendation()` *(Status: Not Started)*

> **Status: Not Started** (audited: zero occurrences repo-wide). Specified here as a future no-argument entry point. Do not claim it exists; do not install a Weekly trigger until it exists and is manually tested (§I).

- **Schedule:** owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A (this spec restates no times).
- **Required responsibilities (in order):**
  1. Acquire a **script lock / concurrency guard** (`LockService` or equivalent); abort safely if another run holds it.
  2. Resolve the current recommendation cycle + Scope (cycle-grouping cadence owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A).
  3. Verify **Daily Source Readiness** (§H.1).
  4. Verify **Analysis Readiness** (§H.2) — required calculated inputs present/current.
  5. Build recommendations using the **canonical Supply Planning formulas** (`SUPPLY_PLANNING_CALCULATION_RULES.md` §20/§23/§24) — this spec adds no formula.
  6. Create **or resume** exactly **one** Shipping Recommendation Draft per cycle + Scope. The persisted **cycle / unique key mechanism is RESOLVED — B-7 (decision only)** = a **Composite Natural Key** (`shipping_allocation_drafts` + `planning_cycle` (ISO `YYYY-Www`) + company + country + marketplace + source_page + draft_version; §G); **no key column or unique index is added** — one Active Draft per key is Runtime-enforced. Retry/Resume reuse the existing Active Draft and never overwrite user quantity.
  7. Persist recommendation **headers and lines** (§C).
  8. Initialize the **user quantity only when a new line is first created** (§D).
  9. **Never overwrite existing user edits** on retry/rerun.
  10. Return a **structured summary**: `{ success, skipped, resumed, failed, issues }` counts.
  11. **Never report success after partial persistence failure** — fail closed and resumable (§G).

---

## C. Shipping Draft Schema — reference only (this spec defines NO schema)

The `shipping_allocation_drafts` / `shipping_allocation_draft_lines` schema (header columns, line columns, uniqueness, "MUST NOT store" derived fields, and canonical vs legacy quantity names) is **owned by [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) §3.6** and mirrored in **[`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §7.5**. This spec **does not reproduce or amend that schema** — it only consumes it.

- **Work items (this spec) — split (see §K):** (1) the **existing body-driven persistence handler** (`16_shipping_allocation_handlers.gs`: `handleUpsertShippingAllocationDraft_` / `…DraftLines_` / `handleSubmitShippingAllocationDrafts_` + `SHIPPING_ALLOCATION_DRAFTS_HEADERS_` / `procurementEnsureSheet_`) is **In Progress — Source Code Present: Verified; Deployment/Runtime UNVERIFIED**; (2) the **recommendation calculation engine**, (3) the **scheduler-safe accessor / orchestration**, and (4) the **no-arg weekly scheduler** are **Not Started**. This spec wires an accessor around the existing handler; it introduces **no schema**.
- **Quantity names:** canonical = `recommended_qty` (system) + `planned_qty` (user); `recommand_shipment_draft_qty` / `shipment_draft_qty` / `qty` are **legacy read/migration aliases only** — full definition in the schema owner. This spec introduces no new column.

---

## D. Shipping Quantity Protection

The quantity **column names** (system `recommended_qty` vs user `planned_qty`, and their legacy aliases) are **owned by the schema owner** `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6 (mirrored in `DATABASE_RELATIONSHIP_MAP.md` §7.5) — this spec restates no schema. It specifies only the **protection behaviour** between the system snapshot and the user quantity:
- **On first line creation:** user quantity = system recommendation.
- **After first creation:** users may update `planned_qty` and add/delete lines per the Draft workflow; **scheduler retries must not reset `planned_qty`**; the **Daily pipeline must not modify either committed Draft field** (`recommended_qty` or `planned_qty`); a **weekly rerun for the same cycle resumes/idempotently repairs the same batch** (§G) and must **not** create a second active batch or silently refresh recommendations over user edits. A deliberate **Regenerate** action follows the `draft_version` rule and preserves auditability.

---

## E. Monthly Order Scheduler Contract — `runMonthlyOrderRecommendation()` *(Status: Not Started)*

> **Status: Not Started** (audited). The monthly **calculation engine** is also Not Started (`recommended_qty` is passthrough-blank; `13_procurement_handlers.gs:607` `recommended_qty: '', // Calculation Engine not implemented`). Specified here as a future no-arg entry point.

- **Schedule:** owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A (this spec restates no times).
- **Required responsibilities (in order):**
  1. Acquire concurrency guard.
  2. Resolve the current monthly recommendation cycle + Scope (cycle-grouping cadence owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A).
  3. Validate **Daily Source + Analysis readiness** (§H).
  4. Run the **canonical order recommendation calculation** (`SUPPLY_PLANNING_CALCULATION_RULES.md`; engine to be built — no formula added here).
  5. Create **or resume** exactly **one** request allocation Draft per cycle + Scope. The persisted **cycle / unique key mechanism is RESOLVED — B-7 (decision only)** = a **Composite Natural Key** (`request_order_allocation_drafts` + `planning_cycle` (`YYYY-MM`) + company + country + marketplace + draft_purpose + draft_version; Monthly `sku` split-grain **RESOLVED under B-5** — the persisted request grain is `company` × `sku` × `request_bucket` with site dims demoted to 1..N `request_order_line_sources` (RO&PO §3.9); §G); **no key column or unique index is added** — one Active Draft per key is Runtime-enforced. Retry/Resume reuse the existing Active Draft and never overwrite user quantity.
  6. Populate **`recommended_qty`**.
  7. Initialize **`order_qty` only on first line creation** (§F).
  8. **Never overwrite user-modified `order_qty`** on retry.
  9. **Reuse the existing body-driven request-allocation writers where safe** (`handleUpsertRequestOrderAllocationDraft_` / `handleUpsertRequestOrderAllocationDraftLines_` / `handleSubmitRequestOrderAllocationDrafts_`, `15_request_allocation_handlers.gs`) **via a new scheduler-safe orchestration layer** — the no-arg runner assembles the payload (with a resolved `request_allocation_draft_id` for idempotency, §G/§F) and calls the writers. **Orchestration layer status: Not Started.**
  10. **Never attach a trigger directly to a `body`-parameter handler** (§I).

---

## F. Order Quantity Protection

Canonical pair: **`recommended_qty`** = system recommendation snapshot; **`order_qty`** = user-controlled order quantity.
- **On first line creation:** `order_qty = recommended_qty`.
- **After first creation:** the recommendation job must **not** overwrite `order_qty`; the manual **"Send Request"** flow continues to consume the user-confirmed quantity; retries must **not** create duplicate headers. **The current caller omits `request_allocation_draft_id`, so every "Send Request" mints a new `RAD-…` header** (`15_request_allocation_handlers.gs:76`; caller `request-order.js:1693`) — this **caller-omission cannot remain the scheduler's idempotency mechanism**; the scheduler must resolve the cycle's existing draft id first (§G).

---

## G. Cycle Idempotency

**Status: Decision completed (B-7 RESOLVED — Decision Only, 2026-08-02); Implementation pending** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11). The recommendation **cadence** (when the weekly/monthly job runs) is owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A; the **persisted cycle / unique key mechanism is now DECIDED** = a **Composite Natural Key** (Option B). **No Runtime, DB column, composite-key constraint, or unique index is implemented or added here** — uniqueness is Runtime-enforced (deterministic lookup + project LockService + fail-closed); a future surrogate `recommendation_cycle_id` is permitted for DB hardening only.

**Decided identity (B-7):**
- **Composite Natural Key = one Active Draft per `recommendation_type + planning_cycle + business scope`.** Weekly = `shipping_allocation_drafts` + `planning_cycle` (ISO `YYYY-Www`, Asia/Taipei) + company + country + marketplace + source_page + draft_version (destination line-level). Monthly = `request_order_allocation_drafts` + `planning_cycle` (`YYYY-MM`) + company + country + marketplace + draft_purpose + draft_version (Monthly `sku` split-grain **RESOLVED under B-5** — persisted request grain `company` × `sku` × `request_bucket`, site dims → 1..N sources; RO&PO §3.9).
- **Submit is the commitment boundary — a Recommendation Engine (manual or automatic) shall never mutate a Submitted Business Record;** further change follows Reject / Cancel / Reopen / New Revision (mechanics = **B-8**). External OMS records stay outside Recommendation until adopted per **B-4**.

Idempotency work items (Implementation pending — B-7 decided, Runtime Not Started):
- **One active Draft header per recommendation cycle + Scope.** A rerun (Scheduler/Retry/Resume) must **locate and reuse the existing Active Draft before creating anything**, and must **never create a duplicate active Draft**.
- **Line identity must be deterministic or exactly resolvable** within the draft. Retry may **insert missing lines** or **repair incomplete system-owned fields** but must **preserve user-owned quantities** (`planned_qty` / `order_qty`; `shipment_draft_qty` is a legacy read/migration alias for `planned_qty`, never the canonical column — owner defines the names).
- **Manual Recommend / Regenerate** recalculates `recommended_qty`, increments `draft_version`, and makes the latest recommendation the current Active Draft; **if manual quantities exist, user confirmation is required before regenerating planning quantities**.
- Concurrent executions must **not mint duplicate Draft IDs** (script lock / project LockService, §B.1/§E.1).
- A **failed partial run remains failed/incomplete and is safely resumable**; **no empty-success response**.
- **Current gap (verified):** neither Draft table persists a surrogate cycle-key column today (as intended — none is added); the natural key reads the existing `planning_cycle` + scope + `draft_version` header fields. Runtime deterministic-lookup + LockService enforcement is **Not Started**. The `note` field is **not** an idempotency key.

---

## H. Source Readiness — three distinct states

1. **Import Readiness** — required source imports completed **successfully** for the applicable date/batch (each configured source has a successful `import_sync_runs` result; no blocking `import_sync_issues`).
2. **Analysis Readiness** — all required **calculated** inputs for the recommendation are present and current (Shared-FBM allocation, Days of Supply, Suggested Qty — `SUPPLY_PLANNING_CALCULATION_RULES.md`). *(Note: these are NOT produced by `runAmazonSnapshotImports` — §A — so Analysis Readiness is a distinct, currently-unbuilt step.)*
3. **Recommendation Readiness** — Import + Analysis readiness both pass **and** the cycle is eligible to run (not already completed for this cycle key, §G).

**Fail-closed rule:** stale / missing / partial / failed source or analysis → **no Draft creation**; the error must **identify the missing source or calculation**; manual retry is safe after correction.

**RUNTIME/DB MAPPING GAP:** use `import_sync_runs` / `import_sync_issues` only where their **actual schema supports** batch-level readiness. If they **cannot express a single Daily Pipeline batch identity** (one logical "today's pipeline succeeded" signal spanning all configured sources), flag it — a batch/run-group identifier is **RUNTIME MAPPING REQUIRED**. Do not assume a single outer return value implies batch success.

---

## I. Trigger Installation Boundary

Future **manual** trigger configuration (Apps Script console — operational deployment step, **not** part of this spec):
- `runAmazonSnapshotImports` — Daily, at the **§7A cadence** (`SYSTEM_RUNTIME_ARCHITECTURE.md` §7A; no times restated here). Currently the only **no-arg** entry point safe to attach; whether a trigger is installed and running is **Deployment/Runtime UNVERIFIED**.
- `runWeeklyShippingRecommendation` — Weekly, at the **§7A cadence**. **Do not create until the no-arg entry point exists and is manually tested.**
- `runMonthlyOrderRecommendation` — Monthly, at the **§7A cadence**. **Do not create until implemented + tested.**

Hard rules:
- **Never bind a trigger** to `handleUpsertRequestOrderAllocationDraft_(body)`, `handleUpsertRequestOrderAllocationDraftLines_(body)`, or `handleSubmitRequestOrderAllocationDrafts_(body)` — they require a `body` argument (a time trigger passes none).
- **Apps Script project timezone AND Spreadsheet timezone must both be Asia/Taipei.**
- No `ScriptApp.newTrigger(...).timeBased()` installer exists today (audited); installation remains a **manual / operational** step. **No automatic trigger installer is planned by this spec.**

---

## J. Runtime Implementation Sequence (recommended future order)

1. **Phase 1** — Reconcile the legacy `16:00` metadata (§A Legacy metadata) and configure/test the **Daily** trigger on `runAmazonSnapshotImports` at the **§7A cadence** (times owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A).
2. **Phase 2** — Implement the **Import + Analysis readiness** contract (§H), incl. a batch identity if `import_sync_runs` can't express one.
3. **Phase 3** — **Reuse or safely extend the existing shipping persistence path** (`16_shipping_allocation_handlers.gs` body-driven upsert/lines/submit; schema owned by `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6 / `DATABASE_RELATIONSHIP_MAP.md` §7.5). Implement **only the missing** recommendation **calculation engine** and **scheduler-safe accessors / orchestration** (canonical `recommended_qty` / `planned_qty`; legacy alias `recommand_shipment_draft_qty`). **This spec creates/modifies no schema.**
4. **Phase 4** — Implement `runWeeklyShippingRecommendation()` with cycle idempotency (§B/§G).
5. **Phase 5** — Implement the request-order **recommendation engine** and the **monthly orchestration layer** around the existing writers (§E.9).
6. **Phase 6** — Implement `runMonthlyOrderRecommendation()` with cycle idempotency (§E/§G).
7. **Phase 7** — Manual tests + failure/retry tests, **then** install the Weekly/Monthly triggers (§I).

---

## K. Work-item Status (Current Status ∈ {Not Started · In Progress · Verified Complete · Blocked})

Each row's **Current Status** uses exactly one of the four canonical values: **Not Started · In Progress · Verified Complete · Blocked** (Blocked = awaits a Batch B decision). Source-code existence is recorded as a **separate evidence annotation** (`Source Code Present: Verified`), **never as a Current Status value**: a work item whose code path exists and is wired in the Apps Script **source mirror** — but whose **Apps Script Deployment and Runtime execution are UNVERIFIED in this environment** — is **In Progress**, not "Verified Complete". A function name is **never** treated as implementation proof; **no item is Verified Complete without Code + DB + Runtime + Test evidence** (unavailable here). Source evidence, deployment evidence, and runtime evidence are classified separately.

| Work item | Status | Evidence |
|---|---|---|
| `runAmazonSnapshotImports()` no-arg Daily entry | **In Progress** — Source Code Present: Verified; Deployment/Runtime UNVERIFIED | `07_amazon_import_runner.gs:14` |
| Amazon snapshot writers + import logs (incl. Daily Sales `rolling_upsert`) | **In Progress** — Source Code Present: Verified; Deployment/Runtime UNVERIFIED (owner `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`) | `07/08/09_*.gs` |
| Request-order Draft body-driven writers/getters/router/frontend | **In Progress** — Source Code Present: Verified; Deployment/Runtime UNVERIFIED | `15_*.gs`, `01_router.gs:170-179` |
| `runAmazonSnapshotImports` running allocation/DoS/Suggested-Qty | **Not Started** (verified absent — do not claim) | audit |
| `recommended_qty` population by a recommendation engine | **Not Started** | canonical column / passthrough path exists (`15_..:123`, `request-order.js:1703`), but **no recommendation engine populates it** — column existence ≠ engine started |
| `runWeeklyShippingRecommendation()` | **Not Started** | zero grep hits |
| Shipping Draft persistence handler — body-driven upsert/lines/submit + HEADERS + ensure-sheet | **In Progress** — Source Code Present: Verified; Deployment/Runtime UNVERIFIED | `16_shipping_allocation_handlers.gs` (`handleUpsertShippingAllocationDraft_`:115 / `…DraftLines_`:199 / `handleSubmitShippingAllocationDrafts_`:278) |
| Shipping **recommendation calculation engine** | **Not Started** | audit — no calc engine populates `recommended_qty` |
| Shipping **scheduler-safe accessor / orchestration** (wrapping the existing handler for the no-arg weekly job) | **Not Started** | audit — no scheduler-safe wrapper exists |
| `runMonthlyOrderRecommendation()` + monthly engine | **Not Started** | audit; `13_..:607` |
| Manual trigger configuration and runtime verification | **Not Started** | no verified installation/runtime evidence (`newTrigger` absent in `.gs`, audited). **No automatic trigger installer is planned by this spec.** |
| Cycle idempotency (both) — **persisted recommendation cycle / unique-key mechanism** | **Not Started** — decision completed (**B-7 RESOLVED — Decision Only, 2026-08-02**: Composite Natural Key; one Active Draft per `recommendation_type + planning_cycle + business scope`; Runtime-enforced, no DB unique index); implementation (deterministic lookup + LockService + Submit-guard) Not Started. *(Recommendation **cadence** is owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A — a separate concern from the persisted key.)* | §G |
| Source-readiness gate (3 states) — batch-identity persistence | **Not Started** | **Runtime/DB Mapping Required**; whether the existing `import_sync_runs` / `import_sync_issues` logs can express a single Daily-Pipeline batch identity remains **UNVERIFIED**. No Batch B decision ID governs this — it is **not** a Blocker (§H) |
| Reserve Trigger dependency (does any recommendation step reserve stock?) | **B-1 RESOLVED (decision only)** — **No recommendation step reserves.** Reserve happens only at the **Formal Shipment Execution Commit** (owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1), which is not part of this pipeline. **B-1 Implementation = Not Started; Runtime Verification = Not Verified.** | owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1; registry `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-1. *(§D specifies quantity protection, not the Reserve Trigger.)* |

*(Schema, schedule, cycle-key definition, and the quantity-name contract are owned elsewhere and only referenced here — see §C / §A / §G. `recommand_shipment_draft_qty` is a legacy alias defined by the schema owner, not a work item.)*

---

## Implementation Status

This is an implementation **work tracker / handoff spec** — no Runtime, Apps Script, frontend, trigger, DB column, sheet tab, or `project-current-state.md` is created or changed. Per §K: `runAmazonSnapshotImports()` and the Amazon writers + the request-order body-driven writers + the **shipping-draft body-driven persistence handler** (`16_shipping_allocation_handlers.gs`) are **In Progress** (Source Code Present: Verified — source mirror only; **Apps Script Deployment/Runtime UNVERIFIED**); the two recommendation scheduler entry points, both recommendation **calculation engines**, the scheduler-safe orchestration, `recommended_qty` engine population, the **source-readiness gate** (Runtime/DB mapping required — **not** a Batch B blocker), and manual trigger configuration/verification are **Not Started**; the **persisted cycle/unique-key mechanism** (B-7) is **decided (RESOLVED — Decision Only, 2026-08-02: Composite Natural Key + Submit commitment boundary)** with **Runtime implementation Not Started**. The **Reserve Trigger dependency** (B-1) is **RESOLVED (decision only)** — no recommendation step reserves; reserve happens only at the Formal Shipment Execution Commit (owner §8A.1), with B-1 **Implementation Not Started / Runtime Not Verified**.

**No build. No redeploy. No migration. No trigger installation.**

---

## External-Origin-Aware Implementation Order (CANONICAL 2026-08-01 Round 4D-C — implementation tracker; the B-4 Minimal Pure Runtime plan B4-R1–B4-R8 is COMPLETE + test-verified at source/pure-module/pure-orchestration/test-promotion level, Golden #12/#13/#14 promoted (Matrix 28/12/0), no deployment / live Runtime / external ingestion / review actions / source-read / recommendation-writer / persistence / scheduler verified)

Temporary implementation sequence for B-4 Runtime (owner references §A–§K; `SUPPLY_CHAIN_SYSTEM_FLOW.md` §12; `SUPPLY_PLANNING_CALCULATION_RULES.md` §38). **No Runtime, Apps Script, DB, trigger, or scheduler is created by this spec.**

1. canonical `shipment_qty` reader repair
2. `destination_warehouse_id` planning read / backfill
3. normalized supply candidate DTO
4. KM Shipment Incoming Adapter
5. external record identity adapter
6. external authority classifier
7. quarantine state
8. exception / review read model
9. notification event contract
10. Link / Adopt / Reject / Ignore domain actions
11. planning admission resolver
12. lineage resolver
13. ownership resolver
14. deduplication
15. ten-gate Qualified Incoming
16. Required-By comparison
17. Line Runtime integration
18. Golden #12 / #13 / #14
19. new external-quarantine scenarios
20. remaining ledger / allocation scenarios
21. Recommendation Writer
22. B-7 cycle key
23. scheduler
24. retry / lock / failure recovery
25. production verification

**Explicit guards:** Daily Import does **not** automatically approve external records; external sync does **not** automatically admit planning supply; the scheduler must **not** count review-pending external records.

---

## §B4-Plan. B-4 Minimal Runtime Implementation Plan (CANONICAL 2026-08-01 Round 4D-D — planning only; NO Runtime; version retained Draft v1.1)

Refines the External-Origin-Aware Implementation Order (above) into the **smallest dependency-ordered, independently-testable batches** that can truthfully execute Golden #12 / #13 / #14. **The B-4 Minimal Pure Runtime plan B4-R1–B4-R8 is COMPLETE and test-verified at source / pure-module / pure-orchestration / test-promotion level; Golden #12/#13/#14 are promoted and now EXECUTED against the real chain (Matrix 28/12/0). Apps Script deployment / live Runtime / external ingestion / review actions / source-read / recommendation-writer / persistence / scheduler remain UNVERIFIED or NOT IMPLEMENTED.** Main is the sole canonical repository. No schema migration, no scheduler, no receiving, no external API, no notification, no ledger.

**Minimal target (must):** read canonical KM Shipment rows + canonical `shipment_lines.shipment_qty` → resolve destination identity → normalize deterministic supply candidates → B-4 authority / admission classification (exclude external-unlinked / quarantined, fail-closed) → per-table status allowlist → resolve ETA + Required-By → remaining qty → stable-lineage dedup → §2E ten-gate → qualified qty + excluded / late / review breakdown → one Line Runtime fixture path (feed the existing `calculateGap` `timelyQualifiedIncoming` input). Persistence / Scheduler / Receiving / external API deferred.

**Schema boundary:** (A) sufficient now — `shipments.status` / `shipments.eta`, `shipment_lines.shipment_qty`, company / country / marketplace / sku; (B) writer/read alignment only (no new column) — `shipments.destination_warehouse_id` (accepted + mirrored, `12_shipment_handlers.gs:499/709`; legacy-row backfill = data, not schema); (C) future migration — none required for #12/#13/#14; (D) not needed — Supply Ledger / review / notification / receiving tables; (E) B-5 / B-8 — `request_order_line_sources` grain, cancellation-release. **No schema landed this round.**

| Batch | Purpose | Expected files | Kind | Dependency class | Status after |
|---|---|---|---|---|---|
| **B4-R1** | Canonical Shipment source repair — read `shipment_lines.shipment_qty` primary, legacy `qty` explicit fallback | `13_procurement_handlers.gs` (`procurementOnTheWayMaps_`) + source test | I/O (source) | SOURCE EXISTS — REPAIR REQUIRED | **SOURCE IMPLEMENTED — TEST VERIFIED** (2026-08-01; `assets/tests/procurement-shipment-qty-source.test.js`, 23 assertions) — Apps Script deployment / live runtime **UNVERIFIED** |
| **B4-R2** | Destination identity planning-read — `destination_warehouse_id` → compat `warehouse_id` fallback; missing → review/block | shipment reader + test | I/O (source) | SOURCE EXISTS — EXTEND REQUIRED (no new column) | **SOURCE IMPLEMENTED — TEST VERIFIED** (2026-08-01; `assets/tests/shipment-destination-identity-source.test.js`, 25 assertions) — Apps Script deployment / live runtime **UNVERIFIED** |
| **B4-R3** | Normalized supply candidate pure DTO — deterministic builder (authority type, source key, lineage key, status/qty/ETA); no persistence | new pure module + unit | pure | NEW PURE MODULE REQUIRED | **PURE MODULE IMPLEMENTED — UNIT TEST VERIFIED** (2026-08-01; `assets/js/core/supply-planning-supply-candidates.js` + `assets/tests/supply-planning-supply-candidates.test.js`, 54 assertions) — Runtime adapter / Apps Script integration **UNVERIFIED** |
| **B4-R4** | KM Shipment Incoming Adapter — status allowlist, remaining qty, ETA, company/SKU/destination scope, exclusion reasons + downstream source-metadata projection | adapter module + fixtures | adapter | NEW ADAPTER REQUIRED | **PURE ADAPTER IMPLEMENTED — UNIT / INTEGRATION FIXTURE / DOWNSTREAM PROJECTION CONTRACT VERIFIED** (2026-08-01; `assets/js/core/supply-planning-incoming-adapters.js` + `assets/tests/supply-planning-incoming-adapters.test.js`, 80 assertions incl. B4-R4.1 downstream-projection repair) — Apps Script / Line Runtime integration **UNVERIFIED** |
| **B4-R5** | External authority fail-closed adapter — linked evidence = 0 separately; unlinked/quarantined = 0; pure admission classification (no notification/review) | adapter module + fixtures | adapter | NEW ADAPTER REQUIRED | **PURE EXTERNAL-AUTHORITY ADAPTER IMPLEMENTED — UNIT / CROSS-ADAPTER FIXTURE VERIFIED** (2026-08-01; `assets/js/core/supply-planning-external-incoming-adapters.js` + `assets/tests/supply-planning-external-incoming-adapters.test.js`, 82 assertions) — external ingestion / review actions / Apps Script / Line Runtime integration **UNVERIFIED** |
| **B4-R6** | Dedup + ten-gate Qualified Incoming engine — stable-key dedup, ownership precedence, Required-By, late/missing-ETA breakdown; no ledger | pure engine + unit | pure | NEW PURE MODULE REQUIRED | **PURE QUALIFIED-INCOMING ENGINE IMPLEMENTED — UNIT / CROSS-ADAPTER / TEN-GATE / DEDUP / REQUIRED-BY FIXTURES VERIFIED** (2026-08-01; `assets/js/core/supply-planning-qualified-incoming.js` + `assets/tests/supply-planning-qualified-incoming.test.js`, 106 assertions) — Line Runtime / Apps Script / calculateGap / persistence integration **UNVERIFIED** |
| **B4-R7** | Minimal Line Runtime integration — assemble one SKU/company/destination/window; feed Incoming → `calculateGap.timelyQualifiedIncoming`; no scheduler/writer/persistence | integration glue + fixture | orchestration (minimal) | NEW ORCHESTRATION REQUIRED | **PURE MINIMAL LINE-RUNTIME ORCHESTRATION IMPLEMENTED — QUALIFIED-INCOMING → CALCULATEGAP INTEGRATION / ONE-LINE FIXTURES VERIFIED** (2026-08-02; `assets/js/core/supply-planning-line-runtime.js` + `assets/tests/supply-planning-line-runtime.test.js`, 88 assertions) — Apps Script / source-read / recommendation-writer / persistence integration **UNVERIFIED** |
| **B4-R8** | Golden #12 / #13 / #14 promotion — executable fixtures; Matrix promotion only after all Runtime assertions pass | golden test file | test | EXTEND (tests) | **GOLDEN #12/#13/#14 PROMOTED — REAL B4 MINIMAL PURE RUNTIME CHAIN EXECUTED** (2026-08-02; `assets/tests/supply-planning-golden-scenarios.test.js`; Matrix 28 EXECUTED / 12 IMPLEMENTATION_PENDING / 0 CANONICAL-BLOCKED; Golden suite 143 assertions) — production source-read / Apps Script / persistence / deployment **UNVERIFIED** |

**Merge/split:** R1 and R2 are both small source read-alignments and MAY merge if kept independently testable; R3 → R4 → R5 → R6 stay separate (distinct pure/adapter contracts); R7 and R8 stay separate (integration vs promotion). Do not merge any batch that would couple a source repair with an admission decision.

**Gates (each batch):** syntax / import-export · unit assertions · adapter / lineage / dedup fixtures · no input mutation · no source write · no recommendation persistence · no external automatic admission · no schema drift · **Unit 325 / Golden 117 / Matrix 25-15-0 were preserved through B4-R1–B4-R7; B4-R8 promoted #12/#13/#14, moving the Golden Matrix to 28 EXECUTED / 12 IMPLEMENTATION_PENDING / 0 CANONICAL-BLOCKED and the Golden suite to 143 assertions (actual post-promotion count from the passing run — not invented in advance); Unit 325 unchanged**.

**First implementation task = B4-R1** (source evidence confirmed: `procurementOnTheWayMaps_` reads legacy `qty` at `13_:432/438`; `shipment_qty` already exists / written / read-with-fallback in `12_:58/534/612`). Small, no product decision, no schema migration, independently testable, does not imply a complete Qualified Incoming Runtime, lands in Main. **B4-R1 executed 2026-08-01 — SOURCE IMPLEMENTED — TEST VERIFIED** (`procurementOnTheWayMaps_` now reads `shipment_qty` primary via the pure `procShipmentLineQty_` helper, legacy `qty` read-compat only; canonical 0 never falls back; canonical/legacy never summed; read-only; status filter / aggregation keys / return shape unchanged). **Apps Script deployment / live runtime UNVERIFIED.** **B4-R2 executed 2026-08-01 — SOURCE IMPLEMENTED — TEST VERIFIED** (`shipment-destination-identity-source.test.js`, 25 assertions): `destination_warehouse_id` primary, legacy `warehouse_id` read-compat fallback, missing destination explicit (`__MISSING_DEST__`), additive `byDest` destination-scoped feed for B4-R3 (does not alter `exact` / `bySku` or totals; `warehouse_code` / display text / origin `source_warehouse_id` never used as identity). **B4-R3 executed 2026-08-01 — PURE MODULE IMPLEMENTED — UNIT TEST VERIFIED** (`assets/js/core/supply-planning-supply-candidates.js`, `buildKmShipmentSupplyCandidate`, 54 assertions): deterministic `shipment:<id>:<lineId>` identity + lineage, B4-R1 quantity + B4-R2 destination precedence reproduced purely, `KM_CANONICAL` / `KM_SHIPMENT_LINE` in `KM_3PL_OVERSEAS`, source-completeness review flags, pure / immutable / clock-free / DB-free (no status allowlist, no Qualified Incoming, no ETA/Required-By, no dedup, no calculateGap, no persistence; physical lineage from the Shipment-line key, never from aggregate `bySku`/`byDest`). **B4-R4 executed 2026-08-01 — PURE ADAPTER IMPLEMENTED — UNIT / INTEGRATION-FIXTURE / DOWNSTREAM-PROJECTION-CONTRACT VERIFIED** (`assets/js/core/supply-planning-incoming-adapters.js`, `adaptKmShipmentIncomingCandidate`, 80 assertions): canonical Shipment Incoming allowlist (`ready_to_ship` / `shipped` / `in_transit` / `arrived`), scope match (company / SKU / destination + optional country / marketplace), positive `quantityRemaining`, destination + ETA presence, deterministic exclusion/review reasons, fail-closed authority/source/domain; **source-level only — NOT final Qualified Incoming** (no Required-By / ETA-late, no dedup, no ownership precedence, no calculateGap, no persistence). **B4-R4.1 executed 2026-08-01 — DOWNSTREAM PROJECTION CONTRACT REPAIR**: the returned `candidate` snapshot now preserves the normalized B4-R3 source metadata later B4-R6 processing needs — actual `eta` value (preserved verbatim, never parsed; `etaPresent` unchanged), `company` / `country` / `marketplace` / `siteSku`, `sourceUpdatedAt` (preserved, not freshness-evaluated), `destinationIdentitySource` (owned by B4-R3, not re-inferred), and `linkedPurchaseOrderLineId` / `linkedShippingPlanLineId` lineage — as a fresh isolated snapshot (never the input candidate reference); no `sourceEligible` / status / scope / quantity / authority behavior changed. **B4-R5 executed 2026-08-01 — PURE EXTERNAL-AUTHORITY ADAPTER IMPLEMENTED — UNIT / CROSS-ADAPTER-FIXTURE VERIFIED** (`assets/js/core/supply-planning-external-incoming-adapters.js`, `adaptExternalIncomingAuthority`, 82 assertions): classifies one normalized external 3PL/OMS/WMS incoming observation and fails **closed** — for EVERY external record `planningEligible = false` and `adapterEligibleQuantity = 0` (§38 / §12). Accepted authority states `LINKED_EXTERNAL_EVIDENCE` / `EXTERNAL_UNLINKED_QUARANTINED` / `ADOPTION_PENDING` / `ADOPTED_TO_KM` / `REJECTED_EXTERNAL_RECORD` / `IGNORED_FOR_PLANNING` / `SUPERSEDED` / `REVERSED` map to deterministic `stateClass`; missing/unknown fail closed; linked evidence is execution-evidence-only and never contributes separately; adopted rows contribute 0 directly (only the resulting KM canonical Shipment enters planning — count-once); unlinked/quarantined = 0 whether fresh or stale; stable external identity + linkage defects surface as deterministic review reasons; supported sources `EXTERNAL_INBOUND_RECORD` / `EXTERNAL_WMS_INBOUND` / `EXTERNAL_OMS_INBOUND` in domain `EXTERNAL_3PL_OVERSEAS` (KM_SHIPMENT_LINE / PLATFORM_FBA / EXTERNAL_OUTBOUND_RECORD fail closed); pure / deterministic / non-mutating / clock-free / locale-free / DB-free / API-free / UI-free / persistence-free — **classifies only** (no Link/Adopt/Reject/Ignore write, no KM record creation, no notification, no ingestion, no reconciliation update, no state transition, no dedup, no ownership precedence, no Required-By/ETA-late, no final Qualified Incoming, no calculateGap). Three cross-adapter fixtures prove authority separation (linked evidence + KM Shipment, unlinked external, adopted external + resulting KM Shipment) with no summing/dedup. **B4-R6 executed 2026-08-01 — PURE QUALIFIED-INCOMING ENGINE IMPLEMENTED — UNIT / CROSS-ADAPTER / TEN-GATE / DEDUP / REQUIRED-BY FIXTURES VERIFIED** (`assets/js/core/supply-planning-qualified-incoming.js`, `evaluateQualifiedIncoming`, 106 assertions): consumes VERIFIED B4-R4 KM Shipment adapter results + B4-R5 external authority results (never raw rows, never rerun) and projects the frozen §2E ten gates (`MASTER_SKU_MATCH` / `COMPANY_MATCH` / `DESTINATION_OR_SERVICE_SCOPE_MATCH` / `TABLE_STATUS_QUALIFIED` / `ETA_RESOLVED` / `ETA_ON_OR_BEFORE_REQUIRED_BY` / `REMAINING_QUANTITY_POSITIVE` / `NOT_EXCLUDED_LIFECYCLE_STATE` / `NOT_POSTED_TO_CURRENT_STOCK` / `COUNT_ONCE_OWNERSHIP`, each PASS/FAIL/REVIEW) WITHOUT redefining the B4-R4 status allowlist. Stable physical `candidate.lineageKey` is the ONLY dedup key (no SKU+ETA/qty/warehouse/status/label/address/row/timestamp); identical same-lineage duplicates count once (`DUPLICATE_STABLE_LINEAGE`), conflicting same-lineage duplicates fail closed for the whole group (`DUPLICATE_LINEAGE_CONFLICT`, contribution 0). Required-By: ETA and Required-By are strict `YYYY-MM-DD`, real-calendar validated, compared **lexically** — no `Date` constructor, no clock, no timezone, no locale (per §2F.257: current active ETA source is `shipments.eta`, date-only; timestamp normalization is future Runtime work). ETA ≤ Required-By may qualify; ETA > Required-By → `LATE_RISK` (timely 0); missing/invalid ETA → `REVIEW` (timely 0); classification precedence EXCLUDED > REVIEW > LATE_RISK > QUALIFIED. Exact-lineage evidence in `postedToCurrentStockLineageKeys` (Gate 9) or `activeOtherBucketLineageKeys` (Gate 10) excludes; receiving/posting is NOT inferred from `arrived`/`delivered`/status. Every external result stays `planningEligible=false` / `adapterEligibleQuantity=0` and its observed quantity is reported SEPARATELY (never summed into qualified/late/excluded KM totals); linked external evidence adds an informational `LINKED_EXTERNAL_EVIDENCE_PRESENT` token to its KM result but never contributes; adopted external stays 0 (only the resulting KM Shipment may qualify — count-once). Pure / deterministic / non-mutating / clock-free / locale-free / DB-free / API-free / UI-free / persistence-free; **no calculateGap call, no Line Runtime, no PO/approved-Plan adapters, no global cross-stage ownership-transfer Runtime, no receiving, no Golden promotion**. Six integration fixtures cover Golden #12 (draft→EXCLUDED, gates 4/8 FAIL), Golden #13 (on-time→QUALIFIED once + linked external 0), Golden #14 (late→LATE_RISK), duplicate-conflict, posted-to-current-stock, and other-bucket — **Golden #12/#13/#14 remain IMPLEMENTATION_PENDING and were NOT promoted**. **Minimal-scope limitation (truthful):** Shipment + external-evidence scope only; PO / approved-Plan adapters and global cross-stage ownership-transfer Runtime are not implemented (Gate 10 uses only explicit supplied evidence); no B-5 source grain / B-8 cancellation decision. **B4-R7 executed 2026-08-02 — PURE MINIMAL LINE-RUNTIME ORCHESTRATION IMPLEMENTED — QUALIFIED-INCOMING → CALCULATEGAP INTEGRATION / ONE-LINE FIXTURES VERIFIED** (`assets/js/core/supply-planning-line-runtime.js`, `runSupplyPlanningLine`, 88 assertions): the smallest pure one-line Runtime for one exact company + Master-SKU + destinationWarehouseId + Required-By line. It CALLS the real `evaluateQualifiedIncoming` (B4-R6) and the real canonical `calculateGap` (dependency-injected via require / `window.KM` namespaces) — **no gap formula is copied or redefined** (no `Math.max`; `calculateGap` is invoked). Orchestration order: validate input + lineScope → scope-consistency gate (every KM candidate compatible with the declared line; a real company/SKU/destination/country/marketplace mismatch fails closed with RangeError and is never silently dropped; a blank candidate value flows to B4-R6 as REVIEW) → `evaluateQualifiedIncoming` → extract ONLY `qualifiedIncomingResult.qualifiedIncomingQuantity` → `calculateGap({demand, destinationCurrentStock, timelyQualifiedIncoming, timelyApprovedCommittedSupply})` → one fresh result. The ONLY B4-R6 quantity that enters `calculateGap.timelyQualifiedIncoming` is `qualifiedIncomingQuantity`; Late Risk / Review / Excluded / external observed quantities stay VISIBLE in `incomingBreakdown` but contribute 0; demand / current-stock / timely qualified incoming / committed supply are each deducted EXACTLY once by `calculateGap` (floored at 0). demand, `destinationCurrentStock` and `timelyApprovedCommittedSupply` are caller-supplied numbers (non-number → TypeError; NaN/Infinity/negative → RangeError; no numeric-string coercion). Output `{runtimeType:'SUPPLY_PLANNING_LINE', lineScope, requiredByDate, demand, destinationCurrentStock, timelyApprovedCommittedSupply, timelyQualifiedIncoming, calculatedGap, qualifiedIncomingResult(full fresh B4-R6 trace), incomingBreakdown, sourceSummary}`; the full B4-R6 ten-gate / dedup / Required-By / external trace is preserved unmutated and unreclassified. Pure / deterministic / non-mutating / clock-free / locale-free; **reads no Sheet/DB/API, builds no B4-R3 candidates, reruns no B4-R4/R5, computes no recommended-shipping / order / carton / allocation quantity, persists nothing, installs no scheduler, writes no recommendation**. Seven fixtures (no-incoming, Golden #12 draft, Golden #13 on-time + linked external, Golden #14 late, posted-to-current-stock, other-bucket, oversupply) — **Golden #12/#13/#14 remain IMPLEMENTATION_PENDING and were NOT promoted**. **Minimal-scope limitation (truthful):** one pure line path exists; demand / current-stock / committed-supply remain caller-supplied numbers (no forecast/PO/Plan Runtime is read); no Sheet/DB source reader is wired; no Shipping-Recommendation writer is wired; no scheduler is wired; Golden #12/#13/#14 remain pending until B4-R8. **B4-R8 executed 2026-08-02 — GOLDEN #12/#13/#14 PROMOTED — REAL B4 MINIMAL PURE RUNTIME CHAIN EXECUTED** (`assets/tests/supply-planning-golden-scenarios.test.js`; no production module changed): #12/#13/#14 now execute the real `buildKmShipmentSupplyCandidate` → `adaptKmShipmentIncomingCandidate` → `adaptExternalIncomingAuthority` → `evaluateQualifiedIncoming` → `runSupplyPlanningLine` chain against controlled fixtures with canonical LITERAL expected values (no copied candidate / adapter / ten-gate / dedup / Gap logic; no mocks). #12 draft → `EXCLUDED`, Gates 4/8 FAIL, timely 0, Gap 600 (draft never reduces Gap); #13 on-time canonical incoming → `QUALIFIED`, all ten gates PASS, timely 200, Gap 400, linked external evidence contributes 0 separately (`LINKED_EXTERNAL_EVIDENCE_PRESENT` informational only), counted once (not 400); #14 late → `LATE_RISK`, Gate 5 PASS / Gate 6 FAIL, timely 0, lateRisk 200, Gap 600. `EXECUTED_IDS`, `SCENARIO_INVENTORY` and `GOLDEN_SCENARIOS` match exactly; **Matrix is now 28 EXECUTED / 12 IMPLEMENTATION_PENDING / 0 CANONICAL-BLOCKED**; the Golden suite runs **143 assertions** (actual post-promotion count from the passing run); Unit 325 unchanged; every `canonicalStatus` remains FROZEN; only #12/#13/#14 were promoted. **The B-4 Minimal Pure Runtime plan (B4-R1–B4-R8) is COMPLETE and verified at its truthful source / pure-module / pure-orchestration / test-promotion levels. B-4 overall = CONTRACT RESOLVED — MINIMAL PURE RUNTIME AND GOLDEN #12/#13/#14 VERIFIED; PRODUCTION RUNTIME INTEGRATION (Apps Script / Sheet-DB source-read / receiving / external ingestion / Supply Ledger / recommendation writer / scheduler / deployment) IN PROGRESS / UNVERIFIED / NOT IMPLEMENTED.** There is no next B4 Minimal Runtime batch; the next authorized work returns to the Batch B registry to determine the next dependency (none decided here). (No deployment; the registry / other owner docs' "RUNTIME NOT IMPLEMENTED" wording stays until a deployment round.)

---

## §SC-1. Phase-1 Submit Contract — Recommendation Draft → Business Record (FROZEN — Decision Only, 2026-08-04, Round SC-1)

> **Status: PHASE-1 SUBMIT CONTRACT FROZEN — NOT IMPLEMENTED.** Builds directly on **§Persist-Orch PO-4** (`submitRecommendationDraft`), **PO-5** (business scope per type), **PO-6** (Active-lookup key, ≤1 Active per key), **B-7 §G** (Submit commitment boundary — *"a Recommendation Engine shall never mutate a Submitted Business Record"*), and **B-5 §3.9** (Request line grain). No Submit endpoint, writer, LockService, reservation, or UI is implemented or authorized by this round. This is the canonical owner of the Phase-1 Submit contract; `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §SC-1W and `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §SC-1M restate only their domain mapping and defer here.

### SC-1.0 Phase-1 scope (frozen)
Whole **Active Draft** Submit only — no partial line selection, no line-picking. Exactly **one latest unique Active Draft Version** per canonical Recommendation scope is the sole authority; **no cross-version user-edit carry-forward**. A successfully submitted Recommendation Draft becomes **immutable**; the downstream Weekly Shipping Plan / Request Order Draft keeps its own existing edit/cancel lifecycle. Advanced split / partial submit / borrowing / reallocation / merge / reopen / revision are **Phase 2** (SC-1.16).

### SC-1.1 Source identity + Active-Draft resolution (both types)
| Type | Source (header / lines) | Target (header / lines) | Active-lookup key (PO-6, WITHOUT `draft_version`) |
|---|---|---|---|
| WEEKLY_SHIPPING | `shipping_allocation_drafts` / `shipping_allocation_draft_lines` (ids `allocation_draft_id` / `allocation_draft_line_id`) | `shipping_plans` / `shipping_plan_lines` | `WEEKLY_SHIPPING + planning_cycle(YYYY-Www) + company + country + marketplace + source_page` |
| MONTHLY_ORDER | `request_order_allocation_drafts` / `request_order_allocation_draft_lines` (ids `request_allocation_draft_id` / `request_allocation_line_id`) | `request_orders` / `request_order_lines` | `MONTHLY_ORDER + planning_cycle(YYYY-MM) + company + country + marketplace + draft_purpose` |

The Submit source must be: **latest + unique + Active + correct recommendationType + correct planning cycle/business scope + correct `draft_version` + not previously submitted + not cancelled/superseded** (draft terminal statuses `submitted`/`cancelled`; line terminal `submitted`/`cancelled`/`superseded`/`superseded_user_review` per `KMPR`). **Active-Draft count rule (never latest-wins):** `0 → NO_ACTIVE_DRAFT`; `1 → proceed`; `>1 → BLOCKED_CONFLICT`. **Do not auto-pick the latest among duplicate Active records; do not auto-merge duplicate Active Drafts.**

### SC-1.2 Quantity authority (current version only)
For each line of the **latest Active Draft Version**: if an explicit, valid user quantity exists on that same active line → `submit_qty = <userQty>`; otherwise `submit_qty = recommended_qty`. User-qty field = **`planned_qty`** (WEEKLY) / **`order_qty`** (MONTHLY). Rules: never read the user-qty from an **older** draft version (old edits do NOT override a newer recommendation version); `submit_qty` is a **non-negative integer**; a null/missing recommendation must **not** become `0`; explicit `0` is valid only per explicit line eligibility; `line_status` must permit submission. *(Worked example — v1: recommended 300 / planned 400; v2 becomes latest Active with recommended 320 and planned not re-edited → Submit Qty = 320; the v1 planned 400 is superseded and ignored.)*

### SC-1.3 Completeness gate (WEEKLY) — whole-draft blocking
A line has **execution intent** when any execution field is populated (source/destination/qty/method). An execution-intent line must have **every** required field complete, validated against `shipping_plans`/`_lines` schema: source warehouse identity (`source_warehouse_id` + `ship_from_type`), destination warehouse identity (`destination_warehouse_id` + `destination_type`), submit quantity, `shipping_method`, active/eligible `line_status`, the required execution window/date where the canonical flow requires it, and `last_mile_delivery` / `customs_type` / carrier selection when required by the selected method/status. Missing → deterministic line-scoped issue identifying **{draft line id, SKU, field, code}**: `PLAN_LINE_INCOMPLETE` / `MISSING_SOURCE_WAREHOUSE` / `MISSING_DESTINATION_WAREHOUSE` / `MISSING_QUANTITY` / `MISSING_SHIPPING_METHOD` / `MISSING_LAST_MILE` / `MISSING_CUSTOMS_TYPE` / `MISSING_CARRIER_SELECTION`. **Phase-1: any required line incomplete → block the entire Submit** (no silent skip).

### SC-1.4 Blocked-line gate (both) — whole-draft blocking
A line is **blocked** when it cannot safely become a commitment: identity conflict, duplicate active identity, missing source/destination, source facts not ready, unsupported status, invalid quantity, missing required logistics field, recommendation conflict, `line_status = BLOCKED`, or schema/source-readiness issue. **A valid zero-demand line is NOT automatically blocked.** Phase-1: **any in-scope line carrying a BLOCKING issue → the entire Submit fails closed** (`LINE_BLOCKED`; no partial success, no silent omission).

### SC-1.5 Full-carton gate (MONTHLY) — whole-draft blocking
Every submitted MONTHLY line: `units_per_carton` must exist and be `> 0`; `submit_qty` must be divisible by `units_per_carton`; `carton_qty` is derived/validated by the existing formula owner (`SUPPLY_PLANNING_CALCULATION_RULES.md`). **Do not assume `units_per_carton = 1`; do not silently round during Submit.** Failure → `UNITS_PER_CARTON_MISSING` / `FULL_CARTON_REQUIRED` / `INVALID_CARTON_QUANTITY`; any such issue blocks the entire Submit.

### SC-1.6 Request Order grouping (MONTHLY) — Series × Supplier/Factory
Request Order **header** grouping key = **Series × Supplier/Factory** (`request_order_lines.series` × `request_orders.supplier_id`/`factory_id`): one Series for one Supplier/Factory → one `request_orders` header; multiple SKUs → multiple `request_order_lines`. **Company provenance is retained at line level** (`request_order_lines.company`, one company per line; B-5 line key `(request_order_id, company, sku, request_bucket)`); **company is recorded but does NOT automatically split the header** — shared factory resources may consolidate multiple companies' demand under one header. Different factories/suppliers → different Request Orders. Use the schema identity fields (`supplier_id`/`factory_id`), **never display name**. `request_month` + `request_bucket` (canonical `T1`/`T2`/`T3`; never `tier_type`) stay **line-level** — Phase-1 does **not** create one header per month; `tier_group` summarizes buckets (`T1`/`T2_T3`/`mixed`/blank). *(Remaining uncertainty — SC-1.17.)*

### SC-1.7 Three-layer supply protection (frozen)
- **Layer 1 — Recommendation Allocation** (calc-owned, `SUPPLY_PLANNING_CALCULATION_RULES.md` §39/§40): total allocation ≤ calculated available supply; integer output; no fractional remainder; Phase-1 does **not** borrow or move **physical** stock. **Disambiguation (F1-7N-FA-3A.0):** "borrowing/reallocation = Phase 2" refers to **PHYSICAL reservation / borrowing / inventory movement / ownership transfer** only. **ANALYSIS-ONLY / PLANNING-ONLY surplus netting** for recommendation math (§12/§32/§32A assembled by §41 / F1-6) **IS Phase-1 AUTHORIZED** — it changes `net_order_need_snapshot` / `reallocation_in/out_qty_snapshot` / Suggested Qty only and mutates no physical pool. See §41 and DECISION_REGISTER PART B (resolved).
- **Layer 2 — Submit Validation (under LockService):** reread the latest Active Draft; reread authoritative current source availability; aggregate all Submit quantities by **source warehouse + SKU**; include all lines in the current Submit **and** other authoritative commitments the frozen source contract says consume the same available pool; verify `Σ requested ≤ available`; reject stale/over-allocated Submit → `SOURCE_AVAILABLE_QTY_EXCEEDED` with `{sourceWarehouseId, sku, requestedQty, availableQty, affectedLineIds}`.
- **Layer 3 — Approval / Reservation revalidation:** at the authoritative reservation transition (SC-1.8), reread stock again, reverify availability, reject if insufficient; never allow negative stock; never allow reserved above available authority. **Submit passing does NOT reserve inventory** — only the successful reservation transition protects inventory from another Plan.

### SC-1.8 Reservation lifecycle (reconciled with B-1 — preserved precise boundary)
- **Recommendation Submit:** no reservation, no `current_stock` deduction, no `factory_stock` movement.
- **Weekly Shipping Plan Draft:** editable; no `current_stock` deduction.
- **Weekly Shipping Plan Approval → Create Shipment Draft (Execution Commit, §12.1):** creates the Shipment Draft; **no reservation yet.**
- **Shipment Ready-to-Ship transition (`draft → ready_to_ship`) — B-1 canonical Reserve Trigger:** `reserved_stock` increases; `current_stock` unchanged; the `stock_reserved` movement/audit is written. *(This is the precise canonical boundary, owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1 / `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`. **It supersedes any looser reading that "Plan Approval / Shipment-Draft creation reserves"** — Approval only creates the Shipment Draft; reservation is the Ready-to-Ship execution commit.)*
- **Confirm & Ship / authoritative ship transition:** `current_stock` decreases by actual shipped qty; `reserved_stock` releases/decreases; `stock_shipped` movement/audit written.

### SC-1.9 Idempotency (both)
One `draft_id + draft_version` → **at most one** successful Submit result. A repeated identical Submit (double-click / retry / timeout / two tabs / concurrent) returns/reconstructs the **original** downstream result. Same idempotency key with a different normalized command → `IDEMPOTENCY_CONFLICT`. **No duplicate Weekly Shipping Plans / Request Orders / lines.** Requires Lock + reread + **deterministic downstream identity**.

### SC-1.10 Logical transaction / rollback (Sheets is NOT ACID)
All-or-nothing: create **all** intended downstream headers/lines → verify writes → **only then** mark the Recommendation Draft `submitted` (`submitted_by`/`submitted_at` + downstream identity). Any-stage failure must not leave a partially-submitted Draft: the Draft remains the latest Active Draft, no submitted status, no partial authoritative downstream record; staged writes are rolled back/compensated per the implementation design; the user may safely re-submit. **This spec does not claim Google Sheets provides ACID** — it mandates a *logical* transaction + reconciliation/compensation strategy (staged write → verify → commit-marker; a failed run is reconciled by the deterministic downstream identity in SC-1.9).

### SC-1.11 Submitted-Draft immutability (both)
After a successful Submit the Recommendation Draft + its lines are **immutable**: `recommended_qty` cannot change; the user-qty (`planned_qty`/`order_qty`) cannot change; lines cannot be added/deleted; Refresh/Regenerate cannot overwrite that submitted version; status cannot silently revert to `draft`; the old version remains a historical snapshot. The generated Weekly Shipping Plan / Request Order Draft stays editable per its own features (allowed edits + Cancel). **A later downstream edit must NOT rewrite the submitted Recommendation snapshot.**

### SC-1.12 Phase-1 multiple-shipment limitation (controlled)
One Recommendation scope = one Active Draft. **Do not create duplicate Active Drafts to represent multiple ocean shipments.** The full execution-split model is Phase 2; Phase-1 handles multiple shipments through separate subsequent Plan submission/execution actions in the existing workflow. **No `split_no`, no new split schema, and no automatic split allocation are introduced in this round.**

### SC-1.13 Submit command DTO + server flow (extends PO-4)
`SubmitCommand = { recommendationType, draftId, expectedDraftVersion, calculationRunId?(where frozen lineage requires), idempotencyKey, actor (server-resolved) }`. Prefer `draftId + expectedDraftVersion` — do not rely on business-scope lookup alone when `draftId`/version are available. `SubmitResult = { status, draftId, submittedAt, immutable:true, downstreamIds, issues:[] }`. **Server flow:** (1) validate command; (2) acquire LockService (`LOCK_UNAVAILABLE` on failure); (3) reread Draft header+lines; (4) verify latest **unique** Active version (`NO_ACTIVE_DRAFT`/`BLOCKED_CONFLICT`/`DRAFT_NOT_ACTIVE`/`DRAFT_ALREADY_SUBMITTED`); (5) verify `expectedDraftVersion` + lineage (`VERSION_CONFLICT`/`CALCULATION_RUN_MISMATCH`); (6) completeness/blocked/carton gates (SC-1.3–1.5); (7) reread supply + Layer-2 aggregate check (SC-1.7); (8) build **deterministic** downstream plan; (9) persist downstream records; (10) verify writes (`DOWNSTREAM_PERSISTENCE_FAILED`); (11) mark Draft submitted (`SUBMIT_RECONCILIATION_FAILED` if the commit-marker step fails after downstream write — reconcile via SC-1.9 identity); (12) release lock; (13) return downstream IDs + canonical readback. **Submit API implementation remains unauthorized in this round.**

### SC-1.14 Canonical issue tokens (frozen / mapped)
`NO_ACTIVE_DRAFT` · `BLOCKED_CONFLICT` · `DRAFT_NOT_ACTIVE` · `DRAFT_ALREADY_SUBMITTED` · `VERSION_CONFLICT` · `CALCULATION_RUN_MISMATCH` · `PLAN_LINE_INCOMPLETE` · `MISSING_SOURCE_WAREHOUSE` · `MISSING_DESTINATION_WAREHOUSE` · `MISSING_QUANTITY` · `MISSING_SHIPPING_METHOD` · `MISSING_LAST_MILE` · `MISSING_CUSTOMS_TYPE` · `MISSING_CARRIER_SELECTION` · `SOURCE_AVAILABLE_QTY_EXCEEDED` · `LINE_BLOCKED` · `UNITS_PER_CARTON_MISSING` · `FULL_CARTON_REQUIRED` · `INVALID_CARTON_QUANTITY` · `LOCK_UNAVAILABLE` · `IDEMPOTENCY_CONFLICT` · `DOWNSTREAM_PERSISTENCE_FAILED` · `SUBMIT_RECONCILIATION_FAILED`. (`>1 Active` maps to `BLOCKED_CONFLICT`, consistent with `KMVD.activeDraftAudit`.) No duplicate synonyms are introduced without mapping.

### SC-1.15 Phase-2 deferred (explicit)
Partial Submit; selectable lines; cross-company **physical** borrowing; allocation above the current pool; **physical** priority-based reallocation (reservation/movement); full multi-ticket/multi-vessel execution split; Draft merge; submitted-Draft reopen; submitted-Recommendation revision mutation; advanced Cancel/Reopen/New-Revision contract; automatic **physical** stock borrowing. **All Phase 2 — not designed here.** **(F1-7N-FA-3A.0 clarification:** these are the PHYSICAL/execution concerns — reservation, movement, ownership transfer. The **analysis-only planning surplus netting** that produces post-reallocation Net Order Need for the *recommendation* is Phase-1 AUTHORIZED and lives in §41 / F1-6; it commits nothing physical.)

### SC-1.16 Contradictions explicitly superseded
1. Any older wording that Submit reserves/deducts inventory → **superseded**: Submit does not reserve; reservation is the B-1 Ready-to-Ship transition; `current_stock` deducts at Confirm & Ship (SC-1.8).
2. Any "latest-wins among duplicate Active Drafts" reading → **superseded**: `>1 Active = BLOCKED_CONFLICT`, never auto-pick/auto-merge (SC-1.1).
3. Any reading that a newer version inherits an older version's user edit → **superseded**: current-version user-qty only (SC-1.2).
4. The round's looser "Weekly Plan Approval / Shipment-Draft creation reserves" → **reconciled to** the precise B-1 Ready-to-Ship reserve boundary (SC-1.8).

### SC-1.17 Remaining field/schema uncertainties (precise)
1. **`request_orders.company` under factory consolidation (SC-1.6):** the header has a single `company` column while B-5 keeps company at the line; when one Series×Factory header consolidates ≥2 companies, whether `request_orders.company` holds a primary/blank value or needs a `MULTI`-style marker is **UNRESOLVED** — do not invent a column; resolve with the B-5 / RO&PO §3.9 owner.
2. **Weekly required execution window/date field** (SC-1.3): which date column (if any) the canonical flow mandates at Submit vs. defers to Plan editing is **to confirm** against `shipping_plan_lines` at implementation.
3. **`calculationRunId` in SubmitCommand** (SC-1.13): whether frozen lineage requires it for WEEKLY (destination line-level) vs MONTHLY is **to confirm** against the final `recommendation_calculation_runs` lineage contract.
4. **Layer-2 "other authoritative commitments" set** (SC-1.7): the exact list of concurrent commitments consuming the same source pool is **to freeze** with the Supply-Ledger owner (§39) at implementation.

### SC-1.18 Readiness classification
`WEEKLY_SUBMIT_CONTRACT = FROZEN` · `MONTHLY_SUBMIT_CONTRACT = FROZEN` · `SUBMIT_RUNTIME_IMPLEMENTATION = NOT STARTED` · `SUBMIT_API = NOT AUTHORIZED` · `API-1 FOUNDATION = READY` (Submit is out of API-1 scope; the first Weekly read+status slice is unblocked — API-0 / WSR-1). A contract is FROZEN though Runtime is unimplemented.

---

**End of Document**
