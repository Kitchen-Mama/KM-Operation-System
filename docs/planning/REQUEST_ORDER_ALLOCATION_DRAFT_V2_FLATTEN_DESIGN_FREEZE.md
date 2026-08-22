# Request Order Allocation Draft — V2 FLATTEN Design Freeze (F1-7N-FA-3C-DRAFT-MODEL-R1)

**Status:** 🟢 ARCHITECTURE AUTHORIZED — DESIGN FROZEN — **no runtime, no schema, no live-DB change yet.**
**Decision date:** 2026-08-21 · **Owner:** Development Team · **Round:** F1-7N-FA-3C-DRAFT-MODEL-R1
**Authoritative formula owner (unchanged):** `SUPPLY_PLANNING_CALCULATION_RULES.md`. This document changes **no** Net Order Need / Suggested Qty / FLOOR / §41 / Ongoing-PO / T1–T4 math and **no** formal `request_orders` / `request_order_lines` / `request_order_line_sources` / Purchase Order model.

Supersedes the header+lines model for the MONTHLY_ORDER decision workspace. The audit basis is F1-7N-FA-3C-DRAFT-MODEL-R0 (Send-Request trace, persistence trace, field-ownership trace); this freeze is the R1 implementation contract.

---

## 0. Architectural responsibility freeze

| Layer | Table(s) | Responsibility |
|---|---|---|
| Planning evidence | `order_planning_gap` | calculated demand/supply/gap/§41 evidence (recommendation input+output) |
| Calculation lineage | `recommendation_calculation_runs` | run state / formula provenance / execution lineage |
| **Decision workspace** | **`request_order_allocation_drafts` (V2 flat)** | temporary SKU-level human/system decision before formal Request Order |
| Formal transaction | `request_orders` / `request_order_lines` | official Request header / tier rows (NORMALIZED — unchanged) |
| Formal provenance | `request_order_line_sources` | source attribution (unchanged) |
| Procurement | `purchase_orders` / `purchase_order_lines` | PO layer (unchanged) |

Calculation evidence does **not** live on the Draft. The Draft stores only the **decision snapshot** (`tN_recommended_qty`, `tN_order_qty`, `tN_carton_qty`) + a **provenance pointer** (`calculation_run_id`, `calculated_at`). All 14 former Draft-Line calculation snapshots are retired (recoverable from `order_planning_gap` + `recommendation_calculation_runs`).

---

## 1. FROZEN V2 SCHEMA — `request_order_allocation_drafts` (exact canonical column order, 53 columns)

Terminology: `tN_status` (NOT `tN_line_status` — there are no "lines" in V2).

```
# Identity (6)
request_allocation_draft_id
planning_cycle
company
country
marketplace
sku
# Lifecycle (4)
status
generation_type
draft_purpose
draft_version
# Calculation provenance (4)
calculation_run_id
formula_version
calculated_at
source_data_as_of
# Shared decision input (1)
units_per_carton
# T1 (10)
t1_month
t1_recommended_qty
t1_order_qty
t1_carton_qty
t1_status
t1_submitted_by
t1_submitted_at
t1_user_edited
t1_user_edited_by
t1_note
# T2 (10)
t2_month
t2_recommended_qty
t2_order_qty
t2_carton_qty
t2_status
t2_submitted_by
t2_submitted_at
t2_user_edited
t2_user_edited_by
t2_note
# T3 (10)
t3_month
t3_recommended_qty
t3_order_qty
t3_carton_qty
t3_status
t3_submitted_by
t3_submitted_at
t3_user_edited
t3_user_edited_by
t3_note
# Header audit (8)
created_by
created_at
updated_by
updated_at
cancelled_by
cancelled_at
cancel_reason
note
```

**Final field count: 53.** No field is retained "just in case."

---

## 2. Field removal freeze

| Old field | Verdict |
|---|---|
| `category_snapshot` (header) | **REMOVE** — descriptive SKU-master attribute; never read by any DTO; blank on gap drafts; resolve from `sku_details` |
| `series_snapshot` (header) | **REMOVE** — same |
| `request_allocation_line_id` | **RETIRED** — never written; no downstream consumer; natural key was `(draft_id, month, bucket)` |
| `regular_demand_snapshot`, `special_event_demand_snapshot`, `destination_stock_snapshot`, `third_party_available_qty_snapshot`, `qualified_incoming_snapshot`, `approved_supply_snapshot`, `factory_available_qty_snapshot`, `target_pct_snapshot`, `calculated_gap_qty_snapshot`, `recommended_shipping_qty_snapshot`, `residual_production_required_snapshot`, `reallocation_in_qty_snapshot`, `reallocation_out_qty_snapshot`, `net_order_need_snapshot` (14 line snapshots) | **REMOVE** — 6 never written (Engine-A/B placeholders), 4 verbatim `order_planning_gap` duplicates, 4 manual-path-only live-recomputable inputs; the Order Allocation UI reads **none** of them. Evidence lives in `order_planning_gap` + `recommendation_calculation_runs` |
| `allocation_method` (line) | **REMOVE** from Draft decision (not in the frozen 53; it was a per-line display of the allocation path — recoverable from run lineage). *If a future UI needs it, add `tN_allocation_method` at that time — not now.* |
| `recommendation_reason`, `recommendation_flags`, `line_status` (line) | folded: `line_status` → `tN_status`; `recommendation_reason`/`recommendation_flags` **REMOVE** (Engine-B placeholders, unwritten) |

No canonical downstream dependency blocks any removal (R0 proved Send Request + PO read none of these).

---

## 3. Non-actionable Draft persistence policy — **FROZEN: YES (gate persistence)**

Current behavior: a READY SKU with all-zero T1/T2/T3 suggestions still writes 1 header + 3 zero lines. **V2 policy:** the **AI-generated** Draft is persisted only when
```
(t1_recommended_qty + t2_recommended_qty + t3_recommended_qty) > 0
```
**OR** the Draft was **explicitly manually initiated** by the user. A no-recommendation SKU stays visible in Order Planning / `order_planning_gap`; it does **not** create an empty Draft. This does not alter Suggested Qty math — it gates persistence only. (UI-safe: the Order Allocation grid renders from gap rows + active drafts, so an un-persisted no-op SKU still appears.)

---

## 4. Tier decision semantics

- `tN_recommended_qty` = canonical system Suggested Qty **snapshot** (verbatim from `order_planning_gap.tN_suggested_qty` at generation).
- `tN_order_qty` = user/system approved decision quantity (the Send-Request quantity authority).
- `tN_carton_qty` = **persisted** decision field (manual carton adjustment is supported — an editable decision field today; must persist, not UI-only).
- `units_per_carton` = **shared** SKU-Draft value. Frozen as shared unless future evidence proves a tier-specific UPC; no such case exists today.
- `tN_user_edited` / `tN_user_edited_by` = whether/who modified that tier's decision.

**Tier status vocabulary (minimized) — FROZEN: `draft` | `submitted` | `cancelled`.**
Retired from the persisted vocabulary: `active` (→ `draft`), `blocked` (generation-time concern, not a persisted decision state), `superseded` / `superseded_user_review` (row-versioning artifacts of the old line model — V2 supersede is in-place update + `draft_version` bump, no per-tier supersede row).

---

## 5. Header status derivation — **FROZEN**

Canonical header `status` ∈ `draft | partially_submitted | submitted | cancelled`.
A tier is **submittable** iff `tN_order_qty > 0`. Zero-qty tiers **never** participate in submission (a 0-qty tier is never forced to `submitted`).
Derivation over submittable tiers only:
- all submittable tiers `submitted` → **`submitted`**
- some submittable `submitted`, some not → **`partially_submitted`**
- none submitted → **`draft`**
- header explicitly cancelled → **`cancelled`** (terminal)
Send-Request eligibility: only submittable tiers whose `tN_status` is not terminal (`submitted`/`cancelled`).

---

## 6. Send Request contract (formal model UNCHANGED)

One flat SKU Draft → inspect T1/T2/T3 → for each tier with `tN_order_qty > 0` and non-terminal `tN_status`, emit one formal `request_order_lines` VALUE line:

| Draft field | → request_order_lines / payload |
|---|---|
| `sku` | `sku` |
| `company` / `country` / `marketplace` | same |
| tier `Tn` | `request_bucket` |
| `tN_month` | `request_month` |
| `tN_order_qty` | `requested_qty` |
| `units_per_carton` | `units_per_carton` |
| `tN_carton_qty` | carton (if the formal line carries it) |
| `request_allocation_draft_id` | draft-level lineage FK (idempotency + `request_order_line_sources.request_allocation_draft_id`) |

`request_allocation_line_id` = **unnecessary** (never referenced downstream). `request_order_line_sources` = **unchanged** (built from external `sku+company+country+marketplace` lookups + the draft-level FK). Zero-qty tiers are skipped (identical to today's frontend behavior). Formal Request Order / PO grain **unchanged**.

---

## 7. Regeneration / user-edit contract (no child rows)

Per tier, preserving existing authority (no weakening):
- **REUSE** — same `(type, cycle, scope)` → same deterministic draft id → reuse the row.
- **REFRESH** (`SCHEDULED_REFRESH`) — refresh `tN_recommended_qty` only for tiers where `tN_user_edited = FALSE` **and** `tN_status` not terminal; preserve `tN_order_qty` on user-edited tiers; never touch `submitted`/`cancelled` tiers; `draft_version` unchanged.
- **REGENERATE** (`MANUAL_REGENERATE`) — bump `draft_version`; overwrite non-edited non-terminal tiers; overwriting a user-edited tier requires explicit `confirmRegenerateOverUserEdits` (unchanged authority); submitted/cancelled tiers terminal-protected.
- **SUPERSEDE** — in V2 there is no per-row supersede; superseding = in-place row update + `draft_version` bump. The optimistic-lock user-edit fingerprint is computed over the per-tier tuples `(tN_order_qty, tN_user_edited)` on the single row.

`preserveUserQty`, per-tier terminal protection, and the optimistic token all survive — enforced per tier via the `tN_*` columns instead of per line row.

---

## 8. ID contract freeze

- **AI Plan draft id:** `RD::MONTHLY_ORDER::<YYYY-MM>::<canonical scope key>` — deterministic, no Date/UUID in identity (already true; R0 confirmed).
- **`planning_cycle` normalized/validated to `YYYY-MM`** before entering identity (new requirement — coerce/validate in the id path).
- **Manual Draft creation CONVERGES onto the deterministic RD identity (Option A).** Rationale: two writers minting different id families (`RD::…` vs random `RAD-<uuid>`) for the **same active natural scope** risks duplicate-active ambiguity. Manual create must resolve the same deterministic id for the same `(type, cycle, scope)` and REUSE/UPDATE. (`RAD-<uuid>` is retired for new writes; existing `RAD-` rows are handled by migration.)
- **Natural uniqueness key (separate from the opaque id string):** `(recommendationType=MONTHLY_ORDER, planning_cycle[YYYY-MM], company, country, marketplace, sku, draft_purpose)`. Exactly one active Draft per natural key (`>1` → `BLOCKED_CONFLICT`, unchanged).

---

## 9. Timestamp contract freeze

- `created_at` = **first creation only**; immutable across REUSE / REFRESH / REGENERATE. (Current: the persister must copy the prior `created_at` on UPDATE — to be verified/enforced in R2.)
- `updated_at` = last successful persisted mutation (advances on every REFRESH/REGENERATE/edit).
- `calculated_at` = calculation time of the **current** recommendation snapshot.
- `tN_submitted_at` = per-tier submission time.
Conformance note: the USER concern that a refreshed AI Plan did not change `created_at` is **correct behavior** — `created_at` is stable; `updated_at` is what must advance on refresh. R2 must assert both.

---

## 10. Migration contract (design only — NO EXECUTION)

For each legacy `request_order_allocation_drafts` header, find the child lines by `request_bucket ∈ {T1,T2,T3}` and map:
`tN_month←request_month`, `tN_recommended_qty←recommended_qty`, `tN_order_qty←order_qty`, `tN_carton_qty←carton_qty`, `tN_status←map(line_status → {active→draft, superseded*→draft, blocked→draft, submitted→submitted, cancelled→cancelled})`, `tN_submitted_by/at←submitted_by/at`, `tN_user_edited/by←user_edited/by`, `tN_note←note`. Header identity/lifecycle/provenance copied verbatim; `units_per_carton` from any tier line (must be consistent). Drop the 14 snapshots + `category/series` + `request_allocation_line_id`.

| Class | Condition |
|---|---|
| **MIGRATION_SAFE** | ≤1 line per tier, header present, consistent `units_per_carton`, known id shape |
| **NEEDS_MANUAL_REVIEW** | >1 line for the same tier · a `T4` line present · orphan line (no header) · header with 0 lines but marked actionable · blank/inconsistent `units_per_carton` across tiers · unknown/`RAL-` id shape · blank `request_allocation_line_id` is fine (ignored) |
| **BLOCKED_CONFLICT** | >1 active header for one natural-scope key |

Enumerated handling: exactly 3 lines → SAFE; fewer than 3 → missing tier(s) blank/0 (SAFE if header consistent); duplicate T1/T2/T3 → REVIEW; unknown T4 → REVIEW (drop T4, flag); line without header → REVIEW (orphan); header without lines → SAFE if all-zero policy applies else REVIEW; all-zero → migrate then apply §3 gate (may be pruned); partially_submitted/submitted/cancelled → preserve verbatim; user-edited → preserve per-tier flags; old `RAD-` ids → keep row, re-key to deterministic `RD::` only if no active conflict else REVIEW; `RD-` ids → keep; test `RAL-` data → do NOT migrate (exclude as garbage); blank category/series → ignore (removed); legacy snapshots → discard.

---

## 11. Read-only migration-readiness diagnostic (design)

`TEMP_diagnoseDraftMigrationReadiness_` (read-only; `getSheetByName` + header/values read; **no mutation**) reports:
counts of TOTAL / `RD::` / `RAD-` / UNKNOWN headers; headers with 0/1/2/3/>3 lines; DUPLICATE_T1/T2/T3; T4_PRESENT; ORPHAN_LINES; status buckets ACTIVE / PARTIALLY_SUBMITTED / SUBMITTED / CANCELLED; ALL_ZERO vs ACTIONABLE; USER_EDITED count; and per-header classification MIGRATION_SAFE / NEEDS_MANUAL_REVIEW / BLOCKED_CONFLICT. It is authored and run in R3 (paste-ready), never committed as runtime.

---

## 12. Cutover strategy (no long-lived dual-write)

R1 (this): docs + frozen schema + migration/diagnostic design.
R2: implement V2 runtime (persister/generator/readback/frontend) behind the type-scoped schema gate; **tests only, no live DB change**; compatibility boundary.
R3: USER runs the read-only diagnostic; resolve NEEDS_MANUAL_REVIEW / BLOCKED_CONFLICT.
R4: USER-authorized DB provision of V2 columns + backfill; cut the writer to V2 (write-V2-only — no dual-write).
R5: verify end-to-end (AI Plan → Draft → edit → partial Send → remaining tier Send → Request Order → request_order_line_sources).
R6: prove ZERO runtime read/write of `request_order_allocation_draft_lines`.
R7: archive/retire the old line table.

---

## 13. Relationship to PRE3-R3 / PRE3-R4 — **DECISION: B (stop old-model repair; go to V2)**

- **KEEP:** the PRE3-R3 code fix (type-scoped authorized-schema gate, commit `7cb66ac`) — it is correct and **required by V2 too**; the USER should still sync/deploy `24_` + `90_`.
- **KEEP:** provisioning `recommendation_calculation_runs` to its 16 canonical headers — **V2 needs it** (calculation lineage + the gate validates it).
- **DROP (do not do):** the PRE3-R4 live migration of `request_order_allocation_draft_lines` (adding `user_edited`/`user_edited_by`) — that table is being **retired**; migrating it wastes effort and changes live DB twice.
Rationale: safety (one V2 provision instead of two live migrations), no valuable draft data to preserve (recent runs persisted 0 rows; legacy rows are manual/test), least wasted effort, least live-DB churn. R0's "finish PRE3-R4 first" was written **before** flatten was authorized and is now superseded.

---

## 14. `request_order_allocation_draft_lines` status — **DEPRECATED_PENDING_MIGRATION**

Not deleted. Remains readable until R6 proves zero runtime dependency; archived at R7. No new design should target it.

---

## 15. Test contract (all must pass before `DB_CHANGE_READY = YES`)

One Draft row per SKU scope · fixed T1/T2/T3 · no T4 persistence · all-zero AI recommendation creates no Draft · manual-Draft policy · recommended_qty preserved · order_qty preserved · carton preserved · per-tier user edit · per-tier submit · partial submit → `partially_submitted` · full submit → `submitted` · regeneration refreshes untouched tier · protects edited tier · protects submitted tier · deterministic id · `planning_cycle` YYYY-MM validation · Send-Request explosion · zero-qty skipped on Send · `request_order_lines` unchanged · `request_order_line_sources` unchanged · migration SAFE case · migration duplicate-tier conflict · migration orphan line · migration legacy `RAD` · no dependency on `request_allocation_line_id` · no runtime write to old line table after cutover · no business-math change.

---

## 16. Invariants that MUST NOT change

Net Order Need · Suggested Qty · FLOOR / ≤100% proportional · §41 factory surplus reallocation · Ongoing PO · formal `request_orders`/`request_order_lines` grain · `request_order_line_sources` provenance · PO grain · manual Order Qty authority · T1/T2/T3 semantics · T4 visibility-only · no physical inventory mutation from the Draft layer.

**DB_CHANGE_READY = NO** (V2 runtime not yet wired into the live path — see §17). **USER MAY MODIFY DB NOW = NO.**

---

## 17. R2 implementation status (F1-7N-FA-3C-DRAFT-MODEL-R2, 2026-08-21)

**DONE (pure core, tests-only — no live DB / no shared-engine / no frontend change):** `assets/js/core/supply-planning-request-draft-v2.js` (KMRDV2) implements the frozen contract as a **standalone MONTHLY_ORDER-specific pure module**: the 53-column `V2_HEADERS`, `normalizePlanningCycleMonthly` (YYYY-MM validate/normalize, datetime/slash/weekly rejected), deterministic `draftId`/`naturalKey`, `nonActionableGate`, `projectFlatDraftRow`, `deriveHeaderStatus`, `applyTierEdit`/`applySubmit`/`applyCancel`, `reuse`/`refresh`/`regenerate`, `explodeSendRequestLines`, and the migration `classifyLegacyDraft`/`detectActiveConflicts`/`flattenLegacy`/`summarizeMigration`. Test: `request-order-draft-v2-flatten-f1-7n-fa-3c-draft-model-r2.test.js` (95 assertions, the R1 28-item contract). **R2b-1 (2026-08-21):** KMRDV2 is now bundled into `90_generated_supply_planning_bundle.gs` as the `KMRDV2` global (module 51/51) via the sanctioned manifest (`build-apps-script-bundle.js` MODULE_ORDER + GLOBALS) — additive availability only. **NO production `.gs` handler calls KMRDV2 yet** (production callers = 0); the live MONTHLY model is unchanged and the backend shape-adapter flip remains R2b-2.

**HALTED → R2b (CANONICAL BLOCKER, not resolved by R1):** the live-path wiring (route MONTHLY_ORDER generation/readback/edit/submit/Send through KMRDV2 in `47_`/`24_`/`15_`/`request-order.js`; bundle rebuild) is deferred because the recommendation-persistence engine (`KMPB`/`KMPPB`/`KMPR`/`KMPC`) and the shared draft-id/scope core are **shared with WEEKLY_SHIPPING**, which has genuine variable per-source lines and a **`YYYY-Www`** planning_cycle — so the flat MONTHLY model cannot be implemented by modifying the shared engine or shared id core (YYYY-MM normalization there would break WEEKLY). **R2b must first decide the coexistence contract:** MONTHLY_ORDER routes to the KMRDV2 flat path while WEEKLY_SHIPPING stays on the line engine; divergent readback DTOs; type-scoped schema-gate expectations for the flat table. Until then, no runtime write path targets the flat table and the live model is unchanged.

**PRE3-R3 note:** the type-scoped authorized-schema gate is already present in HEAD by content (no forward-port needed); the outstanding item is the USER Apps Script *sync/deploy* of `24_`+`90_`.

**`recommendation_calculation_runs` — LIVE SCHEMA VERIFIED PRESENT (2026-08-21, USER):** live schema EXPECTED=16, ACTUAL=16, MISSING=[], DUPLICATE=[], FIRST_ORDER_MISMATCH_INDEX=-1. The token `RECOMMENDATION_CALCULATION_RUNS_LIVE_PROVISION_PENDING` is **STALE — cleared**; superseded by `RECOMMENDATION_CALCULATION_RUNS_LIVE_SCHEMA_VERIFIED_PRESENT`. Do NOT re-provision. The V2 wiring audits code compatibility only.

---

## 18. Coexistence contract freeze (F1-7N-FA-3C-DRAFT-MODEL-R2b, 2026-08-21)

**This is a PERSISTENCE-MODEL split, NOT a formula-engine split.** One recommendation orchestration/governance; two type-scoped persistence SHAPES.

| Type | Persistence model | Cycle | Runtime shape owner | Tables written |
|---|---|---|---|---|
| **MONTHLY_ORDER** | ONE flat `request_order_allocation_drafts` row / SKU scope | `YYYY-MM` | **KMRDV2** (shape/lifecycle/id) | `request_order_allocation_drafts` + `recommendation_calculation_runs` — **NEVER** `request_order_allocation_draft_lines` |
| **WEEKLY_SHIPPING** | existing header + variable per-source lines | `YYYY-Www` | existing line engine (KMPB/KMPPB/KMPR line path) | `shipping_allocation_drafts` + `_draft_lines` + `recommendation_calculation_runs` — **unchanged** |

**Responsibility classification (audit of the shared engine):**
- **SHARED_GOVERNANCE (stays in KMPW/KMORCH/KMPR/KMPL — reused by both, NOT duplicated):** recommendation_type dispatch, `calculation_run_id`, `formula_version`, `source_data_as_of`, LockService/concurrency, optimistic-token authority, run journal (`recommendation_calculation_runs`), schema-safety framework, actor/timestamps, error envelope.
- **TYPE-SCOPED SHAPE (must NOT stay shared; MONTHLY→KMRDV2, WEEKLY→line path):** Draft row projection, tier persistence, cycle normalization, line natural keys, user-edit fingerprint, schema-gate expected tables/headers, readback DTO.

**FROZEN DESIGN DECISION — shared-governance + type-scoped SHAPE ADAPTER (NOT a parallel persister).** The eventual wiring injects, per `recommendationType`, a shape adapter (projector + table spec + readback) into the SHARED governance path: MONTHLY_ORDER → KMRDV2 flat adapter; WEEKLY_SHIPPING → the existing line adapter. This satisfies §20 (KMRDV2 remains the single authority for flat status-derivation / deterministic id / lifecycle / tier protection — no `.gs` copy) and keeps the hard, risky governance (locking, journaling, active-draft resolution, optimistic token) unchanged for BOTH types. **One production dispatcher owns type→shape; no scattered `if (MONTHLY_ORDER)` branches.**

**Type-scoped schema gate:** for MONTHLY_ORDER the authorized set becomes `{request_order_allocation_drafts (V2 53-col), recommendation_calculation_runs}` — the line table and the shipping_allocation tables MUST NOT be required. WEEKLY_SHIPPING keeps its existing required set. (Builds on the PRE3-R3 type-scope; adds a V2 flat spec for MONTHLY.)

### R2b implementation status & decomposition (HALTED before live flip)
R2b did **not** land the live flip: the flip is atomic (schema-gate + persister + readback must change together, else the live path breaks) and it edits the shared engine (WEEKLY blast radius) — too large to implement AND verify to the 0-regression bar in one turn without a partial, live-breaking half-state. Decomposition (each its own bounded, tests-only, no-live-DB slice):
- **R2b-1 — DONE (2026-08-21):** bundled KMRDV2 via the sanctioned manifest (MODULE_ORDER + GLOBALS) so Apps Script can call the single authority; bundle regenerated through the tool (50→51 modules, SHA `4602b248…`→`bee565c9…`), `--check` reproducible, bundle-sync + namespace tests updated (51-module count + KMRDV2 exposure). No runtime behavior change; additive namespace; production callers = 0. `90_` will require eventual Apps Script sync only when R2b-2 introduces the first live caller — do NOT deploy an unused bundle standalone.
- **R2b-2 — DONE (2026-08-21, code-ready + cutover-gated, tests-only):** the atomic backend flip is implemented behind a DEFAULT-OFF cutover flag (`REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_` in `00_config.gs`).
  - New pure SHAPE ADAPTER `assets/js/core/supply-planning-request-draft-v2-persistence.js` (**KMRDV2P**): flat plan (`planFlat`) + single-row apply (`applyFlat`, NO child lines) + flat readback DTO (`flatReadbackDto`/`readActiveFlatForScope`) + `v2TableSpecs()` (derived from `KMRDV2.V2_HEADERS` → drift-proof) + end-to-end driver `generateMonthlyFlat(command, deps)`. It **reuses the SHARED governance primitives** (KMPR `computeExpectedToken`/`tokensMatch` optimistic token + the identical 16-col `recommendation_calculation_runs` journal row) and **delegates all shape/lifecycle to KMRDV2**. It never authors business math and never touches a WEEKLY or child-line table.
  - Shared token reuse = flat fingerprint over the three per-tier tuples `(tN_order_qty, tN_user_edited)` — the flat analogue of the line engine's `(lineKey,userQty,userEdited)`; concurrency protection is preserved, WEEKLY's fingerprint is untouched.
  - `supply-planning-production-writer.js`: additive optional `opts.tableSpecsOverride` on `validateAuthorizedRecommendationSchemas` (MONTHLY V2 validates ONLY the 53-col flat drafts + run journal — excludes the retired child-line table and both shipping tables; fails closed on a flat-schema mismatch). Backward-compatible; WEEKLY/line path byte-identical when no override is passed.
  - `.gs` wiring (cutover-gated): `24_` `rpoGenerateRecommendationDraftLockedResult_` dispatches MONTHLY→`rpoGenerateMonthlyFlatResult_` (LockService + flat schema gate + `KMRDV2P.generateMonthlyFlat` + keyed-delta write) when the flag is on; `47_` `handleGetActiveRequestOrderDraftReadback_` returns `recGenFlatReadback_` (flat DTO, header-table only). Bundle rebuilt through the tool (52 modules; KMRDV2P global). Coexistence suite `request-order-draft-v2-coexistence-f1-7n-fa-3c-r2b2.test.js` (50 assertions).
  - **Flag DEFAULT OFF** = live MONTHLY behavior is unchanged even if `90_` is synced for an unrelated reason (the flat path additionally fails closed against a non-V2 schema, so an early flip cannot corrupt data). `RUNTIME_V2_READY` stays **NO** until R4 sets the flag + provisions the DB + deploys R2b-3.
  - **PREMISE CORRECTION (code-verified):** WEEKLY_SHIPPING draft `planning_cycle` is `RECO-YYYY-MM` (month-grained; the week lives in `window_code`), **not `YYYY-Www`**; and WEEKLY does not call the authorized-schema gate at all. The coexistence invariant that matters: MONTHLY normalizes to a bare `YYYY-MM` via KMRDV2 and **rejects** the `RECO-` prefix, so the WEEKLY cycle can never be routed through KMRDV2.
- **R2b-3 — DONE (2026-08-21, code-ready + cutover-gated, tests-only):** the MONTHLY V2 application layer is complete end-to-end.
  - **Frontend seam** (`request-order.js`, pure `__RO_EDIT_PURE__` block): `_roV2IsFlatDraft_` / `_roV2NormalizeFlatDraft_` project the flat readback DTO's `tiers[]` into the EXACT same `{draftId, draftVersion, status, lines:{T1/T2/T3}}` UI model the legacy `{header,lines}` path produces — so ALL downstream render/edit/Send code is unchanged and `t1_/t2_/t3_` access lives in ONE function; no child-line id is ever synthesized. `_roLoadCanonicalDraftsForScope_` branches on the shape the backend actually sent (no separate frontend flag → no destructive half-state). `_roV2BuildSendLinesFromFlat_` consumes `window.KM.requestDraftV2.explodeSendRequestLinesFromDto` directly.
  - **Edit / submit / cancel** (KMRDV2P `editMonthlyFlat` / `submitMonthlyFlat` / `cancelMonthlyFlat`, delegating to `KMRDV2.applyTierEdit`/`applySubmit`/`applyCancel`): per-tier isolation, `recommended_qty` never rewritten, `user_edited` stamped, terminal/cancelled protection, partial→full header status via `KMRDV2.deriveHeaderStatus`, shared optimistic token + run journal. `.gs` cutover-gated branches added to `25_` (`updateRecommendationDecisionLocked` + `getRecommendationDraftToken`) and `15_` (`submitRequestOrderAllocationDrafts`); shared flat helpers in `24_` (`rpoFlatLockedApply_`/`rpoEditMonthlyFlatResult_`/`rpoSubmitMonthlyFlatResult_`). Frontend edit/token/submit COMMAND shapes are unchanged — the backend dispatches by cutover+type.
  - **Send Request**: `KMRDV2.explodeSendRequestLinesFromDto(dto)` (additive) → the exact `body.lines[]` shape `handleCreateRequestOrderDraft_` (13_) already consumes; lineage FK = `request_allocation_draft_id`, NO `request_allocation_line_id`; zero/cancelled tiers skipped. `request_orders`/`request_order_lines`/`request_order_line_sources` contracts unchanged. Send backend needs NO change.
  - Tests: `request-order-v2-frontend-app-f1-7n-fa-3c-r2b3.test.js` (40 assertions). Bundle rebuilt (52 modules; KMRDV2P VERSION `kmrdv2p-fa3c-r2b3-1`). Cutover flag stays **OFF**; live DB still legacy; frontend NOT deployed.
  - **R3 diagnostic FINALIZED:** `assets/specs/active/apps-script/TEMP_draft_migration_diagnostic.gs` — self-contained (no KMRDV2/bundle dependency), strictly read-only, paste-ready; its inline classifier is proven byte-equivalent to `KMRDV2.summarizeMigration`.
- **R3** — USER runs the read-only diagnostic; resolve conflicts. **R4** — USER-authorized DB provision + cutover.

---

## 19. R3-FINAL — live-data audit + migration / ID / FK policy (**FROZEN 2026-08-21**)

Live R3 diagnostic (read-only, no mutation): **124 headers, 124/124 MIGRATION_SAFE, 0 review, 0 conflict, 0 duplicate-tier, 0 T4, 0 orphan, 0 unknown-id, 0 user-edited.** `R3_DATA_SHAPE_AUDIT = PASS`. The architecture, the 53-col schema, and the legacy-line retirement are NOT reopened.

**19.1 Population proof (set logic + mechanism, not equal-counts).**
- Every zero-line header is non-actionable: no lines → `actionable=false` → `ALL_ZERO`. So `zero-line ⊆ all-zero`; and `|zero-line| = |all-zero| = 98` ⇒ **the 98 zero-line headers ARE exactly the 98 all-zero headers**, and every header with ≥1 line is actionable.
- Headers-with-lines = 4+5+17 = **26 = ACTIONABLE**; legacy child rows = 4·1+5·2+17·3 = **65**.
- **SUBMITTED (20) ⊆ ACTIONABLE (26)** — proven by the submit mechanism, not counts: a legacy header only reaches `status='submitted'` when `raSubmitLinesByDraft_` marks ≥1 existing line submitted (header→submitted requires `counts.submitted>0`). No lines ⇒ never submitted. So all 20 submitted have lines. ⇒ ACTIONABLE = 20 submitted + 6 active-with-lines; ACTIVE(104) = 98 zero-line + 6 with-lines. All totals reconcile.

**19.2 Downstream FK audit (repo evidence).** `request_allocation_draft_id` is (a) a persisted column of `request_order_line_sources` (`13_:67`, written `13_:870`) and (b) the Send exactly-once **execution key** `roExecutionKey_` (`13_:717`) stored as `request_orders.source_ref_id`. Therefore a **submitted** draft's id is a live downstream FK AND an idempotency key — rewriting it would orphan `request_order_line_sources` lineage and risk a duplicate `request_order` on re-send. `request_allocation_line_id` has **no production consumer** in the MONTHLY V2 decision/edit/submit/Send/lineage path (only the retired line-table header def `15_:38` + the generic snapshot normalizer `operation-system-db-api.js:1807` over the legacy table). `category_snapshot`/`series_snapshot` are display labels written from master data (`15_`/`request-order.js:3222`); no decision, no required lineage (Send derives `series` from master `infoMap`, not the snapshot). The 14 line calc snapshots have no decision consumer (evidence authority = `order_planning_gap` + `recommendation_calculation_runs`).

**19.3 ID policy (FROZEN).**
- `ACTIVE_UNCOMMITTED_ID_POLICY = PRESERVE VERBATIM` — no downstream FK yet; migration copies the existing id; next AI-Plan refresh finds the row **by scope** (not id) and reuses it, so a non-canonical legacy id never orphans.
- `FORMALIZED_ID_POLICY (submitted) = PRESERVE VERBATIM` — required: live `request_order_line_sources` FK + Send execution key.
- `HISTORICAL_ID_POLICY = PRESERVE VERBATIM` — legacy `RAD-`/`RD::` kept as-is; **do NOT force RAD→RD** (aesthetic only, and risky).
- `NEW_WRITE_ID_POLICY = RD::MONTHLY_ORDER::<YYYY-MM>::<sorted scopeKey>` (KMRDV2, post-cutover only). ⇒ `CONVERT_ID_COUNT = 0`, `PRESERVE_LEGACY_ID_COUNT = 26`.

**19.4 Provenance policy (FROZEN).** Historical migration preserves whatever `calculation_run_id` the legacy header carries (may be blank for manual RAD); it does **not** manufacture missing `recommendation_calculation_runs` rows. V2 **new** writes require canonical run provenance (KMRDV2P uses the gap `calculationRunId`, else a deterministic `RUN::<draftId>::v<version>`).

**19.5 Retirement verdicts (FROZEN, repo-confirmed).** `category_snapshot` = **REMOVE**; `series_snapshot` = **REMOVE**; 14 line calc snapshots = **REMOVE**; `request_allocation_line_id` = **RETIRE**. (No production consumer contradicts these.)

**19.6 Migration population (FROZEN).**
`LEGACY_HEADERS_TOTAL=124` · `DROP_NON_ACTIONABLE=98` (all-zero/zero-line, all ACTIVE; remain in the legacy table as read-only history — dropped from V2 only, never deleted) · `MIGRATE_ACTIONABLE=26` (= `MIGRATE_SUBMITTED=20` ∪ `MIGRATE_ACTIVE_WITH_LINES=6`, deduped; submitted⊆actionable so no double-count) · `PRESERVE_LEGACY_ID=26` · `CONVERT_ID=0` · **`FINAL_V2_ROW_COUNT = 26`.**

**19.7 Transformation.** Every migrated header + its T1/T2/T3 lines → ONE `KMRDV2.V2_HEADERS` 53-col flat row (the frozen `flattenLegacy` mapping: `tN_month/recommended_qty/order_qty/carton_qty/status/user_edited/note` from the matching bucket line; header status preserved verbatim; id preserved). No alternate mapper. RD/RAD, active/submitted all map identically; only the preserved id string differs.

**19.8 DB strategy (FROZEN) = C — STAGING TABLE + ATOMIC REPLACE.** Build `request_order_allocation_drafts_v2` (53-col), populate the 26 migrated rows, validate counts/identity/tier values, then atomic-swap (rename live `request_order_allocation_drafts` → `..._legacy_backup`, rename `_v2` → canonical). Rejected: **A in-place ALTER** leaves the 98 stale rows + cannot cleanly drop the retired 26-col shape (half-state, dirty schema); **B rebuild-in-place** is destructive with no parallel backup. C gives data safety, FK preservation (ids copied verbatim), a clean 53-col schema with only valid rows, single-step rollback (swap back), and no half-state. The legacy child-line table `request_order_allocation_draft_lines` is **kept untouched** (read-only history + rollback) through R6; retired at R7.

**19.9 Cutover flag mechanism (FROZEN).** Keep the established source constant `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_` (`00_config.gs`, default `false`). R4 flips it to `true` and syncs `00_config.gs` — no new Script Property / config mechanism.

**19.10 R4 runtime Apps Script sync set (git-truth, PRE3-R2→R2b-3):** `00_config.gs`, `15_request_allocation_handlers.gs`, `24_recommendation_orchestrator.gs`, `25_recommendation_user_edit.gs`, `47_api_v1_recommendation_generation.gs`, **`48_api_v1_request_order_draft_job.gs`** (PRE3-R2 observability — git-confirmed changed, never synced), `90_generated_supply_planning_bundle.gs`. Frontend deploy: `assets/js/pages/request-order.js` + `assets/css/pages/request-order.css` (PRE3-R2 result-panel styles). `TEMP_draft_migration_diagnostic.gs` is paste-only (R3) — not a runtime sync; remove after use.

**19.11 R4 atomic order (must avoid every half-state).** 1 backup `request_order_allocation_drafts` + `_draft_lines` tabs. 2 build `_v2` staging (53-col). 3 migrate the 26 accepted rows (drop 98; ids verbatim). 4 validate (row count = 26; each id present; tier order/recommended values match source). 5 provision `recommendation_calculation_runs` if not already (already 16/16). 6 atomic swap `_v2`→canonical, live→`_legacy_backup`; **keep `_draft_lines`**. 7 sync the §19.10 `.gs` set. 8 set `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = true` (in the synced `00_config.gs`). 9 create a new Apps Script deployment version. 10 deploy the frontend files. 11 hard refresh. 12 smoke test (§19.13). 13 verify DB. 14 verify zero new `request_order_allocation_draft_lines` writes. Ordering guarantees schema-ready before flag-on, and backend+DB+frontend flip together (no backend-V2/DB-legacy, no frontend-flat/backend-legacy window).

**19.12 Rollback.** 1 set `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = false` (instant behavior revert — line path resumes). 2 restore the previous Apps Script deployment version if needed. 3 restore the previous frontend build if needed. 4 if the swap was done, rename `_legacy_backup` → `request_order_allocation_drafts`. The untouched `_draft_lines` table makes the legacy line path fully functional again.

**19.13 R4 live acceptance (PASS criteria).** AI Plan actionable SKU → one flat 53-col row, deterministic `RD::`, `planning_cycle=YYYY-MM`, 0 child-line writes; AI Plan zero SKU → NOT persisted (`NON_ACTIONABLE_ZERO_RECOMMENDATION`); T1/T2/T3 Suggested shown; Order Qty / Carton / Note edit persists to the flat row, `recommended_qty` unchanged, `created_at` immutable, `updated_at` advances; refresh preserves an edited tier; submitted-tier protected; partial submit → `partially_submitted`; remaining submit → `submitted`; zero tier never submitted; Send Request → `request_orders` + `request_order_lines` + `request_order_line_sources` (FK `request_allocation_draft_id`, no line id); a second identical Send is idempotent (no duplicate request_order via the execution key); `recommendation_calculation_runs` row written. (`CO1100-R` may be the smoke SKU if still eligible.)

---

## 20. R4 production cutover PACKAGE (F1-7N-FA-3C-DRAFT-MODEL-R4, 2026-08-21)

The USER-executed cutover no longer requires hand-transforming 26 records. Tooling is built + tested; Claude executes nothing live.

**20.1 Migration planner (pure, bundled).** `KMRDV2P.planMigration(headers, linesByDraftId, {expect})` orchestrates the frozen `KMRDV2` authority (`summarizeMigration` + `flattenLegacy`) — no second algorithm. It (a) drift-gates the live set against the accepted R3 shape (`{TOTAL_HEADERS:124, ACTIONABLE:26, ALL_ZERO:98, NEEDS_MANUAL_REVIEW:0, BLOCKED_CONFLICT:0, ORPHAN_LINES:0, DUPLICATE_T1/2/3:0, T4_PRESENT:0, SUBMITTED:20}`) → HALT `R4_LIVE_DATA_DRIFT_FROM_R3` on any change; (b) selects ONLY actionable headers and asserts `hasLines == ACTIONABLE` (re-proves the R3 equivalence at migrate-time); (c) flattens each via `KMRDV2.flattenLegacy` with a hard `PRESERVED_IDS=26 / CONVERTED_IDS=0` assertion (ids verbatim; RAD stays RAD); (d) hard-gates `SUBMITTED_MIGRATED == SUBMITTED_SOURCE == 20`. Returns `{ok, halt?, summary, report, stagingHeaders(=V2_HEADERS), stagingRows}`; mutates nothing.

**20.2 Staging validator (pure, bundled).** `KMRDV2P.validateStaging(stagingHeaders, stagingRows, sourceHeaders, sourceLinesByDraftId, {expectRows})` → `{SCHEMA_OK, ROW_COUNT_OK, ID_SET_OK, SUBMITTED_SET_OK, TIER_VALUES_OK, NATURAL_SCOPE_OK, READY_FOR_SWAP}`. Independently re-checks the written staging tab (53-col exact order, no retired columns, 26 unique ids, all 20 submitted ids present, per-tier order/recommended equal to source, no duplicate active scope).

**20.3 Paste-ready `.gs` helpers** (`assets/specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs`; TEMP / not permanent runtime). **R4A:** the USER runs three NO-ARGUMENT public entrypoints from the Apps Script Run dropdown (they do NOT end with `_`, so they are Run-menu visible; the private core ends with `_` and is hidden — a Run with a forgotten argument can never fall into an ambiguous mode):
  - `TEMP_R4_DRY_RUN_RequestOrderDraftV2()` → private core with `execute:false` (dry-run; read-only; logs plan+report+samples; ZERO writes).
  - `TEMP_R4_EXECUTE_RequestOrderDraftV2()` → private core with `execute:true` (writes ONLY `request_order_allocation_drafts_v2`: 53 headers + 26 rows; fails closed `STAGING_TAB_NOT_EMPTY` if that tab already has data/other schema).
  - `TEMP_R4_VALIDATE_RequestOrderDraftV2Staging()` → the read-only staging validator.
  Private core: `TEMP_migrateRequestOrderDraftV2_({execute})` (default `execute:false`) + `TEMP_validateRequestOrderDraftV2Staging_()`. All delegate semantics to KMRDV2/KMRDV2P; the tool NEVER touches the legacy tabs, NEVER renames/deletes/swaps tabs, NEVER flips the flag, NEVER deploys. Run order: DRY RUN → architect verifies the log → EXECUTE → VALIDATE (never jump straight to EXECUTE).

**20.4 Tab swap stays USER-controlled** — the helper never renames `request_order_allocation_drafts` ↔ `_v2`; the USER inspects staging, confirms `READY_FOR_SWAP=YES`, then renames (§19.11 steps 6/11–12). The legacy `request_order_allocation_draft_lines` is never touched (rollback), retired only at R7.

**20.5 Flag** — repo constant stays `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = false` (NOT flipped this round, so no stray sync can pre-enable cutover). The USER edits it to `true` inside the `00_config.gs` they paste at §19.11 step 8, after the DB swap — never before.

**20.6 R4 permanent sync set (git-truth re-confirmed)** = the seven `.gs` in §19.10 + frontend `request-order.js` + `request-order.css` (real 15-line PRE3-R2 panel diff). The two `TEMP_*` `.gs` are paste-run-remove, NOT permanent sync. Bundle rebuilt (52 modules, KMRDV2P `kmrdv2p-fa3c-r4-1`).

---

## 21. R4B / R4B2 — live dry-run semantic conformance + ALL-26 cycle authority (2026-08-21, appendix)

**R4B finding (OUTCOME B).** The live dry-run passed all shape gates (124/98/26/20) yet exposed two defect classes the R4 validator did not catch, because `KMRDV2.flattenLegacy` copies `planning_cycle` and `status` **verbatim** and `validateStaging` had **no** cycle-format / status-vocab gate: (a) non-canonical `planning_cycle` values — a numeric year-only `2026`, and a localized Date value `Sat Aug 01 2026 …` (that Date text is also embedded in the RD **ID**); (b) a legacy `site_confirmed` status outside the V2 vocab. Evidence: V2 canonical cycle = bare `YYYY-MM` (`normalizePlanningCycleMonthly`); canonical status = `{draft, partially_submitted, submitted, cancelled}`; `planning_cycle = gapRow.calculation_month` (47_:225) and `calculation_month = calcDate.slice(0,7)` (43_:250) — an **independent** calc-date anchor, so a lost month is **not** derivable from tier `tN_month` (43_:172); `loadActiveFlat` matches active rows by normalized cycle, so a non-canonical cycle on an **active** row causes a **duplicate active draft** on the next AI Plan. Partial sync (00/24/25/47/90) is **safe while the flag is false** (every V2 branch is flag-gated; no synced file references an un-synced 15_/48_ function).

**Architect decisions (FROZEN this appendix):**
- **D1 — `site_confirmed → draft` APPROVED** for migration; **supersedes §19.7 status-verbatim.** `submitted`/`cancelled` stay verbatim; any other unknown status → HALT.
- **D2 — deterministic Date/ISO/localized-Date parse of the `planning_cycle` FIELD → bare `YYYY-MM` APPROVED** — parse only from the stored value, never the clock; **`request_allocation_draft_id` preserved verbatim** even when it contains Date text; ambiguous parse → HALT.
- **D3 — a complete read-only ALL-26 diagnostic APPROVED** (delivered in R4B2).
- **D4 — year-only values (numeric/string `2026`) remain UNRESOLVED** — no month may be guessed, derived from the clock, or auto-taken from `created_at`/`updated_at`/a tier month; the exact IDs are surfaced for a USER-supplied `YYYY-MM` map.

**R4B2 diagnostic (read-only, delivered).** `TEMP_R4_AUDIT_ALL_26_RequestOrderDraftV2()` (public, no-arg, Run-menu-visible; in `TEMP_migrate_request_order_draft_v2.gs`) reads ONLY `request_order_allocation_drafts` + `request_order_allocation_draft_lines` (+ an exact-id read-only join to `recommendation_calculation_runs`), writes NOTHING, and emits one JSON record per each of the 26 actionable rows (`DIAG_ROW_01..26_OF_26`) plus a summary/unresolved/checksum block. Per row it reports the exact preserved id, id-family, raw `planning_cycle` + JS type + isDate + ISO, raw status + D1 proposed status, scope, `calculation_run_id` + run-journal join, tier months (labeled `TIER_INFORMATIONAL_NOT_AUTHORITY`), a deterministic `proposed_cycle` (only when unambiguous), a `cycle_classification` (`CANONICAL_ALREADY` / `DATE_PARSE_APPROVED` / `YEAR_ONLY_UNRESOLVED` / `INVALID_UNRESOLVED` / `EVIDENCE_CONFLICT`), and a risk (`ACTIVE_DUPLICATE_RISK` / `TERMINAL_HISTORY_NONCANONICAL` / `NONE`). A Date **object** whose month is timezone-ambiguous is classified `EVIDENCE_CONFLICT` (never auto-proposed). `READY_FOR_R4C_DECISION=YES` means only that all 26 were fully diagnosed — it authorizes **no** execution. Test: `request-order-draft-v2-audit-all26-f1-7n-fa-3c-r4b2.test.js` (23 assertions; proves zero-mutation, all-26 coverage, verbatim ids, per-class classification). **R4C** (deferred, needs the USER year-only map + D1/D2 applied) will add the actual migration normalization + `PLANNING_CYCLE_FORMAT_OK`/`HEADER_STATUS_OK` validator gates.

## 22. R4B4 — live active-scope TOKEN diagnostic (2026-08-21, appendix)

**Purpose.** R4B3 could not close natural-scope equality because the 6 active rows' live scope tokens and today's AI-Plan query tokens were not in hand. The architect then froze the exact 6 post-normalization active source keys (below) and approved a read-only live-token diagnostic. R4B4 delivers that tool; it does **not** execute, stage, swap, or normalize anything.

**Frozen 6 active source keys (architect input, embedded verbatim in `TEMP_R4B4_ACTIVE_KEYS_`).** All `draft`, `draft_purpose=regular`. `planning_cycle` is the canonical `YYYY-MM` FIELD; the RD id (#6) is embedded **byte-for-byte** (its legacy cycle segment `Sat Aug 01 2026 … (台北標準時間)` and its `company|country|draft_purpose|marketplace|sku` scopeKey ordering are preserved and never re-minted):
1. `RAD-A92D17B1-8` · 2026-07 · ResUS/US/Amazon/CO1200-O
2. `RAD-3A0A8227-F` · 2026-07 · ResTW/CA/Amazon/CO1200-O
3. `RAD-06053044-1` · 2026-07 · KM/US/**KM Walmart**/CO1200-O
4. `RAD-72ABD506-3` · 2026-07 · ResUS/US/Amazon/CO5600-R
5. `RAD-17DC0322-0` · 2026-07 · ResUS/US/Amazon/CO5600-W
6. `RD::MONTHLY_ORDER::Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5120-R` · 2026-08 · ResUS/US/Amazon/SP5120-R

**Architect `draft_purpose` decision (FROZEN).** Legacy blank `draft_purpose → regular` APPROVED; KMPA `monthly` is off-path and must not affect this migration; any **nonblank unknown** `draft_purpose` → HALT; **no** general-purpose `monthly → regular` mapping is introduced.

**Two comparison semantics (evidence).** The live legacy readback (47_ `recGenEnumerateEligibleGapRows_`/`recGenActiveHeadersForSku_`) matches scope **case-insensitively** (`lc()`), whereas the flat-V2 active lookup `KMRDV2P.scopeMatches_` matches **exact trim-only, case-sensitive** (`str()`), with **no** marketplace normalizer. So a token that differs only by case (e.g. gap `amazon` vs migrated `Amazon`) is accepted by the legacy path but **rejected** by the V2 lookup — a real duplicate-active hazard the diagnostic must expose, never hide.

**R4B4 diagnostic (read-only, delivered).** `TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2()` (public, no-arg, Run-menu-visible; in `TEMP_migrate_request_order_draft_v2.gs`) reads ONLY `order_planning_gap` + `marketplace_skus` and writes NOTHING; if either tab is absent it reports `REQUIRED_TAB_ABSENT` and HALTs **without creating** it. For each of the 6 keys it: (1) finds every `order_planning_gap` candidate by company+country+sku (marketplace **not** filtered → all raw tokens exposed) and projects each into the current AI-Plan query scope (the pure `recGenBuildGapDraftBody_` when present & facts-ready, else the byte-equivalent scope shape of 47_:225-227); (2) finds every `marketplace_skus` candidate by country+sku, using the company+country+sku subset as the authoritative master-token identity; (3) simulates reuse with the **real** `KMRDV2P.loadActiveFlat`/`scopeMatches_`. Per-row output (`ACTIVE_SCOPE_ROW_01..06_OF_06`): `SOURCE_KEY`, `PROPOSED_MIGRATED_KEY`, all gap candidates (raw + trimmed tokens + `current_ai_query_key` + `scope_field_diff` + `reuse`), all master candidates, `distinct_master_marketplace_tokens`, `proposed_marketplace_mapping`, `verdict`, `reusable_by_active_lookup`, `reason`. Plus `ACTIVE_SCOPE_DIAG_SUMMARY`, `ACTIVE_SCOPE_TOKEN_MAP`, `ACTIVE_SCOPE_CONFLICTS`, `ACTIVE_SCOPE_CHECKSUM`.

**Verdict vocabulary (fail-closed).** `EXACT_MATCH` (unique exact `scopeMatches_` REUSE → reusable YES); `TOKEN_MAPPING_REQUIRED` (marketplace matches only case/format-insensitively → NO); `NO_LIVE_CANDIDATE` (no gap row, or no marketplace token match at all → NO); `AMBIGUOUS_CANDIDATE` (≥2 gap rows each REUSE → NO). A proposed one-time marketplace mapping is emitted **only** when `marketplace_skus` proves **exactly one** identity token that differs from the legacy token (e.g. `KM Walmart → Walmart`); it is a PROPOSAL for R4C review and is **never applied**. `READY_FOR_R4C_SCOPE_DECISION=YES` means only that all 6 were fully diagnosed — it authorizes **no** execution. Test: `request-order-draft-v2-active-scope-tokens-f1-7n-fa-3c-r4b4.test.js` (39 assertions; proves zero-mutation, legacy tabs never read/written, RD id byte-verbatim, raw tokens un-normalized, `KM Walmart`≠`Walmart`, ambiguity/absence fail closed, and exact-token equality as the only reuse gate). **R4C** (deferred) will apply the frozen `draft_purpose`/status/cycle normalization + add `DRAFT_PURPOSE_OK`/`CANONICAL_MARKETPLACE_OK`/`NATURAL_SCOPE_OK`/`ACTIVE_SCOPE_REUSABLE` validator gates, consuming this diagnostic's live token map.

## 23. R4B5 — production cycle-transport trace + active-scope diagnostic correction (2026-08-21, appendix)

**Why (R4B4 verdict revoked).** The R4B4 live log was structurally complete (6/6, 0 missing, both tabs present, 0 writes) but its SEMANTIC verdict was wrong: rows whose gap+master marketplace equalled the source (`marketplace_exact=true`) were reported `NO_LIVE_CANDIDATE` / "no marketplace token matches." Root cause: R4B4 conflated "the reuse simulation did not return REUSE" with "no marketplace match." The reuse actually failed on the **cycle**, not the marketplace — the frozen key said `2026-07` while the live gap `calculation_month` is a **Date** (Aug 1 Taipei), so `loadActiveFlat`'s `normalizePlanningCycleMonthly(query cycle)` threw and the row fell into the wrong `else` branch. R4B4 also called a SKU sold on two marketplaces "ambiguous," though marketplace is part of the natural key.

**Superseding architect decisions (FROZEN this appendix).** The prior one-time `2026-07` RAD mapping is **REVOKED** and removed from source/tests/docs. The frozen one-time historical migration cycle is now `planning_cycle = "2026-08"` for **all 25 RAD ids and the sole RD** (explicit historical mapping, not an inference algorithm). Other frozen mappings: blank `draft_purpose → regular`; `site_confirmed → draft`; `submitted/draft/partially_submitted/cancelled` verbatim; **exact legacy marketplace `KM Walmart → Walmart`** and `Amazon → Amazon` (these two ONLY — no global marketplace alias); ids byte-for-byte unchanged; `calculation_run_id` unchanged/nullable; any nonblank **unknown** `draft_purpose` HALTs.

**Objective 1 — production cycle path (traced with source-line evidence + a REAL-function test).** The live `order_planning_gap.calculation_month` for these SKUs is a Date object = `2026-08-01 00:00 Asia/Taipei` (`= 2026-07-31T16:00:00.000Z`). Boundary-by-boundary: (1) sheet read `gapReadObjects_` 43_:78 `getDataRange().getValues()` → **JS Date**; (2) object conversion 43_:82 + `gapReadScopeRows_` 43_:847 → verbatim, **still Date**; (3) `recGenBuildGapDraftBody_` 47_:225 `planningCycle: r4e2Str_(gapRow.calculation_month)`, and `r4e2Str_` 47_:174 `= String(v).trim()` → **`"Sat Aug 01 2026 00:00:00 GMT+0800 (…)"`**, a localized Date **string**, NOT `YYYY-MM`; (4) handler 47_:390 passes it verbatim; (5) `generateMonthlyFlat` KMRDV2P:228 `normalizePlanningCycleMonthly` → **THROWS `INVALID_PLANNING_CYCLE`**; (6–8) `projectFlatDraftRow`/`loadActiveFlat`/`scopeMatches_` never reached. The live RD id itself embeds `Sat Aug 01 2026 … (台北標準時間)` — direct proof this string flowed through unconverted. **Verdict: `RUNTIME_DATE_CYCLE_TRANSPORT_DEFECT`** — production does NOT canonicalize the Date; the correct project-tz calendar month is `2026-08` (a naive UTC slice would wrongly give `2026-07`). Proven by `request-order-draft-v2-production-cycle-path-f1-7n-fa-3c-r4b5.test.js` (11 assertions; vm-loads the REAL 47_ and drives `recGenBuildGapDraftBody_` + `r4e2Str_` + `KMRDV2.normalizePlanningCycleMonthly`).

**Minimum R4C runtime seam (documented — NOT changed this round).** Exactly ONE boundary: `recGenBuildGapDraftBody_` 47_:225. Replace `r4e2Str_(gapRow.calculation_month)` with a project-tz calendar-month normalization — a Date → `Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), 'yyyy-MM')`; a bare `YYYY-MM` string kept; an ISO/datetime string re-parsed in the project tz. It is the sole producer of `body.planningCycle` for the gap path, so fixing it makes projectFlatDraftRow/loadActiveFlat/scopeMatches all see canonical `2026-08`. `normalizePlanningCycleMonthly` stays strict (no locale parsing — by design).

**Objective 2/3 — corrected diagnostic.** Same public entrypoint `TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2()` (read-only). Candidate selection now matches company+country+sku+**canonical migrated marketplace** exactly (marketplace is part of the key), so other-marketplace rows for the same SKU are excluded (not ambiguous); only ≥2 rows matching the COMPLETE canonical scope are `MULTIPLE_EXACT_CANDIDATES`. Token-scope match, current-query eligibility (`calculation_status`), and would-be reuse are reported SEPARATELY, so a `BLOCKED` row still shows its correct future identity. Per-row: `RAW_GAP_CYCLE_VALUE`/`_TYPE`, `GAP_CYCLE_IN_PROJECT_TIMEZONE`, `ACTUAL_PRODUCTION_QUERY_CYCLE` (via the REAL `recGenBuildGapDraftBody_` when present), `EXPECTED_CANONICAL_CYCLE=2026-08`, `PRODUCTION_CYCLE_EQUAL`, `SOURCE_MARKETPLACE`/`MIGRATED_MARKETPLACE`, `EXACT_GAP_MARKETPLACE_CANDIDATES`, `EXACT_MASTER_MARKETPLACE_CANDIDATES`, `TOKEN_SCOPE_MATCH`, `CURRENT_QUERY_ELIGIBLE`, `ACTIVE_LOOKUP_REUSABLE_IF_QUERIED`, `CYCLE_TRANSPORT_DEFECT`, `MULTIPLE_EXACT_CANDIDATES`, `mismatch_fields`, `classification`, `reason`. Summary distinguishes `EXACT_SCOPE_MATCH` / `BLOCKED_BUT_SCOPE_MATCH` / `CYCLE_TRANSPORT_DEFECT` / `TOKEN_MAPPING_APPLIED` / `NO_EXACT_CANDIDATE` / `MULTIPLE_EXACT_CANDIDATES` / `NON_REUSABLE_ROWS` / `READY_FOR_R4C_SCOPE_DECISION`. Test: `request-order-draft-v2-active-scope-tokens-f1-7n-fa-3c-r4b4.test.js` (36 assertions; false `NO_LIVE_CANDIDATE` eliminated, Amazon-selects-Amazon-despite-Walmart, Walmart-selects-Walmart-despite-Shopify, multi-marketplace≠ambiguous, ambiguity needs ≥2 full-scope, BLOCKED≠mismatch, Date-Aug1-Taipei→2026-08-not-July, RD id byte-verbatim, zero writes).

**R4C mapping contract (frozen) + validator gates R4C must add.** Mapping: 26 ids → `planning_cycle="2026-08"` (explicit historical map); `site_confirmed→draft`; blank `draft_purpose→regular`; `KM Walmart→Walmart`, `Amazon→Amazon`; ids + `calculation_run_id` untouched. Validator gates: `PLANNING_CYCLE_FORMAT_OK`, `HEADER_STATUS_OK`, `DRAFT_PURPOSE_OK`, `CANONICAL_MARKETPLACE_OK`, `NATURAL_SCOPE_OK`, `ACTIVE_SCOPE_REUSABLE`, `ID_PRESERVATION_OK` (plus the existing `SUBMITTED_SET_OK`/`TIER_VALUES_OK`) — and the runtime transport seam (47_:225) so future AI-Plan queries emit `2026-08`. **Outcome A:** the six canonical scopes each resolve to exactly one intended marketplace identity (frozen map + full-key selection), and the single precise R4C transport-normalization fix is identified → **USER MAY PROCEED TO R4C**; still **NOT** authorized to execute migration / swap tabs / delete draft lines.

## 24. R4C — canonical contract, runtime cycle fix, migration normalization, validator closure (2026-08-21)

**Objective.** Make the flat 53-column V2 model the canonical future contract and transform the known legacy cohort into it without losing ids, submitted decisions, tier quantities, or rollback ability. Legacy formats are migration INPUT, not future schema authority. Implementation only — no live mutation, no execute, no staging, no flag flip (`REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_` stays `false`), no push.

**A — runtime cycle-transport fix (permanent).** New fail-closed helper `recGenProjectCalendarMonth_(value, tz)` + `recGenProjectTz_()`/`recGenIsDate_()` in `47_api_v1_recommendation_generation.gs`, wired into `recGenBuildGapDraftBody_` (the single R4B5 seam, 47_:225). A Date `calculation_month` is formatted with `Utilities.formatDate(date, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM')` → Aug 1 Asia/Taipei = **2026-08**, never the UTC-July slice; a bare `YYYY-MM` string is kept; an explicit-timezone ISO/datetime string (carries `Z`/`±HH:MM`) is deterministically re-parsed into the project tz; blank/year-only/slash/tz-less/ambiguous → HALT with a distinct token (`PLANNING_CYCLE_REQUIRED` / `PLANNING_CYCLE_INVALID` / `PLANNING_CYCLE_TIMEZONE_REQUIRED` / `PLANNING_CYCLE_PROJECT_TZ_NORMALIZATION_FAILED`). No clock, no default, no UTC slicing. The strict downstream `KMRDV2.normalizePlanningCycleMonthly` is UNCHANGED (still rejects a raw Date string) — the fix only produces a value it will accept.

**B — migration normalization authority.** `KMRDV2.migrateLegacyToCanonical(header, lines, {cycle})` (pure; flattenLegacy + frozen maps; inputs never mutated) applies: `planning_cycle ←` the explicit authorized `YYYY-MM`; status via `MIGRATION_STATUS_MAP` (`site_confirmed→draft`; `draft/partially_submitted/submitted/cancelled` verbatim; else `MIGRATION_STATUS_UNSUPPORTED`); `draft_purpose` blank→`regular`, `regular`→`regular`, else `MIGRATION_DRAFT_PURPOSE_UNSUPPORTED` (KMPA `monthly` stays off-path — no global remap); marketplace via `MIGRATION_MARKETPLACE_MAP` (`Amazon→Amazon`, `Shopify→Shopify`, `KM Walmart→Walmart`, `Walmart→Walmart`; else `MIGRATION_MARKETPLACE_UNSUPPORTED`). IDs + `calculation_run_id` + tiers preserved byte-for-byte. `KMRDV2P.planMigration` now takes an **explicit per-ID authority map** `authorizedCycleById` (id → `YYYY-MM`): it enforces the authorized id-set EXACTLY equals the actionable id-set (`MIGRATION_AUTHORIZED_ID_SET_MISMATCH` on any missing/extra id — NO prefix logic), normalizes each row via the transform (propagating its halt tokens), and reports `NORMALIZATION_COUNTS` + `NORMALIZED_DISTRIBUTIONS`. Without an authority map it keeps the pre-R4C verbatim selection (used only by the read-only ALL-26 diagnostic). The known shape is unchanged (124 headers / 65 lines / 26 actionable / 98 dropped / 20 submitted src+migrated / 53 target headers / 26 rows / 26 preserved / 0 converted).

**Frozen per-ID authority (`TEMP_R4C_AUTHORIZED_CYCLE_BY_ID_`).** Seeded with the 6 architect-confirmed ids (5 active RAD + the sole RD) → `2026-08`. **The remaining 20 SUBMITTED RAD ids from the R4B2 log must be pasted here (each → `2026-08`) before a LIVE dry-run/execute can pass** — until then the public no-arg wrappers fail-close on the 20 unknown actionable ids (proven by the R4A test). This is a DATA input, not an authority decision; the whole cohort maps to `2026-08` (the frozen historical migration cycle).

**C — validator closure.** `KMRDV2P.validateStaging` now returns 14 gates: `SCHEMA_OK`, `ROW_COUNT_OK`, `PLANNING_CYCLE_FORMAT_OK`, `PLANNING_CYCLE_AUTHORITY_OK` (a format-valid `2026-07` still FAILS authority when the map says `2026-08`), `HEADER_STATUS_OK` (four-value vocab; `site_confirmed` fails), `DRAFT_PURPOSE_OK` (this cohort exactly `regular`), `CANONICAL_MARKETPLACE_OK` (no `KM Walmart` survives; each equals the migration-map image of its source token), `ID_PRESERVATION_OK`, `ID_SET_OK`, `SUBMITTED_SET_OK` (each source submitted id present AS submitted), `TIER_VALUES_OK` (order/recommended/month per bucket), `NATURAL_SCOPE_OK` (no duplicate COMPLETE active key — different marketplace for the same SKU is NOT a duplicate), `ACTIVE_SCOPE_REUSABLE` (every active row's full natural key ∈ the frozen R4B5 identities; a BLOCKED gap does not invalidate a future identity — the validator never reads the gap), `OLD_LINE_TABLE_UNTOUCHED` (execute-phase legacy-line write count = 0). `READY_FOR_SWAP=YES` only when all 14 are true. The validator is read-only and never mutates inputs.

**D — dry-run report closure.** The read-only dry-run now reports source/line/actionable/drop counts, target rows/headers, submitted src/migrated, id preservation/converted, the normalization counts, the exact normalized cycle/status/purpose/marketplace distributions, a full 14-gate precheck, the six canonical active identities, and a zero-write confirmation. Public entrypoints unchanged: `TEMP_R4_DRY_RUN_RequestOrderDraftV2`, `TEMP_R4_EXECUTE_RequestOrderDraftV2`, `TEMP_R4_VALIDATE_RequestOrderDraftV2Staging` (the read-only diagnostics `TEMP_R4_AUDIT_ALL_26_...` and `TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_...` are retained).

**E — bundle.** `KMRDV2` (`kmrdv2-fa3c-r4c-1`) + `KMRDV2P` (`kmrdv2p-fa3c-r4c-1`) regenerated into `90_generated_supply_planning_bundle.gs` (52 modules, reproducible; `--check` gate passes). 47_ and the TEMP helper are standalone `.gs` (not bundled). Cutover flag stays `false`; nothing synced or deployed this round.

**Permanent Apps Script sync set (USER-owned, when releasing):** `47_api_v1_recommendation_generation.gs` (runtime cycle fix) + `90_generated_supply_planning_bundle.gs` (KMRDV2/KMRDV2P R4C). The paste-ready `TEMP_migrate_request_order_draft_v2.gs` is synced only for the one-time migration run. `00_config.gs` unchanged (flag stays false); no frontend change. Tests: R4 35 / R4A 50 / R4B2 23 / R4B4 36 / R4B5-runtime 19 / R4C-migration+validator 53 / bundle 68; full sweep 294 pass / 4 pre-existing baseline / 0 new.

## 25. R4C1 — complete 26-ID authority, full-cohort fidelity, release-order correction (2026-08-22)

**Complete 26-ID authority.** `TEMP_R4C_AUTHORIZED_CYCLE_BY_ID_` now holds the exact **26** actionable ids — 5 active RAD + the sole RD (byte-verbatim) + the **20 submitted RAD ids from the R4B2 log** — each → `2026-08`. The USER hand-edit placeholder (`<<< USER: paste … >>>`) is removed; the map is package-complete (no runtime completion, no manual edit). No prefix matching, no generic RAD rule.

**Full-cohort fidelity (frozen expected — do not change to make a test pass).** The complete live 26-row actionable cohort migrates to exactly: cycle `{2026-08: 26}`; status `{submitted: 20, draft: 6}` (site_confirmed: 0); draft_purpose `{regular: 26}` (blank: 0, monthly: 0); marketplace `{Amazon: 18, Shopify: 3, Walmart: 5}` (KM Walmart: 0). Normalization counts: cycle 26 · site_confirmed→draft 5 · blank→regular 25 · KM Walmart→Walmart 5 · ID converted 0 · ID preserved 26 · submitted source/migrated 20/20 · target 53 headers / 26 rows. Source: 124 headers / 65 lines / 26 actionable / 98 dropped. Proven in `request-order-draft-v2-authority-full-cohort-f1-7n-fa-3c-r4c1.test.js` (33 assertions), including authority mutation halts (delete/add/prefix-equivalent → `MIGRATION_AUTHORIZED_ID_SET_MISMATCH`; a `2026-07` staging cycle is format-valid but fails `PLANNING_CYCLE_AUTHORITY_OK`), and a package-complete public Dry Run (no manual source edit) with all 14 gates and zero writes.

**47_ flag-false reachability audit.** The R4C runtime seam lives in `recGenBuildGapDraftBody_`, called at 47_:380 (`recGenGenerateOneSkuCompact_`, used by the 48_ scope job) and 47_:419 (`handleGenerateRequestOrderDraftFromGap_`, reachable via 01_router:472). These are the **live, non-flag-gated** gap-backed generation path (the cutover flag at 47_:446 gates only the flat *readback*). So syncing the new 47_ while `flag=false` **WOULD** change reachable legacy behavior: a Date `calculation_month` now yields canonical `2026-08` (previously a raw localized Date string — the origin of the RD id's Date text), and a blank/invalid cycle now fails closed instead of building a blank-cycle draft. Both are correctness improvements, but they are reachable behavior changes. → **`SYNC_47_ONLY_DURING_CONTROLLED_CUTOVER`.** Regardless of harm assessment, 47_ is kept OUT of the pre-Dry-Run minimum sync because the read-only migration planner/validator do not require it.

**Release order (corrected).**
- **A — PRE-DRY-RUN minimum sync (USER):** `90_generated_supply_planning_bundle.gs` (KMRDV2/KMRDV2P R4C) + the completed `TEMP_migrate_request_order_draft_v2.gs`. That is ALL the read-only Dry Run + staging validator need. **47_ is NOT synced here.**
- **B — MIGRATION EXECUTE:** not authorized this round.
- **C — POST-STAGING-VALIDATION / CONTROLLED CUTOVER — cumulative permanent Apps Script manifest** (reconciled against the frozen R4 manifest 00/15/24/25/47/48/90):
  - `00_config.gs` — CHANGED (V2 cutover flag + helper); flag stays `false` in source.
  - `15_request_allocation_handlers.gs` — CHANGED (cutover-gated flat submit branch).
  - `24_recommendation_orchestrator.gs` — CHANGED (cutover-gated flat dispatch + rpoFlat* helpers).
  - `25_recommendation_user_edit.gs` — CHANGED (cutover-gated flat token/edit branches).
  - `47_api_v1_recommendation_generation.gs` — CHANGED (cutover-gated flat readback + the R4C runtime cycle seam); `SYNC_47_ONLY_DURING_CONTROLLED_CUTOVER`.
  - `48_api_v1_request_order_draft_job.gs` — **UNCHANGED by V2** (0 flag/KMRDV2/seam references); it is only the runtime CONSUMER of 47_'s gap generation. No new V2 content to sync; required in the manifest solely as the already-deployed caller — USER confirms its deployed copy is current.
  - `90_generated_supply_planning_bundle.gs` — CHANGED (KMRDV2 `kmrdv2-fa3c-r4c-1` + KMRDV2P `kmrdv2p-fa3c-r4c-1`).
  The cutover flag flips to `true` only in the deployed project during controlled cutover — never in repository source.
- **D — FRONTEND cutover (cumulative, not now):** `assets/js/pages/request-order.js` (flat DTO consumption / Send explosion — R2b-3) + `assets/css/pages/request-order.css`. R4C1 itself made no frontend change, but the overall R4 release still requires these; do NOT report "none". No frontend deploys this round.

Cutover flag stays `false`; bundle unchanged this round (`c0240a59…`, 52 modules); no core/runtime edit in R4C1 (only the TEMP authority + tests + this doc). Tests: R4 35 / R4A 50 / R4B2 23 / R4B4 36 / R4B5-runtime 19 / R4C 53 / R4C1 33 / bundle 68; full sweep 295 pass / 4 pre-existing baseline / 0 new.

## 26. R4C2 — staging write TYPE preservation + post-write roundtrip (2026-08-22)

**Root cause of the READY_FOR_SWAP=NO after the first live Execute.** The migration planner produces the primitive string `"2026-08"` for `planning_cycle`; Execute wrote it via `Range.setValues` into a **General/automatic** number-format column; Google Sheets **coerced** `"2026-08"` into a **Date** value. The validator reads back through `getValues()`, receives a Date object, and its strict string checks fail: `PLANNING_CYCLE_FORMAT_OK=false` (`CANONICAL_CYCLE_RE.test(String(Date))` is false) and `PLANNING_CYCLE_AUTHORITY_OK=false` (Date ≠ `"2026-08"`). `ACTIVE_SCOPE_REUSABLE=false` is a **consequence** (the active natural key includes `planning_cycle`, so the coerced Date no longer matches the frozen `2026-08` identity), not a separate scope defect. Every other gate stayed true — incl. `TIER_VALUES_OK`, because the tier-month cells coerce identically on **both** the staging and the legacy source read, so they still compare equal. The correct persisted value remains the exact string `"2026-08"`; the validator is NOT weakened and Date objects are NOT accepted into the V2 contract. A coercion-modeling test reproduces both branches: a General-format cell turns `"2026-08"` into a Date; a plain-text (`@`) cell preserves the primitive string.

**Fix (Objective 2 — write tooling only, `TEMP_migrate_request_order_draft_v2.gs`).** In Execute, after the staging tab is created/verified-empty and BEFORE the single `setValues`: locate `planning_cycle` and `request_allocation_draft_id` columns by header name (HALT `STAGING_PLANNING_CYCLE_COLUMN_MISSING` / `STAGING_ID_COLUMN_MISSING` if absent — defensive; the headers derive from `KMRDV2.V2_HEADERS` which always contains both), then `setNumberFormat('@')` on exactly those two columns' **data ranges** (`row 2 … 2+nRows`), and only those. Numeric quantity/carton/version columns and tier-month columns are **not** text-formatted (they keep their natural type; tier months coerce identically on both sides so `TIER_VALUES_OK` is unaffected). No apostrophe prefixing. Then the single matrix `setValues`. Formatting targets only `request_order_allocation_drafts_v2`; legacy tabs receive zero formatting and zero data writes.

**Post-write roundtrip (Objective 3).** After `setValues`: `SpreadsheetApp.flush()`, read the staging rows back through the `getValues()`-based reader, and verify every `planning_cycle` is a **string** equal to `2026-08` and every `request_allocation_draft_id` is a **string** byte-verbatim from source, then run the full 14-gate validator on the read-back rows. Execute reports `POST_WRITE_FLUSHED`, `POST_WRITE_ROWS`, `POST_WRITE_CYCLE_TYPES`, `POST_WRITE_CYCLE_DISTRIBUTION`, `POST_WRITE_NON_STRING_CYCLE_IDS`, `POST_WRITE_ID_TYPES`, `POST_WRITE_ID_SET_OK`, `POST_WRITE_VALIDATOR`, `POST_WRITE_READY_FOR_SWAP`. Any roundtrip failure → `ok:false`, HALT `STAGING_POST_WRITE_ROUNDTRIP_FAILED`, offenders listed (id, raw value, type), and **no** auto rename/delete/clear/retry, **no** flag flip, **no** swap. A clean Execute reports 53 headers / 26 rows / all-string cycles / `{2026-08:26}` / all-string ids / 14 gates true / `POST_WRITE_READY_FOR_SWAP=YES` — which still does **not** authorize a tab swap.

**Validator diagnostic (Objective 4).** The paste-ready validator wrapper now, when a cycle gate fails, logs `CYCLE_GATE_DIAGNOSTIC` per offending row: id, raw value, JS type, `is_date`, ISO (when Date), `format_valid`, `authority_valid`. The gates stay strict; the validator diagnoses persisted data and never converts/repairs it.

**Write-boundary contract.** Execute may only: create the staging tab if absent, set plain-text format on the staging ID/cycle data ranges, and perform one matrix `setValues` to staging. Forbidden: any source-header write, any Draft-Line write, any other-tab formatting, auto rename/delete/swap, flag change, deployment. Tests prove `setNumberFormat` is called exactly twice and only on staging; legacy header/line writes and formats are zero.

**Retry policy (fail-closed retained).** The corrected helper still HALTs `STAGING_TAB_NOT_EMPTY` on the existing non-empty (failed) staging tab and performs no format/write. The failed tab is retained for evidence. **USER-owned retry runbook (after R4C2 acceptance):** (1) sync the completed `TEMP_migrate_request_order_draft_v2.gs` (and, already-synced from R4C1, `90_`); (2) in the spreadsheet, manually **rename** the failed tab to an evidence name, e.g. `request_order_allocation_drafts_v2_failed_20260822_083419` (the helper never renames); (3) run `TEMP_R4_EXECUTE_RequestOrderDraftV2` to create a fresh canonical staging tab; (4) confirm the Execute log shows all-string cycles, `{2026-08:26}`, 14 gates true, `POST_WRITE_READY_FOR_SWAP=YES`; (5) optionally re-run `TEMP_R4_VALIDATE_RequestOrderDraftV2Staging`. This does NOT authorize a tab swap. No permanent runtime (`47_`) is required for the retry — only `90_` + the completed TEMP helper (per §25 `SYNC_47_ONLY_DURING_CONTROLLED_CUTOVER`).

No permanent KMRDV2/KMRDV2P/90_ change and no 47_ change this round (no core defect). Bundle unchanged (`c0240a59…`, 52 modules). Cutover flag stays `false`. Tests: R4 35 / R4A 56 / R4B2 23 / R4B4 36 / R4B5-runtime 19 / R4C 53 / R4C1 33 / R4C2 34 / bundle 68; full sweep 296 pass / 4 pre-existing baseline / 0 new.

## 27. R4D — production cutover final preflight + FROZEN runbook (2026-08-22, read-only)

Read-only preflight; no live/source mutation. Freezes the USER-owned cutover, rollback, and acceptance sequence. **Verdict: `R4D_CUTOVER_PREFLIGHT_READY = YES`.**

### 27.1 Git / release integrity
`HEAD = origin/main = c6221e4563b245263887ce850a40522aee242c9d` (0 ahead / 0 behind, working tree clean; USER pushed R4C2). R4C2 commit present. Bundle reproducible (`--check` = `c0240a59612dcc199686312febbf9db77862b5f05db59596102b0e2f9a8be318`, 52 modules). Repository `00_config.gs` flag `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = false`. Authority map = exactly 26 ids, all `2026-08`; no `<<<` / "USER: paste" placeholder. TEMP helper is tracked source but NOT in the bundle `MODULE_ORDER` (paste-run-remove tooling, not permanent runtime). Full sweep 296 pass / 4 pre-existing baseline (`gap-job-done-notice`, `order-planning-monthly-projection-consumer`, `replen-header-toggle`, `supply-planning-route-inventory`) / 0 new. Focused: R4 35 · R4A 56 · R4B2 23 · R4B4 36 · R4B5-runtime 19 · R4C 53 · R4C1 33 · R4C2 34 · bundle 68.

### 27.2 FROZEN permanent backend manifest — sync ALL SEVEN from the ONE accepted commit `c6221e4` (git blob ids)
1. `00_config.gs` — `415a2554e5d326f4d2c2f5d6a6bfe80e28dfc92d` (flag stays `false` in source; flipped live only in step C11 AFTER the DB swap)
2. `15_request_allocation_handlers.gs` — `0279fdcb7e4484618e9f29771a8fba16c8092ac5`
3. `24_recommendation_orchestrator.gs` — `e0602f217a0e238f0cf20b950dd9750de99d5978`
4. `25_recommendation_user_edit.gs` — `af6327a9a13b874eb1d901443250a91871acb03e`
5. `47_api_v1_recommendation_generation.gs` — `0267791895ae9dd48b04ec1712255f7999aba60e` (**cutover-only**: its project-tz cycle seam is reachable on the live non-flag-gated gap path — `SYNC_47_ONLY_DURING_CONTROLLED_CUTOVER`)
6. `48_api_v1_request_order_draft_job.gs` — `17e14bc7938e5c978ed1c90f181da0c71383459e` (**remains in the list; do NOT assume the deployed copy is current — sync it**)
7. `90_generated_supply_planning_bundle.gs` — `73254043997cda05871820d5652bde2adbee5384`

The **TEMP** helper (`TEMP_migrate_request_order_draft_v2.gs`) is paste-run-remove migration tooling — it is NOT part of the permanent runtime and must not be left deployed. All seven bind to commit `c6221e4`; if any live file diverges from these blob ids, re-sync from `c6221e4`.

### 27.3 FROZEN frontend manifest (deploy in step D; not now)
- `assets/js/pages/request-order.js` — flat V2 DTO consumption / per-tier edit-submit / Send explosion (R2b-3)
- `assets/css/pages/request-order.css`

No other frontend file is required for the flat V2 cutover (the flat-path frontend changes are confined to these two; the shared page shell/router is already deployed). If a review finds a third dependency, HALT and add it before deploy.

### 27.4 Live tab inventory + collision-safe names
Present: `request_order_allocation_drafts` (legacy canonical, 124), `request_order_allocation_drafts_v2` (staging, 53h/26r), `request_order_allocation_draft_lines` (history, 65 — NEVER touched), `request_order_allocation_drafts_v2_failed_20260822_083419` (retained evidence), plus possible earlier backups. **Collision-safe legacy backup name:** `request_order_allocation_drafts_legacy_pre_v2_20260822_0851`. USER MUST confirm this exact name does not already exist; if it does → HALT and pick a unique `_rN` suffix before any rename. **Atomic rename order:** (1) `request_order_allocation_drafts` → `request_order_allocation_drafts_legacy_pre_v2_20260822_0851`; (2) `request_order_allocation_drafts_v2` → `request_order_allocation_drafts`. NEVER rename/delete `request_order_allocation_draft_lines`, the failed staging evidence, or other backups. No helper performs these renames.

### 27.5 Maintenance-freeze checklist (before rename)
- Stop all Request Order / Recommendation / AI Plan user actions.
- Identify + pause every time-driven trigger that can generate/edit/submit/dispatch Request Order drafts (record each trigger name + prior enabled state for restore): the gap-materialization scheduler (44_) and the request-order-draft / weekly-recommendation job schedulers (48_/49_) and any recommendation-generation trigger. Confirm none fire during the window.
- Block API/job calls for the window.
- Capture a FULL Spreadsheet backup (file-level copy).
- Re-run `TEMP_R4_VALIDATE_RequestOrderDraftV2Staging` immediately before rename → require all 14 gates true + `READY_FOR_SWAP=YES`.
- Record: legacy header count = 124; legacy line count = 65; staging rows = 26 / headers = 53; flag = false.
- If any user/job/trigger activity or source drift occurs after validation → HALT, do NOT rename.

### 27.6 Final validator checkpoint (accepted evidence, re-confirmed live in 27.7-A5)
Staging: 53 headers / 26 rows; cycle types string=26; id types string=26; cycle `{2026-08:26}`; status `{submitted:20,draft:6}`; purpose `{regular:26}`; marketplace `{Amazon:18,Shopify:3,Walmart:5}`; all 14 gates true; `POST_WRITE_READY_FOR_SWAP=YES`; independent `READY_FOR_SWAP=YES`; legacy header + Draft Lines untouched; flag false.

### 27.7 FROZEN controlled-cutover runbook (USER-owned; Claude runs none of it)
**A. Maintenance freeze** — A1 stop users/jobs/triggers; A2 full Spreadsheet backup; A3 confirm unique backup tab names (27.4); A4 run `TEMP_R4_VALIDATE_RequestOrderDraftV2Staging`; A5 require all 14 gates true + `READY_FOR_SWAP=YES`.
**B. DB swap** — B6 rename legacy canonical → `request_order_allocation_drafts_legacy_pre_v2_20260822_0851`; B7 rename `request_order_allocation_drafts_v2` → `request_order_allocation_drafts`; B8 confirm canonical = 53h/26r, legacy backup still 124, Draft Lines still 65, failed-staging evidence still present, flag still false.
**C. Permanent Apps Script sync** — C9 sync all SEVEN `.gs` (27.2) from commit `c6221e4`; C10 verify NO TEMP helper deployed as permanent runtime; C11 in the bound live `00_config.gs` change ONLY `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = true`; C12 save; C13 create a new Apps Script deployment version; C14 record the `/exec` URL + deployment id.
**D. Frontend** — D15 deploy `request-order.js` + `request-order.css`; D16 await cache propagation; D17 hard refresh + verify asset version.
**E. Smoke** — E18 run the 27.8 R5 smoke matrix; E19 restore paused triggers/users ONLY after every smoke test passes.

Ordering invariant: never leave a window where jobs/triggers run against the swapped DB with the old runtime, or the old DB with flag=true. (The flag flips at C11 only after the B swap and immediately before the C13 deployment version, so the new runtime + flag + swapped DB go live together.)

### 27.8 FROZEN R5 smoke matrix (record per test: input scope · before counts · action · API response · after counts · expected · actual · PASS/FAIL · cleanup/rollback impact)
1 non-actionable gap → no draft. 2 actionable gap → exactly one flat row (create/reuse). 3 no new Draft-Line row. 4 deterministic id + bare `YYYY-MM` cycle. 5 correct T1/T2/T3 recommended qty. 6 edit one tier w/o changing recommended or created_at. 7 updated_at advances on edit. 8 carton qty + note persist after refresh. 9 partial submit → `partially_submitted`. 10 full submit → `submitted` (zero-qty tiers ignored). 11 Send → correct order + order lines + line sources. 12 re-Send idempotent. 13 refresh/recalc does not overwrite user-edited approved qty. 14 calc-run journal remains linked where applicable. 15 the 20 submitted historical records remain readable. 16 all six migrated active identities reused, no duplicates. 17 Draft-Line count remains exactly 65. 18 API/UI refresh returns the Flat V2 DTO. 19 no legacy fallback/write while flag=true. 20 frontend: no console/network error. **Any failure → immediate HALT + rollback evaluation.**

### 27.9 FROZEN rollback runbook (no tab overwrite at any step)
R1 pause users/jobs/triggers; R2 set live flag=false; R3 restore the previous Apps Script deployment version; R4 restore previous frontend assets/version; R5 rename the failed/new V2 canonical → unique `request_order_allocation_drafts_v2_failed_cutover_20260822` (confirm not existing; else `_rN`); R6 rename the legacy backup back → `request_order_allocation_drafts`; R7 confirm Draft Lines unchanged (65); R8 validate the legacy path; R9 restore triggers only after validation; R10 retain failed V2 data for diagnosis — never auto-delete.

### 27.10 R6 acceptance requirements
Stabilization window with the flag live: monitor for legacy fallback/writes (must be zero), duplicate-active drafts (zero), cycle/type regressions; confirm at least one real end-to-end AI Plan → Edit → Submit → Send lifecycle; keep the rollback window open until R6 is explicitly closed.

### 27.11 R7 archive/delete prerequisites (NOT in R4/R5/R6; no auto-deletion ever)
All must hold: R5 smoke all PASS; R6 closed; ≥1 real full lifecycle PASS; zero new Draft-Line writes; a repo/runtime/API/UI/trigger scan showing zero legacy dependency; rollback window explicitly closed; an immutable external backup/export completed; explicit USER final deletion approval. Prefer archive/export before any physical deletion. Legacy header backup + Draft Lines + failed staging evidence are all retained through R6.

### 27.12 Remaining risks
- **Manual rename fat-finger / name collision** — mitigated by 27.4 pre-check + exact atomic order; HALT on collision.
- **Trigger fires mid-window** — mitigated by 27.5 pause + record/restore; HALT on any activity after validation.
- **Partial sync (e.g. 48_ or 47_ skipped)** — mitigated by the 7-file blob binding to `c6221e4`; verify each live blob matches.
- **Flag flipped before swap / wrong order** — mitigated by the 27.7 ordering invariant (flag at C11 only, post-swap, pre-deployment-version).
- **Frontend cache serving old asset** — mitigated by D16/D17 propagation + version verify.
- **Sheets re-coercion on a future manual staging edit** — the R4C2 text-format persists on the tab; avoid manual General-format edits to `planning_cycle`.

### 27.13 Verdict
`R4D_CUTOVER_PREFLIGHT_READY = YES`. No production mutation performed. All actions above are USER-owned; Claude executes none of them.

## 28. R5A-P0 — live AI Plan planning-cycle boundary failure (2026-08-22, hotfix)

**Live symptom (post-cutover, flag=true).** AI Plan → Processed 99 / Not ready 99 / Created 0, reason `PLANNING_CYCLE_INVALID: 99`; network response `{success:false, error:"INVALID_PLANNING_CYCLE", message:"Flat V2 readback requires planningCycle=YYYY-MM"}`. Failure occurred BEFORE any Draft/Draft-Line write (canonical V2 = 26 rows, Draft Lines = 65, legacy backup unchanged, flag=true).

**Verdict: CODE SEAM DEFECT (Outcome B), TWO owning boundaries — not merely a deployment mismatch.** (A deployment-mismatch signature also exists — the live message "**F**lat V2 readback…" vs the repo's lowercase "**f**lat…" — but even with correct R4C 47_ deployed, the repo still reproduces both failures below.)

**Boundary 1 — batch cycle transport (`48_api_v1_request_order_draft_job.gs`, `enumerateEligible`, was 48_:310).** `order_planning_gap.calculation_month` is an Apps Script **Date object**. The batch job set `planningCycle = r4e2Str_(eligible[0].row.calculation_month)` = a **localized Date string** ("Sat Aug 01 2026 …"), stored in job state and threaded per-SKU into `generateOneSku` `opts.planningCycle` (48_:232). At `recGenBuildGapDraftBody_` (47_:252) **`opts.planningCycle` takes precedence** over `gapRow.calculation_month`, so the R4C project-tz seam received the Date *string* (not a Date object); `recGenProjectCalendarMonth_` correctly rejects a localized Date string → `PLANNING_CYCLE_INVALID` for every SKU → "99 not ready / 0 created". This defeats the R4C fix (which only normalizes when `opts.planningCycle` is empty). **Fix:** `enumerateEligible` now normalizes the gap Date via the SAME seam `recGenProjectCalendarMonth_(calculation_month, recGenProjectTz_())` → canonical `2026-08` (or `''` → per-SKU fallback to each gap row's own Date via the R4C seam). Never `r4e2Str_` a Date into a cycle.

**Boundary 2 — flat readback (`recGenFlatReadback_` 47_ + `KMRDV2P.readActiveFlatForScope`/`scopeMatches_`).** The frontend AI Plan runs the scope job then calls `getActive` with **scope only — no planningCycle** (request-order.js `_roRunAiPlanJob_(scope)` / scope-only readback). The legacy line-join readback filtered by cycle only when present (`if (planningCycle && …)` 47_:316) — it tolerated a blank cycle. The flat readback instead called `KMRDV2.normalizePlanningCycleMonthly(planningCycle)` unconditionally → threw on the blank cycle → `INVALID_PLANNING_CYCLE` for every scope, independent of Boundary 1. **Fix:** a BLANK cycle is now a scope-level readback (no cycle filter, parity with legacy); a NON-blank malformed cycle is still rejected. In `KMRDV2P`, `readActiveFlatForScope` normalizes strictly only for a non-blank cycle, and `scopeMatches_` compares `planning_cycle` only when a non-blank cycle is supplied. The WRITE path (`loadActiveFlat` / generation) always supplies a normalized non-blank cycle, so its exact-match, six-active reuse, and duplicate→`BLOCKED_CONFLICT` behavior are unchanged — persistence strictness is NOT loosened.

**Batch behavior (frozen).** A missing global readback cycle no longer classifies all valid rows invalid; per-SKU generation normalizes each gap row's own Date; a genuinely invalid non-blank cycle still fails closed; no partial hidden write precedes the readback; idempotent retry reuses the six active identities without duplicates (`BLOCKED_CONFLICT` on a true duplicate). No formula/quantity/tier/schema change; no legacy fallback.

**Files changed.** `48_` (Boundary 1), `47_` (Boundary 2 readback), `assets/js/core/supply-planning-request-draft-v2-persistence.js` (Boundary 2 read-path tolerance; VERSION `kmrdv2p-fa3c-r5a-1`), regenerated `90_generated_supply_planning_bundle.gs` (`bundle_sha256=6c47f4358e264b8bf0e04d4f578de23eebd55ed8c13c712774c909c37b0bc4e5`, 52 modules), bundle test (version pin), new `request-order-ai-plan-cycle-boundary-f1-7n-fa-3c-r5a.test.js` (26 assertions: live repro + both fixes + write-path strictness + no Draft-Line dependency). 47_ generation `recGenBuildGapDraftBody_` unchanged (already R4C-correct). Cutover flag stays `false` in source. Full sweep 297 pass / 4 pre-existing baseline / 0 new.

**Resync manifest correction.** The §27 seven-file manifest must now bind to the NEW R5A commit (the R5A hash below), NOT `c6221e4` — `47_`, `48_`, and `90_` changed. Re-sync all seven permanent files from the ONE R5A commit so no mixed-version state persists (`00`, `15`, `24`, `25`, `47`, `48`, `90`). The frontend needs NO change for this hotfix (the frontend's scope-only readback is now correctly handled server-side). `TEMP` helper remains paste-run-remove tooling, not permanent runtime.

**Controlled one-scope retry (USER-owned; triggers stay paused).** 1 keep users/jobs/triggers paused; 2 record canonical V2 row count before (=26); 3 record Draft-Line count before (=65); 4 run AI Plan for ONE known actionable scope only (e.g. `ResUS/US/Amazon`); 5 require `Created=1` OR `Reused=1` per the existing identity (the six migrated active scopes REUSE); 6 require Draft-Line delta = 0; 7 require the persisted `planning_cycle = 2026-08` (string); 8 require no duplicate active natural key; 9 record counts after; 10 only then authorize the full 99-row batch retry. Rollback trigger: any `PLANNING_CYCLE_INVALID`, any Draft-Line write, any duplicate active scope, or a non-`2026-08` persisted cycle → HALT and follow §27.9 rollback. Retry is authorized ONLY after this hotfix is synced+deployed (all seven files + a new Apps Script deployment version); until then `USER MAY_RETRY_AI_PLAN = NO`.

## 29. R5B-P0 — flat V2 table loading + header-authority closure (2026-08-22, hotfix)

**Live symptom (post-cutover, flag=true, R5A synced).** AI Plan → Processed 99 / Created 0 / **Failed 99**, reason `PRODUCTION_SAFETY:HEADER_MISSING [request_order_allocation_drafts]`; readback `{success:false, error:"READBACK_ERROR", message:"PRODUCTION_SAFETY:HEADER_MISSING [request_order_allocation_drafts]"}`. The R5A planning-cycle fixes are unchanged and remain correct; this is a distinct, later boundary.

**Exact throw site.** `prodRequireSheet_` (29_:53) → `classifySchemaMismatch` → `prodSchemaError_('HEADER_MISSING', name, report)` (29_:63) via `procurementEnsureSheet_` (13_:181 → `prodRequireSheet_`). The bracket contains the **tab name**. HEADER_MISSING here = a required `expectedHeaders` header is absent from the live tab (KMPS `missingHeaders.length`), NOT an empty sheet.

**Failure-class verdict — D (LEGACY_HEADER_AUTHORITY_STILL_ACTIVE); repository CODE defect (Outcome B).** The ONE shared sheetSet loader `rprReadTable_` (23_:51) resolved the header authority for `request_order_allocation_drafts` from `RPR_TABLE_HEADERS_` → the **legacy** `REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_` (26 cols incl. the retired `category_snapshot`/`series_snapshot`), **regardless of the cutover flag**. The live tab is now the V2 53-col schema (those two retired), so the legacy required headers are missing → `HEADER_MISSING`. Every V2 consumer converges on this one loader — flat readback (47_:480 `rprBuildSheetSet_([KMRDV2P.HEADER_TABLE])`), generation writer / edit / submit / Send (24_ `rpoFlatLoadActive_`/`rpoFlatLoadById_`/`rpoFlatTokenForDraft_`/`rpoFlatLockedApply_` all via `rprBuildSheetSet_`), and the 48_ job (through 24_) — so BOTH generation (Failed 99) and readback fail from the SAME defect. NOT classes A/B/C/E: the physical tab exists with the exact 53 V2 headers, the runtime target is correct, the tab IS included in the sheetSet, and the V2 headers themselves match `KMRDV2.V2_HEADERS`.

**Fix (single owning layer, `23_recommendation_persistence_repository.gs` `rprReadTable_`).** Route on the cutover flag BEFORE schema validation: when `requestOrderDraftV2FlatCutoverEnabled_()` is true, the header authority for `request_order_allocation_drafts` is `KMRDV2.V2_HEADERS` (53); when false, the legacy authority (rollback preserved). No other table's authority changes; WEEKLY (`shipping_allocation_drafts`) and the run-journal are untouched. `prodRequireSheet_`/`procurementEnsureSheet_` then validate the V2 tab against the V2 contract (pass; `extraColumnsPolicy: ALLOW`); `sheetEnsureColumns_` finds all 53 present → appends nothing (read-only). HEADER_MISSING safety is NOT disabled — a genuinely malformed tab (missing/absent header) still fails closed. No 124-column authority, no Draft-Line fallback, no auto-column creation, no formula change.

**Header authority contract (frozen).** flag=true → canonical `request_order_allocation_drafts` validated against `KMRDV2.V2_HEADERS` (exactly 53, Flat V2 authority only); legacy backup / staging / failed names are never canonical; zero Draft-Line dependency. flag=false → legacy authority for rollback only. Flag selection occurs before incompatible schema validation.

**Consumer convergence.** All V2 consumers use the ONE shared `rprBuildSheetSet_ → rprReadTable_` loader, so the single fix closes generation writer, flat readback, edit, submit, dispatch/Send, and the AI-Plan job simultaneously — all on the same canonical table + 53-header contract. The flat readback references only `request_order_allocation_drafts` (never `request_order_allocation_draft_lines`).

**Read-only diagnostic.** New paste-ready public entrypoint `TEMP_R5B_DIAGNOSE_CANONICAL_DRAFT_TABLE()` (in `TEMP_migrate_request_order_draft_v2.gs`, writes NOTHING) reports the runtime Spreadsheet name + safe id fingerprint + acquisition path, `RUNTIME_SPREADSHEET_TARGET_MATCH`, canonical-tab presence + exact name (whitespace flag), header count + ordered list + hashes, missing/extra/duplicate headers, first-10 raw headers, data-row count, planning_cycle + id type distributions, the selected loader authority (LEGACY vs FLAT_V2), whether V2 authority is selected before the header guard, the flag, `DRAFT_LINE_DEPENDENCY_ZERO`, and a verdict (`V2_TABLE_READY` / `V2_SCHEMA_MISMATCH_MISSING_HEADERS` / `CANONICAL_TAB_ABSENT_OR_WRONG_TARGET` / `SCHEMA_OK_BUT_FLAG_OFF`).

**Files changed.** `23_recommendation_persistence_repository.gs` (the fix — a standalone `.gs`, NOT bundled), `TEMP_migrate_request_order_draft_v2.gs` (read-only diagnostic), new `request-order-flat-v2-table-loading-f1-7n-fa-3c-r5b.test.js` (26 assertions: exact HEADER_MISSING reproduced with the REAL `rprReadTable_`; flag=true → V2 headers / loads 53×26; flag=false → legacy authority; absent tab + one-missing-header fail closed; `rprBuildSheetSet_` convergence; all-consumer source convergence; diagnostic read-only + `V2_TABLE_READY`). **No core/KMRDV2/KMRDV2P/90_ change → bundle unchanged (`6c47f4358e264b8bf0e04d4f578de23eebd55ed8c13c712774c909c37b0bc4e5`, 52 modules).** Repository flag stays `false`. Full sweep 298 pass / 4 pre-existing baseline / 0 new.

**Resync manifest correction (IMPORTANT).** `23_recommendation_persistence_repository.gs` was NOT in the §27/R5A seven-file cutover manifest — so the deployed 23_ carries the legacy-authority defect. The permanent manifest now expands to **eight** files: `00_config`, `15_request_allocation_handlers`, `23_recommendation_persistence_repository` (**newly required — R5B fix**), `24_recommendation_orchestrator`, `25_recommendation_user_edit`, `47_api_v1_recommendation_generation`, `48_api_v1_request_order_draft_job`, `90_generated_supply_planning_bundle` — all bound to the R5B commit. Frontend needs NO change. TEMP helper stays paste-run-remove tooling.

**Readback-first retry (USER-owned; triggers paused; only after sync/deploy).** 1 sync/deploy the R5B hotfix (the eight `.gs` from the R5B commit + a new Apps Script deployment version); 2 run `TEMP_R5B_DIAGNOSE_CANONICAL_DRAFT_TABLE()` → require `CANONICAL_TAB_PRESENT=YES`, `CANONICAL_V2_SCHEMA_EXACT=YES` (exact 53), `RUNTIME_SPREADSHEET_TARGET_MATCH=YES`, `loader_authority_selected=FLAT_V2`, verdict `V2_TABLE_READY`; 3 run a **readback-only** getActive for one scope → require NO `HEADER_MISSING`; 4 record counts (canonical V2 = 26, Draft Lines = 65); 5 ONLY then retry AI Plan for one scope (R5A §28 controlled one-scope acceptance: Created/Reused=1, Draft-Line delta 0, cycle 2026-08, no duplicate); 6 only then the full 99-row batch. **Rollback trigger:** any `HEADER_MISSING`, any Draft-Line write, any legacy-authority selection under flag=true, or any duplicate-active → HALT + §27.9 rollback. `USER MAY_RETRY_AI_PLAN = NO` until the readback-first verification passes.
