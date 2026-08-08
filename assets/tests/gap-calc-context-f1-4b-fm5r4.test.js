// Kitchen Mama Operation System — Deterministic calculation-context authority (F1-4B-FM5-R4).
// Run: node assets/tests/gap-calc-context-f1-4b-fm5r4.test.js
// -----------------------------------------------------------------------------
// ONE canonical Asia/Taipei calculation-context owner: calculationDate = YYYY-MM-DD, calculationMonth = the date's
// YYYY-MM, planningCycle = RECO-{month}. Asia/Taipei is a FIXED UTC+8 offset (no DST), so the calendar date is pure
// epoch arithmetic — no local/UTC leak, no DST/rollover bug. INVENTORY uses the execution date (13:30 Day D);
// ORDER_PLANNING uses the PREVIOUS Asia/Taipei date (03:30 Day D+1 → the latest completed source cycle = Day D).
// Month / year / leap boundaries proven. Pure module eval of 43 (no bundle, no Apps Script, no network).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GAP43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var SCHED44 = read('specs/active/apps-script/44_gap_materialization_scheduler.gs');
// frontend pages (no page-side clock authority)
var IR = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(GAP43 + '\n return {' +
  ' ctx: gapCalcContextForJob_, taipei: gapCalcTaipeiYmd_, prev: gapCalcPrevYmd_, valid: gapCalcYmdValid_,' +
  ' resolve: gapCalcResolveContext_, TZ: GAP_CALC_TZ_ };'))();

// Asia/Taipei wall-clock (UTC+8) → epoch ms (subtract 8h to get UTC).
function taipeiMs(y, mo, d, h, mi) { return Date.UTC(y, mo - 1, d, h - 8, mi, 0); }

// =============================================================================================================
section('canonical relationship — month + cycle DERIVE from the date (§1/N)');
var c = H.ctx('INVENTORY', '2026-08-07');
eq([c.ok, c.calculationDate, c.calculationMonth, c.planningCycle, c.timezone], [true, '2026-08-07', '2026-08', 'RECO-2026-08', 'Asia/Taipei'], 'REL calculationDate 2026-08-07 → month 2026-08 → RECO-2026-08 (Asia/Taipei)');
ok(H.ctx('INVENTORY', '2026-11-30').planningCycle === 'RECO-' + H.ctx('INVENTORY', '2026-11-30').calculationMonth, 'N planningCycle always = RECO-{calculationMonth}');

section('A — Inventory normal day (13:30 Asia/Taipei → same-day)');
var A = H.resolve('INVENTORY', taipeiMs(2026, 8, 7, 13, 30));
eq([A.calculationDate, A.calculationMonth, A.planningCycle], ['2026-08-07', '2026-08', 'RECO-2026-08'], 'A 2026-08-07 13:30 → calcDate 2026-08-07 / month 2026-08 / RECO-2026-08');

section('B — Order Planning next morning (03:30 Day D+1 → previous date)');
var B = H.resolve('ORDER_PLANNING', taipeiMs(2026, 8, 8, 3, 30));
eq([B.calculationDate, B.calculationMonth, B.planningCycle], ['2026-08-07', '2026-08', 'RECO-2026-08'], 'B 2026-08-08 03:30 → calcDate 2026-08-07 (latest completed source cycle) / month 2026-08');

section('C — month boundary (OP 2026-09-01 03:30 → 2026-08-31, month stays 2026-08)');
var C = H.resolve('ORDER_PLANNING', taipeiMs(2026, 9, 1, 3, 30));
eq([C.calculationDate, C.calculationMonth, C.planningCycle], ['2026-08-31', '2026-08', 'RECO-2026-08'], 'C 2026-09-01 03:30 OP → calcDate 2026-08-31 / month 2026-08 / RECO-2026-08 (no month bleed)');

section('D — after new-month source refresh (Inventory 2026-09-01 13:30 → new month)');
var D = H.resolve('INVENTORY', taipeiMs(2026, 9, 1, 13, 30));
eq([D.calculationDate, D.calculationMonth, D.planningCycle], ['2026-09-01', '2026-09', 'RECO-2026-09'], 'D 2026-09-01 13:30 Inventory → calcDate 2026-09-01 / month 2026-09 / RECO-2026-09');
var D2 = H.resolve('ORDER_PLANNING', taipeiMs(2026, 9, 2, 3, 30));
eq([D2.calculationDate, D2.calculationMonth], ['2026-09-01', '2026-09'], 'D2 2026-09-02 03:30 OP → calcDate 2026-09-01 / month 2026-09');

section('E — leap-year Asia/Taipei arithmetic around Feb 28/29');
eq(H.prev('2028-03-01'), '2028-02-29', 'E1 2028 is a leap year → day before Mar 1 is Feb 29');
eq(H.prev('2026-03-01'), '2026-02-28', 'E2 2026 is NOT a leap year → day before Mar 1 is Feb 28');
eq(H.resolve('ORDER_PLANNING', taipeiMs(2028, 3, 1, 3, 30)).calculationDate, '2028-02-29', 'E3 OP 2028-03-01 03:30 → 2028-02-29 (leap)');
eq(H.resolve('INVENTORY', taipeiMs(2028, 2, 29, 13, 30)).calculationMonth, '2028-02', 'E4 Inventory 2028-02-29 → month 2028-02');
eq(H.valid('2026-02-29'), false, 'E5 2026-02-29 is not a real calendar day → invalid');
eq(H.valid('2028-02-29'), true, 'E6 2028-02-29 is a real leap day → valid');

section('F — year boundary (OP 2027-01-01 03:30 → 2026-12-31)');
var F = H.resolve('ORDER_PLANNING', taipeiMs(2027, 1, 1, 3, 30));
eq([F.calculationDate, F.calculationMonth, F.planningCycle], ['2026-12-31', '2026-12', 'RECO-2026-12'], 'F 2027-01-01 03:30 OP → calcDate 2026-12-31 / month 2026-12 / RECO-2026-12');

section('timezone integrity — no UTC/DST rollover leak (a late-evening Taipei instant stays the same Taipei day)');
// 2026-08-07 23:30 Asia/Taipei = 2026-08-07 15:30 UTC — must remain 2026-08-07 (not roll to the 8th under UTC).
eq(H.taipei(taipeiMs(2026, 8, 7, 23, 30)), '2026-08-07', 'TZ1 23:30 Asia/Taipei stays 2026-08-07 (no UTC day-rollover)');
// 2026-08-08 00:30 Asia/Taipei = 2026-08-07 16:30 UTC — must be 2026-08-08 (Taipei is ahead of UTC).
eq(H.taipei(taipeiMs(2026, 8, 8, 0, 30)), '2026-08-08', 'TZ2 00:30 Asia/Taipei is already 2026-08-08');
eq(H.TZ, 'Asia/Taipei', 'TZ3 timezone authority = Asia/Taipei');

section('invalid context → fail closed (§10 never fabricate)');
eq(H.ctx('INVENTORY', '').ok, false, 'IV1 empty date → not ok (CALCULATION_CONTEXT_DATE_INVALID)');
eq(H.ctx('INVENTORY', '2026-13-01').code, 'CALCULATION_CONTEXT_DATE_INVALID', 'IV2 impossible month → invalid');

section('I/J/G — no frontend clock authority for the calc context · one shared server owner');
// The browser READS the calculation context from the server response (env.meta) — it never DECIDES it.
ok(/env\.meta[\s\S]{0,80}calculationMonth/.test(RO), 'I1 the Order Planning page reads calculationMonth from server env.meta (server-owned; browser does not decide the business period)');
// The gap batch derives the context server-side and does NOT accept a browser-supplied calculationDate/Month.
ok(!/body\.calculationDate|payload\.calculationDate|body\.calculationMonth|payload\.calculationMonth/.test(GAP43), 'I2 the gap batch derives context server-side and never consumes a browser-supplied calculationDate/Month');
// ONE canonical context owner (43) drives both the batch owners (manual) and the scheduler (scheduled).
ok(/gapCalcResolveContext_\('INVENTORY'\)/.test(GAP43) && /gapCalcResolveContext_\('ORDER_PLANNING'\)/.test(GAP43), 'G1 batch owners derive INVENTORY (today) / ORDER_PLANNING (prev day) via the ONE owner (manual path)');
ok(/gapCalcResolveContext_\(jobType, nowMs\)/.test(SCHED44), 'G2 the scheduler derives the SAME context via the SAME owner and injects it (scheduled path) — manual + scheduled share the owner');

console.log('\n----------------------------------------');
console.log('DETERMINISTIC CALC CONTEXT (F1-4B-FM5-R4): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
