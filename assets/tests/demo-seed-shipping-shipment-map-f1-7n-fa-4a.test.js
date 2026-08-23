// F1-7N-FA-4A-DEMO-SEED-SHIPPING-SHIPMENT-MAP (V3, live-readback hardened).
// Run: node assets/tests/demo-seed-shipping-shipment-map-f1-7n-fa-4a.test.js
// Proves: exact existing-state classification (ABSENT_ALL/PRESENT_EXACT_ALL/PARTIAL/CONTENT_DRIFT/DUPLICATE), live-row
// checksums + validation, real marketplace_skus⋈sku_details SKU pairs (no fabricated site_sku), distinct W/C/E template
// selection, dynamic counts + checksum, inserted-only rollback, full CLEAR staged OFF, masters/handlers untouched.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('DEMO-4A SEED V3: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
function arrTokens(literal) { var body = literal.replace(/\[([\s\S]*)\]/, '$1').replace(/\/\/[^\n]*/g, ''); var out = [], re = /'([^']+)'/g, x; while ((x = re.exec(body))) out.push(x[1]); return out; }

var G = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_demo_shipping_shipment_map_seed_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var G11 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '11_shipping_plan_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G12 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '12_shipment_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G22 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '22_shipment_dispatch_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G31 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '31_shipment_receipt_route_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');

var LOAD = [];
['DEMO4A_PREFIX_', 'DEMO4A_TAG_', 'DEMO4A_SOURCE_', 'DEMO4A_ACTOR_', 'DEMO4A_CREATED_AT_', 'DEMO4A_DEFAULT_COMPANY_', 'DEMO4A_CONFIRMED_SEED_CHECKSUM_', 'DEMO4A_CONFIRMED_CLEAR_TOKEN_', 'DEMO4A_JOURNAL_KEY_', 'DEMO4A_WRITE_ORDER_', 'DEMO4A_CLEAR_ORDER_', 'DEMO4A_PK_OF_', 'DEMO4A_FK_INTO_DEMO_', 'DEMO4A_MASTER_TABS_'].forEach(function (n) { LOAD.push(G.match(new RegExp('var ' + n + ' = [^\\n]*;'))[0]); });
LOAD.push(G.match(/var DEMO4A_REQUIRED_COLS_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_SHIP_LIFECYCLE_ = \[[\s\S]*?\n\];/)[0]);
['DEMO4A_str_', 'DEMO4A_low_', 'DEMO4A_num_', 'DEMO4A_truthy_', 'DEMO4A_hash_', 'DEMO4A_z2_', 'DEMO4A_addDays_', 'DEMO4A_isDemo_', 'DEMO4A_get_',
  'DEMO4A_canonDateOnly_', 'DEMO4A_canonDateTime_', 'DEMO4A_fieldKind_', 'DEMO4A_canon_', 'DEMO4A_rowChecksum_', 'DEMO4A_mismatchedFields_',
  'DEMO4A_validCoord_', 'DEMO4A_indexLocations_', 'DEMO4A_nodesByTemplate_', 'DEMO4A_resolveNode_', 'DEMO4A_regionOf_', 'DEMO4A_selectTemplates_',
  'DEMO4A_resolveScopeAndSkus_', 'DEMO4A_lifecycleNodes_', 'DEMO4A_lifecycleEvents_', 'DEMO4A_buildPlan_', 'DEMO4A_overviewVisible_', 'DEMO4A_draftVisible_',
  'DEMO4A_mapMoving_', 'DEMO4A_mapDelivered_', 'DEMO4A_mapVisible_', 'DEMO4A_checksum_', 'DEMO4A_allIds_', 'DEMO4A_chronology_', 'DEMO4A_classifyState_',
  'DEMO4A_validateLiveRows_', 'DEMO4A_rollbackPlan_', 'DEMO4A_nonDemoReferences_'].forEach(function (n) { LOAD.push(extractFn(G, n)); });
eval(LOAD.join('\n'));

// ---- synthetic read-only masters: 3 active US templates (W/C/E), C richest (4 nodes); real marketplace_skus⋈sku_details.
function tpl(id, region) { return { route_template_id: id, route_template_name: 'CN to ' + region, is_active: 'TRUE', origin_country: 'CN', destination_country: 'US', destination_region: region, origin_warehouse_id: 'WH-CN-' + id, destination_warehouse_id: 'WH-US-' + id, carrier_id: 'CAR-1', transit_type: 'SEA', last_mile_delivery: 'FBA' }; }
function node(tid, seq, loc, evt, type) { return { route_template_node_id: tid + '-N' + seq, route_template_id: tid, node_sequence: seq, node_type: type, node_code: type.toUpperCase() + seq, node_name: type + ' ' + seq, planned_event_type: evt, transport_mode_to_next: 'SEA', logistics_location_id: loc }; }
function loc(id, lat, lng) { return { logistics_location_id: id, location_code: id + '-C', location_name: id + ' Name', country: 'US', region: 'R', city: 'City', latitude: lat, longitude: lng }; }
function mastersFull(extraNode) {
  var templates = [tpl('RT-W', 'US West'), tpl('RT-C', 'US Central'), tpl('RT-E', 'US East'), Object.assign(tpl('RT-INACT', 'US West'), { is_active: 'FALSE' })];
  var counts = { 'RT-W': 3, 'RT-C': extraNode ? 5 : 4, 'RT-E': 3 };
  var nodes = [], locations = [];
  Object.keys(counts).forEach(function (tid, k) { for (var s = 1; s <= counts[tid]; s++) { var lid = tid + '-L' + s; nodes.push(node(tid, s, lid, s === 1 ? 'origin_departure' : (s === counts[tid] ? 'final_delivery' : 'port_transit'), s === 1 ? 'origin' : (s === counts[tid] ? 'destination' : 'port'))); locations.push(loc(lid, 20 + k + s, -70 - k - s)); } });
  var marketplaceSkus = [
    { sku: 'KM-001', site_sku: 'B00AAA111', marketplace: 'Amazon', country: 'US', company: 'KM', is_active: 'TRUE' },
    { sku: 'KM-002', site_sku: 'B00BBB222', marketplace: 'Amazon', country: 'US', company: 'KM', is_active: 'TRUE' },
    { sku: 'KM-003', site_sku: 'B00CCC333', marketplace: 'Amazon', country: 'US', company: 'KM', is_active: 'TRUE' },
    { sku: 'KM-004', site_sku: 'B00DDD444', marketplace: 'Amazon', country: 'CA', company: 'KM', is_active: 'TRUE' },
    { sku: 'KM-INACT', site_sku: 'B00XXX999', marketplace: 'Amazon', country: 'US', company: 'KM', is_active: 'FALSE' }
  ];
  var skuDetails = [{ sku: 'KM-001', is_active: 'TRUE' }, { sku: 'KM-002', is_active: 'TRUE' }, { sku: 'KM-003', is_active: 'TRUE' }, { sku: 'KM-004', is_active: 'TRUE' }, { sku: 'KM-INACT', is_active: 'TRUE' }];
  return { templates: templates, nodes: nodes, locations: locations, marketplaceSkus: marketplaceSkus, skuDetails: skuDetails };
}
function liveFromPlan(plan) { var live = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { live[t] = { present: true, headers: Object.keys((plan.tables[t] || [{}])[0] || {}), rows: (plan.tables[t] || []).map(function (r) { return JSON.parse(JSON.stringify(r)); }) }; }); return live; }
function emptyLive() { var live = {}; DEMO4A_WRITE_ORDER_.forEach(function (t) { live[t] = { present: true, headers: [], rows: [] }; }); return live; }

var plan = DEMO4A_buildPlan_(mastersFull());
ok(plan.ok, 'setup. plan builds from real templates + marketplace_skus join');

// ============================================================ schema subset (owned columns are all real)
section('schema — owned columns ⊆ canonical HEADERS');
var CANON = {
  shipping_plans: arrTokens(G11.match(/var SHIPPING_PLANS_HEADERS_ = \[[\s\S]*?\];/)[0]),
  shipping_plan_lines: arrTokens(G11.match(/var SHIPPING_PLAN_LINES_HEADERS_ = \[[\s\S]*?\];/)[0]),
  shipments: arrTokens(G12.match(/var SHIPMENTS_HEADERS_ = \[[\s\S]*?\];/)[0]),
  shipment_lines: arrTokens(G12.match(/var SHIPMENT_LINES_HEADERS_ = \[[\s\S]*?\];/)[0]),
  shipment_routes: arrTokens(G22.match(/var ROUTE_HEADERS = \[[\s\S]*?\];/)[0]),
  shipment_events: arrTokens(G31.match(/var SHIP_EVENT_HEADERS_ = \[[\s\S]*?\];/)[0])
};
DEMO4A_WRITE_ORDER_.forEach(function (t) { eq(DEMO4A_REQUIRED_COLS_[t].filter(function (c) { return CANON[t].indexOf(c) === -1; }), [], 'schema. ' + t + ' required cols are real'); ok((plan.tables[t] || []).every(function (r) { return Object.keys(r).every(function (k) { return CANON[t].indexOf(k) !== -1; }); }), 'schema. ' + t + ' every written key is a real column'); });

// ============================================================ 1 — ABSENT_ALL complete insert
section('1. ABSENT_ALL');
eq(DEMO4A_classifyState_(plan, emptyLive()).classification, 'ABSENT_ALL', '1. no live rows → ABSENT_ALL (full insert)');

// ============================================================ 2 — PRESENT_EXACT_ALL → REUSED zero delta
section('2. PRESENT_EXACT_ALL');
eq(DEMO4A_classifyState_(plan, liveFromPlan(plan)).classification, 'PRESENT_EXACT_ALL', '2. live == plan exactly → PRESENT_EXACT_ALL (REUSED, zero write)');
var commitFn = extractFn(G, 'TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED');
ok(/PRESENT_EXACT_ALL[\s\S]*?delta[\s\S]*?verdict = 'REUSED'/.test(commitFn), '2. COMMIT returns REUSED with an explicit six-zero delta for PRESENT_EXACT_ALL');
ok(/if \(cls\.classification !== 'ABSENT_ALL'\) \{ out\.verdict = 'COMMIT_REFUSED_' \+ cls\.classification/.test(commitFn), '2. COMMIT inserts ONLY for ABSENT_ALL; refuses every other non-exact state');

// ============================================================ 3 — PARTIAL rows refuse
section('3. PARTIAL_PRESENT');
var partial = liveFromPlan(plan); partial.shipment_events.rows = [];
eq(DEMO4A_classifyState_(plan, partial).classification, 'PARTIAL_PRESENT', '3. some tables present, some absent → PARTIAL_PRESENT (COMMIT refuses)');
var stray = liveFromPlan(plan); stray.shipping_plans.rows.push({ shipping_plan_id: DEMO4A_PREFIX_ + 'SP-STRAY' });
eq(DEMO4A_classifyState_(plan, stray).classification, 'PARTIAL_PRESENT', '3. an unexpected stray demo id → PARTIAL_PRESENT');

// ============================================================ 4 — CONTENT_DRIFT with exact field evidence
section('4. CONTENT_DRIFT');
var drift = liveFromPlan(plan); drift.shipment_lines.rows[0].shipment_qty = 999999;
var dcls = DEMO4A_classifyState_(plan, drift);
eq(dcls.classification, 'CONTENT_DRIFT', '4. a changed field → CONTENT_DRIFT');
var driftRow = dcls.rows.filter(function (r) { return r.state === 'DRIFT'; })[0];
ok(driftRow && driftRow.mismatched_fields.some(function (m) { return m.field === 'shipment_qty' && m.live === '999999'; }), '4. drift reports the exact mismatched field + live value');

// ============================================================ 5 — DUPLICATE_DEMO_ID refuses
section('5. DUPLICATE_DEMO_ID');
var dup = liveFromPlan(plan); dup.shipping_plans.rows.push(JSON.parse(JSON.stringify(dup.shipping_plans.rows[0])));
var dupCls = DEMO4A_classifyState_(plan, dup);
eq(dupCls.classification, 'DUPLICATE_DEMO_ID', '5. a duplicate demo PK → DUPLICATE_DEMO_ID');
ok(dupCls.duplicate_pk_counts.shipping_plans >= 2, '5. duplicate PK count reported');

// ============================================================ 6 — validator catches wrong LIVE FK despite correct planned FK
section('6. live FK');
var liveOk = liveFromPlan(plan);
ok(DEMO4A_validateLiveRows_(plan, liveOk).checks.live_fk_chain.ok, '6. exact live → live FK chain ok');
var badFk = liveFromPlan(plan); badFk.shipments.rows[0].shipping_plan_id = DEMO4A_PREFIX_ + 'SP-NOEXIST';
ok(!DEMO4A_validateLiveRows_(plan, badFk).checks.live_fk_chain.ok, '6. a live shipment.shipping_plan_id → missing live plan is caught (plan FK was fine)');

// ============================================================ 7 — validator catches wrong live qty/status/coord/chronology
section('7. live qty/status/coord/event');
var badQty = liveFromPlan(plan); badQty.shipment_lines.rows[0].shipment_qty = 7;
ok(!DEMO4A_validateLiveRows_(plan, badQty).checks.live_line_qty_equals_plan.ok || !DEMO4A_validateLiveRows_(plan, badQty).checks.live_totals_equal_line_sum.ok, '7. wrong live shipment_qty vs plan-line approved_qty is caught');
var badStatus = liveFromPlan(plan); badStatus.shipment_routes.rows[0].status = 'bogus';
ok(!DEMO4A_validateLiveRows_(plan, badStatus).checks.live_route_lineage_seq_coord.ok, '7. a route status outside {completed,current,planned} is caught');
var badCoord = liveFromPlan(plan); badCoord.shipment_routes.rows[0].latitude = 0; badCoord.shipment_routes.rows[0].longitude = 0;
ok(!DEMO4A_validateLiveRows_(plan, badCoord).checks.live_route_lineage_seq_coord.ok, '7. a (0,0) live route coordinate is caught');
var badChrono = liveFromPlan(plan);
(function () { var byShip = {}; badChrono.shipment_events.rows.forEach(function (e) { (byShip[e.shipment_id] = byShip[e.shipment_id] || []).push(e); }); var multi = Object.keys(byShip).filter(function (s) { return byShip[s].length >= 2; })[0]; var evs = byShip[multi].sort(function (a, b) { return DEMO4A_num_(a.event_sequence) - DEMO4A_num_(b.event_sequence); }); evs[0].event_time = '2030-01-01 10:00:00'; })();
ok(!DEMO4A_validateLiveRows_(plan, badChrono).checks.live_event_fk_chrono_agreement.ok, '7. broken live event chronology (seq1 later than seq2) on a multi-event shipment is caught');
ok(DEMO4A_validateLiveRows_(plan, liveOk).checks.live_event_fk_chrono_agreement.ok && DEMO4A_validateLiveRows_(plan, liveOk).checks.live_ui_visibility.ok, '7. exact live passes event + UI-visibility checks');

// ============================================================ 8 — real marketplace SKU/site-SKU pair (no fabrication)
section('8. real SKU/site-SKU');
ok(plan.scope.marketplace === 'Amazon' && plan.scope.country === 'US' && plan.scope.company === 'KM', '8. scope derived from marketplace_skus (US/Amazon/KM)');
var siteSkus = plan.tables.shipping_plan_lines.map(function (r) { return r.site_sku; });
ok(siteSkus.every(function (s) { return /^B00/.test(s); }), '8. site_sku comes from marketplace_skus (real ASIN-like), never sku+"-US"');
ok(plan.tables.shipping_plan_lines.every(function (r) { return r.site_sku !== r.sku + '-US'; }), '8. no fabricated site_sku = sku+"-US"');
var few = DEMO4A_buildPlan_(Object.assign(mastersFull(), { marketplaceSkus: [{ sku: 'KM-001', site_sku: 'B00AAA111', marketplace: 'Amazon', country: 'US', company: 'KM', is_active: 'TRUE' }], skuDetails: [{ sku: 'KM-001', is_active: 'TRUE' }] }));
eq([few.ok, few.reason], [false, 'INSUFFICIENT_ACTIVE_MARKETPLACE_SKUS'], '8. <2 active joined pairs → INSUFFICIENT_ACTIVE_MARKETPLACE_SKUS');

// ============================================================ 9 — distinct West/Central/East
section('9. distinct W/C/E');
eq(plan.region_selection_mode, 'DISTINCT_WCE', '9. one template per US West/Central/East');
eq(plan.chosen_templates.map(function (c) { return c.region; }).sort(), ['US_CENTRAL', 'US_EAST', 'US_WEST'], '9. the three distinct regions are selected');
ok(plan.visibility.primary_map_record && plan.visibility.primary_map_record.status === 'in_transit', '9. the richest route is the PRIMARY in-transit record');
var noEast = mastersFull(); noEast.templates = noEast.templates.filter(function (t) { return DEMO4A_regionOf_(t) !== 'US_EAST'; }).concat([tpl('RT-W2', 'US West')]); noEast.nodes = noEast.nodes.filter(function (n) { return n.route_template_id !== 'RT-E'; }); for (var s = 1; s <= 3; s++) { noEast.nodes.push(node('RT-W2', s, 'RT-W2-L' + s, 'e', 't')); noEast.locations.push(loc('RT-W2-L' + s, 40 + s, -80 - s)); }
var fb = DEMO4A_buildPlan_(noEast);
ok(fb.ok && fb.region_selection_mode === 'FALLBACK_TRUTHFUL_TOP3', '9. no East available → truthful FALLBACK flag (never falsely claims W/C/E)');

// ============================================================ 10 — dynamic counts + checksum binding
section('10. dynamic counts + checksum');
ok(plan.per_shipment.every(function (s) { return s.route_rows === s.nodes; }), '10. route rows per shipment = its template node count');
eq(plan.counts.total, plan.counts.shipping_plans + plan.counts.shipping_plan_lines + plan.counts.shipments + plan.counts.shipment_lines + plan.counts.shipment_routes + plan.counts.shipment_events, '10. total = sum of the six dynamic table counts');
var planMore = DEMO4A_buildPlan_(mastersFull(true));   // RT-C gains a node
ok(planMore.counts.shipment_routes !== plan.counts.shipment_routes && planMore.checksum !== plan.checksum, '10. adding a node changes route count AND the plan checksum');
eq(DEMO4A_buildPlan_(mastersFull()).checksum, plan.checksum, '10. rebuild is deterministic (identical checksum)');

// ============================================================ 11 — inserted-only reverse-FK rollback
section('11. rollback');
var rb = DEMO4A_rollbackPlan_({ shipping_plans: ['P1'], shipment_lines: ['L1', 'L2'], shipment_events: ['E1'] });
eq(rb.map(function (x) { return x.table; }), ['shipment_events', 'shipment_lines', 'shipping_plans'], '11. rollback deletes in reverse-FK order, only tables with inserted rows');
eq(rb[0].ids, ['E1'], '11. rollback targets ONLY the ids inserted by this execution');
ok(/DEMO4A_rollbackPlan_\(inserted\)/.test(commitFn) && /DEMO4A_deleteRowsByPk_\(step\.table, set\)/.test(commitFn) && /COMMIT_FAILED_ROLLED_BACK/.test(commitFn) && /COMMIT_FAILED_ROLLBACK_UNVERIFIED/.test(commitFn), '11. COMMIT rolls back inserted rows on write/readback failure + verifies');
ok(/setProperty\(DEMO4A_JOURNAL_KEY_/.test(commitFn) && /absent_all_proof/.test(commitFn) && /COMMIT_FAILED_JOURNAL_UNVERIFIED/.test(commitFn), '11. durable journal (checksum + ABSENT_ALL proof + intended ids) written + readback-verified before first insert');

// ============================================================ 12 — CLEAR implemented + placeholder-disarmed
section('12. CLEAR');
var clearFn = extractFn(G, 'TEMP_DEMO4A_CLEAR_SHIPPING_SHIPMENT_MAP_SEED');
ok(DEMO4A_CONFIRMED_CLEAR_TOKEN_ === 'PASTE_DEMO_CLEAR_TOKEN_HERE' && /CLEAR_REFUSED_STAGED_OFF/.test(clearFn), '12. CLEAR is staged OFF (placeholder token refuses)');
ok(/PRESENT_EXACT_ALL/.test(clearFn) && /DEMO4A_nonDemoReferences_\(live\)/.test(clearFn) && /CLEAR_REFUSED_TOKEN_MISMATCH/.test(clearFn) && /CLEAR_REFUSED_SEED_CHECKSUM_MISMATCH/.test(clearFn), '12. CLEAR requires exact state + token + seed checksum + no external reference');
ok(/DEMO4A_CLEAR_ORDER_\.forEach[\s\S]*?DEMO4A_deleteRowsByPk_/.test(clearFn) && /CLEARED/.test(clearFn) && /CLEAR_UNVERIFIED/.test(clearFn), '12. CLEAR deletes in reverse-FK order + verifies');
// non-demo reference scan works
var refLive = liveFromPlan(plan); refLive.shipments.rows.push({ shipment_id: 'REAL-SHIP-1', shipping_plan_id: plan.tables.shipping_plans[0].shipping_plan_id });
ok(DEMO4A_nonDemoReferences_(refLive).length >= 1, '12. a non-demo row referencing a demo id is detected (would refuse CLEAR)');
ok(DEMO4A_nonDemoReferences_(liveFromPlan(plan)).length === 0, '12. no external reference in a clean demo set');

// ============================================================ 13 — masters + production handlers untouched
section('13. write boundary');
DEMO4A_MASTER_TABS_.forEach(function (m) { ok(new RegExp("getSheetByName\\('" + m + "'\\)\\.(appendRow|deleteRow)").test(G) === false, '13. master ' + m + ' never written/deleted'); });
['handleUpsertShippingAllocationDraftAtomic', 'handleCreateShipment', 'confirmAndDispatch', 'handleReceiveShipment', 'reserveFactoryStock', 'deductFactoryStock', 'consumePurchaseOrder', 'weeklyAiPlanGenerate', 'generateDocument', 'UrlFetchApp', 'MailApp', 'GmailApp'].forEach(function (b) { ok(G.indexOf(b) === -1, '13. no banned side-effect API: ' + b); });
ok(/sh\.appendRow\(DEMO4A_rowForHeaders_\(t\.headers, r\)\)/.test(commitFn) && (G.match(/\.appendRow\(/g) || []).length === 1, '13. the ONLY appendRow is the six-table COMMIT insert loop (via live headers)');
// DEMO-ONLY marker in existing note/source fields (no new column)
ok(plan.tables.shipping_plans.every(function (r) { return r.note === 'DEMO ONLY — DO NOT PROCESS'; }) && plan.tables.shipment_events.every(function (r) { return r.source === 'DEMO-4A'; }), '13. DEMO marker in existing note/source fields');

// ============================================================ G — event semantics (canonical enum; no conflation)
section('G. event semantics');
ok(plan.tables.shipment_events.every(function (e) { return ['departed_origin', 'route_node_reached', 'received', 'partial_receipt'].indexOf(e.event_type) !== -1; }), 'G. event_type ∈ canonical production enum');
ok(plan.route_event_map.some(function (m) { return m.route_planned_event_type !== m.recorded_event_type; }), 'G. route.planned_event_type (free-text) is reported DISTINCT from the canonical recorded event_type');

done();
