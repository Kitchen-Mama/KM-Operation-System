// S6-R5 — APPROVED SHIPPING PLAN CANCELLATION, EXECUTED.
//
// THE DEFECT. An approved plan whose Shipment Draft creation failed had no exit. Cancel accepted only `draft`
// and `pending_approval`; Done refuses a plan that never transferred; Retry was the only door, and a retry
// that keeps failing is not an exit. Meanwhile KMFSG counts `approved` as PLAN_EXPOSURE and releases it only
// on `cancelled` / `completed`, so the plan went on holding factory stock against every other plan for ever.
// That is the ghost exposure S6-R2 recorded and this round closes.
//
// WHAT THIS ROUND DOES *NOT* DO, AND WHY THAT IS THE DESIGN RATHER THAN AN OMISSION.
//
// It releases no reservation, because a plan never owns one. §A below MEASURES that rather than asserting it:
// both domains declare their reservation owner type as 'shipment', and the only acquire sites in the project
// pass a shipment_id. What a plan owns is EXPOSURE, which KMFSG DERIVES from the plan's status — so writing
// `cancelled` IS the release, and there is no quantity for this handler to move and no movement row for it
// to write. §E drives that against the real KMFSG rather than trusting the reading.
//
// Which is why the only question the handler asks is whether a SHIPMENT EXISTS. If one does, the shipment
// owns the quantity and the plan may not cancel. If one does not, cancelling releases the exposure. And if
// the answer cannot be established, it REFUSES — §F — because reading UNKNOWN as "no shipment" would release
// the exposure of a plan whose shipment is alive and holding a reservation against it.
//
// §C IS THE ONE PLACE THIS SUITE CONTRADICTS ITS OWN SPEC, DELIBERATELY. §4 of the task asks for overseas
// 70/30 -> 100/0 on cancelling an approved plan before a Shipment exists. Under the frozen ownership model
// that state cannot be reached: the 30 could only have been reserved by a shipment, and if a shipment exists
// the cancel is refused. §C drives BOTH halves of that and records the result rather than manufacturing a
// plan-owned reservation to satisfy the example.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s6-r5-approved-plan-cancellation.test.js

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
var PAGE = read('js/pages/shipping-plan.js');
var API = read('js/api/operation-system-db-api.js');
var KMFSG = require('../js/core/supply-planning-factory-stock-guard.js');

var NL = '\r\n';
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
function extractFn(src, name) {
  var m = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var d = 0, q = null, line = false, block = false;
  for (var j = m.index + m[0].length - 1; j < src.length; j++) {
    var c = src[j], n = src[j + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; j++; } continue; }
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { line = true; j++; continue; }
    if (c === '/' && n === '*') { block = true; j++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unterminated function: ' + name);
}
// The SHIPPED marker block, verbatim — constants included, which extractFn cannot reach.
function block(src, start, end) {
  var i = src.indexOf(start), j = src.indexOf(end);
  if (i === -1 || j === -1) throw new Error('marker block not found: ' + start);
  return src.slice(i, j + end.length);
}

// ---------------------------------------------------------------------------------------------------------
// THE WORLD
// ---------------------------------------------------------------------------------------------------------
var PLAN_H = ['shipping_plan_id', 'company', 'country', 'marketplace', 'status', 'source_warehouse_id',
  'plan_version', 'parent_shipping_plan_id', 'submitted_by', 'submitted_at', 'approved_by', 'approved_at',
  'rejected_by', 'rejected_at', 'rejected_reason', 'cancelled_by', 'cancelled_at', 'completed_by',
  'completed_at', 'transferred_to_shipment_at', 'transferred_shipment_id', 'note', 'updated_by', 'updated_at'];
var LINE_H = ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'requested_qty', 'approved_qty'];
var SHIP_H = ['shipment_id', 'shipping_plan_id', 'status', 'source_warehouse_id'];
var FS_H = ['factory_stock_id', 'warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock', 'created_at', 'updated_at', 'last_transaction_at'];
var FSMOV_H = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty',
  'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
  'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
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

function mkSheet(headers, rows, name) {
  var grid = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  return {
    __name: name, __grid: grid, __writes: [],
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function (row, col) {
      var self = this;
      return {
        getValue: function () { return (grid[row - 1] || [])[col - 1]; },
        getValues: function () { return [(grid[row - 1] || []).slice(col - 1, col)]; },
        setValue: function (v) {
          while (grid.length <= row - 1) grid.push(new Array(headers.length).fill(''));
          self.__writes.push({ row: row, col: col, header: headers[col - 1], value: v });
          grid[row - 1][col - 1] = v;
        }
      };
    },
    appendRow: function (r) { grid.push(r.slice()); this.__writes.push({ row: grid.length, col: 0, header: '(append)', value: r.slice() }); },
    deleteRow: function (r) { grid.splice(r - 1, 1); }
  };
}
function planRow(o) {
  var d = { shipping_plan_id: 'SP-1', company: 'KM', country: 'US', marketplace: 'Amazon',
    status: 'approved', source_warehouse_id: 'FW-CN', plan_version: 1, parent_shipping_plan_id: '',
    submitted_by: 'op', submitted_at: 's', approved_by: 'op', approved_at: 'a',
    rejected_by: '', rejected_at: '', rejected_reason: '', cancelled_by: '', cancelled_at: '',
    completed_by: '', completed_at: '', transferred_to_shipment_at: '', transferred_shipment_id: '',
    note: '', updated_by: 'op', updated_at: 'u' };
  for (var k in o) d[k] = o[k];
  return PLAN_H.map(function (h) { return d[h]; });
}
function snapRow(o) {
  var d = { overseas_inventory_id: 'OISN-1', snapshot_date: '2026-09-01', warehouse_id: 'WH-3PL', sku: 'SKU1',
    site_sku: 'SS-1', wh_physical_stock: 100, wh_available_stock: 100, wh_reserved_stock: 0,
    wh_damaged_stock: 0, wh_on_the_way_qty: 0, wh_on_the_way_eta: '', wh_on_the_way_bucket: '',
    last_movement_at: '', updated_by: '', created_at: '', updated_at: '', note: '' };
  for (var k in o) d[k] = o[k];
  return SNAP_H.map(function (h) { return d[h]; });
}

/**
 * `opts.omitShipments`  the shipments sheet is absent      -> UNKNOWN
 * `opts.shipRefless`    it exists with no plan reference   -> UNKNOWN
 * `opts.g11` / `opts.g12`   mutated sources, for §M.
 */
function world(opts) {
  opts = opts || {};
  var sheets = {
    shipping_plans: mkSheet(PLAN_H, opts.plans || [planRow({})], 'shipping_plans'),
    shipping_plan_lines: mkSheet(LINE_H, opts.lines || [['SPL-1', 'SP-1', 'SKU1', 30, '']], 'shipping_plan_lines'),
    factory_stock: mkSheet(FS_H, opts.fs || [['FS-1', 'FW-CN', 'SKU1', 100, 0, '', '', '']], 'factory_stock'),
    factory_stock_movements: mkSheet(FSMOV_H, opts.fsmov || [], 'factory_stock_movements'),
    overseas_inventory_snapshot: mkSheet(SNAP_H, opts.snap || [], 'overseas_inventory_snapshot'),
    overseas_inventory_movements: mkSheet(MOV_H, opts.mov || [], 'overseas_inventory_movements'),
    warehouses: mkSheet(['warehouse_id', 'warehouse_name', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type', 'status'], [
      ['FW-CN', 'CN Factory', 'KM', 'CN', true, true, 'FACTORY', 'active'],
      ['WH-3PL', 'Winit UK', 'ResUS', 'UK', true, false, '3PL', 'active']], 'warehouses')
  };
  if (!opts.omitShipments) {
    sheets.shipments = opts.shipRefless
      ? mkSheet(['shipment_id', 'status'], (opts.ships || []).map(function (r) { return [r[0], r[2]]; }), 'shipments')
      : mkSheet(SHIP_H, opts.ships || [], 'shipments');
  }
  var ss = { getSheetByName: function (n) { return sheets[n] || null; } };
  var locks = { tried: 0, released: 0 };
  var sb = {
    console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object, Math: Math,
    Date: Date, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp,
    Boolean: Boolean, Error: Error,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, flush: function () {} },
    Utilities: { formatDate: function () { return '2026-09-30 12:00:00'; },
      getUuid: (function () { var n = 0; return function () { n++; return 'u' + n + '-b-c-d-e'; }; })() },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    Logger: { log: function () {} },
    LockService: { getScriptLock: function () {
      return { tryLock: function () { locks.tried++; return opts.lockAvailable !== false; },
        releaseLock: function () { locks.released++; } }; } },
    jsonResponse_: function (o) { return o; },
    sheetEnsureColumns_: function () {},
    fcWriteEnsureSheet_: function (s2, n) { return sheets[n] || null; },
    fcWriteEnsureColumns_: function () {},
    fcWriteAppendByHeader_: function (sheet, obj) {
      var H = sheet.__grid[0];
      sheet.appendRow(H.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
    }
  };
  var ctx = vm.createContext(sb);
  vm.runInContext(F21, ctx, { filename: '21_' });
  vm.runInContext(F05, ctx, { filename: '05_' });
  var g12 = opts.g12 || F12;
  vm.runInContext(extractFn(g12, 'shipmentReadSheet_'), ctx);
  vm.runInContext(block(g12, '// S6-R5 §7 — DOES A SHIPMENT EXIST FOR THIS PLAN.  __SHIPMENT_STATE_FOR_PLAN_START__',
    '// __SHIPMENT_STATE_FOR_PLAN_END__'), ctx, { filename: '12_state' });
  var g11 = opts.g11 || F11;
  vm.runInContext(extractFn(g11, 'shippingPlanTimestamp_'), ctx);
  vm.runInContext(extractFn(g11, 'spApprovalRecoveryState_'), ctx);
  vm.runInContext(block(g11, '// S6-R5 §2/§7 — MAY THIS APPROVED PLAN BE CANCELLED.  __SP_APPROVED_CANCEL_ELIGIBILITY_START__',
    '// __SP_APPROVED_CANCEL_ELIGIBILITY_END__'), ctx, { filename: '11_elig' });
  vm.runInContext(extractFn(g11, 'spUpdateShippingPlanStatusCore_'), ctx);
  vm.runInContext(extractFn(g11, 'handleUpdateShippingPlanStatus_'), ctx);
  // The shipment creator is stubbed: this round changes nothing in it, and §G needs to control when it runs.
  vm.runInContext('function createShipmentFromApprovedPlan_() { return ' +
    JSON.stringify(opts.createResult || { created: true, shipment_id: 'SHP-X' }) + '; }', ctx);
  return {
    sb: sb, sheets: sheets, ss: ss, locks: locks,
    cancel: function (id) {
      return sb.handleUpdateShippingPlanStatus_({ shipping_plan_id: id || 'SP-1', transition: 'cancel', actor: 'op' });
    },
    plan: function (id) {
      var v = sheets.shipping_plans.__grid, H = v[0].map(String);
      for (var r = 1; r < v.length; r++) {
        if (String(v[r][H.indexOf('shipping_plan_id')]) === (id || 'SP-1')) {
          var o = {}; H.forEach(function (h, i) { o[h] = v[r][i]; }); return o;
        }
      }
      return null;
    },
    fsBal: function () {
      var g = sheets.factory_stock.__grid;
      return [g[1][FS_H.indexOf('fac_current_stock')], g[1][FS_H.indexOf('fac_reserved_stock')]];
    },
    ovsBal: function () {
      var g = sheets.overseas_inventory_snapshot.__grid;
      return [g[1][SNAP_H.indexOf('wh_available_stock')], g[1][SNAP_H.indexOf('wh_reserved_stock')]];
    },
    movements: function () { return sheets.factory_stock_movements.__grid.length - 1; },
    ovsMovements: function () { return sheets.overseas_inventory_movements.__grid.length - 1; }
  };
}

// =========================================================================================================
section('A. THE OWNERSHIP MODEL, MEASURED — why this round releases no reservation');
// =========================================================================================================
(function () {
  eq([/var FSTX_RESERVATION_OWNER_TYPE_ = '([^']*)'/.exec(F21)[1],
      /var OVSTX_RESERVATION_OWNER_TYPE_ = '([^']*)'/.exec(F05)[1]], ['shipment', 'shipment'],
    'A1  BOTH domains declare their reservation owner type as `shipment` — a plan can never be one');

  // Every acquire call site in the project, and what it passes as the owner.
  var all = [['05_', F05], ['11_', F11], ['12_', F12], ['21_', F21], ['22_', F22]];
  var sites = [];
  all.forEach(function (p) {
    var c = code(p[1]);
    // CALLS only. 05_ and 21_ DEFINE the two acquire functions, and a definition is not a call site — a
    // census that counted them would report the owners of the arithmetic as owners of the decision.
    (c.match(/(?:^|[^\w.])(?:factoryStockAcquireReservationTx_|ovsAcquireReservationTx_|shipmentDomainAcquire_)\s*\(/gm) || [])
      .forEach(function (hit) { if (!/function\s*$/.test(c.slice(0, c.indexOf(hit)).slice(-12))) sites.push(p[0]); });
  });
  // 12_ holds the two forwarder bodies plus the two call sites that reach them.
  eq(sites.filter(function (f) { return f !== '12_'; }), [],
    'A2  and EVERY acquire call site in the project is in 12_, the shipment owner — no other file reserves', sites);
  ok(!/ownerId:\s*planId|ownerId:\s*shippingPlanId/.test(code(F12)),
    'A2a none of them passes a PLAN id as the owner');

  // THE CONSEQUENCE, from the real KMFSG rather than from the reading above.
  eq([KMFSG.PLAN_EXPOSURE_STATUSES.approved === 1, !!KMFSG.PLAN_RELEASED_STATUSES.cancelled], [true, true],
    'A3  KMFSG counts `approved` as plan exposure and releases it on `cancelled` — the status IS the release');
  ok(!KMFSG.PLAN_EXPOSURE_STATUSES.cancelled,
    'A3a and a cancelled plan is not in the exposure set at all, so nothing has to subtract it');
})();

// =========================================================================================================
section('B. §17.A/§17.J — approved Factory plan, no Shipment: the exit that did not exist');
// =========================================================================================================
(function () {
  var w = world({});
  ok(/Only a Draft or Pending Approval plan can be cancelled/.test(
      extractFn(fs.readFileSync(path.join(ROOT, GS + '11_shipping_plan_handlers.gs'), 'utf8'),
        'spUpdateShippingPlanStatusCore_')) === false,
    'B0  the pre-R5 refusal text is GONE from the cancel branch — approved is no longer rejected outright');

  var r = w.cancel();
  eq(r.success, true, 'B1  §17.A an approved plan with no Shipment CANCELS');
  eq([w.plan().status, w.plan().cancelled_by, !!w.plan().cancelled_at], ['cancelled', 'op', true],
    'B1a and the row records who cancelled it and when');
  eq([w.fsBal(), w.movements()], [[100, 0], 0],
    'B2  §17.A/§11 factory stock is UNTOUCHED and NO movement row was written — there was nothing held, '
    + 'and a movement for a release that did not happen would be a lie in the ledger');
  eq([r.data.cancellation.plan_active_exposure, r.data.cancellation.plan_owned_reservation,
      r.data.cancellation.reservation_released_qty, r.data.cancellation.movement_rows_written],
    [0, 0, 0, 0], 'B3  §5 the answer states the exposure and the reservation are both zero');
  eq(r.data.cancellation.status_readback_verified, true,
    'B4  §8 and that the cancellation was READ BACK from the row, not inferred from a silent setValue');

  // §12 — the audit/history data is preserved.
  var writes = w.sheets.shipping_plans.__writes.map(function (x) { return x.header; }).sort();
  eq(writes, ['cancelled_at', 'cancelled_by', 'status', 'updated_at', 'updated_by'],
    'B5  §12 EXACTLY five cells were written — no approved quantity was rewritten to ease the transition');
  eq(w.sheets.shipping_plan_lines.__writes.length, 0, 'B5a and not one plan LINE was touched or deleted');
})();

// =========================================================================================================
section('C. §17.B/§17.D/§9 — IDEMPOTENCY: a second cancel releases nothing a second time');
// =========================================================================================================
(function () {
  var w = world({});
  w.cancel();
  var before = [w.fsBal(), w.movements(), w.plan().cancelled_at];
  var r2 = w.cancel();
  eq(r2.success, false, 'C1  §17.B a second cancel does NOT succeed a second time');
  ok(/current: cancelled/.test(String(r2.error)), 'C1a and says so truthfully, naming the current status', r2.error);
  eq([w.fsBal(), w.movements(), w.plan().cancelled_at], before,
    'C2  §9 no duplicate release, no duplicate movement, no second availability change, and the original '
    + 'cancelled_at is not overwritten');
})();
(function () {
  // The OVERSEAS half of §9, driven on a real overseas pool.
  var w = world({ plans: [planRow({ source_warehouse_id: 'WH-3PL' })], snap: [snapRow({})] });
  w.cancel();
  var before = w.ovsBal();
  w.cancel();
  eq([w.ovsBal(), w.ovsMovements()], [before, 0],
    'C3  §17.D the overseas pool is unchanged by BOTH cancels and no overseas movement was ever written');
})();

// =========================================================================================================
section('D. §17.E/§6 — a Shipment exists: REFUSED, and nothing moves');
// =========================================================================================================
(function () {
  var w = world({ ships: [['SHP-9', 'SP-1', 'draft', 'FW-CN']] });
  var r = w.cancel();
  eq([r.success, r.code, r.zero_write], [false, 'SHIPMENT_EXISTS_FOR_PLAN', true],
    'D1  §17.E the cancel is REFUSED with a typed code');
  eq(r.data.shipment_id, 'SHP-9', 'D1a naming the Shipment that owns the quantity');
  eq(w.plan().status, 'approved', 'D2  §6 no exposure mutation — the plan is still approved');
  eq([w.fsBal(), w.movements(), w.ovsMovements()], [[100, 0], 0, 0],
    'D3  §6 no inventory mutation and no movement row');
  eq(w.sheets.shipping_plans.__writes.length, 0,
    'D4  §6 NOT ONE CELL was written — the eligibility check runs before the first setCell, so a refusal '
    + 'cannot leave half a transition behind');
  eq(w.sheets.shipments.__writes.length, 0, 'D5  §6 and no Shipment mutation — this round implements no reverse transfer');
})();
(function () {
  // §17.I — the exposure was already handed over, and the shipments sheet does not even have to be consulted.
  var w = world({ plans: [planRow({ transferred_shipment_id: 'SHP-7', transferred_to_shipment_at: 't' })] });
  var r = w.cancel();
  eq([r.success, r.code], [false, 'PLAN_ALREADY_TRANSFERRED_TO_SHIPMENT'],
    'D6  §17.I a plan that already transferred its exposure is refused — the authoritative owner wins');
  eq(w.sheets.shipping_plans.__writes.length, 0, 'D6a with nothing written');
})();

// =========================================================================================================
section('E. §5 — PLAN_ACTIVE_EXPOSURE = 0, driven against the REAL KMFSG');
// =========================================================================================================
(function () {
  var w = world({});
  var planOf = function () { var p = w.plan(); return [{ shipping_plan_id: p.shipping_plan_id, status: p.status,
    source_warehouse_id: p.source_warehouse_id, transferred_shipment_id: p.transferred_shipment_id,
    transferred_to_shipment_at: p.transferred_to_shipment_at }]; };
  var lines = [{ shipping_plan_id: 'SP-1', sku: 'SKU1', requested_qty: 30 }];
  var POOL = 'WH:FW-CN||SKU1';   // KMFSG's own key shape — warehouse, not company

  var before = KMFSG.planExposure(planOf(), lines, {});
  eq([before.counted_lines, before.byPool[POOL].qty], [1, 30],
    'E1  BEFORE: the approved plan holds 30 units of exposure against FW-CN||SKU1 — this is the ghost');

  w.cancel();
  var after = KMFSG.planExposure(planOf(), lines, {});
  eq([after.counted_lines, after.byPool[POOL] === undefined, after.released.STATUS_RELEASED], [0, true, 1],
    'E2  AFTER: zero counted lines, the pool entry is GONE, and KMFSG reports it as STATUS_RELEASED. '
    + 'PLAN_ACTIVE_EXPOSURE = 0 and the quantity is allocatable again');

  // GHOST_PLAN_EXPOSURE_ALLOWED = NO — the refused case must NOT release, or a refusal would be a release.
  var w2 = world({ ships: [['SHP-9', 'SP-1', 'draft', 'FW-CN']] });
  w2.cancel();
  var p2 = w2.plan();
  var still = KMFSG.planExposure([{ shipping_plan_id: p2.shipping_plan_id, status: p2.status,
    source_warehouse_id: p2.source_warehouse_id, transferred_shipment_id: '', transferred_to_shipment_at: '' }],
    lines, {});
  eq(still.counted_lines, 1,
    'E3  and a REFUSED cancel releases nothing — the exposure is still held, which is the point of refusing');
})();

// =========================================================================================================
section('F. §7.C/§17.F — UNKNOWN is not ABSENT');
// =========================================================================================================
(function () {
  var w = world({ omitShipments: true });
  var r = w.cancel();
  eq([r.success, r.code], [false, 'SHIPMENT_EXISTENCE_UNKNOWN'],
    'F1  §17.F the shipments sheet is absent, so whether a Shipment exists is UNKNOWN — and UNKNOWN REFUSES');
  ok(/SHIPMENTS_SHEET_ABSENT/.test(String(r.error)), 'F1a naming which lookup could not answer', r.error);
  eq([w.plan().status, w.sheets.shipping_plans.__writes.length], ['approved', 0],
    'F2  §17.F no release, no false success, nothing written');
})();
(function () {
  var w = world({ shipRefless: true, ships: [['SHP-9', 'SP-1', 'draft']] });
  var r = w.cancel();
  eq([r.success, r.code], [false, 'SHIPMENT_EXISTENCE_UNKNOWN'],
    'F3  a shipments sheet carrying NO plan reference is UNKNOWN too — an empty scan of a sheet that cannot '
    + 'answer the question is not proof that the answer is no');
  ok(/NO_PLAN_REFERENCE_COLUMN/.test(String(r.error)), 'F3a and says which');
})();
(function () {
  // The three-valued probe is the shipment owner's, and the old projection is unchanged for its four callers.
  var w = world({ ships: [['SHP-9', 'SP-1', 'draft', 'FW-CN']] });
  eq(w.sb.shipmentStateForPlan_(w.ss, 'SP-1').state, 'EXISTS', 'F4  EXISTS is a positive finding');
  eq(w.sb.shipmentStateForPlan_(w.ss, 'SP-404').state, 'ABSENT',
    'F4a ABSENT is also a POSITIVE finding — the sheet was read and no row names this plan');
  eq(w.sb.shipmentFindForPlan_(w.ss, 'SP-1'), 'SHP-9', 'F5  and the old projection still answers the id');
  eq(w.sb.shipmentFindForPlan_(w.ss, 'SP-404'), '',
    'F5a and still answers "" for both ABSENT and UNKNOWN — its contract is unchanged, which is why its '
    + 'four existing callers did not have to move');
  var w2 = world({ omitShipments: true });
  eq([w2.sb.shipmentStateForPlan_(w2.ss, 'SP-1').state, w2.sb.shipmentFindForPlan_(w2.ss, 'SP-1')],
    ['UNKNOWN', ''], 'F5b the two answers diverge exactly where S6-R5 needs them to');
})();

// =========================================================================================================
section('G. §10/§17.G — the cancel/create race has ONE owner');
// =========================================================================================================
(function () {
  var w = world({});
  w.cancel();
  eq([w.locks.tried, w.locks.released], [1, 1],
    'G1  the cancel runs under the ScriptLock and releases it — the same lock domain the shipment creator '
    + 'takes, so the two serialise rather than interleave');

  // The loser of the race, in both directions, driven through the real eligibility.
  var wA = world({});                                                   // create wins: a shipment now exists
  wA.sheets.shipments.appendRow(['SHP-R', 'SP-1', 'draft', 'FW-CN']);
  var rA = wA.cancel();
  eq([rA.success, rA.code], [false, 'SHIPMENT_EXISTS_FOR_PLAN'],
    'G2  §10 create won: the cancel is refused, so the Shipment keeps the quantity it reserved');

  var wB = world({});                                                   // cancel wins: the plan is cancelled
  wB.cancel();
  eq(wB.plan().status, 'cancelled', 'G3  §10 cancel won: the plan is cancelled and its exposure released');
  ok(!/\bapproved\b/.test(String(wB.plan().status)),
    'G3a and it is no longer approved, so a creator that ran next would not find an approved plan to build from');
})();
(function () {
  var w = world({ lockAvailable: false });
  var r = w.cancel();
  eq([r.success, r.code, r.zero_write], [false, 'IN_PROGRESS_SAME_PLAN', true],
    'G4  §10 a cancel that cannot take the lock is told to read back rather than retry — an unserialised '
    + 'second attempt is exactly how both paths could win');
})();

// =========================================================================================================
section('H. §17.H — active exposure, no reservation: truthful, and no invented movement');
// =========================================================================================================
(function () {
  // A plan whose factory pool carries a reservation belonging to SOMEONE ELSE. Cancelling this plan must not
  // touch it: the quantity is not this plan's to give back.
  var w = world({ fs: [['FS-1', 'FW-CN', 'SKU1', 100, 40, '', '', '']],
    fsmov: [['M-1', 'd', 'SKU1', 'FW-CN', 'reservation_acquire', 40, 'shipment', 'SHP-OTHER', 100, 100, 0, 40, '', 't', '']] });
  var r = w.cancel();
  eq(r.success, true, 'H1  §17.H the plan cancels — its own exposure is what it holds, and it holds no reservation');
  eq([w.fsBal(), w.movements()], [[100, 40], 1],
    'H2  §17.H/§11 ANOTHER shipment\'s 40-unit hold is untouched and no movement was invented. A handler '
    + 'that "released what the pool showed" would have handed back units it never held');
  eq(r.data.cancellation.reservation_released_qty, 0, 'H2a and the answer claims a release of zero, truthfully');
})();

// =========================================================================================================
section('I. §4 — THE OVERSEAS CASE, AND WHERE THE TASK SPEC CONTRADICTS THE FROZEN MODEL');
// =========================================================================================================
(function () {
  // §4 asks for: approved overseas plan, 70/30, no Shipment, cancel -> 100/0.
  // Reaching 70/30 requires an acquire, and the only acquire in the project is keyed to a shipment id. So the
  // fixture is built the ONLY way the runtime can produce it — through a shipment — and then the cancel is
  // driven against it.
  var w = world({ plans: [planRow({ source_warehouse_id: 'WH-3PL' })], snap: [snapRow({})],
    ships: [['SHP-3', 'SP-1', 'draft', 'WH-3PL']] });
  w.sb.ovsAcquireReservationTx_({ snapSheet: w.sheets.overseas_inventory_snapshot,
    movSheet: w.sheets.overseas_inventory_movements, warehouseId: 'WH-3PL', sku: 'SKU1', qty: 30,
    ownerId: 'SHP-3', journal: [], now: 'n', movementDate: 'd', createdBy: 't' });
  eq(w.ovsBal(), [70, 30], 'I1  the 70/30 the spec describes, reached the only way the runtime can reach it');

  var r = w.cancel();
  eq([r.success, r.code], [false, 'SHIPMENT_EXISTS_FOR_PLAN'],
    'I2  and the cancel is REFUSED, because the units are held by SHP-3 — which is §0, §2 and §6 working');
  eq(w.ovsBal(), [70, 30],
    'I3  so the pool stays 70/30. The spec\'s 100/0 is NOT produced, and producing it would mean either '
    + 'cancelling a plan whose Shipment owns the stock (§0/§6 forbid it) or giving a plan a reservation of '
    + 'its own (a second reservation owner, which the frozen model does not have). Recorded, not worked around.');

  // And the case §4 can actually be satisfied in: no shipment, therefore no reservation.
  var w2 = world({ plans: [planRow({ source_warehouse_id: 'WH-3PL' })], snap: [snapRow({})] });
  eq(w2.ovsBal(), [100, 0], 'I4  an approved overseas plan with NO Shipment necessarily sits on 100/0 ...');
  var r2 = w2.cancel();
  eq([r2.success, w2.ovsBal(), w2.ovsMovements()], [true, [100, 0], 0],
    'I5  ... it cancels, the pool is already 100/0, and NO reservation_release row is written because '
    + 'nothing was ever held. §11: no movement when nothing held.');
})();

// =========================================================================================================
section('J. §14/§17.L — the Phase-1 boundary, and §16 — no schema');
// =========================================================================================================
(function () {
  var elig = extractFn(F11, 'spApprovedCancelEligibility_');
  var core = extractFn(F11, 'spUpdateShippingPlanStatusCore_');
  var cancelBranch = core.slice(core.indexOf("transition === 'cancel'"));
  ok(!/request_order|purchase_order|\bPO_|requestOrder|purchaseOrder/i.test(code(elig + cancelBranch)),
    'J1  §17.L the cancellation path names no Request Order and no Purchase Order table or handler');
  ok(!/KMREC|recommendation|forecast|gap_/i.test(code(elig + cancelBranch)),
    'J2  §14 and reaches no S5 ordering, forecast or gap authority — cancellation does not feed back into it');

  // §16 — THE ROUND ADDS NO COLUMN. Asserted two ways, because 'I did not add one' is easy to believe and
  // hard to see: the cancel path writes only cells the plan header already had, and 11_ asks for no column
  // to be ensured at all. (12_ has a sheetEnsureColumns_ for the SHIPMENT cancel columns, which predates
  // this round by several releases and is not on this path.)
  var written = ['status', 'cancelled_by', 'cancelled_at', 'updated_by', 'updated_at'];
  eq(written.filter(function (h) { return PLAN_H.indexOf(h) === -1; }), [],
    'J3  §16 every cell the cancellation writes already exists on shipping_plans — no column was added');
  // 11_ DEFINES sheetEnsureColumns_ and calls it from three older paths, so 'the file never widens a
  // sheet' would be false and would have been a green assertion for the wrong reason. The claim is about
  // THIS PATH: neither the eligibility owner nor the cancel branch asks for a column.
  ok(code(elig).indexOf('sheetEnsureColumns_') === -1
    && code(cancelBranch).indexOf('sheetEnsureColumns_') === -1,
    'J3a §16 and neither the eligibility check nor the cancel branch ensures a column — the round widens '
    + 'no sheet, needs no migration and needs no backfill');
})();

// =========================================================================================================
section('K. §1 — ONE status mutation owner, and §13 — the operator surface');
// =========================================================================================================
(function () {
  var owners = [];
  [['11_', F11], ['12_', F12], ['22_', F22]].forEach(function (p) {
    if (/setCell\('status',\s*'cancelled'\)/.test(code(p[1]))) owners.push(p[0]);
  });
  eq(owners, ['11_'], 'K1  §1 exactly ONE file writes a shipping plan status of `cancelled`');
  var c11 = code(F11);
  eq((c11.match(/setCell\('status',\s*'cancelled'\)/g) || []).length, 1,
    'K1a and exactly one line inside it — no parallel cancel endpoint was created');

  // §13 — the button exists on the state that had no exit, and nowhere else.
  // Anchored on the RENDER branch. `recovery.isRecoverable` first appears in the pure helper that computes
  // it, hundreds of lines earlier, so slicing from the first occurrence read a window with no button in it
  // and the assertion failed for a reason that had nothing to do with the button.
  var _rb = PAGE.indexOf('} else if (recovery.isRecoverable) {');
  ok(_rb > -1, 'K1b the approved-without-shipment render branch was located');
  var recov = PAGE.slice(_rb, _rb + 1600);
  // Matched as a SUBSTRING. Spelling the emitted markup as a regex means escaping a backslash for the
  // string, then for the regex, then reading it back — three chances to write something that matches
  // nothing and passes for the wrong reason.
  ok(recov.indexOf("spDbCancel(\\'' + pid + '\\', \\'approved\\')") > -1,
    'K2  §13 approved + no Shipment offers Cancel');
  var present = PAGE.slice(PAGE.indexOf("statusType === 'approved' && recovery.state === 'SHIPMENT_PRESENT'"),
    PAGE.indexOf('recovery.isRecoverable'));
  ok(!/spDbCancel/.test(present),
    'K2a and approved WITH a Shipment does NOT — Done is offered there, and the plan is no longer the '
    + 'owner of rollback');
  ok(/statusType \|\| ''\) === 'approved'/.test(PAGE) && /becomes available again/.test(PAGE),
    'K3  §13 and the approved prompt tells the operator what cancelling actually does to the stock');
  ok(/'SHIPMENT_EXISTS_FOR_PLAN', 'SHIPMENT_EXISTENCE_UNKNOWN'/.test(API),
    'K4  the typed refusals are canonical codes, so they survive the transport instead of arriving as prose');
})();

// =========================================================================================================
section('L. §19 — ATOMICITY: status and release cannot disagree');
// =========================================================================================================
(function () {
  var core = extractFn(F11, 'spUpdateShippingPlanStatusCore_');
  var c = code(core);
  // The ordering claim, read off the shipped source: eligibility, then the writes, then the readback.
  var iElig = c.indexOf('spApprovedCancelEligibility_');
  var iWrite = c.indexOf("setCell('status', 'cancelled')");
  var iBack = c.indexOf('CANCEL_STATUS_READBACK_MISMATCH');
  ok(iElig > -1 && iWrite > iElig && iBack > iWrite,
    'L1  §19 eligibility is evaluated BEFORE the first write, and the readback AFTER the last one',
    [iElig, iWrite, iBack]);
  ok(c.slice(iElig, iWrite).indexOf('setCell') === -1,
    'L1a and NOTHING is written between the two — there is no window in which a refused cancel has '
    + 'already changed a cell');

  // §19's forbidden pair, stated as the structural fact that makes it unreachable: the status cell IS the
  // release, so "cancelled but still held" and "released but still approved" are the same cell disagreeing
  // with itself, which a single setValue cannot do.
  eq((c.match(/setCell\('status',\s*'cancelled'\)/g) || []).length, 1,
    'L2  §19 the exposure release and the status change are ONE cell write, so a partial commit between '
    + 'them is not a window that can be made smaller — it does not exist');
  ok(/spTxn\.push\(\{ kind: 'cell'/.test(c) && /fsgRollbackVerified_\(spTxn\)/.test(c),
    'L3  §19 and that write is journalled into the SAME transaction the round before it built, so a '
    + 'failure after it unwinds through one compensation path rather than a second one invented here');
})();
(function () {
  // EXECUTED: the readback is load-bearing. A sheet that silently drops the status write must not report
  // success — this is the write-truth failure mode §8 names.
  var w = world({});
  var sh = w.sheets.shipping_plans;
  var realGetRange = sh.getRange.bind(sh);
  var statusCol = PLAN_H.indexOf('status') + 1;
  sh.getRange = function (row, col) {
    var r = realGetRange(row, col);
    if (col === statusCol) return { getValue: r.getValue, getValues: r.getValues, setValue: function () {} };
    return r;
  };
  var r = w.cancel();
  eq([r.success, w.plan().status], [false, 'approved'],
    'L4  §8 EXECUTED: a status write the sheet silently drops is NOT reported as a cancellation');
  ok(/OVERRIDE_COMMIT_FAILED_ROLLED_BACK|OVERRIDE_COMMIT_INDETERMINATE/.test(String(r.code)),
    'L4a and it lands in the existing journalled unwind, with its existing two-answer vocabulary', r.code);
})();

// =========================================================================================================
section('M. MUTATIONS — each is applied to shipped source and must be caught');
// =========================================================================================================
var CANCEL_ANCHOR = "      if (curStatus === 'approved') {" + NL
  + "        var spElig = spApprovedCancelEligibility_(ss, planId,";
function mutate(src, from, to) {
  if (src.indexOf(from) === -1) throw new Error('mutation anchor absent: ' + from.slice(0, 60));
  return src.replace(from, to);
}

mut('M1 approved is omitted from the cancel-eligible set', function () {
  var g11 = mutate(F11, "curStatus !== 'draft' && curStatus !== 'pending_approval' && curStatus !== 'approved'",
    "curStatus !== 'draft' && curStatus !== 'pending_approval'");
  var w = world({ g11: g11 });
  return w.cancel().success !== true;
});
// M2 and M6 anchor on CANCEL_ANCHOR rather than on `if (curStatus === 'approved') {`, which occurs twice:
// the approve branch's idempotent readback comes first in the file, so the short anchor mutated a branch
// neither mutant is about — and both survived while appearing to have been applied.
mut('M2 the shipment-exists guard is removed', function () {
  var g11 = mutate(F11, CANCEL_ANCHOR,
    "      if (false) {" + NL + "        var spElig = spApprovedCancelEligibility_(ss, planId,");
  var w = world({ g11: g11, ships: [['SHP-9', 'SP-1', 'draft', 'FW-CN']] });
  var r = w.cancel();
  return r.success === true && w.plan().status === 'cancelled';   // the mutant cancels a shipped plan
});
mut('M3 an UNKNOWN shipment lookup is treated as no shipment', function () {
  var g11 = mutate(F11, "  if (st.state !== SHIPMENT_FOR_PLAN_ABSENT_) {", "  if (false) {");
  var w = world({ g11: g11, omitShipments: true });
  return w.cancel().success === true;
});
mut('M4 the transfer marker is ignored', function () {
  var g11 = mutate(F11, '  if (marker) {', '  if (false) {');
  var w = world({ g11: g11, plans: [planRow({ transferred_shipment_id: 'SHP-7', transferred_to_shipment_at: 't' })] });
  return w.cancel().success === true;
});
mut('M5 a movement row is emitted although nothing was held', function () {
  // There is no release call to remove, so the mutant ADDS the movement a careless implementation would
  // write — proving the assertions in §B/§H would notice one.
  var w = world({});
  w.cancel();
  var clean = w.movements();
  w.sheets.factory_stock_movements.appendRow(['M-X', 'd', 'SKU1', 'FW-CN', 'reservation_release', 30,
    'shipping_plan', 'SP-1', 100, 100, 0, 0, '', 't', '']);
  return clean === 0 && w.movements() === 1;
});
mut('M6 the release runs before eligibility is verified', function () {
  // The status write is moved AHEAD of the eligibility check, which is the ordering §19 forbids: a refused
  // cancel would then have already released the exposure.
  var g11 = mutate(F11, CANCEL_ANCHOR,
    "      if (curStatus === 'approved') { setCell('status', 'cancelled'); }" + NL + CANCEL_ANCHOR);
  var w = world({ g11: g11, ships: [['SHP-9', 'SP-1', 'draft', 'FW-CN']] });
  var r = w.cancel();
  return r.success === false && w.plan().status === 'cancelled';   // refused, yet released — caught
});
mut('M7 the status readback is dropped', function () {
  var g11 = mutate(F11, "      if (spBack !== 'cancelled') {", '      if (false) {');
  var w = world({ g11: g11 });
  var sh = w.sheets.shipping_plans;
  var real = sh.getRange.bind(sh), sc = PLAN_H.indexOf('status') + 1;
  sh.getRange = function (row, col) {
    var r = real(row, col);
    if (col === sc) return { getValue: r.getValue, getValues: r.getValues, setValue: function () {} };
    return r;
  };
  return w.cancel().success === true && w.plan().status === 'approved';   // claims a cancel that did not land
});
mut('M8 the mixed-deployment seam check is removed', function () {
  var g11 = mutate(F11, "  if (typeof shipmentStateForPlan_ !== 'function') {", '  if (false) {');
  // 12_'s probe is not loaded at all, so the eligibility check would throw or silently pass.
  var g12 = F12.replace('function shipmentStateForPlan_(ss, planId) {',
    'function shipmentStateForPlan_NOT_DEPLOYED_(ss, planId) {');
  var threw = false, succeeded = false;
  try {
    var w = world({ g11: g11, g12: g12 });
    succeeded = w.cancel().success === true;
  } catch (e) { threw = true; }
  return threw || !succeeded;
});
mut('M9 ABSENT and UNKNOWN are collapsed back into one answer', function () {
  var g12 = mutate(F12, "return { state: SHIPMENT_FOR_PLAN_UNKNOWN_, shipment_id: '', reason: 'SHIPMENTS_SHEET_ABSENT' };",
    "return { state: SHIPMENT_FOR_PLAN_ABSENT_, shipment_id: '', reason: 'SHIPMENTS_SHEET_ABSENT' };");
  var w = world({ g12: g12, omitShipments: true });
  return w.cancel().success === true;
});
mut('M10 a throw inside the shipments read is swallowed as ABSENT', function () {
  // The state on the EXISTING return is changed. Appending a second return after it leaves the first one
  // running, which is a mutant that was never applied.
  var g12 = mutate(F12, "    return { state: SHIPMENT_FOR_PLAN_UNKNOWN_, shipment_id: ''," + NL
    + "      reason: 'SHIPMENTS_READ_FAILED:'",
    "    return { state: SHIPMENT_FOR_PLAN_ABSENT_, shipment_id: ''," + NL
    + "      reason: 'SHIPMENTS_READ_FAILED:'");
  var w = world({ g12: g12, ships: [['SHP-9', 'SP-1', 'draft', 'FW-CN']] });
  w.sheets.shipments.getDataRange = function () { throw new Error('READ_EXPLODED'); };
  return w.cancel().success === true;
});
mut('M11 cancel rewrites the plan lines to make the transition easy', function () {
  var w = world({});
  w.cancel();
  var clean = w.sheets.shipping_plan_lines.__writes.length;
  w.sheets.shipping_plan_lines.getRange(2, 4).setValue(0);
  return clean === 0 && w.sheets.shipping_plan_lines.__writes.length === 1;
});
mut('M12 the cancelled plan keeps holding exposure in KMFSG', function () {
  // The one mutant that is not a source edit: it plants the WRONG STATUS SET, which is the assumption the
  // whole round rests on. If KMFSG ever counted `cancelled`, every assertion above would still pass and the
  // ghost would be back.
  var lines = [{ shipping_plan_id: 'SP-1', sku: 'SKU1', requested_qty: 30 }];
  var e = KMFSG.planExposure([{ shipping_plan_id: 'SP-1', status: 'cancelled', source_warehouse_id: 'FW-CN',
    transferred_shipment_id: '', transferred_to_shipment_at: '' }], lines, {});
  return e.counted_lines === 0 && e.byPool['WH:FW-CN||SKU1'] === undefined;
});

// =========================================================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived');
process.exit(fail === 0 ? 0 : 1);
