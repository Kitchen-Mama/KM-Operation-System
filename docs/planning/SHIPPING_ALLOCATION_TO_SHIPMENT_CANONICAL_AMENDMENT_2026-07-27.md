Shipping Allocation → Weekly Shipping Plan → Shipment

Canonical Amendment — Logistics Decision Boundary, Combine, Warehouse Identity, Quantity Protection

Status: FINALIZED CANONICAL SPEC AMENDMENTDate: 2026-07-27Implementation status: SPEC / SCHEMA CONTRACT ONLY unless a section explicitly says otherwiseScope: shipping_allocation_drafts, shipping_allocation_draft_lines, shipping_plans, shipping_plan_lines, shipments, shipment_lines, shipment_plan_links, shipment_line_allocations

This amendment supersedes conflicting wording in:

REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md §3.6

DATABASE_RELATIONSHIP_MAP.md §7.5 / §7.6 / §8 / §8B / §8C

WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md §2A / §3 / §4 / §5 / §8 / §11 / §12

SHIPMENT_CENTER_SPEC.md §0 / §2.A / §3 / §4 / §6 / §7 / §8 / §15 / §23

It does not claim that the corresponding Runtime, DB migration, API, UI, stock movement, PO allocation, Combine, quote engine, or tax engine is already implemented.

---

**PARTIALLY SUPERSEDED — 2026-07-31 (Batch B · B-2 / B-3 precedence).**

The 2026-07-31 B-2 / B-3 decision supersedes this amendment **only** where this document prohibits `shipping_plans.marketplace = MULTI` or treats the Shipping Plan header as incapable of storing a derived Marketplace scope marker. Those specific clauses (originally §4.2 "Do not write a fake canonical value such as MULTI" and the §15 Final Canonical Invariant "No fake marketplace = MULTI") are **SUPERSEDED — B-2 / B-3 2026-07-31** and are corrected in-place below.

All **non-conflicting** invariants of this amendment remain active: the Logistics Decision boundary, Combine, `shipping_plan_lines` real Marketplace / Site SKU provenance, the two allocation axes (`factory_stock_allocation_plans` planning + `shipment_line_allocations` PO/FIFO supply), `shipment_plan_links` header consolidation, Plan → Shipment single-transfer / no-split, same-SKU Shipment-Line aggregation, `shipments.marketplace ≠ MULTI` (MIX only as a shipment-number token), and warehouse-identity rules. This document is **not** rescinded as a whole; only the two Marketplace-header clauses above are corrected. (Owner of the corrected Marketplace-header rule: `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.1 / §3.1B, `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-3.)

This amendment file name keeps its historical `2026-07-27` date; this 2026-07-31 partial supersession is recorded here as an amended-revision marker.

**Revision:** 2026-07-27 (r2 — 2026-07-31 partial supersession of the two Marketplace-header clauses). **Runtime / DB / API / migration status unchanged: SPEC / SCHEMA CONTRACT ONLY — NOT IMPLEMENTED.**

1. Final Decision

The responsibility boundary is finalized as:

Layer

Responsibility

Must not do

Shipping Allocation Draft

Preserve the calculation snapshot, recommended quantity, user planned quantity, and only a coarse transport recommendation

Must not select Carrier, Rate Card, Lead Time, customs mode, ETA, freight cost, duty, or tax

Weekly Shipping Plan

Make the actual logistics decision; select route inputs, Carrier, Rate Card, Lead Time, customs mode; calculate cost/tax/ETA; handle automatic Combine; submit for approval

Must not deduct or reserve physical stock

Approved Weekly Shipping Plan

Freeze the approved Decision Snapshot

Must not be silently changed by a later Combine

Shipment Draft

Copy the approved plan into the Execution Layer; create PO allocations and hard stock reservation

Must not recalculate the planning recommendation or silently rewrite the approved plan

Confirm & Ship

Post the physical stock and PO-shipped transaction and enter the shipped/in-transit lifecycle

Must not deduct the same stock again on a later status change

Canonical flow:

Weekly Recommendation Run
→ Shipping Allocation Draft
→ Create / Update Weekly Shipping Plan
   └─ automatic Combine by the finalized Combine Key
→ user selects actual logistics + live cost/tax/ETA
→ Submit for Approval
→ Approved
→ Execution Commit / Create Shipment Draft
   ├─ copy approved logistics
   ├─ create Shipment + Shipment Lines
   ├─ create PO FIFO Allocations
   └─ increase hard Reserved Stock
→ Confirm & Ship
   ├─ reduce Current Stock
   ├─ reduce Reserved Stock
   ├─ increase PO shipped_qty
   ├─ write Stock Movement
   └─ enter shipped / in-transit execution state

2. Shipping Allocation Draft — Final Grain

2.1 Header grain

One shipping_allocation_drafts row represents:

one planning cycle
+ one Company
+ one Country
+ one Marketplace
+ one recommendation group
+ one draft version

A recommendation group has one coarse recommended main transport mode and one recommended last-mile mode.

If the recommendation engine determines that some SKUs require air while other SKUs require sea, they must not share the same Draft Header. They are split into separate recommendation_group_no values.

This updates the former uniqueness rule.

UNIQUE:
planning_cycle
+ company
+ country
+ marketplace
+ recommendation_group_no
+ draft_version

calculation_run_id remains idempotent: retrying the same run must resume/upsert the same records and must never duplicate or reset user edits.

2.2 shipping_allocation_drafts — canonical columns

allocation_draft_id
planning_cycle
recommendation_group_no
source_page
company
country
marketplace
status
generation_type
calculation_run_id
formula_version
calculated_at
source_data_as_of
draft_version
recommended_shipping_method
recommended_last_mile_delivery
created_by
created_at
updated_by
updated_at
submitted_by
submitted_at
cancelled_by
cancelled_at
cancel_reason
note

Rules:

recommended_shipping_method is the coarse main transport recommendation only.

It must use the canonical main-mode enum semantics defined by Carrier & Route (air, sea, sea_express, rail, truck). If the existing DB keeps the column name recommended_shipping_method, do not also create a duplicate recommended_transit_type column during Phase 1.

recommended_last_mile_delivery uses the canonical enum (parcel, truck).

These two fields are recommendation snapshots, not an actual booking or Carrier decision.

formula_version is required because the recommendation result must remain explainable after formulas change.

Header status remains draft / site_confirmed / submitted / cancelled.

2.3 shipping_allocation_draft_lines — canonical columns

allocation_draft_line_id
allocation_draft_id
sku
site_sku
window_code
window_start_date
window_end_date
required_by_date
regular_demand_snapshot
special_event_demand_snapshot
destination_stock_snapshot
qualified_incoming_snapshot
approved_supply_snapshot
calculated_gap_qty
recommended_source_warehouse_id
recommended_destination_warehouse_id
recommended_source_warehouse_code_snapshot
recommended_destination_warehouse_code_snapshot
source_initial_available_qty_snapshot
source_available_before_allocation_snapshot
allocation_sequence
recommendation_reason
recommendation_flags
recommended_qty
planned_qty
units_per_carton
line_status
override_reason
note
created_at
updated_at

Line grain:

one Draft
+ one source calculation line
+ one SKU / Site / Window / recommended endpoint pair

recommended_source_warehouse_id and recommended_destination_warehouse_id remain on the line because SKU supply may come from different source warehouses and may be grouped into different Weekly Plans at promotion time.

recommended_qty is immutable within the generated Draft version. planned_qty is user-editable and initializes from recommended_qty. A scheduled refresh must never overwrite an edited planned_qty.

2.4 Fields removed from Draft Lines

The following fields are removed from the canonical Draft Line:

route_no
recommended_route_rule_id
recommended_rate_card_id
recommended_lead_time_id
recommended_carrier_id
recommended_shipping_method
recommended_last_mile_delivery
recommended_expected_arrival
recommended_estimated_cost
selected_source_warehouse_id
selected_destination_warehouse_id
selected_source_warehouse_code_snapshot
selected_destination_warehouse_code_snapshot
selected_rate_card_id
selected_lead_time_id
selected_carrier_id
selected_shipping_method
selected_last_mile_delivery
expected_arrival

Disposition:

Former field

Final disposition

route_no

Replaced by Header recommendation_group_no

recommended_shipping_method

Moved to Draft Header

recommended_last_mile_delivery

Moved to Draft Header

Recommended Carrier / Rate / Lead Time / ETA / Cost

Removed; resolved only in Weekly Shipping Plan

All selected_* logistics fields

Removed; actual decisions belong only to Weekly Shipping Plan

Selected source/destination warehouse

Removed from Allocation Draft; actual structured endpoints are confirmed on Weekly Shipping Plan

Historical columns may remain during migration as read-only legacy fields, but all new writers must stop populating them.

3. Promotion to Weekly Shipping Plan

To avoid two different meanings for “Submit,” the UI/API actions must be named distinctly:

Create / Update Weekly PlanPromotes eligible planned_qty from Allocation Draft into shipping_plans / shipping_plan_lines and performs automatic Combine.

Submit for ApprovalRuns final quantity/logistics/cost validation inside Weekly Shipping Plan and changes draft → pending_approval.

Allocation Draft promotion does not choose a Carrier and does not reserve stock.

3.1 Promotion grouping

Draft Lines are promoted by:

planning_cycle
+ company
+ country
+ actual source_warehouse_id
+ actual destination_warehouse_id
+ recommended shipping method
+ recommended last-mile delivery
+ compatible execution window

The actual endpoint IDs are selected/confirmed during Weekly Plan creation. Recommendation IDs from the Draft are defaults only.

If an exact destination_warehouse_id is not yet known, Phase 1 must not auto-combine records merely by matching free-text destination. Keep them separate until a structured destination identity exists. A future destination_scope_id may support safe pre-FC consolidation, but free text must never be a Combine identity.

4. Weekly Shipping Plan — Logistics Decision Layer

4.1 Header ownership

The following information belongs on shipping_plans Header because it applies to the whole Combined Plan:

planning_cycle
company
country
source_warehouse_id
source_warehouse_code_snapshot
destination
destination_warehouse_id
destination_warehouse_code_snapshot
destination_type
transit_type
last_mile_delivery
carrier_id
rate_card_id
lead_time_id
customs_type
expected_arrival
estimated_freight_cost
estimated_duty
estimated_tax
estimated_total_cost
estimated_unit_cost
currency
cost_formula_version
cost_calculated_at
quoted_plan_version
plan_version
status

Existing identity, actor, approval, cancellation, completion, note, and timestamp fields remain.

Rules:

The UI label “Shipping Method” maps to the canonical transit_type.

shipping_method may remain as a legacy/display alias during migration, but matching and Combine must not depend on two competing main-mode fields.

carrier_id, rate_card_id, lead_time_id, customs_type, ETA, and estimated cost/tax are selected/calculated only here.

Before approval, a user can change these fields and the screen recalculates the applicable rate, lead time, freight cost, customs cost, duty/tax, total cost, and unit cost.

Approval freezes them.

quoted_plan_version must equal plan_version before approval. If Lines, quantity, endpoints, transport mode, last mile, Carrier, customs mode, or other quote input changes, the quote becomes stale and approval is blocked until recalculated.

Plan selection is saved before approval. “Approved 才同步 Carrier” means Approval/Execution Commit copies the frozen selection downstream; it does not mean the selection exists only in browser state before approval.

4.2 shipping_plan_lines grain

Combined Plan Lines preserve Marketplace provenance.

Minimum canonical fields:

shipping_plan_line_id
shipping_plan_id
source_allocation_draft_id
source_allocation_draft_line_id
marketplace
site_sku
sku
window_code
window_start_date
window_end_date
required_by_date
requested_qty
approved_qty
carton_qty
units_per_carton
carton_cbm
cbm
gross_weight
net_weight
snapshot_*
note
created_at
updated_at

The DB retains separate source rows even when Marketplace A and Marketplace B contain the same SKU.

Example:

shipping_plan_id

Marketplace

SKU

Approved Qty

WSP-001

Amazon

SKU-A

120

WSP-001

Walmart

SKU-A

80

The UI groups by shipping_plan_id + sku:

SKU-A — 200 pcs
├─ Amazon 120
└─ Walmart 80

Header Marketplace labels and totals are derived:

Marketplaces = DISTINCT(shipping_plan_lines.marketplace)
Total SKU    = COUNT(DISTINCT shipping_plan_lines.sku)
Total Qty    = SUM(approved_qty)
Total Carton = SUM(carton_qty)
Total CBM    = SUM(cbm)
Gross / Net  = SUM(line weights)

**CORRECTED — B-2 / B-3 2026-07-31 (supersedes the original clause below):** `shipping_plans.marketplace` **is a persisted derived scope marker** recomputed from the effective `shipping_plan_lines`:

```text
1 distinct Marketplace  → the real Marketplace literal
2 or more distinct      → MULTI
```

The header is **not** the source of real Marketplace provenance. Real Marketplace and Site SKU remain on the Plan Lines (`shipping_plan_lines.marketplace` / `site_sku`). Marketplace filtering must inspect the Plan Lines. `MULTI` is a derived, non-FK scope marker — never a real Marketplace, never a Marketplace FK, never a Marketplace-Master lookup value.

> *SUPERSEDED — B-2 / B-3 2026-07-31 (historical original wording, no longer canonical):* ~~"shipping_plans.marketplace is no longer authoritative for a Combined Plan. Do not write a fake canonical value such as MULTI. Legacy single-Marketplace rows may retain the old header value; new UI/API logic derives Marketplace scope from the Lines."~~

4.3 Cost/tax grain boundary

Freight and total cost are Plan Header outputs. Duty/tax inputs may differ by SKU/Series.

Phase 1 may persist the Header aggregates plus:

cost_formula_version
cost_calculated_at
quoted_plan_version

Before implementing auditable per-component tax explanations, a separate Cost Quote Mapping amendment must define whether matched tax_rate_id / tax_rate_component_id values are stored:

on shipping_plan_lines, or

in a dedicated shipping_plan_cost_components child table.

A single Header tax_rate_id is forbidden because one Combined Plan may contain multiple SKU Series and multiple tax components.

5. Automatic Combine — Final Rules

5.1 Combine occurs before Carrier selection

Carrier, Rate Card, and Lead Time are not part of the initial Combine Key.

This resolves the former contradiction where two otherwise compatible plans could fail to combine only because Allocation Draft recommended different Carriers.

5.2 Combine Key

Automatic Combine requires all of:

same planning_cycle / shipping week
same company
same country
same source_warehouse_id
same destination_warehouse_id
same recommended/main transit_type
same last_mile_delivery
compatible execution window

marketplace is deliberately excluded so different Marketplaces can share one physical plan when the structured endpoints and execution conditions truly match.

Carrier, Rate Card, Lead Time, and customs type are deliberately excluded because they are selected after Combine on the Weekly Plan Header.

5.3 Mandatory safety exclusions

Do not auto-combine when:

source or destination identity is missing or exists only as free text;

exact destination Warehouse IDs differ;

execution windows are incompatible;

a Marketplace-specific receiving workflow forbids a shared physical shipment;

special handling, battery, magnet, importer/exporter, consignee, currency/document scope, or warehouse provider rules are incompatible;

the target plan already has a Shipment Draft / hard reservation.

Amazon FBA and another channel must not be combined only because an address/country appears similar.

5.4 Different-time Submit behavior

Every Create / Update Weekly Plan action searches for an eligible Combined Plan.

Existing target state

Result

draft

Merge Lines into the same shipping_plan_id; increment plan_version; invalidate the prior quote

pending_approval

Merge; increment plan_version; clear pending approval state; return to draft; require logistics reconfirmation, re-quote, and re-submit

approved, no Shipment Draft

Do not auto-merge into an approved snapshot. Create a new Draft Plan. An explicit future Reopen & Merge action may create a new revision only with approval-invalidation audit, re-quote, and re-approval

Shipment Draft exists / hard reservation exists / shipped

Do not merge; create a new shipping_plan_id

cancelled / completed Decision task

Do not merge

No later Submit may silently alter an Approved Plan. An Approved Decision Snapshot remains immutable unless an explicit, audited reopen/revision action is invoked.

5.5 Split action

Because automatic Combine happens before the final Carrier/customs decision, Weekly Shipping Plan must provide Split Plan before approval.

Split Plan moves selected shipping_plan_lines into a new Draft Plan when:

a subset needs a different Carrier or method;

a subset has a different customs mode;

the earliest required_by_date cannot be met by one shared option;

a Marketplace or destination operation cannot share the same shipment.

Split is blocked after Execution Commit. It increments version/audit metadata and forces re-quote on both resulting Plans.

6. Quantity Protection and Soft Commitment

6.1 Draft is not physical reservation

Layer/state

Physical Current Stock

Physical Reserved Stock

Allocation Draft

no change

no change

Weekly Plan draft

no change

no change

Weekly Plan pending_approval / approved, not transferred

no change

no change

Create Shipment Draft

no change

increase

Confirm & Ship

decrease by actual shipped qty

decrease by actual shipped qty

Cancel Shipment Draft before ship

no change

release

Weekly Plan pending_approval and approved quantities are soft commitments used in validation only. They do not write factory_stock.fac_reserved_stock.

6.2 Maximum allowed quantity

The UI must show a real-time warning, but Save/Submit/Approve must repeat the validation on the backend.

For each:

planning_cycle
+ source_warehouse_id
+ sku

calculate:

other_soft_commitment_qty
= approved_qty from other pending_approval / approved Plans
   that have not been converted to a Shipment Draft

physical_available_qty
= MAX(factory_stock.fac_current_stock - factory_stock.fac_reserved_stock, 0)

weekly_pool_remaining
= MAX(weekly_allocatable_qty - other_soft_commitment_qty, 0)

max_allowed_for_current
= MAX(MIN(physical_available_qty, weekly_pool_remaining), 0)

weekly_allocatable_qty is the single weekly supply-pool result for:

planning_cycle
+ source_warehouse_id
+ sku
+ calculation_run_id

It must come from the finalized calculation output represented by approved_supply_snapshot or its calculation-run dataset. If the same pool snapshot is copied onto multiple Marketplace Draft Lines, the validator must de-duplicate it and must never sum the repeated snapshots as if they were separate physical supply.

The calculation must exclude the current Plan from “other” and must not double-count a Plan after its quantity has become a hard Shipment reservation.

When invalid:

show the maximum allowed quantity in red;

block Submit for Approval and Approval;

do not automatically reduce another site;

require the user to reduce this Plan or revise another Plan.

Backend validation must run under a lock/transaction so simultaneous submissions cannot both consume the same remaining soft pool.

6.3 Shipment Draft quantity changes

The decision to omit shipment_line_plan_allocations creates a hard Phase-1 restriction:

Shipment Draft quantity must equal the sum of the approved source shipping_plan_lines for that SKU.

Therefore Shipment Draft quantity is not directly editable, even by Admin, in the normal edit form.

If an Admin must change quantity:

Return to Weekly Plan / Create Revision
→ release Shipment hard reservation
→ release active PO allocations
→ void/cancel the old Shipment Draft without deletion
→ increment Plan version
→ edit Marketplace source Lines
→ re-quote
→ re-approve
→ create a new idempotent Execution Commit

Allowing an Admin to directly change shipment_lines.shipment_qty without recording which Marketplace source changed would make the Plan provenance false. **Any future partial / split execution or actual Marketplace allocation ledger requires a separate Canonical Design. The current design does not preselect a table name, schema or implementation** — in particular `shipment_line_plan_allocations` is **not** part of the current Canonical design and must not be created or implemented (B-3, 2026-07-31).

7. Approval Gates

Approval is blocked unless all of the following pass:

approved_qty > 0 and every quantity is a full-carton multiple.

Cross-site weekly maximum and physical availability validation pass.

source_warehouse_id is valid and active.

destination_warehouse_id is valid and active, unless destination_type explicitly supports a non-Warehouse destination with its required structured snapshot.

transit_type, last_mile_delivery, carrier_id, rate_card_id, lead_time_id, and customs_type are valid.

Rate Card is effective for the quote/ship date.

Lead Time exists; no fabricated fallback.

Aggregated battery/magnet attributes from the Plan Lines are compatible with the selected Rate Card.

ETA meets the earliest applicable required_by_date, or a permitted override reason is recorded.

quoted_plan_version = plan_version.

Required logistics inputs for CBM/weight/cost are complete.

No incompatible Marketplace-specific receiving/document rule is present.

Approval freezes the Plan. The following Execution Commit copies the approved values; it does not recalculate or write them back into Allocation Draft.

8. Plan → Shipment Transfer

At Execution Commit:

Weekly Plan

Shipment

source_warehouse_id

source_warehouse_id

source_warehouse_code_snapshot

source_warehouse_code_snapshot

destination

destination

destination_warehouse_id

destination_warehouse_id

destination_warehouse_code_snapshot

destination_warehouse_code_snapshot

destination_type

destination_type

transit_type

transit_type

last_mile_delivery

last_mile_delivery

carrier_id

carrier_id

rate_card_id

rate_card_id

lead_time_id

lead_time_id

customs_type

shipments_customs_type

Selected rate-card display label

shipping_method_label snapshot

Selected customs display label

shipments_customs_type_label snapshot

expected_arrival

eta

cost estimates

Shipment estimate snapshot fields, if present

shipping_plan_lines grouped by SKU

one shipment_lines row per distinct SKU

shipment_plan_links is retained and populated. Under the Phase-1 model it normally has exactly one source Combined Plan per Shipment:

shipment_plan_link_id
shipment_id
shipping_plan_id
created_at
created_by

shipments.shipping_plan_id may remain as a convenience/legacy scalar, but it must match the link.

8.1 Marketplace provenance

Do not write shipments.marketplace = MULTI.

For a Combined Shipment:

Shipment
→ shipment_plan_links
→ shipping_plan_id
→ shipping_plan_lines
→ DISTINCT marketplace

Physical Shipment views show each SKU once. Marketplace detail views expand the approved source Plan Lines.

If the shipment number format requires a Marketplace token:

one Marketplace: use the existing Marketplace code;

multiple Marketplaces: use MIX only as a shipment-number formatting token, never as a stored Marketplace enum.

9. shipment_line_plan_allocations Decision

Phase 1 does not create shipment_line_plan_allocations, subject to all of these hard invariants:

Combine happens before Shipment creation inside one shipping_plan_id.

One Combined Plan creates one Shipment.

A Plan is not split across multiple Shipments.

Shipment Lines are grouped by SKU.

Shipment quantity equals the sum of Approved Plan Line quantities for that SKU.

Shipment Draft quantity cannot be directly changed outside the Return-to-Plan revision flow.

Marketplace provenance is read through shipment_plan_links → shipping_plan_lines.

If any of these invariants is ever removed, that is a **separate future Canonical Design** — the current design does **not** preselect a table name, schema or implementation, and `shipment_line_plan_allocations` is **not** part of the current Canonical design and must not be created or implemented (B-3, 2026-07-31).

shipment_line_allocations remains required because it serves a different axis: PO/FIFO supply provenance.

10. PO FIFO and Hard Reservation

shipment_line_allocations is created at Execution Commit / Create Shipment Draft, not at Allocation Draft or Weekly Plan.

Canonical fields:

shipment_line_allocation_id
shipment_line_id
purchase_order_line_id
sku
allocated_qty
shipped_qty
allocation_status
allocation_method
created_by
created_at
updated_at
released_by
released_at
release_reason
note

allocation_status:

reserved
partially_shipped
shipped
released

Eligibility and order:

candidate: remaining_qty > 0

active_reserved_allocation_qty
= SUM(allocated_qty - shipped_qty)
   WHERE allocation_status IN ('reserved', 'partially_shipped')

available_to_allocate
= MAX(remaining_qty - active_reserved_allocation_qty, 0)

ORDER BY purchase_order_lines.created_at ASC,
         purchase_order_line_id ASC

Execution Commit:

creates FIFO allocation rows with status = reserved;

increases the source inventory reserved_stock;

does not increase PO shipped_qty.

Confirm & Ship:

increases allocation shipped_qty;

increases purchase_order_lines.shipped_qty;

updates remaining_qty = MAX(completed_qty - shipped_qty, 0);

reduces physical current and reserved stock in the same atomic transaction.

Cancel before ship:

marks active allocations released;

releases stock reservation;

does not change PO shipped_qty.

11. Shipment Warehouse Fields — Final Naming

The removal of origin_warehouse_id and origin_type is accepted.

Canonical execution endpoint fields:

source_warehouse_id
source_warehouse_code_snapshot
destination
destination_warehouse_id
destination_warehouse_code_snapshot
destination_type

Rules:

source_warehouse_id is the structured Ship-From identity for both Factory and overseas warehouse sources.

Do not name it source_factory_warehouse_id on generic Shipping/Shipment tables because not every source is a Factory.

Source type is derived from source_warehouse_id → warehouses; do not duplicate origin_type.

destination_warehouse_id is the structured Ship-To warehouse identity when the destination is a Warehouse Master record.

destination is a human-readable snapshot, never identity.

destination_type remains because some destinations may not yet be a Warehouse Master record.

warehouses.warehouse_id, factory_stock.warehouse_id, and overseas inventory warehouse_id remain unchanged; these are master/inventory foreign keys, not directional transaction roles.

11.1 Generic warehouse_code is not canonical

Keeping only a generic warehouse_code beside both source and destination is ambiguous.

Use:

source_warehouse_code_snapshot
destination_warehouse_code_snapshot

If the existing Runtime still requires shipments.warehouse_code, retain it only as a legacy compatibility alias for destination_warehouse_code_snapshot. New logic must not use it as the source code and must not join by warehouse_code alone.

Warehouse identity joins always use warehouse_id. Code snapshots are for display, documents, and historical trace only.

12. Stock Transaction Timing

The physical stock lifecycle is not changed by the new Draft/Plan responsibility split.

Allocation Draft / Weekly Plan
→ no physical stock write

Execution Commit / Create Shipment Draft
→ hard reservation
→ PO allocation reservation

Confirm & Ship
→ one idempotent atomic execution transaction
→ current stock decrease
→ reserved stock decrease
→ PO shipped_qty increase
→ stock movement
→ first ship/route event
→ shipment enters shipped/in-transit lifecycle

Inventory effects belong to the confirm_ship transaction, not to a later status-label change. A later transition from shipped to in_transit must never deduct inventory again.

Factory and overseas inventory remain separate:

Factory-source Shipment uses factory_stock and factory_stock_movements.

Overseas outbound uses its own Lock, confirmation, and overseas_inventory_movements.

Overseas outbound must never write factory_stock.

13. Required Runtime / Schema Work Not Yet Implemented

The following must be implemented or explicitly verified; none is implied complete by this amendment:

DB / migration

Add Draft Header recommendation_group_no, formula_version, recommended_shipping_method, recommended_last_mile_delivery.

Stop new writes to the removed Draft Line logistics fields.

Add source Draft lineage + Marketplace/Site SKU to shipping_plan_lines.

Add/verify Weekly Plan structured endpoint, actual Carrier/Rate/Lead/customs, quote version, cost/tax, and ETA fields.

Rename/migrate Shipment origin_warehouse_id → source_warehouse_id.

Replace ambiguous code usage with source/destination code snapshots.

Extend shipment_line_allocations with lifecycle fields.

Do not create shipment_line_plan_allocations while all §9 invariants hold.

API / backend

Idempotent Draft generation by calculation run.

Create / Update Weekly Plan promotion.

Automatic Combine across different submission times.

Split Plan.

Plan version increment and quote/approval invalidation.

Server-side soft-commitment calculation under lock.

Approval gates.

Execution Commit with Shipment, PO allocation, and stock reservation in one transaction.

Confirm & Ship with one idempotent stock/PO transaction.

Cancel/revision release logic.

UI

Allocation Draft displays recommended mode/last mile as Header guidance only.

Weekly Plan provides actual Carrier, Rate Card, Lead Time, customs mode, and live cost/tax/ETA controls.

Combined Plan displays multiple Marketplace tags.

Same SKU appears once visually with Marketplace sub-breakdown.

Inline maximum-quantity warning.

Needs Re-quote when quoted_plan_version != plan_version.

Split Plan before approval.

Return to Weekly Plan / Create Revision for post-commit quantity changes.

Documents / downstream

Documents read approved Shipment snapshots, never live Rate Card labels.

Combined Marketplace display is derived through Plan Lines.

Shipment-number multi-marketplace formatting uses MIX only as a formatting token.

Cost Quote Mapping must finalize per-SKU tax component audit grain before claiming historical tax reproducibility.

Separate specifications still required before full Runtime completion

The architecture is finalized, but these detailed contracts remain separate implementation prerequisites:

Cost Quote Mapping: exact formulas, declared-value/FX handling, component rounding, and per-SKU tax_rate_id / tax_rate_component_id audit persistence.

Approval model: whether Manager → COO is represented by explicit sub-statuses/fields or a normalized approval-history table. A single approved_by field cannot truthfully preserve two approval steps.

Reopen & Merge / Return to Plan: actor permissions, reason, revision audit, which IDs are retained, and whether the replacement Shipment keeps or receives a new external shipment number.

Non-Warehouse destination identity: a future destination_scope_id / Destination Scope Master if Plans must combine before an exact physical warehouse is known.

Soft-pool SSOT: the getter/query that returns the de-duplicated weekly_allocatable_qty per cycle + source warehouse + SKU and its locking strategy.

14. Cross-Spec Conflict Register

The following older definitions are now superseded:

Old definition

New canonical definition

Draft Line selects Carrier/Rate/Lead/method/last mile

Draft Header recommends only method + last mile; Weekly Plan selects actual logistics

Draft Line stores ETA and estimated cost

Weekly Plan owns ETA/cost/tax calculation and snapshot

Marketplace is only a Shipping Plan Header field

Combined Plan Marketplace provenance is stored on shipping_plan_lines

Combine occurs in Shipment Draft / Ready to Create

Combine occurs during Create / Update Weekly Plan, before Carrier selection

Carrier is part of Combine Key

Carrier is selected after Combine and is not in the initial key

Multiple Plans combine into one Shipment

Phase 1 first combines into one shipping_plan_id, then creates one Shipment

shipment_line_plan_allocations is NOT part of the current Canonical design and must not be created or implemented (B-3, 2026-07-31)

Correct: the current design omits it entirely; the §9 invariants (SKU aggregation, no split, Return-to-Plan revision) are what make it unnecessary — it is not "required-but-omitted"

Shipment Draft qty may be edited independently

Correct: qty changes use the Return-to-Plan revision flow. Any future independent per-source qty ledger is a separate Canonical Design (no table name / schema / implementation preselected)

origin_warehouse_id / origin_type

source_warehouse_id; source type derived from Warehouse Master

Generic warehouse_code is sufficient

Explicit source/destination code snapshots; generic field is destination-only legacy alias

Ready-to-Ship/status text deducts inventory

The idempotent Confirm & Ship transaction owns the single physical deduction

15. Final Canonical Invariants

Allocation Draft recommends; Weekly Plan decides; Shipment executes.

Draft does not select Carrier and does not store Rate/Lead/ETA/Cost.

Method and last-mile recommendation are Draft Header fields.

Actual logistics, customs, ETA, and cost/tax are Weekly Plan Header fields.

Different Marketplaces may share one shipping_plan_id; Marketplace stays on Plan Lines.

Carrier is not an initial Combine Key.

Any Line change invalidates quote and approval.

Weekly Plan soft commitment never writes physical Reserved Stock.

Shipment Draft creation owns hard reservation and PO allocation.

Confirm & Ship owns the single physical deduction.

No shipment_line_plan_allocations means no independent Shipment quantity change and no Plan split across Shipments.

source_warehouse_id / destination_warehouse_id are identities; names/codes/text are never identities.

Generic warehouse_code is legacy destination compatibility only.

MULTI is the canonical non-FK scope marker for a multi-Marketplace Shipping Plan. It must never be treated as a real Marketplace, Marketplace FK or Marketplace Master lookup value. *(SUPERSEDED — B-2 / B-3 2026-07-31: the original invariant "No fake marketplace = MULTI." is no longer canonical for `shipping_plans.marketplace`; `shipments.marketplace ≠ MULTI` still holds — see §8.1 / MIX token.)*

No document, cost, route, or inventory flow may silently re-read current upstream values instead of the approved/execution snapshot.

End of Canonical Amendment