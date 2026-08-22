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

## 30. R5C-P0 — permanent V2 write text-format + partial-commit truthful semantics (2026-08-22, hotfix)

**Live symptom (post-R5B sync, flag=true).** The full-scope AI Plan reported Processed 99 / **Created 0 / Reused 0 / Failed 99** (reason histogram: `NON_ACTIONABLE_ZERO_RECOMMENDATION` 54, `GENERATION_FAILED` 45). But the canonical table gained rows: newly-created deterministic ids `RD::MONTHLY_ORDER::2026-08::…` with `created_at` ~10:17–10:22, whose `planning_cycle` reads back as a **Date** (`Sat Aug 01 2026 …`), while the pre-existing migrated rows retain the string `"2026-08"`. So writes **committed** and were mis-reported as failures — a partial commit incorrectly classified. This is TWO distinct code defects on the flat write path (both in standalone `.gs` — no core/bundle change).

**Root cause D1 — write coercion.** `rpoKeyedDeltaWrite_` (`24_`) persisted the flat V2 row via bare `setValues`. Google Sheets coerces the primitive string `"2026-08"` in a General-format cell into a Date. So every newly-appended row committed with `planning_cycle` as a Date (the R4C2 fix had only ever been applied to the TEMP migration helper, never the permanent production writer). IDs (`RD::…`) did not coerce but are now defensively text-formatted too.

**Root cause D2 — false-failure / partial-commit misclassification.** `recGenSummarizeDraftResult_` (`47_`, the resumable batch job's per-SKU summarizer) only understood the legacy **line** result shape (`data.status === 'COMPLETED'` + `data.coreAction`). The **flat** generate returns `{ wrote, persisted, outcome, action, draftId, result }` with **no** `data.status`/`coreAction`, so it fell through to the failure branch → `GENERATION_FAILED` for EVERY committed flat write. This is the primary cause of Created 0 / Failed 99 with 41 rows persisted; the batch had never before executed the flat path end-to-end through the summarizer.

**Exact permanent write seam.** `recGenGenerateOneSkuCompact_` (47_) → `rpoGenerateRecommendationDraftLockedResult_` (24_) → (MONTHLY + flag) `rpoGenerateMonthlyFlatResult_` → `KMRDV2P.generateMonthlyFlat` → `deps.lockedApply` = `rpoFlatLockedApply_` → `KMRDV2P.applyFlat` (mutates the in-memory set) + `rpoKeyedDeltaWrite_` (the actual `setValues` to the sheet). Committed-before-failure sequence: applyFlat returns `runStatus=COMPLETED, wrote=true` → `rpoKeyedDeltaWrite_` COMMITS the row (coercing the cycle) → generateMonthlyFlat returns `outcome=CREATE` (no `data.status`) → `recGenSummarizeDraftResult_` reads no `data.status` → `GENERATION_FAILED`. The row is durably written; the batch counter shows it failed.

**Fix (Objective C — permanent text-format write + roundtrip).** In `rpoKeyedDeltaWrite_`, for ONLY the V2 drafts table (`name === KMRDV2P.HEADER_TABLE`) under cutover=ON: resolve the `request_allocation_draft_id` + `planning_cycle` column indexes from the live `t.headers` (= `KMRDV2.V2_HEADERS`), `setNumberFormat('@')` on ONLY those two columns of ONLY the cells being written (each update row + the append block) BEFORE `setValues`, write the primitive canonical string (no apostrophe prefixes), then `SpreadsheetApp.flush()` and roundtrip-read the written id/cycle cells via `rpoFlatVerifyWrittenRows_`: require the id byte-verbatim string and the cycle a primitive `^\d{4}-(0[1-9]|1[0-2])$` string equal to the intended value. Every other column keeps its natural format; every other table and the flag=false legacy/rollback path are byte-identical (`isV2` stays false). Covers both newly-appended rows AND updates/reuse.

**Fix (Objective D — truthful write-result semantics).** `rpoFlatLockedApply_` attaches an explicit `writeOutcome` to the applyFlat result: `WRITE_NOT_STARTED` (no lock / nothing persisted) · `WRITE_REJECTED` (token/dup conflict, no write) · `WRITE_COMMITTED_VERIFIED` (row written + roundtrip-verified) · `WRITE_COMMITTED_READBACK_FAILED` (row committed but readback failed → `requiresReconciliation:true` + `committedDraftId` surfaced). `rpoGenerateMonthlyFlatResult_` marks the flat result `resultShape='FLAT_V2'`; `recGenSummarizeDraftResult_` routes on that marker → a committed write is `CREATED`/`REUSED`/`REGENERATED` (truthful); a committed-but-unverified write becomes status `WRITE_COMMITTED_READBACK_FAILED` (never a clean success, never a silent `GENERATION_FAILED`); zero-recommendation → `NOT_READY` (not a failure, no mutation). The `48_` job folds `WRITE_COMMITTED_READBACK_FAILED` into its own `counts.committedUnverified` bucket (single-char code `X`), so a persisted-but-unverified row is never counted as a clean failure nor a create. The deterministic id keeps a re-run idempotent (REUSE, no duplicate), so blind retry is prohibited but a controlled retry is safe.

**Read-only diagnostic.** New paste-ready public entrypoint `TEMP_R5C_AUDIT_DRAFT_WRITE_INCIDENT()` (in `TEMP_migrate_request_order_draft_v2.gs`, writes NOTHING) reports: runtime target fingerprint + `RUNTIME_SPREADSHEET_TARGET_MATCH`, canonical tab exact schema vs `KMRDV2.V2_HEADERS`, `R5C_CANONICAL_ROW_COUNT`, `R5C_DRAFT_LINE_ROW_COUNT`, `R5C_CYCLE_TYPE_DISTRIBUTION` + raw-value distribution, `R5C_NONCANONICAL_CYCLE_COUNT`, EVERY noncanonical row (row number, id, raw cycle, js_type/is_date/ISO, company/country/marketplace/sku/draft_purpose, status, generation_type, created_at/updated_at, the cycle encoded in the deterministic id), `R5C_OFFENDER_IDS` + count, incident-created vs pre-existing-migrated counts, active natural-key duplicate groups (raw cycles) and `R5C_PROJECTED_DUPLICATE_COUNT` (if offender cycles were canonicalized to their id-encoded cycle), `R5C_UNRESOLVABLE_COUNT` (ids whose cycle cannot be derived deterministically), the Draft-Line delta authority (expected 65), `R5C_ZERO_WRITE_CONFIRMED`, and `R5C_INCIDENT_AUDIT_CHECKSUM` over the sorted offender ids. Observed values are authoritative; the likely 67/41/65 are comparison expectations only (never hardcoded as truth; "missing ≠ 0").

**Files changed.** `24_recommendation_orchestrator.gs` (`rpoKeyedDeltaWrite_` text-format + roundtrip; `rpoFlatVerifyWrittenRows_`; `rpoFlatLockedApply_` writeOutcome; `rpoGenerateMonthlyFlatResult_` resultShape marker), `47_api_v1_recommendation_generation.gs` (`recGenSummarizeDraftResult_` flat-shape branch), `48_api_v1_request_order_draft_job.gs` (`committedUnverified` counts bucket + code `X`), `TEMP_migrate_request_order_draft_v2.gs` (read-only R5C audit), new `request-order-flat-v2-write-textformat-and-truthful-result-f1-7n-fa-3c-r5c.test.js` (52 assertions, real write path + Sheets coercion model + summarizer + diagnostic), and the `request-order-draft-job` test's counts assertion (add `committedUnverified: 0`). **All standalone `.gs` — NO core/KMRDV2/KMRDV2P/`90_` change → bundle unchanged (`6c47f4358e264b8bf0e04d4f578de23eebd55ed8c13c712774c909c37b0bc4e5`, 52 modules).** Repository flag stays `false`. Full sweep 299 pass / 4 pre-existing baseline / 0 new.

**Resync/deploy manifest.** Unchanged from R5B's **eight** files: `00_config`, `15_request_allocation_handlers`, `23_recommendation_persistence_repository`, `24_recommendation_orchestrator` (R5C), `25_recommendation_user_edit`, `47_api_v1_recommendation_generation` (R5C), `48_api_v1_request_order_draft_job` (R5C), `90_generated_supply_planning_bundle` (unchanged) — all bound to the R5C commit; then a new Apps Script deployment version. Frontend needs NO change. TEMP helper stays paste-run-remove tooling.

**USER diagnostic run order + HALT (triggers paused).** 1 sync/deploy the eight `.gs` from the R5C commit + new deployment version; 2 run `TEMP_R5C_AUDIT_DRAFT_WRITE_INCIDENT()` → freeze `R5C_OFFENDER_IDS` + `R5C_INCIDENT_AUDIT_CHECKSUM` + `R5C_PROJECTED_DUPLICATE_COUNT` + `R5C_UNRESOLVABLE_COUNT`; 3 (R5C1, separate task) build the dry-run/execute/validate repair over the FROZEN offender ids only. **R5C does NOT repair live data.** `USER MAY_RETRY_AI_PLAN = NO` until the offenders are reconciled by R5C1 (a retry would re-run the deterministic ids → REUSE the existing rows, now written text-correct, but the 41 already-coerced rows would remain Date until R5C1 repairs them). **HALT** on any post-deploy `HEADER_MISSING`, any Draft-Line write, any legacy-authority selection under flag=true, any duplicate active natural key, or any `WRITE_COMMITTED_READBACK_FAILED` after deploy → §27.9 rollback.

## 31. R5C1 — exact-41 live cycle repair tooling (2026-08-22, one-time paste-ready)

**Purpose.** Repair ONLY the `planning_cycle` of the exact 41 incident rows committed before the R5C permanent-writer fix — the rows whose cycle Sheets coerced from the string `"2026-08"` into the Date `2026-07-31T16:00:00.000Z`. The 26 pre-existing migrated rows already hold the string `"2026-08"` and are never touched. This is one-time paste-ready USER tooling in `TEMP_migrate_request_order_draft_v2.gs` (NOT bundled, NOT permanent runtime); the R5C permanent writer already prevents recurrence.

**Live read-only audit authority (frozen).** target match YES · canonical `request_order_allocation_drafts` · exact 53-header schema · 67 canonical rows · 65 Draft-Line rows · cycle types `{string:26, Date:41}` · canonical cycle values `{2026-08:26}` · offender raw Date ISO `2026-07-31T16:00:00.000Z` ×41 · project-tz month `2026-08` · all 41 IDs encode `2026-08` · all offenders `status=draft, generation_type=ai_plan`. The month is authorized ONLY by the frozen ID list + each ID's encoded `2026-08` + project-tz agreement — NEVER a UTC slice of the Date.

**Three public entrypoints** (Apps Script Run dropdown; run order DRY_RUN → verify → EXECUTE → VALIDATE): `TEMP_R5C1_DRY_RUN_REPAIR_DRAFT_CYCLES()` (read-only), `TEMP_R5C1_EXECUTE_REPAIR_DRAFT_CYCLES()` (writes ONLY the 41 `planning_cycle` cells), `TEMP_R5C1_VALIDATE_REPAIRED_DRAFT_CYCLES()` (read-only).

**Frozen cohort + checksum.** The exact 41-ID cohort is embedded verbatim (`TEMP_R5C1_FROZEN_IDS_`); a deterministic SHA-256 over the sorted IDs joined by `\n` = **`0b6b812cf6475845086cd0bbb8a8172348eccaa2067a92c4e230b3b47e39e5aa`**, reported identically by all three entrypoints.

**Hard pre-execution gate matrix (EXECUTE writes NOTHING unless ALL are true).** target match · flag=true · canonical tab + exact 53-header schema · canonical rows = 67 · Draft Lines = 65 · frozen count = 41 · all 41 present exactly once (no missing, no duplicate) · no unexpected (non-frozen) Date-cycle offender · each pending offender cycle is a Date with ISO exactly `2026-07-31T16:00:00.000Z` · each ID encodes `2026-08` · ID-encoded company/country/marketplace/sku/draft_purpose exactly matches the row fields · status=draft · generation_type=ai_plan · projected active natural-key duplicate count = 0 (after canonicalizing offenders to their ID-encoded cycle) · unresolvable count = 0 · the other 26 cycle cells are primitive string `2026-08`. EXECUTE re-runs the full gate against LIVE, so any activity/drift since DRY_RUN fails a gate — **the gate matrix IS the drift check**. Any failure → write nothing + `R5C1_PRE_EXECUTION_GATE_FAILED` (with the failing gate names).

**Execute write boundary.** For each frozen ID: resolve the row by EXACT id (never a stored row number) → resolve the `planning_cycle` column from the exact header → `setNumberFormat('@')` on THAT one cell → write the primitive string `"2026-08"` → never modify the id or any of the other 52 fields or `created_at`/`updated_at` → never delete/insert/sort/rename a row or tab → never write or format Draft Lines → `SpreadsheetApp.flush()` → full roundtrip + before/after proof. Before-snapshot = all 53 fields of all 67 rows; after proves: exactly N (=pending) cells changed and every one is `planning_cycle`; exactly N `@` format targets, all `planning_cycle`; all other field values equivalent; row count 67; ID set identical; Draft Lines 65; cycle types `{string:67}`; cycle values `{2026-08:67}`; status `{submitted:20, draft:47}`; purpose `{regular:67}`; marketplace `{Amazon:59, Shopify:3, Walmart:5}`; no projected duplicate; post-repair gates pass.

**Idempotency / recovery.** All 41 already string → `ALREADY_REPAIRED` (zero writes). A strict subset already repaired → `PARTIAL_REPAIR_DETECTED`, repairs ONLY the remaining pending frozen IDs, and only when the full cohort/checksum + all safety gates still hold. Never clears/deletes/recreates rows; never auto-rollback; retains the before/after evidence (the returned object + the Logger dump) for a manual rollback. Deterministic ids keep a re-run collision-free.

**Files changed.** `TEMP_migrate_request_order_draft_v2.gs` (the R5C1 tooling — read-only DRY_RUN/VALIDATE + the gated EXECUTE), new `request-order-draft-cycle-repair-exact41-f1-7n-fa-3c-r5c1.test.js` (43 assertions; a mutable Sheets coercion model + real SHA-256: exact cohort/checksum, every HALT gate, zero-write dry run, EXECUTE writes/formats only the 41 `planning_cycle` cells, before/after invariants, VALIDATE, idempotent ALREADY_REPAIRED, PARTIAL). **No core/KMRDV2/KMRDV2P/`90_`/permanent-runtime change → bundle unchanged (`6c47f4358e264b8bf0e04d4f578de23eebd55ed8c13c712774c909c37b0bc4e5`, 52 modules).** Full sweep 300 pass / 4 pre-existing baseline / 0 new.

**USER run order + HALT (triggers paused; only after the R5C sync/deploy from §30).** 1 run `TEMP_R5C1_DRY_RUN_REPAIR_DRAFT_CYCLES()` → require `verdict=READY_TO_EXECUTE`, `pending_count=41`, checksum `0b6b812c…`, all gates true; 2 architect verifies the log; 3 run `TEMP_R5C1_EXECUTE_REPAIR_DRAFT_CYCLES()` → require `verdict=REPAIR_EXECUTED_VERIFIED`, `writes=41`, all before/after proofs true; 4 run `TEMP_R5C1_VALIDATE_REPAIRED_DRAFT_CYCLES()` → require `REPAIR_VALIDATED` (string:67 / 2026-08:67 / status/marketplace/purpose totals / no duplicate). **HALT** on any gate failure, any non-`planning_cycle` change, any Draft-Line write, row-count/ID-set drift, or a validation failure → keep the returned evidence and roll back manually (never auto). Only after VALIDATE passes may the USER (a separate decision) retry AI Plan — a retry then reuses the deterministic ids (REUSE, now text-correct), no duplicates. `USER MAY_EXECUTE_R5C1_REPAIR` and `USER MAY_RETRY_AI_PLAN` remain USER-gated.

## 32. R5D — manual-only AI Plan Result popup + user-facing semantics (2026-08-22, UI refinement)

**Scope.** A minimal, non-disruptive frontend refinement after the R5C/R5C1 live closure. NO business formula, AI Plan generation, Draft V2 schema, DB write, job eligibility, scheduler, API contract, or recommendation-quantity change. Frontend only: `assets/js/pages/request-order.js` + `assets/css/pages/request-order.css`. No `.gs`, no core JS, no bundle, no DB.

**Invocation-source authority (the core rule).** The AI Plan Result surface (popup + toast) belongs ONLY to an explicit current-session USER click. Both the manual entry (`handleRequestOrderAiPlan` → `_roRunAiPlanJob_`) and the resume-on-mount entry (`_roResumeAiPlanJobOnMount_`, mount hook) funnel into the SHARED continue-loop `_roAiPlanDriveContinue_ → _roAiPlanFinishDone_`. R5D threads a `ctx = { manual, token }` through that loop:
- `_roRunAiPlanJob_` (MANUAL_UI) stamps `ctx = { manual: true, token: ++_roAiPlanManualToken }` — a fresh monotonic token per manual run.
- `_roResumeAiPlanJobOnMount_` (SYSTEM_RESUME / BACKGROUND / re-adopted job) drives with `ctx = { manual: false, token: -1 }`.
- The result surface opens only when `_roAiPlanShouldShowResult_(ctx)` is true = `ctx.manual === true && ctx.token === _roAiPlanManualToken` (the newest manual token). A non-manual ctx, or a stale/superseded token (a late response from an older run), can never open or overwrite the popup. Page-open alone is NOT manual.

**Automatic / background suppression.** For AUTOMATION / SCHEDULED / SYSTEM_RESUME completions: no popup, no inline panel, no toast, no restored result after reload. The `getActive` read-back still refreshes Order Allocation (that is not a "result" surface). Result state (`_roAiPlanResult`) is module-scoped and never persisted, so a page reload starts clean — a manual job re-adopted after reload resumes silently (manual:false) and never reopens an old popup.

**Wording.** The user-facing bucket "Not ready" is renamed **"No order needed"** (the zero-recommendation bucket). Reason mapping: `NON_ACTIONABLE_ZERO_RECOMMENDATION` → "No order needed — all recommended quantities are 0." Raw technical tokens never appear as the primary message; they remain in a COLLAPSED `<details>` "Technical details" section (with the friendly label appended). The backend `counts.notReady` bucket is unchanged — only the label and primary message change.

**Popup layout/behavior.** A compact, non-modal, dismissible toast: `position: fixed; right:16px; bottom:16px; z-index:1200; width:360px; max-width: calc(100vw - 32px)` (mobile `@media (max-width:640px)` → left/right 16px, auto width). Because it is `position:fixed` on `<body>` it causes NO page reflow / layout shift and never covers or replaces the Order Planning result table. Rows: Processed · Created · Reused · Regenerated · Needs confirmation · Blocked · No order needed · Failed. Visible "×" close is a real `<button>` (keyboard accessible) with `aria-label="Close AI Plan result"`; Escape closes it when active; closing hides it without cancelling/mutating the job. Reuses the existing KM tokens/spacing; no new UI framework.

**Result severity (four levels).** error (`--bad`): `failed > 0` OR `committedUnverified > 0` → error styling + an explicit "Reconciliation required" message. warn (`--warn`): `needsConfirmation > 0` OR `blocked > 0`. ok (`--ok`): any successful draft (created+reused+regenerated > 0). info (`--info`, neutral): only "No order needed" (zero-recommendation) — NOT an error. The whole result is never colored an error merely because No order needed > 0 (the live batch Regenerated=45 / No order needed=54 / Failed=0 → success/ok).

**Lifecycle.** A new manual run clears any prior result (`_roClearAiPlanResult_`) and stamps a fresh token; one completed manual run yields at most one popup. The Escape keydown listener is bound ONCE on `document` (guarded by `_roAiPlanKeydownBound`), so repeated mount/unmount never duplicates handlers; the popup element is create-if-missing by a single id. A late response from a superseded/older run cannot overwrite a newer manual result (token check).

**Accessibility.** success/info/warn → `role=status`, `aria-live=polite`; error → `role=alert`, `aria-live=assertive`. Close is a real focusable `<button>` with an accessible label; no inaccessible clickable div/span; existing responsive behavior preserved.

**No backend / business-logic change.** The API payload, job state, recommendation math, Draft V2 model, and all other Order Planning UI (search/filter/allocation table) are untouched. Bundle unchanged (`6c47f4358e264b8bf0e04d4f578de23eebd55ed8c13c712774c909c37b0bc4e5`, 52 modules). Frontend deployment manifest: `assets/js/pages/request-order.js` + `assets/css/pages/request-order.css` only. Full sweep 301 pass / 4 pre-existing baseline / 0 new.

## 33. R6A — flat-draft lifecycle (Edit / Partial Submit / Full Submit / Send) audit + preflight (2026-08-22, read-only)

**Scope.** Read-only design/runtime audit + preflight/validator tooling. NO live Edit/Submit/Send, no DB mutation, no deploy/push, no formula/schema change. Frozen the exact production path and the write matrix; built read-only preflight + staged validators in the TEMP helper.

### 33.1 Exact runtime trace (proven, not assumed)
- **Load one active flat Draft** — frontend `getActive` (scope, no cycle) → `47_ recGenFlatReadback_` → `rprBuildSheetSet_ → rprReadTable_` (flat V2 authority under flag) → `KMRDV2P.readActiveFlatForScope`. Reads `request_order_allocation_drafts` ONLY.
- **Edit (Order Qty / Note)** — frontend edit → `25_` (MONTHLY + flag) → `rpoEditMonthlyFlatResult_` (24_) → `KMRDV2P.editMonthlyFlat` → `KMRDV2.applyTierEdit` → `rpoFlatLockedApply_ → KMRDV2P.applyFlat` (optimistic token) → `rpoKeyedDeltaWrite_` (R5C text-format).
- **Submit (partial & full)** — frontend submit → `15_` (flag) → `rpoSubmitMonthlyFlatResult_` (24_) → `KMRDV2P.submitMonthlyFlat` → `KMRDV2.applySubmit` + `KMRDV2.deriveHeaderStatus` → same locked write.
- **Send Request → downstream Request Order** — frontend `handleSendRequest` (request-order.js) confirms the canonical draft, then `DB.createRequestOrderDraft` (POST `action:createRequestOrderDraft`) → `13_ handleCreateRequestOrderDraft_ → roCreateRequestOrderCore_`, which writes `request_orders` + `request_order_lines` + `request_order_line_sources`. **Finding:** the exported `KMRDV2/KMRDV2P.buildSendRequestLines`/`explodeSendRequestLinesFromDto` is the tier-eligibility CONTRACT (order_qty>0, non-cancelled, no line id) but has **no runtime caller** — the live Send is the pre-cutover `createRequestOrderDraft` path driven by the frontend allocation state + the flat draft id as the lineage FK. Send **stops at Request Order** (never reaches Purchase Order; PO is a separate later seam carrying `request_order_id`).
- **Re-send idempotency** — `13_` under ScriptLock: `roExecutionKey_(company, planning_cycle, series, [draft ids])` stored in `request_orders.source_ref_id`; `roFindByExecutionKey_` pre-check → existing==1 → REUSE (same `request_order_id`, `reused:true`, zero new rows); >1 → `REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT`.

### 33.2 EXACT WRITE MATRIX (per operation)
**EDIT** — table written: `request_order_allocation_drafts` (1 row) + `recommendation_calculation_runs` (journal). Fields allowed to change (per selected tier): `tN_order_qty` (→ recomputes `tN_carton_qty` from `units_per_carton`), `tN_carton_qty` (explicit override), `tN_note`; stamps `tN_user_edited=true`, `tN_user_edited_by`, header `updated_by`/`updated_at`; header status re-derived. Protected: `tN_recommended_qty` NEVER rewritten; `created_at`/`created_by` untouched; a `submitted`/`cancelled` tier → `TIER_TERMINAL` (rejected). Status: draft→(draft|partially_submitted|submitted per derivation). Token: optimistic `{draft_version + userEditFingerprint}` revalidated under lock → CONFLICT on mismatch (no write); `draft_version` NOT bumped on edit. updated_at advances.

**PARTIAL SUBMIT** — selected non-zero tiers only → `tN_status='submitted'`, `tN_submitted_by/at`. Zero-qty tier → `NOT_SUBMITTABLE_ZERO_QTY` (never submitted, never a false line). Already-submitted → `ALREADY_SUBMITTED` (skipped). Header derivation over SUBMITTABLE tiers (order_qty>0, non-cancelled): some submitted → `partially_submitted`. Unsubmitted tiers unchanged.

**FULL SUBMIT** — default buckets = every submittable tier. All submittable submitted → header `submitted`. Zero-qty tiers never block (excluded from "submittable"). Resubmission of an already-submitted tier is a no-op; if nothing new → `NO_TIER_SUBMITTED`. All-zero draft → header stays `draft` (never false-submitted).

**SEND** — downstream created: `request_orders` (1 header per series group), `request_order_lines` (one per tier with order_qty>0, non-cancelled), `request_order_line_sources` (one per line; source of truth for company/site/month). ID/FK lineage: `request_order_id` → `request_order_lines.request_order_id` → `request_order_line_sources.request_order_id` + `.request_allocation_draft_id` (= the flat draft id). Counts for a one-SKU target: request_orders +1, lines += (#tiers order_qty>0), line_sources += same; zero submittable tiers → 0 lines. Draft-status requirement: the runtime gate is site-confirm + a valid submitted allocation state before Send. Already-sent → idempotent REUSE (see re-send). Reversibility: Send creates a REAL operational Request Order; only a failure-path compensation (`roDeleteRequestOrderById_`, by `request_order_id`) exists — no user reversal. Send **does not** reach Purchase Order.

**RE-SEND** — idempotency key = `roExecutionKey_(company, planning_cycle, series, sorted draft ids)`; expected zero duplicates (REUSE returns the same `request_order_id`); already-sent response = `{reused:true}`; a pre-existing >1 match fails closed with `REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT`.

### 33.3 Legacy dependency proof (Objective C)
The entire flat lifecycle reads/writes `request_order_allocation_drafts` (+ the run journal) and the downstream `request_orders`/`request_order_lines`/`request_order_line_sources` ONLY. Zero reads/writes of `request_order_allocation_draft_lines` (the flat persistence authority KMRDV2P names it only in "NEVER reads or writes" comments; the flat write set `rpoFlatTables_ = [HEADER_TABLE, RUN_JOURNAL]`). No legacy header backup, no flag=true fallback (the legacy line path in 24_/25_/15_ runs ONLY under flag=false rollback). Draft Lines count remains 65. `request_order_line_sources` is a DIFFERENT downstream provenance table — not the retired child-line table.

### 33.4 Target safety verdict (provisional CO1100-R)
NOT auto-authorized. Its live tier quantities are LIVE data not determinable from source, and CO1100-R appeared as a NON_ACTIONABLE/NOT_READY sample in earlier evidence — it may be a zero-recommendation ("No order needed") draft, in which case Submit → `NO_TIER_SUBMITTED` and Send → 0 lines (not a useful lifecycle). The preflight computes the real per-stage safety live. **This round HALTs all live actions**; the USER runs the preflight first and confirms a target with ≥1 non-zero tier.

### 33.5 Preflight + validators
`TEMP_R6A_PREFLIGHT_FLAT_DRAFT_LIFECYCLE()` (read-only, writes NOTHING) → 21 items incl. runtime target fingerprint, flag, schema hash, 67/65 counts, target presence/uniqueness, status/version/token, full tier snapshot, id/cycle/scope fidelity, active natural-key duplicate count, existing Request-Order/line/line-source references (via `request_order_line_sources.request_allocation_draft_id`), already-sent, per-stage safety (Edit/Partial/Full/Send), expected downstream deltas, zero-write proof, checksum, and a verdict ∈ {READY_FOR_CONTROLLED_LIFECYCLE, TARGET_ALREADY_CONSUMED, TARGET_NOT_EDITABLE, DOWNSTREAM_COLLISION, LEGACY_DEPENDENCY_PRESENT, HALT}. Validators `TEMP_R6A_VALIDATE_AFTER_EDIT / _AFTER_PARTIAL_SUBMIT / _AFTER_FULL_SUBMIT / _AFTER_SEND / _RESEND_IDEMPOTENCY` (read-only) validate only the frozen target + its exact downstream lineage. No action/bypass functions were created — Edit/Submit/Send remain normal UI/API actions.

### 33.6 CONTROLLED USER RUNBOOK (stop after EACH stage)
- **Stage 0** — record full backup + current counts (67/65, submitted 20/draft 47); run `TEMP_R6A_PREFLIGHT_FLAT_DRAFT_LIFECYCLE()`; require `verdict=READY_FOR_CONTROLLED_LIFECYCLE`, `safe_for_edit=YES`, a target with ≥1 non-zero tier; USER explicitly confirms the exact target id + quantities. STOP.
- **Stage 1** — one Edit via the normal UI (one tier qty and/or note). STOP → `TEMP_R6A_VALIDATE_AFTER_EDIT()` → return logs.
- **Stage 2** — Partial Submit ONE selected non-zero tier via the UI. STOP → `TEMP_R6A_VALIDATE_AFTER_PARTIAL_SUBMIT()` (require header `partially_submitted`, exactly that tier submitted) → return logs.
- **Stage 3** — Full Submit the remaining applicable tiers via the UI. STOP → `TEMP_R6A_VALIDATE_AFTER_FULL_SUBMIT()` (header `submitted`, all submittable tiers submitted, zero-qty excluded) → return logs.
- **Stage 4** — Send Request ONCE via the UI. STOP → `TEMP_R6A_VALIDATE_AFTER_SEND()` (require 1 request_order / N lines / N line_sources matching the submitted tiers, lineage FK present) → return downstream deltas + logs.
- **Stage 5** — Send the SAME request again. `TEMP_R6A_VALIDATE_RESEND_IDEMPOTENCY()` (require exactly ONE request_order, zero duplicates). Never authorize multiple destructive stages in one instruction; each stage is a separate USER decision. **All live actions remain USER-gated: MAY_EDIT/SUBMIT/SEND = NO until the USER runs the preflight and explicitly authorizes each stage.**

## 34. R6B — persisted-draft hydration + inline autosave closure (2026-08-22)

Blocking correction found right after the R6A preflight (supersedes R6A Stage 1). Source/test/doc only; NO live Edit/Submit/Send, no DB mutation, no deploy/push. Frontend `request-order.js` + `request-order.css` + read-only TEMP diagnostic; **no core JS / no `.gs` runtime change → bundle unchanged (`6c47f4358e264b8bf0e04d4f578de23eebd55ed8c13c712774c909c37b0bc4e5`, 52 modules).**

### 34.1 Root cause (blank allocation after refresh)
`_roCanonicalScope_()` derived a concrete scope ONLY from `window._roAiPlanScope`, which is set exclusively when AI Plan runs in the current session. After a browser refresh `_roAiPlanScope` is `undefined` → `_roCanonicalScope_()` returned `null` → `_roLoadCanonicalDraftsForScope_(null)` early-returned → `_roCanonicalDraftBySku` stayed `{}` → Order Allocation `order_qty`/`carton`/`note` blanked. Suggested quantities still showed because they come from the SEPARATE gap/planning projection (`_opReco…`/`_roTierSuggested`), not the Draft. Additionally, the Note input persisted only to in-memory `requestOrderState.allocEdits` and had NO writer at all.

### 34.2 Hydration call graph (before → after)
Before: `mount → _roLoadCanonicalDraftsOnMount_ → _roLoadCanonicalDraftsForScope_(_roCanonicalScope_())` where scope came from `_roAiPlanScope` only → null after refresh → no read.
After: `_roCanonicalScope_()` falls back to the single concrete scope in the loaded/searched rows; and a new `_roHydratePersistedDraftsForLoadedScopes_()` reads **every** concrete `{company,country,marketplace}` present in `requestOrderState.data` (each via `getActiveRequestOrderDrafts` → `_roReadActiveDraftsForScope_` accumulate) and projects the flat DTO into `_roCanonicalDraftBySku`. Wired on mount (`_roLoadCanonicalDraftsOnMount_`) AND on Search (`handleRequestOrderSearch`). The AI-Plan DONE path still uses `_roLoadCanonicalDraftsForScope_` (single-scope replace). A monotonic `_roHydrateSeq` drops any late response so hydration never overwrites a newer hydration/edit. Projection (read-only): `request_allocation_draft_id`, `planning_cycle`, `status`, `draft_version`/token, per-tier `month`/`recommended_qty`/`order_qty`/`carton_qty`/`status`/`note`/`user_edited`/submitted state — via `_roV2NormalizeFlatDraft_`; the grid reads DB `order_qty` (`_roRowOrderQtyDisplay_`) and DB `note` (`_roRowNoteDisplay_`, new). Suggested stays gap-authoritative; Order Qty is never a Suggested fallback. Hydration is read-only: zero Draft writes, zero version change, zero `updated_at` change, zero Draft-Line read/write, never creates/regenerates a Draft, never opens the AI Plan Result popup.

### 34.3 Canonical Draft selection / lifecycle-visible rule (frozen)
`getActiveRequestOrderDrafts` (flat readback) returns active drafts for the natural scope + planning cycle. Lifecycle-visible = the readback's active set: `draft` / `partially_submitted` / `site_confirmed` (KMRDV2P.ACTIVE_FLAT_STATUSES) surface as editable canonical rows; `submitted` SKUs are reported in `submittedSkus` (execution authority for Send exclusion, not an editable row); `cancelled` never surfaces; a `>1` active natural-scope match is surfaced as a `conflict` entry (`_roIsCanonicalDraftSku_` returns false → edit blocked → fail closed). This matches the runtime authority; no rule was invented or weakened.

### 34.4 Inline autosave (no Save button)
Editable fields: `tN_order_qty`, `tN_note`. Order Qty saves on `onchange` (fires on blur/Enter — the flush). Note saves via `_roAllocEditNote` (oninput → `_roAutosaveDebounce_`, default 600ms) and flushes immediately on blur/Enter (`_roAllocNoteFlush` → `_roAutosaveFlush_`); the debounced callback always sends the LATEST value. Both route to the ONE writer `_roSaveTierEditToCanonicalDraft_(sku, bucket, patch, input)` → `_roBuildTierEditCommand_` (includes `note` ONLY when the patch provides it; a blank note is a deliberate `note:''` replace, never "omitted") → `db.updateRecommendationDecisionLocked` (the existing LOCKED decision writer) → 25_ → `rpoEditMonthlyFlatResult_` → `KMRDV2P.editMonthlyFlat` → `KMRDV2.applyTierEdit`. `carton_qty` is NEVER authored by the frontend — the backend recomputes it from `units_per_carton`. `recommended_qty`, `request_allocation_draft_id`, natural scope and `created_at` are preserved by the core.

### 34.5 Optimistic concurrency
Each save uses the existing optimistic token `{draft_version, userEditFingerprint}` via `_roEnsureDraftToken_`. Success → update the local DTO field (`order_qty`/`note`), adopt the confirmed `draftVersion`, null the cached token so the NEXT edit re-fetches the advanced token (one successful edit ⇒ one token advance) → `is-saved` state. Stale token (`CONCURRENCY_TOKEN_MISMATCH`/`VERSION_CONFLICT`/`TOKEN_MISMATCH`) → NO silent DB overwrite: `is-conflict` inline state + re-read the current Draft (`_roLoadCanonicalDraftsForScope_`) + the user's typed value is preserved for an explicit Enter retry; never runs AI Plan, never creates a second Draft. Terminal/blocked → `is-invalid`. Failed write → never shows Saved. Subtle per-field states (Saving…/Saved/Conflict/Invalid) are border/background-only (no modal, no reflow, no layout shift) via `_roSetFieldState_` + CSS `.is-saving/.is-saved/.is-conflict/.is-invalid`.

### 34.6 Inventory / cargo AI Plan restore finding
The inventory/cargo AI Plan is WEEKLY_SHIPPING; its canonical persisted authority is `shipping_allocation_drafts` / `_lines` (K3 persistence via 16_/61_). The inventory page (`inventory-replenishment.js`) ALREADY restores it on reload: `_hydrateAllocationDraftFromDb(ctx)` + `_allocDraftInitialLoad` on the lifecycle mount, SSOT = DB (not localStorage/sessionStorage) — reload reads the persisted draft from DB and does NOT require re-running AI Plan, and renders from the DB readback (not a manual result popup). So the same principle is already satisfied there; NOT the missing-authority HALT case. Left untouched (verified by source assertion); a deeper interactive verification remains a USER live check.

### 34.7 R6A lifecycle safety
Hydration/autosave do not alter partial-submit / full-submit semantics (submit still routes 15_ → `submitMonthlyFlat` → `applySubmit`), Send lineage (13_ `createRequestOrderDraft`), re-send idempotency (execution key), the deterministic Draft id, Draft Lines (65, untouched), the legacy backup, or the R5D popup authority (hydration never touches `_roSetAiPlanResult_`/`_roAiPlanManualToken`). The R6A preflight/validator DTO contract is unchanged. R6A Stage 1 stays paused.

### 34.8 USER live verification order (read-only diagnostic; NO live edit yet)
1. Deploy the R6B frontend (`request-order.js` + `request-order.css`). 2. Run `TEMP_R6B_DIAGNOSE_PERSISTED_DRAFT_HYDRATION()` → require `verdict=HYDRATION_FIDELITY_OK`, `db_vs_dto_all_equal=YES`, `hydration_write_count=0`, `DRAFT_LINE_DEPENDENCY_ZERO=YES`, `RUNTIME_SPREADSHEET_TARGET_MATCH=YES`. 3. Open Order Planning, Search the ResUS/US/Amazon scope WITHOUT running AI Plan → confirm CO1100-R shows T2 order_qty=320/carton=8, T3 order_qty=7520/carton=188, notes from DB; refresh → values persist. 4. (Still gated) any actual Edit/Submit/Send remains a later USER-authorized R6A stage. HALT conditions: any hydration write, any version change on hydrate, any Draft-Line read/write, any AI Plan Result popup on hydrate/background/resume, a duplicate active match, or `db_vs_dto` mismatch → STOP and report.

## 35. R6B1 — autosave live-wiring + fast hydration + SPA remount recovery (2026-08-22)

Fixes three live frontend defects after R6B. Source/test/doc only; NO live Edit/Submit/Send, no DB mutation, no deploy/push. Frontend `request-order.js` + `request-order.css`; **no core JS / no `.gs` / no backend change → bundle unchanged (`6c47f4358e264b8bf0e04d4f578de23eebd55ed8c13c712774c909c37b0bc4e5`, 52 modules).** Full sweep 304 pass / 4 pre-existing baseline / 0 new.

### 35.1 D1 root cause (Note autosave never persisted)
The Note input was rendered editable BEFORE the canonical Draft + optimistic token were hydrated, and `_roAllocEditNote` only persists when `_roIsCanonicalDraftSku_(sku)` is true. Because hydration was async/slow (D2) — and after a remount often never ran (D3) — `_roCanonicalDraftBySku` was empty at typing time, so the save was skipped and the text stayed client-only (draft_version stayed 3, DB note ''). **Fix:** the editable fields no longer appear until the Draft resolves (state model, 35.4); once LOADED the input enables and the R6B autosave path fires end-to-end (input→debounce→`_roSaveTierEditToCanonicalDraft_`→`updateRecommendationDecisionLocked`→`editMonthlyFlat`→`applyTierEdit`→DB). Proven by dispatching the real `_roAllocEditNote`/`_roAllocNoteFlush` handler path (not source-regex): 3 keystrokes → 1 debounced API edit carrying the latest value; blur/Enter flush once.

### 35.2 D2 root cause (misleading async render)
Suggested rendered from the gap projection immediately while Order Allocation rendered blank editable inputs (Draft hydration still in flight) — read as "recommendation exists, allocation empty." **Fix:** a per-SKU allocation state (35.4) shows a disabled skeleton during load and only reveals editable DB-backed Order Qty/Carton/Note atomically when LOADED. Suggested is NEVER copied into Order Qty.

### 35.3 D3 root cause (SPA remount → zero rows + false "Connect Operation DB")
`initRequestOrderSection` fires the async composer; on remount the module-cached `_opFirstLayerRegion` still pointed at the PRIOR mount's detached DOM node, and the empty-state message hard-coded "Connect the Operation DB" for ANY empty data — including a transient remount race — while Search only re-rendered (never reloaded). **Fix:** every mount bumps `_roMountEpoch` and resets `_opFirstLayerRegion = null` (rebind to the current DOM); `_roBaseDataStatus` (IDLE/LOADING/LOADED/EMPTY/ERROR) drives a state-aware empty message — "Loading…" while loading, the connect message ONLY when `!_roUseDb()` (genuine unavailability), a distinct "Could not load … Retry" on a real API error, and "No results for the current scope" on a legitimate empty; and `handleRequestOrderSearch` re-runs the base load when the DB is available but data is missing (recovers WITHOUT a hard refresh).

### 35.4 UI state model + request order (B)
Per-SKU `_roDraftUiState_`: `DRAFT_LOADING` (disabled skeleton, no blank editable, no Suggested fallback) · `DRAFT_LOADED` (DB Order Qty/Carton/Note atomically, enabled) · `NO_SAVED_DRAFT` (explicit banner, edit disabled) · `DRAFT_CONFLICT` (duplicate, fail closed, disabled) · `DRAFT_LOAD_ERROR` (inline Retry) · `MANUAL` (a SKU outside any AI read-back keeps the ordinary in-memory flow, unchanged). Rendered as a compact colspan banner row + disabled inputs + CSS skeleton (no layout shift, no modal). **Request-count proof (before→after):** before = 1 `getActiveRequestOrderDrafts` per resolved scope but scope was null after refresh → 0 (blank). After = scope-based hydration deduped by `{company,country,marketplace}` (never per-SKU), run in parallel (`Promise.all`, not serial), started as soon as concrete loaded scopes are available; confirmed DTOs cached per scope for the session so Search/expand render the cached DTO immediately and refresh once in the background; a monotonic `_roHydrateSeq` epoch rejects stale responses. Test: 10 SKUs in one scope → exactly ONE getActive; cached re-entry shows LOADED instantly + refreshes once. (No millisecond SLA claimed — request-count evidence only.)

### 35.5 Autosave + optimistic concurrency (A)
Order Qty: `onchange` (blur/Enter flush). Note: `oninput` → 600ms debounce → `_roAllocNoteFlush` immediate flush on blur/Enter, sending the latest value; blank note = deliberate `note:''` clear. One logical change ⇒ one backend edit. `Saved` appears ONLY after a confirmed COMPLETED response (local DTO note + `draftVersion` adopted, token nulled → next edit re-fetches the advanced token). Failure → never Saved; `is-invalid`/Retry, typed value retained. Stale token → `is-conflict`, re-read the Draft, no silent overwrite, typed value preserved for an explicit retry; never runs AI Plan, never a second Draft. **Concurrent edits for the same Draft are SERIALIZED** (`_roDraftEditQueue_` per draftId) so an earlier cached token cannot self-conflict with a later one (the second edit re-fetches the advanced token). `carton_qty` is never frontend-authored (backend recomputes). Optional read-only `window.__roDebug()` snapshot (mount epoch, base/hydration status, unique scope count, hydration request count, cached scope count, canonical Draft count, pending autosave count, last autosave outcome — no secrets, no raw token).

### 35.6 Preserved contracts (D) + safety
R5D manual-only popup (hydration never touches `_roSetAiPlanResult_`/`_roAiPlanManualToken`), AI Plan not run during hydration, flat V2 deterministic id, optimistic concurrency, partial/full submit, Send lineage + re-send idempotency, zero Draft-Line dependency (hydration/autosave never name `request_order_allocation_draft_lines`), inventory WEEKLY_SHIPPING hydration (untouched), and the Suggested/business formulas are all unchanged. R6A lifecycle stays paused.

### 35.7 USER live verification
1. Deploy `request-order.js` + `request-order.css`. 2. Open Order Planning, Search ResUS/US/Amazon WITHOUT running AI Plan → CO1100-R shows a brief "Loading saved allocation…" then T2 320/8, T3 7520/188 (Order Qty/Carton/Note appear together; never a blank editable field). 3. Type into CO1100-R T2 Note and blur/Enter → the field shows Saving…→Saved; re-run `TEMP_R6B_DIAGNOSE_PERSISTED_DRAFT_HYDRATION()` → the note persisted + `draft_version` advanced (this is the first authorized live write of R6B1's autosave — a Note edit only; still NO Submit/Send). 4. Navigate away and back → rows load without a hard refresh; the "Connect Operation DB" message never appears for a remount. 5. `window.__roDebug()` → `hydrationRequestCount` is scope-based (not per-SKU). HALT if: a Note edit does not persist, a blank-editable field is shown during load, "Connect Operation DB" appears on a remount race, an AI Plan Result popup opens on load/remount/autosave, or any Draft-Line write.

## 36. R6B2 — live flat-result interpretation (all-tier Note persistence) + remount hardening + gap/suggested atomicity + inventory parity (2026-08-22)

Fixes the live-proven defect that R6B/R6B1 tests missed: under the MONTHLY_ORDER flat cutover (live) the inline autosave never persisted. Source/test/doc only; NO live Edit/Submit/Send, no DB mutation, no deploy/push. Frontend `request-order.js` ONLY (no CSS change: the new committed-unverified state reuses the existing `is-conflict` class). **No core JS / no `.gs` / no backend change → bundle unchanged (`6c47f4358e264b8bf0e04d4f578de23eebd55ed8c13c712774c909c37b0bc4e5`, 52 modules).** Full sweep 305 pass / 4 pre-existing baseline / 0 new.

### 36.1 Root cause — the flat-V2 edit result shape was never interpreted (Objective A)
The live cutover routes `updateRecommendationDecisionLocked` (MONTHLY_ORDER) → `rpoEditMonthlyFlatResult_` → `KMRDV2P.editMonthlyFlat`, whose result is `{ success, wrote, outcome:'EDITED'|'CONFLICT'|'NOT_EXECUTED', results:[{tier,ok,reason}], result:{writeOutcome} }` — it carries **no `status:'COMPLETED'`** and no `draftVersion`. The pre-R6B2 `_roSaveTierEditCore_` gated success SOLELY on `d.status === 'COMPLETED'` (the LEGACY `KMUE.runUserDecisionEdit` shape). So under the live flat path EVERY committed edit was misread as "Save failed": the note/version was never adopted locally AND the cached optimistic token was never nulled. The R6B/R6B1 unit tests passed only because their fake DB returned the legacy `{data:{status:'COMPLETED'}}` shape — the exact "isolated tests are insufficient" gap.

### 36.2 The complete live-evidence chain (v3 stuck, T2 user_edited=true, all notes empty)
1. An earlier T2 **order_qty** edit DID commit on the backend (→ `t2_user_edited=true`, `draft_version=3`) but the UI showed "Save failed" (status mismatch) and — critically — **did not null the cached token**.
2. The following T2/T3 **note** edits reused the stale cached token (pre-commit, version 2) → the backend rejected them with `outcome:'CONFLICT'` → the notes never committed (version stayed 3, notes empty); the frontend's conflict regex did not recognise `outcome:'CONFLICT'`, so it showed a generic "Save failed" and never re-read. `applyTierEdit` (the all-tier writer) is CORRECT — a note-only patch writes `p+'note'` and stamps `p+'user_edited'` for the exact tier; the defect was entirely frontend result-interpretation.

### 36.3 Fix — shape-agnostic classifier + truthful states (Objective A, frontend-only)
`_roClassifyEditResult_(res)` reads BOTH shapes: LEGACY `{status:'COMPLETED'|'CONFLICT'|'BLOCKED_CONFLICT'|'FAILED', reason}` and FLAT `{wrote, outcome, results[], result.writeOutcome}`. It returns `{cleanSaved, committedUnverified, conflict, terminal, reason, draftVersion, nextToken}`:
- `cleanSaved` ⟺ `res.success && (status==='COMPLETED' || (wrote===true && outcome==='EDITED')) && writeOutcome ∈ {'', 'WRITE_COMMITTED_VERIFIED'}` → adopt note/qty, adopt version if supplied, null (or adopt next) token, show **Saved**.
- `committedUnverified` ⟺ backend-ok but `writeOutcome==='WRITE_COMMITTED_READBACK_FAILED'` → NEVER a clean Saved (R5C truthful semantics); adopt locally (it IS committed; deterministic id keeps a re-run idempotent) + reconciling re-read + "Saved — verifying…".
- `conflict` ⟺ `outcome==='CONFLICT' || status==='CONFLICT' || /CONCURRENCY.../` → null token + re-read (no silent overwrite; typed value preserved).
- `terminal` ⟺ `BLOCKED_CONFLICT / TIER_TERMINAL / IMMUTABLE_TERMINAL_STATUS` → review-required.
The **exact seam that breaks the cascade**: a confirmed edit now nulls the token, so the next same-draft edit re-fetches the advanced token (proven by the R6B2 cascade test). All three tiers persist independently to their own `tN_note` — editing T3 never writes T2 (tier keyed by `data-bucket` → `naturalKey.request_bucket`; the classifier mutates only `ref.line` for that bucket).

### 36.4 Autosave request path (Objective B)
The optimistic token is retained (never removed for speed). `_roClassifyEditResult_` **adopts a next token if the response carries one** (`d.expectedToken` / `d.result.expectedToken`) so a following edit can skip the pre-write fetch when the backend supplies it ("adopt the next valid token when supported"); absent → the token is nulled and the next edit re-fetches. A cached/hydrated token is REUSED (no redundant pre-write fetch): before/after per hydrated edit = **token-fetch(0 when a valid token is cached, else 1) + 1 update**; same-draft edits stay serialized (`_roDraftEditQueue_`). No millisecond SLA claimed — request-count evidence only. The current live backend does not yet return a next token, so the first edit after hydration still fetches once; the frontend is ready to drop to a single request the moment the backend supplies one.

### 36.5 SPA remount hardening + diagnostic (Objective C)
Audit of the REAL lifecycle (`core/lifecycle.js` `switchTo` → `KM.lifecycle.register('request-order-section')` mount) proved the frontend teardown/re-init paths are already correct: `switchTo` early-returns ONLY when already on the page, so nav-away-and-back RE-RUNS `mount()` → `initRequestOrderSection()` (epoch bump + `_opFirstLayerRegion=null` rebind); nothing clears `requestOrderState.data` or the section DOM on unmount; the canonical path pins `_roBaseDataStatus='LOADING'` before the async composer; and `isScopedReadEligible` is configuration-driven (cannot transiently flip false on remount). Hardening added: the empty-state now treats a transient **`IDLE`** status like `LOADING` (never a settled "Connect Operation DB"/"No results" during the remount gap), and `__roDebug()` now exposes `useDb / searched / firstLayerSeq / lastEmptyReason` so a live remount-empty page can be pinned to the EXACT branch (LOADING transient · DB_UNAVAILABLE genuine disconnect · ERROR API failure · EMPTY_SCOPE real empty). A production-faithful test drives the REAL `core/lifecycle.js` register/switchTo across 3 navigation cycles (rows restored each time, region rebinds, no false disconnect). NOTE: because the audited frontend paths were already correct, R6B2 does NOT claim to have reproduced/closed the LIVE remount failure in source — if it recurs, `__roDebug().lastEmptyReason` will identify whether the cause is the composer backend re-read (`EMPTY_SCOPE`) or a genuine unavailability, for a targeted next round.

### 36.6 Gap + Suggested atomicity (Objective D — already satisfied, verified)
Gap and Suggested are read from the SAME per-tier `monthlyProjection` object (`_roCanonTier(t)` ← one materialized `order_planning_gap` row ← one cache read), gated by the SAME `recoLoading` flag, and DOM-patched together by `_opRecoPatchCanonicalCells`. They are structurally atomic — one source, one async resolution, one loading gate — so Gap can never show a stale/empty value beside a completed Suggested. `_opRecoFmtQty` shows `'…'` while unresolved+loading, `'—'` settled-null, the number otherwise (no half-populated tier). Stale/late responses are dropped by the monotonic `_opRecoSeq` + scope-key guard. No recalculation formula change. The perceived "not together" was the ALLOCATION block's hydration latency (the R6B1 state model / Objective E), not a gap/suggested divergence.

### 36.7 Order Allocation hydration performance (Objective E)
Unchanged from R6B1 and confirmed optimal: hydration is scope-deduped (`{company,country,marketplace}`, never per-SKU), parallel (`Promise.all`), session-cached per scope (instant re-entry + one background refresh), seq-guarded, and STARTED at the earliest safe point — inside the first-layer composer's success `.then` (right after base rows land, `_opLoadFirstLayerComposer_`) and again from the mount hook. Proof: 10 SKUs in one scope → exactly ONE `getActiveRequestOrderDrafts`; the allocation state model reveals DB Order Qty/Carton/Note atomically (no blank editable field, no Suggested→Order Qty fallback).

### 36.8 Inventory/Cargo (WEEKLY_SHIPPING) parity matrix (Objective F — audited, no defect)
`inventory-replenishment.js` was audited against every R6B2 capability. It has NO equivalent defect and is NOT modified.

| Capability | Order Planning (MONTHLY_ORDER) | Inventory/Cargo (WEEKLY_SHIPPING) | Shared? |
|---|---|---|---|
| Persisted result hydration on refresh | `_roHydratePersistedDraftsForLoadedScopes_` (getActive) on mount | `_hydrateAllocationDraftFromDb` (`getShippingAllocationDrafts`) via `_restoreAllocationDraftFromSession` on mount | SHARED |
| SPA remount re-init | `KM.lifecycle.register('request-order-section')` mount re-runs | `KM.lifecycle.register('ops-section')` mount re-runs | SHARED |
| Cached detached DOM node | none (region rebinds each mount) | none (controller re-queries each render) | SHARED |
| Loading vs empty vs error; false connect-DB | distinct states; no false connect-DB | distinct states; no false connect-DB | SHARED |
| Async stale-response guard | `_roHydrateSeq` / `_opFirstLayerSeq` | `_replenHydrateToken` / `_irReadSeq` | SHARED |
| Manual-only result popup | R5D manual token | `openAISuggestion` (manual click only) | SHARED |
| Edit model | per-TIER decision write (`updateRecommendationDecisionLocked` → flat V2) | per-ROUTE line upsert into `shipping_allocation_draft_lines` (completeness-gated) | DOMAIN-SPECIFIC |
| Edit success detection | flat `{wrote,outcome,writeOutcome}` + legacy `status` (R6B2 classifier) | envelope `.success`/`.error` (header/line upsert) | DOMAIN-SPECIFIC — the R6B2 status-mismatch bug is STRUCTURALLY ABSENT here |
| Inline Note persistence | per-tier `tN_note` autosaved to the canonical draft | Note field is LOCAL/session-only by design (route qty DOES persist) | DOMAIN-SPECIFIC |
| Optimistic token/version | per-draft token + CONFLICT re-read | blind upsert on the fast path; version/CONFLICT on the separate Workspace controller | DOMAIN-SPECIFIC |

No inventory persistence/edit contract is missing (the route/qty persists; the Note is intentionally a local scratch field), so this is NOT a HALT and the tier model is NOT forced onto WEEKLY_SHIPPING.

### 36.9 Preserved contracts + safety
R5D manual-only popup (autosave never touches `_roSetAiPlanResult_`/`_roAiPlanManualToken`), AI Plan not run during hydration/edit, flat V2 deterministic id, optimistic concurrency, partial/full submit + Send lineage + re-send idempotency, zero Draft-Line dependency (the note/edit source never names `request_order_allocation_draft_lines`), inventory WEEKLY_SHIPPING (untouched), and the Suggested/gap/business formulas are all unchanged. R6A Edit/Submit/Send lifecycle stays paused. Backend `editMonthlyFlat` all-tier writer and result shape are unchanged (the fix is a pure frontend result-interpretation change).

### 36.10 USER verification order (READ-ONLY this round — NO live edit authorized)
This round is source/test/doc + a read-only audit ONLY: `USER MAY_EDIT_LIVE_DRAFT = NO`. The current live state (version 3, T2 user_edited=true, all notes empty) is EVIDENCE and is NOT repaired in source. The all-tier note fix is proven by the R6B2 tests (the REAL rendered note handlers for T1/T2/T3 against the LIVE flat result shape + the stale-token cascade regression). The live note-WRITE verification is DEFERRED to a future round that flips `USER MAY_EDIT_LIVE_DRAFT = YES`.
1. Deploy `request-order.js` (frontend-only; no CSS/backend/bundle rebuild). Sync the TEMP diagnostic file to Apps Script if you want to run the audit.
2. Run `TEMP_R6B2_AUDIT_ALL_TIER_NOTES()` (read-only) → confirm the evidence state: `target_count=1`, `draft_version=3`, `t1/t2/t3_note` empty, `t2_user_edited=true`, `verdict=ALL_TIER_NOTES_EMPTY`, `R6B2_ZERO_WRITE_CONFIRMED=YES` (no repair).
3. Open Order Planning, Search ResUS/US/Amazon WITHOUT running AI Plan → CO1100-R hydrates (Order Qty/Carton/Note appear atomically; never a blank editable field). This is a read-only render check (no edit).
4. Navigate away and back ×3 → rows restore without a hard refresh; `window.__roDebug().lastEmptyReason` is never `DB_UNAVAILABLE` for a remount. If a remount still blanks, capture `window.__roDebug()` — `lastEmptyReason=EMPTY_SCOPE` points at the composer re-read (a backend/data follow-up), `DB_UNAVAILABLE` a genuine disconnect.
5. When a future round authorizes the live note write, the expected result is: each `tN_note` persists independently, `draft_version` advances once per confirmed save, no tier cross-write, blank clears only the selected tier.
HALT if: the audit shows any write occurred, a blank-editable field is shown during load, a false disconnect appears on a remount race, an AI Plan Result popup opens on hydration/remount, or any Draft-Line read/write.

## 37. R6C — system-wide SPA navigation / lifecycle / DB-provider closure (2026-08-22)

A system-level frontend-runtime correction discovered while validating Request Order Draft V2. Two live defects, both proven root-caused; fixed at the SHARED framework seam (not per-page). Source/test/doc only; NO live Edit/Submit/Send, no DB mutation, no deploy/push. Files: `assets/js/core/lifecycle.js`, `assets/js/core/namespace.js`, `assets/js/api/operation-system-db-api.js`, `assets/js/pages/request-order.js`, `index.html`. **No bundled core module (`assets/js/core/supply-*`) changed → bundle unchanged (`6c47f4358e264b8bf0e04d4f578de23eebd55ed8c13c712774c909c37b0bc4e5`, 52 modules).** Full sweep 306 pass / 4 pre-existing baseline / 0 new.

### 37.1 Root cause A — DB-provider loss after navigation (the false "No Request Order data")
`window.KM.DB` is a permanent shell `<script>` (index.html) created ONCE and NEVER torn down on SPA nav (so `window.__roDebug` kept working while `useDb=false`). The real defect: `KM.DB.refreshCacheTables` (`operation-system-db-api.js` `_kmRefreshCacheTables_`) CREATED `window._opDbCache = normalizeOperationDb({})` **without setting `_sourceMode`**; `getOperationDbDataSourceMode()` returned `_sourceMode || 'mock'` → `'mock'` → `isScopedReadEligible()` false for the rest of the session → `_roUseDb()` false → the demo/empty branch showed "Connect the Operation DB". Order Planning poisoned ITSELF via `_roEnsureL2Tables → refreshCacheTables` (L2 row expand / AI-plan / FC-target write); FC Summary (`fc-summary.js`) and Inventory (`inventory-replenishment.js`) do the same through the shared global. Sibling: `refreshFactoryStockTables` (`:4171`) had the identical omission. **Fix (provider-owned):** (a) `getOperationDbDataSourceMode()` defaults an unmarked-but-populated cache to `'not-loaded'` (scoped-read ELIGIBLE) — the ABSENCE of a marker is not a mock posture; only an EXPLICIT `'mock'` (unconfigured API / real fetch-failure fallback) is unavailable; (b) both scoped refreshers STAMP `_sourceMode='google-sheet'` after a successful live sheet read. Writes still require an explicit `'google-sheet'` (`isCloudWriteEnabled`), so this never opens a write on an unconfirmed source.

### 37.2 Root cause B — overlapping pages (two sections visible at once)
`app.js showSection` synchronously clears `.active` from all `.module-section` then calls `KM.lifecycle.switchTo`, but every page's lifecycle `mount()` re-adds `.active` to its OWN section inside an async `_ensure*Markup().then(...)` with NO navigation-epoch guard (audited: all 8 registered pages — home, request-order, fc-summary, ops, shipment-draft, purchase-order-overview, shippinghistory, factory-stock). A late `.then` from a superseded navigation re-activates its (now background) section → two visible sections (Order Planning appearing above FC Summary). `switchTo` threaded no epoch; there is no `popstate`/`hashchange` handler (so `switchTo` is the ONLY navigation entry — guarding it is sufficient).

### 37.3 Fix — LATEST-NAVIGATION-WINS + SINGLE-VISIBLE-SECTION (shared seam in lifecycle.js)
`switchTo(pageName)` now assigns a monotonic `_navEpoch`, sets `_activeSectionId` BEFORE mount, unmounts prev exactly once, calls `mount(epoch)` exactly once (early-returns on same-page → re-click never duplicates), then runs `enforceSingleActiveSection()`. New authority: `currentEpoch()`, `isCurrent(epoch)`, `activeSectionId()`, `commitGuard(epoch, sectionId)` (a page's async mount calls this and bails when superseded — recorded as `lastDiscarded`), `enforceSingleActiveSection()` (page-agnostic invariant: at all times EXACTLY ONE `.module-section` carries `.active`; a stray/late `.active` on a non-current section is stripped; the Home shell is hidden when the target is not Home). A browser `MutationObserver` (guarded; skipped in Node) drives `enforceSingleActiveSection()` on section class mutations as belt-and-suspenders for pages that do not adopt the epoch guard. request-order additionally adopts the guard: `mount(navEpoch)` discards a superseded `.then` (no stale re-activate + no wasteful re-init/hydration — the latter is what drove `hydrationRequestCount` up across superseded remounts). No per-page timers; no business formula touched.

### 37.4 DB provider readiness authority (Objective C)
`window.KM.dbProvider` — a shell-permanent, read-only, idempotent readiness facade: `state()` (READY = configured AND not explicit-mock; ERROR = unconfigured / explicit-mock), `isReady()`, `generation()`, `whenReady()` (always RESOLVES — true when READY, false on a real provider ERROR — so a page mount waits and never shows a false empty; a stale/rejected promise can never poison a future mount because every call RECOMPUTES from live config), `retry()` (bump generation + recompute; recovers without a hard refresh). The provider is synchronous-resident, so IDLE/LOADING are reserved for symmetry and it resolves to READY/ERROR immediately. request-order's empty-state now shows the disconnect message ONLY when `KM.dbProvider.state()==='ERROR'` (a genuine failure) — never during a transient.

### 37.5 Asset release/version authority (Objective D)
There was NO central release id: every `?v=` token was hand-typed per file in index.html (9 distinct values), and `request-order.js` was pinned at the stale `?v=donenotice-20260811` — so the R6B1/R6B2 request-order.js corrections may never have loaded in the live browser (stale cache). **Fix:** a single canonical `KM.RELEASE = 'r6c-navlifecycle-20260822'` (namespace.js), surfaced in `__roDebug()` and `__kmLifecycleDebug()`; the `?v=` token on EVERY asset changed this release (namespace.js, lifecycle.js, operation-system-db-api.js, request-order.js) is bumped to match. Going forward, a release bumps this one slug and the matching `?v=` on changed assets, so "is the deployed correction the code actually running?" is answerable at a glance. (A full migration of ALL ~70 tokens to one slug is deferred — this round bumps only the changed assets, which is what makes the R6B/R6B2/R6C fixes load.)

### 37.6 Pending-autosave navigation safety (Objective E)
`_roAutosaveDebounce_` records the pending callback (`_roAutosavePending_`); the request-order `unmount()` calls `_roFlushPendingAutosaveOnUnmount_()` which fires every pending debounced Note write immediately through the SAME serialized writer + optimistic token (fire-and-forget; navigation never frozen). A failed edit is still never shown as Saved (R6B2 classifier), a stale page response cannot overwrite the next page (the write targets the Draft by id, not the DOM), and no duplicate write is created (the timer is cleared before firing). Blur/Enter already flush on a real click; this covers a programmatic navigation with no blur. No Save button.

### 37.7 System-wide page audit + parity (Objectives F, C-parity)
All 8 registered lifecycle pages violate the "epoch-guarded mount" half of the contract (async `.then` `.active` re-add, no guard) — neutralized centrally by `enforceSingleActiveSection()` + the observer (no per-page edit required for the single-visible invariant); request-order additionally adopts the explicit epoch guard for its init/hydration. Inventory/Cargo (WEEKLY_SHIPPING) parity holds (R6B2 §36.8): it shares the DB provider, hydrates DB-first on mount, uses a different (envelope `.success`) edit model, and — with the R6C provider fix — its `refreshCacheTables` calls no longer poison eligibility either (the fix is provider-owned, so every page benefits).

### 37.8 Observability (Objective I)
`window.__kmLifecycleDebug()` (read-only, no secrets): release, currentSection, navEpoch, pendingNav, lastCommitted, lastDiscarded, activeSectionId, activeVisibleSectionIds + count, dbProviderState + generation, mountedSections, pendingAutosaveCount, lastError. `window.__roDebug()` is retained and now also reports `release` + `dbProviderState`.

### 37.9 Preserved contracts + safety
R5D manual-only popup, R6A lifecycle paused, R6B/R6B1/R6B2 flat-result classifier + all-tier Note persistence, optimistic concurrency, zero Draft-Line dependency, the Suggested/gap/business formulas, and the bundled Apps Script core are all unchanged. `editMonthlyFlat` and every backend `.gs` are untouched (R6C is a pure frontend-runtime correction). Current live Note evidence is PRESERVED (T2 note `123`, T3 empty) — NO live repair; no new live Note test authorized this round.

### 37.10 USER live verification order
1. Hard-refresh ONCE to pick up the new `?v=r6c-navlifecycle-20260822` assets (the last hard refresh needed; the release token now cache-busts future deploys). Confirm `window.__roDebug().release === 'r6c-navlifecycle-20260822'` and `window.__kmLifecycleDebug().release` match — this proves the deployed correction is the code actually running.
2. Open Order Planning, Search ResUS/US/Amazon → base rows load; expand an L2 row (triggers refreshCacheTables). Navigate to FC Summary and back WITHOUT refresh → base rows restore, Drafts hydrate (Qty/Carton/Note), Search works, NO "Connect the Operation DB". `window.__roDebug().dbProviderState === 'READY'`, `useDb=true`.
3. Rapidly click Order Planning → FC Summary → Order Planning several times → `window.__kmLifecycleDebug().activeVisibleSectionCount === 1` at all times; FC Summary never shows Order Planning content and vice-versa; `lastDiscarded` shows superseded navs were dropped.
4. Repeat the away/back cycle 3×; run the Inventory/Cargo AI Plan page through the same sequence → it also restores and never shows a false disconnect.
5. Read-only `TEMP_R6B2_AUDIT_ALL_TIER_NOTES()` still shows the evidence state (v-unchanged, T2 note `123`, T3 empty) — navigation caused NO Draft write/version change. HALT if: two sections are ever visible at once, a false "Connect the Operation DB" appears after navigation, `activeVisibleSectionCount > 1`, base rows do not restore without a hard refresh, an AI Plan Result popup opens from navigation/hydration, a Draft write/version change is caused by navigation, or any Draft-Line read/write.

## 38. R6C1 / R6D — Logo→Home navigation fix + Inventory AI Plan connection PREFLIGHT (2026-08-22)

Two items: a small Logo→Home routing fix, and an AUDIT-FIRST read-only preflight of whether the Inventory/Cargo (WEEKLY_SHIPPING) AI Plan flow persists to `shipping_allocation_drafts` / `_lines`. Source/test/doc only; NO live DB mutation, NO AI Plan execution, NO Submit/Send/Shipment-Draft, NO Request-Order legacy mutation. Files: `assets/js/pages/home.js`, `index.html`, `assets/specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs` (read-only diagnostic). **No bundled core module changed → bundle unchanged (`6c47f4358e…`, 52 modules).** Full sweep 307 pass / 4 baseline / 0 new.

### 38.1 Logo→Home root cause + fix (B)
The Logo (`index.html` `.logo-text` `onclick="showHome()"`) bypassed the SPA navigation authority: `showHome()` toggled `.active` directly and NEVER called `KM.lifecycle.switchTo`. After R6C, the latest-navigation-wins single-visible-section enforcer (which assumes ALL navigation sets `_activeSectionId` via `switchTo`) still had `_activeSectionId` on the PRIOR page, so `enforceSingleActiveSection()` (and the MutationObserver) re-activated that page and re-hid the Home shell → the Logo appeared dead. **Fix:** `showHome()` now calls `KM.lifecycle.switchTo('home-section')` (the exact path the sidebar menu uses) — the current page unmounts, Home mounts (its lifecycle mount restores the shell + renders), `_activeSectionId='home-section'`, and enforce keeps ONLY Home visible. No `location.reload`/hard nav, no second router; re-click on Home early-returns in `switchTo` (no duplicate mount/listeners); latest-navigation-wins + `activeVisibleSectionCount=1` preserved. The Logo is now keyboard-accessible (`role="button"` + `tabindex="0"` + Enter/Space `onkeydown`, `event.preventDefault()` on Space) and visually unchanged (same `div`+`img`). `home.js` `?v=` bumped to the R6C release token so the fix loads.

### 38.2 Inventory AI Plan connection — runtime trace verdict (C/D)
Traced the live path (frontend `inventory-replenishment.js`, adapter `operation-system-db-api.js`, backend `16_/61_/01_router`). **Verdict = INVENTORY_AI_PLAN_PARTIAL.** The decisive finding: the Inventory "Generate AI Plan" button (`handleReplenAiPlan`) is a PURE page-state recommendation computation — it writes NEITHER table. Draft rows exist ONLY after a USER manually edits a route (`_saveAllocationDraftFromDom → _flushDraftDbPersist → KM.DB.upsertShippingAllocationDraft / upsertShippingAllocationDraftLines → 16_ handlers, router-bound 01_:434/438`). `"[GapJob] INVENTORY DONE"` is a gap materialization (`inventory_replenishment_gap`) with ZERO Draft-row persistence. A backend writer that WOULD make AI Plan persist Drafts — `weeklyAiPlan.generate → handleGenerateWeeklyAiPlanDraft_` (61_, router 01_:482) — exists but has NO frontend caller (the single owning seam for "AI Plan persists Drafts").

**13-item verdict matrix:**
| Item | Verdict | Owning function | Table(s) |
|---|---|---|---|
| AI Plan trigger | CONNECTED (page-state only; no DB) | `handleReplenAiPlan` | none |
| gap calculation | CONNECTED (gap table only) | `handleRecalcAllInventoryGap → startInventoryReplenishmentGapJob` | `inventory_replenishment_gap` |
| Draft header creation | PARTIAL (user manual edit only, not AI Plan) | `_flushDraftDbPersist → handleUpsertShippingAllocationDraft_` | `shipping_allocation_drafts` |
| Draft line creation | PARTIAL (user manual edit only) | `_flushDraftDbPersist → handleUpsertShippingAllocationDraftLines_` | `shipping_allocation_draft_lines` |
| deterministic reuse | CONNECTED (natural-key K3 dedupe) | `sadResolveActiveDraft_` (16_) | drafts |
| reload hydration | CONNECTED | `_restoreAllocationDraftFromSession → _hydrateAllocationDraftFromDb` | both |
| SPA remount hydration | CONNECTED | `mount() → _restoreAllocationDraftFromSession` | both |
| planned_qty edit | CONNECTED | `_saveAllocationDraftFromDom → _flushDraftDbPersist` | lines |
| line note edit | NOT CONNECTED (builder omits note) | `buildDraftLinePayload`; `updateReplenNote` page-local | none |
| header note edit | NOT CONNECTED (builder omits note) | `buildDraftHeaderPayload` | none |
| submit | NOT CONNECTED (no frontend caller) | backend `handleSubmitShippingAllocationDrafts_` exists | n/a |
| Shipment Draft handoff | NOT CONNECTED (comments only) | — | n/a |
| background result suppression | CONNECTED (gap-job resume silent) / N/A (AI Plan has no popup) | `_irResumeGapJobOnMount_` done() silent | n/a |

### 38.3 Owning seams (identified, DEFERRED to a future authorized round)
Fixing the PARTIAL/NOT-CONNECTED items requires WRITE-path wiring — explicitly outside this round's safety envelope (no AI Plan execution, no writes, `USER MAY_RUN_INVENTORY_AI_PLAN = NO`). Enumerated for a future round: (1) AI-Plan-persists-Drafts = wire `handleReplenAiPlan` → `weeklyAiPlan.generate` (single seam); (2) note persistence = add `note` to `buildDraftLinePayload`/`buildDraftHeaderPayload` (backend already accepts it, 16_:184/280); (3) Submit = wire `submitShippingAllocationDrafts`; (4) Shipment Draft handoff. None wired this round.

### 38.4 Read-only diagnostic (F)
`TEMP_R6D_DIAGNOSE_INVENTORY_AI_PLAN_CONNECTION()` (in the TEMP diagnostics file; not bundled). Reports runtime fingerprint/match; exact header hashes + schema match for BOTH shipping tables vs the frozen authority (HALTs `INVENTORY_SCHEMA_MISMATCH` if different — Objective G); header/line counts; active Draft count + status distribution; planning_cycle type/value distribution; orphan lines; duplicate `allocation_draft_id`; duplicate active natural keys; latest INVENTORY calc run (best-effort); `calculation_run_id`→header linkage; header→lines linkage; generation_type distribution; the runtime callers (edit/submit/handoff, read-only strings); zero-write confirmation; verdict `INVENTORY_AI_PLAN_{CONNECTED|PARTIAL|NOT_CONNECTED}`. Zero writes.

### 38.5 UX consistency note (E)
Inventory ALREADY matches Order Planning on the wired contracts: DB-first hydration on load/remount (no rerun of AI Plan), manual-only result behavior (its AI Plan shows no popup; gap-job resume is silent), Qty edits persist without a Save button, envelope-`.success` confirmation, natural-key dedupe (no duplicate active Draft), navigate-away/back restores DB values. The GAPS (AI-Plan-persists-Drafts, note persistence, atomic loading skeleton, conflict-safe note save) are the deferred write-path work in §38.3 — this round does NOT force the two pages to share tables/models; it shares only the lifecycle/UX contracts already in place.

### 38.6 Preserved contracts + safety
R6C navigation/provider fixes intact (`KM.RELEASE=r6c-navlifecycle-20260822`, single-visible-section, DB provider READY). R5D manual-only popup unchanged. Request-Order legacy DB / `request_order_allocation_draft_lines` untouched. No live DB mutation, no AI Plan run, no Submit/Send/Shipment-Draft, no tab rename/delete/clear. Current Request-Order Note evidence (T2 `123`, T3 empty) preserved.

### 38.7 USER verification
1. Hard-refresh once (loads `home.js?v=r6c-navlifecycle-20260822`). Navigate Home → Order Planning → click the Kitchen Mama Logo → returns to Home without a hard reload; `window.__kmLifecycleDebug().currentSection === 'home-section'` and `activeVisibleSectionCount === 1`; Tab to the Logo + Enter/Space also returns Home. 2. Run `TEMP_R6D_DIAGNOSE_INVENTORY_AI_PLAN_CONNECTION()` (read-only) → confirm `drafts_schema_exact=YES`, `lines_schema_exact=YES` (else it HALTs on a schema mismatch), the counts/linkage, and `verdict=INVENTORY_AI_PLAN_PARTIAL`, `R6D_ZERO_WRITE_CONFIRMED=YES`. Do NOT run the Inventory AI Plan or any write this round. HALT if: the Logo does not return Home through `switchTo`, two sections become visible, the diagnostic reports a schema mismatch, or any write is observed.

## 39. R6E-P0 — Shipping Plan schema failure + Method latency + structured error + Request Order Site Confirm temp bypass (2026-08-22)

Follow-up to R6C1. Preserves all prior Logo/nav/DB-provider/Inventory changes. Source/test/doc + read-only diagnostics only; NO live DB mutation, NO live Submit Plan, NO live Request Order Send, NO tab rename/delete/clear, NO automatic schema repair. Files: `km-api-foundation.js`, `inventory-replenishment.js`, `request-order.js` (frontend), `00_config.gs` + `TEMP_migrate_request_order_draft_v2.gs` (backend `.gs`), `index.html`. **No bundled core module changed → bundle unchanged (`6c47f4358e…`, 52 modules).** Full sweep 309 pass / 4 baseline / 0 new.

### 39.1 (A) Shipping Plan schema root cause — HALTED for USER authority decision
`Submit Plan` (Inventory page `submitReplenishmentPlans` → `KM.DB.createShippingPlansBatch` → router `createShippingPlansBatch` → `handleCreateShippingPlansBatch_`, 11_shipping_plan_handlers.gs) validates both Canonical sheets up-front via the fail-closed production-safety gate (29_ `prodRequireSheet_` → KMSAFE `classifySchemaMismatch`, which requires EVERY authority header present). The runtime authority `SHIPPING_PLAN_LINES_HEADERS_` (30 cols) diverges from the LIVE `shipping_plan_lines` (23 cols):
- **Missing (8, authority order):** `marketplace`, `snapshot_current_stock`, `snapshot_avg_sales_per_day`, `snapshot_days_of_supply`, `snapshot_suggested_qty`, `snapshot_target_days`, `snapshot_fc_context`, `snapshot_event_context`. **First rejected = `marketplace`.**
- **Extra in live (1):** `marketplace_seperate` (tolerated by `extraColumnsPolicy:'ALLOW'`; does not itself fail).
So the token is `PRODUCTION_SAFETY:HEADER_MISSING [shipping_plan_lines]`. `shipping_plans` (49 cols) matches its authority in order → PASSES; the failure is isolated to `_lines`. This is a THREE-way authority ambiguity (authority `marketplace` vs live `marketplace_seperate` vs the task-anticipated `marketplace_separate`) PLUS 7 required-but-absent snapshot columns. The task's decision rule resolves only the marketplace spelling; the 7 snapshot columns are unresolved. Neither full-fix path is permitted this round: (a) migrating the live table (live DDL) is forbidden (no live mutation / no auto-repair); (b) shrinking the authority + not writing those 7 fields would "silently discard line fields" (forbidden — the writer computes and writes them, 11_:415-421). **Per "HALT on any unresolved header authority ambiguity," the schema FIX is HALTED.** The read-only diagnostic + root cause are delivered; the USER must confirm the frozen canonical (rename authority `marketplace`→`marketplace_seperate` AND decide whether the 7 snapshot columns are retired (drop from authority) or required (a controlled live migration adds them)) before a controlled fix + deploy.

### 39.2 (A/B) Failed-Submit write-boundary — fail-closed, but NON-idempotent
Because both sheets validate BEFORE any append (11_:272-273, first write at :342), the failed Submit wrote **ZERO rows — no orphan `shipping_plans` header, no partial lines, no `submit_batch_id` record, no Shipment transfer** (proven by the write-boundary model test against the real KMSAFE gate). HOWEVER the writer is **NOT idempotent**: it mints random `SB-`/`SP-` UUIDs per call (11_:289/329), accepts no client execution key, and performs no find-or-reuse → a repeated identical Submit WOULD create a duplicate plan; there is no LockService/transaction/compensation. Idempotency is a real gap, **deferred together with the schema authority resolution** (both are 11_ writer changes needing the authority confirmed + a controlled deploy). `R6E_FAILED_SUBMIT_ZERO_ORPHAN_VERIFIED=YES`, `R6E_SHIPPING_PLAN_IDEMPOTENCY_VERIFIED=NO`.

### 39.3 (F-diag) `TEMP_R6E_DIAGNOSE_SHIPPING_PLAN_SCHEMA()`
Read-only (getSheetByName + getRange().getValues() only; no write/rename/repair). Reports: runtime fingerprint/match; both tabs' presence; actual RAW headers with index/type; expected authority (references the live `SHIPPING_PLANS_HEADERS_`/`SHIPPING_PLAN_LINES_HEADERS_` constants); missing/extra/duplicate/whitespace headers; spelling near-matches (surfaces `marketplace`↔`marketplace_seperate`); expected/actual hashes; row counts; exact authority file; the exact first rejected header; zero-write proof; verdict `SHIPPING_PLAN_SCHEMA_READY | SHIPPING_PLAN_SCHEMA_MISMATCH`.

### 39.4 (C) Structured save-error (no more `[object Object]`)
Root cause: `inventory-replenishment.js:2495/2503` did `new Error(hres.error)` where `hres.error` is the STRUCTURED envelope `{code,message,details}` from `_kmCmdErr_` → `String(object)` = `"[object Object]"`. Fix: `_irMakeDraftSaveError_(raw, table, fallback)` normalizes a string OR the envelope into an Error with a JSON-safe `.structured` {code, table, missingHeader, requestId, message}; `_irShowDraftSaveError` renders a concise user line ("Could not save to the database — kept locally. Please retry after the database configuration is verified.") + a COLLAPSED `<details>` disclosure (code / affected table / missing header / request id, all HTML-escaped) — never `[object Object]`, never a stack/token, and never "Saved" (the locally-retained draft is preserved).

### 39.5 (D) Method dropdown latency
The slow "Method" dropdown is the Inventory Execution-Plan route selector (`inventory-replenishment.js`), sourced from `carrier_rate_cards` via `_irLoadCarrierPlanning_` → the heavy `getWorkspace('inventoryReplenishment', {include:{carrierPlanning:true}})`. Before: fired on first row-expand only; no in-flight dedupe (N concurrent expands → N heavy fetches); a false "No available methods" shown during the await. **Before → after (critical path to a usable Method):** before = 1 heavy carrier fetch per expand, un-coalesced, triggered late (on expand); after = **1** preloaded fetch at mount (parallel with the primary read) + **in-flight dedupe** (concurrent expands share ONE fetch, proven by test) + module cache reused across SPA remount. UI states now: `Loading methods…` (in-flight) · real options (loaded+matches) · `No matching method` (loaded+empty) · `Unable to load methods — Retry` (error) — never a false empty before the lookup completes. Optimistic concurrency preserved; never a per-SKU lookup; not blocked on FC/inventory/chart hydration. (A bounded catalog-only read instead of the whole-workspace payload is a further optimization, deferred — it needs a new scoped API action.)

### 39.6 (E) Request Order Site Confirm temporary bypass (reversible, USER-authorized)
ONE logical flag across layers: backend owner-of-record `REQUEST_ORDER_SITE_CONFIRM_REQUIRED_` + `requestOrderSiteConfirmRequired_()` (00_config.gs, following the existing `..._` var + `camelEnabled_()` convention), mirrored to the frontend via the KM.api Foundation capability `KM.api.requestOrderSiteConfirmRequired()` / `setRequestOrderSiteConfirmRequired()` (km-api-foundation.js — the same mechanism the UI already uses to mirror backend authority, e.g. `workspaceApiActive`). Default-of-record TRUE; set FALSE this round. The Site Confirm gate is enforced FRONTEND-side (`handleSendRequest` Gate 1); `request-order.js` reads `_roSiteConfirmRequired()` (FAIL-SAFE TRUE if the capability is unavailable). When false: Gate 1 is skipped, the `_roIsRowConfirmed` row filter is dropped (a row is not excluded SOLELY for lacking Site Confirm), and `_roUpdateConfirmStatus` hides the "No site confirmed yet" label (the Confirm Site button was already removed from the UI). ALL other Send gates stay MANDATORY and unchanged: submitted-status protection, positive eligible line, valid quantities, canonical flat Draft + optimistic-lock token, deterministic execution key + duplicate protection, downstream schema, authorization. When true: the original Site Confirm UI + gate are restored EXACTLY (proven by `setRequestOrderSiteConfirmRequired(true)` + the fail-safe test). Affects Request Order ONLY — Weekly Shipping Plan / shipping allocation / Shipment Draft / other Submit rules are untouched.

### 39.7 Deployment manifest + safety
**Frontend deploy:** `index.html` + `assets/js/api/km-api-foundation.js` + `assets/js/pages/inventory-replenishment.js` + `assets/js/pages/request-order.js` (the 2 R6E-changed frontend assets' `?v=` bumped to the current `r6c-navlifecycle-20260822` release token so they load; request-order.js already on it). **Backend sync:** `assets/specs/active/apps-script/00_config.gs` (the site-confirm flag) + `TEMP_migrate_request_order_draft_v2.gs` (the R6E read-only diagnostic; not bundled). **No bundle rebuild, no bundled core / no `11_` writer change this round** (schema + idempotency deferred). NO live mutation, NO Submit/Send executed; current Request-Order Note evidence (T2 `123`, T3 empty) untouched; R6C nav/provider + R5D manual-only popup preserved.

### 39.8 (F) Controlled live runbook — USER-owned; DO NOT execute here
**Stage 1 — read-only diagnostics.** Run `TEMP_R6E_DIAGNOSE_SHIPPING_PLAN_SCHEMA()`; require `verdict=SHIPPING_PLAN_SCHEMA_READY` + `R6E_ZERO_WRITE_CONFIRMED=YES`. If it reports `SHIPPING_PLAN_SCHEMA_MISMATCH` (expected today: missing `marketplace` + 7 snapshot cols), STOP — decide the frozen canonical (rename authority `marketplace`→`marketplace_seperate` AND retire-or-migrate the 7 snapshot columns), apply the controlled schema fix in a follow-up round, redeploy, and re-run until READY. Do NOT Submit while MISMATCH.
**Stage 2 — Method verification.** Deploy the frontend; hard-refresh once. Select the same From/To route; record cold vs warm timing + request count (expect ONE `getWorkspace(...carrierPlanning)` preloaded at mount, reused on expand); require correct Method options + expected arrival, and that it shows `Loading methods…` (never a false empty) before resolving.
**Stage 3 — one Shipping Plan Submit** (only after Stage 1 = READY). Record `shipping_plans` + `shipping_plan_lines` row counts before; Submit ONE controlled plan; require exactly 1 header + expected N lines, no orphan, no duplicate; stop and report. (NOTE: the writer is not yet idempotent — do NOT retry Submit until the idempotency fix lands; a retry would duplicate.)
**Stage 4 — one Request Order Send with Site Confirm disabled.** Only after its Draft is submitted and ALL other Send gates pass; confirm `REQUEST_ORDER_SITE_CONFIRM_REQUIRED_ = false` (and the frontend mirror). Record `request_orders`/`request_order_lines`/`request_order_line_sources` before; Send once; validate the expected deltas (1 order + N lines + N sources); re-send once to validate REUSE / zero duplicate (execution-key idempotency); stop and report. Then restore `REQUEST_ORDER_SITE_CONFIRM_REQUIRED_ = true` when Send testing is complete.

## 40. R6D1 — Inventory AI Plan generation → persistence → hydration (STAGED, flag-OFF) + corrected run authority (2026-08-22)

Follow-on to R6D/R6E. Sequencing satisfied: PRE HEAD = origin/main = f066924 (contains R6C1/R6D d712989 + R6E), clean, 0/0. Source/test/doc + read-only diagnostics; NO live DB mutation, NO AI Plan run, NO Submit/handoff/orphan-repair/legacy-deletion. Files: `operation-system-db-api.js`, `km-api-foundation.js`, `inventory-replenishment.js` (frontend), `00_config.gs` + `TEMP_migrate_request_order_draft_v2.gs` (backend `.gs`), `index.html`. **No bundled core module changed → bundle unchanged (`6c47f4358e…`, 52 modules).** Full sweep 310 pass / 4 baseline / 0 new.

### 40.1 Corrected Inventory calculation-run authority (diagnostic fix)
The pre-R6D1 finder fell back to the latest `recommendation_calculation_runs` row and wrongly reported a MONTHLY_ORDER run (`RUN::RD::MONTHLY_ORDER…`, `recommendation_type=MONTHLY_ORDER`) as the "latest Inventory run". CORRECTED: the authoritative Inventory gap run lives in the **Script Property `GAP_JOB_INVENTORY`** (46_ gap job; runId `GAP-INV-{ts}-{seq}`, 43_ `gapRunId_`), NOT in `recommendation_calculation_runs`. `TEMP_r6dLatestInventoryRun_` now reads that property and reports run_id/status/calculation_date/calculation_month/planning_cycle/scope/finished_at; a MONTHLY_ORDER run is NEVER reported as Inventory; when no GAP-INV run exists → `NOT_FOUND` with an explicit MONTHLY_ORDER exclusion proof.

### 40.2 (A) Blank-cycle orphan freeze
`TEMP_R6D1_VALIDATE_INVENTORY_AI_PLAN_READY()` freezes every active header (all 30 fields + raw JS types + row number + linked line count + downstream refs) and classifies each as EMPTY_ORPHAN_SAFE_TO_CANCEL / VALID_MANUAL_DRAFT_MISSING_CYCLE / LINKED_DRAFT_REQUIRES_RECONCILIATION / AMBIGUOUS_HALT. The one live header (generation_type=user_created, status=draft, planning_cycle blank, 0 linked lines) classifies **EMPTY_ORPHAN_SAFE_TO_CANCEL**; it is NOT deleted/cancelled/updated/reused this round. It is inherently harmless to generation: 61_ matches drafts by a LITERAL nonblank-cycle scope, so a blank-cycle row can never be reused.

### 40.3 (B) Manual generation connection — 61_ contract + the missing seam (STAGED, flag OFF)
`weeklyAiPlan.generate → handleGenerateWeeklyAiPlanDraft_` (61_, router 01_:482) is a safe, purpose-built writer: scope = company+country only (marketplace fans out per-marketplace as readback context); the canonical nonblank planning_cycle is auto-resolved server-side via `gapCalcResolveContext_('INVENTORY')` (fail-closed `PLANNING_CYCLE_UNRESOLVED`); deterministic id `RD::WEEKLY_SHIPPING::<cycle>::<scopeKey>` (scopeKey = planning_cycle|company|country|marketplace|source_page, source_page=`inventory_replenishment`); find-or-reuse (0→CREATE / 1→REUSE / >1→BLOCKED_CONFLICT); 30s LockService; blank-cycle orphan never matched; recomputes lines live via KMHP (no materialized-gap dependency). The **missing seam was the frontend adapter** — added `KM.DB.generateWeeklyAiPlanDraft(payload) = _kmWeeklyCommand_('weeklyAiPlan.generate', payload)`. `handleReplenAiPlan` (the manual-click handler) now routes to it — but ONLY behind the backend-owned flag `INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_` (00_config.gs, **default OFF**) mirrored via `KM.api.inventoryAiPlanDbGenerationEnabled()` (km-api-foundation.js). Flag OFF (this round's default) → the button keeps its existing page-state-only behavior and writes NOTHING → **deploying R6D1 changes no live behavior**. No second writer, no duplicated algorithm.

### 40.4 (D) Generation result semantics
`_irClassifyGenerationResult_` maps the 61_ envelope truthfully: COMPLETED/PARTIAL → ok; NO_DEMAND → "no allocation needed"; BLOCKED_INPUT / per-marketplace BLOCKED_CONFLICT → blocked; FAILED → failed — always surfacing per-marketplace draftId/lineCount so a reported failure never conceals committed rows. `_irShowAiPlanResult_` shows a MANUAL-ONLY dismissible popup (business headline + a collapsed Technical-details `<details>` — no raw tokens in the headline). It is invoked ONLY from `_irRunInventoryAiPlanGeneration_` ← `handleReplenAiPlan` (manual click); no mount/resume path calls it → background/resume is silent, no restored popup after reload (test-proven: the only call-sites are inside the manual helper; `_irResumeGapJobOnMount_` never references it).

### 40.5 (E) Atomic hydration — wired
On a successful generation the handler reads the persisted rows back (`refreshCacheTables(['shipping_allocation_drafts','shipping_allocation_draft_lines'])` → `_hydrateAllocationDraftFromDb(_replenCtx())`) THEN `renderReplenishment()` — page state comes from the DB readback, not only the generation response; mount already restores on reload/remount (unchanged).

### 40.6 (C) planning_cycle Sheets coercion — analysis (writer NOT modified)
The weekly shipping-allocation writer (`rpoKeyedDeltaWrite_`) applies the `@`-text-format + flush + roundtrip only for the request-order flat V2 table (`isV2`), NOT for shipping_allocation_drafts. However the weekly id/cycle VALUES (`RD::WEEKLY_SHIPPING::…`, `RECO-YYYY-MM`) are NOT date/number-like, so the R5C coercion incident class does not apply (unlike R5C's bare `2026-08`). Per Objective C's "apply ONLY if not already protected AND needed", no writer change is made this round (avoids disturbing the shared live request-order writer); the live id/cycle roundtrip is a Stage-3 controlled-run check. `R6D1_PLANNING_CYCLE_ROUNDTRIP_VERIFIED = NO` (no writer roundtrip; not live-verified).

### 40.7 (F) Line/note edit + the DISCOVERED reconciliation gaps (controlled-run prerequisites)
planned_qty autosave exists for MANUAL routes (debounced upsert). TWO integration gaps block editing GENERATED lines and are surfaced (not papered over): **(i) GENERATED_LINE_ID** — 61_ writes lines by natural key with an empty `allocation_draft_line_id`; the frontend edit upserts by SADL id → editing a generated line would DUPLICATE. **(ii) HYDRATION_FIELD_MAP** — the hydrate reads `selected_source_warehouse_id`/`selected_destination_warehouse_id`/`selected_shipping_method`, which are not in the 30-col line schema, so generated-line From/To/Method hydrate blank (a pre-existing gap for all lines). There is also no line-note UI and `buildDraftLinePayload` omits `note`. These require either 61_ emitting stable line ids + the hydrate reading the schema columns, or a natural-key reconciliation — with live verification — and are DEFERRED. `R6D1_LINE_NOTE_AUTOSAVE_VERIFIED = NO`; generated-line planned_qty edit is a Stage-4 prerequisite.

### 40.8 (G) Automatic generation — DEFERRED (spec authority missing)
Audit: GAP-DONE is a fail-closed PRECONDITION GATE only (47_:53-62, unwired); the gap-job DONE handler triggers no generation (46_); inventory automatic draft persistence is EXPLICITLY forbidden as a "second engine" (47_:108-112, F1_6B:34); AI Plan draft generation is manual-only (R5D). Verdict: **AUTOMATIC_GENERATION_DEFERRED_SPEC_AUTHORITY_MISSING** — manual generation remains the only new (staged) mutation path.

### 40.9 Deployment manifest + safety
**Frontend deploy:** `index.html` + `operation-system-db-api.js` + `km-api-foundation.js` + `inventory-replenishment.js` (the 3 changed assets' `?v=` bumped to `r6d1-invplan-20260822` so they reload; KM.RELEASE unchanged — unrelated assets keep the R6C token). **Backend sync:** `00_config.gs` (generation flag, default OFF) + `TEMP_migrate_request_order_draft_v2.gs` (corrected run-finder + R6D1 validator; not bundled). **No bundle rebuild, no bundled core / no 61_/24_/16_ writer change.** NO live mutation; R6C/R6C1/R6E preserved; the flag being OFF means zero live behavior change on deploy.

### 40.10 (Runbook) Controlled USER live verification — DO NOT execute here
1. Deploy the frontend + sync `00_config.gs` (flag stays OFF) + the TEMP diagnostic. Hard-refresh once (new `?v=r6d1-invplan-20260822`).
2. Run `TEMP_R6D1_VALIDATE_INVENTORY_AI_PLAN_READY()` (read-only) → confirm schema hashes, `latest_inventory_gap_run` reads GAP_JOB_INVENTORY (never a MONTHLY_ORDER run), the blank-cycle orphan = EMPTY_ORPHAN_SAFE_TO_CANCEL, 0 duplicate ids / 0 duplicate active natural keys / 0 orphan lines, `R6D1_ZERO_WRITE_CONFIRMED=YES`, verdict INVENTORY_AI_PLAN_NOT_READY (staged; flag OFF + reconciliation gaps).
3. BEFORE any controlled run: close the F reconciliation gaps (61_ stable line ids + hydrate schema-column read) in a follow-up round and re-verify.
4. Only then, for ONE controlled generation: set `INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true`, click Generate AI Plan ONCE for a concrete company/country, record shipping_allocation_drafts/_lines counts before/after, require deterministic reuse on a second click (no duplicate id / no duplicate active natural key), verify the id/cycle roundtrip, then set the flag back to false. Submit / Shipment Draft / reservation remain OUT.

## 41. R6E1-R1 — Three-flag single authority + additive shipping_plan_lines migration + Submit idempotency + unified release (2026-08-22)

Follow-on to R6E/R6D1. PRE HEAD = origin/main = 6e0e9b2 (contains R6E f066924 + R6D1 6e0e9b2), clean 0/0. Source/test/doc + read-only diagnostics; NO production mutation, deployment, sync, Submit or Send. Bundle UNCHANGED (`6c47f4358e…`, 52 modules — no bundled core/supply-*.js edited). Full sweep 311 pass / 4 baseline / 0 new. The two deferred R6D1 Inventory reconciliation gaps are NOT implemented here.

### 41.1 (A) Three-flag config authority
`00_config.gs` posture aligned to the completed production reality: `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = true` (was false — the stale "DEFAULT OFF / unsupported until R4" comment is replaced with the PERMANENTLY-TRUE / canonical-53-col cutover-complete note + the "never revert to legacy against the 53-col table" warning); `REQUEST_ORDER_SITE_CONFIRM_REQUIRED_ = false` (unchanged, USER-authorized temporary); `INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false` (unchanged, staged). Editing the source mirror is not a live mutation (deploy is USER-owned) and matches the live posture.

### 41.2 (B) Single flag authority + capability transport
No config/capability endpoint existed (audit: the frontend hardcoded mirrors; flat V2 had NO frontend flag — it is shape-agnostic). Added the ONE wire channel: read-only router action `getClientCapabilities` (01_ doGet+doPost) → `handleGetClientCapabilities_` (03_) returns `{ capabilitiesVersion, requestOrderDraftV2FlatCutover, requestOrderSiteConfirmRequired, inventoryAiPlanDbGenerationEnabled }` from the `*_()` getters (owner-of-record 00_config.gs); booleans + version only (no secrets/ids/rows), ZERO mutation. Frontend: `km-api-foundation.js` gains the flat-V2 mirror + a SINGLE `applyClientCapabilities(caps)` apply path (fed from one place, not three independent hardcodes) + `getClientCapabilitySnapshot()`; `operation-system-db-api.js` gains `KM.DB.getClientCapabilities()` + the `_kmApplyClientCapabilities_` bootstrap + `window.__kmCapabilities()` / `window.__kmVerifyCapabilities()` diagnostics; `app.js` calls the bootstrap at init (READ-ONLY, via the KM.DB legacy surface — app.js never references the Foundation directly, preserving the compat invariant). FAIL-SAFE defaults on any unavailability: flat V2 = true (FLAT_V2, never legacy against the 53-col table), site confirm = true, inventory generation = false. Deploy-ordering note: sync the backend (00_config + 03_ + router) BEFORE the frontend so the endpoint is reachable and the effective site-confirm=false is applied (a frontend-first partial deploy fails safe to site-confirm=true, i.e. re-requires confirm — the safe direction, but it would temporarily undo the R6E Send bypass).

### 41.3 (C/D) Additive shipping_plan_lines schema migration (TEMP, NOT executed)
The source authority `SHIPPING_PLAN_LINES_HEADERS_` is already the 30-col canonical set (marketplace + 7 snapshot); the live sheet is 23 cols (marketplace_seperate + missing the 8). `TEMP_R6E1_{DRY_RUN,EXECUTE,VALIDATE}_MIGRATE_SHIPPING_PLAN_LINES_SCHEMA()` added: DRY_RUN (read-only) freezes target-match + shipping_plans-exact + the exactly-8 missing + legacy-extra + no dup/whitespace + row-count + preserved-region checksum → verdict READY_TO_EXECUTE; EXECUTE reruns preconditions, appends ONLY the 8 missing headers via the S0-3 migration-only twin `prodMigrateAppendColumns_` with a valid Migration authorization DTO (old/new FNV header hashes computed + verified), flushes, rereads, fails closed on any drift (col count ≠ 31, row-count change, preserved-checksum change, canonical-not-present, legacy-extra-gone); VALIDATE (read-only) asserts count=31, 30 canonical present, legacy extra present, existing rows preserved, the READ loader gate passes → verdict MIGRATION_VALIDATED. Post-migration physical order = live-23 + 8 appended (marketplace at col 24, not authority col 5).

### 41.4 (C/E) WRITE-gate alignment — the ordering nuance (key design decision)
`classifySchemaMismatch` enforces ORDER (expected must be the leading in-order prefix; precedence before the extra-columns policy). An append-at-right-edge migration therefore leaves the STRICT ordered gate at HEADER_ORDER_MISMATCH (marketplace_seperate sits at index 4 where the authority expects marketplace) — so the additive migration alone would NOT unblock Submit. Resolution: `handleCreateShippingPlansBatch_` now validates `shipping_plan_lines` with the PRESENCE-based (order-tolerant) gate `prodRequireSheet_(ss,'shipping_plan_lines',[])` + `prodRequireColumns_(lineSheet, SHIPPING_PLAN_LINES_HEADERS_)` — exactly the pattern the READ owners (40_/60_) already use — which is SAFE because `shippingPlanAppendByHeader_` writes by header NAME, not position. `shipping_plans` keeps its strict ordered canonical gate (its 49-col live schema is order-valid). This still FAILS CLOSED (MISSING_REQUIRED_HEADER) on the current live 23-col sheet (missing 8), so deploying changes NO live behavior until the USER-owned migration runs.

### 41.5 (E) Submit idempotency
`handleCreateShippingPlansBatch_` now accepts a client `submit_batch_id` / `execution_key` and serializes the whole check-then-act under `LockService.getScriptLock().tryLock(30000)` (try/finally release — project convention). Find-or-reuse (pure `shippingPlanClassifyBatch_` over re-read rows): no header carries the key → CREATE exactly one batch stamped with the key; same key + equivalent payload (pure `shippingPlanBatchSignature_` over `[country|ship_from|destination|shipping_method|marketplace|sku|requested_qty]`, company excluded because server-resolved) → REUSED (zero writes); same key + different payload → SUBMIT_EXECUTION_DUPLICATE_CONFLICT (fail-closed, no blind retry); header(s) exist but zero lines while payload has lines → COMMITTED_UNVERIFIED. Random SP/SPL ids only on first creation. Frontend (`inventory-replenishment.js`): one stable `submitExecutionKey` per Submit intention, generated once, stored on the working draft (a re-render/navigation never mints a new key), reused on retry, dropped only on a confirmed Decision Commit (`_clearAllocationDraft`). Concurrent identical Submit → one plan only (modelled: lock serializes; second call sees the existing batch → REUSED). Live Submit remains OUT (`USER MAY_RETRY_ONE_SHIPPING_PLAN_SUBMIT = NO`; still schema-blocked pre-migration).

### 41.6 (F) Canonical snapshot mapping
New `shipping_plan_lines` already write canonical `marketplace` (never `marketplace_seperate`) + all 8 snapshot columns. Added `shippingPlanSnapshotValue_`: an object/array `snapshot_fc_context` / `snapshot_event_context` is serialized as canonical JSON (never the useless "[object Object]"); primitives pass through; null/undefined → ''. Existing rows untouched; nothing new is written into `marketplace_seperate`.

### 41.7 (G) R6D1 preservation
GAP_JOB_INVENTORY run authority, the blank-cycle EMPTY_ORPHAN_SAFE_TO_CANCEL orphan, `INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false`, no live AI Plan / no automatic generation / no Submit-handoff, and the R6D1 adapter + validator all remain intact. The two deferred reconciliation gaps (GENERATED_LINE_ID, HYDRATION_FIELD_MAP) are NOT implemented here. R6D1 package is NOT claimed ready.

### 41.8 (H) Unified release authority
`KM.RELEASE = 'r6e1-flags-shipping-20260822'`. The materially-changed frontend assets carry that `?v=` token: namespace.js, operation-system-db-api.js, km-api-foundation.js, inventory-replenishment.js, app.js. Unchanged assets keep their prior tokens (request-order.js / home.js / lifecycle.js at r6c) — the runtime release gate reads KM.RELEASE regardless of any single asset token; `__roDebug().release` / `__kmLifecycleDebug().release` both surface it. No changed asset remains on a stale r6d1 token. The R6C token-pin test was updated (namespace + db-api now r6e1; lifecycle legitimately still r6c).

### 41.9 (I) Preflight + deployment
`TEMP_R6E1_PREFLIGHT_SHIPPING_PLAN_RELEASE()` (read-only) reports target match, the three effective flag values + source/precedence/agreement, RO canonical schema = 53, flat loader authority = FLAT_V2, shipping-plan header/line migration state, required/extra headers, submit execution-key readiness, duplicate submit_batch_id groups + orphan headers/lines, the backend-declared unified release signature, R6D1 flag-stays-false, zero-write; verdicts READY_FOR_SCHEMA_MIGRATION / READY_FOR_CONTROLLED_SHIPPING_SUBMIT / CONFIG_AUTHORITY_MISMATCH / HALT. **Frontend deploy:** index.html + namespace.js + operation-system-db-api.js + km-api-foundation.js + inventory-replenishment.js + app.js. **Backend sync:** 00_config.gs + 01_router.gs + 03_master_data_handlers.gs + 11_shipping_plan_handlers.gs + TEMP_migrate_request_order_draft_v2.gs. No bundle rebuild. All deferred/live steps stay USER-owned.
