// S8-B5-R1 — GOLDEN SCENARIO #34: user partial-carton Order Qty, end to end.
//
// §33 #34 expects: "override saved; Suggested unchanged; flagged user override" under the invariant
// "independence". §37 (CANONICAL v4.1) extends that across the whole downstream chain: an explicit
// partial-carton quantity travels Draft -> Send -> Request Order -> Approval -> Purchase Order and is
// "never rounded back to a full carton".
//
// WHAT THIS SUITE DOES NOT DO. It does not re-implement a single quantity rule. Every boundary below is
// crossed by calling the SHIPPED handler that owns it, extracted from its .gs source and run against an
// in-memory Apps Script runtime. A copy of the arithmetic would only prove the copy, so where a stage is
// too large to execute whole (the Send orchestrator's lock/journal machinery) the suite executes the
// shipped MAPPING helpers and pins the mapping line as a source guard, and says which it did.
//
// Execution evidence, the full field mapping and the one open divergence are recorded in
// docs/planning/GOLDEN_34_PARTIAL_CARTON_E2E_EVIDENCE.md.
//
// Run: node assets/tests/golden-34-partial-carton-e2e-s8-b5-r1.test.js
// NOTE: no 'use strict' — extracted .gs helpers are eval'd into module scope with a mocked runtime.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var at = src.indexOf('\nfunction ' + name + '(');
  var start = (at >= 0) ? at + 1 : (src.indexOf('function ' + name + '(') === 0 ? 0 : -1);
  if (start < 0) throw new Error('not a TOP-LEVEL function: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

function extractVar(src, name) {
  var at = src.indexOf(String.fromCharCode(10) + 'var ' + name + ' =');
  if (at < 0) throw new Error('not a TOP-LEVEL var: ' + name);
  var i = at + 1, depth = 0;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === ';' && depth === 0) return src.slice(at + 1, i + 1);
  }
  throw new Error('unterminated var: ' + name);
}

var GS13 = read('specs/active/apps-script/13_procurement_handlers.gs');              // Request Order + Purchase Order
var GS15 = read('specs/active/apps-script/15_request_allocation_handlers.gs');       // allocation draft lines
var GS66 = read('specs/active/apps-script/66_api_v1_request_order_send.gs');         // Send Request
var GS32 = read('specs/active/apps-script/32_shipment_line_allocation_handlers.gs'); // PO -> shipment capacity
var GS12 = read('specs/active/apps-script/12_shipment_handlers.gs');                 // shipment line creation

// ---------------------------------------------------------------------------
// The canonical fixture numbers. 137 at 40 per carton = three full boxes and 17 loose.
// 160 is what a carton CEILING would have produced and must never appear as a QUANTITY.
// ---------------------------------------------------------------------------
var UPC = 40;
var SUGGESTED = 160;        // §14 system Suggested Order Qty — CEILING(137/40)*40
var PARTIAL = 137;          // the user's explicit partial-carton decision
var EXACT_MULTIPLE = 400;   // a whole-carton order (10 x 40) — the baseline case
var NOTE = 'partial-carton override: 137 = 3 x 40 + 17 loose';

// ---------------- in-memory Apps Script runtime ----------------
var CURRENT_SS = null, _uuidN = 0;
var crypto = require('crypto');
var Utilities = {
  getUuid: function () { _uuidN++; return ('u' + _uuidN + '000000000000000000000000000000').substring(0, 32); },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  // Apps Script returns a SIGNED byte array; the shipped key builder re-signs each byte, so the mock must
  // hand back signed bytes or the execution key would differ from production's for the same input.
  computeDigest: function (alg, value) {
    var buf = crypto.createHash('sha256').update(String(value), 'utf8').digest();
    return Array.prototype.slice.call(buf).map(function (b) { return b > 127 ? b - 256 : b; });
  }
};
var LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
var SpreadsheetApp = { getActiveSpreadsheet: function () { return CURRENT_SS; } };
var Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
// The two clock helpers are STUBBED, not extracted: a wall clock is not part of #34's contract and a
// frozen timestamp keeps every fixture row byte-comparable across runs.
function procurementTimestamp_() { return '2026-10-10T00:00:00Z'; }
function procurementToday_() { return '2026-10-10'; }
function jsonResponse_(o) { return o; }
function sheetEnsureColumns_() { return true; }                     // fixtures already carry every column used
function prodRequireSheet_(ss, name) { return ss.getSheetByName(name); }
function procurementEnsureSheet_(ss, name) { return ss.getSheetByName(name); }
// The real module-level constants, taken from the shipped source rather than restated here.
eval(['REQUEST_ORDERS_HEADERS_', 'REQUEST_ORDER_LINES_HEADERS_', 'REQUEST_ORDER_LINE_SOURCES_HEADERS_',
  'PURCHASE_ORDERS_HEADERS_', 'PURCHASE_ORDER_LINES_HEADERS_', 'RO_TERMINAL_LIFECYCLE_', 'PROC_MONTH_KEYS_',
  'RO_EXEC_SOURCE_REF_TYPE_'].map(function (n) { return extractVar(GS13, n); }).join(String.fromCharCode(10)));

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
    appendRow: function (row) { var w = rows[0].length, r = row.slice(0, w); while (r.length < w) r.push(''); rows.push(r); },
    deleteRow: function (n) { rows.splice(n - 1, 1); },
    _rows: function () { return rows; }
  };
  return api;
}
function makeSS(sheets) { return { getSheetByName: function (n) { return sheets[n] || null; } }; }

// ---------------- eval the SHIPPED handlers + helpers into module scope ----------------
// Function declarations are hoisted into this scope at eval time, so the order of this list is irrelevant.
var GS13_SRC = ['roCreateRequestOrderCore_', 'handleCreateRequestOrderDraft_', 'handleUpdateRequestOrderLineQty_',
  'handleCreatePurchaseOrderFromRequest_', 'procurementRecalcPoTotals_', 'handleUpdatePurchaseOrderLine_',
  'procurementUpcMap_', 'procurementSkuInfoMap_', 'validateManualRequestOrderDraft_', 'procurementFactoryMap_',
  'procurementSkuLifecycleMap_', 'procurementMarketplaceSkuMap_', 'procurementTargetRuleRows_',
  'procurementForecastNext3Map_', 'procurementInventoryStockMaps_', 'procurementOnTheWayMaps_',
  'procurementNum_', 'procurementCompanyQty_',
  'procurementAppendByHeader_', 'procSrcKey_', 'procurementCurrentStock_', 'procurementOnTheWay_',
  'procurementSourcePriority_', 'procurementTierGroup_', 'roDeleteRequestOrderById_', 'roExecutionKey_',
  'roFindByExecutionKey_', 'procurementSiteFieldsByCompany_', 'procurementDateOnly_',
  'procurementRecalcRequestTotals_', 'procurementFindRow_', 'procurementReqStatus_',
  'procurementResolveFactoryId_', 'poFindConversionState_', 'poReuseResponse_', 'poSetRoConverted_',
  'poCreateBucketGroup_', 'poDeleteCreatedThisRun_', 'procSrcNorm_', 'procurementTargetPct_',
  'procShipmentDestId_', 'procShipmentRemainingQty_', 'roExecCanonicalString_', 'procShipmentLineQty_'
].map(function (n) { return extractFn(GS13, n); }).join(String.fromCharCode(10));
eval(GS13_SRC);

// Send Request (66_) quantity helpers — the shipped normalizer and the flat-tier column accessor.
eval(['rosStr_', 'rosLc_', 'rosUc_', 'rosQty_', 'rosTierCol_', 'rosTierField_'].map(function (n) { return extractFn(GS66, n); }).join(String.fromCharCode(10)));

// Allocation draft lines (15_) — the shipped line-mapping route.
eval(GS15.match(/var RA_LINE_LEGACY_ALIASES_ = \{[\s\S]*?\};/)[0]);
eval(extractFn(GS15, 'raApplyLineAliases_'));
eval(GS15.match(/var RA_LINE_SNAPSHOT_FIELDS_ = \[[\s\S]*?\];/)[0]);
eval(extractFn(GS15, 'handleUpsertRequestOrderAllocationDraftLines_'));

// PO -> shipment capacity allocation (32_) — the shipped FIFO allocator, pure.
eval(GS32.match(/var SLA_ELIGIBLE_PO_STATUS_ = \{[^}]*\};/)[0]);
eval(['slaNum_', 'slaStr_', 'slaLc_', 'slaFifoCompare_', 'slaIsEligible_', 'slaReservedByOthers_',
  'slaAvailability_', 'slaAllocateShipmentLine_', 'slaBuildPlan_'].map(function (n) { return extractFn(GS32, n); }).join(String.fromCharCode(10)));

// ---------------- fixture builders ----------------
var ROL_COLS = ['request_order_line_id', 'request_order_id', 'sku', 'series', 'company', 'request_bucket',
  'request_month', 'inspection_date', 'expected_ready_date', 'expected_ship_date', 'requested_qty',
  'approved_qty', 'km_qty', 'resus_qty', 'restw_qty', 'units_per_carton', 'carton_qty', 'shortage_qty',
  'supplier_id', 'supplier_name', 'supplier_sku', 'unit_cost', 'estimated_amount', 'currency',
  'calculation_method', 'line_status', 'purchase_order_line_id', 'recommended_qty', 'note',
  'request_allocation_draft_id', 'created_at', 'updated_at'];
var RO_COLS = ['request_order_id', 'request_order_no', 'request_status', 'company', 'supplier_id',
  'supplier_name', 'warehouse_id', 'factory_id', 'currency', 'source', 'source_ref_type', 'source_ref_id',
  'planning_cycle', 'series', 'total_sku', 'total_qty', 'total_cartons', 'estimated_amount',
  'request_order_version', 'parent_request_order_id', 'note', 'created_by', 'created_at', 'updated_by', 'updated_at'];
var POL_COLS = ['purchase_order_line_id', 'purchase_order_id', 'request_order_line_id', 'request_order_id',
  'request_bucket', 'sku', 'series', 'company', 'ordered_qty', 'approved_qty', 'requested_qty',
  'recommended_qty', 'completed_qty', 'shipped_qty', 'carton_qty', 'units_per_carton', 'unit_cost',
  'line_amount', 'currency', 'line_status', 'note', 'created_at', 'updated_at'];
var PO_COLS = ['purchase_order_id', 'po_no', 'purchase_order_no', 'request_order_id', 'request_bucket',
  'order_status', 'order_date', 'company', 'supplier_id', 'factory_id', 'currency', 'total_sku', 'total_qty',
  'total_cartons', 'total_amount', 'subtotal_amount', 'warehouse_id', 'supplier_name', 'created_by',
  'created_at', 'updated_by', 'updated_at', 'note'];
var SRC_COLS = ['request_order_line_source_id', 'request_order_line_id', 'request_order_id', 'sku', 'company',
  'request_bucket', 'request_month', 'approved_qty', 'source_type', 'request_allocation_draft_id'];

function buildChainDb(opt) {
  opt = opt || {};
  var ro = makeSheet('request_orders', RO_COLS);
  var rol = makeSheet('request_order_lines', ROL_COLS);
  var src = makeSheet('request_order_line_sources', SRC_COLS);
  var po = makeSheet('purchase_orders', PO_COLS);
  var pol = makeSheet('purchase_order_lines', POL_COLS);
  // is_factory_warehouse / is_active are the columns the shipped factory authority actually reads; a
  // warehouse that fails them is refused as FACTORY_NOT_FOUND before any quantity is ever examined.
  var wh = makeSheet('warehouses', ['warehouse_id', 'factory_id', 'is_factory_warehouse', 'is_active', 'company']);
  wh.appendRow(['WH-F1', 'FAC-CN-1', 'TRUE', 'TRUE', '']);
  var sd = makeSheet('sku_details', ['sku', 'units_per_carton', 'product_name', 'series', 'status']);
  (opt.skus || [{ sku: 'SKU-A', upc: UPC }]).forEach(function (s) {
    sd.appendRow([s.sku, s.upc, s.name || ('Product ' + s.sku), s.series || 'SER-1', s.status || 'active']);
  });
  return makeSS({
    request_orders: ro, request_order_lines: rol, request_order_line_sources: src,
    purchase_orders: po, purchase_order_lines: pol, warehouses: wh, sku_details: sd
  });
}
function rows(ss, name) { return ss.getSheetByName(name)._rows().slice(1); }
function headerRow(ss, name) { return ss.getSheetByName(name)._rows()[0]; }
function cell(ss, name, rowIdx, col) { return rows(ss, name)[rowIdx][headerRow(ss, name).indexOf(col)]; }
function colOf(ss, name, col) { return headerRow(ss, name).indexOf(col); }

// The Send writer body, built exactly as 66_ builds it (pinned by the B2 source guard below).
function sendBody(lines, over) {
  var b = {
    company: '', source: 'manual', source_ref_type: 'request_order_allocation_batch',
    planning_cycle: '2026-10', series: 'SER-1', created_by: 'send-request', warehouse_id: 'WH-F1',
    supplier_id: 'SUP-1', supplier_name: 'Supplier One', currency: 'USD',
    lines: lines.map(function (l) {
      return {
        sku: l.sku, series: 'SER-1', company: l.company || 'KM', requested_qty: l.order_qty,
        request_bucket: l.bucket || 'T1', request_month: l.month || '2026-10',
        request_allocation_draft_id: l.draftId || 'RAD-1', units_per_carton: l.upc === undefined ? UPC : l.upc,
        calculation_method: 'server_orchestrated_allocation', line_status: 'draft'
      };
    })
  };
  if (over) Object.keys(over).forEach(function (k) { b[k] = over[k]; });
  return b;
}
function setRoStatus(ss, st) {
  var sh = ss.getSheetByName('request_orders'), r = sh._rows();
  sh.getRange(2, r[0].indexOf('request_status') + 1).setValue(st);
}

// ===========================================================================
section('A — EXPECTED CONTRACT, read from the frozen sources (no inference)');
// ===========================================================================
var RULES = read('../docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md');
var REQPO = read('../docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md');
ok(/\|\s*34\s*\|\s*User partial-carton Order Qty\s*\|\s*override saved; Suggested unchanged; flagged user override\s*\|\s*independence\s*\|/.test(RULES),
  'A1 §33 row #34 reads verbatim "override saved; Suggested unchanged; flagged user override" / "independence"');
ok(/Request Order → PO mapping must NOT re-round the quantity up to a full carton/.test(RULES),
  'A2 §37 forbids re-rounding the QUANTITY at the Request Order → PO mapping');
ok(/Request Order → PO mapping must NOT re-CEILING the quantity/.test(REQPO),
  'A3 REQ_PO §12.15 states the same prohibition — the two owners agree on the quantity rule');
ok(/never\*\* re-CEILING'd \/ FLOOR'd \/ rounded/.test(RULES),
  'A4 §36.3 names all three forbidden operations on order_qty: CEILING, FLOOR and rounding');
ok(/\*\*Send is not blocked\*\* by a partial carton/.test(RULES),
  'A5 §37 states Send is NOT blocked by a partial carton');

// ===========================================================================
section('B1 — Request Order Draft line: the user decision is stored, Suggested is not touched');
// ===========================================================================
// handleUpsertRequestOrderAllocationDraftLines_ is the shipped route. It maps the payload and forwards a
// locked user-decision-edit command to 25_. The locked command is the recorder here: the assertion is about
// WHAT THE SHIPPED MAPPER FORWARDS, which is exactly the boundary this stage owns.
var forwarded = null;
function handleUpdateRecommendationDecisionLocked_(cmd) { forwarded = cmd; return { success: true, data: { applied: (cmd.edits || []).length } }; }

(function () {
  var res = handleUpsertRequestOrderAllocationDraftLines_({
    request_allocation_draft_id: 'RAD-1', expectedToken: 'TK1', updated_by: 'planner',
    lines: [{
      request_month: '2026-10', request_bucket: 'T1', order_qty: PARTIAL, carton_qty: PARTIAL / UPC,
      recommended_qty: SUGGESTED, units_per_carton: UPC, note: NOTE
    }]
  });
  ok(res && res.success, 'B1-1 the shipped draft-line route accepts a partial-carton order_qty');
  eq(forwarded.edits.length, 1, 'B1-2 exactly one edit is forwarded');
  eq(forwarded.edits[0].fields.order_qty, PARTIAL,
    'B1-3 order_qty is forwarded as EXACTLY 137 — the draft layer applies no carton arithmetic');
  ok(forwarded.edits[0].fields.order_qty !== SUGGESTED,
    'B1-4 and specifically not 160, which is what a CEILING would have produced');
  eq(forwarded.edits[0].fields.carton_qty, PARTIAL / UPC,
    'B1-5 a FRACTIONAL carton_qty (3.425) survives the draft route verbatim — it is "passed through as-is"');
  eq(forwarded.edits[0].fields.note, NOTE, 'B1-6 the override note is forwarded (§37 existing-note contract)');
  ok(!('recommended_qty' in forwarded.edits[0].fields),
    'B1-7 recommended_qty is NOT among the edited fields — a user edit cannot overwrite Suggested (§36.3)');
  eq(forwarded.edits[0].recommendedSnapshot.recommended_qty, SUGGESTED,
    'B1-8 Suggested travels separately as a SNAPSHOT, so both numbers coexist (independence)');
  eq(forwarded.reconcile, true, 'B1-9 the forwarded command is the canonical locked reconcile edit, not a raw write');
})();
(function () {
  // Zero is a real decision, not an absence (required case 5). It must reach the command, not be dropped.
  forwarded = null;
  handleUpsertRequestOrderAllocationDraftLines_({
    request_allocation_draft_id: 'RAD-1', expectedToken: 'TK1',
    lines: [{ request_month: '2026-10', request_bucket: 'T1', order_qty: 0, recommended_qty: SUGGESTED }]
  });
  eq(forwarded.edits[0].fields.order_qty, 0, 'B1-10 an explicit 0 order_qty is forwarded as 0, not dropped');
  eq(forwarded.edits.length, 1, 'B1-11 and it still produces an edit — zero is a saved decision');
})();
(function () {
  // T4 is visibility-only and must never become an order commitment, partial carton or not.
  forwarded = null;
  handleUpsertRequestOrderAllocationDraftLines_({
    request_allocation_draft_id: 'RAD-1', expectedToken: 'TK1',
    lines: [{ request_month: '2026-10', request_bucket: 'T4', order_qty: PARTIAL }]
  });
  eq(forwarded.edits.length, 0, 'B1-12 a T4 line is dropped — a partial carton does not create a T4 commitment');
})();

// ===========================================================================
section('B2 — Send Request: the quantity that crosses into request_order_lines');
// ===========================================================================
// The 66_ orchestrator owns locks, a journal and a verification pass; its QUANTITY contract is one mapping
// line plus one normalizer. Both are executed/pinned here, and the stage they feed is executed for real in B3.
ok(/requested_qty:\s*l\.order_qty/.test(GS66),
  'B2-1 66_ maps the writer body field as `requested_qty: l.order_qty` — a copy, with no arithmetic');
ok(!/requested_qty:\s*Math\.(ceil|floor|round)/.test(GS66),
  'B2-2 that mapping is not wrapped in Math.ceil / Math.floor / Math.round');
eq(rosQty_(PARTIAL), PARTIAL, 'B2-3 the shipped normalizer returns 137 unchanged');
eq(rosQty_(0), 0, 'B2-4 it returns 0 for an explicit zero — zero is a value, not an absence');
eq(rosQty_(''), null, 'B2-5 and null for blank, so missing and zero stay different facts');
eq(rosQty_('abc'), null, 'B2-6 a non-numeric quantity is null (ABSENT), never coerced to 0');
eq(rosTierField_({ t1_order_qty: PARTIAL, t2_order_qty: 0 }, 'T1', 'order_qty'), PARTIAL,
  'B2-7 the flat-tier accessor reads t1_order_qty — the partial value is read from the tier it was saved on');
ok(/A PARTIAL CARTON IS NOT THIS GATE/.test(GS66),
  'B2-8 the Send carton gate says in its own source that a partial carton is not what it blocks (§12.13/§37)');
ok(/upcUsable = \(upc != null && upc > 0\)/.test(GS66),
  'B2-9 what Send actually gates on is an unusable CARTON SIZE — a different field from the quantity');

// ===========================================================================
section('B3 — request_orders / request_order_lines creation (SHIPPED handler, real sheets)');
// ===========================================================================
var ssA = buildChainDb();
CURRENT_SS = ssA;
var created = handleCreateRequestOrderDraft_(sendBody([{ sku: 'SKU-A', order_qty: PARTIAL }]));
ok(created && created.success, 'B3-1 the shipped creator accepts a partial-carton Send payload');
eq(rows(ssA, 'request_order_lines').length, 1, 'B3-2 exactly one request order line was written');
eq(Number(cell(ssA, 'request_order_lines', 0, 'requested_qty')), PARTIAL,
  'B3-3 requested_qty is EXACTLY 137 — Send → request_order_lines preserved the quantity');
eq(Number(cell(ssA, 'request_order_lines', 0, 'approved_qty')), PARTIAL,
  'B3-4 approved_qty defaults to requested_qty, still 137 (no carton re-round on the default)');
eq(Number(cell(ssA, 'request_order_lines', 0, 'units_per_carton')), UPC,
  'B3-5 units_per_carton 40 is snapshotted on the line');
ok(Number(cell(ssA, 'request_order_lines', 0, 'requested_qty')) !== SUGGESTED,
  'B3-6 and it is specifically not 160');
eq([Number(cell(ssA, 'request_order_lines', 0, 'km_qty')), Number(cell(ssA, 'request_order_lines', 0, 'resus_qty')),
Number(cell(ssA, 'request_order_lines', 0, 'restw_qty'))], [PARTIAL, 0, 0],
  'B3-7 the company split carries the exact 137 on the owning company and 0 elsewhere');
eq(Number(cell(ssA, 'request_orders', 0, 'total_qty')), PARTIAL,
  'B3-8 the header total_qty is 137 — the partial quantity is what the header reports');

// ===========================================================================
section('B4 — the user decision on the Request Order line (SHIPPED handler)');
// ===========================================================================
// Start from the system Suggested (160) and let the user decide 137 — the real §37 sequence.
var ssB = buildChainDb();
CURRENT_SS = ssB;
handleCreateRequestOrderDraft_(sendBody([{ sku: 'SKU-A', order_qty: SUGGESTED }]));
ssB.getSheetByName('request_order_lines').getRange(2, colOf(ssB, 'request_order_lines', 'recommended_qty') + 1).setValue(SUGGESTED);
var lineId = String(cell(ssB, 'request_order_lines', 0, 'request_order_line_id'));
var edited = handleUpdateRequestOrderLineQty_({ lines: [{ request_order_line_id: lineId, approved_qty: PARTIAL, note: NOTE }], actor: 'planner' });
ok(edited && edited.success && edited.data.updated === 1, 'B4-1 the shipped edit handler accepted the partial-carton decision');
eq(Number(cell(ssB, 'request_order_lines', 0, 'approved_qty')), PARTIAL,
  'B4-2 approved_qty is EXACTLY 137 — the decision is saved, not re-CEILINGed (§33 #34 "override saved")');
eq(Number(cell(ssB, 'request_order_lines', 0, 'recommended_qty')), SUGGESTED,
  'B4-3 recommended_qty is still 160 — "Suggested unchanged" (§33 #34, §36.3)');
ok(Number(cell(ssB, 'request_order_lines', 0, 'approved_qty')) !== Number(cell(ssB, 'request_order_lines', 0, 'recommended_qty')),
  'B4-4 the two numbers differ, so B4-2 cannot pass by them being equal — this is the independence invariant');
eq(String(cell(ssB, 'request_order_lines', 0, 'note')), NOTE,
  'B4-5 the override note is persisted verbatim — the override FACT uses the existing note field, no new column');
eq(Number(cell(ssB, 'request_order_lines', 0, 'requested_qty')), SUGGESTED,
  'B4-6 requested_qty keeps the originally requested 160 — the edit changed only the decision field');
(function () {
  var q = Number(cell(ssB, 'request_order_lines', 0, 'approved_qty')), u = Number(cell(ssB, 'request_order_lines', 0, 'units_per_carton'));
  eq([q % u !== 0, q % u], [true, 17],
    'B4-7 "flagged user override" is DERIVABLE from the stored row alone (137 mod 40 = 17) — no invented flag column');
})();

// ===========================================================================
section('B5 — Request Order → Purchase Order conversion (SHIPPED handler)');
// ===========================================================================
setRoStatus(ssB, 'approved');
var conv = handleCreatePurchaseOrderFromRequest_({ request_order_id: String(cell(ssB, 'request_orders', 0, 'request_order_id')), actor: 'planner' });
ok(conv && conv.success && conv.data.po_count === 1, 'B5-1 the approved request converts to exactly one PO');
eq(rows(ssB, 'purchase_order_lines').length, 1, 'B5-2 exactly one PO line');
eq(Number(cell(ssB, 'purchase_order_lines', 0, 'ordered_qty')), PARTIAL,
  'B5-3 PO ordered_qty is EXACTLY 137 — "conversion preserves the final approved exact quantity" (§37)');
eq(Number(cell(ssB, 'purchase_order_lines', 0, 'approved_qty')), PARTIAL, 'B5-4 PO approved_qty is 137');
eq(Number(cell(ssB, 'purchase_order_lines', 0, 'recommended_qty')), SUGGESTED,
  'B5-5 the 160 recommendation travels to the PO as a traceability snapshot, not as the ordered quantity');
eq(Number(cell(ssB, 'purchase_order_lines', 0, 'units_per_carton')), UPC,
  'B5-6 the units_per_carton snapshot is carried (§37 names it explicitly)');
eq(String(cell(ssB, 'purchase_order_lines', 0, 'note')), NOTE, 'B5-7 the override note survives RO line → PO line');
eq(String(cell(ssB, 'purchase_order_lines', 0, 'request_order_line_id')), lineId,
  'B5-8 traceability back to the originating request line is stored on the PO line');
(function () {
  var oc = colOf(ssB, 'purchase_order_lines', 'ordered_qty'), ac = colOf(ssB, 'purchase_order_lines', 'approved_qty');
  var any = rows(ssB, 'purchase_order_lines').some(function (r) { return Number(r[oc]) === SUGGESTED || Number(r[ac]) === SUGGESTED; });
  ok(!any, 'B5-9 160 appears in NO PO quantity column — no stage silently restored the full carton');
})();
eq(Number(cell(ssB, 'purchase_orders', 0, 'total_qty')), PARTIAL,
  'B5-10 the PO header total_qty is 137 — Σ ordered_qty, with no re-rounding at the header either');

// ===========================================================================
section('B6 — the whole-carton baseline and the exact-multiple case behave identically');
// ===========================================================================
[['B6-1 full-carton baseline', SUGGESTED], ['B6-2 exact carton multiple', EXACT_MULTIPLE]].forEach(function (c) {
  var label = c[0], qty = c[1];
  var ss = buildChainDb();
  CURRENT_SS = ss;
  handleCreateRequestOrderDraft_(sendBody([{ sku: 'SKU-A', order_qty: qty }]));
  setRoStatus(ss, 'approved');
  handleCreatePurchaseOrderFromRequest_({ request_order_id: String(cell(ss, 'request_orders', 0, 'request_order_id')), actor: 't' });
  eq(Number(cell(ss, 'purchase_order_lines', 0, 'ordered_qty')), qty,
    label + ' — ordered_qty is exactly ' + qty + ', so the partial path is not a special case bolted on');
  eq(qty % UPC, 0, label + ' — and ' + qty + ' really is a whole-carton multiple at upc 40 (the control)');
});

// ===========================================================================
section('B7 — zero and invalid quantities (required cases 5 and 6)');
// ===========================================================================
(function () {
  var ss = buildChainDb();
  CURRENT_SS = ss;
  var r = handleCreateRequestOrderDraft_(sendBody([{ sku: 'SKU-A', order_qty: 0 }]));
  ok(r && r.success, 'B7-1 a zero-quantity line is accepted by the creator — zero is a decision');
  eq(Number(cell(ss, 'request_order_lines', 0, 'requested_qty')), 0,
    'B7-2 and is persisted as 0 — never promoted to a carton, never silently dropped');
  eq(Number(cell(ss, 'request_order_lines', 0, 'carton_qty')), 0,
    'B7-3 a zero quantity yields zero cartons — no empty carton is fabricated');
})();
(function () {
  // A MANUAL draft (no source_ref_type) runs the full validation authority — that is where a bad quantity is
  // refused. The allocation-sourced Send path is exempt by design and has its own Send gates (B2-8/B2-9).
  var ss = buildChainDb();
  CURRENT_SS = ss;
  var body = sendBody([{ sku: 'SKU-A', order_qty: -5 }]);
  delete body.source_ref_type;
  var r = handleCreateRequestOrderDraft_(body);
  ok(r && r.success === false, 'B7-4 a NEGATIVE quantity is REFUSED by the manual-draft validation authority');
  // The exact token, not a loose match: an earlier draft of this test passed on FACTORY_NOT_FOUND, which
  // refused the row before the quantity was ever read. A refusal for the wrong reason is not a pass.
  eq(String(r.error), 'REQUESTED_QTY_INVALID', 'B7-5 and the refusal is specifically about the quantity');
  eq(rows(ss, 'request_order_lines').length, 0, 'B7-6 nothing was written — the refusal is validate-before-mutate');
})();
(function () {
  var ss = buildChainDb();
  CURRENT_SS = ss;
  var body = sendBody([{ sku: 'SKU-A', order_qty: 'not-a-number' }]);
  delete body.source_ref_type;
  var r = handleCreateRequestOrderDraft_(body);
  ok(r && r.success === false, 'B7-7 a NON-NUMERIC quantity is refused too, not coerced to 0 and written');
  eq(String(r.error), 'REQUESTED_QTY_INVALID', 'B7-7b and for the same quantity reason, not an unrelated gate');
  eq(rows(ss, 'request_order_lines').length, 0, 'B7-8 and again nothing was written');
})();
(function () {
  var ss = buildChainDb({ skus: [{ sku: 'SKU-A', upc: 0 }] });
  CURRENT_SS = ss;
  var body = sendBody([{ sku: 'SKU-A', order_qty: PARTIAL, upc: 0 }]);
  delete body.source_ref_type;
  var r = handleCreateRequestOrderDraft_(body);
  ok(r && r.success === false, 'B7-9 a MISSING units_per_carton is refused (§14/§31 — no silent default)');
  eq(String(r.error), 'UNITS_PER_CARTON_MISSING',
    'B7-10 and the refusal is about the CARTON CONFIGURATION, a different field from the partial quantity');
})();

// ===========================================================================
section('B8 — company, SKU and factory identity (required cases 13–16)');
// ===========================================================================
(function () {
  var ss = buildChainDb({ skus: [{ sku: 'SKU-A', upc: UPC }, { sku: 'SKU-B', upc: UPC }] });
  CURRENT_SS = ss;
  handleCreateRequestOrderDraft_(sendBody([
    { sku: 'SKU-A', order_qty: PARTIAL, company: 'KM' },
    { sku: 'SKU-A', order_qty: 55, company: 'ResUS' },
    { sku: 'SKU-B', order_qty: 71, company: 'KM' }
  ]));
  var ls = rows(ss, 'request_order_lines');
  eq(ls.length, 3, 'B8-1 three distinct lines — company and SKU each split the grain');
  var h = headerRow(ss, 'request_order_lines');
  var get = function (sku, co, f) {
    var r = ls.filter(function (x) { return x[h.indexOf('sku')] === sku && x[h.indexOf('company')] === co; })[0];
    return Number(r[h.indexOf(f)]);
  };
  eq(get('SKU-A', 'KM', 'requested_qty'), PARTIAL, 'B8-2 KM / SKU-A holds 137');
  eq(get('SKU-A', 'ResUS', 'requested_qty'), 55, 'B8-3 ResUS / SKU-A holds 55 — the same SKU, a different company');
  eq(get('SKU-B', 'KM', 'requested_qty'), 71, 'B8-4 KM / SKU-B holds 71 — the same company, a different SKU');
  eq([get('SKU-A', 'KM', 'km_qty'), get('SKU-A', 'KM', 'resus_qty')], [PARTIAL, 0],
    'B8-5 the KM line carries 137 in km_qty and 0 in resus_qty — no cross-company bleed');
  eq([get('SKU-A', 'ResUS', 'resus_qty'), get('SKU-A', 'ResUS', 'km_qty')], [55, 0],
    'B8-6 and the ResUS line is the mirror image — the partial quantity did not leak across companies');
  eq(Number(cell(ss, 'request_orders', 0, 'total_qty')), PARTIAL + 55 + 71,
    'B8-7 the header totals all three exactly (137+55+71=263) — no quantity lost, none duplicated');
  eq(Number(cell(ss, 'request_orders', 0, 'total_sku')), 2,
    'B8-8 total_sku = 2 distinct SKUs, never the 3 line count (§7.4)');
})();

// ===========================================================================
section('B9 — PO → Shipment: the downstream boundary, measured (SHIPPED 32_ allocator)');
// ===========================================================================
// MAPPING FACT, recorded rather than assumed: a shipment line's quantity does NOT come from the Purchase
// Order. 12_ writes `shipment_qty` from `shipping_plan_lines.approved_qty`; the PO participates through 32_
// as a CAPACITY allocation bounded by completed_qty − shipped_qty. §37's quantity chain therefore ends at
// the PO, and what must hold downstream is that the allocation neither rounds nor duplicates.
ok(/shipment_qty: shipmentNum_\(plv\(lr, 'approved_qty'\)\)/.test(GS12),
  'B9-1 12_ sources shipment_qty from the shipping PLAN line approved_qty — not from a PO ordered_qty');
ok(!/shipment_qty:[^,\n]*ordered_qty/.test(GS12),
  'B9-2 no shipment quantity is copied from ordered_qty anywhere in the shipment writer');
(function () {
  var poLines = [{
    purchase_order_id: 'PO1', purchase_order_line_id: 'POL1', sku: 'SKU-A', company: 'KM',
    factory_id: 'FAC-CN-1', order_status: 'issued', order_date: '2026-10-01', po_no: 'PO-001',
    completed_qty: PARTIAL, shipped_qty: 0
  }];
  var scope = { shipment_line_id: 'SHL1', sku: 'SKU-A', company: 'KM', factory_id: 'FAC-CN-1', shipment_qty: PARTIAL };
  var r = slaAllocateShipmentLine_(scope, poLines, []);
  ok(r.ok, 'B9-3 a 137-unit shipment line allocates against a 137-unit partial-carton PO capacity');
  eq(r.allocated_total, PARTIAL, 'B9-4 the allocated total is EXACTLY 137 — the allocator does no carton arithmetic');
  eq(r.allocations[0].allocated_qty, PARTIAL, 'B9-5 and the single allocation row carries 137');
  var r2 = slaAllocateShipmentLine_({ shipment_line_id: 'SHL1', sku: 'SKU-A', company: 'KM', factory_id: 'FAC-CN-1', shipment_qty: SUGGESTED }, poLines, []);
  ok(!r2.ok && r2.error === 'PO_CAPACITY_INSUFFICIENT',
    'B9-6 asking for the CEILINGed 160 against the same PO fails closed — the partial capacity is not rounded up');
  eq(r2.shortage_qty, SUGGESTED - PARTIAL, 'B9-7 and the shortage is exactly the 23 units the ceiling would have invented');
  ok(!slaAllocateShipmentLine_({ shipment_line_id: 'SHL2', sku: 'SKU-A', company: 'ResUS', factory_id: 'FAC-CN-1', shipment_qty: 1 }, poLines, []).ok,
    'B9-8 a different COMPANY cannot consume this PO capacity — company isolation holds downstream');
  ok(!slaAllocateShipmentLine_({ shipment_line_id: 'SHL3', sku: 'SKU-A', company: 'KM', factory_id: 'FAC-CN-9', shipment_qty: 1 }, poLines, []).ok,
    'B9-9 a different FACTORY cannot either — factory identity is independent of company');
  ok(!slaAllocateShipmentLine_({ shipment_line_id: 'SHL4', sku: 'SKU-B', company: 'KM', factory_id: 'FAC-CN-1', shipment_qty: 1 }, poLines, []).ok,
    'B9-10 and a different SKU cannot — the correct SKU identity gates the capacity');
  var plan = slaBuildPlan_([
    { shipment_line_id: 'SA', sku: 'SKU-A', company: 'KM', factory_id: 'FAC-CN-1', shipment_qty: 100 },
    { shipment_line_id: 'SB', sku: 'SKU-A', company: 'KM', factory_id: 'FAC-CN-1', shipment_qty: 37 }
  ], poLines, []);
  ok(plan.ok, 'B9-11 two shipment lines together consume the 137 exactly');
  eq(plan.results.reduce(function (s, x) { return s + x.allocated_total; }, 0), PARTIAL,
    'B9-12 Σ allocated = 137 — the partial carton is neither duplicated nor lost when it is split');
  ok(!slaBuildPlan_([
    { shipment_line_id: 'SA', sku: 'SKU-A', company: 'KM', factory_id: 'FAC-CN-1', shipment_qty: 100 },
    { shipment_line_id: 'SB', sku: 'SKU-A', company: 'KM', factory_id: 'FAC-CN-1', shipment_qty: 38 }
  ], poLines, []).ok, 'B9-13 asking for one unit more than the partial capacity fails closed, atomically');
  var snapshot = JSON.stringify(poLines);
  slaAllocateShipmentLine_(scope, poLines, []);
  slaAllocateShipmentLine_(scope, poLines, []);
  eq(JSON.stringify(poLines), snapshot, 'B9-14 repeated allocation reads leave the PO lines byte-identical — pure');
})();

// ===========================================================================
section('B10 — repeated reads, retries and side effects (required cases 17 and 18)');
// ===========================================================================
(function () {
  var before = JSON.stringify(ssB.getSheetByName('purchase_order_lines')._rows());
  var poBefore = rows(ssB, 'purchase_orders').length, polBefore = rows(ssB, 'purchase_order_lines').length;
  CURRENT_SS = ssB;
  var again = handleCreatePurchaseOrderFromRequest_({ request_order_id: String(cell(ssB, 'request_orders', 0, 'request_order_id')), actor: 'planner' });
  ok(again && again.success, 'B10-1 converting the same request again still succeeds');
  eq([rows(ssB, 'purchase_orders').length, rows(ssB, 'purchase_order_lines').length], [poBefore, polBefore],
    'B10-2 and creates no second PO and no second line — the retry is idempotent');
  eq(JSON.stringify(ssB.getSheetByName('purchase_order_lines')._rows()), before,
    'B10-3 the PO lines are byte-identical after the retry — the quantity was not rewritten');
  eq(Number(cell(ssB, 'purchase_order_lines', 0, 'ordered_qty')), PARTIAL,
    'B10-4 ordered_qty is still exactly 137 after the retry');
})();
(function () {
  var ss = buildChainDb();
  CURRENT_SS = ss;
  var b = sendBody([{ sku: 'SKU-A', order_qty: PARTIAL }]);
  var r1 = handleCreateRequestOrderDraft_(b);
  var r2 = handleCreateRequestOrderDraft_(b);
  ok(r1.success && r2.success, 'B10-5 a repeated Send of the same allocation batch succeeds twice');
  eq(r2.data.reused, true, 'B10-6 the second call REUSES the existing Request Order (execution key)');
  eq(rows(ss, 'request_order_lines').length, 1, 'B10-7 and 137 was written once, not twice (no duplication)');
})();

// ===========================================================================
section('C — the §37 carton_qty clause, MEASURED (the open divergence)');
// ===========================================================================
// §36.3 says `carton_qty = order_qty ÷ units_per_carton` "may be fractional for an explicit partial-carton
// override"; §37 says the PO conversion preserves "its exact carton_qty"; REQ_PO §7.1 repeats that it "is
// the exact Approved Qty ÷ units_per_carton (may be fractional)". The shipped handlers instead write
// CEILING(qty ÷ upc) at every write site. This block MEASURES that, so the divergence is pinned by a test
// instead of being rediscovered later. It asserts WHAT IS, not which side is right — see the report.
eq((GS13.match(/var carton = [^\n]*Math\.ceil[^\n]*/g) || []).length, 5,
  'C1 13_ derives carton_qty with Math.ceil at exactly 5 write sites (create, manual-alloc, edit, convert-fallback, PO-line edit)');
eq(Number(cell(ssB, 'request_order_lines', 0, 'carton_qty')), Math.ceil(PARTIAL / UPC),
  'C2 MEASURED: the request line stores carton_qty = ceil(137/40) = 4, not the exact 3.425');
eq(Number(cell(ssB, 'purchase_order_lines', 0, 'carton_qty')), Math.ceil(PARTIAL / UPC),
  'C3 MEASURED: the PO line stores the same 4 — the conversion copies the stored value, it does not re-derive');
ok(Number(cell(ssB, 'request_order_lines', 0, 'carton_qty')) !== PARTIAL / UPC,
  'C4 so the stored carton_qty is NOT the exact quotient the three spec owners describe');
ok(/carton_qty` is the exact `Approved Qty ÷ units_per_carton` \(may be fractional\)/.test(REQPO),
  'C5 and REQ_PO §7.1 does say "exact ... (may be fractional)" — the divergence is between owners, not invented here');
eq(Number(cell(ssB, 'purchase_order_lines', 0, 'ordered_qty')), PARTIAL,
  'C6 CRUCIALLY the QUANTITY is untouched by this — §37 quantity preservation holds independently of C2/C3');
ok(/partial-carton exact value is preserved verbatim/.test(read('js/core/supply-planning-plan-builder.js')),
  'C7 the recommendation plan builder states the same quantity rule on its own line — consistent across lanes');

// ===========================================================================
section('D — the full-chain quantity ledger (required cases 10, 11, 12)');
// ===========================================================================
(function () {
  // requested_qty on ssB legitimately holds the Suggested 160 (asserted by B4-6), so it is not a
  // decision-carrying stage and is deliberately absent from this ledger.
  var stages = {
    'draft order_qty forwarded': PARTIAL,
    'request line approved_qty': Number(cell(ssB, 'request_order_lines', 0, 'approved_qty')),
    'request header total_qty': Number(cell(ssB, 'request_orders', 0, 'total_qty')),
    'PO line approved_qty': Number(cell(ssB, 'purchase_order_lines', 0, 'approved_qty')),
    'PO line ordered_qty': Number(cell(ssB, 'purchase_order_lines', 0, 'ordered_qty')),
    'PO header total_qty': Number(cell(ssB, 'purchase_orders', 0, 'total_qty'))
  };
  var vals = Object.keys(stages).map(function (k) { return stages[k]; });
  eq(vals, vals.map(function () { return PARTIAL; }),
    'D1 every decision-carrying stage holds exactly 137: ' + JSON.stringify(stages));
  ok(vals.indexOf(SUGGESTED) === -1, 'D2 160 appears at NO decision stage — no stage re-rounded');
  ok(vals.every(function (v) { return v % UPC !== 0; }),
    'D3 and every one of them is still a NON-multiple of 40, which is the whole point of #34');
})();

// ===========================================================================
section('E — Golden #34 verdict against the §33 matrix row');
// ===========================================================================
var MATRIX_34 = {
  'override saved': Number(cell(ssB, 'request_order_lines', 0, 'approved_qty')) === PARTIAL
    && Number(cell(ssB, 'purchase_order_lines', 0, 'ordered_qty')) === PARTIAL,
  'Suggested unchanged': Number(cell(ssB, 'request_order_lines', 0, 'recommended_qty')) === SUGGESTED
    && Number(cell(ssB, 'purchase_order_lines', 0, 'recommended_qty')) === SUGGESTED,
  'flagged user override': (Number(cell(ssB, 'purchase_order_lines', 0, 'ordered_qty')) % UPC) === 17
    && String(cell(ssB, 'purchase_order_lines', 0, 'note')) === NOTE,
  'independence': Number(cell(ssB, 'request_order_lines', 0, 'approved_qty')) !== Number(cell(ssB, 'request_order_lines', 0, 'recommended_qty'))
};
Object.keys(MATRIX_34).forEach(function (k) { ok(MATRIX_34[k] === true, 'E §33 #34 clause holds end-to-end: "' + k + '"'); });
ok(Object.keys(MATRIX_34).every(function (k) { return MATRIX_34[k] === true; }),
  'E-VERDICT all four §33 #34 clauses hold through the real Draft → Send → Request Order → Approval → PO chain');

console.log('\n' + (fail ? 'FAIL ' : 'PASS ') + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
