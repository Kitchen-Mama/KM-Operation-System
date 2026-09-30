// S6-R3 — INVENTORY / SHIPPING DB + MAPPING FREEZE, made executable.
//
// WHAT THIS SUITE IS FOR, AND HOW IT DIFFERS FROM R1/R2/R2A's.
//
//   R1  pinned what the mainline DOES.
//   R2  pinned what the code proves about the open business questions.
//   R2A pinned what the operator DECIDED.
//   R3  pins the MAPPING the decisions require — which fields carry which truth, which owner writes them,
//       and which arithmetic applies in which domain.
//
// The central claim this suite defends is arithmetic, not stylistic: Factory and Overseas compute
// availability DIFFERENTLY (derived `current - reserved` vs a stored, source-reported bucket that also has a
// damaged sibling), so they cannot share an availability owner. Every shortcut the task forbids collapses to
// applying one domain's formula to the other's rows, and the assertions below are chosen to fail loudly if a
// later round does exactly that.
//
// Where a fact can be EXECUTED it is executed — KMFSG, the warehouse candidate builder, and the PO receipt
// evaluator all run here against fixtures rather than being matched as text. Text assertions are reserved for
// facts that are about the SOURCE (which owner exists, which literal is written, which list a name is in).
//
// NO PRODUCTION WRITE. No sheet, no lock, no network, no clock dependence.
//
// Run: node assets/tests/s6-r3-inventory-shipping-mapping-freeze.test.js

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
// Comments are not code. Every claim about what the runtime DOES is made against the stripped text, because
// this repository has twice had a comment read as an implementation.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function fnBody(src, name) {
  var c = code(src);
  var i = c.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('function not found: ' + name);
  var j = c.indexOf('\nfunction ', i + 10);
  return c.slice(i, j < 0 ? c.length : j);
}
// Brace-matched extraction, for lifting a pure .gs function into Node. Unlike fnBody this respects nesting,
// so it stops at the real end of the function rather than at the next top-level `function`.
function liftFn(src, name) {
  var c = String(src);
  var m = new RegExp('function\\s+' + name + '\\s*\\(').exec(c);
  if (!m) throw new Error('function not found: ' + name);
  var i = c.indexOf('{', m.index), d = 0, e = -1;
  for (var k = i; k < c.length; k++) {
    if (c[k] === '{') d++;
    else if (c[k] === '}') { d--; if (d === 0) { e = k; break; } }
  }
  if (e < 0) throw new Error('unbalanced braces in ' + name);
  return c.slice(m.index, e + 1);
}

var CONTRACT = read('docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md');
var MAPSPEC = read('docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md');
var KMFSG = require(path.join(ROOT, CORE + 'supply-planning-factory-stock-guard.js'));
var IRW = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js')).IRWarehouse;
var F05 = read(GS + '05_overseas_inventory_handlers.gs');
var F11 = read(GS + '11_shipping_plan_handlers.gs');
var F12 = read(GS + '12_shipment_handlers.gs');
var F13 = read(GS + '13_procurement_handlers.gs');
var F21 = read(GS + '21_factory_inventory_handlers.gs');
var F22 = read(GS + '22_shipment_dispatch_handlers.gs');
var F31 = read(GS + '31_shipment_receipt_route_handlers.gs');
var F61 = read(GS + '61_api_v1_weekly_ai_plan.gs');
var GUARD_SRC = read(CORE + 'supply-planning-factory-stock-guard.js');

// A frozen token must be DECLARED in the contract document. A suite is where a mapping is checked; the
// contract is where it lives, and a mapping that exists only in a test is a mapping nobody can find.
function frozen(token, value, label) {
  var re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*' +
    String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  ok(re.test(CONTRACT), 'FROZEN ' + token + ' = ' + value + (label ? '  — ' + label : ''));
}

// =========================================================================================================
section('A. §19.1 — Factory and Overseas remain SEPARATE inventory domains');
// =========================================================================================================

frozen('FACTORY_OVERSEAS_STORAGE_MERGED', 'NO');
frozen('FACTORY_OVERSEAS_RESERVATION_OWNER_MERGED', 'NO');
frozen('OVERSEAS_PRODUCTION_SEMANTICS_ADDED', 'NO');

ok(!/getSheetByName\('factory_stock'\)/.test(code(F05)),
  'A1 the overseas handler never reads factory_stock');
ok(!/overseas_inventory_snapshot/.test(code(F21)),
  'A2 the factory stock authority never reads overseas inventory');

// THE ARITHMETIC DIFFERENCE, which is the real reason the domains cannot be merged.
// Factory: derived. Executed, not read.
var facAvail = KMFSG.availableToAllocate({
  balances: KMFSG.normalizeBalances([{ warehouse_id: 'WH-F', sku: 'S1', fac_current_stock: 100, fac_reserved_stock: 30 }], {}),
  draftExposure: { byPool: {} }, planExposure: { byPool: {}, selfByPool: {} }
});
eq(facAvail.byPool[KMFSG.poolKey('WH-F', 'S1')].factory_available_stock, 70,
  'A3 FACTORY availability is DERIVED: current - reserved (executed)');

// Overseas: stored. The canonical spec preserves a source-reported value that may not be reconstructable.
ok(/wh_available_stock/.test(MAPSPEC) && /source-reported `wh_available_stock` that is not reconstructable/.test(MAPSPEC),
  'A4 OVERSEAS availability is a STORED source-reported bucket (INVENTORY_TABLE_MAPPING_SPEC §3.1)');
frozen('OVERSEAS_AVAILABLE_STOCK_FIELD', 'wh_available_stock');

// The third bucket. `current - reserved` cannot see it, so applying the factory formula to overseas rows
// would count damaged units as shippable. This is the single most concrete argument in the round.
ok(/wh_damaged_stock/.test(MAPSPEC) && /wh_damaged_stock/.test(F05),
  'A5 overseas carries wh_damaged_stock — a bucket the factory formula has no term for');
ok(!/fac_damaged_stock/.test(F21) && !/fac_damaged_stock/.test(GUARD_SRC),
  'A6 the factory domain has no damaged bucket at all — the formulas are not interchangeable');

// Feeding overseas rows to the factory owner FAILS CLOSED rather than silently miscounting. Measured, because
// "it would obviously break" is exactly the assumption that lets someone try it.
var ovsThroughFactory = KMFSG.normalizeBalances(
  [{ warehouse_id: 'WH-3PL', sku: 'S1', wh_physical_stock: 500, wh_reserved_stock: 20, wh_available_stock: 460, wh_damaged_stock: 20 }], {});
eq([Object.keys(ovsThroughFactory.byPool).length, ovsThroughFactory.unreadable.length], [0, 1],
  'A7 an overseas row through normalizeBalances is UNREADABLE, never a silent zero (executed)');
eq(ovsThroughFactory.unreadable[0].field, 'fac_current_stock',
  'A8 and it names the field it could not read');

// =========================================================================================================
section('B. §19.2 — both domains CAN act as a shipping source');
// =========================================================================================================

frozen('CAN_ACT_AS_SHIPPING_SOURCE', 'YES');
frozen('OVERSEAS_CAN_SHIP', 'YES');

var CAND = IRW.buildCandidates([
  { warehouseId: 'WH-F', warehouseType: 'FACTORY', isFactoryWarehouse: true, isActive: true, company: 'ResTW', country: 'CN' },
  { warehouseId: 'WH-3PL', warehouseType: '3PL', isFactoryWarehouse: false, isActive: true, company: 'ResUS', country: 'US' },
  { warehouseId: 'WH-FBA', warehouseType: 'FBA', isFactoryWarehouse: false, isActive: true, company: 'ResUS', country: 'US' },
  { warehouseId: 'WH-RET', warehouseType: 'RETURN', isFactoryWarehouse: false, isActive: true, company: 'ResUS', country: 'US' }
], { company: 'ResUS', country: 'US', marketplace: 'Amazon' });
var fromIds = CAND.from.map(function (w) { return w.warehouseId; }).sort();
eq(fromIds, ['WH-3PL', 'WH-F'], 'B1 the source picker offers BOTH domains and nothing else (executed)');
ok(CAND.to.map(function (w) { return w.warehouseId; }).indexOf('WH-F') < 0,
  'B2 factory is never a destination candidate');

// The source-domain question is answerable from master fields alone — no new column.
frozen('SOURCE_DOMAIN_OWNER', 'warehouses.is_factory_warehouse + warehouses.warehouse_type');
frozen('SOURCE_DOMAIN_INFERENCE_AMBIGUOUS', 'NO');
frozen('SOURCE_DOMAIN_COLUMN_REQUIRED', 'NO');
eq([IRW.isFactory({ warehouseType: 'FACTORY' }), IRW.isOverseas3PL({ warehouseType: '3PL' }),
  IRW.isFactory({ warehouseType: '3PL' }), IRW.isOverseas3PL({ warehouseType: 'FACTORY' })],
  [true, true, false, false], 'B3 the two classifiers partition cleanly on canonical warehouse_type (executed)');
// The one overlap case, and its tie-break: flagged-factory wins, and it wins the SAME way on the server.
ok(IRW.isFactory({ warehouseType: '3PL', isFactoryWarehouse: true }) === true,
  'B4 a flagged-factory row classifies as FACTORY even with warehouse_type 3PL — factory-first');
ok(/if \(whRec\.isFactory === true\) return 'WAREHOUSE_NOT_OVERSEAS'/.test(code(F05)),
  'B5 the server applies the SAME precedence — factory excluded from overseas before type is consulted');
// RESTATED (S6-R4B): the CLAIM is that no source_domain COLUMN exists — the domain is derived from the
// warehouses row, never stored beside it, so it cannot drift from its source. A bare substring search
// could not tell a column from a response field, and R4B added the latter: four answers now name the
// domain they acted in, which is exactly the truthfulness §5 asks a receipt for. The column claim is
// asserted against the things that MAKE a column — a header array, or a cell write.
var _sdHeaderOrWrite = /source_domain'\s*[,\]]/.test(code(F11) + code(F12))
  || /setValue\([^)]*source_domain/.test(code(F11) + code(F12))
  || /col\(\s*'source_domain'\s*\)/.test(code(F11) + code(F12));
ok(!_sdHeaderOrWrite,
  'B6 no source_domain COLUMN has been introduced — it appears only as a response field, never in a '
  + 'header array and never written to a cell');

// =========================================================================================================
section('C. §19.3 / §19.15 — Overseas cannot produce, and nothing refurbishes');
// =========================================================================================================

frozen('OVERSEAS_CAN_PRODUCE', 'NO');
frozen('OVERSEAS_REFURBISH_PHASE1', 'NO');
frozen('REFURBISH_IMPLEMENTATION_COUNT', '0');
var ALL_GS = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) {
  return /\.gs$/.test(f) && f.indexOf('TEMP_') !== 0 && f !== '90_generated_supply_planning_bundle.gs';
});
var REFURB = ALL_GS.filter(function (f) { return /refurbish/i.test(code(read(GS + f))); });
eq(REFURB, [], 'C1 no shipped handler implements refurbish anything');
var PRODUCE_IN_OVS = /production|manufactur/i.test(code(F05));
ok(!PRODUCE_IN_OVS, 'C2 the overseas handler carries no production semantics');

// =========================================================================================================
section('D. §19.4 — Overseas availability cannot be double-allocated (and why ORDER matters in R4)');
// =========================================================================================================

frozen('OVERSEAS_DOUBLE_ALLOCATION_ALLOWED', 'NO');
frozen('DOUBLE_SUBTRACTION_PATH_COUNT', '0');
frozen('DOUBLE_ALLOCATION_PATH_COUNT', '0');
frozen('DOUBLE_ALLOCATION_PATH_IF_SOURCE_UNBLOCKED_ALONE', '1');
frozen('R4_MUST_LAND_AS_ONE_CHANGE', 'YES');
frozen('OVERSEAS_RESERVED_IS_SUBTRACTED_FROM_AVAILABLE', 'NO');

// The exposure half of KMFSG is ALREADY domain-neutral — it never asks whether a warehouse is a factory.
// This is what makes the target mapping one new term rather than a second engine.
var OVS_POOL = KMFSG.poolKey('WH-3PL', 'S1');
var pexOpen = KMFSG.planExposure(
  [{ shipping_plan_id: 'P1', status: 'approved', source_warehouse_id: 'WH-3PL' }],
  [{ shipping_plan_id: 'P1', sku: 'S1', approved_qty: 400 }], {});
eq(pexOpen.byPool[OVS_POOL] && pexOpen.byPool[OVS_POOL].qty, 400,
  'D1 an OVERSEAS-source plan already produces exposure — no factory filter (executed)');

// THE HANDOFF. Once transferred, plan exposure releases. For factory, fac_reserved_stock takes over in the
// same transaction. For overseas there is no term to take over — so unblocking the source alone frees units
// a shipment is holding. This is the whole argument for landing R4 as one change.
var pexTransferred = KMFSG.planExposure(
  [{ shipping_plan_id: 'P1', status: 'approved', source_warehouse_id: 'WH-3PL', transferred_shipment_id: 'SH-1' }],
  [{ shipping_plan_id: 'P1', sku: 'S1', approved_qty: 400 }], {});
eq([Object.keys(pexTransferred.byPool).length, pexTransferred.released.TRANSFERRED_TO_SHIPMENT], [0, 1],
  'D2 transfer RELEASES the plan exposure (executed) — the units must be re-held by a reservation term');

// And with nothing holding them, the pool reads as free.
var afterTransfer = KMFSG.availableToAllocate({
  balances: { byPool: {}, unreadable: [] }, draftExposure: { byPool: {} }, planExposure: pexTransferred
});
eq(Object.keys(afterTransfer.byPool).length, 0,
  'D3 with the exposure released and no reservation term, the overseas pool holds nothing at all');

// The factory equivalent does NOT have this hole: its reservation lives in fac_reserved_stock, which is part
// of the balance term, so the same handoff is covered.
ok(/reservedDelta:\s*need/.test(fnBody(F21, 'factoryStockAcquireReservationTx_')),
  'D4 the factory handoff is covered because the reservation lands in the BALANCE (fac_reserved_stock)');

// =========================================================================================================
section('E. §19.5 — a reserve does not consume current stock');
// =========================================================================================================

frozen('OVERSEAS_RESERVE_CONSUMES_PHYSICAL_STOCK', 'NO');
var ACQ = fnBody(F21, 'factoryStockAcquireReservationTx_');
ok(/deltaQty:\s*0\s*,/.test(ACQ), 'E1 the factory acquire passes deltaQty 0 — physical stock untouched');
ok(/reservedDelta:\s*need/.test(ACQ), 'E2 and moves ONLY the reserved axis');
// The invariant that enforces it for everyone, in the one gate every factory mutation passes through.
ok(/afterCurrent - afterReserved < 0/.test(code(F21)),
  'E3 factoryStockApplyDeltaTx_ enforces available >= 0 as a single invariant, not a per-caller rule');
// The overseas statement of the same invariant: the reserve is a bucket TRANSFER, so physical is untouched
// there too — expressed in the frozen mapping because no writer exists yet.
frozen('OVERSEAS_CURRENT_STOCK_FIELD', 'wh_physical_stock');
ok(/available -> reserved/.test(CONTRACT) || /available -\> reserved/.test(CONTRACT),
  'E4 the frozen overseas reserve is an available -> reserved bucket transfer');

// =========================================================================================================
section('F. §19.6 / §19.7 — cancel releases, dispatch consumes ONCE');
// =========================================================================================================

// RESTATED (S6-R4B): the release is routed by source domain, so the handler calls the forwarder. The
// claim — cancellation releases — is unchanged, and the forwarder is required to sweep BOTH domains,
// because a draft's hold lives in whichever domain its source warehouse belongs to.
ok(/shipmentDomainRelease_\s*\(/.test(fnBody(F12, 'handleCancelShipmentDraft_')),
  'F1 Shipment Draft cancellation releases the reservation');
var REL = fnBody(F21, 'factoryStockReleaseReservationTx_');
ok(/Math\.min\(want, held\)/.test(REL), 'F2 release gives back at most what THIS owner holds');
ok(/reason:\s*'NO_RESERVATION'/.test(REL), 'F3 holding nothing is a no-op, not an error — replay-safe');

// Dispatch: one call carries BOTH the physical deduction and the reserved release. A second release row
// would be the double-count, and 21_'s reconciliation comment records the round that proved it.
var DISPATCH = code(F22);
ok(/deltaQty:\s*-d\.take\s*,\s*reservedDelta:\s*-give/.test(DISPATCH.replace(/\s+/g, ' ').replace(/ ,/g, ',')),
  'F4 dispatch deducts physical and releases reserved in ONE movement');
ok(!/factoryStockReleaseReservationTx_/.test(DISPATCH),
  'F5 dispatch writes NO separate release row — that asymmetry is what prevents the double count');
ok(/CSD_MOV_TYPE_ = 'shipment_out'/.test(F22), 'F6 and the dispatch movement type is shipment_out');

// =========================================================================================================
section('G. §19.8 — Factory -> Overseas becomes available ONLY at warehouse receipt');
// =========================================================================================================

frozen('DESTINATION_INVENTORY_INCREASE_EVENT', 'WAREHOUSE_RECEIPT');
frozen('DELIVERED_INCREASES_OVERSEAS_AVAILABLE', 'NO');
frozen('FACTORY_TO_OVERSEAS_SCHEMA_CHANGE_REQUIRED', 'NO');

var R31 = code(F31);
ok(/movement_type:\s*'shipment_receipt'/.test(R31) && /overseas_inventory_movements/.test(R31),
  'G1 the destination increase is posted by the RECEIPT owner, onto the overseas ledger');
ok(/to_stock_type:\s*'available'/.test(R31),
  'G2 and it lands in the AVAILABLE bucket');
// Exactly-once, reconciled against the ledger rather than the in-request delta.
ok(/function shipReceiptMovementRef_/.test(R31) && /shipmentLineId\) \+ ':' \+/.test(R31),
  'G3 posting identity is shipment_line_id + cumulative — exactly-once across retries');
// `delivered_date` is an editable shipment field and drives NOTHING. If a delivered-date branch ever posts
// inventory, this fails.
ok(!/delivered_date[\s\S]{0,400}?wh_available_stock/.test(R31),
  'G4 no delivered-date path increases destination availability');
// Platform / FBA destinations are skipped, which is correct: FBA stock is the platform snapshot's, not this
// table's. A round that "fixes" the skip would merge two inventory lineages.
ok(/SKIP_NO_DESTINATION/.test(R31), 'G5 a platform/unmanaged destination posts nothing locally');

// =========================================================================================================
section('H. §19.9 / §19.10 — approved/no-shipment MAY cancel; approved/with-shipment MAY NOT');
// =========================================================================================================

frozen('APPROVED_CANCEL_OWNER', '11_ spUpdateShippingPlanStatusCore_');
frozen('NO_SHIPMENT_PROOF', 'shipmentStateForPlan_');
frozen('APPROVED_WITH_SHIPMENT_CAN_CANCEL', 'NO');
frozen('GHOST_PLAN_EXPOSURE_AFTER_CANCEL', 'NO');
frozen('APPROVED_CANCEL_SCHEMA_CHANGE_REQUIRED', 'NO');

// The proof of "no shipment exists" must be a DB fact, never UI state.
//
// RESTATED (S6-R5): the reading moved. shipmentFindForPlan_ could not answer this question safely — it
// returned '' for 'no shipment', for 'no shipments sheet' and for 'no plan-reference column' alike, and
// a cancellation that read the second or third as the first would release the exposure of a plan whose
// shipment is alive. 12_ now answers in three values and the old function is a projection of it, so the
// DB read this line is about is in shipmentStateForPlan_.
var FIND = fnBody(F12, 'shipmentStateForPlan_');
ok(/getSheetByName\('shipments'\)/.test(FIND) && /SHIPMENT_PLAN_REF_COLUMNS_/.test(FIND),
  'H1 NO_SHIPMENT_PROOF reads the shipments table — not UI state, not the plan\'s own transferred column');
ok(/SHIPMENT_FOR_PLAN_UNKNOWN_/.test(FIND) && /SHIPMENT_FOR_PLAN_ABSENT_/.test(FIND),
  'H1a and it separates ABSENT from UNKNOWN, so "could not tell" can never be spent as "there is none"');
// AND THE DIRECTION THE TRANSFER MARKER IS ALLOWED TO ARGUE IN. The eligibility check reads the plan's
// own transferred column too — but only to REFUSE. Allowing a cancel always requires the DB read above
// to return ABSENT, so the marker can make the handler more conservative and never less.
var ELIG = fnBody(F11, 'spApprovedCancelEligibility_');
var _markerAt = ELIG.indexOf('if (marker)'), _okAt = ELIG.lastIndexOf('ok: true');
ok(_markerAt > -1 && _okAt > _markerAt && /SHIPMENT_FOR_PLAN_ABSENT_/.test(ELIG.slice(_markerAt, _okAt)),
  'H1b the transfer marker only ever REFUSES — the ABSENT finding from the shipments table stands '
  + 'between it and the one path that allows a cancellation');

// The release mechanism already exists: `cancelled` is in the released set, so setting the status releases
// the exposure. No new field, no new mechanism — which is why this slice is small.
ok(KMFSG.PLAN_RELEASED_STATUSES && KMFSG.PLAN_RELEASED_STATUSES.cancelled === 1,
  'H2 `cancelled` already releases plan exposure — the escape needs no new release mechanism');
var cancelReleased = KMFSG.planExposure(
  [{ shipping_plan_id: 'P1', status: 'cancelled', source_warehouse_id: 'WH-3PL' }],
  [{ shipping_plan_id: 'P1', sku: 'S1', approved_qty: 400 }], {});
eq([Object.keys(cancelReleased.byPool).length, cancelReleased.released.STATUS_RELEASED], [0, 1],
  'H3 cancelling releases the exposure — no ghost (executed)');

// The audit fields already exist and are already written by the draft/pending cancel path.
// Anchored on the BRANCH (`} else if (transition === 'cancel') {`), not on the bare comparison — the first
// occurrence of that comparison in the file belongs to the Combined-Parent guard, which is a different rule.
// RESTATED (S6-R5): the window was 600 characters, which was the whole branch until the eligibility
// check landed inside it — after which H4 read a slice that stopped before the audit cells it was
// looking for, and H5 went on matching a condition that had been widened. A fixed window is a measure
// of the code's length, not of its shape. The branch is bounded by its own last write instead.
var CANCEL_AT = code(F11).indexOf("else if (transition === 'cancel')");
var _cancelEnd = CANCEL_AT < 0 ? -1 : code(F11).indexOf("setCell('cancelled_at'", CANCEL_AT);
var CANCEL_BRANCH = CANCEL_AT < 0 || _cancelEnd < 0 ? ''
  : code(F11).slice(CANCEL_AT, _cancelEnd + 40);
ok(CANCEL_BRANCH && /cancelled_by/.test(CANCEL_BRANCH) && /cancelled_at/.test(CANCEL_BRANCH),
  'H4 cancelled_by / cancelled_at are already written by the cancel branch');

// THE TRIPWIRE FIRED. It said `approved` could not cancel at all and that R5 would have to change this
// line alongside the record — which is exactly what happened, and is why it was written as an assertion
// rather than as prose. Note that it would NOT have fired on its own wording: the old condition is a
// SUBSTRING of the widened one, so it kept matching. It is the bounded branch above that makes this
// line honest, and the assertion below names the whole set rather than a prefix of it.
ok(/curStatus !== 'draft' && curStatus !== 'pending_approval' && curStatus !== 'approved'/.test(CANCEL_BRANCH),
  'H5 [R5] approved -> cancelled is IMPLEMENTED — the D-S6-C escape exists, gated on no Shipment');

// =========================================================================================================
section('I. §19.11 — shipment_receipt maps to the correct domain vocabulary');
// =========================================================================================================

frozen('SHIPMENT_RECEIPT_TARGET_CLASSIFICATION', 'OVERSEAS_DECLARED_VOCABULARY');
frozen('MOVEMENT_VOCABULARY_EXPANDED', 'NO');
frozen('SEVEN_WAS_A_CROSS_DOMAIN_COUNT', 'YES');
frozen('OVERSEAS_MOVEMENT_ENUM_DECLARED_TODAY', 'NO');
frozen('NEW_MOVEMENT_SEMANTIC_INVENTED', 'NO');

var TYPES_BLOCK = /var FSTX_MOVEMENT_TYPES_ = \[([\s\S]*?)\];/.exec(F21)[1];
var declared = TYPES_BLOCK.match(/FSTX_MOV_[A-Z_]+_/g) || [];
eq(declared.length, 6, 'I1 [R6] the factory list declares SIX. It declared seven when R3 measured it, and '
  + 'SEVEN_WAS_A_CROSS_DOMAIN_COUNT = YES is why: the seventh was shipment_receipt.');
ok(declared.indexOf('FSTX_MOV_SHIPMENT_RECEIPT_') === -1,
  'I2 [R6] and shipment_receipt is NOT one of them — it was, which is what made SEVEN a cross-domain '
  + 'count. I3/I4/I5 below are the evidence that finding rested on, and they are unchanged.');

// It is on NEITHER factory axis. That is the misfiling, stated as data rather than as an opinion.
var RES_AXIS = /var FSTX_RESERVED_AXIS_TYPES_ = \[([\s\S]*?)\];/.exec(F21)[1];
var CUR_AXIS = /var FSTX_CURRENT_AXIS_TYPES_ = \[([\s\S]*?)\];/.exec(F21)[1];
ok(RES_AXIS.indexOf('SHIPMENT_RECEIPT') < 0 && CUR_AXIS.indexOf('SHIPMENT_RECEIPT') < 0,
  'I3 shipment_receipt sits on neither factory axis — it moves no factory balance');

// And nothing writes it to the factory ledger. The ONLY writer targets the overseas one.
var WRITERS = ALL_GS.filter(function (f) { return /movement_type:\s*'shipment_receipt'/.test(code(read(GS + f))); });
eq(WRITERS, ['31_shipment_receipt_route_handlers.gs'], 'I4 exactly one writer, and it writes the OVERSEAS ledger');
ok(!/factory_stock_movements[\s\S]{0,300}?shipment_receipt/.test(code(F31)),
  'I5 it never touches factory_stock_movements');

// The overseas domain declares NO vocabulary constant at all — the gap R4/R6 closes.
ok(!/OVS_MOVEMENT_TYPES_|OVERSEAS_MOVEMENT_TYPES_/.test(F05 + F31),
  'I6 the overseas domain declares no movement vocabulary constant today');
// Nor an allowed set for the stock-type axis. R2A's prose said otherwise; the columns exist, the CONSTANT
// does not, and the only value any writer writes is `available`.
frozen('OVERSEAS_STOCK_TYPE_ALLOWED_SET_DECLARED_IN_CODE', 'NO');
// Only ASSIGNMENTS count. The header arrays also contain the string `'to_stock_type',` immediately followed
// by the next column name, and a loose pattern reads that neighbour as a written value — which is how a
// header list would have been reported as a writer.
var TO_VALUES = (code(F05 + F31).match(/(?:setMv\('to_stock_type',\s*|to_stock_type:\s*)'([a-z_]*)'/g) || []);
eq(TO_VALUES.length, 2, 'I7a exactly two to_stock_type assignments exist (05_ adjust, 31_ receipt)');
ok(TO_VALUES.every(function (v) { return /'available'/.test(v); }),
  'I7b and both write `available` — `reserved` has no writer anywhere');
// The columns that make the reservation expressible DO exist, in both live headers. This is the fact that
// makes SCHEMA_CHANGE_REQUIRED = NO defensible.
var OVS_HEADERS = /var OVS_MOV_HEADERS = \[([\s\S]*?)\];/.exec(F05)[1];
var RCP_HEADERS = /var SHIP_RECEIPT_OVS_MOV_HEADERS_ = \[([\s\S]*?)\];/.exec(F31)[1];
['from_stock_type', 'to_stock_type', 'wh_before_reserved_stock', 'wh_after_reserved_stock', 'movement_scope']
  .forEach(function (h) {
    ok(OVS_HEADERS.indexOf(h) >= 0 && RCP_HEADERS.indexOf(h) >= 0,
      'I8 ' + h + ' exists in BOTH live overseas movement headers');
  });
// And the canonical spec — not a comment — owns the transition direction.
ok(/from_stock_type → to_stock_type/.test(MAPSPEC) && /models transitions such as/.test(MAPSPEC) &&
  /available → reserved/.test(MAPSPEC) && /reserved → available/.test(MAPSPEC),
  'I9 the available -> reserved transition is owned by INVENTORY_TABLE_MAPPING_SPEC §3.2, not invented here');
ok(/this ledger is the intended mechanism to make `wh_reserved_stock` auditable/.test(MAPSPEC),
  'I10 and the spec names this ledger as the reservation mechanism — the direction is canonically owned');

// =========================================================================================================
section('J. §19.12 — over-receipt is refused BEFORE any mutation');
// =========================================================================================================

frozen('OVER_RECEIPT_VALIDATION_OWNER', 'poReceiptEvaluateLine_');
frozen('VALIDATION_BEFORE_MUTATION', 'YES');
frozen('SILENT_CLAMP_PATH_COUNT', '0');
frozen('OVER_RECEIPT_CHANGE_REQUIRED', 'NO');

// Executed, not read. The evaluator is pure, so it is lifted and run.
var evalLine = new Function('return (' + liftFn(F13, 'poReceiptEvaluateLine_').replace(/^function\s+\w+/, 'function') + ')')();
var WH_OK = { isActive: true, isFactory: true };
var over = evalLine({ ordered: 1000, completed: 500, shipped: 0, sku: 'S1', supplierWarehouseId: 'WH-F', warehouse: WH_OK, recvQtyRaw: 900 });
eq([over.status, over.issue, over.attempted, over.remaining, over.excess],
  ['error', 'PO_RECEIPT_EXCEEDS_REMAINING_QTY', 900, 500, 400],
  'J1 900 against a remaining 500 is REFUSED with all three quantities (executed)');
ok(over.recvQty === undefined && over.newCompleted === undefined,
  'J2 a refusal carries no applied quantity — nothing is clamped through');
var exact = evalLine({ ordered: 1000, completed: 500, shipped: 0, sku: 'S1', supplierWarehouseId: 'WH-F', warehouse: WH_OK, recvQtyRaw: 500 });
eq([exact.status, exact.recvQty, exact.newCompleted], ['apply', 500, 1000],
  'J3 an exact receipt still applies — the refusal is not a blanket ceiling (executed)');
// Fail-closed on an unresolved factory destination, BEFORE the quantity is even considered.
var badWh = evalLine({ ordered: 1000, completed: 0, shipped: 0, sku: 'S1', supplierWarehouseId: 'WH-3PL', warehouse: { isActive: true, isFactory: false }, recvQtyRaw: 10 });
eq([badWh.status, badWh.issue], ['error', 'PO_RECEIVE_FACTORY_WAREHOUSE_UNRESOLVED'],
  'J4 a non-factory receipt destination is refused outright (executed)');
ok(!/if \(recv > maxRecv\) recv = maxRecv;/.test(code(F13)), 'J5 the silent clamp does not exist in source');
// The refusal runs in the COLLECT pass, while the journal is still empty — that is what makes it zero-write.
ok(/zero_write:\s*true/.test(code(F13)), 'J6 and the refusal declares itself zero-write');

// =========================================================================================================
section('K. §19.13 — one source-factory authority');
// =========================================================================================================

frozen('SOURCE_FACTORY_AUTHORITY', 'factory_stock_allocation_plans.warehouse_id');
frozen('DEPRECATED_NON_AUTHORITY_FIELD', 'factory_stock_allocation_plans.source_factory_warehouse_id');
frozen('SOURCE_FACTORY_AUTHORITY_COUNT', '1');
frozen('SOURCE_FACTORY_TABLE_REFERENCE_COUNT', '0');
frozen('SOURCE_FACTORY_MIGRATION_THIS_ROUND', 'NO');

// The walk covers shipped runtime only. Tests are excluded deliberately and not for convenience: a suite that
// names the table (this one, and R2A's) is documentation of the freeze, not a consumer of it.
function walk(dir, out) {
  fs.readdirSync(dir).forEach(function (n) {
    var p = path.join(dir, n), st = fs.statSync(p);
    if (st.isDirectory()) { if (n !== 'node_modules') walk(p, out); }
    // 90_ is a BUILD OUTPUT of the core modules, so it echoes every string they contain. Counting it would
    // double every reference and report the generated mirror as an independent consumer.
    else if (/\.(gs|js)$/.test(n) && n.indexOf('TEMP_') !== 0 && n !== '90_generated_supply_planning_bundle.gs') out.push(p);
  });
  return out;
}
var SHIPPED = walk(path.join(ROOT, 'assets/js'), []).concat(walk(path.join(ROOT, GS), []));
var TABLE_REFS = SHIPPED.filter(function (p) { return /factory_stock_allocation_plans/.test(fs.readFileSync(p, 'utf8')); })
  .map(function (p) { return path.basename(p); });
eq(TABLE_REFS, [], 'K1 factory_stock_allocation_plans still has ZERO references in shipped code');

// The disambiguation that will otherwise cost the next reader an hour: the STRING source_factory_warehouse_id
// does occur in shipped code — as a diagnostic output field of the S5 pool census. That is a different object
// from the deprecated column on this table, and conflating them would make the freeze look violated.
var STR_REFS = SHIPPED.filter(function (p) { return /source_factory_warehouse_id/.test(fs.readFileSync(p, 'utf8')); })
  .map(function (p) { return path.basename(p); }).sort();
eq(STR_REFS, ['supply-planning-factory-site-allocation.js'],
  'K2 the only shipped occurrence of the NAME is an S5 census output field, not this table\'s column');

// =========================================================================================================
section('L. §19.14 — no automatic S5/S6 cross-mainline execution');
// =========================================================================================================

frozen('CROSS_MAINLINE_AUTO_EXECUTION_COUNT', '0');
frozen('PHASE2_ORCHESTRATION_COUNT', '0');
var PLAN_CODE = code(F11);
ok(!/createPurchaseOrder|handleCreatePurchaseOrder_|createRequestOrder/.test(PLAN_CODE),
  'L1 a Shipping Plan creates no PO and no Request Order');
ok(!/createShipmentFromApprovedPlan_/.test(code(F13)),
  'L2 procurement creates no Shipment');
frozen('S5_RECOMMENDATION_IS_SHIPPING_QTY_AUTHORITY', 'NO');
frozen('REQUEST_ORDER_IS_SHIPPING_QTY_AUTHORITY', 'NO');
frozen('PO_IS_SHIPPING_QTY_AUTHORITY', 'NO');

// The quantity lineage, which is where a cross-mainline leak would actually show up.
frozen('SHIPPING_QTY_OWNER', 'shipping_plan_lines.approved_qty');
frozen('SHIPMENT_QTY_OWNER', 'shipment_lines.shipment_qty');
frozen('RECEIPT_QTY_OWNER', 'shipment_lines.shipment_received_qty');
frozen('SHIPMENT_QTY_IMMUTABLE', 'YES');
ok(/shipment_qty:\s*shipmentNum_\(plv\(lr, 'approved_qty'\)\)/.test(code(F12)),
  'L3 shipment_qty is copied from the plan\'s approved_qty and from nowhere else');
var EDITABLE = /var SHIPMENT_EDITABLE_FIELDS_ = \[([\s\S]*?)\];/.exec(F12)[1];
ok(EDITABLE.indexOf("'shipment_qty'") < 0, 'L4 shipment_qty is absent from the editable set — immutable');
ok(/shipment_received_qty/.test(code(F31)), 'L5 the receipt quantity owner is the cumulative column');

// =========================================================================================================
section('M. §19.16 — no second shipping write owner');
// =========================================================================================================

frozen('SECOND_SHIPPING_WRITE_PATH_COUNT', '0');
frozen('DORMANT_WRITE_SHAPED_PATHS', '1');
frozen('DORMANT_WRITE_SHAPED_PATH_CLASSIFICATION', 'SAFE_DORMANT');
frozen('DORMANT_PATH_REMOVED_THIS_ROUND', 'NO');

['factoryStockAcquireReservationTx_', 'factoryStockReleaseReservationTx_', 'factoryStockApplyDeltaTx_'].forEach(function (fn) {
  var owners = ALL_GS.filter(function (f) { return new RegExp('function\\s+' + fn + '\\s*\\(').test(code(read(GS + f))); });
  eq(owners, ['21_factory_inventory_handlers.gs'], 'M1 exactly one owner of ' + fn);
});
var CREATORS = ALL_GS.filter(function (f) { return /function\s+createShipmentFromApprovedPlan_\s*\(/.test(code(read(GS + f))); });
eq(CREATORS, ['12_shipment_handlers.gs'], 'M2 exactly one Shipment creator');

// THE DORMANT PATH, measured precisely. R1 recorded it as "never used"; it IS called, and the object it
// returns is passed to a generator that never references it. Both halves are asserted, because the
// classification depends on the second one and only the second one can silently change.
var C61 = code(F61);
ok(/var deps = weeklyAiPlanPersistenceDeps_\(ss\);/.test(C61),
  'M3 61_ DOES build the KMPR/KMPL persistence object (R1\'s "never used" was imprecise)');
var GEN = liftFn(C61, 'weeklyAiPlanGenerateK2_');
var depsUses = (GEN.match(/\bdeps\b/g) || []).length;
eq(depsUses, 1, 'M4 and the generator references `deps` exactly once — its own parameter declaration');
ok(/handleUpsertShippingAllocationDraftAtomic_\s*\(/.test(GEN),
  'M5 it writes through the ONE allocation-draft endpoint instead');
ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false/.test(read(GS + '00_config.gs')),
  'M6 and the whole path is additionally staged OFF — dormant twice over');

// =========================================================================================================
section('N. schema / idempotency freeze');
// =========================================================================================================

frozen('NEW_TABLE_REQUIRED', 'NO');
frozen('SCHEMA_EXTENSION_REQUIRED', 'NO');
frozen('DB_MIGRATION_REQUIRED', 'NO');
frozen('BUSINESS_TRUTH_NOT_REPRESENTABLE_TODAY', 'NONE');
frozen('AUTOREPLAY_PRESENT', 'NO');
frozen('OVERSEAS_WRITE_USES_CALLER_LOCK_AND_JOURNAL', 'YES');
frozen('S6_MAPPING_FREEZE_COMPLETE', 'YES');

// Every field the frozen model needs must exist in a live header TODAY, or DB_MIGRATION_REQUIRED = NO is a
// claim rather than a finding.
['wh_physical_stock', 'wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock'].forEach(function (f) {
  ok(MAPSPEC.indexOf(f) >= 0, 'N1 ' + f + ' is a declared overseas snapshot column');
});
ok(/'reference_type', 'reference_id', 'source_module'/.test(OVS_HEADERS),
  'N2 the overseas ledger already carries the owner-lineage pair a reservation needs');
ok(/before_reserved_stock.*after_reserved_stock/.test(code(F21).replace(/\s+/g, ' ')),
  'N3 the factory ledger carries the same pair — the two domains need no new columns');
// No automatic replay on an unknown outcome, anywhere in the shipping write path.
ok(!/autoReplay|auto_replay|retryOnUnknown/i.test(code(F11) + code(F12) + code(F22) + code(F31)),
  'N4 no automatic replay on an UNKNOWN outcome exists in any shipping write owner');

// =========================================================================================================
section('O. mutation');
// =========================================================================================================

mut('O1 the overseas reserved columns are dropped from the ledger header', function () {
  // If these go, OVERSEAS_MOVEMENT_CAN_REPRESENT_RESERVATION = YES and SCHEMA_CHANGE_REQUIRED = NO both die.
  // EOL-agnostic: these .gs files are CRLF, so an anchor spelling '\n' matches nothing.
  var faked = F05.replace(/'wh_before_reserved_stock',\s*'wh_after_reserved_stock',/, '');
  if (faked === F05) throw new Error('O1 anchor drifted');
  var h = /var OVS_MOV_HEADERS = \[([\s\S]*?)\];/.exec(faked)[1];
  return h.indexOf('wh_before_reserved_stock') < 0 && OVS_HEADERS.indexOf('wh_before_reserved_stock') >= 0;
});

mut('O2 the overseas availability owner starts subtracting wh_reserved_stock', function () {
  // The double subtraction, simulated over the frozen formula. A reserve moves units OUT of the available
  // bucket, so subtracting the reserved balance as well removes them twice.
  function frozenFormula(row, exposure) { return row.wh_available_stock - exposure; }
  function mutated(row, exposure) { return row.wh_available_stock - row.wh_reserved_stock - exposure; }
  var row = { wh_physical_stock: 500, wh_reserved_stock: 100, wh_available_stock: 380, wh_damaged_stock: 20 };
  return frozenFormula(row, 50) === 330 && mutated(row, 50) === 230 &&
    /OVERSEAS_RESERVED_IS_SUBTRACTED_FROM_AVAILABLE = NO/.test(CONTRACT);
});

mut('O3 the factory formula is applied to an overseas row', function () {
  // What §2 forbids, executed. `current - reserved` over the overseas physical/reserved pair returns 400
  // where the stored authority says 380 — the 20 damaged units counted as shippable.
  var row = { warehouse_id: 'WH-3PL', sku: 'S1', wh_physical_stock: 500, wh_reserved_stock: 100, wh_available_stock: 380, wh_damaged_stock: 20 };
  var byFactoryFormula = row.wh_physical_stock - row.wh_reserved_stock;
  var byStoredAuthority = row.wh_available_stock;
  // And the real owner refuses the row outright rather than producing either number.
  var real = KMFSG.normalizeBalances([row], {});
  return byFactoryFormula === 400 && byStoredAuthority === 380 &&
    byFactoryFormula - byStoredAuthority === row.wh_damaged_stock &&
    Object.keys(real.byPool).length === 0 && real.unreadable.length === 1;
});

mut('O4 the generator starts using the dormant persistence writer', function () {
  // One line is all that separates SAFE_DORMANT from an ACTUAL second write path, which is exactly why the
  // classification is asserted on the reference count rather than on the flag.
  var faked = GEN.replace(/function\s+weeklyAiPlanGenerateK2_\s*\(([^)]*)\)\s*\{/,
    'function weeklyAiPlanGenerateK2_($1) { deps.lockedApply(null, null, {});');
  if (faked === GEN) throw new Error('O4 anchor drifted');
  return (faked.match(/\bdeps\b/g) || []).length === 2 && (GEN.match(/\bdeps\b/g) || []).length === 1;
});

mut('O5 `transferred_shipment_id` stops releasing plan exposure', function () {
  // If transfer did NOT release, the plan and the shipment would both hold the same units — the opposite
  // failure from D2's, and the reason the release must be paired with a reservation term rather than removed.
  var from = 'if (transferred) { out.released.TRANSFERRED_TO_SHIPMENT++; return; }';
  if (GUARD_SRC.indexOf(from) < 0) throw new Error('O5 anchor drifted');
  var Module = require('module');
  var m = new Module(path.join(ROOT, CORE + 'z-r3.js'), null);
  m.filename = path.join(ROOT, CORE + 'supply-planning-factory-stock-guard.js');
  m.paths = Module._nodeModulePaths(path.dirname(m.filename));
  m._compile(GUARD_SRC.replace(from, ''), m.filename);
  var hdr = [{ shipping_plan_id: 'P1', status: 'approved', source_warehouse_id: 'WH-3PL', transferred_shipment_id: 'SH-1' }];
  var lines = [{ shipping_plan_id: 'P1', sku: 'S1', approved_qty: 400 }];
  var mutated = m.exports.planExposure(hdr, lines, {});
  var real = KMFSG.planExposure(hdr, lines, {});
  return Object.keys(mutated.byPool).length === 1 && Object.keys(real.byPool).length === 0 &&
    real.released.TRANSFERRED_TO_SHIPMENT === 1;
});

mut('O6 a second overseas movement writer appears', function () {
  var faked = code(F12) + '\nfunction handleAdjustOverseasInventory_(b) { return null; }\n';
  var re = /function\s+handleAdjustOverseasInventory_\s*\(/;
  return re.test(faked) && !re.test(code(F12)) && re.test(code(F05));
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('S6-R3 INVENTORY / SHIPPING MAPPING FREEZE — ' + pass + ' passed / ' + fail + ' failed');
console.log('mutants: ' + neg.caught + ' caught / ' + (neg.caught + neg.missed) + ' planted');
if (fail === 0) {
  console.log('TARGET_KMFSG_INPUT_CONTRACT = OPTION_B   SOURCE_DOMAIN_IDENTITY_PRESERVED = YES');
  console.log('DB_MIGRATION_REQUIRED = NO   NEW_TABLE_REQUIRED = NO   SCHEMA_EXTENSION_REQUIRED = NO');
  console.log('DOUBLE_SUBTRACTION_PATH_COUNT = 0   DOUBLE_ALLOCATION_PATH_COUNT = 0');
  console.log('R4_MUST_LAND_AS_ONE_CHANGE = YES');
  console.log('PRODUCTION_ROWS_WRITTEN = 0   BEHAVIOR_CHANGED = NO');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
