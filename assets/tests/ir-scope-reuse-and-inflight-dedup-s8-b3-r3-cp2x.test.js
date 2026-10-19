// Kitchen Mama Operation System — S8-B3-R3-CP2X §1/§2
// US → EU → US, LEAVE AND RETURN, AND RE-ENTRY WHILE LOADING — COUNTED, NOT ESTIMATED.
//
// Run: node assets/tests/ir-scope-reuse-and-inflight-dedup-s8-b3-r3-cp2x.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes, no browser.
//
// WHAT MAKES THIS A REPRODUCTION RATHER THAN A MODEL. The shipped IRRECO region of
// inventory-replenishment.js is eval'd verbatim — the real `loadRecommendationWorkspace_`, the real
// session cache, the real F1A stale-scope guard, a real sessionStorage, and a transport that resolves
// on a LATER TURN so "in flight" is genuinely in flight rather than a label. Every number below is
// counted by the harness; none is asserted from reading the source.
//
// TWO COUNTERS, KEPT APART, because the round asks for exactly that distinction:
//   HTTP     — one increment per getWorkspace CALL. This is the cost.
//   REPAINT  — one increment per summary re-render. A repaint without an HTTP is the cache working.
//
// THE SCENARIOS, in the order the round names them:
//   §B  US → EU → US          — does coming back cost a request?
//   §C  leave the page, return — does remounting cost a request?
//   §D  re-entry while LOADING, same scope — does a second call duplicate the first?
//   §E  re-entry while LOADING, scope flip  — what does an aborted request actually cost?
//   §F  metadata round-trip: what SURVIVES the cache, and what the page silently loses.
//
// §F is where this suite started failing, and the failure is the point: `calculationDate` — the
// authoritative 90-day window anchor the server stamps on every successful response — is read on the
// live path and NOT stored by the cache, so a restored answer reports `calculationDate: null`. The
// field that says WHICH window the numbers describe disappears exactly when nobody is watching.
//
// NOTE: no 'use strict' — the shipped IRRECO region is eval'd into MODULE scope.
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

// ---- a real sessionStorage (a fake that always misses would prove the opposite of the point) -------
var STORE = {};
global.sessionStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(STORE, k) ? STORE[k] : null; },
  setItem: function (k, v) { STORE[k] = String(v); },
  removeItem: function (k) { delete STORE[k]; }
};

// ---- the sites ------------------------------------------------------------------------------------
var US = { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' };
var EU = { company: 'Kitchen Mama', country: 'EU', marketplace: 'Amazon' };
var APPLIED = { US: { country: 'US', marketplaceId: 'MP-US-AMZ' }, EU: { country: 'EU', marketplaceId: 'MP-EU-AMZ' } };
var CURRENT = US, CURRENT_TAG = 'US';

// ---- the counting transport ------------------------------------------------------------------------
var HTTP = 0, REPAINT = 0, pending = [];
var GAP_NET = 0, GAP_PENDING = [];
function gapRowsFor(scope) {
  return [{ sku: 'CO1150-AG', calculation_status: 'READY', note: null,
    calculation_date: '2026-11-01', calculated_at: '2026-10-18T02:00:00Z',
    d90_gap_qty: (scope.country === 'US') ? 300 : 120,
    d90_suggested_qty: (scope.country === 'US') ? 70 : 25 }];
}
function settleGap(ok) {
  var batch = GAP_PENDING; GAP_PENDING = [];
  batch.forEach(function (rec) {
    rec.resolve(ok === false
      ? { success: false, error: { code: 'READ_FAILED', message: 'boom' } }
      : { success: true, data: { rows: gapRowsFor(rec.scope) },
          envelope: { meta: { gapMaterializationHandlerVersion: 'fm5-r4ui-r5c' } } });
  });
  return new Promise(function (r) { setTimeout(r, 0); });
}
function envelopeFor(scope, n) {
  return {
    success: true,
    data: {
      lines: [{ recommendationLineId: 'L' + n, sku: 'CO1150-AG', destinationType: 'MARKETPLACE',
        destinationKey: scope.country + '|' + scope.marketplace, horizonBasis: { avgSalesPerDay: 10 },
        recommendedQty: (scope.country === 'US') ? 70 : 25 }],
      pagination: null,
      dataVersion: { formulaVersion: 'FV-7', sourceDataAsOf: '2026-10-01T00:00:00Z' }
    },
    meta: {
      requestId: 'REQ-' + scope.country + '-' + n,
      calculationMonth: '2026-11',
      planningCycle: 'RECO-2026-11',
      calculationDate: '2026-10-18',                     // the window anchor the server always stamps
      recommendationWorkspaceHandlerVersion: 'fm5-r4ui-r5e',
      serverDurationMs: 1234,
      canonicalRead: { mode: 'BATCH', remoteCalls: 2, readMs: 900, normalizeMs: 40, afterReadMs: 294 }
    },
    errors: []
  };
}
global.window = {
  IRContext: { toScopeRequest: function () { return CURRENT; } },
  KM_FLAGS: {},
  KM: { DB: { getInventoryReplenishmentGap: function (scopeReq) {
    GAP_NET++;
    var rec = { scope: scopeReq };
    rec.promise = new Promise(function (res) { rec.resolve = res; });
    GAP_PENDING.push(rec);
    return rec.promise;
  } },
    api: { workspaceApiActive: function (w) { return w === 'recommendation'; },
    getWorkspace: function (ws, params, opts) {
    HTTP++;
    var scope = CURRENT, n = HTTP;
    var rec = {};
    rec.promise = new Promise(function (res, rej) { rec.resolve = res; rec.reject = rej; });
    rec.scope = scope; rec.n = n; rec.aborted = false;
    if (opts && opts.signal) { opts.signal.__rec = rec; }
    pending.push(rec);
    return rec.promise;
  } } }
};
var DOMROWS = [];
global.document = { querySelectorAll: function (sel) { return /scroll-row/.test(sel) ? DOMROWS : []; }, getElementById: function () { return null; } };
global.AbortController = function () {
  var self = this;
  this.signal = {};
  this.abort = function () { if (self.signal.__rec) { self.signal.__rec.aborted = true; } };
};

var REPLEN_ITEMS = [];
function escapeReplenHtml(s) { return String(s == null ? '' : s); }
function getReplenishmentData() { return REPLEN_ITEMS; }
function updateReplenRecoContext() { return { ok: true }; }
function _legacyRecSummaryTableHtml() { return ''; }
function _recSummaryRows() { return ''; }
function _irSearchApplied_() { return true; }
function renderReplenishment() {}

eval(F1A.guardPreamble(IRSRC));
eval(IRSRC.slice(IRSRC.indexOf('var IR_AVG_QUALITY_TEXT'), IRSRC.indexOf('function _irScrollRowHtml_')));
eval(IRREGION);
// `_irSuggestedQtyState_` is the Suggested Qty AUTHORITY and lives outside the region. It is
// extracted VERBATIM by name, the way the F1A guards are - a stub would answer for the thing under
// test, which is precisely that one result feeds this cell and the summary.
eval(F1A.sliceFn(IRSRC, '_irSuggestedQtyState_'));

// Wrap the REAL render entry point so a repaint is counted without being replaced.
var _realRerender = _irRecoRerenderSummaries;
_irRecoRerenderSummaries = function () { REPAINT++; return _realRerender.apply(this, arguments); };

// ---- driving the page the way a person drives it ----------------------------------------------------
function gotoSite(tag) {
  CURRENT_TAG = tag; CURRENT = (tag === 'US') ? US : EU;
  _irSearch.applied = APPLIED[tag];           // the F1A guard reads this; both arms must agree
}
function settleAll() {
  var batch = pending; pending = [];
  batch.forEach(function (rec) { if (!rec.aborted) rec.resolve(envelopeFor(rec.scope, rec.n)); });
  return new Promise(function (r) { setTimeout(r, 0); });
}
function counters() { return { http: HTTP, repaint: REPAINT }; }
function reset() { HTTP = 0; REPAINT = 0; }

// A page LEAVE: the route unmounts. The region's own invalidator is what the page calls; the session
// store survives, which is the entire premise of the cache.
function leavePage() { _irRecoInvalidate('CONTEXT_NOT_READY'); }

function main() {
  // ================================================================================================
  section('§A  the harness is real');
  // ================================================================================================
  ok(typeof loadRecommendationWorkspace_ === 'function', 'A1  the shipped loader is the function under test');
  ok(typeof _irRecoCacheGet === 'function' && typeof _irRecoCacheSet === 'function', 'A2  the shipped cache is the cache under test');
  ok(_irRecoRerenderSummaries !== _realRerender, 'A3  the repaint counter wraps the real renderer rather than replacing it');

  gotoSite('US');
  loadRecommendationWorkspace_();
  eq(HTTP, 1, 'A4  a cold scope issues exactly one request');
  ok(pending.length === 1 && pending[0].aborted === false, 'A5  and it is genuinely in flight');

  return settleAll().then(function () {
    ok(_irRecoState.loadedOk === true, 'A6  the response landed through the real apply path');
    ok(!!STORE['km_ir_reco_cache_horizonBasis.v2'], 'A7  and the real session cache stored it');

    // ==============================================================================================
    section('§B  US → EU → US');
    // ==============================================================================================
    reset();
    gotoSite('EU');
    loadRecommendationWorkspace_();
    eq(HTTP, 1, 'B1  switching to a NEW site costs one request');
    return settleAll();
  }).then(function () {
    var before = counters();
    gotoSite('US');
    loadRecommendationWorkspace_();
    eq(HTTP - before.http, 0, 'B2  coming BACK to US costs ZERO requests — the session cache answers');
    ok(REPAINT - before.repaint >= 1, 'B3  and it still repaints, so the operator sees the numbers again');
    eq(_irRecoAnswerSource_().source, 'SESSION_CACHE', 'B4  and the page says so rather than implying a fresh read');

    // ==============================================================================================
    section('§C  leave the page and come back');
    // ==============================================================================================
    reset();
    leavePage();
    eq(HTTP, 0, 'C1  leaving issues nothing');
    loadRecommendationWorkspace_();
    eq(HTTP, 0, 'C2  returning to a site already read costs ZERO requests');
    eq(REPAINT >= 1, true, 'C3  and repaints from the store');

    // ==============================================================================================
    section('§D  re-entry WHILE LOADING, same scope');
    // ==============================================================================================
    reset();
    invalidateRecommendationSessionCache();      // force a cold scope so there is something to race
    leavePage();
    gotoSite('EU');
    loadRecommendationWorkspace_();
    var afterFirst = HTTP;
    loadRecommendationWorkspace_();
    loadRecommendationWorkspace_();
    eq(HTTP - afterFirst, 0, 'D1  two more calls DURING the flight add zero requests — the in-flight dedup holds');
    eq(pending.length, 1, 'D2  and exactly one request is outstanding');
    return settleAll();
  }).then(function () {
    // ==============================================================================================
    section('§E  re-entry WHILE LOADING, scope flipped mid-flight');
    // ==============================================================================================
    reset();
    invalidateRecommendationSessionCache();
    leavePage();
    gotoSite('US');
    loadRecommendationWorkspace_();            // US in flight
    gotoSite('EU');
    loadRecommendationWorkspace_();            // supersedes it
    eq(HTTP, 2, 'E1  a mid-flight site switch costs a SECOND request — the first cannot answer the new site');
    ok(pending.length === 2 && pending[0].aborted === true,
      'E2  and the superseded one is ABORTED rather than left to land on the wrong site');
    gotoSite('US');
    loadRecommendationWorkspace_();            // back again, while EU is still in flight
    eq(HTTP, 3, 'E3  returning to US before anything landed costs a THIRD — nothing was cached to come back to');
    return settleAll();
  }).then(function () {
    // ==============================================================================================
    section('§F  what survives the cache');
    // ==============================================================================================
    reset();
    invalidateRecommendationSessionCache();
    leavePage();
    gotoSite('US');
    loadRecommendationWorkspace_();
    return settleAll();
  }).then(function () {
    var live = _irRecoAnswerSource_();
    eq(live.source, 'SERVER', 'F1  a fresh answer reports SERVER');
    eq(live.calculationDate, '2026-10-18', 'F2  and carries the calculationDate the server stamped');
    eq(live.calculationMonth, '2026-11', 'F3  and the month');
    eq(live.planningCycle, 'RECO-2026-11', 'F4  and the cycle');

    leavePage();
    loadRecommendationWorkspace_();            // restore the very same answer from the cache
    var restored = _irRecoAnswerSource_();
    eq(restored.source, 'SESSION_CACHE', 'F5  the restored answer is marked as cached');
    eq(restored.calculationMonth, '2026-11', 'F6  the month survives the round trip');
    eq(restored.planningCycle, 'RECO-2026-11', 'F7  the cycle survives the round trip');
    eq(restored.calculationDate, '2026-10-18',
      'F8  THE CALCULATION DATE MUST SURVIVE TOO — it is the anchor that says which 90-day window these numbers describe');
    eq(restored.sourceDataAsOf, '2026-10-01T00:00:00Z',
      'F9  and the source revision survives, because a result with no revision cannot be compared to anything');

    // ==============================================================================================
    section('§G  the invalidation contract (CP2X §4)');
    // ==============================================================================================
    var REV = { calculationDate: '2026-10-18', calculationMonth: '2026-11', planningCycle: 'RECO-2026-11',
      formulaVersion: 'FV-7', sourceDataAsOf: '2026-10-01T00:00:00Z' };
    function withField(o, k, v) { var c = JSON.parse(JSON.stringify(o)); c[k] = v; return c; }

    eq(_irRecoRevisionVerdict_(REV, REV), 'SAME', 'G1  two complete, identical revisions are SAME');
    eq(_irRecoRevisionVerdict_(REV, withField(REV, 'planningCycle', 'RECO-2026-12')), 'SUPERSEDED',
      'G2  a different planning cycle is SUPERSEDED — the next cycle must not be answered from this one');
    eq(_irRecoRevisionVerdict_(REV, withField(REV, 'sourceDataAsOf', '2026-10-09T00:00:00Z')), 'SUPERSEDED',
      'G3  a moved source revision is SUPERSEDED');
    eq(_irRecoRevisionVerdict_(REV, withField(REV, 'calculationDate', null)), 'UNKNOWN',
      'G4  one absent field makes the comparison UNKNOWN, not SAME');
    eq(_irRecoRevisionVerdict_(withField(REV, 'formulaVersion', null), withField(REV, 'formulaVersion', null)),
      'UNKNOWN',
      'G5  TWO absent fields are still UNKNOWN — null never equals null, because a missing revision is not evidence of no change');
    eq(_irRecoRevisionVerdict_(withField(REV, 'formulaVersion', null),
      withField(withField(REV, 'formulaVersion', null), 'planningCycle', 'RECO-2026-12')), 'SUPERSEDED',
      'G6  a KNOWN difference outranks an unknown one');
    eq(_irRecoRevisionVerdict_(REV, null), 'UNKNOWN', 'G7  no counterpart at all is UNKNOWN');

    // a record written by a build older than this contract, planted exactly as it would be found
    reset();
    invalidateRecommendationSessionCache();
    leavePage();
    gotoSite('US');
    var legacy = {};
    legacy[['Kitchen Mama', 'US', 'Amazon'].join('||')] = {
      shape: 'horizonBasis.v2', handlerVersion: 'fm5-r4ui-r5e',
      requestScope: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' },
      envelopeData: { lines: [], pagination: null, dataVersion: { formulaVersion: 'FV-7', sourceDataAsOf: '2026-10-01T00:00:00Z' } },
      meta: { requestId: 'OLD', calculationMonth: '2026-10', planningCycle: 'RECO-2026-10', dataVersion: null },
      cachedAt: 1
    };
    STORE['km_ir_reco_cache_horizonBasis.v2'] = JSON.stringify(legacy);
    _irRecoCacheMem = null;                                  // force a reload from the store
    eq(_irRecoCacheGet({ company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' }), null,
      'G8  a pre-contract record — no revision block at all — is NOT served');
    ok(JSON.parse(STORE['km_ir_reco_cache_horizonBasis.v2'])[['Kitchen Mama', 'US', 'Amazon'].join('||')] === undefined,
      'G9  and it is dropped on the way past, so it cannot be reconsidered');
    eq(_irRecoReadDiag_().cache, { outcome: 'MISS', reason: 'REVISION_ABSENT_LEGACY' },
      'G9a and the retirement is NAMED at the moment it happens, not left as an unexplained miss');
    loadRecommendationWorkspace_();
    eq(HTTP, 1, 'G10 dropping it produces a clean MISS and a real request, not a silent blank');
    return settleAll();
  }).then(function () {
    eq(_irRecoAnswerSource_().revisionComplete, true, 'G11 the answer that replaces it can state its own revision');
    // A SERVER that omits calculationDate (the Script Property is not configured) is a real state, and
    // refusing to cache it would disable caching entirely rather than report anything.
    invalidateRecommendationSessionCache();
    _irRecoCacheSet(US, { success: true,
      data: { lines: [], dataVersion: { formulaVersion: 'FV-7', sourceDataAsOf: '2026-10-01T00:00:00Z' } },
      meta: { recommendationWorkspaceHandlerVersion: 'fm5-r4ui-r5e', calculationMonth: '2026-11',
        planningCycle: 'RECO-2026-11' } });                       // no calculationDate
    var partial = _irRecoCacheGet(US);
    ok(partial !== null, 'G11a a record whose SERVER omitted a revision field is still SERVED');
    eq(_irRecoReadDiag_().cache, { outcome: 'HIT', reason: 'SERVED_REVISION_INCOMPLETE' },
      'G11b and the hit says the revision is incomplete instead of implying it is comparable');
    eq(_irRecoRevisionVerdict_(partial.revision, partial.revision), 'UNKNOWN',
      'G11c and it still never compares SAME against itself — an absent field is not evidence of no change');
    invalidateRecommendationSessionCache();
    eq(_irRecoAnswerSource_().revision.calculationDate, '2026-10-18', 'G12 including the window anchor');

    // ==============================================================================================
    section('§H  the cache decision and the three legs are legible (CP2X §2/§3)');
    // ==============================================================================================
    // self-establishing: §H states its own preconditions rather than inheriting the previous section's
    invalidateRecommendationSessionCache();
    _irRecoCacheSet(US, { success: true,
      data: { lines: [], dataVersion: { formulaVersion: 'FV-7', sourceDataAsOf: '2026-10-01T00:00:00Z' } },
      meta: { recommendationWorkspaceHandlerVersion: 'fm5-r4ui-r5e', calculationDate: '2026-10-18',
        calculationMonth: '2026-11', planningCycle: 'RECO-2026-11' } });
    eq(_irRecoReadDiag_().cache, { outcome: 'STORED', reason: null }, 'H1  a stored success says so');
    ok(_irRecoCacheGet(US) !== null, 'H1a and it is retrievable');
    eq(_irRecoReadDiag_().cache, { outcome: 'HIT', reason: null }, 'H2  a complete hit says so, with no caveat');
    invalidateRecommendationSessionCache();
    leavePage();
    _irRecoCacheGet(US);
    eq(_irRecoReadDiag_().cache, { outcome: 'MISS', reason: 'NO_ENTRY' }, 'H3  an empty store is NO_ENTRY, not an unexplained miss');

    // THE SILENT ONE: an answer from a handler this build does not accept is shown and never stored,
    // so every later lookup misses and every site switch pays a full request.
    _irRecoCacheSet(US, { success: true, data: { lines: [], dataVersion: { formulaVersion: 'FV-7', sourceDataAsOf: 'X' } },
      meta: { recommendationWorkspaceHandlerVersion: 'some-other-build', calculationDate: '2026-10-18',
        calculationMonth: '2026-11', planningCycle: 'RECO-2026-11' } });
    eq(_irRecoReadDiag_().cache, { outcome: 'NOT_STORED', reason: 'HANDLER_NOT_ACCEPTED' },
      'H4  and the condition that disables caching ENTIRELY is named rather than inferred from slowness');
    eq(_irRecoCacheGet(US), null, 'H5  nothing was stored, so the next lookup misses');

    var d = _irRecoReadDiag_(), t = d.timing;
    ok(typeof t.responseMs === 'number' && t.responseMs >= 0, 'H6  responseMs was measured', t);
    ok(typeof t.domWorkMs === 'number' && t.domWorkMs >= 0, 'H7  domWorkMs was measured', t);
    ok(/never server time/.test(d.note),
      'H8  and the reading states that responseMs is server AND network, so it is never quoted as server time');
    // CP2X-R1 §C - the server's own numbers are carried rather than dropped.
    eq(d.server.serverDurationMs, 1234, 'H8a serverDurationMs is kept');
    ok(/^REQ-/.test(String(d.server.requestId)), 'H8b and the requestId, so a response can be correlated server-side');
    eq(d.server.canonicalRead && d.server.canonicalRead.mode, 'BATCH',
      'H8b1 and canonicalRead, which is the only thing that says WHICH transport answered');
    eq(d.server.canonicalRead && d.server.canonicalRead.readMs, 900, 'H8b2 with the server read split intact');
    // CP2X-R1 §C - DOM WORK IS NOT A PAINT. There is no rAF in this harness, so visibleMs must stay NULL
    // rather than borrow the synchronous figure; the note has to say which is which.
    // CP2X-R2 §C - renamed. `visibleMs` claimed an observation the page cannot make; the figure is the
    // earliest paint OPPORTUNITY and is now named that. The assertion is the same one: with no frame,
    // there is no figure, and the synchronous number is never promoted into its place.
    eq(t.paintOpportunityMs, null, 'H8c with no animation frame, paintOpportunityMs is NULL rather than the DOM-work number');
    ok(!/visibleMs/.test(JSON.stringify(_irRecoReadDiag_())), 'H8d and nothing in the reading is called "visible"');
    ok(/SYNCHRONOUS DOM WORK ONLY and is NOT a paint/.test(d.note),
      'H8d and the reading refuses to call the DOM write a paint');

    reset();
    invalidateRecommendationSessionCache();
    leavePage();
    gotoSite('US');
    _irRecoMarkSearch_();                       // the Search leg gets its start, as the page does at apply
    loadRecommendationWorkspace_();
    var t2 = _irRecoReadDiag_().timing;
    ok(typeof t2.searchToDispatchMs === 'number' && t2.searchToDispatchMs >= 0,
      'H9  searchToDispatchMs is measured from the applied Search, which is page work only', t2);
    return settleAll();
  }).then(function () {
    // ==============================================================================================
    section('§I  Suggested Qty across sites — reused, never borrowed');
    // ==============================================================================================
    var ITEM = { sku: 'CO1150-AG' };
    eq(_irAggregateActionableRecommendedQty(_irRecoLinesForSku(ITEM)), { total: 70, actionableCount: 1 },
      'I1  on US the Suggested Qty authority answers with the US number');

    gotoSite('EU');
    loadRecommendationWorkspace_();
    return settleAll().then(function () {
      eq(_irAggregateActionableRecommendedQty(_irRecoLinesForSku(ITEM)), { total: 25, actionableCount: 1 },
        'I2  on EU it answers with the EU number');
      var before = HTTP;
      gotoSite('US');
      loadRecommendationWorkspace_();
      eq(HTTP - before, 0, 'I3  returning to US REUSES the stored answer — zero requests');
      eq(_irAggregateActionableRecommendedQty(_irRecoLinesForSku(ITEM)), { total: 70, actionableCount: 1 },
        'I4  and the number is the US one again, restored rather than recomputed');

      // the half that matters more: a result from another site is never borrowed
      _irSearch.applied = APPLIED.EU;            // the page now renders EU; the loaded state is US
      eq(_irRecoLinesForSku(ITEM), null,
        'I5  with EU applied, the US result yields NULL — PENDING, never EU rendered with US numbers');
      _irSearch.applied = APPLIED.US;
    });
  }).then(function () {
    // ==============================================================================================
    section('§K  the materialized Gap read (CP2X-R1 A)');
    // ==============================================================================================
    var ITEM2 = { sku: 'CO1150-AG' };
    GAP_NET = 0;
    gotoSite('US');
    loadInventoryGap_();
    eq(GAP_NET, 1, 'K1  a cold scope issues exactly one gap read');
    loadInventoryGap_();
    loadInventoryGap_();
    eq(GAP_NET, 1, 'K2  two more calls DURING the flight add none - the in-flight dedup CP2X-R1 added');
    eq(_irMatReadDiag_().outcome, 'DEDUPED', 'K2a and the second call says why it did not read');
    return settleGap().then(function () {
      eq(_irMatState.status, 'READY', 'K3  the answer landed');
      eq(_irSuggestedQtyState_(ITEM2), { state: 'READY', value: 70 },
        'K4  Suggested Qty reads the US number from it');

      gotoSite('EU');
      loadInventoryGap_();
      eq(GAP_NET, 2, 'K5  a new site costs one read');
      return settleGap();
    }).then(function () {
      eq(_irSuggestedQtyState_(ITEM2), { state: 'READY', value: 25 }, 'K6  and EU shows the EU number');
      var before = GAP_NET;
      gotoSite('US');
      loadInventoryGap_();
      eq(GAP_NET - before, 0, 'K7  returning to US REUSES the stored gap result - zero reads');
      eq(_irMatReadDiag_().outcome, 'REUSE', 'K7a and says so');
      eq(_irSuggestedQtyState_(ITEM2), { state: 'READY', value: 70 },
        'K8  and the SAME result drives Suggested Qty again');
      // THE SECOND CONSUMER, rendered from the SAME restored state and counted: the summary body asks
      // _irMatState for the row, so if reuse were not real this would have to issue its own read.
      var netBeforeSummary = GAP_NET;
      var summaryHtml = _irMatOutlookBody({ sku: 'CO1150-AG' }) || '';
      ok(/replen-horizon-summary/.test(summaryHtml),
        'K9  the Recommendation Summary renders the outlook table from that same result');
      ok(/replen-recsum-ws--ready/.test(summaryHtml),
        'K9a in its READY state, so it is reading the restored rows rather than an empty shell');
      eq(GAP_NET - netBeforeSummary, 0, 'K9b and rendering it issued no read of its own');

      _irSearch.applied = APPLIED.EU;
      eq(_irSuggestedQtyState_(ITEM2), { state: 'PENDING', value: null },
        'K10 with EU applied, the restored US result is PENDING - never EU showing a US number');
      _irSearch.applied = APPLIED.US;

      var probe = _irMatAnswerSource_('CO1150-AG');
      ok(typeof probe.applied_at === 'number' && /NOT A REVISION/.test(probe.applied_at_note),
        'K11 appliedAt is reported as a local clock reading, never as source freshness');
      eq(probe.source_revision.handlerVersion, 'fm5-r4ui-r5c', 'K12 the SOURCE revision carries the 43_ marker');
      eq(probe.source_revision.calculationDate, '2026-11-01', 'K12a the calculation date');
      eq(probe.source_revision.calculatedAt, '2026-10-18T02:00:00Z', 'K12b and the newest calculated_at');
      eq(probe.source_revision_complete, true, 'K13 and it is complete');
      eq(probe.from_reuse, true, 'K13a and the answer says it came from reuse rather than a read');

      var R = probe.source_revision;
      eq(_irMatRevisionVerdict_(R, R), 'SAME', 'K14 two complete identical source revisions are SAME');
      eq(_irMatRevisionVerdict_(R, { handlerVersion: 'fm5-r4ui-r5c', calculationDate: '2026-11-01', calculatedAt: null }),
        'UNKNOWN', 'K15 an absent calculated_at makes it UNKNOWN, never SAME');
      eq(_irMatRevisionVerdict_({ handlerVersion: null, calculationDate: null, calculatedAt: null },
        { handlerVersion: null, calculationDate: null, calculatedAt: null }), 'UNKNOWN',
        'K16 and two unknown revisions are still UNKNOWN - absence is not evidence the source held still');

      var beforeErr = GAP_NET;
      loadInventoryGap_(true);
      eq(GAP_NET - beforeErr, 1, 'K17 a forced refresh really reads');
      return settleGap(false);
    }).then(function () {
      eq(_irMatState.status, 'READ_ERROR', 'K18 the failure is surfaced');
      eq(_irSuggestedQtyState_(ITEM2).reason, 'READ_FAILED', 'K19 and reaches the cell as a named failure');
      var beforeRetry = GAP_NET;
      loadInventoryGap_();
      eq(GAP_NET - beforeRetry, 1, 'K20 the next call READS again - a failure was never stored for reuse');
      return settleGap();
    }).then(function () {
      GAP_PENDING = [];
      _irMatByScope = {};
      _irMatState = { status: 'IDLE', scopeKey: null, appliedScopeKey: null, bySku: {}, rows: [], loadedOk: false, error: null };
      var beforeEmpty = GAP_NET;
      loadInventoryGap_();
      eq(GAP_NET - beforeEmpty, 1, 'K21 a cold scope reads');
      var batch = GAP_PENDING; GAP_PENDING = [];
      batch.forEach(function (rec) { rec.resolve({ success: true, data: { rows: [] },
        envelope: { meta: { gapMaterializationHandlerVersion: 'fm5-r4ui-r5c' } } }); });
      return new Promise(function (r) { setTimeout(r, 0); });
    }).then(function () {
      eq(_irMatState.status, 'EMPTY', 'K22 an answer over zero rows is EMPTY, not an error');
      eq(_irSuggestedQtyState_({ sku: 'CO1150-AG' }).reason, 'READ_EMPTY',
        'K23 and the cell says the scope resolved with no rows');
      var beforeReuse = GAP_NET;
      _irMatState = { status: 'IDLE', scopeKey: null, appliedScopeKey: null, bySku: {}, rows: [], loadedOk: false, error: null };
      loadInventoryGap_();
      eq(GAP_NET - beforeReuse, 0, 'K24 and EMPTY is REUSED - a resolved-with-no-rows answer is still an answer');
      eq(_irMatState.status, 'EMPTY', 'K24a restored as EMPTY, not as a fresh unknown');

      // ==============================================================================================
      section('§L  the per-SKU row-object conversion, shared within one request (CP2X-R1 D)');
      // ==============================================================================================
      var GS42 = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs'), 'utf8').split('\r\n').join('\n');
      function sliceGs(name) {
        var a = GS42.indexOf('function ' + name + '(');
        var b = GS42.indexOf('\n}\n', a);
        return GS42.slice(a, b + 3);
      }
      var gsBox = {};
      new Function('x', [sliceGs('recoWsIsObj_'), sliceGs('recoWsStr_'), sliceGs('recoWsToRowObjects_')].join('\n')
        + '\nx.conv = recoWsToRowObjects_;')(gsBox);
      var conv = gsBox.conv;

      var snapA = { headers: ['sku', 'units'], rows: [['A', 1], ['B', 2]] };
      var expected = [{ sku: 'A', units: 1 }, { sku: 'B', units: 2 }];
      eq(conv(snapA), expected, 'L1  the conversion is unchanged in VALUE');
      var first = conv(snapA), second = conv(snapA);
      eq(second, expected, 'L2  and a repeated call returns the same value');

      // THE MEMO WAS WITHDRAWN, AND THIS ASSERTION IS THE REASON RECORDED IN PLACE.
      //
      // CP2X-R1 memoised the conversion on the snapshot object: one hunk, no call-site changes, and
      // offline it cut 240 conversions of a 5,400-row table from 963 ms to 6.8 ms. It also broke an
      // existing contract. `recoWsRows_` caches PER REQUEST, and
      // api-recommendation-reuse-map-f1-7m-e-r1 builds a second `read` over the SAME snapshots object
      // and asserts the two do not share. Memoising on the snapshot made them share, so the isolation
      // that guard exists to hold stopped holding. Relaxing the guard to fit the optimisation would have
      // been the wrong repair, so the optimisation went instead.
      ok(first !== second,
        'L3  each call rebuilds - the per-request isolation guard in F1-7M-E-R1 still holds');

      var snapB = { headers: ['sku', 'units'], rows: [['C', 9]] };
      eq(conv(snapB), [{ sku: 'C', units: 9 }], 'L4  a different snapshot converts on its own');
      ok(conv(snapB) !== first, 'L5  and never borrows another table result');

      // the malformed guard still answers [] and stores nothing
      eq(conv(null), [], 'L7  a missing snapshot is still []');
      eq(conv({ headers: 'nope', rows: [] }), [], 'L8  and a malformed one too');

      // CP2X-R2 D - AND THIS IS THE ASSERTION DOING ITS JOB. CP2X-R1 wrote L11 to say the three
      // per-SKU helpers STILL bypassed the per-request cache, specifically so the finding could not
      // quietly lapse and so a repair could not land without the record being updated. The repair has
      // landed; the record is updated here rather than deleted. The withdrawn memo is still withdrawn -
      // L3 above still holds - because the fix is the other one: the helpers take `read` and go through
      // `recoWsRows_`, which caches PER REQUEST and therefore keeps the isolation the memo broke.
      var perSkuFns = ['recoWsResolvePlanningModel_', 'recoWsBuildContaminationFacts_', 'recoWsResolveSalesRate_'];
      var stillBypassing = perSkuFns.filter(function (fn) { return /recoWsToRowObjects_\(snaps\./.test(sliceGs(fn)); });
      eq(stillBypassing.length, 0,
        'L11 NONE of the three per-SKU helpers converts from `snaps` any more', stillBypassing);
      var viaCache = perSkuFns.filter(function (fn) { return /recoWsRows_\(read, '/.test(sliceGs(fn)); });
      eq(viaCache.length, 3, 'L11a all three reach the per-request cache instead', viaCache);
      ok(/function recoWsRows_\(read, key\)/.test(GS42),
        'L12 and that cache still takes `read`, so it is still per REQUEST and not per snapshot');
      // The prohibition, from the source: the memo may live on `read` and nowhere else.
      ok(/read\.__rowCache/.test(GS42) && !/snap\.__ro|snaps\.__ro/.test(GS42),
        'L12a the memo is on `read.__rowCache` - never on a snapshot, a module global or a shared object');

      // THE SAFETY CLAIM, checked rather than asserted: the three .sort() sites in 42_ sort a FILTERED
      // copy, never the shared array. A sort of the shared array would persist an order to later callers.
      var sortsOnShared = /recoWsToRowObjects_\([^)]*\)\s*\.(sort|reverse|splice|push|pop|shift|unshift)/.test(GS42);
      ok(!sortsOnShared, 'L9  no caller mutates a converted array in place');
      var sortLines = GS42.split('\n').filter(function (l) { return /\.sort\(/.test(l); });
      ok(sortLines.length >= 3, 'L10 there ARE sorts in the file, so L9 is not vacuous');
      // ==============================================================================================
      section('§X  mutants');
    // ==============================================================================================
    function mutant(id, what, fn) { ok(fn(), 'X  MUTANT CAUGHT — ' + id + ' ' + what); }
    mutant('X1', 'the harness counts a cache restore as an HTTP call', function () {
      var h = HTTP; leavePage(); loadRecommendationWorkspace_(); return HTTP === h;
    });
    mutant('X2', 'the transport is synchronous, so "in flight" would never be exercised', function () {
      var h = HTTP; invalidateRecommendationSessionCache(); leavePage(); loadRecommendationWorkspace_();
      var wasPending = pending.length === 1 && HTTP === h + 1;
      pending.forEach(function (r) { r.aborted = true; }); pending = [];
      return wasPending;
    });
    mutant('X8', 'the gap in-flight dedup is removed and re-entry during a flight reads twice', function () {
      GAP_PENDING = []; _irMatByScope = {};
      _irMatState = { status: 'IDLE', scopeKey: null, appliedScopeKey: null, bySku: {}, rows: [], loadedOk: false, error: null };
      var n = GAP_NET;
      loadInventoryGap_(); loadInventoryGap_();
      var deduped = (GAP_NET - n) === 1;
      GAP_PENDING = [];
      return deduped;
    });
    mutant('X10', 'a failed gap read is stored and replayed as an answer', function () {
      return !Object.keys(_irMatByScope).some(function (k) { return _irMatByScope[k].status === 'READ_ERROR'; });
    });
    mutant('X6', 'the cache stops naming WHY it missed and every miss looks alike', function () {
      invalidateRecommendationSessionCache(); _irRecoCacheGet(US);
      var a = _irRecoReadDiag_().cache.reason;
      _irRecoCacheSet(US, { success: false });
      return a === 'NO_ENTRY' && _irRecoReadDiag_().cache.reason === 'NOT_A_SUCCESS';
    });
    mutant('X7', 'Suggested Qty borrows the other site number instead of reporting PENDING', function () {
      _irSearch.applied = APPLIED.EU;
      var borrowed = _irRecoLinesForSku({ sku: 'CO1150-AG' });
      _irSearch.applied = APPLIED[CURRENT_TAG];
      return borrowed === null;
    });
    mutant('X4', 'a missing revision is read as "unchanged" and two nulls compare SAME', function () {
      var blank = { calculationDate: null, calculationMonth: null, planningCycle: null, formulaVersion: null, sourceDataAsOf: null };
      return _irRecoRevisionVerdict_(blank, blank) !== 'SAME';
    });
    mutant('X5', 'an incomplete record is served with a caveat instead of being dropped', function () {
      return _irRecoRevisionComplete_({ calculationDate: '2026-10-18', calculationMonth: '2026-11',
        planningCycle: 'RECO-2026-11', formulaVersion: 'FV-7', sourceDataAsOf: null }) === false;
    });
    mutant('X3', 'the F1A scope guard is stubbed true and stops discriminating sites', function () {
      _irSearch.applied = APPLIED.EU;
      var mismatched = _irResultMatchesAppliedScope_({ appliedScopeKey: 'us|MP-US-AMZ' });
      _irSearch.applied = APPLIED[CURRENT_TAG];
      return mismatched === false;
    });

    console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
    if (failed > 0) process.exitCode = 1;
    });
  });
}

main().catch(function (e) {
  console.log('FAIL  harness threw: ' + (e && e.stack || e));
  process.exitCode = 1;
});
