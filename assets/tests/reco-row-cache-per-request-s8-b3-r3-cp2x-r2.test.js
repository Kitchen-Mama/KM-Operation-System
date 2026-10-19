// Kitchen Mama Operation System — S8-B3-R3-CP2X-R2 §D
// THE PER-SKU HELPERS NOW SHARE THE PER-REQUEST ROW CACHE: SAME OUTPUT, FEWER CONVERSIONS.
//
// Run: node assets/tests/reco-row-cache-per-request-s8-b3-r3-cp2x-r2.test.js
//
// LOCAL / OFFLINE. No network, no DB, no SpreadsheetApp, no writes.
//
// WHAT THIS PROVES, AND WHY THIS SHAPE. CP2X-R1 found that the three per-SKU helpers in 42_
// (recoWsResolvePlanningModel_, recoWsBuildContaminationFacts_, recoWsResolveSalesRate_) hold a bare
// `snaps` object and so cannot reach `recoWsRows_`, the per-request row-object cache that already
// exists two hundred lines below them. The recommendation runtime loops once PER SKU, so every SKU
// re-materialized whole tables that are CONSTANT across the loop — measured offline at 240 conversions,
// 1,296,000 row objects and 963 ms for one table. CP2X-R1's first attempt memoised on the snapshot
// object instead; that broke the per-request isolation guard in api-recommendation-reuse-map-f1-7m-e-r1
// and was withdrawn (D-S8-B3-144). CP2X-R2 takes the other route: thread `read` through, and use the
// cache that was built for exactly this and is keyed per REQUEST.
//
// THE BASELINE IS BUILT BY INVERTING THE EDIT, not by pinning a copy of the old file. `oldify()` rewrites
// every `recoWsRows_(read, 'X')` back into `recoWsToRowObjects_((read.snapshots || {}).X)` — the exact
// inverse of the change — and the OLD-shaped functions are compiled from it. So the two sides under
// comparison are the shipped code and the shipped code with this round's edit undone. A pinned copy
// would freeze and stop testing anything; this cannot, because it is derived from the file every run.
//
// WHAT IS NOT CLAIMED. The millisecond figures here are offline, on this machine, against a fixture.
// They are a CONVERSION COUNT argument, not a production duration, and nothing below reports a time.
'use strict';
var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');

var pass = 0, fail = 0;
function ok(c, m, d) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

// --- the inverse of this round's edit -------------------------------------------------------------
function oldify(src) {
  return src.replace(/recoWsRows_\(read, '([A-Za-z0-9_]+)'\)/g,
    "recoWsToRowObjects_((read.snapshots || {}).$1)");
}

// --- compile both shapes, each with its own conversion counter -------------------------------------
function build(src) {
  var box = { conversions: 0 };
  var instrumented = src.replace('function recoWsToRowObjects_(snap) {',
    'function recoWsToRowObjects_(snap) { __box.conversions++;');
  new Function('__box', BUNDLE + '\n' + instrumented
    + '\n__box.planModel = recoWsResolvePlanningModel_;'
    + '\n__box.contam = recoWsBuildContaminationFacts_;'
    + '\n__box.rate = recoWsResolveSalesRate_;'
    + '\n__box.rows = recoWsRows_;')(box);
  return box;
}
var NEW = build(F42);
var OLD = build(oldify(F42));

// --- one fixture, used by both ----------------------------------------------------------------------
function snap(headers, rows) { return { headers: headers, rows: rows }; }
var SCOPE = { company: 'KM', country: 'US', marketplace: 'Amazon' };
var CALC = '2026-08-07';
var SKUS = [];
for (var i = 0; i < 24; i++) SKUS.push('CO' + (1100 + i) + '-R');
var DATES = [];
for (var d = 1; d <= 30; d++) DATES.push('2026-07-' + (d < 10 ? '0' + d : d));

var mskHdr = ['company', 'country', 'marketplace', 'sku', 'marketplace_sku_id', 'replenishment_model'];
var dsHdr = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units'];
var wkHdr = ['snapshot_week', 'week_end_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units_7d'];
var CAMP_H = ['campaign_id', 'company', 'country', 'marketplace', 'marketplace_id', 'start_date', 'end_date', 'status'];
var CSL_H = ['campaign_sku_line_id', 'campaign_id', 'marketplace_sku_id', 'sku'];
var EVT_H = ['event_fc_id', 'company', 'country', 'marketplace', 'marketplace_id', 'sku', 'event_start_date', 'event_end_date', 'status', 'fc_qty'];
var MKT_H = ['marketplace_id', 'company', 'country', 'marketplace'];

function fixture() {
  var msk = SKUS.map(function (s, n) {
    return ['KM', 'US', 'Amazon', s, 'MSK-' + n, (n % 3 === 0) ? 'forecast_driven' : (n % 7 === 0 ? '' : 'sales_driven')];
  });
  var daily = [];
  SKUS.forEach(function (s, n) {
    DATES.forEach(function (dt) { daily.push([dt, 'US', 'Amazon', 'amazon.com', s, 50 + n + dt.charCodeAt(9)]); });
  });
  var weekly = SKUS.map(function (s, n) { return ['2026-W31', '2026-08-02', 'US', 'Amazon', 'amazon.com', s, 300 + n]; });
  // one live campaign and one event, each touching a subset, so the contamination marshaller does work
  var camps = [['CMP-1', 'KM', 'US', 'Amazon', 'MP1', '2026-07-10', '2026-07-14', 'active']];
  var lines = SKUS.filter(function (_, n) { return n % 4 === 0; })
    .map(function (s, k) { return ['CSL-' + k, 'CMP-1', 'MSK-' + (k * 4), s]; });
  var evts = SKUS.filter(function (_, n) { return n % 5 === 0; })
    .map(function (s, k) { return ['EV-' + k, 'KM', 'US', 'Amazon', 'MP1', s, '2026-07-18', '2026-07-19', 'active', 10]; });
  return { snapshots: {
    marketplaceSkus: snap(mskHdr, msk),
    amazonDailySalesSnapshot: snap(dsHdr, daily),
    amazonWeeklySalesSnapshot: snap(wkHdr, weekly),
    campaigns: snap(CAMP_H, camps),
    campaignSkuLines: snap(CSL_H, lines),
    fcSpecialEvents: snap(EVT_H, evts),
    marketplaces: snap(MKT_H, [['MP1', 'KM', 'US', 'Amazon']])
  } };
}

/** One REQUEST: a single `read`, looped over every SKU, exactly as the runtime loops. */
function runRequest(H, box) {
  box.conversions = 0;
  var rd = fixture(), out = [];
  SKUS.forEach(function (sku) {
    out.push({ sku: sku, model: H.planModel(rd, SCOPE, sku),
      rate: H.rate(rd, SCOPE, sku, CALC),
      contam: H.contam(rd, SCOPE, sku, 'MSK-0') });
  });
  return { out: out, conversions: box.conversions };
}

// ---------------------------------------------------------------------------------------------------
section('A. both shapes exist and are the shipped code, not a model of it');

ok(typeof NEW.rate === 'function' && typeof OLD.rate === 'function', 'A1  both shapes compiled');
ok(/recoWsRows_\(read, 'marketplaceSkus'\)/.test(F42),
  'A2  the SHIPPED file reaches the per-request cache by key');
ok(!/recoWsRows_\(read, '/.test(oldify(F42)),
  'A3  and the inverted baseline has none of them left — the two sides really differ');
ok(/recoWsToRowObjects_\(\(read\.snapshots \|\| \{\}\)\.marketplaceSkus\)/.test(oldify(F42)),
  'A4  the baseline converts straight from the snapshot, which is what it did before this round');
eq(SKUS.length, 24, 'A5  the loop is over 24 SKUs, so a per-SKU cost is visible rather than rounding');

// ---------------------------------------------------------------------------------------------------
section('B. OUTPUT EQUIVALENCE — the same request produces the same answers');

var rNew = runRequest(NEW, NEW);
var rOld = runRequest(OLD, OLD);
eq(rNew.out.length, SKUS.length, 'B1  every SKU produced an answer');
eq(JSON.stringify(rNew.out) === JSON.stringify(rOld.out), true,
  'B2  the NEW and OLD shapes agree on ALL of planning model, sales rate and contamination facts, for every SKU');
// non-vacuity: the fixture has to actually produce varied, substantive answers
var models = {}; rNew.out.forEach(function (r) { models[r.model] = 1; });
ok(Object.keys(models).length >= 2, 'B2a the fixture exercises more than one planning model', Object.keys(models));
var okRates = rNew.out.filter(function (r) { return r.rate && r.rate.ok === true; });
ok(okRates.length >= 20, 'B2b and most SKUs resolve a real rate rather than all failing identically', okRates.length);
ok(okRates.some(function (r) { return typeof r.rate.avgSalesPerDay === 'number' && r.rate.avgSalesPerDay > 0; }),
  'B2c with a non-zero rate, so B2 is comparing numbers and not a row of identical refusals');
var withCamp = rNew.out.filter(function (r) { return r.contam && r.contam.campaigns.length > 0; });
ok(withCamp.length >= 1, 'B2d and the contamination marshaller returned campaigns for at least one SKU', withCamp.length);

// ---------------------------------------------------------------------------------------------------
section('C. CONVERSION COUNT — the whole point of the change');

ok(rOld.conversions > rNew.conversions,
  'C1  the shipped shape converts FEWER tables than the baseline', { old: rOld.conversions, now: rNew.conversions });
// The baseline re-materializes on every call; the shipped shape materializes each table once per READ.
var distinctTables = 7;
ok(rNew.conversions <= distinctTables,
  'C2  and converts each table AT MOST ONCE for the whole request', rNew.conversions);
ok(rOld.conversions >= SKUS.length * 4,
  'C3  where the baseline converted at least four tables PER SKU', rOld.conversions);
ok(rOld.conversions / rNew.conversions >= 10,
  'C4  a reduction of more than ten times over this request',
  { old: rOld.conversions, now: rNew.conversions, ratio: +(rOld.conversions / rNew.conversions).toFixed(1) });
console.log('     conversions: baseline ' + rOld.conversions + ' -> shipped ' + rNew.conversions
  + '  (' + SKUS.length + ' SKUs, one request)');

// ---------------------------------------------------------------------------------------------------
section('D. THE CACHE IS PER REQUEST, and the guard the withdrawn memo broke still holds');

var shared = fixture().snapshots;
var readA = { snapshots: shared }, readB = { snapshots: shared };
var a1 = NEW.rows(readA, 'marketplaceSkus');
var a2 = NEW.rows(readA, 'marketplaceSkus');
ok(a1 === a2, 'D1  within ONE read the array is shared — that is the saving');
var b1 = NEW.rows(readB, 'marketplaceSkus');
ok(b1 !== a1, 'D2  a DIFFERENT read over the SAME snapshots object gets its OWN array');
ok(JSON.stringify(b1) === JSON.stringify(a1) && b1.length === 24,
  'D2a with an identical VALUE and all 24 rows — isolation, not divergence', b1.length);
ok(Object.prototype.hasOwnProperty.call(readA, '__rowCache'),
  'D3  the memo lives on the read');
ok(!Object.prototype.hasOwnProperty.call(shared, '__rowCache')
   && !Object.prototype.hasOwnProperty.call(shared.marketplaceSkus, '__rowCache')
   && !Object.prototype.hasOwnProperty.call(shared.marketplaceSkus, '__ro'),
  'D4  and NOTHING was attached to the snapshots object or to a snapshot — the withdrawn memo stays withdrawn');
eq(NEW.rows({ snapshots: {} }, 'nothingHere'), [],
  'D5  a table absent from the read is [] — identical to converting undefined');
eq(NEW.rows({}, 'nothingHere'), [], 'D5a and so is a read with no snapshots at all');

// ---------------------------------------------------------------------------------------------------
section('E. no new sharing escapes the request');

ok(!/__rowCache/.test(BUNDLE), 'E1  the row cache exists only in 42_, not in the generated bundle');
var globals = F42.match(/^var reco\w*Cache\w*/gm) || [];
eq(globals.length, 0, 'E2  42_ declares no module-level cache for row objects', globals);
ok(!/snap\.__ro|snaps\.__ro|snapshot\.__ro/.test(F42),
  'E3  and nothing is memoised on a snapshot object');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
