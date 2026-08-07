// Kitchen Mama Operation System — Materialized gap LIFECYCLE freeze (F1-4B-FM5-R3 supplemental).
// Run: node assets/tests/materialized-gap-lifecycle-f1-4b-fm5r3.test.js
// -----------------------------------------------------------------------------
// inventory_replenishment_gap + order_planning_gap are LATEST-STATE materialized tables (NOT historical snapshots).
// UPSERT identity = company + country + marketplace + sku: a newer successful calculation UPDATES the existing row
// in place (never appends a historical version). Rows expose calculated_at / updated_at / calculation_status so
// stale rows can be identified LATER. There is NO purge/cleanup owner and NO age-only deletion — a materialized row
// is never deleted merely because it is old or a run failed. Regression-lock only; no code change this round.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GAP43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var SCHED44 = read('specs/active/apps-script/44_gap_materialization_scheduler.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(GAP43 + '\n return {' +
  ' upsert: gapUpsertByKey_, keyCols: GAP_KEY_COLS_, invHeaders: INV_GAP_HEADERS_, opHeaders: OP_GAP_HEADERS_ };'))();

// capturing sheet (header row + data rows) supporting the gapUpsertByKey_ interface
function sheetFrom(headers, rows) {
  var data = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  return {
    getLastRow: function () { return data.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function (row, col, numRows, numCols) {
      return {
        getValues: function () { var out = []; for (var i = 0; i < (numRows || 1); i++) { var rr = data[(row - 1) + i] || []; var line = []; for (var j = 0; j < (numCols || headers.length); j++) line.push(rr[(col - 1) + j]); out.push(line); } return out; },
        setValues: function (vals) { for (var i = 0; i < vals.length; i++) { var t = row - 1 + i; while (data.length <= t) data.push([]); data[t] = vals[i].slice(); } }
      };
    },
    appendRow: function (arr) { data.push(arr.slice()); },
    _data: data
  };
}
function colVal(sheet, rowIdx, header) { return sheet._data[rowIdx][H.invHeaders.indexOf(header)]; }

// =============================================================================================================
section('UPSERT identity = company + country + marketplace + sku (latest-state; no history)');
eq(H.keyCols, ['company', 'country', 'marketplace', 'sku'], 'ID1 UPSERT business key is company + country + marketplace + sku');

var sh = sheetFrom(H.invHeaders, []);
var r1 = H.upsert(sh, { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY', d18_gap_qty: 100, note: 'v1', calculated_at: '2026-08-07 13:30:00', updated_at: '2026-08-07 13:30:00' });
eq([r1, sh._data.length], ['insert', 2], 'LS1 first calc for a key → INSERT (1 header + 1 data row)');
var r2 = H.upsert(sh, { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY', d18_gap_qty: 40, note: 'v2', calculated_at: '2026-08-08 13:30:00', updated_at: '2026-08-08 13:30:00' });
eq([r2, sh._data.length], ['update', 2], 'LS2 newer calc for the SAME key → UPDATE in place (NO appended historical version)');
eq(colVal(sh, 1, 'd18_gap_qty'), 40, 'LS3 the newer value supersedes the previous (100 → 40)');
eq([colVal(sh, 1, 'calculated_at'), colVal(sh, 1, 'updated_at')], ['2026-08-08 13:30:00', '2026-08-08 13:30:00'], 'LS4 calculated_at (calc completion) + updated_at (row write) advance to the newer run');
var r3 = H.upsert(sh, { company: 'KM', country: 'CA', marketplace: 'AMAZON_CA', sku: 'CO1100-R', calculation_status: 'READY', d18_gap_qty: 10 });
eq([r3, sh._data.length], ['insert', 3], 'LS5 a DIFFERENT key → INSERT (distinct receiver = distinct latest-state row)');

section('metadata exposed to identify stale rows LATER (no deletion now)');
['calculation_status', 'calculated_at', 'updated_at'].forEach(function (h) {
  ok(H.invHeaders.indexOf(h) !== -1, 'MD-INV inventory_replenishment_gap exposes ' + h);
  ok(H.opHeaders.indexOf(h) !== -1, 'MD-OP order_planning_gap exposes ' + h);
});

section('SAFETY INVARIANT — an active/plannable row is NEVER deleted (failed/blocked calc UPDATES, never removes)');
var r4 = H.upsert(sh, { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'BLOCKED', note: 'HORIZONS_NOT_AVAILABLE', calculated_at: '2026-08-09 13:30:00', updated_at: '2026-08-09 13:30:00' });
eq([r4, sh._data.length], ['update', 3], 'SI1 a later BLOCKED calc UPDATES the row status — it does NOT delete the row (a failed run never removes a plannable SKU)');
eq(colVal(sh, 1, 'calculation_status'), 'BLOCKED', 'SI2 status truthfully reflects the latest calc; the row (and its identity) survives');

section('NO purge / NO age-only deletion owner exists (MATERIALIZED_GAP_CLEANUP_OWNER = SOURCE_MISSING)');
var CODE43 = GAP43.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
var CODE44 = SCHED44.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/deleteRow|clearContent|clear\(\)|removeRow/.test(CODE43), 'CL1 the gap materializer has NO row-deletion / clear operation');
ok(!/updated_at\s*<|calculated_at\s*<|olderThan|daysAgo|\bage\b|deleteIfOlder/.test(CODE43), 'CL2 NO age-only deletion logic (never "updated_at < N days → delete")');
ok(!/deleteRow|clearContent|purge|removeRow/.test(CODE44), 'CL3 the scheduler performs no gap-row deletion');
ok(!/function\s+\w*[Pp]urge\w*Gap|function\s+\w*[Cc]leanup\w*Gap/.test(CODE43 + CODE44), 'CL4 no gap purge/cleanup owner defined → SOURCE_MISSING (deferred to a future authority-based maintenance round)');
// the only gap-table writers are the UPSERT + the READ owners (no deleter)
ok(/function gapUpsertByKey_/.test(GAP43) && /appendRow|setValues/.test(GAP43), 'CL5 the sole gap writer is the latest-state UPSERT (insert/update only)');

console.log('\n----------------------------------------');
console.log('MATERIALIZED GAP LIFECYCLE (F1-4B-FM5-R3 supplemental): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
