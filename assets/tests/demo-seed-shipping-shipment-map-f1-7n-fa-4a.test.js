// F1-7N-FA-4A-DEMO-SEED-SHIPPING-SHIPMENT-MAP-V2 — controlled visual-demo seed for the six shipment tables + map.
// Run: node assets/tests/demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js
// Proves: exact six-table schema use, exact FK chain, masters never written, missing location/coordinate fails
// closed, chronological events, latest event agrees with status/current node, future nodes not recorded as completed
// events, retry REUSED with 0-delta, CLEAR targets only exact DEMO ids, no production/stock/PO/K2/doc/API side effect.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('DEMO-4A SEED: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
// strip // line-comments first (they can contain apostrophes that would desync quote-pairing), then take quoted tokens
function arrTokens(literal) { var body = literal.replace(/\[([\s\S]*)\]/, '$1').replace(/\/\/[^\n]*/g, ''); var out = [], re = /'([^']+)'/g, x; while ((x = re.exec(body))) out.push(x[1]); return out; }

var G = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_demo_shipping_shipment_map_seed_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var G11 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '11_shipping_plan_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G12 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '12_shipment_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G22 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '22_shipment_dispatch_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G31 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '31_shipment_receipt_route_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');

// bring the frozen config + pure builders into scope — ONE top-level eval (var-in-callback would not leak to module scope)
var LOAD = [];
['DEMO4A_PREFIX_', 'DEMO4A_TAG_', 'DEMO4A_SOURCE_', 'DEMO4A_ACTOR_', 'DEMO4A_CREATED_AT_', 'DEMO4A_CONFIRMED_SEED_CHECKSUM_', 'DEMO4A_CONFIRMED_CLEAR_TOKEN_'].forEach(function (n) { LOAD.push(G.match(new RegExp('var ' + n + ' = [^\\n]*;'))[0]); });
['DEMO4A_WRITE_ORDER_', 'DEMO4A_CLEAR_ORDER_', 'DEMO4A_MASTER_TABS_'].forEach(function (n) { LOAD.push(G.match(new RegExp('var ' + n + ' = \\[[\\s\\S]*?\\];'))[0]); });
LOAD.push(G.match(/var DEMO4A_REQUIRED_COLS_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_SHIP_LIFECYCLE_ = \[[\s\S]*?\n\];/)[0]);
['DEMO4A_str_', 'DEMO4A_low_', 'DEMO4A_num_', 'DEMO4A_truthy_', 'DEMO4A_hash_', 'DEMO4A_z2_', 'DEMO4A_addDays_', 'DEMO4A_validCoord_',
  'DEMO4A_indexLocations_', 'DEMO4A_nodesByTemplate_', 'DEMO4A_resolveNode_', 'DEMO4A_templatePref_', 'DEMO4A_selectTemplates_',
  'DEMO4A_lifecycleNodes_', 'DEMO4A_lifecycleEvents_', 'DEMO4A_buildPlan_', 'DEMO4A_overviewVisible_', 'DEMO4A_draftVisible_',
  'DEMO4A_mapMoving_', 'DEMO4A_mapDelivered_', 'DEMO4A_mapVisible_', 'DEMO4A_checksum_', 'DEMO4A_allIds_', 'DEMO4A_chronology_',
  'DEMO4A_rowForHeaders_', 'DEMO4A_validateLive_', 'DEMO4A_checkChronology_', 'DEMO4A_checkLatestAgreement_', 'DEMO4A_checkCoords_']
  .forEach(function (n) { LOAD.push(extractFn(G, n)); });
eval(LOAD.join('\n'));

// ---- synthetic read-only masters (3 active US templates, each 3 nodes, all resolvable to valid coords) ----
function tpl(id, region) { return { route_template_id: id, route_template_name: 'CN to US ' + region, is_active: 'TRUE', origin_country: 'CN', destination_country: 'US', destination_region: region, origin_warehouse_id: 'WH-CN-' + id, destination_warehouse_id: 'WH-US-' + id, carrier_id: 'CAR-1', transit_type: 'SEA', last_mile_delivery: 'FBA' }; }
function node(tid, seq, loc, evt, type) { return { route_template_node_id: tid + '-N' + seq, route_template_id: tid, node_sequence: seq, node_type: type, node_code: type.toUpperCase() + seq, node_name: type + ' ' + seq, planned_event_type: evt, transport_mode_to_next: 'SEA', logistics_location_id: loc }; }
function loc(id, lat, lng, country, region, city) { return { logistics_location_id: id, location_code: id + '-C', location_name: id + ' Name', country: country, region: region, city: city, latitude: lat, longitude: lng, warehouse_id: '' }; }
function mastersFull() {
  var templates = [tpl('RT-W', 'US West'), tpl('RT-C', 'US Central'), tpl('RT-E', 'US East'), Object.assign(tpl('RT-INACTIVE', 'US West'), { is_active: 'FALSE' })];
  var nodes = [];
  ['RT-W', 'RT-C', 'RT-E'].forEach(function (tid) { nodes.push(node(tid, 1, tid + '-L1', 'departure', 'origin'), node(tid, 2, tid + '-L2', 'port_arrival', 'port'), node(tid, 3, tid + '-L3', 'delivery', 'destination')); });
  var locations = [];
  ['RT-W', 'RT-C', 'RT-E'].forEach(function (tid, k) { locations.push(loc(tid + '-L1', 31.2 + k, 121.5 + k, 'CN', 'Shanghai', 'Shanghai'), loc(tid + '-L2', 33.7 + k, -118.2 - k, 'US', 'CA', 'LA'), loc(tid + '-L3', 40.7 + k, -74.0 - k, 'US', tpl(tid, '').destination_region, 'City')); });
  return { templates: templates, nodes: nodes, locations: locations, skus: ['SKU-A', 'SKU-B', 'SKU-C'] };
}

// ============================================================ A — exact schema use (subset of canonical HEADERS)
section('A. exact six-table schema use');
var CANON = {
  shipping_plans: arrTokens(G11.match(/var SHIPPING_PLANS_HEADERS_ = \[[\s\S]*?\];/)[0]),
  shipping_plan_lines: arrTokens(G11.match(/var SHIPPING_PLAN_LINES_HEADERS_ = \[[\s\S]*?\];/)[0]),
  shipments: arrTokens(G12.match(/var SHIPMENTS_HEADERS_ = \[[\s\S]*?\];/)[0]),
  shipment_lines: arrTokens(G12.match(/var SHIPMENT_LINES_HEADERS_ = \[[\s\S]*?\];/)[0]),
  shipment_routes: arrTokens(G22.match(/var ROUTE_HEADERS = \[[\s\S]*?\];/)[0]),
  shipment_events: arrTokens(G31.match(/var SHIP_EVENT_HEADERS_ = \[[\s\S]*?\];/)[0])
};
eq(DEMO4A_WRITE_ORDER_, ['shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines', 'shipment_routes', 'shipment_events'], 'A0. FK-safe write order is the six demo tables');
DEMO4A_WRITE_ORDER_.forEach(function (t) {
  var canon = CANON[t], req = DEMO4A_REQUIRED_COLS_[t];
  var notInCanon = req.filter(function (c) { return canon.indexOf(c) === -1; });
  eq(notInCanon, [], 'A1. ' + t + ' required columns are all real canonical columns');
});

// ============================================================ B — plan build + counts + FK chain
section('B. deterministic plan + FK chain');
var plan = DEMO4A_buildPlan_(mastersFull());
ok(plan.ok, 'B0. plan builds with sufficient active resolvable templates');
eq(plan.counts, { shipping_plans: 3, shipping_plan_lines: 8, shipments: 3, shipment_lines: 8, shipment_routes: 9, shipment_events: 6 }, 'B1. row counts per table');
// every id begins with the frozen prefix
var allIds = DEMO4A_allIds_(plan); var flat = [];
Object.keys(allIds).forEach(function (t) { flat = flat.concat(allIds[t]); });
ok(flat.every(function (id) { return String(id).indexOf('DEMO-20260824-') === 0; }), 'B2. every demo id carries the DEMO-20260824- prefix');
// FK chain resolvable (use the pure validator with live == plan)
var liveAsPlan = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { liveAsPlan[t] = { present: true, headers: CANON[t], rows: plan.tables[t] }; });
var checks = DEMO4A_validateLive_(plan, liveAsPlan);
ok(checks.pk_present.ok, 'B3. every planned PK present');
ok(checks.fk_chain.ok, 'B3. FK chain fully resolvable (plan→lines→shipment→lines→routes→events)');
// explicit FK spot-checks
ok(plan.tables.shipments.every(function (s) { return plan.tables.shipping_plans.some(function (p) { return p.shipping_plan_id === s.shipping_plan_id; }); }), 'B4. shipments.shipping_plan_id → shipping_plans');
ok(plan.tables.shipment_lines.every(function (l) { return plan.tables.shipments.some(function (s) { return s.shipment_id === l.shipment_id; }) && plan.tables.shipping_plan_lines.some(function (pl) { return pl.shipping_plan_line_id === l.shipping_plan_line_id; }); }), 'B4. shipment_lines FK to shipment + shipping_plan_line');
ok(plan.tables.shipment_events.every(function (e) { return plan.tables.shipment_routes.some(function (r) { return r.shipment_route_id === e.shipment_route_id; }); }), 'B4. shipment_events.shipment_route_id → shipment_routes');
// qty consistency: shipment_line.shipment_qty == its shipping_plan_line.approved_qty
ok(plan.tables.shipment_lines.every(function (l) { var pl = plan.tables.shipping_plan_lines.filter(function (p) { return p.shipping_plan_line_id === l.shipping_plan_line_id; })[0]; return pl && Number(pl.approved_qty) === Number(l.shipment_qty); }), 'B5. shipment_line qty consistent with its shipping_plan_line');

// ============================================================ C — lifecycle / enums / map contract
section('C. statuses, event tokens, map contract');
var byStatus = {}; plan.tables.shipments.forEach(function (s) { byStatus[s.status] = s.shipment_id; });
eq(Object.keys(byStatus).sort(), ['in_transit', 'received', 'shipped'], 'C1. three distinct canonical shipment statuses (shipped/in_transit/received)');
eq(plan.tables.shipping_plans.map(function (p) { return p.status; }).sort(), ['approved', 'completed', 'pending_approval'], 'C1. three distinct canonical plan statuses');
// route node statuses use only the map vocabulary
ok(plan.tables.shipment_routes.every(function (r) { return ['completed', 'current', 'planned'].indexOf(r.status) !== -1; }), 'C2. route node status ∈ {completed,current,planned}');
// event types + statuses use only canonical tokens
ok(plan.tables.shipment_events.every(function (e) { return ['departed_origin', 'route_node_reached', 'received'].indexOf(e.event_type) !== -1; }), 'C3. event_type ∈ canonical {departed_origin,route_node_reached,received}');
ok(plan.tables.shipment_events.every(function (e) { return ['completed', 'current', 'received'].indexOf(e.event_status) !== -1; }), 'C3. event_status ∈ {completed,current,received}');
// chronology strictly increasing
ok(DEMO4A_checkChronology_(plan).ok, 'C4. event timestamps strictly increase by sequence');
// latest event agrees with status/current node; future nodes not recorded as completed events
var agree = DEMO4A_checkLatestAgreement_(plan);
ok(agree.ok, 'C5. latest event agrees with status/current node AND no future(planned) node has an event');
// in-transit is the primary map record + has remaining/future planned nodes
ok(plan.visibility.primary_map_record && plan.visibility.primary_map_record.status === 'in_transit', 'C6. in_transit is the primary On-the-Way-Map record');
var itShip = byStatus['in_transit'];
ok(plan.tables.shipment_routes.some(function (r) { return r.shipment_id === itShip && r.status === 'planned'; }) && plan.tables.shipment_routes.some(function (r) { return r.shipment_id === itShip && r.status === 'current'; }), 'C6. in_transit shipment has a current node AND remaining planned nodes');
// delivered shipment is not moving (map delivered flag), still appears in Overview
ok(DEMO4A_mapDelivered_('received') && !DEMO4A_mapMoving_('received'), 'C7. received is delivered (not moving) on the map');
eq(plan.visibility.shipment_overview.map(function (s) { return s.status; }).sort(), ['in_transit', 'received', 'shipped'], 'C7. all three appear in Shipment Overview');
eq(plan.visibility.shipment_draft.map(function (s) { return s.status; }), ['shipped'], 'C7. only shipped appears in Shipment Draft');
// coordinates valid + from master data (no 0,0), events + routes both carry coords
ok(DEMO4A_checkCoords_(plan).ok, 'C8. every route + event carries a valid non-(0,0) coordinate');
ok(plan.tables.shipment_routes.every(function (r) { return r.location_ref_type === 'logistics_location' && String(r.location_ref_id) !== ''; }), 'C8. route nodes carry logistics_location lineage (location_ref_id)');

// ============================================================ D — fail-closed on missing location / bad coordinate
section('D. fail-closed preflight');
var mMissingLoc = mastersFull(); mMissingLoc.locations = mMissingLoc.locations.filter(function (l) { return l.logistics_location_id !== 'RT-W-L2'; });
var pMissing = DEMO4A_buildPlan_(mMissingLoc);
eq([pMissing.ok, pMissing.reason], [false, 'INSUFFICIENT_ACTIVE_RESOLVABLE_TEMPLATES'], 'D1. a node with no resolvable logistics location disqualifies the template → <3 → fail closed');
var mBadCoord = mastersFull(); mBadCoord.locations.forEach(function (l) { if (l.logistics_location_id === 'RT-C-L1') { l.latitude = 0; l.longitude = 0; } });
var pBad = DEMO4A_buildPlan_(mBadCoord);
eq(pBad.ok, false, 'D2. a (0,0) coordinate fails the coord gate → template disqualified → fail closed');
var pFewSku = DEMO4A_buildPlan_(Object.assign(mastersFull(), { skus: ['ONLY-ONE'] }));
eq([pFewSku.ok, pFewSku.reason], [false, 'INSUFFICIENT_ACTIVE_SKUS'], 'D3. <2 active SKUs fails closed');
// resolveNode fail-closed reasons
eq(DEMO4A_resolveNode_({ logistics_location_id: '' }, {}).reason, 'NODE_NO_LOGISTICS_LOCATION_ID', 'D4. node without logistics_location_id fails');
eq(DEMO4A_resolveNode_({ logistics_location_id: 'X' }, {}).reason, 'LOGISTICS_LOCATION_NOT_FOUND', 'D4. unknown location fails');
eq(DEMO4A_resolveNode_({ logistics_location_id: 'X' }, { X: { logistics_location_id: 'X', latitude: '', longitude: '' } }).reason, 'LOCATION_COORDINATE_INVALID_OR_MISSING', 'D4. blank coordinate fails');

// ============================================================ E — determinism + idempotent REUSE (0-delta retry)
section('E. determinism + idempotent retry');
eq(DEMO4A_buildPlan_(mastersFull()).checksum, plan.checksum, 'E1. rebuild → identical demo_plan_checksum (deterministic)');
// simulate COMMIT idempotency: filter planned rows against an existing-PK set (mirrors the COMMIT insert filter).
var pkOf = { shipping_plans: 'shipping_plan_id', shipping_plan_lines: 'shipping_plan_line_id', shipments: 'shipment_id', shipment_lines: 'shipment_line_id', shipment_routes: 'shipment_route_id', shipment_events: 'shipment_event_id' };
function simDelta(plan, havePlan) { var d = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { var pk = pkOf[t]; var have = {}; (havePlan ? plan.tables[t] : []).forEach(function (r) { have[r[pk]] = 1; }); d[t] = (plan.tables[t] || []).filter(function (r) { return !have[r[pk]]; }).length; }); return d; }
eq(simDelta(plan, false), { shipping_plans: 3, shipping_plan_lines: 8, shipments: 3, shipment_lines: 8, shipment_routes: 9, shipment_events: 6 }, 'E2. first COMMIT writes the full plan');
eq(simDelta(plan, true), { shipping_plans: 0, shipping_plan_lines: 0, shipments: 0, shipment_lines: 0, shipment_routes: 0, shipment_events: 0 }, 'E3. exact retry → 0/0/0/0/0/0 delta (REUSED)');
// rowForHeaders maps onto live header order, drops unknown keys, blanks missing
eq(DEMO4A_rowForHeaders_(['a', 'b', 'c'], { a: 1, c: 3, z: 9 }), [1, '', 3], 'E4. rowForHeaders maps to live header order (unknown dropped, missing blank)');

// ============================================================ F — write boundary + CLEAR safety (source-facts)
section('F. write boundary + CLEAR safety');
// only the six writable tables are ever appended to; masters are only read
var appendMatches = (G.match(/getSheetByName\(([^)]+)\)\.appendRow|\.appendRow\(/g) || []);
ok(/DEMO4A_ss_\(\)\.getSheetByName\(name\)\.appendRow/.test(G) || /sh\.appendRow\(DEMO4A_rowForHeaders_/.test(G), 'F1. COMMIT appends only via the six-table write loop');
DEMO4A_MASTER_TABS_.forEach(function (m) { ok(new RegExp("getSheetByName\\('" + m + "'\\)\\.appendRow").test(G) === false, 'F1. master ' + m + ' is never appended to'); });
// no production handler / stock / PO / K2 / document / carrier API / notification / flag calls
['handleUpsertShippingAllocationDraftAtomic', 'handleCreateShipment', 'handleDispatch', 'confirmAndDispatch', 'handleReceiveShipment', 'handleShipmentReceipt', 'reserveFactoryStock', 'deductFactoryStock', 'consumePurchaseOrder', 'weeklyAiPlanGenerate', 'generateDocument', 'UrlFetchApp', 'MailApp', 'GmailApp', 'setProperty'].forEach(function (banned) {
  ok(G.indexOf(banned) === -1, 'F2. no reference to banned side-effect API: ' + banned);
});
// CLEAR: staged off, reverse-FK order, prefix-only, not implemented in this task
ok(/CLEAR_REFUSED_STAGED_OFF/.test(G) && /PASTE_DEMO_CLEAR_TOKEN_HERE/.test(G), 'F3. CLEAR is staged OFF behind a placeholder token');
eq(DEMO4A_CLEAR_ORDER_, ['shipment_events', 'shipment_routes', 'shipment_lines', 'shipments', 'shipping_plan_lines', 'shipping_plans'], 'F3. CLEAR deletion order is reverse-FK');
ok(DEMO4A_CONFIRMED_SEED_CHECKSUM_ === 'PASTE_DEMO_SEED_CHECKSUM_HERE', 'F4. COMMIT confirmation constant left at PLACEHOLDER (COMMIT refuses)');
// COMMIT gate source-facts
var commitFn = extractFn(G, 'TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED');
ok(/COMMIT_REFUSED_CONFIRMATION_REQUIRED/.test(commitFn) && /COMMIT_REFUSED_CHECKSUM_MISMATCH/.test(commitFn), 'F5. COMMIT refuses on placeholder + checksum mismatch');
ok(/LockService\.getScriptLock\(\)/.test(commitFn) && /tryLock\(30000\)/.test(commitFn) && /COMMIT_REFUSED_DRIFT_UNDER_LOCK/.test(commitFn), 'F5. COMMIT takes ScriptLock + re-gates under lock');
ok(/SpreadsheetApp\.flush\(\)/.test(commitFn) && /readback_all_present/.test(commitFn), 'F5. COMMIT flushes + verifies readback');
// DEMO tag marker present on rows that have a note/source field (never a new column)
ok(plan.tables.shipping_plans.every(function (r) { return r.note === 'DEMO ONLY — DO NOT PROCESS'; }) && plan.tables.shipment_events.every(function (r) { return r.note === 'DEMO ONLY — DO NOT PROCESS' && r.source === 'DEMO-4A'; }), 'F6. DEMO-ONLY marker stamped in existing note/source fields');

done();
