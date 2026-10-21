// Kitchen Mama Operation System — DC1-R1
// A SOURCE WRITE THE PAGE NEVER HEARD ABOUT, AND THE THREE ANSWERS IT KEPT SERVING.
//
// Run: node assets/tests/dc1-r1-source-write-epoch-and-reader-invalidation.test.js
//      DC1_SRC_DIR=<dir holding assets/js/...> node ...   (runs the same cases against other sources -
//      this is how the BEFORE run was taken against the pre-fix tree)
//
// LOCAL / OFFLINE. No network, no DB, no writes, no browser, no production recalculation. Every request
// below is answered by a stub this file controls; the code under test is the SHIPPED source, loaded whole
// (operation-system-db-api.js) or by name (inventory-replenishment.js), never a model of it.
//
// WHAT WAS WRONG. Site Inventory holds four answers past the moment it read them: the recommendation answer
// (Avg Sales, Days of Supply) in memory and in a sessionStorage cache, the first-layer read model, and the
// per-site exposure tables. Nothing told any of them that a source had been written:
//   - invalidateRecommendationSessionCache had no caller anywhere;
//   - the cache stored a revision and compared it with nothing;
//   - a settled in-memory answer was "ALREADY_SETTLED" forever, so returning to the page restored Avg Sales
//     with ZERO requests while Current Inventory was quietly re-read behind it;
//   - a Search with a loaded model read nothing, whatever had been written since;
//   - the exposure map's own comment calls manual Refresh the only path to truth "until a canonical write
//     signal exists".
//
// THE CASES (the user's list): unchanged, related source updated, unrelated source updated, cross-day and
// cross-month, duplicate notification, partial failure, concurrent read, and an UNKNOWN version - which must
// stay UNKNOWN and never be read as "nothing changed". Plus the one that is not about freshness at all: a
// system re-read must never overwrite the operator's manual Execution Plan that has not reached the DB.
//
// NOTE: no 'use strict' - the shipped IRRECO region is evaluated as a script in its own context.
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var SRC_DIR = process.env.DC1_SRC_DIR || ROOT;
var F1A = require('./_f1a-scope-guard.js');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(SRC_DIR, rel), 'utf8').replace(/\r\n/g, '\n'); }
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
function within(p, ms) { return Promise.race([p, new Promise(function (r) { setTimeout(function () { r('__TIMEOUT__'); }, ms); })]); }

var DBAPI = read('assets/js/api/operation-system-db-api.js');
var IRSRC = read('assets/js/pages/inventory-replenishment.js');
function has(src, name) { return src.indexOf('function ' + name + '(') !== -1; }
function fnSrc(src, name) { return has(src, name) ? F1A.sliceFn(src, name) : null; }
function varSrc(src, name) {
  var i = src.indexOf('\nvar ' + name + ' ');
  if (i < 0) return null;
  var j = src.indexOf(';\n', i);
  return src.slice(i + 1, j + 1);
}

// =============================================================================================================
// PART A — THE SIGNAL, ON THE REAL db-api, THROUGH THE REAL WRITERS
// =============================================================================================================
function makeClient(opts) {
  opts = opts || {};
  var store = opts.store || {};
  var log = { fetches: [] };
  var pendingFetch = [];
  var sb = {
    console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {} },
    JSON: JSON, Math: Math, Date: Date, Promise: Promise, Array: Array, Object: Object,
    String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error,
    Set: Set, Map: Map, WeakMap: WeakMap, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {}, clearInterval: function () {},
    AbortController: AbortController, performance: { now: function () { return 0; } },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    sessionStorage: opts.noStorage
      ? { getItem: function () { throw new Error('storage disabled'); }, setItem: function () { throw new Error('storage disabled'); }, removeItem: function () {} }
      : { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
          setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    document: { addEventListener: function () {}, removeEventListener: function () {}, readyState: 'complete',
      getElementById: function () { return null; }, querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {} }, appendChild: function () {} }; } },
    fetch: function (u, i) {
      log.fetches.push({ url: u, body: i && i.body });
      if (opts.hold) { return new Promise(function (res, rej) { pendingFetch.push({ res: res, rej: rej }); }); }
      if (opts.netThrows) return Promise.reject(new Error('socket hang up'));
      var body = opts.responseBody !== undefined ? opts.responseBody : JSON.stringify({ success: true, data: {} });
      return Promise.resolve({ ok: true, status: 200, url: String(u), redirected: false,
        headers: { get: function (h) { return /content-type/i.test(h) ? 'application/json' : null; } },
        text: function () { return Promise.resolve(body); }, json: function () { return Promise.resolve(JSON.parse(body)); } });
    }
  };
  sb.window = { location: { origin: 'https://example.invalid', hash: '' }, addEventListener: function () {}, removeEventListener: function () {} };
  sb.globalThis = sb; sb.self = sb;
  var ctx = vm.createContext(sb);
  vm.runInContext(opts.src || DBAPI, ctx, { filename: 'operation-system-db-api.js' });
  var DB = sb.window.KM.DB;
  return { sb: sb, DB: DB, log: log, store: store,
    release: function (body) {
      var q = pendingFetch; pendingFetch = [];
      q.forEach(function (p) { p.res({ ok: true, status: 200, url: 'x', redirected: false,
        headers: { get: function () { return 'application/json'; } },
        text: function () { return Promise.resolve(body || JSON.stringify({ success: true, data: {} })); },
        json: function () { return Promise.resolve(JSON.parse(body || '{"success":true,"data":{}}')); } }); });
    },
    epoch: function () { return typeof DB.sourceWriteEpoch === 'function' ? DB.sourceWriteEpoch() : null; } };
}
function counters(e) { return e ? { planning: e.planning, exposure: e.exposure } : null; }
// Call a writer and wait for it to settle, whatever it settles to - a writer refusing a stub response is
// still a write the page attempted, and the outcome is NOT what decides whether a source may have moved.
function callAndSettle(fn, args) {
  var p;
  try { p = Promise.resolve(fn.apply(null, args || [{}])); } catch (e) { p = Promise.resolve('__THREW__'); }
  return within(p.then(function () { return 'RESOLVED'; }, function () { return 'REJECTED'; }), 3000);
}

// The write-capable functions, found by scanning the file rather than by trusting the list under test.
function scanWriters(src) {
  var lines = src.split('\n'), blocks = [], cur = null;
  lines.forEach(function (l, i) {
    var m = /^window\.KM\.DB\.([A-Za-z0-9_]+)\s*=/.exec(l);
    if (m) { cur = { name: m[1], body: [l] }; blocks.push(cur); return; }
    if (/^(async\s+function|function|var |window\.)/.test(l)) { cur = null; return; }
    if (cur) cur.body.push(l);
  });
  var SIG = [/_kmCanonicalWrite_\(/, /_kmWeeklyCommand_\(/, /_kmShippingPost_\([^;]*true\)/, /_kmDocumentAction/,
    /method:\s*'POST'/, /kind:\s*'write'/, /_kmGapRead_\('[a-zA-Z.]*\.(save|update)'/, /updateSkuLifecycleInSheet\(/];
  var out = {};
  blocks.forEach(function (b) { var s = b.body.join('\n'); if (SIG.some(function (r) { return r.test(s); })) out[b.name] = true; });
  return Object.keys(out).sort();
}
// Reads that travel as POST, or helpers that are not writers. Held HERE, by the test, so the list under test
// cannot grant itself an exemption.
var READ_VIA_POST = ['getSystemHealth', 'getWarehouseAllocationConfig', 'getFactoryOperationConfig',
  'listEntityDocuments', 'getGeneratedDocument', 'runPoDocumentDiagnostic', 'runShipmentDocumentDiagnostic',
  'getExecutionPlanConflictDiagnostic', 'getRecommendationDraftToken', 'getShippingAllocationDraftWorkspace',
  'runCarrierLeadTimeDuplicateCensus', 'factoryInventoryImportValidate', 'getShippingMethodCandidates',
  'getWeeklyPlanRateCandidates', 'openGeneratedDocument', 'getPricingWriteStatus',
  'getRequestOrderSendWorkset', 'getRequestOrderSendStatus', 'reconcileRequestOrderSend', 'getGapJobStatus',
  'getRequestOrderDraftJobStatus', 'getAutomationSchedule', 'getFxRateBook', 'factoryStockGuardGet'];

function partA() {
  section('A. the signal - real db-api, real writers, stubbed network');
  var c = makeClient();
  ok(typeof c.DB.sourceWriteEpoch === 'function', 'A0  KM.DB.sourceWriteEpoch exists - the canonical write signal');
  if (typeof c.DB.sourceWriteEpoch !== 'function') { failed += 12; console.log('FAIL A1-A12 cannot run without the signal (counted as 12)'); return Promise.resolve(); }
  eq(counters(c.epoch()), { planning: 0, exposure: 0 }, 'A1  a fresh tab starts at zero');

  // A2 - a RELATED source write (fc_target_rules): planning moves at dispatch and again at settle.
  var p2 = c.DB.upsertFcTargetRule({ company: 'KM', sku: 'X', target_pct: 90 });
  eq(counters(c.epoch()), { planning: 1, exposure: 0 },
    'A2a COUNTER-EXAMPLE: the epoch moves at DISPATCH, before the server has answered (a read issued now cannot be trusted)');
  return within(Promise.resolve(p2).then(function () {}, function () {}), 3000).then(function () {
    eq(counters(c.epoch()), { planning: 2, exposure: 0 }, 'A2b and again at SETTLE - a read issued while it was in the air is the same question');
    eq(c.epoch().last && c.epoch().last.writer, 'upsertFcTargetRule', 'A2c the last writer is named (diagnostic only)');

    // A3 - an UNRELATED write: an allocation draft touches the exposure tables, never 42_ or 60_.
    return callAndSettle(c.DB.upsertShippingAllocationDraftAtomic, [{ header: {}, lines: [] }]);
  }).then(function () {
    eq(counters(c.epoch()), { planning: 2, exposure: 2 }, 'A3  an allocation-draft save moves EXPOSURE only - Avg Sales does not depend on it');
    return callAndSettle(c.DB.submitAllocationDraftsToShippingPlans, [{ draft_ids: ['D1'] }]);
  }).then(function () {
    eq(counters(c.epoch()), { planning: 4, exposure: 4 }, 'A4  Submit to Shipping Plans moves BOTH - a plan is an incoming quantity AND an exposure row');
    return callAndSettle(c.DB.upsertTaxReferralRate, [{ country: 'US', rate: 0.15 }]);
  }).then(function () {
    eq(counters(c.epoch()), { planning: 4, exposure: 4 }, 'A5  a tax write moves nothing (control: no planning read consumes it)');
    return callAndSettle(c.DB.getWarehouseAllocationConfig, [{ company: 'KM' }]);
  }).then(function () {
    eq(counters(c.epoch()), { planning: 4, exposure: 4 }, 'A6  a READ that travels as POST moves nothing (control)');

    // A7 - PARTIAL FAILURE / UNKNOWN OUTCOME: the network dies under the write. Nothing proves zero rows.
    var cf = makeClient({ netThrows: true });
    return callAndSettle(cf.DB.adjustOverseasInventory, [{ sku: 'X', qty: 5 }]).then(function (how) {
      eq(counters(cf.epoch()), { planning: 2, exposure: 0 },
        'A7  COUNTER-EXAMPLE: a write whose answer was lost still moves the epoch (outcome ' + how + ') - unknown is not "nothing happened"');
      var cs = makeClient({ responseBody: JSON.stringify({ success: false, error: 'PARTIAL: 3 of 5 rows written' }) });
      return callAndSettle(cs.DB.importOverseasInventorySnapshotBatch, [[{ sku: 'X' }], {}]).then(function () {
        eq(counters(cs.epoch()), { planning: 2, exposure: 0 }, 'A8  a server-reported failure still moves it - a partial write is a write');
      });
    });
  }).then(function () {
    // A9 - DUPLICATE / CONCURRENT notifications: two writes in the air together. Strictly monotonic.
    var cd = makeClient({ hold: true });
    var seen = [];
    var pa = Promise.resolve(cd.DB.upsertFcTargetRule({ rule_id: 'R1' })).catch(function () {}); seen.push(cd.epoch().planning);
    var pb = Promise.resolve(cd.DB.upsertFcTargetRule({ rule_id: 'R1' })).catch(function () {}); seen.push(cd.epoch().planning);
    // Both are now in the air together. The writer awaits its own gates before its fetch, so the held
    // responses are released for as long as either is still outstanding.
    var releaser = setInterval(function () { cd.release(); }, 5);
    return within(Promise.all([pa, pb]), 3000).then(function (v) { clearInterval(releaser); return v; })
      .then(function () {
        seen.push(cd.epoch().planning);
        ok(seen[0] < seen[1] && seen[1] < seen[2], 'A9  two identical writes in flight: every notification moves the counter forward, none resets it', seen);
        eq(cd.epoch().planning, 4, 'A9b and the repeat is NOT de-duplicated away - two dispatches, two settles');
      });
  }).then(function () {
    // A10 - RELOAD: the cache it invalidates survives a reload, so the signal must too.
    var shared = {};
    var c1 = makeClient({ store: shared });
    return callAndSettle(c1.DB.upsertSkuDetail, [{ sku: 'X' }]).then(function () {
      var c2 = makeClient({ store: shared });
      eq(counters(c2.epoch()), { planning: 2, exposure: 0 }, 'A10 a reloaded page reads the counters the last page left (never back to 0)');
      var c3 = makeClient({ noStorage: true });
      return callAndSettle(c3.DB.upsertSkuDetail, [{ sku: 'X' }]).then(function () {
        eq(counters(c3.epoch()), { planning: 2, exposure: 0 }, 'A11 storage that throws: the in-memory counters still move');
      });
    });
  }).then(function () {
    // A12 - THE LIST CANNOT DRIFT. Every write-capable function the file defines is classified.
    var families = vm.runInContext('typeof _KM_SOURCE_WRITE_FAMILIES_ === "object" ? _KM_SOURCE_WRITE_FAMILIES_ : null', c.sb);
    var reasons = vm.runInContext('typeof _KM_SOURCE_WRITE_EXEMPT_REASON_ === "object" ? _KM_SOURCE_WRITE_EXEMPT_REASON_ : null', c.sb);
    var found = scanWriters(DBAPI);
    var unclassified = found.filter(function (n) { return !(families && Object.prototype.hasOwnProperty.call(families, n)) && READ_VIA_POST.indexOf(n) === -1; });
    eq(unclassified, [], 'A12 every write-capable KM.DB function (scanned, ' + found.length + ') is classified or is a named read');
    var noReason = families ? Object.keys(families).filter(function (n) { return families[n].length === 0 && !(reasons && reasons[n]); }) : ['<no list>'];
    eq(noReason, [], 'A12b every writer that claims to touch no source says why');
    var unwrapped = families ? Object.keys(families).filter(function (n) {
      return families[n].length > 0 && !(c.DB[n] && c.DB[n].__kmSourceWriter); }) : ['<no list>'];
    eq(unwrapped, [], 'A12c every writer with a family is wrapped');
    eq(c.DB._sourceWriterListDrift, [], 'A12d and no name in the list is missing from the file');
  });
}

// =============================================================================================================
// PART B — THE RECOMMENDATION ANSWER (Avg Sales, Days of Supply): the SHIPPED IRRECO region in a vm context
// =============================================================================================================
var SITES = {
  US: { scope: { company: 'KM', country: 'US', marketplace: 'Amazon' }, applied: { country: 'US', marketplaceId: 'MP-US' }, rate: 12.5 },
  CA: { scope: { company: 'KM', country: 'CA', marketplace: 'Amazon' }, applied: { country: 'CA', marketplaceId: 'MP-CA' }, rate: 3.2 }
};
function siteOf(scope) { return scope.country === 'US' ? SITES.US : SITES.CA; }
var RealDate = Date;
function makeReco(src) {
  src = src || IRSRC;
  var S = { STORE: {}, HTTP: 0, PENDING: [], EPOCH: { planning: 0, exposure: 0 }, epochOn: true,
    NOW: RealDate.UTC(2026, 9, 21, 2, 0, 0), CURRENT: SITES.US };
  function FakeDate() {
    var a = Array.prototype.slice.call(arguments);
    if (!a.length) return new RealDate(S.NOW);
    return new (Function.prototype.bind.apply(RealDate, [null].concat(a)))();
  }
  FakeDate.now = function () { return S.NOW; };
  FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse; FakeDate.prototype = RealDate.prototype;
  function envelopeFor(scope, n) {
    return { success: true,
      data: { lines: [{ recommendationLineId: 'L' + n, sku: 'CO1150-AG', destinationType: 'MARKETPLACE',
        destinationKey: scope.country + '|' + scope.marketplace,
        horizonBasis: { avgSalesPerDay: siteOf(scope).rate + n, source: 'normalized_30d', warning: '', normalDayCount: 30, excludedDates: [] },
        recommendedQty: 10 }],
        pagination: null, dataVersion: { formulaVersion: 'FV-7', sourceDataAsOf: '2026-08-19T00:00:00Z' } },
      meta: { requestId: 'REQ-' + scope.country + '-' + n, calculationMonth: '2026-08', planningCycle: 'RECO-2026-08',
        calculationDate: '2026-08-19', recommendationWorkspaceHandlerVersion: 'fm5-r4ui-r5e', serverDurationMs: 900 },
      errors: [] };
  }
  var sb = {
    console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {} },
    JSON: JSON, Math: Math, Date: FakeDate, Promise: Promise, Array: Array, Object: Object, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, setTimeout: setTimeout, clearTimeout: clearTimeout,
    performance: { now: function () { return 0; } },
    requestAnimationFrame: function () { return 0; },
    sessionStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(S.STORE, k) ? S.STORE[k] : null; },
      setItem: function (k, v) { S.STORE[k] = String(v); }, removeItem: function (k) { delete S.STORE[k]; } },
    document: { querySelectorAll: function () { return []; }, getElementById: function () { return null; } },
    AbortController: function () { var self = this; this.signal = {}; this.abort = function () { if (self.signal.__rec) self.signal.__rec.aborted = true; }; },
    escapeReplenHtml: function (s) { return String(s == null ? '' : s); },
    getReplenishmentData: function () { return []; },
    updateReplenRecoContext: function () { return { ok: true }; },
    _legacyRecSummaryTableHtml: function () { return ''; },
    _recSummaryRows: function () { return ''; },
    _irSearchApplied_: function () { return true; },
    renderReplenishment: function () {},
    _irSearch: { applied: SITES.US.applied }
  };
  sb.window = {
    IRContext: { toScopeRequest: function () { return S.CURRENT.scope; } },
    KM_FLAGS: {},
    KM: { DB: { getInventoryReplenishmentGap: function () { return new Promise(function () {}); },
      sourceWriteEpoch: function () { return S.epochOn ? { planning: S.EPOCH.planning, exposure: S.EPOCH.exposure, last: null } : undefined; } },
      api: { workspaceApiActive: function (w) { return w === 'recommendation'; },
        getWorkspace: function (ws, params, opts) {
          S.HTTP++;
          var rec = { scope: S.CURRENT.scope, n: S.HTTP, aborted: false };
          rec.promise = new Promise(function (res) { rec.resolve = res; });
          if (opts && opts.signal) opts.signal.__rec = rec;
          S.PENDING.push(rec);
          return rec.promise;
        } } }
  };
  sb.global = sb; sb.globalThis = sb;
  var ctx = vm.createContext(sb);
  var REGION = src.slice(src.indexOf('// __IRRECO_START__'), src.indexOf('// __IRRECO_END__'));
  vm.runInContext(F1A.guardPreamble(src), ctx);
  vm.runInContext(src.slice(src.indexOf('var IR_AVG_QUALITY_TEXT'), src.indexOf('function _irScrollRowHtml_')), ctx);
  vm.runInContext(REGION, ctx);
  return {
    S: S, ctx: ctx,
    run: function (code) { return vm.runInContext(code, ctx); },
    go: function (name) { S.CURRENT = SITES[name]; ctx._irSearch.applied = SITES[name].applied; },
    load: function () { return vm.runInContext('loadRecommendationWorkspace_()', ctx); },
    ensure: function () { return vm.runInContext('_irRecoEnsureForRestoredScope_()', ctx); },
    settle: function () {
      var q = S.PENDING; S.PENDING = [];
      q.forEach(function (rec) { if (!rec.aborted) rec.resolve(envelopeFor(rec.scope, rec.n)); });
      return tick().then(tick);
    },
    cache: function () { return JSON.parse(JSON.stringify(vm.runInContext('_IR_RECO_DIAG_.cache', ctx))); },
    state: function () { return vm.runInContext('_irRecoState', ctx); },
    rate: function () { var b = vm.runInContext('_irCanonicalSalesBasis_("CO1150-AG")', ctx); return b ? b.avgSalesPerDay : null; }
  };
}

function partB() {
  section('T. the Taipei day is pure arithmetic, and it is the calendar 43_ uses');
  if (has(IRSRC, '_irTaipeiDay_')) {
    var day = new Function(fnSrc(IRSRC, '_irTaipeiDay_') + '\nreturn _irTaipeiDay_;')();
    var bad = 0, n = 0;
    for (var ms = RealDate.UTC(2000, 0, 1); ms < RealDate.UTC(2030, 0, 1); ms += 3600000 * 7 + 60000 * 13) {
      n++; if (day(ms) !== new RealDate(ms + 8 * 3600000).toISOString().slice(0, 10)) bad++;
    }
    eq(bad, 0, 'T1  ' + n + ' instants 2000-2029, leap years included: the arithmetic matches UTC+8 exactly');
    eq([day(RealDate.UTC(2026, 9, 31, 15, 59, 59, 999)), day(RealDate.UTC(2026, 9, 31, 16, 0, 0))], ['2026-10-31', '2026-11-01'],
      'T2  the boundary is Taipei midnight (16:00Z), and it crosses the month');
    ok(!/new Date/.test(fnSrc(IRSRC, '_irTaipeiDay_')), 'T3  no Date object - no local zone can leak in');
  } else { failed += 3; console.log('FAIL T1-T3 _irTaipeiDay_ is absent (counted as 3)'); }
  section('B. the recommendation answer - settled state and session cache against the write signal');
  var r = makeReco();
  r.go('US'); r.load();
  eq(r.S.HTTP, 1, 'B0  a cold site reads once');
  return r.settle().then(function () {
    eq(r.rate(), 13.5, 'B0a and its Avg Sales is on screen');
    r.go('CA'); r.load();
    return r.settle();
  }).then(function () {
    // B1 - CONTROL, UNCHANGED: back to US with nothing written. The cache answers; no request.
    var before = r.S.HTTP;
    r.go('US'); r.load();
    eq(r.S.HTTP - before, 0, 'B1  CONTROL: nothing written, back to US - served from the session cache, zero requests');
    eq(r.cache().outcome, 'HIT', 'B1b and the diagnostic says HIT');

    // B2 - RELATED SOURCE UPDATED: a forecast import on another page, then back to CA.
    r.S.EPOCH.planning += 2;
    before = r.S.HTTP;
    r.go('CA'); r.load();
    eq(r.S.HTTP - before, 1, 'B2  COUNTER-EXAMPLE: a planning source was written - CA is re-read, not restored');
    eq(r.cache(), { outcome: 'MISS', reason: 'SOURCE_WRITTEN_SINCE' }, 'B2b and the miss is named');
    return r.settle();
  }).then(function () {
    eq(r.rate(), 3.2 + r.S.HTTP, 'B2c the re-read answer is the one on screen');
    // B3 - SHARED POOL: the write was made while CA was in view, and US is invalidated too.
    var before = r.S.HTTP;
    r.go('US'); r.load();
    eq(r.S.HTTP - before, 1, 'B3  COUNTER-EXAMPLE: the same write invalidates the OTHER site too - stock pools are shared across sites');
    return r.settle();
  }).then(function () {
    // B4 - UNRELATED SOURCE UPDATED: an allocation draft save. Avg Sales never read it.
    r.S.EPOCH.exposure += 2;
    var before = r.S.HTTP;
    r.go('CA'); r.load();
    eq(r.S.HTTP - before, 0, 'B4  CONTROL: an exposure-only write keeps the cached Avg Sales (no needless request)');

    // B5 - SETTLED IN MEMORY, SAME SITE, A WRITE ARRIVES: the dedupe used to answer "already loaded".
    r.S.EPOCH.planning += 2;
    before = r.S.HTTP;
    r.load();
    eq(r.S.HTTP - before, 1, 'B5  COUNTER-EXAMPLE: the on-screen answer predates a write - the same-site call re-reads instead of deduping');
    return r.settle();
  }).then(function () {
    var before = r.S.HTTP;
    r.load();
    eq(r.S.HTTP - before, 0, 'B5b CONTROL: and once re-read, a repeat call is deduped again (no request storm)');

    // B6 - LEAVE AND RETURN (the restored-mount recovery): settled + no write = ALREADY_SETTLED.
    eq(r.ensure(), 'ALREADY_SETTLED', 'B6  CONTROL: returning with nothing written costs nothing');
    r.S.EPOCH.planning += 2;
    eq(r.ensure(), 'REREAD_ISSUED', 'B6b COUNTER-EXAMPLE: returning after a write elsewhere re-reads (it used to report ALREADY_SETTLED)');
    return r.settle();
  }).then(function () {
    // B7 - CONCURRENT: a write lands while the read is in the air. The answer is shown (it is the newest
    // the page has) but it is NOT trusted as current: it is stored under the epoch it was ISSUED at.
    r.go('US'); r.S.EPOCH.planning += 0;
    var st = r.S.HTTP;
    vm.runInContext('invalidateRecommendationSessionCache()', r.ctx);
    r.load();
    r.S.EPOCH.planning += 1;                 // dispatch of a write while the read is outstanding
    return r.settle().then(function () {
      eq(r.state().status, 'READY', 'B7  the in-flight answer still lands (it is not a wrong-site answer)');
      var before = r.S.HTTP;
      r.load();
      eq(r.S.HTTP - before, 1, 'B7b COUNTER-EXAMPLE: but it was read before the write finished - the next call re-reads');
      r.S.EPOCH.planning += 1;               // the write settles
      return r.settle();
    }).then(function () {
      r.go('CA'); r.load(); return r.settle();
    }).then(function () {
      var before = r.S.HTTP;
      r.go('US'); r.load();
      eq(r.S.HTTP - before, 1, 'B7c and the copy stored from the overlapped read is not served after the write settled');
      return r.settle();
    });
  }).then(function () {
    // B8 - CROSS-DAY / CROSS-MONTH (Asia/Taipei, the planning calendar). The server's daily imports may
    // have refreshed every source overnight; this tab cannot see them, so yesterday's answer is UNKNOWN.
    var r2 = makeReco();
    r2.S.NOW = RealDate.UTC(2026, 9, 31, 15, 0, 0);          // 2026-10-31 23:00 Taipei
    r2.go('US'); r2.load();
    return r2.settle().then(function () {
      r2.go('CA'); r2.load(); return r2.settle();
    }).then(function () {
      r2.S.NOW = RealDate.UTC(2026, 9, 31, 15, 50, 0);       // 23:50 the same Taipei day
      var before = r2.S.HTTP;
      r2.go('US'); r2.load();
      eq(r2.S.HTTP - before, 0, 'B8  CONTROL: later the same Taipei day - still served');
      r2.S.NOW = RealDate.UTC(2026, 9, 31, 16, 5, 0);        // 2026-11-01 00:05 Taipei - a new day AND a new month
      before = r2.S.HTTP;
      r2.go('CA'); r2.load();
      eq(r2.S.HTTP - before, 1, 'B8b COUNTER-EXAMPLE: across Taipei midnight (and into November) the stored answer is not served');
      eq(r2.cache(), { outcome: 'MISS', reason: 'SOURCE_CYCLE_CHANGED' }, 'B8c and the miss names the day boundary, not a write');
      return r2.settle();
    }).then(function () {
      var before = r2.S.HTTP;
      r2.go('US'); r2.load();
      eq(r2.S.HTTP - before, 1, 'B8d the settled in-memory answer from yesterday is not reused either');
      return r2.settle();
    });
  }).then(function () {
    // B9 - UNKNOWN VERSION: a record this build cannot date (written before the signal existed).
    var r3 = makeReco();
    r3.go('US'); r3.load();
    return r3.settle().then(function () {
      var key = r3.run('_IR_RECO_CACHE_KEY');
      var store = JSON.parse(r3.S.STORE[key]);
      Object.keys(store).forEach(function (k) { delete store[k].source; });
      r3.S.STORE[key] = JSON.stringify(store);
      r3.run('_irRecoCacheMem = null');
      r3.go('CA'); r3.load(); return r3.settle();
    }).then(function () {
      var before = r3.S.HTTP;
      r3.go('US'); r3.load();
      eq(r3.S.HTTP - before, 1, 'B9  COUNTER-EXAMPLE: a stored answer with no source stamp is UNKNOWN - not served as current');
      eq(r3.cache(), { outcome: 'MISS', reason: 'SOURCE_EPOCH_UNKNOWN' }, 'B9b and it says so');
      return r3.settle();
    }).then(function () {
      // B10 - the AUTHORITY itself is unavailable: nothing can be compared, so nothing is served from store.
      r3.go('CA'); r3.load();
      return r3.settle();
    }).then(function () {
      r3.S.epochOn = false;
      var before = r3.S.HTTP;
      r3.go('US'); r3.load();
      eq(r3.S.HTTP - before, 1, 'B10 COUNTER-EXAMPLE: no write signal at all - the store is not trusted');
      eq(r3.cache(), { outcome: 'MISS', reason: 'SOURCE_EPOCH_UNAVAILABLE' }, 'B10b named as UNAVAILABLE, never as SAME');
      return r3.settle();
    });
  }).then(function () {
    // B11 - the existing wrong-site guard still holds (control): a late US answer after moving to CA.
    var r4 = makeReco();
    r4.go('US'); r4.load();
    r4.go('CA'); r4.load();
    return r4.settle().then(function () {
      eq(r4.state().scope && r4.state().scope.country, 'CA', 'B11 CONTROL: a late answer for the site the operator left never lands');
    });
  });
}

// =============================================================================================================
// PART C — THE READ MODEL AND THE EXPOSURE MAP, through the shipped Search and exposure functions
// =============================================================================================================
var C_FNS = ['_irTaipeiDay_', '_irSourceStamp_', '_irSourceVerdict_', '_irLocalPlanPending_',
  '_irExposureRetireIfSourceMoved_', '_irRunVerifiedSearch_', '_irEnsureExposureLoaded_'];
function makeSearch(src, setup) {
  src = src || IRSRC;
  var S = { EPOCH: { planning: 0, exposure: 0 }, NOW: RealDate.UTC(2026, 9, 21, 2, 0, 0), reads: [], applied: 0, ws: 0 };
  function FakeDate() { var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(a)))() : new RealDate(S.NOW); }
  FakeDate.now = function () { return S.NOW; }; FakeDate.UTC = RealDate.UTC; FakeDate.prototype = RealDate.prototype;
  var sb = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    JSON: JSON, Math: Math, Date: FakeDate, Promise: Promise, Object: Object, Array: Array, String: String, Number: Number,
    isFinite: isFinite, setTimeout: setTimeout, clearTimeout: clearTimeout,
    window: { KM: { DB: { sourceWriteEpoch: function () { return { planning: S.EPOCH.planning, exposure: S.EPOCH.exposure, last: null }; },
      adaptInventoryReplenishmentWorkspace: function (d) { return d; } },
      api: { getWorkspace: function () { S.ws++; return Promise.resolve({ success: true, data: { shipments: [] } }); } } } },
    _irSearch: { seq: 0, inFlight: false, applied: { country: 'US', marketplaceId: 'MP-US' } },
    _irReadModel: null, _irReadModelSource: null,
    _irExposureByScope: {}, _irExposureSeq: 0, _irExposureSourceCheck: null,
    _irUnsavedRoutes: {}, _draftDbTimers: {}, _draftDbInFlight: {}, _draftDbDirty: {}, _pendingDraftCancels: {},
    _irEffectiveWorkspace: function () { return true; },
    _irApplySearch_: function () { S.applied++; },
    _irRenderSearchGate_: function () {},
    _irWorkspaceRefresh_: function (o) { S.reads.push(o && o.owner); return Promise.resolve(); },
    _irExposureScopeKey_: function () { return 'KM|US|MP-US'; },
    _irExposureSite_: function () { return { company: 'KM', country: 'US', marketplace: 'Amazon' }; },
    _irBuildExposureIndexes_: function () { return {}; },
    _irOnExposureSettled_: function () {},
    _irNowMs_: function () { return 0; },
    IR_EXPOSURE_TABLES_: ['shipments']
  };
  var ctx = vm.createContext(sb);
  var st = varSrc(src, 'IR_EXPOSURE_STATES_'); if (st) vm.runInContext(st, ctx);
  var missing = [];
  C_FNS.forEach(function (f) { var s = fnSrc(src, f); if (s) vm.runInContext(s, ctx); else missing.push(f); });
  if (setup) setup(sb);
  return { S: S, sb: sb, ctx: ctx, missing: missing, run: function (c) { return vm.runInContext(c, ctx); },
    stamp: function () { return has(src, '_irSourceStamp_') ? vm.runInContext('_irSourceStamp_()', ctx) : null; },
    search: function () { vm.runInContext('_irRunVerifiedSearch_({})', ctx); } };
}
function readyEntry(h, stamp) {
  h.sb._irExposureByScope['KM|US|MP-US'] = { key: 'KM|US|MP-US', state: 'READY', model: { shipments: [] }, indexes: {}, generation: 1, source: stamp };
}
function partC() {
  section('C. the read model and the exposure map');
  var h = makeSearch();
  ok(h.missing.length === 0, 'C0  the shipped helpers exist: ' + C_FNS.join(', '), h.missing);
  if (h.missing.indexOf('_irRunVerifiedSearch_') !== -1) return Promise.resolve();
  // C1 CONTROL - model loaded under the current stamp: Search filters in memory.
  h.sb._irReadModel = { getMarketplaces: [] }; h.sb._irReadModelSource = h.stamp();
  h.search();
  eq({ reads: h.S.reads.length, applied: h.S.applied }, { reads: 0, applied: 1 }, 'C1  CONTROL: nothing written - Search reuses the model, zero reads');
  // C2 RELATED WRITE - the model predates a planning write.
  h.S.EPOCH.planning += 2;
  h.sb._irSearch.inFlight = false;
  h.search();
  eq(h.S.reads.length, 1, 'C2  COUNTER-EXAMPLE: a planning source was written - Search performs a fresh read instead of filtering the old model');
  // C3 CROSS-DAY - the model is from yesterday (Taipei).
  var h3 = makeSearch();
  h3.sb._irReadModel = {}; h3.sb._irReadModelSource = h3.stamp();
  h3.S.NOW = RealDate.UTC(2026, 9, 21, 16, 30, 0);           // 2026-10-22 00:30 Taipei
  h3.search();
  eq(h3.S.reads.length, 1, 'C3  COUNTER-EXAMPLE: a model read yesterday (Taipei) is re-read, the daily import may have replaced it');
  // C4 UNKNOWN - a model with no stamp.
  var h4 = makeSearch();
  h4.sb._irReadModel = {}; h4.sb._irReadModelSource = null;
  h4.search();
  eq(h4.S.reads.length, 1, 'C4  COUNTER-EXAMPLE: a model that cannot say what it was read under is re-read, never assumed current');
  // C5 EXPOSURE - an exposure write since the entry was read, nothing pending locally: retired on Search.
  var h5 = makeSearch();
  h5.sb._irReadModel = {}; h5.sb._irReadModelSource = h5.stamp();
  readyEntry(h5, h5.stamp());
  h5.S.EPOCH.exposure += 2;
  h5.search();
  ok(!h5.sb._irExposureByScope['KM|US|MP-US'], 'C5  COUNTER-EXAMPLE: a shipment/plan/draft was written - Search retires the held exposure so it is read again');
  eq(h5.S.reads.length, 0, 'C5b and a write the first layer never reads does not cost a first-layer read (unrelated source)');
  // C6 THE MANUAL PLAN: the same write, but the operator has route edits that have not reached the DB.
  [['_draftDbTimers', { 'CO1150-AG': 7 }], ['_draftDbInFlight', { 'CO1150-AG': true }], ['_draftDbDirty', { 'CO1150-AG': true }],
   ['_pendingDraftCancels', { 'CO1150-AG': ['LINE-1'] }], ['_irUnsavedRoutes', { 'CO1150-AG': { code: 'SAVE_FAILED' } }]].forEach(function (p) {
    var h6 = makeSearch(null, function (sb) { sb[p[0]] = p[1]; });
    h6.sb._irReadModel = {}; h6.sb._irReadModelSource = h6.stamp();
    readyEntry(h6, h6.stamp());
    h6.S.EPOCH.exposure += 2;
    h6.search();
    ok(!!h6.sb._irExposureByScope['KM|US|MP-US'], 'C6  COUNTER-EXAMPLE: ' + p[0] + ' pending - the exposure (and the hydrate it would trigger) is KEPT; a system re-read never replaces an unsaved manual plan');
    eq(h6.sb._irExposureSourceCheck && h6.sb._irExposureSourceCheck.outcome, 'KEPT_FOR_LOCAL_PLAN', 'C6b and the decision is recorded by name (' + p[0] + ')');
  });
  // C7 CONTROL - exposure current: kept, no re-read.
  var h7 = makeSearch();
  h7.sb._irReadModel = {}; h7.sb._irReadModelSource = h7.stamp();
  readyEntry(h7, h7.stamp());
  h7.S.EPOCH.planning += 2;                                  // planning only
  h7.search();
  ok(!!h7.sb._irExposureByScope['KM|US|MP-US'], 'C7  CONTROL: a planning-only write leaves the exposure map alone');
  // C8 - the lazy loader stamps what it read under.
  var h8 = makeSearch();
  h8.S.EPOCH.exposure = 6;
  return Promise.resolve(h8.run('_irEnsureExposureLoaded_()')).then(function (e) {
    eq(e && e.source && e.source.exposure, 6, 'C8  the exposure entry records the epoch it was issued under');
    // C9 - structural: the RESTORED mount branch checks the exposure before it paints, and the read model
    // records its stamp where it is assigned.
    var boot = fnSrc(IRSRC, '_irBootstrapScope_') || '';
    var restored = boot.slice(boot.indexOf("rec.mode = 'RESTORED'"), boot.indexOf('renderReplenishment();', boot.indexOf("rec.mode = 'RESTORED'")));
    ok(/_irExposureRetireIfSourceMoved_\('RESTORED_MOUNT'\)/.test(restored), 'C9  the restored mount checks the held exposure BEFORE it repaints');
    var wr = fnSrc(IRSRC, '_irWorkspaceRefresh_') || '';
    ok(/_irReadModelSource\s*=\s*_srcAtIssue/.test(wr) && /var _srcAtIssue = _irSourceStamp_\(\)/.test(wr),
      'C9b the read model is stamped with the epoch captured when its read was ISSUED');
  });
}

// =============================================================================================================
// PART D — THE TWO DATES, MADE TRACEABLE (values untouched)
// =============================================================================================================
function partD() {
  section('D. Avg Sales window vs Gap calculation date - stated, not unified');
  var r = makeReco();
  if (!has(IRSRC, '_irAvgSalesWindowNote_')) { failed += 4; console.log('FAIL D1-D4 _irAvgSalesWindowNote_ is absent (counted as 4)'); return Promise.resolve(); }
  r.go('US'); r.load();
  return r.settle().then(function () {
    var appliedKey = r.run('_irAppliedScopeKey_()');
    r.run('_irMatState = { status: "READY", scopeKey: "k", appliedScopeKey: ' + JSON.stringify(appliedKey) + ', bySku: {}, rows: [{ sku: "CO1150-AG", calculation_date: "2026-10-20" }], loadedOk: true, error: null }');
    var note = r.run('_irAvgSalesWindowNote_()');
    ok(/2026-08-19/.test(note) && /2026-10-20/.test(note), 'D1  the Avg window anchor (2026-08-19) and the Gap date (2026-10-20) are both named', note);
    ok(/different/i.test(note), 'D1b and the note says they differ, rather than leaving the reader to infer it', note);
    r.run('_irMatState.rows[0].calculation_date = "2026-08-19"');
    var same = r.run('_irAvgSalesWindowNote_()');
    ok(/2026-08-19/.test(same) && !/different/i.test(same), 'D2  equal dates: one date, no warning', same);
    r.run('_irRecoState.calculationDate = null');
    eq(r.run('_irAvgSalesWindowNote_()'), '', 'D3  no anchor reported - nothing is invented');
    var title = fnSrc(IRSRC, '_irAvgSalesTitleText_') || '';
    var painters = (IRSRC.match(/_irAvgSalesTitleText_\(item\)/g) || []).length;
    ok(/_irAvgSalesWindowNote_/.test(title) && painters >= 3, 'D4  all three Avg title writers go through the one title helper (' + painters + ')');
  });
}

// =============================================================================================================
// PART M — MUTANTS: each guard is load-bearing
// =============================================================================================================
function mutate(src, find, repl, label) {
  if (src.indexOf(find) === -1) { console.log('FAIL M-setup ' + label + ': mutation target absent'); failed++; return null; }
  return src.split(find).join(repl);
}
function partM() {
  section('M. mutants');
  if (!has(IRSRC, '_irSourceVerdict_')) { failed += 5; console.log('FAIL M1-M5 the guards under mutation are absent (counted as 5)'); return Promise.resolve(); }
  var results = [];
  // M1 - the cache serves without asking the source verdict.
  var m1 = mutate(IRSRC, "var _sv = _irSourceVerdict_(e.source, 'planning');", "var _sv = { verdict: 'SAME', reason: null };", 'M1');
  // M2 - the dedupe trusts any settled state.
  var m2 = mutate(IRSRC, "&& _irSourceVerdict_(_irRecoState.source, 'planning').verdict === 'SAME') return null;", ") return null;", 'M2');
  // M3 - Search reuses any loaded model.
  var m3 = mutate(IRSRC, "if (_irReadModel && _rmVerdict && _rmVerdict.verdict === 'SAME')", "if (_irReadModel)", 'M3');
  // M4 - the exposure retirement ignores the local plan.
  var m4 = mutate(IRSRC, 'var pend = _irLocalPlanPending_();', 'var pend = [];', 'M4');
  // M5 - the writer wrapper notes only the settle, not the dispatch.
  var m5 = mutate(DBAPI, "_kmNoteSourceWrite_(name, fam, 'DISPATCH');", '', 'M5');
  var p = Promise.resolve();
  if (m1) p = p.then(function () {
    var r = makeReco(m1); r.go('US'); r.load();
    return r.settle().then(function () { r.go('CA'); r.load(); return r.settle(); }).then(function () {
      r.S.EPOCH.planning += 2; var b = r.S.HTTP; r.go('US'); r.load(); results.push(['M1', r.S.HTTP - b === 0]); return r.settle(); });
  });
  if (m2) p = p.then(function () {
    var r = makeReco(m2); r.go('US'); r.load();
    return r.settle().then(function () { r.S.EPOCH.planning += 2; var b = r.S.HTTP; r.load(); results.push(['M2', r.S.HTTP - b === 0]); return r.settle(); });
  });
  if (m3) p = p.then(function () {
    var h = makeSearch(m3); h.sb._irReadModel = {}; h.sb._irReadModelSource = h.stamp(); h.S.EPOCH.planning += 2; h.search();
    results.push(['M3', h.S.reads.length === 0]);
  });
  if (m4) p = p.then(function () {
    var h = makeSearch(m4, function (sb) { sb._draftDbTimers = { X: 1 }; });
    h.sb._irReadModel = {}; h.sb._irReadModelSource = h.stamp(); readyEntry(h, h.stamp()); h.S.EPOCH.exposure += 2; h.search();
    results.push(['M4', !h.sb._irExposureByScope['KM|US|MP-US']]);
  });
  if (m5) p = p.then(function () {
    var c = makeClient({ src: m5 });
    var pr = c.DB.upsertFcTargetRule({}); var mid = c.epoch().planning;
    results.push(['M5', mid === 0]);
    return within(Promise.resolve(pr).catch(function () {}), 3000);
  });
  return p.then(function () {
    var names = { M1: 'cache served without the source verdict', M2: 'dedupe trusts any settled answer',
      M3: 'Search reuses any loaded model', M4: 'exposure retired over an unsaved manual plan', M5: 'epoch moves only at settle' };
    results.forEach(function (x) { ok(x[1], x[0] + '  mutant CAUGHT: ' + names[x[0]] + ' - the matching counter-example fails under it'); });
  });
}

partA().then(partB).then(partC).then(partD).then(partM).then(function () {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed ? 1 : 0;
}, function (e) {
  console.log('FAIL harness threw: ' + (e && e.stack || e));
  console.log('\n' + passed + ' passed, ' + (failed + 1) + ' failed');
  process.exitCode = 1;
});
