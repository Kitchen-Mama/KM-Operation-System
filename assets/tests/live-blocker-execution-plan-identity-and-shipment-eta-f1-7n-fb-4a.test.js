// F1-7N-FB-4A — Execution Plan identity reconciliation + Shipment ETA write/read-back.
//
// Proves the nineteen §J claims by EXECUTING the shipped functions wherever a claim is behavioural — the real
// planning-cycle census, the real K2 reconcile decision, the real identity classifier, the real conflict-field
// differ, the real disposition builder, the real ETA date-only normalizer, the real ETA validator and the real
// route-event idempotency rule. Where a claim is STRUCTURAL (a cell that must never be written, an event that
// must never be appended, a migration that must never happen) the assertion runs against COMMENT- and
// STRING-stripped source, so it cannot be satisfied by prose describing the guarantee.
//
// Known regression baseline at the time of writing (claim 19): gap-job-done-notice-f1-small-r1,
// order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle, supply-planning-route-inventory.
//
// Run: node assets/tests/live-blocker-execution-plan-identity-and-shipment-eta-f1-7n-fb-4a.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }

function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var G16 = read('specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G31 = read('specs/active/apps-script/31_shipment_receipt_route_handlers.gs');
var G57 = read('specs/active/apps-script/57_api_v1_shipment_workspace.gs');
var G63 = read('specs/active/apps-script/63_api_v1_system_health.gs');
var G66 = read('specs/active/apps-script/66_api_v1_request_order_send.gs');
var G68 = read('specs/active/apps-script/68_api_v1_execution_plan_conflict_diagnostic.gs');
var GTD = read('specs/active/apps-script/TEMP_request_order_send_diagnostics.gs');
var GDEMOSEED = read('specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs');
var GDOCDIAG = read('specs/active/apps-script/TEMP_document_diagnostics.gs');
var G67 = read('specs/active/apps-script/67_api_v1_allocation_draft_identity.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var MAP = read('js/pages/global-logistics-map.js');
var IR = read('js/pages/inventory-replenishment.js');
var DEMO = read('specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs');
var DOC = read('../docs/planning/LIVE_BLOCKER_CLOSURE_F1-7N-FB-4A.md');
var MAPSPEC = read('../docs/planning/GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md');

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src); if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('=', m.index) + 1;
  while (' \t\r\n'.indexOf(src[i]) >= 0) i++;
  if (src[i] === '{' || src[i] === '[') {
    var open = src[i], close = open === '{' ? '}' : ']', d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close) { d--; if (d === 0) break; } }
    return src.slice(m.index, j + 1) + ';';
  }
  return src.slice(m.index, src.indexOf(';', i) + 1);
}
// Absence claims must be about CODE, never about the comments or strings that document the guarantee.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function noStrings(src) { return code(src).replace(/'(\\.|[^'\\])*'/g, "''").replace(/"(\\.|[^"\\])*"/g, '""'); }

// ---- deterministic Apps Script stubs, so a Date branch is testable offline without a host timezone -------
var Utilities = {
  formatDate: function (d, tz, fmt) {
    // Only the two forms the production code asks for; the timezone is applied as a fixed offset so the test is
    // deterministic on any machine. tz 'Asia/Taipei' = UTC+8 — the same wall clock the live script timezone uses.
    var offsetMin = tz === 'Asia/Taipei' ? 480 : (tz === 'UTC' ? 0 : 480);
    var t = new Date(d.getTime() + offsetMin * 60000);
    function z(n) { return (n < 10 ? '0' : '') + n; }
    if (fmt === 'yyyy-MM-dd') return t.getUTCFullYear() + '-' + z(t.getUTCMonth() + 1) + '-' + z(t.getUTCDate());
    return String(d);
  }
};
var Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
global.Utilities = Utilities; global.Session = Session;

// ---- real functions under test ---------------------------------------------------------------------------
eval(extractVar(G66, 'ROS_DRAFTS_TABLE_'));
eval(extractVar(G66, 'ROS_ACTIVE_STATUSES_'));
eval(extractVar(G66, 'ROS_TERMINAL_STATUSES_'));
eval(extractVar(G66, 'ROS_CYCLE_SOURCE_OVERRIDE_'));
eval(extractVar(G66, 'ROS_CYCLE_SOURCE_PERSISTED_'));
eval(extractVar(G66, 'ROS_CYCLE_SOURCE_NONE_'));
eval(extractFn(G66, 'rosStr_'));
eval(extractFn(G66, 'rosLc_'));
eval(extractFn(G66, 'rosDraftStatus_'));
eval(extractFn(G66, 'rosDraftIsActive_'));
eval(extractFn(G66, 'rosDraftIsTerminal_'));
eval(extractFn(G66, 'rosPlanningCycleCensus_'));
eval(extractFn(G66, 'rosResolveCurrentPlanningCycle_'));

eval(extractVar(G16, 'SAD_K2_GROUP_DIMENSIONS_'));
eval(extractVar(G16, 'SAD_K2_BASIS_ID_MATCHES_'));
eval(extractVar(G16, 'SAD_K2_BASIS_STALE_ACCEPTED_'));
eval(extractVar(G16, 'SAD_K2_BASIS_DIFFERENT_GROUP_'));
eval(extractVar(G16, 'SAD_K2_BASIS_NO_REQUEST_GROUP_'));
eval(extractVar(G16, 'SAD_K2_BASIS_CONTESTED_'));
eval(extractFn(G16, 'sadFnv1a_'));
eval(extractFn(G16, 'sadK2GroupKey_'));
eval(extractFn(G16, 'sadK2DeterministicHeaderId_'));
eval(extractFn(G16, 'sadHeaderRouteIsComplete_'));
eval(extractFn(G16, 'sadK2ReconcileDecision_'));
eval(extractFn(G16, 'sadReconcileMessage_'));

eval(extractVar(G68, 'EPC_K3_SCOPE_DIMS_'));
eval(extractFn(G68, 'epcStr_'));
eval(extractFn(G68, 'epcLc_'));
eval(extractFn(G68, 'epcUc_'));
eval(extractFn(G68, 'epcNum_'));
eval(extractFn(G68, 'epcFnv1a_'));
eval(extractFn(G68, 'epcMaskId_'));
eval(extractFn(G68, 'epcIdRef_'));
eval(extractFn(G68, 'epcIdentityFamily_'));
eval(extractFn(G68, 'epcConflictFields_'));
eval(extractFn(G68, 'epcParsePlanTag_'));
eval(extractFn(G68, 'epcDispositions_'));
eval(extractFn(G68, 'epcResolveWarehouse_'));

eval(extractFn(G31, 'shipEtaValidate_'));
eval(extractFn(G31, 'shipEtaDateOnly_'));
eval(extractFn(G31, 'shipRouteEventSourceId_'));
eval(extractFn(G31, 'shipEventShouldAppend_'));
eval(extractVar(G31, 'SHIP_PROMOTE_TERMINAL_'));
eval(extractVar(G31, 'SHIP_PROMOTE_FROM_'));
eval(extractVar(G31, 'SHIP_PROMOTE_TO_'));
eval(extractFn(G31, 'shipPromoteOnProgress_'));

// ==========================================================================================================
section('1. a placeholder TEMP planning cycle writes nothing and ANSWERS the question');
// ==========================================================================================================
var censusRows = [
  { planning_cycle: '2026-08', status: 'draft', calculated_at: '2026-08-20 10:00:00', source_data_as_of: '2026-08-19' },
  { planning_cycle: '2026-08', status: 'site_confirmed', calculated_at: '2026-08-24 09:00:00', source_data_as_of: '2026-08-23' },
  { planning_cycle: '2026-08', status: 'submitted', calculated_at: '2026-08-01 09:00:00', source_data_as_of: '2026-07-31' },
  { planning_cycle: '2026-07', status: 'draft', calculated_at: '2026-07-15 09:00:00', source_data_as_of: '2026-07-14' },
  { planning_cycle: '2026-07', status: 'cancelled', calculated_at: '2026-07-02 09:00:00', source_data_as_of: '2026-07-01' },
  { planning_cycle: '', status: 'draft', calculated_at: '', source_data_as_of: '' }
];
var census = rosPlanningCycleCensus_(censusRows);
eq(census.recommended, '2026-08', '1. the recommendation is the cycle with the most ACTIVE persisted drafts');
eq(census.active_cycles, ['2026-08', '2026-07'], '1. active cycles are reported, most-active first');
var c08 = census.cycles.filter(function (c) { return c.planning_cycle === '2026-08'; })[0];
eq([c08.persisted_drafts, c08.active_drafts, c08.terminal_drafts], [3, 2, 1], '1. per-cycle persisted / active / terminal counts are exact');
eq(c08.latest_calculated_at, '2026-08-24 09:00:00', '1. the LATEST calculated_at is reported as the calculation evidence');
eq(c08.latest_source_data_as_of, '2026-08-23', '1. and the latest source_data_as_of alongside it');
ok(census.cycles.some(function (c) { return c.planning_cycle === '(blank)'; }), '1. a blank-cycle row is reported rather than silently dropped');
ok(census.active_cycles.indexOf('(blank)') === -1, '1. but a blank cycle is NEVER recommended — it is not a valid YYYY-MM');
eq(rosPlanningCycleCensus_([]).recommended, '', '1. an empty table recommends NOTHING rather than inventing a cycle');
ok(/no planning cycle currently has an active/.test(rosPlanningCycleCensus_([]).recommendation_basis), '1. and says why');

// ---- ADDENDUM §F — the manual source-edit trap is GONE: the cycle resolves automatically ------------------
// Exactly one cycle carries ACTIVE drafts -> RESOLVED from the same persisted authority the website uses.
var solo = rosResolveCurrentPlanningCycle_([
  { planning_cycle: '2026-08', status: 'draft' },
  { planning_cycle: '2026-08', status: 'site_confirmed' },
  { planning_cycle: '2026-07', status: 'submitted' },      // terminal -> not a candidate
  { planning_cycle: '2026-06', status: 'cancelled' }       // terminal -> not a candidate
], '');
eq([solo.status, solo.blocked, solo.resolved_planning_cycle], ['RESOLVED', false, '2026-08'], '1. one active cycle resolves automatically — NO source edit required');
eq(solo.resolution_source, ROS_CYCLE_SOURCE_PERSISTED_, '1. and the source is the PERSISTED active allocation drafts');
ok(/the same persisted authority the website resolves from/.test(solo.reason), '1. naming the website authority it mirrors');
eq(solo.override.supplied, false, '1. with no override in play');

// AMBIGUITY BLOCKS AND REPORTS EVERY CANDIDATE — it never picks one.
var amb = rosResolveCurrentPlanningCycle_([
  { planning_cycle: '2026-08', status: 'draft' },
  { planning_cycle: '2026-08', status: 'draft' },
  { planning_cycle: '2026-07', status: 'draft' }
], '');
eq([amb.status, amb.blocked, amb.resolved_planning_cycle], ['AMBIGUOUS', true, ''], '1. two active cycles BLOCK rather than choosing');
eq(amb.candidate_count, 2, '1. and every candidate is reported');
eq(amb.candidates.map(function (c) { return c.planning_cycle; }).sort(), ['2026-07', '2026-08'], '1. by name');
ok(/nothing was written/i.test(amb.reason), '1. stating that nothing was written');
ok(!/most active|newest|busiest/i.test(amb.reason), '1. and it does not offer to pick the busiest — that would target a run nobody meant');

// No active drafts -> BLOCK. The page's CALENDAR fallback is deliberately not mirrored server-side.
var none = rosResolveCurrentPlanningCycle_([{ planning_cycle: '2026-08', status: 'submitted' }], '');
eq([none.status, none.blocked], ['NO_ACTIVE_DRAFTS', true], '1. no active draft BLOCKS rather than inventing a cycle');
eq(none.resolution_source, ROS_CYCLE_SOURCE_NONE_, '1. with no resolution source claimed');
eq(rosResolveCurrentPlanningCycle_([], '').resolved_planning_cycle, '', '1. an empty table resolves to nothing');
var resolverCode = noStrings(extractFn(G66, 'rosResolveCurrentPlanningCycle_'));
ok(resolverCode.indexOf('Date') === -1 && resolverCode.indexOf('getFullYear') === -1,
  '1. the resolver consults NO clock — a calendar cycle is not a persisted authority');

// The OPTIONAL override exists for controlled testing, is honoured, and is loud when it points at nothing.
var ov = rosResolveCurrentPlanningCycle_([{ planning_cycle: '2026-08', status: 'draft' }, { planning_cycle: '2026-07', status: 'draft' }], '2026-07');
eq([ov.status, ov.blocked, ov.resolved_planning_cycle], ['RESOLVED', false, '2026-07'], '1. an explicit override breaks a would-be ambiguity');
eq(ov.resolution_source, ROS_CYCLE_SOURCE_OVERRIDE_, '1. and reports the override as the source');
eq(ov.override.has_persisted_rows, true, '1. reporting that the override cycle does carry rows');
var ovDead = rosResolveCurrentPlanningCycle_([{ planning_cycle: '2026-08', status: 'draft' }], '2019-01');
eq(ovDead.override.has_persisted_rows, false, '1. an override to a cycle with NO rows is flagged');
ok(/WARNING/.test(ovDead.reason), '1. loudly, so an empty workset is not mistaken for a broken probe');
eq(rosResolveCurrentPlanningCycle_([{ planning_cycle: '2026-08', status: 'draft' }], 'August').status, 'OVERRIDE_INVALID', '1. a malformed override is refused, not parsed');
eq(rosResolveCurrentPlanningCycle_([{ planning_cycle: '2026-08', status: 'draft' }], 'PASTE_YYYY-MM_HERE').status, 'RESOLVED', '1. a leftover placeholder is treated as "no override", not as a value');

// zero write, structurally: resolution and the TEMP wrappers touch no writer, no property, no lock
[extractFn(G66, 'rosPlanningCycleCensus_'), extractFn(G66, 'rosResolveCurrentPlanningCycle_'),
  extractFn(G66, 'rosReadPlanningCycleCensus_'), extractFn(G66, 'rosReadResolvedPlanningCycle_')].forEach(function (fn, i) {
  var c = noStrings(fn);
  ['propSet', 'propDelete', 'withCasLock', 'LockService', 'appendRow', 'setValue', 'createRequestOrderDraft',
    'submitAllocationDrafts', 'handleRequestOrderSendOrchestrate_'].forEach(function (k) {
    ok(c.indexOf(k) === -1, '1. the resolution path performs no ' + k + ' (fn ' + i + ')');
  });
});

// ==========================================================================================================
section('2. production Send still requires an explicit exact cycle');
// ==========================================================================================================
var wsGet = extractFn(G66, 'handleRequestOrderSendWorksetGet_');
var orch = extractFn(G66, 'handleRequestOrderSendOrchestrate_');
ok(/PLANNING_CYCLE_REQUIRED/.test(wsGet), '2. the workset read fails closed without a cycle');
ok(/PLANNING_CYCLE_REQUIRED/.test(orch), '2. the orchestration fails closed without a cycle');
[wsGet, orch].forEach(function (fn, i) {
  var c = noStrings(fn);
  ok(c.indexOf('rosPlanningCycleCensus_') === -1 && c.indexOf('rosReadPlanningCycleCensus_') === -1,
    '2. the production path never consults the census to supply a cycle (fn ' + i + ')');
  ok(c.indexOf('rosReadResolvedPlanningCycle_') === -1, '2. nor the resolver reader (fn ' + i + ')');
  ok(c.indexOf('recommended') === -1, '2. and never reads a recommendation (fn ' + i + ')');
});
var builder = extractFn(G66, 'rosBuildWorkset_');
ok(/if \(!cycle\) \{ out\.error = 'PLANNING_CYCLE_REQUIRED'/.test(builder), '2. the builder itself refuses a blank cycle');
ok(noStrings(builder).indexOf('TEMP_ROSEND') === -1, '2. and the builder never reads a TEMP diagnostic constant');
[wsGet, orch, builder].forEach(function (fn, i) {
  ok(noStrings(fn).indexOf('rosResolveCurrentPlanningCycle_') === -1,
    '2. production never calls the automatic resolver — a diagnostic convenience is not a production default (fn ' + i + ')');
});

// ==========================================================================================================
section('3. the exact Execution Plan conflict is CLASSIFIED, not generic');
// ==========================================================================================================
// the live-shaped route: US / Amazon / marketplace-logical destination / CN source
var dimsA = { planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment',
  recommended_source_warehouse_id: 'WH-CN-YOUXIN', recommended_destination_warehouse_id: '', recommended_shipping_method: 'SEA',
  recommended_last_mile_delivery: '', recommendation_group_no: '' };
function withDims(d, over) { var o = {}; Object.keys(d).forEach(function (k) { o[k] = d[k]; }); Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; }); return o; }
var idA = sadK2DeterministicHeaderId_(dimsA);
var dimsB = withDims(dimsA, { recommended_shipping_method: 'AIR' });   // the operator edits the route
var idB = sadK2DeterministicHeaderId_(dimsB);
ok(idA !== idB, '3. changing a K2 grouping dimension changes the deterministic id — that is the drift mechanism');

// identity families, from the REAL classifier
var canonicalRow = withDims(dimsA, { allocation_draft_id: idA, status: 'draft' });
var driftedRow = withDims(dimsB, { allocation_draft_id: idA, status: 'draft' });   // dims edited to B, id still H(A)
var legacyLogicalRow = withDims(dimsA, { allocation_draft_id: 'SAD-ABC1234567', status: 'draft' });
var legacyCompleteRow = withDims(dimsA, { allocation_draft_id: 'SAD-XYZ9876543', status: 'draft', recommended_destination_warehouse_id: 'WH-US-1' });
eq(epcIdentityFamily_(canonicalRow, sadK2DeterministicHeaderId_, sadHeaderRouteIsComplete_).family, 'CANONICAL', '3. a K2 row that regenerates its own id is CANONICAL');
eq(epcIdentityFamily_(driftedRow, sadK2DeterministicHeaderId_, sadHeaderRouteIsComplete_).family, 'K2', '3. a K2 row that no longer regenerates its own id is K2 (drifted)');
eq(epcIdentityFamily_(legacyCompleteRow, sadK2DeterministicHeaderId_, sadHeaderRouteIsComplete_).family, 'K3', '3. a generic id with a COMPLETE persisted route is K3');
eq(epcIdentityFamily_(legacyLogicalRow, sadK2DeterministicHeaderId_, sadHeaderRouteIsComplete_).family, 'LEGACY', '3. a generic id with an INCOMPLETE persisted route is LEGACY');
eq(epcIdentityFamily_({ allocation_draft_id: '' }, sadK2DeterministicHeaderId_, sadHeaderRouteIsComplete_).family, 'UNEXPECTED', '3. a row with no id is UNEXPECTED');
ok(/destination_marketplace is an accepted payload field but is NOT a stored column/.test(
  epcIdentityFamily_(legacyLogicalRow, sadK2DeterministicHeaderId_, sadHeaderRouteIsComplete_).detail),
  '3. and the LEGACY detail NAMES the marketplace-logical cause instead of saying "incomplete route"');

// the conflicting business identity FIELDS are named, not two opaque hashes
var conf = epcConflictFields_(driftedRow, dimsA, SAD_K2_GROUP_DIMENSIONS_);
eq(conf.length, 1, '3. exactly one business dimension conflicts');
eq(conf[0].field, 'recommended_shipping_method', '3. and it is NAMED (not "the hashes differ")');
eq([conf[0].persisted, conf[0].requested], ['AIR', 'SEA'], '3. with both values reported');
eq(epcConflictFields_(canonicalRow, dimsA, SAD_K2_GROUP_DIMENSIONS_), [], '3. an agreeing row reports no conflicting field');
var cycleConf = epcConflictFields_(withDims(canonicalRow, { planning_cycle: '2026-07' }), dimsA, SAD_K2_GROUP_DIMENSIONS_);
ok(cycleConf.some(function (c) { return c.field === 'planning_cycle'; }), '3. a stale hydrated id from ANOTHER cycle is named by its cycle field');

// ids are masked, and correlatable by a stable hash
var ref = epcIdRef_(idA);
ok(ref.masked.indexOf('SADH-K2-') === 0 && ref.masked.indexOf('…') !== -1, '3. a K2 id is masked to its class prefix + tail');
ok(ref.masked.length < idA.length, '3. the mask is shorter than the id it stands for');
eq(epcIdRef_(idA).hash, epcIdRef_(idA).hash, '3. the hash is stable across calls');
ok(epcIdRef_(idA).hash !== epcIdRef_(idB).hash, '3. and distinguishes two different ids');
eq(epcIdRef_('').present, false, '3. an absent id is reported as absent, never as a fake mask');
eq(epcMaskId_('SAD-SECRETCOMPANY-US-AMAZON-CO1100R').indexOf('SECRETCOMPANY'), -1, '3. a legacy id embedding business text is NOT echoed');
eq(epcFnv1a_('x'), sadFnv1a_('x'), '3. the diagnostic hash is the SAME arithmetic the K2 id uses, so a suffix can be eyeballed');

// shipping-plan evidence comes from the persisted submit stamp, never from a guess
var tag = epcParsePlanTag_('[SUBMITTED @2026-08-20 10:00:00 → shipping_plan SP-1,SP-2 · exec EK-9]');
eq([tag.submitted_marker_present, tag.shipping_plan_ids, tag.execution_keys], [true, ['SP-1', 'SP-2'], ['EK-9']], '3. the submit stamp is parsed into plan ids + execution key');
eq(epcParsePlanTag_('just a note').submitted_marker_present, false, '3. an unrelated note yields NO plan evidence');
eq(epcParsePlanTag_('[SUBMITTED @t → shipping_plan (reused) · exec E]').shipping_plan_ids, [], '3. a "(reused)" stamp claims no plan id');

// the operator may name a warehouse the way the page shows it — and ambiguity is REPORTED, never guessed
var WH = [
  { warehouse_id: 'WH-CN-YOUXIN', warehouse_code: 'CN01', warehouse_name: 'CN\u4f91\u946b' },
  { warehouse_id: 'WH-CN-OTHER', warehouse_code: 'CN02', warehouse_name: 'CN\u4f91\u946b' },
  { warehouse_id: 'WH-US-1', warehouse_code: 'US01', warehouse_name: 'US Main' }
];
eq(epcResolveWarehouse_(WH, 'US01').warehouse_id, 'WH-US-1', '3. a warehouse resolves by CODE');
eq(epcResolveWarehouse_(WH, 'US Main').warehouse_id, 'WH-US-1', '3. and by NAME');
eq(epcResolveWarehouse_(WH, 'WH-US-1').warehouse_id, 'WH-US-1', '3. and by ID');
eq(epcResolveWarehouse_(WH, 'us main').resolved, true, '3. name matching is case-insensitive');
var amb = epcResolveWarehouse_(WH, 'CN\u4f91\u946b');
eq([amb.resolved, amb.ambiguous], [false, true], '3. a name shared by two warehouses is AMBIGUOUS, never resolved to the first match');
eq(amb.warehouse_id, '', '3. and yields no id at all');
ok(/AMBIGUOUS/.test(amb.note) && /exact warehouse_id/.test(amb.note), '3. with a note telling the operator what to supply');
eq(epcResolveWarehouse_(WH, 'nothing-like-this').matches, [], '3. an unmatched token matches nothing');
eq(epcResolveWarehouse_(WH, '').supplied, false, '3. and a blank token is reported as not supplied');

// the classification reaches the operator: the router action exists and the UI shows the typed code
ok(/action === 'system\.executionPlanConflictDiagnostic'[\s\S]{0,120}handleExecutionPlanConflictDiagnostic_/.test(ROUTER),
  '3. the diagnostic is routed on POST');
ok(/getExecutionPlanConflictDiagnostic/.test(DBAPI), '3. and reachable from the API client');
var irErr = extractFn(IR, '_irShowDraftSaveError');
ok(/ir-save-error-reason/.test(irErr) && /_reasonCode/.test(irErr), '3. the UI renders the typed reason code on the FACE of the error');
ok(irErr.indexOf('ir-save-error-reason') < irErr.indexOf('<details'), '3. and above the collapsed technical disclosure, not inside it');
ok(/Blocking record/.test(irErr), '3. and names the blocking record when the server supplies one');

// ==========================================================================================================
section('4. no migration or overwrite happens automatically');
// ==========================================================================================================
var G68code = noStrings(G68);
['appendRow', 'setValue', 'setValues', 'insertSheet', 'deleteRow', 'deleteSheet', 'procurementEnsureSheet_',
  'LockService', 'DriveApp', 'MailApp', 'GmailApp', 'sendEmail', 'handleUpsertShippingAllocationDraft_',
  'sadUpsertDraftHeaderCore_', 'handleCancelShippingAllocationDraft_', 'setProperty'].forEach(function (k) {
  ok(G68code.indexOf(k) === -1, '4. the diagnostic contains no ' + k);
});
ok(/rows_migrated: 0/.test(G68) && /rows_deleted: 0/.test(G68), '4. and declares rows_migrated / rows_deleted = 0');
ok(/PERFORMED NO WRITE, NO MIGRATION AND NO OVERWRITE/.test(G68), '4. and says so in its own zero-write statement');
epcDispositions_({ existing_present: true, guard_reason: 'LEGACY_ROUTE_RECONCILIATION_REQUIRED' }).forEach(function (d) {
  ok(d.requires_user_authorization === true, '4. every disposition requires user authorization (' + d.action + ')');
  ok(d.performed_by_this_diagnostic === false, '4. and is not performed here (' + d.action + ')');
  ok(d.idempotent === true, '4. and is idempotent (' + d.action + ')');
});
// the WRITER never auto-heals either: no re-key, no overwrite of a stored id
var reconcileFn = extractFn(G16, 'sadLegacyReconcileReason_');
var decisionFn = extractFn(G16, 'sadK2ReconcileDecision_');
[reconcileFn, decisionFn].forEach(function (fn, i) {
  var c = noStrings(fn);
  ok(c.indexOf('setValue') === -1 && c.indexOf('appendRow') === -1, '4. the reconcile guard writes nothing (fn ' + i + ')');
});
var upsert = extractFn(G16, 'sadUpsertDraftHeaderCore_');
ok(!/setCol\('allocation_draft_id'/.test(upsert), '4. the writer NEVER rewrites a stored allocation_draft_id — the stale id is kept, not re-keyed');
// the migration plan exists as a PROPOSAL in the owning document
ok(/Proposed idempotent migration plan \(NOT EXECUTED/.test(DOC), '4. the migration plan is recorded as NOT EXECUTED');
ok(/no row is deleted/.test(DOC) && /no quantity is manufactured/.test(DOC), '4. and states the FK and quantity effects it refuses to have');
ok(/soft-cancelled/.test(DOC) && /PRESERVED/.test(DOC), '4. the legacy header is soft-cancelled and preserved, never deleted');

// ==========================================================================================================
section('5. a canonical, semantically identical draft UPDATES IN PLACE');
// ==========================================================================================================
// (a) the row that still regenerates its own id passes exactly as before
eq(sadK2ReconcileDecision_(canonicalRow, dimsA, [canonicalRow]).reason, '', '5. a row whose id matches its own group passes');
eq(sadK2ReconcileDecision_(canonicalRow, dimsA, [canonicalRow]).basis, SAD_K2_BASIS_ID_MATCHES_, '5. with the self-hash basis');
// (b) THE DEFECT: the row the writer itself drifted is the caller's own row, and is now accepted in place
var driftDec = sadK2ReconcileDecision_(driftedRow, dimsB, [driftedRow]);
eq(driftDec.reason, '', '5. a row drifted by the writer\u2019s OWN permitted route edit is accepted');
eq(driftDec.basis, SAD_K2_BASIS_STALE_ACCEPTED_, '5. and named a stale CREATE-time id, not an impostor');
ok(sadK2DeterministicHeaderId_(driftedRow) !== driftedRow.allocation_draft_id, '5. even though the stored id no longer hashes to itself');
// (c) an actual impostor for a DIFFERENT group is still refused — strictly stronger than the old rule
var impostor = withDims(dimsA, { allocation_draft_id: idA, status: 'draft', country: 'CA' });
eq(sadK2ReconcileDecision_(impostor, dimsA, [impostor]).reason, 'K2_ROUTE_RECONCILIATION_REQUIRED', '5. a row for a DIFFERENT group is still refused');
eq(sadK2ReconcileDecision_(impostor, dimsA, [impostor]).basis, SAD_K2_BASIS_DIFFERENT_GROUP_, '5. on the GROUP KEY, not on a hash coincidence');
// (d) with no request header the pre-FB-4A rule is preserved exactly
eq(sadK2ReconcileDecision_(driftedRow, null, []).reason, 'K2_ROUTE_RECONCILIATION_REQUIRED', '5. with no request group to compare, the old conservative answer stands');
eq(sadK2ReconcileDecision_(driftedRow, null, []).basis, SAD_K2_BASIS_NO_REQUEST_GROUP_, '5. and says why');
// (e) accepting a stale id may NEVER create a second header for one group
var rival = withDims(dimsB, { allocation_draft_id: idB, status: 'draft' });
var contested = sadK2ReconcileDecision_(driftedRow, dimsB, [driftedRow, rival]);
eq(contested.reason, 'BLOCKED_CONFLICT', '5. a contested group is a BLOCKED_CONFLICT, never a silent second header');
eq(contested.conflictIds, [idB], '5. and the rival header is named');
ok(/already owned by a DIFFERENT active Draft header/.test(sadReconcileMessage_('BLOCKED_CONFLICT')), '5. with an operator message that says so');
// (f) a cancelled rival does not contest (only ACTIVE rows are handed in) — the caller filters, and the
//     decision honours whatever ACTIVE set it is given
eq(sadK2ReconcileDecision_(driftedRow, dimsB, [driftedRow]).reason, '', '5. an uncontested group updates in place');
// (g) both production cores hand the guard the request header
ok(/sadLegacyReconcileReason_\(sh, found, allowReconcile, body \|\| null\)/.test(upsert), '5. the manual save core passes the request header');
ok(/sadLegacyReconcileReason_\(hSh, found, allowReconcile, header \|\| null\)/.test(extractFn(G16, 'sadAtomicUpsertCore_')), '5. and so does the atomic core (the AI-Plan path)');

// ==========================================================================================================
section('6. a migration-required conflict stays UNSAVED');
// ==========================================================================================================
ok(/if \(storedId\.indexOf\('SADH-K2-'\) === 0\)/.test(reconcileFn), '6. the K2 branch is entered only for a K2-shaped id');
ok(/return sadHeaderRouteIsComplete_\(o\) \? '' : 'LEGACY_ROUTE_RECONCILIATION_REQUIRED';/.test(reconcileFn),
  '6. the generic / legacy rule is UNCHANGED — a legacy row is never adopted by the runtime');
eq(epcDispositions_({ existing_present: true, guard_reason: 'LEGACY_ROUTE_RECONCILIATION_REQUIRED' })[0].action, 'USER_MIGRATION_REQUIRED', '6. and the diagnostic answers USER_MIGRATION_REQUIRED');
ok(/nothing is written/.test(epcDispositions_({ existing_present: true, guard_reason: 'LEGACY_ROUTE_RECONCILIATION_REQUIRED' })[0].effect), '6. stating that nothing is written');
// the writer's refusal declares zero rows written and is surfaced with its typed code
ok(/legR \+ ' \u2014 ' \+ sadReconcileMessage_\(legR\) \+ ' \(zero rows written\)'/.test(upsert), '6. the refusal states zero rows written');
ok(/status: legR, existing_id: id/.test(upsert), '6. and returns the typed status plus the blocking row id');
// a terminal row is never edited
eq(epcDispositions_({ terminal_status: 'submitted', existing_present: true })[0].action, 'NO_ACTION_TERMINAL', '6. a submitted draft offers no edit disposition');
ok(/IMMUTABLE_TERMINAL_STATUS/.test(extractFn(G16, 'handleUpsertShippingAllocationDraft_')), '6. and the writer refuses a terminal row up front');

// ==========================================================================================================
section('7. Submit stays blocked while any route is unsaved');
// ==========================================================================================================
ok(/Submit Plan is blocked until every route is saved/.test(irErr), '7. the save error states that Submit is blocked');
ok(/_irClearRouteUnsaved_/.test(IR) && /_irMarkRouteUnsaved_|_irRouteUnsaved/.test(IR), '7. an unsaved route is tracked, and cleared only on a proven save');
// comment-stripped only: this claim is about WHERE the call sits, and noStrings() cannot be applied to a whole
// page file (its regex literals contain quote characters, which desynchronizes a naive string-stripper).
var irCode = code(IR);
ok(irCode.indexOf('_irClearRouteUnsaved_(sku)') !== -1, '7. the unsaved mark is cleared only after BOTH writes acknowledge');
var clearIdx = IR.indexOf('_irClearRouteUnsaved_(sku);');
var ackIdx = IR.indexOf('_irSaveAcknowledged_(hres)');
ok(ackIdx > -1 && clearIdx > ackIdx, '7. and never before the persistence acknowledgement');

// ==========================================================================================================
section('8. the ETA page uses the correct shipment identity');
// ==========================================================================================================
var etaClick = MAP.slice(MAP.indexOf("data-act=\"eta-update\"]');"), MAP.indexOf("data-act=\"route-advance\"]');"));
ok(/shipment_id: vm\.shipmentId/.test(etaClick), '8. the page sends vm.shipmentId');
ok(!/external_shipment_id/.test(etaClick) && !/shipmentNo/.test(etaClick), '8. and never external_shipment_id or shipment_no');
ok(/shipmentId: String\(r\.shipment_id \|\| ''\)\.trim\(\)/.test(DBAPI), '8. vm.shipmentId is normalized from the INTERNAL shipments.shipment_id');
var etaHandler = extractFn(G31, 'handleUpdateShipmentEta_');
ok(/sh\.col\('shipment_id'\)/.test(etaHandler), '8. the handler matches on the shipment_id column');
// The words appear in the NOT_FOUND message on purpose — it tells the operator which identity to send. What must
// never happen is reading a column or payload field of that name.
ok(!/col\('external_shipment_id'\)/.test(etaHandler) && !/b0\.external_shipment_id/.test(etaHandler)
  && !/col\('shipment_no'\)/.test(etaHandler), '8. and never READS an external_shipment_id / shipment_no column or field');
ok(/INTERNAL shipment_id, not external_shipment_id or shipment_no/.test(etaHandler), '8. a not-found answer TELLS the caller which identity it expects');
// the same identity the WORKING position path uses
var advClick = MAP.slice(MAP.indexOf("data-act=\"route-advance\"]');"), MAP.indexOf("data-act=\"route-advance\"]');") + 900);
ok(/shipment_id: vm\.shipmentId/.test(advClick), '8. Update Position sends the SAME identity — the identity was never the ETA defect');

// ==========================================================================================================
section('9. date-only parsing is timezone deterministic');
// ==========================================================================================================
eq(shipEtaDateOnly_('2026-10-15'), '2026-10-15', '9. a date-only string round-trips unchanged');
eq(shipEtaDateOnly_('2026-10-15 08:30:00'), '2026-10-15', '9. a datetime string yields its calendar date');
eq(shipEtaDateOnly_(''), '', '9. blank stays blank');
eq(shipEtaDateOnly_(null), '', '9. null stays blank');
eq(shipEtaDateOnly_('not a date'), '', '9. an unparseable string yields BLANK, never a guessed date');
eq(shipEtaDateOnly_('12/01/2026'), '', '9. a locale-formatted string is NOT parsed (no browser-locale guessing)');
// THE DEFECT: a Sheets date cell comes back as a Date object
var cell = new Date(Date.UTC(2026, 9, 14, 16, 0, 0));   // 2026-10-15 00:00 in Asia/Taipei
eq(shipEtaDateOnly_(cell), '2026-10-15', '9. a Sheets Date CELL normalizes to the intended calendar date');
eq(String(cell).slice(0, 10) === '2026-10-15', false, '9. (and String(Date) would NOT have — that is the bug)');
// the day does not shift at either edge of the day
eq(shipEtaDateOnly_(new Date(Date.UTC(2026, 9, 14, 16, 0, 0))), '2026-10-15', '9. midnight local does not shift back a day');
eq(shipEtaDateOnly_(new Date(Date.UTC(2026, 9, 15, 15, 59, 0))), '2026-10-15', '9. and 23:59 local does not shift forward a day');
eq(shipEtaDateOnly_(new Date('nope')), '', '9. an invalid Date yields blank');
var dOnlyCode = noStrings(extractFn(G31, 'shipEtaDateOnly_'));
ok(dOnlyCode.indexOf('UTC') === -1, '9. the normalizer never formats in UTC');
ok(dOnlyCode.indexOf('Session.getScriptTimeZone()') !== -1, '9. it uses the single named script-timezone authority');
ok(dOnlyCode.indexOf('toISOString') === -1 && dOnlyCode.indexOf('toLocale') === -1, '9. and never toISOString / toLocale');
// the same normalizer is what the READ path now uses
ok(/shipEtaDateOnly_\(v\)/.test(extractFn(G57, 'shipWsDateOnly_')), '9. the shipment workspace delegates to the SAME normalizer');
ok(/etd: shipWsDateOnly_\(r\.etd\), eta: shipWsDateOnly_\(r\.eta\)/.test(G57), '9. and eta/etd are projected through it');
// the page sends the raw date-input value verbatim
ok(/String\(inp\.value \|\| ''\)\.trim\(\)/.test(etaClick), '9. the page sends the RAW date-input value');
ok(!/new Date\(/.test(etaClick) && !/toISOString/.test(etaClick), '9. and never constructs a Date or an ISO string that could shift the day');

// ==========================================================================================================
section('10. the ETA write touches exactly one shipments row');
// ==========================================================================================================
ok(/matches\.length === 0/.test(etaHandler) && /SHIPMENT_NOT_FOUND/.test(etaHandler), '10. zero matches is a typed not-found');
ok(/matches\.length > 1/.test(etaHandler) && /SHIPMENT_IDENTITY_AMBIGUOUS/.test(etaHandler), '10. more than one match REFUSES rather than taking the first');
ok(/var row = matches\[0\];/.test(etaHandler), '10. exactly one row is addressed');
ok(/rows_matched: 1/.test(etaHandler), '10. and the success envelope states it');
var etaSets = (code(etaHandler).match(/getRange\([^)]*\)\.setValue\(/g) || []);
eq(etaSets.length, 3, '10. exactly three cells are written');
ok(etaSets.every(function (t) { return /sEtaCol \+ 1|sUpdAt \+ 1|sUpdBy \+ 1/.test(t); }), '10. and they are eta + updated_at + updated_by only');
var sheetsOpened = (code(etaHandler).match(/getSheetByName\((['"])[^'"]*\1\)/g) || []);
eq(sheetsOpened, ["getSheetByName('shipments')"], '10. exactly one sheet is opened, and it is shipments');

// ==========================================================================================================
section('11. read-after-write is mandatory');
// ==========================================================================================================
ok(/SpreadsheetApp\.flush\(\)/.test(etaHandler), '11. the write is flushed');
ok(/var afterRaw = shipSheet\.getRange\(row, sEtaCol \+ 1\)\.getValue\(\);/.test(etaHandler), '11. the cell is READ BACK after the flush');
ok(/var persisted = shipEtaDateOnly_\(afterRaw\);/.test(etaHandler), '11. and normalized through the canonical rule');
ok(/if \(!persisted\)[\s\S]{0,200}ETA_WRITE_NOT_ACKNOWLEDGED/.test(etaHandler), '11. an unreadable read-back is ETA_WRITE_NOT_ACKNOWLEDGED');
ok(/if \(persisted !== intended\)[\s\S]{0,200}ETA_READBACK_MISMATCH/.test(etaHandler), '11. a mismatched read-back is ETA_READBACK_MISMATCH');
var successIdx = etaHandler.indexOf('success: true');
ok(successIdx > etaHandler.indexOf('var persisted ='), '11. success is claimed only AFTER the read-back');
ok(/read_after_write: true/.test(etaHandler), '11. and the envelope records it');
ok(/do NOT retry blindly/.test(etaHandler), '11. a mismatch tells the operator not to retry blindly');

// ==========================================================================================================
section('12. the persisted date equals the intended date');
// ==========================================================================================================
ok(/eta: persisted,/.test(etaHandler), '12. the response returns the PERSISTED value');
ok(!/eta: etaCheck\.value/.test(etaHandler), '12. and never echoes the input as if it were proof');
ok(/eta_intended: intended/.test(etaHandler), '12. the intended value is reported alongside it');
ok(/var shown = String\(d\.eta \|\| v\);/.test(etaClick), '12. the page displays the value the SERVER returned');
ok(/ETA saved and verified in the database/.test(etaClick), '12. with a visible, explicit success state');
ok(/afterShipmentWrite\(vm\.shipmentId\)/.test(etaClick), '12. and refreshes from the server workspace value');
ok(/etaFlashReplay\(\)/.test(MAP), '12. the proven outcome survives the post-write re-render');
// round-trip: what the writer stores normalizes back to what was asked for
eq(shipEtaDateOnly_(new Date(Date.UTC(2026, 9, 14, 16, 0, 0))), shipEtaValidate_('2026-10-15').value, '12. stored cell -> normalized == validated intent');

// ==========================================================================================================
section('13. an invalid or blank ETA is zero-write');
// ==========================================================================================================
eq(shipEtaValidate_('').ok, false, '13. blank is invalid');
eq(shipEtaValidate_('2026-02-30').ok, false, '13. an impossible calendar day is invalid');
eq(shipEtaValidate_('2026-13-01').ok, false, '13. an impossible month is invalid');
eq(shipEtaValidate_('12/01/2026').ok, false, '13. a non-ISO format is invalid (no parse-guessing)');
var preLock = etaHandler.slice(0, etaHandler.indexOf('LockService'));
ok(/ETA_INVALID/.test(preLock), '13. the ETA gate runs BEFORE the lock is taken');
ok(/SHIPMENT_ID_REQUIRED/.test(preLock), '13. and so does the identity gate');
ok(preLock.indexOf('getSheetByName') === -1 || preLock.indexOf('ETA_INVALID') < preLock.indexOf('getSheetByName'),
  '13. an invalid ETA never even opens the sheet');
ok(/code: 'ETA_INVALID', zero_write: true/.test(etaHandler), '13. and the refusal declares zero_write');
ok(/Nothing was sent/.test(etaClick), '13. the page refuses a malformed date locally and says nothing was sent');

// ==========================================================================================================
section('14. no status or current-position change');
// ==========================================================================================================
ok(!/sStatus \+ 1\)\.setValue/.test(etaHandler), '14. the status cell is never written');
ok(/status_unchanged: beforeStatus === afterStatus/.test(etaHandler), '14. status is read before and after and PROVEN unchanged');
ok(/current_position_unchanged: true/.test(etaHandler), '14. current position is declared unchanged');
var etaCodeOnly = noStrings(etaHandler);
['shipment_routes', 'shipment_received_qty', 'shipPromoteOnProgress_', 'shipRouteResolveMove_'].forEach(function (k) {
  ok(etaCodeOnly.indexOf(k) === -1, '14. the ETA writer contains no ' + k);
});
ok(/status_unchanged === false/.test(etaClick), '14. and the page would WARN if the server ever reported otherwise');

// ==========================================================================================================
section('15. no unrelated route or event mutation');
// ==========================================================================================================
['shipAppendLifecycleEvent_', 'SHIP_EVENT_HEADERS_', 'shipReceiptEventSourceId_'].forEach(function (k) {
  ok(etaCodeOnly.indexOf(k) === -1, '15. the ETA writer never reaches ' + k);
});
ok(/shipment_events_appended: 0/.test(etaHandler), '15. and reports zero events appended');
// the canonical enum has no ETA member — this is authority, not preference
ok(/departed_origin/.test(DEMO) && /route_node_reached/.test(DEMO), '15. the canonical event enum is departed_origin / route_node_reached / received');
ok(noStrings(G31).indexOf("'eta_updated'") === -1 && noStrings(G31).indexOf("'eta_revised'") === -1, '15. no ETA event type was invented');
ok(/canonical `shipment_events.event_type` enum is\s*\n?`?departed_origin`?/.test(DOC) || /canonical .shipment_events.event_type. enum is/.test(DOC),
  '15. and the record cites the canonical enum as the authority');

// ==========================================================================================================
section('16. Update Position still appends exactly one idempotent event');
// ==========================================================================================================
var advFn = extractFn(G31, 'handleAdvanceShipmentRoutePoint_');
ok(/event_type: 'route_node_reached'/.test(advFn), '16. the position path still appends route_node_reached');
ok(/source_event_id: shipRouteEventSourceId_\(shipmentId, tgt\.shipmentRouteId\)/.test(advFn), '16. keyed by the deterministic source_event_id');
ok(/if \(move\.code === 'ADVANCED'\)/.test(advFn), '16. only on a REAL forward advance');
eq(shipRouteEventSourceId_('S1', 'R7'), 'route:S1:R7', '16. the source id is deterministic');
eq(shipEventShouldAppend_(['route:S1:R7'], 'route:S1:R7'), false, '16. a replay of the same move appends NOTHING (idempotent)');
eq(shipEventShouldAppend_(['route:S1:R6'], 'route:S1:R7'), true, '16. a genuinely new node does append');
eq(shipEventShouldAppend_([], ''), false, '16. an empty source id never appends');
// the promotion rule is untouched by this round
eq(shipPromoteOnProgress_({ current_status: 'shipped', move_code: 'ADVANCED', origin_sequence_no: 1, target_sequence_no: 2 }).promote, true, '16. first movement beyond origin still promotes shipped -> in_transit');
eq(shipPromoteOnProgress_({ current_status: 'shipped', move_code: 'IDEMPOTENT', origin_sequence_no: 1, target_sequence_no: 2 }).promote, false, '16. an idempotent replay still promotes nothing');
eq(shipPromoteOnProgress_({ current_status: 'in_transit', move_code: 'ADVANCED', origin_sequence_no: 1, target_sequence_no: 3 }).promote, false, '16. and it never re-promotes');
// the ETA control cannot reach the position path
ok(!/route-advance/.test(etaClick) && !/advanceShipmentRoutePoint/.test(etaClick), '16. the ETA button never calls the route advance API');
ok(!/state\.globe\.focus/.test(etaClick), '16. and never moves the map marker itself');

// ==========================================================================================================
section('17. an ETA failure envelope reaches the UI intact');
// ==========================================================================================================
var etaAdapter = DBAPI.slice(DBAPI.indexOf('updateShipmentEta = async function'), DBAPI.indexOf('reconcileShipmentEta'));
ok(/AbortController/.test(etaAdapter) && /KM_WRITE_TIMEOUT_MS_/.test(etaAdapter), '17. the ETA write is bounded by the canonical client write timeout');
ok(/REQUEST_TIMEOUT_WRITE_INDETERMINATE/.test(etaAdapter), '17. an abort is typed INDETERMINATE, not "failed"');
ok(/return json;/.test(etaAdapter), '17. the FULL backend envelope is returned without throwing');
ok(!/throw /.test(etaAdapter), '17. and a business failure never throws');
ok(/NOT SAVED \u2014 ' \+ \(code \? '\[' \+ code \+ '\] ' : ''\)/.test(etaClick), '17. the page shows NOT SAVED plus the typed code');
ok(/etaMsg\(/.test(etaClick) && /data-glm="eta-msg"/.test(MAP), '17. at the ETA control itself, not in the Receiving section');
ok(etaClick.indexOf('receiptMsg(') === -1, '17. the ETA path no longer reports through the receipt message node');
// success is never shown on failure
var successCount = (etaClick.match(/ETA saved and verified/g) || []).length;
eq(successCount, 1, '17. exactly one success message exists');
ok(etaClick.indexOf('ETA saved and verified') < etaClick.indexOf('var code ='), '17. and it is only reachable inside the success branch');
// reconcile before retry
ok(/reconcileShipmentEta/.test(etaClick), '17. an indeterminate timeout RECONCILES the persisted ETA');
ok(/No second write was sent/.test(etaClick), '17. and says so when the write had in fact landed');
var recFn = DBAPI.slice(DBAPI.indexOf('reconcileShipmentEta = async function'), DBAPI.indexOf('reconcileShipmentEta = async function') + 1800);
ok(/getWorkspace\('shipment'/.test(recFn), '17. reconciliation is a READ through the existing bounded workspace');
ok(noStrings(recFn).indexOf('updateShipmentEta') === -1, '17. and never re-issues the write');
ok(/matches_intended/.test(recFn), '17. it reports whether the persisted ETA already equals the intended one');

// ==========================================================================================================
section('18. no Demo mutation and no email anywhere in this round');
// ==========================================================================================================
[G68, extractFn(G31, 'handleUpdateShipmentEta_'), extractFn(G16, 'sadK2ReconcileDecision_'),
  extractFn(G16, 'sadLegacyReconcileReason_'), extractFn(G66, 'rosPlanningCycleCensus_')].forEach(function (src, i) {
  var c = noStrings(src);
  ['MailApp', 'GmailApp', 'sendEmail', 'TEMP_demo_', 'DEMO_SEED', 'DEMO4A_'].forEach(function (k) {
    ok(c.indexOf(k) === -1, '18. no email / Demo touch in FB-4A source ' + i + ' (' + k + ')');
  });
});
ok(DEMO.indexOf('F1-7N-FB-4A') === -1, '18. the Demo seed carries no FB-4A marker — it was not touched');
// no test-only escape hatch could make this suite pass against a bypassable gate
[G68, G31, G16, G66].forEach(function (src, i) {
  ['process.env', 'NODE_ENV', '__TEST__', 'skipVerification', 'bypassVerification', 'forceSuccess'].forEach(function (k) {
    ok(noStrings(src).indexOf(k) === -1, '18. no test-only escape hatch in source ' + i + ' (' + k + ')');
  });
});

// ==========================================================================================================
section('19. deployment identity, the deferred map requirement, and the recorded baseline');
// ==========================================================================================================
var buildNow = (G63.match(/var SYS_BUILD_VERSION_ = '([^']+)';/) || [])[1];
ok(/^F1-7N-FB-\d+[A-Z]$/.test(buildNow || ''), '19. SYS_BUILD_VERSION_ names a current build (' + buildNow + ')');
eq((G66.match(/var ROS_BUILD_VERSION_ = '([^']+)';/) || [])[1], buildNow, '19. the Send owner reports the SAME build, so a partial sync is visible');
var acv = Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
var pinned = Number((DBAPI.match(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
ok(acv >= 6, '19. the action-contract version advanced because a router action was added (v' + acv + ')');
eq(pinned, acv, '19. and the frontend pins exactly it, so a stale deployment is named DEPLOYMENT_CONTRACT_MISMATCH');
ok(/system\.executionPlanConflictDiagnostic/.test(G63), '19. the new action is in the required-action list');
// §I — audited and deferred, with nothing implemented
// FB-4A recorded this as DEFERRED; F1-7N-MAP-COUNTRY-BOUNDARY-1 then implemented it. The STATUS word was
// never the contract — pinning it would fail the moment the deferred work was actually done. What must
// remain true either way is that the owning map spec carries the section and its scoped requirements.
ok(/## 32\. Country Boundary Layer/.test(MAPSPEC), '19. the boundary requirement is recorded in the owning map spec');
['vector country boundary layer', 'ISO labels', 'Scale-aware label visibility', 'Island label points',
  'Collision suppression', 'No coordinate jitter', 'No route/event geometry change', 'Licence / provenance',
  'high-resolution globe material'].forEach(function (k) {
  ok(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(MAPSPEC), '19. it scopes: ' + k);
});
ok(/no per-ring country name, no ISO code and no administrative attribution/.test(MAPSPEC), '19. and records the audit: no reusable boundary asset exists');
ok(/public domain/.test(MAPSPEC), '19. with the existing asset\u2019s provenance stated');
ok(fs.existsSync(path.join(__dirname, '..', 'js', 'data', 'world-land-110m.js')), '19. the audited asset is the vendored land outline');
ok(!fs.existsSync(path.join(__dirname, '..', 'js', 'data', 'world-admin-0.js')), '19. and NO boundary dataset was added this round');
// the known regression baseline is named in this suite's own header
ok(/gap-job-done-notice-f1-small-r1/.test(read('tests/live-blocker-execution-plan-identity-and-shipment-eta-f1-7n-fb-4a.test.js')),
  '19. the known regression baseline is named in this file, so an unexplained new failure is visible');
// nothing here claims live evidence
ok(/no live performance and no live DB success is claimed/i.test(DOC), '19. the record claims no live evidence');
ok(/Nothing was migrated/i.test(DOC) && /rows_migrated = 0/.test(DOC), '19. and states that nothing was migrated');

// ==========================================================================================================
section('20. ADDENDUM — diagnostic ownership, single definition, and a provable deployment');
// ==========================================================================================================
// §I.1 — ZERO ROSEND SYMBOLS IN THE DEMO SEED. The Demo seed owns Demo data and nothing else; a Request Order
// diagnostic placed there would couple two unrelated subsystems and put the seed's checksum contract at risk.
['TEMP_ROSEND', 'TEMP_REQUEST_ORDER_SEND', 'ROSEND', 'rosResolveCurrentPlanningCycle_', 'rosPlanningCycleCensus_'].forEach(function (k) {
  ok(GDEMOSEED.indexOf(k) === -1, '20. the Demo seed contains NO ' + k);
});
ok(GDEMOSEED.indexOf('F1-7N-FB-4A') === -1, '20. and carries no FB-4A marker at all — it was not touched');
['TEMP_ROSEND', 'TEMP_REQUEST_ORDER_SEND'].forEach(function (k) {
  ok(GDOCDIAG.indexOf(k) === -1, '20. TEMP_document_diagnostics.gs contains no ' + k + ' either (it never owned them)');
});

// §I.2 — EXACTLY ONE DEFINITION of each entrypoint and each config constant. All .gs files share ONE global
// scope, so a second definition would not be a harmless copy: whichever file loaded last would silently win.
var ALL_GS = fs.readdirSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script'))
  .filter(function (f) { return /\.gs$/.test(f); });
function definitionsAcrossProject(pattern) {
  var total = 0, files = [];
  ALL_GS.forEach(function (f) {
    var src = read('specs/active/apps-script/' + f);
    var n = (src.match(pattern) || []).length;
    if (n) { total += n; files.push(f + ':' + n); }
  });
  return { total: total, files: files };
}
[['TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE', /function\s+TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE\s*\(/g],
 ['TEMP_REQUEST_ORDER_SEND_PREVIEW', /function\s+TEMP_REQUEST_ORDER_SEND_PREVIEW\s*\(/g],
 ['TEMP_REQUEST_ORDER_SEND_DIAGNOSTIC_STATUS', /function\s+TEMP_REQUEST_ORDER_SEND_DIAGNOSTIC_STATUS\s*\(/g],
 ['TEMP_ROSEND_PLANNING_CYCLE_OVERRIDE_', /var\s+TEMP_ROSEND_PLANNING_CYCLE_OVERRIDE_\s*=/g],
 ['TEMP_ROSEND_TIER_SCOPE_', /var\s+TEMP_ROSEND_TIER_SCOPE_\s*=/g],
 ['TEMP_ROSEND_DIAG_OWNER_FILE_', /var\s+TEMP_ROSEND_DIAG_OWNER_FILE_\s*=/g]].forEach(function (pair) {
  var d = definitionsAcrossProject(pair[1]);
  eq(d.total, 1, '20. exactly ONE definition of ' + pair[0] + ' across the whole project');
  eq(d.files, ['TEMP_request_order_send_diagnostics.gs:1'], '20. and it is in the single owner file (' + pair[0] + ')');
});
// the retired constant name is gone entirely — so the Script Property the operator created matches nothing
eq(definitionsAcrossProject(/var\s+TEMP_ROSEND_PLANNING_CYCLE_\s*=/g).total, 0,
  '20. the old TEMP_ROSEND_PLANNING_CYCLE_ constant no longer exists anywhere');
ok(noStrings(G66).indexOf('TEMP_ROSEND') === -1, '20. and 66_ (the production Send owner) defines no TEMP diagnostic symbol');

// §I.3 — NO SCRIPT PROPERTY DEPENDENCY anywhere in the diagnostic owner.
var GTDcode = noStrings(GTD);
['PropertiesService', 'getProperty', 'setProperty', 'deleteProperty', 'getScriptProperties', 'getUserProperties'].forEach(function (k) {
  ok(GTDcode.indexOf(k) === -1, '20. the diagnostic owner never touches ' + k);
});
ok(/read by NOTHING and changes NOTHING/.test(GTD), '20. and the status report SAYS a Script Property is inert, so the mistake is not made twice');

// §I.4 — automatic resolution uses the PRODUCTION cycle authority, not a private copy.
ok(/rosReadResolvedPlanningCycle_\(TEMP_ROSEND_PLANNING_CYCLE_OVERRIDE_\)/.test(GTD),
  '20. the diagnostics delegate resolution to the production authority in 66_');
ok(GTDcode.indexOf('request_order_allocation_drafts') === -1,
  '20. and never re-implement the table read themselves');
var probeFn = extractFn(GTD, 'TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE');
var prevFn = extractFn(GTD, 'TEMP_REQUEST_ORDER_SEND_PREVIEW');
[probeFn, prevFn].forEach(function (fn, i) {
  ok(/tempRosendResolve_\(\)/.test(fn), '20. wrapper ' + i + ' resolves through the shared resolver');
  ok(/if \(res\.blocked\)[\s\S]{0,80}return;/.test(fn), '20. wrapper ' + i + ' RETURNS on a blocked resolution — it never reads a workset');
});

// §I.5 — the diagnostics remain strictly READ-ONLY.
['appendRow', 'setValue', 'setValues', 'insertSheet', 'deleteRow', 'deleteSheet', 'procurementEnsureSheet_',
 'LockService', 'DriveApp', 'MailApp', 'GmailApp', 'sendEmail', 'DEMO4A_', 'TEMP_demo_'].forEach(function (k) {
  ok(GTDcode.indexOf(k) === -1, '20. the diagnostic owner contains no ' + k);
});
eq((GTD.match(/mode: 'preview'/g) || []).length, 1, '20. the preview wrapper is pinned to preview');
ok(GTDcode.indexOf("mode: 'execute'") === -1, '20. and no editor wrapper can execute a Send');
ok(/DB_WRITES=0 DRIVE_WRITES=0 PROPERTY_WRITES=0 STATUS_TRANSITIONS=0/.test(GTD),
  '20. every blocked path prints the zero-write counters (§G)');
var statusRep = extractFn(GTD, 'tempRosendStatusReport_');
['resolved_planning_cycle', 'resolution_source', 'candidate_cycles', 'build_id',
 'deployed_action_contract_version', 'owner_file', 'owner_build_version',
 'DB_WRITES', 'DRIVE_WRITES', 'STATUS_TRANSITIONS'].forEach(function (k) {
  ok(statusRep.indexOf(k) !== -1, '20. the §G status report includes ' + k);
});

// §H — a MIXED deployment is a NAMED fact, on evidence that is not self-referential.
eval(extractVar(G63, 'SYS_MODULE_BUILD_STAMPS_'));
eval(extractFn(G63, 'sysModuleBuildStamps_'));
var SYS_BUILD_VERSION_ = (G63.match(/var SYS_BUILD_VERSION_ = '([^']+)';/) || [])[1];
// the manifest must match what the files ACTUALLY declare, or the check is a lie on day one
var declaredBy = {
  'SYS_BUILD_VERSION_': SYS_BUILD_VERSION_,
  'ROS_BUILD_VERSION_': (G66.match(/var ROS_BUILD_VERSION_ = '([^']+)';/) || [])[1],
  'ADI_BUILD_VERSION_': (G67.match(/var ADI_BUILD_VERSION_ = '([^']+)';/) || [])[1],
  'EPC_BUILD_VERSION_': (G68.match(/var EPC_BUILD_VERSION_ = '([^']+)';/) || [])[1],
  'TEMP_ROSEND_DIAG_BUILD_VERSION_': (GTD.match(/var TEMP_ROSEND_DIAG_BUILD_VERSION_ = '([^']+)';/) || [])[1]
};
SYS_MODULE_BUILD_STAMPS_.forEach(function (m) {
  eq(declaredBy[m.symbol], m.expected, '20. the manifest expectation for ' + m.file + ' matches what the file declares');
});
// a file that did not change this round is NOT forced to churn
var unchanged = SYS_MODULE_BUILD_STAMPS_.filter(function (m) { return m.expected !== SYS_BUILD_VERSION_; });
ok(unchanged.length >= 1, '20. at least one owner legitimately declares an OLDER build than this round');
ok(unchanged.every(function (m) { return declaredBy[m.symbol] === m.expected; }), '20. and it is still treated as current');
// execute the real stamp reader against a UNIFORM and a MIXED project
global.sysGlobalValue_ = function (n) { return declaredBy[n]; };
eval(extractFn(G63, 'sysModuleBuildStamps_'));
var uniform = sysModuleBuildStamps_();
eq([uniform.mixed_deployment, uniform.absent_modules.length, uniform.stale_modules.length], [false, 0, 0], '20. a fully synced project is UNIFORM');
ok(/UNIFORM/.test(uniform.verdict), '20. and says so');
// the live scenario: 66_ left a round behind while everything else is current
declaredBy['ROS_BUILD_VERSION_'] = 'F1-7N-FB-3C';
var mixed = sysModuleBuildStamps_();
eq(mixed.mixed_deployment, true, '20. a 66_ left a round behind is detected as a MIXED deployment');
ok(/66_api_v1_request_order_send\.gs declares F1-7N-FB-3C/.test(mixed.stale_modules.join('|')), '20. naming the exact file and what it declares');
ok(/MIXED_OR_PARTIAL_SYNC/.test(mixed.verdict), '20. with a verdict the operator can act on');
// a file absent from the deployment entirely
declaredBy['ROS_BUILD_VERSION_'] = 'F1-7N-FB-4A';
delete declaredBy['TEMP_ROSEND_DIAG_BUILD_VERSION_'];
var absent = sysModuleBuildStamps_();
eq(absent.mixed_deployment, true, '20. a file that was never copied is detected too');
eq(absent.absent_modules, ['TEMP_request_order_send_diagnostics.gs'], '20. and named');

// the CALLER-driven probe is what breaks the self-reference
var probeSrc = extractFn(G63, 'sysProbeRequested_');
ok(/probe_actions/.test(probeSrc) && /probe_symbols/.test(probeSrc), '20. health accepts the caller\u2019s explicit action + symbol list');
ok(/known_to_this_build/.test(probeSrc), '20. and reports an action the deployment has never heard of as such');
ok(/NOT self-referential/.test(probeSrc), '20. stating plainly why it is not self-referential');
ok(/module_build_stamps: moduleStamps/.test(G63) && /caller_probe: callerProbe/.test(G63), '20. both are in the health payload');
ok(/if \(moduleStamps\.mixed_deployment\) ok = false;/.test(G63), '20. a partial sync makes the deployment NOT ok');
// the client pins the exact list and refuses on any of the three failure shapes
ok(/KM_REQUIRED_DEPLOYED_ACTIONS_/.test(DBAPI) && /KM_REQUIRED_DEPLOYED_SYMBOLS_/.test(DBAPI), '20. the frontend pins the exact actions AND symbols it needs');
['system.requestOrderSendDiagnosticStatus', 'system.executionPlanConflictDiagnostic', 'shipment.eta.update'].forEach(function (a) {
  ok(new RegExp("'" + a.replace(/\./g, '\\.') + "'").test(DBAPI), '20. including ' + a);
});
['sadK2ReconcileDecision_', 'shipEtaDateOnly_', 'shipWsDateOnly_', 'rosResolveCurrentPlanningCycle_', 'TEMP_ROSEND_DIAG_OWNER_FILE_'].forEach(function (sy) {
  ok(DBAPI.indexOf("'" + sy + "'") !== -1, '20. and the symbol ' + sy + ', which proves its owner file was copied');
});
var chk = DBAPI.slice(DBAPI.indexOf('checkDeploymentContract = async function'), DBAPI.indexOf('getExpectedContract'));
ok(/probe_actions: KM_REQUIRED_DEPLOYED_ACTIONS_/.test(chk), '20. the client SENDS the probe list rather than trusting missing_actions');
ok(/DEPLOYMENT_PARTIAL_SYNC/.test(chk), '20. and has a distinct verdict for a partial sync');
ok(/did not answer the explicit action\/symbol probe/.test(chk), '20. a deployment too old to answer the probe is itself conclusive');
ok(chk.indexOf('!identity.caller_probe') < chk.indexOf('mixed_deployment === true'), '20. the too-old check runs before the uniformity check');
// the new action is routed and required
ok(/action === 'system\.requestOrderSendDiagnosticStatus'[\s\S]{0,140}handleRequestOrderSendDiagnosticStatus_/.test(ROUTER), '20. the §G status action is routed');
ok(/system\.requestOrderSendDiagnosticStatus/.test(G63), '20. and is in the required-action list');
var acv2 = Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
ok(acv2 >= 7, '20. the action contract advanced again because an action was added (v' + acv2 + ')');
eq(Number((DBAPI.match(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]), acv2, '20. and the frontend pins exactly it');

console.log('\n----------------------------------------');
if (fail === 0) console.log('ALL PASS  (' + pass + ' assertions)');
else console.log('FB-4A LIVE BLOCKERS: ' + pass + ' passed, ' + fail + ' failed');
console.log('----------------------------------------');
process.exit(fail === 0 ? 0 : 1);
