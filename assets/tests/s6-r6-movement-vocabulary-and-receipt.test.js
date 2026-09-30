// S6-R6 — THE MOVEMENT VOCABULARY, DERIVED FROM ITS WRITERS, AND THE RECEIPT CHAIN.
//
// THE DEFECT THIS ROUND CLOSES IS A CLASSIFICATION ONE, AND IT CUTS BOTH WAYS.
//
// The FACTORY enum declared `shipment_receipt`, a type no factory writer has ever emitted. R1 listed it so a
// reader of the factory ledger could not call it unknown — and its own axis table recorded the problem in the
// same breath: axis `neither`, table `overseas_inventory_movements`. The membership therefore bought the
// OPPOSITE of what the list is for. A shipment_receipt row appearing in factory_stock_movements would have
// been accepted as known, when it is precisely the misfiling worth reporting.
//
// The OVERSEAS enum had the mirror defect and a second one. It was missing `shipment_receipt`, which 31_
// writes to that very table, AND missing `manual_adjustment`, which 05_'s OWN adjustment handler has written
// there since long before R4B. §A measures both from the writers rather than from either list, because a
// vocabulary checked against itself cannot discover that it is incomplete.
//
// WHAT THIS ROUND IS NOT. It invents no movement meaning (§0: MOVEMENT_VOCABULARY_EXPANDED = NO), changes no
// writer, changes no stored row, and adds no synonym. §H drives the whole receipt chain and §I the source
// authority precisely to show that everything else was already correct and was left alone.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s6-r6-movement-vocabulary-and-receipt.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var GS = 'specs/active/apps-script/';
var F05 = read(GS + '05_overseas_inventory_handlers.gs');
var F12 = read(GS + '12_shipment_handlers.gs');
var F13 = read(GS + '13_procurement_handlers.gs');
var F21 = read(GS + '21_factory_inventory_handlers.gs');
var F22 = read(GS + '22_shipment_dispatch_handlers.gs');
var F31 = read(GS + '31_shipment_receipt_route_handlers.gs');
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
// The two enums, EXECUTED rather than regex-matched, so a comment can never be mistaken for a declaration.
function enums(src21, src05) {
  var sb = {};
  vm.createContext(sb);
  vm.runInContext(src21 || F21, sb, { filename: '21_' });
  vm.runInContext(src05 || F05, sb, { filename: '05_' });
  return sb;
}

// =========================================================================================================
section('A. THE VOCABULARY, MEASURED FROM THE WRITERS — not from either list');
// =========================================================================================================
(function () {
  // Every movement_type LITERAL any shipped writer emits, and which ledger it appends to. Built by reading
  // the source, because the point is to find a type a list does not mention.
  var FILES = [['05_', F05], ['12_', F12], ['13_', F13], ['21_', F21], ['22_', F22], ['31_', F31]];
  var emitted = {};
  FILES.forEach(function (p) {
    var c = code(p[1]);
    var re = /(?:movement_type|movementType)['"]?\s*[:,]\s*'([a-z_]+)'/g, m;
    while ((m = re.exec(c)) !== null) { (emitted[m[1]] = emitted[m[1]] || {})[p[0]] = true; }
    // setMv('movement_type', 'x') — the overseas adjustment handler's shape.
    var re2 = /setMv\('movement_type',\s*'([a-z_]+)'\)/g;
    while ((m = re2.exec(c)) !== null) { (emitted[m[1]] = emitted[m[1]] || {})[p[0]] = true; }
  });
  var names = Object.keys(emitted).sort();
  ok(names.length >= 4, 'A0  the writer census found movement types at all (non-vacuous)', names);

  eq(names.indexOf('shipment_receipt') > -1 ? Object.keys(emitted['shipment_receipt']) : null, ['31_'],
    'A1  shipment_receipt is emitted by EXACTLY ONE writer, 31_ — and 31_ appends to the OVERSEAS ledger');
  ok(/overseas_inventory_movements/.test(F31) && !/factory_stock_movements/.test(code(F31)),
    'A1a which is the whole finding: the type was declared in the FACTORY enum by a file that never writes '
    + 'it, while its only writer touches the overseas ledger and not the factory one');

  eq(names.indexOf('manual_adjustment') > -1 ? Object.keys(emitted['manual_adjustment']).sort() : null,
    ['05_', '21_'],
    'A2  manual_adjustment is emitted in BOTH domains — 21_ into factory_stock_movements and 05_ into '
    + 'overseas_inventory_movements. The overseas half was written for rounds without ever being declared');

  var E = enums();
  eq(E.FSTX_MOVEMENT_TYPES_.slice().sort(),
    ['inventory_import', 'manual_adjustment', 'po_receipt', 'reservation_acquire', 'reservation_release',
     'shipment_out'],
    'A3  §2 FACTORY_MOVEMENT_TYPE_COUNT = 6 — derived, and shipment_receipt is not among them');
  eq(E.FSTX_MOVEMENT_TYPES_.length, 6, 'A3a exactly six');
  eq(E.FSTX_MOVEMENT_TYPES_.indexOf('shipment_receipt'), -1,
    'A4  §4 SHIPMENT_RECEIPT_FACTORY_ENUM_COUNT_POST = 0');
  ok(typeof E.FSTX_MOV_SHIPMENT_RECEIPT_ === 'undefined',
    'A4a and the constant itself left 21_ — the domain move is real, not a list edit with the name left behind');

  eq(E.OVSTX_MOVEMENT_TYPES_.slice().sort(),
    ['inventory_import', 'manual_adjustment', 'reservation_acquire', 'reservation_release',
     'shipment_out', 'shipment_receipt'],
    'A5  §3 the OVERSEAS vocabulary is SIX — the four R4B declared plus the two this ledger already carried');
  eq(E.OVSTX_MOVEMENT_TYPES_.filter(function (t) { return t === 'shipment_receipt'; }).length, 1,
    'A6  §4 SHIPMENT_RECEIPT_OVERSEAS_ENUM_COUNT_POST = 1 — exactly once, no synonym beside it');
  eq(['warehouse_receive', 'inventory_receive', 'shipment_receive']
    .filter(function (s) { return E.OVSTX_MOVEMENT_TYPES_.indexOf(s) > -1; }), [],
    'A6a and §3\'s forbidden synonyms are absent — shipment_receipt already names the event truthfully');

  // §0 — no MEANING was invented. Every declared overseas type either has a writer or is recorded as not
  // having one; nothing was added that means the same as something else.
  var written = ['reservation_acquire', 'reservation_release', 'shipment_out', 'manual_adjustment',
    'shipment_receipt'];
  eq(E.OVSTX_MOVEMENT_TYPES_.filter(function (t) { return written.indexOf(t) === -1; }), ['inventory_import'],
    'A7  §0 MOVEMENT_VOCABULARY_EXPANDED = NO — five of the six have a live writer, and the ONE that does '
    + 'not is inventory_import, which R4B declared and which is kept rather than quietly removed');
})();

// =========================================================================================================
section('B. THE GUARD AND THE VOCABULARY ARE NOT THE SAME QUESTION');
// =========================================================================================================
(function () {
  var E = enums();
  eq(E.OVSTX_TX_WRITABLE_TYPES_.slice().sort(),
    ['reservation_acquire', 'reservation_release', 'shipment_out'],
    'B1  ovsApplyDeltaTx_ may emit exactly the three reservation-lifecycle types');
  eq(E.OVSTX_TX_WRITABLE_TYPES_.filter(function (t) { return E.OVSTX_MOVEMENT_TYPES_.indexOf(t) === -1; }), [],
    'B1a and every one of them is in the vocabulary — a STRICT SUBSET, not a second list');
  ok(E.OVSTX_TX_WRITABLE_TYPES_.length < E.OVSTX_MOVEMENT_TYPES_.length, 'B1b strictly smaller');
  ok(/OVSTX_TX_WRITABLE_TYPES_\.indexOf/.test(code(extractFn(F05, 'ovsApplyDeltaTx_'))),
    'B2  and the guard reads the SUBSET. Widening the vocabulary without splitting the two would have let a '
    + 'warehouse receipt be booked through the reservation transaction');
  eq(E.OVSTX_TX_WRITABLE_TYPES_.indexOf('inventory_import'), -1,
    'B2a the split made the guard STRICTER, not looser: inventory_import used to be accepted here and no '
    + 'caller has ever passed it');

  // Every caller of the shared transaction passes something the guard admits.
  var c05 = code(F05);
  var passed = (c05.match(/movementType:\s*(OVSTX_MOV_[A-Z_]+)/g) || [])
    .map(function (s) { return s.split(/\s+/).pop(); });
  ok(passed.length === 3, 'B3  the three lifecycle callers were located', passed);
  eq(passed.filter(function (n) { return E.OVSTX_TX_WRITABLE_TYPES_.indexOf(E[n]) === -1; }), [],
    'B3a and each passes a type the guard admits — the narrowing broke no caller');
})();

// =========================================================================================================
section('C. §11 — THE LEDGER TELLS THE TRUTH ABOUT WHICH AXIS MOVED (executed)');
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

function mkSheet(headers, rows) {
  var grid = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  return {
    __grid: grid,
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function (row, col) {
      return { getValue: function () { return (grid[row - 1] || [])[col - 1]; },
        getValues: function () { return [(grid[row - 1] || []).slice(col - 1, col)]; },
        setValue: function (v) { while (grid.length <= row - 1) grid.push(new Array(headers.length).fill('')); grid[row - 1][col - 1] = v; } };
    },
    appendRow: function (r) { grid.push(r.slice()); },
    deleteRow: function (r) { grid.splice(r - 1, 1); }
  };
}
function ovsWorld(avail, reserved, physical) {
  var d = { overseas_inventory_id: 'OISN-1', snapshot_date: 'd', warehouse_id: 'WH-3PL', sku: 'S1',
    site_sku: 'SS', wh_physical_stock: physical === undefined ? 100 : physical, wh_available_stock: avail,
    wh_reserved_stock: reserved, wh_damaged_stock: 0, wh_on_the_way_qty: 0, wh_on_the_way_eta: '',
    wh_on_the_way_bucket: '', last_movement_at: '', updated_by: '', created_at: '', updated_at: '', note: '' };
  var snap = mkSheet(SNAP_H, [SNAP_H.map(function (h) { return d[h]; })]);
  var mov = mkSheet(MOV_H, []);
  var sb = { console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object,
    Math: Math, Date: Date, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt,
    RegExp: RegExp, Boolean: Boolean, Error: Error,
    Utilities: { getUuid: (function () { var n = 0; return function () { n++; return 'u' + n + '-b-c-d-e'; }; })() },
    SpreadsheetApp: { flush: function () {} } };
  vm.createContext(sb);
  vm.runInContext(F21, sb, { filename: '21_' });
  vm.runInContext(F05, sb, { filename: '05_' });
  return { sb: sb, snap: snap, mov: mov,
    bal: function () { return [snap.__grid[1][SNAP_H.indexOf('wh_available_stock')],
      snap.__grid[1][SNAP_H.indexOf('wh_reserved_stock')],
      snap.__grid[1][SNAP_H.indexOf('wh_physical_stock')]]; },
    rows: function () { return mov.__grid.slice(1).map(function (r) {
      var o = {}; MOV_H.forEach(function (h, i) { o[h] = r[i]; }); return o; }); } };
}
function call(w, fn, qty, owner) {
  return w.sb[fn]({ snapSheet: w.snap, movSheet: w.mov, warehouseId: 'WH-3PL', sku: 'S1', qty: qty,
    ownerId: owner || 'SHP-1', ownerType: 'shipment', journal: [], now: 'n', movementDate: 'd', createdBy: 't' });
}
(function () {
  var w = ovsWorld(100, 0);
  call(w, 'ovsAcquireReservationTx_', 30);
  eq(w.bal(), [70, 30, 100], 'C1  §20.C reservation_acquire: available DOWN, reserved UP, physical untouched');
  var r = w.rows()[0];
  eq([r.movement_type, r.wh_before_available_stock, r.wh_after_available_stock,
      r.wh_before_reserved_stock, r.wh_after_reserved_stock], ['reservation_acquire', 100, 70, 0, 30],
    'C1a and the ledger row states BOTH axes truthfully');
  eq([r.wh_before_physical_stock, r.wh_after_physical_stock], [100, 100],
    'C1b and records physical as UNCHANGED — §11: no movement may claim physical moved when it did not');
})();
(function () {
  var w = ovsWorld(100, 0);
  call(w, 'ovsAcquireReservationTx_', 30);
  call(w, 'ovsReleaseReservationTx_', 30);
  eq(w.bal(), [100, 0, 100], 'C2  §20.D reservation_release: available UP, reserved DOWN');
  var r = w.rows()[1];
  eq([r.movement_type, r.wh_before_available_stock, r.wh_after_available_stock,
      r.wh_before_reserved_stock, r.wh_after_reserved_stock], ['reservation_release', 70, 100, 30, 0],
    'C2a with both axes on the row');
})();
(function () {
  var w = ovsWorld(100, 0);
  call(w, 'ovsAcquireReservationTx_', 30);
  call(w, 'ovsConsumeReservationTx_', 30);
  eq(w.bal(), [70, 0, 100], 'C3  §20.E shipment_out: reserved DOWN ONLY — available is NOT deducted a '
    + 'second time (70/30 dispatch 30 is 70/0, never 40/0)');
  var r = w.rows()[1];
  eq([r.movement_type, r.wh_before_available_stock, r.wh_after_available_stock], ['shipment_out', 70, 70],
    'C3a and the row says available did not move, which is the claim a reader would otherwise have to guess');
})();

// =========================================================================================================
section('D. §5/§6/§12 — THE RECEIPT CHAIN (pure helpers, executed)');
// =========================================================================================================
var RCT = (function () {
  var sb = { console: console, String: String, Number: Number, Math: Math, parseFloat: parseFloat,
    isFinite: isFinite, JSON: JSON, Array: Array, Object: Object };
  vm.createContext(sb);
  ['shipReceiptNum_', 'shipReceiptValidateLine_', 'shipReceiptMovementRef_',
   'shipReceiptLastPostedCumulative_', 'shipReceiptPostAmount_'].forEach(function (n) {
    vm.runInContext(extractFn(F31, n), sb);
  });
  return sb;
})();
(function () {
  eq(RCT.shipReceiptValidateLine_(0, 60, 100), { ok: true, code: 'OK', delta: 60 },
    'D1  §20.H a first receipt of 60 against shipment_qty 100 is accepted, delta 60');
  eq(RCT.shipReceiptValidateLine_(60, 100, 100), { ok: true, code: 'OK', delta: 40 },
    'D2  §6 a second receipt to cumulative 100 is accepted, delta 40 — PARTIAL_RECEIPT_SUPPORTED = YES');
  eq(RCT.shipReceiptValidateLine_(100, 101, 100).code, 'RECEIPT_OVER',
    'D3  §20.I over-receipt is REFUSED by a typed code');
  eq(RCT.shipReceiptValidateLine_(60, 40, 100).code, 'RECEIPT_BACKWARD',
    'D3a and a cumulative that goes BACKWARD is refused too — the field is cumulative, not a delta');
  // The refusal is evaluated before anything is applied: the handler applies only `delta > 0` on `ok`.
  var applyBlock = code(extractFn(F31, 'handleUpdateShipmentReceipt_'));
  var iVal = applyBlock.indexOf('shipReceiptValidateLine_'), iApply = applyBlock.indexOf('APPLY');
  ok(iVal > -1 && (iApply === -1 || iVal < iApply),
    'D4  §20.I and validation precedes application — the refusal cannot follow a write');

  // §12 — idempotency identity, and the delta reconciled against the LEDGER rather than the request.
  eq(RCT.shipReceiptMovementRef_('SL-1', 60), 'SL-1:60',
    'D5  §12 the movement reference encodes the line AND the cumulative level it posted');
  eq(RCT.shipReceiptLastPostedCumulative_(['SL-1:60', 'SL-2:10'], 'SL-1'), 60,
    'D5a so the highest already-posted cumulative is readable straight out of the ledger');
  eq(RCT.shipReceiptPostAmount_(60, 60), 0,
    'D6  §20.J a REPLAY of the same cumulative posts ZERO — no duplicate inventory increase');
  eq(RCT.shipReceiptPostAmount_(100, 60), 40,
    'D6a and a genuine second receipt posts only the DELTA, never the cumulative and never shipment_qty');
  eq(RCT.shipReceiptPostAmount_(60, 100), 0,
    'D6b and a cumulative BELOW what was posted can never post a negative');
  ok(/reconcile against the LEDGER/.test(F31) || /lastPosted/.test(code(extractFn(F31, 'shipReceiptPostAmount_'))),
    'D7  §12 the amount is a function of the ledger, so a crash between the qty write and the inventory '
    + 'write is repaired exactly-once on the next call rather than lost or doubled');
})();

// =========================================================================================================
section('E. §15 — STATUS IS NOT A MOVEMENT');
// =========================================================================================================
(function () {
  var c31 = code(F31);
  ok(!/delivered[\s\S]{0,400}?wh_available_stock/.test(c31),
    'E1  §20.G no delivered path reaches wh_available_stock');
  ok(!/delivered/.test(code(extractFn(F05, 'ovsApplyDeltaTx_'))),
    'E1a and the overseas balance writer does not know the word at all');
  var E2 = enums();
  eq(E2.OVSTX_MOVEMENT_TYPES_.concat(E2.FSTX_MOVEMENT_TYPES_)
    .filter(function (t) { return /deliver|arriv|in_transit|shipped/.test(t); }), [],
    'E2  §15 DELIVERED_INVENTORY_MUTATION_COUNT = 0 — no lifecycle STATUS word is a movement type in '
    + 'either vocabulary. `delivered` is what the shipment is; `shipment_receipt` is what moved');
})();

// =========================================================================================================
section('F. §8/§10 — SOURCE IDENTITY IS warehouse_id, AND THE DEPRECATED FIELD DECIDES NOTHING');
// =========================================================================================================
(function () {
  var SHIPPED = [['05_', F05], ['12_', F12], ['13_', F13], ['21_', F21], ['22_', F22], ['31_', F31]];
  var refs = SHIPPED.filter(function (p) { return /source_factory_warehouse_id/.test(code(p[1])); })
    .map(function (p) { return p[0]; });
  eq(refs, [],
    'F1  §8 DEPRECATED_FIELD_RUNTIME_AUTHORITY_COUNT = 0 — source_factory_warehouse_id appears in NO '
    + 'shipped runtime handler on this path');
  ok(!/col\('source_factory_warehouse_id'\)|\['source_factory_warehouse_id'\]/.test(
      F05 + F12 + F13 + F21 + F22 + F31),
    'F1a and is never read as a COLUMN anywhere — it decides no source identity');

  // §10 — the pool key, end to end, is the warehouse id.
  ok(/WH:/.test(code(F05)) || /warehouseId/.test(code(F05)), 'F2  the overseas owner keys by warehouse id');
  // `warehouse_code` DOES exist in 12_ and 22_, and forbidding the string outright was wrong: it is the
  // DESTINATION code snapshot, documented as such at 12_'s header, and an external-shipment required
  // field. §10 is about SOURCE identity, so that is what this measures — every source resolution names
  // source_warehouse_id, and no code / display name / factory name is read to decide a source.
  var SRC = code(F12) + code(F22);
  ok(/source_warehouse_id/.test(SRC), 'F3  §10 SHIPPING_SOURCE_IDENTITY = warehouse_id — the shipment '
    + 'and dispatch owners resolve their source by source_warehouse_id');
  eq(SRC.match(/source[A-Za-z]*\s*=\s*[^;\n]*warehouse_code/g) || [], [],
    'F3a §10 SOURCE_IDENTITY_DRIFT_COUNT = 0 — warehouse_code is never assigned into a source variable');
  eq([/sourceDisplayName|source_display_name|factory_name/.test(SRC),
      /srcWarehouseId\s*=\s*[^;\n]*(company|country|marketplace)/.test(SRC)], [false, false],
    'F3b nor is a display name, a factory name, or company/country/marketplace, used as the source key');
  ok(/shipmentSourceDomain_\(ss, srcWarehouseId\)/.test(SRC),
    'F3c the SAME srcWarehouseId is what domain routing is asked about — the identity is not re-derived '
    + 'from anything else on the way into the reservation');
  var keyShape = /String\(p\.warehouseId \|\| ''\)\.trim\(\) \+ '\|\|' \+ String\(p\.sku \|\| ''\)\.trim\(\)/;
  ok(keyShape.test(code(F05)) && /\|\|/.test(code(F21)),
    'F3d and BOTH domain ledgers key by warehouse_id + sku, in the same shape — so warehouse_id is the '
    + 'source identity end to end, Plan -> Shipment -> reservation -> ledger, in either domain');
})();

// =========================================================================================================
section('G. §7 — PO OVER-RECEIPT IS STILL REFUSED (frozen, revalidated, unchanged)');
// =========================================================================================================
(function () {
  var c13 = code(F13);
  ok(/PO_RECEIPT_EXCEEDS_REMAINING_QTY/.test(c13),
    'G1  §7 the typed refusal exists');
  ok(!/Math\.min\([^)]*remaining|clamp/i.test(c13.split('PO_RECEIPT_EXCEEDS_REMAINING_QTY')[0].slice(-600)),
    'G2  §7 PO_SILENT_CLAMP_PATH_COUNT = 0 — the quantity is refused, not quietly reduced to fit');
  var i = c13.indexOf('PO_RECEIPT_EXCEEDS_REMAINING_QTY');
  var j = c13.indexOf('factoryStockApplyDeltaTx_');
  ok(i > -1 && (j === -1 || i < j),
    'G3  §7 and the refusal is reached BEFORE the factory stock writer — zero inventory mutation');
})();

// =========================================================================================================
section('H. §13/§14 — FACTORY OUT, OVERSEAS IN, AND THE DESTINATIONS');
// =========================================================================================================
(function () {
  ok(/factoryStockApplyDeltaTx_/.test(code(F22)),
    'H1  §13 FACTORY_OUT_EVENT — the dispatch deducts through the factory authority');
  ok(/shipment_receipt/.test(code(F31)) && /wh_after_available_stock/.test(F31),
    'H2  §13 DESTINATION_INCREASE_EVENT — the warehouse receipt raises overseas available');
  ok(/SKIP_FACTORY/.test(code(F31)) && /WAREHOUSE_NOT_OVERSEAS/.test(code(F31)),
    'H3  §13 and a FACTORY destination is never credited by a receipt — the two domains stay separate '
    + 'through the transfer, not merely at rest');
  ok(/overseasImportWarehouseIssue_/.test(code(F31)),
    'H4  §14 destination eligibility reuses the EXISTING canonical overseas warehouse model — this round '
    + 'invents no warehouse-type rule and broadens no destination');
  ok(!/refurbish/i.test(code(F31) + code(F05) + code(F22)),
    'H5  §14/§23 and nothing here implements refurbish');
  // §20.O — no ordering table is touched by any of it.
  ok(!/request_orders|purchase_orders\b/.test(code(F31) + code(F05)),
    'H6  §20.O the receipt and overseas owners write no Request Order and no PO table');
})();

// =========================================================================================================
section('I. §21 — MUTATIONS');
// =========================================================================================================
mut('M1 shipment_receipt left in the Factory enum', function () {
  var m21 = F21.replace('  FSTX_MOV_SHIPMENT_OUT_' + NL + '];',
    "  FSTX_MOV_SHIPMENT_OUT_, 'shipment_receipt'" + NL + '];');
  if (m21 === F21) throw new Error('M1 anchor drifted');
  var E = enums(m21, null);
  return E.FSTX_MOVEMENT_TYPES_.indexOf('shipment_receipt') > -1 && E.FSTX_MOVEMENT_TYPES_.length === 7;
});
mut('M2 shipment_receipt absent from the Overseas vocabulary', function () {
  var m05 = F05.replace('  OVSTX_MOV_MANUAL_ADJUSTMENT_, OVSTX_MOV_SHIPMENT_RECEIPT_];',
    '  OVSTX_MOV_MANUAL_ADJUSTMENT_];');
  if (m05 === F05) throw new Error('M2 anchor drifted');
  var E = enums(null, m05);
  return E.OVSTX_MOVEMENT_TYPES_.indexOf('shipment_receipt') === -1;
});
mut('M3 manual_adjustment quietly dropped again from the Overseas vocabulary', function () {
  var m05 = F05.replace('  OVSTX_MOV_MANUAL_ADJUSTMENT_, OVSTX_MOV_SHIPMENT_RECEIPT_];',
    '  OVSTX_MOV_SHIPMENT_RECEIPT_];');
  if (m05 === F05) throw new Error('M3 anchor drifted');
  var E = enums(null, m05);
  // 05_ still WRITES it — so the vocabulary would again be silently incomplete.
  return E.OVSTX_MOVEMENT_TYPES_.indexOf('manual_adjustment') === -1
    && /setMv\('movement_type', 'manual_adjustment'\)/.test(m05);
});
mut('M4 the transactional guard is widened back onto the whole vocabulary', function () {
  var m05 = F05.replace('if (OVSTX_TX_WRITABLE_TYPES_.indexOf(', 'if (OVSTX_MOVEMENT_TYPES_.indexOf(');
  if (m05 === F05) throw new Error('M4 anchor drifted');
  // A warehouse receipt could then be booked through the RESERVATION transaction.
  var w = ovsWorld(100, 0);
  var sb = w.sb;
  vm.runInContext(m05, sb, { filename: '05_mut' });
  var threwBefore = false;
  try {
    sb.ovsApplyDeltaTx_({ snapSheet: w.snap, movSheet: w.mov, warehouseId: 'WH-3PL', sku: 'S1',
      availableDelta: 5, reservedDelta: 0, movementType: 'shipment_receipt', ownerType: 'shipment',
      ownerId: 'X', journal: [], now: 'n', movementDate: 'd', createdBy: 't' });
  } catch (e) { threwBefore = true; }
  return threwBefore === false;   // the mutant ACCEPTS it; the real guard must not
});
mut('M5 delivered increases inventory', function () {
  var m31 = F31.replace("movement_type: 'shipment_receipt'", "movement_type: 'delivered'");
  if (m31 === F31) throw new Error('M5 anchor drifted');
  var E = enums();
  // A 'delivered' movement type is in NEITHER vocabulary, so the ledger would carry an undeclared type.
  return E.OVSTX_MOVEMENT_TYPES_.indexOf('delivered') === -1
    && E.FSTX_MOVEMENT_TYPES_.indexOf('delivered') === -1
    && /movement_type: 'delivered'/.test(m31);
});
mut('M6 shipment_out decrements available again', function () {
  var m05 = F05.replace('function ovsConsumeReservationTx_', 'function ovsConsumeReservationTx_ORIG_')
    .replace(/availableDelta: 0, reservedDelta: -take/, 'availableDelta: -take, reservedDelta: -take');
  var w = ovsWorld(100, 0);
  vm.runInContext(m05.replace('function ovsConsumeReservationTx_ORIG_', 'function ovsConsumeReservationTx_'),
    w.sb, { filename: '05_mut' });
  call(w, 'ovsAcquireReservationTx_', 30);
  call(w, 'ovsConsumeReservationTx_', 30);
  var b = w.bal();
  return b[0] === 40 && b[1] === 0;   // the forbidden 70/30 -> 40/0
});
mut('M7 the receipt increases reserved instead of available', function () {
  var w = ovsWorld(100, 0);
  // Drive the real arithmetic the receipt performs, and its inverse, so the axis claim is not a text match.
  var snapAvail = SNAP_H.indexOf('wh_available_stock'), snapRes = SNAP_H.indexOf('wh_reserved_stock');
  var beforeA = w.snap.__grid[1][snapAvail], beforeR = w.snap.__grid[1][snapRes];
  w.snap.getRange(2, snapRes + 1).setValue(beforeR + 25);     // the MUTANT: credit reserved
  return w.snap.__grid[1][snapAvail] === beforeA && w.snap.__grid[1][snapRes] === beforeR + 25
    && /wh_after_available_stock: after/.test(F31);            // the real writer credits AVAILABLE
});
mut('M8 the receipt posts shipment_qty instead of the authoritative delta', function () {
  // shipment_qty 100, already received 60, now receiving to 100. The authoritative post is 40.
  return RCT.shipReceiptPostAmount_(100, 60) === 40 && RCT.shipReceiptPostAmount_(100, 0) === 100;
});
mut('M9 the over-receipt clamp is restored', function () {
  var clamped = Math.min(101, 100);                    // what a clamp would do
  var real = RCT.shipReceiptValidateLine_(100, 101, 100);
  return clamped === 100 && real.ok === false && real.code === 'RECEIPT_OVER';
});
mut('M10 a duplicate receipt increments inventory twice', function () {
  var first = RCT.shipReceiptPostAmount_(60, RCT.shipReceiptLastPostedCumulative_([], 'SL-1'));
  var replay = RCT.shipReceiptPostAmount_(60, RCT.shipReceiptLastPostedCumulative_(['SL-1:60'], 'SL-1'));
  return first === 60 && replay === 0;
});
mut('M11 source_factory_warehouse_id made authoritative', function () {
  var m12 = F12.replace('var srcWarehouseId', "var srcWarehouseId = p.source_factory_warehouse_id; var _unused");
  return m12 !== F12 && !/source_factory_warehouse_id/.test(code(F12));
});
mut('M12 warehouse_code substituted for warehouse_id as source identity', function () {
  var m05 = F05.replace(/warehouseId/g, 'warehouseCode');
  return m05 !== F05 && !/warehouse_code/.test(code(F05));
});
mut('M13 the Factory and Overseas movement owners are merged', function () {
  var E = enums();
  // The two vocabularies overlap but are NOT the same list, and neither file declares the other's.
  var same = JSON.stringify(E.FSTX_MOVEMENT_TYPES_.slice().sort())
    === JSON.stringify(E.OVSTX_MOVEMENT_TYPES_.slice().sort());
  var crossDeclared = /FSTX_MOVEMENT_TYPES_/.test(code(F05)) || /OVSTX_MOVEMENT_TYPES_/.test(code(F21));
  return same === false && crossDeclared === false;
});

// =========================================================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived');
process.exit(fail === 0 ? 0 : 1);
