# DEMO SEED — Shipping Plan / Shipment / On-the-Way Map (F1-7N-FA-4A-DEMO-SEED-SHIPPING-SHIPMENT-MAP-V2)

Controlled, ISOLATED visual-demo dataset for tomorrow's UI demonstration. Tooling: `assets/specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs` (standalone .gs, NOT bundled). Test: `assets/tests/demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js`. **Visual-demo data only — the operational workflow is NOT live-verified.**

## A. Source-of-truth audit (resolved from code, not guessed)

**Six writable table schemas (canonical column constants):** `shipping_plans` = `SHIPPING_PLANS_HEADERS_` (11_shipping_plan_handlers.gs:20); `shipping_plan_lines` = `SHIPPING_PLAN_LINES_HEADERS_` (11_:40); `shipments` = `SHIPMENTS_HEADERS_` (12_shipment_handlers.gs:30); `shipment_lines` = `SHIPMENT_LINES_HEADERS_` (12_:56); `shipment_routes` = live `ROUTE_HEADERS` (22_shipment_dispatch_handlers.gs:180, one row per node, 24 cols); `shipment_events` = `SHIP_EVENT_HEADERS_` (31_shipment_receipt_route_handlers.gs:223, 20 cols; identical to 22_'s `EVENT_HEADERS`).

**PK/FK chain:** `shipping_plans`(PK `shipping_plan_id`) → `shipping_plan_lines`(FK `shipping_plan_id`) → `shipments`(FK `shipping_plan_id`) → `shipment_lines`(FK `shipment_id`, plus 1:1 `shipping_plan_line_id`) → `shipment_routes`(FK `shipment_id`; template lineage `route_template_id`/`route_template_node_id`; location seam `location_ref_type`/`location_ref_id`) → `shipment_events`(FK `shipment_id`, nullable FK `shipment_route_id`).

**Status/event enums (canonical, consumed by the UI):**
- `shipping_plans.status`: `draft, pending_approval, approved, rejected, cancelled, completed` (11_).
- `shipments.status` (vocabulary in `assets/js/pages/shipping-history.js`): Draft page `{draft, ready_to_ship, shipped}`; Overview page `{shipped, in_transit, arrived, received, closed}`; flow `draft→ready_to_ship→shipped→in_transit→arrived→received→closed`.
- On-the-Way Map (`assets/js/pages/global-logistics-map.js`): `MOVING_SET={shipped,in_transit}`, `DELIVERED_SET={received,completed,delivered,closed}`, `EXCLUDE={cancelled}` + hard-exclude `closed`, `RUNTIME_SET` admits `{shipped,in_transit,arrived,partial(ly)_received,received,completed,delivered}`.
- `shipment_events.event_type` (emitted): `departed_origin` (event_status `completed`, 22_:20/217), `route_node_reached` (`current`, 31_:660), `received`/`partial_receipt` (31_:186/401). `planned_event_type` on template nodes is free-text, passed verbatim (no code enum).

**On-the-Way Map:** read-driven; backend `handleShipmentWorkspaceGet_` (57_api_v1_shipment_workspace.gs:241) returns flat tables (no server join). Frontend joins in `buildReadModel`. **Coordinate precedence** (`resolveCurrentPosition`, global-logistics-map.js:253): latest `shipment_events` coord → `shipment_routes` current node → last completed node → node `location_ref_id` → `logistics_locations`; placement fallback = destination-warehouse location → origin node → pending; `validCoord` rejects non-number/out-of-range/(0,0). **Node→location join key:** `shipment_routes.location_ref_id` → `logistics_locations.logistics_location_id` (by id value); template preview uses `shipment_route_template_nodes.logistics_location_id`. Node ordering = `sequence_no`; `node_code` is display-only. Current/completed/future node = `shipment_routes.status` via `nodeStatusClass`. Shipment status = `shipments.status`. Marker = resolved position. **No numeric progress field exists** (qualitative via node statuses + arc). ETA = `shipments.eta` (`YYYY-MM-DD`). Map does not hide delivered/received (keeps them, `delivered` flag suppresses moving), but excludes `cancelled`/`closed`/no-runtime-signal.

## B/C. Isolated demo dataset

All ids begin `DEMO-20260824-` and are fully deterministic (no UUID). Three ACTIVE existing route templates are selected at runtime (preferring US West/Central/East; the richest template → the primary in-transit shipment). Every map-visible node resolves to an existing `logistics_locations` row via `logistics_location_id`; coordinates come from that master (never manufactured). Missing node/location/coordinate → preflight fails closed.

- **3 shipping plans** — distinct statuses `pending_approval` / `approved` / `completed`; 2–3 `shipping_plan_lines` each (existing active SKUs by reference).
- **3 shipments** — `shipped` (origin/pre-departure), `in_transit` (**PRIMARY map record**), `received` (delivered). Linked to their demo plan via `shipping_plan_id` (+ plan `transferred_shipment_id`). 2–3 `shipment_lines` each, `shipment_qty` == the linked `shipping_plan_line.approved_qty`.
- **shipment_routes** — the full ordered node path of the selected template (`sequence_no`, `node_type`, `node_code`, `route_template_id`/`route_template_node_id` lineage, `location_ref_id` + canonical lat/lng), status `completed`/`current`/`planned`.
- **shipment_events** — truthful chronological history only up to the current lifecycle position (never a future/planned node); `event_time` strictly increases by node sequence; latest event agrees with shipment status + current node + marker; `event_type` from the canonical set.
- `DEMO ONLY — DO NOT PROCESS` is stamped in existing `note`/`source` fields (no new column).

## D. Map visual contract
The `in_transit` shipment is the primary demo record: origin + destination markers, ordered path, completed nodes, one current node, remaining planned nodes, latest event text+timestamp, carrier/method, ETA; no duplicate markers (deterministic ids, one event per node up to current); no cross-shipment/route event. The `received` shipment appears in Overview but is flagged delivered (not moving).

## E/F. Write boundary + entrypoints
Writes ONLY the six tables, FK-safe. READ-ONLY: route templates/nodes, logistics_locations, warehouses, SKUs, allocation drafts, factory stock, POs. Never calls a production Submit/create-shipment/dispatch/receive handler; no stock reserve/deduct, no PO consume, no document, no request-order, no K2 write, no carrier API, no notification, no flag change. Rows are inserted directly.

Entrypoints (public): `TEMP_DEMO4A_PREFLIGHT_…` (read-only gate matrix), `TEMP_DEMO4A_DRY_RUN_…` (read-only full plan + `demo_plan_checksum`), `TEMP_DEMO4A_COMMIT_…` (confirmation-checksum constant **left at placeholder → refuses**; ScriptLock + re-gate under lock + FK-safe idempotent insert + verified readback; exact retry → REUSED, 0/0/0/0/0/0 delta), `TEMP_DEMO4A_VALIDATE_…` (read-only PK/FK/chronology/agreement/coords), `TEMP_DEMO4A_CLEAR_…` (**STAGED OFF** behind a separate placeholder token; reverse-FK deletion order; DEMO-id-only; not run).

## G. Deployment
TEMP tool + test + this doc. No bundle rebuild, no 11_/12_/22_/31_/57_/core/frontend change. **APPS_SCRIPT_SYNC_REQUIRED: `TEMP_demo_shipping_shipment_map_seed_v2.gs`.** Both confirmation constants stay at placeholder; COMMIT and CLEAR are NOT run in this task.
