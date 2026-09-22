// Kitchen Mama Operation System — FC-SUMMARY-R2B-B1-R2-STABILITY-SHARE-FINAL
// READ/CACHE STABILITY · ANNUAL DIAGNOSTIC SHARE · NO TIMEOUT RAISED, NO REQUEST RETRIED
//
// TWO OPERATOR-REPORTED BLOCKERS, and neither of them was a slow network.
//
//   A. Regular -> Next could fail REQUEST_TIMEOUT / getTable / fc_regular_forecast.
//      The Regular Builder's broad-cache prerequisite list carried `fc_regular_forecast`, and in
//      Workspace mode `_fcGetRegularForecast()` returns the READ MODEL and never falls through to the
//      broad cache. The rows that read brought were dropped into a store the page does not consult.
//      The six call sites that DID consult it were asking `KM.DB.getFcRegularForecast()` directly —
//      the pattern A3-R5 §3 corrected for the Special builder's Base FC and left standing here.
//      A request that is never needed is not made faster by a longer budget; it is removed (§6).
//
//   B. After a successful Special Event save, reopening the builder blocked ~15 s and could fail
//      REQUEST_TIMEOUT / getTable / campaign_sku_lines. The save correctly invalidated the three
//      tables it changed — and then made the operator buy the same truth a SECOND time, at the moment
//      they least expect to wait. Stage 1's receipt already carries the complete canonical campaigns
//      row; the other two are refreshed ONCE, inside the save, where the operator is already waiting.
//
// AND THE SHARE COLUMNS, CLOSED. R1 shipped them reading "—" because FC Summary has no canonical
// planning anchor. The operator's decision: these are DIAGNOSTIC / REVIEW metrics and should describe
// the SELECTED YEAR. That is not the substitution R1 refused — R1 refused to answer a rolling-window
// question with an annual number under a heading promising the rolling one. Here the heading says
// "Annual" and the annual number is what is computed. The browser clock is still refused outright.
//
// Run: node assets/tests/fc-stability-share-final-r2.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into a sandbox (F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, mutants = [], survived = [];
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function close(a, e, tol, l) {
  if (typeof a === 'number' && isFinite(a) && Math.abs(a - e) <= tol) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + e + ' ±' + tol + '\n  got ' + a); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mutant(l, caught) {
  mutants.push(l);
  if (caught === true) { pass++; console.log('ok   ' + l + ' (caught)'); }
  else { survived.push(l); fail++; console.error('FAIL ' + l + ' — MUTANT SURVIVED'); }
}

var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }

var KMFCS = require(path.join(REPO, 'assets/js/core/supply-planning-forecast-share.js'));
var KMFSA = require(path.join(REPO, 'assets/js/core/supply-planning-factory-site-allocation.js'));

var FCS = read('assets/js/pages/fc-summary.js');
var SHARE = read('assets/js/core/supply-planning-forecast-share.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var HTML = read('assets/html/pages/fc-summary.html');
var CSS = read('assets/css/pages/fc-overview.css');
var GS14 = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
var GS20 = read('assets/specs/active/apps-script/20_campaign_write_handlers.gs');

// ---- source extraction ------------------------------------------------------------------------------
function fnSrc(src, name) {
  // Anchored to a line start with OPTIONAL indentation: KMFCS's functions live inside a UMD factory and
  // are indented, so a pattern requiring column zero finds the page's functions and misses the module's.
  var m = new RegExp('(?:^|\\n)[ \\t]*(async )?function ' + name.replace(/[$]/g, '\\$') + '\\s*\\(').exec(src);
  if (!m) throw new Error('function not found in source: ' + name);
  var i = src.indexOf('{', m.index + m[0].length - 1);
  var d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) break; }
  }
  return src.slice(m.index, j + 1);
}
// A SINGLE-LINE declaration. `varSrc` below looks for a closing `\n};`, which a one-liner does not
// have — it would silently return everything up to the next object literal in the file.
function lineSrc(src, decl) {
  var i = src.indexOf(decl);
  if (i < 0) throw new Error('declaration not found in source: ' + decl);
  var j = src.indexOf('\n', i);
  return src.slice(i, j < 0 ? src.length : j);
}
function varSrc(src, decl) {
  var i = src.indexOf(decl);
  if (i < 0) throw new Error('declaration not found in source: ' + decl);
  var j = src.indexOf('\n};', i);
  if (j < 0) { j = src.indexOf(';', i); return src.slice(i, j + 1); }
  return src.slice(i, j + 3);
}

/* A CODE-ONLY VIEW OF A SOURCE FILE.

   Several assertions below forbid a call. Run against the raw text they are also satisfied by deleting
   the comment that explains why the call is gone — which is backwards: this round ADDED those comments
   deliberately, and a test that punishes them teaches the next reader to strip them. Line and block
   comments are removed first, so every "does not call X" is a statement about code. */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
var FCS_CODE = codeOnly(FCS);

// =======================================================================================================
section('A — §1/§2 THE REGULAR BUILDER STOPS FETCHING A TABLE IT ALREADY HOLDS');
// =======================================================================================================

var PREREQ_SRC = varSrc(FCS, 'var _FC_PREREQ_TABLES_ = {');
var PREREQ = vm.runInNewContext(PREREQ_SRC + ' _FC_PREREQ_TABLES_;');

eq(PREREQ.regular, ['sku_details', 'marketplace_skus'],
  'A1 §18-2 the Regular path no longer names fc_regular_forecast as a prerequisite');
ok(PREREQ.regular.indexOf('fc_regular_forecast') === -1,
  'A2 §2 FC_REGULAR_FORECAST_GETTABLE_ON_NEXT = 0, stated by the declaration itself');
eq(PREREQ.regular.length, 2, 'A3 §2 the Regular prerequisite count is 2 (was 3)');

// `sku_details` / `marketplace_skus` STAY, and the test says WHY rather than restating the list: they
// are removed only when something else authoritatively holds them, and nothing does.
ok(PREREQ.regular.indexOf('sku_details') !== -1 && PREREQ.regular.indexOf('marketplace_skus') !== -1,
  'A4 the two tables no authoritative read brings are still prerequisites');
ok(!/_fcGetSkuDetails|_fcGetMarketplaceSkus/.test(FCS),
  'A5 ... and the page has no read-model accessor for either, which is why they stay');

// The Special path is untouched. This round did not renegotiate what a Special open needs.
eq(PREREQ.event, ['sku_details', 'marketplace_skus', 'campaigns', 'campaign_sku_lines',
                  'pricing_list', 'fc_special_events'],
  'A6 the Special path prerequisite list is unchanged');

// §18-1 — the Builder consumes the page's one owner, not the broad cache.
var BUILDER_FNS = ['_regularPrefillManual', '_populateRegularScopeSelects', '_fcRegularSiteOptions',
                   '_regularFcRows', '_evtBaseFcForSku', '_populateEventScopeSelects', '_fcMarketplaceOptions'];
BUILDER_FNS.forEach(function (n) {
  var src = fnSrc(FCS, n);
  src = codeOnly(src);
  ok(src.indexOf('KM.DB.getFcRegularForecast') === -1,
    'A7 §18-1 ' + n + ' does not read the broad cache directly');
  ok(/_fcGetRegularForecast\(\)/.test(src) || n === '_populateRegularScopeSelects' || n === '_populateEventScopeSelects'
     || /_fcGetRegularForecast\(\)/.test(src),
    'A8 §18-1 ' + n + ' asks the page accessor');
});

// Exactly ONE place in the whole page may name the broad getter, and it is the accessor itself.
var accessor = codeOnly(fnSrc(FCS, '_fcGetRegularForecast'));
var broadHits = (FCS_CODE.match(/KM\.DB\.getFcRegularForecast/g) || []).length;
var accessorHits = (accessor.match(/KM\.DB\.getFcRegularForecast/g) || []).length;
eq(broadHits - accessorHits, 0,
  'A9 §18-1 the ONLY code naming KM.DB.getFcRegularForecast is the page accessor (Legacy fallback)');
ok(accessorHits > 0,
  'A9b ... and the accessor really is the one that names it, so A9 cannot pass by deleting both');

// The readiness guard. `window._opDbCache` is the broad cache's own flag and is never set in Workspace
// mode: gating the prefill on it meant gating on a store this function does not read.
var prefill = codeOnly(fnSrc(FCS, '_regularPrefillManual'));
ok(prefill.indexOf('window._opDbCache') === -1,
  'A10 §2 the prefill no longer gates on the broad cache flag');
ok(/_fcRegularSourceReady_\(\)/.test(prefill),
  'A11 ... it asks the page whether the forecast is loaded');
var ready = fnSrc(FCS, '_fcRegularSourceReady_');
ok(/_fcWorkspaceMode_\(\)/.test(ready) && /_fcHas_\('fcRegularForecast'\)/.test(ready),
  'A12 ... and the answer is mode-aware: the slice in Workspace, the broad cache in Legacy');

// Removing the broad read MOVED the dependency onto the slice. If that guard had stayed keyed to the
// Special path, a Regular Builder opened from the Event tab would sit on "Loading…" forever — a worse
// failure than the timeout this round removed, because it offers the operator nothing at all.
var baseGuard = fnSrc(FCS, '_fcBaseFcSourceMissing_');
ok(baseGuard.indexOf("!== 'event'") === -1,
  'A13 §2 the regular-slice guard is no longer restricted to the Special path');
ok(/_fcHas_\('fcRegularForecast'\)/.test(baseGuard),
  'A14 ... and both builders now declare they read the regular slice');
ok(/Promise\.all\(\[_fcLoadPrerequisites_\(mode\), _fcEnsureBaseFcSource_\(mode\)\]\)/.test(FCS),
  'A15 §19 the two prerequisites of an open are CONCURRENT, so the slice is not additive wall time');

// §6 — the forbidden fixes. None of them was used.
ok(!/REQUEST_TIMEOUT/.test(fnSrc(FCS, '_fcLoadPrerequisites_')),
  'A16 §6 the loader does not special-case REQUEST_TIMEOUT');
ok(!/setTimeout\([^)]*_fcLoadPrerequisites_|_fcLoadPrerequisites_[\s\S]{0,200}retry\(/.test(FCS),
  'A17 §6 AUTO_TIMEOUT_RETRY_ADDED = NO — nothing re-issues a timed-out prerequisite read');
ok(/the latch is released on failure|The latch is released on failure/i.test(FCS),
  'A18 §6 a failed load releases its latch so RETRY IS THE OPERATOR\'S, issuing one new request');

// =======================================================================================================
section('B — §19 THE READ GRAPH, EXECUTED. Every count below is measured, not asserted.');
// =======================================================================================================

var CALLS = [];
function buildBox(opts) {
  opts = opts || {};
  CALLS = [];
  var box = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    Date: Date, Promise: Promise, Object: Object, Array: Array, String: String,
    window: {
      KM: {
        DB: {
          refreshCacheTables: function (names) {
            CALLS.push(names.slice());
            return opts.failRefresh ? Promise.reject(new Error('REQUEST_TIMEOUT')) : Promise.resolve();
          },
          reconcileCacheRow: opts.noReconciler ? undefined : function (table, row) {
            var pk = { campaigns: 'campaign_id', campaign_sku_lines: 'campaign_sku_line_id',
                       fc_special_events: 'event_fc_id' }[table];
            return !!(row && String(row[pk] || '').trim());
          }
        }
      },
      _opDbCache: {}
    }
  };
  vm.createContext(box);
  vm.runInContext(PREREQ_SRC, box);
  vm.runInContext(varSrc(FCS, 'var _FC_SLICE_PREREQ_TABLES_ = {'), box);
  vm.runInContext('var _fcPrereqLoadedTables_ = {}; var _fcPrereqLoadedPaths_ = {}; var _fcSecondaryLoaded = false;', box);
  vm.runInContext('var _fcPrereqFlightByPath_ = {}; var _fcPrereqFlight_ = null; var _fcPrereqLastError_ = null;', box);
  vm.runInContext('var _fcPrereqLoads_ = 0; var _fcMeta_ = {}; var _fcPrereqState_ = "IDLE";', box);
  vm.runInContext('var FC_PREREQ_ = { IDLE: "IDLE", READY: "READY", LOADING: "LOADING", REFUSED: "REFUSED", FAILED_PERMANENT: "FAILED_PERMANENT" };', box);
  vm.runInContext('function _fcPrereqRetryable_() { return true; }', box);
  ['_fcPrereqMissing_', '_fcSliceTables_', '_fcReconcileFromReceipts_', '_fcResetSecondaryCache',
   '_fcPostWriteWarm_', '_fcPrereqPath_', '_fcLoadPrerequisites_']
    .forEach(function (n) { vm.runInContext(fnSrc(FCS, n), box); });
  return box;
}
function ev(box, expr) { return vm.runInContext(expr, box); }
function reads() { return CALLS.reduce(function (a, c) { return a + c.length; }, 0); }
var RECEIPT = '{ slice: "events", receiptRows: { campaigns: [{ campaign_id: "C1" }] } }';

var results = {};
function scenario(name, fn) { return fn().then(function (v) { results[name] = v; return v; }); }

var chain = Promise.resolve()
  // §19 REGULAR — the headline number.
  .then(function () {
    var box = buildBox();
    return ev(box, '_fcLoadPrerequisites_("regular")').then(function () {
      results.regularCold = { n: reads(), tables: CALLS[0] || [] };
      CALLS = [];
      // §18-3 analogue for Regular: close without writing, reopen.
      return ev(box, '_fcLoadPrerequisites_("regular")').then(function () {
        results.regularWarm = reads();
      });
    });
  })
  // §18-3 SPECIAL WARM.
  .then(function () {
    var box = buildBox();
    return ev(box, '_fcLoadPrerequisites_("event")').then(function () {
      results.specialCold = { n: reads(), tables: CALLS[0] || [] };
      CALLS = [];
      return ev(box, '_fcLoadPrerequisites_("event")').then(function () {
        results.specialWarm = reads();
      });
    });
  })
  // §18-4 SPECIAL POST-WRITE.
  .then(function () {
    var box = buildBox();
    return ev(box, '_fcLoadPrerequisites_("event")')
      .then(function () { return ev(box, '_fcLoadPrerequisites_("regular")'); })
      .then(function () {
        CALLS = [];
        results.reconciled = ev(box, '_fcResetSecondaryCache(' + RECEIPT + ')');
        results.latchedAfterInvalidation = ev(box, 'Object.keys(_fcPrereqLoadedTables_).sort()');
        return ev(box, '_fcPostWriteWarm_(' + RECEIPT + ')');
      })
      .then(function () {
        results.inSaveWarm = { n: reads(), tables: CALLS[0] || [] };
        CALLS = [];
        return ev(box, '_fcLoadPrerequisites_("event")');
      })
      .then(function () {
        results.postWriteReopen = reads();
        CALLS = [];
        return ev(box, '_fcLoadPrerequisites_("regular")');
      })
      .then(function () { results.postWriteRegular = reads(); });
  })
  // §18-8/9 a warm-up that FAILS.
  .then(function () {
    var box = buildBox({ failRefresh: true });
    box.window.KM.DB.refreshCacheTables = function (n) { CALLS.push(n.slice()); return Promise.resolve(); };
    return ev(box, '_fcLoadPrerequisites_("event")').then(function () {
      box.window.KM.DB.refreshCacheTables = function (n) { CALLS.push(n.slice()); return Promise.reject(new Error('REQUEST_TIMEOUT')); };
      ev(box, '_fcResetSecondaryCache(' + RECEIPT + ')');
      CALLS = [];
      return ev(box, '_fcPostWriteWarm_({ slice: "events" })').then(function (got) {
        results.failedWarmReturn = got;
        results.failedWarmLatched = ev(box, 'Object.keys(_fcPrereqLoadedTables_).sort()');
        box.window.KM.DB.refreshCacheTables = function (n) { CALLS.push(n.slice()); return Promise.resolve(); };
        CALLS = [];
        return ev(box, '_fcLoadPrerequisites_("event")').then(function () {
          results.reopenAfterFailedWarm = { n: reads(), tables: CALLS[0] || [] };
        });
      });
    });
  })
  // §18-5/6/7/8 — a receipt the owning store REFUSES.
  .then(function () {
    var box = buildBox();
    return ev(box, '_fcLoadPrerequisites_("event")').then(function () {
      results.rejectedReceipt =
        ev(box, '_fcResetSecondaryCache({ slice: "events", receiptRows: { campaigns: [{ campaign_id: "" }] } })');
      results.rejectedLatched = ev(box, 'Object.keys(_fcPrereqLoadedTables_).sort()');
    });
  })
  // a build with NO reconciler at all must behave exactly as before this round.
  .then(function () {
    var box = buildBox({ noReconciler: true });
    return ev(box, '_fcLoadPrerequisites_("event")').then(function () {
      results.noReconciler = ev(box, '_fcResetSecondaryCache(' + RECEIPT + ')');
      results.noReconcilerLatched = ev(box, 'Object.keys(_fcPrereqLoadedTables_).sort()');
    });
  })
  // the A3-R4 invariant: a Target Rule save disturbs NEITHER builder path.
  .then(function () {
    var box = buildBox();
    return ev(box, '_fcLoadPrerequisites_("event")')
      .then(function () { return ev(box, '_fcLoadPrerequisites_("regular")'); })
      .then(function () {
        ev(box, '_fcResetSecondaryCache({ slice: "rules" })');
        CALLS = [];
        return ev(box, '_fcLoadPrerequisites_("event")');
      })
      .then(function () { return ev(box, '_fcLoadPrerequisites_("regular")'); })
      .then(function () { results.afterRulesSave = reads(); });
  })
  // and the fail-closed rule: an UNKNOWN scope still discards everything.
  .then(function () {
    var box = buildBox();
    return ev(box, '_fcLoadPrerequisites_("event")').then(function () {
      ev(box, '_fcResetSecondaryCache(undefined)');
      CALLS = [];
      return ev(box, '_fcLoadPrerequisites_("event")').then(function () {
        results.afterUnknownScope = reads();
      });
    });
  });

chain.then(function () {
  var R = results;
  section('B — measured read graph');
  console.log('   REGULAR cold      : ' + R.regularCold.n + '  ' + JSON.stringify(R.regularCold.tables));
  console.log('   REGULAR warm      : ' + R.regularWarm);
  console.log('   SPECIAL cold      : ' + R.specialCold.n);
  console.log('   SPECIAL warm      : ' + R.specialWarm);
  console.log('   SPECIAL in-save   : ' + R.inSaveWarm.n + '  ' + JSON.stringify(R.inSaveWarm.tables));
  console.log('   SPECIAL post-write: ' + R.postWriteReopen);

  eq(R.regularCold.n, 2, 'B1 §2 Regular first Next physical prerequisite reads = 2 (was 3)');
  ok(R.regularCold.tables.indexOf('fc_regular_forecast') === -1,
    'B2 §2 FC_REGULAR_FORECAST_GETTABLE_ON_NEXT = 0, measured');
  eq(R.regularWarm, 0, 'B3 Regular reopen without a write reads nothing');
  eq(R.specialCold.n, 6, 'B4 the Special cold open is unchanged at 6 (this round did not touch it)');
  eq(R.specialWarm, 0, 'B5 §18-3 SPECIAL WARM reopen = 0 blocking prerequisite reads');

  eq(R.reconciled, ['campaigns'],
    'B6 §18-5 the campaigns receipt is COMPLETE and is reconciled, not re-read');
  ok(R.latchedAfterInvalidation.indexOf('campaigns') !== -1,
    'B7 ... so campaigns stays current THROUGH the invalidation');
  ok(R.latchedAfterInvalidation.indexOf('campaign_sku_lines') === -1 &&
     R.latchedAfterInvalidation.indexOf('fc_special_events') === -1,
    'B8 §18-6/7 the two PARTIAL receipts do not keep their tables current');
  eq(R.inSaveWarm.tables, ['campaign_sku_lines', 'fc_special_events'],
    'B9 §4 exactly those two are refreshed, ONCE, inside the save flow');
  eq(R.postWriteReopen, 0,
    'B10 §18-4 POST_SPECIAL_WRITE_NEXT_BLOCKING_READS = 0');
  eq(R.postWriteRegular, 0,
    'B11 ... and an events save still leaves the Regular path alone');

  eq(R.failedWarmReturn, [],
    'B12 §18-9 a warm-up that FAILS latches nothing and reports nothing');
  ok(R.failedWarmLatched.indexOf('campaign_sku_lines') === -1 &&
     R.failedWarmLatched.indexOf('fc_special_events') === -1,
    'B13 §18-8 incomplete data is NEVER marked CURRENT');
  eq(R.reopenAfterFailedWarm.tables, ['campaign_sku_lines', 'fc_special_events'],
    'B14 §18-9 ... and the next open reads them properly, with its own refusal surface');

  eq(R.rejectedReceipt, [],
    'B15 §18-8 a receipt the OWNING STORE refuses is not treated as reconciled');
  ok(R.rejectedLatched.indexOf('campaigns') === -1,
    'B16 ... and its table is invalidated exactly as if no receipt had come');

  eq(R.noReconciler, [],
    'B17 a build without KM.DB.reconcileCacheRow reconciles nothing');
  ok(R.noReconcilerLatched.indexOf('campaigns') === -1,
    'B18 ... and degrades to the pre-round behaviour rather than assuming success');

  eq(R.afterRulesSave, 0,
    'B19 the A3-R4 invariant holds: a Target Rule save disturbs neither builder path');
  eq(R.afterUnknownScope, 6,
    'B20 §4 fail-closed — an unknown write scope still discards everything');

  runRest();
}).catch(function (e) {
  console.error('HARNESS ERROR', e && e.stack || e);
  process.exit(1);
});

function runRest() {

// =======================================================================================================
section('C — §3 THE RECEIPT CENSUS, READ AGAINST THE WRITERS THEMSELVES');
// =======================================================================================================
// Each claim about what a receipt carries is checked against the .gs that produces it. A census that
// drifts from its writers is the reason a cache goes stale silently.

ok(/var receipt = campaignReceiptFor_\(sheet, result\.id\);/.test(GS20) &&
   /row_version: receipt \? receipt\.row_version : '', row: receipt/.test(GS20),
  'C1 §3 campaigns: the writer returns the COMPLETE canonical row, read back after the write');

// STAGE2-LARGE-BATCH §5 — the receipt SHAPE is what §3 depends on and it is unchanged: id + sku +
// created + unchanged + row_version, and still NO row. The id now comes from the batch's resolved
// `lineId` rather than from a per-line fcWriteUpsert_ result, which is the repair, not a contract change.
ok(/out\.push\(\{ campaign_sku_line_id: lineId, sku: sku, created: isNew, unchanged: false, row_version: fp \}\);/.test(GS20) &&
   !/row: /.test(GS20.slice(GS20.indexOf('out.push({ campaign_sku_line_id: lineId'), GS20.indexOf('out.push({ campaign_sku_line_id: lineId') + 300)),
  'C2 §3 campaign_sku_lines: the per-line receipt carries id + sku + version and NO row');

// fc_special_events is the interesting one: the row EXISTS server-side and the batch envelope drops it.
// Recorded so the next round can make the receipt authoritative and take the in-save warm-up to zero.
ok(/return \{ event_fc_id: id, created: true, unchanged: false,[\s\S]{0,120}row: fcSeReceiptFor_\(sheet, id\) \};/.test(GS14),
  'C3 §3 fc_special_events: the UPSERT computes the full canonical row on the create branch');
var batchPush = GS14.slice(GS14.indexOf('results.push({ index: i, event_fc_id: res && res.event_fc_id'));
ok(batchPush.slice(0, 220).indexOf('row:') === -1,
  'C4 §3 ... and handleImportFcSpecialEventsBatch_ DISCARDS it — the reason the warm-up exists');

// The census lives in the source too, where the next reader will be.
ok(/AUTHORITATIVE\. `handleUpsertCampaign_` returns/.test(FCS),
  'C5 the receipt census is recorded beside the code that depends on it');
ok(/DROPS it\. The truth exists server-side/.test(FCS),
  'C6 ... including the one finding that would take the warm-up to zero reads');

// =======================================================================================================
section('D — §4 RECONCILE IN THE STORE THAT OWNS THE ROWS, NEVER FROM THE PAGE');
// =======================================================================================================

ok(/window\.KM\.DB\.reconcileCacheRow = _kmReconcileCacheRow_;/.test(DBAPI),
  'D1 the reconcile is exposed by the module that owns _opDbCache');
ok(!/_opDbCache\[/.test(FCS_CODE) && !/_opDbCache\./.test(FCS_CODE),
  'D2 §4 the PAGE never reaches into the broad cache to patch a row');

var rec = fnSrc(DBAPI, '_kmReconcileCacheRow_');
ok(/var norm = normalizeOperationDb\(one\);/.test(rec),
  'D3 the patched row is normalized by the IDENTICAL call the broad load makes');
ok(/if \(!Array\.isArray\(rows\) \|\| rows\.length !== 1\) return false;/.test(rec),
  'D4 a row the normalizer REJECTS patches nothing and reports failure');
ok(/if \(!window\._opDbCache \|\| !Array\.isArray\(window\._opDbCache\[key\]\)\) return false;/.test(rec),
  'D5 it refuses to CREATE the cache — a one-row cache would make an empty table look populated');

// Driven: the real reconciler, over the real normalizer.
(function () {
  var box = { window: {}, console: { log: function () {}, warn: function () {}, error: function () {} } };
  vm.createContext(box);
  vm.runInContext(fnSrc(DBAPI, 'normalizeCampaignRecord'), box);
  vm.runInContext('function normalizeOperationDb(db) { return { campaigns: (db.campaigns || [])' +
    '.map(normalizeCampaignRecord).filter(function (r) { return r.campaignId; }) }; }', box);
  vm.runInContext(varSrc(DBAPI, 'var _KM_TABLE_CACHE_KEY_ = {'), box);
  vm.runInContext(varSrc(DBAPI, 'var _KM_TABLE_CACHE_PK_ = {'), box);
  vm.runInContext(fnSrc(DBAPI, '_kmReconcileCacheRow_'), box);

  vm.runInContext('window._opDbCache = { campaigns: [{ campaignId: "C1", campaignName: "OLD" }] };', box);
  var updated = vm.runInContext('_kmReconcileCacheRow_("campaigns", { campaign_id: "C1", campaign_name: "NEW" })', box);
  ok(updated === true, 'D6 §18-5 an existing row is REPLACED in place');
  eq(vm.runInContext('window._opDbCache.campaigns.length', box), 1,
    'D7 ... exactly once, never appended beside itself');
  eq(vm.runInContext('window._opDbCache.campaigns[0].campaignName', box), 'NEW',
    'D8 ... with the receipt\'s values');

  var added = vm.runInContext('_kmReconcileCacheRow_("campaigns", { campaign_id: "C2", campaign_name: "X" })', box);
  ok(added === true && vm.runInContext('window._opDbCache.campaigns.length', box) === 2,
    'D9 a row the cache has never seen is added');

  var rejected = vm.runInContext('_kmReconcileCacheRow_("campaigns", { campaign_name: "no pk" })', box);
  ok(rejected === false && vm.runInContext('window._opDbCache.campaigns.length', box) === 2,
    'D10 §4 a row the normalizer drops changes NOTHING and returns false');

  ok(vm.runInContext('_kmReconcileCacheRow_("sku_details", { sku: "X" })', box) === false,
    'D11 a table with no declared primary key is refused');
  ok(vm.runInContext('_kmReconcileCacheRow_("campaigns", null)', box) === false,
    'D12 a missing row is refused rather than treated as a no-op success');

  vm.runInContext('window._opDbCache = null;', box);
  ok(vm.runInContext('_kmReconcileCacheRow_("campaigns", { campaign_id: "C9" })', box) === false,
    'D13 §4 with no cache to keep fresh there is nothing to reconcile');
})();

// =======================================================================================================
section('E — §5/§6 THE WARM-UP CANNOT MAKE ANYTHING WORSE');
// =======================================================================================================

var warm = fnSrc(FCS, '_fcPostWriteWarm_');
ok(/\}, function \(\) \{[\s\S]*return \[\];[\s\S]*\}\);/.test(warm),
  'E1 §5 a background failure returns empty-handed instead of throwing');
ok(!/_fcShowBanner_|_fcRenderError_|alert\(/.test(warm),
  'E2 §5 a warm-up failure never poisons the currently valid UI');
ok(!/_fcReadModel|_fcViewState_/.test(warm),
  'E3 §5 it cannot clear visible valid data — it does not touch the read model or the view state');
ok(/_fcPrereqMissing_\(p\)\.length/.test(warm),
  'E4 §4 the PATH latch is DERIVED from the tables, never asserted alongside them');
ok(/!_fcPrereqLoadedTables_\[t\]/.test(warm),
  'E5 it warms only tables that are actually cold — a warm table costs no request');

// §5 stale generation. The warm-up runs concurrently with the readback and must not be able to
// resurrect an older answer: it writes only LATCHES, never rows, and the rows it causes to be written
// are written by refreshCacheTables, which is the same single owner the cold path uses.
ok(!/_fcMergeSlice_|_fcHydrateFromModel_/.test(warm),
  'E6 §5 the warm-up writes no rows itself, so it cannot overwrite newer data with older');

var afterWrite = fnSrc(FCS, '_fcAfterWrite');
ok(/_fcPostWriteWarm_\(_sc\);/.test(afterWrite),
  'E7 §4 the warm-up is started inside the save flow, where the operator is already waiting');
ok(afterWrite.indexOf('_fcPostWriteWarm_(_sc).then') === -1 &&
   afterWrite.indexOf('await _fcPostWriteWarm_') === -1,
  'E8 §4 ... and NOT chained to the readback, so it cannot fail a readback that succeeded');
var warmIdx = afterWrite.indexOf('_fcPostWriteWarm_(_sc);');
var fetchIdx = afterWrite.indexOf('_fcSliceFetch_(_slice)');
ok(warmIdx > -1 && fetchIdx > warmIdx,
  'E9 §19 the two requests overlap: the operator pays the slower, not the sum');

// §6 — the constants. Nothing about the transport budget moved.
// The two transport budgets, pinned by value. Neither was touched, and §6 forbids touching either as
// a remedy: a read that is not needed is not made correct by a longer budget, and the write budget is
// cross-pinned to `66_api_v1_request_order_send.gs` by two other suites anyway.
ok(/var KM_READ_TIMEOUT_MS_ = 45000;/.test(DBAPI),
  'E10 §6 CLIENT_TIMEOUT_CHANGED = NO — the bounded read budget is still 45000 ms');
ok(/var KM_WRITE_TIMEOUT_MS_ = 90000;/.test(DBAPI),
  'E11 §6 ... and the write budget is still 90000 ms');

// =======================================================================================================
section('F — §7 THE ANNUAL DIAGNOSTIC SHARE. KMFCS, and the two grains kept apart.');
// =======================================================================================================

function row(company, country, marketplace, sku, year, flat, over) {
  var o = { company: company, country: country, marketplace: marketplace, sku: sku, year: year };
  KMFCS.MONTH_KEYS.forEach(function (m) { o[m] = flat; });
  if (over) Object.keys(over).forEach(function (k) { o[k] = over[k]; });
  return o;
}
// Annual 2026 totals: KM/US 1200, KM/CA 600, KM/JP 300, ResUS/US 1200, ResTW/TW 600.
var ROWS = [
  row('KM', 'US', 'Amazon', 'CO1100-R', 2026, 100),
  row('KM', 'CA', 'Amazon', 'CO1100-R', 2026, 50),
  row('KM', 'JP', 'Amazon', 'CO1100-R', 2026, 25),
  row('ResUS', 'US', 'Amazon', 'CO1100-R', 2026, 100),
  row('ResTW', 'TW', 'Rakuten', 'CO1100-R', 2026, 50),
  row('KM', 'US', 'Amazon', 'CO1100-R', 2027, 833)
];
var P26 = KMFCS.projectAnnual({ sku: 'CO1100-R', year: 2026, forecastRows: ROWS });
function sh(p, c, ctry, m) {
  return KMFCS.annualSiteShares(p, { company: c, country: ctry, marketplace: m, sku: 'CO1100-R' });
}

// §18-13 SAME SKU, MULTIPLE COUNTRIES — the collision that started all of this.
close(sh(P26, 'KM', 'US', 'Amazon').companyAnnualShare, 1200 / 2100, 1e-12,
  'F1 §18-13 KM/US/Amazon is 1200 of KM\'s 2100');
close(sh(P26, 'KM', 'CA', 'Amazon').companyAnnualShare, 600 / 2100, 1e-12,
  'F2 §18-13 KM/CA/Amazon is 600 of the same 2100');
close(sh(P26, 'KM', 'JP', 'Amazon').companyAnnualShare, 300 / 2100, 1e-12,
  'F3 §18-13 KM/JP/Amazon is 300 of it');
ok(sh(P26, 'KM', 'US', 'Amazon').companyAnnualShare !== sh(P26, 'KM', 'CA', 'Amazon').companyAnnualShare &&
   sh(P26, 'KM', 'CA', 'Amazon').companyAnnualShare !== sh(P26, 'KM', 'JP', 'Amazon').companyAnnualShare,
  'F4 §18-25 three countries, three DIFFERENT shares — no site-key collision');

// §18-14 SAME SKU, MULTIPLE MARKETPLACES.
(function () {
  var r = [row('KM', 'US', 'Amazon', 'X', 2026, 100), row('KM', 'US', 'Walmart', 'X', 2026, 25)];
  var p = KMFCS.projectAnnual({ sku: 'X', year: 2026, forecastRows: r });
  close(KMFCS.annualSiteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'X' }).companyAnnualShare,
    0.8, 1e-12, 'F5 §18-14 two marketplaces in one country are two sites');
})();

// §18-15 SAME SKU, MULTIPLE COMPANIES — and the company denominator is company-WIDE.
close(sh(P26, 'ResUS', 'US', 'Amazon').companyAnnualShare, 1, 1e-12,
  'F6 §18-15 ResUS is its company\'s only site, so it is 100% of it');
close(sh(P26, 'ResTW', 'TW', 'Rakuten').companyAnnualShare, 1, 1e-12,
  'F7 §18-15 ... and so is ResTW, in a different country');

// §18-16/17 THE INVARIANTS, on decimals at the repository epsilon.
(function () {
  var byCompany = {};
  Object.keys(P26.bySite).forEach(function (k) {
    (byCompany[k.split('|')[0]] = byCompany[k.split('|')[0]] || []).push(P26.bySite[k].companyAnnualShare);
  });
  var allOne = Object.keys(byCompany).every(function (c) { return KMFCS.sumsToOne(byCompany[c]); });
  ok(allOne, 'F8 §18-16 company annual shares sum to 1 within EVERY company');
  ok(KMFCS.sumsToOne(Object.keys(P26.bySite).map(function (k) { return P26.bySite[k].allSiteAnnualShare; })),
    'F9 §18-17 all-site annual shares sum to 1 across every site');
})();

// §18-18 THE SELECTED YEAR CHANGES THE BASIS. Not a filter on the output — a different numerator AND
// a different denominator.
(function () {
  var P27 = KMFCS.projectAnnual({ sku: 'CO1100-R', year: 2027, forecastRows: ROWS });
  eq(P27.denominators.allSites, 833 * 12, 'F10 §18-18 2027 has its own denominator');
  close(KMFCS.annualSiteShares(P27, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' }).companyAnnualShare,
    1, 1e-12, 'F11 §18-18 ... and KM/US is all of KM in 2027, where it was 4/7 in 2026');
  ok(P26.denominators.allSites !== P27.denominators.allSites,
    'F12 §18-18 the two years are genuinely different bases');
})();

// §18-23 ZERO DENOMINATOR — never an equal split, never 100%.
(function () {
  var p = KMFCS.projectAnnual({ sku: 'Z', year: 2026,
    forecastRows: [row('KM', 'US', 'Amazon', 'Z', 2026, 0), row('KM', 'CA', 'Amazon', 'Z', 2026, 0)] });
  var s = KMFCS.annualSiteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'Z' });
  eq(s.companyAnnualShare, null, 'F13 §18-23 a zero denominator yields NO share');
  eq(KMFCS.formatShare(s.companyAnnualShare), '—', 'F14 §14 ... and displays an em dash');
  ok(p.issues.some(function (i) { return i.code === 'ZERO_FORECAST_DENOMINATOR'; }),
    'F15 §14 ... with a typed reason, not a silent null');
  ok(s.companyAnnualShare !== 0.5 && s.companyAnnualShare !== 1,
    'F16 §14 ... and NEVER an equal split or a 100% fallback');
})();

// §18-24 MISSING DATA.
(function () {
  var p = KMFCS.projectAnnual({ sku: 'CO1100-R', year: '', forecastRows: ROWS });
  eq(Object.keys(p.bySite).length, 0, 'F17 §18-24 no year selected -> nothing is projected');
  eq(p.year.state, KMFCS.YEAR_UNAVAILABLE, 'F18 ... and the state is TYPED, not defaulted');
  eq(p.issues[0].code, 'ANNUAL_SHARE_YEAR_UNAVAILABLE', 'F19 ... with a typed issue');
  var s = KMFCS.annualSiteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' });
  eq(s.resolved, false, 'F20 §14 an unresolved site reports unresolved');
  eq(KMFCS.formatShare(s.companyAnnualShare), '—', 'F21 ... and renders an em dash');

  var bad = KMFCS.projectAnnual({ sku: 'X', year: '26', forecastRows: ROWS });
  eq(bad.year.state, KMFCS.YEAR_INVALID, 'F22 a malformed year is INVALID, not coerced');
})();

// §14 NO NaN, NO Infinity, NO NEGATIVE.
(function () {
  var p = KMFCS.projectAnnual({ sku: 'N', year: 2026,
    forecastRows: [row('KM', 'US', 'Amazon', 'N', 2026, -100), row('KM', 'CA', 'Amazon', 'N', 2026, 50)] });
  var vals = Object.keys(p.bySite).map(function (k) { return p.bySite[k].companyAnnualShare; });
  ok(vals.every(function (v) { return v === null || (isFinite(v) && v >= 0 && v <= 1); }),
    'F23 §14 every annual share is null or inside [0,1] — no NaN, no Infinity, no negative', vals);
  ok(p.issues.some(function (i) { return i.code === 'SITE_FORECAST_NEGATIVE'; }),
    'F24 §14 ... and a negative forecast is clamped AND reported');
})();

// §13 THE NUMERATOR OWNER. Raw months, never the ceiled display values.
(function () {
  var r = [row('KM', 'US', 'Amazon', 'F', 2026, 0.4), row('KM', 'CA', 'Amazon', 'F', 2026, 10)];
  var p = KMFCS.projectAnnual({ sku: 'F', year: 2026, forecastRows: r });
  close(p.bySite[KMFSA.siteKey({ company: 'KM', country: 'US', marketplace: 'Amazon' })].annualForecastQty,
    4.8, 1e-12, 'F25 §13 the basis is Σ RAW months (4.8), not Σ ceil(month) (12)');
  close(KMFCS.annualSiteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'F' }).companyAnnualShare,
    4.8 / 124.8, 1e-12, 'F26 §13 ROUNDING_BEFORE_SHARE = NO — 3.8%, not the 9.1% a ceiled basis gives');
})();

// §13 full precision in, one decimal out, and the invariant checked on the decimals.
(function () {
  var r = [row('KM', 'US', 'Amazon', 'T', 2026, 1), row('KM', 'CA', 'Amazon', 'T', 2026, 1),
           row('KM', 'JP', 'Amazon', 'T', 2026, 1)];
  var p = KMFCS.projectAnnual({ sku: 'T', year: 2026, forecastRows: r });
  var vals = Object.keys(p.bySite).map(function (k) { return p.bySite[k].companyAnnualShare; });
  eq(vals.map(KMFCS.formatShare), ['33.3%', '33.3%', '33.3%'], 'F27 display is one decimal');
  ok(KMFCS.sumsToOne(vals),
    'F28 §13 ... and the 100% invariant is checked on the DECIMALS, which is why 33.3×3=99.9 never warns');
})();

// =======================================================================================================
section('G — §8 THE TWO GRAINS ARE NOT INTERCHANGEABLE, AND THE CODE MAKES THAT TRUE');
// =======================================================================================================

eq(P26.grain, 'SELECTED_YEAR', 'G1 §8 the annual projection declares its grain');
eq(KMFCS.project({ sku: 'CO1100-R', calculationMonth: '2026-10', forecastRows: ROWS }).grain, 'ROLLING_M1_M4',
  'G2 §8 the rolling projection declares a DIFFERENT grain');

// The field names differ, so a consumer reaching for the wrong projection gets undefined — not a
// plausible number computed over the wrong months.
var anySite = P26.bySite[Object.keys(P26.bySite)[0]];
eq(anySite.companyForecastShare, undefined,
  'G3 §8 the annual result does not expose the ROLLING field name');
eq(anySite.eligibleReceiverForecastShare, undefined,
  'G4 §8 FC_SUMMARY_ANNUAL_SHARE has no eligible-receiver share at all');
eq(anySite.allSiteForecastShare, undefined, 'G5 §8 ... nor the rolling all-site field');
var anyRoll = KMFCS.project({ sku: 'CO1100-R', calculationMonth: '2026-10', forecastRows: ROWS });
eq(anyRoll.bySite[Object.keys(anyRoll.bySite)[0]].companyAnnualShare, undefined,
  'G6 §8 and the rolling result does not expose the ANNUAL field name');

// §8 — sourceCountry is ABSENT from the annual signature, not ignored. The shape cannot express it.
var annualSrc = fnSrc(SHARE, 'projectAnnual');
ok(annualSrc.indexOf('sourceCountry') === -1 && annualSrc.indexOf('isEligibleReceiver') === -1 &&
   annualSrc.indexOf('policyFor') === -1,
  'G7 §8 projectAnnual cannot compute an eligible-receiver share: the inputs do not exist');

// The two grains genuinely disagree on the same rows. If they agreed, the separation would be untested.
(function () {
  var roll = KMFCS.project({ sku: 'CO1100-R', calculationMonth: '2026-11', forecastRows: ROWS });
  var k = KMFSA.siteKey({ company: 'KM', country: 'US', marketplace: 'Amazon' });
  ok(Math.abs(roll.bySite[k].companyForecastShare - P26.bySite[k].companyAnnualShare) > 0.01,
    'G8 §8 on the SAME rows the two grains give different numbers — which is the point of two names');
})();

// §8/§18-27/28 NO ALLOCATOR READS THE ANNUAL SHARE.
var KMOOP = read('assets/js/core/supply-planning-ongoing-order-projection.js') +
            read('assets/js/core/supply-planning-ongoing-order-runtime.js');
var KMFSA_SRC = read('assets/js/core/supply-planning-factory-site-allocation.js');
ok(KMFSA_SRC.indexOf('AnnualShare') === -1 && KMFSA_SRC.indexOf('projectAnnual') === -1,
  'G9 §18-27 FC_SUMMARY_ANNUAL_SHARE_USED_BY_KMFSA = NO');
ok(KMOOP.indexOf('AnnualShare') === -1 && KMOOP.indexOf('projectAnnual') === -1,
  'G10 §18-28 FC_SUMMARY_ANNUAL_SHARE_USED_BY_KMOOP = NO');
ok(KMFSA_SRC.indexOf('forecastShare') === -1 || !/require\(.*forecast-share/.test(KMFSA_SRC),
  'G11 §8 KMFSA does not depend on KMFCS at all — the dependency runs the other way');
// Nothing anywhere consumes the annual reader except FC Summary.
(function () {
  var dir = path.join(REPO, 'assets/js');
  var offenders = [];
  (function walk(d) {
    fs.readdirSync(d).forEach(function (f) {
      var p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) return walk(p);
      if (!/\.js$/.test(f)) return;
      var s = fs.readFileSync(p, 'utf8');
      if (/annualSiteShares|projectAnnual/.test(s) &&
          !/supply-planning-forecast-share\.js$|fc-summary\.js$/.test(p.replace(/\\/g, '/'))) {
        offenders.push(path.relative(REPO, p));
      }
    });
  })(dir);
  eq(offenders, [], 'G12 §8 the annual reader has exactly two call sites: its owner and FC Summary');
})();

// §15 THE LEGACY DB COLUMN.
var IMPORT_GS = read('assets/specs/active/apps-script/04_marketplace_forecast_import.gs');
ok(/fc_share/.test(IMPORT_GS),
  'G13 §15 fc_regular_forecast.fc_share is still a column the Regular writer knows about');
ok(/fc_regular_forecast: \[[^\]]*'fc_share'[^\]]*\]/.test(IMPORT_GS),
  'G13b §15 ... still a REQUIRED header in the writer\'s contract — DO NOT DROP, DO NOT RENAME');
ok(/if \(fcCol\('fc_share'\) !== -1\) newFc\[fcCol\('fc_share'\)\] = '';/.test(IMPORT_GS),
  'G13c §15 ... created as EMPTY on insert');
ok(/fc_share and created_at are absent by/.test(IMPORT_GS),
  'G13d §15 ... and deliberately untouched on update — LEGACY_FC_SHARE_DB_WRITES = 0');
ok(!/fc_share['"]?\s*[:=]\s*(?!'')[^,;\s]/.test(IMPORT_GS.replace(/fc_share: ''/g, '')),
  'G14 §15 nothing computes or populates it');
ok(SHARE.indexOf('fc_share') > -1 && /LEGACY column/.test(SHARE),
  'G15 §15 KMFCS records that it is legacy and NOT the source of truth for anything');

// =======================================================================================================
section('H — §9/§12/§16 THE PAGE SEAM, EXECUTED');
// =======================================================================================================

// §7 NO PLANNING MONTH CONTROL.
ok(!/planning-month|planningMonth|fc-planning-month/i.test(HTML),
  'H1 §7 PLANNING_MONTH_CONTROL_ADDED = NO');
ok(FCS.indexOf('_FC_SHARE_ANCHOR_') === -1,
  'H2 §7 the page no longer carries a planning anchor at all');

// §7 THE BROWSER CLOCK IS STILL REFUSED.
var seamFns = ['_fcShareYear_', '_fcAnnualShareProjections_', '_fcShareCells_', '_fcShareRowShape_',
               '_fcShareSourceRows_', '_fcShareUnavailableTitle_'];
seamFns.forEach(function (n) {
  var s = fnSrc(FCS, n);
  ok(!/new Date\(|Date\.now\(/.test(s), 'H3 §7 ' + n + ' reads no clock');
});
var SHARE_CODE = codeOnly(SHARE);
ok(SHARE_CODE.indexOf('new Date(') === -1 && SHARE_CODE.indexOf('Date.now(') === -1,
  'H4 §7 and KMFCS still contains no clock of any kind');
ok(/new Date\(\)/.test(SHARE),
  'H4b ... which its own header note says in as many words, and that note is prose, not a clock');

// §12 THE DENOMINATOR IS THE AUTHORITATIVE UNFILTERED SET.
var regRender = fnSrc(FCS, 'renderFcRegularTable');
ok(/_fcAnnualShareProjections_\(_fcShareSourceRows_\(_fcRegularSource\)/.test(regRender),
  'H5 §12 the renderer projects over the pre-filter source');
ok(!/_fcAnnualShareProjections_\(filteredData|_fcAnnualShareProjections_\(paginatedData/.test(FCS),
  'H6 §12 never over filteredData or paginatedData');
var srcIdx = regRender.indexOf('_fcRegularSource = ');
var projIdx = regRender.indexOf('_fcAnnualShareProjections_');
ok(srcIdx > -1 && projIdx > srcIdx, 'H7 §12 the projection consumes the pre-filter assignment');

// §18-26 NO PAGE-LOCAL DUPLICATE CALCULATOR.
ok(!/function calculateFcPercentages|function calculateEventFcPercentages/.test(FCS),
  'H8 §18-26 the page-local calculators are gone and did not come back');
ok(!/grandTotal\s*[+]?=|fcPercentages\[|eventFcPercentages\[/.test(FCS),
  'H9 §18-26 ... nor any of their machinery');
ok(/K\.annualSiteShares\(p, item\)/.test(fnSrc(FCS, '_fcShareCells_')),
  'H10 §10 the page reads shares from KMFCS and computes none');

// Driven: the seam, executed, with filtering and paging applied around it.
(function () {
  var box = {
    console: console, window: { KM: { forecastShare: KMFCS } }, KMFCS: KMFCS,
    _fcUseDb: function () { return false; },
    getFcFilters: function () { return box.__filters; },
    __filters: { year: '2026', companies: ['KM'], marketplaces: ['Amazon', 'Walmart'],
                 countries: ['US', 'CA'], categories: ['Can Opener'], series: ['CO'], sku: '' }
  };
  vm.createContext(box);
  ['_fcShareRowShape_', '_fcAnnualShareProjections_', '_fcShareCells_', '_fcShareSourceRows_',
   '_fcShareUnavailableTitle_', '_fcShareRuntime_', '_fcShareYear_', 'filterFcRegular']
    .forEach(function (n) { vm.runInContext(fnSrc(FCS, n), box); });
  vm.runInContext("var _FC_SHARE_MONTHS_ = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];", box);
  vm.runInContext("var _FC_SHARE_DASH_ = '\\u2014';", box);
  vm.runInContext(lineSrc(FCS, "var _FC_SHARE_TITLE_ = "), box);

  var VIEW = [
    { sku: 'GA0450', year: '2026', company: 'KM', country: 'US', marketplace: 'Amazon',
      category: 'Can Opener', series: 'CO', months: [800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800] },
    { sku: 'GA0450', year: '2026', company: 'KM', country: 'US', marketplace: 'Walmart',
      category: 'Can Opener', series: 'CO', months: [150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150] },
    { sku: 'GA0450', year: '2026', company: 'KM', country: 'CA', marketplace: 'Amazon',
      category: 'Can Opener', series: 'CO', months: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50] }
  ];
  box.__rows = VIEW;
  function cellsFor(i) {
    return JSON.parse(vm.runInContext(
      'JSON.stringify(_fcShareCells_(_fcAnnualShareProjections_(_fcShareSourceRows_(__rows), _fcShareYear_()), __rows[' + i + ']))', box));
  }
  var all = [0, 1, 2].map(cellsFor);
  eq(all.map(function (c) { return c.company; }), ['80.0%', '15.0%', '5.0%'],
    'H11 §18-13/14 three sites of one company, three distinct annual shares');
  eq(all.map(function (c) { return c.site; }), ['80.0%', '15.0%', '5.0%'],
    'H12 ... and with one company present the all-site column agrees, as it must');

  // §18-19 FILTER INDEPENDENCE. The filter is applied to the VIEW; the projection still sees everything.
  var ALL_ON = { year: '2026', companies: ['KM'], marketplaces: ['Amazon', 'Walmart'],
                 countries: ['US', 'CA'], categories: ['Can Opener'], series: ['CO'], sku: '' };
  box.__filters = ALL_ON;
  var unfilteredCount = vm.runInContext('filterFcRegular(__rows, getFcFilters()).length', box);
  eq(unfilteredCount, 3, 'H13a the fixture starts with all three rows visible');

  // Uncheck Walmart. The VIEW loses a row; the DENOMINATOR must not.
  box.__filters = { year: '2026', companies: ['KM'], marketplaces: ['Amazon'],
                    countries: ['US', 'CA'], categories: ['Can Opener'], series: ['CO'], sku: '' };
  var filtered = JSON.parse(vm.runInContext('JSON.stringify(filterFcRegular(__rows, getFcFilters()))', box));
  eq(filtered.length, 2, 'H13b ... and unchecking Walmart really does remove a row from the view');
  var filteredCells = JSON.parse(vm.runInContext(
    'var f = filterFcRegular(__rows, getFcFilters());' +
    'JSON.stringify(_fcShareCells_(_fcAnnualShareProjections_(_fcShareSourceRows_(__rows), _fcShareYear_()), f[0]))', box));
  eq(filteredCells.company, '80.0%',
    'H13 §18-19 FILTER_INDEPENDENT — the Amazon row is still 80.0%, not 800/850');

  // §18-20 PAGINATION INDEPENDENCE.
  box.__filters = ALL_ON;
  // A page size of one: the third row is ALONE on its page and sees neither of the others.
  var pagedCells = JSON.parse(vm.runInContext(
    'var f = filterFcRegular(__rows, getFcFilters());' +
    'var page = f.slice(2, 3);' +
    'JSON.stringify(_fcShareCells_(_fcAnnualShareProjections_(_fcShareSourceRows_(__rows), _fcShareYear_()), page[0]))', box));
  eq(pagedCells.company, '5.0%',
    'H14 §18-20 PAGINATION_INDEPENDENT — a row alone on page 2 keeps its share of the WHOLE set');

  // §18-18 changing the YEAR changes the basis, through the page seam.
  box.__filters = { year: '2027', companies: ['KM'], marketplaces: ['Amazon', 'Walmart'],
                    countries: ['US', 'CA'], categories: ['Can Opener'], series: ['CO'], sku: '' };
  eq(cellsFor(0).company, '—',
    'H15 §18-18 selecting a year with no rows yields an em dash, not a stale number');

  // §14 no year selected at all.
  box.__filters = { year: '', companies: ['KM'], marketplaces: ['Amazon', 'Walmart'],
                    countries: ['US', 'CA'], categories: ['Can Opener'], series: ['CO'], sku: '' };
  eq(cellsFor(0), { company: '—', site: '—' },
    'H16 §14 with no year selected both columns are unavailable');
  var t = vm.runInContext('_fcShareUnavailableTitle_(_fcAnnualShareProjections_(__rows, _fcShareYear_()))', box);
  ok(/diagnostic only/.test(t) && /never substituted/.test(t),
    'H17 §9 the unavailable title still carries the mandatory sentence AND says what was refused');
  ok(/diagnostic only/.test(vm.runInContext('_fcShareUnavailableTitle_({ available: true })', box)),
    'H18 §9 the AVAILABLE title carries it too — every share cell explains itself');
})();

// §9 THE NAMES AND THE MANDATORY TOOLTIP.
ok(/>Company Annual FC Share</.test(HTML), 'H19 §9 the company heading says "Annual"');
ok(/>All-Site Annual FC Share</.test(HTML), 'H20 §9 the all-site heading says "Annual"');
ok(!/>Site FC Share</.test(HTML), 'H21 §9 the old ambiguous "Site FC Share" is gone');
ok(!/Eligible Receiver/i.test(HTML), 'H22 §9 the UI never says Eligible Receiver');
(function () {
  var heads = HTML.match(/<div class="header-cell" title="[^"]*"[^>]*>(Company Annual FC Share|All-Site Annual FC Share)<\/div>/g) || [];
  eq(heads.length, 2, 'H23 §9 both share headings carry a title attribute');
  ok(heads.every(function (h) { return h.indexOf('Selected-year Regular Forecast share; diagnostic only.') > -1; }),
    'H24 §9 ... and both carry the MANDATORY sentence, verbatim');
  ok(heads[0].indexOf("Share of this SKU's selected-year Regular FC within the same company.") > -1,
    'H25 §9 the company tooltip is the required sentence');
  ok(heads[1].indexOf("Share of this SKU's selected-year Regular FC across all active sites.") > -1,
    'H26 §9 the all-site tooltip is the required sentence');
})();
ok(!/M\+1\.\.M\+4/.test(HTML),
  'H27 §9 no heading claims the planning window any more — that grain is not what these columns show');

// The column declaration and the stylesheet agree with the headings.
ok(/_fcResizeCols_\(150, 'Company Annual FC Share'\)/.test(FCS) &&
   /_fcResizeCols_\(150, 'All-Site Annual FC Share'\)/.test(FCS),
  'H28 the resize declaration names the shipped headings');
ok(/nth-child\(21\)[\s\S]{0,120}width: 150px/.test(CSS),
  'H29 ... and the stylesheet is wide enough to show the word "Annual" rather than ellipse it');

// §16 THE SPECIAL EVENT TABLE.
(function () {
  var evRender = fnSrc(FCS, 'renderFcEventTable');
  ok(evRender.indexOf('_fcShareCells_') === -1 && evRender.indexOf('ShareProjections_') === -1,
    'H30 §16 the Special Event table shows no share column at all');
  var evEdit = fnSrc(FCS, 'renderFcEventTableEditable');
  ok(evEdit.indexOf('_fcShareCells_') === -1,
    'H31 §16 ... and neither does its edit mode');
  ok(!/fc_special_events[\s\S]{0,200}AnnualShare|fcQty[\s\S]{0,80}Share/.test(FCS),
    'H32 §16 no annual share is computed from fc_special_events');
  var evHead = HTML.slice(HTML.indexOf('fc-event-scroll-header'));
  evHead = evHead.slice(0, evHead.indexOf('</div>\n', evHead.indexOf('FC Qty')) + 200);
  ok(evHead.indexOf('FC Share') === -1 && evHead.indexOf('占比') === -1,
    'H33 §16 the Event header carries no share cell');
})();

// =======================================================================================================
section('J — THE SPEC RECORDS THE DECISION, NOT JUST THE CODE');
// =======================================================================================================
var SPEC = read('docs/planning/FC_SUMMARY_SPEC.md');
var RULES = read('docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md');

ok(/FC_SUMMARY_SHARE_TIME_GRAIN\s*=\s*SELECTED_YEAR/.test(SPEC),
  'J1 §7 the spec states the grain');
ok(/PLANNING_MONTH_CONTROL_ADDED\s*=\s*NO/.test(SPEC),
  'J2 §7 ... and that no planning-month control was added');
ok(/ROUNDING BEFORE SHARE = NO/.test(SPEC),
  'J3 §13 ... and that the basis is raw, not the ceiled display months');
ok(/FC_SUMMARY_ANNUAL_SHARE_USED_BY_KMOOP = NO/.test(SPEC) &&
   /FC_SUMMARY_ANNUAL_SHARE_USED_BY_KMFSA = NO/.test(SPEC),
  'J4 §8 ... and that no allocator consumes it');
ok(/not the substitution/i.test(SPEC),
  'J5 §7 ... and it answers the obvious objection rather than leaving it for the next reader');
ok(/STILL no canonical planning-anchor owner/i.test(RULES) || /still no canonical planning-anchor owner/i.test(RULES),
  'J6 the rules doc records that the missing anchor owner is still missing — this round did not find one');
ok(/A THIRD SHARE EXISTS AND IT IS NOT AN ALLOCATION/.test(RULES),
  'J7 §8 ... and names the third share so nobody folds it into the other two');
ok(/fc_regular_forecast\.fc_share\s+LEGACY/.test(SPEC),
  'J8 §15 the legacy column is still recorded as legacy');
ok(/DB MIGRATION\s+NONE/.test(SPEC),
  'J9 §15 DB_MIGRATION_REQUIRED = NO, in the spec as well as in the diff');

// =======================================================================================================
section('I — DRIVEN MUTANTS. Each injects a real fault into real source and must be caught.');
// =======================================================================================================
function runFaulted(src, from, to) {
  if (src.indexOf(from) === -1) throw new Error('mutant anchor missing: ' + from.slice(0, 70));
  var coreRequire = require('module').createRequire(path.join(REPO, 'assets/js/core/x.js'));
  var box = { console: { log: function () {}, warn: function () {}, error: function () {} },
              module: { exports: {} }, require: coreRequire, globalThis: {} };
  box.window = undefined;
  vm.createContext(box);
  vm.runInContext(src.split(from).join(to), box, { filename: 'kmfcs-mutant.js' });
  return box.module.exports;
}
var SHARE_RAW = read('assets/js/core/supply-planning-forecast-share.js');

// N1 — the annual basis stops filtering by year. The 2027 rows flood the 2026 denominator.
(function () {
  var K = runFaulted(SHARE_RAW,
    "var rows = idx[fcKey(site.company, site.country, site.marketplace, site.sku, year)];\n    if (!rows || !rows.length) return { qty: 0, negative: false, matchedRows: 0 };",
    "var rows = [];\n    Object.keys(idx).forEach(function (kk) { if (kk.indexOf('|' + up(site.sku) + '|') > -1 && kk.indexOf(FSA.companyKey(site.company) + '|' + up(site.country) + '|' + low(site.marketplace) + '|') === 0) rows = rows.concat(idx[kk]); });\n    if (!rows.length) return { qty: 0, negative: false, matchedRows: 0 };");
  var p = K.projectAnnual({ sku: 'CO1100-R', year: 2026, forecastRows: ROWS });
  var s = K.annualSiteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' });
  mutant('N1 §18-18 the annual basis ignores the selected year, pulling another year in',
    Math.abs((s.companyAnnualShare || 0) - 1200 / 2100) > 1e-9);
})();

// N2 — the annual basis sums only ONE month instead of twelve.
(function () {
  var K = runFaulted(SHARE_RAW,
    'for (var j = 0; j < MONTH_KEYS.length; j++) { total += numOr0(rows[i][MONTH_KEYS[j]]); }',
    'total += numOr0(rows[i][MONTH_KEYS[0]]);');
  var p = K.projectAnnual({ sku: 'CO1100-R', year: 2026, forecastRows: ROWS });
  mutant('N2 §13 the annual basis stops being the whole year',
    p.denominators.allSites !== 3900);
})();

// N3 — the company denominator becomes company+COUNTRY, the KMAF grouping. KM/US would read 100%.
(function () {
  var K = runFaulted(SHARE_RAW,
    "      var ck = FSA.companyKey(row.site.company);\n      byCompanyKey[ck] = (byCompanyKey[ck] || 0) + row.basis;\n      allSites += row.basis;\n    });\n\n    var bySite = {};\n    sites.slice().sort(byKeyAsc).forEach(function (row) {",
    "      var ck = FSA.companyKey(row.site.company) + '|' + up(row.site.country);\n      byCompanyKey[ck] = (byCompanyKey[ck] || 0) + row.basis;\n      allSites += row.basis;\n    });\n\n    var bySite = {};\n    sites.slice().sort(byKeyAsc).forEach(function (row) {");
  var p = K.projectAnnual({ sku: 'CO1100-R', year: 2026, forecastRows: ROWS });
  var s = K.annualSiteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' });
  mutant('N3 §7 the company denominator narrows to company+country (KMAF\'s grouping, not this one)',
    Math.abs((s.companyAnnualShare || 0) - 1200 / 2100) > 1e-9);
})();

// N4 — the all-site denominator becomes the company denominator. The two columns collapse into one.
(function () {
  var K = runFaulted(SHARE_RAW,
    '      var allShare = ratio(row.basis, allSites);\n      if (companyShare === null) {',
    '      var allShare = companyShare;\n      if (companyShare === null) {');
  var p = K.projectAnnual({ sku: 'CO1100-R', year: 2026, forecastRows: ROWS });
  var s = K.annualSiteShares(p, { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' });
  mutant('N4 §7 the all-site column stops having its own denominator',
    Math.abs((s.allSiteAnnualShare || 0) - 1200 / 3900) > 1e-9);
})();

// N5 — the zero-denominator guard starts returning an equal split.
(function () {
  var K = runFaulted(SHARE_RAW, '    if (!(d > 0)) return null;', '    if (!(d > 0)) return 1;');
  var p = K.projectAnnual({ sku: 'Z', year: 2026,
    forecastRows: [row('KM', 'US', 'Amazon', 'Z', 2026, 0), row('KM', 'CA', 'Amazon', 'Z', 2026, 0)] });
  var s = K.annualSiteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'Z' });
  mutant('N5 §14 an undefined distribution becomes a fabricated 100%', s.companyAnnualShare !== null);
})();

// N6 — the year stops being validated, so a garbage year silently projects an empty basis as real.
(function () {
  var K = runFaulted(SHARE_RAW, "    if (!/^\\d{4}$/.test(rawY)) {", '    if (false) {');
  var p = K.projectAnnual({ sku: 'CO1100-R', year: 'last year', forecastRows: ROWS });
  mutant('N6 §14 a malformed year is accepted instead of typed INVALID',
    p.year.state !== 'VALID' ? false : true);
})();

// N7 — the missing-year site stops being REPORTED. A silent zero becomes indistinguishable from a real one.
(function () {
  var K = runFaulted(SHARE_RAW,
    "      if (b.matchedRows === 0) {\n        issue('SITE_ANNUAL_FORECAST_MISSING', row.key,",
    "      if (false) {\n        issue('SITE_ANNUAL_FORECAST_MISSING', row.key,");
  var p = K.projectAnnual({ sku: 'CO1100-R', year: 2026, forecastRows: ROWS,
    sites: [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' },
            { company: 'KM', country: 'DE', marketplace: 'Amazon', sku: 'CO1100-R' }] });
  mutant('N7 §14 a site with no row for the year stops being reported as missing',
    !p.issues.some(function (i) { return i.code === 'SITE_ANNUAL_FORECAST_MISSING'; }));
})();

// N8 — the annual result starts exposing the ROLLING field name, which is how an allocator would
// silently begin weighting on a calendar year.
(function () {
  var K = runFaulted(SHARE_RAW,
    '        companyAnnualShare: companyShare,\n        allSiteAnnualShare: allShare',
    '        companyAnnualShare: companyShare,\n        companyForecastShare: companyShare,\n        allSiteAnnualShare: allShare');
  var p = K.projectAnnual({ sku: 'CO1100-R', year: 2026, forecastRows: ROWS });
  mutant('N8 §8 the annual projection starts answering to the ROLLING field name',
    p.bySite[Object.keys(p.bySite)[0]].companyForecastShare !== undefined);
})();

// N9 — the grain marker lies.
(function () {
  var K = runFaulted(SHARE_RAW, "  var GRAIN_ANNUAL_ = 'SELECTED_YEAR';", "  var GRAIN_ANNUAL_ = 'ROLLING_M1_M4';");
  var p = K.projectAnnual({ sku: 'CO1100-R', year: 2026, forecastRows: ROWS });
  mutant('N9 §8 the annual projection claims the rolling grain', p.grain !== 'SELECTED_YEAR');
})();

// N10 — site identity loses the country, restoring the collision this whole line of work began with.
(function () {
  var K = runFaulted(SHARE_RAW,
    "  function fcKey(company, country, marketplace, sku, year) {\n    return FSA.companyKey(company) + '|' + up(country) + '|' + low(marketplace) + '|' + up(sku) + '|' + str(year);",
    "  function fcKey(company, country, marketplace, sku, year) {\n    return FSA.companyKey(company) + '|' + low(marketplace) + '|' + up(sku) + '|' + str(year);");
  var p = K.projectAnnual({ sku: 'CO1100-R', year: 2026, forecastRows: ROWS });
  var us = K.annualSiteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' });
  mutant('N10 §11 country leaves the basis key and KM/US, KM/CA, KM/JP collapse again',
    Math.abs((us.companyAnnualShare || 0) - 1200 / 2100) > 1e-9);
})();

// N11 — the negative clamp is removed. It poisons the DENOMINATOR, not the numerator: `ratio` already
// guards [0,1] independently, so the visible fault is every SIBLING's share inflating.
(function () {
  var K = runFaulted(SHARE_RAW, '      row.basis = b.negative ? 0 : b.qty;\n      row.matchedRows = b.matchedRows;',
    '      row.basis = b.qty;\n      row.matchedRows = b.matchedRows;');
  var p = K.projectAnnual({ sku: 'N', year: 2026,
    forecastRows: [row('KM', 'US', 'Amazon', 'N', 2026, -50), row('KM', 'CA', 'Amazon', 'N', 2026, 100)] });
  var ca = K.annualSiteShares(p, { company: 'KM', country: 'CA', marketplace: 'Amazon', sku: 'N' });
  // clamped: 1200 / (0 + 1200) = 1.0 ; unclamped: 1200 / (-600 + 1200) = 2.0 -> clipped to 1 by ratio,
  // so the DENOMINATOR is what moves and the assertion names that.
  mutant('N11 §14 the negative clamp is removed and the DENOMINATOR is poisoned',
    p.denominators.allSites !== 1200);
})();

// N12 — `_fcResetSecondaryCache` starts trusting the receipt LIST instead of the store's answer.
(function () {
  var box = buildBox();
  var faulted = fnSrc(FCS, '_fcReconcileFromReceipts_')
    .split('for (var i = 0; i < list.length; i++) { if (!rc(table, list[i])) { ok = false; break; } }')
    .join('/* mutant: the store is not asked */');
  vm.runInContext(faulted, box);
  var r = vm.runInContext('_fcReconcileFromReceipts_({ receiptRows: { campaigns: [{ campaign_id: "" }] } })', box);
  mutant('N12 §4 a receipt is trusted without the owning store accepting it',
    JSON.stringify(r) !== '[]');
})();

// N13 — the warm-up latches its tables BEFORE the read resolves.
(function () {
  var box = buildBox({ failRefresh: true });
  var faulted = fnSrc(FCS, '_fcPostWriteWarm_')
    .split('  return Promise.resolve(rc(need)).then(function () {')
    .join('  need.forEach(function (t) { _fcPrereqLoadedTables_[t] = true; });\n  return Promise.resolve(rc(need)).then(function () {');
  vm.runInContext(faulted, box);
  return vm.runInContext('_fcPostWriteWarm_({ slice: "events" })', box).then(function () {
    var latched = vm.runInContext('Object.keys(_fcPrereqLoadedTables_)', box);
    mutant('N13 §4 the warm-up marks tables CURRENT before (or despite) the read failing',
      latched.indexOf('campaign_sku_lines') !== -1);
    finish();
  });
})();

function finish() {
  // N14 — the path latch is asserted rather than derived, so a half-warm path reads as warm.
  (function () {
    var box = buildBox();
    var faulted = fnSrc(FCS, '_fcPostWriteWarm_')
      .split('      if (!_fcPrereqMissing_(p).length) _fcPrereqLoadedPaths_[p] = true;')
      .join('      _fcPrereqLoadedPaths_[p] = true;');
    vm.runInContext(faulted, box);
    vm.runInContext('_fcPrereqLoadedTables_ = {};', box);
    vm.runInContext('_fcPostWriteWarm_({ slice: "events" })', box);
    // only the events tables were warmed; sku_details / marketplace_skus / pricing_list are still cold,
    // so the event PATH must not be latched.
    setTimeout(function () {
      var paths = vm.runInContext('Object.keys(_fcPrereqLoadedPaths_)', box);
      mutant('N14 §4 a path is latched while tables it holds are still cold', paths.indexOf('event') !== -1);
      more();
    }, 10);
  })();
}

function more() {
  // N15 — the prerequisite list regains `fc_regular_forecast`. THE original blocker, restored.
  (function () {
    var box = buildBox();
    vm.runInContext('_FC_PREREQ_TABLES_.regular = ["sku_details", "marketplace_skus", "fc_regular_forecast"];', box);
    CALLS = [];
    vm.runInContext('_fcLoadPrerequisites_("regular")', box).then(function () {
      var n = reads();
      var asked = CALLS.length ? CALLS[0].indexOf('fc_regular_forecast') !== -1 : false;
      mutant('N15 §2 fc_regular_forecast returns to the Regular prerequisites and Next fetches it again',
        n !== 2 && asked === true);
      n16();
    });
  })();

  // N16 — the reconcile stops being honoured, so a COMPLETE receipt is thrown away and the table
  //       is re-read. The operator waits for a fact the server already handed over.
  function n16() {
    var box = buildBox();
    var faulted = fnSrc(FCS, '_fcResetSecondaryCache')
      .split('tables.forEach(function (t) { if (reconciled.indexOf(t) === -1) delete _fcPrereqLoadedTables_[t]; });')
      .join('tables.forEach(function (t) { delete _fcPrereqLoadedTables_[t]; });');
    vm.runInContext(faulted, box);
    vm.runInContext('_fcLoadPrerequisites_("event")', box).then(function () {
      vm.runInContext('_fcResetSecondaryCache(' + RECEIPT + ')', box);
      CALLS = [];
      return vm.runInContext('_fcPostWriteWarm_(' + RECEIPT + ')', box);
    }).then(function () {
      mutant('N16 §4 a complete receipt is discarded and its table is bought a second time',
        reads() !== 2 && CALLS.length > 0 && CALLS[0].indexOf('campaigns') !== -1);
      n17();
    });
  }

  // N17 — the in-save warm-up is removed. The reopen pays for the same truth again, which is the
  //       ~15 s block the operator reported.
  function n17() {
    var box = buildBox();
    var faulted = fnSrc(FCS, '_fcPostWriteWarm_')
      .split('function _fcPostWriteWarm_(scope) {')
      .join('function _fcPostWriteWarm_(scope) { if (true) return Promise.resolve([]);');
    vm.runInContext(faulted, box);
    vm.runInContext('_fcLoadPrerequisites_("event")', box).then(function () {
      vm.runInContext('_fcResetSecondaryCache(' + RECEIPT + ')', box);
      return vm.runInContext('_fcPostWriteWarm_(' + RECEIPT + ')', box);
    }).then(function () {
      CALLS = [];
      return vm.runInContext('_fcLoadPrerequisites_("event")', box);
    }).then(function () {
      mutant('N17 §17 the post-write warm-up is removed and the REOPEN blocks on reads again',
        reads() !== 0);
      n18();
    });
  }

  // N18 — the page seam projects over the FILTERED rows. This is the defect R1 removed, restored,
  //       and it is invisible unless a filter actually removes a row.
  function n18() {
    var box = {
      console: { log: function () {} }, window: { KM: { forecastShare: KMFCS } }, KMFCS: KMFCS,
      _fcUseDb: function () { return false; },
      getFcFilters: function () { return box.__filters; },
      __filters: { year: '2026', companies: ['KM'], marketplaces: ['Amazon'],
                   countries: ['US', 'CA'], categories: ['Can Opener'], series: ['CO'], sku: '' }
    };
    vm.createContext(box);
    ['_fcShareRowShape_', '_fcAnnualShareProjections_', '_fcShareCells_', '_fcShareSourceRows_',
     '_fcShareRuntime_', '_fcShareYear_', 'filterFcRegular']
      .forEach(function (n) { vm.runInContext(fnSrc(FCS, n), box); });
    vm.runInContext("var _FC_SHARE_MONTHS_ = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];", box);
    vm.runInContext("var _FC_SHARE_DASH_ = '\u2014';", box);
    box.__rows = [
      { sku: 'GA0450', year: '2026', company: 'KM', country: 'US', marketplace: 'Amazon',
        category: 'Can Opener', series: 'CO', months: [800,800,800,800,800,800,800,800,800,800,800,800] },
      { sku: 'GA0450', year: '2026', company: 'KM', country: 'US', marketplace: 'Walmart',
        category: 'Can Opener', series: 'CO', months: [150,150,150,150,150,150,150,150,150,150,150,150] },
      { sku: 'GA0450', year: '2026', company: 'KM', country: 'CA', marketplace: 'Amazon',
        category: 'Can Opener', series: 'CO', months: [50,50,50,50,50,50,50,50,50,50,50,50] }
    ];
    // THE MUTANT: the projection is handed the filtered view instead of the source.
    var got = JSON.parse(vm.runInContext(
      'var f = filterFcRegular(__rows, getFcFilters());' +
      'JSON.stringify(_fcShareCells_(_fcAnnualShareProjections_(_fcShareSourceRows_(f), _fcShareYear_()), f[0]))', box));
    mutant('N18 §12 the projection is handed the FILTERED rows and the denominator follows the filter',
      got.company !== '80.0%');
    report();
  }
}

function report() {
  var W = 100;
  console.log('\n' + new Array(W + 1).join('='));
  console.log('FC STABILITY + ANNUAL SHARE (R2) — passed ' + pass + '  failed ' + fail
    + '  |  mutants ' + mutants.length + '  survived ' + survived.length);
  console.log(new Array(W + 1).join('='));
  if (survived.length) survived.forEach(function (s) { console.error('  SURVIVED: ' + s); });
  process.exit(fail ? 1 : 0);
}

}
