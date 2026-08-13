# F1-7E-PREREQ-0-AI-PLAN-FACT-AUTHORITY-DECISION-R1 — Three-Layer Fact Authority Contract

**Outcome: DECISION / CONTRACT established (no runtime change).** Baseline HEAD `a0827ca`. This round freezes the
three-layer fact model for the AI-Plan (`request-order.js`) first layer, classifies every current business field, maps
each to its authority + future backend read owner, and records the API-migration contract that governs PREREQ-1..5. It
does **not** implement any owner, change any formula, or touch runtime.

**FINAL GATE: PASS** — the three fact classes are unambiguously separable and every active first-layer business field has
a documented authority + migration path. No round-level HALT. Two field-specific `PRODUCT_DECISION_REQUIRED` items are
recorded for the implementing rounds (they do not block this contract).

**F1-PHASE1-LIVE-ACCEPTANCE-R2 = PAUSED_BY_USER_FOR_API_MIGRATION (unchanged).**

---

## The three-layer fact model (frozen definitions)

```
LAYER 1  RAW / OPERATIONAL FACT   — operational input/context; aggregation of persisted operational rows.
                                     NEVER a Target%-adjusted / allocated / blended / horizon / prep-shifted value.
LAYER 2  CANONICAL PLANNING FACT   — official system planning output (adjusted demand, allocated supply, gap, recommended).
                                     Owned by the existing planning engine. Frontend NEVER recomputes it.
LAYER 3  HUMAN DECISION FACT       — the quantity/value a human actually chose/approved.
                                     Distinct from both raw context and system recommendation.

RAW INPUT / CONTEXT  →  CANONICAL PLANNING RESULT  →  HUMAN DECISION  →  REQUEST ORDER  →  PURCHASE ORDER
```

**Critical invariant (the shared-pool example):** `factory_stock_raw_qty = 1,200` does NOT equal
`allocated_factory_supply_qty = 700`. A factory shared across KM / ResTW / ResUS legitimately shows a raw pool of 1,200
while the planning engine allocates only 700 to one company/site. Both coexist as DIFFERENT facts. The same holds for
forecast (raw Σ vs Target%-adjusted blended demand), site/overseas inventory (raw pool vs allocated supply), and PO
remaining. **An API migration must never replace a Layer-1 raw fact with a Layer-2 planning fact merely because an
existing API already exposes the planning fact.**

---

## PHASE 0 — Current AI-Plan first-layer field inventory

Source of truth = `request-order.js` `_buildRequestOrderRowsFromDb()` (the object it returns per SKU row, lines ~367-394)
plus the top-table "Suggest Order" cell painted by `_opMatSuggestedTotal_` from the materialized gap. Classification is
traced from the ACTUAL calculation, not the column label.

| # | Field (code) | UI sense | Layer | Class |
|---|---|---|---|---|
| 1 | `sku` / `country` / `marketplace` / `marketplaceId` / `company` | identity | — | READ_MODEL_ASSEMBLY (marketplace_skus) |
| 2 | `category` / `series` | identity | — | READ_MODEL_ASSEMBLY (sku_details) |
| 3 | `basicFcT3` | Basic FC (T3) | **1** | **RAW_OPERATIONAL_FACT** (currently LEGACY_PARALLEL browser Σ) |
| 4 | `specialEventsFc` | Special Event FC | **1** | **RAW_OPERATIONAL_FACT** (currently LEGACY_PARALLEL browser Σ) |
| 5 | `siteStock` | Site Stock | **1** | **RAW_OPERATIONAL_FACT** |
| 6 | `thirdPartyStock` | 3PL / Overseas Stock | **1** | **RAW_OPERATIONAL_FACT** |
| 7 | `factoryStock` | Factory Stock | **1** | **RAW_OPERATIONAL_FACT** |
| 8 | `totalOngoingOrders` | Ongoing Orders / Open PO Remaining | **1** | **RAW_OPERATIONAL_FACT** (persisted `remaining_qty` preferred; browser fallback differs — see PDR-1) |
| 9 | `leadTime` | Lead Time | **1** | **RAW_OPERATIONAL_FACT** |
| 10 | Suggest Order (top cell, `_opMatSuggestedTotal_`) | Suggest Order | **2** | **CANONICAL_PLANNING_FACT** (already scoped) |
| 11 | `risk` / `remaining` / `suggestedOrder` (row fields) | placeholders | — | DISPLAY_ONLY (always null → "--") |
| 12 | `boxSize` (`unitsPerCarton`) | carton basis | — | READ_MODEL_ASSEMBLY (sku_details) |
| 13 | 2nd-layer per-tier `_roTierBalance/_roTierRecommended/_roTierSuggested` | tier gap/suggested | **2** | CANONICAL_PLANNING_FACT (reads engine output; DISPLAY of canonical) |
| 14 | 2nd-layer carton breakdown (`_roCartonBreak`) | carton split | — | DISPLAY_ONLY / FORMAT_ONLY |
| 15 | `allocEdits` / `_roEffectiveOrderQty` (chosen order qty) | chosen/manual Order Qty | **3** | **HUMAN_DECISION_FACT** |
| 16 | allocation draft company/tier split (Send Request flow) | manual allocation | **3** | **HUMAN_DECISION_FACT** |
| 17 | Target% (Target Rules editor, separate surface) | target rule | **2** | CANONICAL_PLANNING_FACT input (`fc_target_rules`; edited via `upsertFcTargetRule`, not a first-layer read column) |

No field is `UNKNOWN_REQUIRES_DECISION`. No `FACT_LAYER_MISCLASSIFICATION` found (the informational columns are NOT
persisted or consumed as canonical downstream truth — the canonical planning consumption path is the materialized gap,
field 10/13, which is separate).

---

## PHASE 1 — Authority matrix (Layer-1 facts + the Layer-2/3 anchors)

Legend: Reuse existing API? Y / N / P(artial). All "Current Browser Source" reads come from `_opDbCache` (broad DB) today.

### Field 3 — Basic FC (T3) · `basicFcT3` · Layer 1
- **Calc:** `basicT3()` = Σ of RAW `fc_regular_forecast[month]` over the Asia/Taipei-`now`-anchored window N+1..N+3, per `sku|country|marketplace`, per year. **No Target% applied.**
- **DB source:** `fc_regular_forecast`. **Semantic:** raw regular forecast volume in the displayed 3-month window.
- **Canonical for Recommendation?** NO (recommendation uses Target%-**adjusted** demand). **Raw informational?** YES.
- **Reuse existing API?** **N** — `recommendation.workspace.get.allocatedForecastQty` is Target%-adjusted + blended with special events → a *different number*. Reusing it = `BUSINESS_EQUIVALENCE_FAILED`.
- **Future owner:** PREREQ-2 (fcSummary scoped raw-forecast owner). **Migration:** browser Σ → backend Σ of the SAME raw rows over the SAME window. **BEFORE == AFTER:** required. **Risk if replaced by adjusted demand:** silently changes a user-visible number; misleads the planner about raw demand.

### Field 4 — Special Event FC · `specialEventsFc` · Layer 1
- **Calc:** `_roSpecialEventsTotal()` = Σ `fc_special_events.fc_qty` whose PREPARATION month (`event_start_date − 30 days`) falls in N+1..N+3, scoped by sku(+company/country/marketplace). Each event counted once; always 100% (never Target%-multiplied).
- **DB source:** `fc_special_events`. **Semantic:** raw special-event demand in the prep-month window — shown as a **separate** column from Basic FC.
- **Canonical for Recommendation?** NO as a separate fact (recommendation folds special events INTO blended demand). **Raw informational?** YES.
- **Reuse existing API?** **N** — no owner exposes special-event Σ as a standalone column; the reco blends it away. **Future owner:** PREREQ-2 (reuse KMPD `scopedSpecialEventPreps` prep-month rule as a frozen read). **BEFORE == AFTER:** required.

### Field 5 — Site Stock · `siteStock` · Layer 1
- **Calc:** `siteStock()` = from `amazon_inventory_snapshot`, the LATEST snapshot row matching strict site scope (blank country/marketplace must NOT wildcard), value = `available + fc_transfer + fc_processing`.
- **DB source:** `amazon_inventory_snapshot`. **Semantic:** raw platform on-hand+in-flight for the exact site.
- **Canonical for Recommendation?** PARTIAL — reco `currentStockQty` is derived from the same table but with the engine's own selection/lifecycle bucketing; may differ. **Raw informational?** YES.
- **Reuse existing API?** **P** — value may not be byte-identical to `currentStockQty`; the raw "latest-row, strict-scope, avail+transfer+processing" selection must be preserved. **Future owner:** PREREQ-3 (scoped raw inventory owner). **BEFORE == AFTER:** required against the CURRENT browser selection.

### Field 6 — 3PL / Overseas Stock · `thirdPartyStock` · Layer 1
- **Calc:** `thirdParty()` = Σ `overseas_inventory_snapshot.available_stock` over same-country NON-factory warehouses (strict country scope; a warehouse with no record does not leak).
- **DB source:** `overseas_inventory_snapshot` ⋈ `warehouses`. **Semantic:** raw 3PL/overseas available pool.
- **Canonical for Recommendation?** NO — the engine surfaces only `allocatedOverseasQty` (allocated, not raw pool). **Raw informational?** YES.
- **Reuse existing API?** **N** — allocated ≠ raw pool (the shared-pool invariant). **Future owner:** PREREQ-3. **BEFORE == AFTER:** required. **Risk:** replacing raw pool with allocated qty understates available inventory.

### Field 7 — Factory Stock · `factoryStock` · Layer 1
- **Calc:** Σ `factory_stock.current_stock` per SKU across factory warehouses.
- **DB source:** `factory_stock`. **Semantic:** raw factory on-hand pool (company-independent; shared across KM/ResTW/ResUS).
- **Canonical for Recommendation?** NO — engine surfaces only `allocatedFactoryQty`. **Raw informational?** YES.
- **Reuse existing API?** **N** — the canonical shared-pool example: `factory_stock_raw_qty (1,200) ≠ allocated_factory_supply_qty (700)`. **Future owner:** PREREQ-3. **BEFORE == AFTER:** required. **Risk:** replacing raw with allocated hides shared-pool capacity and breaks the KM/ResTW/ResUS independence contract.

### Field 8 — Ongoing Orders / Open-PO Remaining · `totalOngoingOrders` · Layer 1
- **Calc:** `ongoing()` = Σ over `purchase_order_lines` whose parent PO status ∈ `RO_OPEN_PO_STATUS` {issued, in_production, partial_completed, partial_shipped, ready_to_ship, confirmed}, of: persisted `remaining_qty` when present, **else fallback** `max(0, ordered − max(shipped, completed))`.
- **DB source:** `purchase_order_lines` ⋈ `purchase_orders`. **Semantic:** raw available-to-ship remaining on OPEN POs, per SKU.
- **Canonical for Recommendation?** NO (reco uses SHIPPED_IN_TRANSIT shipments, a different concept). **Raw informational?** YES.
- **Reuse existing API?** **P** — the persisted `remaining_qty` is the F1-7C canonical `max(0, completed − shipped)`; REUSE that definition. BUT: (i) this is a per-SKU aggregation over an OPEN-status set, not the PO-keyed F1-7C grain; (ii) the browser FALLBACK formula `max(0, ordered − max(shipped, completed))` DIFFERS from the canonical persisted definition. → **PDR-1** (below).
- **Future owner:** PREREQ-1 (open-PO-remaining-per-SKU, composing F1-7C `remaining_qty`). **BEFORE == AFTER:** required for the persisted path; the fallback semantic must be frozen by PDR-1. **Risk:** conflating "available-to-ship remaining" with "production-outstanding" would double-count supply.

### Field 9 — Lead Time · `leadTime` · Layer 1
- **Calc:** `leadTime()` = `supplier_price_list` latest active row (by `effective_from`) → `lead_time_days`, per SKU.
- **DB source:** `supplier_price_list`. **Semantic:** raw supplier lead time. **Canonical for Recommendation?** NO (no reco/gap backend reads `supplier_price_list`). **Raw informational?** YES.
- **Reuse existing API?** **N** — no backend owner reads it. **Future owner:** PREREQ-4 (or folded into PREREQ-1/3). **BEFORE == AFTER:** required.

### Field 10/13 — Suggest Order / tier gap+suggested · Layer 2 (ALREADY SCOPED)
- **Owner:** `orderPlanningGap.get` (43_ materialized `order_planning_gap`, T1–T4 gap/suggested) + `recommendation.workspace.get` (42_). Read verbatim ("no math"); painted via `_opMatCache`. **Reuse:** YES — unchanged; the AI-Plan workspace COMPOSES it, never recomputes.

### Field 15/16 — Chosen Order Qty / manual allocation · Layer 3
- **Owner:** the human, persisted via `createRequestOrderDraft` / `upsertRequestOrderAllocationDraft(Lines)` → `request_order_allocation_drafts` → Request Order → PO. **Migration:** unaffected by a read cutover; stays a write path. Must remain DISTINCT from Layer-1 context and Layer-2 recommendation.

### Field 17 — Target% · Layer 2 input
- **Owner:** `fc_target_rules` (canonical), edited via `upsertFcTargetRule` (separate write surface). Feeds KMPD `adjustedRegularFc`. NOT a first-layer read column; out of scope for a first-layer READ cutover.

---

## PHASE 2 — Raw fact semantic contracts (Layer 1 — frozen)
Each is the EXTRACTED current browser semantic (no new formula invented):
- **Basic FC (T3)** = Σ raw `fc_regular_forecast` over the displayed 3-month window (N+1..N+3), per site+year. **NOT** Target%-adjusted; **NOT** blended with special events; **NOT** recommendation demand.
- **Special Event FC** = Σ raw `fc_special_events.fc_qty` in the prep-month window (start − 30d ∈ N+1..N+3), once per event, 100% (never Target%). A **separate** column from Basic FC.
- **Site Stock** = latest `amazon_inventory_snapshot` row for the exact site, `available + fc_transfer + fc_processing`. Strict scope (no blank-wildcard).
- **3PL / Overseas Stock** = Σ `overseas_inventory_snapshot.available_stock` over same-country non-factory warehouses. Raw pool, **not** allocated.
- **Factory Stock** = Σ `factory_stock.current_stock` per SKU across factory warehouses. Raw pool, company-independent, **not** allocated.
- **Open-PO Remaining** = Σ over OPEN-status POs of persisted `remaining_qty` (canonical `max(0, completed − shipped)`), fallback per PDR-1. Available-to-ship, **not** production-outstanding.
- **Lead Time** = `supplier_price_list` latest-active `lead_time_days` per SKU.

**Time-anchor contract:** the N+1..N+3 window is currently resolved from browser Asia/Taipei `now`. To preserve
BEFORE == AFTER when aggregation moves backend, the window MUST be resolved from an explicit input (client-supplied
"now"/planning cycle or a frozen calculation month), never re-derived from the server clock. This is a **design
constraint for PREREQ-2**, not a HALT (the fact is reproducible given an explicit anchor).

---

## PHASE 3 — Canonical planning authorities (Layer 2)
| Authority | Module | Grain | Output semantic | Transformed vs raw | Reusable by AI-Plan Layer-1? |
|---|---|---|---|---|---|
| Forecast (adjusted demand) | KMPD (`adjustedRegularFc`, `planningDemandByMonth`, `scopedSpecialEventPreps`) in `90_…bundle.gs` | per scope+SKU+month | Target%-adjusted regular + special, blended | **Transformed** | For Layer-2 demand YES; for Layer-1 raw Basic/Special **NO** |
| Inventory projection | KMPS/KMHP/KMTPP (`buildProductionRecommendationSource`, `projectHorizons`, `projectTimePhasedSupply`) | per scope/destination | opening supply, allocated pools, horizon/time-phased projection | **Transformed (allocated)** | For allocated supply YES; for Layer-1 raw pools **NO** |
| Order Planning Gap | 43_ (`order_planning_gap` materialized; `orderPlanningGap.get`) | per company/country/marketplace/SKU | T1–T4 gap + suggested | Canonical output | YES (Layer-2, already consumed) |
| Recommendation | 42_ (`recommendation.workspace.get`) | single-scope in, multi-SKU out | recommended_qty, calculatedGap, allocatedForecastQty, currentStockQty, openingSupplyComposition | Canonical output | YES (Layer-2); its forecast/stock members are transformed → not Layer-1 |
| PO remaining | 50_ (`purchaseOrder.workspace.get`) | per PO line | `max(0, completed − shipped)` | Canonical persisted | YES as the **definition** to reuse for PREREQ-1 (needs per-SKU/open aggregation) |

**Proved inequalities (why reuse-as-is fails for Layer 1):**
`Raw Forecast (Basic/Special) ≠ Adjusted Planning Demand (allocatedForecastQty)` — Target% + blending.
`Raw Factory Stock ≠ Allocated Factory Supply` — shared-pool allocation (1,200 ≠ 700).
`Raw Overseas/Site Pool ≠ Allocated Planning Supply` — allocation constraints.
`Open-PO Remaining (available-to-ship) ≠ reco incoming (SHIPPED_IN_TRANSIT)` — different supply concept.

---

## PHASE 4 — Future backend read-owner design (DESIGN ONLY — do not implement)
Minimum owner set to remove browser aggregation WITHOUT a second engine. Each is a scoped READ owner (never
getOperationDb, never a write, never a planning recompute):

- **PREREQ-1 — Open-PO-Remaining-per-SKU read owner.** Composes F1-7C canonical per-line `remaining_qty`; aggregates per
  SKU over the frozen OPEN-PO status set. Cleanest reuse; do first. Resolve **PDR-1** (fallback semantics).
- **PREREQ-2 — fcSummary scoped raw-forecast owner** (implement the registered-but-unimplemented `fcSummary`). Exposes raw
  `fc_regular_forecast` window Σ (Basic) and raw `fc_special_events` prep-month Σ (Special) as SEPARATE facts, reusing
  KMPD's prep-month rule as a frozen read. MUST NOT emit Target%-adjusted/blended demand. Honors the time-anchor contract.
- **PREREQ-3 — Scoped raw-inventory owner.** Raw per-SKU `amazon_inventory_snapshot` (latest, strict scope),
  `overseas_inventory_snapshot` Σ (non-factory same-country), `factory_stock` Σ. Raw pools ONLY — no allocation logic.
- **PREREQ-4 — Lead-time read** (`supplier_price_list` latest-active per SKU); may fold into PREREQ-1/3's owner.
- **PREREQ-5 / CUTOVER — AI-Plan first-layer read model.** COMPOSES PREREQ-1..4 (Layer 1) + `orderPlanningGap.get` /
  `recommendation.workspace.get` (Layer 2). A **composer**, not an engine. Then cut `_buildRequestOrderRowsFromDb` off
  `_opDbCache`. (Target Rules editor + forecast-breakdown surfaces are separate follow-ups.)

---

## PHASE 5 — Target AI-Plan data flow (documentation)
```
RAW FACT OWNERS                          CANONICAL PLANNING OWNERS
 ├─ Raw Forecast (PREREQ-2)               ├─ Order Planning Gap (43_)
 ├─ Raw Inventory (PREREQ-3)              └─ Recommendation (42_)
 ├─ Open-PO Remaining (PREREQ-1)                     │
 └─ Lead Time (PREREQ-4)                             │
          └───────────────┬───────────────----------┘
                          ▼
        AI-PLAN FIRST-LAYER READ MODEL / WORKSPACE   ← COMPOSER ONLY (no calculation authority)
                          ▼
                    AI-PLAN UI
                          ▼
              Human Chosen Qty (Layer 3)
                          ▼
                   Request Order  →  Purchase Order
```

---

## PHASE 6 — Naming / semantic safety (recommendations only — NO UI change this round)
To make it impossible to treat different quantities as interchangeable, future rounds SHOULD name Layer-1 vs Layer-2
facts distinctly in DTOs/columns:
- `factory_stock_raw_qty` (L1) vs `allocated_factory_supply_qty` (L2)
- `basic_fc_raw_qty` / `special_event_fc_raw_qty` (L1) vs `adjusted_planning_demand_qty` (L2)
- `site_stock_raw_qty` / `overseas_stock_raw_qty` (L1) vs `allocated_supply_qty` (L2)
- `open_po_remaining_raw_qty` (L1, available-to-ship) — never reuse the bare name `remaining_qty` (PO-line grain) for the
  per-SKU aggregate.
UI labels stay as-is this round; the recommendation is that DTO field names carry the `_raw`/`allocated_`/`adjusted_`
qualifier so no future developer swaps them.

---

## PHASE 7 — API migration contract (frozen; mirrored into API_MIGRATION_MASTER_PLAN.md)
1. API migration is **TRANSPORT / READ-OWNER** migration unless a separate business-change task explicitly authorizes otherwise.
2. API migration MUST NOT silently change displayed business semantics.
3. **RAW OPERATIONAL FACT** and **CANONICAL PLANNING FACT** are **different authority classes**.
4. Existing canonical Planning APIs MUST NOT be reused for Raw Facts when the semantic meaning differs.
5. Browser-side Raw Fact aggregation SHOULD move to backend scoped read owners.
6. Moving aggregation backend MUST preserve **BEFORE FACT == AFTER FACT**.
7. Canonical Planning facts MUST NEVER be recomputed in the frontend.
8. The AI-Plan read workspace is a **COMPOSER, not a second engine**.
9. **HUMAN DECISION FACTS** remain distinct from both Raw and Planning facts.
10. **Shared Factory:** `factory_id` NEVER determines company; KM / ResTW / ResUS remain independent company scopes even when sharing a factory.

---

## PRODUCT_DECISION_REQUIRED (for the implementing rounds; do not block this contract)
- **PDR-1 (PREREQ-1):** the current Open-PO-Remaining browser FALLBACK `max(0, ordered − max(shipped, completed))` differs
  from the canonical persisted `remaining_qty = max(0, completed − shipped)`. The fallback fires only on blank persisted
  cells. Decide whether PREREQ-1 (a) reproduces the exact browser fallback for BEFORE == AFTER, or (b) freezes on the
  canonical definition for all rows (a deliberate value change on blank-cell rows). Recommend (a) for a pure transport
  cutover, then a follow-up to converge on (b).
- **PDR-2 (PREREQ-2):** confirm the time-anchor policy — client-supplied `now`/planning cycle vs a frozen calculation
  month — so the N+1..N+3 window is reproducible backend-side (BEFORE == AFTER).

No HALT tokens raised (`AI_PLAN_FIELD_SEMANTIC_AMBIGUOUS` / `DUPLICATE_FACT_AUTHORITY` / `RAW_FACT_REQUIRES_SECOND_ENGINE`
/ `BEFORE_AFTER_NOT_REPRODUCIBLE` / `FACT_LAYER_MISCLASSIFICATION` — none apply: every field has a deterministic current
semantic, no two authorities claim the same fact with different formulas, every raw fact is reproducible from persisted
rows without planning logic, and no informational field is consumed as canonical downstream truth).

## FINAL GATE — PASS
RAW OPERATIONAL FACT ≠ CANONICAL PLANNING FACT ≠ HUMAN DECISION FACT — stated unambiguously and demonstrated
field-by-field. Every active first-layer business field (Basic FC, Special Event FC, Site/Overseas/Factory Stock, Open-PO
Remaining, Lead Time, Gap, Suggested/Recommended, Target%, chosen/manual qty, allocation) has a documented authority +
migration path. **Recommended next task: PREREQ-1 — Open-PO-Remaining-per-SKU scoped read owner** (canonical F1-7C reuse),
resolving PDR-1. Do NOT begin implementation automatically.
