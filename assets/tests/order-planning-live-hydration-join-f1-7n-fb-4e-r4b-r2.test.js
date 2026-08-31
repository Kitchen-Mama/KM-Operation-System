// F1-7N-FB-4E-R4B-R2 — ORDER PLANNING LIVE HYDRATION JOIN CLOSURE.
//
// THE CONTRACT TEST THE PREVIOUS ROUNDS DID NOT HAVE. A server-only test and a client-only test both passed
// against the broken system, because the defect lived exactly between them: the router's GET dispatch wrapped a
// handler that already returned a ContentService TextOutput, and JSON.stringify(TextOutput) is "{}". So this
// file runs the REAL Apps Script files and the SHIPPED client in one pipeline and counts the quantities at every
// boundary. 92 positive and 43 zero values go in; the assertions are about how many come out, and where.
//
// Live census this fixture reproduces (user-run diagnostic, ResUS/US/Amazon):
//   52 scope rows · 45 active · 7 submitted · 92 positive Order Qty · 43 zero · 0 blank · 0 duplicate keys
//
// Run: node assets/tests/order-planning-live-hydration-join-f1-7n-fb-4e-r4b-r2.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var GS_DIR = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; } else { failed++; console.log('  FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n' + t); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var KMRDV2 = require(path.join(ROOT, 'assets/js/core/supply-planning-request-draft-v2.js'));
var KMRDV2P = require(path.join(ROOT, 'assets/js/core/supply-planning-request-draft-v2-persistence.js'));
var V2 = KMRDV2.V2_HEADERS;
var RO_SRC = read('assets/js/pages/request-order.js');
var ROUTER = read('assets/specs/active/apps-script/01_router.gs');

// =============================================================================================================
// THE FIXTURE — the live census, plus the one row that makes the All-level join provable: a SECOND company
// selling the SAME master SKU on the SAME country + marketplace.
// =============================================================================================================
var CYCLE = '2026-08';                                   // the live planning cycle
var TIER_MONTHS = ['2026-09', '2026-10', '2026-11'];     // the displayed months — deliberately NOT the cycle
var KM_QTY = [11111, 22222, 33333];                      // Kitchen Mama's SKU0 values: unmistakable if borrowed

function draftRow(o) {
  var r = {}; V2.forEach(function (h) { r[h] = ''; });
  r.request_allocation_draft_id = o.id; r.planning_cycle = CYCLE;
  r.company = o.company; r.country = o.country; r.marketplace = o.marketplace; r.sku = o.sku;
  r.status = o.status || 'draft'; r.draft_purpose = 'regular'; r.draft_version = 1;
  r.generation_type = 'ai_plan'; r.units_per_carton = 12;
  ['T1', 'T2', 'T3'].forEach(function (t, i) {
    var p = t.toLowerCase() + '_';
    r[p + 'month'] = TIER_MONTHS[i];
    r[p + 'order_qty'] = o.qty[i];
    r[p + 'recommended_qty'] = o.qty[i] === 0 ? 500 : (o.qty[i] + 40);   // a recommendation that must never win
    r[p + 'status'] = 'draft'; r[p + 'user_edited'] = 'FALSE';
  });
  return r;
}
var FLAT = [], POS = 0, ZERO = 0;
for (var i = 0; i < 45; i++) {
  var q = [];
  for (var t = 0; t < 3; t++) { var z = ((i * 3 + t) % 135) < 43; q.push(z ? 0 : (100 + i * 3 + t)); if (z) ZERO++; else POS++; }
  FLAT.push(draftRow({ id: 'RD-A' + i, company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SKU' + i, qty: q, status: 'draft' }));
}
for (var s = 0; s < 7; s++) FLAT.push(draftRow({ id: 'RD-S' + s, company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SUB' + s, qty: [700, 800, 900], status: 'submitted' }));
FLAT.push(draftRow({ id: 'RD-KM0', company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', sku: 'SKU0', qty: KM_QTY, status: 'draft' }));

eq([POS, ZERO], [92, 43], '0.1 the fixture reproduces the live census: 92 positive, 43 zero');
eq(FLAT.length, 53, '0.2 45 active + 7 submitted + 1 second-company row');

// =============================================================================================================
// THE APPS SCRIPT SIDE — every real .gs file, all writes forbidden, and a FAITHFUL ContentService.
// =============================================================================================================
var GS_FILES = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); }).sort();
var writes = [];
function forbid(n) { return function () { writes.push(n); throw new Error('WRITE_ATTEMPTED:' + n); }; }
function tableOf(headers, objs) { return [headers.slice()].concat(objs.map(function (o) { return headers.map(function (h) { return o[h] === undefined ? '' : o[h]; }); })); }

var MSKU_H = ['marketplace_sku_id', 'marketplace_id', 'company', 'country', 'marketplace', 'sku', 'marketplace_sku_status'];
var mskus = [];
for (var m = 0; m < 45; m++) mskus.push({ marketplace_sku_id: 'MS-A' + m, marketplace_id: 'MKT-RESUS', company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SKU' + m, marketplace_sku_status: 'active' });
mskus.push({ marketplace_sku_id: 'MS-KM0', marketplace_id: 'MKT-KM', company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', sku: 'SKU0', marketplace_sku_status: 'active' });
var GAP_H = ['company', 'country', 'marketplace', 'sku', 'calculation_status'];

var DB = {
  request_order_allocation_drafts: tableOf(V2, FLAT),
  marketplace_skus: tableOf(MSKU_H, mskus),
  order_planning_gap: tableOf(GAP_H, mskus.map(function (o) { return { company: o.company, country: o.country, marketplace: o.marketplace, sku: o.sku, calculation_status: 'READY' }; }))
};
function sheet(name) {
  var tb = DB[name];
  return { getName: function () { return name; }, getLastRow: function () { return tb.length; }, getLastColumn: function () { return tb[0].length; },
    getDataRange: function () { return { getValues: function () { return tb.map(function (r) { return r.slice(); }); } }; },
    getRange: function (row, col, nr, nc) {
      var r0 = Math.max(1, row || 1) - 1, c0 = Math.max(1, col || 1) - 1, win = [];
      for (var a = 0; a < (nr || 1); a++) { var src = tb[r0 + a] || [], line = []; for (var b = 0; b < (nc || 1); b++) line.push(src[c0 + b] === undefined ? '' : src[c0 + b]); win.push(line); }
      return { setValue: forbid('setValue'), setValues: forbid('setValues'), clearContent: forbid('clearContent'), getValue: function () { return win[0][0]; }, getValues: function () { return win; } };
    },
    appendRow: forbid('appendRow'), deleteRow: forbid('deleteRow'), clear: forbid('clear'), clearContents: forbid('clearContents') };
}
var ss = { getSheetByName: function (n) { return DB[n] ? sheet(n) : null; },
  getId: function () { return '1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk'; }, getName: function () { return 'TEST'; },
  insertSheet: forbid('insertSheet'), deleteSheet: forbid('deleteSheet'), getSheets: function () { return Object.keys(DB).map(sheet); } };
var gsSb = {
  console: { log: function () {} }, JSON: JSON, Math: Math, Date: Date, Array: Array, Object: Object, String: String,
  Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
  encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
  ContentService: { MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
    // FAITHFUL: a real TextOutput has NO enumerable own properties, so JSON.stringify(it) === "{}". An enumerable
    // field would have hidden the double-wrap behind something that still looked like a payload.
    createTextOutput: function (txt) { var o = { setMimeType: function () { return this; }, getContent: function () { return txt; } };
      Object.defineProperty(o, '__textOutput', { value: true, enumerable: false }); return o; } },
  Utilities: { getUuid: function () { return 'UUID'; }, formatDate: function () { return '2026-08-31'; }, sleep: function () {}, base64Encode: function (x) { return String(x); } },
  Logger: { log: function () {} },
  SpreadsheetApp: { openById: function () { return ss; }, getActiveSpreadsheet: function () { return ss; } },
  PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: forbid('setProperty') }; } },
  Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; }, getScriptTimeZone: function () { return 'Asia/Taipei'; } },
  LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, waitLock: function () {}, releaseLock: function () {} }; } },
  CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } },
  DriveApp: {}, UrlFetchApp: {}, MailApp: {}, GmailApp: {}, HtmlService: {}, ScriptApp: { newTrigger: forbid('newTrigger') }
};
gsSb.globalThis = gsSb;
var gsCtx = vm.createContext(gsSb);
GS_FILES.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(GS_DIR, f), 'utf8'), gsCtx, { filename: f }); });

// =============================================================================================================
// CENSUS — the same measure at every boundary, so the numbers are comparable.
// =============================================================================================================
function censusCells(pred) {
  var c = { rows: 0, positive: 0, zero: 0 };
  FLAT.forEach(function (r) { if (!pred(r)) return; c.rows++; ['t1', 't2', 't3'].forEach(function (p) { var v = r[p + '_order_qty']; if (Number(v) === 0) c.zero++; else if (Number(v) > 0) c.positive++; }); });
  return c;
}
function censusDtos(dtos) {
  var c = { rows: 0, positive: 0, zero: 0, cycles: {}, tierMonths: {} };
  (dtos || []).forEach(function (d) { c.rows++; c.cycles[d.planningCycle] = 1;
    (d.tiers || []).forEach(function (t) { c.tierMonths[t.month] = 1; if (t.orderQty === 0) c.zero++; else if (Number(t.orderQty) > 0) c.positive++; }); });
  c.cycles = Object.keys(c.cycles); c.tierMonths = Object.keys(c.tierMonths).sort();
  return c;
}
function censusClient(map) {
  var c = { keys: 0, positive: 0, zero: 0, blank: 0, cycles: {}, tierMonths: {} };
  Object.keys(map || {}).forEach(function (k) { var d = map[k]; c.keys++; if (d.planningCycle) c.cycles[d.planningCycle] = 1;
    Object.keys(d.lines || {}).forEach(function (b) { var l = d.lines[b]; if (l.request_month) c.tierMonths[l.request_month] = 1;
      var v = l.order_qty; if (v === '' || v == null) c.blank++; else if (Number(v) === 0) c.zero++; else if (Number(v) > 0) c.positive++; }); });
  c.cycles = Object.keys(c.cycles); c.tierMonths = Object.keys(c.tierMonths).sort();
  return c;
}

// =============================================================================================================
// §1 — THE CENSUS AT EVERY BOUNDARY, AND THE ONE THAT USED TO BE ZERO.
// =============================================================================================================
section('§1 boundary census — sheet → filter → handler → envelope → client → row model → input');

var RESUS = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var B0 = censusCells(function (r) { return r.company === 'ResUS' && r.status === 'draft'; });
eq(B0, { rows: 45, positive: 92, zero: 43 }, 'B0 SHEET CELLS');

var built = gsSb.rprBuildSheetSet_(ss, ['request_order_allocation_drafts']);
var B1dtos = gsSb.KMRDV2P.readActiveFlatForScope(built.set, { planningCycle: '', businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', draft_purpose: 'regular' } });
var B1 = censusDtos(B1dtos);
eq([B1.rows, B1.positive, B1.zero], [45, 92, 43], 'B1 ACTIVE FLAT READBACK FILTER — nothing lost');
eq(B1.cycles, [CYCLE], 'B1 every DTO carries the planning cycle 2026-08');
eq(B1.tierMonths, TIER_MONTHS, 'B1 ... and the tier months 2026-09/10/11, which are NOT the cycle');

function callGet(action, bodyObj) {
  var p = { action: action, km_via: 'get' };
  if (bodyObj) p.km_body = JSON.stringify(bodyObj);
  return JSON.parse(gsCtx.doGet({ parameter: p }).getContent());
}
var envG = callGet('requestOrderDraft.getActive', { payload: { scope: RESUS } });
ok(envG.success === true, 'B2 HANDLER ENVELOPE (GET) — success (this was the FIRST LOSS BOUNDARY: it returned the literal body {})');
eq((envG.data || {}).status, 'SCOPE_READBACK', 'B2 ... with the scope readback status');
// The exact shape of the defect, so a regression is named rather than merely counted.
ok(JSON.stringify(envG) !== '{}', 'B2 the GET answer is not the empty body {} (the two bytes the live page received)');
var B2 = censusDtos(envG.data && envG.data.drafts);
eq([B2.rows, B2.positive, B2.zero], [45, 92, 43], 'B2 ... and every quantity survives the envelope');
eq(((envG.data || {}).submittedSkus || []).length, 7, 'B2 the 7 submitted SKUs are reported (and are NOT among the drafts)');

// The POST path was never broken — which is exactly why this looked like a hydration defect.
var envP = JSON.parse(gsCtx.doPost({ postData: { contents: JSON.stringify({ action: 'requestOrderDraft.getActive', payload: { scope: RESUS } }), type: 'text/plain' }, parameter: {} }).getContent());
var B2p = censusDtos(envP.data && envP.data.drafts);
eq([B2p.rows, B2p.positive, B2p.zero], [45, 92, 43], 'B2 the POST path agrees with GET — one action, one answer, either verb');

// =============================================================================================================
// §1b — THE MECHANISM, NAMED. Not every read-table handler returns the same kind of thing.
// =============================================================================================================
section('§1b the double-wrap, and its exact blast radius');

ok(/function rtrEmitHandlerResult_/.test(ROUTER), '1b.1 the dispatch has an explicit emit step');
ok(/return rtrEmitHandlerResult_\(_rtrRead\[action\]\(_parsed\.body\)\)/.test(ROUTER), '1b.2 ... and the read table uses it');
ok(!/return jsonResponse_\(_rtrRead\[action\]\(_parsed\.body\)\)/.test(ROUTER), '1b.3 the double-wrapping dispatch is gone');
eq(gsSb.rtrIsTextOutput_(gsSb.jsonResponse_({ a: 1 })), true, '1b.4 a TextOutput is recognised as one');
eq(gsSb.rtrIsTextOutput_({ success: true }), false, '1b.5 a plain envelope object is not');
eq(JSON.parse(gsSb.rtrEmitHandlerResult_(gsSb.jsonResponse_({ a: 1 })).getContent()), { a: 1 }, '1b.6 a TextOutput passes through with its payload intact');
eq(JSON.parse(gsSb.rtrEmitHandlerResult_({ a: 1 }).getContent()), { a: 1 }, '1b.7 a plain object is serialized exactly once');
// The property that made this possible: JSON.stringify of a TextOutput is "{}".
eq(JSON.stringify(gsSb.jsonResponse_({ big: 'payload' })), '{}', '1b.8 JSON.stringify(TextOutput) is "{}" — the two bytes the page received');
// EVERY read-table action must now reach the client as its own payload, whatever its handler returns.
var readActions = gsCtx.rtrGetReadActionList_();
eq(readActions.length, 21, '1b.9 the read table still has its 21 actions');
var emptyAnswers = readActions.filter(function (a) {
  var txt = gsCtx.doGet({ parameter: { action: a, km_via: 'get' } }).getContent();
  return String(txt).replace(/\s/g, '') === '{}';
});
eq(emptyAnswers, [], '1b.10 NOT ONE read-table action answers with the empty body {} — the class of defect, not just its instance');

// =============================================================================================================
// §2 — WHAT THE PAGE ACTUALLY SENDS. The shipped page, mounted, with every request recorded.
// =============================================================================================================
section('§2 the request the page really sends, for each scope shape');

var requests = [];
function qsOf(u) { var q = {}; String(String(u).split('?')[1] || '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); }); return q; }
function fetchImpl(url, init) {
  var u = String(url), method = ((init && init.method) || 'GET').toUpperCase();
  var body = (init && init.body) ? String(init.body) : '', qs = qsOf(u);
  var rec = { method: method, action: qs.action || null, urlLen: u.length };
  try { rec.body = qs.km_body ? JSON.parse(qs.km_body) : (body ? JSON.parse(body) : null); } catch (e) { rec.body = null; }
  if (!rec.action && rec.body) rec.action = rec.body.action || null;
  requests.push(rec);
  var out = (method === 'GET') ? gsCtx.doGet({ parameter: qs }) : gsCtx.doPost({ postData: { contents: body, type: 'text/plain' }, parameter: qs });
  var text = out.getContent(); rec.bytes = String(text).length;
  return Promise.resolve({ ok: true, status: 200, statusText: '200', redirected: true, type: 'basic', url: u,
    headers: { get: function (h) { return String(h).toLowerCase() === 'content-type' ? 'application/json' : null; } },
    text: function () { return Promise.resolve(text); }, json: function () { return Promise.resolve(JSON.parse(text)); } });
}
var TP = require(path.join(ROOT, 'assets/js/api/km-transport.js'));
var win = { KM: { transportFactory: TP }, location: { origin: 'https://x.github.io', hash: '' }, addEventListener: function () {}, removeEventListener: function () {} };
win.KM.transport = TP.create({ fetch: fetchImpl, baseUrl: 'https://script.google.com/macros/s/DEP/exec', frontendOrigin: 'https://x.github.io',
  now: function () { return 0; }, random: function () { return 0; }, sleep: function () { return Promise.resolve(); } });
var els = {};
function mkEl(id) {
  var e = { id: id, dataset: {}, _cls: {}, style: {}, hidden: (id === 'roAiSupportList'), textContent: '', innerHTML: '', _attrs: {}, _listeners: 0 };
  e.classList = { add: function (c) { e._cls[c] = 1; }, remove: function (c) { delete e._cls[c]; }, contains: function (c) { return !!e._cls[c]; } };
  e.setAttribute = function (k, v) { e._attrs[k] = v; }; e.removeAttribute = function (k) { delete e._attrs[k]; };
  e.getAttribute = function (k) { return e._attrs[k] === undefined ? null : e._attrs[k]; };
  e.appendChild = function (c) { els[c.id] = c; }; e.querySelectorAll = function () { return []; }; e.querySelector = function () { return null; };
  e.addEventListener = function () { e._listeners++; }; e.focus = function () {}; e.closest = function () { return null; };
  return e;
}
['roAiSupportTrigger', 'roAiSupportList', 'ro-ai-plan-btn', 'ro-recalc-all-btn', 'ro-scroll-body'].forEach(function (id) { els[id] = mkEl(id); });
var bodyEl = mkEl('body'); bodyEl.appendChild = function (c) { els[c.id] = c; };
var docListeners = 0;
var doc = { getElementById: function (id) { return els[id] || null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  addEventListener: function () { docListeners++; }, body: bodyEl, createElement: function () { return mkEl('__new__'); }, readyState: 'complete' };
var store = {};
var dispatched = [];
var cSb = {
  console: { log: function () {}, warn: function () {}, info: function () {}, error: function () {} },
  window: win, document: doc, JSON: JSON, Math: Math, Date: Date, Promise: Promise, Array: Array, Object: Object,
  String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, Set: Set, Map: Map, WeakMap: WeakMap,
  isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
  encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
  setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {}, clearInterval: function () {},
  AbortController: AbortController, performance: { now: function () { return 0; } },
  localStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
  fetch: fetchImpl, alert: function () {}, confirm: function () { return true; }
};
cSb.globalThis = cSb; cSb.self = cSb;
win.document = doc; win.alert = cSb.alert; win.confirm = cSb.confirm; win.setTimeout = setTimeout;
var ctx = vm.createContext(cSb);
vm.runInContext(read('assets/js/api/operation-system-db-api.js'), ctx, { filename: 'db-api.js' });
vm.runInContext(read('assets/js/api/km-api-foundation.js'), ctx, { filename: 'foundation.js' });
vm.runInContext(read('assets/js/core/scope-registry.js'), ctx, { filename: 'scope-registry.js' });
vm.runInContext(read('assets/js/utils/sku-overrides.js'), ctx, { filename: 'sku-overrides.js' });
vm.runInContext(RO_SRC, ctx, { filename: 'request-order.js' });

var RESUS_ROWS = [], ALL_ROWS = [];
for (var r0 = 0; r0 < 45; r0++) { var row = { sku: 'SKU' + r0, company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-RESUS', boxSize: 12 }; RESUS_ROWS.push(row); ALL_ROWS.push(row); }
ALL_ROWS.push({ sku: 'SKU0', company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-KM', boxSize: 12 });
var NO_COMPANY_ROWS = ALL_ROWS.map(function (r) { return { sku: r.sku, company: '', country: r.country, marketplace: r.marketplace, boxSize: 12 }; });

function mount(rows) {
  requests.length = 0;
  vm.runInContext('_roCanonicalDraftBySku = {}; _roNoDraftSkus = {}; _roSubmittedSkus = {}; _roDraftDtoCache = {}; _roHydrateReqCount = 0;', ctx);
  cSb.__ROWS = rows;
  vm.runInContext('requestOrderState.data = __ROWS;', ctx);
  return Promise.resolve(ctx._roHydratePersistedDraftsForLoadedScopes_()).then(function () {
    return { map: vm.runInContext('_roCanonicalDraftBySku', ctx), status: vm.runInContext('_roHydrationStatus', ctx),
      scopes: ctx._roScopesFromLoadedData_(), requests: requests.slice() };
  });
}
function draftReads(rs) { return rs.filter(function (r) { return r.action === 'requestOrderDraft.getActive'; }); }

var results = {};
Promise.resolve()
  .then(function () { return mount(RESUS_ROWS).then(function (r) { results.concrete = r; }); })
  .then(function () { return mount(ALL_ROWS).then(function (r) { results.all = r; }); })
  .then(function () { return mount(NO_COMPANY_ROWS).then(function (r) { results.noCompany = r; }); })
  .then(function () { return mount(ALL_ROWS).then(function (r) { results.reMount = r; }); })
  .then(runAssertions)
  .then(finish)
  .catch(function (e) { console.log('HARNESS ERROR: ' + (e && e.stack || e)); failed++; finish(); });

function runAssertions() {
  // --- TEST 9 · a concrete scope stays exactly one scoped request, with the payload it always had ------------
  var c = results.concrete, reads = draftReads(c.requests);
  eq(reads.length, 1, '9.1 a concrete scope issues EXACTLY ONE readback request');
  eq(reads[0].method, 'GET', '9.2 ... as a canonical GET (R4A1 transport rule preserved)');
  eq((reads[0].body.payload || {}).scope, RESUS, '9.3 ... carrying the single scope, unchanged from before this round');
  ok(!(reads[0].body.payload || {}).scopes, '9.4 ... and NOT the multi-scope form');

  // --- TEST 3/4/5 · the live-shaped rows hydrate, positives and zeros both ------------------------------------
  var cc = censusClient(c.map);
  eq(cc.keys, 45, '3.1 45 canonical drafts reach the client row model');
  eq(cc.positive, 92, '4.1 ALL 92 positive Order Qty values survive handler → DTO → envelope → client → input');
  eq(cc.zero, 43, '5.1 ALL 43 zeros remain zeros — not blank, not the recommendation');
  eq(cc.blank, 0, '5.2 nothing arrives blank');

  // --- TEST 6 · planning cycle and tier month are not conflated -------------------------------------------------
  eq(cc.cycles, [CYCLE], '6.1 the persisted planning cycle is 2026-08');
  eq(cc.tierMonths, TIER_MONTHS, '6.2 the hydrated tier months are 2026-09 / 10 / 11');
  ok(cc.tierMonths.indexOf(CYCLE) === -1, '6.3 the cycle is NOT among the tier months — a 2026-08 cycle hydrates 09/10/11 quantities');
  ok(reads[0].body.payload.planningCycle === undefined, '6.4 the readback sends NO cycle filter, so a cycle can never be compared against a tier month');

  // the displayed value comes from the persisted quantity, per tier
  var item0 = { sku: 'SKU0', company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-RESUS', boxSize: 12 };
  vm.runInContext('requestOrderState.data = __ROWS;', Object.assign(cSb, { __ROWS: RESUS_ROWS }));
  vm.runInContext('_roCanonicalDraftBySku = __M;', Object.assign(cSb, { __M: c.map }));
  var t1 = ctx._roRowOrderQtyDisplay_(item0, 0, 'T1', null);
  var row0 = FLAT.filter(function (r) { return r.request_allocation_draft_id === 'RD-A0'; })[0];
  eq(t1, Number(row0.t1_order_qty), '4.2 the rendered T1 value IS the persisted t1_order_qty');
  eq(ctx._roSendOrderQty_(item0, 0, 'T1', null), Number(row0.t1_order_qty), '4.3 ... and Send asserts the same number');

  // --- TEST 9(cont) · Suggested Qty cannot replace a persisted Order Qty ----------------------------------------
  var zeroTier = ['T1', 'T2', 'T3'].filter(function (t) { return Number(row0[t.toLowerCase() + '_order_qty']) === 0; })[0];
  if (zeroTier) {
    eq(ctx._roRowOrderQtyDisplay_(item0, 0, zeroTier, null), 0, '5.3 a persisted ZERO renders as 0 even though its recommendation is 500');
    ok(Number(row0[zeroTier.toLowerCase() + '_recommended_qty']) === 500, '5.4 (control) that tier really does carry a 500 recommendation');
  } else { ok(true, '5.3 (no zero tier on RD-A0 in this fixture)'); ok(true, '5.4'); }

  // --- TEST 7 · submitted rows do not hydrate editable inputs ----------------------------------------------------
  var subKey = Object.keys(c.map).filter(function (k) { return /\|SUB\d$/.test(k); });
  eq(subKey, [], '7.1 not one submitted SKU became a canonical editable draft');
  var subItem = { sku: 'SUB0', company: 'ResUS', country: 'US', marketplace: 'Amazon', boxSize: 12 };
  ok(!ctx._roIsCanonicalDraftSku_(subItem), '7.2 a submitted SKU is not an execution authority');
  ok(ctx._roIsSubmittedSku_(subItem), '7.3 ... it is reported as SUBMITTED, so a re-send cannot create a second Request Order');

  // --- TEST 2/10 · the All-level view: an explicit bounded scope list, ONE request ---------------------------------
  var a = results.all, aReads = draftReads(a.requests);
  eq(a.scopes.length, 2, '2.1 the All-level view derives an EXPLICIT scope set from the visible rows');
  eq(a.scopes.map(function (s) { return s.company; }).sort(), ['Kitchen Mama', 'ResUS'], '2.2 ... naming both companies on screen');
  eq(aReads.length, 1, '10.1 and issues ONE bounded request for all of them — not one per scope, and not one per row');
  ok(Array.isArray((aReads[0].body.payload || {}).scopes), '2.3 the payload is an explicit scope LIST');
  eq((aReads[0].body.payload || {}).scopes.length, 2, '2.4 ... of exactly the two visible scopes');
  ok(!(aReads[0].body.payload || {}).scope, '2.5 ... and never a blank single scope');
  eq(vm.runInContext('_roHydrateReqCount', ctx) <= 1, true, '10.2 one hydration request in total for 46 rows across 2 scopes');
  ok(aReads[0].urlLen < 6000, '10.3 the bounded request fits the GET URL limit (' + aReads[0].urlLen + ' of 6000)');

  // --- TEST 8 · cross-company contamination is impossible ----------------------------------------------------------
  var ac = censusClient(a.map);
  eq(ac.keys, 46, '8.1 46 canonical drafts — 45 ResUS + 1 Kitchen Mama, each under its OWN key');
  eq(ac.zero, 43, '8.2 the 43 ResUS zeros are ALL still zeros (SKU-only keying overwrote three of them with KM values)');
  eq(ac.positive, 92 + 3, '8.3 92 ResUS positives PLUS Kitchen Mama\'s own 3 — added beside, never on top');
  vm.runInContext('requestOrderState.data = __ROWS;', Object.assign(cSb, { __ROWS: ALL_ROWS }));
  vm.runInContext('_roCanonicalDraftBySku = __M;', Object.assign(cSb, { __M: a.map }));
  var resusSku0 = ctx._roRowOrderQtyDisplay_({ sku: 'SKU0', company: 'ResUS', country: 'US', marketplace: 'Amazon', boxSize: 12 }, 0, 'T1', null);
  var kmSku0 = ctx._roRowOrderQtyDisplay_({ sku: 'SKU0', company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', boxSize: 12 }, 0, 'T1', null);
  eq(resusSku0, Number(row0.t1_order_qty), '8.4 the ResUS SKU0 row shows the ResUS quantity');
  eq(kmSku0, KM_QTY[0], '8.5 the Kitchen Mama SKU0 row shows the Kitchen Mama quantity');
  ok(resusSku0 !== kmSku0, '8.6 THE CONTAMINATION: the same SKU on the same country+marketplace shows two DIFFERENT companies\' numbers');
  // a reference that cannot name one row must fail closed rather than pick one
  var AMB = String.fromCharCode(0) + 'AMBIGUOUS';
  eq(ctx._roDraftKey_('SKU0'), AMB, '8.7 a bare SKU visible under two companies resolves to the AMBIGUOUS sentinel');
  eq(ctx._roCanonicalRowFor_('SKU0', 'T1'), null, '8.8 ... and an ambiguous reference resolves to NO canonical row (fail closed)');
  eq(ctx._roDraftKey_('SKU7'), 'RESUS|US|AMAZON|SKU7', '8.9 a SKU visible under exactly one scope still resolves');

  // --- TEST 1 · an empty scope cannot query drafts ------------------------------------------------------------------
  var blankEnv = callGet('requestOrderDraft.getActive', { payload: { scope: { company: '', country: '', marketplace: '' } } });
  eq([blankEnv.success, blankEnv.error], [false, 'INVALID_SCOPE'], '1.1 a blank scope is REFUSED by the handler, with a typed code');
  var noneEnv = callGet('requestOrderDraft.getActive', { payload: {} });
  eq([noneEnv.success, noneEnv.error], [false, 'INVALID_SCOPE'], '1.2 so is a missing scope');
  // and the matcher itself no longer treats blank as "everything"
  var blankMatch = gsSb.KMRDV2P.readActiveFlatForScope(built.set, { planningCycle: '', businessScope: { company: '', country: '', marketplace: '', draft_purpose: 'regular' } });
  eq(blankMatch.length, 0, '1.3 the MATCHER returns nothing for a blank scope — it used to return the whole table');
  eq(KMRDV2P.isConcreteScope({ company: 'A', country: 'B', marketplace: 'C' }), true, '1.4 a complete scope is concrete');
  eq(KMRDV2P.isConcreteScope({ company: 'A', country: '', marketplace: 'C' }), false, '1.5 one blank field makes it not a scope at all');
  eq(KMRDV2P.readActiveFlatForScope(built.set, { planningCycle: '', businessScope: { company: 'ResUS', country: '', marketplace: 'Amazon' } }).length, 0,
    '1.6 a PARTIALLY blank scope matches nothing either — never a widened read');
  // the page never sends a blank scope: with no company on any row it sends nothing and SAYS so
  var nc = results.noCompany;
  eq(draftReads(nc.requests).length, 0, '1.7 rows with no company produce NO readback request at all');
  eq(nc.status, 'NO_SCOPE', '1.8 ... and a NAMED state, not a silent IDLE');
  ok(/DRAFT_SCOPE_UNRESOLVED/.test(RO_SRC) && /no company, so no draft scope could be resolved/.test(RO_SRC),
    '1.9 ... which the row banner reports to the operator');

  // --- the multi-scope bound -----------------------------------------------------------------------------------------
  var many = [];
  for (var mi = 0; mi < 26; mi++) many.push({ company: 'C' + mi, country: 'US', marketplace: 'Amazon' });
  var tooMany = callGet('requestOrderDraft.getActive', { payload: { scopes: many } });
  eq([tooMany.success, tooMany.error], [false, 'TOO_MANY_SCOPES'], '2.6 an oversized scope list is REFUSED before any row is read');
  var malformed = callGet('requestOrderDraft.getActive', { payload: { scopes: [{ company: 'ResUS', country: '', marketplace: 'Amazon' }] } });
  eq([malformed.success, malformed.error], [false, 'INVALID_SCOPE'], '2.7 a malformed scope in the list is refused, not skipped');
  var emptyList = callGet('requestOrderDraft.getActive', { payload: { scopes: [] } });
  eq([emptyList.success, emptyList.error], [false, 'INVALID_SCOPE'], '2.8 an EMPTY scope list is refused — never read as "all"');
  var dupes = callGet('requestOrderDraft.getActive', { payload: { scopes: [RESUS, RESUS, { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' }] } });
  dupes.data = dupes.data || { scopeCount: null, scopes: [], maxScopes: null, results: [] };
  eq(dupes.data.scopeCount, 2, '2.9 duplicate scopes are deduplicated server-side');
  eq(dupes.data.scopes.map(function (s) { return s.company; }), ['Kitchen Mama', 'ResUS'], '2.10 ... and the list is sorted deterministically');
  eq(dupes.data.maxScopes, 25, '2.11 the hard maximum is reported with the answer');
  // every returned draft carries its own canonical company/country/marketplace
  var allScoped = dupes.data.results.every(function (r) { return (r.drafts || []).every(function (d) { return d.scope && d.scope.company && d.scope.country && d.scope.marketplace; }); });
  ok(allScoped, '2.12 every returned draft carries its canonical company / country / marketplace');

  // --- TEST 11 · remount does not erase completed hydration ------------------------------------------------------------
  var rm = censusClient(results.reMount.map);
  eq([rm.keys, rm.positive, rm.zero], [ac.keys, ac.positive, ac.zero], '11.1 leaving and returning hydrates identically — reload is deterministic');
  eq(results.reMount.status, 'LOADED', '11.2 ... and ends LOADED, not blank');
  eq(draftReads(results.reMount.requests).length, 1, '11.3 ... in one request again');

  // --- no whole-DB read, no write -------------------------------------------------------------------------------------
  eq(writes, [], 'X.1 the ENTIRE end-to-end run performed zero spreadsheet writes');
  var everyAction = results.all.requests.map(function (r) { return r.action; });
  ok(everyAction.indexOf('getOperationDb') === -1, 'X.2 no getOperationDb — no whole-DB read');
  ok(results.all.requests.every(function (r) { return r.method === 'GET'; }), 'X.3 every read went out as a canonical GET');

  // =============================================================================================================
  // §6 — AI PLAN / RECALCULATE, against the corrected hydration path.
  // =============================================================================================================
  section('§6 AI Plan / Recalculate — one dispatch, visible outcome, authoritative refresh');

  ctx._roBindAiSupportGlobal();                       // first bind - this one DOES register
  var afterFirst = docListeners;
  ok(afterFirst > 0, '6.4 (control) the first bind registers its document handlers');
  ctx._roBindAiSupportGlobal(); ctx._roBindAiSupportGlobal(); ctx._roBindAiSupportGlobal();
  eq(docListeners, afterFirst, '6.5 three further remounts register NO duplicate document handlers');

  ok(/_roLoadCanonicalDraftsForScope_\(/.test(RO_SRC), '6.6 the AI Plan DONE path re-reads the canonical draft (authoritative readback, not a local guess)');
  ok(/if \(_roAiPlanBusy\) return Promise\.resolve\(null\);/.test(RO_SRC), '6.7 a duplicate AI Plan job can never start');
  ok(/if \(_roRecalcAllBusy\) return;/.test(RO_SRC), '6.8 a duplicate recalculation can never start');
  ok(/_roAiSupportTriggerBusy_\('recalc', txt\)/.test(RO_SRC), '6.9 recalculation progress is painted OUTSIDE the panel the click closes (R4B-R1 §3 preserved)');
  ok(/_roAiSupportNotice_\('bad'/.test(RO_SRC) && /_roAiSupportNotice_\('info'/.test(RO_SRC), '6.10 refusals and cancellations still produce a typed visible outcome');
  ok(/if \(mySeq !== _roHydrateSeq\) return null;/.test(RO_SRC), '6.11 a superseded hydration cannot repaint — a result reaches only its initiating scope');
  ok(/_roAiPlanResultVisibleFor_\(r, scope\)/.test(RO_SRC), '6.12 an AI Plan result renders only for its OWN scope key');

  // A refresh for ONE scope must not disturb another scope's hydrated rows.
  vm.runInContext('_roCanonicalDraftBySku = __M;', Object.assign(cSb, { __M: results.all.map }));
  vm.runInContext('requestOrderState.data = __ROWS;', Object.assign(cSb, { __ROWS: ALL_ROWS }));
  requests.length = 0;
  return Promise.resolve(ctx._roLoadCanonicalDraftsForScope_({ company: 'ResUS', country: 'US', marketplace: 'Amazon' })).then(function () {
    var after = vm.runInContext('_roCanonicalDraftBySku', ctx);
    var kmKey = Object.keys(after).filter(function (k) { return k.indexOf('KITCHEN MAMA|') === 0; });
    eq(draftReads(requests).length, 1, '6.13 a scope refresh issues exactly one authoritative readback');
    eq(Object.keys(after).length, 45, '6.14 it REPLACES that scope\'s drafts (45 ResUS rows)');
    eq(kmKey, [], '6.15 ... and cannot deliver its result into another company\'s rows');
    var cAfter = censusClient(after);
    eq([cAfter.positive, cAfter.zero], [92, 43], '6.16 the refreshed quantities hydrate exactly, positives and zeros');
  });
}

function finish() {
  console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
}
