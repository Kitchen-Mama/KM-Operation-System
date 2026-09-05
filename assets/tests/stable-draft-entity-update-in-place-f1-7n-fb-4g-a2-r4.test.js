// F1-7N-FB-4G-A2-R4 — STABLE DRAFT ENTITY / UPDATE-IN-PLACE / EXPLICIT ADD-ROUTE-ONLY CREATION.
//
// THE ROOT CAUSE, MEASURED ON THE SHIPPED COLLECTOR BEFORE IT WAS FIXED:
//
//   _saveAllocationDraftFromDom had an `else if (lineId)` branch for a route that had become INCOMPLETE. It
//   queued a soft-cancel of the stored line AND erased allocation_draft_id / allocation_draft_line_id /
//   route_group_key from BOTH the model and the DOM. Executed:
//
//     STEP 1  hydrated, complete   -> draft=SADH-K4-AAA  line=SADL-K2-AAA  intent=UPDATE_EXISTING
//     STEP 2  From changed, so the Method options are rebuilt and the old Method is no longer valid; the
//             select is cleared and the route is briefly incomplete
//                                  -> draft=""           line=""           intent=CREATE_NEW_ROUTE
//                                     + a queued soft-cancel of SADL-K2-AAA under SADH-K4-AAA
//     STEP 3  a valid Method is chosen again
//                                  -> a FRESH line id is minted, still CREATE_NEW_ROUTE
//
//   So an ordinary edit cancelled the operator's ticket and created a replacement — the live "cancelled headers
//   + new headers" shape. Nobody decided that; an editor state did. And when the SKU's only route went briefly
//   incomplete, _irCancelUnusedDraftHeaders_ soft-cancelled the stored HEADER too (measured: SADH-K4-BBB),
//   because its stillUsed set required _isRouteComplete.
//
//   The erasure was defended as "never overwrite the stored line with a null/invalid payload". That guarantee
//   never depended on it: the flush writes only COMPLETE routes. §0 freezes the opposite — identity is
//   immutable, and only an explicit + Add Route may create.
//
// AND THE PART THAT WAS ALREADY RIGHT: the SERVER contract needed no change. Measured across Qty, Method, From,
// marketplace->warehouse, warehouse->marketplace and Last Mile, a declared UPDATE_EXISTING_ROUTE stays on the
// same header and the same line with draft_version 1->7 and ZERO cancelled rows; and a route edited until its
// K4 equals another draft's still updates its own row, with no merge, no adoption and no cancel.
//
// Run: node assets/tests/stable-draft-entity-update-in-place-f1-7n-fb-4g-a2-r4.test.js

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
var NL = String.fromCharCode(10);

var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G13 = read('assets/specs/active/apps-script/13_procurement_handlers.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var G66 = read('assets/specs/active/apps-script/66_api_v1_request_order_send.gs');
var G69 = read('assets/specs/active/apps-script/69_api_v1_route_identity_contract.gs');
var GTD = read('assets/specs/active/apps-script/TEMP_request_order_send_diagnostics.gs');
var ROUTER = read('assets/specs/active/apps-script/01_router.gs');
var PAGE = read('assets/js/pages/inventory-replenishment.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var DOC = read('docs/planning/LEGACY_ALLOCATION_DRAFT_RECONCILIATION_F1-7N-FB-4F.md');
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var COMPAT = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js'));
var IRDraft = COMPAT.IRDraft;

function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(');
  var m = re.exec(src); if (!m) throw new Error('not found: ' + name);
  var start = m.index, i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
var WSCHARS = ' ' + String.fromCharCode(9) + String.fromCharCode(13) + String.fromCharCode(10);
function extractVar(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src); if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('=', m.index) + 1;
  while (WSCHARS.indexOf(src[i]) >= 0) i++;
  if (src[i] === '{' || src[i] === '[') {
    var open = src[i], close = open === '{' ? '}' : ']', d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close) { d--; if (d === 0) break; } }
    return src.slice(m.index, j + 1) + ';';
  }
  return src.slice(m.index, src.indexOf(';', i) + 1);
}
function mutateFn(src, name, find, replace) {
  var CR = String.fromCharCode(13), LFC = String.fromCharCode(10);
  var eol = src.indexOf(CR + LFC) >= 0 ? (CR + LFC) : LFC;
  function fix(t) { return String(t).split(CR + LFC).join(LFC).split(LFC).join(eol); }
  find = fix(find); replace = fix(replace);
  var body = extractFn(src, name);
  if (body.indexOf(find) < 0) throw new Error('mutation target absent in ' + name + ': ' + find.slice(0, 90));
  return src.replace(body, body.replace(find, replace));
}

// ================================================================================================================
// THE SERVER. Only the spreadsheet is simulated; every rule runs from shipped source.
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
var __now = '2026-09-03 12:00:00';
function procurementTimestamp_() { return __now; }
function prodRequireSheet_(ss, n) { return SHEETS[n]; }
function procurementNum_(v) { var n = Number(v); return isFinite(n) ? n : ''; }
function jsonResponse_(o) { return o; }
function sheetEnsureColumns_() { return null; }

eval(extractFn(G13, 'procurementEnsureSheet_'));
eval(extractFn(G13, 'procurementAppendByHeader_'));
eval(extractFn(G13, 'procurementFindRow_'));

var CONSTS = ['SHIPPING_ALLOCATION_DRAFTS_HEADERS_', 'SAD_LIFECYCLE_TAIL_COLUMNS_',
  'SAD_ROUTE_IDENTITY_TAIL_COLUMNS_', 'SAD_CREATE_IDEMPOTENCY_TAIL_COLUMNS_', 'SAD_HEADER_OPTIONAL_TAIL_COLUMNS_',
  'SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_', 'SAD_SCHEMA_GENERATIONS_', 'SAD_AI_K2_INTENT_', 'SAD_ROUTE_INTENTS_', 'SAD_CLIENT_GRANTABLE_INTENTS_', 'SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_',
  'SAD_LINE_ETA_TAIL_COLUMNS_', 'SAD_STATUSES_', 'SAD_TERMINAL_STATUSES_', 'SAD_TERMINAL_LINE_STATUSES_',
  'SAD_GENERATION_TYPES_', 'SAD_RECOMMENDATION_FIELDS_', 'SAD_LINE_LEGACY_ALIASES_', 'SAD_K2_GROUP_DIMENSIONS_',
  'SAD_LINE_IDENTITY_FIELDS_', 'SAD_K2_BASIS_ID_MATCHES_', 'SAD_K2_BASIS_STALE_ACCEPTED_',
  'SAD_K2_BASIS_DIFFERENT_GROUP_', 'SAD_K2_BASIS_NO_REQUEST_GROUP_', 'SAD_K2_BASIS_CONTESTED_',
  'SAD_K2_HEADER_FP_', 'SAD_K2_LINE_FP_', 'SAD_K2_SEM_CONTRACT_',
  'SAD_K2_FP_DATE_FIELDS_', 'SAD_K2_FP_NUMERIC_FIELDS_', 'SAD_K2_SEM_EXCLUDED_LIFECYCLE_',
  'SAD_K2_SEM_OPTIONAL_PRESERVE_'];
eval(CONSTS.map(function (v) { return extractVar(G16, v); }).join(NL));
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
  'sadUpsertDraftHeaderCore_', 'sadUpsertLinesKeyedCore_', 'sadSchemaGenerationColumns_', 'sadSupportedSchemaVersions_', 'sadAiK2IntentEvidence_', 'sadResolveHeaderSchema_',
  'sadDraftsSchemaReason_', 'sadAtomicUpsertCore_'];
eval(FNS.map(function (f) { return extractFn(G16, f); }).join(NL));
eval(['RIC_CANONICAL_SERVICES_', 'RIC_SERVICE_LABELS_', 'RIC_DESTINATION_TYPES_', 'RIC_K4_GROUP_DIMENSIONS_',
  'RIC_SCHEMA_REFUSALS_', 'RIC_B2_REQUIRED_COLUMNS_'].map(function (v) { return extractVar(G69, v); }).join(NL));
eval(['ricCanonicalService_', 'ricDestinationIdentity_', 'ricK4GroupKey_', 'ricK4DeterministicHeaderId_',
  'ricRoutePersistability_'].map(function (f) { return extractFn(G69, f); }).join(NL));

var SKU = 'CO1100-R';
var SCOPE = { planning_cycle: '', company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var SKEY = [SCOPE.company, SCOPE.country, SCOPE.marketplace].join('|').toLowerCase();

function resetDb() {
  SHEETS['shipping_allocation_drafts'] = new FakeSheet(SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_);
  SHEETS['shipping_allocation_draft_lines'] = new FakeSheet(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_);
  __uuid = 0;
}
function rowsOf(tab) {
  var sh = SHEETS[tab], hdr = sh.rows[0];
  return sh.rows.slice(1).map(function (r) { var o = {}; hdr.forEach(function (h, i) { if (h) o[h] = r[i]; }); return o; });
}
function H() { return rowsOf('shipping_allocation_drafts'); }
function L() { return rowsOf('shipping_allocation_draft_lines'); }
function activeH() { return H().filter(function (x) { return String(x.status || '').toLowerCase() !== 'cancelled'; }); }
function cancelledH() { return H().filter(function (x) { return String(x.status || '').toLowerCase() === 'cancelled'; }); }
function activeL() { return L().filter(function (x) { return String(x.line_status || '').toLowerCase() !== 'cancelled'; }); }

var __cri = 0;
function route(over) {
  __cri++;
  var r = { client_route_instance_id: 'CRI-R4-' + __cri,
    allocation_draft_id: '', allocation_draft_line_id: '', route_group_key: '', draft_version: '',
    source_warehouse_id: 'WH-CN-YOUXIN', source_warehouse_code: 'CNYOUXIN', ship_from: 'CN Youxin',
    destination_warehouse_id: '', destination_marketplace: 'Amazon', destination_warehouse_code: '',
    destination: 'Amazon', shipping_method: 'air', last_mile_delivery: '', recommendation_group_no: '',
    sku: SKU, site_sku: '', window_code: '', planned_qty: 120, qty: 120, units_per_carton: 20 };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
// One atomic request per route ticket — exactly the body the shipped client builds.
function saveTicket(r, opts) {
  opts = opts || {};
  var pf = IRDraft.preflightRouteGroups(SCOPE, SKU, [r]);
  if (!pf.ok) return { ok: false, stage: 'preflight', conflicts: pf.conflicts };
  var g = pf.groups[0];
  if (!g) return { ok: false, stage: 'incomplete' };
  var h = g.header;
  var hasId = !!String(r.allocation_draft_id || '').trim();
  var header = IRDraft.buildDraftHeaderPayload({
    intent: opts.intent || (hasId ? 'UPDATE_EXISTING_ROUTE' : 'CREATE_NEW_ROUTE'),
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
    planned_qty: r.planned_qty, units_per_carton: r.units_per_carton, generation_type: 'user_created' }];
  var res = sadAtomicUpsertCore_({ header: header, lines: lines,
    create_idempotency_key: header.create_idempotency_key || undefined,
    expected_draft_version: header.expected_draft_version || undefined });
  if (!res || res.success === false) return { ok: false, stage: res && res.stage, res: res, intent: header.intent };
  var d = res.data || {};
  var pl = (d.persisted_lines || [])[0];
  r.allocation_draft_id = d.allocation_draft_id;
  if (pl) r.allocation_draft_line_id = pl.allocation_draft_line_id;
  r.route_group_key = g.groupKey;
  r.draft_version = String(d.draft_version || '');
  return { ok: true, intent: header.intent, draftId: d.allocation_draft_id, lineId: r.allocation_draft_line_id,
    outcome: String(d.outcome || ''), res: res };
}

// ================================================================================================================
// THE DOM. Just large enough to run the SHIPPED _saveAllocationDraftFromDom.
// ================================================================================================================
function El(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.value = ''; this.options = null; this.selectedIndex = -1; }
El.prototype.getAttribute = function (n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; };
El.prototype.setAttribute = function (n, v) { this.attrs[n] = String(v); };
El.prototype.removeAttribute = function (n) { delete this.attrs[n]; };
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype._all = function (out) {
  out = out || [];
  for (var i = 0; i < this.children.length; i++) { out.push(this.children[i]); this.children[i]._all(out); }
  return out;
};
function domMatches(el, sel) {
  if (sel.charAt(0) === '.') return String(el.attrs['class'] || '').split(/\s+/).indexOf(sel.slice(1)) !== -1;
  var m = /^\[([a-zA-Z-]+)="([^"]*)"\]$/.exec(sel);
  if (m) return String(el.attrs[m[1]] == null ? '' : el.attrs[m[1]]) === m[2];
  var m2 = /^\[([a-zA-Z-]+)\]$/.exec(sel);
  if (m2) return Object.prototype.hasOwnProperty.call(el.attrs, m2[1]);
  return el.tag === sel;
}
El.prototype.querySelectorAll = function (sel) {
  var out = this._all().filter(function (e) { return domMatches(e, sel); });
  out.forEach = Array.prototype.forEach;
  return out;
};
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };
function Select(value, optAttrs) {
  var s = new El('select'); s.value = value;
  var o = new El('option');
  Object.keys(optAttrs || {}).forEach(function (k) { o.setAttribute(k, optAttrs[k]); });
  s.options = [o]; s.selectedIndex = 0;
  return s;
}
function routeRow(spec) {
  var row = new El('div');
  row.setAttribute('class', 'exec-route-row');
  if (spec.lineId) row.setAttribute('data-line-id', spec.lineId);
  if (spec.draftId) row.setAttribute('data-draft-id', spec.draftId);
  if (spec.groupKey) row.setAttribute('data-group-key', spec.groupKey);
  if (spec.instanceId) row.setAttribute('data-route-instance', spec.instanceId);
  // F1-7N-FC-1B-E1 - the real _renderExecutionRoute stamps every row it paints with the explicit act that
  // produced it, and this suite STUBS that renderer, so its row builder has to stamp the same thing or it
  // would be modelling a row the page cannot produce. A row with stored ids needs no stamp (the collect
  // derives PERSISTED_ACTIVE_DRAFT from the identity pair); an unpersisted row is one the operator added.
  row.setAttribute('data-route-provenance',
    spec.provenance || ((spec.lineId && spec.draftId) ? 'PERSISTED_ACTIVE_DRAFT' : 'USER_EXPLICIT_ADD_ROUTE'));
  var from = Select(spec.from || 'WH-CN-YOUXIN', { 'data-wh-name': spec.fromName || 'CN Youxin', 'data-wh-type': '3PL', 'data-wh-code': spec.fromCode || 'CNYOUXIN' });
  from.setAttribute('data-field', 'source_warehouse_id');
  var to = spec.toMarketplace
    ? Select('MARKETPLACE_DESTINATION:' + spec.toMarketplace, { 'data-wh-name': spec.toMarketplace, 'data-wh-type': 'MARKETPLACE_DESTINATION' })
    : Select(spec.toWarehouse || '', { 'data-wh-name': spec.toName || 'US WH', 'data-wh-type': '3PL', 'data-wh-code': spec.toCode || 'USLA' });
  to.setAttribute('data-field', 'destination_warehouse_id');
  var method = new El('select'); method.setAttribute('data-field', 'shipping_method'); method.value = spec.method || '';
  var qty = new El('input'); qty.setAttribute('data-field', 'qty'); qty.value = String(spec.qty == null ? '' : spec.qty);
  var eta = new El('span'); eta.setAttribute('data-field', 'expected_arrival');
  eta.setAttribute('data-eta', ''); eta.setAttribute('data-eta-basis', ''); eta.setAttribute('data-eta-source', '');
  [from, to, method, qty, eta].forEach(function (e) { row.appendChild(e); });
  row.fields = { from: from, to: to, method: method, qty: qty };
  return row;
}

var COLLECT_VARS = ['IR_ROUTE_PERSISTABLE_FIELDS', 'IR_ISO_DATE_RE_'];
var COLLECT_FNS = ['_saveAllocationDraftFromDom', '_isRouteComplete', '_irRouteSignature_', '_irMarkRouteTouched_',
  '_irTouchedInstances_', '_irCanonicalDateOrBlank_', '_irCancelUnusedDraftHeaders_', 'addExecutionRoute',
  '_irAckStore_', '_irAckUnknownIsHeld_', '_irHoldAckUnknown_', '_irClearAckUnknown_', '_irReleaseAckUnknown_',  // R6-R6 §7 — the write scope's hold
  '_irAnySaveInFlight_',
  // F1-7N-FC-1B-E1 - the collect now asks each row which explicit act produced it. Lifted into the executed
  // scope rather than stubbed, so this suite exercises the REAL rule.
  '_irRouteProvenanceOf_',
  // F1-7N-FC-1B-E2 - the collect now classifies a manual composer instead of adopting it as a route.
  // Lifted into the executed scope rather than stubbed, so this suite exercises the REAL classification.
  '_irComposerKind_', '_irIsComposerEl_'];

function buildCollector(cfg) {
  cfg = cfg || {};
  var SRC = cfg.pageSrc || PAGE;
  var env = {
    replenAllocationDraft: { bySku: {}, allocationDraftIds: [], allocationDraftId: '', context: null },
    _pendingDraftCancels: {}, _draftDbTouched: {}, _draftDbInFlight: {},
    scheduled: [], cancelledHeaders: [], cancelledLines: [], alerts: [], rendered: 0,
    ctx: { company: 'ResUS', country: 'US', marketplace: 'Amazon', planning_cycle: '' }
  };
  var host = new El('div');
  var byId = { 'shipping-methods-CO1100-R': host, replenTargetDays: { value: '30' } };
  var doc = { getElementById: function (id) { return byId[id] || null; },
              querySelectorAll: function () { var a = []; a.forEach = Array.prototype.forEach; return a; },
              querySelector: function () { return null; } };
  var win = { IRDraft: COMPAT.IRDraft, IRWarehouse: COMPAT.IRWarehouse,
              KM: { shippingAllocationDraft: null, DB: cfg.noAtomic ? {} : { upsertShippingAllocationDraftAtomic: function () {} } } };
  var seqLine = 0, seqInst = 0;
  var src = COLLECT_VARS.map(function (v) { return extractVar(SRC, v); })
    .concat(COLLECT_FNS.map(function (n) { return extractFn(SRC, n); })).join(NL);
  var factory = new Function('window', 'document', 'replenAllocationDraft', '_pendingDraftCancels',
    '_draftDbTouched', '_draftDbInFlight', '_replenCtx', '_persistAllocationDraft', '_scheduleDraftDbPersist',
    '_newDraftLineId', '_newRouteInstanceId', 'REPLEN_TARGET_DAYS', '_cancelAllocationDraftHeader',
    '_cancelAllocationDraftLine', '_renderExecutionRoute', 'onExecutionRouteEdit', 'syncExpandPanelHeight',
    'alert', 'console',
    src + NL + 'return { collect: _saveAllocationDraftFromDom, complete: _isRouteComplete, ' +
    'touched: _irTouchedInstances_, sweep: _irCancelUnusedDraftHeaders_, addRoute: addExecutionRoute };');
  var api = factory(win, doc, env.replenAllocationDraft, env._pendingDraftCancels, env._draftDbTouched,
    env._draftDbInFlight,
    function () { return env.ctx; }, function () {}, function (sku) { env.scheduled.push(sku); },
    function () { seqLine++; return 'SADL-NEW-' + seqLine; },
    function () { seqInst++; return 'CRI-DOM-' + seqInst; }, 30,
    function (id) { env.cancelledHeaders.push(String(id)); },
    function (lineId, draftId) { env.cancelledLines.push({ lineId: lineId, draftId: draftId }); },
    function () { env.rendered++; }, function () {}, function () {},
    function (m) { env.alerts.push(String(m)); }, { warn: function () {}, log: function () {} });
  api.env = env; api.host = host; api.window = win;
  api.addRow = function (spec) { var r = routeRow(spec); host.appendChild(r); return r; };
  api.rows = function () { return env.replenAllocationDraft.bySku[SKU] || []; };
  return api;
}

// ================================================================================================================
section('§C — THE CANCEL + REPLACEMENT, AND THAT IT IS GONE');
// ================================================================================================================
(function () {
  var c = buildCollector();
  var el = c.addRow({ instanceId: 'CRI-LIVE-1', lineId: 'SADL-K2-AAA', draftId: 'SADH-K4-AAA',
    groupKey: '|resus|us|amazon|inventory_replenishment|wh-cn-youxin||sea||',
    toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c.collect(SKU);
  var r0 = c.rows()[0];
  eq([r0.allocation_draft_id, r0.allocation_draft_line_id, r0.route_intent],
     ['SADH-K4-AAA', 'SADL-K2-AAA', 'UPDATE_EXISTING'], 'C1  hydrated: identity and intent');

  // The From change rebuilds the Method options; the old Method is no longer valid and the select is cleared.
  el.fields.from.value = 'WH-CN-SHENZHEN';
  el.fields.method.value = '';
  c.collect(SKU);
  var r1 = c.rows()[0];
  eq(r1.allocation_draft_id, 'SADH-K4-AAA', 'C2  a temporarily incomplete route KEEPS its header id');
  eq(r1.allocation_draft_line_id, 'SADL-K2-AAA', 'C2a and its line id');
  eq(r1.route_intent, 'UPDATE_EXISTING', 'C2b and its UPDATE intent — it never becomes a CREATE');
  eq(r1.route_incomplete, true, 'C2c it is marked incomplete instead');
  eq(c.env._pendingDraftCancels[SKU] || [], [], 'C3  and NOTHING was queued for cancellation');
  eq(el.getAttribute('data-line-id'), 'SADL-K2-AAA', 'C3a the DOM still carries the line identity');
  eq(el.getAttribute('data-draft-id'), 'SADH-K4-AAA', 'C3b and the header identity');
  eq(c.complete(r1), false, 'C4  the route is not persistable while incomplete, so nothing will be written');

  // A valid Method again.
  el.fields.method.value = 'air';
  c.collect(SKU);
  var r2 = c.rows()[0];
  eq([r2.allocation_draft_id, r2.allocation_draft_line_id], ['SADH-K4-AAA', 'SADL-K2-AAA'],
     'C5  finishing the route saves to the SAME ticket — no replacement id was minted');
  eq(r2.route_intent, 'UPDATE_EXISTING', 'C5a still an UPDATE');
  eq(c.complete(r2), true, 'C5b and it is persistable again');
  eq(c.env.cancelledLines, [], 'C6  zero line cancels across the whole sequence');
  eq(c.env.cancelledHeaders, [], 'C6a zero header cancels');

  // §I — the header sweep must not cancel on an editor state.
  var c2 = buildCollector();
  var el2 = c2.addRow({ instanceId: 'CRI-LIVE-2', lineId: 'SADL-K2-BBB', draftId: 'SADH-K4-BBB',
    groupKey: 'g2', toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c2.collect(SKU);
  c2.env.replenAllocationDraft.allocationDraftIds = ['SADH-K4-BBB'];
  el2.fields.method.value = '';
  c2.collect(SKU);
  c2.sweep(SKU);
  eq(c2.env.cancelledHeaders, [], 'C7  the header sweep does NOT cancel a header whose only route is briefly incomplete');

  // and it still does its real job: a header nothing references any more IS released.
  var c3 = buildCollector();
  c3.env.replenAllocationDraft.allocationDraftIds = ['SADH-K4-GONE'];
  c3.sweep(SKU);
  eq(c3.env.cancelledHeaders, ['SADH-K4-GONE'], 'C8  a header no row references at all is still released');
})();

// ================================================================================================================
section('§D — THE MODEL OWNS THE IDENTITY, NOT THE DOM');
// ================================================================================================================
(function () {
  var c = buildCollector();
  var el = c.addRow({ instanceId: 'CRI-LIVE-3', lineId: 'SADL-K2-CCC', draftId: 'SADH-K4-CCC',
    groupKey: 'g3', toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c.collect(SKU);
  // A re-render that loses the identity attributes must NOT create a new entity (§D.2).
  el.removeAttribute('data-line-id');
  el.removeAttribute('data-draft-id');
  el.removeAttribute('data-group-key');
  c.collect(SKU);
  var r = c.rows()[0];
  eq([r.allocation_draft_id, r.allocation_draft_line_id], ['SADH-K4-CCC', 'SADL-K2-CCC'],
     'D1  a re-render that dropped the DOM attributes recovers identity from the model');
  eq(r.route_intent, 'UPDATE_EXISTING', 'D1a and the intent is still UPDATE');
  eq([el.getAttribute('data-line-id'), el.getAttribute('data-draft-id')], ['SADL-K2-CCC', 'SADH-K4-CCC'],
     'D1b and the DOM is re-stamped, so the two can never disagree');
  // §D.3 — the group key describes the shape and never replaces the entity id.
  var persist = code(extractFn(PAGE, '_irQueueStaleGroupCancels_'));
  ok(!/allocation_draft_id = ''/.test(persist) && !/allocation_draft_line_id = ''/.test(persist),
    'D2  a changed group key never erases the entity identity');
})();

// ================================================================================================================
section('§M.1-§M.9 — SAME IDS ACROSS EVERY IDENTITY-SHAKING EDIT (executed against the shipped server)');
// ================================================================================================================
(function () {
  resetDb();
  var r = route({ shipping_method: 'sea' });
  saveTicket(r);
  var id0 = r.allocation_draft_id, line0 = r.allocation_draft_line_id;
  ok(!!id0 && !!line0, 'M0  seeded one ticket');
  eq(String(r.draft_version), '1', 'M0a at version 1');

  r.planned_qty = 500; saveTicket(r);
  eq([r.allocation_draft_id, r.allocation_draft_line_id, r.draft_version], [id0, line0, '2'], 'M1  Qty edit: same ids, version++');
  eq(String(L()[0].planned_qty), '500', 'M1a and the value landed');

  r.planned_qty = 640; saveTicket(r);
  eq([r.allocation_draft_id, r.allocation_draft_line_id, r.draft_version], [id0, line0, '3'], 'M2  a SECOND Qty edit with no reload: same ids, version++ again');

  r.shipping_method = 'air'; saveTicket(r);
  eq([r.allocation_draft_id, r.allocation_draft_line_id], [id0, line0], 'M3  Method edit: same ids');
  eq(String(activeH()[0].recommended_shipping_method), 'air', 'M3a and the Method landed');

  r.source_warehouse_id = 'WH-CN-SHENZHEN'; r.source_warehouse_code = 'CNSZ'; r.ship_from = 'CN Shenzhen';
  saveTicket(r);
  eq([r.allocation_draft_id, r.allocation_draft_line_id], [id0, line0], 'M6  From edit (K2 AND K4 both move): same ids');

  r.destination_marketplace = ''; r.destination = 'US WH'; r.destination_warehouse_id = 'WH-US-LA'; r.destination_warehouse_code = 'USLA';
  saveTicket(r);
  eq([r.allocation_draft_id, r.allocation_draft_line_id], [id0, line0], 'M7  marketplace destination -> warehouse: same ids');
  eq(String(activeH()[0].recommended_destination_warehouse_id), 'WH-US-LA', 'M7a and the destination landed');

  r.destination_warehouse_id = ''; r.destination_warehouse_code = ''; r.destination_marketplace = 'Walmart'; r.destination = 'Walmart';
  saveTicket(r);
  eq([r.allocation_draft_id, r.allocation_draft_line_id], [id0, line0], 'M8  warehouse -> marketplace destination: same ids');
  eq(String(activeH()[0].destination_marketplace), 'Walmart', 'M8a and the destination landed');

  eq([activeH().length, activeL().length], [1, 1], 'M-ALL  ONE ticket survived every edit');
  eq(cancelledH().length, 0, 'M-ALL a and NOT ONE cancelled header was produced');

  // §M.9 — the edited route ends up with the same K4 as another draft.
  resetDb();
  var a = route({ shipping_method: 'sea' }); saveTicket(a);
  var b = route({ shipping_method: 'air' }); saveTicket(b);
  var bId = b.allocation_draft_id;
  b.shipping_method = 'sea';
  var res = saveTicket(b);
  ok(res.ok, 'M9  an edit that makes two drafts share a K4 is ACCEPTED');
  eq(b.allocation_draft_id, bId, 'M9a and it updates the row it named');
  eq(activeH().length, 2, 'M9b both tickets survive — no merge and no adoption');
  eq(cancelledH().length, 0, 'M9c and nothing was cancelled');
})();

// ================================================================================================================
section('§M.10-§M.13 — ADD ROUTE, AND FAILURES THAT MUST NOT REPLACE ANYTHING');
// ================================================================================================================
(function () {
  resetDb();
  var a = route({ shipping_method: 'sea' }); saveTicket(a);
  eq([activeH().length, activeL().length], [1, 1], 'M10  one ticket before');
  var b = route({ shipping_method: 'truck' });
  var res = saveTicket(b);
  ok(res.ok && res.intent === 'CREATE_NEW_ROUTE', 'M10a an explicit Add Route CREATEs');
  eq([activeH().length, activeL().length], [2, 2], 'M10b exactly +1 header and +1 line');

  var bId = b.allocation_draft_id, bLine = b.allocation_draft_line_id;
  b.planned_qty = 999;
  var res2 = saveTicket(b);
  eq(res2.intent, 'UPDATE_EXISTING_ROUTE', 'M11  editing the NEW route is an UPDATE of itself');
  eq([b.allocation_draft_id, b.allocation_draft_line_id], [bId, bLine], 'M11a same ids');
  eq(activeH().length, 2, 'M11b still two tickets');

  // §H.8 — two explicit Add Routes of the SAME shape are two tickets.
  resetDb();
  var x = route({ shipping_method: 'sea' }); saveTicket(x);
  var y = route({ shipping_method: 'sea' }); saveTicket(y);
  eq(activeH().length, 2, 'M10c two explicit Add Routes of an identical shape are TWO tickets');
  ok(x.allocation_draft_id !== y.allocation_draft_id, 'M10d with distinct ids');

  // §H.7 — a retry with the same key is a replay, never a duplicate.
  resetDb();
  var z = route({ shipping_method: 'sea' });
  var first = saveTicket(z, { createKey: 'CRI-FIXED-KEY' });
  var zid = z.allocation_draft_id;
  var replay = route({ shipping_method: 'sea' });
  var second = saveTicket(replay, { createKey: 'CRI-FIXED-KEY' });
  eq(activeH().length, 1, 'M10e a retry with the SAME create key writes no second ticket');
  eq(second.draftId, zid, 'M10f and returns the ids the first attempt committed');

  // §M.12 — a validation failure writes nothing and keeps the identity.
  resetDb();
  var v = route({ shipping_method: 'sea' }); saveTicket(v);
  var vId = v.allocation_draft_id, vLine = v.allocation_draft_line_id, vVer = v.draft_version;
  var good = v.planned_qty;
  v.draft_version = '99'; v.planned_qty = 777;
  var bad = saveTicket(v);
  eq(bad.ok, false, 'M12  a stale-version UPDATE is refused');
  eq([activeH().length, activeL().length], [1, 1], 'M12a with no new ticket');
  eq(cancelledH().length, 0, 'M12b and nothing cancelled');
  eq([v.allocation_draft_id, v.allocation_draft_line_id], [vId, vLine], 'M12c the row keeps its identity');
  eq(String(L()[0].planned_qty), String(good), 'M12d and the stored value is untouched');
})();

// ================================================================================================================
section('§F/§G — INCOMPLETE IS NAMED, NEVER SILENT; AND DIRTY IS DIRTY');
// ================================================================================================================
(function () {
  var flush = code(extractFn(PAGE, '_flushDraftDbPersist'));
  ok(/_incomplete\s*=\s*_scoped\.filter/.test(flush), 'G1  the flush separates the dirty-but-incomplete routes');
// RESTATED (F1-7N-FC-1B-E3-R2): §G.8's property is that a dirty-but-incomplete route is REPORTED BY NAME
// rather than dropped in silence, and that still holds. What this pinned was the ARGUMENT the notice was built
// from - the variable `_incomplete` - and R2 widens that set on purpose. A TOUCHED COMPOSER was in it when it
// was the only edit on screen (via the empty-touched-set fallback) and NOT in it when another row was touched,
// so the same row got a red database-failure panel or complete silence depending on an unrelated row. The set
// is now `_hintRows`: every unfinished row that is not furniture, computed from the whole model.
ok(/_irIncompleteRouteNotice_\(sku, _hintRows\)/.test(flush),
  'G2  and reports them by name (§G.8), from the set of ALL unfinished rows rather than the write scope');
ok(/_incomplete\s*=\s*_scoped\.filter/.test(flush) && /\.concat\(_incomplete\)/.test(flush),
  'G2a the dirty-but-incomplete routes are still what that set is built on');
  var notice = extractFn(PAGE, '_irIncompleteRouteNotice_');
  ok(/UNSAVED_INCOMPLETE_ROUTE/.test(notice), 'G3  under its own typed code');
  ok(/zeroWrite: 'true'/.test(notice), 'G4  stating that nothing was written');
  ok(/incompleteInstanceIds/.test(notice), 'G5  and naming the exact route instances');
  // the missing-field report is derived, not guessed
  var miss = new Function('return ' + extractFn(PAGE, '_irMissingRouteFields_').replace('function _irMissingRouteFields_', 'function'))();
  eq(miss({ source_warehouse_id: 'A', destination_marketplace: 'Amazon', planned_qty: 5, shipping_method: '' }), ['Method'], 'G6  a cleared Method is named');
  eq(miss({ source_warehouse_id: '', destination_marketplace: 'Amazon', planned_qty: 5, shipping_method: 'air' }), ['From'], 'G6a a missing From is named');
  eq(miss({ source_warehouse_id: 'A', destination_marketplace: 'Amazon', destination_warehouse_id: 'W', planned_qty: 5, shipping_method: 'air' }), ['To'], 'G6b a BOTH-destinations route fails the XOR');
  eq(miss({ source_warehouse_id: 'A', destination_marketplace: 'Amazon', planned_qty: 0, shipping_method: 'air' }), ['Qty'], 'G6c a zero Qty is named');

  // §G.1-§G.5 — each field marks the route dirty, and a pure re-render does not.
  var c = buildCollector();
  var el = c.addRow({ instanceId: 'CRI-D', lineId: 'SADL-K2-D', draftId: 'SADH-K4-D', groupKey: 'g',
    toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c.collect(SKU);
  function dirtyAfter(mutate) {
    c.env._draftDbTouched[SKU] = {};
    mutate();
    c.collect(SKU);
    return c.touched(SKU);
  }
  eq(dirtyAfter(function () { el.fields.qty.value = '500'; }), ['CRI-D'], 'G7  a Qty edit marks the route dirty');
  eq(dirtyAfter(function () { el.fields.method.value = 'air'; }), ['CRI-D'], 'G8  a Method edit marks the route dirty');
  eq(dirtyAfter(function () { el.fields.from.value = 'WH-CN-SHENZHEN'; }), ['CRI-D'], 'G9  a From edit marks the route dirty');
  eq(dirtyAfter(function () {}), [], 'G10 a re-render with NO change marks nothing (§G.1 — a programmatic rebuild is not an edit)');
  // §F.8 — editing back to the persisted values clears the dirty flag.
  c.env._draftDbTouched[SKU] = {};
  el.fields.qty.value = '860'; c.collect(SKU);   // a value NO earlier step used, so this really is a change
  var wasDirty = c.touched(SKU).length;
  c.env._draftDbTouched[SKU] = {};
  c.collect(SKU);
  eq([wasDirty, c.touched(SKU).length], [1, 0], 'G11 an edit dirties; re-collecting the same values does not');
})();

// ================================================================================================================
section('§I — EVERY CANCEL CALL SITE, AND ITS AUTHORITY');
// ================================================================================================================
(function () {
  // The client can only reach a cancel through these two functions; both are audited here.
  var cancelCallers = [];
  ['_irDispatchLineCancels_', '_irCancelUnusedDraftHeaders_', 'removeExecutionRoute', '_flushDraftDbPersist',
   '_saveAllocationDraftFromDom', '_irQueueStaleGroupCancels_', '_irPersistOneRouteGroup_'].forEach(function (fn) {
    var body = code(extractFn(PAGE, fn));
    if (/_cancelAllocationDraftLine\(|_cancelAllocationDraftHeader\(|_pendingDraftCancels\[sku\][^=]*push\(/.test(body)) cancelCallers.push(fn);
  });
  eq(cancelCallers.sort(), ['_irCancelUnusedDraftHeaders_', '_irDispatchLineCancels_', 'removeExecutionRoute'],
    'I1  exactly THREE places can reach a cancel, and an edit path is not one of them');

  // 1. removeExecutionRoute — the operator's explicit delete, and it must ASK first.
  var rm = extractFn(PAGE, 'removeExecutionRoute');
  ok(/window\.confirm\(/.test(rm), 'I2  the explicit delete asks for confirmation (§I.1)');
  ok(/if \(!_goCancel\) return false;/.test(rm), 'I2a and a refusal writes nothing');
  ok(rm.indexOf('_goCancel = false') < rm.indexOf('_cancelAllocationDraftLine(lineId, lineDraftId)'),
    'I2b the confirmation is asked BEFORE the cancel is issued');

  // 2. _irDispatchLineCancels_ — dispatches only what was queued, and nothing queues on an edit any more.
  var collect = code(extractFn(PAGE, '_saveAllocationDraftFromDom'));
  ok(!/_pendingDraftCancels\[sku\][^=]*push\(/.test(collect),
    'I3  the DOM collector queues NO cancel — an edit can no longer cancel anything (§I)');

  // 3. _irCancelUnusedDraftHeaders_ — releases a header nothing references, and completeness is not the test.
  var sweep = code(extractFn(PAGE, '_irCancelUnusedDraftHeaders_'));
  ok(!/if \(!_isRouteComplete\(r\)\) return;/.test(sweep),
    'I4  the sweep no longer treats an incomplete route as "not using" its own header');

  // The forbidden triggers, each named by §I.
  ['修改From', 'validation', 'timeout', 'retry', 'hydrate'].length;   // (the list is asserted behaviourally above)
  var persist = code(extractFn(PAGE, '_irPersistOneRouteGroup_'));
  ok(!/_cancelAllocationDraft/.test(persist), 'I5  a save failure or timeout never cancels anything');
})();

// ================================================================================================================
section('§J — THE REQUIRED DIAGNOSTIC ACTION HAS A PERMANENT OWNER');
// ================================================================================================================
(function () {
  ok(/function handleRequestOrderSendDiagnosticStatus_/.test(G66), 'J1  the handler lives in 66_');
  ok(!/function handleRequestOrderSendDiagnosticStatus_/.test(GTD), 'J1a and no longer in the TEMP file');
  ['rosendStatusReport_', 'rosendResolve_'].forEach(function (fn, i) {
    ok(new RegExp('function ' + fn).test(G66), 'J2.' + (i + 1) + '  ' + fn + ' moved with it');
    ok(!new RegExp('function ' + fn).test(GTD), 'J2.' + (i + 1) + 'a and is not duplicated in the TEMP file');
  });
  ['ROSEND_TIER_SCOPE_', 'ROSEND_PLANNING_CYCLE_OVERRIDE_', 'ROSEND_DIAG_OWNER_FILE_', 'ROSEND_DIAG_BUILD_VERSION_'].forEach(function (v, i) {
    ok(new RegExp('var ' + v + ' =').test(G66), 'J3.' + (i + 1) + '  the configuration constant ' + v + ' is in the permanent owner');
    ok(!new RegExp('var ' + v + ' =').test(GTD), 'J3.' + (i + 1) + 'a and defined exactly once');
  });
  // §J.3 — the action NAME and the routing are unchanged.
  ok(/'system\.requestOrderSendDiagnosticStatus':\s+handleRequestOrderSendDiagnosticStatus_/.test(ROUTER),
    'J4  the router entry is unchanged');
  ok(/system\.requestOrderSendDiagnosticStatus/.test(G63), 'J4a it is still a required action');
  // §J.4 — the deployment manifest requires no TEMP file.
  eval(extractVar(G63, 'SYS_MODULE_BUILD_STAMPS_'));
  var tempOwners = SYS_MODULE_BUILD_STAMPS_.filter(function (m) { return /^TEMP_/.test(m.file); });
  eq(tempOwners.filter(function (m) { return m.optional !== true; }), [],
    'J5  no TEMP file is a REQUIRED deployment owner');
  ok(/ROSEND_DIAG_BUILD_VERSION_/.test(G63), 'J5a the manifest tracks the permanent diagnostic owner');
  // §J.5 — no duplicate global anywhere in the project.
  var ALL_GS = fs.readdirSync(path.join(ROOT, 'assets/specs/active/apps-script')).filter(function (f) { return /\.gs$/.test(f); });
  ['handleRequestOrderSendDiagnosticStatus_', 'rosendStatusReport_', 'rosendResolve_'].forEach(function (sy) {
    var owners = ALL_GS.filter(function (f) {
      return new RegExp('function\\s+' + sy + '\\s*\\(').test(read('assets/specs/active/apps-script/' + f));
    });
    eq(owners.length, 1, 'J6  exactly one definition of ' + sy + ' across the project');
  });
  // §J.7 — the browser pins the permanent symbol, not the TEMP one.
  ok(/'ROSEND_DIAG_OWNER_FILE_'/.test(DBAPI), 'J7  the frontend pins the permanent owner symbol');
  ok(!/'TEMP_ROSEND_DIAG_OWNER_FILE_'/.test(DBAPI), 'J7a and no longer the TEMP one');
  // §J.6 — the TEMP dependency census is recorded.
  ok(/SAFE_TO_DELETE_NOW/.test(DOC) && /MUST_KEEP_UNTIL_MIGRATION/.test(DOC) && /MOVE_TO_PERMANENT_OWNER/.test(DOC),
    'J8  the TEMP dependency census is recorded in the planning doc');
})();

// ================================================================================================================
section('§K — A DEPLOYMENT THAT CANNOT SAVE IS NOT AN EDITABLE ONE');
// ================================================================================================================
(function () {
  var c = buildCollector({ noAtomic: true });
  var before = c.env.rendered;
  c.addRoute(null, SKU);
  eq(c.env.rendered, before, 'K1  + Add Route renders nothing when the atomic writer is absent');
  eq(c.env.alerts.length, 1, 'K1a and says why');
  ok(/ROUTE_ATOMIC_WRITER_UNAVAILABLE/.test(c.env.alerts[0]), 'K1b naming the deployment fact');
  // with the writer present it works normally
  var c2 = buildCollector();
  var b2 = c2.env.rendered;
  c2.addRoute(null, SKU);
  eq(c2.env.rendered, b2 + 1, 'K2  and a healthy deployment adds the route');
  // §K.3 — the save path fails closed too, and never falls back to a two-call write.
  var persist = code(extractFn(PAGE, '_irPersistOneRouteGroup_'));
  ok(/ROUTE_ATOMIC_WRITER_UNAVAILABLE/.test(persist), 'K3  the save path also fails closed');
  ok(!/upsertShippingAllocationDraftLines/.test(persist), 'K3a with no two-call fallback');
  // §K.4 — the Search timeout was NOT reproduced once the contract was healthy, and nothing was tuned for it.
  ok(/NOT REPRODUCED AFTER CONTRACT RECOVERY/.test(DOC), 'K4  the read-path finding is recorded as not reproduced');
  eq(Number((DBAPI.match(/var KM_WRITE_TIMEOUT_MS_ = (\d+);/) || [])[1]), 90000, 'K4a and no timeout was raised to mask it');
  eq(Number((DBAPI.match(/var KM_READ_TIMEOUT_MS_ = (\d+);/) || [])[1]), 45000, 'K4b read bound unchanged');
})();

// ================================================================================================================
section('§N — THE SUBMIT GROUPING DECISION IS RECORDED, AND 11_ IS UNTOUCHED');
// ================================================================================================================
(function () {
  var G11 = read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs');
  // F1-7N-FC-1A — DERIVED, NOT PINNED. "11_ still declares its pre-A2 build" was A2-R4's way of saying
  // "I did not touch the Submit owner", and it was true. It cannot stay an equality: FC-1A changes 11_ so a
  // failed Execution Commit is reported instead of swallowed. The durable property is that the file and the
  // deployment manifest agree — a stamp nobody expects and an expectation no file declares are the two
  // halves of a partial sync. The grouping decision A2-R4 actually froze is asserted separately below.
  var _n1g63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
  var _n1Expected = ((_n1g63.match(/\{ file: '11_shipping_plan_handlers\.gs',[^}]*expected: '([^']+)'/) || [])[1]) || '(no manifest entry)';
  eq((G11.match(/var SP_BUILD_VERSION_ = '([^']+)'/) || [])[1], _n1Expected,
    'N1  11_ declares exactly the build its deployment manifest expects (' + _n1Expected + ')');
  var groupKey = extractFn(G11, 'shippingPlanRouteGroupKey_');
  ok(!/allocation_draft_id/.test(groupKey), 'N2  allocation_draft_id was NOT added to the plan group key (§N)');
  ok(/§N|A2-R4/.test(DOC.slice(DOC.indexOf('A2-R4'))), 'N3  and the decision is recorded');
})();

// ================================================================================================================
section('DEPLOYMENT');
// ================================================================================================================
(function () {
  var stamp = (G16.match(/var SAD_BUILD_VERSION_ = '([^']+)'/) || [])[1];
  ok(RO.stampAtOrAfter(stamp, 'F1-7N-FB-4G-A2-R3-R1'), 'P1  the 16_ owner stamp is at or after the previous round');
  eq((G63.match(/symbol: 'SAD_BUILD_VERSION_', expected: '([^']+)'/) || [])[1], stamp,
    'P2  and the manifest expects what the source declares');
  var APP = RO.currentAppToken();
  ok(RO.tokenAtOrAfter(APP, 'fb4ga2r3r1-savefix-20260903'), 'P3  the cache token is at or after the previous round');
  var INDEX = read('index.html');
  // RESTATED (F1-7N-FC-1A-R1-HF1): this was `=== 18`. The count is not the property — "rotated TOGETHER"
  // is — and the literal made a round that covers one more asset look like a half-updated deployment. Now
  // derived: no entry is left behind on a superseded application token. See _release-order.js staleAppTokenRefs.
  eq(RO.staleAppTokenRefs(INDEX).join(' | '), '',
    'P4  applied to the whole co-deployed set (' + RO.appTokenRefCount(INDEX) + ' refs on ' + APP + ')');
  eq(INDEX.indexOf('fb4ga2r3r1-savefix-20260903'), -1, 'P5  and the previous token is retired');
  eq((G63.match(/symbol: 'ROSEND_DIAG_BUILD_VERSION_', expected: '([^']+)'/) || [])[1],
     (G66.match(/var ROSEND_DIAG_BUILD_VERSION_ = '([^']+)'/) || [])[1],
     'P6  the diagnostic owner manifest matches 66_\'s declaration');
})();

// ================================================================================================================
section('§L — THE READ-ONLY EDIT-REPLACEMENT CENSUS');
(function () {
  var CEN = read('assets/tools/apps-script-diagnostics/TEMP_edit_replacement_census_a2_r4.gs');
  // The claim is not "no write happened" but "no write handle was ever obtained". The audit runs over CODE
  // with the report's own printed strings stripped, so prose that names a verb cannot mask a real call.
  var body = code(CEN).replace(/p\([\s\S]*?\);/g, 'p();').replace(/'[^']*'/g, "''");
  [['setValue', 1], ['appendRow', 2], ['deleteRow', 3], ['clearContent', 4], ['setValues', 5],
   ['insertColumn', 6], ['deleteColumn', 7], ['getScriptLock', 8], ['PropertiesService', 9],
   ['UrlFetchApp', 10], ['MailApp', 11], ['DriveApp', 12]].forEach(function (pair) {
    ok(body.indexOf(pair[0]) === -1, 'L' + pair[1] + '  the census never names ' + pair[0] + ' in code');
  });
  ok(/function facade\(name\)/.test(body), 'L13 every sheet goes through the read-only facade');
  eq((CEN.match(/^function TEMP_[A-Z0-9_]+\(/gm) || []).length, 1, 'L14 exactly ONE entry point');
  ok(/DB_WRITES=0/.test(CEN) && /REPAIRS=0/.test(CEN), 'L15 it states its own zero-write, zero-repair result');
  // §L — the six classes, and the refusal to classify by shape.
  ['LEGITIMATE_EXISTING_ROUTE', 'LEGITIMATE_EXPLICIT_ADD_ROUTE', 'EDIT_REPLACEMENT_CANDIDATE',
   'CANCELLED_BY_EDIT_CANDIDATE', 'ORPHAN_HEADER', 'UNKNOWN'].forEach(function (c, i) {
    ok(CEN.indexOf(c) !== -1, 'L16.' + (i + 1) + '  it reports the class ' + c);
  });
  ok(/deliberately NOT used as/.test(CEN) || /shape was deliberately NOT used/.test(CEN),
    'L17 and refuses to attribute a row by a shared K2/K4 shape');
  ok(/create_idempotency_key/.test(CEN), 'L18 the only stored provenance evidence is named');
  ok(/CANDIDATES, not findings/.test(CEN), 'L19 the two candidate classes are labelled as candidates');
  ok(!/repair|restore/i.test(code(CEN).replace(/p\([\s\S]*?\);/g, 'p();')), 'L20 and nothing in its code repairs or restores');
})();

section('§O — MUTATIONS. Each is applied to shipped source and must be caught.');
// ================================================================================================================

// O1 — an UPDATE turned into a CREATE.
mut('O1  a persisted route saved as a CREATE', function () {
  resetDb();
  var r = route({ shipping_method: 'sea' }); saveTicket(r);
  var before = activeH().length;
  r.planned_qty = 900;
  var res = saveTicket(r, { intent: 'CREATE_NEW_ROUTE' });
  // Honest (M1): the edit updates in place and the Qty lands.
  return !(res.ok && activeH().length === before && String(L()[0].planned_qty) === '900');
});

// O2 — a field change cancels the old header.
mut('O2  a field change that cancels the stored line', function () {
  // F1-7N-FC-1B-E2 — `row.route_incomplete = true;` is no longer unique in this function: E2's composer
  // branch sets it too, and mutateFn replaces the FIRST match, so this mutation had begun landing in the
  // composer branch and doing nothing here. Anchored on the PERSISTED-route branch by including the line
  // that follows it, which only that branch has. The mutant and the invariant are unchanged: a field change
  // must not queue a soft-cancel of the stored line.
  var m = mutateFn(PAGE, '_saveAllocationDraftFromDom',
    "            row.route_incomplete = true;\n            row.allocation_draft_line_id = lineId;",
    "            (_pendingDraftCancels[sku] = _pendingDraftCancels[sku] || []).push({ line_id: lineId, allocation_draft_id: boundDraftId });\n            row.route_incomplete = true;\n            row.allocation_draft_line_id = lineId;");
  var c = buildCollector({ pageSrc: m });
  var el = c.addRow({ instanceId: 'CRI-M2', lineId: 'SADL-K2-M2', draftId: 'SADH-K4-M2', groupKey: 'g',
    toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c.collect(SKU);
  el.fields.method.value = '';
  c.collect(SKU);
  return (c.env._pendingDraftCancels[SKU] || []).length > 0;   // C3 asserts it stays empty
});

// O3 — a field change builds a replacement identity.
mut('O3  a field change that erases the persisted identity', function () {
  var m = mutateFn(PAGE, '_saveAllocationDraftFromDom',
    '            row.allocation_draft_line_id = lineId;      ',
    "            row.allocation_draft_line_id = ''; row.allocation_draft_id = '';      ");
  var c = buildCollector({ pageSrc: m });
  var el = c.addRow({ instanceId: 'CRI-M3', lineId: 'SADL-K2-M3', draftId: 'SADH-K4-M3', groupKey: 'g',
    toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c.collect(SKU);
  el.fields.method.value = '';
  c.collect(SKU);
  var r = c.rows()[0];
  return String(r.allocation_draft_line_id || '') === '';   // C2a asserts it is kept
});

// O4 — the DOM becomes the identity owner again.
mut('O4  identity read from the DOM only, so a re-render loses it', function () {
  var m = mutateFn(PAGE, '_saveAllocationDraftFromDom',
    "        var boundDraftId = rowEl.getAttribute('data-draft-id') ||\n            String((_priorRow && _priorRow.allocation_draft_id) || '');",
    "        var boundDraftId = rowEl.getAttribute('data-draft-id') || '';");
  var c = buildCollector({ pageSrc: m });
  var el = c.addRow({ instanceId: 'CRI-M4', lineId: 'SADL-K2-M4', draftId: 'SADH-K4-M4', groupKey: 'g',
    toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c.collect(SKU);
  el.removeAttribute('data-draft-id');
  c.collect(SKU);
  return String(c.rows()[0].allocation_draft_id || '') === '';   // D1 asserts it is recovered
});

// O5 — the header sweep cancels on an editor state again.
mut('O5  the sweep treating an incomplete route as not using its header', function () {
  var m = mutateFn(PAGE, '_irCancelUnusedDraftHeaders_',
    '                var id = String(r.allocation_draft_id || \'\').trim();\n                if (id) stillUsed[id] = 1;',
    '                if (!_isRouteComplete(r)) return;\n                var id = String(r.allocation_draft_id || \'\').trim();\n                if (id) stillUsed[id] = 1;');
  var c = buildCollector({ pageSrc: m });
  var el = c.addRow({ instanceId: 'CRI-M5', lineId: 'SADL-K2-M5', draftId: 'SADH-K4-M5', groupKey: 'g',
    toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c.collect(SKU);
  c.env.replenAllocationDraft.allocationDraftIds = ['SADH-K4-M5'];
  el.fields.method.value = '';
  c.collect(SKU);
  c.sweep(SKU);
  return c.env.cancelledHeaders.length > 0;   // C7 asserts zero
});

// O6 — a Qty change stops marking the route dirty.
mut('O6  a Qty change that does not mark the route dirty', function () {
  var m = PAGE.replace(/var IR_ROUTE_PERSISTABLE_FIELDS = \[[^\]]*\]/,
    "var IR_ROUTE_PERSISTABLE_FIELDS = ['source_warehouse_id', 'destination_warehouse_id', 'destination_marketplace', 'shipping_method', 'last_mile_delivery']");
  var c = buildCollector({ pageSrc: m });
  var el = c.addRow({ instanceId: 'CRI-M6', lineId: 'SADL-K2-M6', draftId: 'SADH-K4-M6', groupKey: 'g',
    toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c.collect(SKU);
  c.env._draftDbTouched[SKU] = {};
  el.fields.qty.value = '500';
  c.collect(SKU);
  return c.touched(SKU).length === 0;   // G7 asserts it IS dirty
});

// O7 — a Method change stops marking the route dirty.
mut('O7  a Method change that does not mark the route dirty', function () {
  var m = PAGE.replace(/var IR_ROUTE_PERSISTABLE_FIELDS = \[[^\]]*\]/,
    "var IR_ROUTE_PERSISTABLE_FIELDS = ['source_warehouse_id', 'destination_warehouse_id', 'destination_marketplace', 'qty']");
  var c = buildCollector({ pageSrc: m });
  var el = c.addRow({ instanceId: 'CRI-M7', lineId: 'SADL-K2-M7', draftId: 'SADH-K4-M7', groupKey: 'g',
    toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c.collect(SKU);
  c.env._draftDbTouched[SKU] = {};
  el.fields.method.value = 'air';
  c.collect(SKU);
  return c.touched(SKU).length === 0;   // G8 asserts it IS dirty
});

// O8 — a pure re-render marks everything dirty.
mut('O8  a programmatic re-render that marks the route dirty', function () {
  var m = mutateFn(PAGE, '_saveAllocationDraftFromDom',
    '        var changed = isNew || (_irRouteSignature_(prior) !== _irRouteSignature_(r));',
    '        var changed = true;');
  var c = buildCollector({ pageSrc: m });
  c.addRow({ instanceId: 'CRI-M8', lineId: 'SADL-K2-M8', draftId: 'SADH-K4-M8', groupKey: 'g',
    toMarketplace: 'Amazon', method: 'sea', qty: 120 });
  c.collect(SKU);
  c.env._draftDbTouched[SKU] = {};
  c.collect(SKU);
  return c.touched(SKU).length > 0;   // G10 asserts nothing is marked
});

// O9 — an incomplete route is written to the DB anyway.
mut('O9  writing a route that is not complete', function () {
  var flush = code(extractFn(PAGE, '_flushDraftDbPersist'));
  var m = mutateFn(PAGE, '_flushDraftDbPersist',
    '        var complete = _scoped.filter(_isRouteComplete);',
    '        var complete = _scoped;');
  var x = code(extractFn(m, '_flushDraftDbPersist'));
  return /_scoped\.filter\(_isRouteComplete\)/.test(flush) && !/_scoped\.filter\(_isRouteComplete\)/.test(x);
});

// O10 — an incomplete route is skipped in silence.
// RESTATED (F1-7N-FC-1B-E3-R2): the mutation targeted `if (_incomplete.length)`, the gate R2 replaced. The
// SILENCE this catches is the same one §G.8 removed; only the gate's name changed.
mut('O10 skipping a dirty-but-incomplete route without saying so', function () {
  var m = mutateFn(PAGE, '_flushDraftDbPersist',
    '        if (_hintRows.length) {',
    '        if (false) {');
  var x = code(extractFn(m, '_flushDraftDbPersist'));
  return !/_irIncompleteRouteNotice_\(sku, _hintRows\)/.test(x) || !/if \(_hintRows\.length\)/.test(x);
});

// O11 — the version the server returned is not adopted.
mut('O11 not adopting the version the UPDATE returned', function () {
  resetDb();
  var r = route({ shipping_method: 'sea' }); saveTicket(r);
  var stale = r.draft_version;
  r.planned_qty = 500; saveTicket(r);
  // Honest: the row's version moved with the server's.
  return String(r.draft_version) !== String(stale) && String(r.draft_version) === String(activeH()[0].draft_version);
});

// O12 — Add Route stops creating.
mut('O12 + Add Route that no longer creates', function () {
  var m = mutateFn(PAGE, 'addExecutionRoute',
    '    var _added = _renderExecutionRoute(sku, {',
    '    return false;');
  var c = buildCollector({ pageSrc: m });
  var before = c.env.rendered;
  c.addRoute(null, SKU);
  return c.env.rendered === before;   // K2 asserts it adds
});

// O13 — an Add Route retry duplicates.
mut('O13 an Add Route retry that mints a second ticket', function () {
  resetDb();
  var a = route({ shipping_method: 'sea' });
  saveTicket(a, { createKey: 'K-DUP' });
  var b = route({ shipping_method: 'sea' });
  saveTicket(b, { createKey: 'K-OTHER' });      // a DIFFERENT key is a different click
  var twoClicks = activeH().length;
  resetDb();
  var c1 = route({ shipping_method: 'sea' }); saveTicket(c1, { createKey: 'K-SAME' });
  var c2 = route({ shipping_method: 'sea' }); saveTicket(c2, { createKey: 'K-SAME' });
  return twoClicks === 2 && activeH().length === 1;   // same key must NOT duplicate
});

// O14 — the required action goes back to a TEMP owner.
mut('O14 the required diagnostic action owned by a TEMP file again', function () {
  var ALL_GS = fs.readdirSync(path.join(ROOT, 'assets/specs/active/apps-script')).filter(function (f) { return /\.gs$/.test(f); });
  var owners = ALL_GS.filter(function (f) {
    return /function\s+handleRequestOrderSendDiagnosticStatus_\s*\(/.test(read('assets/specs/active/apps-script/' + f));
  });
  return owners.length === 1 && !/^TEMP_/.test(owners[0]);
});

// O15 — a contract mismatch still allows editing.
mut('O15 adding a route on a deployment that cannot save it', function () {
  var m = mutateFn(PAGE, 'addExecutionRoute',
    "    if (!(window.KM && window.KM.DB && typeof window.KM.DB.upsertShippingAllocationDraftAtomic === 'function')) {",
    '    if (false) {');
  var c = buildCollector({ pageSrc: m, noAtomic: true });
  var before = c.env.rendered;
  c.addRoute(null, SKU);
  return c.env.rendered > before;   // K1 asserts it renders nothing
});

// O16 — an explicit delete stops asking.
mut('O16 an explicit delete that cancels a stored ticket without asking', function () {
  var m = mutateFn(PAGE, 'removeExecutionRoute',
    '            if (!_goCancel) return false;      ',
    '            _goCancel = true;      ');
  var x = code(extractFn(m, 'removeExecutionRoute'));
  return !/if \(!_goCancel\) return false;/.test(x);
});

// O17 — a cancelled call site with no explicit authority.
mut('O17 a new cancel call site reachable from an edit path', function () {
  var m = mutateFn(PAGE, '_irQueueStaleGroupCancels_',
    '            r.route_group_key = g.groupKey;',
    "            if (typeof _cancelAllocationDraftLine === 'function') _cancelAllocationDraftLine(prevLine, prevDraft);\n            r.route_group_key = g.groupKey;");
  var callers = [];
  ['_irDispatchLineCancels_', '_irCancelUnusedDraftHeaders_', 'removeExecutionRoute', '_irQueueStaleGroupCancels_'].forEach(function (fn) {
    var body = code(extractFn(m, fn));
    if (/_cancelAllocationDraftLine\(|_cancelAllocationDraftHeader\(/.test(body)) callers.push(fn);
  });
  return callers.length > 3;   // I1 asserts exactly three, and none of them an edit path
});

// ================================================================================================================
section('RESULT');
console.log('\n' + pass + ' passed, ' + fail + ' failed.  mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed.');
process.exit(fail ? 1 : 0);
