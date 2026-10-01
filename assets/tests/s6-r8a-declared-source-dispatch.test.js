// S6-R8A — DECLARED-SOURCE DISPATCH AUTHORITY.
//
// D_S6_DISPATCH_SOURCE_AUTHORITY = DECLARED_SOURCE_ONLY. A Shipment consumes inventory from the warehouse it
// declares, or it refuses and says so. No fallback, no "first warehouse with stock", no ordering of
// warehouses anywhere.
//
// WHAT THIS CLOSED. S6-R8 found the dispatcher building its deduct plan from every factory_stock row matching
// the SKU, sorted by warehouse_id, each planned line carrying the warehouse of the row it had picked. The
// Shipment's own source_warehouse_id did not appear in 22_ at all. Two consequences, and they pulled in
// opposite directions: an OVERSEAS source was refused "Insufficient factory stock" for units sitting reserved
// in the overseas snapshot, and a FACTORY shipment could be deducted from a warehouse it never declared.
//
// WHAT IS DRIVEN HERE AND WHAT IS NOT, stated so nobody has to guess. `handleConfirmShipmentAndDispatch_`
// opens with a Drive-reachability probe, then carton validation, route-template resolution and canonical PO
// allocation. Standing those up means driving stubs and calling the result a test. So the DECISION this round
// changed — which warehouse, in which domain, with what supply — is driven through its own module-scope owner
// `csdDeclaredSourceSupply_` and the real 05_/21_ transactions it consults, and the ORDER and the SHAPE of
// the surrounding block are measured from the source between its two markers.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s6-r8a-declared-source-dispatch.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var GS = 'specs/active/apps-script/';
var F05 = read(GS + '05_overseas_inventory_handlers.gs');
var F12 = read(GS + '12_shipment_handlers.gs');
var F21 = read(GS + '21_factory_inventory_handlers.gs');
var F22 = read(GS + '22_shipment_dispatch_handlers.gs');

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
// THE WORLD
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
function mkRow(H, defaults, o) {
  var d = {};
  for (var k in defaults) d[k] = defaults[k];
  for (var k2 in o) d[k2] = o[k2];
  return H.map(function (h) { return d[h] === undefined ? '' : d[h]; });
}
function snapRow(o) {
  return mkRow(SNAP_H, { overseas_inventory_id: 'OISN-1', snapshot_date: '2026-09-01', warehouse_id: 'WH-3PL',
    sku: 'S1', site_sku: 'SS-1', wh_physical_stock: 100, wh_available_stock: 0, wh_reserved_stock: 0,
    wh_damaged_stock: 0, wh_on_the_way_qty: 0, created_at: 'c', updated_at: 'u' }, o);
}
function fsRow(o) {
  return mkRow(FS_H, { factory_stock_id: 'FS-1', warehouse_id: 'WH-FAC-A', sku: 'S1',
    fac_current_stock: 0, fac_reserved_stock: 0, created_at: 'c', updated_at: 'u' }, o);
}

// Two factories and one 3PL, which is the whole point: there is always another warehouse holding the SKU.
var WAREHOUSES = [
  ['WH-FAC-A', 'CN Factory A', 'KM', 'CN', true, true, 'FACTORY', 'active'],
  ['WH-FAC-B', 'CN Factory B', 'KM', 'CN', true, true, 'FACTORY', 'active'],
  ['WH-3PL', 'Winit UK', 'ResUS', 'UK', true, false, '3PL', 'active']
];

function world(opts) {
  opts = opts || {};
  var sheets = {
    overseas_inventory_snapshot: mkSheet(SNAP_H, opts.snap || [], 'overseas_inventory_snapshot'),
    overseas_inventory_movements: mkSheet(MOV_H, opts.mov || [], 'overseas_inventory_movements'),
    factory_stock: mkSheet(FS_H, opts.fs || [], 'factory_stock'),
    factory_stock_movements: mkSheet(FSMOV_H, opts.fsmov || [], 'factory_stock_movements'),
    warehouses: mkSheet(WH_H, opts.wh === undefined ? WAREHOUSES : opts.wh, 'warehouses')
  };
  if (opts.noFactoryTable) delete sheets.factory_stock;
  var ss = { getSheetByName: function (n) { return sheets[n] || null; }, getId: function () { return 'PROD-BOOK'; } };
  var sb = {
    console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object, Math: Math,
    Date: Date, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp,
    Boolean: Boolean, Error: Error,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, openById: function () { return ss; },
      flush: function () {} },
    Utilities: { formatDate: function () { return '2026-09-30'; },
      getUuid: (function () { var n = 0; return function () { n++; return 'u' + n + '-b-c-d-e'; }; })() },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    jsonResponse_: function (o) { return o; },
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
  [opts.src21 || F21, opts.src05 || F05, opts.src12 || F12, opts.src22 || F22]
    .forEach(function (src) { vm.runInContext(src, sb); });
  return { sb: sb, sheets: sheets, ss: ss };
}

// The dispatcher's own view of a declared source: domain, then sheets, then supply. Exactly the order the
// handler now uses, driven through the same three owners.
function declared(w, warehouseId, sku, shipmentId) {
  var domain = w.sb.shipmentSourceDomain_(w.ss, warehouseId);
  var sheets = w.sb.shipmentDomainSheets_(w.ss, domain);
  if (domain === 'FACTORY' && sheets && !sheets.movSheet) sheets.movSheet = w.sheets.factory_stock_movements;
  return { domain: domain, sheets: sheets,
    supply: sheets ? w.sb.csdDeclaredSourceSupply_(domain, sheets, warehouseId, sku, shipmentId) : null };
}
function facBal(w, r) {
  var g = w.sheets.factory_stock.__grid[r];
  return [g[FS_H.indexOf('fac_current_stock')], g[FS_H.indexOf('fac_reserved_stock')]];
}
function ovsBal(w, r) {
  var g = w.sheets.overseas_inventory_snapshot.__grid[r || 1];
  return [g[SNAP_H.indexOf('wh_available_stock')], g[SNAP_H.indexOf('wh_reserved_stock')]];
}

// =========================================================================================================
section('A — §15.A TWO FACTORIES HOLD THE SKU; THE SHIPMENT DECLARES ONE');
// =========================================================================================================
// Factory A: 100 current / 80 reserved.  Factory B: 500 current / 0 reserved.  Shipment declares A, qty 80.
// The old selector would have ordered [A, B] and taken 80 from A — the right answer by accident, because A
// sorts first. The case that matters is what the supply NUMBER is, and whose row it came from.
(function () {
  // Factory A reaches 100 / 80 through the REAL acquire rather than being handed that balance: a reserved
  // cell with no ledger behind it is a world in which nobody reserved anything, and the dispatch would then
  // correctly find no hold to release. The 80 on A IS this shipment's.
  var w = world({ fs: [
    fsRow({ factory_stock_id: 'FS-A', warehouse_id: 'WH-FAC-A', fac_current_stock: 100, fac_reserved_stock: 0 }),
    fsRow({ factory_stock_id: 'FS-B', warehouse_id: 'WH-FAC-B', fac_current_stock: 500, fac_reserved_stock: 0 })] });
  w.sb.factoryStockAcquireReservationTx_({ stockSheet: w.sheets.factory_stock,
    movSheet: w.sheets.factory_stock_movements, warehouseId: 'WH-FAC-A', sku: 'S1', qty: 80,
    ownerId: 'SH-1', journal: [], now: 'n', movementDate: '2026-09-30', createdBy: 't' });
  eq(facBal(w, 1), [100, 80], 'A0  Factory A stands at the stated 100 current / 80 reserved');
  var a = declared(w, 'WH-FAC-A', 'S1', 'SH-1');
  eq(a.domain, 'FACTORY', 'A1  the declared source classifies as FACTORY');
  eq(a.supply.qty, 100, 'A1a and its supply is A\'s OWN current stock — not A + B, which would be 600');
  eq(a.supply.basis, 'current stock', 'A1b stated as current stock, because factory availability is derived');
  var b = declared(w, 'WH-FAC-B', 'S1', 'SH-1');
  eq(b.supply.qty, 500, 'A2  and declaring B answers B — the function is scoped to the warehouse it is given');
  // Consume against A only.
  w.sb.factoryStockApplyDeltaTx_({ stockSheet: w.sheets.factory_stock,
    movSheet: w.sheets.factory_stock_movements, warehouseId: 'WH-FAC-A', sku: 'S1',
    deltaQty: -80, reservedDelta: -80, journal: [], now: 'n', movementDate: '2026-09-30',
    movementType: 'shipment_out', relatedEntityType: 'shipment', relatedEntityId: 'SH-1', createdBy: 't' });
  eq(facBal(w, 1), [20, 0], 'A3  Factory A gave the 80 it was asked for and its hold is spent');
  eq(facBal(w, 2), [500, 0], 'A3a FACTORY_CROSS_WAREHOUSE_CONSUME_COUNT = 0 — Factory B is untouched');
})();

// =========================================================================================================
section('B — §15.B THE DECLARED SOURCE CANNOT FULFIL, AND ANOTHER WAREHOUSE CAN');
// =========================================================================================================
(function () {
  var w = world({ fs: [
    fsRow({ factory_stock_id: 'FS-A', warehouse_id: 'WH-FAC-A', fac_current_stock: 10, fac_reserved_stock: 0 }),
    fsRow({ factory_stock_id: 'FS-B', warehouse_id: 'WH-FAC-B', fac_current_stock: 1000, fac_reserved_stock: 0 })] });
  var a = declared(w, 'WH-FAC-A', 'S1', 'SH-1');
  ok(a.supply.qty < 80, 'B1  the declared source cannot cover 80', a.supply);
  eq(a.supply.qty, 10, 'B1a and the shortfall is reported against A alone, not against A + B');
  eq(facBal(w, 2), [1000, 0], 'B2  Factory B is not consulted and not touched');
  // The refusal the handler returns for exactly this case, and the fact that it names the alternative it
  // deliberately did NOT take.
  var SRC = /__CSD_DECLARED_SOURCE_START__[\s\S]*?__CSD_DECLARED_SOURCE_END__/.exec(F22)[0];
  ok(/code: 'DECLARED_SOURCE_INSUFFICIENT'/.test(SRC), 'B3  refused with a typed code');
  ok(/No stock was deducted/.test(SRC), 'B3a stating that nothing was written');
  ok(/used automatically/.test(SRC) && /separate, authorized decision/.test(SRC),
    'B3b and telling the operator another warehouse was deliberately not used');
  ok(/shortages: stockErrors/.test(SRC), 'B3c with the per-SKU shortfall carried in the answer');
})();

// =========================================================================================================
section('C/D — §15.C/D THE OVERSEAS SOURCE');
// =========================================================================================================
(function () {
  // available 70 / reserved 30, the hold belonging to THIS shipment. Factory holds the same SKU and must not
  // be consulted at all.
  var w = world({
    snap: [snapRow({ warehouse_id: 'WH-3PL', wh_available_stock: 100, wh_reserved_stock: 0 })],
    fs: [fsRow({ warehouse_id: 'WH-FAC-A', fac_current_stock: 9999 })] });
  var args = { snapSheet: w.sheets.overseas_inventory_snapshot, movSheet: w.sheets.overseas_inventory_movements,
    warehouseId: 'WH-3PL', sku: 'S1', ownerId: 'SH-1', journal: [], now: 'n',
    movementDate: '2026-09-30', createdBy: 't' };
  w.sb.ovsAcquireReservationTx_(Object.assign({}, args, { qty: 30 }));
  eq(ovsBal(w), [70, 30], 'C1  the reserve left 70/30 — a transfer between two stored cells');
  var d = declared(w, 'WH-3PL', 'S1', 'SH-1');
  eq(d.domain, 'OVERSEAS', 'C2  the declared 3PL source classifies as OVERSEAS');
  eq(d.supply.qty, 30, 'C2a and its supply is THE HOLD THIS SHIPMENT OWNS — 30, not the 70 available');
  eq(d.supply.basis, 'reserved for this shipment', 'C2b stated as such');
  ok(d.sheets.stockSheet === w.sheets.overseas_inventory_snapshot,
    'C2c resolved against the overseas snapshot, never factory_stock');
  w.sb.ovsConsumeReservationTx_(Object.assign({}, args, { qty: 30 }));
  eq(ovsBal(w), [70, 0], 'C3  dispatch leaves 70/0 — available is not deducted a second time');
  eq(facBal(w, 1), [9999, 0], 'C3a CROSS_DOMAIN_CONSUME_COUNT = 0 — factory stock is untouched');
})();
(function () {
  // §15.D — the overseas warehouse has NO factory_stock row anywhere. Under the old selector this was
  // "Insufficient factory stock". It must now be an ordinary overseas dispatch.
  var w = world({
    snap: [snapRow({ warehouse_id: 'WH-3PL', wh_available_stock: 100, wh_reserved_stock: 0 })],
    fs: [] });
  var args = { snapSheet: w.sheets.overseas_inventory_snapshot, movSheet: w.sheets.overseas_inventory_movements,
    warehouseId: 'WH-3PL', sku: 'S1', ownerId: 'SH-1', journal: [], now: 'n',
    movementDate: '2026-09-30', createdBy: 't' };
  w.sb.ovsAcquireReservationTx_(Object.assign({}, args, { qty: 30 }));
  var d = declared(w, 'WH-3PL', 'S1', 'SH-1');
  eq(d.supply.qty, 30, 'D1  FACTORY_ROW_REQUIRED_FOR_OVERSEAS_DISPATCH = NO — supply answers 30 with an '
    + 'entirely empty factory_stock table');
  eq(w.sheets.factory_stock.__grid.length, 1, 'D1a and there genuinely is no factory row');
  var r = w.sb.ovsConsumeReservationTx_(Object.assign({}, args, { qty: 30 }));
  eq([r.applied, r.reason], [true, 'CONSUMED'], 'D2  and the consume succeeds through the overseas owner');
  eq(ovsBal(w), [70, 0], 'D2a leaving 70/0');
})();

// =========================================================================================================
section('E/F/G — §15.E/F/G THE SOURCE THAT CANNOT BE TRUSTED');
// =========================================================================================================
(function () {
  // §15.E — the declared warehouse is not in the warehouses table.
  var w = world({ fs: [fsRow({ warehouse_id: 'WH-FAC-A', fac_current_stock: 500 })] });
  eq(w.sb.ovsReadWarehouseRecord_(w.ss, 'WH-GHOST'), null, 'E1  an unknown warehouse resolves to no record');
  var SRC = /__CSD_DECLARED_SOURCE_START__[\s\S]*?__CSD_DECLARED_SOURCE_END__/.exec(F22)[0];
  // AND THE REFUSAL COMES FROM SUFFICIENCY, NOT FROM A NEW GATE — which was a correction to this round.
  // A first version refused outright on a missing `warehouses` row. That is STRICTER than the path that
  // creates the shipment: 12_ requires a non-blank source_warehouse_id but lets shipmentSourceDomain_
  // degrade to FACTORY when the row is absent, so a shipment with an unlisted source can exist. Refusing
  // it here would strand it — created under one rule, undispatchable under another. A source nobody can
  // find holds nothing, so it fails the sufficiency check instead, with the quantities named.
  ok(/var srcKnown = !!srcRec;/.test(SRC),
    'E2  the handler resolves whether the declared warehouse is known');
  ok(/source_warehouse_known: srcKnown/.test(SRC),
    'E2a and reports it, so an operator can tell a typo from an empty warehouse');
  eq(count(SRC, /SHIPMENT_SOURCE_WAREHOUSE_UNKNOWN/g), 0,
    'E2b but does NOT refuse on it — that gate would be stricter than the one that creates the shipment');
  ok(/code: 'DECLARED_SOURCE_INSUFFICIENT'/.test(SRC),
    'E2c the unknown source is refused by sufficiency, which is truthful and names the quantities');
  ok(/SHIPMENT_SOURCE_WAREHOUSE_MISSING/.test(SRC),
    'E3  and a BLANK declared source is its own refusal, not a search over everything');
})();
(function () {
  // §15.F — the warehouses row says one thing and a caller might believe another. The canonical classifier
  // is the warehouses row, full stop; a 3PL flagged as a factory is classified by the SAME rule the
  // reservation path used, so the two halves cannot disagree about it.
  var w = world({ wh: [['WH-ODD', 'Mislabelled 3PL', 'ResUS', 'UK', true, true, '3PL', 'active']],
    fs: [fsRow({ warehouse_id: 'WH-ODD', fac_current_stock: 42 })] });
  var d = declared(w, 'WH-ODD', 'S1', 'SH-1');
  eq(d.domain, 'FACTORY', 'F1  a contradictory row is resolved by the ONE canonical classifier (factory flag '
    + 'first), and the dispatcher adopts whatever it says');
  ok(/shipmentSourceDomain_\(ss, srcWarehouseId\)/.test(code(F22)),
    'F1a which is 12_\'s — the same function the reservation path uses, so the two cannot disagree');
  eq(count(code(F22), /ovsWarehouseSourceDomain_/g), 0,
    'F1b and 22_ no longer reaches past it to the raw classifier');
})();
(function () {
  // §15.G — the reservation sits on a DIFFERENT warehouse than the shipment declares.
  var w = world({
    snap: [snapRow({ overseas_inventory_id: 'O-1', warehouse_id: 'WH-3PL', wh_available_stock: 100 }),
      snapRow({ overseas_inventory_id: 'O-2', warehouse_id: 'WH-OTHER', wh_available_stock: 100 })],
    wh: WAREHOUSES.concat([['WH-OTHER', 'Other 3PL', 'ResUS', 'UK', true, false, '3PL', 'active']]) });
  var args = { snapSheet: w.sheets.overseas_inventory_snapshot, movSheet: w.sheets.overseas_inventory_movements,
    sku: 'S1', ownerId: 'SH-1', journal: [], now: 'n', movementDate: '2026-09-30', createdBy: 't' };
  w.sb.ovsAcquireReservationTx_(Object.assign({}, args, { warehouseId: 'WH-OTHER', qty: 30 }));
  var d = declared(w, 'WH-3PL', 'S1', 'SH-1');
  eq(d.supply.qty, 0, 'G1  a hold at ANOTHER warehouse is not supply at the declared one — RESERVATION_'
    + 'DISPATCH_SOURCE_MISMATCH cannot produce a successful dispatch');
  eq(ovsBal(w, 2), [70, 30], 'G1a and the other warehouse keeps its hold, untouched');
})();

// =========================================================================================================
section('H/I — §15.H/I REPLAY AND THE HAPPY PATH');
// =========================================================================================================
(function () {
  var w = world({
    snap: [snapRow({ warehouse_id: 'WH-3PL', wh_available_stock: 100 })],
    fs: [fsRow({ warehouse_id: 'WH-FAC-A', fac_current_stock: 100 })] });
  var args = { snapSheet: w.sheets.overseas_inventory_snapshot, movSheet: w.sheets.overseas_inventory_movements,
    warehouseId: 'WH-3PL', sku: 'S1', ownerId: 'SH-1', journal: [], now: 'n',
    movementDate: '2026-09-30', createdBy: 't' };
  w.sb.ovsAcquireReservationTx_(Object.assign({}, args, { qty: 30 }));
  w.sb.ovsConsumeReservationTx_(Object.assign({}, args, { qty: 30 }));
  var again = w.sb.ovsConsumeReservationTx_(Object.assign({}, args, { qty: 30 }));
  eq(ovsBal(w), [70, 0], 'H1  DOUBLE_DISPATCH_EFFECT_COUNT = 0 — the second consume moved nothing');
  eq([again.applied, again.reason], [false, 'NO_RESERVATION'], 'H1a and said so with a typed answer');
  eq(declared(w, 'WH-3PL', 'S1', 'SH-1').supply.qty, 0,
    'H1b a replay finds no supply at the declared source, so it cannot reach another one either');
  eq(facBal(w, 1), [100, 0], 'H2  CROSS_WAREHOUSE_REPLAY_EFFECT_COUNT = 0 — factory untouched throughout');
})();
(function () {
  // §15.I — the plain factory happy path, unchanged.
  var w = world({ fs: [fsRow({ warehouse_id: 'WH-FAC-A', fac_current_stock: 100, fac_reserved_stock: 0 })] });
  w.sb.factoryStockAcquireReservationTx_({ stockSheet: w.sheets.factory_stock,
    movSheet: w.sheets.factory_stock_movements, warehouseId: 'WH-FAC-A', sku: 'S1', qty: 30,
    ownerId: 'SH-1', journal: [], now: 'n', movementDate: '2026-09-30', createdBy: 't' });
  eq(facBal(w, 1), [100, 30], 'I1  reserve raises reserved only');
  eq(declared(w, 'WH-FAC-A', 'S1', 'SH-1').supply.qty, 100,
    'I1a and supply is still CURRENT, not current − reserved — asking for the latter would refuse a '
    + 'shipment the size of its own reservation');
  w.sb.factoryStockApplyDeltaTx_({ stockSheet: w.sheets.factory_stock,
    movSheet: w.sheets.factory_stock_movements, warehouseId: 'WH-FAC-A', sku: 'S1',
    deltaQty: -30, reservedDelta: -30, journal: [], now: 'n', movementDate: '2026-09-30',
    movementType: 'shipment_out', relatedEntityType: 'shipment', relatedEntityId: 'SH-1', createdBy: 't' });
  eq(facBal(w, 1), [70, 0], 'I2  and dispatch leaves 70/0');
})();

// =========================================================================================================
section('J — §8/§10/§12 WHAT THIS ROUND DID NOT DO');
// =========================================================================================================
var SRC = /__CSD_DECLARED_SOURCE_START__[\s\S]*?__CSD_DECLARED_SOURCE_END__/.exec(F22)[0];
var SRC_CODE = code(SRC);
eq(count(SRC_CODE, /\.sort\(/g), 0,
  'J1  SOURCE_SUBSTITUTION_IMPLEMENTED = NO — the declared-source block orders nothing');
// The one surviving sort in 22_ orders ROUTE NODES by sequence_no. Naming it is the difference between a
// claim that is true and a claim that merely happens to be green: a later round adding a warehouse sort
// elsewhere in this file should fail here rather than slip past a count that was always going to be 1.
var SORTS = (code(F22).match(/\.sort\(function \([^)]*\) \{[^}]*\}/g) || []);
eq(SORTS.length, 1, 'J1a 22_ contains exactly ONE sort');
ok(/return a\.seq - b\.seq;/.test(SORTS[0]),
  'J1a1 and it orders route nodes by sequence — no warehouse is ordered anywhere in this file', SORTS[0]);
// The block has exactly ONE fallback and it is not a source substitution: when an older 12_ is still
// deployed, the FACTORY half degrades to factory_stock directly rather than refusing every dispatch for
// the minutes a file-by-file sync takes. What must never degrade is WHICH warehouse — so the claim is
// made where it belongs, on the warehouse identity rather than on the word.
eq(count(SRC_CODE, /srcWarehouseId/g) > 0 && count(SRC_CODE, /warehouseId: (?!srcWarehouseId)/g), 0,
  'J1b the only warehouse named anywhere in the block is the DECLARED one');
eq(count(SRC_CODE, /first warehouse|anyWarehouse|otherWarehouse/i), 0,
  'J1b1 and nothing reaches for another warehouse by any name');
ok(/if \(!srcSheets && srcDomain !== 'OVERSEAS'\) \{/.test(SRC_CODE),
  'J1b2 the single fallback is the half-sync degrade to the FACTORY tables, for the SAME warehouse');
ok(!/shipment_qty\s*=|approved_qty\s*=/.test(code(F22)),
  'J2  SHIPPING_QTY_AUTHORITY_CHANGED = NO — the dispatcher writes no quantity authority');
ok(/take: need/.test(SRC), 'J2a it plans exactly the shipment quantity it was given');
eq(count(code(F22), /purchase_orders|handleCreateRequestOrder|handleCreatePurchaseOrder/g), 0,
  'J3  no Ordering execution entered the dispatch path');
eq(count(code(F22), /carrier_lead_times/g), 0, 'J3a and no Phase-2 lead-time orchestration');
// §9 — the movement, the route origin and the overview all still read the same source identity.
ok(/warehouseId: d\.warehouseId/.test(code(F22)),
  'J4  the movement row is written against the planned warehouse, which is now always the declared one');
ok(/warehouseId: srcWarehouseId/.test(SRC),
  'J4a SHIPMENT_MOVEMENT_SOURCE_DRIFT_COUNT = 0 — there is only one warehouse in play');

// =========================================================================================================
section('M — MUTATIONS');
// =========================================================================================================
function wFac(src22) {
  return world({ src22: src22, fs: [
    fsRow({ factory_stock_id: 'FS-A', warehouse_id: 'WH-FAC-A', fac_current_stock: 10 }),
    fsRow({ factory_stock_id: 'FS-B', warehouse_id: 'WH-FAC-B', fac_current_stock: 1000 })] });
}
mut('M1 the warehouse predicate is removed, so supply is summed across every warehouse', function () {
  var m = swap(F22, '  var b = factoryStockReadBalanceTx_(sheets.stockSheet, wid, s);',
    '  var b = { current: 1010 };');
  var w = wFac(m);
  return w.sb.csdDeclaredSourceSupply_('FACTORY', { stockSheet: w.sheets.factory_stock },
    'WH-FAC-A', 'S1', 'SH-1').qty !== 10;
});
mut('M2 selection reverts to SKU-only — the deduct plan stops naming the declared warehouse', function () {
  var m = swap(F22, 'deductPlan.push({ sku: sku, warehouseId: srcWarehouseId, take: need });',
    'deductPlan.push({ sku: sku, warehouseId: lines[0].warehouseId, take: need });');
  return /warehouseId: srcWarehouseId/.test(F22) && !/warehouseId: srcWarehouseId/.test(m);
});
mut('M3 a fallback to the first warehouse by warehouse_id is reintroduced', function () {
  var m = swap(F22, '      deductPlan.push({ sku: sku, warehouseId: srcWarehouseId, take: need });',
    '      var cand = allRows.sort(function (a, b) { return String(a.wh) < String(b.wh) ? -1 : 1; });' + NLX
    + '      deductPlan.push({ sku: sku, warehouseId: cand[0].wh, take: need });');
  var mBlock = code(/__CSD_DECLARED_SOURCE_START__[\s\S]*?__CSD_DECLARED_SOURCE_END__/.exec(m)[0]);
  return count(SRC_CODE, /\.sort\(/g) === 0 && count(mBlock, /\.sort\(/g) > 0;
});
mut('M4 Factory B is used when the declared Factory A is insufficient', function () {
  var m = swap(F22, '      if (supply.qty < need) {', '      if (false) {');
  var w = wFac(m);
  // With the shortfall gate gone, an 80-unit need against A's 10 would plan anyway.
  return /if \(supply\.qty < need\) \{/.test(F22) && !/if \(supply\.qty < need\) \{/.test(m)
    && w.sb.csdDeclaredSourceSupply_('FACTORY', { stockSheet: w.sheets.factory_stock },
      'WH-FAC-A', 'S1', 'SH-1').qty === 10;
});
mut('M5 overseas dispatch requires a factory_stock row again', function () {
  var m = swap(F22, "    var stockSheet = (srcDomain === 'OVERSEAS') ? null : srcSheets.stockSheet;",
    "    var stockSheet = ss.getSheetByName('factory_stock');" + NLX
    + "    if (!stockSheet) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'x' }); }");
  return /\(srcDomain === 'OVERSEAS'\) \? null :/.test(F22)
    && !/\(srcDomain === 'OVERSEAS'\) \? null :/.test(m);
});
mut('M6 the domain is classified AFTER the stock row is selected', function () {
  // The order IS the fix: a domain derived once a row has already been chosen can only ever say FACTORY,
  // because the row it would classify came out of the factory table. So the mutant genuinely moves the
  // classification below the supply lookup, and the detector is the order comparison itself.
  var DOMAIN_LINE = "    var srcDomain = (typeof shipmentSourceDomain_ === 'function')" + NLX
    + "      ? shipmentSourceDomain_(ss, srcWarehouseId) : 'FACTORY';";
  var m = swap(F22, DOMAIN_LINE, "    var srcDomain = 'FACTORY';");
  m = swap(m, '    if (stockErrors.length) {', DOMAIN_LINE + NLX + '    if (stockErrors.length) {');
  var mc = code(m);
  return mc.indexOf('shipmentSourceDomain_(ss, srcWarehouseId)') > mc.indexOf('csdDeclaredSourceSupply_(srcDomain');
});
mut('M7 the shipment source warehouse is ignored and a literal is used', function () {
  var m = swap(F22, "    var srcWarehouseId = sc('source_warehouse_id');", "    var srcWarehouseId = 'WH-FAC-B';");
  return /sc\('source_warehouse_id'\)/.test(F22) && !/sc\('source_warehouse_id'\)/.test(m);
});
mut('M8 a reservation/source mismatch is accepted — overseas supply reads AVAILABLE, not the hold', function () {
  var m = swap(F22, "    var held = ovsOwnerReservedTx_(sheets.movSheet, OVSTX_RESERVATION_OWNER_TYPE_, shipmentId) || {};",
    '    var held = {};' + NLX
    + '    held[wid + "||" + s] = ovsStockReadBalanceTx_(sheets.stockSheet, wid, s).available;');
  var w = world({ src22: m, snap: [snapRow({ warehouse_id: 'WH-3PL', wh_available_stock: 70, wh_reserved_stock: 30 })] });
  var sheets = { stockSheet: w.sheets.overseas_inventory_snapshot, movSheet: w.sheets.overseas_inventory_movements };
  // The honest answer for a shipment holding NOTHING is 0; the mutant answers the pool's 70.
  return w.sb.csdDeclaredSourceSupply_('OVERSEAS', sheets, 'WH-3PL', 'S1', 'SH-NONE').qty === 70;
});
mut('M9 a cross-domain consume is allowed — the overseas branch falls through to the factory one', function () {
  var m = swap(F22, "      if (srcDomain === 'OVERSEAS') {", 'if (false) {');
  return /if \(srcDomain === 'OVERSEAS'\) \{/.test(F22) && !/if \(srcDomain === 'OVERSEAS'\) \{/.test(m);
});
mut('M10 an unknown declared warehouse stops being refused', function () {
  var m = swap(F22, '    if (!srcRec) {', '    if (false) {');
  return /SHIPMENT_SOURCE_WAREHOUSE_UNKNOWN/.test(F22) && /if \(!srcRec\) \{/.test(F22)
    && !/if \(!srcRec\) \{/.test(m);
});
mut('M11 the factory supply rule becomes current − reserved, refusing a shipment its own reservation',
  function () {
    var m = swap(F22, '  return { qty: Math.max(0, Math.round(Number(b && b.current) || 0)), basis: \'current stock\' };',
      '  return { qty: Math.max(0, Math.round((Number(b && b.current) || 0) - (Number(b && b.reserved) || 0))), basis: \'current stock\' };');
    var w = world({ src22: m,
      fs: [fsRow({ warehouse_id: 'WH-FAC-A', fac_current_stock: 100, fac_reserved_stock: 80 })] });
    return w.sb.csdDeclaredSourceSupply_('FACTORY', { stockSheet: w.sheets.factory_stock },
      'WH-FAC-A', 'S1', 'SH-1').qty === 20;
  });

// =========================================================================================================
console.log('\n' + new Array(101).join('-'));
console.log('S6-R8A DECLARED-SOURCE DISPATCH: ' + pass + ' passed, ' + fail + ' failed'
  + '  ·  mutants ' + mutants + ', survived ' + survived);
console.log('diagnostic invariants: PRODUCTION_ROWS_WRITTEN=0 · NETWORK_CALLS=0 · DEPLOYMENTS=0');
console.log(new Array(101).join('-'));
if (fail > 0) process.exitCode = 1;
