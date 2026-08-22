// Allocation Draft 30/28 reconciliation — C2-D1R source-contract tests.
// Verifies the system was aligned to the user-approved EXISTING live DB schema (30-col header route grain /
// 28-col line SKU+qty grain): the handler constants + write logic, completeness gates, the frontend flush
// route derivation, cancel-preserves-history, and no-reserve/no-deduct. Handler .gs cannot execute in Node,
// so the write-path items are asserted as exact structural source contracts (BROWSER/LIVE-DB-UNVERIFIED).
// Run: node assets/tests/allocation-draft-30-28-reconcile.test.js
var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GS = read('specs/active/apps-script/16_shipping_allocation_handlers.gs');
var PAGE = read('js/pages/inventory-replenishment.js');
var FREEZE = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'planning', 'ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// bring the REAL reconciled constants into scope
eval(GS.match(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = \[[\s\S]*?\];/)[0]);
eval(GS.match(/var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ = \[[\s\S]*?\];/)[0]);
var DRAFTS = SHIPPING_ALLOCATION_DRAFTS_HEADERS_, LINES = SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_;

var EXPECTED_DRAFTS = ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
  'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery',
  'generation_type', 'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of', 'draft_version',
  'created_by', 'created_at', 'updated_by', 'updated_at', 'submitted_by', 'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'];
// F1-7N-FA-3C-R6F1: the CANONICAL LIVE 30-col line schema (djb2 '|' fingerprint = e4880646). The per-source axis
// (source_warehouse_id / source_warehouse_code_snapshot) sits at its live position — immediately after recommended_qty,
// BEFORE the user Execution Plan. The prior R3C2 tail column source_allocated_qty_snapshot was an accidental
// source-only 31st field (never in the live DB) and has been REMOVED so the runtime authority == live schema exactly.
var EXPECTED_LINES = ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku',
  'window_code', 'window_start_date', 'window_end_date', 'required_by_date',
  'regular_demand_snapshot', 'special_event_demand_snapshot', 'destination_stock_snapshot',
  'qualified_incoming_snapshot', 'approved_supply_snapshot', 'calculated_gap_qty',
  'source_initial_available_qty_snapshot', 'source_available_before_allocation_snapshot', 'allocation_sequence',
  'recommendation_reason', 'recommendation_flags', 'recommended_qty',
  'source_warehouse_id', 'source_warehouse_code_snapshot',
  'planned_qty', 'units_per_carton', 'route_no', 'line_status', 'override_reason', 'note', 'created_at', 'updated_at'];

// =====================================================================================================
section('Constants byte-for-byte = approved 30/28 (§11.1, §11.2, §11.3, §11.4)');
ok(DRAFTS.length === 30 && JSON.stringify(DRAFTS) === JSON.stringify(EXPECTED_DRAFTS), 'R1 Draft Header constant is EXACTLY the approved 30 columns, in order');
ok(LINES.length === 30 && JSON.stringify(LINES) === JSON.stringify(EXPECTED_LINES), 'R2 Line Header constant is EXACTLY the canonical LIVE 30 columns (R6F1: source_warehouse_id/code at the live position; accidental R3C2 source_allocated_qty_snapshot removed), in order');
ok(DRAFTS.length !== 23, 'R3 no 23-column Draft Header expectation remains');
ok(LINES.indexOf('source_allocated_qty_snapshot') < 0, 'R4a accidental 31st field source_allocated_qty_snapshot is REMOVED (not in the live 30-col schema)');
ok(LINES.length !== 52 && LINES.indexOf('selected_source_warehouse_id') < 0 && LINES.indexOf('selected_destination_warehouse_id') < 0 &&
   LINES.indexOf('selected_shipping_method') < 0 && LINES.indexOf('user_edited') < 0 && LINES.indexOf('recommended_route_rule_id') < 0,
  'R4 no 52-column / selected_* / carrier-cost / user_edited Line expectation remains');

// =====================================================================================================
section('Route context is HEADER-level; line is SKU+qty (§3, §7)');
['recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_source_warehouse_code_snapshot',
  'recommended_destination_warehouse_code_snapshot', 'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery']
  .forEach(function (f) { ok(DRAFTS.indexOf(f) >= 0, 'R5 header carries route field ' + f); });
// header write persists the route fields (create + update paths)
ok(/procurementAppendByHeader_\(sh, \{[\s\S]*?recommended_source_warehouse_id:[\s\S]*?recommended_shipping_method:/.test(GS), 'R6 header CREATE writes the recommended_* route fields');
ok(/setCol\(f, String\(body\[f\]\)\)[\s\S]*?recommended_shipping_method/.test(GS) || /recommended_shipping_method'\][\s\S]{0,120}setCol/.test(GS), 'R7 header UPDATE writes the recommended_* route fields when provided');

// =====================================================================================================
section('Completeness gates (§8): PLAN_HEADER_INCOMPLETE / PLAN_LINE_INCOMPLETE');
ok(/function sadHeaderRouteIsComplete_\(b\)/.test(GS) && /recommended_source_warehouse_id[\s\S]*?recommended_shipping_method/.test(GS.match(/function sadHeaderRouteIsComplete_\(b\)[\s\S]*?\n}/)[0]), 'R8 sadHeaderRouteIsComplete_ checks From + To + Method on the header');
ok(/PLAN_HEADER_INCOMPLETE/.test(GS) && /hasRouteIntent[\s\S]*?sadHeaderRouteIsComplete_\(body\)[\s\S]*?PLAN_HEADER_INCOMPLETE/.test(GS), 'R9 partial header route → PLAN_HEADER_INCOMPLETE (zero mutation)');
var lineComplete = GS.match(/function sadLineIsComplete_\(l\)[\s\S]*?\n}/)[0];
ok(/l\.sku/.test(lineComplete) && /planned_qty/.test(lineComplete) && !/selected_shipping_method/.test(lineComplete), 'R10 sadLineIsComplete_ = SKU + Qty>0 (no selected_* on the line)');
ok(/PLAN_LINE_INCOMPLETE/.test(GS), 'R11 partial line → PLAN_LINE_INCOMPLETE');

// =====================================================================================================
section('K3 idempotency + cancel-preserves-history + no reserve/deduct (§4, §9, §12)');
// R6F2: the manual header core now delegates active-draft matching to the UNIFIED K2-or-K3 resolver (a route-complete
// header keys on the K2 group identity; a no-route scratchpad falls back to the K3 scope key). The K3 scope match
// (planning_cycle+company+country+marketplace+source_page) lives in sadResolveActiveDraft_ (reused unchanged).
ok(/sadResolveActiveDraftK2OrK3_\(sh, body/.test(GS), 'R12 header idempotency delegates to the unified K2-or-K3 resolver (reuse one Active Draft)');
ok(/planning_cycle[\s\S]{0,80}company[\s\S]{0,80}country[\s\S]{0,80}marketplace/.test(GS.match(/function sadResolveActiveDraft_\(sh, scope\)[\s\S]*?\n}/)[0] || ''), 'R12b the K3 scope-key match still keys on planning_cycle+company+country+marketplace');
// no hard delete of drafts/lines anywhere in the handler (cancel is soft = status/line_status)
ok(GS.indexOf('.deleteRow(') < 0 && GS.indexOf('deleteRows(') < 0, 'R13 handler never hard-deletes a Draft/line row (cancel is soft)');
ok(/setCol\('status', 'submitted'\)/.test(GS) && /submitted_by/.test(GS), 'R14 submit marks status=submitted + submitted_by/at (never deletes)');
// no reservation / stock deduction: the handler writes ONLY the two allocation-draft sheets.
var ensured = [], reSheet = /procurementEnsureSheet_\(\w+,\s*'([^']+)'/g, mSheet;
while ((mSheet = reSheet.exec(GS))) ensured.push(mSheet[1]);
ok(ensured.length > 0 && ensured.every(function (n) { return n === 'shipping_allocation_drafts' || n === 'shipping_allocation_draft_lines'; }), 'R15 handler writes ONLY the two allocation-draft sheets — no reservation / stock-deduction table touched');

// =====================================================================================================
section('Frontend flush derives the header route (§7) + docs agree (§11.15)');
ok(/var route0 = complete\[0\][\s\S]*?buildDraftHeaderPayload\(\{[\s\S]*?source_warehouse_id: route0\.source_warehouse_id/.test(PAGE), 'R16 flush derives the header route context from the scope\'s complete routes');
ok(/recommended_shipping_method/.test(GS) && /planned_qty/.test(FREEZE) && /header-level/i.test(FREEZE), 'R17 freeze doc documents the header-level route + line qty mapping');
ok(/Submit uses .*planned_qty.*recommended_qty|planned_qty.*when valid.*recommended_qty/i.test(FREEZE), 'R18 freeze doc records Submit qty authority (planned_qty before recommended_qty — SC-1)');

console.log('\n----------------------------------------');
console.log('ALLOCATION DRAFT 30/28 RECONCILE (C2-D1R): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
