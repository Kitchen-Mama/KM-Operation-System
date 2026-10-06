# S8-R4D-E1A / E1A-R1 — ON-THE-WAY CONTRACT FREEZE
## Operator-approved. Binding on S8-R4D-F. Nothing here is implemented.

```
DECIDED 2026-10-06 · SUPERSEDES the open questions raised by the E1A and E1A-R1 audits
BINDS    S8-R4D-F — FIRST-LAYER ON-THE-WAY AGGREGATE (Delivery Model B / relationship B2)
R44      UNAFFECTED — R44_CAN_RELEASE_UNCHANGED = YES · R44_AMENDMENT_REQUIRED = NO
```

This file records four decisions and one non-decision. It is a contract, not a design: the round that
implements it still owes its own preflight, its own tests and its own measurement.

---

## 1. The status set

```
INCLUDE   ready_to_ship · shipped · in_transit · arrived · partially_received
EXCLUDE   draft · planned · received · closed · cancelled · canceled · delivered · completed ·
          stuck · partial_received
UNKNOWN   FAIL CLOSED — never counted, emitted as REVIEW / diagnostic state
```

**D1 — `partially_received` is INCLUDED**, contributing `MAX(0, shipment_qty − shipment_received_qty)`: the
unreceived remainder only. This is the decision the E1A audit could not make for itself, because the three
runtimes disagreed on the one status a real receipt actually produces.
[31_:27](../../assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs) persists
`partially_received`; the canonical B4-R4 allowlist in
[supply-planning-incoming-adapters.js:59](../../assets/js/core/supply-planning-incoming-adapters.js) classifies
`partial_received` — the spec's token — and therefore reads the live value as `UNKNOWN_STATUS`.
**The allowlist has a gap; the business answer was never in doubt**, and
[supply-planning-supply-candidates.js:126](../../assets/js/core/supply-planning-supply-candidates.js) already
states it: a `partially_received` line contributes only its unreceived remainder.

**D2 — `draft` is EXCLUDED.** A draft shipment is not execution truth. Nothing has left, it is cancellable, and
counting it would suppress replenishment demand against inventory that may never move.

**D3 — unknown statuses FAIL CLOSED.** The shipped card currently counts anything that is not terminal, so an
unrecognised token silently becomes supply. The default is reversed: an unknown status is a diagnostic, not a
quantity.

**Note for the implementing round.** D1 and D3 cannot both be satisfied by calling `classifyStatus` as it
stands — `partially_received` would fail closed under D3. Repairing the allowlist is a change to a canonical
owner with its own consumers (KMQI, the destination runtime), so it is a scoped decision for R4D-F, not a
licence to fork the vocabulary locally.

---

## 2. Quantity authority — frozen, unmoved

```
ON_THE_WAY_TOTAL_QTY_AUTHORITY                    = shipment_lines
remaining                                         = MAX(0, shipment_qty − shipment_received_qty)
SHIPPING_PLAN_QTY_COUNTS_AS_NEW_SUPPLY            = NO
PLANNED_QTY_MUST_NOT_OVERRIDE_ACTUAL_SHIPMENT_QTY = YES
MULTI_ACTUAL_QTY_ALLOCATION_RULE                  = EXACT 1:1 — no ratio, no proportional split
```

Plans and plan lines may be read for **site attribution only**. They never create supply.

No distribution math is required, and none was invented: the dispatch mapping is 1:1
([12_:66](../../assets/specs/active/apps-script/12_shipment_handlers.gs), *"one shipping_plan_line → one
shipment_line, proven no SKU consolidation"*), so each shipment line's remainder belongs entirely to one plan
line and therefore to one real marketplace.

**A pre-registered STOP for whoever implements consolidation.** If many-plans-to-one-shipment is ever built,
this rule expires and no replacement exists: [11_:527](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs)
sets `consolidatedContributionAuthority = 'MISSING'`, [11_:541](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs)
marks the FK `ONE_SOURCE_ONLY`, and the table that would carry the contribution grain —
`shipment_line_plan_allocations` — is **WITHDRAWN** (B-3). That is an architecture decision, not an
implementation detail.

---

## 3. D4 — site attribution

```
NORMAL  company/country/marketplace = shipments header          NORMAL_SHIPMENT_REQUIRES_SHIPPING_PLAN = NO
        quantity                    = shipment_lines

MULTI   company + country           = shipping_plans header     (group-key fields — never MULTI)
        marketplace                 = shipping_plan_lines       (the line's REAL marketplace)
```

Frozen lineage for the MULTI case:

```
shipment_lines.shipping_plan_line_id  →  shipping_plan_lines  →  REAL line-level marketplace
shipping_plan_lines.shipping_plan_id  →  shipping_plans       →  company + country
```

`MULTI_SHIPMENT_DETECTION_RULE` = `shipments.marketplace` matching `/multi|merged|mixed|combined/i` — the
shipped `_irIsSpecificReceiver` predicate, mirrored server-side as `specific()` in
[60_:482](../../assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs).

**This approval reverses a deliberate refusal, which is why it had to be an operator decision.**
[60_ §7.2](../../assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs) declined to
read `shipping_plan_lines.marketplace`, calling it *"a SECOND business interpretation of shipment ownership"*.
The E1A-R1 audit showed what that refusal costs: the lineage terminates on the plan **header**, which is
exactly `MULTI` for the merged case, so `_irBuildShipmentRemainingByReceiver` fails closed and **drops the
quantity silently** — the screen shows less incoming than exists. Under the 1:1 mapping the line's marketplace
is exact rather than interpretive. **Approving D4 makes quantity appear that is currently invisible**, so the
implementing round must expect the number to rise and must be able to say by how much and for which sites.

The physical column on the deployed sheet is the frozen misspelling `marketplace_seperate`
([11_:390-399](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs)). Use the existing canonical
accessor. **Do not rename the Production column in this round.**

---

## 4. `shipment_plan_links` — excluded

```
READ = NO · WRITE = NO · REGISTER = NO · NOT part of the On-the-Way runtime contract
CLASSIFICATION = UNAUTHORIZED_UNKNOWN   (EXTRA_LIVE_TABS, s8-data-classification.js:280)
```

It is SPEC-DEFINED and RUNTIME NOT IMPLEMENTED: no writer, no reader
([11_:526](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs)), and consolidation — the only
thing that would populate it — is not implemented either. The proposed chain
`shipment → shipment_plan_links → shipping_plans` cannot be the MULTI bridge because its first hop has no
rows. The real bridge is the 1:1 `shipping_plan_line_id` FK that already exists and is already written.

---

## 5. Read surface and response contract for R4D-F

```
BASE        shipments · shipment_lines                       (2)   every shipment
MULTI ONLY  shipping_plan_lines · shipping_plans             (2)   merged headers only
MAX         4 tables · all four registered TEST_OWNED_TRANSACTION · READ only
            WRITE_TABLE_COUNT = 0 · DELETE_TABLE_COUNT = 0

RESPONSE    { company, country, marketplace, marketplaceId, sku, onTheWayQty }   aggregate ONLY
            no shipment detail · no plan detail · no plan-line detail · no link detail
            SECOND_LAYER_LAZY_CONTRACT_CHANGED = NO
```

`shipping_plans` stays in the MULTI set for a non-obvious reason: `shipping_plan_lines` carries `marketplace`
and `site_sku` but **not** `company` or `country`
([SHIPPING_PLAN_LINES_HEADERS_, 11_:51](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs)).
Those are group-key fields, so the header is their correct and un-erased source.

A server-side lineage read is not a frontend prefetch. The four tables are a **server read source**; the second
layer's raw payload stays lazy, once per site, exactly as `_irEnsureExposureLoaded_` already does it.

---

## 6. What is NOT decided

- Whether the canonical `classifyStatus` allowlist is repaired in place or wrapped (see §1 note).
- The ETA treatment. The aggregate needs no ETA, which also keeps `SHIPMENT_OVERDUE_BUCKET_AUTHORITY_GAP` off
  this round's surface — but whether overdue and 45-day-plus remainders belong in a single `onTheWayQty` is a
  display question nobody has yet been asked.
- The receipt/snapshot double-count window for marketplace receivers: `shipReceiptPostToOverseas_`
  ([31_:513](../../assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs)) posts to
  `overseas_inventory_snapshot` only, while Current Stock for a marketplace comes from
  `amazon_inventory_snapshot` via an independent import. The two are not transactionally linked. This is the
  core of `INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED` and is not resolved by the aggregate's arithmetic.

---

```
STATUS = DECISIONS FROZEN · NOT IMPLEMENTED · NOT SCHEDULED INTO R44
NEXT   = S8-R4D-F — FIRST-LAYER ON-THE-WAY AGGREGATE (Model B / relationship B2)
```
