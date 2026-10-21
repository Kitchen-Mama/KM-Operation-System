// Kitchen Mama Operation System - S8-B3-R3-CP2R
// AVG SALES: MARKETPLACE-SKU IDENTITY, AND A BASIS THAT MUST SURVIVE A BLOCKED HORIZON
//
// Run: node assets/tests/avg-sales-identity-and-blocked-horizon-s8-b3-r3-cp2r.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes. Every fixture is local to this file.
//
// TWO DEFECTS, BOTH IN 42_, BOTH UPSTREAM OF A FROZEN AND CORRECT OWNER.
//
// 1. IDENTITY. `recoWsResolveSalesRate_` resolves the scope marketplace_sku_id out of `marketplace_skus`
//    by sku + country + marketplace and takes the FIRST row that matches. `company` is not consulted.
//    DATABASE_RELATIONSHIP_MAP says company on that table is REQUIRED and that company + country +
//    marketplace is what distinguishes operational ownership; the sibling reader `recoWsSiteSkuBySku_`
//    in this same file already matches on all three. So when KM and ResUS both sell one master SKU into
//    US / Amazon, the id handed to KMCALC is decided by SHEET ROW ORDER. KMCALC then isolates campaign
//    contamination by that id exactly as documented - it is obeying an identity resolved wrongly before
//    it was ever called. Section A executes both row orders and compares.
//
// 2. A BASIS THAT DISAPPEARS WITH THE HORIZON. `mLine.horizonBasis` - which carries avgSalesPerDay and
//    the four section 22 quality fields - is assigned INSIDE `if (mHz)`. A line whose day-horizon could
//    not be built publishes no basis at all, so a valid historical average is withheld for a reason that
//    has nothing to do with sales history. Section C executes the real statements from the shipped file.
//
// WHAT THIS SUITE DOES NOT DO: it does not re-implement the averaging rule. KMCALC is required and RUN,
// so every rate here is arithmetic the shipped owner produced.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var KMCALC = require('../js/core/supply-planning-calculations.js');
var KMCID = require('../js/core/supply-planning-country-identity.js');
var RO = require('./_release-order.js');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var GS = path.join(ROOT, 'assets/specs/active/apps-script/');
var RECO = fs.readFileSync(GS + '42_api_v1_recommendation_workspace.gs', 'utf8');

// Pull a top-level function out of the shipped file by name, braces balanced. The suite runs the REAL
// statements; it never retypes them.
function extractFn(src, name) {
  var i = src.indexOf('\nfunction ' + name + '(');
  if (i === -1) throw new Error('function not found: ' + name);
  var start = i + 1;
  var depth = 0, inStr = null;
  for (var k = src.indexOf('{', start); k < src.length; k++) {
    var ch = src[k], prev = src[k - 1];
    if (inStr) { if (ch === inStr && prev !== '\\') inStr = null; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '/' && src[k + 1] === '/') { k = src.indexOf('\n', k); if (k === -1) break; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, k + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// ---------------------------------------------------------------------------------------------------
// The sandbox: the REAL resolver + the REAL contamination builder + the REAL row helpers, over the REAL
// KMCALC and KMCID owners. Only the Sheets snapshot shape is a fixture.
// ---------------------------------------------------------------------------------------------------
var sandbox = { KMCALC: KMCALC, KMCID: KMCID, console: console };
var ctx = vm.createContext(sandbox);
// CP2X-R2 D - recoWsRows_ joins the list because the resolver now reaches the per-request row
// cache through it. A region-sliced function may not depend on a helper the slice leaves behind, and
// this harness extracts by NAME, so the dependency is extracted the same way rather than stubbed.
['recoWsStr_', 'recoWsNum_', 'recoWsIsObj_', 'recoWsYmd_', 'recoWsToRowObjects_', 'recoWsRows_', 'recoWsCmp_',
  'recoWsBuildContaminationFacts_', 'recoWsResolveSalesRate_', 'recoWsBasisOf_'].forEach(function (fn) {
    vm.runInContext(extractFn(RECO, fn), ctx);
  });

function snap(headers, rows) { return { headers: headers, rows: rows }; }
var CALC = '2026-10-08';
function daysBack(n) { var d = new Date(CALC + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }
var KM_DAY = daysBack(1);     // the day KM ran a campaign
var RES_DAY = daysBack(2);    // the day ResUS ran a campaign

// 30 completed days of daily sales on the US / Amazon source key. The KM campaign day sells 200, the
// ResUS one sells 100, every ordinary day sells 10. The two spikes DIFFER on purpose: if both were equal
// the published rate would come out the same whichever day was wrongly excluded, and the defect would
// hide behind a number that looked right. Here the wrong exclusion is visible in the rate AND in the
// excluded-date list.
function dailyRows() {
  var rows = [];
  for (var n = 1; n <= 30; n++) {
    var d = daysBack(n);
    rows.push([d, 'SKU-A', d === KM_DAY ? 200 : (d === RES_DAY ? 100 : 10), 'US', 'Amazon', 'Amazon']);
  }
  return rows;
}
var DAILY = snap(['snapshot_date', 'sku', 'sales_units', 'country', 'marketplace', 'channel'], dailyRows());
var WEEKLY = snap(['sku', 'country', 'marketplace', 'channel', 'week_end_date', 'sales_units_7d'],
  [['SKU-A', 'US', 'Amazon', 'Amazon', daysBack(1), 70]]);

var MSK_HEADERS = ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace'];
var ROW_KM = ['MSKU-KM-US', 'SKU-A', 'KM', 'US', 'Amazon'];
var ROW_RES = ['MSKU-RES-US', 'SKU-A', 'ResUS', 'US', 'Amazon'];

var MARKETPLACES = snap(['company', 'country', 'marketplace', 'marketplace_id'],
  [['KM', 'US', 'Amazon', 'MKT-KM-US-AMAZON'], ['ResUS', 'US', 'Amazon', 'MKT-RESUS-US-AMAZON']]);

// Two campaigns, one per company, each touching ONLY its own marketplace_sku_id.
var CAMPAIGNS = snap(['campaign_id', 'status', 'start_date', 'end_date'],
  [['CMP-KM', 'active', KM_DAY, KM_DAY], ['CMP-RES', 'active', RES_DAY, RES_DAY]]);
var CAMPAIGN_LINES = snap(['campaign_id', 'marketplace_sku_id', 'sku'],
  [['CMP-KM', 'MSKU-KM-US', 'SKU-A'], ['CMP-RES', 'MSKU-RES-US', 'SKU-A']]);
var NO_EVENTS = snap(['sku', 'status', 'marketplace_id', 'company', 'country', 'marketplace', 'event_start_date', 'event_end_date'], []);

function snaps(mskRows, over) {
  var s = {
    amazonDailySalesSnapshot: DAILY, amazonWeeklySalesSnapshot: WEEKLY,
    marketplaceSkus: snap(MSK_HEADERS, mskRows), marketplaces: MARKETPLACES,
    campaigns: CAMPAIGNS, campaignSkuLines: CAMPAIGN_LINES, fcSpecialEvents: NO_EVENTS
  };
  if (over) Object.keys(over).forEach(function (k) { s[k] = over[k]; });
  return s;
}
function resolve(company, mskRows, over) {
  sandbox.__s = { snapshots: snaps(mskRows, over) };   // CP2X-R2 D - the three per-SKU helpers take `read` now, so they can reach the per-request
  // row cache (recoWsRows_). The fixture is the same; it is handed over in the envelope the
  // runtime hands over. A FRESH object per call, so no caching is shared between cases.
  sandbox.__scope = { company: company, country: 'US', marketplace: 'Amazon' };
  return vm.runInContext('recoWsResolveSalesRate_(__s, __scope, "SKU-A", "' + CALC + '")', ctx);
}

// ---------------------------------------------------------------------------------------------------
section('A  the KM / ResUS row-order swap, executed');
// ---------------------------------------------------------------------------------------------------
// ResUS asks for its own rate twice. The ONLY difference between the two runs is the order of two rows
// in marketplace_skus - a sheet detail with no business meaning. A correct resolver cannot see it.
var resFirst = resolve('ResUS', [ROW_RES, ROW_KM]);
var kmFirst = resolve('ResUS', [ROW_KM, ROW_RES]);

ok(resFirst.ok === true, 'A1  ResUS resolves a basis when its own row is first', resFirst);
ok(kmFirst.ok === true, 'A2  and when the KM row is first', kmFirst);
eq(kmFirst.avgSalesPerDay, resFirst.avgSalesPerDay,
  'A3  THE RATE IS THE SAME IN BOTH ROW ORDERS - row order is not an input to identity');
eq(kmFirst.excludedDates, resFirst.excludedDates,
  'A4  and the SAME days are excluded - a sheet re-sort cannot move a campaign between companies');

// Name the right answer rather than only demanding agreement.
eq(resFirst.excludedDates, [RES_DAY], 'A5  ResUS excludes exactly its OWN campaign day');
ok(resFirst.excludedDates.indexOf(KM_DAY) === -1,
  'A6  and never the KM day, which belongs to another company on the same country + marketplace');

var km = resolve('KM', [ROW_RES, ROW_KM]);
eq(km.excludedDates, [KM_DAY], 'A7  KM excludes exactly its OWN campaign day, in the same sheet');

// ---------------------------------------------------------------------------------------------------
section('B  the exclusion must be real, and it must be visible when it is dropped');
// ---------------------------------------------------------------------------------------------------
// 28 ordinary days at 10 plus the other company's 100 day = 29 normal days. This is what makes A5
// arithmetic rather than a restatement of itself.
eq(resFirst.avgSalesPerDay, (200 + 10 * 28) / 29,
  'B1  ResUS averages its 29 normal days - its own campaign day is out, the KM 200-unit day is still in');
ok(resFirst.source === 'normalized_30d' && !resFirst.warning,
  'B2  and it is a normalized basis, not the weekly fallback', { s: resFirst.source, w: resFirst.warning });

// S8-B3-R3-CP2R-R1 - B3..B5 USED TO BACK THE WRONG BEHAVIOUR AND ARE REPLACED.
//
// They asserted that a campaign line which cannot prove site membership makes KMCALC throw, 42_ retries
// with NO exclusions, and the SKU stays ok:true with a flag saying so. The round that wrote them treated
// "contamination must never gate READY" as the whole rule and the flag as sufficient honesty. It is not:
// an un-excluded average is NOT a normal average. It is inflated by exactly the campaign days section 22
// exists to remove, and publishing it as a legitimate rate - with the explanation parked in a metadata
// field no surface reads - is the same defect as publishing a wrong number.
//
// The disposition is now FAIL CLOSED with a NAMED quality error. What is deliberately NOT swept up with
// it: a source that is present-and-empty or genuinely absent still means "no exclusion", and the low
// sample section 22 fallback still applies. Only an UNRESOLVED IDENTITY fails.
var BROKEN_LINES = snap(['campaign_id', 'marketplace_sku_id', 'sku'],
  [['CMP-KM', '', 'SKU-A'], ['CMP-RES', 'MSKU-RES-US', 'SKU-A']]);
var degraded = resolve('ResUS', [ROW_RES, ROW_KM], { campaignSkuLines: BROKEN_LINES });
eq(degraded.ok, false, 'B3  a campaign line that cannot prove site membership FAILS CLOSED');
eq(degraded.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED',
  'B4  with a NAMED quality error, not a silently un-excluded number');
ok(degraded.avgSalesPerDay == null,
  'B5  and NO rate is published at all - an un-excluded average is not a normal average', degraded);
ok(String(degraded.detail || '').indexOf('marketplaceSkuId') !== -1,
  'B5a the detail names the real cause, carried verbatim from the owner', degraded.detail);

// A cancelled campaign removes nothing, and an overlapping pair removes its union once.
var CANCELLED = snap(['campaign_id', 'status', 'start_date', 'end_date'],
  [['CMP-KM', 'active', KM_DAY, KM_DAY], ['CMP-RES', 'cancelled', RES_DAY, RES_DAY]]);
eq(resolve('ResUS', [ROW_RES, ROW_KM], { campaigns: CANCELLED }).excludedDates, [],
  'B6  a cancelled campaign excludes nothing');
var OVERLAP = snap(['campaign_id', 'status', 'start_date', 'end_date'],
  [['CMP-KM', 'active', KM_DAY, KM_DAY], ['CMP-RES', 'active', RES_DAY, RES_DAY]]);
var EVT_SAME_DAY = snap(['sku', 'status', 'marketplace_id', 'company', 'country', 'marketplace', 'event_start_date', 'event_end_date'],
  [['SKU-A', 'active', 'MKT-RESUS-US-AMAZON', 'ResUS', 'US', 'Amazon', RES_DAY, RES_DAY]]);
eq(resolve('ResUS', [ROW_RES, ROW_KM], { campaigns: OVERLAP, fcSpecialEvents: EVT_SAME_DAY }).excludedDates, [RES_DAY],
  'B7  a campaign and an event on the SAME day exclude that day ONCE');

// Another site's event never contaminates this one.
var EVT_OTHER_SITE = snap(['sku', 'status', 'marketplace_id', 'company', 'country', 'marketplace', 'event_start_date', 'event_end_date'],
  [['SKU-A', 'active', 'MKT-KM-US-AMAZON', 'KM', 'US', 'Amazon', daysBack(3), daysBack(3)]]);
eq(resolve('ResUS', [ROW_RES, ROW_KM], { fcSpecialEvents: EVT_OTHER_SITE }).excludedDates, [RES_DAY],
  'B8  an event carrying ANOTHER site marketplace_id never removes a day from this scope');

// ---------------------------------------------------------------------------------------------------
section('C  a blocked horizon must not take the historical average with it');
// ---------------------------------------------------------------------------------------------------
// The REAL statements from the shipped file: everything from the `var mHz =` assignment through the
// horizonsBlockedReason else-branch. Executed with a stubbed horizon builder, so the only question asked
// is the one under test: what does the line publish when the horizon could not be built?
// Sliced by the two statements that BOUND the publish region, not by the shape of what is between them -
// a slice that ended at the blocked-reason branch would have stopped testing the moment the assignment moved
// out of it, which is exactly the change under test.
var R_START = RECO.indexOf('  var mHz = (planModel ===');
var REGION = RECO.slice(R_START, RECO.indexOf('return mLine;', R_START));
ok(REGION.indexOf('mLine.horizonBasis') !== -1, 'C0  the extracted region is the one that publishes the basis');

function runRegion(o) {
  var s = {
    mLine: {}, planModel: o.planModel, salesRate: o.salesRate, salesReason: o.salesReason || null,
    sr: o.sr, horizonOpening: o.horizonOpening, mIncoming: o.mIncoming || [],
    calc: {}, fcRows: [], tgtRows: [], evtRows: [], skuMeta: {}, scope: {}, sku: 'SKU-A', upc: 1,
    nd: { destination: 'D' }, KMDR: {},
    recoWsNum_: function (v) { return (v === '' || v === null || v === undefined) ? null : (isFinite(Number(v)) ? Number(v) : null); },
    recoWsBuildHorizons_: function () { return o.horizons; }
  };
  // CP2S-R1 - the region now CALLS the shared basis builder instead of writing an object literal, so the
  // REAL builder is loaded into the region's own sandbox. Stubbing it would have turned an execution test
  // back into a text test at the exact statement this section exists to execute.
  vm.runInNewContext(extractFn(RECO, 'recoWsBasisOf_') + ';' + REGION, s);
  return s.mLine;
}
var GOOD_SR = {
  ok: true, avgSalesPerDay: 12.5, source: 'normalized_30d', warning: '', normalDayCount: 29,
  excludedDates: [RES_DAY], contaminationApplied: true, contaminationSource: { campaigns: 'PRESENT', events: 'PRESENT' }
};

var built = runRegion({ planModel: 'forecast_driven', salesRate: null, sr: GOOD_SR, horizonOpening: 50, horizons: [{ d: 18 }] });
ok(!!built.horizonBasis, 'C1  a line WITH a horizon publishes the basis (unchanged behaviour)');
eq(built.horizonBasis && built.horizonBasis.avgSalesPerDay, 12.5, 'C2  carrying the resolved rate verbatim');

var blocked = runRegion({ planModel: 'forecast_driven', salesRate: null, sr: GOOD_SR, horizonOpening: null, horizons: null });
eq(blocked.horizonsBlockedReason, 'HORIZON_PROJECTION_UNAVAILABLE', 'C3  a line with NO horizon reports why');
ok(!!blocked.horizonBasis,
  'C4  AND STILL PUBLISHES THE BASIS - a blocked horizon is not a statement about sales history');
eq(blocked.horizonBasis && blocked.horizonBasis.avgSalesPerDay, 12.5,
  'C5  with the same rate the horizon-built line would have carried');
eq(blocked.horizonBasis && blocked.horizonBasis.normalDayCount, 29,
  'C6  and the quality fields travel with it, so a low sample stays visible');
eq(blocked.horizonBasis && blocked.horizonBasis.source, 'normalized_30d', 'C7  including source');

// An UNRESOLVED basis must stay null everywhere. Publishing the object must never fabricate a 0.
var noBasis = runRegion({
  planModel: 'sales_driven', salesRate: null, salesReason: 'SALES_BASIS_UNAVAILABLE',
  sr: { ok: false, reason: 'SALES_BASIS_UNAVAILABLE' }, horizonOpening: null, horizons: null
});
eq(noBasis.horizonBasis ? noBasis.horizonBasis.avgSalesPerDay : null, null,
  'C8  an unresolved basis is null, never a fabricated 0');
eq(noBasis.horizonsBlockedReason, 'SALES_BASIS_UNAVAILABLE',
  'C9  and the sales-driven block reason is still the specific one');

// A confirmed ZERO is a real answer and must survive the same path.
var zero = runRegion({
  planModel: 'forecast_driven', salesRate: null,
  sr: { ok: true, avgSalesPerDay: 0, source: 'normalized_30d', warning: '', normalDayCount: 30, excludedDates: [] },
  horizonOpening: null, horizons: null
});
eq(zero.horizonBasis && zero.horizonBasis.avgSalesPerDay, 0,
  'C10 a confirmed ZERO rate is published on a blocked line - zero is not missing');

// S8-B3-R3-CP2R-R1 - C11 and C12 ARE SUPERSEDED, AND THE STATE THEY DESCRIBED NO LONGER EXISTS.
//
// CP2R made the silent no-exclusion recompute OBSERVABLE by carrying a `contaminationApplied` flag to the
// line. That was an improvement on hiding it, and it was still the wrong answer: an un-excluded average is
// not a normal average, and shipping one with a flag attached asks every reader to notice the flag. R1
// removes the recompute, so there is no degraded-but-published state left to report. What replaces these
// is the assertion that the line carries the NAMED reason instead - see section F8b / F9 / F10b.
ok(!/contaminationApplied/.test(RECO),
  'C11 the degraded-state flag is gone from 42_ entirely - the state it reported cannot occur');
ok(!/compute\(\[\],\s*\[\]\)/.test(RECO),
  'C12 because the no-contamination recompute that produced it is gone with it');

// ---------------------------------------------------------------------------------------------------
section('D  what must not change');
// ---------------------------------------------------------------------------------------------------
eq(built.horizons, [{ d: 18 }], 'D1  a built horizon is still attached unchanged');
ok(built.horizonsBlockedReason === undefined, 'D2  and a built line carries no blocked reason');
eq(built.horizonBasis && built.horizonBasis.demandMode, 'forecast_driven', 'D3  demandMode still names what drove the horizon');
eq(blocked.horizonBasis && blocked.horizonBasis.demandMode, 'forecast_driven',
  'D4  and still does on a blocked line - publishing a rate is not a claim that it drove anything');
eq(built.horizonBasis && built.horizonBasis.horizonOpeningQty, 50, 'D5  the Site-Stock opening is still carried');

// ---------------------------------------------------------------------------------------------------
section('E  at SOURCE-TABLE scale, not just the 100-SKU main table');
// ---------------------------------------------------------------------------------------------------
// The main table shows 100 SKUs. The tables this resolver READS are much larger, and the defect lived in a
// linear first-match over one of them - a shape where size and ordering are exactly what decides the answer.
// A two-row fixture can prove the rule; it cannot show that the rule still holds when the right row is
// buried. So: a marketplace_skus of 4,000 rows across many companies and sites with the target row near the
// END, a daily-sales table carrying 90 days for SEVERAL scopes rather than one, and a campaign table whose
// lines mostly belong to other sites.
var N_MSK = 4000;
function bigMskRows() {
  var rows = [];
  for (var i = 0; i < N_MSK; i++) {
    // Decoys that match on every dimension the old lookup consulted EXCEPT company.
    rows.push(['MSKU-OTHER-' + i, 'SKU-A', 'CO' + (i % 50), 'US', 'Amazon']);
  }
  rows.push(ROW_KM);
  rows.push(ROW_RES);          // the row we want is LAST - a first-match reader can only get here by luck
  return rows;
}
// 90 completed days for three different scopes on the same source key shape. Only the US/Amazon/Amazon rows
// are this scope; the others must never be sampled, and the owner fail-fasts if they were ambiguous.
function bigDailyRows() {
  var rows = [];
  for (var n = 1; n <= 90; n++) {
    var d = daysBack(n);
    rows.push([d, 'SKU-A', d === KM_DAY ? 200 : (d === RES_DAY ? 100 : 10), 'US', 'Amazon', 'Amazon']);
    rows.push([d, 'SKU-A', 999, 'CA', 'Amazon', 'Amazon']);        // another country
    rows.push([d, 'SKU-B', 999, 'US', 'Amazon', 'Amazon']);        // another master SKU
  }
  return rows;
}
var BIG_CAMPAIGNS = (function () {
  var rows = [['CMP-KM', 'active', KM_DAY, KM_DAY], ['CMP-RES', 'active', RES_DAY, RES_DAY]];
  for (var i = 0; i < 200; i++) rows.push(['CMP-X' + i, 'active', daysBack(5 + (i % 40)), daysBack(5 + (i % 40))]);
  return snap(['campaign_id', 'status', 'start_date', 'end_date'], rows);
})();
var BIG_LINES = (function () {
  var rows = [['CMP-KM', 'MSKU-KM-US', 'SKU-A'], ['CMP-RES', 'MSKU-RES-US', 'SKU-A']];
  for (var i = 0; i < 200; i++) rows.push(['CMP-X' + i, 'MSKU-OTHER-' + i, 'SKU-A']);   // other sites, same master SKU
  return snap(['campaign_id', 'marketplace_sku_id', 'sku'], rows);
})();

var BIG_OVER = {
  amazonDailySalesSnapshot: snap(['snapshot_date', 'sku', 'sales_units', 'country', 'marketplace', 'channel'], bigDailyRows()),
  campaigns: BIG_CAMPAIGNS, campaignSkuLines: BIG_LINES
};
var t0 = Date.now();
var big = resolve('ResUS', bigMskRows(), BIG_OVER);
var bigMs = Date.now() - t0;

ok(big.ok === true, 'E1  a 4,000-row marketplace_skus with the target row LAST still resolves', big);
eq(big.excludedDates, [RES_DAY],
  'E2  and excludes exactly the ResUS campaign day - not the KM one, and not any of the 200 other sites');
// NOT the small fixture's rate, and that is the ladder working rather than a discrepancy. The small
// fixture supplies 30 completed days, so excluding one leaves 29 in the sample. This one supplies 90, and
// the rule is "the LATEST <= 30 NORMAL days inside the 90-day window": dropping the contaminated day pulls
// the next older normal day in, so the denominator is a full 30. The excluded DATE is identical either way
// (E2) - what changes is how many clean days were available to replace it.
eq(big.normalDayCount, 30,
  'E3  the sample is a full 30 normal days - excluding one contaminated day pulls an older clean day in');
eq(big.avgSalesPerDay, (200 + 10 * 29) / 30,
  'E3a with the arithmetic that follows from it: the KM 200-unit day plus 29 ordinary days, over 30');
ok(big.source === 'normalized_30d' && !big.warning,
  'E4  and it is a normalized basis with no low-sample warning at this depth of history',
  { source: big.source, warning: big.warning });
ok(bigMs < 15000, 'E5  and it completes without pathological blow-up at this size', { ms: bigMs });

// The decoys must be inert for the RIGHT reason: they are other companies, not other SKUs.
var decoyOnly = resolve('ResUS', bigMskRows().slice(0, N_MSK), BIG_OVER);
ok(decoyOnly.ok === false || decoyOnly.excludedDates.length === 0,
  'E6  with the ResUS row REMOVED, no decoy is silently adopted in its place',
  { ok: decoyOnly.ok, reason: decoyOnly.reason, excluded: decoyOnly.excludedDates });

// Cross-company at scale, both directions, same table.
eq(resolve('KM', bigMskRows(), BIG_OVER).excludedDates, [KM_DAY],
  'E7  and KM still gets its OWN day out of the same 4,000-row table');

// ---------------------------------------------------------------------------------------------------
section('F  identity must be UNIQUE, and a basis that cannot be trusted is not published');
// ---------------------------------------------------------------------------------------------------
// S8-B3-R3-CP2R-R1. CP2R stopped the resolver reading ANOTHER company's row. It still took the FIRST row
// that matched, which is correct only while the complete operational scope maps to exactly one id. When it
// maps to two, there is no right answer to pick and picking one is guessing with a 50% error rate.

// --- the conflict ----------------------------------------------------------------------------------
var ROW_RES_DUP = ['MSKU-RES-US-2', 'SKU-A', 'ResUS', 'US', 'Amazon'];   // same scope, DIFFERENT id
var conflictA = resolve('ResUS', [ROW_RES, ROW_RES_DUP, ROW_KM]);
var conflictB = resolve('ResUS', [ROW_RES_DUP, ROW_RES, ROW_KM]);
eq(conflictA.ok, false, 'F1  one complete scope mapping to TWO ids REFUSES to resolve');
eq(conflictA.reason, 'MARKETPLACE_SKU_AMBIGUOUS', 'F1a with a named reason, not a guess');
eq(conflictB.reason, conflictA.reason,
  'F1b and it refuses in BOTH row orders - the refusal is about the data, not about which row came first');
ok(conflictA.avgSalesPerDay == null, 'F1c no rate is published for an unresolvable identity');
ok(String(conflictA.detail || '').indexOf('MSKU-RES-US') !== -1,
  'F1d the detail names the ids that collided, so the data can be repaired', conflictA.detail);

// A DUPLICATE row carrying the SAME id is not a conflict - it is the same site listed twice.
var SAME_ID_TWICE = ['MSKU-RES-US', 'SKU-A', 'ResUS', 'US', 'Amazon'];
var dup = resolve('ResUS', [ROW_RES, SAME_ID_TWICE, ROW_KM]);
eq(dup.ok, true, 'F2  two rows carrying the SAME id are not ambiguous');
eq(dup.excludedDates, [RES_DAY], 'F2a and resolve to the same answer as one row');

// --- the missing row -------------------------------------------------------------------------------
// No row for this scope at all. With campaigns present the identity cannot be proven, so it must fail -
// and it must fail with a NAME, not by publishing an un-excluded average.
var missing = resolve('ResUS', [ROW_KM]);
eq(missing.ok, false, 'F3  a scope with NO marketplace_skus row does not fall through to an un-excluded rate');
ok(missing.avgSalesPerDay == null, 'F3a and publishes no rate', missing);

// ...but a missing id is NOT a failure when there is nothing to exclude. This is the line between
// "cannot prove identity" and "identity is not needed", and it is what keeps confirmed-empty data working.
var NO_CAMPAIGNS = snap(['campaign_id', 'status', 'start_date', 'end_date'], []);
var noCampNoRow = resolve('ResUS', [ROW_KM], { campaigns: NO_CAMPAIGNS, campaignSkuLines: snap(['campaign_id', 'marketplace_sku_id', 'sku'], []) });
eq(noCampNoRow.ok, true,
  'F4  with NO campaigns to exclude, an unresolved marketplace_sku_id is not an error - nothing needed it');
eq(noCampNoRow.excludedDates, [], 'F4a and nothing is excluded, truthfully');

// --- what fail-closed must NOT swallow ---------------------------------------------------------------
// A present-but-EMPTY contamination source is a legitimate "no exclusion", not a read failure.
var emptyCamp = resolve('ResUS', [ROW_RES, ROW_KM], { campaigns: NO_CAMPAIGNS, campaignSkuLines: snap(['campaign_id', 'marketplace_sku_id', 'sku'], []) });
eq(emptyCamp.ok, true, 'F5  a PRESENT but EMPTY campaign table is not a failure');
eq(emptyCamp.excludedDates, [], 'F5a it simply excludes nothing');
eq(emptyCamp.avgSalesPerDay, (200 + 100 + 10 * 28) / 30,
  'F5b and every day counts, including both companies\' spikes - this scope ran no campaign');

// An ABSENT source likewise. Confirmed empty and absent were differentiated before this round and stay so.
var absent = resolve('ResUS', [ROW_RES, ROW_KM], { campaigns: null, campaignSkuLines: null });
eq(absent.ok, true, 'F6  an ABSENT campaign source is not a failure either');
eq(absent.contaminationSource.campaigns, 'ABSENT', 'F6a and is still reported as ABSENT, not as PRESENT');
eq(emptyCamp.contaminationSource.campaigns, 'PRESENT', 'F6b while present-and-empty still reads PRESENT');

// The section 22 LOW SAMPLE fallback is a legitimate basis and must survive fail-closed.
var THIN = snap(['snapshot_date', 'sku', 'sales_units', 'country', 'marketplace', 'channel'],
  [[daysBack(1), 'SKU-A', 10, 'US', 'Amazon', 'Amazon'], [daysBack(2), 'SKU-A', 10, 'US', 'Amazon', 'Amazon']]);
var thin = resolve('ResUS', [ROW_RES, ROW_KM], { amazonDailySalesSnapshot: THIN, campaigns: NO_CAMPAIGNS, campaignSkuLines: snap(['campaign_id', 'marketplace_sku_id', 'sku'], []) });
eq(thin.ok, true, 'F7  fewer than three normal days still resolves through the weekly rung');
eq(thin.source, 'weekly_7d', 'F7a labelled weekly_7d, never passed off as normalized');
eq(thin.warning, 'insufficient_normal_days', 'F7b and carrying its own warning');
eq(thin.avgSalesPerDay, 10, 'F7c with the weekly value divided by seven');

// --- the named error has to REACH a surface ----------------------------------------------------------
// A quality error parked in metadata that nothing renders is the defect this round is closing, so the
// line must carry it. forecast_driven is the case that proves it: it never sets horizonsBlockedReason.
var fcBad = runRegion({ planModel: 'forecast_driven', salesRate: null,
  sr: { ok: false, reason: 'SALES_BASIS_CONTAMINATION_UNRESOLVED', detail: 'campaigns[0].skuLines[0] is missing marketplaceSkuId' },
  horizonOpening: 40, horizons: [{ d: 18 }] });
ok(!!fcBad.horizonBasis, 'F8  a forecast-driven line still publishes a basis object');
eq(fcBad.horizonBasis.avgSalesPerDay, null, 'F8a with NO rate, because none can be trusted');
eq(fcBad.horizonBasis.basisQualityError, 'SALES_BASIS_CONTAMINATION_UNRESOLVED',
  'F8b and the NAMED quality error on the line itself - not only in a metadata field');
eq(fcBad.horizons, [{ d: 18 }],
  'F8c while the forecast horizon is UNTOUCHED - the historical field never switches the planning formula');
ok(fcBad.horizonsBlockedReason === undefined,
  'F8d and a forecast-driven line is not blocked by a sales-history problem');

// A GOOD basis carries no quality error. The field must not become decorative.
eq(built.horizonBasis.basisQualityError, null, 'F9  a resolved basis reports no quality error');

// sales_driven, by contrast, must not plan from an untrustworthy average at all.
var sdBad = runRegion({ planModel: 'sales_driven', salesRate: null, salesReason: 'SALES_BASIS_CONTAMINATION_UNRESOLVED',
  sr: { ok: false, reason: 'SALES_BASIS_CONTAMINATION_UNRESOLVED' }, horizonOpening: 40, horizons: null });
eq(sdBad.horizonsBlockedReason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED',
  'F10 a sales-driven SKU fails CLOSED rather than recommending from a rate it cannot trust');
eq(sdBad.horizonBasis.avgSalesPerDay, null, 'F10a and publishes no rate');
eq(sdBad.horizonBasis.basisQualityError, 'SALES_BASIS_CONTAMINATION_UNRESOLVED',
  'F10b with the same named error visible on the line');

// --- the retry is GONE from the source, not merely unreachable ---------------------------------------
var RESOLVER = extractFn(RECO, 'recoWsResolveSalesRate_');
ok(!/compute\(\[\],\s*\[\]\)/.test(RESOLVER),
  'F11 the no-contamination recompute is removed from the resolver entirely');
ok(!/contaminationApplied/.test(RECO),
  'F11a and the flag that reported it is gone - there is no longer a degraded state to report');

// ---------------------------------------------------------------------------------------------------
section('G  the named quality error has to be SEEN, not stored');
// ---------------------------------------------------------------------------------------------------
// S8-B3-R3-CP2R-R1. The column printed a number or '--', and '--' meant four different things: no history,
// an ambiguous channel, an unresolvable identity, and a horizon that happened to fail. A reason carried as
// far as the row object and no further is a reason nobody acts on. These run the REAL cell helpers.
var IRPAGE = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8');
var IRCSS = fs.readFileSync(path.join(ROOT, 'assets/css/pages/inventory-replenishment.css'), 'utf8');

var cellBox = { console: console };
var cellCtx = vm.createContext(cellBox);
vm.runInContext('function escapeReplenHtml(v){ return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }', cellCtx);
['IR_AVG_QUALITY_TEXT', 'IR_AVG_WARNING_TEXT'].forEach(function (name) {
  var i = IRPAGE.indexOf('var ' + name + ' = {');
  var j = IRPAGE.indexOf('\n};', i);
  vm.runInContext(IRPAGE.slice(i, j + 3), cellCtx);
});
['_irAvgSalesQualityNote_', '_irAvgSalesWindowNote_', '_irAvgSalesTitleText_', '_irAvgSalesCellClass_', '_irAvgSalesTitleAttr_', '_irAvgSalesFlagHtml_']
  .forEach(function (fn) { vm.runInContext(extractFn(IRPAGE, fn), cellCtx); });
function cell(item, fn) { cellBox.__i = item; return vm.runInContext(fn + '(__i)', cellCtx); }

// --- a clean basis shows NOTHING extra. A marker that is always there is not a signal. ---------------
var CLEAN = { avgDailySales: '12.5', avgSalesQualityError: null, avgSalesWarning: null, avgSalesSource: 'normalized_30d' };
eq(cell(CLEAN, '_irAvgSalesFlagHtml_'), '', 'G1  a clean basis renders no marker at all');
eq(cell(CLEAN, '_irAvgSalesCellClass_'), '', 'G1a and adds no class');
eq(cell(CLEAN, '_irAvgSalesTitleAttr_'), '', 'G1b and no title');

// --- a named quality error is NAMED on screen --------------------------------------------------------
var AMBIG = { avgDailySales: '--', avgSalesQualityError: 'MARKETPLACE_SKU_AMBIGUOUS', avgSalesWarning: null };
var ambigFlag = cell(AMBIG, '_irAvgSalesFlagHtml_');
ok(ambigFlag.indexOf('unavailable') !== -1,
  'G2  an unresolvable identity renders a VISIBLE word, not an empty cell', ambigFlag);
ok(ambigFlag.indexOf('replen-avg-flag--error') !== -1, 'G2a carrying the error class');
var ambigTitle = cell(AMBIG, '_irAvgSalesTitleAttr_');
ok(ambigTitle.indexOf('more than one Marketplace SKU id') !== -1,
  'G2b and a title that says what is wrong in words, not a token', ambigTitle);
ok(ambigTitle.indexOf('may exclude the wrong days') !== -1,
  'G2c including WHY no number is better than a number here');
eq(cell(AMBIG, '_irAvgSalesCellClass_'), ' replen-cell--avg-error', 'G2d and the cell is marked');

var CONTAM = { avgDailySales: '--', avgSalesQualityError: 'SALES_BASIS_CONTAMINATION_UNRESOLVED', avgSalesWarning: null };
ok(cell(CONTAM, '_irAvgSalesTitleAttr_').indexOf('inflated by campaign sales') !== -1,
  'G3  the contamination error explains the inflation it is refusing to publish');

// An UNKNOWN code must still render something rather than vanishing.
var UNKNOWN = { avgDailySales: '--', avgSalesQualityError: 'SOME_FUTURE_CODE', avgSalesWarning: null };
ok(cell(UNKNOWN, '_irAvgSalesTitleAttr_').indexOf('SOME_FUTURE_CODE') !== -1,
  'G4  an unmapped code falls back to showing the code itself - never a blank');

// --- a low sample sits BESIDE a real number ----------------------------------------------------------
var THIN_ROW = { avgDailySales: '10.0', avgSalesQualityError: null, avgSalesWarning: 'insufficient_normal_days' };
var thinFlag = cell(THIN_ROW, '_irAvgSalesFlagHtml_');
ok(thinFlag.indexOf('replen-avg-flag--warning') !== -1, 'G5  a weekly fallback is marked beside its number');
ok(thinFlag.indexOf('unavailable') === -1, 'G5a but NOT as unavailable - the number is real');
ok(cell(THIN_ROW, '_irAvgSalesTitleAttr_').indexOf('weekly rate divided by seven') !== -1,
  'G5b and the title says it is not a normalized average');
var LOW = { avgDailySales: '11.0', avgSalesQualityError: null, avgSalesWarning: 'low_sample_warning' };
ok(cell(LOW, '_irAvgSalesTitleAttr_').indexOf('seven normal days') !== -1, 'G5c low_sample_warning is explained too');

// An error OUTRANKS a warning: there is no number for the warning to qualify.
var BOTH = { avgDailySales: '--', avgSalesQualityError: 'SALES_BASIS_UNAVAILABLE', avgSalesWarning: 'low_sample_warning' };
ok(cell(BOTH, '_irAvgSalesFlagHtml_').indexOf('unavailable') !== -1,
  'G6  when both are present the ERROR wins - a warning about a number that does not exist is noise');

// --- the row actually uses the helpers ---------------------------------------------------------------
ok(/_irAvgSalesCellClass_\(item\)[\s\S]{0,200}item\.avgDailySales[\s\S]{0,80}_irAvgSalesFlagHtml_\(item\)/.test(IRPAGE),
  'G7  the Avg Sales cell is built from the helpers, in the same cell as the number');
ok(/avgSalesQualityError: _avgQualityError/.test(IRPAGE), 'G7a and the row carries the named error');
ok(/basisQualityError: \(L\.horizonBasis\.basisQualityError/.test(IRPAGE),
  'G7b which it reads from the workspace line, never computing one here');

// --- and the classes EXIST in the stylesheet ---------------------------------------------------------
// Four .psb-state classes once shipped with zero rules and the refusal box rendered as bare body text.
// A class the markup emits and the stylesheet never mentions is not a surface.
['replen-avg-flag', 'replen-avg-flag--error', 'replen-avg-flag--warning',
 'replen-cell--avg-error', 'replen-cell--avg-warning'].forEach(function (c, i) {
  ok(new RegExp('\\.' + c.replace(/--/g, '--') + '\\s*[,{]').test(IRCSS),
    'G8.' + (i + 1) + ' .' + c + ' has at least one real CSS rule');
});
// And the stylesheet rotated, or a cached copy would render the word as plain text inside a numeric column.
var _series = RO.IR_CSS_TOKEN_SERIES;
eq(RO.currentIrCssToken(), _series[_series.length - 1], 'G9  the IR stylesheet token is the series head');
ok(RO.currentIrCssToken() !== 'irtpunresolved-20261011',
  'G9a and it ROTATED this round - the published one may not be reused for changed bytes');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
