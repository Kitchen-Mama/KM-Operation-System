// Kitchen Mama Operation System — R4B5 PRODUCTION CYCLE-TRANSPORT PATH proof — F1-7N-FA-3C-DRAFT-MODEL-R4B5.
// Run: node assets/tests/request-order-draft-v2-production-cycle-path-f1-7n-fa-3c-r4b5.test.js
// Ties DIRECTLY to the REAL production functions (Objective 1, option A+B): vm-loads the ACTUAL
// 47_api_v1_recommendation_generation.gs and invokes the proven-pure recGenBuildGapDraftBody_ + r4e2Str_ with a
// Date-typed calculation_month, then runs the REAL KMRDV2.normalizePlanningCycleMonthly on the result — proving
// production does NOT canonicalize a Date calculation_month (RUNTIME_DATE_CYCLE_TRANSPORT_DEFECT), while the
// project-timezone calendar month IS 2026-08 (never the UTC-July slice).

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GS47 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '47_api_v1_recommendation_generation.gs'), 'utf8').replace(/\r\n/g, '\n');
// The exact live instant: 2026-08-01 00:00 Asia/Taipei == 2026-07-31T16:00:00.000Z.
var AUG1_TAIPEI = new Date('2026-07-31T16:00:00.000Z');

// vm-load the REAL 47_ with a permissive sandbox (only function/var declarations execute at load; no DB calls fire).
var sb = {
  KMRDV2: KMRDV2,
  SpreadsheetApp: { getActiveSpreadsheet: function () { return { getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; } }; } },
  Utilities: { formatDate: function (d, tz, f) { var off = (tz === 'Asia/Taipei') ? 8 : 0; var t = new Date(d.getTime() + off * 3600000); var y = t.getUTCFullYear(), m = t.getUTCMonth() + 1; return y + '-' + (m < 10 ? '0' + m : '' + m); } },
  Logger: { log: function () {} }, console: console
};
vm.createContext(sb); vm.runInContext(GS47, sb, { filename: '47_api_v1_recommendation_generation.gs' });

section('the REAL 47_ pure production functions load and are the ones under test');
ok(typeof sb.recGenBuildGapDraftBody_ === 'function', 'REAL recGenBuildGapDraftBody_ loaded');
ok(typeof sb.r4e2Str_ === 'function', 'REAL r4e2Str_ (the gap→body stringifier, 47_:174) loaded');

section('boundary 3: r4e2Str_ stringifies a Date calculation_month to a NON-canonical string');
var prodStr = sb.r4e2Str_(AUG1_TAIPEI);
ok(!/^\d{4}-\d{1,2}$/.test(prodStr), 'r4e2Str_(Date) is NOT bare YYYY-MM (localized Date string): ' + JSON.stringify(prodStr));

section('boundaries 3→5: REAL recGenBuildGapDraftBody_ carries the non-canonical cycle; normalize REJECTS it');
// a facts-ready gap row (READY + calculated_at + tier months + suggested qty), calculation_month = Date object.
var gapRow = { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP5120-R',
  calculation_status: 'READY', calculated_at: '2026-08-01', calculation_month: AUG1_TAIPEI,
  t1_month: '2026-08', t2_month: '2026-09', t3_month: '2026-10',
  t1_suggested_qty: 100, t2_suggested_qty: 50, t3_suggested_qty: 0,
  t1_gap_qty: 100, t2_gap_qty: 50, t3_gap_qty: 0 };
var body = sb.recGenBuildGapDraftBody_({ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP5120-R' }, gapRow, 10, { draft_purpose: 'regular' });
ok(body.ok === true, 'recGenBuildGapDraftBody_ returns ok for a facts-ready row');
eq(body.body.planningCycle, prodStr, 'body.planningCycle == r4e2Str_(calculation_month) verbatim (boundary 47_:225)');
var threw = false, thrownMsg = '';
try { KMRDV2.normalizePlanningCycleMonthly(body.body.planningCycle); } catch (e) { threw = true; thrownMsg = e.message; }
ok(threw && /INVALID_PLANNING_CYCLE/.test(thrownMsg), 'REAL normalizePlanningCycleMonthly THROWS on the production cycle → generation would fail at KMRDV2P:228');

section('PRODUCTION_DATE_TO_MONTH verdict = RUNTIME_DATE_CYCLE_TRANSPORT_DEFECT');
var producesCanonical = false;
try { producesCanonical = (KMRDV2.normalizePlanningCycleMonthly(body.body.planningCycle) === '2026-08'); } catch (e) { producesCanonical = false; }
ok(producesCanonical === false, 'production does NOT yield canonical 2026-08 before active lookup → DEFECT');

section('the correct rule: project-timezone calendar month = 2026-08, never the UTC-July slice');
var utcSlice = AUG1_TAIPEI.toISOString().slice(0, 7);
eq(utcSlice, '2026-07', 'naive UTC slice would WRONGLY give 2026-07');
var taipeiMonth = sb.Utilities.formatDate(AUG1_TAIPEI, 'Asia/Taipei', 'yyyy-MM');
eq(taipeiMonth, '2026-08', 'project-tz (Asia/Taipei) calendar month = 2026-08 (the required R4C rule)');
ok(taipeiMonth !== utcSlice, 'the two differ — the month boundary is exactly why a tz-aware normalization is mandatory');

section('the seam accepts a canonical string unchanged (proves the fix is a pre-normalization, not a normalize change)');
eq(KMRDV2.normalizePlanningCycleMonthly('2026-08'), '2026-08', 'a canonical YYYY-MM already passes normalize unchanged');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R4B5 PRODUCTION CYCLE-TRANSPORT PATH (F1-7N-FA-3C-R4B5): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
