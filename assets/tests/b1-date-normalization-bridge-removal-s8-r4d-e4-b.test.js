// S8-R4D-E4-B (R45) — THE DATE NORMALIZATION BRIDGE REMOVAL, PROVEN DIFFERENTIALLY.
//
// R44 measured normalizationMs 74,621 inside serverDurationMs 83,465 while the Sheets read itself cost
// batchValuesMs 3,110. The cost was two Utilities.* bridge crossings per declared date cell. R45 removes the
// crossing and keeps the conversion.
//
// THE ORACLE IS THE SHIPPED FUNCTION, NOT A REIMPLEMENTATION. sirWsSerialToDate_ is byte-identical to R44 in
// the file under test; R45 added sirWsSerialToDateGuarded_ beside it and routed sirWsApplyDateMap_ through
// that. So OLD-vs-NEW here is literally old code vs new code in one process, which is the only form of this
// comparison that cannot be satisfied by the test agreeing with itself — the mistake the D2 benchmark made.
//
// THE TIMEZONE STUB HAS REAL DST. Asia/Taipei is +8h today and was +9h in the summer of 1979, because Taiwan
// observed DST until 1980. A stub that returned a constant +8 would make the guard untestable and would pass
// a hard-coded offset, which is the specific defect the guard exists to prevent.
//
// Run: node assets/tests/b1-date-normalization-bridge-removal-s8-r4d-e4-b.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var G60_REL = 'assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs';
var G63_REL = 'assets/specs/active/apps-script/63_api_v1_system_health.gs';
var fail = 0, pass = 0;
function ok(c, m, d) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.error('FAIL ' + m + (d ? '\n   ' + d : '')); } }
function eq(a, b, m) { var A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m, A === B ? '' : 'expected ' + B + '\n   actual   ' + A); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function section(t) { console.log('\n================ ' + t + ' ================\n'); }
function git(a) { try { return cp.execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }); } catch (e) { return ''; } }

var G60 = read(G60_REL);

// ---------------------------------------------------------------------------------------------------
// THE SANDBOX. Utilities.formatDate / parseDate are implemented for real over zones that include a
// DST-BEARING one, and every call is COUNTED — the count is half the acceptance.
// ---------------------------------------------------------------------------------------------------
var CALLS = { formatDate: 0, parseDate: 0 };
function resetCalls() { CALLS.formatDate = 0; CALLS.parseDate = 0; }

// Offset in minutes east of UTC, as a function of the calendar fields it applies to.
//   Asia/Taipei          +8h, except June–September of any year before 1980 (Taiwan DST) -> +9h
//   Pacific/NeverSettles synthetic: flips every month, so NO year is ever constant
//   UTC / Etc/GMT-8      constant controls
function offMin(tz, year, month0) {
  if (tz === 'UTC') return 0;
  if (tz === 'Etc/GMT-8') return 480;
  if (tz === 'Asia/Taipei') return (year < 1980 && month0 >= 5 && month0 <= 8) ? 540 : 480;
  if (tz === 'Pacific/NeverSettles') return (month0 % 2 === 0) ? 480 : 540;
  throw new Error('unknown tz ' + tz);
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmt(d, tz, pattern) {
  CALLS.formatDate++;
  var off = offMin(tz, d.getUTCFullYear(), d.getUTCMonth());
  var t = new Date(d.getTime() + off * 60000);
  var s = t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
  if (/HH:mm:ss/.test(pattern)) s += ' ' + pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes()) + ':' + pad2(t.getUTCSeconds());
  return s;
}
function parseDate(s, tz, pattern) {
  CALLS.parseDate++;
  var m = /^(-?\d{4,6})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(s);
  if (!m) throw new Error('parseDate: ' + s);
  var off = offMin(tz, +m[1], +m[2] - 1);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - off * 60000);
}
var SAFETY = require(path.join(ROOT, 'assets/js/core/supply-planning-production-safety.js'));
function makeCtx(src) {
  var sb = {
    console: console, Date: Date, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object,
    Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt,
    Error: Error, RegExp: RegExp, Boolean: Boolean,
    Utilities: { formatDate: fmt, parseDate: parseDate },
    prodAssertDbTarget_: function () { return true; },
    prodExpectedDbId_: function () { return 'SS-TEST'; },
    prodSchemaError_: function (t) { var e = new Error(t); e.schemaStatus = t; return e; },
    prodSafetyBundle_: function () { return { classifySchemaMismatch: SAFETY.classifySchemaMismatch }; }
  };
  sb.global = sb;
  var c = vm.createContext(sb);
  vm.runInContext(src || G60, c, { filename: '60' });
  return c;
}
var C = makeCtx();
function f(name) { return vm.runInContext(name, C); }

var serialToDateOLD = f('sirWsSerialToDate_');          // UNCHANGED from R44 — the oracle
var applyMap = f('sirWsApplyDateMap_');                 // the R45 pipeline under test
var guarded = f('sirWsSerialToDateGuarded_');
var yearOffset = f('sirWsTzYearOffset_');
var TZ = 'Asia/Taipei';
function serialOf(y, mo, d, h, mi, s) {
  return (Date.UTC(y, mo, d, h || 0, mi || 0, s || 0) - Date.UTC(1899, 11, 30)) / 86400000;
}

// ---------------------------------------------------------------------------------------------------
section('A — THE OLD PATH IS STILL THERE, BYTE FOR BYTE');
// ---------------------------------------------------------------------------------------------------
// If R45 had EDITED sirWsSerialToDate_ there would be no oracle, only two copies of one opinion.
var R44_BODY = [
  'function sirWsSerialToDate_(serial, tz) {',
  '  var ms = Math.round(Number(serial) * 86400000);',
  '  var wall = new Date(Date.UTC(1899, 11, 30) + ms);',
  "  var s = Utilities.formatDate(wall, 'UTC', 'yyyy-MM-dd HH:mm:ss');",
  "  return Utilities.parseDate(s, tz, 'yyyy-MM-dd HH:mm:ss');",
  '}'
].join('\n');
ok(G60.replace(/\r\n/g, '\n').indexOf(R44_BODY) !== -1,
  'A1  sirWsSerialToDate_ is unchanged from R44 — the differential below compares code to code');
var g60AtR44 = git(['show', 'a940059:' + G60_REL]);
ok(g60AtR44.length > 0, 'A1a the deployed R44 source is available to diff against');
ok(g60AtR44.replace(/\r\n/g, '\n').indexOf(R44_BODY) !== -1,
  'A1b and that body is the one a940059 actually deployed, not one this test invented');

// ---------------------------------------------------------------------------------------------------
section('B — DIFFERENTIAL: EVERY VALUE SHAPE, OLD vs NEW');
// ---------------------------------------------------------------------------------------------------
// The four reference values the preflight named, plus every shape the live census recorded and the two
// eras that decide whether a fixed offset would have been safe (it would not).
var SERIALS = [
  { v: 46222, why: 'preflight ref — 2026-07-19 date-only' },
  { v: 46222.5, why: 'preflight ref — 2026-07-19 noon, fractional' },
  { v: 46812, why: 'preflight ref — 2028-02-29 LEAP DAY' },
  { v: 45000.25, why: 'preflight ref — 2023-03-15 06:00' },
  { v: 0, why: 'serial 0 — the epoch itself, 1899-12-30' },
  { v: 1, why: 'serial 1' },
  { v: -1000, why: 'NEGATIVE serial — 1897, before the epoch' },
  { v: serialOf(1979, 6, 15), why: 'TAIWAN DST ERA — Jul 1979, offset +9h' },
  { v: serialOf(1979, 0, 15), why: 'same year, January — offset +8h' },
  { v: serialOf(1980, 6, 15), why: 'the year after DST ended' },
  { v: serialOf(2024, 1, 29), why: 'leap day 2024' },
  { v: serialOf(2026, 6, 19, 15, 44, 7), why: 'live shape — fc_special_events.created_at to the SECOND' },
  { v: serialOf(2026, 11, 31, 23, 59, 59), why: 'YEAR BOUNDARY — 23:59:59 on 31 December' },
  { v: serialOf(2027, 0, 1, 0, 0, 1), why: 'the other side of that boundary' },
  { v: serialOf(2025, 9, 1), why: 'ordinary modern date' },
  { v: 45658.999988425925, why: 'one second before midnight as a raw fraction' }
];
var valueDiffs = [], typeDiffs = [];
SERIALS.forEach(function (c) {
  var want = serialToDateOLD(c.v, TZ);
  var values = [['snapshot_date'], [c.v]];
  applyMap('amazon_daily_sales_snapshot', values, TZ);
  var got = values[1][0];
  if (!(got instanceof Date) || !(want instanceof Date)) typeDiffs.push(c.why + ' (type)');
  else if (got.getTime() !== want.getTime()) {
    valueDiffs.push(c.why + ' serial=' + c.v + ' old=' + want.toISOString() + ' new=' + got.toISOString());
  }
});
eq(valueDiffs, [], 'B1  DATE_VALUE_DIFF_COUNT = 0 over ' + SERIALS.length + ' value shapes');
eq(typeDiffs, [], 'B2  DATE_TYPE_DIFF_COUNT = 0 — every converted cell is still a Date instance');

// The one that would have caught a hard-coded +8. Asserted on the VALUE, not on which branch ran.
var dst = serialOf(1979, 6, 15);
eq(serialToDateOLD(dst, TZ).toISOString(), guarded(dst, TZ, { 1979: yearOffset(TZ, 1979) }).toISOString(),
  'B3  a 1979 summer serial converts IDENTICALLY — the era in which Asia/Taipei was +9h, not +8h');
ok(yearOffset(TZ, 1979).constant === false,
  'B3a and the probe REFUSES 1979: the guard reports the year as non-constant rather than averaging it');
ok(yearOffset(TZ, 2026).constant === true && yearOffset(TZ, 2026).offsetMs === 8 * 3600000,
  'B3b while 2026 is proven constant at +8h, which is what makes the fast path legal at all');
ok(yearOffset(TZ, 1979).offsetMs === null,
  'B3c a non-constant year carries NO offset — there is nothing to accidentally use');

// A zone that never settles must never take the fast path, for ANY year.
var nsDiffs = [];
[2024, 2025, 2026].forEach(function (y) {
  if (yearOffset('Pacific/NeverSettles', y).constant !== false) nsDiffs.push(y);
  var s = serialOf(y, 3, 10), vals = [['snapshot_date'], [s]];
  applyMap('amazon_daily_sales_snapshot', vals, 'Pacific/NeverSettles');
  if (vals[1][0].getTime() !== serialToDateOLD(s, 'Pacific/NeverSettles').getTime()) nsDiffs.push(y + ':value');
});
eq(nsDiffs, [], 'B4  a zone with a transition every month falls back for EVERY year and still matches exactly');

// ---------------------------------------------------------------------------------------------------
section('C — THE TYPE GATE, UNCHANGED');
// ---------------------------------------------------------------------------------------------------
var NON_NUMBERS = [
  { v: '', why: 'blank (what sirWsPadRows_ produces)' },
  { v: '2026-07-19', why: 'DATE-SHAPED STRING — marketplace_skus.launch_date is one upsert away' },
  { v: '2026-09-21~2026-09-27', why: 'a week RANGE string' },
  { v: 'n/a', why: 'arbitrary text' },
  { v: null, why: 'null' },
  { v: undefined, why: 'undefined' },
  { v: true, why: 'boolean' },
  { v: new Date(Date.UTC(2026, 6, 19)), why: 'an ALREADY-converted Date' }
];
var gateDiffs = [];
NON_NUMBERS.forEach(function (c) {
  var values = [['snapshot_date'], [c.v]];
  var n = applyMap('amazon_daily_sales_snapshot', values, TZ);
  if (n !== 0) gateDiffs.push(c.why + ' (converted count ' + n + ')');
  if (values[1][0] !== c.v) gateDiffs.push(c.why + ' (value mutated)');
});
eq(gateDiffs, [], 'C1  only numbers are coerced — ' + NON_NUMBERS.length + ' non-number shapes pass through '
  + 'byte-identical and the converted count stays 0');

// Mixed row: the string survives beside the number, in the same column.
var mixed = [['snapshot_date'], [46222], ['2026-07-19'], [''], [46223]];
eq(applyMap('amazon_daily_sales_snapshot', mixed, TZ), 2, 'C2  a mixed column converts exactly the numbers');
ok(mixed[1][0] instanceof Date && mixed[2][0] === '2026-07-19' && mixed[3][0] === '' && mixed[4][0] instanceof Date,
  'C2a and the string and the blank are untouched between two converted cells');

// A column the map does not declare is never touched, whatever it holds.
var undeclared = [['snapshot_date', 'units_sold'], [46222, 46222]];
applyMap('amazon_daily_sales_snapshot', undeclared, TZ);
ok(undeclared[1][0] instanceof Date && undeclared[1][1] === 46222,
  'C3  an UNDECLARED numeric column beside a declared one stays a number');

// ---------------------------------------------------------------------------------------------------
section('D — THE MAP AND THE TRAPS DID NOT MOVE');
// ---------------------------------------------------------------------------------------------------
var MAP = f('SIR_B1_DATE_MAP_');
var mapAtR44 = /var SIR_B1_DATE_MAP_ = \{[\s\S]*?\n\};/.exec(g60AtR44);
var mapNow = /var SIR_B1_DATE_MAP_ = \{[\s\S]*?\n\};/.exec(G60);
ok(mapAtR44 && mapNow && mapAtR44[0].replace(/\r\n/g, '\n') === mapNow[0].replace(/\r\n/g, '\n'),
  'D1  DATE_MAP_DIFF_COUNT = 0 — the declared map is byte-identical to the deployed R44 literal');
eq(Object.keys(MAP).length, 13, 'D1a thirteen tables');
eq(Object.keys(MAP).reduce(function (a, t) { return a + MAP[t].length; }, 0), 46, 'D1b forty-six columns');
eq(f('SIR_B1_DATE_MAP_VERSION_'), 'B1-DATE-MAP-R44-1',
  'D1c and the map VERSION does not move, because the map did not — only the route to the Date did');

var TRAPS = f('SIR_B1_NON_DATE_TRAPS_');
var trapLeak = [];
Object.keys(TRAPS).forEach(function (t) {
  TRAPS[t].forEach(function (c) { if ((MAP[t] || []).indexOf(c) !== -1) trapLeak.push(t + '.' + c); });
});
eq(trapLeak, [], 'D2  NON_DATE_TRAP_DIFF_COUNT = 0 — no declared non-date has leaked into the map');
eq(Object.keys(TRAPS).reduce(function (a, t) { return a + TRAPS[t].length; }, 0), 3, 'D2a all three traps declared');

// event_month = 11 is the one that MATTERS: converted it would become 1900-01-10 and destroy every FC window.
var ev = [['event_month', 'event_period', 'event_start_date'], [11, 'Q4', 46222]];
applyMap('fc_special_events', ev, TZ);
eq(ev[1][0], 11, 'D3  EVENT_MONTH_11_PRESERVED — still the number 11, not 1900-01-10');
eq(ev[1][1], 'Q4', 'D3a event_period is still a string');
ok(ev[1][2] instanceof Date, 'D3b while the real date column beside them DID convert');
var wk = [['snapshot_week', 'week_end_date'], ['2026-09-21~2026-09-27', 46222]];
applyMap('amazon_weekly_sales_snapshot', wk, TZ);
eq(wk[1][0], '2026-09-21~2026-09-27', 'D4  snapshot_week is still the range string');
ok(wk[1][1] instanceof Date, 'D4a and week_end_date beside it converted');

// ---------------------------------------------------------------------------------------------------
section('E — THE COST: O(date cells) BECOMES O(distinct years)');
// ---------------------------------------------------------------------------------------------------
// The shape of the real hot table: amazon_daily_sales_snapshot, seven declared date columns.
var DAILY = MAP.amazon_daily_sales_snapshot;
eq(DAILY.length, 7, 'E0  the 70%-of-the-cost table still declares seven date columns');
function dailyTable(rows, yearSpread) {
  var v = [DAILY.slice()];
  for (var r = 0; r < rows; r++) {
    var row = [];
    for (var c = 0; c < DAILY.length; c++) {
      row.push(serialOf(2026 - (yearSpread ? (r % yearSpread) : 0), (r + c) % 12, 1 + ((r * 3 + c) % 27)));
    }
    v.push(row);
  }
  return v;
}
function costOf(rows, spread, tz) {
  // Fresh context per measurement: the year-offset memo is per EXECUTION, and a shared one would
  // flatter the second measurement by reusing the first one's probes.
  var ctx = makeCtx();
  resetCalls();
  var n = vm.runInContext('sirWsApplyDateMap_', ctx)('amazon_daily_sales_snapshot', dailyTable(rows, spread), tz || TZ);
  return { cells: n, calls: CALLS.formatDate + CALLS.parseDate };
}
var c100 = costOf(100, 1), c1000 = costOf(1000, 1);
eq([c100.cells, c1000.cells], [700, 7000], 'E1  both runs convert every declared cell (700 and 7,000)');
eq(c100.calls, c1000.calls, 'E2  UTILITIES_CALL_COMPLEXITY_AFTER = O(request): a 10x table costs the SAME '
  + 'number of bridge calls (' + c100.calls + ')');
ok(c1000.calls <= 14, 'E2a and that number is the probe budget — 14 samples for one distinct year, not '
  + (c1000.cells * 2) + ' crossings');
// The R44 ratio, measured rather than quoted, by running the old function over the same cells.
resetCalls();
for (var i = 0; i < c100.cells; i++) serialToDateOLD(46222 + i, TZ);
eq(CALLS.formatDate + CALLS.parseDate, c100.cells * 2,
  'E3  UTILITIES_CALL_COMPLEXITY_BEFORE = 2 per cell, executed — 700 cells cost 1,400 crossings');
ok(c100.calls < c100.cells * 2,
  'E4  and the new path costs strictly fewer: ' + c100.calls + ' vs ' + (c100.cells * 2));
// A wide era costs one probe budget per distinct year and no more.
var spread5 = costOf(500, 5);
ok(spread5.calls <= 5 * 14 && spread5.calls > c100.calls,
  'E5  five distinct years cost five probe budgets (' + spread5.calls + '), not one per cell');

// ---------------------------------------------------------------------------------------------------
section('F — CANDIDATE A WAS NOT IMPLEMENTED');
// ---------------------------------------------------------------------------------------------------
// R45 is explicitly NOT authorized to touch row selection. This is asserted against the DEPLOYED R44
// source rather than against a description of it.
function fnText(src, name) {
  var s = src.replace(/\r\n/g, '\n');
  var i = s.indexOf('function ' + name + '(');
  if (i < 0) return null;
  var j = s.indexOf('\n}\n', i);
  return j < 0 ? null : s.slice(i, j + 3);
}
['sirWsRecentWindow_', 'sirWorkspaceBuild_'].forEach(function (name) {
  var a = fnText(g60AtR44, name), b = fnText(G60, name);
  ok(a && b && a === b, 'F1  ' + name + ' is byte-identical to the deployed R44 — '
    + 'RECENT_WINDOW_SELECTION_CHANGED = NO');
});
var RW = f('SIR_WS_RECENT_WINDOW_');
eq(RW.amazon_daily_sales_snapshot.keep, 14, 'F2  the daily keep window is still 14 periods');
eq(RW.amazon_weekly_sales_snapshot.keep, 4, 'F2a and the weekly is still 4');
// The ORDERING that Candidate A would have changed is still exactly as R44 shipped it.
function stripComments(src) { return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]\/\/.*$/gm, ' '); }
var s60 = stripComments(G60);
// The CALL, not the declaration. sirWorkspaceBuild_ is DECLARED at the top of the file and INVOKED near the
// bottom, and `function sirWorkspaceBuild_(tables, payload) {` contains the call text as a substring — so the
// obvious indexOf finds the declaration, reports iBuild < iMap, and fails an ordering that is in fact correct.
var iMap = s60.indexOf('sirWsApplyDateMap_(name, padded, tz)');
var iBuild = s60.indexOf('= sirWorkspaceBuild_(tables, payload)');
ok(iMap > 0 && iBuild > iMap, 'F3  normalization still runs INSIDE the read, before sirWorkspaceBuild_ '
  + 'applies recentWindow — the ordering Candidate A would invert is untouched');

// ---------------------------------------------------------------------------------------------------
section('G — THE RELEASE IDENTITY');
// ---------------------------------------------------------------------------------------------------
var R45 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R45';
var G63 = read(G63_REL);
var RO = require(path.join(__dirname, '_release-order.js'));
// S8-R5-B — WHICH OF THESE ARE ABOUT R45, AND WHICH WERE ONLY EVER ABOUT "NOTHING HAS SHIPPED SINCE".
//
// This section read HEAD and compared everything to R45 by equality. Three of those were claims about
// THIS round's file — 60_ — and stay exact. Three were claims about the RELEASE, which is a moving
// target: R46 cut, and they began failing while describing a perfectly correct tree. That is the
// failure mode the deploy-surface suite already recorded at R44→R45 ("FLOORS AT HEAD, EQUALITIES AT A
// SHA"), and the same repair applies: a claim that outlives its round becomes a FLOOR.
//
// The distinction is not cosmetic. G1 and G4 are what make this suite an ACCEPTANCE for R45 — they say
// the 60_ bytes a deployment serves are R45's, which stays true for as long as 60_ is carried, and
// which a floor would stop checking. They must NOT be relaxed.
eq(/var SIR_BUILD_VERSION_ = '([^']*)'/.exec(G60)[1], R45,
  'G1  60_ declares R45 — it changed in THIS round, and is carried unchanged by later ones');
ok(RO.stampAtOrAfter(/var SYS_DEPLOYMENT_RELEASE_ = '([^']*)'/.exec(G63)[1], R45),
  'G2  the deployment release is R45 OR LATER — a release cut after this one does not invalidate it');
ok(RO.stampAtOrAfter(/var SYS_BUILD_VERSION_ = '([^']*)'/.exec(G63)[1], R45),
  'G3  63_ declares R45 or later — it changed in R45, and changes again whenever a release is cut');
ok(G63.indexOf("symbol: 'SIR_BUILD_VERSION_', expected: '" + R45 + "'") !== -1,
  'G4  and the manifest row for 60_ EXPECTS R45 exactly, so a partial sync is reported rather than guessed');
ok(RO.stampAtOrAfter((G63.match(/symbol: 'SYS_BUILD_VERSION_', expected: '([^']+)'/) || [])[1], R45),
  'G4a likewise 63_\'s own row, as a floor — it moves with every cut');
ok(!RO.stampAtOrAfter('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R44', R45),
  'G4b and a PRE-R45 stamp is still rejected — the floor is a floor, not an acceptance of anything');
ok(RO.OWNER_STAMPS.indexOf(R45) !== -1
  && RO.OWNER_STAMPS.indexOf(R45) > RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R44'),
  'G5  R45 is registered in the shared ledger AFTER R44 — the list is append-only and stampAtOrAfter '
  + 'compares indexes, so what matters is its position relative to its predecessor, not that it is last');
ok(RO.stampAtOrAfter(R45, 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R44'), 'G5a and it orders after R44');
// 01_ did not change: no action, no route, no request field moved.
eq(/var RTR_BUILD_VERSION_ = '([^']*)'/.exec(read('assets/specs/active/apps-script/01_router.gs'))[1],
  'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R41', 'G6  01_ keeps R41 — ROUTER_CHANGE = NO');

// The two new diagnostics are REPORTED, because a guard that cannot be observed in Production is a guard
// nobody can tell has failed open.
ok(/dateCellsConverted: b1Profile/.test(G60) && /tzProbeCalls: b1Profile/.test(G60),
  'G7  dateCellsConverted and tzProbeCalls reach the diagnostics beside normalizationMs');

// ---------------------------------------------------------------------------------------------------
section('H — MUTATION: EACH GATE IS GIVEN THE FAULT IT CLAIMS TO CATCH');
// ---------------------------------------------------------------------------------------------------
// A passing suite proves nothing unless the assertions FAIL on the defect they are named for.
function mutantConverts(label, mutate, serial, tz) {
  var src = mutate(G60);
  ok(src !== G60, label + ' [mutation applied]');
  var ctx;
  try { ctx = makeCtx(src); } catch (e) { ok(true, label + ' [refused to load — caught]'); return; }
  var vals = [['snapshot_date'], [serial]];
  var caught;
  try {
    vm.runInContext('sirWsApplyDateMap_', ctx)('amazon_daily_sales_snapshot', vals, tz || TZ);
    caught = !(vals[1][0] instanceof Date) || vals[1][0].getTime() !== serialToDateOLD(serial, tz || TZ).getTime();
  } catch (e) { caught = true; }
  ok(caught, label);
}
mutantConverts('H1  a HARD-CODED +8 offset is caught by the 1979 DST serial',
  function (s) { return s.replace('if (!g || g.constant !== true) return sirWsSerialToDate_(serial, tz);', ''); },
  serialOf(1979, 6, 15));
mutantConverts('H2  a probe that samples only ONE instant per year is caught by the same serial',
  function (s) { return s.replace('for (var m = -1; m <= 12; m++) {', 'for (var m = 0; m <= 0; m++) {'); },
  serialOf(1979, 6, 15));
mutantConverts('H4  the epoch constant drifting by one day is caught',
  function (s) { return s.replace('return Date.UTC(1899, 11, 30) + Math.round(Number(serial) * 86400000);',
    'return Date.UTC(1899, 11, 31) + Math.round(Number(serial) * 86400000);'); }, 46222);
// Targeted at sirWsSerialWallMs_ BY ITS WHOLE LINE. The bare expression appears in sirWsSerialToDate_ first,
// and String.replace takes the first match — mutating the oracle instead of the subject, which is a mutant
// that cannot fail and therefore proves nothing.
mutantConverts('H5  dropping Math.round in the new path is caught by a fractional serial',
  function (s) { return s.replace('return Date.UTC(1899, 11, 30) + Math.round(Number(serial) * 86400000);',
    'return Date.UTC(1899, 11, 30) + (Number(serial) * 86400000);'); }, 46222.123456789);
mutantConverts('H6  adding the offset instead of subtracting it is caught',
  function (s) { return s.replace('return new Date(wallMs - g.offsetMs);', 'return new Date(wallMs + g.offsetMs);'); },
  46222);
// The year memo is keyed by ZONE AND YEAR. Keyed by year alone it would serve one spreadsheet's offset to
// another, which is a fault no single-zone fixture can see — so this one deliberately converts twice.
(function () {
  var src = G60.replace("var key = tz + '|' + year;", "var key = '' + year;");
  ok(src !== G60, 'H3  [mutation applied] the year memo forgets which timezone it probed');
  var caught = false;
  try {
    var apply = vm.runInContext('sirWsApplyDateMap_', makeCtx(src));
    var a = [['snapshot_date'], [46222]];
    apply('amazon_daily_sales_snapshot', a, 'Asia/Taipei');       // primes the memo at +8h
    var b = [['snapshot_date'], [46222]];
    apply('amazon_daily_sales_snapshot', b, 'UTC');               // must NOT reuse it
    caught = b[1][0].getTime() !== serialToDateOLD(46222, 'UTC').getTime();
  } catch (e) { caught = true; }
  ok(caught, 'H3  a memo that forgets the timezone is caught — the second zone would inherit the first\'s offset');
})();

// The type gate: a mutant that drops it must be caught by the STRING surviving, not by a date value.
(function () {
  var src = G60.replace("if (typeof v === 'number') { values[r][idx[k]] = sirWsSerialToDateGuarded_(v, tz, offsetByYear); converted++; }",
    "{ values[r][idx[k]] = sirWsSerialToDateGuarded_(v, tz, offsetByYear); converted++; }");
  ok(src !== G60, 'H7  [mutation applied] the type gate is removed');
  var vals = [['snapshot_date'], ['2026-07-19']];
  var caught = false;
  try {
    vm.runInContext('sirWsApplyDateMap_', makeCtx(src))('amazon_daily_sales_snapshot', vals, TZ);
    caught = vals[1][0] !== '2026-07-19';
  } catch (e) { caught = true; }
  ok(caught, 'H7  removing the type gate is caught — a date-shaped STRING would be rewritten');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
