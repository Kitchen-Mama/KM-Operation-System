// S6-R8 — THE PHASE-1 SHIPPING / INVENTORY EXECUTION MAINLINE, DRIVEN END TO END.
//
// Every earlier S6 round proved one seam. This one drives the whole line in one world and asserts that the
// seams agree with each other:
//
//   approved plan -> shipment -> source-domain reservation -> dispatch -> route -> delivered
//                 -> warehouse receipt -> destination inventory -> movement ledger
//
// WHAT THIS SUITE REFUSES TO DO. It does not re-implement a single rule it checks. Every number below comes
// out of the real handlers in 05_, 11_, 12_, 21_, 22_ and 31_, loaded into one sandbox over fake sheets. A
// second copy of the arithmetic here would agree with itself and prove nothing about what production does.
//
// THE ONE ARITHMETIC THE WHOLE ROUND TURNS ON, restated because it is still the thing most easily lost:
//
//   FACTORY    availability is DERIVED     available = fac_current_stock - fac_reserved_stock
//   OVERSEAS   availability is STORED      wh_available_stock IS the allocatable quantity
//
// So 70/30 overseas is SEVENTY allocatable and a dispatch of 30 leaves 70/0 — never 40. §D drives it and the
// mutants plant the wrong answer in both directions.
//
// AND THE SEPARATION THAT IS NOT ARITHMETIC AT ALL: a shipment reaching `delivered` moves no inventory. The
// warehouse RECEIPT does, through its own exactly-once ledger. §E drives both halves of that.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. NO CLOCK BEYOND A FIXED FIXTURE STRING.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s6-r8-mainline-final-integration.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var GS = 'specs/active/apps-script/';
var F05 = read(GS + '05_overseas_inventory_handlers.gs');
var F11 = read(GS + '11_shipping_plan_handlers.gs');
var F12 = read(GS + '12_shipment_handlers.gs');
var F21 = read(GS + '21_factory_inventory_handlers.gs');
var F22 = read(GS + '22_shipment_dispatch_handlers.gs');
var F31 = read(GS + '31_shipment_receipt_route_handlers.gs');
var F47 = read(GS + '47_api_v1_recommendation_generation.gs');
var F57 = read(GS + '57_api_v1_shipment_workspace.gs');
var F61 = read(GS + '61_api_v1_weekly_ai_plan.gs');
var MAP = read('js/pages/global-logistics-map.js');
var SPLAN = read('js/pages/shipping-plan.js');
var SHIST = read('js/pages/shipping-history.js');

var NLX = '\r\n';
var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
// Comments are evidence for a reader and noise for a census: strip them before counting call sites.
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function count(s, re) { return (String(s).match(re) || []).length; }
function mut(label, fn) {
  mutants++;
  var caught = false;
  try { caught = fn() === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}
function swap(src, a, b) {
  if (src.indexOf(a) === -1) throw new Error('swap anchor not found: ' + a);
  return src.replace(a, b);
}

// =========================================================================================================
// THE WORLD — one sandbox, every S6 runtime owner, fake sheets.
// =========================================================================================================
var SNAP_H = ['overseas_inventory_id', 'snapshot_date', 'warehouse_id', 'sku', 'site_sku',
  'wh_physical_stock', 'wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock',
  'wh_on_the_way_qty', 'wh_on_the_way_eta', 'wh_on_the_way_bucket',
  'last_movement_at', 'updated_by', 'created_at', 'updated_at', 'note'];
var MOV_H = ['movement_id', 'movement_date', 'warehouse_id', 'sku', 'site_sku',
  'movement_type', 'movement_scope', 'from_stock_type', 'to_stock_type',
  'wh_quantity', 'wh_quantity_before', 'wh_quantity_after',
  'wh_before_physical_stock', 'wh_after_physical_stock',
  'wh_before_reserved_stock', 'wh_after_reserved_stock',
  'wh_before_available_stock', 'wh_after_available_stock',
  'reference_type', 'reference_id', 'source_module', 'created_by', 'created_at', 'note'];
var FS_H = ['factory_stock_id', 'warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock',
  'created_at', 'updated_at', 'last_transaction_at'];
var FSMOV_H = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty',
  'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
  'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
var WH_H = ['warehouse_id', 'warehouse_name', 'company', 'country', 'is_active',
  'is_factory_warehouse', 'warehouse_type', 'status'];
var SHIP_H = ['shipment_id', 'shipping_plan_id', 'status', 'source_warehouse_id', 'destination_warehouse_id',
  'shipment_received_status', 'etd', 'eta', 'created_at', 'updated_at'];
var SLINE_H = ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty', 'shipment_received_qty', 'updated_at'];

function mkSheet(headers, rows, name) {
  var grid = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  function pad(r) { while (grid.length <= r - 1) grid.push(new Array(headers.length).fill('')); }
  return {
    __name: name, __grid: grid,
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return grid[0].length; },
    getRange: function (row, col, nr, nc) {
      return {
        getValues: function () {
          var o = [];
          for (var i = 0; i < (nr || 1); i++) {
            var l = [];
            for (var j = 0; j < (nc || 1); j++) l.push((grid[row - 1 + i] || [])[col - 1 + j]);
            o.push(l);
          }
          return o;
        },
        getValue: function () { return (grid[row - 1] || [])[col - 1]; },
        setValue: function (v) { pad(row); grid[row - 1][col - 1] = v; },
        setValues: function (v) {
          for (var i = 0; i < v.length; i++) {
            pad(row + i);
            for (var j = 0; j < v[i].length; j++) grid[row - 1 + i][col - 1 + j] = v[i][j];
          }
        }
      };
    },
    appendRow: function (r) { grid.push(r.slice()); },
    deleteRow: function (r) { grid.splice(r - 1, 1); }
  };
}
function row(H, defaults, o) {
  var d = {};
  for (var k in defaults) d[k] = defaults[k];
  for (var k2 in o) d[k2] = o[k2];
  return H.map(function (h) { return d[h] === undefined ? '' : d[h]; });
}
function snapRow(o) {
  return row(SNAP_H, { overseas_inventory_id: 'OISN-1', snapshot_date: '2026-09-01', warehouse_id: 'WH-3PL',
    sku: 'S1', site_sku: 'SS-1', wh_physical_stock: 100, wh_available_stock: 0, wh_reserved_stock: 0,
    wh_damaged_stock: 0, wh_on_the_way_qty: 0, created_at: '2026-09-01', updated_at: '2026-09-01' }, o);
}
function fsRow(o) {
  return row(FS_H, { factory_stock_id: 'FS-1', warehouse_id: 'WH-FAC', sku: 'S1',
    fac_current_stock: 0, fac_reserved_stock: 0, created_at: 'c', updated_at: 'u' }, o);
}
function shipRow(o) {
  return row(SHIP_H, { shipment_id: 'SH-1', shipping_plan_id: '', status: 'draft',
    source_warehouse_id: 'WH-FAC', destination_warehouse_id: 'WH-DEST', created_at: 'c', updated_at: 'u' }, o);
}
function lineRow(o) {
  return row(SLINE_H, { shipment_line_id: 'SL-1', shipment_id: 'SH-1', sku: 'S1',
    shipment_qty: 100, shipment_received_qty: 0, updated_at: 'u' }, o);
}

function world(opts) {
  opts = opts || {};
  var sheets = {
    overseas_inventory_snapshot: mkSheet(SNAP_H, opts.snap || [], 'overseas_inventory_snapshot'),
    overseas_inventory_movements: mkSheet(MOV_H, opts.mov || [], 'overseas_inventory_movements'),
    factory_stock: mkSheet(FS_H, opts.fs || [], 'factory_stock'),
    factory_stock_movements: mkSheet(FSMOV_H, opts.fsmov || [], 'factory_stock_movements'),
    warehouses: mkSheet(WH_H, opts.wh || [
      ['WH-3PL', 'Winit UK', 'ResUS', 'UK', true, false, '3PL', 'active'],
      ['WH-DEST', 'Amazon FBA UK', 'ResUS', 'UK', true, false, '3PL', 'active'],
      ['WH-FAC', 'CN Factory', 'KM', 'CN', true, true, 'FACTORY', 'active']], 'warehouses'),
    shipments: mkSheet(SHIP_H, opts.ships || [], 'shipments'),
    shipment_lines: mkSheet(SLINE_H, opts.lines || [], 'shipment_lines')
  };
  var ss = { getSheetByName: function (n) { return sheets[n] || null; }, getId: function () { return 'PROD-BOOK'; } };
  var sb = {
    console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object, Math: Math,
    Date: Date, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp,
    Boolean: Boolean, Error: Error,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, openById: function () { return ss; },
      flush: function () {} },
    Utilities: { formatDate: function () { return '2026-09-30'; },
      getUuid: (function () { var n = 0; return function () { n++; return 'u' + n + '-bbbb-cccc-dddd-eeeeeeeeeeee'; }; })() },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    jsonResponse_: function (o) { return o; },
    // The live-schema gate. Stubbed because it asks the DEPLOYED book about its columns, which this world
    // does not model; every column these handlers actually read is present in the fixtures above.
    prodRequireColumns_: function () { return true; },
    prodExpectedDbId_: function () { return 'PROD-BOOK'; },
    prodAssertDbTarget_: function () { return true; },
    fcWriteEnsureSheet_: function (s2, n) { return sheets[n] || null; },
    fcWriteEnsureColumns_: function () {},
    fcWriteAppendByHeader_: function (sheet, obj) {
      var H = sheet.__grid[0];
      sheet.appendRow(H.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
    }
  };
  vm.createContext(sb);
  [opts.src21 || F21, opts.src05 || F05, opts.src11 || F11, opts.src12 || F12, opts.src31 || F31]
    .forEach(function (src) { vm.runInContext(src, sb); });
  return { sb: sb, sheets: sheets, ss: ss };
}

function sCell(w, name, r) { return w.sheets.overseas_inventory_snapshot.__grid[r || 1][SNAP_H.indexOf(name)]; }
function ovsBal(w, r) { return [sCell(w, 'wh_available_stock', r), sCell(w, 'wh_reserved_stock', r), sCell(w, 'wh_physical_stock', r)]; }
function facBal(w) {
  var g = w.sheets.factory_stock.__grid[1];
  return [g[FS_H.indexOf('fac_current_stock')], g[FS_H.indexOf('fac_reserved_stock')]];
}
function movTypes(w) {
  return w.sheets.overseas_inventory_movements.__grid.slice(1)
    .map(function (r) { return r[MOV_H.indexOf('movement_type')]; });
}
function facMovTypes(w) {
  return w.sheets.factory_stock_movements.__grid.slice(1)
    .map(function (r) { return r[FSMOV_H.indexOf('movement_type')]; });
}

// =========================================================================================================
section('A — §1 THE OWNER MAP, measured rather than declared');
// =========================================================================================================
// A single owner is not a claim you can make by reading one file; it is a census over every file that could
// have been a second one. Each count below is the number of CALL SITES outside the owning module.
var ALL_GS = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) { return /\.gs$/.test(f); });
function callSitesOutside(fnName, ownerPrefixes) {
  var hits = [];
  ALL_GS.forEach(function (f) {
    if (ownerPrefixes.some(function (p) { return f.indexOf(p) === 0; })) return;
    var src = code(read(GS + f));
    if (new RegExp('(^|[^\\w.])' + fnName + '\\s*\\(').test(src)) hits.push(f);
  });
  return hits;
}
// 13_ IS A LEGITIMATE CALLER AND THE FIRST VERSION OF THIS LINE CALLED IT A DEFECT. The PO receipt raises
// factory stock and it does so THROUGH 21_ — which is the rule working, not breaking. What must be true is
// that there is ONE implementation and the callers are a known, closed set.
eq(callSitesOutside('factoryStockApplyDeltaTx_', ['21_', '22_', '13_']), [],
  'A1  the FACTORY stock mutation is called ONLY by dispatch (22_) and the PO receipt (13_)');
eq(count(code(F21), /function factoryStockApplyDeltaTx_/g), 1,
  'A1a and it is implemented exactly once');
eq(callSitesOutside('ovsApplyDeltaTx_', ['05_']), [],
  'A2  and the OVERSEAS stock mutation is private to 05_ entirely');
eq(callSitesOutside('factoryStockAcquireReservationTx_', ['21_', '12_']), [],
  'A3  factory reserve is acquired only by the shipment owner');
eq(callSitesOutside('ovsAcquireReservationTx_', ['05_', '12_']), [],
  'A4  and so is the overseas reserve — one acquirer, two domains');
eq(callSitesOutside('ovsConsumeReservationTx_', ['05_', '22_']), [],
  'A5  the overseas dispatch consume belongs to the dispatch owner alone');
eq(callSitesOutside('handleConfirmShipmentAndDispatch_', ['22_', '01_']), [],
  'A6  dispatch has ONE entry point, reachable only through the router');
eq(callSitesOutside('handleUpdateShipmentReceipt_', ['31_', '01_']), [],
  'A7  and so does the warehouse receipt');
// The plan status owner. R5 established it and nothing may have added a parallel one since.
eq(callSitesOutside('handleUpdateShippingPlanStatus_', ['11_', '01_']), [],
  'A8  the shipping plan status transition has ONE owner');
ok(count(code(F11), /function handleUpdateShippingPlanStatus_/g) === 1,
  'A8a declared exactly once');
// SECOND_*_OWNER_COUNT, stated as the measurement rather than as a conclusion.
var secondInvOwners = ['factory_stock', 'overseas_inventory_snapshot'].map(function (tbl) {
  return ALL_GS.filter(function (f) {
    if (/^(05_|21_)/.test(f)) return false;
    var src = code(read(GS + f));
    // A write is setValue/setValues/appendRow reached from a sheet named for the balance table.
    return new RegExp("getSheetByName\\(\\s*'" + tbl + "'\\s*\\)[\\s\\S]{0,400}?(setValue|appendRow)").test(src);
  });
});
eq(secondInvOwners, [[], []], 'A9  no module outside 05_/21_ writes either balance table');

// =========================================================================================================
section('B — §2 THE HUMAN AUTHORIZATION BOUNDARY');
// =========================================================================================================
// Phase 1: the system recommends, a human authorizes. The proof is negative and has to be, so it is a census
// over the files that would be the ones to break it.
var RESERVE_CALLS = /(factoryStockAcquireReservationTx_|ovsAcquireReservationTx_|factoryStockReleaseReservationTx_|ovsReleaseReservationTx_|ovsConsumeReservationTx_)\s*\(/g;
eq(count(code(F47), RESERVE_CALLS), 0,
  'B1  the recommendation generator acquires, releases and consumes NOTHING');
eq(count(code(F61), RESERVE_CALLS), 0,
  'B2  and neither does the weekly AI plan — a recommendation is advice, not an allocation');
eq(count(code(F57), RESERVE_CALLS), 0,
  'B3  the shipment workspace READ touches no reservation either');
// A read model that writes is the subtler half of the same rule.
ok(!/getSheetByName\('(factory_stock|overseas_inventory_snapshot)'\)[\s\S]{0,300}?(setValue|appendRow)/.test(code(F57)),
  'B4  and it writes no balance row while answering a read');
eq(count(code(F57), /\bhandleConfirmShipmentAndDispatch_|handleCreateShipmentFromPlan_/g), 0,
  'B5  nor does opening a page create or dispatch a shipment');
// The scheduler. Whatever it runs, it is not an execution path.
var SCHED = ALL_GS.filter(function (f) { return /^4[05]_|^45_/.test(f); });
var schedReserve = SCHED.filter(function (f) { return RESERVE_CALLS.test(code(read(GS + f))); });
eq(schedReserve, [], 'B6  no scheduled automation reserves stock');

// =========================================================================================================
section('C — §4 THE FACTORY SOURCE PATH, driven');
// =========================================================================================================
(function () {
  var w = world({ fs: [fsRow({ fac_current_stock: 100, fac_reserved_stock: 0 })] });
  var j = [];
  w.sb.factoryStockAcquireReservationTx_({ stockSheet: w.sheets.factory_stock,
    movSheet: w.sheets.factory_stock_movements, warehouseId: 'WH-FAC', sku: 'S1', qty: 30,
    ownerId: 'SH-1', journal: j, now: 'n', movementDate: '2026-09-30', createdBy: 't' });
  eq(facBal(w), [100, 30], 'C1  factory reserve raises RESERVED and leaves current alone — availability is derived');
  eq(facMovTypes(w), ['reservation_acquire'], 'C1a one movement, named for what happened');
  eq(w.sheets.overseas_inventory_snapshot.__grid.length, 1, 'C1b and the overseas snapshot gained no row at all');
  // Dispatch: current and reserved move together, in ONE row, because they are one fact.
  w.sb.factoryStockApplyDeltaTx_({ stockSheet: w.sheets.factory_stock,
    movSheet: w.sheets.factory_stock_movements, warehouseId: 'WH-FAC', sku: 'S1',
    deltaQty: -30, reservedDelta: -30, journal: j, now: 'n', movementDate: '2026-09-30',
    movementType: 'shipment_out', relatedEntityType: 'shipment', relatedEntityId: 'SH-1', createdBy: 't' });
  eq(facBal(w), [70, 0], 'C2  dispatch deducts current and clears the hold together -> 70/0');
  eq(facMovTypes(w), ['reservation_acquire', 'shipment_out'], 'C2a and the ledger reads as the story');
  eq(w.sheets.overseas_inventory_movements.__grid.length, 1,
    'C3  a FACTORY shipment wrote ZERO overseas movements');
})();

// =========================================================================================================
section('D — §5 THE OVERSEAS SOURCE PATH, driven (the 70/30 case)');
// =========================================================================================================
var OVS_E2E = (function () {
  var w = world({ snap: [snapRow({ wh_available_stock: 100, wh_reserved_stock: 0, wh_physical_stock: 100 })] });
  var j = [];
  function acq(q) {
    return w.sb.ovsAcquireReservationTx_({ snapSheet: w.sheets.overseas_inventory_snapshot,
      movSheet: w.sheets.overseas_inventory_movements, warehouseId: 'WH-3PL', sku: 'S1', qty: q,
      ownerId: 'SH-1', journal: j, now: 'n', movementDate: '2026-09-30', createdBy: 't' });
  }
  acq(30);
  var afterReserve = ovsBal(w);
  w.sb.ovsConsumeReservationTx_({ snapSheet: w.sheets.overseas_inventory_snapshot,
    movSheet: w.sheets.overseas_inventory_movements, warehouseId: 'WH-3PL', sku: 'S1', qty: 30,
    ownerId: 'SH-1', journal: j, now: 'n', movementDate: '2026-09-30', createdBy: 't' });
  return { w: w, afterReserve: afterReserve, afterDispatch: ovsBal(w), types: movTypes(w) };
})();
eq(OVS_E2E.afterReserve, [70, 30, 100], 'D1  100/0 reserve 30 -> 70/30 — a TRANSFER between two stored cells');
eq(OVS_E2E.afterDispatch, [70, 0, 100], 'D2  dispatch 30 -> 70/0, NOT 40/0 — those units left available when reserved');
eq(OVS_E2E.types, ['reservation_acquire', 'shipment_out'], 'D3  and the two movements the spec names, in order');
eq(OVS_E2E.w.sheets.factory_stock_movements.__grid.length, 1,
  'D4  an OVERSEAS shipment wrote ZERO factory movements');
// The allocatable rule, asked of the authority rather than recomputed.
(function () {
  var w = OVS_E2E.w;
  var b = w.sb.ovsStockReadBalanceTx_(w.sheets.overseas_inventory_snapshot, 'WH-3PL', 'S1');
  eq(w.sb.ovsAllocatableTx_(b), 70, 'D5  and 70/0 is 70 allocatable, read from ovsAllocatableTx_ itself');
})();
(function () {
  var w = world({ snap: [snapRow({ wh_available_stock: 70, wh_reserved_stock: 30, wh_physical_stock: 100 })] });
  var b = w.sb.ovsStockReadBalanceTx_(w.sheets.overseas_inventory_snapshot, 'WH-3PL', 'S1');
  eq(w.sb.ovsAllocatableTx_(b), 70, 'D6  §13 70 available / 30 reserved is SEVENTY allocatable — never 40');
})();

// =========================================================================================================
section('E — §6/§11 DELIVERED IS NOT A RECEIPT');
// =========================================================================================================
// Two separate claims. (1) advancing a shipment to `delivered` writes no inventory. (2) the receipt does,
// and through its own exactly-once ledger. Conflating them is how goods appear in a warehouse that has not
// opened the box.
(function () {
  var w = world({
    snap: [snapRow({ warehouse_id: 'WH-DEST', wh_available_stock: 0, wh_reserved_stock: 0, wh_physical_stock: 0 })],
    ships: [shipRow({ shipment_id: 'SH-1', status: 'in_transit', source_warehouse_id: 'WH-FAC',
      destination_warehouse_id: 'WH-DEST' })],
    lines: [lineRow({ shipment_line_id: 'SL-1', shipment_qty: 100, shipment_received_qty: 0 })]
  });
  // §11 — the status writer is 12_'s update handler; it is given `delivered` and must move no stock.
  var before = ovsBal(w);
  var res = w.sb.handleUpdateShipment_({ shipment_id: 'SH-1', status: 'delivered', actor: 't' });
  eq(ovsBal(w), before, 'E1  advancing to DELIVERED mutated no destination inventory');
  eq(movTypes(w), [], 'E1a and wrote no movement row of any kind');
  ok(res && res.success !== false, 'E1b while the status write itself succeeded', res);
  var st = w.sheets.shipments.__grid[1][SHIP_H.indexOf('status')];
  eq(String(st), 'delivered', 'E1c and the shipment really is delivered now');
})();

// =========================================================================================================
section('F — §9 THE RECEIPT PATH, driven against the real handler');
// =========================================================================================================
// THE CONTRACT IS CUMULATIVE, NOT A DELTA. `shipment_received_qty` is the NEW TOTAL. The round brief
// describes the second receipt as "40"; against this API that is RECEIPT_BACKWARD, because 40 is less than
// the 60 already recorded. The business scenario is the same — a further forty units arrive — and it is
// expressed as a cumulative 100. Both the backend comment and the page agree on this, and §F7 pins the page.
var RCPT = (function () {
  var w = world({
    snap: [snapRow({ warehouse_id: 'WH-DEST', wh_available_stock: 0, wh_reserved_stock: 0, wh_physical_stock: 0 })],
    ships: [shipRow({ shipment_id: 'SH-1', status: 'delivered', destination_warehouse_id: 'WH-DEST' })],
    lines: [lineRow({ shipment_line_id: 'SL-1', shipment_qty: 100, shipment_received_qty: 0 })]
  });
  var out = {};
  out.r60 = w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 60 }] });
  out.after60 = ovsBal(w);
  out.r100 = w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 100 }] });
  out.after100 = ovsBal(w);
  // A third save of the SAME cumulative, which is what a double-click produces.
  out.again = w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 100 }] });
  out.afterAgain = ovsBal(w);
  // And one past the shipped quantity.
  out.over = w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 140 }] });
  out.afterOver = ovsBal(w);
  out.types = movTypes(w);
  out.w = w;
  return out;
})();
ok(RCPT.r60 && RCPT.r60.success === true, 'F1  receipt of a cumulative 60 is accepted', RCPT.r60);
eq(RCPT.after60[0], 60, 'F1a destination available +60');
ok(((RCPT.r60.data || {}).lines || []).some(function (l) { return l.remaining_qty === 40; }),
  'F1b and the answer states remaining 40 — the operator is told, not left to subtract');
ok(RCPT.r100 && RCPT.r100.success === true, 'F2  a further forty, sent as the cumulative 100, is accepted');
eq(RCPT.after100[0], 100, 'F2a destination available +40 more, 100 in total');
ok(((RCPT.r100.data || {}).lines || []).some(function (l) { return l.remaining_qty === 0; }), 'F2b remaining 0');
ok(RCPT.again && RCPT.again.success === true, 'F3  re-sending the same cumulative is accepted as a no-op');
eq(RCPT.afterAgain[0], 100, 'F3a and moved NO stock — the duplicate had zero effect');
ok(RCPT.over && RCPT.over.success === false, 'F4  a receipt beyond the shipped quantity is REFUSED', RCPT.over);
eq((RCPT.over.invalid_lines || [{}])[0].code, 'RECEIPT_OVER', 'F4a named RECEIPT_OVER');
eq(RCPT.afterOver[0], 100, 'F4b and the refusal wrote nothing — fail-closed, not partially applied');
eq(RCPT.types, ['shipment_receipt', 'shipment_receipt'],
  'F5  TWO receipt movements for two real deltas, and none for the duplicate or the refusal');
// Exactly-once is keyed by the CUMULATIVE value, which is what makes the replay safe.
(function () {
  var refs = RCPT.w.sheets.overseas_inventory_movements.__grid.slice(1)
    .map(function (r) { return String(r[MOV_H.indexOf('reference_id')]); });
  eq(refs.length, new Set(refs).size, 'F5a each movement carries a DISTINCT reference_id');
  ok(refs.every(function (r) { return r.indexOf('SL-1') === 0; }),
    'F5b keyed by the shipment LINE and its cumulative, so a replay collides with itself', refs);
})();
// A receipt going backwards is a correction nobody authorized; it is refused rather than silently applied.
(function () {
  var w = world({
    snap: [snapRow({ warehouse_id: 'WH-DEST', wh_available_stock: 0 })],
    ships: [shipRow({ shipment_id: 'SH-1', status: 'delivered', destination_warehouse_id: 'WH-DEST' })],
    lines: [lineRow({ shipment_line_id: 'SL-1', shipment_qty: 100, shipment_received_qty: 60 })]
  });
  var back = w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 40 }] });
  ok(back && back.success === false, 'F6  a LOWER cumulative is refused rather than treated as a delta');
  eq((back.invalid_lines || [{}])[0].code, 'RECEIPT_BACKWARD', 'F6a named RECEIPT_BACKWARD');
  eq(ovsBal(w)[0], 0, 'F6b and nothing moved');
})();
// The page sends the same thing the handler expects. A cumulative API driven by a delta UI is a silent
// double-count, and it would never show up in a backend test.
ok(/shipment_received_qty: v/.test(code(MAP)) && /if \(v === prev\) return;/.test(code(MAP)),
  'F7  the receiving page submits the CUMULATIVE value and skips unchanged lines');

// =========================================================================================================
section('G — §10 THE MOVEMENT VOCABULARIES, final');
// =========================================================================================================
function extractList(src, name) {
  var m = new RegExp('var ' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\];').exec(src);
  if (!m) return null;
  return m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}
var FAC_VOCAB = (function () {
  var names = extractList(F21, 'FSTX_MOVEMENT_TYPES_') || [];
  return names.map(function (n) {
    var m = new RegExp('var ' + n + "\\s*=\\s*'([^']+)'").exec(F21);
    return m ? m[1] : n;
  }).sort();
})();
var OVS_VOCAB = (function () {
  var names = extractList(F05, 'OVSTX_MOVEMENT_TYPES_') || [];
  return names.map(function (n) {
    var m = new RegExp('var ' + n + "\\s*=\\s*'([^']+)'").exec(F05);
    return m ? m[1] : n;
  }).sort();
})();
eq(FAC_VOCAB, ['inventory_import', 'manual_adjustment', 'po_receipt', 'reservation_acquire',
  'reservation_release', 'shipment_out'], 'G1  the FACTORY vocabulary is the declared six — shipment_receipt is not among them');
eq(OVS_VOCAB, ['inventory_import', 'manual_adjustment', 'reservation_acquire', 'reservation_release',
  'shipment_out', 'shipment_receipt'], 'G2  and the OVERSEAS vocabulary is the declared six, receipt included');
// Every type a writer actually emits must be declared. R6 found manual_adjustment written and undeclared;
// this is the check that would have caught it, kept pointed at the live writers.
(function () {
  var emitted = {};
  [['05_', F05], ['21_', F21], ['22_', F22], ['31_', F31]].forEach(function (p) {
    var re = /movement_type:\s*'([a-z_]+)'/g, m;
    while ((m = re.exec(code(p[1])))) emitted[m[1]] = true;
  });
  var declared = {};
  FAC_VOCAB.concat(OVS_VOCAB).forEach(function (t) { declared[t] = true; });
  var undeclared = Object.keys(emitted).filter(function (t) { return !declared[t]; }).sort();
  eq(undeclared, [], 'G3  every movement_type any live writer emits is declared in one of the two vocabularies');
})();
// Cross-domain: a factory movement row must never land in the overseas ledger, or the reverse.
eq(count(code(F21), /overseas_inventory_movements/g), 0, 'G4  21_ never names the overseas ledger');
eq(count(code(F05), /factory_stock_movements/g), 0, 'G4a and 05_ never names the factory ledger');

// =========================================================================================================
section('H — §12 SOURCE AUTHORITY');
// =========================================================================================================
(function () {
  var runtime = ALL_GS.filter(function (f) {
    return /source_factory_warehouse_id/.test(code(read(GS + f)));
  });
  eq(runtime, [], 'H1  NO runtime module reads the deprecated source_factory_warehouse_id');
})();
ok(/source_factory_warehouse_id/.test(read('js/core/supply-planning-factory-site-allocation.js')),
  'H1a it does still appear in the repository — in a COMMENT, which is why it was not deleted');
ok(!/source_factory_warehouse_id/.test(code(read('js/core/supply-planning-factory-site-allocation.js'))),
  'H1b and ONLY in a comment — strip the comments and no code references it');
ok(/source_warehouse_id/.test(code(F12)),
  'H2  the live source identity on a shipment is source_warehouse_id, written and read by the creator');
// AND THE PLACE IT ONCE WAS NOT READ. S6-R8 found the dispatcher never consulted it; S6-R8A made it the
// only thing the dispatcher consults. Measured properly in N.
ok(count(code(F22), /source_warehouse_id/g) > 0,
  'H2a and the DISPATCHER reads it too, which is what S6-R8A closed');

// =========================================================================================================
section('I — §14 IMPORT / RESERVATION COHERENCE');
// =========================================================================================================
(function () {
  var w = world({ snap: [snapRow({ wh_available_stock: 70, wh_reserved_stock: 30, wh_physical_stock: 100 })] });
  // S = 100 reported by the source, R = 30 held here -> stored available 70, reserved untouched.
  var r = w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 100, snapshot_date: '2026-09-30' }],
    options: { createdBy: 't' } });
  eq(ovsBal(w), [70, 30, 100], 'I1  S=100 against R=30 stores available 70 and leaves reserved alone');
  ok(r && r.success !== false, 'I1a and the row was accepted', r);
})();
(function () {
  var w = world({ snap: [snapRow({ wh_available_stock: 70, wh_reserved_stock: 30, wh_physical_stock: 100 })] });
  // S < R: the source reports fewer units than are already committed. Fail closed.
  var r = w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 20, snapshot_date: '2026-09-30' }],
    options: { createdBy: 't' } });
  eq(ovsBal(w), [70, 30, 100], 'I2  S=20 against R=30 changes NOTHING — the row is refused, not clamped');
  ok(JSON.stringify(r).indexOf('IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE') !== -1,
    'I2a and the refusal is named', r);
})();
var QTY_WRITABLE = /var qtyWritableFields = \[([^\]]*)\]/.exec(code(F05));
ok(!!QTY_WRITABLE, 'I3  the importer declares which quantity columns it may write');
ok(QTY_WRITABLE && QTY_WRITABLE[1].indexOf('wh_reserved_stock') === -1,
  'I3a and wh_reserved_stock is NOT among them — import never owns reserved',
  QTY_WRITABLE && QTY_WRITABLE[1]);

// =========================================================================================================
section('J — §16 DUPLICATES AND CONCURRENCY');
// =========================================================================================================
(function () {
  // Double reserve for the same owner: two acquires are two real holds, and over-reservation must be
  // impossible rather than merely unlikely.
  var w = world({ snap: [snapRow({ wh_available_stock: 100, wh_reserved_stock: 0 })] });
  function acq(q) {
    return w.sb.ovsAcquireReservationTx_({ snapSheet: w.sheets.overseas_inventory_snapshot,
      movSheet: w.sheets.overseas_inventory_movements, warehouseId: 'WH-3PL', sku: 'S1', qty: q,
      ownerId: 'SH-1', journal: [], now: 'n', movementDate: '2026-09-30', createdBy: 't' });
  }
  var first = acq(60);
  var same = acq(60);                 // the SAME owner asking again — a double click, not a second demand
  eq([first.applied, first.reason], [true, 'RESERVED'], 'J1  the first reserve is applied and says so');
  eq([same.applied, same.reason], [false, 'ALREADY_RESERVED'],
    'J1a a second reserve for the SAME owner is an idempotent refusal, not a second hold');
  eq(ovsBal(w)[0], 40, 'J1b and the pool moved once, not twice');
})();
(function () {
  // Double release: an owner can only give back what its own ledger says it holds.
  var w = world({ snap: [snapRow({ wh_available_stock: 100, wh_reserved_stock: 0 })] });
  var args = { snapSheet: w.sheets.overseas_inventory_snapshot, movSheet: w.sheets.overseas_inventory_movements,
    warehouseId: 'WH-3PL', sku: 'S1', ownerId: 'SH-1', journal: [], now: 'n',
    movementDate: '2026-09-30', createdBy: 't' };
  w.sb.ovsAcquireReservationTx_(Object.assign({}, args, { qty: 30 }));
  w.sb.ovsReleaseReservationTx_(Object.assign({}, args, { qty: 30 }));
  var twice = w.sb.ovsReleaseReservationTx_(Object.assign({}, args, { qty: 30 }));
  eq(ovsBal(w), [100, 0, 100], 'J2  releasing twice leaves 100/0 — the second release moved nothing');
  eq([twice.applied, twice.reason, twice.released], [false, 'NO_RESERVATION', 0],
    'J2a and it says NO_RESERVATION rather than inventing stock to give back');
})();
(function () {
  // Double dispatch consume: the hold is spent once.
  var w = world({ snap: [snapRow({ wh_available_stock: 100, wh_reserved_stock: 0 })] });
  var args = { snapSheet: w.sheets.overseas_inventory_snapshot, movSheet: w.sheets.overseas_inventory_movements,
    warehouseId: 'WH-3PL', sku: 'S1', ownerId: 'SH-1', journal: [], now: 'n',
    movementDate: '2026-09-30', createdBy: 't' };
  w.sb.ovsAcquireReservationTx_(Object.assign({}, args, { qty: 30 }));
  w.sb.ovsConsumeReservationTx_(Object.assign({}, args, { qty: 30 }));
  var twice = w.sb.ovsConsumeReservationTx_(Object.assign({}, args, { qty: 30 }));
  eq(ovsBal(w), [70, 0, 100], 'J3  consuming twice leaves 70/0 — available is never deducted a second time');
  eq([twice.applied, twice.reason, twice.consumed], [false, 'NO_RESERVATION', 0],
    'J3a and the second consume is a typed no-op, not a second deduction');
})();
(function () {
  // OVER_RESERVATION_REACHABLE. Two different shipments competing for one pool is the case idempotency
  // does NOT cover, and it is the one that would corrupt a balance rather than merely duplicate an action.
  var w = world({ snap: [snapRow({ wh_available_stock: 100, wh_reserved_stock: 0 })] });
  var args = { snapSheet: w.sheets.overseas_inventory_snapshot, movSheet: w.sheets.overseas_inventory_movements,
    warehouseId: 'WH-3PL', sku: 'S1', journal: [], now: 'n', movementDate: '2026-09-30', createdBy: 't' };
  w.sb.ovsAcquireReservationTx_(Object.assign({}, args, { qty: 60, ownerId: 'SH-1' }));
  var over = null;
  try { w.sb.ovsAcquireReservationTx_(Object.assign({}, args, { qty: 60, ownerId: 'SH-2' })); }
  catch (e) { over = String(e && e.message || e); }
  ok(over !== null && /would be negative/.test(over),
    'J5  a SECOND owner cannot reserve past the pool — the balance guard throws', over);
  eq(ovsBal(w), [40, 60, 100], 'J5a and the balance is exactly where the first reserve left it');
  w.sb.ovsAcquireReservationTx_(Object.assign({}, args, { qty: 40, ownerId: 'SH-2' }));
  eq(ovsBal(w), [0, 100, 100], 'J5b while the amount that DOES fit is reserved normally');
})();
// The dispatcher's own guard against spending one key's hold twice across two lines.
ok(/ovsHeldByKey_\[key\] = heldO - giveO;/.test(code(F22)) && /heldByKey\[key\] = held - give;/.test(code(F22)),
  'J4  and the dispatcher debits its in-memory hold per key, so two lines for one SKU cannot consume it twice');

// =========================================================================================================
section('K — §19 THE ORDERING / SHIPPING BOUNDARY');
// =========================================================================================================
var ORDER_EXEC = /(handleCreateRequestOrder|handleCreatePurchaseOrder|handleReceivePurchaseOrderLines_|purchase_orders)\s*[\(']/;
ok(!ORDER_EXEC.test(code(F12)), 'K1  shipment creation starts no order and touches no purchase_orders');
ok(!ORDER_EXEC.test(code(F22)), 'K1a nor does dispatch');
ok(!ORDER_EXEC.test(code(F31)), 'K1b nor does the warehouse receipt');
ok(!ORDER_EXEC.test(code(F11)), 'K1c nor does any shipping-plan transition');
eq(count(code(read(GS + '13_procurement_handlers.gs')), /handleCreateShipmentFromPlan_|handleConfirmShipmentAndDispatch_/g), 0,
  'K2  and the procurement owner creates and dispatches no shipment in return');
// Phase 2 is lead-time ORCHESTRATION. The absence that matters is an automatic one.
eq(count(code(F11) + code(code(F12)), /carrier_lead_times/g), 0,
  'K3  no Phase-2 lead-time orchestration entered the shipping execution path');

// =========================================================================================================
section('L — §17 OPERATOR SURFACE TRUTH, re-verified');
// =========================================================================================================
ok(/_spReservedStockLabel_/.test(code(SPLAN)) && count(code(SPLAN), /Factory stock reserved at/g) === 0,
  'L1  R7 holds: no plan message still says "Factory stock reserved" over an unknown domain');
ok(/_shDispatchStockSentence_/.test(code(SHIST))
  && count(code(SHIST), /'On confirm[\s\S]{0,120}Factory Stock is <strong>deducted/g) === 0,
  'L2  and the dispatch confirmation states the effect for the SOURCE DOMAIN, not for Factory always');
ok(/_shSourceDomain_/.test(code(SHIST)) && /IRW\.isFactory/.test(code(SHIST)),
  'L3  resolved through the shared warehouse classifier, not a local guess');

// =========================================================================================================
section('N — WHAT DISPATCH SELECTS: the declared source, and nothing else');
// =========================================================================================================
// WHAT THIS SECTION FOUND IN S6-R8, kept because it is the reason the code reads the way it does now.
// The deduct plan was built from every factory_stock row matching the SKU, sorted by warehouse_id, and each
// planned line carried the warehouse OF THE ROW IT HAD PICKED; `source_warehouse_id` did not appear in 22_
// at all. So an OVERSEAS source was checked for sufficiency against factory_stock and refused 'Insufficient
// factory stock' for units reserved and present in the overseas snapshot, and a FACTORY shipment could be
// deducted from a warehouse it never declared. S6-R8A froze DECLARED_SOURCE_ONLY and closed it.
//
// These assertions now measure the ABSENCE of all of that. The handler itself is still not driven here -
// its first gate probes Drive - but the selection key, the ordering and the decision ORDER are properties
// of the source, and the s6-r8a suite drives the parts that can be driven.
var CSD_SRC = (function () {
  var m = /__CSD_DECLARED_SOURCE_START__[\s\S]*?__CSD_DECLARED_SOURCE_END__/.exec(F22);
  return m ? m[0] : '';
})();
ok(CSD_SRC.length > 0, 'N1  the declared-source block is marked and findable');
ok(/var srcWarehouseId = sc\('source_warehouse_id'\);/.test(CSD_SRC),
  'N2  it begins by reading the warehouse the SHIPMENT declares');
ok(/shipmentSourceDomain_\(ss, srcWarehouseId\)/.test(CSD_SRC),
  'N2a and classifies the domain from THAT warehouse, through 12_\'s owner — not a second classifier');
eq(count(code(F22), /function (dispatchDomain_|csdLoadFactoryStock_)/g), 0,
  'N2b the old local classifier and the SKU-wide loader are both gone');
// The selection key, which is the whole decision.
ok(/deductPlan\.push\(\{ sku: sku, warehouseId: srcWarehouseId, take: need \}\)/.test(CSD_SRC),
  'N3  every planned deduction names the DECLARED warehouse — the key is warehouse + sku');
eq(count(code(F22), /\.sort\(function \(a, b\) \{ return String\(a\.vals/g), 0,
  'N3a nothing sorts warehouses to pick one, because nothing picks one');
eq(count(code(F22), /stk\.rows\.filter|cand\[ci\]/g), 0,
  'N3b and there is no candidate list left at all');
// §6 — the ORDER. Deciding the domain from a row that only factory_stock can produce is what made the
// overseas branch unreachable, so the order is the fix and is asserted as such.
var IDX_DOMAIN = code(F22).indexOf('shipmentSourceDomain_(ss, srcWarehouseId)');
var IDX_SELECT = code(F22).indexOf('csdDeclaredSourceSupply_(srcDomain');
var IDX_CONSUME = code(F22).indexOf('deductPlan.forEach');
ok(IDX_DOMAIN > 0 && IDX_SELECT > IDX_DOMAIN,
  'N4  the domain is decided BEFORE any inventory row is resolved');
ok(IDX_CONSUME > IDX_SELECT, 'N4a and the consume runs after both');
ok(/if \(srcDomain === 'OVERSEAS'\) \{/.test(code(F22)),
  'N4b the consume branches on the domain already decided, not on one re-derived from the row');
// §5 — an overseas source must not need a factory row to exist.
ok(/var stockSheet = \(srcDomain === 'OVERSEAS'\) \? null : srcSheets\.stockSheet;/.test(CSD_SRC),
  'N5  an OVERSEAS source never opens factory_stock at all');
eq(count(CSD_SRC, /factory_stock sheet not found/g), 0,
  'N5a so a deployment with no factory row for that SKU cannot refuse an overseas dispatch for it');
// §4 — the refusal is typed and says what it refused.
ok(/code: 'DECLARED_SOURCE_INSUFFICIENT'/.test(CSD_SRC), 'N6  an insufficient declared source is refused');
ok(/is NOT '\s*\+\s*'used automatically/.test(CSD_SRC) || /NOT \\n?.{0,40}used automatically/.test(CSD_SRC),
  'N6a and the message tells the operator another warehouse was deliberately not used');
ok(/code: 'SHIPMENT_SOURCE_WAREHOUSE_MISSING'/.test(CSD_SRC),
  'N7  a BLANK declared source refuses rather than falling back to a search');
ok(/code: 'DECLARED_SOURCE_INSUFFICIENT'/.test(CSD_SRC) && /source_warehouse_known: srcKnown/.test(CSD_SRC),
  'N7a and an UNKNOWN one is refused by sufficiency, reporting that it could not be found — a hard gate '
  + 'here would be stricter than the one that creates the shipment, which tolerates a missing row');

// =========================================================================================================
section('M — MUTATIONS');
// =========================================================================================================
// Each mutant plants a defect this round's claims would otherwise be unable to see. A mutant that the suite
// does not catch is a claim the suite is not really making.
function w05(src) { return world({ src05: src, snap: [snapRow({ wh_available_stock: 100, wh_reserved_stock: 0 })] }); }

mut('M1 the overseas dispatch consume ALSO deducts available — the 70/30 -> 40/0 defect', function () {
  // The line that matters is `availableDelta: 0` inside the consume. Making it -take is EXACTLY the defect
  // §4 forbids: the units leave available a second time, having already left it when they were reserved.
  var w = w05(swap(F05, '    availableDelta: 0, reservedDelta: -take,          // available: NOT touched. §4.',
    '    availableDelta: -take, reservedDelta: -take,'));
  var args = { snapSheet: w.sheets.overseas_inventory_snapshot, movSheet: w.sheets.overseas_inventory_movements,
    warehouseId: 'WH-3PL', sku: 'S1', ownerId: 'SH-1', journal: [], now: 'n',
    movementDate: '2026-09-30', createdBy: 't' };
  w.sb.ovsAcquireReservationTx_(Object.assign({}, args, { qty: 30 }));
  w.sb.ovsConsumeReservationTx_(Object.assign({}, args, { qty: 30 }));
  return JSON.stringify(ovsBal(w)) === JSON.stringify([40, 0, 100]);   // the forbidden answer appears
});
mut('M2 the allocatable rule subtracts reserved from a STORED available', function () {
  var m = swap(F05, 'function ovsAllocatableTx_(bal) {',
    'function ovsAllocatableTx_(bal) { return Math.max(0, Number(bal.available||0) - Number(bal.reserved||0));');
  var w = world({ src05: m, snap: [snapRow({ wh_available_stock: 70, wh_reserved_stock: 30 })] });
  var b = w.sb.ovsStockReadBalanceTx_(w.sheets.overseas_inventory_snapshot, 'WH-3PL', 'S1');
  return w.sb.ovsAllocatableTx_(b) === 40;
});
mut('M3 the receipt treats its quantity as a DELTA instead of a cumulative', function () {
  var m = swap(F31, '  return { ok: true, code: \'OK\', delta: reqRaw - old };',
    '  return { ok: true, code: \'OK\', delta: reqRaw };');
  var w = world({ src31: m,
    snap: [snapRow({ warehouse_id: 'WH-DEST', wh_available_stock: 0 })],
    ships: [shipRow({ shipment_id: 'SH-1', status: 'delivered', destination_warehouse_id: 'WH-DEST' })],
    lines: [lineRow({ shipment_line_id: 'SL-1', shipment_qty: 100, shipment_received_qty: 0 })] });
  w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 60 }] });
  w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 100 }] });
  return ovsBal(w)[0] !== 100;
});
mut('M4 over-receipt is accepted instead of refused', function () {
  var m = swap(F31, "  if (reqRaw > shipped) return { ok: false, code: 'RECEIPT_OVER', delta: reqRaw - old };",
    '  if (false) { }');
  var w = world({ src31: m,
    snap: [snapRow({ warehouse_id: 'WH-DEST', wh_available_stock: 0 })],
    ships: [shipRow({ shipment_id: 'SH-1', status: 'delivered', destination_warehouse_id: 'WH-DEST' })],
    lines: [lineRow({ shipment_line_id: 'SL-1', shipment_qty: 100, shipment_received_qty: 0 })] });
  var r = w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 140 }] });
  return r && r.success === true;
});
mut('M5 a backward receipt is silently applied', function () {
  var m = swap(F31, "  if (reqRaw < old) return { ok: false, code: 'RECEIPT_BACKWARD', delta: reqRaw - old };",
    '  if (false) { }');
  var w = world({ src31: m,
    snap: [snapRow({ warehouse_id: 'WH-DEST', wh_available_stock: 0 })],
    ships: [shipRow({ shipment_id: 'SH-1', status: 'delivered', destination_warehouse_id: 'WH-DEST' })],
    lines: [lineRow({ shipment_line_id: 'SL-1', shipment_qty: 100, shipment_received_qty: 60 })] });
  var r = w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 40 }] });
  return !(r && r.success === false);
});
mut('M6 the importer stops refusing a source that reports fewer units than are reserved', function () {
  var m = swap(F05, 'IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE', 'IMPORT_OK_NEVER_RAISED_');
  var w = world({ src05: m, snap: [snapRow({ wh_available_stock: 70, wh_reserved_stock: 30 })] });
  var r = w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 20, snapshot_date: '2026-09-30' }],
    options: { createdBy: 't' } });
  return JSON.stringify(r).indexOf('IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE') === -1;
});
mut('M7 shipment_receipt is reinstated as a FACTORY movement type', function () {
  var m = swap(F21, 'var FSTX_MOVEMENT_TYPES_ = [',
    "var FSTX_MOV_SHIPMENT_RECEIPT_ = 'shipment_receipt';\nvar FSTX_MOVEMENT_TYPES_ = [FSTX_MOV_SHIPMENT_RECEIPT_, ");
  var w = world({ src21: m, fs: [fsRow({ fac_current_stock: 10 })] });
  return w.sb.factoryStockIsKnownMovementType_('shipment_receipt') === true;
});
mut('M8 the factory reserve deducts current stock as well as raising reserved', function () {
  // FACTORY availability is DERIVED, so a reserve must move reserved ONLY. Deducting current here would
  // subtract the units twice over: once from current now, and again through the derivation.
  var m = swap(F21, '    deltaQty: 0, reservedDelta: need, journal: p.journal,',
    '    deltaQty: -need, reservedDelta: need, journal: p.journal,');
  var w = world({ src21: m, fs: [fsRow({ fac_current_stock: 100, fac_reserved_stock: 0 })] });
  w.sb.factoryStockAcquireReservationTx_({ stockSheet: w.sheets.factory_stock,
    movSheet: w.sheets.factory_stock_movements, warehouseId: 'WH-FAC', sku: 'S1', qty: 30,
    ownerId: 'SH-1', journal: [], now: 'n', movementDate: '2026-09-30', createdBy: 't' });
  return JSON.stringify(facBal(w)) === JSON.stringify([70, 30]);   // current moved, which it must not
});
mut('M9 the status update starts writing destination inventory', function () {
  // Planting it for real: make handleUpdateShipment_ post a receipt movement on `delivered`.
  var m = swap(F12, 'function handleUpdateShipment_(body) {',
    'function handleUpdateShipment_(body) { try { var _s = SpreadsheetApp.getActiveSpreadsheet()'
    + ".getSheetByName('overseas_inventory_movements'); if (_s) _s.appendRow([]); } catch (e) {}");
  var w = world({ src12: m,
    snap: [snapRow({ warehouse_id: 'WH-DEST', wh_available_stock: 0 })],
    ships: [shipRow({ shipment_id: 'SH-1', status: 'in_transit', destination_warehouse_id: 'WH-DEST' })],
    lines: [lineRow({})] });
  w.sb.handleUpdateShipment_({ shipment_id: 'SH-1', status: 'delivered', actor: 't' });
  return w.sheets.overseas_inventory_movements.__grid.length > 1;
});
mut('M10 the receipt stops keying its ledger by the cumulative, so a replay posts twice', function () {
  var m = swap(F31, "var ref = ", "var ref = '' + Math.random() + ");
  var w = world({ src31: m,
    snap: [snapRow({ warehouse_id: 'WH-DEST', wh_available_stock: 0 })],
    ships: [shipRow({ shipment_id: 'SH-1', status: 'delivered', destination_warehouse_id: 'WH-DEST' })],
    lines: [lineRow({ shipment_line_id: 'SL-1', shipment_qty: 100, shipment_received_qty: 0 })] });
  w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 60 }] });
  var before = ovsBal(w)[0];
  w.sb.handleUpdateShipmentReceipt_({ shipment_id: 'SH-1', actor: 't',
    lines: [{ shipment_line_id: 'SL-1', shipment_received_qty: 60 }] });
  return ovsBal(w)[0] !== before;
});
mut('M11 the dispatcher stops routing by source domain and treats every source as Factory', function () {
  var m = swap(F22, "if (dispatchDomain_(d.warehouseId) === 'OVERSEAS') {", 'if (false) {');
  return /dispatchDomain_\(d\.warehouseId\) === 'OVERSEAS'/.test(F22)
    && !/dispatchDomain_\(d\.warehouseId\) === 'OVERSEAS'/.test(m);
});
mut('M12 a second factory-stock writer appears in a module that is not an inventory owner', function () {
  // A9 is the only thing standing between this repository and two inventory authorities, and a detector
  // nobody has ever seen fire is not a detector. The second writer is planted into a REAL non-owner file,
  // in the shape one would actually take, and A9's own expression is what has to notice it.
  var m = swap(F57, 'function handleShipmentWorkspaceGet_(body, io) {',
    'function handleShipmentWorkspaceGet_(body, io) {' + NLX
    + "  var _rogue = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('factory_stock');" + NLX
    + '  if (_rogue) _rogue.getRange(2, 4).setValue(0);');
  var re = /getSheetByName\(\s*'factory_stock'\s*\)[\s\S]{0,400}?(setValue|appendRow)/;
  return re.test(code(m)) && !re.test(code(F57));
});
mut('M13 the receiving page starts sending a DELTA instead of the cumulative', function () {
  var m = swap(MAP, 'out.push({ shipment_line_id: p.shipment_line_id, shipment_received_qty: v });',
    'out.push({ shipment_line_id: p.shipment_line_id, shipment_received_qty: v - prev });');
  return /shipment_received_qty: v \}/.test(MAP) && !/shipment_received_qty: v \}/.test(m);
});

// =========================================================================================================
console.log('\n' + new Array(101).join('-'));
console.log('S6-R8 MAINLINE FINAL INTEGRATION: ' + pass + ' passed, ' + fail + ' failed'
  + '  ·  mutants ' + mutants + ', survived ' + survived);
console.log('diagnostic invariants: PRODUCTION_ROWS_WRITTEN=0 · NETWORK_CALLS=0 · DEPLOYMENTS=0');
console.log(new Array(101).join('-'));
if (fail > 0) process.exitCode = 1;
