// S6-R2A — OPERATOR DECISION ACCEPTANCE: the seven frozen decisions, made executable.
//
// WHY THIS SUITE EXISTS, AND WHY IT IS NOT THE SAME AS S6-R2's.
//
// S6-R2 pinned what the code DOES. This one pins what the operator DECIDED, and the two are deliberately
// different things. Four of the seven decisions describe behaviour that does not exist yet (overseas
// reservation, the approved-plan escape) or that must never change (the closed vocabulary, one source-factory
// authority). A decision recorded only in prose is the thing this repository has watched rot twice — B-1's
// reserve trigger and the PO clamp both outlived their own documents.
//
// So each frozen value is asserted THREE ways where all three are available:
//   1. the CONTRACT DOCUMENT declares the token, so the freeze is durable and greppable;
//   2. the CODE tripwire states what is true today, so an implementing round FAILS here and must update the
//      record rather than resolving an operator decision quietly;
//   3. where the decision is already satisfied by deployed code, that is asserted directly.
//
// NO PRODUCTION WRITE. No sheet, no lock, no network. Source text and pure modules only.
//
// Run: node assets/tests/s6-r2a-decision-freeze-guards.test.js

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
var GS = 'assets/specs/active/apps-script/';
var CORE = 'assets/js/core/';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function fnBody(src, name) {
  var c = code(src);
  var i = c.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('function not found: ' + name);
  var j = c.indexOf('\nfunction ', i + 10);
  return c.slice(i, j < 0 ? c.length : j);
}

var CONTRACT = read('docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md');
var KMFSG = require(path.join(ROOT, CORE + 'supply-planning-factory-stock-guard.js'));
var F05 = read(GS + '05_overseas_inventory_handlers.gs');
var F11 = read(GS + '11_shipping_plan_handlers.gs');
var F12 = read(GS + '12_shipment_handlers.gs');
var F13 = read(GS + '13_procurement_handlers.gs');
var F21 = read(GS + '21_factory_inventory_handlers.gs');
var F31 = read(GS + '31_shipment_receipt_route_handlers.gs');

// Every frozen token must be DECLARED in the contract document, not merely asserted here. A suite is where a
// decision is checked; the contract is where it lives.
function frozen(token, value, label) {
  var re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*' + String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  ok(re.test(CONTRACT), 'FROZEN ' + token + ' = ' + value + (label ? '  — ' + label : ''));
}

// =========================================================================================================
section('A. D-S6-A — the factory reservation trigger, frozen at Shipment Draft creation');
// =========================================================================================================

frozen('FACTORY_RESERVATION_TIMING', 'SHIPMENT_DRAFT_CREATION');
var CREATE = fnBody(F12, 'createShipmentFromApprovedPlan_');
// RESTATED (S6-R4B): both named a factory function as the proxy for WHERE in the lifecycle the two
// events happen. R4B routes each by source domain, so the site is the forwarder; the decision — reserve
// at draft creation, release at draft cancellation — is unchanged, and is what these assert.
ok(/shipmentDomainAcquire_\s*\(/.test(CREATE),
  'A1 RESERVE happens inside the Shipment Draft creator — the decision matches deployed code');
ok(/shipmentDomainRelease_\s*\(/.test(fnBody(F12, 'handleCancelShipmentDraft_')),
  'A2 RELEASE happens on Shipment Draft cancellation');
ok(/factoryStockApplyDeltaTx_\s*\(/.test(code(read(GS + '22_shipment_dispatch_handlers.gs'))),
  'A3 CONSUME happens at the dispatch movement');
// "Do not create a second reservation owner."
var RESERVE_OWNERS = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) {
  return /\.gs$/.test(f) && f.indexOf('TEMP_') !== 0 && f !== '90_generated_supply_planning_bundle.gs' &&
    /function\s+factoryStockAcquireReservationTx_\s*\(/.test(code(read(GS + f)));
});
eq(RESERVE_OWNERS, ['21_factory_inventory_handlers.gs'], 'A4 exactly one reservation owner, still');

// =========================================================================================================
section('B. D-S6-B — overseas IS a Phase-1 shipping source, and may not stay unprotected');
// =========================================================================================================

frozen('OVERSEAS_ORIGIN_SUPPORTED_PHASE1', 'YES');
frozen('OVERSEAS_RESERVATION_REQUIRED', 'YES');
frozen('OVERSEAS_DOUBLE_ALLOCATION_ALLOWED', 'NO');
frozen('OVERSEAS_CAN_SHIP', 'YES');
frozen('OVERSEAS_CAN_PRODUCE', 'NO');
frozen('OVERSEAS_REFURBISH_PHASE1', 'NO');

// THE TRIPWIRE FIRED, AND S6-R4B IS THE ROUND THAT CLEARED IT. These three said: today the overseas
// source is offered and unprotected, the creator has no domain branch, and it refuses an overseas source
// against factory stock. Every one of them was a dated statement about an open defect, and the round
// that closes the defect is the round that must rewrite them — which is what 'alongside the decision
// record' meant. They now assert the CLOSURE, in the same three places.
ok(/srcDomain\s*=\s*shipmentSourceDomain_\s*\(/.test(CREATE),
  'B1 [R4B] the creator asks ONCE which domain the source warehouse belongs to — until R4B it had no '
  + 'factory/overseas branch at all, which is what left the overseas source unprotected');
ok(/INSUFFICIENT_OVERSEAS_STOCK/.test(CREATE),
  'B2 [R4B] and an overseas source now fails against OVERSEAS stock. Until R4B it was measured against '
  + 'factory stock, so it refused for the wrong reason at a warehouse that holds no factory rows');
ok(!/wh_reserved_stock/.test(fnBody(F31, 'shipReceiptPostToOverseas_').replace(/wh_reserved_stock:\s*0/g, '')),
  'B3 TRIPWIRE — nothing yet writes a non-zero overseas reservation');

// The domains stay separate: this must remain true THROUGH the R3 implementation, so it is a guard and not a
// tripwire. An overseas balance must never be read out of factory_stock, nor the reverse.
ok(!/getSheetByName\('factory_stock'\)/.test(code(F05)),
  'B4 the overseas handler never reads factory_stock — domains stay separate');
ok(!/overseas_inventory_snapshot/.test(code(F21)),
  'B5 the factory stock authority never reads overseas inventory');

// The existing overseas ledger ALREADY models a reserved axis. This is the fact R3 needs, so it is pinned:
// the mechanism can be built with no schema change, and a round that claims otherwise is contradicted here.
var OVS_HEADERS = /var OVS_MOV_HEADERS = \[([\s\S]*?)\];/.exec(F05)[1];
['from_stock_type', 'to_stock_type', 'wh_before_reserved_stock', 'wh_after_reserved_stock', 'movement_scope']
  .forEach(function (h) {
    ok(new RegExp("'" + h + "'").test(OVS_HEADERS),
      'B6 the overseas movement ledger already carries `' + h + '` — no schema change needed for a reservation');
  });
ok(/available\|reserved\|damaged\|on_the_way\|none/.test(F05),
  'B7 …and `reserved` is already in its declared allowed stock-type set');

// =========================================================================================================
section('C. D-S6-C — an approved plan with no shipment must get a terminal escape');
// =========================================================================================================

frozen('APPROVED_WITHOUT_SHIPMENT_CAN_CANCEL', 'YES');
frozen('GHOST_PLAN_EXPOSURE_ALLOWED', 'NO');

var STATUSCORE = fnBody(F11, 'spUpdateShippingPlanStatusCore_');
// THE TRIPWIRE FIRED, AND S6-R5 CLEARED IT. C1 said the change was still pending; the freeze two lines
// above says APPROVED_WITHOUT_SHIPMENT_CAN_CANCEL = YES. They disagreed on purpose, so that the round
// which made them agree would have to come here and say so. C2, C3 and C4 below predicted the shape of
// the fix exactly — no new release field, and the shipment predicate already existed — and all three are
// still green against the implementation, which is the strongest evidence this suite could offer that R5
// implemented the frozen decision rather than a different one.
ok(/Only a Draft, Pending Approval or Approved plan can be cancelled/.test(STATUSCORE)
  && /spApprovedCancelEligibility_/.test(STATUSCORE),
  'C1 [R5] cancel is ACCEPTED from `approved`, through an eligibility check — the code now matches the '
  + 'decision frozen above it');

// These two must hold AFTER the fix as well, so they are guards:
ok(KMFSG.PLAN_RELEASED_STATUSES && KMFSG.PLAN_RELEASED_STATUSES.cancelled === 1,
  'C2 `cancelled` already releases plan exposure — the escape needs no new release field');
ok(KMFSG.PLAN_EXPOSURE_STATUSES && KMFSG.PLAN_EXPOSURE_STATUSES.approved === 1,
  'C3 …and `approved` holds it, which is exactly why the escape is required');
ok(/function shipmentFindForPlan_/.test(code(F12)),
  'C4 the "does a shipment exist" predicate already exists — the guard condition needs no new derivation');
// "Do NOT allow cancellation to unwind a shipment that already exists."
ok(/reason: 'already_exists'/.test(CREATE),
  'C5 one shipment per plan, so "no shipment exists" is a decidable condition');

// =========================================================================================================
section('D. D-S6-D — the movement vocabulary stays closed at seven');
// =========================================================================================================

frozen('MOVEMENT_VOCABULARY_EXPANDED', 'NO');
var TYPES = /var FSTX_MOVEMENT_TYPES_ = \[([\s\S]*?)\];/.exec(F21)[1];
var declared = (TYPES.match(/FSTX_MOV_[A-Z_]+_/g) || []).sort();
eq(declared.length, 7, 'D1 exactly seven declared factory movement types');
eq(declared, ['FSTX_MOV_INVENTORY_IMPORT_', 'FSTX_MOV_MANUAL_ADJUSTMENT_', 'FSTX_MOV_PO_RECEIPT_',
  'FSTX_MOV_RESERVE_ACQUIRE_', 'FSTX_MOV_RESERVE_RELEASE_', 'FSTX_MOV_SHIPMENT_OUT_',
  'FSTX_MOV_SHIPMENT_RECEIPT_'].sort(),
  'D2 and they are exactly the canonical seven — no eighth may be added to fix the misfiling');
// The misfiling itself, pinned so R3 must move it rather than mint a new type.
ok(/movement_type: 'shipment_receipt'/.test(code(F31)),
  'D3 TRIPWIRE — shipment_receipt is still written onto the OVERSEAS ledger');
ok(/'shipment_receipt'/.test(F21),
  'D4 TRIPWIRE — while still declared in the FACTORY vocabulary. R3 moves it; it does not add a type.');

// =========================================================================================================
section('E. D-S6-E — no silent clamp. ALREADY SATISFIED by deployed code.');
// =========================================================================================================

frozen('PO_OVER_RECEIPT_SILENT_CLAMP', 'NO');
frozen('PO_OVER_RECEIPT_CAN_MUTATE_INVENTORY', 'NO');

// S6-R1 and S6-R2 both reported this as a live clamp, citing FC-1A §H.4. FC-1A-R1 §K had already removed it.
// The decision the operator froze is therefore already true, and these assertions say so against the code.
ok(!/if \(recv > maxRecv\) recv = maxRecv;/.test(code(F13)),
  'E1 the silent clamp is GONE from the receipt path');
ok(/issue: 'PO_RECEIPT_EXCEEDS_REMAINING_QTY'/.test(code(F13)),
  'E2 an over-receipt is a typed refusal');
var RCV = code(F13);
['attempted:', 'remaining:', 'excess:'].forEach(function (f) {
  ok(new RegExp(f.replace(':', '') + '\\s*:').test(RCV),
    'E3 the refusal carries `' + f.replace(':', '') + '`, as the decision requires');
});
// It refuses BEFORE mutation: the refusal returns, and only a later `status: 'apply'` reaches the writer.
var POEVAL = RCV.slice(RCV.indexOf('var maxRecv = ordered - completed;'));
var iRefuse = POEVAL.indexOf("PO_RECEIPT_EXCEEDS_REMAINING_QTY");
var iApply = POEVAL.indexOf("status: 'apply'");
ok(iRefuse > -1 && iApply > -1 && iRefuse < iApply,
  'E4 the refusal is evaluated BEFORE the apply branch — no inventory mutation on an over-receipt');
ok(!/tolerance|TOLERANCE/.test(POEVAL.slice(0, iApply)),
  'E5 no tolerance policy was invented, exactly as the decision requires');

// =========================================================================================================
section('F. D-S6-F — one source-factory authority');
// =========================================================================================================

frozen('SOURCE_FACTORY_AUTHORITY_COUNT', '1');

// The finding that makes this cheap: the table has NO live reader or writer anywhere in the codebase, so
// naming an authority costs nothing and changes no write path. Asserted as an equality so the day something
// starts reading it, this fails and the authority has to be honoured in code rather than only in a document.
// SHIPPED code only. `assets/tests` is excluded deliberately and not as a convenience: a suite naming the
// table (this one does, three lines below) is not a runtime reference, and counting it would make the probe
// assert its own absence.
var ALL = [];
['assets/js', 'assets/specs'].forEach(function (rootRel) {
  (function walk(dir) {
    fs.readdirSync(dir).forEach(function (f) {
      var p = path.join(dir, f);
      var st = fs.statSync(p);
      if (st.isDirectory()) { walk(p); }
      else if (/\.(gs|js)$/.test(f)) ALL.push(p);
    });
  })(path.join(ROOT, rootRel));
});
var REFS = ALL.filter(function (p) { return /factory_stock_allocation_plans/.test(fs.readFileSync(p, 'utf8')); })
  .map(function (p) { return path.relative(ROOT, p).replace(/\\/g, '/'); });
eq(REFS, [], 'F1 factory_stock_allocation_plans has NO reference in shipped code — the authority is documentation-only');

// =========================================================================================================
section('G. D-S6-G + the phase boundary');
// =========================================================================================================

frozen('S6_LARGE_FATIGUE_DEFERRED', 'YES');
frozen('S6_PRODUCTION_WRITE_SMOKE_DEFERRED', 'YES');
frozen('ORDERING_SHIPPING_ORCHESTRATION_IMPLEMENTED', 'NO');
frozen('PHASE2_DECISION_COUNT_IMPLEMENTED_NOW', '0');

// S5/S6 separation — re-asserted here because §2B explicitly warns that Factory → Overseas movement must not
// be read as purchase demand. The boundary is the thing that keeps that reading impossible.
ok(!/handleCreateRequestOrderDraft_|handleConvertRequestToPo/.test(code(F11) + code(F12) + code(F05)),
  'G1 no shipping or overseas owner creates a Request Order or a PO');
ok(!/createShipmentFromApprovedPlan_/.test(code(F13)),
  'G2 no procurement owner creates a shipment');
ok(!/carrier_lead_times/.test(code(read(GS + '43_api_v1_gap_materialization.gs'))),
  'G3 no ordering owner reads a carrier lead time');

// =========================================================================================================
section('H. the already-frozen authorities survive this round (§8)');
// =========================================================================================================

['SOURCE_SELECTION_AUTHORITY', 'AUTOMATIC_SOURCE_PRIORITY_EXISTS', 'CARRIER_FINAL_SELECTION_AUTHORITY',
 'DESTINATION_AVAILABILITY_EVENT', 'ROUTE_FREEZE_EVENT', 'POST_DISPATCH_ROUTE_EDIT_ALLOWED'].forEach(function (t) {
  ok(new RegExp(t + '\\s').test(CONTRACT), 'H1 ' + t + ' still declared in the contract');
});
ok(/ALREADY_FROZEN_COUNT\s+17/.test(CONTRACT) || /ALREADY_FROZEN_COUNT = 17/.test(CONTRACT),
  'H2 the seventeen R2 rules are still carried');

// =========================================================================================================
section('I. mutation');
// =========================================================================================================

mut('I1 an eighth movement type is added', function () {
  // EOL-agnostic: these .gs files are CRLF, so an anchor spelling '\n' matches nothing.
  var faked = F21.replace(/FSTX_MOV_SHIPMENT_RECEIPT_(\s*\]\s*;)/,
    'FSTX_MOV_SHIPMENT_RECEIPT_, FSTX_MOV_REFURBISH_$1');
  if (faked === F21) throw new Error('I1 anchor drifted');
  var t = /var FSTX_MOVEMENT_TYPES_ = \[([\s\S]*?)\];/.exec(faked)[1];
  return (t.match(/FSTX_MOV_[A-Z_]+_/g) || []).length === 8 && declared.length === 7;
});

mut('I2 the silent clamp comes back', function () {
  var faked = code(F13).replace(/if \(recv > maxRecv\) \{[\s\S]{0,500}?\}/, 'if (recv > maxRecv) recv = maxRecv;');
  if (faked === code(F13)) throw new Error('I2 anchor drifted');
  return /if \(recv > maxRecv\) recv = maxRecv;/.test(faked) && !/if \(recv > maxRecv\) recv = maxRecv;/.test(code(F13));
});

mut('I3 a second factory reservation owner appears', function () {
  var faked = code(F12) + '\nfunction factoryStockAcquireReservationTx_(p) { return null; }\n';
  var re = /function\s+factoryStockAcquireReservationTx_\s*\(/;
  return re.test(faked) && !re.test(code(F12)) && re.test(code(F21));
});

mut('I4 the overseas handler starts reading factory stock', function () {
  var faked = code(F05).replace("var snapSheet = ss.getSheetByName('overseas_inventory_snapshot');",
    "var snapSheet = ss.getSheetByName('overseas_inventory_snapshot'); var x = ss.getSheetByName('factory_stock');");
  if (faked === code(F05)) throw new Error('I4 anchor drifted');
  return /getSheetByName\('factory_stock'\)/.test(faked) && !/getSheetByName\('factory_stock'\)/.test(code(F05));
});

mut('I5 `cancelled` stops releasing plan exposure', function () {
  var src = read(CORE + 'supply-planning-factory-stock-guard.js');
  var from = 'var PLAN_RELEASED_STATUSES = { cancelled: 1, completed: 1 };';
  if (src.indexOf(from) < 0) throw new Error('I5 anchor drifted');
  var Module = require('module');
  var m = new Module(path.join(ROOT, CORE + 'z.js'), null);
  m.filename = path.join(ROOT, CORE + 'supply-planning-factory-stock-guard.js');
  m.paths = Module._nodeModulePaths(path.dirname(m.filename));
  m._compile(src.replace(from, 'var PLAN_RELEASED_STATUSES = { completed: 1 };'), m.filename);
  // Without the release, a cancelled plan would keep holding exposure — the escape would not escape.
  var ex = m.exports.planExposure(
    [{ shipping_plan_id: 'P', status: 'cancelled', source_warehouse_id: 'W' }],
    [{ shipping_plan_id: 'P', sku: 'S', approved_qty: 100 }], {});
  var real = KMFSG.planExposure(
    [{ shipping_plan_id: 'P', status: 'cancelled', source_warehouse_id: 'W' }],
    [{ shipping_plan_id: 'P', sku: 'S', approved_qty: 100 }], {});
  return Object.keys(ex.byPool).length === 0 && Object.keys(real.byPool).length === 0 &&
    ex.released.STATUS_UNRECOGNISED === 1 && real.released.STATUS_RELEASED === 1;
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('S6-R2A DECISION FREEZE GUARDS — ' + pass + ' passed / ' + fail + ' failed');
console.log('mutants: ' + neg.caught + ' caught / ' + (neg.caught + neg.missed) + ' planted');
if (fail === 0) {
  console.log('D_S6_A..G = FROZEN   UNRESOLVED_DECISION_COUNT = 0');
  console.log('ALREADY_SATISFIED_BY_DEPLOYED_CODE = D-S6-A, D-S6-E');
  console.log('AWAITING_S6_R3 = D-S6-B, D-S6-C, D-S6-D, D-S6-F(doc)');
  console.log('PRODUCTION_ROWS_WRITTEN = 0   S6_BEHAVIOR_CHANGED = NO');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
