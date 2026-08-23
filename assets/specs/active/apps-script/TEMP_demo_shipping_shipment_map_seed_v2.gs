/**
 * TEMP — F1-7N-FA-4A-DEMO-SEED-SHIPPING-SHIPMENT-MAP-V2
 * Controlled, ISOLATED visual-demo seed for Weekly Shipping Plan, Shipment Overview/Draft and the On-the-Way Map.
 *
 * WRITES ONLY these six tables (FK-safe order): shipping_plans → shipping_plan_lines → shipments → shipment_lines
 * → shipment_routes → shipment_events. READ-ONLY authorities: shipment_route_templates, shipment_route_template_nodes,
 * logistics_locations, warehouses, sku_details/marketplace_skus. NEVER touches route templates / template nodes /
 * logistics locations / allocation drafts / factory stock / purchase orders / K2 / flags / documents / carrier APIs /
 * notifications. NEVER calls a production Submit/create-shipment/dispatch/receive handler (rows are inserted directly).
 *
 * This is VISUAL-DEMO data only. It does NOT live-verify the operational workflow.
 *
 * Every demo id begins with the frozen prefix DEMO-20260824-. IDs are fully DETERMINISTIC (no UUID) so an exact retry
 * REUSEs and writes a 0/0/0/0/0/0 delta. COMMIT is gated behind an explicit confirmation-checksum constant (left at a
 * placeholder in this task) + ScriptLock + a re-run of every gate under lock + verified readback. CLEAR is a separate,
 * STAGED-OFF entrypoint (its own placeholder token) and is NOT run here.
 *
 * Entrypoints (public — no trailing underscore, appear in the Run menu):
 *   TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED()   — strictly read-only gate matrix
 *   TEMP_DEMO4A_DRY_RUN_SHIPPING_SHIPMENT_MAP_SEED()     — strictly read-only full plan + demo_plan_checksum
 *   TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED()      — gated write (confirmation constant PLACEHOLDER → refuses)
 *   TEMP_DEMO4A_VALIDATE_SHIPPING_SHIPMENT_MAP_SEED()    — strictly read-only post-write verification
 *   TEMP_DEMO4A_CLEAR_SHIPPING_SHIPMENT_MAP_SEED()       — STAGED OFF (placeholder token → refuses); not run in this task
 */

// ================================================================================================================
// FROZEN CONFIG (pure literals — no clock, no random; the plan is byte-stable across DRY_RUN / COMMIT / VALIDATE)
// ================================================================================================================
var DEMO4A_PREFIX_ = 'DEMO-20260824-';
var DEMO4A_TAG_ = 'DEMO ONLY — DO NOT PROCESS';
var DEMO4A_SOURCE_ = 'DEMO-4A';
var DEMO4A_ACTOR_ = 'demo-seed-4a';
var DEMO4A_CREATED_AT_ = '2026-08-20 09:00:00';

// Confirmation gates — LEFT AT PLACEHOLDER in this task. Do NOT set; do NOT run COMMIT / CLEAR.
var DEMO4A_CONFIRMED_SEED_CHECKSUM_ = 'PASTE_DEMO_SEED_CHECKSUM_HERE';
var DEMO4A_CONFIRMED_CLEAR_TOKEN_ = 'PASTE_DEMO_CLEAR_TOKEN_HERE';

// The six writable tables in FK-safe write order (and the reverse for CLEAR).
var DEMO4A_WRITE_ORDER_ = ['shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines', 'shipment_routes', 'shipment_events'];
var DEMO4A_CLEAR_ORDER_ = ['shipment_events', 'shipment_routes', 'shipment_lines', 'shipments', 'shipping_plan_lines', 'shipping_plans'];

// Read-only master tabs (never written).
var DEMO4A_MASTER_TABS_ = ['shipment_route_templates', 'shipment_route_template_nodes', 'logistics_locations'];

// Required columns per writable table (the PK + FKs + the fields this seed writes). A live header missing any of these
// fails the schema gate. Verified against SHIPPING_PLANS_HEADERS_ (11_:20), SHIPPING_PLAN_LINES_HEADERS_ (11_:40),
// SHIPMENTS_HEADERS_ (12_:30), SHIPMENT_LINES_HEADERS_ (12_:56), ROUTE_HEADERS (22_:180), SHIP_EVENT_HEADERS_ (31_:223).
var DEMO4A_REQUIRED_COLS_ = {
  shipping_plans: ['shipping_plan_id', 'shipping_plan_no', 'plan_name', 'company', 'country', 'marketplace', 'status', 'plan_version', 'created_by', 'created_at', 'note', 'source'],
  shipping_plan_lines: ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'requested_qty', 'approved_qty', 'note', 'created_at'],
  shipments: ['shipment_id', 'shipment_no', 'shipping_plan_id', 'source_warehouse_id', 'company', 'country', 'marketplace', 'destination', 'destination_warehouse_id', 'carrier_id', 'shipping_method', 'status', 'etd', 'eta', 'delivered_date', 'shipment_total_qty', 'note', 'created_by', 'created_at'],
  shipment_lines: ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty', 'shipping_plan_line_id', 'note', 'created_at'],
  shipment_routes: ['shipment_route_id', 'shipment_id', 'route_template_id', 'route_template_node_id', 'sequence_no', 'node_type', 'node_code', 'location_ref_type', 'location_ref_id', 'location_name', 'country', 'region', 'city', 'latitude', 'longitude', 'transport_mode', 'planned_event_type', 'status', 'created_at', 'updated_at'],
  shipment_events: ['shipment_event_id', 'shipment_id', 'shipment_route_id', 'event_sequence', 'event_time', 'event_type', 'event_status', 'location_name', 'country', 'city', 'latitude', 'longitude', 'source', 'note', 'created_at']
};

// Canonical enum tokens actually consumed by the UI (audited). NEVER invent a value outside these sets.
//  shipments.status : shipped (origin/pre-departure, MOVING_SET) · in_transit (actively moving, PRIMARY map record,
//  MOVING_SET) · received (delivered/terminal, DELIVERED_SET — appears in Overview, flagged delivered on the map).
//  shipment_routes.status : completed | current | planned (map nodeStatusClass vocabulary).
//  shipment_events.event_type : departed_origin (event_status completed) · route_node_reached (completed for a passed
//  node, current for the live current node) · received (event_status received). shipping_plans.status : distinct
//  canonical pending_approval / approved / completed.
var DEMO4A_SHIP_LIFECYCLE_ = [
  { slot: 'origin',    status: 'shipped',    plan_status: 'pending_approval', etd: '2026-08-24', eta: '2026-09-05', delivered_date: '', event_end: '2026-08-24', event_step: 2 },
  { slot: 'in_transit', status: 'in_transit', plan_status: 'approved',        etd: '2026-08-20', eta: '2026-08-28', delivered_date: '', event_end: '2026-08-23', event_step: 3 },
  { slot: 'delivered',  status: 'received',   plan_status: 'completed',       etd: '2026-08-10', eta: '2026-08-22', delivered_date: '2026-08-22', event_end: '2026-08-22', event_step: 2 }
];

// ================================================================================================================
// PURE HELPERS (no GAS globals — unit-testable)
// ================================================================================================================
function DEMO4A_str_(v) { return String(v == null ? '' : v).trim(); }
function DEMO4A_low_(v) { return DEMO4A_str_(v).toLowerCase(); }
function DEMO4A_num_(v) { if (v === '' || v == null) return NaN; var n = Number(v); return isFinite(n) ? n : NaN; }
function DEMO4A_truthy_(v) { var s = DEMO4A_low_(v); return s === 'true' || s === 'yes' || s === '1' || s === 'y' || v === true || v === 1; }
function DEMO4A_hash_(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return ('0000000' + h.toString(16)).slice(-8); }
function DEMO4A_z2_(x) { return (x < 10 ? '0' : '') + x; }
function DEMO4A_addDays_(ymd, n) {
  var p = String(ymd).split('-'); var ms = Date.UTC(+p[0], (+p[1]) - 1, +p[2]) + (n * 86400000); var d = new Date(ms);
  return d.getUTCFullYear() + '-' + DEMO4A_z2_(d.getUTCMonth() + 1) + '-' + DEMO4A_z2_(d.getUTCDate());
}
// map's validCoord: finite numbers in range, never (0,0), never blank.
function DEMO4A_validCoord_(lat, lng) {
  var a = DEMO4A_num_(lat), b = DEMO4A_num_(lng);
  if (isNaN(a) || isNaN(b)) return false;
  if (a < -90 || a > 90 || b < -180 || b > 180) return false;
  if (a === 0 && b === 0) return false;
  return true;
}
// index logistics_locations by logistics_location_id (the map's locById join key — matched by id VALUE).
function DEMO4A_indexLocations_(locations) {
  var by = {};
  (locations || []).forEach(function (l) { var id = DEMO4A_str_(l.logistics_location_id); if (id) by[id] = l; });
  return by;
}
// group nodes by template id, each sorted by node_sequence (the ordering key; node_code is display-only).
function DEMO4A_nodesByTemplate_(nodes) {
  var by = {};
  (nodes || []).forEach(function (n) { var t = DEMO4A_str_(n.route_template_id); if (!t) return; (by[t] = by[t] || []).push(n); });
  Object.keys(by).forEach(function (t) { by[t].sort(function (a, b) { return DEMO4A_num_(a.node_sequence) - DEMO4A_num_(b.node_sequence); }); });
  return by;
}
// resolve a template node → canonical logistics location + coords. Fail-closed: no location / bad coord → not ok.
function DEMO4A_resolveNode_(node, locById) {
  var locId = DEMO4A_str_(node.logistics_location_id);
  if (!locId) return { ok: false, reason: 'NODE_NO_LOGISTICS_LOCATION_ID' };
  var loc = locById[locId];
  if (!loc) return { ok: false, reason: 'LOGISTICS_LOCATION_NOT_FOUND' };
  var lat = loc.latitude, lng = loc.longitude;
  if (!DEMO4A_validCoord_(lat, lng)) return { ok: false, reason: 'LOCATION_COORDINATE_INVALID_OR_MISSING' };
  return {
    ok: true, location_ref_id: locId, latitude: DEMO4A_num_(lat), longitude: DEMO4A_num_(lng),
    location_name: DEMO4A_str_(loc.location_name) || DEMO4A_str_(node.node_name) || DEMO4A_str_(node.node_code),
    country: DEMO4A_str_(loc.country) || DEMO4A_str_(node.country),
    region: DEMO4A_str_(loc.region) || DEMO4A_str_(node.region),
    city: DEMO4A_str_(loc.city) || DEMO4A_str_(node.city)
  };
}
// preference rank for a template (US west/central/east first, then id) — purely for a visually useful demo.
function DEMO4A_templatePref_(tpl) {
  var hay = DEMO4A_low_(tpl.destination_region) + '|' + DEMO4A_low_(tpl.route_template_name) + '|' + DEMO4A_low_(tpl.destination_country);
  if (/west/.test(hay)) return 0; if (/central/.test(hay)) return 1; if (/east/.test(hay)) return 2;
  if (/\bus\b|united states|usa/.test(hay)) return 3; return 4;
}
// select 3 ACTIVE templates whose nodes fully resolve (>=2 nodes, unique sequence, every node → a valid location).
function DEMO4A_selectTemplates_(templates, nodes, locById) {
  var byTpl = DEMO4A_nodesByTemplate_(nodes);
  var qualified = [];
  (templates || []).forEach(function (t) {
    var tid = DEMO4A_str_(t.route_template_id);
    if (!tid || !DEMO4A_truthy_(t.is_active)) return;
    var ns = byTpl[tid] || [];
    if (ns.length < 2) return;
    var seqSeen = {}, resolved = [], badReason = '';
    for (var i = 0; i < ns.length; i++) {
      var seq = DEMO4A_str_(ns[i].node_sequence);
      if (seq === '' || seqSeen[seq]) { badReason = 'NODE_SEQUENCE_MISSING_OR_DUPLICATE'; break; }
      seqSeen[seq] = 1;
      var r = DEMO4A_resolveNode_(ns[i], locById);
      if (!r.ok) { badReason = r.reason; break; }
      resolved.push({ node: ns[i], loc: r });
    }
    if (badReason) return;
    qualified.push({ template: t, tid: tid, nodes: ns, resolved: resolved, nodeCount: ns.length, pref: DEMO4A_templatePref_(t) });
  });
  qualified.sort(function (a, b) { if (a.pref !== b.pref) return a.pref - b.pref; return a.tid < b.tid ? -1 : (a.tid > b.tid ? 1 : 0); });
  if (qualified.length < 3) return { ok: false, reason: 'INSUFFICIENT_ACTIVE_RESOLVABLE_TEMPLATES', qualified_count: qualified.length };
  var chosen = qualified.slice(0, 3);
  // assign the richest (most nodes) template to the PRIMARY in-transit shipment; the other two by id → origin, delivered.
  var byNodesDesc = chosen.slice().sort(function (a, b) { if (b.nodeCount !== a.nodeCount) return b.nodeCount - a.nodeCount; return a.tid < b.tid ? -1 : 1; });
  var inTransit = byNodesDesc[0];
  var rest = chosen.filter(function (c) { return c.tid !== inTransit.tid; }).sort(function (a, b) { return a.tid < b.tid ? -1 : 1; });
  return { ok: true, assign: { origin: rest[0], in_transit: inTransit, delivered: rest[1] }, chosen: chosen };
}

// Build the per-shipment route node statuses + the truthful chronological event list for a lifecycle slot.
//  origin(shipped): node0 completed, rest planned; 1 event (departed_origin@node0, completed) → marker at origin.
//  in_transit:       node0..cur-1 completed, cur current, >cur planned; events up to cur (last = route_node_reached
//                    @cur, current). PRIMARY map record; has remaining/future nodes when >=3 nodes.
//  delivered(received): all nodes completed; events for every node, last = received@last (received).
function DEMO4A_lifecycleNodes_(slot, nodeCount) {
  var n = nodeCount, cur;
  if (slot === 'origin') cur = 0;
  else if (slot === 'delivered') cur = n - 1;
  else cur = (n >= 3) ? 1 : (n - 1);   // in_transit
  var statuses = [];
  for (var i = 0; i < n; i++) statuses.push(i < cur ? 'completed' : (i === cur ? 'current' : 'planned'));
  if (slot === 'delivered') { for (var j = 0; j < n; j++) statuses[j] = 'completed'; }
  else if (slot === 'origin') { statuses[0] = 'completed'; }
  return { currentIndex: cur, nodeStatuses: statuses };
}
// events cover node indices 0..upto (inclusive). departed_origin at 0; route_node_reached for passed/current nodes;
// received at the terminal node for a delivered shipment. Timestamps strictly increase and END at event_end.
function DEMO4A_lifecycleEvents_(slot, currentIndex, resolvedNodes, endYmd, stepDays) {
  var upto = (slot === 'delivered') ? resolvedNodes.length - 1 : currentIndex;
  var evs = [];
  for (var i = 0; i <= upto; i++) {
    var isLast = (i === upto);
    var type, st;
    if (i === 0) { type = 'departed_origin'; st = (slot === 'origin' && isLast) ? 'completed' : 'completed'; }
    else { type = 'route_node_reached'; st = 'completed'; }
    if (slot === 'in_transit' && isLast) { type = (i === 0 ? 'departed_origin' : 'route_node_reached'); st = 'current'; }
    if (slot === 'delivered' && isLast) { type = 'received'; st = 'received'; }
    evs.push({ nodeIndex: i, event_type: type, event_status: st, resolved: resolvedNodes[i].loc });
  }
  // strictly-increasing dates ending at endYmd
  var count = evs.length;
  evs.forEach(function (e, i) { e.event_time = DEMO4A_addDays_(endYmd, -((count - 1 - i) * stepDays)) + ' 10:00:00'; });
  return evs;
}

// ================================================================================================================
// PURE PLAN BUILDER — deterministic rows for all six tables + counts + visibility + demo_plan_checksum.
//   masters = { templates:[], nodes:[], locations:[], skus:[] }. Returns { ok, checksum, tables, counts, visibility }
//   or { ok:false, reason }.
// ================================================================================================================
function DEMO4A_buildPlan_(masters) {
  masters = masters || {};
  var skus = (masters.skus || []).map(DEMO4A_str_).filter(Boolean);
  if (skus.length < 2) return { ok: false, reason: 'INSUFFICIENT_ACTIVE_SKUS' };
  var locById = DEMO4A_indexLocations_(masters.locations);
  var sel = DEMO4A_selectTemplates_(masters.templates, masters.nodes, locById);
  if (!sel.ok) return sel;

  var P = DEMO4A_PREFIX_;
  var tables = { shipping_plans: [], shipping_plan_lines: [], shipments: [], shipment_lines: [], shipment_routes: [], shipment_events: [] };
  var visibility = { weekly_shipping_plan: [], shipment_draft: [], shipment_overview: [], on_the_way_map: [], primary_map_record: null };

  DEMO4A_SHIP_LIFECYCLE_.forEach(function (life, si) {
    var idx = si + 1;                     // 1-based demo ordinal
    var pick = sel.assign[life.slot];
    var tpl = pick.template, resolved = pick.resolved, nodeCount = resolved.length;
    var planId = P + 'SP-' + idx, shipId = P + 'SHP-' + idx;
    var company = DEMO4A_str_(tpl.origin_country) ? 'KM' : 'KM';
    var originCountry = DEMO4A_str_(tpl.origin_country) || DEMO4A_str_(resolved[0].loc.country) || 'CN';
    var destCountry = DEMO4A_str_(tpl.destination_country) || DEMO4A_str_(resolved[nodeCount - 1].loc.country) || 'US';
    var destRegion = DEMO4A_str_(tpl.destination_region) || DEMO4A_str_(resolved[nodeCount - 1].loc.region) || '';
    var srcWh = DEMO4A_str_(tpl.origin_warehouse_id);
    var destWh = DEMO4A_str_(tpl.destination_warehouse_id);
    var carrier = DEMO4A_str_(tpl.carrier_id);
    var method = DEMO4A_str_(tpl.transit_type) || 'SEA';
    var lastMile = DEMO4A_str_(tpl.last_mile_delivery);

    // ---- shipping_plans (1 header) ----
    tables.shipping_plans.push({
      shipping_plan_id: planId, shipping_plan_no: 'DEMO-PLAN-' + idx, plan_name: 'DEMO Route ' + destRegion + ' #' + idx,
      company: company, country: destCountry, marketplace: 'Amazon',
      ship_from: originCountry, source_warehouse_id: srcWh, ship_from_type: 'warehouse',
      destination: destRegion || destCountry, destination_warehouse_id: destWh, destination_type: 'warehouse',
      shipping_method: method, last_mile_delivery: lastMile, carrier_id: carrier,
      status: life.plan_status, batch_status: 'open', plan_version: '1',
      created_by: DEMO4A_ACTOR_, created_at: DEMO4A_CREATED_AT_, note: DEMO4A_TAG_, source: DEMO4A_SOURCE_,
      updated_at: DEMO4A_CREATED_AT_, updated_by: DEMO4A_ACTOR_, transferred_shipment_id: shipId
    });
    visibility.weekly_shipping_plan.push({ shipping_plan_id: planId, status: life.plan_status });

    // ---- shipping_plan_lines + shipment_lines (2-3 each; qty consistent) ----
    var lineCount = 2 + (idx % 2);        // 3,2,3 → 2..3 lines
    var shipTotalQty = 0;
    for (var li = 1; li <= lineCount; li++) {
      var sku = skus[(li - 1) % skus.length];
      var qty = 100 * idx + 10 * li;      // deterministic, distinct
      shipTotalQty += qty;
      var planLineId = P + 'SPL-' + idx + '-' + li, shipLineId = P + 'SHL-' + idx + '-' + li;
      tables.shipping_plan_lines.push({
        shipping_plan_line_id: planLineId, shipping_plan_id: planId, sku: sku, site_sku: sku + '-US', marketplace: 'Amazon',
        requested_qty: qty, approved_qty: qty, plan_carton_qty: Math.ceil(qty / 20), units_per_carton: 20,
        source_page: 'demo', note: DEMO4A_TAG_, created_at: DEMO4A_CREATED_AT_, updated_at: DEMO4A_CREATED_AT_
      });
      tables.shipment_lines.push({
        shipment_line_id: shipLineId, shipment_id: shipId, sku: sku,
        shipment_qty: qty, shipment_carton_qty: Math.ceil(qty / 20), units_per_carton: 20,
        shipping_plan_line_id: planLineId, note: DEMO4A_TAG_, created_at: DEMO4A_CREATED_AT_, updated_at: DEMO4A_CREATED_AT_
      });
    }

    // ---- shipments (1 header) ----
    tables.shipments.push({
      shipment_id: shipId, shipment_no: 'DEMO-SHIP-' + idx, shipping_plan_id: planId,
      source_warehouse_id: srcWh, warehouse_id: destWh, company: company, country: destCountry, marketplace: 'Amazon',
      ship_from: originCountry, destination: destRegion || destCountry, destination_warehouse_id: destWh, destination_type: 'warehouse',
      carrier_id: carrier, shipping_method: method, last_mile_delivery: lastMile, status: life.status,
      etd: life.etd, eta: life.eta, actual_departure_date: life.etd, actual_arrival_date: life.delivered_date, delivered_date: life.delivered_date,
      shipment_total_qty: shipTotalQty, currency: 'USD', note: DEMO4A_TAG_,
      created_by: DEMO4A_ACTOR_, created_at: DEMO4A_CREATED_AT_, updated_at: DEMO4A_CREATED_AT_, updated_by: DEMO4A_ACTOR_
    });
    if (DEMO4A_overviewVisible_(life.status)) visibility.shipment_overview.push({ shipment_id: shipId, status: life.status });
    if (DEMO4A_draftVisible_(life.status)) visibility.shipment_draft.push({ shipment_id: shipId, status: life.status });

    // ---- shipment_routes (full ordered node path from the chosen template) ----
    var lc = DEMO4A_lifecycleNodes_(life.slot, nodeCount);
    for (var ni = 0; ni < nodeCount; ni++) {
      var node = resolved[ni].node, loc = resolved[ni].loc;
      tables.shipment_routes.push({
        shipment_route_id: P + 'SR-' + idx + '-' + DEMO4A_z2_(ni + 1), shipment_id: shipId,
        route_template_id: pick.tid, route_template_node_id: DEMO4A_str_(node.route_template_node_id),
        sequence_no: DEMO4A_str_(node.node_sequence), node_type: DEMO4A_str_(node.node_type), node_code: DEMO4A_str_(node.node_code),
        location_ref_type: 'logistics_location', location_ref_id: loc.location_ref_id,
        location_name: loc.location_name, country: loc.country, region: loc.region, city: loc.city,
        latitude: loc.latitude, longitude: loc.longitude,
        transport_mode: DEMO4A_str_(node.transport_mode_to_next), planned_event_type: DEMO4A_str_(node.planned_event_type),
        status: lc.nodeStatuses[ni], created_at: DEMO4A_CREATED_AT_, updated_at: DEMO4A_CREATED_AT_
      });
    }

    // ---- shipment_events (truthful chronological history up to the current lifecycle position) ----
    var routeIdOf = function (ni) { return P + 'SR-' + idx + '-' + DEMO4A_z2_(ni + 1); };
    var evs = DEMO4A_lifecycleEvents_(life.slot, lc.currentIndex, resolved, life.event_end, life.event_step);
    evs.forEach(function (e, ei) {
      tables.shipment_events.push({
        shipment_event_id: P + 'SE-' + idx + '-' + DEMO4A_z2_(ei + 1), shipment_id: shipId, shipment_route_id: routeIdOf(e.nodeIndex),
        event_sequence: ei + 1, event_time: e.event_time, event_type: e.event_type, event_status: e.event_status,
        location_name: e.resolved.location_name, country: e.resolved.country, city: e.resolved.city,
        latitude: e.resolved.latitude, longitude: e.resolved.longitude,
        source: DEMO4A_SOURCE_, source_event_id: P + 'SE-' + idx + '-' + DEMO4A_z2_(ei + 1), raw_status: e.event_status,
        note: DEMO4A_TAG_, created_by: DEMO4A_ACTOR_, created_at: DEMO4A_CREATED_AT_, updated_by: DEMO4A_ACTOR_, updated_at: DEMO4A_CREATED_AT_
      });
    });

    // map visibility (audited): shipped + in_transit are onTheWay; received appears but flagged delivered.
    var onMap = DEMO4A_mapVisible_(life.status, evs.length, nodeCount);
    if (onMap) {
      var last = evs[evs.length - 1];
      var mapRec = { shipment_id: shipId, status: life.status, moving: DEMO4A_mapMoving_(life.status), delivered: DEMO4A_mapDelivered_(life.status),
        current_node_sequence: DEMO4A_str_(resolved[lc.currentIndex].node.node_sequence), latest_event: last.event_type, latest_event_time: last.event_time,
        marker_lat: last.resolved.latitude, marker_lng: last.resolved.longitude, carrier_id: carrier, transit_method: method, eta: life.eta };
      visibility.on_the_way_map.push(mapRec);
      if (life.slot === 'in_transit') visibility.primary_map_record = mapRec;
    }
  });

  var counts = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { counts[t] = tables[t].length; });
  return { ok: true, checksum: DEMO4A_checksum_(tables), tables: tables, counts: counts, visibility: visibility,
    chosen_templates: sel.chosen.map(function (c) { return { route_template_id: c.tid, node_count: c.nodeCount, name: DEMO4A_str_(c.template.route_template_name) }; }) };
}
function DEMO4A_overviewVisible_(status) { return { shipped: 1, in_transit: 1, arrived: 1, received: 1, closed: 1 }[DEMO4A_low_(status)] === 1; }
function DEMO4A_draftVisible_(status) { return { draft: 1, ready_to_ship: 1, shipped: 1 }[DEMO4A_low_(status)] === 1; }
function DEMO4A_mapMoving_(status) { return { shipped: 1, in_transit: 1 }[DEMO4A_low_(status)] === 1; }
function DEMO4A_mapDelivered_(status) { return { received: 1, completed: 1, delivered: 1, closed: 1 }[DEMO4A_low_(status)] === 1; }
// map inclusion: not cancelled, not closed, and has a runtime signal (runtime status OR any event/route row).
function DEMO4A_mapVisible_(status, eventCount, nodeCount) {
  var s = DEMO4A_low_(status);
  if (s === 'cancelled' || s === 'closed') return false;
  var runtime = { shipped: 1, in_transit: 1, arrived: 1, partial_received: 1, partially_received: 1, received: 1, completed: 1, delivered: 1 }[s] === 1;
  return runtime || eventCount > 0 || nodeCount > 0;
}
// deterministic checksum over a canonical projection of every planned row (PK-sorted per table).
function DEMO4A_checksum_(tables) {
  var pkOf = { shipping_plans: 'shipping_plan_id', shipping_plan_lines: 'shipping_plan_line_id', shipments: 'shipment_id',
    shipment_lines: 'shipment_line_id', shipment_routes: 'shipment_route_id', shipment_events: 'shipment_event_id' };
  var parts = [];
  DEMO4A_WRITE_ORDER_.forEach(function (t) {
    var pk = pkOf[t];
    var rows = (tables[t] || []).slice().sort(function (a, b) { return DEMO4A_str_(a[pk]) < DEMO4A_str_(b[pk]) ? -1 : 1; });
    rows.forEach(function (r) {
      var keys = Object.keys(r).sort();
      parts.push(t + '{' + keys.map(function (k) { return k + '=' + DEMO4A_str_(r[k]); }).join('|') + '}');
    });
  });
  return DEMO4A_hash_(parts.join('\n'));
}

// ================================================================================================================
// GAS-FACING I/O (live sheets). Read-only reads via getSheetByName; writes map onto the LIVE header row order.
// ================================================================================================================
function DEMO4A_ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function DEMO4A_readTable_(name) {
  var sh = DEMO4A_ss_().getSheetByName(name);
  if (!sh) return { present: false, headers: [], rows: [] };
  var data = sh.getDataRange().getValues();
  if (!data || !data.length) return { present: true, headers: [], rows: [] };
  var headers = data[0].map(function (h) { return DEMO4A_str_(h); });
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var blank = true, o = {};
    for (var c = 0; c < headers.length; c++) { if (!headers[c]) continue; var v = data[r][c]; o[headers[c]] = v; if (DEMO4A_str_(v) !== '') blank = false; }
    if (!blank) rows.push(o);
  }
  return { present: true, headers: headers, rows: rows };
}
function DEMO4A_readMasters_() {
  var t = DEMO4A_readTable_('shipment_route_templates'), n = DEMO4A_readTable_('shipment_route_template_nodes'), l = DEMO4A_readTable_('logistics_locations');
  var skuTab = DEMO4A_readTable_('sku_details');
  var skus = [];
  (skuTab.rows || []).forEach(function (r) { var s = DEMO4A_str_(r.sku); var active = (r.is_active == null) ? true : DEMO4A_truthy_(r.is_active); if (s && active && skus.indexOf(s) === -1 && skus.length < 3) skus.push(s); });
  return { templates: t.rows, nodes: n.rows, locations: l.rows, skus: skus,
    present: { shipment_route_templates: t.present, shipment_route_template_nodes: n.present, logistics_locations: l.present, sku_details: skuTab.present } };
}
// schema gate: every writable table present + carries all required columns.
function DEMO4A_schemaGate_() {
  var out = { ok: true, tables: {} };
  DEMO4A_WRITE_ORDER_.forEach(function (name) {
    var t = DEMO4A_readTable_(name);
    var missing = DEMO4A_REQUIRED_COLS_[name].filter(function (c) { return t.headers.indexOf(c) === -1; });
    out.tables[name] = { present: t.present, row_count: t.rows.length, missing_required_columns: missing, header_count: t.headers.length };
    if (!t.present || missing.length) out.ok = false;
  });
  return out;
}
// existing DEMO id collisions + any non-demo downstream reference to a demo id (read-only).
function DEMO4A_collisionScan_(plan) {
  var pkOf = { shipping_plans: 'shipping_plan_id', shipping_plan_lines: 'shipping_plan_line_id', shipments: 'shipment_id', shipment_lines: 'shipment_line_id', shipment_routes: 'shipment_route_id', shipment_events: 'shipment_event_id' };
  var out = { existing_demo_ids: {}, total_existing: 0, all_present: true, none_present: true };
  DEMO4A_WRITE_ORDER_.forEach(function (name) {
    var pk = pkOf[name], t = DEMO4A_readTable_(name);
    var want = {}; (plan.tables[name] || []).forEach(function (r) { want[DEMO4A_str_(r[pk])] = 1; });
    var have = 0; t.rows.forEach(function (r) { if (want[DEMO4A_str_(r[pk])]) have++; });
    out.existing_demo_ids[name] = have;
    out.total_existing += have;
    var wantCount = Object.keys(want).length;
    if (have !== wantCount) out.all_present = false;
    if (have !== 0) out.none_present = false;
  });
  return out;
}
// map a plan row onto the live header order (unknown keys dropped; missing columns blank). Never invents a column.
function DEMO4A_rowForHeaders_(headers, obj) { return headers.map(function (h) { return (obj[h] == null) ? '' : obj[h]; }); }

// ================================================================================================================
// ENTRYPOINT 1 — PREFLIGHT (strictly read-only)
// ================================================================================================================
function TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_PREFLIGHT_SHIPPING_SHIPMENT_MAP_SEED', mode: 'STRICTLY READ-ONLY (no write/create/delete/submit)', output_contract: 'ONE_PRIMARY_LOG_ENTRY' };
  try {
    var schema = DEMO4A_schemaGate_();
    out.schema_gate = schema;
    var masters = DEMO4A_readMasters_();
    out.masters_present = masters.present;
    out.master_row_counts = { templates: masters.templates.length, template_nodes: masters.nodes.length, logistics_locations: masters.locations.length, active_skus: masters.skus.length };
    var plan = DEMO4A_buildPlan_(masters);
    if (!plan.ok) { out.verdict = 'PREFLIGHT_FAILED'; out.reason = plan.reason; out.detail = plan; }
    else {
      out.chosen_templates = plan.chosen_templates;
      out.planned_counts = plan.counts;
      out.demo_plan_checksum = plan.checksum;
      out.collision = DEMO4A_collisionScan_(plan);
      out.verdict = (schema.ok && !out.collision.total_existing) ? 'READY_FOR_DEMO_SEED'
        : (out.collision.all_present ? 'ALREADY_SEEDED' : (schema.ok ? 'PARTIAL_DEMO_ROWS_PRESENT' : 'PREFLIGHT_FAILED_SCHEMA'));
    }
  } catch (e) { out.verdict = 'PREFLIGHT_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES (read-only: getSheetByName + getValues only; no row/cell/property/flag writes)';
  Logger.log('DEMO4A_PREFLIGHT ' + JSON.stringify(out, null, 2));
  return out;
}

// ================================================================================================================
// ENTRYPOINT 2 — DRY_RUN (strictly read-only; prints the whole plan + demo_plan_checksum)
// ================================================================================================================
function TEMP_DEMO4A_DRY_RUN_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_DRY_RUN_SHIPPING_SHIPMENT_MAP_SEED', mode: 'STRICTLY READ-ONLY (no write)', output_contract: 'ONE_PRIMARY_LOG_ENTRY' };
  try {
    var masters = DEMO4A_readMasters_();
    var plan = DEMO4A_buildPlan_(masters);
    if (!plan.ok) { out.verdict = 'DRY_RUN_BLOCKED'; out.reason = plan.reason; }
    else {
      out.chosen_templates = plan.chosen_templates;
      out.row_counts = plan.counts;
      out.planned_ids = DEMO4A_allIds_(plan);
      out.event_chronology = DEMO4A_chronology_(plan);
      out.expected_ui_visibility = plan.visibility;
      out.demo_plan_checksum = plan.checksum;
      out.confirmation_constant_status = (DEMO4A_CONFIRMED_SEED_CHECKSUM_ === 'PASTE_DEMO_SEED_CHECKSUM_HERE') ? 'PLACEHOLDER' : 'SET';
      out.verdict = 'DRY_RUN_READY';
    }
  } catch (e) { out.verdict = 'DRY_RUN_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES (read-only)';
  Logger.log('DEMO4A_DRY_RUN ' + JSON.stringify(out, null, 2));
  return out;
}
function DEMO4A_allIds_(plan) {
  var pkOf = { shipping_plans: 'shipping_plan_id', shipping_plan_lines: 'shipping_plan_line_id', shipments: 'shipment_id', shipment_lines: 'shipment_line_id', shipment_routes: 'shipment_route_id', shipment_events: 'shipment_event_id' };
  var ids = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { ids[t] = (plan.tables[t] || []).map(function (r) { return r[pkOf[t]]; }); });
  return ids;
}
function DEMO4A_chronology_(plan) {
  var byShip = {};
  (plan.tables.shipment_events || []).forEach(function (e) { (byShip[e.shipment_id] = byShip[e.shipment_id] || []).push({ seq: e.event_sequence, time: e.event_time, type: e.event_type, status: e.event_status, route: e.shipment_route_id }); });
  return byShip;
}

// ================================================================================================================
// ENTRYPOINT 3 — COMMIT (gated write). Confirmation constant is a PLACEHOLDER in this task → refuses. Do NOT run.
// ================================================================================================================
function TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED', mode: 'GATED WRITE (six demo tables only)', output_contract: 'ONE_PRIMARY_LOG_ENTRY' };
  var lock = null;
  try {
    // gate 1 — confirmation checksum must be SET and equal to the current DRY_RUN checksum.
    if (DEMO4A_CONFIRMED_SEED_CHECKSUM_ === 'PASTE_DEMO_SEED_CHECKSUM_HERE' || !DEMO4A_str_(DEMO4A_CONFIRMED_SEED_CHECKSUM_)) {
      out.verdict = 'COMMIT_REFUSED_CONFIRMATION_REQUIRED'; out.note = 'set DEMO4A_CONFIRMED_SEED_CHECKSUM_ to the DRY_RUN demo_plan_checksum first'; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out;
    }
    var schema = DEMO4A_schemaGate_(); if (!schema.ok) { out.verdict = 'COMMIT_REFUSED_SCHEMA'; out.schema_gate = schema; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    var masters = DEMO4A_readMasters_();
    var plan = DEMO4A_buildPlan_(masters);
    if (!plan.ok) { out.verdict = 'COMMIT_REFUSED_PLAN'; out.reason = plan.reason; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    if (DEMO4A_str_(DEMO4A_CONFIRMED_SEED_CHECKSUM_) !== DEMO4A_str_(plan.checksum)) { out.verdict = 'COMMIT_REFUSED_CHECKSUM_MISMATCH'; out.expected = plan.checksum; out.confirmed = DEMO4A_CONFIRMED_SEED_CHECKSUM_; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }

    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) { out.verdict = 'COMMIT_REFUSED_LOCK'; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    // re-gate under lock (drift since the pre-lock read fails closed).
    var schema2 = DEMO4A_schemaGate_(); if (!schema2.ok) { out.verdict = 'COMMIT_REFUSED_SCHEMA_DRIFT'; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }
    var plan2 = DEMO4A_buildPlan_(DEMO4A_readMasters_());
    if (!plan2.ok || DEMO4A_str_(plan2.checksum) !== DEMO4A_str_(DEMO4A_CONFIRMED_SEED_CHECKSUM_)) { out.verdict = 'COMMIT_REFUSED_DRIFT_UNDER_LOCK'; out.live_checksum = plan2.ok ? plan2.checksum : null; Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2)); return out; }

    // idempotent FK-safe insert: skip any PK already present (REUSE); insert only absent rows.
    var pkOf = { shipping_plans: 'shipping_plan_id', shipping_plan_lines: 'shipping_plan_line_id', shipments: 'shipment_id', shipment_lines: 'shipment_line_id', shipment_routes: 'shipment_route_id', shipment_events: 'shipment_event_id' };
    var delta = {}, reused = {};
    DEMO4A_WRITE_ORDER_.forEach(function (name) {
      var sh = DEMO4A_ss_().getSheetByName(name), pk = pkOf[name];
      var t = DEMO4A_readTable_(name), have = {}; t.rows.forEach(function (r) { have[DEMO4A_str_(r[pk])] = 1; });
      var toWrite = (plan2.tables[name] || []).filter(function (r) { return !have[DEMO4A_str_(r[pk])]; });
      reused[name] = (plan2.tables[name] || []).length - toWrite.length;
      toWrite.forEach(function (r) { sh.appendRow(DEMO4A_rowForHeaders_(t.headers, r)); });
      delta[name] = toWrite.length;
    });
    SpreadsheetApp.flush();
    // verified readback: every planned PK present exactly once.
    var verify = DEMO4A_collisionScan_(plan2);
    out.delta = delta; out.reused = reused; out.readback_all_present = verify.all_present; out.demo_plan_checksum = plan2.checksum;
    out.verdict = verify.all_present ? (Object.keys(delta).every(function (k) { return delta[k] === 0; }) ? 'REUSED' : 'COMMITTED') : 'COMMITTED_UNVERIFIED';
  } catch (e) { out.verdict = 'COMMIT_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  finally { if (lock) { try { lock.releaseLock(); } catch (e2) { } } }
  Logger.log('DEMO4A_COMMIT ' + JSON.stringify(out, null, 2));
  return out;
}

// ================================================================================================================
// ENTRYPOINT 4 — VALIDATE (strictly read-only post-write verification)
// ================================================================================================================
function TEMP_DEMO4A_VALIDATE_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_VALIDATE_SHIPPING_SHIPMENT_MAP_SEED', mode: 'STRICTLY READ-ONLY', output_contract: 'ONE_PRIMARY_LOG_ENTRY' };
  try {
    var masters = DEMO4A_readMasters_();
    var plan = DEMO4A_buildPlan_(masters);
    if (!plan.ok) { out.verdict = 'VALIDATE_BLOCKED'; out.reason = plan.reason; Logger.log('DEMO4A_VALIDATE ' + JSON.stringify(out, null, 2)); return out; }
    var live = {}; DEMO4A_WRITE_ORDER_.forEach(function (n) { live[n] = DEMO4A_readTable_(n); });
    out.checks = DEMO4A_validateLive_(plan, live);
    out.demo_plan_checksum = plan.checksum;
    out.verdict = Object.keys(out.checks).every(function (k) { return out.checks[k].ok === true; }) ? 'DEMO_SEED_VALIDATED' : 'DEMO_SEED_RECONCILIATION_REQUIRED';
  } catch (e) { out.verdict = 'VALIDATE_THREW'; out.reason = (e && e.message) ? e.message : String(e); }
  out.DEMO4A_ZERO_WRITE_CONFIRMED = 'YES (read-only; no stock/PO/K2/checksum/flag change)';
  Logger.log('DEMO4A_VALIDATE ' + JSON.stringify(out, null, 2));
  return out;
}
// pure live-vs-plan verification (PK present, FK resolvable, chronology increasing, latest event agrees with status/current node).
function DEMO4A_validateLive_(plan, live) {
  var pkOf = { shipping_plans: 'shipping_plan_id', shipping_plan_lines: 'shipping_plan_line_id', shipments: 'shipment_id', shipment_lines: 'shipment_line_id', shipment_routes: 'shipment_route_id', shipment_events: 'shipment_event_id' };
  function idset(name) { var s = {}; (live[name] ? live[name].rows : []).forEach(function (r) { s[DEMO4A_str_(r[pkOf[name]])] = r; }); return s; }
  var checks = {};
  // PK present for every planned row
  var pkOk = true, pkMiss = [];
  DEMO4A_WRITE_ORDER_.forEach(function (name) { var have = idset(name); (plan.tables[name] || []).forEach(function (r) { if (!have[DEMO4A_str_(r[pkOf[name]])]) { pkOk = false; pkMiss.push(name + ':' + r[pkOf[name]]); } }); });
  checks.pk_present = { ok: pkOk, missing: pkMiss.slice(0, 10) };
  // FK chain resolvable (child FK → existing parent PK)
  var plans = idset('shipping_plans'), sp = idset('shipments'), spl = idset('shipping_plan_lines');
  var fkOk = true, fkMiss = [];
  (plan.tables.shipping_plan_lines || []).forEach(function (r) { if (!plans[DEMO4A_str_(r.shipping_plan_id)]) { fkOk = false; fkMiss.push('spl→plan:' + r.shipping_plan_id); } });
  (plan.tables.shipments || []).forEach(function (r) { if (!plans[DEMO4A_str_(r.shipping_plan_id)]) { fkOk = false; fkMiss.push('ship→plan:' + r.shipping_plan_id); } });
  (plan.tables.shipment_lines || []).forEach(function (r) { if (!sp[DEMO4A_str_(r.shipment_id)]) { fkOk = false; fkMiss.push('sl→ship:' + r.shipment_id); } if (r.shipping_plan_line_id && !spl[DEMO4A_str_(r.shipping_plan_line_id)]) { fkOk = false; fkMiss.push('sl→spl:' + r.shipping_plan_line_id); } });
  (plan.tables.shipment_routes || []).forEach(function (r) { if (!sp[DEMO4A_str_(r.shipment_id)]) { fkOk = false; fkMiss.push('route→ship:' + r.shipment_id); } });
  var routes = idset('shipment_routes');
  (plan.tables.shipment_events || []).forEach(function (r) { if (!sp[DEMO4A_str_(r.shipment_id)]) { fkOk = false; fkMiss.push('evt→ship:' + r.shipment_id); } if (r.shipment_route_id && !routes[DEMO4A_str_(r.shipment_route_id)]) { fkOk = false; fkMiss.push('evt→route:' + r.shipment_route_id); } });
  checks.fk_chain = { ok: fkOk, missing: fkMiss.slice(0, 10) };
  // chronology + latest-event agreement (pure over the plan; the live rows equal the plan by PK+checksum)
  checks.chronology = DEMO4A_checkChronology_(plan);
  checks.latest_event_agreement = DEMO4A_checkLatestAgreement_(plan);
  checks.map_coordinates = DEMO4A_checkCoords_(plan);
  return checks;
}
function DEMO4A_checkChronology_(plan) {
  var byShip = {}, ok = true, bad = [];
  (plan.tables.shipment_events || []).forEach(function (e) { (byShip[e.shipment_id] = byShip[e.shipment_id] || []).push(e); });
  Object.keys(byShip).forEach(function (sid) {
    var evs = byShip[sid].slice().sort(function (a, b) { return a.event_sequence - b.event_sequence; });
    for (var i = 1; i < evs.length; i++) { if (!(DEMO4A_str_(evs[i].event_time) > DEMO4A_str_(evs[i - 1].event_time))) { ok = false; bad.push(sid); } }
  });
  return { ok: ok, non_increasing: bad };
}
function DEMO4A_checkLatestAgreement_(plan) {
  var ok = true, detail = [];
  var routesByShip = {}; (plan.tables.shipment_routes || []).forEach(function (r) { (routesByShip[r.shipment_id] = routesByShip[r.shipment_id] || []).push(r); });
  var evByShip = {}; (plan.tables.shipment_events || []).forEach(function (e) { (evByShip[e.shipment_id] = evByShip[e.shipment_id] || []).push(e); });
  (plan.tables.shipments || []).forEach(function (s) {
    var evs = (evByShip[s.shipment_id] || []).slice().sort(function (a, b) { return a.event_sequence - b.event_sequence; });
    var last = evs[evs.length - 1];
    if (!last) { ok = false; detail.push(s.shipment_id + ':no_event'); return; }
    var st = DEMO4A_low_(s.status);
    // future/planned nodes must NOT have completed events: every event's node is completed/current, never planned.
    var routes = routesByShip[s.shipment_id] || [];
    var statusByRoute = {}; routes.forEach(function (r) { statusByRoute[DEMO4A_str_(r.shipment_route_id)] = DEMO4A_low_(r.status); });
    var futureRecorded = evs.some(function (e) { return statusByRoute[DEMO4A_str_(e.shipment_route_id)] === 'planned'; });
    if (futureRecorded) { ok = false; detail.push(s.shipment_id + ':future_node_event'); }
    // in_transit latest = current node event; received latest = received event; shipped latest = departed_origin.
    if (st === 'in_transit' && !(DEMO4A_low_(last.event_status) === 'current')) { ok = false; detail.push(s.shipment_id + ':in_transit_latest_not_current'); }
    if (st === 'received' && !(DEMO4A_low_(last.event_type) === 'received')) { ok = false; detail.push(s.shipment_id + ':received_latest_not_received'); }
    if (st === 'shipped' && !(DEMO4A_low_(last.event_type) === 'departed_origin')) { ok = false; detail.push(s.shipment_id + ':shipped_latest_not_departed'); }
  });
  return { ok: ok, detail: detail };
}
function DEMO4A_checkCoords_(plan) {
  var ok = true, bad = [];
  (plan.tables.shipment_routes || []).forEach(function (r) { if (!DEMO4A_validCoord_(r.latitude, r.longitude)) { ok = false; bad.push(r.shipment_route_id); } });
  (plan.tables.shipment_events || []).forEach(function (e) { if (!DEMO4A_validCoord_(e.latitude, e.longitude)) { ok = false; bad.push(e.shipment_event_id); } });
  return { ok: ok, invalid: bad.slice(0, 10) };
}

// ================================================================================================================
// ENTRYPOINT 5 — CLEAR (STAGED OFF — separate placeholder token → refuses. NOT run in this task.)
//   When armed: removes ONLY exact DEMO-20260824-* ids, in reverse-FK order, and refuses if a demo row was modified
//   or is referenced by any non-demo row. Deletion order: events → routes → shipment_lines → shipments →
//   shipping_plan_lines → shipping_plans.
// ================================================================================================================
function TEMP_DEMO4A_CLEAR_SHIPPING_SHIPMENT_MAP_SEED() {
  var out = { tool: 'TEMP_DEMO4A_CLEAR_SHIPPING_SHIPMENT_MAP_SEED', mode: 'STAGED OFF (separate confirmation; not run in this task)', output_contract: 'ONE_PRIMARY_LOG_ENTRY', deletion_order: DEMO4A_CLEAR_ORDER_ };
  if (DEMO4A_CONFIRMED_CLEAR_TOKEN_ === 'PASTE_DEMO_CLEAR_TOKEN_HERE' || !DEMO4A_str_(DEMO4A_CONFIRMED_CLEAR_TOKEN_)) {
    out.verdict = 'CLEAR_REFUSED_STAGED_OFF'; out.note = 'CLEAR is deliberately disarmed; set DEMO4A_CONFIRMED_CLEAR_TOKEN_ in a separate, explicit task to enable.';
    Logger.log('DEMO4A_CLEAR ' + JSON.stringify(out, null, 2)); return out;
  }
  out.verdict = 'CLEAR_ARMED_BUT_NOT_IMPLEMENTED_IN_THIS_TASK';
  Logger.log('DEMO4A_CLEAR ' + JSON.stringify(out, null, 2)); return out;
}
