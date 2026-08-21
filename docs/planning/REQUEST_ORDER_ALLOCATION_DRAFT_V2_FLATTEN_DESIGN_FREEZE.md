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

**DONE (pure core, tests-only — no live DB / no shared-engine / no frontend change):** `assets/js/core/supply-planning-request-draft-v2.js` (KMRDV2) implements the frozen contract as a **standalone MONTHLY_ORDER-specific pure module**: the 53-column `V2_HEADERS`, `normalizePlanningCycleMonthly` (YYYY-MM validate/normalize, datetime/slash/weekly rejected), deterministic `draftId`/`naturalKey`, `nonActionableGate`, `projectFlatDraftRow`, `deriveHeaderStatus`, `applyTierEdit`/`applySubmit`/`applyCancel`, `reuse`/`refresh`/`regenerate`, `explodeSendRequestLines`, and the migration `classifyLegacyDraft`/`detectActiveConflicts`/`flattenLegacy`/`summarizeMigration`. Test: `request-order-draft-v2-flatten-f1-7n-fa-3c-draft-model-r2.test.js` (95 assertions, the R1 28-item contract). NOT added to the Apps Script bundle (`90_` unchanged) — it is not yet wired into the `.gs` runtime.

**HALTED → R2b (CANONICAL BLOCKER, not resolved by R1):** the live-path wiring (route MONTHLY_ORDER generation/readback/edit/submit/Send through KMRDV2 in `47_`/`24_`/`15_`/`request-order.js`; bundle rebuild) is deferred because the recommendation-persistence engine (`KMPB`/`KMPPB`/`KMPR`/`KMPC`) and the shared draft-id/scope core are **shared with WEEKLY_SHIPPING**, which has genuine variable per-source lines and a **`YYYY-Www`** planning_cycle — so the flat MONTHLY model cannot be implemented by modifying the shared engine or shared id core (YYYY-MM normalization there would break WEEKLY). **R2b must first decide the coexistence contract:** MONTHLY_ORDER routes to the KMRDV2 flat path while WEEKLY_SHIPPING stays on the line engine; divergent readback DTOs; type-scoped schema-gate expectations for the flat table. Until then, no runtime write path targets the flat table and the live model is unchanged.

**PRE3-R3 note:** the type-scoped authorized-schema gate is already present in HEAD by content (no forward-port needed); the outstanding item is the USER Apps Script *sync/deploy* of `24_`+`90_`, plus `recommendation_calculation_runs` provisioning — both still required by the eventual V2 wiring.
