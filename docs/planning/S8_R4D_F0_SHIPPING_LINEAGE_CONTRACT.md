# S8-R4D-F0 — SHIPPING LINEAGE + ALLOCATION PROVENANCE CONTRACT
## Preflight closed. No schema change authorized. Nothing implemented.

```
S8_R4D_F0_SHIPPING_LINEAGE_PREFLIGHT = PASS       ARCHITECTURE_DECISION_REQUIRED = NO
SCHEMA_CHANGE_APPROVED = NO                        SCHEMA_CHANGES_EXECUTED = 0
READ_TABLE_COUNT = 0   WRITE_TABLE_COUNT = 0   DELETE_TABLE_COUNT = 0
CURRENT_R4D_F_READY = YES — subject to the R44 Production seal first
```

Audited from each owner's **own declared schema constants and writers** in
`assets/specs/active/apps-script/`. No Production table was read; no row count is claimed.

---

## 1. The cardinality that decided everything

```
ALLOCATION_DRAFT_TO_PLAN_CARDINALITY = 1 draft → 1..N plans
PLAN_TO_ALLOCATION_DRAFT_CARDINALITY = 1 plan  ← 1..N drafts
```

The canonical submit takes `allocation_draft_ids` — **plural** — and
[16_:2616-2641](../../assets/specs/active/apps-script/16_shipping_allocation_handlers.gs) pools every validated
draft's lines into one flat `submitLines` array.
[11_:651-682](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs) then groups **that flat array
of lines** by `shippingPlanRouteGroupKey_`:

```
company || country || source_warehouse_id || ship_from || destination_warehouse_id ||
destination || shipping_method || last_mile_delivery || planning_cycle        (9 dimensions)
```

`allocation_draft_id` is not among them, so two drafts sharing a route and cycle merge into **one** plan. The
reverse holds because each submit line takes `source_warehouse_id` from
`ln.source_warehouse_id || h.recommended_source_warehouse_id`, so one draft's lines can straddle route keys.

**The header relationship is N:M.** Every decision below follows from that one measurement.

---

## 2. Decisions — frozen

### D1 — `shipping_plans.allocation_draft_id` — NOT AUTHORIZED

```
SCALAR_ALLOCATION_DRAFT_ID_SAFE    = NO
SHIPPING_PLANS_ALLOCATION_DRAFT_ID = NOT AUTHORIZED
```

A scalar column on an N:M relationship cannot do anything but pick a winner among the contributing drafts.
That is fabricated provenance, and fabricated provenance is worse than none: it is indistinguishable from the
real thing at every later read.

### D1B — `shipment_plan_links.allocation_draft_id` — NOT AUTHORIZED

```
SHIPMENT_PLAN_LINKS_ALLOCATION_DRAFT_ID_SAFE = NO
```

`shipment_plan_links` sits at **shipment ↔ shipping_plan** grain. A single shipping plan may itself hold lines
from several allocation drafts, so the link **inherits** the N:M and a scalar there is invalid for the same
reason — one level further out, where it would be harder to notice. The table keeps `shipment_id` +
`shipping_plan_id` and nothing else. **It is not overloaded with allocation provenance.**

### D2 — typed line provenance — DEFERRED

```
TYPED_LINE_PROVENANCE_COLUMNS = DEFERRED_ARCHITECTURE_DEBT
  shipping_plan_lines.allocation_draft_id · shipping_plan_lines.allocation_draft_line_id
```

Accepted as the **correct** typing direction, because line grain is genuinely 1:1 — and deliberately not built
now: `source_reason` already preserves the exact provenance, R4D-F does not need it, and adding persisted line
columns moves the plan-line canonical fingerprint. No Phase-1 product requirement justifies that migration.

Future migration model, recorded so it is not re-derived under pressure:

```
BACKFILL = PARSE-ONLY from shipping_plan_lines.source_reason
           unparseable / legacy row → NULL
           NEVER inferred from SKU · date · company · country · marketplace
```

Inference is specifically forbidden because in an N:M relationship those fields match many drafts **by
construction** — a proximity match would look confident and be wrong.

### D3 — the MULTI branch ships

```
MULTI_BRANCH_SHIPS = YES — fail closed · observable · reports when zero rows matched
```

It must not be sold as recovering quantity. See §4.

---

## 3. The lineage that already exists

```
PLAN_LINE_TO_ALLOCATION_LINE_LINEAGE = shipping_plan_lines.source_reason   (ALREADY PERSISTED)
  allocation_draft:<allocation_draft_id>|run:<calculation_run_id>|fv:<formula_version>
  |cyc:<planning_cycle>|line:<allocation_draft_line_id>
ADDITIONAL_LINE_FK_REQUIRED          = NO
END_TO_END_PLANNING_TRACEABILITY     = YES — today, at line grain
```

Composed at [16_:2626](../../assets/specs/active/apps-script/16_shipping_allocation_handlers.gs), persisted at
[11_:775](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs), and fingerprint-bound through
`SP_LINE_FP_STR_` — so it is covered by the idempotency contract rather than being a loose annotation.

**Line grain is 1:1 and that is load-bearing.**
[11_:745-789](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs) is a plain loop with one
`derivedLineObjs.push` per input line: **no same-SKU aggregation at the plan layer**. The header grain is N:M
*because* the line grain is 1:1 and lines regroup by route — the fact was never lost, only moved down a level.

What is missing is **typing, not data**. `source_reason` is an opaque string that nothing parses. Its format is
currently an undocumented convention holding real lineage, which is why §6 lists the spec that must own it.

```
SHIPPING_PLAN_CREATION_OWNER = handleSubmitAllocationDraftsToShippingPlans_ (16_:2311)
                               → sadSubmitToShippingPlansCore_ (16_:2446)
                               → the single shipping_plans mutation authority (11_:847-848)
FK_WRITE_POINT               = 11_:775 — already writes the lineage today
DIRECT_CELL_WRITE            = NO
```

`createShippingPlansBatch` is a deprecated wrapper
([11_:577-591](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs)): it delegates when given
draft ids and otherwise refuses with `SUBMIT_ROUTE_DEPRECATED`, zero write.

---

## 4. MULTI is defensive, not active — and the earlier claim was wrong

**Correction to S8-R4D-E1A-R1 §2**, which reported `shipments.marketplace = 'MULTI'` as *"reachable in
Production today."* That is wrong for the forward path.

A submit line's marketplace is copied from the **draft header**
(`marketplace: h.marketplace`, [16_:2630](../../assets/specs/active/apps-script/16_shipping_allocation_handlers.gs)),
and gate (14) `MIXED_SITE_PAYLOAD`
([16_:2545](../../assets/specs/active/apps-script/16_shipping_allocation_handlers.gs)) refuses, zero-write, any
submit whose drafts span more than one `company|country|marketplace` station. So `distinctMk` is always 1 and
[11_:701](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs)'s `headerMarketplace` can never
derive to `MULTI` through the current writer.

`MULTI` therefore survives in only two places:

- **historical rows** written before gate (14) existed — its own comment records that until F1-7N-FB-3B the
  rule *"was enforced only by the browser choosing which draft ids to send"*
- **future consolidation**, which is not implemented

**So the branch ships, and it must report when it matched nothing.** R4D-F may not claim it recovered
Production quantity unless a live count says so. What is proven is that merged lines *would* fail closed, and
that historical rows may already be affected — not that anything is being dropped today.

---

## 5. R4D-F read boundary

```
NORMAL                      shipments · shipment_lines
DEFENSIVE CURRENT/HISTORICAL MULTI   shipping_plan_lines · shipping_plans
DO NOT READ                 shipment_plan_links
ALLOCATION_DRAFT_ID_REQUIRED_FOR_ON_THE_WAY = NO
```

| TABLE | CLASSIFICATION | REGISTERED | R4D-F ACCESS |
|---|---|---|---|
| `shipments` · `shipment_lines` | TEST_OWNED_TRANSACTION | YES | READ |
| `shipping_plans` · `shipping_plan_lines` | TEST_OWNED_TRANSACTION | YES | READ (MULTI only) |
| `shipping_allocation_drafts` · `..._draft_lines` | TEST_OWNED_TRANSACTION | YES | **none** |
| `shipment_plan_links` | **UNAUTHORIZED_UNKNOWN** | **NO** | **none** |

`shipment_plan_links` is excluded because its runtime writer and reader are both absent
([11_:526](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs)) and it is unregistered
([s8-data-classification.js:280](../../assets/tools/s8-fatigue/s8-data-classification.js), `EXTRA_LIVE_TABS`).

```
SHIPMENT_PLAN_LINKS_FUTURE_ROLE = RETAINED — the canonical header bridge for N plans → 1 shipment
```

Not deleted, not deprecated. Before any consolidated fatigue round, a canonical writer must populate one link
per `shipment_id + shipping_plan_id`.

---

## 6. Two hard stops registered for later

**Line-level consolidation.** `shipment_line.shipping_plan_line_id` is valid only while 1 plan line → 1
shipment line. If consolidation ever merges several plan lines into one shipment line, **STOP**:
[11_:527](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs) already records
`consolidatedContributionAuthority = 'MISSING'`, and
[11_:541](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs) marks the FK `ONE_SOURCE_ONLY`.
A contribution authority (`shipment_line_id · shipping_plan_line_id · contributed_qty`) would be required.
`shipment_line_plan_allocations` is WITHDRAWN (B-3) and must not be revived casually. **Not designed here. No
proportional distribution is to be invented.**

```
MULTI_SOURCE_LINE_CONSOLIDATION_SUPPORTED_TODAY = NO
FUTURE_CONTRIBUTION_AUTHORITY_REQUIRED          = YES
FUTURE_MULTI_PLAN_HEADER_TRACEABILITY           = YES, conditional on that writer existing
```

**Database-first update set** — required before any implementation that depends on these claims, because four
canonical documents currently disagree with the runtime:

| Document | What is stale |
|---|---|
| `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.1/§3.1B | records the `MULTI` header derivation as "Runtime Not Started"; it **is** implemented at 11_:701 |
| `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11/§623 | same stale claim |
| `SHIPMENT_CENTER_SPEC.md` §320 | says `shipments.marketplace ≠ MULTI`; 12_:644 writes it through |
| `DATABASE_RELATIONSHIP_MAP.md` §8B | plan ↔ draft cardinality is undocumented |
| the allocation-draft spec | no owner documents the `source_reason` lineage format |

---

```
STATUS = PREFLIGHT CLOSED · NO SCHEMA CHANGE · NOTHING IMPLEMENTED
NEXT   = R44 Production seal (S8-R4D-E3, at the operator deployment gate), THEN S8-R4D-F
```
