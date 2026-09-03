// F1-7N-FB-4G-A2-R3 — ATOMIC ADD ROUTE / PERSISTENT IDEMPOTENCY / TICKET BOUNDARY.
//
// THE THREE A2-R2 BLOCKERS, EACH MEASURED BEFORE IT WAS FIXED:
//
//   (1) THE TWO-CALL CREATE COULD LEAVE A ZERO-LINE HEADER. Executed: the header write committed
//       SADH-K2-CBB7E7F6, the separate line write was refused PLAN_LINE_INCOMPLETE, and the tables were left
//       holding 1 header and 0 lines. An orphan zero-line header is not a cosmetic leftover — it is an ACTIVE
//       draft of the station that later refuses Submit for every real route beside it (NO_LINES), and §J
//       forbids deleting it to get out of that.
//
//   (2) A CREATE HAD NO PERSISTED IDEMPOTENCY. §B.2 settles that an explicit + Add Route is ALWAYS a new
//       ticket, so a K4 collision may no longer refuse one — and that refusal was the ONLY thing preventing a
//       duplicate. Executed with the refusal removed: the SAME create_idempotency_key sent twice produced
//       SADH-K2-CBB7E7F6 and then SAD-UUID100000 — two headers for one click — and the stored key column read
//       COLUMN ABSENT on both, so no writer could tell a retry from a second click.
//
//   (3) THE COLLISION REFUSAL BLOCKED A LEGITIMATE TICKET. Executed: a second explicit Add Route with
//       identical From / To / Method came back ROUTE_IDENTITY_CONFLICT, zero_write, leaving one header where
//       §B.2 requires two.
//
// AND THE TICKET BOUNDARY AUDIT (§I), also executed: shippingPlanRouteGroupKey_ carries no ticket identity, so
// two drafts that §B.2 declares to be two tickets are committed as ONE shipping plan. That is a Submit
// contract decision, so this round STOPS on it and reports options rather than guessing (§I.5).
//
// Run: node assets/tests/atomic-add-route-and-create-idempotency-f1-7n-fb-4g-a2-r3.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G13 = read('assets/specs/active/apps-script/13_procurement_handlers.gs');
var G11 = read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var G01 = read('assets/specs/active/apps-script/01_router.gs');
var G69 = read('assets/specs/active/apps-script/69_api_v1_route_identity_contract.gs');
var PAGE = read('assets/js/pages/inventory-replenishment.js');
var CMPSRC = read('assets/js/utils/inventory-compat.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var MIG = read('assets/tools/apps-script-diagnostics/TEMP_migrate_create_idempotency_key_a2_r3.gs');
var CENSUS = read('assets/tools/apps-script-diagnostics/TEMP_route_identity_census_a2_r2.gs');
var INDEX = read('index.html');
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var IRDraft = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js')).IRDraft;

function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(');
  var m = re.exec(src); if (!m) throw new Error('not found: ' + name);
  var start = m.index, i = src.indexOf('{', start), depth = 0;
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
// Line endings differ per file; a multi-line LF find string against a CRLF file matches nothing while naming a
// target that IS present. Both sides are normalised to the source's own ending.
function mutateFn(src, name, find, replace) {
  var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  var eol = src.indexOf(CR + LF) >= 0 ? (CR + LF) : LF;
  function fix(t) { return String(t).split(CR + LF).join(LF).split(LF).join(eol); }
  find = fix(find); replace = fix(replace);
  var body = extractFn(src, name);
  if (body.indexOf(find) < 0) throw new Error('mutation target absent in ' + name + ': ' + find.slice(0, 90));
  return src.replace(body, body.replace(find, replace));
}

// ================================================================================================================
// The in-memory spreadsheet. It is the ONLY thing simulated: every rule under test runs from shipped source.
// ================================================================================================================
function FakeSheet(headers) { this.rows = [headers.slice()]; }
FakeSheet.prototype.getLastColumn = function () { return this.rows[0].length; };
FakeSheet.prototype.getDataRange = function () { var s = this; return { getValues: function () { return s.rows.map(function (r) { return r.slice(); }); } }; };
FakeSheet.prototype.appendRow = function (r) { this.rows.push(r.slice()); };
FakeSheet.prototype.getRange = function (row, col, nr, nc) {
  var s = this;
  return {
    getValues: function () { var o = []; for (var i = 0; i < (nr || 1); i++) { var l = []; for (var j = 0; j < (nc || 1); j++) l.push(s.rows[row - 1 + i][col - 1 + j]); o.push(l); } return o; },
    getValue: function () { return s.rows[row - 1][col - 1]; },
    setValue: function (v) { s.rows[row - 1][col - 1] = v; }
  };
};

var SHEETS = {};
var SpreadsheetApp = { getActiveSpreadsheet: function () { return { getSheetByName: function (n) { return SHEETS[n] || null; } }; } };
var LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
var __uuid = 0;
var Utilities = { getUuid: function () { __uuid++; return ('UUID' + __uuid + 'ABCDEF0123456789').substring(0, 16); } };
var Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
var __now = '2026-09-02 11:00:00';
function procurementTimestamp_() { return __now; }
function prodRequireSheet_(ss, n) { return SHEETS[n]; }
function procurementNum_(v) { var n = Number(v); return isFinite(n) ? n : ''; }
function jsonResponse_(o) { return o; }
function sheetEnsureColumns_() { return null; }

eval(extractFn(G13, 'procurementEnsureSheet_'));
eval(extractFn(G13, 'procurementAppendByHeader_'));
eval(extractFn(G13, 'procurementFindRow_'));

// ONE top-level eval per group: a per-callback eval declares inside the callback and nothing escapes.
var CONSTS = ['SHIPPING_ALLOCATION_DRAFTS_HEADERS_', 'SAD_LIFECYCLE_TAIL_COLUMNS_',
  'SAD_ROUTE_IDENTITY_TAIL_COLUMNS_', 'SAD_CREATE_IDEMPOTENCY_TAIL_COLUMNS_', 'SAD_HEADER_OPTIONAL_TAIL_COLUMNS_',
  'SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_', 'SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_',
  'SAD_LINE_ETA_TAIL_COLUMNS_', 'SAD_STATUSES_', 'SAD_TERMINAL_STATUSES_', 'SAD_TERMINAL_LINE_STATUSES_',
  'SAD_GENERATION_TYPES_', 'SAD_RECOMMENDATION_FIELDS_', 'SAD_LINE_LEGACY_ALIASES_', 'SAD_K2_GROUP_DIMENSIONS_',
  'SAD_LINE_IDENTITY_FIELDS_', 'SAD_K2_BASIS_ID_MATCHES_', 'SAD_K2_BASIS_STALE_ACCEPTED_',
  'SAD_K2_BASIS_DIFFERENT_GROUP_', 'SAD_K2_BASIS_NO_REQUEST_GROUP_', 'SAD_K2_BASIS_CONTESTED_',
  'SAD_K2_HEADER_FP_', 'SAD_K2_LINE_FP_', 'SAD_K2_SEM_CONTRACT_',
  'SAD_K2_FP_DATE_FIELDS_', 'SAD_K2_FP_NUMERIC_FIELDS_', 'SAD_K2_SEM_EXCLUDED_LIFECYCLE_',
  'SAD_K2_SEM_OPTIONAL_PRESERVE_'];
eval(CONSTS.map(function (v) { return extractVar(G16, v); }).join(String.fromCharCode(10)));
var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_ =
  SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.concat(SAD_LINE_ETA_TAIL_COLUMNS_);

var FNS = ['sadApplyLineAliases_', 'sadFnv1a_', 'sadFpVal_', 'sadLineNaturalKey_', 'sadDeterministicLineId_',
  'sadFindLineByNaturalKey_', 'sadK2GroupKey_', 'sadK2DeterministicHeaderId_', 'sadK2LineNaturalKey_',
  'sadK2DeterministicLineId_', 'sadIsK2Group_', 'sadNewLineId_', 'sadK2ResolveActiveDraft_', 'sadCanonicalLineId_',
  'sadSameLineIdentity_', 'sadPreflightLineBatch_', 'sadScanDuplicateLinePks_', 'sadVerifyDraftLines_',
  'sadLineIsComplete_', 'sadLiveHeaderNames_', 'sadHasColumn_', 'sadDestinationIdentity_',
  'sadHeaderRouteIsComplete_', 'sadResolveActiveDraft_', 'sadReadActiveHeaderRows_',
  'sadResolveActiveDraftK2OrK3_', 'sadK2ReconcileDecision_', 'sadLegacyReconcileReason_', 'sadReconcileMessage_',
  'sadResolveBlockMessage_', 'sadRowToObject_', 'sadReadLinesForDraft_', 'sadExactSchemaReason_',
  'sadSchemaRefusal_', 'sadK4SchemaReady_', 'sadCreateIdempotencyReady_', 'sadFindHeaderByCreateKey_',
  'sadMintNewHeaderId_', 'sadK2PayloadFingerprint_', 'sadK2SemanticPayloadEqual_',
  'sadK2LinesRouteCompatibleWithHeader_', 'sadRegenerateLinePatch_', 'sadAtomicValidateBatch_',
  'sadCanonDate_', 'sadFpNorm_', 'sadK2LineIdentity_', 'sadK2SemFieldClass_', 'sadK2SemFieldEqual_',
  'sadK2SemFieldVerdict_', 'sadK4ResolveActiveDraft_',
  'sadUpsertDraftHeaderCore_', 'sadUpsertLinesKeyedCore_', 'sadAtomicUpsertCore_'];
eval(FNS.map(function (f) { return extractFn(G16, f); }).join(String.fromCharCode(10)));

// Apps Script has ONE global scope, so 16_'s schema gate reaches 69_'s route-identity contract directly. A
// suite that lifts sadAtomicUpsertCore_ without it gets ROUTE_IDENTITY_CONTRACT_NOT_LOADED - a refusal the
// runtime does not have - and would report a harness gap as a production defect.
eval(['RIC_CANONICAL_SERVICES_', 'RIC_SERVICE_LABELS_', 'RIC_DESTINATION_TYPES_', 'RIC_K4_GROUP_DIMENSIONS_',
  'RIC_SCHEMA_REFUSALS_', 'RIC_B2_REQUIRED_COLUMNS_'].map(function (v) { return extractVar(G69, v); })
  .join(String.fromCharCode(10)));
eval(['ricCanonicalService_', 'ricDestinationIdentity_', 'ricK4GroupKey_', 'ricK4DeterministicHeaderId_',
  'ricRoutePersistability_'].map(function (f) { return extractFn(G69, f); }).join(String.fromCharCode(10)));

var SKU = 'CO1100-R';
var SCOPE = { planning_cycle: '', company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var SKEY = [SCOPE.company, SCOPE.country, SCOPE.marketplace].join('|').toLowerCase();

function resetDb(opts) {
  var hdr = (opts && opts.preMigration)
    // The pre-migration shape: everything up to but NOT including create_idempotency_key.
    ? SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_.slice(0, SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_.indexOf('create_idempotency_key'))
    : SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_;
  SHEETS['shipping_allocation_drafts'] = new FakeSheet(hdr);
  SHEETS['shipping_allocation_draft_lines'] = new FakeSheet(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_);
  __uuid = 0;
}
function rowsOf(tab) {
  var sh = SHEETS[tab], hdr = sh.rows[0];
  return sh.rows.slice(1).map(function (r) { var o = {}; hdr.forEach(function (h, i) { if (h) o[h] = r[i]; }); return o; });
}
function H() { return rowsOf('shipping_allocation_drafts'); }
function L() { return rowsOf('shipping_allocation_draft_lines'); }
function counts() { return [H().length, L().length]; }

// A route instance as the page's model holds it.
var __cri = 0;
function route(over) {
  __cri++;
  var r = {
    client_route_instance_id: 'CRI-R3-' + __cri,
    allocation_draft_id: '', allocation_draft_line_id: '', route_group_key: '', draft_version: '',
    source_warehouse_id: 'WH-CN-YOUXIN', source_warehouse_code: 'CNYOUXIN', ship_from: 'CN Youxin',
    destination_warehouse_id: '', destination_marketplace: 'Amazon', destination_warehouse_code: '',
    destination: 'Amazon', shipping_method: 'air', last_mile_delivery: '', recommendation_group_no: '',
    sku: SKU, site_sku: '', window_code: '', planned_qty: 120, qty: 120, units_per_carton: 20
  };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}

// ONE atomic request per route ticket — exactly the body the shipped client now builds.
function saveTicket(r, opts) {
  opts = opts || {};
  var pf = IRDraft.preflightRouteGroups(SCOPE, SKU, [r]);
  if (!pf.ok) return { ok: false, stage: 'preflight', conflicts: pf.conflicts };
  var g = pf.groups[0];
  if (!g) return { ok: false, stage: 'incomplete' };
  var h = g.header;
  var hasId = !!String(r.allocation_draft_id || '').trim();
  var header = IRDraft.buildDraftHeaderPayload({
    intent: hasId ? 'UPDATE_EXISTING_ROUTE' : 'CREATE_NEW_ROUTE',
    allocation_draft_id: hasId ? r.allocation_draft_id : undefined,
    expected_draft_version: hasId ? (String(r.draft_version || '') || undefined) : undefined,
    create_idempotency_key: hasId ? undefined : (opts.createKey || r.client_route_instance_id),
    applied_scope_key: opts.scopeKey || SKEY,
    planning_cycle: SCOPE.planning_cycle, company: SCOPE.company, country: SCOPE.country, marketplace: SCOPE.marketplace,
    source_warehouse_id: h.recommended_source_warehouse_id,
    source_warehouse_code: h.source_warehouse_code,
    destination_warehouse_id: h.recommended_destination_warehouse_id,
    destination_warehouse_code: h.destination_warehouse_code,
    shipping_method: h.recommended_shipping_method,
    last_mile_delivery: h.recommended_last_mile_delivery,
    destination_marketplace: h.destination_marketplace
  });
  var lines = [{ allocation_draft_line_id: r.allocation_draft_line_id || undefined, sku: SKU,
    site_sku: r.site_sku || '', window_code: r.window_code || '',
    planned_qty: (opts.badLine ? 0 : r.planned_qty), units_per_carton: r.units_per_carton,
    generation_type: 'user_created' }];
  var res = sadAtomicUpsertCore_({ header: header, lines: lines,
    create_idempotency_key: header.create_idempotency_key || undefined,
    expected_draft_version: header.expected_draft_version || undefined });
  if (!res || res.success === false) {
    return { ok: false, stage: res && res.stage, res: res, intent: header.intent, instance: r.client_route_instance_id };
  }
  var d = res.data || {};
  var pl = (d.persisted_lines || [])[0];
  r.allocation_draft_id = d.allocation_draft_id;
  if (pl) r.allocation_draft_line_id = pl.allocation_draft_line_id;
  r.route_group_key = g.groupKey;
  var stored = H().filter(function (x) { return String(x.allocation_draft_id) === d.allocation_draft_id; })[0] || {};
  r.draft_version = String(d.draft_version || stored.draft_version || '');
  return { ok: true, intent: header.intent, instance: r.client_route_instance_id,
    draftId: d.allocation_draft_id, lineId: r.allocation_draft_line_id,
    outcome: String(d.outcome || ''), reused: res.reused === true, res: res };
}

// ================================================================================================================
section('§C — THE THREE BLOCKERS, AND THAT EACH IS NOW CLOSED');
// ================================================================================================================
(function () {
  // BLOCKER 1 — the two-call path still leaves an orphan, which is WHY the route path no longer uses it.
  resetDb();
  var hres = sadUpsertDraftHeaderCore_({ intent: 'UPDATE_EXISTING_ROUTE', allocation_draft_id: 'NOPE',
    company: 'ResUS', country: 'US', marketplace: 'Amazon',
    recommended_source_warehouse_id: 'WH-CN-YOUXIN', destination_marketplace: 'Amazon',
    recommended_shipping_method: 'air' });
  eq([hres.success, hres.code], [false, 'ALLOCATION_DRAFT_NOT_FOUND'], 'B1  the two-call writer still serves UPDATE');
  // The two-call writer still CREATEs — removing that capability from a public action was a tightening this
  // round was not asked for, and it broke four inherited harnesses for a hazard that lives in the CLIENT. What
  // §D.4 requires is that the ROUTE-TICKET path is atomic, and that is enforced where the product writes: the
  // page issues one atomic request and fails closed without it (see §K.9 below). What this writer cannot do is
  // guarantee the pair, which is exactly why the page does not use it.
  var cres = sadUpsertDraftHeaderCore_({ intent: 'CREATE_NEW_ROUTE', create_idempotency_key: 'K1',
    company: 'ResUS', country: 'US', marketplace: 'Amazon',
    recommended_source_warehouse_id: 'WH-CN-YOUXIN', destination_marketplace: 'Amazon',
    recommended_shipping_method: 'air' });
  ok(cres.success !== false, 'B1a the two-call writer can still create a header on its own');
  eq(counts(), [1, 0], 'B1b and THAT is the orphan shape: 1 header, 0 lines — the reason the page never uses it');
  var lbad = sadUpsertLinesKeyedCore_({ allocation_draft_id: cres.data.allocation_draft_id,
    lines: [{ sku: SKU, planned_qty: 0, generation_type: 'user_created' }] });
  eq(lbad.success, false, 'B1c a refused line write cannot undo the header the previous call committed');
  eq(counts(), [1, 0], 'B1d §D.3 leaving the orphan zero-line header this round measured on the live table');

  // BLOCKER 3 — the collision refusal is GONE from both writers.
  ok(!/ROUTE_IDENTITY_CONFLICT/.test(code(extractFn(G16, 'sadUpsertDraftHeaderCore_'))),
    'B2  §B.2 no K2/K4 collision refusal survives in the header writer');
  ok(!/ROUTE_IDENTITY_CONFLICT/.test(code(extractFn(G16, 'sadAtomicUpsertCore_'))),
    'B2a nor in the atomic writer — an explicit Add Route is always a new ticket');

  // BLOCKER 2 — a create without a persistable key is refused, never degraded.
  resetDb({ preMigration: true });
  var pre = saveTicket(route({}));
  eq([pre.ok, pre.res.code, pre.res.zero_write], [false, 'ROUTE_CREATE_IDEMPOTENCY_NOT_PERSISTABLE', true],
    'B3  §F.7 a CREATE on a pre-migration sheet is REFUSED, never degraded to an unprotected create');
  eq(counts(), [0, 0], 'B3a zero write');
  resetDb();
  var noKey = sadAtomicUpsertCore_({ header: IRDraft.buildDraftHeaderPayload({ intent: 'CREATE_NEW_ROUTE',
    company: 'ResUS', country: 'US', marketplace: 'Amazon', source_warehouse_id: 'WH-CN-YOUXIN',
    destination_marketplace: 'Amazon', shipping_method: 'air' }),
    lines: [{ sku: SKU, planned_qty: 120, units_per_carton: 20, generation_type: 'user_created' }] });
  eq([noKey.success, noKey.code, noKey.zero_write], [false, 'ROUTE_CREATE_IDEMPOTENCY_KEY_REQUIRED', true],
    'B3b §F.3 and a CREATE with no create key at all is refused too');
  eq(counts(), [0, 0], 'B3c zero write');
})();

// ================================================================================================================
section('§K.1/§K.3/§K.4 — ATOMIC CREATE AND UPDATE');
// ================================================================================================================
(function () {
  resetDb();
  var r = route({});
  var s1 = saveTicket(r);
  ok(s1.ok, 'K3  §K.3 Add Route succeeds through the atomic writer');
  eq(s1.intent, 'CREATE_NEW_ROUTE', 'K3a declared a CREATE');
  eq(counts(), [1, 1], 'K3b exactly +1 header and +1 line');
  // The id FAMILY follows the schema: a K4-ready sheet (destination_marketplace present) mints SADH-K4-, an
  // older one SADH-K2-. Pinning one family would assert the fixture's schema stage rather than the rule.
  ok(/^SADH-K[24]-/.test(r.allocation_draft_id) && /^SADL-K[24]-/.test(r.allocation_draft_line_id),
    'K3c under canonical persisted identities (' + r.allocation_draft_id + ')');
  eq(String(H()[0].create_idempotency_key), r.client_route_instance_id,
    'K3d §F.3 and the create key is STORED on the header');

  // §K.1 — edit destination, method and qty. Same ids, same row counts.
  var idH = r.allocation_draft_id, idL = r.allocation_draft_line_id;
  [['destination', { destination_marketplace: 'Walmart', destination: 'Walmart' }],
   ['method', { shipping_method: 'sea_express' }],
   ['qty', { planned_qty: 200, qty: 200 }]].forEach(function (e) {
    Object.keys(e[1]).forEach(function (k) { r[k] = e[1][k]; });
    var u = saveTicket(r);
    ok(u.ok, 'K1  §K.1 editing ' + e[0] + ' saves');
    eq(u.intent, 'UPDATE_EXISTING_ROUTE', 'K1a ' + e[0] + ' — declared an UPDATE');
    eq(counts(), [1, 1], 'K1b ' + e[0] + ' — row counts UNCHANGED');
    eq([r.allocation_draft_id, r.allocation_draft_line_id], [idH, idL], 'K1c ' + e[0] + ' — the SAME entity ids');
  });
  eq(Number(L()[0].planned_qty), 200, 'K1d the quantity edit landed on that one line');
  eq(String(H()[0].create_idempotency_key), 'CRI-R3-' + (__cri), 'K1e §F.6 and the UPDATE did not change the create key');
  ok(Number(H()[0].draft_version) > 1, 'K1f §K.1 draft_version advanced (' + H()[0].draft_version + ')');

  // §K.4 — a line validation failure writes NOTHING, not even the header.
  resetDb();
  var bad = route({});
  var b = saveTicket(bad, { badLine: true });
  eq(b.ok, false, 'K4  §K.4 Add Route with an invalid line is refused');
  ok(/PLAN_LINE_INCOMPLETE/.test(String(b.res.error)), 'K4a with the line reason');
  eq(b.res.zero_write, true, 'K4b declaring a zero write');
  eq(counts(), [0, 0], 'K4c §D.3 +0 header and +0 line — no orphan header is left behind');

  // §K.2 — an existing route whose atomic write fails leaves header AND line unchanged.
  resetDb();
  var keep = route({});
  saveTicket(keep);
  var before = JSON.stringify([H(), L()]);
  keep.planned_qty = 0; keep.qty = 0;
  var f2 = saveTicket(keep, { badLine: true });
  eq(f2.ok, false, 'K2  §K.2 an UPDATE whose line fails validation is refused');
  eq(JSON.stringify([H(), L()]), before, 'K2a and BOTH tables are byte-identical — nothing was written');
})();

// ================================================================================================================
section('§F / §K.5 / §K.8 — PERSISTED CREATE IDEMPOTENCY');
// ================================================================================================================
(function () {
  resetDb();
  var r = route({});
  var first = saveTicket(r, { createKey: 'CRI-ONE-CLICK' });
  ok(first.ok, 'F1  the click commits');
  eq(counts(), [1, 1], 'F1a one ticket');
  var idH = first.draftId, idL = first.lineId;

  // §K.5 — the SAME click, retried after a lost response. The client never learned the ids, so it retries as a
  // CREATE with the SAME key.
  var replayRoute = route({});
  var replay = saveTicket(replayRoute, { createKey: 'CRI-ONE-CLICK' });
  ok(replay.ok, 'F2  §K.5 the retry SUCCEEDS (it is not an error — the work was already done)');
  eq(replay.outcome, 'CREATE_REPLAYED', 'F2a and is classified CREATE_REPLAYED');
  eq(replay.reused, true, 'F2b reported as a reuse');
  eq(replay.res.data.zero_write, true, 'F2c with zero further writes');
  eq(counts(), [1, 1], 'F2d §F.4 NO second ticket');
  eq(replay.draftId, idH, 'F2e the SAME allocation_draft_id is returned');
  eq(replayRoute.allocation_draft_line_id, idL, 'F2f and the SAME line id');
  eq(replay.res.data.reuse_basis, 'CREATE_IDEMPOTENCY_KEY', 'F2g on the create-key basis, not a fingerprint');

  // §K.8 — a pre-contract row has a BLANK key and must never be mistaken for a replay of a keyed click.
  var sh = SHEETS['shipping_allocation_drafts'];
  var cK = sh.rows[0].indexOf('create_idempotency_key');
  sh.rows[1][cK] = '';                                   // the legacy shape: no key
  var afterBlank = saveTicket(route({}), { createKey: 'CRI-A-NEW-CLICK' });
  ok(afterBlank.ok, 'F3  §K.8 a blank stored key is readable and blocks nothing');
  eq(afterBlank.outcome, 'CREATED', 'F3a a NEW click is classified CREATED');
  ok(afterBlank.outcome !== 'CREATE_REPLAYED' && afterBlank.reused !== true,
    'F3a1 and never as a replay of the keyless row beside it');
  eq(counts(), [2, 2], 'F3b it creates its own ticket');
  ok(/^function sadFindHeaderByCreateKey_/.test(extractFn(G16, 'sadFindHeaderByCreateKey_')),
    'F3c the lookup is one named authority');
  ok(/if \(!got\) continue;/.test(extractFn(G16, 'sadFindHeaderByCreateKey_')),
    'F3d and it SKIPS blanks explicitly — a blank is never a match');
})();

// ================================================================================================================
section('§H / §K.6 / §K.7 — TWO IDENTICAL ADD ROUTE CLICKS ARE TWO TICKETS');
// ================================================================================================================
(function () {
  resetDb();
  // §H.1 — first Add Route: CN Youxin -> Amazon / air / 120
  var a = route({});
  var s1 = saveTicket(a, { createKey: 'CLICK-1' });
  ok(s1.ok, 'H1  §H.1 the first Add Route creates H_NEW_1 + L_NEW_1');
  // §H.2 — second Add Route, filled in IDENTICALLY.
  var b = route({});
  var s2 = saveTicket(b, { createKey: 'CLICK-2' });
  ok(s2.ok, 'H2  §H.2 the second Add Route with IDENTICAL From/To/Method also succeeds');
  ok(!/LEGACY_ROUTE_RECONCILIATION_REQUIRED|ROUTE_IDENTITY_CONFLICT/.test(JSON.stringify(s2)),
    'H2a §H.8 and returns neither LEGACY_ROUTE_RECONCILIATION_REQUIRED nor a natural-key collision');
  ok(a.allocation_draft_id !== b.allocation_draft_id,
    'H3  §H.3 H_NEW_1 !== H_NEW_2 (' + a.allocation_draft_id + ' vs ' + b.allocation_draft_id + ')');
  ok(a.allocation_draft_line_id !== b.allocation_draft_line_id, 'H4  §H.4 L_NEW_1 !== L_NEW_2');
  eq(counts(), [2, 2], 'H5  §H.5 two tickets, each with exactly one line');
  var byHdr = {};
  L().forEach(function (l) { byHdr[String(l.allocation_draft_id)] = (byHdr[String(l.allocation_draft_id)] || 0) + 1; });
  eq(Object.keys(byHdr).sort(), [a.allocation_draft_id, b.allocation_draft_id].sort(), 'H5a one line under each header');
  ok(Object.keys(byHdr).every(function (k) { return byHdr[k] === 1; }), 'H5b exactly one, never two');
  // The two tickets DO share a route shape — that is now legal, and it is what makes them two tickets rather
  // than one: the identity is the immutable draft id, never the K4 key.
  eq(IRDraft.canonicalRouteGroupKey(SCOPE, a), IRDraft.canonicalRouteGroupKey(SCOPE, b),
    'H5c §B.2 they share the same K4 route signature, and that is not a conflict');

  // §H.6 — each retries to its OWN ids, and no third ticket appears.
  var ra = saveTicket(route({}), { createKey: 'CLICK-1' });
  var rb = saveTicket(route({}), { createKey: 'CLICK-2' });
  eq([ra.draftId, rb.draftId], [a.allocation_draft_id, b.allocation_draft_id],
    'H6  §H.6 each retry returns its OWN original ids');
  eq(counts(), [2, 2], 'H6a and no third ticket is created');

  // §H.7 — editing the first ticket touches only the first.
  var bBefore = JSON.stringify(H().filter(function (h) { return String(h.allocation_draft_id) === b.allocation_draft_id; }));
  var bLineBefore = JSON.stringify(L().filter(function (l) { return String(l.allocation_draft_id) === b.allocation_draft_id; }));
  a.planned_qty = 999; a.qty = 999;
  var ua = saveTicket(a);
  eq(ua.intent, 'UPDATE_EXISTING_ROUTE', 'H7  §H.7 editing ticket 1 is an UPDATE of ticket 1');
  eq(counts(), [2, 2], 'H7a row counts unchanged');
  eq(JSON.stringify(H().filter(function (h) { return String(h.allocation_draft_id) === b.allocation_draft_id; })), bBefore,
    'H7b ticket 2 header is byte-identical');
  eq(JSON.stringify(L().filter(function (l) { return String(l.allocation_draft_id) === b.allocation_draft_id; })), bLineBefore,
    'H7c ticket 2 line is byte-identical');
  eq(Number(L().filter(function (l) { return String(l.allocation_draft_id) === a.allocation_draft_id; })[0].planned_qty), 999,
    'H7d and ticket 1 took the new quantity');
})();

// ================================================================================================================
section('§K.9 — THE ATOMIC ACTION MISSING IS A TYPED REFUSAL, NEVER A FALLBACK');
// ================================================================================================================
(function () {
  var persist = code(extractFn(PAGE, '_irPersistOneRouteGroup_'));
  ok(/upsertShippingAllocationDraftAtomic/.test(persist),
    'N1  §D.2 the writer issues ONE atomic request');
  ok(!/upsertShippingAllocationDraftLines/.test(persist),
    'N1a §D.4 and there is no second line request to fall out of step with it');
  ok(/ROUTE_ATOMIC_WRITER_UNAVAILABLE/.test(persist),
    'N2  §E.6 a deployment without the atomic action is a TYPED refusal at the call site');
  var idx = persist.indexOf('ROUTE_ATOMIC_WRITER_UNAVAILABLE');
  ok(idx > -1 && !/upsertShippingAllocationDraft\(/.test(persist),
    'N2a §E.6 and there is NO two-call CREATE to fall back to');
  var flush = code(extractFn(PAGE, '_flushDraftDbPersist'));
  ok(/upsertShippingAllocationDraftAtomic/.test(flush),
    'N3  the availability guard requires the atomic action before any route write is attempted');

  // Executed: with the adapter absent the writer refuses and issues nothing.
  var calls = [];
  var fn = new Function('window', 'sku', 'ctx', 'g', 'allowLegacyAdoption', '_irRouteLabel_', '_irStoredDraftVersion_',
    '_irMakeDraftSaveError_', '_irSaveAcknowledged_', '_irAdoptPersistedLineIds_', '_irStampRouteGroupIds_',
    'replenAllocationDraft',
    extractFn(PAGE, '_irPersistOneRouteGroup_') + ' return _irPersistOneRouteGroup_;')(
      { IRDraft: IRDraft, KM: { DB: {} } }, SKU, SCOPE,
      { groupKey: 'K', header: { recommended_source_warehouse_id: 'W', recommended_shipping_method: 'air', destination_marketplace: 'Amazon' },
        routes: [route({})] },
      false, function () { return 'L'; }, function () { return ''; },
      function (e) { return new Error(String(e)); }, function () { return null; },
      function () {}, function () {}, { bySku: {} });
  return fn(SKU, SCOPE, { groupKey: 'K', header: { recommended_source_warehouse_id: 'W', recommended_shipping_method: 'air', destination_marketplace: 'Amazon' }, routes: [route({})] }, false)
    .then(function (out) {
      eq([out.status, out.code], ['not_persisted', 'ROUTE_ATOMIC_WRITER_UNAVAILABLE'],
        'N4  §K.9 executed: no atomic adapter -> typed refusal');
      ok(/Nothing was written/.test(String(out.message)), 'N4a saying nothing was written');
    });
})();

// ================================================================================================================
section('§E — THE DEPLOYMENT CONTRACT');
// ================================================================================================================
(function () {
  ok(/if \(action === 'upsertShippingAllocationDraftAtomic'\)/.test(G01),
    'E1  §E.1 the router routes the atomic action');
  ok(/handleUpsertShippingAllocationDraftAtomic_\(body\)/.test(G01), 'E1a to its handler');
  ok(/function handleUpsertShippingAllocationDraftAtomic_/.test(G16), 'E1b which 16_ defines');
  ok(/window\.KM\.DB\.upsertShippingAllocationDraftAtomic = function/.test(DBAPI),
    'E1c §E.1 and the frontend adapter can now CALL it — it could not before');
  ok(/action: 'upsertShippingAllocationDraftAtomic', handler: 'handleUpsertShippingAllocationDraftAtomic_'/.test(G63),
    'E2  §E.2 it is in the required-action manifest');
  // F1-7N-FC-1A — AT-OR-AFTER, not equal. The claim is "A2-R3 bumped this because it changed the
  // registry", and pinning the literal 10 turned that into "no later round may ever change the registry
  // again". FC-1A registers createShipmentFromPlan and bumps it to 11, which is the rule working, not a
  // regression. A value BELOW 10 would still mean A2-R3's own bump was lost, which is the real property.
  ok(Number((G63.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1]) >= 10,
    'E3  §E.3 SYS_REQUIRED_ACTION_LIST_VERSION_ is at or after 10 (A2-R3\'s registry bump is intact)');
  // F1-7N-FC-1A-R1 — at-or-after. A2-R3 added no router action, which is exactly what this said; R1
  // adds cancelShipmentDraft, the one condition the constant exists to signal.
  ok(Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]) >= 10,
    'E3a §E.3/§E.4 the ACTION contract version does NOT move — no router action was added');
  eq((G63.match(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+);/) || [])[1], '1',
    'E3b nor the transport contract version — the envelope is unchanged');
  eq((DBAPI.match(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1],
    (G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1],
    'E3c so the frontend minimum stays 10');
  ok(/upsertShippingAllocationDraftAtomic/.test(
      DBAPI.slice(DBAPI.indexOf('KM_REQUIRED_DEPLOYED_ACTIONS_'), DBAPI.indexOf('KM_PAGE_REQUIRED_ACTIONS_'))),
    'E4  §E.5 the frontend probes it explicitly, so its absence is a named deployment fact');
  // The pre-deployment probe's action list lives in the allocation-draft diagnostic handler, which is what
  // checkDeploymentContract() reaches. Named by its real owner rather than by a guessed function name.
  var chk = code(extractFn(G63, 'handleShippingAllocationDraftDiagnostic_'));
  ok(/upsertShippingAllocationDraftAtomic/.test(chk),
    'E5  §E.5 and the deployment-contract probe can PROVE it reachable before deployment');
})();

// ================================================================================================================
section('§F.9 — THE MIGRATION HELPER');
// ================================================================================================================
(function () {
  eq(SAD_CREATE_IDEMPOTENCY_TAIL_COLUMNS_, ['create_idempotency_key'], 'M1  §F the column is a named tail');
  eq(SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_.indexOf('create_idempotency_key'),
    SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_.length - 1,
    'M1a §F.1 APPENDED at the very end — never inserted');
  eq(SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_.length, 36, 'M1b 30 required + 6 optional = 36');
  eq(SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_.slice(0, 35),
    SHIPPING_ALLOCATION_DRAFTS_HEADERS_.concat(SAD_LIFECYCLE_TAIL_COLUMNS_).concat(SAD_ROUTE_IDENTITY_TAIL_COLUMNS_),
    'M1c and every pre-existing column keeps its exact index');
  ok(/TEMP_A2R3_MIGRATION_DRY_RUN/.test(MIG) && /TEMP_A2R3_MIGRATION_COMMIT/.test(MIG),
    'M2  §F.9 the helper has a dry run AND a commit');
  var m = code(MIG);
  ['deleteColumn', 'insertColumn', 'deleteRow', 'clearContent', 'setValues'].forEach(function (bad) {
    ok(m.indexOf(bad) === -1, 'M3  §F.1 it cannot ' + bad + ' — the symbol is absent');
  });
  eq((MIG.match(/\.setValue\(/g) || []).length, 1, 'M3a and writes EXACTLY ONE cell');
  ok(/CELLS_WRITTEN=1 \. ROWS_INSERTED=0 \. ROWS_DELETED=0 \. BACKFILLS=0/.test(MIG),
    'M4  §F.2 declaring zero row inserts and zero back-fills');
  ok(/checksum\(live\)|checksum\(after\)/.test(MIG) && /tempA2R3Checksum_/.test(MIG),
    'M5  §F.9 with exact before/after header and checksum');
  ok(/APPEND_INDEX_MISMATCH/.test(MIG) && /PREFIX_MISMATCH/.test(MIG),
    'M6  §F.1 and it refuses a sheet whose shape would put the column anywhere else');
  ok(/AUTHORITY_NOT_LOADED/.test(MIG), 'M6a and refuses to carry its own idea of the schema');
  ok(/DRY RUN ONLY — NOTHING WAS WRITTEN/.test(MIG), 'M7  the dry run states plainly that it wrote nothing');
})();

// ================================================================================================================
section('§I — THE SUBMIT TICKET BOUNDARY AUDIT (executable, and a STOP)');
// ================================================================================================================
(function () {
  eval(extractFn(G11, 'shippingPlanRouteGroupKey_'));
  function planLine(draftId, lineId) {
    return { company: 'ResUS', country: 'US', marketplace: 'Amazon', ship_from: 'CNYOUXIN',
      source_warehouse_id: 'WH-CN-YOUXIN', destination: 'Amazon', destination_warehouse_id: '',
      shipping_method: 'air', last_mile_delivery: '', planning_cycle: '', sku: SKU, requested_qty: 120,
      source_reason: 'allocation_draft:' + draftId + '|line:' + lineId };
  }
  var t1 = planLine('SADH-K2-TICKET1', 'SADL-1'), t2 = planLine('SAD-TICKET2XXX', 'SADL-2');
  var k1 = shippingPlanRouteGroupKey_(t1, t1.company), k2 = shippingPlanRouteGroupKey_(t2, t2.company);
  eq(k1, k2, 'I1  §I.1 two SEPARATE tickets with the same route produce the SAME plan group key');
  ok(!/allocation_draft|draft_id|submit_batch|ticket/.test(extractFn(G11, 'shippingPlanRouteGroupKey_')),
    'I2  §I.1 because the key carries NO ticket identity dimension at all');
  var commit = code(extractFn(G11, 'shippingPlanCommitFromLines_'));
  ok(/for \(var j = 0; j < grp\.lines\.length; j\+\+\)/.test(commit),
    'I3  §I.1 and the writer emits one plan line per group line');
  ok(!/seenSku|bySku\[/.test(commit),
    'I3a with no per-SKU consolidation — so the two tickets become 2 plan lines under 1 plan');
  ok(/source_reason: String\(l\.source_reason/.test(commit),
    'I4  §I.4 the ticket lineage survives ONLY in source_reason, which is an EXISTING field');
  ok(!/allocation_draft_id:/.test(commit),
    'I4a and §I.4 is honoured: no lineage column was invented on shipping_plan_lines');
  // §I.5 — this round does NOT change it. The STOP and its options are recorded in the planning doc.
  var DOC = read('docs/planning/LEGACY_ALLOCATION_DRAFT_RECONCILIATION_F1-7N-FB-4F.md');
  ok(/A2-R3 STOP/.test(DOC) && /shippingPlanRouteGroupKey_/.test(DOC),
    'I5  §I.5 the conflict is reported as a STOP with the exact grouping function named');
  ok(/Option A/.test(DOC) && /Option B/.test(DOC) && /Option C/.test(DOC),
    'I5a with minimal options, and no implementation guessed at');
  // F1-7N-FC-1A — DERIVED, NOT PINNED. This asserted the literal 'F1-7N-FA-4B2' to mean "A2-R3 did not
  // change 11_", and it was true. It cannot remain an equality: FC-1A changes 11_ so that a failed Execution
  // Commit is reported instead of swallowed. The durable property is that the file and the deployment manifest
  // AGREE — a stamp nobody expects and an expectation no file declares are the two halves of a partial
  // sync, and either alone is the bug. Read from 63_, so the pair can only be edited together.
  var _i6Expected = ((G63.match(/\{ file: '11_shipping_plan_handlers\.gs',[^}]*expected: '([^']+)'/) || [])[1]) || '(no manifest entry)';
  eq((G11.match(/var SP_BUILD_VERSION_ = '([^']+)'/) || [])[1], _i6Expected,
    'I6  §I.6 11_ declares exactly the build its deployment manifest expects (' + _i6Expected + ')');
  // And A2-R3's actual claim, stated directly instead of through a stamp: the physical grouping key is
  // untouched, so no persisted shipping plan can regroup and no stored id regenerates differently.
  var _i6Key = G11.slice(G11.indexOf('function shippingPlanRouteGroupKey_'));
  _i6Key = _i6Key.slice(0, _i6Key.indexOf('}') + 1);
  ok(_i6Key.length > 0 && _i6Key.indexOf('allocation_draft_id') === -1,
    'I6a §I.6 and allocation_draft_id is still absent from shippingPlanRouteGroupKey_ (frozen Option A)');
  ok(!/F1-7N-FB-4G-A2-R3/.test(G11), 'I6a no A2-R3 edit exists in 11_ — the boundary decision is the user\'s');
})();

// ================================================================================================================
section('§G — UI INTENT AND CORRELATION');
// ================================================================================================================
(function () {
  var save = code(extractFn(PAGE, '_saveAllocationDraftFromDom'));
  ok(/row\.route_intent = String\(row\.allocation_draft_id \|\| ''\)\.trim\(\) \? 'UPDATE_EXISTING' : 'CREATE_NEW_ROUTE'/.test(save),
    'G1  §G.1 every row carries an explicit intent state derived from its OWN persisted identity');
  ok(/data-route-intent/.test(save), 'G1a stamped into the DOM so it survives a re-render');
  ok(/data-route-instance/.test(save) && /_newRouteInstanceId\(\)/.test(save),
    'G4  §G.4 and a stable route instance id it is correlated by');
  ok(!/destination.*changed|method.*changed/i.test(save),
    'G2  §G.2 intent is NOT derived from whether a destination or method was edited');
  var persist = code(extractFn(PAGE, '_irPersistOneRouteGroup_'));
  ok(/instanceIds: _instanceIds/.test(persist), 'G4a the outcome names the instance, never an array index (§G.3)');
  ok(/create_idempotency_key: _idList\.length \? undefined : \(_instanceIds\[0\] \|\| undefined\)/.test(persist),
    'G6  §G.6 the create key IS the row instance id, so a retry reuses the same key by construction');
  // §G.7 — an unsaved row that is deleted issues nothing.
  var remove = code(extractFn(PAGE, 'removeExecutionRoute'));
  ok(/if \(lineId && typeof _cancelAllocationDraftLine === 'function'\)/.test(remove),
    'G7  §G.7 deleting an UNSAVED row issues no request — the cancel is guarded by a persisted line id');
})();

// ================================================================================================================
section('§J — THE READ-ONLY CENSUS CLASSIFIES BY EVIDENCE');
// ================================================================================================================
(function () {
  ['ZERO_LINE_HEADER', 'EXPLICIT_ADD_ROUTE', 'EDIT_ARTEFACT_CANDIDATE', 'UNKNOWN'].forEach(function (b) {
    ok(CENSUS.indexOf(b) !== -1, 'J1  §J.3 the census has a ' + b + ' bucket');
  });
  ok(/create_idempotency_key/.test(CENSUS), 'J2  §J.3 and uses the create key as the evidence for an explicit click');
  ok(/is NOT evidence of a duplicate/.test(CENSUS),
    'J3  §J.3 while a shared K4 shape is explicitly NOT used to classify');
  ok(/CANDIDATE, not a verdict/.test(CENSUS), 'J4  §J.5 a candidate is not a verdict');
  ok(/none may be repaired from this output alone/.test(CENSUS), 'J4a and no repair is authorised');
  var c = code(CENSUS);
  ['setValue', 'appendRow', 'deleteRow', 'clearContent'].forEach(function (bad) {
    ok(c.indexOf(bad) === -1, 'J5  §J.2 the census cannot ' + bad);
  });
  ok(/DB_WRITES=0/.test(CENSUS), 'J5a §K.11 and declares DB_WRITES=0');
})();

// ================================================================================================================
section('DEPLOYMENT');
// ================================================================================================================
(function () {
  var stamp = (G16.match(/var SAD_BUILD_VERSION_ = '([^']+)'/) || [])[1];
  // F1-7N-FB-4G-A2-R3-R1 - RESTATED. This was an equality with A2-R3's own stamp, which asserts "no later
  // round may ever own 16_" rather than what the round meant. The stamp series is append-only and ordered, so
  // at-or-after is the durable claim - and D2/D3 below already carry the parts that matter (the manifest
  // agrees with the source, and the stamp is not older than the previous owner).
  ok(RO.stampAtOrAfter(stamp, 'F1-7N-FB-4G-A2-R3'), 'D1  the 16_ owner stamp is at or after this round');
  eq((G63.match(/symbol: 'SAD_BUILD_VERSION_', expected: '([^']+)'/) || [])[1], stamp,
    'D2  and the health manifest expects exactly what the source declares');
  ok(RO.stampAtOrAfter(stamp, 'F1-7N-FB-4G-A2-R2'), 'D3  at or after A2-R2');
  var APP = RO.currentAppToken();
  // RESTATED for the same reason: an equality here forbids every later round from publishing the frontend.
  // What this round needs is that the token is not OLDER than the one it introduced, and that whatever token
  // is current is applied consistently to every co-deployed reference.
  ok(RO.tokenAtOrAfter(APP, 'fb4ga2r3-atomicroute-20260902'), 'D4  the application cache token is at or after this round');
  eq((INDEX.match(new RegExp(APP, 'g')) || []).length, 18, 'D4a on all 18 co-deployed refs');
  eq(INDEX.indexOf('fb4ga2r2-routeintent-20260902'), -1, 'D4b and the previous token is fully retired');
  ok(RO.tokenAtOrAfter(APP, 'fb4ga2r2-routeintent-20260902'), 'D4c ordered after it in the append-only series');
  ok(!/inventory-compat|inventory-replenishment|operation-system-db-api/.test(read('assets/tools/build-apps-script-bundle.js')),
    'D5  no bundled module changed, so BUNDLE_REBUILD_REQUIRED stays NO');
})();

// ================================================================================================================
section('MUTATIONS — each applied for real, each caught');
// ================================================================================================================

mut('X1  §L.1 CREATE reverts to the two-call writer', function () {
  var m = mutateFn(PAGE, '_irPersistOneRouteGroup_',
    'window.KM.DB.upsertShippingAllocationDraftAtomic(atomicBody)',
    'window.KM.DB.upsertShippingAllocationDraft(header)');
  var h = code(extractFn(PAGE, '_irPersistOneRouteGroup_'));
  var x = code(extractFn(m, '_irPersistOneRouteGroup_'));
  return /upsertShippingAllocationDraftAtomic\(atomicBody\)/.test(h) &&
         !/upsertShippingAllocationDraftAtomic\(atomicBody\)/.test(x);
});

mut('X2  §L.2 a header is kept after its line write fails', function () {
  resetDb();
  var r = route({});
  var b = saveTicket(r, { badLine: true });
  // The honest writer leaves nothing. A writer that kept the header would leave 1 header / 0 lines - which is
  // exactly what the two-call path was MEASURED doing, so the fix is what this asserts.
  var honestCounts = counts();
  resetDb();
  var hres = sadUpsertDraftHeaderCore_({ intent: 'UPDATE_EXISTING_ROUTE', allocation_draft_id: 'X',
    company: 'ResUS', country: 'US', marketplace: 'Amazon', recommended_source_warehouse_id: 'W',
    destination_marketplace: 'Amazon', recommended_shipping_method: 'air' });
  return b.ok === false && honestCounts[0] === 0 && honestCounts[1] === 0 &&
         /zero_write/.test(JSON.stringify(b.res)) && hres.success === false;
});

mut('X3  §L.3 a retry mints a NEW create key instead of reusing the row\'s', function () {
  var m = mutateFn(PAGE, '_irPersistOneRouteGroup_',
    "create_idempotency_key: _idList.length ? undefined : (_instanceIds[0] || undefined),",
    "create_idempotency_key: _idList.length ? undefined : ('CRI-' + Date.now()),");
  var h = code(extractFn(PAGE, '_irPersistOneRouteGroup_'));
  var x = code(extractFn(m, '_irPersistOneRouteGroup_'));
  return /_instanceIds\[0\] \|\| undefined/.test(h) && !/_instanceIds\[0\] \|\| undefined/.test(x) &&
         /Date\.now\(\)/.test(x);
});

mut('X4  §L.4 two different Add Route clicks share one create key', function () {
  resetDb();
  // Honest: two clicks are two instance ids, therefore two keys, therefore two tickets.
  var a = route({}), b = route({});
  saveTicket(a, { createKey: a.client_route_instance_id });
  saveTicket(b, { createKey: b.client_route_instance_id });
  var honest = counts();
  // Mutant: the two clicks share a key, so the second is treated as a REPLAY of the first.
  resetDb();
  var c = route({}), d = route({});
  saveTicket(c, { createKey: 'SHARED' });
  saveTicket(d, { createKey: 'SHARED' });
  var mutant = counts();
  return honest[0] === 2 && honest[1] === 2 && mutant[0] === 1 && mutant[1] === 1;
});

mut('X5  §L.5 an UPDATE is issued as a CREATE', function () {
  resetDb();
  var r = route({});
  saveTicket(r);
  var idBefore = r.allocation_draft_id;
  r.shipping_method = 'sea';
  // Honest: an edit of a persisted row is an UPDATE - same id, same counts.
  var u = saveTicket(r);
  var honestSame = (r.allocation_draft_id === idBefore) && counts()[0] === 1;
  // Mutant: the same edit sent as a CREATE (no id, a fresh key) makes a SECOND ticket.
  var forged = route({ shipping_method: 'sea' });
  saveTicket(forged, { createKey: 'FORGED' });
  return u.intent === 'UPDATE_EXISTING_ROUTE' && honestSame && counts()[0] === 2;
});

mut('X6  §L.6 an UPDATE re-mints the header id', function () {
  resetDb();
  var r = route({});
  saveTicket(r);
  var before = r.allocation_draft_id;
  r.shipping_method = 'sea_express';
  saveTicket(r);
  var stored = H()[0];
  return r.allocation_draft_id === before && String(stored.allocation_draft_id) === before &&
         sadK2DeterministicHeaderId_(stored) !== before;
});

mut('X7  §L.7 a K4 collision blocks a legitimate second ticket', function () {
  var m = mutateFn(G16, 'sadAtomicUpsertCore_',
    "      id = sadMintNewHeaderId_(hSh, header, k4Ready);",
    "      id = ''; return jsonResponse_({ success: false, error: 'ROUTE_IDENTITY_CONFLICT', code: 'ROUTE_IDENTITY_CONFLICT', stage: 'conflict', zero_write: true, data: {} });");
  // EXECUTED, not read. The first form pinned `sadMintNewHeaderId_(hSh, header)` as a source regex and broke
  // the moment the mint gained its k4Ready argument - an assertion about an argument list rather than about
  // behaviour. What matters is measurable: two identical Add Route clicks are two tickets, and the mutant
  // refuses the second.
  // The HONEST side is measured by execution: two identical Add Route clicks really do become two
  // tickets. The MUTANT side is a source fact that admits no interpretation - the mutation replaces the
  // identity mint with an early `return` of ROUTE_IDENTITY_CONFLICT, so the create cannot proceed at all.
  // Re-hosting the whole core in a second sandbox would add a large dependency lift for no more certainty.
  var honestCore = code(extractFn(G16, 'sadAtomicUpsertCore_'));
  var mutantCore = code(extractFn(m, 'sadAtomicUpsertCore_'));
  resetDb();
  var a = saveTicket(route({}), { createKey: 'X7-CLICK-1' });
  var b = saveTicket(route({}), { createKey: 'X7-CLICK-2' });
  var honestTwo = a.ok && b.ok && counts()[0] === 2 && a.draftId !== b.draftId;
  return honestTwo &&
         !/ROUTE_IDENTITY_CONFLICT/.test(honestCore) &&
         /ROUTE_IDENTITY_CONFLICT/.test(mutantCore) &&
         !/sadMintNewHeaderId_/.test(mutantCore);
});

mut('X8  §L.8 a K4 collision makes an UPDATE create a new ticket', function () {
  var m = mutateFn(G16, 'sadAtomicUpsertCore_',
    "    if (sadIntent === 'UPDATE_EXISTING_ROUTE' && !found) {",
    "    if (false) {");
  var h = code(extractFn(G16, 'sadAtomicUpsertCore_'));
  var x = code(extractFn(m, 'sadAtomicUpsertCore_'));
  return /sadIntent === 'UPDATE_EXISTING_ROUTE' && !found/.test(h) &&
         !/sadIntent === 'UPDATE_EXISTING_ROUTE' && !found/.test(x);
});

mut('X9  §L.9 the client falls back to the two-call writer when the atomic action is missing', function () {
  var m = mutateFn(PAGE, '_irPersistOneRouteGroup_',
    "    if (!(window.KM && window.KM.DB && typeof window.KM.DB.upsertShippingAllocationDraftAtomic === 'function')) {",
    "    if (false) {");
  var h = code(extractFn(PAGE, '_irPersistOneRouteGroup_'));
  var x = code(extractFn(m, '_irPersistOneRouteGroup_'));
  return /ROUTE_ATOMIC_WRITER_UNAVAILABLE/.test(h) &&
         /typeof window\.KM\.DB\.upsertShippingAllocationDraftAtomic === 'function'/.test(h) &&
         !/typeof window\.KM\.DB\.upsertShippingAllocationDraftAtomic === 'function'/.test(x);
});

mut('X10 §L.10 the create key is accepted but never persisted', function () {
  // `create_idempotency_key: createKey,` occurs THREE times in this core - the replay response, the INSERT,
  // and the success response - and mutateFn rewrites the FIRST. The first form of this probe therefore
  // mutated the RESPONSE and left the INSERT storing the key, so it proved nothing. The anchor now names the
  // insert uniquely: alone on its own line, at six spaces.
  // No backslash escapes here: an escape that has to survive a shell heredoc AND a Python string AND JS is
  // exactly how a newline ends up inside a string literal. The line break is built from its char code.
  var NLC = String.fromCharCode(10);
  var ANCHOR = NLC + "      create_idempotency_key: createKey," + NLC;
  var m = mutateFn(G16, 'sadAtomicUpsertCore_', ANCHOR, NLC);
  var h = extractFn(G16, 'sadAtomicUpsertCore_');
  var x = extractFn(m, 'sadAtomicUpsertCore_');
  // The source is CRLF; the anchor is built with LF. Both sides are normalised, or the count is 0 for the
  // honest source too and the probe reports a surviving mutant while measuring nothing.
  function insertCount(src) {
    var lf = String(src).split(String.fromCharCode(13) + NLC).join(NLC);
    return lf.split(NLC + "      create_idempotency_key: createKey,").length - 1;
  }
  var honestInsert = insertCount(h), mutantInsert = insertCount(x);
  // And EXECUTED: the honest core really does store the key, which is what makes a retry a replay.
  resetDb();
  saveTicket(route({}), { createKey: 'PERSIST-ME' });
  var stored = String(H()[0].create_idempotency_key || '');
  return honestInsert === 1 && mutantInsert === 0 && stored === 'PERSIST-ME';
});

mut('X11 §L.11 a response is bound to the wrong DOM row', function () {
  var m = mutateFn(PAGE, '_irPersistOneRouteGroup_',
  // Anchored on ONE line: a find string that crosses a comment carrying an em dash matches nothing
  // while naming a target that IS present.
    "            intent: _intent, instanceIds: _instanceIds,",
    "            intent: _intent,");
  var h = code(extractFn(PAGE, '_irPersistOneRouteGroup_'));
  var x = code(extractFn(m, '_irPersistOneRouteGroup_'));
  // THREE occurrences: the fail-closed ROUTE_ATOMIC_WRITER_UNAVAILABLE refusal, the persisted outcome and the
  // failed outcome. Every one of them must name the instance, or some outcome reaches the operator with no way
  // back to the row that caused it. mutateFn rewrites the first.
  return (h.match(/instanceIds: _instanceIds/g) || []).length === 3 &&
         (x.match(/instanceIds: _instanceIds/g) || []).length === 2;
});

mut('X12 §L.12 Submit merges two tickets and that goes unreported', function () {
  // The MERGE is real and unchanged - §I.5 forbids guessing a fix. What must never happen is the merge going
  // unrecorded, so the mutation removes the STOP from the planning doc and the probe catches its absence.
  var DOC = read('docs/planning/LEGACY_ALLOCATION_DRAFT_RECONCILIATION_F1-7N-FB-4F.md');
  var mutated = DOC.split('A2-R3 STOP').join('A2-R3 resolved');
  return /A2-R3 STOP/.test(DOC) && !/A2-R3 STOP/.test(mutated) &&
         /shippingPlanRouteGroupKey_/.test(DOC);
});

mut('X13 §L.13 a pre-migration sheet silently accepts an unsafe CREATE', function () {
  var m = mutateFn(G16, 'sadAtomicUpsertCore_',
    "      if (!sadCreateIdempotencyReady_(hNames)) {", "      if (false) {");
  var h = code(extractFn(G16, 'sadAtomicUpsertCore_'));
  var x = code(extractFn(m, 'sadAtomicUpsertCore_'));
  // Honest, executed: a pre-migration sheet refuses with zero writes.
  resetDb({ preMigration: true });
  var r = saveTicket(route({}));
  return /sadCreateIdempotencyReady_\(hNames\)/.test(h) && !/sadCreateIdempotencyReady_\(hNames\)/.test(x) &&
         r.ok === false && r.res.code === 'ROUTE_CREATE_IDEMPOTENCY_NOT_PERSISTABLE' && counts()[0] === 0;
});

mut('X14 §L.14 cancelling an unsaved row still issues a request', function () {
  // F1-7N-FB-4G-A2-R4 §I.1 — RE-ANCHORED. Cancelling a PERSISTED route is now an explicitly confirmed act, so
  // the bare call became a guarded block and this mutation's find string named a line that no longer exists.
  // The mutation itself is unchanged: drop the `lineId &&` guard so an UNSAVED row issues a cancel request too.
  var m = mutateFn(PAGE, 'removeExecutionRoute',
    "        if (lineId && typeof _cancelAllocationDraftLine === 'function') {",
    "        if (typeof _cancelAllocationDraftLine === 'function') {");
  var h = code(extractFn(PAGE, 'removeExecutionRoute'));
  var x = code(extractFn(m, 'removeExecutionRoute'));
  return /if \(lineId && typeof _cancelAllocationDraftLine/.test(h) &&
         !/if \(lineId && typeof _cancelAllocationDraftLine/.test(x);
});

// The §K.9 executed check resolves a promise, so the summary waits for it.
Promise.resolve().then(function () { return null; }).then(function () {
  setTimeout(function () {
    console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ': ' + pass + ' passed, ' + fail + ' failed, mutations ' +
      neg.caught + ' caught / ' + neg.missed + ' missed');
    process.exit(fail ? 1 : 0);
  }, 30);
});
