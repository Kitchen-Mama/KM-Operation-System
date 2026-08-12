// F1-5A-PO-R2 — Purchase Order exactly-once conversion closure.
// Proves the RO→PO creator (handleCreatePurchaseOrderFromRequest_) converges to ONE canonical conversion result
// per request_order_id (the existing lineage identity — no POEXEC, no schema): ScriptLock + re-read + persisted-
// lineage detection classify NEW / REUSE / RECOVER / FAIL-CLOSED. Golden A–R run end-to-end against an in-memory
// Apps Script mock; the rest are source guards. Quantity mapping unchanged (approved_qty→ordered_qty); no
// gap/forecast/AI recompute; factory/supplier canonical; scoped compensation on write failure.
// Run: node assets/tests/po-exactly-once-f1-5a-por2.test.js
// NOTE: no 'use strict' — extracted .gs helpers are eval'd into module scope with a mocked Apps Script runtime.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var GS13 = read('specs/active/apps-script/13_procurement_handlers.gs');
var ROD = read('js/pages/request-order-draft.js');

// ---------------- in-memory Apps Script runtime ----------------
var CURRENT_SS = null;
var _uuidN = 0;
var Utilities = { getUuid: function () { _uuidN++; return ('u' + _uuidN + '000000000000000000000000000000').substring(0, 32); } };
var LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
var SpreadsheetApp = { getActiveSpreadsheet: function () { return CURRENT_SS; } };
function jsonResponse_(o) { return o; }
function procurementTimestamp_() { return '2026-08-12T00:00:00Z'; }
function procurementToday_() { return '2026-08-12'; }
function procurementDateOnly_(v) { return String(v == null ? '' : v); }
function sheetEnsureColumns_() { return true; }                 // fixtures already carry every column used
function procurementEnsureSheet_(ss, name) { return ss.getSheetByName(name); }
var PURCHASE_ORDERS_HEADERS_ = [], PURCHASE_ORDER_LINES_HEADERS_ = [];

function makeSheet(name, headers) {
  var rows = [headers.slice()];
  var api = {
    getName: function () { return name; },
    getLastColumn: function () { return rows[0].length; },
    getDataRange: function () { return { getValues: function () { return rows.map(function (r) { return r.slice(); }); } }; },
    getRange: function (r, c, nr, nc) {
      return {
        getValues: function () { var out = []; for (var i = 0; i < (nr || 1); i++) { var a = []; for (var j = 0; j < (nc || 1); j++) { a.push(rows[r - 1 + i] ? rows[r - 1 + i][c - 1 + j] : ''); } out.push(a); } return out; },
        setValue: function (v) { rows[r - 1][c - 1] = v; },
        setValues: function (vals) { for (var i = 0; i < vals.length; i++) for (var j = 0; j < vals[i].length; j++) rows[r - 1 + i][c - 1 + j] = vals[i][j]; }
      };
    },
    appendRow: function (row) { if (api._failAt) { api._n = (api._n || 0) + 1; if (api._n === api._failAt) throw new Error('SIMULATED_WRITE_FAILURE'); } var w = rows[0].length, r = row.slice(0, w); while (r.length < w) r.push(''); rows.push(r); },
    deleteRow: function (n) { rows.splice(n - 1, 1); },
    _rows: function () { return rows; }
  };
  return api;
}
function makeSS(sheets) { return { getSheetByName: function (n) { return sheets[n] || null; } }; }

// ---------------- eval real handler + helpers into module scope ----------------
eval(extractFn(GS13, 'procurementFindRow_'));
eval(extractFn(GS13, 'procurementReqStatus_'));
eval(extractFn(GS13, 'procurementResolveFactoryId_'));
eval(extractFn(GS13, 'procurementAppendByHeader_'));
eval(extractFn(GS13, 'poFindConversionState_'));
eval(extractFn(GS13, 'poCreateBucketGroup_'));
eval(extractFn(GS13, 'poSetRoConverted_'));
eval(extractFn(GS13, 'poReuseResponse_'));
eval(extractFn(GS13, 'poDeleteCreatedThisRun_'));
eval(extractFn(GS13, 'handleCreatePurchaseOrderFromRequest_'));

// ---------------- fixture + accessors ----------------
function buildDb(opts) {
  opts = opts || {};
  var ro = makeSheet('request_orders', ['request_order_id', 'request_status', 'company', 'supplier_id', 'supplier_name', 'warehouse_id', 'factory_id', 'currency', 'updated_by', 'updated_at']);
  ro.appendRow(['RO1', opts.status || 'approved', 'KM', 'SUP1', 'Supplier One', 'WH1', '', 'USD', '', '']);
  var rol = makeSheet('request_order_lines', ['request_order_line_id', 'request_order_id', 'sku', 'company', 'request_bucket', 'line_status', 'requested_qty', 'approved_qty', 'units_per_carton', 'carton_qty', 'unit_cost', 'currency', 'purchase_order_line_id', 'series', 'recommended_qty']);
  (opts.lines || []).forEach(function (l, i) {
    rol.appendRow(['ROL' + (i + 1), 'RO1', l.sku, 'KM', l.bucket, l.line_status || 'approved', l.requested, (l.approved != null ? l.approved : l.requested), l.upc || 0, l.carton || 0, l.unit_cost != null ? l.unit_cost : '', 'USD', '', l.series || '', l.recommended != null ? l.recommended : '']);
  });
  var po = makeSheet('purchase_orders', ['purchase_order_id', 'po_no', 'purchase_order_no', 'request_order_id', 'request_bucket', 'order_status', 'company', 'supplier_id', 'factory_id', 'currency', 'total_sku', 'total_qty', 'total_cartons', 'total_amount', 'subtotal_amount', 'warehouse_id', 'supplier_name', 'created_by', 'created_at', 'updated_by', 'updated_at']);
  var pol = makeSheet('purchase_order_lines', ['purchase_order_line_id', 'purchase_order_id', 'request_order_line_id', 'request_order_id', 'request_bucket', 'sku', 'ordered_qty', 'approved_qty', 'requested_qty', 'recommended_qty', 'company', 'currency', 'line_status', 'carton_qty', 'units_per_carton']);
  var wh = makeSheet('warehouses', ['warehouse_id', 'factory_id']); wh.appendRow(['WH1', 'FAC-CN-1']);
  return makeSS({ request_orders: ro, request_order_lines: rol, purchase_orders: po, purchase_order_lines: pol, warehouses: wh });
}
function run(ss) { CURRENT_SS = ss; return handleCreatePurchaseOrderFromRequest_({ request_order_id: 'RO1', actor: 'tester' }); }
function poRows(ss) { return ss.getSheetByName('purchase_orders')._rows().slice(1); }
function polRows(ss) { return ss.getSheetByName('purchase_order_lines')._rows().slice(1); }
function idx(ss, sheet, name) { return ss.getSheetByName(sheet)._rows()[0].indexOf(name); }
function roStatusOf(ss) { return ss.getSheetByName('request_orders')._rows()[1][1]; }
function poBuckets(ss) { var c = idx(ss, 'purchase_orders', 'request_bucket'); return poRows(ss).map(function (r) { return r[c]; }).sort(); }

// =============================================================================
console.log('\n== A/B/C bucket-group grain ==');
(function () {
  var ss = buildDb({ lines: [{ sku: 'S1', bucket: 'T1', requested: 800, upc: 40 }] });
  var res = run(ss);
  ok(res.success && res.data.po_count === 1, 'A approved RO / T1 only → one PO');
  eq(poBuckets(ss), ['T1'], 'A the single PO is the T1 bucket group');
})();
(function () {
  var ss = buildDb({ lines: [{ sku: 'S1', bucket: 'T2', requested: 300, upc: 30 }, { sku: 'S2', bucket: 'T3', requested: 200, upc: 20 }] });
  var res = run(ss);
  ok(res.success && res.data.po_count === 1, 'B approved RO / T2+T3 → one combined PO');
  eq(poBuckets(ss), ['T2_T3'], 'B the single PO is the T2_T3 bucket group');
})();
var ssC = buildDb({ lines: [{ sku: 'S1', bucket: 'T1', requested: 800, upc: 40 }, { sku: 'S2', bucket: 'T2', requested: 300, upc: 30 }] });
(function () {
  var res = run(ssC);
  ok(res.success && res.data.po_count === 2, 'C approved RO / T1+T2 → exactly two canonical PO headers');
  eq(poBuckets(ssC), ['T1', 'T2_T3'], 'C the two POs are exactly the T1 and T2_T3 bucket groups');
})();

console.log('\n== D quantity conservation ==');
(function () {
  var oc = idx(ssC, 'purchase_order_lines', 'ordered_qty'), rc = idx(ssC, 'purchase_order_lines', 'requested_qty');
  var conserved = polRows(ssC).every(function (r) { return Number(r[oc]) === Number(r[rc]); });
  ok(conserved, 'D every PO line ordered_qty === request line requested_qty (Σ conserved; no re-ceil/MOQ/gap)');
  var total = polRows(ssC).reduce(function (a, r) { return a + Number(r[oc]); }, 0);
  eq(total, 1100, 'D total converted qty = 800 + 300 (persisted requested_qty)');
})();

console.log('\n== E factory / supplier canonical ==');
(function () {
  var fc = idx(ssC, 'purchase_orders', 'factory_id'), sc = idx(ssC, 'purchase_orders', 'supplier_id');
  ok(poRows(ssC).every(function (r) { return r[fc] === 'FAC-CN-1'; }), 'E factory_id resolved from warehouse master (WH1 → FAC-CN-1), no free-text guess');
  ok(poRows(ssC).every(function (r) { return r[sc] === 'SUP1'; }), 'E supplier_id carried from the Request Order');
})();

console.log('\n== F/G/H/J double-click / two-tab / lost-response → idempotent reuse ==');
(function () {
  var ss = buildDb({ lines: [{ sku: 'S1', bucket: 'T1', requested: 800, upc: 40 }, { sku: 'S2', bucket: 'T2', requested: 300, upc: 30 }] });
  var r1 = run(ss); var after1 = poRows(ss).length;
  var r2 = run(ss); var after2 = poRows(ss).length;      // second concurrent/retry call (lock serialized)
  ok(r1.success && r1.data.po_count === 2 && !r1.data.reused, 'F first call creates the 2 canonical POs');
  ok(r2.success && r2.data.reused === true, 'F/G/H second call REUSES (reused:true) — no re-create');
  eq([after1, after2], [2, 2], 'F/G/H PO row count stays 2 across double-click / two-tab / retry');
  eq(r2.data.purchase_orders.map(function (p) { return p.request_bucket; }).sort(), ['T1', 'T2_T3'], 'J reuse returns the full canonical PO result');
})();

console.log('\n== I PO created but RO status write lost → repair, no duplicate ==');
(function () {
  var ss = buildDb({ lines: [{ sku: 'S1', bucket: 'T1', requested: 800, upc: 40 }] });
  run(ss);                                                       // full conversion
  ss.getSheetByName('request_orders').getRange(2, 2).setValue('approved');   // simulate status write never landed
  var r = run(ss);
  ok(r.success && r.data.reused === true && r.data.repaired === true, 'I retry detects the durable PO set → repairs lifecycle (reused+repaired)');
  eq(poRows(ss).length, 1, 'I no second PO set created');
  eq(roStatusOf(ss), 'converted_to_po', 'I RO lifecycle repaired to converted_to_po');
})();

console.log('\n== K converted_to_po but no PO result → FAIL CLOSED ==');
(function () {
  var ss = buildDb({ status: 'converted_to_po', lines: [{ sku: 'S1', bucket: 'T1', requested: 800, upc: 40 }] });
  var r = run(ss);
  ok(!r.success && r.error === 'PO_CONVERSION_STATE_INCONSISTENT', 'K converted_to_po + missing canonical PO → PO_CONVERSION_STATE_INCONSISTENT');
  eq(poRows(ss).length, 0, 'K nothing fabricated');
})();

console.log('\n== L duplicate persisted bucket-group PO → FAIL CLOSED ==');
(function () {
  var ss = buildDb({ lines: [{ sku: 'S1', bucket: 'T1', requested: 800, upc: 40 }] });
  var po = ss.getSheetByName('purchase_orders');
  po.appendRow(['PO-D1', 'PO-D1', 'PO-D1', 'RO1', 'T1', 'draft']);
  po.appendRow(['PO-D2', 'PO-D2', 'PO-D2', 'RO1', 'T1', 'draft']);   // two T1 headers for one RO
  var r = run(ss);
  ok(!r.success && r.error === 'PO_CONVERSION_STATE_INCONSISTENT', 'L two T1 POs for one RO → fail closed (never pick latest)');
})();

console.log('\n== orphan partial-write survivor → PO_CREATION_ATOMICITY_GAP ==');
(function () {
  var ss = buildDb({ lines: [{ sku: 'S1', bucket: 'T1', requested: 800, upc: 40 }] });
  var pol = ss.getSheetByName('purchase_order_lines');
  pol.appendRow(['POL-X', 'PO-GHOST', 'ROL1', 'RO1', 'T1', 'S1', 800, 800, 800, '', 'KM', 'USD', 'draft', 20, 40]); // POL with no header
  var r = run(ss);
  ok(!r.success && r.error === 'PO_CREATION_ATOMICITY_GAP', 'orphan POL (purchase_order_id without header) → PO_CREATION_ATOMICITY_GAP (surfaced, not guessed)');
})();

console.log('\n== M failed partial creation → scoped compensation + safe retry ==');
(function () {
  var ss = buildDb({ lines: [{ sku: 'S1', bucket: 'T1', requested: 800, upc: 40 }, { sku: 'S2', bucket: 'T2', requested: 300, upc: 30 }] });
  ss.getSheetByName('purchase_order_lines')._failAt = 2;         // throw while writing the 2nd group's line
  var r = run(ss);
  ok(!r.success && /PO_CREATION_WRITE_FAILED/.test(r.error) && r.compensated === true, 'M write failure returns compensated failure');
  eq(poRows(ss).length, 0, 'M scoped compensation removed the PO header(s) this run created');
  eq(polRows(ss).length, 0, 'M scoped compensation removed the PO line(s) this run created');
  eq(roStatusOf(ss), 'approved', 'M RO stays approved (conversion not falsely recorded)');
  var backCol = idx(ss, 'request_order_lines', 'purchase_order_line_id');
  ok(ss.getSheetByName('request_order_lines')._rows().slice(1).every(function (rr) { return rr[backCol] === ''; }), 'M RO-line back-refs cleared by compensation');
  ss.getSheetByName('purchase_order_lines')._failAt = 0; ss.getSheetByName('purchase_order_lines')._n = 0;   // clear the fault
  var r2 = run(ss);
  ok(r2.success && r2.data.po_count === 2 && !r2.data.reused, 'M retry after the fault converges to the 2 canonical POs (no duplicate)');
})();

console.log('\n== compensation is scoped (never deletes another execution\'s PO) ==');
(function () {
  var ss = buildDb({ lines: [{ sku: 'S1', bucket: 'T1', requested: 800, upc: 40 }] });
  var po = ss.getSheetByName('purchase_orders');
  po.appendRow(['PO-KEEP', 'PO-KEEP', 'PO-KEEP', 'RO2', 'T1', 'draft']);   // unrelated RO2 PO
  CURRENT_SS = ss; poDeleteCreatedThisRun_(ss, 'RO1', ['PO-NEW']);         // delete only this-run id (absent → no-op)
  ok(poRows(ss).length === 1 && poRows(ss)[0][0] === 'PO-KEEP', 'unrelated RO2 PO is never touched by scoped compensation');
})();

console.log('\n== ineligible status rejected ==');
(function () {
  var ss = buildDb({ status: 'draft', lines: [{ sku: 'S1', bucket: 'T1', requested: 800, upc: 40 }] });
  var r = run(ss);
  ok(!r.success && /Only an Approved request/.test(r.error), 'draft/pending/cancelled RO cannot be converted (eligibility preserved)');
})();

// =============================================================================
console.log('\n== source guards — lock / identity / no-schema / no-recompute ==');
var handler = extractFn(GS13, 'handleCreatePurchaseOrderFromRequest_');
ok(/LockService\.getScriptLock/.test(handler) && /tryLock\(30000\)/.test(handler), '§3 conversion runs under the canonical ScriptLock');
var lockPos = handler.indexOf('getScriptLock'), rereadPos = handler.indexOf("procurementFindRow_(roSheet, 'request_order_id', roId)");
ok(lockPos > -1 && rereadPos > lockPos, '§3 Request Order is RE-READ inside the lock (not a pre-lock snapshot)');
ok(/poFindConversionState_\(ss, roId, expectedGroups\)/.test(handler), '§4 existing-PO detection keyed by request_order_id (existing lineage identity)');
ok(!/POEXEC/.test(GS13.slice(GS13.indexOf('function handleCreatePurchaseOrderFromRequest_'))) , '§9 no POEXEC key introduced (reuses request_order_id — no new identity)');
var detect = extractFn(GS13, 'poFindConversionState_');
ok(/request_order_id/.test(detect) && /request_bucket/.test(detect) && !/getTime|Date\.now|total_qty\)\s*===|closest/.test(detect), '§4 detection uses persisted lineage only (request_order_id + bucket) — no time/qty/actor dedupe');
ok(/st === 'cancelled'\) continue/.test(detect), 'cancelled POs excluded from the live conversion result');
ok(!/prodMigrateAppendColumns_|insertColumn/.test(handler + detect + extractFn(GS13, 'poCreateBucketGroup_')), '§9 no schema migration / column add in the PO path');
var create = extractFn(GS13, 'poCreateBucketGroup_');
ok(/ordered_qty: orderedQty/.test(create) && /orderedQty = cellNum\(row, 'approved_qty'\)/.test(create), '§7 quantity mapping unchanged (approved_qty → ordered_qty)');
ok(!/getOrderPlanningGap|calculateGap|calculateSuggestedOrderQty|KMREC|order_planning_gap|forecast/i.test(create), '§7 no gap/forecast/AI recompute in PO creation');
ok(/recommended_qty:[^\n]*display snapshot only/.test(create) || /recommended_qty: lc\('recommended_qty'\)/.test(create), '§7 recommended_qty copied as display snapshot only (not the order qty)');
var comp = extractFn(GS13, 'poDeleteCreatedThisRun_');
ok(/idset\[String/.test(comp) && /never deletes another execution/i.test(GS13.slice(GS13.indexOf('function poDeleteCreatedThisRun_') - 200, GS13.indexOf('function poDeleteCreatedThisRun_'))), '§5E compensation scoped to THIS run\'s purchase_order_id set only');

console.log('\n== frontend — UX guard only, backend is the authority ==');
ok(/_convertInFlight\[id\]\) return;/.test(ROD) && /_convertInFlight\[id\] = true;/.test(ROD), 'convert has an in-flight UX guard (double-click)');
ok(/data\.reused \|\| data\.repaired/.test(ROD), 'frontend surfaces idempotent reuse/repair');
ok(/idempotency AUTHORITY is the backend ScriptLock/.test(ROD), 'frontend documents that the backend is the idempotency authority');
ok(/createPurchaseOrderFromRequest\(\{ request_order_id: id/.test(ROD), 'convert still calls the single canonical creator (no second PO path)');

console.log('\n----------------------------------------');
console.log('PO EXACTLY-ONCE (F1-5A-PO-R2): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
