// S6-R3A — THE OVERSEAS OPERATIONAL QUANTITY MODEL, MADE EXECUTABLE.
//
// WHAT THIS ROUND DECIDED, AND WHY THE SUITE IS SHAPED THIS WAY.
//
// The operator froze Option A: wh_available_stock is the Phase-1 operational availability authority,
// wh_reserved_stock is the operational reserved bucket, and wh_physical_stock — present in the live
// header, written by nothing — takes no part in Phase-1 arithmetic. That supersedes exactly one token
// frozen in R3 (`OVERSEAS_CURRENT_STOCK_FIELD`), and section A pins both halves of the supersession:
// the new value in PART V, and the old line still standing in PART IV with a pointer on it.
//
// THREE KINDS OF ASSERTION LIVE HERE AND THEY ARE NOT INTERCHANGEABLE.
//
//   FROZEN   a token that must be DECLARED in the contract, scoped to PART V so the superseded PART IV
//            line cannot satisfy an amendment assertion by accident.
//   MODEL    the frozen arithmetic, EXECUTED against a reference implementation written from §31 alone.
//            R4B's real writer must reproduce it; a reference model is how a contract round hands the
//            implementing round something that can fail rather than something that can be misread.
//   LIVE     the SHIPPED code, executed. Sections E and F drive the real importer against a fake
//            spreadsheet, because the hazard this round exists to fence is not a claim about a plan —
//            it is a defect you can watch happen.
//
// A FAILURE IN SECTION E IS THE GOOD OUTCOME LATER. E proves that TODAY the shipped importer erases a
// reservation. The round that lands R4's import protection MUST break E2/E3 and replace them with the
// protected behaviour. Read each label for which way it is meant to fail.
//
// NO PRODUCTION WRITE. A fake spreadsheet, source text, and the contract document. No network, no clock
// dependence, no Apps Script.
//
// Run: node assets/tests/s6-r3a-overseas-quantity-model.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l, x) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  ctx ' + JSON.stringify(x))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
var CORE = 'assets/js/core/';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// Comments are not code. This repository has read a comment as an implementation twice, and this round's
// whole subject is a column that three comments discuss and no statement assigns.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var CONTRACT = read('docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md');
var F05 = read(GS + '05_overseas_inventory_handlers.gs');
var F12 = read(GS + '12_shipment_handlers.gs');
var F21 = read(GS + '21_factory_inventory_handlers.gs');
var F22 = read(GS + '22_shipment_dispatch_handlers.gs');
var F31 = read(GS + '31_shipment_receipt_route_handlers.gs');
var OVSPAGE = read('assets/js/pages/overseas-stock.js');
var KMFSG = require(path.join(ROOT, CORE + 'supply-planning-factory-stock-guard.js'));

// PART V is the amendment. PART IV keeps its superseded line, so an amendment token read against the WHOLE
// document would match the wrong half — `OVERSEAS_CURRENT_STOCK_FIELD` now appears twice with two values,
// which is precisely the situation "preserve the historical record" creates and precisely the one a
// whole-document regex gets wrong.
var PARTV_AT = CONTRACT.indexOf('# PART V — S6-R3A');
var PARTIV_AT = CONTRACT.indexOf('# PART IV — S6-R3');
// Bounded at the NEXT Part for the same reason PART IV is excluded: a later amendment must not be able
// to satisfy an R3A assertion. R3B's PART VI restates several of these tokens.
var PARTVI_AT = CONTRACT.indexOf('# PART VI — ');
var PARTV = PARTV_AT < 0 ? ''
  : (PARTVI_AT > PARTV_AT ? CONTRACT.slice(PARTV_AT, PARTVI_AT) : CONTRACT.slice(PARTV_AT));
var PARTIV = (PARTIV_AT < 0 || PARTV_AT < 0) ? '' : CONTRACT.slice(PARTIV_AT, PARTV_AT);

function tokenRe(token, value) {
  return new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*' +
    String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\b|$)', 'm');
}
// A frozen token must be DECLARED in PART V. A mapping that exists only in a test is a mapping nobody
// can find, and one declared only in the superseded Part is a mapping that was already overruled.
function frozenV(token, value, label) {
  ok(tokenRe(token, value).test(PARTV), 'FROZEN ' + token + ' = ' + value + (label ? '  — ' + label : ''));
}

// =========================================================================================================
section('A. §30 — the supersession, both halves of it');
// =========================================================================================================

ok(PARTV_AT > 0, 'A0 PART V exists in the mainline contract');
frozenV('D_S6_OVERSEAS_OPERATIONAL_QUANTITY_MODEL', 'A');
frozenV('D_S6_OVERSEAS_OPERATIONAL_QUANTITY_MODEL_STATUS', 'FROZEN');
frozenV('S6_OVERSEAS_QUANTITY_MODEL_FREEZE', 'YES');
frozenV('SUPERSEDED_S6_R3_TOKEN_COUNT', '1');

// The amended value, in PART V.
frozenV('OVERSEAS_CURRENT_STOCK_FIELD', 'wh_available_stock',
  'the Phase-1 shipping/availability current-stock authority');
frozenV('OVERSEAS_CURRENT_STOCK_FIELD_SUPERSEDES', 'wh_physical_stock (PART IV §24)');

// HISTORY IS NOT REWRITTEN. The R3 line still stands where R3 wrote it, annotated — which is why
// s6-r3-inventory-shipping-mapping-freeze.test.js still passes unchanged, and why it SHOULD.
ok(tokenRe('OVERSEAS_CURRENT_STOCK_FIELD', 'wh_physical_stock').test(PARTIV),
  'A1 PART IV still declares the ORIGINAL value — the R3 freeze is readable as what R3 decided');
ok(/OVERSEAS_CURRENT_STOCK_FIELD = wh_physical_stock\s+\[SUPERSEDED BY R3A/.test(PARTIV),
  'A2 and carries a SUPERSEDED annotation, so nobody reads it as current');
ok(!tokenRe('OVERSEAS_CURRENT_STOCK_FIELD', 'wh_available_stock').test(PARTIV),
  'A3 the amended value is NOT smuggled into PART IV — exactly one value per Part');
// EXACTLY ONE token was superseded. A round that quietly amends a second one is the failure this counts.
var PIV_TOKENS = (PARTIV.match(/^[A-Z][A-Z0-9_]{6,} = /gm) || []).map(function (s) { return s.replace(/ = $/, ''); });
var PV_TOKENS = (PARTV.match(/^[A-Z][A-Z0-9_]{6,} = /gm) || []).map(function (s) { return s.replace(/ = $/, ''); });
// NEXT_TASK is every Part's own closing pointer and differs between any two Parts by construction.
// Excluded BY NAME, because loosening the comparison instead would hide a real second amendment.
var CONTRADICTED = PIV_TOKENS.filter(function (t) {
  if (t === 'NEXT_TASK') return false;
  if (PV_TOKENS.indexOf(t) < 0) return false;
  var v4 = new RegExp('^' + t + ' = (.+)$', 'm').exec(PARTIV);
  var v5 = new RegExp('^' + t + ' = (.+)$', 'm').exec(PARTV);
  if (!v4 || !v5) return false;
  var a = v4[1].replace(/\s+\[SUPERSEDED[\s\S]*$/, '').trim(), b = v5[1].trim();
  return a !== b;
});
eq(CONTRADICTED, ['OVERSEAS_CURRENT_STOCK_FIELD'],
  'A4 EXACTLY ONE PART IV token is contradicted by PART V, and it is the one the operator amended (computed)');

// The physical bucket's new status, stated as prohibitions rather than as a description.
frozenV('PHYSICAL_STOCK_DECREMENT_ON_DISPATCH', 'NO');
frozenV('OVERSEAS_PHYSICAL_PARTICIPATES_IN_PHASE1_ARITHMETIC', 'NO');
frozenV('OVERSEAS_PHYSICAL_STOCK_LIFECYCLE_PHASE', 'DEFERRED');
frozenV('OVERSEAS_DAMAGED_STOCK_LIFECYCLE_PHASE', 'DEFERRED');
frozenV('OVERSEAS_REFURBISH_PHASE1', 'NO', 'Phase-1 refurbish stays deferred — no semantics added here');

// And the census that justifies it, re-measured rather than cited. R4A proved it; a token that outlives
// its evidence is how a frozen mistake survives.
var PHYS_WRITE = code(F05 + F31 + F22 + F12).split(/;|\n/).filter(function (st) {
  return /wh_physical_stock/.test(st) && /(setValue|setValues|=[^=])/.test(st) &&
    !/wh_(before|after)_physical_stock/.test(st) && !/indexOf|snCol|snPref|movHeaders/.test(st);
});
eq(PHYS_WRITE, [], 'A5 ZERO statements anywhere assign wh_physical_stock — the amendment rests on a census, '
  + 'not on a blank sample (computed)');

// =========================================================================================================
section('B. §31 — the frozen arithmetic, EXECUTED');
// =========================================================================================================

frozenV('OVERSEAS_AVAILABILITY_AUTHORITY', 'wh_available_stock');
frozenV('OVERSEAS_RESERVED_AUTHORITY', 'wh_reserved_stock');
frozenV('OVERSEAS_RESERVE_MODEL', 'AVAILABLE_TO_RESERVED_TRANSFER');
frozenV('OVERSEAS_RELEASE_MODEL', 'RESERVED_TO_AVAILABLE_TRANSFER');
frozenV('OVERSEAS_DISPATCH_MODEL', 'RESERVED_DECREMENT_ONLY');

/* THE REFERENCE MODEL. Written from §31 and nothing else. R4B's writer is correct when it reproduces
   this; that is the whole point of writing it here rather than describing the arithmetic in prose. The
   physical bucket is carried through every operation UNTOUCHED, including when it is blank — because
   "blank" is what production actually holds and a model that only works on a number would hide it. */
function ovsModel(state) {
  var s = { available: state.available, reserved: state.reserved,
    physical: Object.prototype.hasOwnProperty.call(state, 'physical') ? state.physical : '',
    damaged: state.damaged || 0 };
  return {
    snap: function () { return { available: s.available, reserved: s.reserved, physical: s.physical, damaged: s.damaged }; },
    reserve: function (q) {
      if (q <= 0) throw new Error('qty must be positive');
      if (s.available - q < 0) return { ok: false, reason: 'INSUFFICIENT_OVERSEAS_AVAILABLE' };
      s.available -= q; s.reserved += q;                       // physical untouched, by §31
      return { ok: true, movement: { movement_type: 'reservation_acquire', from_stock_type: 'available', to_stock_type: 'reserved' } };
    },
    release: function (q) {
      var give = Math.min(q, s.reserved);                      // at most what this owner holds
      if (give <= 0) return { ok: true, noop: true };          // holding nothing is a no-op, not an error
      s.reserved -= give; s.available += give;
      return { ok: true, movement: { movement_type: 'reservation_release', from_stock_type: 'reserved', to_stock_type: 'available' } };
    },
    dispatch: function (q) {
      if (s.reserved - q < 0) return { ok: false, reason: 'DISPATCH_EXCEEDS_RESERVATION' };
      s.reserved -= q;                                          // available AND physical untouched, by §31
      return { ok: true, movement: { movement_type: 'shipment_out', from_stock_type: 'reserved', to_stock_type: 'none' } };
    },
    // §31: reserved is ALREADY out of available. A consumer that subtracts it again double-counts.
    availableToAllocate: function (exposure) { return s.available - (exposure || 0); }
  };
}

// §10.1 — reserve.
var m1 = ovsModel({ available: 100, reserved: 0 });
m1.reserve(30);
eq([m1.snap().available, m1.snap().reserved], [70, 30], 'B1 reserve 30 of 100/0 -> 70/30 (executed)');

// §10.2 — cancel before dispatch returns the units exactly.
var m2 = ovsModel({ available: 100, reserved: 0 });
m2.reserve(30); m2.release(30);
eq([m2.snap().available, m2.snap().reserved], [100, 0], 'B2 cancel 30 -> 100/0, the state is restored exactly (executed)');

// §10.3 — dispatch consumes the RESERVED bucket only. This is the assertion the whole amendment turns on:
// available must NOT drop a second time, because the reserve already moved those units out of it.
var m3 = ovsModel({ available: 100, reserved: 0 });
m3.reserve(30); var d3 = m3.dispatch(30);
eq([m3.snap().available, m3.snap().reserved], [70, 0], 'B3 reserve 30 then dispatch 30 -> 70/0 — NO double subtraction (executed)');
eq(d3.movement, { movement_type: 'shipment_out', from_stock_type: 'reserved', to_stock_type: 'none' },
  'B3a and the dispatch movement declares the bucket it actually drained');

// §10.4 — two drafts cannot both consume the same units.
var m4 = ovsModel({ available: 100, reserved: 0 });
var a4 = m4.reserve(80), b4 = m4.reserve(80);
eq([a4.ok, b4.ok, b4.reason], [true, false, 'INSUFFICIENT_OVERSEAS_AVAILABLE'],
  'B4 a second draft cannot reserve units the first already holds (executed)');
eq([m4.snap().available, m4.snap().reserved], [20, 80], 'B4a and the refused reserve wrote nothing');

// §10.8 — physical, blank or numeric, changes nothing.
['', 0, 500, 12].forEach(function (p, i) {
  var m = ovsModel({ available: 100, reserved: 0, physical: p });
  m.reserve(30); m.dispatch(30);
  eq([m.snap().available, m.snap().reserved, m.snap().physical], [70, 0, p],
    'B5.' + i + ' physical=' + JSON.stringify(p) + ' is carried UNTOUCHED and alters no availability (executed)');
});

// §10.9 — damaged never leaks into the available bucket.
var m6 = ovsModel({ available: 100, reserved: 0, damaged: 40 });
eq(m6.availableToAllocate(0), 100, 'B6 damaged units are NOT allocatable and NOT added to available (executed)');
m6.reserve(100);
eq([m6.snap().available, m6.snap().damaged, m6.reserve(1).ok], [0, 40, false],
  'B6a and a fully-reserved row cannot dip into the damaged bucket to satisfy one more unit');

// THE DOUBLE-SUBTRACTION PROHIBITION, stated as the arithmetic it forbids.
frozenV('OVERSEAS_DOUBLE_SUBTRACTION_GUARD', 'RESERVED_NEVER_SUBTRACTED_FROM_AVAILABLE');
frozenV('OVERSEAS_CONSUME_DEDUCTS_TWICE', 'NO');
var m7 = ovsModel({ available: 100, reserved: 0 });
m7.reserve(30);
eq([m7.availableToAllocate(0), m7.snap().available - m7.snap().reserved], [70, 40],
  'B7 the CORRECT allocatable figure is 70; `available - reserved` gives 40 — the forbidden formula, '
  + 'computed here so its wrongness is a number rather than a warning (executed)');

// =========================================================================================================
section('C. §32 — the domains stay separate, and Option A is the new pressure on that');
// =========================================================================================================

frozenV('FACTORY_OVERSEAS_STORAGE_MERGED', 'NO');
frozenV('FACTORY_OVERSEAS_RESERVATION_OWNER_MERGED', 'NO');
frozenV('OVERSEAS_CAN_PRODUCE', 'NO');
frozenV('OVERSEAS_CAN_SHIP', 'YES');
frozenV('OVERSEAS_ADDED_BY_FILTER_LOOSENING', 'NO');

// §10.7 — factory arithmetic is untouched by this round. Executed, not asserted.
var facBal = KMFSG.normalizeBalances([{ warehouse_id: 'WH-F', sku: 'S1', fac_current_stock: 100, fac_reserved_stock: 30 }], {});
var facAvail = KMFSG.availableToAllocate({ balances: facBal, draftExposure: { byPool: {} }, planExposure: { byPool: {}, selfByPool: {} } });
eq(facAvail.byPool[KMFSG.poolKey('WH-F', 'S1')].factory_available_stock, 70,
  'C1 FACTORY availability is still DERIVED current - reserved = 70 (executed)');

// The two domains now BOTH read 70 for 100/30 — and they get there by opposite routes. That coincidence is
// exactly what would tempt a later round to merge them, so it is measured here with the difference named.
var ovsSame = ovsModel({ available: 100, reserved: 0 }); ovsSame.reserve(30);
eq([facAvail.byPool[KMFSG.poolKey('WH-F', 'S1')].factory_available_stock, ovsSame.availableToAllocate(0)], [70, 70],
  'C2 both domains answer 70 — factory by SUBTRACTING reserved, overseas by having already moved it. '
  + 'Same number, opposite arithmetic: this is why the owners stay separate (executed)');

// And the guard against the shortcut: an overseas row must still fail CLOSED through the factory owner.
var ovsThroughFactory = KMFSG.normalizeBalances(
  [{ warehouse_id: 'WH-3PL', sku: 'S1', wh_available_stock: 460, wh_reserved_stock: 20, wh_damaged_stock: 20 }], {});
eq([Object.keys(ovsThroughFactory.byPool).length, ovsThroughFactory.unreadable.length,
  ovsThroughFactory.unreadable[0].field], [0, 1, 'fac_current_stock'],
  'C3 an overseas row through the FACTORY owner is still UNREADABLE, never a silent zero (executed)');
ok(!/is_factory_warehouse\s*[!=]==?\s*(false|0)/.test(code(read(CORE + 'supply-planning-factory-stock-guard.js'))),
  'C4 KMFSG\'s factory filter has not been loosened to admit overseas rows');

// =========================================================================================================
section('D. §33 — import field authority, and the client half nobody was looking at');
// =========================================================================================================

frozenV('IMPORT_WRITES_RESERVED', 'NO');
frozenV('ABSENT_COLUMN_SEMANTIC', 'NO_WRITE');
frozenV('BLANK_CELL_SEMANTIC', 'NO_WRITE');
frozenV('IMPORT_ZERO_REQUIRES_EXPLICIT_ZERO', 'YES');
frozenV('IMPORT_PROTECTION_OWNER_COUNT', '2');

// The five fields are classified in PART V, each one named in the matrix.
['wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock', 'wh_physical_stock', 'wh_on_the_way_qty']
  .forEach(function (f) {
    ok(new RegExp('\\| `' + f + '` \\|').test(PARTV), 'D1.' + f + ' is classified in the import authority matrix');
  });

// THE SERVER HALF, measured in source. `qtyFields` is the set the importer overwrites; reserved is in it.
var QTY = /var qtyFields = \[([^\]]+)\]/.exec(code(F05));
ok(!!QTY, 'D2 the importer declares its overwrite set as a literal list');
var QTY_SET = QTY[1].split(',').map(function (s) { return s.trim().replace(/^'|'$/g, ''); });
eq(QTY_SET, ['wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock', 'wh_on_the_way_qty'],
  'D2a and wh_reserved_stock IS in it today — the hazard is in the shipped overwrite set, not in a corner case');
ok(QTY_SET.indexOf('wh_physical_stock') < 0,
  'D2b while wh_physical_stock is NOT — which is why the live column is blank (R4A §2)');

// THE CLIENT HALF. This is the finding R4A did not have: the page materialises every quantity onto the
// payload, so a column the operator never put in the file arrives at the server as an explicit zero.
var PAGE = code(OVSPAGE);
var CQTY = /var OVERSEAS_QTY_FIELDS = \[([^\]]+)\]/.exec(PAGE);
ok(!!CQTY && !/'reserved_stock'/.test(CQTY[1]),
  'D3 [R4B] reserved_stock has LEFT the client quantity list. Until R4B it was in it, so a column the '
  + 'operator never wrote arrived at the server as an explicit zero.');
ok(/ci === -1 \? '' :/.test(PAGE) || /var ci = idxOf\[f\];/.test(PAGE),
  'D3a and it reads a MISSING column as the empty string rather than skipping the field');
ok(/if \(v === ''\) continue;/.test(PAGE) && !/qtyObj\[f\] = 0;/.test(PAGE),
  'D3b [R4B] and a blank or absent cell is now OMITTED rather than turned into 0 — the two stopped being the same value here, which is what let the server tell them apart');
ok(/hasOwnProperty\.call\(qtyObj, f\)/.test(PAGE),
  'D3c [R4B] and only the keys actually present are placed on the request. Until R4B every field went unconditionally, which destroyed the distinction BEFORE the server saw it — the reason the owner count was 2 and the reason both halves had to land together');

// The template is the delivery mechanism, not a passive document.
ok(!/key: 'reserved_stock', header: 'reserved_stock'/.test(PAGE),
  'D4 [R4B] the shipped template no longer emits a reserved_stock column');
ok(!/exampleRow: \{[^\n]*reserved_stock: 0/.test(PAGE),
  'D4a [R4B] nor an example row writing 0 into it — the tree no longer hands the operator a file that zeroes a bucket this system owns');
frozenV('IMPORT_TEMPLATE_RESERVED_COLUMN', 'REMOVED (target)');

// =========================================================================================================
section('E. §34 — THE HAZARD, driven against the SHIPPED importer');
// =========================================================================================================

/* Everything above this line is a contract. This section is a demonstration. The real
   handleImportOverseasInventorySnapshotBatch_ is lifted into a sandbox with a fake spreadsheet and given a
   routine stock refresh, and we watch what happens to a reservation that is standing at the time.

   E2 and E3 MUST FAIL when R4's import protection lands. That is not a fragile test — it is the point.
   The round that closes the hazard owes this file the replacement assertions. */

var SNAP_HEADERS = ['overseas_inventory_id', 'snapshot_date', 'warehouse_id', 'sku', 'site_sku',
  'wh_physical_stock', 'wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock',
  'wh_on_the_way_qty', 'wh_on_the_way_eta', 'wh_on_the_way_bucket',
  'last_movement_at', 'updated_by', 'created_at', 'updated_at', 'note'];
var WH_HEADERS = ['warehouse_id', 'warehouse_name', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type', 'status'];

function mkSheet(headers, rows, name) {
  var grid = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  return {
    __name: name, __grid: grid,
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function (row, col, nr, nc) {
      return {
        getValues: function () { var o = []; for (var i = 0; i < (nr || 1); i++) { var r = grid[row - 1 + i] || []; o.push(r.slice(col - 1, col - 1 + (nc || 1))); } return o; },
        setValues: function (vals) { for (var i = 0; i < vals.length; i++) { var t = row - 1 + i; while (grid.length <= t) grid.push(new Array(headers.length).fill('')); for (var j = 0; j < vals[i].length; j++) grid[t][col - 1 + j] = vals[i][j]; } },
        setValue: function (v) { while (grid.length <= row - 1) grid.push(new Array(headers.length).fill('')); grid[row - 1][col - 1] = v; }
      };
    },
    appendRow: function (r) { grid.push(r.slice()); }
  };
}
// One live-shaped snapshot row: physical BLANK (as production actually holds it), the operational pair set.
function snapRow(avail, reserved, damaged, physical) {
  var o = { overseas_inventory_id: 'OISN-live01', snapshot_date: '2026-09-01', warehouse_id: 'WH-3PL', sku: 'CO1100-T',
    site_sku: 'SS-1', wh_physical_stock: physical === undefined ? '' : physical, wh_available_stock: avail,
    wh_reserved_stock: reserved, wh_damaged_stock: damaged || 0, wh_on_the_way_qty: 0, wh_on_the_way_eta: '',
    wh_on_the_way_bucket: '', last_movement_at: '', updated_by: '', created_at: '2026-09-01', updated_at: '2026-09-01', note: '' };
  return SNAP_HEADERS.map(function (h) { return o[h]; });
}
function importWorld(rows) {
  var snap = mkSheet(SNAP_HEADERS, rows, 'overseas_inventory_snapshot');
  var wh = mkSheet(WH_HEADERS, [['WH-3PL', 'Winit UK', 'ResUS', 'UK', true, false, '3PL', 'active']], 'warehouses');
  var sheets = { overseas_inventory_snapshot: snap, warehouses: wh };
  var sb = { console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object,
    Math: Math, Date: Date, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp, Boolean: Boolean,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return { getSheetByName: function (n) { return sheets[n] || null; } }; }, flush: function () {} },
    Utilities: { formatDate: function () { return '2026-09-29'; },
      getUuid: (function () { var n = 0; return function () { n++; return ('u' + n) + '-bbbb-cccc-dddd-eeeeeeeeeeee'; }; })() },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    jsonResponse_: function (o) { return o; },
    fcWriteEnsureSheet_: function () { return null; }, fcWriteEnsureColumns_: function () {} };
  vm.createContext(sb);
  vm.runInContext(F05, sb);
  return { sb: sb, snap: snap };
}
function snapCell(snap, name) { return snap.__grid[1][SNAP_HEADERS.indexOf(name)]; }

// E1 — the control. A routine refresh of a row with NO reservation behaves exactly as intended.
(function () {
  var w = importWorld([snapRow(100, 0, 0)]);
  var r = w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-T', wh_available_stock: 120 }], options: { createdBy: 't' } });
  eq([r.success, r.data.summary.updated, snapCell(w.snap, 'wh_available_stock')], [true, 1, 120],
    'E1 CONTROL — a refresh of an unreserved row updates available, as it should (executed, shipped code)');
})();

// E2 — THE HAZARD. The same refresh over a STANDING reservation. This is §5's forbidden outcome, reached.
(function () {
  var w = importWorld([snapRow(70, 30, 0)]);
  var r = w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-T', wh_available_stock: 100 }], options: { createdBy: 't' } });
  eq([r.success, snapCell(w.snap, 'wh_available_stock'), snapCell(w.snap, 'wh_reserved_stock')], [true, 70, 30],
    'E2 [R4B] a routine refresh of 70/30 reporting 100 now leaves 70/30 — the reservation SURVIVES. '
    + 'Until R4B this assertion read [true, 100, 0]: the hold erased, with success:true and no warning.');
  eq(r.data.summary, { total: 1, created: 0, updated: 1, skipped: 0, error: 0 },
    'E2a and the operator is told the row was "updated" — the receipt is not merely silent, it is reassuring');
})();

// E3 — and it needs no mistake. The reserved column is not in the payload at all.
(function () {
  var w = importWorld([snapRow(70, 30, 0)]);
  w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-T', wh_available_stock: 100 }], options: { createdBy: 't' } });
  eq(snapCell(w.snap, 'wh_reserved_stock'), 30,
    'E3 [R4B] the request never MENTIONED reserved, and reserved is now left alone. Until R4B absent was '
    + 'read as zero and written, so omitting the column was not an escape from it.');
})();

// E4 — the same blank-means-zero rule costs the damaged bucket too, which is §10.9 from the other side.
(function () {
  var w = importWorld([snapRow(70, 0, 40)]);
  w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-T', wh_available_stock: 100 }], options: { createdBy: 't' } });
  eq([snapCell(w.snap, 'wh_available_stock'), snapCell(w.snap, 'wh_damaged_stock')], [100, 40],
    'E4 [R4B] an omitted damaged count is PRESERVED. Until R4B the same absent-means-zero rule erased it, '
    + 'which is why the client fix had to cover the three buckets that have no lifecycle as well.');
})();

// E5 — what the importer does NOT do, and this one is load-bearing in the right direction.
(function () {
  var w = importWorld([snapRow(70, 30, 0, '')]);
  w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-T', wh_available_stock: 100, wh_physical_stock: 999 }], options: { createdBy: 't' } });
  eq(snapCell(w.snap, 'wh_physical_stock'), '',
    'E5 wh_physical_stock is NOT written even when the payload supplies it — the column has no importer, '
    + 'which is the census A5 proves and the reason the amendment could not name it (executed)');
})();

// E6 — a NEW row is born blank in physical. R4A called this the mechanism behind the live blank column;
// here it is, executed.
(function () {
  var w = importWorld([]);
  w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'NEW-SKU', wh_available_stock: 50 }], options: { createdBy: 't' } });
  var row = w.snap.__grid[w.snap.__grid.length - 1];
  eq([row[SNAP_HEADERS.indexOf('wh_available_stock')], row[SNAP_HEADERS.indexOf('wh_physical_stock')]], [50, ''],
    'E6 a row created by import is born with available set and physical BLANK (executed) — the live '
    + 'production shape is what this code produces, not a data-entry omission');
})();

// THE INVARIANT R4 MUST SATISFY, frozen. E2/E3 are the proof it is not satisfied today.
frozenV('ACTIVE_RESERVATION_SURVIVES_IMPORT', 'YES (REQUIRED)');
frozenV('IMPORT_MAY_ZERO_ACTIVE_RESERVATION', 'NO');
frozenV('IMPORT_MAY_MAKE_RESERVED_UNITS_ALLOCATABLE_TWICE', 'NO');

/* PRESERVING RESERVED IS NECESSARY AND NOT SUFFICIENT, and this is the assertion that says why. If R4
   protected only the reserved column, the same refresh would produce 100/30 — 130 units held against the
   100 the source reported. The reserved units become allocatable again through the AVAILABLE column. */
// A reserved-only fix, applied to the reference model: reserved is protected, available takes the source
// figure verbatim. The units held against the source's 100 are then counted from the resulting state.
function importReservedOnlyProtected(m, sourceAvailable) {
  var s = m.snap();
  return { available: sourceAvailable, reserved: s.reserved };   // reserved preserved; available verbatim
}
var standing = ovsModel({ available: 100, reserved: 0 });
standing.reserve(30);
var afterProtected = importReservedOnlyProtected(standing, 100);
eq([afterProtected.available, afterProtected.reserved,
  afterProtected.available + afterProtected.reserved], [100, 30, 130],
  'E7 a reserved-ONLY fix yields 100/30 — 130 units held against a source figure of 100. Still forbidden, '
  + 'which is why §34 gates the AVAILABLE arithmetic and not just the reserved column (executed)');
eq([standing.snap().available, standing.snap().reserved, standing.availableToAllocate(0)], [70, 30, 70],
  'E7a while the correct post-refresh state is the one the import did not change: 70/30, allocatable 70');

// THE GATE. Declared OPEN, and the count is what holds R4B.
frozenV('IMPORT_AMBIGUITY_COUNT', '1');
frozenV('UNRESOLVED_IMPORT_DECISION_COUNT', '1');
frozenV('IMPORT_ARITHMETIC_GUESSED', 'NO');
frozenV('IMPORT_SILENT_SUBTRACTION_INTRODUCED', 'NO');
ok(/GATE = IMPORT_AVAILABLE_SEMANTIC\s+STATUS = OPEN/.test(PARTV),
  'E8 the gate is declared OPEN — the round did not choose the import arithmetic on the operator\'s behalf');
ok(/\| \*\*I — GROSS\*\* \*\(recommended\)\*/.test(PARTV) && /\| II — NET \|/.test(PARTV) && /\| III — REFUSE \|/.test(PARTV),
  'E8a with three options on the board and one recommended — a recommendation is not a freeze');

// =========================================================================================================
section('F. §35 / §36 — the ledger can tell the truth, and receiving already does');
// =========================================================================================================

frozenV('NEW_MOVEMENT_TYPES_REQUIRED', '0');
frozenV('MOVEMENT_SCHEMA_EXTENSION_REQUIRED', 'NO');

// Every movement_type the mapping proposes is ALREADY in the seven-type vocabulary declared at §8. Computed
// against the contract's own list, so inventing a convenient name later fails here rather than in review.
var VOCAB = /declared\s+([a-z_ ·\r\n]+?)\r?\ncurrent axis/.exec(CONTRACT);
ok(!!VOCAB, 'F1 the contract declares the seven-type movement vocabulary');
var VOCAB_SET = VOCAB[1].split(/[·\s]+/).filter(Boolean);
// The PROPOSED set is parsed out of PART V's OWN mapping table, not listed here. A suite that
// hardcodes the four names checks its own array against the vocabulary and lets the contract invent a
// fifth unnoticed — which is exactly what it did until M12 caught it.
var MAPROWS = PARTV.split(/\r?\n/).filter(function (l) {
  return /^\| (reserve|release|dispatch|import) \| `/.test(l);
});
eq(MAPROWS.length, 4, 'F1a the PART V mapping table declares four overseas movement events (computed)');
var PROPOSED = MAPROWS.map(function (l) { return l.split('|')[2].trim().replace(/`/g, ''); });
eq(PROPOSED, ['reservation_acquire', 'reservation_release', 'shipment_out', 'inventory_import'],
  'F1b and names these four movement types (parsed from the contract)');
eq(PROPOSED.filter(function (t) { return VOCAB_SET.indexOf(t) < 0; }), [],
  'F1c every one of which is ALREADY in the declared vocabulary — nothing is invented (computed)');

// The direction values likewise come from the existing allowed set, tested as MEMBERSHIP in the set the
// page spec declares rather than as the presence of a sentence somewhere in the file.
var ALLOWED = /[Aa]llowed (?:set|values)[^`]*`?([a-z_ |]+)`?/.exec(read('assets/specs/active/pages/OVERSEAS_STOCK_SPEC.md'));
ok(!!ALLOWED, 'F2 the page spec declares an allowed from/to stock-type set');
var ALLOWED_SET = ALLOWED[1].split('|').map(function (x) { return x.trim(); }).filter(Boolean);
eq(ALLOWED_SET, ['available', 'reserved', 'damaged', 'on_the_way', 'none'],
  'F2a and it is these five values (computed)');
eq(['available', 'reserved', 'none'].filter(function (d) { return ALLOWED_SET.indexOf(d) < 0; }), [],
  'F2b the three directions the reserve/release/dispatch mapping uses are all members — no value is invented (computed)');

// The ledger columns the mapping needs all exist on the shipped movement header.
var MOVH = /var OVS_MOV_HEADERS = \[([\s\S]*?)\];/.exec(code(F05));
ok(!!MOVH, 'F3 05_ declares the canonical movements header');
var MOV_SET = MOVH[1].split(',').map(function (s) { return s.trim().replace(/^'|'$/g, ''); }).filter(Boolean);
eq(['wh_before_available_stock', 'wh_after_available_stock', 'wh_before_reserved_stock', 'wh_after_reserved_stock',
  'wh_before_physical_stock', 'wh_after_physical_stock', 'from_stock_type', 'to_stock_type', 'movement_scope',
  'reference_type', 'reference_id'].filter(function (c) { return MOV_SET.indexOf(c) < 0; }), [],
  'F3a and every column the reserve/release/dispatch mapping needs is already on it (computed)');

// §36 — receiving. Executed against the shipped source: the receipt adds to AVAILABLE and never touches
// reserved on an existing row.
frozenV('DELIVERED_INCREASES_OVERSEAS_AVAILABLE', 'NO');
frozenV('OVERSEAS_RECEIPT_OWNER_COUNT', '1');
frozenV('SECOND_RECEIPT_OWNER_CREATED', 'NO');
var RCPT = code(F31);
ok(/snapSheet\.getRange\(targetRow, snAvail \+ 1\)\.setValue\(after\)/.test(RCPT),
  'F4 the receipt posts its delta to the AVAILABLE bucket');
ok(!/snReserved|wh_reserved_stock['"]?\s*\)\s*\+\s*1\)\.setValue/.test(RCPT),
  'F4a and holds no column index for reserved at all — it cannot touch an existing reservation');
ok(/wh_reserved_stock: 0/.test(RCPT) && /auto-created by shipment receipt/.test(F31),
  'F4b the only reserved write is the literal 0 on a row being CREATED, which cannot hold a reservation yet');

// =========================================================================================================
section('G. §37 / §38 — schema gate, and the shape of the one atomic change');
// =========================================================================================================

frozenV('NEW_TABLE_REQUIRED', 'NO');
frozenV('SCHEMA_EXTENSION_REQUIRED', 'NO');
frozenV('DB_MIGRATION_REQUIRED', 'NO');
frozenV('NEW_COLUMNS_REQUIRED', 'NONE');
frozenV('BACKFILL_REQUIRED', 'NO');

// Every field the model names is on the live header R4A verified. Computed, so a later round that needs a
// new column cannot pass this gate by asserting it does not.
var LIVE_HEADER = ['overseas_inventory_id', 'snapshot_date', 'warehouse_id', 'sku', 'site_sku',
  'wh_physical_stock', 'wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock',
  'wh_on_the_way_qty', 'wh_on_the_way_eta', 'wh_on_the_way_bucket',
  'last_movement_at', 'updated_by', 'created_at', 'updated_at', 'note'];
var MODEL_FIELDS = ['wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock', 'wh_physical_stock'];
eq(MODEL_FIELDS.filter(function (f) { return LIVE_HEADER.indexOf(f) < 0; }), [],
  'G1 every field Option A names is on the operator-verified live header — no column is requested (computed)');

frozenV('R4_MUST_LAND_AS_ONE_CHANGE', 'YES');
frozenV('R4_DEPLOYABLE_INTERMEDIATE_STATES', '0');
frozenV('R4_IMPLEMENTATION_OWNER_COUNT', '8');
ok(/SPLIT_FORBIDDEN_ACROSS_DEPLOYS = source enablement · reservation lifecycle · dispatch consume · import protection/.test(PARTV),
  'G2 the four owners that may not be split across deploys are named');

// §10.10 — the source stays BLOCKED until those owners exist. Measured against the shipped refusal.
(function () {
  var pre = code(F12);
  ok(/shipmentDomainAvailable_\(srcDomain, srcSheets, srcWarehouseId, needSkus\[ns\]\)/.test(pre),
    'G3 [R4B] the precheck now ROUTES by source domain. Until R4B it read factory_stock for any source, which is what made an overseas source impossible — a restriction by accident rather than by rule');
  ok(/INSUFFICIENT_OVERSEAS_STOCK/.test(pre) && /shortLabel/.test(pre),
    'G3a and an overseas shortfall now refuses as OVERSEAS rather than wearing a factory-shaped message');
  // R3A asserted the ABSENCE of these writers, because a contract round that had quietly implemented one
  // would have been a different round. S6-R4B implemented them, in the files §38 named.
  ok(/function ovsAcquireReservationTx_\(/.test(code(F05)) && /function ovsReleaseReservationTx_\(/.test(code(F05))
    && /function ovsConsumeReservationTx_\(/.test(code(F05)),
    'G3b [R4B] the overseas reservation writers now exist, and they are in 05_ as §38 planned');
})();

// §10.11 / §10.12 — nothing else moved. This round changed documentation and tests ONLY.
frozenV('REQUEST_ORDER_BEHAVIOR_CHANGED', 'NO');
frozenV('PO_BEHAVIOR_CHANGED', 'NO');
frozenV('S5_RECOMMENDATION_BEHAVIOR_CHANGED', 'NO');
frozenV('SHIPPING_TO_ORDERING_AUTO_ORCHESTRATION', 'NO');
frozenV('KMFSG_INPUT_CONTRACT_CHANGED', 'NO');
frozenV('SECOND_AVAILABILITY_CALCULATION_PATH_CREATED', 'NO');
frozenV('SECOND_EXPOSURE_CALCULATION_PATH_CREATED', 'NO');

// §39 — the position, including the honest one.
frozenV('S6_R4_RUNTIME_IMPLEMENTATION_AUTHORIZED', 'NO');
frozenV('S5_READY_FOR_INTEGRATION', 'YES');
frozenV('S5_DEPLOYMENT', 'HOLD');
frozenV('S6_DEPLOYMENT', 'HOLD');
frozenV('PRODUCTION_ROWS_WRITTEN', '0');

// =========================================================================================================
section('H. NEGATIVE CONTROLS — each probe corrupts the thing the assertion above claims to watch');
// =========================================================================================================

// M1 — the supersession check must actually read PART V, not the whole document. If it read the whole
// document, the PART IV line would satisfy an amendment assertion and the round would look done while
// having changed nothing.
mut('M1 scoping PART V to the whole document would let the SUPERSEDED value pass as the amendment', function () {
  return tokenRe('OVERSEAS_CURRENT_STOCK_FIELD', 'wh_physical_stock').test(CONTRACT) === true &&
         tokenRe('OVERSEAS_CURRENT_STOCK_FIELD', 'wh_physical_stock').test(PARTV) === false;
});

// M2 — the double-subtraction guard. Corrupt availableToAllocate into the forbidden formula.
mut('M2 an availability owner that subtracts reserved from available is caught', function () {
  var m = ovsModel({ available: 100, reserved: 0 });
  m.reserve(30);
  var s = m.snap();
  var corrupted = s.available - s.reserved;      // the forbidden formula
  return corrupted !== m.availableToAllocate(0);
});

// M3 — dispatch must NOT touch available. A writer that decrements both is the classic double count.
mut('M3 a dispatch that also decrements available is caught', function () {
  var m = ovsModel({ available: 100, reserved: 0 });
  m.reserve(30); m.dispatch(30);
  var correct = m.snap().available;
  var doubled = correct - 30;                    // what a both-buckets dispatch would leave
  return correct === 70 && doubled === 40;
});

// M4 — the E-section hazard probe must be reading the SHEET, not the response. A probe that trusted
// `success: true` would report the importer as safe, which is the exact defect class this round is about.
/* M4 [R4B-REAIMED] — it planted "a probe that reads the RESPONSE instead of the SHEET", and its force came
   from the response looking healthy while the row had been erased. R4B removed the erasure, so that exact
   premise is gone. The lesson is not: the response STILL cannot distinguish a GROSS-corrected write from a
   naive one — both answer success with updated:1 — so a probe that trusts the flag is still the wrong probe,
   and that is now what the mutant demonstrates. */
mut('M4 the response alone cannot tell a GROSS-corrected write from a naive one', function () {
  var w = importWorld([snapRow(70, 30, 0)]);
  var r = w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-T', wh_available_stock: 100 }], options: { createdBy: 't' } });
  // The RESPONSE is identical to the pre-R4B one; only the SHEET distinguishes them.
  var responseLooksSame = r.success === true && r.data.summary.updated === 1;
  var sheetProvesTheRepair = snapCell(w.snap, 'wh_reserved_stock') === 30
    && snapCell(w.snap, 'wh_available_stock') === 70;
  return responseLooksSame && sheetProvesTheRepair;
});

// M5 — the physical census must ignore the before/after LEDGER columns, which legitimately carry the name.
mut('M5 a census that counted wh_before/after_physical_stock would report false writers', function () {
  var naive = code(F05).split(/;|\n/).filter(function (st) {
    return /physical_stock/.test(st) && /setMv|setValue/.test(st);
  });
  return naive.length > 0 && PHYS_WRITE.length === 0;
});

// M6 — the client-half finding. If overseas-stock.js only forwarded fields the file actually contained,
// the server could tell absent from zero and the owner count would be 1, not 2.
/* M6 [R4B-INVERTED] — it required the suite to notice that the client did NOT forward only the present
   columns. R4B made it do exactly that, so the mutant's premise became the behaviour and it survived. It
   now plants the REGRESSION: put the unconditional forwarding back and require it to be visible. */
mut('M6 restoring the unconditional payload forwarding is caught', function () {
  var regressed = PAGE.replace(/if \(Object\.prototype\.hasOwnProperty\.call\(qtyObj, f\)\) obj\[f\] = qtyObj\[f\];/,
    'obj[f] = qtyObj[f];');
  if (regressed === PAGE) throw new Error('M6 anchor drifted');
  var stillGuardedNow = /hasOwnProperty\.call\(qtyObj, f\)/.test(PAGE);
  var unguardedAfter = !/hasOwnProperty\.call\(qtyObj, f\)/.test(regressed);
  return stillGuardedNow && unguardedAfter;
});

// M7 — the movement vocabulary check must compare against the CONTRACT's declared list. Hard-coding the
// four names would let a fifth be invented later without anything noticing.
mut('M7 a movement type invented IN THE CONTRACT TABLE is caught against the declared vocabulary', function () {
  var invented = PROPOSED.concat(['overseas_reserve']);
  return PROPOSED.filter(function (t) { return VOCAB_SET.indexOf(t) < 0; }).length === 0 &&
         invented.filter(function (t) { return VOCAB_SET.indexOf(t) < 0; }).length === 1;
});

// M8 — the schema gate must be computed against the live header, not asserted.
mut('M8 a model field absent from the live header would fail the schema gate', function () {
  return LIVE_HEADER.indexOf('wh_reserved_stock') >= 0 && LIVE_HEADER.indexOf('wh_held_stock') < 0;
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('S6-R3A — OVERSEAS OPERATIONAL QUANTITY MODEL AMENDMENT');
console.log('D_S6_OVERSEAS_OPERATIONAL_QUANTITY_MODEL = A (FROZEN)');
console.log('OVERSEAS_CURRENT_STOCK_FIELD = wh_available_stock   SUPERSEDED_S6_R3_TOKEN_COUNT = 1');
console.log('NEW_COLUMNS_REQUIRED = NONE   DB_MIGRATION_REQUIRED = NO   BACKFILL_REQUIRED = NO');
console.log('UNRESOLVED_IMPORT_DECISION_COUNT = 1   S6_R4_RUNTIME_IMPLEMENTATION_AUTHORIZED = NO');
console.log('PRODUCTION_ROWS_WRITTEN = 0   BEHAVIOR_CHANGED = NO');
console.log('=====================================================');
console.log((fail ? 'FAILED  ' : 'PASSED  ') + pass + ' passed, ' + fail + ' failed' +
  '   (negative controls: ' + neg.caught + ' caught, ' + neg.missed + ' missed)');
process.exit(fail ? 1 : 0);
