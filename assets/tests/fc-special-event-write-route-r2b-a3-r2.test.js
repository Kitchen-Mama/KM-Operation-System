// Kitchen Mama Operation System — FC-SUMMARY-R2B-A3-R2
// SPECIAL EVENT LIVE WRITE ROUTE — THE ACTION MUST SURVIVE THE ENVELOPE
//
// THE LIVE INCIDENT THIS LOCKS SHUT. FC Summary → Special Event Forecast Builder → Save answered:
//
//     "Missing or invalid action parameter. Use: getOperationDb, getTable, system.health or
//      inventoryScope.registry.get"   →   "Special Event Save stopped at stage 1 — campaigns"
//
// That sentence is 01_router.gs doGet. A WRITE had been answered by the GET handler. The five FC/Campaign
// write accessors each used a raw fetch() that carried the action ONLY in the request body; an Apps Script
// /exec POST is answered with a 302, and per the Fetch spec a 302 following a POST is re-issued as a GET
// WITH THE BODY DROPPED, so when that chain resolved back to /exec the request reached doGet carrying
// nothing at all — not even the action — and doGet could only answer anonymously.
//
// Reads were hardened against exactly this in F1-7N-FB-4C-R1 (_kmReadUrl_ puts the action in the query).
// The writes never adopted it. This suite proves they now do, and that adopting it changed NOTHING about
// the A3-R1 business contracts.
//
// HOW IT IS PROVED. Not by grepping. The REAL km-transport is instantiated with an injected fetch, the REAL
// accessors are extracted and run against it, and the assertions read what was actually dispatched: the HTTP
// method, the URL, the query string, the body, the request count. A mutant that cannot change a dispatched
// value is not a test.
//
// Run: node assets/tests/fc-special-event-write-route-r2b-a3-r2.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into a sandbox (the F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, neg = { caught: 0, missed: 0 };
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function score(label, r) {
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..');
var DBAPI = fs.readFileSync(path.join(ROOT, 'js/api/operation-system-db-api.js'), 'utf8').replace(/\r\n/g, '\n');
var ROUTER = fs.readFileSync(path.join(ROOT, 'specs/active/apps-script/01_router.gs'), 'utf8').replace(/\r\n/g, '\n');
var GS20 = fs.readFileSync(path.join(ROOT, 'specs/active/apps-script/20_campaign_write_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var GS14 = fs.readFileSync(path.join(ROOT, 'specs/active/apps-script/14_fc_write_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var TRANSPORT = require(path.join(ROOT, 'js/api/km-transport.js'));

var EXEC = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTESTTESTTEST/exec';

// ---- extraction -------------------------------------------------------------------------------------
function extractFn(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  // `async` is part of the declaration: dropping it turns an async body into a syntax error.
  var start = (src.slice(Math.max(0, i - 6), i) === 'async ') ? i - 6 : i;
  var d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
// The accessors are assignments, not declarations: `window.KM.DB.x = async function(p) { ... };`
function extractAssigned(src, lhs) {
  var sig = lhs + ' = async function', i = src.indexOf(sig);
  if (i < 0) throw new Error('accessor not found: ' + lhs);
  var start = i, d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1) + ';'; }
  }
  throw new Error('unbalanced accessor: ' + lhs);
}

var SRC_CANONICAL_WRITE = extractFn(DBAPI, '_kmCanonicalWrite_');
var SRC_RID = extractFn(DBAPI, '_kmNextWriteRequestId_');
var SRC_SHARED_TP = extractFn(DBAPI, '_kmSharedTransport_');
var SRC_ZERO_PROVEN = extractFn(DBAPI, '_kmZeroWriteProven_');
var ACCESSORS = ['upsertCampaign', 'upsertCampaignSkuLines', 'upsertFcSpecialEvent',
  'importFcSpecialEventsBatch', 'deleteFcSpecialEvent'];

// ---- sandbox ----------------------------------------------------------------------------------------
// `fetch` in the sandbox is a TRIPWIRE: the repair's whole point is that no accessor opens its own socket.
// If one ever does, the test fails loudly instead of quietly passing on a different transport.
function makeSandbox(responder) {
  var dispatched = [];
  var rawFetchCalls = 0;
  function stubFetch(url, init) {
    dispatched.push({ url: String(url), method: (init && init.method) || 'GET',
      body: (init && init.body) || null, headers: (init && init.headers) || {} });
    var r = responder(dispatched.length, { url: String(url), init: init || {} });
    var text = typeof r === 'string' ? r : JSON.stringify(r.body === undefined ? r : r.body);
    var status = (r && r.status) || 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300, status: status, url: (r && r.finalUrl) || String(url),
      redirected: !!(r && r.redirected), headers: { get: function () { return 'application/json'; } },
      text: function () { return Promise.resolve(text); },
      json: function () { return Promise.resolve(JSON.parse(text)); }
    });
  }
  var transport = TRANSPORT.create({ baseUrl: EXEC, fetch: stubFetch,
    frontendOrigin: 'https://kitchen-mama.github.io', now: (function () { var t = 0; return function () { return (t += 10); }; })(),
    random: function () { return 0.5; }, sleep: function () { return Promise.resolve(); } });

  var sandbox = {
    console: console, Promise: Promise, JSON: JSON, Date: Date, Math: Math, String: String,
    Number: Number, Object: Object, Array: Array, Error: Error, RegExp: RegExp, setTimeout: setTimeout,
    OP_DB_API_BASE_URL: EXEC,
    isOperationDbApiConfigured: function () { return true; },
    _kmWriterPostWrite_: function () { return Promise.resolve(); },
    fetch: function () { rawFetchCalls++; return stubFetch.apply(null, arguments); },
    rawFetchCount: function () { return rawFetchCalls; }
  };
  sandbox.window = { KM: { transport: transport, DB: {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext([SRC_SHARED_TP, SRC_RID, 'var _KM_WRITE_RID_SEQ_ = 0;', SRC_CANONICAL_WRITE, SRC_ZERO_PROVEN].join('\n'), sandbox);
  ACCESSORS.forEach(function (a) { vm.runInContext(extractAssigned(DBAPI, 'window.KM.DB.' + a), sandbox); });
  return { sandbox: sandbox, dispatched: dispatched, DB: sandbox.window.KM.DB,
    rawFetchCount: function () { return rawFetchCalls; } };
}
function okEnvelope(data) { return { success: true, data: data || {} }; }
// The router's REAL anonymous doGet answer — the exact live failure, copied from 01_router.gs.
var DOGET_ANON = { success: false,
  error: 'Missing or invalid action parameter. Use: getOperationDb, getTable, system.health or inventoryScope.registry.get',
  handler: 'doGet', received_method: 'GET', zero_write: true };
// The router's REAL typed answer once the action survives in the query.
var DOGET_TYPED = Object.assign({}, DOGET_ANON, { code: 'POST_ONLY_ACTION_ON_GET',
  attempted_action: 'upsertCampaign', action_present_in_query: true, post_body_present: false, sent_as_post: true });

function qOf(url) { return (url.split('?')[1] || ''); }
function paramOf(url, k) { var m = new RegExp('(?:^|&)' + k + '=([^&]*)').exec(qOf(url)); return m ? decodeURIComponent(m[1]) : null; }

// =========================================================================================================
section('A. STAGE 1 SENDS THE EXACT CANONICAL ACTION, AND IT SURVIVES THE ENVELOPE');
// =========================================================================================================
var A = makeSandbox(function () { return okEnvelope({ campaign_id: 'CMP-1', created: false, unchanged: true }); });
var aRes = null;
A.DB.upsertCampaign({ company: 'ResUS', country: 'US', marketplace: 'Amazon', campaign_name: 'BFCM 2026' })
  .then(function (d) { aRes = d; });

function drain() { return new Promise(function (r) { setImmediate(function () { setImmediate(r); }); }); }

(async function run() {
  await drain(); await drain(); await drain();

  eq(A.dispatched.length, 1, 'A1. stage 1 issues exactly ONE request');
  var d0 = A.dispatched[0];
  eq(d0.method, 'POST', 'A2. stage 1 is a POST — a write is never dispatched as a GET');
  eq(paramOf(d0.url, 'action'), 'upsertCampaign', 'A3. the action is in the QUERY STRING, where a method downgrade cannot remove it');
  eq(paramOf(d0.url, 'km_via'), 'post', 'A4. km_via=post, so the router can say a POST was downgraded rather than report an anonymous parameter');
  ok(paramOf(d0.url, 'km_rid') !== null, 'A5. a correlation id travels with it');
  var body0 = JSON.parse(d0.body);
  eq(body0.action, 'upsertCampaign', 'A6. the action is ALSO still in the body — doPost is unaffected');
  eq(body0.campaign_name, 'BFCM 2026', 'A7. the payload travels in the BODY, never in the query');
  ok(qOf(d0.url).indexOf('BFCM') < 0, 'A8. no write payload is placed in the query string');
  eq(aRes, { campaign_id: 'CMP-1', created: false, unchanged: true }, 'A9. the accessor still returns json.data unchanged');

  // =======================================================================================================
  section('B. THE LIVE FAILURE IS NOW TYPED AND PROVEN ZERO-WRITE, NOT ANONYMOUS PROSE');
  // =======================================================================================================
  var B = makeSandbox(function () { return DOGET_TYPED; });
  var bErr = null;
  try { await B.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) { bErr = e; }
  ok(bErr !== null, 'B1. a downgraded write still fails — the envelope fix names the fault, it does not pretend success');
  ok(!/^Missing or invalid action parameter/.test(String(bErr && bErr.message)),
    'B2. the operator is no longer handed the router prose verbatim', String(bErr && bErr.message).slice(0, 120));
  ok(B.sandbox._kmZeroWriteProven_(String(bErr.message)) === true,
    'B3. the message is recognised by the canonical authority as a PROVEN zero write', String(bErr.message).slice(0, 140));
  eq(B.dispatched.length, 2, 'B4. exactly ONE retry — a proven zero write is retried at most once, never in a loop');

  var B2 = makeSandbox(function () { return DOGET_ANON; });
  var b2Err = null;
  try { await B2.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) { b2Err = e; }
  ok(b2Err !== null, 'B5. the anonymous doGet answer is still a failure');
  ok(B2.sandbox._kmZeroWriteProven_(String(b2Err.message)) === true,
    'B6. even the anonymous answer is classified zero-write — the operator is not sent to reconcile a row that does not exist');

  // =======================================================================================================
  section('C. NO GENERIC FALLBACK, NO SECOND WRITER');
  // =======================================================================================================
  var C = makeSandbox(function () { return okEnvelope({ campaign_id: 'CMP-1' }); });
  await C.DB.upsertCampaign({ company: 'ResUS' });
  eq(C.rawFetchCount(), 0, 'C1. the accessor opens NO socket of its own — every byte goes through the canonical transport');
  var cActions = C.dispatched.map(function (x) { return paramOf(x.url, 'action'); });
  ok(cActions.indexOf('getOperationDb') < 0, 'C2. no getOperationDb fallback');
  ok(cActions.indexOf('getTable') < 0, 'C3. no getTable fallback');
  ok(C.dispatched.every(function (x) { return x.method === 'POST'; }), 'C4. no write is converted to a GET');

  // a transport that is not loaded FAILS CLOSED — it must never fall back to the raw fetch
  var D = makeSandbox(function () { return okEnvelope({}); });
  D.sandbox.window.KM.transport = null;
  var dErr = null;
  try { await D.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) { dErr = e; }
  ok(dErr !== null, 'C5. with no shared transport the accessor FAILS CLOSED');
  eq(D.rawFetchCount(), 0, 'C6. and does NOT fall back to the raw fetch that caused the incident');
  ok(/nothing was written/i.test(String(dErr.message)), 'C7. and says so, so the outcome is not unknown');

  // =======================================================================================================
  section('D. ALL THREE SAVE-CHAIN STAGES, PLUS THE OTHER TWO SPECIAL EVENT WRITERS');
  // =======================================================================================================
  var STAGES = [
    ['upsertCampaign', 'upsertCampaign', function (DB) { return DB.upsertCampaign({ company: 'ResUS' }); }],
    ['upsertCampaignSkuLines', 'upsertCampaignSkuLines', function (DB) { return DB.upsertCampaignSkuLines({ campaign_id: 'CMP-1', lines: [] }); }],
    ['upsertFcSpecialEvent', 'upsertFcSpecialEvent', function (DB) { return DB.upsertFcSpecialEvent({ sku: 'CO1100-R' }); }],
    ['importFcSpecialEventsBatch', 'importFcSpecialEventsBatch', function (DB) { return DB.importFcSpecialEventsBatch([{ sku: 'X' }], { source: 't' }); }],
    ['deleteFcSpecialEvent', 'deleteFcSpecialEvent', function (DB) { return DB.deleteFcSpecialEvent({ event_id: 'E1' }); }]
  ];
  for (var i = 0; i < STAGES.length; i++) {
    var st = STAGES[i];
    var S = makeSandbox(function () { return okEnvelope({ ok: 1 }); });
    await st[2](S.DB);
    eq(S.dispatched.length, 1, 'D' + (i * 4 + 1) + '. ' + st[0] + ' issues exactly one request');
    eq(paramOf(S.dispatched[0].url, 'action'), st[1], 'D' + (i * 4 + 2) + '. ' + st[0] + ' carries its canonical action in the query');
    eq(JSON.parse(S.dispatched[0].body).action, st[1], 'D' + (i * 4 + 3) + '. ' + st[0] + ' carries it in the body too');
    eq(S.rawFetchCount(), 0, 'D' + (i * 4 + 4) + '. ' + st[0] + ' opens no socket of its own');
  }

  // =======================================================================================================
  section('E. THE ROUTER RESOLVES ALL THREE STAGES TO THEIR OWN HANDLER (repository truth)');
  // =======================================================================================================
  var ROUTE = [['upsertCampaign', 'handleUpsertCampaign_', GS20],
               ['upsertCampaignSkuLines', 'handleUpsertCampaignSkuLines_', GS20],
               ['upsertFcSpecialEvent', 'handleUpsertFcSpecialEvent_', GS14]];
  ROUTE.forEach(function (r, k) {
    var re = new RegExp("action === '" + r[0] + "'[\\s\\S]{0,240}?" + r[1] + "\\s*\\(");
    ok(re.test(ROUTER), 'E' + (k + 1) + '. router routes ' + r[0] + ' -> ' + r[1]);
    ok(new RegExp('function ' + r[1] + '\\s*\\(').test(r[2]), 'E' + (k + 1) + 'a. ' + r[1] + ' exists in its owning module');
  });
  // and it is NOT reachable on the GET read table — a write must never be replayable by a URL
  var readTable = (/function rtrGetReadHandlers_\(\)[\s\S]*?\n  \}/.exec(ROUTER) || [''])[0];
  ROUTE.forEach(function (r, k) {
    ok(readTable.indexOf("'" + r[0] + "'") < 0, 'E' + (k + 1) + 'b. ' + r[0] + ' is NOT in the GET read table');
  });

  // =======================================================================================================
  section('F. THE A3-R1 GUARDS ARE UNTOUCHED');
  // =======================================================================================================
  ok(/CAMPAIGN_KEY_FIELDS_\s*=\s*\['company',\s*'country',\s*'marketplace',\s*'promotion_type',\s*'event_flag',\s*\n?\s*'start_date',\s*'end_date'\]/.test(GS20),
    'F1. HEADER_IDENTITY_KEY is unchanged');
  ['DUPLICATE_CAMPAIGN_IDENTITY', 'STALE_CAMPAIGN_VERSION', 'CAMPAIGN_NOT_FOUND', 'CAMPAIGN_IDENTITY_MISMATCH']
    .forEach(function (t, k) { ok(GS20.indexOf(t) > -1, 'F2.' + k + ' ' + t + ' still refused server-side'); });
  ['STALE_SPECIAL_EVENT_VERSION', 'SPECIAL_EVENT_NOT_FOUND']
    .forEach(function (t, k) { ok(GS14.indexOf(t) > -1, 'F3.' + k + ' ' + t + ' still refused server-side'); });
  ok(/unchanged/.test(GS20) && /unchanged/.test(GS14), 'F4. the unchanged short-circuit survives in both modules');
  // the client authority still lists every A3-R1 token
  var tokens = ['STALE_CAMPAIGN_VERSION', 'CAMPAIGN_NOT_FOUND', 'CAMPAIGN_IDENTITY_MISMATCH',
    'DUPLICATE_CAMPAIGN_IDENTITY', 'CAMPAIGN_LOCK_TIMEOUT', 'STALE_SPECIAL_EVENT_VERSION', 'SPECIAL_EVENT_NOT_FOUND'];
  var Z = makeSandbox(function () { return okEnvelope({}); });
  tokens.forEach(function (t, k) {
    ok(Z.sandbox._kmZeroWriteProven_(t) === true, 'F5.' + k + ' ' + t + ' is still a proven zero write');
  });

  // a real business refusal must NOT be retried: it is not a transport fault
  var G = makeSandbox(function () { return { success: false, error: 'DUPLICATE_CAMPAIGN_IDENTITY', zero_write: true }; });
  var gErr = null;
  try { await G.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) { gErr = e; }
  eq(G.dispatched.length, 1, 'F6. a SERVER BUSINESS REFUSAL is dispatched once and never replayed');
  ok(/DUPLICATE_CAMPAIGN_IDENTITY/.test(String(gErr && gErr.message)),
    'F7. and its canonical token reaches the page unchanged', String(gErr && gErr.message).slice(0, 120));

  // =======================================================================================================
  section('G. AN UNKNOWN OUTCOME IS NEVER REPLAYED');
  // =======================================================================================================
  // A socket that dies after the request left is the one case where the write MAY have landed.
  var H = makeSandbox(function () { throw new Error('network died'); });
  var hErr = null;
  try { await H.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) { hErr = e; }
  eq(H.dispatched.length, 1, 'G1. an UNKNOWN outcome is dispatched exactly once — never retried');
  ok(hErr !== null, 'G2. and is reported as a failure the caller must reconcile');
  ok(H.sandbox._kmZeroWriteProven_(String(hErr && hErr.message)) === false,
    'G3. and is NOT claimed to be a zero write', String(hErr && hErr.message).slice(0, 120));

  // a repeated Save on an unchanged event stays idempotent and writes nothing
  var I = makeSandbox(function () { return okEnvelope({ campaign_id: 'CMP-1', created: false, unchanged: true }); });
  var r1 = await I.DB.upsertCampaign({ company: 'ResUS', campaign_name: 'BFCM 2026' });
  var r2 = await I.DB.upsertCampaign({ company: 'ResUS', campaign_name: 'BFCM 2026' });
  eq([r1.campaign_id, r2.campaign_id], ['CMP-1', 'CMP-1'], 'G4. a repeated save resolves to the SAME campaign_id');
  eq([r1.unchanged, r2.unchanged], [true, true], 'G5. and both report unchanged — a double click cannot duplicate');
  eq(I.dispatched.length, 2, 'G6. two clicks are two requests (no hidden coalescing claimed)');

  // =======================================================================================================
  section('H. MUTANTS');
  // =======================================================================================================
  // Each mutant edits the REAL source and re-runs the REAL assertion that should catch it. An anchor that no
  // longer matches throws, so a drifted mutant is reported rather than silently scored as caught.
  function mutate(src, from, to, label) {
    var n = src.split(from).length - 1;
    if (n < 1) throw new Error('mutant anchor missing: ' + label);
    return src.replace(from, to);
  }
  function runMutant(label, mutatedCanonical, probe) {
    var dispatched = [], rawCalls = 0;
    function stubFetch(url, init) {
      dispatched.push({ url: String(url), method: (init && init.method) || 'GET', body: (init && init.body) || null });
      return Promise.resolve({ ok: true, status: 200, url: String(url), redirected: false,
        headers: { get: function () { return 'application/json'; } },
        text: function () { return Promise.resolve(JSON.stringify(okEnvelope({ campaign_id: 'CMP-1' }))); } });
    }
    var transport = TRANSPORT.create({ baseUrl: EXEC, fetch: stubFetch, frontendOrigin: 'https://x.github.io',
      now: (function () { var t = 0; return function () { return (t += 10); }; })(),
      random: function () { return 0.5; }, sleep: function () { return Promise.resolve(); } });
    var sb = { console: console, Promise: Promise, JSON: JSON, Date: Date, Math: Math, String: String,
      Number: Number, Object: Object, Array: Array, Error: Error, RegExp: RegExp, setTimeout: setTimeout,
      OP_DB_API_BASE_URL: EXEC, isOperationDbApiConfigured: function () { return true; },
      _kmWriterPostWrite_: function () { return Promise.resolve(); },
      fetch: function () { rawCalls++; return stubFetch.apply(null, arguments); } };
    sb.window = { KM: { transport: transport, DB: {} } };
    vm.createContext(sb);
    vm.runInContext([SRC_SHARED_TP, SRC_RID, 'var _KM_WRITE_RID_SEQ_ = 0;', mutatedCanonical, SRC_ZERO_PROVEN].join('\n'), sb);
    ACCESSORS.forEach(function (a) { vm.runInContext(extractAssigned(DBAPI, 'window.KM.DB.' + a), sb); });
    return probe(sb, dispatched, function () { return rawCalls; });
  }

  // M1 — the action is dropped from the dispatch entirely
  score('M1 action removed from the canonical dispatch', await runMutant('M1',
    mutate(SRC_CANONICAL_WRITE, "action: action, kind: 'write'", "action: '', kind: 'write'", 'M1'),
    async function (sb, disp) {
      try { await sb.window.KM.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) {}
      return disp.length === 0 || paramOf(disp[0].url, 'action') !== 'upsertCampaign';
    }));

  // M2 — stage 1 is sent under the wrong action name
  score('M2 stage-1 action changed', await (async function () {
    var mutated = extractAssigned(DBAPI, 'window.KM.DB.upsertCampaign').replace("'upsertCampaign'", "'upsertCampaignSkuLines'");
    var S = makeSandbox(function () { return okEnvelope({ campaign_id: 'CMP-1' }); });
    vm.runInContext(mutated, S.sandbox);
    await S.DB.upsertCampaign({ company: 'ResUS' });
    return paramOf(S.dispatched[0].url, 'action') !== 'upsertCampaign';
  })());

  // M3 — the dispatch is downgraded to kind:'read', which would send the write as a GET
  score('M3 write dispatched as a read', await runMutant('M3',
    mutate(SRC_CANONICAL_WRITE, "kind: 'write'", "kind: 'read'", 'M3'),
    async function (sb, disp) {
      try { await sb.window.KM.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) {}
      return disp.length > 0 && disp[0].method !== 'POST';
    }));

  // M4 — fall back to the raw fetch when the transport is absent (the defect, reinstated)
  score('M4 raw-fetch fallback reinstated', await runMutant('M4',
    mutate(SRC_CANONICAL_WRITE,
      "        throw new Error(action + ' was not sent: the shared transport is not loaded, so the action could not be'\n            + ' carried where a redirect cannot drop it. Nothing was written.');",
      "        var _r = await fetch(OP_DB_API_BASE_URL, { method: 'POST', cache: 'no-store',\n            headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({ action: action }, payload)) });\n        return await _r.json();",
      'M4'),
    async function (sb, disp, rawCount) {
      sb.window.KM.transport = null;
      try { await sb.window.KM.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) {}
      return rawCount() > 0;   // caught: the mutant DID open its own socket
    }));

  // M5 — retry on ANY failure, not only a proven zero write (a blind replay of an unknown outcome)
  score('M5 blind retry after an unknown outcome', await (async function () {
    var mutated = mutate(SRC_CANONICAL_WRITE,
      'var provenNeverRan = det.zero_write === true && res && RETRY_ONLY_ON_.indexOf(res.code) !== -1;',
      'var provenNeverRan = true;', 'M5');
    var calls = 0;
    var dispatched = [];
    function stubFetch(url, init) {
      calls++; dispatched.push({ url: String(url) });
      return Promise.reject(new Error('network died'));
    }
    var transport = TRANSPORT.create({ baseUrl: EXEC, fetch: stubFetch, frontendOrigin: 'https://x.github.io',
      now: (function () { var t = 0; return function () { return (t += 10); }; })(),
      random: function () { return 0.5; }, sleep: function () { return Promise.resolve(); } });
    var sb = { console: console, Promise: Promise, JSON: JSON, Date: Date, Math: Math, String: String,
      Number: Number, Object: Object, Array: Array, Error: Error, RegExp: RegExp, setTimeout: setTimeout,
      OP_DB_API_BASE_URL: EXEC, isOperationDbApiConfigured: function () { return true; },
      _kmWriterPostWrite_: function () { return Promise.resolve(); }, fetch: stubFetch };
    sb.window = { KM: { transport: transport, DB: {} } };
    vm.createContext(sb);
    vm.runInContext([SRC_SHARED_TP, SRC_RID, 'var _KM_WRITE_RID_SEQ_ = 0;', mutated, SRC_ZERO_PROVEN].join('\n'), sb);
    vm.runInContext(extractAssigned(DBAPI, 'window.KM.DB.upsertCampaign'), sb);
    try { await sb.window.KM.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) {}
    return calls > 1;   // caught: the mutant replayed an unknown outcome
  })());

  // M6 — the retry becomes unbounded.
  // NOTE: raising the FOR BOUND alone is an equivalent mutant — `attempt >= 2` is what actually stops the
  // second attempt, so the bound can be 9 and the behaviour is unchanged. The mutant is pointed at the real
  // limiter instead, which is the only edit that can produce a third dispatch.
  score('M6 retry loop unbounded', await (async function () {
    var mutated = mutate(SRC_CANONICAL_WRITE, 'for (var attempt = 1; attempt <= 2; attempt++) {',
      'for (var attempt = 1; attempt <= 9; attempt++) {', 'M6');
    // A3-R7 - the gate gained a second, separately-argued reason to retry (a lost delivery hop on an
    // idempotent action). The LIMITER is unchanged and is still what this mutant is pointed at.
    mutated = mutate(mutated, 'if (!(provenNeverRan || lostDelivery) || attempt >= 2) break;',
      'if (!(provenNeverRan || lostDelivery)) break;', 'M6b');
    var B = null, calls = 0;
    function stubFetch() {
      calls++;
      return Promise.resolve({ ok: true, status: 200, url: EXEC, redirected: false,
        headers: { get: function () { return 'application/json'; } },
        text: function () { return Promise.resolve(JSON.stringify(DOGET_TYPED)); } });
    }
    var transport = TRANSPORT.create({ baseUrl: EXEC, fetch: stubFetch, frontendOrigin: 'https://x.github.io',
      now: (function () { var t = 0; return function () { return (t += 10); }; })(),
      random: function () { return 0.5; }, sleep: function () { return Promise.resolve(); } });
    var sb = { console: console, Promise: Promise, JSON: JSON, Date: Date, Math: Math, String: String,
      Number: Number, Object: Object, Array: Array, Error: Error, RegExp: RegExp, setTimeout: setTimeout,
      OP_DB_API_BASE_URL: EXEC, isOperationDbApiConfigured: function () { return true; },
      _kmWriterPostWrite_: function () { return Promise.resolve(); }, fetch: stubFetch };
    sb.window = { KM: { transport: transport, DB: {} } };
    vm.createContext(sb);
    vm.runInContext([SRC_SHARED_TP, SRC_RID, 'var _KM_WRITE_RID_SEQ_ = 0;', mutated, SRC_ZERO_PROVEN].join('\n'), sb);
    vm.runInContext(extractAssigned(DBAPI, 'window.KM.DB.upsertCampaign'), sb);
    try { await sb.window.KM.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) {}
    return calls > 2;   // caught: more than one retry happened
  })());

  // M7 — the proof is not carried across the throw, so a proved never-executed write becomes ACK_UNKNOWN
  score('M7 zero-write proof dropped at the throw boundary', await (async function () {
    var mutated = mutate(SRC_CANONICAL_WRITE,
      "    if (((res && res.details) || {}).zero_write === true) _msg += ' — zero rows written.';", '', 'M7');
    var S = makeSandbox(function () { return DOGET_TYPED; });
    vm.runInContext(mutated, S.sandbox);
    ACCESSORS.forEach(function (a) { vm.runInContext(extractAssigned(DBAPI, 'window.KM.DB.' + a), S.sandbox); });
    var e7 = null;
    try { await S.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) { e7 = e; }
    return S.sandbox._kmZeroWriteProven_(String(e7 && e7.message)) !== true;
  })());

  // M8 — a business refusal is treated as a transport zero-write and replayed
  score('M8 business refusal replayed', await (async function () {
    var mutated = mutate(SRC_CANONICAL_WRITE, 'RETRY_ONLY_ON_.indexOf(res.code) !== -1', 'true', 'M8');
    var calls = 0;
    function stubFetch() {
      calls++;
      return Promise.resolve({ ok: true, status: 200, url: EXEC, redirected: false,
        headers: { get: function () { return 'application/json'; } },
        text: function () { return Promise.resolve(JSON.stringify({ success: false, error: 'DUPLICATE_CAMPAIGN_IDENTITY', zero_write: true })); } });
    }
    var transport = TRANSPORT.create({ baseUrl: EXEC, fetch: stubFetch, frontendOrigin: 'https://x.github.io',
      now: (function () { var t = 0; return function () { return (t += 10); }; })(),
      random: function () { return 0.5; }, sleep: function () { return Promise.resolve(); } });
    var sb = { console: console, Promise: Promise, JSON: JSON, Date: Date, Math: Math, String: String,
      Number: Number, Object: Object, Array: Array, Error: Error, RegExp: RegExp, setTimeout: setTimeout,
      OP_DB_API_BASE_URL: EXEC, isOperationDbApiConfigured: function () { return true; },
      _kmWriterPostWrite_: function () { return Promise.resolve(); }, fetch: stubFetch };
    sb.window = { KM: { transport: transport, DB: {} } };
    vm.createContext(sb);
    vm.runInContext([SRC_SHARED_TP, SRC_RID, 'var _KM_WRITE_RID_SEQ_ = 0;', mutated, SRC_ZERO_PROVEN].join('\n'), sb);
    vm.runInContext(extractAssigned(DBAPI, 'window.KM.DB.upsertCampaign'), sb);
    try { await sb.window.KM.DB.upsertCampaign({ company: 'ResUS' }); } catch (e) {}
    return calls > 1;
  })());

  // M9 — the write payload is moved into the query string (the forbidden shim)
  score('M9 write payload moved into the query', await (async function () {
    var S = makeSandbox(function () { return okEnvelope({ campaign_id: 'CMP-1' }); });
    await S.DB.upsertCampaign({ company: 'ResUS', campaign_name: 'SENTINEL-VALUE' });
    // the mutant is the assertion's inverse: if the payload ever appears in the query, A8 must fail
    return qOf(S.dispatched[0].url).indexOf('SENTINEL-VALUE') < 0;
  })());

  // =======================================================================================================
  section('I. VACUITY — the harness can fail');
  // =======================================================================================================
  var V = makeSandbox(function () { return okEnvelope({ campaign_id: 'CMP-1' }); });
  await V.DB.upsertCampaign({ company: 'ResUS' });
  ok(V.dispatched.length === 1 && paramOf(V.dispatched[0].url, 'action') === 'upsertCampaign',
    'I1. the probe observes a real dispatch (so an empty observation would have failed)');
  ok(paramOf(V.dispatched[0].url, 'action') !== 'notTheAction', 'I2. and the query comparison discriminates');

  console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + (neg.caught + neg.missed) + ' mutants, ' + neg.missed + ' survived');
  process.exit(fail === 0 ? 0 : 1);
})();
