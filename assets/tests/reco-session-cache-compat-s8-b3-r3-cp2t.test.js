// Kitchen Mama Operation System - S8-B3-R3-CP2T P0
// A SESSION CACHE THAT OUTLIVED THE SHAPE IT WAS STORED FOR
//
// Run: node assets/tests/reco-session-cache-compat-s8-b3-r3-cp2t.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes.
//
// THE REPORT. After the 42_ sync, the Avg Sales column shows `unavailable` on some rows and `--` on
// others. Two different symptoms in one column, which is the shape of TWO different causes.
//
// THE CANDIDATE THIS SUITE TESTS, and it is a CLIENT cause rather than a DB one. The recommendation
// session cache stores a successful envelope under a SCOPE-ONLY key - company||country||marketplace -
// and the record carries NO marker of the response shape it was built from. `loadRecommendationWorkspace_`
// consults it BEFORE issuing a request and, on a hit, restores it with ZERO HTTP. sessionStorage survives
// a reload, so an operator whose tab was open before the sync keeps being served the PRE-SYNC envelope:
//
//   * a pre-CP2S-R1 envelope has WAREHOUSE lines with no `horizonBasis` at all  -> the picker finds
//     nothing -> the cell prints `--`, which reads as "no sales"
//   * an envelope whose bases are named quality errors                          -> the cell prints
//     `unavailable`
//
// ONE STALE RECORD PRODUCES BOTH SYMPTOMS, and in that state the new deployment is never asked, so no
// amount of correct server behaviour can show up on screen.
//
// WHAT THIS SUITE DOES NOT CLAIM. It does not claim this IS the Owner's failure. It establishes that the
// client can produce exactly these two symptoms from a stale cache without the server being wrong, which
// is why `fromCache` has to become observable (section F) before anything is concluded from a screenshot.
// Clearing a cache is not a diagnosis and must never be reported as a fix.
//
// NOTE: no 'use strict' - the shipped IRRECO region is eval'd into MODULE scope.
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var IRSRC = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8');
var F1A = require('./_f1a-scope-guard.js');
var IRREGION = IRSRC.slice(IRSRC.indexOf('// __IRRECO_START__'), IRSRC.indexOf('// __IRRECO_END__'));

// ---------------------------------------------------------------------------------------------------
// A REAL sessionStorage, because the cache is a sessionStorage consumer and a fake that always returns
// null would make every read a miss - which is the state this suite is trying to prove is NOT safe.
// ---------------------------------------------------------------------------------------------------
var STORE = {};
global.sessionStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(STORE, k) ? STORE[k] : null; },
  setItem: function (k, v) { STORE[k] = String(v); },
  removeItem: function (k) { delete STORE[k]; }
};

var SCOPE = { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' };
var OTHER_COMPANY = { company: 'Res US', country: 'US', marketplace: 'Amazon' };
var OTHER_SITE = { company: 'Kitchen Mama', country: 'CA', marketplace: 'Amazon' };

global.window = { IRContext: { toScopeRequest: function () { return SCOPE; } }, KM_FLAGS: {} };
var DC1_EPOCH_ = require('./_dc1-source-epoch.js').epochStub();   // DC1-R1 - the production write signal; constant = nothing written
global.window.KM = { DB: { sourceWriteEpoch: DC1_EPOCH_ } };   // mounted before section A, which reads the store directly
var DOMROWS = [];
global.document = { querySelectorAll: function (sel) { return /scroll-row/.test(sel) ? DOMROWS : []; }, getElementById: function () { return null; } };
global.AbortController = function () { this.signal = {}; this.abort = function () {}; };
var REPLEN_ITEMS = [];
function escapeReplenHtml(s) { return String(s == null ? '' : s); }
function getReplenishmentData() { return REPLEN_ITEMS; }
function updateReplenRecoContext() { return {}; }
function _irRecoRerenderSummaries() {}
function _legacyRecSummaryTableHtml() { return ''; }
function _recSummaryRows() { return ''; }
function _irSearchApplied_() { return true; }
var RENDERS = 0;
function renderReplenishment() { RENDERS++; }

eval(F1A.guardPreamble(IRSRC));
eval(IRSRC.slice(IRSRC.indexOf('var IR_AVG_QUALITY_TEXT'), IRSRC.indexOf('function _irScrollRowHtml_')));
eval(IRREGION);

var SKU = 'CO1150-AG';

// ---- the two envelope shapes that exist in the wild -------------------------------------------------
// PRE-CP2S-R1: the warehouse lane published no basis at all. This is what a tab opened before the sync
// has sitting in sessionStorage.
function oldWarehouseEnvelopeData() {
  return { lines: [
    { sku: SKU, siteSku: 'SS-1', destinationType: 'WAREHOUSE', warehouseId: 'WH-A',
      recommendationMode: 'WAREHOUSE_REPLENISHMENT', blocked: false, recommendedQty: 120 },
    { sku: SKU, siteSku: 'SS-1', destinationType: 'WAREHOUSE', warehouseId: 'WH-B',
      recommendationMode: 'WAREHOUSE_REPLENISHMENT', blocked: false, recommendedQty: 80 }
  ], dataVersion: { sourceDataAsOf: '2026-10-10' } };
}
// An envelope whose every basis is a NAMED error - the other half of the reported screen.
function oldAllErrorEnvelopeData() {
  var b = { demandMode: 'sales_driven', avgSalesPerDay: null, source: null, warning: null,
    normalDayCount: null, excludedDates: null, horizonOpeningQty: null, qualifiedIncomingCount: null,
    blankDateRows: null, basisQualityError: 'SALES_BASIS_CONTAMINATION_UNRESOLVED', contaminationSource: null };
  return { lines: [{ sku: SKU, destinationType: 'WAREHOUSE', warehouseId: 'WH-A', horizonBasis: b }],
    dataVersion: { sourceDataAsOf: '2026-10-10' } };
}
// TODAY: both lanes publish a basis, and a confirmed zero is a rate.
function currentEnvelopeData(rate, err) {
  var b = { demandMode: 'sales_driven', avgSalesPerDay: (rate === undefined ? null : rate),
    source: 'normalized_30d', warning: '', normalDayCount: 30, excludedDates: [],
    horizonOpeningQty: null, qualifiedIncomingCount: null, blankDateRows: 0,
    basisQualityError: (err || null), contaminationSource: null };
  return { lines: [
    { sku: SKU, destinationType: 'WAREHOUSE', warehouseId: 'WH-A', horizonBasis: b },
    { sku: SKU, destinationType: 'WAREHOUSE', warehouseId: 'WH-B', horizonBasis: b }
  ], dataVersion: { sourceDataAsOf: '2026-10-16' } };
}
// S8-B3-R3-CP2T-R1 - a real response carries the handler marker 42_ stamps on EVERY envelope, and the
// cache now reads it: a matching SHAPE is not a compatible COMPUTATION. HANDLER_OK is the version this
// build accepts; HANDLER_OLD is the one that handed campaign date CELLS to the owner as String(Date),
// whose records have exactly this shape and the wrong values inside it.
// CP2T-R2 - r5e is the accepted computation now, and the superseded list has TWO entries. r5c mis-read the
// campaign date cells; r5d read them correctly and still published a fabricated 0 whenever the weekly
// fallback rung had no readable source. r5d is the sharper case of this whole guard: its records are
// readable, correctly shaped, and WRONG - which a shape check cannot see and a version check can.
var HANDLER_OK = 'fm5-r4ui-r5e';
var HANDLER_OLD = 'fm5-r4ui-r5c';
var HANDLER_WRONG_ZERO = 'fm5-r4ui-r5d';
function envOf(data, handler) { return { success: true, data: data, meta: { requestId: 'rid-1', calculationMonth: '2026-10', planningCycle: 'W1', recommendationWorkspaceHandlerVersion: handler === undefined ? HANDLER_OK : handler }, errors: [] }; }

function resetAll() {
  for (var k in STORE) delete STORE[k];
  _irRecoCacheMem = null;
  _irRecoInvalidate('CONTEXT_NOT_READY');
  RENDERS = 0;
}
// Serve the loader a FRESH response, so "the cache was bypassed" is observable as the fresh value arriving.
function serveFresh(data, handler) {
  global.window.KM = { DB: { sourceWriteEpoch: DC1_EPOCH_ }, api: { workspaceApiActive: function (n) { return n === 'recommendation'; },
    getWorkspace: function () { return Promise.resolve(envOf(data, handler)); } } };
}
function pickRate() { var b = _irCanonicalSalesBasis_(SKU); return b ? b.avgSalesPerDay : null; }
function pickErr() { var b = _irCanonicalSalesBasis_(SKU); return b ? b.basisQualityError : null; }

// ---------------------------------------------------------------------------------------------------
section('A  a PRE-SYNC envelope must not be restored over the new deployment');
// ---------------------------------------------------------------------------------------------------
// THE OLD RECORD IS WRITTEN THE WAY THE OLD BUILD WROTE IT, which is the only way this proves anything.
// The first version of this section stored the old ENVELOPE through today's setter, so the record was
// stamped with today's shape and the test was asking whether a current record is served - it is, and
// should be. What the operator actually has is a record written by the PREVIOUS build: under the previous
// storage key, with no shape field at all, because that build had no such concept.
var LEGACY_KEY = 'km_ir_reco_cache_v1';
function seedLegacyRecord(scope, data) {
  var rec = {};
  rec[[scope.company, scope.country, scope.marketplace].join('||')] = {
    requestScope: { company: scope.company, country: scope.country, marketplace: scope.marketplace },
    envelopeData: data,
    meta: { requestId: 'rid-old', calculationMonth: '2026-10', planningCycle: 'W1',
      dataVersion: data.dataVersion || null },
    cachedAt: Date.now()
  };
  STORE[LEGACY_KEY] = JSON.stringify(rec);
  _irRecoCacheMem = null;            // force a re-read from the store, as a fresh page load would
}
// And the same record under TODAY's key but with no shape - a half-written or hand-edited store.
function seedUnstampedRecord(scope, data) {
  var rec = {};
  rec[[scope.company, scope.country, scope.marketplace].join('||')] = {
    requestScope: { company: scope.company, country: scope.country, marketplace: scope.marketplace },
    envelopeData: data, meta: { requestId: 'rid-old' }, cachedAt: Date.now()
  };
  STORE[_IR_RECO_CACHE_KEY] = JSON.stringify(rec);
  _irRecoCacheMem = null;
}

resetAll();
seedLegacyRecord(SCOPE, oldWarehouseEnvelopeData());
ok(_irRecoCacheGet(SCOPE) === null,
  'A1  a record written by the PREVIOUS build is not served - it is the "--" half of the report',
  _irRecoCacheGet(SCOPE) ? 'SERVED' : 'refused');
ok(STORE[LEGACY_KEY] === undefined,
  'A1a and the superseded store is dropped rather than left in the session for the rest of the day');

resetAll();
seedLegacyRecord(SCOPE, oldAllErrorEnvelopeData());
ok(_irRecoCacheGet(SCOPE) === null,
  'A2  nor is one whose every basis is a named error - the "unavailable" half');

resetAll();
seedUnstampedRecord(SCOPE, oldWarehouseEnvelopeData());
ok(_irRecoCacheGet(SCOPE) === null,
  'A3  nor a record under TODAY key that declares no shape - absent is not "assume compatible"');
ok(JSON.parse(STORE[_IR_RECO_CACHE_KEY] || '{}')[[SCOPE.company, SCOPE.country, SCOPE.marketplace].join('||')] === undefined,
  'A3a and it is dropped on the way past, so the next lookup is a clean miss');

// CP2T-R1 - AND THE CASE A SHAPE CHECK CANNOT SEE. This record has exactly the shape this build reads:
// horizonBasis present, every field in place. What is wrong with it is the VALUES - computed by the
// handler that String()-ed the campaign date cells, so a real history reads as a named refusal. A record
// that is merely WRONG is more dangerous than one that is unreadable, because it renders.
// S8-B3-R3-CP2X - THE RECORD NOW CARRIES A REVISION BLOCK, because a record written by this build does.
// CP2X retires records that have none at all (they can state no planning context and no source state, so
// nothing can be compared against them), and seeding one without it would make every case in this section
// pass for that reason instead of the one it is testing - A5 in particular, whose whole point is that an
// ACCEPTED computation IS still served. The guards under test here are unchanged: shape, then handler.
function seedStampedRecord(scope, data, handler) {
  var rec = {};
  rec[[scope.company, scope.country, scope.marketplace].join('||')] = {
    shape: _IR_RECO_CACHE_SHAPE, handlerVersion: handler,
    requestScope: { company: scope.company, country: scope.country, marketplace: scope.marketplace },
    envelopeData: data, meta: { requestId: 'rid-old' }, cachedAt: Date.now(),
    revision: { calculationDate: '2026-10-16', calculationMonth: '2026-10', planningCycle: 'RECO-2026-10',
      formulaVersion: (data && data.dataVersion && data.dataVersion.formulaVersion) || null,
      sourceDataAsOf: (data && data.dataVersion && data.dataVersion.sourceDataAsOf) || null },
    // DC1-R1 - and the source stamp a record written by this build carries (current: nothing written since).
    source: _irSourceStamp_()
  };
  STORE[_IR_RECO_CACHE_KEY] = JSON.stringify(rec);
  _irRecoCacheMem = null;
}
resetAll();
seedStampedRecord(SCOPE, currentEnvelopeData(null, 'SALES_BASIS_CONTAMINATION_UNRESOLVED'), HANDLER_OLD);
ok(_irRecoCacheGet(SCOPE) === null,
  'A4  a record with THIS shape but the PRE-REPAIR computation is not served - the shape matched and the '
  + 'answer was still the one the date defect produced');
ok(JSON.parse(STORE[_IR_RECO_CACHE_KEY] || '{}')[[SCOPE.company, SCOPE.country, SCOPE.marketplace].join('||')] === undefined,
  'A4a and it too is dropped on the way past');

// r5d: readable, right shape, wrong values. The record below carries a rate of 0 that the handler divided
// out of a week it never read, and nothing about its structure says so.
resetAll();
seedStampedRecord(SCOPE, currentEnvelopeData(0), HANDLER_WRONG_ZERO);
ok(_irRecoCacheGet(SCOPE) === null,
  'A4b  nor is an r5d record whose 0 rate was fabricated from an unread weekly source - it is READABLE and '
  + 'correctly SHAPED, so only the computation version distinguishes it from a real reported zero');

resetAll();
seedStampedRecord(SCOPE, currentEnvelopeData(11), HANDLER_OK);
ok(_irRecoCacheGet(SCOPE) !== null,
  'A5  while a record from an ACCEPTED computation is served - the guard is a version check, not a purge');

// The acceptance is a NAMED LIST, not a comparison, so a version this build has never heard of is refused
// rather than guessed at - including one that looks newer.
resetAll();
seedStampedRecord(SCOPE, currentEnvelopeData(11), 'fm5-r4ui-r9z');
ok(_irRecoCacheGet(SCOPE) === null,
  'A6  and an UNKNOWN version is refused rather than assumed compatible, however new it looks');

// ---------------------------------------------------------------------------------------------------
section('B  and the page then asks the NEW deployment, rather than showing the old answer');
// ---------------------------------------------------------------------------------------------------
resetAll();
seedLegacyRecord(SCOPE, oldWarehouseEnvelopeData());
serveFresh(currentEnvelopeData(12.5));
var p = loadRecommendationWorkspace_();
Promise.resolve(p).then(function () {
  return new Promise(function (r) { setTimeout(r, 0); });
}).then(function () {
  eq(pickRate(), 12.5, 'B1  the FRESH rate reaches the picker - the stale record did not shadow it');
  eq(_irRecoState.fromCache === true, false, 'B1a and the state does not claim it came from the cache');

  // ---------------------------------------------------------------------------------------------------
  section('C  a CURRENT record is still cached, and a confirmed zero is not mistaken for an absence');
  // ---------------------------------------------------------------------------------------------------
  resetAll();
  _irRecoCacheSet(SCOPE, envOf(currentEnvelopeData(0)), _irSourceStamp_());   // DC1-R1 - stored as the live path stores it
  var hit = _irRecoCacheGet(SCOPE);
  ok(hit !== null, 'C1  a record stored by THIS build is served - the cache still does its job');
  eq(hit && hit.envelopeData.lines[0].horizonBasis.avgSalesPerDay, 0,
    'C2  and a confirmed zero survives it - 0 is a rate, never an absence');
  eq(hit && hit.meta.dataVersion && hit.meta.dataVersion.sourceDataAsOf, '2026-10-16',
    'C3  the version information the server sent is still carried through');

  resetAll();
  _irRecoCacheSet(SCOPE, envOf(currentEnvelopeData(null, 'SALES_BASIS_UNAVAILABLE')), _irSourceStamp_());   // DC1-R1 - stored as the live path stores it
  ok(_irRecoCacheGet(SCOPE) !== null,
    'C4  a CURRENT response whose basis is a named error is still a success and is still cached - '
    + 'refusing it would be the CP2S B7 defect moved into the cache');

  // ---------------------------------------------------------------------------------------------------
  section('D  company and site isolation - a key is not a scope');
  // ---------------------------------------------------------------------------------------------------
  resetAll();
  _irRecoCacheSet(SCOPE, envOf(currentEnvelopeData(9)), _irSourceStamp_());   // DC1-R1 - stored as the live path stores it
  ok(_irRecoCacheGet(OTHER_COMPANY) === null,
    'D1  the same country+marketplace under ANOTHER COMPANY is a different key - US holds both KM and Res US');
  ok(_irRecoCacheGet(OTHER_SITE) === null, 'D2  and another country is another key');
  eq(_irRecoCacheGet(SCOPE) && _irRecoCacheGet(SCOPE).envelopeData.lines[0].horizonBasis.avgSalesPerDay, 9,
    'D3  while the scope that stored it still resolves');

  // ---------------------------------------------------------------------------------------------------
  section('E  the stale-RESPONSE guard is a different guard, and it is untouched');
  // ---------------------------------------------------------------------------------------------------
  resetAll();
  serveFresh(currentEnvelopeData(7));
  return Promise.resolve(loadRecommendationWorkspace_()).then(function () {
    return new Promise(function (r) { setTimeout(r, 0); });
  });
}).then(function () {
  eq(pickRate(), 7, 'E1  a fresh result resolves');
  var good = _irRecoState.appliedScopeKey;
  _irRecoState.appliedScopeKey = F1A.MISMATCHED_SCOPE_KEY;
  eq(_irCanonicalSalesBasis_(SKU), null,
    'E2  a result produced for ANOTHER applied scope is still refused - the F1A guard was not widened');
  _irRecoState.appliedScopeKey = good;
  eq(pickRate(), 7, 'E2a and the correctly-stamped twin still resolves');

  // ---------------------------------------------------------------------------------------------------
  section('F  which answer the operator is looking at must be VISIBLE');
  // ---------------------------------------------------------------------------------------------------
  // `fromCache` is set on the hit path and read NOWHERE, so "old cached result" and "new deployment
  // answered" look identical from outside. Item 1 of the approval is to tell them apart; a screenshot
  // cannot, and neither could anyone reading this page's state.
  resetAll();
  _irRecoCacheSet(SCOPE, envOf(currentEnvelopeData(4.25)), _irSourceStamp_());   // DC1-R1 - stored as the live path stores it
  return Promise.resolve(loadRecommendationWorkspace_()).then(function () {
    return new Promise(function (r) { setTimeout(r, 0); });
  });
}).then(function () {
  eq(pickRate(), 4.25, 'F1  a CURRENT cached record is restored (zero HTTP) - the cache still works');
  eq(_irRecoState.fromCache, true, 'F2  and the state says the answer came from the cache');
  ok(typeof _irRecoAnswerSource_ === 'function',
    'F3  there is a named reader for it, so the distinction can be reported rather than inferred');
  eq(typeof _irRecoAnswerSource_ === 'function' ? _irRecoAnswerSource_().source : null, 'SESSION_CACHE',
    'F3a which says SESSION_CACHE on a restored answer');
  eq(typeof _irRecoAnswerSource_ === 'function' ? _irRecoAnswerSource_().requestId : null, 'rid-1',
    'F3b and carries the requestId of the response that was stored, not a new one');

  resetAll();
  serveFresh(currentEnvelopeData(5.5));
  return Promise.resolve(loadRecommendationWorkspace_()).then(function () {
    return new Promise(function (r) { setTimeout(r, 0); });
  });
}).then(function () {
  eq(typeof _irRecoAnswerSource_ === 'function' ? _irRecoAnswerSource_().source : null, 'SERVER',
    'F4  and SERVER when the deployment actually answered');
  eq(_irRecoAnswerSource_().handlerVersion, HANDLER_OK,
    'F5  naming WHICH deployed handler computed it, which is the other half of "is this the new deployment"');
  eq(_irRecoAnswerSource_().handlerAccepted, true, 'F5a and whether this build accepts that computation');

  // ---------------------------------------------------------------------------------------------------
  section('G  a PRE-REPAIR deployment answering live is SHOWN, and never stored');
  // ---------------------------------------------------------------------------------------------------
  // Refusing to display it would be worse: it is what the server currently says, and hiding it would make
  // an unsynced deployment look like an empty one. What must not happen is that it OUTLIVES the deployment
  // that produced it, so it is never written to the store.
  resetAll();
  serveFresh(currentEnvelopeData(3.75), HANDLER_OLD);
  return Promise.resolve(loadRecommendationWorkspace_()).then(function () {
    return new Promise(function (r) { setTimeout(r, 0); });
  });
}).then(function () {
  eq(pickRate(), 3.75, 'G1  the live answer from a pre-repair handler IS displayed - it is the current truth');
  eq(_irRecoAnswerSource_().handlerVersion, HANDLER_OLD, 'G1a and the probe names the handler that produced it');
  eq(_irRecoAnswerSource_().handlerAccepted, false, 'G1b and says this build does not accept that computation');
  ok(_irRecoCacheGet(SCOPE) === null,
    'G2  and it was NOT stored, so it cannot be replayed after the deployment that produced it is gone');

  // A response with NO marker at all is a deployment older than the marker itself. Same treatment.
  resetAll();
  serveFresh(currentEnvelopeData(2.5), null);
  return Promise.resolve(loadRecommendationWorkspace_()).then(function () {
    return new Promise(function (r) { setTimeout(r, 0); });
  });
}).then(function () {
  eq(pickRate(), 2.5, 'G3  an UNSTAMPED response is displayed too');
  eq(_irRecoAnswerSource_().handlerVersion, null,
    'G3a with handlerVersion null, which is itself the answer: a deployment older than the marker');
  ok(_irRecoCacheGet(SCOPE) === null, 'G3b and it is not stored either - absent is not "assume compatible"');

  console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed === 0 ? 0 : 1;
}).catch(function (e) {
  console.log('FAIL  suite threw: ' + (e && e.stack || e));
  process.exitCode = 1;
});
