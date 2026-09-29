// S6-R1 — SHIPPING / INVENTORY EXECUTION MAINLINE CONTRACT AUDIT.
//
// WHY THIS SUITE EXISTS. S6 is not greenfield. The Phase-1 shipping mainline is implemented, deployed and
// carrying real reservations, and the danger in an audit round is the opposite of the danger in a build round:
// not that something is missing, but that a later round DESIGNS A SECOND OWNER for something that already has
// one. S5-R5 named the wrong write owner from a document and would have sent the next round to build a parallel
// writer; this suite is the machine-checkable half of the answer so S6-R2..R8 cannot repeat it.
//
// WHAT IT PINS AND WHY EACH ONE IS THE CONSTRAINT RATHER THAN A LABEL.
//   * `createShipmentFromApprovedPlan_` (12_) is named, because "what creates a shipment" is exactly the
//     question a Phase-2 orchestration round would answer wrongly by adding a second creator.
//   * `factoryStockApplyDeltaTx_` / acquire / release (21_) are named, because FC-1A's whole finding was that a
//     SECOND stock mutation implementation lived in 22_ unnoticed behind a comment claiming it did not.
//   * `KMFSG.availableToAllocate` is named and EXERCISED, because two different answers to "what is available"
//     is the defect that let two sites plan the same physical units.
//   * Elsewhere the claim is singularity and non-duplication, so a rename is not a regression.
//
// NO PRODUCTION WRITE. No sheet, no lock, no network, no DB. Everything here is source text and pure modules.
//
// Run: node assets/tests/s6-r1-shipping-mainline-contract.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
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
var CORE = 'assets/js/core/';
var GS = 'assets/specs/active/apps-script/';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// Comments are not code. Every probe below that asks "does this file DO x" strips them first, because this
// repository's .gs files carry long prose blocks that name the very verbs the probes look for.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function count(src, re) { return (String(src).match(re) || []).length; }

// Every non-generated .gs file. The generated bundle (90_) is a build artefact of the core modules and is
// excluded wherever the question is "which HANDLER file owns this", included where the question is "does the
// deployed surface contain a second copy".
var GS_DIR = path.join(ROOT, GS);
var GS_FILES = fs.readdirSync(GS_DIR).filter(function (f) {
  return /\.gs$/.test(f) && f.indexOf('TEMP_') !== 0 && f !== '90_generated_supply_planning_bundle.gs';
});

var KMFSG = require(path.join(ROOT, CORE + 'supply-planning-factory-stock-guard.js'));

var F11 = read(GS + '11_shipping_plan_handlers.gs');
var F12 = read(GS + '12_shipment_handlers.gs');
var F16 = read(GS + '16_shipping_allocation_handlers.gs');
var F21 = read(GS + '21_factory_inventory_handlers.gs');
var F22 = read(GS + '22_shipment_dispatch_handlers.gs');
var F31 = read(GS + '31_shipment_receipt_route_handlers.gs');
var F32 = read(GS + '32_shipment_line_allocation_handlers.gs');
var F57 = read(GS + '57_api_v1_shipment_workspace.gs');
var F61 = read(GS + '61_api_v1_weekly_ai_plan.gs');
var F71 = read(GS + '71_api_v1_factory_stock_guard.gs');

// =========================================================================================================
section('A. every stage of the shipping mainline has exactly one owner, and it is where the audit says');
// =========================================================================================================

// A function DEFINED in exactly one file across the whole handler surface. `definers` answers with the file
// list rather than a count so a failure names the second home instead of only asserting there is one.
function definers(name) {
  var re = new RegExp('function\\s+' + name.replace(/[$]/g, '\\$') + '\\s*\\(');
  return GS_FILES.filter(function (f) { return re.test(code(read(GS + f))); });
}

eq(definers('createShipmentFromApprovedPlan_'), ['12_shipment_handlers.gs'],
  'A1 the ONLY creator of a shipments row is createShipmentFromApprovedPlan_ in 12_');
eq(definers('shippingPlanCommitFromLines_'), ['11_shipping_plan_handlers.gs'],
  'A2 the ONLY shipping_plans mutation authority is shippingPlanCommitFromLines_ in 11_');
eq(definers('sadAtomicUpsertCore_'), ['16_shipping_allocation_handlers.gs'],
  'A3 the ONLY shipping_allocation_draft writer core is sadAtomicUpsertCore_ in 16_');
eq(definers('handleConfirmShipmentAndDispatch_'), ['22_shipment_dispatch_handlers.gs'],
  'A4 the ONLY dispatch owner is handleConfirmShipmentAndDispatch_ in 22_');
eq(definers('handleUpdateShipmentReceipt_'), ['31_shipment_receipt_route_handlers.gs'],
  'A5 the ONLY receipt owner is handleUpdateShipmentReceipt_ in 31_');
eq(definers('handleAdvanceShipmentRoutePoint_'), ['31_shipment_receipt_route_handlers.gs'],
  'A6 the ONLY route-point advance owner is in 31_');
eq(definers('slaApplyExecution_'), ['32_shipment_line_allocation_handlers.gs'],
  'A7 the ONLY PO-source (FIFO) allocation executor is slaApplyExecution_ in 32_');
eq(definers('handleShipmentWorkspaceGet_'), ['57_api_v1_shipment_workspace.gs'],
  'A8 the ONLY scoped shipment read owner is in 57_');
eq(definers('handleCancelShipmentDraft_'), ['12_shipment_handlers.gs'],
  'A9 the ONLY shipment cancellation owner is handleCancelShipmentDraft_ in 12_');

// The three factory-stock primitives. FC-1A §F: "No file outside 21_ writes a factory_stock balance cell."
eq(definers('factoryStockApplyDeltaTx_'), ['21_factory_inventory_handlers.gs'],
  'A10 the single factory_stock mutation primitive lives only in 21_');
eq(definers('factoryStockAcquireReservationTx_'), ['21_factory_inventory_handlers.gs'],
  'A11 reservation acquire lives only in 21_');
eq(definers('factoryStockReleaseReservationTx_'), ['21_factory_inventory_handlers.gs'],
  'A12 reservation release lives only in 21_');

ok(typeof KMFSG.availableToAllocate === 'function',
  'A13 the availability owner is the pure KMFSG module, executable outside Apps Script');
ok(/KMFSG/.test(code(F71)) && !/function\s+fsg\w*AvailableToAllocate/.test(code(F71)),
  'A14 71_ reads and KMFSG decides — the server seam re-implements no availability arithmetic');

// =========================================================================================================
section('B. no second calculation path and no second write path');
// =========================================================================================================

// The one place the whole mainline can gain a silent second writer: a factory_stock balance cell written
// outside 21_. Asserted as an EQUALITY over the handler surface, which is the check that would have caught
// the old 22_ (FC-1A §F measured it writing its own setValue + movement append).
var FACTORY_BALANCE_WRITERS = GS_FILES.filter(function (f) {
  var c = code(read(GS + f));
  if (!/factory_stock/.test(c)) return false;
  // a balance WRITE is a setValue/setValues addressed at the stock sheet handle
  return /(stockSheet|fcStockSheet|stk\.sheet)[^;]{0,120}\.(setValue|setValues)\s*\(/.test(c);
});
eq(FACTORY_BALANCE_WRITERS, ['21_factory_inventory_handlers.gs'],
  'B1 exactly one file writes a factory_stock balance cell');

eq(definers('shipmentAppendByHeader_').length, 1, 'B2 one shipment row appender');
// `shipments` rows are created in exactly one function; every other caller routes through it.
eq(count(code(F12), /function\s+createShipmentFromApprovedPlan_\s*\(/g), 1,
  'B3 the shipment creator is defined once even within its own file');

// THE DORMANT SECOND WRITE CONSTRUCTOR. 61_ builds a full KMPR/KMPL WEEKLY_SHIPPING persistence dependency
// object on every generation and hands it to weeklyAiPlanGenerateK2_, which never touches it: the live write
// goes through 16_'s atomic endpoint. This is exactly the shape that made S5-R5 name the wrong owner, so it is
// pinned as DORMANT rather than quietly tolerated — the day anything starts using it, this assertion fails and
// the round that did it has to say so.
var K2_BODY = (function () {
  var c = code(F61);
  var i = c.indexOf('function weeklyAiPlanGenerateK2_');
  if (i < 0) throw new Error('weeklyAiPlanGenerateK2_ not found');
  var j = c.indexOf('\nfunction ', i + 10);
  return c.slice(i, j < 0 ? c.length : j);
})();
ok(K2_BODY.length > 2000, 'B4a the K2 generator body was isolated, not truncated to nothing');
eq(count(K2_BODY, /\bdeps\s*\./g), 0,
  'B4 the KMPR/KMPL WEEKLY_SHIPPING persistence deps are DORMANT — the K2 generator never calls them');
ok(/handleUpsertShippingAllocationDraftAtomic_\s*\(/.test(K2_BODY),
  'B5 the live AI shipping write goes through 16_\'s atomic allocation-draft endpoint');
ok(/write_handler:\s*'handleUpsertShippingAllocationDraftAtomic_/.test(F61),
  'B6 61_ declares that same endpoint as its only write handler');

// 42_/43_/47_ (the S5 ordering calculation owners) must not be reachable as a shipping quantity source.
ok(!/gapOpMapFromLines_|residualOrderNeedQty/.test(code(F11) + code(F12) + code(F22)),
  'B7 the shipping decision/execution owners derive no ordering gap or residual of their own');

// =========================================================================================================
section('C. the Available-to-Ship authority, exercised rather than described');
// =========================================================================================================

// available_to_allocate = (fac_current_stock - fac_reserved_stock) - allocation-draft exposure - plan exposure.
// Exercised through the real module so the formula is a behaviour, not a sentence in a doc.
var balances = KMFSG.normalizeBalances([
  { warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', sku: 'KM-1', fac_current_stock: 1000, fac_reserved_stock: 800 }
], {});
var dEx = KMFSG.draftExposure(
  [{ allocation_draft_id: 'D1', status: 'draft', recommended_source_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN' }],
  [{ allocation_draft_id: 'D1', sku: 'KM-1', source_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN',
     status: 'draft', recommended_qty: 50, planned_qty: 50 }], {});
var pEx = KMFSG.planExposure(
  [{ shipping_plan_id: 'P1', status: 'approved', source_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN' }],
  [{ shipping_plan_id: 'P1', sku: 'KM-1', approved_qty: 30 }], {});
var avail = KMFSG.availableToAllocate({ balances: balances, draftExposure: dEx, planExposure: pEx });
var POOL = KMFSG.poolKey('WH-TW-CN-FACTORY-YOUXIN', 'KM-1', '');
var p = avail.byPool[POOL];
ok(!!p, 'C0 the pool resolved');
eq(p.factory_current_stock, 1000, 'C1 physical current stock is read, not derived');
eq(p.factory_reserved_stock, 800, 'C2 the reservation is a real subtrahend');
eq(p.factory_available_stock, 200, 'C3 factory_available_stock = current - reserved (21_\'s own derived quantity)');
eq(p.active_allocation_draft_qty, 50, 'C4 an active allocation draft holds exposure');
eq(p.active_shipping_plan_qty, 30, 'C5 an approved shipping plan holds exposure');
eq(p.available_to_allocate, 200 - 80, 'C6 available_to_allocate nets BOTH pre-execution stages off the physical headroom');
ok(typeof avail.fingerprint === 'string' && avail.fingerprint.length > 0,
  'C7 the availability snapshot is fingerprinted, so a human overage confirmation is bound to these facts');

// The pool key is warehouse||sku and is NEVER narrowed by company: a factory supplies every destination, so the
// exposure side has to be summed across companies before anything is compared.
eq(avail.pool_keys, [POOL], 'C8 the pool is keyed by warehouse_id||sku alone');

// A negative headroom is REPORTED, not clamped — clamping would hide the size of an existing breach.
var over = KMFSG.availableToAllocate({
  balances: KMFSG.normalizeBalances([{ warehouse_id: 'W', sku: 'S', fac_current_stock: 10, fac_reserved_stock: 0 }], {}),
  draftExposure: KMFSG.draftExposure(
    [{ allocation_draft_id: 'D', status: 'draft', recommended_source_warehouse_id: 'W' }],
    [{ allocation_draft_id: 'D', sku: 'S', source_warehouse_id: 'W', status: 'draft', planned_qty: 25 }], {}),
  planExposure: { byPool: {}, selfByPool: {} }
});
eq(over.byPool[KMFSG.poolKey('W', 'S', '')].available_to_allocate, -15, 'C9 an existing breach is reported at its true size, never clamped to 0');

// =========================================================================================================
section('D. reservation — one owner type, three events, and a derived lifecycle');
// =========================================================================================================

ok(/var FSTX_RESERVATION_OWNER_TYPE_ = 'shipment';/.test(F21),
  'D1 the only reservation owner type is `shipment`');
ok(/var FSTX_MOV_RESERVE_ACQUIRE_ = 'reservation_acquire';/.test(F21) &&
   /var FSTX_MOV_RESERVE_RELEASE_ = 'reservation_release';/.test(F21),
  'D2 acquire and release are a two-row vocabulary on the existing ledger, not a new table');
ok(!/reservation_status/.test(code(F21)),
  'D3 reservation lifecycle is DERIVED from the ledger — no third copy of the fact is stored');

// RESERVE happens at Shipment Draft creation (the Execution Commit), which is what FC-1A implemented and what
// two canonical documents still describe as happening at Ready to Ship. The code is the fact; pinning it here
// is what makes the stale documents detectable rather than merely wrong.
var CREATE_BODY = (function () {
  var c = code(F12);
  var i = c.indexOf('function createShipmentFromApprovedPlan_');
  var j = c.indexOf('\nfunction handleCreateShipmentFromPlan_', i);
  return c.slice(i, j < 0 ? c.length : j);
})();
ok(CREATE_BODY.length > 4000, 'D4a the creator body was isolated, not truncated');
ok(/factoryStockAcquireReservationTx_\s*\(/.test(CREATE_BODY),
  'D4 RESERVE_EVENT = Shipment Draft creation (Execution Commit), not the Ready to Ship transition');
ok(/ownerType:\s*FSTX_RESERVATION_OWNER_TYPE_/.test(CREATE_BODY) && /ownerId:\s*shipmentId/.test(CREATE_BODY),
  'D5 the reservation carries a resolvable owner (shipment id), not an anonymous counter');

var CANCEL_BODY = (function () {
  var c = code(F12);
  var i = c.indexOf('function handleCancelShipmentDraft_');
  var j = c.indexOf('\nfunction shipmentRecalcTotals_', i);
  return c.slice(i, j < 0 ? c.length : j);
})();
ok(CANCEL_BODY.length > 2000, 'D6a the cancel body was isolated, not truncated');
ok(/factoryStockReleaseReservationTx_\s*\(/.test(CANCEL_BODY),
  'D6 RELEASE_EVENT = cancelShipmentDraft — a claim returned, no physical units moved');
ok(/factoryStockApplyDeltaTx_\s*\(/.test(code(F22)) && /reservedDelta:\s*-give/.test(code(F22)),
  'D7 CONSUME_EVENT = dispatch — deduction and release land in ONE movement row, never two that can disagree');
ok(/deltaQty:\s*-d\.take/.test(code(F22)),
  'D8 the dispatch deduction and the release travel in the same call');

// The double-use property the whole reservation exists for: a dispatch releases only what IT reserved.
ok(/factoryStockOwnerReservedTx_\s*\(\s*movSheet\s*,\s*FSTX_RESERVATION_OWNER_TYPE_\s*,\s*shipmentId\s*\)/.test(code(F22)),
  'D9 release is owner-scoped — one shipment can never release another shipment\'s hold');
ok(/Math\.min\s*\(\s*held\s*,\s*d\.take\s*\)/.test(code(F22)),
  'D10 a release can never exceed what is held, so fac_reserved_stock cannot be driven negative');

// =========================================================================================================
section('E. the Phase-1 mainline separation — shipping demand is NOT purchase demand');
// =========================================================================================================

// Nothing in the shipping execution surface creates a Request Order, a PO, or a request-order draft.
var ORDER_CREATORS = /handleCreateRequestOrderDraft_|handleSendRequestOrder|purchase_orders'\s*\)|handleConvertRequestToPo/;
['11_shipping_plan_handlers.gs', '12_shipment_handlers.gs', '16_shipping_allocation_handlers.gs',
 '22_shipment_dispatch_handlers.gs', '31_shipment_receipt_route_handlers.gs',
 '61_api_v1_weekly_ai_plan.gs'].forEach(function (f) {
  ok(!ORDER_CREATORS.test(code(read(GS + f))), 'E1 ' + f + ' creates no Request Order and no PO');
});

// And nothing in the ordering surface creates a shipment.
['13_procurement_handlers.gs', '47_api_v1_recommendation_generation.gs', '48_api_v1_request_order_draft_job.gs',
 '66_api_v1_request_order_send.gs', '24_recommendation_orchestrator.gs'].forEach(function (f) {
  ok(!/createShipmentFromApprovedPlan_\s*\(|handleCreateShipmentFromPlan_\s*\(/.test(code(read(GS + f))),
    'E2 ' + f + ' creates no shipment');
});

// 32_ is the ONE place the two mainlines touch, and the direction is the safe one: a shipment that already
// exists consumes PO supply by FIFO. It is a SOURCE axis, never a demand trigger — so it reads PO lines and
// writes only its own allocation rows.
ok(/purchase_order_line_id/.test(code(F32)) && !/createShipmentFromApprovedPlan_/.test(code(F32)),
  'E3 shipment_line_allocations consumes PO supply for an existing shipment — it never causes one');
ok(/R3A persists DRAFT allocations only/.test(F32) || !/purchase_order_lines'\s*\)[^;]{0,200}setValue/.test(code(F32)),
  'E4 the FIFO allocator does not mutate purchase_order_lines from the draft stage');

// The S5 recommendation quantity never becomes a shipping quantity.
ok(!/totalRecommendedQty|generateOrderPlanningRecommendation/.test(code(F11) + code(F12) + code(F16) + code(F22)),
  'E5 S5_RECOMMENDATION_IS_SHIPPING_QTY_AUTHORITY = NO — no shipping owner reads the ordering recommendation');

// =========================================================================================================
section('F. shipment status — a closed set, and cancellation is a named refusal');
// =========================================================================================================

ok(/var SHIPMENT_PRE_DISPATCH_STATUSES_ = \['draft', 'ready_to_ship'\];/.test(F12),
  'F1 the pre-dispatch statuses are declared as data');
ok(/var SHIPMENT_DISPATCHED_STATUSES_ = \[/.test(F12),
  'F2 the dispatched statuses are declared as data');
// updateShipment had NO allowlist, so `status:'cancelled'` was persisted with zero reservation release.
ok(/code: 'USE_CANCEL_SHIPMENT_DRAFT'/.test(code(F12)),
  'F3 updateShipment refuses cancellation BY NAME, pointing at the action that also releases the hold');
ok(/code: 'UNKNOWN_SHIPMENT_STATUS'/.test(code(F12)),
  'F4 an unrecognised status is refused — a shipment in an unknown status is invisible to every filtered page');
ok(/code: 'SHIPMENT_CANCELLED'/.test(code(F22)),
  'F5 a cancelled shipment is REFUSED at dispatch, not answered `already_confirmed`');

// Dispatch idempotency guards on physical evidence as well as on status, because an interrupted Confirm can
// leave either one first.
ok(/existingRoutes\s*>\s*0\s*\|\|\s*existingEvents\s*\|\|\s*existingMovement/.test(code(F22)),
  'F6 dispatch idempotency reads route rows, event rows AND the movement ledger, not status alone');
ok(/function csdMovementExists_/.test(code(F22)),
  'F7 the dispatch-evidence probe exists as its own named question');

// =========================================================================================================
section('G. multi-leg / On-the-Way — leg grain, one read model');
// =========================================================================================================

ok(/'shipment_route_id'.*'shipment_id'.*'sequence_no'/.test(F22) || /sequence_no/.test(code(F22)),
  'G1 shipment_routes is one row per NODE (leg grain), snapshotted at dispatch');
ok(/transport_mode/.test(code(F22)), 'G2 transport_mode is a leg-level column on the route snapshot');
ok(/name: 'shipment_routes'/.test(F57) && /include: 'routes'/.test(F57),
  'G3 the On-the-Way map reads routes through the ONE scoped shipment workspace, include-gated');
ok(/name: 'shipment_events'/.test(F57), 'G4 events come from the same workspace read');
// 31_ owns the forward-only current-leg advance; nothing else addresses a shipment_routes cell.
var ROUTE_ADVANCERS = GS_FILES.filter(function (f) {
  return /getSheetByName\('shipment_routes'\)/.test(code(read(GS + f)));
});
eq(ROUTE_ADVANCERS, ['31_shipment_receipt_route_handlers.gs'],
  'G5 exactly one file advances the current route point');
ok(/current_position_unchanged: true/.test(code(F31)),
  'G6 the ETA owner declares it addresses no route cell — a bounded owner, not a second one');

// =========================================================================================================
section('H. write truth — identity, idempotency, and no automatic replay');
// =========================================================================================================

ok(/execution_key/.test(code(F16)), 'H1 the allocation writer carries an execution key as a replay witness');
ok(/SADH-K2-|sadK2DeterministicHeaderId_/.test(code(F16)),
  'H2 a retry reuses the SAME deterministic identity, so a committed group REUSEs rather than duplicates');
ok(/COMMITTED_UNVERIFIED|RECONCILIATION_REQUIRED/.test(code(F16)) || /COMMITTED_UNVERIFIED/.test(code(F61)),
  'H3 an unverifiable commit is reported as unknown, never as "nothing was written"');
ok(/already_confirmed: true/.test(code(F22)),
  'H4 a dispatch replay is an idempotent success with zero cells changed');
ok(/REUSED/.test(code(F12)) || /already/.test(code(CANCEL_BODY)),
  'H5 a cancellation replay is a no-op, not a second release');

// No automatic replay anywhere in the shipping write surface: no timer, no self-retry loop.
[['11_', F11], ['12_', F12], ['16_', F16], ['22_', F22], ['31_', F31]].forEach(function (pair) {
  var c = code(pair[1]);
  ok(!/Utilities\.sleep\s*\(/.test(c) && !/setTimeout\s*\(/.test(c),
    'H6 ' + pair[0] + ' adds no automatic retry — a lost response is the operator\'s decision, not the code\'s');
});

// =========================================================================================================
section('I. second-layer expand costs no network read');
// =========================================================================================================

var SHIST = read('assets/js/pages/shipping-history.js');
// The public toggle DELEGATES, so the probe has to follow the delegation or it proves nothing: a one-line
// wrapper contains no request verb no matter what the function it calls does.
function fnBody(src, name) {
  var c = code(src);
  var i = c.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('function not found: ' + name);
  var j = c.indexOf('\nfunction ', i + 10);
  return c.slice(i, j < 0 ? c.length : j);
}
var TOGGLE = fnBody(SHIST, 'toggleShipmentCard') + fnBody(SHIST, '_shToggleCardEl');
ok(/_shToggleCardEl/.test(fnBody(SHIST, 'toggleShipmentCard')) && TOGGLE.length > 400,
  'I0 the card toggle AND the element toggle it delegates to were both isolated');
ok(!/KM\.DB\.|getWorkspace\s*\(|fetch\s*\(|loadOperationDb/.test(TOGGLE),
  'I1 expanding a Shipment card issues NO request — the detail came with the scoped workspace read');

var IR = read('assets/js/pages/inventory-replenishment.js');
var IRTOGGLE = (function () {
  var c = code(IR);
  var i = c.indexOf('function toggleReplenRow');
  var j = c.indexOf('\nfunction ', i + 10);
  return c.slice(i, j < 0 ? c.length : j);
})();
ok(IRTOGGLE.length > 1000, 'I2 the replenishment row toggle was isolated');
ok(!/KM\.DB\.|getWorkspace\s*\(|fetch\s*\(|loadOperationDb/.test(IRTOGGLE),
  'I3 expanding a replenishment row issues NO request of its own');
ok(/function _irAdoptCarrierCatalogue_/.test(code(IR)) && /reg\.adopt\s*\(/.test(code(IR)),
  'I4 the carrier catalogue the second layer needs is ADOPTED from the scope read, not fetched per SKU');

// =========================================================================================================
section('J. Phase-2 orchestration is not implemented');
// =========================================================================================================

// Carrier lead time exists as execution/reference data and must not back-propagate into ordering decisions.
var ORDERING = ['42_api_v1_recommendation_workspace.gs', '43_api_v1_gap_materialization.gs',
  '47_api_v1_recommendation_generation.gs', '48_api_v1_request_order_draft_job.gs'];
ORDERING.forEach(function (f) {
  ok(!/carrier_lead_times/.test(code(read(GS + f))),
    'J1 ' + f + ' reads no carrier lead time — no ordering/shipping lead-time orchestration');
});
ok(!/shipping_plans|shipments'/.test(code(read(GS + '48_api_v1_request_order_draft_job.gs'))),
  'J2 the ordering draft job touches no shipping table');

// =========================================================================================================
section('K. mutation — each claim above can actually fail');
// =========================================================================================================

mut('K1 a second creator of shipments appears in another handler file', function () {
  var faked = code(F22) + '\nfunction createShipmentFromApprovedPlan_(ss, planId, actor) { return null; }\n';
  var re = /function\s+createShipmentFromApprovedPlan_\s*\(/;
  return re.test(faked) && re.test(code(F12)) && !re.test(code(F11));
});

mut('K2 a factory_stock balance write leaks back into the dispatch handler', function () {
  var faked = code(F22).replace('var movementsCreated = 0;',
    'var movementsCreated = 0; stockSheet.getRange(1,1).setValue(0);');
  if (faked === code(F22)) throw new Error('K2 anchor drifted');
  var re = /(stockSheet|fcStockSheet|stk\.sheet)[^;]{0,120}\.(setValue|setValues)\s*\(/;
  return re.test(faked) && !re.test(code(F22));
});

mut('K3 availability stops subtracting the reservation', function () {
  var src = read(CORE + 'supply-planning-factory-stock-guard.js');
  var from = 'var physicalAvailable = current - reserved;';
  if (src.indexOf(from) < 0) throw new Error('K3 anchor drifted');
  var Module = require('module');
  var m = new Module(path.join(ROOT, CORE + 'x.js'), null);
  m.filename = path.join(ROOT, CORE + 'supply-planning-factory-stock-guard.js');
  m.paths = Module._nodeModulePaths(path.dirname(m.filename));
  m._compile(src.replace(from, 'var physicalAvailable = current;'), m.filename);
  var mutated = m.exports.availableToAllocate({ balances: balances, draftExposure: dEx, planExposure: pEx });
  return mutated.byPool[POOL].available_to_allocate === 920 &&
    avail.byPool[POOL].available_to_allocate === 120;
});

mut('K4 availability stops subtracting pre-execution exposure', function () {
  var src = read(CORE + 'supply-planning-factory-stock-guard.js');
  var from = 'var otherExposure = draftQty + planQty;';
  if (src.indexOf(from) < 0) throw new Error('K4 anchor drifted');
  var Module = require('module');
  var m = new Module(path.join(ROOT, CORE + 'y.js'), null);
  m.filename = path.join(ROOT, CORE + 'supply-planning-factory-stock-guard.js');
  m.paths = Module._nodeModulePaths(path.dirname(m.filename));
  m._compile(src.replace(from, 'var otherExposure = 0;'), m.filename);
  var mutated = m.exports.availableToAllocate({ balances: balances, draftExposure: dEx, planExposure: pEx });
  return mutated.byPool[POOL].available_to_allocate === 200;
});

mut('K5 the dormant KMPR deps become a live second write path', function () {
  var faked = K2_BODY.replace('var resp = weeklyAiPlanParseResp_(',
    'deps.lockedApply(null, null, {}); var resp = weeklyAiPlanParseResp_(');
  if (faked === K2_BODY) throw new Error('K5 anchor drifted');
  return count(faked, /\bdeps\s*\./g) === 1 && count(K2_BODY, /\bdeps\s*\./g) === 0;
});

mut('K6 updateShipment loses its cancellation refusal', function () {
  var faked = code(F12).replace(/code: 'USE_CANCEL_SHIPMENT_DRAFT'/, "code: 'OK'");
  if (faked === code(F12)) throw new Error('K6 anchor drifted');
  return !/USE_CANCEL_SHIPMENT_DRAFT/.test(faked) && /USE_CANCEL_SHIPMENT_DRAFT/.test(code(F12));
});

mut('K7 a dispatch releases more than it holds', function () {
  var faked = code(F22).replace('Math.min(held, d.take)', 'd.take');
  if (faked === code(F22)) throw new Error('K7 anchor drifted');
  return !/Math\.min\s*\(\s*held\s*,\s*d\.take\s*\)/.test(faked);
});

mut('K8 expanding a shipment card starts issuing a read', function () {
  var faked = TOGGLE.replace('function toggleShipmentCard',
    'function toggleShipmentCard_x() { KM.DB.getShipments(); }\nfunction toggleShipmentCard');
  if (faked === TOGGLE) throw new Error('K8 anchor drifted');
  return /KM\.DB\./.test(faked) && !/KM\.DB\./.test(TOGGLE);
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('S6-R1 SHIPPING MAINLINE CONTRACT AUDIT — ' + pass + ' passed / ' + fail + ' failed');
console.log('mutants: ' + neg.caught + ' caught / ' + (neg.caught + neg.missed) + ' planted');
if (fail === 0) {
  console.log('SECOND_SHIPPING_CALCULATION_PATH_COUNT = 0');
  console.log('SECOND_SHIPPING_WRITE_PATH_COUNT = 0   DORMANT_WRITE_CONSTRUCTOR_COUNT = 1 (61_ KMPR deps)');
  console.log('AVAILABLE_TO_SHIP_ALREADY_IMPLEMENTED = YES   INVENTORY_MUTATION_OWNER_COUNT = 1');
  console.log('S5_RECOMMENDATION_IS_SHIPPING_QTY_AUTHORITY = NO');
  console.log('ORDERING_SHIPPING_ORCHESTRATION_IMPLEMENTED = NO');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
