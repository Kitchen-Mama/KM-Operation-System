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
// transit-type → role-appropriate preferred canonical location types (soft preference; deterministic id order otherwise).
function DEMO4A_transitPrefTypes_(transitType, role) {
  var t = DEMO4A_low_(transitType), air = /air/.test(t), rail = /rail/.test(t);
  if (role === 'origin') return air ? ['factory', 'warehouse', 'airport'] : rail ? ['factory', 'warehouse', 'rail_terminal'] : ['factory', 'warehouse', 'port', 'seaport'];
  if (role === 'destination') return ['warehouse', 'fulfillment_center', 'port', 'airport', 'rail_terminal'];
  return air ? ['airport', 'hub', 'port'] : rail ? ['rail_terminal', 'hub', 'port'] : ['port', 'seaport', 'hub', 'airport'];   // current transit
}
// deterministic anchor pick from ACTIVE valid-coordinate locations. Exact country (hard). Exact region preferred when the
// template supplies one AND an in-country location carries it (else country-only, region_exact:false). Role type is a
// SOFT preference. Excludes already-used ids. Stable order by logistics_location_id. Returns { loc, region_exact } | null.
function DEMO4A_pickAnchor_(locations, opts) {
  opts = opts || {};
  var inCountry = (locations || []).filter(function (l) {
    if (!DEMO4A_locValid_(l) || !DEMO4A_locActive_(l)) return false;
    var id = DEMO4A_locId_(l); if (!id || (opts.exclude && opts.exclude[id])) return false;
    if (opts.country && DEMO4A_low_(DEMO4A_locCountry_(l)) !== DEMO4A_low_(opts.country)) return false;
    return true;
  });
  if (!inCountry.length) return null;
  var pool = inCountry, regionExact = false;
  if (opts.region) { var byReg = inCountry.filter(function (l) { return DEMO4A_low_(DEMO4A_locRegion_(l)) === DEMO4A_low_(opts.region); }); if (byReg.length) { pool = byReg; regionExact = true; } }
  function typeRank(l) { var i = (opts.preferTypes || []).indexOf(DEMO4A_locType_(l)); return i === -1 ? (opts.preferTypes || []).length : i; }
  pool.sort(function (a, b) { var ra = typeRank(a), rb = typeRank(b); if (ra !== rb) return ra - rb; var ia = DEMO4A_locId_(a), ib = DEMO4A_locId_(b); return ia < ib ? -1 : (ia > ib ? 1 : 0); });
  return { loc: pool[0], region_exact: regionExact };
}
function DEMO4A_bindingFromLoc_(loc, source, nodeIndex, regionExact) {
  return { source: source, node_index: nodeIndex, region_exact: !!regionExact, location_ref_id: DEMO4A_locId_(loc),
    latitude: DEMO4A_num_(loc.latitude), longitude: DEMO4A_num_(loc.longitude), location_name: DEMO4A_str_(loc.location_name), country: DEMO4A_locCountry_(loc), region: DEMO4A_locRegion_(loc), city: DEMO4A_str_(loc.city) };
}
// C — build the ORIGIN/CURRENT/DESTINATION role bindings for one template. A role node that already has a canonical/
// direct binding uses THAT (its coordinate authority); otherwise a deterministic Demo-only location is chosen. Origin +
// destination are always required (distinct coords); a distinct current marker is required only when opts.requireCurrent.
function DEMO4A_coordKey_(b) { return DEMO4A_num_(b.latitude).toFixed(5) + ',' + DEMO4A_num_(b.longitude).toFixed(5); }
function DEMO4A_bindTemplateRoles_(template, resolved, locations, opts) {
  opts = opts || {};
  var n = resolved.length, used = {}, transit = DEMO4A_str_(template.transit_type);
  function roleAt(idx, role, pickOpts) {
    var geo = resolved[idx] && resolved[idx].geo;
    if (geo && geo.bound) { var b = { source: geo.binding_type, node_index: idx, region_exact: true, location_ref_id: geo.location_ref_id, latitude: geo.latitude, longitude: geo.longitude, location_name: geo.location_name, country: geo.country, region: geo.region, city: geo.city }; if (b.location_ref_id) used[b.location_ref_id] = 1; used[DEMO4A_coordKey_(b)] = 1; return b; }
    pickOpts.exclude = used;
    var pick = DEMO4A_pickAnchor_(locations, pickOpts);
    if (!pick) return null;
    var bb = DEMO4A_bindingFromLoc_(pick.loc, 'DEMO_SYNTHETIC_RUNTIME_BINDING', idx, pick.region_exact);
    used[bb.location_ref_id] = 1; used[DEMO4A_coordKey_(bb)] = 1; return bb;
  }
  var origin = roleAt(0, 'origin', { country: DEMO4A_str_(template.origin_country), preferTypes: DEMO4A_transitPrefTypes_(transit, 'origin') });
  if (!origin) return { ok: false, reason: 'NO_ORIGIN_ANCHOR' };
  var destination = roleAt(n - 1, 'destination', { country: DEMO4A_str_(template.destination_country), region: DEMO4A_str_(template.destination_region), preferTypes: DEMO4A_transitPrefTypes_(transit, 'destination') });
  if (!destination) return { ok: false, reason: 'NO_DESTINATION_ANCHOR' };
  if (DEMO4A_coordKey_(origin) === DEMO4A_coordKey_(destination)) return { ok: false, reason: 'ORIGIN_DESTINATION_NOT_DISTINCT' };
  var roleByIndex = {}; roleByIndex[0] = origin; roleByIndex[n - 1] = destination;
  var current = null, currentIndex = -1;
  if (opts.requireCurrent) {
    if (n < 3) return { ok: false, reason: 'NO_MIDDLE_NODE_FOR_CURRENT_MARKER', origin: origin, destination: destination };
    currentIndex = Math.max(1, Math.min(n - 2, Math.floor((n - 1) / 2)));
    current = roleAt(currentIndex, 'current', { preferTypes: DEMO4A_transitPrefTypes_(transit, 'current') });
    if (!current) return { ok: false, reason: 'NO_CURRENT_TRANSIT_MARKER', origin: origin, destination: destination };
    if (DEMO4A_coordKey_(current) === DEMO4A_coordKey_(origin) || DEMO4A_coordKey_(current) === DEMO4A_coordKey_(destination)) return { ok: false, reason: 'CURRENT_MARKER_NOT_DISTINCT', origin: origin, destination: destination };
    roleByIndex[currentIndex] = current;
  }
  return { ok: true, origin: origin, destination: destination, current: current, current_index: currentIndex, role_by_index: roleByIndex };
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

    // H — binding manifest (checksummed): each role's node id + exact logistics_location_id + binding type + coords.
    ['origin', 'current', 'destination'].forEach(function (role) { var b = binding[role]; if (b) bindingManifest.push([shipId, role, DEMO4A_str_(resolved[b.node_index].node.route_template_node_id), DEMO4A_str_(b.location_ref_id), b.source, DEMO4A_num_(b.latitude), DEMO4A_num_(b.longitude)].join('~')); });

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
      plan_lines: lineCount, shipment_lines: lineCount });

    var onMap = DEMO4A_mapVisible_(life.status, evs.length, nodeCount);
    if (onMap) { var last = evs[evs.length - 1]; var mapRec = { shipment_id: shipId, status: life.status, moving: DEMO4A_mapMoving_(life.status), delivered: DEMO4A_mapDelivered_(life.status), current_node_sequence: DEMO4A_str_(resolved[currentIndex].node.node_sequence), latest_event: last.event_type, latest_event_time: last.event_time, marker_lat: last.binding.latitude, marker_lng: last.binding.longitude, carrier_id: carrier, transit_method: method, eta: life.eta }; visibility.on_the_way_map.push(mapRec); if (life.slot === 'in_transit') visibility.primary_map_record = mapRec; }
  });

  var counts = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { counts[t] = tables[t].length; });
  counts.total = DEMO4A_WRITE_ORDER_.reduce(function (a, t) { return a + tables[t].length; }, 0);
  return { ok: true, checksum: DEMO4A_checksum_(tables, bindingManifest), tables: tables, counts: counts, per_shipment: per_shipment, visibility: visibility,
    scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku_pairs: scope.pairs },
    region_selection_mode: sel.region_selection_mode, available_regions: sel.available_regions, rejection_counts: sel.rejection_counts, chosen_templates: sel.chosen,
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
  return { templates: t.rows, nodes: n.rows, locations: l.rows, marketplaceSkus: mk.rows, skuDetails: sd.rows,
    present: { shipment_route_templates: t.present, shipment_route_template_nodes: n.present, logistics_locations: l.present, marketplace_skus: mk.present, sku_details: sd.present } };
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
// ENTRYPOINT 1 — PREFLIGHT (strictly read-only)
// ================================================================================================================
function TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED', mode: 'STRICTLY READ-ONLY (no write/create/delete/submit)', output_contract: 'ONE_PRIMARY_LOG_ENTRY' };
  try {
    var schema = DEMO4A_schemaGate_(); out.schema_gate = schema;
    var masters = DEMO4A_readMasters_(); out.masters_present = masters.present;
    out.master_row_counts = { templates: masters.templates.length, template_nodes: masters.nodes.length, logistics_locations: masters.locations.length, marketplace_skus: masters.marketplaceSkus.length, sku_details: masters.skuDetails.length };
    var plan = DEMO4A_buildPlan_(masters);
    if (!plan.ok) { out.verdict = schema.ok ? 'PREFLIGHT_FAILED' : 'PREFLIGHT_FAILED_SCHEMA'; out.reason = plan.reason; out.rejection_counts = plan.rejection_counts || null; out.available_regions = plan.available_regions || null; out.detail = plan; }
    else {
      out.region_selection_mode = plan.region_selection_mode; out.available_regions = plan.available_regions; out.chosen_templates = plan.chosen_templates;
      out.selected_template_ids = plan.chosen_templates.map(function (c) { return c.route_template_id; }); out.rejection_counts = plan.rejection_counts;
      out.scope = plan.scope; out.planned_counts = plan.counts; out.per_shipment = plan.per_shipment; out.demo_plan_checksum = plan.checksum;
      var cls = DEMO4A_classifyState_(plan, DEMO4A_readLive_());
      out.existing_state = { classification: cls.classification, duplicate_pk_counts: cls.duplicate_pk_counts, unexpected_demo_ids: cls.unexpected_demo_ids };
      out.verdict = !schema.ok ? 'PREFLIGHT_FAILED_SCHEMA'
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
