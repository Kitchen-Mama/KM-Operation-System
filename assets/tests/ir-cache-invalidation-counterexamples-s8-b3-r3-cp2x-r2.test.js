// Kitchen Mama Operation System — S8-B3-R3-CP2X-R2 §A/§C
// THE TWO COUNTER-EXAMPLES THE REUSE CANDIDATE FAILS, AND THE DIAGNOSTIC THAT IS NOT BOUND TO ITS REQUEST.
//
// Run: node assets/tests/ir-cache-invalidation-counterexamples-s8-b3-r3-cp2x-r2.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes, no browser, no production recalculation.
//
// WHY THIS SUITE EXISTS SEPARATELY FROM THE CP2X SUITE. CP2X-R1 added per-scope reuse and in-flight
// dedup to the materialized gap read and proved both. Neither proof says anything about what happens
// when a reuse hit and an UNFINISHED request for another scope exist at the same moment, nor about what
// a completed recalculation does to answers already held for scopes other than the one on screen. Those
// are the two cases this round names, and each is written here as a FAILING case first: the assertions
// below were run against the unmodified page and the three marked A1*/A2* groups failed. A repair whose
// counter-example was written afterwards proves only that the repair is self-consistent.
//
// §A1  US cached, EU in flight, operator returns to US.
//      The reuse branch returns BEFORE `++_irMatSeq`, so the EU request is still the current sequence.
//      When it lands it passes `my !== _irMatSeq` and overwrites `_irMatState` — the US answer the
//      operator is looking at is replaced by EU's, or by EU's FAILURE. Reuse that does not invalidate
//      the request it supersedes is not reuse; it is a race with a cache in front of it.
//
// §A2  A gap recalculation finishes.
//      `refreshInventoryGapAfterRecalc_` clears `_irMatState` and force-reads the CURRENT scope. It does
//      not touch `_irMatByScope`, which CP2X-R1 introduced — so every OTHER scope keeps its pre-recalc
//      answer and hands it back on the next visit, with no read and no indication. The job just rewrote
//      those rows. This is a defect CP2X-R1 created: before the per-scope map there was nothing to go
//      stale, which is exactly why a cache needs its invalidation written in the same round.
//
// §C   The two-frame callback writes `_IR_RECO_DIAG_.timing` with no binding to the request that
//      scheduled it, so a superseded scope's frames are attributed to the scope now on screen.
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
var GS42 = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs'), 'utf8');
var F1A = require('./_f1a-scope-guard.js');
var IRREGION = IRSRC.slice(IRSRC.indexOf('// __IRRECO_START__'), IRSRC.indexOf('// __IRRECO_END__'));

// ---- a real sessionStorage ------------------------------------------------------------------------
var STORE = {};
global.sessionStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(STORE, k) ? STORE[k] : null; },
  setItem: function (k, v) { STORE[k] = String(v); },
  removeItem: function (k) { delete STORE[k]; }
};

// ---- three sites, so CURRENT_COUNTRY is a different question from CURRENT_SCOPE --------------------
var SITES = {
  US_AMZ: { scope: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' },
            applied: { country: 'US', marketplaceId: 'MP-US-AMZ' }, qty: 70, gap: 300 },
  US_WMT: { scope: { company: 'Kitchen Mama', country: 'US', marketplace: 'Walmart' },
            applied: { country: 'US', marketplaceId: 'MP-US-WMT' }, qty: 44, gap: 180 },
  EU_AMZ: { scope: { company: 'Kitchen Mama', country: 'EU', marketplace: 'Amazon' },
            applied: { country: 'EU', marketplaceId: 'MP-EU-AMZ' }, qty: 25, gap: 120 }
};
var CURRENT = SITES.US_AMZ;

// ---- the counting transports -----------------------------------------------------------------------
var GAP_NET = 0, GAP_PENDING = [];
var HTTP = 0, RECO_PENDING = [];
function siteOfScope(scope) {
  var k = Object.keys(SITES).filter(function (n) {
    return SITES[n].scope.country === scope.country && SITES[n].scope.marketplace === scope.marketplace; })[0];
  return SITES[k];
}
function gapRowsFor(scope) {
  var s = siteOfScope(scope);
  return [{ sku: 'CO1150-AG', calculation_status: 'READY', note: null,
    calculation_date: '2026-11-01', calculated_at: '2026-10-18T02:00:00Z',
    d90_gap_qty: s.gap, d90_suggested_qty: s.qty }];
}
/** Settle ONLY the in-flight gap reads whose scope matches `pick` (a site, or null for all). */
function settleGapWhere(pick, okFlag) {
  var keep = [], batch = [];
  GAP_PENDING.forEach(function (rec) {
    if (!pick || (rec.scope.country === pick.scope.country && rec.scope.marketplace === pick.scope.marketplace)) batch.push(rec);
    else keep.push(rec);
  });
  GAP_PENDING = keep;
  batch.forEach(function (rec) {
    rec.resolve(okFlag === false
      ? { success: false, error: { code: 'READ_FAILED', message: 'boom' } }
      : { success: true, data: { rows: gapRowsFor(rec.scope) },
          envelope: { meta: { gapMaterializationHandlerVersion: 'fm5-r4ui-r5c' } } });
  });
  return new Promise(function (r) { setTimeout(r, 0); });
}
function envelopeFor(scope, n) {
  return { success: true,
    data: { lines: [{ recommendationLineId: 'L' + n, sku: 'CO1150-AG', destinationType: 'MARKETPLACE',
      destinationKey: scope.country + '|' + scope.marketplace, horizonBasis: { avgSalesPerDay: 10 },
      recommendedQty: siteOfScope(scope).qty }],
      pagination: null, dataVersion: { formulaVersion: 'FV-7', sourceDataAsOf: '2026-10-01T00:00:00Z' } },
    meta: { requestId: 'REQ-' + scope.country + '-' + scope.marketplace + '-' + n,
      calculationMonth: '2026-11', planningCycle: 'RECO-2026-11', calculationDate: '2026-10-18',
      recommendationWorkspaceHandlerVersion: 'fm5-r4ui-r5e', serverDurationMs: 1234,
      canonicalRead: { mode: 'BATCH', remoteCalls: 2, readMs: 900, normalizeMs: 40, afterReadMs: 294 } },
    errors: [] };
}
function settleReco() {
  var batch = RECO_PENDING; RECO_PENDING = [];
  batch.forEach(function (rec) { if (!rec.aborted) rec.resolve(envelopeFor(rec.scope, rec.n)); });
  return new Promise(function (r) { setTimeout(r, 0); });
}

// ---- an animation-frame queue the harness FIRES, so "two frames later" is a controllable moment ----
var RAF_Q = [];
global.requestAnimationFrame = function (fn) { RAF_Q.push(fn); return RAF_Q.length; };
function fireFrames(n) {
  for (var i = 0; i < (n || 1); i++) { var q = RAF_Q; RAF_Q = []; q.forEach(function (fn) { fn(); }); }
}

global.window = {
  IRContext: { toScopeRequest: function () { return CURRENT.scope; } },
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
        var rec = { scope: CURRENT.scope, n: HTTP, aborted: false };
        rec.promise = new Promise(function (res, rej) { rec.resolve = res; rec.reject = rej; });
        if (opts && opts.signal) { opts.signal.__rec = rec; }
        RECO_PENDING.push(rec);
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
eval(F1A.sliceFn(IRSRC, '_irSuggestedQtyState_'));

// ---- driving the page ------------------------------------------------------------------------------
function gotoSite(name) { CURRENT = SITES[name]; _irSearch.applied = SITES[name].applied; }
function coldStart() {
  GAP_NET = 0; HTTP = 0; GAP_PENDING = []; RECO_PENDING = []; RAF_Q = [];
  // the recommendation session cache survives a page load by design, so a scenario that wants a REAL
  // request has to clear it - otherwise the second visit to a site is served from the store and no
  // response path, and therefore no animation frame, ever runs.
  STORE = {}; _irRecoCacheMem = null;
  _irMatByScope = {};
  _irMatState = { status: 'IDLE', scopeKey: null, appliedScopeKey: null, bySku: {}, rows: [], loadedOk: false, error: null };
}
function scopeKeyOf(name) { return JSON.stringify(SITES[name].scope); }
function heldScopes() { return Object.keys(_irMatByScope).sort(); }
/** Which of the three sites currently have a stored answer, by NAME, so a failure reads plainly. */
function heldNames() {
  return Object.keys(SITES).filter(function (n) {
    return Object.prototype.hasOwnProperty.call(_irMatByScope, scopeKeyOf(n)); }).sort();
}
var ITEM = { sku: 'CO1150-AG' };

function main() {
  // ==================================================================================================
  section('§0  the harness drives the shipped code, not a model of it');
  // ==================================================================================================
  ok(typeof loadInventoryGap_ === 'function', '01  the real gap loader is in scope');
  ok(typeof refreshInventoryGapAfterRecalc_ === 'function', '02  and the real post-recalc refresh');
  ok(typeof _irMatByScope === 'object' && _irMatByScope, '03  and the per-scope map CP2X-R1 added');
  ok(/function loadInventoryGap_/.test(IRREGION) && /_irMatByScope/.test(IRREGION),
    '04  both come from the shipped region rather than from this file');

  coldStart();
  gotoSite('US_AMZ');
  loadInventoryGap_();
  eq(GAP_NET, 1, '05  a cold scope reads once');

  return settleGapWhere(SITES.US_AMZ).then(function () {
    eq(_irSuggestedQtyState_(ITEM), { state: 'READY', value: 70 }, '06  and the US answer is on screen');

    // ================================================================================================
    section('§A1 a reuse hit must invalidate the request it supersedes');
    // ================================================================================================
    // US is held. Start EU and leave it in flight — this is the operator who switches site and then
    // changes their mind before the second site has answered.
    gotoSite('EU_AMZ');
    loadInventoryGap_();
    eq(GAP_NET, 2, 'A1a the EU read was issued');
    eq(GAP_PENDING.length, 1, 'A1b and is genuinely still in flight, not resolved synchronously');

    // Back to US. The stored US answer is reused — zero reads — and this is the moment the EU request
    // stops being wanted.
    gotoSite('US_AMZ');
    loadInventoryGap_();
    eq(GAP_NET, 2, 'A1c returning to US costs no read — the stored answer is reused');
    eq(_irMatReadDiag_().outcome, 'REUSE', 'A1d and the page says it reused rather than read');
    eq(_irMatState.appliedScopeKey, 'us|MP-US-AMZ', 'A1e the state is stamped US');

    // NOW the EU response lands. SUCCESS first.
    return settleGapWhere(SITES.EU_AMZ).then(function () {
      eq(_irMatState.appliedScopeKey, 'us|MP-US-AMZ',
        'A1f  COUNTER-EXAMPLE: a late EU SUCCESS must not restamp the state to EU');
      eq(_irMatState.scopeKey, scopeKeyOf('US_AMZ'),
        'A1g  nor move the scope key off the site the operator is looking at');
      eq(_irSuggestedQtyState_(ITEM), { state: 'READY', value: 70 },
        'A1h  and Suggested Qty still shows the US number, never EU 25 under a US heading');
      eq(heldNames(), ['US_AMZ'],
        'A1i  the superseded response is DISCARDED, not banked — an answer nobody is waiting for is not evidence');
    });
  }).then(function () {
    // The same race, ending in a FAILURE. This is the worse half: an error for a site nobody is on
    // would wipe a good answer off the screen and name no site at all.
    coldStart();
    gotoSite('US_AMZ');
    loadInventoryGap_();
    return settleGapWhere(SITES.US_AMZ);
  }).then(function () {
    gotoSite('EU_AMZ');
    loadInventoryGap_();
    gotoSite('US_AMZ');
    loadInventoryGap_();
    eq(_irMatReadDiag_().outcome, 'REUSE', 'A1j the reuse hit again, with EU still in flight');
    return settleGapWhere(SITES.EU_AMZ, false);
  }).then(function () {
    eq(_irMatState.status, 'READY',
      'A1k  COUNTER-EXAMPLE: a late EU FAILURE must not turn the displayed US answer into READ_ERROR');
    eq(_irSuggestedQtyState_(ITEM), { state: 'READY', value: 70 },
      'A1l  the US number survives a failure that belongs to another site');
    eq(heldNames(), ['US_AMZ'],
      'A1m  and the failure does not delete the US entry either — it was never about US');

    // The invalidation must be SURGICAL: a flight for the scope being reused is the same request, and
    // killing it would turn the dedup CP2X-R1 added back into a duplicate read.
    coldStart();
    gotoSite('US_AMZ');
    loadInventoryGap_();
    loadInventoryGap_();
    loadInventoryGap_();
    eq(GAP_NET, 1, 'A1n three calls for ONE scope still make one read — the dedup is not collateral damage');
    return settleGapWhere(SITES.US_AMZ);
  }).then(function () {
    eq(_irMatState.status, 'READY', 'A1o and that one read still lands normally');

    // ================================================================================================
    section('§A2 a finished recalculation invalidates the answers it rewrote');
    // ================================================================================================
    // Fill all three sites, then come back to the first. Every entry predates the job.
    coldStart();
    var chain = Promise.resolve();
    ['US_AMZ', 'US_WMT', 'EU_AMZ'].forEach(function (n) {
      chain = chain.then(function () { gotoSite(n); loadInventoryGap_(); return settleGapWhere(SITES[n]); });
    });
    return chain;
  }).then(function () {
    gotoSite('US_AMZ');
    eq(heldNames(), ['EU_AMZ', 'US_AMZ', 'US_WMT'], 'A2a three scopes are held before the job completes');

    // ---- ALL_SITES: the job rewrote every row there is. Nothing may survive. ----------------------
    var before = GAP_NET;
    refreshInventoryGapAfterRecalc_({ mode: 'ALL_SITES' });
    eq(heldNames(), [],
      'A2b  COUNTER-EXAMPLE: after an ALL_SITES recalculation, no pre-recalc answer is still held');
    eq(GAP_NET - before, 1,
      'A2c  and exactly ONE read is issued — the current site only, not a refetch of all three');
    return settleGapWhere(SITES.US_AMZ);
  }).then(function () {
    eq(heldNames(), ['US_AMZ'], 'A2d the current site is re-read and re-held; the others stay absent');
    eq(_irMatState.status, 'READY', 'A2e and the operator sees a post-recalc answer');

    // ---- CURRENT_SCOPE: only the one site was recalculated. The others are still valid. -----------
    var chain = Promise.resolve();
    ['US_WMT', 'EU_AMZ'].forEach(function (n) {
      chain = chain.then(function () { gotoSite(n); loadInventoryGap_(); return settleGapWhere(SITES[n]); });
    });
    return chain;
  }).then(function () {
    gotoSite('US_AMZ');
    eq(heldNames(), ['EU_AMZ', 'US_AMZ', 'US_WMT'], 'A2f all three held again');
    refreshInventoryGapAfterRecalc_({ mode: 'CURRENT_SCOPE', company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' });
    eq(heldNames(), ['EU_AMZ', 'US_WMT'],
      'A2g  a CURRENT_SCOPE recalculation drops ONLY that scope — over-clearing would cost reads nothing asked for');
    return settleGapWhere(SITES.US_AMZ);
  }).then(function () {
    // ---- CURRENT_COUNTRY: every marketplace in that country, and no other country. ----------------
    eq(heldNames(), ['EU_AMZ', 'US_AMZ', 'US_WMT'], 'A2h held again after the re-read');
    gotoSite('US_AMZ');
    refreshInventoryGapAfterRecalc_({ mode: 'CURRENT_COUNTRY', company: 'Kitchen Mama', country: 'US' });
    eq(heldNames(), ['EU_AMZ'],
      'A2i  a CURRENT_COUNTRY recalculation drops BOTH US marketplaces and leaves EU alone');
    return settleGapWhere(SITES.US_AMZ);
  }).then(function () {
    // ---- UNKNOWN SCOPE: the resumed-job and retry call sites pass nothing. Clear everything. ------
    gotoSite('US_AMZ');
    eq(heldNames().length, 2, 'A2j two scopes held going in');
    var before = GAP_NET;
    refreshInventoryGapAfterRecalc_();
    eq(heldNames(), [],
      'A2k  an UNKNOWN recalculation scope clears everything — conservative, because the alternative is serving rows the job replaced');
    eq(GAP_NET - before, 1, 'A2l  and still reads only the current site');
    return settleGapWhere(SITES.US_AMZ);
  }).then(function () {
    // ---- a response ALREADY IN FLIGHT when the job finished was computed from the OLD rows --------
    coldStart();
    gotoSite('EU_AMZ');
    loadInventoryGap_();
    eq(GAP_PENDING.length, 1, 'A2m a pre-recalc EU read is in flight');
    gotoSite('US_AMZ');
    refreshInventoryGapAfterRecalc_({ mode: 'ALL_SITES' });
    return settleGapWhere(SITES.EU_AMZ);
  }).then(function () {
    ok(heldNames().indexOf('EU_AMZ') === -1,
      'A2n  COUNTER-EXAMPLE: a response in flight across the recalculation must not refill the cache it just invalidated',
      heldNames());
    return settleGapWhere(SITES.US_AMZ);
  }).then(function () {
    // The same race through the path that returns EARLY: no scope is selected, so the refresh cannot
    // issue a read and therefore never reached the sequence bump that was doing the work by accident.
    coldStart();
    gotoSite('EU_AMZ');
    loadInventoryGap_();
    var saved = window.IRContext.toScopeRequest;
    window.IRContext.toScopeRequest = function () { return null; };
    refreshInventoryGapAfterRecalc_({ mode: 'ALL_SITES' });
    window.IRContext.toScopeRequest = saved;
    gotoSite('EU_AMZ');
    return settleGapWhere(SITES.EU_AMZ).then(function () {
      ok(heldNames().indexOf('EU_AMZ') === -1,
        'A2o  COUNTER-EXAMPLE: and still not, when the refresh had no scope to read and returned early',
        heldNames());
    });
  }).then(function () {
    // ---- WHICH caches are affected, decided from the source rather than from caution --------------
    // A gap recalculation rewrites inventory_replenishment_gap. 42_, which answers
    // recommendation.workspace.get and feeds the session cache, does not read that table at all — its
    // numbers are computed from the canonical tables the job did not touch. So the recommendation
    // session cache is NOT an affected cache, and clearing it would throw away a correct answer and buy
    // a request. This asserts the premise, so the day 42_ starts reading the gap table this fails.
    ok(!/inventory_replenishment_gap/.test(GS42),
      'A2p  42_ does not read inventory_replenishment_gap, so the recommendation session cache is not affected by a gap recalc');
    ok(/INV_GAP_TABLE_/.test(fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/43_api_v1_gap_materialization.gs'), 'utf8')),
      'A2q  while 43_, which the job runs, is the module that owns that table — so the premise is not vacuous');

    // ================================================================================================
    section('§C  a delayed callback belongs to the request that scheduled it');
    // ================================================================================================
    coldStart();
    gotoSite('US_AMZ');
    _irRecoMarkSearch_();
    loadRecommendationWorkspace_();
    eq(HTTP, 1, 'C1  one recommendation request is in flight');
    return settleReco();
  }).then(function () {
    var t = _irRecoReadDiag_().timing;
    ok(typeof t.domWorkMs === 'number', 'C2  the synchronous DOM work is measured');
    eq(t.paintOpportunityMs, null,
      'C3  and before any frame has run there is no paint figure at all — scheduling is not painting');

    // The operator switches site while the frames from the first response are still queued. Those
    // frames were scheduled by a request that is no longer the one on screen.
    gotoSite('EU_AMZ');
    _irRecoMarkSearch_();
    loadRecommendationWorkspace_();
    fireFrames(2);
    eq(_irRecoReadDiag_().timing.paintOpportunityMs, null,
      'C4  COUNTER-EXAMPLE: the superseded request\'s frames write NOTHING into the current reading');
    eq(_irRecoReadDiag_().timing.domWorkMs, null,
      'C5  and the current reading is still waiting for its own response rather than carrying the last one\'s');
    return settleReco();
  }).then(function () {
    fireFrames(2);
    var d = _irRecoReadDiag_();
    ok(typeof d.timing.paintOpportunityMs === 'number',
      'C6  the request that IS on screen records its own figure once its frames run', d.timing);
    ok(d.timing.paintOpportunityMs >= d.timing.domWorkMs,
      'C7  and it is never earlier than the DOM work it follows', d.timing);

    // The name and the note are part of the contract: two frames is the earliest OPPORTUNITY to paint,
    // which is an upper bound on the browser's scheduling, not an observation that anything was shown.
    ok(!/visibleMs/.test(JSON.stringify(d)),
      'C8  nothing in the reading is called "visible" — the page cannot observe the operator\'s screen');
    ok(/opportunity/i.test(d.note),
      'C9  and the note says the figure is a paint OPPORTUNITY, so it cannot be quoted as a measured visible instant');
    ok(/approx/i.test(d.note) || /not .*(observ|measur)/i.test(d.note),
      'C10 stating plainly that it is an approximation rather than an observation', d.note);
    eq(d.timing.forSeq, _irRecoSeq,
      'C11 and the reading names the request sequence it belongs to, so it cannot be read against another');

    // ================================================================================================
    section('§X  mutants — the mechanisms are switched off and the scenarios must break');
    // ================================================================================================
    // Each mutant disables ONE mechanism at RUNTIME and re-runs the scenario that depends on it. A
    // source-text mutant would only prove that a string is present; this proves the code is reached and
    // that the assertion above would have failed without it.
    var realSupersede = _irMatSupersedeInFlight_;
    var realInvalidate = _irMatInvalidateForRecalc_;

    return Promise.resolve().then(function () {
      // X1 - the reuse branch stops retiring the superseded request. The late EU answer must clobber.
      _irMatSupersedeInFlight_ = function () { return false; };
      coldStart(); gotoSite('US_AMZ'); loadInventoryGap_();
      return settleGapWhere(SITES.US_AMZ);
    }).then(function () {
      gotoSite('EU_AMZ'); loadInventoryGap_();
      gotoSite('US_AMZ'); loadInventoryGap_();
      return settleGapWhere(SITES.EU_AMZ);
    }).then(function () {
      eq(_irMatState.appliedScopeKey, 'eu|MP-EU-AMZ',
        'X1  without the supersede, the late EU answer DOES overwrite the US state — A1f is load-bearing');
      _irMatSupersedeInFlight_ = realSupersede;

      // X2 - the recalc invalidation becomes a no-op. The pre-recalc answers must survive.
      _irMatInvalidateForRecalc_ = function () {};
      coldStart();
      var chain = Promise.resolve();
      ['US_AMZ', 'EU_AMZ'].forEach(function (n) {
        chain = chain.then(function () { gotoSite(n); loadInventoryGap_(); return settleGapWhere(SITES[n]); });
      });
      return chain;
    }).then(function () {
      gotoSite('US_AMZ');
      refreshInventoryGapAfterRecalc_({ mode: 'ALL_SITES' });
      eq(heldNames(), ['EU_AMZ', 'US_AMZ'],
        'X2  without the invalidation, an ALL_SITES recalculation leaves both pre-recalc answers in place — A2b is load-bearing');
      _irMatInvalidateForRecalc_ = realInvalidate;
      return settleGapWhere(SITES.US_AMZ);
    }).then(function () {
      // X3 - the §C binding, shown from the other side: with the sequence UNCHANGED the same callback
      // does write. C4's null is the guard refusing, not a callback that never runs.
      coldStart(); gotoSite('US_AMZ');
      _irRecoMarkSearch_(); loadRecommendationWorkspace_();
      return settleReco();
    }).then(function () {
      eq(_irRecoReadDiag_().timing.paintOpportunityMs, null, 'X3a nothing written before the frames run');
      fireFrames(2);
      ok(typeof _irRecoReadDiag_().timing.paintOpportunityMs === 'number',
        'X3b and the identical callback DOES write when its request is still the current one');

      // X4 - the one case the invalidation must not get clever about: a bounded mode whose spec is
      // missing the field that bounds it. CURRENT_SCOPE without a marketplace names no scope, so the
      // blast radius is unknown and everything goes.
      coldStart();
      var chain = Promise.resolve();
      ['US_AMZ', 'US_WMT', 'EU_AMZ'].forEach(function (n) {
        chain = chain.then(function () { gotoSite(n); loadInventoryGap_(); return settleGapWhere(SITES[n]); });
      });
      return chain;
    }).then(function () {
      gotoSite('US_AMZ');
      refreshInventoryGapAfterRecalc_({ mode: 'CURRENT_SCOPE', company: 'Kitchen Mama', country: 'US' });
      eq(heldNames(), [],
        'X4  a CURRENT_SCOPE spec with no marketplace is UNBOUNDED, not a country-wide match and not a no-op');
      return settleGapWhere(SITES.US_AMZ);
    }).then(function () {
      console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
      if (failed > 0) process.exitCode = 1;
    });
  }).catch(function (e) {
    console.log('FAIL  the suite threw: ' + (e && e.stack || e));
    process.exitCode = 1;
  });
}
main();
