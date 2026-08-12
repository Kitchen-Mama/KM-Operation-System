// F1-5B-SHIP-R3B — Confirm & Dispatch → canonical PO allocation execution.
// Proves: draft→executed only at dispatch; purchase_order_lines.shipped_qty = Σ executed allocated_qty
// (reconciliation SET, never +=); remaining = max(0, completed − shipped); fail-closed on missing/mismatch
// allocation, capacity change, and legacy shipped_qty drift; idempotent (retry cannot double-consume); ordered/
// completed/shipment_qty never rewritten; no second FIFO in dispatch. Pure execution helpers eval'd against an
// in-memory sheet mock; the dispatch wiring is source-guarded.
// Run: node assets/tests/shipment-dispatch-po-execution-f1-5b-ship-r3b.test.js
// NOTE: no 'use strict' — extracted helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var GS = read('specs/active/apps-script/32_shipment_line_allocation_handlers.gs');
var DISP = read('specs/active/apps-script/22_shipment_dispatch_handlers.gs');

eval(slice(GS, '// __SLA_PURE_START__', '// __SLA_PURE_END__'));   // slaStr_/slaNum_/slaLc_ …
eval(extractFn(GS, 'slaPrepareExecution_'));
eval(extractFn(GS, 'slaApplyExecution_'));

// ---- in-memory sheet mock ----
function makeSheet(headers, rows) {
  var data = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  return {
    getDataRange: function () { return { getValues: function () { return data.map(function (r) { return r.slice(); }); } }; },
    getRange: function (r, c) { return { getValue: function () { return data[r - 1][c - 1]; }, setValue: function (v) { data[r - 1][c - 1] = v; } }; },
    _data: function () { return data; }
  };
}
function makeSS(sheets) { return { getSheetByName: function (n) { return sheets[n] || null; } }; }

var SL_H = ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty'];
var SLA_H = ['shipment_line_allocation_id', 'shipment_line_id', 'purchase_order_line_id', 'sku', 'allocated_qty', 'shipped_qty', 'allocation_status', 'created_by', 'created_at', 'updated_at', 'released_by', 'released_at', 'release_reason', 'note'];
var POL_H = ['purchase_order_line_id', 'completed_qty', 'shipped_qty', 'remaining_qty'];
function sla(id, line, pol, qty, status) { return ['SLA-' + id, line, pol, 'GA0450', qty, '', status, 'u', '', '', '', '', '', '']; }
function polRow(id, completed, shipped, remaining) { return [id, completed, shipped, remaining]; }
function db(o) {
  return makeSS({ shipment_lines: makeSheet(SL_H, o.lines), shipment_line_allocations: makeSheet(SLA_H, o.alloc), purchase_order_lines: makeSheet(POL_H, o.pol) });
}
function col(ss, sheet, name) { return ss.getSheetByName(sheet)._data()[0].indexOf(name); }
function polVal(ss, polId, field) { var d = ss.getSheetByName('purchase_order_lines')._data(); var idc = 0, fc = d[0].indexOf(field); for (var i = 1; i < d.length; i++) if (String(d[i][idc]) === polId) return d[i][fc]; return null; }
function allocStatuses(ss) { var d = ss.getSheetByName('shipment_line_allocations')._data(); var sc = d[0].indexOf('allocation_status'); return d.slice(1).map(function (r) { return r[sc]; }); }
function execute(ss, shipmentId) { var plan = slaPrepareExecution_(ss, shipmentId); if (!plan.ok) return plan; slaApplyExecution_(ss, plan, 'tester', '2026-08-12T00:00:00Z', []); return { ok: true, plan: plan }; }

console.log('\n== A single PO execution ==');
(function () {
  var ss = db({ lines: [['L1', 'SHP1', 'GA0450', 600]], alloc: [sla('1', 'L1', 'P1', 600, 'draft')], pol: [polRow('P1', 1000, 0, 1000)] });
  var r = execute(ss, 'SHP1');
  ok(r.ok && polVal(ss, 'P1', 'shipped_qty') === 600, 'A P1 shipped_qty = 600 after dispatch');
  ok(polVal(ss, 'P1', 'remaining_qty') === 400, 'A remaining = completed 1000 − shipped 600 = 400');
  ok(allocStatuses(ss).join() === 'executed', 'A allocation flipped draft→executed'); })();

console.log('\n== B multi-PO execution ==');
(function () {
  var ss = db({ lines: [['L1', 'SHP1', 'GA0450', 600]], alloc: [sla('1', 'L1', 'P1', 300, 'draft'), sla('2', 'L1', 'P2', 300, 'draft')], pol: [polRow('P1', 300, 0, 300), polRow('P2', 500, 0, 500)] });
  execute(ss, 'SHP1');
  ok(polVal(ss, 'P1', 'shipped_qty') === 300 && polVal(ss, 'P2', 'shipped_qty') === 300, 'B P1=300, P2=300 executed');
  ok(polVal(ss, 'P1', 'remaining_qty') === 0 && polVal(ss, 'P2', 'remaining_qty') === 200, 'B remaining P1=0, P2=200'); })();

console.log('\n== C existing executed allocation (other shipment) reconciles cumulatively ==');
(function () {
  var ss = db({ lines: [['L2', 'SHP2', 'GA0450', 400]],
    alloc: [sla('X', 'L-OTHER', 'P1', 300, 'executed'), sla('2', 'L2', 'P1', 400, 'draft')],
    pol: [polRow('P1', 1000, 300, 700)] });
  execute(ss, 'SHP2');
  ok(polVal(ss, 'P1', 'shipped_qty') === 700, 'C shipped = 300 (existing executed) + 400 (new) = 700 via reconciliation');
  ok(polVal(ss, 'P1', 'remaining_qty') === 300, 'C remaining = 1000 − 700 = 300'); })();

console.log('\n== D/F retry idempotent (no double-consume) ==');
(function () {
  var ss = db({ lines: [['L1', 'SHP1', 'GA0450', 600]], alloc: [sla('1', 'L1', 'P1', 600, 'draft')], pol: [polRow('P1', 1000, 0, 1000)] });
  execute(ss, 'SHP1');
  execute(ss, 'SHP1');   // retry / lost-response
  ok(polVal(ss, 'P1', 'shipped_qty') === 600, 'D re-executing yields the SAME shipped_qty (reconciliation, not +=)');
  ok(allocStatuses(ss).filter(function (s) { return s === 'executed'; }).length === 1, 'D still one executed allocation (no duplication)'); })();

console.log('\n== G missing allocation ==');
(function () {
  var ss = db({ lines: [['L1', 'SHP1', 'GA0450', 600]], alloc: [], pol: [polRow('P1', 1000, 0, 1000)] });
  var r = slaPrepareExecution_(ss, 'SHP1');
  ok(!r.ok && r.error === 'SHIPMENT_PO_ALLOCATION_MISSING', 'G shipment_qty>0 with no draft allocation → SHIPMENT_PO_ALLOCATION_MISSING'); })();

console.log('\n== H qty mismatch ==');
(function () {
  var ss = db({ lines: [['L1', 'SHP1', 'GA0450', 600]], alloc: [sla('1', 'L1', 'P1', 500, 'draft')], pol: [polRow('P1', 1000, 0, 1000)] });
  var r = slaPrepareExecution_(ss, 'SHP1');
  ok(!r.ok && r.error === 'SHIPMENT_PO_ALLOCATION_QTY_MISMATCH', 'H alloc 500 ≠ shipment 600 → SHIPMENT_PO_ALLOCATION_QTY_MISMATCH'); })();

console.log('\n== I capacity changed before dispatch → fail closed ==');
(function () {
  // draft allocated 600 but completed dropped to 400 (or other executed reduced availability)
  var ss = db({ lines: [['L1', 'SHP1', 'GA0450', 600]], alloc: [sla('1', 'L1', 'P1', 600, 'draft')], pol: [polRow('P1', 400, 0, 400)] });
  var r = slaPrepareExecution_(ss, 'SHP1');
  ok(!r.ok && r.error === 'PO_CAPACITY_CHANGED_BEFORE_DISPATCH', 'I would-be-shipped 600 > completed 400 → PO_CAPACITY_CHANGED_BEFORE_DISPATCH');
  ok(polVal(ss, 'P1', 'shipped_qty') === 0, 'I no partial execution (shipped stays 0)'); })();

console.log('\n== J/K conservation + remaining ==');
(function () {
  var ss = db({ lines: [['L1', 'SHP1', 'GA0450', 700]], alloc: [sla('1', 'L1', 'P1', 700, 'draft')], pol: [polRow('P1', 1000, 0, 1000)] });
  execute(ss, 'SHP1');
  ok(polVal(ss, 'P1', 'shipped_qty') === 700 && polVal(ss, 'P1', 'remaining_qty') === 300, 'K completed 1000, executed 700 → shipped 700, remaining 300');
  ok(polVal(ss, 'P1', 'shipped_qty') === 700, 'J PO shipped = Σ executed allocation for that PO line'); })();

console.log('\n== L/M/N ordered/completed/shipment_qty untouched ==');
(function () {
  var ss = db({ lines: [['L1', 'SHP1', 'GA0450', 600]], alloc: [sla('1', 'L1', 'P1', 600, 'draft')], pol: [polRow('P1', 1000, 0, 1000)] });
  var beforeLines = JSON.stringify(ss.getSheetByName('shipment_lines')._data());
  execute(ss, 'SHP1');
  ok(polVal(ss, 'P1', 'completed_qty') === 1000, 'M completed_qty unchanged (1000)');
  ok(JSON.stringify(ss.getSheetByName('shipment_lines')._data()) === beforeLines, 'N shipment_lines (physical qty) never rewritten by execution');
  // ordered_qty is not even a column the execution path touches (PO ordered stays in 13_ create only)
  ok(!/ordered_qty/.test(extractFn(GS, 'slaApplyExecution_')) && !/ordered_qty/.test(extractFn(GS, 'slaPrepareExecution_')), 'L execution never reads/writes ordered_qty'); })();

console.log('\n== S legacy shipped_qty drift → fail closed ==');
(function () {
  var ss = db({ lines: [['L1', 'SHP1', 'GA0450', 400]], alloc: [sla('1', 'L1', 'P1', 400, 'draft')], pol: [polRow('P1', 1000, 500, 500)] });
  var r = slaPrepareExecution_(ss, 'SHP1');
  ok(!r.ok && r.error === 'PO_SHIPPED_QTY_LEGACY_BASELINE_UNRESOLVED', 'S PO shipped_qty=500 with no executed lineage → PO_SHIPPED_QTY_LEGACY_BASELINE_UNRESOLVED (never reset/backfill)'); })();

console.log('\n== shipped_qty is reconciliation SET, never += ==');
ok(/setValue\(rc\.newShipped\)/.test(extractFn(GS, 'slaApplyExecution_')) && !/shipped[\s\S]{0,10}\+=/.test(GS), 'shipped_qty SET = Σ executed (no incremental += anywhere)');
ok(/newShipped = others \+ thisByPol/.test(extractFn(GS, 'slaPrepareExecution_')), 'reconciliation = other-executed + this shipment consumption (canonical formula)');

console.log('\n== T / §14 no second FIFO, no nested lock, single authority ==');
var prep = extractFn(GS, 'slaPrepareExecution_'), applyFn = extractFn(GS, 'slaApplyExecution_');
ok(!/order_date|po_no|\.sort\(/.test(prep) && !/order_date|po_no|\.sort\(/.test(applyFn), 'T dispatch execution contains NO FIFO sorter (order_date/po_no/sort) — one FIFO authority (R3A)');
ok(!/getScriptLock|LockService/.test(prep) && !/getScriptLock|LockService/.test(applyFn), '§11 execution helpers take NO lock (run inside the existing dispatch ScriptLock — no nesting)');

console.log('\n== dispatch wiring (22_) — reuses the same lock + rollback boundary ==');
var CSD = extractFn(DISP, 'handleConfirmShipmentAndDispatch_');
ok(/slaPrepareExecution_\(ss, shipmentId\)/.test(CSD), 'validation calls the R3A/R3B allocation authority BEFORE writes');
ok(/lock\.releaseLock\(\);\s*return jsonResponse_\(\{ success: false, error: slaPlan\.error/.test(CSD.replace(/\n\s*/g, ' ')), 'fail-closed dispatch on allocation error (no partial dispatch)');
ok(/slaApplyExecution_\(ss, slaPlan, actor, now, rollback\)/.test(CSD), 'execution runs inside the staged-write block under the SAME rollback stack (all-or-nothing)');
ok(/already_confirmed: true/.test(CSD), '§10 existing dispatch idempotency pre-check preserved (retry short-circuits before re-execution)');
ok(/factory_stock/.test(DISP) || /csdLoadFactoryStock_/.test(CSD), '§12 existing factory_stock deduction preserved (separate ledger, same boundary)');
ok(!/order_date|po_no|slaFifoCompare_/.test(CSD), '§14 no FIFO logic added inside 22_ (dispatch does not re-run FIFO)');

console.log('\n----------------------------------------');
console.log('SHIPMENT DISPATCH PO EXECUTION (F1-5B-SHIP-R3B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
