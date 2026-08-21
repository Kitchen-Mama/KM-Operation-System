// Kitchen Mama Operation System — R4C RUNTIME cycle-transport FIX (verified on the REAL 47_) — F1-7N-FA-3C-DRAFT-MODEL-R4C.
// Run: node assets/tests/request-order-draft-v2-production-cycle-path-f1-7n-fa-3c-r4b5.test.js
// vm-loads the ACTUAL 47_api_v1_recommendation_generation.gs (now carrying the R4C seam) and drives the REAL
// recGenProjectCalendarMonth_ + recGenBuildGapDraftBody_ + KMRDV2.normalizePlanningCycleMonthly. Proves the Date-typed
// order_planning_gap.calculation_month (Aug 1 Asia/Taipei == 2026-07-31T16:00Z) now normalizes to canonical 2026-08
// (never the UTC-July slice), the helper fails closed on bad inputs with distinct tokens, and the downstream strict
// normalizer is UNCHANGED. (This supersedes the pre-R4C defect proof; the seam is now fixed.)

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GS47 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '47_api_v1_recommendation_generation.gs'), 'utf8').replace(/\r\n/g, '\n');
var AUG1_TAIPEI = new Date('2026-07-31T16:00:00.000Z');   // 2026-08-01 00:00 Asia/Taipei

// deterministic Asia/Taipei (+8) 'yyyy-MM' formatter for the mock Utilities
function fmt(d, tz, f) { var off = (tz === 'Asia/Taipei') ? 8 : 0; var t = new Date(d.getTime() + off * 3600000); var y = t.getUTCFullYear(), m = t.getUTCMonth() + 1; return y + '-' + (m < 10 ? '0' + m : '' + m); }
var sb = {
  KMRDV2: KMRDV2,
  SpreadsheetApp: { getActiveSpreadsheet: function () { return { getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; } }; } },
  Utilities: { formatDate: fmt }, Logger: { log: function () {} }, console: console
};
vm.createContext(sb); vm.runInContext(GS47, sb, { filename: '47_api_v1_recommendation_generation.gs' });

section('the REAL 47_ R4C seam functions load');
ok(typeof sb.recGenProjectCalendarMonth_ === 'function', 'recGenProjectCalendarMonth_ loaded');
ok(typeof sb.recGenBuildGapDraftBody_ === 'function', 'recGenBuildGapDraftBody_ loaded');

section('helper: Apps Script Date Aug 1 Asia/Taipei → 2026-08, NEVER the UTC-July slice');
var r = sb.recGenProjectCalendarMonth_(AUG1_TAIPEI, 'Asia/Taipei');
eq([r.ok, r.cycle], [true, '2026-08'], 'Date(Aug1 Taipei) → 2026-08');
ok(r.cycle !== '2026-07', 'never 2026-07 (UTC slice rejected)');
eq(AUG1_TAIPEI.toISOString().slice(0, 7), '2026-07', 'the naive UTC slice would have been 2026-07 (what we must avoid)');

section('helper: canonical / single-digit / explicit-tz ISO accepted; junk fails closed with distinct tokens');
eq(sb.recGenProjectCalendarMonth_('2026-08', 'Asia/Taipei'), { ok: true, cycle: '2026-08' }, 'canonical 2026-08 preserved');
eq(sb.recGenProjectCalendarMonth_('2026-8', 'Asia/Taipei').cycle, '2026-08', 'single-digit month zero-padded');
eq(sb.recGenProjectCalendarMonth_('2026-07-31T16:00:00.000Z', 'Asia/Taipei'), { ok: true, cycle: '2026-08' }, 'explicit-tz ISO (Z) resolves into project tz → 2026-08');
eq(sb.recGenProjectCalendarMonth_('', 'Asia/Taipei').error, 'PLANNING_CYCLE_REQUIRED', 'blank → PLANNING_CYCLE_REQUIRED');
eq(sb.recGenProjectCalendarMonth_('2026', 'Asia/Taipei').error, 'PLANNING_CYCLE_INVALID', 'year-only → PLANNING_CYCLE_INVALID (no clock/default)');
eq(sb.recGenProjectCalendarMonth_('08/01/2026', 'Asia/Taipei').error, 'PLANNING_CYCLE_INVALID', 'slash date → PLANNING_CYCLE_INVALID');
eq(sb.recGenProjectCalendarMonth_('Sat Aug 01 2026 00:00:00 GMT+0800', 'Asia/Taipei').error, 'PLANNING_CYCLE_INVALID', 'ambiguous locale string → PLANNING_CYCLE_INVALID');
eq(sb.recGenProjectCalendarMonth_('2026-07-31T16:00:00', 'Asia/Taipei').error, 'PLANNING_CYCLE_INVALID', 'tz-less datetime string is NOT deterministic → INVALID');
eq(sb.recGenProjectCalendarMonth_(AUG1_TAIPEI, '').error, 'PLANNING_CYCLE_TIMEZONE_REQUIRED', 'Date without a timezone → PLANNING_CYCLE_TIMEZONE_REQUIRED');
eq(sb.recGenProjectCalendarMonth_('2026-13', 'Asia/Taipei').error, 'PLANNING_CYCLE_INVALID', 'month out of range → PLANNING_CYCLE_INVALID');

section('end-to-end: REAL recGenBuildGapDraftBody_ now emits canonical 2026-08 for a Date calculation_month');
var gapRow = { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP5120-R',
  calculation_status: 'READY', calculated_at: '2026-08-01', calculation_month: AUG1_TAIPEI,
  t1_month: '2026-08', t2_month: '2026-09', t3_month: '2026-10',
  t1_suggested_qty: 100, t2_suggested_qty: 50, t3_suggested_qty: 0,
  t1_gap_qty: 100, t2_gap_qty: 50, t3_gap_qty: 0 };
var body = sb.recGenBuildGapDraftBody_({ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP5120-R' }, gapRow, 10, { draft_purpose: 'regular' });
eq([body.ok, body.body.planningCycle], [true, '2026-08'], 'body.planningCycle = 2026-08 (Date normalized in project tz)');
eq(KMRDV2.normalizePlanningCycleMonthly(body.body.planningCycle), '2026-08', 'downstream strict normalizer now ACCEPTS the canonical value (no throw)');

section('a Date calculation_month with NO available timezone fails closed (never a clock fallback)');
var sbNoTz = { KMRDV2: KMRDV2, SpreadsheetApp: { getActiveSpreadsheet: function () { return { getSpreadsheetTimeZone: function () { return ''; } }; } }, Utilities: { formatDate: fmt }, Logger: { log: function () {} } };
vm.createContext(sbNoTz); vm.runInContext(GS47, sbNoTz, {});
var bodyNoTz = sbNoTz.recGenBuildGapDraftBody_({ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP5120-R' }, gapRow, 10, {});
eq([bodyNoTz.ok, bodyNoTz.reason], [false, 'PLANNING_CYCLE_TIMEZONE_REQUIRED'], 'no tz → body fails closed with PLANNING_CYCLE_TIMEZONE_REQUIRED');

section('downstream strict normalizer is UNCHANGED (still rejects a raw localized Date string)');
var threw = false; try { KMRDV2.normalizePlanningCycleMonthly('Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)'); } catch (e) { threw = /INVALID_PLANNING_CYCLE/.test(e.message); }
ok(threw, 'KMRDV2.normalizePlanningCycleMonthly still throws on a localized Date string (strictness preserved)');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R4C RUNTIME CYCLE-TRANSPORT FIX (F1-7N-FA-3C-R4C): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
