/**
 * TEMP — F1-7N-FA-4A-DEMO-SEED-SHIPPING-SHIPMENT-MAP (V3, live-readback hardened)
 * Controlled, ISOLATED visual-demo seed for Weekly Shipping Plan, Shipment Overview/Draft and the On-the-Way Map.
 *
 * WRITES ONLY these six tables (FK-safe order): shipping_plans → shipping_plan_lines → shipments → shipment_lines
 * → shipment_routes → shipment_events. READ-ONLY authorities: shipment_route_templates, shipment_route_template_nodes,
 * logistics_locations, marketplace_skus, sku_details, warehouses. NEVER touches any master, allocation draft, factory
 * stock, PO, K2, flag, document, carrier API or notification. NEVER calls a production Submit/create/dispatch/receive
 * handler (rows are inserted directly).
 *
 * VISUAL-DEMO data only. It does NOT live-verify the operational workflow.
 *
 * V3 hardening: (A) exact existing-state classification ABSENT_ALL / PRESENT_EXACT_ALL / PARTIAL_PRESENT / CONTENT_DRIFT
 * / DUPLICATE_DEMO_ID — COMMIT proceeds ONLY for ABSENT_ALL (insert) or PRESENT_EXACT_ALL (true REUSED, zero write) and
 * refuses the other three before any mutation ("PK exists" is NEVER sufficient REUSE evidence). (B) canonical live-row
 * checksums over the fields this seed owns, with per-row/per-table checksums + exact mismatched fields + duplicate PK
 * counts. (C) VALIDATE checks actual LIVE rows (DEMO_SEED_VALIDATED is unreachable from PK presence alone). (D) real
 * SKU/site-SKU pairs from marketplace_skus ⋈ sku_details for a real derived scope (no fabricated site_sku). (E) one
 * fully-resolvable active template per US West/Central/East (distinct), truthful fallback flag otherwise. (F) fully
 * dynamic node/route/event counts bound by the plan checksum. (G) canonical shipment_events event_type enum, with an
 * explicit route.planned_event_type → recorded event mapping (never conflated). (H) durable seed journal + inserted-only
 * reverse-FK rollback on partial write. (I) full CLEAR implementation, staged OFF behind a placeholder token.
 *
 * All demo ids begin DEMO-20260824- and are fully DETERMINISTIC (no UUID). Both confirmation constants are placeholders
 * in this task; COMMIT and CLEAR are NOT run.
 *
 * Entrypoints (public — no trailing underscore):
 *   TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED()  · TEMP_DEMO4A_DRY_RUN_SHIPPING_SHIPMENT_MAP_SEED()
 *   TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED()     · TEMP_DEMO4A_VALIDATE_SHIPPING_SHIPMENT_MAP_SEED()
 *   TEMP_DEMO4A_CLEAR_SHIPPING_SHIPMENT_MAP_SEED()      (staged OFF)
 */

// ================================================================================================================
// FROZEN CONFIG (pure literals — no clock, no random; the plan is byte-stable across DRY_RUN / COMMIT / VALIDATE)
// ================================================================================================================
var DEMO4A_PREFIX_ = 'DEMO-20260824-';
var DEMO4A_TAG_ = 'DEMO ONLY — DO NOT PROCESS';
var DEMO4A_SOURCE_ = 'DEMO-4A';
var DEMO4A_ACTOR_ = 'demo-seed-4a';
var DEMO4A_CREATED_AT_ = '2026-08-20 09:00:00';
var DEMO4A_DEFAULT_COMPANY_ = 'KM';

// Confirmation gates — LEFT AT PLACEHOLDER in this task. Do NOT set; do NOT run COMMIT / CLEAR.
var DEMO4A_CONFIRMED_SEED_CHECKSUM_ = 'PASTE_DEMO_SEED_CHECKSUM_HERE';
var DEMO4A_CONFIRMED_CLEAR_TOKEN_ = 'PASTE_DEMO_CLEAR_TOKEN_HERE';

// Durable seed journal (Script Property) — written before the first row insert; holds the plan checksum, the ABSENT_ALL
// proof and every intended id, so a mid-commit failure can roll back EXACTLY the rows this execution inserted.
var DEMO4A_JOURNAL_KEY_ = 'DEMO4A_SEED_JOURNAL_V3';

// The six writable tables in FK-safe write order (and the reverse for CLEAR / rollback).
var DEMO4A_WRITE_ORDER_ = ['shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines', 'shipment_routes', 'shipment_events'];
var DEMO4A_CLEAR_ORDER_ = ['shipment_events', 'shipment_routes', 'shipment_lines', 'shipments', 'shipping_plan_lines', 'shipping_plans'];
var DEMO4A_PK_OF_ = { shipping_plans: 'shipping_plan_id', shipping_plan_lines: 'shipping_plan_line_id', shipments: 'shipment_id', shipment_lines: 'shipment_line_id', shipment_routes: 'shipment_route_id', shipment_events: 'shipment_event_id' };
// FK columns WITHIN the six demo tables that could hold a demo PK (a non-demo row pointing INTO the demo set).
var DEMO4A_FK_INTO_DEMO_ = { shipping_plans: ['transferred_shipment_id', 'parent_shipping_plan_id'], shipping_plan_lines: ['shipping_plan_id'], shipments: ['shipping_plan_id'], shipment_lines: ['shipment_id', 'shipping_plan_line_id'], shipment_routes: ['shipment_id'], shipment_events: ['shipment_id', 'shipment_route_id'] };
// V3A(D) — EXTERNAL downstream reference authorities audited across the repo that can carry any of the six demo id
// types (shipping_plan_id / shipping_plan_line_id / shipment_id / shipment_line_id / shipment_route_id /
// shipment_event_id). Sourced from SHIPMENT_LINE_ALLOCATIONS_HEADERS_ (32_:26), GENERATED_DOCUMENTS_HEADERS_
// (36_:41, polymorphic related_entity_id), SFO_SNAPSHOT/LINE/LINE_PO_HEADERS_ (34_:33/55/72), SHIP_RECEIPT_OVS_MOV_
// HEADERS_ (31_:429, polymorphic reference_id). CLEAR scans these (read-only) in addition to the six demo tables; ANY
// reference to a demo id refuses. The six demo tables are NOT assumed to be the complete downstream universe.
var DEMO4A_EXTERNAL_REF_ = {
  shipment_line_allocations: ['shipment_line_id'],
  generated_documents: ['related_entity_id'],
  shipment_final_output_snapshots: ['shipment_id'],
  shipment_final_output_lines: ['shipment_id', 'shipment_line_id'],
  shipment_final_output_line_pos: ['shipment_id', 'shipment_line_id'],
  overseas_inventory_movements: ['reference_id']
};

var DEMO4A_MASTER_TABS_ = ['shipment_route_templates', 'shipment_route_template_nodes', 'logistics_locations', 'marketplace_skus', 'sku_details'];

// Required columns per writable table (PK + FKs + the fields this seed writes). Verified against SHIPPING_PLANS_HEADERS_
// (11_:20), SHIPPING_PLAN_LINES_HEADERS_ (11_:40), SHIPMENTS_HEADERS_ (12_:30), SHIPMENT_LINES_HEADERS_ (12_:56),
// ROUTE_HEADERS (22_:180), SHIP_EVENT_HEADERS_ (31_:223).
var DEMO4A_REQUIRED_COLS_ = {
  shipping_plans: ['shipping_plan_id', 'shipping_plan_no', 'plan_name', 'company', 'country', 'marketplace', 'status', 'plan_version', 'created_by', 'created_at', 'note', 'source'],
  // V3B(A) — the canonical live shipping_plan_lines has NO marketplace column; marketplace is a HEADER/FK authority
  // (shipping_plans.marketplace + shipments.marketplace), never a plan-line column. Removed from required cols; the seed
  // no longer writes a marketplace field into plan lines (no DB column added).
  shipping_plan_lines: ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'site_sku', 'requested_qty', 'approved_qty', 'note', 'created_at'],
  shipments: ['shipment_id', 'shipment_no', 'shipping_plan_id', 'source_warehouse_id', 'company', 'country', 'marketplace', 'destination', 'destination_warehouse_id', 'carrier_id', 'shipping_method', 'status', 'etd', 'eta', 'delivered_date', 'shipment_total_qty', 'note', 'created_by', 'created_at'],
  shipment_lines: ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty', 'shipping_plan_line_id', 'note', 'created_at'],
  shipment_routes: ['shipment_route_id', 'shipment_id', 'route_template_id', 'route_template_node_id', 'sequence_no', 'node_type', 'node_code', 'location_ref_type', 'location_ref_id', 'location_name', 'country', 'region', 'city', 'latitude', 'longitude', 'transport_mode', 'planned_event_type', 'status', 'created_at', 'updated_at'],
  shipment_events: ['shipment_event_id', 'shipment_id', 'shipment_route_id', 'event_sequence', 'event_time', 'event_type', 'event_status', 'location_name', 'country', 'city', 'latitude', 'longitude', 'source', 'note', 'created_at']
};

// Canonical UI-consumed enums (audited). shipments.status: shipped(origin, MOVING) · in_transit(PRIMARY map, MOVING) ·
// received(delivered/terminal, DELIVERED). shipment_routes.status: completed|current|planned. shipment_events.event_type
// (production enum): departed_origin(completed) · route_node_reached(completed passed / current) · received(received);
// partial_receipt exists in production but is not used by this always-full demo. shipping_plans.status distinct
// pending_approval/approved/completed. The template free-text planned_event_type is preserved on the route row and is
// NEVER claimed to equal the canonical recorded event_type.
var DEMO4A_SHIP_LIFECYCLE_ = [
  { slot: 'origin',     status: 'shipped',    plan_status: 'pending_approval', etd: '2026-08-24', eta: '2026-09-05', delivered_date: '', event_end: '2026-08-24', event_step: 2 },
  { slot: 'in_transit', status: 'in_transit', plan_status: 'approved',         etd: '2026-08-20', eta: '2026-08-28', delivered_date: '', event_end: '2026-08-23', event_step: 3 },
  { slot: 'delivered',  status: 'received',   plan_status: 'completed',        etd: '2026-08-10', eta: '2026-08-22', delivered_date: '2026-08-22', event_end: '2026-08-22', event_step: 2 }
];

// ================================================================================================================
// PURE HELPERS (no GAS globals — unit-testable)
// ================================================================================================================
function DEMO4A_str_(v) { return String(v == null ? '' : v).trim(); }
function DEMO4A_low_(v) { return DEMO4A_str_(v).toLowerCase(); }
function DEMO4A_num_(v) { if (v === '' || v == null) return NaN; var n = Number(v); return isFinite(n) ? n : NaN; }
function DEMO4A_truthy_(v) { var s = DEMO4A_low_(v); return s === 'true' || s === 'yes' || s === '1' || s === 'y' || s === 'active' || v === true || v === 1; }
function DEMO4A_hash_(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return ('0000000' + h.toString(16)).slice(-8); }
function DEMO4A_z2_(x) { return (x < 10 ? '0' : '') + x; }
function DEMO4A_addDays_(ymd, n) { var p = String(ymd).split('-'); var d = new Date(Date.UTC(+p[0], (+p[1]) - 1, +p[2]) + (n * 86400000)); return d.getUTCFullYear() + '-' + DEMO4A_z2_(d.getUTCMonth() + 1) + '-' + DEMO4A_z2_(d.getUTCDate()); }
function DEMO4A_isDemo_(id) { return DEMO4A_str_(id).indexOf(DEMO4A_PREFIX_) === 0; }
// case-insensitive first-nonblank field lookup over candidate names (masters have no code header constant).
function DEMO4A_get_(row, names) { if (!row) return ''; var lc = {}; Object.keys(row).forEach(function (k) { lc[String(k).trim().toLowerCase()] = row[k]; }); for (var i = 0; i < names.length; i++) { var v = lc[names[i].toLowerCase()]; if (v != null && String(v).trim() !== '') return v; } return ''; }

// ---- canonical field normalization (Date/number-safe; never weakens a comparison) --------------------------------
function DEMO4A_canonDateOnly_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') { if (isNaN(v.getTime())) return ''; var d = new Date(v.getTime() + 8 * 3600000); return d.getUTCFullYear() + '-' + DEMO4A_z2_(d.getUTCMonth() + 1) + '-' + DEMO4A_z2_(d.getUTCDate()); }
  var s = String(v).trim(); var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var dt = new Date(s); if (!isNaN(dt.getTime())) { var d2 = new Date(dt.getTime() + 8 * 3600000); return d2.getUTCFullYear() + '-' + DEMO4A_z2_(d2.getUTCMonth() + 1) + '-' + DEMO4A_z2_(d2.getUTCDate()); }
  return s;
}
function DEMO4A_canonDateTime_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') { if (isNaN(v.getTime())) return ''; var d = new Date(v.getTime() + 8 * 3600000); return d.getUTCFullYear() + '-' + DEMO4A_z2_(d.getUTCMonth() + 1) + '-' + DEMO4A_z2_(d.getUTCDate()) + ' ' + DEMO4A_z2_(d.getUTCHours()) + ':' + DEMO4A_z2_(d.getUTCMinutes()) + ':' + DEMO4A_z2_(d.getUTCSeconds()); }
  var s = String(v).trim(); var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + (m[6] || '00');
  var mo = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (mo) return mo[1] + '-' + mo[2] + '-' + mo[3] + ' 00:00:00';
  return s;
}
function DEMO4A_fieldKind_(f) {
  if (f === 'event_time' || /_at$/.test(f)) return 'datetime';
  if (f === 'etd' || f === 'eta' || /_date$/.test(f)) return 'date';
  if (/(_qty$|^latitude$|^longitude$|sequence|units_per_carton|plan_version|carton|_snapshot$|_rate$|_cost$|_cbm$|weight$)/.test(f)) return 'numeric';
  return 'string';
}
function DEMO4A_canon_(field, value) {
  var k = DEMO4A_fieldKind_(field);
  if (k === 'datetime') return DEMO4A_canonDateTime_(value);
  if (k === 'date') return DEMO4A_canonDateOnly_(value);
  if (k === 'numeric') { var s = DEMO4A_str_(value); if (s === '') return ''; var n = Number(s); return isFinite(n) ? String(n) : s; }
  return DEMO4A_str_(value);
}
function DEMO4A_rowChecksum_(row, keys) { keys = keys.slice().sort(); return DEMO4A_hash_(keys.map(function (k) { return k + '=' + DEMO4A_canon_(k, (row || {})[k]); }).join('|')); }
function DEMO4A_mismatchedFields_(exp, live, keys) { var out = []; keys.forEach(function (k) { var e = DEMO4A_canon_(k, exp[k]), l = DEMO4A_canon_(k, (live || {})[k]); if (e !== l) out.push({ field: k, expected: e, live: l }); }); return out; }

function DEMO4A_validCoord_(lat, lng) { var a = DEMO4A_num_(lat), b = DEMO4A_num_(lng); if (isNaN(a) || isNaN(b)) return false; if (a < -90 || a > 90 || b < -180 || b > 180) return false; if (a === 0 && b === 0) return false; return true; }
function DEMO4A_indexLocations_(locations) { var by = {}; (locations || []).forEach(function (l) { var id = DEMO4A_str_(l.logistics_location_id); if (id) by[id] = l; }); return by; }
function DEMO4A_nodesByTemplate_(nodes) { var by = {}; (nodes || []).forEach(function (n) { var t = DEMO4A_str_(n.route_template_id); if (!t) return; (by[t] = by[t] || []).push(n); }); Object.keys(by).forEach(function (t) { by[t].sort(function (a, b) { return DEMO4A_num_(a.node_sequence) - DEMO4A_num_(b.node_sequence); }); }); return by; }
// robust node-field getters (header variants tolerated).
function DEMO4A_nodeLat_(node) { return DEMO4A_get_(node, ['latitude', 'lat']); }
function DEMO4A_nodeLng_(node) { return DEMO4A_get_(node, ['longitude', 'lng', 'lon']); }
function DEMO4A_nodeLocId_(node) { return DEMO4A_str_(DEMO4A_get_(node, ['logistics_location_id', 'location_id'])); }
// index locations by canonical logistics_location_id AND by location_code (the latter only for the read-only diagnostic).
function DEMO4A_indexLocationsByCode_(locations) { var by = {}; (locations || []).forEach(function (l) { var c = DEMO4A_str_(DEMO4A_get_(l, ['location_code', 'code'])); if (c) by[c] = l; }); return by; }
// V3C — the FROZEN master conclusion: route templates provide process/timeline topology, but their nodes are (with rare
// exceptions) NOT physically linked to logistics_locations (live: 0 node.logistics_location_id matches, 0 node_code→
// location_code matches, only 12/427 nodes with direct coords). Therefore the template node sequence/type/code/name is
// the TIMELINE authority; logistics_locations is the COORDINATE authority; and the Demo Seed creates an EXPLICIT
// DEMO-ONLY runtime binding (never a master edit, never fuzzy/name matching). Coordinate binding precedence per node:
//   1. CANONICAL_MASTER_BINDING — an EXACT full-value match between a node identifier field (or node_code) and a
//      logistics_locations identifier field (DEMO4A_LOC_ID_FIELDS_). Used only when source/live proves it.
//   2. NODE_DIRECT_COORDINATE — the node carries its own valid non-(0,0) latitude/longitude.
//   3. (role anchors only) DEMO_SYNTHETIC_RUNTIME_BINDING — a deterministically chosen existing active logistics_location
//      by exact country (+ preferred exact region + role-appropriate type). NEVER manufactures a coordinate.
// Every canonical location identifier field considered for an EXACT match (no fuzzy/substring/display-name matching):
var DEMO4A_LOC_ID_FIELDS_ = ['logistics_location_id', 'location_code', 'un_locode', 'iata_code', 'icao_code', 'port_code', 'rail_terminal_code', 'border_gateway_code', 'warehouse_id', 'factory_id', 'carrier_id'];
function DEMO4A_locValid_(loc) { return !!loc && DEMO4A_validCoord_(loc.latitude, loc.longitude); }
function DEMO4A_locId_(loc) { return DEMO4A_str_(DEMO4A_get_(loc, ['logistics_location_id', 'location_id'])); }
function DEMO4A_locType_(loc) { return DEMO4A_low_(DEMO4A_get_(loc, ['location_type', 'type', 'category', 'node_type'])); }
function DEMO4A_locCountry_(loc) { return DEMO4A_str_(DEMO4A_get_(loc, ['country', 'country_code'])); }
function DEMO4A_locRegion_(loc) { return DEMO4A_str_(DEMO4A_get_(loc, ['region', 'state', 'province', 'state_province'])); }
function DEMO4A_locActive_(loc) { var a = DEMO4A_activeFlag_(loc); return a !== false; }   // active unless EXPLICITLY inactive
// index locations by EACH exact identifier field (first occurrence wins, deterministic).
function DEMO4A_indexLocationsByIdentifiers_(locations) {
  var idx = {}; DEMO4A_LOC_ID_FIELDS_.forEach(function (f) { idx[f] = {}; });
  (locations || []).forEach(function (l) { DEMO4A_LOC_ID_FIELDS_.forEach(function (f) { var v = DEMO4A_str_(DEMO4A_get_(l, [f])); if (v !== '' && idx[f][v] === undefined) idx[f][v] = l; }); });
  return idx;
}
// EXACT canonical identifier match for a node → { loc, node_field, loc_field } or null. A node identifier field OR the
// node_code must EXACTLY equal a logistics_locations identifier field value AND that location must have valid coords.
// NO fuzzy/substring/name/city matching.
function DEMO4A_nodeCanonicalMatch_(node, idIndexes) {
  for (var i = 0; i < DEMO4A_LOC_ID_FIELDS_.length; i++) {
    var f = DEMO4A_LOC_ID_FIELDS_[i], idxF = idIndexes[f] || {};
    var nv = DEMO4A_str_(DEMO4A_get_(node, [f]));
    if (nv !== '' && idxF[nv] && DEMO4A_locValid_(idxF[nv])) return { loc: idxF[nv], node_field: f, loc_field: f };
    var code = DEMO4A_str_(node.node_code);
    if (code !== '' && idxF[code] && DEMO4A_locValid_(idxF[code])) return { loc: idxF[code], node_field: 'node_code', loc_field: f };
  }
  return null;
}
// per-node coordinate binding by precedence 1→2. Returns { bound, binding_type, location_ref_type, location_ref_id,
// latitude, longitude, location_name/country/region/city, match_field }. Unbound (abstract) ⇒ { bound:false }.
function DEMO4A_nodeGeoBinding_(node, idIndexes) {
  var cm = DEMO4A_nodeCanonicalMatch_(node, idIndexes);
  if (cm) return { bound: true, binding_type: 'CANONICAL_MASTER_BINDING', location_ref_type: 'logistics_location', location_ref_id: DEMO4A_locId_(cm.loc), match_field: cm.loc_field,
    latitude: DEMO4A_num_(cm.loc.latitude), longitude: DEMO4A_num_(cm.loc.longitude), location_name: DEMO4A_str_(cm.loc.location_name) || DEMO4A_str_(node.node_code), country: DEMO4A_locCountry_(cm.loc), region: DEMO4A_locRegion_(cm.loc), city: DEMO4A_str_(cm.loc.city) };
  var ownLat = DEMO4A_nodeLat_(node), ownLng = DEMO4A_nodeLng_(node);
  if (DEMO4A_validCoord_(ownLat, ownLng)) return { bound: true, binding_type: 'NODE_DIRECT_COORDINATE', location_ref_type: '', location_ref_id: '', match_field: '',
    latitude: DEMO4A_num_(ownLat), longitude: DEMO4A_num_(ownLng), location_name: DEMO4A_str_(DEMO4A_get_(node, ['node_name'])) || DEMO4A_str_(node.node_code), country: DEMO4A_str_(node.country), region: DEMO4A_str_(node.region), city: DEMO4A_str_(node.city) };
  return { bound: false };
}
// ================================================================================================================
// V3D — HARD ROUTE-GEOGRAPHY SEMANTIC GATE (replaces the soft type preference + id-order selection). Determinism is NOT
// semantic authority: a DEMO SYNTHETIC RUNTIME BINDING must be transport/role-compatible AND corridor-plausible, never
// chosen because its id sorts first. CANONICAL_MASTER_BINDING / NODE_DIRECT_COORDINATE are the node's own source-proven
// master truth (exact-identifier match or the node's own coordinate) and are EXEMPT from the synthetic gate — B(3) itself
// whitelists "an explicit third-country node country from the selected template node" and "a source-proven route corridor/
// transshipment authority". Only the invented synthetic pick is gated.
// ------------------------------------------------------------------------------------------------------------------
// Transport class of a template transit_type / node transport_mode (canonical tokens; NEVER a display-name match).
function DEMO4A_transportClass_(mode) {
  var m = DEMO4A_low_(mode);
  if (/air/.test(m)) return 'air';                                   // air / air_express / airfreight
  if (/rail|train|intermodal_rail/.test(m)) return 'rail';
  if (/truck|road|inland|ltl|ftl|drayage|ground|parcel|courier|last.?mile|fba/.test(m)) return 'truck';
  if (/sea|ocean|maritime|vessel|container|fcl|lcl|barge/.test(m)) return 'sea';
  return 'unknown';
}
// Normalize a raw logistics_locations.location_type to a canonical §5.2 enum token via an EXPLICIT synonym map (no fuzzy /
// substring / name matching). Blank → ''; an unrecognized token → 'UNKNOWN' (fails closed for a synthetic binding).
// Canonical enum (GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md §5.2): factory, warehouse, fulfillment_center, port, airport,
// rail_terminal, truck_terminal, border_crossing, customs_facility, transit_hub, parcel_hub, carrier_facility,
// city_centroid, country_centroid, virtual_transit_point, other (+ distribution_center as an owner-used warehouse-class).
var DEMO4A_LOC_TYPE_CANON_ = {
  factory: 'factory', plant: 'factory', manufacturer: 'factory', supplier: 'factory',
  warehouse: 'warehouse', wh: 'warehouse', dc_warehouse: 'warehouse',
  fulfillment_center: 'fulfillment_center', fulfilment_center: 'fulfillment_center', fc: 'fulfillment_center', fba: 'fulfillment_center', fba_center: 'fulfillment_center',
  distribution_center: 'distribution_center', dc: 'distribution_center', distribution_centre: 'distribution_center', regional_distribution_center: 'distribution_center',
  port: 'port', seaport: 'port', sea_port: 'port', harbor: 'port', harbour: 'port', container_port: 'port', ocean_port: 'port',
  airport: 'airport', air_port: 'airport', air_cargo_terminal: 'airport',
  rail_terminal: 'rail_terminal', railway_terminal: 'rail_terminal', rail: 'rail_terminal', railhead: 'rail_terminal', rail_ramp: 'rail_terminal', rail_yard: 'rail_terminal',
  truck_terminal: 'truck_terminal', trucking_terminal: 'truck_terminal', truck: 'truck_terminal', motor_carrier_terminal: 'truck_terminal', cross_dock: 'truck_terminal', crossdock: 'truck_terminal',
  border_crossing: 'border_crossing', border: 'border_crossing', border_gateway: 'border_crossing', land_border: 'border_crossing', land_port: 'border_crossing',
  customs_facility: 'customs_facility', customs: 'customs_facility', customs_office: 'customs_facility', bonded_warehouse: 'customs_facility', customs_bond: 'customs_facility',
  transit_hub: 'transit_hub', hub: 'transit_hub', transshipment: 'transit_hub', transshipment_hub: 'transit_hub', transhipment: 'transit_hub', gateway: 'transit_hub', logistics_hub: 'transit_hub', sort_center: 'transit_hub', sortation_center: 'transit_hub', consolidation_center: 'transit_hub',
  parcel_hub: 'parcel_hub', parcel: 'parcel_hub', last_mile_hub: 'parcel_hub', delivery_station: 'parcel_hub', delivery_node: 'parcel_hub',
  carrier_facility: 'carrier_facility', carrier: 'carrier_facility', courier_facility: 'carrier_facility', carrier_hub: 'carrier_facility',
  city_centroid: 'city_centroid', country_centroid: 'country_centroid',
  virtual_transit_point: 'virtual_transit_point', virtual: 'virtual_transit_point', midpoint: 'virtual_transit_point', ocean_waypoint: 'virtual_transit_point', waypoint: 'virtual_transit_point', transit_point: 'virtual_transit_point',
  other: 'other'
};
function DEMO4A_canonLocType_(raw) { var t = DEMO4A_low_(raw); if (t === '') return ''; return DEMO4A_LOC_TYPE_CANON_.hasOwnProperty(t) ? DEMO4A_LOC_TYPE_CANON_[t] : 'UNKNOWN'; }
// C — the HARD role/type compatibility matrix (canonical location_type tokens × transport class × role). Returns the set
// of COMPATIBLE canonical types. sea/truck destinations DELIBERATELY exclude airport; airport is a destination only for air.
function DEMO4A_roleCompatibleTypes_(tclass, role) {
  var ORIGIN = { sea: ['factory', 'warehouse', 'port', 'fulfillment_center', 'distribution_center'], air: ['factory', 'warehouse', 'airport', 'fulfillment_center', 'distribution_center'], rail: ['factory', 'warehouse', 'rail_terminal', 'distribution_center'], truck: ['factory', 'warehouse', 'truck_terminal', 'distribution_center'] };
  var CURRENT = { sea: ['port', 'transit_hub', 'virtual_transit_point'], air: ['airport', 'transit_hub', 'virtual_transit_point'], rail: ['rail_terminal', 'border_crossing', 'transit_hub', 'virtual_transit_point'], truck: ['truck_terminal', 'border_crossing', 'transit_hub', 'virtual_transit_point'] };
  var DEST_COMMON = ['warehouse', 'fulfillment_center', 'distribution_center', 'truck_terminal', 'rail_terminal', 'transit_hub', 'parcel_hub', 'carrier_facility'];
  if (role === 'origin') return (ORIGIN[tclass] || ORIGIN.sea).slice();
  if (role === 'current') return (CURRENT[tclass] || CURRENT.sea).slice();
  return (tclass === 'air') ? DEST_COMMON.concat(['airport']) : DEST_COMMON.slice();   // destination: sea/rail/truck exclude airport
}
// role/type verdict for a canonical location type: 'compatible' | 'incompatible' | 'unknown' (blank/unrecognized). UNKNOWN
// fails closed for a synthetic binding.
function DEMO4A_typeRoleCompat_(canonType, tclass, role) {
  if (canonType === '' || canonType === 'UNKNOWN') return 'unknown';
  return DEMO4A_roleCompatibleTypes_(tclass, role).indexOf(canonType) !== -1 ? 'compatible' : 'incompatible';
}
// D — node_type is an UNFROZEN user-maintained vocabulary (31_:110 makes the lifecycle STRUCTURAL, never node_type-driven).
// Structural position is the role authority; node_type is a recognized-INCOMPATIBLE GUARD for the synthetic CURRENT marker
// only — never host a moving current marker on a recognized customs / appointment / administrative / endpoint node.
// Returns 'compatible' | 'incompatible' | 'unknown' (unknown ⇒ allowed by structural position; documented + tested).
function DEMO4A_nodeRoleCompat_(nodeType, role) {
  var t = DEMO4A_low_(nodeType); if (t === '') return 'unknown';
  if (role !== 'current') return 'unknown';   // origin/destination governed structurally (first/last node)
  var BAD = /(customs|clearance|appointment|booking|schedule|document|admin|invoice|payment|origin|pickup|pick_up|destination|final|delivery|deliver|receipt|receive|fba|last_?mile|handover|drop_?off)/;
  var OK = /(port|ocean|sea|maritime|vessel|voyage|transit|transship|tranship|hub|gateway|main_?leg|main_?transit|line_?haul|linehaul|inland|rail|leg|waypoint|midpoint)/;
  if (BAD.test(t)) return 'incompatible';
  if (OK.test(t)) return 'compatible';
  return 'unknown';
}
// B(3) — the corridor countries plausible for a direct route's CURRENT marker: origin_country, destination_country, and
// any EXPLICIT non-blank node.country on the selected template's nodes (a proven route/transshipment node). Never the
// unrelated global logistics-location pool. Lowercased set.
function DEMO4A_corridorCountries_(template, resolved) {
  var set = {}, oc = DEMO4A_low_(DEMO4A_str_(template.origin_country)), dc = DEMO4A_low_(DEMO4A_str_(template.destination_country));
  if (oc) set[oc] = 1; if (dc) set[dc] = 1;
  (resolved || []).forEach(function (r) { var c = DEMO4A_low_(DEMO4A_str_(r.node.country)); if (c) set[c] = 1; });
  return set;
}
// D — choose the synthetic CURRENT-marker node index: a MIDDLE node (1..n-2) whose node_type is not recognized-incompatible
// for a moving transit marker, preferring a recognized-compatible one, then the geometric middle, then lowest index
// (deterministic). Returns -1 when no plausible middle node exists (⇒ not current-capable; fail closed).
function DEMO4A_chooseCurrentIndex_(resolved) {
  var n = resolved.length; if (n < 3) return -1;
  var mid = Math.max(1, Math.min(n - 2, Math.floor((n - 1) / 2))), cand = [];
  for (var i = 1; i <= n - 2; i++) { var c = DEMO4A_nodeRoleCompat_(resolved[i].node.node_type, 'current'); if (c !== 'incompatible') cand.push({ i: i, rank: (c === 'compatible' ? 0 : 1), dist: Math.abs(i - mid) }); }
  if (!cand.length) return -1;
  cand.sort(function (a, b) { if (a.rank !== b.rank) return a.rank - b.rank; if (a.dist !== b.dist) return a.dist - b.dist; return a.i - b.i; });
  return cand[0].i;
}
// HARD anchor pick from ACTIVE valid-coordinate locations. Country gate: opts.country (exact, origin/destination) OR
// opts.countries (corridor set, current). Exact region preferred when supplied AND an in-scope location carries it. The
// role/type gate is HARD (opts.role + opts.tclass): only role-compatible canonical location types survive; UNKNOWN/blank
// types are excluded. Excludes used ids. Deterministic by logistics_location_id. Returns { loc, region_exact, canon_type } | null.
function DEMO4A_pickAnchor_(locations, opts) {
  opts = opts || {};
  var role = opts.role, tclass = opts.tclass || 'sea';
  var compat = (role === 'origin' || role === 'current' || role === 'destination') ? DEMO4A_roleCompatibleTypes_(tclass, role) : null;
  var pool0 = (locations || []).filter(function (l) {
    if (!DEMO4A_locValid_(l) || !DEMO4A_locActive_(l)) return false;
    var id = DEMO4A_locId_(l); if (!id || (opts.exclude && opts.exclude[id])) return false;
    if (opts.countries) { if (!opts.countries[DEMO4A_low_(DEMO4A_locCountry_(l))]) return false; }         // B(3) corridor gate (current)
    else if (opts.country) { if (DEMO4A_low_(DEMO4A_locCountry_(l)) !== DEMO4A_low_(opts.country)) return false; }
    if (compat) { var ct = DEMO4A_canonLocType_(DEMO4A_locType_(l)); if (compat.indexOf(ct) === -1) return false; }   // C hard role/type gate
    return true;
  });
  if (!pool0.length) return null;
  var pool = pool0, regionExact = false;
  if (opts.region) { var byReg = pool0.filter(function (l) { return DEMO4A_low_(DEMO4A_locRegion_(l)) === DEMO4A_low_(opts.region); }); if (byReg.length) { pool = byReg; regionExact = true; } }
  pool.sort(function (a, b) { var ia = DEMO4A_locId_(a), ib = DEMO4A_locId_(b); return ia < ib ? -1 : (ia > ib ? 1 : 0); });
  return { loc: pool[0], region_exact: regionExact, canon_type: DEMO4A_canonLocType_(DEMO4A_locType_(pool[0])) };
}
function DEMO4A_bindingFromLoc_(loc, source, nodeIndex, regionExact) {
  return { source: source, node_index: nodeIndex, region_exact: !!regionExact, location_ref_id: DEMO4A_locId_(loc),
    latitude: DEMO4A_num_(loc.latitude), longitude: DEMO4A_num_(loc.longitude), location_name: DEMO4A_str_(loc.location_name), country: DEMO4A_locCountry_(loc), region: DEMO4A_locRegion_(loc), city: DEMO4A_str_(loc.city) };
}
// C/B/D — build the ORIGIN/CURRENT/DESTINATION role bindings for one template. A role node that already has a CANONICAL /
// DIRECT binding uses THAT source-proven coordinate authority (EXEMPT from the synthetic gate; compat still reported for
// evidence). Otherwise a HARD-gated deterministic Demo-only location is chosen: transport/role-compatible location_type,
// exact origin/destination country (region-preferred), corridor-country CURRENT marker on a node-role-compatible middle
// node. Origin + destination required (distinct coords); a distinct current marker only when opts.requireCurrent. Every
// role carries { role_compatible, corridor_compatible, canon_type, node_type } evidence; fail-closed with a typed reason.
function DEMO4A_coordKey_(b) { return DEMO4A_num_(b.latitude).toFixed(5) + ',' + DEMO4A_num_(b.longitude).toFixed(5); }
function DEMO4A_bindTemplateRoles_(template, resolved, locations, opts) {
  opts = opts || {};
  var n = resolved.length, used = {};
  var tclass = DEMO4A_transportClass_(template.transit_type);
  var lastMileClass = DEMO4A_transportClass_(template.last_mile_delivery);
  var corridor = DEMO4A_corridorCountries_(template, resolved);
  var evidence = { origin: null, current: null, destination: null };
  function evid(role, b) {
    var nd = resolved[b.node_index] ? resolved[b.node_index].node : null;
    return { role: role, location_id: DEMO4A_str_(b.location_ref_id), country: DEMO4A_str_(b.country), region: DEMO4A_str_(b.region),
      location_type: DEMO4A_str_(b.location_type || ''), canon_location_type: DEMO4A_str_(b.canon_type || ''), node_type: DEMO4A_str_(nd ? nd.node_type : ''),
      binding_type: b.source, source_proven: !!b.source_proven, role_compatible: b.role_compatible === true, corridor_compatible: b.corridor_compatible === true };
  }
  function roleAt(idx, role, pickOpts) {
    var geo = resolved[idx] && resolved[idx].geo;
    if (geo && geo.bound) {   // CANONICAL_MASTER_BINDING / NODE_DIRECT_COORDINATE = source-proven master truth (exempt)
      var b = { source: geo.binding_type, node_index: idx, region_exact: true, location_ref_id: geo.location_ref_id, latitude: geo.latitude, longitude: geo.longitude,
        location_name: geo.location_name, country: geo.country, region: geo.region, city: geo.city, canon_type: 'SOURCE_PROVEN', source_proven: true, role_compatible: true, corridor_compatible: true };
      if (b.location_ref_id) used[b.location_ref_id] = 1; used[DEMO4A_coordKey_(b)] = 1; evidence[role] = evid(role, b); return b;
    }
    pickOpts.exclude = used; pickOpts.role = role;
    pickOpts.tclass = (role === 'destination') ? (lastMileClass !== 'unknown' ? lastMileClass : tclass) : tclass;
    var pick = DEMO4A_pickAnchor_(locations, pickOpts);
    if (!pick) return null;
    var bb = DEMO4A_bindingFromLoc_(pick.loc, 'DEMO_SYNTHETIC_RUNTIME_BINDING', idx, pick.region_exact);
    bb.location_type = DEMO4A_locType_(pick.loc); bb.canon_type = pick.canon_type; bb.source_proven = false; bb.role_compatible = true; bb.corridor_compatible = true;
    used[bb.location_ref_id] = 1; used[DEMO4A_coordKey_(bb)] = 1; evidence[role] = evid(role, bb); return bb;
  }
  var origin = roleAt(0, 'origin', { country: DEMO4A_str_(template.origin_country) });
  if (!origin) return { ok: false, reason: 'NO_ROLE_COMPATIBLE_ORIGIN_LOCATION', evidence: evidence, corridor: Object.keys(corridor) };
  var destination = roleAt(n - 1, 'destination', { country: DEMO4A_str_(template.destination_country), region: DEMO4A_str_(template.destination_region) });
  if (!destination) return { ok: false, reason: 'NO_ROLE_COMPATIBLE_DESTINATION_LOCATION', evidence: evidence, corridor: Object.keys(corridor) };
  if (DEMO4A_coordKey_(origin) === DEMO4A_coordKey_(destination)) return { ok: false, reason: 'ORIGIN_DESTINATION_NOT_DISTINCT', evidence: evidence, corridor: Object.keys(corridor) };
  var roleByIndex = {}; roleByIndex[0] = origin; roleByIndex[n - 1] = destination;
  var current = null, currentIndex = -1;
  if (opts.requireCurrent) {
    if (n < 3) return { ok: false, reason: 'NO_MIDDLE_NODE_FOR_CURRENT_MARKER', evidence: evidence, origin: origin, destination: destination, corridor: Object.keys(corridor) };
    currentIndex = DEMO4A_chooseCurrentIndex_(resolved);
    if (currentIndex === -1) return { ok: false, reason: 'NODE_TYPE_INCOMPATIBLE_FOR_CURRENT_MARKER', evidence: evidence, origin: origin, destination: destination, corridor: Object.keys(corridor) };
    current = roleAt(currentIndex, 'current', { countries: corridor });   // B(3) corridor-restricted — NEVER the global pool
    if (!current) return { ok: false, reason: 'NO_ROLE_COMPATIBLE_CURRENT_LOCATION', evidence: evidence, origin: origin, destination: destination, corridor: Object.keys(corridor) };
    if (DEMO4A_coordKey_(current) === DEMO4A_coordKey_(origin) || DEMO4A_coordKey_(current) === DEMO4A_coordKey_(destination)) return { ok: false, reason: 'CURRENT_MARKER_NOT_DISTINCT', evidence: evidence, origin: origin, destination: destination, corridor: Object.keys(corridor) };
    roleByIndex[currentIndex] = current;
  }
  return { ok: true, origin: origin, destination: destination, current: current, current_index: currentIndex, role_by_index: roleByIndex, evidence: evidence, corridor: Object.keys(corridor), transport_class: tclass };
}
// region classification for a template (US West / Central / East), else OTHER.
function DEMO4A_regionOf_(tpl) {
  var hay = DEMO4A_low_(tpl.destination_region) + '|' + DEMO4A_low_(tpl.route_template_name);
  if (/west/.test(hay)) return 'US_WEST'; if (/central/.test(hay)) return 'US_CENTRAL'; if (/east/.test(hay)) return 'US_EAST'; return 'OTHER';
}
// V3C — ONE eligibility rule shared by selection AND the diagnostic. Eligible (for a non-in-transit slot) ⇔ active ·
// ≥2 nodes · sequences present + unique · valid origin + destination role bindings (distinct). requireCurrent adds the
// distinct in-transit current marker (needs ≥3 nodes). Per-node geo bindings (canonical/direct) are computed for the
// full sequence; abstract nodes are allowed and never fail the template.
function DEMO4A_templateEligibility_(t, ns, locations, idIndexes, opts) {
  opts = opts || {};
  if (!DEMO4A_truthy_(t.is_active)) return { eligible: false, reason: 'TEMPLATE_INACTIVE', resolved: [] };
  if (!ns || ns.length < 2) return { eligible: false, reason: 'FEWER_THAN_TWO_NODES', resolved: [] };
  var seqSeen = {}, resolved = [], canonicalCount = 0, directCount = 0, abstractCount = 0;
  for (var i = 0; i < ns.length; i++) {
    var seq = DEMO4A_str_(ns[i].node_sequence);
    if (seq === '' || seqSeen[seq]) return { eligible: false, reason: 'NODE_SEQUENCE_MISSING_OR_DUPLICATE', resolved: resolved };
    seqSeen[seq] = 1;
    var geo = DEMO4A_nodeGeoBinding_(ns[i], idIndexes);
    if (geo.bound && geo.binding_type === 'CANONICAL_MASTER_BINDING') canonicalCount++;
    else if (geo.bound) directCount++; else abstractCount++;
    resolved.push({ node: ns[i], geo: geo });
  }
  var bind = DEMO4A_bindTemplateRoles_(t, resolved, locations, opts);
  if (!bind.ok) return { eligible: false, reason: bind.reason, resolved: resolved, canonicalCount: canonicalCount, directCount: directCount, abstractCount: abstractCount };
  return { eligible: true, reason: '', resolved: resolved, binding: bind, canonicalCount: canonicalCount, directCount: directCount, abstractCount: abstractCount };
}
// G — select ONE template per US West/Central/East (distinct) with valid Demo bindings; the PRIMARY in-transit must also
// bind a distinct current marker. Truthful FALLBACK_TRUTHFUL_TOP3 when W/C/E cannot all be built; fail closed (with exact
// per-reason rejection counts) when fewer than three status-valid Demo plans exist.
function DEMO4A_selectTemplates_(templates, nodes, locations) {
  var byTpl = DEMO4A_nodesByTemplate_(nodes), idIndexes = DEMO4A_indexLocationsByIdentifiers_(locations);
  var qualified = [], rejections = {};
  (templates || []).forEach(function (t) {
    var tid = DEMO4A_str_(t.route_template_id); if (!tid) return;
    var ns = byTpl[tid] || [];
    var el = DEMO4A_templateEligibility_(t, ns, locations, idIndexes, {});
    if (!el.eligible) { rejections[el.reason] = (rejections[el.reason] || 0) + 1; return; }
    var elC = DEMO4A_templateEligibility_(t, ns, locations, idIndexes, { requireCurrent: true });   // can this be the primary in-transit?
    qualified.push({ template: t, tid: tid, resolved: el.resolved, nodeCount: ns.length, binding: el.binding, currentCapable: elC.eligible, currentBinding: elC.eligible ? elC.binding : null,
      canonicalCount: el.canonicalCount, directCount: el.directCount, abstractCount: el.abstractCount, region: DEMO4A_regionOf_(t) });
  });
  var availableRegions = {}; qualified.forEach(function (q) { availableRegions[q.region] = (availableRegions[q.region] || 0) + 1; });
  var currentCapable = qualified.filter(function (q) { return q.currentCapable; });
  if (qualified.length < 3 || !currentCapable.length) return { ok: false, reason: qualified.length < 3 ? 'INSUFFICIENT_STATUS_VALID_DEMO_PLANS' : 'NO_PRIMARY_IN_TRANSIT_CANDIDATE', qualified_count: qualified.length, current_capable_count: currentCapable.length, available_regions: availableRegions, rejection_counts: rejections };
  // richest = most nodes (fuller timeline), tie-break by id.
  function richer(a, b) { if (b.nodeCount !== a.nodeCount) return b.nodeCount - a.nodeCount; return a.tid < b.tid ? -1 : 1; }
  function best(pool, region) { var c = pool.filter(function (q) { return q.region === region; }); c.sort(richer); return c[0] || null; }
  var w = best(qualified, 'US_WEST'), c = best(qualified, 'US_CENTRAL'), e = best(qualified, 'US_EAST');
  var chosen, mode;
  if (w && c && e) { chosen = [w, c, e]; mode = 'DISTINCT_WCE'; }
  else { chosen = qualified.slice().sort(richer).slice(0, 3); mode = 'FALLBACK_TRUTHFUL_TOP3'; }
  // PRIMARY in-transit = richest current-capable among the chosen; else the richest current-capable overall (swap in).
  var chosenCurrentCapable = chosen.filter(function (q) { return q.currentCapable; }).sort(richer);
  var inTransit = chosenCurrentCapable[0];
  if (!inTransit) { inTransit = currentCapable.slice().sort(richer)[0]; chosen = [inTransit].concat(chosen.filter(function (q) { return q.tid !== inTransit.tid; })).slice(0, 3); mode = 'FALLBACK_TRUTHFUL_TOP3'; }
  var rest = chosen.filter(function (x) { return x.tid !== inTransit.tid; }).sort(function (a, b) { return a.tid < b.tid ? -1 : 1; });
  if (rest.length < 2) return { ok: false, reason: 'INSUFFICIENT_STATUS_VALID_DEMO_PLANS', qualified_count: qualified.length, current_capable_count: currentCapable.length, available_regions: availableRegions, rejection_counts: rejections };
  return { ok: true, region_selection_mode: mode, available_regions: availableRegions, rejection_counts: rejections,
    assign: { origin: rest[0], in_transit: inTransit, delivered: rest[1] },
    chosen: [rest[0], inTransit, rest[1]].map(function (x) { return { route_template_id: x.tid, region: x.region, node_count: x.nodeCount, canonical_bindings: x.canonicalCount, direct_coordinate_nodes: x.directCount, abstract_nodes: x.abstractCount, name: DEMO4A_str_(x.template.route_template_name) }; }),
    _assignRaw: { origin: rest[0], in_transit: inTransit, delivered: rest[1] } };
}

// V3C(B) — PURE read-only master-resolution diagnostic. Audits EXACT matches between every node identifier field (and
// node_code) and every logistics_locations identifier field (DEMO4A_LOC_ID_FIELDS_), reports per-field match counts,
// per-node binding classification (canonical / direct-coordinate / abstract), unresolved declared references, and how
// many templates can build valid Demo origin/destination (and distinct in-transit current) bindings. NO fuzzy matching.
// Never dumps all nodes (fingerprinted examples only).
function DEMO4A_diagnoseResolution_(templates, nodes, locations) {
  var idIndexes = DEMO4A_indexLocationsByIdentifiers_(locations), byTpl = DEMO4A_nodesByTemplate_(nodes);
  var activeTemplates = (templates || []).filter(function (t) { return DEMO4A_truthy_(t.is_active); });
  var nodeTypes = {}, canonical = 0, direct = 0, abstract = 0, unresolvedDeclared = 0;
  var byIdField = {}; DEMO4A_LOC_ID_FIELDS_.forEach(function (f) { byIdField[f] = 0; });
  (nodes || []).forEach(function (n) {
    var type = DEMO4A_low_(n.node_type) || '(blank)'; nodeTypes[type] = (nodeTypes[type] || 0) + 1;
    var cm = DEMO4A_nodeCanonicalMatch_(n, idIndexes);
    if (cm) { canonical++; byIdField[cm.loc_field] = (byIdField[cm.loc_field] || 0) + 1; }
    else if (DEMO4A_validCoord_(DEMO4A_nodeLat_(n), DEMO4A_nodeLng_(n))) direct++;
    else {
      abstract++;
      // a node that declares an identifier field or a logistics_location_id but does NOT resolve to any location
      var declares = false; DEMO4A_LOC_ID_FIELDS_.forEach(function (f) { if (DEMO4A_str_(DEMO4A_get_(n, [f])) !== '') declares = true; });
      if (declares) unresolvedDeclared++;
    }
  });
  var byRegionEligible = { US_WEST: 0, US_CENTRAL: 0, US_EAST: 0, OTHER: 0 }, failReasons = {}, currentCapable = 0, examples = [];
  activeTemplates.forEach(function (t) {
    var tid = DEMO4A_str_(t.route_template_id), ns = byTpl[tid] || [];
    var el = DEMO4A_templateEligibility_(t, ns, locations, idIndexes, {});
    var elC = DEMO4A_templateEligibility_(t, ns, locations, idIndexes, { requireCurrent: true });
    if (el.eligible) byRegionEligible[DEMO4A_regionOf_(t)] = (byRegionEligible[DEMO4A_regionOf_(t)] || 0) + 1;
    else failReasons[el.reason] = (failReasons[el.reason] || 0) + 1;
    if (elC.eligible) currentCapable++;
    if (examples.length < 5) examples.push({ template_fp: DEMO4A_hash_(tid), region: DEMO4A_regionOf_(t), node_count: ns.length, canonical_bindings: el.canonicalCount || 0, direct_coordinate_nodes: el.directCount || 0, abstract_nodes: el.abstractCount || 0, eligible: el.eligible, current_capable: elC.eligible, reason: el.reason || '' });
  });
  return {
    headers: { shipment_route_templates: (templates && templates[0]) ? Object.keys(templates[0]) : [], shipment_route_template_nodes: (nodes && nodes[0]) ? Object.keys(nodes[0]) : [], logistics_locations: (locations && locations[0]) ? Object.keys(locations[0]) : [] },
    active_template_count: activeTemplates.length, node_count: (nodes || []).length, location_count: (locations || []).length,
    exact_identifier_match_counts: byIdField,
    node_binding_counts: { canonical_master_binding: canonical, node_direct_coordinate: direct, abstract: abstract },
    unresolved_declared_location_refs: unresolvedDeclared, node_types: nodeTypes,
    frozen_authority: 'template node = TIMELINE authority; logistics_locations = COORDINATE authority. Coordinate binding: (1) EXACT node/node_code -> logistics_locations identifier match (CANONICAL_MASTER_BINDING); (2) node own lat/lng (NODE_DIRECT_COORDINATE); (3) role anchors only -> deterministic active logistics_location by exact country/region/type (DEMO_SYNTHETIC_RUNTIME_BINDING). No fuzzy/name matching; no master edit; no manufactured coordinate.',
    eligible_templates_by_region: byRegionEligible, in_transit_current_capable_templates: currentCapable,
    failure_reason_counts: failReasons,
    demo_binding_requirement_note: 'origin (first node) + destination (last node) bind to distinct valid logistics_locations; the primary in-transit additionally binds a distinct current transit marker on a middle node. Abstract timeline nodes remain coordinate-blank.',
    safe_examples: examples
  };
}

// V3A(C) — canonical active flag. Boolean-ish `is_active`/`active` (true/false/yes/no/1/0), else an explicit `status`
// column that must literally equal `active` — an unrelated arbitrary status string is NOT active. Returns true/false, or
// null when the row carries no active indicator at all (unknown).
function DEMO4A_activeFlag_(row) {
  var ia = DEMO4A_get_(row, ['is_active', 'active']);
  if (DEMO4A_str_(ia) !== '') { var s = DEMO4A_low_(ia); return (s === 'true' || s === 'yes' || s === '1' || s === 'y' || ia === true || ia === 1); }
  var st = DEMO4A_get_(row, ['status']);
  if (DEMO4A_str_(st) !== '') return DEMO4A_low_(st) === 'active';
  return null;   // no active indicator → unknown
}
// real SKU/site-SKU authority: join marketplace_skus ⋈ sku_details for a derived demo scope. NO fabricated site_sku,
// and NO fallback for a missing company/country — every canonical field must be present on the marketplace_skus row
// (company, country, marketplace, sku, site_sku) AND the master SKU must be active. Fewer than two eligible pairs in any
// single scope → INSUFFICIENT_ACTIVE_MARKETPLACE_SKUS.
function DEMO4A_resolveScopeAndSkus_(marketplaceSkus, skuDetails, destCountry) {
  var masterActive = {}; (skuDetails || []).forEach(function (d) { var s = DEMO4A_str_(DEMO4A_get_(d, ['sku', 'master_sku'])); if (!s) return; var a = DEMO4A_activeFlag_(d); masterActive[s] = (a === null) ? true : a; });   // no active column on the master → treat as active
  var scopes = {};   // key company|country|marketplace → [{sku,site_sku}]
  (marketplaceSkus || []).forEach(function (m) {
    var sku = DEMO4A_str_(DEMO4A_get_(m, ['sku', 'master_sku']));
    var site = DEMO4A_str_(DEMO4A_get_(m, ['site_sku', 'seller_sku', 'msku', 'listing_sku']));
    var mkt = DEMO4A_str_(DEMO4A_get_(m, ['marketplace', 'marketplace_name', 'channel']));
    var company = DEMO4A_str_(DEMO4A_get_(m, ['company']));
    var country = DEMO4A_str_(DEMO4A_get_(m, ['country', 'marketplace_country']));
    if (!sku || !site || !mkt || !company || !country) return;        // C — every canonical field required; NO default fallback
    if (DEMO4A_activeFlag_(m) === false) return;                       // explicit inactive excluded; unknown(null) allowed
    if (masterActive[sku] !== true) return;                            // master SKU must exist + be active
    var key = company + '|' + country + '|' + mkt;
    (scopes[key] = scopes[key] || []).push({ sku: sku, site_sku: site });
  });
  // prefer a scope whose country matches the chosen templates' destination country, then by pair count, then key.
  var keys = Object.keys(scopes).filter(function (k) { var seen = {}, u = []; scopes[k].forEach(function (p) { if (!seen[p.sku]) { seen[p.sku] = 1; u.push(p); } }); scopes[k] = u; return scopes[k].length >= 2; });
  if (!keys.length) return { ok: false, reason: 'INSUFFICIENT_ACTIVE_MARKETPLACE_SKUS' };
  keys.sort(function (a, b) {
    var ca = a.split('|')[1] === DEMO4A_str_(destCountry) ? 0 : 1, cb = b.split('|')[1] === DEMO4A_str_(destCountry) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    if (scopes[b].length !== scopes[a].length) return scopes[b].length - scopes[a].length;
    return a < b ? -1 : 1;
  });
  var chosenKey = keys[0], parts = chosenKey.split('|');
  var pairs = scopes[chosenKey].slice().sort(function (a, b) { return a.sku < b.sku ? -1 : (a.sku > b.sku ? 1 : 0); }).slice(0, 3);
  return { ok: true, company: parts[0], country: parts[1], marketplace: parts[2], pairs: pairs };
}

// V3C — the ROW coordinate binding at node index i: a ROLE anchor binding if present, else the node's own canonical/
// direct binding, else null (ABSTRACT — coordinate-blank timeline row). Never manufactures a coordinate.
function DEMO4A_rowBindingAt_(i, roleByIndex, resolved) {
  if (roleByIndex && roleByIndex[i]) { var rb = roleByIndex[i]; return { binding_type: rb.source, location_ref_id: rb.location_ref_id, latitude: rb.latitude, longitude: rb.longitude, location_name: rb.location_name, country: rb.country, region: rb.region, city: rb.city }; }
  var g = resolved[i] && resolved[i].geo;
  if (g && g.bound) return { binding_type: g.binding_type, location_ref_id: g.location_ref_id, latitude: g.latitude, longitude: g.longitude, location_name: g.location_name, country: g.country, region: g.region, city: g.city };
  return null;
}
// current route-row index per slot: origin(shipped)→0 (departed); delivered(received)→last (destination); in_transit→the
// bound current-marker index.
function DEMO4A_slotCurrentIndex_(slot, n, currentBindingIndex) {
  if (slot === 'origin') return 0;
  if (slot === 'delivered') return n - 1;
  return currentBindingIndex;   // in_transit
}
// route node statuses over ALL nodes relative to currentIndex (abstract rows carry status but no coordinate).
function DEMO4A_lifecycleNodes_(slot, n, currentIndex) {
  var statuses = [];
  for (var i = 0; i < n; i++) statuses.push(i < currentIndex ? 'completed' : (i === currentIndex ? 'current' : 'planned'));
  if (slot === 'delivered') { for (var j = 0; j < n; j++) statuses[j] = 'completed'; }
  else if (slot === 'origin') statuses[0] = 'completed';   // departed origin; no in-flight 'current' marker
  return { currentIndex: currentIndex, nodeStatuses: statuses };
}
// events on BOUND (geographic) route rows from origin up to currentIndex — each carrying the exact bound coordinate.
// Abstract rows never become events. LAST event agrees with shipment status. Canonical enums; strictly-increasing times.
function DEMO4A_lifecycleEvents_(slot, roleByIndex, resolved, currentIndex, endYmd, stepDays) {
  var evs = [];
  for (var i = 0; i <= currentIndex; i++) {
    var b = DEMO4A_rowBindingAt_(i, roleByIndex, resolved);
    if (!b) continue;
    evs.push({ nodeIndex: i, binding: b, planned_event_type: DEMO4A_str_(resolved[i].node.planned_event_type) });
  }
  var count = evs.length;
  evs.forEach(function (e, k) {
    var isLast = (k === count - 1);
    e.event_type = (k === 0) ? 'departed_origin' : 'route_node_reached'; e.event_status = 'completed';
    if (slot === 'in_transit' && isLast) e.event_status = 'current';
    if (slot === 'delivered' && isLast) { e.event_type = 'received'; e.event_status = 'received'; }
    e.event_time = DEMO4A_addDays_(endYmd, -((count - 1 - k) * stepDays)) + ' 10:00:00';
  });
  return evs;
}

// E — per-plan binding gates over the three shipments' role evidence. READY_FOR_DEMO_SEED is unreachable unless all gates
// are true. A source-proven (canonical/direct) binding satisfies role/corridor by authority; a synthetic binding must have
// passed the hard gate to exist here, so these gates read the ACTUAL evidence honestly (never hardcoded true).
function DEMO4A_bindingGates_(perShipment) {
  var all = [], primaryDistinct = true, primaryChecked = false, noAirportDest = true, noThirdCountry = true, roleOk = true, corridorOk = true;
  (perShipment || []).forEach(function (s) {
    var e = s.binding_evidence || {}, roles = ['origin', 'current', 'destination'];
    roles.forEach(function (r) { var b = e[r]; if (!b) return; all.push(b);
      if (!b.role_compatible) roleOk = false;
      if (!b.corridor_compatible && !b.source_proven) { corridorOk = false; noThirdCountry = false; }
    });
    var tclass = DEMO4A_str_(s.transport_class);
    if (e.destination && (tclass === 'sea' || tclass === 'truck' || tclass === 'rail') && !e.destination.source_proven && e.destination.canon_location_type === 'airport') noAirportDest = false;
    if (s.slot === 'in_transit' && e.origin && e.current && e.destination) {
      primaryChecked = true;
      var ids = [e.origin.location_id, e.current.location_id, e.destination.location_id];
      if (ids.some(function (x) { return x === ''; }) || ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) primaryDistinct = false;
    }
  });
  return {
    all_role_bindings_compatible: roleOk,
    all_corridor_bindings_compatible: corridorOk,
    primary_current_distinct: primaryChecked && primaryDistinct,
    no_unrelated_third_country: noThirdCountry,
    sea_truck_destination_not_airport: noAirportDest,
    ok: roleOk && corridorOk && (primaryChecked && primaryDistinct) && noThirdCountry && noAirportDest
  };
}

// ================================================================================================================
// PURE PLAN BUILDER — deterministic rows for all six tables + dynamic counts + visibility + demo_plan_checksum.
//   masters = { templates, nodes, locations, marketplaceSkus, skuDetails }.
// ================================================================================================================
function DEMO4A_buildPlan_(masters) {
  masters = masters || {};
  var sel = DEMO4A_selectTemplates_(masters.templates, masters.nodes, masters.locations);
  if (!sel.ok) return sel;
  var itPick = sel._assignRaw.in_transit;
  var destCountry = DEMO4A_str_((itPick.template || {}).destination_country) || DEMO4A_str_(itPick.currentBinding.destination.country) || 'US';
  var scope = DEMO4A_resolveScopeAndSkus_(masters.marketplaceSkus, masters.skuDetails, destCountry);
  if (!scope.ok) return scope;

  // V3F — DESTINATION-WAREHOUSE AUTHORITY GATE. Active ONLY when the `warehouses` master is present (legacy/test fixtures
  // without it keep the logistics-only binding unchanged). Resolves each shipment's destination BUSINESS identity
  // (template.destination_warehouse_id → warehouses row) then the typed coordinate branch (exact join to a
  // logistics_locations row via warehouse_id). Fails closed with exact evidence — NO fabricated FBA marker, NO received-
  // at-FBA — unless EVERY destination is WAREHOUSE_LOCATION_COORDINATE_READY. Identity (company/country) is validated
  // separately from coordinates.
  var warehousesPresent = !!(masters.warehouses && masters.warehouses.length);
  var destAuthority = {};
  if (warehousesPresent) {
    var whById = {}; masters.warehouses.forEach(function (w) { var id = DEMO4A_low_(DEMO4A_whId_(w)); if (id && whById[id] === undefined) whById[id] = w; });
    var authErrors = [];
    DEMO4A_SHIP_LIFECYCLE_.forEach(function (life) {
      var pick = sel._assignRaw[life.slot], tpl = pick.template, destWh = DEMO4A_str_(tpl.destination_warehouse_id);
      var whRow = destWh ? whById[DEMO4A_low_(destWh)] : null;
      var r;
      if (whRow && !DEMO4A_whDestTypeCompatible_(whRow)) r = { branch: 'WAREHOUSE_IDENTITY_INELIGIBLE', reason: 'WAREHOUSE_TYPE_NOT_DESTINATION_COMPATIBLE:' + DEMO4A_whType_(whRow), warehouse_id: DEMO4A_whId_(whRow), renderable: false, received_allowed: false };
      else if (whRow && DEMO4A_whCompany_(whRow) && scope.company && DEMO4A_low_(DEMO4A_whCompany_(whRow)) !== DEMO4A_low_(scope.company)) r = { branch: 'WAREHOUSE_IDENTITY_MISMATCH', reason: 'COMPANY_MISMATCH', warehouse_id: DEMO4A_whId_(whRow), renderable: false, received_allowed: false };
      else if (whRow && DEMO4A_whCountry_(whRow) && DEMO4A_str_(tpl.destination_country) && DEMO4A_low_(DEMO4A_whCountry_(whRow)) !== DEMO4A_low_(DEMO4A_str_(tpl.destination_country))) r = { branch: 'WAREHOUSE_IDENTITY_MISMATCH', reason: 'COUNTRY_MISMATCH', warehouse_id: DEMO4A_whId_(whRow), renderable: false, received_allowed: false };
      else r = DEMO4A_resolveWarehouseDestination_(whRow, masters.locations);
      destAuthority[life.slot] = r;
      if (r.branch !== 'WAREHOUSE_LOCATION_COORDINATE_READY') authErrors.push({ slot: life.slot, branch: r.branch, reason: r.reason || '', warehouse_id: r.warehouse_id || destWh });
    });
    if (authErrors.length) return { ok: false, reason: 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', destination_authority_errors: authErrors, destination_authority: destAuthority };
  }

  var P = DEMO4A_PREFIX_;
  var tables = { shipping_plans: [], shipping_plan_lines: [], shipments: [], shipment_lines: [], shipment_routes: [], shipment_events: [] };
  var visibility = { weekly_shipping_plan: [], shipment_draft: [], shipment_overview: [], on_the_way_map: [], primary_map_record: null };
  var per_shipment = [], eventMap = [], bindingManifest = [];

  DEMO4A_SHIP_LIFECYCLE_.forEach(function (life, si) {
    var idx = si + 1, pick = sel._assignRaw[life.slot], tpl = pick.template, resolved = pick.resolved, nodeCount = resolved.length;
    var isInTransit = (life.slot === 'in_transit');
    var binding = isInTransit ? pick.currentBinding : pick.binding;   // in-transit uses the current-marker binding
    var roleByIndex = binding.role_by_index;
    var planId = P + 'SP-' + idx, shipId = P + 'SHP-' + idx;
    // V3F — when the warehouse authority is active + READY, the FINAL DESTINATION marker IS the exact warehouse-linked
    // logistics_location (E): override the last-node binding with that source-proven facility coordinate. The route
    // lat/lng then equal that exact location row; both identities (warehouse_id + logistics_location_id) are preserved.
    var da = warehousesPresent ? destAuthority[life.slot] : null;
    if (da && da.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY') {
      var destIdx = resolved.length - 1;
      var whBind = { source: 'WAREHOUSE_LOCATION_BINDING', node_index: destIdx, region_exact: true, location_ref_id: da.logistics_location_id,
        latitude: da.latitude, longitude: da.longitude, location_name: da.logistics_location_id, country: da.country, region: da.region, city: '',
        canon_type: da.location_type, location_type: da.location_type, source_proven: true, role_compatible: true, corridor_compatible: true,
        warehouse_id: da.warehouse_id, verification_status: da.verification_status };
      binding.destination = whBind; roleByIndex[destIdx] = whBind;
      if (binding.evidence) binding.evidence.destination = { role: 'destination', location_id: da.logistics_location_id, warehouse_id: da.warehouse_id, country: da.country, region: da.region, location_type: da.location_type, canon_location_type: da.location_type, node_type: DEMO4A_str_(resolved[destIdx].node.node_type), binding_type: 'WAREHOUSE_LOCATION_BINDING', source_proven: true, role_compatible: true, corridor_compatible: true };
    }
    var originCountry = DEMO4A_str_(tpl.origin_country) || DEMO4A_str_(binding.origin.country) || 'CN';
    var destRegion = DEMO4A_str_(tpl.destination_region) || DEMO4A_str_(binding.destination.region) || pick.region;
    var srcWh = DEMO4A_str_(tpl.origin_warehouse_id), destWh = DEMO4A_str_(tpl.destination_warehouse_id);
    var carrier = DEMO4A_str_(tpl.carrier_id), method = DEMO4A_str_(tpl.transit_type) || 'SEA', lastMile = DEMO4A_str_(tpl.last_mile_delivery);

    tables.shipping_plans.push({
      shipping_plan_id: planId, shipping_plan_no: 'DEMO-PLAN-' + idx, plan_name: 'DEMO Route ' + destRegion + ' #' + idx,
      company: scope.company, country: scope.country, marketplace: scope.marketplace,
      ship_from: originCountry, source_warehouse_id: srcWh, ship_from_type: 'warehouse',
      destination: destRegion || scope.country, destination_warehouse_id: destWh, destination_type: 'warehouse',
      shipping_method: method, last_mile_delivery: lastMile, carrier_id: carrier,
      status: life.plan_status, batch_status: 'open', plan_version: '1',
      created_by: DEMO4A_ACTOR_, created_at: DEMO4A_CREATED_AT_, note: DEMO4A_TAG_, source: DEMO4A_SOURCE_,
      updated_at: DEMO4A_CREATED_AT_, updated_by: DEMO4A_ACTOR_, transferred_shipment_id: shipId
    });
    visibility.weekly_shipping_plan.push({ shipping_plan_id: planId, status: life.plan_status });

    var lineCount = 2 + (idx % 2), shipTotalQty = 0;
    for (var li = 1; li <= lineCount; li++) {
      var pair = scope.pairs[(li - 1) % scope.pairs.length];
      var qty = 100 * idx + 10 * li, planLineId = P + 'SPL-' + idx + '-' + li, shipLineId = P + 'SHL-' + idx + '-' + li;
      shipTotalQty += qty;
      // V3B(A) — NO marketplace on the plan line (canonical schema has no such column); marketplace lives on the header.
      tables.shipping_plan_lines.push({ shipping_plan_line_id: planLineId, shipping_plan_id: planId, sku: pair.sku, site_sku: pair.site_sku,
        requested_qty: qty, approved_qty: qty, plan_carton_qty: Math.ceil(qty / 20), units_per_carton: 20, source_page: 'demo', note: DEMO4A_TAG_, created_at: DEMO4A_CREATED_AT_, updated_at: DEMO4A_CREATED_AT_ });
      tables.shipment_lines.push({ shipment_line_id: shipLineId, shipment_id: shipId, sku: pair.sku, shipment_qty: qty, shipment_carton_qty: Math.ceil(qty / 20), units_per_carton: 20,
        shipping_plan_line_id: planLineId, note: DEMO4A_TAG_, created_at: DEMO4A_CREATED_AT_, updated_at: DEMO4A_CREATED_AT_ });
    }

    tables.shipments.push({ shipment_id: shipId, shipment_no: 'DEMO-SHIP-' + idx, shipping_plan_id: planId,
      source_warehouse_id: srcWh, warehouse_id: destWh, company: scope.company, country: scope.country, marketplace: scope.marketplace,
      ship_from: originCountry, destination: destRegion || scope.country, destination_warehouse_id: destWh, destination_type: 'warehouse',
      carrier_id: carrier, shipping_method: method, last_mile_delivery: lastMile, status: life.status,
      etd: life.etd, eta: life.eta, actual_departure_date: life.etd, actual_arrival_date: life.delivered_date, delivered_date: life.delivered_date,
      shipment_total_qty: shipTotalQty, currency: 'USD', note: DEMO4A_TAG_, created_by: DEMO4A_ACTOR_, created_at: DEMO4A_CREATED_AT_, updated_at: DEMO4A_CREATED_AT_, updated_by: DEMO4A_ACTOR_ });
    if (DEMO4A_overviewVisible_(life.status)) visibility.shipment_overview.push({ shipment_id: shipId, status: life.status });
    if (DEMO4A_draftVisible_(life.status)) visibility.shipment_draft.push({ shipment_id: shipId, status: life.status });

    var currentIndex = DEMO4A_slotCurrentIndex_(life.slot, nodeCount, isInTransit ? binding.current_index : 0);
    var lc = DEMO4A_lifecycleNodes_(life.slot, nodeCount, currentIndex);
    var canonicalCount = 0, directCount = 0, syntheticCount = 0, abstractRowCount = 0;
    for (var ni = 0; ni < nodeCount; ni++) {
      var node = resolved[ni].node, rbd = DEMO4A_rowBindingAt_(ni, roleByIndex, resolved);
      if (rbd) { if (rbd.binding_type === 'CANONICAL_MASTER_BINDING') canonicalCount++; else if (rbd.binding_type === 'NODE_DIRECT_COORDINATE') directCount++; else syntheticCount++; }
      else abstractRowCount++;
      // V3C — a bound row copies its coordinate EXACTLY from the resolved authority (canonical/direct/synthetic location);
      // location_ref_type='logistics_location' only when a canonical logistics_location_id resolved. An ABSTRACT row keeps
      // the node timeline label (code/name/country) with NO coordinate and NO location_ref — never a map marker.
      tables.shipment_routes.push({ shipment_route_id: P + 'SR-' + idx + '-' + DEMO4A_z2_(ni + 1), shipment_id: shipId,
        route_template_id: pick.tid, route_template_node_id: DEMO4A_str_(node.route_template_node_id), sequence_no: DEMO4A_str_(node.node_sequence),
        node_type: DEMO4A_str_(node.node_type), node_code: DEMO4A_str_(node.node_code),
        location_ref_type: (rbd && DEMO4A_str_(rbd.location_ref_id) !== '') ? 'logistics_location' : '', location_ref_id: rbd ? DEMO4A_str_(rbd.location_ref_id) : '',
        location_name: rbd ? rbd.location_name : (DEMO4A_str_(DEMO4A_get_(node, ['node_name'])) || DEMO4A_str_(node.node_code)),
        country: rbd ? rbd.country : DEMO4A_str_(node.country), region: rbd ? rbd.region : DEMO4A_str_(node.region), city: rbd ? rbd.city : DEMO4A_str_(node.city),
        latitude: rbd ? rbd.latitude : '', longitude: rbd ? rbd.longitude : '',
        transport_mode: DEMO4A_str_(node.transport_mode_to_next), planned_event_type: DEMO4A_str_(node.planned_event_type), status: lc.nodeStatuses[ni],
        created_at: DEMO4A_CREATED_AT_, updated_at: DEMO4A_CREATED_AT_ });
    }

    // H/F — binding manifest (checksummed): each role's node id + node_type + exact logistics_location_id + binding type +
    // country + region + canonical location_type + role/corridor compatibility DECISIONS + exact coords. Any change to a
    // binding's location, type, role/corridor decision, country/region or coordinate changes the demo_plan_checksum.
    ['origin', 'current', 'destination'].forEach(function (role) {
      var b = binding[role]; if (!b) return; var nd = resolved[b.node_index].node;
      bindingManifest.push([shipId, role, DEMO4A_str_(nd.route_template_node_id), DEMO4A_str_(nd.node_type), DEMO4A_str_(b.location_ref_id), b.source,
        DEMO4A_str_(b.country), DEMO4A_str_(b.region), DEMO4A_str_(b.canon_type || DEMO4A_canonLocType_(b.location_type || '')),
        (b.role_compatible === true ? '1' : '0'), (b.corridor_compatible === true ? '1' : '0'), DEMO4A_num_(b.latitude), DEMO4A_num_(b.longitude)].join('~'));
    });
    // V3F — bind the destination BUSINESS identity + coordinate branch into the checksum (both ids + join key + branch +
    // location_type + verification_status + exact coord), so any change to the warehouse/location authority re-checksums.
    if (da) bindingManifest.push(['WHDEST', shipId, DEMO4A_str_(da.warehouse_id), DEMO4A_str_(da.logistics_location_id), DEMO4A_str_(da.branch), DEMO4A_str_(da.location_type), DEMO4A_str_(da.verification_status), DEMO4A_num_(da.latitude), DEMO4A_num_(da.longitude)].join('~'));

    var routeIdOf = function (ni) { return P + 'SR-' + idx + '-' + DEMO4A_z2_(ni + 1); };
    var evs = DEMO4A_lifecycleEvents_(life.slot, roleByIndex, resolved, currentIndex, life.event_end, life.event_step);
    evs.forEach(function (e, ei) {
      tables.shipment_events.push({ shipment_event_id: P + 'SE-' + idx + '-' + DEMO4A_z2_(ei + 1), shipment_id: shipId, shipment_route_id: routeIdOf(e.nodeIndex),
        event_sequence: ei + 1, event_time: e.event_time, event_type: e.event_type, event_status: e.event_status,
        location_name: e.binding.location_name, country: e.binding.country, city: e.binding.city, latitude: e.binding.latitude, longitude: e.binding.longitude,
        source: DEMO4A_SOURCE_, source_event_id: P + 'SE-' + idx + '-' + DEMO4A_z2_(ei + 1), raw_status: e.event_status,
        note: DEMO4A_TAG_ + (e.binding.binding_type === 'DEMO_SYNTHETIC_RUNTIME_BINDING' ? ' · DEMO-4A-SYNTHETIC-RUNTIME-BINDING' : ''),
        created_by: DEMO4A_ACTOR_, created_at: DEMO4A_CREATED_AT_, updated_by: DEMO4A_ACTOR_, updated_at: DEMO4A_CREATED_AT_ });
      // G — explicit route.planned_event_type → canonical recorded event_type mapping (NEVER conflated)
      eventMap.push({ shipment_id: shipId, sequence_no: DEMO4A_str_(resolved[e.nodeIndex].node.node_sequence), route_planned_event_type: e.planned_event_type || '(none)', recorded_event_type: e.event_type, recorded_event_status: e.event_status });
    });

    per_shipment.push({ shipment_id: shipId, slot: life.slot, status: life.status, template: pick.tid, region: pick.region, nodes: nodeCount,
      canonical_binding_count: canonicalCount, direct_coordinate_count: directCount, demo_synthetic_binding_count: syntheticCount, abstract_rows: abstractRowCount,
      route_rows: nodeCount, event_rows: evs.length, origin_location_id: DEMO4A_str_(binding.origin.location_ref_id), current_location_id: binding.current ? DEMO4A_str_(binding.current.location_ref_id) : '', destination_location_id: DEMO4A_str_(binding.destination.location_ref_id),
      plan_lines: lineCount, shipment_lines: lineCount,
      transport_class: DEMO4A_str_(binding.transport_class || DEMO4A_transportClass_(method)),
      destination_warehouse_id: da ? DEMO4A_str_(da.warehouse_id) : destWh, destination_logistics_location_id: da ? DEMO4A_str_(da.logistics_location_id) : DEMO4A_str_(binding.destination.location_ref_id),
      destination_coordinate_branch: da ? da.branch : 'LOGISTICS_ONLY_BINDING', destination_facility_marker_renderable: da ? !!da.renderable : true, destination_verification_status: da ? DEMO4A_str_(da.verification_status) : '',
      binding_evidence: { origin: binding.evidence ? binding.evidence.origin : null, current: binding.evidence ? binding.evidence.current : null, destination: binding.evidence ? binding.evidence.destination : null } });

    var onMap = DEMO4A_mapVisible_(life.status, evs.length, nodeCount);
    if (onMap) { var last = evs[evs.length - 1]; var mapRec = { shipment_id: shipId, status: life.status, moving: DEMO4A_mapMoving_(life.status), delivered: DEMO4A_mapDelivered_(life.status), current_node_sequence: DEMO4A_str_(resolved[currentIndex].node.node_sequence), latest_event: last.event_type, latest_event_time: last.event_time, marker_lat: last.binding.latitude, marker_lng: last.binding.longitude, carrier_id: carrier, transit_method: method, eta: life.eta }; visibility.on_the_way_map.push(mapRec); if (life.slot === 'in_transit') visibility.primary_map_record = mapRec; }
  });

  var counts = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { counts[t] = tables[t].length; });
  counts.total = DEMO4A_WRITE_ORDER_.reduce(function (a, t) { return a + tables[t].length; }, 0);
  var binding_gates = DEMO4A_bindingGates_(per_shipment);
  return { ok: true, checksum: DEMO4A_checksum_(tables, bindingManifest), tables: tables, counts: counts, per_shipment: per_shipment, visibility: visibility, binding_gates: binding_gates,
    scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku_pairs: scope.pairs },
    region_selection_mode: sel.region_selection_mode, available_regions: sel.available_regions, rejection_counts: sel.rejection_counts, chosen_templates: sel.chosen,
    warehouses_present: warehousesPresent, destination_authority: destAuthority,
    binding_manifest: bindingManifest.slice(), route_event_map: eventMap };
}
function DEMO4A_overviewVisible_(s) { return { shipped: 1, in_transit: 1, arrived: 1, received: 1, closed: 1 }[DEMO4A_low_(s)] === 1; }
function DEMO4A_draftVisible_(s) { return { draft: 1, ready_to_ship: 1, shipped: 1 }[DEMO4A_low_(s)] === 1; }
function DEMO4A_mapMoving_(s) { return { shipped: 1, in_transit: 1 }[DEMO4A_low_(s)] === 1; }
function DEMO4A_mapDelivered_(s) { return { received: 1, completed: 1, delivered: 1, closed: 1 }[DEMO4A_low_(s)] === 1; }
function DEMO4A_mapVisible_(s, eventCount, nodeCount) { var x = DEMO4A_low_(s); if (x === 'cancelled' || x === 'closed') return false; var runtime = { shipped: 1, in_transit: 1, arrived: 1, partial_received: 1, partially_received: 1, received: 1, completed: 1, delivered: 1 }[x] === 1; return runtime || eventCount > 0 || nodeCount > 0; }
// H — the checksum binds every six-table row AND the explicit binding manifest (role node ids + exact logistics_location
// ids + binding type + exact coordinates), so any change to a binding/location/coordinate changes the checksum.
function DEMO4A_checksum_(tables, bindingManifest) {
  var parts = [];
  DEMO4A_WRITE_ORDER_.forEach(function (t) { var pk = DEMO4A_PK_OF_[t]; (tables[t] || []).slice().sort(function (a, b) { return DEMO4A_str_(a[pk]) < DEMO4A_str_(b[pk]) ? -1 : 1; }).forEach(function (r) { parts.push(t + '{' + DEMO4A_rowChecksum_(r, Object.keys(r)) + '}'); }); });
  if (bindingManifest && bindingManifest.length) parts.push('BIND{' + bindingManifest.slice().sort().join('|') + '}');
  return DEMO4A_hash_(parts.join('\n'));
}
function DEMO4A_allIds_(plan) { var ids = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { ids[t] = (plan.tables[t] || []).map(function (r) { return r[DEMO4A_PK_OF_[t]]; }); }); return ids; }
function DEMO4A_chronology_(plan) { var byShip = {}; (plan.tables.shipment_events || []).forEach(function (e) { (byShip[e.shipment_id] = byShip[e.shipment_id] || []).push({ seq: e.event_sequence, time: e.event_time, type: e.event_type, status: e.event_status, route: e.shipment_route_id }); }); return byShip; }

// ================================================================================================================
// A/B — EXACT EXISTING-STATE CLASSIFICATION over LIVE rows (never "PK exists" alone).
// ================================================================================================================
function DEMO4A_classifyState_(plan, live) {
  var rows = [], dupCounts = {}, unexpected = [], anyAbsent = false, anyExact = false, anyDrift = false, anyDup = false;
  var expTableCk = {}, liveTableCk = {};
  DEMO4A_WRITE_ORDER_.forEach(function (name) {
    var pk = DEMO4A_PK_OF_[name], liveRows = (live[name] ? live[name].rows : []);
    var liveByPk = {}; liveRows.forEach(function (r) { var id = DEMO4A_str_(r[pk]); if (!id) return; (liveByPk[id] = liveByPk[id] || []).push(r); });
    var expIds = {}, expCk = [], liveCk = [];
    (plan.tables[name] || []).forEach(function (er) {
      var id = DEMO4A_str_(er[pk]); expIds[id] = 1; var keys = Object.keys(er), eck = DEMO4A_rowChecksum_(er, keys); expCk.push(eck);
      var matches = liveByPk[id] || [], rec = { table: name, pk: id, expected_checksum: eck, live_count: matches.length };
      if (matches.length === 0) { rec.state = 'ABSENT'; anyAbsent = true; }
      else if (matches.length > 1) { rec.state = 'DUPLICATE'; anyDup = true; dupCounts[name] = (dupCounts[name] || 0) + matches.length; rec.live_checksum = DEMO4A_rowChecksum_(matches[0], keys); }
      else { var lck = DEMO4A_rowChecksum_(matches[0], keys); rec.live_checksum = lck; liveCk.push(lck); if (lck === eck) { rec.state = 'EXACT'; anyExact = true; } else { rec.state = 'DRIFT'; anyDrift = true; rec.mismatched_fields = DEMO4A_mismatchedFields_(er, matches[0], keys); } }
      rows.push(rec);
    });
    Object.keys(liveByPk).forEach(function (id) { if (DEMO4A_isDemo_(id) && !expIds[id]) unexpected.push(name + ':' + id); });
    expTableCk[name] = DEMO4A_hash_(expCk.join('|')); liveTableCk[name] = DEMO4A_hash_(liveCk.slice().sort().join('|'));
  });
  var classification = anyDup ? 'DUPLICATE_DEMO_ID' : anyDrift ? 'CONTENT_DRIFT' : (unexpected.length || (anyExact && anyAbsent)) ? 'PARTIAL_PRESENT' : (anyExact && !anyAbsent) ? 'PRESENT_EXACT_ALL' : 'ABSENT_ALL';
  return { classification: classification, rows: rows, duplicate_pk_counts: dupCounts, unexpected_demo_ids: unexpected, expected_table_checksums: expTableCk, live_table_checksums: liveTableCk };
}

// ================================================================================================================
// C — LIVE-ROW VALIDATOR. Every check reads actual live rows. DEMO_SEED_VALIDATED requires PRESENT_EXACT_ALL AND all pass.
// ================================================================================================================
function DEMO4A_validateLiveRows_(plan, live, masters) {
  function demoRows(name) { var pk = DEMO4A_PK_OF_[name]; return (live[name] ? live[name].rows : []).filter(function (r) { return DEMO4A_isDemo_(r[pk]); }); }
  function idset(name) { var s = {}, pk = DEMO4A_PK_OF_[name]; demoRows(name).forEach(function (r) { s[DEMO4A_str_(r[pk])] = r; }); return s; }
  var plans = idset('shipping_plans'), spl = idset('shipping_plan_lines'), sp = idset('shipments'), sl = idset('shipment_lines'), routes = idset('shipment_routes'), events = idset('shipment_events');
  var checks = {};

  // exact PK once (live count == 1 for every expected)
  var pkOnce = true, pkBad = [];
  DEMO4A_WRITE_ORDER_.forEach(function (name) { var pk = DEMO4A_PK_OF_[name], cnt = {}; demoRows(name).forEach(function (r) { var id = DEMO4A_str_(r[pk]); cnt[id] = (cnt[id] || 0) + 1; }); (plan.tables[name] || []).forEach(function (er) { var id = DEMO4A_str_(er[pk]); if (cnt[id] !== 1) { pkOnce = false; pkBad.push(name + ':' + id + '×' + (cnt[id] || 0)); } }); });
  checks.exact_pk_once = { ok: pkOnce, bad: pkBad.slice(0, 10) };

  // exact content checksum (classification PRESENT_EXACT_ALL)
  var cls = DEMO4A_classifyState_(plan, live);
  checks.exact_content = { ok: cls.classification === 'PRESENT_EXACT_ALL', classification: cls.classification, drift: cls.rows.filter(function (r) { return r.state === 'DRIFT'; }).slice(0, 6) };

  // live child FK → live parent PK
  var fkOk = true, fkBad = [];
  demoRows('shipping_plan_lines').forEach(function (r) { if (!plans[DEMO4A_str_(r.shipping_plan_id)]) { fkOk = false; fkBad.push('spl→plan:' + r.shipping_plan_id); } });
  demoRows('shipments').forEach(function (r) { if (!plans[DEMO4A_str_(r.shipping_plan_id)]) { fkOk = false; fkBad.push('ship→plan:' + r.shipping_plan_id); } });
  demoRows('shipment_lines').forEach(function (r) { if (!sp[DEMO4A_str_(r.shipment_id)]) { fkOk = false; fkBad.push('sl→ship:' + r.shipment_id); } if (DEMO4A_str_(r.shipping_plan_line_id) && !spl[DEMO4A_str_(r.shipping_plan_line_id)]) { fkOk = false; fkBad.push('sl→spl:' + r.shipping_plan_line_id); } });
  demoRows('shipment_routes').forEach(function (r) { if (!sp[DEMO4A_str_(r.shipment_id)]) { fkOk = false; fkBad.push('route→ship:' + r.shipment_id); } });
  demoRows('shipment_events').forEach(function (r) { if (!sp[DEMO4A_str_(r.shipment_id)]) { fkOk = false; fkBad.push('evt→ship:' + r.shipment_id); } if (DEMO4A_str_(r.shipment_route_id) && !routes[DEMO4A_str_(r.shipment_route_id)]) { fkOk = false; fkBad.push('evt→route:' + r.shipment_route_id); } });
  checks.live_fk_chain = { ok: fkOk, bad: fkBad.slice(0, 10) };

  // live shipment_line qty == live linked plan-line approved_qty
  var qtyOk = true, qtyBad = [];
  demoRows('shipment_lines').forEach(function (r) { var pl = spl[DEMO4A_str_(r.shipping_plan_line_id)]; if (!pl) { qtyOk = false; qtyBad.push('no_plan_line:' + r.shipment_line_id); return; } if (DEMO4A_num_(r.shipment_qty) !== DEMO4A_num_(pl.approved_qty)) { qtyOk = false; qtyBad.push(r.shipment_line_id + ':' + DEMO4A_str_(r.shipment_qty) + '≠' + DEMO4A_str_(pl.approved_qty)); } });
  checks.live_line_qty_equals_plan = { ok: qtyOk, bad: qtyBad.slice(0, 10) };

  // live shipment total == sum of live shipment-line qty
  var totOk = true, totBad = []; var sumByShip = {}; demoRows('shipment_lines').forEach(function (r) { var s = DEMO4A_str_(r.shipment_id); sumByShip[s] = (sumByShip[s] || 0) + (DEMO4A_num_(r.shipment_qty) || 0); });
  demoRows('shipments').forEach(function (s) { var id = DEMO4A_str_(s.shipment_id); if ((DEMO4A_num_(s.shipment_total_qty) || 0) !== (sumByShip[id] || 0)) { totOk = false; totBad.push(id + ':' + DEMO4A_str_(s.shipment_total_qty) + '≠Σ' + (sumByShip[id] || 0)); } });
  checks.live_totals_equal_line_sum = { ok: totOk, bad: totBad.slice(0, 10) };

  // live route lineage + sequence/status + coordinates. V3B(D): lineage (template + node id) required on EVERY row;
  // location_ref_id required only when location_ref_type='logistics_location'; a GEOGRAPHIC row (has a logistics_location
  // ref OR nonblank coords) must carry valid non-(0,0) coords; an ABSTRACT row (no ref, blank coords) is allowed.
  var routeOk = true, routeBad = [], seqByShip = {};
  demoRows('shipment_routes').forEach(function (r) {
    if (!DEMO4A_str_(r.route_template_id) || !DEMO4A_str_(r.route_template_node_id)) { routeOk = false; routeBad.push('lineage:' + r.shipment_route_id); }
    var hasRef = DEMO4A_low_(r.location_ref_type) === 'logistics_location';
    if (hasRef && !DEMO4A_str_(r.location_ref_id)) { routeOk = false; routeBad.push('ref:' + r.shipment_route_id); }
    if (['completed', 'current', 'planned'].indexOf(DEMO4A_low_(r.status)) === -1) { routeOk = false; routeBad.push('status:' + r.shipment_route_id); }
    var geographic = hasRef || DEMO4A_str_(r.latitude) !== '' || DEMO4A_str_(r.longitude) !== '';
    if (geographic && !DEMO4A_validCoord_(r.latitude, r.longitude)) { routeOk = false; routeBad.push('coord:' + r.shipment_route_id); }
    var s = DEMO4A_str_(r.shipment_id); (seqByShip[s] = seqByShip[s] || []).push(DEMO4A_num_(r.sequence_no));
  });
  Object.keys(seqByShip).forEach(function (s) { var seq = seqByShip[s].slice().sort(function (a, b) { return a - b; }); var seen = {}; seq.forEach(function (n) { if (isNaN(n) || seen[n]) { routeOk = false; routeBad.push('seq:' + s); } seen[n] = 1; }); });
  checks.live_route_lineage_seq_coord = { ok: routeOk, bad: routeBad.slice(0, 10) };

  // live event coordinates + chronology + latest-event agreement + no event on a planned/future node
  var evOk = true, evBad = []; var evByShip = {}, routeStatusById = {};
  demoRows('shipment_routes').forEach(function (r) { routeStatusById[DEMO4A_str_(r.shipment_route_id)] = DEMO4A_low_(r.status); });
  demoRows('shipment_events').forEach(function (e) { if (!DEMO4A_validCoord_(e.latitude, e.longitude)) { evOk = false; evBad.push('coord:' + e.shipment_event_id); } (evByShip[DEMO4A_str_(e.shipment_id)] = evByShip[DEMO4A_str_(e.shipment_id)] || []).push(e); });
  Object.keys(evByShip).forEach(function (sid) {
    var evs = evByShip[sid].slice().sort(function (a, b) { return DEMO4A_num_(a.event_sequence) - DEMO4A_num_(b.event_sequence); });
    for (var i = 1; i < evs.length; i++) if (!(DEMO4A_canonDateTime_(evs[i].event_time) > DEMO4A_canonDateTime_(evs[i - 1].event_time))) { evOk = false; evBad.push('chrono:' + sid); }
    evs.forEach(function (e) { if (routeStatusById[DEMO4A_str_(e.shipment_route_id)] === 'planned') { evOk = false; evBad.push('event_on_planned_node:' + e.shipment_event_id); } });
    var last = evs[evs.length - 1], shp = sp[sid]; if (!last || !shp) return; var st = DEMO4A_low_(shp.status);
    if (st === 'in_transit' && DEMO4A_low_(last.event_status) !== 'current') { evOk = false; evBad.push('in_transit_latest_not_current:' + sid); }
    if (st === 'received' && DEMO4A_low_(last.event_type) !== 'received') { evOk = false; evBad.push('received_latest_not_received:' + sid); }
    if (st === 'shipped' && DEMO4A_low_(last.event_type) !== 'departed_origin') { evOk = false; evBad.push('shipped_latest_not_departed:' + sid); }
  });
  checks.live_event_fk_chrono_agreement = { ok: evOk, bad: evBad.slice(0, 10) };

  // expected UI visibility from LIVE shipment status
  var vis = { shipment_overview: [], shipment_draft: [], on_the_way_map: [] };
  demoRows('shipments').forEach(function (s) { var id = DEMO4A_str_(s.shipment_id), st = s.status; if (DEMO4A_overviewVisible_(st)) vis.shipment_overview.push(id); if (DEMO4A_draftVisible_(st)) vis.shipment_draft.push(id); var evc = (evByShip[id] || []).length, rc = (seqByShip[id] || []).length; if (DEMO4A_mapVisible_(st, evc, rc)) vis.on_the_way_map.push(id); });
  checks.live_ui_visibility = { ok: vis.on_the_way_map.length >= 1, visibility: vis };

  // V3C — Demo-bound coordinates equal the logistics_locations authority (needs masters); abstract rows stay blank; the
  // primary in-transit shipment's origin/current/destination coordinates are distinct; event coord = its route-row coord.
  var locById = masters ? DEMO4A_indexLocations_(masters.locations) : null;
  function ck(lat, lng) { return DEMO4A_num_(lat).toFixed(5) + ',' + DEMO4A_num_(lng).toFixed(5); }
  var boundOk = true, boundBad = [], absOk = true;
  demoRows('shipment_routes').forEach(function (r) {
    var hasRef = DEMO4A_low_(r.location_ref_type) === 'logistics_location' && DEMO4A_str_(r.location_ref_id) !== '';
    var hasCoord = DEMO4A_str_(r.latitude) !== '' || DEMO4A_str_(r.longitude) !== '';
    if (!hasRef && !hasCoord) return;   // abstract row — nothing bound (fine)
    if (hasRef && locById) { var loc = locById[DEMO4A_str_(r.location_ref_id)]; if (!loc || !DEMO4A_validCoord_(loc.latitude, loc.longitude)) { boundOk = false; boundBad.push('missing_master_loc:' + r.shipment_route_id); } else if (ck(loc.latitude, loc.longitude) !== ck(r.latitude, r.longitude)) { boundOk = false; boundBad.push('coord≠master:' + r.shipment_route_id); } }
  });
  checks.live_bound_coord_equals_master = { ok: boundOk, checked: !!locById, bad: boundBad.slice(0, 10) };
  // abstract rows (blank ref + blank coord) explicitly carry NO coordinate
  demoRows('shipment_routes').forEach(function (r) { var hasRef = DEMO4A_low_(r.location_ref_type) === 'logistics_location' && DEMO4A_str_(r.location_ref_id) !== ''; if (!hasRef && (DEMO4A_str_(r.latitude) !== '' || DEMO4A_str_(r.longitude) !== '') && !DEMO4A_validCoord_(r.latitude, r.longitude)) absOk = false; });
  checks.abstract_rows_blank = { ok: absOk };
  // event coord equals its referenced route-row coord (no invented event coordinate)
  var evCoordOk = true, evCoordBad = [];
  demoRows('shipment_events').forEach(function (e) { var r = routes[DEMO4A_str_(e.shipment_route_id)]; if (r && (DEMO4A_str_(r.latitude) !== '' || DEMO4A_str_(r.longitude) !== '') && ck(r.latitude, r.longitude) !== ck(e.latitude, e.longitude)) { evCoordOk = false; evCoordBad.push('evt≠route:' + e.shipment_event_id); } });
  checks.live_event_coord_equals_route = { ok: evCoordOk, bad: evCoordBad.slice(0, 10) };
  // primary in-transit origin/current/destination distinct
  var distinctOk = true, distinctChecked = false;
  demoRows('shipments').forEach(function (s) {
    if (DEMO4A_low_(s.status) !== 'in_transit') return;
    var rr = demoRows('shipment_routes').filter(function (r) { return DEMO4A_str_(r.shipment_id) === DEMO4A_str_(s.shipment_id); }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); });
    var geo = rr.filter(function (r) { return DEMO4A_validCoord_(r.latitude, r.longitude); });
    var cur = rr.filter(function (r) { return DEMO4A_low_(r.status) === 'current' && DEMO4A_validCoord_(r.latitude, r.longitude); })[0];
    if (geo.length < 2 || !cur) { distinctOk = false; return; }
    distinctChecked = true;
    var keys = [ck(geo[0].latitude, geo[0].longitude), ck(cur.latitude, cur.longitude), ck(geo[geo.length - 1].latitude, geo[geo.length - 1].longitude)];
    var uniq = {}; keys.forEach(function (k) { uniq[k] = 1; }); if (Object.keys(uniq).length !== 3) distinctOk = false;
  });
  checks.primary_in_transit_anchors_distinct = { ok: distinctOk, checked: distinctChecked };

  // G (V3D) — LIVE route-geography semantics: (a) a bound location_type must be role/transport-compatible (a sea/truck
  // final destination is NEVER an airport); (b) a current marker's node_type must be transit-compatible; (c) the current
  // marker's country must lie in the shipment's own corridor (origin/destination + explicit abstract node countries) —
  // never an unrelated third country. location_type is read from the logistics_locations authority (masters), never a name.
  var locTypeById = {};
  if (masters) (masters.locations || []).forEach(function (l) { var id = DEMO4A_locId_(l); if (id) locTypeById[id] = DEMO4A_canonLocType_(DEMO4A_locType_(l)); });
  var geoOk = true, geoBad = [], corrOk = true, corrBad = [];
  demoRows('shipments').forEach(function (s) {
    var sid = DEMO4A_str_(s.shipment_id), tclass = DEMO4A_transportClass_(s.shipping_method);
    var rr = demoRows('shipment_routes').filter(function (r) { return DEMO4A_str_(r.shipment_id) === sid; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); });
    if (!rr.length) return;
    var geoRows = rr.filter(function (r) { return DEMO4A_low_(r.location_ref_type) === 'logistics_location' && DEMO4A_str_(r.location_ref_id) !== ''; });
    // corridor = origin + destination geo-row countries ∪ explicit ABSTRACT (unbound) node countries; NOT the current row itself
    var corridor = {};
    if (geoRows.length) { [geoRows[0], geoRows[geoRows.length - 1]].forEach(function (r) { var c = DEMO4A_low_(DEMO4A_str_(r.country)); if (c) corridor[c] = 1; }); }
    rr.forEach(function (r) { var bound = DEMO4A_low_(r.location_ref_type) === 'logistics_location' && DEMO4A_str_(r.location_ref_id) !== ''; if (!bound) { var c = DEMO4A_low_(DEMO4A_str_(r.country)); if (c) corridor[c] = 1; } });
    geoRows.forEach(function (r, i) {
      var role = (i === 0) ? 'origin' : (i === geoRows.length - 1 ? 'destination' : 'current');
      var ct = locTypeById.hasOwnProperty(DEMO4A_str_(r.location_ref_id)) ? locTypeById[DEMO4A_str_(r.location_ref_id)] : DEMO4A_canonLocType_('');
      if (role === 'destination' && ct === 'airport' && tclass !== 'air') { geoOk = false; geoBad.push('sea_truck_dest_airport:' + r.shipment_route_id); }
      if (DEMO4A_typeRoleCompat_(ct, tclass, role) === 'incompatible') { geoOk = false; geoBad.push('type_role_conflict:' + r.shipment_route_id + ':' + ct + '/' + role); }
    });
    var curRow = rr.filter(function (r) { return DEMO4A_low_(r.status) === 'current'; })[0];
    if (curRow) {
      if (DEMO4A_nodeRoleCompat_(curRow.node_type, 'current') === 'incompatible') { geoOk = false; geoBad.push('current_node_type_incompatible:' + curRow.shipment_route_id); }
      var cc = DEMO4A_low_(DEMO4A_str_(curRow.country));
      if (cc && !corridor[cc]) { corrOk = false; corrBad.push('unrelated_third_country:' + curRow.shipment_route_id + ':' + cc); }
    }
  });
  checks.live_bound_type_role_compatible = { ok: geoOk, checked: !!masters, bad: geoBad.slice(0, 10) };
  checks.live_no_unrelated_third_country = { ok: corrOk, bad: corrBad.slice(0, 10) };

  var allOk = Object.keys(checks).every(function (k) { return checks[k].ok; });
  return { checks: checks, classification: cls.classification, demo_seed_validated: (cls.classification === 'PRESENT_EXACT_ALL' && allOk) };
}

// ================================================================================================================
// H — inserted-only reverse-FK rollback plan (pure): given the ids THIS execution inserted, target only those, reverse FK.
// ================================================================================================================
function DEMO4A_rollbackPlan_(insertedIds) { return DEMO4A_CLEAR_ORDER_.map(function (t) { return { table: t, ids: (insertedIds[t] || []).slice() }; }).filter(function (x) { return x.ids.length; }); }
function DEMO4A_anyInserted_(insertedIds) { return DEMO4A_WRITE_ORDER_.some(function (t) { return ((insertedIds || {})[t] || []).length > 0; }); }

// ================================================================================================================
// B — durable seed journal. Canonical fixed field order + a journal_integrity_checksum. Written once before the first
// business-table write, then FULLY read back and validated byte-equivalent (checksum-only readback is insufficient).
// ================================================================================================================
function DEMO4A_journalCanonical_(j) {
  var parts = [];
  parts.push('version=' + DEMO4A_str_(j.version));
  parts.push('plan_checksum=' + DEMO4A_str_(j.plan_checksum));
  parts.push('absent_all_proof=' + (j.absent_all_proof === true ? 'true' : 'false'));
  DEMO4A_WRITE_ORDER_.forEach(function (t) { parts.push('ids[' + t + ']=' + (((j.intended_ids || {})[t]) || []).map(DEMO4A_str_).join(',')); });
  var sc = j.scope || {}; parts.push('scope=' + DEMO4A_str_(sc.company) + '|' + DEMO4A_str_(sc.country) + '|' + DEMO4A_str_(sc.marketplace));
  parts.push('created_marker=' + DEMO4A_str_(j.created_marker));
  return parts.join('\n');
}
function DEMO4A_buildJournal_(plan) {
  var j = { version: 'V3A', plan_checksum: plan.checksum, absent_all_proof: true, intended_ids: DEMO4A_allIds_(plan),
    scope: { company: plan.scope.company, country: plan.scope.country, marketplace: plan.scope.marketplace }, created_marker: DEMO4A_SOURCE_ + ':' + DEMO4A_CREATED_AT_ };
  j.journal_integrity_checksum = DEMO4A_hash_(DEMO4A_journalCanonical_(j));
  return j;
}
// validate a read-back journal against the one we intended to write: byte-equivalent canonical content + recomputed
// integrity checksum + matching plan checksum. Returns { ok, reason }.
function DEMO4A_verifyJournal_(stored, expected) {
  if (!stored) return { ok: false, reason: 'JOURNAL_ABSENT' };
  var canonExp = DEMO4A_journalCanonical_(expected), canonGot = DEMO4A_journalCanonical_(stored);
  if (canonGot !== canonExp) return { ok: false, reason: 'JOURNAL_CANONICAL_MISMATCH' };
  if (DEMO4A_str_(stored.journal_integrity_checksum) !== DEMO4A_hash_(canonGot)) return { ok: false, reason: 'JOURNAL_INTEGRITY_MISMATCH' };
  if (DEMO4A_str_(stored.journal_integrity_checksum) !== DEMO4A_str_(expected.journal_integrity_checksum)) return { ok: false, reason: 'JOURNAL_INTEGRITY_CHECKSUM_DIFF' };
  if (DEMO4A_str_(stored.plan_checksum) !== DEMO4A_str_(expected.plan_checksum)) return { ok: false, reason: 'JOURNAL_PLAN_CHECKSUM_MISMATCH' };
  if (stored.absent_all_proof !== true) return { ok: false, reason: 'JOURNAL_ABSENT_ALL_PROOF_MISSING' };
  return { ok: true };
}

// ================================================================================================================
// GAS-FACING I/O (live sheets). Read-only reads via getSheetByName; writes map onto the LIVE header row order.
// ================================================================================================================
function DEMO4A_ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function DEMO4A_readTable_(name) {
  var sh = DEMO4A_ss_().getSheetByName(name); if (!sh) return { present: false, headers: [], rows: [] };
  var data = sh.getDataRange().getValues(); if (!data || !data.length) return { present: true, headers: [], rows: [] };
  var headers = data[0].map(function (h) { return DEMO4A_str_(h); }), rows = [];
  for (var r = 1; r < data.length; r++) { var blank = true, o = {}; for (var c = 0; c < headers.length; c++) { if (!headers[c]) continue; var v = data[r][c]; o[headers[c]] = v; if (DEMO4A_str_(v) !== '') blank = false; } if (!blank) rows.push(o); }
  return { present: true, headers: headers, rows: rows };
}
function DEMO4A_readMasters_() {
  var t = DEMO4A_readTable_('shipment_route_templates'), n = DEMO4A_readTable_('shipment_route_template_nodes'), l = DEMO4A_readTable_('logistics_locations');
  var mk = DEMO4A_readTable_('marketplace_skus'), sd = DEMO4A_readTable_('sku_details');
  var wh = DEMO4A_readTable_('warehouses');   // V3F — business destination authority (READ-ONLY; has NO coordinates)
  return { templates: t.rows, nodes: n.rows, locations: l.rows, marketplaceSkus: mk.rows, skuDetails: sd.rows, warehouses: wh.rows,
    present: { shipment_route_templates: t.present, shipment_route_template_nodes: n.present, logistics_locations: l.present, marketplace_skus: mk.present, sku_details: sd.present, warehouses: wh.present } };
}
function DEMO4A_schemaGate_() {
  var out = { ok: true, tables: {} };
  DEMO4A_WRITE_ORDER_.forEach(function (name) { var t = DEMO4A_readTable_(name); var missing = DEMO4A_REQUIRED_COLS_[name].filter(function (c) { return t.headers.indexOf(c) === -1; }); out.tables[name] = { present: t.present, row_count: t.rows.length, missing_required_columns: missing }; if (!t.present || missing.length) out.ok = false; });
  return out;
}
function DEMO4A_readLive_() { var live = {}; DEMO4A_WRITE_ORDER_.forEach(function (n) { live[n] = DEMO4A_readTable_(n); }); return live; }
function DEMO4A_rowForHeaders_(headers, obj) { return headers.map(function (h) { return (obj[h] == null) ? '' : obj[h]; }); }
// delete rows whose PK ∈ idSet, bottom-up (never touches other rows). Returns deleted count.
function DEMO4A_deleteRowsByPk_(name, idSet) {
  var sh = DEMO4A_ss_().getSheetByName(name); if (!sh) return 0;
  var data = sh.getDataRange().getValues(); if (!data || data.length < 2) return 0;
  var headers = data[0].map(function (h) { return DEMO4A_str_(h); }), pi = headers.indexOf(DEMO4A_PK_OF_[name]); if (pi === -1) return 0;
  var toDel = []; for (var r = 1; r < data.length; r++) if (idSet[DEMO4A_str_(data[r][pi])]) toDel.push(r + 1);
  toDel.sort(function (a, b) { return b - a; }); toDel.forEach(function (rowNum) { sh.deleteRow(rowNum); }); return toDel.length;
}
// H — inserted-only reverse-FK rollback: remove ONLY the ids this execution inserted, flush, verify absent. Never
// touches a pre-existing row. Returns { ok, removed }.
function DEMO4A_rollbackInserted_(inserted) {
  var removed = {};
  DEMO4A_rollbackPlan_(inserted).forEach(function (step) { var set = {}; step.ids.forEach(function (id) { set[DEMO4A_str_(id)] = 1; }); removed[step.table] = DEMO4A_deleteRowsByPk_(step.table, set); });
  SpreadsheetApp.flush();
  var ok = true;
  DEMO4A_WRITE_ORDER_.forEach(function (name) { var pk = DEMO4A_PK_OF_[name], after = DEMO4A_readTable_(name), have = {}; after.rows.forEach(function (x) { have[DEMO4A_str_(x[pk])] = 1; }); (inserted[name] || []).forEach(function (id) { if (have[DEMO4A_str_(id)]) ok = false; }); });
  return { ok: ok, removed: removed };
}
// D — external downstream references to a demo id. PURE core over already-read external tables; the GAS wrapper reads
// each audited tab (skipping absent tabs) and delegates. ANY external row carrying a demo id is an offending reference.
function DEMO4A_externalRefsIn_(tables, planIds) {
  var demoSet = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { (planIds[t] || []).forEach(function (id) { demoSet[DEMO4A_str_(id)] = 1; }); });
  var refs = [];
  Object.keys(DEMO4A_EXTERNAL_REF_).forEach(function (name) {
    var t = tables[name]; if (!t || !t.present) return;
    DEMO4A_EXTERNAL_REF_[name].forEach(function (col) { if ((t.headers || []).indexOf(col) === -1) return; (t.rows || []).forEach(function (r) { if (demoSet[DEMO4A_str_(r[col])]) refs.push(name + '.' + col + '=' + DEMO4A_str_(r[col])); }); });
  });
  return refs;
}
function DEMO4A_externalReferences_(planIds) { var tables = {}; Object.keys(DEMO4A_EXTERNAL_REF_).forEach(function (name) { tables[name] = DEMO4A_readTable_(name); }); return DEMO4A_externalRefsIn_(tables, planIds); }

// ================================================================================================================
// ENTRYPOINT 0 — ROUTE-MASTER RESOLUTION DIAGNOSTIC (strictly read-only; ONE compact log; no node dump)
// ================================================================================================================
function TEMP_DEMO4A_DIAGNOSE_ROUTE_MASTER_RESOLUTION() {
  var out = { tool: 'TEMP_DEMO4A_DIAGNOSE_ROUTE_MASTER_RESOLUTION', mode: 'STRICTLY READ-ONLY (getSheetByName + getValues only)', output_contract: 'ONE_COMPACT_PRIMARY_LOG_ENTRY (counts + fingerprinted examples; never all nodes)' };
  try {
    var masters = DEMO4A_readMasters_();
    out.masters_present = masters.present;
    var d = DEMO4A_diagnoseResolution_(masters.templates, masters.nodes, masters.locations);
    Object.keys(d).forEach(function (k) { out[k] = d[k]; });
    out.verdict = 'DIAGNOSED';
  } catch (e) { out.verdict = 'DIAGNOSE_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES (read-only; no row/cell/property write)';
  Logger.log('DEMO4A_DIAGNOSE_RESOLUTION ' + JSON.stringify(out));
  return out;
}

// ================================================================================================================
// V3E — LIVE LOCATION-TYPE ROLE-CANDIDATE DIAGNOSTIC (strictly read-only; ONE compact log). Exposes, per required role/
// region, the candidate count surviving EACH of the 12 filter stages + the first stage that hits zero; the exact raw
// location_type tokens with their current canonical mapping/compatibility; and the live region authority (region vs
// subdivision/state). It REUSES the frozen V3D selection predicates UNCHANGED (DEMO4A_locActive_/locValid_/locCountry_/
// locRegion_/locType_, canonLocType_, transportClass_, roleCompatibleTypes_, corridorCountries_, nodeRoleCompat_,
// pickAnchor_) and NEVER changes eligibility, binding selection or the compatibility matrix. Never dumps all rows
// (counts + capped fingerprinted examples only). No fuzzy/name matching.
// ================================================================================================================
// canonical §5.2 enum membership (source/spec authority) for the raw-token audit's enum-match column.
var DEMO4A_LOC_TYPE_ENUM_ = { factory: 1, warehouse: 1, fulfillment_center: 1, distribution_center: 1, port: 1, airport: 1, rail_terminal: 1, truck_terminal: 1, border_crossing: 1, customs_facility: 1, transit_hub: 1, parcel_hub: 1, carrier_facility: 1, city_centroid: 1, country_centroid: 1, virtual_transit_point: 1, other: 1 };
function DEMO4A_dxCoordKey_(l) { return DEMO4A_num_(l.latitude).toFixed(5) + ',' + DEMO4A_num_(l.longitude).toFixed(5); }
// RAW `region` column ONLY (NO state/subdivision fallback) — the diagnostic must expose region-vs-state authority truthfully.
function DEMO4A_dxRawRegion_(l) { return DEMO4A_str_(DEMO4A_get_(l, ['region'])); }
function DEMO4A_dxSubdivision_(l) { return DEMO4A_str_(DEMO4A_get_(l, ['subdivision_code', 'state', 'province', 'state_province'])); }
// which of origin/current/destination a canonical type is compatible with, for a transport class (reuses the matrix).
function DEMO4A_dxCompatibleRoles_(canonType, tclass) { return ['origin', 'current', 'destination'].filter(function (r) { return DEMO4A_typeRoleCompat_(canonType, tclass, r) === 'compatible'; }); }
// per-role CUMULATIVE filter-stage counts. Uses the frozen selection predicates only; adds NO permissiveness. region is
// filtered only when opts.region is supplied (destination); corridor only when opts.corridor supplied (current marker);
// distinct only when opts.excludeCoords supplied. node_role is a TEMPLATE-NODE property (reported in F) so it is a
// pass-through at the location level here.
function DEMO4A_dxRoleStages_(locations, opts) {
  opts = opts || {};
  var role = opts.role, tclass = opts.tclass || 'sea';
  var compat = DEMO4A_roleCompatibleTypes_(tclass, role);
  var union = {}; ['origin', 'current', 'destination'].forEach(function (r) { DEMO4A_roleCompatibleTypes_(tclass, r).forEach(function (t) { union[t] = 1; }); });
  var c = { total: 0, active: 0, valid_coordinate: 0, country_exact: 0, region_exact: 0, raw_type_recognized: 0, canonical_type_resolved: 0, transport_compatible: 0, role_compatible: 0, node_role_compatible: 0, corridor_compatible: 0, distinct_candidate: 0 };
  var reasons = {}; function rej(k) { reasons[k] = (reasons[k] || 0) + 1; }
  (locations || []).forEach(function (l) {
    c.total++;
    if (!DEMO4A_locActive_(l)) { rej('INACTIVE_OR_RECORD_INVALID'); return; } c.active++;
    if (!DEMO4A_locValid_(l)) { rej('INVALID_COORDINATE'); return; } c.valid_coordinate++;
    if (opts.country && DEMO4A_low_(DEMO4A_locCountry_(l)) !== DEMO4A_low_(opts.country)) { rej('COUNTRY_MISMATCH'); return; } c.country_exact++;
    if (opts.region) { if (DEMO4A_low_(DEMO4A_locRegion_(l)) !== DEMO4A_low_(opts.region)) { rej('REGION_MISMATCH'); return; } } c.region_exact++;
    var raw = DEMO4A_locType_(l); if (raw === '') { rej('RAW_TYPE_BLANK'); return; } c.raw_type_recognized++;
    var canon = DEMO4A_canonLocType_(raw); if (canon === '' || canon === 'UNKNOWN') { rej('CANONICAL_TYPE_UNRESOLVED'); return; } c.canonical_type_resolved++;
    if (!union[canon]) { rej('TRANSPORT_INCOMPATIBLE_TYPE'); return; } c.transport_compatible++;
    if (compat.indexOf(canon) === -1) { rej('NO_ROLE_COMPATIBLE_' + String(role).toUpperCase() + '_LOCATION'); return; } c.role_compatible++;
    c.node_role_compatible++;   // node-role governs the TEMPLATE node (F), not the location → pass-through here
    if (opts.corridor) { if (!opts.corridor[DEMO4A_low_(DEMO4A_locCountry_(l))]) { rej('THIRD_COUNTRY_NOT_IN_ROUTE_CORRIDOR'); return; } } c.corridor_compatible++;
    if (opts.excludeCoords && opts.excludeCoords[DEMO4A_dxCoordKey_(l)]) { rej('NOT_DISTINCT_FROM_ORIGIN_OR_DESTINATION'); return; } c.distinct_candidate++;
  });
  var order = ['total', 'active', 'valid_coordinate', 'country_exact', 'region_exact', 'raw_type_recognized', 'canonical_type_resolved', 'transport_compatible', 'role_compatible', 'node_role_compatible', 'corridor_compatible', 'distinct_candidate'];
  var firstZero = null; for (var i = 0; i < order.length; i++) { if (c[order[i]] === 0) { firstZero = order[i]; break; } }
  return { role: role, country: opts.country || '', region: opts.region || '', transit_type: opts.transit_type || '', last_mile: opts.last_mile || '', counts: c, first_zero_stage: firstZero, rejection_reasons: reasons };
}
// PURE diagnostic core. Returns a COMPACT object (counts + capped examples; NEVER all rows). Read-only — no GAS globals.
function DEMO4A_diagnoseLiveRoleCandidates_(templates, nodes, locations) {
  function s(v) { return DEMO4A_str_(v); } function low(v) { return DEMO4A_low_(v); }
  var activeTpls = (templates || []).filter(function (t) { return DEMO4A_truthy_(t.is_active); });
  var byTpl = DEMO4A_nodesByTemplate_(nodes);
  function nodeCount(t) { return (byTpl[s(t.route_template_id)] || []).length; }
  function richer(a, b) { var na = nodeCount(a), nb = nodeCount(b); if (nb !== na) return nb - na; return s(a.route_template_id) < s(b.route_template_id) ? -1 : 1; }
  function richest(region) { var pool = activeTpls.filter(function (t) { return DEMO4A_regionOf_(t) === region; }); pool.sort(richer); return pool[0] || null; }
  var cand = { US_WEST: richest('US_WEST'), US_CENTRAL: richest('US_CENTRAL'), US_EAST: richest('US_EAST') };
  var primary = activeTpls.slice().sort(richer)[0] || null;
  var primaryClass = primary ? DEMO4A_transportClass_(primary.transit_type) : 'sea';

  // ---- B — live location distribution (active + valid-coordinate), scoped to CN + US regions; OTHER as aggregate ----
  var distribution = { by_scope: {}, verification_status_counts: {}, record_status_counts: {}, other_aggregate: 0, active_valid_total: 0 };
  function bumpObj(o, k) { o[k] = (o[k] || 0) + 1; }
  (locations || []).forEach(function (l) {
    if (!DEMO4A_locActive_(l) || !DEMO4A_locValid_(l)) return;
    distribution.active_valid_total++;
    var co = low(DEMO4A_locCountry_(l)), raw = DEMO4A_locType_(l), canon = DEMO4A_canonLocType_(raw);
    bumpObj(distribution.verification_status_counts, s(DEMO4A_get_(l, ['verification_status'])) || '(blank)');
    bumpObj(distribution.record_status_counts, s(DEMO4A_get_(l, ['record_status', 'row_status'])) || '(blank)');
    var scope;
    if (co === 'cn') scope = 'CN';
    else if (co === 'us') scope = 'US | ' + (DEMO4A_dxRawRegion_(l) || '(blank-region)');
    else { distribution.other_aggregate++; return; }
    distribution.by_scope[scope] = distribution.by_scope[scope] || {};
    bumpObj(distribution.by_scope[scope], (raw || '(blank)') + ' -> ' + (canon || '(blank)'));
  });

  // ---- D — exact raw location_type token audit (CN/US only; ≤3 example fingerprints; NO fuzzy matching) ----
  var tokenAgg = {};
  (locations || []).forEach(function (l) {
    var co = low(DEMO4A_locCountry_(l)); if (co !== 'cn' && co !== 'us') return;
    if (!DEMO4A_locActive_(l) || !DEMO4A_locValid_(l)) return;
    var raw = DEMO4A_locType_(l) || '(blank)';
    var e = tokenAgg[raw] || (tokenAgg[raw] = { raw_token: raw, count: 0, examples: [] });
    e.count++; if (e.examples.length < 3) e.examples.push(DEMO4A_hash_(DEMO4A_locId_(l)));
  });
  var rawTokenAudit = Object.keys(tokenAgg).sort().map(function (raw) {
    var canon = DEMO4A_canonLocType_(raw === '(blank)' ? '' : raw);
    var recognized = canon !== '' && canon !== 'UNKNOWN';
    return { raw_token: raw, count: tokenAgg[raw].count, canonical_mapping: canon, recognized: recognized,
      compatible_roles_sea: recognized ? DEMO4A_dxCompatibleRoles_(canon, 'sea') : [], compatible_roles_truck: recognized ? DEMO4A_dxCompatibleRoles_(canon, 'truck') : [],
      source_spec_enum_match: recognized && DEMO4A_LOC_TYPE_ENUM_.hasOwnProperty(canon), example_id_fingerprints: tokenAgg[raw].examples };
  });

  // ---- E — US region authority audit (raw region vs subdivision/state; NO silent fallback) ----
  var regionRaw = {}, subdivision = {}, effectiveRegion = {}, usActiveValid = 0, regionBlankButSubdivision = 0;
  var WCE = { us_west: 1, us_central: 1, us_east: 1 };
  (locations || []).forEach(function (l) {
    if (low(DEMO4A_locCountry_(l)) !== 'us' || !DEMO4A_locActive_(l) || !DEMO4A_locValid_(l)) return;
    usActiveValid++;
    var rr = DEMO4A_dxRawRegion_(l), sub = DEMO4A_dxSubdivision_(l), eff = DEMO4A_locRegion_(l);
    bumpObj(regionRaw, rr || '(blank)'); bumpObj(subdivision, sub || '(blank)'); bumpObj(effectiveRegion, eff || '(blank)');
    if (rr === '' && sub !== '') regionBlankButSubdivision++;
  });
  var usesWce = Object.keys(regionRaw).some(function (k) { return WCE[low(k)]; });
  var regionAudit = { us_active_valid: usActiveValid, region_raw_counts: regionRaw, subdivision_counts: subdivision, effective_region_counts: effectiveRegion,
    region_blank_but_subdivision_present: regionBlankButSubdivision, uses_us_west_central_east_tokens: usesWce };

  // ---- C — per-role filter-stage counts for the required roles ----
  var originCountry = primary ? s(primary.origin_country) : 'CN';
  var origin = DEMO4A_dxRoleStages_(locations, { role: 'origin', country: originCountry, tclass: primaryClass, transit_type: primary ? s(primary.transit_type) : '', last_mile: primary ? s(primary.last_mile_delivery) : '' });
  var destRoles = ['US_WEST', 'US_CENTRAL', 'US_EAST'].map(function (rg) {
    var t = cand[rg]; if (!t) return { role: 'destination', region_bucket: rg, missing_template: true };
    var st = DEMO4A_dxRoleStages_(locations, { role: 'destination', country: s(t.destination_country), region: s(t.destination_region), tclass: DEMO4A_transportClass_(t.transit_type), transit_type: s(t.transit_type), last_mile: s(t.last_mile_delivery) });
    st.region_bucket = rg; st.template_fp = DEMO4A_hash_(s(t.route_template_id)); return st;
  });
  // current marker: corridor + distinct-from deterministically-picked origin/destination of the primary template
  var currentStage = null;
  if (primary) {
    var resolvedPrimary = (byTpl[s(primary.route_template_id)] || []).map(function (n) { return { node: n }; });
    var corridor = DEMO4A_corridorCountries_(primary, resolvedPrimary);
    var oPick = DEMO4A_pickAnchor_(locations, { country: s(primary.origin_country), role: 'origin', tclass: primaryClass });
    var dPick = DEMO4A_pickAnchor_(locations, { country: s(primary.destination_country), region: s(primary.destination_region), role: 'destination', tclass: primaryClass });
    var exclude = {}; if (oPick) exclude[DEMO4A_dxCoordKey_(oPick.loc)] = 1; if (dPick) exclude[DEMO4A_dxCoordKey_(dPick.loc)] = 1;
    currentStage = DEMO4A_dxRoleStages_(locations, { role: 'current', tclass: primaryClass, corridor: corridor, excludeCoords: exclude, transit_type: s(primary.transit_type), last_mile: s(primary.last_mile_delivery) });
    currentStage.corridor_countries = Object.keys(corridor);
  }

  // ---- F — selected/candidate template evidence (fingerprints only; no master dump) ----
  function tplEvidence(t) {
    if (!t) return null;
    var ns = byTpl[s(t.route_template_id)] || [], tclass = DEMO4A_transportClass_(t.transit_type);
    var eligibleCurrentNodeTypes = {};
    for (var i = 1; i <= ns.length - 2; i++) { if (DEMO4A_nodeRoleCompat_(s(ns[i].node_type), 'current') !== 'incompatible') eligibleCurrentNodeTypes[low(ns[i].node_type) || '(blank)'] = 1; }
    var oSt = DEMO4A_dxRoleStages_(locations, { role: 'origin', country: s(t.origin_country), tclass: tclass });
    var dSt = DEMO4A_dxRoleStages_(locations, { role: 'destination', country: s(t.destination_country), region: s(t.destination_region), tclass: tclass });
    var resolved = ns.map(function (n) { return { node: n }; });
    var cSt = DEMO4A_dxRoleStages_(locations, { role: 'current', tclass: tclass, corridor: DEMO4A_corridorCountries_(t, resolved) });
    return { template_fp: DEMO4A_hash_(s(t.route_template_id)), region_bucket: DEMO4A_regionOf_(t), transit_type: s(t.transit_type), last_mile_delivery: s(t.last_mile_delivery),
      origin_country: s(t.origin_country), destination_country: s(t.destination_country), destination_region: s(t.destination_region),
      first_node_type: ns.length ? (low(ns[0].node_type) || '(blank)') : '(none)', last_node_type: ns.length ? (low(ns[ns.length - 1].node_type) || '(blank)') : '(none)',
      eligible_current_node_types: Object.keys(eligibleCurrentNodeTypes), node_count: ns.length,
      origin_candidate_count: oSt.counts.role_compatible, destination_candidate_count: dSt.counts.role_compatible, current_candidate_count: cSt.counts.role_compatible,
      origin_first_zero_stage: oSt.first_zero_stage, destination_first_zero_stage: dSt.first_zero_stage, current_first_zero_stage: cSt.first_zero_stage };
  }
  var selectedTemplates = [tplEvidence(cand.US_WEST), tplEvidence(cand.US_CENTRAL), tplEvidence(cand.US_EAST)].filter(Boolean);

  // ---- G — verdict (precedence: region-authority > no-rows > type-authority > ready) ----
  var destSurvived = destRoles.filter(function (d) { return !d.missing_template; });
  var anyDestCountry = destSurvived.some(function (d) { return d.counts && d.counts.country_exact > 0; });
  var anyDestRegion = destSurvived.some(function (d) { return d.counts && d.counts.region_exact > 0; });
  var anyDestRole = destSurvived.some(function (d) { return d.counts && d.counts.role_compatible > 0; });
  var anyDestRawType = destSurvived.some(function (d) { return d.counts && d.counts.raw_type_recognized > 0; });
  var verdict;
  if (!anyDestCountry && origin.counts.country_exact === 0) verdict = 'NO_VALID_DESTINATION_MASTER_ROWS';
  else if (origin.counts.country_exact === 0) verdict = 'NO_VALID_ORIGIN_MASTER_ROWS';
  else if (!anyDestCountry) verdict = 'NO_VALID_DESTINATION_MASTER_ROWS';
  else if (anyDestCountry && !anyDestRegion && (regionAudit.region_blank_but_subdivision_present > 0 || !regionAudit.uses_us_west_central_east_tokens)) verdict = 'LIVE_REGION_AUTHORITY_MISMATCH';
  else if (anyDestRawType && !anyDestRole) verdict = 'LOCATION_TYPE_AUTHORITY_UNRESOLVED';
  else if (origin.counts.role_compatible > 0 && anyDestRole) verdict = 'LIVE_LOCATION_TYPES_READY_FOR_MATRIX_ALIGNMENT';
  else verdict = 'LOCATION_TYPE_AUTHORITY_UNRESOLVED';

  return {
    active_template_count: activeTpls.length, location_count: (locations || []).length,
    required_scope: ['CN', 'US/US_WEST', 'US/US_CENTRAL', 'US/US_EAST', 'OTHER(aggregate)'],
    location_distribution: distribution,
    filter_stage_counts: { origin_cn: origin, destination_by_region: destRoles, primary_in_transit_current: currentStage },
    raw_type_token_audit: rawTokenAudit,
    region_authority_audit: regionAudit,
    selected_template_evidence: selectedTemplates,
    verdict: verdict
  };
}
function TEMP_DEMO4A_DIAGNOSE_LIVE_LOCATION_ROLE_CANDIDATES() {
  var out = { tool: 'TEMP_DEMO4A_DIAGNOSE_LIVE_LOCATION_ROLE_CANDIDATES', mode: 'STRICTLY READ-ONLY (getSheetByName + getValues only)', output_contract: 'ONE_COMPACT_PRIMARY_LOG_ENTRY (per-stage counts + capped fingerprinted examples; NEVER all rows)' };
  try {
    var masters = DEMO4A_readMasters_();
    out.masters_present = masters.present;
    var d = DEMO4A_diagnoseLiveRoleCandidates_(masters.templates, masters.nodes, masters.locations);
    Object.keys(d).forEach(function (k) { out[k] = d[k]; });
    out.confirmation_constant_status = (DEMO4A_CONFIRMED_SEED_CHECKSUM_ === 'PASTE_DEMO_SEED_CHECKSUM_HERE') ? 'PLACEHOLDER' : 'SET';
  } catch (e) { out.verdict = 'DIAGNOSE_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES';
  Logger.log('DEMO4A_DIAGNOSE_LIVE_ROLE_CANDIDATES ' + JSON.stringify(out));
  return out;
}

// ================================================================================================================
// V3F — WAREHOUSE ↔ LOGISTICS-LOCATION DESTINATION AUTHORITY (source-proven join; read-only). `warehouses` is the
// BUSINESS destination authority (warehouse_id/company/country/logistics_region/warehouse_type/marketplace/is_active) and
// carries NO coordinates; `logistics_locations` is the MAP/coordinate authority. EXACT bridge (no fuzzy/name/city/address
// matching): logistics_locations.warehouse_id === warehouses.warehouse_id — source-proven in production
// (33_party_authority_handlers.gs:107 backend resolver, fail-closed DESTINATION_LOCATION_AMBIGUOUS on >1; frontend
// global-logistics-map.js:182/:267). There is NO warehouse-coordinate fallback and NO runtime geocoding (audited); the
// frontend rejects blank/(0,0)/out-of-range coords. Therefore a blank-coordinate FBA is IDENTITY-ready + COORDINATE-
// pending — never coordinate-fabricated, never plotted as a facility marker, never emits a received event at the FBA.
// ================================================================================================================
var DEMO4A_WH_DEST_TYPES_ = { fba: 1, '3pl': 1, warehouse: 1, distribution_center: 1, fulfillment_center: 1, dc: 1 };   // destination-compatible warehouse_type tokens (RETURN/FACTORY excluded)
function DEMO4A_whId_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['warehouse_id'])); }
function DEMO4A_whType_(w) { return DEMO4A_low_(DEMO4A_get_(w, ['warehouse_type', 'type'])); }
function DEMO4A_whCompany_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['company'])); }
function DEMO4A_whCountry_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['country', 'country_code'])); }
function DEMO4A_whRegion_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['logistics_region', 'region'])); }
function DEMO4A_whMarketplace_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['marketplace'])); }
function DEMO4A_whActive_(w) { return DEMO4A_activeFlag_(w) !== false; }
function DEMO4A_whDestTypeCompatible_(w) { return DEMO4A_WH_DEST_TYPES_.hasOwnProperty(DEMO4A_whType_(w)); }
// logistics-location identity/coordinate eligibility: verification_status NOT retired/rejected (33_:61-66) AND is_active
// not explicitly false. (There is NO record_status column — lifecycle is verification_status + is_active.)
function DEMO4A_locVerificationEligible_(loc) {
  if (!DEMO4A_locActive_(loc)) return false;
  var vs = DEMO4A_low_(DEMO4A_get_(loc, ['verification_status']));
  return vs !== 'retired' && vs !== 'rejected';
}
// EXACT bridge: every ELIGIBLE logistics row whose warehouse_id === wid (NO fuzzy/name/city matching).
function DEMO4A_locsForWarehouse_(locations, wid) {
  var w = DEMO4A_low_(DEMO4A_str_(wid)); if (w === '') return [];
  return (locations || []).filter(function (l) { return DEMO4A_locVerificationEligible_(l) && DEMO4A_low_(DEMO4A_str_(DEMO4A_get_(l, ['warehouse_id']))) === w; });
}
// TYPED coordinate-branch resolver for a destination warehouse business identity. Branch 2
// (PRODUCTION_WAREHOUSE_COORDINATE_FALLBACK) is NOT source-proven (warehouses hold no coords) → NEVER selected.
function DEMO4A_resolveWarehouseDestination_(warehouseRow, locations) {
  if (!warehouseRow) return { branch: 'WAREHOUSE_LOCATION_JOIN_MISSING', reason: 'NO_DESTINATION_WAREHOUSE_IDENTITY', renderable: false, received_allowed: false };
  var wid = DEMO4A_whId_(warehouseRow);
  var joined = DEMO4A_locsForWarehouse_(locations, wid);
  if (!joined.length) return { branch: 'WAREHOUSE_LOCATION_JOIN_MISSING', warehouse_id: wid, reason: 'NO_ELIGIBLE_LOGISTICS_ROW_FOR_WAREHOUSE_ID', renderable: false, received_allowed: false };
  if (joined.length > 1) return { branch: 'WAREHOUSE_LOCATION_JOIN_CONFLICT', warehouse_id: wid, candidate_count: joined.length, candidate_fps: joined.slice(0, 5).map(function (l) { return DEMO4A_hash_(DEMO4A_locId_(l)); }), renderable: false, received_allowed: false };
  var loc = joined[0];
  var base = { warehouse_id: wid, logistics_location_id: DEMO4A_locId_(loc), location_type: DEMO4A_canonLocType_(DEMO4A_locType_(loc)),
    country: DEMO4A_locCountry_(loc), region: DEMO4A_locRegion_(loc), verification_status: DEMO4A_str_(DEMO4A_get_(loc, ['verification_status'])), join_key: wid, location: loc };
  if (DEMO4A_locValid_(loc)) { base.branch = 'WAREHOUSE_LOCATION_COORDINATE_READY'; base.latitude = DEMO4A_num_(loc.latitude); base.longitude = DEMO4A_num_(loc.longitude); base.coordinate_source = 'logistics_location'; base.renderable = true; base.received_allowed = true; return base; }
  base.branch = 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING'; base.reason = 'DESTINATION_WAREHOUSE_COORDINATE_PENDING'; base.renderable = false; base.received_allowed = false; return base;   // identity kept; NEVER borrow a gateway coordinate, NEVER received-at-FBA
}
// region bucket for a US warehouse/location (reuses the frozen classifier vocabulary; blank → OTHER).
function DEMO4A_dxRegionBucket_(region) { var h = DEMO4A_low_(region); if (/west/.test(h)) return 'US_WEST'; if (/central/.test(h)) return 'US_CENTRAL'; if (/east/.test(h)) return 'US_EAST'; return 'OTHER'; }
// PURE diagnostic core for warehouse↔location authority. Read-only; COMPACT (counts + ≤5 fingerprints; never all rows).
function DEMO4A_diagnoseWarehouseLocationAuthority_(warehouses, locations) {
  function s(v) { return DEMO4A_str_(v); } function low(v) { return DEMO4A_low_(v); }
  var whHeaders = (warehouses && warehouses[0]) ? Object.keys(warehouses[0]) : [];
  var locHeaders = (locations && locations[0]) ? Object.keys(locations[0]) : [];
  var whHasWarehouseId = whHeaders.map(function (h) { return low(h); }).indexOf('warehouse_id') !== -1;
  var locHasWarehouseId = locHeaders.map(function (h) { return low(h); }).indexOf('warehouse_id') !== -1;
  // warehouse coordinate fields found (expected: NONE) — audited: warehouses carry no coordinate.
  var whCoordFields = whHeaders.filter(function (h) { return /^(lat|latitude|lon|lng|longitude|coordinate)/.test(low(h)); });
  if (!warehouses || !warehouses.length || !whHasWarehouseId || !locHasWarehouseId) {
    return { verdict: 'WAREHOUSE_SCHEMA_AUTHORITY_UNRESOLVED', warehouses_headers: whHeaders, logistics_locations_headers: locHeaders,
      warehouse_coordinate_fields_found: whCoordFields, warehouses_present: !!(warehouses && warehouses.length), warehouse_id_column_present: whHasWarehouseId, logistics_warehouse_id_column_present: locHasWarehouseId,
      production_map_warehouse_coordinate_fallback_source_proven: false };
  }
  // active destination-compatible warehouses + per-dimension counts + per-warehouse branch.
  var byCompany = {}, byCountry = {}, byRegion = {}, byType = {}, byMarketplace = {};
  var branchCounts = { WAREHOUSE_LOCATION_COORDINATE_READY: 0, WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING: 0, WAREHOUSE_LOCATION_JOIN_MISSING: 0, WAREHOUSE_LOCATION_JOIN_CONFLICT: 0 };
  var joinedFbaByRegion = { US_WEST: 0, US_CENTRAL: 0, US_EAST: 0, OTHER: 0 };
  var joinedValidCoord = 0, joinedBlankCoord = 0, verificationCounts = {}, examples = [];
  var destWh = (warehouses || []).filter(function (w) { return DEMO4A_whActive_(w) && DEMO4A_whDestTypeCompatible_(w); });
  function bump(o, k) { o[k] = (o[k] || 0) + 1; }
  destWh.forEach(function (w) {
    bump(byCompany, s(DEMO4A_whCompany_(w)) || '(blank)'); bump(byCountry, s(DEMO4A_whCountry_(w)) || '(blank)');
    bump(byRegion, s(DEMO4A_whRegion_(w)) || '(blank)'); bump(byType, DEMO4A_whType_(w) || '(blank)'); bump(byMarketplace, s(DEMO4A_whMarketplace_(w)) || '(blank)');
    var r = DEMO4A_resolveWarehouseDestination_(w, locations);
    bump(branchCounts, r.branch);
    if (r.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY' || r.branch === 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING') {
      if (r.location) bump(verificationCounts, low(DEMO4A_get_(r.location, ['verification_status'])) || '(blank)');
      if (r.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY') joinedValidCoord++; else joinedBlankCoord++;
      if (low(DEMO4A_whCountry_(w)) === 'us') joinedFbaByRegion[DEMO4A_dxRegionBucket_(DEMO4A_whRegion_(w))]++;
    }
    if (examples.length < 5) examples.push({ warehouse_fp: DEMO4A_hash_(DEMO4A_whId_(w)), warehouse_type: DEMO4A_whType_(w), country: s(DEMO4A_whCountry_(w)), region: s(DEMO4A_whRegion_(w)), branch: r.branch, location_fp: r.logistics_location_id ? DEMO4A_hash_(r.logistics_location_id) : '', location_type: r.location_type || '', verification_status: r.verification_status || '' });
  });
  var missing = branchCounts.WAREHOUSE_LOCATION_JOIN_MISSING, conflict = branchCounts.WAREHOUSE_LOCATION_JOIN_CONFLICT;
  var ready = branchCounts.WAREHOUSE_LOCATION_COORDINATE_READY, pending = branchCounts.WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING;
  var verdict = destWh.length === 0 ? 'WAREHOUSE_LOCATION_JOIN_MISSING'
    : conflict > 0 ? 'WAREHOUSE_LOCATION_JOIN_CONFLICT'
    : ready > 0 ? 'WAREHOUSE_LOCATION_AUTHORITY_READY'
    : pending > 0 ? 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING'
    : 'WAREHOUSE_LOCATION_JOIN_MISSING';
  return {
    verdict: verdict,
    warehouses_headers: whHeaders, logistics_locations_headers: locHeaders, warehouse_coordinate_fields_found: whCoordFields,
    active_destination_warehouse_count: destWh.length,
    destination_warehouses_by: { company: byCompany, country: byCountry, region: byRegion, warehouse_type: byType, marketplace: byMarketplace },
    warehouse_id_join: { warehouse_rows: (warehouses || []).length, active_destination_warehouses: destWh.length, joined_ok: ready + pending, missing_joins: missing, conflicting_joins: conflict },
    joined_fba_3pl_by_region: joinedFbaByRegion, joined_rows_valid_coordinate: joinedValidCoord, joined_rows_blank_coordinate: joinedBlankCoord,
    verification_status_counts: verificationCounts, record_status_counts: '(no record_status column — lifecycle via verification_status + is_active)',
    branch_counts: branchCounts, production_map_warehouse_coordinate_fallback_source_proven: false,
    safe_examples: examples
  };
}
function TEMP_DEMO4A_DIAGNOSE_WAREHOUSE_LOCATION_AUTHORITY() {
  var out = { tool: 'TEMP_DEMO4A_DIAGNOSE_WAREHOUSE_LOCATION_AUTHORITY', mode: 'STRICTLY READ-ONLY (getSheetByName + getValues only)', output_contract: 'ONE_COMPACT_PRIMARY_LOG_ENTRY (counts + <=5 fingerprints; never all rows)' };
  try {
    var masters = DEMO4A_readMasters_();
    out.masters_present = masters.present;
    var d = DEMO4A_diagnoseWarehouseLocationAuthority_(masters.warehouses, masters.locations);
    Object.keys(d).forEach(function (k) { out[k] = d[k]; });
  } catch (e) { out.verdict = 'WAREHOUSE_SCHEMA_AUTHORITY_UNRESOLVED'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES';
  Logger.log('DEMO4A_DIAGNOSE_WAREHOUSE_LOCATION_AUTHORITY ' + JSON.stringify(out));
  return out;
}

// ================================================================================================================
// ENTRYPOINT 1 — PREFLIGHT (strictly read-only)
// ================================================================================================================
// V3F (G) — PURE warehouse-authority gate summary for PREFLIGHT. Not applicable when the warehouses master is absent
// (legacy logistics-only binding). When applicable, READY requires every destination WAREHOUSE_LOCATION_COORDINATE_READY.
function DEMO4A_warehouseGates_(present, authority, errors) {
  if (!present) return { applicable: false, note: 'warehouses master absent — legacy logistics-only binding (no warehouse authority gate)' };
  var slots = Object.keys(authority || {});
  function every(pred) { return slots.length > 0 && slots.every(function (s) { return pred(authority[s] || {}); }); }
  var identity = every(function (r) { return r.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY' || r.branch === 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING'; });
  var join = every(function (r) { return ['WAREHOUSE_LOCATION_JOIN_MISSING', 'WAREHOUSE_LOCATION_JOIN_CONFLICT', 'WAREHOUSE_IDENTITY_INELIGIBLE', 'WAREHOUSE_IDENTITY_MISMATCH'].indexOf(r.branch) === -1; });
  var coord = every(function (r) { return r.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY'; });
  var render = every(function (r) { return !!r.renderable; });
  var truthful = coord;   // a received/facility marker is emitted ONLY at a coordinate-ready facility (fail-closed guarantees it)
  return { applicable: true, warehouse_business_identity_gate: identity, warehouse_location_join_gate: join, warehouse_coordinate_gate: coord, map_renderability_gate: render, status_truthfulness_gate: truthful, ok: identity && join && coord && render && truthful, errors: errors || [] };
}
function TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED', mode: 'STRICTLY READ-ONLY (no write/create/delete/submit)', output_contract: 'ONE_PRIMARY_LOG_ENTRY' };
  try {
    var schema = DEMO4A_schemaGate_(); out.schema_gate = schema;
    var masters = DEMO4A_readMasters_(); out.masters_present = masters.present;
    out.master_row_counts = { templates: masters.templates.length, template_nodes: masters.nodes.length, logistics_locations: masters.locations.length, marketplace_skus: masters.marketplaceSkus.length, sku_details: masters.skuDetails.length, warehouses: (masters.warehouses || []).length };
    var plan = DEMO4A_buildPlan_(masters);
    if (!plan.ok) {
      out.reason = plan.reason; out.rejection_counts = plan.rejection_counts || null; out.available_regions = plan.available_regions || null; out.detail = plan;
      if (plan.destination_authority) out.warehouse_gates = DEMO4A_warehouseGates_(true, plan.destination_authority, plan.destination_authority_errors || []);
      out.verdict = plan.reason === 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY' ? 'PREFLIGHT_FAILED_WAREHOUSE_AUTHORITY' : (schema.ok ? 'PREFLIGHT_FAILED' : 'PREFLIGHT_FAILED_SCHEMA');
    }
    else {
      out.region_selection_mode = plan.region_selection_mode; out.available_regions = plan.available_regions; out.chosen_templates = plan.chosen_templates;
      out.selected_template_ids = plan.chosen_templates.map(function (c) { return c.route_template_id; }); out.rejection_counts = plan.rejection_counts;
      out.scope = plan.scope; out.planned_counts = plan.counts; out.per_shipment = plan.per_shipment; out.demo_plan_checksum = plan.checksum;
      // E — compact per-shipment route-geography evidence + the hard binding gates. READY is unreachable unless every gate is true.
      out.binding_gates = plan.binding_gates;
      // G — the five separate warehouse gates (business identity / join / coordinate / map renderability / status truthfulness).
      out.warehouse_gates = DEMO4A_warehouseGates_(plan.warehouses_present, plan.destination_authority, null);
      out.route_geography_evidence = plan.per_shipment.map(function (s) { return { shipment_id: s.shipment_id, slot: s.slot, transport_class: s.transport_class, destination_warehouse_id: s.destination_warehouse_id, destination_logistics_location_id: s.destination_logistics_location_id, destination_coordinate_branch: s.destination_coordinate_branch, destination_facility_marker_renderable: s.destination_facility_marker_renderable, origin: s.binding_evidence.origin, current: s.binding_evidence.current, destination: s.binding_evidence.destination }; });
      var cls = DEMO4A_classifyState_(plan, DEMO4A_readLive_());
      out.existing_state = { classification: cls.classification, duplicate_pk_counts: cls.duplicate_pk_counts, unexpected_demo_ids: cls.unexpected_demo_ids };
      out.verdict = !schema.ok ? 'PREFLIGHT_FAILED_SCHEMA'
        : !(plan.binding_gates && plan.binding_gates.ok) ? 'PREFLIGHT_FAILED_BINDING_GATES'
        : (out.warehouse_gates.applicable && !out.warehouse_gates.ok) ? 'PREFLIGHT_FAILED_WAREHOUSE_AUTHORITY'
        : cls.classification === 'ABSENT_ALL' ? 'READY_FOR_DEMO_SEED'
        : cls.classification === 'PRESENT_EXACT_ALL' ? 'ALREADY_SEEDED_EXACT'
        : ('BLOCKED_' + cls.classification);
    }
  } catch (e) { out.verdict = 'PREFLIGHT_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES (read-only: getSheetByName + getValues only; no row/cell/property/flag writes)';
  Logger.log('DEMO4A_PREFLIGHT ' + JSON.stringify(out, null, 2)); return out;
}

// ================================================================================================================
// ENTRYPOINT 2 — DRY_RUN (strictly read-only; full plan + dynamic counts + demo_plan_checksum)
// ================================================================================================================
function TEMP_DEMO4A_DRY_RUN_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_DRY_RUN_SHIPPING_SHIPMENT_MAP_SEED', mode: 'STRICTLY READ-ONLY (no write)', output_contract: 'ONE_PRIMARY_LOG_ENTRY' };
  try {
    var plan = DEMO4A_buildPlan_(DEMO4A_readMasters_());
    if (!plan.ok) { out.verdict = 'DRY_RUN_BLOCKED'; out.reason = plan.reason; out.detail = plan; }
    else {
      out.region_selection_mode = plan.region_selection_mode; out.available_regions = plan.available_regions; out.chosen_templates = plan.chosen_templates;
      out.scope = plan.scope; out.dynamic_row_counts = plan.counts; out.per_shipment_counts = plan.per_shipment; out.planned_ids = DEMO4A_allIds_(plan);
      out.binding_gates = plan.binding_gates;
      out.warehouse_gates = DEMO4A_warehouseGates_(plan.warehouses_present, plan.destination_authority, null);
      // G — per-shipment destination authority + coordinate branch + whether the facility marker will render / gateway separately.
      out.destination_authority = plan.per_shipment.map(function (s) { return { shipping_plan_id: (DEMO4A_PREFIX_ + 'SP-' + s.shipment_id.slice(-1)), shipment_id: s.shipment_id, slot: s.slot, template: s.template, transport_type: s.transport_class, destination_warehouse_id: s.destination_warehouse_id, destination_logistics_location_id: s.destination_logistics_location_id, destination_coordinate_branch: s.destination_coordinate_branch, destination_verification_status: s.destination_verification_status, route_rows: s.route_rows, event_rows: s.event_rows, final_status: s.status, destination_facility_marker_renderable: s.destination_facility_marker_renderable, current_gateway_location_id: s.current_location_id }; });
      out.route_geography_evidence = plan.per_shipment.map(function (s) { return { shipment_id: s.shipment_id, slot: s.slot, transport_class: s.transport_class, origin: s.binding_evidence.origin, current: s.binding_evidence.current, destination: s.binding_evidence.destination }; });
      out.event_chronology = DEMO4A_chronology_(plan); out.route_planned_to_recorded_event_map = plan.route_event_map; out.expected_ui_visibility = plan.visibility;
      out.demo_plan_checksum = plan.checksum; out.confirmation_constant_status = (DEMO4A_CONFIRMED_SEED_CHECKSUM_ === 'PASTE_DEMO_SEED_CHECKSUM_HERE') ? 'PLACEHOLDER' : 'SET';
      out.verdict = 'DRY_RUN_READY';
    }
  } catch (e) { out.verdict = 'DRY_RUN_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES (read-only)';
  Logger.log('DEMO4A_DRY_RUN ' + JSON.stringify(out, null, 2)); return out;
}

// ================================================================================================================
// ENTRYPOINT 3 — COMMIT (gated write; confirmation constant PLACEHOLDER → refuses in this task). Journal + rollback.
// ================================================================================================================
function TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED', mode: 'GATED WRITE (six demo tables only; integrity journal + inserted-only rollback on ANY post-insert failure)', output_contract: 'ONE_PRIMARY_LOG_ENTRY' };
  var lock = null, inserted = null, phase = 'pre_insert';   // A — inserted tracked in OUTER scope so the outer catch can roll back after ANY post-insert exception
  try {
    if (DEMO4A_CONFIRMED_SEED_CHECKSUM_ === 'PASTE_DEMO_SEED_CHECKSUM_HERE' || !DEMO4A_str_(DEMO4A_CONFIRMED_SEED_CHECKSUM_)) { out.verdict = 'COMMIT_REFUSED_CONFIRMATION_REQUIRED'; out.note = 'set DEMO4A_CONFIRMED_SEED_CHECKSUM_ to the DRY_RUN demo_plan_checksum first'; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    var schema = DEMO4A_schemaGate_(); if (!schema.ok) { out.verdict = 'COMMIT_REFUSED_SCHEMA'; out.schema_gate = schema; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    var plan = DEMO4A_buildPlan_(DEMO4A_readMasters_());
    if (!plan.ok) { out.verdict = 'COMMIT_REFUSED_PLAN'; out.reason = plan.reason; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    if (DEMO4A_str_(DEMO4A_CONFIRMED_SEED_CHECKSUM_) !== DEMO4A_str_(plan.checksum)) { out.verdict = 'COMMIT_REFUSED_CHECKSUM_MISMATCH'; out.expected = plan.checksum; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }

    lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) { out.verdict = 'COMMIT_REFUSED_LOCK'; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    var plan2 = DEMO4A_buildPlan_(DEMO4A_readMasters_());
    if (!plan2.ok || DEMO4A_str_(plan2.checksum) !== DEMO4A_str_(DEMO4A_CONFIRMED_SEED_CHECKSUM_)) { out.verdict = 'COMMIT_REFUSED_DRIFT_UNDER_LOCK'; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    // V3D — the hard route-geography gates must hold under lock (a synthetic binding can never be corridor/role-implausible).
    if (!(plan2.binding_gates && plan2.binding_gates.ok)) { out.verdict = 'COMMIT_REFUSED_BINDING_GATES'; out.binding_gates = plan2.binding_gates; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }

    // A — existing-state classification under lock. COMMIT proceeds ONLY for ABSENT_ALL (insert) or PRESENT_EXACT_ALL (reuse).
    var cls = DEMO4A_classifyState_(plan2, DEMO4A_readLive_());
    out.existing_state = { classification: cls.classification, duplicate_pk_counts: cls.duplicate_pk_counts, unexpected_demo_ids: cls.unexpected_demo_ids, drift: cls.rows.filter(function (r) { return r.state === 'DRIFT'; }).slice(0, 6) };
    if (cls.classification === 'PRESENT_EXACT_ALL') { out.delta = { shipping_plans: 0, shipping_plan_lines: 0, shipments: 0, shipment_lines: 0, shipment_routes: 0, shipment_events: 0 }; out.verdict = 'REUSED'; out.demo_plan_checksum = plan2.checksum; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    if (cls.classification !== 'ABSENT_ALL') { out.verdict = 'COMMIT_REFUSED_' + cls.classification; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }

    // B — durable integrity journal BEFORE the first write: setProperty once, FULL readback, byte-equivalent canonical
    // + journal_integrity_checksum validation (checksum-only readback is insufficient). Any failure → zero table writes.
    var journal = DEMO4A_buildJournal_(plan2);
    PropertiesService.getScriptProperties().setProperty(DEMO4A_JOURNAL_KEY_, JSON.stringify(journal));
    var jrbRaw = PropertiesService.getScriptProperties().getProperty(DEMO4A_JOURNAL_KEY_);
    var jv = DEMO4A_verifyJournal_(jrbRaw ? JSON.parse(jrbRaw) : null, journal);
    if (!jv.ok) { out.verdict = 'COMMIT_FAILED_JOURNAL_UNVERIFIED'; out.journal_reason = jv.reason; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    out.journal_integrity_checksum = journal.journal_integrity_checksum;

    // A — INSERT (phase 'insert') then POST-CHECK (phase 'postcheck'). ANY failure in either phase (write, readback,
    // classification, checksum, output) drops to the single outer catch, which rolls back ONLY this execution's inserts.
    inserted = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { inserted[t] = []; });
    phase = 'insert';
    DEMO4A_WRITE_ORDER_.forEach(function (name) {
      var sh = DEMO4A_ss_().getSheetByName(name), t = DEMO4A_readTable_(name), pk = DEMO4A_PK_OF_[name];
      (plan2.tables[name] || []).forEach(function (r) { sh.appendRow(DEMO4A_rowForHeaders_(t.headers, r)); inserted[name].push(DEMO4A_str_(r[pk])); });
      SpreadsheetApp.flush();
      var after = DEMO4A_readTable_(name), have = {}; after.rows.forEach(function (x) { have[DEMO4A_str_(x[pk])] = (have[DEMO4A_str_(x[pk])] || 0) + 1; });
      inserted[name].forEach(function (id) { if (have[id] !== 1) throw new Error('READBACK_FAILED ' + name + ':' + id + '×' + (have[id] || 0)); });
    });
    phase = 'postcheck';
    var post = DEMO4A_classifyState_(plan2, DEMO4A_readLive_());
    if (post.classification !== 'PRESENT_EXACT_ALL') throw new Error('POSTCHECK_NOT_EXACT:' + post.classification);   // → inserted-only rollback
    out.delta = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { out.delta[t] = inserted[t].length; });
    out.demo_plan_checksum = plan2.checksum; out.post_state = post.classification; out.verdict = 'COMMITTED';
  } catch (e) {
    // A — fail closed: NEVER leave rows behind. If any insert began, roll back exactly this execution's inserts.
    if (inserted && DEMO4A_anyInserted_(inserted)) {
      var rb = DEMO4A_rollbackInserted_(inserted);
      out.write_error = (e && e.message) ? e.message : String(e); out.rolled_back = rb.removed;
      out.verdict = (phase === 'postcheck')
        ? (rb.ok ? 'COMMIT_FAILED_POSTCHECK_ROLLED_BACK' : 'COMMIT_FAILED_POSTCHECK_ROLLBACK_UNVERIFIED')
        : (rb.ok ? 'COMMIT_FAILED_ROLLED_BACK' : 'COMMIT_FAILED_ROLLBACK_UNVERIFIED');
    } else { out.verdict = 'COMMIT_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  }
  finally { if (lock) { try { lock.releaseLock(); } catch (e2) { } } }
  Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out;
}

// ================================================================================================================
// ENTRYPOINT 4 — VALIDATE (strictly read-only; validates LIVE rows — never PK presence alone)
// ================================================================================================================
function TEMP_DEMO4A_VALIDATE_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_VALIDATE_SHIPPING_SHIPMENT_MAP_SEED', mode: 'STRICTLY READ-ONLY (validates LIVE rows)', output_contract: 'ONE_PRIMARY_LOG_ENTRY' };
  try {
    var plan = DEMO4A_buildPlan_(DEMO4A_readMasters_());
    if (!plan.ok) { out.verdict = 'VALIDATE_BLOCKED'; out.reason = plan.reason; Logger.log('DEMO4A_VALIDATE ' + JSON.stringify(out, null, 2)); return out; }
    var live = DEMO4A_readLive_();
    var v = DEMO4A_validateLiveRows_(plan, live, DEMO4A_readMasters_());   // masters → verify each bound coord equals its logistics_locations authority
    out.classification = v.classification; out.checks = v.checks; out.demo_plan_checksum = plan.checksum;
    out.verdict = v.demo_seed_validated ? 'DEMO_SEED_VALIDATED' : 'DEMO_SEED_RECONCILIATION_REQUIRED';
  } catch (e) { out.verdict = 'VALIDATE_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES (read-only; no stock/PO/K2/checksum/flag change)';
  Logger.log('DEMO4A_VALIDATE ' + JSON.stringify(out, null, 2)); return out;
}

// ================================================================================================================
// I — CLEAR (fully implemented; STAGED OFF behind a placeholder token). Clears ONLY when PRESENT_EXACT_ALL, no
//   external reference, seed checksum still matches the journal, and the exact clear token matches. Reverse-FK order.
// ================================================================================================================
function DEMO4A_nonDemoReferences_(live) {
  var refs = [];
  DEMO4A_WRITE_ORDER_.forEach(function (name) {
    var pk = DEMO4A_PK_OF_[name], fks = DEMO4A_FK_INTO_DEMO_[name] || [];
    (live[name] ? live[name].rows : []).forEach(function (r) { if (DEMO4A_isDemo_(r[pk])) return; fks.forEach(function (fk) { if (DEMO4A_isDemo_(r[fk])) refs.push(name + '.' + fk + '=' + DEMO4A_str_(r[fk]) + ' (non-demo row ' + DEMO4A_str_(r[pk]) + ')'); }); });
  });
  return refs;
}
function TEMP_DEMO4A_CLEAR_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_CLEAR_SHIPPING_SHIPMENT_MAP_SEED', mode: 'STAGED OFF (placeholder token → refuses; not run in this task)', output_contract: 'ONE_PRIMARY_LOG_ENTRY', deletion_order: DEMO4A_CLEAR_ORDER_ };
  var lock = null;
  try {
    if (DEMO4A_CONFIRMED_CLEAR_TOKEN_ === 'PASTE_DEMO_CLEAR_TOKEN_HERE' || !DEMO4A_str_(DEMO4A_CONFIRMED_CLEAR_TOKEN_)) { out.verdict = 'CLEAR_REFUSED_STAGED_OFF'; out.note = 'set DEMO4A_CONFIRMED_CLEAR_TOKEN_ to the seed demo_plan_checksum in a separate, explicit task to arm.'; Logger.log('DEMO4A_CLEAR ' + JSON.stringify(out, null, 2)); return out; }
    var plan = DEMO4A_buildPlan_(DEMO4A_readMasters_());
    if (!plan.ok) { out.verdict = 'CLEAR_REFUSED_PLAN'; out.reason = plan.reason; Logger.log('DEMO4A_CLEAR ' + JSON.stringify(out, null, 2)); return out; }
    if (DEMO4A_str_(DEMO4A_CONFIRMED_CLEAR_TOKEN_) !== DEMO4A_str_(plan.checksum)) { out.verdict = 'CLEAR_REFUSED_TOKEN_MISMATCH'; Logger.log('DEMO4A_CLEAR ' + JSON.stringify(out, null, 2)); return out; }
    var jr = PropertiesService.getScriptProperties().getProperty(DEMO4A_JOURNAL_KEY_);
    var jv = DEMO4A_verifyJournal_(jr ? JSON.parse(jr) : null, DEMO4A_buildJournal_(plan));   // B — full integrity, not checksum-only
    if (!jv.ok) { out.verdict = 'CLEAR_REFUSED_SEED_CHECKSUM_MISMATCH'; out.journal_reason = jv.reason; Logger.log('DEMO4A_CLEAR ' + JSON.stringify(out, null, 2)); return out; }
    lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) { out.verdict = 'CLEAR_REFUSED_LOCK'; Logger.log('DEMO4A_CLEAR ' + JSON.stringify(out, null, 2)); return out; }
    var live = DEMO4A_readLive_(), cls = DEMO4A_classifyState_(plan, live);
    if (cls.classification !== 'PRESENT_EXACT_ALL') { out.verdict = 'CLEAR_REFUSED_' + cls.classification; out.existing_state = cls.classification; Logger.log('DEMO4A_CLEAR ' + JSON.stringify(out, null, 2)); return out; }
    var ids = DEMO4A_allIds_(plan);
    // D — complete external-reference audit: the six demo tables' FK columns PLUS every audited downstream authority.
    var refs = DEMO4A_nonDemoReferences_(live).concat(DEMO4A_externalReferences_(ids));
    if (refs.length) { out.verdict = 'CLEAR_REFUSED_EXTERNAL_REFERENCE'; out.references = refs.slice(0, 12); Logger.log('DEMO4A_CLEAR ' + JSON.stringify(out, null, 2)); return out; }
    var removed = {};
    DEMO4A_CLEAR_ORDER_.forEach(function (name) { var set = {}; (ids[name] || []).forEach(function (id) { set[DEMO4A_str_(id)] = 1; }); removed[name] = DEMO4A_deleteRowsByPk_(name, set); });
    SpreadsheetApp.flush();
    var post = DEMO4A_readLive_(), remain = 0; DEMO4A_WRITE_ORDER_.forEach(function (name) { var pk = DEMO4A_PK_OF_[name]; (post[name].rows || []).forEach(function (r) { if (DEMO4A_isDemo_(r[pk])) remain++; }); });
    out.removed = removed; out.verdict = (remain === 0) ? 'CLEARED' : 'CLEAR_UNVERIFIED'; if (remain === 0) PropertiesService.getScriptProperties().deleteProperty(DEMO4A_JOURNAL_KEY_);
  } catch (e) { out.verdict = 'CLEAR_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  finally { if (lock) { try { lock.releaseLock(); } catch (e2) { } } }
  Logger.log('DEMO4A_CLEAR ' + JSON.stringify(out, null, 2)); return out;
}
