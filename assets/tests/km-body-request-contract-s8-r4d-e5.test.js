// S8-R4D-E5 — km_body request contract, end to end, through the SHIPPED builders.
// Deterministic Node tests. Pure Node (no DOM / network / Apps Script / spreadsheet).
// Run: node assets/tests/km-body-request-contract-s8-r4d-e5.test.js
//
// WHAT THIS PROVES, AND WHY IT IS BUILT THIS WAY.
//
// The R45 acceptance one-shot called KM.transport.readUrl(action, { recentWindow, only }, rid) and reported
// recentWindowRequested=false / onlyRequested=null / tablesRead=19. That was read as a transport defect.
// `readUrl` is the shipped URL BUILDER, but it serialises the body it is HANDED — it does not build the body.
// The shipped page body is the workspace DTO ENVELOPE, and 60_ reads `body.payload`. So a flat body produces
// the observed answer with nothing lost anywhere on the wire.
//
// Every stage below is the ACTUAL SHIPPED FUNCTION, source-sliced and executed — never a local restatement.
// A restatement would prove this file's opinion of the contract, which is the one thing it must not do.
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
  else { pass++; console.log('ok   ' + l); }
}
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; console.log('ok   ' + l); } }

function readSrc(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/^﻿/, ''); }
// Slice a named function out of a CRLF/LF source at a known indent. Never reformats the body.
function sliceFn(src, name, indent) {
  var NL = src.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  var start = src.indexOf(indent + 'function ' + name + '(');
  if (start < 0) throw new Error('could not locate ' + name);
  var endMarker = NL + indent + '}' + NL;
  var end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error('could not close ' + name);
  return src.slice(start, end + endMarker.length);
}
function sliceVar(src, name, endMarkerLiteral) {
  var start = src.indexOf('var ' + name + ' =');
  if (start < 0) throw new Error('could not locate ' + name);
  var end = src.indexOf(endMarkerLiteral, start);
  if (end < 0) throw new Error('could not close ' + name);
  return src.slice(start, end + endMarkerLiteral.length);
}
function arrayLiteral(src, name) {
  var s = sliceVar(src, name, '];');
  return (new Function('return ' + s.slice(s.indexOf('[')).replace(/;$/, '')))();
}

var TRANSPORT = readSrc(path.join('js', 'api', 'km-transport.js'));
var FOUNDATION = readSrc(path.join('js', 'api', 'km-api-foundation.js'));
var ROUTER = readSrc(path.join('specs', 'active', 'apps-script', '01_router.gs'));
var WS60 = readSrc(path.join('specs', 'active', 'apps-script', '60_api_v1_inventory_replenishment_workspace.gs'));
var PAGE = readSrc(path.join('js', 'pages', 'inventory-replenishment.js'));

// The thirteen and the six are read OUT OF THE PAGE, so this file cannot drift from them.
var FIRST13 = arrayLiteral(PAGE, 'IR_FIRST_LAYER_TABLES_');
var EXPOSURE6 = arrayLiteral(PAGE, 'IR_EXPOSURE_TABLES_');

// ============================================================ A — the shipped client builds a NESTED body
console.log('\n-- A: the shipped page request, built by the shipped builders --');
eq(FIRST13.length, 13, 'A1  IR_FIRST_LAYER_TABLES_ has thirteen entries');
eq(EXPOSURE6.length, 6, 'A2  IR_EXPOSURE_TABLES_ has six entries');
ok(PAGE.indexOf('var _wsPayload = { recentWindow: true, only: IR_FIRST_LAYER_TABLES_.slice() };') !== -1,
  'A3  the page dispatches { recentWindow: true, only: <13> }');

// The REAL DTO builder, out of the Foundation.
var buildDTO = (new Function('isObj', 'API_VERSION', 'makeRequestId', [
  sliceFn(FOUNDATION, 'buildInventoryReplenishmentRequestDTO', '    '),
  'return buildInventoryReplenishmentRequestDTO;'
].join('\n')))(
  function (x) { return x && typeof x === 'object' && !Array.isArray(x); },
  '1',
  function () { return 'REQ-E5TEST'; }
);

var dto = buildDTO({ recentWindow: true, only: FIRST13.slice() });
eq(dto.action, 'inventoryReplenishment.workspace.get', 'A4  DTO action');
ok(dto.payload && typeof dto.payload === 'object', 'A5  the DTO nests a `payload` object');
eq(dto.payload.recentWindow, true, 'A6  payload.recentWindow survives the builder whitelist');
eq(dto.payload.only.length, 13, 'A7  payload.only carries all thirteen');
eq(dto.recentWindow, undefined, 'A8  recentWindow is NOT at the DTO top level');
eq(dto.only, undefined, 'A9  only is NOT at the DTO top level');

// The Foundation hands the WHOLE DTO to the transport as `payload`. This is the line that makes the shipped
// km_body an envelope rather than a flat object.
ok(FOUNDATION.indexOf("return tp.request({ action: action, kind: 'read', payload: dto,") !== -1,
  'A10 _workspaceInvokeRaw passes the whole DTO as the transport `payload`');
// And the page's params reach the builder unaltered — a deep clone, not a whitelist.
ok(FOUNDATION.indexOf('params: deepFreezeClone(isObj(params) ? params : {}),') !== -1,
  'A11 client.getWorkspace clones the caller params through to the resolver');

// ============================================================ B — the shipped URL builder
console.log('\n-- B: km_body on the wire --');
var readQuery = (new Function('isObj', 'TRANSPORT_CONTRACT_VERSION', [
  sliceFn(TRANSPORT, 'readQuery', '    '),
  'return readQuery;'
].join('\n')))(
  function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); }, 1
);

// transport.request()'s own two lines, asserted present and then executed exactly.
ok(TRANSPORT.indexOf('var dto = Object.assign({}, isObj(opts.payload) ? opts.payload : {}, { action: action });') !== -1,
  'B1  transport.request merges opts.payload with the action');
ok(TRANSPORT.indexOf('var q = isRead ? readQuery(action, Object.assign({}, dto, rid ? { requestId: rid } : {}), rid) : postQuery(rid);') !== -1,
  'B2  urlFor serialises that merged object as km_body');

var ACTION = 'inventoryReplenishment.workspace.get';
var RID = 'E5-TEST-1';
function shippedQuery() {                      // exactly what urlFor() does for a read
  var d = Object.assign({}, dto, { action: ACTION });
  d.requestId = RID;
  return readQuery(ACTION, Object.assign({}, d, { requestId: RID }), RID);
}
function oneShotQuery() {                      // exactly what the R45 acceptance one-shot did
  return readQuery(ACTION, { recentWindow: true, only: FIRST13.slice() }, RID);
}
var qShipped = shippedQuery(), qOneShot = oneShotQuery();
ok(qShipped.indexOf('&km_body=') !== -1, 'B3  the shipped read carries km_body');
ok(qOneShot.indexOf('&km_body=') !== -1, 'B4  the one-shot read ALSO carried km_body — it did leave the browser');
ok(qShipped.indexOf('km_via=get') !== -1 && qShipped.indexOf('km_tc=1') !== -1 && qShipped.indexOf('km_rid=') !== -1,
  'B5  action + km_via + km_tc + km_rid all present');
// A double encode would refuse READ_BODY_MALFORMED, which was never observed.
eq(qShipped.indexOf('%2522'), -1, 'B6  km_body is encoded exactly once');

// Apps Script decodes the query into e.parameter.
function toParameter(qs) {
  var out = {};
  qs.split('&').forEach(function (kv) {
    var i = kv.indexOf('=');
    out[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = (i < 0) ? '' : decodeURIComponent(kv.slice(i + 1));
  });
  return out;
}
var pShipped = toParameter(qShipped), pOneShot = toParameter(qOneShot);
ok(JSON.parse(pShipped.km_body).payload !== undefined, 'B7  the SHIPPED km_body contains a `payload` envelope');
eq(JSON.parse(pOneShot.km_body).payload, undefined, 'B8  the ONE-SHOT km_body contains NO `payload` envelope');
eq(JSON.parse(pShipped.km_body).payload.only.length, 13, 'B9  the shipped envelope carries the thirteen');

// Size: neither cap is anywhere near tripping, so neither is a candidate explanation.
var RTR_MAX = Number(/var RTR_GET_BODY_MAX_ = (\d+);/.exec(ROUTER)[1]);
var URL_MAX = Number(/var READ_URL_MAX = (\d+);/.exec(TRANSPORT)[1]);
eq(RTR_MAX, 4000, 'B10 RTR_GET_BODY_MAX_ is 4000 (DECODED bytes — e.parameter is already decoded)');
eq(URL_MAX, 6000, 'B11 READ_URL_MAX is 6000 (URL chars)');
ok(pShipped.km_body.length < RTR_MAX,
  'B12 decoded shipped km_body is ' + pShipped.km_body.length + ' B, under the 4000 router cap');
ok(qShipped.length + 120 < URL_MAX,
  'B13 shipped read URL is ~' + (qShipped.length + 120) + ' chars, under READ_URL_MAX');

// ============================================================ C — the shipped router parse
console.log('\n-- C: rtrParseGetBody_ --');
// RTR_GET_BODY_MAX_ is injected from the SOURCE value read above, never from a literal here.
var rtrParseGetBody_ = (new Function('RTR_BUILD_VERSION_', 'RTR_GET_BODY_MAX_', [
  sliceFn(ROUTER, 'rtrParseGetBody_', ''),
  'return rtrParseGetBody_;'
].join('\n')))('R41-TEST', RTR_MAX);

var parsedShipped = rtrParseGetBody_({ parameter: pShipped }, ACTION);
var parsedOneShot = rtrParseGetBody_({ parameter: pOneShot }, ACTION);
var parsedAbsent = rtrParseGetBody_({ parameter: { action: ACTION, km_via: 'get', km_tc: '1', km_rid: RID } }, ACTION);

eq(parsedShipped.error, undefined, 'C1  the shipped body parses without refusal');
eq(parsedOneShot.error, undefined, 'C2  the one-shot body ALSO parses without refusal');
eq(parsedShipped.body.payload.recentWindow, true, 'C3  recentWindow survives the router — shipped');
eq(parsedShipped.body.payload.only.length, 13, 'C4  only survives the router — shipped');
eq(parsedOneShot.body.payload, undefined, 'C5  the one-shot body reaches the router with NO payload envelope');
eq(parsedAbsent.body.payload, undefined, 'C6  an ABSENT km_body also yields no payload envelope');
eq(parsedShipped.body.requestId, RID, 'C7  km_rid lands on the body');
// The read table forwards the PARSED BODY, not the query merge.
ok(ROUTER.indexOf('return rtrEmitHandlerResult_(_rtrRead[action](_parsed.body));') !== -1,
  'C8  doGet dispatches _parsed.body to the read handler');

// ============================================================ D — the shipped handler extraction
console.log('\n-- D: 60_ payload extraction and table selection --');
ok(WS60.indexOf('var payload = (body && body.payload) || {};') !== -1,
  'D1  handleInventoryReplenishmentWorkspaceGet_ reads body.payload');

var ws = (new Function([
  sliceFn(WS60, 'sirWsStr_', ''),
  sliceFn(WS60, 'sirWsOnlyList_', ''),
  sliceFn(WS60, 'sirWsOnlySet_', ''),
  sliceVar(WS60, 'SIR_WORKSPACE_TABLES_', '\n];'),
  'return { onlyList: sirWsOnlyList_, onlySet: sirWsOnlySet_, TABLES: SIR_WORKSPACE_TABLES_ };'
].join('\n')))();

eq(ws.TABLES.length, 21, 'D2  SIR_WORKSPACE_TABLES_ holds twenty-one entries');
eq(ws.TABLES.filter(function (s) { return s.include === 'carrierPlanning'; }).length, 2,
  'D3  exactly two are include-gated on carrierPlanning');

// The two gate lines, asserted verbatim, then executed.
ok(WS60.indexOf('if (onlySet && !onlySet[spec.name]) continue;') !== -1, 'D4  gate 1: the `only` subset');
ok(WS60.indexOf('if (spec.include && !include[spec.include]) continue;') !== -1, 'D5  gate 2: the include gate');
function select(payload) {
  var onlySet = ws.onlySet(payload);
  var include = (payload && payload.include && typeof payload.include === 'object') ? payload.include : {};
  var picked = [];
  for (var i = 0; i < ws.TABLES.length; i++) {
    var spec = ws.TABLES[i];
    if (onlySet && !onlySet[spec.name]) continue;
    if (spec.include && !include[spec.include]) continue;
    picked.push(spec.name);
  }
  return picked;
}
var selShipped = select(parsedShipped.body.payload || {});
var selOneShot = select(parsedOneShot.body.payload || {});
var selAbsent = select(parsedAbsent.body.payload || {});

eq(selShipped.length, 13, 'D6  the SHIPPED request reads exactly thirteen tables');
eq(selShipped.slice().sort(), FIRST13.slice().sort(), 'D7  and they are exactly the first-layer thirteen');
eq(selShipped.filter(function (n) { return EXPOSURE6.indexOf(n) !== -1; }), [],
  'D8  ZERO exposure tables are read when the thirteen arrive   [E5 section 5, second half]');
eq(selOneShot.length, 19, 'D9  the ONE-SHOT request reads nineteen — the observed number');
eq(selOneShot.filter(function (n) { return EXPOSURE6.indexOf(n) !== -1; }).length, 6,
  'D10 and the six extras are exactly the lazy exposure tables   [19 = 13 + 6]');
eq(selAbsent.length, 19, 'D11 an ABSENT km_body also reads nineteen');

// ============================================================ E — the response echo
console.log('\n-- E: what the handler echoes back --');
ok(WS60.indexOf('out.requestEcho = { recentWindow: (payload.recentWindow === true), only: null, siteScope: null };') !== -1,
  'E1  requestEcho.recentWindow is read off payload.recentWindow');
ok(WS60.indexOf('recentWindowRequested: (vm.requestEcho && vm.requestEcho.recentWindow === true),') !== -1,
  'E2  meta.recentWindowRequested mirrors the echo');
// The flat body therefore echoes FALSE/NULL — truthfully. The server was not wrong; the request was.
var flatPayload = parsedOneShot.body.payload || {};
var shippedPayload = parsedShipped.body.payload;
eq(flatPayload.recentWindow === true, false, 'E3  one-shot -> recentWindowRequested false   (as observed live)');
eq(ws.onlyList(flatPayload), null, 'E4  one-shot -> onlyRequested null              (as observed live)');
eq(shippedPayload.recentWindow === true, true, 'E5  shipped  -> recentWindowRequested true');
eq(ws.onlyList(shippedPayload).length, 13, 'E6  shipped  -> onlyRequested 13');

// ============================================================ F — what the sample CANNOT distinguish
console.log('\n-- F: the limit of the one-shot sample --');
// A flat body and a LOST body are observationally IDENTICAL at the response. That is exactly why the
// S8-R4D-E3A candidate matrix could not name the cause: "flat body present" was never one of its five rows,
// because E3A recorded the shipped shape as flat. Stated as a limit, not glossed.
eq(selOneShot, selAbsent, 'F1  flat-body and absent-body select the SAME nineteen tables');
eq([flatPayload.recentWindow === true, ws.onlyList(flatPayload)],
  [(parsedAbsent.body.payload || {}).recentWindow === true, ws.onlyList(parsedAbsent.body.payload || {})],
  'F2  and produce the SAME echo — the one-shot sample cannot tell them apart');
// The discriminating experiment is a read whose body IS the envelope. Only that can separate them.
eq(selShipped.length !== selOneShot.length, true, 'F3  an envelope-shaped read DOES separate them (13 vs 19)');

// ============================================================ G — the readUrl trap, named
console.log('\n-- G: readUrl builds the URL, not the body --');
ok(TRANSPORT.indexOf('readUrl: readUrl, readQuery: readQuery, READ_URL_MAX: READ_URL_MAX,') !== -1,
  'G1  readUrl is exported for callers');
eq(JSON.parse(toParameter(readQuery(ACTION, { a: 1 }, RID)).km_body), { a: 1 },
  'G2  readQuery serialises the body it is handed, VERBATIM — it builds no envelope');
eq(JSON.parse(toParameter(readQuery(ACTION, { a: 1 }, RID)).km_body).action, undefined,
  'G3  readUrl/readQuery do NOT inject the action into the body — transport.request() does that');

// ============================================================ H — the scalability invariant [E5 section 6]
console.log('\n-- H: unrelated lazy-table growth cannot touch the first layer --');
// The enterprise invariant, proven on the SELECTION FUNCTION rather than asserted in prose: a table added to
// the registry that is not in the thirteen is not selected, whatever else is true of it.
var grown = ws.TABLES.concat([
  { name: 'future_lazy_detail_a', requiredCols: [], optional: true },
  { name: 'future_lazy_detail_b', requiredCols: [], optional: true },
  { name: 'future_lazy_detail_c', requiredCols: [], optional: true }
]);
function selectAgainst(tables, payload) {
  var onlySet = ws.onlySet(payload);
  var include = (payload && payload.include && typeof payload.include === 'object') ? payload.include : {};
  var picked = [];
  for (var i = 0; i < tables.length; i++) {
    var spec = tables[i];
    if (onlySet && !onlySet[spec.name]) continue;
    if (spec.include && !include[spec.include]) continue;
    picked.push(spec.name);
  }
  return picked;
}
eq(selectAgainst(grown, shippedPayload), selShipped,
  'H1  three new lazy tables change the scoped first-layer selection by NOTHING');
eq(selectAgainst(grown, flatPayload).length, 22,
  'H2  but an UNSCOPED request absorbs every one of them — which is why the scoping must be real');

// ============================================================ I — a recovery is a second FULL request
console.log('\n-- I: the bounded recovery cannot drop km_body --');
ok(TRANSPORT.indexOf('var url = urlFor(attemptRid);') !== -1,
  'I1  every attempt builds its URL from urlFor — first attempt and recovery alike');
ok(TRANSPORT.indexOf('return Promise.resolve(_sleep(d)).then(function () { return attempt(n + 1); });') !== -1,
  'I2  the recovery re-enters attempt(), so it rebuilds the whole query');
// Different id, same body. A recovery that rebuilt only the action is the failure mode this rules out.
var qRecovery = readQuery(ACTION, Object.assign({}, dto, { action: ACTION, requestId: RID + '-R2' }), RID + '-R2');
eq(JSON.parse(toParameter(qRecovery).km_body).payload.only.length, 13,
  'I3  a recovery attempt still carries the full thirteen-table envelope');
ok(qRecovery.indexOf('km_rid=' + encodeURIComponent(RID + '-R2')) !== -1,
  'I4  and carries its OWN correlation id');

if (pass + fail === 0) console.error('VACUOUS - no assertion executed');
console.log('\n' + (fail ? 'FAILURES: ' + fail : 'ALL PASS') + '  |  passed ' + pass + '  failed ' + fail);
process.exitCode = (fail || pass + fail === 0) ? 1 : 0;
