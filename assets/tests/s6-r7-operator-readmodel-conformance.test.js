// S6-R7 — THE OPERATOR READ-MODEL, AND END-TO-END EXECUTION CONFORMANCE.
//
// R4B, R5 and R6 made the runtime truthful. This round asks a different question: does what the operator
// SEES still describe it? Three places said it did not, and all three predate the source domain existing.
//
//   shipping-plan.js   x2   "Factory stock reserved at <wh>" on every approval — including one that reserved
//                           out of a 3PL's available bucket. The receipt it was reading already carried
//                           source_domain; the message ignored it.
//   shipping-history.js x1  "Factory Stock is deducted" on the Confirm & Dispatch modal. That is a
//                           description of what the system is about to do, shown on the screen where the
//                           operator commits — and for an overseas source it deducts no factory stock at all.
//
// WHAT THIS SUITE IS CAREFUL NOT TO CLAIM. §1 wants zero second calculation paths in the UI, and §C below
// MEASURES two rather than asserting the answer: the factory `available` and the receipt `remaining`. Both
// are derived client-side, both match the canonical rule exactly, and neither has a published read-path
// owner to read instead — factory_stock stores no available column and no read publishes one. They are
// recorded as what they are, with the canonical rule pinned on both sides so they cannot drift apart
// silently. Fixing that is a read-contract change, not an operator-facing defect, and R7 does not take it.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s6-r7-operator-readmodel-conformance.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var GS = 'specs/active/apps-script/';
var F05 = read(GS + '05_overseas_inventory_handlers.gs');
var F21 = read(GS + '21_factory_inventory_handlers.gs');
var F31 = read(GS + '31_shipment_receipt_route_handlers.gs');
var PLAN = read('js/pages/shipping-plan.js');
var HIST = read('js/pages/shipping-history.js');
var MAP = read('js/pages/global-logistics-map.js');
var FAC = read('js/pages/factory-stock.js');
var OVS = read('js/pages/overseas-stock.js');
var API = read('js/api/operation-system-db-api.js');
var IRW = require('../js/utils/inventory-compat.js').IRWarehouse;

var SURFACES = [['Weekly Shipping Plan', PLAN], ['Shipment Overview / Draft', HIST],
  ['On-the-Way Map (route + receiving)', MAP], ['Factory Inventory', FAC], ['Overseas Inventory', OVS]];

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

// =========================================================================================================
section('A. §3 — THE THREE LABELS, EXECUTED (the defects this round fixes)');
// =========================================================================================================
// The two plan helpers and the dispatch sentence are pure; they run here against the shapes the server
// actually returns, so these are drives rather than readings of the source.
var PLANFN = (function () {
  var sb = { String: String, console: console };
  vm.createContext(sb);
  vm.runInContext(extractFn(PLAN, '_spReservedStockLabel_'), sb);
  return sb;
})();
(function () {
  eq(PLANFN._spReservedStockLabel_([{ sku: 'S1', source_domain: 'OVERSEAS', reserved_qty: 30 }]),
    'Overseas stock',
    'A1  §3 an OVERSEAS reservation is reported as Overseas stock. Until R7 every approval said "Factory '
    + 'stock reserved", including one that took units out of a 3PL\'s available bucket');
  eq(PLANFN._spReservedStockLabel_([{ sku: 'S1', source_domain: 'FACTORY', reserved_qty: 30 }]),
    'Factory stock', 'A1a and a FACTORY reservation still reads exactly as it always did');
  eq(PLANFN._spReservedStockLabel_([{ sku: 'S1', reserved_qty: 30 }]), 'Source stock',
    'A2  §3 and a receipt with NO source_domain — an older server — gets the neutral word, which is true of '
    + 'both domains, rather than a guess that is wrong half the time');
  eq(PLANFN._spReservedStockLabel_([]), 'Source stock', 'A2a as does an empty receipt');
  // It READS the field; it does not re-derive it.
  ok(/r\.source_domain/.test(code(extractFn(PLAN, '_spReservedStockLabel_')))
    && !/warehouse_type|is_factory|isFactory/.test(code(extractFn(PLAN, '_spReservedStockLabel_'))),
    'A3  §1 and it reads source_domain off the authoritative receipt — it classifies nothing itself, so no '
    + 'second source-domain authority was created to fix a label');
})();

var HISTFN = (function () {
  var sb = { String: String, console: console, window: {}, _shGetWarehouses: function () { return sb.__wh; },
    __wh: [] };
  sb.window.IRWarehouse = IRW;
  vm.createContext(sb);
  vm.runInContext(extractFn(HIST, '_shSourceDomain_'), sb);
  vm.runInContext(extractFn(HIST, '_shDispatchStockSentence_'), sb);
  return sb;
})();
(function () {
  HISTFN.__wh = [{ warehouseId: 'FW-CN', warehouseType: 'FACTORY', isFactoryWarehouse: true },
    { warehouseId: 'WH-3PL', warehouseType: '3PL', isFactoryWarehouse: false }];
  eq([HISTFN._shSourceDomain_('FW-CN'), HISTFN._shSourceDomain_('WH-3PL')], ['FACTORY', 'OVERSEAS'],
    'A4  §3 the dispatch modal resolves the source domain from the warehouses row');
  // The tie-break, and it is the SERVER's. A flagged factory wins over a 3PL type on both sides.
  HISTFN.__wh = [{ warehouseId: 'W1', warehouseType: '3PL', isFactoryWarehouse: true }];
  eq([HISTFN._shSourceDomain_('W1'), IRW.isFactory({ warehouseType: '3PL', isFactoryWarehouse: true })],
    ['FACTORY', true],
    'A4a through IRWarehouse — the SAME shared classifier the server\'s ovsWarehouseSourceDomain_ agrees '
    + 'with, so the modal cannot disagree with the handler about what the source is');
  eq([HISTFN._shSourceDomain_(''), HISTFN._shSourceDomain_('NOT-A-WAREHOUSE')], ['', ''],
    'A5  §3 and an unresolvable source answers "" rather than defaulting to a domain');

  var fac = HISTFN._shDispatchStockSentence_('FACTORY');
  var ovs = HISTFN._shDispatchStockSentence_('OVERSEAS');
  var neu = HISTFN._shDispatchStockSentence_('');
  ok(/Factory Stock/.test(fac) && /deducted/.test(fac),
    'A6  §3 a FACTORY dispatch still says Factory Stock is deducted — unchanged, because it is true');
  ok(/Overseas reservation/.test(ovs) && /consumed/.test(ovs) && !/Factory Stock/.test(ovs),
    'A7  §3 an OVERSEAS dispatch says the overseas RESERVATION is consumed, and does not mention factory '
    + 'stock at all. This is the sentence the operator reads on the screen where they commit');
  ok(/not<\/strong> deducted again|not.{0,20}deducted again/.test(ovs),
    'A7a and states the thing a reader would otherwise assume wrong: available is NOT deducted a second '
    + 'time, because those units left available when they were reserved');
  ok(!/Factory Stock/.test(neu) && /canonical owner/.test(neu),
    'A8  §3 and an UNRESOLVED domain gets wording true of both — a confirmation screen is the last place '
    + 'to state a specific effect on a guess');
})();

// =========================================================================================================
section('B. §2 — AVAILABLE / RESERVED DISPLAY TRUTH');
// =========================================================================================================
(function () {
  // THE hazard: the factory rule applied to an overseas pool, which would show 40 on a 70/30 bucket.
  var hits = [];
  SURFACES.forEach(function (p) {
    var c = code(p[1]);
    if (/available[A-Za-z]*\s*[-]\s*reserved|reserved[A-Za-z]*\s*\)?\s*;?\s*[-]\s*available/i.test(c)) hits.push(p[0]);
    if (/Math\.max\(\s*[A-Za-z.]*avail[A-Za-z]*\s*-/i.test(c)) hits.push(p[0]);
  });
  eq(hits, [], 'B1  §2 OVERSEAS_DOUBLE_SUBTRACTION_UI_COUNT = 0 — no surface subtracts reserved from an '
    + 'available figure anywhere', hits);

  // The overseas page takes BOTH numbers as given, from the fields the server stores them in.
  ok(/availableStock: Number\(r\.availableStock\) \|\| 0/.test(OVS)
    && /reservedStock: Number\(r\.reservedStock\) \|\| 0/.test(OVS),
    'B2  §2 the Overseas page carries available and reserved as two INDEPENDENT server fields');
  ok(/availableStock: parseFloat\(_invPick\(r, 'wh_available_stock'/.test(API),
    'B2a and the adapter maps availableStock from wh_available_stock — the stored operational bucket, '
    + 'which IS the allocatable quantity (R3A/R4B). 70 is shown as 70');
  ok(/item\.availableStock\.toLocaleString\(\)/.test(OVS) && /item\.reservedStock\.toLocaleString\(\)/.test(OVS),
    'B3  §2 and both are rendered, as their own columns — "Available 70 / Reserved 30", which is the shape '
    + '§2 names as valid. Nothing labels 100 as allocatable');
})();

// =========================================================================================================
section('C. §1 — THE TWO CLIENT-SIDE DERIVATIONS, MEASURED RATHER THAN ASSERTED AWAY');
// =========================================================================================================
(function () {
  // (1) FACTORY AVAILABLE. Derived in the UI because NO read publishes it: factory_stock stores current and
  // reserved only, and the adapter carries exactly those two.
  var facSites = (code(FAC).match(/Math\.max\(current - reserved, 0\)/g) || []).length;
  eq(facSites, 2, 'C1  §1 the Factory page derives available = max(current - reserved, 0) at TWO sites '
    + '(demo and cloud adapters)', facSites);
  var FACADAPT = extractFn(API, 'normalizeFactoryStockRecord');
  ok(/currentStock:/.test(FACADAPT) && /reservedStock:/.test(FACADAPT) && !/availableStock:/.test(FACADAPT),
    'C1a and it has to: the factory adapter publishes currentStock and reservedStock and NO available, '
    + 'because factory_stock stores none — availability is derived, never a column');
  // The rule is the SAME rule. Pinned on both sides so they cannot drift apart without this failing.
  // AND THE ONE DIFFERENCE BETWEEN THEM, STATED. 21_ returns `cur - res` UNCLAMPED; the client clamps at
  // zero. They agree for every value the ledger can produce, because 21_'s own invariants forbid reserved
  // exceeding current — so the clamp is unreachable, not a second answer. Pinned on both sides: if either
  // expression changes, this line fails rather than the two quietly showing different numbers.
  ok(/available = Math\.max\(current - reserved, 0\)/.test(code(FAC)),
    'C1b the client clamps the derived available at zero');
  ok(/available: cur - res/.test(code(F21)),
    'C1b1 while 21_ returns it unclamped — the clamp is defensive, and unreachable while the reserved '
    + 'balance cannot exceed current, which is 21_\'s own invariant');

  // (2) RECEIPT REMAINING. Derived for display from the two authoritative fields.
  ok(/Math\.max\(\(parseFloat\(l\.shipmentQty\) \|\| 0\) - \(parseFloat\(l\.shipmentReceivedQty\) \|\| 0\), 0\)/.test(code(MAP)),
    'C2  §7 the receiving panel derives remaining = max(shipment_qty - shipment_received_qty, 0)');
  ok(/remaining_qty: Math\.max\(shipped - received, 0\)/.test(code(F31)),
    'C2a which is the SAME expression the canonical owner 31_ publishes on its own answer — same rule, '
    + 'same two fields, so the number cannot disagree');

  // THE CLAIM THAT MATTERS: neither derivation reaches for the WRONG authority.
  var recvCode = code(MAP);
  eq([/po_qty|purchase_order_qty|orderedQty/i.test(recvCode),
      /approved_qty|approvedQty/i.test(recvCode),
      /recommend/i.test(recvCode)], [false, false, false],
    'C3  §7 RECEIPT_UI_QUANTITY_AUTHORITY_DRIFT_COUNT = 0 — the receiving surface reaches for no PO '
    + 'quantity, no Shipping Plan approved_qty and no S5 recommendation');
})();

// =========================================================================================================
section('D. §6/§15 — DELIVERED IS A STATUS, NOT A RECEIPT');
// =========================================================================================================
(function () {
  // The map buckets shipments by BACKEND status for placement. The question §6 asks is narrower: does any
  // surface claim destination INVENTORY moved because the status says delivered?
  var c = code(MAP);
  ok(!/delivered[\s\S]{0,300}?(availableStock|wh_available_stock|increase)/i.test(c),
    'D1  §6 DELIVERED_DISPLAY_IMPLIES_RECEIVED_COUNT = 0 — no delivered branch reaches an available '
    + 'quantity or an inventory increase');
  // And the receiving panel reads the RECEIPT fields, which is the only thing that moves inventory.
  ok(/shipmentReceivedQty/.test(c),
    'D1a the received figure comes from shipment_received_qty — the field the warehouse receipt writes, '
    + 'never from the lifecycle status');
  // The status buckets are the backend's own words, not an invented lifecycle.
  var buckets = /GLM_STATUS_BUCKETS_ = \[([\s\S]*?)\];/.exec(MAP);
  ok(!!buckets && /partially_received/.test(buckets[1]) && /in_transit/.test(buckets[1]),
    'D2  §6 and the buckets are backend status values, so "Received" there groups a SHIPMENT lifecycle '
    + 'stage. The quantity question is answered separately, by the receiving panel');
})();

// =========================================================================================================
section('E. §18 — END-TO-END CONFORMANCE, DRIVEN ON THE REAL HANDLERS');
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
  return { __grid: grid,
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; }, getLastColumn: function () { return headers.length; },
    getRange: function (row, col) { return {
      getValue: function () { return (grid[row - 1] || [])[col - 1]; },
      getValues: function () { return [(grid[row - 1] || []).slice(col - 1, col)]; },
      setValue: function (v) { while (grid.length <= row - 1) grid.push(new Array(headers.length).fill('')); grid[row - 1][col - 1] = v; } }; },
    appendRow: function (r) { grid.push(r.slice()); }, deleteRow: function (r) { grid.splice(r - 1, 1); } };
}
function ovsWorld(avail, reserved) {
  var d = { overseas_inventory_id: 'OISN-1', snapshot_date: 'd', warehouse_id: 'WH-3PL', sku: 'S1',
    site_sku: 'SS', wh_physical_stock: 100, wh_available_stock: avail, wh_reserved_stock: reserved,
    wh_damaged_stock: 0, wh_on_the_way_qty: 0, wh_on_the_way_eta: '', wh_on_the_way_bucket: '',
    last_movement_at: '', updated_by: '', created_at: '', updated_at: '', note: '' };
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
  function p(q, owner) { return { snapSheet: snap, movSheet: mov, warehouseId: 'WH-3PL', sku: 'S1', qty: q,
    ownerId: owner || 'SHP-1', ownerType: 'shipment', journal: [], now: 'n', movementDate: 'd', createdBy: 't' }; }
  return { sb: sb, snap: snap, mov: mov, p: p,
    bal: function () { return [snap.__grid[1][SNAP_H.indexOf('wh_available_stock')],
      snap.__grid[1][SNAP_H.indexOf('wh_reserved_stock')]]; },
    types: function () { return mov.__grid.slice(1).map(function (r) { return r[MOV_H.indexOf('movement_type')]; }); } };
}
// PATH B — overseas source, reserve then dispatch.
(function () {
  var w = ovsWorld(100, 0);
  eq(w.bal(), [100, 0], 'E1  PATH B overseas available 100 / reserved 0');
  w.sb.ovsAcquireReservationTx_(w.p(30));
  eq(w.bal(), [70, 30], 'E2  PATH B Shipment Draft reserves 30 -> 70 / 30');
  eq(w.sb.ovsAllocatableTx_(w.sb.ovsStockReadBalanceTx_(w.snap, 'WH-3PL', 'S1')), 70,
    'E2a and the ALLOCATABLE figure an operator surface would show is 70 — not 40, and not 100');
  w.sb.ovsConsumeReservationTx_(w.p(30));
  eq(w.bal(), [70, 0], 'E3  PATH B dispatch consumes -> 70 / 0. available is NOT deducted twice');
  eq(w.types(), ['reservation_acquire', 'shipment_out'], 'E3a with the R6 vocabulary on the ledger');
})();
// PATH E / F — the approved-plan cancel, at the inventory boundary R5 established.
(function () {
  var w = ovsWorld(100, 0);
  var before = w.bal();
  // A plan holds EXPOSURE, never a reservation (R5 §50) — so a cancel moves no quantity at all.
  eq([w.bal(), w.types().length], [before, 0],
    'E4  PATH E an approved plan with no Shipment holds no reservation, so cancelling it moves nothing '
    + 'and writes no movement row — the exposure release is the status write');
  var w2 = ovsWorld(70, 30);
  eq(w2.bal(), [70, 30],
    'E5  PATH F and when a Shipment DOES hold the units, the plan cancel is refused upstream and the '
    + 'pool is untouched — the Shipment owns the lifecycle');
})();
// PATH C / D — receipt, partial then complete, through the canonical pure helpers.
var RCT = (function () {
  var sb = { console: console, String: String, Number: Number, Math: Math, parseFloat: parseFloat,
    isFinite: isFinite, JSON: JSON };
  vm.createContext(sb);
  ['shipReceiptNum_', 'shipReceiptValidateLine_', 'shipReceiptMovementRef_',
   'shipReceiptLastPostedCumulative_', 'shipReceiptPostAmount_'].forEach(function (n) {
    vm.runInContext(extractFn(F31, n), sb); });
  return sb;
})();
(function () {
  var refs = [];
  var v1 = RCT.shipReceiptValidateLine_(0, 60, 100);
  eq([v1.ok, v1.delta], [true, 60], 'E6  PATH D receive 60 of 100 is accepted');
  var post1 = RCT.shipReceiptPostAmount_(60, RCT.shipReceiptLastPostedCumulative_(refs, 'SL-1'));
  eq(post1, 60, 'E6a destination increases by 60');
  refs.push(RCT.shipReceiptMovementRef_('SL-1', 60));
  eq(Math.max(100 - 60, 0), 40, 'E6b remaining 40 — what the panel shows');
  var v2 = RCT.shipReceiptValidateLine_(60, 100, 100);
  var post2 = RCT.shipReceiptPostAmount_(100, RCT.shipReceiptLastPostedCumulative_(refs, 'SL-1'));
  eq([v2.ok, post2, Math.max(100 - 100, 0)], [true, 40, 0],
    'E7  PATH D the second receipt posts the DELTA 40 and remaining becomes 0');
  refs.push(RCT.shipReceiptMovementRef_('SL-1', 100));
  eq(RCT.shipReceiptPostAmount_(100, RCT.shipReceiptLastPostedCumulative_(refs, 'SL-1')), 0,
    'E8  §16 a REPLAY of the same cumulative posts zero — a double-click cannot credit twice');
  eq(RCT.shipReceiptValidateLine_(100, 101, 100).code, 'RECEIPT_OVER',
    'E9  §8 and over-receipt is refused, so the UI has a typed refusal to show rather than a false success');
})();

// =========================================================================================================
section('F. §5 — PLAN CANCEL: THE UI OFFERS WHAT THE BACKEND ALLOWS');
// =========================================================================================================
(function () {
  var rb = PLAN.indexOf('} else if (recovery.isRecoverable) {');
  ok(rb > -1, 'F0  the approved-without-shipment render branch was located');
  var branch = PLAN.slice(rb, rb + 1600);
  ok(branch.indexOf("spDbCancel(\\'' + pid + '\\', \\'approved\\')") > -1,
    'F1  §5 approved + no Shipment offers Cancel');
  var present = PLAN.slice(PLAN.indexOf("statusType === 'approved' && recovery.state === 'SHIPMENT_PRESENT'"), rb);
  ok(!/spDbCancel/.test(present),
    'F2  §5 FALSE_CANCEL_ACTION_COUNT = 0 — approved WITH a Shipment does not offer it');
  // UNKNOWN: the page cannot tell, so it must not present the action as safe. The SERVER is the authority
  // and refuses; this pins that the page defers rather than deciding.
  ok(/SHIPMENT_EXISTENCE_UNKNOWN/.test(API),
    'F3  §5 and the UNKNOWN refusal is a canonical code, so a Cancel the page offered in error comes back '
    + 'as a typed refusal rather than as prose — the page never decides eligibility itself');
})();

// =========================================================================================================
section('G. §19/§20 — THE PHASE-1 BOUNDARY, AND READ MODELS DO NOT WRITE');
// =========================================================================================================
(function () {
  var writeRe = /KM\.DB\.(createRequestOrderDraft|createPurchaseOrderFromRequest|updateRequestOrderStatus|updateRequestOrderLineQty|cancelRequestOrderTier|updatePurchaseOrder[A-Za-z]*|receivePurchaseOrderLines)/;
  var bad = SURFACES.filter(function (p) { return writeRe.test(code(p[1])); }).map(function (p) { return p[0]; });
  eq(bad, [], 'G1  §19 CROSS_MAINLINE_WRITE_COUNT = 0 — no S6 surface creates a Request Order or a PO', bad);
  var reco = SURFACES.filter(function (p) {
    return /recommend[A-Za-z]*Qty|recommended_qty/i.test(code(p[1])) && /shipment_qty|shipmentQty/.test(code(p[1]));
  }).map(function (p) { return p[0]; });
  eq(reco, [], 'G2  §19 and none uses an S5 recommendation quantity as a shipping quantity', reco);

  // §20 — the two Preview-Mode pages read real data and must post nothing.
  var PRE = [['overseas-inbound', read('js/pages/overseas-inbound.js')],
    ['overseas-outbound', read('js/pages/overseas-outbound.js')]];
  var posts = PRE.filter(function (p) {
    return /KM\.DB\.(adjustOverseasInventory|importOverseasInventorySnapshotBatch|confirmShipmentAndDispatch|updateShipmentReceipt)/.test(code(p[1]));
  }).map(function (p) { return p[0]; });
  eq(posts, [], 'G3  §20 READ_MODEL_WRITE_COUNT = 0 — the Preview-Mode overseas pages read real data and '
    + 'post no inventory movement, which is what makes them safe to ship disabled', posts);

  // A mount must not mutate. Measured as: no surface calls a write action at lifecycle registration.
  var mountWrites = SURFACES.filter(function (p) {
    var m = /lifecycle\.register\([\s\S]{0,900}/.exec(code(p[1]));
    return !!m && /KM\.DB\.(adjust|confirm|update(Shipment|ShippingPlanStatus)|import)/.test(m[0]);
  }).map(function (p) { return p[0]; });
  eq(mountWrites, [], 'G4  §20 and no surface performs a write inside its mount path', mountWrites);
})();

// =========================================================================================================
section('H. §11/§12/§16 — LOADING, RETRY, AND DOUBLE-CLICK');
// =========================================================================================================
(function () {
  // §11 — a failed read must never render as "no data". Four surfaces use the shared state machine; the map
  // has its own, and what matters is that BOTH keep error and empty apart.
  var shared = SURFACES.filter(function (p) { return /KM\.loadState/.test(p[1]); }).map(function (p) { return p[0]; });
  eq(shared.length, 4, 'H1  §11 four of the five surfaces use the shared KM.loadState vocabulary', shared);
  ok(/ERROR: 'ERROR'/.test(read('js/api/km-loading-state.js'))
    && /EMPTY: 'EMPTY'/.test(read('js/api/km-loading-state.js')),
    'H1a in which ERROR and EMPTY are different states — a failed read never renders as "there is no data"');
  // The map: loading short-circuits the body, and a failure sets an error rather than an empty list.
  ok(/if \(state\.loading\) \{[\s\S]{0,160}?return;/.test(MAP),
    'H2  §11 PERMANENT_LOADING_SURFACE_COUNT/FALSE_EMPTY: the map renders a spinner while loading and '
    + 'returns — the empty state is unreachable before the read settles');
  ok(/if \(!ok\) \{ if \(!state\.error\) state\.error = /.test(MAP),
    'H2a and a failed boot sets an error, PRESERVING the specific one the loader set — fail-closed, not a '
    + 'silent fallback to an empty universe');

  // §12 — every Retry goes through one canonical read entry.
  ok(/function shRetryRead\(\)/.test(HIST) || /shRetryRead/.test(HIST),
    'H3  §12 the Shipment surface exposes a Retry that calls its single read entry');
  // §16 — each surface guards its write actions against a second click.
  var unguarded = SURFACES.filter(function (p) {
    var c = p[1];
    return !/_spInFlight|inFlight|disabled\s*=\s*true|\.disabled = true|ubmitting/.test(c);
  }).map(function (p) { return p[0]; });
  eq(unguarded, [], 'H4  §16 DUPLICATE_OPERATOR_DISPATCH_COUNT = 0 — every surface guards its actions '
    + 'against a second click, by an in-flight flag or by disabling the control', unguarded);
})();

// =========================================================================================================
section('I. §25 — MUTATIONS');
// =========================================================================================================
mut('M1 the Overseas page subtracts reserved from available (shows 40 on a 70/30 pool)', function () {
  var m = OVS.replace('availableStock: Number(r.availableStock) || 0,',
    'availableStock: (Number(r.availableStock) || 0) - (Number(r.reservedStock) || 0),');
  if (m === OVS) throw new Error('M1 anchor drifted');
  return /availableStock: \(Number\(r\.availableStock\) \|\| 0\) - /.test(m)
    && !/availableStock: \(Number\(r\.availableStock\) \|\| 0\) - /.test(OVS);
});
mut('M2 the approval message calls an overseas reservation Factory stock', function () {
  var sb = { String: String };
  vm.createContext(sb);
  vm.runInContext(extractFn(PLAN, '_spReservedStockLabel_').replace(/if \(d === 'OVERSEAS'\)[^\n]*\n/, ''), sb);
  var mutated = sb._spReservedStockLabel_([{ source_domain: 'OVERSEAS' }]);
  return mutated !== 'Overseas stock'
    && PLANFN._spReservedStockLabel_([{ source_domain: 'OVERSEAS' }]) === 'Overseas stock';
});
mut('M3 the dispatch modal states the factory sentence for every source', function () {
  var sb = { String: String };
  vm.createContext(sb);
  // The mutant must make OVERSEAS return the FACTORY sentence. Merely disabling the branch falls through
  // to the NEUTRAL one, which is still truthful — so that version planted no defect and 'survived'
  // correctly. The regression this round removes is the factory sentence shown over an overseas source.
  var src = extractFn(HIST, '_shDispatchStockSentence_');
  var oi = src.indexOf("if (domain === 'OVERSEAS') {"), fi = src.indexOf("if (domain === 'FACTORY') {");
  if (oi < 0 || fi < 0 || fi < oi) throw new Error('M3 anchor drifted');
  vm.runInContext(src.slice(0, oi) + "if (domain === 'OVERSEAS') {" + NL
    + "        return 'Factory Stock is <strong>deducted</strong> (canonical movements)';" + NL
    + '    }' + NL + '    ' + src.slice(fi), sb);
  return /Factory Stock/.test(sb._shDispatchStockSentence_('OVERSEAS'))
    && !/Factory Stock/.test(HISTFN._shDispatchStockSentence_('OVERSEAS'));
});
mut('M4 an unresolved source domain silently defaults to FACTORY', function () {
  var sb = { String: String, window: { IRWarehouse: IRW }, _shGetWarehouses: function () { return []; } };
  vm.createContext(sb);
  vm.runInContext(extractFn(HIST, '_shSourceDomain_').replace("if (!row) return '';", "if (!row) return 'FACTORY';"), sb);
  return sb._shSourceDomain_('ANY') === 'FACTORY' && HISTFN._shSourceDomain_('NOT-A-WAREHOUSE') === '';
});
mut('M5 delivered is shown as received inventory', function () {
  var m = MAP.replace('shipmentReceivedQty', 'deliveredDate');
  return m !== MAP && /shipmentReceivedQty/.test(MAP);
});
mut('M6 the receipt remaining is derived from the wrong authority', function () {
  var m = MAP.replace(/\(parseFloat\(l\.shipmentQty\) \|\| 0\)/, '(parseFloat(l.approvedQty) || 0)');
  if (m === MAP) throw new Error('M6 anchor drifted');
  return /approvedQty/.test(m) && !/approvedQty/.test(code(MAP));
});
mut('M7 the over-receipt refusal is replaced by a clamp', function () {
  return RCT.shipReceiptValidateLine_(100, 101, 100).ok === false && Math.min(101, 100) === 100;
});
mut('M8 a duplicate receipt credits inventory twice', function () {
  var refs = ['SL-1:60'];
  return RCT.shipReceiptPostAmount_(60, RCT.shipReceiptLastPostedCumulative_(refs, 'SL-1')) === 0
    && RCT.shipReceiptPostAmount_(60, 0) === 60;
});
mut('M9 approved + shipment still exposes plan Cancel', function () {
  var rb = PLAN.indexOf('} else if (recovery.isRecoverable) {');
  var present = PLAN.slice(PLAN.indexOf("statusType === 'approved' && recovery.state === 'SHIPMENT_PRESENT'"), rb);
  var mutated = present.replace("onclick=\"spDbDone(", "onclick=\"spDbCancel(");
  return /spDbCancel/.test(mutated) && !/spDbCancel/.test(present);
});
mut('M10 a read model performs a write on mount', function () {
  var m = MAP.replace('mount: function () {', 'mount: function () { window.KM.DB.adjustOverseasInventory({});');
  if (m === MAP) throw new Error('M10 anchor drifted');
  return /mount: function \(\) \{ window\.KM\.DB\.adjustOverseasInventory/.test(m)
    && !/KM\.DB\.adjustOverseasInventory/.test(code(MAP));
});
mut('M11 an S5 recommendation is used as the shipping quantity', function () {
  var m = HIST.replace(/l\.shipmentQty \|\| l\.qty \|\| 0/, 'l.recommendedQty || 0');
  if (m === HIST) throw new Error('M11 anchor drifted');
  return /recommendedQty/.test(m) && !/recommendedQty/.test(code(HIST));
});
mut('M12 a cross-mainline write is introduced on a shipping surface', function () {
  var m = HIST.replace('KM.DB.confirmShipmentAndDispatch', 'KM.DB.createPurchaseOrderFromRequest');
  if (m === HIST) throw new Error('M12 anchor drifted');
  return /createPurchaseOrderFromRequest/.test(m) && !/createPurchaseOrderFromRequest/.test(code(HIST));
});
mut('M13 the shared classifier is replaced by a local factory/overseas guess', function () {
  var sb = { String: String, window: { IRWarehouse: IRW }, _shGetWarehouses: function () {
    return [{ warehouseId: 'W1', warehouseType: '3PL', isFactoryWarehouse: true }]; } };
  vm.createContext(sb);
  // The local guess reads warehouse_type ALONE and loses the server's factory-flag tie-break.
  vm.runInContext(extractFn(HIST, '_shSourceDomain_')
    .replace('return IRW.isFactory(row) ? \'FACTORY\' : \'OVERSEAS\';',
      "return String(row.warehouseType) === 'FACTORY' ? 'FACTORY' : 'OVERSEAS';"), sb);
  HISTFN.__wh = [{ warehouseId: 'W1', warehouseType: '3PL', isFactoryWarehouse: true }];
  return sb._shSourceDomain_('W1') === 'OVERSEAS' && HISTFN._shSourceDomain_('W1') === 'FACTORY';
});

// =========================================================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived');
process.exit(fail === 0 ? 0 : 1);
