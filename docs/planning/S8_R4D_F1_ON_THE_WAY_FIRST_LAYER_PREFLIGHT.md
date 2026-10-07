# S8-R4D-F1 — SITE INVENTORY ON-THE-WAY FIRST-LAYER AGGREGATE: PREFLIGHT

## The projection already exists and already ships. What is missing is the first layer, the status contract, and one line of attribution.

```
S8_R4D_F1_ON_THE_WAY_PREFLIGHT = PASS
RUNTIME_MODIFIED = NO · PRODUCTION_WRITE = NO · DEPLOYED = NO · SCHEMA_CHANGES = 0
READ_TABLE_COUNT = 0 · WRITE_TABLE_COUNT = 0 — audited from source, no Production table was read
ARCHITECTURE_DECISION_REQUIRED = YES — three decisions, named in §12
```

Audited against the **current runtime**, not the planning documents. Where the two disagree, the runtime wins
and the disagreement is reported.

---

## 0. The finding that reframes the task

```js
// inventory-replenishment.js:12128 — the LIVE cloud row builder
onTheWay: 0,                       // Shipping Shipment — pending mapping (spec §9)
```

The first-layer **On-the-Way column is a hard-coded literal `0`**, rendered unconditionally at
[:1810](../../assets/js/pages/inventory-replenishment.js#L1810). It is not a measurement, and it does not
distinguish "not loaded" from "nothing incoming".

Meanwhile the real projection **already exists, is already correct, and already ships**:

```
_irBuildShipmentRemainingByReceiver   inventory-replenishment.js:80      the projection
  remaining = MAX(0, shipment_qty - shipment_received_qty)              matches the E1A §2 freeze exactly
  receiver  = company|country|marketplace|sku, lowercased
  lineage   = shipping_plan_line_id -> lineReceiverById, FAIL CLOSED when present-but-unresolvable
_irBuildExposureIndexes_              inventory-replenishment.js:9108    the lineage build
feeds                                 within18days / within30days / within45days / within45plus / shipOverdue
                                      NULL until the lazy exposure read settles — never 0
```

So the honest framing of F1 is not *"build On-the-Way"*. It is:

```
1  MOVE a projection that exists from the LAZY second layer into the FIRST layer
2  REPLACE a hard-coded 0 that already violates the §9 safety rule this task asks to preserve
3  FIX one line of attribution (§3) that silently drops merged-shipment quantity
4  RESOLVE the status vocabulary, which is where the real decision is
```

**The hard-coded `0` is the most serious thing in this audit.** Every other gap is a known, documented
deferral; this one is a number on screen that looks like data.

---

## §2 — NORMAL SHIPMENT PATH

All four resolve from the shipped schema. Nothing invented.

```
NORMAL_SHIPMENT_SCOPE_SOURCE  = shipments.company · shipments.country · shipments.marketplace
                                SHIPMENTS_HEADERS_, 12_:30-38
NORMAL_SHIPMENT_SKU_SOURCE    = shipment_lines.sku                    SHIPMENT_LINES_HEADERS_, 12_:56
NORMAL_SHIPMENT_QTY_SOURCE    = MAX(0, shipment_lines.shipment_qty - shipment_lines.shipment_received_qty)
NORMAL_SHIPMENT_STATUS_FILTER = shipments.status   — SEE §5, THIS IS THE UNRESOLVED PART
```

`remaining_qty` is **runtime-derived and deliberately not persisted** (12_:56 header note), and
`shipment_received_qty` is cumulative physically-received quantity whose historical blanks normalize to 0 at
read time. The canonical quantity field is therefore not a choice — it is the only pair that exists.

```
LINK  shipment_lines.shipment_id -> shipments.shipment_id
```

---

## §3 — MULTI / LINEAGE PATH

```
MULTI_LINEAGE_RECOVERABLE = YES, for company + country + sku + qty
                            CONDITIONAL for marketplace — see the conflict below
```

### The join chain that exists today, written and readable

```
shipment_lines.shipping_plan_line_id            written 12_:687, column ensured 12_:417
   -> shipping_plan_lines.shipping_plan_line_id
        gives: sku · site_sku · marketplace (physical column `marketplace_seperate`, 11_:398-410)
   -> shipping_plan_lines.shipping_plan_id
        -> shipping_plans.shipping_plan_id
             gives: company · country   (NOT on the line — SHIPPING_PLAN_LINES_HEADERS_, 11_:51)
QUANTITY stays on shipment_lines. The chain ATTRIBUTES; it never supplies a second quantity.
```

```
MULTI_SHIPMENT_DETECTION = shipments.marketplace matching /multi|merged|mixed|combined/i
                           client _irIsSpecificReceiver (:56) · server specific() (60_:564) — identical
```

### `shipment_plan_links` — re-verified, still empty

F0's finding holds under re-audit. The table appears in **one** runtime file and only as a defensive
diagnostic read: [11_:526](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs#L526) hardcodes
`linksWriterPresent = false; linksReaderPresent = false`. No other `.gs` or `.js` file references it.

```
DO NOT READ shipment_plan_links. It has no rows because it has no writer.
RETAINED as the future header bridge for N plans -> 1 shipment, per the F0 freeze. Unchanged.
```

### Correction to F0 §5 — a header bridge DOES exist, and F0 did not name it

F0 said the header bridge is absent. Two scalar FKs are in fact written today:

```
shipments.shipping_plan_id              written 12_:641   (plan -> shipment, at shipment creation)
shipping_plans.transferred_shipment_id  column ensured 11_:1548, read 11_:1571
```

This does not reopen D1B: both are **scalars**, valid only while 1 plan -> 1 shipment, which is exactly the
cardinality `shipment_plan_links` exists to survive. It is recorded because an implementing round that trusted
F0 §5 literally would conclude no plan FK exists on `shipments`, and one does. **F1 does not need it** — the
1:1 line FK is strictly more precise.

### THE CONFLICT — unresolved, and it must be resolved before implementation

The shipped client builds the lineage receiver from the **plan HEADER**:

```js
// inventory-replenishment.js:9118
lineReceiverById[pl.shippingPlanLineId] = { company: p.company, country: p.country, marketplace: p.marketplace };
//                                                                               ^^^^^^^^^^^^^ PLAN HEADER
```

For a merged plan the header marketplace is `MULTI`, so `_irIsSpecificReceiver` returns false and the line is
**dropped** (`:103` — `present but unresolved -> fail closed`). The quantity vanishes with nothing on screen
saying so. That is E1A §3's finding, confirmed by inspection.

The server agrees with the client, deliberately and in writing
([60_:536-540](../../assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs#L536)):

> *"`shipping_plan_lines.marketplace` IS NOT THE SCOPE FIELD… Scoping on the line's own column would be a
> SECOND business interpretation of shipment ownership."*

**E1A D4 reverses that refusal** and approves the line's own marketplace as the MULTI attribution source.

```
E1A D4            MULTI marketplace = shipping_plan_lines.marketplace      (APPROVED by operator)
60_ §7.2          that column is read by nobody, on purpose                (SHIPPED)
client :9118      lineage receiver marketplace = plan HEADER               (SHIPPED)
STATUS            D4 IS APPROVED BUT NOT IMPLEMENTED ANYWHERE.
```

A second disagreement sits beside it. E1A D4 says a NORMAL shipment uses the **header**
(`NORMAL_SHIPMENT_REQUIRES_SHIPPING_PLAN = NO`). The shipped client prefers **lineage whenever
`shipping_plan_line_id` is present** — and 12_ writes that FK on every dispatched line, so in practice lineage
wins for nearly every modern row. For a non-merged plan both routes agree; gate (14) `MIXED_SITE_PAYLOAD`
(16_:2545) guarantees that forward. **Historical rows carry no such guarantee.**

```
DECISION REQUIRED  which rule governs attribution when header and lineage disagree
RECOMMENDED        header when the header is SPECIFIC; lineage only when the header is MULTI;
                   a disagreement between the two is REPORTED, never silently resolved
WHY               it matches E1A D4, it makes the two plan tables CONDITIONAL rather than mandatory (§7),
                  and a silent winner between two live authorities is the error class this repo keeps hitting
```

**No inference is proposed or permitted.** Not SKU similarity, not date, not company-only, not country-only,
not nearest draft, not row order. Unresolvable lineage fails closed and is counted as unresolved.

---

## §4 — SHIPPING PLAN / ALLOCATION REALITY CHECK

```
CURRENT_LINEAGE_FIELDS_WRITTEN
  shipment_lines.shipping_plan_line_id         12_:687   1:1, frozen at dispatch, immutable
  shipments.shipping_plan_id                   12_:641   scalar header FK
  shipping_plan_lines.source_reason            11_:775   allocation_draft:<id>|run:<id>|fv:<v>|cyc:<c>|line:<id>
  shipping_plans.transferred_shipment_id       11_:1548  ensured + written on transfer
  shipping_plans.company / country / marketplace          group-key fields
  shipping_plan_lines.marketplace (`marketplace_seperate`) the line's REAL marketplace

CURRENT_LINEAGE_FIELDS_READABLE
  all of the above. source_reason is READABLE BUT UNPARSED — nothing in the tree parses it.

MISSING_LINEAGE_FOR_FUTURE_MULTI
  shipment_plan_links rows                     table exists, no writer, no reader
  typed line provenance columns                DEFERRED by F0 D2 — source_reason already holds the data
  a contribution authority                     REQUIRED ONLY IF many-plans -> one-shipment is ever built
                                               11_:527 consolidatedContributionAuthority = 'MISSING'
                                               11_:541 FK marked ONE_SOURCE_ONLY
                                               shipment_line_plan_allocations is WITHDRAWN (B-3)
```

### Runtime vs documents

F0 §6 listed four stale documents. Re-checked, and the drift is real and unchanged:

```
12_:643  marketplace: pv('marketplace'),  // actual Marketplace, or MULTI when the plan combined marketplaces
```

`shipments.marketplace` **can** be `MULTI` in the runtime, which `SHIPMENT_CENTER_SPEC.md` §320 denies. Per the
task, the conflict is reported and **not repaired here** — it does not block the aggregate contract, because
F1 derives the MULTI rule from the runtime predicate, not from that spec.

One more drift, newly found, narrower, and reported for the record only:

```
31_:62/27   shipDeriveReceiptStatus_ writes 'partially_received' to shipments.status
31_:274     SHIP_PROMOTE_TERMINAL_ lists 'partial_received'  — the OTHER spelling
```

Both spellings coexist inside one file. The entry is inert for the token actually written (route promotion
fires only `from: 'shipped'`), so nothing is broken today. **Not repaired in F1.** It is listed because the
same two-spelling confusion is the root of §5, where it is not inert.

---

## §5 — THE ON-THE-WAY STATUS CONTRACT

### There are already FOUR status vocabularies, and no two agree

| # | owner | shape | verdict on the On-the-Way question |
|---|---|---|---|
| 1 | `_IR_TERMINAL_SHIPMENT_STATUS` [IR:68](../../assets/js/pages/inventory-replenishment.js#L68) | **exclusion** list `{completed, received, closed, cancelled, canceled, delivered}` | counts **everything else**, including unknown tokens |
| 2 | `classifyStatus` / `ELIGIBLE_STATUSES` [adapters:20](../../assets/js/core/supply-planning-incoming-adapters.js#L20) | **allowlist** `{ready_to_ship, shipped, in_transit, arrived}` | `partially_received` -> `UNKNOWN_STATUS` -> REVIEW, not counted |
| 3 | `SHIPMENT_STATUS_MAP` (supply-planning-ledgers.js, mirrored 90_:5238) | **supply-state map** | `ready_to_ship -> APPROVED_SHIPPING_PLAN`, i.e. **NOT** qualified incoming |
| 4 | `SHIP_PROMOTE_TERMINAL_` [31_:274](../../assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs#L274) | route-progress guard | different concern; listed so it is not mistaken for a fifth opinion on supply |

**#2 and #3 disagree on `ready_to_ship`** — one counts it as incoming, the other explicitly does not. That
disagreement is live today and is not something F1 introduces.

### The contract F1 must implement

```
COUNTED_STATUSES   ready_to_ship · shipped · in_transit · arrived · partially_received
EXCLUDED_STATUSES  draft · planned · received · closed · cancelled · canceled · delivered ·
                   completed · stuck · partial_received
UNKNOWN_STATUS_BEHAVIOR = FAIL_CLOSED — never counted, emitted as a REVIEW / diagnostic state

PARTIALLY_RECEIVED_CURRENT_CLASSIFICATION
  vocabulary 1 (Site Inventory)   COUNTED — by accident, because it is not in the terminal list
  vocabulary 2 (classifyStatus)   UNKNOWN_STATUS — the token is absent; only `partial_received` is listed
  vocabulary 3 (supply states)    absent from SHIPMENT_STATUS_MAP
PARTIALLY_RECEIVED_REQUIRED_CLASSIFICATION
  COUNTED, contributing MAX(0, shipment_qty - shipment_received_qty) — the unreceived remainder ONLY
                                                                        (E1A D1, operator-approved)
```

### Why this is an architecture decision and not an implementation detail

E1A §1 already recorded that D1 and D3 **cannot both be satisfied by `classifyStatus` as it stands**. The audit
confirms it, and finds the blast radius is wider than the note implied:

```
classifyStatus consumers      adaptKmShipmentIncomingCandidate -> supply-planning-source-facts.js:240
                              mirrored verbatim into 90_generated_supply_planning_bundle.gs:2599 (SERVER)
qualified incoming consumers  42_api_v1_recommendation_workspace.gs — qualifiedIncomingQty = Sum SHIPPED_IN_TRANSIT
                              43_api_v1_gap_materialization.gs      — the gap / recommendation engine
persisted downstream          shipping_allocation_draft_lines.qualified_incoming_snapshot (16_:250)
                              -> calculated_gap_qty -> recommended_qty
```

**A change to the shared classifier moves persisted recommendation quantities.** Not the display — the
numbers that get written into allocation draft lines.

```
ARCHITECTURE / SHARED-CONTRACT DECISION REQUIRED = YES
OPTIONS (not chosen here)
  (a) repair classifyStatus in place — add `partially_received` as ELIGIBLE with a remainder rule.
      Smallest edit, widest blast radius: supply planning and the gap engine both move.
  (b) add a NAMED On-the-Way classifier beside it, in the SAME owner file, sharing the token tables.
      No existing consumer moves. Risk: two allowlists in one file that must be kept in step.
  (c) repair in place AND re-baseline the gap engine deliberately, as its own round.
RECOMMENDED (b) FIRST, (c) as a FOLLOW-UP — because (a) silently re-prices replenishment recommendations in
the same round that adds a display column, and those two outcomes must not share a verdict.
E1A's rule still binds either way: NO vocabulary is forked LOCALLY inside the page or inside 60_.
```

---

## §6 — QUANTITY SEMANTICS

```
SHIPMENT_VS_PLAN_QTY_AUTHORITY = shipment_lines. Plans and plan lines ATTRIBUTE; they never supply.
DOUBLE_COUNT_RISK              = LOW AND STRUCTURALLY BOUNDED — proven by the writer, not asserted
RECEIVED_QTY_TREATMENT         = SUBTRACTED. remaining = MAX(0, shipment_qty - shipment_received_qty)
```

The proof that plan qty and shipment qty are the **same number for the same movement**:

```js
// 12_:684 — dispatch
shipment_qty: shipmentNum_(plv(lr, 'approved_qty')),   // copied from the plan line
```

Adding them would double a quantity that was copied, not independently observed. The 1:1 dispatch mapping
(12_:66, "one shipping_plan_line -> one shipment_line, proven no SKU consolidation") means no ratio and no
proportional split is needed, and E1A §2 froze `MULTI_ACTUAL_QTY_ALLOCATION_RULE = EXACT 1:1`.

The layer separation is already documented and enforced upstream
([43_:408](../../assets/specs/active/apps-script/43_api_v1_gap_materialization.gs#L408)):

> *"a quantity transitioned to SHIPPED_IN_TRANSIT lives in `shipments`… never in these snapshots — so NO
> heuristic subtraction and NO SKU+qty dedup. Opening supply = Site + allocated Overseas + allocated Factory;
> the shipment stays incoming-only — the same physical lineage is never counted twice."*

```
DRAFT layer      shipping_allocation_drafts / _lines    EXCLUDED — F0 read boundary, E1A D2 (draft is not execution)
PLANNED layer    shipping_plans / _lines                ATTRIBUTION ONLY
EXECUTION layer  shipments / shipment_lines             THE ONLY QUANTITY SOURCE
RECEIVED         shipment_received_qty                  SUBTRACTED, never a separate row
```

**One double-count risk that F1 does not close, and must not claim to.** `overseas_inventory_snapshot` carries
its own `wh_on_the_way_qty` / `on_the_way_eta` / `on_the_way_bucket`
([db-api:795](../../assets/js/api/operation-system-db-api.js#L795)) — a warehouse-reported incoming figure from
a different authority. The shipped projection states `wh_on_the_way_* is NEVER read` (IR:74) and F1 keeps that
rule. The two numbers can disagree; reconciling them is
`INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED` (E1A §6) and is out of scope.

---

## §7 — FIRST-LAYER READ ARCHITECTURE

### The measured ground truth

From the S8-R4D-E5 live sample, same release, same deployment:

```
first layer, 13 tables                        6,197 ms server · 7,299 rows
the six lazy exposure tables, together        4,099 ms server   (MEASURED, E5 §0b)
```

The six are **not** divided into a per-table figure here. They differ in size, and a division would be an
invented number wearing a measurement's clothes.

### Candidates

| | **A — server aggregate** | **B — client computes from raw** | **C — materialized aggregate** |
|---|---|---|---|
| ADDITIONAL_TABLE_READ_COUNT | **2** normal · **4** when a MULTI header is present (§3 rule) | 4 | 1 |
| ADDITIONAL_ROWS in payload | one row per (site, sku) with non-zero remainder | **every** shipment / line / plan / plan-line row for the site | one row per (site, sku) |
| EXPECTED_PAYLOAD_SHAPE | `[{company,country,marketplace,marketplaceId,sku,onTheWayQty}]` | raw tables | same as A |
| DATA_GROWTH_BEHAVIOR | payload flat; **read work grows with shipment history** | **payload grows linearly with history** | payload flat; read work flat |
| CACHE / INVALIDATION | none new — computed per request, always fresh | none new | **a staleness window; a stale aggregate is a wrong number that looks right** |
| WRITE_DEPENDENCY | none | none | **12_, 31_, 11_ or a job must maintain it** |
| SCHEMA_CHANGE_REQUIRED | **NO** | NO | **YES — new table** |
| §8 invariant | payload YES · read work NO | **FAILS** | YES |

```
RECOMMENDED_READ_ARCHITECTURE = A, now.  C, later and only if A's cost is MEASURED as a problem.
B IS REJECTED — it is exactly the over-read the S8-R4C lazy split was built to remove, and §8 forbids it.
```

### What A costs, stated plainly rather than buried

The task's §7 preference is "the smallest read surface that preserves correctness". A is that — but it is not
free, and the number it moves is the one the E5 freeze protects:

```
FIRST-LAYER PAYLOAD      13 tables + ONE small aggregate array          <- §8 preserved
FIRST-LAYER READ SURFACE 13 tables returned + 2..4 tables READ-NOT-RETURNED
```

Two consequences the implementing round owns:

- **60_ has no "read but do not return" concept today.** The partition loop
  ([60_:1120](../../assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs#L1120))
  skips any table absent from `onlySet`, and every table it reads is returned in `tables`. A needs a third
  state. It is a small change to a hot handler, and it must not weaken the `only` gate that E5 just proved.
- **The aggregate should be `include`-gated**, reusing the existing `include.carrierPlanning` mechanism, so a
  caller that does not ask for On-the-Way gets the 13-table first layer **byte for byte** as it is today. That
  keeps the E5 baseline intact for every other consumer and makes the cost opt-in and attributable.

The server already owns the hard part. `sirWsSiteScopeClosure_`
([60_:558](../../assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs#L558)) is a
complete, documented, fail-closed site-scope closure over exactly these tables, including the
shipment↔plan-line lineage. **F1 should compute the aggregate inside that existing closure, not beside it** —
a second traversal would be a second opinion about which shipment belongs to which site.

---

## §8 — ENTERPRISE SCALABILITY INVARIANT

```
FROZEN   FULL SHIPPING HISTORY GROWTH MUST NOT LINEARLY INCREASE SITE INVENTORY FIRST-LAYER PAYLOAD.
UNDER A  PAYLOAD      BOUNDED by (sites x SKUs with a non-zero remainder) — satisfied
         READ WORK    NOT BOUNDED — grows with total shipment history
LONG_TERM_DATA_ARCHITECTURE_DEBT = YES
```

**Bounded selection is not possible with the current table architecture, and the reason is physical.** The
Sheets batch reader reads whole ranges; there is no server-side `WHERE`. Status, date and lifecycle filtering
all happen *after* the rows are in memory, so a terminal shipment from three years ago still costs its read.
`sirWsSiteScopeClosure_` bounds the **payload** beautifully and bounds the **read** not at all.

```
SMALLEST FUTURE STRATEGY (recorded, NOT proposed for implementation, NOT approved)
  1  ARCHIVE SPLIT — move terminal shipments (received/closed/cancelled/completed/delivered) to an archive
     tab on an explicit operator-run job. The active tab then holds only open movements. NO new grain, NO
     new authority, NO aggregate to keep in step — the cheapest option, and the only one with no staleness.
  2  MATERIALIZED AGGREGATE (Candidate C) — a narrow on_the_way tab keyed company|country|marketplace|sku.
     Bounds read work fully; introduces a write dependency and a staleness window, both of which are new
     failure modes rather than new costs.
PREFER 1 IF AND WHEN the read cost is measured as a problem. Neither is authorized by this preflight.
```

Recorded as debt, not as a blocker: today's first layer is 6,197 ms and the two base tables are a small
fraction of the six that cost 4,099 ms together. **The debt is real and it is not yet urgent**, and F1 should
not be held hostage to it.

---

## §9 — EMPTY / UNKNOWN SEMANTICS

The safety rule is **already implemented and already correct** for the bucket fields, and **already violated**
by the headline field.

```
ZERO_SEMANTICS
  0 is emitted ONLY when the aggregate RESOLVED SUCCESSFULLY and the receiver has no counted remainder.
  Current precedent, to be preserved verbatim:
    IR:12166  within18days: shipRem ? shipRem.d0_18 : null     NULL until the tables are read — never 0
    IR:9014   the FALSE-EMPTY rule: "[] is an answer and this is the absence of one"
  CURRENT VIOLATION: IR:12128  onTheWay: 0  — unconditional. This is what F1 replaces.

FAILED_LINEAGE_UI_SEMANTICS
  UNRESOLVED, never 0 and never silently omitted. The projection already fails closed (IR:103); what is
  missing is that failing closed is currently INVISIBLE. The aggregate MUST carry an unresolved count so a
  dropped merged line is a reported fact rather than a smaller number.

READ_FAILURE_UI_SEMANTICS
  NOT_LOADED / FAILED as its own state, distinct from 0 and distinct from UNRESOLVED.
  exposureState already travels WITH the row (IR:12131) — the same mechanism, reused, not reinvented.
```

```
THREE STATES MUST BE DISTINGUISHABLE ON SCREEN: NOT_LOADED · UNRESOLVED · ZERO.
A single rendered "0" for all three is the defect F1 exists to remove, not a style it may inherit.
```

---

## §10 — WRITE-PATH ISOLATION

```
ON_THE_WAY_DEPENDENCY_IN_WRITE_PAYLOAD_COUNT = 0
```

Every write constructor Site Inventory can reach was enumerated and its payload inspected:

| write constructor | payload carries On-the-Way? |
|---|---|
| `submitAllocationDraftsToShippingPlans` (IR:4203) | NO |
| `upsertShippingAllocationDraft` / `...Atomic` (IR:4506, 4953) | NO |
| `upsertShippingAllocationDraftLines` (IR:5936, 6323) | NO — `buildDraftLinePayload` (inventory-compat.js:502) sends only `allocation_draft_line_id · sku · planned_qty · generation_type · site_sku · route_no · units_per_carton · note · recommended_qty · override_reason` |
| `cancelShippingAllocationDraft` (IR:6324) | NO — `{allocation_draft_id, lines:[{id, line_status}]}` |
| `startInventoryReplenishmentGapJob` (IR:10681) | NO — `{payload:{scope}}` only |
| `cancelInventoryReplenishmentGapJob` (IR:10731) | NO |
| `upsertMarketplace` / `upsertMarketplaceSku` / `importMarketplaceSkusBatch` | NO — registry only |
| `saveReplenishmentDemandAllocationRules` (IR:8846) | NO |
| `syncMarketplaceSkusToSkuRegionalDetails` (IR:8888) | NO |

**One adjacent coupling, named because it is easy to mistake for a violation and is not one.**
`shipping_allocation_draft_lines.qualified_incoming_snapshot` (16_:250) IS an incoming quantity and IS
persisted — but it is **computed server-side by the gap engine**, never sent by the client. The browser's
On-the-Way value reaches no write payload in either direction.

```
THE REAL RISK IS NOT THE PAYLOAD. It is §5: repairing the SHARED classifier would move
qualified_incoming_snapshot -> calculated_gap_qty -> recommended_qty. That is a WRITE-SIDE consequence of a
READ-SIDE repair, and it is the reason §5 recommends option (b) over option (a).
```

---

## §11 — FIXTURE COVERAGE

Much of it already exists. `shipment-merged-lineage-f1-shipment-incoming-r6.test.js` passes 24 assertions
including conservation (`Σ attributed remaining == Σ physical remaining`) and the no-receiver-exceeds-physical
bound. The real incremental burden is the status contract, the aggregate shape and the three-state semantics.

| # | case | status |
|---|---|---|
| 1 | normal single-site shipment | **COVERED** — R6 case A |
| 2 | two SKUs in one shipment | **COVERED** — R5 suite |
| 3 | same SKU in different sites | **COVERED** — R6 cases B/C/D |
| 4 | MULTI shipment resolved through lineage | **COVERED AT THE PROJECTION** — R6 case B/E. **NOT covered at the builder**: the suite feeds `lineReceiverById` directly; the cloud-path assertion (R6:105) only checks that both tables are referenced, never which column supplies `marketplace`. **This is why §3's defect is unpinned.** |
| 5 | dangling lineage -> fail closed | **COVERED** — R6 case F + R7C parity |
| 6 | `partially_received` | **NOT COVERED** — new, and it is the §5 decision |
| 7 | delivered / completed excluded | partially covered via `_IR_TERMINAL_SHIPMENT_STATUS`; **must be re-pinned against the new contract** |
| 8 | zero legitimate active rows -> 0 | **NOT COVERED at the aggregate** — today the field is a literal 0 |
| 9 | duplicate / ambiguous lineage -> fail closed | **NOT COVERED** — R6 covers *missing*, not *duplicate* |
| 10 | no double-count between plan and shipment | **NOT COVERED directly** — implied by the 12_:684 copy; must be asserted |

Two cases must be added beyond the task's list, because the audit found them unprotected:

```
11  the three-state distinction: NOT_LOADED vs UNRESOLVED vs ZERO must be separable at the aggregate (§9)
12  a MULTI plan header must attribute by the LINE marketplace once §3 is decided — the case that is
    currently silently dropped in Production, and the one that will make the number RISE
```

**The implementing round must expect the number to go up**, and must be able to say by how much and for which
sites. E1A §3 said the same thing; this audit confirms nothing has changed.

```
§11 WARNING HONOURED: Production holding few MULTI rows is NOT evidence that MULTI logic is unnecessary.
F0 §4 proved the forward writer can no longer CREATE a MULTI plan (gate 14, 16_:2545) — historical rows
remain, and they are exactly the rows being dropped.
```

---

## §12 — THE THREE DECISIONS

```
D-1  STATUS VOCABULARY           §5. Repair classifyStatus in place (a), add a named sibling (b), or
                                 repair + deliberately re-baseline the gap engine (c).
                                 RECOMMENDED (b) now, (c) as its own round.
                                 BLAST RADIUS of (a): persisted recommendation quantities.

D-2  FIRST-LAYER READ SURFACE    §7/§8. Accept +2..4 READ-NOT-RETURNED tables on the first layer to gain the
                                 aggregate (Candidate A, include-gated), or defer until a materialization
                                 (C) or archive split is built.
                                 RECOMMENDED A, include-gated. Payload invariant preserved; read work grows.

D-3  MULTI ATTRIBUTION RULE      §3. E1A D4 is APPROVED but NOT IMPLEMENTED, and 60_ §7.2 currently refuses
                                 it in writing. Confirm the reversal and decide header-vs-lineage precedence.
                                 RECOMMENDED header when SPECIFIC, lineage only when MULTI, disagreements
                                 REPORTED. Expect the On-the-Way number to RISE.
```

---

```
S8_R4D_F1_ON_THE_WAY_PREFLIGHT = PASS
MULTI_LINEAGE_RECOVERABLE      = YES (company/country/sku/qty) · CONDITIONAL on D-3 (marketplace)
SCHEMA_CHANGE_REQUIRED         = NO        NEW_TABLE_REQUIRED = NO     MATERIALIZATION_REQUIRED = NO
ON_THE_WAY_DEPENDENCY_IN_WRITE_PAYLOAD_COUNT = 0
LONG_TERM_DATA_ARCHITECTURE_DEBT = YES — read work, not payload
RUNTIME_MODIFIED = NO · PRODUCTION_WRITE = NO · DEPLOYED = NO

NEXT_STEP_PROPOSAL
  1  operator resolves D-1, D-2, D-3
  2  F2 implements Candidate A inside sirWsSiteScopeClosure_, include-gated, with the three-state contract
  3  F2 owns its own measurement: the first-layer delta against the frozen 6,197 ms E5 baseline, and the
     quantity delta the D-3 reversal makes visible, by site
STOP — nothing implemented, no schema change, no deployment, no push.
```

```
CARRIED SEPARATELY, NOT TOUCHED
  G1 Amazon blank-date decision · showSection UI debt · auto-load UX · R45/E5 corrections
```
