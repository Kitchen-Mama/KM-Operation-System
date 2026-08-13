# F1-5C-FINAL-OUTPUT-SCHEMA-FREEZE-R1.1 — Final Output 3-table canonical DB contract + deployment handoff

**Outcome: AUDIT + DOC ONLY. Runtime NOT changed (contract already matches runtime byte-for-byte).** Baseline HEAD
`2653695` (post `F1-5C-FINAL-OUTPUT-SCHEMA-LEAN-R1`). This is the authoritative, copy-ready DB contract for the three
Final Output tables. Column lists + counts are extracted directly from the runtime header constants in
`34_shipment_final_output_handlers.gs` — not guessed.

**Expected column counts (from runtime constants):**
- `shipment_final_output_snapshots` = **62**
- `shipment_final_output_lines` = **29**
- `shipment_final_output_line_pos` = **10**

**Persistence-reason legend (frozen KM principle):** A = independent business meaning at this grain (execution fact) ·
B = historically reproducible fact NOT reconstructable through an immutable/versioned relationship (frozen because the
authority is mutable-in-place or resolved by a non-PK key) · C = required for integrity / idempotency / lineage.
**Required? legend:** YES = system-guaranteed non-blank on every finalized row · COND = blank is legal at the row grain
but a blank gates a downstream document family (readiness) · NO = optional.

---

## PHASE 2 — Contract vs runtime (verified; no mismatch → no runtime edit)
- The three header arrays above ARE the runtime `SFO_SNAPSHOT_HEADERS_` / `SFO_LINE_HEADERS_` / `SFO_LINE_PO_HEADERS_`.
- None of the 6 removed fields remain in any runtime header constant (`shipment_total_qty/cartons/gross_weight/net_weight/cbm`, `declared_total_value`). ✓
- Header totals are derived in `35_` `docTotals_` (Σ over frozen lines); the renderer no longer reads any `h.shipment_total_*`. ✓
- `declared_total_value` is derived in `35_` SD as `declared_unit_value × shipment_qty` (both frozen). ✓
- No live-master re-resolution introduced (`35_` reads none of sku_details/tax_referral_rates/company_legal_entities/logistics_locations/warehouses/carriers/purchase_order*). ✓
- Physical qty remains `shipment_qty` (line grain). ✓ · Multi-PO lineage remains normalized in `line_pos`, never collapsed. ✓
- Factory resolved from `source_warehouse_id` (never company); carrier resolved from `carrier_id` (never shipper). ✓
- Customs historical values remain frozen (`country_of_origin`, `hs_code`, `declared_currency`, `declared_unit_value`) — `tax_referral_rates` has no fully immutable identity. ✓

**Contract == runtime → runtime NOT edited (per MODE + PHASE 2 rule).**

---

## PHASE 3 — TABLE 1: `shipment_final_output_snapshots`
- **PK:** `snapshot_id` (deterministic `SFO-<shipment_id>`).
- **Grain:** ONE finalized snapshot per shipment (shipment / finalization grain; one active row per shipment, prior versions `superseded`).
- **Writer:** `34_ handleFinalizeShipmentFinalOutput_` (append-only; idempotent). **Reader:** `34_ handleGetShipmentFinalOutput_`, `35_ docReadSnapshot_`.
- **Lifecycle vocab:** `status ∈ {final, superseded}`; readiness columns `∈ {READY, BLOCKED}`.
- **Immutable-after-finalization:** YES — the read owner returns persisted rows and NEVER re-resolves masters; only a new version supersedes.

| # | Column | Req? | Type | Class | Relationship / Source | Reason | Notes |
|--|--|--|--|--|--|--|--|
|1|snapshot_id|YES|string|PK|self `SFO-<shipment_id>`|C|idempotency identity|
|2|shipment_id|YES|string|FK|shipments.shipment_id|C|lineage + cleanup/read key|
|3|snapshot_version|YES|int|Fact|self|C|starts at 1; supersede lineage|
|4|status|YES|enum|Fact|`final`/`superseded`|C|lifecycle|
|5|superseded_by|NO|string|FK|snapshots.snapshot_id|C|blank unless superseded|
|6|superseded_reason|NO|string|Fact|self|C|blank legal|
|7|shipment_no|YES|string|Fact|shipments.shipment_no|A|doc identity|
|8|reference_id|NO|string|Fact|shipments.reference_id|A|blank legal|
|9|company|YES|enum|Fact|shipments.company (KM/ResTW/ResUS)|A|execution scope|
|10|country|COND|string|Fact|shipments.country (ISO)|A|customs duty_country asOf|
|11|marketplace|NO|string|Fact|shipments.marketplace|A|blank legal|
|12|status_at_finalization|YES|string|Fact|shipments.status at finalize|A|execution fact|
|13|source_warehouse_id|COND|string|FK|warehouses.warehouse_id|A|factory resolution key|
|14|destination_warehouse_id|COND|string|FK|warehouses.warehouse_id|A|consignee resolution key (kept)|
|15|destination_type|NO|string|Fact|shipments.destination_type|A|blank legal|
|16|warehouse_code|NO|string|Fact|shipments.warehouse_code|A|display/reference only|
|17|ship_from|NO|string|Fact|shipments.ship_from|A|blank legal|
|18|ship_to|NO|string|Fact|shipments.destination|A|free-text; not legal identity|
|19|carrier_id|COND|string|FK|carriers.carrier_id|A/C|gates booking|
|20|carrier_name|COND|string|Fact(frozen)|carriers.carrier_name|B|carriers mutable-in-place|
|21|shipping_method|COND|string|Fact|shipments.shipping_method|A|gates booking|
|22|etd|NO|date|Fact|shipments.etd|A|blank legal|
|23|eta|NO|date|Fact|shipments.eta|A|blank legal|
|24|dispatch_date|COND|date|Fact|shipments.actual_departure_date|A|party/customs asOf authority|
|25|booking_no|NO|string|Fact|shipments.booking_no|A|blank legal|
|26|container_no|NO|string|Fact|shipments.container_no|A|blank legal|
|27|invoice_no|NO|string|Fact|shipments.invoice_no|A|blank legal|
|28|currency|NO|string|Fact|shipments.currency|A|blank legal|
|29|shipper_legal_entity_id|COND|string|FK(frozen)|company_legal_entities.company_legal_entity_id|B/C|stable FK the USER keeps|
|30|shipper_company|COND|string|Fact(frozen)|company_legal_entities.company|B|= company token, frozen|
|31|shipper_legal_name|COND|string|Fact(frozen)|company_legal_entities.legal_name|B|master mutable-in-place|
|32|shipper_display_name|COND|string|Fact(frozen)|company_legal_entities.display_name|B||
|33|shipper_country|COND|string|Fact(frozen)|company_legal_entities.country|B||
|34|shipper_address_line_1|COND|string|Fact(frozen)|company_legal_entities.address_line_1|B||
|35|shipper_address_line_2|NO|string|Fact(frozen)|company_legal_entities.address_line_2|B||
|36|shipper_city|COND|string|Fact(frozen)|company_legal_entities.city|B||
|37|shipper_state_or_region|COND|string|Fact(frozen)|company_legal_entities.state_or_region|B||
|38|shipper_postal_code|COND|string|Fact(frozen)|company_legal_entities.postal_code|B||
|39|shipper_tax_or_business_id|COND|string|Fact(frozen)|company_legal_entities.tax_or_business_id|B||
|40|seller_of_record_legal_entity_id|COND|string|FK(frozen)|company_legal_entities.company_legal_entity_id|B/C|Phase-1 = shipper entity|
|41|seller_of_record_legal_name|COND|string|Fact(frozen)|company_legal_entities.legal_name|B||
|42|consignee_location_id|COND|string|FK(frozen)|logistics_locations.logistics_location_id|B/C|stable FK the USER keeps|
|43|consignee_warehouse_id|COND|string|FK(frozen)|logistics_locations.warehouse_id|B||
|44|consignee_name|COND|string|Fact(frozen)|logistics_locations.location_name/local_name|B|gates SD/PL|
|45|consignee_address_line_1|COND|string|Fact(frozen)|logistics_locations.address_line_1|B||
|46|consignee_address_line_2|NO|string|Fact(frozen)|logistics_locations.address_line_2|B||
|47|consignee_city|COND|string|Fact(frozen)|logistics_locations.city|B||
|48|consignee_state_or_region|COND|string|Fact(frozen)|logistics_locations.subdivision_code/region|B||
|49|consignee_postal_code|COND|string|Fact(frozen)|logistics_locations.postal_code|B||
|50|consignee_country|COND|string|Fact(frozen)|logistics_locations.country|B||
|51|factory_id|COND|string|FK|factories (via procurementResolveFactoryId_(source_warehouse_id))|A/C|NEVER company|
|52|factory_name|COND|string|Fact(frozen)|warehouses.warehouse_name|B|frozen; mutable master|
|53|shipping_detail_ready|YES|enum|Fact|readiness (`READY`/`BLOCKED`)|C|finalization-time readiness|
|54|packing_list_ready|YES|enum|Fact|readiness|C||
|55|commercial_invoice_ready|YES|enum|Fact|readiness|C||
|56|booking_ready|YES|enum|Fact|readiness|C||
|57|customs_ready|YES|enum|Fact|readiness (Phase-1 always `BLOCKED`: LEGAL_IMPORTER_AUTHORITY_GAP)|C||
|58|readiness_detail|YES|JSON string|Fact|full readiness object|C|parsed by renderer|
|59|finalized_by|YES|string|Fact|actor|A/C|audit|
|60|finalized_at|YES|timestamp|Fact|clock|A/C|audit|
|61|created_at|YES|timestamp|Fact|clock|C|audit|
|62|updated_at|YES|timestamp|Fact|clock|C|audit|

---

## PHASE 3 — TABLE 2: `shipment_final_output_lines`
- **PK:** `snapshot_line_id` (`SFOL-…`). **Grain:** ONE row per physical shipment line (physical shipment-line grain).
- **Writer:** `34_ handleFinalizeShipmentFinalOutput_`. **Reader:** `34_ handleGetShipmentFinalOutput_`, `35_ docReadSnapshot_` (filtered by `snapshot_id`).
- **Immutable-after-finalization:** YES — child of the frozen snapshot; no independent status.

| # | Column | Req? | Type | Class | Relationship / Source | Reason | Notes |
|--|--|--|--|--|--|--|--|
|1|snapshot_line_id|YES|string|PK|self `SFOL-…`|C|line identity|
|2|snapshot_id|YES|string|FK|snapshots.snapshot_id|C|read join key|
|3|shipment_id|YES|string|FK|shipments.shipment_id|C|orphan-cleanup delete key|
|4|shipment_line_id|YES|string|FK|shipment_lines.shipment_line_id|C|grain + line_pos join|
|5|sku|YES|string|FK|sku_details.sku|A|master SKU|
|6|site_sku|NO|string|Fact(frozen)|regional/marketplace_skus (mutable)|B|as-shipped display|
|7|product_name_en|COND|string|Fact(frozen)|sku_details.product_name|B|as-shipped name|
|8|product_name_cn|NO|string|Fact(frozen)|sku_details.product_name_cn|B||
|9|shipment_qty|YES|number|Fact|shipment_lines.shipment_qty|A|**physical authority**|
|10|shipment_carton_qty|COND|number|Fact|shipment_lines.shipment_carton_qty|A||
|11|carton_no_start|NO|string|Fact|shipment_lines.carton_no_start|A|blank legal|
|12|carton_no_end|NO|string|Fact|shipment_lines.carton_no_end|A|blank legal|
|13|units_per_carton|COND|number|Fact(frozen)|shipment_lines / sku_details|A/B||
|14|gross_weight|COND|number|Fact|shipment_lines.gross_weight|A||
|15|net_weight|COND|number|Fact|shipment_lines.net_weight|A||
|16|cbm|COND|number|Fact|shipment_lines.shipment_carton_cbm|A|line-total; never ×cartons|
|17|carton_length|NO|number|Fact(frozen)|sku_details.carton_length|B||
|18|carton_width|NO|number|Fact(frozen)|sku_details.carton_width|B||
|19|carton_height|NO|number|Fact(frozen)|sku_details.carton_height|B||
|20|gs1_code|COND|string|Fact(frozen)|sku_details.gs1_code|B|≠ units_per_carton|
|21|gs1_type|COND|string|Fact(frozen)|sku_details.gs1_type|B||
|22|country_of_origin|COND|string|Fact(frozen)|tax_referral_rates.country_of_origin|B|customs frozen|
|23|hs_code|COND|string|Fact(frozen)|tax_referral_rates.hscode|B|customs frozen|
|24|declared_currency|COND|string|Fact(frozen)|tax_referral_rates.declared_currency|B|gates CI|
|25|declared_unit_value|COND|number|Fact(frozen)|tax_referral_rates.declared_value|B|per-unit; gates CI|
|26|material|NO|string|Fact(frozen)|sku_details.material|B|future customs/CI|
|27|product_use|NO|string|Fact(frozen)|sku_details.product_use|B|future customs/CI|
|28|note|NO|string|Fact|shipment_lines.note|A|blank legal|
|29|created_at|YES|timestamp|Fact|clock|C|audit|

---

## PHASE 3 — TABLE 3: `shipment_final_output_line_pos`
- **PK:** `snapshot_line_po_id` (`SFOP-…`). **Grain:** ONE row per EXECUTED shipment_line_allocation (PO-allocation lineage grain). N rows per line — **never collapsed**.
- **Writer:** `34_ handleFinalizeShipmentFinalOutput_`. **Reader:** `34_ handleGetShipmentFinalOutput_`, `35_ docReadSnapshot_`/`docLinePos_` (filtered by `snapshot_id`, joined by `shipment_line_id`).
- **Immutable-after-finalization:** YES — child of the frozen snapshot; no independent status.

| # | Column | Req? | Type | Class | Relationship / Source | Reason | Notes |
|--|--|--|--|--|--|--|--|
|1|snapshot_line_po_id|YES|string|PK|self `SFOP-…`|C|lineage identity|
|2|snapshot_id|YES|string|FK|snapshots.snapshot_id|C|read join key|
|3|shipment_id|YES|string|FK|shipments.shipment_id|C|orphan-cleanup delete key|
|4|shipment_line_id|YES|string|FK|shipment_lines.shipment_line_id|C|line↔allocation join (docLinePos_)|
|5|shipment_line_allocation_id|YES|string|FK|shipment_line_allocations.shipment_line_allocation_id|A/C|executed allocation grain|
|6|purchase_order_line_id|YES|string|FK|purchase_order_lines.purchase_order_line_id|A/C|PO line lineage|
|7|purchase_order_id|COND|string|FK|purchase_orders.purchase_order_id|C|lineage (blank if PO master missing)|
|8|po_no|COND|string|Fact(frozen)|purchase_orders.po_no|B|printed historical commercial fact|
|9|allocated_qty|YES|number|Fact|shipment_line_allocations.allocated_qty|A|execution fact (Σ = shipment_qty)|
|10|created_at|YES|timestamp|Fact|clock|C|audit|

---

## PHASE 3 — COPY-READY TSV HEADER ROWS (paste directly into Google Sheets row 1)

**`shipment_final_output_snapshots` (62):**
```
snapshot_id	shipment_id	snapshot_version	status	superseded_by	superseded_reason	shipment_no	reference_id	company	country	marketplace	status_at_finalization	source_warehouse_id	destination_warehouse_id	destination_type	warehouse_code	ship_from	ship_to	carrier_id	carrier_name	shipping_method	etd	eta	dispatch_date	booking_no	container_no	invoice_no	currency	shipper_legal_entity_id	shipper_company	shipper_legal_name	shipper_display_name	shipper_country	shipper_address_line_1	shipper_address_line_2	shipper_city	shipper_state_or_region	shipper_postal_code	shipper_tax_or_business_id	seller_of_record_legal_entity_id	seller_of_record_legal_name	consignee_location_id	consignee_warehouse_id	consignee_name	consignee_address_line_1	consignee_address_line_2	consignee_city	consignee_state_or_region	consignee_postal_code	consignee_country	factory_id	factory_name	shipping_detail_ready	packing_list_ready	commercial_invoice_ready	booking_ready	customs_ready	readiness_detail	finalized_by	finalized_at	created_at	updated_at
```

**`shipment_final_output_lines` (29):**
```
snapshot_line_id	snapshot_id	shipment_id	shipment_line_id	sku	site_sku	product_name_en	product_name_cn	shipment_qty	shipment_carton_qty	carton_no_start	carton_no_end	units_per_carton	gross_weight	net_weight	cbm	carton_length	carton_width	carton_height	gs1_code	gs1_type	country_of_origin	hs_code	declared_currency	declared_unit_value	material	product_use	note	created_at
```

**`shipment_final_output_line_pos` (10):**
```
snapshot_line_po_id	snapshot_id	shipment_id	shipment_line_id	shipment_line_allocation_id	purchase_order_line_id	purchase_order_id	po_no	allocated_qty	created_at
```

---

## PHASE 4 — Relationship / cardinality map (runtime-verified)
```
shipments (1)
  │  1 active snapshot per shipment  (deterministic SFO-<shipment_id>)
  ▼
shipment_final_output_snapshots (1)          ← shipment / finalization grain
  │  1 → N   (one snapshot line per shipment_line)
  ▼
shipment_final_output_lines (N)              ← physical shipment-line grain (physical qty = shipment_qty)
  │  1 → N   (one lineage row per EXECUTED allocation; never collapsed)
  ▼
shipment_final_output_line_pos (N)           ← PO-allocation lineage grain
        ├─ shipment_line_allocation_id → shipment_line_allocations
        ├─ purchase_order_line_id      → purchase_order_lines
        └─ purchase_order_id / po_no   → purchase_orders   (po_no frozen; printed fact)
```
Conservation invariant (enforced at finalize): per line, `Σ line_pos.allocated_qty = shipment_lines.shipment_qty`.
Cardinality note: `line_pos` links to its parent line by `snapshot_id` + `shipment_line_id` (it does NOT carry
`snapshot_line_id`; §6 re-parent was intentionally declined in LEAN-R1).

---

## PHASE 5 — Optional live DB cleanup (NON-destructive; USER-owned; no migration code)
R1 uses `extraColumnsPolicy:'ALLOW'` — the six removed columns, if still present in the live sheets, are dormant and
ignored. They may be **manually removed after backup** (optional, not required for correctness):
- `shipment_final_output_snapshots`: `shipment_total_qty`, `shipment_total_cartons`, `shipment_total_gross_weight`, `shipment_total_net_weight`, `shipment_total_cbm`
- `shipment_final_output_lines`: `declared_total_value`
- `shipment_final_output_line_pos`: (none)

---

## PHASE 6 — Deployment handoff
| Item | Verdict | Evidence |
|--|--|--|
| 34_ changed since deployed baseline (`226b027`)? | **YES** | `git diff 226b027 HEAD` shows 34_ wholly added (subsystem postdates the baseline) |
| 35_ changed since deployed baseline? | **YES** | same diff shows 35_ wholly added |
| Apps Script source sync required? | **YES — sync `34_` + `35_`** (this round adds no new files; LEAN-R1 already modified both) | repo diff |
| New `/exec` deployment version required? | **NO by this contract alone** (no `01_router` action added/changed) — but fold into the pending cumulative deployment which already mandates one | router unchanged |
| Frontend deploy required? | **NO** | no `assets/js` change this round |
| Bundle rebuild required? | **NO** (`34_`/`35_` are not bundle sources; bundle `aaf5b07` --check PASS) | LEAN-R1 |
| DB action required? | **OPTIONAL** (PHASE 5 dormant-column cleanup only) | §21 ALLOW policy |
| Live deployment/finalized-row state | **USER_VERIFY** | agent has no production access |

---

## PHASE 7 — PO snapshot decision record (deferred marker — NO code this round)
**PO currently does NOT automatically receive a parallel `purchase_order_final_output_snapshot` subsystem.** Reason:
`purchase_orders` + `purchase_order_lines` already persist the core PO execution facts. Any future PO document
immutability effort must FIRST audit: (a) mutable master reads; (b) legal-entity / factory / supplier version
identity; (c) commercial-term versioning; (d) issued-PO document permanence.

Deferred marker: **`PO_DOCUMENT_IMMUTABILITY_AUDIT`** — not scheduled, no schema/code created this round.

---

## FINAL GATE — PASS
3-table contract explicit + copy-ready ✓ · header counts match runtime (62/29/10) ✓ · all 6 derived fields absent from
canonical headers ✓ · renderer document-model semantics unchanged (R2B/R3A/R3B/R3C green) ✓ · immutable historical
facts protected ✓ · multi-PO lineage intact ✓ · no second snapshot/document engine ✓ · no unrelated refactor
(runtime untouched) ✓.

**Exact next slice:** USER manually provisions/aligns the 3 sheets from the TSV rows, then syncs `34_`+`35_` into Apps
Script as part of the pending cumulative deployment (`F1_PHASE1_LIVE_DEPLOYMENT_CLOSURE_R1`). After deployment,
`F1-PHASE1-LIVE-ACCEPTANCE` may proceed. Do NOT start Phase 2 / PO snapshot / another schema round.

**STOP after F1-5C-FINAL-OUTPUT-SCHEMA-FREEZE-R1.1.**
