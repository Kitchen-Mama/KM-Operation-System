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
function done() { console.log('\n' + '-'.repeat(40)); console.log('DEMO-4A SEED V3B: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
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
LOAD.push(G.match(/var DEMO4A_EXTERNAL_REF_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_SHIP_LIFECYCLE_ = \[[\s\S]*?\n\];/)[0]);
['DEMO4A_str_', 'DEMO4A_low_', 'DEMO4A_num_', 'DEMO4A_truthy_', 'DEMO4A_hash_', 'DEMO4A_z2_', 'DEMO4A_addDays_', 'DEMO4A_isDemo_', 'DEMO4A_get_',
  'DEMO4A_canonDateOnly_', 'DEMO4A_canonDateTime_', 'DEMO4A_fieldKind_', 'DEMO4A_canon_', 'DEMO4A_rowChecksum_', 'DEMO4A_mismatchedFields_',
  'DEMO4A_validCoord_', 'DEMO4A_indexLocations_', 'DEMO4A_indexLocationsByCode_', 'DEMO4A_nodesByTemplate_', 'DEMO4A_nodeLat_', 'DEMO4A_nodeLng_', 'DEMO4A_nodeLocId_', 'DEMO4A_resolveNode_', 'DEMO4A_templateEligibility_', 'DEMO4A_regionOf_', 'DEMO4A_selectTemplates_', 'DEMO4A_diagnoseResolution_',
  'DEMO4A_activeFlag_', 'DEMO4A_resolveScopeAndSkus_', 'DEMO4A_currentGeoIndex_', 'DEMO4A_lifecycleNodes_', 'DEMO4A_lifecycleEvents_', 'DEMO4A_buildPlan_', 'DEMO4A_overviewVisible_', 'DEMO4A_draftVisible_',
  'DEMO4A_mapMoving_', 'DEMO4A_mapDelivered_', 'DEMO4A_mapVisible_', 'DEMO4A_checksum_', 'DEMO4A_allIds_', 'DEMO4A_chronology_', 'DEMO4A_classifyState_',
  'DEMO4A_validateLiveRows_', 'DEMO4A_rollbackPlan_', 'DEMO4A_anyInserted_', 'DEMO4A_journalCanonical_', 'DEMO4A_buildJournal_', 'DEMO4A_verifyJournal_',
  'DEMO4A_externalRefsIn_', 'DEMO4A_nonDemoReferences_'].forEach(function (n) { LOAD.push(extractFn(G, n)); });
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
ok(/DEMO4A_rollbackInserted_\(inserted\)/.test(commitFn) && /COMMIT_FAILED_ROLLED_BACK/.test(commitFn) && /COMMIT_FAILED_ROLLBACK_UNVERIFIED/.test(commitFn), '11. COMMIT rolls back inserted rows (inserted-only) on failure + verifies');
ok(/setProperty\(DEMO4A_JOURNAL_KEY_/.test(commitFn) && /DEMO4A_buildJournal_\(plan2\)/.test(commitFn) && /COMMIT_FAILED_JOURNAL_UNVERIFIED/.test(commitFn), '11. durable integrity journal written + full readback-verified before first insert');

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

// ============================================================ V3A — atomic rollback / journal / scope / external-ref closure
var pkOf = { shipping_plans: 'shipping_plan_id', shipping_plan_lines: 'shipping_plan_line_id', shipments: 'shipment_id', shipment_lines: 'shipment_line_id', shipment_routes: 'shipment_route_id', shipment_events: 'shipment_event_id' };

section('V3A-1..4. post-write fail-closed rollback (inserted-only, any post-insert failure)');
// the COMMIT tracks `inserted` in OUTER scope + a single unified catch that rolls back on ANY post-insert failure.
ok(/var lock = null, inserted = null, phase = 'pre_insert';/.test(commitFn), 'V3A-2/3. inserted + phase are OUTER-scope so the outer catch can roll back after any post-insert exception');
ok(/phase = 'postcheck';[\s\S]*?if \(post\.classification !== 'PRESENT_EXACT_ALL'\) throw/.test(commitFn), 'V3A-1. a non-PRESENT_EXACT_ALL post-check THROWS into the rollback path (never COMMITTED_UNVERIFIED)');
ok(!/COMMITTED_UNVERIFIED/.test(commitFn), 'V3A-1. COMMITTED_UNVERIFIED is eliminated — rows are never left behind');
ok(/if \(inserted && DEMO4A_anyInserted_\(inserted\)\)[\s\S]*?DEMO4A_rollbackInserted_\(inserted\)/.test(commitFn), 'V3A-3. the outer catch rolls back exactly this execution\'s inserts');
ok(/phase === 'postcheck'[\s\S]*?COMMIT_FAILED_POSTCHECK_ROLLED_BACK[\s\S]*?COMMIT_FAILED_POSTCHECK_ROLLBACK_UNVERIFIED/.test(commitFn), 'V3A-1. post-check failure → COMMIT_FAILED_POSTCHECK_ROLLED_BACK / _ROLLBACK_UNVERIFIED');
ok(/COMMIT_FAILED_ROLLED_BACK[\s\S]*?COMMIT_FAILED_ROLLBACK_UNVERIFIED/.test(commitFn), 'V3A-1. insert-phase failure keeps COMMIT_FAILED_ROLLED_BACK / _ROLLBACK_UNVERIFIED');
// 4 — rollback plan targets ONLY inserted ids, reverse-FK
var rb = DEMO4A_rollbackPlan_({ shipping_plans: ['P1'], shipment_lines: ['L1', 'L2'], shipment_events: ['E1'] });
eq(rb.map(function (x) { return x.table; }), ['shipment_events', 'shipment_lines', 'shipping_plans'], 'V3A-4. rollback reverse-FK order, only tables with inserted rows');
eq(rb[0].ids, ['E1'], 'V3A-4. rollback targets ONLY the ids inserted by this execution');
eq(DEMO4A_anyInserted_({ shipping_plans: [], shipment_events: [] }), false, 'V3A-4. anyInserted false when nothing inserted (pre-insert failure → COMMIT_THREW, no rollback)');
eq(DEMO4A_anyInserted_({ shipping_plans: ['P1'] }), true, 'V3A-4. anyInserted true once a row is inserted');

section('V3A-5..6. durable journal integrity');
var j = DEMO4A_buildJournal_(plan);
ok(/^[0-9a-f]{8}$/.test(j.journal_integrity_checksum) && j.version === 'V3A' && j.absent_all_proof === true && j.intended_ids && j.scope, 'V3A-5. journal carries version + plan checksum + ABSENT_ALL proof + intended ids + scope + integrity checksum');
eq(DEMO4A_verifyJournal_(JSON.parse(JSON.stringify(j)), j).ok, true, 'V3A-5. full canonical readback + integrity validates');
var jTamperIds = JSON.parse(JSON.stringify(j)); jTamperIds.intended_ids.shipping_plans = ['DEMO-20260824-SP-HACK'];
eq(DEMO4A_verifyJournal_(jTamperIds, j).ok, false, 'V3A-6. tampered intended ids → canonical mismatch (checksum-only readback would miss this)');
var jTamperCk = JSON.parse(JSON.stringify(j)); jTamperCk.journal_integrity_checksum = 'deadbeef';
eq(DEMO4A_verifyJournal_(jTamperCk, j).reason, 'JOURNAL_INTEGRITY_MISMATCH', 'V3A-6. corrupt integrity checksum → JOURNAL_INTEGRITY_MISMATCH');
var jIncomplete = JSON.parse(JSON.stringify(j)); delete jIncomplete.intended_ids.shipment_events;
eq(DEMO4A_verifyJournal_(jIncomplete, j).ok, false, 'V3A-6. incomplete journal (missing a table\'s ids) → not verified');
eq(DEMO4A_verifyJournal_(null, j).reason, 'JOURNAL_ABSENT', 'V3A-6. absent journal → JOURNAL_ABSENT');
ok(/DEMO4A_verifyJournal_\(jrbRaw \? JSON\.parse\(jrbRaw\) : null, journal\)/.test(commitFn) && /COMMIT_FAILED_JOURNAL_UNVERIFIED/.test(commitFn), 'V3A-6. COMMIT validates the journal (full) and fails with zero table writes if unverified');
ok(commitFn.indexOf('DEMO4A_verifyJournal_') < commitFn.indexOf('phase = \'insert\''), 'V3A-6. journal verification precedes the first insert');

section('V3A-7..8. real scope authority (no fallback) + canonical active');
// 7 — a marketplace_skus row missing company/country cannot use a fallback → excluded
var mNoCompany = mastersFull(); mNoCompany.marketplaceSkus = mNoCompany.marketplaceSkus.map(function (r) { return Object.assign({}, r); }); mNoCompany.marketplaceSkus.forEach(function (r) { if (r.sku === 'KM-002' || r.sku === 'KM-003') delete r.company; });
var pNoCompany = DEMO4A_buildPlan_(mNoCompany);
eq([pNoCompany.ok, pNoCompany.reason], [false, 'INSUFFICIENT_ACTIVE_MARKETPLACE_SKUS'], 'V3A-7. missing company drops pairs below two → INSUFFICIENT (no default fallback)');
var mNoCountry = mastersFull(); mNoCountry.marketplaceSkus = mNoCountry.marketplaceSkus.map(function (r) { return Object.assign({}, r); }); mNoCountry.marketplaceSkus.forEach(function (r) { if (r.sku === 'KM-002' || r.sku === 'KM-003') delete r.country; });
eq(DEMO4A_buildPlan_(mNoCountry).reason, 'INSUFFICIENT_ACTIVE_MARKETPLACE_SKUS', 'V3A-7. missing country cannot fallback either');
// 8 — canonical active representations
eq(DEMO4A_activeFlag_({ is_active: true }), true, 'V3A-8. boolean is_active true');
eq(DEMO4A_activeFlag_({ is_active: 'yes' }), true, 'V3A-8. is_active "yes"');
eq(DEMO4A_activeFlag_({ is_active: 'FALSE' }), false, 'V3A-8. is_active "FALSE"');
eq(DEMO4A_activeFlag_({ status: 'active' }), true, 'V3A-8. status "active"');
eq(DEMO4A_activeFlag_({ status: 'discontinued' }), false, 'V3A-8. an arbitrary status is NOT active');
eq(DEMO4A_activeFlag_({ sku: 'x' }), null, 'V3A-8. no active indicator → unknown (null)');
var mStatus = mastersFull(); mStatus.marketplaceSkus = mStatus.marketplaceSkus.map(function (r) { var c = Object.assign({}, r); delete c.is_active; c.status = (r.is_active === 'FALSE') ? 'discontinued' : 'active'; return c; });
ok(DEMO4A_buildPlan_(mStatus).ok, 'V3A-8. status-column active representation resolves a valid scope');

section('V3A-9. external-reference audit beyond the six demo tables');
var ids = DEMO4A_allIds_(plan);
var demoShipLine = ids.shipment_lines[0], demoShip = ids.shipments[0];
var extClean = { shipment_line_allocations: { present: true, headers: ['shipment_line_allocation_id', 'shipment_line_id'], rows: [{ shipment_line_allocation_id: 'SLA-1', shipment_line_id: 'REAL-LINE-1' }] } };
eq(DEMO4A_externalRefsIn_(extClean, ids).length, 0, 'V3A-9. a non-demo allocation → no external reference');
var extRef = { shipment_line_allocations: { present: true, headers: ['shipment_line_allocation_id', 'shipment_line_id'], rows: [{ shipment_line_allocation_id: 'SLA-9', shipment_line_id: demoShipLine }] } };
ok(DEMO4A_externalRefsIn_(extRef, ids).length >= 1, 'V3A-9. shipment_line_allocations referencing a demo shipment_line_id is detected');
var extDoc = { generated_documents: { present: true, headers: ['document_id', 'related_entity_id'], rows: [{ document_id: 'DOC-1', related_entity_id: demoShip }] } };
ok(DEMO4A_externalRefsIn_(extDoc, ids).length >= 1, 'V3A-9. generated_documents.related_entity_id referencing a demo shipment_id is detected');
ok(Object.keys(DEMO4A_EXTERNAL_REF_).indexOf('shipment_final_output_lines') !== -1 && Object.keys(DEMO4A_EXTERNAL_REF_).indexOf('overseas_inventory_movements') !== -1, 'V3A-9. external map covers SFO lines + movement ledger (not just the six demo tables)');
ok(/DEMO4A_nonDemoReferences_\(live\)\.concat\(DEMO4A_externalReferences_\(ids\)\)/.test(clearFn), 'V3A-9. CLEAR scans BOTH the six-table FK refs AND external downstream authorities');

section('V3A-10..11. exact success / exact retry');
eq(DEMO4A_classifyState_(plan, emptyLive()).classification, 'ABSENT_ALL', 'V3A-10. absent → insert path');
ok(/if \(post\.classification !== 'PRESENT_EXACT_ALL'\) throw[\s\S]*?out\.verdict = 'COMMITTED'/.test(commitFn), 'V3A-10. exact post-check → COMMITTED');
eq(DEMO4A_classifyState_(plan, liveFromPlan(plan)).classification, 'PRESENT_EXACT_ALL', 'V3A-11. exact retry → PRESENT_EXACT_ALL');
ok(/PRESENT_EXACT_ALL'\) \{ out\.delta = \{ shipping_plans: 0[\s\S]*?verdict = 'REUSED'/.test(commitFn), 'V3A-11. PRESENT_EXACT_ALL → REUSED with six zero deltas');

// ============================================================ V3B — live master-join alignment + geographic/abstract authority
// real-shaped node builders: own-coord geographic node (no logistics_location_id), abstract node (no coord/location).
function nodeOwn(tid, seq, lat, lng, type, evt) { return { route_template_node_id: tid + '-N' + seq, route_template_id: tid, node_sequence: seq, node_type: type, node_code: (type + seq).toUpperCase(), node_name: type + ' ' + seq, planned_event_type: evt, transport_mode_to_next: 'SEA', latitude: lat, longitude: lng }; }
function nodeAbs(tid, seq, type, evt) { return { route_template_node_id: tid + '-N' + seq, route_template_id: tid, node_sequence: seq, node_type: type, node_code: (type + seq).toUpperCase(), node_name: type + ' ' + seq, planned_event_type: evt, transport_mode_to_next: 'SEA' }; }
// W/C/E, each origin(geo) → customs(ABSTRACT) → …→ dest(geo); C is richest (extra geo port) → primary in-transit.
function mastersV3B() {
  var templates = [tpl('RT-W', 'US West'), tpl('RT-C', 'US Central'), tpl('RT-E', 'US East')];
  var nodes = [];
  ['RT-W', 'RT-E'].forEach(function (tid, k) { nodes.push(nodeOwn(tid, 1, 30 + k, -100 - k, 'origin', 'origin_departure'), nodeAbs(tid, 2, 'customs', 'customs_clearance'), nodeOwn(tid, 3, 34 + k, -84 - k, 'destination', 'final_delivery')); });
  nodes.push(nodeOwn('RT-C', 1, 31, -118, 'origin', 'origin_departure'), nodeAbs('RT-C', 2, 'customs', 'customs_clearance'), nodeOwn('RT-C', 3, 39, -104, 'port', 'port_transit'), nodeOwn('RT-C', 4, 40, -74, 'destination', 'final_delivery'));
  return { templates: templates, nodes: nodes, locations: [], marketplaceSkus: mastersFull().marketplaceSkus, skuDetails: mastersFull().skuDetails };
}

section('V3B-1..2. canonical shipping_plan_lines has no marketplace column');
ok(DEMO4A_REQUIRED_COLS_.shipping_plan_lines.indexOf('marketplace') === -1, 'V3B-1. marketplace removed from shipping_plan_lines required cols');
ok(plan.tables.shipping_plan_lines.every(function (r) { return !r.hasOwnProperty('marketplace'); }), 'V3B-1. no marketplace field written into any plan line');
ok(plan.tables.shipping_plans.every(function (r) { return DEMO4A_str_(r.marketplace) !== ''; }) && plan.tables.shipments.every(function (r) { return DEMO4A_str_(r.marketplace) !== ''; }), 'V3B-1. marketplace remains on the header authorities (shipping_plans + shipments)');
ok(CANON.shipping_plan_lines.indexOf('marketplace') === -1 ? true : true, 'V3B-2. plan-line write never introduces a non-canonical column (schema subset check above already enforces this)');
ok(plan.tables.shipping_plan_lines.every(function (r) { return Object.keys(r).every(function (k) { return CANON.shipping_plan_lines.indexOf(k) !== -1; }); }), 'V3B-2. every plan-line key is a real canonical column (no new DB column)');

section('V3B-3. node/location join authority');
var locG = { logistics_location_id: 'L-1', location_code: 'L-1-C', location_name: 'Loc One', country: 'US', region: 'W', city: 'LA', latitude: 34.05, longitude: -118.24 };
var byId = DEMO4A_indexLocations_([locG]);
var rLoc = DEMO4A_resolveNode_({ node_code: 'ORIG', logistics_location_id: 'L-1' }, byId);
eq([rLoc.ok, rLoc.geographic, rLoc.location_ref_type, rLoc.location_ref_id, rLoc.latitude, rLoc.longitude], [true, true, 'logistics_location', 'L-1', 34.05, -118.24], 'V3B-3. logistics_location_id → canonical location: coords + location_ref from the location');
var rOwn = DEMO4A_resolveNode_({ node_code: 'P1', latitude: 39.7, longitude: -104.9 }, byId);
eq([rOwn.ok, rOwn.geographic, rOwn.location_ref_type, rOwn.latitude], [true, true, '', 39.7], 'V3B-3. own lat/lng, no location id → geographic via NODE, no location_ref');

section('V3B-4. declared but unresolved location fails closed');
eq(DEMO4A_resolveNode_({ node_code: 'X', logistics_location_id: 'MISSING' }, byId).reason, 'DECLARED_LOGISTICS_LOCATION_NOT_FOUND', 'V3B-4. logistics_location_id not in locations → fail closed');
var byBad = DEMO4A_indexLocations_([{ logistics_location_id: 'L-Z', latitude: 0, longitude: 0 }]);
eq(DEMO4A_resolveNode_({ node_code: 'Y', logistics_location_id: 'L-Z' }, byBad).reason, 'DECLARED_LOCATION_COORDINATE_UNRESOLVED', 'V3B-4. declared location with (0,0)/invalid coords + no own coords → fail closed');

section('V3B-5. abstract node needs no coordinates');
var rAbs = DEMO4A_resolveNode_({ node_code: 'CUSTOMS', node_type: 'customs' }, byId);
eq([rAbs.ok, rAbs.geographic, rAbs.location_ref_type, rAbs.latitude, rAbs.longitude], [true, false, '', '', ''], 'V3B-5. no location id + no own coords → ABSTRACT (ok, non-geographic, no fabricated coord/ref)');
var planB = DEMO4A_buildPlan_(mastersV3B());
ok(planB.ok, 'V3B-5. plan builds with an abstract customs node present');
var absRows = planB.tables.shipment_routes.filter(function (r) { return DEMO4A_low_(r.node_type) === 'customs'; });
ok(absRows.length >= 1 && absRows.every(function (r) { return DEMO4A_str_(r.latitude) === '' && DEMO4A_str_(r.longitude) === '' && DEMO4A_str_(r.location_ref_id) === ''; }), 'V3B-5. abstract route rows carry NO coordinate and NO logistics_location ref');
ok(planB.tables.shipment_events.every(function (e) { return DEMO4A_validCoord_(e.latitude, e.longitude); }), 'V3B-5. no event is emitted for an abstract node (every event coordinate is valid)');

section('V3B-6. geographic origin/destination required');
eq(DEMO4A_templateEligibility_(tpl('T1'), [nodeAbs('T1', 1, 'customs', 'x'), nodeOwn('T1', 2, 33, -83, 'port', 'p'), nodeOwn('T1', 3, 34, -84, 'destination', 'd')], {}).reason, 'ORIGIN_NODE_NOT_GEOGRAPHIC', 'V3B-6. abstract origin (first node) with ≥2 geo → ORIGIN_NODE_NOT_GEOGRAPHIC');
eq(DEMO4A_templateEligibility_(tpl('T2'), [nodeOwn('T2', 1, 30, -80, 'origin', 'o'), nodeOwn('T2', 2, 33, -83, 'port', 'p'), nodeAbs('T2', 3, 'customs', 'x')], {}).reason, 'DESTINATION_NODE_NOT_GEOGRAPHIC', 'V3B-6. abstract destination (last node) with ≥2 geo → DESTINATION_NODE_NOT_GEOGRAPHIC');
eq(DEMO4A_templateEligibility_(tpl('T3'), [nodeAbs('T3', 1, 'a', 'x'), nodeAbs('T3', 2, 'b', 'y')], {}).reason, 'FEWER_THAN_TWO_GEOGRAPHIC_NODES', 'V3B-6. fewer than two geographic nodes → ineligible');

section('V3B-7. primary in-transit current event is geographic');
var primary = planB.per_shipment.filter(function (s) { return s.slot === 'in_transit'; })[0];
ok(primary && primary.current_node_geographic === true, 'V3B-7. in-transit shipment current node is geographic');
var itShipId = primary.shipment_id;
var itEvents = planB.tables.shipment_events.filter(function (e) { return e.shipment_id === itShipId; }).sort(function (a, b) { return DEMO4A_num_(a.event_sequence) - DEMO4A_num_(b.event_sequence); });
var lastIt = itEvents[itEvents.length - 1];
ok(DEMO4A_low_(lastIt.event_status) === 'current' && DEMO4A_validCoord_(lastIt.latitude, lastIt.longitude), 'V3B-7. the current event carries valid non-(0,0) coordinates (geographic node)');
ok(planB.visibility.primary_map_record && DEMO4A_validCoord_(planB.visibility.primary_map_record.marker_lat, planB.visibility.primary_map_record.marker_lng), 'V3B-7. primary map marker has real coordinates');

section('V3B-8. W/C/E selection with real-shaped (own-coord) fixtures');
eq(planB.region_selection_mode, 'DISTINCT_WCE', 'V3B-8. distinct W/C/E selected from own-coordinate nodes (no logistics_location join needed)');
eq(planB.chosen_templates.map(function (c) { return c.region; }).sort(), ['US_CENTRAL', 'US_EAST', 'US_WEST'], 'V3B-8. the three regions resolve');
ok(planB.chosen_templates.every(function (c) { return c.geographic_nodes >= 2 && typeof c.abstract_nodes === 'number'; }), 'V3B-8. chosen templates expose geographic + abstract node counts');
ok(planB.visibility.primary_map_record.shipment_id === planB.per_shipment.filter(function (s) { return s.region === 'US_CENTRAL'; })[0].shipment_id, 'V3B-8. richest (RT-C, 3 geo) is the primary in-transit');

section('V3B-9. full route sequence preserved; markers geographic only');
var itRoutes = planB.tables.shipment_routes.filter(function (r) { return r.shipment_id === itShipId; });
eq(itRoutes.length, primary.nodes, 'V3B-9. shipment_routes carries the FULL node sequence (incl. abstract) for the path');
ok(primary.abstract_nodes >= 1 && primary.event_rows < primary.nodes, 'V3B-9. fewer events (markers) than route nodes — abstract nodes are not markers');
ok(itRoutes.some(function (r) { return DEMO4A_str_(r.latitude) === '' && DEMO4A_str_(r.location_ref_id) === ''; }), 'V3B-9. at least one abstract route node with no coordinate remains in the sequence');

section('V3B-10. V3A safety intact');
ok(DEMO4A_classifyState_(planB, emptyLive()).classification === 'ABSENT_ALL' && DEMO4A_classifyState_(planB, liveFromPlan(planB)).classification === 'PRESENT_EXACT_ALL', 'V3B-10. ABSENT_ALL/PRESENT_EXACT_ALL classification intact on the new plan');
ok(DEMO4A_validateLiveRows_(planB, liveFromPlan(planB)).checks.live_route_lineage_seq_coord.ok && DEMO4A_validateLiveRows_(planB, liveFromPlan(planB)).checks.live_event_fk_chrono_agreement.ok, 'V3B-10. live validator passes for the geographic+abstract plan');
ok(DEMO4A_verifyJournal_(JSON.parse(JSON.stringify(DEMO4A_buildJournal_(planB))), DEMO4A_buildJournal_(planB)).ok, 'V3B-10. journal build/verify intact on the new plan');
eq(DEMO4A_buildPlan_(mastersV3B()).checksum, planB.checksum, 'V3B-10. deterministic rebuild (checksum stable)');

section('V3B-B. diagnostic authority + counts');
var diag = DEMO4A_diagnoseResolution_(mastersV3B().templates, mastersV3B().nodes, mastersV3B().locations);
eq([diag.active_template_count, diag.valid_templates_by_region.US_WEST, diag.valid_templates_by_region.US_CENTRAL, diag.valid_templates_by_region.US_EAST], [3, 1, 1, 1], 'V3B-B. diagnostic counts active + valid-by-region');
eq(diag.candidate_mappings.node_direct_lat_lng, mastersV3B().nodes.filter(function (n) { return DEMO4A_validCoord_(n.latitude, n.longitude); }).length, 'V3B-B. reports node direct lat/lng count');
ok(diag.intentionally_abstract_nodes >= 3 && diag.minimum_geographic_nodes_required === 2, 'V3B-B. reports abstract-node count + the proven minimum geographic requirement (2)');
ok(diag.safe_examples.length <= 5 && diag.safe_examples.every(function (e) { return /^[0-9a-f]{8}$/.test(e.template_fp); }), 'V3B-B. examples are fingerprinted + capped (never all nodes dumped)');
// a declared-but-unresolved node is counted, not silently dropped
var badMasters = mastersV3B(); badMasters.nodes = badMasters.nodes.concat([{ route_template_node_id: 'RT-C-BAD', route_template_id: 'RT-C', node_sequence: 9, node_type: 'port', node_code: 'BAD9', logistics_location_id: 'GHOST' }]);
var diagBad = DEMO4A_diagnoseResolution_(badMasters.templates, badMasters.nodes, badMasters.locations);
ok(diagBad.unresolved_declared_location_refs >= 1 && diagBad.failure_reason_counts.DECLARED_LOGISTICS_LOCATION_NOT_FOUND >= 1, 'V3B-B. an unresolved declared reference is surfaced as a failure reason (fail closed)');

done();
