# Shipment Route Template / Route Snapshot / Event Ledger — Domain Spec

**Status:** 🟡 MIXED — **Reference DB (Templates) manually completed by the user; Runtime (Routes/Events) SPEC + DB-MAPPING ONLY.** Field-level SSOT for Route Templates, Template Nodes, per-Shipment Route Snapshots, and the Shipment Event Ledger.
**Last Updated:** 2026-07-22
**Maintained By:** Development Team
**Related:** [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) (§18 — points here; execution truth), [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md) (carrier rate-card matching — distinct from route-template matching), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §8 (relationships), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md).

> **This is the field-level Domain SSOT** for `shipment_route_templates`, `shipment_route_template_nodes`, `shipment_routes`, `shipment_route_nodes`, and `shipment_events`. Architecture specs point here rather than duplicating these schemas.
>
> **Implementation status (2026-07-22):**
> - **`shipment_route_templates` — Reference DB MANUALLY COMPLETED by the user.** Do NOT recreate, re-import, clear, or overwrite. This spec is now **read-only synced** to the live table; where doc and live DB disagree, the **live DB + this instruction win** and the conflict is recorded, never silently overwritten.
> - **`shipment_route_template_nodes` — Reference DB MANUALLY COMPLETED by the user.** Same read-only rule.
> - **`shipment_routes` / `shipment_route_nodes` / `shipment_events` — SPEC + DB-MAPPING ONLY, NOT implemented.** No resolver, generator, event writer, matcher, World Map, polling, projection, receiving, or close is built yet (confirmed: zero references in any `.gs` or `assets/js`). Their build is later Shipment-Runtime scope (Phase 1 P1-E).

---

## 1. Canonical Concepts & Four-Table Authority Split

| Object | Role | Status |
|--------|------|--------|
| **`shipment_route_templates`** | Reusable standard-route **header** + matching conditions (Master / Reference) | ✅ manually completed |
| **`shipment_route_template_nodes`** | Ordered standard **stages** of a template, with cumulative planned offsets (Master / Reference) | ✅ manually completed |
| **`shipment_routes`** | Per-Shipment **route-version execution snapshot** copied from a template at Confirm — one row per route **version** (immutable except projection fields) | 🟡 spec only |
| **`shipment_route_nodes`** | *(optional)* per-Shipment **runtime node snapshot** — the template nodes snapshotted onto the shipment's route version | 🟡 spec only |
| **`shipment_events`** | Append-only **actual event ledger** for one shipment | 🟡 spec only |

```
Template Header + Template Nodes  → standard route blueprint (Reference — COMPLETED)
Shipment Route (version snapshot) → per-shipment execution snapshot of the chosen template
Shipment Route Nodes (optional)   → per-shipment snapshot of the template's nodes
Shipment Events (append-only)     → actual event history
Current status / node / ETA / map → PROJECTION derived from events — never a rewritten current-state row
```

**Authority rules:**
- **`shipments` / `shipment_lines` remain the Execution Truth** and shipment-lifecycle authority. Route/Event records are **enrichment**, never a replacement for `shipments`.
- A **Route Template is a reusable blueprint** — it is **NEVER the live current state of a specific shipment.** The live state of a shipment is `shipments` + its `shipment_routes` snapshot + projected `shipment_events`.
- **Template edits NEVER retroactively rewrite an existing `shipment_routes` snapshot.** A completed shipment keeps the template version it was snapshotted from.
- **Route/Event write failure must not corrupt Shipment execution** — non-blocking enrichment. No Route or Event is required to complete the core Ship action in Phase 1.

**Relationships:**
```
shipment_route_templates 1 ─── N shipment_route_template_nodes
shipment_route_templates 1 ─── N shipment_routes
shipments                1 ─── N shipment_routes          (route versions; exactly one is_current = TRUE)
shipment_routes          1 ─── N shipment_route_nodes     (optional runtime node snapshot)
shipment_routes          1 ─── N shipment_events
shipments                1 ─── N shipment_events
```

---

## 2. Warehouse Region Rule (uses EXISTING field)

**`warehouses.logistics_region` ALREADY EXISTS** — this spec does not add it. Canonical values: `US_WEST` · `US_CENTRAL` · `US_EAST`.

**Resolution path:** `shipments.warehouse_id → warehouses → warehouses.logistics_region → shipment_route_templates.destination_region`.
- **Do NOT create a second Region table** or duplicate the region field.
- Amazon FBA warehouses sharing a region (e.g. ONT8 + LGB8 = `US_WEST`) **share the same Route Template** — do not create one template per warehouse unless the physical route genuinely differs.

---

## 3. Route Template Matching

Selected by: `origin_country` · `destination_country` · `destination_region` · `transit_type` · `last_mile_delivery` · `customs_type` · effective date · `priority`. Optional specificity: `destination_warehouse_id` · `origin_warehouse_id` · `carrier_id`.

**Specificity (destination):** `destination_warehouse_id` exact → `destination_region` → `destination_country`. **Carrier:** carrier-specific → blank (generic). **Then:** effective-date validity → highest `priority` → latest `effective_from` tie-break.
- `carrier_id` NOT required (carriers on the same physical flow share the generic template).
- Effective-date: `effective_from ≤ target AND (effective_to blank OR ≥ target)`; blank `effective_to` = open-ended.
- **Distinct from carrier rate-card matching** (`CARRIER_AND_ROUTE_SPEC.md` §4) — templates = physical path, rate cards = pricing.

---

## 4. Table Schemas

### 4.A `shipment_route_templates` (Reference DB — MANUALLY COMPLETED; read-only synced)
`route_template_id` (PK) · `route_template_name` · `route_version` · `origin_country` · `origin_warehouse_id` · `destination_country` · `destination_region` · `destination_warehouse_id` · `carrier_id` · `transit_type` · `last_mile_delivery` · `customs_type` · `priority` · `is_active` · `effective_from` · `effective_to` · `note` · `created_at` · `updated_at`.
- `carrier_id` nullable = generic route; `destination_warehouse_id` nullable = regional/country route.
- `destination_region` uses the same enum family as `warehouses.logistics_region` (§2).
- **Live table exists (user-maintained).** Any field-name/enum conflict between this doc and the live table is recorded for the owner — **never auto-overwritten.**

### 4.B `shipment_route_template_nodes` (Reference DB — MANUALLY COMPLETED; read-only synced)
`route_template_node_id` (PK) · `route_template_id` (FK) · `node_sequence` · `node_type` · `node_code` · `node_name` · `country` · `region` · `city` · `latitude` · `longitude` · `planned_event_type` · `default_offset_days` · `transport_mode_to_next` · `is_destination_placeholder` · `is_required` · `note` · `created_at` · `updated_at`.
- One template → many **ordered** nodes; `node_sequence` unique within a template.
- **`default_offset_days` — CANONICAL DEFINITION (2026-07-22): CUMULATIVE planned days measured from the Route start (ETD), NOT the interval from the previous node.** e.g. node offsets `0, 2, 5, 20` mean day-0, day-2, day-5, day-20 relative to departure. Planned node dates = `ETD + default_offset_days`. (Inter-node gap, if ever needed, is the difference between consecutive cumulative offsets — it is derived, not stored.)
- Final destination node may set `is_destination_placeholder = TRUE` (resolved to the actual warehouse at generation, §5).

### 4.C `shipment_routes` (per-Shipment route-VERSION execution snapshot — CANONICAL, richer model)
> **SUPERSEDED:** an earlier draft modeled `shipment_routes` as *one row per planned node*. **Canonical model (2026-07-22):** `shipment_routes` is a per-Shipment **route-version header** (one row per route version; per-node detail lives in optional `shipment_route_nodes` §4.D and/or `route_snapshot_json`).

`shipment_route_id` (PK) · `shipment_id` (FK) · `route_template_id` · `route_template_version` · `route_version` · `route_status` · `is_current` · `supersedes_shipment_route_id` · `origin_country` · `origin_warehouse_id` · `destination_country` · `destination_region` · `destination_warehouse_id` · `carrier_id` · `transit_type` · `last_mile_delivery` · `customs_type` · `planned_departure_at` · `actual_departure_at` · `planned_arrival_at` · `current_eta` · `actual_arrival_at` · `current_node_sequence` · `current_node_code` · `current_event_type` · `route_progress_pct` · `route_snapshot_json` · `change_reason` · `note` · `created_by` · `created_at` · `updated_by` · `updated_at`.
- **One row per Shipment per route VERSION.** Template version + key fields are **copied** at Confirm; template lineage retained (`route_template_id` / `route_template_version`).
- **Exactly one `is_current = TRUE` route per shipment** (enforced constraint). A reroute creates a new version and sets `supersedes_shipment_route_id` to the prior one, which becomes `is_current = FALSE` / `route_status = superseded`.
- The destination placeholder is resolved to the **actual `destination_warehouse_id`** at generation.
- **After Confirm/Ship the snapshot is IMMUTABLE except projection fields:** `route_status`, `current_eta`, `actual_departure_at`, `actual_arrival_at`, `current_node_sequence`, `current_node_code`, `current_event_type`, `route_progress_pct`, `updated_*`. Planned fields, template lineage, and `route_snapshot_json` are never rewritten.
- **Template edits NEVER rewrite existing `shipment_routes`.**

### 4.D `shipment_route_nodes` (OPTIONAL per-Shipment runtime node snapshot)
*(Adopted only if per-node rows are needed beyond `route_snapshot_json`.)*
`shipment_route_node_id` (PK) · `shipment_route_id` (FK) · `shipment_id` · `route_template_node_id` · `node_sequence` · `node_type` · `node_code` · `node_name` · `location_ref_type` · `location_ref_id` · `country` · `region` · `city` · `latitude` · `longitude` · `transport_mode` · `planned_event_type` · `planned_arrival_at` · `planned_departure_at` · `actual_arrival_at` · `actual_departure_at` · `node_status` · `created_at` · `updated_at`.
- Snapshotted from `shipment_route_template_nodes` at generation; planned dates from `ETD + default_offset_days` (cumulative). Template lineage retained.
- Same immutability rule: planned fields locked after Ship; only `actual_*` / `node_status` project from events.

### 4.E `shipment_events` (append-only actual ledger — CANONICAL, richer model)
`shipment_event_id` (PK) · `shipment_id` (FK) · `shipment_route_id` · `shipment_route_node_id` · `event_sequence` · `event_type` · `event_status` · `event_time` · `reported_at` · `timezone` · `node_sequence` · `node_type` · `node_code` · `node_name` · `country` · `region` · `city` · `latitude` · `longitude` · `previous_eta` · `new_eta` · `delay_days` · `exception_code` · `exception_severity` · `source_type` · `source_reference` · `source_event_id` · `is_manual` · `is_current_status_event` · `payload_json` · `note` · `created_by` · `created_at`.
- **Append-only.** `source_type` ∈ `system` / `manual` / `carrier_api` / `tracking_api` / `import`.
- **Constraints:** `(source_type, source_event_id)` **UNIQUE** (prevents duplicate API writes); a used Template version is never physically rewritten; corrections/reversals are **new correction/reversal events**, never edits/deletes of prior events.
- `shipment_route_id` / `shipment_route_node_id` nullable — an event unmatched to a planned node is **preserved** (never fabricate a node).
- **Current status/node/ETA/map position are PROJECTED from the latest valid events** — not stored as a row that replaces history. `is_current_status_event` marks the event currently projected as "now".

---

## 5. Route Runtime Lifecycle (planned — P1-E)

### 5.1 Create (at Shipment Confirm)
```
Filter Active Template (§3) → user confirms Route → create shipment_routes version snapshot
  → resolve actual destination_warehouse_id → (optional) snapshot shipment_route_nodes
  → planned timeline = ETD + cumulative default_offset_days → route preview
```
- Draft MAY regenerate before Confirm if route-driving fields change (no duplicate active rows). After Confirm the snapshot is locked.

### 5.2 Execute
```
Carrier API / manual update → append shipment_event (validate order + (source_type,source_event_id) idempotency)
  → project current status / node / ETA → update map + risk flags → notify delay/exception
  → recalculate Qualified-Incoming timing (feeds replenishment)
```

### 5.3 Reroute
```
mark current route SUPERSEDED (is_current=FALSE) → create new route version
  → link supersedes_shipment_route_id → append ROUTE_CHANGED event → continue events on the new route
```
Never overwrite the old route, delete events, or mutate the template.

### 5.4 Delivered ≠ Received (authoritative)
```
DELIVERED (carrier event)  ≠  RECEIVED (warehouse receipt)
Warehouse Receipt Confirmed → RECEIVED event → Inbound Receipt Lines
  → Overseas Inventory Movement → shipment received_qty → Allocation / PO reconciliation
```
**Carrier `delivered` NEVER by itself increases inventory.** Warehouse Receipt is the inventory-increase authority (`OVERSEAS_INBOUND_SPEC.md`, `WAREHOUSE_OPERATIONS_SPEC.md`, `DATABASE_RELATIONSHIP_MAP.md` §6.0). This preserves the Factory/Overseas inventory-domain separation.

### 5.5 ETA authority for Qualified-Incoming (B-4 contract repair, 2026-08-01)
The qualification ETA authority priority (business rule owned by `SUPPLY_PLANNING_CALCULATION_RULES.md` §2F) is: **(1) latest authoritative `shipment_events` ETA projection → (2) formal `shipments.eta` → (3) lead-time estimate.** **Interim Runtime authority:** `shipment_events` (and its ETA projection) is **NOT IMPLEMENTED** (§8/§9 — spec-only, absent from all code); therefore the **active formal ETA source today is `shipments.eta`**, with the lead-time estimate as fallback only. When an authoritative event ETA later exists, a fresh lead-time recomputation must not overwrite it. Qualification uses **ETA ≤ Required-By Date**; missing ETA never qualifies as timely; ETA > Required-By stays visible as **Late Risk** covering 0. The `shipment_events` ETA projection remains **IMPLEMENTATION_REQUIRED** (future P1-E). **Partial / full receipt** (received portion → Current Stock exactly once; residual stays Incoming; single idempotent inventory posting; `received + residual ≤ original`) is owned by the receiving Runtime (`OVERSEAS_INBOUND_SPEC.md` §10) and is likewise **NOT IMPLEMENTED**.

---

## 6. World Map Read Model

Reads `shipments` + `shipment_routes` (+ optional `shipment_route_nodes`) + `shipment_events`.

| Aspect | Source |
|--------|--------|
| Shipment header / status | `shipments` |
| Planned map line | current `shipment_routes` version (+ `shipment_route_nodes` / `route_snapshot_json`) |
| Actual timeline | `shipment_events` |
| Current position / node / ETA | PROJECTION from latest valid events |

- The map reads **Runtime** (Header + current `shipment_route` + latest valid `shipment_event` + node snapshot) — it must **NOT** treat a Route Template as a specific shipment's live truth.
- Event → Shipment Status mapping remains an **Open Decision** (§8).

---

## 7. Illustrative Templates (reference only — the live Reference DB is user-maintained)

The user's live `shipment_route_templates` / `_nodes` are authoritative. The examples below are **illustrative understanding aids only** — not a migration script and not to be written to the live DB. Generic CN→US sea-express templates keyed by `destination_region` (`US_WEST` / `US_CENTRAL` / `US_EAST`) × `last_mile_delivery` (`parcel` / `truck`); nodes: Origin Factory → Export Customs → Origin Port → Ocean Transit → Destination Port → Import Customs → (Last Mile/Transload if applicable) → Destination FBA placeholder. **Do not invent official Amazon addresses/coordinates.**

---

## 8. Open Decisions (not decided here)
Canonical `event_type` enum · Event → Shipment Status mapping · route revision strategy after Ship · projection sync vs async · manual event correction/void strategy · carrier API provider · polling schedule · receiving/close status behavior · exact Ship transaction relationship · exact coordinates · delay/exception thresholds.

---

## 9. Decision Log
- **2026-07-22 (this sync):** (1) `shipment_route_templates` + `shipment_route_template_nodes` recorded as **Reference DB manually completed by the user** (read-only synced; not recreated). (2) `default_offset_days` defined as **cumulative days from route start** (not inter-node interval). (3) `shipment_routes` canonicalized as a **per-shipment route-VERSION header** (richer schema: `route_version`/`route_status`/`is_current`/`supersedes_shipment_route_id`/projection fields/`route_snapshot_json`) — supersedes the earlier one-row-per-node model; per-node detail moved to optional `shipment_route_nodes`. (4) `shipment_events` enriched with the fuller field list + `(source_type, source_event_id)` uniqueness, single-`is_current`-route rule, and append-only correction/reversal. (5) `shipment_routes` / `shipment_route_nodes` / `shipment_events` remain **spec-only / NOT implemented** (confirmed absent from all code); build = Phase-1 P1-E. (6) **Delivered ≠ Received** reaffirmed.

---

**Shipment Route & Event Domain Spec — Templates = Reference DB manually completed (read-only synced); Route/Event Runtime = SPEC + DB-MAPPING ONLY. No runtime, no UI, no DB migration, no live-DB overwrite by this task.**

**End of Document**
