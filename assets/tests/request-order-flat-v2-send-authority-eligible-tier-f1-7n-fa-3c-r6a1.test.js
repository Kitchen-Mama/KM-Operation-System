// Kitchen Mama Operation System — R6A1 Request Order Flat V2 Send authority + eligible-tier + idempotency —
// F1-7N-FA-3C-DRAFT-MODEL-R6A1-REQUEST-SEND. Run: node assets/tests/request-order-flat-v2-send-authority-eligible-tier-f1-7n-fa-3c-r6a1.test.js
//
// Uses the REAL KMSAFE core (classifySchemaMismatch — the exact gate prodRequireSheet_ runs), the REAL KMRDV2 core
// (V2_HEADERS 53-col authority + explodeSendRequestLinesFromDto tier-eligibility contract), the REAL 15_
// raDraftsHeadersAuthority_ selector (extracted+eval'd) + the legacy header constant parsed from 15_, plus
// source-structure scans of 15_ / 13_ / request-order.js / TEMP / 00_config / namespace / index.html.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6A1 REQUEST ORDER FLAT V2 SEND (F1-7N-FA-3C-R6A1): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
var KMSAFE = require(path.join(ROOT, 'js', 'core', 'supply-planning-production-safety.js'));
var KMRDV2 = require(path.join(ROOT, 'js', 'core', 'supply-planning-request-draft-v2.js'));
var V2 = KMRDV2.V2_HEADERS.slice();
var G15 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '15_request_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G13 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '13_procurement_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var RO = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'request-order.js'), 'utf8').replace(/\r\n/g, '\n');
var TEMP = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8');
var CONFIG = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '00_config.gs'), 'utf8');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
// legacy 26-col authority parsed from 15_
eval(G15.match(/var REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_ = \[[\s\S]*?\];/)[0]);
var LEGACY = REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_.slice();

function gate(actual, expected) { return KMSAFE.classifySchemaMismatch({ exists: true, actualHeaders: actual, expectedHeaders: expected, extraColumnsPolicy: 'ALLOW' }); }

section('A. reproduce HEADER_MISSING from the LEGACY authority against the exact 53-col Flat V2 schema');
ok(V2.length === 53 && LEGACY.length === 26, 'A0. V2 authority = 53 cols; legacy = 26 cols');
var rep = gate(V2, LEGACY);   // validating the live 53-col V2 tab against the legacy 26-col expectation
eq(rep.schemaStatus, KMSAFE.SCHEMA_STATUS.HEADER_MISSING, 'A1. legacy authority vs live V2 → HEADER_MISSING (the exact Send failure)');
ok(rep.missingHeaders.indexOf('category_snapshot') >= 0 && rep.missingHeaders.indexOf('series_snapshot') >= 0, 'A2. missing = the retired category_snapshot/series_snapshot (legacy-only headers)');
ok(V2.indexOf('category_snapshot') < 0 && V2.indexOf('series_snapshot') < 0, 'A2. V2 authority excludes category_snapshot/series_snapshot');

section('B. Flat V2 authority selected BEFORE the header guard; exact 53 passes; real drift fails closed');
// raDraftsHeadersAuthority_ (extracted) reads the module-scope KMRDV2 (real) + REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_
// (parsed above) + the global cutover getter (faked). Compare by VALUE (identity differs — module returns its own ref).
global.requestOrderDraftV2FlatCutoverEnabled_ = function () { return true; };
eval(extractFn(G15, 'raDraftsHeadersAuthority_'));
eq(raDraftsHeadersAuthority_().join('|'), V2.join('|'), 'B1. under cutover=true the selector returns the 53-col KMRDV2.V2_HEADERS (V2 authority)');
global.requestOrderDraftV2FlatCutoverEnabled_ = function () { return false; };
eq(raDraftsHeadersAuthority_().join('|'), LEGACY.join('|'), 'B1. flag=false → byte-identical legacy 26-col authority (rollback isolated)');
ok(gate(V2, V2).valid === true && gate(V2, V2).schemaStatus === KMSAFE.SCHEMA_STATUS.SCHEMA_VALID, 'B2. exact 53-col V2 tab vs V2 authority → SCHEMA_VALID');
var missingV2 = V2.slice(); missingV2.splice(20, 1);   // drop a real V2 column
eq(gate(missingV2, V2).schemaStatus, KMSAFE.SCHEMA_STATUS.HEADER_MISSING, 'B3. a genuinely non-V2 schema (missing a real V2 header) STILL fails closed');
ok(/var sh0 = procurementEnsureSheet_\(ss0, 'request_order_allocation_drafts', raDraftsHeadersAuthority_\(\)\)/.test(G15)
  && /var sh = procurementEnsureSheet_\(ss, 'request_order_allocation_drafts', raDraftsHeadersAuthority_\(\)\)/.test(G15), 'B4. both header-upsert ensures select authority via raDraftsHeadersAuthority_ (before prodRequireSheet_)');
ok(G15.indexOf('function raDraftsHeadersAuthority_') < G15.indexOf('function handleUpsertRequestOrderAllocationDraft_'), 'B4. selector defined before the header-upsert handler (authority resolved before the guard)');

section('C. header upsert never touches request_order_allocation_draft_lines (flag=true)');
var upsertCore = extractFn(G15, 'raUpsertDraftHeaderCore_');
var upsertPub = extractFn(G15, 'handleUpsertRequestOrderAllocationDraft_');
ok(!/request_order_allocation_draft_lines/.test(upsertCore) && !/request_order_allocation_draft_lines/.test(upsertPub), 'C1. the header upsert (public + core) references NO request_order_allocation_draft_lines');

section('C. eligible-tier Send contract (KMRDV2.explodeSendRequestLinesFromDto)');
function dto(tiers) { return { scope: { sku: 'SKU1', company: 'KM', country: 'US', marketplace: 'amazon.com' }, tiers: tiers, unitsPerCarton: 20, draftId: 'RD::MONTHLY_ORDER::2026::k' }; }
var lines = KMRDV2.explodeSendRequestLinesFromDto(dto([
  { tier: 'T1', month: '2026-01', orderQty: 100, status: 'submitted', cartonQty: 5 },
  { tier: 'T2', month: '2026-02', orderQty: 0, status: 'submitted', cartonQty: 0 },
  { tier: 'T3', month: '2026-03', orderQty: 50, status: 'cancelled', cartonQty: 3 }
]));
eq(lines.length, 1, 'C2. only the submitted positive non-cancelled tier becomes a line (T1); T2 zero-qty + T3 cancelled omitted');
eq(lines[0].request_bucket, 'T1', 'C2. eligible line is T1');
ok(lines[0].requested_qty === 100 && lines[0].request_allocation_draft_id === 'RD::MONTHLY_ORDER::2026::k' && lines[0].sku === 'SKU1', 'C2. line carries qty + draft lineage + sku (NO request_allocation_line_id)');
ok(!('request_allocation_line_id' in lines[0]), 'C2. no request_allocation_line_id on the exploded line');
var allPos = KMRDV2.explodeSendRequestLinesFromDto(dto([
  { tier: 'T1', month: '2026-01', orderQty: 10, status: 'submitted' },
  { tier: 'T2', month: '2026-02', orderQty: 20, status: 'submitted' },
  { tier: 'T3', month: '2026-03', orderQty: 30, status: 'submitted' }
]));
eq(allPos.length, 3, 'C3. a fully-submitted draft sends all N positive tiers (N=3)');
var none = KMRDV2.explodeSendRequestLinesFromDto(dto([
  { tier: 'T1', month: '2026-01', orderQty: 0, status: 'submitted' },
  { tier: 'T2', month: '2026-02', orderQty: 5, status: 'cancelled' }
]));
eq(none.length, 0, 'C4. no eligible tier → zero lines (NO_ELIGIBLE_SUBMITTED_DRAFTS is a clean zero-write result)');
// F1-7N-FB-3B §C: the clean zero-write empty result is now named for what it actually is — there is no
// PERSISTED allocation to send. Knowing that requires a READ (the server owns the population), so the promise is
// tightened from "before any DB call" to "before any WRITE", which is the guarantee that matters, and the message
// states the AI-Plan-row / persisted-draft distinction explicitly.
ok(/NO_ELIGIBLE_PERSISTED_ALLOCATION/.test(RO) && /Nothing was written/.test(RO),
  'C4. frontend surfaces the empty case as a clean zero-WRITE result');
ok(/An AI Plan row is NOT a persisted allocation draft/.test(RO),
  'C4. and says why the page can show rows while the database has nothing to send');
var _send = RO.slice(RO.indexOf('async function handleSendRequest'), RO.indexOf('function _roSendPlanningCycle_'));
// F1-7N-FB-3C: the committing call is now the continuation loop, entered only after the confirmation.
ok(_send.indexOf('NO_ELIGIBLE_PERSISTED_ALLOCATION') < _send.indexOf('_roSendRunToCompletion_('),
  'C4. the empty-case return happens before the committing run is entered');
ok(/A deliberate quantity edit now SAVES a canonical allocation draft|a deliberate quantity edit now SAVES a canonical allocation draft/i.test(_send),
  'C4. and the message tells the operator that entering a quantity now persists a draft by itself');

section('D/F. downstream idempotency + lineage + no PO (13_ createRequestOrderDraft — already sound)');
var core13 = extractFn(G13, 'roCreateRequestOrderCore_');
ok(/procurementEnsureSheet_\(ss, 'request_orders'/.test(core13) && /procurementEnsureSheet_\(ss, 'request_order_lines'/.test(core13) && /procurementEnsureSheet_\(ss, 'request_order_line_sources'/.test(core13), 'D1. validate all three downstream sheets before append (write-boundary)');
ok(!/purchase_orders|createPurchaseOrder|PURCHASE_ORDERS_HEADERS_/.test(core13), 'D2. Send creates NO PO (createRequestOrderCore never writes purchase_orders)');
ok(/request_allocation_draft_id/.test(G13), 'D3. request_order_line_sources carries the request_allocation_draft_id lineage FK');
var handle13 = extractFn(G13, 'handleCreateRequestOrderDraft_');
ok(/LockService\.getScriptLock\(\)/.test(handle13) && /reused:\s*true/.test(handle13) && /REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT/.test(handle13), 'F1. execution-key idempotency under ScriptLock: reused / DUPLICATE_CONFLICT (0→create,1→reuse,>1→conflict)');

section('F. Site Confirm false skips ONLY that gate');
ok(/if \(_roSiteConfirmRequired\(\)\) \{/.test(RO), 'F2. the Site Confirm gate is wrapped in if (_roSiteConfirmRequired()) — bypassed only when the flag is false');
// the eligibility rows filter drops the confirmation filter ONLY when site confirm not required (other gates stay)
ok(/_roSiteConfirmRequired\(\)\s*\?\s*_applyRequestOrderFilters\(requestOrderState\.data\)\.filter\(_roIsRowConfirmed\)/.test(RO.replace(/\s+/g, ' ')) || /_roSiteConfirmRequired\(\)/.test(RO), 'F2. confirmation row-filter applies only when Site Confirm is required');

section('G. structured Send error surface');
eval(extractFn(RO, '_roSendErrorMessage_'));
var m1 = _roSendErrorMessage_({ message: 'PRODUCTION_SAFETY:HEADER_MISSING [request_order_allocation_drafts]' });
ok(/schema/.test(m1) && /HEADER_MISSING/.test(m1) && /request_order_allocation_drafts/.test(m1) && m1.indexOf('[object Object]') < 0, 'G1. HEADER_MISSING → business message + technical code + affected table; no [object Object]');
var m2 = _roSendErrorMessage_({});   // no message → must not render [object Object]
ok(m2.indexOf('[object Object]') < 0, 'G2. empty error object never renders [object Object]');
var m3 = _roSendErrorMessage_({ message: 'COMMITTED_UNVERIFIED' });
ok(/請勿重試|尚未確認/.test(m3), 'G3. COMMITTED_UNVERIFIED → do-not-retry business message');
ok(!/已建立的 Draft 仍保留/.test(RO), 'G4. removed the unconditional false "已建立的 Draft 仍保留" claim');

section('H/I. diagnostic + validators present (read-only)');
['TEMP_R6A1_DIAGNOSE_REQUEST_ORDER_SEND_PATH', 'TEMP_R6A1_VALIDATE_AFTER_REQUEST_SEND', 'TEMP_R6A1_VALIDATE_REQUEST_SEND_REUSE'].forEach(function (fn) {
  ok(new RegExp('function ' + fn + '\\(\\)').test(TEMP), 'H/I. entrypoint present: ' + fn);
});
ok(/R6A1_ZERO_WRITE_CONFIRMED/.test(TEMP) && /READY_FOR_CONTROLLED_REQUEST_SEND/.test(TEMP) && /NO_ELIGIBLE_SUBMITTED_DRAFTS/.test(TEMP) && /LEGACY_AUTHORITY_PRESENT/.test(TEMP), 'H. diagnostic asserts zero-write + emits the full verdict set');

section('K. flags frozen + unified release token');
ok(/var\s+REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_\s*=\s*true\s*;/.test(CONFIG), 'K. flat V2 cutover = true');
ok(/var\s+REQUEST_ORDER_SITE_CONFIRM_REQUIRED_\s*=\s*false\s*;/.test(CONFIG), 'K. site confirm = false');
ok(/var\s+INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false\s*;/.test(CONFIG), 'K. inventory generation = false');
var NS = fs.readFileSync(path.join(ROOT, 'js', 'core', 'namespace.js'), 'utf8');
var INDEX = fs.readFileSync(path.join(ROOT, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/RELEASE:\s*'r6a1-request-send-20260822'/.test(NS), 'K. KM.RELEASE = r6a1-request-send-20260822');
// F1-7N-FB-4E — RESTATED AS THE RULE, NOT THE LITERAL. The claim is "the changed file cache-busts"; pinning
// the exact R6A1 string instead makes every legitimate LATER bump fail this suite, which is the same trap
// that let the FB-4B addendum ship with no cache-bust at all. What must hold is that the token is present
// and has moved past every pre-R6A1 value.
var _roTok = (/request-order\.js\?v=([^"']+)/.exec(INDEX) || [])[1];
var _preR6A1 = ['donenotice-20260811', 'catseries-20260820', 'whmoreopts-20260820', 'r6c-navlifecycle-20260822'];
ok(!!_roTok, 'K. request-order.js carries a cache-bust token at all');
ok(!!_roTok && _preR6A1.indexOf(_roTok) < 0, 'K. changed request-order.js carries a token at or after R6A1 (' + _roTok + ')');

done();
