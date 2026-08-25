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
  'DEMO4A_RECORD_STATUS_DEAD_', 'DEMO4A_VS_COORDINATE_PENDING_', 'DEMO4A_POSTAL_REQUIRED_', 'DEMO4A_COORD_ACCURACY_FACILITY_', 'DEMO4A_COORD_COUNTRY_BOUNDS_', 'DEMO4A_GATEWAY_CENTROID_TYPES_', 'DEMO4A_DEST_READY_BRANCHES_', 'DEMO4A_DEST_AUTH_REASONS_', 'DEMO4A_AUTHORIZATION_CONTRACT_VERSION_', 'DEMO4A_AUTH_MAX_REASON_CODES_', 'DEMO4A_CANON_CONTRACT_VERSION_', 'DEMO4A_CANON_TZ_OFFSET_MIN_', 'DEMO4A_FIELD_CLASSES_', 'DEMO4A_BOOL_TRUE_', 'DEMO4A_BOOL_FALSE_', 'DEMO4A_DRIFT_MAX_EXAMPLES_', 'DEMO4A_DRIFT_MAX_VALUE_LEN_', 'DEMO4A_APPROVED_REGION_DEST_', 'DEMO4A_SOURCE_SHIPPING_ENABLED_GATE_APPLIED_', 'DEMO4A_SOURCE_MAX_REJECTION_CODES_'].forEach(function (n) { LOAD.push(G.match(new RegExp('var ' + n + ' = [^\\n]*;'))[0]); });
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
  'DEMO4A_whCode_', 'DEMO4A_whName_', 'DEMO4A_whIsFactory_', 'DEMO4A_sourceEvidence_', 'DEMO4A_resolveDemoSourceWarehouse_', 'DEMO4A_sourceAuthoritySummary_', 'DEMO4A_numericLike_', 'DEMO4A_dateLike_', 'DEMO4A_boolLike_', 'DEMO4A_whReceivingEnabled_', 'DEMO4A_whColPresent_', 'DEMO4A_whAddrLine1_', 'DEMO4A_whAddrLine2_', 'DEMO4A_whCity_', 'DEMO4A_whSubdivision_', 'DEMO4A_whStateSub_', 'DEMO4A_whAddrFlatLegacyPresent_', 'DEMO4A_whPostal_', 'DEMO4A_postalRequired_', 'DEMO4A_normAddrPart_', 'DEMO4A_normalizeWhAddress_', 'DEMO4A_addressAuthority_', 'DEMO4A_deriveDestCoordinate_', 'DEMO4A_pickWarehouseForRegion_',
  'DEMO4A_destCandidateEligible_', 'DEMO4A_selectDestCandidatesByRegion_', 'DEMO4A_diagnoseDestCandidates_', 'DEMO4A_proposalToAuthority_', 'DEMO4A_coordAuthorityArmed_', 'DEMO4A_coordAccuracyFacility_', 'DEMO4A_coordInBounds_', 'DEMO4A_gatewayCoordMatch_', 'DEMO4A_preflightFailureReason_', 'DEMO4A_mapDestinationEndpointSource_', 'DEMO4A_destAuthorityForTemplate_', 'DEMO4A_destAuthorityReason_', 'DEMO4A_warehouseDestBinding_', 'DEMO4A_preflightVerdict_', 'DEMO4A_authorizationSummary_', 'DEMO4A_rowForHeaders_', 'DEMO4A_srcDestLineageGate_', 'DEMO4A_writerProjectionGaps_', 'DEMO4A_driftClip_', 'DEMO4A_driftEvidence_', 'DEMO4A_canonDiagnosticCore_', 'DEMO4A_validateCoordProposal_', 'DEMO4A_mapDestinationDisplayStatus_'].forEach(function (n) { LOAD.push(extractFn(G, n)); });
eval(LOAD.join('\n'));

// ---- synthetic read-only masters: 3 active US templates (W/C/E), C richest (4 nodes); real marketplace_skus⋈sku_details.
var SRC_WH_ID_ = 'WH-KM-CN-FACTORY-1';   // V3G5A(B) — the SOURCE warehouse identity every fixture template declares
function tpl(id, region) { return { route_template_id: id, route_template_name: 'CN to ' + region, is_active: 'TRUE', origin_country: 'CN', destination_country: 'US', destination_region: region, origin_warehouse_id: SRC_WH_ID_, destination_warehouse_id: 'WH-US-' + id, carrier_id: 'CAR-1', transit_type: 'SEA', last_mile_delivery: 'FBA' }; }
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
function tplV3C(id, region) { return { route_template_id: id, route_template_name: 'CN to ' + region, is_active: 'TRUE', origin_country: 'CN', destination_country: 'US', destination_region: region, origin_warehouse_id: SRC_WH_ID_, destination_warehouse_id: 'WH-US-' + id, carrier_id: 'CAR-1', transit_type: 'SEA', last_mile_delivery: 'FBA' }; }
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
function srcWhRow(over) { over = over || {}; var r = { warehouse_id: over.id || SRC_WH_ID_, warehouse_code: over.code || 'CNFAC1', warehouse_name: 'KM CN Factory 1', warehouse_type: 'FACTORY', company: over.company === undefined ? 'KM' : over.company, country: over.country || 'CN', marketplace: '', logistics_region: 'CN East', is_active: over.is_active === undefined ? 'TRUE' : over.is_active, is_factory_warehouse: over.is_factory_warehouse === undefined ? 'TRUE' : over.is_factory_warehouse, address_line1: '1 Factory Rd', address_line2: '', city: 'Shanghai', state: 'Shanghai', subdivision_code: 'SH', postal_code: '200000' };
  if (over.is_shipping_enabled !== undefined) r.is_shipping_enabled = over.is_shipping_enabled;
  return r; }
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
  var warehouses = [wh('WH-KM-US-FBA-W', 'FBA', 'KM', 'US', 'US West'), wh('WH-KM-US-FBA-C', 'FBA', 'KM', 'US', 'US Central'), wh('WH-KM-US-FBA-E', 'FBA', 'KM', 'US', 'US East'), srcWhRow()];
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
  m.warehouses.forEach(function (w) { var fp = DEMO4A_normalizeWhAddress_(w).fingerprint; var c = coords[w.warehouse_code]; if (!c) return;   // the CN SOURCE warehouse is never a destination coordinate authority
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
(function () { var m = mastersWHderived(); m.warehouses = m.warehouses.map(function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (c.warehouse_id === 'WH-KM-US-FBA-C') c.address_line1 = c.address_line1 + ' STE 200'; return c; }); m.destCoordAuthority = {}; m.warehouses.forEach(function (w) { var fp = DEMO4A_normalizeWhAddress_(w).fingerprint; var co = { 'WH-KM-US-FBA-W': [34.05, -118.25], 'WH-KM-US-FBA-C': [41.85, -87.65], 'WH-KM-US-FBA-E': [40.72, -74.17] }[w.warehouse_code]; if (!co) return; m.destCoordAuthority[w.warehouse_code] = { latitude: co[0], longitude: co[1], source_type: 'reviewed_address_resolution', source_reference: 'DEMO-REVIEW://' + w.warehouse_code, accuracy: 'rooftop', address_fingerprint: fp, review_version: 'v1' }; }); var p = DEMO4A_buildPlan_(m); ok(p.ok && p.checksum !== ckBase, 'J13. changing a warehouse address_line1 re-checksums (address fingerprint is bound)'); })();
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
  masters.warehouses.forEach(function (w) { var loc = DEMO4A_locsForWarehouse_(masters.locations, w.warehouse_id)[0]; var c = coords[w.warehouse_code]; if (!c) return;   // CN SOURCE warehouse is not a destination authority
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
  var warehouses = [whLive('BFI4'), whLive('AUS2'), whLive('ABE2'), srcWhRow()];
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
  var warehouses = [whLive('BFI4'), whLive('AUS2'), whLive('ABE2'), srcWhRow()];
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
eq(Object.keys(A_ENV_.per_shipment[0]).sort().join(','), ['current_location_id', 'destination_address_fingerprint', 'destination_coordinate_accuracy', 'destination_coordinate_branch', 'destination_logistics_location_id', 'destination_renderable', 'destination_warehouse_code', 'destination_warehouse_id', 'event_rows', 'origin_location_id', 'plan_lines', 'region', 'route_rows', 'shipment_id', 'shipment_lines', 'slot', 'source_selection_branch', 'source_warehouse_code', 'source_warehouse_id', 'status', 'template_id'].join(','), 'E5/B/V3G5B(L). each shipment object carries ONLY the 21 authorized compact fields (source id + code + selection branch, destination id + code + logistics location)');
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
[['shipments', 'source_warehouse_id', 'WH-CN-WRONG', 'VALUE_MUTATION'],
 ['shipment_lines', 'sku', 'KM-WRONG', 'VALUE_MUTATION'],
 ['shipment_lines', 'shipment_carton_qty', 999, 'NUMERIC_REPRESENTATION_OR_VALUE'],
 ['shipments', 'status', 'cancelled', 'VALUE_MUTATION'],
 ['shipments', 'eta', '2027-01-01', 'VALUE_MUTATION'],
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
  var V5_LINEAGE_ = DEMO4A_srcDestLineageGate_(V5_PLAN_, mastersLive().warehouses);
  function dcore(over) { over = over || {}; return DEMO4A_canonDiagnosticCore_(over.schema || { ok: true }, mastersLive(), over.plan || V5_PLAN_, over.headers || headers, colTypes, over.tz || { ok: true, offset_min: 480, time_zone: 'Asia/Taipei' }, over.journal === undefined ? null : over.journal, over.state || 'ABSENT_ALL', over.lineage === undefined ? V5_LINEAGE_ : over.lineage, over.clearPlaceholder === undefined ? true : over.clearPlaceholder); }
  var core = dcore();
  eq(core.round_trip_performed, false, 'D. the diagnostic never claims it performed an actual Sheet write/read round trip');
  ['contract_version', 'schema_ok', 'plan_checksum', 'planned_counts', 'field_class_counts', 'writer_projection_complete', 'all_intended_fields_have_class',
   'unknown_field_classes', 'physical_alias_resolution', 'date_fields', 'numeric_fields', 'boolean_fields', 'text_identifier_fields', 'coordinate_fields',
   'blank_optional_fields', 'number_format_summary_by_table', 'number_format_risk_fields', 'predicted_roundtrip_risk_fields', 'risk_count',
   'source_destination_warehouse_lineage_ready', 'journal_status_read_only', 'journal_integrity_valid', 'journal_matches_previous_failed_attempt',
   'journal_previous_checksum', 'corrected_plan_checksum', 'journal_retry_safe', 'journal_retry_reason',
   'previous_failed_checksum_matches_current_plan', 'confirmation_constant_status', 'existing_state', 'verdict', 'alias_conflict'].forEach(function (k) { ok(core[k] !== undefined, 'D. diagnostic carries ' + k); });
  eq(core.live_column_number_format_classes, undefined, 'J. the COMPLETE per-column number-format dump is GONE (it truncated the live log)');
  eq(Object.keys(core.number_format_summary_by_table.shipments).sort().join(','), 'date_formatted_count,empty_or_general_count,numeric_cell_count,text_cell_count', 'J. it is replaced by a per-table COUNT summary');
  ok(core.number_format_risk_fields.length <= 20 && core.writer_projection_missing_fields.length <= 20 && core.predicted_roundtrip_risk_fields.length <= 20, 'J. every diagnostic list is capped at 20 entries');
  eq(core.verdict, 'READY_FOR_CONTROLLED_RETRY', 'D. a complete schema + matching timezone + ABSENT_ALL + no risk → READY_FOR_CONTROLLED_RETRY');
  eq(core.all_intended_fields_have_class, true, 'D/B. EVERY intended field of all six tables has an explicit field class');
  eq(core.unknown_field_classes.length, 0, 'D. no unknown field classes remain');
  eq(core.confirmation_constant_status, 'PLACEHOLDER', 'D. the diagnostic reports the confirmation constant as PLACEHOLDER');
  // each blocking verdict
  eq(dcore({ headers: v5Headers({ dropField: { table: 'shipments', field: 'currency' } }) }).verdict, 'CANONICALIZATION_RISK_REMAINS', 'D. a missing physical column → CANONICALIZATION_RISK_REMAINS');
  eq(dcore({ tz: { ok: true, offset_min: 0 } }).verdict, 'CANONICALIZATION_RISK_REMAINS', 'D. a spreadsheet timezone that differs from the canonical offset → CANONICALIZATION_RISK_REMAINS');
  ok(dcore({ tz: { ok: true, offset_min: 0 } }).predicted_roundtrip_risk_fields.some(function (r) { return r.reason_code === 'DATE_WALLCLOCK_OFFSET_MISMATCH'; }), 'D. the offset mismatch is named as a predicted round-trip risk field');
  eq(dcore({ lineage: { source_destination_warehouse_lineage_ready: false, reasons: ['SHIPMENT_SOURCE_WAREHOUSE_BLANK:X'] } }).verdict, 'CANONICALIZATION_RISK_REMAINS', 'D/G. a broken source→destination warehouse lineage blocks the retry verdict');
  eq(dcore({ state: 'PRESENT_EXACT_ALL' }).verdict, 'EXISTING_STATE_NOT_ABSENT', 'D. a non-ABSENT live state → EXISTING_STATE_NOT_ABSENT');
  ok(JSON.stringify(core).length < 6000, 'J. the diagnostic envelope is ' + JSON.stringify(core).length + ' bytes — under the 6000-byte ceiling');
  ok(JSON.stringify(core).indexOf('"verdict"') < 6000 && JSON.stringify(core).indexOf('"journal_retry_safe"') < 6000 && JSON.stringify(core).indexOf('"corrected_plan_checksum"') < 6000, 'J. the verdict and journal/checksum fields sit inside the ceiling and cannot be truncated away');
})();

section('V3G5-F24/F25. the shared contract did not change the plan, and the constants remain placeholders');
eq(DEMO4A_CANON_CONTRACT_VERSION_, 'V3G5-CANON-1', 'B. the canonicalization contract is versioned');
eq(DEMO4A_buildPlan_(mastersLive()).checksum, V5_PLAN_.checksum, 'F24. the plan checksum is reproducible under the shared contract');
ok(DEMO4A_buildPlan_(mastersLive()).tables.shipments.every(function (r) { return typeof r.created_at === 'string'; }), 'F24. intended values are plain strings — they never take the Date path, so the contract change cannot move the checksum');
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'F25. both confirmation constants remain placeholders');
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length, 3, 'G. the three approved coordinate authorities are untouched');
DEMO4A_setCanonTzOffsetMin_(480);

// ============================================================ V3G5A — SOURCE/DESTINATION WAREHOUSE LINEAGE + PROJECTION
// The live diagnostic proved exactly two writer-projection failures: shipments.warehouse_id (identifier) and
// shipments.updated_by (text). The audit of the intended row showed `warehouse_id: destWh` used the SAME variable as
// `destination_warehouse_id: destWh` -> CASE B, an exact duplicate of the destination identity, never a source identity.
// Removing it therefore loses nothing, and source_warehouse_id (= the template's origin_warehouse_id) was already present.
var A5_PLAN_ = DEMO4A_buildPlan_(mastersLive());
function v5HeadersA5(over) {
  over = over || {}; var h = {};
  DEMO4A_WRITE_ORDER_.forEach(function (t) {
    var seen = {}; (A5_PLAN_.tables[t] || []).forEach(function (r) { Object.keys(r).forEach(function (k) { seen[k] = 1; }); });
    var cols = Object.keys(seen);
    if (over.dropField && over.dropField.table === t) cols = cols.filter(function (c) { return c !== over.dropField.field; });
    h[t] = cols;
  });
  return h;
}
function v5RoundTripA5(headers, opts) {
  opts = opts || {}; var sheetTz = opts.sheetTzMin === undefined ? 480 : opts.sheetTzMin, live = {};
  DEMO4A_WRITE_ORDER_.forEach(function (t) {
    var cols = headers[t] || [], rows = [];
    (A5_PLAN_.tables[t] || []).forEach(function (r) {
      var cell = {}, projected = DEMO4A_rowForHeaders_(cols, r);
      cols.forEach(function (c, i) {
        var v = projected[i], cls = DEMO4A_fieldClass_(c);
        if (v === '' || v == null) { cell[c] = ''; return; }
        if ((cls === 'date' || cls === 'datetime') && typeof v === 'string') {
          var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
          if (m) { cell[c] = new Date(Date.UTC(+m[1], (+m[2]) - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - sheetTz * 60000); return; }
        }
        if (cls === 'numeric' || cls === 'coordinate') { var n = Number(v); if (isFinite(n)) { cell[c] = n; return; } }
        cell[c] = v;
      });
      if (opts.mutate) opts.mutate(t, cell, r);
      rows.push(cell);
    });
    live[t] = { present: true, headers: cols, rows: rows };
  });
  return live;
}

var A5_SHIPS_ = A5_PLAN_.tables.shipments, A5_PLANS_ = A5_PLAN_.tables.shipping_plans;
function a5PlanOf(sh) { return A5_PLANS_.filter(function (p) { return p.shipping_plan_id === sh.shipping_plan_id; })[0]; }

section('V3G5A-L1/L2/L3. the old shipments.warehouse_id semantic is classified and its meaning is not lost');
ok(/REMOVED `warehouse_id`: the audit proved it was assigned the SAME `destWh` variable as destination_warehouse_id/.test(G), 'L1. the source records the CASE B classification (an exact duplicate of the destination identity, not a source identity)');
ok(A5_SHIPS_.every(function (sh) { return !Object.prototype.hasOwnProperty.call(sh, 'warehouse_id'); }), 'L8. no intended shipment row carries warehouse_id (no third ambiguous warehouse authority)');
ok(A5_SHIPS_.every(function (sh) { return DEMO4A_str_(sh.destination_warehouse_id) !== ''; }), 'L2. the destination identity the removed field duplicated is still present as destination_warehouse_id');
ok(A5_SHIPS_.every(function (sh) { return DEMO4A_str_(sh.source_warehouse_id) === SRC_WH_ID_; }), 'L2. the SOURCE identity survives independently as source_warehouse_id (= the template origin_warehouse_id authority)');
(function () { var g = DEMO4A_srcDestLineageGate_({ tables: { shipping_plans: A5_PLANS_, shipments: A5_SHIPS_.map(function (sh) { var c = {}; for (var k in sh) c[k] = sh[k]; c.warehouse_id = c.destination_warehouse_id; return c; }), shipment_routes: A5_PLAN_.tables.shipment_routes }, per_shipment: A5_PLAN_.per_shipment }, mastersLive().warehouses);
  ok(g.source_destination_warehouse_lineage_ready === false && g.reasons.some(function (r) { return /^THIRD_WAREHOUSE_AUTHORITY_PRESENT:/.test(r); }), 'L3. re-introducing a shipments.warehouse_id third authority FAILS CLOSED'); })();

section('V3G5A-L4..L10. the final physical plan/shipment contract');
ok(A5_PLANS_.every(function (p) { return DEMO4A_str_(p.source_warehouse_id) !== ''; }), 'L4. every shipping plan carries a non-blank source_warehouse_id');
ok(A5_PLANS_.every(function (p) { return DEMO4A_str_(p.destination_warehouse_id) !== ''; }), 'L5. every shipping plan carries a non-blank destination_warehouse_id');
ok(A5_SHIPS_.every(function (sh) { return DEMO4A_str_(sh.source_warehouse_id) !== ''; }), 'L6. every shipment carries a non-blank source_warehouse_id');
ok(A5_SHIPS_.every(function (sh) { return DEMO4A_str_(sh.destination_warehouse_id) !== ''; }), 'L7. every shipment carries a non-blank destination_warehouse_id');
ok(A5_SHIPS_.every(function (sh) { return !Object.prototype.hasOwnProperty.call(sh, 'updated_by'); }), 'L9. no intended shipment row carries updated_by (not a deployed physical column)');
ok(A5_SHIPS_.every(function (sh) { return DEMO4A_str_(sh.created_by) !== '' && DEMO4A_str_(sh.created_at) !== '' && DEMO4A_str_(sh.updated_at) !== ''; }), 'L10. the physical audit fields created_by / created_at / updated_at are preserved');
ok(A5_SHIPS_.every(function (sh) { return DEMO4A_low_(DEMO4A_str_(sh.warehouse_code)) === DEMO4A_low_(DEMO4A_whCode_({ warehouse_code: ({ 'WH-KM-US-FBA-BFI4': 'BFI4', 'WH-KM-US-FBA-AUS2': 'AUS2', 'WH-KM-US-FBA-ABE2': 'ABE2' })[DEMO4A_str_(sh.destination_warehouse_id)] })); }), 'L18/V3G5B(E). warehouse_code is the DESTINATION warehouse-code snapshot (source-proven by SHIPMENT_CENTER_SPEC + the deployed SHIPMENTS_HEADERS_), never a source identity and never a foreign key');
ok(A5_PLAN_.tables.shipping_plan_lines.length === 8 && A5_PLAN_.tables.shipment_lines.length === 8, 'C. the rest of the six-table shape is unchanged');

section('V3G5A-L11..L17. plan → shipment lineage and no geographic substitution');
A5_SHIPS_.forEach(function (sh) {
  var pl = a5PlanOf(sh), sid = DEMO4A_str_(sh.shipment_id);
  eq(DEMO4A_str_(sh.source_warehouse_id), DEMO4A_str_(pl.source_warehouse_id), 'L11. ' + sid + ' source_warehouse_id is inherited exactly from its parent plan');
  eq(DEMO4A_str_(sh.destination_warehouse_id), DEMO4A_str_(pl.destination_warehouse_id), 'L12. ' + sid + ' destination_warehouse_id is inherited exactly from its parent plan');
  ok(DEMO4A_low_(sh.source_warehouse_id) !== DEMO4A_low_(sh.destination_warehouse_id), 'L13. ' + sid + ' source and destination warehouse ids differ');
});
(function () {
  var whIds = {}; mastersLive().warehouses.forEach(function (w) { whIds[DEMO4A_low_(DEMO4A_whId_(w))] = 1; });
  ok(A5_SHIPS_.every(function (sh) { return whIds[DEMO4A_low_(sh.source_warehouse_id)] === 1; }), 'L14. every source warehouse resolves to an exact warehouses.warehouse_id');
  ok(A5_SHIPS_.every(function (sh) { return whIds[DEMO4A_low_(sh.destination_warehouse_id)] === 1; }), 'L14. every destination warehouse resolves to an exact warehouses.warehouse_id');
  var byShip = {}; A5_PLAN_.per_shipment.forEach(function (x) { byShip[DEMO4A_str_(x.shipment_id)] = x; });
  ok(A5_SHIPS_.every(function (sh) { var ps = byShip[DEMO4A_str_(sh.shipment_id)]; return DEMO4A_str_(sh.destination_warehouse_id) === DEMO4A_APPROVED_REGION_DEST_[DEMO4A_str_(ps.region)]; }), 'L15. each destination warehouse is exactly the approved regional authority (BFI4 / AUS2 / ABE2)');
  var locIds = {}; A5_PLAN_.tables.shipment_routes.forEach(function (r) { var l = DEMO4A_str_(r.location_ref_id); if (l) locIds[DEMO4A_low_(l)] = 1; });
  ok(A5_SHIPS_.every(function (sh) { return !locIds[DEMO4A_low_(sh.source_warehouse_id)]; }), 'L16. no origin/route logistics_location_id was written into source_warehouse_id');
  ok(A5_SHIPS_.every(function (sh) { return !locIds[DEMO4A_low_(sh.destination_warehouse_id)]; }), 'L17. no destination logistics_location_id was written into destination_warehouse_id');
  ok(A5_SHIPS_.every(function (sh) { var ps = byShip[DEMO4A_str_(sh.shipment_id)]; return DEMO4A_str_(ps.destination_logistics_location_id) === 'LOC-' + DEMO4A_str_(sh.destination_warehouse_id); }), 'D. the destination logistics_location still joins its destination warehouse (separate authority, correct lineage)');
})();

section('V3G5A-L19/L20/L23. missing source or destination authority fails closed and gates all_pass');
eq(DEMO4A_srcDestLineageGate_(A5_PLAN_, mastersLive().warehouses).source_destination_warehouse_lineage_ready, true, 'L23. the corrected plan passes the lineage gate');
eq(A5_PLAN_.binding_gates.source_destination_warehouse_lineage_ready, true, 'L23. the gate is part of binding_gates');
ok(A5_PLAN_.binding_gates.ok === true, 'L23. binding_gates.ok includes it');
function a5Mutate(mut) { var p = JSON.parse(JSON.stringify(A5_PLAN_)); mut(p); return DEMO4A_srcDestLineageGate_(p, mastersLive().warehouses); }
[['blank shipment source', function (p) { p.tables.shipments[0].source_warehouse_id = ''; }, 'SHIPMENT_SOURCE_WAREHOUSE_BLANK'],
 ['blank shipment destination', function (p) { p.tables.shipments[0].destination_warehouse_id = ''; }, 'SHIPMENT_DESTINATION_WAREHOUSE_BLANK'],
 ['blank plan source', function (p) { p.tables.shipping_plans[0].source_warehouse_id = ''; }, 'PLAN_SOURCE_WAREHOUSE_BLANK'],
 ['blank plan destination', function (p) { p.tables.shipping_plans[0].destination_warehouse_id = ''; }, 'PLAN_DESTINATION_WAREHOUSE_BLANK'],
 ['source == destination', function (p) { p.tables.shipments[0].source_warehouse_id = p.tables.shipments[0].destination_warehouse_id; p.tables.shipping_plans.forEach(function (pl) { if (pl.shipping_plan_id === p.tables.shipments[0].shipping_plan_id) pl.source_warehouse_id = p.tables.shipments[0].source_warehouse_id; }); }, 'SOURCE_EQUALS_DESTINATION'],
 ['source not inherited', function (p) { p.tables.shipments[0].source_warehouse_id = 'WH-KM-US-FBA-BFI4'; }, 'SOURCE_NOT_INHERITED_FROM_PLAN'],
 ['destination not inherited', function (p) { p.tables.shipments[0].destination_warehouse_id = 'WH-KM-US-FBA-ABE2'; p.per_shipment[0].region = 'US_EAST'; }, 'DESTINATION_NOT_INHERITED_FROM_PLAN'],
 ['source not in master', function (p) { p.tables.shipments[0].source_warehouse_id = 'WH-NOT-A-WAREHOUSE'; p.tables.shipping_plans.forEach(function (pl) { if (pl.shipping_plan_id === p.tables.shipments[0].shipping_plan_id) pl.source_warehouse_id = 'WH-NOT-A-WAREHOUSE'; }); }, 'SOURCE_WAREHOUSE_NOT_IN_MASTER'],
 ['destination not approved for region', function (p) { var sh = p.tables.shipments[0]; sh.destination_warehouse_id = 'WH-KM-US-FBA-BFI4'; p.tables.shipping_plans.forEach(function (pl) { if (pl.shipping_plan_id === sh.shipping_plan_id) pl.destination_warehouse_id = 'WH-KM-US-FBA-BFI4'; }); p.per_shipment.forEach(function (x) { if (x.shipment_id === sh.shipment_id) x.region = 'US_EAST'; }); }, 'DESTINATION_NOT_APPROVED_FOR_REGION'],
 ['a route location id used as the source warehouse', function (p) { var loc = DEMO4A_str_(p.tables.shipment_routes[0].location_ref_id); p.tables.shipments[0].source_warehouse_id = loc; p.tables.shipping_plans.forEach(function (pl) { if (pl.shipping_plan_id === p.tables.shipments[0].shipping_plan_id) pl.source_warehouse_id = loc; }); }, 'SOURCE_IS_A_ROUTE_LOCATION_ID']
].forEach(function (c) {
  var g = a5Mutate(c[1]);
  ok(g.source_destination_warehouse_lineage_ready === false && g.reasons.some(function (r) { return r.indexOf(c[2]) === 0; }), 'L19/L20. ' + c[0] + ' fails closed with ' + c[2]);
});

section('V3G5A-L21/L22/L31/L32. lineage is checksum-bound, the corrected checksum is deterministic, 7e4cf9d9 is retired');
eq(DEMO4A_buildPlan_(mastersLive()).checksum, A5_PLAN_.checksum, 'L31. the corrected plan checksum is deterministic');
(function () {
  var m = mastersLive(); m.templates = m.templates.map(function (x) { var c = {}; for (var k in x) c[k] = x[k]; c.origin_warehouse_id = 'WH-KM-CN-FACTORY-2'; return c; });
  m.warehouses = m.warehouses.concat([{ warehouse_id: 'WH-KM-CN-FACTORY-2', warehouse_code: 'CNFAC2', warehouse_name: 'KM CN Factory 2', warehouse_type: 'FACTORY', company: 'KM', country: 'CN', logistics_region: 'CN East', is_active: 'TRUE', address_line1: '2 Factory Rd', address_line2: '', city: 'Ningbo', state: 'Zhejiang', subdivision_code: 'ZJ', postal_code: '315000' }]);
  var p2 = DEMO4A_buildPlan_(m);
  ok(p2.ok === true && p2.checksum !== A5_PLAN_.checksum, 'L21. changing the SOURCE warehouse identity changes demo_plan_checksum');
})();
(function () {
  var alt = {}; Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).forEach(function (k) { alt[k] = JSON.parse(JSON.stringify(DEMO4A_DEST_COORD_AUTHORITY_[k])); });
  alt.ABE2.latitude = 40.6;
  var m = mastersLive(); m.destCoordAuthority = alt;
  ok(DEMO4A_buildPlan_(m).checksum !== A5_PLAN_.checksum, 'L22. changing destination coordinate evidence changes demo_plan_checksum');
})();
ok(A5_PLAN_.checksum !== '7e4cf9d9', 'L32. the retired 7e4cf9d9 checksum is NOT reproduced by the corrected intended content');
ok(/7e4cf9d9/.test(G) === false, 'L32. no retired checksum is pinned anywhere in source');
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'L47. both confirmation constants remain placeholders');

section('V3G5A-L24/I. the compact authorization envelope carries the warehouse lineage and requires the gate');
(function () {
  var env = DEMO4A_authorizationSummary_({ ok: true }, A_MASTERS_PRESENT_, A5_PLAN_, A5_PLAN_, emptyLive(), A_PROP_);
  ok(env.per_shipment.every(function (x) { return DEMO4A_str_(x.source_warehouse_id) !== '' && DEMO4A_str_(x.destination_warehouse_id) !== '' && DEMO4A_str_(x.destination_logistics_location_id) !== ''; }), 'I. each compact shipment object carries source + destination warehouse ids and the destination logistics_location_id');
  eq(env.gate_summary.source_destination_warehouse_lineage_ready, true, 'I. gate_summary exposes source_destination_warehouse_lineage_ready');
  eq(env.may_run_dry_run, true, 'I. the corrected plan authorizes DRY_RUN');
  ok(JSON.stringify(env).length < 6000, 'I. the authorization envelope is ' + JSON.stringify(env).length + ' bytes — still under the safe ceiling');
  var broken = JSON.parse(JSON.stringify(A5_PLAN_)); broken.binding_gates.source_destination_warehouse_lineage_ready = false;
  var envB = DEMO4A_authorizationSummary_({ ok: true }, A_MASTERS_PRESENT_, broken, broken, emptyLive(), A_PROP_);
  eq([envB.gate_summary.source_destination_warehouse_lineage_ready, envB.may_run_dry_run, envB.may_arm_commit_checksum], [false, false, false], 'L24. the authorization conjunction REQUIRES the new gate');
})();

section('V3G5A-L25..L30/H. the pre-write projection gate on the corrected contract');
(function () {
  var h = v5HeadersA5();
  eq(DEMO4A_writerProjectionGaps_(A5_PLAN_, h).ok, true, 'L25. the corrected intended shipment row passes projection against the corrected physical headers');
  ['source_warehouse_id', 'destination_warehouse_id', 'created_by', 'created_at', 'updated_at', 'shipment_total_qty'].forEach(function (f) {
    var g = DEMO4A_writerProjectionGaps_(A5_PLAN_, v5HeadersA5({ dropField: { table: 'shipments', field: f } }));
    ok(g.ok === false && g.missing_fields.some(function (m) { return m.table === 'shipments' && m.field === f; }), 'L26/L27/L28. removing the physical ' + f + ' column BLOCKS with zero writes');
  });
  ok(/if \(!projection\.ok\) \{ out\.verdict = 'COMMIT_BLOCKED_WRITER_PROJECTION_INCOMPLETE'/.test(commitFn), 'H. the gate is still enforced in COMMIT');
  ok(commitFn.indexOf('DEMO4A_writerProjectionGaps_') < commitFn.indexOf('setProperty(DEMO4A_JOURNAL_KEY_') && commitFn.indexOf('DEMO4A_writerProjectionGaps_') < commitFn.indexOf("phase = 'insert'"), 'L29. projection failure occurs BEFORE any journal property write and before the first table write');
  ok(/blanket|ignoreAllMissing|skipProjection/.test(G) === false, 'H. no blanket-ignore rule exists');
  ok(/insertColumn|setColumnWidth\(|appendColumn|addColumn|ALTER TABLE|createSheet\(/.test(G) === false, 'L30. no DB column creation / migration code exists anywhere in source');
})();

section('V3G5A-L37/L38/K. prior failed journal: cannot authorize CLEAR, and retry safety is classified');
(function () {
  var lineage = DEMO4A_srcDestLineageGate_(A5_PLAN_, mastersLive().warehouses);
  var headers = v5HeadersA5(), colTypes = {};
  DEMO4A_WRITE_ORDER_.forEach(function (t2) { var cc = {}; (headers[t2] || []).forEach(function (c) { var cl = DEMO4A_fieldClass_(c); cc[c] = (cl === 'date' || cl === 'datetime') ? 'date_formatted' : (cl === 'numeric' || cl === 'coordinate') ? 'numeric_cell' : 'text_cell'; }); colTypes[t2] = cc; });
  function core(journal, state, clearPlaceholder) { return DEMO4A_canonDiagnosticCore_({ ok: true }, mastersLive(), A5_PLAN_, headers, colTypes, { ok: true, offset_min: 480, time_zone: 'Asia/Taipei' }, journal, state || 'ABSENT_ALL', lineage, clearPlaceholder === undefined ? true : clearPlaceholder); }
  var prior = DEMO4A_buildJournal_(DEMO4A_buildPlan_(mastersWHderived()));   // a DIFFERENT (retired) plan checksum, valid integrity
  var c1 = core(prior);
  eq([c1.journal_status_read_only, c1.journal_integrity_valid, c1.journal_matches_previous_failed_attempt], ['PRESENT_FROM_PRIOR_ATTEMPT', true, true], 'K. a prior journal + ABSENT_ALL is classified as a failed rolled-back attempt with valid integrity');
  eq(c1.previous_failed_checksum_matches_current_plan, false, 'K/L32. the prior checksum legitimately DIFFERS from the corrected plan checksum');
  eq([c1.journal_retry_safe, c1.verdict], [true, 'READY_FOR_CONTROLLED_RETRY'], 'L38/K. a differing prior checksum is RETRY-SAFE (it will be superseded), not unsafe');
  eq(c1.corrected_plan_checksum, A5_PLAN_.checksum, 'K. the corrected plan checksum is reported');
  var bad = JSON.parse(JSON.stringify(prior)); bad.journal_integrity_checksum = 'deadbeef';
  eq([core(bad).journal_retry_safe, core(bad).verdict, core(bad).journal_retry_reason], [false, 'JOURNAL_STATE_UNSAFE_FOR_RETRY', 'PRIOR_JOURNAL_INTEGRITY_INVALID'], 'L38/K. a corrupt prior journal is UNSAFE for retry');
  eq(core(prior, 'CONTENT_DRIFT').journal_retry_reason, 'PRIOR_ATTEMPT_LEFT_ROWS_OR_STATE_NOT_ABSENT', 'K. a prior journal with rows still present is unsafe');
  eq(core(prior, 'ABSENT_ALL', false).journal_retry_reason, 'CLEAR_TOKEN_ARMED_WITH_PRIOR_JOURNAL_PRESENT', 'K/L37. an armed clear token with a prior journal present is unsafe');
  eq(core(null).journal_retry_reason, 'NO_PRIOR_JOURNAL', 'K. no prior journal is trivially safe');
  ok(/deleteProperty\(DEMO4A_JOURNAL_KEY_\)/.test(extractFn(G, 'TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION')) === false, 'K. the diagnostic never clears or mutates the journal');
})();

section('V3G5A-L39..L45. drift, rollback, REUSED and PRESENT_EXACT_ALL remain intact on the corrected contract');
(function () {
  var live = v5RoundTripA5(v5HeadersA5(), { sheetTzMin: 480 });
  eq(DEMO4A_classifyState_(A5_PLAN_, live).classification, 'PRESENT_EXACT_ALL', 'L44. an exact round trip of the CORRECTED intended content is PRESENT_EXACT_ALL');
  var mutated = v5RoundTripA5(v5HeadersA5(), { sheetTzMin: 480, mutate: function (t2, cell) { if (t2 === 'shipments') cell.source_warehouse_id = 'WH-CN-WRONG'; } });
  var cls = DEMO4A_classifyState_(A5_PLAN_, mutated);
  eq(cls.classification, 'CONTENT_DRIFT', 'L39. a mutated source_warehouse_id is still genuine blocking CONTENT_DRIFT');
  var ev = DEMO4A_driftEvidence_(cls);
  ok(ev.examples.some(function (x) { return x.table === 'shipments' && x.field === 'source_warehouse_id'; }) && ev.examples.length <= 20, 'L40. the compact forensic evidence names it and remains capped');
})();
ok(/rb\.ok \? 'COMMIT_FAILED_POSTCHECK_ROLLED_BACK' : 'COMMIT_FAILED_POSTCHECK_ROLLBACK_UNVERIFIED'/.test(commitFn), 'L41/L42. inserted-only rollback and mandatory rollback verification remain intact');
ok(/COMMITTED_UNVERIFIED/.test(G) === false, 'L43. COMMITTED_UNVERIFIED remains impossible');
ok(/cls\.classification === 'PRESENT_EXACT_ALL'\) \{ out\.delta = \{ shipping_plans: 0, shipping_plan_lines: 0, shipments: 0, shipment_lines: 0, shipment_routes: 0, shipment_events: 0 \}; out\.verdict = 'REUSED'/.test(commitFn), 'L45. an exact retry remains REUSED with six zero deltas');
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length, 3, 'L48. the three approved coordinate authorities remain unchanged');
ok(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).every(function (k) { return DEMO4A_DEST_COORD_AUTHORITY_[k].latitude === G3_APPROVED_[k].lat; }), 'L48. their coordinates are untouched');

// ================================================================================================================
// V3G5B - DETERMINISTIC DEMO FACTORY SOURCE + FULL SOURCE/DESTINATION WAREHOUSE LINEAGE.
// The live evidence was source_warehouse_ids = ["","",""] and destination_warehouse_ids = ["","",""] with
// source_destination_warehouse_lineage_ready = false. Root cause, proven from source (not assumed):
//   (1) the intended rows read `tpl.origin_warehouse_id` / `tpl.destination_warehouse_id` DIRECTLY, and both are
//       OPTIONAL specificity columns on shipment_route_templates - the live templates legitimately leave them blank;
//   (2) the ALREADY-RESOLVED shared destination authority (which had correctly picked BFI4/AUS2/ABE2 by region) was
//       never propagated into the physical rows.
// The fix: ONE Demo source resolver (exact template authority, else a deterministic is_factory_warehouse fallback) and
// consumption of the SAME destination authority the template evaluation already produced.
// ================================================================================================================
function b5Fac(id, over) { over = over || {}; var r = { warehouse_id: id, warehouse_code: over.code || ('CNF' + id.split('-').pop()), warehouse_name: 'Factory ' + id, warehouse_type: 'FACTORY',
  company: over.company === undefined ? 'KM' : over.company, country: over.country === undefined ? 'CN' : over.country, logistics_region: 'CN East',
  is_active: over.is_active === undefined ? 'TRUE' : over.is_active, is_factory_warehouse: over.is_factory_warehouse === undefined ? 'TRUE' : over.is_factory_warehouse };
  if (over.is_shipping_enabled !== undefined) r.is_shipping_enabled = over.is_shipping_enabled;
  if (over.name) r.warehouse_name = over.name;
  return r; }
function b5Tpl(over) { over = over || {}; return { route_template_id: 'RT-B5', route_template_name: 'CN to US West', is_active: 'TRUE',
  origin_country: over.origin_country === undefined ? 'CN' : over.origin_country, origin_warehouse_id: over.origin_warehouse_id === undefined ? '' : over.origin_warehouse_id,
  destination_country: 'US', destination_region: 'US West', destination_warehouse_id: '', transit_type: 'SEA', last_mile_delivery: 'FBA' }; }
function b5Resolve(tplOver, whs, company) { return DEMO4A_resolveDemoSourceWarehouse_(b5Tpl(tplOver), whs, company === undefined ? 'KM' : company); }
// the LIVE template shape: origin_warehouse_id AND destination_warehouse_id both blank (both are optional columns).
function mastersB5(over) {
  over = over || {};
  var m = mastersLive();
  m.templates.forEach(function (x) { x.origin_warehouse_id = ''; if (over.blankDest !== false) x.destination_warehouse_id = ''; });
  if (over.nodeCounts) {
    var want = over.nodeCounts, byRegion = {}, nodes = [];
    m.templates.forEach(function (x) {
      var reg = DEMO4A_regionOf_(x), n = want[reg] || 4;
      byRegion[reg] = (byRegion[reg] || 0) + 1;
      for (var s = 1; s <= n; s++) nodes.push(nAbs(x.route_template_id, s, s === 1 ? 'origin' : (s === n ? 'destination' : (s === 2 ? 'customs' : 'port')), s === 1 ? 'origin_departure' : (s === n ? 'final_delivery' : 'port_transit')));
    });
    m.nodes = nodes;
  }
  if (over.extraWarehouses) m.warehouses = m.warehouses.concat(over.extraWarehouses);
  if (over.mapWarehouses) m.warehouses = m.warehouses.map(over.mapWarehouses);
  if (over.mapLocations) m.locations = m.locations.map(over.mapLocations);
  return m;
}
var B5_ = DEMO4A_buildPlan_(mastersB5());
var B5_SHIPS_ = B5_.tables.shipments, B5_PLANS_ = B5_.tables.shipping_plans, B5_PER_ = B5_.per_shipment;
var B5_WHS_ = mastersB5().warehouses;
var B5_APPROVED_ = { US_WEST: 'WH-KM-US-FBA-BFI4', US_CENTRAL: 'WH-KM-US-FBA-AUS2', US_EAST: 'WH-KM-US-FBA-ABE2' };

section('V3G5B-1..3. the source-resolver precedence: exact template authority wins, invalid fails closed, blank falls back');
(function () {
  var whs = [srcWhRow(), b5Fac('WH-KM-CN-FACTORY-0')];   // a LOWER id exists, so precedence (not sorting) must decide
  var exact = b5Resolve({ origin_warehouse_id: SRC_WH_ID_ }, whs);
  eq([exact.ok, exact.selection_branch, exact.warehouse_id], [true, 'TEMPLATE_EXACT_SOURCE_WAREHOUSE', SRC_WH_ID_], '1. an exact valid template origin_warehouse_id WINS over any fallback candidate');
  eq([exact.source_proven, exact.demo_fallback, exact.master_identity_proven], [true, false, true], '1/B. the exact template authority is marked source_proven, NOT a demo fallback');
  var bad = b5Resolve({ origin_warehouse_id: 'WH-KM-CN-FACTORY-NOPE' }, whs);
  eq([bad.ok, bad.reason, bad.detail], [false, 'TEMPLATE_SOURCE_WAREHOUSE_INVALID', 'DECLARED_SOURCE_WAREHOUSE_NOT_IN_MASTER'], '2. a NON-BLANK declared origin id that is not in the master fails CLOSED');
  ok(!bad.warehouse_id && !bad.selection_branch, '2. it does NOT silently fall through to the deterministic factory fallback');
  eq([b5Resolve({ origin_warehouse_id: SRC_WH_ID_ }, [srcWhRow({ is_active: 'FALSE' })]).ok, b5Resolve({ origin_warehouse_id: SRC_WH_ID_ }, [srcWhRow({ is_active: 'FALSE' })]).reason], [false, 'TEMPLATE_SOURCE_WAREHOUSE_INVALID'], '2. a declared origin warehouse with is_active=FALSE fails closed');
  // V3G5C(B) - SUPERSEDES V3G5B: is_shipping_enabled is the managed-OVERSEAS outbound capability (production evaluates
  // it only on a NON-factory endpoint), so it is not an authority over the declared template source either.
  eq(b5Resolve({ origin_warehouse_id: SRC_WH_ID_ }, [srcWhRow({ is_shipping_enabled: 'FALSE' })]).selection_branch, 'TEMPLATE_EXACT_SOURCE_WAREHOUSE', '2/V3G5C. a declared origin warehouse with is_shipping_enabled=FALSE remains VALID (no shipping-capability gate)');
  eq(b5Resolve({ origin_warehouse_id: SRC_WH_ID_ }, [srcWhRow({ country: 'VN' })]).detail, 'DECLARED_SOURCE_WAREHOUSE_COUNTRY_MISMATCH', '2. a declared origin warehouse in the wrong country fails closed');
  eq(b5Resolve({ origin_warehouse_id: SRC_WH_ID_ }, [srcWhRow({ company: 'OTHERCO' })]).detail, 'DECLARED_SOURCE_WAREHOUSE_COMPANY_MISMATCH', '2. a declared origin warehouse of another company fails closed');
  var fb = b5Resolve({}, whs);
  eq([fb.ok, fb.selection_branch, fb.demo_fallback, fb.source_proven], [true, 'DEMO_DETERMINISTIC_FACTORY_FALLBACK', true, false], '3. a BLANK template origin_warehouse_id activates the Demo fallback, truthfully marked NOT source-proven');
  eq(fb.master_identity_proven, true, '3/B. the fallback still proves an EXACT warehouses master identity');
  eq([fb.warehouse_code, fb.warehouse_name, fb.country, fb.warehouse_type, fb.is_factory_warehouse], ['CNF0', 'Factory WH-KM-CN-FACTORY-0', 'CN', 'factory', true], '3/B. the selected source binding preserves code / name / country / type / factory flag');
  eq(fb.shipping_enabled_gate_applied, false, '3/V3G5C. and it publishes shipping_enabled_gate_applied = FALSE instead of the retired is_shipping_enabled_present evidence');
})();

section('V3G5B-4..8. every fallback filter is required');
(function () {
  var base = 'WH-KM-CN-FACTORY-1';
  eq(b5Resolve({}, [b5Fac(base, { is_factory_warehouse: 'FALSE' })]).reason, 'NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE', '4. the fallback requires is_factory_warehouse = true');
  eq(b5Resolve({}, [b5Fac(base, { is_active: 'FALSE' })]).reason, 'NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE', '5. the fallback requires an active warehouse');
  // V3G5C(A/I-1,2) - SUPERSEDES V3G5B's shipping-capability gate. is_shipping_enabled is the managed-OVERSEAS outbound
  // capability; production evaluates it ONLY where is_factory_warehouse is NOT TRUE and states that factory warehouses
  // never create an overseas operation. It is therefore NOT an authority over a factory's Demo source eligibility.
  eq(b5Resolve({}, [b5Fac(base, { is_shipping_enabled: 'FALSE' })]).warehouse_id, base, 'I-1/V3G5C. an active CN factory with is_shipping_enabled = FALSE remains ELIGIBLE');
  eq(b5Resolve({}, [b5Fac(base, { is_shipping_enabled: '' })]).warehouse_id, base, 'I-2/V3G5C. an active CN factory with a BLANK is_shipping_enabled remains ELIGIBLE');
  eq(b5Resolve({}, [b5Fac(base)]).warehouse_id, base, 'I-2/V3G5C. and one with no is_shipping_enabled column at all remains ELIGIBLE');
  eq(b5Resolve({}, [b5Fac(base, { is_shipping_enabled: 'TRUE' })]).warehouse_id, base, 'I-1/V3G5C. an explicit TRUE is likewise neither required nor rewarded - the flag is simply not consulted');
  eq(['FALSE', '', 'TRUE', 'no', '0'].map(function (v) { return b5Resolve({}, [b5Fac(base, { is_shipping_enabled: v })]).warehouse_id; }), [base, base, base, base, base], 'I-1/I-2/V3G5C. EVERY is_shipping_enabled value yields the SAME selection: the flag has no effect whatsoever');
  eq(b5Resolve({}, [b5Fac(base, { country: 'VN' })]).reason, 'NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE', '7. the fallback country must equal the template origin_country EXACTLY');
  eq(b5Resolve({ origin_country: '' }, [b5Fac(base)]).detail, 'TEMPLATE_ORIGIN_COUNTRY_BLANK', '7. a blank template origin_country cannot be matched exactly and fails closed');
  eq(b5Resolve({}, [b5Fac(base, { company: 'OTHERCO' })]).reason, 'NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE', '8. the fallback company must equal the resolved Demo company when the warehouse company is populated');
  eq(b5Resolve({}, [b5Fac(base, { company: '' })]).warehouse_id, base, '8. a warehouse with a BLANK company is not excluded by the company gate');
})();

section('V3G5B-9..16. the fallback is deterministic and never substitutes another identity');
(function () {
  var pool = [b5Fac('WH-KM-CN-FACTORY-9'), b5Fac('WH-KM-CN-FACTORY-2'), b5Fac('WH-KM-CN-FACTORY-7')];
  eq(b5Resolve({}, pool).warehouse_id, 'WH-KM-CN-FACTORY-2', '9. eligible candidates are sorted by normalized warehouse_id ASCENDING and the FIRST is chosen');
  eq(b5Resolve({}, pool.slice().reverse()).warehouse_id, 'WH-KM-CN-FACTORY-2', '10. reversing the input row order does not change the selection');
  eq(b5Resolve({}, [pool[2], pool[0], pool[1]]).warehouse_id, 'WH-KM-CN-FACTORY-2', '10. an arbitrary third permutation selects the same row');
  eq(b5Resolve({}, pool).candidate_count, 3, '9/B. the evidence reports how many candidates competed (no silent truncation)');
  var G_CODE_ = G.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
  ok(/Math\.random/.test(G_CODE_) === false, '11. Math.random appears nowhere in the tool CODE (the only textual occurrence is the prohibition comment itself)');
  ok(/Math\.random/.test(extractFn(G, 'DEMO4A_resolveDemoSourceWarehouse_')
    .split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n')) === false, '11. and specifically not inside the source resolver');
  ok(/DEMO4A_resolveDemoSourceWarehouse_\(template, warehouses, company\)/.test(G) && /function DEMO4A_resolveDemoSourceWarehouse_[\s\S]*?\n\}/.exec(G)[0].indexOf('locations') === -1, '12/13. the resolver takes NO locations argument: it can require no coordinate and cannot substitute a route/logistics id');
  var noCoordOnly = [b5Fac('WH-KM-CN-FACTORY-3')];   // no logistics_location, no latitude/longitude anywhere
  eq(b5Resolve({}, noCoordOnly).warehouse_id, 'WH-KM-CN-FACTORY-3', '12. a factory with NO coordinate and NO logistics_location row is still eligible (business identity is separate from geography)');
  var routeIds = {}; B5_.tables.shipment_routes.forEach(function (r) { if (DEMO4A_str_(r.location_ref_id)) routeIds[DEMO4A_low_(r.location_ref_id)] = 1; });
  ok(B5_SHIPS_.every(function (sh) { return !routeIds[DEMO4A_low_(sh.source_warehouse_id)] && !routeIds[DEMO4A_low_(sh.destination_warehouse_id)]; }), '13. no route/logistics location id is ever written into a warehouse identity field');
  ok(b5Resolve({}, [whLive('BFI4'), whLive('AUS2'), whLive('ABE2')]).ok === false, '14. destination FBA warehouses are NOT factory warehouses and can never be selected as the source');
  eq(b5Resolve({ origin_warehouse_id: 'FACTORY-1' }, [srcWhRow()]).detail, 'DECLARED_SOURCE_WAREHOUSE_NOT_IN_MASTER', '15. a warehouse_code is never accepted in place of a warehouse_id');
  eq(b5Resolve({ origin_warehouse_id: 'KM CN Factory 1' }, [srcWhRow()]).detail, 'DECLARED_SOURCE_WAREHOUSE_NOT_IN_MASTER', '15. no fuzzy / warehouse_name matching');
  eq(b5Resolve({ origin_warehouse_id: 'WH-KM-CN-FACT' }, [srcWhRow()]).detail, 'DECLARED_SOURCE_WAREHOUSE_NOT_IN_MASTER', '15. no prefix / partial matching');
  eq(b5Resolve({}, []).reason, 'WAREHOUSES_MASTER_ABSENT', '16. an absent warehouses master is reported, never guessed around');
  eq(b5Resolve({}, [b5Fac('WH-X', { country: 'US' })]).reason, 'NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE', '16. an empty eligible set fails CLOSED - no id is fabricated to make the Demo pass');
})();

section('V3G5B-17..24. source and destination are propagated into every plan and shipment');
(function () {
  ok(B5_.ok, '17. the plan builds from the LIVE template shape (origin AND destination warehouse ids both blank)');
  var whIds = {}; B5_WHS_.forEach(function (w) { whIds[DEMO4A_whId_(w)] = w; });
  eq(B5_PLANS_.map(function (p) { return DEMO4A_str_(p.source_warehouse_id); }), [SRC_WH_ID_, SRC_WH_ID_, SRC_WH_ID_], '17. all three shipping_plans receive the resolved source_warehouse_id');
  eq(B5_SHIPS_.map(function (sh) { return DEMO4A_str_(sh.source_warehouse_id); }), [SRC_WH_ID_, SRC_WH_ID_, SRC_WH_ID_], '18. all three shipments inherit source_warehouse_id from their parent plan');
  ok(B5_SHIPS_.every(function (sh) { var pl = B5_PLANS_.filter(function (p) { return p.shipping_plan_id === sh.shipping_plan_id; })[0]; return pl && pl.source_warehouse_id === sh.source_warehouse_id && pl.destination_warehouse_id === sh.destination_warehouse_id; }), '18/22. plan -> shipment equality is exact for BOTH warehouse endpoints');
  ok(B5_SHIPS_.every(function (sh) { return !!whIds[DEMO4A_str_(sh.source_warehouse_id)]; }), '19. every source_warehouse_id resolves to an EXACT warehouses.warehouse_id master row');
  ok(B5_PER_.every(function (x) { return DEMO4A_low_(x.source_warehouse_country) === DEMO4A_low_(x.template_origin_country); }), '19/C. the source warehouse country equals the selected template origin_country');
  ok(B5_SHIPS_.every(function (sh) { return DEMO4A_low_(sh.source_warehouse_id) !== DEMO4A_low_(sh.destination_warehouse_id); }), '20. source != destination on every shipment');
  ok(B5_PLANS_.every(function (p) { return DEMO4A_str_(p.destination_warehouse_id) !== ''; }), '21. all three shipping_plans receive a non-blank destination_warehouse_id');
  ok(B5_PER_.every(function (x) { return DEMO4A_str_(x.destination_warehouse_id) === B5_APPROVED_[x.region]; }), '23. the destinations remain exactly BFI4 / AUS2 / ABE2 for US_WEST / US_CENTRAL / US_EAST');
  eq(B5_PER_.map(function (x) { return x.region + '=' + x.destination_warehouse_code; }).sort().join(','), 'US_CENTRAL=AUS2,US_EAST=ABE2,US_WEST=BFI4', '23/E. and their warehouse_code snapshots are AUS2 / ABE2 / BFI4');
  ok(B5_PER_.every(function (x) { return x.destination_logistics_location_id === 'LOC-' + x.destination_warehouse_id && x.destination_logistics_location_id !== x.destination_warehouse_id; }), '24. the destination logistics-location lineage is exact and is NEVER written as the warehouse id');
  ok(/usedBinding && usedBinding\.destination_authority/.test(G) && /var destWh = da \? DEMO4A_str_\(da\.warehouse_id\)/.test(G), '24/D. the destination is CONSUMED from the shared template evaluation, never independently re-resolved after selection');
})();

section('V3G5B-25..29. the physical shipment contract and the pre-write projection gate');
(function () {
  ok(B5_SHIPS_.every(function (sh) { var per = B5_PER_.filter(function (x) { return x.shipment_id === sh.shipment_id; })[0]; return DEMO4A_str_(sh.warehouse_code) === DEMO4A_str_(per.destination_warehouse_code) && DEMO4A_str_(sh.warehouse_code) !== ''; }), '25. shipments.warehouse_code is the DESTINATION warehouse-code snapshot (the source-proven production meaning)');
  ok(B5_SHIPS_.every(function (sh) { return DEMO4A_low_(sh.warehouse_code) !== DEMO4A_low_(sh.destination_warehouse_id) && DEMO4A_low_(sh.warehouse_code) !== DEMO4A_low_(sh.source_warehouse_id); }), '25. it is never an identity: it equals neither warehouse id');
  ok(/warehouse_code is the DESTINATION warehouse-code snapshot/.test(G) && /never used as a foreign key/.test(G), '25. the source records the audited production meaning and the never-a-FK rule');
  ok(B5_SHIPS_.every(function (sh) { return !Object.prototype.hasOwnProperty.call(sh, 'warehouse_id'); }), '26. no intended shipment row carries warehouse_id');
  ok(B5_SHIPS_.every(function (sh) { return !Object.prototype.hasOwnProperty.call(sh, 'updated_by'); }), '27. no intended shipment row carries updated_by');
  ok(B5_SHIPS_.every(function (sh) { return DEMO4A_str_(sh.created_by) && DEMO4A_str_(sh.created_at) && DEMO4A_str_(sh.updated_at); }), '27/F. created_by / created_at / updated_at are preserved');
  ok(/insertColumn|appendColumn|createSheet|ALTER TABLE/.test(G) === false, '27/F. no column is created or migrated');
  var hdrs = {}; DEMO4A_WRITE_ORDER_.forEach(function (t2) { var seen = {}; (B5_.tables[t2] || []).forEach(function (r) { Object.keys(r).forEach(function (k) { seen[k] = 1; }); }); hdrs[t2] = Object.keys(seen); });
  eq(DEMO4A_writerProjectionGaps_(B5_, hdrs).missing_total, 0, '28. the corrected intended rows project completely onto the corrected physical headers');
  ['source_warehouse_id', 'destination_warehouse_id', 'warehouse_code', 'created_by', 'created_at', 'updated_at'].forEach(function (f) {
    var h2 = {}; DEMO4A_WRITE_ORDER_.forEach(function (t2) { h2[t2] = hdrs[t2].filter(function (c) { return !(t2 === 'shipments' && c === f); }); });
    var g2 = DEMO4A_writerProjectionGaps_(B5_, h2);
    ok(!g2.ok && g2.missing_fields.some(function (m) { return m.table === 'shipments' && m.field === f; }), '29. a missing physical shipments.' + f + ' column BLOCKS (writer-owned, never silently dropped)');
  });
  var cf = extractFn(G, 'TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED');
  ok(cf.indexOf('COMMIT_BLOCKED_WRITER_PROJECTION_INCOMPLETE') !== -1 && cf.indexOf('COMMIT_BLOCKED_WRITER_PROJECTION_INCOMPLETE') < cf.indexOf('setProperty') && cf.indexOf('COMMIT_BLOCKED_WRITER_PROJECTION_INCOMPLETE') < cf.indexOf('appendRow'), '29. the projection gate still runs BEFORE the journal write and before the first appendRow');
})();

section('V3G5B-30..32. the source/destination lineage gate and the authorization conjunction');
(function () {
  var g = DEMO4A_srcDestLineageGate_(B5_, B5_WHS_);
  eq([g.source_destination_warehouse_lineage_ready, g.reason_count], [true, 0], '30. the exact corrected plan satisfies source_destination_warehouse_lineage_ready');
  eq(g.source_warehouse_codes, ['CNFAC1', 'CNFAC1', 'CNFAC1'], '30/L. the gate reports the source warehouse CODES');
  eq(g.source_selection_branches, ['DEMO_DETERMINISTIC_FACTORY_FALLBACK', 'DEMO_DETERMINISTIC_FACTORY_FALLBACK', 'DEMO_DETERMINISTIC_FACTORY_FALLBACK'], '30/L. and the selection BRANCH that produced each');
  eq(B5_.binding_gates.ok, true, '30. binding_gates.ok includes the lineage gate and passes on the corrected plan');
  function mutate(fn, expectRe) {
    var p2 = { tables: { shipping_plans: JSON.parse(JSON.stringify(B5_PLANS_)), shipments: JSON.parse(JSON.stringify(B5_SHIPS_)), shipment_routes: B5_.tables.shipment_routes }, per_shipment: B5_PER_ };
    fn(p2);
    var gg = DEMO4A_srcDestLineageGate_(p2, B5_WHS_);
    ok(gg.source_destination_warehouse_lineage_ready === false && gg.reasons.some(function (r) { return expectRe.test(r); }), '31. ' + expectRe.source + ' fails the lineage gate closed');
  }
  mutate(function (p2) { p2.tables.shipments[0].source_warehouse_id = ''; }, /^SHIPMENT_SOURCE_WAREHOUSE_BLANK/);
  mutate(function (p2) { p2.tables.shipments[0].destination_warehouse_id = ''; }, /^SHIPMENT_DESTINATION_WAREHOUSE_BLANK/);
  mutate(function (p2) { p2.tables.shipping_plans[0].source_warehouse_id = ''; }, /^PLAN_SOURCE_WAREHOUSE_BLANK/);
  mutate(function (p2) { p2.tables.shipping_plans[0].destination_warehouse_id = ''; }, /^PLAN_DESTINATION_WAREHOUSE_BLANK/);
  mutate(function (p2) { p2.tables.shipments[0].source_warehouse_id = 'WH-KM-CN-FACTORY-OTHER'; }, /^SOURCE_NOT_INHERITED_FROM_PLAN/);
  mutate(function (p2) { p2.tables.shipments[0].destination_warehouse_id = 'WH-KM-US-FBA-ONT8'; }, /^DESTINATION_NOT_INHERITED_FROM_PLAN/);
  mutate(function (p2) { p2.tables.shipments[0].source_warehouse_id = p2.tables.shipments[0].destination_warehouse_id; p2.tables.shipping_plans[0].source_warehouse_id = p2.tables.shipments[0].destination_warehouse_id; }, /^SOURCE_EQUALS_DESTINATION/);
  mutate(function (p2) { p2.tables.shipments.forEach(function (sh) { sh.source_warehouse_id = 'WH-NOT-IN-MASTER'; }); p2.tables.shipping_plans.forEach(function (pl) { pl.source_warehouse_id = 'WH-NOT-IN-MASTER'; }); }, /^SOURCE_WAREHOUSE_NOT_IN_MASTER/);
  mutate(function (p2) { var loc = DEMO4A_str_(B5_.tables.shipment_routes[0].location_ref_id); p2.tables.shipments.forEach(function (sh) { sh.source_warehouse_id = loc; }); p2.tables.shipping_plans.forEach(function (pl) { pl.source_warehouse_id = loc; }); }, /^SOURCE_IS_A_ROUTE_LOCATION_ID/);
  mutate(function (p2) { p2.tables.shipments.forEach(function (sh, i) { sh.destination_warehouse_id = B5_PER_[i].destination_logistics_location_id; }); p2.tables.shipping_plans.forEach(function (pl, i) { pl.destination_warehouse_id = B5_PER_[i].destination_logistics_location_id; }); }, /^DESTINATION_LOGISTICS_LOCATION_WRITTEN_AS_WAREHOUSE|^DESTINATION_NOT_APPROVED_FOR_REGION/);
  mutate(function (p2) { p2.tables.shipments[0].warehouse_id = p2.tables.shipments[0].destination_warehouse_id; }, /^THIRD_WAREHOUSE_AUTHORITY_PRESENT/);
  mutate(function (p2) { p2.tables.shipments[0].warehouse_code = 'ZZZZ'; }, /^WAREHOUSE_CODE_NOT_DESTINATION_SNAPSHOT/);
  mutate(function (p2) { p2.tables.shipments[0].warehouse_code = p2.tables.shipments[0].destination_warehouse_id; }, /^WAREHOUSE_CODE_WRITTEN_AS_WAREHOUSE_ID/);
  // 32 - the compact authorization envelope must REQUIRE the gate.
  var MP = { present: { shipment_route_templates: true, shipment_route_template_nodes: true, logistics_locations: true, marketplace_skus: true, sku_details: true, warehouses: true } };
  var PV = { verdict: 'THREE_REGION_COORDINATE_PROPOSAL_READY', proposal_entries: 3 };
  var envOk = DEMO4A_authorizationSummary_({ ok: true }, MP, B5_, B5_, emptyLive(), PV);
  eq([envOk.may_run_dry_run, envOk.gate_summary.source_destination_warehouse_lineage_ready, envOk.preflight_verdict], [true, true, 'READY_FOR_DEMO_SEED'], '32. the compact authorization envelope authorizes the corrected plan');
  eq(envOk.source_destination_warehouse_lineage.source_selection_branches[0], 'DEMO_DETERMINISTIC_FACTORY_FALLBACK', '32/L. the envelope exposes the source ids / codes / selection branches compactly');
  eq(envOk.source_destination_warehouse_lineage.destination_warehouse_codes.slice().sort().join(','), 'ABE2,AUS2,BFI4', '32/L. and the destination ids / codes');
  eq(Object.keys(envOk.per_shipment[0]).filter(function (k) { return /^(source_warehouse_id|source_warehouse_code|source_selection_branch|destination_warehouse_id|destination_warehouse_code|destination_logistics_location_id)$/.test(k); }).length, 6, '32/L. every per-shipment authorization object carries all SIX required lineage fields');
  var broken = JSON.parse(JSON.stringify({ ok: true })); broken = Object.assign({}, B5_); broken.binding_gates = Object.assign({}, B5_.binding_gates, { source_destination_warehouse_lineage_ready: false, ok: false });
  var envBad = DEMO4A_authorizationSummary_({ ok: true }, MP, broken, broken, emptyLive(), PV);
  eq([envBad.may_run_dry_run, envBad.may_arm_commit_checksum, envBad.gate_summary.all_pass], [false, false, false], '32. a false lineage gate blocks may_run_dry_run AND may_arm_commit_checksum');
  ok(JSON.stringify(envOk).length < 6000, '32/L. the authorization envelope is ' + JSON.stringify(envOk).length + ' bytes (< 6000) and dumps no warehouses');
  ok(JSON.stringify(envOk).indexOf('warehouse_name') === -1 && JSON.stringify(envOk).indexOf('address_line1') === -1, '32/L. no master warehouse rows are dumped into the envelope');
})();

section('V3G5B-33..35. the format-risk correction: only ACTUAL coercion risk counts');
(function () {
  var hdrs = {}, ctc = {};
  DEMO4A_WRITE_ORDER_.forEach(function (t2) { var seen = {}; (B5_.tables[t2] || []).forEach(function (r) { Object.keys(r).forEach(function (k) { seen[k] = 1; }); }); hdrs[t2] = Object.keys(seen); ctc[t2] = {}; hdrs[t2].forEach(function (h) { ctc[t2][h] = 'text_cell'; }); });
  // the EXACT live warning condition: two text-class columns whose EXISTING cells are numeric-formatted.
  ctc.shipping_plans.ship_from = 'numeric_cell'; ctc.shipping_plans.destination = 'numeric_cell';
  var LG = DEMO4A_srcDestLineageGate_(B5_, B5_WHS_);
  function diag(cc) { return DEMO4A_canonDiagnosticCore_({ ok: true }, mastersB5(), B5_, hdrs, cc, { ok: true, offset_min: 480, time_zone: 'Asia/Taipei' }, null, 'ABSENT_ALL', LG, true); }
  var d = diag(ctc);
  eq(DEMO4A_str_(B5_PLANS_[0].ship_from), 'CN', '33. the intended shipping_plans.ship_from value is the NON-NUMERIC text "CN"');
  ok(/^US /.test(DEMO4A_str_(B5_PLANS_[0].destination)) && !DEMO4A_numericLike_(B5_PLANS_[0].destination), '33. the intended shipping_plans.destination value is NON-NUMERIC region text');
  eq([d.predicted_roundtrip_risk_fields, d.risk_count], [[], 0], '33. non-numeric text in a numeric-formatted column is NOT a risk: risk_count = 0');
  eq([d.number_format_risk_fields, d.verdict], [[], 'READY_FOR_CONTROLLED_RETRY'], '33. and the diagnostic no longer blocks on it');
  eq(d.format_risk_is_value_aware, true, '33. the diagnostic declares that its format risk is VALUE-aware, not column-class-aware');
  // pure round-trip proof (never "declared safe" without one): the exact Apps-Script coercions over these two values.
  function rt(v) { var cls = DEMO4A_fieldClass_('ship_from'); if ((cls === 'numeric' || cls === 'coordinate')) { var n = Number(v); if (isFinite(n)) return n; } return v; }
  eq([rt('CN'), rt('US West')], ['CN', 'US West'], '33. PURE ROUND TRIP: both values are text-class, so setValues/getValues returns them unchanged');
  eq([DEMO4A_canon_('ship_from', 'CN'), DEMO4A_canon_('destination', 'US West')], ['CN', 'US West'], '33. and their canonical forms are byte-identical after the round trip');
  // 34 - a numeric-LIKE text value in a non-numeric field is STILL a real risk.
  var numLike = Object.assign({}, B5_, { tables: Object.assign({}, B5_.tables, { shipping_plans: B5_PLANS_.map(function (p) { var c = {}; for (var k in p) c[k] = p[k]; c.ship_from = '0086'; return c; }) }) });
  var d2 = DEMO4A_canonDiagnosticCore_({ ok: true }, mastersB5(), numLike, hdrs, ctc, { ok: true, offset_min: 480 }, null, 'ABSENT_ALL', LG, true);
  ok(d2.risk_count > 0 && d2.number_format_risk_fields.some(function (r) { return r.field === 'ship_from' && r.reason_code === 'NUMERIC_LIKE_VALUE_IN_NUMERIC_COLUMN'; }), '34. a NUMERIC-LIKE text value in a numeric-formatted column remains a real blocking risk');
  eq(d2.verdict, 'CANONICALIZATION_RISK_REMAINS', '34. and it still blocks the retry verdict');
  eq([DEMO4A_numericLike_('0086'), DEMO4A_numericLike_('CN'), DEMO4A_numericLike_('US West'), DEMO4A_numericLike_(''), DEMO4A_numericLike_('  '), DEMO4A_numericLike_(12)], [true, false, false, false, false, true], '34. the numeric-like predicate is narrow: blank and whitespace are not numeric-like');
  eq([DEMO4A_dateLike_('2026-08-24'), DEMO4A_dateLike_('US West'), DEMO4A_boolLike_('TRUE'), DEMO4A_boolLike_('CN')], [true, false, true, false], '34. the date-like and boolean-like predicates are equally narrow');
  // 35 - no apostrophe prefixing, no column formatting mutation, no weakened comparison.
  ok(/setNumberFormat|setNumberFormats/.test(G) === false, '35. the tool never changes any column or cell number format');
  ok(/"'" \+|'\\'' \+/.test(G) === false, '35. the tool never prepends an apostrophe to force text');
  ok(/String\(a\) == String\(b\)|Number\(a\) === Number\(b\)/.test(G) === false, '35. arbitrary text/number comparison is not weakened');
})();

section('V3G5B-36/37. the six-table shape and route/event semantics stay complete');
(function () {
  var m46 = mastersB5({ nodeCounts: { US_WEST: 16, US_CENTRAL: 15, US_EAST: 15 } });
  var P46 = DEMO4A_buildPlan_(m46);
  ok(P46.ok, '36. the plan builds on a live-scale node fixture');
  eq(P46.counts, { shipping_plans: 3, shipping_plan_lines: 8, shipments: 3, shipment_lines: 8, shipment_routes: 46, shipment_events: 5, total: 73 }, '36. the exact six-table counts remain 3 / 8 / 3 / 8 / 46 / 5 = 73');
  // one route row per template node, in the template node order (no node dropped, none reordered).
  P46.per_shipment.forEach(function (x) {
    var rows = P46.tables.shipment_routes.filter(function (r) { return r.shipment_id === x.shipment_id; });
    eq(rows.length, x.nodes, '37. ' + x.slot + ': one route row per template node (complete ordered sequence)');
    eq(rows.map(function (r) { return DEMO4A_num_(r.sequence_no); }).join(','), rows.map(function (r, i) { return i + 1; }).join(','), '37. ' + x.slot + ': the node sequence is preserved in order');
  });
  ok(P46.tables.shipment_routes.some(function (r) { return DEMO4A_str_(r.latitude) === '' && DEMO4A_str_(r.location_ref_id) === ''; }), '37. abstract nodes stay coordinate-blank timeline rows (never map markers)');
  ok(P46.tables.shipment_routes.some(function (r) { return DEMO4A_validCoord_(r.latitude, r.longitude); }), '37. geographic nodes remain renderable markers');
  var byShip = {}; P46.tables.shipment_events.forEach(function (e) { (byShip[e.shipment_id] = byShip[e.shipment_id] || []).push(e); });
  P46.per_shipment.forEach(function (x) {
    var evs = byShip[x.shipment_id] || [], last = evs[evs.length - 1];
    var destRoute = P46.tables.shipment_routes.filter(function (r) { return r.shipment_id === x.shipment_id; }).pop();
    if (x.slot === 'origin') eq(evs.length, 1, '37. the shipped shipment records ONLY the departed-origin event');
    if (x.slot === 'in_transit') { eq(evs.length, 2, '37. the in-transit shipment records origin + current events'); ok(last.shipment_route_id !== destRoute.shipment_route_id, '37. and NO received event at the destination'); }
    if (x.slot === 'delivered') { ok(last.shipment_route_id === destRoute.shipment_route_id, '37. the delivered shipment ends with a final received event at the destination warehouse'); eq([DEMO4A_num_(last.latitude), DEMO4A_num_(last.longitude)], [DEMO4A_num_(destRoute.latitude), DEMO4A_num_(destRoute.longitude)], '37. the event coordinate equals its route coordinate exactly'); }
  });
  ok(P46.per_shipment.every(function (x) { return x.destination_facility_marker_renderable === true && x.destination_coordinate_branch === 'DEMO_ADDRESS_DERIVED_DESTINATION_COORDINATE'; }), '37/G. the destination endpoint stays map-consumer ready on the approved address-derived coordinates');
  ok(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).every(function (k) { return DEMO4A_DEST_COORD_AUTHORITY_[k].latitude === G3_APPROVED_[k].lat && DEMO4A_DEST_COORD_AUTHORITY_[k].longitude === G3_APPROVED_[k].lng; }), '37/50. the ABE2 / AUS2 / BFI4 address-derived coordinates are unchanged');
})();

section('V3G5B-38..41. the corrected checksum is natural, deterministic and lineage-bound');
(function () {
  eq(DEMO4A_buildPlan_(mastersB5()).checksum, B5_.checksum, '38. the same live input reproduces the same checksum exactly');
  eq(DEMO4A_buildPlan_(mastersB5()).checksum, DEMO4A_buildPlan_(mastersB5()).checksum, '38. and again on a third independent evaluation');
  var srcAlt = DEMO4A_buildPlan_(mastersB5({ extraWarehouses: [b5Fac('WH-KM-CN-FACTORY-0')] }));
  eq(srcAlt.per_shipment[0].source_warehouse_id, 'WH-KM-CN-FACTORY-0', '39. a different deterministic source selection is actually reached');
  ok(srcAlt.checksum !== B5_.checksum, '39. changing the SOURCE warehouse lineage changes the checksum');
  var brAlt = DEMO4A_buildPlan_(mastersB5({ blankDest: false }));   // templates declare their own destination again
  ok(brAlt.ok && brAlt.per_shipment[0].source_selection_branch === 'DEMO_DETERMINISTIC_FACTORY_FALLBACK', '39/B. the source selection BRANCH is part of the checksummed evidence');
  ok(/'WHSRC', shipId/.test(G), '39/J. the binding manifest binds the source identity, code, name, company, country, type, factory flag and branch');
  // 40 - a pure DESTINATION LINEAGE change with everything else identical: the ABE2 logistics row is renamed, so the
  // join still holds and all three regions still build DISTINCT_WCE - only the bound destination_logistics_location_id
  // differs. The checksum must move on that alone.
  var dstLoc = DEMO4A_buildPlan_(mastersB5({ mapLocations: function (l) { var c = {}; for (var k in l) c[k] = l[k]; if (c.logistics_location_id === 'LOC-WH-KM-US-FBA-ABE2') c.logistics_location_id = 'LOC-ALT-ABE2'; return c; } }));
  eq([dstLoc.ok, dstLoc.region_selection_mode, dstLoc.per_shipment.map(function (x) { return x.destination_logistics_location_id; }).indexOf('LOC-ALT-ABE2') >= 0], [true, 'DISTINCT_WCE', true], '40. the destination lineage really changed while the plan still builds all three regions');
  ok(dstLoc.checksum !== B5_.checksum, '40. changing the DESTINATION logistics-location lineage alone changes the checksum');
  // and a changed destination ADDRESS invalidates the fingerprint-bound coordinate authority, which fails that region
  // closed rather than deriving a coordinate for an address nobody reviewed.
  var dstAlt = DEMO4A_buildPlan_(mastersB5({ mapWarehouses: function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (c.warehouse_code === 'ABE2') c.address_line1 = c.address_line1 + ' UNIT 5'; return c; } }));
  ok(dstAlt.checksum !== B5_.checksum && dstAlt.region_selection_mode !== 'DISTINCT_WCE', '40. changing the DESTINATION address invalidates its approved fingerprint: the checksum moves and US_EAST can no longer be built');
  var MP2 = { present: { shipment_route_templates: true, shipment_route_template_nodes: true, logistics_locations: true, marketplace_skus: true, sku_details: true, warehouses: true } };
  eq(DEMO4A_authorizationSummary_({ ok: true }, MP2, dstAlt, dstAlt, emptyLive(), { verdict: 'THREE_REGION_COORDINATE_PROPOSAL_READY', proposal_entries: 3 }).may_run_dry_run, false, '40. and that degraded plan can never be authorized (DISTINCT_WCE is required)');
  ok(/7e4cf9d9/.test(G) === false && /8b3eabec/.test(G) === false, '41. neither retired candidate checksum (7e4cf9d9 / 8b3eabec) is named anywhere in source, so nothing can be pinned to them');
  ok(new RegExp("DEMO4A_CONFIRMED_SEED_CHECKSUM_ = '[0-9a-f]{8}").test(G) === false, '41. no live checksum is pinned into the confirmation constant');
})();

section('V3G5B-42..47. journal safety, rollback and REUSED remain intact on the corrected contract');
(function () {
  var hdrs = {}; DEMO4A_WRITE_ORDER_.forEach(function (t2) { var seen = {}; (B5_.tables[t2] || []).forEach(function (r) { Object.keys(r).forEach(function (k) { seen[k] = 1; }); }); hdrs[t2] = Object.keys(seen); });
  var ctc = {}; DEMO4A_WRITE_ORDER_.forEach(function (t2) { ctc[t2] = {}; hdrs[t2].forEach(function (h) { ctc[t2][h] = 'text_cell'; }); });
  var LG = DEMO4A_srcDestLineageGate_(B5_, B5_WHS_);
  function dg(journal, state) { return DEMO4A_canonDiagnosticCore_({ ok: true }, mastersB5(), B5_, hdrs, ctc, { ok: true, offset_min: 480 }, journal, state || 'ABSENT_ALL', LG, true); }
  var priorPlan = Object.assign({}, B5_, { checksum: 'retired1' });
  var prior = DEMO4A_buildJournal_(priorPlan);
  eq([dg(null).journal_retry_safe, dg(null).journal_retry_reason], [true, 'NO_PRIOR_JOURNAL'], '42. no prior journal is safe');
  eq([dg(prior).journal_retry_safe, dg(prior).journal_retry_reason], [true, 'PRIOR_JOURNAL_IS_A_ROLLED_BACK_ATTEMPT_AND_WILL_BE_SUPERSEDED'], '42. a prior journal + ABSENT_ALL is a rolled-back attempt and is safe to supersede (its retired checksum is EXPECTED to differ)');
  eq(dg(prior).journal_previous_checksum, 'retired1', '42. the prior checksum is REPORTED read-only, never mutated');
  eq(dg({ plan_checksum: 'retired1' }).journal_retry_reason, 'PRIOR_JOURNAL_INTEGRITY_INVALID', '42. a journal that fails its own integrity recomputation is UNSAFE');
  eq(dg(prior, 'PARTIAL_PRESENT').journal_retry_safe, false, '42. a prior attempt that left rows behind is UNSAFE');
  ok(/deleteProperty/.test(extractFn(G, 'TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION')) === false && /deleteProperty/.test(extractFn(G, 'TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION')) === false, '42/K. neither read-only entrypoint clears or mutates the live journal');
  var cf = extractFn(G, 'TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED');
  ok(/rb\.ok \? 'COMMIT_FAILED_POSTCHECK_ROLLED_BACK' : 'COMMIT_FAILED_POSTCHECK_ROLLBACK_UNVERIFIED'/.test(cf), '43/44. inserted-only rollback and its MANDATORY verification remain intact');
  ok(/COMMITTED_UNVERIFIED/.test(G) === false, '45. COMMITTED_UNVERIFIED remains impossible');
  var live = liveFromPlan(B5_);
  eq(DEMO4A_classifyState_(B5_, live).classification, 'PRESENT_EXACT_ALL', '46. an exact successful write of the corrected rows classifies PRESENT_EXACT_ALL');
  ok(/cls\.classification === 'PRESENT_EXACT_ALL'\) \{ out\.delta = \{ shipping_plans: 0, shipping_plan_lines: 0, shipments: 0, shipment_lines: 0, shipment_routes: 0, shipment_events: 0 \}; out\.verdict = 'REUSED'/.test(cf), '47. an exact retry remains REUSED with six zero deltas');
  var drifted = liveFromPlan(B5_); drifted.shipments.rows[0].warehouse_code = 'ZZZZ';
  eq(DEMO4A_classifyState_(B5_, drifted).classification, 'CONTENT_DRIFT', '47. a mutated destination code snapshot is still genuine blocking CONTENT_DRIFT');
})();

section('V3G5B-48..50. earlier contracts, constants and coordinate authorities are untouched');
ok(plan.ok && A5_PLAN_.ok && V5_PLAN_.ok && B5_.ok, '48. the V3A / V3C / V3G4 / V3G5 / V3G5A fixtures all still build (every earlier section above ran green)');
ok(A5_SHIPS_.every(function (sh) { return DEMO4A_str_(sh.source_warehouse_id) === SRC_WH_ID_; }), '48. the V3G5A template-declared-source contract still resolves through the new resolver unchanged');
eq(A5_PLAN_.per_shipment[0].source_selection_branch, 'TEMPLATE_EXACT_SOURCE_WAREHOUSE', '48. and it is correctly reported as the exact template authority, not a fallback');
eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], '49. both confirmation constants remain placeholders (COMMIT and CLEAR stay disarmed)');
eq(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).length, 3, '50. exactly the three approved coordinate authorities remain armed');
ok(Object.keys(DEMO4A_DEST_COORD_AUTHORITY_).every(function (k) { return DEMO4A_DEST_COORD_AUTHORITY_[k].review_status === 'user_approved'; }), '50. and all three remain USER-approved, unmodified');
ok(new RegExp("getSheetByName\\('warehouses'\\)\\.(appendRow|deleteRow|setValue)").test(G) === false, '50. the warehouses master remains read-only');

// ================================================================================================================
// V3G5C - CORRECTED FACTORY SOURCE ELIGIBILITY SEMANTICS.
// V3G5B's own audit proved that `warehouses.is_shipping_enabled` is the production managed-OVERSEAS outbound
// capability, evaluated ONLY where `is_factory_warehouse` is NOT TRUE, and that factory warehouses never create an
// overseas operation at all. V3G5B nevertheless gated the Demo SOURCE warehouse on it "when present", which could
// reject a perfectly valid active factory. This section proves the corrected semantic, the deletion of the gate, and
// that every other V3G5B protection survives the correction unchanged.
// ================================================================================================================
section('V3G5C-A/E. the semantic correction is documented in source and NO executable path consults is_shipping_enabled');
(function () {
  // the source must EXPLAIN the correction, not merely drop the gate.
  ok(/is_shipping_enabled is the managed-OVERSEAS outbound capability and is STRUCTURALLY never evaluated for a factory/.test(G), 'A. the source records WHY the gate was removed (the managed-overseas capability semantic)');
  ok(/SYSTEM_RUNTIME_ARCHITECTURE\.md/.test(G) && /WAREHOUSE_OPERATIONS_SPEC\.md/.test(G) && /OVERSEAS_OUTBOUND_SPEC\.md/.test(G) && /DATABASE_RELATIONSHIP_MAP\.md/.test(G), 'A. and cites all four production sources that establish it');
  ok(/A factory warehouse must\s*\n?\/\/ therefore NEVER be rejected merely because is_shipping_enabled is false or blank/.test(G), 'A. and states the resulting rule explicitly');
  ok(/No production\s*\n\/\/ handler, master column or master data is changed/.test(G), 'A. and records that no production/master schema or data changes');
  // E - the SOURCE-FACT proof: strip comments, then no executable line may read the flag.
  var CODE = G.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
  ok(/DEMO4A_whShippingEnabled_|DEMO4A_whShippingEnabledPresent_/.test(CODE) === false, 'E. both shipping-capability accessors are DELETED, not merely left unused');
  ok(/is_shipping_enabled'|shipping_enabled'/.test(CODE) === false, 'E. no executable line reads an is_shipping_enabled / shipping_enabled column at all');
  var RES = extractFn(G, 'DEMO4A_resolveDemoSourceWarehouse_').split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n');
  ok(/shipping/i.test(RES) === false, 'E. the resolver body itself contains no shipping-capability reference on ANY branch');
  ok(/locations|latitude|longitude|logistics_location/.test(RES) === false, 'I-9. and no location / coordinate / logistics_location dependency on ANY branch');
  eq(DEMO4A_SOURCE_SHIPPING_ENABLED_GATE_APPLIED_, false, 'H. the published gate flag is FALSE');
})();

section('V3G5C-I. the corrected eligibility matrix, one row per rule');
(function () {
  var ID = 'WH-KM-CN-FACTORY-1';
  function elig(over) { return DEMO4A_resolveDemoSourceWarehouse_(b5Tpl({}), [b5Fac(ID, over)], 'KM'); }
  [['is_shipping_enabled FALSE', { is_shipping_enabled: 'FALSE' }, true],
   ['is_shipping_enabled blank', { is_shipping_enabled: '' }, true],
   ['is_shipping_enabled absent', {}, true],
   ['is_shipping_enabled TRUE', { is_shipping_enabled: 'TRUE' }, true],
   ['is_active FALSE', { is_active: 'FALSE' }, false],
   ['is_factory_warehouse FALSE', { is_factory_warehouse: 'FALSE' }, false],
   ['wrong country', { country: 'VN' }, false],
   ['wrong populated company', { company: 'OTHERCO' }, false],
   ['blank company', { company: '' }, true]].forEach(function (c) {
    eq(elig(c[1]).ok === true, c[2], 'I. fallback eligibility with ' + c[0] + ' -> ' + (c[2] ? 'ELIGIBLE' : 'INELIGIBLE'));
  });
  // the typed rejection counts name the exact cause instead of failing anonymously.
  eq(elig({ is_factory_warehouse: 'FALSE' }).rejection_counts, { NOT_A_FACTORY_WAREHOUSE: 1 }, 'H. a non-factory row is counted as NOT_A_FACTORY_WAREHOUSE');
  eq(elig({ is_active: 'FALSE' }).rejection_counts, { INACTIVE: 1 }, 'H. an inactive factory is counted as INACTIVE');
  eq(elig({ country: 'VN' }).rejection_counts, { COUNTRY_NOT_TEMPLATE_ORIGIN_COUNTRY: 1 }, 'H. a wrong-country factory is counted as COUNTRY_NOT_TEMPLATE_ORIGIN_COUNTRY');
  eq(elig({ company: 'OTHERCO' }).rejection_counts, { COMPANY_MISMATCH: 1 }, 'H. a wrong-company factory is counted as COMPANY_MISMATCH');
  ok(Object.keys(elig({ is_active: 'FALSE' }).rejection_counts).indexOf('SHIPPING_DISABLED') === -1, 'E. no rejection code for a shipping capability exists any more');
  // C - a shipping-disabled factory is now the SELECTED source end to end, not merely "eligible".
  var mShip = mastersB5({ mapWarehouses: function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (DEMO4A_whIsFactory_(c)) c.is_shipping_enabled = 'FALSE'; return c; } });
  var pShip = DEMO4A_buildPlan_(mShip);
  eq([pShip.ok, pShip.per_shipment.every(function (x) { return x.source_warehouse_id === SRC_WH_ID_; })], [true, true], 'I-1/D. end to end: every Demo plan still selects the CN factory when its is_shipping_enabled is FALSE');
  eq(pShip.checksum, B5_.checksum, 'G. and the plan is byte-identical - the flag influences nothing that the checksum binds');
})();

section('V3G5C-C. country / company scope still fails CLOSED - nothing is silently broadened');
(function () {
  // no CN factory at all for the Demo company -> the plan must fail closed with the exact typed reason.
  function scoped(mapFn) { return DEMO4A_buildPlan_(mastersB5({ mapWarehouses: mapFn })); }
  var noFactory = scoped(function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (DEMO4A_whIsFactory_(c)) c.is_active = 'FALSE'; return c; });
  eq(noFactory.ok, false, 'C. no ACTIVE CN factory -> the whole plan fails closed (no warehouse is invented)');
  eq(noFactory.reason, 'DEMO_SOURCE_WAREHOUSE_AUTHORITY_NOT_READY', 'C. with the typed plan-level reason');
  ok(noFactory.source_authority_errors.every(function (e) { return e.reason === 'NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE'; }), 'C. and the exact per-slot reason NO_ELIGIBLE_DEMO_SOURCE_FACTORY_WAREHOUSE');
  eq(noFactory.source_authority_summary.source_factory_rejection_counts, { NOT_A_FACTORY_WAREHOUSE: 3, INACTIVE: 1 }, 'C/H. the read-only summary names the exact cause per typed code (the three FBA destination rows are correctly counted as NOT_A_FACTORY_WAREHOUSE, the CN factory as INACTIVE), never an anonymous failure');
  var otherCo = scoped(function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (DEMO4A_whIsFactory_(c)) c.company = 'OTHERCO'; return c; });
  eq([otherCo.ok, otherCo.source_authority_summary.source_factory_rejection_counts], [false, { NOT_A_FACTORY_WAREHOUSE: 3, COMPANY_MISMATCH: 1 }], 'C. a factory owned by another POPULATED company is never silently borrowed');
  var otherCountry = scoped(function (w) { var c = {}; for (var k in w) c[k] = w[k]; if (DEMO4A_whIsFactory_(c)) c.country = 'VN'; return c; });
  eq([otherCountry.ok, otherCountry.source_authority_summary.source_factory_rejection_counts], [false, { NOT_A_FACTORY_WAREHOUSE: 3, COUNTRY_NOT_TEMPLATE_ORIGIN_COUNTRY: 1 }], 'C. selection is never broadened across countries: the source stays in the template origin country');
  ok(B5_.per_shipment.every(function (x) { return DEMO4A_low_(x.source_warehouse_country) === 'cn' && DEMO4A_low_(x.template_origin_country) === 'cn'; }), 'C. the three selected Demo templates keep a CN source, as expected');
  // the failing authorization envelope must still be tiny AND must carry the corrected source evidence.
  var MP = { present: { shipment_route_templates: true, shipment_route_template_nodes: true, logistics_locations: true, marketplace_skus: true, sku_details: true, warehouses: true } };
  var envF = DEMO4A_authorizationSummary_({ ok: true }, MP, noFactory, noFactory, emptyLive(), { verdict: 'THREE_REGION_COORDINATE_PROPOSAL_READY', proposal_entries: 3 });
  eq([envF.may_run_dry_run, envF.may_arm_commit_checksum, envF.source_shipping_enabled_gate_applied], [false, false, false], 'C/H. the failing envelope blocks both authorizations and still publishes the corrected gate flag');
  eq(envF.source_factory_rejection_counts, { NOT_A_FACTORY_WAREHOUSE: 3, INACTIVE: 1 }, 'C/H. and carries the typed rejection counts on the FAILURE path, where they matter most');
  ok(JSON.stringify(envF).length < 6000, 'H. the failing envelope is ' + JSON.stringify(envF).length + ' bytes (< 6000)');
})();

section('V3G5C-H. the read-only output contract of both compact entrypoints');
(function () {
  var MP = { present: { shipment_route_templates: true, shipment_route_template_nodes: true, logistics_locations: true, marketplace_skus: true, sku_details: true, warehouses: true } };
  var env = DEMO4A_authorizationSummary_({ ok: true }, MP, B5_, B5_, emptyLive(), { verdict: 'THREE_REGION_COORDINATE_PROPOSAL_READY', proposal_entries: 3 });
  var hdrs = {}, ctc = {};
  DEMO4A_WRITE_ORDER_.forEach(function (t2) { var seen = {}; (B5_.tables[t2] || []).forEach(function (r) { Object.keys(r).forEach(function (k) { seen[k] = 1; }); }); hdrs[t2] = Object.keys(seen); ctc[t2] = {}; hdrs[t2].forEach(function (h) { ctc[t2][h] = 'text_cell'; }); });
  ctc.shipping_plans.ship_from = 'numeric_cell'; ctc.shipping_plans.destination = 'numeric_cell';
  var diag = DEMO4A_canonDiagnosticCore_({ ok: true }, mastersB5(), B5_, hdrs, ctc, { ok: true, offset_min: 480, time_zone: 'Asia/Taipei' }, null, 'ABSENT_ALL', DEMO4A_srcDestLineageGate_(B5_, B5_WHS_), true);
  // union coverage across the two entrypoints, as the contract requires.
  ['writer_projection_complete', 'writer_projection_missing_total', 'risk_count', 'source_destination_warehouse_lineage_ready',
   'source_warehouse_ids', 'source_warehouse_codes', 'source_selection_branches', 'destination_warehouse_ids', 'destination_warehouse_codes',
   'source_factory_candidate_count', 'source_factory_rejection_counts', 'source_shipping_enabled_gate_applied',
   'existing_state', 'journal_integrity_valid', 'journal_retry_safe', 'corrected_plan_checksum', 'confirmation_constant_status', 'verdict'].forEach(function (k) {
    ok(diag[k] !== undefined, 'H. the canonicalization diagnostic exposes ' + k);
  });
  ['source_destination_warehouse_lineage', 'source_factory_candidate_count', 'source_factory_rejection_counts', 'source_shipping_enabled_gate_applied',
   'existing_state', 'demo_plan_checksum', 'confirmation_constant_status', 'may_run_dry_run', 'may_arm_commit_checksum', 'preflight_verdict'].forEach(function (k) {
    ok(env[k] !== undefined, 'H. the authorization envelope exposes ' + k);
  });
  eq([diag.source_shipping_enabled_gate_applied, env.source_shipping_enabled_gate_applied], [false, false], 'H. both publish source_shipping_enabled_gate_applied = FALSE');
  eq([diag.source_factory_candidate_count, env.source_factory_candidate_count], [1, 1], 'H. both publish the source factory candidate count');
  eq(diag.verdict, 'READY_FOR_CONTROLLED_RETRY', 'H. the successful diagnostic verdict is READY_FOR_CONTROLLED_RETRY');
  eq([diag.writer_projection_complete, diag.writer_projection_missing_total, diag.risk_count, diag.source_destination_warehouse_lineage_ready], [true, 0, 0, true], 'F/H. projection complete, zero missing, zero risk, lineage ready');
  ok(Object.keys(diag.source_factory_rejection_counts).length <= 5 && Object.keys(env.source_factory_rejection_counts).length <= 5, 'H. the rejection counts are capped at five codes');
  ok(JSON.stringify(diag).length < 6000, 'H. the diagnostic is ' + JSON.stringify(diag).length + ' bytes (< 6000)');
  ok(JSON.stringify(env).length < 6000, 'H. the authorization envelope is ' + JSON.stringify(env).length + ' bytes (< 6000)');
  ok(/DEMO4A_ZERO_WRITE_CONFIRMED/.test(extractFn(G, 'TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION')) && /DEMO4A_ZERO_WRITE_CONFIRMED/.test(extractFn(G, 'TEMP_DEMO4A_SUMMARIZE_READ_ONLY_SEED_AUTHORIZATION')), 'H. both entrypoints stamp DEMO4A_ZERO_WRITE_CONFIRMED');
  // the summariser is ONE shared pure function - never a second approximate evaluator.
  ok((G.match(/DEMO4A_sourceAuthoritySummary_\(/g) || []).length >= 4 && (G.match(/function DEMO4A_sourceAuthoritySummary_/g) || []).length === 1, 'H. one shared pure summariser feeds both entrypoints (no duplicated evaluator)');
})();

section('V3G5C-D/F/G. propagation, projection, checksum and the V3G5B protections all survive the correction');
(function () {
  var whIds = {}; B5_WHS_.forEach(function (w) { whIds[DEMO4A_whId_(w)] = 1; });
  ok(B5_PLANS_.every(function (pl) { return DEMO4A_str_(pl.source_warehouse_id) && DEMO4A_str_(pl.destination_warehouse_id); }), 'D. every plan carries a non-blank source AND destination warehouse');
  ok(B5_SHIPS_.every(function (sh) { var pl = B5_PLANS_.filter(function (x) { return x.shipping_plan_id === sh.shipping_plan_id; })[0];
    return sh.source_warehouse_id === pl.source_warehouse_id && sh.destination_warehouse_id === pl.destination_warehouse_id
      && whIds[sh.source_warehouse_id] && whIds[sh.destination_warehouse_id]
      && DEMO4A_low_(sh.source_warehouse_id) !== DEMO4A_low_(sh.destination_warehouse_id); }), 'D. every shipment inherits both endpoints exactly, both resolve to master rows, and they never collapse to one identity');
  eq(B5_PER_.map(function (x) { return x.region + '=' + x.destination_warehouse_id; }).sort().join(','), 'US_CENTRAL=WH-KM-US-FBA-AUS2,US_EAST=WH-KM-US-FBA-ABE2,US_WEST=WH-KM-US-FBA-BFI4', 'I-12. the destinations remain ABE2 / AUS2 / BFI4');
  ok(B5_SHIPS_.every(function (sh) { var per = B5_PER_.filter(function (x) { return x.shipment_id === sh.shipment_id; })[0];
    return sh.warehouse_code === per.destination_warehouse_code && sh.warehouse_code !== sh.destination_warehouse_id; }), 'I-14. warehouse_code remains the destination display-code snapshot, never an identity');
  ok(B5_SHIPS_.every(function (sh) { return !Object.prototype.hasOwnProperty.call(sh, 'warehouse_id') && !Object.prototype.hasOwnProperty.call(sh, 'updated_by'); }), 'D. shipments.warehouse_id and shipments.updated_by are NOT restored');
  ok(/insertColumn|appendColumn|createSheet|ALTER TABLE/.test(G) === false, 'I-22. no schema / header column is added or migrated');
  // G - the checksum stays deterministic and source-lineage sensitive after the correction, with no value hardcoded.
  eq(DEMO4A_buildPlan_(mastersB5()).checksum, B5_.checksum, 'G/I-17. the corrected semantics reproduce the SAME deterministic checksum');
  ok(DEMO4A_buildPlan_(mastersB5({ extraWarehouses: [b5Fac('WH-KM-CN-FACTORY-0')] })).checksum !== B5_.checksum, 'G/I-17. and a different deterministic source selection still changes it');
  ok(/7e4cf9d9/.test(G) === false && /8b3eabec/.test(G) === false, 'G. both retired checksum values remain unnamed in source; none is hardcoded');
  // F - projection / canonicalization gates still block before the journal and the first write.
  var hdrs = {}; DEMO4A_WRITE_ORDER_.forEach(function (t2) { var seen = {}; (B5_.tables[t2] || []).forEach(function (r) { Object.keys(r).forEach(function (k) { seen[k] = 1; }); }); hdrs[t2] = Object.keys(seen); });
  eq(DEMO4A_writerProjectionGaps_(B5_, hdrs).missing_total, 0, 'F/I-18. writer projection remains complete with zero missing fields');
  var dropped = {}; DEMO4A_WRITE_ORDER_.forEach(function (t2) { dropped[t2] = hdrs[t2].filter(function (c) { return !(t2 === 'shipments' && c === 'source_warehouse_id'); }); });
  ok(DEMO4A_writerProjectionGaps_(B5_, dropped).ok === false, 'F/I-18. and a dropped physical column still blocks');
  var cf = extractFn(G, 'TEMP_DEMO4A_COMMIT_SHIPPING_SHIPMENT_MAP_SEED');
  ok(cf.indexOf('COMMIT_BLOCKED_WRITER_PROJECTION_INCOMPLETE') < cf.indexOf('setProperty') && cf.indexOf('COMMIT_BLOCKED_WRITER_PROJECTION_INCOMPLETE') < cf.indexOf('appendRow'), 'F/I-18. the gate still runs BEFORE the journal write and the first appendRow');
  ok(/rb\.ok \? 'COMMIT_FAILED_POSTCHECK_ROLLED_BACK' : 'COMMIT_FAILED_POSTCHECK_ROLLBACK_UNVERIFIED'/.test(cf) && /COMMITTED_UNVERIFIED/.test(G) === false, 'I-19. inserted-only rollback with mandatory verification is intact and COMMITTED_UNVERIFIED remains impossible');
  ok(/deleteProperty/.test(extractFn(G, 'TEMP_DEMO4A_DIAGNOSE_WRITE_READBACK_CANONICALIZATION')) === false, 'F. the prior journal is still never cleared or mutated by the read-only diagnostic');
  var m46 = mastersB5({ nodeCounts: { US_WEST: 16, US_CENTRAL: 15, US_EAST: 15 } });
  eq(DEMO4A_buildPlan_(m46).counts, { shipping_plans: 3, shipping_plan_lines: 8, shipments: 3, shipment_lines: 8, shipment_routes: 46, shipment_events: 5, total: 73 }, 'I-15/I-16. the six-table counts remain 3 / 8 / 3 / 8 / 46 / 5 = 73');
  eq([DEMO4A_CONFIRMED_SEED_CHECKSUM_, DEMO4A_CONFIRMED_CLEAR_TOKEN_], ['PASTE_DEMO_SEED_CHECKSUM_HERE', 'PASTE_DEMO_CLEAR_TOKEN_HERE'], 'I-21. both confirmation constants remain placeholders');
  ok(new RegExp("getSheetByName\\('warehouses'\\)\\.(appendRow|deleteRow|setValue)").test(G) === false, 'I-22. the warehouses master remains read-only');
})();

done();