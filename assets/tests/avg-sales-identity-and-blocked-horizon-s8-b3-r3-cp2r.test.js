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
['recoWsStr_', 'recoWsNum_', 'recoWsIsObj_', 'recoWsToRowObjects_', 'recoWsCmp_',
  'recoWsBuildContaminationFacts_', 'recoWsResolveSalesRate_'].forEach(function (fn) {
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
  sandbox.__s = snaps(mskRows, over);
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

// A campaign line that cannot prove site membership makes KMCALC throw, and 42_ retries with NO
// exclusions. That fallback is allowed to exist - contamination must never gate READY - but it must not
// be SILENT: a caller cannot tell an un-excluded basis from a clean one without a flag.
var BROKEN_LINES = snap(['campaign_id', 'marketplace_sku_id', 'sku'],
  [['CMP-KM', '', 'SKU-A'], ['CMP-RES', 'MSKU-RES-US', 'SKU-A']]);
var degraded = resolve('ResUS', [ROW_RES, ROW_KM], { campaignSkuLines: BROKEN_LINES });
ok(degraded.ok === true, 'B3  a campaign line with no marketplace_sku_id does not block the SKU');
eq(degraded.contaminationApplied, false,
  'B4  and the resolver REPORTS that it recomputed without the exclusion filter');
eq(degraded.excludedDates, [],
  'B5  which is the honest consequence: with the filter dropped, nothing is excluded');

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
  vm.runInNewContext(REGION, s);
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

// The degradation flag must reach the line, or the UI cannot tell a clean basis from an un-excluded one.
eq(built.horizonBasis && built.horizonBasis.contaminationApplied, true,
  'C11 the line carries whether the exclusion filter was applied');
var degradedLine = runRegion({
  planModel: 'forecast_driven', salesRate: null,
  sr: {
    ok: true, avgSalesPerDay: 15, source: 'normalized_30d', warning: '', normalDayCount: 30, excludedDates: [],
    contaminationApplied: false, contaminationSource: { campaigns: 'PRESENT', events: 'PRESENT' }
  },
  horizonOpening: 10, horizons: [{ d: 18 }]
});
eq(degradedLine.horizonBasis && degradedLine.horizonBasis.contaminationApplied, false,
  'C12 and reports FALSE when the exclusions were dropped - the silent recompute becomes observable');

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

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
