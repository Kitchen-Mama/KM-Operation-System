// Kitchen Mama Operation System — F1-7E-PREREQ-1-OPEN-PO-REMAINING-SCOPED-OWNER-R1
// GOLD-STANDARD equivalence: the NEW backend 52_ oprBuild_ (raw open_po_remaining_raw_qty per SKU) MUST equal the
// CURRENT AI-Plan browser fact — request-order.js `ongoing()` — for the same fixture. We run the ACTUAL browser
// ongoing() (extracted) on records produced by the ACTUAL db-api normalizers, and the ACTUAL backend builder on the
// raw rows, and assert equality (browser null == backend 0). Transport migration: BEFORE FACT == AFTER FACT.
// Run: node assets/tests/api-open-po-remaining-owner-f1-7e-prereq1-r1.test.js
// NOTE: no 'use strict' — extracted functions bind into module scope via direct eval.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }
// balanced-brace extractor for `function NAME(...) { ... }`
function extractFn(src, name) {
  var sig = 'function ' + name + '(';
  var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}
function extractVar(src, re) { var m = src.match(re); if (!m) throw new Error('var not found: ' + re); return m[0]; }

var GS52 = read('specs/active/apps-script/52_api_v1_open_po_remaining_owner.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var ROJS = read('js/pages/request-order.js');
var GS50 = read('specs/active/apps-script/50_api_v1_purchase_order_workspace.gs');

// ---- eval the NEW backend (whole 52_; impure prod*/SpreadsheetApp refs live inside oprDefaultIo_, only resolved when CALLED) ----
eval(GS52);

// ---- eval the REAL db-api PO normalizers (the browser's input path) ----
eval(extractFn(DBAPI, 'normalizePurchaseOrderRecord'));
eval(extractFn(DBAPI, 'normalizePurchaseOrderLineRecord'));

// ---- eval the REAL browser semantics from request-order.js: _roUpper/_roLower + RO_OPEN_PO_STATUS + ongoing ----
var poById, poLinesBySku;   // ongoing() closes over these (reassigned per fixture)
eval(extractFn(ROJS, '_roUpper'));
eval(extractFn(ROJS, '_roLower'));
eval(extractVar(ROJS, /var RO_OPEN_PO_STATUS = \{[^}]*\};/));
eval(extractFn(ROJS, 'ongoing'));

// ---- §9 frozen OPEN-PO status set matches the source (no OPEN_PO_STATUS_CONTRACT_MISMATCH) ----
console.log('\n== frozen OPEN-PO status set == request-order.js RO_OPEN_PO_STATUS ==');
eq(Object.keys(OPR_OPEN_STATUS_).sort(), Object.keys(RO_OPEN_PO_STATUS).sort(), 'OPEN status set identical to source');
eq(Object.keys(OPR_OPEN_STATUS_).sort(), ['confirmed', 'in_production', 'issued', 'partial_completed', 'partial_shipped', 'ready_to_ship'], 'OPEN status set is the frozen six');

// ---- the equivalence harness: OLD browser ongoing() vs NEW backend, on the SAME raw fixture ----
// oldFact(sku) = the browser fact via the REAL normalizers + REAL ongoing(); newFact = backend on raw rows.
function runEquiv(label, rawPos, rawLines, skus) {
  var normPos = rawPos.map(normalizePurchaseOrderRecord);
  var normLines = rawLines.map(normalizePurchaseOrderLineRecord);
  poById = {}; normPos.forEach(function (p) { poById[p.purchaseOrderId] = p; });                 // last-wins (as source)
  poLinesBySku = {}; normLines.forEach(function (l) { (poLinesBySku[_roUpper(l.sku)] = poLinesBySku[_roUpper(l.sku)] || []).push(l); });
  var vm = oprBuild_({ purchase_orders: rawPos, purchase_order_lines: rawLines }, { skus: skus });
  var newBySku = {}; vm.items.forEach(function (it) { newBySku[String(it.sku).toUpperCase()] = it.openPoRemainingRawQty; });
  skus.forEach(function (sku) {
    var oldV = ongoing(sku);                       // browser: null | positive
    var expected = (oldV === null ? 0 : oldV);     // ZERO contract: browser null (no OPEN-PO contribution) == backend 0
    var got = newBySku[String(sku).toUpperCase()];
    eq(got, expected, label + ' :: sku ' + sku + ' (browser ' + JSON.stringify(oldV) + ' -> ' + expected + ')');
  });
}

console.log('\n== BEFORE == AFTER equivalence fixtures ==');
// 1 persisted remaining present; 2 blank -> fallback; 5 shipped<completed; 6 shipped>completed; 3 multi OPEN same SKU
runEquiv('persisted+blank+multi', [
  { purchase_order_id: 'PO-1', order_status: 'in_production' },
  { purchase_order_id: 'PO-2', order_status: 'issued' }
], [
  { purchase_order_id: 'PO-1', sku: 'GA0450', ordered_qty: 500, completed_qty: 300, shipped_qty: 100, remaining_qty: 400 }, // persisted 400
  { purchase_order_id: 'PO-1', sku: 'GA0450', ordered_qty: 200, completed_qty: 150, shipped_qty: 40, remaining_qty: '' },    // blank -> max(0,200-max(40,150))=50
  { purchase_order_id: 'PO-2', sku: 'GA0450', ordered_qty: 100, completed_qty: 100, shipped_qty: 120, remaining_qty: '' }    // shipped>completed -> max(0,100-max(120,100))=0
], ['GA0450']);   // browser: 400 + 50 (+0 not added) = 450

// 4 mixture OPEN + CLOSED (closed excluded); 13 cancelled excluded
runEquiv('open+closed+cancelled', [
  { purchase_order_id: 'PO-A', order_status: 'in_production' },
  { purchase_order_id: 'PO-B', order_status: 'completed' },
  { purchase_order_id: 'PO-C', order_status: 'cancelled' },
  { purchase_order_id: 'PO-D', order_status: 'closure' }
], [
  { purchase_order_id: 'PO-A', sku: 'SKU9', ordered_qty: 300, completed_qty: 0, shipped_qty: 0, remaining_qty: 300 },   // OPEN 300
  { purchase_order_id: 'PO-B', sku: 'SKU9', ordered_qty: 900, completed_qty: 0, shipped_qty: 0, remaining_qty: 900 },   // completed -> excluded
  { purchase_order_id: 'PO-C', sku: 'SKU9', ordered_qty: 700, completed_qty: 0, shipped_qty: 0, remaining_qty: 700 },   // cancelled -> excluded
  { purchase_order_id: 'PO-D', sku: 'SKU9', ordered_qty: 500, completed_qty: 0, shipped_qty: 0, remaining_qty: 500 }    // closure -> excluded
], ['SKU9']);   // browser: 300

// 7 boundary values; 8 zero; 12 no matching PO / unknown SKU
runEquiv('boundary+zero+unknown', [
  { purchase_order_id: 'PO-Z', order_status: 'ready_to_ship' },
  { purchase_order_id: 'PO-Y', order_status: 'partial_shipped' }
], [
  { purchase_order_id: 'PO-Z', sku: 'ZERO', ordered_qty: 100, completed_qty: 100, shipped_qty: 100, remaining_qty: '' }, // max(0,100-100)=0 -> not added
  { purchase_order_id: 'PO-Z', sku: 'ZERO', ordered_qty: 0, completed_qty: 0, shipped_qty: 0, remaining_qty: 0 },        // persisted 0 -> not added
  { purchase_order_id: 'PO-Y', sku: 'EDGE', ordered_qty: 10, completed_qty: 3, shipped_qty: 2, remaining_qty: '' }       // max(0,10-max(2,3))=7
], ['ZERO', 'EDGE', 'GHOST']);   // ZERO->0(null), EDGE->7, GHOST->0(null)

// 9 multi-SKU; 10/11 KM/ResTW/ResUS shared factory with DIFFERENT companies on the SAME SKU (company-independent raw pool)
runEquiv('multi-sku + shared-factory KM/ResTW/ResUS', [
  { purchase_order_id: 'PO-KM',   company: 'KM',    factory_id: 'FAC-SHARED', order_status: 'in_production' },
  { purchase_order_id: 'PO-RESTW', company: 'ResTW', factory_id: 'FAC-SHARED', order_status: 'issued' },
  { purchase_order_id: 'PO-RESUS', company: 'ResUS', factory_id: 'FAC-SHARED', order_status: 'confirmed' }
], [
  { purchase_order_id: 'PO-KM',   sku: 'SHARED', ordered_qty: 0, completed_qty: 0, shipped_qty: 0, remaining_qty: 100 },
  { purchase_order_id: 'PO-RESTW', sku: 'SHARED', ordered_qty: 0, completed_qty: 0, shipped_qty: 0, remaining_qty: 200 },
  { purchase_order_id: 'PO-RESUS', sku: 'SHARED', ordered_qty: 0, completed_qty: 0, shipped_qty: 0, remaining_qty: 30 },
  { purchase_order_id: 'PO-KM',   sku: 'OTHER',  ordered_qty: 0, completed_qty: 0, shipped_qty: 0, remaining_qty: 5 }
], ['SHARED', 'OTHER']);   // SHARED = 100+200+30 = 330 across all companies (company-INDEPENDENT raw pool); OTHER = 5

// 14 status case/normalization; 15 blank/invalid numeric cells
runEquiv('status-case + invalid-cells', [
  { purchase_order_id: 'PO-Uc', order_status: 'IN_PRODUCTION' },   // upper-case status -> normalized+lowered -> open
  { purchase_order_id: 'PO-Sp', status: '  Issued  ' }             // legacy `status`, padded/mixed-case -> trimmed+lowered -> open
], [
  { purchase_order_id: 'PO-Uc', sku: 'CASE', ordered_qty: 'x', completed_qty: '', shipped_qty: null, remaining_qty: '' }, // invalid ordered 'x'->0 -> max(0,0-0)=0
  { purchase_order_id: 'PO-Uc', sku: 'CASE', ordered_qty: 60, completed_qty: 10, shipped_qty: 5, remaining_qty: '' },     // max(0,60-max(5,10))=50
  { purchase_order_id: 'PO-Sp', sku: 'CASE', ordered_qty: 0, completed_qty: 0, shipped_qty: 0, remaining_qty: '  ' }      // '  ' present (not '') -> parseFloat('  ')||0 = 0 -> not added
], ['CASE']);   // browser: 50 (PO-Uc line2). status-case + legacy status both resolve OPEN

console.log('\n== ZERO / EMPTY / unknown contract ==');
var vmEmpty = oprBuild_({ purchase_orders: [], purchase_order_lines: [] }, { skus: ['A', 'B'] });
eq(vmEmpty.items.map(function (i) { return i.openPoRemainingRawQty; }), [0, 0], 'no PO data -> 0 per requested sku (ZERO, not error)');
eq(vmEmpty.count, 2, 'count = requested sku count');
// full-set mode (no skus) returns only SKUs that have lines
var vmFull = oprBuild_({ purchase_orders: [{ purchase_order_id: 'P', order_status: 'issued' }], purchase_order_lines: [{ purchase_order_id: 'P', sku: 'ONLY', ordered_qty: 0, completed_qty: 0, shipped_qty: 0, remaining_qty: 9 }] }, {});
eq(vmFull.items, [{ sku: 'ONLY', openPoRemainingRawQty: 9 }], 'full-set mode returns SKUs present on lines');
// scope is echoed but never filters the aggregate
var vmScope = oprBuild_({ purchase_orders: [{ purchase_order_id: 'P', company: 'KM', order_status: 'issued' }], purchase_order_lines: [{ purchase_order_id: 'P', sku: 'S', remaining_qty: 7 }] }, { skus: ['S'], scope: { company: 'ResTW' } });
eq(vmScope.items[0].openPoRemainingRawQty, 7, 'scope.company (ResTW) does NOT filter the KM PO out — company-independent raw pool');
eq(vmScope.scope, { company: 'ResTW' }, 'scope echoed verbatim (context only)');

console.log('\n== per-line remaining formula (PDR-1 option a: preserve current browser behavior) ==');
eq(oprLineRemaining_({ remaining_qty: 380, ordered_qty: 500, completed_qty: 100, shipped_qty: 50 }), 380, 'persisted remaining_qty preferred (NOT max(0,completed-shipped)=50)');
eq(oprLineRemaining_({ remaining_qty: '', ordered_qty: 200, completed_qty: 150, shipped_qty: 40 }), 50, 'blank -> fallback max(0, ordered - max(shipped, completed))');
eq(oprLineRemaining_({ remaining_qty: '', ordered_qty: 100, completed_qty: 100, shipped_qty: 120 }), 0, 'blank fallback clamps >= 0');
// the F1-7C canonical would give max(0, completed-shipped): prove PREREQ-1 does NOT use it on blank rows
ok(oprLineRemaining_({ remaining_qty: '', ordered_qty: 200, completed_qty: 150, shipped_qty: 40 }) !== Math.max(0, 150 - 40), 'blank-row fallback (50) != canonical max(0,completed-shipped) (110) — PDR-1 a preserved, no silent convergence');

console.log('\n== source guards: read-only, scoped, no second engine, no F1-7C change ==');
var code52 = GS52.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/getOperationDb/.test(code52), '52_ never calls getOperationDb');
ok(!/\.setValue\(|appendRow|insertSheet|deleteRow|\.setValues\(/.test(code52), '52_ writes nothing (read-only)');
ok(!/shipment_line_allocations|slaFifoCompare_|factory_stock|fc_regular_forecast|order_planning_gap|generateRecommendation/.test(code52), '52_ reads no shipment/FIFO/forecast/gap/recommendation (no second engine)');
ok(!/poLineRemaining_/.test(GS52), '52_ does NOT reuse 50_ canonical poLineRemaining_ (different Layer-1 semantic by design)');
ok(/purchase_orders/.test(GS52) && /purchase_order_lines/.test(GS52) && !/sku_details|warehouses/.test(slice(GS52, 'var OPR_TABLES_', 'var OPR_OPEN_STATUS_')), '52_ table scope = purchase_orders + purchase_order_lines only');
ok(/action === 'openPoRemaining\.raw\.get'/.test(ROUTER) && /handleOpenPoRemainingRawGet_\(body\)/.test(ROUTER), 'router dispatches openPoRemaining.raw.get');
// F1-7C 50_ untouched by this round (its canonical definition still present, distinct from ours)
ok(/function poLineRemaining_/.test(GS50) && /Math\.max\(0, poWsNum_\(lineRow\.completed_qty\) - poWsNum_\(lineRow\.shipped_qty\)\)/.test(GS50), 'F1-7C 50_ canonical remaining_qty unchanged (max(0, completed - shipped))');
// no AI-Plan cutover this round: request-order.js still owns ongoing() + broad cache
ok(/function ongoing\(sku\)/.test(ROJS) && /loadOperationDb\(\{ force: true \}\)/.test(ROJS), 'request-order.js still uses ongoing() + broad cache (NO cutover this round)');
ok(ROJS.indexOf('openPoRemaining.raw.get') < 0 && ROJS.indexOf('openPoRemainingRawQty') < 0, 'request-order.js does NOT yet consume the new owner (PREREQ-5)');

console.log('\n----------------------------------------');
console.log('API OPEN-PO REMAINING OWNER (F1-7E-PREREQ-1-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
