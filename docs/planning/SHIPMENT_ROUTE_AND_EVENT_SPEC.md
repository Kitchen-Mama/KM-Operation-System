# Shipment Route Template / Route Snapshot / Event Ledger — Domain Spec

**Status:** 🟡 SPEC + DB MAPPING ONLY — planned design. **No runtime, no UI, no DB migration.** Field-level SSOT for Route Templates, Template Nodes, per-Shipment Route Snapshots, and the Shipment Event Ledger.
**Last Updated:** 2026-07-17
**Maintained By:** Development Team
**Related:** [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) (§18 — points here; execution truth), [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md) (carrier rate-card matching — distinct from route-template matching), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §8 (relationships), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md).

> **This is the field-level Domain SSOT** for `shipment_route_templates`, `shipment_route_template_nodes`, `shipment_routes`, and `shipment_events`. Architecture specs point here rather than duplicating these schemas. **Nothing here is implemented** — no resolver, generator, event writer, matcher, World Map, polling, status projection, receiving, or close is built by this task.

---

## 1. Canonical Concepts

| Object | Role |
|--------|------|
| **`shipment_route_templates`** | Standard-route **header** + matching conditions (Master Data) |
| **`shipment_route_template_nodes`** | Ordered standard **stages** belonging to a template (Master Data) |
| **`shipment_routes`** | Per-Shipment **planned-route node snapshot** — copied from template nodes; one row per planned node |
| **`shipment_events`** | Append-only **actual event ledger** for one shipment |

```
Template Header + Template Nodes  → standard route definition (Master)
Shipment Routes                   → per-shipment planned-route snapshot
Shipment Events                   → actual event history (append-only)
World Map                         → planned route (routes) + actual events (events)
```

Current position and progress are **derived from the latest valid events** — never stored as a single current-state row that replaces event history.

---

## 2. Authority & Layer Rules

- **`shipments` / `shipment_lines` remain the Execution Truth** and the shipment lifecycle authority.
- `shipment_routes` = planned-route enrichment / snapshot; `shipment_events` = actual tracking enrichment.
- **Route/Event records must NOT replace `shipments`** as lifecycle authority.
- **No Route or Event may be required to complete the core Ship action in Phase 1** (a shipment can be created, shipped, and settled with zero route/event rows — `SHIPMENT_CENTER_SPEC.md` §18).
- **Route/Event write failure must not silently corrupt Shipment execution** — it is non-blocking enrichment.
- **Exact Ship / Receive / Close orchestration remains an OPEN DECISION** until the future full closed-loop spec (§14).

---

## 3. Warehouse Region Rule (uses EXISTING field)

**`warehouses.logistics_region` ALREADY EXISTS** as a canonical Warehouse Master field — **this spec does not add it.** Canonical example values: `US_WEST` · `US_CENTRAL` · `US_EAST`.

**Resolution path:**
```
shipments.warehouse_code / warehouse_id
  → warehouses
  → warehouses.logistics_region
  → shipment_route_templates.destination_region
```
- **Do NOT create a second Region table** or duplicate the region on warehouse records under another field name.
- Amazon FBA warehouses such as **ONT8** and **LGB8** may share `US_WEST` and therefore **share the same Route Template**. **Do NOT create one Route Template per Amazon warehouse** unless that warehouse has a genuinely different physical route.
- `shipment_route_templates.destination_region` reads the **same enum family** as `warehouses.logistics_region`.

---

## 4. Route Template Matching

A Route Template is selected using: `origin_country` · `destination_country` · `destination_region` · `transit_type` · `last_mile_delivery` · `customs_type` · effective date · `priority`. Optional specificity fields: `destination_warehouse_id` · `origin_warehouse_id` · `carrier_id`.

**Specificity priority (destination):** (1) `destination_warehouse_id` exact match → (2) `destination_region` match → (3) `destination_country` match.
**Carrier priority:** (1) carrier-specific match → (2) `carrier_id` blank = generic template.
**Then:** effective-date validity → highest `priority` → latest `effective_from` as the final version tie-break.

- **`carrier_id` is NOT required.** Most carriers using the same physical transport flow should **share the generic template**.
- **Effective-date rule:** `effective_from ≤ target_date AND (effective_to blank OR ≥ target_date)`; **blank `effective_to` = open-ended**; historical versions retained.
- This is **distinct from carrier rate-card matching** (`CARRIER_AND_ROUTE_SPEC.md` §4) — route templates describe the physical path, rate cards describe pricing.

---

## 5. Table Schemas (planned — DB mapping only)

### 5.A `shipment_route_templates` (header — Master Data)
`route_template_id` (PK) · `route_template_name` · `route_version` · `origin_country` · `origin_warehouse_id` · `destination_country` · `destination_region` · `destination_warehouse_id` · `carrier_id` · `transit_type` · `last_mile_delivery` · `customs_type` · `priority` · `is_active` · `effective_from` · `effective_to` · `note` · `created_at` · `updated_at`.
- `carrier_id` **nullable = generic route**. `destination_warehouse_id` **nullable = regional/country route**.
- `destination_region` reads the same enum family as `warehouses.logistics_region` (§3).
- Historical versions retained; blank `effective_to` = open-ended.

### 5.B `shipment_route_template_nodes` (ordered nodes — Master Data)
`route_template_node_id` (PK) · `route_template_id` (FK) · `node_sequence` · `node_type` · `node_code` · `node_name` · `country` · `region` · `city` · `latitude` · `longitude` · `planned_event_type` · `default_offset_days` · `transport_mode_to_next` · `is_destination_placeholder` · `is_required` · `note` · `created_at` · `updated_at`.
- One template has many **ordered** nodes; `node_sequence` is **unique within a template**.
- The final destination node may use `is_destination_placeholder = TRUE` (replaced with the actual warehouse snapshot at generation — §6).
- Template Nodes are **Master Data**, not Shipment records.

### 5.C `shipment_routes` (per-Shipment planned-node snapshot)
`shipment_route_id` (PK) · `shipment_id` (FK) · `route_template_id` · `route_template_node_id` · `sequence_no` · `node_type` · `node_code` · `location_ref_type` · `location_ref_id` · `location_name` · `country` · `region` · `city` · `latitude` · `longitude` · `transport_mode` · `planned_event_type` · `planned_arrival_date` · `planned_departure_date` · `actual_arrival_date` · `actual_departure_date` · `status` · `created_at` · `updated_at`.
- **One row per Shipment per planned Route Node**, generated by copying template nodes; **template lineage retained** (`route_template_id` / `route_template_node_id`).
- The destination placeholder is **replaced with the actual Warehouse snapshot**.
- **After Shipment Confirm/Ship the planned Route Snapshot is IMMUTABLE except for progress-projection fields:** `actual_arrival_date`, `actual_departure_date`, `status`, `updated_at`.
- **Template edits NEVER rewrite existing `shipment_routes`.**

### 5.D `shipment_events` (append-only actual ledger)
`shipment_event_id` (PK) · `shipment_id` (FK) · `shipment_route_id` (nullable) · `event_sequence` · `event_time` · `event_type` · `event_status` · `location_name` · `country` · `city` · `latitude` · `longitude` · `source` · `source_event_id` · `raw_status` · `note` · `created_by` · `created_at` · `updated_by` · `updated_at`.
- **Append-only actual event ledger.** `source` ∈ `system` / `manual` / `carrier_api` / `tracking_api` / `import`.
- `shipment_route_id` nullable — events unmatched to a planned node are **preserved** (never fabricate a planned node).
- `source_event_id` supports **idempotency** for external imports.
- **Current location is derived from the latest valid actual event** — not stored as a replacement for event history.
- **Do NOT delete or overwrite historical events silently.**

---

## 6. Route Generation Flow (planned)

```
Shipment Draft
  → resolve Destination Warehouse
  → read warehouses.logistics_region
  → resolve matching Route Template (§4)
  → copy shipment_route_template_nodes
  → replace Destination Placeholder with actual Warehouse data
  → calculate planned dates from ETD + default_offset_days
  → create shipment_routes rows
  → show Route Preview
```
- **Draft behavior:** the route MAY be regenerated before Shipment Confirm/Ship if route-driving fields change. Regeneration **must not create duplicate active route rows.** Exact revision/version strategy is an **Open Decision** (§14).
- **After Shipment Confirm/Ship:** the planned Route Snapshot is **locked**; later route deviations are captured by `shipment_events`; **do not silently rewrite the planned route.**

---

## 7. Event Flow (planned)

Events may be created by: system action · manual update · carrier API · tracking API · import.

**Future shared writer flow:** receive event → normalize external status into a canonical `event_type` → idempotency check (`source` + `source_event_id`) → insert `shipment_events` → attempt planned-node match → update Route Progress Projection → optionally request a **valid** Shipment status transition.

**Event-to-route matching priority:** (1) explicit `shipment_route_id` → (2) `planned_event_type` → (3) country/city/location → (4) node sequence and first not-yet-passed matching node.
**If no Route Node matches:** keep `shipment_route_id` blank, **preserve the Event**, do **not** fabricate a planned node.

---

## 8. Route Progress Projection

`shipment_events` may project progress onto `shipment_routes`: prior matched nodes → `passed`; matched node → `current` or `passed`; later nodes → `pending`; exception event → exception display.

- **Projection may update ONLY:** `shipment_routes.status`, `actual_arrival_date`, `actual_departure_date`, `updated_at`.
- **It must NOT overwrite:** planned location, planned coordinates, planned dates, node sequence, or template lineage.

---

## 9. Shipment On The Way / World Map Read Model

Reads `shipments` + `shipment_routes` + `shipment_events`. Ownership:

| Aspect | Source |
|--------|--------|
| Shipment header / status | `shipments` |
| Planned map line | `shipment_routes` |
| Actual timeline | `shipment_events` |
| Current position | latest valid Event |
| Next planned node | first pending Route Node |

- **Do NOT define `shipment_events` as the sole Shipment lifecycle authority.**
- **Event → Shipment Status mapping remains an OPEN DECISION** for the later closed-loop orchestration spec.

---

## 10. Example Route Templates (illustrative — placeholders, not verified master data)

Six generic templates (all `origin_country = CN`, `destination_country = US`, `transit_type = sea_express`, `customs_type` per shipment):

| route_template_name | destination_region | last_mile_delivery |
|---------------------|--------------------|--------------------|
| `CN-US-FBA-SEAEXP-PARCEL-WEST` | `US_WEST` | `parcel` |
| `CN-US-FBA-SEAEXP-TRUCK-WEST` | `US_WEST` | `truck` |
| `CN-US-FBA-SEAEXP-PARCEL-CENTRAL` | `US_CENTRAL` | `parcel` |
| `CN-US-FBA-SEAEXP-TRUCK-CENTRAL` | `US_CENTRAL` | `truck` |
| `CN-US-FBA-SEAEXP-PARCEL-EAST` | `US_EAST` | `parcel` |
| `CN-US-FBA-SEAEXP-TRUCK-EAST` | `US_EAST` | `truck` |

**ONT8 and LGB8 both resolve through `warehouses.logistics_region = US_WEST`** and share the `…-WEST` templates. **Do not invent official Amazon addresses or coordinates** — use placeholders unless verified master data is available.

**Generic Sea Express nodes** (only stages the business actually uses; do not invent operational stages):
1. Origin Factory · 2. Export Customs · 3. Origin Port · 4. Ocean Transit · 5. Destination Port · 6. Import Customs · 7. Last Mile / Transload (only if actually applicable) · 8. Destination FBA Placeholder (`is_destination_placeholder = TRUE`).

---

## 11. Open Decisions (preserved — not decided here)

- Exact canonical `event_type` enum
- Event → Shipment Status mapping
- Route revision strategy after Ship
- Progress projection synchronous vs async
- Manual event correction / void strategy
- Carrier API provider
- Polling schedule
- Receiving / Close status behavior
- Exact Ship transaction relationship
- Exact geographic coordinates
- Delay calculation & exception thresholds

---

**Shipment Route & Event Domain Spec — SPEC + DB MAPPING ONLY. Field-level SSOT for route templates / template nodes / route snapshots / event ledger. No runtime, no UI, no DB migration.**

**End of Document**
