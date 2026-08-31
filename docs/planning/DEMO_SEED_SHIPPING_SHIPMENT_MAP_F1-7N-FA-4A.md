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

---

## V3 — Live-readback hardening (F1-7N-FA-4A-...-V3-LIVE-READBACK-HARDENING, 2026-08-23)

Hardens `TEMP_demo_shipping_shipment_map_seed_v2.gs` + its test. No production code, no master, no push/deploy; both confirmation constants remain placeholders; COMMIT/CLEAR not run.

- **A/B — exact existing-state classification.** `DEMO4A_classifyState_` compares the canonical projection of every seed-owned field against the live row (per-row + per-table checksums, exact mismatched fields, duplicate PK counts) and returns exactly one of `ABSENT_ALL` / `PRESENT_EXACT_ALL` / `PARTIAL_PRESENT` / `CONTENT_DRIFT` / `DUPLICATE_DEMO_ID`. COMMIT inserts ONLY for `ABSENT_ALL`, REUSEs (zero write) ONLY for `PRESENT_EXACT_ALL`, and refuses the other three before any mutation. "PK exists" is never sufficient REUSE evidence.
- **C — live-row validator.** `DEMO4A_validateLiveRows_` runs every check against actual live rows: exact PK once, exact content checksum (must be PRESENT_EXACT_ALL), live child FK → live parent PK, live `shipment_qty` == live linked plan-line `approved_qty`, live `shipment_total_qty` == Σ live line qty, live route lineage/sequence/status/coordinates, live event FK + chronology + latest-event agreement with live shipment status/current node, no event on a live planned node, UI visibility from live status. `DEMO_SEED_VALIDATED` is unreachable from PK presence alone.
- **D — real SKU/scope authority.** `DEMO4A_resolveScopeAndSkus_` joins `marketplace_skus` ⋈ `sku_details` (active only) to derive a real company/country/marketplace scope + exact `{sku, site_sku}` pairs (no fabricated `sku+'-US'`). `INSUFFICIENT_ACTIVE_MARKETPLACE_SKUS` when < 2 joined active pairs. Masters are never modified.
- **E — distinct template selection.** `DEMO4A_selectTemplates_` picks ONE fully-resolvable active template per US West/Central/East (`region_selection_mode = DISTINCT_WCE`). If the three regions cannot all resolve, a **truthful documented fallback** selects the top-3 richest distinct templates and reports `region_selection_mode = FALLBACK_TRUTHFUL_TOP3` with the actual regions (never falsely labelled W/C/E); < 3 qualifying templates fails closed. The richest route is the PRIMARY in-transit record.
- **F — dynamic counts.** DRY_RUN reports actual nodes/route rows/event rows per shipment + six-table totals; the plan checksum binds these exact dynamic rows.
- **G — event semantics.** Canonical `shipment_events.event_type` (`departed_origin`/`route_node_reached`/`received`; `partial_receipt` reserved). The template free-text `planned_event_type` is preserved on `shipment_routes` and reported via an explicit `route_planned_to_recorded_event_map`, never claimed equal to the recorded `event_type`.
- **H — partial-write recovery.** COMMIT writes a durable seed journal (checksum + ABSENT_ALL proof + every intended id) to a Script Property and verifies readback BEFORE the first insert; it tracks exactly which ids this execution inserts and, on any append/readback failure, removes ONLY those ids in reverse-FK order (`DEMO4A_rollbackPlan_` + `DEMO4A_deleteRowsByPk_`), verifies rollback, and returns `COMMIT_FAILED_ROLLED_BACK` / `COMMIT_FAILED_ROLLBACK_UNVERIFIED`. Pre-existing rows are never removed.
- **I — CLEAR fully implemented, staged OFF.** Clears only when PRESENT_EXACT_ALL, no non-demo row references any demo id (`DEMO4A_nonDemoReferences_`), the journal seed checksum still matches, and the exact clear token equals the seed `demo_plan_checksum`; deletes in reverse-FK order and verifies. Any drift/reference/duplicate refuses without deletion. Disarmed by the placeholder token in this task.
- **J — tests.** `demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js` rewritten to 72/0 covering all 14 required proofs. Full sweep = known 4-test baseline, 0 new. APPS_SCRIPT_SYNC_REQUIRED: `TEMP_demo_shipping_shipment_map_seed_v2.gs`.

## V3A — Atomic rollback / journal / scope / external-reference closure (F1-7N-FA-4A-...-V3A-ATOMIC-ROLLBACK-CLOSURE, 2026-08-24)

Continues the DEMO-4A seed hardening on `TEMP_demo_shipping_shipment_map_seed_v2.gs` + its test. No production code, no master, no push/deploy; both confirmation constants remain placeholders; COMMIT/CLEAR not run.

- **A — post-write fail-closed rollback.** `inserted` + `phase` are tracked in the COMMIT's OUTER scope; a single unified catch rolls back exactly this execution's inserts (via `DEMO4A_rollbackInserted_` → reverse-FK `DEMO4A_deleteRowsByPk_` + flush + verify-absent) on ANY post-insert failure — a non-`PRESENT_EXACT_ALL` final classification (now THROWN), or an exception in classification/checksum/output/readback. Insert-phase failure → `COMMIT_FAILED_ROLLED_BACK` / `_ROLLBACK_UNVERIFIED`; post-check failure → `COMMIT_FAILED_POSTCHECK_ROLLED_BACK` / `_POSTCHECK_ROLLBACK_UNVERIFIED`. **`COMMITTED_UNVERIFIED` is eliminated** — rows are never left behind.
- **B — durable journal integrity.** `DEMO4A_buildJournal_` emits a fixed-field-order journal (version `V3A`, plan checksum, ABSENT_ALL proof, exact intended ids for all six tables, scope, creation marker, `journal_integrity_checksum`). Before the first write, COMMIT `setProperty` once, reads back, and `DEMO4A_verifyJournal_` validates byte-equivalent canonical content AND the recomputed integrity checksum (checksum-only readback is insufficient). Any failure → `COMMIT_FAILED_JOURNAL_UNVERIFIED` with zero table writes. CLEAR uses the same full integrity check.
- **C — real scope authority (no fallback).** `DEMO4A_resolveScopeAndSkus_` requires every canonical field on the `marketplace_skus` row (company, country, marketplace, sku, site_sku) with NO default fallback for a missing company/country, plus an active master SKU; fewer than two eligible pairs in any single scope → `INSUFFICIENT_ACTIVE_MARKETPLACE_SKUS`. `DEMO4A_activeFlag_` supports boolean-ish `is_active` and an explicit `status === 'active'`, and never treats an unrelated arbitrary string as active.
- **D — complete external-reference audit for CLEAR.** Repo-audited downstream authorities carrying any of the six demo id types (`shipment_line_allocations.shipment_line_id`, `generated_documents.related_entity_id`, `shipment_final_output_snapshots.shipment_id`, `shipment_final_output_lines.{shipment_id,shipment_line_id}`, `shipment_final_output_line_pos.{shipment_id,shipment_line_id}`, `overseas_inventory_movements.reference_id`) are captured in `DEMO4A_EXTERNAL_REF_`. CLEAR scans these (read-only, `DEMO4A_externalReferences_`) in addition to the six-table FK scan; ANY reference to a demo id → `CLEAR_REFUSED_EXTERNAL_REFERENCE`. The six demo tables are NOT assumed to be the complete downstream universe. CLEAR remains staged OFF.
- **E — tests.** `demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js` (108/0) covering all 12 V3A proofs. Full sweep = known 4-test baseline, 0 new. APPS_SCRIPT_SYNC_REQUIRED: `TEMP_demo_shipping_shipment_map_seed_v2.gs`.

## V3B — F1-7N-FA-4A-DEMO-SEED-MAP-V3B-LIVE-MASTER-JOIN-ALIGNMENT

Aligns the demo seed with the canonical live `shipping_plan_lines` schema and the REAL route template-node / logistics-location / map resolution authority (the previous resolver required `node.logistics_location_id` + a location coordinate lookup and qualified 0 of 32 templates).

- **A — shipping_plan_lines schema.** The canonical live `shipping_plan_lines` has NO `marketplace` column. Removed `marketplace` from `DEMO4A_REQUIRED_COLS_.shipping_plan_lines` (so the schema gate no longer requires it → resolves `PREFLIGHT_FAILED_SCHEMA`) and the plan-line writer no longer emits a `marketplace` field. No DB column added. Marketplace remains on `shipping_plans.marketplace` + `shipments.marketplace` (header/FK authorities); plan-line marketplace context flows from the header, never a line column. (The 11_ code header constant still lists a line `marketplace`; that is a code-vs-live divergence left untouched — production-handler-owned, not the demo tool's to change.)

- **B — read-only master-resolution diagnostic.** `TEMP_DEMO4A_DIAGNOSE_ROUTE_MASTER_RESOLUTION()` (pure core `DEMO4A_diagnoseResolution_`) emits ONE compact log: exact live headers for `shipment_route_templates`/`shipment_route_template_nodes`/`logistics_locations`; active-template/node/location counts; candidate-mapping counts (`node.logistics_location_id`→`location.logistics_location_id`, `node.node_code`→`location.location_code`, node direct lat/lng); node-type distribution; nodes with direct coords; nodes resolvable via location; intentionally-abstract nodes; unresolved declared references; valid templates by region; failure-reason counts; the frozen authority statement; the proven minimum geographic requirement; and ≤5 fingerprinted examples (never all 427 nodes).

- **C — frozen join authority.** Traced from production `csdTemplateNodes_`/route-writer (22_) and the On-the-Way Map precedence (`global-logistics-map.js`): a node's coordinate = its declared `logistics_location_id` → `logistics_locations.logistics_location_id` (coords/name/country/region/city from the location) when that canonical location resolves, else the node's OWN `latitude`/`longitude`. `shipment_routes.location_ref_type='logistics_location'` + `location_ref_id` = the canonical `logistics_location_id` ONLY when a location resolves. There is NO `node_code`→`location_code` join in the write/map path (that mapping is only REPORTED by the diagnostic). `DEMO4A_resolveNode_` implements exactly this; `route_template_node_id` + `node_code` are preserved verbatim.

- **D — geographic vs abstract nodes.** GEOGRAPHIC = declares a location and/or own coords AND resolves to valid non-(0,0) coordinates. ABSTRACT = declares neither (customs/process/transit milestone): kept as a `shipment_routes` row (lineage + display code) and in the timeline, with NO fabricated coordinate/location, and never a map marker. A node that DECLARES a geographic reference (logistics_location_id or own lat/lng) that does not resolve fails closed (`DECLARED_LOGISTICS_LOCATION_NOT_FOUND` / `DECLARED_LOCATION_COORDINATE_UNRESOLVED`), disqualifying the template. `DEMO4A_templateEligibility_` (shared by selection AND the diagnostic — one rule, no heuristic drift): active · ≥2 nodes · sequences present+unique · every node resolves · ≥2 geographic nodes · origin (first) AND destination (last) geographic. **Minimum proven from the map source: 2 geographic nodes with origin+destination geographic; the in-transit current marker resolves to a geographic node.**

- **E — current event selection.** `DEMO4A_currentGeoIndex_` places the primary in-transit current marker on a GEOGRAPHIC node (a geographic node strictly between origin and destination when one exists). Only geographic nodes become events (each carrying a real coordinate); the current event is geographic by construction — never an abstract blank-coord node.

- **F — template selection.** Prefers one active resolvable US West / Central / East template (`richer` ranks by geographic-node count); the richest eligible route becomes the primary in-transit; truthful `FALLBACK_TRUTHFUL_TOP3` only when a distinct W/C/E set is unavailable. `chosen_templates` + `per_shipment` expose template ids, node counts, geographic-node counts, and abstract-node counts.

- **G — V3A safety preserved.** ABSENT_ALL/PRESENT_EXACT_ALL classification, content checksums, live validation, durable journal integrity, inserted-only + post-check rollback, external-reference scan, CLEAR staged-off, and the real marketplace SKU/site-SKU authority are all unchanged (the live route validator now requires coordinates only for GEOGRAPHIC route rows; abstract rows are allowed blank).

- **H — tests.** `demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js` (143/0): all 108 prior V3/V3A proofs + 35 V3B proofs (no line marketplace; no new column; node/location join authority; declared-unresolved fails closed; abstract node needs no coords; geographic origin/destination required; in-transit current event geographic; W/C/E from real own-coord fixtures; full route sequence preserved while markers are geographic-only; V3A safety intact; diagnostic authority + counts). The seed file is standalone (read by one test); full sweep = known 4-test baseline, 0 new. APPS_SCRIPT_SYNC_REQUIRED: `TEMP_demo_shipping_shipment_map_seed_v2.gs`. No bundle rebuild, no frontend. COMMIT/CLEAR not run; both confirmation constants remain placeholders.

## V3C — F1-7N-FA-4A-DEMO-SEED-MAP-V3C-DEMO-LOCATION-BINDING

**A — frozen master conclusion (truthful).** Live read-only evidence: 32 active templates, 427 template nodes, 398 logistics_locations; `node.logistics_location_id → location id` matches = 0; `node_code → location_code` matches = 0; nodes with direct valid coordinates = 12; intentionally-abstract nodes = 415; unresolved declared references = 0. **The route templates provide process/timeline topology, but their nodes are (with rare exceptions) NOT physically linked to logistics_locations.** Therefore: template node sequence/type/code/name is the TIMELINE authority; logistics_locations is the COORDINATE authority; the Demo Seed creates an EXPLICIT DEMO-ONLY runtime binding; this Demo binding is NOT evidence that production template-node linkage is complete; no master record is modified; no fuzzy/name/city matching is allowed.

**B — exact identifier audit.** `DEMO4A_indexLocationsByIdentifiers_` + `DEMO4A_nodeCanonicalMatch_` check EXACT full-value matches between a node identifier field (or `node_code`) and every logistics-location identifier field — `DEMO4A_LOC_ID_FIELDS_` = logistics_location_id, location_code, un_locode, iata_code, icao_code, port_code, rail_terminal_code, border_gateway_code, warehouse_id, factory_id, carrier_id. The diagnostic reports per-field match counts. A canonical match (when one exists) is used before the Demo fallback. No fuzzy/substring/display-name matching.

**C — Demo-only location binding.** When a role node lacks a canonical/direct binding, `DEMO4A_bindTemplateRoles_` chooses a deterministic existing active logistics_location by exact country (hard), preferred exact region, role-appropriate canonical type (soft), valid non-(0,0) coordinates, stable id order. Roles: ORIGIN_ANCHOR (country = origin_country), CURRENT_TRANSIT_MARKER (distinct, transit-appropriate; primary in-transit only), DESTINATION_ANCHOR (country = destination_country, region when available). Origin/current/destination coordinates are distinct on the primary in-transit shipment. No invented location or coordinate; no coordinate reused across unrelated roles.

**D — template timeline preserved.** `shipment_routes` are written for the complete ordered node sequence, preserving route_template_id / route_template_node_id / node_sequence / node_type / node_code / node_name / planned_event_type / transport_mode_to_next / chronology. A bound row copies its coordinate EXACTLY from the resolved authority; `location_ref_type='logistics_location'` + `location_ref_id` = the canonical logistics_location_id (only when a location resolved). ABSTRACT rows keep their timeline label with blank coordinate + blank location_ref and never become a map marker. The synthetic binding is recorded in the checksummed `binding_manifest` and in synthetic-bound event notes (`DEMO-4A-SYNTHETIC-RUNTIME-BINDING`); the seed never claims the template master originally contained the FK. (`shipment_routes` has no note/source column, so route-row Demo evidence lives in the manifest + events + plan metadata, not a fabricated column.)

**E — status-specific display + F — current event.** Shipment 1 (shipped): origin anchor, latest event departed_origin at origin. Shipment 2 (in_transit, PRIMARY): origin + distinct current transit marker + destination, current route row = current, prior completed, later planned, latest event references the current geographic route row. Shipment 3 (received): destination anchor, latest event received. Only geographic (bound) rows become events; the current marker is always geographic. Canonical event enums only (departed_origin / route_node_reached / received); event coordinates copied from the bound location; strictly-increasing times; no event on a planned row; template `planned_event_type` stays route metadata (never auto-copied into `event_type`).

**G — selection.** Prefer one active template per US West/Central/East with valid Demo bindings; the PRIMARY in-transit must additionally bind a distinct current marker (≥3 nodes). Truthful `FALLBACK_TRUTHFUL_TOP3` when W/C/E cannot all be built; fail closed with exact per-reason `rejection_counts` when fewer than three status-valid Demo plans exist or no in-transit candidate qualifies.

**H — checksum/journal.** `demo_plan_checksum` binds every six-table row AND a binding manifest (role node id + exact logistics_location_id + binding type + exact coordinates). V3A preserved: complete durable journal with full readback + integrity checksum before the first mutation; inserted-id-only rollback; post-check rollback; exact live validation; no `COMMITTED_UNVERIFIED`; exact retry `REUSED`; CLEAR separately staged OFF; external-reference scan.

**I — validator.** `DEMO4A_validateLiveRows_(plan, live, masters)` adds: every Demo-bound coordinate equals its logistics_locations authority (`live_bound_coord_equals_master`), abstract rows blank (`abstract_rows_blank`), event coord = its route-row coord (`live_event_coord_equals_route`), primary in-transit origin/current/destination distinct (`primary_in_transit_anchors_distinct`) — on top of the existing PRESENT_EXACT_ALL / FK / route-sequence / event-chronology / status-agreement / UI-visibility checks. `DEMO_SEED_VALIDATED` only when PRESENT_EXACT_ALL AND all checks pass.

**J — PREFLIGHT** now reports schema_gate, demo state classification, scope/SKU pairs, template selection mode, selected template ids, regions, per-shipment (status · template · node count · abstract rows · canonical/direct/synthetic binding counts · origin/current/destination location ids), six-table counts, rejection_counts, and the verdict (`READY_FOR_DEMO_SEED` or one precise reason). `TEMP_DEMO4A_DIAGNOSE_ROUTE_MASTER_RESOLUTION()` emits the compact identifier audit.

**K — tests.** `demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js` (166/0): 108 prior V3/V3A proofs + 58 V3C proofs covering all 24 required proofs (no master modification; no manufactured coordinate; canonical binding wins; fuzzy prohibited; fallback uses existing active locations; exact country/region/type filters; deterministic selection; distinct origin/current/destination; complete abstract timeline; abstract rows blank; Demo binding evidence; current event geographic; no events on future rows; received latest = received; event coords = master; checksum sensitivity; V3A journal/rollback; partial/drift/duplicate refusal; exact retry REUSED; CLEAR disarmed; no production handlers; no K2/AI/stock/PO/document side effects; no line marketplace; zero new full-suite failures). The seed file is standalone (read by one test); full sweep = known 4-test baseline, 0 new. APPS_SCRIPT_SYNC_REQUIRED: `TEMP_demo_shipping_shipment_map_seed_v2.gs`. No bundle/frontend/master/schema change. Both confirmation constants remain placeholders; DIAGNOSE/PREFLIGHT/DRY_RUN/COMMIT/VALIDATE/CLEAR not run live.

---

# F1-7N-FA-4A — V3D: ROUTE-GEOGRAPHY SEMANTIC GATE (source-implemented · test-proven · NOT live-run)

**Status:** source + offline-test correction only. No live `DIAGNOSE/PREFLIGHT/DRY_RUN/COMMIT/VALIDATE/CLEAR`; no DB/property/master write; no `logistics_locations` / route-template edit; both confirmation constants remain placeholders; the retired checksum `77e18d0b` is not set. One local commit; not pushed/deployed.

## A — Root cause (proven from source)
The prior binding contract treated role-appropriate `location_type` as a **soft preference** (`DEMO4A_transitPrefTypes_` + a `typeRank`), then selected by **deterministic `logistics_location_id` order**. Determinism is not semantic authority. Two concrete failures followed:
- **`DEMO4A_pickAnchor_`** filtered country hard but type soft, so among non-preferred types the lexically-smallest id won — an **airport** could take a sea/truck destination merely by sorting first (`LOC-AIR-US-ATL/DFW/LAX`).
- **The current marker** was picked with **no country/corridor constraint at all** (`{ preferTypes: … }` only), so the global logistics pool let a third-country node (`LOC-CHANNEL-FR-CALAIS`, FR) bind a direct CN → US route.

Since live has ~0 canonical node→location matches (the frozen V3C conclusion), those picks were **DEMO_SYNTHETIC_RUNTIME_BINDING**s — exactly the path now hardened. `CANONICAL_MASTER_BINDING` / `NODE_DIRECT_COORDINATE` are the node's own source-proven master truth and remain **exempt** from the synthetic gate (B(3) itself whitelists "an explicit third-country node country from the selected template node" and "a source-proven route corridor/transshipment authority"); their compatibility is still computed and reported as evidence.

## C — Final compatibility matrix (canonical `location_type` × transport class × role)
Tokens derived from the production `location_type` enum (`GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md` §5.2: factory, warehouse, fulfillment_center, port, airport, rail_terminal, truck_terminal, border_crossing, customs_facility, transit_hub, parcel_hub, carrier_facility, city_centroid, country_centroid, virtual_transit_point, other) + owner-used `distribution_center`. Raw types are normalized by an **explicit synonym map** (`DEMO4A_LOC_TYPE_CANON_`) — never a display-name / substring match; an unrecognized token → `UNKNOWN`, a blank → `''`, and both **fail closed** for a synthetic binding.

| Transport class | ORIGIN compatible | CURRENT (gateway/transit) compatible | DESTINATION compatible |
|---|---|---|---|
| sea / sea_express | factory, warehouse, port, fulfillment_center, distribution_center | port, transit_hub, virtual_transit_point | warehouse, fulfillment_center, distribution_center, truck_terminal, rail_terminal, transit_hub, parcel_hub, carrier_facility — **NO airport** |
| air / air_express | factory, warehouse, airport, fulfillment_center, distribution_center | airport, transit_hub, virtual_transit_point | …destination-common **+ airport** |
| rail | factory, warehouse, rail_terminal, distribution_center | rail_terminal, border_crossing, transit_hub, virtual_transit_point | destination-common (no airport) |
| truck / inland / parcel | factory, warehouse, truck_terminal, distribution_center | truck_terminal, border_crossing, transit_hub, virtual_transit_point | destination-common (no airport) |

Verdicts: `compatible` / `incompatible` / `unknown` (`DEMO4A_typeRoleCompat_`); `UNKNOWN`/blank ⇒ `unknown` ⇒ fail closed for a synthetic binding.

## B(3) — Corridor rules (current transit marker)
Allowed corridor countries for a route's current marker (`DEMO4A_corridorCountries_`) = `origin_country` ∪ `destination_country` ∪ **every explicit non-blank `node.country`** on the selected template's nodes (a proven route/transshipment node). The synthetic current pick is filtered to that set (`DEMO4A_pickAnchor_` `opts.countries`), so **France/Calais is ineligible for a CN → US route unless the template explicitly contains an FR node**. Origin and destination remain exact-country hard filters.

## D — Node-role compatibility (structural authority)
`node_type` is an **unfrozen, user-maintained** vocabulary (`31_:110` makes the lifecycle STRUCTURAL, never `node_type`-dependent). Therefore **structural position is the role authority** (first node = origin, last = destination, a middle node = current) and `node_type` is a recognized-**incompatible guard** for the synthetic current marker only: `DEMO4A_chooseCurrentIndex_` picks a middle node whose `node_type` is not a recognized customs / appointment / administrative / endpoint token (`DEMO4A_nodeRoleCompat_`), preferring a recognized transit token, then the geometric middle, then lowest index (deterministic). No plausible middle node ⇒ not current-capable (fail closed). The full abstract route sequence is always preserved as timeline rows.

## Expected replacement for Calais / expected destination types
- **Current marker (CN → US Central, sea):** an in-corridor transit anchor — an origin-country export port, or a destination-country West-Coast gateway port before inland US Central (deterministically the lowest-id in-corridor `port`/`transit_hub`/`virtual_transit_point`), distinct from origin and destination. **Never** an unrelated third country.
- **Destination (sea/truck):** a warehouse / fulfillment_center / distribution_center / eligible inland terminal in the destination country + exact region; **never an airport**. If none exists → fail closed `NO_ROLE_COMPATIBLE_DESTINATION_LOCATION`.

## E — Preflight / dry-run evidence + gates
Each shipment reports `{ origin, current, destination }` with `location_id, country, region, location_type, canon_location_type, node_type, binding_type, source_proven, role_compatible, corridor_compatible` (`route_geography_evidence`). Gates (`binding_gates`): `all_role_bindings_compatible`, `all_corridor_bindings_compatible`, `primary_current_distinct`, `no_unrelated_third_country`, `sea_truck_destination_not_airport`. **`READY_FOR_DEMO_SEED` is unreachable unless all gates are true** (new verdict `PREFLIGHT_FAILED_BINDING_GATES`); COMMIT re-checks the gates under lock (`COMMIT_REFUSED_BINDING_GATES`). Fail-closed rejection reasons: `NO_ROLE_COMPATIBLE_ORIGIN/CURRENT/DESTINATION_LOCATION`, `NODE_TYPE_INCOMPATIBLE_FOR_CURRENT_MARKER`, `NO_MIDDLE_NODE_FOR_CURRENT_MARKER`, `ORIGIN_DESTINATION_NOT_DISTINCT`, `CURRENT_MARKER_NOT_DISTINCT`.

## F — Checksum (retired-checksum evidence)
The binding manifest tuple now binds, per role: node id + **node_type** + exact `logistics_location_id` + binding type + **country + region + canonical location_type + role-compatibility decision + corridor-compatibility decision** + exact coordinates. Any change to a binding's location, type, role/corridor decision, country/region or coordinate changes `demo_plan_checksum`. The old checksum **`77e18d0b` appears nowhere in the source** and is neither pinned nor accepted; the constant stays placeholder.

## G — Validator (live)
`DEMO4A_validateLiveRows_` adds `live_bound_type_role_compatible` (a bound `location_type` — read from the `logistics_locations` authority, never a name — must be role/transport-compatible; a sea/truck final destination is never an airport; a current marker's `node_type` must be transit-compatible) and `live_no_unrelated_third_country` (the current marker's country must lie in the shipment's own corridor: origin/destination + explicit abstract node countries). `DEMO_SEED_VALIDATED` now also requires these. Existing coordinate-equals-master, distinctness, chronology and status-agreement checks are retained.

## H — Tests (17 requirements, all green: 211/0 in the suite)
CN→US rejects FR/Calais (H1); explicit FR node re-authorizes it (H2); sea/truck destination never airport, air may be (H3/H4); sea origin maritime/factory, truck last-mile warehouse-class (H5/H6); corridor rule for current (H1/H2/H7); current distinct from origin/destination (H8); node/role compatibility incl. customs-node skip (H9); explicit-synonym-only, no fuzzy match (H10); deterministic order-stable selection (H11); no invented coordinate on a polluted pool (H12); full abstract timeline preserved (H13); prior V3A/V3B/V3C gates intact (H14); retired `77e18d0b` not pinned + type/decision bound into the checksum (H15); both constants placeholder (H16); zero new full-suite failures (H17 — verified by the runner: only the known 4-suite baseline fails, none reading this file).

## I / J — Files, sync manifest, boundary
Changed: `assets/specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs` (TEMP demo tool) + `assets/tests/demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js` + this planning doc. **No** production / master / frontend / bundle / schema change. `APPS_SCRIPT_SYNC_REQUIRED`: none for production — the TEMP demo tool is user-synced only if/when the demo is exercised (it is not run in this task). No live execution or write; both confirmation constants remain placeholders.

---

# F1-7N-FA-4A — V3E: LIVE LOCATION-TYPE ROLE-CANDIDATE DIAGNOSTIC (read-only instrumentation)

**Status: diagnostic instrumentation only.** No change to template eligibility, binding selection, or the V3D compatibility matrix. No master/production/frontend/schema change. Strictly read-only (`getSheetByName` + `getValues`); no DB/property write; both confirmation constants remain placeholders. Not run by Claude. One local commit; not pushed/deployed.

## New entrypoint
`TEMP_DEMO4A_DIAGNOSE_LIVE_LOCATION_ROLE_CANDIDATES()` — emits ONE compact primary log (`DEMO4A_DIAGNOSE_LIVE_ROLE_CANDIDATES`). Pure core: `DEMO4A_diagnoseLiveRoleCandidates_(templates, nodes, locations)`. It REUSES the frozen V3D predicates unchanged (`DEMO4A_locActive_/locValid_/locCountry_/locRegion_/locType_`, `canonLocType_`, `transportClass_`, `roleCompatibleTypes_`, `corridorCountries_`, `nodeRoleCompat_`, `pickAnchor_`). Never dumps rows — counts + capped (≤3) id fingerprints only. No fuzzy/name matching.

## What it emits
- **B — location distribution** (active + valid-coordinate) by scope `CN` / `US | <raw region>` (+ `verification_status` / `record_status` tallies); non-CN/US collapsed into `other_aggregate`.
- **C — per-role filter-stage counts** for `origin_cn`, `destination_by_region` (US_WEST/US_CENTRAL/US_EAST), and `primary_in_transit_current`. Each reports the 12 CUMULATIVE stages — total → active → valid_coordinate → country_exact → region_exact → raw_type_recognized → canonical_type_resolved → transport_compatible → role_compatible → node_role_compatible → corridor_compatible → distinct_candidate — plus `first_zero_stage` and `rejection_reasons`. (node_role is a template-node property, reported in F; it is a pass-through at the location level.)
- **D — raw token audit**: every distinct CN/US `location_type` token with count, current canonical mapping, `recognized`, `compatible_roles_sea` / `compatible_roles_truck`, `source_spec_enum_match` (§5.2 enum), ≤3 example id fingerprints.
- **E — region authority audit**: US `region_raw_counts` vs `subdivision_counts` vs `effective_region_counts` (the latter reflects the existing `DEMO4A_locRegion_` region→state fallback), `region_blank_but_subdivision_present`, `uses_us_west_central_east_tokens`. The audit EXPOSES the region-vs-subdivision authority without changing selection.
- **F — selected/candidate template evidence** (richest active per region, by fingerprint): transit_type, last_mile, origin/destination country, destination_region, first/last node type, eligible current-node types, exact origin/current/destination candidate counts, and each role's first rejection stage.
- **G — verdict** ∈ `LIVE_LOCATION_TYPES_READY_FOR_MATRIX_ALIGNMENT` · `LIVE_REGION_AUTHORITY_MISMATCH` · `NO_VALID_DESTINATION_MASTER_ROWS` · `NO_VALID_ORIGIN_MASTER_ROWS` · `LOCATION_TYPE_AUTHORITY_UNRESOLVED`; always `DEMO4A_ZERO_WRITE_CONFIRMED = YES`.

## Purpose
The V3D live diagnostic returned eligible-templates = 0 (`NO_ROLE_COMPATIBLE_DESTINATION_LOCATION` = 29, `NO_ROLE_COMPATIBLE_ORIGIN_LOCATION` = 3). V3E pinpoints WHICH stage each candidate dies at (region vs raw-token vs canonical vs transport vs role) and the exact live raw tokens + region authority — the evidence required BEFORE any V3D matrix/region alignment. **No matrix change is made in this task.**

---

# F1-7N-FA-4A — V3F: WAREHOUSE ↔ LOGISTICS-LOCATION DESTINATION AUTHORITY ALIGNMENT

**Status: SOURCE-IMPLEMENTED · TEST-PROVEN · NOT LIVE-VERIFIED.** TEMP demo tool + its test + this doc only. No production/master/frontend/schema/bundle change; strictly read-only masters; no DB/property write; both confirmation constants remain placeholders; not run by Claude. One local commit.

## A — Source authority matrix (audited, cited)
| Concern | Authority | Source |
|---|---|---|
| Business destination identity | `shipments.destination_warehouse_id` (+ `destination`,`destination_type`; legacy `warehouse_id`), inherited from the plan → `warehouses.warehouse_id` | `12_shipment_handlers.gs:33,504`; `11_:24`; `33_party_authority_handlers.gs:130` |
| `warehouses` coordinates | **NONE** — business authority only (`warehouse_id, warehouse_type∈FBA/3PL/RETURN/FACTORY, company, country, logistics_region, marketplace, is_active, address/city/state/postal_code`) | `SHIPMENT_CENTER_SPEC.md:59,62`; `GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md:456` |
| Map coordinate authority | `logistics_locations.latitude/longitude` only | `GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md:160,192` |
| Exact join | `logistics_locations.warehouse_id === warehouses.warehouse_id` — **IMPLEMENTED** (backend `partyResolveDestinationLocation_` 33_:107, fail-closed `DESTINATION_LOCATION_AMBIGUOUS` on >1; frontend `resolveDestinationCoord`/`locByWh` global-logistics-map.js:182,267) | 33_:107-124; 34_:334; map:182,267 |
| Warehouse-coordinate fallback (branch 2) | **NOT source-proven** — warehouses hold no coordinate; fabrication forbidden | `GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md:219,328` |
| Multiple logistics rows per warehouse | backend fails closed on >1; ≤1 active primary per warehouse | 33_:112; `LOGISTICS_LOCATIONS_SEED_CHECKLIST.md:7,26` |
| Blank / (0,0) / out-of-range coords | REJECTED — `validCoord` `!(0,0)` + ±90/±180; blanks→null | map:64; `operation-system-db-api.js:1299-1303` |
| Runtime geocoding | **NONE** (definitively) | map:6; `project-current-state.md:2863`; test-banned |
| `verification_status` | enum draft/pending_review/verified/rejected/retired; eligible = not retired/rejected. **No `record_status` column.** The USER token `ADDRESS_SEEDED_COORDINATES_PENDING` does NOT exist in-repo (real concept = frontend `COORDINATE_PENDING`) | `GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md:180`; 33_:61-66; map:259 |
| Route coords at dispatch | template node's OWN inline lat/lng (not dereferenced via logistics_location_id); blank if node blank; never (0,0) | `22_shipment_dispatch_handlers.gs:190-197` |

## Live-schema conclusions
The V3E finding (47/398 coordinate-valid rows, mostly airports/seaports/gateways; US FBA/3PL destinations zero at role_compatible) is explained: the real FBA/3PL facilities exist as **warehouse-backed `logistics_locations` rows with blank coordinates** — they are IDENTITY-ready but COORDINATE-pending. `warehouses` never carried coordinates; the coordinate-valid rows are gateways, not the FBA facilities. "No valid coordinate" ≠ "warehouse does not exist."

## Selected coordinate branch model (frozen; branch 2 excluded as not source-proven)
`DEMO4A_resolveWarehouseDestination_(warehouseRow, locations)` (exact `warehouse_id` join, no fuzzy/name/city):
1. **WAREHOUSE_LOCATION_COORDINATE_READY** — one eligible logistics row with a valid coord → the FBA/3PL facility is the final destination marker (route lat/lng = that exact row); `received` allowed.
2. **PRODUCTION_WAREHOUSE_COORDINATE_FALLBACK** — NOT source-proven → NEVER selected (diagnostic reports `production_map_warehouse_coordinate_fallback_source_proven:false`).
3. **WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING** — identity resolves, coord blank → identity preserved, **no fabricated coordinate, no facility marker, NO received-at-FBA**; the demo fails closed (`DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY`).
4. **WAREHOUSE_LOCATION_JOIN_MISSING** — warehouse identity but no eligible logistics row → fail closed.
5. **WAREHOUSE_LOCATION_JOIN_CONFLICT** — >1 eligible logistics row for the warehouse → fail closed (fingerprinted).

## Destination / status semantics
`warehouses` = business destination authority; `logistics_locations` = coordinate authority; the seed preserves BOTH ids + the exact join key + `location_type` + `country`/`region` + coordinate source + `verification_status` in the binding manifest/checksum (a `WHDEST~…` entry). Route semantics keep origin (factory/warehouse), export/import gateways (CN/US port/airport) and the current transit marker DISTINCT from the final destination FBA facility; a seaport stays a gateway and is never relabelled as the FBA. `received` is emitted only under branch 1 (facility coordinate truthfully reached). The warehouse authority activates ONLY when the `warehouses` master is present (legacy/no-warehouse fixtures keep the logistics-only binding unchanged).

## Diagnostic entrypoint
`TEMP_DEMO4A_DIAGNOSE_WAREHOUSE_LOCATION_AUTHORITY()` (pure core `DEMO4A_diagnoseWarehouseLocationAuthority_`) — strictly read-only, ONE compact log: warehouses/logistics headers, warehouse coordinate fields found (none), active destination-warehouse counts by company/country/region/type/marketplace, exact `warehouse_id` join counts (rows / joined / missing / conflicting), joined FBA/3PL by US_WEST/CENTRAL/EAST, joined valid-vs-blank coordinate counts, verification_status counts, `production_map_warehouse_coordinate_fallback_source_proven:false`, ≤5 fingerprinted examples, and a verdict ∈ {WAREHOUSE_LOCATION_AUTHORITY_READY, WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING, WAREHOUSE_LOCATION_JOIN_MISSING, WAREHOUSE_LOCATION_JOIN_CONFLICT, WAREHOUSE_SCHEMA_AUTHORITY_UNRESOLVED}; `DEMO4A_ZERO_WRITE_CONFIRMED = YES`.

## PREFLIGHT / DRY_RUN (G)
PREFLIGHT reports five separate gates (`warehouse_business_identity_gate`, `warehouse_location_join_gate`, `warehouse_coordinate_gate`, `map_renderability_gate`, `status_truthfulness_gate`) — `READY_FOR_DEMO_SEED` requires all true (else `PREFLIGHT_FAILED_WAREHOUSE_AUTHORITY`). DRY_RUN reports per shipment: destination_warehouse_id, destination_logistics_location_id, coordinate branch, verification_status, route/event rows, final status, facility-marker-renderable, and the gateway location separately. COMMIT re-runs the gates under lock (buildPlan is re-invoked under the ScriptLock; a non-READY branch → COMMIT_REFUSED_PLAN). The `demo_plan_checksum` binds the branch + both ids + verification (retired checksums not accepted).

## Downstream blockers (recorded; NOT changed here)
The production map's own BACKEND coordinate snapshot is PAUSED (`GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md:95`) — only the frontend join renders today. `shipment_routes` at dispatch use template-node inline coords (not the logistics_location_id join) — a production spec-vs-code gap. Neither is changed in this task.

## Live-validation order (NOT run here)
DIAGNOSE_WAREHOUSE_LOCATION_AUTHORITY → DIAGNOSE_LIVE_LOCATION_ROLE_CANDIDATES → PREFLIGHT → DRY_RUN → user copies the new demo_plan_checksum → COMMIT → VALIDATE.

---

# F1-7N-FA-4A — V3G: ADDRESS-AUTHORITY DESTINATION COORDINATE DERIVATION

**Status: SOURCE-IMPLEMENTED · TEST-PROVEN · NOT LIVE-VERIFIED.** Supersedes V3F's coordinate-mandatory destination gate. TEMP demo tool + its test + this doc only. No production/master/frontend/schema/bundle change; strictly read-only masters; no DB/property write; both confirmation constants remain placeholders; not run by Claude. One local commit.

## Business rule (USER AUTHORITY)
The Shipment destination is selected through a warehouse code/id; its business identity is complete when `warehouse_id + warehouse_code + eligible + a resolvable real address` exist. FBA/3PL warehouses are **address-based** facilities, unlike coordinate-based transit nodes (port/airport/border). A **blank master latitude/longitude does NOT mean the destination is incomplete** — coordinates are map-presentation derivative data, never the authority that decides whether the destination exists. Master coordinates are NOT a business or received-status gate. `warehouses`/`logistics_locations` are not modified.

## Audit reconciliations (both audited this round, source-cited)
| Point | Live evidence | V3G handling |
|---|---|---|
| Warehouse address fields | **CORRECTED IN V3G1 — the V3G claim was WRONG about the LIVE schema.** The **actual live `warehouses` headers ARE** `address_line1`, `address_line2`, `city`, `state`, `subdivision_code`, `postal_code`, `country` (live header evidence). `SHIPMENT_CENTER_SPEC.md:59` documents a flat `address` → classified `SPEC_VS_LIVE_WAREHOUSE_ADDRESS_SCHEMA_DIVERGENCE` | V3G1 precedence: the **live** `address_line1`/`address_line2` columns WIN whenever the column is present — **even if blank** (a present-but-blank live `address_line1` is NEVER silently replaced by an unrelated field); the legacy/spec flat `address` is read ONLY when the live line1 columns are entirely absent |
| `record_status` on logistics_locations | canonical spec defines only `verification_status` (§5.1), but the live frontend reads `r.record_status \|\| r.coordinate_status` (`operation-system-db-api.js:1331`) | detect the column when present; report its counts truthfully (never assert absence); a dead value (`deleted/archived/void/removed/inactive/obsolete`) is ineligible |
| `third_party_warehouse` location_type | only `warehouse` / `fulfillment_center` are documented warehouse-backed tokens (`LOGISTICS_LOCATIONS_SEED_CHECKLIST.md:13`); `3PL`/`FBA` are `warehouse_type` values (`SHIPMENT_CENTER_SPEC.md:62`) | added `third_party_warehouse`/`third_party`/`3pl`/`3pl_warehouse` → canonical `warehouse` so a live 3PL row is never UNKNOWN |
| `verification_status` = ADDRESS_SEEDED_COORDINATES_PENDING | token absent from repo; enum = draft/pending_review/verified/rejected/retired (`GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md:180`) | eligibility = not-retired/not-rejected → a coordinate-pending status stays eligible; identity is never invalidated by a blank coordinate |

## Final authority model
- **Business identity**: `warehouses.warehouse_id`, `warehouse_code`, `warehouse_name`, `company`, `marketplace`, `country`, `logistics_region`, `warehouse_type`, + the real stored address (`DEMO4A_addressAuthority_`).
- **Location lineage**: exact `logistics_locations.warehouse_id === warehouses.warehouse_id` (0/1; >1 = fail-closed conflict); `logistics_location_id` when the join exists.
- **Display coordinate precedence**: (1) valid exact warehouse-linked `logistics_locations` coordinate; (2) a REVIEWED, source-bound, address-fingerprint-matched Demo coordinate. NEVER a city/ZIP/postal centroid, port/airport coordinate, fuzzy name match, unrelated location, or invented coordinate.

## Address completeness contract (`DEMO4A_addressAuthority_`)
Required: `warehouse_id`, `warehouse_code`, `address_line1`, `city`, `country`, and `postal_code` when the country requires it (`DEMO4A_POSTAL_REQUIRED_`, incl. US). Exact country/region agreement with the selected route. Verdicts: `ADDRESS_AUTHORITY_READY` · `ADDRESS_INCOMPLETE` · `ADDRESS_SCOPE_CONFLICT` · `WAREHOUSE_LOCATION_JOIN_CONFLICT` (resolver) · `WAREHOUSE_NOT_ELIGIBLE`.

## Demo-only coordinate derivation (`DEMO4A_DEST_COORD_AUTHORITY_` + `DEMO4A_deriveDestCoordinate_`)
A reviewable, source-referenced, **address-fingerprint-bound** lookup keyed by UPPERCASE `warehouse_code`. Each entry: `latitude, longitude, source_type, source_reference, accuracy, address_fingerprint, review_version`. Guards: valid coordinate · **facility-grade accuracy** (`rooftop/parcel/building/premise/address`; city/ZIP/centroid/approximate rejected) · the entry's `address_fingerprint` must equal the warehouse's **current** normalized-address fingerprint (a changed address invalidates a stale coordinate) · a non-empty `source_reference`. **It SHIPS EMPTY** — the operator pastes reviewed, source-cited coordinates in a separate, explicit, armed task; until then the derived branch fails closed (`DESTINATION_ADDRESS_COORDINATE_UNRESOLVED`). It is **never a geocoder**, is **never called at COMMIT** (the coordinate is frozen into the deterministic DRY_RUN plan and bound by `demo_plan_checksum`). If a selected warehouse cannot resolve, the seed tries the FIRST deterministic same-region eligible warehouse (`DEMO4A_pickWarehouseForRegion_`), else fails closed.

## Coordinate-branch model (`DEMO4A_resolveWarehouseDestination_`)
1. **WAREHOUSE_LOCATION_COORDINATE_READY** — valid warehouse-linked logistics coordinate → final FBA marker; received allowed.
2. **DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE** — identity address-ready + a reviewed source-bound coordinate → final FBA marker (Demo-only display coordinate); received allowed; lineage `logistics_location_id` preserved when the join exists.
3. **WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING** — identity ready, no valid/derived coordinate → identity kept, NO fabricated coordinate, NO facility marker, NO received-at-FBA; fail closed (`DESTINATION_ADDRESS_COORDINATE_UNRESOLVED`).
4. **WAREHOUSE_LOCATION_JOIN_CONFLICT** — >1 eligible logistics row → fail closed (fingerprinted).
5. Identity/eligibility/scope failures (`WAREHOUSE_IDENTITY_MISSING/INELIGIBLE/MISMATCH`, `WAREHOUSE_LOCATION_JOIN_MISSING` when no address) → fail closed (`DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY`).
Branch `WAREHOUSE_COORDINATE_FALLBACK_FROM_WAREHOUSE_MASTER` is NOT source-proven (warehouses hold no coordinates) → never selected.

## Route / event data (D)
The destination `shipment_routes` row preserves `route_template_id` + `route_template_node_id` + node identity/sequence; `location_ref_type = logistics_location` + `location_ref_id` = the exact `logistics_location_id` when the join exists; `latitude/longitude` = master coordinate if present, else the approved Demo address-derived coordinate; the binding manifest states the branch. A **received** Demo Shipment's final event references the destination route row, its coordinate equals that row's coordinate, and its note identifies the Demo address-derived coordinate when applicable — `received` is allowed because the chronology reaches the selected real warehouse (not because a master coordinate exists). An **in-transit** Shipment keeps a real gateway/transit current marker; the future destination route row may carry the address-derived facility coordinate but gets **no event** (no received on a planned node). A seaport stays a gateway and is never relabelled the FBA.

## Map source audit (E) — frontend NOT modified
Inline `shipment_routes` `latitude/longitude` **ARE consumed at the node level** (`resolveNodeCoord` → `resolveCurrentPosition`, `global-logistics-map.js:255-265`) — the terminal route node plots on a selected shipment, so an address-derived destination coordinate renders in the per-shipment On-The-Way view. The **dedicated destination-endpoint fallback marker** (`resolveDestinationCoord`, `:267`) reads ONLY a warehouse-linked `logistics_locations` coordinate (`locByWh`, `:181-184`) — it does NOT read inline route/event coords → reported as `MAP_DESTINATION_INLINE_COORD_NOT_CONSUMED` for that specific path (`DEMO4A_MAP_DEST_COORD_CONSUMPTION_`). Frontend `validCoord` (`:64`) rejects blank/(0,0)/out-of-range. No frontend change is made or required for the per-shipment route render; the endpoint-fallback consumption gap is recorded, not silently patched.

## PREFLIGHT gates (F) — SEVEN, identity separate from coordinate
`warehouse_business_identity_ready` · `warehouse_address_authority_ready` · `warehouse_location_lineage_ready` · `destination_display_coordinate_ready` · `map_consumes_destination_coordinate` · `status_truthfulness_ready` · `route_geography_ready`. `ADDRESS_SEEDED_COORDINATES_PENDING` never by itself fails business identity or received-status truth; READY still requires a real, source-bound display coordinate. DRY_RUN reports per shipment: warehouse id + code, logistics_location_id, coordinate branch, coordinate source + reference + accuracy, address status + fingerprint, reselected-from id, verification, route/event rows, final status, facility-marker renderability, and the current gateway SEPARATELY.

## Diagnostic truthfulness fixes (G)
`DEMO4A_diagnoseWarehouseLocationAuthority_`: (1) detects `record_status` when the column is present and reports its counts (never asserts absence); (2) audits RAW warehouse-backed `location_type` + lifecycle BEFORE any coordinate-validity filter (`fulfillment_center`/`third_party_warehouse` recognized, not UNKNOWN); (3) reports business-IDENTITY readiness (`identity_readiness`) SEPARATELY from coordinate readiness (`coordinate_readiness`); (4) classifies the `DEMO_ADDRESS_DERIVED` branch.

## Checksum + VALIDATE (H)
`demo_plan_checksum` binds the WHDEST manifest: `warehouse_id + warehouse_code + logistics_location_id + normalized-address fingerprint + coordinate branch + derived lat/lng + coordinate source reference + accuracy + verification_status + final status decision` (plus every route/event row). VALIDATE (`live_destination_authority`) proves over live rows: destination warehouse identity matches the selected warehouse; exact logistics lineage when a join exists; route coordinate == the approved (master or address-derived) coordinate; event coordinate == route coordinate; received ends at the real destination warehouse (final event on the destination row); seaport stays a gateway; FBA stays the final facility; no received event on a future/planned node; no master row changed.

## Tests (J1–J16) & baseline
`demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js` **317/0** (+ the V3G section): address is the destination authority; blank master coord keeps identity; address-derived coordinate renders + is Demo-only + source-bound; masters read-only (warehouses + logistics_locations); seaport stays gateway; address-incomplete fails closed; ambiguous/stale/non-facility coordinate fails closed; in-transit destination has no future event; received ends at the warehouse; record_status truthful + dead-value ineligible; fulfillment_center/third_party_warehouse recognized; checksum re-derives on address/coordinate/source change; journal/rollback/idempotency intact; constants placeholder; legacy no-warehouse plan byte-identical. Only the demo-seed suite reads this standalone `.gs` → full affected sweep 0 new failures.

## Live-validation order (NOT run here)
The operator arms the reviewed-coordinate authority (`DEMO4A_DEST_COORD_AUTHORITY_`), then: DIAGNOSE_WAREHOUSE_LOCATION_AUTHORITY → DIAGNOSE_LIVE_LOCATION_ROLE_CANDIDATES → PREFLIGHT → DRY_RUN → copy the new `demo_plan_checksum` → COMMIT → VALIDATE.

---

# F1-7N-FA-4A — V3G1: LIVE ADDRESS + COORDINATE-AUTHORITY CLOSURE

**Status: SOURCE-IMPLEMENTED · TEST-PROVEN (353/0) · NOT LIVE-VERIFIED · NOT LIVE-RUN.** Addendum to V3G (same commit, amended). TEMP demo tool + its test + this doc only. No production/master/frontend/schema/bundle change; masters strictly read-only; no DB/property write; `DEMO4A_DEST_COORD_AUTHORITY_` **and** `DEMO4A_DEST_COORD_PROPOSAL_` both ship EMPTY; both confirmation constants remain placeholders; no DIAGNOSE/PREFLIGHT/DRY_RUN/VALIDATE/COMMIT/CLEAR executed by the agent.

## A — Live warehouse ADDRESS schema truth (corrects V3G)
The **live** `warehouses` sheet exposes `address_line1`, `address_line2`, `city`, `state`, `subdivision_code`, `postal_code`, `country`. The earlier V3G statement that live `warehouses` carries only a flat `address` was **incorrect** and is corrected in the V3G audit table above. `SHIPMENT_CENTER_SPEC.md:59` still documents a flat `address`; that mismatch is reported (not silently reconciled) as **`SPEC_VS_LIVE_WAREHOUSE_ADDRESS_SCHEMA_DIVERGENCE`** by `TEMP_DEMO4A_DIAGNOSE_DESTINATION_ADDRESS_COORDINATE_CANDIDATES` (fields `spec_vs_live_warehouse_address_schema`, `live_address_line_columns_present`, `legacy_flat_address_column_present`, plus the raw `warehouses_headers`).

**Accessor precedence (`DEMO4A_whColPresent_` + `DEMO4A_whAddrLine1_`/`DEMO4A_whAddrLine2_`)** — live columns win by *presence*, not by *value*:
1. If an `address_line1`/`address_line_1` **column exists**, its value is authoritative — **including when blank**.
2. The legacy/spec flat `address` (or `street`/`street_address`) is read **only** when no live line1 column exists at all.
3. A present-but-blank live `address_line1` therefore yields `''` → `ADDRESS_INCOMPLETE` (fails closed), never a substituted unrelated field.
4. `subdivision_code` is read as its own field (`DEMO4A_whSubdivision_`); `DEMO4A_whStateSub_` prefers `state` and falls back to `subdivision_code` for the normalized address.

## B — Exact three-region candidate diagnostic (`TEMP_DEMO4A_DIAGNOSE_DESTINATION_ADDRESS_COORDINATE_CANDIDATES`)
**Strictly read-only** (`getSheetByName` + `getValues` only), one compact primary log, `DEMO4A_ZERO_WRITE_CONFIRMED: 'YES'`. Selects **exactly one deterministic eligible destination warehouse per `US_WEST` / `US_CENTRAL` / `US_EAST`** (`DEMO4A_destCandidateEligible_` + `DEMO4A_selectDestCandidatesByRegion_`).

Eligibility (all required): `company = KM` · `country = US` · `marketplace = Amazon` · `warehouse_type` **FBA preferred, a compatible 3PL only when no eligible FBA exists in that region** · `is_active` · `is_receiving_enabled` when the live column exists (blank = not a denial) · exact `logistics_region` bucket (W/C/E; `OTHER` ineligible) · `warehouse_id` **and** `warehouse_code` present · complete actual live address (`ADDRESS_AUTHORITY_READY`) · **exactly one** non-conflicting `logistics_locations.warehouse_id` join (0 = `WAREHOUSE_LOCATION_JOIN_MISSING`, >1 = `WAREHOUSE_LOCATION_JOIN_CONFLICT`) · the joined location active and not rejected/retired/dead. Determinism: FBA before 3PL, then `warehouse_id` ascending.

For **only** the three selected rows the tool prints **actual reviewable values** (deliberately NOT fingerprinted/hidden, and no unrelated rows dumped): `region`, `warehouse_id`, `warehouse_code`, `warehouse_name`, `warehouse_type`, `logistics_location_id`, `address_line1`, `address_line2`, `city`, `state`, `subdivision_code`, `postal_code`, `country`, `normalized_address`, `address_fingerprint`, existing `master_latitude`/`master_longitude` (+ `master_coordinate_valid`, `verification_status`), and `coordinate_authority_status` (`AUTHORIZED_COORDINATE_PRESENT` | `COORDINATE_AUTHORITY_NOT_ARMED`). Verdict: `THREE_REGION_DESTINATION_CANDIDATES_SELECTED` | `INSUFFICIENT_ELIGIBLE_DESTINATION_WAREHOUSES`.

**The exact live West/Central/East warehouse identities are produced by this tool when the USER runs it.** They are NOT reproduced here: the agent is prohibited from executing the live diagnostic, and inventing three warehouse ids/addresses would fabricate the very evidence the tool exists to obtain.

## C — PROPOSAL is not AUTHORIZATION (`DEMO4A_DEST_COORD_PROPOSAL_`)
Two separate constants, both shipping empty:
- `DEMO4A_DEST_COORD_PROPOSAL_` — a **reviewable plan** with, per selected warehouse: `warehouse_id`, `warehouse_code`, `logistics_location_id`, `address_fingerprint`, `latitude`, `longitude`, `coordinate_accuracy`, `coordinate_source_type`, `coordinate_source_reference`, `reviewed_at`, `reviewed_by`, `review_status` (`proposed` | `user_approved`).
- `DEMO4A_DEST_COORD_AUTHORITY_` — the **authorization**; stays `{}` until the USER explicitly reviews and pastes.

Requirements enforced on a proposal: an **actual facility/address coordinate**; **no airport/seaport/unrelated-gateway substitution**; **no city or ZIP centroid presented as a facility coordinate**; no fuzzy matching; a valid non-(0,0) coordinate; a required `coordinate_source_reference`; and an `address_fingerprint` equal to the **current** live normalized warehouse address.

**A proposal can never arm the authority.** `DEMO4A_proposalToAuthority_` is a **pure** converter: it reads only its argument, writes no constant, skips every entry whose `review_status` ≠ `user_approved`, and is **never invoked** by any tool in this file. Arming remains a separate, explicit, USER-owned paste.

## D — Proposal validator (`TEMP_DEMO4A_VALIDATE_DESTINATION_COORDINATE_PROPOSAL`)
**Strictly read-only, never authorizes.** Per region it reports: exact warehouse + logistics-location identity (`identity_match`), the **current** live `normalized_address`, the `expected_address_fingerprint`, fingerprint equality (`proposal_fingerprint_match`), coordinate validity, facility-grade accuracy (`rooftop/parcel/building/premise/address`), `source_reference_present`, country/region agreement (`country_region_match` + `country_bounds_known` — a declared proposal country must equal the live country, and the coordinate must lie inside the live country's bounding box when one is known), gateway/centroid substitution (`gateway_or_centroid_coordinate` — the proposed coordinate must not be a live port/airport/border/customs/hub/terminal/parcel/carrier/centroid/virtual location's coordinate within ~1e-3°≈100 m), and coordinate distinctness across the three (`duplicate_coordinate`).

Per-region statuses: `PROPOSAL_READY_FOR_USER_REVIEW` · `PROPOSAL_MISSING_FOR_WAREHOUSE` · `COORDINATE_INVALID` · `ACCURACY_NOT_FACILITY_GRADE` · `SOURCE_REFERENCE_MISSING` · `IDENTITY_MISMATCH` · `GATEWAY_OR_CENTROID_COORDINATE_SUBSTITUTION` · `COUNTRY_REGION_DISAGREEMENT` · `DUPLICATE_COORDINATE_ACROSS_FACILITIES` · `ADDRESS_FINGERPRINT_STALE` · `NO_ELIGIBLE_DESTINATION_WAREHOUSE_IN_REGION`. Overall verdict is exactly one of **`THREE_REGION_COORDINATE_PROPOSAL_READY`** · **`COORDINATE_PROPOSAL_INCOMPLETE`** · **`COORDINATE_PROPOSAL_STALE`** · **`COORDINATE_PROPOSAL_UNVERIFIED`**. No writes.

## E — Map display truth (frontend NOT modified) → `MAP_DESTINATION_DISPLAY_NOT_COMPLETE`
The audited distinction is preserved: `resolveNodeCoord` (`global-logistics-map.js:255-265`) **does** consume inline route coordinates; the dedicated endpoint fallback `resolveDestinationCoord` (`:267`) **does not** — it accepts only a warehouse-linked `logistics_locations` coordinate (`locByWh`, `:181-184`).

Consequences, recorded in `DEMO4A_MAP_DEST_COORD_CONSUMPTION_` and per shipment as `destination_map_display_status` (`DEMO4A_mapDestinationDisplayStatus_`):
1. The **planned destination route node renders at the exact warehouse coordinate** (node-level inline consumption).
2. It carries the destination warehouse identity (`location_ref_type = logistics_location` + the exact `logistics_location_id` when the join exists) and a **seaport/airport gateway is never relabelled the FBA** — the current gateway is reported separately.
3. A **received** shipment's final event coordinate **equals** the destination route-row coordinate (proven by test G12).
4. An **in-transit** shipment has **no** future destination event (no `received` on a planned node).
5. The planned destination route node still renders for the in-transit slot.
6. Because the *labelled* destination-endpoint marker needs a warehouse-linked logistics master coordinate, the **address-derived** branch renders a node but is **not distinctly labelled as the destination endpoint** → `MAP_DESTINATION_DISPLAY_NOT_COMPLETE` (`destination_display_complete_for_address_derived_branch: false`, recorded as `frontend_blocker`). The master-coordinate branch is `MAP_DESTINATION_DISPLAY_COMPLETE`. **Frontend NOT modified in this task** (separate authorization required).

## F — Typed PREFLIGHT block
When `DEMO4A_DEST_COORD_AUTHORITY_` is empty, `DEMO4A_buildPlan_` computes `warehouses_present` + `coord_authority_armed` (`DEMO4A_coordAuthorityArmed_`) **before** template selection and PREFLIGHT reports **`DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED`** (verdict `PREFLIGHT_FAILED_COORDINATE_AUTHORITY_NOT_ARMED`), with the original template-selection reason preserved as `underlying_reason` — **never** the misleading `INSUFFICIENT_STATUS_VALID_DEMO_PLANS`. After an explicit valid authority is supplied: a stale/missing `address_fingerprint` still **fails closed** as `DESTINATION_ADDRESS_COORDINATE_UNRESOLVED` (armed-but-stale is typed distinctly from not-armed); an exact three-region authority proceeds; a master `latitude`/`longitude` is **not** mandatory; and **no master write occurs**.

## G — Tests (V3G1, in `demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js`) — **353 passed / 0 failed**
G1 live `address_line1`/`address_line2` precedence over the legacy flat column · G2 flat `address` fallback **only** when the live line1 columns are absent (+ a blank live line1 is never replaced) · G3 deterministic exactly-one-per-region candidate selection (non-Amazon ineligible) · G4 the three selected rows expose actual ids/addresses/fingerprints/location ids + the `SPEC_VS_LIVE_...DIVERGENCE` verdict · G5 the proposal constant is distinct from, and as empty as, the authorization constant · G6 a merely-`proposed` entry converts to zero authority entries; a `user_approved` one converts **without mutating** the live authority · G7 fingerprint drift → `COORDINATE_PROPOSAL_STALE`; empty proposal → `COORDINATE_PROPOSAL_INCOMPLETE` · G8 a city/ZIP-centroid accuracy, a **live seaport gateway coordinate** (`port:TR-1`), an out-of-country coordinate, a mismatched declared country, and a duplicated coordinate are each refused (and an unlisted country reports `country_bounds_known:false` rather than a false disagreement) · G9 the exact facility-grade, fingerprint-matched, distinct, identity/gateway/country-agreeing proposal → `THREE_REGION_COORDINATE_PROPOSAL_READY` · G10 empty authority → `DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED`, armed-valid builds, armed-stale → `UNRESOLVED` · G11 destination route-node display contract + the recorded frontend blocker · G12 received event coordinate == destination route coordinate · G13 no write to the `warehouses`/`logistics_locations` masters · G14 both coordinate constants and both confirmation constants ship empty/placeholder. All prior V3A–V3G assertions still pass in the same run; only this standalone demo-seed `.gs` is read by this suite → affected sweep shows **0 new failures**.

## Live-validation order (NOT run here — USER-owned)
`TEMP_DEMO4A_DIAGNOSE_DESTINATION_ADDRESS_COORDINATE_CANDIDATES` (read the three actual candidates) → review + fill `DEMO4A_DEST_COORD_PROPOSAL_` from real facility sources → `TEMP_DEMO4A_VALIDATE_DESTINATION_COORDINATE_PROPOSAL` (expect `THREE_REGION_COORDINATE_PROPOSAL_READY`) → mark entries `user_approved` and explicitly paste the authority (`DEMO4A_DEST_COORD_AUTHORITY_`) → `PREFLIGHT` → `DRY_RUN` → copy `demo_plan_checksum` → `COMMIT` → `VALIDATE`.

---

# F1-7N-FA-4A — V3G2: THREE-REGION USER-REVIEWED COORDINATE PROPOSAL

**Status: SOURCE-BOUND PROPOSAL ONLY · TEST-PROVEN (402/0) · NOT AUTHORIZED · NOT LIVE-VERIFIED · NOT LIVE-RUN.** Follow-up to V3G1 (`ecc7d7a`). TEMP demo tool + its offline test + this doc only. No production/master/frontend/schema/bundle change; masters strictly read-only; no DB/property write; **`DEMO4A_DEST_COORD_AUTHORITY_` remains empty**, `DEMO4A_CONFIRMED_SEED_CHECKSUM_` and `DEMO4A_CONFIRMED_CLEAR_TOKEN_` remain placeholders; no Apps Script function executed by the agent.

## Live candidate authority (USER-supplied, from the read-only candidate diagnostic)
| Region | warehouse_id | code | logistics_location_id | live address | live fingerprint |
|---|---|---|---|---|---|
| US_WEST | `WH-KM-US-FBA-BFI4` | BFI4 | `LOC-WH-KM-US-FBA-BFI4` | 21005 64th Ave S, Kent, Washington 98032, US | `06a93100` |
| US_CENTRAL | `WH-KM-US-FBA-AUS2` | AUS2 | `LOC-WH-KM-US-FBA-AUS2` | 2000 E Pecan St, Pflugerville, Texas 78665, US | `82165c14` |
| US_EAST | `WH-KM-US-FBA-ABE2` | ABE2 | `LOC-WH-KM-US-FBA-ABE2` | 705 Boulder Dr, Breinigsville, Pennsylvania 18031, US | `9230a81c` |

**Fingerprint reconstruction (verification, not assumption).** Each supplied fingerprint was reproduced from the live field shape through the existing `DEMO4A_normalizeWhAddress_` + `DEMO4A_hash_` pipeline, and each reproduces **uniquely**: `address_line1` as listed, **`address_line2` blank**, `city` as listed, **`state` holding the FULL state name** (`Washington` / `Texas` / `Pennsylvania`), `postal_code` as listed, `country = US`. This confirms the live `state` column stores the spelled-out state (not the two-letter code) and is what the executable fixture `whLive()` encodes, so the tests bind to the real normalized-address shape rather than to a hand-copied hash.

## A — Proposal entries (`DEMO4A_DEST_COORD_PROPOSAL_`, keyed by UPPERCASE warehouse_code)
| code | latitude | longitude | coordinate_accuracy | coordinate_source_type | coordinate_source_reference |
|---|---|---|---|---|---|
| BFI4 | 47.4145 | -122.25778 | `BUILDING_FOOTPRINT` | `OPENSTREETMAP_BUILDING` | https://mapcarta.com/W500861061 |
| AUS2 | 30.43255 | -97.59852 | `BUILDING_FOOTPRINT` | `OPENSTREETMAP_BUILDING` | https://mapcarta.com/W894331161 |
| ABE2 | 40.55787890788748 | -75.61500997116448 | `ADDRESS_POINT` | `REVIEWED_FACILITY_ADDRESS_POINT` | https://fba-finder.com/usa/pennsylvania/abe2/ |

Every entry also carries `region`, `warehouse_id`, `warehouse_code`, `logistics_location_id`, `address_fingerprint`, `reviewed_at`, `reviewed_by`, `review_status`, `review_version`. Source evidence: the BFI4 page identifies Amazon BFI4 at 21005 64th Avenue South, Kent WA 98032 and exposes the building coordinate; Mapcarta/OSM identifies the Amazon AUS2 warehouse building at 2000 East Pecan Street (secondary address evidence: https://business.pfchamber.com/members/member/aus2-amazon-549); the ABE2 page identifies ABE2 at 705 Boulder Dr, Breinigsville PA 18031 with the stated coordinate.

**Frozen review markers (no live timestamp).** `reviewed_by = USER_SOURCE_REVIEW`, `review_status = PROPOSAL_READY_FOR_USER_VALIDATION`, `reviewed_at = 2026-08-24` (the deterministic source-review date), `review_version = V3G2-USER-SOURCE-REVIEW-1`. These are **constants in source**, not an execution timestamp — the `demo_plan_checksum` stays reproducible across runs. `review_version` is what a later conversion carries into the authority.

## B — Proposal is not authority (proven, not asserted)
1. `DEMO4A_DEST_COORD_PROPOSAL_` contains **exactly three** entries, one per region.
2. `DEMO4A_DEST_COORD_AUTHORITY_` is **still literally `{}`** in source.
3. No helper copies proposal into authority: `DEMO4A_proposalToAuthority_` is pure, converts **only** entries whose `review_status` is `user_approved`, and is **never called** anywhere in the file. `review_status` here is `PROPOSAL_READY_FOR_USER_VALIDATION`, so converting the shipped proposal yields **zero** authority entries. A test also proves nothing ever assigns to `DEMO4A_DEST_COORD_AUTHORITY_` after its empty declaration.
4. The typed PREFLIGHT reason stays **`DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED`**.
5. COMMIT cannot consume proposal rows: with the authority unarmed the build produces **no tables at all**, so no route/event row can be derived from proposal data.
6. Proposal validation is strictly read-only (`getSheetByName` + `getValues`; `DEMO4A_ZERO_WRITE_CONFIRMED`).

## C — Validator alignment: explicit enum, no weakening
The reviewed sources state accuracy in their own vocabulary (`BUILDING_FOOTPRINT` = an OSM building polygon; `ADDRESS_POINT` = a reviewed facility address point), which the V3G1 facility table did not contain. Alignment is an **enumerated alias table by name only** — `DEMO4A_COORD_ACCURACY_CANON_` + `DEMO4A_coordAccuracyFacility_` — mapping `building_footprint`/`building_polygon` → `building` and `address_point` → `address` (plus identity entries and `rooftop_point`/`parcel_centroid`/`premise_point`). **No wildcard path was added and facility-grade validation was not weakened:** an unlisted token resolves to `''` and is refused, and `city`/`zip`/`postal`/`centroid`/`city_centroid`/`approximate`/`interpolated`/`FUZZY` are all still absent from the table, so they still fail. The same helper is now used by `DEMO4A_deriveDestCoordinate_` and `DEMO4A_proposalToAuthority_` (which emits the **canonical** class), so a future USER-approved proposal can satisfy the authority's own accuracy gate without any relaxation — the address-fingerprint requirement is untouched and still fails closed.

Identity checking was tightened at the same time: a proposal's declared `warehouse_code` and `region` must now also match the live selected candidate exactly (previously only `warehouse_id` and `logistics_location_id` were compared), and a declared-but-wrong value is an `IDENTITY_MISMATCH` rather than being ignored.

Against a live-shaped fixture the validator returns **`THREE_REGION_COORDINATE_PROPOSAL_READY`** with every per-region gate passing: exact `warehouse_id` / `warehouse_code` / `logistics_location_id` / `region`, current address fingerprint match, valid non-(0,0) coordinates, three distinct coordinates, facility-grade accuracy, country/region agreement, source reference present, and no gateway/centroid coordinate collision. `authority_armed` is reported as `false` in the same result.

## D — AUS2 address evidence (recorded truthfully, nothing changed)
- The **live DB address fingerprint `82165c14` is built from ZIP 78665** and is authoritative.
- The Pflugerville Chamber listing supports **78665** (2000 E. Pecan St, Pflugerville TX 78665).
- Some third-party map/address datasets publish **78660** for this facility.
- The proposal stays **bound to the live 78665 fingerprint**; the 78660 variant hashes to a *different* fingerprint and is recorded as a public-source discrepancy only.
- **No warehouse address or master field is modified** — the live ZIP is untouched, and a test asserts no fixture warehouse carries 78660.
- The discrepancy **does not** produce `ADDRESS_FINGERPRINT_STALE`: staleness is decided solely by comparing the proposal fingerprint to the *current live* normalized address, which is unchanged. A test asserts the US_CENTRAL region validates without a stale status.

## F — Typed PREFLIGHT reason made executable
The V3G1 not-armed reinterpretation lived inline inside `TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED`, so it could only be proven by a live run. V3G2 extracts it unchanged into the **pure** `DEMO4A_preflightFailureReason_(plan, schemaOk)`, which PREFLIGHT now calls. This matters for the real live condition: with blank live FBA logistics coordinates the destination node is unbindable, so the build fails **early at template selection** (`INSUFFICIENT_STATUS_VALID_DEMO_PLANS`) — it never reaches the destination gate. The pure mapping converts that into `DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED` (verdict `PREFLIGHT_FAILED_COORDINATE_AUTHORITY_NOT_ARMED`) while preserving the raw reason as `underlying_reason`. A genuine identity failure (`DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY`) is **not** reinterpreted, and once the authority is armed the raw build reason is reported unchanged.

## E — Tests (V3G2) — **402 passed / 0 failed**
E1 exactly three entries, one per region · E2/E3/E4 exact BFI4/AUS2/ABE2 values, each proposal fingerprint equal to the fingerprint recomputed from the live-shaped row, and the frozen review markers · E5 the three coordinates are distinct · E6 every proposal coordinate is valid and matches no live port/airport/centroid coordinate · E7 the accepted accuracy classes are an explicit enum (`BUILDING_FOOTPRINT`→`building`, `ADDRESS_POINT`→`address`; centroid/approximate/unknown all refused; a centroid accuracy on a real entry still refused) · E8 all three source references present as reviewable URLs · E9 the live AUS2 address fingerprints to `82165c14`, the proposal is bound to it, and the 78660 variant differs · E10 the validator returns `THREE_REGION_COORDINATE_PROPOSAL_READY` on the live-shaped fixture, with wrong-location-id / wrong-region / seaport-coordinate variants each refused · E11 the populated proposal cannot arm the authority (zero conversion, no assignment path, and a hypothetically approved copy converts to canonical facility-grade entries without touching the live constant while a stale fingerprint still fails closed) · E12 the build reports `warehouses_present` + unarmed authority and the pure mapping yields `DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED` with no tables built · E13 `warehouses`/`logistics_locations` never written · E14 both confirmation constants remain placeholders and the authority constant is still literally empty. All prior V3A–V3G1 assertions still pass in the same run. Full 341-suite sweep: the same 5 pre-existing failures (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-golden-scenarios`, `supply-planning-route-inventory`) read none of the three changed files → **0 new failures**.

## Next step (USER-owned, not run here)
Run `TEMP_DEMO4A_VALIDATE_DESTINATION_COORDINATE_PROPOSAL` against the live sheets and confirm `THREE_REGION_COORDINATE_PROPOSAL_READY`. Only then, in a separate explicit task, mark the entries `user_approved` and paste the converted result into `DEMO4A_DEST_COORD_AUTHORITY_` → `PREFLIGHT` → `DRY_RUN` → copy `demo_plan_checksum` → `COMMIT` → `VALIDATE`.

---

# F1-7N-FA-4A — V3G3: MAP ENDPOINT CONSUMER + COORDINATE-AUTHORITY CLOSURE

**Status: SOURCE-IMPLEMENTED · TEST-PROVEN (demo-seed 461/0 · new map regression 50/0) · NOT LIVE-VERIFIED · NOT LIVE-RUN.** Follow-up to V3G2 (`e0c8a51`). Frontend destination-endpoint consumer + the TEMP demo tool + its tests + this doc. No master-data, schema, bundle, router/API, production-writer or unrelated-page change; masters strictly read-only; no DB/property write; **`DEMO4A_CONFIRMED_SEED_CHECKSUM_` and `DEMO4A_CONFIRMED_CLEAR_TOKEN_` remain `PASTE_..._HERE`**; CLEAR stays staged OFF; no Apps Script function executed by the agent.

## A — Current live state, reported truthfully
The live map showing **1 shipment · 0 route nodes · 0 events · 398 logistics locations** is the **expected** state because **no Demo COMMIT has run**. This is a data-completeness fact, not a frontend rendering bug: `buildReadModel` already reports it through `state.partial` when `shipment_routes`/`shipment_events` are empty. No route or event row was attached to the existing production shipment, and nothing was fabricated — the Demo seed stays an isolated six-table FK-consistent dataset that only appears after an explicit, separately-authorized COMMIT.

## B — The destination endpoint consumer, closed
**Source-cited disconnect (before this change).** `resolveDestinationCoord` (`assets/js/pages/global-logistics-map.js:267`) read **only** `state.idx.locByWh[vm.destWarehouseId]`, and `locByWh` is populated **only for locations that already have a valid coordinate** (`:182` — `if (l.warehouseId && validCoord(l.latitude, l.longitude) && !locByWh[l.warehouseId])`). So for the live condition of BFI4/AUS2/ABE2 — the warehouse-linked `logistics_locations` row exists and joins exactly but carries a **blank** coordinate — the labelled destination endpoint returned `null`, even though `resolveNodeCoord` (`:262`) was already rendering that same facility coordinate as an inline route node. The endpoint marker and the route node were reading different sources.

**Final resolver precedence** (one resolver; no second competing resolver was created):
1. `DEST_WAREHOUSE_LOCATION` — exact `warehouse_id` → warehouse-linked `logistics_locations` **valid** coordinate. **Unchanged and still highest priority.**
2. `DEST_ROUTE_TERMINAL_NODE` — only when (1) is absent: **this shipment's proven final destination route row** coordinate.
3. `null` — unresolved / fail closed (existing behaviour for production shipments without destination evidence).

**Exact lineage gates for the route fallback** (`resolveDestinationRouteNode`; any failure ⇒ `null`):
| Gate | Rule |
|---|---|
| destination authority | `vm.destWarehouseId` must be non-empty |
| verified ordering | every node needs a numeric `sequenceNo > 0`, the maximum must be **unique**, and the last element of the (`:189`) sequence-sorted array must hold it — **never an arbitrary last-array-element pick** |
| exact shipment | `terminal.shipmentId === vm.shipmentId` |
| not a gateway | `nodeType`/`nodeCode`/`plannedEventType` must not match the recognized transit-gateway pattern (port/airport/customs/border/rail/truck terminal/hub/transship/sort/parcel/carrier/**centroid**/waypoint/gateway) |
| not the current marker | `nodeStatusClass(terminal.status) !== 'current'` |
| logistics lineage | `locationRefType === 'logistics_location'` **and** a non-empty `locationRefId` |
| warehouse lineage | `locById[locationRefId]` must exist **and** its `warehouseId` must equal `vm.destWarehouseId` |
| real coordinate | `validCoord(terminal.latitude, terminal.longitude)` — blank/(0,0)/out-of-range/non-numeric rejected |

Because `locById` (`:181`) indexes **all** locations regardless of coordinate validity, the warehouse-lineage gate works precisely in the blank-master-coordinate case. `resolveNodeCoord` and `resolveCurrentPosition` are untouched. No `fetch`/XHR/WebSocket/geocoder/remote host was added — the consumer reads only rows already loaded and is deterministic.

**Payload sufficiency (audited, not inferred).** `normalizeShipmentRouteRecord` (`assets/js/api/operation-system-db-api.js`) exposes `shipmentId`, `sequenceNo`, `nodeType`, `nodeCode`, `plannedEventType`, `locationRefType`, `locationRefId`, `latitude`, `longitude`, `status` — every field the gates need. A route row carries **no** `warehouse_id`, which is why warehouse lineage is proven through `location_ref_id → logistics_locations.warehouse_id` rather than assumed. **No router/API change was required.**

**Why the role gate is negative, not a whitelist.** The seed itself records that `node_type` is an **unfrozen, user-maintained vocabulary** and that structural position is the role authority (`TEMP_demo_shipping_shipment_map_seed_v2.gs:263-264`). A destination whitelist would fail closed on legitimate live data, so the terminal row is rejected only when it *positively* looks like a gateway; the destination claim itself rests on verified terminal position plus exact warehouse lineage.

**New regression test** `assets/tests/shipment-map-destination-endpoint-f1-7n-fa-4a-v3g3.test.js` (**50/0**) **extracts the real functions from the shipped source** (it does not mirror a copy, unlike the older `global-logistics-map.test.js`), proving: B1 the master coordinate still wins and is not overridden; B2 each approved coordinate supplies a **labelled** `destination` placement; B3 ten gateway/centroid node types and a gateway `planned_event_type` are refused, and the seaport row is never promoted when the destination row is absent; B4 a terminal row flagged `current` is refused while the current marker still resolves for the position layer; B5 another shipment's row is refused; B6 blank/(0,0)/out-of-range/string coordinates fail closed; B7 duplicate/zero/non-numeric `sequence_no`, wrong `location_ref_type`, missing/unresolvable `location_ref_id`, a location not linked to the destination warehouse, a mismatched or absent `warehouse_id`, and a shipment with no destination warehouse all fail closed; B8 a production shipment with no routes stays `pending` and resolves exactly as before once a master coordinate exists; B9 `resolveNodeCoord` is unchanged and the route node and endpoint are numerically identical; B10 no network/geocoder reference and exactly one destination resolver.

## C — The three approved authorities, armed
`DEMO4A_DEST_COORD_AUTHORITY_` is now an explicit, immutable source literal with **exactly three** entries and no fourth:

| code | region | warehouse_id | logistics_location_id | fingerprint | latitude | longitude | accuracy (canonical / stated) | source_reference |
|---|---|---|---|---|---|---|---|---|
| BFI4 | US_WEST | `WH-KM-US-FBA-BFI4` | `LOC-WH-KM-US-FBA-BFI4` | `06a93100` | 47.4145 | -122.25778 | `building` / `BUILDING_FOOTPRINT` | https://mapcarta.com/W500861061 |
| AUS2 | US_CENTRAL | `WH-KM-US-FBA-AUS2` | `LOC-WH-KM-US-FBA-AUS2` | `82165c14` | 30.43255 | -97.59852 | `building` / `BUILDING_FOOTPRINT` | https://mapcarta.com/W894331161 |
| ABE2 | US_EAST | `WH-KM-US-FBA-ABE2` | `LOC-WH-KM-US-FBA-ABE2` | `9230a81c` | 40.55787890788748 | -75.61500997116448 | `address` / `ADDRESS_POINT` | https://fba-finder.com/usa/pennsylvania/abe2/ |

Approval metadata on every entry: `review_status: 'user_approved'` · `approved_by: 'USER_APPROVED'` · `reviewed_by: 'USER_SOURCE_REVIEW'` · `approved_at: '2026-08-24'` · `review_version: 'V3G3-USER-APPROVED-1'` — **frozen constants, never a runtime timestamp**, so `demo_plan_checksum` stays reproducible. The canonical facility-grade accuracy is stored, with the stated source vocabulary retained as `stated_accuracy` for review traceability. **Live AUS2 ZIP 78665 remains authoritative and unmutated; 78660 is never substituted.**

**Proposal remains separate from executable authority.** `DEMO4A_DEST_COORD_PROPOSAL_` is retained unchanged as the review evidence with `review_status: 'PROPOSAL_READY_FOR_USER_VALIDATION'`; only `DEMO4A_DEST_COORD_AUTHORITY_` is executable. `DEMO4A_proposalToAuthority_` stays **pure** and converts nothing automatically — converting the shipped proposal still yields **zero** entries — and a test asserts `DEMO4A_DEST_COORD_AUTHORITY_` is **assigned exactly once** in source (its declaration), so no code path re-assigns or auto-promotes into it. A proposal entry can therefore never be consumed by COMMIT.

## D — PREFLIGHT / DRY-RUN contract (offline-proven with the armed authority)
The live-shaped fixture `mastersV3G3()` uses the **real** warehouse ids/codes/addresses with blank FBA master coordinates and exact logistics joins, and consumes the **real shipped constant** (no fixture authority injected). Proven: the plan **builds**; all three destination identities resolve with exact `warehouse_id` + `logistics_location_id`; each of West/Central/East receives **its own** approved coordinate on its final destination route row, with the approved accuracy, source reference and live fingerprint; the final route row carries `location_ref_type = logistics_location` + the exact `location_ref_id` the frontend endpoint consumer requires; the three coordinates are distinct; all **seven** warehouse gates pass including `route_geography_ready`, `map_consumes_destination_coordinate` and `status_truthfulness_ready`, with **no frontend blocker remaining**; the **received** shipment's event coordinate equals its destination route coordinate and references that route row; the **in-transit** shipment has **no** event on its future destination node (which stays `planned`); `shipped`/`in_transit`/`received` statuses stay truthful; the current-marker coordinate is distinct from **both** origin and destination; no approved coordinate collides with a live gateway/centroid coordinate; identical input reproduces an identical `demo_plan_checksum`; changing an approved **coordinate**, **source reference** or **accuracy** changes the checksum; a **stale fingerprint**, a **removed identity**, or a **live address edit** (the 78660 variant) each **fail closed** as `DESTINATION_ADDRESS_COORDINATE_UNRESOLVED`; the durable journal builds and verifies and the inserted-only rollback plan derives (V3A protections intact); and both confirmation constants remain placeholders with **no live checksum pinned in source**, so `COMMITTED_UNVERIFIED` remains impossible.

Also corrected for truthfulness: `DEMO4A_MAP_DEST_COORD_CONSUMPTION_` now records the closed consumer (precedence + the eight lineage gates, `frontend_blocker: ''`), and `DEMO4A_mapDestinationDisplayStatus_` returns `MAP_DESTINATION_DISPLAY_COMPLETE` for the address-derived branch. The new `DEMO4A_mapDestinationEndpointSource_` reports which endpoint source a branch is expected to use (`DEST_WAREHOUSE_LOCATION` / `DEST_ROUTE_TERMINAL_NODE`). The V3G1 `MAP_DESTINATION_DISPLAY_NOT_COMPLETE` blocker is **closed**.

Arming also sharpened one typed reason: a build whose warehouse is **not** one of the three approved codes now fails as `DESTINATION_ADDRESS_COORDINATE_UNRESOLVED` rather than `..._NOT_ARMED` — arming is a global fact, resolvability is per-warehouse. Fixtures that deliberately exercise the unarmed path now pass an explicitly empty authority.

## E/F — Scope, tests and baseline
Changed files (5, all within the allowed set): `assets/js/pages/global-logistics-map.js` · `assets/tests/shipment-map-destination-endpoint-f1-7n-fa-4a-v3g3.test.js` (new, narrowly scoped) · `assets/specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs` · `assets/tests/demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js` · this doc. No master data, production shipment/dispatch writer, schema, bundle, router/API or unrelated frontend page was touched.

Tests: demo-seed **461/0**; new map regression **50/0**; all **18** suites that read `global-logistics-map.js` pass (`global-logistics-map`, `shipment-map-*`, `shipment-runtime*`, `globe-visual-guard`, `api-shipment-workspace`, `api-bounded-backend-readback-endpoints`, `km-api-foundation-compat`, `nav-ia-site-inventory`, `resizable-columns`, `ui-render-and-interaction-feedback`, `shipment-receipt-route`). Full sweep of **342** suites: the same **5 pre-existing** failures (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-golden-scenarios`, `supply-planning-route-inventory`), none of which reads any changed file → **0 new failures**.

## Deployment / sync manifest (USER-owned, nothing run here)
- `APPS_SCRIPT_SYNC_REQUIRED`: `TEMP_demo_shipping_shipment_map_seed_v2.gs` — synced only if/when the demo is exercised.
- `FRONTEND_DEPLOY_REQUIRED`: `assets/js/pages/global-logistics-map.js` — served directly (not bundled); `BUNDLE_REBUILD_REQUIRED: NO`.
- Order after review: push → sync the `.gs` → PREFLIGHT (expect the seven gates green) → DRY_RUN → copy `demo_plan_checksum` into `DEMO4A_CONFIRMED_SEED_CHECKSUM_` → COMMIT → VALIDATE. CLEAR stays staged OFF.

---

# F1-7N-FA-4A — V3G4: WAREHOUSE-AWARE TEMPLATE ELIGIBILITY PIPELINE CLOSURE

**Status: SOURCE-IMPLEMENTED · TEST-PROVEN (demo-seed 535/0 · map regression 50/0) · NOT LIVE-VERIFIED · NOT LIVE-RUN.** Follow-up to V3G3 (`ad5af99`). TEMP demo tool + its offline test + this doc only. No frontend, master-data, schema, bundle, router/API or production-writer change; masters strictly read-only; no DB/property write; the three approved coordinates are unchanged and no fourth was added; `DEMO4A_CONFIRMED_SEED_CHECKSUM_` and `DEMO4A_CONFIRMED_CLEAR_TOKEN_` remain `PASTE_..._HERE`; CLEAR stays staged OFF; no Apps Script function executed by the agent.

## Live evidence being answered
V3G3 deployed; read-only live results: the coordinate proposal validator returned `THREE_REGION_COORDINATE_PROPOSAL_READY` with `authority_armed = true` and all eight per-region gates green, but PREFLIGHT returned `PREFLIGHT_FAILED` / `INSUFFICIENT_STATUS_VALID_DEMO_PLANS` with `schema_gate.ok = true`, `warehouses_present = true`, `coord_authority_armed = true`, `qualified_count = 0`, `current_capable_count = 0`, and `rejection_counts = { NO_ROLE_COMPATIBLE_DESTINATION_LOCATION: 29, NO_ROLE_COMPATIBLE_ORIGIN_LOCATION: 3 }`; DRY_RUN was `DRY_RUN_BLOCKED` for the same reason. All read-only; no write occurred.

## Root cause — verified, not assumed (source-cited)
The hypothesis is **confirmed**. The rejection is emitted at `DEMO4A_bindTemplateRoles_` line **360**:

```
var destination = roleAt(n - 1, 'destination', { country: …destination_country, region: …destination_region });
if (!destination) return { ok: false, reason: 'NO_ROLE_COMPATIBLE_DESTINATION_LOCATION', … };
```

`roleAt` → `DEMO4A_pickAnchor_` (line 300) filters the `logistics_locations` pool with two **hard** gates: `DEMO4A_locValid_(l)` at line **305** (a **valid master coordinate is mandatory**) and the role-compatible canonical `location_type` gate at line **311**. Live: the warehouse-linked FBA rows carry **blank** coordinates (`verification_status = ADDRESS_SEEDED_COORDINATES_PENDING`), so they are excluded by the coordinate gate; the only rows with valid coordinates are gateways, and `DEMO4A_roleCompatibleTypes_(sea|truck|rail, 'destination')` deliberately excludes `airport`. The destination pool is therefore **empty for all 29 templates**.

That failure happens inside `DEMO4A_templateEligibility_` (line 400) → `DEMO4A_selectTemplates_` (line 419 returns `INSUFFICIENT_STATUS_VALID_DEMO_PLANS`), which `DEMO4A_buildPlan_` calls at line **612** and returns from at line **613** — i.e. **before** the V3G warehouse-authority block at lines 626-664 ever executes. The armed authority was structurally unreachable, and the two rules disagreed: eligibility used the generic location pool while build used the warehouse authority.

### Old vs final call graph
| | Old (≤ V3G3) | Final (V3G4) |
|---|---|---|
| PREFLIGHT | → `buildPlan_` | → `buildPlan_` |
| selection | `selectTemplates_(t, n, loc)` — **no warehouses, no authority** | `selectTemplates_(t, n, loc, {warehouses, coordAuthority, company})` |
| destination rule (eligibility) | `bindTemplateRoles_` → `roleAt` → `pickAnchor_` (valid-coordinate + location_type pool) | `bindTemplateRoles_` → **`DEMO4A_destAuthorityForTemplate_`** (warehouse identity authority) |
| destination rule (build) | separate inline warehouse block, after selection | **consumes the binding's `destination_authority`** — the same evaluation |
| result on live evidence | `NO_ROLE_COMPATIBLE_DESTINATION_LOCATION` ×29, `qualified_count 0` | 29 qualified, `DISTINCT_WCE`, three approved destinations |

## B — the single shared eligibility/build evaluator
`DEMO4A_destAuthorityForTemplate_(tpl, warehouses, locations, coordAuthority, company)` is now **the one destination rule**, called by template eligibility **and** (through the returned binding) by final plan construction. It reuses the existing V3G resolvers verbatim — `DEMO4A_resolveWarehouseDestination_` and `DEMO4A_pickWarehouseForRegion_` — so no approximate copy exists. Supporting pieces: `DEMO4A_destAuthorityReason_` (the typed rejection reason), `DEMO4A_warehouseDestBinding_` (**one** destination-binding construction shared by eligibility and build), and the shared `DEMO4A_DEST_READY_BRANCHES_` branch set.

`DEMO4A_bindTemplateRoles_` now returns `destination_authority`; `DEMO4A_templateEligibility_` propagates it; `DEMO4A_selectTemplates_` carries it on the qualified pick; and `DEMO4A_buildPlan_` **consumes** `usedBinding.destination_authority` (the in-transit slot reads its current-marker binding) instead of re-resolving. The shared result therefore carries: template id + region, origin binding, destination warehouse identity, destination logistics lineage, coordinate branch, coordinate evidence (source/accuracy/reference/fingerprint), current binding + `currentCapable`, failure reason, `eligible`. A template can no longer be rejected by one destination rule and built by another.

**One explicit input, no divergence:** the destination company gate needs a company before scope can resolve (scope needs the chosen template's destination country). `destCompany = masters.company || DEMO4A_DEFAULT_COMPANY_` is passed to **both** passes, and after scope resolves the build re-verifies `scope.company === destCompany`, failing closed as `DESTINATION_WAREHOUSE_SCOPE_COMPANY_MISMATCH` rather than silently using two different values.

## A — final authority matrix (warehouses present)
| Role | Authority | Coordinate source | Notes |
|---|---|---|---|
| **ORIGIN** | route/geographic location pool (unchanged) | valid in-corridor master coordinate | transport + node-role compatibility preserved; no fabricated coordinate |
| **CURRENT** | corridor-restricted transit location (unchanged) | valid master coordinate on a compatible **middle** node | required only for the primary in-transit shipment; must stay distinct from origin **and** destination |
| **DESTINATION** | **`warehouses`** (business identity) | (1) valid coordinate on the warehouse-linked `logistics_locations` row → (2) exact approved fingerprint-bound `DEMO4A_DEST_COORD_AUTHORITY_` entry → (3) **fail closed** | exact lineage = the warehouse-linked `logistics_location_id`; the generic gateway/location-type pool is **not consulted at all**; a port/airport/centroid is never a destination fallback and a gateway is never relabelled a warehouse |

When `warehouses` is **absent** (legacy V3A/V3B/V3C fixtures) the previous logistics-only binding is preserved verbatim — the warehouse branch is entered only when `opts.warehouses` is non-empty.

## C — eligibility rules and D — failure reasons
A template is eligible (warehouse-aware) only when: active · node count + unique sequences pass · origin resolves truthfully · the destination country/region resolves to an **eligible warehouse** (declared `destination_warehouse_id`, else deterministic same-region selection) · the exact warehouse + address fingerprint + coordinate authority resolves · the destination terminal can carry `location_ref_type = logistics_location` + the exact warehouse-linked `logistics_location_id` + the approved coordinate · route-geography and status/event truthfulness gates pass. **Current-capable** additionally requires a valid distinct middle current marker. Three **distinct** `US_WEST`/`US_CENTRAL`/`US_EAST` plans are still preferred (`DISTINCT_WCE`), the three-status-valid-plan requirement is **not** lowered, and no OTHER-region replacement is fabricated (V3C's pre-existing, explicitly-labelled `FALLBACK_TRUTHFUL_TOP3` still applies when a region genuinely cannot resolve).

Typed reasons now emitted: `DESTINATION_WAREHOUSE_IDENTITY_UNRESOLVED` · `DESTINATION_WAREHOUSE_LOCATION_LINEAGE_UNRESOLVED` (missing/conflicting join) · `DESTINATION_ADDRESS_COORDINATE_UNRESOLVED` (absent/stale approved coordinate) · `NO_ROLE_COMPATIBLE_ORIGIN_LOCATION` · `NO_ROLE_COMPATIBLE_CURRENT_LOCATION`. **`NO_ROLE_COMPATIBLE_DESTINATION_LOCATION` is never reported once the warehouse authority is active**, because no location-type pool is consulted for the destination. `DEMO4A_selectTemplates_` also surfaces the *most specific* cause instead of the generic count reason: destination identity/lineage failures roll up to `DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY`, coordinate failures to `DESTINATION_ADDRESS_COORDINATE_UNRESOLVED` (armed) / `..._AUTHORITY_NOT_ARMED` (unarmed), and a single dominant origin/current cause is reported as itself. Every prior typed expectation (V3F/V3G/V3G1/V3G2/V3G3) is preserved by this mapping — no existing assertion had to be relaxed.

## E — live-shaped offline proof
`mastersLive()` reproduces the actual live shape: **29 templates** (10 West / 10 Central / 9 East) whose four timeline nodes carry blank coordinates and node codes matching **no** location (zero exact identifier matches); the three approved warehouses with their real live addresses; each warehouse-linked `logistics_locations` row present and joined exactly with **blank** latitude/longitude and `verification_status = ADDRESS_SEEDED_COORDINATES_PENDING`; and **only** gateway rows (CN/US ports + a US East airport) carrying valid master coordinates.

**The regression, on identical evidence with no master-data change:**
- old rule → `INSUFFICIENT_STATUS_VALID_DEMO_PLANS`, `rejection_counts.NO_ROLE_COMPATIBLE_DESTINATION_LOCATION = 29`, `qualified_count = 0` (reproducing the live PREFLIGHT exactly);
- new rule → `ok`, `warehouse_aware_template_evaluation = true`, `qualified_count = 29`, `available_regions = {W:10, C:10, E:9}`, `region_selection_mode = DISTINCT_WCE`, `current_capable_count > 0`, and `NO_ROLE_COMPATIBLE_DESTINATION_LOCATION` absent from the rejection counts.

Also proven: BFI4/AUS2/ABE2 each make their own region destination-eligible with the exact warehouse id, logistics lineage, live fingerprint and **its own** approved coordinate; all three qualify simultaneously and the live-shaped plan builds; with **every** valid-coordinate location stripped the destination still resolves (no location-type dependency) and only the origin fails — reported as `NO_ROLE_COMPATIBLE_ORIGIN_LOCATION`; a region with no eligible warehouse fails closed as `DESTINATION_WAREHOUSE_IDENTITY_UNRESOLVED` and the US East **airport is never** the destination route row; a stale fingerprint, a missing authority entry and a lineage conflict each exclude that warehouse (and, when all three fail, fail the plan closed with the typed reason); origin/current compatibility remains enforced and the current marker stays a transit gateway distinct from both endpoints; selection and build consume the same evaluation (the constructed route row's coordinate equals the qualifying evaluation's); the final terminal carries the exact approved coordinate and the warehouse-linked `location_ref_id`; exactly **one** received event exists and only at the approved final warehouse route row; the in-transit destination stays `planned` with no event; the W/C/E plan and its checksum are deterministic and the checksum changes on any approved coordinate/source/accuracy change; the durable journal builds and verifies, inserted-only rollback derives, and existing-state classification still works; and both confirmation constants remain placeholders so `COMMITTED_UNVERIFIED` stays impossible.

## F — PREFLIGHT output contract
The plan and both PREFLIGHT/DRY_RUN success paths now expose `warehouse_aware_template_evaluation`, `qualified_count`, `current_capable_count`, `available_regions`, `rejection_counts`, `chosen_templates`, and a **capped (≤6)** `destination_authority_errors` list carrying, per affected template, its `route_template_id`, region, reason code, branch, exact `warehouse_id`/`warehouse_code`, `logistics_location_id`, `address_status` and `address_fingerprint`. Per-shipment evidence continues to report the origin/current/destination authority, coordinate branch, exact warehouse id, exact `logistics_location_id`, address fingerprint, map endpoint readiness (`DEST_ROUTE_TERMINAL_NODE`) and all binding/status/geography gates. No template, node, warehouse or location dump was added.

## Tests, baseline and scope
demo-seed **535/0** (was 461/0); the V3G3 map regression **50/0** (unchanged, `global-logistics-map.js` untouched); the demo-seed suite is the only suite reading the changed TEMP file. Full sweep of **342** suites: the same **5 pre-existing** failures (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-golden-scenarios`, `supply-planning-route-inventory`), none of which reads a changed file → **0 new failures**.

Changed files (3, allowed only): `assets/specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs` · `assets/tests/demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js` · this doc. **No file outside the allowed three was required** — the fix is entirely inside the seed's own selection pipeline.

## Apps Script sync manifest (USER-owned, nothing run here)
- `APPS_SCRIPT_SYNC_REQUIRED`: `TEMP_demo_shipping_shipment_map_seed_v2.gs` (this is the file whose live behaviour changes).
- `FRONTEND_DEPLOY_REQUIRED`: none this round (V3G3's `global-logistics-map.js` change already shipped).
- `BUNDLE_REBUILD_REQUIRED`: NO.
- Order after review: push → sync the `.gs` → PREFLIGHT (expect `warehouse_aware_template_evaluation: true`, `qualified_count > 0`, three W/C/E chosen templates and the seven gates green) → DRY_RUN → copy `demo_plan_checksum` into `DEMO4A_CONFIRMED_SEED_CHECKSUM_` → COMMIT → VALIDATE. CLEAR stays staged OFF.

---

# F1-7N-FA-4A — V3G4A: COMPACT READ-ONLY AUTHORIZATION ENVELOPE

**Status: SOURCE-IMPLEMENTED · TEST-PROVEN (demo-seed 637/0 · map regression 50/0) · NOT LIVE-VERIFIED · NOT LIVE-RUN.** Follow-up to V3G4 (`6b30292`). TEMP demo tool + its offline test + this doc only. No frontend/router/API/master/schema/bundle change; masters strictly read-only; no DB/property write; the three approved coordinates and the coordinate authority are unchanged; `DEMO4A_CONFIRMED_SEED_CHECKSUM_` and `DEMO4A_CONFIRMED_CLEAR_TOKEN_` remain `PASTE_..._HERE`; CLEAR stays staged OFF; no Apps Script function executed by the agent.

## Live evidence being answered
V3G4 live PREFLIGHT **reached the correct warehouse-aware path** — `schema_gate.ok = true`, `region_selection_mode = DISTINCT_WCE`, `available_regions {US_WEST: 7, US_CENTRAL: 7, US_EAST: 7}`, `warehouse_aware_template_evaluation = true`, `qualified_count = 21`, `current_capable_count = 21`, `planned_counts {3, 8, 3, 8, 46, 5, total 73}`, selected templates `SRT-TOP-CN-USW/USC/USE-S-T-V1`, and the East shipment resolved to `WH-KM-US-FBA-ABE2` / `LOC-WH-KM-US-FBA-ABE2` / `DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE` / renderable / fingerprint `9230a81c`. The single Logger entry was then **truncated before** the final verdict, `existing_state`, the complete gates, the West/Central evidence, `demo_plan_checksum` and the zero-write marker. No live write occurred. The pipeline is therefore working; only the *evidence channel* was too large.

## A — one compact entrypoint
`TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION()` is strictly read-only (`getSheetByName` + `getValues` only) and emits **exactly one** Logger entry, `DEMO4A_AUTHORIZATION_SUMMARY {…}`, serialized **without** pretty-printing. It parses no other log entry and calls **no other TEMP entrypoint**, so no nested verbose logging is produced (tests assert `Logger.log(` appears exactly once in its body and that no `TEMP_DEMO4A_(PREFLIGHT|DRY_RUN|COMMIT|VALIDATE|CLEAR|DIAGNOSE)` reference exists inside it).

It invokes the **same pure logic** the real PREFLIGHT and DRY_RUN use — `DEMO4A_schemaGate_`, `DEMO4A_readMasters_`, `DEMO4A_buildPlan_`, `plan.binding_gates`, `DEMO4A_warehouseGates_`, `DEMO4A_readLive_` + `DEMO4A_classifyState_`, `DEMO4A_validateCoordProposal_` — and **no second approximate evaluator** exists. To guarantee that, the PREFLIGHT verdict table was **extracted** into the pure `DEMO4A_preflightVerdict_(schemaOk, plan, warehouseGates, classification)`, which PREFLIGHT itself now calls: one rule, two callers. The pure envelope builder is `DEMO4A_authorizationSummary_(schema, masters, plan, planRepeat, live, proposalValidation)` and it logs nothing.

## B/D — the compact envelope
All required fields are carried: `tool`, `mode`, `output_contract`, `authority_contract_version` (`V3G4A-1`), `schema_ok`, `masters_ok`, `proposal_verdict`, `proposal_entries`, `coordinate_authority_armed`, `coordinate_authority_entries`, `warehouse_aware_template_evaluation`, `qualified_count`, `current_capable_count`, `region_selection_mode`, `available_regions`, `selected_templates` (**only** `template_id` + `region` + `node_count`), `scope` (`company`/`country`/`marketplace`/`sku_pair_count`), `planned_counts` (all six tables + `total`), `per_shipment` (**exactly three** objects carrying only the 18 authorized fields), `gate_summary` (the five binding gates + the seven warehouse gates + `live_plan_shape_valid` + `all_pass`), `existing_state` (`classification`, `duplicate_pk_count_total`, `unexpected_demo_id_count`), `demo_plan_checksum`, `preflight_verdict`, `preflight_reason`, `predicted_dry_run_verdict`, `may_run_dry_run`, `may_arm_commit_checksum`, and `DEMO4A_ZERO_WRITE_CONFIRMED`.

`live_plan_shape_valid` is a new derived gate (not a duplicated evaluator): exactly 3 shipping_plans, 3 shipments and 3 per-shipment objects, a positive row count in every one of the six tables, and `total` equal to the sum of the six counts.

**Deliberately excluded** (the V3G4 truncation cause): headers, master row dumps, `destination_authority_errors`, rejection examples, `binding_evidence`, route/event rows, SKU pairs, the checksummed manifest and per-field validation arrays. On failure the envelope keeps only `rejection_counts` plus at most **five** short reason codes (`DEMO4A_AUTH_MAX_REASON_CODES_`), and no shipments/templates at all.

**Measured sizes (offline fixture):** the READY envelope serializes to **3553 bytes** and the blocked envelope to **947 bytes** — both far below the declared 6000-byte safe ceiling and orders of magnitude below the Apps Script Logger limit. Tests also assert the byte offsets of `preflight_verdict`, `demo_plan_checksum` and `may_run_dry_run` all sit inside the ceiling, so no authorization-bearing field can be truncated away.

## C — the authorization conjunction
`may_run_dry_run` is true **only** when every clause holds: `schema_ok` · `masters_ok` (all six master tables present) · `proposal_verdict === THREE_REGION_COORDINATE_PROPOSAL_READY` · `proposal_entries === 3` · coordinate authority armed · exactly 3 authority entries · `warehouse_aware_template_evaluation` · `qualified_count >= 3` · `current_capable_count >= 1` · `region_selection_mode === DISTINCT_WCE` · all three of W/C/E available · exactly three selected templates covering W/C/E once each · exactly three planned shipments · `live_plan_shape_valid` (all six counts positive/consistent) · `gate_summary.all_pass` · `existing_state.classification === ABSENT_ALL` · zero duplicate PKs · zero unexpected Demo ids · non-empty `demo_plan_checksum` · `preflight_verdict === READY_FOR_DEMO_SEED` · `predicted_dry_run_verdict === DRY_RUN_READY`.

`may_arm_commit_checksum` additionally requires the **dry-run core to be re-evaluated read-only** over the same masters and to reproduce the **same** `demo_plan_checksum` (`dry_run_core_checksum_reproduced`, a determinism proof), **and** the confirmation constant to still be `PLACEHOLDER`. Per the C contract this is the stated exception under which the flag may be true; it is a **read-only recommendation only** — neither the entrypoint nor the core ever assigns `DEMO4A_CONFIRMED_SEED_CHECKSUM_` (asserted by test), so arming remains an explicit USER paste. A non-reproducing checksum blocks arming while leaving `may_run_dry_run` intact.

## E — tests (V3G4A) — demo-seed **637/0**
E1 exactly one Logger entry, and it is the compact non-pretty-printed `DEMO4A_AUTHORIZATION_SUMMARY` · E2 no other TEMP entrypoint is called and the pure core logs nothing · E3 the READY envelope (3553 B) and the failure envelope (947 B) are both under the fixed ceiling, and no `binding_evidence`/master dump/route-event dump/SKU pairs/error arrays leak in · E4 every required field present, with `scope`, `planned_counts`, `existing_state` and all fourteen `gate_summary` keys verified · E5 exactly three shipment objects carrying **only** the 18 authorized keys · E6 exact W/C/E coverage, the three approved warehouse codes once each, each renderable with its live fingerprint · E7 the full conjunction — a false schema, an absent master table, a non-READY proposal verdict, a wrong proposal-entry count, live rows already present, and a blocked plan each set `may_run_dry_run` false · E8 verdict/checksum/authorization flags all sit inside the ceiling · E9/E10 `ABSENT_ALL` is required while `PRESENT_EXACT_ALL`, a partial state and duplicate PKs each block · E11 a single false binding gate blocks (and `all_pass` follows), and an impossible planned shape fails `live_plan_shape_valid` · E12 `FALLBACK_TRUTHFUL_TOP3` blocks · E13 a missing available region blocks · E14 fewer than three templates, three templates not covering W/C/E, a current-incapable selection and `qualified_count < 3` each block · E15 a changed approved coordinate surfaces a different `demo_plan_checksum`, and a non-reproducing dry-run core checksum is reported and blocks arming · E16 no write API is reachable from the entrypoint or the core · E17 the extracted verdict rule reproduces the previous PREFLIGHT table for all six outcomes and PREFLIGHT is proven to consume it · E18 journal build/verify and inserted-only rollback intact · E19 both confirmation constants remain placeholders and neither the entrypoint nor the core ever assigns them · E20 all pre-existing demo-seed assertions continue to pass (637 total, up from 535, with none relaxed).

## Baseline and scope
demo-seed **637/0** (was 535/0); the V3G3 map regression **50/0** unchanged; the demo-seed suite is the only suite reading the changed TEMP file. Full sweep of **342** suites: the same **5 pre-existing** failures (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-golden-scenarios`, `supply-planning-route-inventory`), none of which reads a changed file → **0 new failures**. Changed files (3, allowed only): the seed `.gs`, its test, and this doc.

## Apps Script sync manifest (USER-owned, nothing run here)
- `APPS_SCRIPT_SYNC_REQUIRED`: `TEMP_demo_shipping_shipment_map_seed_v2.gs` (adds the new entrypoint and the extracted verdict rule).
- `FRONTEND_DEPLOY_REQUIRED`: none · `BUNDLE_REBUILD_REQUIRED`: NO.
- Order after review: push → sync the `.gs` → run **`TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION`** first and read the single compact envelope (expect `preflight_verdict: READY_FOR_DEMO_SEED`, `may_run_dry_run: true`, `gate_summary.all_pass: true`, `existing_state.classification: ABSENT_ALL`, three W/C/E shipments) → DRY_RUN → copy `demo_plan_checksum` into `DEMO4A_CONFIRMED_SEED_CHECKSUM_` → COMMIT → VALIDATE. CLEAR stays staged OFF. The `d38a2ccf` checksum seen in the offline fixture is a TEST value, not a live one — only the live envelope's checksum may ever be pasted.

---

# F1-7N-FA-4A — V3G5: POST-WRITE CONTENT_DRIFT FORENSICS + CANONICALIZATION CLOSURE

**Status: SOURCE-IMPLEMENTED · TEST-PROVEN (demo-seed 753/0 · map regression 50/0) · NOT LIVE-VERIFIED · NOT LIVE-RUN.** Follow-up to V3G4A (`1022ff7`). TEMP demo tool + its offline test + this doc only. No frontend/router/API/master/schema/bundle change; no DB/property/master write; the three approved coordinate authorities are unchanged; `DEMO4A_CONFIRMED_SEED_CHECKSUM_` and `DEMO4A_CONFIRMED_CLEAR_TOKEN_` remain `PASTE_..._HERE`; CLEAR stays staged OFF; no second COMMIT attempt; the live journal was neither cleared nor mutated; no Apps Script function executed by the agent.

## Live incident recap
The controlled COMMIT ran once with `demo_plan_checksum = 7e4cf9d9` from `ABSENT_ALL`, inserted exactly 3 / 8 / 3 / 8 / 46 / 5, then failed `POSTCHECK_NOT_EXACT:CONTENT_DRIFT` → `COMMIT_FAILED_POSTCHECK_ROLLED_BACK`, rolling back exactly those rows. Independent read-only recheck: `ABSENT_ALL`, 0 duplicate PKs, 0 unexpected demo ids, checksum still `7e4cf9d9`, confirmation constant `PLACEHOLDER`, zero-write confirmed. So rollback worked, no rows remain, plan/checksum are stable, and the coordinate authority is not the failure.

## A — root cause: **SOURCE-PROVEN** (two mechanisms, both in the write→readback path)
The writer projects each intended row onto the **live physical headers** — `DEMO4A_rowForHeaders_` (`:1191`) called from `sh.appendRow(...)` in the insert phase — while the post-check compares `Object.keys(intendedRow)` inside `DEMO4A_classifyState_`. Two mechanisms therefore produce `CONTENT_DRIFT` *after* a technically successful `setValues`/`getValues` round trip:

**(1) `WRITER_INTENDED_FIELD_NOT_IN_PHYSICAL_HEADER`.** An intended field whose physical column does not exist is **silently dropped** on write (`headers.map(h => obj[h] …)` never emits it) and reads back **absent** → canonical `''`, while the intended value is non-empty → field mismatch → row `DRIFT` → `CONTENT_DRIFT`. This was never gated: `DEMO4A_schemaGate_` only proves `DEMO4A_REQUIRED_COLS_` presence, and the plan writes **34 fields beyond that list** (measured: shipping_plans +13, shipping_plan_lines +4, shipments +9, shipment_lines +3, shipment_events +5; shipment_routes +0). Every one of those was written unverified.

**(2) `DATE_WALLCLOCK_ASYMMETRY`.** All intended date/datetime values are plain **strings** (`'2026-08-24'`, `'2026-08-20 09:00:00'` — verified: no intended value is a Date object). A date-formatted cell returns a **Date object** from `getValues()`. The old canonicalizer took two different paths for the two sides: the string path applied **no** timezone maths while the Date path shifted by a **hardcoded +8 h**. The two sides therefore agreed **only** when the spreadsheet timezone was exactly UTC+8; at any other offset every one of the 73 rows drifts on `created_at` / `updated_at` / `event_time` (and the date fields). This is reproduced offline and then repaired.

Both are now closed. Neither fix relaxes comparison: nothing was declared "string ≈ number", no `JSON.stringify` on raw rows, no field ignored without an explicit contract, no arbitrary lowercasing, blank is never 0/false, coordinates are never rounded, the post-check is never skipped, `PARTIAL`/`CONTENT_DRIFT` are never accepted, and no rows are ever left behind.

## Six-table field-class matrix (B)
`DEMO4A_FIELD_CLASS_` now declares an **explicit class for every field the writer owns** — proven by the diagnostic's `all_intended_fields_have_class` (the first run of that check found 7 undeclared fields — `shipping_plan_no`, `plan_name`, `requested_qty`, `approved_qty`, `shipment_no`, `shipment_total_qty`, `shipment_qty` — each of which already fell back to the correct class, so declaring them changed no canonical value).

| Class | Members (writer-owned) | Canonical rule |
|---|---|---|
| `identifier` | all six PKs, `route_template_id`, `route_template_node_id`, `location_ref_id`, `warehouse_id`, `source_warehouse_id`, `destination_warehouse_id`, `carrier_id`, `sku`, `site_sku`, `shipping_plan_no`, `shipment_no`, `container_no`, `tracking_number`, `node_code`, `postal_code`, … | exact text, trim only; **never** numeric-coerced, leading zeros preserved |
| `enum` | `status`, `batch_status`, `plan_status`, `event_type`, `event_status`, `raw_status`, `location_ref_type`, `node_type`, `transport_mode`, `planned_event_type`, `shipping_method`, `last_mile_delivery`, `ship_from_type`, `destination_type`, `marketplace`, `marketplace_seperate`, `company`, `country`, `currency`, `source`, `source_page` | exact text, **never lowercased** (case is significant) |
| `text` | `location_name`, `note`, `destination`, `ship_from`, `region`, `city`, `plan_name`, `created_by`, `updated_by` | exact business text |
| `numeric` | `plan_carton_qty`, `shipment_carton_qty`, `units_per_carton`, `plan_version`, `sequence_no`, `event_sequence`, `requested_qty`, `approved_qty`, `shipment_qty`, `shipment_total_qty`, `total_qty`, `qty` | finite → stable canonical decimal; **0 is real, blank is not 0**; unparseable → `NUM_INVALID:<raw>` (fails closed); never rounded |
| `coordinate` | `latitude`, `longitude` | classified **separately**; stable canonical decimal, non-lossy, no tolerance window; unparseable → `COORD_INVALID:<raw>` |
| `boolean` | `is_active`, `is_receiving_enabled`, `is_deleted`, `is_primary`, `is_default` (declared for completeness — the writer owns none today, so adding the class moved nothing) | only explicit accepted representations → `TRUE`/`FALSE`; **false ≠ blank**; anything else → `BOOL_INVALID:<raw>` |
| `date` | `etd`, `eta`, `actual_departure_date`, `actual_arrival_date`, `delivered_date`, `planned_arrival_date`, `planned_departure_date` | one wall-clock `YYYY-MM-DD`; unparseable → `DATE_INVALID:<raw>` |
| `datetime` | `created_at`, `updated_at`, `event_time` | one wall-clock `YYYY-MM-DD HH:MM:SS`; **never conflated with date-only**; unparseable → `DATETIME_INVALID:<raw>` |

Blank canonicalizes to `''` **only** for `null` / `undefined` / empty-cell values, and a blank can never equal `0`, `FALSE`, or any `*_INVALID:` sentinel.

## Old vs final canonicalization (B)
| | Old | Final (`DEMO4A_CANON_CONTRACT_VERSION_ = V3G5-CANON-1`) |
|---|---|---|
| classes | 4 regex-derived kinds (`datetime`/`date`/`numeric`/`string`) | 8 explicit classes, declared per field name, with a reported fallback |
| invalid values | silently compared as raw text | typed `*_INVALID:` sentinels → **fail closed** |
| booleans | fell into `string` (so `true` ≠ `TRUE`) | explicit accepted set → `TRUE`/`FALSE`; unrelated strings fail closed |
| coordinates | lumped with business numerics | own class, stable canonical decimal, non-lossy |
| Date objects | hardcoded **+8 h** shift | `DEMO4A_CANON_TZ_OFFSET_MIN_`, an **explicit** contract value synced from the spreadsheet's own timezone (`DEMO4A_syncCanonTz_`, default 480) |
| callers | duplicate logic risk | **one** contract: `DEMO4A_canonField_` behind `DEMO4A_canon_`, used by the intended plan checksum (`DEMO4A_rowChecksum_`), the post-write readback (`DEMO4A_classifyState_`/`DEMO4A_mismatchedFields_`), VALIDATE, and the REUSED retry comparison |

**The plan checksum is unchanged.** The intended side is entirely plain strings/numbers and never takes the Date path, so `7e4cf9d9` is still the checksum this plan produces — proven by test (`the plan checksum is reproducible under the shared contract`, plus a test asserting all intended `created_at` values are strings). All 637 pre-V3G5 assertions passed unmodified after the contract swap, which is the strongest evidence it is drop-in.

**Repair for mechanism (1):** the new pure `DEMO4A_writerProjectionGaps_(plan, headersByTable)` runs in COMMIT **before the journal property write and before any insert** and blocks with `COMMIT_BLOCKED_WRITER_PROJECTION_INCOMPLETE` / `WRITER_INTENDED_FIELD_NOT_IN_PHYSICAL_HEADER` and **zero writes**, naming the exact table + field + class. Writer-**unowned** physical columns are explicitly out of contract: the comparison only ever uses intended fields, so extra/default/formula columns are **counted and reported**, never compared — proven including a test that a foreign production value in an unowned column causes no drift and never leaks into the forensics.

## C — compact postcheck drift forensics
`DEMO4A_driftEvidence_(classification)` is pure and runs over the **already-computed** classification (no extra reads), then the postcheck **still throws**. The envelope carries `classification`, `mismatching_table_count`, `mismatching_row_count`, `mismatching_field_count`, `counts_by_table`, `counts_by_reason_class`, `example_cap` and at most **20** examples. Each example carries **only** nine keys: `table`, `pk_fingerprint` (hashed — raw PKs never appear), `field`, `field_class`, `intended_type`, `live_type`, `intended_canonical`, `live_canonical` (both clipped to 40 chars + overflow count), `reason_code`. Reason codes: `MISSING_PHYSICAL_FIELD` · `LIVE_BLANK_INTENDED_VALUE` · `LIVE_VALUE_INTENDED_BLANK` · `LIVE_CANONICAL_INVALID` · `INTENDED_CANONICAL_INVALID` · `DATE_WALLCLOCK_ASYMMETRY` · `BOOLEAN_REPRESENTATION` · `NUMERIC_REPRESENTATION_OR_VALUE` · `VALUE_MUTATION`. No whole rows, never all 73 rows; measured under 6 KB even when every row drifts.

The unified catch is unchanged in behaviour: it captures the evidence (assigned **before** the throw, from an outer-scope variable), rolls back exactly this execution's inserted IDs in reverse FK order, flushes, verifies absence, and emits `COMMIT_FAILED_POSTCHECK_ROLLED_BACK` or `COMMIT_FAILED_POSTCHECK_ROLLBACK_UNVERIFIED`. `COMMITTED_UNVERIFIED` does not exist anywhere in source.

## D — read-only pre-retry diagnostic
`TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION()` — strictly read-only, one compact `DEMO4A_CANONICALIZATION_DIAGNOSTIC {…}` entry, no other TEMP entrypoint called, no write API reachable. It reads the six real physical header rows and classifies each column from **existing cells only** (`date_formatted` / `numeric_cell` / `boolean_cell` / `text_cell` / `empty`), projects the intended 73-row plan through the shared contract, and reports: contract version, `schema_ok`, `plan_checksum`, `planned_counts`, `field_class_counts`, `writer_projection_complete` (+ missing fields), `all_intended_fields_have_class`, `unknown_field_classes`, `physical_alias_resolution` (per-table `marketplace` / `marketplace_seperate` presence — reported only; the Flow-A authority is never redefined), the date/datetime/numeric/boolean/coordinate/text-identifier field sets, `blank_optional_fields`, `live_column_number_format_classes`, `predicted_roundtrip_risk_fields` + `risk_count`, `canonicalization_tz`, `journal_status_read_only`, `previous_failed_checksum_matches_current_plan`, `confirmation_constant_status`, `existing_state_classification` and a verdict. It sets `round_trip_performed: false` — every risk is a **static prediction**, and the tool never claims to have performed a Sheet write/read round trip. Verdicts: `READY_FOR_CONTROLLED_RETRY` · `CANONICALIZATION_RISK_REMAINS` · `UNKNOWN_FIELD_CLASS` · `PHYSICAL_SCHEMA_ALIAS_CONFLICT` · `EXISTING_STATE_NOT_ABSENT` · `JOURNAL_STATE_UNSAFE_FOR_RETRY`. Only the source-proven mechanism is reported as a risk (`DATE_WALLCLOCK_OFFSET_MISMATCH`); a date-formatted column at a matching offset is reported in the format classes but **not** invented as a risk, because the offline round trip proves it exact.

## E — stale-journal retry safety (existing source, proven offline; nothing mutated)
A failed rolled-back attempt **cannot** authorize CLEAR, through four independent gates in `TEMP_DEMO4A_CLEAR_SHIPPING_SHIPMENT_MAP_SEED`: the clear token is a source constant still on `PASTE_DEMO_CLEAR_TOKEN_HERE` → `CLEAR_REFUSED_STAGED_OFF` (code never writes it); the token must equal the **current** plan checksum; the journal must pass **full** integrity verification against `DEMO4A_buildJournal_(currentPlan)` (a journal from a different plan fails — proven); and the live state must be `PRESENT_EXACT_ALL`, whereas after the rollback it is `ABSENT_ALL` → refused. Deletion is restricted to `DEMO4A_allIds_(plan)` via `DEMO4A_deleteRowsByPk_(name, set)`, so unrelated or pre-existing rows can never be removed, and an external-reference audit runs first.

A retry is bound to the current execution: COMMIT rebuilds the journal from the plan under lock, `setProperty` **overwrites** the stale one, and performs a full property readback + integrity verification **before** the first table insert (assertion: `DEMO4A_verifyJournal_` precedes `phase = 'insert'`). The journal binds `plan_checksum` and the exact `intended_ids` for all six tables. No source change was required; the live journal was not cleared or mutated.

## F — tests (demo-seed **753/0**, was 637/0)
An Apps-Script-like round-trip simulator projects the intended 73 rows onto physical headers and applies the real coercions (date-formatted → `Date`, numeric → `number`, checkbox → `boolean`, absent column → `undefined`), then classifies. Proven: an exact round trip is `PRESENT_EXACT_ALL` (both with coercions and as plain text); a canonical offset not matching the spreadsheet reproduces `CONTENT_DRIFT` with reason `DATE_WALLCLOCK_ASYMMETRY` and syncing the offset repairs it; a dropped physical column reproduces `CONTENT_DRIFT` with reason `MISSING_PHYSICAL_FIELD` and is caught by the pre-write gate (which is proven to run before the journal write and before any insert); Date-vs-ISO agreement on datetime and date-only never conflated; number vs numeric string equal; `0` ≠ blank; `false` ≠ blank; unparseable numeric/date/datetime fail closed and never equal blank; leading zeros preserved (`007`, `07101`, `0012`); business text and enums exact with case significant; coordinates stable and non-lossy; both marketplace spellings declared enum text; writer-unowned columns ignored by explicit contract and never leaked; seven real business mutations (SKU, qty, status, ETA, warehouse, location_ref, coordinate) still detected with the exact table/PK-fingerprint/field/reason; a blanked live value classified distinctly from a missing column; evidence capped at 20 with nine authorized keys, clipped values, fingerprinted PKs and under 6 KB; the evidence is captured before the throw and the catch still rolls back and still requires rollback verification; `COMMITTED_UNVERIFIED` absent from source; the four CLEAR gates and the stale-journal proofs above; exact success `PRESENT_EXACT_ALL` and exact retry `REUSED` with six zero deltas; the plan checksum reproducible; and both confirmation constants still placeholders. All V3A–V3G4A assertions continue to pass — the three V3A source-fact regexes were re-pointed at the new (strictly stronger) COMMIT source shape, none relaxed.

Baseline: the V3G3 map regression **50/0** unchanged; the demo-seed suite is the only suite reading the changed TEMP file; full sweep of **342** suites shows the same **5 pre-existing** failures (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-golden-scenarios`, `supply-planning-route-inventory`), none reading a changed file → **0 new failures**.

## Sync manifest (USER-owned, nothing run here)
- `APPS_SCRIPT_SYNC_REQUIRED`: `TEMP_demo_shipping_shipment_map_seed_v2.gs` · `FRONTEND_DEPLOY_REQUIRED`: none · `BUNDLE_REBUILD_REQUIRED`: NO.
- Retry order after review: push → sync the `.gs` → run **`TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION`** first. If it reports `writer_projection_complete: false` the named columns are the incident's cause (add them to the physical schema in a separate authorized task — this task changed no schema). If it reports a `DATE_WALLCLOCK_OFFSET_MISMATCH` risk, the timezone sync now handles it automatically at run time. Only on `READY_FOR_CONTROLLED_RETRY` → `TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION` → DRY_RUN → re-copy `demo_plan_checksum` → COMMIT → VALIDATE. CLEAR stays staged OFF. The checksum should still read `7e4cf9d9`; verify it from the live DRY_RUN rather than assuming.

---

# F1-7N-FA-4A — V3G5A: SOURCE/DESTINATION WAREHOUSE LINEAGE + LIVE PROJECTION CLOSURE

**Status: SOURCE-IMPLEMENTED · TEST-PROVEN (demo-seed 845/0 · map regression 50/0) · NOT LIVE-VERIFIED · NOT LIVE-RUN.** Follow-up to V3G5 (`694aaff`). TEMP demo tool + its offline test + this doc only. No DB header/schema change, no migration, no master data change, no production handler / router / API / frontend / bundle change, `global-logistics-map.js` untouched, coordinate proposals and the three approved authorities untouched, `DEMO4A_CONFIRMED_SEED_CHECKSUM_` and `DEMO4A_CONFIRMED_CLEAR_TOKEN_` remain `PASTE_..._HERE`, the prior journal was neither cleared nor mutated, no Apps Script function executed.

## Live diagnostic recap
`TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION` returned `schema_ok: true`, `plan_checksum: 7e4cf9d9`, `all_intended_fields_have_class: true`, `unknown_field_classes: []`, `alias_conflict: false`, `predicted_roundtrip_risk_fields: []`, `risk_count: 0`, timezone resolved `Asia/Taipei` / `+480` matching the contract offset — and **`writer_projection_complete: false`, `writer_projection_missing_total: 2`**: `shipments.warehouse_id` (identifier) and `shipments.updated_by` (text). So V3G5 mechanism (2) is not present live; mechanism **(1)** is, on exactly two fields. The log truncated because it emitted a complete per-column number-format dump — fixed in section J below.

## A — the old `shipments.warehouse_id` semantic: **CASE B (exact duplicate of the destination identity)**
Source derivation, verbatim from the shipment row construction:

```
var srcWh  = DEMO4A_str_(tpl.origin_warehouse_id),
    destWh = DEMO4A_str_(tpl.destination_warehouse_id);
…
tables.shipments.push({ …, source_warehouse_id: srcWh, warehouse_id: destWh, …,
                        destination_warehouse_id: destWh, … });
```

`warehouse_id` and `destination_warehouse_id` were assigned the **same `destWh` variable**. It carried **no** source/origin meaning (case A is ruled out) and was not ambiguous (case C is ruled out) — it was a pure duplicate of the destination identity. **Mapping decision:** keep `destination_warehouse_id`, delete only the redundant non-physical `warehouse_id`. Nothing is lost, and `source_warehouse_id` was already present and distinct.

`shipments.updated_by` is likewise not a deployed physical column and is removed; `created_by` / `created_at` / `updated_at` are preserved. `warehouse_code` is **not** added to the shipment row — the intended row never carried it, so there is no existing production meaning for this tool to preserve or redefine.

## B — source warehouse authority precedence
The business SOURCE warehouse comes from the **selected route template's `origin_warehouse_id`** (`srcWh = DEMO4A_str_(tpl.origin_warehouse_id)`), which is an explicitly permitted source-proven authority. The same value is written to `shipping_plans.source_warehouse_id`, so the plan→shipment inheritance is exact by construction rather than by copy. Nothing else is ever used: not an origin port `logistics_location_id`, not a route node id, `node_code` or `location_code`, not `warehouse_code` in place of `warehouse_id`, not the destination warehouse, not an arbitrary first warehouse or factory, no fuzzy/name matching, and no fabricated Demo-only id. When the `warehouses` master is present the id must resolve to an exact `warehouses.warehouse_id`; otherwise the new gate fails closed with `SOURCE_WAREHOUSE_NOT_IN_MASTER:<id>` and the retry is blocked — **no value is ever invented to make the Demo pass.**

**Live selected templates** are `SRT-TOP-CN-USW/USC/USE-S-T-V1`. Their `origin_warehouse_id` values are live data this agent cannot read, so the exact live source ids are **not asserted here**; the gate and the diagnostic report them (`source_warehouse_ids`) when the operator runs the read-only diagnostic. If a live template exposes a blank `origin_warehouse_id`, or an id absent from `warehouses`, the diagnostic returns `CANONICALIZATION_RISK_REMAINS` with the exact reason — the intended fail-closed behaviour. Offline, the live-shaped fixture models the frozen contract with a real CN source warehouse (`WH-KM-CN-FACTORY-1`, a FACTORY-class row present in `warehouses`) shared by all three templates, which is permitted because the template authority itself declares it — three different origins are not forced.

## Source → destination warehouse matrix (offline live-shaped fixture)
| Slot / region | source_warehouse_id | destination_warehouse_id | destination logistics_location |
|---|---|---|---|
| origin · US_CENTRAL | `WH-KM-CN-FACTORY-1` | `WH-KM-US-FBA-AUS2` | `LOC-WH-KM-US-FBA-AUS2` |
| in_transit · US_WEST | `WH-KM-CN-FACTORY-1` | `WH-KM-US-FBA-BFI4` | `LOC-WH-KM-US-FBA-BFI4` |
| delivered · US_EAST | `WH-KM-CN-FACTORY-1` | `WH-KM-US-FBA-ABE2` | `LOC-WH-KM-US-FBA-ABE2` |

Proof that geographic ids were **not** substituted: every route `location_ref_id` in the plan is collected into a set, and the gate fails with `SOURCE_IS_A_ROUTE_LOCATION_ID` / `DESTINATION_IS_A_ROUTE_LOCATION_ID` if any warehouse field holds one; a separate check fails with `DESTINATION_LOGISTICS_LOCATION_WRITTEN_AS_WAREHOUSE` if `destination_warehouse_id` ever equals the destination `logistics_location_id`. Tests assert all three hold, and that the destination logistics location still *joins* its destination warehouse (`LOC-` + the warehouse id) as a separate authority.

## C/F — final physical contract
`shipping_plans`: `source_warehouse_id` (business origin) + `destination_warehouse_id` (business destination), unchanged. `shipments`: `source_warehouse_id` (inherited exactly), `destination_warehouse_id` (inherited exactly), `created_by`, `created_at`, `updated_at` — and **no** `warehouse_id`, **no** `updated_by`, **no** added `warehouse_code`. Nothing was renamed (`source_warehouse_id`, `destination_warehouse_id`, `marketplace_seperate` all untouched) and no column was added or migrated (a test asserts no `insertColumn`/`appendColumn`/`createSheet`/`ALTER TABLE` code exists anywhere in source).

## G — the new lineage gate
`DEMO4A_srcDestLineageGate_(plan, warehouses)` → `source_destination_warehouse_lineage_ready` plus typed reasons (capped at 8) and the three source/destination id triples. True only when all three plans and all three shipments have non-blank source and destination ids, each shipment inherits both from its parent plan exactly, source ≠ destination, both resolve to an exact `warehouses.warehouse_id` while the master is present, the destination equals the approved regional authority (`DEMO4A_APPROVED_REGION_DEST_`: BFI4/AUS2/ABE2 — only binding while the warehouse authority is active, so legacy logistics-only fixtures are unaffected), no route logistics-location id sits in a warehouse field, and no `shipments.warehouse_id` third authority exists.

It is required in: `binding_gates` (and folded into `binding_gates.ok`, which drives PREFLIGHT `READY`, the COMMIT under-lock binding recheck, VALIDATE and the exact `REUSED` path), the seven→eight warehouse gates (`DEMO4A_warehouseGates_`), `gate_summary.source_destination_warehouse_lineage_ready`, the `may_run_dry_run` conjunction, `may_arm_commit_checksum`, and the canonicalization diagnostic verdict.

## H — the pre-write projection gate is unchanged and still first
`DEMO4A_writerProjectionGaps_` still runs in COMMIT **before** the journal `setProperty` and before the first `appendRow` (asserted by source-position tests), blocking with `COMMIT_BLOCKED_WRITER_PROJECTION_INCOMPLETE` and zero writes. Proven: the corrected intended shipment row passes against the corrected physical headers, and removing the physical `source_warehouse_id`, `destination_warehouse_id`, `created_by`, `created_at`, `updated_at` or `shipment_total_qty` column each blocks. No blanket-ignore rule exists; writer-unowned columns remain the single explicit documented exception (counted and reported, never compared).

## I — compact authorization envelope
Each `per_shipment` object now carries `source_warehouse_id` (added to `plan.per_shipment` as well), `destination_warehouse_id` and `destination_logistics_location_id` — **19** authorized fields, asserted as an exact key set. `gate_summary` exposes the new gate and the `may_run_dry_run` conjunction requires it. Measured size: **3732 bytes**, still under the 6000-byte safe ceiling.

## J — the canonicalization diagnostic is now truncation-safe
The complete per-column `live_column_number_format_classes` dump is **removed** (asserted absent) and replaced by `number_format_summary_by_table` (`date_formatted_count`, `numeric_cell_count`, `text_cell_count`, `empty_or_general_count` per table) plus `number_format_risk_fields` — **actual** risks only (a physical cell type that contradicts the declared class of a writer-owned field), capped at 20. `writer_projection_missing_fields`, `predicted_roundtrip_risk_fields` and `unknown_field_classes` are each capped at 20 too. All authorization-bearing fields remain visible, including the new `source_destination_warehouse_lineage_ready`, `journal_integrity_valid`, `journal_matches_previous_failed_attempt`, `journal_previous_checksum`, `corrected_plan_checksum`, `journal_retry_safe`, `journal_retry_reason`, `existing_state` and `verdict`. Measured size: **3400 bytes** (was truncating before) with tests asserting `verdict`, `journal_retry_safe` and `corrected_plan_checksum` all sit inside the ceiling. No failure is hidden to save bytes — every cap emits its own count.

## K — prior failed journal: retry safety
The prior journal property is **only read** (a test asserts the diagnostic contains no `deleteProperty`). Classification: a prior journal plus an `ABSENT_ALL` live state is the signature of a failed, fully rolled-back attempt (`journal_matches_previous_failed_attempt: true`), and its integrity is verified by recomputing `DEMO4A_hash_(DEMO4A_journalCanonical_(j))`. `journal_retry_safe` is true only for `NO_PRIOR_JOURNAL` or `PRIOR_JOURNAL_IS_A_ROLLED_BACK_ATTEMPT_AND_WILL_BE_SUPERSEDED`; it is false — verdict `JOURNAL_STATE_UNSAFE_FOR_RETRY` — for `PRIOR_JOURNAL_INTEGRITY_INVALID`, `PRIOR_ATTEMPT_LEFT_ROWS_OR_STATE_NOT_ABSENT`, or `CLEAR_TOKEN_ARMED_WITH_PRIOR_JOURNAL_PRESENT`. **Corrected from V3G5:** a prior checksum that *differs* from the corrected plan is now explicitly **safe** (it will be superseded), because the retirement of the old checksum is expected — V3G5 wrongly treated that as unsafe. CLEAR remains impossible from a failed attempt through its four independent gates (placeholder token, token = current checksum, full journal integrity vs the current plan, `PRESENT_EXACT_ALL` required), and deletion stays restricted to the exact intended PK set.

## E — checksum behaviour
The intended physical shipment content changed (two fields removed, `per_shipment` gained `source_warehouse_id`), so **`7e4cf9d9` is RETIRED**. The corrected checksum is computed naturally, is deterministic, and changes when either the source warehouse identity or the destination coordinate evidence changes (both proven). The retired literal is deliberately **not named anywhere in source** (asserted), so nothing can be pinned to it, and both confirmation constants stay placeholders — only a future live read-only authorization envelope may present the new checksum for the operator to copy.

## L — tests and baseline
demo-seed **845/0** (was 765/0 after the V3G5 D re-point, 753/0 before this task); the V3G3 map regression **50/0** unchanged; the demo-seed suite is the only suite reading the changed TEMP file. Full sweep of **342** suites: the same **5 pre-existing** failures (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-golden-scenarios`, `supply-planning-route-inventory`), none reading a changed file → **0 new failures**. All 48 required proofs are covered, including the CASE B classification, the ten lineage fail-closed cases, the six projection-block cases, the gate driving `all_pass` and the authorization conjunction, checksum binding of both lineages, diagnostic size/field/cap contracts, the four journal-safety classifications, genuine `CONTENT_DRIFT` still blocking with capped evidence, rollback and its mandatory verification, `COMMITTED_UNVERIFIED` absent, `PRESENT_EXACT_ALL` / `REUSED` intact, and the three approved coordinate authorities unchanged.

Fixture note: adding the required source warehouse to the fixtures surfaced three latent fixture bugs (positional `warehouses[0]` access, and two coordinate-authority builders that assumed every warehouse is a destination). All three were fixed in the fixtures, not by weakening any assertion.

## Sync manifest (USER-owned, nothing run here)
- `APPS_SCRIPT_SYNC_REQUIRED`: `TEMP_demo_shipping_shipment_map_seed_v2.gs` · `FRONTEND_DEPLOY_REQUIRED`: none · `BUNDLE_REBUILD_REQUIRED`: NO · **no DB header/schema change required**.
- Retry order after review: push → sync the `.gs` → run `TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION` (expect `writer_projection_complete: true`, `writer_projection_missing_total: 0`, `source_destination_warehouse_lineage_ready: true`, `journal_retry_safe: true`, `verdict: READY_FOR_CONTROLLED_RETRY`, and a fully visible log). If `source_destination_warehouse_lineage_ready` is false, read `source_destination_warehouse_lineage_reasons` — a live template with a blank or unmastered `origin_warehouse_id` is the expected cause and needs a separate authorized decision, not a fabricated id. Then `TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION` → DRY_RUN → copy the **new** `demo_plan_checksum` → COMMIT → VALIDATE. CLEAR stays staged OFF.

---

# V3G5B — DETERMINISTIC DEMO FACTORY SOURCE AND WAREHOUSE LINEAGE CLOSURE
**SOURCE-IMPLEMENTED · TEST-PROVEN · NOT LIVE-VERIFIED · NOT LIVE-RUN.** Follow-up on `d50a6ee` (V3G5A). TEMP demo tool + its offline test + this document only. No DB header/schema change, no migration, no master data change, no production handler / router / API / frontend / bundle change, `global-logistics-map.js` untouched, the three approved coordinate authorities untouched, both confirmation constants still `PASTE_..._HERE`, the live journal neither cleared nor mutated, no Apps Script function executed.

## Live evidence this task answers
`schema_ok true` · `plan_checksum 8b3eabec` · `writer_projection_complete true` (0 missing) · `all_intended_fields_have_class true` · `alias_conflict false` · `journal_retry_safe true` · `existing_state ABSENT_ALL` · `confirmation_constant_status PLACEHOLDER` — **but** `source_destination_warehouse_lineage_ready = false` with `source_warehouse_ids ["","",""]` and `destination_warehouse_ids ["","",""]` (`PLAN_/SHIPMENT_ SOURCE_/DESTINATION_ WAREHOUSE_BLANK`), plus two format warnings on `shipping_plans.ship_from` and `shipping_plans.destination`.

## Root cause — proven from source, not assumed
Two independent defects, both in `DEMO4A_buildPlan_`:
1. **Source.** The intended rows read `tpl.origin_warehouse_id` **directly**. `shipment_route_templates.origin_warehouse_id` is an **optional specificity column** (`SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §Template header: "Optional specificity: `destination_warehouse_id` · `origin_warehouse_id` · `carrier_id`"), so the live templates legitimately leave it blank → the physical `source_warehouse_id` was blank. This is a *blank optional master field*, not a missing warehouse.
2. **Destination.** The shared warehouse-aware evaluator had **already resolved** BFI4 / AUS2 / ABE2 by region (V3G4), but the row builder still read `tpl.destination_warehouse_id` — also optional and also blank live — so the resolved authority was never propagated into the physical rows.

## A/B — the one Demo source-warehouse resolver
`DEMO4A_resolveDemoSourceWarehouse_(template, warehouses, company)` — pure, Demo-only, takes **no `locations` argument at all** (so it structurally cannot require a coordinate or substitute a route/logistics id).

| # | Branch | Condition | Gates |
|---|---|---|---|
| 1 | `TEMPLATE_EXACT_SOURCE_WAREHOUSE` | `origin_warehouse_id` **non-blank** | exact `warehouses.warehouse_id` · active · shipping-enabled when present · country = `origin_country` · company = resolved Demo company when populated |
| 2 | `DEMO_DETERMINISTIC_FACTORY_FALLBACK` | `origin_warehouse_id` **blank only** | `is_factory_warehouse` · active · shipping-enabled when present · country **exactly** = `origin_country` · company exactly = Demo company when populated → sort by normalized `warehouse_id` **ascending**, take the **first** |

A non-blank declared id that is missing or fails any gate returns `TEMPLATE_SOURCE_WAREHOUSE_INVALID` (+ a typed `detail`) and **never falls through** to the fallback. An empty candidate set returns `NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE`. Never used: `Math.random`, current row order, origin port `logistics_location_id`, route node id, `node_code` / `location_code`, `warehouse_code` in place of a `warehouse_id`, the destination warehouse, fuzzy / prefix / name matching, or a fabricated id.

**Evidence preserved** (and checksum-bound as a `WHSRC` manifest row): `warehouse_id`, `warehouse_code`, `warehouse_name`, `company`, `country`, `warehouse_type`, `is_factory_warehouse`, `selection_branch`. **Truthful marking:** `master_identity_proven = true` in both branches (an exact master row was matched), `demo_fallback = true` only for branch 2, and `source_proven = true` **only** for the exact declared template authority — a fallback is never called source-proven. The source warehouse is a **business identity**; the origin route location remains a separate geographic binding.

### Audit of the master contracts (read-only, nothing modified)
- `is_factory_warehouse` — the canonical factory-eligibility flag; production pairs it with `is_active` (`03_master_data_handlers.gs`, `13_procurement_handlers.gs`, `43_api_v1_gap_materialization.gs`, `supply-planning-allocation-facts.js`). This resolver uses the **same** pair and writes nothing.
- `is_shipping_enabled` — production's **managed-overseas outbound** capability, and production explicitly **excludes factory warehouses** from that check (`SYSTEM_RUNTIME_ARCHITECTURE.md` §575, `WAREHOUSE_OPERATIONS_SPEC.md` §126). Requiring it here when present is therefore **stricter** than production — deliberately fail-closed, never looser. "Present" = a **non-blank cell** (the same convention as the existing `DEMO4A_whReceivingEnabled_`); a blank never blocks, an explicit false does.
- `shipping_plans` / `shipments` source + destination warehouse columns — both are deployed physical columns (`SHIPPING_PLANS_HEADERS_`, `SHIPMENTS_HEADERS_`). *Audit note, unchanged by this task:* `SHIPMENT_CENTER_SPEC.md` §22.0(L)(6)–(7) records `source_warehouse_id` as a **current-runtime compatibility state** rather than the canonical origin identity (`origin_warehouse_id`). This tool writes the frozen USER contract (`source_warehouse_id`) and introduces no canonical decision.

## C/D — propagation
`shipping_plans.source_warehouse_id` = the resolved Demo source; every child `shipments.source_warehouse_id` = its parent plan's value (both assigned from the same `srcSel` binding, so inheritance is exact by construction). `shipping_plans.destination_warehouse_id` = `da.warehouse_id` — the **already-resolved shared destination authority** consumed from the template evaluation (`usedBinding.destination_authority`), never re-resolved by a second rule — and every child shipment inherits it. Expected and proven: `US_EAST → WH-KM-US-FBA-ABE2`, `US_CENTRAL → WH-KM-US-FBA-AUS2`, `US_WEST → WH-KM-US-FBA-BFI4`, each joined to `LOC-<its warehouse id>`.

## E — `shipments.warehouse_code`: AUDITED AND SOURCE-PROVEN
`SHIPMENT_CENTER_SPEC.md` states it three independent times: §22.0(D)/(L)(3) "**`warehouse_code` = the DESTINATION warehouse-code snapshot — never a source identity**"; §22.0 flow "copy `warehouses.warehouse_code` → `shipments.warehouse_code` (display/external-code snapshot, never an identity)"; §21 "`shipments.warehouse_code` = destination display / external-code snapshot (FC / receiving) … never an identity". The B-1 reservation identity explicitly excludes it. The deployed `SHIPMENTS_HEADERS_` already carries `warehouse_code` immediately after `source_warehouse_id`. **Conclusion: it is the destination warehouse-code snapshot** → written as the exact resolved destination `warehouse.warehouse_code` (`ABE2` / `AUS2` / `BFI4`). No column added, never used as a foreign key, and the lineage gate fails closed on `WAREHOUSE_CODE_NOT_DESTINATION_SNAPSHOT` or `WAREHOUSE_CODE_WRITTEN_AS_WAREHOUSE_ID`. Its canonicalization class is `identifier` (exact text, never numeric-coerced) — a canonicalization class, **not** a relational identity.

## F — final physical row contract
`shipping_plans`: `source_warehouse_id` + `destination_warehouse_id`. `shipments`: `source_warehouse_id`, `destination_warehouse_id`, `warehouse_code` (source-proven destination snapshot), `created_by`, `created_at`, `updated_at` — and **no `warehouse_id`, no `updated_by`**. No header created or migrated (asserted: no `insertColumn` / `appendColumn` / `createSheet` / `ALTER TABLE` in source).

## G/H — the repaired lineage gate
`DEMO4A_srcDestLineageGate_` now additionally rejects `SOURCE_COUNTRY_NOT_TEMPLATE_ORIGIN_COUNTRY`, `WAREHOUSE_CODE_NOT_DESTINATION_SNAPSHOT` and `WAREHOUSE_CODE_WRITTEN_AS_WAREHOUSE_ID`, and reports `source_warehouse_codes` / `source_selection_branches` / `destination_warehouse_codes` alongside the ids. It stays required in `binding_gates.ok` (which drives PREFLIGHT READY, the COMMIT under-lock recheck, VALIDATE and the exact REUSED path), the warehouse gates, `gate_summary`, `may_run_dry_run`, `may_arm_commit_checksum` and the diagnostic verdict. Thirteen fail-closed mutations are proven, one per rule.

## I — format-risk correction (value-aware)
The previous rule flagged any *class contradiction* between a declared field class and the physical column's existing cell type, so two **text** fields sitting in columns whose current cells happen to be numeric-formatted produced two false risks and blocked the verdict. Corrected: a mismatch is an **actual** risk only when at least one **intended value** is coercible by that format — `DEMO4A_numericLike_` / `DEMO4A_dateLike_` / `DEMO4A_boolLike_`, all deliberately narrow (blank and whitespace are not numeric-like). Reason codes are now `NUMERIC_LIKE_VALUE_IN_NUMERIC_COLUMN` / `DATE_LIKE_VALUE_IN_DATE_FORMATTED_COLUMN` / `BOOLEAN_LIKE_VALUE_IN_BOOLEAN_COLUMN` and each carries a clipped `example_value`; `format_risk_is_value_aware: true` is published.

| field | raw value | numeric-like | field class | live number format | round-trip canonical result |
|---|---|---|---|---|---|
| `shipping_plans.ship_from` | `CN` | no | `text` | `numeric_cell` | `CN` — unchanged |
| `shipping_plans.destination` | `US West` / `US Central` / `US East` | no | `text` | `numeric_cell` | unchanged |

Both are proven by a **pure round trip** (never "declared safe"): the text-class path applies no numeric coercion, and `DEMO4A_canon_` returns the value byte-identically. A numeric-like text value (`'0086'`) in the same column **still** blocks with `risk_count > 0` and verdict `CANONICALIZATION_RISK_REMAINS`. No apostrophe prefixing, no column-format mutation (`setNumberFormat` absent from source), no weakened text/number comparison. Expected corrected live result: `predicted_roundtrip_risk_fields []`, `risk_count 0`.

## J — checksum
Both `7e4cf9d9` and `8b3eabec` are **RETIRED** and neither literal is named anywhere in source (asserted), so nothing can be pinned to them. The corrected checksum is computed naturally and binds the source warehouse id + code + name + company + country + type + factory flag + **selection branch** + proven/fallback marking (`WHSRC`), the destination warehouse id + code snapshot + `logistics_location_id` + address fingerprint + coordinate branch + coordinates + accuracy + source reference (`WHDEST`), and all six physical tables. Proven: the same input reproduces the same checksum across three independent evaluations; a different deterministic source selection changes it; a destination logistics-lineage change alone changes it while the plan still builds all three regions. Confirmation constants remain placeholders.

## Offline source → destination matrix (live-shaped fixture, blank template origin AND destination)
| slot | region | source (branch) | destination | destination code | destination logistics location |
|---|---|---|---|---|---|
| origin / shipped | US_CENTRAL | `WH-KM-CN-FACTORY-1` (`DEMO_DETERMINISTIC_FACTORY_FALLBACK`) | `WH-KM-US-FBA-AUS2` | `AUS2` | `LOC-WH-KM-US-FBA-AUS2` |
| in_transit | US_WEST | `WH-KM-CN-FACTORY-1` (`DEMO_DETERMINISTIC_FACTORY_FALLBACK`) | `WH-KM-US-FBA-BFI4` | `BFI4` | `LOC-WH-KM-US-FBA-BFI4` |
| delivered | US_EAST | `WH-KM-CN-FACTORY-1` (`DEMO_DETERMINISTIC_FACTORY_FALLBACK`) | `WH-KM-US-FBA-ABE2` | `ABE2` | `LOC-WH-KM-US-FBA-ABE2` |

The same source factory serves all three Demo shipments (explicitly authorized). **The live source id is not asserted here** — the live warehouses master is not readable offline, so the exact live factory the fallback selects is whatever the deterministic ascending rule returns over the real rows; the diagnostic and the authorization envelope both print it (`source_warehouse_ids` / `source_warehouse_codes` / `source_selection_branches`) before anything is armed.

## L — compact outputs
`TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION` — **3614 bytes** — carries `source_warehouse_ids`, `source_warehouse_codes`, `source_selection_branches`, `destination_warehouse_ids`, `destination_warehouse_codes`, `source_destination_warehouse_lineage_ready` + reasons, `writer_projection_complete`, `risk_count`, `corrected_plan_checksum`, `journal_retry_safe`, `existing_state`, `verdict`. `TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION` — **4536 bytes** — adds a compact `source_destination_warehouse_lineage` block, and each of the three `per_shipment` objects now carries all six required lineage fields (`source_warehouse_id`, `source_warehouse_code`, `source_selection_branch`, `destination_warehouse_id`, `destination_warehouse_code`, `destination_logistics_location_id`) = 21 authorized fields. Both stay well under 6000 bytes and dump no warehouse rows (asserted: no `warehouse_name` / `address_line1` anywhere in the envelope).

## G — routes and events unchanged
All six tables still generate. On a live-scale node fixture the counts are exactly **3 / 8 / 3 / 8 / 46 / 5 = 73**, with one route row per template node in sequence order, abstract nodes as coordinate-blank timeline rows, geographic nodes renderable, shipped = departed-origin only, in-transit = origin + current with **no** destination received event, delivered = final received event at the destination warehouse whose coordinate equals its route coordinate exactly, and the destination endpoint still map-consumer ready on the unchanged ABE2 / AUS2 / BFI4 address-derived coordinates.

## Tests and baseline
demo-seed **993 / 0** (was 845 / 0). V3G3 map regression **50 / 0**. Full sweep of **342** suites → **4** failures, all in the known pre-existing set of five (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`; `supply-planning-golden-scenarios` passed on this run and on three consecutive re-runs — it is flaky, reads none of the changed files, and its pass is unrelated to this task) → **0 new failures**. All 50 required proofs are covered. Two earlier assertions were deliberately superseded and rewritten, never deleted: the V3G4A per-shipment field set (19 → 21 authorized fields) and V3G5A's `L18` (`warehouse_code` absent → `warehouse_code` **is** the source-proven destination snapshot).

## Sync manifest (USER-owned, nothing run here)
- `APPS_SCRIPT_SYNC_REQUIRED`: `TEMP_demo_shipping_shipment_map_seed_v2.gs` · `FRONTEND_DEPLOY_REQUIRED`: none · `BUNDLE_REBUILD_REQUIRED`: NO · **no DB header/schema change required**.
- Retry order after review: push → sync the `.gs` → `TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION` (expect `risk_count 0`, `source_destination_warehouse_lineage_ready true`, non-blank `source_warehouse_ids` / `destination_warehouse_ids`, `journal_retry_safe true`, `verdict READY_FOR_CONTROLLED_RETRY`) → `TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION` (**read the printed `source_selection_branches` and confirm the selected factory is the intended one before arming anything**) → DRY_RUN → copy the **new** `demo_plan_checksum` → COMMIT → VALIDATE. CLEAR stays staged OFF.

---

# V3G5C — CORRECT FACTORY SOURCE ELIGIBILITY SEMANTICS
**SOURCE-IMPLEMENTED · TEST-PROVEN · NOT LIVE-VERIFIED · NOT LIVE-RUN.** Narrow corrective follow-up on `7a82a9a` (V3G5B), made **before** the resolver is published. TEMP demo tool + its offline test + this document only. No production handler, master data, schema/header, frontend, router/API or bundle change; both confirmation constants remain `PASTE_..._HERE`; the prior journal was neither cleared nor mutated; no Apps Script entrypoint was executed.

## A — the source-proven semantic correction
V3G5B gated the Demo **source** warehouse on `is_shipping_enabled` "when present", calling it deliberately fail-closed. V3G5B's own audit already contained the disproof, so the gate is now removed — with the reason recorded, not silently dropped.

| Field | Source-proven meaning | Citation |
|---|---|---|
| `is_factory_warehouse` | identifies the business facility as a **factory warehouse** | `03_master_data_handlers.gs` §164 "eligibility: `warehouses.is_active = TRUE` AND `warehouses.is_factory_warehouse = TRUE`"; `21_factory_inventory_handlers.gs` §401 "is a FACTORY (`is_factory_warehouse=TRUE` AND, when known, `warehouse_type=FACTORY`)" |
| `is_active` | the **lifecycle eligibility gate**, always paired with the factory flag | same `03_master_data_handlers.gs` §164 conjunction; also `13_procurement_handlers.gs` §2288–2289, `43_api_v1_gap_materialization.gs` §417 |
| `is_shipping_enabled` | the **managed-OVERSEAS outbound capability**, evaluated **only where `is_factory_warehouse` is NOT TRUE** | `SYSTEM_RUNTIME_ARCHITECTURE.md` §575 "…active record, `is_factory_warehouse` is **not TRUE**, the relevant capability is enabled (`is_receiving_enabled` for inbound / `is_shipping_enabled` for outbound)"; `WAREHOUSE_OPERATIONS_SPEC.md` §126 same conjunction; `OVERSEAS_OUTBOUND_SPEC.md` §19 "origin_warehouse_id resolves to an active, **non-factory** `warehouses` record with `is_shipping_enabled = TRUE`"; `SHIPMENT_CENTER_SPEC.md` §1218 outbound rule |
| factory-origin shipments | a **first-class supported path with no shipping-capability gate at all** | `DATABASE_RELATIONSHIP_MAP.md` §603 "**Factory warehouses (`is_factory_warehouse = TRUE`) never create an overseas operation.**"; `SHIPMENT_CENTER_SPEC.md` B-1 §466 reservation keyed on `factory_stock.warehouse_id (= shipments.origin_warehouse_id) + sku` with `warehouses.is_factory_warehouse = TRUE` |
| company / country scope | `warehouse_id` is the system-unique identity; logical uniqueness is `warehouse_id` **or** `company + country + marketplace + warehouse_code` — never a code alone | `SHIPMENT_CENTER_SPEC.md` §22.0(D) |

**Conclusions recorded (all five):** (1) `is_factory_warehouse` identifies the facility as a factory warehouse. (2) `is_active` is the lifecycle eligibility gate. (3) `is_shipping_enabled` is **not** a general "may be used as a shipment source" authority for factory warehouses — it is the managed-overseas outbound capability and is structurally never evaluated for a factory. (4) A factory warehouse must **not** be rejected merely because `is_shipping_enabled` is false or blank. (5) **No production/master schema or data is changed** — only this Demo tool's own eligibility rule.

The two accessors (`DEMO4A_whShippingEnabled_`, `DEMO4A_whShippingEnabledPresent_`) are **deleted**, not left unused, so no executable path can consult the flag; a source-fact test strips comments and asserts that neither the accessors nor any `is_shipping_enabled` column read survives in code, and that the resolver body contains no `shipping` reference on any branch. The explanation and all four citations live in the source at the deletion site.

## B — final resolver matrix
`DEMO4A_resolveDemoSourceWarehouse_(template, warehouses, company)` remains the single pure Demo-only resolver and still accepts **no** locations/coordinates argument (asserted: its body references no `locations` / `latitude` / `longitude` / `logistics_location`).

| Gate | Branch 1 `TEMPLATE_EXACT_SOURCE_WAREHOUSE` (declared id non-blank) | Branch 2 `DEMO_DETERMINISTIC_FACTORY_FALLBACK` (declared id blank **only**) |
|---|---|---|
| exact `warehouses.warehouse_id` | **required** | required (non-blank id) |
| `is_active` | **required** | **required** |
| `is_factory_warehouse` | **not required** — production does not prove a declared source must be a factory (the canonical origin may be a factory *or* a managed overseas warehouse) | **required** |
| country = `template.origin_country` | **required (exact)** | **required (exact)** |
| company = Demo company when populated | **required (exact)** | **required (exact)** |
| `is_shipping_enabled` | **NOT consulted** | **NOT consulted** |
| latitude/longitude | not required | not required |
| `logistics_location` join | not required | not required |
| selection | the declared row | sort by normalized `warehouse_id` **ascending**, take the **first** |
| failure | `TEMPLATE_SOURCE_WAREHOUSE_INVALID` (+ typed detail), **never falls through** | `NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE` (+ typed rejection counts) |

Preserved exactly: `master_identity_proven = true` in both branches, `source_proven = true` **only** for branch 1, `demo_fallback = true` only for branch 2, and the full source evidence (id, code, name, company, country, type, factory flag, **selection branch**, proven/fallback marking) checksum-bound in the `WHSRC` manifest row. No `Math.random`, no row-order dependence, no fuzzy/prefix/name matching, no route-location or `warehouse_code`-as-id substitution, no fabricated id.

**Proof that a shipping-disabled factory is eligible:** `['FALSE', '', 'TRUE', 'no', '0']` all yield the **same** selected warehouse — the flag has no effect whatsoever — and end-to-end, a fixture whose CN factory carries `is_shipping_enabled = FALSE` builds a plan that is **byte-identical** to the baseline (same checksum), confirming the flag influences nothing the checksum binds.

## C — country / company still fail closed
Nothing is broadened. A factory in another country is counted `COUNTRY_NOT_TEMPLATE_ORIGIN_COUNTRY` and the plan fails closed; one owned by another **populated** company is counted `COMPANY_MISMATCH` and is never borrowed; an inactive factory is counted `INACTIVE`. In every case `DEMO4A_buildPlan_` returns `DEMO_SOURCE_WAREHOUSE_AUTHORITY_NOT_READY` with the per-slot reason `NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE`, and both read-only entrypoints publish the exact typed cause. **No warehouse is invented and the rule is never weakened without a separate user decision.** The three selected Demo templates keep a **CN** source, as expected.

## H — read-only output contract
A single shared pure summariser, `DEMO4A_sourceAuthoritySummary_`, feeds **both** entrypoints (never a second evaluator — asserted). Newly published by both: `source_factory_candidate_count`, `source_factory_rejection_counts` (typed, capped at five codes, with `source_factory_rejection_code_count` so nothing is hidden by the cap) and **`source_shipping_enabled_gate_applied: false`**, so an operator can confirm the corrected semantic from the log alone. The failure path of the authorization envelope carries them too — that is exactly when they matter.

Coverage is a **union across the two entrypoints**, which is how the contract is satisfied without adding a duplicate evaluator or a new sheet/property read to the authorization entrypoint: the canonicalization diagnostic carries `writer_projection_complete`, `writer_projection_missing_total`, `risk_count`, `journal_integrity_valid`, `journal_retry_safe`, `corrected_plan_checksum`, `existing_state`, `confirmation_constant_status`, `verdict`; the authorization envelope carries `source_destination_warehouse_lineage`, `demo_plan_checksum`, `existing_state`, `confirmation_constant_status`, `may_run_dry_run`, `may_arm_commit_checksum`, `preflight_verdict`; **both** carry the source/destination id + code + branch triples and the three new source fields, and **both** stamp `DEMO4A_ZERO_WRITE_CONFIRMED`. Measured: diagnostic **3758 bytes**, authorization envelope **4680 bytes**, failing envelope well under the ceiling — all < 6000.

`READY_FOR_CONTROLLED_RETRY` is still reached only when every projection, canonicalization, source/destination lineage, existing-state and journal gate passes.

## D/F/G — everything else re-proven unchanged
Propagation (plan → shipment inheritance of both endpoints, exact master resolution, `source != destination`, no logistics-location id in a warehouse field, `warehouse_code` still the destination display-code snapshot), the writer-projection gate running before the journal write and the first `appendRow`, the value-aware format-risk rule (`CN` / `US West|Central|East` safe by pure round-trip proof, `0086` still blocking), no cell-format mutation or apostrophe injection, journal read-only + supersedable only under the full conjunction, inserted-only rollback with mandatory verification, `COMMITTED_UNVERIFIED` impossible, `PRESENT_EXACT_ALL` / six-zero-delta `REUSED`, counts **3/8/3/8/46/5 = 73**, and route/event semantics — all re-asserted after the correction. `shipments.warehouse_id` and `shipments.updated_by` stay removed; no schema column is added.

**Checksum:** deterministic and source-lineage-sensitive, with **no value hardcoded**; `7e4cf9d9` and `8b3eabec` remain unnamed in source. For fixtures where the flag was absent the corrected semantics reproduce the identical checksum — the correction changes the *plan* only where live data actually has a shipping-disabled factory that V3G5B would wrongly have rejected.

## Offline result
All three Demo shipments select **`WH-KM-CN-FACTORY-1`** (`CNFAC1`) via `DEMO_DETERMINISTIC_FACTORY_FALLBACK`, candidate count **1**, rejection counts `{ NOT_A_FACTORY_WAREHOUSE: 3 }` (the three FBA destination rows, correctly excluded), `source_shipping_enabled_gate_applied: false`, lineage ready, `risk_count 0`, verdict `READY_FOR_CONTROLLED_RETRY`. Destinations unchanged: AUS2 / BFI4 / ABE2 with their `LOC-` lineage and code snapshots. **The live source id is still not asserted** — the live master is unreadable offline; both entrypoints print it before anything is armed.

## Tests and baseline
demo-seed **1084 / 0** (was 995 / 0 after the loader correction, 993 / 0 at V3G5B). V3G3 map regression **50 / 0**. Full sweep of **342** suites → the same **4** pre-existing failures (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`), none reading a changed file → **0 new failures**. Five V3G5B assertions were deliberately **superseded and rewritten, never deleted**: the branch-1 shipping gate, the three fallback shipping-capability assertions, and the `is_shipping_enabled_present` evidence field — each replaced by its corrected inverse with the semantic reason attached.

## Sync manifest (USER-owned, nothing run here)
- `APPS_SCRIPT_SYNC_REQUIRED`: `TEMP_demo_shipping_shipment_map_seed_v2.gs` · `FRONTEND_DEPLOY_REQUIRED`: none · `BUNDLE_REBUILD_REQUIRED`: NO · **no DB header/schema change required**.
- Order after review: push → sync the `.gs` → `TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION` (expect `source_shipping_enabled_gate_applied: false`, a non-blank `source_warehouse_ids` triple, `source_factory_candidate_count > 0`, `risk_count 0`, `source_destination_warehouse_lineage_ready true`, `journal_retry_safe true`, `verdict READY_FOR_CONTROLLED_RETRY`; if the source is still unresolved, read `source_factory_rejection_counts` — it names the exact typed cause) → `TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION`, **confirming the printed factory is the intended one** → DRY_RUN → copy the **new** `demo_plan_checksum` → COMMIT → VALIDATE. CLEAR stays staged OFF.

---

# V3G5D — SHARED FACTORY SOURCE AUTHORITY CORRECTION
**SOURCE-IMPLEMENTED · TEST-PROVEN · NOT LIVE-VERIFIED · NOT LIVE-RUN.** Follow-up on `51c6816` (V3G5C). TEMP demo tool + its offline test + this document only. No production handler, master data, schema/header, frontend, router/API or bundle change; **no canonical document edited** (see §M audit below); both confirmation constants remain `PASTE_..._HERE`; the prior journal was neither cleared nor mutated; no Apps Script entrypoint executed.

## What the live run actually proved
The live diagnostic stopped **safely**: `verdict CANONICALIZATION_RISK_REMAINS`, `plan_blocked_reason DEMO_SOURCE_WAREHOUSE_AUTHORITY_NOT_READY`, `DEMO4A_ZERO_WRITE_CONFIRMED YES`. The cause was **not missing DB data** — the live CN factory exists and is active. V3G5C rejected it because its `company` is `ResTW` while the Demo shipment company is `KM`. That company-**isolation** gate was the defect.

## A/M — canonical audit: the shared-factory rule is ALREADY canonical
No canonical file needed changing, and **no canonical document contradicts the frozen rule**. The repository already records it:

| Source | Exact evidence |
|---|---|
| `RECOMMENDATION_SOURCE_CONTRACT_SPEC.md` **SC-11.1 "D-1 RESOLVED — Factory shared-company authority (`FACTORY_SHARED`)"** | "Factory stock is a **company-agnostic, cross-company shared physical supply pool**." · verbatim: "**`warehouses.company` stays owner/administrative context only**." · "the Factory Allocation Runtime allocates the shared physical pool **across companies**" |
| `assets/js/core/supply-planning-allocation-facts.js` | "§35/§40: factory eligibility = `is_factory_warehouse` + `is_active` (**shared source; company-agnostic per D-1**)" — and `eligibleFactoryWarehouseIds()` filters on **exactly those two flags with no company filter**, sorted ascending, while the **3PL branch immediately above it does require `str(w.company) === company`**. The asymmetry is deliberate. |
| `43_api_v1_gap_materialization.gs` | "FACTORY — **company-wide competing set** (`factory_stock` is the **`FACTORY_SHARED`** pool; `is_factory_warehouse` eligible)" — `factoryWhIds` likewise built with no company filter |
| `SHIPMENT_CENTER_SPEC.md` §22.0(C) | `company` = the business/account context **using** the warehouse (KM/ResUS/ResTW); `warehouse_owner` = the physical **operator** (Amazon / WINIT / AMZLGS / **ResTW for an owned factory**) |
| `DATABASE_RELATIONSHIP_MAP.md` §589 | the company-filtered candidate pipeline is the **destination** picker, and "**RETURN/FACTORY excluded from normal destination selection**" |
| repository-wide search | **no** `warehouse_access` / `warehouse_permission` / `warehouse_authorization` mapping table exists anywhere |

**No conflict to report.** `SHIPMENT_CENTER_SPEC.md` §22.0(E)–(H) does filter candidates by Company, but that pipeline is explicitly the **destination** Warehouse Picker and FACTORY is explicitly excluded from it — a **scope distinction, not a contradiction**. The company filter never governed a factory *source*.

> **SUPERSEDED IN PART — F1-7N-FB-4E-R4B-R1 (2026-08-31).** Points (4) and (6) below remain the default **only
> where no explicit factory-source policy exists**. An explicit policy is now authorized in
> `SUPPLY_PLANNING_CALCULATION_RULES.md` §13.1: **CN** factory stock is shared across all eligible receiver site
> scopes (cross-company), while **TW** factory stock is eligible for **active ResUS scopes only**. That is a
> narrow supersession for TW; it is a property of the SOURCE, not a company-mismatch or warehouse-authorization
> rule, and it does not change anything in the shipment/route reading of these eleven points.

**Frozen rule (all eleven points recorded):** (1) `warehouses.company` is administrative/account ownership attribution. (2) `warehouse_owner` identifies owner/operator attribution. (3) Neither is an exclusive usage authorization. (4) Factory warehouses are shared operational sources across KM / ResUS / ResTW. (5) A shipment company need not equal the factory warehouse company. (6) Absent an explicit warehouse-access mapping (none exists), company mismatch must not reject a valid factory source. (7) Country remains authoritative for route geography. (8) `is_active` remains authoritative for lifecycle eligibility. (9) `is_factory_warehouse` remains authoritative for the blank-template fallback. (10) `warehouse_id` remains the business identity. (11) `logistics_location_id` and route `location_ref_id` remain geography only and never replace warehouse identity.

## B — final resolver matrix
`DEMO4A_resolveDemoSourceWarehouse_(template, warehouses, company)` — the signature is unchanged as mandated, but `company` is now **evidence-only**: the resolver body contains no company reference and never calls `DEMO4A_whCompany_` (both asserted).

| Gate | Branch 1 `TEMPLATE_EXACT_SOURCE_WAREHOUSE` | Branch 2 `DEMO_DETERMINISTIC_FACTORY_FALLBACK` |
|---|---|---|
| exact `warehouses.warehouse_id`, non-blank | **required** | required (non-blank id) |
| `is_active` | **required** | **required** |
| country = `template.origin_country` | **required (exact)** | **required (exact)** |
| `is_factory_warehouse` | not required | **required** |
| **`company` / `warehouse_owner`** | **NOT required** | **NOT filtered** |
| `is_shipping_enabled` · marketplace · coordinates · `logistics_location` · id-prefix | **not consulted** | **not consulted** |
| selection | the declared row | sort normalized `warehouse_id` **ascending**, take **first** |
| failure | `TEMPLATE_SOURCE_WAREHOUSE_INVALID`, **never falls through** | `NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE` + typed counts |

No `Math.random`; no fuzzy matching; no route-location substitution; no runtime geocoder. **This correction is source-scoped**: the destination `COMPANY_MISMATCH` identity rule and `DESTINATION_WAREHOUSE_SCOPE_COMPANY_MISMATCH` are deliberately **preserved** (both asserted present).

## C — the supplied live DB rows, reproduced exactly
The fixture carries the user's rows verbatim. **Result:** `WH-TW-CN-FACTORY-YOUXIN` / `CN_YOUXIN` / `CN侑鑫` / company `ResTW` / owner `ResTW` / country `CN` / branch `DEMO_DETERMINISTIC_FACTORY_FALLBACK` — reached from the live rows by deterministic eligibility and ascending sort. **Neither the id nor the code appears anywhere in the tool** (asserted: 0 occurrences of `WH-TW-CN-FACTORY-YOUXIN` in source). `WH-TW-CN-FACTORY-RES`… `WH-TW-TW-FACTORY-RES` is **rejected for the CN-origin templates on `COUNTRY_NOT_TEMPLATE_ORIGIN_COUNTRY`** — the one geography rule that still binds. The same ResTW factory is proven eligible for **KM, ResUS and ResTW** shipments alike, and every `warehouse_owner` value yields the identical selection.

## D/F — evidence and the shared-factory policy gate
The `WHSRC` checksum manifest now binds `warehouse_id`, `warehouse_code`, `warehouse_name`, **`warehouse_owner`**, `company`, `country`, `warehouse_type`, `is_factory_warehouse`, **`is_active`**, the selection branch, the proven/fallback markers and the **shared-factory policy marker**. Provenance stays truthful: branch 1 → `source_proven = true`; branch 2 → `source_proven = false`, `master_identity_proven = true`, `user_authorized_shared_factory_policy = true`. A deterministic fallback is never labelled template-proven.

Published plan-level: `source_factory_shared_across_companies: true`, `source_company_match_required: false`, `source_shared_factory_authorized`. Published **per shipment**: `source_warehouse_company`, `source_warehouse_owner`, `shipment_company`, `source_company_match` (the plain fact — `false` on the live shape), `source_company_match_required: false`, `source_shared_factory_authorized: true`. The lineage gate carries companies and owners as evidence and **can produce no reason code from a company or owner mismatch** (asserted).

## E — propagation on the live-shaped plan
| slot | region | source (company / owner) | destination | code | logistics location |
|---|---|---|---|---|---|
| origin / shipped | US_CENTRAL | `WH-TW-CN-FACTORY-YOUXIN` (ResTW / ResTW) | `WH-KM-US-FBA-AUS2` | `AUS2` | `LOC-WH-KM-US-FBA-AUS2` |
| in_transit | US_WEST | `WH-TW-CN-FACTORY-YOUXIN` (ResTW / ResTW) | `WH-KM-US-FBA-BFI4` | `BFI4` | `LOC-WH-KM-US-FBA-BFI4` |
| delivered | US_EAST | `WH-TW-CN-FACTORY-YOUXIN` (ResTW / ResTW) | `WH-KM-US-FBA-ABE2` | `ABE2` | `LOC-WH-KM-US-FBA-ABE2` |

Shipment company `KM` with source company `ResTW` — `source_company_match: false`, and **this is not classified as a conflict**. Plan → shipment inheritance exact for both endpoints, both resolving to master rows, source ≠ destination, no logistics-location id in a warehouse field, `warehouse_code` still the destination display snapshot, `shipments.warehouse_id` / `updated_by` still absent, no column added or renamed.

## H/I — read-only outputs
Diagnostic **4013 bytes**, authorization envelope **5410 bytes** — both one compact entry, under 6000. The diagnostic publishes `source_warehouse_companies`, `source_warehouse_owners`, `source_factory_shared_across_companies`, `source_company_match_required` alongside the existing contract, and now emits **`plan_blocked_detail`** — the precise per-slot resolver reason/detail — whenever a plan is blocked, so `DEMO_SOURCE_WAREHOUSE_AUTHORITY_NOT_READY` never appears alone again. The envelope exposes the selected source id / code / company / owner / branch, the shared-factory policy, the lineage gate, the checksum and both authorization flags, from the **same single summariser** (one definition — the evaluator is not duplicated).

## G/J/K — preserved
V3G5C's boolean corrections stand: `is_shipping_enabled` false/blank/true has no effect; inactive factories, non-factory rows and wrong-country factories all remain ineligible; no coordinates, fuzzy matching, route substitution or geocoder. **Checksum:** new, deterministic, **nothing hardcoded**; every previous value — `7e4cf9d9`, `8b3eabec` and the company-isolated V3G5C plan checksum — is retired and unnamed in source. It changes on source id, source company, source owner, source code, selection branch, shared-policy marker, destination id/code and destination logistics lineage (each proven). Journal read-only and supersedable only under the full conjunction; inserted-only rollback with mandatory verification; `COMMITTED_UNVERIFIED` impossible; counts **3/8/3/8/46/5 = 73**; shipped = departed-origin only, in-transit = origin + current with destination planned, delivered = final received at the approved destination coordinate; W/C/E coverage; current marker distinct; destination renderable; no gateway relabelled.

## Tests and baseline
demo-seed **1203 / 0** (was 1084 / 0 at V3G5C). V3G3 map regression **50 / 0**. Full sweep of **342** suites → the same **4** pre-existing failures (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`), none reading a changed file → **0 new failures**. Five company-isolation assertions from V3G5B/V3G5C were **superseded and rewritten with the semantic reason attached, never deleted**: the branch-1 declared-source company gate, the fallback company filter, the V3G5C eligibility-matrix company row, its `COMPANY_MISMATCH` rejection-count expectation, and the plan-level company fail-closed expectation. The authorized per-shipment field set grew 21 → 25.

## Sync manifest (USER-owned, nothing run here)
- `APPS_SCRIPT_SYNC_REQUIRED`: `TEMP_demo_shipping_shipment_map_seed_v2.gs` · `FRONTEND_DEPLOY_REQUIRED`: none · `BUNDLE_REBUILD_REQUIRED`: NO · **no DB header/schema change required**.
- Order after review: push → sync the `.gs` → `TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION` (expect `source_warehouse_ids` = the live CN factory, `source_warehouse_companies` = `ResTW`, `source_factory_shared_across_companies true`, `source_company_match_required false`, `risk_count 0`, `source_destination_warehouse_lineage_ready true`, `journal_retry_safe true`, `verdict READY_FOR_CONTROLLED_RETRY`; if still blocked, `plan_blocked_detail` now names the precise resolver reason) → `TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION`, **confirming the printed factory is the intended one** → DRY_RUN → copy the **new** `demo_plan_checksum` → COMMIT → VALIDATE. CLEAR stays staged OFF.

---

# LIVE DEMO CLOSURE + V3G6A FRONTEND FIDELITY
**Frontend-only task.** No Demo row, DB schema, Apps Script seed tool, confirmation constant, journal, warehouse master, route or event was touched. No Apps Script function was run (no DIAGNOSE / PREFLIGHT / DRY_RUN / COMMIT / VALIDATE / CLEAR). The live results below are **recorded as reported by the operator**, not re-verified by this agent.

## I — live Demo closure record
| Item | Result |
|---|---|
| Live COMMIT | **succeeded** |
| Six-table delta | **3 / 8 / 3 / 8 / 46 / 5** (= 73) |
| `demo_plan_checksum` | **`f53a7ef7`** |
| Post-state classification | **`PRESENT_EXACT_ALL`** |
| VALIDATE verdict | **`DEMO_SEED_VALIDATED`** |
| `DEMO4A_CONFIRMED_SEED_CHECKSUM_` | **returned to `PASTE_DEMO_SEED_CHECKSUM_HERE`** |
| `DEMO4A_CONFIRMED_CLEAR_TOKEN_` | **still `PASTE_DEMO_CLEAR_TOKEN_HERE` — CLEAR remains disarmed** |

`f53a7ef7` is the live checksum; like every earlier value it is **not pinned anywhere in source**, so the tool cannot silently re-authorize against it.

### Visual smoke
| Page | Result |
|---|---|
| Weekly Shipping Plan | **PASS** |
| Shipment Draft — data visibility | **PASS** |
| Shipment Draft — Expand button | **FAIL → fixed by V3G6A** (root cause below) |
| Shipment Overview | **PASS** |
| On-the-Way Map — data / route visibility | **PASS** |
| On-the-Way Map — close-zoom fidelity | **audited; renderer already correct, texture tier raised (below)** |

## A — Shipment Draft Expand: exact root cause
**A duplicate DOM id resolved by `getElementById` to the wrong page — not CSS, not a missing listener, not a stale closure.**

1. `_shRenderDbCard()` is the **single** card builder for **both** pages, and it stamps `id="sh-card-<shipment_id>"`.
2. A `shipped` shipment is rendered by **both**: `SH_DRAFT_STATUSES = ['draft','ready_to_ship','shipped']` **and** `SH_OVERVIEW_STATUSES.shipped = 1`.
3. In `index.html`, `#shippinghistory-mount` (Overview) precedes `#shipment-draft-mount` (Draft).
4. The old `toggleShipmentCard(id)` did `document.getElementById('sh-card-' + id)` → **the first match in document order = the Overview card**.

**Call path:** `click` → inline `onclick="event.stopPropagation();toggleShipmentCard('<sid>')"` → `document.getElementById('sh-card-<sid>')` → *Overview* card → `querySelector('.history-card-details')` → sets `display:block` on the **hidden Overview** card → the Draft card never changes → **no visible response**.

This explains every observed symptom exactly: Overview Expand worked (it matched itself); Weekly Shipping Plan worked (different page, `sp-card-` ids); Draft › Draft and Draft › Ready-to-Ship worked (those statuses are unique to the Draft page); **only Draft › Shipped failed**.

## B — the fix: one canonical Expand/Collapse
`_shToggleCardEl(card)` + `_shCardFromEvent(evt, id, prefix)` resolve the card from **the clicked node's own subtree** (`closest('.history-card')`), so a click can only ever toggle its own card. The legacy id lookup survives **only** as the no-event fallback, so no programmatic caller loses behaviour. `toggleShipmentCard` and the demo/mock `toggleHistoryCard` both delegate to that **one** implementation — no divergent copy. Added: `type="button"`, an initial `aria-expanded="false"`, and an `aria-expanded` sync on every toggle (the buttons previously had none). The label still alternates Expand ⇄ Collapse, cards remain independent, the default stays collapsed, and the handler is an inline `onclick` re-emitted by every render, so filters and rerenders cannot leave a dead listener.

**Expand is pure DOM.** The toggle path references no status action (`shSaveExecution` / `shReadyToShip` / `shConfirmShipment` / `shReturnToDraft` / `shShipmentDone` / `shAdvanceStatus`), no `fetch`/`XHR`, no reload and no status field — its only mutations are `display`, `textContent` and `aria-expanded` (all asserted).

## C — expanded content
Unchanged and not redesigned. The detail DOM already existed (`.history-card-details` with **SKU Lines** — qty / cartons / CBM / weights / carton numbers — and **Execution Fields** + section actions); only its toggle was broken. No data invented, no new API field.

## D — map blur: full audit
| Audited | Finding |
|---|---|
| Renderer | hand-written raw **WebGL1** (`assets/js/lib/km-globe.js`), context `{antialias:true, alpha:false}` — not three.js |
| Canvas CSS size | `width:100%; height:100%` of `.glm-globe-host` (CSS carries **no** scaling and no `image-rendering` — verified, so the CSS was not changed) |
| Backing buffer | `canvas.width = round(cssW * dpr)`, `canvas.height = round(cssH * dpr)` — **already correct** |
| `devicePixelRatio` | `dpr = Math.min(window.devicePixelRatio || 1, 2)` — **already correct, already capped** |
| Resize handling | `window` resize (150 ms debounce) **+** `ResizeObserver` on the container; hidden/detached containers skipped — **already correct** |
| Texture asset path | **none** — the earth image is rasterized at runtime by `buildEarthCanvas()` from the vendored same-origin `KM_WORLD_LAND` outline. No network, no external file, no licence question |
| Texture native size | **2048 × 1024** equirectangular |
| min/mag filters | `LINEAR` / `LINEAR` — **no mipmaps, no anisotropy** |
| Color space | not applicable: WebGL1 raw `gl.RGB`/`UNSIGNED_BYTE` from a canvas has no colour-space parameter (that is a three.js / WebGL2 concept). **No change made — nothing invented.** |
| Max zoom | `MIN_D = 1.35`, `MAX_D = 5.0` (unchanged) |

**Cause of the observed blur: the texture, not the renderer.** At `MIN_D` the sphere fills the viewport, so a 2048×1024 texture is **magnified** — one texel spans several device pixels — and `TEXTURE_MAG_FILTER = LINEAR` interpolates it into visible softness. Mipmaps and anisotropy do **not** help magnification; only real texel density does. The DPR/backing-buffer items in §E(1)(2) were therefore **already implemented — they are reported as verified, not claimed as new fixes.**

## E/F — implemented fidelity changes
1. **Texture tier raised, capability-gated.** `pickTextureTier()` selects **4096 × 2048** only when `gl.MAX_TEXTURE_SIZE ≥ 4096` **and** `navigator.deviceMemory ≥ 4` **and** `navigator.hardwareConcurrency ≥ 4`; an **unidentified** device stays on the base tier (fail-safe, not fail-open). Base stays **2048 × 1024**, so low-end cost is unchanged. Typed reasons: `HIGH_TIER_4K` · `MAX_TEXTURE_SIZE_BELOW_4096` · `LOW_DEVICE_MEMORY` · `LOW_CORE_COUNT` · `DEVICE_CAPABILITY_UNKNOWN` · `CAPABILITY_PROBE_FAILED`.
2. **Mipmaps** — `generateMipmap` (both tiers are power-of-two), with `MIN_FILTER = LINEAR_MIPMAP_LINEAR` **only when the mip chain actually built**; `MAG_FILTER` stays `LINEAR`.
3. **Anisotropy** — `EXT_texture_filter_anisotropic` (with WebKit/Moz prefixes) at the renderer-reported maximum, applied only when a mip chain exists. On a sphere most of the visible surface is at a grazing angle, so this is the largest per-pixel win after texel density.
4. **Artwork preserved exactly.** `buildEarthCanvas` is fully resolution-parametric; the only absolute pixel radii (the baked cloud layer) are now scaled by `tw/2048`, so a 4K raster paints the identical image with more detail.
5. `getRenderInfo()` / `getTextureInfo()` expose DPR, CSS size, buffer size, tier, mipmaps and anisotropy so the configuration is **observable instead of assumed**.

Not done, deliberately: no CSS upscaling trick, no upscaled low-res texture passed off as new detail, no runtime network dependency, no geometry / projection / camera / marker / coordinate change.

**§F texture decision:** the texture **was** the limiting cause. Its exact resolution was **2048 × 1024**; the recommended tier is **4K (4096 × 2048)**, and because the asset is **generated in-repo** there is no external asset to license and no `HIGH_RES_TEXTURE_ASSET_REQUIRED` condition. 8K is possible later but would cost ~128 MB of texture memory with mips and is not warranted at this globe size.

## G — marker overlap: recorded recommendation, no implementation
No coordinate is moved or jittered, and no clustering/aggregation was added (asserted: the marker pipeline `rebuildPoints` contains no jitter / scatter / declutter / clustering / random / offset). Recorded for later: current marker behaviour is **accepted for initial user testing**; selected-route emphasis is sufficient at the current four-shipment scale; a future large-data option is **screen-space** grouping with a co-located count badge; any future overlap handling must preserve the exact underlying coordinate, and an aggregate must expand or list **all** underlying nodes when selected.

## H — tests and baseline
New suite `shipment-draft-expand-and-map-fidelity-f1-7n-fa-4a-v3g6a.test.js` — **92 / 0** — covering all 21 required items. The Expand tests **execute the real shipped functions** (extracted from `shipping-history.js` and evaluated against a minimal DOM that reproduces the duplicate-id defect with Overview mounted first), never a mirrored copy. The map tests are source-facts over the real renderer, since neither WebGL nor a DOM canvas exists in headless Node.

All **25** suites reading a changed file pass, including `globe-visual-guard`, `globe-math`, `global-logistics-map`, the V3G3 destination-endpoint regression and every `shipment-map-*` / `shipment-runtime*` suite. Full sweep of **343** suites → the same **4** pre-existing failures (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`), none reading a changed file → **0 new failures**.

**One earlier assertion was superseded, not deleted:** `globe-visual-guard` M1 pinned the texture at 2048×1024 to prove the *visual-only* UI-GLOBE batch changed no texture memory. V3G6A is a deliberate, authorised fidelity change to exactly that ceiling, so M1 was replaced by a **stronger** contract (M1a–M1d, M2b): the base tier is still 2048×1024, the 4K tier is capability-gated on all four conditions, the rasterizer is called with the chosen tier rather than a hardcoded size, and the cloud radii scale with it. That suite is now **48 / 0**.

## Deployment manifest (USER-owned)
- `FRONTEND_DEPLOY_REQUIRED`: `assets/js/pages/shipping-history.js`, `assets/js/lib/km-globe.js`.
- `APPS_SCRIPT_SYNC_REQUIRED`: **none** · `BUNDLE_REBUILD_REQUIRED`: **NO** · DB / schema / master / Demo-row change: **none**.
- Map CSS unchanged (audited and found already correct). No new asset file added.
