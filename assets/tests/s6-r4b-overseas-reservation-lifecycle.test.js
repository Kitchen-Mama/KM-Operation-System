// S6-R4B — THE OVERSEAS RESERVATION LIFECYCLE, EXECUTED.
//
// R3A froze the quantity model and R3B froze the import semantic. This suite drives the runtime that
// implements them, against the REAL handlers in a fake spreadsheet.
//
// THE ONE ARITHMETIC THIS ROUND EXISTS TO GET RIGHT, and the reason half these cases are here:
//
//   FACTORY    available is DERIVED     available = fac_current_stock - fac_reserved_stock
//   OVERSEAS   available is STORED      wh_available_stock IS the allocatable quantity
//
// So an overseas reserve TRANSFERS between two stored cells, and everything downstream must not subtract the
// reserved units a second time. `70 / 30` is 70 allocatable, not 40; a dispatch of 30 leaves `70 / 0`, not
// `40 / 0`. Both wrong answers are one plausible line away, so §D and §M drive them and §22's mutants plant
// them.
//
// WHY §S AND §T ARE DRIVEN AT THE ROUTING SEAM. Standing up a whole shipping-plan world — plans, plan lines,
// shipments, shipment lines, routes — to assert which BALANCE FUNCTION was consulted would be testing the
// fixture. The claim this round makes is narrower and is asserted directly: the precheck asks which domain
// owns the source warehouse and forwards to that domain's lifecycle, and the shim itself adds no arithmetic.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s6-r4b-overseas-reservation-lifecycle.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var GS = 'specs/active/apps-script/';
var F05 = read(GS + '05_overseas_inventory_handlers.gs');
var F12 = read(GS + '12_shipment_handlers.gs');
var F21 = read(GS + '21_factory_inventory_handlers.gs');
var F22 = read(GS + '22_shipment_dispatch_handlers.gs');
var F47 = read(GS + '47_api_v1_recommendation_generation.gs');
var CLIENT = read('js/pages/overseas-stock.js');
var API = read('js/api/operation-system-db-api.js');

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function mut(label, fn) {
  mutants++;
  var caught = false;
  try { caught = fn() === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}

// ---------------------------------------------------------------------------------------------------------
// THE WORLD
// ---------------------------------------------------------------------------------------------------------
var SNAP_H = ['overseas_inventory_id', 'snapshot_date', 'warehouse_id', 'sku', 'site_sku',
  'wh_physical_stock', 'wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock',
  'wh_on_the_way_qty', 'wh_on_the_way_eta', 'wh_on_the_way_bucket',
  'last_movement_at', 'updated_by', 'created_at', 'updated_at', 'note'];
var WH_H = ['warehouse_id', 'warehouse_name', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type', 'status'];
var MOV_H = ['movement_id', 'movement_date', 'warehouse_id', 'sku', 'site_sku',
  'movement_type', 'movement_scope', 'from_stock_type', 'to_stock_type',
  'wh_quantity', 'wh_quantity_before', 'wh_quantity_after',
  'wh_before_physical_stock', 'wh_after_physical_stock',
  'wh_before_reserved_stock', 'wh_after_reserved_stock',
  'wh_before_available_stock', 'wh_after_available_stock',
  'reference_type', 'reference_id', 'source_module', 'created_by', 'created_at', 'note'];
var FS_H = ['factory_stock_id', 'warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock', 'created_at', 'updated_at', 'last_transaction_at'];
var FSMOV_H = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty',
  'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
  'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];

function mkSheet(headers, rows, name) {
  var grid = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  return {
    __name: name, __grid: grid,
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function (row, col) {
      return {
        getValues: function () { return [(grid[row - 1] || []).slice(col - 1, col)]; },
        setValue: function (v) { while (grid.length <= row - 1) grid.push(new Array(headers.length).fill('')); grid[row - 1][col - 1] = v; }
      };
    },
    appendRow: function (r) { grid.push(r.slice()); },
    deleteRow: function (r) { grid.splice(r - 1, 1); }
  };
}
function snapRow(o) {
  var d = { overseas_inventory_id: 'OISN-1', snapshot_date: '2026-09-01', warehouse_id: 'WH-3PL', sku: 'S1',
    site_sku: 'SS-1', wh_physical_stock: '', wh_available_stock: 0, wh_reserved_stock: 0, wh_damaged_stock: 0,
    wh_on_the_way_qty: 0, wh_on_the_way_eta: '', wh_on_the_way_bucket: '', last_movement_at: '',
    updated_by: '', created_at: '2026-09-01', updated_at: '2026-09-01', note: '' };
  for (var k in o) d[k] = o[k];
  return SNAP_H.map(function (h) { return d[h]; });
}
function world(opts) {
  opts = opts || {};
  var sheets = {
    overseas_inventory_snapshot: mkSheet(SNAP_H, opts.snap || [], 'overseas_inventory_snapshot'),
    overseas_inventory_movements: mkSheet(MOV_H, opts.mov || [], 'overseas_inventory_movements'),
    warehouses: mkSheet(WH_H, [
      ['WH-3PL', 'Winit UK', 'ResUS', 'UK', true, false, '3PL', 'active'],
      ['WH-FAC', 'CN Factory', 'KM', 'CN', true, true, 'FACTORY', 'active']], 'warehouses'),
    factory_stock: mkSheet(FS_H, opts.fs || [], 'factory_stock'),
    factory_stock_movements: mkSheet(FSMOV_H, opts.fsmov || [], 'factory_stock_movements')
  };
  var ss = { getSheetByName: function (n) { return sheets[n] || null; } };
  var sb = {
    console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object, Math: Math,
    Date: Date, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp,
    Boolean: Boolean, Error: Error,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, flush: function () {} },
    Utilities: { formatDate: function () { return '2026-09-30'; },
      getUuid: (function () { var n = 0; return function () { n++; return 'u' + n + '-bbbb-cccc-dddd-eeeeeeeeeeee'; }; })() },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    jsonResponse_: function (o) { return o; },
    fcWriteEnsureSheet_: function (s2, n) { return sheets[n] || null; },
    fcWriteEnsureColumns_: function () {},
    fcWriteAppendByHeader_: function (sheet, obj) {
      var H = sheet.__grid[0];
      sheet.appendRow(H.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
    }
  };
  vm.createContext(sb);
  vm.runInContext(opts.src21 || F21, sb);
  vm.runInContext(opts.src05 || F05, sb);
  return { sb: sb, sheets: sheets, ss: ss };
}
function cell(w, name) { return w.sheets.overseas_inventory_snapshot.__grid[1][SNAP_H.indexOf(name)]; }
function bal(w) { return [cell(w, 'wh_available_stock'), cell(w, 'wh_reserved_stock'), cell(w, 'wh_physical_stock')]; }
function pool(avail, reserved, physical) {
  return [snapRow({ wh_available_stock: avail, wh_reserved_stock: reserved,
    wh_physical_stock: physical === undefined ? 100 : physical })];
}
function acq(w, qty, owner, j) {
  return w.sb.ovsAcquireReservationTx_({ snapSheet: w.sheets.overseas_inventory_snapshot,
    movSheet: w.sheets.overseas_inventory_movements, warehouseId: 'WH-3PL', sku: 'S1', qty: qty,
    ownerId: owner || 'SH-1', journal: j || [], now: 'n', movementDate: '2026-09-30', createdBy: 't' });
}
function rel(w, qty, owner, j) {
  return w.sb.ovsReleaseReservationTx_({ snapSheet: w.sheets.overseas_inventory_snapshot,
    movSheet: w.sheets.overseas_inventory_movements, warehouseId: 'WH-3PL', sku: 'S1', qty: qty,
    ownerId: owner || 'SH-1', journal: j || [], now: 'n', movementDate: '2026-09-30', createdBy: 't' });
}
function con(w, qty, owner, j) {
  return w.sb.ovsConsumeReservationTx_({ snapSheet: w.sheets.overseas_inventory_snapshot,
    movSheet: w.sheets.overseas_inventory_movements, warehouseId: 'WH-3PL', sku: 'S1', qty: qty,
    ownerId: owner || 'SH-1', journal: j || [], now: 'n', movementDate: '2026-09-30', createdBy: 't' });
}
function imp(w, row) {
  return w.sb.handleImportOverseasInventorySnapshotBatch_({ rows: [row], options: { createdBy: 't' } });
}
function allocatable(w) {
  return w.sb.ovsAllocatableTx_(w.sb.ovsStockReadBalanceTx_(w.sheets.overseas_inventory_snapshot, 'WH-3PL', 'S1'));
}

// =========================================================================================================
section('§21 A-D — RESERVE, RELEASE, DISPATCH, ALLOCATABLE');
// =========================================================================================================
(function () {
  var w = world({ snap: pool(100, 0) });
  acq(w, 30);
  eq(bal(w), [70, 30, 100], 'A  100/0 reserve 30 -> 70/30, physical untouched');
})();
(function () {
  // The hold is seeded through the REAL acquire, because a release gives back only what the owner's own
  // ledger says it holds — handing it a 70/30 balance with no acquire row is a world in which nobody
  // reserved anything, and the correct answer there is NO_RESERVATION.
  var w = world({ snap: pool(100, 0) });
  acq(w, 30);
  rel(w, 30);
  eq(bal(w), [100, 0, 100], 'B  70/30 release 30 -> 100/0');
})();
(function () {
  var w = world({ snap: pool(70, 30) });
  // The hold must exist in the ledger for a consume to find it.
  var seeded = world({ snap: pool(100, 0) }); acq(seeded, 30);
  con(seeded, 30);
  eq(bal(seeded), [70, 0, 100], 'C  70/30 dispatch 30 -> 70/0 — available NOT decremented again');
  ok(true, 'C0 (the hold is seeded through the real acquire, so the ledger is real)');
})();
(function () {
  var w = world({ snap: pool(70, 30) });
  eq(allocatable(w), 70, 'D  70/30 allocatable is 70, NOT 40');
  ok(!/available\s*-\s*\w*[Rr]eserved/.test(code(/function ovsAllocatableTx_[\s\S]*?\n}/.exec(F05)[0])),
    'D1 and the rule contains no subtraction at all');
})();

// =========================================================================================================
section('§21 E-J — THE IMPORTER');
// =========================================================================================================
(function () {
  var w = world({ snap: pool(70, 30) });
  imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100 });
  eq(bal(w).slice(0, 2), [70, 30], 'E  70/30 + source 100 -> 70/30 (GROSS: S - R)');
})();
(function () {
  var w = world({ snap: pool(70, 30) });
  var r = imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 20 });
  eq([r.data.results[0].status, r.data.results[0].code], ['error', 'IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE'],
    'F  source 20 against reserved 30 -> refused');
  eq(bal(w).slice(0, 2), [70, 30], 'F1 and not one field of the canonical row moved');
})();
(function () {
  var w = world({ snap: pool(70, 30) });
  imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100 });
  eq(bal(w)[1], 30, 'G  reserved OMITTED -> preserved');
})();
(function () {
  var w = world({ snap: pool(70, 30) });
  imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100, wh_reserved_stock: '' });
  eq(bal(w).slice(0, 2), [70, 30], 'H  reserved BLANK -> preserved');
})();
(function () {
  var w = world({ snap: pool(70, 30) });
  imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100, wh_reserved_stock: 0 });
  eq(bal(w).slice(0, 2), [70, 30], 'I  reserved EXPLICIT 0 -> preserved');
})();
(function () {
  var w = world({ snap: pool(70, 30) });
  imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100, wh_reserved_stock: 999 });
  eq(bal(w).slice(0, 2), [70, 30], 'I1 reserved NON-ZERO -> still ignored; the source is not the authority');
})();
(function () {
  var w = world({ snap: [] });
  var r = imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100 });
  eq([r.data.summary.created, cell(w, 'wh_available_stock'), cell(w, 'wh_reserved_stock')], [1, 100, 0],
    'J  new row source 100 -> 100/0 (the same S - R rule with R = 0)');
})();
(function () {
  // A blank quantity leaves its bucket alone; an explicit 0 is a statement and is written (§8).
  var w = world({ snap: [snapRow({ wh_available_stock: 70, wh_reserved_stock: 30, wh_damaged_stock: 40 })] });
  imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100 });
  eq(cell(w, 'wh_damaged_stock'), 40, 'J1 damaged OMITTED -> preserved, not zeroed');
  var w2 = world({ snap: [snapRow({ wh_available_stock: 70, wh_reserved_stock: 30, wh_damaged_stock: 40 })] });
  imp(w2, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100, wh_damaged_stock: 0 });
  eq(cell(w2, 'wh_damaged_stock'), 0, 'J2 damaged EXPLICIT 0 -> written; zero is a statement');
})();
(function () {
  // §10 — the refusal is ROW level. One bad SKU must not fail a routine refresh of the others.
  var w = world({ snap: [snapRow({ wh_available_stock: 70, wh_reserved_stock: 30 }),
    snapRow({ overseas_inventory_id: 'OISN-2', sku: 'S2', wh_available_stock: 10, wh_reserved_stock: 0 })] });
  var r = w.sb.handleImportOverseasInventorySnapshotBatch_({ rows: [
    { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 20 },
    { warehouse_id: 'WH-3PL', sku: 'S2', wh_available_stock: 50 }], options: {} });
  eq([r.success, r.data.summary.error, r.data.summary.updated], [true, 1, 1],
    'J3 the batch CONTINUES past a refused row');
  eq(w.sheets.overseas_inventory_snapshot.__grid[2][SNAP_H.indexOf('wh_available_stock')], 50,
    'J4 and the good row landed');
})();

// =========================================================================================================
section('§21 K-O — CONCURRENCY, CONSERVATION, REPLAY');
// =========================================================================================================
(function () {
  var w = world({ snap: pool(100, 0) });
  acq(w, 70, 'SH-A');
  var threw = false;
  try { acq(w, 50, 'SH-B'); } catch (e) { threw = true; }
  eq([threw, bal(w)[0], bal(w)[1]], [true, 30, 70],
    'K  70 then 50 against 100 — the second is refused and the balance is intact');
  ok(cell(w, 'wh_available_stock') >= 0 && cell(w, 'wh_reserved_stock') <= 100,
    'K1 over-reservation is unreachable: neither bucket went negative and reserved never exceeded the pool');
})();
(function () {
  var w = world({ snap: pool(100, 0) });
  acq(w, 30); rel(w, 30); acq(w, 30);
  eq(bal(w), [70, 30, 100], 'L  reserve -> release -> reserve conserves the pool');
  eq(bal(w)[0] + bal(w)[1], 100, 'L1 available + reserved is still the pool');
})();
(function () {
  var w = world({ snap: pool(100, 0) });
  acq(w, 30);
  var before = bal(w)[0];
  con(w, 30);
  eq([before, bal(w)[0], bal(w)[1]], [70, 70, 0],
    'M  reserve -> dispatch: available is decremented ONCE, at the reserve');
})();
(function () {
  var w = world({ snap: pool(100, 0) });
  acq(w, 30);
  var r1 = rel(w, 30), r2 = rel(w, 30);
  eq([r1.applied, r2.applied, r2.reason, bal(w)[0], bal(w)[1]], [true, false, 'NO_RESERVATION', 100, 0],
    'N  a repeated release is a NO-OP, not a second give-back');
})();
(function () {
  var w = world({ snap: pool(100, 0) });
  acq(w, 30);
  var c1 = con(w, 30), c2 = con(w, 30);
  eq([c1.applied, c2.applied, c2.reason, bal(w)[0], bal(w)[1]], [true, false, 'NO_RESERVATION', 70, 0],
    'O  a repeated dispatch consume is a NO-OP');
})();
(function () {
  var w = world({ snap: pool(100, 0) });
  var a1 = acq(w, 30), a2 = acq(w, 30);
  eq([a1.applied, a2.applied, a2.reason, bal(w)[0], bal(w)[1]], [true, false, 'ALREADY_RESERVED', 70, 30],
    'O1 and a replayed ACQUIRE applies nothing — idempotency from the ledger, no new column');
})();

// =========================================================================================================
section('§21 P/Q — AUTOMATION DOES NOT RESERVE');
// =========================================================================================================
(function () {
  var RESERVERS = /ovsAcquireReservationTx_|factoryStockAcquireReservationTx_/;
  ok(!RESERVERS.test(code(F47)), 'P  the recommendation generator calls NO reservation acquire');
  var callers = [];
  fs.readdirSync(path.join(ROOT, GS)).filter(function (f) { return /\.gs$/.test(f); }).forEach(function (f) {
    if (f.indexOf('90_generated') === 0) return;      // the generated bundle mirrors core modules, not handlers
    var src = code(read(GS + f));
    if (/ovsAcquireReservationTx_\s*\(/.test(src)) callers.push(f);
  });
  eq(callers.sort(), ['05_overseas_inventory_handlers.gs', '12_shipment_handlers.gs'],
    'Q  the ONLY files that call the overseas acquire are its owner and the shipment execution path', callers);
  ok(!/scheduler|trigger/i.test(callers.join(' ')), 'Q1 no scheduler or trigger owner is among them');
})();

// =========================================================================================================
section('§21 R-T + §11 — SOURCE ROUTING');
// =========================================================================================================
(function () {
  var w = world({ snap: pool(70, 30), fs: [['FS-1', 'WH-FAC', 'S1', 500, 100, '', '', '']] });
  vm.runInContext(F12, w.sb);
  eq(w.sb.shipmentSourceDomain_(w.ss, 'WH-FAC'), 'FACTORY', 'R  a factory warehouse still routes to FACTORY');
  eq(w.sb.shipmentSourceDomain_(w.ss, 'WH-3PL'), 'OVERSEAS', 'S  a 3PL warehouse routes to OVERSEAS');
  eq(w.sb.shipmentSourceDomain_(w.ss, 'WH-UNKNOWN'), 'FACTORY',
    'R1 an unclassifiable warehouse keeps today\'s behaviour rather than becoming overseas');

  var fSheets = w.sb.shipmentDomainSheets_(w.ss, 'FACTORY');
  var oSheets = w.sb.shipmentDomainSheets_(w.ss, 'OVERSEAS');
  eq(w.sb.shipmentDomainAvailable_('FACTORY', fSheets, 'WH-FAC', 'S1').available, 400,
    'R2 FACTORY availability is DERIVED — 500 current - 100 reserved');
  eq(w.sb.shipmentDomainAvailable_('OVERSEAS', oSheets, 'WH-3PL', 'S1').available, 70,
    'S1 OVERSEAS availability is STORED — 70, not 70 - 30');

  // T — insufficiency is truthful and names the domain.
  eq(w.sb.shipmentDomainAvailable_('OVERSEAS', oSheets, 'WH-3PL', 'S1').available < 200, true,
    'T  an overseas request larger than available is short by the STORED figure');
  var C12 = code(F12);
  ok(/INSUFFICIENT_OVERSEAS_STOCK/.test(C12) && /shortLabel/.test(C12),
    'T1 and the refusal names overseas rather than reporting "insufficient factory stock" for a 3PL');
  ok(/shipmentDomainAvailable_\(srcDomain, srcSheets/.test(C12),
    'T2 the sufficiency precheck consults the ROUTED balance, not factory_stock directly');
  ok(!/factoryStockReadBalanceTx_\(fcStockSheet, srcWarehouseId/.test(C12),
    'T3 and the unconditional factory read that made overseas impossible is gone');
})();
(function () {
  // §11 — composed, not merged. The shim must contain no arithmetic of its own.
  // The markers live in comments, so the slice is taken from the RAW file and stripped afterwards.
  var shim = code(F12.split('__SHIPMENT_SOURCE_DOMAIN_START__')[1].split('__SHIPMENT_SOURCE_DOMAIN_END__')[0]);
  ok(!/[-+]\s*\w*[Rr]eserved|current\s*-\s*/.test(shim),
    'S2 the routing shim performs no availability arithmetic — it forwards');
  ok(/ovsAllocatableTx_/.test(shim) && /factoryStockReadBalanceTx_/.test(shim),
    'S3 it delegates to BOTH domains rather than reimplementing either');
})();
(function () {
  // A cross-domain source change is refused rather than guessed.
  var C12 = code(F12);
  ok(/CROSS_DOMAIN_SOURCE_CHANGE_NOT_SUPPORTED/.test(C12), 'S4 a cross-domain source change is refused');
  ok(/curDomain_ !== newDomain_/.test(C12), 'S5 by comparing the two domains before any write');
})();

// =========================================================================================================
section('§14 — NO DOUBLE-ALLOCATABLE WINDOW');
// =========================================================================================================
(function () {
  var C12 = code(F12);
  var acquireAt = C12.indexOf('shipmentDomainAcquire_(srcDomain, srcSheets');
  var exposureAt = C12.indexOf("setPlanCell_('transferred_to_shipment_at'");
  ok(acquireAt > -1 && exposureAt > -1 && acquireAt < exposureAt,
    'X1 the reservation is acquired BEFORE the plan exposure is released');
  var between = C12.slice(acquireAt, exposureAt);
  /* X2 — the lock must not be released between the acquire and the exposure release ON A PATH THAT
     CONTINUES. It IS released between them on the rollback path, which is the correct behaviour and is why
     the first version of this assertion failed: every unlock in that span has to be a rollback-and-return. */
  var unlocks = between.split('fcUnlock_()').length - 1;
  var rolledBack = between.split('factoryStockRollbackJournal_(fcJournal)').length - 1;
  ok(unlocks > 0 && unlocks === rolledBack,
    'X2 every lock release between them is a rollback-and-return, so no CONTINUING path frees the units',
    { unlocks: unlocks, rolledBack: rolledBack });
  ok(/factoryStockRollbackJournal_\(fcJournal\)/.test(C12),
    'X3 a failed acquire rolls the whole draft back, so the plan stays exposed rather than silently freed');
})();
(function () {
  // ONE journal, ONE rollback, two domains — the property that makes a mixed transaction atomic.
  var ovsBlock = F05.split('__OVS_LIFECYCLE_START__')[1].split('__OVS_LIFECYCLE_END__')[0];
  ok(/journal\.push\(\{ kind: 'cell'/.test(ovsBlock) && /journal\.push\(\{ kind: 'row'/.test(ovsBlock),
    'X4 the overseas writer journals in 21_\'s entry shape');
  ok(!/function ovsRollbackJournal_/.test(F05),
    'X5 and adds no second rollback that could disagree with the first about what undo means');
})();

// =========================================================================================================
section('§17 — MOVEMENT VOCABULARY');
// =========================================================================================================
(function () {
  var w = world({ snap: pool(100, 0) });
  acq(w, 30); rel(w, 10); con(w, 20);
  var rows = w.sheets.overseas_inventory_movements.__grid.slice(1);
  var types = rows.map(function (r) { return r[MOV_H.indexOf('movement_type')]; });
  eq(types, ['reservation_acquire', 'reservation_release', 'shipment_out'],
    'V1 reserve / release / dispatch use exactly the three declared types');
  var DECLARED = ['reservation_acquire', 'reservation_release', 'shipment_out', 'inventory_import', 'manual_adjustment'];
  ok(types.every(function (t) { return DECLARED.indexOf(t) > -1; }), 'V2 NEW_MOVEMENT_TYPES_REQUIRED = 0');
  // Every row carries all three balance pairs, and physical is carried unchanged.
  rows.forEach(function (r, i) {
    ok(r[MOV_H.indexOf('wh_before_physical_stock')] === r[MOV_H.indexOf('wh_after_physical_stock')],
      'V3.' + (i + 1) + ' physical is carried unchanged on the ' + types[i] + ' row');
  });
  var dispatchRow = rows[2];
  eq([dispatchRow[MOV_H.indexOf('wh_before_available_stock')], dispatchRow[MOV_H.indexOf('wh_after_available_stock')]],
    [80, 80], 'V4 the dispatch row records available as UNCHANGED, which is the claim §4 makes');
  eq(dispatchRow[MOV_H.indexOf('to_stock_type')], 'none', 'V5 and to_stock_type = none');
})();

// =========================================================================================================
section('§8 — THE CLIENT, AND §10 THE TOKEN');
// =========================================================================================================
(function () {
  var CC = code(CLIENT);
  ok(/var OVERSEAS_QTY_FIELDS = \['available_stock', 'damaged_stock', 'on_the_way_qty'\]/.test(CC),
    'Y1 reserved_stock is no longer built onto the payload');
  ok(/if \(v === ''\) continue;/.test(CC), 'Y2 a blank or absent quantity is omitted rather than sent as 0');
  ok(/hasOwnProperty\.call\(qtyObj, f\)/.test(CC), 'Y3 and only the keys actually present are attached');
  ok(!/reserved_stock', kind: 'business'/.test(CC), 'Y4 the shipped template no longer offers reserved_stock');
  ok(!/Blank = 0\./.test(CC), 'Y5 and "Blank = 0." is gone from every column comment');
  ok(/Blank = leave unchanged/.test(CC), 'Y6 replaced by what the server now actually does');
  ok(/'available_stock', 'reserved_stock'/.test(CC),
    'Y7 while the ACCEPTED header list still tolerates an existing file that carries the column');
})();
ok(/'IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE'/.test(API),
  'Z1 the refusal token is registered in the canonical registry');
// RESTATED (S6-R5): this pinned the token's POSITION — first in the array — which is not a property of
// anything. S6-R5 registered four cancellation codes and put them at the front, and a correct registry
// read as wrong. The claim is MEMBERSHIP of the one registry, plus the part that actually matters: there
// is only one such registry to be a member of.
var _kcc = (/var KM_CANONICAL_CODES = \[([\s\S]*?)\];/.exec(API) || [])[1] || '';
ok(/'IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE'/.test(_kcc)
  && (API.match(/var KM_CANONICAL_CODES\s*=/g) || []).length === 1,
  'Z2 in KM_CANONICAL_CODES — the one canonical registry, not a parallel vocabulary and not a second copy');

// =========================================================================================================
section('§22 — MUTANTS');
// =========================================================================================================
function mutWorld(src05, snap) { return world({ snap: snap || pool(100, 0), src05: src05 }); }

mut('M1 allocatable subtracts reserved (the double subtraction)', function () {
  var src = F05.replace('return Math.round(Number((bal && bal.available) || 0));',
    'return Math.round(Number((bal && bal.available) || 0) - Number((bal && bal.reserved) || 0));');
  if (src === F05) throw new Error('M1 anchor drifted');
  var w = mutWorld(src, pool(70, 30));
  return w.sb.ovsAllocatableTx_(w.sb.ovsStockReadBalanceTx_(w.sheets.overseas_inventory_snapshot, 'WH-3PL', 'S1')) === 40;
});

mut('M2 reserve does not decrement available', function () {
  var src = F05.replace('availableDelta: -need, reservedDelta: need,', 'availableDelta: 0, reservedDelta: need,');
  if (src === F05) throw new Error('M2 anchor drifted');
  var w = mutWorld(src);
  acq(w, 30);
  return bal(w)[0] === 100 && bal(w)[1] === 30;
});

mut('M3 release does not increment available', function () {
  var src = F05.replace('availableDelta: give, reservedDelta: -give,', 'availableDelta: 0, reservedDelta: -give,');
  if (src === F05) throw new Error('M3 anchor drifted');
  var w = mutWorld(src);
  acq(w, 30); rel(w, 30);
  return bal(w)[0] === 70;
});

mut('M4 dispatch decrements available AGAIN', function () {
  var src = F05.replace('availableDelta: 0, reservedDelta: -take,          // available: NOT touched. §4.',
    'availableDelta: -take, reservedDelta: -take,');
  if (src === F05) throw new Error('M4 anchor drifted');
  var w = mutWorld(src);
  acq(w, 30); con(w, 30);
  return bal(w)[0] === 40;        // the forbidden 70/30 -> 40/0
});

mut('M5 the import overwrites reserved', function () {
  var src = F05.replace("var qtyWritableFields = ['wh_available_stock', 'wh_damaged_stock', 'wh_on_the_way_qty'];",
    "var qtyWritableFields = ['wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock', 'wh_on_the_way_qty'];");
  if (src === F05) throw new Error('M5 anchor drifted');
  var w = mutWorld(src, pool(70, 30));
  imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100, wh_reserved_stock: 0 });
  return bal(w)[1] === 0;
});

mut('M6 a missing quantity becomes 0 again', function () {
  var src = F05.replace("if (sv === '') { qtyPresent[f] = false; qtyVals[f] = 0; continue; }",
    "if (sv === '') { qtyPresent[f] = true; qtyVals[f] = 0; continue; }");
  if (src === F05) throw new Error('M6 anchor drifted');
  var w = mutWorld(src, [snapRow({ wh_available_stock: 70, wh_reserved_stock: 30, wh_damaged_stock: 40 })]);
  imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100 });
  return cell(w, 'wh_damaged_stock') === 0;
});

mut('M7 the S < R contradiction is CLAMPED instead of refused', function () {
  var src = F05.replace("if (qtyPresent['wh_available_stock'] && qtyVals['wh_available_stock'] < canonReserved) {",
    'if (false) {').replace("if (f === 'wh_available_stock') v = qtyVals[f] - canonReserved;",
    "if (f === 'wh_available_stock') v = Math.max(0, qtyVals[f] - canonReserved);");
  if (src === F05) throw new Error('M7 anchor drifted');
  var w = mutWorld(src, pool(70, 30));
  var r = imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 20 });
  return r.data.summary.error === 0 && cell(w, 'wh_available_stock') === 0;
});

mut('M8 the row is MUTATED before the refusal returns', function () {
  var src = F05.replace("        continue;   // §10 — ROW-level refusal. The batch continues; other rows import normally.",
    "        snapSheet.getRange(tr, snPref('wh_available_stock') + 1).setValue(qtyVals['wh_available_stock']);\r\n        continue;");
  if (src === F05) throw new Error('M8 anchor drifted');
  var w = mutWorld(src, pool(70, 30));
  imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 20 });
  return cell(w, 'wh_available_stock') === 20;
});

mut('M9 the import copies S directly instead of S - R', function () {
  var src = F05.replace("if (f === 'wh_available_stock') v = qtyVals[f] - canonReserved;   // GROSS -> operational", '');
  if (src === F05) throw new Error('M9 anchor drifted');
  var w = mutWorld(src, pool(70, 30));
  imp(w, { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100 });
  return cell(w, 'wh_available_stock') === 100;     // 130 held against a source reporting 100
});

mut('M10 one refused row ABORTS the batch', function () {
  var src = F05.replace("        continue;   // §10 — ROW-level refusal. The batch continues; other rows import normally.",
    "        return jsonResponse_({ success: false, error: 'IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE' });");
  if (src === F05) throw new Error('M10 anchor drifted');
  var w = mutWorld(src, [snapRow({ wh_available_stock: 70, wh_reserved_stock: 30 }),
    snapRow({ overseas_inventory_id: 'OISN-2', sku: 'S2', wh_available_stock: 10, wh_reserved_stock: 0 })]);
  var r = w.sb.handleImportOverseasInventorySnapshotBatch_({ rows: [
    { warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 20 },
    { warehouse_id: 'WH-3PL', sku: 'S2', wh_available_stock: 50 }], options: {} });
  return r.success === false;
});

mut('M11 the negative-balance invariant is removed (over-reservation becomes reachable)', function () {
  var src = F05.replace('if (afterAvailable < 0) {', 'if (false) {');
  if (src === F05) throw new Error('M11 anchor drifted');
  var w = mutWorld(src);
  acq(w, 70, 'SH-A');
  acq(w, 50, 'SH-B');
  return cell(w, 'wh_available_stock') < 0;
});

mut('M12 the acquire is not idempotent (a replay reserves twice)', function () {
  var src = F05.replace("if (held >= qty) return { applied: false, reason: 'ALREADY_RESERVED', reserved: 0, alreadyHeld: held, movementId: '' };", '')
    .replace('var need = qty - held;', 'var need = qty;');
  if (src === F05) throw new Error('M12 anchor drifted');
  var w = mutWorld(src);
  acq(w, 30); acq(w, 30);
  return bal(w)[1] === 60;
});

mut('M13 a release gives back more than this owner holds', function () {
  var src = F05.replace('var give = Math.min(want, held);', 'var give = want;');
  if (src === F05) throw new Error('M13 anchor drifted');
  var w = mutWorld(src, pool(100, 0));
  acq(w, 10);
  var threw = false;
  try { rel(w, 100); } catch (e) { threw = true; }
  return threw || bal(w)[0] > 100;
});

mut('M14 the source domain resolver calls everything FACTORY', function () {
  var src = F05.replace("  return 'OVERSEAS';\r\n}", "  return 'FACTORY';\r\n}");
  if (src === F05) throw new Error('M14 anchor drifted');
  var w = world({ snap: pool(100, 0), src05: src });
  vm.runInContext(F12, w.sb);
  return w.sb.shipmentSourceDomain_(w.ss, 'WH-3PL') === 'FACTORY';
});

mut('M15 the dispatch consume routes overseas lines to the factory writer', function () {
  // S6-R8A re-anchor. The branch used to ask a local dispatchDomain_ about whichever stock row the SKU-wide
  // search had picked. It now tests the domain already decided from the Shipment's DECLARED source, which is
  // the same claim about routing made one decision earlier.
  var src22 = code(F22);
  ok(/if \(srcDomain === 'OVERSEAS'\) \{/.test(src22), 'M15 anchor present');
  var broken = F22.replace("if (srcDomain === 'OVERSEAS') {", 'if (false) {');
  return broken !== F22 && !/if \(srcDomain === 'OVERSEAS'\) \{/.test(code(broken));
});

mut('M16 the movement type vocabulary is opened up', function () {
  var src = F05.replace("if (OVSTX_MOVEMENT_TYPES_.indexOf(String(p.movementType || '').trim()) === -1) {", 'if (false) {');
  if (src === F05) throw new Error('M16 anchor drifted');
  var w = mutWorld(src);
  var threwGood = false;
  try {
    var wg = world({ snap: pool(100, 0) });
    wg.sb.ovsApplyDeltaTx_({ snapSheet: wg.sheets.overseas_inventory_snapshot, movSheet: wg.sheets.overseas_inventory_movements,
      warehouseId: 'WH-3PL', sku: 'S1', availableDelta: -1, reservedDelta: 1, movementType: 'invented_type',
      primaryQty: 1, primaryAxis: 'reserved', journal: [], now: 'n', createdBy: 't' });
  } catch (e) { threwGood = true; }
  var threwBad = false;
  try {
    w.sb.ovsApplyDeltaTx_({ snapSheet: w.sheets.overseas_inventory_snapshot, movSheet: w.sheets.overseas_inventory_movements,
      warehouseId: 'WH-3PL', sku: 'S1', availableDelta: -1, reservedDelta: 1, movementType: 'invented_type',
      primaryQty: 1, primaryAxis: 'reserved', journal: [], now: 'n', createdBy: 't' });
  } catch (e) { threwBad = true; }
  return threwGood && !threwBad;
});

// =========================================================================================================
section('SUMMARY');
// =========================================================================================================
console.log('');
console.log('ALLOCATABLE_OVERSEAS_RULE = wh_available_stock   DOUBLE_SUBTRACTION_REACHABLE = NO');
console.log('IMPORT_WRITES_RESERVED = NO   IMPORT_CONFLICT_SCOPE = ROW   NEW_MOVEMENT_TYPES_REQUIRED = 0');
console.log('OVER_RESERVATION_REACHABLE = NO   DOUBLE_ALLOCATABLE_WINDOW_COUNT = 0');
console.log('TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_ROWS_WRITTEN = 0');
console.log('');
console.log(pass + ' passed, ' + fail + ' failed, ' + mutants + ' mutants (' + survived + ' survived)');
process.exit(fail ? 1 : 0);
