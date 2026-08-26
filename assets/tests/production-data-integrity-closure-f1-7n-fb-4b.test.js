// F1-7N-FB-4B — Execution Plan multi-route idempotency · ETA date-only projection · PO template resolution ·
// Recommendation vs Order Qty authority · gap/cartonization audit.
//
// Proves the twelve §G claims. Behavioural claims EXECUTE the shipped functions; structural claims (a primary key
// that must never be appended to, an ISO timestamp that must never be emitted, a rule that must NOT be silently
// rewritten) assert against COMMENT- and STRING-stripped source so prose cannot satisfy them.
//
// Known regression baseline: gap-job-done-notice-f1-small-r1,
// order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle, supply-planning-route-inventory.
//
// Run: node assets/tests/production-data-integrity-closure-f1-7n-fb-4b.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G31 = read('assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs');
var G39 = read('assets/specs/active/apps-script/39_document_runtime_service.gs');
var G57 = read('assets/specs/active/apps-script/57_api_v1_shipment_workspace.gs');
var G68 = read('assets/specs/active/apps-script/68_api_v1_execution_plan_conflict_diagnostic.gs');
var IR = read('assets/js/pages/inventory-replenishment.js');
var RO = read('assets/js/pages/request-order.js');
var MAP = read('assets/js/pages/global-logistics-map.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var CALC = read('assets/js/core/supply-planning-calculations.js');
var RULES = read('docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md');

function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function noStrings(src) { return code(src).replace(/'(\\.|[^'\\])*'/g, "''").replace(/"(\\.|[^"\\])*"/g, '""'); }
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

// deterministic Apps Script stubs
var Utilities = {
  formatDate: function (d, tz, fmt) {
    var off = 480;   // Asia/Taipei
    var t = new Date(d.getTime() + off * 60000);
    function z(n) { return (n < 10 ? '0' : '') + n; }
    if (fmt === 'yyyy-MM-dd') return t.getUTCFullYear() + '-' + z(t.getUTCMonth() + 1) + '-' + z(t.getUTCDate());
    return t.getUTCFullYear() + '-' + z(t.getUTCMonth() + 1) + '-' + z(t.getUTCDate()) + ' ' + z(t.getUTCHours()) + ':' + z(t.getUTCMinutes()) + ':' + z(t.getUTCSeconds());
  }
};
var Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
global.Utilities = Utilities; global.Session = Session;

// real shipped functions
eval(extractFn(G16, 'sadFnv1a_'));
eval(extractFn(G16, 'sadLineNaturalKey_'));
eval(extractFn(G16, 'sadDeterministicLineId_'));
eval(extractFn(G16, 'sadK2LineNaturalKey_'));
eval(extractFn(G16, 'sadK2DeterministicLineId_'));
// F1-7N-FB-4C - the shipped guards now read the named terminal-status sets (which gained `expired`), so the
// eval list has to carry them. No assertion below changes.
eval(extractVar(G16, 'SAD_LINE_IDENTITY_FIELDS_'));
eval(extractVar(G16, 'SAD_TERMINAL_STATUSES_'));
eval(extractVar(G16, 'SAD_TERMINAL_LINE_STATUSES_'));
eval(extractFn(G16, 'sadCanonicalLineId_'));
eval(extractFn(G16, 'sadSameLineIdentity_'));
eval(extractFn(G16, 'sadPreflightLineBatch_'));
eval(extractFn(G16, 'sadVerifyDraftLines_'));
eval(extractFn(G31, 'shipEtaDateOnly_'));
eval(extractFn(G57, 'shipWsStr_'));
eval(extractFn(G57, 'shipWsDateOnly_'));
eval(extractVar(G57, 'SHIP_WS_DATE_ONLY_COLS_'));
eval(extractFn(G57, 'shipWsIsDate_'));
eval(extractFn(G57, 'shipWsDateTime_'));
eval(extractFn(G57, 'shipWsNormalizeRawRow_'));
eval(extractFn(G39, 'dgsInWindow_'));
var AUDIT = require(path.join(ROOT, 'assets', 'js', 'core', 'supply-planning-recommendation-audit.js'));

var DRAFT = 'SADH-K2-E7AF9242';
function line(over) {
  var o = { sku: 'CO1100-R', site_sku: '', window_code: 'W1', planned_qty: 800 };
  for (var k in (over || {})) o[k] = over[k];
  return o;
}

// ==========================================================================================================
section('1/3. Add Route after a successful save — and the same PK can never appear twice');
// ==========================================================================================================
// The exact live identity: under K2 the line key is sku|site_sku|window_code — route and source are HEADER dims.
var idA = sadCanonicalLineId_(true, DRAFT, line());
var idB = sadCanonicalLineId_(true, DRAFT, line({ planned_qty: 400, route_no: '2', source_warehouse_id: 'WH-OTHER' }));
eq(idA, idB, '1. two routes for the SAME sku+window under one K2 header resolve to the SAME canonical line id');
ok(/^SADL-K2-[0-9A-F]{8}$/.test(idA), '1. and it is the deterministic K2 shape (' + idA + ')');
// therefore a batch carrying both must fail closed, not let one silently overwrite the other
var pre = sadPreflightLineBatch_(true, DRAFT, [line(), line({ planned_qty: 400, route_no: '2' })]);
eq(pre.ok, false, '1. a batch containing both is REFUSED before any write');
eq(pre.conflicts.length, 1, '1. with exactly one conflict reported');
eq([pre.conflicts[0].first_planned_qty, pre.conflicts[0].duplicate_planned_qty], ['800', '400'], '1. naming BOTH quantities, so neither is silently lost');
eq(pre.conflicts[0].canonical_line_id, idA, '1. and the canonical id they collide on');
// a genuinely different SKU is not a conflict
eq(sadPreflightLineBatch_(true, DRAFT, [line(), line({ sku: 'CO1150-N' })]).ok, true, '1. two different SKUs are not a conflict');
// a different window is a different line
ok(sadCanonicalLineId_(true, DRAFT, line()) !== sadCanonicalLineId_(true, DRAFT, line({ window_code: 'W2' })), '1. a different window IS a different line');
// a cancelled line never participates in the conflict check
eq(sadPreflightLineBatch_(true, DRAFT, [line(), line({ line_status: 'cancelled' })]).ok, true, '1. a soft-cancel is exempt');

var keyed = extractFn(G16, 'sadUpsertLinesKeyedCore_');
var atomic = extractFn(G16, 'sadAtomicUpsertCore_');
[['keyed', keyed], ['atomic', atomic]].forEach(function (pair) {
  ok(/LINE_PRIMARY_KEY_ALREADY_EXISTS/.test(pair[1]), '3. the ' + pair[0] + ' core refuses to append onto an existing primary key');
  ok(/procurementFindRow_\(\w+, 'allocation_draft_line_id', (canonicalId|canonicalLineId)\)/.test(pair[1]),
    '3. the ' + pair[0] + ' core looks the CANONICAL id up BEFORE considering an insert');
});
ok(/var canonicalId = sadCanonicalLineId_\(isK2Draft, draftId, l\);/.test(keyed), '3. every incoming line gets a canonical identity');
ok(/LINE_IDENTITY_CONFLICT/.test(keyed), '3. an explicit id naming a different logical line fails closed');
// the caller's opaque id is never trusted as an identity
ok(/lineId = canonicalId;/.test(keyed) && /lineId = canonicalLineId;/.test(atomic), '3. an INSERT always uses the canonical id');
eq(sadSameLineIdentity_({ sku: 'CO1100-R', site_sku: '', window_code: 'W1' }, line()), true, '3. identity compares sku+site_sku+window_code');
eq(sadSameLineIdentity_({ sku: 'CO1100-R', site_sku: '', window_code: 'W1', planned_qty: 999 }, line()), true, '3. quantity is CONTENT, not identity — an edit is not a different line');
eq(sadSameLineIdentity_({ sku: 'OTHER', site_sku: '', window_code: 'W1' }, line()), false, '3. a different SKU is a different line');

// ==========================================================================================================
section('2/5. Retry after failure converges, and leaves no partial duplicate');
// ==========================================================================================================
// THE LIVE CORRUPTION, reconstructed: three physical rows, one primary key, all 800.
var corrupted = [
  { allocation_draft_id: DRAFT, allocation_draft_line_id: idA, sku: 'CO1100-R', site_sku: '', window_code: 'W1', planned_qty: 800, line_status: 'draft' },
  { allocation_draft_id: DRAFT, allocation_draft_line_id: idA, sku: 'CO1100-R', site_sku: '', window_code: 'W1', planned_qty: 800, line_status: 'draft' },
  { allocation_draft_id: DRAFT, allocation_draft_line_id: idA, sku: 'CO1100-R', site_sku: '', window_code: 'W1', planned_qty: 800, line_status: 'draft' }
];
var v = sadVerifyDraftLines_(DRAFT, [line()], corrupted, true);
eq(v.ok, false, '2. read-after-write REFUSES the corrupted state (a count check never could)');
eq(v.duplicate_primary_keys.length, 1, '2. the duplicate primary key is detected');
eq(v.duplicate_primary_keys[0].physical_rows, 3, '2. with the exact physical row count');
ok(v.failures.some(function (f) { return f.code === 'DUPLICATE_PRIMARY_KEY'; }), '2. and reported by name');
// the healthy single-row state verifies
var healthy = [corrupted[0]];
var v2 = sadVerifyDraftLines_(DRAFT, [line()], healthy, true);
eq([v2.ok, v2.verified_line_count, v2.expected_line_count], [true, 1, 1], '2. one row at the right quantity verifies clean');
// a retry that converges on one row is the success condition
eq(sadVerifyDraftLines_(DRAFT, [line()], healthy, true).duplicate_primary_keys.length, 0, '2. a converged retry has NO duplicate primary key');
// wrong quantity is caught
eq(sadVerifyDraftLines_(DRAFT, [line({ planned_qty: 400 })], healthy, true).failures[0].code, 'LINE_QUANTITY_MISMATCH', '4. an exact quantity mismatch is caught');
// an unauthorised line under the draft is caught
var extra = healthy.concat([{ allocation_draft_id: DRAFT, allocation_draft_line_id: 'SADL-K2-DEADBEEF', sku: 'GHOST', site_sku: '', window_code: 'W1', planned_qty: 10, line_status: 'draft' }]);
ok(sadVerifyDraftLines_(DRAFT, [line()], extra, true).failures.some(function (f) { return f.code === 'UNEXPECTED_LINE'; }), '4. a line nobody authorised is caught');
// a missing line is caught
ok(sadVerifyDraftLines_(DRAFT, [line(), line({ sku: 'CO1150-N' })], healthy, true).failures.some(function (f) { return f.code === 'LINE_MISSING'; }), '4. a missing line is caught');
// another draft's rows are ignored
eq(sadVerifyDraftLines_(DRAFT, [line()], healthy.concat([{ allocation_draft_id: 'SADH-K2-OTHER', allocation_draft_line_id: 'X', sku: 'Z' }]), true).ok, true, '4. rows belonging to another draft are not counted');
// cancelled rows are excluded from both sides
eq(sadVerifyDraftLines_(DRAFT, [line()], healthy.concat([{ allocation_draft_id: DRAFT, allocation_draft_line_id: 'SADL-K2-OLD', sku: 'OLD', line_status: 'cancelled' }]), true).ok, true, '4. a soft-cancelled row is not an unexpected line');
// verification is wired into the writer, and a failure is reported rather than swallowed
ok(/var verify = sadVerifyDraftLines_\(draftId, lines, storedRows, isK2Draft\);/.test(keyed), '5. the writer runs the verification after the write');
ok(/LINE_OUTPUT_VERIFICATION_FAILED/.test(keyed), '5. and reports a typed failure');
ok(/persisted_lines: persisted/.test(keyed), '5. the response carries the ids ACTUALLY persisted');
// the page adopts them — the loop that produced three rows is closed
// F1-7N-FB-4B-ADDENDUM — STRENGTHENED: adoption is still required on success, and is now additionally SCOPED to
// the header the ids came from. Route A and Route B of one SKU share the same line identity (route is a HEADER
// dimension), so an unscoped adoption would hand Route B's persisted id to Route A.
ok(/_irAdoptPersistedLineIds_\(sku, draftIdSeen, \(lres\.data && lres\.data\.persisted_lines\) \|\| \[\]\)/.test(IR), '5. the page adopts the persisted ids on success');
ok(/function _irAdoptPersistedLineIds_\(sku, draftId, persistedLines\)/.test(IR), '5. and adoption is SCOPED to one header, so a route never adopts the id of another route');
ok(/SADL-LOCAL-/.test(IR), '5. and its own generated id is now marked LOCAL, not a durable identity');
var adopt = extractFn(IR, '_irAdoptPersistedLineIds_');
ok(/setAttribute\('data-line-id', canonical\)/.test(adopt), '5. re-stamping the DOM attribute the next collect reads');
ok(/r\.allocation_draft_line_id = canonical;/.test(adopt), '5. and the draft model');
// the batch pre-flight is a proven zero-write
ok(/var pre = sadPreflightLineBatch_\(isK2Draft, draftId, lines\);/.test(keyed) && /DUPLICATE_LINE_IDENTITY_IN_BATCH[\s\S]{0,900}zero_write: true/.test(keyed), '5. the batch refusal declares zero_write');
var preIdx = keyed.indexOf('sadPreflightLineBatch_'), appendIdx = keyed.indexOf('procurementAppendByHeader_');
ok(preIdx > -1 && appendIdx > -1 && preIdx < appendIdx, '5. and runs BEFORE the first append');

// ==========================================================================================================
section('6. ETA 2026-08-31 stays 2026-08-31 across DB / API / card / input');
// ==========================================================================================================
// The live defect: a Sheets Date cell for 2026-08-31 Asia/Taipei serialized as 2026-08-30T16:00:00.000Z.
var cell = new Date(Date.UTC(2026, 7, 30, 16, 0, 0));   // 2026-08-31 00:00 Asia/Taipei
eq(cell.toISOString(), '2026-08-30T16:00:00.000Z', '6. the raw cell really does serialize to the reported UTC string');
eq(shipEtaDateOnly_(cell), '2026-08-31', '6. the canonical normalizer projects it as the intended calendar date');
eq(shipWsDateOnly_(cell), '2026-08-31', '6. and so does the workspace projection');
// THE FIX: the RAW passthrough — which is what the client actually reads — is normalized too
var raw = shipWsNormalizeRawRow_({ shipment_id: 'S1', eta: cell, etd: cell, updated_at: cell, note: 'text', shipment_total_qty: 5 });
eq(raw.eta, '2026-08-31', '6. raw.eta is date-only — the field the client view-model is built from');
eq(raw.etd, '2026-08-31', '6. raw.etd too');
eq(raw.updated_at, '2026-08-31 00:00:00', '6. a TIMESTAMP keeps its time instead of being flattened or UTC-shifted');
eq(raw.note, 'text', '6. non-Date cells pass through untouched');
eq(raw.shipment_total_qty, 5, '6. including numbers, byte-identical');
ok(JSON.stringify(raw).indexOf('T16:00:00') === -1 && JSON.stringify(raw).indexOf('Z"') === -1, '6. NO UTC ISO timestamp survives serialization');
ok(/^\d{4}-\d{2}-\d{2}$/.test(raw.eta), '6. and it matches the page\u2019s date-input test, so the input is populated');
// both edges of the day
eq(shipWsNormalizeRawRow_({ eta: new Date(Date.UTC(2026, 7, 31, 15, 59, 0)) }).eta, '2026-08-31', '6. 23:59 local does not roll forward');
eq(shipWsNormalizeRawRow_({ eta: new Date(Date.UTC(2026, 7, 30, 16, 0, 0)) }).eta, '2026-08-31', '6. midnight local does not roll back');
// the passthrough is actually wired
ok(/raw: shipWsNormalizeRawRow_\(r\)/.test(G57), '6. shipMapShipment_ passes the row through the normalizer');
ok(noStrings(extractFn(G57, 'shipWsNormalizeRawRow_')).indexOf('toISOString') === -1, '6. the normalizer never calls toISOString');
ok(noStrings(extractFn(G57, 'shipWsDateTime_')).indexOf('UTC') === -1, '6. and never formats in UTC');
eq(Object.keys(SHIP_WS_DATE_ONLY_COLS_).indexOf('eta') >= 0, true, '6. eta is declared date-only');
// §C.7 — still no event, no position/status change (FB-4A contract, re-asserted here)
var etaHandler = extractFn(G31, 'handleUpdateShipmentEta_');
ok(/shipment_events_appended: 0/.test(etaHandler), '6. the ETA writer still appends no shipment event');
ok(/status_unchanged: beforeStatus === afterStatus/.test(etaHandler), '6. and still proves the status did not change');
ok(!/sStatus \+ 1\)\.setValue/.test(etaHandler), '6. the status cell is never written');
// §C.6 — the page renders from the SERVER value and the refresh is triggered
var etaClick = MAP.slice(MAP.indexOf("data-act=\"eta-update\"]');"), MAP.indexOf("data-act=\"route-advance\"]');"));
ok(/var shown = String\(d\.eta \|\| v\);/.test(etaClick), '6. the page displays the value the SERVER returned');
ok(/afterShipmentWrite\(vm\.shipmentId\)/.test(etaClick), '6. and refreshes the card + panel + input from the server read');

// ==========================================================================================================
section('7. an unresolved PO template names its candidates and rejections');
// ==========================================================================================================
eval(extractVar(G39, 'DGS_SCOPE_DIMS_'));
function dgsStr_(v) { return String(v == null ? '' : v).trim(); }
function dgsLc_(v) { return dgsStr_(v).toLowerCase(); }
function dgsNum_(v) { var n = Number(dgsStr_(v)); return isFinite(n) ? n : 0; }
function dgsBool_(v) { var t = dgsLc_(v); return t === 'true' || t === 'yes' || t === '1' || v === true; }
eval(extractFn(G39, 'dgsExplainPoTemplateCandidates_'));

var ctx = { factory_id: 'F-001', series: 'CO', company: 'KM', country: 'US', language: 'en', as_of: '2026-08-26', sku: '', supplier_id: '', carrier_id: '', marketplace: '' };
var none = dgsExplainPoTemplateCandidates_([], ctx);
eq([none.candidate_count, none.verdict], [0, 'CONFIGURATION_REQUIRED'], '7. no template rows at all → CONFIGURATION_REQUIRED');
ok(/NO purchase_order template row at all/.test(none.detail), '7. and says exactly that');
ok(!!none.required_configuration_row, '7. with the exact row a fix would need');
eq(none.required_configuration_row.related_entity_type, 'purchase_order', '7. naming related_entity_type');
ok(/PROPOSAL ONLY/.test(none.authorization_note), '7. as a PROPOSAL — no row is written');
ok(/No fallback template is introduced/.test(none.no_fallback_note), '7. and no arbitrary fallback is introduced');

var wrongFactory = dgsExplainPoTemplateCandidates_([
  { template_id: 'T1', template_key: 'PO_A', related_entity_type: 'purchase_order', document_type: 'purchase_order', status: 'active', is_active: 'TRUE', factory_id: 'F-999', series: 'CO' }
], ctx);
eq(wrongFactory.candidate_count, 0, '7. a populated-but-mismatched factory_id EXCLUDES the row');
eq(wrongFactory.candidates[0].rejected_by[0].gate, 'factory_id', '7. and the EXACT gate is named');
eq([wrongFactory.candidates[0].rejected_by[0].expected, wrongFactory.candidates[0].rejected_by[0].found], ['F-001', 'F-999'], '7. with both values');
eq(wrongFactory.purchase_order_shaped_rows, 1, '7. the row is still counted as PO-shaped, so the operator knows one exists');

var inactive = dgsExplainPoTemplateCandidates_([
  { template_id: 'T2', template_key: 'PO_B', related_entity_type: 'purchase_order', document_type: 'purchase_order', status: 'inactive', is_active: 'FALSE', factory_id: 'F-001', series: 'CO' }
], ctx);
eq(inactive.candidates[0].rejected_by.map(function (g) { return g.gate; }), ['status', 'is_active'], '7. an inactive row names BOTH status gates');

var expired = dgsExplainPoTemplateCandidates_([
  { template_id: 'T3', template_key: 'PO_C', related_entity_type: 'purchase_order', document_type: 'purchase_order', status: 'active', is_active: 'TRUE', factory_id: 'F-001', series: 'CO', effective_to: '2026-01-01' }
], ctx);
eq(expired.candidates[0].rejected_by[0].gate, 'effective_window', '7. a closed effective window is named');

var good = dgsExplainPoTemplateCandidates_([
  { template_id: 'T4', template_key: 'PO_OK', related_entity_type: 'purchase_order', document_type: 'purchase_order', status: 'active', is_active: 'TRUE', factory_id: 'F-001', series: 'CO' }
], ctx);
eq([good.candidate_count, good.verdict], [1, 'RESOLVED'], '7. a correctly scoped active row RESOLVES');
eq(good.candidates[0].declared_scope.sku, '(wildcard)', '7. a blank template dimension is a wildcard');
var ambiguous = dgsExplainPoTemplateCandidates_([
  { template_id: 'T4', template_key: 'PO_OK', related_entity_type: 'purchase_order', document_type: 'purchase_order', status: 'active', is_active: 'TRUE', factory_id: 'F-001' },
  { template_id: 'T5', template_key: 'PO_OK2', related_entity_type: 'purchase_order', document_type: 'purchase_order', status: 'active', is_active: 'TRUE', series: 'CO' }
], ctx);
eq(ambiguous.verdict, 'RUNTIME_DEFECT', '7. two matching rows is a RUNTIME_DEFECT, not a configuration gap');
// the hard gate and zero-write semantics are preserved
ok(/PO_DOCUMENT_TEMPLATE_UNRESOLVED/.test(G39) && /PO_DOCUMENT_TEMPLATE_AMBIGUOUS/.test(G39), '7. both blocking reasons still exist');
ok(noStrings(extractFn(G39, 'dgsExplainPoTemplateCandidates_')).indexOf('appendRow') === -1, '7. the explainer writes nothing');
ok(/if \(!cand\.length\) return \{ ok: false, reason: 'PO_DOCUMENT_TEMPLATE_UNRESOLVED'/.test(G39), '7. and dgsSelectPoTemplate_ remains the ONLY selection authority, unchanged');

// ==========================================================================================================
section('8/9/10. Recommendation vs Order Qty authority');
// ==========================================================================================================
var _canonRow = null, _hasDraft = false, _eff = null;
function _roCanonicalRowFor_(sku, bucket) { return _canonRow; }
function _roHasCanonicalDraft_(sku) { return _hasDraft; }
function _roEffectiveOrderQty(item, idx, edit) { return _eff; }
eval(extractFn(RO, '_roRowOrderQtyDisplay_'));
eval(extractFn(RO, '_roSendOrderQty_'));

// 8. a user-edited quantity survives recalculation
_canonRow = { line: { order_qty: 360, user_edited: true } }; _hasDraft = true; _eff = 400;
eq(_roRowOrderQtyDisplay_({ sku: 'CO1150-N' }, 0, 'T1', {}), 360, '8. the PERSISTED order_qty is displayed, not the fresh recommendation');
eq(_roSendOrderQty_({ sku: 'CO1150-N' }, 0, 'T1', {}), 360, '8. and it is what Send asserts');
// 9. a non-user-edited persisted quantity is still the displayed authority
_canonRow = { line: { order_qty: 360, user_edited: false } };
eq(_roRowOrderQtyDisplay_({ sku: 'CO1150-N' }, 0, 'T1', {}), 360, '9. a NON-user-edited persisted quantity is equally authoritative');
eq(_roSendOrderQty_({ sku: 'CO1150-N' }, 0, 'T1', {}), 360, '9. Send asserts the persisted value');
// 10. THE CO1150-N DEFECT: a drafted SKU whose tier row is missing must not borrow an ephemeral number
_canonRow = null; _hasDraft = true; _eff = 400;
eq(_roRowOrderQtyDisplay_({ sku: 'CO1150-N' }, 0, 'T1', {}), null, '10. a drafted SKU with no persisted tier row displays NOTHING (never 400 against a DB 360)');
eq(_roSendOrderQty_({ sku: 'CO1150-N' }, 0, 'T1', {}), null, '10. and asserts NOTHING — so a fresh AI Plan cannot fail its own quantity barrier');
// a drafted tier with a BLANK persisted quantity behaves the same
_canonRow = { line: { order_qty: '' } };
eq(_roSendOrderQty_({ sku: 'X' }, 0, 'T1', {}), null, '10. a blank persisted quantity is not asserted from an ephemeral value');
// a persisted ZERO is a real decision (§E.6)
_canonRow = { line: { order_qty: 0 } }; _eff = 999;
eq(_roRowOrderQtyDisplay_({ sku: 'X' }, 0, 'T1', {}), 0, '10. a persisted ZERO displays as 0');
eq(_roSendOrderQty_({ sku: 'X' }, 0, 'T1', {}), 0, '10. and is preserved, not overwritten by a recommendation');
// the genuine manual path still works
_canonRow = null; _hasDraft = false; _eff = 320;
eq(_roSendOrderQty_({ sku: 'MANUAL' }, 0, 'T1', {}), 320, '10. a SKU with NO canonical draft still uses the manual effective value');
// a local user edit always wins on display
_canonRow = { line: { order_qty: 360 } }; _hasDraft = true;
eq(_roRowOrderQtyDisplay_({ sku: 'X' }, 0, 'T1', { orderQty: 500 }), 500, '10. an in-flight user edit wins on display');
// display and send read the SAME authority — §E.4 by construction
_canonRow = { line: { order_qty: 777 } };
eq(_roRowOrderQtyDisplay_({ sku: 'X' }, 0, 'T1', {}), _roSendOrderQty_({ sku: 'X' }, 0, 'T1', {}), '10. display and Send agree by construction');

// the §E.8 authority matrix names the divergence
var m = AUDIT.authorityMatrix({ sku: 'CO1150-N', tier: 'T1', persisted_order_qty: 360, ui_displayed_order_qty: 400, send_intent_qty: 400, user_edit: false });
eq(m.verdict, 'AUTHORITY_CONFLICT', '8. the audit classifies the CO1150-N state as an AUTHORITY_CONFLICT');
eq(m.divergences.map(function (d) { return d.code; }), ['DISPLAY_DIVERGES_FROM_PERSISTED', 'INTENT_DIVERGES_FROM_PERSISTED'], '8. naming both divergences');
ok(/VIOLATED/.test(m.refresh_contract), '8. and reports the §E.3 refresh contract as violated');
var mOk = AUDIT.authorityMatrix({ sku: 'CO1100-R', tier: 'T2', persisted_order_qty: 360, ui_displayed_order_qty: 360, send_intent_qty: 360, send_persisted_readback_qty: 360, user_edit: true, recommendation: 320 });
eq(mOk.verdict, 'CONSISTENT', '8. a healthy user-edited row is CONSISTENT even though the recommendation differs');
eq(mOk.refresh_contract, 'OK', '8. with the refresh contract satisfied');
ok(mOk.rows.filter(function (r) { return r.binding; }).map(function (r) { return r.authority; }).indexOf('persisted_order_qty') >= 0, '8. persisted_order_qty is marked BINDING');
ok(mOk.rows.filter(function (r) { return r.authority === 'recommendation'; })[0].binding === false, '8. and recommendation is marked advisory');
eq(AUDIT.authorityMatrix({ user_edit: 'unknown' }).user_edit, null, '8. an unreadable user_edit flag is NULL, never silently false');

// ==========================================================================================================
section('11. gap ceiling — the frozen authority is REPORTED, not silently rewritten');
// ==========================================================================================================
// The live number, reproduced from the owner function's actual formula.
eq(Math.ceil(5276 / 40) * 40, 5280, '11. ceil(5276/40)*40 = 5280 — the live CO1100-R T3 Suggested');
var ca = AUDIT.cartonAudit({ raw_gap: 5276, pre_carton_qty: 5276, units_per_carton: 40, rounding_mode: 'CEILING', final_recommended_qty: 5280 });
eq([ca.excess_over_gap, ca.exceeds_gap], [4, true], '11. the audit reports the excess over gap explicitly');
eq(ca.alternative_floor_qty, 5240, '11. and the FLOOR alternative');
eq(ca.alternative_capped_at_gap_qty, 5240, '11. and the capped-at-gap alternative');
ok(/§14 \/ §31/.test(ca.authority), '11. citing the frozen spec section that owns the rule');
ok(/FROZEN-SPEC DECISION, not a defect/.test(ca.note), '11. and stating that the conflict is a decision, not a bug');
['raw_gap', 'allocatable_supply', 'pre_carton_qty', 'units_per_carton', 'rounding_mode', 'final_recommended_qty', 'excess_over_gap'].forEach(function (k) {
  ok(Object.prototype.hasOwnProperty.call(ca, k), '11. §F.6 field present: ' + k);
});
// the SHIPPING path floors and therefore never exceeds the gap — the owner assertion already holds there
var cf = AUDIT.cartonAudit({ raw_gap: 5276, allocatable_supply: 5276, pre_carton_qty: 5276, units_per_carton: 40, rounding_mode: 'FLOOR', final_recommended_qty: 5240 });
eq([cf.excess_over_gap, cf.exceeds_gap], [-36, false], '11. the SHIPPING path never exceeds the gap');
ok(/§2C\.1 \/ §31/.test(cf.authority), '11. citing the shipping section');
// THE RULE WAS NOT CHANGED — this is the STOP
ok(/return Math\.ceil\(need \/ upc\) \* upc;/.test(CALC), '11. calculateSuggestedOrderQty STILL uses CEILING — the frozen rule was NOT silently rewritten');
ok(/Math\.floor\(rawShippableQty \/ upc\) \* upc/.test(CALC), '11. and the shipping FLOOR is unchanged');
ok(/Suggested Order Qty = CEILING\(Net Order Need ÷ Units Per Carton\) × Units Per Carton/.test(RULES), '11. the frozen spec still says CEILING');
ok(/\*\*Shipping carton = FLOOR\*\*; \*\*Ordering carton = CEILING\*\*/.test(RULES), '11. and the spec header owns BOTH rules deliberately');
ok(noStrings(require('fs').readFileSync(path.join(ROOT, 'assets/js/core/supply-planning-recommendation-audit.js'), 'utf8')).indexOf('Math.ceil(need') === -1,
  '11. the audit module computes no recommendation of its own');

// ==========================================================================================================
section('12. nothing in this round writes, deletes or migrates');
// ==========================================================================================================
var AUDITSRC = noStrings(read('assets/js/core/supply-planning-recommendation-audit.js'));
['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'document.'].forEach(function (k) {
  ok(AUDITSRC.indexOf(k) === -1, '12. the audit module touches no ' + k);
});
['Math.random', 'Date.now', 'new Date('].forEach(function (k) {
  ok(AUDITSRC.indexOf(k) === -1, '12. and is deterministic (' + k + ')');
});
// the duplicate diagnostic proposes and never deletes
var dupDiag = noStrings(extractFn(G68, 'handleExecutionPlanDuplicateLineDiagnostic_'));
['deleteRow', 'setValue', 'appendRow', 'LockService'].forEach(function (k) {
  ok(dupDiag.indexOf(k) === -1, '12. the duplicate DIAGNOSTIC contains no ' + k);
});
ok(/rows_deleted: 0/.test(extractFn(G68, 'handleExecutionPlanDuplicateLineDiagnostic_')), '12. and declares rows_deleted: 0');
ok(/PROPOSAL ONLY/.test(G68), '12. the repair is a proposal');
// the cleanup tool is gated and defaults to a dry run
ok(/var TEMP_DUPFIX_MODE_ = 'DRY_RUN';/.test(G68), '12. the cleanup tool defaults to DRY_RUN');
var cleanup = extractFn(G68, 'TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP');
ok(/!== 'COMMIT'/.test(cleanup), '12. it returns unless the mode is exactly COMMIT');
ok(/confirmation_checksum/.test(cleanup), '12. a COMMIT also needs a live confirmation checksum');
ok(cleanup.indexOf('ROLLBACK-JOURNAL') < cleanup.indexOf('deleteRow'), '12. and journals every row BEFORE deleting it');
// no Demo mutation, no email anywhere in the round
[G16, G31, G39, G57, G68].forEach(function (src, i) {
  ['MailApp', 'GmailApp', 'sendEmail', 'DEMO4A_', 'TEMP_demo_'].forEach(function (k) {
    ok(noStrings(src).indexOf(k) === -1, '12. no email / Demo touch in FB-4B source ' + i + ' (' + k + ')');
  });
});

console.log('\n----------------------------------------');
if (fail === 0) console.log('ALL PASS  (' + pass + ' assertions)');
else console.log('FB-4B PRODUCTION DATA INTEGRITY: ' + pass + ' passed, ' + fail + ' failed');
console.log('----------------------------------------');
process.exit(fail === 0 ? 0 : 1);
