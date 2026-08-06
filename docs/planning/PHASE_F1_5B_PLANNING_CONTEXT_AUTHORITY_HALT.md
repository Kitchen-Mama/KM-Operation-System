# Phase F1-5-B — Planning Context Authority Runtime — Authority Matrix + HALT

> **⏭ SUPERSEDED — RESOLVED FOR PHASE 1 (2026-08-06, Round F1-5-BD).** The three unresolved authorities below were
> closed by explicit Phase-1 business decisions **D-F1-5B-1 (destination = explicit caller input), D-F1-5B-2
> (demandDriver = FORECAST), D-F1-5B-3 (forecast anchor = M, window M+1..M+4, Regular FC only)** — see
> `SUPPLY_PLANNING_DECISION_REGISTER.md` and `PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md` §I. The Planning Context
> Runtime is IMPLEMENTED (`supply-planning-planning-context.js`, F1-5-BD). This document is retained **as historical
> evidence** (the audit that motivated the decisions) — not deleted. Automated destination routing (`replenishment_
> route_rules`) and Sales-driven policy remain **Phase 2**.

> **Status: AUTHORITY AUDIT COMPLETE — IMPLEMENTATION HALTED (2026-08-06).** Per §3 (source-proven matrix first)
> and §4 (HALT gate), this is the deliverable. The round's premise — *close the four F1-5-A seams using existing
> canonical mapping and frozen business rules* — does **not hold** for three of the four: their canonical source is
> **future / spec-only / not-live** (destination), or **no frozen rule/column exists** (demand-driver classifier),
> or **the rule has no pinned anchor** (forecast weight). Each trips a distinct §4 HALT condition. Because
> destination is required by **every** context and is itself unresolved, §4/§19 forbid a partial public runtime →
> **no runtime code written.** A/B/C options + a recommendation are given per decision. Evidence is code/spec-cited.

---

## A. One-line result

The Planning Context Authority Runtime cannot be built to *eliminate caller guesswork for real production scopes*
this round, because the authorities it must read do not yet exist as live/frozen canonical sources:
**destination** must come from `replenishment_route_rules` — a table CARRIER_AND_ROUTE_SPEC §5A calls **"the future
source"** and whose resolver is **"Spec only — no runtime engine exists"**; the **Sales-vs-Forecast driver** has no
stored column and no frozen classifier rule; and the **§7 rolling-4-month FC-share anchor** is not pinned. F1-5-A's
seams are therefore the *correct* current boundary, not a defect to close this round.

---

## B. §3 Authority matrix (source-proven)

| Context fact | Active owner (cite) | DB / source | Fields | Classification |
|---|---|---|---|---|
| destinationWarehouseId | SC-11.3 **D-3** (caller/planning-scope-owned, "never inferred"); future automated source = `replenishment_route_rules` (CARRIER_AND_ROUTE_SPEC §5A) | `replenishment_route_rules` — **future/not-live** (`INVENTORY_TABLE_MAPPING_SPEC.md:44`, `CARRIER_AND_ROUTE_SPEC.md:537,555`); today manual entry | — | **DB_MAPPING_REQUIRED** (canonical source not live) |
| planningCycle | SC-3.3 scheduler/caller run parameter | `recommendation_calculation_runs.planning_cycle` / caller | `planning_cycle` | **SOURCE_PROVEN_EXISTING** (always caller/scheduler-supplied — not derived from source data) |
| windowStartDate / windowEndDate | §26 Exact-Date Window (Engine A) / §27 tiers | derived from `calculationDate` + `requiredByDate` | — | **DERIVABLE_BY_FROZEN_RULE** (given a required-by date) |
| windowCode | Weekly grain (persistence repo `WEEKLY_LINE_KEY`); §27 tier for Monthly | draft-line `window_code` / `request_month`+`request_bucket` | `window_code` | **DERIVABLE_BY_FROZEN_RULE** (given planning cycle + required-by) |
| requiredByDate | §26/§27 consume it; §10 event pull-forward; **no producer** from planning cycle | demand-row specific; `fc_special_events` for events | — | **DERIVABLE_BY_FROZEN_RULE for Regular (window end)** / event via §10 owner; but demand-row-scoped, not a scope-level fact |
| demandDriver (Sales/Forecast) | §2C/§2D/§20.5 **use** it; **no classifier owner** and **no stored column** | none (grep: no `demand_driver`/`sales_driven`/`forecast_driven` field in `DATABASE_RELATIONSHIP_MAP.md`) | — | **BUSINESS_DECISION_REQUIRED** (no source-proven classifier — §9 / condition 6) |
| forecastWeightAnchor | §7 "rolling future 4-month FC window" — **anchor not pinned** | `fc_regular_forecast` (data exists) but window anchor undefined | month cols `jan..dec` | **BUSINESS_DECISION_REQUIRED** (multiple possible anchors — condition 7) |
| forecastShareQty | §7/§24.5 SKU FC ÷ Company Total FC | `fc_regular_forecast` | month cols | **BLOCKED** by demandDriver + anchor above |

Fully implementable *given* the three blockers resolved: the window/tier classification is already frozen and
callable (`classifyRequiredByWindow`, `supply-planning-calculations.js:572`, §27A) — it only lacks a produced
`requiredByDate`, which for a Regular context = the planning-window end (derivable) but for the scope-level context
depends on the demand grain and, upstream, on the destination + driver decisions.

---

## C. The three unresolved authorities (§4 HALT — conditions 4, 6, 7)

### C-1 · destinationWarehouseId — canonical source not live (condition 4)
- **D-3 (SC-11.3) freezes destination caller/planning-scope-owned and forbids inference** from country / marketplace
  / `warehouse_code` / first-matching / display name / previous shipment / array order / default FC.
- `DATABASE_RELATIONSHIP_MAP.md:599`: `ship_from`/`destination` on shipments/plans are **"human-readable snapshots
  only — NEVER the authoritative identity, and identity is NEVER inferred from them."** They are per-transaction
  choices, not a `(company,country,marketplace,sku) → warehouse_id` planning mapping.
- The intended automated planning source is **`replenishment_route_rules`** (CARRIER_AND_ROUTE_SPEC §5A), but it is
  **"the future source"** (INVENTORY_TABLE_MAPPING_SPEC §11.2 / :44 "First version allows manual entry") and its
  resolver is **"Spec only — no runtime engine exists"** (CARRIER_AND_ROUTE_SPEC :555). It is not a live table.
- ⇒ Destination cannot be resolved from a live canonical mapping this round. Implementing it would require **creating
  the `replenishment_route_rules` table + reader** (a new DB table — forbidden §18) **or** a **business routing
  decision**. Every context needs a destination, so this alone blocks a production-ready context runtime.

### C-2 · demandDriver (Sales vs Forecast) — no source-proven classifier (condition 6)
- §2C/§2D/§20.5/§24.4 and the mode matrix (§ line 130/151-154 A/B/C/D) all **consume** the Sales-Driven /
  Forecast-Driven property but **none defines the classifier**. `SUPPLY_PLANNING_CALCULATION_RULES.md:589` treats it
  as a pre-existing SKU property ("missing Forecast on a Forecast-Driven SKU → blocked" — i.e. it does *not* fall back
  to sales, so data-presence is **not** the classifier).
- No stored column exists (`DATABASE_RELATIONSHIP_MAP.md` has no `demand_driver`/`sales_driven`/`forecast_driven`/
  `planning_mode` field; broad doc sweep finds only *usages*, never a field/rule that *decides* it).
- ⇒ §9 applies verbatim: **`DEMAND_DRIVER_AUTHORITY_UNRESOLVED`, HALT the Forecast-weight portion, do not default.**

### C-3 · forecastWeightAnchor (§7 rolling-4-month) — no pinned anchor (condition 7)
- §7 line 339: "use a **rolling future 4-month FC window** for FC share" — but the **anchor** (which 4 months, relative
  to the calculation date/planning cycle) is **never pinned**. Candidates: §27 Engine-B tiers **Month+1..Month+4**
  (the only frozen 4-month forward window in the canon) vs a **Month 0..Month+3** current-inclusive window. §7 does not
  cite §27 as its window, so the equivalence is an *inference*, not a frozen rule.
- Also unresolved by §7 alone: Special-Event inclusion in the *share* basis (§7/§442 add events once, not through the
  share — suggesting Regular-only), and missing-month = zero vs missing-source.
- ⇒ Downstream of C-2 (only Forecast-driven receivers need it); `FORECAST_WEIGHT_ANCHOR_UNRESOLVED`.

---

## D. §4 A/B/C options + recommendation (per decision)

### Decision 1 — Destination authority
- **A. Provision `replenishment_route_rules` now** (schema + injectable reader) and derive destination from the
  matching route-default row. *Cost:* new DB table + reader; the Carrier Price/route engine is spec-only — **new
  schema is forbidden §18**; a full build is out of this round's "existing mapping" premise.
- **B. Keep destination caller-owned** (D-3 authority #1 explicit Manual selection / #2 persisted-plan destination on
  regeneration); the context runtime *accepts* it and emits `MISSING_DESTINATION_WAREHOUSE` when absent (= F1-5-A
  seam). *Cost:* does not eliminate caller input, but is exactly D-3's frozen contract; no schema.
- **C. Decision-only schema freeze of `replenishment_route_rules`** this round (columns + grain, no data, no runtime),
  then a later reader round derives destination. *Cost:* a schema-freeze decision; still no live data this round.
- **RECOMMEND B now (faithful to D-3) + authorize C as the path** to eventually eliminate the seam. Do not do A this
  round (schema forbidden).

### Decision 2 — Demand-driver classifier
- **A. Add a canonical stored classifier** (e.g. `sku_regional_details.demand_driver` or `marketplace_skus.
  demand_driver`, enum {SALES,FORECAST}). *Cost:* new DB column (forbidden §18) + a data-population/ownership decision.
- **B. Freeze a derivation rule** (e.g. Forecast-driven iff a canonical planning flag is set; else Sales-driven).
  *Cost:* no such flag exists; §589 forbids data-presence as the rule → this is really Decision A in disguise.
- **C. Keep driver caller-owned (seam)** = F1-5-A; Manual/Automatic Recommend supplies it. *Cost:* forecast-weight
  stays blocked until A lands.
- **RECOMMEND A (a stored `demand_driver` classifier) as the real fix** — it is a bounded DB + ownership decision — with
  **C as the interim**. Never default (§9).

### Decision 3 — Forecast weight anchor
- **A. Anchor = §27 Engine-B tier window (Month+1..Month+4), Regular FC only** (reuse the only frozen 4-month forward
  window; events excluded from the share per §7/§442). *Cost:* needs an explicit spec confirmation that §7's window
  == §27 T1-T4 (currently an inference).
- **B. Anchor = calculation month + next 3 (Month 0..+3).** *Cost:* no citation supports the current-inclusive form.
- **C. Keep anchor as a caller seam (`forecastShareQty`)** = F1-5-A. *Cost:* forecast weight stays caller-supplied.
- **RECOMMEND A**, conditional on a one-line spec confirmation that §7 "rolling future 4-month" ≡ §27 T1-T4
  (Month+1..+4), Regular-FC-only, missing-month = missing-source (not 0). Until confirmed, keep C.

---

## E. What can still be implemented safely (per §4 close-out)

Independently of the three blockers, these are already frozen/derivable and would slot in cleanly **once destination +
driver are resolved**: `planningCycle` (caller run-param), `windowStartDate`/`windowEndDate` + Engine-A bucket / Engine-B
tier classification via the **already-implemented** `classifyRequiredByWindow` (§27A, `calculations.js:572`), and the
Regular-context `requiredByDate` = planning-window end. **But §19 forbids exposing a partially-ready public production
path while destination (needed by every context) is unresolved**, so no `resolveRecommendationPlanningContext` public
runtime is created this round. F1-5-A's seams remain the correct, honest boundary; nothing is guessed or defaulted.

---

## F. Readiness for the downstream rounds

- **F1-4B-PRE** (feed producer facts through the production-source builder from raw canonical scope): **still blocked
  for fully-automated production scopes** by Decisions 1–3; works today only when the caller supplies destination +
  driver (+ forecast basis) — i.e. the F1-5-A seam path, which is already integrated (`request.allocationFactsInput`).
- **F1-4B** (read-only API seam): unchanged — reachable once F1-4B-PRE has real facts; the API itself is a separate
  authorized round.

---

## G. Governance

No runtime/API/page/persistence/DB/schema/header change; no new formula; no bundle change; no source-reader change; no
live DB access. Read-only audit; docs-only checkpoint. F1-5-A (commit `83afd10`) unchanged and green. No push, no
deploy. Full suite unchanged (84 files / 0 failing); Golden Matrix 39/1/0; Scenario #34 Pending.
