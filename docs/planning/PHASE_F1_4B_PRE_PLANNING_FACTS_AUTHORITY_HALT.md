# Phase F1-4B-PRE — Recommendation Planning-Facts Projection Runtime — Authority Matrix + HALT

> **Status: READINESS AUDIT COMPLETE — IMPLEMENTATION HALTED (2026-08-05).** Per the round's §2 first checkpoint
> ("Before editing, produce a source-proven matrix") and its §3 HALT rule, this is the deliverable. The projector
> cannot be built this round because **several required planning facts have no callable frozen producer** — they are
> *consumed* by the allocator/resolver but *produced* by nothing. Building them would mean **creating new
> survival/weight/eligibility formulas, inventing a demand window / required-by date, and choosing a destination**,
> which §3 and §15 explicitly forbid ("If an existing function cannot be called because its inputs are
> underspecified, HALT instead of reimplementing it"). No runtime code added. Evidence is code-verified (file:line).

---

## A. One-line result

The recommendation resolver's allocation stage (`projectAllocationInputs` → `allocateOverseasSharedPool` /
`allocateFactoryDeterministic`) **requires per-receiver `demandWeight`, `eligiblePoolTypes`,
`eligibleFactoryWarehouseIds`, `destinationWarehouseId`, plus a receiver decomposition and a required-by date/window
— none of which any implemented runtime produces.** They are the "single biggest freeze finding" the source contract
named a year of rounds ago (`RECOMMENDATION_SOURCE_CONTRACT_SPEC.md` SC-1 ~L131-140; SC-9 #1) and never built. The
demand / gap / net-order-need / run-rate / current-stock / qualified-incoming halves *are* implemented and callable —
but a recommendation cannot be produced from them without the missing allocation-fact producers, so this round HALTs.

---

## B. §2 Authority matrix (source-proven)

Classification: `SOURCE_PROVEN_EXISTING` (stored column, read directly) · `DERIVABLE_BY_FROZEN_OWNER` (an implemented
pure function produces it) · `MISSING_CANONICAL_AUTHORITY` (no implemented producer; only a spec formula or a
caller-supplied DTO field) · `NOT_REQUIRED`.

| Planning fact | Req by runtime | Frozen owner (implemented?) | Raw DB/source authority | Producer status |
|---|---|---|---|---|
| destination warehouse | **yes** | D-3 caller/planning-scope only; **no routing runtime** (`source-projection.js:147-154`; SC-11.3 "never inferred") | none stored per demand | **MISSING_CANONICAL_AUTHORITY** |
| planning window code | yes (Weekly grain) | none — Weekly line key part (`source-facts.js:546`); consumed, never produced | none | **MISSING_CANONICAL_AUTHORITY** |
| window start/end | for run-rate/required-by | run-rate window is internal to `normalizedAvgSalesPerDay` (`calculations.js:~360-430`); no *planning* window producer | none | **MISSING_CANONICAL_AUTHORITY** (planning grain) |
| required-by date | yes | `classifyRequiredByWindow` (`calculations.js:572`) **consumes** a date; nothing derives it from planning_cycle | none stored | **MISSING_CANONICAL_AUTHORITY** |
| regular demand | yes | **`calculateForecastDrivenRemainingNeed` (`calculations.js:489-542`)** — Adj Regular FC × Target Rule + 30d safety | `fc_regular_forecast.jan..dec`, `fc_target_rules` | **DERIVABLE_BY_FROZEN_OWNER** (needs base FC + target rules) |
| special-event demand | yes | same engine, added once at 100% (`calculations.js:518-520`) | `fc_special_events.fc_qty` | **DERIVABLE_BY_FROZEN_OWNER** |
| destination current stock | yes | supply-ledger `CURRENT_STOCK` (`source-projection.js:205-247`) | inventory snapshots | **DERIVABLE_BY_FROZEN_OWNER** (already in projection) |
| qualified incoming | yes | `projectSupplyLifecycle`/`evaluateQualifiedIncoming` (F1-3b, `source-projection.js:249-342`) | shipments/plans | **DERIVABLE_BY_FROZEN_OWNER** (already in projection) |
| approved/committed supply | yes | supply-ledger `APPROVED_SHIPPING_PLAN` (F1-3b); PO `COMMITTED_PRODUCTION` **not wired** | plans (yes) / PO (no) | **PARTIAL** (plans derivable; committed-production MISSING) |
| calculated gap | yes | **`calculateGap` (`calculations.js:160-167`)** | derived from the four above | **DERIVABLE_BY_FROZEN_OWNER** |
| net order need | yes (Monthly) | **`sumRemainingShortages` (`calculations.js:434-443`)** | derived | **DERIVABLE_BY_FROZEN_OWNER** |
| survival factor | yes (Weekly alloc) | `CEILING(18 × dailyDemand)` **only inside** `projectAllocationInputs` (`source-facts.js:456`, `SURVIVAL_HORIZON_DAYS=18` :389) — needs a caller `dailyDemand` | run-rate (§22) not wired to receivers | **MISSING_CANONICAL_AUTHORITY** (producer of the receiver `dailyDemand`) |
| demand weight | yes (Weekly alloc) | **none** — `source-facts.js:459` requires caller `demandWeight`; no FC-share/sales-share producer (§7/§24.5) | none stored | **MISSING_CANONICAL_AUTHORITY** |
| eligibility (pool types) | yes (Weekly alloc) | **none** — `source-facts.js:460` validates a caller list; no §23.6/§24.9 derivation from `warehouses` | `warehouses`/`marketplace_skus` (unused) | **MISSING_CANONICAL_AUTHORITY** |
| eligibility (factory wh) | yes (Monthly alloc) | **none** — `source-facts.js:498` validates a caller list; no §40/§35 derivation | `warehouses.is_factory_warehouse` (unused) | **MISSING_CANONICAL_AUTHORITY** |
| receiver decomposition | yes | **none** — `receiverFacts[]` are always caller-supplied (`source-projection.js:358`; reader `sheets.receivers`, `source-reader.js:347`) | none | **MISSING_CANONICAL_AUTHORITY** |
| source availability | yes | supply ledger `effectiveSupplyQty` (`source-facts.js:427`) | inventory/lifecycle | **DERIVABLE_BY_FROZEN_OWNER** |

---

## C. The blocker (§3 HALT conditions met)

The allocation stage is the wall. `projectAllocationInputs` (`source-facts.js:401-505`) does **not** derive the
allocation facts — it validates caller-supplied ones and fails closed when they are absent:

- `demandWeight` — `:459` `finiteNonNeg(rf.demandWeight)` → `MISSING_OR_INVALID_DEMAND_WEIGHT`. No FC-share/sales-share
  producer (§7/§24.5) exists.
- `eligiblePoolTypes` — `:460-461` normalizes/validates a caller list → `INVALID_ELIGIBLE_POOL_TYPES`. No §23.6/§24.9
  warehouse-eligibility producer exists.
- `eligibleFactoryWarehouseIds` — `:498` validates a caller list. No §40/§35 producer exists.
- `survivalNeedQty` — `:454-457` uses caller value, **or** `CEILING(18 × rf.dailyDemand)` — but `dailyDemand` is a
  caller field; nothing wires the run-rate engine's `avgSalesPerDay` into a per-receiver `dailyDemand`.
- `destinationWarehouseId` — `:451` `MISSING_DESTINATION_WAREHOUSE` when absent; D-3 (SC-11.3) forbids inference.
- The whole **`receiverFacts[]` decomposition** (which receivers/marketplaces exist for a scope, and each one's demand
  share) is caller-supplied — `source-projection.js:358` routes `input.receiverFacts` verbatim; the reader reads a
  `sheets.receivers` snapshot (`source-reader.js:347`). No runtime builds it.

These trip the round's own HALT list (§3): *"dependent on creating a new survival/weight/eligibility formula"*
(weight, pool eligibility, factory eligibility), *"dependent on inventing a demand horizon or required-by date"*
(required-by / window have no producer), and *"choosing a destination by guess"* (D-3, no producer). And §15:
*"If an existing function cannot be called because its inputs are underspecified, HALT instead of reimplementing it"*
— the allocators cannot be called because their receiver/factory inputs are underspecified.

**Net effect:** the projector could emit demand + gap + net-order-need + current stock + qualified incoming, but the
Weekly `recommendedQty` is FLOOR over the *allocated* source (`source-facts.js:638-646`) and the Monthly path needs
factory allocation — both require the missing weight/eligibility/receiver/destination facts. So the projector cannot
make the recommendation resolver produce a real `recommendedQty`, which is the round's whole purpose (§13, §20).
Emitting the derivable half while defaulting the missing half to `weight=1`/`eligible=true`/a guessed destination is
exactly the "fake default success" §12 forbids.

---

## D. §3 — one narrowly-bounded decision request

**Decision:** Authorize a dedicated **formula/producer round** to implement the frozen-but-unimplemented
**Allocation-Fact Producers** — the SC-1 "single biggest freeze finding" / SC-9 #1 remainder — namely:

1. §7/§24.5 **demand-weight** (FC-share / sales-share) producer;
2. §23.6/§24.9 **overseas pool-type eligibility** producer (from `warehouses` company+country+3PL+active + FBA
   composition);
3. §40/§35 **factory-warehouse eligibility** producer (from `warehouses.is_factory_warehouse`);
4. §22 **run-rate → per-receiver `dailyDemand`** wiring (so `survival = CEILING(18 × dailyDemand)` has an input);
5. the **receiver decomposition** rule (scope → receivers with per-receiver demand);
6. the **D-3 destination** authority (explicit canonical routing input / persisted assignment — never inferred);
7. the **required-by date / window-code** derivation from `planning_cycle` (frozen window rule).

This is inherently new formula/producer logic — it cannot be done under F1-4B-PRE's "no new formula / invoke-only"
constraint, so it needs its own authorization. It is the true prerequisite that F1-4B-PRE assumed already existed.
(#6 also carries a small UX prerequisite: Manual Recommend must let the user pick a destination; Automatic Recommend
needs a pre-resolved routing assignment — SC-11.3.)

**Alternatively**, if the intent is only to *prove the chain reachable*, that is already done by the existing
**test fixtures** (Weekly 96 / Monthly 24 in `supply-planning-source-projection.test.js` /
`supply-planning-production-source.test.js`) which supply crafted `planningFacts`/`receiverFacts`. No production
producer is needed for that proof — and it does not connect the page.

---

## E. Exact next slice

**F1-5-A — Allocation-Fact Producer Runtime** (the decision in §D): a pure module that, from the canonical DB rows the
projection already reads, INVOKES the frozen owners where they exist (`calculateForecastDrivenRemainingNeed`,
`normalizedAvgSalesPerDay`, `calculateGap`, `sumRemainingShortages`) **and implements** the four spec-only producers
(weight §7/§24.5, pool eligibility §23.6/§24.9, factory eligibility §40/§35, receiver decomposition) + resolves D-3
destination + window/required-by. Because it authors the weight/eligibility formulas, it is a **formula round**, not a
wiring round. Only after it lands does F1-4B-PRE (assemble facts → `projectRecommendationProductionSources`) and then
F1-4B (the read-only API seam) become meaningful.

Until then, the recommendation runtime remains driven only by crafted fixtures; the page keeps its honest stubs.

---

## F. Governance

No new formula, no new runtime, no planning-facts producer; no API / router / Foundation / page / DB / schema /
Apps Script / bundle / CSS change; no source-reader change. F1-3b (supply lifecycle bridge) confirmed landed at HEAD
(`source-projection.js:249-342`; commit `97df611`). Read-only audit; docs-only checkpoint. No live DB accessed. No
push, no deploy. Full suite unchanged (83/83); Golden Matrix 39/1/0; Scenario #34 Pending.
