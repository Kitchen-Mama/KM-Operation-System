# Supply Planning Calculation Rules

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** the **single formula SSOT** — all math, time windows, tiers, rounding.
> - **Canonical Owner For:** Engine A / Engine B; **T1–T4** (T4 = display-only, never in Request/PO payload); **Normal Sales Days** (latest 30 eligible normal days within a 90-completed-day window); Forecast Adjustment; Inventory Projection; Shortage; Reallocation; Net Order Need; **Shipping carton = FLOOR**; **Ordering carton = CEILING**; Engine `Current Stock` semantics.
> - **Not Owner For:** DB schema (`DATABASE_RELATIONSHIP_MAP.md`), UI/layout (`INVENTORY_TABLE_MAPPING_SPEC.md`), runtime cadence (`SYSTEM_RUNTIME_ARCHITECTURE.md`), Shipment/PO lifecycle (respective specs). No other doc may restate a divergent formula.
> - **Status:** Reviewed — B-1 / B-2 / B-3 RESOLVED; **B-4 CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED** (Qualified Incoming business predicate §2E + external-origin admission gate §38 resolved; Qualified Incoming **Runtime** pending); B-5 / B-6 / B-7 / B-8 UNRESOLVED (formulas finalized).
> - **Current Version:** v4.5 (v4.1 base — Batch A header, Batch B Round 1 B-1 reserve cross-reference, Phase 2B Pre-Engine §22/§29E/§33 reconciliation, all no-formula-change — **plus the Round 6B dependency catch-up landing (2026-07-31): Round 5A §27A Required-By classifier (v4.2) + Round 6A §32A reallocation-eligibility contract (v4.3) + Round 6 implementation status. `evaluateReallocationEligibility` IMPLEMENTED; Golden #21/#22 executed; Matrix 23 executed / 17 pending / 0 canonical-blocked; Unit 282 / Golden 114 PASS. Line Runtime / Qualified Incoming Runtime NOT IMPLEMENTED; B-4~B-8 unchanged** — **plus Round 8A (2026-08-01): §34A Missing / Stale Data pure-classifier `classifyPlanningDataState` canonical contract freeze (documentation only) — then Round 8B (2026-08-01): `classifyPlanningDataState` IMPLEMENTED in the pure core and landed to Main; Scenario #29/#30 executed; Matrix 25 executed / 15 pending / 0 canonical-blocked; Unit 325 / Golden 117 PASS (run from Main); Line Runtime / Qualified Incoming Runtime / DB / API / UI remain NOT IMPLEMENTED; B-4~B-8 unchanged** — **plus Round 4D-C (2026-08-01): landed §38 External-Origin Planning Admission Gate; B-4 = CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED (registry owner `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11); documentation only, no formula/runtime/test change; Matrix 25/15/0; Unit 325 / Golden 117 unchanged; B-5~B-8 unchanged**).
> - **Last Reviewed:** 2026-08-01.
> - **Depends On:** none (upstream formula authority).
> - **Blocked By:** Batch B — Qualified Incoming / On-the-way status allowlist (see `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-4).
> - **Reserve boundary (cross-reference only — B-1 RESOLVED, owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1):** calculation / recommendation output (shortage, Net Order Need, Recommended Shipping Qty, reallocation, etc.) **never reserves or deducts stock**. Factory-stock reservation is triggered **only** by a successful **Formal Shipment Execution Commit** (decision only; implementation not started). This document owns no reserve logic and defines none.

> **Changelog v4.1 (2026-07-30 — Phase 2B Pre-Engine Normalized Avg Sales readiness cleanup, NO version bump / NO formula expansion):** Reconciled the stale §22 "weekly default" wording with the already-adopted **§29E** and **§33 Scenario #1–#5 / #35–#40** so there is **one** Sales-Driven basis. §22 intro + **§22.1** now state the Sales-Driven default **IS** the normalized sampling ladder (latest 30 eligible normal days within the latest 90 completed days, ÷ actual `normal_day_count`); **§22.2** reframed from "exception when contaminated" to the **contamination EXCLUSION rules within** that sampling; **§22.3** no-contamination bullet corrected — no contamination = **zero excluded dates**, the ladder still applies, and `weekly_7d` is **only** the `< 3`-normal-day fallback rung (never a no-contamination default). Per-SKU exclusion, Campaign∩Event count-once, cancelled/invalid-not-excluded, Preparation-Date-not-contamination, zero-sales-day vs missing-day, and the decoupled `source`/`warning` fields are all **unchanged**. §22.4/§22.6 Forecast-Driven-reference-only + Runtime-recompute wording unchanged. **Runtime remains NOT IMPLEMENTED; Executable Tests PENDING; no engine, no §33 change, no Batch B decision.**
>

**Status:** ✅ **FINALIZED v4.5 — Calculation Specification** (v4.1 = v4.0 freeze + §22 Avg. Sales/day sample-acquisition refinement; v4.2 = Round 5A §27A Required-By Window classifier canonical gap closure; v4.3 = Round 6A §32A Reallocation Eligibility owner boundary + public contract freeze; Round 6 = §32A predicate IMPLEMENTED + Golden #21/#22 executed — landed to main by the Round 6B dependency catch-up; v4.4 = Round 8A §34A Missing / Stale Data pure-classifier `classifyPlanningDataState` canonical contract freeze — documentation only)
**Runtime Status:** **NOT IMPLEMENTED** (the pure §27A classifier, §32A eligibility predicate, and §34A `classifyPlanningDataState` classifier are implemented in the pure calculation core and run from Main; no Line Runtime / Qualified Incoming Runtime / DB / API / UI / production orchestration)
**Executable Test Status:** **§27A/§32A/§34A pure core = 325 unit + 117 golden PASS, run from Main (25 executed / 15 pending / 0 canonical-blocked); Scenario #29/#30 executed (Round 8B); full 40-scenario matrix still PENDING (the 15 remaining scenarios need non-pure-core owners)**
**Browser / Production Verification:** **PENDING** (no runtime, therefore nothing to verify)
**Last Updated:** 2026-08-01
**Maintained By:** Development Team
**Authoritative formula owner:** THIS document. All other specs reference or map these formulas; none may restate a divergent version.
**Related:** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md) (operational flow), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) (table relationships), [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) (Inventory Table mapping + AI Suggestion display), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md`](./RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md)

> **Changelog v4.4 → v4.5 (2026-08-01 — Round 4D-C: External-Origin Planning Admission Gate canonical landing; documentation only, NO formula / runtime / test change):** Added **§38** as the owner of the **planning-admission requirement**. An externally originated OMS/WMS/platform inbound/outbound with no accepted KM lineage is **quarantined** and contributes **0** to Qualified Incoming / committed supply / Current Stock / Reserved Stock / Replenishment / Order Recommendation until an explicit human **Adopt** creates KM canonical lineage. `fresh=true`, positive quantity, present ETA, accepted external status, and a stable external ID **never** authorize admission. **Linked** external evidence never contributes separately; **stale** unlinked records stay visible + quarantined at 0; §38 is a **pre-gate** to the unchanged **§2E** ten-gate predicate; the §34A generic `STALE_SNAPSHOT` warn-and-proceed classifier must **not** be used to admit an external operation. Recorded the future §33 external-origin business scenarios (fresh-unlinked=0, stale-unlinked=0, adopted→resulting KM Shipment may qualify, linked never duplicates, rejected=0). **No formula changed; §33 #12/#13/#14 remain IMPLEMENTATION_PENDING; Matrix 25/15/0; Unit 325 / Golden 117 unchanged; B-4 = CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED (registry owner `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11); B-5~B-8 unchanged.**
>
> **Changelog — Batch B Round 4C-R2 B-4 Contract Repair (2026-08-01 — Qualified Incoming contract alignment; documentation only, NO formula / runtime / test change, semantic version stays v4.4):** Aligned the **§2E Qualified Incoming business predicate** to the frozen **ten-gate** form and cross-referenced the **per-table** qualified allowlist owners (Shipment = `SHIPMENT_CENTER_SPEC.md` §10; PO / committed supply = `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §P1-B). Froze the **interim ETA authority** (`shipment_events` NOT IMPLEMENTED ⇒ active source = `shipments.eta`, lead-time fallback; §2F). Reaffirmed **count-once**, **Delivered ≠ Received**, **late/missing ETA contribute 0**, and **`unreceived_qty` = derived, never persisted**. Marked **B-4 = PARTIALLY RESOLVED (contract repaired)** with Runtime / receiving-layer / `shipment_events` ETA / `destination_warehouse_id` persistence / `wh_on_the_way_qty` double-count as **IMPLEMENTATION_REQUIRED**, and **cancel/release = B-8**, **source grain = B-5** kept separate. **No formula changed; §33 #12/#13/#14 remain IMPLEMENTATION_PENDING; Matrix 25/15/0; Unit 325 / Golden 117 unchanged; B-5~B-8 unchanged.**
>
> **Changelog — Round 8B implementation (2026-08-01 — §34A Pure Classifier Implementation + Golden #29/#30 Execution + Main Landing; implementation + tests only, no rule change, semantic version stays v4.4):** Implemented the frozen §34A contract as the pure export `classifyPlanningDataState` in `assets/js/core/supply-planning-calculations.js` — `{ state, calculationAllowed }`; five state tokens (`OK` / `STALE_SNAPSHOT` / `MISSING_SNAPSHOT` / `MISSING_FORECAST` / `MISSING_SALES_BASIS`); precedence missing-snapshot ▸ missing-demand-basis ▸ stale (STRICT `age > threshold`) ▸ OK; `STALE_SNAPSHOT` = warn-and-proceed (`calculationAllowed=true`, never auto-0), every other non-OK blocks; branch-scoped `TypeError`/`RangeError` validation; no coercion / clock / locale / fallback; fresh object per call, input never mutated. Added **43 unit assertions** (282 → **325**) and promoted **Golden #29** (missing/stale snapshot → `MISSING_SNAPSHOT` / `STALE_SNAPSHOT`, never 0) and **Golden #30** (forecast-driven + missing forecast → `MISSING_FORECAST`, never 0) from `IMPLEMENTATION_PENDING` to `EXECUTED_EXISTING_CORE` (**+3 golden assertions**, 114 → **117**). **Golden Matrix = 25 executed / 15 pending / 0 canonical-blocked; Unit = 325 PASS; Golden = 117 PASS.** The verified pure core + both test suites were **landed into Main** (`assets/js/core/supply-planning-calculations.js`, `assets/tests/supply-planning-calculations.test.js`, `assets/tests/supply-planning-golden-scenarios.test.js`) and **run from Main** — Main is now the unique canonical implementation; `C:\km-lb` remains a temporary implementation/test lane. The §34/§34A business contract, `replenishment_model` meanings, every other scenario, §26/§27/§27A/§32A, and all quantity primitives are **unchanged**; no new public API beyond `classifyPlanningDataState`; **no formula / Line Runtime / Qualified Incoming Runtime / DB / API / UI change; B-1/B-2/B-3 RESOLVED and B-4~B-8 UNRESOLVED unchanged.**
>
> **Changelog v4.3 → v4.4 (2026-08-01 — Round 8A: §34 Missing / Stale Data Pure-Classifier Canonical Contract Freeze; documentation only, no formula/runtime/test change):** Added **§34A** as the **single canonical owner of the Missing / Stale planning-data classifier** —
> - **authorized one pure/deterministic classifier `classifyPlanningDataState(input)`** (no DB / API / UI / clock / locale / implicit default; same input ⇒ same output; classifies *calculation input readiness* only — does not assemble snapshots/forecasts, choose a snapshot source, or orchestrate the Recommendation Runtime; §34A.1);
> - froze the **exact input schema** — `snapshotPresent` (boolean, required), `snapshotAgeDays` + `stalenessThresholdDays` (finite ≥ 0 numbers, consumed/validated only when `snapshotPresent===true`), `replenishmentModel` (`"forecast_driven"` / `"sales_driven"` enum, §2), `forecastPresent` (boolean, forecast-driven only), `salesBasisPresent` (boolean, sales-driven only); no DB row, no warehouse/marketplace/SKU identity, no current-date input (§34A.2);
> - froze the **exact output** `{ state, calculationAllowed }` and the **five state tokens** — `MISSING_SNAPSHOT` / `STALE_SNAPSHOT` **preserved verbatim from §34**, plus machine tokens `MISSING_FORECAST` / `MISSING_SALES_BASIS` / `OK` as the deterministic representation of §34's existing "calculation blocked / review" and normal rows (no second/UI vocabulary invented; §34A.3);
> - froze **`calculationAllowed`**: `OK` and `STALE_SNAPSHOT` ⇒ `true` (STALE proceeds under the §34 "show source + staleness warning" fallback, never auto-0); every other state ⇒ `false` (§34A.3);
> - froze the **precedence / truth table** — snapshot-missing ▸ demand-basis-missing (forecast/sales) ▸ staleness-warning ▸ OK; a single deterministic `state`; sales-driven **ignores** forecast presence; missing snapshot outranks missing forecast; a blocking demand-basis gap outranks the stale warning (§34A.4/.5);
> - froze the **boundary + error contract** — staleness is `snapshotAgeDays > stalenessThresholdDays` (strict; age = threshold ⇒ fresh); `TypeError` for shape / non-boolean flags / non-string model / non-number age·threshold; `RangeError` for a non-enum model / NaN / Infinity / negative age / negative threshold; no coercion, no fallback-to-0/OK/sales_driven, no clock; branch-scoped validation mirrors §27A/§32A (§34A.5).
> **No JavaScript / test / Runtime / DB / API was written; §34 state meanings, replenishment-model meanings, and every other scenario are unchanged; Scenario #29/#30 remain IMPLEMENTATION_PENDING (their blocker moves from "exact pure-function contract not frozen" to "Canonical contract frozen; pure-core implementation pending"); Golden Matrix remains 23 executed / 17 pending / 0 canonical-blocked; Unit 282 / Golden 114 PASS unchanged; Runtime remains NOT IMPLEMENTED; B-1/B-2/B-3 RESOLVED and B-4~B-8 UNRESOLVED unchanged.** Implementation + Scenario #29/#30 execution are deferred to **Round 8B**.
>
> **Changelog — Round 6 implementation (2026-07-31 — Reallocation Eligibility Pure Predicate; implementation + tests only, no rule/version change, semantic version stays v4.3; landed to main by the Round 6B dependency catch-up):** Implemented the frozen §32A contract as the pure export `evaluateReallocationEligibility` in `assets/js/core/supply-planning-calculations.js` (Same-Master-SKU exact string equality + Engine B-only tier ordering `donorRank <= receiverRank` over T1/T2/T3; T4/null ineligible; Engine A not read; no quantity in/out; delegates date validation to `classifyRequiredByWindow`; pure/fresh outputs). Promoted **Golden #21** (Same-Master-SKU gate — different SKU ⇒ ineligible) and **Golden #22** (Engine B tier ordering — later surplus cannot cover an earlier shortage; earlier/same-tier may) from `IMPLEMENTATION_PENDING` to `EXECUTED_EXISTING_CORE`. **Golden Matrix = 23 executed / 17 pending / 0 canonical-blocked; Unit = 282 assertions PASS; Golden = 114 assertions PASS.** The §32A contract, §26/§27/§27A, Round 5 classifier, Golden #28/#33, and all quantity primitives are unchanged. No new public API beyond `evaluateReallocationEligibility`; no Line Runtime / Qualified Incoming Runtime / DB / API / UI; no quantity orchestration.
>
> **Changelog v4.2 → v4.3 (2026-07-31 — Round 6A: Reallocation Eligibility Owner Boundary + Public Contract Freeze; documentation only, no formula/runtime/test change):** Added **§32A** as the **single canonical owner of the reallocation eligibility predicate** —
> - froze the **pure-core vs Line-Runtime/caller responsibility split** (pure core = same-Master-SKU deterministic comparison + Engine B tier extraction/ordering + boolean result + strict validation; caller = DB/joins, identity/company resolution, candidate enumeration, route timing, packaging, ownership transfer, inventory qualification, `timelyTransferableQty`, iteration, persistence, concurrency; §32A.1);
> - froze the **Same-Master-SKU exact-string-equality identity gate** (no `site_sku`/`marketplace_sku_id`/ASIN, no prefix/Series/Category, no case/trim coercion; Golden #21; §32A.2);
> - froze **Engine B as the sole tier source** (never Engine A / `daysOut` bucket; no 1:1 map; §32A.3);
> - froze the **eligible tiers** (T1/T2/T3 only; T4 / `null` / `allocationEligible=false` excluded; `visible`/`payloadEligible` are not gates; §32A.4);
> - froze the **`donorRank <= receiverRank` tier-ordering truth table** (T1=1/T2=2/T3=3 — later surplus cannot cover an earlier shortage; Golden #22; §32A.5);
> - froze the **adapter-independence guard** (Engine A never AND-ed into the tier gate; §32A.6) and **quantity separation** (no qty in/out; does not replace `applyFeasibleReallocation`; §32A.7);
> - **authorized the nested `evaluateReallocationEligibility` public contract** — top-level `sameMasterSku`/`donor`/`receiver`/`tierOrderingEligible`/`eligible`, party keys `tier`/`allocationEligible`, no flat aliases / Engine A / quantity / DB / company / UI-reason / global-state fields (§32A.8);
> - froze the **validation/purity contract** (`TypeError` for shape/non-string-SKU, date validation delegated to `classifyRequiredByWindow`'s strict `RangeError` contract; no coercion/clock/locale; no mutation; §32A.9).
> **No JavaScript / test / Runtime / DB / API was written; §26/§27/§27A and all formulas unchanged; Round 5 classifier + Golden #28/#33 unchanged; Golden #21/#22 remain IMPLEMENTATION_PENDING; Golden Matrix remains 21 executed / 19 pending / 0 canonical-blocked; Runtime remains NOT IMPLEMENTED; Executable Tests remain PENDING.** *(Historical — this was the Round 6A end-state; superseded by the Round 6 implementation entry above.)*
>
> **Changelog v4.1 → v4.2 (2026-07-31 — Round 5A: Required-By Classifier Canonical Gap Closure; documentation only, no formula/runtime/test change):** Closed the Round-5 HALT gaps for the Required-By classifier —
> - **separated Engine A day-bucket and Engine B monthly-tier outputs** into two adapter-scoped sub-objects (§27A);
> - **froze the `>90d` literal** as the Engine A beyond-90-day bucket (§27A.4);
> - **froze overdue behavior** (Engine A `"0–18d"` + Engine B `"T1"`; §27A.4/.5);
> - **froze T1–T4 and Month+5+ behavior** (Month+5+ ⇒ `tier=null`, not visible; §27A.5);
> - **froze adapter-scoped visibility / allocation / payload eligibility** (Engine A has no `payloadEligible`; §27A);
> - **authorized the nested `classifyRequiredByWindow` API contract** and marked the earlier Round-5 flat draft `{daysOut, engineABucket, tier, visible, allocationEligible, payloadEligible}` **SUPERSEDED — do not implement** (§27A.1);
> - **preserved the prohibition against an Engine A ↔ Engine B 1:1 mapping** (§27 strengthened; §26/§27 rules unchanged);
> - froze the §33 Scenario #28 / #33 canonical expected values (§27A.8) and updated only those two matrix rows.
> **No JavaScript / test / Runtime / DB / API was written; §26 & §27 formulas unchanged; Runtime remains NOT IMPLEMENTED; Executable Tests remain PENDING.**
>
> **Changelog v4.1 (2026-07-24 — residual documentation cleanup, NO version bump / core formulas unchanged):** §20.5 Forecast-Driven summary de-duplicated → now a pointer to the complete §2D (the old one-line summary that omitted Special Event Demand + Approved/Committed Supply is superseded). Added **§36 Order State Separation** (Layer A live planning signal vs Layer B persisted monthly/emergency Suggestion via `request_order_allocation_drafts`/`_lines` — `recommended_qty` snapshot vs user `order_qty`/`carton_qty` — plus the Emergency Manual Order flow through Engine A → Engine B → reallocation → Net Order Need) and **§37 Partial-Carton Override end-to-end** (allowed through Send / Approval / PO, never re-rounded; missing UPC still blocks Suggested + Send; MOQ still Future Extension). Owner remains **v4.1** (no v4.2). Golden Scenarios still **40 specified**; Executable Golden Tests still **PENDING**. **Residual surgical repair (2026-07-24, later pass):** §2D result renamed `Suggested Qty` → **`Forecast-Driven Remaining Need`** (Engine A live shortage, explicitly NOT Suggested Order Qty — that exists only after Engine B `Net Order Need`); §20.5 Sales-Driven likewise no longer names Engine A output "Suggested Qty"; §22.4 + §20.5 + §21.2 ownership pointers corrected so `INVENTORY_TABLE_MAPPING_SPEC.md §14/§15` is display/mapping context only and **this document §2C/§2D governs**; Golden Scenario #6 expected output now includes **− Approved/Committed Supply**; §24.10 + §36.2 exact monthly clock (5th/15:00) removed → cadence-only, exact schedule deferred to Runtime config; §36.2 draft parent/line grain corrected to match the existing schema (SKU on parent, inherited by lines via `request_allocation_draft_id`; monthly cadence — the persisted cycle-key mechanism is **BLOCKED BY B-7**, not decided here). **Round-3 residual cleanup (same v4.1):** §20 restated as the authoritative overseas-allocation rule (INVENTORY §16 only maps/displays it — reverse "official rule in Inventory" wording removed); §4 Inventory-source persistence wording replaced (the stale "no `shipping_allocation` DB / not persisted in MVP" line) with the layered persistence contract (live preview not persisted · shipping recommendation → `shipping_allocation_drafts`/`_lines` · monthly/emergency → `request_order_allocation_drafts`/`_lines` · Request/PO only after user decision · Runtime NOT IMPLEMENTED), with detailed schema referenced to the mapping specs. **Round-4 residual cleanup (same v4.1):** §15/§16 no longer label the **existing** `purchase_orders` lifecycle as "Future" — restated as live downstream user-decision/conversion layer with the same persistence layering (schema owned by `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`); §20.3 Avg Sales/Day stale `sales_units_7d ÷ 7 / engine-defined run-rate` second entry point removed → resolved **exclusively by §22** (90-day window → latest 30 eligible normal days; `sales_units_7d÷7` is only §22's fallback rung).
>
> **Changelog v4.0 → v4.1 (2026-07-24 — Avg. Sales/day sample refinement):** §22 corrected. **Source Lookback Window = latest 90 completed calendar days (today excluded)**; the sample = the **latest 30 ELIGIBLE NORMAL sales days** collected by walking backward and skipping this SKU's Campaign/Deal/Special-Event days. Clarified: the "30" is a *historical normal-sales sample size, not a future 30-day window*; when fewer than 30 normal days exist inside the 90-day window, divide by the **actual** normal-day count (never a fixed 30) and keep the frozen low-sample/fallback ladder; campaign exclusion is **per-SKU participation** (`campaign_sku_lines`), never site-wide; Campaign∩Event overlap excluded once; cancelled/invalid events not counted; Event Preparation Date is not a contamination period; confirmed zero-sales day counts as a normal day (value 0), missing day is not auto-zero. Golden Scenarios §33 #35–#40 added. **Runtime: NOT IMPLEMENTED; Executable Test: PENDING — no engine built.**
>
> **Changelog v3.5 → v4.0 (2026-07-24 — SPECIFICATION FREEZE):** The calculation specification is **FINALIZED**. This round closed every formula / product-semantic / time-window / count-once / shared-pool / cross-company-reallocation / carton blocker from the prior Calculation Audit. Additions & resolutions: (§25) Runtime **Demand Ledger & Supply Ledger contract** + grain (no new DB column); (§26) **Exact-date window freeze** with boundary examples (−1/0/18/19/30/31/45/46/90/91); (§27) **T1–T4 tier freeze** (non-overlapping; T4 = visibility only); (§28) **Current-Month correction** — Factory Stock is source-side, removed from the destination projected balance; (§29) **Demand Basis freeze** (Sales-Driven normalized-30d ladder, Forecast-Driven Adjusted FC + explicit 30-Day Safety Demand); (§30) **Supply lifecycle count-once** with a 100-unit worked example; (§31) **Calculated Gap → Shipment FLOOR → carton-adjusted Residual Production → Order CEILING** worked example; (§32) **Company Reallocation feasibility constraints**; (§33) **Golden Scenario Matrix** (34 scenarios); (§34) **Missing/Stale Data contract**; (§35) **Factory deterministic allocation order**. Version conflict (header v3.3 / footer v3.5) resolved; "subject to revision" removed; §19 Open Items reduced to non-blocking Future Extensions only. **Runtime remains NOT IMPLEMENTED — no engine, no executable test, no production behavior was built or changed in this round; only the specification is frozen.**
>
> **Changelog v1 → v2:** Added Document Scope, Company/Ownership context, explicit Inventory Sources, Target Days logic, carton rounding, Request Order role, Inventory Replenishment vs Request Order distinction, validation rules, and expanded current/future month projection with on-the-way and pull-forward special-event terms. Sign convention now explicit in the source formulas.
>
> **Changelog v3.2 → v3.3:** Normalized Avg Sales architecture alignment (no logic change): (1) added §22.6 **Runtime Calculation Rule** — `normalized_avg_sales_per_day` is a **Runtime result, not a DB column**; persisted only at Submit Plan into `shipping_plan_lines.snapshot_avg_sales_per_day`. (2) Renamed the Avg-Sales method/source snapshot field to **`snapshot_avg_sales_source`** (records the *source* of the Avg Sales basis, not an algorithm). (3) Defined `snapshot_avg_sales_source` as a fixed enum (`weekly_7d`, `normalized_30d`, `manual_override`, `forecast_override`, `ai_adjusted`; runtime uses the first two, rest Future Extension). (4) **Fully decoupled Source from Warning** — removed combined tokens (`normalized_30d_low_sample`, `weekly_7d_fallback_insufficient_normal_days`); §22.3 fallback ladder now sets `source` + `warning` independently.
>
> **Changelog v3.1 → v3.2:** Added the **Normalized Avg Sales / Day Rule** (§22) — when a SKU had a Special Event / Campaign / Deal day in the recent window, Avg Sales/Day is computed from `amazon_daily_sales_snapshot` over the **latest 30 completed days excluding today**, **excluding** event/promotion days, instead of `sales_units_7d ÷ 7`. Includes the normal-day fallback ladder (≥7 normal days → normalized; 3–6 → normalized + `low_sample_warning`; <3 → weekly fallback + `insufficient_normal_days`) and the Forecast-Driven note. Requires the Daily Sales snapshot window to be 30 completed days (see `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`).
>
> **Changelog v3 → v3.1:** Added the **Supply Planning Optimization Goal** (§21) — the system default objective and its priority order (Supply Safety → Lowest Logistics Cost → Minimum Number of Shipments → Container Utilization), the slowest-first / 45-day-sea-freight default, and the rule that faster logistics is only escalated when the 18-day Minimum Survival Stock cannot otherwise be met (never default to air).
>
> **Changelog v2 → v3:** Added the **Overseas Shared Inventory Allocation Engine** (§20) — allocation scope (same company + same country), 18-day minimum survival stock (highest priority), `allocation_priority`-based distribution, Platform vs Self vs Hybrid behavior, the Sales-Driven / Forecast-Driven Need calculation alignment (Safety Days = 30), and the future Shipping/Factory/Carrier allocation extension. Synchronizes the finalized Inventory Table rules from `INVENTORY_TABLE_MAPPING_SPEC.md` v1.0.

---

## 1. Document Scope

This document defines **calculation rules only** — the math for forecast projection, shortage/surplus, reallocation, and order need.

- **Operational flow** (pages, steps, approvals, persistence) is defined in [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md).
- **Table relationships** (FKs, layers, page-to-table map) are defined in [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md).

No code. No DB schema. No implementation.

> **Notation:** Formulas express business intent. Supply/inventory terms are **added** (`+`); demand/forecast consumption terms are **subtracted** (`−`). A *Projected Balance* is a net position: `> 0` surplus, `< 0` shortage.

---

## 2. Core Calculation Layers

Two **independent** layers — do not collapse them:

| Layer | Name | Purpose | Output |
|-------|------|---------|--------|
| **Layer A** | Forecast / Inventory Projection | Month-by-month projected balance per company × marketplace × SKU | Shortage / Surplus |
| **Layer B** | Order Planning / Reallocation | Net company surpluses against shortages → real order need | Order Need |

**Core rule: Forecast shortage does NOT directly equal order quantity.** Order quantity is derived only after company-level surplus reallocation (Layer B).

```
Layer A (Projection) → shortage/surplus per company
        ↓
Layer B (Reallocation → Order Need) → order quantity
        ↓
Request Order / PO
```

---

## 2A. Phase 1 — Net Replenishment Need (P1-A, CANONICAL basic formula, 2026-07-22)

Phase 1 first delivers the **minimum verifiable, auditable, traceable** replenishment number (P1-A), before Allocation / order-deduction / shipment-deduction / receiving. **P1-A must not be blocked by the complete 90-Day engine — but the full 90-Day Rule-Based Supply Planning engine (four modes §2B) is P1-G and IS required before Phase-1 Go-Live** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §1A). **SUPERSEDED:** any earlier statement that "full 90-Day optimization is Post-Phase-1 / not required for Go-Live." Only **learning-based** features (AI, automatic statistical correction, dynamic Safety Stock / dynamic optimization, BigQuery intelligence) are Post-Phase-1.

```
Net Replenishment Need
  = Demand Within Planning Window
  − Sellable Current Stock
  − Qualified Incoming
  − Approved / Committed Supply          (clamp ≥ 0)
```

**Term definitions (canonical):**
- **Demand Within Planning Window** — the demand for the planning window from the current Sales-Driven / Forecast-Driven rule (Layer A projection + special-event pull-forward, §8–§10). The **planning window** is the configured target-days horizon (§6). **Event Demand is NOT deleted when a Shipment is created** — it is only *offset by qualified Supply*; creating a shipment never erases the underlying demand.
- **Sellable / usable Current Stock** — on-hand that can actually satisfy this demand at the relevant location: `available_stock = current_stock − reserved_stock` (excludes damaged / reserved / non-sellable). Platform-fulfilled (FBA) vs shared self-fulfilled pools are counted per §20 (not double-counted).
- **Qualified Incoming (business semantics — NOT a DB status allowlist)** — incoming supply already committed enough to count against demand. The stages **Approved Plan / Shipped / In Transit / Received-not-yet-reflected** are **business-stage examples**, timed by ETA within the window; they illustrate the *business meaning*, not a canonical set of DB status values. **The Qualified Incoming business predicate (§2E), the external-origin admission gate (§38), and the per-table qualification direction (Shipment `SHIPMENT_CENTER_SPEC.md` §10; PO `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §P1-B) are RESOLVED (B-4 CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED); the Qualified Incoming Runtime, the writer / lifecycle trigger, and the cancellation-state mapping (B-8) remain open** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-4). **Draft is NOT confirmed supply** and does **NOT** count as Qualified Incoming. (Received stock already in `current_stock` is counted there, not double-counted here.)
- **Approved / Committed Supply** — approved Request/PO quantity not yet in the incoming/stock buckets above (production committed but pre-shipment), to avoid re-ordering what is already on order.

**Rules:**
- **Draft principle:** a Draft (Shipping Plan draft, Inbound Planning draft, unapproved Request) is **never** confirmed supply.
- **Recognition:** Approved Plan, Shipped, In Transit, Received are recognized per their status + ETA timing; each is counted **once** in exactly one bucket.
- **Carton / MOQ rounding** applies only when later demand can reasonably absorb it (§14) — the raw Net Need is computed first, rounding second.
- **Platform warehouses** compute + round per **final destination warehouse** independently; **overseas-warehouse consolidation** requires matching **Company + Warehouse + SKU + Route/Method** (§20, `SUPPLY_CHAIN_SYSTEM_FLOW.md`).
- **Traceability (required):** every Net Need must trace to its demand source, stock snapshot, qualified-incoming rows, and recommendation source (snapshot-frozen at decision, §22).
- **Scope:** P1-A establishes the correct base formula + data flow. The **rule-based 90-Day engine (four modes, buckets, target rules, 30-day safety, event lifecycle, shared-overseas allocation) is P1-G — Phase-1, pre-Go-Live** (§2B–§2E). Only **learning-based** correction (AI, automatic statistical correction, dynamic Safety Stock, BigQuery) is Post-Phase-1.

---

## 2B. The Four Replenishment Combinations (CANONICAL 2026-07-22)

Replenishment is the cross-product of two axes: **Demand Basis** (`sales_driven` / `forecast_driven`) × **Stock Basis** (`platform_fulfilled` / `self_fulfilled` = overseas-warehouse fulfilled).

| Mode | Demand | Current Stock basis |
|------|--------|---------------------|
| **A. Platform × Sales-Driven** | `normalized_avg_sales_per_day × planning-window days` + `special_event_demand` | latest valid **platform sellable** inventory snapshot |
| **B. Platform × Forecast-Driven** | target-adjusted Regular FC + 30-day safety demand + `special_event_demand` | latest valid **platform sellable** inventory snapshot |
| **C. Overseas × Sales-Driven** | `normalized_avg_sales_per_day × planning-window days` + `special_event_demand` | `site_planning_available` allocated from eligible overseas warehouses (§20) |
| **D. Overseas × Forecast-Driven** | target-adjusted Regular FC + 30-day safety demand + `special_event_demand` | `site_planning_available` allocated from eligible overseas warehouses (§20) |

**Canonical stock rule (MUST):**
- A Marketplace SKU **not** fulfilled from a platform warehouse **MUST** use overseas-warehouse **Site Planning Available** as its Current Stock basis; it **MUST NOT** use platform inventory. A non-platform / self-fulfilled SKU's Current Stock is therefore its **overseas allocated available**, **never `0`** and **never platform stock**.
- **Platform inventory and overseas inventory MUST NOT be blindly added together.** They are separate supply buckets (§24; `DATABASE_RELATIONSHIP_MAP.md` §6.0).
- **Hybrid** marketplaces resolve fulfillment behavior at the **Marketplace-SKU level** (`fulfillment_model`); if one SKU genuinely uses both lanes, **explicit lane allocation** is required before calculation (no implicit merge).

## 2C. Sales-Driven Formula — exact-date buckets (Modes A & C)

Buckets (exact days from the calc date): **`0–18` / `19–30` / `31–45` / `46–90`**. For each bucket `b`:
```
Incremental Regular Demand[b] = normalized_avg_sales_per_day × bucket_day_count[b]
Bucket Need[b] = max( 0,
    Incremental Regular Demand[b]
  + Event Demand assigned to bucket b            (by Preparation Date, §5 / §10)
  − remaining current stock                       (applied cumulatively)
  − qualified incoming arriving in time (ETA ≤ bucket end)
  − approved committed supply eligible for this requirement )
```
- Stock and supply are consumed **cumulatively** across buckets (FIFO by ETA); **every demand row, event, incoming row, and inventory quantity is counted once only**.
- **Platform stock source (Mode A):** prefer the **latest valid platform snapshot**; **never subtract sales again** from an imported current snapshot; the Estimated ledger is **fallback only** when no valid snapshot exists, and such fallback inventory is labeled **Estimated Inventory**.
- **Overseas stock source (Mode C):** `current − reserved − damaged/hold/non-sellable`, then allocate within the **same Company + Country + eligible Warehouse + SKU** (§20): protect the **18-day survival stock first** (§20.3), distribute the remainder by demand weight + `allocation_priority` (§20.4); **never assign the whole shared pool to every site.**
- **Normalized Avg Sales** (§22): search backward within the latest **90 completed calendar days** (today excluded) and collect the **latest 30 eligible normal sales days** (excluding this SKU's Campaign/Deal/Special-Event days); ≥7 normal days → normalized average (÷ actual normal-day count); 3–6 → normalized + `low_sample_warning`; <3 → `weekly_7d` fallback + `insufficient_normal_days`.

### 2C.1 Calculated Gap → Recommended Qty (CANONICAL 2026-07-22)

Per window `b`, the **Calculated Gap** is the destination demand remaining after destination stock + timely supply (this is `Bucket Need[b]` above; DB `calculated_gap_qty`):
```
Calculated Gap[b] = max( 0,
    Regular Demand[b] + Special Event Demand[b]
  − Remaining Destination Stock − Timely Qualified Incoming − Timely Approved Supply )
```
The **Recommended Qty** is what the system actually recommends **shipping**, after source availability + carton + route-timing feasibility:
```
Raw Recommended Qty[b]      = min( Calculated Gap[b], Eligible Source Available Qty )
Carton-adjusted Recommended Qty[b] = FLOOR( Raw Recommended Qty[b] / units_per_carton ) × units_per_carton
```
- **Three distinct quantities — never conflated:**
  1. **Destination shortage** = `Calculated Gap` (how much the destination needs).
  2. **Immediately-available source stock** = `Eligible Source Available Qty` (what can ship now from Factory/Overseas eligible source).
  3. **Production-required quantity** = `max(0, Calculated Gap − Carton-adjusted Recommended Shipping Qty − Other Legally Allocated Timely Supply)` — computed from the **carton-adjusted (FLOOR) shipping result, NOT the raw source amount** (canonical §31). A source remainder below one whole carton cannot ship now, so it must **not** be treated as already satisfying the gap; it stays in source inventory for future consolidation. Feeds P1-B order recommendation (Order CEILING §14).
- **Carton rounding here is FLOOR** — a shipping recommendation ships only **whole cartons of what is actually available**, never a partial carton and never more than available. *(Distinct from the ORDER/production carton rule §14, which uses **CEILING** to round the order **up** so production covers the whole need. Shipping-from-available rounds down; order-to-cover-need rounds up.)* **Do NOT compute `Production Required = Gap − Raw Eligible Source`** — that under-counts production whenever the source remainder is a partial carton (§31 worked example).
- **Zero Factory Stock does NOT mean "no shipment can be recommended."** If `Eligible Source Available = 0` but the destination has a gap, the **production-required quantity** is surfaced (plan production → order), and a route can still be recommended for the post-production ship (Route Recommendation §Step B uses production lead time). Do not conclude "no shipment ever."
- `units_per_carton` from `sku_details`; a missing UPC → validation/manual review (never a silent default).

## 2D. Forecast-Driven Formula (Modes B & D)

```
Adjusted Regular FC = Regular FC × Target Rule
Target Rule priority: SKU > Series > Category > default 100%

Forecast-Driven Remaining Need = max( 0,
    Forecast Month+1 + Forecast Month+2
  + 30-Day Safety Demand
  + Special Event Demand
  − Current Stock (for the selected fulfillment model — platform snapshot [B] or overseas Site Planning Available [D])
  − Qualified Incoming arriving in time
  − Approved / Committed Supply )
```
- **This is an Engine A live planning need / shortage result. It is NOT Suggested Order Qty.** Suggested Order Qty exists only after Engine B reallocation and `Net Order Need` (§20 / §31 / §14). Engine A produces live Demand / Shortage / Remaining Need; naming it "Suggested Order Qty" is prohibited.
- **Forecast-Driven Avg Sales is display/reference only** — it must **not** replace Forecast as the demand basis.
- **Shared overseas allocation (Mode D):** Forecast demand / FC Share is an **allocation weight**, **not** ownership of duplicated physical stock; **never allocate more than the calculated site Need.**

## 2E. Qualified Incoming / Count-Once Contract (canonical)

A candidate supply row is **Qualified Incoming** only when **all ten** gates hold (the frozen business predicate):
1. **Master SKU** matches.
2. **Company** matches.
3. **Destination warehouse or explicitly eligible service scope** matches.
4. The row **status** belongs to the **canonical qualified allowlist for its own table** (per-table, never one global enum) — Shipment-side allowlist owned by [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) §10; PO / committed-supply allowlist owned by [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) §P1-B.
5. **ETA is resolved** (authority per §2F).
6. **ETA ≤ the requirement Required-By Date.**
7. **Remaining unconsumed quantity > 0.**
8. The row is **not** draft / rejected / cancelled / void / terminally closed / otherwise excluded.
9. The quantity has **not already been posted to Current Stock.**
10. The **same physical quantity is not active in another committed / incoming bucket** (§30 count-once).

- **Draft is never Qualified Incoming.**
- **ETA > Required-By = visible Late Risk, contributes 0 to coverage** (§2F/§10.1).
- **Missing ETA = visible / reviewable but contributes 0 to timely coverage** (§2F/§34).
- **Delivered ≠ Received;** **Received supply moves out of Incoming into Current Stock exactly once**; there is **no standalone Received-Qty deduction term** (§10.1).

> **B-4 status — PARTIALLY RESOLVED, BUSINESS CONTRACT REPAIRED (2026-08-01; `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-4).** The **business predicate above and the per-table qualification direction are now contract-repaired** and canonically aligned. Still **BLOCKED / IMPLEMENTATION_REQUIRED** (Runtime not closed): the exact DB status writer/lifecycle trigger, the receiving-layer (received-qty / receipt handler / inventory posting), `shipment_events` ETA authority, `destination_warehouse_id` persistence, and the `wh_on_the_way_qty` ↔ Shipment-derived incoming double-count owner. **Cancellation / unlock / reopen release mapping = B-8; source/line grain = B-5** — not absorbed into B-4. This document owns the qualification's **business meaning** only; it does not fix the DB status set, which each owner spec + Runtime must land.

Each physical quantity exists in **exactly one** active planning bucket, in this progression — never counted in two at once:
```
Committed Production → Approved Shipping Plan → In Transit → Delivered-not-Received → Received (Current Stock)
```
- Do **not** double-count the same quantity as PO committed supply **and** Approved Plan **and** Shipment On-the-Way **and** Current Stock.
- **Delivered ≠ Received:** a carrier `delivered` event never increases destination stock; destination stock rises **only at confirmed receipt/posting** (`SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §5.4, `DATABASE_RELATIONSHIP_MAP.md` §6.0).

## 2F. Shipment ETA — display bucket vs qualification (CANONICAL 2026-07-22)

A Shipment is **displayed** in the window that contains its ETA. But **qualification is separate from the display bucket**:
```
A Shipment qualifies for a requirement ONLY when Shipment ETA ≤ Requirement Required-By Date.
```
- A shipment shown in a window still does **not** cover that window's gap if its ETA is after the Required-By date — it is flagged **In Transit — Late Risk** (visible, not covering; §10.1).
- **ETA source priority (highest wins):**
  1. **latest actual / runtime ETA** (from `shipment_events` projection),
  2. **formal Shipment planned ETA** (`shipments.eta`),
  3. **lead-time estimated ETA** (`today/ship-date + carrier_lead_times`).
- **Once a formal Shipment has an authoritative runtime ETA, do NOT keep replacing it** with a fresh carrier-lead-time estimate (the estimate is only the fallback before a real ETA exists).
- **Interim Runtime authority (B-4 contract repair, 2026-08-01):** because `shipment_events` is **NOT IMPLEMENTED** (`SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §8/§9), the **active formal ETA source today is `shipments.eta`**, with the lead-time estimate as fallback only. Priority (1) `shipment_events` remains the long-term authority (IMPLEMENTATION_REQUIRED); when it exists, a later lead-time recomputation must not overwrite it. The exact date/datetime/timezone normalization contract is future Runtime work.
- **Delivered ≠ Received:** delivered-not-received remains **Incoming**, not Current Stock, until confirmed receipt.

---

## 3. Company and Ownership Context

**Companies:** `KM`, `ResUS`, `ResTW`.

**Ownership model:**
```
Factory → ResTW → KM / ResUS / ResTW → Customer
```

**Planning rule:**
- **Company is required** for `marketplace_skus` and forecast planning.
- **Country alone is not sufficient** — e.g. US can include both `KM` and `ResUS`. Operational ownership is keyed by `company + country + marketplace`.

---

## 4. Inventory Sources

Supply-side inputs to projection:

| Source | Definition | Table |
|--------|------------|-------|
| Marketplace inventory | Sellable stock at the marketplace | *future* marketplace inventory snapshot |
| Marketplace on-the-way | Inbound to marketplace | shipments + lines + eta |
| Overseas warehouse inventory | 3PL / overseas warehouse on-hand | `overseas_inventory_snapshot` |
| Overseas warehouse on-the-way | Inbound to overseas warehouse | shipments + lines + eta |
| Factory stock | Production-side on-hand (shared pool) | `factory_stock` |
| Completed / incoming production orders | Production arriving from POs | `purchase_orders` / `purchase_order_lines` / `production_schedule` |
| Shipment on-the-way | In-transit shipments by ETA | `shipments` + `shipment_lines` + eta |

**Clarifications:**
- `factory_stock` = **production-side** inventory (**Factory Inventory** domain).
- `overseas_inventory_snapshot` = **warehouse-side** inventory (**Overseas Inventory** domain).
- `shipments` + `shipment_lines` + ETA = **on-the-way** source.
- **Persistence layering (canonical; detailed schema is owned by the mapping specs, not by this document):** (1) **Live analysis / calculation preview is NOT persisted** — it is a Runtime recompute. (2) A **scheduled / manual shipping recommendation** persists to the existing `shipping_allocation_drafts` / `shipping_allocation_draft_lines` (see `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6 / `SHIPMENT_CENTER_SPEC.md`). (3) A **monthly / emergency order suggestion** persists to the existing `request_order_allocation_drafts` / `request_order_allocation_draft_lines` (§36; `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.7). (4) Only **after the user's decision** does it enter the Request Order / Purchase Order lifecycle. (5) **Calculation Runtime remains NOT IMPLEMENTED** — these are spec contracts, not live behavior.
- **Inventory-domain separation (CANONICAL 2026-07-21 — authority `DATABASE_RELATIONSHIP_MAP.md` §6.0).** Factory Inventory (`factory_stock` / `factory_stock_movements`) and Overseas Inventory (`overseas_inventory_snapshot` / `overseas_inventory_movements`) are **separate domains** — the calculation engine reads each as a **distinct input** and must **never merge them into one balance**. **On-the-way / in-transit shipment quantities are a transportation state, NOT inventory at either endpoint** — they must never be double-counted as available inventory simultaneously at the factory and the overseas warehouse. Overseas on-hand rises only on confirmed receipt; factory on-hand falls on confirmed dispatch.

---

## 5. Forecast Inputs

| Input | Table | Rule |
|-------|-------|------|
| Regular Forecast | `fc_regular_forecast` | Can be adjusted by target rules |
| Special Event Forecast | `fc_special_events` | Always 100%; not affected by target rules |
| Target Rules | `fc_target_rules` | Adjust Regular FC only; default 100% |

- **Regular FC** can be adjusted by target rules.
- **Default target rule = 100%.**
- **Special Event FC is always 100%** and **not affected by target rules**.

---

## 6. Target Days Logic

**Target Days** comes from the Inventory Replenishment page — user-selected planning coverage in days. **Default = 90 days.**

```
Required Coverage Demand = Target Days × Avg Sales Per Day
```

- Used for **Inventory Replenishment suggestions** (operational replenishment to a site).
- **Not necessarily the same** as the monthly Request Order projection (which uses month-by-month forecast, not a flat coverage window).

---

## 7. FC Share Logic

Used to allocate the **shared factory stock pool** fairly across SKUs / companies.

> **Canonical scope (2026-07-20):** FC Share is a **proportional WEIGHTING input** for the remaining-pool step of shared allocation (§23.2 step 4) — **not** the only overseas shared-allocation method (18-day survival §20.3 and `allocation_priority` §20.4 come first) and **not** a hard entitlement (`SHIPMENT_CENTER_SPEC.md` §19.2 V1). FC Share **weights a division of one physical pool; it never duplicates physical stock** across marketplaces (§23.1/§23.5).

```
Company Total FC = Σ (all marketplace-SKU forecast under the same company)

SKU FC Share = Marketplace SKU FC ÷ Company Total FC
```

- **Current business rule:** use a **rolling future 4-month FC window** for FC share.
- **Purpose:** allocate shared factory stock based on expected near-term demand → produces an *Allocated Factory Stock* **source-side** figure. Per the v4.0 correction (§8/§28), this is **NOT added to the destination projected balance**; it is a source that limits Recommended Shipping Qty and reduces Residual Production Required (§31).

**Example (one company, rolling 4-month FC):**

| Marketplace SKU | Rolling 4-mo FC | FC Share | Factory pool 500 → allocated |
|-----------------|-----------------|----------|------------------------------|
| Amazon US | 800 | 80% | 400 |
| Shopify US | 200 | 20% | 100 |
| **Total** | **1000** | **100%** | **500** |

---

## 8. Current Month Projection Logic

> **CANONICAL CORRECTION (v4.0, 2026-07-24):** the destination projected balance uses **destination-side sellable stock + timely qualified incoming + timely approved/committed supply** only. **Factory Stock is source-side supply and is NOT added to the destination projected balance.** (The superseded formula below added `Allocated Factory Stock` into the destination balance; that let factory stock satisfy the destination once and then be deducted a second time by the shipping recommendation — a double count. Factory Stock now enters only through §31: it *limits* Recommended Shipping Qty and *reduces* Residual Production Required.)

```
Destination Projected Balance (current month)
  = Destination Sellable Current Stock
  + Timely Qualified Incoming              (ETA ≤ required-by, §2E/§2F)
  + Timely Approved / Committed Supply
  − Remaining Days Demand
  − Next Month Target Adjusted Regular FC
  − Pull-Forward Special Event FC
```

Where:
```
Remaining Days Demand
  = Remaining Days In Current Month × Previous Month Avg Sales Per Day

Target Adjusted Regular FC
  = Regular FC × Target Rule %        (Default Target Rule = 100%)
```

> **Note:** This is a **supply planning projection**, not a pure month-end accounting inventory formula. The current (partial) month consumes the **run-rate** remaining-days demand plus the forward-looking obligations (next-month target FC and any pulled-forward event demand) that must be covered from the current destination position. See §27 for the T1–T4 monthly tiers this balance feeds.

**Example (Factory Stock excluded from the destination balance):**

| Term | Value |
|------|-------|
| Destination Sellable Current Stock | 1,200 |
| Timely Qualified Incoming | 200 |
| Timely Approved / Committed Supply | 0 |
| Remaining Days Demand (10 × 50) | 500 |
| Next Month Target Adj. Regular FC | 900 |
| Pull-Forward Special Event FC | 0 |
| **Destination Projected Balance** | 1,200 + 200 + 0 − 500 − 900 − 0 = **0 (balanced)** |

*(Factory Stock, if any, is not shown here — it is a source that would supply a shortage via §31 shipping/production, not a destination inventory term.)*

> **SUPERSEDED formula (do not use):** `Current Inventory + Allocated Factory Stock + On-The-Way − Remaining Days Demand − Next Month FC − Event FC`. The `+ Allocated Factory Stock` term is removed per the v4.0 correction above.

---

## 9. Future Month Projection Logic

For future month **N**:
```
Projected Balance[N]
  = Projected Balance[N-1]
  + Completed Orders / Incoming Production assigned to month N-1
  + Relevant incoming shipment / on-the-way arrivals
  − Target Adjusted Regular FC[N]
  − Pull-Forward Special Event FC[N]
```

- **Recursive:** each future month starts from the **prior month's projected balance**.
- Inventory arriving (production completed in N-1, shipments arriving) **adds**; that month's forecast (regular adjusted + pulled-forward event) **subtracts**.

**Example:**

| Month | Opening | + Incoming | − Reg FC (adj) | − Event FC | Closing |
|-------|---------|-----------|----------------|-----------|---------|
| Current | — | — | — | — | 300 |
| N+1 | 300 | 0 | 1,000 | 0 | −700 (shortage) |
| N+2 | −700 | 1,500 | 1,000 | 0 | −200 (shortage) |

---

## 10. Special Event Pull-Forward Logic

> **CANONICAL (2026-07-22): the calculation engine uses the EXACT Preparation Date.**
> ```
> Event Preparation Date = Event Start Date − 30 calendar days
> ```
> The engine judges all Need buckets (`0–18 / 19–30 / 31–45 / 46–90`) against the **Preparation Date** defined above. **This document (§10) is the sole authoritative owner of the Preparation-Date formula**; `INVENTORY_TABLE_MAPPING_SPEC.md` §8.1 is a **consumer view**, not the owner. The **Monthly UI** places the event demand in the **month containing the Preparation Date**.
>
> **SUPERSEDED:** the previous rule that event demand is *always* placed into the calendar month **before the event period** is now only a **legacy monthly approximation** (retained below for the coarse monthly-projection view). Where the exact-date rule and the previous-month approximation differ, the **exact Preparation Date wins.**

**Legacy monthly approximation (retained, superseded by the exact-date rule above):** Event in **October** → roughly the **September** projection.

| Event | Event Month | (Legacy) Impacts Projection Month | Exact-date basis |
|-------|-------------|-----------------------------------|------------------|
| Fall Prime | October | September | month containing (Event Start − 30d) |
| Prime Day | July | June | month containing (Event Start − 30d) |
| BFCM | November | October | month containing (Event Start − 30d) |
| Spring Deal | March | February | month containing (Event Start − 30d) |

Special Event Demand (canonical contract):
- **Additive** to Regular Demand; **always 100%**; **not affected by Target Rules**.
- **NOT deleted by Shipping Plan or Shipment creation** — offset **only** by timely eligible supply.
- **Sales-Driven:** event dates are **excluded from Normalized Avg Sales** (§22.2); the event FC is then added **exactly once** — do **not** double-count event uplift through both the sales run-rate and the event FC.

### 10.1 Special Event Coverage Lifecycle (CANONICAL 2026-07-22)

```
Not Planned → Draft Planned → Approved Planned → In Transit → In Transit — Late Risk
  → Partially Received → Received → Closed / Archived
```

**Recognition rules:**
- **Not Planned** — event demand exists, no supply yet; full gap.
- **Draft Planned** — displayed as pending; **does NOT reduce confirmed risk** (Draft ≠ qualified supply).
- **Approved Planned** — offsets demand **only when planned arrival is on time** (ETA ≤ Preparation/Required Date).
- **In Transit** — Qualified Incoming **only when ETA ≤ Required Date**.
- **In Transit — Late Risk** — incoming stays visible but **does not cover** the original time gap (ETA > Required Date).
- **Partially Received** — split the supply lineage into a received part and an unreceived residual (§30); recalculate the residual gap. The two parts together never exceed the original supply quantity.
- **Received** — move quantity from Incoming to Current Stock; **never count both**.
- **Closed / Archived** — removed from the Active Recommendation Summary; **History/Audit preserved**.

> **CANONICAL CORRECTION (v4.0):** there is **NO standalone `Received Qty` deduction term.** Received quantity is represented exactly once through the Supply Ledger (§25, §30): once a receipt is posted it lives **only** in Current Stock; a confirmed-but-not-yet-reflected receipt lives **only** in `Received-not-yet-reflected` incoming. The Event gap therefore nets Current Stock + timely qualified supply — never Current Stock **and** a separate Received Qty (that was a double-deduction).

```
Event Net Gap = max( 0,
    Event Demand
  − Destination Sellable Current Stock (incl. any posted receipt)
  − Timely Qualified Incoming (incl. Received-not-yet-reflected, ETA ≤ Preparation/Required Date)
  − Timely Approved / Committed Supply )
```

> **SUPERSEDED formula (do not use):** `Event Demand − Timely Approved Supply − Timely Qualified Incoming − Received Qty` — the trailing `− Received Qty` double-counts receipts already inside Current Stock / Received-not-yet-reflected incoming.

**Event Close conditions (all must hold):** event period ended · no unresolved residual gap · no open shipment exception · no pending partial receipt · audit data preserved. (Exceptions to any condition keep the event Active.)

---

## 11. Shortage and Surplus Definitions

```
Projected Balance < 0   →  Shortage = ABS(Projected Balance)
Projected Balance > 0   →  Surplus  = Projected Balance
Projected Balance = 0   →  No shortage and no surplus
```

| Projected Balance | Shortage | Surplus |
|-------------------|----------|---------|
| −300 | 300 | 0 |
| 0 | 0 | 0 |
| +1,000 | 0 | 1,000 |

---

## 12. Company Reallocation Logic

Before creating the final order need, pool shortage/surplus across `KM` / `ResUS` / `ResTW` — **but only through FEASIBLE reallocation.** The naive group net below is valid **only** when every surplus is legally and timely transferable to the shortage it offsets; the binding rule is the per-pair feasibility contract in **§32** (same Master SKU · same planning cycle · same Required-by tier/bucket · compatible packaging · donor's own need + committed obligations satisfied · real remaining surplus · transfer/route lead time completes before the receiver's Required-by date · supply not already consumed · each surplus consumed once). **A positive group balance never overrides location/timing feasibility.**

```
# Canonical form (per §32 — feasibility-gated):
Feasible Reallocation Qty(donor→receiver)
  = MIN(Receiver Remaining Shortage, Donor Remaining Surplus, Timely Transferable Qty)

Net Order Need = Σ (Remaining Shortage after all legal reallocation)

# The group-net shorthand below is the SPECIAL CASE where all surplus is feasibly transferable:
Total Shortage = Σ max(0, −company_projected_balance)   (same SKU + same tier only)
Total Surplus  = Σ max(0,  company_projected_balance)    (feasibly transferable only)
Net Order Need = max(0, Total Shortage − Total Surplus)
```

**Example (all surplus same-SKU, same-tier, timely-transferable — the shorthand applies):**

| Company | Position |
|---------|----------|
| KM | Shortage 1,000 |
| ResTW | Shortage 500 |
| ResUS | Surplus 1,200 |

```
Total Shortage = 1,000 + 500 = 1,500
Total Surplus  = 1,200
Net Order Need = max(0, 1,500 − 1,200) = 300
```

> **Important:** This reallocation happens **after** forecast/inventory projection (Layer A) and **before** the final order recommendation (Layer B). **Different SKUs never offset; a later-tier surplus never covers an earlier-tier shortage; a surplus that cannot be transferred in time is not netted (§32).**

---

## 13. Factory Shared Pool Logic

**Factories:** `CN_YOUXIN`, `TW_SHENGYI` — **shared production resources, not companies.**

- Factory stock can be used as a **shared source pool** in planning (source-side only — never a destination inventory term, §8/§31).
- **Company restriction should NOT block shortage calculation** — the goal is to compute **real net shortage** accurately across the group.
- **Deterministic allocation order is now FROZEN in §35** (grain `warehouse_id + Master SKU`; order = earliest Required-by date → higher `allocation_priority` → stable company/marketplace/destination key; remaining source quantity decremented after each allocation; never duplicated to multiple companies).
- **`TW_SHENGYI` preferred-use is a Future Extension (§19)** — no hidden default priority. It applies **only** when an explicit SKU/Series/route mapping specifies it; absent such mapping, the deterministic order in §35 governs.

---

## 14. Order Need and Carton Rounding

```
Net Order Need = Σ (Remaining Shortage after legal reallocation, §12/§32)

Suggested Order Qty = CEILING(Net Order Need ÷ Units Per Carton) × Units Per Carton
```

- **Units Per Carton source:** the **canonical SKU master mapping** (`sku_details`) only.
- **Missing `units_per_carton` (CANONICAL v4.1):** **no silent default (never 1, 12, or any other number).** The raw Net Order Need may be **displayed**, but the **Suggested Order Qty shows `Calculation Blocked / Manual Review Required`**, and **Send Request is blocked** until the carton configuration is fixed. No fabricated suggested quantity is produced. (Full data contract §34.)
- **User Order Qty is independent of Suggested Order Qty.** When a valid UPC exists, the user MAY enter a **partial-carton** Order Qty; a partial-carton override **never rewrites Suggested** and the UI/payload must preserve that it is a user override (see §14 / Request Order UI).
- **MOQ is NOT auto-derived in Phase 1** — any MOQ automation is a Future Extension (§19) and must not block this carton rule.

**Example:** Net Order Need = 300, Units Per Carton = 40 → CEILING(300/40) × 40 = 8 × 40 = **320**.

---

## 15. Request Order / 下單系統 Role

**Inputs:** forecast, inventory, factory stock, overseas warehouse stock, shipment on-the-way, company reallocation, carton rounding.

**Outputs:**
- Recommended order need
- Editable user request qty
- **Persistence (existing lifecycle — `purchase_orders` is NOT a Future table):** the live calculation preview is **not** persisted; scheduled/manual **shipping recommendations** persist through `shipping_allocation_drafts` / `shipping_allocation_draft_lines`; monthly/emergency **order recommendations** persist through `request_order_allocation_drafts` / `request_order_allocation_draft_lines`. **Only after an explicit user decision** does the result enter the **existing** `request_orders` / `request_order_lines` lifecycle and then `purchase_orders` / `purchase_order_lines` through conversion. Detailed schema is owned by `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` (this document is not the DB-schema owner); **Calculation Runtime remains NOT IMPLEMENTED.**
- *Future:* generated documents (Document Engine)

> **Request Order is the bridge between planning calculation and procurement records.**

---

## 16. Inventory Replenishment vs Request Order

| Aspect | Inventory Replenishment | Request Order / 下單系統 |
|--------|--------------------------|---------------------------|
| Level | Operational replenishment to marketplace / warehouse | Group-level procurement planning |
| Inputs | Target Days, avg sales, site inventory, on-the-way, shipping allocation preview | Monthly projection, shortage/surplus, reallocation |
| Math | Required Coverage Demand (Target Days × avg sales) | Net Order Need (after reallocation) + carton rounding |
| Persists | `shipping_plans` only when user submits | Existing lifecycle (not Future): `request_order_allocation_drafts` → (user decision) `request_orders` / `request_order_lines` → `purchase_orders` via conversion |
| Question answered | "What to ship to the site now?" | "What must the group actually produce/order?" |

---

## 17. Validation Rules (high level)

- Required SKU must exist in `sku_details`.
- Required marketplace SKU must map to `company / country / marketplace`.
- `units_per_carton` required for carton rounding — **missing → Suggested Order Qty = `Calculation Blocked / Manual Review Required` and Send Request blocked (no silent default), §14/§34.**
- Missing target rules default to **100%** (Target Rule only; never applied to Special Event FC).
- Missing special event FC means **0** *event* demand (not a missing-data block — Regular demand still computes).
- **Missing Forecast on a Forecast-Driven SKU, or missing sales basis on a Sales-Driven SKU → calculation blocked / review (§34); never treated as 0.**
- Shipment on-the-way requires **ETA** to enter an ETA bucket; **missing ETA → visible but not counted as timely supply (§34).**
- **Missing / stale platform snapshot → `MISSING_SNAPSHOT` / `STALE_SNAPSHOT`; never auto-0 (§34).**
- **Calculation preview must NOT persist unless the user submits.**

---

## 18. Non-Goals

- No AR/AP accounting formulas.
- No journal entries.
- No SO billing logic.
- No code implementation.
- No UI-specific error text.
- No automatic email sending.

---

## 19. Open Items — CLOSED at v4.0

**All calculation-result-affecting Open Items are CLOSED (frozen).** None of the following can still change a v4.0 engine result:

| Former Open Item | Closed by |
|------------------|-----------|
| Current-month formula | §8 + §27 (Factory Stock removed from destination balance; T1 = remaining-days + Month+1 Base FC) |
| Exact-date bucket thresholds | §26 (0–18 / 19–30 / 31–45 / 46–90 + boundary table) |
| Special-event Preparation Date | §10 / §29F (Event Start − 30 calendar days, exact date) |
| Count-once lifecycle & Received handling | §25 / §30 (single Supply Ledger lineage; no standalone Received Qty) |
| Factory source allocation order | §35 (deterministic order) |
| Shared 3PL eligibility & FBA/3PL separation | §23 / §24 / §23.6 (warehouse-side eligibility; separate buckets) |
| Platform participation in 3PL reserve | §23.6 / §24.9 (reserve participation; never merged into FBA Current Stock) |
| Integer reconciliation | §26 / §31 / §24.5–§24.7 (deterministic largest-remainder) |
| Company reallocation grain | §32 (same SKU + same tier + timely-transferable; surplus once) |
| Shipment FLOOR / Order CEILING | §2C.1 / §31 (FLOOR ship) / §14 (CEILING order) |
| Missing UPC handling | §14 / §34 (block submit; no silent default) |

**Future Extensions / Non-Blocking** (do NOT affect the current two engines; deferred, not blocking the freeze): AI learning & automatic statistical correction · dynamic Safety Stock / dynamic optimization · dynamic carrier / air-vs-sea optimization beyond §24.11 · intercompany accounting automation (SO/PO/AR/AP ownership) · ERP `sales_orders` ownership layer · future configured `TW_SHENGYI` preference (§35) · MOQ automation (§14) · BigQuery intelligence. See the Future Extensions summary in `project-current-state.md`.

---

## 20. Overseas Shared Inventory Allocation Engine

Defines how **shared overseas warehouse inventory** is allocated across self-fulfilled sites. **This section (§20) is the authoritative overseas allocation calculation rule; [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) §16 only maps / displays this owner output.** **Calculation rule only — no code, no DB, no implementation.**

### 20.1 Allocation Scope

- Allocate **only within the same Company AND the same Country.**
- **Never allocate across companies. Never allocate across countries.**
- Eligible supply = `overseas_inventory_snapshot.wh_available_stock` (`wh_physical_stock − wh_reserved_stock − wh_damaged_stock`) across **eligible overseas warehouses** for that company + country. *(2026-07-21: canonical `wh_*` names; formula unchanged.)*

### 20.2 Fulfillment Model behavior (Platform vs Self vs Hybrid)

| `fulfillment_model` | Shared 3PL RESERVE participation? | Current-Stock composition | Behavior |
|---------------------|-----------------------------------|---------------------------|----------|
| `platform_fulfilled` | **Yes (reserve only)** | Platform (FBA) snapshot only | FBA sellable stock is its Current Stock; it **also** participates in the shared 3PL **replenishment reserve** display (the reserve can later replenish FBA). The reserve allocation is shown as **`3PL Replenishment Reserve`**, **never merged into FBA Current Stock** (§24 addendum, §23.6 freeze). |
| `self_fulfilled` | **Yes** | Site Planning Available (allocated 3PL) | Uses shared overseas inventory; allocation **required**. |
| `hybrid` | **Per lane** | Platform lane + 3PL lane, separate | Platform inventory and shared 3PL inventory are **separate supply buckets, explicitly lane-allocated**; never implicitly merged. |

> **CANONICAL v4.1 (supersedes the old "platform_fulfilled = No shared allocation"):** participation in the shared 3PL **reserve** is decided by **warehouse-side eligibility** (`company + country + warehouse_type='3PL' + is_active`), not by fulfillment model. What fulfillment model governs is **Current-Stock composition** — platform FBA stock and 3PL reserve are **separate buckets/lineages and are never added into one Current Stock.**

### 20.3 Minimum Survival Stock = 18 Days (highest priority)

- **Before any priority distribution**, every eligible self-fulfilled site must first receive enough inventory to **survive 18 days**.
```
Survival Need[site] = 18 × Avg Sales Per Day[site]
```
- **Avg Sales Per Day is resolved EXCLUSIVELY by §22** (never by an Inventory Table mapping field, and there is no separate "engine-defined run-rate" entry point). §22 searches within the **latest 90 completed calendar days**, selects the **latest 30 eligible normal sales days**, and divides by the **actual eligible normal-day count**; **confirmed zero-sales days count as eligible days**; a **missing source date is not zero**; the **§22 fallback ladder** governs insufficient eligible-day coverage. `sales_units_7d ÷ 7` is only §22's weekly **fallback** rung — never a canonical default here.
- Survival allocation is the **highest priority**; only **remaining** inventory after all sites hit 18-day survival stock continues to §20.4.

### 20.4 Allocation Priority (remaining inventory)

- After all eligible sites reach 18-day survival stock, distribute the **remaining** inventory by **`marketplaces.allocation_priority`**.
- **Higher number = higher priority.** Editable by PM.
- Ties / leftover rounding reconciliation: **RESOLVED — deterministic largest-remainder** per §24.5–§24.7 / §31 / §34 (Specification finalized; runtime mapping pending).

### 20.5 Need Calculation alignment (Sales Driven / Forecast Driven)

The allocation consumes the **Need** computed from the canonical formulas in this document (§2C Sales-Driven / §2D Forecast-Driven — the sole formula owner) and surfaced on the Inventory Table page (`INVENTORY_TABLE_MAPPING_SPEC.md` §14–§15 = display/mapping context only):

- **Sales Driven** — cumulative incremental Need over buckets `0–18 / 19–30 / 31–45 / 46–90`. **Each upcoming event counted once; each on-the-way shipment deducted once** (FIFO by ETA). The engine result is the **Engine A live Remaining Need / Shortage** — final remaining demand after Current Stock, On-the-Way, and Upcoming Event are processed (min 0). This is **not** Suggested Order Qty; it becomes an order recommendation only after Engine B reallocation → `Net Order Need`. **Canonical formula: §2C (all terms); §26 exact-date window; §29E normalized ladder.**
- **Forecast Driven** — **canonical formula: §2D** (do not restate a partial version here). The complete demand set is **Target-Adjusted Regular FC (§2D / §29F) + 30-Day Safety Demand (§29G) + Special Event Demand (§10) − Current Stock − Qualified Incoming − Approved/Committed Supply**. *(This bullet is a pointer only; the earlier one-line "Forecast M+1 + M+2 + Safety − Stock − On-the-Way" summary omitted Special Event Demand and Approved/Committed Supply and is superseded by §2D.)*

### 20.6 Future Shipping Allocation Extension

- `allocation_priority` becomes the **system-wide shared allocation priority**.
- Future **Factory Allocation**, **Shipping Allocation**, and **Carrier Capacity** allocation may **reuse the same priority field** rather than defining parallel priorities.
- This remains **planning only** — it does not deduct physical stock, transfer ownership, or create intercompany SO/PO/AR/AP. Physical deduction still happens only at shipment **Confirm & Ship** (`SHIPMENT_CENTER_SPEC.md` §15.1).

> **Items RESOLVED at v4.1 (Specification finalized; runtime mapping pending where noted):**
> - **Eligible-warehouse resolution** → §23.6 / §24.9 (warehouse-side eligibility `company + country + warehouse_type='3PL' + is_active`).
> - **Integer allocation rounding + reconciliation** → §24.5–§24.7 / §31 / §34 (deterministic largest-remainder; `Σalloc ≤ pool`).
> - **Exact Avg-Sales run-rate window** → §22.2–§22.6 (latest 90 completed days → latest 30 eligible normal days).
>
> **Remaining Future Extension (non-blocking, does not affect the current two engines):** cross-site / cross-company borrowing of *unused* allocation (planning exception only — see `SHIPMENT_CENTER_SPEC.md` §19.3).

---

## 21. Supply Planning Optimization Goal

Defines the **system default objective** the planning engine optimizes toward when proposing replenishment / shipping. This is a calculation/priority rule only — it does **not** change any shortage/projection/allocation formula and is **not** an implementation.

### 21.1 System Default Objective (priority order)

The system optimizes in this strict priority order — a lower priority is improved **only without sacrificing a higher one**:

| Priority | Goal | Meaning |
|----------|------|---------|
| **Priority 1** | **Supply Safety** | Demand coverage / no stockout. Highest priority — never traded away. Must at minimum satisfy the **18-day Minimum Survival Stock** (§20.3) for eligible self-fulfilled sites. |
| **Priority 2** | **Lowest Logistics Cost** | Among options that keep supply safe, choose the cheapest. The system should **always try to satisfy demand by the slowest available shipping method first** (slowest = cheapest). |
| **Priority 3** | **Minimum Number of Shipments** | Prefer fewer, consolidated shipments over many small ones. |
| **Priority 4** | **Container Utilization** | Fill containers efficiently (improve fill rate) once the above are satisfied. |

### 21.2 Default shipping behavior

- The system should **default to planning 45-day sea freight** (the slowest / cheapest mode).
- Faster logistics is **escalated step-by-step only when** the **18-day Minimum Survival Stock cannot be met** by the slower mode (i.e. supply safety, Priority 1, would be violated).
- **The system must NOT default to recommending air freight.** Air (and other expedited modes) are exceptions used only to protect supply safety, never the default proposal.

> This goal frames how suggestions are ranked; it does not override the canonical Need calculation (this document §2C / §2D — the sole formula owner; `INVENTORY_TABLE_MAPPING_SPEC.md` §14–§15 is display/mapping context only), the allocation engine (§20), or Shipment Center execution (which remains a separate module). Shipment-method allocation detail lives in the future Allocation / Shipment specs.

---

## 22. Normalized Avg Sales / Day Rule

Avg Sales/Day drives Days of Supply and the Sales-Driven replenishment baseline. The **Sales-Driven baseline is always the normalized sampling ladder** (§22.2–§22.3): the latest **30 eligible normal sales days** collected backward within the **latest 90 completed calendar days**, divided by the **actual** `normal_day_count`. Because a single Special Event / Campaign / Deal day can spike sales and **falsely inflate** the baseline, event/promotion selling days are **excluded from the sample**; when no such days exist the sample simply has **zero excluded dates** and the same ladder still applies. `weekly_7d` is **only** the `< 3`-eligible-normal-day fallback rung (§22.3) — **never** a "no-contamination default".

### 22.1 Default (Sales-Driven)

```
Sales-Driven Avg Sales/Day
  = normalized sampling ladder (§22.2–§22.3) within the latest 90 COMPLETED calendar days
  = SUM(sales_units on the latest ≤30 eligible normal days) ÷ actual normal_day_count
```

`amazon_weekly_sales_snapshot.sales_units_7d ÷ 7` (**`weekly_7d`**) is **not** the default — it is used **only** as the `normal_day_count < 3` fallback rung of the §22.3 ladder.

### 22.2 Campaign / Special-Event contamination EXCLUSION rules (within the normalized sampling) (CANONICAL v4.1, 2026-07-24)

The Sales-Driven baseline **always** computes a **Normalized Avg Sales** from `amazon_daily_sales_snapshot` (§22.1). This subsection defines **which days are excluded** from that sample. **The 30-day sample is a HISTORICAL normal-sales sample, NOT a future 30-day window** — search **backward** and collect the latest eligible normal days; **skip** any day overlapping a Special Event / Campaign / Deal that applies to this SKU. When the SKU has **no** applicable event/campaign day in the window, the excluded-day count is simply **0** and the same sampling proceeds over the available daily-sales days (it does **not** fall back to `sales_units_7d ÷ 7`).

**Source Lookback Window (raw search range only):**
```
Source Lookback Window = the latest 90 COMPLETED calendar days
                       = (calculation_date − 90 days) through (calculation_date − 1 day)   [today excluded]
```

**Eligible Normal Sales Days (the actual sample):**
```
Eligible Normal Sales Days
  = starting from the most recent date and walking backward inside the 90-day window,
    skip Campaign / Deal / Special-Event dates,
    and collect the latest 30 eligible normal sales days
```

**Exclusion rules (canonical):**
1. **Campaign days** are excluded **only when this Marketplace SKU actually appears in a `campaign_sku_lines` row** for that campaign — i.e. only campaigns the SKU actually participated in.
2. **Special Event days** are excluded when an `fc_special_events` row's Event Start–End range applies to this SKU / Company / Country / Marketplace / Site.
3. A day that is **both** Campaign and Special Event is excluded **once** (a date is either normal or excluded — no double removal, no double count).
4. **Do NOT exclude a day for an unrelated SKU** just because some other SKU on the same Marketplace ran a campaign that day. Exclusion is per-SKU participation, never site-wide.
5. **Cancelled / invalid events** are judged by the canonical status contract (§10.1 lifecycle / event status) — an invalid or cancelled event is **not** a contamination day and must not be counted as an exclusion.
6. The **Event Preparation Date is NOT a contamination period.** Only the actual **Event / Campaign selling dates** (Start–End) are excluded — the −30-day prep window (§10) has no effect here.

```
normal_day_count = number of eligible normal days actually collected (≤ 30)

Avg. Sales/day = SUM(sales_units on eligible normal days) ÷ normal_day_count
```

### 22.3 Sample size & fallback ladder (by eligible normal days)

- When **30** eligible normal days are collected, the denominator is **30**.
- When **fewer than 30** eligible normal days exist inside the 90-day window, **divide by the actual `normal_day_count` — never keep dividing by a fixed 30.**
- **Never extend past the 90-day Source Lookback Window** merely to reach 30 days.
- A **confirmed zero-sales day** (data present, quantity = 0) **counts as a normal day** with value 0. A **missing day** (no data row) is **not** silently treated as zero — it simply is not an eligible normal day.
- **Source and Warning are fully decoupled** — the source records *which* Avg Sales basis was used; the warning records *data quality*. They are independent fields (never combined into one token).

| `normal_day_count` | `source` | Avg Sales/Day used | `warning` |
|--------------------|----------|--------------------|-----------|
| **≥ 7** | `normalized_30d` | `SUM(normal-day sales) ÷ normal_day_count` | blank |
| **3 – 6** | `normalized_30d` | `SUM(normal-day sales) ÷ normal_day_count` | `low_sample_warning` |
| **< 3** | `weekly_7d` | `sales_units_7d ÷ 7` (weekly fallback) | `insufficient_normal_days` |

- **Correct:** `source = normalized_30d` + `warning = low_sample_warning` (two separate values). **Do NOT** combine into `normalized_30d_low_sample`.
- **No contamination in the window** means simply **zero excluded dates** — the normalized sampling ladder (the table above) **still applies** (collect the latest eligible normal days and divide by the actual `normal_day_count`; `source = normalized_30d` when `normal_day_count ≥ 3`). It does **NOT** fall back to `weekly_7d`. `weekly_7d` (`source = weekly_7d`, `warning = insufficient_normal_days`) is used **only** on the `normal_day_count < 3` rung; if that fallback weekly value is itself event-affected, `warning = event_contaminated_weekly_sales` may accompany it as a data-quality note (still never a no-contamination default).
- **Event / double-count guard:** because event/campaign selling days are excluded from this run-rate, the **Special Event FC is added back exactly once** downstream (§10, §29E). The same event must never both inflate Avg. Sales/day and be added again as Event FC.

### 22.4 Forecast-Driven SKUs

- For **Forecast-Driven** SKUs, **Avg Sales is auxiliary reference only** and **must not** be the primary replenishment basis (the Forecast-Driven formula in **this document §2D governs**; `INVENTORY_TABLE_MAPPING_SPEC.md` §15 is display/mapping context only and does **not** own the formula). The normalization still applies to the displayed Avg Sales, but it does not drive the Forecast-Driven demand result.

### 22.5 Persistence at Decision Commit

The **chosen** Avg Sales/Day, the **source**, the **normal/excluded day counts**, and any **warning** are frozen onto `shipping_plan_lines` at Submit Plan (Decision Commit) via `snapshot_avg_sales_per_day`, `snapshot_avg_sales_source`, `snapshot_normal_days_count`, `snapshot_excluded_event_days_count`, `snapshot_avg_sales_warning` (see `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §5). The snapshot is the Decision Truth and is never recalculated afterward (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`).

**Snapshot Provenance (architecture reserved).** `snapshot_avg_sales_source` is the **current persisted metadata** — it records the **Source** that produced the value (`weekly_7d` / `normalized_30d` / …). The broader **Snapshot Provenance** concept — *which engine / decision produced the value* (AI Engine, Forecast Engine, Planning Engine, Promotion Normalization, Current MVP Rule) — is **architecture-reserved for a future AI / Planning audit trail** and is **NOT persisted** today (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §4B). **No new column / table is added by this note.**

> **Scope:** this rule defines the calculation; it adds **no new table** and **no BigQuery schema change**. It depends on the Daily Sales snapshot covering the **90 completed-day Source Lookback Window** (§22.2), from which the latest 30 eligible normal days are sampled (`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`).
>
> **Spec status:** Avg. Sales/day sample-acquisition **FINALIZED v4.1 (2026-07-24)**. **Runtime: NOT IMPLEMENTED. Executable Test: PENDING.** No calculation engine was built in this round.

### 22.6 Runtime Calculation Rule (Runtime result vs Persistent data)

**`normalized_avg_sales_per_day` is a Runtime Calculation Result, NOT a Database Column.**

- The **Runtime Engine recalculates it every time**: it **searches the latest 90 completed calendar days and derives Avg. Sales/day from the latest 30 eligible normal sales days** within that window (excluding this SKU's Campaign/Special-Event days, §22.2), dividing by the actual `normal_day_count`; it is never stored. *(The Daily Sales source-availability contract — 90 completed days retention/lookback/backfill — is `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`; if the current importer runtime still retains only 30 days, that is a recorded runtime mapping gap, not a spec change.)*
- The **Inventory Table displays the Runtime result** (Analysis Layer — always reflects the latest data; `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §2.1).
- It is **not written to any persistent table** during analysis.
- **Only at Submit Plan (Decision Commit)** is the final adopted Avg Sales/Day written to **`shipping_plan_lines.snapshot_avg_sales_per_day`** (together with `snapshot_avg_sales_source` / `snapshot_avg_sales_warning` / day counts). From that moment it is an **immutable Decision Snapshot** (Decision Layer) and is never recalculated (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §4, §8A).

> In short: **Analysis Layer = Runtime recompute (not persisted); Decision Layer = frozen snapshot at Submit Plan.** This rule changes no calculation logic — it only states where the value lives.

---

## 23. Shared Overseas Physical Pool — Grain, Deduplication, Allocation & Display (CANONICAL CORRECTION 2026-07-20)

Refines §7 (FC Share) and §20 (Overseas Shared Inventory Allocation Engine). **The shared physical pool is counted ONCE; per-marketplace figures are a distribution of that pool, never extra supply.** Analysis Layer only — no persistence table is created.

### 23.1 Physical grain (build the pool exactly once)
- **Shared Physical Pool Key = `company + warehouse_id + Master SKU`.** **Marketplace is NOT part of the physical grain** for shared 3PL stock.
- **Physical Available = `wh_physical_stock − wh_reserved_stock − wh_damaged_stock`** (per eligible warehouse row).
- If several eligible 3PL warehouses form one operational pool: **Shared Physical Available = SUM(deduplicated eligible warehouse rows)**, deduplicated by `company + warehouse_id + Master SKU` — **never by marketplace row**.
- **Shared self-fulfilled marketplaces** (Shopify / Target / Walmart / Wayfair / other self-fulfilled) **may share one physical warehouse inventory**. Adding multiple Marketplace SKUs for one Master SKU must **not** duplicate the physical pool.
- **PROHIBITED** (only 1,000 physical units exist):
  ```
  Shopify 1,000 + Target 1,000 + Walmart 1,000 + Wayfair 1,000 = 4,000   ← WRONG
  ```

### 23.2 Allocation sequence (each Marketplace demand independent, one shared pool)
1. **One Physical Shared Pool** (§23.1).
2. **Each eligible Marketplace's demand** via the **existing** Need formulas (§20.5): Sales-Driven or Forecast-Driven. **Do not replace these formulas.**
3. **18-day survival first** (§20.3, preserved): every eligible site first receives up to its **actual Need**, capped at survival need; if the pool can't satisfy all 18-day needs, distribute by the **existing shortage/priority rule** (§20.4 `allocation_priority`).
4. **Remaining pool** → remaining unmet Need: **FC Share** (§7) is the proportional **weight for Forecast-Driven** demand; **sales/run-rate** weight for Sales-Driven; `allocation_priority` is a priority/tie-break input. **Never allocate more than a site's calculated Need** unless explicitly classified as unused/unallocated pool. FC Share is a **weighting input, not a hard entitlement and not duplicated physical stock** (see also `SHIPMENT_CENTER_SPEC.md` §19.2 V1).
5. **Integer/carton reconciliation:** integer quantities; deterministic rounding remainder; **never exceed Shared Physical Available.**

### 23.3 Required invariants
```
site_shared_allocation_qty >= 0
SUM(site_shared_allocation_qty) <= shared_physical_available_qty
unallocated_shared_pool_qty = shared_physical_available_qty − SUM(site_shared_allocation_qty)
unallocated_shared_pool_qty >= 0
```
The allocation is **Analysis Layer only** — not physical stock, not ownership, not inventory movement, not a second snapshot row; recalculable; **never added back to physical stock totals.**

### 23.4 Inventory Replenishment display semantics
- **Displayed Site Planning Available = Exclusive Site Stock + Shared Warehouse Allocation for the current site.** For a pure shared-3PL marketplace, Exclusive Site Stock is normally zero, so **Displayed Current Stock = Shared Warehouse Allocation**.
- The number MUST be labelled **"Planning Available"** or **"Shared Warehouse Allocation"** — it must **not** imply the site physically owns the entire pool.
- **Expanded stock detail** distinguishes: Physical Shared Pool · Allocated to Current Site · Allocated to Other Sites · Unallocated Pool · Reserved · Damaged · Qualified On-the-Way.
- **Days of Supply & Suggested Qty** for the selected marketplace use **its Site Planning Available + its Qualified On-the-Way + its own sales/forecast demand** — **never the entire shared physical pool.** (Where §20.5 Forecast-Driven uses "Current Stock", substitute the site's allocated Planning Available.)

### 23.5 All-Marketplace aggregation
When **All Marketplaces** is selected: **physical stock deduplicated by `company + warehouse_id + Master SKU` and counted once.** Marketplace planning allocations may be shown as a breakdown that **sums to ≤ the physical pool** and are **never added to** it. PROHIBITED: `Physical Pool + Shopify + Target + Walmart + Wayfair`. Allocations are a **distribution** of the pool, not extra supply.

### 23.6 Fulfillment-model boundary (CANONICAL v4.1 — reserve participation vs Current-Stock composition)
- **`platform_fulfilled`** (e.g. Amazon FBA): FBA inventory is the marketplace's **Current Stock** (never merged with 3PL). It **still participates in the shared 3PL replenishment RESERVE** display when the warehouse-side eligibility holds (`company + country + warehouse_type='3PL' + is_active`); that reserve allocation is shown separately as **`3PL Replenishment Reserve`** and is a **future eligible source** to replenish FBA — it is **never added into FBA Current Stock**. *(Supersedes the earlier "platform_fulfilled excluded / exclusive" wording.)*
- **`self_fulfilled`** (Shopify / Target / Walmart / Wayfair on shared 3PL): **participates** in shared allocation; the allocation IS its Planning Available.
- **`hybrid`:** platform stock and shared 3PL stock are **separate supply buckets** — explicit lane allocation; **never collapse the two physical buckets before calculation.**

**Specification: FINALIZED v4.1. Runtime: NOT IMPLEMENTED.** No new persistence table is created.

---

## 24. FBA Inventory Source + Three-Mode Shared FBM Allocation (CANONICAL ADDENDUM 2026-07-20)

Incremental addition on top of §23 (does not reverse it) and §20. Analysis Layer only; **no persistence table, no DB/Runtime change.**

> **ADDENDUM (2026-07-22) — 3PL RESERVE participation vs Current-Stock separation.** The exclusion below
> concerns **Current Stock composition** only: platform (FBA) inventory is never *merged into* a
> marketplace's sellable Current Stock, and self-fulfilled Planning Available is never labelled platform
> stock. It does **NOT** mean a platform-fulfilled marketplace is barred from the shared overseas **3PL
> replenishment reserve**. The 3PL pool is a company+country replenishment reserve that can later
> replenish the platform warehouse (e.g. FBA inbound); therefore the **"3rd Party Stock" / Site Planning
> Available display allocates the shared 3PL pool across every scoped marketplace regardless of
> fulfillment model** (eligibility is warehouse-side only: `company + country + warehouse_type='3PL' +
> is_active`). This supersedes the earlier "platform-fulfilled excluded from the 3PL display" behavior in
> Inventory Replenishment. It remains **display/planning only** — no movement, no reservation, no snapshot
> write, and it does not merge 3PL qty into platform Current Stock.

### 24.1 Fulfillment inventory separation (formalized)
- **`platform_fulfilled` (e.g. Amazon FBA):** platform inventory is exclusive for **Current Stock composition** — it is **never combined with shared 3PL inventory into Current Stock**, and self-fulfilled Planning Available is never labelled as platform stock. Current Stock from the platform source (§24.2). *(Per the 2026-07-22 addendum above, this does not exclude the marketplace from the shared 3PL **reserve** display / Site Planning Available.)*
- **`self_fulfilled` (Shopify/Target/Walmart/Wayfair on shared 3PL):** physical inventory held **once** by `company + warehouse_id + Master SKU`; marketplace is a demand/planning dimension, not physical identity. Each eligible marketplace gets a **recalculated virtual Planning Allocation**; `SUM(site allocations) ≤ shared physical available`; virtual allocation moves no inventory and creates no ownership.
- **`hybrid`:** platform and shared 3PL are **separate supply buckets** — platform portion follows §24.2, shared portion follows §24.3–§24.6; **never collapse both into one Current Stock before calculation.**

### 24.2 FBA inventory source precedence (two mutually-exclusive modes)
**Mode 1 — Platform Snapshot Mode (canonical preferred).** When a current platform inventory report exists: `FBA Current Stock = latest valid platform inventory snapshot value` (source e.g. `amazon_inventory_snapshot` or another verified platform report).
- The latest imported snapshot is the platform Current-Stock **SSOT**. **Do NOT subtract Sales Report quantities again** from an imported snapshot (double-deduct). Snapshots stay independent by the existing platform grain `company + country/site + marketplace + SKU`. **Warehouse Reference Master rows never infer FBA quantity.**

**Mode 2 — Estimated Ledger Mode (fallback only; when no sufficiently current snapshot exists):**
```
Estimated FBA Stock =
    opening_confirmed_stock
  + confirmed_platform_inbound_receipts + returns_to_sellable + positive_adjustments
  − fulfilled_sales − removals − disposals − lost_or_damaged_adjustments − other_verified_outbound_adjustments
```
- Sales-Report deduction **alone** is insufficient to reproduce actual FBA stock (returns/transfers/removals/loss/damage/reconciliation/platform adjustments all move it). Result labelled **"Estimated Inventory"** (stored/displayed as estimate, not confirmed truth). A newer platform snapshot **replaces/reconciles** the estimate. **Never apply Snapshot Mode and Estimated deduction to the same interval.**
- If some adjustment sources are unavailable in V1: use only verified sources, show a stale/estimate warning, **do not fabricate adjustments** → classify the missing reconciliation flow as **Runtime Mapping Required**.

### 24.3 Shared FBM physical pool
`Shared Pool Key = company + warehouse_id + Master SKU`. `shared_physical_available_qty = wh_physical_stock − wh_reserved_stock − wh_damaged_stock`; multi-warehouse pool = `SUM(deduplicated eligible physical rows)` deduped by `company + warehouse_id + Master SKU` — **never dedupe/duplicate by marketplace.**
**Reconciliation:** `SUM(site_planning_allocation_qty) + unallocated_shared_pool_qty = shared_physical_available_qty`; both terms `>= 0`.

### 24.4 Daily demand inputs
Per eligible site *i*, `daily_demand_i` from the **existing** rules — Sales-Driven (canonical Avg Sales/Day / normalized §22) or Forecast-Driven (canonical forecast → daily via the existing period/day convention). **Do not replace the existing Need formulas.**
`minimum_18d_need_i = CEILING(daily_demand_i × 18)`, capped by the site's applicable calculated Need where the existing Need formula requires. The 18-day value here is a **display-allocation protection floor** and a **logistics risk threshold** — not ownership, not a persisted partition.

### 24.5 Mode A — NORMAL_ALLOCATION
**Condition:** `shared_physical_available_qty >= SUM(minimum_18d_need_i)`.
1. Give each site its `minimum_18d_need_i`.
2. `remaining_pool = shared_physical_available_qty − SUM(minimum_18d_need_i)`.
3. Distribute `remaining_pool` by demand weight — Forecast-Driven: FC Share (§7); Sales-Driven: sales/run-rate share; `allocation_priority` = tie-break/remainder order **that must not reduce any site below its 18-day floor.**
4. Never allocate above a site's applicable calculated Need; leftover stays `unallocated_shared_pool_qty`.
`site_planning_allocation_i = minimum_18d_need_i + allocated_remaining_qty_i`.

### 24.6 Mode B — PROTECTED_REALLOCATION
**Condition:** pool can protect all sites 18 days, **but** an initial FC/Sales-Share split leaves ≥1 site below its 18-day need. Rebalance the **virtual** allocation automatically; take only from a donor's allocation **above** its own 18-day need; **never reduce a donor below its 18-day need.** Analysis-Layer recalculation — not a physical transfer, no approval, no inventory movement.
```
receiver_shortage_i = MAX(minimum_18d_need_i − provisional_site_allocation_i, 0)
donor_surplus_j     = MAX(provisional_site_allocation_j − minimum_18d_need_j, 0)
protected_reallocation_qty <= MIN(receiver_shortage, available donor surplus)
donor_final_allocation_j >= minimum_18d_need_j   (invariant)
```
If the total pool can protect all sites, the final allocation **must not** leave any site below 18 days merely due to its initial FC/Sales Share.

### 24.7 Mode C — SHORTAGE_ALLOCATION
**Condition:** `shared_physical_available_qty < SUM(minimum_18d_need_i)`. Do **not** pretend every site reaches 18 days. Weighted shortage distribution:
```
priority_factor_i = MAX(allocation_priority_i, 1)
weighted_survival_need_i = minimum_18d_need_i × priority_factor_i
raw_shortage_allocation_i = shared_physical_available_qty × weighted_survival_need_i ÷ SUM(weighted_survival_need)
```
Rules: allocation ≤ site's applicable Need; non-negative integer; remaining integer units via **deterministic largest-remainder**, order = (1) higher `allocation_priority`, (2) larger unmet 18-day need, (3) stable marketplace key; pool total never negative; **lower-priority sites are never silently dropped**; if the priority scale causes starvation/extreme concentration, **Runtime must warn** rather than silently return misleading allocation.
Outputs: `coverage_rate = shared_physical_available_qty ÷ SUM(minimum_18d_need_i)`; per site `estimated_days_of_supply_i = site_planning_allocation_i ÷ daily_demand_i`; `shortage_to_18d_i = MAX(minimum_18d_need_i − site_planning_allocation_i, 0)`; display state `SHORTAGE_ALLOCATION`.

### 24.8 `allocation_priority` role by mode
- **NORMAL:** tie-break + remaining-pool distribution; **cannot** break another site's 18-day protection.
- **PROTECTED_REALLOCATION:** may set donor/remainder order; **cannot** reduce a donor below 18 days.
- **SHORTAGE:** active weighted-shortage input; higher priority = proportionally stronger protection.
- Priority is **not** physical ownership, guaranteed stock, a separate balance, or permission to exceed physical available.

### 24.9 Inventory Replenishment display contract (CANONICAL v4.1)
- **platform_fulfilled/FBA:** show **four separate columns/buckets, distinct lineage** — **FBA Current Stock** · **3PL Replenishment Reserve** (shared-pool allocation for this scope, when warehouse-eligible) · **Qualified On-the-Way** · **Calculated Gap**. FBA Current Stock also shows source mode (Confirmed Snapshot | Estimated) · snapshot/import date · stale/estimate warning. **The 3PL Replenishment Reserve is shown but MUST NOT be added into FBA Current Stock** (separate buckets). *(Supersedes the earlier "Do NOT show Shared Warehouse Allocation for pure FBA" — the reserve IS shown; it is only barred from being merged into FBA Current Stock.)*
- **self_fulfilled/FBM:** primary value **"Planning Available"**; expanded detail: Physical Shared Pool · Allocated to Current Site · Allocated to Other Sites · Unallocated Pool · Reserved · Damaged · Qualified On-the-Way · Allocation Mode · Estimated Days of Supply · Shortage to 18 Days · Allocation Priority · Last Calculated At. **Never** label site Planning Available as confirmed site-owned physical stock.

### 24.10 Daily recalculation boundary
> **Cadence (canonical):** the Daily Report Pipeline cadence is **daily** and updates **Analysis only** — it creates/modifies **no** recommendation Draft. Recommendation Drafts are created only by the **Weekly Shipping Recommendation (weekly cadence)** and the **Monthly Order Recommendation (monthly cadence)**, each gated on Daily-Pipeline success and idempotent per cycle key. **The exact execution day, time, trigger window, and source-readiness schedule belong to Runtime scheduling configuration (`SYSTEM_RUNTIME_ARCHITECTURE.md` §7A) and are NOT defined by this calculation spec.** Runtime scheduler remains **NOT IMPLEMENTED / PENDING VERIFICATION.**

Shared FBM Planning Allocation may recalculate **daily** from latest physical inventory / reservations+damage / sales+forecast demand / qualified on-the-way / allocation_priority. Inventory Replenishment is **Analysis Layer** and may change daily. Daily recalculation **must NOT mutate**: previously submitted Weekly Shipping Plans, approved plans, Shipment Draft execution snapshots, shipment lines, documents, or historical allocation snapshots. **At Submit Plan:** copy the current Planning Available + calculation context into the Decision Snapshot. **After Execution Commit:** the Shipment reads the committed snapshot and never recalculates it. (Consistent with §21/§22 Analysis-vs-Decision layering and `SHIPMENT_CENTER_SPEC.md` Immutable Flow.)

### 24.11 Air vs Sea recommendation boundary
Keep inventory display allocation **separate** from shipping recommendation.
```
air_shortage_qty = MAX(minimum_18d_need − site_planning_available − qualified_on_the_way_arriving_within_18_days, 0)
```
Air freight is suggested **only** when a shortage occurs inside the 18-day window **and** slower confirmed inbound cannot arrive before it. **Air must NOT be recommended merely because the site has demand within 18 days.**
```
Sea (Sales-Driven):    sea_need = target_days × avg_sales_per_day − site_planning_available − qualified_on_the_way − confirmed_air_qty
Sea (Forecast-Driven): sea_need = applicable_forecast_demand + canonical_safety_stock − site_planning_available − qualified_on_the_way − confirmed_air_qty
Suggested Sea Qty = MAX(sea_need, 0)   → then apply existing carton/container rules
```
`confirmed_air_qty` is **deducted from Sea Need** so the same shortage is not replenished twice. This routing layer **aligns with**, and does not replace, the existing canonical Need formulas (§20.5).

**Specification: FINALIZED v4.1. Runtime: NOT IMPLEMENTED.** No new persistence table.

---

## 25. Runtime Ledger Contract — Demand Ledger & Supply Ledger (CANONICAL v4.1)

The two engines run on two runtime-derived ledgers. **These are Runtime results, NOT new DB tables/columns** — v4.1 defines the *contract & grain* only; the actual mapping to existing tables is the next round's runtime work.

### 25.1 Demand Ledger — grain (each demand exists exactly ONCE)
Every demand entry must identify: **Master SKU · Marketplace SKU · Company · Country · Marketplace · Fulfillment lane · Destination warehouse/site · Demand type (`Regular` / `Sales Run Rate` / `Special Event` / `Safety`) · Demand source reference · Required-by date · Calculation cycle · Raw quantity · Remaining unmet quantity.**
- A single demand is never entered twice (e.g. an event's uplift never appears both in the run-rate and again as event FC — §29E).
- `Remaining unmet quantity` is decremented as supply is consumed; it never goes negative.

### 25.2 Supply Ledger — grain (each physical quantity in ONE active lifecycle bucket)
Every supply entry must identify: **Stable supply lineage / source reference · Master SKU · Company · Physical location / warehouse · Supply type · Current lifecycle status · Available date / ETA · Original quantity · Remaining unconsumed quantity · Destination / eligible service scope.**
- The **same physical quantity exists in exactly one active lifecycle bucket** at a time (§30).
- `Remaining unconsumed quantity` is decremented after each allocation; non-negative invariant.
- Runtime-derived ledger fields are **NOT** written as new DB columns; they are recomputed each cycle (Analysis Layer) and only frozen into existing snapshot columns at Submit Plan / Decision Commit.

---

## 26. Exact-Date Window Freeze (Engine A) (CANONICAL v4.1)

Engine A allocates over four **incremental, non-overlapping** buckets, judged by:
```
days_out = required_by_date − calculation_date   (whole calendar days)
```
| Condition | Bucket |
|-----------|--------|
| overdue OR `days_out <= 18` | `0–18d` |
| `19 <= days_out <= 30` | `19–30d` |
| `31 <= days_out <= 45` | `31–45d` |
| `46 <= days_out <= 90` | `46–90d` |
| `days_out > 90` | **not** in the 90-day allocation — future visibility only |

Rules:
- **Regular daily demand** uses future **Day 1–90**; **Day 0 does not add an extra Regular day.**
- **Overdue Event / Required-by demand** keeps its original required-by date but is **displayed in the earliest (`0–18d`) bucket, flagged `Late / Immediate Risk`.**
- `Total = 0–18 + 19–30 + 31–45 + 46–90` — the four buckets **sum to Total**; there is no second Total formula.
- **On-the-way display bucket ≠ qualification:** an on-the-way row is **displayed** by the bucket its ETA falls in, but only **qualifies** to cover a requirement when `ETA ≤ requirement required_by_date`. **Late incoming stays visible but never erases the original required-by gap** (§2F).

**Boundary examples:**
| `days_out` | Bucket / handling |
|-----------|-------------------|
| −1 | overdue → `0–18d`, Late/Immediate Risk |
| 0 | `0–18d` (no extra Regular day added for Day 0) |
| 18 | `0–18d` |
| 19 | `19–30d` |
| 30 | `19–30d` |
| 31 | `31–45d` |
| 45 | `31–45d` |
| 46 | `46–90d` |
| 90 | `46–90d` |
| 91 | outside 90-day allocation → future visibility only |

---

## 27. T1–T4 Tier Freeze (Engine B) (CANONICAL v4.1)

Engine B uses **monthly requirement tiers**. These are a **different adapter** from Engine A's exact-date buckets (§26) — **do not rename one into the other or assume a 1:1 map.**

| Tier | Definition |
|------|------------|
| **T1** | Remaining-days demand (calc date → end of current month) **+** the next full month's Target-Adjusted Base FC (Month+1) |
| **T2** | Month+2 full month |
| **T3** | Month+3 full month |
| **T4** | Month+4 full month — **Demand Visibility ONLY** |

Worked (calc date in **July**): T1 = July remaining-days demand + **Aug** Base FC · T2 = **Sep** · T3 = **Oct** · T4 = **Nov (display only)**.

Non-overlap & T4 invariants:
- **T2 starts at Month+2.** The Month+1 FC that is inside T1 is **never** counted again in T2.
- Each Regular / Event demand row is assigned to **exactly one** tier.
- **T4 must NOT:** enter shortage allocation · enter company reallocation · produce a Suggested Order Qty · enter a Request Bucket or Send Request payload · affect any T1–T3 closing balance. T4 is **forward demand visibility only.**

**Adapter independence (strengthened — Round 5A / v4.2):** Engine A's exact-date buckets (§26) and Engine B's monthly T1–T4 tiers (this §27) are **two independent classification dimensions** produced from the *same* `calculationDate` / `requiredByDate` pair — never one derived from the other:
1. **Engine A** classifies by exact calendar **`daysOut`** (§26 / §27A).
2. **Engine B** classifies by calendar **`monthDelta`** (this §27 / §27A).
3. Both are computed **independently** from the same two dates.
4. An Engine A bucket **must NOT** be used to derive an Engine B tier.
5. An Engine B tier **must NOT** be used to derive an Engine A bucket.
6. **No `0–18d → T1`, `19–30d → T2`, `31–45d → T3`, `46–90d → T4` (or any) 1:1 mapping may be created.**
7. One dated requirement may legitimately be, at the same time, e.g. **Engine A = `46–90d` while Engine B = `T4`**, or **Engine A = `>90d` while Engine B = `T3`** — this is **not** a conflict; it is the independent output of two adapters.

This **preserves and does not weaken** the frozen rule above: *do not rename one into the other or assume a 1:1 map.* The pure classifier that emits both adapters' outputs is frozen in **§27A**.

---

## 27A. Required-By Window Pure Classifier — `classifyRequiredByWindow` (CANONICAL v4.2 — Round 5A)

A single **pure / deterministic** classifier that, from one `calculationDate` / `requiredByDate` pair, emits the **Engine A** (exact-date, §26) and **Engine B** (monthly tier, §27) outputs as **two independently-scoped sub-objects**. It is a **classifier only** — it computes no shortage, reads no inventory, does no reallocation, no carton rounding, no persistence, no system-time access, and never mutates its input. Same input ⇒ identical output.

### 27A.1 Canonical API contract (AUTHORIZED)

**Input:**
```js
{
  calculationDate: "YYYY-MM-DD",
  requiredByDate: "YYYY-MM-DD"
}
```

**Output (frozen field names — the authorized API Contract):**
```js
{
  daysOut,
  monthDelta,
  engineA: {
    bucket,
    visible,
    allocationEligible
  },
  engineB: {
    tier,
    visible,
    allocationEligible,
    payloadEligible
  }
}
```

**The earlier Round 5 draft FLAT output is SUPERSEDED and MUST NOT be implemented:**
```js
// SUPERSEDED — DO NOT IMPLEMENT (Round 5 draft)
{ daysOut, engineABucket, tier, visible, allocationEligible, payloadEligible }
```
Reason: a **flat** `visible` / `allocationEligible` / `payloadEligible` cannot say whether it belongs to Engine A or Engine B, which would re-merge the two adapters that §26/§27 keep independent. Eligibility is therefore **adapter-scoped** (nested). **Engine A carries no `payloadEligible`** — payload eligibility is an Engine B (Request/PO) concern only.

### 27A.2 `daysOut` — exact civil-calendar day difference

```text
daysOut = requiredByDate − calculationDate   (whole civil calendar days)
```
- Result is an **integer**. No system clock; no locale parsing; unaffected by timezone / DST / execution environment; no hidden rounding; no numeric-string coercion.
- `requiredByDate < calculationDate` ⇒ a **negative integer** (overdue) is allowed and required.

### 27A.3 `monthDelta` — calendar year/month difference

```text
monthDelta = (requiredYear − calculationYear) × 12 + (requiredMonth − calculationMonth)
```
- Compares **calendar year/month only** — never converted from `daysOut`, never weighted by days-in-month.
- Example: `2026-01-31 → 2026-02-01` ⇒ `monthDelta = 1` (while `daysOut = 1`).

### 27A.4 Engine A canonical table (exact-date adapter — frozen literals)

| Condition | `engineA.bucket` | `engineA.visible` | `engineA.allocationEligible` |
|---|---|---:|---:|
| `daysOut < 0` | `"0–18d"` | `true` | `true` |
| `0 <= daysOut <= 18` | `"0–18d"` | `true` | `true` |
| `19 <= daysOut <= 30` | `"19–30d"` | `true` | `true` |
| `31 <= daysOut <= 45` | `"31–45d"` | `true` | `true` |
| `46 <= daysOut <= 90` | `"46–90d"` | `true` | `true` |
| `daysOut > 90` | `">90d"` | `true` | `false` |

- **`">90d"` is the formally-frozen Engine A literal** for the beyond-90-day case (closing the Round 5 gap where no `>90` token existed).
- **Overdue** (`daysOut < 0`) folds into `"0–18d"` per the existing §26 rule (immediate-processing need; §26 also flags it *Late / Immediate Risk*).
- `daysOut > 90` keeps **future visibility only** (`visible=true`) and is **not** in the Engine A 90-day allocation (`allocationEligible=false`).
- **Engine A emits no `payloadEligible`** (that is an Engine B field).

### 27A.5 Engine B canonical table (monthly-tier adapter — frozen literals)

Evaluate **overdue first**, then `monthDelta`:

| Condition | `engineB.tier` | `engineB.visible` | `engineB.allocationEligible` | `engineB.payloadEligible` |
|---|---|---:|---:|---:|
| `daysOut < 0` | `"T1"` | `true` | `true` | `true` |
| `daysOut >= 0` and `monthDelta = 0 or 1` | `"T1"` | `true` | `true` | `true` |
| `daysOut >= 0` and `monthDelta = 2` | `"T2"` | `true` | `true` | `true` |
| `daysOut >= 0` and `monthDelta = 3` | `"T3"` | `true` | `true` | `true` |
| `daysOut >= 0` and `monthDelta = 4` | `"T4"` | `true` | `false` | `false` |
| `daysOut >= 0` and `monthDelta >= 5` | `null` | `false` | `false` | `false` |

Canonical meanings:
```text
T1 = overdue + current-month remainder + Month+1
T2 = Month+2
T3 = Month+3
T4 = Month+4
```
- **`null` is the authorized JSON `null`** for Month+5 and beyond — do **not** invent a `T5` / `FUTURE` / `OUT_OF_RANGE` / `N/A` token.
- **T4 stays display-only:** `visible=true`, `allocationEligible=false`, `payloadEligible=false` (consistent with §27's T4 invariants).
- **Month+5+** is outside the Engine B T1–T4 display range → `tier=null`, `visible=false`, `allocationEligible=false`, `payloadEligible=false`. This does **not** affect Engine A's `>90d` future visibility — the two adapters are independent.

### 27A.6 Required independence examples (frozen — prove no 1:1 mapping)

**Example A** — same dates, Engine A `46–90d` **and** Engine B `T4`:
```text
calculationDate = 2026-01-31 ; requiredByDate = 2026-05-01
```
```js
{
  daysOut: 90,
  monthDelta: 4,
  engineA: { bucket: "46–90d", visible: true, allocationEligible: true },
  engineB: { tier: "T4", visible: true, allocationEligible: false, payloadEligible: false }
}
```

**Example B** — same dates, Engine A `>90d` **and** Engine B `T3`:
```text
calculationDate = 2026-01-01 ; requiredByDate = 2026-04-30
```
```js
{
  daysOut: 119,
  monthDelta: 3,
  engineA: { bucket: ">90d", visible: true, allocationEligible: false },
  engineB: { tier: "T3", visible: true, allocationEligible: true, payloadEligible: true }
}
```

> **Callers must consume the fields belonging to their own Engine adapter. They must not combine Engine A and Engine B eligibility by an undocumented AND / OR rule.**

### 27A.7 Input validation contract (frozen error *types* only)

- `input` must be an **object**; `calculationDate` and `requiredByDate` must both be **present** and of type **string**.
- Only strict **`YYYY-MM-DD`** is accepted; the value must be a **real Gregorian calendar date**. **Rejected:** datetime forms, timezone suffixes, slash dates, non-zero-padded fields, and any auto-normalized (rolled-over) date.
- Frozen error **types** (full message literal NOT frozen this round):
  - **`TypeError`** — `input` is not an object · a required field is missing · a field is not a string.
  - **`RangeError`** — value is not strict `YYYY-MM-DD` · the month / day / leap-day does not exist.

### 27A.8 Scenario #28 / #33 canonical expected behavior (spec only — no tests run this round)

- **Scenario #28** (Engine B T4): `classifyRequiredByWindow` ⇒ `engineB.tier="T4"`, `engineB.visible=true`, `engineB.allocationEligible=false`, `engineB.payloadEligible=false`. T4 is reached via **Engine B `monthDelta=4`** — **never** derived from any Engine A day bucket.
- **Scenario #33** (Engine A boundary sweep): `classifyRequiredByWindow` ⇒ `engineA.bucket` = frozen literals `0→"0–18d"`, `18→"0–18d"`, `19→"19–30d"`, `30→"19–30d"`, `31→"31–45d"`, `45→"31–45d"`, `46→"46–90d"`, `90→"46–90d"`, `91→">90d"`, and overdue `-1→"0–18d"`. All expecteds are **literals**, never produced by a test-side formula.

> **Status:** §27A is a **frozen specification only. Runtime: NOT IMPLEMENTED. Executable Test: PENDING (at Round 5A).** *(Round 6 later implemented `classifyRequiredByWindow` in the pure calculation core — 282 unit / 114 golden PASS; see §32A and the Round 6 changelog.)*

---

## 28. Current-Month / Factory-Stock Resolution (CANONICAL v4.1)

See the corrected §8. Summary of the freeze:
```
Destination Projected Balance
  = Destination Sellable Current Stock
  + Timely Qualified Incoming
  + Timely Approved / Committed Supply
  − Demand
```
- **Factory Stock is NEVER added to the destination projected balance.** It is source-side supply that (a) limits Recommended Shipping Qty and (b) reduces Residual Production Required (§31).
- This removes the prior double-count where Allocated Factory Stock satisfied the destination once and was then deducted again by the shipping recommendation.

---

## 29. Demand Basis Freeze (four combinations) (CANONICAL v4.1)

Four combinations unchanged: Platform×Sales-Driven · Platform×Forecast-Driven · Overseas×Sales-Driven · Overseas×Forecast-Driven.

### 29E. Sales-Driven — Normalized 30-day ladder
- Source window = latest **90 completed days (today excluded)**; walk backward and collect the **latest 30 eligible normal days**, excluding this SKU's Campaign / Deal / Special-Event days (§22.2); divide by the **actual** normal-day count (never a fixed 30 when short).
- `normal_days ≥ 7` → `normalized_30d`; `3–6` → `normalized_30d` + `low_sample_warning`; `< 3` → `weekly_7d` + `insufficient_normal_days`.
- **Event demand is added back exactly once at 100%.** The same event must never both pollute the run-rate and be added again as event FC.

### 29F. Forecast-Driven
```
Adjusted Regular FC = Base FC × Target Rule        (priority SKU > Series > Category > default 100%)
```
- Forecast-Driven Avg Sales is **reference only**; it never replaces FC.
- **Monthly-FC → exact-date daily projection:** split Target-Adjusted Monthly FC into daily demand by that month's **actual calendar-day count**, keeping full precision; the monthly re-aggregation must return **exactly** the original Adjusted Monthly FC; integer reconciliation happens **only** at the final unit/carton output — no over/under-count from splitting.

### 29G. 30-Day Safety Demand (explicit formula)
```
Forecast Daily Demand
  = (Adjusted FC Month+1 + Adjusted FC Month+2)
    ÷ (Month+1 calendar days + Month+2 calendar days)

Safety Demand = Forecast Daily Demand × 30
```
Safety Demand is the **additional 30-day coverage AFTER the 60-day (Month+1 + Month+2) coverage** — it must **not** overlap/duplicate Month+1 or Month+2 demand.

### 29F(event). Special Event
Governed by §10 + §30: Preparation Date = Event Start − 30 calendar days (exact); Special FC always 100% (never × Target%); separate from Base FC; same-month multiple events all retained; each event counted once by stable event ID; only timely qualified supply covers it; late supply shows Late Risk without erasing the gap; overdue-but-active events enter the immediate bucket with overdue status.

---

## 30. Supply Lifecycle Count-Once Freeze (CANONICAL v4.1)

One supply lineage advances through exactly these states; the **same physical quantity is only ever in one**:
```
Committed Production
→ Approved Shipping Plan
→ Shipped / In Transit
→ Delivered-not-Received
→ Received-not-yet-reflected
→ Current Stock
```
Rules: **Draft is not Qualified Incoming.** On status upgrade, the same physical quantity **leaves** the prior bucket. **Delivered ≠ Received** — a carrier delivered event never raises Current Stock; **only receipt posting** does. Supply is consumed by **remaining unconsumed quantity**, FIFO by earliest Required-by demand; each allocation decrements remaining; all quantities satisfy the non-negative invariant. There is **no standalone Received Qty deduction** (§10.1 correction).

**100-unit lifecycle example (total valid supply is always 100 — never 200/300/400):**
| Stage | Committed | Approved Plan | In Transit | Delivered-not-Rcv | Rcv-not-reflected | Current Stock | Total counted |
|-------|-----------|---------------|-----------|-------------------|-------------------|---------------|---------------|
| PO issued | 100 | 0 | 0 | 0 | 0 | 0 | **100** |
| Plan approved | 0 | 100 | 0 | 0 | 0 | 0 | **100** |
| Shipped | 0 | 0 | 100 | 0 | 0 | 0 | **100** |
| Delivered (not received) | 0 | 0 | 0 | 100 | 0 | 0 | **100** |
| Receipt confirmed, snapshot lagging | 0 | 0 | 0 | 0 | 100 | 0 | **100** |
| Snapshot posted | 0 | 0 | 0 | 0 | 0 | 100 | **100** |

---

## 31. Calculated Gap → Shipment FLOOR → Residual Production → Order CEILING (CANONICAL v4.1)

```
Calculated Gap
  = MAX(Demand − Destination Current Stock − Timely Qualified Incoming − Timely Approved/Committed Supply, 0)

Raw Shippable Qty       = MIN(Calculated Gap, Eligible Source Available)
Recommended Shipping Qty = FLOOR(Raw Shippable Qty ÷ Units Per Carton) × Units Per Carton

Residual Production Required
  = MAX(Calculated Gap − Recommended Shipping Qty − Other Legally Allocated Timely Supply, 0)

Suggested Order Qty = CEILING(Net Order Need ÷ Units Per Carton) × Units Per Carton
```
**Worked example:**
```
Calculated Gap = 300 ; Eligible Source Available = 279 ; Units Per Carton = 40
Raw Shippable = MIN(300, 279) = 279
Recommended Shipping = FLOOR(279 / 40) × 40 = 6 × 40 = 240
Residual Production Required = 300 − 240 = 60
Suggested Order = CEILING(60 / 40) × 40 = 2 × 40 = 80
```
**Forbidden:** `Production Required = Gap − Raw Eligible Source` (= 300 − 279 = 21) — this under-counts, because the 39-unit source remainder (279 − 240) cannot ship as a whole carton now and does not satisfy the gap. Factory Stock, 3PL source stock, and company surplus each carry a **remaining quantity** and, once allocated, are **not reused** by another destination.

---

## 32. Company Reallocation Feasibility Freeze (CANONICAL v4.1)

Cross-company reallocation is allowed **only** when ALL hold: same **Master SKU** · same **planning cycle** · same **Required-by tier/bucket** · compatible unit/packaging · donor's own demand **and** committed obligations already satisfied · donor has a real remaining **surplus** · transfer/handling/route lead time **completes before the receiver's Required-by date** · the supply is **not already consumed** by another destination/order.
```
Feasible Reallocation Qty = MIN(Receiver Remaining Shortage, Donor Remaining Surplus, Timely Transferable Qty)

After each reallocation:  Donor Remaining Surplus −= qty ;  Receiver Remaining Shortage −= qty   (each surplus consumed once)

Net Order Need = Σ (Remaining Shortage after legal reallocation)
```
**Forbidden:** different-SKU offset · later-tier surplus covering earlier-tier shortage · non-timely-transferable surplus netting a shortage · the same surplus used by two companies · treating a positive group balance as satisfaction while ignoring location/timing feasibility. **This is Analysis/Planning only** — no inventory movement, no intercompany transaction, no ownership change; SO/PO/AR/AP ownership stays a Future Extension.

---

## 32A. Reallocation Eligibility Owner and Contract — `evaluateReallocationEligibility` (CANONICAL v4.3 — Round 6A freeze; IMPLEMENTED Round 6; Line Runtime NOT IMPLEMENTED)

This subsection is the **single canonical owner** of the reallocation **eligibility predicate** (the *yes/no* decision of whether a donor→receiver pair may reallocate at all). It complements — and does **not** replace or duplicate — the §12/§32 quantity primitives. **No parallel eligibility owner may be created in any other document.** The contract was frozen in Round 6A; the pure predicate is **IMPLEMENTED in Round 6** (`evaluateReallocationEligibility` in `supply-planning-calculations.js`) exactly to this contract, and **Golden #21 / #22 are promoted to `EXECUTED_EXISTING_CORE`**. This owns only the pure yes/no gate — **Line Runtime / candidate enumeration / quantity orchestration remain NOT started.**

The eligibility predicate is the pure calculation core behind Golden **#21** (Different SKUs cannot reallocate) and **#22** (Later surplus cannot cover an earlier shortage) — both now executed (§33).

### 32A.1 Owner boundary — pure calculation core vs Line Runtime / caller

**Pure calculation core** (this module, `supply-planning-calculations.js`) owns ONLY:
```text
Same-Master-SKU deterministic comparison (exact string equality of caller-resolved Master SKUs)
Engine B eligibility extraction (from classifyRequiredByWindow(...).engineB, §27A)
Engine B tier ordering (donorRank <= receiverRank over T1/T2/T3)
Pure boolean eligibility result
Strict input validation (type/shape/date)
No mutation; deterministic; no side effects
```

**Line Runtime / caller** (NOT this module) owns:
```text
DB records and joins
Master SKU identity resolution (resolve the canonical Master SKU BEFORE calling the predicate)
company scope resolution
donor / receiver candidate enumeration
route timing
packaging compatibility
ownership-transfer rules
available / reserved inventory qualification
timelyTransferableQty resolution
allocation iteration and deterministic donor→receiver pair ordering
persistence · concurrency · writer behavior
```

The pure predicate **receives the caller's already-resolved Master SKU strings and dates**; it does **not** read a DB, does **not** guess identity, and does **not** compute route timing / packaging / ownership feasibility. Those remain caller (Line Runtime) responsibilities.

> **Boundary refinement note (implementation, Round 6):** the module header's "does NOT decide SKU eligibility / tier compatibility" boundary refers to **identity/route/packaging RESOLUTION** and to the quantity helpers — the pure predicate performs only the **deterministic comparison of caller-resolved values** (exact string equality + Engine B tier rank). This refinement is reflected in the module header comment at Round 6 implementation time.

The existing quantity primitives — `feasibleReallocationQty`, `applyFeasibleReallocation`, `sumRemainingShortages` — **continue to own quantity arithmetic / consume-once bookkeeping only** and must **not** absorb eligibility, DB, or Runtime behavior.

### 32A.2 Same-Master-SKU identity gate (frozen)

Only `donor.masterSku === receiver.masterSku` passes the identity gate. Requirements:
- **Exact string equality.**
- **Must NOT** use `site_sku`, `marketplace_sku_id`, ASIN, or any marketplace product ID.
- **Must NOT** apply prefix / substring / Series / Category matching.
- **Must NOT** `trim` / upper- / lower-case coerce and then treat as equal.
- **Different Master SKU ⇒ `sameMasterSku=false` ⇒ ineligible** (Golden #21).

### 32A.3 Engine B is the ONLY tier source (frozen)

The reallocation tier is read **only** from `classifyRequiredByWindow(...).engineB` (§27A). It **must NOT** read or merge `engineA.bucket`, `engineA.allocationEligible`, or any `daysOut` bucket. **No** `0–18d→T1 / 19–30d→T2 / 31–45d→T3 / 46–90d→T4` (or any) 1:1 mapping may be created — Engine A and Engine B remain independent adapters (§27 / §27A).

### 32A.4 Eligible tiers (frozen)

Only Engine B **`T1` / `T2` / `T3`** may participate in reallocation. **Excluded:** `T4`, `tier=null`, and any pair where `engineB.allocationEligible=false`. `engineB.visible` and `engineB.payloadEligible` are **NOT** additional or hidden allocation gates.

### 32A.5 Tier ordering (frozen)

Canonical rank:
```text
T1 = 1 ; T2 = 2 ; T3 = 3
```
Eligibility rule: **`donorRank <= receiverRank`.** (Rank is defined only for T1/T2/T3; T4/null are already excluded by §32A.4 before rank is compared.)

| Donor | Receiver | Tier ordering |
|-------|----------|---------------|
| T1 | T1 | eligible |
| T1 | T2 | eligible |
| T1 | T3 | eligible |
| T2 | T1 | ineligible |
| T2 | T2 | eligible |
| T2 | T3 | eligible |
| T3 | T1 | ineligible |
| T3 | T2 | ineligible |
| T3 | T3 | eligible |

Meaning:
```text
Earlier or same-tier surplus MAY cover a same/later shortage.
A later surplus CANNOT cover an earlier shortage.
```
Golden **#22** must be verified by this gate.

### 32A.6 Adapter-independence guard (frozen)

If a single date pair yields, at the same time, `engineA.allocationEligible=false` **and** `engineB.tier="T3"` / `engineB.allocationEligible=true`, the reallocation tier gate is decided **solely by Engine B** — an Engine A value must **NOT** be AND-ed in by any undocumented rule (§27 / §27A.6).

### 32A.7 Quantity separation (frozen)

The eligibility predicate:
- does **NOT** receive shortage / surplus quantity;
- does **NOT** compute `reallocatedQty`;
- does **NOT** decrement donor / receiver;
- does **NOT** call or duplicate the MIN formula;
- does **NOT** replace `applyFeasibleReallocation`.

Canonical downstream ordering:
```text
resolve identity/dates
→ evaluate eligibility (§32A)
→ caller resolves timelyTransferableQty
→ applyFeasibleReallocation (§32)
→ consume returned remainders
→ sumRemainingShortages (§12)
```

### 32A.8 Public contract (AUTHORIZED — frozen)

No prior, differently-approved eligibility API exists in the canonical (the §12/§32 helpers are quantity-only); the following is therefore the authorized Round 6 contract.

**Input:**
```js
evaluateReallocationEligibility({
  calculationDate: "YYYY-MM-DD",
  donor:    { masterSku: "GA0450", requiredByDate: "YYYY-MM-DD" },
  receiver: { masterSku: "GA0450", requiredByDate: "YYYY-MM-DD" }
})
```

**Output (exact shape):**
```js
{
  sameMasterSku: true,
  donor:    { tier: "T1", allocationEligible: true },
  receiver: { tier: "T2", allocationEligible: true },
  tierOrderingEligible: true,
  eligible: true
}
```

- **Exact top-level keys:** `sameMasterSku` · `donor` · `receiver` · `tierOrderingEligible` · `eligible`.
- **Exact `donor` / `receiver` keys:** `tier` · `allocationEligible` (mirrored from that party's `classifyRequiredByWindow(...).engineB`).
- **MUST NOT add:** flat `donorTier` / `receiverTier` aliases · any Engine A field · bucket aliases · quantity fields · `timelyTransferableQty` · `reallocatedQty` · DB IDs · company inference · a UI-worded reason message · any global mutable state.

**Eligibility formula (frozen):**
```text
tierOrderingEligible =
      donor.engineB.allocationEligible
  AND receiver.engineB.allocationEligible
  AND donorRank <= receiverRank

eligible =
      sameMasterSku
  AND tierOrderingEligible
```
(In output-field terms, `donor.engineB.allocationEligible` / `receiver.engineB.allocationEligible` are surfaced as `donor.allocationEligible` / `receiver.allocationEligible`.)

### 32A.9 Validation / purity contract (frozen — error *types* only)

- `input`, `donor`, `receiver` not a non-null, non-array object ⇒ **`TypeError`**.
- `masterSku` not a string, or an empty/whitespace-only string ⇒ **`TypeError`**.
- Date validation is **delegated to / reuses `classifyRequiredByWindow`'s strict contract** (§27A.7): a non-string date ⇒ **`TypeError`**; a non-strict or non-real `YYYY-MM-DD` (datetime/timezone/slash/non-padded/auto-rolled) ⇒ **`RangeError`**.
- Full error message literals are **NOT** frozen this round.
- **No** coercion of `number` / `Date` / numeric string; **no** system clock; **no** locale parsing.
- **No** input mutation; every call returns **fresh** top-level / `donor` / `receiver` objects; mutating one output must not pollute a later call.

> **Status:** the §32A contract is frozen (Round 6A) and the pure predicate is **IMPLEMENTED (Round 6)** exactly to it — `evaluateReallocationEligibility` with Round 6 unit tests and executed Golden #21 / #22. **Golden Matrix = 25 executed / 15 pending / 0 canonical-blocked; Unit = 325 PASS; Golden = 117 PASS (live totals as of Round 8B).** **Line Runtime / Qualified Incoming Runtime / quantity orchestration remain NOT IMPLEMENTED** (the predicate is a pure yes/no gate only).

---

## 33. Golden Scenario Matrix (SPECIFICATION — 40 scenarios; executable tests PENDING) (CANONICAL v4.1)

Executable golden tests are **NOT** built this round; this matrix is the frozen specification each future test must satisfy. Each scenario lists Inputs · Expected intermediate ledger · Expected output · Count-once assertion · Applicable invariant · Future executable-test owner (all `assets/tests/*` — to be created next round).

| # | Scenario | Expected output / key assertion | Count-once / invariant |
|---|----------|--------------------------------|------------------------|
| 1 | Platform × Sales-Driven, no event | Need = normalized_30d × bucket days − stock − timely incoming | each incoming once |
| 2 | Sales-Driven, event pollutes weekly sales | run-rate uses normalized-30d excl. event days; event added once | no double event uplift |
| 3 | Normal days ≥7 | `source=normalized_30d`, no warning | — |
| 4 | Normal days 3–6 | `normalized_30d` + `low_sample_warning` | — |
| 5 | Normal days <3 | `weekly_7d` + `insufficient_normal_days` | — |
| 6 | Platform × Forecast-Driven + Target Rule + Special Event | Adjusted FC×Target + Safety(§29G) + Event(100%) − stock − timely incoming − Approved/Committed Supply | Safety not overlapping M+1/M+2; Approved/Committed deducted once |
| 7 | Overseas NORMAL_ALLOCATION | every site ≥ its 18-day need; remainder by weight | `Σalloc ≤ pool` |
| 8 | Overseas PROTECTED_REALLOCATION | donor above-18d trimmed; no site < 18d | donor ≥ 18d invariant |
| 9 | Overseas SHORTAGE_ALLOCATION | weighted largest-remainder; no site silently dropped | `Σalloc ≤ pool`, ≥0 |
| 10 | FBA Current Stock vs 3PL reserve separation | two buckets, never summed | distinct lineage |
| 11 | Platform site participates in 3PL reserve | reserve shown, NOT merged into FBA Current Stock | separate buckets |
| 12 | Draft incoming not counted | Draft excluded from Qualified Incoming | — |
| 13 | On-time incoming covers demand | ETA ≤ required-by → covers gap | consumed once |
| 14 | Late incoming visible not covering | ETA > required-by → Late Risk, gap unchanged | display ≠ qualification |
| 15 | Delivered-not-received | Current Stock unchanged until receipt | Delivered ≠ Received |
| 16 | Receipt posted | quantity only in Current Stock | not also in incoming |
| 17 | Same supply lifecycle count once | total across all buckets = original qty | 100-unit example §30 |
| 18 | Factory Stock = 0 but Production Required > 0 | production surfaced; route uses production lead time | — |
| 19 | Factory quantity allocated once | remaining source decremented; not duplicated to 2 companies | remaining ≥ 0 |
| 20 | Cross-company same-SKU/same-tier timely reallocation | feasible qty = MIN(shortage,surplus,timely) | surplus once |
| 21 | Different SKUs cannot reallocate | no offset | — |
| 22 | Later surplus cannot cover earlier shortage | earlier-tier gap remains | tier ordering |
| 23 | Shipment FLOOR | FLOOR(available ÷ UPC) × UPC | never > available |
| 24 | Order CEILING | CEILING(need ÷ UPC) × UPC | covers full need |
| 25 | Source remainder → residual production recompute | §31 example (240 ship, 60 produce, 80 order) | not Gap−RawSource |
| 26 | Preparation Date crosses month | event demand in month containing (start − 30d) | exact date wins |
| 27 | Multiple Special Events same month | all events retained, each once | stable event ID |
| 28 | T4 visible, no allocation/payload (Engine B adapter, §27A) | `classifyRequiredByWindow` ⇒ `engineB.tier="T4"`, `engineB.visible=true`, `engineB.allocationEligible=false`, `engineB.payloadEligible=false` (reached via `monthDelta=4`, NOT via any Engine A day bucket) | T4 display-only; adapter-independent |
| 29 | Missing / stale snapshot | `MISSING_SNAPSHOT` / `STALE_SNAPSHOT`, not 0 | §34 / §34A |
| 30 | Missing Forecast (forecast-driven SKU) | `MISSING_FORECAST` — calculation blocked / review, not 0 | §34 / §34A |
| 31 | Missing `units_per_carton` | Suggested = Calc Blocked; submit blocked; no default | §14/§34 |
| 32 | One Master SKU, many Marketplaces | physical pool deduped by company+warehouse_id+Master SKU | not duplicated per marketplace |
| 33 | Engine A bucket boundary sweep (§26 / §27A) | `classifyRequiredByWindow` ⇒ `engineA.bucket` literals: −1→`"0–18d"`, 0→`"0–18d"`, 18→`"0–18d"`, 19→`"19–30d"`, 30→`"19–30d"`, 31→`"31–45d"`, 45→`"31–45d"`, 46→`"46–90d"`, 90→`"46–90d"`, 91→`">90d"` | non-overlapping; literal expecteds, no off-by-one |
| 34 | User partial-carton Order Qty | override saved; Suggested unchanged; flagged user override | independence |
| 35 | 90-day window contains a Campaign 7/15–7/22 the SKU joined | those 8 dates excluded; sampling walks earlier for normal days | campaign days excluded once |
| 36 | Continue sampling past the campaign gap | keep walking backward until 30 eligible normal days collected (within 90d) | never exceed 90-day window |
| 37 | Another SKU NOT in that campaign | 7/15–7/22 are normal days for it (not excluded) | per-SKU participation, not site-wide |
| 38 | Campaign & Special Event overlap same date | date excluded exactly once | no double removal/count |
| 39 | <30 normal days inside 90 days | divide by actual normal_day_count; low-sample/fallback warning per §22.3 | never fixed ÷30 |
| 40 | Confirmed zero-sales normal day vs missing day | zero-sales day counts as normal (value 0); missing day not auto-zero | missing ≠ 0 |

---

## 34. Missing / Stale Data Contract (CANONICAL v4.1)

**Unknown is never zero.** Frozen states:
| Condition | State / behavior |
|-----------|------------------|
| Missing platform inventory snapshot | `MISSING_SNAPSHOT` — not 0 |
| Stale snapshot | `STALE_SNAPSHOT` — show source + staleness warning |
| Missing Forecast on Forecast-Driven SKU | calculation blocked / review |
| Missing sales basis on Sales-Driven SKU | calculation blocked / review |
| Missing `units_per_carton` | rounding + Send Request blocked (§14) |
| Missing ETA | incoming visible, **not** counted as timely supply |
| Missing fulfillment model | calculation blocked |
| Missing Company / Country / warehouse identity | shared allocation blocked |
| Missing route feasibility | no timely cross-company reallocation (§32) |

Fallback is used **only** where a rule explicitly allows it, and always **shows its source + a warning** (e.g. Estimated Ledger §24.2, weekly-7d fallback §22.3).

> The machine-readable pure-classifier contract for these frozen states is **§34A** (`classifyPlanningDataState`). §34 remains the business-outcome owner; §34A only freezes the deterministic function shape that represents §34 — it introduces **no new business classification**.

---

## 34A. Missing / Stale Data Pure Classifier Contract — `classifyPlanningDataState` (CANONICAL v4.4 — Round 8A freeze; NOT IMPLEMENTED)

This subsection is the **single canonical owner** of the deterministic pure-function shape that classifies **calculation input readiness** for the §34 Missing / Stale states. It **does not change any §34 business outcome, `replenishment_model` meaning, or Scenario #29/#30 expected behavior** — it only freezes the *function name, signature, input shape, output shape, state tokens, precedence, boundaries, and error contract* so Scenario #29/#30 can later be implemented (Round 8B). No prior authoritative synonym function exists in the canonical, so `classifyPlanningDataState` is the authorized name (no second alias may be created).

### 34A.1 Purpose and ownership

`classifyPlanningDataState` is a **pure / deterministic classifier**:
```text
no DB read/write · no API call · no UI state mutation
no Date.now() / no system clock · no timezone / locale dependency
no implicit default data · same input ⇒ identical output
```
It **only** classifies whether the calculation *inputs* are ready. It does **NOT**: assemble snapshot or forecast records, decide the snapshot source, resolve identity, compute shortage/demand/supply, or orchestrate the Recommendation Runtime. Snapshot/forecast **assembly and sourcing** remain caller (Line Runtime) responsibilities; this predicate receives already-resolved presence/age facts.

### 34A.2 Exact input contract (AUTHORIZED — frozen)

```js
classifyPlanningDataState({
  snapshotPresent:        true,               // boolean — REQUIRED, non-null
  snapshotAgeDays:        3,                  // number  — REQUIRED & validated ONLY when snapshotPresent===true (whole-day age of the snapshot; ignored when snapshotPresent===false)
  stalenessThresholdDays: 7,                  // number  — REQUIRED & validated ONLY when snapshotPresent===true (staleness cutoff; ignored when snapshotPresent===false)
  replenishmentModel:     "forecast_driven",  // string  — REQUIRED enum: "forecast_driven" | "sales_driven" (§2 Demand Basis)
  forecastPresent:        true,               // boolean — REQUIRED when replenishmentModel==="forecast_driven"; IGNORED when "sales_driven"
  salesBasisPresent:      true                // boolean — REQUIRED when replenishmentModel==="sales_driven"; IGNORED when "forecast_driven"
})
```

Per-field freeze:

| Property | Type | Required | Nullable | Allowed values / range | Unit | Conditionally required / ignored | Evidence |
|---|---|---|---|---|---|---|---|
| `snapshotPresent` | boolean | always | non-null | `true` / `false` | — | — | §34 "Missing platform inventory snapshot" |
| `snapshotAgeDays` | number | when `snapshotPresent===true` | non-null on that branch | finite, **≥ 0** | whole civil days | ignored when `snapshotPresent===false` | §34 "Stale snapshot" |
| `stalenessThresholdDays` | number | when `snapshotPresent===true` | non-null on that branch | finite, **≥ 0** | whole civil days | ignored when `snapshotPresent===false` | §34 "Stale snapshot" |
| `replenishmentModel` | string | always | non-null | `"forecast_driven"` \| `"sales_driven"` | — | — | §2 (`sales_driven` / `forecast_driven`) |
| `forecastPresent` | boolean | forecast-driven only | non-null on that branch | `true` / `false` | — | ignored when `sales_driven` | §34 "Missing Forecast on Forecast-Driven SKU" |
| `salesBasisPresent` | boolean | sales-driven only | non-null on that branch | `true` / `false` | — | ignored when `forecast_driven` | §34 "Missing sales basis on Sales-Driven SKU" |

Prohibited inputs (frozen): a raw DB row; any `warehouse` / `marketplace` / `SKU` identity; a current-date / timezone input; `undefined` used to imply a legal business state; any UI-only flag with no §34 basis. Unexpected **extra** properties are **ignored** (no error, no effect) — consistent with §27A/§32A non-strict shape.

### 34A.3 Exact output contract (AUTHORIZED — frozen)

```js
{
  state:              "OK",   // one of the five frozen tokens below
  calculationAllowed: true    // boolean, deterministically derived from state
}
```

- **Return value is a newly-created object every call; the input is never mutated.**
- **Exactly one** `state` token is returned (never an array / multiple states).
- Frozen state tokens and their `calculationAllowed` mapping:

| `state` | Meaning (§34) | `calculationAllowed` | §34 evidence |
|---|---|---:|---|
| `OK` | inputs ready | `true` | normal (no §34 blocking row) |
| `STALE_SNAPSHOT` | snapshot present but older than threshold — **proceed with source + staleness warning, never auto-0** | `true` | §34 "Stale snapshot — show source + staleness warning" |
| `MISSING_SNAPSHOT` | no platform inventory snapshot — never 0 | `false` | §34 "Missing platform inventory snapshot — not 0" |
| `MISSING_FORECAST` | forecast-driven SKU with no forecast — calculation blocked / review | `false` | §34 "Missing Forecast on Forecast-Driven SKU → calculation blocked / review" |
| `MISSING_SALES_BASIS` | sales-driven SKU with no sales basis — calculation blocked / review | `false` | §34 "Missing sales basis on Sales-Driven SKU → calculation blocked / review" |

`MISSING_SNAPSHOT` and `STALE_SNAPSHOT` are the **verbatim §34 tokens**. `MISSING_FORECAST` / `MISSING_SALES_BASIS` / `OK` are the **machine representation** of §34's existing prose rows — **no new business classification, no second/UI vocabulary, no free-text message**. `calculationAllowed` is fully derived from `state` (only `OK` and `STALE_SNAPSHOT` allow); it is surfaced explicitly for callers, not as an independent classification.

### 34A.4 Complete precedence and truth table (frozen)

Evaluate in this deterministic order and return the **first** match:

```text
1. snapshotPresent !== true                                  → "MISSING_SNAPSHOT"     (blocked)
2. replenishmentModel === "forecast_driven" && !forecastPresent  → "MISSING_FORECAST"  (blocked)
3. replenishmentModel === "sales_driven"    && !salesBasisPresent → "MISSING_SALES_BASIS" (blocked)
4. snapshotAgeDays > stalenessThresholdDays                  → "STALE_SNAPSHOT"       (allowed + warning)
5. otherwise                                                 → "OK"                   (allowed)
```

| # | snapshotPresent | age vs threshold | replenishmentModel | forecastPresent | salesBasisPresent | `state` | `calculationAllowed` |
|---|---|---|---|---|---|---|---:|
| 1 | `false` | (ignored) | any | (ignored) | (ignored) | `MISSING_SNAPSHOT` | `false` |
| 2 | `true` | any | `forecast_driven` | `false` | (ignored) | `MISSING_FORECAST` | `false` |
| 3 | `true` | any | `sales_driven` | (ignored) | `false` | `MISSING_SALES_BASIS` | `false` |
| 4 | `true` | `age > threshold` | `forecast_driven` | `true` | — | `STALE_SNAPSHOT` | `true` |
| 5 | `true` | `age > threshold` | `sales_driven` | — | `true` | `STALE_SNAPSHOT` | `true` |
| 6 | `true` | `age <= threshold` | `forecast_driven` | `true` | — | `OK` | `true` |
| 7 | `true` | `age <= threshold` | `sales_driven` | (ignored) | `true` | `OK` | `true` |
| 8 | `false` | (ignored) | `forecast_driven` | `false` | — | `MISSING_SNAPSHOT` | `false` |
| 9 | `true` | `age > threshold` | `forecast_driven` | `false` | — | `MISSING_FORECAST` | `false` |

Frozen precedence decisions (answering the required questions):
- **Missing snapshot vs missing forecast:** `MISSING_SNAPSHOT` wins (row 8) — snapshot is the foundational inventory basis, evaluated first.
- **Stale snapshot vs missing forecast:** `MISSING_FORECAST` wins (row 9) — a **blocking** demand-basis gap outranks the **warning-only** staleness signal.
- **One state or many:** exactly **one** deterministic `state` is returned.
- **Do all non-OK states block calculation?** **No** — `STALE_SNAPSHOT` is non-OK yet `calculationAllowed=true` (§34 warn-and-proceed); **every other** non-OK state blocks.
- **Does `sales_driven` ignore forecast presence?** **Yes** — `forecastPresent` is not read on the `sales_driven` branch (rows 5/7).

This precedence faithfully expresses the §34 condition table; it creates **no** different business outcome.

### 34A.5 Boundary and error contract (frozen — error *types* only)

Boundary behavior (frozen literals):
```text
snapshotAgeDays === stalenessThresholdDays   → NOT stale (fresh) → OK-path        (staleness is STRICT ">")
snapshotAgeDays  >  stalenessThresholdDays    → STALE_SNAPSHOT
snapshotAgeDays === 0                          → current (fresh)
```

Error types (full message literals NOT frozen this round; consistent with §27A.7 / §32A.9):
- **`TypeError`** — `input` is not a non-null, non-array object · `snapshotPresent` missing or non-boolean · `replenishmentModel` missing or non-string · the model-scoped presence flag (`forecastPresent` for forecast-driven, `salesBasisPresent` for sales-driven) missing or non-boolean · `snapshotAgeDays` or `stalenessThresholdDays` non-number (evaluated only when `snapshotPresent===true`).
- **`RangeError`** — `replenishmentModel` is a string but not one of the two allowed enums · `snapshotAgeDays` or `stalenessThresholdDays` is `NaN` / `Infinity` / `-Infinity` / **negative** (evaluated only when `snapshotPresent===true`).

Validation is **branch-scoped** (mirrors §27A/§32A): `snapshotAgeDays` / `stalenessThresholdDays` are validated only on the `snapshotPresent===true` path (they are ignored when the snapshot is absent); the demand-basis presence flag is validated only on its own model branch. Frozen prohibitions: **no** `parseFloat` / `Number` / `Boolean` coercion; **no** numeric-string acceptance; **no** system clock; **no** locale parsing; **no** fallback to `0` / `OK` / `sales_driven`; **no** input mutation.

### 34A.6 Deterministic examples (spec only — no tests run this round)

```text
1. Missing snapshot
   in:  { snapshotPresent:false, replenishmentModel:"forecast_driven", forecastPresent:true }
   out: { state:"MISSING_SNAPSHOT", calculationAllowed:false }        (truth-table #1; snapshot absent, age ignored)

2. Stale snapshot
   in:  { snapshotPresent:true, snapshotAgeDays:10, stalenessThresholdDays:7, replenishmentModel:"sales_driven", salesBasisPresent:true }
   out: { state:"STALE_SNAPSHOT", calculationAllowed:true }           (truth-table #5; 10 > 7 → warn-and-proceed)

3. Current snapshot + forecast-driven + missing forecast
   in:  { snapshotPresent:true, snapshotAgeDays:1, stalenessThresholdDays:7, replenishmentModel:"forecast_driven", forecastPresent:false }
   out: { state:"MISSING_FORECAST", calculationAllowed:false }        (truth-table #2 / #9; blocked)

4. Current snapshot + forecast-driven + forecast present
   in:  { snapshotPresent:true, snapshotAgeDays:1, stalenessThresholdDays:7, replenishmentModel:"forecast_driven", forecastPresent:true }
   out: { state:"OK", calculationAllowed:true }                       (truth-table #6)

5. Current snapshot + sales-driven + forecast absent (ignored)
   in:  { snapshotPresent:true, snapshotAgeDays:1, stalenessThresholdDays:7, replenishmentModel:"sales_driven", salesBasisPresent:true, forecastPresent:false }
   out: { state:"OK", calculationAllowed:true }                       (truth-table #7; sales-driven ignores forecast)

6. Exact staleness boundary
   in:  { snapshotPresent:true, snapshotAgeDays:7, stalenessThresholdDays:7, replenishmentModel:"forecast_driven", forecastPresent:true }
   out: { state:"OK", calculationAllowed:true }                       (age === threshold → fresh; strict ">")

7. Invalid input → TypeError
   in:  { snapshotPresent:"yes", replenishmentModel:"forecast_driven", forecastPresent:true }
   out: throws TypeError                                              (non-boolean snapshotPresent)

8. Invalid numeric boundary → RangeError
   in:  { snapshotPresent:true, snapshotAgeDays:-1, stalenessThresholdDays:7, replenishmentModel:"forecast_driven", forecastPresent:true }
   out: throws RangeError                                             (negative age on the snapshotPresent===true branch)
```

### 34A.7 Scenario #29 / #30 mapping (spec only — Matrix unchanged)

- **Scenario #29 (Missing / stale snapshot)** → §34A branch 1 / 4: `snapshotPresent=false` ⇒ `MISSING_SNAPSHOT` (blocked); `snapshotPresent=true` and `snapshotAgeDays > stalenessThresholdDays` ⇒ `STALE_SNAPSHOT` (allowed + warning). **Never 0.** **EXECUTED_EXISTING_CORE (Round 8B).**
- **Scenario #30 (Missing Forecast, forecast-driven SKU)** → §34A branch 2: `replenishmentModel="forecast_driven"` and `forecastPresent=false` ⇒ `MISSING_FORECAST` (blocked). **Never 0.** **EXECUTED_EXISTING_CORE (Round 8B).**

Both scenarios are **EXECUTED_EXISTING_CORE (Round 8B)** against the implemented `classifyPlanningDataState`; the Golden Matrix is now **25 executed / 15 pending / 0 canonical-blocked**. Round 8A moved their blocker from *"exact pure-function contract not frozen"* to *"Canonical contract frozen; pure-core implementation pending"*; Round 8B closed the implementation and executed both.

> **Status:** §34A is a **frozen contract; the pure classifier `classifyPlanningDataState` is IMPLEMENTED (Round 8B) exactly to it — 325 unit / 117 golden PASS, Golden #29/#30 executed.** Runtime (Line / Qualified Incoming / DB / API / UI) remains NOT IMPLEMENTED. The §34 business outcomes are unchanged; §34A only freezes the deterministic function contract that represents them.

---

## 35. Factory Deterministic Allocation Freeze (CANONICAL v4.1)

- **Grain:** `warehouse_id + Master SKU`. Factory is a **shared source, owned by no single Company.**
- Verify the factory/warehouse is **eligible** to produce/ship that SKU before allocating.
- **Deterministic order:** (1) earliest **Required-by date**, (2) higher **`allocation_priority`**, (3) stable **company / marketplace / destination key**.
- After each allocation, **decrement the factory's remaining source quantity**; the same factory quantity is **never duplicated to multiple companies**.
- **`TW_SHENGYI` has no hidden default preference** — applied only with an explicit SKU/Series/route mapping; otherwise the deterministic order above governs. Configured `TW_SHENGYI` preference = Future Extension (§19).

---

## 36. Order State Separation — Live Signal · Monthly Suggestion · Emergency Draft · User Decision (CANONICAL v4.1)

Three distinct states, never conflated. **This does not change any Engine A / Engine B formula** — it fixes *where each value lives and what may overwrite it*.

### 36.1 Layer A — Live Planning Signal (derived, not persisted)
T1–T4 **Demand / Shortage** are **continuously recalculated** from the latest valid data and used for: inventory danger notification, shortage-risk indicator, planner review, the emergency-order entry point, and judging whether a current gap is already offset by incoming / approved-committed supply / reallocation. It is a **live derived planning state, NOT a saved Suggested Order snapshot**. **`Forecast Shortage ≠ Order Qty`** (Engine A shortage is never written straight to an order). When the live result changes it **must NOT** overwrite an existing Draft's `recommended_qty`, the user's `order_qty`, or `carton_qty`, and must not mutate any sent / approved / PO-converted historical quantity.

### 36.2 Layer B — Persisted System Suggestion (monthly + emergency)
A formal planning run (Engine A → Engine B reallocation → `Net Order Need` → T1–T3 Order carton CEILING §14/§31) produces a persisted Suggested Order, stored as:
```
request_order_allocation_drafts            (parent: monthly / emergency recommendation at the existing scope grain — company + country + marketplace + sku + category + series)
└─ request_order_allocation_draft_lines    (bucket / allocation child line; SKU inherited from the parent via request_allocation_draft_id — the line row itself carries no sku column)
     • recommended_qty  = persisted snapshot of the SYSTEM Suggested Order Qty
     • order_qty        = the quantity the user will submit / order
     • carton_qty       = carton quantity from the actual order_qty ÷ units_per_carton
```
Cadence is **monthly** (one recommendation per monthly planning cycle); each new month creates a **new** cycle recommendation and **never overwrites** a prior month's Draft/Line. *(The persisted cycle-key / uniqueness mechanism — e.g. whether a `YYYY-MM` key column is used — is **BLOCKED BY B-7**, `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11; `YYYY-MM` here is a cadence label, not a ratified key.)* A single monthly run may produce **many** scope/SKU parent records (one per eligible scope), not one global parent. *(The exact scheduled day/time is Runtime scheduling config, `SYSTEM_RUNTIME_ARCHITECTURE.md` — not defined here.)* Uses existing fields only — **no new DB column**.

### 36.3 Layer C — User Order Decision
On user edit: **`recommended_qty` stays unchanged; `order_qty` is updated; `carton_qty` is recalculated.** A user input never overwrites `recommended_qty`, and re-displaying the live Demand must never auto-revert `order_qty` back to the system value. When `units_per_carton` exists: `carton_qty = order_qty ÷ units_per_carton` — integer for a whole-carton order, **may be fractional for an explicit partial-carton override**; the user's partial-carton `order_qty` is **never** re-CEILING'd / FLOOR'd / rounded (display may format decimals, but the persisted value is not silently rounded).

### 36.4 Emergency Manual Order
A planner may trigger an on-demand order at any time. It uses the **same Engine A / Engine B canonical formulas** (differs only by trigger time + draft provenance — no second formula): (1) re-run Engine A on latest data; (2) run Engine B reallocation; (3) compute Suggested from the current `Net Order Need`; (4) create a new `request_order_allocation_drafts` + `_lines`; (5) write the current Suggested as `recommended_qty`; (6) user may edit `order_qty` / `carton_qty`; (7) edits never overwrite `recommended_qty`. An emergency order must **not**: use raw Forecast Shortage as Order Qty, skip reallocation, overwrite the month's existing monthly recommendation or any other Draft, or write a T4 line. Provenance uses existing source/trigger/note fields — **no new schema**.

## 37. Partial-Carton Override — End to End (CANONICAL v4.1)

System `recommended_qty` is always a full-carton CEILING (§14). The **user `order_qty` is independent** and an **explicit partial-carton override is allowed all the way through Send → Approval → Purchase Order** — never rounded back to a full carton.

- **Request Order Draft:** user may enter a non-`units_per_carton`-multiple `order_qty`; preserve `recommended_qty`, update `order_qty` + exact `carton_qty`, flag partial-carton override, keep an override note; **Send is not blocked** by a partial carton.
- **Approval:** `Approved Qty` may be a non-full-carton multiple; the override fact + note are preserved; approval is **not** blocked for being partial; it is **not** auto-reverted to Suggested and **not** carton-CEILING'd.
- **Purchase Order:** conversion preserves the final approved **exact** quantity, its exact `carton_qty`, the `units_per_carton` snapshot, the partial-carton override fact/note, and traceability back to the system recommendation. **Request Order → PO mapping must NOT re-round the quantity up to a full carton.**
- **Missing `units_per_carton`** still blocks the *system Suggested* calculation and Send (§14) — no silent default. **MOQ automation remains a Future Extension (§19).** Uses existing fields/note contract — **no new DB column**.

---

## 38. External-Origin Planning Admission Gate (CANONICAL v4.5 — documentation only; Runtime NOT implemented)

> **Owner:** THIS document owns the **planning-admission requirement** and the **externally-originated contribution = 0** rule for Qualified Incoming. The external discovery → quarantine → review → resolution operational flow is owned by `SUPPLY_CHAIN_SYSTEM_FLOW.md` §12; the authority hierarchy / fail-closed pipeline by `SYSTEM_RUNTIME_ARCHITECTURE.md`; the exception/reconciliation read-model + Link/Adopt/Reject/Ignore workflow by `INVENTORY_TABLE_MAPPING_SPEC.md` / `WAREHOUSE_OPERATIONS_SPEC.md`. This section defines **no formula** and changes **no** existing number. **No Runtime for admission/quarantine/notification/review is implemented.**

**38.1 Admission precedes the §2E ten-gate predicate.** A supply candidate is **not eligible to be tested** by the §2E Qualified Incoming predicate until its authority/admission state is eligible. §2E is unchanged; §38 is a **pre-gate**.
- **Eligible for admission:** (a) a **KM canonical source** — Formal Shipment; approved Shipping Plan committed supply (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`); PO committed supply (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §P1-B); confirmed KM inventory; confirmed KM receipt; **or** (b) an external-origin record that has completed an explicit **Adopt** action and now carries a KM canonical Shipment / Operation lineage.
- **Ineligible (contribution = 0):** a raw unlinked external record; a quarantined record; a review-pending record; a rejected record; an ignored-for-planning record.

**38.2 Externally originated, unlinked quantity always contributes 0.** Until an explicit KM **Adopt**, an externally originated inbound/outbound record contributes **0** to Qualified Incoming, committed supply, Current Stock, Reserved Stock, Replenishment, Shipping Recommendation, and Order Recommendation. `fresh = true`, a positive quantity, a present ETA, an accepted external status, a stable external ID, and technical de-duplication are **individually and jointly insufficient**. **Freshness never authorizes admission.**

**38.3 Linked external evidence contributes 0 independently.** A record reliably linked to a KM Shipment / Operation is **execution evidence** only; the KM Shipment remains the sole Incoming owner and the external quantity is never counted separately (reconciliation / discrepancy only).

**38.4 Stale external record.** Remains **visible and quarantined**, contribution 0 — never hidden, deleted, or auto-admitted. This is a **separate contract** from the generic §34A `STALE_SNAPSHOT` warn-and-proceed readiness classifier: §34A generic snapshot readiness may warn-and-proceed, but **external-origin authority admission is fail-closed** until human resolution. §34A must **not** be used to admit an unlinked external operation.

**38.5 Count-once after adoption.** Only the **resulting KM canonical record** (Shipment / Operation) may contribute after Adopt; the external record itself never adds a second quantity (§30 count-once).

**38.6 No fuzzy matching.** Admission and linkage use only a **stable source identity** (owner `DATABASE_RELATIONSHIP_MAP.md`). SKU+ETA, `warehouse_code`, quantity, display label, address, and free text are **never** dedup or link keys.

**38.7 Golden business expectations (future — §33; #12/#13/#14 remain IMPLEMENTATION_PENDING).** External-origin scenarios (business expectation only; not yet executed):
- **Fresh unlinked external record** → visible, Qualified Incoming contribution **0**.
- **Stale unlinked external record** → visible + stale, contribution **0**.
- **Adopted external record** → the resulting KM Shipment may qualify under §2E (never the external row itself).
- **Linked external evidence** → never duplicates the KM Shipment quantity.
- **Rejected external record** → contribution **0**.

---

**FINALIZED v4.5 Calculation Specification.** Header, Changelog, and footer versions are consistent (v4.5 — Round 4D-C External-Origin Planning Admission Gate §38 landed, B-4 = CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED; v4.3 — v4.2 Round 5A §27A classifier freeze + v4.3 Round 6A §32A reallocation-eligibility owner/contract freeze; Round 6 landed the §32A predicate as IMPLEMENTED with Golden #21/#22 executed; **v4.4 — Round 8A §34A Missing / Stale Data pure-classifier `classifyPlanningDataState` contract freeze (documentation), then Round 8B implemented `classifyPlanningDataState` in the pure core, executed Golden #29/#30, and landed the verified pure core + suites into Main — §34 business outcomes unchanged, semantic version stays v4.4**). Golden Scenarios: 40 specified (§33); Golden #21/#22/#28/#29/#30/#31/#33 and the §27A/§32A/§34A pure core are executed (25 executed / 15 pending / 0 canonical-blocked; 325 unit + 117 golden PASS, run from Main); the full 40-scenario executable matrix remains PENDING (the 15 remaining scenarios need non-pure-core owners).
```text
Specification finalized.
Runtime not implemented.
Executable golden tests pending.
No production behavior changed in this task.
```

**End of Document**
