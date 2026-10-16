// Kitchen Mama Operation System - S8-B3-R3-CP2S
// ONE ROW WITH NO DATE DELETED EIGHTY-FOUR ROWS THAT HAD ONE
//
// Run: node assets/tests/avg-sales-blank-snapshot-date-s8-b3-r3-cp2s.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes. Every fixture here is SYNTHETIC and anonymised - the
// Owner's export is never copied into this repository. Only its SHAPE is reproduced: a scope that holds
// many dated rows plus a small number of rows whose snapshot_date cell is empty.
//
// THE DEFECT. `recoWsResolveSalesRate_` marshals the scoped daily rows into KMCALC. The frozen owner
// requires a strict YYYY-MM-DD per row and throws on anything else - correctly, because a row whose date
// cannot be read cannot be placed in the 90-day window. `toYmd` returns '' for an empty cell, and the
// SINGLE-MARKET branch maps EVERY scoped row through unchanged. So one undated row raises, the resolver
// catches it as a broken basis, and the SKU publishes no average at all - while eighty-four perfectly
// dated rows for that same scope sit unread.
//
// THE ASYMMETRY IS THE PROOF, and it is in the same function. The EU aggregate branch already writes
// `var d = toYmd(r.snapshot_date); if (!d) return;` - it has always skipped undated rows. Two branches,
// one boundary, one of them does the right thing. This is not a new policy; it is the policy that was
// already written down being applied to the other branch.
//
// WHAT THIS SUITE DOES NOT DO: it does not re-implement the averaging rule and it does not touch KMCALC.
// KMCALC is required and RUN, so every rate below is arithmetic the shipped owner produced.
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

var sandbox = { KMCALC: KMCALC, KMCID: KMCID, console: console };
var ctx = vm.createContext(sandbox);
['recoWsStr_', 'recoWsNum_', 'recoWsIsObj_', 'recoWsYmd_', 'recoWsToRowObjects_', 'recoWsCmp_',
  'recoWsBuildContaminationFacts_', 'recoWsResolveSalesRate_'].forEach(function (fn) {
    vm.runInContext(extractFn(RECO, fn), ctx);
  });

function snap(headers, rows) { return { headers: headers, rows: rows }; }
var CALC = '2026-10-08';
function daysBack(n) { var d = new Date(CALC + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

var DAILY_H = ['snapshot_date', 'sku', 'sales_units', 'country', 'marketplace', 'channel'];
var WEEKLY_H = ['sku', 'country', 'marketplace', 'channel', 'week_end_date', 'sales_units_7d'];
var MSK_H = ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace'];
var MKT = snap(['company', 'country', 'marketplace', 'marketplace_id'],
  [['KM', 'US', 'Amazon', 'MKT-KM-US-AMAZON'], ['KM', 'DE', 'Amazon', 'MKT-KM-DE-AMAZON'],
   ['KM', 'IT', 'Amazon', 'MKT-KM-IT-AMAZON'], ['KM', 'EU', 'Amazon', 'MKT-KM-EU-AMAZON']]);
var NO_CAMP = snap(['campaign_id', 'status', 'start_date', 'end_date'], []);
var NO_LINES = snap(['campaign_id', 'marketplace_sku_id', 'sku'], []);
var NO_EVENTS = snap(['sku', 'status', 'marketplace_id', 'company', 'country', 'marketplace', 'event_start_date', 'event_end_date'], []);

// The anonymised reproduction. `goodDays` dated rows at 10 units each, plus `blankRows` rows whose
// snapshot_date cell is EMPTY - the exact mixture the Owner's export contains.
function rowsWithBlanks(goodDays, blankRows, country, units, blankVal) {
  var rows = [];
  for (var n = 1; n <= goodDays; n++) rows.push([daysBack(n), 'SKU-BD', units === undefined ? 10 : units, country || 'US', 'Amazon', 'Amazon']);
  for (var b = 0; b < blankRows; b++) rows.push([blankVal === undefined ? '' : blankVal, 'SKU-BD', 7, country || 'US', 'Amazon', 'Amazon']);
  return rows;
}
function resolve(dailyRows, over, country) {
  var s = {
    amazonDailySalesSnapshot: snap(DAILY_H, dailyRows),
    amazonWeeklySalesSnapshot: snap(WEEKLY_H, [['SKU-BD', country || 'US', 'Amazon', 'Amazon', daysBack(1), 70]]),
    marketplaceSkus: snap(MSK_H, [['MSKU-KM', 'SKU-BD', 'KM', country || 'US', 'Amazon']]),
    marketplaces: MKT, campaigns: NO_CAMP, campaignSkuLines: NO_LINES, fcSpecialEvents: NO_EVENTS
  };
  if (over) Object.keys(over).forEach(function (k) { s[k] = over[k]; });
  sandbox.__s = s;
  sandbox.__scope = { company: 'KM', country: country || 'US', marketplace: 'Amazon' };
  return vm.runInContext('recoWsResolveSalesRate_(__s, __scope, "SKU-BD", "' + CALC + '")', ctx);
}

// ---------------------------------------------------------------------------------------------------
section('A  the reproduction: 84 dated rows, 1 undated row');
// ---------------------------------------------------------------------------------------------------
// The Owner's shape. Before the fix this returns ok:false and the entire SKU shows no average.
var r = resolve(rowsWithBlanks(84, 1));
ok(r.ok === true, 'A1  EIGHTY-FOUR DATED ROWS STILL PRODUCE AN AVERAGE when one row has no date', r);
eq(r.avgSalesPerDay, 10, 'A2  and the rate is the dated rows arithmetic - 10 units a day');
eq(r.source, 'normalized_30d', 'A3  on the normal 30-day rung, not a fallback');
eq(r.warning, '', 'A4  with no warning - the sample was never thin, only misread');
// '' and not null: that is the FROZEN owners own no-warning value (supply-planning-calculations.js:416).
// Asserting null here would have been this suite inventing a convention the owner does not use.

// The skipped rows are COUNTED. A silent skip is how 353 missing rows stay invisible for another round.
eq(r.blankDateRows, 1, 'A5  the skipped row is REPORTED, not silently dropped');
var r0 = resolve(rowsWithBlanks(84, 0));
eq(r0.blankDateRows, 0, 'A5a and a clean scope reports zero rather than nothing');
eq(r0.avgSalesPerDay, r.avgSalesPerDay,
  'A6  one undated row changes the published rate by NOTHING - it was never an observation');

// Proportionally to the Owner's export: many scopes, a few hundred undated rows between them.
var many = resolve(rowsWithBlanks(84, 12));
ok(many.ok === true, 'A7  twelve undated rows do not change the answer either', many);
eq(many.blankDateRows, 12, 'A7a and all twelve are counted');
eq(many.avgSalesPerDay, 10, 'A7b the rate is still the dated rows own arithmetic');

// --- what counts as "no date" -----------------------------------------------------------------
// Whitespace is an empty cell that a human typed a space into. An absent cell is the same fact.
eq(resolve(rowsWithBlanks(84, 1, 'US', 10, '   ')).blankDateRows, 1, 'A8  a whitespace-only cell is blank');
eq(resolve(rowsWithBlanks(84, 1, 'US', 10, null)).blankDateRows, 1, 'A8a a null cell is blank');

// A NON-BLANK unreadable value is NOT swept up with them. It is a value somebody put there that this
// layer cannot read, and quietly discarding it would hide a real data fault behind a fix for a
// different one. It still fails closed, with the owner's own message.
var garbage = resolve(rowsWithBlanks(84, 1, 'US', 10, 'not-a-date'));
ok(garbage.ok === false, 'A9  an unreadable NON-BLANK date still fails closed - blank is not a synonym for bad', garbage);
eq(garbage.reason, 'SALES_BASIS_UNAVAILABLE', 'A9a named as a broken basis, not as contamination');

// ---------------------------------------------------------------------------------------------------
section('B  the dates are never invented');
// ---------------------------------------------------------------------------------------------------
// The fix must not reach for synced_at, for today, or for a neighbouring row. A fabricated date puts a
// real units figure on a day it did not happen, which is worse than losing it.
var fixSrc = extractFn(RECO, 'recoWsResolveSalesRate_');
// COMMENTS STRIPPED FIRST. The prose above the fix SAYS the words "synced_at" and "today" in order to
// record what it must not do, so a regex over the raw text would have been testing the comment rather
// than the code - and would have passed the moment somebody deleted the comment.
var fixCode = fixSrc.replace(/\/\/[^\r\n]*/g, '');
ok(!/synced_at/.test(fixCode), 'B1  synced_at is never consulted');
ok(!(/new Date\(\)/.test(fixCode)), 'B2  todays date is never substituted');
// The units of a skipped row must not survive into any total.
var spiked = rowsWithBlanks(84, 1, 'US', 10, '');
spiked[spiked.length - 1][2] = 100000;          // the undated row claims 100000 units
var sp = resolve(spiked);
eq(sp.avgSalesPerDay, 10, 'B3  a skipped rows UNITS never reach the average either - the row is gone, not re-dated');

// Date objects and already-valid strings keep their existing normalisation.
var objRows = [];
for (var n = 1; n <= 40; n++) objRows.push([new Date(daysBack(n) + 'T00:00:00Z'), 'SKU-BD', 10, 'US', 'Amazon', 'Amazon']);
objRows.push(['', 'SKU-BD', 7, 'US', 'Amazon', 'Amazon']);
var objRes = resolve(objRows);
ok(objRes.ok === true, 'B4  a sheet that stores Date OBJECTS still normalises as before', objRes);
eq(objRes.avgSalesPerDay, 10, 'B4a with the same rate');
var slashRows = [];
for (var m2 = 1; m2 <= 40; m2++) { var d2 = daysBack(m2).split('-'); slashRows.push([d2[0] + '/' + d2[1] + '/' + d2[2], 'SKU-BD', 10, 'US', 'Amazon', 'Amazon']); }
slashRows.push([null, 'SKU-BD', 7, 'US', 'Amazon', 'Amazon']);
ok(resolve(slashRows).ok === true, 'B5  and YYYY/MM/DD strings still normalise as before');

// ---------------------------------------------------------------------------------------------------
section('C  what the skip must NOT swallow');
// ---------------------------------------------------------------------------------------------------
// Fail-closed is easy to over-apply and so is skipping. Each of these is a DIFFERENT answer and must
// stay different after the fix.

// --- a confirmed zero is an observation -------------------------------------------------------
var zeroRows = [];
for (var z = 1; z <= 40; z++) zeroRows.push([daysBack(z), 'SKU-BD', 0, 'US', 'Amazon', 'Amazon']);
zeroRows.push(['', 'SKU-BD', 5, 'US', 'Amazon', 'Amazon']);
var zr = resolve(zeroRows);
ok(zr.ok === true, 'C1  a scope that genuinely sold nothing still resolves', zr);
eq(zr.avgSalesPerDay, 0, 'C1a and publishes 0 - a confirmed zero is an answer, not a gap');

// --- EVERY row undated: no daily basis at all -------------------------------------------------
// The weekly rung is the legitimate section 22 fallback and it must be REACHED, not invented.
var allBlank = resolve(rowsWithBlanks(0, 9));
ok(allBlank.ok === true, 'C2  all rows undated - the legitimate weekly fallback is reached', allBlank);
eq(allBlank.source, 'weekly_7d', 'C2a on the weekly rung');
eq(allBlank.warning, 'insufficient_normal_days', 'C2b and it SAYS the sample was insufficient');
eq(allBlank.avgSalesPerDay, 10, 'C2c weekly 70 / 7 - the frozen rungs arithmetic, not a new one');
eq(allBlank.blankDateRows, 9, 'C2d with all nine skips reported');

// --- no daily AND no weekly: nothing may be fabricated -----------------------------------------
var nothing = resolve(rowsWithBlanks(0, 4), { amazonWeeklySalesSnapshot: snap(WEEKLY_H, []) });
ok(nothing.ok === false, 'C3  undated daily rows and NO weekly source - no rate is published', nothing);
eq(nothing.reason, 'SALES_BASIS_UNAVAILABLE', 'C3a named as unavailable');
ok(!(nothing.avgSalesPerDay === 0), 'C3b and specifically NOT a fabricated 0');

// --- a thin but real sample still takes the documented rung ------------------------------------
var thin = resolve(rowsWithBlanks(2, 3));
ok(thin.ok === true, 'C4  two dated days is below the three-day rung', thin);
eq(thin.source, 'weekly_7d', 'C4a so it falls to weekly, as section 22 says');
eq(thin.warning, 'insufficient_normal_days', 'C4b and is marked');

// --- campaign/event identity failures are NOT swallowed by the date skip ------------------------
// A campaign line that cannot prove site membership is an IDENTITY failure. The blank-date skip must
// not become a second place where a contamination error quietly disappears.
var BAD_LINES = snap(['campaign_id', 'marketplace_sku_id', 'sku'], [['CMP-X', '', 'SKU-BD']]);
var CAMP_X = snap(['campaign_id', 'status', 'start_date', 'end_date'], [['CMP-X', 'active', daysBack(3), daysBack(3)]]);
var contam = resolve(rowsWithBlanks(84, 1), { campaigns: CAMP_X, campaignSkuLines: BAD_LINES });
ok(contam.ok === false, 'C5  an unresolvable campaign identity STILL fails closed', contam);
eq(contam.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED', 'C5a and is still named as contamination, not as a date problem');

// --- a real campaign exclusion still happens after the skip ------------------------------------
var SPIKE = daysBack(3);
var campRows = [];
for (var c2 = 1; c2 <= 40; c2++) campRows.push([daysBack(c2), 'SKU-BD', daysBack(c2) === SPIKE ? 900 : 10, 'US', 'Amazon', 'Amazon']);
campRows.push(['', 'SKU-BD', 7, 'US', 'Amazon', 'Amazon']);
var GOOD_LINES = snap(['campaign_id', 'marketplace_sku_id', 'sku'], [['CMP-G', 'MSKU-KM', 'SKU-BD']]);
var CAMP_G = snap(['campaign_id', 'status', 'start_date', 'end_date'], [['CMP-G', 'active', SPIKE, SPIKE]]);
var excl = resolve(campRows, { campaigns: CAMP_G, campaignSkuLines: GOOD_LINES });
ok(excl.ok === true, 'C6  a resolvable campaign still excludes its selling day', excl);
eq(excl.avgSalesPerDay, 10, 'C6a the 900-unit campaign day is excluded - the skip did not disturb the filter');
ok((excl.excludedDates || []).indexOf(SPIKE) !== -1, 'C6b and the excluded date is reported', excl.excludedDates);

// ---------------------------------------------------------------------------------------------------
section('D  more than one country');
// ---------------------------------------------------------------------------------------------------
// The EU aggregate branch ALREADY skipped undated rows. That is the proof the policy is not new - and
// it must keep working, because this round changes the boundary both branches read from.
var euRows = [];
['DE', 'IT'].forEach(function (cc) {
  for (var n2 = 1; n2 <= 40; n2++) euRows.push([daysBack(n2), 'SKU-BD', 5, cc, 'Amazon', 'Amazon']);
  euRows.push(['', 'SKU-BD', 99, cc, 'Amazon', 'Amazon']);
});
var euWeekly = snap(WEEKLY_H, [['SKU-BD', 'DE', 'Amazon', 'Amazon', daysBack(1), 35],
                               ['SKU-BD', 'IT', 'Amazon', 'Amazon', daysBack(1), 35]]);
var eu = resolve(euRows, { amazonWeeklySalesSnapshot: euWeekly,
  marketplaceSkus: snap(MSK_H, [['MSKU-KM-EU', 'SKU-BD', 'KM', 'EU', 'Amazon']]) }, 'EU');
ok(eu.ok === true, 'D1  the EU roll-up resolves with undated rows present in both members', eu);
eq(eu.avgSalesPerDay, 10, 'D1a summing the two members dated rows only - 5 + 5');
eq(eu.blankDateRows, 2, 'D1b and the EU branch reports its skips the same way the single market does');

// A single non-EU market other than US, to show the branch is not US-shaped.
var de = resolve(rowsWithBlanks(84, 1, 'DE'), {
  marketplaceSkus: snap(MSK_H, [['MSKU-KM-DE', 'SKU-BD', 'KM', 'DE', 'Amazon']]) }, 'DE');
ok(de.ok === true, 'D2  DE / Amazon resolves the same way', de);
eq(de.blankDateRows, 1, 'D2a with its skip counted');

// ---------------------------------------------------------------------------------------------------
section('E  the boundary is ONE place, and the EU dead guard is gone');
// ---------------------------------------------------------------------------------------------------
// Two branches filtering undated rows in two places is how they drifted apart in the first place.
ok(/blankDateRows|blankDates/.test(fixCode), 'E1  the skip is a named, countable thing in the shipped source');
var euGuard = /var d = toYmd\(r\.snapshot_date\); if \(!d\) return;/.test(fixCode);
ok(!euGuard, 'E2  the EU branchs own undated-row guard is REMOVED - the shared boundary now owns it');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed === 0 ? 0 : 1;
