// S5-R4 — RECOMMENDATION ACTION + EVIDENCE-BACKED REASON DERIVATION (Slice A).
//
// WHAT SHIPPED. Two derived, descriptive fields on the canonical KMREC order-planning DTO: an action and a
// closed set of reason tokens. Nothing is persisted, no quantity is touched, no second engine exists.
//
// D-S5-9, RESOLVED (S5-R4A). The live §41 allocator has a first-class outcome `SURPLUS_REALLOCATION_PARTIAL`
// — a receiver that took surplus IN and is STILL short. §D runs the REAL allocator and measures it (in 30,
// remaining 70). S5-R4 withheld the action rather than silently pick a primary; the operator ruled that both
// are true and both are named, so the enum gained `REALLOCATE_AND_NEW_ORDER` and the withhold is gone.
//
// THE COMBINED ACTION NAMES TWO ACTIONS AND MERGES NO QUANTITY. §G proves no combined field was invented:
// the reallocation quantity stays the §41 snapshot and the order quantity stays KMREC's cartonize-once total.
// They are not even the same kind of thing — one is supply already assigned, the other supply to be bought.
//
// PURITY IS TESTED, NOT ASSERTED. §E runs each fixture repeatedly, compares deep-equal output, and checks the
// input row is unmutated. §F pins token ORDER against the frozen declaration, because object-key order is not
// a guarantee a caller may rely on.
//
// NO FILE IS WRITTEN. Mutants are compiled in memory.
//
// Run: node assets/tests/s5-r4-action-reason-derivation.test.js

var fs = require('fs');
var path = require('path');
var Module = require('module');

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
var REL = CORE + 'supply-recommendation.js';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

// The canonical cartonizer, published the way the bundle publishes it — never a stub.
global.KMCALC = require(path.join(ROOT, CORE + 'supply-planning-calculations.js'));
var KMREC = require(path.join(ROOT, REL));
var KMFSR = require(path.join(ROOT, CORE + 'supply-planning-surplus-reallocation.js'));
var REC_SRC = read(REL);

function loadMutated(rel, from, to) {
  var src = read(rel);
  if (src.indexOf(from) < 0) throw new Error('mutation anchor missing in ' + rel);
  if (src.indexOf(from) !== src.lastIndexOf(from)) throw new Error('mutation anchor ambiguous in ' + rel);
  var m = new Module(path.join(ROOT, rel), null);
  m.filename = path.join(ROOT, rel);
  m.paths = Module._nodeModulePaths(path.dirname(m.filename));
  m._compile(src.replace(from, to), m.filename);
  return m.exports;
}

function row(over) {
  var r = {
    company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1',
    calculation_status: 'READY', calculation_month: '2026-09', calculated_at: '2026-09-28T05:30:00Z',
    t1_month: '2026-10', t1_gap_qty: 0, t1_suggested_qty: 0,
    t2_month: '2026-11', t2_gap_qty: 0, t2_suggested_qty: 0,
    t3_month: '2026-12', t3_gap_qty: 0, t3_suggested_qty: 0,
    t4_month: '2027-01', t4_gap_qty: 0, t4_suggested_qty: 0,
    units_per_carton: 10,
    factory_available_qty_snapshot: null, reallocation_in_qty_snapshot: null, reallocation_out_qty_snapshot: null
  };
  for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) r[k] = over[k];
  return r;
}
function gen(r, mod) { return (mod || KMREC).generateOrderPlanningRecommendation(r, { now: 'T' }); }

// =========================================================================================================
section('A. one owner, one vocabulary');
// =========================================================================================================

eq(Object.keys(KMREC.ACTION).sort(),
  ['MANUAL_REVIEW', 'NEW_ORDER', 'NO_ACTION', 'REALLOCATE', 'REALLOCATE_AND_NEW_ORDER'],
  'A1 RECOMMENDATION_TYPE_ENUM is the frozen five (D-S5-9)');
eq(KMREC.ACTION_UNAVAILABLE_MULTIPLICITY, null,
  'A1a the S5-R4 withhold is retired — the constant is null, so nothing can read a stale reason string');
eq(KMREC.REASON_TOKENS, ['FACTORY_SUPPLY_APPLIED', 'FACTORY_SURPLUS_REALLOCATION_APPLIED', 'RESIDUAL_SHORTAGE',
  'NEW_ORDER_REQUIRED', 'NO_ACTION_REQUIRED', 'MANUAL_REVIEW_REQUIRED', 'FORWARD_VISIBILITY_ONLY'],
  'A2 the closed token set, in its frozen declaration order');
ok(typeof KMREC.deriveRecommendationAction === 'function' && typeof KMREC.deriveReasonTokens === 'function',
  'A3 the derivation is exported from the canonical owner');

// No shipping action may exist anywhere in this vocabulary or this module.
var SHIPPING_WORDS = ['SHIP', 'CREATE_SHIPMENT', 'EXPEDITE_SHIPMENT', 'SELECT_CARRIER', 'CARRIER', 'SHIPMENT'];
var shippingHits = SHIPPING_WORDS.filter(function (w) {
  return Object.keys(KMREC.ACTION).indexOf(w) >= 0 || KMREC.REASON_TOKENS.indexOf(w) >= 0;
});
eq(shippingHits, [], 'A4 SHIPPING_ACTION_COUNT = 0 — no shipping member in either closed set');
ok(!/shipping_required|shippingRequiredQty|carrier|shipment/i.test(code(REC_SRC)),
  'A5 the owner reads no shipping quantity, carrier or shipment at all');

// No second calculation path: the derivation must not call the cartonizer or any allocator.
var derivRegion = code(REC_SRC).split('function deriveRecommendationAction')[1] || '';
derivRegion = derivRegion.split('function decorateDecision')[0] + (code(REC_SRC).split('function deriveReasonTokens')[1] || '').split('function decorateDecision')[0];
ok(!/calculateSuggestedOrderQty|KMTPP|KMMSA|KMALLOC|KMAR\b|KMFSR/.test(derivRegion),
  'A6 SECOND_CALCULATION_PATH_COUNT = 0 — the derivation invokes no calculator or allocator');

// =========================================================================================================
section('B. action semantics');
// =========================================================================================================

function act(r) { return gen(r).recommendationAction; }
function why(r) { return gen(r).recommendationActionUnavailableReason; }

eq(act(row({})), 'NO_ACTION', 'B1 no actionable gap -> NO_ACTION');
eq(act(row({ t1_gap_qty: 55 })), 'NEW_ORDER', 'B2 positive residual -> NEW_ORDER');
eq(act(row({ calculation_status: 'BLOCKED' })), 'MANUAL_REVIEW', 'B3 not READY -> MANUAL_REVIEW');
eq(act(row({ t1_gap_qty: 55, units_per_carton: '' })), 'MANUAL_REVIEW',
  'B4 READY but no units-per-carton -> MANUAL_REVIEW, never a fabricated quantity');
eq(act(row({ t4_gap_qty: 500 })), 'NO_ACTION', 'B5 need only in T4 -> NO_ACTION');

// MISSING IS NEVER ZERO — a blocked row states no quantity at all.
var b = gen(row({ calculation_status: 'BLOCKED' }));
eq([b.totalRecommendedQty, b.actionableGapQty], [null, null], 'B6 a BLOCKED row carries nulls, not zeros');

// =========================================================================================================
section('C. the combined action — both truths named, neither discarded');
// =========================================================================================================

var partial = row({ t1_gap_qty: 70, reallocation_in_qty_snapshot: 30,
  factory_available_qty_snapshot: 0, reallocation_out_qty_snapshot: 0 });
var covered = row({ reallocation_in_qty_snapshot: 30,
  factory_available_qty_snapshot: 0, reallocation_out_qty_snapshot: 0 });

eq(act(partial), 'REALLOCATE_AND_NEW_ORDER', 'C1 reallocation + residual -> both are named');
eq(why(partial), null, 'C2 and nothing is withheld any more');
eq(act(covered), 'REALLOCATE', 'C3 reallocation that covered the need -> REALLOCATE alone');
eq(act(row({ t1_gap_qty: 55 })), 'NEW_ORDER', 'C4 order need with no reallocation evidence -> NEW_ORDER alone');

// The combined row explains itself in full — the action names two things, the tokens evidence both.
eq(gen(partial).reasonTokens,
  ['FACTORY_SUPPLY_APPLIED', 'FACTORY_SURPLUS_REALLOCATION_APPLIED', 'RESIDUAL_SHORTAGE', 'NEW_ORDER_REQUIRED'],
  'C5 and carries the evidence for both halves');

// NO_ACTION_REQUIRED may not sit beside a reallocation. Before D-S5-9 a reallocating row had no action at all
// and the clash was invisible; now that such a row is REALLOCATE, 'no action required' would assert more than
// the evidence supports — the fault D-S5-7 exists to prevent.
eq(gen(covered).reasonTokens, ['FACTORY_SUPPLY_APPLIED', 'FACTORY_SURPLUS_REALLOCATION_APPLIED'],
  'C6 a REALLOCATE row does NOT claim that no action is required');
eq(gen(row({})).reasonTokens, ['NO_ACTION_REQUIRED'], 'C6a while a genuinely idle row still does');

// HAS_NEW_ORDER must be KNOWN, not merely not-positive: an unreadable order side cannot be called REALLOCATE.
eq(act(row({ t1_gap_qty: 55, units_per_carton: '', reallocation_in_qty_snapshot: 30,
  factory_available_qty_snapshot: 0, reallocation_out_qty_snapshot: 0 })), 'MANUAL_REVIEW',
  'C7 reallocation beside an UNKNOWN order quantity is MANUAL_REVIEW, never REALLOCATE');

var EVERY_FIXTURE = [row({}), row({ t1_gap_qty: 55 }), partial, covered, row({ calculation_status: 'BLOCKED' }),
  row({ t4_gap_qty: 500 }), row({ t1_gap_qty: 55, units_per_carton: '' }),
  row({ t1_gap_qty: 12, t2_gap_qty: 7, t3_gap_qty: 3 })];
var VALID = Object.keys(KMREC.ACTION).map(function (k) { return KMREC.ACTION[k]; });
ok(EVERY_FIXTURE.every(function (r) { return VALID.indexOf(act(r)) !== -1; }),
  'C8 every fixture yields a member of the closed enum — no null, no invented value');

// =========================================================================================================
section('D. the coexistence is MEASURED from the live allocator, not assumed');
// =========================================================================================================

var out = KMFSR.reallocatePreallocatedFactorySupply({
  masterSku: 'KM-1', calculationDate: '2026-09-28', unusedFactorySupplyQty: 0,
  receivers: [
    { demandKey: 'A', requiredByDate: '2026-10-10', allocationPriority: 1, projectedRequirementQty: 100,
      eligibleFactoryWarehouseIds: ['W1'], initialAllocationBySource: { W1: 0 } },
    { demandKey: 'B', requiredByDate: '2026-10-20', allocationPriority: 1, projectedRequirementQty: 0,
      eligibleFactoryWarehouseIds: ['W1'], initialAllocationBySource: { W1: 30 } }
  ]
});
var A = (out.receivers || []).filter(function (r) { return r.demandKey === 'A'; })[0];
ok(!!A, 'D1 the live allocator returned the receiver');
eq([A.reallocatedInQty, A.remainingShortageQty], [30, 70],
  'D2 receiver A took 30 IN and is STILL short 70 — both are true at once');
eq(A.coverageReason, 'SURPLUS_REALLOCATION_PARTIAL',
  'D3 and the live allocator names that state itself — the multiplicity is canonical, not invented');

// The same receiver, once flattened to the gap grain KMREC reads, carries both facts.
var asGap = row({ t1_gap_qty: A.remainingShortageQty, reallocation_in_qty_snapshot: A.reallocatedInQty,
  factory_available_qty_snapshot: A.initialFactoryAllocationQty, reallocation_out_qty_snapshot: A.reallocatedOutQty });
var asDto = gen(asGap);
ok(asDto.totalRecommendedQty > 0 && asGap.reallocation_in_qty_snapshot > 0,
  'D4 at the KMREC grain the row carries a positive order need AND reallocation evidence');
eq(asDto.recommendationAction, 'REALLOCATE_AND_NEW_ORDER', 'D5 so the action names both');

// §4 case B, also driven by the REAL allocator: a donor that fully covers the receiver.
var outB = KMFSR.reallocatePreallocatedFactorySupply({
  masterSku: 'KM-1', calculationDate: '2026-09-28', unusedFactorySupplyQty: 0,
  receivers: [
    { demandKey: 'A', requiredByDate: '2026-10-10', allocationPriority: 1, projectedRequirementQty: 30,
      eligibleFactoryWarehouseIds: ['W1'], initialAllocationBySource: { W1: 0 } },
    { demandKey: 'B', requiredByDate: '2026-10-20', allocationPriority: 1, projectedRequirementQty: 0,
      eligibleFactoryWarehouseIds: ['W1'], initialAllocationBySource: { W1: 30 } }
  ]
});
var AB = (outB.receivers || []).filter(function (r) { return r.demandKey === 'A'; })[0];
eq([AB.reallocatedInQty, AB.remainingShortageQty, AB.coverageReason], [30, 0, 'SURPLUS_REALLOCATION_COVERED'],
  'D6 the allocator fully covers the receiver and names that outcome itself');
eq(gen(row({ t1_gap_qty: AB.remainingShortageQty, reallocation_in_qty_snapshot: AB.reallocatedInQty,
  factory_available_qty_snapshot: AB.initialFactoryAllocationQty,
  reallocation_out_qty_snapshot: AB.reallocatedOutQty })).recommendationAction, 'REALLOCATE',
  'D7 which maps to REALLOCATE alone — derived from the live outcome, not from a hand-made row');

// =========================================================================================================
section('E. purity and determinism');
// =========================================================================================================

var repeatable = true, unmutated = true;
EVERY_FIXTURE.forEach(function (r) {
  var before = JSON.stringify(r);
  var a = gen(r), b2 = gen(r), c = gen(r);
  var proj = function (d) { return JSON.stringify([d.recommendationAction, d.recommendationActionUnavailableReason, d.reasonTokens]); };
  if (!(proj(a) === proj(b2) && proj(b2) === proj(c))) repeatable = false;
  if (JSON.stringify(r) !== before) unmutated = false;
});
ok(repeatable, 'E1 ACTION_DETERMINISTIC = YES — three runs of every fixture agree');
ok(unmutated, 'E2 ACTION_DERIVATION_MUTATES_STATE = NO — no input row was modified');

// The pure functions are callable directly and agree with what the DTO carries.
var dPartial = KMREC.deriveRecommendationAction(partial, gen(partial));
eq([dPartial.action, dPartial.unavailableReason], ['REALLOCATE_AND_NEW_ORDER', null],
  'E3 the exported pure derivation agrees with the decorated DTO');
eq(KMREC.deriveReasonTokens(null, null), [], 'E4 a missing input yields no tokens rather than throwing');
eq(KMREC.deriveRecommendationAction(null, null), null, 'E5 and no action');

// =========================================================================================================
section('F. reason tokens — evidence-gated, closed, deterministically ordered');
// =========================================================================================================

eq(gen(row({})).reasonTokens, ['NO_ACTION_REQUIRED'], 'F1 nothing actionable');
eq(gen(row({ t1_gap_qty: 55 })).reasonTokens, ['RESIDUAL_SHORTAGE', 'NEW_ORDER_REQUIRED'], 'F2 residual + order');
eq(gen(row({ t4_gap_qty: 500 })).reasonTokens, ['NO_ACTION_REQUIRED', 'FORWARD_VISIBILITY_ONLY'], 'F3 T4 only');
eq(gen(row({ calculation_status: 'BLOCKED' })).reasonTokens, ['MANUAL_REVIEW_REQUIRED'], 'F4 blocked');
eq(gen(row({ t1_gap_qty: 55, units_per_carton: '' })).reasonTokens, ['RESIDUAL_SHORTAGE', 'MANUAL_REVIEW_REQUIRED'],
  'F5 residual that cannot be cartonized');
eq(gen(row({ factory_available_qty_snapshot: 80, reallocation_out_qty_snapshot: 0, reallocation_in_qty_snapshot: 0 })).reasonTokens,
  ['FACTORY_SUPPLY_APPLIED', 'NO_ACTION_REQUIRED'], 'F6 factory coverage netted, nothing left to order');

// MISSING IS NEVER ZERO: an incomplete snapshot triple yields no factory token at all.
eq(KMREC.factorySupplyUsed(row({ t1_gap_qty: 20 })), null, 'F7 a MISSING snapshot operand yields null, not 0');
eq(gen(row({ t1_gap_qty: 20 })).reasonTokens, ['RESIDUAL_SHORTAGE', 'NEW_ORDER_REQUIRED'],
  'F8 and therefore emits no factory token');
eq(KMREC.factorySupplyUsed(row({ factory_available_qty_snapshot: 50, reallocation_out_qty_snapshot: 20, reallocation_in_qty_snapshot: 5 })),
  35, 'F9 the 43_ identity MAX(0, initial - out + in) is applied verbatim');

// D-S5-7: the withdrawn and renamed tokens must never appear.
['CROSS_COMPANY_REALLOCATION', 'OWN_SUPPLY_APPLIED', 'OVERSEAS_SUPPLY_APPLIED', 'COMMITTED_SUPPLY_APPLIED'].forEach(function (t) {
  ok(KMREC.REASON_TOKENS.indexOf(t) === -1, 'F10 ' + t + ' is not in the closed set');
  ok(!new RegExp('(^|[^A-Za-z0-9_])' + t + '(?![A-Za-z0-9_])').test(code(REC_SRC)),
    'F11 ' + t + ' is not emitted anywhere in the owner');
});
eq(gen(partial).reasonTokens.indexOf('CROSS_COMPANY_REALLOCATION'), -1,
  'F12 reallocation_in evidence does NOT produce a cross-company claim');

// ORDER is the declaration's, not the branch-evaluation order.
var declOrder = KMREC.REASON_TOKENS;
var emitted = gen(partial).reasonTokens;
eq(emitted.slice().sort(function (a, x) { return declOrder.indexOf(a) - declOrder.indexOf(x); }), emitted,
  'F13 TOKEN_ORDER_DETERMINISTIC = YES — emitted order follows the frozen declaration');
ok(emitted.every(function (t) { return declOrder.indexOf(t) >= 0; }), 'F14 every emitted token is in the closed set');

// =========================================================================================================
section('G. additive only — quantities, state and consumers untouched');
// =========================================================================================================

var ADDED = ['reasonTokens', 'recommendationAction', 'recommendationActionUnavailableReason'];
// `=(?!=)` matters: an earlier version of this probe used `=` and matched `===`, so it reported the
// derivation assigning quantities when it was only comparing them. A probe that cannot tell a comparison from
// an assignment is not checking what it claims to.
var DERIV_REGION = (code(REC_SRC).split('function deriveRecommendationAction')[1] || '').split('function generateForRow')[0];
ok(!/\.(totalRecommendedQty|actionableGapQty|suggestedQty|gapQty)\s*=(?!=)/.test(DERIV_REGION),
  'G1 no quantity field is ASSIGNED anywhere in the derivation region');
ok(/\.totalRecommendedQty\s*===/.test(DERIV_REGION), 'G1b (the region does read that field, so G1 is not vacuous)');
ok(/function decorateDecision/.test(code(REC_SRC)) && /return decorateDecision\(row, buildOrderPlanningDto\(row, opts\)\);/.test(code(REC_SRC)),
  'G2 the decoration runs AFTER the quantity build, so it can only read what is already final');

// The inventory product is untouched by this slice.
var inv = KMREC.generateInventoryRecommendation({ company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1',
  calculation_status: 'READY', calculated_at: 'X', d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 0, d30_suggested_qty: 0,
  d45_gap_qty: 0, d45_suggested_qty: 0, d90_gap_qty: 0, d90_suggested_qty: 0 }, { now: 'T' });
ok(!('recommendationAction' in inv), 'G3 the inventory DTO is unchanged — the slice is order-planning only');

// §3 — THE COMBINED ACTION MERGES NO QUANTITY. This is the specific hazard of naming two actions at once:
// someone adds reallocationQty + orderQty and invents a number no owner produces. The DTO must carry exactly
// the two independent authorities and no third.
var comb = gen(partial);
eq(comb.totalRecommendedQty, 70, 'G5 NEW_ORDER_QTY stays KMREC\'s cartonize-once total');
eq(partial.reallocation_in_qty_snapshot, 30, 'G5a REALLOCATION_QTY stays the §41 snapshot on the row');
var COMBINED_NAMES = ['combinedQty', 'combinedActionQty', 'totalActionQty', 'reallocationPlusOrderQty',
  'recommendationCombinedQty', 'actionQty'];
eq(COMBINED_NAMES.filter(function (k) { return k in comb; }), [],
  'G6 COMBINED_QUANTITY_FIELD_CREATED = NO');
ok(!Object.keys(comb).some(function (k) { return comb[k] === 100; }),
  'G6a and no field happens to equal 30 + 70 — the sum exists nowhere in the DTO');

// §10 — CONSUMER AUDIT. S5-R4A recorded that NOTHING read these fields yet. S5-R5 made the Request Order page
// the first consumer, so that snapshot is superseded — and a test that pinned "nobody reads it" would have had
// to be deleted the moment the read model shipped. The DURABLE claim is the one that must never change: a
// consumer may READ the derived fields, and may never DERIVE them. That is what is asserted here now.
var CONSUMER_FILES = ['assets/js/pages/request-order.js', 'assets/js/pages/inventory-replenishment.js',
  'assets/js/core/supply-execution-handoff.js', GS + '47_api_v1_recommendation_generation.gs'];
var consumersReading = CONSUMER_FILES.filter(function (f) {
  return /recommendationAction|reasonTokens/.test(code(read(f)));
});
eq(consumersReading, ['assets/js/pages/request-order.js'],
  'G7 exactly one consumer reads the derived fields — the S5-R5 read model');
CONSUMER_FILES.forEach(function (f) {
  ok(!/deriveRecommendationAction|deriveReasonTokens/.test(code(read(f))),
    'G8 ' + path.basename(f) + ' reads the verdict but never derives it');
});

// Persistence: neither field may appear in any storage header.
var V2 = require(path.join(ROOT, CORE + 'supply-planning-request-draft-v2.js')).V2_HEADERS;
var gapHdr = eval((/var OP_GAP_HEADERS_ = (\[[\s\S]*?\]);/.exec(code(read(GS + '43_api_v1_gap_materialization.gs'))) || [])[1]);
['recommendation_action', 'recommendationAction', 'reason_tokens', 'reasonTokens'].forEach(function (c) {
  ok(V2.indexOf(c) === -1 && gapHdr.indexOf(c) === -1,
    'G4 ACTION_PERSISTED = NO / REASON_TOKENS_PERSISTED = NO — ' + c + ' is in no storage header');
});

// =========================================================================================================
section('H. caller parity — every caller gets it from the owner, none derives its own');
// =========================================================================================================

// generateBatch is the scheduled path; the manual page calls generateOrderPlanningRecommendation directly.
// Both must carry the derivation, because it lives inside the generator rather than at a call site.
var batch = KMREC.generateBatch('ORDER_PLANNING', [row({ t1_gap_qty: 55 }), partial], { now: 'T' });
eq(batch.recommendations.map(function (d) { return d.recommendationAction; }),
  ['NEW_ORDER', 'REALLOCATE_AND_NEW_ORDER'],
  'H1 the scheduled generateBatch path carries the action, combined member included');
ok(batch.recommendations.every(function (d) { return Array.isArray(d.reasonTokens); }),
  'H2 and the reason tokens');
eq(gen(row({ t1_gap_qty: 55 })).recommendationAction, batch.recommendations[0].recommendationAction,
  'H3 MANUAL_SCHEDULED_DERIVATION_DRIFT = 0 — both paths agree for the same row');

// No caller may re-derive. The action vocabulary must appear in no page and no handler.
var CALLER_FILES = ['assets/js/pages/request-order.js', 'assets/js/pages/inventory-replenishment.js',
  GS + '47_api_v1_recommendation_generation.gs'];
CALLER_FILES.forEach(function (f) {
  var src = code(read(f));
  ok(!/ACTION_MULTIPLICITY_DECISION_REQUIRED|deriveRecommendationAction|deriveReasonTokens/.test(src),
    'H4 ' + path.basename(f) + ' does not derive the action itself');
});

// =========================================================================================================
section('I. Phase-1 boundary');
// =========================================================================================================

ok(!/purchase_order|request_order|shipment|createShipment|AUTO_CREATE/i.test(code(REC_SRC)),
  'I1 the owner creates no Request Order, PO, Shipment or Shipment Draft');
ok(!/SpreadsheetApp|getRange|setValues|fetch\(|XMLHttpRequest/.test(code(REC_SRC)),
  'I2 PRODUCTION_ROWS_WRITTEN = 0 — the owner performs no I/O of any kind');

// =========================================================================================================
section('J. mutation');
// =========================================================================================================

mut('J1 the NO_ACTION branch is removed', function () {
  var mod = loadMutated(REL,
    "    if (dto.status === STATUS.NO_ACTION) return { action: ACTION.NO_ACTION, unavailableReason: null };",
    "    /* branch removed */");
  // Only observable because the final fallback fails CLOSED to MANUAL_REVIEW. When it fell through to
  // NO_ACTION this mutant was inert — the branch could be deleted with no effect, which is why the fallback
  // was changed rather than the mutant banked.
  return gen(row({}), mod).recommendationAction === 'MANUAL_REVIEW' && act(row({})) === 'NO_ACTION';
});

mut('J2 the NEW_ORDER branch is removed', function () {
  var mod = loadMutated(REL,
    "    if (hasNewOrder) return { action: ACTION.NEW_ORDER, unavailableReason: null };",
    "    /* branch removed */");
  return gen(row({ t1_gap_qty: 55 }), mod).recommendationAction !== 'NEW_ORDER' && act(row({ t1_gap_qty: 55 })) === 'NEW_ORDER';
});

mut('J3 reallocation evidence is relabelled CROSS_COMPANY_REALLOCATION', function () {
  var mod = loadMutated(REL,
    "    if (inQ !== null && inQ > 0) on.FACTORY_SURPLUS_REALLOCATION_APPLIED = 1;",
    "    if (inQ !== null && inQ > 0) on.CROSS_COMPANY_REALLOCATION = 1;");
  var m = gen(partial, mod).reasonTokens;
  // The mutant drops the honest token; the closed-set filter means the false one cannot appear either.
  return m.indexOf('FACTORY_SURPLUS_REALLOCATION_APPLIED') === -1
    && gen(partial).reasonTokens.indexOf('FACTORY_SURPLUS_REALLOCATION_APPLIED') >= 0;
});

mut('J4 a withdrawn token is emitted without its evidence column', function () {
  var mod = loadMutated(REL,
    "  var REASON_TOKENS = ['FACTORY_SUPPLY_APPLIED', 'FACTORY_SURPLUS_REALLOCATION_APPLIED', 'RESIDUAL_SHORTAGE',",
    "  var REASON_TOKENS = ['OWN_SUPPLY_APPLIED', 'FACTORY_SUPPLY_APPLIED', 'FACTORY_SURPLUS_REALLOCATION_APPLIED', 'RESIDUAL_SHORTAGE',");
  return mod.REASON_TOKENS.indexOf('OWN_SUPPLY_APPLIED') >= 0 && KMREC.REASON_TOKENS.indexOf('OWN_SUPPLY_APPLIED') === -1;
});

mut('J5 a MISSING snapshot is treated as zero', function () {
  var mod = loadMutated(REL,
    "    if (init === null || outQ === null || inQ === null) return null;",
    "    init = init || 0; outQ = outQ || 0; inQ = inQ || 0;");
  // A row with NO snapshots must yield null, never a confident 0.
  return mod.factorySupplyUsed(row({ t1_gap_qty: 20 })) === 0 && KMREC.factorySupplyUsed(row({ t1_gap_qty: 20 })) === null;
});

mut('J6 the derivation writes a quantity', function () {
  var mod = loadMutated(REL,
    "    dto.reasonTokens = deriveReasonTokens(row, dto);",
    "    dto.totalRecommendedQty = 0; dto.reasonTokens = deriveReasonTokens(row, dto);");
  return gen(row({ t1_gap_qty: 55 }), mod).totalRecommendedQty === 0 && gen(row({ t1_gap_qty: 55 })).totalRecommendedQty === 60;
});

mut('J7 the emitted order stops following the frozen declaration', function () {
  // HONEST NOTE: today the emit branches happen to fire in declaration order, so replacing the filter with
  // Object.keys() is INERT — it was tried and survived. The guarantee that IS load-bearing is that the
  // declaration drives the order, so the declaration is what gets mutated. Reversing it must reverse the
  // output; if it does not, the ordering is coming from somewhere else and the contract is unenforced.
  // Swap two adjacent members that BOTH appear in the `partial` fixture, so the member SET is untouched and
  // only the order moves. A first attempt reordered the whole array and dropped members instead — that changes
  // what is emitted, not the order of it, and proves nothing about ordering.
  var mod = loadMutated(REL,
    "  var REASON_TOKENS = ['FACTORY_SUPPLY_APPLIED', 'FACTORY_SURPLUS_REALLOCATION_APPLIED', 'RESIDUAL_SHORTAGE',",
    "  var REASON_TOKENS = ['FACTORY_SURPLUS_REALLOCATION_APPLIED', 'FACTORY_SUPPLY_APPLIED', 'RESIDUAL_SHORTAGE',");
  var m = gen(partial, mod).reasonTokens, live = gen(partial).reasonTokens;
  return JSON.stringify(m) !== JSON.stringify(live)
    && m.slice().sort().join(',') === live.slice().sort().join(',');   // same members, different order
});

mut('J8a the mixed branch collapses to REALLOCATE', function () {
  var mod = loadMutated(REL,
    "    if (hasReallocation && hasNewOrder) return { action: ACTION.REALLOCATE_AND_NEW_ORDER, unavailableReason: null };",
    "    if (hasReallocation && hasNewOrder) return { action: ACTION.REALLOCATE, unavailableReason: null };");
  return gen(partial, mod).recommendationAction === 'REALLOCATE'
    && gen(partial).recommendationAction === 'REALLOCATE_AND_NEW_ORDER';
});

mut('J8b the mixed branch collapses to NEW_ORDER', function () {
  var mod = loadMutated(REL,
    "    if (hasReallocation && hasNewOrder) return { action: ACTION.REALLOCATE_AND_NEW_ORDER, unavailableReason: null };",
    "    if (hasReallocation && hasNewOrder) return { action: ACTION.NEW_ORDER, unavailableReason: null };");
  return gen(partial, mod).recommendationAction === 'NEW_ORDER'
    && gen(partial).recommendationAction === 'REALLOCATE_AND_NEW_ORDER';
});

mut('J8c REALLOCATE starts requiring a positive order quantity', function () {
  var mod = loadMutated(REL,
    "    if (hasReallocation) return { action: ACTION.REALLOCATE, unavailableReason: null };",
    "    if (hasReallocation && hasNewOrder) return { action: ACTION.REALLOCATE, unavailableReason: null };");
  return gen(covered, mod).recommendationAction !== 'REALLOCATE' && gen(covered).recommendationAction === 'REALLOCATE';
});

mut('J8d an unknown order quantity falls through to NO_ACTION instead of failing closed', function () {
  var mod = loadMutated(REL,
    "      return { action: ACTION.MANUAL_REVIEW, unavailableReason: null };\r\n    }\r\n    var hasNewOrder = total > 0;",
    "      return { action: ACTION.NO_ACTION, unavailableReason: null };\r\n    }\r\n    var hasNewOrder = total > 0;");
  var r = row({ t1_gap_qty: 55, units_per_carton: '' });
  return gen(r, mod).recommendationAction === 'NO_ACTION' && gen(r).recommendationAction === 'MANUAL_REVIEW';
});

mut('J8e the combined action suppresses NEW_ORDER_REQUIRED', function () {
  var mod = loadMutated(REL,
    "      if (typeof dto.totalRecommendedQty === 'number' && dto.totalRecommendedQty > 0) on.NEW_ORDER_REQUIRED = 1;",
    "      if (typeof dto.totalRecommendedQty === 'number' && dto.totalRecommendedQty > 0 && !(inQ !== null && inQ > 0)) on.NEW_ORDER_REQUIRED = 1;");
  return gen(partial, mod).reasonTokens.indexOf('NEW_ORDER_REQUIRED') === -1
    && gen(partial).reasonTokens.indexOf('NEW_ORDER_REQUIRED') >= 0;
});

mut('J8f the combined action suppresses the reallocation evidence', function () {
  var mod = loadMutated(REL,
    "    if (inQ !== null && inQ > 0) on.FACTORY_SURPLUS_REALLOCATION_APPLIED = 1;",
    "    if (inQ !== null && inQ > 0 && !(dto.totalRecommendedQty > 0)) on.FACTORY_SURPLUS_REALLOCATION_APPLIED = 1;");
  return gen(partial, mod).reasonTokens.indexOf('FACTORY_SURPLUS_REALLOCATION_APPLIED') === -1
    && gen(partial).reasonTokens.indexOf('FACTORY_SURPLUS_REALLOCATION_APPLIED') >= 0;
});

mut('J8g a MISSING reallocation snapshot is read as a reallocation', function () {
  var mod = loadMutated(REL,
    "    var hasReallocation = (inQ !== null && inQ > 0);",
    "    var hasReallocation = (inQ === null || inQ > 0);");
  return gen(row({ t1_gap_qty: 55 }), mod).recommendationAction === 'REALLOCATE_AND_NEW_ORDER'
    && act(row({ t1_gap_qty: 55 })) === 'NEW_ORDER';
});

mut('J9 a shipping action is introduced into the frozen enum', function () {
  var mod = loadMutated(REL,
    "    NO_ACTION: 'NO_ACTION', MANUAL_REVIEW: 'MANUAL_REVIEW' };",
    "    NO_ACTION: 'NO_ACTION', MANUAL_REVIEW: 'MANUAL_REVIEW', CREATE_SHIPMENT: 'CREATE_SHIPMENT' };");
  return Object.keys(mod.ACTION).indexOf('CREATE_SHIPMENT') >= 0 && Object.keys(KMREC.ACTION).indexOf('CREATE_SHIPMENT') === -1;
});

mut('J10 the derivation runs BEFORE the quantity is final', function () {
  var mod = loadMutated(REL,
    "    return decorateDecision(row, buildOrderPlanningDto(row, opts));",
    "    var d = decorateDecision(row, baseDto(SOURCE_TYPE.ORDER_PLANNING, row, opts)); var full = buildOrderPlanningDto(row, opts); full.reasonTokens = d.reasonTokens; full.recommendationAction = d.recommendationAction; return full;");
  // Deriving off the bare base DTO cannot see the tiers, so the tokens are wrong.
  return JSON.stringify(gen(row({ t1_gap_qty: 55 }), mod).reasonTokens) !== JSON.stringify(gen(row({ t1_gap_qty: 55 })).reasonTokens);
});

// =========================================================================================================
section('RESULT');
console.log('passed ' + pass + '  failed ' + fail + '  mutants killed ' + neg.caught + '/' + (neg.caught + neg.missed));
if (fail > 0) { console.error('\nS5-R4 ACTION/REASON CONTRACT DRIFT'); process.exit(1); }
console.log('ACTION_MULTIPLICITY_DECISION_REQUIRED = YES — REALLOCATE withheld, evidence complete');
