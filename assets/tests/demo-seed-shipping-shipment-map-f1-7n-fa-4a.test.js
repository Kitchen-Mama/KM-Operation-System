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
  'DEMO4A_RECORD_STATUS_DEAD_', 'DEMO4A_VS_COORDINATE_PENDING_', 'DEMO4A_POSTAL_REQUIRED_', 'DEMO4A_COORD_ACCURACY_FACILITY_', 'DEMO4A_COORD_COUNTRY_BOUNDS_', 'DEMO4A_GATEWAY_CENTROID_TYPES_', 'DEMO4A_DEST_READY_BRANCHES_', 'DEMO4A_DEST_AUTH_REASONS_', 'DEMO4A_AUTHORIZATION_CONTRACT_VERSION_', 'DEMO4A_AUTH_MAX_REASON_CODES_', 'DEMO4A_CANON_CONTRACT_VERSION_', 'DEMO4A_CANON_TZ_OFFSET_MIN_', 'DEMO4A_FIELD_CLASSES_', 'DEMO4A_BOOL_TRUE_', 'DEMO4A_BOOL_FALSE_', 'DEMO4A_DRIFT_MAX_EXAMPLES_', 'DEMO4A_DRIFT_MAX_VALUE_LEN_'].forEach(function (n) { LOAD.push(G.match(new RegExp('var ' + n + ' = [^\\n]*;'))[0]); });
LOAD.push(G.match(/var DEMO4A_MAP_DEST_COORD_CONSUMPTION_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_COORD_ACCURACY_CANON_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_FIELD_CLASS_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_DEST_COORD_AUTHORITY_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_DEST_COORD_PROPOSAL_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_REQUIRED_COLS_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_EXTERNAL_REF_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_SHIP_LIFECYCLE_ = \[[\s\S]*?\n\];/)[0]);
LOAD.push(G.match(/var DEMO4A_LOC_TYPE_CANON_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G.match(/var DEMO4A_LOC_TYPE_ENUM_ = \{[\s\S]*?\};/)[0]);
LOAD.push(G.match(/var DEMO4A_WH_DEST_TYPES_ = \{[\s\S]*?\};/)[0]);
['DEMO4A_str_', 'DEMO4A_low_', 'DEMO4A_num_', 'DEMO4A_truthy_', 'DEMO4A_hash_', 'DEMO4A_z2_', 'DEMO4A_addDays_', 'DEMO4A_isDemo_', 'DEMO4A_get_',
  'DEMO4A_canonDateOnly_', 'DEMO4A_canonDateTime_', 'DEMO4A_fieldKind_', 'DEMO4A_fieldClassKnown_', 'DEMO4A_fieldClass_', 'DEMO4A_isBlankCell_', 'DEMO4A_isDateObj_', 'DEMO4A_dateWallParts_', 'DEMO4A_canonField_', 'DEMO4A_setCanonTzOffsetMin_', 'DEMO4A_driftReasonCode_', 'DEMO4A_rawType_', 'DEMO4A_canon_', 'DEMO4A_rowChecksum_', 'DEMO4A_mismatchedFields_',
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
  'DEMO4A_whCode_', 'DEMO4A_whReceivingEnabled_', 'DEMO4A_whColPresent_', 'DEMO4A_whAddrLine1_', 'DEMO4A_whAddrLine2_', 'DEMO4A_whCity_', 'DEMO4A_whSubdivision_', 'DEMO4A_whStateSub_', 'DEMO4A_whAddrFlatLegacyPresent_', 'DEMO4A_whPostal_', 'DEMO4A_postalRequired_', 'DEMO4A_normAddrPart_', 'DEMO4A_normalizeWhAddress_', 'DEMO4A_addressAuthority_', 'DEMO4A_deriveDestCoordinate_', 'DEMO4A_pickWarehouseForRegion_',
  'DEMO4A_destCandidateEligible_', 'DEMO4A_selectDestCandidatesByRegion_', 'DEMO4A_diagnoseDestCandidates_', 'DEMO4A_proposalToAuthority_', 'DEMO4A_coordAuthorityArmed_', 'DEMO4A_coordAccuracyFacility_', 'DEMO4A_coordInBounds_', 'DEMO4A_gatewayCoordMatch_', 'DEMO4A_preflightFailureReason_', 'DEMO4A_mapDestinationEndpointSource_', 'DEMO4A_destAuthorityForTemplate_', 'DEMO4A_destAuthorityReason_', 'DEMO4A_warehouseDestBinding_', 'DEMO4A_preflightVerdict_', 'DEMO4A_authorizationSummary_', 'DEMO4A_rowForHeaders_', 'DEMO4A_writerProjectionGaps_', 'DEMO4A_driftClip_', 'DEMO4A_driftEvidence_', 'DEMO4A_canonDiagnosticCore_', 'DEMO4A_validateCoordProposal_', 'DEMO4A_mapDestinationDisplayStatus_'].forEach(function (n) { LOAD.push(extractFn(G, n)); });
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
ok(/var lock = null, inserted = null, phase = 'pre_insert', driftEvidence = null;/.test(commitFn), 'V3A-2/3/V3G5. inserted + phase + driftEvidence are OUTER-scope so the outer catch can roll back after any post-insert exception AND attach the drift forensics');
ok(/phase = 'postcheck';[\s\S]*?if \(post\.classification !== 'PRESENT_EXACT_ALL'\) \{[\s\S]*?driftEvidence = DEMO4A_driftEvidence_\(post\);[\s\S]*?throw new Error\('POSTCHECK_NOT_EXACT:'/.test(commitFn), 'V3A-1/V3G5(C). a non-PRESENT_EXACT_ALL post-check captures compact drift evidence and STILL THROWS into the rollback path (never COMMITTED_UNVERIFIED)');
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
ok(/if \(post\.classification !== 'PRESENT_EXACT_ALL'\) \{[\s\S]*?\}[\s\S]*?out\.verdict = 'COMMITTED'/.test(commitFn), 'V3A-10. exact post-check → COMMITTED');
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
// V3G1 — warehouses carry the LIVE address shape: address_line1/address_line2/city/state/subdivision_code/postal_code/
// country, PLUS a legacy flat `address` column that MUST be ignored when address_line1 is present. `over` blanks a field.
var WH_ADDR_ = { 'US West': { city: 'Los Angeles', state: 'CA', postal_code: '90001' }, 'US Central': { city: 'Chicago', state: 'IL', postal_code: '60601' }, 'US East': { city: 'Newark', state: 'NJ', postal_code: '07101' } };
function wh(id, type, company, country, region, over) { over = over || {}; var a = WH_ADDR_[region] || { city: 'Demo City', state: 'NA', postal_code: '00000' };
  return { warehouse_id: id, warehouse_code: id, warehouse_name: id + ' Facility', warehouse_type: type, company: company, country: country, marketplace: 'Amazon', logistics_region: region, is_active: 'TRUE', is_receiving_enabled: 'TRUE',
    address_line1: over.noAddress ? '' : ('100 Demo Fulfillment Way ' + id), address_line2: over.line2 || '', address: 'LEGACY-FLAT-SHOULD-BE-IGNORED ' + id,
    city: over.noCity ? '' : a.city, state: a.state, subdivision_code: a.state, postal_code: over.noPostal ? '' : a.postal_code }; }
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
// V3G3 — the real DEMO4A_DEST_COORD_AUTHORITY_ is now ARMED, so a fixture that means to exercise the UNARMED path must
// pass an explicitly EMPTY authority ({} is truthy, so it overrides the global constant without arming anything).
function mastersUnarmed(over) { var m = mastersWH(over); m.destCoordAuthority = {}; return m; }
var planPend = DEMO4A_buildPlan_(mastersUnarmed({ fbaBlank: true }));
// V3G — identity is ADDRESS-ready, but with NO reviewed coordinate and NO valid logistics coordinate the DISPLAY coordinate
// is unresolved → fail closed as DESTINATION_ADDRESS_COORDINATE_UNRESOLVED (never a fabricated coordinate).
// V3G1(F) — with the coordinate authority EMPTY (not armed), the failure is the not-armed authority, not a misleading count.
eq([planPend.ok, planPend.reason], [false, 'DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED'], 'J11/V3G1. all-blank-coordinate FBAs + empty authority → DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED (identity stays ready)');
ok(planPend.destination_authority_errors.some(function (e) { return e.branch === 'WAREHOUSE_IDENTITY_READY_COORDINATE_PENDING'; }) && !planPend.tables, 'J11. pending branch reported + NO rows built (no received event anywhere)');
eq(DEMO4A_buildPlan_(mastersWH({ mismatchCompany: true })).reason, 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', 'J8. warehouse company ≠ plan scope → fail closed (identity)');
eq(DEMO4A_buildPlan_(mastersWH({ badType: true })).reason, 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', 'J8. a non-destination warehouse_type (FACTORY) → fail closed (identity)');
eq(DEMO4A_buildPlan_(mastersUnarmed({ noLocJoin: true })).reason, 'DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED', 'J6/V3G1. identity+address exist, no logistics join, empty authority → NOT_ARMED');

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
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).sort().join(','), 'ABE2,AUS2,BFI4', 'J4/V3G3. the coordinate authority is armed with EXACTLY the three USER-APPROVED entries (no fourth entry)');
ok(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).every(function (k) { var e = DEMO4A_DEST_COORD_AUTHORITY_[k]; return DEMO4A_low_(e.review_status) === 'user_approved' && DEMO4A_str_(e.approved_by) === 'USER_APPROVED' && DEMO4A_str_(e.approved_at) === '2026-08-24' && DEMO4A_str_(e.review_version) === 'V3G3-USER-APPROVED-1'; }), 'J4/V3G3. every armed entry carries review_status user_approved + a truthful USER_APPROVED approver + a FROZEN approval date/version (no runtime timestamp)');

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
(function () { var m = mastersWHderived(); m.warehouses = m.warehouses.map(function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (c.warehouse_id === 'WH-KM-US-FBA-C') c.address_line1 = ''; return c; }); eq(DEMO4A_buildPlan_(m).reason, 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', 'J7. an address-incomplete (blank address_line1) destination warehouse → build fails closed on identity'); })();

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
(function () { var m = mastersWHderived(); m.warehouses = m.warehouses.map(function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (c.warehouse_id === 'WH-KM-US-FBA-C') c.address_line1 = c.address_line1 + ' STE 200'; return c; }); m.destCoordAuthority = {}; m.warehouses.forEach(function (w) { var fp = DEMO4A_normalizeWhAddress_(w).fingerprint; var co = { 'WH-KM-US-FBA-W': [34.05, -118.25], 'WH-KM-US-FBA-C': [41.85, -87.65], 'WH-KM-US-FBA-E': [40.72, -74.17] }[w.warehouse_code]; m.destCoordAuthority[w.warehouse_code] = { latitude: co[0], longitude: co[1], source_type: 'reviewed_address_resolution', source_reference: 'DEMO-REVIEW://' + w.warehouse_code, accuracy: 'rooftop', address_fingerprint: fp, review_version: 'v1' }; }); var p = DEMO4A_buildPlan_(m); ok(p.ok && p.checksum !== ckBase, 'J13. changing a warehouse address_line1 re-checksums (address fingerprint is bound)'); })();
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

// ============================================================ V3G1 — LIVE ADDRESS + COORDINATE AUTHORITY CLOSURE
// live warehouses expose address_line1/address_line2/subdivision_code (runtime authority); exact three-region candidate
// diagnostic; source-reviewed coordinate PROPOSAL distinct from AUTHORIZATION; proposal validator; map-display truth; NOT_ARMED.
function propFor(masters, over) {
  over = over || {};
  var coords = { 'WH-KM-US-FBA-W': [34.05, -118.25], 'WH-KM-US-FBA-C': [41.85, -87.65], 'WH-KM-US-FBA-E': [40.72, -74.17] };
  var p = {};
  masters.warehouses.forEach(function (w) { var loc = DEMO4A_locsForWarehouse_(masters.locations, w.warehouse_id)[0]; var c = coords[w.warehouse_code] || [10, 10];
    p[w.warehouse_code] = { warehouse_id: w.warehouse_id, warehouse_code: w.warehouse_code, logistics_location_id: loc ? DEMO4A_locId_(loc) : '', address_fingerprint: over.staleFp ? 'deadbeef' : DEMO4A_normalizeWhAddress_(w).fingerprint, latitude: over.dup ? 34.05 : c[0], longitude: over.dup ? -118.25 : c[1], coordinate_accuracy: over.badAcc ? 'city' : 'rooftop', coordinate_source_type: 'reviewed_address_resolution', coordinate_source_reference: over.noSrc ? '' : ('DEMO-REVIEW://' + w.warehouse_code), reviewed_at: '2026-08-24', reviewed_by: 'ops', review_status: over.approved ? 'user_approved' : 'proposed' }; });
  // an AIRPORT/SEAPORT gateway coordinate (the live US West port TR-1) laundered in as the "facility" coordinate.
  if (over.gateway && p['WH-KM-US-FBA-W']) { p['WH-KM-US-FBA-W'].latitude = 37.7; p['WH-KM-US-FBA-W'].longitude = -122.4; }
  // a coordinate outside the live warehouse's country (Shanghai) presented for a US facility.
  if (over.outOfCountry && p['WH-KM-US-FBA-W']) { p['WH-KM-US-FBA-W'].latitude = 31; p['WH-KM-US-FBA-W'].longitude = 121; }
  if (over.wrongCountryDecl && p['WH-KM-US-FBA-W']) p['WH-KM-US-FBA-W'].country = 'CN';
  return p;
}

section('V3G1-A/G1/G2. live address_line1/address_line2 precedence; legacy flat fallback only when live columns absent');
ok(DEMO4A_whAddrLine1_(wh('WH-X', 'FBA', 'KM', 'US', 'US West')) === '100 Demo Fulfillment Way WH-X', 'G1. live address_line1 wins over the legacy flat `address` column');
ok(DEMO4A_whAddrLine1_({ address: '500 Legacy Rd', city: 'X' }) === '500 Legacy Rd' && DEMO4A_whAddrFlatLegacyPresent_({ address: '500 Legacy Rd' }) === true, 'G2. legacy flat `address` is used ONLY when live line1 columns are absent');
eq(DEMO4A_whAddrLine1_({ address_line1: '', address: '500 Legacy Rd' }), '', 'A5/G2. a BLANK live address_line1 is never silently replaced by the flat `address` (live column wins even blank)');

section('V3G1-B/G3/G4. exact three-region candidate selection + actual reviewable rows exposed');
var selC = DEMO4A_selectDestCandidatesByRegion_(mastersWH().warehouses, mastersWH().locations);
ok(selC.US_WEST && selC.US_CENTRAL && selC.US_EAST && selC.US_WEST.w.warehouse_id === 'WH-KM-US-FBA-W' && selC.US_EAST.w.warehouse_id === 'WH-KM-US-FBA-E', 'G3. exactly one deterministic eligible FBA warehouse per US West/Central/East');
var dxC = DEMO4A_diagnoseDestCandidates_(mastersWH().warehouses, mastersWH().locations, DEMO4A_DEST_COORD_AUTHORITY_);
eq(dxC.verdict, 'THREE_REGION_DESTINATION_CANDIDATES_SELECTED', 'G3. candidate diagnostic selects three regions');
eq(dxC.spec_vs_live_warehouse_address_schema, 'SPEC_VS_LIVE_WAREHOUSE_ADDRESS_SCHEMA_DIVERGENCE', 'A/G4. live line1 + legacy flat both present → divergence reported');
ok(dxC.selected_destination_warehouses.length === 3 && dxC.selected_destination_warehouses.every(function (r) { return r.selected && /^WH-KM-US-FBA-/.test(r.warehouse_id) && r.address_line1 && r.city && r.normalized_address && /^[0-9a-f]{8}$/.test(r.address_fingerprint) && /^LOC-WH-KM-US-FBA-/.test(r.logistics_location_id); }), 'G4. the three selected rows expose ACTUAL warehouse ids + addresses + fingerprints (not fingerprinted/hidden)');
ok(dxC.selected_destination_warehouses.every(function (r) { return r.coordinate_authority_status === 'COORDINATE_AUTHORITY_NOT_ARMED'; }), 'G4. with the authority empty each candidate reports COORDINATE_AUTHORITY_NOT_ARMED');
ok(DEMO4A_selectDestCandidatesByRegion_(mastersWH().warehouses.map(function (w) { var c = {}; for (var k in w) c[k] = w[k]; c.marketplace = 'Walmart'; return c; }), mastersWH().locations).US_WEST === null, 'G3. a non-Amazon marketplace is ineligible');

section('V3G1-C/G5/G6. the proposal is NOT authorization and cannot arm itself');
eq(Object.keys(DEMO4A_DEST_COORD_PROPOSAL_).length, 3, 'G5/V3G2. the proposal constant now holds the THREE user-reviewed entries (still not an authorization)');
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).sort().join(','), 'ABE2,AUS2,BFI4', 'G5/V3G3. the authorization constant now holds EXACTLY the three USER-APPROVED entries (still a distinct constant from the proposal)');
eq(Object.keys(DEMO4A_proposalToAuthority_(propFor(mastersWH({ fbaBlank: true })))).length, 0, 'G6. a merely-proposed (not user_approved) proposal converts to ZERO authorization entries');
ok(Object.keys(DEMO4A_proposalToAuthority_(propFor(mastersWH({ fbaBlank: true }), { approved: true }))).length === 3 && Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).sort().join(',') === 'ABE2,AUS2,BFI4', 'G6. only a USER-approved proposal converts, and the conversion NEVER mutates the live authority constant');

section('V3G1-D/G7/G8/G9. proposal validator — fingerprint drift / non-facility accuracy / exact facility');
var mBlank = mastersWH({ fbaBlank: true });
eq(DEMO4A_validateCoordProposal_(propFor(mBlank, { approved: true }), mBlank.warehouses, mBlank.locations).verdict, 'THREE_REGION_COORDINATE_PROPOSAL_READY', 'G9. an exact facility-grade, fingerprint-matched, distinct-coordinate proposal → READY');
eq(DEMO4A_validateCoordProposal_(propFor(mBlank, { staleFp: true }), mBlank.warehouses, mBlank.locations).verdict, 'COORDINATE_PROPOSAL_STALE', 'G7. an address-fingerprint drift → COORDINATE_PROPOSAL_STALE');
eq(DEMO4A_validateCoordProposal_(propFor(mBlank, { badAcc: true }), mBlank.warehouses, mBlank.locations).verdict, 'COORDINATE_PROPOSAL_UNVERIFIED', 'G8. a city/ZIP-centroid (non-facility) accuracy → UNVERIFIED');
ok(DEMO4A_validateCoordProposal_(propFor(mBlank, { dup: true }), mBlank.warehouses, mBlank.locations).per_region.some(function (r) { return r.status === 'DUPLICATE_COORDINATE_ACROSS_FACILITIES'; }), 'G8. a duplicated coordinate across facilities is refused');
eq(DEMO4A_validateCoordProposal_({}, mBlank.warehouses, mBlank.locations).verdict, 'COORDINATE_PROPOSAL_INCOMPLETE', 'G7. an empty proposal → COORDINATE_PROPOSAL_INCOMPLETE');
// G8 — an airport/seaport gateway coordinate and an out-of-country coordinate are structurally refused (not only by accuracy).
(function () { var v = DEMO4A_validateCoordProposal_(propFor(mBlank, { gateway: true }), mBlank.warehouses, mBlank.locations);
  var w = v.per_region.filter(function (r) { return r.region === 'US_WEST'; })[0];
  ok(v.verdict === 'COORDINATE_PROPOSAL_UNVERIFIED' && w.status === 'GATEWAY_OR_CENTROID_COORDINATE_SUBSTITUTION' && w.gateway_or_centroid_coordinate === 'port:TR-1', 'G8. a live SEAPORT gateway coordinate presented as the facility → GATEWAY_OR_CENTROID_COORDINATE_SUBSTITUTION'); })();
ok(DEMO4A_gatewayCoordMatch_(34.05, -118.25, mBlank.locations) === '', 'G8. a real facility coordinate is NOT flagged as a gateway/centroid');
(function () { var v = DEMO4A_validateCoordProposal_(propFor(mBlank, { outOfCountry: true }), mBlank.warehouses, mBlank.locations);
  var w = v.per_region.filter(function (r) { return r.region === 'US_WEST'; })[0];
  ok(v.verdict === 'COORDINATE_PROPOSAL_UNVERIFIED' && w.status === 'COUNTRY_REGION_DISAGREEMENT' && w.country_bounds_known === true, 'G8. a coordinate outside the live warehouse country → COUNTRY_REGION_DISAGREEMENT'); })();
(function () { var v = DEMO4A_validateCoordProposal_(propFor(mBlank, { wrongCountryDecl: true }), mBlank.warehouses, mBlank.locations);
  eq(v.per_region.filter(function (r) { return r.region === 'US_WEST'; })[0].status, 'COUNTRY_REGION_DISAGREEMENT', 'G8. a declared proposal country ≠ the live warehouse country → COUNTRY_REGION_DISAGREEMENT'); })();
ok(DEMO4A_coordInBounds_(34.05, -118.25, DEMO4A_COORD_COUNTRY_BOUNDS_.us) === true && DEMO4A_coordInBounds_(31, 121, DEMO4A_COORD_COUNTRY_BOUNDS_.us) === false, 'G8. US bounding-box agreement check');
(function () { var m = mastersWH({ fbaBlank: true }); m.warehouses = m.warehouses.map(function (w) { var c = {}; for (var k in w) c[k] = w[k]; c.country = 'SG'; return c; });
  var v = DEMO4A_validateCoordProposal_(propFor(mBlank, { approved: true }), m.warehouses, m.locations);
  ok(v.per_region.every(function (r) { return r.country_bounds_known !== true; }), 'G8. an unlisted country reports country_bounds_known:false instead of asserting a false disagreement'); })();
(function () { var v = DEMO4A_validateCoordProposal_(propFor(mBlank, { approved: true }), mBlank.warehouses, mBlank.locations);
  ok(v.per_region.every(function (r) { return r.identity_match === true && r.gateway_or_centroid_coordinate === '' && r.country_region_match === true; }), 'G9. the exact facility proposal passes identity + gateway + country/region agreement'); })();

section('V3G1-F/G10. empty authority returns the typed NOT_ARMED reason; an armed authority does not');
eq(DEMO4A_buildPlan_(mastersUnarmed({ fbaBlank: true })).reason, 'DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED', 'G10. blank coords + empty authority → DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED');
// V3G3 — with the REAL authority armed, a fixture warehouse that is NOT one of the three approved codes is UNRESOLVED
// (correctly no longer NOT_ARMED): arming is a global fact, resolvability is per-warehouse.
eq(DEMO4A_buildPlan_(mastersWH({ fbaBlank: true })).reason, 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'G10/V3G3. an ARMED authority + a non-approved warehouse code → UNRESOLVED (not NOT_ARMED)');
ok(DEMO4A_buildPlan_(mastersWHderived()).ok === true, 'G10. an armed valid authority builds normally (no NOT_ARMED, no master-coordinate requirement)');
ok(DEMO4A_buildPlan_(mastersWHderived({ staleFp: true })).reason === 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'G10. an ARMED-but-stale authority → UNRESOLVED (distinct from NOT_ARMED)');
ok(DEMO4A_coordAuthorityArmed_({}) === false && DEMO4A_coordAuthorityArmed_({ X: 1 }) === true, 'F. coordinate-authority armed detection');

section('V3G1-E/G11/G12. map destination display truth + received coordinate == destination route coordinate');
eq(DEMO4A_mapDestinationDisplayStatus_('WAREHOUSE_LOCATION_COORDINATE_READY'), 'MAP_DESTINATION_DISPLAY_COMPLETE', 'G11. a master-coordinate destination is fully labelled/rendered');
eq(DEMO4A_mapDestinationDisplayStatus_('DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE'), 'MAP_DESTINATION_DISPLAY_COMPLETE', 'G11/V3G3. the address-derived destination is now a LABELLED endpoint (the V3G1 frontend blocker is closed)');
ok(DEMO4A_MAP_DEST_COORD_CONSUMPTION_.frontend_blocker === '' && DEMO4A_MAP_DEST_COORD_CONSUMPTION_.inline_route_node_coordinate_rendered === true && DEMO4A_MAP_DEST_COORD_CONSUMPTION_.dedicated_destination_endpoint_reads_proven_terminal_route_row === true, 'G11/V3G3. inline route node still renders AND the endpoint consumer now reads the proven terminal destination route row (blocker cleared)');
(function () { var deliv = planD.per_shipment.filter(function (s) { return s.slot === 'delivered'; })[0]; var rows = planD.tables.shipment_routes.filter(function (r) { return r.shipment_id === deliv.shipment_id; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); }); var dr = rows[rows.length - 1]; var rv = planD.tables.shipment_events.filter(function (e) { return e.shipment_id === deliv.shipment_id && DEMO4A_low_(e.event_type) === 'received'; })[0]; ok(rv && DEMO4A_num_(rv.latitude).toFixed(5) === DEMO4A_num_(dr.latitude).toFixed(5) && DEMO4A_num_(rv.longitude).toFixed(5) === DEMO4A_num_(dr.longitude).toFixed(5), 'G12. the received event coordinate equals the destination route-row coordinate'); })();

section('V3G1-G13/G14. masters untouched + write/authority gates safe');
ok(new RegExp("getSheetByName\\('warehouses'\\)\\.(appendRow|deleteRow|setValue)").test(G) === false && new RegExp("getSheetByName\\('logistics_locations'\\)\\.(appendRow|deleteRow|setValue)").test(G) === false, 'G13. no master write to warehouses / logistics_locations');
ok(/var DEMO4A_DEST_COORD_AUTHORITY_ = \{\r?\n/.test(G) && /var DEMO4A_DEST_COORD_PROPOSAL_ = \{\r?\n/.test(G), 'G14/V3G3. both constants are populated literals in source and remain SEPARATE (only the authority is executable)');
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'G14. both confirmation constants remain placeholders');

// ============================================================ V3G2 — THREE-REGION USER-REVIEWED COORDINATE PROPOSAL
// The proposal now carries the three real live candidates (BFI4 / AUS2 / ABE2). It stays a PROPOSAL: the authority remains
// empty, PREFLIGHT stays NOT_ARMED, and nothing converts without an explicit 'user_approved' review status.
// live-shaped fixture: the EXACT live warehouse address fields whose normalized fingerprint the proposal is bound to.
var G2_LIVE_ = {
  BFI4: { wid: 'WH-KM-US-FBA-BFI4', region: 'US West', line1: '21005 64th Ave S', city: 'Kent', state: 'Washington', sub: 'WA', zip: '98032', fp: '06a93100' },
  AUS2: { wid: 'WH-KM-US-FBA-AUS2', region: 'US Central', line1: '2000 E Pecan St', city: 'Pflugerville', state: 'Texas', sub: 'TX', zip: '78665', fp: '82165c14' },
  ABE2: { wid: 'WH-KM-US-FBA-ABE2', region: 'US East', line1: '705 Boulder Dr', city: 'Breinigsville', state: 'Pennsylvania', sub: 'PA', zip: '18031', fp: '9230a81c' }
};
function whLive(code, over) {
  over = over || {}; var L = G2_LIVE_[code];
  return { warehouse_id: L.wid, warehouse_code: code, warehouse_name: 'Amazon ' + code, warehouse_type: 'FBA', company: 'KM', country: 'US', marketplace: 'Amazon',
    logistics_region: L.region, is_active: 'TRUE', is_receiving_enabled: 'TRUE',
    address_line1: L.line1, address_line2: '', city: L.city, state: L.state, subdivision_code: L.sub, postal_code: over.zip || L.zip, country_code: '' };
}
function mastersV3G2() {
  var templates = [tplWH('RT-W', 'US West', 'WH-KM-US-FBA-BFI4'), tplWH('RT-C', 'US Central', 'WH-KM-US-FBA-AUS2'), tplWH('RT-E', 'US East', 'WH-KM-US-FBA-ABE2')];
  var nodes = [];
  ['RT-W', 'RT-E'].forEach(function (tid) { nodes.push(nAbs(tid, 1, 'origin', 'origin_departure'), nAbs(tid, 2, 'customs', 'customs_clearance'), nAbs(tid, 3, 'port', 'port_transit'), nAbs(tid, 4, 'destination', 'final_delivery')); });
  nodes.push(nAbs('RT-C', 1, 'origin', 'origin_departure'), nAbs('RT-C', 2, 'customs', 'customs_clearance'), nAbs('RT-C', 3, 'port', 'port_transit'), nAbs('RT-C', 4, 'hub', 'hub_transit'), nAbs('RT-C', 5, 'destination', 'final_delivery'));
  var locations = [
    locWH('CN-FAC-1', '', 'CN', '', 31, 121, 'factory'),
    locWH('TR-SEA', '', 'US', 'US West', 47.60, -122.33, 'port'),        // Seattle seaport gateway
    locWH('TR-AUS-AIR', '', 'US', 'US Central', 30.19, -97.67, 'airport'),   // Austin airport gateway
    locWH('TR-PHL', '', 'US', 'US East', 39.90, -75.14, 'port'),
    // live FBA logistics rows exist and join exactly, but carry BLANK coordinates (the real live condition)
    locWH('LOC-WH-KM-US-FBA-BFI4', 'WH-KM-US-FBA-BFI4', 'US', 'US West', '', '', 'fulfillment_center'),
    locWH('LOC-WH-KM-US-FBA-AUS2', 'WH-KM-US-FBA-AUS2', 'US', 'US Central', '', '', 'fulfillment_center'),
    locWH('LOC-WH-KM-US-FBA-ABE2', 'WH-KM-US-FBA-ABE2', 'US', 'US East', '', '', 'fulfillment_center')
  ];
  var warehouses = [whLive('BFI4'), whLive('AUS2'), whLive('ABE2')];
  return { templates: templates, nodes: nodes, locations: locations, warehouses: warehouses, marketplaceSkus: mastersFull().marketplaceSkus, skuDetails: mastersFull().skuDetails };
}
var mG2 = mastersV3G2();

section('V3G2-E1. exactly three proposal entries, one per region');
eq(Object.keys(DEMO4A_DEST_COORD_PROPOSAL_).sort().join(','), 'ABE2,AUS2,BFI4', 'E1. the proposal holds exactly the three reviewed warehouse codes');
eq(Object.keys(DEMO4A_DEST_COORD_PROPOSAL_).map(function (k) { return DEMO4A_DEST_COORD_PROPOSAL_[k].region; }).sort().join(','), 'US_CENTRAL,US_EAST,US_WEST', 'E1. exactly one entry per US_WEST / US_CENTRAL / US_EAST');

section('V3G2-E2/E3/E4. exact per-warehouse proposal values + exact live address fingerprint');
[['BFI4', 'US_WEST', 47.4145, -122.25778, 'BUILDING_FOOTPRINT', 'OPENSTREETMAP_BUILDING', 'https://mapcarta.com/W500861061'],
 ['AUS2', 'US_CENTRAL', 30.43255, -97.59852, 'BUILDING_FOOTPRINT', 'OPENSTREETMAP_BUILDING', 'https://mapcarta.com/W894331161'],
 ['ABE2', 'US_EAST', 40.55787890788748, -75.61500997116448, 'ADDRESS_POINT', 'REVIEWED_FACILITY_ADDRESS_POINT', 'https://fba-finder.com/usa/pennsylvania/abe2/']
].forEach(function (r) {
  var code = r[0], p = DEMO4A_DEST_COORD_PROPOSAL_[code], L = G2_LIVE_[code];
  eq([p.region, p.warehouse_id, p.warehouse_code, p.logistics_location_id, p.address_fingerprint, p.latitude, p.longitude, p.coordinate_accuracy, p.coordinate_source_type, p.coordinate_source_reference],
     [r[1], L.wid, code, 'LOC-' + L.wid, L.fp, r[2], r[3], r[4], r[5], r[6]], 'E2/E3/E4. ' + code + ' proposal values are exact');
  eq(DEMO4A_normalizeWhAddress_(whLive(code)).fingerprint, p.address_fingerprint, 'E2/E3/E4. ' + code + ' proposal fingerprint == the LIVE normalized address fingerprint');
  eq([p.reviewed_by, p.review_status, p.reviewed_at, p.review_version], ['USER_SOURCE_REVIEW', 'PROPOSAL_READY_FOR_USER_VALIDATION', '2026-08-24', 'V3G2-USER-SOURCE-REVIEW-1'], 'E2/E3/E4. ' + code + ' carries the FROZEN deterministic review marker (no live timestamp)');
});

section('V3G2-E5/E6. the three coordinates are distinct and none is a gateway coordinate');
(function () {
  var keys = Object.keys(DEMO4A_DEST_COORD_PROPOSAL_).map(function (k) { var p = DEMO4A_DEST_COORD_PROPOSAL_[k]; return DEMO4A_num_(p.latitude).toFixed(5) + ',' + DEMO4A_num_(p.longitude).toFixed(5); });
  var uniq = {}; keys.forEach(function (k) { uniq[k] = 1; });
  ok(keys.length === 3 && Object.keys(uniq).length === 3, 'E5. the three proposal coordinates are distinct');
  ok(Object.keys(DEMO4A_DEST_COORD_PROPOSAL_).every(function (k) { var p = DEMO4A_DEST_COORD_PROPOSAL_[k]; return DEMO4A_validCoord_(p.latitude, p.longitude) && DEMO4A_gatewayCoordMatch_(p.latitude, p.longitude, mG2.locations) === ''; }), 'E6. every proposal coordinate is valid non-(0,0) and matches NO live port/airport/centroid coordinate');
})();

section('V3G2-E7. the accepted accuracy classes are an EXPLICIT enum, not a wildcard');
eq([DEMO4A_coordAccuracyFacility_('BUILDING_FOOTPRINT'), DEMO4A_coordAccuracyFacility_('ADDRESS_POINT')], ['building', 'address'], 'E7. the reviewed source vocabulary maps by name to facility-grade canonical classes');
ok(['city', 'zip', 'postal_code', 'centroid', 'city_centroid', 'approximate', 'interpolated', 'range_interpolated', 'FUZZY', 'anything_else', ''].every(function (t) { return DEMO4A_coordAccuracyFacility_(t) === ''; }), 'E7. every non-enumerated / centroid / approximate token still resolves to NO facility grade (no wildcard path)');
eq(DEMO4A_validateCoordProposal_({ BFI4: JSON.parse(JSON.stringify(DEMO4A_DEST_COORD_PROPOSAL_.BFI4)) }, [whLive('BFI4')], mG2.locations).per_region[0].canonical_accuracy, 'building', 'E7. the validator reports the canonical accuracy it accepted');
(function () { var p = JSON.parse(JSON.stringify(DEMO4A_DEST_COORD_PROPOSAL_)); p.BFI4.coordinate_accuracy = 'CITY_CENTROID';
  eq(DEMO4A_validateCoordProposal_(p, mG2.warehouses, mG2.locations).per_region[0].status, 'ACCURACY_NOT_FACILITY_GRADE', 'E7. a centroid accuracy on a real entry is still refused'); })();

section('V3G2-E8. every proposal entry carries a reviewable source reference');
ok(Object.keys(DEMO4A_DEST_COORD_PROPOSAL_).every(function (k) { return /^https:\/\/\S+$/.test(DEMO4A_str_(DEMO4A_DEST_COORD_PROPOSAL_[k].coordinate_source_reference)); }), 'E8. all three source references are present and reviewable URLs');

section('V3G2-E9/D. the AUS2 ZIP discrepancy: the LIVE 78665 fingerprint stays authoritative');
eq(DEMO4A_normalizeWhAddress_(whLive('AUS2')).fingerprint, '82165c14', 'E9. the live AUS2 address (ZIP 78665) fingerprints to 82165c14');
eq(DEMO4A_DEST_COORD_PROPOSAL_.AUS2.address_fingerprint, '82165c14', 'E9. the AUS2 proposal is bound to the live 78665 fingerprint');
ok(DEMO4A_normalizeWhAddress_(whLive('AUS2', { zip: '78660' })).fingerprint !== '82165c14', 'D/E9. the third-party 78660 variant is a DIFFERENT fingerprint — recorded as a public-source discrepancy, never authoritative');
(function () { var v = DEMO4A_validateCoordProposal_(DEMO4A_DEST_COORD_PROPOSAL_, mG2.warehouses, mG2.locations);
  var c = v.per_region.filter(function (r) { return r.region === 'US_CENTRAL'; })[0];
  ok(c.status !== 'ADDRESS_FINGERPRINT_STALE' && c.proposal_fingerprint_match === true, 'D. the 78660/78665 public-source discrepancy does NOT produce ADDRESS_FINGERPRINT_STALE while the live fingerprint is unchanged'); })();
ok(mG2.warehouses.every(function (w) { return DEMO4A_whPostal_(w) !== '78660'; }), 'D. no warehouse address/master field is modified (live ZIPs untouched)');

section('V3G2-E10/C. the validator predicts THREE_REGION_COORDINATE_PROPOSAL_READY on the live-shaped fixture');
(function () { var v = DEMO4A_validateCoordProposal_(DEMO4A_DEST_COORD_PROPOSAL_, mG2.warehouses, mG2.locations);
  eq(v.verdict, 'THREE_REGION_COORDINATE_PROPOSAL_READY', 'E10. all three entries validate against the live-shaped candidates');
  ok(v.per_region.length === 3 && v.per_region.every(function (r) { return r.status === 'PROPOSAL_READY_FOR_USER_REVIEW' && r.identity_match === true && r.proposal_fingerprint_match === true
    && r.coordinate_valid === true && r.facility_grade_accuracy === true && r.source_reference_present === true && r.country_region_match === true && r.gateway_or_centroid_coordinate === ''
    && r.duplicate_coordinate === false; }), 'C/E10. every gate (identity / fingerprint / coordinate / facility accuracy / source / country-region / gateway / distinctness) passes per region');
  eq(v.authority_armed, true, 'E10/V3G3. the validator reports the authority as ARMED (V3G3) while still returning READY from the separate PROPOSAL evidence'); })();
eq(DEMO4A_validateCoordProposal_(DEMO4A_DEST_COORD_PROPOSAL_, mG2.warehouses, mG2.locations).per_region.length, 3, 'E10. the read-only validator still evaluates all three regions from the PROPOSAL, never from the authority');
(function () { var p = JSON.parse(JSON.stringify(DEMO4A_DEST_COORD_PROPOSAL_)); p.BFI4.logistics_location_id = 'LOC-WH-KM-US-FBA-AUS2';
  eq(DEMO4A_validateCoordProposal_(p, mG2.warehouses, mG2.locations).per_region[0].status, 'IDENTITY_MISMATCH', 'C. a wrong declared logistics_location_id is an IDENTITY_MISMATCH (exact identity required)'); })();
(function () { var p = JSON.parse(JSON.stringify(DEMO4A_DEST_COORD_PROPOSAL_)); p.BFI4.region = 'US_EAST';
  eq(DEMO4A_validateCoordProposal_(p, mG2.warehouses, mG2.locations).per_region[0].status, 'IDENTITY_MISMATCH', 'C. a wrong declared region is an IDENTITY_MISMATCH'); })();
(function () { var p = JSON.parse(JSON.stringify(DEMO4A_DEST_COORD_PROPOSAL_)); p.BFI4.latitude = 47.60; p.BFI4.longitude = -122.33;
  eq(DEMO4A_validateCoordProposal_(p, mG2.warehouses, mG2.locations).per_region[0].status, 'GATEWAY_OR_CENTROID_COORDINATE_SUBSTITUTION', 'C. moving BFI4 onto the live Seattle seaport coordinate is refused'); })();

section('V3G2-E11/B. the populated proposal still cannot arm the authority');
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length, 3, 'E11/V3G3. DEMO4A_DEST_COORD_AUTHORITY_ holds exactly three USER-APPROVED entries (armed in V3G3, not by the proposal)');
eq(Object.keys(DEMO4A_proposalToAuthority_(DEMO4A_DEST_COORD_PROPOSAL_)).length, 0, 'E11/B3. converting the shipped proposal yields ZERO authority entries (review_status is not user_approved)');
ok(/DEMO4A_proposalToAuthority_\s*\(/.test(G) === false || (G.match(/DEMO4A_proposalToAuthority_\s*\(/g) || []).length === 1, 'B3. DEMO4A_proposalToAuthority_ is DEFINED but never called anywhere in the seed (no automatic copy path)');
eq((G.match(/DEMO4A_DEST_COORD_AUTHORITY_\s*=[^=]/g) || []).length, 1, 'B3/B5. DEMO4A_DEST_COORD_AUTHORITY_ is assigned EXACTLY ONCE in source (its explicit declaration) — no code path ever re-assigns or auto-promotes into it');
(function () { var approved = JSON.parse(JSON.stringify(DEMO4A_DEST_COORD_PROPOSAL_));
  Object.keys(approved).forEach(function (k) { approved[k].review_status = 'user_approved'; });
  var auth = DEMO4A_proposalToAuthority_(approved);
  ok(Object.keys(auth).length === 3 && auth.BFI4.accuracy === 'building' && auth.ABE2.accuracy === 'address' && auth.BFI4.review_version === 'V3G2-USER-SOURCE-REVIEW-1' && DEMO4A_DEST_COORD_AUTHORITY_.BFI4.review_version === 'V3G3-USER-APPROVED-1',
    'E11. a USER-approved copy converts to canonical facility-grade entries WITHOUT mutating the live authority constant (which keeps its own frozen approval version)');
  var d = DEMO4A_deriveDestCoordinate_(whLive('BFI4'), auth, '06a93100');
  ok(d.ok === true && d.accuracy === 'building' && d.latitude === 47.4145, 'E11/C. the aligned accuracy enum lets an approved proposal satisfy the authority gate (no weakening: the fingerprint is still required)');
  eq(DEMO4A_deriveDestCoordinate_(whLive('BFI4'), auth, 'deadbeef').reason, 'ADDRESS_FINGERPRINT_STALE', 'E11/C. a stale fingerprint still fails closed after the enum alignment'); })();

section('V3G2-E12. PREFLIGHT/build stays NOT_ARMED with the proposal populated');
(function () {
  // the live-shaped fixture reproduces the real live condition: blank FBA logistics coordinates make the destination node
  // unbindable, so the BUILD fails early at template selection — but it still carries the arming facts, and the PURE
  // PREFLIGHT mapping converts that into the truthful typed reason instead of a misleading plan-count reason.
  var mG2u = mastersV3G2(); mG2u.destCoordAuthority = {};   // V3G3: explicitly UNARMED, since the real authority is now armed
  var plan = DEMO4A_buildPlan_(mG2u);
  ok(plan.ok === false && plan.warehouses_present === true && plan.coord_authority_armed === false, 'E12. the build reports warehouses_present + an UNARMED coordinate authority');
  var pf = DEMO4A_preflightFailureReason_(plan, true);
  eq([pf.reason, pf.verdict, pf.coordinate_authority_armed], ['DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED', 'PREFLIGHT_FAILED_COORDINATE_AUTHORITY_NOT_ARMED', false], 'E12/B4. blank live FBA coordinates + populated proposal + empty authority → PREFLIGHT reports DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED');
  eq(pf.underlying_reason, plan.reason, 'E12. the raw build reason is preserved as underlying_reason (never silently replaced)');
  ok(pf.reason !== 'INSUFFICIENT_STATUS_VALID_DEMO_PLANS', 'E12/F. the misleading INSUFFICIENT_STATUS_VALID_DEMO_PLANS reason is never surfaced while the authority is unarmed');
  ok(plan.tables === undefined, 'E12/B5. NO rows are built from proposal data (COMMIT can never use a proposal row as authorization)');
})();
// the pure mapping does NOT mask a real identity failure, and reports normally once the authority is armed.
eq(DEMO4A_preflightFailureReason_({ ok: false, reason: 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', warehouses_present: true, coord_authority_armed: false }, true).reason, 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', 'E12/F. an identity failure is NOT reinterpreted as NOT_ARMED');
eq(DEMO4A_preflightFailureReason_({ ok: false, reason: 'INSUFFICIENT_STATUS_VALID_DEMO_PLANS', warehouses_present: true, coord_authority_armed: true }, true).reason, 'INSUFFICIENT_STATUS_VALID_DEMO_PLANS', 'E12/F. with the authority ARMED the raw build reason is reported unchanged');
eq(DEMO4A_preflightFailureReason_({ ok: false, reason: 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', warehouses_present: true, coord_authority_armed: true }, true).verdict, 'PREFLIGHT_FAILED_WAREHOUSE_AUTHORITY', 'E12/F. an armed-but-stale authority still verdicts as a warehouse-authority failure');
eq(DEMO4A_diagnoseDestCandidates_(mG2.warehouses, mG2.locations, {}).verdict, 'THREE_REGION_DESTINATION_CANDIDATES_SELECTED', 'E12. the three live-shaped candidates are selected independently of arming');
ok(DEMO4A_diagnoseDestCandidates_(mG2.warehouses, mG2.locations, {}).selected_destination_warehouses.every(function (r) { return r.coordinate_authority_status === 'COORDINATE_AUTHORITY_NOT_ARMED'; }), 'E12/B2. with an EMPTY authority each selected candidate reports COORDINATE_AUTHORITY_NOT_ARMED');
ok(DEMO4A_diagnoseDestCandidates_(mG2.warehouses, mG2.locations, DEMO4A_DEST_COORD_AUTHORITY_).selected_destination_warehouses.every(function (r) { return r.coordinate_authority_status === 'AUTHORIZED_COORDINATE_PRESENT'; }), 'E12/V3G3. with the REAL armed authority all three selected candidates report AUTHORIZED_COORDINATE_PRESENT');

section('V3G2-E13/E14. masters never written; confirmation constants remain placeholders');
ok(new RegExp("getSheetByName\\('warehouses'\\)\\.(appendRow|deleteRow|setValue|getRange)").test(G) === false && new RegExp("getSheetByName\\('logistics_locations'\\)\\.(appendRow|deleteRow|setValue|getRange)").test(G) === false, 'E13. warehouses / logistics_locations are never written (read-only masters)');
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'E14. both confirmation constants remain placeholders (nothing armed by V3G2)');
ok(/var DEMO4A_DEST_COORD_AUTHORITY_ = \{\r?\n/.test(G) && (G.match(/review_status: 'user_approved'/g) || []).length === 3, 'E14/V3G3. the authority is an explicit source literal with exactly three user_approved entries');

// ============================================================ V3G3 — ARMED AUTHORITY + CLOSED DESTINATION ENDPOINT
// The three USER-APPROVED coordinates are armed in DEMO4A_DEST_COORD_AUTHORITY_. The live-shaped fixture uses the REAL
// warehouse ids/codes/addresses (blank FBA master coordinates, exact logistics joins) and consumes the REAL armed
// authority — no fixture authority is injected, so these tests exercise the shipped constant end to end.
var G3_APPROVED_ = {
  BFI4: { region: 'US_WEST', lat: 47.4145, lng: -122.25778, acc: 'building', ref: 'https://mapcarta.com/W500861061' },
  AUS2: { region: 'US_CENTRAL', lat: 30.43255, lng: -97.59852, acc: 'building', ref: 'https://mapcarta.com/W894331161' },
  ABE2: { region: 'US_EAST', lat: 40.55787890788748, lng: -75.61500997116448, acc: 'address', ref: 'https://fba-finder.com/usa/pennsylvania/abe2/' }
};
function mastersV3G3(over) {
  over = over || {};
  var m = mastersV3G2();
  // same-region destination-compatible locations WITH coordinates, so template selection can bind a destination role
  // (the approved facility coordinate then overrides the final marker via the address-derived branch, exactly as V3G).
  m.locations = m.locations.concat([
    locWH('US-W-GEN', '', 'US', 'US West', 34.1, -118.3, 'warehouse'),
    locWH('US-C-GEN', '', 'US', 'US Central', 41.9, -87.7, 'warehouse'),
    locWH('US-E-GEN', '', 'US', 'US East', 40.8, -74.1, 'warehouse')
  ]);
  if (over.zip78660) m.warehouses = m.warehouses.map(function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (c.warehouse_code === 'AUS2') c.postal_code = '78660'; return c; });
  return m;
}
var mG3 = mastersV3G3(), planG3 = DEMO4A_buildPlan_(mG3);
function g3Ship(code) { return planG3.per_shipment.filter(function (x) { return x.destination_warehouse_code === code; })[0]; }

section('V3G3-C. exactly the three approved authorities are armed, bound and immutable in source');
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length, 3, 'C. no fourth authority entry exists');
ok(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).every(function (k) { var e = DEMO4A_DEST_COORD_AUTHORITY_[k], a = G3_APPROVED_[k];
  return a && e.region === a.region && e.latitude === a.lat && e.longitude === a.lng && e.accuracy === a.acc && e.source_reference === a.ref
    && e.warehouse_id === G2_LIVE_[k].wid && e.warehouse_code === k && e.logistics_location_id === 'LOC-' + G2_LIVE_[k].wid && e.address_fingerprint === G2_LIVE_[k].fp; }),
  'C. each armed entry binds warehouse_id + code + logistics_location_id + region + live fingerprint + coordinate + canonical accuracy + source_reference');
ok(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).every(function (k) { return DEMO4A_coordAccuracyFacility_(DEMO4A_DEST_COORD_AUTHORITY_[k].accuracy) === DEMO4A_DEST_COORD_AUTHORITY_[k].accuracy; }), 'C. the armed accuracy is already the CANONICAL facility-grade class');
eq(Object.keys(DEMO4A_DEST_COORD_PROPOSAL_).sort().join(','), 'ABE2,AUS2,BFI4', 'C. the PROPOSAL is retained as the separate review evidence');
ok(DEMO4A_DEST_COORD_PROPOSAL_.BFI4.review_status === 'PROPOSAL_READY_FOR_USER_VALIDATION' && DEMO4A_DEST_COORD_AUTHORITY_.BFI4.review_status === 'user_approved', 'C. proposal and authority remain DISTINCT records with distinct review states (only the authority is executable)');
eq(Object.keys(DEMO4A_proposalToAuthority_(DEMO4A_DEST_COORD_PROPOSAL_)).length, 0, 'C. proposalToAuthority_ stays pure and promotes NOTHING automatically (the shipped proposal is not user_approved)');
ok(DEMO4A_str_(DEMO4A_DEST_COORD_AUTHORITY_.AUS2.address_fingerprint) === '82165c14' && mG3.warehouses.filter(function (w) { return w.warehouse_code === 'AUS2'; })[0].postal_code === '78665', 'C/D. the live AUS2 ZIP 78665 remains authoritative and unmutated (78660 never substituted)');

section('V3G3-D. with the three approved authorities the plan builds and each region gets ITS OWN coordinate');
ok(planG3.ok === true, 'D. the plan builds with the armed authority (all three destination identities resolve)');
eq(planG3.per_shipment.map(function (x) { return x.destination_warehouse_code; }).sort().join(','), 'ABE2,AUS2,BFI4', 'D. the three shipments target the three approved warehouses (W/C/E)');
Object.keys(G3_APPROVED_).forEach(function (code) {
  var sp = g3Ship(code), a = G3_APPROVED_[code];
  eq([sp.destination_warehouse_id, sp.destination_logistics_location_id], [G2_LIVE_[code].wid, 'LOC-' + G2_LIVE_[code].wid], 'D. ' + code + ' resolves the exact warehouse + logistics lineage');
  eq(sp.destination_coordinate_branch, 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE', 'D. ' + code + ' uses the approved address-derived coordinate branch');
  eq([sp.destination_coordinate_accuracy, sp.destination_coordinate_source_reference, sp.destination_address_fingerprint], [a.acc, a.ref, G2_LIVE_[code].fp], 'D. ' + code + ' carries the approved accuracy + source reference + live fingerprint');
  var dr = planG3.tables.shipment_routes.filter(function (r) { return r.shipment_id === sp.shipment_id; }).sort(function (x, y) { return DEMO4A_num_(x.sequence_no) - DEMO4A_num_(y.sequence_no); }).slice(-1)[0];
  eq([DEMO4A_num_(dr.latitude), DEMO4A_num_(dr.longitude)], [a.lat, a.lng], 'D. ' + code + ' final destination route row carries EXACTLY its own approved coordinate');
  eq([dr.location_ref_type, dr.location_ref_id], ['logistics_location', 'LOC-' + G2_LIVE_[code].wid], 'D/B. the final route row carries the logistics lineage the frontend endpoint consumer requires');
  eq(DEMO4A_mapDestinationDisplayStatus_(sp.destination_coordinate_branch), 'MAP_DESTINATION_DISPLAY_COMPLETE', 'D/E. ' + code + ' destination display is COMPLETE (labelled endpoint)');
  eq(DEMO4A_mapDestinationEndpointSource_(sp.destination_coordinate_branch), 'DEST_ROUTE_TERMINAL_NODE', 'D/B. ' + code + ' endpoint is supplied by the proven terminal route row');
});
(function () {
  var ks = planG3.per_shipment.map(function (x) { return DEMO4A_num_(x.destination_latitude !== undefined ? x.destination_latitude : 0); });
  var coords = Object.keys(G3_APPROVED_).map(function (k) { return G3_APPROVED_[k].lat.toFixed(5) + ',' + G3_APPROVED_[k].lng.toFixed(5); });
  var uniq = {}; coords.forEach(function (c) { uniq[c] = 1; });
  ok(Object.keys(uniq).length === 3 && ks.length === 3, 'D. the three approved coordinates are distinct (no duplication across facilities)');
})();

section('V3G3-D. route geography / endpoint / status truthfulness gates pass');
(function () {
  var gates = DEMO4A_warehouseGates_(planG3.warehouses_present, planG3.destination_authority, null, planG3.binding_gates ? planG3.binding_gates.ok : undefined);
  ok(gates.applicable === true && gates.ok === true, 'D. all seven warehouse gates pass with the armed authority');
  ok(gates.route_geography_ready === true && gates.map_consumes_destination_coordinate === true && gates.status_truthfulness_ready === true, 'D. route geography + endpoint consumption + status truthfulness gates pass');
  ok(gates.map_destination_coordinate_consumption.frontend_blocker === '', 'D/E. no frontend blocker remains in the reported consumption contract');
})();

section('V3G3-D. received ends at its warehouse; shipped / in-transit stay truthful');
(function () {
  var deliv = planG3.per_shipment.filter(function (x) { return x.slot === 'delivered'; })[0];
  var rows = planG3.tables.shipment_routes.filter(function (r) { return r.shipment_id === deliv.shipment_id; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); });
  var dr = rows[rows.length - 1];
  var rv = planG3.tables.shipment_events.filter(function (e) { return e.shipment_id === deliv.shipment_id && DEMO4A_low_(e.event_type) === 'received'; })[0];
  ok(rv && DEMO4A_num_(rv.latitude) === DEMO4A_num_(dr.latitude) && DEMO4A_num_(rv.longitude) === DEMO4A_num_(dr.longitude), 'D. the received event coordinate EQUALS the destination route coordinate (ends at its warehouse)');
  eq(DEMO4A_str_(rv.shipment_route_id), DEMO4A_str_(dr.shipment_route_id), 'D. the received event references the DESTINATION route row itself (shipment_events carries shipment_route_id, not location_ref_id)');
  eq(deliv.status, 'received', 'D. the delivered slot status is truthful');
  var it = planG3.per_shipment.filter(function (x) { return x.slot === 'in_transit'; })[0];
  var itRows = planG3.tables.shipment_routes.filter(function (r) { return r.shipment_id === it.shipment_id; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); });
  var itDest = itRows[itRows.length - 1];
  eq(planG3.tables.shipment_events.filter(function (e) { return e.shipment_id === it.shipment_id && DEMO4A_str_(e.shipment_route_id) === DEMO4A_str_(itDest.shipment_route_id); }).length, 0, 'D. the in-transit shipment has NO event on its future destination node');
  eq(DEMO4A_low_(itDest.status), 'planned', 'D. the in-transit destination route row stays PLANNED');
  eq(it.status, 'in_transit', 'D. the in-transit status is truthful');
  eq(planG3.per_shipment.filter(function (x) { return x.slot === 'origin'; })[0].status, 'shipped', 'D. the shipped status is truthful');
  // current marker distinct from BOTH origin and destination
  var cur = itRows.filter(function (r) { return DEMO4A_low_(r.status) === 'current'; })[0] || itRows[DEMO4A_num_(1)];
  var key = function (r) { return DEMO4A_num_(r.latitude).toFixed(5) + ',' + DEMO4A_num_(r.longitude).toFixed(5); };
  ok(key(cur) !== key(itRows[0]) && key(cur) !== key(itDest), 'D. the current-marker coordinate is distinct from BOTH the origin and the destination');
  // no gateway/centroid substitution: no approved destination coordinate equals a live gateway coordinate
  ok(Object.keys(G3_APPROVED_).every(function (k) { return DEMO4A_gatewayCoordMatch_(G3_APPROVED_[k].lat, G3_APPROVED_[k].lng, mG3.locations) === ''; }), 'D. no approved destination coordinate collides with a live gateway/centroid coordinate');
})();

section('V3G3-D. determinism + checksum binding of the approved evidence');
eq(DEMO4A_buildPlan_(mastersV3G3()).checksum, planG3.checksum, 'D. identical input → identical demo_plan_checksum (deterministic, frozen approval markers)');
(function () {
  function ckWith(mut) { var a = JSON.parse(JSON.stringify(DEMO4A_DEST_COORD_AUTHORITY_)); mut(a); var m = mastersV3G3(); m.destCoordAuthority = a; var p = DEMO4A_buildPlan_(m); return p.ok ? p.checksum : ('FAILED:' + p.reason); }
  ok(ckWith(function (a) { a.AUS2.latitude = 30.5; }) !== planG3.checksum, 'D. changing an approved COORDINATE changes the checksum');
  ok(ckWith(function (a) { a.AUS2.source_reference = 'https://example.invalid/other'; }) !== planG3.checksum, 'D. changing an approved SOURCE REFERENCE changes the checksum');
  ok(ckWith(function (a) { a.ABE2.accuracy = 'rooftop'; }) !== planG3.checksum, 'D. changing an approved ACCURACY changes the checksum');
  eq(ckWith(function (a) { a.BFI4.address_fingerprint = 'deadbeef'; }), 'FAILED:DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'D/C. a STALE address fingerprint fails closed (never a silently wrong coordinate)');
  eq(ckWith(function (a) { delete a.ABE2; }), 'FAILED:DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'D/C. removing one approved identity fails closed');
  // a LIVE address edit (the 78660 variant) re-fingerprints and therefore fails closed against the armed authority
  eq(DEMO4A_buildPlan_(mastersV3G3({ zip78660: true })).reason, 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'D/C. a live address change invalidates the armed coordinate (fails closed, no stale coordinate reused)');
})();

section('V3G3-D. V3A protections intact; COMMITTED_UNVERIFIED impossible; nothing armed for write');
(function () {
  var j = DEMO4A_buildJournal_(planG3, 'DRY_RUN');
  ok(j && DEMO4A_verifyJournal_(j, DEMO4A_journalCanonical_(j)) !== false, 'D. the durable journal still builds + verifies over the armed-authority plan');
  var rb = DEMO4A_rollbackPlan_(DEMO4A_allIds_(planG3));
  ok(rb && rb.length > 0 && DEMO4A_anyInserted_(DEMO4A_allIds_(planG3)) === true, 'D. the inserted-only rollback plan still derives over the armed-authority plan');
})();
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'D. both confirmation constants remain placeholders (COMMIT + CLEAR stay disarmed; no live checksum pinned)');
ok(/PASTE_DEMO_SEED_CHECKSUM_HERE/.test(G) && /PASTE_DEMO_CLEAR_TOKEN_HERE/.test(G) && new RegExp('DEMO4A_CONFIRMED_SEED_CHECKSUM_ = \'[0-9a-f]{8}').test(G) === false, 'D. no live demo_plan_checksum is pinned in source');
ok(new RegExp("getSheetByName\\('warehouses'\\)\\.(appendRow|deleteRow|setValue)").test(G) === false && new RegExp("getSheetByName\\('logistics_locations'\\)\\.(appendRow|deleteRow|setValue)").test(G) === false, 'D. warehouses / logistics_locations masters remain read-only');

// ============================================================ V3G4 — WAREHOUSE-AWARE TEMPLATE ELIGIBILITY PIPELINE
// Reproduces the ACTUAL live shape that returned NO_ROLE_COMPATIBLE_DESTINATION_LOCATION = 29:
//   · warehouses present (the three approved live FBA facilities, real addresses)
//   · each warehouse-linked logistics_location present, joined exactly, with BLANK master latitude/longitude and
//     verification_status = ADDRESS_SEEDED_COORDINATES_PENDING
//   · the approved authority holds the exact fingerprint-bound coordinates
//   · ONLY gateway locations (ports/airport) otherwise carry valid master coordinates
//   · template timeline nodes carry blank coordinates and NO identifier that matches any location (zero exact matches)
function locPending(id, whId, country, region) { var l = locWH(id, whId, country, region, '', '', 'fulfillment_center'); l.verification_status = 'ADDRESS_SEEDED_COORDINATES_PENDING'; return l; }
function liveTpl(id, region, whId) { var t = tplWH(id, region, whId); t.route_template_name = 'CN to ' + region + ' ' + id; return t; }
function mastersLive(over) {
  over = over || {};
  var REG = [['US West', 'WH-KM-US-FBA-BFI4', 10], ['US Central', 'WH-KM-US-FBA-AUS2', 10], ['US East', 'WH-KM-US-FBA-ABE2', 9]];
  var templates = [], nodes = [], k = 0;
  REG.forEach(function (r) {
    for (var i = 1; i <= r[2]; i++) {
      k++; var tid = 'RT-LIVE-' + k;
      templates.push(liveTpl(tid, r[0], over.noDestWh ? '' : r[1]));
      // 4 abstract timeline nodes: blank coordinates, node_codes that match NOTHING in logistics_locations.
      nodes.push(nAbs(tid, 1, 'origin', 'origin_departure'), nAbs(tid, 2, 'customs', 'customs_clearance'), nAbs(tid, 3, 'port', 'port_transit'), nAbs(tid, 4, 'destination', 'final_delivery'));
    }
  });
  // ONLY gateways carry valid master coordinates (exactly the live condition).
  var locations = [
    locWH('CN-PORT-SHA', '', 'CN', 'CN East', 31.23, 121.47, 'port'),
    locWH('US-PORT-LA', '', 'US', 'US West', 33.74, -118.27, 'port'),
    locWH('US-PORT-HOU', '', 'US', 'US Central', 29.73, -95.28, 'port'),
    locWH('US-AIR-EWR', '', 'US', 'US East', 40.69, -74.17, 'airport'),
    locPending('LOC-WH-KM-US-FBA-BFI4', 'WH-KM-US-FBA-BFI4', 'US', 'US West'),
    locPending('LOC-WH-KM-US-FBA-AUS2', 'WH-KM-US-FBA-AUS2', 'US', 'US Central'),
    locPending('LOC-WH-KM-US-FBA-ABE2', 'WH-KM-US-FBA-ABE2', 'US', 'US East')
  ];
  if (over.joinConflict) locations.push(locPending('LOC-WH-KM-US-FBA-BFI4-DUP', 'WH-KM-US-FBA-BFI4', 'US', 'US West'));
  if (over.joinConflictAll) ['BFI4', 'AUS2', 'ABE2'].forEach(function (c) { locations.push(locPending('LOC-' + G2_LIVE_[c].wid + '-DUP', G2_LIVE_[c].wid, 'US', G2_LIVE_[c].region)); });
  var warehouses = [whLive('BFI4'), whLive('AUS2'), whLive('ABE2')];
  if (over.staleAddress) warehouses = warehouses.map(function (w) { var c = {}; for (var x in w) c[x] = w[x]; if (c.warehouse_code === 'AUS2') c.address_line1 = c.address_line1 + ' STE 900'; return c; });
  if (over.staleAddressAll) warehouses = warehouses.map(function (w) { var c = {}; for (var x in w) c[x] = w[x]; c.address_line1 = c.address_line1 + ' STE 900'; return c; });
  return { templates: templates, nodes: nodes, locations: locations, warehouses: warehouses, marketplaceSkus: mastersFull().marketplaceSkus, skuDetails: mastersFull().skuDetails };
}
var mL = mastersLive();
var G4_OPTS_ = { warehouses: mL.warehouses, coordAuthority: DEMO4A_DEST_COORD_AUTHORITY_, company: 'KM' };

section('V3G4-REGRESSION. the exact live evidence: 29 destination rejections BEFORE, three qualified W/C/E AFTER');
(function () {
  // the OLD rule (no warehouse opts = the pre-V3G4 generic role-compatible location_type pool) on the SAME evidence
  var legacy = DEMO4A_selectTemplates_(mL.templates, mL.nodes, mL.locations);
  eq([legacy.ok, legacy.reason], [false, 'INSUFFICIENT_STATUS_VALID_DEMO_PLANS'], 'REG. the pre-V3G4 generic destination pool rejects every template on the live evidence');
  eq(legacy.rejection_counts.NO_ROLE_COMPATIBLE_DESTINATION_LOCATION, 29, 'REG. reproduces the EXACT live count NO_ROLE_COMPATIBLE_DESTINATION_LOCATION = 29');
  eq(legacy.qualified_count, 0, 'REG. qualified_count = 0 under the old rule (matches the live PREFLIGHT)');
  // the NEW warehouse-aware rule on the SAME evidence, with NO master-data change
  var sel = DEMO4A_selectTemplates_(mL.templates, mL.nodes, mL.locations, G4_OPTS_);
  ok(sel.ok === true && sel.warehouse_aware_template_evaluation === true, 'REG. the warehouse-aware evaluation qualifies templates on the SAME evidence (no master data changed)');
  eq(sel.rejection_counts.NO_ROLE_COMPATIBLE_DESTINATION_LOCATION, undefined, 'D. NO_ROLE_COMPATIBLE_DESTINATION_LOCATION is never reported once the warehouse authority is active');
  eq(sel.qualified_count, 29, 'REG. all 29 templates now qualify');
  eq(sel.region_selection_mode, 'DISTINCT_WCE', 'C. three DISTINCT US_WEST / US_CENTRAL / US_EAST plans are still selected');
  eq([sel.available_regions.US_WEST, sel.available_regions.US_CENTRAL, sel.available_regions.US_EAST], [10, 10, 9], 'REG. every region contributes qualified templates');
  ok(sel.current_capable_count > 0, 'C/E5. at least one template is CURRENT-CAPABLE (distinct middle current marker resolves)');
  ok(mL.locations.filter(function (l) { return DEMO4A_locValid_(l); }).every(function (l) { return !DEMO4A_str_(DEMO4A_get_(l, ['warehouse_id'])); }), 'REG. only NON-warehouse gateway locations carry valid master coordinates (live condition preserved)');
})();

section('V3G4-E1/E2/E3/E4. each approved warehouse makes its region destination-eligible, all three simultaneously');
[['BFI4', 'US_WEST'], ['AUS2', 'US_CENTRAL'], ['ABE2', 'US_EAST']].forEach(function (r) {
  var code = r[0], tpl = mL.templates.filter(function (t) { return DEMO4A_str_(t.destination_warehouse_id) === G2_LIVE_[code].wid; })[0];
  var da = DEMO4A_destAuthorityForTemplate_(tpl, mL.warehouses, mL.locations, DEMO4A_DEST_COORD_AUTHORITY_, 'KM');
  eq(DEMO4A_destAuthorityReason_(da), '', 'E. ' + code + ' (' + r[1] + ') destination authority resolves with NO rejection reason');
  eq([da.branch, da.warehouse_id, da.logistics_location_id, da.address_fingerprint], ['DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE', G2_LIVE_[code].wid, 'LOC-' + G2_LIVE_[code].wid, G2_LIVE_[code].fp], 'E. ' + code + ' binds the exact warehouse + logistics lineage + live fingerprint');
  eq([da.latitude, da.longitude], [G3_APPROVED_[code].lat, G3_APPROVED_[code].lng], 'E. ' + code + ' uses its OWN approved coordinate');
});
(function () {
  var plan = DEMO4A_buildPlan_(mL);
  ok(plan.ok === true, 'E4. all three regions qualify simultaneously and the live-shaped plan BUILDS');
  eq(plan.per_shipment.map(function (x) { return x.destination_warehouse_code; }).sort().join(','), 'ABE2,AUS2,BFI4', 'E4. the three shipments land on the three approved warehouses');
})();

section('V3G4-E6/E7. the destination no longer depends on a generic role-compatible location_type; gateways cannot substitute');
(function () {
  // strip EVERY gateway location: the destination still resolves (it never used that pool), and only origin/current break.
  var noGw = mastersLive(); noGw.locations = noGw.locations.filter(function (l) { return !DEMO4A_locValid_(l); });
  var tpl = noGw.templates[0];
  var da = DEMO4A_destAuthorityForTemplate_(tpl, noGw.warehouses, noGw.locations, DEMO4A_DEST_COORD_AUTHORITY_, 'KM');
  eq(DEMO4A_destAuthorityReason_(da), '', 'E6. with ZERO valid-coordinate locations the destination authority still resolves (no location-type pool dependency)');
  eq(DEMO4A_selectTemplates_(noGw.templates, noGw.nodes, noGw.locations, { warehouses: noGw.warehouses, coordAuthority: DEMO4A_DEST_COORD_AUTHORITY_, company: 'KM' }).reason, 'NO_ROLE_COMPATIBLE_ORIGIN_LOCATION', 'E6/D. the only remaining failure is the ORIGIN — reported truthfully as NO_ROLE_COMPATIBLE_ORIGIN_LOCATION');
  // a region with NO eligible warehouse must FAIL CLOSED, never fall back to the airport/seaport in that region
  var noWh = mastersLive(); noWh.warehouses = noWh.warehouses.filter(function (w) { return w.warehouse_code !== 'ABE2'; });
  var eastTpl = noWh.templates.filter(function (t) { return DEMO4A_str_(t.destination_warehouse_id) === 'WH-KM-US-FBA-ABE2'; })[0];
  var daE = DEMO4A_destAuthorityForTemplate_(eastTpl, noWh.warehouses, noWh.locations, DEMO4A_DEST_COORD_AUTHORITY_, 'KM');
  eq(DEMO4A_destAuthorityReason_(daE), 'DESTINATION_WAREHOUSE_IDENTITY_UNRESOLVED', 'E7. a region with no eligible warehouse fails closed as DESTINATION_WAREHOUSE_IDENTITY_UNRESOLVED');
  ok(DEMO4A_str_(daE.logistics_location_id) === '' && daE.latitude === undefined, 'E7. the US East AIRPORT is NOT substituted as the destination facility');
  // one region unresolvable → V3C's pre-existing FALLBACK_TRUTHFUL_TOP3 builds three status-valid plans from the REMAINING
  // approved warehouses (the three-plan requirement is NOT lowered) and NEVER relabels the US East airport as a facility.
  var pNoWh = DEMO4A_buildPlan_(noWh);
  ok(pNoWh.ok === true && pNoWh.region_selection_mode === 'FALLBACK_TRUTHFUL_TOP3', 'E7. with US East unresolvable the plan still builds three status-valid plans and truthfully reports FALLBACK_TRUTHFUL_TOP3');
  ok(pNoWh.per_shipment.every(function (x) { return x.destination_warehouse_code === 'BFI4' || x.destination_warehouse_code === 'AUS2'; }), 'E7. only APPROVED, resolvable warehouses are used — no OTHER-region or gateway replacement is fabricated');
  ok(pNoWh.tables.shipment_routes.every(function (r) { return DEMO4A_str_(r.location_ref_id) !== 'US-AIR-EWR' || DEMO4A_low_(r.node_type) !== 'destination'; }), 'E7. the US East AIRPORT is never the destination route row');
  // when NO region can resolve its warehouse identity, the plan DOES fail closed on identity.
  var noneWh = mastersLive(); noneWh.warehouses = [];
  ok(DEMO4A_buildPlan_(noneWh).reason === 'INSUFFICIENT_STATUS_VALID_DEMO_PLANS' || DEMO4A_buildPlan_(noneWh).reason === 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', 'E7/D. with the warehouses master emptied the live-shaped evidence cannot build (legacy pool cannot supply a destination either)');
  var conflictAll = mastersLive({ joinConflictAll: true });
  eq(DEMO4A_buildPlan_(conflictAll).reason, 'DESTINATION_WAREHOUSE_AUTHORITY_NOT_READY', 'E7/E10/D. when EVERY warehouse↔logistics join conflicts the plan fails closed on lineage/identity');
})();

section('V3G4-E8/E9/E10. stale fingerprint / missing authority entry / join conflict each fail closed with a typed reason');
(function () {
  var stale = mastersLive({ staleAddress: true });
  var tplC = stale.templates.filter(function (t) { return DEMO4A_str_(t.destination_warehouse_id) === 'WH-KM-US-FBA-AUS2'; })[0];
  eq(DEMO4A_destAuthorityReason_(DEMO4A_destAuthorityForTemplate_(tplC, stale.warehouses, stale.locations, DEMO4A_DEST_COORD_AUTHORITY_, 'KM')), 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'E8. a live address edit (stale fingerprint) → DESTINATION_ADDRESS_COORDINATE_UNRESOLVED');
  var pStale = DEMO4A_buildPlan_(stale);
  ok(pStale.ok === true && pStale.per_shipment.every(function (x) { return x.destination_warehouse_code !== 'AUS2'; }), 'E8. a single stale-fingerprint warehouse is EXCLUDED (never given a stale coordinate); the remaining approved regions still build');
  eq(DEMO4A_buildPlan_(mastersLive({ staleAddressAll: true })).reason, 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'E8/D. when EVERY live address drifts the plan fails closed as DESTINATION_ADDRESS_COORDINATE_UNRESOLVED');
  var partial = {}; partial.BFI4 = DEMO4A_DEST_COORD_AUTHORITY_.BFI4; partial.AUS2 = DEMO4A_DEST_COORD_AUTHORITY_.AUS2;   // ABE2 missing
  var mMissing = mastersLive(); mMissing.destCoordAuthority = partial;
  var pMissing = DEMO4A_buildPlan_(mMissing);
  ok(pMissing.ok === true && pMissing.per_shipment.every(function (x) { return x.destination_warehouse_code !== 'ABE2'; }), 'E9. a warehouse with no authority entry is EXCLUDED — no fabricated coordinate and no gateway replacement');
  ok(pMissing.per_shipment.every(function (x) { return x.destination_coordinate_branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE'; }), 'E9. every built destination still comes from an APPROVED authority entry');
  var mUnarmed = mastersLive(); mUnarmed.destCoordAuthority = {};
  eq(DEMO4A_buildPlan_(mUnarmed).reason, 'DESTINATION_ADDRESS_COORDINATE_AUTHORITY_NOT_ARMED', 'E9/D. an entirely unarmed authority is reported as NOT_ARMED, not as a plan-count problem');
  var conflict = mastersLive({ joinConflict: true });
  var tplW = conflict.templates.filter(function (t) { return DEMO4A_str_(t.destination_warehouse_id) === 'WH-KM-US-FBA-BFI4'; })[0];
  eq(DEMO4A_destAuthorityReason_(DEMO4A_destAuthorityForTemplate_(tplW, conflict.warehouses, conflict.locations, DEMO4A_DEST_COORD_AUTHORITY_, 'KM')), 'DESTINATION_WAREHOUSE_LOCATION_LINEAGE_UNRESOLVED', 'E10. a >1 warehouse↔logistics join is DESTINATION_WAREHOUSE_LOCATION_LINEAGE_UNRESOLVED');
  var pConf = DEMO4A_buildPlan_(conflict);
  ok(pConf.ok === true && pConf.per_shipment.every(function (x) { return x.destination_warehouse_code !== 'BFI4'; }), 'E10. a lineage-conflicted warehouse is EXCLUDED from the built plan (fails closed for that region)');
})();

section('V3G4-E11. origin and current compatibility remain enforced');
(function () {
  var m = mastersLive(); m.locations = m.locations.filter(function (l) { return DEMO4A_locId_(l) !== 'CN-PORT-SHA'; });
  eq(DEMO4A_selectTemplates_(m.templates, m.nodes, m.locations, { warehouses: m.warehouses, coordAuthority: DEMO4A_DEST_COORD_AUTHORITY_, company: 'KM' }).reason, 'NO_ROLE_COMPATIBLE_ORIGIN_LOCATION', 'E11. removing the only in-corridor origin still fails as NO_ROLE_COMPATIBLE_ORIGIN_LOCATION');
  var sel = DEMO4A_selectTemplates_(mL.templates, mL.nodes, mL.locations, G4_OPTS_);
  var it = sel._assignRaw.in_transit, cb = it.currentBinding;
  var ck = function (b) { return DEMO4A_num_(b.latitude).toFixed(5) + ',' + DEMO4A_num_(b.longitude).toFixed(5); };
  ok(cb && cb.current && ck(cb.current) !== ck(cb.origin) && ck(cb.current) !== ck(cb.destination), 'E11/E17. the current marker is transport/corridor-compatible AND distinct from BOTH origin and destination');
  ok(ck(cb.origin) !== ck(cb.destination), 'E17. origin and destination remain distinct');
  eq(DEMO4A_canonLocType_(cb.current.location_type), 'port', 'E11. the current marker is still bound to a transit-compatible gateway (not the warehouse)');
})();

section('V3G4-E12/E13/E14. selection and build consume the SAME evaluation; the route terminal carries it exactly');
(function () {
  var plan = DEMO4A_buildPlan_(mL);
  DEMO4A_SHIP_LIFECYCLE_.forEach(function (life) {
    var da = plan.destination_authority[life.slot];
    var code = DEMO4A_str_(da.warehouse_code), a = G3_APPROVED_[code];
    var sp = plan.per_shipment.filter(function (x) { return x.slot === life.slot; })[0];
    var rows = plan.tables.shipment_routes.filter(function (r) { return r.shipment_id === sp.shipment_id; }).sort(function (x, y) { return DEMO4A_num_(x.sequence_no) - DEMO4A_num_(y.sequence_no); });
    var dr = rows[rows.length - 1];
    eq([DEMO4A_num_(dr.latitude), DEMO4A_num_(dr.longitude)], [a.lat, a.lng], 'E13. ' + life.slot + ' final route terminal uses the EXACT approved coordinate');
    eq([dr.location_ref_type, dr.location_ref_id], ['logistics_location', 'LOC-' + G2_LIVE_[code].wid], 'E14. ' + life.slot + ' final location_ref_id is the warehouse-linked logistics_location_id');
    eq([DEMO4A_num_(dr.latitude), DEMO4A_num_(dr.longitude)], [da.latitude, da.longitude], 'E12. the constructed route row equals the SHARED evaluation used to qualify the template (no second rule)');
  });
  // object identity: the authority consumed by build IS the one produced during eligibility
  var sel = DEMO4A_selectTemplates_(mL.templates, mL.nodes, mL.locations, G4_OPTS_);
  ok(sel._assignRaw.delivered.binding.destination_authority && sel._assignRaw.delivered.binding.destination.latitude === sel._assignRaw.delivered.binding.destination_authority.latitude, 'E12. the eligibility binding and its destination_authority are the same evaluation');
})();

section('V3G4-E15/E16. received only at the approved final warehouse; in-transit destination stays planned');
(function () {
  var plan = DEMO4A_buildPlan_(mL);
  var deliv = plan.per_shipment.filter(function (x) { return x.slot === 'delivered'; })[0];
  var rows = plan.tables.shipment_routes.filter(function (r) { return r.shipment_id === deliv.shipment_id; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); });
  var dr = rows[rows.length - 1];
  var rcv = plan.tables.shipment_events.filter(function (e) { return DEMO4A_low_(e.event_type) === 'received'; });
  eq(rcv.length, 1, 'E15. exactly ONE received event exists across the whole Demo dataset');
  ok(DEMO4A_str_(rcv[0].shipment_id) === DEMO4A_str_(deliv.shipment_id) && DEMO4A_str_(rcv[0].shipment_route_id) === DEMO4A_str_(dr.shipment_route_id) && DEMO4A_num_(rcv[0].latitude) === DEMO4A_num_(dr.latitude), 'E15. the received event is emitted ONLY at the approved final warehouse route row');
  var it = plan.per_shipment.filter(function (x) { return x.slot === 'in_transit'; })[0];
  var itRows = plan.tables.shipment_routes.filter(function (r) { return r.shipment_id === it.shipment_id; }).sort(function (a, b) { return DEMO4A_num_(a.sequence_no) - DEMO4A_num_(b.sequence_no); });
  var itDest = itRows[itRows.length - 1];
  eq(DEMO4A_low_(itDest.status), 'planned', 'E16. the in-transit destination route row stays PLANNED');
  eq(plan.tables.shipment_events.filter(function (e) { return DEMO4A_str_(e.shipment_route_id) === DEMO4A_str_(itDest.shipment_route_id); }).length, 0, 'E16. the in-transit destination has NO event (no received on a planned node)');
})();

section('V3G4-E18/E19. deterministic W/C/E plan; checksum binds the destination authority evidence');
(function () {
  var base = DEMO4A_buildPlan_(mastersLive()).checksum;
  eq(DEMO4A_buildPlan_(mastersLive()).checksum, base, 'E18. identical live-shaped input → identical demo_plan_checksum (deterministic)');
  eq(DEMO4A_buildPlan_(mastersLive()).chosen_templates.map(function (c) { return c.region; }).sort().join(','), 'US_CENTRAL,US_EAST,US_WEST', 'E18. the exact W/C/E selection is deterministic');
  function ck(mut) { var a = JSON.parse(JSON.stringify(DEMO4A_DEST_COORD_AUTHORITY_)); mut(a); var m = mastersLive(); m.destCoordAuthority = a; var pl = DEMO4A_buildPlan_(m); return pl.ok ? pl.checksum : ('FAILED:' + pl.reason); }
  ok(ck(function (a) { a.BFI4.latitude = 47.5; }) !== base, 'E19. changing an approved coordinate changes the checksum');
  ok(ck(function (a) { a.AUS2.source_reference = 'https://example.invalid/x'; }) !== base, 'E19. changing an approved source reference changes the checksum');
  ok(ck(function (a) { a.ABE2.accuracy = 'rooftop'; }) !== base, 'E19. changing an approved accuracy changes the checksum');
})();

section('V3G4-E20/E21/E22. V3A protections intact; COMMITTED_UNVERIFIED impossible; constants untouched');
(function () {
  var plan = DEMO4A_buildPlan_(mL);
  var j = DEMO4A_buildJournal_(plan, 'DRY_RUN');
  ok(j && DEMO4A_verifyJournal_(j, DEMO4A_journalCanonical_(j)) !== false, 'E20. the durable journal builds + verifies over the live-shaped armed plan');
  ok(DEMO4A_rollbackPlan_(DEMO4A_allIds_(plan)).length > 0 && DEMO4A_anyInserted_(DEMO4A_allIds_(plan)) === true, 'E20. inserted-only rollback still derives');
  eq(DEMO4A_classifyState_(plan, emptyLive()).classification, 'ABSENT_ALL', 'E20. existing-state classification still works on the live-shaped plan');
})();
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'E22. confirmation + clear constants remain placeholders (COMMIT/CLEAR stay disarmed → COMMITTED_UNVERIFIED impossible)');
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length, 3, 'E22. still exactly three approved authorities (no fourth added, none changed)');
ok(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).every(function (k) { return DEMO4A_DEST_COORD_AUTHORITY_[k].latitude === G3_APPROVED_[k].lat && DEMO4A_DEST_COORD_AUTHORITY_[k].longitude === G3_APPROVED_[k].lng; }), 'E22. the three approved coordinates are unchanged');

section('V3G4-F. PREFLIGHT-grade compact evidence is exposed without dumping masters');
(function () {
  var sel = DEMO4A_selectTemplates_(mL.templates, mL.nodes, mL.locations, G4_OPTS_);
  ok(sel.warehouse_aware_template_evaluation === true && typeof sel.qualified_count === 'number' && typeof sel.current_capable_count === 'number' && sel.available_regions && sel.rejection_counts && sel.chosen, 'F. selection exposes warehouse-aware flag, qualified/current-capable counts, available regions, rejection counts and chosen templates');
  eq(sel.chosen.length, 3, 'F. exactly three chosen templates are reported (never all templates)');
  var mFail = mastersLive({ staleAddressAll: true });
  var failed = DEMO4A_selectTemplates_(mFail.templates, mFail.nodes, mFail.locations, { warehouses: mFail.warehouses, coordAuthority: DEMO4A_DEST_COORD_AUTHORITY_, company: 'KM' });
  eq(failed.reason, 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'F/D. the failing evaluation reports the most specific truthful reason');
  ok(failed.destination_authority_errors.length > 0 && failed.destination_authority_errors.length <= 6, 'F. a failing evaluation reports COMPACT per-template destination-authority evidence (capped, never a full dump)');
  ok(failed.destination_authority_errors.every(function (e) { return e.route_template_id && e.branch && DEMO4A_str_(e.warehouse_id) !== ''; }), 'F. each evidence row carries the template id, branch and exact warehouse id');
  var plan = DEMO4A_buildPlan_(mL);
  ok(plan.per_shipment.every(function (x) { return x.destination_warehouse_id && x.destination_warehouse_code && x.destination_logistics_location_id && x.destination_address_fingerprint && x.destination_coordinate_branch; }), 'F. per-shipment evidence carries the exact warehouse id, code, logistics_location_id, address fingerprint and coordinate branch');
  ok(plan.per_shipment.every(function (x) { return DEMO4A_mapDestinationEndpointSource_(x.destination_coordinate_branch) === 'DEST_ROUTE_TERMINAL_NODE'; }), 'F. map endpoint consumer readiness is reported per shipment');
})();

// ============================================================ V3G4A — COMPACT READ-ONLY AUTHORIZATION ENVELOPE
// The V3G4 live PREFLIGHT reached the correct warehouse-aware path but its single Logger entry was TRUNCATED before the
// verdict, existing_state, the full gates, West/Central evidence, demo_plan_checksum and the zero-write marker. These
// tests prove the compact envelope carries every authorization-bearing fact, stays far below any truncation ceiling, and
// authorizes DRY_RUN only under the COMPLETE conjunction.
var A_SRC_ = extractFn(G, 'TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION');
var A_CORE_ = extractFn(G, 'DEMO4A_authorizationSummary_');
var A_SCHEMA_OK_ = { ok: true, tables: {} };
var A_MASTERS_PRESENT_ = { present: { shipment_route_templates: true, shipment_route_template_nodes: true, logistics_locations: true, marketplace_skus: true, sku_details: true, warehouses: true } };
var A_PROP_ = { verdict: 'THREE_REGION_COORDINATE_PROPOSAL_READY', proposal_entries: 3 };
var A_PLAN_ = DEMO4A_buildPlan_(mastersLive());
function envOf(over) {
  over = over || {};
  var plan = over.plan || A_PLAN_;
  return DEMO4A_authorizationSummary_(over.schema || A_SCHEMA_OK_, over.masters || A_MASTERS_PRESENT_, plan, over.planRepeat === undefined ? plan : over.planRepeat, over.live || emptyLive(), over.proposal === undefined ? A_PROP_ : over.proposal);
}
function clonePlan(mut) { var p = JSON.parse(JSON.stringify(A_PLAN_)); if (mut) mut(p); return p; }
var A_ENV_ = envOf();
var A_JSON_ = JSON.stringify(A_ENV_);
var A_CEILING_ = 6000;   // fixed SAFE byte ceiling — Apps Script Logger truncates far above this

section('V3G4A-E1/E2/E16. exactly one Logger entry, no nested verbose log, no write API reachable');
eq((A_SRC_.match(/Logger\.log\(/g) || []).length, 1, 'E1. the entrypoint emits EXACTLY ONE Logger entry');
ok(/Logger\.log\('DEMO4A_AUTHORIZATION_SUMMARY '/.test(A_SRC_) && /JSON\.stringify\(out\)\)/.test(A_SRC_), 'E1/E3. the single entry is the compact DEMO4A_AUTHORIZATION_SUMMARY envelope (no pretty-printing)');
ok(/TEMP_DEMO4A_(PREFLIGHT|DRY_RUN|COMMIT|VALIDATE|CLEAR|DIAGNOSE)/.test(A_SRC_) === false, 'E2. it never calls another TEMP entrypoint — no nested/verbose logging is produced');
ok(/Logger\.log/.test(A_CORE_) === false, 'E2. the pure envelope core logs nothing at all');
ok(/appendRow|deleteRow|setValue|setValues|insertRow|clearContent|setProperty|deleteProperty|getRange\(/.test(A_SRC_) === false && /appendRow|deleteRow|setValue|setValues|setProperty/.test(A_CORE_) === false, 'E16. no write API is reachable from the summary entrypoint or its core');
ok(/DEMO4A_buildPlan_|DEMO4A_schemaGate_|DEMO4A_readMasters_|DEMO4A_readLive_|DEMO4A_validateCoordProposal_/.test(A_SRC_), 'A. it invokes the SAME pure schema/master/build/classification/proposal logic used by PREFLIGHT and DRY_RUN');
ok(/DEMO4A_preflightVerdict_|DEMO4A_warehouseGates_|DEMO4A_classifyState_/.test(A_CORE_), 'A. the core reuses the shared verdict / warehouse-gate / classification rules (no second approximate evaluator)');

section('V3G4A-E3/E8. the envelope is compact and truncation cannot remove the verdict or the checksum');
ok(A_JSON_.length < A_CEILING_, 'E3. the READY envelope serializes to ' + A_JSON_.length + ' bytes — below the ' + A_CEILING_ + '-byte safe ceiling');
ok(JSON.stringify(envOf({ plan: DEMO4A_buildPlan_(mastersLive({ staleAddressAll: true })) })).length < A_CEILING_, 'E3. the FAILURE envelope is also compact');
ok(A_JSON_.indexOf('"preflight_verdict"') < A_CEILING_ && A_JSON_.indexOf('"demo_plan_checksum"') < A_CEILING_ && A_JSON_.indexOf('"may_run_dry_run"') < A_CEILING_ && A_JSON_.indexOf('"DEMO4A_ZERO_WRITE') === -1, 'E8. verdict, checksum and authorization flags all sit well inside the ceiling (cannot be truncated away)');
ok(/binding_evidence|master_row_counts|route_geography_evidence|destination_authority_errors|planned_ids|sku_pairs|event_chronology/.test(A_JSON_) === false, 'D. no binding_evidence / master dumps / route-event dumps / SKU pairs / error arrays leak into the envelope');
ok(A_JSON_.indexOf('shipment_routes') !== -1 && A_JSON_.split('shipment_route_id').length === 1, 'D. route ROW COUNTS are present but no route rows are dumped');

section('V3G4A-E4. every required field is present');
['authority_contract_version', 'schema_ok', 'masters_ok', 'proposal_verdict', 'proposal_entries', 'coordinate_authority_armed', 'coordinate_authority_entries',
 'warehouse_aware_template_evaluation', 'qualified_count', 'current_capable_count', 'region_selection_mode', 'available_regions', 'selected_templates', 'scope',
 'planned_counts', 'per_shipment', 'gate_summary', 'existing_state', 'demo_plan_checksum', 'preflight_verdict', 'preflight_reason', 'predicted_dry_run_verdict',
 'may_run_dry_run', 'may_arm_commit_checksum'].forEach(function (k) { ok(A_ENV_[k] !== undefined, 'E4. envelope carries ' + k); });
eq(Object.keys(A_ENV_.scope).sort().join(','), 'company,country,marketplace,sku_pair_count', 'E4/B. scope carries exactly company/country/marketplace/sku_pair_count');
eq(Object.keys(A_ENV_.planned_counts).sort().join(','), 'shipment_events,shipment_lines,shipment_routes,shipments,shipping_plan_lines,shipping_plans,total', 'E4/B. planned_counts carries all six tables + total');
eq(Object.keys(A_ENV_.existing_state).sort().join(','), 'classification,duplicate_pk_count_total,unexpected_demo_id_count', 'E4/B. existing_state is the three compact fields');
['all_role_bindings_compatible', 'all_corridor_bindings_compatible', 'primary_current_distinct', 'no_unrelated_third_country', 'sea_truck_destination_not_airport',
 'warehouse_business_identity_ready', 'warehouse_address_authority_ready', 'warehouse_location_lineage_ready', 'destination_display_coordinate_ready',
 'map_consumes_destination_coordinate', 'status_truthfulness_ready', 'route_geography_ready', 'live_plan_shape_valid', 'all_pass'].forEach(function (k) { eq(A_ENV_.gate_summary[k], true, 'E4/B. gate_summary.' + k + ' present and true'); });
eq(A_ENV_.authority_contract_version, 'V3G4A-1', 'E4. the authority contract version is stamped');
ok(/DEMO4A_ZERO_WRITE_CONFIRMED/.test(A_SRC_), 'E4/B. the entrypoint stamps DEMO4A_ZERO_WRITE_CONFIRMED on the envelope');

section('V3G4A-E5/E6. exactly three compact shipment objects; exact W/C/E coverage');
eq(A_ENV_.per_shipment.length, 3, 'E5. exactly three per-shipment objects');
eq(Object.keys(A_ENV_.per_shipment[0]).sort().join(','), ['current_location_id', 'destination_address_fingerprint', 'destination_coordinate_accuracy', 'destination_coordinate_branch', 'destination_logistics_location_id', 'destination_renderable', 'destination_warehouse_code', 'destination_warehouse_id', 'event_rows', 'origin_location_id', 'plan_lines', 'region', 'route_rows', 'shipment_id', 'shipment_lines', 'slot', 'status', 'template_id'].join(','), 'E5/B. each shipment object carries ONLY the 18 authorized compact fields');
eq(A_ENV_.selected_templates.map(function (t) { return t.region; }).sort().join(','), 'US_CENTRAL,US_EAST,US_WEST', 'E6. the three selected templates cover W/C/E exactly once each');
eq(Object.keys(A_ENV_.selected_templates[0]).sort().join(','), 'node_count,region,template_id', 'E6/B. selected_templates carries only template_id + region + node_count');
eq(A_ENV_.per_shipment.map(function (x) { return x.destination_warehouse_code; }).sort().join(','), 'ABE2,AUS2,BFI4', 'E6. the three approved destination warehouses appear once each');
ok(A_ENV_.per_shipment.every(function (x) { return x.destination_renderable === true && x.destination_coordinate_branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE' && /^[0-9a-f]{8}$/.test(x.destination_address_fingerprint); }), 'E6. each shipment reports a renderable approved address-derived destination with its live fingerprint');

section('V3G4A-E7. may_run_dry_run is true ONLY under the complete conjunction');
eq([A_ENV_.may_run_dry_run, A_ENV_.preflight_verdict, A_ENV_.predicted_dry_run_verdict], [true, 'READY_FOR_DEMO_SEED', 'DRY_RUN_READY'], 'E7. the fully-satisfied envelope authorizes DRY_RUN');
[['schema not ok', { schema: { ok: false, tables: {} } }],
 ['a master table absent', { masters: { present: { shipment_route_templates: true, shipment_route_template_nodes: true, logistics_locations: true, marketplace_skus: true, sku_details: true, warehouses: false } } }],
 ['proposal verdict not READY', { proposal: { verdict: 'COORDINATE_PROPOSAL_STALE', proposal_entries: 3 } }],
 ['proposal entries != 3', { proposal: { verdict: 'THREE_REGION_COORDINATE_PROPOSAL_READY', proposal_entries: 2 } }],
 ['live rows already present', { live: liveFromPlan(A_PLAN_) }],
 ['plan build blocked', { plan: DEMO4A_buildPlan_(mastersLive({ staleAddressAll: true })) }]
].forEach(function (c) { eq(envOf(c[1]).may_run_dry_run, false, 'E7. ' + c[0] + ' → may_run_dry_run false'); });
// the dry-run-core determinism re-check gates ARMING (per the C contract), not DRY_RUN itself.
(function () { var e = envOf({ planRepeat: clonePlan(function (p) { p.checksum = 'deadbeef'; }) });
  eq([e.may_run_dry_run, e.may_arm_commit_checksum, e.dry_run_core_checksum_reproduced], [true, false, false], 'E7/C. a non-reproducing dry-run core checksum blocks ARMING while DRY_RUN itself stays authorized'); })();

section('V3G4A-E9/E10. ABSENT_ALL is required; PRESENT / PARTIAL / duplicate / unexpected states block');
eq(A_ENV_.existing_state.classification, 'ABSENT_ALL', 'E9. the authorized envelope requires ABSENT_ALL');
(function () {
  var present = envOf({ live: liveFromPlan(A_PLAN_) });
  eq([present.existing_state.classification, present.preflight_verdict, present.may_run_dry_run], ['PRESENT_EXACT_ALL', 'ALREADY_SEEDED_EXACT', false], 'E10. PRESENT_EXACT_ALL blocks DRY_RUN authorization');
  var partialLive = liveFromPlan(A_PLAN_); partialLive.shipment_events = { present: true, headers: partialLive.shipment_events.headers, rows: [] };
  var partial = envOf({ live: partialLive });
  ok(partial.existing_state.classification !== 'ABSENT_ALL' && partial.may_run_dry_run === false, 'E10. a PARTIAL live state blocks DRY_RUN authorization');
  var dupLive = liveFromPlan(A_PLAN_); dupLive.shipments.rows = dupLive.shipments.rows.concat([dupLive.shipments.rows[0]]);
  ok(envOf({ live: dupLive }).may_run_dry_run === false, 'E10. duplicate PKs block DRY_RUN authorization');
})();

section('V3G4A-E11/E12/E13/E14. one false gate, fallback mode, a missing region and a missing template each block');
eq(envOf({ plan: clonePlan(function (p) { p.binding_gates.sea_truck_destination_not_airport = false; p.binding_gates.ok = false; }) }).may_run_dry_run, false, 'E11. a single false binding gate blocks (and all_pass goes false)');
ok(envOf({ plan: clonePlan(function (p) { p.binding_gates.sea_truck_destination_not_airport = false; p.binding_gates.ok = false; }) }).gate_summary.all_pass === false, 'E11. gate_summary.all_pass reflects the single false gate');
eq(envOf({ plan: clonePlan(function (p) { p.counts.shipment_events = 0; p.counts.total = p.counts.total - 5; }) }).gate_summary.live_plan_shape_valid, false, 'E11. a structurally impossible planned shape fails live_plan_shape_valid');
eq(envOf({ plan: clonePlan(function (p) { p.region_selection_mode = 'FALLBACK_TRUTHFUL_TOP3'; }) }).may_run_dry_run, false, 'E12. FALLBACK_TRUTHFUL_TOP3 blocks — only DISTINCT_WCE authorizes');
eq(envOf({ plan: clonePlan(function (p) { p.available_regions.US_EAST = 0; }) }).may_run_dry_run, false, 'E13. a missing available region blocks');
eq(envOf({ plan: clonePlan(function (p) { p.chosen_templates = p.chosen_templates.slice(0, 2); }) }).may_run_dry_run, false, 'E14. fewer than three selected templates blocks');
eq(envOf({ plan: clonePlan(function (p) { p.chosen_templates[0].region = 'US_WEST'; p.chosen_templates[1].region = 'US_WEST'; }) }).may_run_dry_run, false, 'E14. three templates that do NOT cover W/C/E once each blocks');
eq(envOf({ plan: clonePlan(function (p) { p.current_capable_count = 0; }) }).may_run_dry_run, false, 'E14. a current-incapable selection blocks');
eq(envOf({ plan: clonePlan(function (p) { p.qualified_count = 2; }) }).may_run_dry_run, false, 'E14. fewer than three qualified templates blocks');
eq(envOf({ plan: clonePlan(function (p) { p.warehouse_aware_template_evaluation = false; }) }).may_run_dry_run, false, 'C. an inactive warehouse-aware evaluation blocks');
eq(envOf({ plan: clonePlan(function (p) { p.checksum = ''; }) }).may_run_dry_run, false, 'C. an empty demo_plan_checksum blocks');

section('V3G4A-E15. a changed plan is surfaced as a changed checksum');
(function () {
  var alt = {}; Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).forEach(function (k) { alt[k] = JSON.parse(JSON.stringify(DEMO4A_DEST_COORD_AUTHORITY_[k])); });
  alt.BFI4.latitude = 47.5;
  var mAlt = mastersLive(); mAlt.destCoordAuthority = alt;
  var envAlt = envOf({ plan: DEMO4A_buildPlan_(mAlt) });
  ok(envAlt.demo_plan_checksum !== '' && envAlt.demo_plan_checksum !== A_ENV_.demo_plan_checksum, 'E15. a changed approved coordinate surfaces a DIFFERENT demo_plan_checksum in the envelope');
  eq(envOf({ planRepeat: clonePlan(function (p) { p.checksum = 'deadbeef'; }) }).dry_run_core_checksum_reproduced, false, 'E15. a non-reproducing dry-run core checksum is reported and blocks arming');
})();

section('V3G4A-E17. the extracted PREFLIGHT verdict rule reproduces the previous behaviour exactly');
eq(DEMO4A_preflightVerdict_(false, A_PLAN_, { applicable: true, ok: true }, 'ABSENT_ALL'), 'PREFLIGHT_FAILED_SCHEMA', 'E17. schema failure verdict unchanged');
eq(DEMO4A_preflightVerdict_(true, clonePlan(function (p) { p.binding_gates.ok = false; }), { applicable: true, ok: true }, 'ABSENT_ALL'), 'PREFLIGHT_FAILED_BINDING_GATES', 'E17. binding-gate failure verdict unchanged');
eq(DEMO4A_preflightVerdict_(true, A_PLAN_, { applicable: true, ok: false }, 'ABSENT_ALL'), 'PREFLIGHT_FAILED_WAREHOUSE_AUTHORITY', 'E17. warehouse-authority failure verdict unchanged');
eq(DEMO4A_preflightVerdict_(true, A_PLAN_, { applicable: true, ok: true }, 'ABSENT_ALL'), 'READY_FOR_DEMO_SEED', 'E17. READY verdict unchanged');
eq(DEMO4A_preflightVerdict_(true, A_PLAN_, { applicable: true, ok: true }, 'PRESENT_EXACT_ALL'), 'ALREADY_SEEDED_EXACT', 'E17. already-seeded verdict unchanged');
eq(DEMO4A_preflightVerdict_(true, A_PLAN_, { applicable: true, ok: true }, 'CONTENT_DRIFT'), 'BLOCKED_CONTENT_DRIFT', 'E17. blocked-classification verdict unchanged');
ok(/DEMO4A_preflightVerdict_\(schema\.ok, plan, out\.warehouse_gates, cls\.classification\)/.test(G), 'E17. PREFLIGHT itself now consumes the shared verdict rule (one rule, two callers)');

section('V3G4A-E18/E19. V3A protections and confirmation constants untouched');
(function () {
  var j = DEMO4A_buildJournal_(A_PLAN_, 'DRY_RUN');
  ok(j && DEMO4A_verifyJournal_(j, DEMO4A_journalCanonical_(j)) !== false && DEMO4A_rollbackPlan_(DEMO4A_allIds_(A_PLAN_)).length > 0, 'E18. journal build/verify and inserted-only rollback remain intact');
})();
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'E19. both confirmation constants remain placeholders');
eq(A_ENV_.confirmation_constant_status, 'PLACEHOLDER', 'E19. the envelope reports the confirmation constant as PLACEHOLDER');
ok(/DEMO4A_CONFIRMED_SEED_CHECKSUM_\s*=[^=]/.test(A_SRC_) === false && /DEMO4A_CONFIRMED_SEED_CHECKSUM_\s*=[^=]/.test(A_CORE_) === false, 'C/E19. neither the entrypoint nor the core ever assigns the confirmation constant');
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length, 3, 'G. the coordinate authority still holds exactly the three approved entries');
ok(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).every(function (k) { return DEMO4A_DEST_COORD_AUTHORITY_[k].latitude === G3_APPROVED_[k].lat && DEMO4A_DEST_COORD_AUTHORITY_[k].longitude === G3_APPROVED_[k].lng; }), 'G. the approved coordinates are unchanged');

section('V3G4A-D. a FAILING envelope stays tiny: reason counts + at most five short codes');
(function () {
  var envFail = envOf({ plan: DEMO4A_buildPlan_(mastersLive({ staleAddressAll: true })) });
  eq([envFail.may_run_dry_run, envFail.may_arm_commit_checksum, envFail.predicted_dry_run_verdict], [false, false, 'DRY_RUN_BLOCKED'], 'D. a blocked plan authorizes nothing');
  ok(envFail.reason_codes.length <= 5 && envFail.per_shipment.length === 0 && envFail.selected_templates.length === 0, 'D. the failure envelope keeps at most five reason codes and dumps no shipments/templates');
  eq(envFail.preflight_reason, 'DESTINATION_ADDRESS_COORDINATE_UNRESOLVED', 'D. the failure envelope carries the most specific truthful reason');
})();

// ============================================================ V3G5 — POST-WRITE CONTENT_DRIFT FORENSICS + CANONICALIZATION
// The controlled COMMIT inserted exactly 3/8/3/8/46/5 and then failed POSTCHECK_NOT_EXACT:CONTENT_DRIFT, rolling back
// exactly those rows. Two source-proven mechanisms can do that after a technically successful round trip:
//   (1) WRITER_INTENDED_FIELD_NOT_IN_PHYSICAL_HEADER — DEMO4A_rowForHeaders_ silently drops an intended field with no
//       physical column; it reads back blank while the intended value is non-empty.
//   (2) DATE_WALLCLOCK_ASYMMETRY — an intended date/datetime is written as a STRING and read back as a Date OBJECT; the
//       string path applies no timezone maths while the Date path shifts by the canonical offset, so they only agreed
//       when the spreadsheet timezone was exactly UTC+8.
// The simulator below models the real Apps Script coercions (date-formatted cells return Date objects, numeric cells
// return numbers, checkbox cells return booleans, absent columns read back undefined) over the intended 73-row plan.
var V5_PLAN_ = DEMO4A_buildPlan_(mastersLive());
function v5Headers(over) {
  over = over || {}; var h = {};
  DEMO4A_WRITE_ORDER_.forEach(function (t) {
    var seen = {}; (V5_PLAN_.tables[t] || []).forEach(function (r) { Object.keys(r).forEach(function (k) { seen[k] = 1; }); });
    var cols = Object.keys(seen);
    if (over.dropField && over.dropField.table === t) cols = cols.filter(function (c) { return c !== over.dropField.field; });
    if (over.extraColumns) cols = cols.concat(['legacy_note_unowned', 'formula_total_unowned']);
    h[t] = cols;
  });
  return h;
}
// ONE simulated write→read round trip: project onto physical headers, apply Sheet coercions, read back as row objects.
function v5RoundTrip(headers, opts) {
  opts = opts || {};
  var sheetTz = opts.sheetTzMin === undefined ? 480 : opts.sheetTzMin;
  var live = {};
  DEMO4A_WRITE_ORDER_.forEach(function (t) {
    var cols = headers[t] || [], rows = [];
    (V5_PLAN_.tables[t] || []).forEach(function (r) {
      var cell = {}, projected = DEMO4A_rowForHeaders_(cols, r);
      cols.forEach(function (c, i) {
        var v = projected[i], cls = DEMO4A_fieldClass_(c);
        if (v === '' || v == null) { cell[c] = ''; return; }
        if ((cls === 'date' || cls === 'datetime') && typeof v === 'string' && !opts.datesStayText) {
          // a date-formatted cell: Sheets parses the wall-clock string in the SHEET timezone and returns a Date object.
          var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
          if (m) { cell[c] = new Date(Date.UTC(+m[1], (+m[2]) - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - sheetTz * 60000); return; }
        }
        if ((cls === 'numeric' || cls === 'coordinate') && !opts.numbersStayText) { var n = Number(v); if (isFinite(n)) { cell[c] = n; return; } }
        if (cls === 'boolean' && /^(TRUE|FALSE)$/.test(String(v))) { cell[c] = String(v) === 'TRUE'; return; }
        cell[c] = v;
      });
      if (opts.mutate) opts.mutate(t, cell, r);
      rows.push(cell);
    });
    live[t] = { present: true, headers: cols, rows: rows };
  });
  return live;
}
function v5Classify(headers, opts) { return DEMO4A_classifyState_(V5_PLAN_, v5RoundTrip(headers, opts)); }

section('V3G5-F1/F2. an exact Apps-Script-like setValues/getValues round trip classifies PRESENT_EXACT_ALL');
DEMO4A_setCanonTzOffsetMin_(480);
eq(v5Classify(v5Headers(), { sheetTzMin: 480 }).classification, 'PRESENT_EXACT_ALL', 'F1/F21. a complete round trip with Date/number/boolean coercions is byte-exact (spreadsheet tz == canonical tz)');
eq(v5Classify(v5Headers(), { sheetTzMin: 480, datesStayText: true, numbersStayText: true }).classification, 'PRESENT_EXACT_ALL', 'F1. the same rows read back as plain TEXT are also exact (the contract is representation-tolerant per field class, not per type)');
(function () {
  // MECHANISM 2 proof + fix: with the canonical offset NOT synced to the spreadsheet, every datetime row drifts.
  DEMO4A_setCanonTzOffsetMin_(0);
  var bad = v5Classify(v5Headers(), { sheetTzMin: 480 });
  eq(bad.classification, 'CONTENT_DRIFT', 'F2/A(2). a canonical offset that does not match the spreadsheet timezone reproduces CONTENT_DRIFT after a successful round trip');
  var ev = DEMO4A_driftEvidence_(bad);
  ok(ev.counts_by_reason_class.DATE_WALLCLOCK_ASYMMETRY > 0, 'F2/A(2). the forensics name the mechanism: DATE_WALLCLOCK_ASYMMETRY');
  DEMO4A_setCanonTzOffsetMin_(480);
  eq(v5Classify(v5Headers(), { sheetTzMin: 480 }).classification, 'PRESENT_EXACT_ALL', 'F2. syncing the canonical offset to the spreadsheet timezone REPAIRS it');
})();

section('V3G5-A(1). the writer-projection gate: a dropped physical column is caught BEFORE any write');
(function () {
  var full = DEMO4A_writerProjectionGaps_(V5_PLAN_, v5Headers());
  ok(full.ok === true && full.missing_total === 0 && full.intended_field_total > 70, 'A(1). a complete physical schema passes the pre-write projection gate (' + full.intended_field_total + ' intended fields)');
  var gapHeaders = v5Headers({ dropField: { table: 'shipments', field: 'currency' } });
  var gap = DEMO4A_writerProjectionGaps_(V5_PLAN_, gapHeaders);
  ok(gap.ok === false && gap.missing_total === 1 && gap.missing_fields[0].table === 'shipments' && gap.missing_fields[0].field === 'currency', 'A(1). a missing physical column is detected with its exact table + field + class');
  // and WITHOUT the gate that same schema would have produced exactly the observed incident
  var drift = v5Classify(gapHeaders, { sheetTzMin: 480 });
  eq(drift.classification, 'CONTENT_DRIFT', 'A(1). the dropped field reproduces CONTENT_DRIFT after a full insert');
  var ev = DEMO4A_driftEvidence_(drift);
  ok(ev.counts_by_reason_class.MISSING_PHYSICAL_FIELD > 0 && ev.examples.some(function (x) { return x.field === 'currency' && x.reason_code === 'MISSING_PHYSICAL_FIELD' && x.live_type === 'undefined'; }), 'A(1)/F14. the forensics name the exact field and reason MISSING_PHYSICAL_FIELD');
  ok(/var projection = DEMO4A_writerProjectionGaps_\(plan2, headersByTable\);/.test(commitFn) && /if \(!projection\.ok\) \{ out\.verdict = 'COMMIT_BLOCKED_WRITER_PROJECTION_INCOMPLETE'/.test(commitFn), 'A(1). COMMIT runs the projection gate and blocks with ZERO writes');
  var beforeJournal = commitFn.indexOf('DEMO4A_writerProjectionGaps_') < commitFn.indexOf('setProperty(DEMO4A_JOURNAL_KEY_');
  ok(beforeJournal && commitFn.indexOf('DEMO4A_writerProjectionGaps_') < commitFn.indexOf("phase = 'insert'"), 'A(1). the gate runs BEFORE the journal property write and before any insert');
})();

section('V3G5-F3..F9. field-class canonicalization: numeric / blank / boolean / invalid / identifier / text / coordinate');
eq([DEMO4A_canonField_('plan_carton_qty', 12, 480), DEMO4A_canonField_('plan_carton_qty', '12', 480)], ['12', '12'], 'F3. a declared numeric compares equal as number and as numeric string');
eq([DEMO4A_canonField_('plan_carton_qty', 0, 480), DEMO4A_canonField_('plan_carton_qty', '', 480)], ['0', ''], 'F4. ZERO is a real value and blank is NOT zero');
eq([DEMO4A_canonField_('is_active', false, 480), DEMO4A_canonField_('is_active', '', 480)], ['FALSE', ''], 'F5. FALSE is a real value and blank is NOT false');
eq([DEMO4A_canonField_('is_active', 'TRUE', 480), DEMO4A_canonField_('is_active', true, 480), DEMO4A_canonField_('is_active', 'maybe', 480)], ['TRUE', 'TRUE', 'BOOL_INVALID:maybe'], 'F5/F6. accepted boolean representations canonicalize; an unrelated string FAILS CLOSED');
eq([DEMO4A_canonField_('plan_carton_qty', 'twelve', 480), DEMO4A_canonField_('etd', 'not-a-date', 480), DEMO4A_canonField_('created_at', 'nope', 480)], ['NUM_INVALID:twelve', 'DATE_INVALID:not-a-date', 'DATETIME_INVALID:nope'], 'F6. unparseable numeric/date/datetime values fail closed with typed sentinels');
ok(DEMO4A_canonField_('plan_carton_qty', 'twelve', 480) !== DEMO4A_canonField_('plan_carton_qty', '', 480), 'F6. an invalid sentinel never equals blank');
eq([DEMO4A_canonField_('sku', '007', 480), DEMO4A_canonField_('postal_code', '07101', 480), DEMO4A_canonField_('shipment_id', '0012', 480)], ['007', '07101', '0012'], 'F7. text/identifier leading zeros are preserved (never numeric-coerced)');
eq([DEMO4A_canonField_('location_name', 'Amazon BFI4 Kent', 480), DEMO4A_canonField_('status', 'In_Transit', 480), DEMO4A_canonField_('note', '  spaced  ', 480)], ['Amazon BFI4 Kent', 'In_Transit', 'spaced'], 'F8. arbitrary business text and enums stay EXACT (case preserved; only the writer-contract trim applies)');
ok(DEMO4A_canonField_('status', 'IN_TRANSIT', 480) !== DEMO4A_canonField_('status', 'in_transit', 480), 'F8. enum text is never lowercased — case is significant');
eq([DEMO4A_canonField_('latitude', 47.4145, 480), DEMO4A_canonField_('latitude', '47.4145', 480), DEMO4A_canonField_('longitude', -75.61500997116448, 480)], ['47.4145', '47.4145', '-75.61500997116448'], 'F9. coordinate canonicalization is a stable canonical decimal — non-lossy and never rounded');
eq(DEMO4A_fieldClass_('latitude'), 'coordinate', 'F9. coordinates are classified separately from business numerics');
(function () {
  var d = new Date(Date.UTC(2026, 7, 20, 1, 0, 0));   // 2026-08-20 09:00 wall clock at +480
  eq([DEMO4A_canonField_('created_at', d, 480), DEMO4A_canonField_('created_at', '2026-08-20 09:00:00', 480)], ['2026-08-20 09:00:00', '2026-08-20 09:00:00'], 'F2. a Date OBJECT and the ISO string agree on a declared datetime under the contract offset');
  eq(DEMO4A_canonField_('etd', new Date(Date.UTC(2026, 7, 23, 16, 0, 0)), 480), '2026-08-24', 'F2. a date-only field canonicalizes the same wall-clock day');
  ok(DEMO4A_canonField_('etd', d, 480) !== DEMO4A_canonField_('created_at', d, 480), 'F2. date-only and datetime classes are never conflated');
})();

section('V3G5-F10/F11. physical alias contract + writer-unowned columns');
(function () {
  eq([DEMO4A_fieldClass_('marketplace'), DEMO4A_fieldClass_('marketplace_seperate')], ['enum', 'enum'], 'F10. both marketplace spellings are declared enum text (never numeric, never lowercased)');
  var h = v5Headers({ extraColumns: true });
  var proj = DEMO4A_writerProjectionGaps_(V5_PLAN_, h);
  ok(proj.ok === true && proj.writer_unowned_column_counts.shipments === 2, 'F11. writer-unowned physical columns are COUNTED and reported, never compared');
  eq(v5Classify(h, { sheetTzMin: 480 }).classification, 'PRESENT_EXACT_ALL', 'F11. extra writer-unowned/default-only columns do NOT cause drift (comparison uses only intended fields)');
  var live = v5RoundTrip(h, { sheetTzMin: 480, mutate: function (t, cell) { cell.legacy_note_unowned = 'someone elses production value'; } });
  eq(DEMO4A_classifyState_(V5_PLAN_, live).classification, 'PRESENT_EXACT_ALL', 'F11. an unrelated production value in a writer-unowned column is ignored by the explicit contract');
  ok(JSON.stringify(DEMO4A_driftEvidence_(DEMO4A_classifyState_(V5_PLAN_, live))).indexOf('someone elses production value') === -1, 'C. unrelated production values never leak into the forensic envelope');
})();

section('V3G5-F12/F13/F14. a real business mutation still drifts and is named exactly');
[['shipment_lines', 'sku', 'KM-WRONG', 'VALUE_MUTATION'],
 ['shipment_lines', 'shipment_carton_qty', 999, 'NUMERIC_REPRESENTATION_OR_VALUE'],
 ['shipments', 'status', 'cancelled', 'VALUE_MUTATION'],
 ['shipments', 'eta', '2027-01-01', 'VALUE_MUTATION'],
 ['shipments', 'warehouse_id', 'WH-KM-US-FBA-WRONG', 'VALUE_MUTATION'],
 ['shipment_routes', 'location_ref_id', 'LOC-WRONG', 'VALUE_MUTATION'],
 ['shipment_routes', 'latitude', 1.234, 'NUMERIC_REPRESENTATION_OR_VALUE']
].forEach(function (c) {
  var live = v5RoundTrip(v5Headers(), { sheetTzMin: 480, mutate: function (t, cell) { if (t === c[0] && Object.prototype.hasOwnProperty.call(cell, c[1])) cell[c[1]] = c[2]; } });
  var cls = DEMO4A_classifyState_(V5_PLAN_, live);
  eq(cls.classification, 'CONTENT_DRIFT', 'F12/F13. a mutated ' + c[0] + '.' + c[1] + ' is still detected as CONTENT_DRIFT');
  var ev = DEMO4A_driftEvidence_(cls);
  ok(ev.examples.some(function (x) { return x.table === c[0] && x.field === c[1] && x.reason_code === c[3] && /^[0-9a-f]{8}$/.test(x.pk_fingerprint); }), 'F14. the evidence names the exact table / PK fingerprint / field / reason for ' + c[0] + '.' + c[1]);
});
(function () {
  var live = v5RoundTrip(v5Headers(), { sheetTzMin: 480, mutate: function (t, cell) { if (t === 'shipments') cell.eta = ''; } });
  var ev = DEMO4A_driftEvidence_(DEMO4A_classifyState_(V5_PLAN_, live));
  ok(ev.counts_by_reason_class.LIVE_BLANK_INTENDED_VALUE > 0, 'F13/C. a blanked live value is classified LIVE_BLANK_INTENDED_VALUE (distinct from a missing column)');
})();

section('V3G5-F15/C. the forensic envelope is capped and truncation-safe');
(function () {
  DEMO4A_setCanonTzOffsetMin_(0);
  var cls = v5Classify(v5Headers(), { sheetTzMin: 480 });
  var ev = DEMO4A_driftEvidence_(cls);
  DEMO4A_setCanonTzOffsetMin_(480);
  eq(ev.example_cap, 20, 'F15. the example cap is 20');
  ok(ev.examples.length <= 20 && ev.mismatching_field_count > 20, 'F15. many more fields drifted (' + ev.mismatching_field_count + ') than the ' + ev.examples.length + ' examples kept');
  ok(ev.mismatching_row_count > 0 && ev.mismatching_table_count > 0 && ev.counts_by_table && ev.counts_by_reason_class, 'C. counts by table and by reason class are reported');
  ok(JSON.stringify(ev).length < 6000, 'F15. the whole evidence envelope is ' + JSON.stringify(ev).length + ' bytes — truncation-safe');
  ok(ev.examples.every(function (x) { return Object.keys(x).sort().join(',') === 'field,field_class,intended_canonical,intended_type,live_canonical,live_type,pk_fingerprint,reason_code,table'; }), 'C. each example carries ONLY the nine authorized keys (no whole rows)');
  ok(DEMO4A_driftClip_('x'.repeat(200)).length < 60, 'C. individual values are clipped safely');
  ok(JSON.stringify(ev).indexOf('DEMO-4A-SHP') === -1, 'C. PKs appear only as fingerprints, never as raw ids');
})();

section('V3G5-F16/F17/F18/F23. evidence never delays or replaces rollback; COMMITTED_UNVERIFIED impossible');
ok(commitFn.indexOf('driftEvidence = DEMO4A_driftEvidence_(post);') < commitFn.indexOf("throw new Error('POSTCHECK_NOT_EXACT:"), 'F16. drift evidence is captured from the ALREADY-computed classification and then the postcheck still throws');
ok(/driftEvidence = DEMO4A_driftEvidence_\(post\);[\s\S]*?throw new Error\('POSTCHECK_NOT_EXACT:'[\s\S]*?catch \(e\)[\s\S]*?DEMO4A_anyInserted_\(inserted\)[\s\S]*?DEMO4A_rollbackInserted_\(inserted\)/.test(commitFn), 'F16/F17. the unified catch still rolls back exactly this execution inserts after the evidence is captured');
ok(/if \(driftEvidence\) out\.postcheck_drift_evidence = driftEvidence;/.test(commitFn), 'C. the evidence is attached to the rolled-back COMMIT output');
ok(/rb\.ok \? 'COMMIT_FAILED_POSTCHECK_ROLLED_BACK' : 'COMMIT_FAILED_POSTCHECK_ROLLBACK_UNVERIFIED'/.test(commitFn), 'F18. rollback VERIFICATION remains mandatory and decides the verdict');
ok(/COMMITTED_UNVERIFIED/.test(G) === false, 'F23. COMMITTED_UNVERIFIED does not exist anywhere in source');
ok(/DEMO4A_rollbackInserted_/.test(commitFn) && /DEMO4A_CLEAR_ORDER_/.test(G), 'F17. inserted-only rollback in reverse FK order remains intact');

section('V3G5-F19/F20/E. a failed rolled-back journal cannot authorize CLEAR and a retry is bound to the current plan');
(function () {
  var clearFn = extractFn(G, 'TEMP_DEMO4A_CLEAR_SHIPPING_SHIPMENT_MAP_SEED');
  ok(/CLEAR_REFUSED_STAGED_OFF/.test(clearFn) && /PASTE_DEMO_CLEAR_TOKEN_HERE/.test(clearFn), 'F19. CLEAR refuses while the clear token is the placeholder — a failed attempt can never arm it');
  ok(/DEMO4A_str_\(DEMO4A_CONFIRMED_CLEAR_TOKEN_\) !== DEMO4A_str_\(plan\.checksum\)/.test(clearFn), 'F19. CLEAR requires the token to equal the CURRENT plan checksum');
  ok(/DEMO4A_verifyJournal_\(jr \? JSON\.parse\(jr\) : null, DEMO4A_buildJournal_\(plan\)\)/.test(clearFn), 'F19/E. CLEAR requires FULL journal integrity against the CURRENT plan (a stale failed-attempt journal fails)');
  ok(/cls\.classification !== 'PRESENT_EXACT_ALL'[\s\S]*?CLEAR_REFUSED_/.test(clearFn), 'F19/E. after a rolled-back attempt the live state is ABSENT_ALL, so CLEAR refuses');
  ok(/DEMO4A_deleteRowsByPk_\(name, set\)/.test(clearFn) && /var ids = DEMO4A_allIds_\(plan\)/.test(clearFn), 'E. CLEAR can only delete the EXACT intended PK set — never unrelated or pre-existing rows');
  // a stale journal from a different plan fails verification against the current plan
  var stale = DEMO4A_buildJournal_(DEMO4A_buildPlan_(mastersWHderived()));
  var current = DEMO4A_buildJournal_(V5_PLAN_);
  ok(DEMO4A_verifyJournal_(stale, current).ok === false, 'F20/E. a journal built from a DIFFERENT plan fails integrity verification against the current plan');
  ok(DEMO4A_verifyJournal_(current, current).ok === true, 'F20/E. the journal for the current plan verifies');
  ok(/setProperty\(DEMO4A_JOURNAL_KEY_, JSON\.stringify\(journal\)\)[\s\S]*?getProperty\(DEMO4A_JOURNAL_KEY_\)[\s\S]*?DEMO4A_verifyJournal_/.test(commitFn), 'F20/E. a retry OVERWRITES the stale journal and performs a FULL property readback + integrity verification before the first insert');
  ok(commitFn.indexOf('DEMO4A_verifyJournal_') < commitFn.indexOf("phase = 'insert'"), 'F20/E. journal verification precedes the first table insert');
  eq(DEMO4A_str_(current.plan_checksum), DEMO4A_str_(V5_PLAN_.checksum), 'E. the journal binds the execution to the current plan checksum');
  eq(Object.keys(DEMO4A_allIds_(V5_PLAN_)).sort().join(','), DEMO4A_WRITE_ORDER_.slice().sort().join(','), 'E. the journal binds the exact intended ID set for all six tables');
})();

section('V3G5-F21/F22. exact success classifies PRESENT_EXACT_ALL and an exact retry is REUSED with six zero deltas');
eq(v5Classify(v5Headers(), { sheetTzMin: 480 }).classification, 'PRESENT_EXACT_ALL', 'F21. the exact round trip is PRESENT_EXACT_ALL');
ok(/cls\.classification === 'PRESENT_EXACT_ALL'\) \{ out\.delta = \{ shipping_plans: 0, shipping_plan_lines: 0, shipments: 0, shipment_lines: 0, shipment_routes: 0, shipment_events: 0 \}; out\.verdict = 'REUSED'/.test(commitFn), 'F22. an exact retry returns REUSED with all six deltas zero and writes nothing');
ok(/cls\.classification !== 'ABSENT_ALL'\) \{ out\.verdict = 'COMMIT_REFUSED_' \+ cls\.classification/.test(commitFn), 'F22. anything other than ABSENT_ALL or PRESENT_EXACT_ALL refuses before any write');

section('V3G5-D. the read-only canonicalization diagnostic contract');
(function () {
  var diagFn = extractFn(G, 'TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION');
  eq((diagFn.match(/Logger\.log\(/g) || []).length, 2, 'D. the diagnostic logs once on the blocked-plan early return and once normally (never more than one per execution)');
  ok(/DEMO4A_CANONICALIZATION_DIAGNOSTIC /.test(diagFn), 'D. the single entry is DEMO4A_CANONICALIZATION_DIAGNOSTIC');
  ok(/appendRow|setValue|setValues|deleteRow|setProperty|deleteProperty/.test(diagFn) === false, 'D. the diagnostic reaches NO write API');
  ok(/TEMP_DEMO4A_(PREFLIGHT|DRY_RUN|COMMIT|VALIDATE|CLEAR)/.test(diagFn) === false, 'D. it calls no other TEMP entrypoint');
  var headers = v5Headers(), colTypes = {};
  DEMO4A_WRITE_ORDER_.forEach(function (t) { var cc = {}; (headers[t] || []).forEach(function (c) { var cls = DEMO4A_fieldClass_(c); cc[c] = (cls === 'date' || cls === 'datetime') ? 'date_formatted' : (cls === 'numeric' || cls === 'coordinate') ? 'numeric_cell' : 'text_cell'; }); colTypes[t] = cc; });
  var core = DEMO4A_canonDiagnosticCore_({ ok: true }, mastersLive(), V5_PLAN_, headers, colTypes, { ok: true, offset_min: 480, time_zone: 'Asia/Taipei' }, null, 'ABSENT_ALL');
  eq(core.round_trip_performed, false, 'D. the diagnostic never claims it performed an actual Sheet write/read round trip');
  ['contract_version', 'schema_ok', 'plan_checksum', 'planned_counts', 'field_class_counts', 'writer_projection_complete', 'all_intended_fields_have_class',
   'unknown_field_classes', 'physical_alias_resolution', 'date_fields', 'numeric_fields', 'boolean_fields', 'text_identifier_fields', 'coordinate_fields',
   'blank_optional_fields', 'live_column_number_format_classes', 'predicted_roundtrip_risk_fields', 'risk_count', 'journal_status_read_only',
   'previous_failed_checksum_matches_current_plan', 'confirmation_constant_status', 'existing_state_classification', 'verdict'].forEach(function (k) { ok(core[k] !== undefined, 'D. diagnostic carries ' + k); });
  eq(core.verdict, 'READY_FOR_CONTROLLED_RETRY', 'D. a complete schema + matching timezone + ABSENT_ALL + no risk → READY_FOR_CONTROLLED_RETRY');
  eq(core.all_intended_fields_have_class, true, 'D/B. EVERY intended field of all six tables has an explicit field class');
  eq(core.unknown_field_classes.length, 0, 'D. no unknown field classes remain');
  eq(core.confirmation_constant_status, 'PLACEHOLDER', 'D. the diagnostic reports the confirmation constant as PLACEHOLDER');
  // each blocking verdict
  eq(DEMO4A_canonDiagnosticCore_({ ok: true }, mastersLive(), V5_PLAN_, v5Headers({ dropField: { table: 'shipments', field: 'currency' } }), colTypes, { ok: true, offset_min: 480 }, null, 'ABSENT_ALL').verdict, 'CANONICALIZATION_RISK_REMAINS', 'D. a missing physical column → CANONICALIZATION_RISK_REMAINS');
  eq(DEMO4A_canonDiagnosticCore_({ ok: true }, mastersLive(), V5_PLAN_, headers, colTypes, { ok: true, offset_min: 0 }, null, 'ABSENT_ALL').verdict, 'CANONICALIZATION_RISK_REMAINS', 'D. a spreadsheet timezone that differs from the canonical offset → CANONICALIZATION_RISK_REMAINS');
  ok(DEMO4A_canonDiagnosticCore_({ ok: true }, mastersLive(), V5_PLAN_, headers, colTypes, { ok: true, offset_min: 0 }, null, 'ABSENT_ALL').predicted_roundtrip_risk_fields.some(function (r) { return r.reason_code === 'DATE_WALLCLOCK_OFFSET_MISMATCH'; }), 'D. the offset mismatch is named as a predicted round-trip risk field');
  eq(DEMO4A_canonDiagnosticCore_({ ok: true }, mastersLive(), V5_PLAN_, headers, colTypes, { ok: true, offset_min: 480 }, null, 'PRESENT_EXACT_ALL').verdict, 'EXISTING_STATE_NOT_ABSENT', 'D. a non-ABSENT live state → EXISTING_STATE_NOT_ABSENT');
  eq(DEMO4A_canonDiagnosticCore_({ ok: true }, mastersLive(), V5_PLAN_, headers, colTypes, { ok: true, offset_min: 480 }, { plan_checksum: 'stale123' }, 'ABSENT_ALL').verdict, 'JOURNAL_STATE_UNSAFE_FOR_RETRY', 'D/E. a stale failed-attempt journal whose checksum differs → JOURNAL_STATE_UNSAFE_FOR_RETRY');
  eq(DEMO4A_canonDiagnosticCore_({ ok: true }, mastersLive(), V5_PLAN_, headers, colTypes, { ok: true, offset_min: 480 }, { plan_checksum: V5_PLAN_.checksum }, 'ABSENT_ALL').previous_failed_checksum_matches_current_plan, true, 'D/E. a journal matching the current plan is reported as safe to supersede');
  ok(JSON.stringify(core).length < 12000, 'D. the diagnostic envelope is ' + JSON.stringify(core).length + ' bytes — one compact log');
})();

section('V3G5-F24/F25. the shared contract did not change the plan, and the constants remain placeholders');
eq(DEMO4A_CANON_CONTRACT_VERSION_, 'V3G5-CANON-1', 'B. the canonicalization contract is versioned');
eq(DEMO4A_buildPlan_(mastersLive()).checksum, V5_PLAN_.checksum, 'F24. the plan checksum is reproducible under the shared contract');
ok(DEMO4A_buildPlan_(mastersLive()).tables.shipments.every(function (r) { return typeof r.created_at === 'string'; }), 'F24. intended values are plain strings — they never take the Date path, so the contract change cannot move the checksum');
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'F25. both confirmation constants remain placeholders');
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length, 3, 'G. the three approved coordinate authorities are untouched');
DEMO4A_setCanonTzOffsetMin_(480);

done();