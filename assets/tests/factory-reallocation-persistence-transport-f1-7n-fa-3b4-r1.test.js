// Kitchen Mama Operation System — §41 diagnostic persistence transport + migration — F1-7N-FA-3B4-R1.
// Run: node assets/tests/factory-reallocation-persistence-transport-f1-7n-fa-3b4-r1.test.js
// Proves the transport-only path (no recompute): 43_ gapOpMapFromLines_ carries L.factorySurplusReallocation.* into the
// order_planning_gap row; 47_ recGenMapGapRowToFacts_ carries the gap-row columns onto the PRIMARY (T1) draft snapshotRow
// (never replicated across tiers); numeric 0 preserved, missing stays blank; the sanctioned prodMigrateAppendColumns_
// migration is additive + idempotent; and no §41/allocation module is invoked during transport.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F29 = read('specs/active/apps-script/29_production_safety_adapter.gs');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var F47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + F29 + '\n' + F43 + '\n' + F47 + '\n return {' +
  ' mapFromLines: gapOpMapFromLines_, mapGapRow: recGenMapGapRowToFacts_,' +
  ' appendCols: prodMigrateAppendColumns_, GAP_HEADERS: OP_GAP_HEADERS_, FACTORY_COLS: OP_GAP_FACTORY_SNAPSHOT_COLS_,' +
  ' ALLOC: (typeof KMALLOC!=="undefined"?KMALLOC:null), FSR: (typeof KMFSR!=="undefined"?KMFSR:null),' +
  ' MSA: (typeof KMMSA!=="undefined"?KMMSA:null), AR: (typeof KMAR!=="undefined"?KMAR:null) };'))();

var AUTH = { migrationId: 'M-3B4', expectedSpreadsheetId: 'SS', expectedSheetName: 'order_planning_gap', expectedOldHeaderHash: 'old', expectedNewHeaderHash: 'new', backupReference: 'bak', execute: true, actor: 'vic' };
var SCOPE = { company: 'A', country: 'US', marketplace: 'AMZ' };
function mp() { return [{ tier: 'T1', month: '2026-09', remainingGapQty: 0, suggestedOrderQty: 0 }, { tier: 'T2', month: '2026-10', remainingGapQty: 0, suggestedOrderQty: 0 }, { tier: 'T3', month: '2026-11', remainingGapQty: 0, suggestedOrderQty: 0 }, { tier: 'T4', month: '2026-12', remainingGapQty: 0, suggestedOrderQty: 0 }]; }
function line(fsr) { var l = { blocked: false, monthlyProjection: mp() }; if (fsr !== undefined) l.factorySurplusReallocation = fsr; return l; }
function gapRowFrom(base) { // simulate the sheet round-trip: null → '' (blank cell); numbers preserved
  var r = {}; H.GAP_HEADERS.forEach(function (h) { var v = base[h]; r[h] = (v === null || v === undefined) ? '' : v; });
  r.calculation_status = 'READY'; r.calculated_at = '2026-08-20T00:00:00Z';
  r.t1_month = '2026-09'; r.t1_suggested_qty = 0; r.t1_gap_qty = 0;
  r.t2_month = '2026-10'; r.t2_suggested_qty = 0; r.t2_gap_qty = 0;
  r.t3_month = '2026-11'; r.t3_suggested_qty = 0; r.t3_gap_qty = 0;
  return r;
}

// ==========================================================================
section('CASE A/B/C — runtime §41 facts transport VERBATIM: line → gap row → T1 draft snapshotRow');
[{ av: 80, in: 0, out: 0 }, { av: 40, in: 20, out: 0 }, { av: 100, in: 0, out: 30 }].forEach(function (c, idx) {
  var base = H.mapFromLines([line({ factoryAvailableQtySnapshot: c.av, reallocationInQtySnapshot: c.in, reallocationOutQtySnapshot: c.out })], SCOPE, 'X', '2026-08');
  eq([base.factory_available_qty_snapshot, base.reallocation_in_qty_snapshot, base.reallocation_out_qty_snapshot], [c.av, c.in, c.out], 'ABC[' + idx + '] gap row carries ' + c.av + '/' + c.in + '/' + c.out);
  var facts = H.mapGapRow(gapRowFrom(base), 1);
  ok(facts.ready, 'ABC[' + idx + '] facts ready');
  var t1 = facts.lines[0].snapshotRow;
  eq([t1.factory_available_qty_snapshot, t1.reallocation_in_qty_snapshot, t1.reallocation_out_qty_snapshot], [c.av, c.in, c.out], 'ABC[' + idx + '] T1 draft snapshotRow carries ' + c.av + '/' + c.in + '/' + c.out);
});

section('T1-only — receiver-level snapshots attach to the primary tier ONLY (T2/T3 blank, no inflation)');
(function () {
  var base = H.mapFromLines([line({ factoryAvailableQtySnapshot: 100, reallocationInQtySnapshot: 0, reallocationOutQtySnapshot: 30 })], SCOPE, 'X', '2026-08');
  var facts = H.mapGapRow(gapRowFrom(base), 1);
  eq(facts.lines[0].snapshotRow.factory_available_qty_snapshot, 100, 'T1 carries factory_available 100');
  ok(!('factory_available_qty_snapshot' in facts.lines[1].snapshotRow) && !('reallocation_out_qty_snapshot' in facts.lines[1].snapshotRow), 'T2 line has NO §41 snapshot keys');
  ok(!('factory_available_qty_snapshot' in facts.lines[2].snapshotRow), 'T3 line has NO §41 snapshot keys');
})();

section('CASE D — Σin == Σout preserved across a two-receiver scope (transport only)');
(function () {
  var donor = H.mapFromLines([line({ factoryAvailableQtySnapshot: 100, reallocationInQtySnapshot: 0, reallocationOutQtySnapshot: 30 })], SCOPE, 'X', '2026-08');
  var recv = H.mapFromLines([line({ factoryAvailableQtySnapshot: 0, reallocationInQtySnapshot: 30, reallocationOutQtySnapshot: 0 })], SCOPE, 'X', '2026-08');
  var sumIn = donor.reallocation_in_qty_snapshot + recv.reallocation_in_qty_snapshot;
  var sumOut = donor.reallocation_out_qty_snapshot + recv.reallocation_out_qty_snapshot;
  eq(sumIn, sumOut, 'D Σin(30) == Σout(30) — equality carried from runtime, not balanced in persistence');
})();

section('CASE E — numeric ZERO is preserved as 0 (never blanked)');
(function () {
  var base = H.mapFromLines([line({ factoryAvailableQtySnapshot: 0, reallocationInQtySnapshot: 0, reallocationOutQtySnapshot: 0 })], SCOPE, 'X', '2026-08');
  eq(base.factory_available_qty_snapshot, 0, 'E gap row 0 stays numeric 0');
  var t1 = H.mapGapRow(gapRowFrom(base), 1).lines[0].snapshotRow;
  eq(t1.factory_available_qty_snapshot, 0, 'E T1 snapshotRow 0 stays numeric 0');
  ok(t1.reallocation_in_qty_snapshot === 0 && t1.reallocation_out_qty_snapshot === 0, 'E in/out 0 preserved');
})();

section('CASE F — MISSING producer fact stays missing/blank (never fabricated 0)');
(function () {
  var base = H.mapFromLines([line(undefined)], SCOPE, 'X', '2026-08');   // no factorySurplusReallocation
  eq([base.factory_available_qty_snapshot, base.reallocation_in_qty_snapshot, base.reallocation_out_qty_snapshot], [null, null, null], 'F gap row keeps null (missing) — not 0');
  var t1 = H.mapGapRow(gapRowFrom(base), 1).lines[0].snapshotRow;   // gapRowFrom maps null → '' (blank cell)
  eq([t1.factory_available_qty_snapshot, t1.reallocation_in_qty_snapshot, t1.reallocation_out_qty_snapshot], ['', '', ''], 'F T1 snapshotRow blank (missing) — not 0');
})();

section('CASE G/H/I — sanctioned migration is additive + idempotent (prodMigrateAppendColumns_)');
(function () {
  function fakeSheet(headers) {
    var HH = headers.slice();
    return { getName: function () { return 'order_planning_gap'; }, getLastColumn: function () { return HH.length; }, getLastRow: function () { return 3; },
      getRange: function (r, c, nr, nc) { return { getValues: function () { return [HH.slice(c - 1, c - 1 + nc)]; }, setValues: function (v) { for (var j = 0; j < v[0].length; j++) HH[c - 1 + j] = v[0][j]; } }; },
      headers: function () { return HH; } };
  }
  var preHeaders = H.GAP_HEADERS.filter(function (h) { return H.FACTORY_COLS.indexOf(h) === -1; });   // old sheet: without the 3
  var sheet = fakeSheet(preHeaders);
  var r1 = H.appendCols(sheet, H.FACTORY_COLS, AUTH);   // G: adds exactly 3 (sanctioned prodMigrateAppendColumns_)
  eq(r1, 3, 'G migration adds exactly 3 missing columns');
  H.FACTORY_COLS.forEach(function (c) { ok(sheet.headers().indexOf(c) !== -1, 'G column present after migration: ' + c); });
  eq(sheet.headers().filter(function (h) { return h === 'factory_available_qty_snapshot'; }).length, 1, 'G exactly ONE factory_available column (no dup)');
  var r2 = H.appendCols(sheet, H.FACTORY_COLS, AUTH);   // H: rerun → 0 added, no dup
  eq(r2, 0, 'H rerun adds 0 (idempotent)');
  eq(sheet.headers().filter(function (h) { return h === 'reallocation_in_qty_snapshot'; }).length, 1, 'H no duplicate on rerun');
  var current = fakeSheet(H.GAP_HEADERS);   // I: already current
  eq(H.appendCols(current, H.FACTORY_COLS, AUTH), 0, 'I already-current sheet → no-op');
  ok(preHeaders.length + 3 === sheet.headers().length, 'G/H old data columns preserved (only appended)');
})();

section('CASE F(auth) — migration without valid authorization DTO fails closed');
(function () {
  var threw = false; try { H.appendCols({ getLastColumn: function () { return 1; }, getRange: function () { return { getValues: function () { return [['company']]; } }; }, getName: function () { return 'x'; } }, H.FACTORY_COLS, { execute: false }); } catch (e) { threw = true; }
  ok(threw, 'migration without valid migrationAuth throws (MIGRATION_AUTHORIZATION_REQUIRED)');
})();

section('CASE K — transport performs NO recomputation (KMFSR/KMMSA/KMAR/KMALLOC never called)');
(function () {
  var calls = 0;
  var wraps = [];
  function spy(obj, name) { if (obj && typeof obj[name] === 'function') { var real = obj[name]; obj[name] = function () { calls++; return real.apply(this, arguments); }; wraps.push([obj, name, real]); } }
  spy(H.FSR, 'reallocatePreallocatedFactorySupply'); spy(H.FSR, 'projectSurplusReallocation');
  spy(H.MSA, 'allocateMarketplaceReceiverSupply'); spy(H.AR, 'allocateFactoryCrossCompany'); spy(H.ALLOC, 'allocateFactoryDeterministic');
  try {
    var base = H.mapFromLines([line({ factoryAvailableQtySnapshot: 100, reallocationInQtySnapshot: 0, reallocationOutQtySnapshot: 30 })], SCOPE, 'X', '2026-08');
    H.mapGapRow(gapRowFrom(base), 1);
  } finally { wraps.forEach(function (w) { w[0][w[1]] = w[2]; }); }
  eq(calls, 0, 'K transport made ZERO allocator/§41 calls (calls=' + calls + ')');
})();

// ==========================================================================
console.log('\n' + (fail ? ('FAILED ' + fail + ' / ' + (pass + fail)) : ('OK — all ' + pass + ' assertions passed')));
if (fail) process.exit(1);
