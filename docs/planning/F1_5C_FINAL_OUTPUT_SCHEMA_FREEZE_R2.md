# F1-5C-FINAL-OUTPUT-SCHEMA-FREEZE-R2 — Final Output persistence boundary + immutability final audit (FROZEN)

**Outcome: AUDIT-FIRST → bounded safe lean (−3 columns) + field-specific HALTs with proof.** Baseline HEAD `c8cdbb7`.
This is the FINAL Phase-1 schema for the three Final Output tables. Runtime edited only where a safe, bounded removal
was proven; every larger removal the audit could not prove safe is HALTed field-specifically with its exact reason.

**FINAL counts (from runtime constants):**
- `shipment_final_output_snapshots` = **61** (was 62; −`status_at_finalization`)
- `shipment_final_output_lines` = **27** (was 29; −`material`, −`product_use`)
- `shipment_final_output_line_pos` = **10** (unchanged)

**Persistence-reason legend:** FK · RELATIONSHIP (relationship-resolvable master; not frozen) · FROZEN_FACT (mutation
would falsify an issued document) · DERIVED · REQUIRED_RUNTIME (integrity/idempotency/lineage). **Required?:** YES =
system-guaranteed non-blank · COND = blank legal at the grain but gates a document family · NO = optional.

---

## PHASE A — Field classification & verdicts

### Removed this round (proven safe, bounded)
| Table | Field | Writer | Reader | Historical requirement | Classification | Verdict |
|--|--|--|--|--|--|--|
| snapshots | `status_at_finalization` | `sfoBuildHeader_` | **none** (no renderer/mapper/frontend) | none — finalization is bound to dispatch/in_transit (`sfoIsDispatched_`); the value is fixed & derivable | DERIVED / redundant | **REMOVE** |
| lines | `material` | `sfoBuildLine_` (from sku_details) | **none** — no Phase-1 document (SHIPDETAIL/PL) renders it | RELATIONSHIP | **REMOVE** |
| lines | `product_use` | `sfoBuildLine_` (from sku_details) | **none** — not rendered by any Phase-1 document | RELATIONSHIP | **REMOVE** |

### §2 line fields considered & RETAINED (HALT — removal reverses the snapshot-only renderer)
Every one of these is **read by `35_` from the frozen snapshot**. Removing them would force the renderer (which by
R2B/R3A invariant reads NO live master and is deterministic/immutable) to re-resolve `sku_details`/regional live — a
**reversal of the R2B/R3A architecture and a new factual authority in the historical-document path** (§10/§15 HALT).
| Field | Reader (35_) | Canonical source (mutable?) | Verdict / reason |
|--|--|--|--|
| `site_sku` | SHIPDETAIL | marketplace_skus / regional (mutable) | **KEEP** FROZEN_FACT (renderer-consumed) |
| `product_name_en` | SD + PL | sku_details.product_name (mutable) | **KEEP** FROZEN_FACT (renderer-consumed) |
| `product_name_cn` | SD | sku_details.product_name_cn (mutable) | **KEEP** FROZEN_FACT |
| `gs1_code` | SD | sku_details.gs1_code (stable) | **KEEP** FROZEN_FACT (as-shipped barcode) |
| `gs1_type` | SD | sku_details.gs1_type | **KEEP** FROZEN_FACT |
| `carton_length/width/height` | SD + PL | sku_details (mutable) | **KEEP** FROZEN_FACT (renderer-consumed) |

> **DEFERRED marker `FINAL_OUTPUT_RELATIONSHIP_RESOLVED_DISPLAY_AUDIT`** — the USER target-state (lean lines to
> physical + customs only, with the renderer relationship-resolving display fields and the immutable Drive file as the
> historical artifact) is a legitimate but SEPARATE architectural round: it requires reversing the renderer
> snapshot-only invariant, updating R3A/R3B tests, and handling SKU-not-found edge cases. Not a bounded lean → not done
> here. Recommended before it: decide whether display accuracy on regeneration must equal the issued file.

### §5 customs / legal line facts RETAINED (FROZEN_FACT)
`country_of_origin`, `hs_code`, `declared_currency`, `declared_unit_value` — `tax_referral_rates` has NO fully
immutable identity (correction mode mutates values in place; the aggregator never froze `tax_rate_id`). Mutation would
change customs/legal truth. **KEEP.**

### §3 shipper / seller party values RETAINED (HALT — FROZEN_FACT)
`company_legal_entities` (33_) is resolved by the **`company` key** (not by the frozen `shipper_legal_entity_id` PK),
returns the **single active row**, and supports **in-place edits** (`updated_by`/`updated_at`). It has an
effective window but the runtime does NOT guarantee append-only per-entity versioning. → the frozen FK cannot be
proven to reconstruct the exact historical legal name/address/tax-id → removing party values would let an old-snapshot
regeneration print **today's** legal identity. These are legal transaction-party facts on issued commercial documents.
**KEEP all:** `shipper_legal_entity_id`, `shipper_company`, `shipper_legal_name`, `shipper_display_name`,
`shipper_country`, `shipper_address_line_1`, `shipper_address_line_2`, `shipper_city`, `shipper_state_or_region`,
`shipper_postal_code`, `shipper_tax_or_business_id`, `seller_of_record_legal_entity_id`, `seller_of_record_legal_name`.

> **DEFERRED option `COMPANY_LEGAL_ENTITY_VERSION_IDENTITY`** (report-only; do NOT create a second registry): make
> `company_legal_entities` append-only-versioned and resolve by the frozen PK + asOf. If adopted, the ordinary
> shipper/seller address/name values could later become FK-resolved. This is a bounded change to ONE existing
> authority — but it is out of scope for this lean round and must be its own audited slice.

### §4 consignee values RETAINED (HALT — FROZEN_FACT)
`logistics_locations` changes more often than KM legal entities, is resolved by `warehouse_id` (not the frozen
`consignee_location_id`), and has no frozen header contract → weaker reconstruction guarantee than shipper. **KEEP all:**
`consignee_location_id`, `consignee_warehouse_id`, `consignee_name`, `consignee_address_line_1`,
`consignee_address_line_2`, `consignee_city`, `consignee_state_or_region`, `consignee_postal_code`, `consignee_country`.

### §8 factory / carrier
`factory_id` (FK, warehouse-resolved via `procurementResolveFactoryId_`; **NEVER company** — unchanged; shared factory
across KM/ResTW/ResUS proven distinct-shipper), `carrier_id` (FK). `factory_name` / `carrier_name` are printed
historical commercial facts from mutable masters → **KEEP FROZEN_FACT**.

---

## PHASE §6 — Snapshot versioning verdict: **DETERMINISTIC_SNAPSHOT_ID_VS_VERSIONING_CONFLICT = CONFIRMED (HALT, documented)**
Proven from `34_`: `snapId = 'SFO-' + shipmentId` (deterministic PK) · `headerRow.snapshot_version = 1` (hardcoded) ·
finalize **short-circuits** on any existing non-superseded snapshot (`already_finalized`) · **NO runtime writer ever
sets `status='superseded'` or `superseded_by`** (grep: `superseded` appears only in READ filters). → the versioning
columns (`snapshot_version`, `status`, `superseded_by`, `superseded_reason`) are **schema-only scaffolding**; a shipment
can hold exactly ONE immutable snapshot. Correcting shipment data cannot create V2 today.
- **Columns RETAINED** (they are the scaffolding for the eventual correction; removing them would foreclose it).
- **Smallest safe correction (report-only; NOT implemented this round):** version-suffix the identity
  (`SFO-<shipment_id>-V<n>`), keep `SFO-<shipment_id>` resolving to the active version; on an authorized re-finalize,
  set V1 `status='superseded'`/`superseded_by=V2` (never delete V1 lines/line_pos) and append V2. `getShipmentFinalOutput`
  already filters `status != superseded`, so it would return the active version unchanged. This is a bounded feature,
  not a lean → its own round. Marker: **`SNAPSHOT_VERSIONING_ACTIVATION`**.

## PHASE §7 — Generated document / Drive file supersession verdict: **GENERATED_DOCUMENT_SUPERSESSION_SAFE**
`37_ dfoGenerateFile_` always `makeCopy` → a NEW `file_id`; it never mutates/renames/deletes an existing file. `36_`
idempotency reuses the active `generated_documents` row (updates the SAME row only to attach a first file); `regenerate`
appends a NEW row with `regenerated_from_document_id` and a NEW file; the file is generated BEFORE the DB row is
persisted (no false "generated" record). → old Drive files remain immutable historical artifacts. (Currently moot for
V1/V2 because snapshot versioning is unwired; when `SNAPSHOT_VERSIONING_ACTIVATION` lands, the `generated_documents`
idempotency key should incorporate snapshot lineage — noted.)

---

## PHASE 13 — FINAL DB SPEC (copy-ready)

### TABLE 1 — `shipment_final_output_snapshots` (PK `snapshot_id`; grain = 1 finalized snapshot / shipment; immutable after finalize)
| # | Column | Req | Type | Kind | Source | Why persisted |
|--|--|--|--|--|--|--|
|1|snapshot_id|YES|string|PK|self `SFO-<shipment_id>`|REQUIRED_RUNTIME (idempotency)|
|2|shipment_id|YES|string|FK|shipments|REQUIRED_RUNTIME (lineage/cleanup)|
|3|snapshot_version|YES|int|Metadata|self|REQUIRED_RUNTIME (lifecycle; see §6)|
|4|status|YES|enum|Metadata|`final`/`superseded`|REQUIRED_RUNTIME (snapshot lifecycle)|
|5|superseded_by|NO|string|FK|snapshots|REQUIRED_RUNTIME (supersede lineage)|
|6|superseded_reason|NO|string|Metadata|self|REQUIRED_RUNTIME|
|7|shipment_no|YES|string|Fact|shipments.shipment_no|FROZEN_FACT (doc identity)|
|8|reference_id|NO|string|Fact|shipments.reference_id|FROZEN_FACT|
|9|company|YES|enum|Fact|shipments.company|FROZEN_FACT (scope)|
|10|country|COND|string|Fact|shipments.country|FROZEN_FACT (customs asOf duty country)|
|11|marketplace|NO|string|Fact|shipments.marketplace|FROZEN_FACT|
|12|source_warehouse_id|COND|string|FK|warehouses|REQUIRED_RUNTIME (factory resolution)|
|13|destination_warehouse_id|COND|string|FK|warehouses|FROZEN_FACT (consignee key)|
|14|destination_type|NO|string|Fact|shipments.destination_type|FROZEN_FACT|
|15|warehouse_code|NO|string|Fact|shipments.warehouse_code|RELATIONSHIP (display) — retained w/ shipment execution facts|
|16|ship_from|NO|string|Fact|shipments.ship_from|FROZEN_FACT|
|17|ship_to|NO|string|Fact|shipments.destination|FROZEN_FACT (free-text; not legal identity)|
|18|carrier_id|COND|string|FK|carriers|FK (gates booking)|
|19|carrier_name|COND|string|Fact|carriers.carrier_name|FROZEN_FACT (printed; master mutable)|
|20|shipping_method|COND|string|Fact|shipments.shipping_method|FROZEN_FACT|
|21|etd|NO|date|Fact|shipments.etd|FROZEN_FACT|
|22|eta|NO|date|Fact|shipments.eta|FROZEN_FACT|
|23|dispatch_date|COND|date|Fact|shipments.actual_departure_date|FROZEN_FACT (party/customs asOf)|
|24|booking_no|NO|string|Fact|shipments.booking_no|FROZEN_FACT|
|25|container_no|NO|string|Fact|shipments.container_no|FROZEN_FACT|
|26|invoice_no|NO|string|Fact|shipments.invoice_no|FROZEN_FACT|
|27|currency|NO|string|Fact|shipments.currency|FROZEN_FACT|
|28|shipper_legal_entity_id|COND|string|FK|company_legal_entities|FK|
|29|shipper_company|COND|string|Fact|company_legal_entities.company|FROZEN_FACT (legal party)|
|30|shipper_legal_name|COND|string|Fact|company_legal_entities.legal_name|FROZEN_FACT (legal party; master mutable-in-place)|
|31|shipper_display_name|COND|string|Fact|company_legal_entities.display_name|FROZEN_FACT|
|32|shipper_country|COND|string|Fact|company_legal_entities.country|FROZEN_FACT|
|33|shipper_address_line_1|COND|string|Fact|company_legal_entities.address_line_1|FROZEN_FACT|
|34|shipper_address_line_2|NO|string|Fact|company_legal_entities.address_line_2|FROZEN_FACT|
|35|shipper_city|COND|string|Fact|company_legal_entities.city|FROZEN_FACT|
|36|shipper_state_or_region|COND|string|Fact|company_legal_entities.state_or_region|FROZEN_FACT|
|37|shipper_postal_code|COND|string|Fact|company_legal_entities.postal_code|FROZEN_FACT|
|38|shipper_tax_or_business_id|COND|string|Fact|company_legal_entities.tax_or_business_id|FROZEN_FACT (legal/tax id)|
|39|seller_of_record_legal_entity_id|COND|string|FK|company_legal_entities|FK|
|40|seller_of_record_legal_name|COND|string|Fact|company_legal_entities.legal_name|FROZEN_FACT|
|41|consignee_location_id|COND|string|FK|logistics_locations|FK|
|42|consignee_warehouse_id|COND|string|FK|logistics_locations.warehouse_id|FROZEN_FACT|
|43|consignee_name|COND|string|Fact|logistics_locations.location_name|FROZEN_FACT (gates SD/PL)|
|44|consignee_address_line_1|COND|string|Fact|logistics_locations.address_line_1|FROZEN_FACT|
|45|consignee_address_line_2|NO|string|Fact|logistics_locations.address_line_2|FROZEN_FACT|
|46|consignee_city|COND|string|Fact|logistics_locations.city|FROZEN_FACT|
|47|consignee_state_or_region|COND|string|Fact|logistics_locations.subdivision_code|FROZEN_FACT|
|48|consignee_postal_code|COND|string|Fact|logistics_locations.postal_code|FROZEN_FACT|
|49|consignee_country|COND|string|Fact|logistics_locations.country|FROZEN_FACT|
|50|factory_id|COND|string|FK|factories (via source_warehouse_id)|FK (NEVER company)|
|51|factory_name|COND|string|Fact|warehouses.warehouse_name|FROZEN_FACT (printed; master mutable)|
|52|shipping_detail_ready|YES|enum|Metadata|readiness|REQUIRED_RUNTIME|
|53|packing_list_ready|YES|enum|Metadata|readiness|REQUIRED_RUNTIME|
|54|commercial_invoice_ready|YES|enum|Metadata|readiness|REQUIRED_RUNTIME|
|55|booking_ready|YES|enum|Metadata|readiness|REQUIRED_RUNTIME|
|56|customs_ready|YES|enum|Metadata|readiness (Phase-1 always BLOCKED)|REQUIRED_RUNTIME|
|57|readiness_detail|YES|JSON string|Metadata|readiness object|REQUIRED_RUNTIME|
|58|finalized_by|YES|string|Metadata|actor|REQUIRED_RUNTIME (audit)|
|59|finalized_at|YES|timestamp|Metadata|clock|REQUIRED_RUNTIME (issuance lineage)|
|60|created_at|YES|timestamp|Metadata|clock|REQUIRED_RUNTIME|
|61|updated_at|YES|timestamp|Metadata|clock|REQUIRED_RUNTIME|

### TABLE 2 — `shipment_final_output_lines` (PK `snapshot_line_id`; grain = 1 physical shipment line; immutable)
| # | Column | Req | Type | Kind | Source | Why persisted |
|--|--|--|--|--|--|--|
|1|snapshot_line_id|YES|string|PK|self `SFOL-…`|REQUIRED_RUNTIME|
|2|snapshot_id|YES|string|FK|snapshots|REQUIRED_RUNTIME (read join)|
|3|shipment_id|YES|string|FK|shipments|REQUIRED_RUNTIME (cleanup key)|
|4|shipment_line_id|YES|string|FK|shipment_lines|REQUIRED_RUNTIME (grain + line_pos join)|
|5|sku|YES|string|FK|sku_details.sku|FK (master SKU)|
|6|site_sku|NO|string|Fact|regional/marketplace_skus|FROZEN_FACT (renderer-consumed; as-shipped)|
|7|product_name_en|COND|string|Fact|sku_details.product_name|FROZEN_FACT (renderer-consumed)|
|8|product_name_cn|NO|string|Fact|sku_details.product_name_cn|FROZEN_FACT (renderer-consumed)|
|9|shipment_qty|YES|number|Fact|shipment_lines.shipment_qty|FROZEN_FACT (**physical authority**)|
|10|shipment_carton_qty|COND|number|Fact|shipment_lines.shipment_carton_qty|FROZEN_FACT|
|11|carton_no_start|NO|string|Fact|shipment_lines.carton_no_start|FROZEN_FACT|
|12|carton_no_end|NO|string|Fact|shipment_lines.carton_no_end|FROZEN_FACT|
|13|units_per_carton|COND|number|Fact|shipment_lines / sku_details|FROZEN_FACT|
|14|gross_weight|COND|number|Fact|shipment_lines.gross_weight|FROZEN_FACT|
|15|net_weight|COND|number|Fact|shipment_lines.net_weight|FROZEN_FACT|
|16|cbm|COND|number|Fact|shipment_lines.shipment_carton_cbm|FROZEN_FACT (line-total; never ×cartons)|
|17|carton_length|NO|number|Fact|sku_details.carton_length|FROZEN_FACT (renderer-consumed)|
|18|carton_width|NO|number|Fact|sku_details.carton_width|FROZEN_FACT (renderer-consumed)|
|19|carton_height|NO|number|Fact|sku_details.carton_height|FROZEN_FACT (renderer-consumed)|
|20|gs1_code|COND|string|Fact|sku_details.gs1_code|FROZEN_FACT (as-shipped barcode)|
|21|gs1_type|COND|string|Fact|sku_details.gs1_type|FROZEN_FACT|
|22|country_of_origin|COND|string|Fact|tax_referral_rates.country_of_origin|FROZEN_FACT (customs)|
|23|hs_code|COND|string|Fact|tax_referral_rates.hscode|FROZEN_FACT (customs)|
|24|declared_currency|COND|string|Fact|tax_referral_rates.declared_currency|FROZEN_FACT (customs; gates CI)|
|25|declared_unit_value|COND|number|Fact|tax_referral_rates.declared_value|FROZEN_FACT (customs; gates CI)|
|26|note|NO|string|Fact|shipment_lines.note|FROZEN_FACT|
|27|created_at|YES|timestamp|Metadata|clock|REQUIRED_RUNTIME|

### TABLE 3 — `shipment_final_output_line_pos` (PK `snapshot_line_po_id`; grain = 1 executed PO allocation; immutable; never collapsed)
| # | Column | Req | Type | Kind | Source | Why persisted |
|--|--|--|--|--|--|--|
|1|snapshot_line_po_id|YES|string|PK|self `SFOP-…`|REQUIRED_RUNTIME|
|2|snapshot_id|YES|string|FK|snapshots|REQUIRED_RUNTIME (read join)|
|3|shipment_id|YES|string|FK|shipments|REQUIRED_RUNTIME (cleanup key)|
|4|shipment_line_id|YES|string|FK|shipment_lines|REQUIRED_RUNTIME (line↔allocation join)|
|5|shipment_line_allocation_id|YES|string|FK|shipment_line_allocations|FROZEN_FACT (executed allocation grain)|
|6|purchase_order_line_id|YES|string|FK|purchase_order_lines|FROZEN_FACT (PO line lineage)|
|7|purchase_order_id|COND|string|FK|purchase_orders|REQUIRED_RUNTIME (lineage)|
|8|po_no|COND|string|Fact|purchase_orders.po_no|FROZEN_FACT (printed commercial fact)|
|9|allocated_qty|YES|number|Fact|shipment_line_allocations.allocated_qty|FROZEN_FACT (Σ = shipment_qty)|
|10|created_at|YES|timestamp|Metadata|clock|REQUIRED_RUNTIME|

---

## PHASE 13 — COPY-READY TSV HEADER ROWS (paste into Sheets row 1)

**`shipment_final_output_snapshots` (61):**
```
snapshot_id	shipment_id	snapshot_version	status	superseded_by	superseded_reason	shipment_no	reference_id	company	country	marketplace	source_warehouse_id	destination_warehouse_id	destination_type	warehouse_code	ship_from	ship_to	carrier_id	carrier_name	shipping_method	etd	eta	dispatch_date	booking_no	container_no	invoice_no	currency	shipper_legal_entity_id	shipper_company	shipper_legal_name	shipper_display_name	shipper_country	shipper_address_line_1	shipper_address_line_2	shipper_city	shipper_state_or_region	shipper_postal_code	shipper_tax_or_business_id	seller_of_record_legal_entity_id	seller_of_record_legal_name	consignee_location_id	consignee_warehouse_id	consignee_name	consignee_address_line_1	consignee_address_line_2	consignee_city	consignee_state_or_region	consignee_postal_code	consignee_country	factory_id	factory_name	shipping_detail_ready	packing_list_ready	commercial_invoice_ready	booking_ready	customs_ready	readiness_detail	finalized_by	finalized_at	created_at	updated_at
```

**`shipment_final_output_lines` (27):**
```
snapshot_line_id	snapshot_id	shipment_id	shipment_line_id	sku	site_sku	product_name_en	product_name_cn	shipment_qty	shipment_carton_qty	carton_no_start	carton_no_end	units_per_carton	gross_weight	net_weight	cbm	carton_length	carton_width	carton_height	gs1_code	gs1_type	country_of_origin	hs_code	declared_currency	declared_unit_value	note	created_at
```

**`shipment_final_output_line_pos` (10):**
```
snapshot_line_po_id	snapshot_id	shipment_id	shipment_line_id	shipment_line_allocation_id	purchase_order_line_id	purchase_order_id	po_no	allocated_qty	created_at
```

---

## §11 — Migration safety
| | |
|--|--|
| A. old count | snapshots 62 · lines 29 · line_pos 10 |
| B. final count | snapshots **61** · lines **27** · line_pos **10** |
| C. removed columns | snapshots: `status_at_finalization` · lines: `material`, `product_use` · line_pos: none |
| D. retained | all other columns (see spec tables) |
| E. live sheet may hold dormant extras? | **YES** — `prodRequireSheet_ extraColumnsPolicy:'ALLOW'`; the 3 removed columns (plus R1's 6) stay ignored until the USER deletes them |
| F. migration/backfill required? | **NO** — no destructive migration, no backfill; reads/writes are by actual header name |

---

## Deployment handoff
- **Runtime changed?** YES — `34_` only (aggregator/builders). `35_`/`36_`/`37_` unchanged this round.
- **Apps Script sync required?** **YES — `34_`** (already required cumulatively with `35_` from prior rounds vs deployed baseline `226b027`). USER_VERIFY live state.
- **New `/exec` deployment?** NO by this change alone (no `01_router` action changed) — fold into the pending cumulative deployment.
- **Frontend deploy?** NO. **Bundle rebuild?** NO (`34_` not a bundle source; `aaf5b07` --check PASS). **DB USER action:** OPTIONAL dormant-column cleanup (§11-E).

## Deferred markers (no code this round)
- `FINAL_OUTPUT_RELATIONSHIP_RESOLVED_DISPLAY_AUDIT` — leaning line display fields requires reversing the snapshot-only renderer.
- `COMPANY_LEGAL_ENTITY_VERSION_IDENTITY` — append-only-version CLE to enable FK-resolved shipper/seller values.
- `SNAPSHOT_VERSIONING_ACTIVATION` — wire the V1→V2 supersession the columns already scaffold (§6).
- `PO_DOCUMENT_IMMUTABILITY_AUDIT` — carried from R1.1 (no PO snapshot subsystem this phase).

## FINAL GATE — PASS
3-table contract explicit + copy-ready ✓ · counts match runtime (61/27/10) ✓ · removed fields absent + unread ✓ ·
renderer document-model semantics unchanged (R2B/R3A/R3B/R3C green) ✓ · immutable legal/customs/party facts protected
(HALTed) ✓ · multi-PO lineage intact ✓ · physical qty = shipment_qty ✓ · factory never determines company ✓ · no
second snapshot/document engine ✓ · no unrelated refactor ✓.

**Exact next slice:** USER aligns the 3 sheets from the TSV (optional dormant-column cleanup), syncs `34_`(+`35_`) as
part of `F1_PHASE1_LIVE_DEPLOYMENT_CLOSURE_R1`, then proceeds to **F1-PHASE1-LIVE-ACCEPTANCE-R2**. This schema is the
FROZEN Final Output baseline.

**STOP after F1-5C-FINAL-OUTPUT-SCHEMA-LEAN-R2.**
