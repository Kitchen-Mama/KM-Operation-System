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
function done() { console.log('\n' + '-'.repeat(40)); console.log('DEMO-4A SEED V3C: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
function arrTokens(literal) { var body = literal.replace(/\[([\s\S]*)\]/, '$1').replace(/\/\/[^\n]*/g, ''); var out = [], re = /'([^']+)'/g, x; while ((x = re.exec(body))) out.push(x[1]); return out; }

var G = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_demo_shipping_shipment_map_seed_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var G11 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '11_shipping_plan_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G12 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '12_shipment_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G22 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '22_shipment_dispatch_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G31 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '31_shipment_receipt_route_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');

var LOAD = [];
['DEMO4A_PREFIX_', 'DEMO4A_TAG_', 'DEMO4A_SOURCE_', 'DEMO4A_ACTOR_', 'DEMO4A_CREATED_AT_', 'DEMO4A_DEFAULT_COMPANY_', 'DEMO4A_CONFIRMED_SEED_CHECKSUM_', 'DEMO4A_CONFIRMED_CLEAR_TOKEN_', 'DEMO4A_JOURNAL_KEY_', 'DEMO4A_WRITE_ORDER_', 'DEMO4A_CLEAR_ORDER_', 'DEMO4A_PK_OF_', 'DEMO4A_FK_INTO_DEMO_', 'DEMO4A_MASTER_TABS_', 'DEMO4A_LOC_ID_FIELDS_',
  'DEMO4A_RECORD_STATUS_DEAD_', 'DEMO4A_VS_COORDINATE_PENDING_', 'DEMO4A_POSTAL_REQUIRED_', 'DEMO4A_DEST_COORD_AUTHORITY_', 'DEMO4A_COORD_ACCURACY_FACILITY_'].forEach(function (n) { LOAD.push(G.match(new RegExp('var ' + n + ' = [^\\n]*;'))[0]); });
LOAD.push(G.match(/var DEMO4A_MAP_DEST_COORD_CONSUMPTION_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_REQUIRED_COLS_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_EXTERNAL_REF_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_SHIP_LIFECYCLE_ = \[[\s\S]*?\n\];/)[0]);
LOAD.push(G.match(/var DEMO4A_LOC_TYPE_CANON_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_LOC_TYPE_ENUM_ = \{[\s\S]*?\};/)[0]);
LOAD.push(G.match(/var DEMO4A_WH_DEST_TYPES_ = \{[\s\S]*?\};/)[0]);
['DEMO4A_str_', 'DEMO4A_low_', 'DEMO4A_num_', 'DEMO4A_truthy_', 'DEMO4A_hash_', 'DEMO4A_z2_', 'DEMO4A_addDays_', 'DEMO4A_isDemo_', 'DEMO4A_get_',
  'DEMO4A_canonDateOnly_', 'DEMO4A_canonDateTime_', 'DEMO4A_fieldKind_', 'DEMO4A_canon_', 'DEMO4A_rowChecksum_', 'DEMO4A_mismatchedFields_',
  'DEMO4A_validCoord_', 'DEMO4A_indexLocations_', 'DEMO4A_indexLocationsByCode_', 'DEMO4A_nodesByTemplate_', 'DEMO4A_nodeLat_', 'DEMO4A_nodeLng_', 'DEMO4A_nodeLocId_',
  'DEMO4A_locValid_', 'DEMO4A_locId_', 'DEMO4A_locType_', 'DEMO4A_locCountry_', 'DEMO4A_locRegion_', 'DEMO4A_locActive_', 'DEMO4A_indexLocationsByIdentifiers_', 'DEMO4A_nodeCanonicalMatch_', 'DEMO4A_nodeGeoBinding_',
  'DEMO4A_transportClass_', 'DEMO4A_canonLocType_', 'DEMO4A_roleCompatibleTypes_', 'DEMO4A_typeRoleCompat_', 'DEMO4A_nodeRoleCompat_', 'DEMO4A_corridorCountries_', 'DEMO4A_chooseCurrentIndex_',
  'DEMO4A_pickAnchor_', 'DEMO4A_bindingFromLoc_', 'DEMO4A_coordKey_', 'DEMO4A_bindTemplateRoles_', 'DEMO4A_templateEligibility_', 'DEMO4A_regionOf_', 'DEMO4A_selectTemplates_', 'DEMO4A_diagnoseResolution_', 'DEMO4A_bindingGates_',
  'DEMO4A_activeFlag_', 'DEMO4A_resolveScopeAndSkus_', 'DEMO4A_rowBindingAt_', 'DEMO4A_slotCurrentIndex_', 'DEMO4A_lifecycleNodes_', 'DEMO4A_lifecycleEvents_', 'DEMO4A_buildPlan_', 'DEMO4A_overviewVisible_', 'DEMO4A_draftVisible_',
  'DEMO4A_mapMoving_', 'DEMO4A_mapDelivered_', 'DEMO4A_mapVisible_', 'DEMO4A_checksum_', 'DEMO4A_allIds_', 'DEMO4A_chronology_', 'DEMO4A_classifyState_',
  'DEMO4A_validateLiveRows_', 'DEMO4A_rollbackPlan_', 'DEMO4A_anyInserted_', 'DEMO4A_journalCanonical_', 'DEMO4A_buildJournal_', 'DEMO4A_verifyJournal_',
  'DEMO4A_externalRefsIn_', 'DEMO4A_nonDemoReferences_',
  'DEMO4A_dxCoordKey_', 'DEMO4A_dxRawRegion_', 'DEMO4A_dxSubdivision_', 'DEMO4A_dxCompatibleRoles_', 'DEMO4A_dxRoleStages_', 'DEMO4A_diagnoseLiveRoleCandidates_',
  'DEMO4A_whId_', 'DEMO4A_whType_', 'DEMO4A_whCompany_', 'DEMO4A_whCountry_', 'DEMO4A_whRegion_', 'DEMO4A_whMarketplace_', 'DEMO4A_whActive_', 'DEMO4A_whDestTypeCompatible_',
  'DEMO4A_locVerificationEligible_', 'DEMO4A_locsForWarehouse_', 'DEMO4A_resolveWarehouseDestination_', 'DEMO4A_dxRegionBucket_', 'DEMO4A_diagnoseWarehouseLocationAuthority_', 'DEMO4A_warehouseGates_',
  'DEMO4A_whCode_', 'DEMO4A_whAddrLine1_', 'DEMO4A_whAddrLine2_', 'DEMO4A_whCity_', 'DEMO4A_whStateSub_', 'DEMO4A_whPostal_', 'DEMO4A_postalRequired_', 'DEMO4A_normAddrPart_', 'DEMO4A_normalizeWhAddress_', 'DEMO4A_addressAuthority_', 'DEMO4A_deriveDestCoordinate_', 'DEMO4A_pickWarehouseForRegion_'].forEach(function (n) { LOAD.push(extractFn(G, n)); });
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

// ============================================================ V3C — DEMO-only role-based logistics-location binding
// Templates provide the TIMELINE; logistics_locations is the COORDINATE authority. Coordinate binding precedence per
// node: CANONICAL_MASTER_BINDING (exact identifier match) → NODE_DIRECT_COORDINATE → (role anchors) DEMO_SYNTHETIC_RUNTIME_BINDING.
function tplV3C(id, region) { return { route_template_id: id, route_template_name: 'CN to ' + region, is_active: 'TRUE', origin_country: 'CN', destination_country: 'US', destination_region: region, origin_warehouse_id: 'WH-CN-' + id, destination_warehouse_id: 'WH-US-' + id, carrier_id: 'CAR-1', transit_type: 'SEA', last_mile_delivery: 'FBA' }; }
function nAbs(tid, seq, type, evt) { return { route_template_node_id: tid + '-N' + seq, route_template_id: tid, node_sequence: seq, node_type: type, node_code: (type + seq).toUpperCase(), node_name: type + ' ' + seq, planned_event_type: evt, transport_mode_to_next: 'SEA' }; }
function locV3C(id, country, region, lat, lng, type) { return { logistics_location_id: id, location_code: id + '-C', location_name: id, country: country, region: region, latitude: lat, longitude: lng, location_type: type, is_active: 'TRUE' }; }
function locsV3C() {
  return [
    locV3C('CN-FAC-1', 'CN', '', 31.2, 121.4, 'factory'), locV3C('CN-FAC-2', 'CN', '', 22.5, 114.0, 'factory'),
    locV3C('US-W-1', 'US', 'US West', 34.0, -118.2, 'warehouse'), locV3C('US-C-1', 'US', 'US Central', 41.8, -87.6, 'warehouse'), locV3C('US-E-1', 'US', 'US East', 40.7, -74.0, 'warehouse'),
    locV3C('TR-1', 'US', 'US West', 37.7, -122.4, 'port'), locV3C('TR-2', 'US', 'US Central', 29.7, -95.3, 'port')
  ];
}
function mastersV3C() {
  var templates = [tplV3C('RT-W', 'US West'), tplV3C('RT-C', 'US Central'), tplV3C('RT-E', 'US East')];
  var nodes = [];
  ['RT-W', 'RT-E'].forEach(function (tid) { nodes.push(nAbs(tid, 1, 'origin', 'origin_departure'), nAbs(tid, 2, 'customs', 'customs_clearance'), nAbs(tid, 3, 'port', 'port_transit'), nAbs(tid, 4, 'destination', 'final_delivery')); });
  nodes.push(nAbs('RT-C', 1, 'origin', 'origin_departure'), nAbs('RT-C', 2, 'customs', 'customs_clearance'), nAbs('RT-C', 3, 'port', 'port_transit'), nAbs('RT-C', 4, 'hub', 'hub_transit'), nAbs('RT-C', 5, 'destination', 'final_delivery'));   // richest → primary in-transit
  return { templates: templates, nodes: nodes, locations: locsV3C(), marketplaceSkus: mastersFull().marketplaceSkus, skuDetails: mastersFull().skuDetails };
}
var planC = DEMO4A_buildPlan_(mastersV3C());
ok(planC.ok, 'V3C setup. plan builds from abstract-node templates via Demo role bindings');

section('V3C-1..2. no master modification, no coordinate manufactured');
DEMO4A_MASTER_TABS_.forEach(function (m) { ok(new RegExp("getSheetByName\\('" + m + "'\\)\\.(appendRow|deleteRow|setValue|getRange\\([^)]*\\)\\.setValue)").test(G) === false, 'V3C-1. master ' + m + ' never written/deleted'); });
(function () { var pool = {}; locsV3C().forEach(function (l) { pool[DEMO4A_num_(l.latitude).toFixed(5) + ',' + DEMO4A_num_(l.longitude).toFixed(5)] = 1; });
  var ok2 = planC.tables.shipment_routes.concat(planC.tables.shipment_events).every(function (r) { if (DEMO4A_str_(r.latitude) === '' && DEMO4A_str_(r.longitude) === '') return true; return pool[DEMO4A_num_(r.latitude).toFixed(5) + ',' + DEMO4A_num_(r.longitude).toFixed(5)] === 1; });
  ok(ok2, 'V3C-2. every non-blank coordinate equals an existing logistics_locations coordinate (none manufactured)'); })();

section('V3C-3..4. canonical identifier binding wins; no fuzzy matching');
var idIdx = DEMO4A_indexLocationsByIdentifiers_([locV3C('L-UN', 'US', 'US West', 34.0, -118.0, 'port')].map(function (l) { l.un_locode = 'USLAX'; return l; }));
eq(DEMO4A_nodeCanonicalMatch_({ node_code: 'USLAX' }, idIdx).loc_field, 'un_locode', 'V3C-3. node_code exactly equal to a location un_locode → canonical match');
var gb = DEMO4A_nodeGeoBinding_({ node_code: 'USLAX' }, idIdx);
eq([gb.bound, gb.binding_type, gb.latitude], [true, 'CANONICAL_MASTER_BINDING', 34.0], 'V3C-3. canonical binding used (exact identifier), coords from the matched location');
eq(DEMO4A_nodeCanonicalMatch_({ node_code: 'Los Angeles', node_name: 'Los Angeles Port' }, idIdx), null, 'V3C-4. a display-name / non-exact token does NOT match (no fuzzy/substring/name matching)');
eq(DEMO4A_nodeGeoBinding_({ node_code: 'CUSTOMS-XYZ' }, idIdx).bound, false, 'V3C-4. an unmatched abstract node is NOT force-bound');

section('V3C-5..8. Demo fallback uses existing active locations; exact filters; deterministic; distinct roles');
var locs = locsV3C();
var origin = DEMO4A_pickAnchor_(locs, { country: 'CN', role: 'origin', tclass: 'sea' });
ok(origin && DEMO4A_locId_(origin.loc) === 'CN-FAC-1', 'V3C-5/7. origin fallback = deterministic active CN factory (CN-FAC-1)');
eq(DEMO4A_pickAnchor_(locs, { country: 'ZZ', role: 'origin', tclass: 'sea' }), null, 'V3C-6. exact country filter: no ZZ location → null (never a wrong-country coordinate)');
var wDest = DEMO4A_pickAnchor_(locs, { country: 'US', region: 'US East', role: 'destination', tclass: 'sea' });
ok(wDest && DEMO4A_locId_(wDest.loc) === 'US-E-1' && wDest.region_exact === true, 'V3C-6. exact region match preferred (US East → US-E-1)');
eq(DEMO4A_pickAnchor_(locsV3C(), { country: 'CN', role: 'origin', tclass: 'sea' }).loc.logistics_location_id, DEMO4A_pickAnchor_(locsV3C(), { country: 'CN', role: 'origin', tclass: 'sea' }).loc.logistics_location_id, 'V3C-7. deterministic (same inputs → same pick)');
var itC = planC.per_shipment.filter(function (s) { return s.slot === 'in_transit'; })[0];
ok(itC.origin_location_id && itC.current_location_id && itC.destination_location_id, 'V3C-8. primary in-transit has origin + current + destination location ids');
ok(itC.origin_location_id !== itC.current_location_id && itC.current_location_id !== itC.destination_location_id && itC.origin_location_id !== itC.destination_location_id, 'V3C-8. the three primary anchors are distinct');

section('V3C-9..11. abstract timeline preserved; abstract rows blank; bound rows carry Demo evidence');
var itShipC = itC.shipment_id;
var itRoutesC = planC.tables.shipment_routes.filter(function (r) { return r.shipment_id === itShipC; });
eq(itRoutesC.length, itC.nodes, 'V3C-9. full ordered template-node sequence preserved as route rows');
var absC = itRoutesC.filter(function (r) { return DEMO4A_str_(r.location_ref_id) === '' && DEMO4A_str_(r.latitude) === ''; });
ok(absC.length >= 1, 'V3C-9/10. abstract nodes remain as coordinate-blank timeline rows');
ok(absC.every(function (r) { return DEMO4A_str_(r.node_code) !== '' && DEMO4A_str_(r.route_template_node_id) !== ''; }), 'V3C-10. abstract rows keep node code + template node id (timeline lineage) but no coordinate');
var synthEv = planC.tables.shipment_events.filter(function (e) { return /DEMO-4A-SYNTHETIC-RUNTIME-BINDING/.test(DEMO4A_str_(e.note)); });
ok(synthEv.length >= 1, 'V3C-11. synthetic-bound events carry explicit DEMO-4A-SYNTHETIC-RUNTIME-BINDING evidence');
ok(planC.binding_manifest.some(function (m) { return /DEMO_SYNTHETIC_RUNTIME_BINDING/.test(m); }), 'V3C-11. binding manifest records the synthetic binding type');

section('V3C-12..15. events geographic + chronology + status; coords equal master');
var evC = planC.tables.shipment_events.filter(function (e) { return e.shipment_id === itShipC; }).sort(function (a, b) { return DEMO4A_num_(a.event_sequence) - DEMO4A_num_(b.event_sequence); });
var lastC = evC[evC.length - 1];
ok(DEMO4A_low_(lastC.event_status) === 'current' && DEMO4A_validCoord_(lastC.latitude, lastC.longitude), 'V3C-12. current event is geographic (valid coord) with status current');
var curRow = itRoutesC.filter(function (r) { return DEMO4A_low_(r.status) === 'current'; })[0];
eq([DEMO4A_num_(lastC.latitude), DEMO4A_num_(lastC.longitude)], [DEMO4A_num_(curRow.latitude), DEMO4A_num_(curRow.longitude)], 'V3C-12. current event references the current geographic route row');
var plannedRows = {}; itRoutesC.forEach(function (r) { if (DEMO4A_low_(r.status) === 'planned') plannedRows[r.shipment_route_id] = 1; });
ok(evC.every(function (e) { return !plannedRows[e.shipment_route_id]; }), 'V3C-13. no event on a future planned route row');
var recvShip = planC.per_shipment.filter(function (s) { return s.status === 'received'; })[0];
var recvEv = planC.tables.shipment_events.filter(function (e) { return e.shipment_id === recvShip.shipment_id; }).sort(function (a, b) { return DEMO4A_num_(a.event_sequence) - DEMO4A_num_(b.event_sequence); });
eq(DEMO4A_low_(recvEv[recvEv.length - 1].event_type), 'received', 'V3C-14. received shipment latest event is received');
(function () { var byId = DEMO4A_indexLocations_(locsV3C());
  ok(planC.tables.shipment_events.every(function (e) { if (DEMO4A_str_(e.latitude) === '') return true; var route = planC.tables.shipment_routes.filter(function (r) { return r.shipment_route_id === e.shipment_route_id; })[0]; var loc = route && route.location_ref_id ? byId[route.location_ref_id] : null; return !loc || (DEMO4A_num_(loc.latitude).toFixed(5) === DEMO4A_num_(e.latitude).toFixed(5)); }), 'V3C-15. every bound event coordinate equals the master logistics_locations coordinate'); })();

section('V3C-16. checksum binds bindings/locations/coordinates');
eq(DEMO4A_buildPlan_(mastersV3C()).checksum, planC.checksum, 'V3C-16. deterministic rebuild (identical checksum)');
(function () { var m2 = mastersV3C(); m2.locations = m2.locations.map(function (l) { var c = Object.assign({}, l); if (c.logistics_location_id === 'US-C-1') c.latitude = 40.0; return c; });
  var p2 = DEMO4A_buildPlan_(m2); ok(p2.ok && p2.checksum !== planC.checksum, 'V3C-16. changing a bound location coordinate changes the checksum'); })();

section('V3C-17..20. V3A safety + state refusal + retry + CLEAR');
ok(DEMO4A_verifyJournal_(JSON.parse(JSON.stringify(DEMO4A_buildJournal_(planC))), DEMO4A_buildJournal_(planC)).ok, 'V3C-17. journal build/verify intact on the V3C plan');
var rbC = DEMO4A_rollbackPlan_(DEMO4A_allIds_(planC)); eq(rbC.map(function (x) { return x.table; }), ['shipment_events', 'shipment_routes', 'shipment_lines', 'shipments', 'shipping_plan_lines', 'shipping_plans'], 'V3C-17. inserted-only reverse-FK rollback order intact');
eq(DEMO4A_classifyState_(planC, emptyLive()).classification, 'ABSENT_ALL', 'V3C-18. absent → insert path');
var partC = liveFromPlan(planC); partC.shipment_events.rows = []; eq(DEMO4A_classifyState_(planC, partC).classification, 'PARTIAL_PRESENT', 'V3C-18. partial refuses');
var driftC = liveFromPlan(planC); driftC.shipment_routes.rows[0].latitude = 0.123; eq(DEMO4A_classifyState_(planC, driftC).classification, 'CONTENT_DRIFT', 'V3C-18. content drift refuses');
var dupC = liveFromPlan(planC); dupC.shipments.rows.push(JSON.parse(JSON.stringify(dupC.shipments.rows[0]))); eq(DEMO4A_classifyState_(planC, dupC).classification, 'DUPLICATE_DEMO_ID', 'V3C-18. duplicate refuses');
eq(DEMO4A_classifyState_(planC, liveFromPlan(planC)).classification, 'PRESENT_EXACT_ALL', 'V3C-19. exact retry → PRESENT_EXACT_ALL (REUSED, six zero deltas)');
ok(DEMO4A_validateLiveRows_(planC, liveFromPlan(planC), mastersV3C()).demo_seed_validated, 'V3C-19. exact live + masters → DEMO_SEED_VALIDATED (bound coords equal master authority)');
ok(DEMO4A_CONFIRMED_CLEAR_TOKEN_ === 'PASTE_DEMO_CLEAR_TOKEN_HERE' && /CLEAR_REFUSED_STAGED_OFF/.test(clearFn), 'V3C-20. CLEAR remains disarmed (placeholder token)');

section('V3C-21..23. no production side effects; no line marketplace');
['handleUpsertShippingAllocationDraftAtomic', 'handleCreateShipment', 'confirmAndDispatch', 'handleReceiveShipment', 'reserveFactoryStock', 'deductFactoryStock', 'consumePurchaseOrder', 'weeklyAiPlanGenerate', 'generateDocument', 'UrlFetchApp', 'MailApp', 'GmailApp'].forEach(function (b) { ok(G.indexOf(b) === -1, 'V3C-21/22. no banned production/side-effect API: ' + b); });
ok(DEMO4A_REQUIRED_COLS_.shipping_plan_lines.indexOf('marketplace') === -1 && planC.tables.shipping_plan_lines.every(function (r) { return !r.hasOwnProperty('marketplace'); }), 'V3C-23. shipping_plan_lines does not require/write marketplace');

section('V3C-B. diagnostic identifier audit');
var diagC = DEMO4A_diagnoseResolution_(mastersV3C().templates, mastersV3C().nodes, mastersV3C().locations);
ok(diagC.exact_identifier_match_counts && typeof diagC.exact_identifier_match_counts.un_locode === 'number', 'V3C-B. diagnostic reports per-identifier exact match counts');
eq([diagC.node_binding_counts.canonical_master_binding, diagC.node_binding_counts.node_direct_coordinate], [0, 0], 'V3C-B. abstract-node fixtures: 0 canonical, 0 direct (all abstract, bound only by role)');
ok(diagC.node_binding_counts.abstract === mastersV3C().nodes.length, 'V3C-B. all nodes classified abstract');
ok(diagC.in_transit_current_capable_templates >= 1 && diagC.eligible_templates_by_region.US_WEST >= 1, 'V3C-B. reports current-capable + eligible-by-region counts');
ok(diagC.safe_examples.length <= 5 && diagC.safe_examples.every(function (e) { return /^[0-9a-f]{8}$/.test(e.template_fp); }), 'V3C-B. fingerprinted, capped examples (never all 427 nodes)');
// fail-closed: no locations at all → cannot build → precise reason + rejection counts
var noLocs = mastersV3C(); noLocs.locations = [];
var pFail = DEMO4A_buildPlan_(noLocs);
eq(pFail.ok, false, 'V3C-G. no logistics_locations → fail closed (no fabricated coordinate)');
ok(pFail.rejection_counts && Object.keys(pFail.rejection_counts).length >= 1, 'V3C-G. fail-closed carries exact rejection counts');

// ============================================================ V3D — HARD ROUTE-GEOGRAPHY SEMANTIC GATE
// Prevent geographically implausible Demo location bindings (third-country markers, sea/truck airport destinations) and
// enforce transport/role-compatible origin, current and destination anchors. Determinism is NOT semantic authority.
function locT(id, country, region, lat, lng, type) { return { logistics_location_id: id, location_code: id + '-C', location_name: id, country: country, region: region, latitude: lat, longitude: lng, location_type: type, is_active: 'TRUE' }; }
var POOL = [
  locT('LOC-CN-FAC', 'CN', '', 31.2, 121.4, 'factory'),
  locT('LOC-CN-PORT', 'CN', '', 29.9, 121.8, 'seaport'),
  locT('LOC-CHANNEL-FR-CALAIS', 'FR', '', 50.95, 1.85, 'port'),
  locT('LOC-AIR-US-ATL', 'US', 'US Central', 33.6, -84.4, 'airport'),
  locT('LOC-AIR-US-DFW', 'US', 'US Central', 32.9, -97.0, 'airport'),
  locT('LOC-WH-US-CENTRAL', 'US', 'US Central', 41.8, -87.6, 'warehouse'),
  locT('LOC-PORT-US-WEST', 'US', 'US West', 37.7, -122.4, 'seaport'),
  locT('LOC-FC-US-CENTRAL', 'US', 'US Central', 39.0, -94.5, 'fulfillment_center')
];

section('V3D-H1. CN→US current marker rejects an unrelated third country (France/Calais)');
var curSea = DEMO4A_pickAnchor_(POOL, { countries: { cn: 1, us: 1 }, role: 'current', tclass: 'sea' });
ok(curSea && DEMO4A_locId_(curSea.loc) !== 'LOC-CHANNEL-FR-CALAIS', 'H1. current marker never binds FR/Calais when the corridor is {CN,US}');
ok(curSea && DEMO4A_low_(DEMO4A_locCountry_(curSea.loc)) !== 'fr', 'H1. the chosen current marker is inside the corridor, not FR');

section('V3D-H2. an EXPLICIT third-country route node authorizes that country');
var corridorFR = DEMO4A_corridorCountries_({ origin_country: 'CN', destination_country: 'US' }, [{ node: { country: 'FR' } }, { node: { country: '' } }]);
eq([corridorFR.cn, corridorFR.us, corridorFR.fr], [1, 1, 1], 'H2. an explicit FR route node adds FR to the corridor authority');
var curFR = DEMO4A_pickAnchor_(POOL, { countries: corridorFR, role: 'current', tclass: 'sea' });
ok(curFR && DEMO4A_locId_(curFR.loc) === 'LOC-CHANNEL-FR-CALAIS', 'H2. with FR proven in the corridor, the FR port becomes eligible again (same location, now authorized)');

section('V3D-H3/H4. sea/truck destination is never an airport; air may be');
var destSea = DEMO4A_pickAnchor_(POOL, { country: 'US', region: 'US Central', role: 'destination', tclass: 'sea' });
ok(destSea && DEMO4A_canonLocType_(DEMO4A_locType_(destSea.loc)) !== 'airport', 'H3. a sea destination is never an airport');
ok(destSea && ['warehouse', 'fulfillment_center', 'distribution_center'].indexOf(DEMO4A_canonLocType_(DEMO4A_locType_(destSea.loc))) !== -1, 'H3. a sea destination is a warehouse/FC/DC');
var airOnly = [locT('LOC-AIR-1', 'US', 'US Central', 33.6, -84.4, 'airport')];
eq(DEMO4A_pickAnchor_(airOnly, { country: 'US', region: 'US Central', role: 'destination', tclass: 'sea' }), null, 'H3. an airport-only region fails a sea destination closed (never picks the airport)');
ok(DEMO4A_pickAnchor_(airOnly, { country: 'US', region: 'US Central', role: 'destination', tclass: 'air' }) !== null, 'H4. the SAME airport IS a valid destination for an air route');

section('V3D-H5/H6. sea origin is maritime/factory; truck last-mile is a warehouse-class endpoint');
var origin5 = DEMO4A_pickAnchor_(POOL, { country: 'CN', role: 'origin', tclass: 'sea' });
ok(origin5 && ['factory', 'warehouse', 'port', 'fulfillment_center', 'distribution_center'].indexOf(DEMO4A_canonLocType_(DEMO4A_locType_(origin5.loc))) !== -1, 'H5. a sea origin is a maritime/factory/warehouse type');
eq(DEMO4A_pickAnchor_([locT('LOC-CN-AIR', 'CN', '', 31.1, 121.8, 'airport')], { country: 'CN', role: 'origin', tclass: 'sea' }), null, 'H5. an airport is rejected as a sea origin');
var truckDest = DEMO4A_pickAnchor_(POOL, { country: 'US', region: 'US Central', role: 'destination', tclass: 'truck' });
ok(truckDest && ['warehouse', 'fulfillment_center', 'distribution_center', 'parcel_hub', 'carrier_facility', 'truck_terminal', 'rail_terminal', 'transit_hub'].indexOf(DEMO4A_canonLocType_(DEMO4A_locType_(truckDest.loc))) !== -1, 'H6. a truck last-mile destination is a warehouse/FC/DC/delivery endpoint (never an airport)');

section('V3D-H7/H9. transport/role + node/role compatibility matrix');
eq(DEMO4A_typeRoleCompat_('port', 'sea', 'current'), 'compatible', 'H7. a seaport is a compatible sea current marker');
eq(DEMO4A_typeRoleCompat_('customs_facility', 'sea', 'current'), 'incompatible', 'H7. a customs facility is NOT a compatible current marker');
eq(DEMO4A_typeRoleCompat_('airport', 'sea', 'destination'), 'incompatible', 'H7. an airport is an incompatible sea destination type');
eq(DEMO4A_typeRoleCompat_('warehouse', 'sea', 'origin'), 'compatible', 'H7. a warehouse is a compatible sea origin');
eq(DEMO4A_nodeRoleCompat_('customs_clearance', 'current'), 'incompatible', 'H9. a customs node cannot host a current marker');
eq(DEMO4A_nodeRoleCompat_('port_transit', 'current'), 'compatible', 'H9. a port/transit node can host a current marker');
eq(DEMO4A_nodeRoleCompat_('appointment', 'current'), 'incompatible', 'H9. an appointment/admin node cannot host a current marker');
eq(DEMO4A_chooseCurrentIndex_([{ node: { node_type: 'origin' } }, { node: { node_type: 'customs' } }, { node: { node_type: 'port' } }, { node: { node_type: 'destination' } }]), 2, 'H9. the current index skips the customs middle node in favour of the port node');

section('V3D-H10. explicit synonym normalization only — no fuzzy/name matching');
eq(DEMO4A_canonLocType_('seaport'), 'port', 'H10. explicit synonym maps (seaport→port)');
eq(DEMO4A_canonLocType_('Los Angeles Seaport Terminal 3'), 'UNKNOWN', 'H10. a descriptive name does NOT fuzzy-match → UNKNOWN (fails closed for a synthetic binding)');
eq(DEMO4A_canonLocType_(''), '', 'H10. a blank type is blank (unknown; fails closed for a synthetic binding)');

section('V3D-H11. deterministic, order-stable selection among equally-valid candidates');
var tie = [locT('LOC-B', 'US', 'US West', 37.0, -122.0, 'warehouse'), locT('LOC-A', 'US', 'US West', 34.0, -118.0, 'warehouse')];
eq(DEMO4A_pickAnchor_(tie, { country: 'US', region: 'US West', role: 'destination', tclass: 'sea' }).loc.logistics_location_id, 'LOC-A', 'H11. lowest id wins among equally-valid candidates');
eq(DEMO4A_pickAnchor_(tie.slice().reverse(), { country: 'US', region: 'US West', role: 'destination', tclass: 'sea' }).loc.logistics_location_id, 'LOC-A', 'H11. stable regardless of input order');

section('V3D-H12/H13. full plan on a polluted pool — no invented coord, no FR/airport, abstract timeline intact');
function mastersV3D() { var m = mastersV3C(); m.locations = m.locations.concat([locT('LOC-CHANNEL-FR-CALAIS', 'FR', '', 50.95, 1.85, 'port'), locT('LOC-AIR-US-C', 'US', 'US Central', 39.0, -94.6, 'airport'), locT('LOC-AIR-US-E', 'US', 'US East', 40.6, -73.8, 'airport'), locT('LOC-AIR-US-W', 'US', 'US West', 33.9, -118.4, 'airport')]); return m; }
var planD = DEMO4A_buildPlan_(mastersV3D());
ok(planD.ok, 'H12(setup). the V3D plan still builds with Calais + airports polluting the pool');
(function () { var pool = {}; mastersV3D().locations.forEach(function (l) { pool[DEMO4A_num_(l.latitude).toFixed(5) + ',' + DEMO4A_num_(l.longitude).toFixed(5)] = 1; });
  ok(planD.tables.shipment_routes.concat(planD.tables.shipment_events).every(function (r) { if (DEMO4A_str_(r.latitude) === '' && DEMO4A_str_(r.longitude) === '') return true; return pool[DEMO4A_num_(r.latitude).toFixed(5) + ',' + DEMO4A_num_(r.longitude).toFixed(5)] === 1; }), 'H12. no invented coordinate — every non-blank coord is an existing logistics_locations coord'); })();
var boundIdsD = planD.tables.shipment_routes.filter(function (r) { return DEMO4A_str_(r.location_ref_id) !== ''; }).map(function (r) { return r.location_ref_id; });
ok(boundIdsD.indexOf('LOC-CHANNEL-FR-CALAIS') === -1, 'H1/H12. the polluted-pool plan never binds FR/Calais anywhere');
ok(boundIdsD.every(function (id) { return !/^LOC-AIR-/.test(id); }), 'H3/H12. the sea-route plan never binds any airport');
ok(planD.binding_gates.ok && planD.binding_gates.sea_truck_destination_not_airport && planD.binding_gates.no_unrelated_third_country && planD.binding_gates.all_role_bindings_compatible && planD.binding_gates.primary_current_distinct, 'H8/E. all binding gates hold (role + corridor + primary-current-distinct + no-airport-dest)');
var itD = planD.per_shipment.filter(function (s) { return s.slot === 'in_transit'; })[0];
eq(planD.tables.shipment_routes.filter(function (r) { return r.shipment_id === itD.shipment_id; }).length, itD.nodes, 'H13. the full abstract template-node timeline is preserved as route rows');
ok(itD.abstract_rows >= 1, 'H13. abstract (coordinate-blank) timeline rows remain');
ok(itD.origin_location_id !== itD.current_location_id && itD.current_location_id !== itD.destination_location_id && itD.origin_location_id !== itD.destination_location_id, 'H8. primary in-transit origin/current/destination are distinct');

section('V3D-H14. previous V3A/V3B/V3C gates remain intact on the V3D plan');
ok(G.indexOf('function DEMO4A_transitPrefTypes_') === -1, 'H14. the soft-preference selector DEMO4A_transitPrefTypes_ is fully removed (superseded by the hard gate)');
ok(DEMO4A_verifyJournal_(JSON.parse(JSON.stringify(DEMO4A_buildJournal_(planD))), DEMO4A_buildJournal_(planD)).ok, 'H14. V3A journal integrity gate still holds');
eq(DEMO4A_classifyState_(planD, liveFromPlan(planD)).classification, 'PRESENT_EXACT_ALL', 'H14. V3 state classification (REUSED) intact');
ok(DEMO4A_validateLiveRows_(planD, liveFromPlan(planD), mastersV3D()).demo_seed_validated, 'H14. V3C live-row validation (incl. the new geography checks) passes on an exact V3D live set');
ok(DEMO4A_REQUIRED_COLS_.shipping_plan_lines.indexOf('marketplace') === -1, 'H14. V3B no-line-marketplace conclusion preserved');

section('V3D-H15. the retired checksum 77e18d0b is neither pinned nor accepted; type/decision bound into the checksum');
ok(G.indexOf('77e18d0b') === -1, 'H15. 77e18d0b appears nowhere in the seed source (not pinned/accepted)');
ok(/^[0-9a-f]{8}$/.test(planD.checksum) && planD.checksum !== '77e18d0b', 'H15. the regenerated checksum is a fresh 8-hex value, not the retired one');
(function () { var m2 = mastersV3D(); m2.locations = m2.locations.map(function (l) { var c = Object.assign({}, l); if (c.logistics_location_id === 'TR-1') c.location_type = 'transit_hub'; return c; }); var p2 = DEMO4A_buildPlan_(m2); ok(p2.ok && p2.checksum !== planD.checksum, 'H15/F. changing a bound location_type changes the demo_plan_checksum (type is bound into the manifest)'); })();

section('V3D-H16. both confirmation constants remain placeholders');
eq(DEMO4A_CONFIRMED_SEED_CHECKSUM_, 'PASTE_DEMO_SEED_CHECKSUM_HERE', 'H16. seed confirmation constant remains a placeholder');
eq(DEMO4A_CONFIRMED_CLEAR_TOKEN_, 'PASTE_DEMO_CLEAR_TOKEN_HERE', 'H16. clear token remains a placeholder');

section('V3D-G. LIVE validator enforces the geography semantics (H17 zero-new-failure proven by the runner)');
var vchecksD = DEMO4A_validateLiveRows_(planD, liveFromPlan(planD), mastersV3D()).checks;
ok(vchecksD.live_bound_type_role_compatible.ok && vchecksD.live_no_unrelated_third_country.ok, 'G. exact V3D live passes the bound-type/role + no-third-country checks');
(function () { var bad = liveFromPlan(planD); var cur = bad.shipment_routes.rows.filter(function (r) { return r.shipment_id === itD.shipment_id && DEMO4A_low_(r.status) === 'current'; })[0]; if (cur) cur.country = 'FR'; ok(!DEMO4A_validateLiveRows_(planD, bad, mastersV3D()).checks.live_no_unrelated_third_country.ok, 'G. a live current marker relabelled to an unrelated third country (FR) is caught'); })();
(function () { var bad = liveFromPlan(planD); var m4 = mastersV3D(); var dst = bad.shipment_routes.rows.filter(function (r) { return r.shipment_id === itD.shipment_id; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); }).filter(function (r) { return DEMO4A_str_(r.location_ref_id) !== ''; }); var last = dst[dst.length - 1]; if (last) { m4.locations = m4.locations.map(function (l) { var c = Object.assign({}, l); if (c.logistics_location_id === last.location_ref_id) c.location_type = 'airport'; return c; }); ok(!DEMO4A_validateLiveRows_(planD, bad, m4).checks.live_bound_type_role_compatible.ok, 'G. a sea-route destination whose master location_type is an airport is caught'); } else ok(true, 'G. (no bound destination row to tamper — vacuous)'); })();

// ============================================================ V3E — LIVE LOCATION-TYPE ROLE-CANDIDATE DIAGNOSTIC
// Read-only instrumentation: per-role/region candidate counts across every filter stage + first-zero stage, exact raw
// token audit, region authority — WITHOUT changing eligibility/binding/matrix.
function locE(id, country, region, lat, lng, type, extra) { var o = { logistics_location_id: id, location_code: id + '-C', location_name: id, country: country, region: region, latitude: lat, longitude: lng, location_type: type, is_active: 'TRUE' }; for (var k in (extra || {})) o[k] = extra[k]; return o; }

section('V3E-H1/H2. diagnostic is strictly read-only + one compact log');
var dxEntry = extractFn(G, 'TEMP_DEMO4A_DIAGNOSE_LIVE_LOCATION_ROLE_CANDIDATES');
var dxCore = extractFn(G, 'DEMO4A_diagnoseLiveRoleCandidates_') + '\n' + extractFn(G, 'DEMO4A_dxRoleStages_');
ok(!/\.(appendRow|setValue|deleteRow)\(/.test(dxEntry + dxCore) && !/setProperty\(/.test(dxEntry + dxCore), 'H1. the diagnostic entrypoint + core perform NO write (no appendRow/setValue/deleteRow/setProperty)');
eq((dxEntry.match(/Logger\.log\(/g) || []).length, 1, 'H2. the entrypoint emits exactly ONE compact primary log');
ok(/DEMO4A_ZERO_WRITE_CONFIRMED = 'YES'/.test(dxEntry), 'H1/G. entrypoint asserts DEMO4A_ZERO_WRITE_CONFIRMED = YES');

section('V3E-H5. every one of the 12 filter stages is independently reported');
var LWEST = [locE('W1', 'US', 'US West', 34, -118, 'warehouse'), locE('W2', 'US', 'US West', 37, -122, 'seaport')];
var stW = DEMO4A_dxRoleStages_(LWEST, { role: 'destination', country: 'US', region: 'US West', tclass: 'sea' });
var STAGE_KEYS = ['total', 'active', 'valid_coordinate', 'country_exact', 'region_exact', 'raw_type_recognized', 'canonical_type_resolved', 'transport_compatible', 'role_compatible', 'node_role_compatible', 'corridor_compatible', 'distinct_candidate'];
ok(STAGE_KEYS.every(function (k) { return typeof stW.counts[k] === 'number'; }), 'H5. all 12 cumulative stage counts are present');
eq(stW.counts.total, 2, 'H4. total counts every input row');
eq(stW.counts.role_compatible, 1, 'H5. only the warehouse survives as a sea-destination candidate (seaport excluded from destination)');

section('V3E-H6/H9. first-zero stage distinguishes region mismatch from type mismatch');
eq(DEMO4A_dxRoleStages_([locE('X', 'US', 'US East', 40, -74, 'warehouse')], { role: 'destination', country: 'US', region: 'US West', tclass: 'sea' }).first_zero_stage, 'region_exact', 'H6/H9. right type + wrong region → first zero at region_exact');
eq(DEMO4A_dxRoleStages_([locE('Y', 'US', 'US West', 34, -118, 'teleporter')], { role: 'destination', country: 'US', region: 'US West', tclass: 'sea' }).first_zero_stage, 'canonical_type_resolved', 'H6/H9. right region + unrecognized type → first zero at canonical_type_resolved (distinct stage)');
eq(DEMO4A_dxRoleStages_([locE('Z', 'US', 'US West', 34, -118, 'airport')], { role: 'destination', country: 'US', region: 'US West', tclass: 'sea' }).first_zero_stage, 'transport_compatible', 'H6. a non-sea type (airport) → first zero at transport_compatible (not sea-relevant in any role)');
eq(DEMO4A_dxRoleStages_([locE('P', 'US', 'US West', 34, -118, 'seaport')], { role: 'destination', country: 'US', region: 'US West', tclass: 'sea' }).first_zero_stage, 'role_compatible', 'H6. a sea-relevant-but-wrong-role type (port for a sea destination) → first zero at role_compatible (distinct from transport_compatible)');

section('V3E-H7/H8. unknown stays unknown; no fuzzy/name matching');
eq(DEMO4A_canonLocType_('teleporter'), 'UNKNOWN', 'H7. an unrecognized token stays UNKNOWN');
eq(DEMO4A_canonLocType_('Los Angeles Seaport Terminal'), 'UNKNOWN', 'H8. a descriptive name does NOT fuzzy-match → UNKNOWN');
eq(DEMO4A_dxRoleStages_([locE('N', 'US', 'US West', 34, -118, 'Los Angeles Seaport Terminal')], { role: 'destination', country: 'US', region: 'US West', tclass: 'sea' }).counts.canonical_type_resolved, 0, 'H8. a fuzzy/descriptive type is NOT resolved (no name matching)');

section('V3E-B/C/D/F/G. full diagnostic core over a coherent fixture');
function mastersE() {
  var templates = [tplV3C('RT-W', 'US West'), tplV3C('RT-C', 'US Central'), tplV3C('RT-E', 'US East')];
  var nodes = [];
  ['RT-W', 'RT-E'].forEach(function (tid) { nodes.push(nAbs(tid, 1, 'origin', 'origin_departure'), nAbs(tid, 2, 'customs', 'customs_clearance'), nAbs(tid, 3, 'port', 'port_transit'), nAbs(tid, 4, 'destination', 'final_delivery')); });
  nodes.push(nAbs('RT-C', 1, 'origin', 'origin_departure'), nAbs('RT-C', 2, 'customs', 'customs_clearance'), nAbs('RT-C', 3, 'port', 'port_transit'), nAbs('RT-C', 4, 'hub', 'hub_transit'), nAbs('RT-C', 5, 'destination', 'final_delivery'));
  var locations = [
    locE('CN-FAC-1', 'CN', '', 31, 121, 'factory', { verification_status: 'verified', record_status: 'active' }),
    locE('US-W-1', 'US', 'US West', 34, -118, 'warehouse', { verification_status: 'verified' }),
    locE('US-C-1', 'US', 'US Central', 41, -87, 'warehouse'),
    locE('US-E-1', 'US', 'US East', 40, -74, 'warehouse'),
    locE('US-W-AIR', 'US', 'US West', 33, -118, 'airport'),
    locE('FR-PORT', 'FR', '', 50.9, 1.8, 'port'),
    locE('CA-WH', 'CA', 'Ontario', 43, -79, 'warehouse')
  ];
  return { templates: templates, nodes: nodes, locations: locations };
}
var mE = mastersE();
var dxE = DEMO4A_diagnoseLiveRoleCandidates_(mE.templates, mE.nodes, mE.locations);
ok(dxE.filter_stage_counts.origin_cn && dxE.filter_stage_counts.destination_by_region.length === 3 && dxE.filter_stage_counts.primary_in_transit_current, 'C. reports origin + 3 destination-by-region + primary current stage sets');
eq(dxE.filter_stage_counts.origin_cn.counts.role_compatible, 1, 'C. the CN factory is a valid sea-origin candidate');
eq(dxE.verdict, 'LIVE_LOCATION_TYPES_READY_FOR_MATRIX_ALIGNMENT', 'G. a coherent fixture → READY verdict');
ok(dxE.raw_type_token_audit.every(function (t) { return t.example_id_fingerprints.length <= 3 && t.example_id_fingerprints.every(function (f) { return /^[0-9a-f]{8}$/.test(f); }); }), 'H3/D. raw-token audit uses ≤3 id FINGERPRINTS (no id / all-row dump)');
ok(dxE.raw_type_token_audit.some(function (t) { return t.raw_token === 'factory' && t.recognized && t.source_spec_enum_match && t.compatible_roles_sea.indexOf('origin') !== -1; }), 'D. factory token: recognized + enum-matched + origin-compatible under sea');
ok(dxE.raw_type_token_audit.some(function (t) { return t.raw_token === 'airport' && t.recognized && t.compatible_roles_sea.indexOf('destination') === -1; }), 'D. airport token: recognized but NOT a sea-destination role');
eq(dxE.location_distribution.other_aggregate, 2, 'B. non-CN/US rows (CA + FR) are counted ONLY in the OTHER aggregate (never per-row)');
ok(dxE.location_distribution.by_scope['CN'] && dxE.location_distribution.by_scope['US | US West'], 'B. distribution is scoped by country + raw region (CN, US | US West, …)');
ok(dxE.selected_template_evidence.length === 3 && dxE.selected_template_evidence.every(function (e) { return /^[0-9a-f]{8}$/.test(e.template_fp); }), 'F. 3 candidate templates reported by FINGERPRINT (no master dump)');
ok(dxE.selected_template_evidence[0].eligible_current_node_types.indexOf('port') !== -1, 'F. eligible current-node types reported (port is transit-compatible)');

section('V3E-E/G. region-authority mismatch is distinguishable from type mismatch');
var mm = mastersE(); mm.locations = mm.locations.map(function (l) { var c = {}; for (var k in l) c[k] = l[k]; if (c.country === 'US') { c.region = ''; c.subdivision_code = 'CA'; } return c; });
var dxMM = DEMO4A_diagnoseLiveRoleCandidates_(mm.templates, mm.nodes, mm.locations);
eq(dxMM.verdict, 'LIVE_REGION_AUTHORITY_MISMATCH', 'G/E. US region blank + subdivision populated → LIVE_REGION_AUTHORITY_MISMATCH');
ok(dxMM.region_authority_audit.region_blank_but_subdivision_present >= 1 && dxMM.region_authority_audit.uses_us_west_central_east_tokens === false, 'E. region-blank-but-subdivision counted; WCE region tokens absent');

section('V3E-H10. eligibility / binding / matrix behavior is UNCHANGED');
eq(DEMO4A_roleCompatibleTypes_('sea', 'destination').slice().sort(), ['carrier_facility', 'distribution_center', 'fulfillment_center', 'parcel_hub', 'rail_terminal', 'transit_hub', 'truck_terminal', 'warehouse'], 'H10. the frozen sea-destination compatibility set is unchanged');
eq(DEMO4A_buildPlan_(mastersV3C()).checksum, planC.checksum, 'H10. plan build is byte-identical (eligibility + binding selection untouched)');

section('V3E-H11. both confirmation constants remain placeholders');
eq(DEMO4A_CONFIRMED_SEED_CHECKSUM_, 'PASTE_DEMO_SEED_CHECKSUM_HERE', 'H11. seed confirmation constant remains a placeholder');
eq(DEMO4A_CONFIRMED_CLEAR_TOKEN_, 'PASTE_DEMO_CLEAR_TOKEN_HERE', 'H11. clear token remains a placeholder');

// ============================================================ V3F — WAREHOUSE ↔ LOGISTICS DESTINATION AUTHORITY
// warehouses = business destination authority (no coords); logistics_locations = coordinate authority; exact bridge
// logistics_locations.warehouse_id === warehouses.warehouse_id; typed coordinate branches; no fabricated coordinates.
// V3G — warehouses carry a resolvable ADDRESS (flat `address` + city/state/postal_code, the live schema shape). `over`
// lets a test blank a field to exercise the address-authority gate.
var WH_ADDR_ = { 'US West': { city: 'Los Angeles', state: 'CA', postal_code: '90001' }, 'US Central': { city: 'Chicago', state: 'IL', postal_code: '60601' }, 'US East': { city: 'Newark', state: 'NJ', postal_code: '07101' } };
function wh(id, type, company, country, region, over) { over = over || {}; var a = WH_ADDR_[region] || { city: 'Demo City', state: 'NA', postal_code: '00000' };
  return { warehouse_id: id, warehouse_code: id, warehouse_name: id, warehouse_type: type, company: company, country: country, marketplace: 'Amazon', logistics_region: region, is_active: 'TRUE',
    address: over.noAddress ? '' : ('100 Demo Fulfillment Way ' + id), city: over.noCity ? '' : a.city, state: a.state, postal_code: over.noPostal ? '' : a.postal_code }; }
function locWH(id, whId, country, region, lat, lng, type, vs) { return { logistics_location_id: id, location_code: id + '-C', location_name: id, country: country, region: region, latitude: lat, longitude: lng, location_type: type, warehouse_id: whId, verification_status: vs || 'verified', is_active: 'TRUE' }; }
function tplWH(id, region, whId) { var t = tplV3C(id, region); t.destination_warehouse_id = whId; return t; }
function mastersWH(over) {
  over = over || {};
  var templates = [tplWH('RT-W', 'US West', 'WH-KM-US-FBA-W'), tplWH('RT-C', 'US Central', 'WH-KM-US-FBA-C'), tplWH('RT-E', 'US East', 'WH-KM-US-FBA-E')];
  var nodes = [];
  ['RT-W', 'RT-E'].forEach(function (tid) { nodes.push(nAbs(tid, 1, 'origin', 'origin_departure'), nAbs(tid, 2, 'customs', 'customs_clearance'), nAbs(tid, 3, 'port', 'port_transit'), nAbs(tid, 4, 'destination', 'final_delivery')); });
  nodes.push(nAbs('RT-C', 1, 'origin', 'origin_departure'), nAbs('RT-C', 2, 'customs', 'customs_clearance'), nAbs('RT-C', 3, 'port', 'port_transit'), nAbs('RT-C', 4, 'hub', 'hub_transit'), nAbs('RT-C', 5, 'destination', 'final_delivery'));
  var bl = over.fbaBlank;
  var fw = over.noLocJoin ? '' : 'WH-KM-US-FBA-W', fc = over.noLocJoin ? '' : 'WH-KM-US-FBA-C', fe = over.noLocJoin ? '' : 'WH-KM-US-FBA-E';
  var locations = [
    locWH('CN-FAC-1', '', 'CN', '', 31, 121, 'factory'),
    locWH('TR-1', '', 'US', 'US West', 37.7, -122.4, 'port'),
    locWH('TR-2', '', 'US', 'US Central', 29.7, -95.3, 'port'),
    locWH('LOC-WH-KM-US-FBA-W', fw, 'US', 'US West', bl ? '' : 34.0, bl ? '' : -118.2, 'fulfillment_center'),
    locWH('LOC-WH-KM-US-FBA-C', fc, 'US', 'US Central', bl ? '' : 41.8, bl ? '' : -87.6, 'fulfillment_center'),
    locWH('LOC-WH-KM-US-FBA-E', fe, 'US', 'US East', bl ? '' : 40.7, bl ? '' : -74.0, 'fulfillment_center')
  ];
  if (bl || over.noLocJoin) { locations.push(locWH('US-W-GEN', '', 'US', 'US West', 34.1, -118.3, 'warehouse'), locWH('US-C-GEN', '', 'US', 'US Central', 41.9, -87.7, 'warehouse'), locWH('US-E-GEN', '', 'US', 'US East', 40.8, -74.1, 'warehouse')); }
  var warehouses = [wh('WH-KM-US-FBA-W', 'FBA', 'KM', 'US', 'US West'), wh('WH-KM-US-FBA-C', 'FBA', 'KM', 'US', 'US Central'), wh('WH-KM-US-FBA-E', 'FBA', 'KM', 'US', 'US East')];
  if (over.mismatchCompany) warehouses.forEach(function (w) { w.company = 'OTHERCO'; });
  if (over.badType) warehouses.forEach(function (w) { w.warehouse_type = 'FACTORY'; });
  return { templates: templates, nodes: nodes, locations: locations, warehouses: warehouses, marketplaceSkus: mastersFull().marketplaceSkus, skuDetails: mastersFull().skuDetails };
}

section('V3F-J1. exact warehouses→logistics warehouse_id join (no fuzzy/name/city)');
var LWH = mastersWH().locations;
eq(DEMO4A_locsForWarehouse_(LWH, 'WH-KM-US-FBA-W').map(function (l) { return l.logistics_location_id; }), ['LOC-WH-KM-US-FBA-W'], 'J1. join returns exactly the row whose warehouse_id === the warehouse id');
eq(DEMO4A_locsForWarehouse_(LWH, 'wh-km-us-fba-w').length, 1, 'J1. join is case-insensitive on the exact id');
eq(DEMO4A_locsForWarehouse_(LWH, 'Kentucky FBA').length, 0, 'J1. a name/city string never joins (no fuzzy matching)');

section('V3F-J2/J3/J5/J6/J7/J11. typed coordinate branches');
var whW = mastersWH().warehouses[0];
var rReady = DEMO4A_resolveWarehouseDestination_(whW, LWH);
eq(rReady.branch, 'WAREHOUSE_LOCATION_COORDINATE_READY', 'J3. valid joined FBA coords → WAREHOUSE_LOCATION_COORDINATE_READY');
ok(rReady.renderable === true && rReady.received_allowed === true && rReady.warehouse_id === 'WH-KM-US-FBA-W' && rReady.logistics_location_id === 'LOC-WH-KM-US-FBA-W', 'J3. READY carries both ids + renderable + received_allowed');
var LWHblank = mastersWH({ fbaBlank: true }).locations;
var rPending = DEMO4A_resolveWarehouseDestination_(whW, LWHblank);
eq(rPending.branch, 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING', 'J2. blank-coordinate FBA is NOT discarded — identity kept (COORDINATE_PENDING)');
ok(rPending.warehouse_id === 'WH-KM-US-FBA-W' && rPending.logistics_location_id === 'LOC-WH-KM-US-FBA-W', 'J2. pending branch still preserves both real ids');
ok(rPending.latitude === undefined && rPending.received_allowed === false && rPending.renderable === false, 'J5/J11. pending branch fabricates NO coordinate, is not renderable, and NEVER allows received-at-FBA');
eq(DEMO4A_resolveWarehouseDestination_(wh('WH-NOJOIN', 'FBA', 'KM', 'US', 'US West', { noAddress: true }), LWH).branch, 'WAREHOUSE_LOCATION_JOIN_MISSING', 'J6. no address AND no eligible logistics row → WAREHOUSE_LOCATION_JOIN_MISSING (fail closed)');
// V3G — an ADDRESS-ready warehouse with no logistics join is identity-ready/coordinate-pending (no-join no longer kills identity).
var rNoJoinAddr = DEMO4A_resolveWarehouseDestination_(wh('WH-NOJOIN', 'FBA', 'KM', 'US', 'US West'), LWH, {}, tplWH('RT-W', 'US West', 'WH-NOJOIN'));
ok(rNoJoinAddr.branch === 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING' && rNoJoinAddr.identity_ready === true && rNoJoinAddr.logistics_location_id === '', 'J6/V3G. an address-ready warehouse with no logistics join → identity ready, coordinate pending (no fabricated coord)');
var dupLocs = LWH.concat([locWH('LOC-DUP', 'WH-KM-US-FBA-W', 'US', 'US West', 35.0, -119.0, 'warehouse')]);
eq(DEMO4A_resolveWarehouseDestination_(whW, dupLocs).branch, 'WAREHOUSE_LOCATION_JOIN_CONFLICT', 'J7. >1 eligible logistics row for one warehouse_id → WAREHOUSE_LOCATION_JOIN_CONFLICT (fail closed)');
var rRetired = DEMO4A_resolveWarehouseDestination_(whW, LWH.map(function (l) { var c = {}; for (var k in l) c[k] = l[k]; if (c.warehouse_id === 'WH-KM-US-FBA-W') c.verification_status = 'retired'; return c; }), {}, tplWH('RT-W', 'US West', 'WH-KM-US-FBA-W'));
ok(rRetired.branch === 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING' && rRetired.logistics_location_id === '', 'J1/J6. a retired logistics row is ineligible → not joined (identity kept, coordinate pending)');

section('V3F-J3/J4/J9/J10. buildPlan with warehouse authority — READY');
var planWH = DEMO4A_buildPlan_(mastersWH());
ok(planWH.ok && planWH.warehouses_present === true, 'J3. plan builds with warehouses present + all destinations READY');
var itWH = planWH.per_shipment.filter(function (s) { return s.slot === 'in_transit'; })[0];
eq(itWH.destination_coordinate_branch, 'WAREHOUSE_LOCATION_COORDINATE_READY', 'J3. in-transit destination branch = READY');
ok(/^WH-KM-US-FBA-/.test(itWH.destination_warehouse_id) && /^LOC-WH-KM-US-FBA-/.test(itWH.destination_logistics_location_id), 'J9. both destination_warehouse_id + destination_logistics_location_id survive on the shipment');
ok(itWH.binding_evidence.destination.location_type === 'fulfillment_center' && itWH.binding_evidence.destination.binding_type === 'WAREHOUSE_LOCATION_BINDING', 'J4. the final destination is the FBA facility (fulfillment_center via WAREHOUSE_LOCATION_BINDING) — never a seaport');
ok(itWH.binding_evidence.current.canon_location_type === 'port' || itWH.binding_evidence.current.location_type === 'port', 'J4. the current/gateway marker remains a seaport (distinct from the FBA final destination)');
ok(planWH.binding_manifest.some(function (m) { return /^WHDEST~/.test(m) && /WH-KM-US-FBA-/.test(m) && /LOC-WH-KM-US-FBA-/.test(m); }), 'J9. the checksum manifest binds a WHDEST entry with BOTH the warehouse id and the logistics-location id');
(function () { var m2 = mastersWH(); m2.warehouses = m2.warehouses.map(function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (c.warehouse_id === 'WH-KM-US-FBA-C') c.warehouse_id = 'WH-KM-US-FBA-C2'; return c; }); m2.templates = m2.templates.map(function (t) { var c = {}; for (var k in t) c[k] = t[k]; if (c.route_template_id === 'RT-C') c.destination_warehouse_id = 'WH-KM-US-FBA-C2'; return c; }); m2.locations = m2.locations.map(function (l) { var c = {}; for (var k in l) c[k] = l[k]; if (c.warehouse_id === 'WH-KM-US-FBA-C') c.warehouse_id = 'WH-KM-US-FBA-C2'; return c; }); var p2 = DEMO4A_buildPlan_(m2); ok(p2.ok && p2.checksum !== planWH.checksum, 'J9. changing a destination warehouse identity changes the demo_plan_checksum'); })();
var delivWH = planWH.per_shipment.filter(function (s) { return s.slot === 'delivered'; })[0];
var recvEvWH = planWH.tables.shipment_events.filter(function (e) { return e.shipment_id === delivWH.shipment_id && DEMO4A_low_(e.event_type) === 'received'; });
ok(recvEvWH.length === 1, 'J10. received is emitted for the delivered shipment ONLY when its FBA facility coordinate is truthfully reached (READY)');
ok(DEMO4A_num_(recvEvWH[0].latitude) !== 0 && planWH.tables.shipment_routes.some(function (r) { return r.shipment_id === delivWH.shipment_id && /^LOC-WH-KM-US-FBA-/.test(DEMO4A_str_(r.location_ref_id)); }), 'J10. the received event + destination route row carry the exact FBA logistics-location coordinate');

section('V3F-J6/J8/J11. buildPlan fails closed (no fabricated FBA, no received) — identity/coordinate not ready');
var planPend = DEMO4A_buildPlan_(mastersWH({ fbaBlank: true }));
// V3G — identity is ADDRESS-ready, but with NO reviewed coordinate and NO valid logistics coordinate the DISPLAY coordinate
// is unresolved → fail closed as DESTINATION_ADDRESS_COORDINATE_UNRESOLVED (never a fabricated coordinate).
eq([planPend.ok, planPend.reason], [false, 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED'], 'J11/V3G. all-blank-coordinate FBAs with no reviewed coordinate → build fails closed on the COORDINATE (identity stays ready)');
ok(planPend.destination_authority_errors.some(function (e) { return e.branch === 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING'; }) && !planPend.tables, 'J11. pending branch reported + NO rows built (no received event anywhere)');
eq(DEMO4A_buildPlan_(mastersWH({ mismatchCompany: true })).reason, 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', 'J8. warehouse company ≠ plan scope → fail closed (identity)');
eq(DEMO4A_buildPlan_(mastersWH({ badType: true })).reason, 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', 'J8. a non-destination warehouse_type (FACTORY) → fail closed (identity)');
eq(DEMO4A_buildPlan_(mastersWH({ noLocJoin: true })).reason, 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'J6/V3G. warehouse identity+address exist but no logistics join AND no reviewed coordinate → fail closed on the COORDINATE');

section('V3F-F. warehouse-location authority diagnostic');
var dxWH = DEMO4A_diagnoseWarehouseLocationAuthority_(mastersWH().warehouses, mastersWH().locations);
eq(dxWH.verdict, 'WAREHOUSE_LOCATION_AUTHORITY_READY', 'F. coherent joined FBAs with coords → WAREHOUSE_LOCATION_AUTHORITY_READY');
eq(dxWH.warehouse_coordinate_fields_found, [], 'F. warehouses carry NO coordinate fields (business authority only)');
eq(dxWH.production_map_warehouse_coordinate_fallback_source_proven, false, 'F/D. branch-2 production warehouse-coordinate fallback is NOT source-proven');
ok(dxWH.warehouse_id_join.joined_ok === 3 && dxWH.warehouse_id_join.missing_joins === 0 && dxWH.warehouse_id_join.conflicting_joins === 0, 'F. join counts (3 joined, 0 missing, 0 conflicting)');
ok(dxWH.joined_rows_valid_coordinate === 3 && dxWH.joined_rows_blank_coordinate === 0, 'F. joined coordinate counts');
ok(dxWH.safe_examples.length <= 5 && dxWH.safe_examples.every(function (e) { return /^[0-9a-f]{8}$/.test(e.warehouse_fp); }), 'F. ≤5 fingerprinted examples (no full row dump)');
eq(DEMO4A_diagnoseWarehouseLocationAuthority_(mastersWH({ fbaBlank: true }).warehouses, mastersWH({ fbaBlank: true }).locations).verdict, 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING', 'F. joined FBAs with blank coords → WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING');
eq(DEMO4A_diagnoseWarehouseLocationAuthority_([], []).verdict, 'WAREHOUSE_SCHEMA_AUTHORITY_UNRESOLVED', 'F. no warehouses → WAREHOUSE_SCHEMA_AUTHORITY_UNRESOLVED');
var dxConf = DEMO4A_diagnoseWarehouseLocationAuthority_(mastersWH().warehouses, mastersWH().locations.concat([locWH('LOC-DUP2', 'WH-KM-US-FBA-W', 'US', 'US West', 35, -119, 'warehouse')]));
eq(dxConf.verdict, 'WAREHOUSE_LOCATION_JOIN_CONFLICT', 'F. a duplicate join → WAREHOUSE_LOCATION_JOIN_CONFLICT');

section('V3F-G. PREFLIGHT-style warehouse gates');
var gatesReady = DEMO4A_warehouseGates_(true, planWH.destination_authority, null, true);
ok(gatesReady.applicable && gatesReady.warehouse_business_identity_ready && gatesReady.warehouse_address_authority_ready && gatesReady.warehouse_location_lineage_ready && gatesReady.destination_display_coordinate_ready && gatesReady.map_consumes_destination_coordinate && gatesReady.status_truthfulness_ready && gatesReady.route_geography_ready && gatesReady.ok, 'G/V3G. all SEVEN warehouse gates pass on a READY plan');
eq(DEMO4A_warehouseGates_(false, {}, null).applicable, false, 'G. gates not applicable when warehouses master absent (legacy logistics-only binding)');

section('V3F-J12/J13/J14. protections + write-boundary + constants intact');
ok(new RegExp("getSheetByName\\('warehouses'\\)\\.(appendRow|deleteRow|setValue)").test(G) === false, 'J13. the seed never writes/deletes the warehouses master (read-only)');
var commitFnWH = extractFn(G, 'TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED');
ok(/setProperty\(DEMO4A_JOURNAL_KEY_/.test(commitFnWH) && /COMMIT_FAILED_JOURNAL_UNVERIFIED/.test(commitFnWH) && /DEMO4A_rollbackInserted_\(inserted\)/.test(commitFnWH) && !/COMMITTED_UNVERIFIED/.test(commitFnWH), 'J12. V3A durable journal + inserted-only rollback intact; no COMMITTED_UNVERIFIED');
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'J14. both confirmation constants remain placeholders');

// ============================================================ V3G — ADDRESS-AUTHORITY DESTINATION COORDINATE DERIVATION
// warehouse ADDRESS (not master lat/lng) is the destination business authority; a Demo-only, source-bound, address-
// fingerprint-matched coordinate is DERIVED for display; blank master coordinates never invalidate the warehouse identity.
// A reviewed-coordinate authority injected via masters.destCoordAuthority (ships EMPTY in source).
function mastersWHderived(over) {
  over = over || {};
  var m = mastersWH({ fbaBlank: true });   // exact joins present but BLANK master coords + addresses present → derived path
  var coords = { 'WH-KM-US-FBA-W': [34.05, -118.25], 'WH-KM-US-FBA-C': [41.85, -87.65], 'WH-KM-US-FBA-E': [40.72, -74.17] };
  var auth = {};
  m.warehouses.forEach(function (w) { var fp = DEMO4A_normalizeWhAddress_(w).fingerprint; var c = coords[w.warehouse_code];
    auth[w.warehouse_code] = { latitude: c[0], longitude: c[1], source_type: 'reviewed_address_resolution', source_reference: 'DEMO-REVIEW://' + w.warehouse_code, accuracy: over.badAccuracy ? 'city' : 'rooftop', address_fingerprint: over.staleFp ? 'deadbeef' : fp, review_version: 'v1' }; });
  m.destCoordAuthority = auth;
  return m;
}

section('V3G-J1/J2. warehouse ADDRESS is the destination authority; blank master coordinate keeps identity');
var whA = wh('WH-KM-US-FBA-W', 'FBA', 'KM', 'US', 'US West');
eq(DEMO4A_addressAuthority_(whA, tplWH('RT-W', 'US West', 'WH-KM-US-FBA-W')).status, 'ADDRESS_AUTHORITY_READY', 'J1. a complete warehouse address → ADDRESS_AUTHORITY_READY (business identity is address-based)');
var rBlankId = DEMO4A_resolveWarehouseDestination_(whA, mastersWH({ fbaBlank: true }).locations, {}, tplWH('RT-W', 'US West', 'WH-KM-US-FBA-W'));
ok(rBlankId.identity_ready === true && rBlankId.branch === 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING', 'J2. a blank master coordinate does NOT invalidate the warehouse identity (identity ready, coordinate pending)');

section('V3G-J3/J4. an exact-address-derived, source-bound coordinate renders the Demo destination (Demo-only)');
var rDeriv = DEMO4A_resolveWarehouseDestination_(whA, mastersWH({ fbaBlank: true }).locations, mastersWHderived().destCoordAuthority, tplWH('RT-W', 'US West', 'WH-KM-US-FBA-W'));
eq(rDeriv.branch, 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE', 'J3. blank master coord + a reviewed address-fingerprint-matched coordinate → DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE');
ok(rDeriv.renderable === true && rDeriv.received_allowed === true && DEMO4A_validCoord_(rDeriv.latitude, rDeriv.longitude), 'J3. the derived branch is renderable + received-allowed + carries a valid coordinate');
ok(rDeriv.coordinate_source === 'demo_address_derived' && /^DEMO-REVIEW:/.test(rDeriv.coordinate_source_reference) && rDeriv.coordinate_accuracy === 'rooftop', 'J4. the derived coordinate is Demo-only + source-referenced + facility-grade accuracy');
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length, 0, 'J4. the source-shipped coordinate authority is EMPTY (operator pastes reviewed coordinates in a separate armed task)');

section('V3G-J3/J10. buildPlan on the address-derived path — READY, both ids + source bound');
var planD = DEMO4A_buildPlan_(mastersWHderived());
ok(planD.ok, 'J3. plan builds when every destination resolves an address-derived display coordinate');
var itD = planD.per_shipment.filter(function (s) { return s.slot === 'in_transit'; })[0];
eq(itD.destination_coordinate_branch, 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE', 'J3. in-transit destination branch = address-derived');
ok(/^WH-KM-US-FBA-/.test(itD.destination_warehouse_id) && itD.destination_warehouse_code === itD.destination_warehouse_id && /^LOC-WH-KM-US-FBA-/.test(itD.destination_logistics_location_id), 'J3. warehouse identity + exact logistics lineage both preserved on the derived destination');
ok(itD.destination_coordinate_source === 'demo_address_derived' && /^DEMO-REVIEW:/.test(itD.destination_coordinate_source_reference) && itD.destination_coordinate_accuracy === 'rooftop', 'J4. per-shipment carries the derived coordinate source_reference + accuracy');

section('V3G-J6. a seaport stays a gateway and is NEVER relabelled the FBA (derived plan)');
ok((itD.binding_evidence.current.canon_location_type === 'port' || itD.binding_evidence.current.location_type === 'port') && ['fulfillment_center', 'warehouse'].indexOf(itD.binding_evidence.destination.location_type) !== -1 && itD.binding_evidence.destination.binding_type === 'WAREHOUSE_LOCATION_BINDING', 'J6. current marker = seaport gateway; final destination = the FBA facility (distinct)');

section('V3G-J9. an in-transit destination node carries the facility coordinate but NO future event');
var itShip = itD.shipment_id;
var itRoutes = planD.tables.shipment_routes.filter(function (r) { return r.shipment_id === itShip; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); });
var itDestRow = itRoutes[itRoutes.length - 1];
ok(DEMO4A_low_(itDestRow.status) === 'planned' && DEMO4A_validCoord_(itDestRow.latitude, itDestRow.longitude), 'J9. the in-transit destination route row is planned yet carries the address-derived facility coordinate');
ok(planD.tables.shipment_events.filter(function (e) { return e.shipment_id === itShip && e.shipment_route_id === itDestRow.shipment_route_id; }).length === 0, 'J9. NO event is recorded on the future (planned) destination node');

section('V3G-J10. a received shipment ends at the selected warehouse (derived coordinate + note)');
var delivD = planD.per_shipment.filter(function (s) { return s.slot === 'delivered'; })[0];
var recvD = planD.tables.shipment_events.filter(function (e) { return e.shipment_id === delivD.shipment_id && DEMO4A_low_(e.event_type) === 'received'; });
var delivRoutes = planD.tables.shipment_routes.filter(function (r) { return r.shipment_id === delivD.shipment_id; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); });
var delivDest = delivRoutes[delivRoutes.length - 1];
ok(recvD.length === 1 && recvD[0].shipment_route_id === delivDest.shipment_route_id && DEMO4A_validCoord_(recvD[0].latitude, recvD[0].longitude), 'J10. the received event is on the destination route row with the derived facility coordinate');
ok(/ADDRESS-DERIVED-DESTINATION-COORDINATE/.test(recvD[0].note), 'J10. the received event note identifies the Demo address-derived coordinate');

section('V3G-J5. the seed never writes the warehouses OR logistics_locations masters (read-only)');
ok(new RegExp("getSheetByName\\('warehouses'\\)\\.(appendRow|deleteRow|setValue)").test(G) === false && new RegExp("getSheetByName\\('logistics_locations'\\)\\.(appendRow|deleteRow|setValue)").test(G) === false, 'J5. no master write to warehouses / logistics_locations');

section('V3G-J7. an incomplete address fails closed (identity)');
eq(DEMO4A_addressAuthority_(wh('WH-X', 'FBA', 'KM', 'US', 'US West', { noAddress: true })).status, 'ADDRESS_INCOMPLETE', 'J7. a blank address_line1 → ADDRESS_INCOMPLETE');
eq(DEMO4A_addressAuthority_(wh('WH-X', 'FBA', 'KM', 'US', 'US West', { noPostal: true })).status, 'ADDRESS_INCOMPLETE', 'J7. a US warehouse missing postal_code → ADDRESS_INCOMPLETE');
(function () { var m = mastersWHderived(); m.warehouses = m.warehouses.map(function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (c.warehouse_id === 'WH-KM-US-FBA-C') c.address = ''; return c; }); eq(DEMO4A_buildPlan_(m).reason, 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', 'J7. an address-incomplete destination warehouse → build fails closed on identity'); })();

section('V3G-J8. an ambiguous / unverified / non-facility coordinate fails closed');
var na = DEMO4A_normalizeWhAddress_(whA);
eq(DEMO4A_deriveDestCoordinate_(whA, { 'WH-KM-US-FBA-W': { latitude: 34, longitude: -118, accuracy: 'city', source_reference: 'x', address_fingerprint: na.fingerprint } }, na.fingerprint).reason, 'ACCURACY_NOT_FACILITY_GRADE:city', 'J8. a city/ZIP-centroid accuracy is rejected (facility-grade required)');
eq(DEMO4A_deriveDestCoordinate_(whA, { 'WH-KM-US-FBA-W': { latitude: 34, longitude: -118, accuracy: 'rooftop', source_reference: 'x', address_fingerprint: 'deadbeef' } }, na.fingerprint).reason, 'ADDRESS_FINGERPRINT_STALE', 'J8. a coordinate bound to a stale address fingerprint is rejected');
ok(DEMO4A_buildPlan_(mastersWHderived({ staleFp: true })).reason === 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'J8. a stale-fingerprint authority → build fails closed on the coordinate');
ok(DEMO4A_buildPlan_(mastersWHderived({ badAccuracy: true })).reason === 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'J8. a non-facility-grade accuracy → build fails closed on the coordinate');
eq(DEMO4A_resolveWarehouseDestination_(whA, mastersWH().locations.concat([locWH('LOC-DUP3', 'WH-KM-US-FBA-W', 'US', 'US West', 35, -119, 'warehouse')]), mastersWHderived().destCoordAuthority, tplWH('RT-W', 'US West', 'WH-KM-US-FBA-W')).branch, 'WAREHOUSE_LOCATION_JOIN_CONFLICT', 'J8. >1 eligible logistics join is ambiguous → fail closed (even with a reviewed coordinate)');

section('V3G-J11. record_status detection is truthful; a dead record_status is ineligible');
var dxRS = DEMO4A_diagnoseWarehouseLocationAuthority_(mastersWHderived().warehouses, mastersWHderived().locations.map(function (l) { var c = {}; for (var k in l) c[k] = l[k]; c.record_status = 'active'; return c; }), mastersWHderived().destCoordAuthority);
ok(dxRS.record_status_column_present === true && typeof dxRS.record_status_counts === 'object', 'J11. when a record_status column is present the diagnostic reports it (never asserts absence)');
ok(DEMO4A_locVerificationEligible_({ is_active: 'TRUE', verification_status: 'verified', record_status: 'deleted' }) === false && DEMO4A_locVerificationEligible_({ is_active: 'TRUE', verification_status: 'verified', record_status: 'active' }) === true, 'J11. a dead record_status excludes the row; a live one stays eligible');
ok(DEMO4A_locVerificationEligible_({ is_active: 'TRUE', verification_status: 'ADDRESS_SEEDED_COORDINATES_PENDING' }) === true, 'J11/J2. a coordinate-pending verification_status is still eligible (blank coord never kills identity)');

section('V3G-J12. fulfillment_center / third_party_warehouse tokens are recognized (never UNKNOWN)');
eq([DEMO4A_canonLocType_('fulfillment_center'), DEMO4A_canonLocType_('third_party_warehouse'), DEMO4A_canonLocType_('3pl')], ['fulfillment_center', 'warehouse', 'warehouse'], 'J12. warehouse-backed raw location_type tokens map to a recognized canonical type');
ok(dxRS.warehouse_backed_raw_location_type_audit.some(function (t) { return t.raw_token === 'fulfillment_center' && t.recognized === true; }), 'J12. the raw-type audit runs BEFORE coordinate filtering and marks fulfillment_center recognized');

section('V3G-J13. the checksum changes if the address, the coordinate, or the source reference changes');
var ckBase = planD.checksum;
(function () { var m = mastersWHderived(); m.warehouses = m.warehouses.map(function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (c.warehouse_id === 'WH-KM-US-FBA-C') c.address = c.address + ' STE 200'; return c; }); m.destCoordAuthority = {}; m.warehouses.forEach(function (w) { var fp = DEMO4A_normalizeWhAddress_(w).fingerprint; var co = { 'WH-KM-US-FBA-W': [34.05, -118.25], 'WH-KM-US-FBA-C': [41.85, -87.65], 'WH-KM-US-FBA-E': [40.72, -74.17] }[w.warehouse_code]; m.destCoordAuthority[w.warehouse_code] = { latitude: co[0], longitude: co[1], source_type: 'reviewed_address_resolution', source_reference: 'DEMO-REVIEW://' + w.warehouse_code, accuracy: 'rooftop', address_fingerprint: fp, review_version: 'v1' }; }); var p = DEMO4A_buildPlan_(m); ok(p.ok && p.checksum !== ckBase, 'J13. changing a warehouse address re-checksums (address fingerprint is bound)'); })();
(function () { var m = mastersWHderived(); m.destCoordAuthority['WH-KM-US-FBA-C'].latitude = 42.0; var p = DEMO4A_buildPlan_(m); ok(p.ok && p.checksum !== ckBase, 'J13. changing the derived coordinate re-checksums'); })();
(function () { var m = mastersWHderived(); m.destCoordAuthority['WH-KM-US-FBA-C'].source_reference = 'DEMO-REVIEW://OTHER'; var p = DEMO4A_buildPlan_(m); ok(p.ok && p.checksum !== ckBase, 'J13. changing the coordinate source reference re-checksums'); })();

section('V3G-J14/J15. V3A protections + confirmation constants remain intact');
ok(/setProperty\(DEMO4A_JOURNAL_KEY_/.test(commitFnWH) && /DEMO4A_rollbackInserted_\(inserted\)/.test(commitFnWH) && !/COMMITTED_UNVERIFIED/.test(commitFnWH), 'J14. durable journal + inserted-only rollback intact; no COMMITTED_UNVERIFIED');
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'J15. both confirmation constants remain placeholders');

section('V3G-J3. LIVE VALIDATE proves the derived destination authority end-to-end');
(function () { var live = liveFromPlan(planD); var v = DEMO4A_validateLiveRows_(planD, live, mastersWHderived()); ok(v.checks.live_destination_authority.ok && v.checks.live_bound_coord_equals_master.ok && v.checks.live_event_coord_equals_route.ok, 'J3/J10. VALIDATE confirms the derived destination coordinate, lineage, and received-at-warehouse over live rows'); })();

section('V3G-J16. legacy (no-warehouse) plans are byte-identical (address authority is additive, gated on warehouses)');
eq(DEMO4A_buildPlan_(mastersV3C()).checksum, planC.checksum, 'J16. a plan with no warehouses master is unchanged (V3G activates only when warehouses are present)');
eq(DEMO4A_buildPlan_(mastersFull()).ok, true, 'J16. the base full-master plan still builds (no regression)');

done();
