// S6-R2 — SHIPPING / INVENTORY BUSINESS DECISION FREEZE.
//
// WHY THIS SUITE EXISTS. A decision round produces two kinds of statement, and only one of them is safe to
// leave as prose.
//
//   ALREADY_FROZEN rules are claims about live code. Written only in a document they rot exactly the way
//   SUPPLY_CHAIN_SYSTEM_FLOW §5.4 rotted — true when written, false two releases later, and nobody notices
//   because nothing checks. Each one is pinned here.
//
//   The two OPEN findings are claims that a specific mechanism is missing. They are pinned as MECHANISM
//   assertions, not as "the bug exists": the probe says what the code does today, so a later round that
//   changes it FAILS THIS SUITE and is forced to update the decision record rather than silently resolving
//   an operator decision on the operator's behalf.
//
// NO PRODUCTION WRITE. No sheet, no lock, no network. Source text and pure modules only.
//
// Run: node assets/tests/s6-r2-decision-board.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
var CORE = 'assets/js/core/';
var GS = 'assets/specs/active/apps-script/';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function fnBody(src, name) {
  var c = code(src);
  var i = c.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('function not found: ' + name);
  var j = c.indexOf('\nfunction ', i + 10);
  return c.slice(i, j < 0 ? c.length : j);
}

var KMFSG = require(path.join(ROOT, CORE + 'supply-planning-factory-stock-guard.js'));
var F11 = read(GS + '11_shipping_plan_handlers.gs');
var F12 = read(GS + '12_shipment_handlers.gs');
var F21 = read(GS + '21_factory_inventory_handlers.gs');
var F22 = read(GS + '22_shipment_dispatch_handlers.gs');
var F31 = read(GS + '31_shipment_receipt_route_handlers.gs');
var F71 = read(GS + '71_api_v1_factory_stock_guard.gs');
var COMPAT = read('assets/js/utils/inventory-compat.js');

// =========================================================================================================
section('A. OPEN FINDING 1 — an overseas-origin Shipment Draft is refused against factory stock');
// =========================================================================================================
//
// Four independent facts compose into one reachable dead end. Each is pinned separately so a failure names
// which link changed rather than only that the chain broke.

// A1 — the Ship From picker OFFERS an overseas 3PL warehouse. This is canonical and deliberate
// (inventory-compat buildCandidates: "3PL Overseas: same company + warehouse-country-compatible → both
// From and To"), so an operator choosing one is using the system as designed.
var CAND = fnBody(COMPAT, 'buildCandidates');
ok(/isOverseas3PL\s*\(\s*w\s*\)[^;]*from\.push\s*\(\s*w\s*\)/.test(CAND.replace(/\s+/g, ' ')) ||
   /isOverseas3PL[\s\S]{0,160}from\.push/.test(CAND),
  'A1 an Active overseas 3PL warehouse is a canonical Ship From candidate');

// A2 — shipment creation reads factory_stock for WHATEVER source the plan carries. There is no
// is_factory_warehouse branch anywhere in the creator.
var CREATE = fnBody(F12, 'createShipmentFromApprovedPlan_');
ok(CREATE.length > 4000, 'A2a the creator body was isolated, not truncated');
ok(/factoryStockReadBalanceTx_\s*\(\s*fcStockSheet\s*,\s*srcWarehouseId\s*,/.test(CREATE),
  'A2 sufficiency is checked against factory_stock at the plan\'s source_warehouse_id');
ok(!/is_factory_warehouse|isFactoryWarehouse/.test(CREATE),
  'A3 the creator has NO factory-warehouse branch — an overseas source takes the same path');

// A4 — a missing factory_stock row reads as zero, not as "not applicable". For an overseas warehouse there
// is no row BY DESIGN (§6.0 keeps the two inventory domains separate), so available is 0 and any positive
// quantity is short.
var BAL = fnBody(F21, 'factoryStockReadBalanceTx_');
ok(/return\s*\{\s*found:\s*false,\s*current:\s*0,\s*reserved:\s*0,\s*available:\s*0\s*\}/.test(BAL.replace(/\s+/g, ' ')),
  'A4 a missing factory_stock row reads available = 0');
ok(/reason:\s*'INSUFFICIENT_FACTORY_STOCK'/.test(CREATE),
  'A5 the refusal the operator receives names FACTORY stock, at a warehouse that is not a factory');

// A6 — and the guard upstream asks the operator to CONFIRM an overage against that same non-factory pool.
// Executed, because "the guard would report an overage" is exactly the kind of claim that should be run.
var eligible = { 'WH-TW-CN-FACTORY-YOUXIN': 1 };
var bal = KMFSG.normalizeBalances(
  [{ warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', sku: 'KM-1', fac_current_stock: 1000, fac_reserved_stock: 0 }],
  { eligibleWarehouseIds: eligible });
var ovsPlans = [{ shipping_plan_id: 'P-OVS', status: 'pending_approval',
  source_warehouse_id: 'WH-RESUS-US-3PL-WINIT', company: 'ResUS', country: 'US' }];
var ovsLines = [{ shipping_plan_id: 'P-OVS', sku: 'KM-1', requested_qty: 500, approved_qty: 500 }];
var pExSelf = KMFSG.planExposure(ovsPlans, ovsLines, { selfPlanId: 'P-OVS' });
var avSelf = KMFSG.availableToAllocate({ balances: bal, draftExposure: { byPool: {} }, planExposure: pExSelf });
var ov = KMFSG.evaluateOverage({ available: avSelf, planId: 'P-OVS', plans: ovsPlans,
  planLines: ovsLines, exposureRows: pExSelf.rows });
eq(ov.verdict, 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED',
  'A6 approving an overseas-source plan raises a FACTORY stock overage');
eq((ov.overage_pools || []).length, 1, 'A7 exactly one overage pool');
eq(ov.overage_pools[0].pool_row_found, false,
  'A8 the pool it asks the operator to confirm against has no factory_stock row at all');
eq(ov.overage_pools[0].overage_qty, 500, 'A9 the overage is the whole shipment');
eq(ov.overridable, true,
  'A10 and it is overridable — so confirming it lets the approval through to a refusal further down');

// A11 — the eligibility filter that makes this inevitable: only factory warehouses contribute a balance,
// while plan exposure is keyed on whatever source the plan names.
ok(/eligibleWarehouseIds:\s*eligible/.test(code(F71)) && /is_factory_warehouse/.test(code(F71)),
  'A11 balances are filtered to factory warehouses; plan exposure is not');

// =========================================================================================================
section('B. OPEN FINDING 2 — an approved plan with no shipment has no exit');
// =========================================================================================================

eq(/var VALID_TRANSITIONS = \[([^\]]*)\]/.exec(code(F11))[1].replace(/['\s]/g, '').split(','),
  ['submit', 'approve', 'reject', 'cancel'],
  'B1 the plan transition set is exactly four, and none of them starts from `approved`');

var STATUSCORE = fnBody(F11, 'spUpdateShippingPlanStatusCore_');
ok(/Only a Draft or Pending Approval plan can be cancelled/.test(STATUSCORE),
  'B2 cancel is refused from `approved`');
ok(/curStatus\s*!==\s*'draft'\s*&&\s*curStatus\s*!==\s*'pending_approval'/.test(STATUSCORE.replace(/\s+/g, ' ')),
  'B3 the cancel precondition is exactly draft | pending_approval');

var COMPLETE = fnBody(F11, 'handleCompleteShippingPlan_');
ok(/Only an Approved plan can be completed/.test(COMPLETE), 'B4 Done requires `approved`');
ok(/Execution Commit required before Done/.test(COMPLETE),
  'B5 Done ALSO requires a transferred shipment — so a plan with no shipment cannot be completed either');

// The consequence that makes this more than cosmetic: `approved` holds exposure until it is transferred,
// so a permanently-stuck plan permanently reduces availability for its pool.
ok(KMFSG.PLAN_EXPOSURE_STATUSES && KMFSG.PLAN_EXPOSURE_STATUSES.approved === 1,
  'B6 an approved plan holds factory-pool exposure');
var stuck = KMFSG.planExposure(
  [{ shipping_plan_id: 'P-STUCK', status: 'approved', source_warehouse_id: 'WH-F', company: 'C' }],
  [{ shipping_plan_id: 'P-STUCK', sku: 'S', approved_qty: 300 }], {});
eq(stuck.byPool[KMFSG.poolKey('WH-F', 'S', '')].qty, 300,
  'B7 an approved-but-never-transferred plan keeps subtracting its full quantity, with no way to release it');

// =========================================================================================================
section('C. ALREADY FROZEN — reservation timing and effects');
// =========================================================================================================

ok(/factoryStockAcquireReservationTx_\s*\(/.test(CREATE),
  'C1 FACTORY_RESERVATION_TIMING = Shipment Draft creation (Execution Commit)');
ok(!/factoryStockAcquireReservationTx_|factoryStockReleaseReservationTx_/.test(code(F11)),
  'C2 no plan transition reserves or releases — reservation is not a Decision-Layer effect');
// The overseas ledger MODELS a reserved bucket (from_stock_type/to_stock_type carry `reserved` in their
// allowed set) and nothing ever targets it. Probing the two live overseas movement writers for the bucket
// they actually address is exact where a `wh_reserved_stock` text search is not: that string also appears in
// the import alias map and as a literal 0 on a newly created snapshot row, neither of which is a reservation.
var OVS_MOVEMENT_WRITERS = [
  ['05_ adjust', fnBody(read(GS + '05_overseas_inventory_handlers.gs'), 'handleAdjustOverseasInventory_')],
  ['31_ receipt post', fnBody(F31, 'shipReceiptPostToOverseas_')]
];
OVS_MOVEMENT_WRITERS.forEach(function (pair) {
  ok(/to_stock_type[^;]{0,40}'available'/.test(pair[1]) && !/to_stock_type[^;]{0,40}'reserved'/.test(pair[1]),
    'C3 ' + pair[0] + ' moves stock into `available` and never into `reserved`');
});
ok(!/movement_scope[^;]{0,40}'reserved/.test(code(read(GS + '05_overseas_inventory_handlers.gs')) + code(F31)),
  'C4 OVERSEAS_RESERVATION_TIMING = NONE — no overseas movement addresses the reserved bucket');

// =========================================================================================================
section('D. ALREADY FROZEN — partial shipment / split / source selection');
// =========================================================================================================

var LINEQTY = fnBody(F11, 'handleUpdateShippingPlanLineQty_');
ok(/statusById\[parentId\]\s*!==\s*'draft'/.test(LINEQTY.replace(/\s+/g, ' ')),
  'D1 approved_qty is editable ONLY while the plan is Draft');
ok(/shipment_qty:\s*shipmentNum_\(plv\(lr, 'approved_qty'\)\)/.test(CREATE),
  'D2 shipment_qty is approved_qty verbatim — a Shipment Draft cannot partially consume the approved qty');
var EDITABLE = /var SHIPMENT_EDITABLE_FIELDS_ = \[([\s\S]*?)\];/.exec(F12)[1];
ok(!/'shipment_qty'/.test(EDITABLE),
  'D3 shipment_qty is not editable after creation — the Execution Snapshot is immutable');
ok(/reason: 'already_exists'/.test(CREATE),
  'D4 one Shipment Draft per approved plan — Plan→Shipment is 0..1, no execution split');
// Receipt, by contrast, IS partial: that asymmetry is deliberate and is the frozen rule.
ok(/partial_receipt|partially_received/.test(code(F31)),
  'D5 RECEIPT may be partial, and is reconciled through the ledger exactly-once');
// Source split happens by having more than one plan: source_warehouse_id is a grouping dimension.
ok(/source_warehouse_id/.test(/dimensions: \[([^\]]*)\]/.exec(F11)[1]),
  'D6 source_warehouse_id is a plan grouping dimension — two sources are two plans, never one split plan');

// =========================================================================================================
section('E. ALREADY FROZEN — source priority is the operator, not an algorithm');
// =========================================================================================================

// `allocation_priority` is a RECEIVER (destination marketplace) priority. It is not, and must not become,
// a priority between inventory source domains.
ok(/marketplaces\.allocation_priority/.test(read(CORE + 'supply-planning-factory-stock-guard.js')),
  'E1 allocation_priority is a marketplaces (receiver) column');
ok(!/factoryFirst|FACTORY_FIRST|sourcePriority|source_priority/.test(code(F11) + code(F12) + CAND),
  'E2 AUTOMATIC_SOURCE_PRIORITY_EXISTS = NO — no rule ranks factory against overseas stock');

// =========================================================================================================
section('F. ALREADY FROZEN — carrier authority is three layers, and none of them is automatic');
// =========================================================================================================

var KMMR = read(CORE + 'supply-planning-method-recommendation.js');
ok(/Layer 1\s+AI Plan/.test(KMMR) && /Layer 2\s+Weekly Shipping Plan/.test(KMMR) && /Layer 3\s+Submit Plan/.test(KMMR),
  'F1 the three-layer carrier boundary is declared by its owner');
ok(/carrier NOT auto-switched|NEVER a silently-switched carrier/.test(F12),
  'F2 the shipment resolves an EXACT rate card and never silently switches carrier');
ok(/rateReview/.test(code(F12)),
  'F3 no exact rate card = RATE REVIEW with blank estimates, not a substituted carrier');

// =========================================================================================================
section('G. ALREADY FROZEN — delivered is not received');
// =========================================================================================================

var POSTDEC = fnBody(F31, 'shipReceiptPostingDecision_');
ok(/SKIP_FACTORY/.test(POSTDEC), 'G1 a factory destination is never credited with overseas stock');
ok(/SKIP_NOT_MANAGED/.test(POSTDEC) && /SKIP_INACTIVE/.test(POSTDEC),
  'G2 only an eligible managed-Overseas destination POSTs; everything else skips and the receipt still succeeds');
ok(!/delivered/.test(POSTDEC),
  'G3 DESTINATION_AVAILABILITY_EVENT is the warehouse receipt — `delivered` posts nothing');
var POSTAMT = fnBody(F31, 'shipReceiptPostAmount_');
ok(/Math\.max\(/.test(POSTAMT),
  'G4 the receipt posts the DELTA against the ledger, so a crash mid-write repairs exactly-once');

// =========================================================================================================
section('H. ALREADY FROZEN — route freeze and forward-only advance');
// =========================================================================================================

ok(/fcWriteEnsureSheet_\(ss, 'shipment_routes', ROUTE_HEADERS\)/.test(code(F22)),
  'H1 ROUTE_FREEZE_EVENT = Confirm Shipment & Dispatch snapshots the legs');
ok(/existingRoutes\s*>\s*0/.test(code(F22)),
  'H2 an existing route snapshot makes a second dispatch idempotent — the route is never re-snapshotted');
var RESOLVE = fnBody(F31, 'shipRouteResolveMove_');
ok(/ROUTE_BACKWARD/.test(RESOLVE),
  'H3 POST_DISPATCH_ROUTE_EDIT_ALLOWED = forward advance only; backward is refused');
ok(!/deleteRow|insertRow/.test(fnBody(F31, 'handleAdvanceShipmentRoutePoint_')),
  'H4 advancing adds and removes no leg — the snapshot shape is frozen at dispatch');

// =========================================================================================================
section('I. BOUNDARY — unchanged from S6-R1');
// =========================================================================================================

ok(!/handleCreateRequestOrderDraft_|handleConvertRequestToPo/.test(code(F11)),
  'I1 WEEKLY_PLAN_AUTO_CREATES_PO = NO and WEEKLY_PLAN_AUTO_CREATES_REQUEST_ORDER = NO');
ok(!/totalRecommendedQty/.test(code(F11) + code(F12)),
  'I2 S5_RECOMMENDATION_AUTO_SHIPMENT = NO');
ok(/createShipmentFromApprovedPlan_/.test(code(F11)) &&
   !/createShipmentFromApprovedPlan_/.test(code(read(GS + '13_procurement_handlers.gs'))),
  'I3 REQUEST_ORDER_AUTO_SHIPMENT = NO and PO_AUTO_SHIPMENT = NO');

// =========================================================================================================
console.log('\n=====================================================');
console.log('S6-R2 DECISION BOARD — ' + pass + ' passed / ' + fail + ' failed');
if (fail === 0) {
  console.log('OPEN_FINDINGS = 2 (overseas-origin refusal · approved-plan dead end)');
  console.log('FACTORY_RESERVATION_TIMING = SHIPMENT_DRAFT_CREATION');
  console.log('OVERSEAS_RESERVATION_TIMING = NONE');
  console.log('AUTOMATIC_SOURCE_PRIORITY_EXISTS = NO   SOURCE_SELECTION_AUTHORITY = OPERATOR');
  console.log('DESTINATION_AVAILABILITY_EVENT = WAREHOUSE_RECEIPT');
  console.log('ROUTE_FREEZE_EVENT = CONFIRM_SHIPMENT_AND_DISPATCH   POST_DISPATCH_ROUTE_EDIT = FORWARD_ONLY');
  console.log('PHASE2_DECISION_COUNT_IMPLEMENTED_NOW = 0   PRODUCTION_ROWS_WRITTEN = 0');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
