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
// ================================================================================================================
// V3G5(B) — THE ONE SHARED CANONICALIZATION CONTRACT. Used by the intended plan checksum (DEMO4A_rowChecksum_), the
// post-write readback classification (DEMO4A_classifyState_ / DEMO4A_mismatchedFields_), VALIDATE and the REUSED retry
// comparison — a single field-class-aware rule, so intended and live values can never be canonicalized asymmetrically.
//
// ROOT-CAUSE NOTE (V3G5(A), source-proven): the writer projects intended rows onto the LIVE physical headers
// (DEMO4A_rowForHeaders_ → sh.appendRow), and the readback compares Object.keys(intendedRow). Two mechanisms therefore
// produce POSTCHECK_NOT_EXACT:CONTENT_DRIFT after a technically successful setValues/getValues round trip:
//   (1) WRITER_INTENDED_FIELD_NOT_IN_PHYSICAL_HEADER — an intended field with no physical column is silently DROPPED on
//       write and reads back absent (canonical ''), while the intended value is non-empty. The schema gate only proves
//       DEMO4A_REQUIRED_COLS_ presence, so intended fields beyond that list were never verified before writing.
//   (2) DATE_WALLCLOCK_ASYMMETRY — an intended date/datetime is written as a STRING and read back as a Date OBJECT.
//       The string path applies no timezone maths while the Date path shifted by a HARDCODED +8h, so the two sides only
//       agreed when the spreadsheet timezone happened to be exactly UTC+8.
// Both are repaired below: (1) a pre-write projection gate that fails closed with ZERO writes, and (2) the wall-clock
// offset is now an EXPLICIT contract value synced from the spreadsheet's own timezone (default 480 = UTC+8, so a +8
// spreadsheet keeps byte-identical canonical output and an UNCHANGED demo_plan_checksum).
// ================================================================================================================
var DEMO4A_CANON_CONTRACT_VERSION_ = 'V3G5-CANON-1';
// EXPLICIT wall-clock offset (minutes) used to canonicalize a Date OBJECT read from a cell into the spreadsheet's own
// wall clock. Default 480 (UTC+8) preserves the pre-V3G5 canonical output exactly; live entrypoints sync it from the
// spreadsheet. Intended plan values are plain strings and NEVER take the Date path, so the plan checksum is unaffected.
var DEMO4A_CANON_TZ_OFFSET_MIN_ = 480;
function DEMO4A_setCanonTzOffsetMin_(min) { var n = Number(min); DEMO4A_CANON_TZ_OFFSET_MIN_ = isFinite(n) ? n : 480; return DEMO4A_CANON_TZ_OFFSET_MIN_; }
function DEMO4A_spreadsheetTzOffsetMin_() {
  try {
    var tz = DEMO4A_ss_().getSpreadsheetTimeZone();
    var probe = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    var local = Utilities.formatDate(probe, tz, 'yyyy-MM-dd HH:mm:ss');
    var m = local.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/); if (!m) return { ok: false, offset_min: 480, time_zone: DEMO4A_str_(tz) };
    var asUtc = Date.UTC(+m[1], (+m[2]) - 1, +m[3], +m[4], +m[5], +m[6]);
    return { ok: true, offset_min: Math.round((asUtc - probe.getTime()) / 60000), time_zone: DEMO4A_str_(tz) };
  } catch (e) { return { ok: false, offset_min: 480, time_zone: '', reason: (e && e.message) ? e.message : String(e) }; }
}
// EXPLICIT field classes for every field the demo writer owns. A field absent from this map falls back to the legacy
// heuristic and is reported as an UNKNOWN class by the canonicalization diagnostic (never silently reclassified).
var DEMO4A_FIELD_CLASS_ = {
  // identifiers — exact text; NEVER numeric-coerced, leading zeros preserved
  shipping_plan_id: 'identifier', shipping_plan_line_id: 'identifier', shipment_id: 'identifier', shipment_line_id: 'identifier',
  shipment_route_id: 'identifier', shipment_event_id: 'identifier', route_template_id: 'identifier', route_template_node_id: 'identifier',
  location_ref_id: 'identifier', logistics_location_id: 'identifier', warehouse_id: 'identifier', source_warehouse_id: 'identifier',
  destination_warehouse_id: 'identifier', carrier_id: 'identifier', sku: 'identifier', site_sku: 'identifier', asin: 'identifier',
  transferred_shipment_id: 'identifier', parent_shipping_plan_id: 'identifier', source_event_id: 'identifier', container_no: 'identifier',
  tracking_number: 'identifier', node_code: 'identifier', location_code: 'identifier', postal_code: 'identifier',
  // warehouse_code is an EXTERNAL/operator code (e.g. ABE2) that must never be numeric-coerced or lose leading zeros.
  // `identifier` is its CANONICALIZATION class only - it is NOT a relational identity (SHIPMENT_CENTER_SPEC: never an
  // identity, not globally unique) and this tool never uses it as a foreign key.
  warehouse_code: 'identifier',
  shipping_plan_no: 'identifier', shipment_no: 'identifier',
  // enums / statuses — exact text (never lowercased)
  status: 'enum', batch_status: 'enum', plan_status: 'enum', event_type: 'enum', event_status: 'enum', raw_status: 'enum',
  location_ref_type: 'enum', node_type: 'enum', transport_mode: 'enum', planned_event_type: 'enum', shipping_method: 'enum',
  last_mile_delivery: 'enum', ship_from_type: 'enum', destination_type: 'enum', transit_type: 'enum', marketplace: 'enum',
  marketplace_seperate: 'enum', company: 'enum', country: 'enum', currency: 'enum', source: 'enum', source_page: 'enum',
  // free business text — exact, never lowercased
  location_name: 'text', note: 'text', destination: 'text', ship_from: 'text', region: 'text', city: 'text',
  created_by: 'text', updated_by: 'text', plan_name: 'text',
  // numeric business quantities — 0 is a real value; blank is NOT 0
  plan_carton_qty: 'numeric', shipment_carton_qty: 'numeric', units_per_carton: 'numeric', plan_version: 'numeric',
  sequence_no: 'numeric', event_sequence: 'numeric', total_qty: 'numeric', qty: 'numeric',
  requested_qty: 'numeric', approved_qty: 'numeric', shipment_qty: 'numeric', shipment_total_qty: 'numeric',
  // coordinates — stable canonical decimal, classified separately from business numerics
  latitude: 'coordinate', longitude: 'coordinate',
  // dates / datetimes — one wall-clock canonical form per class; never conflated
  etd: 'date', eta: 'date', actual_departure_date: 'date', actual_arrival_date: 'date', delivered_date: 'date',
  planned_arrival_date: 'date', planned_departure_date: 'date',
  created_at: 'datetime', updated_at: 'datetime', event_time: 'datetime',
  // booleans — declared for contract completeness; the demo writer currently owns none of these, so adding the class
  // cannot move any intended canonical value or the plan checksum. false is a real value and is NEVER blank.
  is_active: 'boolean', is_receiving_enabled: 'boolean', is_deleted: 'boolean', is_primary: 'boolean', is_default: 'boolean'
};
var DEMO4A_FIELD_CLASSES_ = { identifier: 1, text: 1, enum: 1, numeric: 1, coordinate: 1, boolean: 1, date: 1, datetime: 1 };
// V3G5B(I) - COERCION-RISK PREDICATES. A cell only changes representation when its VALUE is coercible. Non-numeric text
// written through setValues stays text no matter how the column is formatted, so a numeric-formatted column carrying
// unrelated existing numbers is NOT by itself a risk. These are deliberately narrow: whitespace-only and blank are not
// numeric-like, and a numeric-like STRING in a non-numeric field IS a real risk (leading zeros / precision can be lost).
function DEMO4A_numericLike_(v) { if (typeof v === 'number') return true; var t = DEMO4A_str_(v); if (t === '') return false; return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t); }
function DEMO4A_dateLike_(v) { if (DEMO4A_isDateObj_(v)) return true; var t = DEMO4A_str_(v); if (t === '') return false; return /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/.test(t) || /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/.test(t); }
function DEMO4A_boolLike_(v) { if (typeof v === 'boolean') return true; var t = DEMO4A_str_(v); return t !== '' && (DEMO4A_BOOL_TRUE_.hasOwnProperty(t) || DEMO4A_BOOL_FALSE_.hasOwnProperty(t)); }
// legacy heuristic retained ONLY as the declared fallback for an unmapped field (reported, never silent).
function DEMO4A_fieldKind_(f) {
  if (f === 'event_time' || /_at$/.test(f)) return 'datetime';
  if (f === 'etd' || f === 'eta' || /_date$/.test(f)) return 'date';
  if (/(_qty$|^latitude$|^longitude$|sequence|units_per_carton|plan_version|carton|_snapshot$|_rate$|_cost$|_cbm$|weight$)/.test(f)) return 'numeric';
  return 'string';
}
function DEMO4A_fieldClassKnown_(field) { return DEMO4A_FIELD_CLASS_.hasOwnProperty(field); }
function DEMO4A_fieldClass_(field) {
  if (DEMO4A_FIELD_CLASS_.hasOwnProperty(field)) return DEMO4A_FIELD_CLASS_[field];
  var k = DEMO4A_fieldKind_(field);
  return k === 'numeric' ? 'numeric' : (k === 'date' ? 'date' : (k === 'datetime' ? 'datetime' : 'text'));
}
function DEMO4A_isBlankCell_(v) { return v == null || v === '' || (typeof v === 'string' && v.trim() === ''); }
var DEMO4A_BOOL_TRUE_ = { 'true': 1, 'TRUE': 1, 'True': 1, 'yes': 1, 'YES': 1, 'Yes': 1, 'y': 1, 'Y': 1, '1': 1 };
var DEMO4A_BOOL_FALSE_ = { 'false': 1, 'FALSE': 1, 'False': 1, 'no': 1, 'NO': 1, 'No': 1, 'n': 1, 'N': 1, '0': 1 };
// wall-clock parts of a Date OBJECT in the contract timezone (the spreadsheet's own wall clock).
function DEMO4A_dateWallParts_(v, tzMin) {
  var d = new Date(v.getTime() + (isFinite(Number(tzMin)) ? Number(tzMin) : DEMO4A_CANON_TZ_OFFSET_MIN_) * 60000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}
function DEMO4A_isDateObj_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
// THE contract. tzMin is explicit; omitted → the module contract value. Invalid values return a typed sentinel so they
// FAIL CLOSED (a sentinel can never equal a valid canonical form, and blank never equals 0 or false).
function DEMO4A_canonField_(field, value, tzMin) {
  var cls = DEMO4A_fieldClass_(field);
  if (DEMO4A_isDateObj_(value) && isNaN(value.getTime())) return (cls === 'date' ? 'DATE_INVALID:' : cls === 'datetime' ? 'DATETIME_INVALID:' : 'VALUE_INVALID:') + 'InvalidDate';
  if (DEMO4A_isBlankCell_(value)) return '';                       // blank is ONLY blank — never 0, never false
  if (cls === 'numeric' || cls === 'coordinate') {
    if (typeof value === 'boolean') return (cls === 'coordinate' ? 'COORD_INVALID:' : 'NUM_INVALID:') + String(value);
    var sn = DEMO4A_str_(value), n = Number(sn);
    if (!isFinite(n) || sn === '') return (cls === 'coordinate' ? 'COORD_INVALID:' : 'NUM_INVALID:') + sn;
    return String(n);                                              // stable canonical decimal; non-lossy, never rounded
  }
  if (cls === 'boolean') {
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    var sb = DEMO4A_str_(value);
    if (DEMO4A_BOOL_TRUE_[sb]) return 'TRUE';
    if (DEMO4A_BOOL_FALSE_[sb]) return 'FALSE';
    return 'BOOL_INVALID:' + sb;
  }
  if (cls === 'date') {
    if (DEMO4A_isDateObj_(value)) { var pd = DEMO4A_dateWallParts_(value, tzMin); return pd.y + '-' + DEMO4A_z2_(pd.mo) + '-' + DEMO4A_z2_(pd.d); }
    var sd = DEMO4A_str_(value), md = sd.match(/^(\d{4})-(\d{2})-(\d{2})/); if (md) return md[1] + '-' + md[2] + '-' + md[3];
    var pd2 = new Date(sd); if (!isNaN(pd2.getTime())) { var q = DEMO4A_dateWallParts_(pd2, tzMin); return q.y + '-' + DEMO4A_z2_(q.mo) + '-' + DEMO4A_z2_(q.d); }
    return 'DATE_INVALID:' + sd;
  }
  if (cls === 'datetime') {
    if (DEMO4A_isDateObj_(value)) { var pt = DEMO4A_dateWallParts_(value, tzMin); return pt.y + '-' + DEMO4A_z2_(pt.mo) + '-' + DEMO4A_z2_(pt.d) + ' ' + DEMO4A_z2_(pt.h) + ':' + DEMO4A_z2_(pt.mi) + ':' + DEMO4A_z2_(pt.s); }
    var st = DEMO4A_str_(value), mt = st.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (mt) return mt[1] + '-' + mt[2] + '-' + mt[3] + ' ' + mt[4] + ':' + mt[5] + ':' + (mt[6] || '00');
    var mo2 = st.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (mo2) return mo2[1] + '-' + mo2[2] + '-' + mo2[3] + ' 00:00:00';
    var pt2 = new Date(st); if (!isNaN(pt2.getTime())) { var w = DEMO4A_dateWallParts_(pt2, tzMin); return w.y + '-' + DEMO4A_z2_(w.mo) + '-' + DEMO4A_z2_(w.d) + ' ' + DEMO4A_z2_(w.h) + ':' + DEMO4A_z2_(w.mi) + ':' + DEMO4A_z2_(w.s); }
    return 'DATETIME_INVALID:' + st;
  }
  return DEMO4A_str_(value);                                       // identifier / enum / text — EXACT, never lowercased
}
function DEMO4A_canon_(field, value) { return DEMO4A_canonField_(field, value, DEMO4A_CANON_TZ_OFFSET_MIN_); }
// the reason class for one canonical mismatch — used by the compact postcheck forensics (never a guess about business intent).
function DEMO4A_driftReasonCode_(cls, intendedCanon, liveCanon, liveRaw, liveHasKey) {
  if (!liveHasKey) return 'MISSING_PHYSICAL_FIELD';
  if (liveCanon === '' && intendedCanon !== '') return 'LIVE_BLANK_INTENDED_VALUE';
  if (intendedCanon === '' && liveCanon !== '') return 'LIVE_VALUE_INTENDED_BLANK';
  if (/_INVALID:/.test(liveCanon)) return 'LIVE_CANONICAL_INVALID';
  if (/_INVALID:/.test(intendedCanon)) return 'INTENDED_CANONICAL_INVALID';
  if ((cls === 'date' || cls === 'datetime') && DEMO4A_isDateObj_(liveRaw)) return 'DATE_WALLCLOCK_ASYMMETRY';
  if (cls === 'boolean') return 'BOOLEAN_REPRESENTATION';
  if (cls === 'numeric' || cls === 'coordinate') return 'NUMERIC_REPRESENTATION_OR_VALUE';
  return 'VALUE_MUTATION';
}
function DEMO4A_rowChecksum_(row, keys) { keys = keys.slice().sort(); return DEMO4A_hash_(keys.map(function (k) { return k + '=' + DEMO4A_canon_(k, (row || {})[k]); }).join('|')); }
function DEMO4A_rawType_(v) { if (v === undefined) return 'undefined'; if (v === null) return 'null'; if (DEMO4A_isDateObj_(v)) return 'Date'; return typeof v; }
function DEMO4A_mismatchedFields_(exp, live, keys) {
  var out = [];
  keys.forEach(function (k) {
    var lv = (live || {}), e = DEMO4A_canon_(k, exp[k]), l = DEMO4A_canon_(k, lv[k]);
    if (e === l) return;
    var cls = DEMO4A_fieldClass_(k), hasKey = Object.prototype.hasOwnProperty.call(lv, k);
    out.push({ field: k, expected: e, live: l, field_class: cls, intended_type: DEMO4A_rawType_(exp[k]), live_type: DEMO4A_rawType_(lv[k]),
      reason_code: DEMO4A_driftReasonCode_(cls, e, l, lv[k], hasKey) });
  });
  return out;
}

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
  // V3G(G.2) — warehouse-backed 3PL rows: recognized as a warehouse-class destination (never UNKNOWN when present live).
  third_party_warehouse: 'warehouse', third_party: 'warehouse', '3pl': 'warehouse', '3pl_warehouse': 'warehouse', tpl_warehouse: 'warehouse',
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

// ================================================================================================================
// V3G4(B) — THE SINGLE SHARED DESTINATION-AUTHORITY RULE.
// Before V3G4 the destination role was bound by DEMO4A_pickAnchor_ (a generic logistics_locations pool that HARD-requires
// a VALID MASTER COORDINATE and a role-compatible canonical location_type). Live FBA rows carry BLANK coordinates, so the
// pool was empty and every template died as NO_ROLE_COMPATIBLE_DESTINATION_LOCATION inside DEMO4A_selectTemplates_ —
// which DEMO4A_buildPlan_ calls BEFORE its warehouse-authority block, so the armed authority was never consumed.
// This function is now the ONE destination rule, called by template eligibility AND by final plan construction, so a
// template can never be rejected by one rule and then built by another. It resolves ONLY through the warehouse identity
// authority (DEMO4A_resolveWarehouseDestination_ + DEMO4A_pickWarehouseForRegion_) — a destination warehouse is NEVER
// drawn from the gateway/location-type pool, and a port/airport/centroid is NEVER a destination fallback.
// ================================================================================================================
var DEMO4A_DEST_READY_BRANCHES_ = { WAREHOUSE_LOCATION_COORDINATE_READY: 1, DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE: 1 };
function DEMO4A_destAuthorityForTemplate_(tpl, warehouses, locations, coordAuthority, company) {
  tpl = tpl || {};
  var whById = {};
  (warehouses || []).forEach(function (w) { var id = DEMO4A_low_(DEMO4A_whId_(w)); if (id && whById[id] === undefined) whById[id] = w; });
  var declared = DEMO4A_str_(tpl.destination_warehouse_id);
  var whRow = declared ? whById[DEMO4A_low_(declared)] : null;
  var regionBucket = DEMO4A_dxRegionBucket_(DEMO4A_str_(tpl.destination_region));
  var destCountry = DEMO4A_str_(tpl.destination_country);
  // C(4) — when the template declares no (or an unknown) destination warehouse, the destination COUNTRY/REGION resolves
  // to a deterministic eligible warehouse. This is still the warehouse identity rule, never a location-type pool.
  if (!whRow) {
    var byRegion = regionBucket === 'OTHER' ? null : DEMO4A_pickWarehouseForRegion_(warehouses, locations, coordAuthority, regionBucket, company, destCountry, '');
    if (!byRegion) return { branch: 'WAREHOUSE_IDENTITY_MISSING', reason: declared ? 'DESTINATION_WAREHOUSE_ID_NOT_IN_MASTER:' + declared : 'NO_ELIGIBLE_WAREHOUSE_FOR_DESTINATION_REGION', warehouse_id: declared, identity_ready: false, renderable: false, received_allowed: false };
    var rr = byRegion.resolution; rr.selected_by = 'DESTINATION_REGION_WAREHOUSE_SELECTION'; if (declared) rr.reselected_from_warehouse_id = declared;
    rr.normalized_address = rr.normalized_address || DEMO4A_normalizeWhAddress_(byRegion.warehouse).normalized;
    return rr;
  }
  // identity / eligibility / scope FIRST (independent of any coordinate).
  if (!DEMO4A_whDestTypeCompatible_(whRow)) return { branch: 'WAREHOUSE_IDENTITY_INELIGIBLE', reason: 'WAREHOUSE_TYPE_NOT_DESTINATION_COMPATIBLE:' + DEMO4A_whType_(whRow), warehouse_id: DEMO4A_whId_(whRow), identity_ready: false, renderable: false, received_allowed: false };
  if (DEMO4A_whCompany_(whRow) && company && DEMO4A_low_(DEMO4A_whCompany_(whRow)) !== DEMO4A_low_(company)) return { branch: 'WAREHOUSE_IDENTITY_MISMATCH', reason: 'COMPANY_MISMATCH', warehouse_id: DEMO4A_whId_(whRow), identity_ready: false, renderable: false, received_allowed: false };
  if (DEMO4A_whCountry_(whRow) && destCountry && DEMO4A_low_(DEMO4A_whCountry_(whRow)) !== DEMO4A_low_(destCountry)) return { branch: 'WAREHOUSE_IDENTITY_MISMATCH', reason: 'COUNTRY_MISMATCH', warehouse_id: DEMO4A_whId_(whRow), identity_ready: false, renderable: false, received_allowed: false };
  var r = DEMO4A_resolveWarehouseDestination_(whRow, locations, coordAuthority, tpl);
  if (r.address_status && r.address_status !== 'ADDRESS_AUTHORITY_READY') { r.identity_ready = false; if (!r.reason) r.reason = r.address_status; }
  // coordinate not ready for this template's own warehouse → deterministic same-region eligible reselection (identity rule).
  if (!DEMO4A_DEST_READY_BRANCHES_[r.branch] && r.identity_ready) {
    var alt = DEMO4A_pickWarehouseForRegion_(warehouses, locations, coordAuthority, regionBucket !== 'OTHER' ? regionBucket : DEMO4A_dxRegionBucket_(DEMO4A_whRegion_(whRow)), company, destCountry || DEMO4A_whCountry_(whRow), DEMO4A_whId_(whRow));
    if (alt) { r = alt.resolution; r.reselected_from_warehouse_id = DEMO4A_whId_(whRow); }
  }
  r.normalized_address = r.normalized_address || (r.identity_ready ? DEMO4A_normalizeWhAddress_(whRow).normalized : '');
  return r;
}
// D — the most specific truthful rejection reason for a destination-authority result. Once the warehouse authority is
// active we NEVER report NO_ROLE_COMPATIBLE_DESTINATION_LOCATION: no generic location-type pool is consulted at all.
var DEMO4A_DEST_AUTH_REASONS_ = { DESTINATION_WAREHOUSE_IDENTITY_UNRESOLVED: 1, DESTINATION_WAREHOUSE_LOCATION_LINEAGE_UNRESOLVED: 1, DESTINATION_ADDRESS_COORDINATE_UNRESOLVED: 1 };
function DEMO4A_destAuthorityReason_(r) {
  if (!r) return 'DESTINATION_WAREHOUSE_IDENTITY_UNRESOLVED';
  if (r.branch === 'WAREHOUSE_LOCATION_JOIN_CONFLICT') return 'DESTINATION_WAREHOUSE_LOCATION_LINEAGE_UNRESOLVED';
  if (r.identity_ready !== true) return (r.branch === 'WAREHOUSE_LOCATION_JOIN_MISSING' && DEMO4A_str_(r.warehouse_id)) ? 'DESTINATION_WAREHOUSE_LOCATION_LINEAGE_UNRESOLVED' : 'DESTINATION_WAREHOUSE_IDENTITY_UNRESOLVED';
  if (!DEMO4A_DEST_READY_BRANCHES_[r.branch]) return 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED';
  return '';
}
// the destination ROLE BINDING built from a resolved authority — ONE construction shared by eligibility and build, so the
// selected binding and the constructed route row are the same object shape with the same coordinate and lineage.
function DEMO4A_warehouseDestBinding_(da, destIdx, nodeType) {
  var derived = da.branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE';
  var b = { source: 'WAREHOUSE_LOCATION_BINDING', node_index: destIdx, region_exact: true, location_ref_id: DEMO4A_str_(da.logistics_location_id),
    latitude: da.latitude, longitude: da.longitude, location_name: DEMO4A_str_(da.logistics_location_id) || DEMO4A_str_(da.warehouse_id), country: da.country, region: da.region, city: '',
    canon_type: da.location_type || 'warehouse', location_type: da.location_type || 'warehouse', source_proven: true, role_compatible: true, corridor_compatible: true,
    warehouse_id: da.warehouse_id, warehouse_code: da.warehouse_code, verification_status: da.verification_status,
    coordinate_source: da.coordinate_source, coordinate_accuracy: da.coordinate_accuracy || '', coordinate_source_reference: da.coordinate_source_reference || '', address_derived: derived };
  b.evidence = { role: 'destination', location_id: DEMO4A_str_(da.logistics_location_id), warehouse_id: da.warehouse_id, warehouse_code: da.warehouse_code, country: da.country, region: da.region,
    location_type: da.location_type || 'warehouse', canon_location_type: da.location_type || 'warehouse', node_type: DEMO4A_str_(nodeType), binding_type: 'WAREHOUSE_LOCATION_BINDING',
    coordinate_source: da.coordinate_source, coordinate_accuracy: da.coordinate_accuracy || '', address_derived: derived, source_proven: true, role_compatible: true, corridor_compatible: true };
  return b;
}
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
  // V3G4(A/B) — DESTINATION authority. When the `warehouses` master is present the destination is bound by the SHARED
  // warehouse rule (business identity = warehouses; exact geographic lineage = the warehouse-linked logistics_location;
  // display coordinate = that row's valid coordinate, else the approved fingerprint-bound authority entry, else fail
  // closed). The generic role-compatible location_type pool is NOT consulted for the destination at all, so a blank live
  // FBA master coordinate can no longer masquerade as NO_ROLE_COMPATIBLE_DESTINATION_LOCATION. When `warehouses` is
  // absent (legacy V3A/V3B/V3C fixtures) the previous logistics-only binding is preserved verbatim.
  var destination, destAuthority = null;
  if (opts.warehouses && opts.warehouses.length) {
    destAuthority = DEMO4A_destAuthorityForTemplate_(template, opts.warehouses, locations, opts.coordAuthority, opts.company);
    var daReason = DEMO4A_destAuthorityReason_(destAuthority);
    if (daReason) return { ok: false, reason: daReason, destination_authority: destAuthority, evidence: evidence, corridor: Object.keys(corridor) };
    destination = DEMO4A_warehouseDestBinding_(destAuthority, n - 1, resolved[n - 1] && resolved[n - 1].node ? resolved[n - 1].node.node_type : '');
    evidence.destination = destination.evidence;
    if (destination.location_ref_id) used[destination.location_ref_id] = 1;
    used[DEMO4A_coordKey_(destination)] = 1;
  } else {
    destination = roleAt(n - 1, 'destination', { country: DEMO4A_str_(template.destination_country), region: DEMO4A_str_(template.destination_region) });
    if (!destination) return { ok: false, reason: 'NO_ROLE_COMPATIBLE_DESTINATION_LOCATION', evidence: evidence, corridor: Object.keys(corridor) };
  }
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
  return { ok: true, origin: origin, destination: destination, current: current, current_index: currentIndex, role_by_index: roleByIndex, evidence: evidence, corridor: Object.keys(corridor), transport_class: tclass, destination_authority: destAuthority };
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
  if (!bind.ok) return { eligible: false, reason: bind.reason, destination_authority: bind.destination_authority || null, resolved: resolved, canonicalCount: canonicalCount, directCount: directCount, abstractCount: abstractCount };
  return { eligible: true, reason: '', resolved: resolved, binding: bind, canonicalCount: canonicalCount, directCount: directCount, abstractCount: abstractCount };
}
// G — select ONE template per US West/Central/East (distinct) with valid Demo bindings; the PRIMARY in-transit must also
// bind a distinct current marker. Truthful FALLBACK_TRUTHFUL_TOP3 when W/C/E cannot all be built; fail closed (with exact
// per-reason rejection counts) when fewer than three status-valid Demo plans exist.
// V3G4 — opts = { warehouses, coordAuthority, company } makes the DESTINATION evaluation warehouse-aware for BOTH the
// eligibility pass and (through the returned binding) the final build. Omitting opts keeps the legacy logistics-only path.
function DEMO4A_selectTemplates_(templates, nodes, locations, opts) {
  opts = opts || {};
  var whOpts = { warehouses: opts.warehouses, coordAuthority: opts.coordAuthority, company: opts.company };
  var warehouseAware = !!(opts.warehouses && opts.warehouses.length);
  var byTpl = DEMO4A_nodesByTemplate_(nodes), idIndexes = DEMO4A_indexLocationsByIdentifiers_(locations);
  var qualified = [], rejections = {}, destAuthErrors = [];
  (templates || []).forEach(function (t) {
    var tid = DEMO4A_str_(t.route_template_id); if (!tid) return;
    var ns = byTpl[tid] || [];
    var el = DEMO4A_templateEligibility_(t, ns, locations, idIndexes, { warehouses: whOpts.warehouses, coordAuthority: whOpts.coordAuthority, company: whOpts.company });
    if (!el.eligible) {
      rejections[el.reason] = (rejections[el.reason] || 0) + 1;
      // D/F — compact per-template destination-authority evidence (first few only; never a full template/location dump).
      if (el.destination_authority && destAuthErrors.length < 6) { var da = el.destination_authority; destAuthErrors.push({ route_template_id: tid, region: DEMO4A_regionOf_(t), reason_code: el.reason, branch: DEMO4A_str_(da.branch), reason: DEMO4A_str_(da.reason || da.coordinate_unresolved_reason || ''), warehouse_id: DEMO4A_str_(da.warehouse_id), warehouse_code: DEMO4A_str_(da.warehouse_code), logistics_location_id: DEMO4A_str_(da.logistics_location_id), address_status: DEMO4A_str_(da.address_status), address_fingerprint: DEMO4A_str_(da.address_fingerprint) }); }
      return;
    }
    var elC = DEMO4A_templateEligibility_(t, ns, locations, idIndexes, { requireCurrent: true, warehouses: whOpts.warehouses, coordAuthority: whOpts.coordAuthority, company: whOpts.company });   // can this be the primary in-transit?
    qualified.push({ template: t, tid: tid, resolved: el.resolved, nodeCount: ns.length, binding: el.binding, currentCapable: elC.eligible, currentBinding: elC.eligible ? elC.binding : null,
      canonicalCount: el.canonicalCount, directCount: el.directCount, abstractCount: el.abstractCount, region: DEMO4A_regionOf_(t) });
  });
  var availableRegions = {}; qualified.forEach(function (q) { availableRegions[q.region] = (availableRegions[q.region] || 0) + 1; });
  var currentCapable = qualified.filter(function (q) { return q.currentCapable; });
  // D — when warehouse-aware evaluation rejected templates, report the MOST SPECIFIC truthful reason instead of the
  // generic plan-count reason: an identity/lineage failure is DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY, a coordinate
  // failure is DESTINATION_ADDRESS_COORDINATE_UNRESOLVED (armed) / ..._AUTHORITY_NOT_ARMED (unarmed).
  function specificReason(fallback) {
    if (!warehouseAware) return fallback;
    var keys = Object.keys(rejections).filter(function (k) { return rejections[k] > 0; });
    if (!keys.length) return fallback;
    if (keys.every(function (k) { return DEMO4A_DEST_AUTH_REASONS_[k]; })) {
      if (rejections.DESTINATION_WAREHOUSE_IDENTITY_UNRESOLVED || rejections.DESTINATION_WAREHOUSE_LOCATION_LINEAGE_UNRESOLVED) return 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY';
      return DEMO4A_coordAuthorityArmed_(whOpts.coordAuthority) ? 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED' : 'DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED';
    }
    // D — a single dominant non-destination cause (a truly unresolved ORIGIN or CURRENT marker) is reported as itself
    // rather than hidden behind the generic plan-count reason.
    if (keys.length === 1) return keys[0];
    return fallback;
  }
  if (qualified.length < 3 || !currentCapable.length) return { ok: false, reason: qualified.length < 3 ? specificReason('INSUFFICIENT_STATUS_VALID_DEMO_PLANS') : 'NO_PRIMARY_IN_TRANSIT_CANDIDATE', warehouse_aware_template_evaluation: warehouseAware, qualified_count: qualified.length, current_capable_count: currentCapable.length, available_regions: availableRegions, rejection_counts: rejections, destination_authority_errors: destAuthErrors };
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
  if (rest.length < 2) return { ok: false, reason: specificReason('INSUFFICIENT_STATUS_VALID_DEMO_PLANS'), warehouse_aware_template_evaluation: warehouseAware, qualified_count: qualified.length, current_capable_count: currentCapable.length, available_regions: availableRegions, rejection_counts: rejections, destination_authority_errors: destAuthErrors };
  return { ok: true, region_selection_mode: mode, warehouse_aware_template_evaluation: warehouseAware, qualified_count: qualified.length, current_capable_count: currentCapable.length, available_regions: availableRegions, rejection_counts: rejections, destination_authority_errors: destAuthErrors,
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
  if (roleByIndex && roleByIndex[i]) { var rb = roleByIndex[i]; return { binding_type: rb.source, location_ref_id: rb.location_ref_id, latitude: rb.latitude, longitude: rb.longitude, location_name: rb.location_name, country: rb.country, region: rb.region, city: rb.city, address_derived: !!rb.address_derived, coordinate_source: rb.coordinate_source || '' }; }
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
// V3G5A(G) — PURE SOURCE→DESTINATION WAREHOUSE LINEAGE GATE. The business SOURCE warehouse and the business DESTINATION
// warehouse are two distinct frozen authorities, and neither may ever be a geographic route/logistics-location id.
// True only when, for ALL three plans and their three shipments: both warehouse ids are non-blank; the shipment inherits
// its parent plan's source AND destination exactly; source ≠ destination; both resolve to an exact warehouses.warehouse_id
// when the warehouses master is present; the destination is the approved regional authority; no route logistics_location
// id has been substituted into a warehouse field; and no `shipments.warehouse_id` third authority exists.
// ================================================================================================================
var DEMO4A_APPROVED_REGION_DEST_ = { US_WEST: 'WH-KM-US-FBA-BFI4', US_CENTRAL: 'WH-KM-US-FBA-AUS2', US_EAST: 'WH-KM-US-FBA-ABE2' };
// ================================================================================================================
// V3G5B(A/B) - THE ONE DEMO SOURCE-WAREHOUSE RESOLVER. `shipment_route_templates.origin_warehouse_id` is an OPTIONAL
// specificity field (SHIPMENT_ROUTE_AND_EVENT_SPEC), so the live templates legitimately declare it BLANK - which is
// exactly why the physical source_warehouse_id came out empty. Precedence:
//   (1) TEMPLATE_EXACT_SOURCE_WAREHOUSE - a NON-BLANK declared id must resolve to an exact warehouses.warehouse_id and
//       pass every gate. A declared-but-invalid id NEVER falls through to the fallback: it fails closed.
//   (2) DEMO_DETERMINISTIC_FACTORY_FALLBACK - ONLY when the declared id is blank. Filter by is_factory_warehouse +
//       is_active + exact origin country - production's OWN company-agnostic canonical factory rule - with NO
//       is_shipping_enabled gate (V3G5C: the managed-overseas outbound capability, never evaluated for a factory) and
//       NO company / warehouse_owner gate (V3G5D: administrative attribution, never a usage permission) - then sort by
//       normalized warehouse_id ASCENDING and take the FIRST. Neither a false/blank is_shipping_enabled nor a differing
//       company ever rejects a factory. No Math.random, no row order, no coordinate requirement,
//       no logistics_location requirement, no fuzzy/name matching, no route/location id, no warehouse_code as an id,
//       no destination warehouse, no fabricated id. Empty candidate set -> NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE.
// The source warehouse is a BUSINESS identity; the origin route location stays a separate geographic binding.
// ================================================================================================================
function DEMO4A_sourceEvidence_(w, branch) {
  return { ok: true, selection_branch: branch, warehouse_id: DEMO4A_whId_(w), warehouse_code: DEMO4A_whCode_(w), warehouse_name: DEMO4A_whName_(w),
    company: DEMO4A_whCompany_(w), warehouse_owner: DEMO4A_whOwner_(w), country: DEMO4A_whCountry_(w), warehouse_type: DEMO4A_whType_(w),
    is_factory_warehouse: DEMO4A_whIsFactory_(w), is_active: DEMO4A_whActive_(w),
    // V3G5D(D/F) - the shared-factory policy marker. TRUE only on the deterministic fallback, which is the branch the
    // USER authorized to cross administrative company boundaries; a template-declared source needs no such policy.
    user_authorized_shared_factory_policy: branch === 'DEMO_DETERMINISTIC_FACTORY_FALLBACK',
    source_company_match_required: DEMO4A_SOURCE_COMPANY_MATCH_REQUIRED_,
    // V3G5C - published so an operator sees the corrected semantic without reading source: the Demo source rule applies
    // NO is_shipping_enabled gate (that flag is the managed-overseas outbound capability, never a factory authority).
    shipping_enabled_gate_applied: DEMO4A_SOURCE_SHIPPING_ENABLED_GATE_APPLIED_,
    // truthful marking: master identity is proven in BOTH branches (an exact warehouses row was matched), but only the
    // template's OWN declared authority is source-proven. A fallback is NEVER called source-proven.
    master_identity_proven: true, demo_fallback: branch === 'DEMO_DETERMINISTIC_FACTORY_FALLBACK', source_proven: branch === 'TEMPLATE_EXACT_SOURCE_WAREHOUSE' };
}
// V3G5C(H) - the compact, capped source-authority evidence published by BOTH read-only entrypoints. Pure: it only
// folds what the resolver already returned per slot. `shipping_enabled_gate_applied` is published as an explicit FALSE
// so an operator can confirm the corrected semantic from the log alone.
var DEMO4A_SOURCE_MAX_REJECTION_CODES_ = 5;
function DEMO4A_sourceAuthoritySummary_(sourceAuthority) {
  var slots = Object.keys(sourceAuthority || {}), counts = {}, cand = 0, branches = [], anyFallback = false;
  slots.forEach(function (k) {
    var r = (sourceAuthority || {})[k] || {};
    cand = Math.max(cand, DEMO4A_num_(r.candidate_count) || 0);
    if (r.selection_branch) branches.push(DEMO4A_str_(r.selection_branch));
    if (r.demo_fallback === true) anyFallback = true;
    Object.keys(r.rejection_counts || {}).forEach(function (c) { counts[c] = Math.max(counts[c] || 0, DEMO4A_num_(r.rejection_counts[c]) || 0); });
  });
  var capped = {}; Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, DEMO4A_SOURCE_MAX_REJECTION_CODES_).forEach(function (c) { capped[c] = counts[c]; });
  return { source_factory_candidate_count: cand, source_factory_rejection_counts: capped, source_factory_rejection_code_count: Object.keys(counts).length,
    source_selection_branches: branches.slice(0, 3), source_demo_fallback_used: anyFallback,
    source_shipping_enabled_gate_applied: DEMO4A_SOURCE_SHIPPING_ENABLED_GATE_APPLIED_,
    // V3G5D(F) - the shared-factory policy, published so an operator can confirm from the log alone that a differing
    // administrative company is EXPECTED evidence rather than a defect.
    source_factory_shared_across_companies: DEMO4A_SOURCE_FACTORY_SHARED_ACROSS_COMPANIES_,
    source_company_match_required: DEMO4A_SOURCE_COMPANY_MATCH_REQUIRED_,
    source_shared_factory_authorized: anyFallback ? true : null };
}
function DEMO4A_resolveDemoSourceWarehouse_(template, warehouses, company) {
  var tpl = template || {}, declared = DEMO4A_str_(tpl.origin_warehouse_id), originCountry = DEMO4A_str_(tpl.origin_country);
  var rows = warehouses || [];
  if (!rows.length) return { ok: false, reason: 'WAREHOUSES_MASTER_ABSENT', declared_warehouse_id: declared };
  if (declared) {
    var whById = {}; rows.forEach(function (w) { var id = DEMO4A_low_(DEMO4A_whId_(w)); if (id && whById[id] === undefined) whById[id] = w; });
    var w = whById[DEMO4A_low_(declared)];
    // a NON-BLANK declared id that is missing or conflicting fails CLOSED - it never silently falls through.
    if (!w) return { ok: false, reason: 'TEMPLATE_SOURCE_WAREHOUSE_INVALID', detail: 'DECLARED_SOURCE_WAREHOUSE_NOT_IN_MASTER', declared_warehouse_id: declared };
    if (!DEMO4A_whActive_(w)) return { ok: false, reason: 'TEMPLATE_SOURCE_WAREHOUSE_INVALID', detail: 'DECLARED_SOURCE_WAREHOUSE_INACTIVE', declared_warehouse_id: declared };
    // V3G5C(B) - NO shipping-capability gate, NO coordinate requirement, NO logistics_location join requirement, and NO
    // is_factory_warehouse requirement: the canonical shipment origin (`shipments.origin_warehouse_id`) may legitimately
    // be EITHER a factory (SHIPMENT_CENTER_SPEC B-1 factory_stock path) OR a managed overseas warehouse (Overseas
    // Outbound path), so production does NOT prove that a declared template source must always be a factory.
    if (originCountry && DEMO4A_whCountry_(w) && DEMO4A_low_(DEMO4A_whCountry_(w)) !== DEMO4A_low_(originCountry)) return { ok: false, reason: 'TEMPLATE_SOURCE_WAREHOUSE_INVALID', detail: 'DECLARED_SOURCE_WAREHOUSE_COUNTRY_MISMATCH', declared_warehouse_id: declared };
    // V3G5D(B) - NO company / warehouse_owner equality gate: both are administrative attribution, never an exclusive
    // usage permission (see the frozen shared-factory policy above). The mismatch is published as evidence instead.
    return DEMO4A_sourceEvidence_(w, 'TEMPLATE_EXACT_SOURCE_WAREHOUSE');
  }
  // (2) Demo-only deterministic factory fallback. A blank template origin_country cannot be matched exactly -> fail closed.
  if (!originCountry) return { ok: false, reason: 'NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE', detail: 'TEMPLATE_ORIGIN_COUNTRY_BLANK', declared_warehouse_id: '' };
  // V3G5C(B) - the eligibility conjunction is EXACTLY production's canonical factory rule (is_active AND
  // is_factory_warehouse - 03_master_data_handlers.gs / 13_procurement_handlers.gs / 43_api_v1_gap_materialization.gs)
  // plus the ONE Demo scope rule that still binds: the exact origin country. is_shipping_enabled is NOT consulted: it
  // is the managed-OVERSEAS outbound capability that production never evaluates for a factory (see the deleted
  // accessors above). Coordinates and logistics_location rows are NOT consulted either - business source identity is
  // separate from geographic route identity. Every rejection is COUNTED by typed reason so a live empty candidate set
  // names its exact cause instead of failing anonymously.
  var rejections = {};
  function rej(code) { rejections[code] = (rejections[code] || 0) + 1; return false; }
  var cands = rows.filter(function (w) {
    if (!DEMO4A_whId_(w)) return rej('WAREHOUSE_ID_BLANK');
    if (!DEMO4A_whIsFactory_(w)) return rej('NOT_A_FACTORY_WAREHOUSE');                                   // is_factory_warehouse = true
    if (!DEMO4A_whActive_(w)) return rej('INACTIVE');                                                     // is_active
    if (DEMO4A_low_(DEMO4A_whCountry_(w)) !== DEMO4A_low_(originCountry)) return rej('COUNTRY_NOT_TEMPLATE_ORIGIN_COUNTRY');   // EXACT origin country
    // V3G5D(B/F) - NO company, warehouse_owner, marketplace, is_shipping_enabled, coordinate, logistics-location or
    // warehouse-id-prefix filter. The eligibility conjunction is EXACTLY production's own company-agnostic factory rule
    // (is_factory_warehouse + is_active) plus the Demo route-geography constraint (exact origin country).
    return true;
  }).sort(function (a, b) { var ia = DEMO4A_low_(DEMO4A_whId_(a)), ib = DEMO4A_low_(DEMO4A_whId_(b)); return ia < ib ? -1 : (ia > ib ? 1 : 0); });
  if (!cands.length) return { ok: false, reason: 'NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE', detail: 'NO_ACTIVE_FACTORY_WAREHOUSE_IN_ORIGIN_COUNTRY:' + originCountry,
    declared_warehouse_id: '', candidate_count: 0, rejection_counts: rejections, evaluated_row_count: rows.length };
  var ev = DEMO4A_sourceEvidence_(cands[0], 'DEMO_DETERMINISTIC_FACTORY_FALLBACK');
  ev.candidate_count = cands.length;
  ev.rejection_counts = rejections;
  ev.evaluated_row_count = rows.length;
  return ev;
}
function DEMO4A_srcDestLineageGate_(plan, warehouses) {
  var reasons = [], plans = ((plan || {}).tables || {}).shipping_plans || [], ships = ((plan || {}).tables || {}).shipments || [];
  var whPresent = !!(warehouses && warehouses.length), whById = {};
  (warehouses || []).forEach(function (w) { var id = DEMO4A_low_(DEMO4A_whId_(w)); if (id) whById[id] = w; });
  var locIds = {};
  (((plan || {}).tables || {}).shipment_routes || []).forEach(function (r) { var l = DEMO4A_str_(r.location_ref_id); if (l) locIds[DEMO4A_low_(l)] = 1; });
  var perByShip = {}; (((plan || {}).per_shipment) || []).forEach(function (x) { perByShip[DEMO4A_str_(x.shipment_id)] = x; });
  var planById = {}; plans.forEach(function (pl) { planById[DEMO4A_str_(pl.shipping_plan_id)] = pl; });
  if (plans.length !== 3 || ships.length !== 3) reasons.push('EXPECTED_THREE_PLANS_AND_THREE_SHIPMENTS');
  plans.forEach(function (pl) {
    if (!DEMO4A_str_(pl.source_warehouse_id)) reasons.push('PLAN_SOURCE_WAREHOUSE_BLANK:' + DEMO4A_str_(pl.shipping_plan_id));
    if (!DEMO4A_str_(pl.destination_warehouse_id)) reasons.push('PLAN_DESTINATION_WAREHOUSE_BLANK:' + DEMO4A_str_(pl.shipping_plan_id));
  });
  ships.forEach(function (sh) {
    var sid = DEMO4A_str_(sh.shipment_id), src = DEMO4A_str_(sh.source_warehouse_id), dst = DEMO4A_str_(sh.destination_warehouse_id);
    if (Object.prototype.hasOwnProperty.call(sh, 'warehouse_id')) reasons.push('THIRD_WAREHOUSE_AUTHORITY_PRESENT:' + sid);
    if (!src) reasons.push('SHIPMENT_SOURCE_WAREHOUSE_BLANK:' + sid);
    if (!dst) reasons.push('SHIPMENT_DESTINATION_WAREHOUSE_BLANK:' + sid);
    if (src && dst && DEMO4A_low_(src) === DEMO4A_low_(dst)) reasons.push('SOURCE_EQUALS_DESTINATION:' + sid);
    var pl = planById[DEMO4A_str_(sh.shipping_plan_id)];
    if (!pl) reasons.push('PARENT_PLAN_MISSING:' + sid);
    else {
      if (DEMO4A_low_(src) !== DEMO4A_low_(DEMO4A_str_(pl.source_warehouse_id))) reasons.push('SOURCE_NOT_INHERITED_FROM_PLAN:' + sid);
      if (DEMO4A_low_(dst) !== DEMO4A_low_(DEMO4A_str_(pl.destination_warehouse_id))) reasons.push('DESTINATION_NOT_INHERITED_FROM_PLAN:' + sid);
    }
    if (whPresent) {
      if (src && !whById[DEMO4A_low_(src)]) reasons.push('SOURCE_WAREHOUSE_NOT_IN_MASTER:' + src);
      if (dst && !whById[DEMO4A_low_(dst)]) reasons.push('DESTINATION_WAREHOUSE_NOT_IN_MASTER:' + dst);
    }
    // a geographic route/logistics-location id must NEVER appear in a warehouse identity field
    if (src && locIds[DEMO4A_low_(src)]) reasons.push('SOURCE_IS_A_ROUTE_LOCATION_ID:' + src);
    if (dst && locIds[DEMO4A_low_(dst)]) reasons.push('DESTINATION_IS_A_ROUTE_LOCATION_ID:' + dst);
    var ps = perByShip[sid], region = ps ? DEMO4A_str_(ps.region) : '';
    // V3G5B(C) - the business source country must equal the selected route template's origin country exactly.
    if (ps && DEMO4A_str_(ps.template_origin_country) && DEMO4A_str_(ps.source_warehouse_country) && DEMO4A_low_(ps.source_warehouse_country) !== DEMO4A_low_(ps.template_origin_country)) reasons.push('SOURCE_COUNTRY_NOT_TEMPLATE_ORIGIN_COUNTRY:' + sid);
    // V3G5B(E) - warehouse_code, when written, is the DESTINATION warehouse-code snapshot and nothing else.
    if (Object.prototype.hasOwnProperty.call(sh, 'warehouse_code') && ps) {
      var wcode = DEMO4A_str_(sh.warehouse_code), expectCode = DEMO4A_str_(ps.destination_warehouse_code);
      if (expectCode && DEMO4A_low_(wcode) !== DEMO4A_low_(expectCode)) reasons.push('WAREHOUSE_CODE_NOT_DESTINATION_SNAPSHOT:' + sid);
      if (wcode && DEMO4A_low_(wcode) === DEMO4A_low_(dst)) reasons.push('WAREHOUSE_CODE_WRITTEN_AS_WAREHOUSE_ID:' + sid);
    }
    // the approved REGIONAL destination authority is only binding while the warehouse authority itself is active
    // (legacy logistics-only fixtures without a warehouses master keep their own template destination).
    var approved = whPresent ? DEMO4A_APPROVED_REGION_DEST_[region] : null;
    if (approved && dst && DEMO4A_low_(dst) !== DEMO4A_low_(approved)) reasons.push('DESTINATION_NOT_APPROVED_FOR_REGION:' + region + ':' + dst);
    if (ps && DEMO4A_str_(ps.destination_logistics_location_id) && DEMO4A_low_(ps.destination_logistics_location_id) === DEMO4A_low_(dst)) reasons.push('DESTINATION_LOGISTICS_LOCATION_WRITTEN_AS_WAREHOUSE:' + sid);
  });
  var uniq = {}; reasons.forEach(function (r) { uniq[r] = 1; });
  var list = Object.keys(uniq);
  var pers = ((plan || {}).per_shipment) || [];
  return { source_destination_warehouse_lineage_ready: list.length === 0, reasons: list.slice(0, 8), reason_count: list.length,
    source_warehouse_ids: ships.map(function (x) { return DEMO4A_str_(x.source_warehouse_id); }), destination_warehouse_ids: ships.map(function (x) { return DEMO4A_str_(x.destination_warehouse_id); }),
    source_warehouse_codes: pers.map(function (x) { return DEMO4A_str_(x.source_warehouse_code); }), destination_warehouse_codes: pers.map(function (x) { return DEMO4A_str_(x.destination_warehouse_code); }),
    source_selection_branches: pers.map(function (x) { return DEMO4A_str_(x.source_selection_branch); }),
    // V3G5D(F) - administrative attribution travels with the lineage as EVIDENCE. It is deliberately NOT a gate input:
    // no reason code above can be produced by a company or warehouse_owner mismatch on the SOURCE factory.
    source_warehouse_companies: pers.map(function (x) { return DEMO4A_str_(x.source_warehouse_company); }),
    source_warehouse_owners: pers.map(function (x) { return DEMO4A_str_(x.source_warehouse_owner); }) };
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
  // V3G1(F) — compute warehouse presence + coordinate-authority armed status FIRST, so even an early template-selection
  // failure can be truthfully reinterpreted (an unarmed authority manifests as template insufficiency when live FBA coords
  // are blank; PREFLIGHT reports DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED rather than the misleading count reason).
  var warehousesPresent = !!(masters.warehouses && masters.warehouses.length);
  var coordAuthority = masters.destCoordAuthority || DEMO4A_DEST_COORD_AUTHORITY_;
  var coordAuthorityArmed = DEMO4A_coordAuthorityArmed_(coordAuthority);
  // V3G4(B) — the destination company gate must be the SAME value for eligibility and build (scope resolution needs a
  // destination country that only the chosen template can supply, so the company comes from one explicit input and is
  // re-verified against the resolved scope below; a mismatch fails closed instead of diverging).
  var destCompany = DEMO4A_str_(masters.company) || DEMO4A_DEFAULT_COMPANY_;
  var sel = DEMO4A_selectTemplates_(masters.templates, masters.nodes, masters.locations, warehousesPresent ? { warehouses: masters.warehouses, coordAuthority: coordAuthority, company: destCompany } : {});
  if (!sel.ok) { sel.warehouses_present = warehousesPresent; sel.coord_authority_armed = coordAuthorityArmed; return sel; }
  var itPick = sel._assignRaw.in_transit;
  var destCountry = DEMO4A_str_((itPick.template || {}).destination_country) || DEMO4A_str_(itPick.currentBinding.destination.country) || 'US';
  var scope = DEMO4A_resolveScopeAndSkus_(masters.marketplaceSkus, masters.skuDetails, destCountry);
  if (!scope.ok) return scope;
  if (warehousesPresent && scope.company && DEMO4A_low_(scope.company) !== DEMO4A_low_(destCompany)) return { ok: false, reason: 'DESTINATION_WAREHOUSE_SCOPE_COMPANY_MISMATCH', scope_company: scope.company, evaluated_company: destCompany, warehouses_present: warehousesPresent, coord_authority_armed: coordAuthorityArmed };

  // V3G — DESTINATION-WAREHOUSE AUTHORITY GATE (supersedes V3F's coordinate-mandatory gate). Active ONLY when the
  // `warehouses` master is present (legacy fixtures without it keep the logistics-only binding). The real FBA/3PL warehouse
  // is the BUSINESS destination (warehouse_id + warehouse_code + eligible + resolvable ADDRESS); a blank master coordinate
  // NEVER invalidates it. Coordinate precedence: (1) valid warehouse-linked logistics_locations coordinate; (2) a REVIEWED,
  // source-bound, address-fingerprint-matched Demo coordinate; else a same-region eligible reselection; else fail closed
  // (DESTINATION_ADDRESS_COORDINATE_UNRESOLVED — identity ready, no display coordinate). Identity/eligibility/scope failures
  // fail closed as DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY. NO fabricated coordinate, NO received-at-FBA unless a facility-
  // grade coordinate is truthfully reached. A seaport gateway is NEVER relabelled the FBA.
  var destAuthority = {};
  var READY_BRANCHES_ = DEMO4A_DEST_READY_BRANCHES_;
  if (warehousesPresent) {
    var identityErrors = [], coordinateErrors = [];
    DEMO4A_SHIP_LIFECYCLE_.forEach(function (life) {
      var pick = sel._assignRaw[life.slot];
      // V3G4(B) — CONSUME the destination authority already computed by the SHARED evaluator during eligibility. The plan
      // is built from exactly the evaluation that qualified the template; nothing is re-resolved by a second rule.
      var usedBinding = (life.slot === 'in_transit') ? (pick.currentBinding || pick.binding) : pick.binding;
      var r = (usedBinding && usedBinding.destination_authority) ? usedBinding.destination_authority
        : DEMO4A_destAuthorityForTemplate_(pick.template, masters.warehouses, masters.locations, coordAuthority, destCompany);
      destAuthority[life.slot] = r;
      if (!r.identity_ready) identityErrors.push({ slot: life.slot, branch: r.branch, reason: r.reason || '', warehouse_id: DEMO4A_str_(r.warehouse_id) });
      else if (!READY_BRANCHES_[r.branch]) coordinateErrors.push({ slot: life.slot, branch: r.branch, reason: r.reason || r.coordinate_unresolved_reason || 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', warehouse_id: DEMO4A_str_(r.warehouse_id) });
    });
    if (identityErrors.length) return { ok: false, reason: 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', destination_authority_errors: identityErrors.concat(coordinateErrors), destination_authority: destAuthority, warehouses_present: warehousesPresent, coord_authority_armed: coordAuthorityArmed };
    if (coordinateErrors.length) {
      // V3G1(F) — distinguish an UNARMED coordinate authority (no reviewed coordinates loaded at all) from an armed-but-
      // stale/invalid one. Unarmed → DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED (the operator has not yet reviewed
      // + loaded coordinates); armed-but-unresolvable → DESTINATION_ADDRESS_COORDINATE_UNRESOLVED (stale/missing fingerprint).
      return { ok: false, reason: coordAuthorityArmed ? 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED' : 'DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED', destination_authority_errors: coordinateErrors, destination_authority: destAuthority, warehouses_present: warehousesPresent, coord_authority_armed: coordAuthorityArmed };
    }
  }

  // V3G5B(A/B) - DEMO SOURCE-WAREHOUSE AUTHORITY. Resolved ONCE per slot by the single shared resolver, BEFORE any row is
  // constructed, so eligibility evidence and the physical rows can never diverge. Any slot that cannot resolve an exact
  // master warehouse identity fails the whole plan closed - no id is ever guessed, substituted or fabricated.
  var sourceAuthority = {};
  if (warehousesPresent) {
    var sourceErrors = [];
    DEMO4A_SHIP_LIFECYCLE_.forEach(function (life) {
      var sPick = sel._assignRaw[life.slot];
      var sres = DEMO4A_resolveDemoSourceWarehouse_(sPick.template, masters.warehouses, destCompany);
      sourceAuthority[life.slot] = sres;
      if (!sres.ok) sourceErrors.push({ slot: life.slot, reason: DEMO4A_str_(sres.reason), detail: DEMO4A_str_(sres.detail || ''), declared_warehouse_id: DEMO4A_str_(sres.declared_warehouse_id || '') });
    });
    if (sourceErrors.length) return { ok: false, reason: 'DEMO_SOURCE_WAREHOUSE_AUTHORITY_NOT_READY', source_authority_errors: sourceErrors, source_authority: sourceAuthority,
      source_authority_summary: DEMO4A_sourceAuthoritySummary_(sourceAuthority),
      destination_authority: destAuthority, warehouses_present: warehousesPresent, coord_authority_armed: coordAuthorityArmed };
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
    // V3G — when the warehouse authority is active + a display coordinate is READY (logistics OR address-derived), the
    // FINAL DESTINATION marker IS the real FBA/3PL facility (D): override the last-node binding with the resolved facility
    // coordinate. location_ref lineage = the exact logistics_location_id WHEN the join exists (else blank — an address-
    // derived-only destination has no logistics row but keeps its warehouse identity). Route lat/lng = master coordinate if
    // present, else the approved Demo address-derived coordinate. Both identities + the coordinate source are preserved. A
    // gateway (seaport/airport) is NEVER relabelled the FBA. For the in-transit slot the destination node stays 'planned'
    // (no event) — the address-derived facility coordinate can populate that future node without a received event.
    var da = warehousesPresent ? destAuthority[life.slot] : null;
    var daReady = da && (da.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY' || da.branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE');
    if (daReady) {
      var derived = da.branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE';
      var destIdx = resolved.length - 1;
      var whBind = { source: 'WAREHOUSE_LOCATION_BINDING', node_index: destIdx, region_exact: true, location_ref_id: DEMO4A_str_(da.logistics_location_id),
        latitude: da.latitude, longitude: da.longitude, location_name: DEMO4A_str_(da.logistics_location_id) || DEMO4A_str_(da.warehouse_id), country: da.country, region: da.region, city: '',
        canon_type: da.location_type || 'warehouse', location_type: da.location_type || 'warehouse', source_proven: true, role_compatible: true, corridor_compatible: true,
        warehouse_id: da.warehouse_id, warehouse_code: da.warehouse_code, verification_status: da.verification_status,
        coordinate_source: da.coordinate_source, coordinate_accuracy: da.coordinate_accuracy || '', coordinate_source_reference: da.coordinate_source_reference || '', address_derived: derived };
      binding.destination = whBind; roleByIndex[destIdx] = whBind;
      if (binding.evidence) binding.evidence.destination = { role: 'destination', location_id: DEMO4A_str_(da.logistics_location_id), warehouse_id: da.warehouse_id, warehouse_code: da.warehouse_code, country: da.country, region: da.region, location_type: da.location_type || 'warehouse', canon_location_type: da.location_type || 'warehouse', node_type: DEMO4A_str_(resolved[destIdx].node.node_type), binding_type: 'WAREHOUSE_LOCATION_BINDING', coordinate_source: da.coordinate_source, coordinate_accuracy: da.coordinate_accuracy || '', address_derived: derived, source_proven: true, role_compatible: true, corridor_compatible: true };
    }
    var originCountry = DEMO4A_str_(tpl.origin_country) || DEMO4A_str_(binding.origin.country) || 'CN';
    var destRegion = DEMO4A_str_(tpl.destination_region) || DEMO4A_str_(binding.destination.region) || pick.region;
    // V3G5B(C) - SOURCE: the single resolver's selection (exact template authority, else the deterministic Demo factory
    // fallback). Legacy fixtures without a `warehouses` master keep the template's own declared id verbatim.
    // V3G5B(D) - DESTINATION: the ALREADY-RESOLVED shared destination authority (`da`) - the destination is NEVER
    // re-resolved by a second rule here. The template's optional declared id is used ONLY on the legacy no-master path.
    var srcSel = warehousesPresent ? (sourceAuthority[life.slot] || {}) : null;
    var srcWh = srcSel ? DEMO4A_str_(srcSel.warehouse_id) : DEMO4A_str_(tpl.origin_warehouse_id);
    var destWh = da ? DEMO4A_str_(da.warehouse_id) : DEMO4A_str_(tpl.destination_warehouse_id);
    // V3G5B(E) - shipments.warehouse_code is the DESTINATION warehouse-code snapshot (SHIPMENT_CENTER_SPEC: "destination
    // display / external-code snapshot - never an identity"; the Picker copies warehouses.warehouse_code onto it). It is
    // written as a display snapshot ONLY, is never used as a foreign key, and no column is added (it is already the
    // deployed SHIPMENTS_HEADERS_ column immediately after source_warehouse_id).
    var destWhCode = da ? DEMO4A_str_(da.warehouse_code) : '';
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

    // V3G5A(A/C/F) — FROZEN warehouse semantics on the intended physical shipment row:
    //   source_warehouse_id      = the business ORIGIN warehouse identity, inherited verbatim from the parent shipping
    //                              plan (both come from the selected route template's origin_warehouse_id).
    //   destination_warehouse_id = the business FINAL DESTINATION warehouse identity (the approved regional authority).
    // REMOVED `warehouse_id`: the audit proved it was assigned the SAME `destWh` variable as destination_warehouse_id —
    // an exact DUPLICATE of the destination identity (CASE B), not a source identity — and it is not a deployed physical
    // column, so the writer silently dropped it and the readback classified CONTENT_DRIFT. Nothing was lost by removing
    // it and no third ambiguous warehouse authority is introduced.
    // REMOVED `updated_by`: also not a deployed physical column. The physical audit fields created_by / created_at /
    // updated_at are preserved. `warehouse_code` is NOT added — the intended row never carried it, so there is no
    // existing production meaning for this tool to preserve or redefine.
    tables.shipments.push({ shipment_id: shipId, shipment_no: 'DEMO-SHIP-' + idx, shipping_plan_id: planId,
      source_warehouse_id: srcWh, warehouse_code: destWhCode, company: scope.company, country: scope.country, marketplace: scope.marketplace,
      ship_from: originCountry, destination: destRegion || scope.country, destination_warehouse_id: destWh, destination_type: 'warehouse',
      carrier_id: carrier, shipping_method: method, last_mile_delivery: lastMile, status: life.status,
      etd: life.etd, eta: life.eta, actual_departure_date: life.etd, actual_arrival_date: life.delivered_date, delivered_date: life.delivered_date,
      shipment_total_qty: shipTotalQty, currency: 'USD', note: DEMO4A_TAG_, created_by: DEMO4A_ACTOR_, created_at: DEMO4A_CREATED_AT_, updated_at: DEMO4A_CREATED_AT_ });
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
    // V3G(H) — bind the FULL destination authority into the checksum: warehouse_id + warehouse_code + logistics_location_id
    // + normalized-address fingerprint + coordinate branch + derived lat/lng + coordinate source reference + accuracy +
    // location_type + verification_status + the final status decision. Any change to address/coordinate/source re-checksums.
    // V3G5B(J) - bind the FULL source-warehouse evidence into the checksum: identity + code + name + company + country +
    // type + factory flag + the SELECTION BRANCH + the truthful proven/fallback marking. Changing the source lineage or
    // the branch that produced it re-checksums the plan.
    // V3G5D(D) - the manifest additionally binds warehouse_owner, is_active and the shared-factory policy marker, so a
    // change of administrative attribution or of the policy itself re-checksums the plan.
    if (srcSel) bindingManifest.push(['WHSRC', shipId, DEMO4A_str_(srcSel.warehouse_id), DEMO4A_str_(srcSel.warehouse_code), DEMO4A_str_(srcSel.warehouse_name), DEMO4A_str_(srcSel.company), DEMO4A_str_(srcSel.warehouse_owner), DEMO4A_str_(srcSel.country), DEMO4A_str_(srcSel.warehouse_type), (srcSel.is_factory_warehouse === true ? '1' : '0'), (srcSel.is_active === true ? '1' : '0'), DEMO4A_str_(srcSel.selection_branch), (srcSel.source_proven === true ? '1' : '0'), (srcSel.demo_fallback === true ? '1' : '0'), (srcSel.user_authorized_shared_factory_policy === true ? '1' : '0')].join('~'));
    if (da) bindingManifest.push(['WHDEST', shipId, DEMO4A_str_(da.warehouse_id), DEMO4A_str_(da.warehouse_code), DEMO4A_str_(da.logistics_location_id), DEMO4A_str_(da.address_fingerprint), DEMO4A_str_(da.branch), DEMO4A_str_(da.location_type), DEMO4A_str_(da.verification_status), DEMO4A_str_(da.coordinate_source || ''), DEMO4A_str_(da.coordinate_source_reference || ''), DEMO4A_str_(da.coordinate_accuracy || ''), DEMO4A_num_(da.latitude), DEMO4A_num_(da.longitude), DEMO4A_str_(life.status)].join('~'));

    var routeIdOf = function (ni) { return P + 'SR-' + idx + '-' + DEMO4A_z2_(ni + 1); };
    var evs = DEMO4A_lifecycleEvents_(life.slot, roleByIndex, resolved, currentIndex, life.event_end, life.event_step);
    evs.forEach(function (e, ei) {
      tables.shipment_events.push({ shipment_event_id: P + 'SE-' + idx + '-' + DEMO4A_z2_(ei + 1), shipment_id: shipId, shipment_route_id: routeIdOf(e.nodeIndex),
        event_sequence: ei + 1, event_time: e.event_time, event_type: e.event_type, event_status: e.event_status,
        location_name: e.binding.location_name, country: e.binding.country, city: e.binding.city, latitude: e.binding.latitude, longitude: e.binding.longitude,
        source: DEMO4A_SOURCE_, source_event_id: P + 'SE-' + idx + '-' + DEMO4A_z2_(ei + 1), raw_status: e.event_status,
        note: DEMO4A_TAG_ + (e.binding.binding_type === 'DEMO_SYNTHETIC_RUNTIME_BINDING' ? ' · DEMO-4A-SYNTHETIC-RUNTIME-BINDING' : '') + (e.binding.address_derived ? ' · DEMO-4A-ADDRESS-DERIVED-DESTINATION-COORDINATE' : ''),
        created_by: DEMO4A_ACTOR_, created_at: DEMO4A_CREATED_AT_, updated_by: DEMO4A_ACTOR_, updated_at: DEMO4A_CREATED_AT_ });
      // G — explicit route.planned_event_type → canonical recorded event_type mapping (NEVER conflated)
      eventMap.push({ shipment_id: shipId, sequence_no: DEMO4A_str_(resolved[e.nodeIndex].node.node_sequence), route_planned_event_type: e.planned_event_type || '(none)', recorded_event_type: e.event_type, recorded_event_status: e.event_status });
    });

    per_shipment.push({ shipment_id: shipId, slot: life.slot, status: life.status, template: pick.tid, region: pick.region, nodes: nodeCount,
      canonical_binding_count: canonicalCount, direct_coordinate_count: directCount, demo_synthetic_binding_count: syntheticCount, abstract_rows: abstractRowCount,
      route_rows: nodeCount, event_rows: evs.length, source_warehouse_id: srcWh,
      source_warehouse_code: srcSel ? DEMO4A_str_(srcSel.warehouse_code) : '', source_warehouse_name: srcSel ? DEMO4A_str_(srcSel.warehouse_name) : '',
      source_warehouse_country: srcSel ? DEMO4A_str_(srcSel.country) : '', source_warehouse_type: srcSel ? DEMO4A_str_(srcSel.warehouse_type) : '',
      source_selection_branch: srcSel ? DEMO4A_str_(srcSel.selection_branch) : 'TEMPLATE_DECLARED_NO_WAREHOUSE_MASTER',
      // V3G5D(F) - a company/owner mismatch is VISIBLE evidence, never a block. source_company_match reports the plain
      // fact; source_company_match_required is FALSE; source_shared_factory_authorized records the frozen user policy.
      source_warehouse_company: srcSel ? DEMO4A_str_(srcSel.company) : '', source_warehouse_owner: srcSel ? DEMO4A_str_(srcSel.warehouse_owner) : '',
      shipment_company: DEMO4A_str_(scope.company),
      source_company_match: srcSel ? (DEMO4A_low_(DEMO4A_str_(srcSel.company)) === DEMO4A_low_(DEMO4A_str_(scope.company))) : null,
      source_company_match_required: DEMO4A_SOURCE_COMPANY_MATCH_REQUIRED_,
      source_shared_factory_authorized: srcSel ? srcSel.user_authorized_shared_factory_policy === true : false,
      source_master_identity_proven: srcSel ? srcSel.master_identity_proven === true : false, source_demo_fallback: srcSel ? srcSel.demo_fallback === true : false,
      source_proven: srcSel ? srcSel.source_proven === true : false, source_is_factory_warehouse: srcSel ? srcSel.is_factory_warehouse === true : false,
      template_origin_country: DEMO4A_str_(tpl.origin_country), destination_warehouse_code_snapshot: destWhCode,
      origin_location_id: DEMO4A_str_(binding.origin.location_ref_id), current_location_id: binding.current ? DEMO4A_str_(binding.current.location_ref_id) : '', destination_location_id: DEMO4A_str_(binding.destination.location_ref_id),
      plan_lines: lineCount, shipment_lines: lineCount,
      transport_class: DEMO4A_str_(binding.transport_class || DEMO4A_transportClass_(method)),
      destination_warehouse_id: da ? DEMO4A_str_(da.warehouse_id) : destWh, destination_warehouse_code: da ? DEMO4A_str_(da.warehouse_code) : '', destination_logistics_location_id: da ? DEMO4A_str_(da.logistics_location_id) : DEMO4A_str_(binding.destination.location_ref_id),
      destination_coordinate_branch: da ? da.branch : 'LOGISTICS_ONLY_BINDING', destination_facility_marker_renderable: da ? !!da.renderable : true, destination_verification_status: da ? DEMO4A_str_(da.verification_status) : '',
      destination_address_status: da ? DEMO4A_str_(da.address_status || '') : '', destination_address_fingerprint: da ? DEMO4A_str_(da.address_fingerprint || '') : '',
      destination_coordinate_source: da ? DEMO4A_str_(da.coordinate_source || '') : '', destination_coordinate_source_reference: da ? DEMO4A_str_(da.coordinate_source_reference || '') : '', destination_coordinate_accuracy: da ? DEMO4A_str_(da.coordinate_accuracy || '') : '', destination_reselected_from_warehouse_id: da ? DEMO4A_str_(da.reselected_from_warehouse_id || '') : '',
      binding_evidence: { origin: binding.evidence ? binding.evidence.origin : null, current: binding.evidence ? binding.evidence.current : null, destination: binding.evidence ? binding.evidence.destination : null } });

    var onMap = DEMO4A_mapVisible_(life.status, evs.length, nodeCount);
    if (onMap) { var last = evs[evs.length - 1]; var mapRec = { shipment_id: shipId, status: life.status, moving: DEMO4A_mapMoving_(life.status), delivered: DEMO4A_mapDelivered_(life.status), current_node_sequence: DEMO4A_str_(resolved[currentIndex].node.node_sequence), latest_event: last.event_type, latest_event_time: last.event_time, marker_lat: last.binding.latitude, marker_lng: last.binding.longitude, carrier_id: carrier, transit_method: method, eta: life.eta }; visibility.on_the_way_map.push(mapRec); if (life.slot === 'in_transit') visibility.primary_map_record = mapRec; }
  });

  var counts = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { counts[t] = tables[t].length; });
  counts.total = DEMO4A_WRITE_ORDER_.reduce(function (a, t) { return a + tables[t].length; }, 0);
  var binding_gates = DEMO4A_bindingGates_(per_shipment);
  // V3G5A(G) — the source→destination warehouse lineage gate is part of the HARD binding-gate conjunction, so a broken
  // lineage can never reach READY, DRY_RUN authorization, COMMIT, VALIDATE or an exact REUSED classification.
  var sdl = DEMO4A_srcDestLineageGate_({ tables: tables, per_shipment: per_shipment }, masters.warehouses);
  binding_gates.source_destination_warehouse_lineage_ready = sdl.source_destination_warehouse_lineage_ready;
  binding_gates.source_destination_warehouse_lineage_reasons = sdl.reasons;
  binding_gates.ok = binding_gates.ok && sdl.source_destination_warehouse_lineage_ready;
  return { ok: true, checksum: DEMO4A_checksum_(tables, bindingManifest), tables: tables, counts: counts, per_shipment: per_shipment, visibility: visibility, binding_gates: binding_gates,
    source_destination_warehouse_lineage: sdl,
    scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku_pairs: scope.pairs },
    region_selection_mode: sel.region_selection_mode, available_regions: sel.available_regions, rejection_counts: sel.rejection_counts, chosen_templates: sel.chosen,
    // V3G4(F) — warehouse-aware evaluation facts, so PREFLIGHT can confirm WHICH destination rule qualified the templates.
    warehouse_aware_template_evaluation: sel.warehouse_aware_template_evaluation === true, qualified_count: sel.qualified_count, current_capable_count: sel.current_capable_count, destination_authority_errors: sel.destination_authority_errors || [],
    warehouses_present: warehousesPresent, destination_authority: destAuthority, source_authority: sourceAuthority,
    source_authority_summary: DEMO4A_sourceAuthoritySummary_(sourceAuthority),
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
    if (hasRef && locById) { var loc = locById[DEMO4A_str_(r.location_ref_id)];
      // V3G — a DEMO_ADDRESS_DERIVED destination row references its logistics_location for LINEAGE but carries the reviewed
      // address-derived coordinate inline (the master coord is blank). Allow: master loc exists + blank master coord + valid
      // row coord = the derived destination (verified separately against plan.destination_authority below). A master row WITH
      // a valid coordinate must still match exactly.
      if (!loc) { boundOk = false; boundBad.push('missing_master_loc:' + r.shipment_route_id); }
      else if (DEMO4A_validCoord_(loc.latitude, loc.longitude)) { if (ck(loc.latitude, loc.longitude) !== ck(r.latitude, r.longitude)) { boundOk = false; boundBad.push('coord≠master:' + r.shipment_route_id); } }
      else if (!DEMO4A_validCoord_(r.latitude, r.longitude)) { boundOk = false; boundBad.push('derived_dest_coord_invalid:' + r.shipment_route_id); }   // blank master → row must carry a valid derived coord
    }
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

  // V3G(H) — DESTINATION AUTHORITY: the LIVE destination route row (and, for a received shipment, its final event) matches
  // the approved plan.destination_authority — same warehouse identity, exact logistics lineage when a join exists, route
  // coordinate == the approved (master or address-derived) coordinate, and received ends at the real destination warehouse.
  var daOk = true, daBad = [], daChecked = false;
  var perByShip = {}; (plan.per_shipment || []).forEach(function (s) { perByShip[DEMO4A_str_(s.shipment_id)] = s; });
  demoRows('shipments').forEach(function (sh) {
    var sid = DEMO4A_str_(sh.shipment_id), ps = perByShip[sid]; if (!ps || !ps.destination_warehouse_id) return;
    daChecked = true;
    var rr = demoRows('shipment_routes').filter(function (r) { return DEMO4A_str_(r.shipment_id) === sid; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); });
    var destRow = rr[rr.length - 1];
    if (!destRow) { daOk = false; daBad.push('no_dest_row:' + sid); return; }
    // route coordinate == approved coordinate (the plan's expected destination row carries the resolved coordinate)
    var expDestRow = (plan.tables.shipment_routes || []).filter(function (r) { return DEMO4A_str_(r.shipment_id) === sid; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); }).pop();
    if (expDestRow && (DEMO4A_str_(expDestRow.latitude) !== '' ) && ck(expDestRow.latitude, expDestRow.longitude) !== ck(destRow.latitude, destRow.longitude)) { daOk = false; daBad.push('dest_coord≠approved:' + sid); }
    // exact logistics lineage when a join exists on the approved authority
    if (DEMO4A_str_(ps.destination_logistics_location_id) && DEMO4A_str_(destRow.location_ref_id) && DEMO4A_str_(destRow.location_ref_id) !== DEMO4A_str_(ps.destination_logistics_location_id)) { daOk = false; daBad.push('dest_lineage≠authority:' + sid); }
    // received shipment ends at the real destination warehouse (final event on the destination row, coord == dest row)
    if (DEMO4A_low_(sh.status) === 'received') {
      var evs2 = demoRows('shipment_events').filter(function (e) { return DEMO4A_str_(e.shipment_id) === sid; }).sort(function (a, b) { return DEMO4A_num_(a.event_sequence) - DEMO4A_num_(b.event_sequence); });
      var lastEv = evs2[evs2.length - 1];
      if (!lastEv || DEMO4A_low_(lastEv.event_type) !== 'received') { daOk = false; daBad.push('received_not_final:' + sid); }
      else if (DEMO4A_str_(lastEv.shipment_route_id) !== DEMO4A_str_(destRow.shipment_route_id)) { daOk = false; daBad.push('received_not_at_dest_row:' + sid); }
      else if (ck(lastEv.latitude, lastEv.longitude) !== ck(destRow.latitude, destRow.longitude)) { daOk = false; daBad.push('received_coord≠dest:' + sid); }
    }
  });
  checks.live_destination_authority = { ok: daOk, checked: daChecked, bad: daBad.slice(0, 10) };

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
// ================================================================================================================
// V3G5(A/B) — PRE-WRITE WRITER-PROJECTION GATE (pure). DEMO4A_rowForHeaders_ projects an intended row onto the LIVE
// physical headers, so an intended field with NO physical column is silently dropped and then reads back blank →
// CONTENT_DRIFT after a technically successful round trip. This proves, BEFORE any write, that every field the writer
// intends to persist has a real physical column. Fields the writer does NOT own are irrelevant: the comparison only ever
// uses Object.keys(intendedRow), so extra live physical columns are ignored by contract (reported, never compared).
// ================================================================================================================
function DEMO4A_writerProjectionGaps_(plan, headersByTable) {
  var perTable = {}, missing = [], extraCounts = {}, intendedTotal = 0;
  DEMO4A_WRITE_ORDER_.forEach(function (name) {
    var headers = (headersByTable || {})[name] || [];
    var hset = {}; headers.forEach(function (h) { var k = DEMO4A_str_(h); if (k) hset[k] = 1; });
    var seen = {};
    ((plan.tables || {})[name] || []).forEach(function (r) { Object.keys(r).forEach(function (k) { seen[k] = 1; }); });
    var intended = Object.keys(seen); intendedTotal += intended.length;
    var miss = intended.filter(function (k) { return !hset[k]; });
    var extra = headers.map(function (h) { return DEMO4A_str_(h); }).filter(function (h) { return h && !seen[h]; });
    perTable[name] = { intended_field_count: intended.length, physical_header_count: headers.length, missing_physical_fields: miss, writer_unowned_physical_columns: extra.length };
    extraCounts[name] = extra.length;
    miss.forEach(function (f) { missing.push({ table: name, field: f, field_class: DEMO4A_fieldClass_(f) }); });
  });
  return { ok: missing.length === 0, intended_field_total: intendedTotal, missing_total: missing.length, missing_fields: missing.slice(0, 20), per_table: perTable, writer_unowned_column_counts: extraCounts };
}
// ================================================================================================================
// V3G5(C) — COMPACT POSTCHECK DRIFT FORENSICS (pure, in-memory over an ALREADY-computed classification). Never dumps
// whole rows and never all 73 rows: at most 20 examples, each carrying only table / PK fingerprint / field / class /
// types / truncated canonical forms / reason code. Cheap enough that it can never delay the rollback.
// ================================================================================================================
var DEMO4A_DRIFT_MAX_EXAMPLES_ = 20;
var DEMO4A_DRIFT_MAX_VALUE_LEN_ = 40;
function DEMO4A_driftClip_(v) { var s = DEMO4A_str_(v); return s.length <= DEMO4A_DRIFT_MAX_VALUE_LEN_ ? s : (s.slice(0, DEMO4A_DRIFT_MAX_VALUE_LEN_) + '…+' + (s.length - DEMO4A_DRIFT_MAX_VALUE_LEN_)); }
function DEMO4A_driftEvidence_(cls) {
  var byTable = {}, byReason = {}, examples = [], mismTables = {}, rowCount = 0, fieldCount = 0;
  (((cls || {}).rows) || []).forEach(function (r) {
    if (r.state !== 'DRIFT' && r.state !== 'DUPLICATE' && r.state !== 'ABSENT') return;
    rowCount++; mismTables[r.table] = 1;
    byTable[r.table] = (byTable[r.table] || 0) + 1;
    if (r.state !== 'DRIFT') { byReason[r.state] = (byReason[r.state] || 0) + 1; return; }
    (r.mismatched_fields || []).forEach(function (m) {
      fieldCount++;
      var rc = DEMO4A_str_(m.reason_code) || 'VALUE_MUTATION';
      byReason[rc] = (byReason[rc] || 0) + 1;
      if (examples.length < DEMO4A_DRIFT_MAX_EXAMPLES_) {
        examples.push({ table: r.table, pk_fingerprint: DEMO4A_hash_(DEMO4A_str_(r.pk)), field: m.field, field_class: DEMO4A_str_(m.field_class),
          intended_type: DEMO4A_str_(m.intended_type), live_type: DEMO4A_str_(m.live_type),
          intended_canonical: DEMO4A_driftClip_(m.expected), live_canonical: DEMO4A_driftClip_(m.live), reason_code: rc });
      }
    });
  });
  return { classification: DEMO4A_str_((cls || {}).classification), mismatching_table_count: Object.keys(mismTables).length, mismatching_row_count: rowCount,
    mismatching_field_count: fieldCount, counts_by_table: byTable, counts_by_reason_class: byReason, example_cap: DEMO4A_DRIFT_MAX_EXAMPLES_, examples: examples };
}
// explicit canonicalization-timezone sync: the Date wall clock must be the SPREADSHEET's, never a hardcoded offset.
function DEMO4A_syncCanonTz_() { var r = DEMO4A_spreadsheetTzOffsetMin_(); DEMO4A_setCanonTzOffsetMin_(r.offset_min); return r; }
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
function DEMO4A_whCode_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['warehouse_code', 'code'])); }
function DEMO4A_whName_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['warehouse_name', 'name'])); }
// V3G5D - warehouse_owner = the physical operator / controlling logistics party (Amazon / WINIT / AMZLGS / ResTW for an
// owned factory) - SHIPMENT_CENTER_SPEC.md 22.0(C). Like `company` it is administrative attribution, NOT a usage
// permission, so it is carried as EVIDENCE only and never gates source eligibility.
function DEMO4A_whOwner_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['warehouse_owner', 'owner'])); }
// V3G5B(A) — is_factory_warehouse is the SAME canonical factory-eligibility flag production uses (03_master_data_handlers
// eligibility = is_active AND is_factory_warehouse). Read-only: this tool never writes or redefines it.
function DEMO4A_whIsFactory_(w) { var v = DEMO4A_get_(w, ['is_factory_warehouse']); if (DEMO4A_str_(v) === '') return false; var t = DEMO4A_low_(v); return t === 'true' || t === 'yes' || t === '1' || t === 'y' || v === true || v === 1; }
// V3G5C(A) - THE is_shipping_enabled ACCESSORS ARE DELETED ON PURPOSE. V3G5B gated the Demo SOURCE warehouse on that
// flag "when present". The production sources prove that is WRONG for a factory:
//   SYSTEM_RUNTIME_ARCHITECTURE.md "Warehouse Master capability checks": an endpoint qualifies as a managed overseas
//     warehouse only when it is active, `is_factory_warehouse` is NOT TRUE, and the relevant capability is enabled
//     (`is_receiving_enabled` inbound / `is_shipping_enabled` outbound).
//   WAREHOUSE_OPERATIONS_SPEC.md "Managed-overseas detection": the same conjunction, `is_factory_warehouse` NOT TRUE.
//   OVERSEAS_OUTBOUND_SPEC.md: outbound links a Formal Shipment whose origin resolves to "an active, NON-FACTORY
//     `warehouses` record with `is_shipping_enabled = TRUE`".
//   DATABASE_RELATIONSHIP_MAP.md: "Factory warehouses (`is_factory_warehouse = TRUE`) never create an overseas operation."
// So is_shipping_enabled is the managed-OVERSEAS outbound capability and is STRUCTURALLY never evaluated for a factory;
// it is NOT a general "may be used as a shipment source" authority. A factory-origin shipment is instead a first-class
// supported path: SHIPMENT_CENTER_SPEC.md B-1 keys reservation on `shipments.origin_warehouse_id` with
// `warehouses.is_factory_warehouse = TRUE` and carries NO shipping-capability gate at all. A factory warehouse must
// therefore NEVER be rejected merely because is_shipping_enabled is false or blank. The accessors are REMOVED rather
// than left unused so that no executable path can consult the flag (asserted by a source-fact test). No production
// handler, master column or master data is changed by this correction - only this Demo tool's own eligibility rule.
var DEMO4A_SOURCE_SHIPPING_ENABLED_GATE_APPLIED_ = false;
// ================================================================================================================
// V3G5D(A/F) - FROZEN SHARED-FACTORY SOURCE POLICY. V3G5C rejected a factory whose `company` differed from the Demo
// company. That was an incorrect company-ISOLATION gate, and the repository already records the opposite rule:
//   RECOMMENDATION_SOURCE_CONTRACT_SPEC.md SC-11.1 "D-1 RESOLVED - Factory shared-company authority (FACTORY_SHARED)":
//     "Factory stock is a company-agnostic, cross-company shared physical supply pool" and, verbatim,
//     "`warehouses.company` stays owner/administrative context only"; the Factory Allocation Runtime "allocates the
//     shared physical pool ACROSS COMPANIES".
//   assets/js/core/supply-planning-allocation-facts.js: "factory eligibility = is_factory_warehouse + is_active
//     (shared source; company-agnostic per D-1)" - and eligibleFactoryWarehouseIds() filters on EXACTLY those two
//     flags with NO company filter, while the 3PL branch immediately above it DOES require company equality. The
//     asymmetry is deliberate.
//   43_api_v1_gap_materialization.gs: "FACTORY - company-wide competing set (factory_stock is the FACTORY_SHARED
//     pool; is_factory_warehouse eligible)" - factoryWhIds is likewise built with no company filter.
//   SHIPMENT_CENTER_SPEC.md 22.0(C): `company` = the business/account context USING the warehouse; `warehouse_owner` =
//     the physical operator. Its company-filtered candidate pipeline (22.0(E)-(H)) is the DESTINATION Warehouse Picker,
//     and DATABASE_RELATIONSHIP_MAP.md records "RETURN/FACTORY excluded from normal destination selection" - so that
//     company filter never governed a factory SOURCE in the first place. No contradiction, only a scope distinction.
//   No warehouse-access / warehouse-permission / warehouse-authorization mapping table exists anywhere in the repo.
// Therefore: company and warehouse_owner are administrative attribution, NEVER exclusive usage permissions. A KM Demo
// shipment may legitimately source from an active CN factory whose company/owner is ResTW. Company mismatch is carried
// as VISIBLE EVIDENCE and never blocks. This applies to the SOURCE factory ONLY - destination warehouse company rules
// are untouched by this correction.
var DEMO4A_SOURCE_COMPANY_MATCH_REQUIRED_ = false;
var DEMO4A_SOURCE_FACTORY_SHARED_ACROSS_COMPANIES_ = true;
function DEMO4A_whReceivingEnabled_(w) { var v = DEMO4A_get_(w, ['is_receiving_enabled', 'receiving_enabled']); if (DEMO4A_str_(v) === '') return true; var s = DEMO4A_low_(v); return !(s === 'false' || s === 'no' || s === '0' || s === 'n' || v === false || v === 0); }
// V3G1(A) — warehouse ADDRESS accessors. The LIVE `warehouses` diagnostic reports address_line1/address_line2/city/state/
// subdivision_code/postal_code/country as the runtime authority. Live headers WIN: when an address_line1/address_line_1
// COLUMN is present the seed uses it EVEN IF BLANK (a blank live line1 is NEVER silently replaced by an unrelated field);
// the legacy/spec flat `address` is used ONLY when the live line1 columns are entirely absent. (SHIPMENT_CENTER_SPEC.md:59
// still documents a flat `address` → SPEC_VS_LIVE_WAREHOUSE_ADDRESS_SCHEMA_DIVERGENCE, reported by the candidate diagnostic.)
function DEMO4A_whColPresent_(row, names) { if (!row) return false; var lc = {}; Object.keys(row).forEach(function (k) { lc[String(k).trim().toLowerCase()] = 1; }); for (var i = 0; i < names.length; i++) { if (lc[names[i].toLowerCase()]) return true; } return false; }
function DEMO4A_whAddrLine1_(w) { if (DEMO4A_whColPresent_(w, ['address_line1', 'address_line_1'])) return DEMO4A_str_(DEMO4A_get_(w, ['address_line1', 'address_line_1'])); return DEMO4A_str_(DEMO4A_get_(w, ['address', 'street', 'street_address'])); }
function DEMO4A_whAddrLine2_(w) { if (DEMO4A_whColPresent_(w, ['address_line2', 'address_line_2'])) return DEMO4A_str_(DEMO4A_get_(w, ['address_line2', 'address_line_2'])); return DEMO4A_str_(DEMO4A_get_(w, ['address2'])); }
function DEMO4A_whCity_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['city', 'town'])); }
function DEMO4A_whSubdivision_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['subdivision_code'])); }
function DEMO4A_whStateSub_(w) { var st = DEMO4A_str_(DEMO4A_get_(w, ['state', 'province', 'state_province', 'region_state'])); return st || DEMO4A_whSubdivision_(w); }
function DEMO4A_whAddrFlatLegacyPresent_(w) { return DEMO4A_whColPresent_(w, ['address']) && !DEMO4A_whColPresent_(w, ['address_line1', 'address_line_1']); }
function DEMO4A_whPostal_(w) { return DEMO4A_str_(DEMO4A_get_(w, ['postal_code', 'postcode', 'zip', 'zip_code'])); }
// countries where a postal_code is part of a resolvable facility address (US destinations require it).
var DEMO4A_POSTAL_REQUIRED_ = { us: 1, ca: 1, gb: 1, uk: 1, de: 1, fr: 1, jp: 1, cn: 1, au: 1, it: 1, es: 1, nl: 1, se: 1, pl: 1, mx: 1, br: 1, in: 1 };
function DEMO4A_postalRequired_(country) { return DEMO4A_POSTAL_REQUIRED_.hasOwnProperty(DEMO4A_low_(country)); }
// canonical normalized address string + fingerprint (UPPERCASE, whitespace-collapsed, ordered). Stable → checksum-safe.
function DEMO4A_normAddrPart_(v) { return DEMO4A_str_(v).toUpperCase().replace(/\s+/g, ' ').replace(/[.,#]/g, '').trim(); }
function DEMO4A_normalizeWhAddress_(w) {
  var parts = [DEMO4A_whAddrLine1_(w), DEMO4A_whAddrLine2_(w), DEMO4A_whCity_(w), DEMO4A_whStateSub_(w), DEMO4A_whPostal_(w), DEMO4A_whCountry_(w)].map(DEMO4A_normAddrPart_);
  var normalized = parts.join(' | ');
  return { parts: parts, normalized: normalized, fingerprint: DEMO4A_hash_(normalized) };
}
// V3G(B) — ADDRESS-AUTHORITY gate. Business identity is address-based (NOT coordinate-based). Returns a typed status.
// route (optional) = the selected route template, for exact country/region scope agreement. Coordinate is NEVER read here.
function DEMO4A_addressAuthority_(w, route) {
  if (!w) return { status: 'ADDRESS_INCOMPLETE', reason: 'NO_WAREHOUSE_IDENTITY' };
  if (!DEMO4A_whActive_(w) || !DEMO4A_whDestTypeCompatible_(w)) return { status: 'WAREHOUSE_NOT_ELIGIBLE', reason: DEMO4A_whActive_(w) ? ('WAREHOUSE_TYPE_NOT_DESTINATION_COMPATIBLE:' + DEMO4A_whType_(w)) : 'WAREHOUSE_INACTIVE', warehouse_id: DEMO4A_whId_(w), warehouse_code: DEMO4A_whCode_(w) };
  var id = DEMO4A_whId_(w), code = DEMO4A_whCode_(w), l1 = DEMO4A_whAddrLine1_(w), city = DEMO4A_whCity_(w), country = DEMO4A_whCountry_(w), postal = DEMO4A_whPostal_(w);
  var missing = [];
  if (!id) missing.push('warehouse_id'); if (!code) missing.push('warehouse_code'); if (!l1) missing.push('address_line1'); if (!city) missing.push('city'); if (!country) missing.push('country');
  if (DEMO4A_postalRequired_(country) && !postal) missing.push('postal_code');
  if (missing.length) return { status: 'ADDRESS_INCOMPLETE', reason: 'MISSING:' + missing.join(','), warehouse_id: id, warehouse_code: code };
  if (route) {
    var rc = DEMO4A_str_(route.destination_country);
    if (rc && DEMO4A_low_(rc) !== DEMO4A_low_(country)) return { status: 'ADDRESS_SCOPE_CONFLICT', reason: 'COUNTRY_ROUTE_MISMATCH:' + country + '≠' + rc, warehouse_id: id, warehouse_code: code };
    var rr = DEMO4A_str_(route.destination_region), whr = DEMO4A_whRegion_(w);
    if (rr && whr && DEMO4A_dxRegionBucket_(rr) !== 'OTHER' && DEMO4A_dxRegionBucket_(whr) !== 'OTHER' && DEMO4A_dxRegionBucket_(rr) !== DEMO4A_dxRegionBucket_(whr)) return { status: 'ADDRESS_SCOPE_CONFLICT', reason: 'REGION_ROUTE_MISMATCH:' + whr + '≠' + rr, warehouse_id: id, warehouse_code: code };
  }
  var na = DEMO4A_normalizeWhAddress_(w);
  return { status: 'ADDRESS_AUTHORITY_READY', warehouse_id: id, warehouse_code: code, normalized_address: na.normalized, address_fingerprint: na.fingerprint, country: country, region: DEMO4A_whRegion_(w) };
}

// V3G(C) — DEMO-ONLY destination-coordinate authority. A reviewable, source-referenced, address-fingerprint-BOUND
// lookup keyed by UPPERCASE warehouse_code. It SHIPS EMPTY: the operator pastes REVIEWED, source-cited coordinates in a
// separate, explicit, armed task — until then the address-derived branch fails closed (DESTINATION_ADDRESS_COORDINATE_
// UNRESOLVED). This is NOT a geocoder, is NEVER called at COMMIT (the coordinate is frozen into the DRY_RUN plan and
// bound by demo_plan_checksum), and NEVER a city/ZIP/postal centroid, port, airport or invented coordinate. Each entry:
//   'WAREHOUSE_CODE': { latitude:<n>, longitude:<n>, source_type:'reviewed_address_resolution', source_reference:'<ref>',
//                       accuracy:'rooftop|parcel|building|premise|address', address_fingerprint:'<djb2 of normalized addr>',
//                       review_version:'<id>' }
// The bound address_fingerprint MUST equal the warehouse's CURRENT normalized-address fingerprint (a changed address
// invalidates a stale coordinate), and the accuracy must be a facility-grade class (city/zip/centroid/approximate rejected).
// V3G3(C) — ARMED with EXACTLY the three USER-APPROVED destination coordinates, and nothing else. The user approved these
// after the live read-only validator returned THREE_REGION_COORDINATE_PROPOSAL_READY / proposal_entries 3 /
// authority_armed false / DEMO4A_ZERO_WRITE_CONFIRMED YES, with every per-region gate passing (fingerprint match,
// coordinate validity, facility-grade accuracy, source reference, identity match, country/region agreement, no
// gateway/centroid substitution, no duplicate coordinate).
// Each entry is EXPLICIT and IMMUTABLE in source: it binds warehouse_id + warehouse_code + logistics_location_id + region
// + the LIVE address_fingerprint + latitude/longitude + the CANONICAL facility accuracy (the stated source vocabulary is
// kept alongside for review traceability) + source_reference + frozen approval metadata. `approved_at`/`review_version`
// are FROZEN CONSTANTS, never a runtime timestamp, so demo_plan_checksum stays reproducible. A stale live address
// fingerprint still fails closed (DEMO4A_deriveDestCoordinate_ compares against the CURRENT normalized address).
// DEMO4A_DEST_COORD_PROPOSAL_ remains the separate review evidence; only THIS constant is executable authority, and
// nothing promotes a proposal automatically.
var DEMO4A_DEST_COORD_AUTHORITY_ = {
  BFI4: {
    region: 'US_WEST', warehouse_id: 'WH-KM-US-FBA-BFI4', warehouse_code: 'BFI4', logistics_location_id: 'LOC-WH-KM-US-FBA-BFI4',
    address_fingerprint: '06a93100', latitude: 47.4145, longitude: -122.25778,
    accuracy: 'building', stated_accuracy: 'BUILDING_FOOTPRINT',
    source_type: 'OPENSTREETMAP_BUILDING', source_reference: 'https://mapcarta.com/W500861061',
    reviewed_by: 'USER_SOURCE_REVIEW', approved_by: 'USER_APPROVED', review_status: 'user_approved', approved_at: '2026-08-24', review_version: 'V3G3-USER-APPROVED-1'
  },
  AUS2: {
    region: 'US_CENTRAL', warehouse_id: 'WH-KM-US-FBA-AUS2', warehouse_code: 'AUS2', logistics_location_id: 'LOC-WH-KM-US-FBA-AUS2',
    address_fingerprint: '82165c14', latitude: 30.43255, longitude: -97.59852,
    accuracy: 'building', stated_accuracy: 'BUILDING_FOOTPRINT',
    source_type: 'OPENSTREETMAP_BUILDING', source_reference: 'https://mapcarta.com/W894331161',
    // live DB ZIP 78665 stays authoritative (the fingerprint above is built from it); 78660 is a third-party dataset
    // variant only and is NEVER substituted, and no warehouse master field is modified.
    reviewed_by: 'USER_SOURCE_REVIEW', approved_by: 'USER_APPROVED', review_status: 'user_approved', approved_at: '2026-08-24', review_version: 'V3G3-USER-APPROVED-1'
  },
  ABE2: {
    region: 'US_EAST', warehouse_id: 'WH-KM-US-FBA-ABE2', warehouse_code: 'ABE2', logistics_location_id: 'LOC-WH-KM-US-FBA-ABE2',
    address_fingerprint: '9230a81c', latitude: 40.55787890788748, longitude: -75.61500997116448,
    accuracy: 'address', stated_accuracy: 'ADDRESS_POINT',
    source_type: 'REVIEWED_FACILITY_ADDRESS_POINT', source_reference: 'https://fba-finder.com/usa/pennsylvania/abe2/',
    reviewed_by: 'USER_SOURCE_REVIEW', approved_by: 'USER_APPROVED', review_status: 'user_approved', approved_at: '2026-08-24', review_version: 'V3G3-USER-APPROVED-1'
  }
};
var DEMO4A_COORD_ACCURACY_FACILITY_ = { rooftop: 1, parcel: 1, building: 1, premise: 1, address: 1 };
// V3G2 — EXPLICIT accuracy-token alignment. Reviewed sources state their accuracy in their own vocabulary
// (BUILDING_FOOTPRINT = an OSM building polygon; ADDRESS_POINT = a reviewed facility address point). Each is mapped to a
// FACILITY-GRADE canonical class by NAME ONLY. This is an enumerated alias table, NOT a wildcard: an unlisted token still
// resolves to '' and is refused (city/zip/postal/centroid/approximate remain absent, so they still fail).
var DEMO4A_COORD_ACCURACY_CANON_ = {
  rooftop: 'rooftop', rooftop_point: 'rooftop',
  parcel: 'parcel', parcel_centroid: 'parcel',
  building: 'building', building_footprint: 'building', building_polygon: 'building',
  premise: 'premise', premise_point: 'premise',
  address: 'address', address_point: 'address'
};
// canonical facility-grade class for a stated accuracy token, or '' when the token is not an enumerated facility class.
function DEMO4A_coordAccuracyFacility_(v) {
  var t = DEMO4A_low_(v); if (t === '') return '';
  var canon = DEMO4A_COORD_ACCURACY_CANON_.hasOwnProperty(t) ? DEMO4A_COORD_ACCURACY_CANON_[t] : '';
  return DEMO4A_COORD_ACCURACY_FACILITY_.hasOwnProperty(canon) ? canon : '';
}
function DEMO4A_deriveDestCoordinate_(w, coordAuthority, addressFingerprint) {
  var code = DEMO4A_whCode_(w).toUpperCase(); if (code === '') return { ok: false, reason: 'NO_WAREHOUSE_CODE' };
  var auth = coordAuthority || DEMO4A_DEST_COORD_AUTHORITY_;
  var e = auth[code] || auth[DEMO4A_whCode_(w)];
  if (!e) return { ok: false, reason: 'NO_REVIEWED_COORDINATE_FOR_WAREHOUSE_CODE' };
  if (!DEMO4A_validCoord_(e.latitude, e.longitude)) return { ok: false, reason: 'REVIEWED_COORDINATE_INVALID' };
  if (!DEMO4A_coordAccuracyFacility_(e.accuracy)) return { ok: false, reason: 'ACCURACY_NOT_FACILITY_GRADE:' + DEMO4A_str_(e.accuracy) };
  if (DEMO4A_str_(e.address_fingerprint) !== DEMO4A_str_(addressFingerprint)) return { ok: false, reason: 'ADDRESS_FINGERPRINT_STALE' };
  if (!DEMO4A_str_(e.source_reference)) return { ok: false, reason: 'NO_SOURCE_REFERENCE' };
  return { ok: true, latitude: DEMO4A_num_(e.latitude), longitude: DEMO4A_num_(e.longitude), source_type: DEMO4A_str_(e.source_type) || 'reviewed_address_resolution',
    source_reference: DEMO4A_str_(e.source_reference), accuracy: DEMO4A_coordAccuracyFacility_(e.accuracy), address_fingerprint: DEMO4A_str_(e.address_fingerprint), review_version: DEMO4A_str_(e.review_version) };
}
// logistics-location identity/coordinate eligibility: verification_status NOT retired/rejected (33_:61-66) AND is_active
// not explicitly false. V3G(G.1) — the live frontend reads a `record_status` column (operation-system-db-api.js:1331,
// `r.record_status || r.coordinate_status`) even though the canonical spec (§5.1) defines only verification_status; when
// that column IS present, a clearly-dead lifecycle value excludes the row too. A COORDINATE-pending verification_status
// (e.g. draft / pending_review / ADDRESS_SEEDED_COORDINATES_PENDING) is NEITHER retired NOR rejected → still eligible for
// business identity (its blank coordinate never invalidates the warehouse — the V3G core rule).
var DEMO4A_RECORD_STATUS_DEAD_ = { deleted: 1, archived: 1, void: 1, removed: 1, inactive: 1, obsolete: 1 };
var DEMO4A_VS_COORDINATE_PENDING_ = { draft: 1, pending_review: 1, address_seeded_coordinates_pending: 1, coordinate_pending: 1, coordinates_pending: 1 };
function DEMO4A_locVerificationEligible_(loc) {
  if (!DEMO4A_locActive_(loc)) return false;
  var vs = DEMO4A_low_(DEMO4A_get_(loc, ['verification_status']));
  if (vs === 'retired' || vs === 'rejected') return false;
  var rs = DEMO4A_low_(DEMO4A_get_(loc, ['record_status', 'row_status']));   // present live; blank when the column is absent
  if (rs !== '' && DEMO4A_RECORD_STATUS_DEAD_.hasOwnProperty(rs)) return false;
  return true;
}
// EXACT bridge: every ELIGIBLE logistics row whose warehouse_id === wid (NO fuzzy/name/city matching).
function DEMO4A_locsForWarehouse_(locations, wid) {
  var w = DEMO4A_low_(DEMO4A_str_(wid)); if (w === '') return [];
  return (locations || []).filter(function (l) { return DEMO4A_locVerificationEligible_(l) && DEMO4A_low_(DEMO4A_str_(DEMO4A_get_(l, ['warehouse_id']))) === w; });
}
// TYPED coordinate-branch resolver for a destination warehouse business identity.
//   business identity  = warehouse_id + warehouse_code + eligible + resolvable ADDRESS (V3G: NOT coordinate-based)
//   location lineage   = EXACT logistics_locations.warehouse_id join (0/1; >1 = fail-closed conflict)
//   display coordinate = (1) valid exact warehouse-linked logistics_locations coordinate, else
//                        (2) a REVIEWED, source-bound, address-fingerprint-matched Demo coordinate (V3G derived branch)
// Branch WAREHOUSE_COORDINATE_FALLBACK_FROM_WAREHOUSE_MASTER is NOT source-proven (warehouses hold no coords) → never selected.
// coordAuthority (optional) enables the derived branch; a 2-arg call (no authority, no route) preserves the V3F branch set
// (COORDINATE_READY / IDENTITY_READY_COORDINATE_PENDING) so a blank-coordinate warehouse without a reviewed coordinate keeps
// its identity but stays coordinate-pending — its blank master coordinate NEVER invalidates the warehouse identity.
function DEMO4A_resolveWarehouseDestination_(warehouseRow, locations, coordAuthority, route) {
  if (!warehouseRow) return { branch: 'WAREHOUSE_LOCATION_JOIN_MISSING', reason: 'NO_DESTINATION_WAREHOUSE_IDENTITY', identity_ready: false, renderable: false, received_allowed: false };
  var wid = DEMO4A_whId_(warehouseRow), wcode = DEMO4A_whCode_(warehouseRow);
  var addr = DEMO4A_addressAuthority_(warehouseRow, route);
  var identityReady = addr.status === 'ADDRESS_AUTHORITY_READY';
  var joined = DEMO4A_locsForWarehouse_(locations, wid);
  var conflict = joined.length > 1;
  var loc = joined.length === 1 ? joined[0] : null;
  var base = { warehouse_id: wid, warehouse_code: wcode, join_key: wid,
    logistics_location_id: loc ? DEMO4A_locId_(loc) : '', location_type: loc ? DEMO4A_canonLocType_(DEMO4A_locType_(loc)) : '',
    country: loc ? DEMO4A_locCountry_(loc) : DEMO4A_whCountry_(warehouseRow), region: loc ? DEMO4A_locRegion_(loc) : DEMO4A_whRegion_(warehouseRow),
    verification_status: loc ? DEMO4A_str_(DEMO4A_get_(loc, ['verification_status'])) : '', address_status: addr.status, address_fingerprint: DEMO4A_str_(addr.address_fingerprint || ''),
    identity_ready: identityReady, location: loc };
  // lineage conflict (>1 eligible join) fails closed regardless of coordinate path.
  if (conflict) { base.branch = 'WAREHOUSE_LOCATION_JOIN_CONFLICT'; base.candidate_count = joined.length; base.candidate_fps = joined.slice(0, 5).map(function (l) { return DEMO4A_hash_(DEMO4A_locId_(l)); }); base.renderable = false; base.received_allowed = false; return base; }
  // (1) master/logistics coordinate wins when present.
  if (loc && DEMO4A_locValid_(loc)) { base.branch = 'WAREHOUSE_LOCATION_COORDINATE_READY'; base.latitude = DEMO4A_num_(loc.latitude); base.longitude = DEMO4A_num_(loc.longitude); base.coordinate_source = 'logistics_location'; base.renderable = true; base.received_allowed = true; return base; }
  // (2) address-derived coordinate — only when identity is address-ready AND a reviewed source-bound coordinate resolves.
  if (identityReady && (coordAuthority || route)) {
    var d = DEMO4A_deriveDestCoordinate_(warehouseRow, coordAuthority, addr.address_fingerprint);
    if (d.ok) { base.branch = 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE'; base.latitude = d.latitude; base.longitude = d.longitude; base.coordinate_source = 'demo_address_derived';
      base.coordinate_source_type = d.source_type; base.coordinate_source_reference = d.source_reference; base.coordinate_accuracy = d.accuracy; base.coordinate_review_version = d.review_version;
      base.binding_type = 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE'; base.renderable = true; base.received_allowed = true; return base; }
    base.coordinate_unresolved_reason = d.reason;
  }
  // no join at all → lineage-missing (identity may still be address-ready); else identity-ready but coordinate-pending.
  if (!loc) { base.branch = identityReady ? 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING' : 'WAREHOUSE_LOCATION_JOIN_MISSING'; base.reason = identityReady ? 'NO_JOINED_LOGISTICS_ROW_AND_NO_REVIEWED_COORDINATE' : (addr.reason || 'NO_ELIGIBLE_LOGISTICS_ROW_FOR_WAREHOUSE_ID'); base.renderable = false; base.received_allowed = false; return base; }
  base.branch = 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING'; base.reason = 'DESTINATION_WAREHOUSE_COORDINATE_PENDING'; base.renderable = false; base.received_allowed = false; return base;   // identity kept; NEVER borrow a gateway coord, NEVER received-at-FBA
}
// V3G(C) — same-region reselection: the FIRST (deterministic by warehouse_id) OTHER eligible warehouse in the same region
// bucket + company + country whose destination resolves to a READY display coordinate. Used when the template's own
// destination warehouse cannot resolve a coordinate; returns null → the caller fails closed.
function DEMO4A_pickWarehouseForRegion_(warehouses, locations, coordAuthority, regionBucket, company, country, excludeId) {
  var cands = (warehouses || []).filter(function (w) {
    if (DEMO4A_low_(DEMO4A_whId_(w)) === DEMO4A_low_(excludeId || '')) return false;
    if (!DEMO4A_whActive_(w) || !DEMO4A_whDestTypeCompatible_(w)) return false;
    if (company && DEMO4A_whCompany_(w) && DEMO4A_low_(DEMO4A_whCompany_(w)) !== DEMO4A_low_(company)) return false;
    if (country && DEMO4A_whCountry_(w) && DEMO4A_low_(DEMO4A_whCountry_(w)) !== DEMO4A_low_(country)) return false;
    return DEMO4A_dxRegionBucket_(DEMO4A_whRegion_(w)) === regionBucket;
  }).sort(function (a, b) { var ia = DEMO4A_whId_(a), ib = DEMO4A_whId_(b); return ia < ib ? -1 : (ia > ib ? 1 : 0); });
  for (var i = 0; i < cands.length; i++) {
    var r = DEMO4A_resolveWarehouseDestination_(cands[i], locations, coordAuthority, null);
    if (r.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY' || r.branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE') return { warehouse: cands[i], resolution: r };
  }
  return null;
}
// region bucket for a US warehouse/location (reuses the frozen classifier vocabulary; blank → OTHER).
function DEMO4A_dxRegionBucket_(region) { var h = DEMO4A_low_(region); if (/west/.test(h)) return 'US_WEST'; if (/central/.test(h)) return 'US_CENTRAL'; if (/east/.test(h)) return 'US_EAST'; return 'OTHER'; }

// ================================================================================================================
// V3G1(B) — EXACT three-region destination-warehouse candidate selection (read-only). Selects ONE deterministic eligible
// warehouse per US_WEST/US_CENTRAL/US_EAST. Eligibility: company=KM · country=US · marketplace=Amazon · warehouse_type FBA
// (a compatible 3PL only when NO eligible FBA exists in that region) · is_active · is_receiving_enabled when present ·
// exact logistics_region · warehouse_id + warehouse_code present · complete live address (ADDRESS_AUTHORITY_READY) · exact
// non-conflicting logistics_locations.warehouse_id join · joined location eligible (active, not retired/rejected/dead).
// Deterministic: FBA before 3PL, then by warehouse_id ascending. The THREE selected rows expose ACTUAL reviewable values.
// ================================================================================================================
function DEMO4A_destCandidateEligible_(w, locations) {
  if (DEMO4A_low_(DEMO4A_whCompany_(w)) !== 'km') return { ok: false, reason: 'COMPANY_NOT_KM' };
  if (DEMO4A_low_(DEMO4A_whCountry_(w)) !== 'us') return { ok: false, reason: 'COUNTRY_NOT_US' };
  if (DEMO4A_low_(DEMO4A_whMarketplace_(w)) !== 'amazon') return { ok: false, reason: 'MARKETPLACE_NOT_AMAZON' };
  if (!DEMO4A_whActive_(w)) return { ok: false, reason: 'WAREHOUSE_INACTIVE' };
  if (!DEMO4A_whReceivingEnabled_(w)) return { ok: false, reason: 'RECEIVING_DISABLED' };
  var ty = DEMO4A_whType_(w); if (ty !== 'fba' && ty !== '3pl') return { ok: false, reason: 'WAREHOUSE_TYPE_NOT_FBA_OR_3PL:' + ty };
  if (DEMO4A_dxRegionBucket_(DEMO4A_whRegion_(w)) === 'OTHER') return { ok: false, reason: 'REGION_NOT_WEST_CENTRAL_EAST' };
  var addr = DEMO4A_addressAuthority_(w); if (addr.status !== 'ADDRESS_AUTHORITY_READY') return { ok: false, reason: addr.status + (addr.reason ? (':' + addr.reason) : '') };
  var joined = DEMO4A_locsForWarehouse_(locations, DEMO4A_whId_(w));
  if (joined.length === 0) return { ok: false, reason: 'WAREHOUSE_LOCATION_JOIN_MISSING' };
  if (joined.length > 1) return { ok: false, reason: 'WAREHOUSE_LOCATION_JOIN_CONFLICT' };
  return { ok: true, warehouse_type: ty, logistics_location_id: DEMO4A_locId_(joined[0]), location: joined[0] };
}
function DEMO4A_selectDestCandidatesByRegion_(warehouses, locations) {
  var byRegion = { US_WEST: [], US_CENTRAL: [], US_EAST: [] };
  (warehouses || []).forEach(function (w) { var e = DEMO4A_destCandidateEligible_(w, locations); if (!e.ok) return; var rb = DEMO4A_dxRegionBucket_(DEMO4A_whRegion_(w)); if (byRegion[rb]) byRegion[rb].push({ w: w, e: e }); });
  var out = {};
  ['US_WEST', 'US_CENTRAL', 'US_EAST'].forEach(function (rb) {
    var pool = byRegion[rb].slice().sort(function (a, b) { var ra = a.e.warehouse_type === 'fba' ? 0 : 1, rbk = b.e.warehouse_type === 'fba' ? 0 : 1; if (ra !== rbk) return ra - rbk; var ia = DEMO4A_whId_(a.w), ib = DEMO4A_whId_(b.w); return ia < ib ? -1 : (ia > ib ? 1 : 0); });
    out[rb] = pool.length ? pool[0] : null;
  });
  return out;
}
// PURE candidate-diagnostic core. The THREE selected rows expose ACTUAL reviewable values (NOT fingerprinted).
function DEMO4A_diagnoseDestCandidates_(warehouses, locations, coordAuthority) {
  var whHeaders = (warehouses && warehouses[0]) ? Object.keys(warehouses[0]) : [];
  var liveLine1Present = whHeaders.map(function (h) { return DEMO4A_low_(h); }).indexOf('address_line1') !== -1 || whHeaders.map(function (h) { return DEMO4A_low_(h); }).indexOf('address_line_1') !== -1;
  var flatAddressPresent = whHeaders.map(function (h) { return DEMO4A_low_(h); }).indexOf('address') !== -1;
  var sel = DEMO4A_selectDestCandidatesByRegion_(warehouses, locations);
  var auth = coordAuthority || DEMO4A_DEST_COORD_AUTHORITY_;
  function row(rb) {
    var c = sel[rb]; if (!c) return { region: rb, selected: false, reason: 'NO_ELIGIBLE_DESTINATION_WAREHOUSE_IN_REGION' };
    var w = c.w, na = DEMO4A_normalizeWhAddress_(w), loc = c.e.location;
    var authStatus = (auth[DEMO4A_whCode_(w).toUpperCase()] || auth[DEMO4A_whCode_(w)]) ? 'AUTHORIZED_COORDINATE_PRESENT' : 'COORDINATE_AUTHORITY_NOT_ARMED';
    return { region: rb, selected: true,
      warehouse_id: DEMO4A_whId_(w), warehouse_code: DEMO4A_whCode_(w), warehouse_name: DEMO4A_str_(DEMO4A_get_(w, ['warehouse_name', 'name'])), warehouse_type: DEMO4A_whType_(w),
      logistics_location_id: c.e.logistics_location_id,
      address_line1: DEMO4A_whAddrLine1_(w), address_line2: DEMO4A_whAddrLine2_(w), city: DEMO4A_whCity_(w), state: DEMO4A_str_(DEMO4A_get_(w, ['state', 'province', 'state_province'])), subdivision_code: DEMO4A_whSubdivision_(w), postal_code: DEMO4A_whPostal_(w), country: DEMO4A_whCountry_(w),
      normalized_address: na.normalized, address_fingerprint: na.fingerprint,
      master_latitude: DEMO4A_str_(DEMO4A_get_(loc, ['latitude'])), master_longitude: DEMO4A_str_(DEMO4A_get_(loc, ['longitude'])), master_coordinate_valid: DEMO4A_locValid_(loc),
      verification_status: DEMO4A_str_(DEMO4A_get_(loc, ['verification_status'])), coordinate_authority_status: authStatus };
  }
  var rows = ['US_WEST', 'US_CENTRAL', 'US_EAST'].map(row);
  var allSelected = rows.every(function (r) { return r.selected; });
  return {
    spec_vs_live_warehouse_address_schema: (liveLine1Present && flatAddressPresent) ? 'SPEC_VS_LIVE_WAREHOUSE_ADDRESS_SCHEMA_DIVERGENCE' : (liveLine1Present ? 'LIVE_ADDRESS_LINE_COLUMNS_PRESENT' : 'FLAT_ADDRESS_ONLY'),
    live_address_line_columns_present: liveLine1Present, legacy_flat_address_column_present: flatAddressPresent,
    warehouses_headers: whHeaders,
    selected_destination_warehouses: rows,   // ACTUAL reviewable values for the 3 selected (authorized for review output)
    coordinate_authority_armed: DEMO4A_coordAuthorityArmed_(auth), coordinate_proposal_entries: Object.keys(DEMO4A_DEST_COORD_PROPOSAL_).length,
    verdict: allSelected ? 'THREE_REGION_DESTINATION_CANDIDATES_SELECTED' : 'INSUFFICIENT_ELIGIBLE_DESTINATION_WAREHOUSES'
  };
}
function TEMP_DEMO4A_DIAGNOSE_DESTINATION_ADDRESS_COORDINATE_CANDIDATES() {
  var out = { tool: 'TEMP_DEMO4A_DIAGNOSE_DESTINATION_ADDRESS_COORDINATE_CANDIDATES', mode: 'STRICTLY READ-ONLY (getSheetByName + getValues only)', output_contract: 'THREE authorized reviewable rows (W/C/E) — actual values, no fingerprinting of the selected three' };
  try {
    var masters = DEMO4A_readMasters_();
    out.masters_present = masters.present;
    var d = DEMO4A_diagnoseDestCandidates_(masters.warehouses, masters.locations, DEMO4A_DEST_COORD_AUTHORITY_);
    Object.keys(d).forEach(function (k) { out[k] = d[k]; });
  } catch (e) { out.verdict = 'DIAGNOSE_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES';
  Logger.log('DEMO4A_DIAGNOSE_DEST_CANDIDATES ' + JSON.stringify(out, null, 2)); return out;
}

// ================================================================================================================
// V3G1(C) — REVIEWABLE COORDINATE PROPOSAL, distinct from the AUTHORIZATION constant. The proposal is a source-reviewed
// PLAN; it does NOT authorize anything. It SHIPS EMPTY: the operator pastes reviewed entries (one per selected warehouse)
// using the exact address_fingerprint surfaced by TEMP_DEMO4A_DIAGNOSE_DESTINATION_ADDRESS_COORDINATE_CANDIDATES — the
// fingerprint binding cannot be authored offline without the live address, so pre-filling it would fabricate. Entry shape:
//   'WAREHOUSE_CODE': { warehouse_id, warehouse_code, logistics_location_id, address_fingerprint, latitude, longitude,
//     coordinate_accuracy (rooftop|parcel|building|premise|address), coordinate_source_type, coordinate_source_reference,
//     reviewed_at, reviewed_by, review_status ('proposed'|'user_approved') }
// A proposal NEVER auto-authorizes: DEMO4A_DEST_COORD_AUTHORITY_ stays empty until the USER explicitly copies an approved
// proposal (via DEMO4A_proposalToAuthority_, which is NOT executed by this tool). No airport/seaport/city/ZIP centroid,
// no fuzzy name match, valid non-(0,0) coordinate, reviewable source_reference, and it fails if the live fingerprint changes.
// ================================================================================================================
// V3G2 — USER-REVIEWED three-region proposal, keyed by UPPERCASE warehouse_code. Each entry is bound to the LIVE
// address_fingerprint surfaced by TEMP_DEMO4A_DIAGNOSE_DESTINATION_ADDRESS_COORDINATE_CANDIDATES, so a later live address
// edit invalidates it (ADDRESS_FINGERPRINT_STALE) instead of silently keeping a wrong coordinate. reviewed_at/review_version
// are FROZEN DETERMINISTIC review markers (the source review date + a version id) — NOT a live execution timestamp, so the
// demo_plan_checksum stays reproducible. review_status is 'PROPOSAL_READY_FOR_USER_VALIDATION': the validator can report
// READY, but DEMO4A_proposalToAuthority_ converts ONLY 'user_approved' entries, so this proposal CANNOT arm the authority.
var DEMO4A_DEST_COORD_PROPOSAL_ = {
  BFI4: {
    region: 'US_WEST', warehouse_id: 'WH-KM-US-FBA-BFI4', warehouse_code: 'BFI4', logistics_location_id: 'LOC-WH-KM-US-FBA-BFI4',
    address_fingerprint: '06a93100',   // live: 21005 64th Ave S | Kent | Washington | 98032 | US
    latitude: 47.4145, longitude: -122.25778,
    coordinate_accuracy: 'BUILDING_FOOTPRINT', coordinate_source_type: 'OPENSTREETMAP_BUILDING',
    coordinate_source_reference: 'https://mapcarta.com/W500861061',
    reviewed_at: '2026-08-24', reviewed_by: 'USER_SOURCE_REVIEW', review_status: 'PROPOSAL_READY_FOR_USER_VALIDATION', review_version: 'V3G2-USER-SOURCE-REVIEW-1'
  },
  AUS2: {
    region: 'US_CENTRAL', warehouse_id: 'WH-KM-US-FBA-AUS2', warehouse_code: 'AUS2', logistics_location_id: 'LOC-WH-KM-US-FBA-AUS2',
    address_fingerprint: '82165c14',   // live: 2000 E Pecan St | Pflugerville | Texas | 78665 | US (live ZIP 78665 is authoritative)
    latitude: 30.43255, longitude: -97.59852,
    coordinate_accuracy: 'BUILDING_FOOTPRINT', coordinate_source_type: 'OPENSTREETMAP_BUILDING',
    coordinate_source_reference: 'https://mapcarta.com/W894331161',
    // secondary address evidence: https://business.pfchamber.com/members/member/aus2-amazon-549 (confirms 2000 E Pecan St,
    // Pflugerville TX 78665). Some third-party map/address datasets publish 78660 for this facility; the proposal stays bound
    // to the LIVE 78665 fingerprint and NO warehouse master field is modified.
    reviewed_at: '2026-08-24', reviewed_by: 'USER_SOURCE_REVIEW', review_status: 'PROPOSAL_READY_FOR_USER_VALIDATION', review_version: 'V3G2-USER-SOURCE-REVIEW-1'
  },
  ABE2: {
    region: 'US_EAST', warehouse_id: 'WH-KM-US-FBA-ABE2', warehouse_code: 'ABE2', logistics_location_id: 'LOC-WH-KM-US-FBA-ABE2',
    address_fingerprint: '9230a81c',   // live: 705 Boulder Dr | Breinigsville | Pennsylvania | 18031 | US
    latitude: 40.55787890788748, longitude: -75.61500997116448,
    coordinate_accuracy: 'ADDRESS_POINT', coordinate_source_type: 'REVIEWED_FACILITY_ADDRESS_POINT',
    coordinate_source_reference: 'https://fba-finder.com/usa/pennsylvania/abe2/',
    reviewed_at: '2026-08-24', reviewed_by: 'USER_SOURCE_REVIEW', review_status: 'PROPOSAL_READY_FOR_USER_VALIDATION', review_version: 'V3G2-USER-SOURCE-REVIEW-1'
  }
};
// PURE — convert an APPROVED proposal entry to the exact authorization structure. Does NOT read/write any constant and is
// NEVER invoked automatically; the USER runs a separate armed task to paste the result into DEMO4A_DEST_COORD_AUTHORITY_.
function DEMO4A_proposalToAuthority_(proposal) {
  var out = {};
  Object.keys(proposal || {}).forEach(function (code) {
    var p = proposal[code]; if (!p) return;
    if (DEMO4A_low_(p.review_status) !== 'user_approved') return;   // only an explicitly USER-approved proposal converts
    // the canonical facility-grade class is emitted (not the raw source vocabulary) so an approved proposal satisfies the
    // authority's own accuracy gate; review_version prefers the explicit frozen version id over the review date.
    out[code] = { latitude: DEMO4A_num_(p.latitude), longitude: DEMO4A_num_(p.longitude), source_type: DEMO4A_str_(p.coordinate_source_type) || 'reviewed_address_resolution',
      source_reference: DEMO4A_str_(p.coordinate_source_reference), accuracy: DEMO4A_coordAccuracyFacility_(p.coordinate_accuracy), address_fingerprint: DEMO4A_str_(p.address_fingerprint), review_version: DEMO4A_str_(p.review_version) || DEMO4A_str_(p.reviewed_at) || DEMO4A_str_(p.review_status) };
  });
  return out;
}
function DEMO4A_coordAuthorityArmed_(coordAuthority) { return !!(coordAuthority && Object.keys(coordAuthority).length > 0); }

// V3G1(D) — country bounding boxes for coordinate/country agreement (only countries the demo destinations can use are
// listed; an unlisted country reports country_bounds_known:false rather than asserting a false disagreement).
var DEMO4A_COORD_COUNTRY_BOUNDS_ = { us: [24.0, 49.5, -125.0, -66.5], ca: [41.6, 70.0, -141.0, -52.0], mx: [14.5, 32.8, -118.5, -86.7] };
function DEMO4A_coordInBounds_(lat, lng, b) { var a = DEMO4A_num_(lat), o = DEMO4A_num_(lng); if (isNaN(a) || isNaN(o) || !b) return false; return a >= b[0] && a <= b[1] && o >= b[2] && o <= b[3]; }
// canonical location types that are TRANSIT GATEWAYS or CENTROIDS — never a destination facility coordinate.
var DEMO4A_GATEWAY_CENTROID_TYPES_ = { port: 1, airport: 1, border_crossing: 1, customs_facility: 1, transit_hub: 1, rail_terminal: 1, truck_terminal: 1, parcel_hub: 1, carrier_facility: 1, city_centroid: 1, country_centroid: 1, virtual_transit_point: 1 };
// returns '<canon_type>:<logistics_location_id>' when the proposed coordinate IS a live gateway/centroid coordinate
// (matched at ~1e-3 deg ≈ 100 m, so a rounded gateway coordinate cannot be laundered into a facility coordinate).
function DEMO4A_gatewayCoordMatch_(lat, lng, locations) {
  var a = DEMO4A_num_(lat), o = DEMO4A_num_(lng); if (isNaN(a) || isNaN(o)) return '';
  var hit = '';
  (locations || []).forEach(function (l) {
    if (hit) return;
    var canon = DEMO4A_canonLocType_(DEMO4A_locType_(l)); if (!DEMO4A_GATEWAY_CENTROID_TYPES_[canon]) return;
    var la = DEMO4A_num_(l.latitude), lo = DEMO4A_num_(l.longitude); if (isNaN(la) || isNaN(lo)) return;
    if (Math.abs(la - a) <= 0.001 && Math.abs(lo - o) <= 0.001) hit = canon + ':' + DEMO4A_locId_(l);
  });
  return hit;
}

// ================================================================================================================
// V3G1(D) — PURE coordinate-proposal validator. Read-only; compares the proposal to LIVE warehouse/location data per
// region and reports a typed status + overall verdict. NEVER authorizes.
// ================================================================================================================
function DEMO4A_validateCoordProposal_(proposal, warehouses, locations) {
  var sel = DEMO4A_selectDestCandidatesByRegion_(warehouses, locations);
  var seenCoord = {}, perRegion = [];
  ['US_WEST', 'US_CENTRAL', 'US_EAST'].forEach(function (rb) {
    var c = sel[rb];
    if (!c) { perRegion.push({ region: rb, status: 'NO_ELIGIBLE_DESTINATION_WAREHOUSE_IN_REGION' }); return; }
    var w = c.w, code = DEMO4A_whCode_(w), na = DEMO4A_normalizeWhAddress_(w);
    var p = (proposal || {})[code.toUpperCase()] || (proposal || {})[code];
    var rec = { region: rb, warehouse_id: DEMO4A_whId_(w), warehouse_code: code, logistics_location_id: c.e.logistics_location_id, live_normalized_address: na.normalized, expected_address_fingerprint: na.fingerprint };
    if (!p) { rec.status = 'PROPOSAL_MISSING_FOR_WAREHOUSE'; perRegion.push(rec); return; }
    rec.proposal_fingerprint_match = DEMO4A_str_(p.address_fingerprint) === na.fingerprint;
    rec.coordinate_valid = DEMO4A_validCoord_(p.latitude, p.longitude);
    rec.canonical_accuracy = DEMO4A_coordAccuracyFacility_(p.coordinate_accuracy);
    rec.facility_grade_accuracy = !!rec.canonical_accuracy;
    rec.source_reference_present = !!DEMO4A_str_(p.coordinate_source_reference);
    // exact declared identity: warehouse_id, warehouse_code, logistics_location_id and region must each match the LIVE
    // selected candidate when the proposal declares them (a declared-but-wrong value is an IDENTITY_MISMATCH, never ignored).
    rec.identity_match = (!p.warehouse_id || DEMO4A_low_(p.warehouse_id) === DEMO4A_low_(DEMO4A_whId_(w)))
      && (!p.warehouse_code || DEMO4A_low_(p.warehouse_code) === DEMO4A_low_(code))
      && (!p.logistics_location_id || DEMO4A_low_(p.logistics_location_id) === DEMO4A_low_(c.e.logistics_location_id))
      && (!p.region || DEMO4A_low_(p.region) === DEMO4A_low_(rb));
    // country/region agreement: a declared proposal country must equal the LIVE warehouse country, and the coordinate must
    // fall inside that country's bounding box when one is known (an out-of-country coordinate is never the facility).
    var cty = DEMO4A_whCountry_(w), bounds = DEMO4A_COORD_COUNTRY_BOUNDS_[DEMO4A_low_(cty)] || null;
    rec.country_bounds_known = !!bounds;
    rec.country_region_match = (!p.country || DEMO4A_low_(p.country) === DEMO4A_low_(cty)) && (!rec.coordinate_valid || !bounds || DEMO4A_coordInBounds_(p.latitude, p.longitude, bounds));
    // gateway/centroid substitution: refuse a coordinate that IS a live port/airport/border/hub/centroid location's
    // coordinate (an airport or seaport gateway is NEVER relabelled the destination facility).
    var gw = DEMO4A_gatewayCoordMatch_(p.latitude, p.longitude, locations);
    rec.gateway_or_centroid_coordinate = gw ? gw : '';
    var ck = rec.coordinate_valid ? (DEMO4A_num_(p.latitude).toFixed(5) + ',' + DEMO4A_num_(p.longitude).toFixed(5)) : '';
    rec.duplicate_coordinate = ck !== '' && !!seenCoord[ck]; if (ck) seenCoord[ck] = 1;
    if (!rec.coordinate_valid) rec.status = 'COORDINATE_INVALID';
    else if (!rec.facility_grade_accuracy) rec.status = 'ACCURACY_NOT_FACILITY_GRADE';
    else if (!rec.source_reference_present) rec.status = 'SOURCE_REFERENCE_MISSING';
    else if (!rec.identity_match) rec.status = 'IDENTITY_MISMATCH';
    else if (rec.gateway_or_centroid_coordinate) rec.status = 'GATEWAY_OR_CENTROID_COORDINATE_SUBSTITUTION';
    else if (!rec.country_region_match) rec.status = 'COUNTRY_REGION_DISAGREEMENT';
    else if (rec.duplicate_coordinate) rec.status = 'DUPLICATE_COORDINATE_ACROSS_FACILITIES';
    else if (!rec.proposal_fingerprint_match) rec.status = 'ADDRESS_FINGERPRINT_STALE';
    else rec.status = 'PROPOSAL_READY_FOR_USER_REVIEW';
    perRegion.push(rec);
  });
  var ready = perRegion.filter(function (r) { return r.status === 'PROPOSAL_READY_FOR_USER_REVIEW'; }).length;
  var anyStale = perRegion.some(function (r) { return r.status === 'ADDRESS_FINGERPRINT_STALE'; });
  var anyMissing = perRegion.some(function (r) { return r.status === 'PROPOSAL_MISSING_FOR_WAREHOUSE' || r.status === 'NO_ELIGIBLE_DESTINATION_WAREHOUSE_IN_REGION'; });
  var verdict = ready === 3 ? 'THREE_REGION_COORDINATE_PROPOSAL_READY' : anyMissing ? 'COORDINATE_PROPOSAL_INCOMPLETE' : anyStale ? 'COORDINATE_PROPOSAL_STALE' : 'COORDINATE_PROPOSAL_UNVERIFIED';
  return { verdict: verdict, per_region: perRegion, proposal_entries: Object.keys(proposal || {}).length, authority_armed: DEMO4A_coordAuthorityArmed_(DEMO4A_DEST_COORD_AUTHORITY_) };
}
function TEMP_DEMO4A_VALIDATE_DESTINATION_COORDINATE_PROPOSAL() {
  var out = { tool: 'TEMP_DEMO4A_VALIDATE_DESTINATION_COORDINATE_PROPOSAL', mode: 'STRICTLY READ-ONLY (no write; never authorizes)', output_contract: 'ONE_COMPACT_PRIMARY_LOG_ENTRY (per-region status + verdict)' };
  try {
    var masters = DEMO4A_readMasters_();
    out.masters_present = masters.present;
    var d = DEMO4A_validateCoordProposal_(DEMO4A_DEST_COORD_PROPOSAL_, masters.warehouses, masters.locations);
    Object.keys(d).forEach(function (k) { out[k] = d[k]; });
  } catch (e) { out.verdict = 'COORDINATE_PROPOSAL_UNVERIFIED'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES';
  Logger.log('DEMO4A_VALIDATE_COORD_PROPOSAL ' + JSON.stringify(out, null, 2)); return out;
}
// PURE diagnostic core for warehouse↔location authority. Read-only; COMPACT (counts + ≤5 fingerprints; never all rows).
// V3G(G) truthfulness fixes: (1) report record_status when the column IS present (never assert absence); (2) audit RAW
// location_type + lifecycle over ALL warehouse-backed rows BEFORE any coordinate-validity filter (fulfillment_center /
// third_party_warehouse recognized, not UNKNOWN); (3) report business-IDENTITY readiness SEPARATELY from coordinate
// readiness; (4) classify the DEMO_ADDRESS_DERIVED coordinate branch. coordAuthority (optional) enables the derived branch.
function DEMO4A_diagnoseWarehouseLocationAuthority_(warehouses, locations, coordAuthority) {
  function s(v) { return DEMO4A_str_(v); } function low(v) { return DEMO4A_low_(v); }
  var whHeaders = (warehouses && warehouses[0]) ? Object.keys(warehouses[0]) : [];
  var locHeaders = (locations && locations[0]) ? Object.keys(locations[0]) : [];
  var whHasWarehouseId = whHeaders.map(function (h) { return low(h); }).indexOf('warehouse_id') !== -1;
  var locHasWarehouseId = locHeaders.map(function (h) { return low(h); }).indexOf('warehouse_id') !== -1;
  var locHasRecordStatus = locHeaders.map(function (h) { return low(h); }).indexOf('record_status') !== -1;
  // warehouse coordinate fields found (expected: NONE) — audited: warehouses carry no coordinate.
  var whCoordFields = whHeaders.filter(function (h) { return /^(lat|latitude|lon|lng|longitude|coordinate)/.test(low(h)); });
  if (!warehouses || !warehouses.length || !whHasWarehouseId || !locHasWarehouseId) {
    return { verdict: 'WAREHOUSE_SCHEMA_AUTHORITY_UNRESOLVED', warehouses_headers: whHeaders, logistics_locations_headers: locHeaders,
      warehouse_coordinate_fields_found: whCoordFields, warehouses_present: !!(warehouses && warehouses.length), warehouse_id_column_present: whHasWarehouseId, logistics_warehouse_id_column_present: locHasWarehouseId,
      record_status_column_present: locHasRecordStatus, production_map_warehouse_coordinate_fallback_source_proven: false };
  }
  function bump(o, k) { o[k] = (o[k] || 0) + 1; }
  var destWh = (warehouses || []).filter(function (w) { return DEMO4A_whActive_(w) && DEMO4A_whDestTypeCompatible_(w); });
  var destWhIds = {}; destWh.forEach(function (w) { destWhIds[low(DEMO4A_whId_(w))] = 1; });
  // (2) RAW location_type + lifecycle audit over ALL warehouse-backed rows, BEFORE any coordinate-validity filter.
  var rawTypeAudit = {}, verificationCountsAll = {}, recordStatusCounts = {};
  (locations || []).forEach(function (l) {
    var wl = low(s(DEMO4A_get_(l, ['warehouse_id']))); if (!wl || !destWhIds[wl]) return;   // warehouse-backed rows only
    var raw = DEMO4A_locType_(l) || '(blank)', canon = DEMO4A_canonLocType_(raw === '(blank)' ? '' : raw);
    var e = rawTypeAudit[raw] || (rawTypeAudit[raw] = { raw_token: raw, count: 0, canonical_mapping: canon, recognized: (canon !== '' && canon !== 'UNKNOWN'), examples: [] });
    e.count++; if (e.examples.length < 3) e.examples.push(DEMO4A_hash_(DEMO4A_locId_(l)));
    bump(verificationCountsAll, low(DEMO4A_get_(l, ['verification_status'])) || '(blank)');
    if (locHasRecordStatus) bump(recordStatusCounts, low(DEMO4A_get_(l, ['record_status'])) || '(blank)');
  });
  var rawTypeTokenAudit = Object.keys(rawTypeAudit).sort().map(function (k) { return rawTypeAudit[k]; });
  // per-warehouse branch classification (identity separate from coordinate).
  var byCompany = {}, byCountry = {}, byRegion = {}, byType = {}, byMarketplace = {};
  var branchCounts = { WAREHOUSE_LOCATION_COORDINATE_READY: 0, DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE: 0, WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING: 0, WAREHOUSE_LOCATION_JOIN_MISSING: 0, WAREHOUSE_LOCATION_JOIN_CONFLICT: 0 };
  var joinedFbaByRegion = { US_WEST: 0, US_CENTRAL: 0, US_EAST: 0, OTHER: 0 };
  var joinedValidCoord = 0, joinedBlankCoord = 0, verificationCounts = {}, examples = [];
  var identityReadyCount = 0, addressReadyCount = 0, coordinateReadyCount = 0, joinedOk = 0;
  destWh.forEach(function (w) {
    bump(byCompany, s(DEMO4A_whCompany_(w)) || '(blank)'); bump(byCountry, s(DEMO4A_whCountry_(w)) || '(blank)');
    bump(byRegion, s(DEMO4A_whRegion_(w)) || '(blank)'); bump(byType, DEMO4A_whType_(w) || '(blank)'); bump(byMarketplace, s(DEMO4A_whMarketplace_(w)) || '(blank)');
    var addr = DEMO4A_addressAuthority_(w);
    if (addr.status === 'ADDRESS_AUTHORITY_READY') addressReadyCount++;
    var r = DEMO4A_resolveWarehouseDestination_(w, locations, coordAuthority, null);
    bump(branchCounts, r.branch);
    if (r.identity_ready) identityReadyCount++;
    if (r.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY' || r.branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE') coordinateReadyCount++;
    if (r.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY' || r.branch === 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING' || r.branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE') {
      joinedOk++;
      if (r.location) bump(verificationCounts, low(DEMO4A_get_(r.location, ['verification_status'])) || '(blank)');
      if (DEMO4A_validCoord_(r.latitude, r.longitude)) joinedValidCoord++; else joinedBlankCoord++;
      if (low(DEMO4A_whCountry_(w)) === 'us') joinedFbaByRegion[DEMO4A_dxRegionBucket_(DEMO4A_whRegion_(w))]++;
    }
    if (examples.length < 5) examples.push({ warehouse_fp: DEMO4A_hash_(DEMO4A_whId_(w)), warehouse_type: DEMO4A_whType_(w), country: s(DEMO4A_whCountry_(w)), region: s(DEMO4A_whRegion_(w)), branch: r.branch, identity_ready: !!r.identity_ready, address_status: r.address_status || '', location_fp: r.logistics_location_id ? DEMO4A_hash_(r.logistics_location_id) : '', location_type: r.location_type || '', verification_status: r.verification_status || '' });
  });
  var missing = branchCounts.WAREHOUSE_LOCATION_JOIN_MISSING, conflict = branchCounts.WAREHOUSE_LOCATION_JOIN_CONFLICT;
  var coordReady = branchCounts.WAREHOUSE_LOCATION_COORDINATE_READY + branchCounts.DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE, pending = branchCounts.WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING;
  var verdict = destWh.length === 0 ? 'WAREHOUSE_LOCATION_JOIN_MISSING'
    : conflict > 0 ? 'WAREHOUSE_LOCATION_JOIN_CONFLICT'
    : coordReady > 0 ? 'WAREHOUSE_LOCATION_AUTHORITY_READY'
    : pending > 0 ? 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING'
    : 'WAREHOUSE_LOCATION_JOIN_MISSING';
  return {
    verdict: verdict,
    warehouses_headers: whHeaders, logistics_locations_headers: locHeaders, warehouse_coordinate_fields_found: whCoordFields, record_status_column_present: locHasRecordStatus,
    active_destination_warehouse_count: destWh.length,
    identity_readiness: { business_identity_ready: identityReadyCount, address_authority_ready: addressReadyCount },   // (3) identity reported separate from coordinate
    coordinate_readiness: { display_coordinate_ready: coordinateReadyCount, coordinate_pending: pending },
    destination_warehouses_by: { company: byCompany, country: byCountry, region: byRegion, warehouse_type: byType, marketplace: byMarketplace },
    warehouse_backed_raw_location_type_audit: rawTypeTokenAudit,   // (2) raw-type audit BEFORE coordinate filtering
    warehouse_id_join: { warehouse_rows: (warehouses || []).length, active_destination_warehouses: destWh.length, joined_ok: joinedOk, missing_joins: missing, conflicting_joins: conflict },
    joined_fba_3pl_by_region: joinedFbaByRegion, joined_rows_valid_coordinate: joinedValidCoord, joined_rows_blank_coordinate: joinedBlankCoord,
    verification_status_counts: verificationCounts, verification_status_counts_all_warehouse_backed: verificationCountsAll,
    record_status_counts: locHasRecordStatus ? recordStatusCounts : '(record_status column not present in this dataset)',   // (1) truthful — never assert absence when present
    branch_counts: branchCounts, production_map_warehouse_coordinate_fallback_source_proven: false,
    safe_examples: examples
  };
}
function TEMP_DEMO4A_DIAGNOSE_WAREHOUSE_LOCATION_AUTHORITY() {
  var out = { tool: 'TEMP_DEMO4A_DIAGNOSE_WAREHOUSE_LOCATION_AUTHORITY', mode: 'STRICTLY READ-ONLY (getSheetByName + getValues only)', output_contract: 'ONE_COMPACT_PRIMARY_LOG_ENTRY (counts + <=5 fingerprints; never all rows)' };
  try {
    var masters = DEMO4A_readMasters_();
    out.masters_present = masters.present;
    var d = DEMO4A_diagnoseWarehouseLocationAuthority_(masters.warehouses, masters.locations, DEMO4A_DEST_COORD_AUTHORITY_);
    Object.keys(d).forEach(function (k) { out[k] = d[k]; });
    out.demo_dest_coord_authority_entries = Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length;   // 0 until the operator pastes reviewed coordinates
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
// V3G(E) — audited frontend map DESTINATION-coordinate consumption. Inline shipment_routes lat/lng ARE consumed at the
// NODE level (resolveNodeCoord → resolveCurrentPosition, global-logistics-map.js:255-265; the terminal route node plots
// on a selected shipment). The DEDICATED destination-endpoint fallback marker (resolveDestinationCoord, :267) reads ONLY a
// warehouse-linked logistics_locations coordinate — it does NOT read inline route/event coords. So an address-derived-only
// destination renders as a route-node dot (On-The-Way per-shipment view) but NOT as the labeled endpoint fallback.
var DEMO4A_MAP_DEST_COORD_CONSUMPTION_ = {
  inline_route_node_coordinate_rendered: true,   // resolveNodeCoord reads inline lat/lng first → the destination node plots at the coordinate
  // V3G3(B) — the endpoint consumer is now CLOSED. resolveDestinationCoord keeps the exact warehouse→logistics master
  // coordinate as its HIGHEST priority and, only when that is absent, consumes THIS shipment's proven final destination
  // route row (resolveDestinationRouteNode): verified sequence_no ordering with a unique terminal, exact shipment_id, not a
  // recognized transit gateway, not the current marker, location_ref_type = logistics_location whose location_ref_id
  // resolves to a logistics_locations row whose warehouse_id IS the shipment's destination warehouse, and a valid
  // non-(0,0) in-range coordinate. Everything else fails closed. So the ADDRESS-DERIVED destination is now a LABELLED
  // destination endpoint, not just an unlabelled route dot.
  dedicated_destination_endpoint_reads_proven_terminal_route_row: true,
  destination_endpoint_precedence: ['DEST_WAREHOUSE_LOCATION (exact warehouse_id → warehouse-linked logistics coordinate)', 'DEST_ROUTE_TERMINAL_NODE (this shipment\'s proven final destination route row)', 'UNRESOLVED (fail closed)'],
  destination_route_row_lineage_gates: ['verified_sequence_no_ordering_unique_terminal', 'exact_shipment_id', 'not_recognized_gateway_node', 'not_current_marker', 'location_ref_type_logistics_location', 'location_ref_id_resolves', 'referenced_location_warehouse_id_equals_destination_warehouse', 'valid_non_zero_in_range_coordinate'],
  destination_display_complete_for_master_coordinate_branch: true,
  destination_display_complete_for_address_derived_branch: true,
  frontend_blocker: '',   // CLOSED in V3G3 (was MAP_DESTINATION_DISPLAY_NOT_COMPLETE)
  note: 'Inline route node renders (resolveNodeCoord, unchanged); the destination endpoint consumes the master coordinate first and otherwise the PROVEN terminal destination route row. No runtime geocoding, no network call, no second competing resolver.'
};
// V3G2(F) — PURE PREFLIGHT failure-reason mapping, extracted so the typed contract is executable WITHOUT a live run.
// A build that failed while warehouses ARE present but the coordinate authority is NOT armed reports the true root cause
// (DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED) and keeps the raw build reason as underlying_reason — an early
// template-selection failure caused by blank live FBA coordinates must never be reported as a plan-count problem.
// An identity failure (DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY) is NOT reinterpreted: it is real regardless of arming.
function DEMO4A_preflightFailureReason_(plan, schemaOk) {
  plan = plan || {};
  var notArmed = plan.warehouses_present === true && plan.coord_authority_armed === false && plan.reason !== 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY';
  if (notArmed) return { reason: 'DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED', underlying_reason: plan.reason, coordinate_authority_armed: false, verdict: 'PREFLIGHT_FAILED_COORDINATE_AUTHORITY_NOT_ARMED' };
  var verdict = (plan.reason === 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY' || plan.reason === 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED') ? 'PREFLIGHT_FAILED_WAREHOUSE_AUTHORITY'
    : (plan.reason === 'DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED' ? 'PREFLIGHT_FAILED_COORDINATE_AUTHORITY_NOT_ARMED' : (schemaOk ? 'PREFLIGHT_FAILED' : 'PREFLIGHT_FAILED_SCHEMA'));
  return { reason: plan.reason, verdict: verdict };
}
// per-branch expected map display status for a resolved destination authority.
function DEMO4A_mapDestinationDisplayStatus_(branch) {
  // V3G3 — both resolved branches now reach a LABELLED destination endpoint: the master-coordinate branch through
  // DEST_WAREHOUSE_LOCATION, the address-derived branch through the proven DEST_ROUTE_TERMINAL_NODE consumer.
  if (branch === 'WAREHOUSE_LOCATION_COORDINATE_READY') return 'MAP_DESTINATION_DISPLAY_COMPLETE';
  if (branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE') return 'MAP_DESTINATION_DISPLAY_COMPLETE';
  return 'MAP_DESTINATION_NOT_RENDERABLE';
}
// the frontend endpoint source a resolved branch is expected to use (source-audited contract, not a runtime call).
function DEMO4A_mapDestinationEndpointSource_(branch) {
  if (branch === 'WAREHOUSE_LOCATION_COORDINATE_READY') return 'DEST_WAREHOUSE_LOCATION';
  if (branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE') return 'DEST_ROUTE_TERMINAL_NODE';
  return '';
}
// V3G(F) — SEVEN separate PREFLIGHT gates. Identity/address readiness are reported SEPARATELY from coordinate readiness; a
// blank master coordinate (ADDRESS_SEEDED_COORDINATES_PENDING) NEVER by itself fails business identity or received-status.
// READY still requires a real, source-bound display coordinate (logistics OR reviewed address-derived) so the map renders.
function DEMO4A_warehouseGates_(present, authority, errors, routeGeographyOk, sourceDestLineageOk) {
  if (!present) return { applicable: false, note: 'warehouses master absent — legacy logistics-only binding (no warehouse authority gate)' };
  var slots = Object.keys(authority || {});
  function every(pred) { return slots.length > 0 && slots.every(function (s) { return pred(authority[s] || {}); }); }
  function ready(r) { return r.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY' || r.branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE'; }
  var identity = every(function (r) { return r.identity_ready === true || r.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY'; });
  var address = every(function (r) { return r.address_status === 'ADDRESS_AUTHORITY_READY' || (r.identity_ready === true) || r.branch === 'WAREHOUSE_LOCATION_COORDINATE_READY'; });
  var lineage = every(function (r) { return r.branch !== 'WAREHOUSE_LOCATION_JOIN_CONFLICT'; });   // 0/1 join ok; >1 = fail
  var coord = every(ready);
  var mapConsumes = DEMO4A_MAP_DEST_COORD_CONSUMPTION_.inline_route_node_coordinate_rendered === true;   // node-level inline render (audited)
  var truthful = coord;   // received/facility marker emitted ONLY at a coordinate-ready facility (fail-closed guarantees it)
  var routeGeo = (routeGeographyOk === undefined) ? true : !!routeGeographyOk;
  var srcDest = (sourceDestLineageOk === undefined) ? true : !!sourceDestLineageOk;   // V3G5A(G)
  return { applicable: true,
    warehouse_business_identity_ready: identity, warehouse_address_authority_ready: address, warehouse_location_lineage_ready: lineage,
    destination_display_coordinate_ready: coord, map_consumes_destination_coordinate: mapConsumes, status_truthfulness_ready: truthful, route_geography_ready: routeGeo,
    source_destination_warehouse_lineage_ready: srcDest,
    map_destination_coordinate_consumption: DEMO4A_MAP_DEST_COORD_CONSUMPTION_,
    ok: identity && address && lineage && coord && mapConsumes && truthful && routeGeo && srcDest, errors: errors || [] };
}
// V3G4A — the PURE PREFLIGHT verdict rule, extracted so PREFLIGHT and the compact authorization envelope share ONE rule
// (no second approximate evaluator). Inputs are the already-computed schema flag, plan, warehouse gates and classification.
function DEMO4A_preflightVerdict_(schemaOk, plan, warehouseGates, classification) {
  if (!schemaOk) return 'PREFLIGHT_FAILED_SCHEMA';
  if (!(plan && plan.binding_gates && plan.binding_gates.ok)) return 'PREFLIGHT_FAILED_BINDING_GATES';
  if (warehouseGates && warehouseGates.applicable && !warehouseGates.ok) return 'PREFLIGHT_FAILED_WAREHOUSE_AUTHORITY';
  if (classification === 'ABSENT_ALL') return 'READY_FOR_DEMO_SEED';
  if (classification === 'PRESENT_EXACT_ALL') return 'ALREADY_SEEDED_EXACT';
  return 'BLOCKED_' + DEMO4A_str_(classification);
}

// ================================================================================================================
// V3G4A — COMPACT READ-ONLY AUTHORIZATION ENVELOPE (pure core).
// The V3G4 live PREFLIGHT reached the correct warehouse-aware path but its single Logger entry was TRUNCATED before the
// verdict, existing_state, the full gates, West/Central evidence, demo_plan_checksum and the zero-write marker. This core
// produces one deliberately SMALL envelope carrying exactly the authorization-relevant facts, so nothing decision-bearing
// can be lost to truncation. It re-uses the SAME pure logic as PREFLIGHT/DRY_RUN (DEMO4A_buildPlan_, DEMO4A_bindingGates_
// via plan.binding_gates, DEMO4A_warehouseGates_, DEMO4A_classifyState_, DEMO4A_validateCoordProposal_,
// DEMO4A_preflightVerdict_) and NEVER re-implements an approximate evaluator. Excluded on purpose: headers, master rows,
// destination_authority_errors, rejection examples, binding_evidence, route/event rows, SKU pairs, the checksummed
// manifest and per-field validation arrays. On failure only reason counts and at most five short reason codes are kept.
// ================================================================================================================
var DEMO4A_AUTHORIZATION_CONTRACT_VERSION_ = 'V3G4A-1';
var DEMO4A_AUTH_MAX_REASON_CODES_ = 5;
function DEMO4A_authorizationSummary_(schema, masters, plan, planRepeat, live, proposalValidation) {
  var out = { authority_contract_version: DEMO4A_AUTHORIZATION_CONTRACT_VERSION_ };
  var mp = (masters && masters.present) || {};
  out.schema_ok = !!(schema && schema.ok);
  out.masters_ok = ['shipment_route_templates', 'shipment_route_template_nodes', 'logistics_locations', 'marketplace_skus', 'sku_details', 'warehouses'].every(function (k) { return mp[k] === true; });
  var pv = proposalValidation || {};
  out.proposal_verdict = DEMO4A_str_(pv.verdict);
  out.proposal_entries = DEMO4A_num_(pv.proposal_entries) || 0;
  out.coordinate_authority_armed = DEMO4A_coordAuthorityArmed_(DEMO4A_DEST_COORD_AUTHORITY_);
  out.coordinate_authority_entries = Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length;

  plan = plan || {};
  out.warehouse_aware_template_evaluation = plan.warehouse_aware_template_evaluation === true;
  out.qualified_count = DEMO4A_num_(plan.qualified_count) || 0;
  out.current_capable_count = DEMO4A_num_(plan.current_capable_count) || 0;
  out.region_selection_mode = DEMO4A_str_(plan.region_selection_mode);
  out.available_regions = plan.available_regions || {};

  if (!plan.ok) {
    // D — failure path stays tiny: reason counts + at most five distinct SHORT reason codes. No examples, no dumps.
    out.selected_templates = []; out.scope = null; out.planned_counts = null; out.per_shipment = [];
    var rc = plan.rejection_counts || {};
    out.rejection_counts = rc;
    out.reason_codes = Object.keys(rc).slice(0, DEMO4A_AUTH_MAX_REASON_CODES_);
    out.gate_summary = { all_pass: false };
    var sasF = plan.source_authority_summary || DEMO4A_sourceAuthoritySummary_(null);
    out.source_factory_candidate_count = sasF.source_factory_candidate_count;
    out.source_factory_rejection_counts = sasF.source_factory_rejection_counts;
    out.source_shipping_enabled_gate_applied = sasF.source_shipping_enabled_gate_applied;
    out.source_factory_shared_across_companies = sasF.source_factory_shared_across_companies;
    out.source_company_match_required = sasF.source_company_match_required;
    out.existing_state = { classification: '', duplicate_pk_count_total: 0, unexpected_demo_id_count: 0 };
    out.demo_plan_checksum = '';
    out.preflight_verdict = DEMO4A_preflightFailureReason_(plan, out.schema_ok).verdict;
    out.preflight_reason = DEMO4A_preflightFailureReason_(plan, out.schema_ok).reason;
    out.predicted_dry_run_verdict = 'DRY_RUN_BLOCKED';
    out.may_run_dry_run = false; out.may_arm_commit_checksum = false;
    return out;
  }

  out.selected_templates = (plan.chosen_templates || []).map(function (c) { return { template_id: DEMO4A_str_(c.route_template_id), region: DEMO4A_str_(c.region), node_count: DEMO4A_num_(c.node_count) || 0 }; });
  var sc = plan.scope || {};
  out.scope = { company: DEMO4A_str_(sc.company), country: DEMO4A_str_(sc.country), marketplace: DEMO4A_str_(sc.marketplace), sku_pair_count: (sc.sku_pairs || []).length || DEMO4A_num_(sc.sku_pair_count) || 0 };
  var ct = plan.counts || {};
  out.planned_counts = { shipping_plans: DEMO4A_num_(ct.shipping_plans) || 0, shipping_plan_lines: DEMO4A_num_(ct.shipping_plan_lines) || 0, shipments: DEMO4A_num_(ct.shipments) || 0,
    shipment_lines: DEMO4A_num_(ct.shipment_lines) || 0, shipment_routes: DEMO4A_num_(ct.shipment_routes) || 0, shipment_events: DEMO4A_num_(ct.shipment_events) || 0, total: DEMO4A_num_(ct.total) || 0 };
  // exactly three compact per-shipment objects — ONLY the authorization-relevant identity/lineage/coordinate facts.
  out.per_shipment = (plan.per_shipment || []).map(function (x) {
    return { shipment_id: DEMO4A_str_(x.shipment_id), slot: DEMO4A_str_(x.slot), status: DEMO4A_str_(x.status), template_id: DEMO4A_str_(x.template), region: DEMO4A_str_(x.region),
      destination_warehouse_id: DEMO4A_str_(x.destination_warehouse_id), destination_warehouse_code: DEMO4A_str_(x.destination_warehouse_code),
      source_warehouse_id: DEMO4A_str_(x.source_warehouse_id), source_warehouse_code: DEMO4A_str_(x.source_warehouse_code), source_selection_branch: DEMO4A_str_(x.source_selection_branch),
      source_warehouse_company: DEMO4A_str_(x.source_warehouse_company), source_warehouse_owner: DEMO4A_str_(x.source_warehouse_owner),
      source_company_match: x.source_company_match === true, source_shared_factory_authorized: x.source_shared_factory_authorized === true,
      destination_logistics_location_id: DEMO4A_str_(x.destination_logistics_location_id), destination_coordinate_branch: DEMO4A_str_(x.destination_coordinate_branch),
      destination_address_fingerprint: DEMO4A_str_(x.destination_address_fingerprint), destination_coordinate_accuracy: DEMO4A_str_(x.destination_coordinate_accuracy),
      destination_renderable: x.destination_facility_marker_renderable === true,
      origin_location_id: DEMO4A_str_(x.origin_location_id), current_location_id: DEMO4A_str_(x.current_location_id),
      route_rows: DEMO4A_num_(x.route_rows) || 0, event_rows: DEMO4A_num_(x.event_rows) || 0, plan_lines: DEMO4A_num_(x.plan_lines) || 0, shipment_lines: DEMO4A_num_(x.shipment_lines) || 0 };
  });

  var bg = plan.binding_gates || {}, wg = DEMO4A_warehouseGates_(plan.warehouses_present, plan.destination_authority, null, bg.ok);
  // live_plan_shape_valid — the planned shape itself: exactly three plans/shipments, three per-shipment objects, and a
  // positive row count in every one of the six tables (a structurally impossible seed can never be authorized).
  var shapeOk = out.planned_counts.shipping_plans === 3 && out.planned_counts.shipments === 3 && out.per_shipment.length === 3
    && out.planned_counts.shipping_plan_lines > 0 && out.planned_counts.shipment_lines > 0 && out.planned_counts.shipment_routes > 0 && out.planned_counts.shipment_events > 0
    && out.planned_counts.total === (out.planned_counts.shipping_plans + out.planned_counts.shipping_plan_lines + out.planned_counts.shipments + out.planned_counts.shipment_lines + out.planned_counts.shipment_routes + out.planned_counts.shipment_events);
  var gs = {
    all_role_bindings_compatible: bg.all_role_bindings_compatible === true,
    all_corridor_bindings_compatible: bg.all_corridor_bindings_compatible === true,
    primary_current_distinct: bg.primary_current_distinct === true,
    no_unrelated_third_country: bg.no_unrelated_third_country === true,
    sea_truck_destination_not_airport: bg.sea_truck_destination_not_airport === true,
    warehouse_business_identity_ready: wg.warehouse_business_identity_ready === true,
    warehouse_address_authority_ready: wg.warehouse_address_authority_ready === true,
    warehouse_location_lineage_ready: wg.warehouse_location_lineage_ready === true,
    destination_display_coordinate_ready: wg.destination_display_coordinate_ready === true,
    map_consumes_destination_coordinate: wg.map_consumes_destination_coordinate === true,
    status_truthfulness_ready: wg.status_truthfulness_ready === true,
    route_geography_ready: wg.route_geography_ready === true,
    source_destination_warehouse_lineage_ready: (plan.binding_gates || {}).source_destination_warehouse_lineage_ready === true,
    live_plan_shape_valid: shapeOk
  };
  gs.all_pass = Object.keys(gs).every(function (k) { return k === 'all_pass' || gs[k] === true; });
  out.gate_summary = gs;

  var cls = DEMO4A_classifyState_(plan, live);
  var dupTotal = 0; Object.keys(cls.duplicate_pk_counts || {}).forEach(function (k) { dupTotal += DEMO4A_num_(cls.duplicate_pk_counts[k]) || 0; });
  out.existing_state = { classification: DEMO4A_str_(cls.classification), duplicate_pk_count_total: dupTotal, unexpected_demo_id_count: (cls.unexpected_demo_ids || []).length };
  out.demo_plan_checksum = DEMO4A_str_(plan.checksum);
  // V3G5B(L) - the compact source/destination lineage facts, so an operator can see WHICH warehouses (and by which
  // branch) the plan bound without reading any master dump. Capped at the three Demo shipments.
  var sdl = plan.source_destination_warehouse_lineage || {};
  out.source_destination_warehouse_lineage = {
    ready: sdl.source_destination_warehouse_lineage_ready === true,
    source_warehouse_ids: (sdl.source_warehouse_ids || []).slice(0, 3), source_warehouse_codes: (sdl.source_warehouse_codes || []).slice(0, 3),
    source_selection_branches: (sdl.source_selection_branches || []).slice(0, 3),
    destination_warehouse_ids: (sdl.destination_warehouse_ids || []).slice(0, 3), destination_warehouse_codes: (sdl.destination_warehouse_codes || []).slice(0, 3),
    reasons: (sdl.reasons || []).slice(0, DEMO4A_AUTH_MAX_REASON_CODES_), reason_count: DEMO4A_num_(sdl.reason_count) || 0 };
  var sas = plan.source_authority_summary || DEMO4A_sourceAuthoritySummary_(null);
  out.source_factory_candidate_count = sas.source_factory_candidate_count;
  out.source_factory_rejection_counts = sas.source_factory_rejection_counts;
  out.source_shipping_enabled_gate_applied = sas.source_shipping_enabled_gate_applied;
  out.source_factory_shared_across_companies = sas.source_factory_shared_across_companies;
  out.source_company_match_required = sas.source_company_match_required;
  out.source_shared_factory_authorized = sas.source_shared_factory_authorized;
  out.source_destination_warehouse_lineage.source_warehouse_companies = (sdl.source_warehouse_companies || []).slice(0, 3);
  out.source_destination_warehouse_lineage.source_warehouse_owners = (sdl.source_warehouse_owners || []).slice(0, 3);
  out.preflight_verdict = DEMO4A_preflightVerdict_(out.schema_ok, plan, wg, cls.classification);
  out.preflight_reason = out.preflight_verdict === 'READY_FOR_DEMO_SEED' ? '' : DEMO4A_str_(plan.reason);
  // the DRY_RUN core verdict for exactly this plan (DRY_RUN emits DRY_RUN_READY whenever the same plan builds).
  out.predicted_dry_run_verdict = 'DRY_RUN_READY';

  // C — the FULL authorization conjunction. Every clause must hold; any single false blocks DRY_RUN authorization.
  var regionsCovered = out.selected_templates.map(function (t) { return t.region; }).sort().join(',') === 'US_CENTRAL,US_EAST,US_WEST';
  var ar = out.available_regions;
  out.may_run_dry_run = out.schema_ok === true
    && out.masters_ok === true
    && out.proposal_verdict === 'THREE_REGION_COORDINATE_PROPOSAL_READY'
    && out.proposal_entries === 3
    && out.coordinate_authority_armed === true
    && out.coordinate_authority_entries === 3
    && out.warehouse_aware_template_evaluation === true
    && out.qualified_count >= 3
    && out.current_capable_count >= 1
    && out.region_selection_mode === 'DISTINCT_WCE'
    && DEMO4A_num_(ar.US_WEST) > 0 && DEMO4A_num_(ar.US_CENTRAL) > 0 && DEMO4A_num_(ar.US_EAST) > 0
    && out.selected_templates.length === 3 && regionsCovered
    && out.per_shipment.length === 3
    && gs.live_plan_shape_valid === true
    && gs.source_destination_warehouse_lineage_ready === true
    && gs.all_pass === true
    && out.existing_state.classification === 'ABSENT_ALL'
    && out.existing_state.duplicate_pk_count_total === 0
    && out.existing_state.unexpected_demo_id_count === 0
    && DEMO4A_str_(out.demo_plan_checksum) !== ''
    && out.preflight_verdict === 'READY_FOR_DEMO_SEED'
    && out.predicted_dry_run_verdict === 'DRY_RUN_READY';
  // may_arm_commit_checksum additionally requires the DRY_RUN core to be re-evaluated READ-ONLY over the same masters and
  // to reproduce the SAME plan checksum (determinism proof). It NEVER writes or modifies DEMO4A_CONFIRMED_SEED_CHECKSUM_ —
  // arming stays an explicit USER paste, and it stays false while that constant is still the placeholder.
  var repeatOk = !!(planRepeat && planRepeat.ok === true && DEMO4A_str_(planRepeat.checksum) === DEMO4A_str_(plan.checksum));
  out.dry_run_core_checksum_reproduced = repeatOk;
  out.confirmation_constant_status = (DEMO4A_CONFIRMED_SEED_CHECKSUM_ === 'PASTE_DEMO_SEED_CHECKSUM_HERE') ? 'PLACEHOLDER' : 'SET';
  out.may_arm_commit_checksum = out.may_run_dry_run === true && repeatOk === true && out.confirmation_constant_status === 'PLACEHOLDER';
  return out;
}

// ================================================================================================================
// ENTRYPOINT 0 — COMPACT READ-ONLY AUTHORIZATION SUMMARY. Exactly ONE Logger entry; never calls PREFLIGHT/DRY_RUN (so no
// nested verbose log is produced) and never parses another log entry.
// ================================================================================================================
function TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION() {
  var out = { tool: 'TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION', mode: 'STRICTLY READ-ONLY (getSheetByName + getValues only; no row/cell/property/flag write)', output_contract: 'ONE_COMPACT_LOG_ENTRY (truncation-safe authorization envelope)' };
  try {
    DEMO4A_syncCanonTz_();
    var schema = DEMO4A_schemaGate_();
    var masters = DEMO4A_readMasters_();
    var plan = DEMO4A_buildPlan_(masters);
    var planRepeat = DEMO4A_buildPlan_(masters);   // read-only determinism re-evaluation of the same DRY_RUN core
    var live = DEMO4A_readLive_();
    var proposal = DEMO4A_validateCoordProposal_(DEMO4A_DEST_COORD_PROPOSAL_, masters.warehouses, masters.locations);
    var envelope = DEMO4A_authorizationSummary_(schema, masters, plan, planRepeat, live, { verdict: proposal.verdict, proposal_entries: proposal.proposal_entries });
    Object.keys(envelope).forEach(function (k) { out[k] = envelope[k]; });
  } catch (e) {
    out.preflight_verdict = 'AUTHORIZATION_SUMMARY_THREW'; out.preflight_reason = (e && e.message) ? e.message : String(e);
    out.may_run_dry_run = false; out.may_arm_commit_checksum = false;
  }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES';
  Logger.log('DEMO4A_AUTHORIZATION_SUMMARY ' + JSON.stringify(out));   // COMPACT: no pretty-printing (truncation safety)
  return out;
}

// ================================================================================================================
// V3G5(D) — STRICTLY READ-ONLY PRE-RETRY CANONICALIZATION DIAGNOSTIC. Exactly one compact log. It inspects the real
// six-table physical headers and the number formats / value types of EXISTING cells, projects the intended plan through
// the shared canonicalization contract, and predicts round-trip risk. It performs NO Sheet write and therefore performs
// NO actual write/read round trip — every risk it reports is a STATIC prediction, never an observed round trip.
// ================================================================================================================
function DEMO4A_canonDiagnosticCore_(schema, masters, plan, headersByTable, columnTypeClasses, tz, journalPresent, existingClassification, lineageGate, clearTokenPlaceholder) {
  var out = { contract_version: DEMO4A_CANON_CONTRACT_VERSION_, round_trip_performed: false };
  out.schema_ok = !!(schema && schema.ok);
  out.plan_checksum = DEMO4A_str_(plan && plan.checksum);
  out.planned_counts = (plan && plan.counts) || null;
  var classCounts = {}, unknown = [], byClass = { date: [], datetime: [], numeric: [], coordinate: [], boolean: [], identifier: [], enum: [], text: [] }, blanks = [];
  var risk = [], seenField = {};
  DEMO4A_WRITE_ORDER_.forEach(function (name) {
    var rows = ((plan && plan.tables) || {})[name] || [];
    var fields = {}; rows.forEach(function (r) { Object.keys(r).forEach(function (k) { fields[k] = 1; }); });
    Object.keys(fields).forEach(function (f) {
      var cls = DEMO4A_fieldClass_(f), key = name + '.' + f;
      classCounts[cls] = (classCounts[cls] || 0) + 1;
      if (!DEMO4A_fieldClassKnown_(f) && unknown.length < 20) unknown.push(key + ':' + cls);
      if (byClass[cls] && !seenField[cls + ':' + f]) { byClass[cls].push(f); seenField[cls + ':' + f] = 1; }
      var anyBlank = rows.some(function (r) { return DEMO4A_isBlankCell_(r[f]); });
      if (anyBlank && blanks.length < 30) blanks.push(key);
      // static risk prediction: a date/datetime written as a STRING will read back as a Date OBJECT whenever the column
      // is date-formatted, and the two sides only agree when the canonical wall-clock offset equals the spreadsheet's.
      if ((cls === 'date' || cls === 'datetime') && rows.some(function (r) { return typeof r[f] === 'string' && DEMO4A_str_(r[f]) !== ''; })) {
        var colClass = ((columnTypeClasses || {})[name] || {})[f] || 'unknown';
        // ONLY the source-proven mechanism is a risk: a date-formatted column returning a Date object is exact as long
        // as the canonical wall-clock offset equals the spreadsheet's (proven by the offline round-trip tests), so a
        // date-formatted column is reported in live_column_number_format_classes but is NOT invented as a risk.
        if (tz && tz.ok === true && Number(tz.offset_min) !== Number(DEMO4A_CANON_TZ_OFFSET_MIN_) && risk.length < 20) risk.push({ table: name, field: f, field_class: cls, column_type_class: colClass, reason_code: 'DATE_WALLCLOCK_OFFSET_MISMATCH' });
      }
    });
  });
  out.field_class_counts = classCounts;
  out.all_intended_fields_have_class = unknown.length === 0;
  out.unknown_field_classes = unknown.slice(0, 20);
  var proj = DEMO4A_writerProjectionGaps_(plan || { tables: {} }, headersByTable);
  out.writer_projection_complete = proj.ok;
  out.writer_projection_missing_total = proj.missing_total;
  out.writer_projection_missing_fields = proj.missing_fields.slice(0, 20);   // J — capped at 20
  out.writer_unowned_column_counts = proj.writer_unowned_column_counts;
  // physical alias resolution — the demo writer owns `marketplace` semantics ONLY where a physical column exists; the
  // Flow-A `marketplace_seperate` authority is NEVER redefined here, only reported.
  var alias = {};
  DEMO4A_WRITE_ORDER_.forEach(function (name) {
    var hs = (headersByTable || {})[name] || [];
    var hasM = hs.indexOf('marketplace') !== -1, hasS = hs.indexOf('marketplace_seperate') !== -1;
    if (hasM || hasS) alias[name] = { marketplace: hasM, marketplace_seperate: hasS };
  });
  out.physical_alias_resolution = alias;
  out.alias_conflict = Object.keys(alias).some(function (t) { var a = alias[t]; return a.marketplace_seperate === true && a.marketplace === false && (((plan.tables || {})[t] || []).some(function (r) { return Object.prototype.hasOwnProperty.call(r, 'marketplace'); })); });
  out.date_fields = byClass.date; out.numeric_fields = byClass.numeric; out.boolean_fields = byClass.boolean;
  out.text_identifier_fields = byClass.identifier.concat(byClass.enum).concat(byClass.text).length;
  out.coordinate_fields = byClass.coordinate; out.datetime_fields = byClass.datetime; out.blank_optional_fields = blanks;
  // V3G5A(J) — the previous COMPLETE per-column number-format dump truncated the log before the authorization-bearing
  // fields. It is replaced by a per-table COUNT summary plus the ACTUAL risky fields only (capped at 20).
  var fmtSummary = {}, fmtRisk = [];
  DEMO4A_WRITE_ORDER_.forEach(function (name) {
    var cc = (columnTypeClasses || {})[name] || {}, sum = { date_formatted_count: 0, numeric_cell_count: 0, text_cell_count: 0, empty_or_general_count: 0 };
    Object.keys(cc).forEach(function (col) {
      var c = cc[col];
      if (c === 'date_formatted') sum.date_formatted_count++;
      else if (c === 'numeric_cell') sum.numeric_cell_count++;
      else if (c === 'text_cell' || c === 'boolean_cell') sum.text_cell_count++;
      else sum.empty_or_general_count++;
      // an ACTUAL format risk: the physical cell type contradicts the declared field class for a field the writer owns.
      var fcls = DEMO4A_fieldClass_(col), rowsOf = (((plan || {}).tables || {})[name] || []);
      var owned = rowsOf.some(function (r) { return Object.prototype.hasOwnProperty.call(r, col); });
      if (!owned || fmtRisk.length >= 20) return;
      // V3G5B(I) - VALUE-AWARE. The mismatch between a physical cell format and a declared field class is only an ACTUAL
      // round-trip risk when at least one INTENDED value is coercible by that format. A non-numeric text value in a
      // numeric-formatted column round-trips exactly (proven by the offline setValues/getValues round-trip tests), so it
      // no longer contributes to risk_count. A numeric-LIKE text value in a non-numeric field stays a real risk.
      function pushRisk(code, pred) {
        var hit = null;
        for (var ri = 0; ri < rowsOf.length; ri++) { var vv = rowsOf[ri][col]; if (!DEMO4A_isBlankCell_(vv) && pred(vv)) { hit = vv; break; } }
        if (hit === null) return false;
        fmtRisk.push({ table: name, field: col, field_class: fcls, column_type_class: c, reason_code: code, example_value: DEMO4A_driftClip_(hit) });
        return true;
      }
      if (c === 'date_formatted' && !(fcls === 'date' || fcls === 'datetime')) pushRisk('DATE_LIKE_VALUE_IN_DATE_FORMATTED_COLUMN', DEMO4A_dateLike_);
      else if (c === 'numeric_cell' && !(fcls === 'numeric' || fcls === 'coordinate')) pushRisk('NUMERIC_LIKE_VALUE_IN_NUMERIC_COLUMN', DEMO4A_numericLike_);
      else if (c === 'boolean_cell' && fcls !== 'boolean') pushRisk('BOOLEAN_LIKE_VALUE_IN_BOOLEAN_COLUMN', DEMO4A_boolLike_);
    });
    fmtSummary[name] = sum;
  });
  out.number_format_summary_by_table = fmtSummary;
  out.number_format_risk_fields = fmtRisk;
  out.format_risk_is_value_aware = true;
  out.predicted_roundtrip_risk_fields = risk.slice(0, 20); out.risk_count = risk.length + fmtRisk.length;
  out.canonicalization_tz = { contract_offset_min: DEMO4A_CANON_TZ_OFFSET_MIN_, spreadsheet_offset_min: tz ? tz.offset_min : null, spreadsheet_time_zone: tz ? DEMO4A_str_(tz.time_zone) : '', resolved: !!(tz && tz.ok) };
  // V3G5A(G) — the source→destination warehouse lineage gate is authorization-bearing and must stay visible.
  var lg = lineageGate || {};
  out.source_destination_warehouse_lineage_ready = lg.source_destination_warehouse_lineage_ready === true;
  out.source_destination_warehouse_lineage_reasons = (lg.reasons || []).slice(0, 8);
  out.source_warehouse_ids = (lg.source_warehouse_ids || []).slice(0, 3);
  out.source_warehouse_codes = (lg.source_warehouse_codes || []).slice(0, 3);
  out.source_selection_branches = (lg.source_selection_branches || []).slice(0, 3);
  // V3G5D(H) - administrative attribution of the selected source, published as evidence.
  out.source_warehouse_companies = (lg.source_warehouse_companies || []).slice(0, 3);
  out.source_warehouse_owners = (lg.source_warehouse_owners || []).slice(0, 3);
  // V3G5C(H) - the corrected source-eligibility evidence, so an empty live candidate set names its exact typed cause.
  var sas = (plan || {}).source_authority_summary || DEMO4A_sourceAuthoritySummary_(null);
  out.source_factory_candidate_count = sas.source_factory_candidate_count;
  out.source_factory_rejection_counts = sas.source_factory_rejection_counts;
  out.source_shipping_enabled_gate_applied = sas.source_shipping_enabled_gate_applied;
  out.source_factory_shared_across_companies = sas.source_factory_shared_across_companies;
  out.source_company_match_required = sas.source_company_match_required;
  out.destination_warehouse_ids = (lg.destination_warehouse_ids || []).slice(0, 3);
  out.destination_warehouse_codes = (lg.destination_warehouse_codes || []).slice(0, 3);
  // V3G5A(K) — prior-attempt journal safety. The prior journal is NEVER cleared or mutated here; it is only read.
  out.journal_status_read_only = journalPresent ? 'PRESENT_FROM_PRIOR_ATTEMPT' : 'ABSENT';
  out.journal_previous_checksum = journalPresent ? DEMO4A_str_(journalPresent.plan_checksum) : '';
  out.corrected_plan_checksum = out.plan_checksum;
  out.journal_integrity_valid = journalPresent ? (DEMO4A_str_(journalPresent.journal_integrity_checksum) !== '' && DEMO4A_hash_(DEMO4A_journalCanonical_(journalPresent)) === DEMO4A_str_(journalPresent.journal_integrity_checksum)) : null;
  out.existing_state = DEMO4A_str_(existingClassification);
  out.existing_state_classification = out.existing_state;
  // a prior journal + an ABSENT_ALL live state IS the signature of a failed, fully rolled-back attempt.
  out.journal_matches_previous_failed_attempt = !!journalPresent && out.existing_state === 'ABSENT_ALL';
  // the prior checksum MAY legitimately differ now that the intended shipment content was corrected (the previously
  // authorized checksum is RETIRED; the literal is deliberately not named in source so nothing can be pinned to it).
  out.previous_failed_checksum_matches_current_plan = journalPresent ? (out.journal_previous_checksum === out.plan_checksum) : null;
  out.confirmation_constant_status = (DEMO4A_CONFIRMED_SEED_CHECKSUM_ === 'PASTE_DEMO_SEED_CHECKSUM_HERE') ? 'PLACEHOLDER' : 'SET';
  out.clear_token_status = clearTokenPlaceholder === false ? 'SET' : 'PLACEHOLDER';
  var jrReason = '';
  if (!journalPresent) jrReason = 'NO_PRIOR_JOURNAL';
  else if (out.journal_integrity_valid !== true) jrReason = 'PRIOR_JOURNAL_INTEGRITY_INVALID';
  else if (out.existing_state !== 'ABSENT_ALL') jrReason = 'PRIOR_ATTEMPT_LEFT_ROWS_OR_STATE_NOT_ABSENT';
  else if (out.clear_token_status !== 'PLACEHOLDER') jrReason = 'CLEAR_TOKEN_ARMED_WITH_PRIOR_JOURNAL_PRESENT';
  else jrReason = 'PRIOR_JOURNAL_IS_A_ROLLED_BACK_ATTEMPT_AND_WILL_BE_SUPERSEDED';
  out.journal_retry_reason = jrReason;
  out.journal_retry_safe = (jrReason === 'NO_PRIOR_JOURNAL' || jrReason === 'PRIOR_JOURNAL_IS_A_ROLLED_BACK_ATTEMPT_AND_WILL_BE_SUPERSEDED');
  out.verdict = !out.all_intended_fields_have_class ? 'UNKNOWN_FIELD_CLASS'
    : out.alias_conflict ? 'PHYSICAL_SCHEMA_ALIAS_CONFLICT'
    : !out.writer_projection_complete ? 'CANONICALIZATION_RISK_REMAINS'
    : out.risk_count > 0 ? 'CANONICALIZATION_RISK_REMAINS'
    : out.source_destination_warehouse_lineage_ready !== true ? 'CANONICALIZATION_RISK_REMAINS'
    : out.journal_retry_safe !== true ? 'JOURNAL_STATE_UNSAFE_FOR_RETRY'
    : out.existing_state !== 'ABSENT_ALL' ? 'EXISTING_STATE_NOT_ABSENT'
    : 'READY_FOR_CONTROLLED_RETRY';
  return out;
}
function TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION() {
  var out = { tool: 'TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION', mode: 'STRICTLY READ-ONLY (getSheetByName + getValues + number formats only; NO write, NO actual write/read round trip)', output_contract: 'ONE_COMPACT_LOG_ENTRY' };
  try {
    var tz = DEMO4A_syncCanonTz_();
    var schema = DEMO4A_schemaGate_();
    var masters = DEMO4A_readMasters_();
    var plan = DEMO4A_buildPlan_(masters);
    if (!plan.ok) {
      out.verdict = 'CANONICALIZATION_RISK_REMAINS'; out.plan_blocked_reason = plan.reason;
      // V3G5D(H) - a blocked plan must name the PRECISE resolver reason, not only the generic plan-level code, so the
      // operator never has to guess which gate stopped it. Compact and capped; no master rows are dumped.
      out.plan_blocked_detail = (plan.source_authority_errors || []).slice(0, 3).map(function (e) { return DEMO4A_str_(e.slot) + ':' + DEMO4A_str_(e.reason) + (e.detail ? ('/' + DEMO4A_str_(e.detail)) : '') + (e.declared_warehouse_id ? ('/' + DEMO4A_str_(e.declared_warehouse_id)) : ''); });
      var sasB = plan.source_authority_summary || DEMO4A_sourceAuthoritySummary_(null);
      out.source_factory_candidate_count = sasB.source_factory_candidate_count;
      out.source_factory_rejection_counts = sasB.source_factory_rejection_counts;
      out.source_factory_shared_across_companies = sasB.source_factory_shared_across_companies;
      out.source_company_match_required = sasB.source_company_match_required;
      out.destination_authority_errors_count = (plan.destination_authority_errors || []).length;
      out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES'; Logger.log('DEMO4A_CANONICALIZATION_DIAGNOSTIC ' + JSON.stringify(out)); return out;
    }
    var headersByTable = {}, columnTypeClasses = {};
    DEMO4A_WRITE_ORDER_.forEach(function (name) {
      var t = DEMO4A_readTable_(name); headersByTable[name] = t.headers;
      // classify each physical column from EXISTING cells only (no write): date-formatted / numeric / boolean / text / empty.
      var cc = {}; var sample = t.rows.slice(0, 25);
      t.headers.forEach(function (h) {
        var key = DEMO4A_str_(h); if (!key) return;
        var cls = 'empty';
        for (var i = 0; i < sample.length; i++) { var v = sample[i][key];
          if (DEMO4A_isDateObj_(v)) { cls = 'date_formatted'; break; }
          if (typeof v === 'number') { cls = 'numeric_cell'; continue; }
          if (typeof v === 'boolean') { cls = 'boolean_cell'; continue; }
          if (!DEMO4A_isBlankCell_(v) && cls === 'empty') cls = 'text_cell';
        }
        cc[key] = cls;
      });
      columnTypeClasses[name] = cc;
    });
    var jRaw = PropertiesService.getScriptProperties().getProperty(DEMO4A_JOURNAL_KEY_);
    var jParsed = null; if (jRaw) { try { jParsed = JSON.parse(jRaw); } catch (e2) { jParsed = { plan_checksum: '' }; } }
    var cls = DEMO4A_classifyState_(plan, DEMO4A_readLive_());
    var lineage = DEMO4A_srcDestLineageGate_(plan, masters.warehouses);
    var core = DEMO4A_canonDiagnosticCore_(schema, masters, plan, headersByTable, columnTypeClasses, tz, jParsed, cls.classification, lineage, DEMO4A_CONFIRMED_CLEAR_TOKEN_ === 'PASTE_DEMO_CLEAR_TOKEN_HERE');
    Object.keys(core).forEach(function (k) { out[k] = core[k]; });
  } catch (e) { out.verdict = 'CANONICALIZATION_RISK_REMAINS'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES';
  Logger.log('DEMO4A_CANONICALIZATION_DIAGNOSTIC ' + JSON.stringify(out)); return out;
}

function TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED', mode: 'STRICTLY READ-ONLY (no write/create/delete/submit)', output_contract: 'ONE_PRIMARY_LOG_ENTRY' };
  try {
    out.canonicalization_tz = DEMO4A_syncCanonTz_();
    var schema = DEMO4A_schemaGate_(); out.schema_gate = schema;
    var masters = DEMO4A_readMasters_(); out.masters_present = masters.present;
    out.master_row_counts = { templates: masters.templates.length, template_nodes: masters.nodes.length, logistics_locations: masters.locations.length, marketplace_skus: masters.marketplaceSkus.length, sku_details: masters.skuDetails.length, warehouses: (masters.warehouses || []).length };
    var plan = DEMO4A_buildPlan_(masters);
    if (!plan.ok) {
      out.reason = plan.reason; out.rejection_counts = plan.rejection_counts || null; out.available_regions = plan.available_regions || null; out.detail = plan;
      if (plan.destination_authority) out.warehouse_gates = DEMO4A_warehouseGates_(true, plan.destination_authority, plan.destination_authority_errors || [], plan.binding_gates ? plan.binding_gates.ok : undefined);
      // V3G1(F)/V3G2(F) — typed failure reason via the PURE mapping (unarmed authority is never reported as a plan-count problem).
      var pf = DEMO4A_preflightFailureReason_(plan, schema.ok);
      out.reason = pf.reason; out.verdict = pf.verdict;
      if (pf.underlying_reason !== undefined) { out.underlying_reason = pf.underlying_reason; out.coordinate_authority_armed = pf.coordinate_authority_armed; }
    }
    else {
      out.region_selection_mode = plan.region_selection_mode; out.available_regions = plan.available_regions; out.chosen_templates = plan.chosen_templates;
      out.warehouse_aware_template_evaluation = plan.warehouse_aware_template_evaluation; out.qualified_count = plan.qualified_count; out.current_capable_count = plan.current_capable_count;
      out.rejection_counts = plan.rejection_counts || null; out.destination_authority_errors = plan.destination_authority_errors || [];
      out.selected_template_ids = plan.chosen_templates.map(function (c) { return c.route_template_id; }); out.rejection_counts = plan.rejection_counts;
      out.scope = plan.scope; out.planned_counts = plan.counts; out.per_shipment = plan.per_shipment; out.demo_plan_checksum = plan.checksum;
      // E — compact per-shipment route-geography evidence + the hard binding gates. READY is unreachable unless every gate is true.
      out.binding_gates = plan.binding_gates;
      // V3G(F) — the SEVEN separate warehouse gates (business identity / address authority / lineage / display coordinate /
      // map consumption / status truthfulness / route geography). Identity/address are reported separately from coordinate.
      out.warehouse_gates = DEMO4A_warehouseGates_(plan.warehouses_present, plan.destination_authority, null, plan.binding_gates ? plan.binding_gates.ok : undefined, plan.binding_gates ? plan.binding_gates.source_destination_warehouse_lineage_ready : undefined);
      out.map_destination_coordinate_consumption = DEMO4A_MAP_DEST_COORD_CONSUMPTION_;
      out.route_geography_evidence = plan.per_shipment.map(function (s) { return { shipment_id: s.shipment_id, slot: s.slot, transport_class: s.transport_class, destination_warehouse_id: s.destination_warehouse_id, destination_warehouse_code: s.destination_warehouse_code, destination_logistics_location_id: s.destination_logistics_location_id, destination_coordinate_branch: s.destination_coordinate_branch, destination_coordinate_source: s.destination_coordinate_source, destination_coordinate_accuracy: s.destination_coordinate_accuracy, destination_address_status: s.destination_address_status, destination_map_display_status: DEMO4A_mapDestinationDisplayStatus_(s.destination_coordinate_branch), destination_facility_marker_renderable: s.destination_facility_marker_renderable, origin: s.binding_evidence.origin, current: s.binding_evidence.current, destination: s.binding_evidence.destination }; });
      var cls = DEMO4A_classifyState_(plan, DEMO4A_readLive_());
      out.existing_state = { classification: cls.classification, duplicate_pk_counts: cls.duplicate_pk_counts, unexpected_demo_ids: cls.unexpected_demo_ids };
      out.verdict = DEMO4A_preflightVerdict_(schema.ok, plan, out.warehouse_gates, cls.classification);
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
    out.canonicalization_tz = DEMO4A_syncCanonTz_();
    var plan = DEMO4A_buildPlan_(DEMO4A_readMasters_());
    if (!plan.ok) { out.verdict = 'DRY_RUN_BLOCKED'; out.reason = plan.reason; out.detail = plan; }
    else {
      out.region_selection_mode = plan.region_selection_mode; out.available_regions = plan.available_regions; out.chosen_templates = plan.chosen_templates;
      out.warehouse_aware_template_evaluation = plan.warehouse_aware_template_evaluation; out.qualified_count = plan.qualified_count; out.current_capable_count = plan.current_capable_count;
      out.rejection_counts = plan.rejection_counts || null; out.destination_authority_errors = plan.destination_authority_errors || [];
      out.scope = plan.scope; out.dynamic_row_counts = plan.counts; out.per_shipment_counts = plan.per_shipment; out.planned_ids = DEMO4A_allIds_(plan);
      out.binding_gates = plan.binding_gates;
      out.warehouse_gates = DEMO4A_warehouseGates_(plan.warehouses_present, plan.destination_authority, null, plan.binding_gates ? plan.binding_gates.ok : undefined, plan.binding_gates ? plan.binding_gates.source_destination_warehouse_lineage_ready : undefined);
      // V3G — per-shipment destination authority + coordinate branch + source/accuracy + address status + whether the
      // facility marker renders, with the current gateway reported SEPARATELY (a gateway is never the final FBA).
      out.map_destination_coordinate_consumption = DEMO4A_MAP_DEST_COORD_CONSUMPTION_;
      out.destination_authority = plan.per_shipment.map(function (s) { return { shipping_plan_id: (DEMO4A_PREFIX_ + 'SP-' + s.shipment_id.slice(-1)), shipment_id: s.shipment_id, slot: s.slot, template: s.template, transport_type: s.transport_class, destination_warehouse_id: s.destination_warehouse_id, destination_warehouse_code: s.destination_warehouse_code, destination_logistics_location_id: s.destination_logistics_location_id, destination_coordinate_branch: s.destination_coordinate_branch, destination_coordinate_source: s.destination_coordinate_source, destination_coordinate_source_reference: s.destination_coordinate_source_reference, destination_coordinate_accuracy: s.destination_coordinate_accuracy, destination_address_status: s.destination_address_status, destination_address_fingerprint: s.destination_address_fingerprint, destination_map_display_status: DEMO4A_mapDestinationDisplayStatus_(s.destination_coordinate_branch), destination_reselected_from_warehouse_id: s.destination_reselected_from_warehouse_id, destination_verification_status: s.destination_verification_status, route_rows: s.route_rows, event_rows: s.event_rows, final_status: s.status, destination_facility_marker_renderable: s.destination_facility_marker_renderable, current_gateway_location_id: s.current_location_id }; });
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
  var lock = null, inserted = null, phase = 'pre_insert', driftEvidence = null;   // A — inserted tracked in OUTER scope so the outer catch can roll back after ANY post-insert exception
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

    // V3G5(A) — PRE-WRITE WRITER-PROJECTION GATE. Proves every intended field has a real physical column BEFORE anything
    // is written (not even the journal property): a missing column would otherwise be silently dropped by
    // DEMO4A_rowForHeaders_ and surface as POSTCHECK_NOT_EXACT:CONTENT_DRIFT after a full insert + rollback cycle.
    var headersByTable = {}; DEMO4A_WRITE_ORDER_.forEach(function (n2) { headersByTable[n2] = DEMO4A_readTable_(n2).headers; });
    var projection = DEMO4A_writerProjectionGaps_(plan2, headersByTable);
    out.writer_projection = { ok: projection.ok, intended_field_total: projection.intended_field_total, missing_total: projection.missing_total, missing_fields: projection.missing_fields };
    if (!projection.ok) { out.verdict = 'COMMIT_BLOCKED_WRITER_PROJECTION_INCOMPLETE'; out.reason = 'WRITER_INTENDED_FIELD_NOT_IN_PHYSICAL_HEADER'; out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES (blocked before any write)'; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    out.canonicalization = { contract_version: DEMO4A_CANON_CONTRACT_VERSION_, tz_offset_min: DEMO4A_CANON_TZ_OFFSET_MIN_ };

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
    if (post.classification !== 'PRESENT_EXACT_ALL') {
      // V3G5(C) — capture COMPACT drift forensics from the already-computed classification (pure, in-memory, no extra
      // reads) and THEN throw. Rollback is never delayed for diagnostics beyond this single in-memory map.
      driftEvidence = DEMO4A_driftEvidence_(post);
      throw new Error('POSTCHECK_NOT_EXACT:' + post.classification);   // → inserted-only rollback
    }
    out.delta = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { out.delta[t] = inserted[t].length; });
    out.demo_plan_checksum = plan2.checksum; out.post_state = post.classification; out.verdict = 'COMMITTED';
  } catch (e) {
    // A — fail closed: NEVER leave rows behind. If any insert began, roll back exactly this execution's inserts.
    if (inserted && DEMO4A_anyInserted_(inserted)) {
      var rb = DEMO4A_rollbackInserted_(inserted);
      out.write_error = (e && e.message) ? e.message : String(e); out.rolled_back = rb.removed;
      if (driftEvidence) out.postcheck_drift_evidence = driftEvidence;
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
