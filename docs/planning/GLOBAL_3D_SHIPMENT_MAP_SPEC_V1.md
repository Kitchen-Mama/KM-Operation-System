# Kitchen Mama Operation System — 3D Global Shipment Map & Logistics Location Spec

**Status:** v2.1 / **Formal (implementation-guiding) spec** — Spec sync only this round (NO frontend, backend, DB migration, or Canonical Runtime Mapping Sync — the latter is PAUSED until `logistics_locations` is finalized; see §2.1).
**Last Updated:** 2026-07-23
**Scope:** 3D operational shipment map (primary visual monitoring + contextual Shipment action entry), reusable `logistics_locations` master, route/timeline read model, ETA projection contract, and the map-driven Update-Shipment contract.
**Authority Position:** The map is a **read + action-orchestration surface**. It is **NOT** a Shipment / Inventory / Receipt / Carrier transaction authority. Every mutation reuses the canonical Shipment handlers.
**Related Authority (canonical; this spec must not contradict them):** `SHIPMENT_CENTER_SPEC.md`, `SHIPMENT_ROUTE_AND_EVENT_SPEC.md`, `CARRIER_AND_ROUTE_SPEC.md`, `WAREHOUSE_OPERATIONS_SPEC.md`, `OVERSEAS_INBOUND_SPEC.md`, `OVERSEAS_OUTBOUND_SPEC.md`, `DOCUMENT_GENERATION_SYSTEM_SPEC.md`, `DATABASE_RELATIONSHIP_MAP.md`, `SYSTEM_RUNTIME_ARCHITECTURE.md`, `SYSTEM_ROADMAP.md`.

> **v2.0 CANONICAL-SYNC NOTE (2026-07-23).** This revision was written after a full re-read + code audit of the specs above. It (a) formally repositions the map as the **primary visual monitoring interface + a primary Shipment action entry** (a deliberate owner decision that supersedes the earlier "secondary/deferred" framing — see §26 for the specs that must be synced), (b) binds every map action to a **canonical Shipment handler** (`updateShipment` / `createShipmentFromPlan`) or a named spec-only runtime concept — **no parallel handler is invented**, (c) keeps the Map API **read-only**, (d) corrects the coordinate-authority model, and (e) marks every element **Ready / Blocked** against the still-unbuilt route runtime (Phase-1 **P1-E**) and unprovided location data. Where the request assumed tables that do not exist (`carrier_services`, `carrier_service_schedules`, a `lead_time_basis` column, structured `origin_warehouse_id`/`destination_warehouse_id`, a `shipments` version field), this spec uses the **real** canonical model and flags the gap in §26/§25 rather than fabricating.

---

## Table of Contents
1. Overview, Purpose & Positioning
2. Non-Authority Rule & Read/Write-Model Separation
3. Canonical Handler Mapping (Map Action → real handler)
4. Coordinate Standard
5. `logistics_locations` Master — DB Field Spec
6. Route-Table Changes & Coordinate Authority
7. Location Resolution Workflow
8. Map Position Resolution
9. Shipment Route Runtime
10. Planned Timeline
11. ETA Runtime
12. ETA When Schedule Data Is Missing
13. Carrier Data Relationships (no `carrier_services`)
14. Warehouse & Location Rules
15. Shipment Status ↔ Inventory Boundary (Delivered ≠ Received)
16. Update Shipment from the Global Map (Detail Drawer)
17. Map Drawer Actions (per-action contract)
18. Update Shipment Workspace (form + change preview)
19. Map UI Specification
20. Permissions
21. Audit, Concurrency & Validation
22. Map Read Model & API Contract
23. UI & Technical Requirements
24. Data Quality & Verification
25. Implementation Readiness Matrix & Milestones
26. Cross-Spec Sync & Conflicts
27. Prohibited This Round
28. Decision Log
29. External Standards Notes
30. Current Runtime DB Columns (authoritative until Runtime Mapping Sync)
31. Route Data Review (Nodes received; not edited this round)

---

## 1. Overview, Purpose & Positioning

**GLOBAL 3D SHIPMENT MAP =**
- **Primary Visual Shipment Monitoring** — the main visual surface for watching shipments move (planned vs actual position, current node, delay/risk).
- **Contextual Shipment Action Entry** — a primary entry point to open a Shipment and act on it, alongside the Shipment list/table.
- **Shipment Route / ETA / Risk Visualization** — planned route, runtime progress, projected ETA, and exception state.

**It is explicitly NOT:**
- a **Shipment Transaction Authority** (that is `shipments` + `shipment_lines` via `updateShipment` / `createShipmentFromPlan`),
- an **Inventory Transaction Authority** (overseas inventory changes only through confirmed receipt — §15),
- a **Receipt Confirmation Authority** (that is the Overseas Inbound receiving operation),
- a **Carrier Master Authority** (that is `carriers` / `carrier_rate_cards` / `carrier_lead_times`).

**Canonical architecture (must hold):**
```
Map UI
  → renders the Map Read Model (GET /api/shipment-map, read-only)
  → opens the Shipment Detail Drawer / Action Workspace
  → calls an existing canonical Shipment Handler (updateShipment / createShipmentFromPlan / future ledger handlers)
  → Handler performs validation, mutation, audit inside the authoritative module
  → Map Read Model refreshes (re-GET), re-projects markers / routes / timeline / KPIs
```

The map **must not** build a second Shipment-update path and **must not** write directly to `shipments`, `shipment_lines`, inventory, movement, route, event, or receipt tables.

**Positioning change (owner decision, 2026-07-23):** the map is now the **primary visual monitoring interface + a primary action entry**. It remains non-authoritative and must still provide a table/list/drawer fallback for accessibility and non-WebGL clients (§19, §23). This supersedes `WAREHOUSE_OPERATIONS_SPEC.md:210` ("Do NOT make the map the primary operation interface") and the Phase-2 placement in `SYSTEM_ROADMAP.md` P2-A — both listed for sync in §26. **Map is still not the transaction authority.**

## 2. Non-Authority Rule & Read/Write-Model Separation

| Concern | Authority | Map's role |
|---|---|---|
| Shipment header/line truth & lifecycle | `shipments` + `shipment_lines` (via `updateShipment`, `createShipmentFromPlan`) | read + route action to handler |
| Route plan (per-shipment version) | `shipment_routes` (+ `shipment_route_nodes`) — spec-only P1-E | read + route action to future handler |
| Actual logistics history | append-only `shipment_events` — spec-only P1-E | read + route action to future handler |
| Overseas inventory | `overseas_inventory_snapshot` + `overseas_inventory_movements` | read only; never writes |
| Warehouse receipt | Overseas Inbound receiving operation — spec-only | routes user to that module |
| Carrier master / lead time / rate | `carriers` / `carrier_lead_times` / `carrier_rate_cards` | read only; never a carrier-management UI |
| Documents | Document Engine `generated_documents` — spec-only | read + route action to that engine |
| Logistics coordinates | `logistics_locations` (master) + snapshots | read + Data Health surfacing |

**Read path:** Shipment / Route / Event / ETA / Location data → Map Read Model → Map UI.
**Write path:** Map Action → **canonical Shipment handler** → DB transaction + audit → Read Model refresh.

The Map Read Model is a **disposable, rebuildable cache/projection**. It may never become a source of truth.

### 2.1 v2.1 Canonical Sync (2026-07-23) — Read-Only Execution + Narrowed Lifecycle-Action Scope; Runtime Mapping Sync PAUSED

> **Canonical Runtime Mapping Sync is PAUSED** until `logistics_locations` is finalized. This round is **spec sync only** — no code, no DB migration, no event projection, no location resolution, no map-specific mutation API. §6 (coordinate authority / template-node FK), §9 (runtime snapshot), §10–§12 (timeline/ETA runtime) remain **design targets deferred to the paused Runtime Mapping Sync**; §31 records the current live DB columns that are authoritative until then.

**Canonical rule (shared with `SHIPMENT_CENTER_SPEC.md` §5.1):** *Shipment execution fields are read-only, but lifecycle actions are handler-driven action entries.* The Global Map and Shipment Overview use the **same authority boundary** — the map is a Shipment **lifecycle action entry**, never an independent mutation authority for Shipment or map data, and it stores **no second copy** of Shipment state. It only re-reads the Map Read Model after a handler succeeds; **no frontend optimistic display may pretend the DB was updated**, and on handler failure the map keeps the prior canonical state and shows an error.

**Read-only execution fields (no inline edit on the map):** `shipment_id`, `external_shipment_id`, shipment identity, `shipment_lines` (SKU / shipped qty / carton qty / package / content), origin warehouse, destination warehouse, `company`, `country`, `marketplace`, carrier, shipping method, tracking/reference, `etd`, `eta`, route assignment / route identity, document identity, and all other execution fields. Displayed read-only; never turned into editable inputs that save directly.

**Allowed lifecycle-action scope (this round — NARROWS §16–§18 & §20 to exactly these six):**
1. **Update Shipment Status** (`Advance →`) → `updateShipment` (`status`).
2. **Record Shipment Event** → append `shipment_events` (spec-only / P1-E).
3. **Advance / synchronize Route Progress** → handler syncs current node / progress / `actual_*` / node status (spec-only / P1-E).
4. **Confirm Arrival / Carrier Delivered** → arrival status + delivery event; **not** a receipt.
5. **Open Inbound Receipt** → opens the formal Overseas Inbound workflow; opening ≠ received.
6. **Warehouse Receipt Confirmation** → formal Inbound Receipt handler only, permission + lifecycle permitting; the **only** path that confirms received qty and posts overseas inventory movement.

**NOT allowed from the map:** editing Shipment ID / lines / content / SKU / quantity / origin / destination; free route, carrier, tracking editing; direct `etd`/`eta` editing; direct inventory change; Delivered = Received. The broader capabilities (`shipment.update` free-field edit, `shipment.route.assign`, `shipment.reroute`, `shipment.eta.override`, `shipment.document.manage`) are **separate gated permissions, NOT default-open**, and are **out of this round's allowed scope** — they must not be enabled merely because the map has an action entry.

**Action → Handler → DB → Read-Model flow:** map action → canonical Shipment / Inbound Receipt handler → validate permission + company/country scope + current lifecycle status + legal transition + version (optimistic concurrency) → update `shipments` (status/metadata only; never identity/lines), and per action type append `shipment_events` and/or sync `shipment_routes` progress → write audit → success: re-fetch Map Read Model, re-render markers / route / timeline / KPI; failure: keep canonical state, preserve input, show error; conflict: show conflict, never silently overwrite. Not every action writes all three tables (action type + transition decide).

**Permissions (this round):** `map.view`, `shipment.view`, `shipment.status.update`, `shipment.event.create`, `inbound.receipt.open`, `inbound.receipt.confirm`, `shipment.audit.view`. Without a given permission the user still gets the read-only drawer within scope; the action is hidden/disabled with a reason and the API re-validates (no client bypass). *(This narrows §20's broader list; the additional permissions there remain defined but are NOT default-open this round.)*

**Audit / concurrency:** store actor, timestamp, `source_ui ∈ {shipment_overview, global_shipment_map}`, previous → new status, and reason where required; use version check / optimistic concurrency (`shipments` has no version column today — a documented prerequisite); show conflict rather than overwrite.

**Action UI states (minimum):** action available · unavailable due to lifecycle · permission denied · submitting · success · validation failure · handler failure · conflict / concurrent update · stale shipment data · refresh success · refresh failure · receipt already opened · receipt already confirmed.

## 3. Canonical Handler Mapping (Map Action → real handler)

**This is the binding contract: no map action may invent a parallel handler.** Names below are the project's actual canonical mechanisms (audited 2026-07-23).

| Map action | Canonical mechanism | Status | Notes |
|---|---|---|---|
| Edit Shipment (fields) | `updateShipment` (`handleUpdateShipment_`) | **IMPLEMENTED** | field whitelist `SHIPMENT_EDITABLE_FIELDS_` |
| Update Shipment Status | `updateShipment` with `status` field | **IMPLEMENTED** | there is **no** separate `updateShipmentStatus` handler; status is a field |
| Update ETD / ETA / actual dates | `updateShipment` (`etd`,`eta`,`actual_departure_date`,`actual_arrival_date`,`customs_clearance_date`,`delivered_date`) | **IMPLEMENTED** | no separate `updateShipmentDates` handler |
| Return to Draft / Done | `updateShipment` (`revision_reason` / `hidden_from_draft`) | **IMPLEMENTED** | |
| Execution Commit (plan → shipment) | `createShipmentFromPlan` (`createShipmentFromApprovedPlan_`) | **IMPLEMENTED** | idempotent |
| Header totals | `shipmentRecalcTotals_` (internal helper) | **IMPLEMENTED** | invoked inside `updateShipment` |
| Add Manual Event / Sync Carrier Event / Confirm Pickup / Departure / Arrival (as *events*) | append-only `shipment_events` ledger (event types `picked_up`,`departed`,`arrived_port`,…) | **SPEC-ONLY (P1-E, not built)** | SSOT `SHIPMENT_ROUTE_AND_EVENT_SPEC.md`; dedupe key `(source_type, source_event_id)` |
| Assign Route / Change Route / Reroute | per-shipment `shipment_routes` version snapshot (reroute = new `is_current` version + `supersedes_shipment_route_id`) | **SPEC-ONLY (P1-E, not built)** | no `assignShipmentRoute`/`rerouteShipment` handler exists yet |
| Confirm Arrival (as *status*) | `updateShipment` `status='arrived'` | **IMPLEMENTED** | distinct from Open Inbound Receipt |
| Open Inbound Receipt | Overseas Inbound receiving operation (auto-linked by `shipment_id + warehouse_id + operation_type=inbound`) | **SPEC-ONLY (not built)** | owned by `OVERSEAS_INBOUND_SPEC.md` §10 |
| View / Upload / Replace Documents | Document Engine `generated_documents` (`related_entity_type='shipment'`) | **SPEC-ONLY (not built)** | no `updateShipmentDocuments` handler exists |
| View Audit History | read model over shipment/event audit fields | read-only | |

**Rule:** where a mechanism is spec-only (P1-E route/event ledger, Overseas Inbound, Document Engine), the map may present the action **disabled with a clear "runtime not yet available" state**, or in Preview only — it must **not** claim the mutation succeeded (§21, §27).

## 4. Coordinate Standard
CRS WGS84; SRID 4326; longitude −180..180; latitude −90..90; **storage order longitude, latitude**. Display rounding is presentation only; stored precision unchanged. **Blank is preferable to a fabricated coordinate.** PostGIS (if adopted): `ST_Point(longitude, latitude, 4326)`, X=longitude, Y=latitude.

## 5. `logistics_locations` Master — DB Field Spec

### 5.1 Canonical Fields
| Field | Type / Rule | Purpose |
|---|---|---|
| `logistics_location_id` | string, PK | Stable internal identity |
| `location_code` | string, unique | Human-manageable canonical code |
| `location_name` | string, required | Canonical English display name |
| `local_name` | string, nullable | Local-language name |
| `location_type` | enum, required | Operational location class |
| `country` | ISO 3166-1 alpha-2, required | Country code |
| `subdivision_code` | string, nullable | ISO 3166-2 or local subdivision code |
| `region` | string, nullable | Operational / administrative region |
| `city` | string, nullable | City / place |
| `district` | string, nullable | District / locality |
| `address_line_1` / `address_line_2` | string, nullable | Address |
| `postal_code` | string, nullable | Postal code |
| `latitude` / `longitude` | decimal, nullable | WGS84 (both present or both blank) |
| `coordinate_accuracy` | enum, required when coordinates exist | Precision classification |
| `coordinate_source_type` | enum, nullable | Source category |
| `coordinate_source_reference` | string, nullable | Source URL/doc/dataset/internal evidence |
| `coordinate_verified_at` / `coordinate_verified_by` | datetime / string, nullable | Verification audit |
| `verification_status` | enum, required | Draft/verified lifecycle |
| `un_locode` / `iata_code` / `icao_code` / `port_code` / `rail_terminal_code` | string, nullable | External codes (never invented) |
| `warehouse_id` | FK → `warehouses`, nullable | Link when the location is a warehouse |
| `factory_id` | FK, nullable | Link when the location is a factory |
| `timezone` | IANA tz, nullable | Event display / schedule interpretation |
| `map_label_priority` | integer, default 0 | Label collision priority |
| `is_active` | boolean, required | Active master row |
| `effective_from` / `effective_to` | date, nullable | Validity window |
| `note` | string, nullable | Operational note |
| `created_by` / `created_at` / `updated_by` / `updated_at` | audit | |

### 5.2 Enums
- **location_type:** factory, warehouse, fulfillment_center, port, airport, rail_terminal, truck_terminal, border_crossing, customs_facility, transit_hub, parcel_hub, carrier_facility, city_centroid, country_centroid, virtual_transit_point, other.
- **coordinate_accuracy:** exact_facility, entrance_or_routable_point, parcel_or_site, port_or_terminal, city_centroid, region_centroid, country_centroid, approximate.
- **coordinate_source_type:** official_address, official_facility_source, un_locode, carrier_source, warehouse_master, geocoding_provider, manual_verified, internal_estimate.
- **verification_status:** draft, pending_review, verified, rejected, retired.

### 5.3 Constraints
`location_code` unique; lat/long both present or both blank; coordinates require `coordinate_accuracy` + `coordinate_source_type` + `verification_status`; `verification_status = verified` requires source reference + verifier + verification time; `warehouse_id` must resolve to `warehouses`; ≤ one active primary location per warehouse; `effective_to ≥ effective_from`; a location referenced by history may be **retired, not deleted**; external codes nullable, never invented.

### 5.4 ID / Code Pattern
`LOC-{COUNTRY}-{TYPE}-{SEQUENCE}` (e.g. `LOC-CN-FACTORY-0001`, `LOC-US-FC-0001`, `LOC-PL-BORDER-0001`). Display names must not serve as keys.

## 6. Route-Table Changes & Coordinate Authority

**Coordinate authority (canonical, corrected in v2.0):**

1. **`logistics_locations`** — the shared physical-place authority (standard address + verified coordinates).
2. **`shipment_route_template_nodes`** — hold a **location reference + resolution rule**, not a duplicate coordinate authority.
3. **`shipment_route_nodes`** — hold the **runtime coordinate snapshot** taken at Shipment Route Confirm; historical shipments never move when the master is later corrected.
4. **`shipment_events`** — may hold the **actual event coordinate** (nullable); actual carrier/manual event coordinate has the **highest** display priority.

### 6.1 `shipment_route_template_nodes` (owner-maintained live sheet — additive only)
- **Add (additive):** `logistics_location_id` (nullable FK → `logistics_locations`), `location_resolution_type` (enum below), `location_ref_type`, `location_ref_id`.
- **Deprecate:** the inline `latitude` / `longitude` on the template node are **DEPRECATED as a coordinate authority.** They are **retained** (owner data; never bulk-cleared or normalized) only as a legacy visual fallback; new template coordinates come from `logistics_locations` via `logistics_location_id`. No process may treat template inline lat/long as authoritative once a `logistics_location_id` is present.
- ⚠ These template tables are **owner-maintained live sheets** — additive columns only; never recreate / clear / normalize / re-import.

**`location_resolution_type` enum (canonical v2.0):** `fixed_location`, `origin_warehouse`, `destination_warehouse`, `runtime_event`, `virtual`, `unresolved`.
- `fixed_location` → directly reference a `logistics_locations` row.
- `origin_warehouse` → resolved at Shipment Route Confirm from the shipment's origin warehouse (`origin_warehouse_id` when the structured field exists — see §14; today the origin is text `ship_from`, so this is a documented dependency).
- `destination_warehouse` → resolved at Confirm from `destination_warehouse_id` (today: `shipments.warehouse_id`, destination semantic).
- `runtime_event` → no fixed coordinate at template time; awaits an actual event.
- `virtual` → non-fixed transit legs (ocean, air, rail corridors); approximate/virtual point, clearly labeled.
- `unresolved` → insufficient data; **no fabricated place or coordinate.**

### 6.2 `shipment_route_nodes` (runtime, spec-only P1-E)
Retain `location_ref_type`, `location_ref_id`, `country`, `region`, `city`, `latitude`, `longitude`. At Shipment Route Confirm, copy the resolved location identity + coordinates into the runtime node; after Confirm, planned location fields are **immutable** for that route version. **This runtime coordinate snapshot must not be removed** — it is what keeps historical shipments stable when `logistics_locations` is later corrected.

### 6.3 `shipment_events` (runtime, spec-only P1-E)
May carry `logistics_location_id` (nullable), `latitude`/`longitude` (nullable), `coordinate_accuracy` (nullable). Actual event coordinate takes precedence for the event marker; unmatched events remain preserved and are **never** forced onto the nearest planned node. Dedupe by `(source_type, source_event_id)`.

## 7. Location Resolution Workflow
- **Master prep:** owner supplies warehouses, factory addresses, ports/airports/terminals, border crossings, customs facilities, transit/carrier hubs, route-specific transfer points; each with normalized name, country + subdivision context, `location_type`, source, `coordinate_accuracy`, verification status, ambiguity note. **Never silently choose among same-named facilities.**
- **Generalized nodes** (e.g. Alashankou/Khorgos, Channel transit, ocean legs): do not assign a false exact facility — either split into route variants with exact locations, or use `virtual_transit_point`/approximate midpoint for visualization, or leave `unresolved` until runtime/event supplies it. UI must visually distinguish approximate/virtual from verified facilities.
- **Destination placeholder:** `destination_warehouse` resolution maps `shipments.warehouse_id (destination) → warehouses → logistics_locations.warehouse_id`. If the warehouse has no verified location: use a clearly-marked centroid **only if approved**, else show route unresolved + Data Health warning; **never invent an exact warehouse pin.**

## 8. Map Position Resolution

**Priority order (highest first):**
1. **Actual Event Coordinate** — from the latest valid, non-reversed `shipment_events` row; must retain `source`, `event_time`, `coordinate_accuracy`.
2. **Current Runtime Node Coordinate** — the Confirm-time snapshot on `shipment_route_nodes`.
3. **Estimated Interpolation** — between last completed and next planned node; **labeled Estimated only.**
4. **Last Known Position** — with its **timestamp shown**, so it is never mistaken for a live fix.
5. **Unresolved** — insufficient data.

**Rules:** interpolation may never be shown as **Live GPS** and never creates an event; when data is insufficient show **Unresolved**; the marker + drawer must show the **Position Type**:
`actual` · `runtime_node` · `estimated` · `last_known` · `unresolved`.

## 9. Shipment Route Runtime (spec-only P1-E)

```
Template Route (owner-maintained blueprint)
  → Shipment Route Confirm (at/after Formal Shipment; active template filtered per SHIPMENT_ROUTE_AND_EVENT_SPEC §3)
  → Runtime Route Snapshot (shipment_routes VERSION row)
  → Runtime Nodes (shipment_route_nodes, optional per-node rows)
  → Shipment Events (append-only, validated + idempotent)
  → Current Node (projected from latest valid event)
  → Route Progress
  → Current Position (§8)
  → ETA / Delay (§11)
```

A **template is never the execution record of a historical shipment.** At Shipment Route Confirm, snapshot at minimum: `route_template_id`, `route_template_version`, ordered runtime nodes, node names/types, resolved `location_ref_type`/`location_ref_id` (+ `logistics_location_id`), resolved coordinates, planned cumulative offsets, planned timestamps, carrier/service mapping (`carrier_id`, `transit_type`, `last_mile_delivery`), and origin/destination warehouse identity. **Later template edits never retroactively change a confirmed shipment.** Reroute = new `is_current` version + `supersedes_shipment_route_id`; the prior version is preserved as `superseded`.

## 10. Planned Timeline

**Rule:** `planned_node_at = route_start_base_date + template_node.default_offset_days`, where **`default_offset_days` is CUMULATIVE days from the route start (ETD base), NOT the interval from the previous node** (matches `SHIPMENT_ROUTE_AND_EVENT_SPEC §4.B` and `DATABASE_RELATIONSHIP_MAP §8`).

Example: ETD = 2026-08-01, node `default_offset_days = 11` → planned node date = 2026-08-12.

The spec must define:
- **Timeline base date:** the route start = shipment ETD (or confirmed pickup when present; see §11 basis).
- **Offset basis:** cumulative-from-base (above); inter-node gap is derived, never stored.
- **Timezone:** node timeline is interpreted in the node's `logistics_locations.timezone` when present; otherwise UTC. Display shows the tz used.
- **Date-only vs datetime:** planned node dates are **date-only** unless a schedule/event supplies a datetime; actual events keep datetime + tz (`event_time`, `reported_at`).
- **Schedule source:** planned dates come from template offsets at Confirm (snapshotted into the route version).
- **Version snapshot:** planned timeline is frozen into the `shipment_routes` version; reroute creates a new version.
- **Recalculation trigger:** planned timeline is recomputed only on **reroute (new version)** or an explicit route re-confirm — never silently mutated by a later template edit.

## 11. ETA Runtime

**ETA v1 priority (highest first):**
1. Carrier-provided, trusted `new_eta`.
2. Delay of an actual event vs its matched planned node.
3. Apply the confirmed delay to the remaining nodes (shift the cumulative planned schedule).
4. Schedule + lead time (**only if a schedule source exists — see §12/§13; none exists today**).
5. Actual event + lead time.
6. Shipment ETD / pickup + lead time.
7. `unresolved` when data is insufficient.

**Never fabricate an ETA earlier than the current trusted ETA from a missing/stale event.**

**`eta_source` enum:** `carrier_provided`, `schedule_plus_lead_time`, `actual_event_plus_lead_time`, `shipment_etd_plus_lead_time`, `lead_time_only`, `manual_override`, `unresolved`.

**Each ETA update records:** `previous_eta`, `new_eta`, `eta_source`, `reason`, `source_record_id`, `source_timestamp`, `calculated_at`, `calculated_by` (user/system), `confidence`, `manual_override` flag. A manual ETA override **requires a reason** (§21).

## 12. ETA When Schedule Data Is Missing

A missing carrier service schedule does **not** mean ETA cannot be computed.

- **With a schedule source (FUTURE / CONDITIONAL — no schedule table exists today, see §13):** Cargo Ready → next cutoff → scheduled departure → + lead time → ETA.
- **Without a schedule (the CURRENT canonical reality):** compute from `carrier_lead_times` plus the shipment's known dates:
  - **Lead-time basis (canonical, narrative — there is no `lead_time_basis` column today):** lead time is measured **Ship Confirm / Carrier Handover → Destination Delivered**, calendar days (`CARRIER_AND_ROUTE_SPEC §4A`). Receiving/inspection is a separate buffer, not part of transit lead time.
  - Add `carrier_lead_times.avg_days` (min/max available for optimistic/conservative bounds) to the route start base date.
  - **Do not** auto-derive a next cutoff and **do not** invent a fixed departure when no schedule exists.
  - May use the shipment's already-entered ETD / pickup date as the base.
  - ETA `confidence` is **lower**; `eta_source = lead_time_only` or `shipment_etd_plus_lead_time`.

> **PROPOSED (not canonical yet):** a configurable `lead_time_basis` (enum `cargo_ready` / `carrier_pickup` / `scheduled_departure` / `actual_departure`) and a `carrier_service_schedules` table would enable the schedule path. **Neither exists** in the current carrier model; both are listed as dependencies in §25/§26. Until added, ETA operates schedule-free with the fixed basis above.

## 13. Carrier Data Relationships (no `carrier_services`)

**Do NOT add `carrier_services`.** Shipping-method normalization is already canonical (`CARRIER_AND_ROUTE_SPEC §4.5`):
- **`transit_type` enum:** `air`, `sea`, `sea_express`, `rail`, `truck`.
- **`last_mile_delivery` enum:** `parcel`, `truck` (note: `parcel` is a last-mile value, **not** a `transit_type`).
- `shipping_method` is a **legacy display alias** only; matching uses `transit_type`.

**Canonical carrier tables (independent; NOT one-to-one; joined by business key, not FK):**
- `carriers` — **IMPLEMENTED**
- `carrier_rate_cards` — **IMPLEMENTED**
- `carrier_lead_times` — **IMPLEMENTED** (columns: `lead_time_id`, `carrier_id`, `origin_country`, `destination_country`, `shipping_method`, `last_mile_delivery`, `min_days`, `max_days`, `avg_days`; **no `lead_time_basis` column**)
- `shipment_route_templates` — owner-maintained reference (a **route** table, not a carrier table)

> **`carrier_service_schedules` does NOT exist** in the canonical carrier model (confirmed absent in spec + code). This spec does **not** create it. Any schedule-based ETA path (§12) is future/conditional on that table being added by the Carrier authority.

**Allowed independence (no hard block; surface as Data Health):** Lead Time without Rate Card; Lead Time without Schedule; Rate Card without Lead Time; Route without full carrier reference. Missing links render **blank — no fabricated fallback**.

**Data Health items the map/ETA MAY surface (map-layer projection categories — only `quote_data_incomplete`, `late_risk`, `overlap` exist as canonical codes today; the rest are proposed map categories, not yet machine codes):**
`route_without_lead_time` (High — no auto ETA), `lead_time_without_schedule` (Info — usually not an error), `rate_card_without_lead_time` (Info/Warning), `schedule_without_lead_time` (Warning), `route_without_location_mapping` (Warning/High per node impact), `service_code_not_normalized` (Warning), `unresolved_runtime_node` (Warning/High), `shipment_without_route` (Warning), `shipment_without_eta_basis` (Warning).

The map **only references** these carrier tables — it is **never** a carrier data-management interface.

## 14. Warehouse & Location Rules

**Canonical `warehouses` address model (owned by `SHIPMENT_CENTER_SPEC §22`/`WAREHOUSE_OPERATIONS_SPEC`; referenced here, not redefined):** `country`, `state`, `city`, `postal_code`, `address` are the current fields; `warehouses` is the single source of truth for warehouse address. `inventory_owner_company`, `default_distance_unit`, `default_mass_unit` are **not present** in the canonical/runtime schema (nothing to remove).

> **Cross-spec proposal (owner decision this round; sync target = Warehouse/Shipment specs, §26):** adopt `subdivision_code` (full ISO 3166-2, e.g. `US-CA`, `CA-ON`, `GB-ENG`, `AU-NSW`, `JP-13`) and `district` on `warehouses`, with `state` holding the readable full name. These two fields are **not** in the `warehouses` schema today; this spec records the decision and defers the actual field addition to the Warehouse authority (map does not migrate warehouse schema).

**Aggregate / addressless national FBA warehouses** (`WH-*-FBA-AMAZON`): legacy transitional rows — **keep, do not delete/migrate; mark inactive after verification; remain resolvable for history; new transactions must use physical `warehouse_id`** (`SHIPMENT_CENTER_SPEC §22.0 J/K`). For the map they:
- must **not** create a `logistics_locations` row,
- must **not** be a real shipment destination pin,
- should be treated as `legacy_aggregate` / `retired` / `non-selectable` (the proposed `is_selectable_for_shipment` flag governs eligibility once implemented).

**The map must never fabricate a marker for an addressless aggregate warehouse** — no coordinate → Unresolved + Data Health, never an invented pin.

## 15. Shipment Status ↔ Inventory Boundary (Delivered ≠ Received)

**Carrier Delivered ≠ Warehouse Received (canonical, `DATABASE_RELATIONSHIP_MAP §6.0`).**

Carrier Delivered / Confirm Arrival may update **only:** shipment status, route progress, shipment event, actual arrival, current location, ETA/timeline, delivery evidence. It must **not** increase overseas inventory, create an inventory movement, complete a receipt, or close an inbound operation.

**Correct flow:**
```
Carrier Delivered
  → Shipment Timeline updated (status/arrival/event)
  → Open Inbound Receipt (separate action, Overseas Inbound module)
  → Receipt Confirmation
  → Overseas Inventory updated
  → overseas_inventory_movements created
  → Inbound Operation completed
```

On the map, **Confirm Arrival** and **Open Inbound Receipt** are **different actions**. Only a formal Receipt Confirmation increases overseas inventory. Show **"Delivered — Awaiting Receipt"** between the two.

## 16. Update Shipment from the Global Map (Detail Drawer)

The map is a primary Shipment-update entry. Clicking a **Shipment marker, route line, timeline item, Shipment list row, or a Risk/Delayed card** opens the **Shipment Detail Drawer**. The drawer must present:

1. **Shipment Identity** — shipment_id, shipment_number, company, origin, destination, carrier, shipping_method/transit_type, route, tracking/reference, current status.
2. **Current Logistics State** — current node, last confirmed event, planned ETA, current ETA, delay days, ETA source, ETA confidence, current position type (§8), last updated time, event source.
3. **Shipment Progress** — planned timeline, actual timeline, completed nodes, current node, remaining nodes, exception/delay indicator.
4. **Shipment Content Summary** — SKU count, carton count, total quantity, weight/volume (if available), PO / Request Order references, origin warehouse, destination warehouse.
5. **Documents** — document list, missing-document warning, view document, upload/replace entry, document status (via Document Engine — spec-only; §3).
6. **Audit Summary** — last updated by, last updated at, last event source, recent shipment changes, ETA change history.

The drawer is available **read-only** to users without update permission (§20).

## 17. Map Drawer Actions (per-action contract)

> **Scope narrowed by §2.1 (v2.1).** This round's **allowed** action scope is exactly the six lifecycle actions in §2.1 (Update Status · Record Event · Advance Route Progress · Confirm Arrival/Delivered · Open Inbound Receipt · Receipt Confirmation). The additional entries listed below (Edit Shipment, Update ETD/ETA, Assign/Change/Reroute, Upload/Replace Documents) are **design targets behind separate gated permissions that are NOT default-open** — they are documented here for the full future contract but are **out of the current allowed scope**. Execution fields stay read-only; no inline field editing.

**Action entry points (full future set; current allowed subset per §2.1):** Edit Shipment · Update Shipment Status · Add Manual Event · Add/Sync Carrier Event · Update ETD · Update ETA · Assign Route · Change Route · Reroute Shipment · Confirm Pickup · Confirm Departure · Confirm Arrival · Open Inbound Receipt · Open Shipment Detail · View Documents · Upload/Replace Documents · View Audit History.

**Actions are shown/enabled/disabled dynamically** by: shipment status, lifecycle stage, user role, company scope, route availability, event history, and inbound/receipt state. **No shipment may unconditionally show every action button.**

**Every action defines (at minimum):** entry condition · required permission · validation · target handler (§3) · affected entity · audit requirement · UI success state · UI error state · map refresh behavior.

Representative contracts (full set maintained in the drawer implementation; all route to §3 handlers):

| Action | Entry condition | Permission | Target handler | Affected entity | Runtime status |
|---|---|---|---|---|---|
| Edit Shipment | status editable (draft/active) | `shipment.update` | `updateShipment` | `shipments` | **Ready** |
| Update Status | valid next status per lifecycle | `shipment.status.update` | `updateShipment` (`status`) | `shipments` | **Ready** |
| Update ETD/ETA | shipment exists; override reason if manual | `shipment.eta.override` | `updateShipment` | `shipments` | **Ready** |
| Add Manual / Carrier Event | route/event runtime available | `shipment.event.create` | `shipment_events` append | `shipment_events` | **Blocked (P1-E)** |
| Assign / Change / Reroute | route runtime available; reroute needs reason | `shipment.route.assign` / `shipment.reroute` | `shipment_routes` version | `shipment_routes` | **Blocked (P1-E)** |
| Confirm Pickup/Departure/Arrival | preceding lifecycle reached | `shipment.status.update` (+`event.create` for the event) | `updateShipment` status (+ event when P1-E ready) | `shipments` (+events) | **Ready (status)** / event **Blocked** |
| Open Inbound Receipt | Delivered/Arrived + qualifying overseas destination | `inbound.receipt.open` | Overseas Inbound module | inbound operation | **Blocked (not built)** |
| View / Upload / Replace Documents | shipment exists | `shipment.document.manage` | Document Engine | `generated_documents` | **Blocked (not built)** |
| View Audit History | shipment exists | `shipment.audit.view` | read model | — | Ready (read) |

Blocked actions render disabled with a "runtime not yet available" state or Preview only — never a fake success (§21, §27).

## 18. Update Shipment Workspace (form + change preview)

From the Detail Drawer → **Update Shipment** → the **Update Shipment Workspace/Form** with at least these blocks:

1. **Basic Information** — carrier, carrier service / shipping method (`transit_type` + `last_mile_delivery`), tracking number, origin warehouse, destination warehouse, shipment reference, note.
2. **Schedule & ETA** — cargo ready date, planned pickup, actual pickup, planned ETD, actual departure, planned ETA, current ETA, actual arrival, ETA source, ETA override reason.
3. **Route** — current route template, runtime route, current node, route assignment, reroute reason, affected-remaining-nodes preview.
4. **Status & Event** — new status, event type, event timestamp, event source, event location, delay reason, exception note.
5. **Documents** — view existing files, upload document, replace document, missing-document status.
6. **Change Preview (before save)** — previous value → new value; affected ETA; affected route nodes; affected shipment status; whether the receipt workflow becomes available; whether additional confirmation is required.

All updates preserve an **audit trail** (§21). Fields that map to spec-only runtime (route/event/document) are shown but disabled/Preview until those handlers exist.

## 19. Map UI Specification

1. **Global 3D Map Canvas** — shipment markers; warehouse/factory markers; port/airport/hub markers; route lines; planned vs actual position; delayed/risk styling (never colour-only); cluster behaviour at low zoom; zoom/focus/reset.
2. **Shipment List / Control Panel** — search; filters: company, origin country, destination country, carrier, transit type / shipping method, shipment status, risk level, ETA range, Delayed only, Inbound-receipt pending, Unresolved location.
3. **KPI Summary** — active shipments; in transit; delayed; arriving soon; delivered pending receipt; unresolved location; missing ETA. Each KPI filters the same scoped read model.
4. **Shipment Detail Drawer** — §16 (Identity, Timeline, Route, ETA, Content, Documents, Audit, Actions).
5. **Timeline View** — planned date; actual date; current node; completed; delayed; upcoming; unresolved.
6. **UI States (all distinct):** loading · empty · error · partial data · permission denied · unresolved coordinates · no matching route · stale event · ETA unavailable · handler update success · handler update failure · conflict/concurrent update.

Visual semantics: completed solid; current emphasized/animated (reduced-motion fallback); future muted; delay/exception red + icon; approximate hollow/dotted; verified solid; actual event a separate marker; Delivered-but-not-Received = destination reached + receipt warning. A list/table alternative is always available.

## 20. Permissions

Map view and Shipment update are **separately gated**:
`map.view` · `shipment.view` · `shipment.update` · `shipment.status.update` · `shipment.event.create` · `shipment.route.assign` · `shipment.reroute` · `shipment.eta.override` · `shipment.document.manage` · `inbound.receipt.open` · `inbound.receipt.confirm` · `shipment.audit.view`.

> **v2.1 default-open set (this round):** only `map.view`, `shipment.view`, `shipment.status.update`, `shipment.event.create`, `inbound.receipt.open`, `inbound.receipt.confirm`, `shipment.audit.view` back the allowed lifecycle actions (§2.1). `shipment.update`, `shipment.route.assign`, `shipment.reroute`, `shipment.eta.override`, `shipment.document.manage` are defined but **must NOT be default-open** — the map having an action entry never implies these broad capabilities are granted.

Also enforced: user role · company scope · marketplace/country scope where applicable · shipment lifecycle restrictions. A user without update permission still gets the **read-only drawer** but cannot see/execute Update actions. (RBAC itself is Phase-2 — `SYSTEM_ROADMAP` P2-A; until then the map must at minimum not expose write actions where the future permission would deny them.)

## 21. Audit, Concurrency & Validation

Every map-triggered Shipment update must:
1. record actor, timestamp, source;
2. tag `source = global_shipment_map`;
3. store previous and new values;
4. store the change reason;
5. **require a reason** for ETA override, Route Change, and Reroute;
6. use **optimistic concurrency / version check**;
7. on a concurrent update, show a **conflict** (never silently overwrite);
8. on handler success, refresh Drawer, Marker, Route, Timeline, and KPIs;
9. on handler failure, preserve user input and show an actionable error;
10. never bypass the authoritative module's Shipment lifecycle validation.

> **Concurrency dependency (audit finding):** `shipments` has **no `version`/`row_version`/ETag field today** and `updateShipment` is currently last-write-wins. Requirement #6/#7 therefore depends on adding an optimistic-concurrency guard (e.g. `updated_at` compare-and-set or a `row_version`) to the Shipment authority. Listed in §25/§26 as a prerequisite for map-driven writes; the map must not implement its own concurrency layer.

## 22. Map Read Model & API Contract

`GET /api/shipment-map` — **read-only**, server-side scoped. Request scope: `company, origin_country, destination_country, destination_region, warehouse_id, shipment_status, carrier_id, transit_type, last_mile_delivery, eta_from, eta_to, severity, shipment_id`. Response: `meta, summary, locations, shipments[] { shipment, route_version, planned_nodes[], latest_event, event_timeline[], current_projection, eta_projection, receipt_state, exceptions[] }`.

Rules: one coherent `as_of`; explicit route version; no template treated as live state; no N+1 per shipment; stale-request protection; progressive loading allowed; cache rebuildable; **no mutation through this endpoint**. All mutations go through the §3 canonical handlers.

## 23. UI & Technical Requirements
WebGL detection + 2D/list fallback; respect `prefers-reduced-motion`; keyboard-accessible filters + list; non-map table/list alternative; do not load all history initially; cluster + simplify by zoom; cancel stale requests on filter change; escape all external labels/payload; **no provider token in source control**; verify provider/token/tile-licensing/geocoder-persistence-rights/attribution before deployment; if geocoded results are stored, the provider's permanent-storage terms must permit it.

## 24. Data Quality & Verification
- **Minimum map-ready rule:** a planned node is map-ready if it references a **verified** `logistics_locations` row, OR has an approved inline template coordinate + accuracy (legacy fallback), OR is explicitly `virtual`/approximate. Otherwise **unresolved → Data Health**.
- **Import/maintenance template** (`logistics_locations_import_template.csv`): columns per §5.1; workflow **Preview → Validate → Apply** with duplicate, ambiguity, range, FK, and coordinate-source checks.

## 25. Implementation Readiness Matrix & Milestones

| # | Capability | Readiness | Blocking dependency |
|---|---|---|---|
| 1 | Map information architecture | **Ready** (after this spec) | — |
| 2 | `logistics_locations` schema + import | **Ready to begin** | additive table; redeploy |
| 3 | Warehouse/Factory seed | **Partial** | warehouses have **no coordinates** today; owner-provided coords required. (Owner states ~352 physical warehouse rows exist; **not verifiable in-repo** — treat as owner-asserted. Aggregate/addressless rows excluded.) |
| 4 | Complete route-node location mapping | **Not ready** | needs verified ports, airports, rail terminals, border gateways, carrier hubs + node classification |
| 5 | Shipment route runtime | **Blocked (P1-E, not built)** | `shipment_routes`/`_nodes`/`shipment_events` unimplemented |
| 6 | ETA / Timeline runtime | **Blocked** | depends on #5 + events + lead-time basis + (optional) schedules |
| 7 | Map Read Model | **Blocked** | depends on #5, #6; current adapter is whole-table GET only (scoped read model is new) |
| 8 | Full interactive map | **By milestone** | full production behaviour depends on #4–#7 + concurrency guard (§21) |

**Milestones:**
- **M1** — Map shell; filters; warehouse/factory locations; shipment list; **mock/preview** drawer. *(Location master + shell can start now.)*
- **M2** — Runtime route snapshot; runtime nodes; shipment events; Map Read Model.
- **M3** — ETA/Timeline calc; current position; delay/risk.
- **M4** — Update-Shipment actions; formal Shipment-handler integration; permissions; audit; conflict handling (**requires the §21 concurrency guard**).
- **M5** — Inbound Receipt entry; documents; Data Health; production validation.

**Update-Shipment UI may ship as Preview first, but must NOT claim runtime mutation is complete unless the canonical handler, DB, audit, permissions, and tests are all connected.**

## 26. Cross-Spec Sync & Conflicts

**Docs that must be synced (NOT edited this round — sync deferred to their owners):**
- `SHIPMENT_CENTER_SPEC.md` — canonical handler set (`updateShipment`, `createShipmentFromPlan`); structured `origin_warehouse_id`/`destination_warehouse_id` are spec-only (§23.3) — map origin resolution depends on them; add an optimistic-concurrency field for map writes (§21).
- `SHIPMENT_ROUTE_AND_EVENT_SPEC.md` — route/event runtime P1-E; template node inline lat/long now **deprecated** in favour of `logistics_location_id` (add `location_resolution_type`/`location_ref_*` to template nodes).
- `CARRIER_AND_ROUTE_SPEC.md` — confirm **no `carrier_services`**; `carrier_service_schedules` + `lead_time_basis` are **proposed/absent**; `transit_type`/`last_mile_delivery` enums are canonical.
- `OVERSEAS_INBOUND_SPEC.md` — Open Inbound Receipt is the only inventory-increase path (Delivered ≠ Received).
- `DOCUMENT_GENERATION_SYSTEM_SPEC.md` — document actions use `generated_documents` (`related_entity_type='shipment'`); no `updateShipmentDocuments` handler exists.
- `WAREHOUSE_OPERATIONS_SPEC.md` — **conflict:** line 210 says "Do NOT make the map the primary operation interface"; §1 here repositions the map as primary visual monitoring + action entry (still non-authoritative). Owner sync required. Also the proposed `subdivision_code`/`district` warehouse fields (§14).
- `SYSTEM_ROADMAP.md` — **conflict:** World Map is Phase-2 (P2-A); this spec allows M1 (location master + map shell) to begin in Phase 1. Owner sync required.
- `DATABASE_RELATIONSHIP_MAP.md` — §6.0 Delivered ≠ Received (aligned); route runtime P1-E (aligned).
- `SHIPMENT_DATABASE_SCHEMA.md` — **superseded route/event model** (one-row-per-node `shipment_routes`; single `source` `shipment_events`) conflicts with the SSOT `SHIPMENT_ROUTE_AND_EVENT_SPEC.md`; annotate it SUPERSEDED (owner).
- `project-current-state.md` — dated entry added this round.

**This spec must not redefine, in a conflicting way, the Shipment lifecycle, inventory-movement, or document authority owned by the specs above.**

## 27. Prohibited This Round
1. No `carrier_services` table. 2. Map API is **not** a mutation API. 3. Map never directly updates inventory. 4. Carrier Delivered ≠ Warehouse Received. 5. No second latitude/longitude authority on template nodes (inline coords deprecated, not a new authority). 6. Runtime-node coordinate snapshot is **retained**. 7. No fabricated unresolved location, ETA, or GPS position. 8. No Architecture-Review / meaning-table substituting for real UI spec. 9. No claim that UI/Handler/DB/movement/test is complete without evidence. 10. No editing of unrelated finalized specs.

## 28. Decision Log
- 2026-07-23 (v1): adopt `logistics_locations`; WGS84/SRID 4326 (lon, lat); master + template snapshot + runtime snapshot + event layers; approximate/virtual must be labeled.
- **2026-07-23 (v2.0):** map repositioned to **primary visual monitoring + primary Shipment action entry** (still non-authoritative) — supersedes `WAREHOUSE_OPERATIONS_SPEC:210` + roadmap P2-A framing (sync required).
- **2026-07-23 (v2.0):** every map action bound to a canonical handler (`updateShipment` / `createShipmentFromPlan`) or a named spec-only runtime concept; **no parallel handler invented**; Map API stays read-only.
- **2026-07-23 (v2.0):** template-node inline `latitude`/`longitude` **deprecated** as coordinate authority (retained as legacy fallback; owner data never bulk-cleared); `logistics_location_id` + `location_resolution_type {fixed_location, origin_warehouse, destination_warehouse, runtime_event, virtual, unresolved}` + `location_ref_type`/`location_ref_id` are the authority path.
- **2026-07-23 (v2.0):** confirmed **no `carrier_services`**; `carrier_service_schedules` and `lead_time_basis` are **absent** from the canonical carrier model → schedule-based ETA is future/conditional; v1 ETA is schedule-free (lead time + cumulative offset).
- **2026-07-23 (v2.0):** `shipments` has no version field → optimistic-concurrency guard is a **prerequisite** for map-driven writes.
- **2026-07-23 (v2.1):** **Canonical Runtime Mapping Sync PAUSED** until `logistics_locations` finalized; §6/§9/§10–§12 are deferred design targets. Read-only-execution + handler-driven-lifecycle-action rule synced with `SHIPMENT_CENTER_SPEC §5.1`; allowed action scope narrowed to six lifecycle actions (§2.1); broad edit/route/eta/document permissions defined but **not** default-open. Current live `shipment_events` / `shipment_routes` columns recorded as authoritative-for-now (§30). Nodes 0-byte blocker **removed** (400 rows / 32 route IDs received); DE/Belgium + Alashankou/Khorgos flagged **Route Data Review**, not edited (§31).

## 29. External Standards Notes
UN/LOCODE is valid for applicable ports/terminals but does not replace the internal stable ID or facility verification. Geocoding results require explicit accuracy + source tracking; provider terms may restrict permanent storage. WGS84 point construction uses longitude as X, latitude as Y.

## 30. Current Runtime DB Columns (authoritative until Canonical Runtime Mapping Sync)

These are the **current live columns** for the runtime tables the map reads. **Do not add / remove / rename columns this round.** They are sufficient for basic lifecycle events, route progress, position, and world-map display. Field-completeness + the `logistics_locations` FK / coordinate-snapshot mapping (§6/§9) are **deferred to the paused Canonical Runtime Mapping Sync**. The map must **not** create a second set of map tables to read this data, and must **not** implement Event Projection or Location Resolution rules this round.

**`shipment_events` (current):** `shipment_event_id`, `shipment_id`, `shipment_route_id`, `event_sequence`, `event_time`, `event_type`, `event_status`, `location_name`, `country`, `city`, `latitude`, `longitude`, `source`, `source_event_id`, `raw_status`, `note`, `created_by`, `created_at`, `updated_by`, `updated_at`.

**`shipment_routes` (current):** `shipment_route_id`, `shipment_id`, `route_template_id`, `route_template_node_id`, `sequence_no`, `node_type`, `node_code`, `location_ref_type`, `location_ref_id`, `location_name`, `country`, `region`, `city`, `latitude`, `longitude`, `transport_mode`, `planned_event_type`, `planned_arrival_date`, `planned_departure_date`, `actual_arrival_date`, `actual_departure_date`, `status`, `created_at`, `updated_at`.

> Note: this current `shipment_routes` shape is a **one-row-per-node** runtime model (`sequence_no` + per-node location + planned/actual dates + `status`), with `location_ref_type`/`location_ref_id` already reserved as the seam for the future `logistics_locations` FK. The version-header / snapshot semantics in §9 are a **design target**, not a live-column change this round; reconciling the two models is part of the paused Runtime Mapping Sync and the SSOT alignment noted in §26.

## 31. Route Data Review (Nodes received; not edited this round)

**Nodes blocker REMOVED.** The full route-node dataset has been received — **400 rows, 32 Route IDs** — so the Nodes file is **no longer a 0-byte blocker** and no re-supply is requested. This round does **not** modify any route-node data; the items below are logged as **Route Data Review** for a later, separate correction pass (after `logistics_locations` mapping).

- **`SRT-TOP-CN-DE-TR-P-V1`** (DE route, 15 nodes) — review Node 12 `BELGIUM_IMPORT_CUSTOMS` / "Belgium Import Customs" and Node 13 `BELGIUM_CARRIER_HANDOVER` / "Belgium Carrier Handover": confirm whether the real path is **Germany Transit Hub → Belgium Import / Handover → Final Delivery**. If real, keep as-is; if the DE route does not transit Belgium, correct the route nodes in a later pass. **Not changed this round.**
- **Alashankou / Khorgos Gateway** — remains an **unresolved route variant**; the actual gateway must be chosen during `logistics_locations` mapping. **Do not assume a gateway this round.**

## 32. Country Boundary Layer — DEFERRED requirement (F1-7N-FB-4A §I; audited 2026-08-26, NOT implemented)

**Status: DEFERRED. Scoped here for the later visual-unification / globe-material task. Nothing was implemented
this round; no dataset was downloaded and no network dependency was added.**

### 32.1 Audit of what exists today

The globe carries exactly **one** vendored vector dataset: `assets/js/data/world-land-110m.js` — Natural Earth
110m **land outline**, **128 rings / 5,122 points**, simplified to 0.1°, `[lng,lat]` rings, loaded as a
same-origin `<script>` that sets `window.KM_WORLD_LAND`.

- It carries **no per-ring country name, no ISO code and no administrative attribution** — it is a coastline /
  land mask, not an administrative boundary layer.
- It is consumed only by `buildEarthCanvas()` in `assets/js/lib/km-globe.js`, which **rasterizes** it into a
  2048×1024 equirectangular canvas texture. There is **no vector overlay pipeline** on the globe at all.
- Provenance: Natural Earth is **public domain** (no attribution required). That settles the licence for the
  existing asset **only**.

**Conclusion: there is no reusable administrative-boundary asset.** A boundary layer requires a new dataset.

### 32.2 Scoped requirement for the later task

1. **Vector country boundary layer** — rendered as vector geometry, not baked into the earth texture, so boundary
   line weight stays constant on screen as the globe zooms.
2. **Country ISO labels** (`US`, `CN`, `CA`, …) drawn at each country's label point.
3. **Scale-aware label visibility** — a label appears only when its country subtends enough screen area; the set
   is monotonic in zoom (a label that has appeared does not flicker out on a small camera move).
4. **Island label points** — small landmasses get an explicit label anchor rather than a polygon centroid, which
   for archipelagos falls in the sea.
5. **Collision suppression** — overlapping labels are dropped by a deterministic priority (larger subtended area
   first, then ISO code ascending), never by draw order or by a random tie-break.
6. **No coordinate jitter** — labels and boundaries are placed from the dataset's own coordinates. No snapping,
   nudging or per-frame repositioning.
7. **No route/event geometry change** — this layer is presentation only. `shipment_routes`, `shipment_events`,
   marker placement, arc geometry, projection and interaction are untouched, and the current-position authority
   (§ latest event coord → current route node) is unaffected.
8. **Licence / provenance is a hard precondition** — any boundary dataset must be vendored same-origin (the
   `world-land-110m.js` pattern: no runtime CDN, no fetch), and its source, version, simplification tolerance and
   licence must be recorded in this spec before it is added. Natural Earth `ne_110m_admin_0_countries` is the
   obvious candidate on licence grounds (public domain) and is the only one that may be adopted without a further
   licence review.
9. **Compatible with the planned high-resolution globe material upgrade** — the layer must not assume the current
   2048×1024 texture tier. It draws from vector data at render time, so a higher-resolution earth material changes
   nothing about it, and the two changes must be independently revertible.

### 32.3 Explicitly out of scope for that task

Disputed-boundary policy, sub-national (admin-1) boundaries, country fill/choropleth, and any label localisation
beyond the ISO code.
