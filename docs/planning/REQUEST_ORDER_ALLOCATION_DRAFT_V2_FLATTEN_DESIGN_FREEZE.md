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
