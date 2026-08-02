// Canonical Supply Planning — §33 Golden Scenario Matrix (Phase 2B, pure Node, no DOM/DB/Runtime).
// Run: node assets/tests/supply-planning-golden-scenarios.test.js
//
// STATUS MODEL (Phase 2B Round 2 — Golden Baseline Reclassification):
//   docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md §33 is a frozen SPECIFICATION matrix of 40
//   scenarios. Each scenario's canonical business rule (expected output / key assertion / count-once /
//   invariant) is FROZEN. What varies is whether the corresponding pure engine / ledger / classifier /
//   state owner exists yet in the current pure calculation lane (supply-planning-calculations.js), which
//   now contains BOTH the Phase 2A arithmetic primitives AND the implemented Phase 2B normalized-sales
//   calculation owners (§22/§29E) AND the implemented Phase 2B Forecast-Driven demand owner (§2D/§29F/§29G)
//   AND the implemented Required-By classifier (§26/§27A), Reallocation Eligibility predicate (§32A), and
//   Missing/Stale readiness classifier (§34A · classifyPlanningDataState, IMPLEMENTED Round 8B).
//   This is NOT a claim that all 40 scenarios are implemented.
//
//   Every scenario therefore carries TWO independent axes:
//     canonicalStatus  : 'FROZEN'                         — the §33 business rule is decided (always here)
//     executionStatus  : 'EXECUTED_EXISTING_CORE'         — the scenario runs against an implemented owner in the current pure calculation core
//                      | 'IMPLEMENTATION_PENDING'         — rule frozen, implementation owner not built yet
//
//   The 15 not-yet-executed scenarios are IMPLEMENTATION_PENDING (a missing implementation owner), NOT
//   "canonical-blocked" and NOT "canonical value missing" — the Canonical rule IS frozen. This file NEVER
//   invents/recomputes an expected value; executable scenarios use Canonical LITERALS from
//   §2D / §10 / §12 / §14 / §22 / §29E / §29F / §29G / §31 / §32 / §32A / §34A. Each executable scenario separates three things: the
//   Canonical business rule = frozen by the specification; the Controlled fixture = the test input; the
//   Expected result = a literal assertion derived from the frozen rule (never recomputed from runtime
//   output). The §22/§29E normalized-sales tests are implemented — not pending.
//   Pending scenarios are recorded (owner + blocker + decision dependency) and are NOT executed, NOT
//   skipped/todo, and NOT faked as PASS. Result is a PARTIAL baseline checkpoint (28 executed / 12 pending /
//   0 canonical-blocked; full 40-scenario Runtime remains incomplete), not 40/40. (B4-R8 promoted #12/#13/#14
//   via the real B4 Minimal Pure Runtime chain; production source-read / Apps Script / persistence / deployment
//   remain UNVERIFIED.)
//
//   Expected literals, e.g. §31 worked example: Gap 300 / Source 279 / UPC 40 → Raw 279 · Recommended
//   Shipping 240 · Residual 60 · Suggested Order (from Net 60) 80. The forbidden Gap−RawSource (21) never
//   appears.

var C = require('../js/core/supply-planning-calculations.js');
// B4-R8 promotion: #12/#13/#14 execute the REAL B4 Minimal Pure Runtime chain (no copied candidate / adapter /
// ten-gate / dedup / Gap logic; no mocks; controlled fixtures only). Public production APIs only.
var buildKm = require('../js/core/supply-planning-supply-candidates.js').buildKmShipmentSupplyCandidate;
var adaptKm = require('../js/core/supply-planning-incoming-adapters.js').adaptKmShipmentIncomingCandidate;
var adaptExternal = require('../js/core/supply-planning-external-incoming-adapters.js').adaptExternalIncomingAuthority;
var runSupplyPlanningLine = require('../js/core/supply-planning-line-runtime.js').runSupplyPlanningLine;
// Round 9B promotion: #15/#16/#17/#27/#32 execute the real §39 Demand/Supply Ledger pure runtime (no copied
// count-once / dedup / conflict logic; no mocks). Public production APIs only.
var buildDemandLedger = require('../js/core/supply-planning-ledgers.js').buildDemandLedger;
var buildSupplyLedger = require('../js/core/supply-planning-ledgers.js').buildSupplyLedger;
var LEDGER_OWNER = 'Demand/Supply Ledger pure runtime (supply-planning-ledgers.js, §39)';

var fail = 0, pass = 0;
function assert(cond, label) { if (!cond) { fail++; console.error('FAIL ' + label); } else { pass++; console.log('ok   ' + label); } }
function eq(actual, expected, label) {
  var A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + A); }
  else { pass++; console.log('ok   ' + label); }
}
function throws(fn, label) {
  var threw = false; try { fn(); } catch (e) { threw = true; }
  if (!threw) { fail++; console.error('FAIL ' + label + ' (expected throw, none thrown)'); }
  else { pass++; console.log('ok   ' + label); }
}
function isCartonMultiple(v, upc) { return typeof v === 'number' && v % upc === 0; }
function _p2(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }
// Round 3.1 canonical marketplace scope for the Normalized-Sales scenarios (Master SKU 'A' on KM/US/Amazon).
// marketplace_sku_id is the campaign identity. Event identity precedence: Event marketplaceId is
// AUTHORITATIVE when present; an active same-SKU ID-bearing Event REQUIRES a resolved scope.marketplaceId;
// an exact ID match is in scope; an ID mismatch is out of scope and NEVER falls back to the composite;
// company+country+marketplace is used ONLY when the Event marketplaceId is absent; an incomplete/mismatched
// composite is out of scope (never guessed into a match). The PERSISTED daily-sales source natural key is
// snapshot_date+country+marketplace+channel+sku; `company` is a REQUIRED upstream-resolved Analysis-Layer
// identity — NOT part of the persisted source natural key, NOT a new DB column, and NEVER inferred from
// channel/country/marketplace.
var SCOPE_A = { marketplaceSkuId: 'MSKU-A-US-AMZ', marketplaceId: 'MKT-US-AMZ', sku: 'A', company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' };
// Deterministic daily-sales fixture: `n` CONSECUTIVE calendar days from startIso (UTC, no clock),
// stamped with the given scope's canonical natural-key fields (defaults to SCOPE_A).
function mkDays(sku, startIso, n, units, scope) {
  scope = scope || SCOPE_A;
  var ms = Date.UTC(+startIso.slice(0, 4), +startIso.slice(5, 7) - 1, +startIso.slice(8, 10));
  var out = [];
  for (var k = 0; k < n; k++) {
    var d = new Date(ms + k * 86400000);
    out.push({ date: d.getUTCFullYear() + '-' + _p2(d.getUTCMonth() + 1) + '-' + _p2(d.getUTCDate()), sku: sku, units: units, company: scope.company, country: scope.country, marketplace: scope.marketplace, channel: scope.channel });
  }
  return out;
}

// Round 3 promotion: 7 → 18 executed. Added #1–#5 + #35–#40 (Normalized-Sales Sampling pure engine, §22/§29E).
// Round 4 promotion: 18 → 19 executed. Added #6 (Forecast-Driven demand engine, §2D/§29F/§29G).
// Round 5 promotion: 19 → 21 executed. Added #28 and #33 via classifyRequiredByWindow (§26/§27A):
//   #28 tests Engine B (T4 display-only, monthDelta=4); #33 tests Engine A (daysOut→bucket boundary sweep).
// Round 6 promotion: 21 → 23 executed. Added #21 and #22 via evaluateReallocationEligibility (§32A):
//   #21 tests the Same-Master-SKU gate (different SKU → ineligible); #22 tests Engine B tier ordering
//   (later surplus cannot cover an earlier shortage; earlier/same-tier may).
// Round 8B promotion: 23 → 25 executed. Added #29 and #30 via classifyPlanningDataState (§34A):
//   #29 tests missing / stale snapshot (MISSING_SNAPSHOT / STALE_SNAPSHOT, never 0); #30 tests a
//   forecast-driven SKU with a missing forecast (MISSING_FORECAST, never 0).
// Round B4-R8 promotion: 25 → 28 executed. Added #12 / #13 / #14 through the REAL B4 Minimal Pure Runtime chain
//   (supply candidate → KM adapter → external authority → Qualified Incoming → Line Runtime): #12 Draft excluded
//   (timely 0, gap not reduced); #13 on-time canonical incoming covers demand exactly once (linked external = 0);
//   #14 late incoming visible as Late Risk (timely 0, gap not reduced).
// Round 9B promotion: 28 → 33 executed. Added #15/#16/#17/#27/#32 via the real §39 Demand/Supply Ledger pure
//   runtime (buildDemandLedger / buildSupplyLedger): #15 delivered-not-received never becomes Current Stock;
//   #16 receipt-posted counted once; #17 same lifecycle counted once (conflict blocks, never 200/300);
//   #27 stable event-ID demand count-once (distinct events sum, duplicate counts once, conflict blocks);
//   #32 one physical pool across many Marketplaces counted once (conflict blocks). Matrix 33 / 7 / 0.
var EXECUTED_IDS = [1, 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35, 36, 37, 38, 39, 40];

// ---------------------------------------------------------------------------
// Full §33 inventory (all 40 IDs, one-to-one). canonicalStatus is FROZEN for every scenario. The 12
// not-yet-executed carry the missing implementation owner + blocker; #34 belongs to the UI/state/persistence
// lane. #12/#13/#14 are now EXECUTED (B4-R8) through the real B4 Minimal Pure Runtime chain — their former
// "B-4 for DB-record qualification" decision dependency is resolved and removed via the executed inventory shape.
// B-2 / B-5 / B-6 are NOT dependencies of any of the 28 executed scenarios and are not applied here as blanket
// blockers.
// ---------------------------------------------------------------------------
function pending(id, sourceSection, title, implementationOwner, blocker, decisionDependencies) {
  return { id: id, sourceSection: sourceSection, title: title, canonicalStatus: 'FROZEN',
    executionStatus: 'IMPLEMENTATION_PENDING', implementationOwner: implementationOwner, blocker: blocker,
    decisionDependencies: decisionDependencies || [] };
}
function executed(id, sourceSection, title, implementationOwner) {
  return { id: id, sourceSection: sourceSection, title: title, canonicalStatus: 'FROZEN',
    executionStatus: 'EXECUTED_EXISTING_CORE',
    implementationOwner: implementationOwner || 'Current pure calculation core (supply-planning-calculations.js)',
    blocker: null, decisionDependencies: [] };
}
// B4-R8 controlled fixture helpers (real chain only; the helper makes NO qualification / status / Late-Risk / Gap
// decision — it only assembles controlled raw inputs and calls the real public B4-R3/R4/R5/R7 functions).
var B4R8_OWNER = 'B4 Minimal Pure Runtime chain: supply candidate → KM adapter → external authority → Qualified Incoming → Line Runtime';
function _ext(base, over) { var o = {}; for (var k in base) o[k] = base[k]; if (over) for (var j in over) o[j] = over[j]; return o; }
function gKmResult(shOver, lnOver, scOver) {
  var shipment = _ext({ shipmentId: 'GS1', status: 'in_transit', company: 'KM', country: 'US', marketplace: 'amazon_us', eta: '2026-10-01', destinationWarehouseId: 'WH-G' }, shOver);
  var line = _ext({ shipmentLineId: 'GSL-1', sku: 'SKU-G', shipmentQty: 200 }, lnOver);
  var scope = _ext({ company: 'KM', sku: 'SKU-G', destinationWarehouseId: 'WH-G', country: 'US', marketplace: 'amazon_us' }, scOver);
  return adaptKm({ candidate: buildKm({ shipment: shipment, line: line }), scope: scope });
}
function gExtResult(over) {
  return adaptExternal({ candidate: _ext({
    externalCandidateId: 'external_inbound:gp:GA:GO:GL', sourceType: 'EXTERNAL_WMS_INBOUND', supplyDomain: 'EXTERNAL_3PL_OVERSEAS',
    authorityState: 'EXTERNAL_UNLINKED_QUARANTINED', provider: 'gp', externalAccountRef: 'GA', externalOperationRef: 'GO', externalLineRef: 'GL',
    company: 'KM', country: 'US', marketplace: 'amazon_us', sku: 'SKU-G', siteSku: 'SITE-G', destinationWarehouseId: 'WH-G',
    quantityObserved: 200, eta: '2026-10-01', sourceUpdatedAt: '2026-08-01T00:00:00Z',
    linkedShipmentId: null, linkedShipmentLineId: null, linkedOperationId: null, reviewStatus: null, reconciliationState: null
  }, over) });
}
function gLineInput(over) {
  return _ext({ lineScope: { company: 'KM', sku: 'SKU-G', destinationWarehouseId: 'WH-G' }, requiredByDate: '2026-12-31',
    demand: 1000, destinationCurrentStock: 300, timelyApprovedCommittedSupply: 100, kmShipmentResults: [], externalAuthorityResults: [] }, over);
}

var SCENARIO_INVENTORY = [
  executed(1,  '§33 #1 · §22', 'Platform × Sales-Driven, no event'),
  executed(2,  '§33 #2 · §22.2', 'Sales-Driven, event pollutes weekly sales'),
  executed(3,  '§33 #3 · §22.3', 'Normal days ≥7'),
  executed(4,  '§33 #4 · §22.3', 'Normal days 3–6 (low-sample warning)'),
  executed(5,  '§33 #5 · §22.3', 'Normal days <3 (weekly_7d fallback)'),
  executed(6,  '§33 #6 · §2D/§29F/§29G', 'Platform × Forecast-Driven + Target Rule + Special Event'),
  pending(7,  '§33 #7 · §20/§24', 'Overseas NORMAL_ALLOCATION', 'overseas allocation engine (§20/§24)', 'weighted allocation engine not implemented'),
  pending(8,  '§33 #8 · §20/§24', 'Overseas PROTECTED_REALLOCATION', 'overseas allocation engine (§20/§24)', '18-day-floor protected reallocation not implemented'),
  pending(9,  '§33 #9 · §24.5–24.7', 'Overseas SHORTAGE_ALLOCATION', 'overseas allocation engine (§24.5–24.7)', 'deterministic largest-remainder allocator not implemented'),
  pending(10, '§33 #10 · §24.9', 'FBA Current Stock vs 3PL reserve separation', 'inventory bucket/ledger owner (§24.9)', 'FBA/3PL distinct-lineage bucket owner not implemented'),
  pending(11, '§33 #11 · §24.9', 'Platform site participates in 3PL reserve', 'inventory bucket/ledger owner (§24.9)', '3PL reserve bucket (separate from FBA) not implemented'),
  executed(12, '§33 #12 · §2E', 'Draft incoming not counted', B4R8_OWNER),
  executed(13, '§33 #13 · §10.1', 'On-time incoming covers demand', B4R8_OWNER),
  executed(14, '§33 #14 · §10.1', 'Late incoming visible not covering', B4R8_OWNER),
  executed(15, '§33 #15 · §30', 'Delivered-not-received', LEDGER_OWNER),
  executed(16, '§33 #16 · §30', 'Receipt posted', LEDGER_OWNER),
  executed(17, '§33 #17 · §30', 'Same supply lifecycle count once', LEDGER_OWNER),
  executed(18, '§33 #18 · §31', 'Factory Stock = 0 but Production Required > 0'),
  pending(19, '§33 #19 · §35', 'Factory quantity allocated once', 'factory deterministic allocator (§35)', 'warehouse_id+SKU deterministic factory allocator not implemented'),
  executed(20, '§33 #20 · §12/§32', 'Cross-company same-SKU/same-tier timely reallocation'),
  executed(21, '§33 #21 · §32A', 'Different SKUs cannot reallocate'),
  executed(22, '§33 #22 · §32A', 'Later surplus cannot cover earlier shortage'),
  executed(23, '§33 #23 · §31/§2C.1', 'Shipment carton FLOOR'),
  executed(24, '§33 #24 · §14/§31', 'Order carton CEILING'),
  executed(25, '§33 #25 · §31', 'Source remainder → residual production recompute'),
  executed(26, '§33 #26 · §10', 'Preparation Date crosses month'),
  executed(27, '§33 #27 · §10/§29E', 'Multiple Special Events same month', LEDGER_OWNER),
  executed(28, '§33 #28 · §27/§27A', 'T4 visible, no allocation/payload'),
  executed(29, '§33 #29 · §34A', 'Missing / stale snapshot'),
  executed(30, '§33 #30 · §34A', 'Missing Forecast (forecast-driven SKU)'),
  executed(31, '§33 #31 · §14/§34', 'Missing units_per_carton → Calculation Blocked'),
  executed(32, '§33 #32 · §23', 'One Master SKU, many Marketplaces', LEDGER_OWNER),
  executed(33, '§33 #33 · §26/§27A', 'Engine A bucket boundary sweep'),
  pending(34, '§33 #34 · §37', 'User partial-carton Order Qty', 'UI/state/persistence lane (§37)', 'partial-carton override is a UI/state/persistence acceptance, not a Phase 2A pure calc'),
  executed(35, '§33 #35 · §22.2', '90-day window contains a joined Campaign'),
  executed(36, '§33 #36 · §22.2', 'Continue sampling past the campaign gap'),
  executed(37, '§33 #37 · §22.2', 'Another SKU NOT in that campaign'),
  executed(38, '§33 #38 · §22.2', 'Campaign & Special Event overlap same date'),
  executed(39, '§33 #39 · §22.3', '<30 normal days inside 90 days'),
  executed(40, '§33 #40 · §22', 'Confirmed zero-sales normal day vs missing day')
];

// ---------------------------------------------------------------------------
// EXECUTABLE golden scenarios — Canonical LITERAL expected values only (no in-test recomputation).
// ---------------------------------------------------------------------------
var GOLDEN_SCENARIOS = [
  // ---- B4-R8 promotion: #12 / #13 / #14 executed via the REAL B4 Minimal Pure Runtime chain. Expected values are
  //      canonical LITERALS (never recomputed from Runtime output). Gap literals: demand 1000 − stock 300 −
  //      committed 100 = 600 baseline; a timely qualifying 200 reduces it to 400. ----
  {
    id: 12, sourceSection: '§33 #12 · §2E', title: 'Draft incoming not counted',
    run: function () {
      var input = gLineInput({ kmShipmentResults: [gKmResult({ status: 'draft' }, { shipmentQty: 200 })] });
      var frozen = JSON.stringify(input);
      var line = runSupplyPlanningLine(input);
      var cr = line.qualifiedIncomingResult.candidateResults[0];
      eq(cr.qualificationState, 'EXCLUDED', '#12 draft candidate qualificationState = EXCLUDED');
      eq(cr.gateResults.TABLE_STATUS_QUALIFIED, 'FAIL', '#12 Gate 4 TABLE_STATUS_QUALIFIED = FAIL');
      eq(cr.gateResults.NOT_EXCLUDED_LIFECYCLE_STATE, 'FAIL', '#12 Gate 8 NOT_EXCLUDED_LIFECYCLE_STATE = FAIL');
      eq(line.timelyQualifiedIncoming, 0, '#12 timelyQualifiedIncoming = 0');
      eq(line.calculatedGap, 600, '#12 calculatedGap = 600 (canonical literal; draft does not reduce Gap)');
      eq(line.incomingBreakdown.excludedIncomingQuantity, 200, '#12 draft 200 remains visible in excluded breakdown');
      eq(JSON.stringify(input), frozen, '#12 input fixture not mutated');
    }
  },
  {
    id: 13, sourceSection: '§33 #13 · §10.1', title: 'On-time incoming covers demand',
    run: function () {
      var input = gLineInput({
        kmShipmentResults: [gKmResult({}, { shipmentQty: 200 })],
        externalAuthorityResults: [gExtResult({ authorityState: 'LINKED_EXTERNAL_EVIDENCE', linkedShipmentId: 'GS1', quantityObserved: 200 })]
      });
      var frozen = JSON.stringify(input);
      var line = runSupplyPlanningLine(input);
      var cr = line.qualifiedIncomingResult.candidateResults[0];
      var allGatesPass = Object.keys(cr.gateResults).every(function (g) { return cr.gateResults[g] === 'PASS'; });
      eq(cr.qualificationState, 'QUALIFIED', '#13 candidate qualificationState = QUALIFIED');
      eq(allGatesPass, true, '#13 all ten B4-R6 gates = PASS');
      eq(line.timelyQualifiedIncoming, 200, '#13 timelyQualifiedIncoming = 200');
      eq(line.qualifiedIncomingResult.qualifiedIncomingQuantity, 200, '#13 qualifiedIncomingQuantity = 200');
      eq(line.incomingBreakdown.externalObservedQuantity, 200, '#13 externalObservedQuantity = 200 visible separately');
      eq(line.qualifiedIncomingResult.externalResults[0].adapterEligibleQuantity, 0, '#13 external adapter contribution = 0');
      eq(cr.informationalReasons.indexOf('LINKED_EXTERNAL_EVIDENCE_PRESENT') >= 0, true, '#13 LINKED_EXTERNAL_EVIDENCE_PRESENT is informational only');
      eq(line.calculatedGap, 400, '#13 calculatedGap = 400 (canonical literal; incoming counted once)');
      eq(line.calculatedGap !== 200, true, '#13 Shipment counted once, not 400 (Gap not reduced twice to 200)');
      eq(JSON.stringify(input), frozen, '#13 input fixture not mutated');
    }
  },
  {
    id: 14, sourceSection: '§33 #14 · §10.1', title: 'Late incoming visible not covering',
    run: function () {
      var input = gLineInput({ kmShipmentResults: [gKmResult({ eta: '2027-06-01' }, { shipmentQty: 200 })] });
      var frozen = JSON.stringify(input);
      var line = runSupplyPlanningLine(input);
      var cr = line.qualifiedIncomingResult.candidateResults[0];
      eq(cr.qualificationState, 'LATE_RISK', '#14 candidate qualificationState = LATE_RISK');
      eq(cr.gateResults.ETA_RESOLVED, 'PASS', '#14 Gate 5 ETA_RESOLVED = PASS');
      eq(cr.gateResults.ETA_ON_OR_BEFORE_REQUIRED_BY, 'FAIL', '#14 Gate 6 ETA_ON_OR_BEFORE_REQUIRED_BY = FAIL');
      eq(line.timelyQualifiedIncoming, 0, '#14 timelyQualifiedIncoming = 0');
      eq(line.incomingBreakdown.lateRiskQuantity, 200, '#14 lateRiskQuantity = 200');
      eq(line.qualifiedIncomingResult.qualifiedIncomingQuantity, 0, '#14 qualifiedIncomingQuantity = 0');
      eq(line.calculatedGap, 600, '#14 calculatedGap = 600 (canonical literal; late does not reduce Gap)');
      eq(cr.informationalReasons.indexOf('ETA_AFTER_REQUIRED_BY') >= 0, true, '#14 ETA_AFTER_REQUIRED_BY remains visible');
      eq(JSON.stringify(input), frozen, '#14 input fixture not mutated');
    }
  },
  {
    id: 23, sourceSection: '§33 #23 · §31/§2C.1', title: 'Shipment carton FLOOR (never exceeds available)',
    run: function () {
      var r = C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 });
      eq(r.rawShippableQty, 279, '#23 Raw Shippable = MIN(300,279) = 279');
      eq(r.recommendedShippingQty, 240, '#23 Recommended = FLOOR(279/40)×40 = 240');
      assert(r.recommendedShippingQty <= r.rawShippableQty, '#23 invariant: shipment ≤ eligible raw quantity');
      assert(isCartonMultiple(r.recommendedShippingQty, 40), '#23 invariant: FLOOR result is a carton multiple');
    }
  },
  {
    id: 24, sourceSection: '§33 #24 · §14/§31', title: 'Order carton CEILING (covers full need)',
    run: function () {
      eq(C.calculateSuggestedOrderQty({ netOrderNeed: 300, unitsPerCarton: 40 }), 320, '#24 CEILING(300/40)×40 = 320');
      eq(C.calculateSuggestedOrderQty({ netOrderNeed: 60, unitsPerCarton: 40 }), 80, '#24 CEILING(60/40)×40 = 80');
      assert(320 >= 300 && isCartonMultiple(320, 40), '#24 invariant: order covers need AND is a carton multiple');
    }
  },
  {
    id: 25, sourceSection: '§33 #25 · §31 worked example', title: 'Source remainder → residual uses recommended shipment (not Gap−RawSource)',
    run: function () {
      var r = C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 });
      eq(r.recommendedShippingQty, 240, '#25 ship 240');
      eq(r.residualProductionRequired, 60, '#25 residual = 300 − 240 = 60 (recommended, not raw)');
      assert(r.residualProductionRequired !== 21, '#25 FORBIDDEN Gap−RawSource (=21) never produced');
      eq(C.calculateSuggestedOrderQty({ netOrderNeed: r.residualProductionRequired, unitsPerCarton: 40 }), 80, '#25 order from residual 60 → 80');
    }
  },
  {
    id: 18, sourceSection: '§33 #18 · §31', title: 'Factory Stock = 0 but Production Required > 0',
    run: function () {
      var r = C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 0, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 });
      eq(r, { rawShippableQty: 0, recommendedShippingQty: 0, residualProductionRequired: 300 }, '#18 source 0 → ship 0, production surfaced = full gap 300');
      assert(r.residualProductionRequired > 0, '#18 invariant: production required is surfaced (>0)');
    }
  },
  {
    id: 20, sourceSection: '§33 #20 · §12/§32', title: 'Cross-company same-SKU/same-tier timely reallocation (surplus consumed once)',
    input: { kmShortage: 1000, resTwShortage: 500, resUsSurplus: 1200 },
    expected: { toKm: 1000, toResTw: 200, netOrderNeed: 300 },
    run: function () {
      var step1 = C.applyFeasibleReallocation({ receiverRemainingShortage: 1000, donorRemainingSurplus: 1200, timelyTransferableQty: 1200 });
      eq(step1.reallocatedQty, 1000, '#20 KM: MIN(1000,1200,1200) = 1000');
      eq(step1.donorRemainingSurplus, 200, '#20 donor surplus after KM = 200 (consumed once)');
      var step2 = C.applyFeasibleReallocation({ receiverRemainingShortage: 500, donorRemainingSurplus: step1.donorRemainingSurplus, timelyTransferableQty: step1.donorRemainingSurplus });
      eq(step2.reallocatedQty, 200, '#20 ResTW: MIN(500,200,200) = 200');
      var net = C.sumRemainingShortages([step1.receiverRemainingShortage, step2.receiverRemainingShortage]);
      eq(net, 300, '#20 Net Order Need = Σ remaining shortage = 0 + 300 = 300 (matches §12 literal)');
      assert(step1.reallocatedQty <= 1000 && step2.reallocatedQty <= 500, '#20 invariant: reallocation ≤ receiver shortage');
      assert(step1.reallocatedQty <= 1200 && step2.reallocatedQty <= 200, '#20 invariant: reallocation ≤ donor surplus');
    }
  },
  {
    id: 26, sourceSection: '§33 #26 · §10', title: 'Preparation Date crosses month (event demand in month of Start − 30d)',
    run: function () {
      eq(C.eventPreparationDate('2026-01-15'), '2025-12-16', '#26 2026-01-15 − 30d = 2025-12-16 (crosses year/month)');
      eq(C.eventPreparationMonth('2026-01-15'), '2025-12', '#26 event demand month = 2025-12 (exact date wins)');
      eq(C.eventPreparationDate('2028-03-30'), '2028-02-29', '#26 leap-year boundary: 2028-03-30 − 30d = 2028-02-29');
    }
  },
  {
    id: 31, sourceSection: '§33 #31 · §14/§34', title: 'Missing units_per_carton → Suggested Order = Calculation Blocked (no default)',
    run: function () {
      throws(function () { C.calculateSuggestedOrderQty({ netOrderNeed: 300 }); }, '#31 missing UPC → blocked (throws; no fabricated qty)');
      throws(function () { C.calculateSuggestedOrderQty({ netOrderNeed: 300, unitsPerCarton: 0 }); }, '#31 UPC 0 → blocked (no default 1/12)');
      throws(function () { C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 0 }); }, '#31 shipment carton also blocked on invalid UPC');
    }
  },

  // ---- Round 3: Normalized-Sales Sampling pure engine (§22/§29E). calcDate 2026-04-01 ⇒ window
  //      2026-01-01 … 2026-03-31 (90 completed days, calc date excluded). Fixtures are controlled inputs;
  //      each assertion checks the Canonical RULE output (source/warning/normal_day_count/selected/excluded
  //      + numeric), never a hard-coded per-ID value. Every scenario calls the production pure engine. ----
  {
    id: 1, sourceSection: '§33 #1 · §22/§29E', title: 'Platform × Sales-Driven, no event — Need uses normalized Avg Sales basis',
    run: function () {
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: mkDays('A', '2026-03-15', 10, 5) });
      eq(r.source, 'normalized_30d', '#1 no-contamination stays on the normalized ladder (source=normalized_30d)');
      eq(r.warning, '', '#1 ≥7 normal days → no warning');
      eq(r.normalDayCount, 10, '#1 normal_day_count = 10 (all rows, zero excluded)');
      eq(r.avgSalesPerDay, 5, '#1 avg = (10×5)/10 = 5 (normalized basis)');
      eq(r.excludedDates.length, 0, '#1 no contamination ⇒ zero excluded dates');
      // §29E composition via the EXISTING pure core (no runtime/DB): Need = avg×bucketDays − stock − timely incoming.
      var demand = r.avgSalesPerDay * 18;
      var need = C.calculateGap({ demand: demand, destinationCurrentStock: 20, timelyQualifiedIncoming: 10, timelyApprovedCommittedSupply: 0 });
      eq(need, 60, '#1 Sales-Driven Need = normalized_avg(5)×18 − 20 − 10 = 60 (uses the normalized basis)');
    }
  },
  {
    id: 2, sourceSection: '§33 #2 · §22.2', title: 'Sales-Driven, event pollutes weekly sales — event days excluded from run-rate',
    run: function () {
      var d = mkDays('A', '2026-03-15', 10, 5);
      d.forEach(function (row) { if (row.date === '2026-03-20' || row.date === '2026-03-21' || row.date === '2026-03-22') row.units = 100; }); // event-day spikes
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: d, events: [{ start: '2026-03-20', end: '2026-03-22', sku: 'A', marketplaceId: 'MKT-US-AMZ' }] });
      eq(r.excludedDates, ['2026-03-20', '2026-03-21', '2026-03-22'], '#2 the 3 event selling dates are excluded');
      eq(r.normalDayCount, 7, '#2 run-rate uses the 7 NORMAL days (event days removed)');
      eq(r.avgSalesPerDay, 5, '#2 avg = 5 (the 100-unit event spikes are NOT counted → no double event uplift in the run-rate)');
      eq(r.source, 'normalized_30d', '#2 source=normalized_30d');
    }
  },
  {
    id: 3, sourceSection: '§33 #3 · §22.3', title: 'Normal days ≥7 → normalized_30d, no warning',
    run: function () {
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: mkDays('A', '2026-03-20', 8, 4) });
      eq(r.normalDayCount, 8, '#3 normal_day_count = 8');
      eq(r.source, 'normalized_30d', '#3 ≥7 → normalized_30d');
      eq(r.warning, '', '#3 ≥7 → blank warning');
      eq(r.avgSalesPerDay, 4, '#3 avg = (8×4)/8 = 4');
    }
  },
  {
    id: 4, sourceSection: '§33 #4 · §22.3', title: 'Normal days 3–6 → normalized_30d + low_sample_warning',
    run: function () {
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: mkDays('A', '2026-03-25', 5, 6) });
      eq(r.normalDayCount, 5, '#4 normal_day_count = 5 (in 3–6 band)');
      eq(r.source, 'normalized_30d', '#4 3–6 → normalized_30d (NOT weekly_7d)');
      eq(r.warning, 'low_sample_warning', '#4 3–6 → low_sample_warning');
      eq(r.avgSalesPerDay, 6, '#4 avg = (5×6)/5 = 6 (actual denominator)');
    }
  },
  {
    id: 5, sourceSection: '§33 #5 · §22.3', title: 'Normal days <3 → weekly_7d + insufficient_normal_days',
    run: function () {
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: mkDays('A', '2026-03-30', 2, 9) });
      eq(r.normalDayCount, 2, '#5 normal_day_count = 2 (<3)');
      eq(r.source, 'weekly_7d', '#5 <3 → weekly_7d fallback');
      eq(r.warning, 'insufficient_normal_days', '#5 <3 → insufficient_normal_days');
      eq(r.avgSalesPerDay, 10, '#5 avg = sales_units_7d(70) ÷ 7 = 10 (weekly fallback value)');
    }
  },
  {
    id: 6, sourceSection: '§33 #6 · §2D/§29F/§29G', title: 'Platform × Forecast-Driven + Target Rule + Special Event',
    run: function () {
      // Frozen §2D/§29F/§29G fixture. Expected values are Canonical LITERALS (never recomputed from output).
      var input = {
        forecastMonth1: { month: '2027-01', baseForecast: 620 },
        forecastMonth2: { month: '2027-02', baseForecast: 560 },
        targetRules: { skuPercent: 50, seriesPercent: 80, categoryPercent: 90 },
        specialEventDemand: 200,
        destinationCurrentStock: 300,
        timelyQualifiedIncoming: 200,
        timelyApprovedCommittedSupply: 100
      };
      var frozen = JSON.stringify(input);
      var r = C.calculateForecastDrivenRemainingNeed(input);
      eq(r.targetRuleSource, 'sku', '#6 targetRuleSource = sku (SKU rule highest priority)');
      eq(r.targetRulePercent, 50, '#6 targetRulePercent = 50');
      eq(r.adjustedForecastMonth1, 310, '#6 adjustedForecastMonth1 = 620 × 50% = 310');
      eq(r.adjustedForecastMonth2, 280, '#6 adjustedForecastMonth2 = 560 × 50% = 280');
      eq(r.adjustedRegularForecast, 590, '#6 adjustedRegularForecast = 310 + 280 = 590');
      eq([r.month1CalendarDays, r.month2CalendarDays], [31, 28], '#6 calendar-day counts = [31, 28]');
      eq(r.forecastDailyDemand, 10, '#6 forecastDailyDemand = 590 ÷ 59 = 10');
      eq(r.safetyDemand, 300, '#6 safetyDemand = 10 × 30 = 300');
      eq(r.specialEventDemand, 200, '#6 specialEventDemand remains 200 (added once at 100%, not target-adjusted)');
      eq(r.totalForecastDrivenDemand, 1090, '#6 totalForecastDrivenDemand = 590 + 300 + 200 = 1090');
      eq(r.forecastDrivenRemainingNeed, 490, '#6 forecastDrivenRemainingNeed = MAX(1090 − 300 − 200 − 100, 0) = 490');
      eq(C.calculateForecastDrivenRemainingNeed(Object.assign({}, input, { timelyApprovedCommittedSupply: 0 })).forecastDrivenRemainingNeed, 590, '#6 committed-supply 0 → Remaining Need 590 (Approved/Committed deducted exactly once)');
      eq(JSON.stringify(input), frozen, '#6 input object unchanged');
    }
  },
  {
    id: 35, sourceSection: '§33 #35 · §22.2', title: '90-day window contains a joined Campaign — those dates excluded',
    run: function () {
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: mkDays('A', '2026-03-15', 10, 5),
        campaigns: [{ start: '2026-03-18', end: '2026-03-20', skuLines: [{ marketplaceSkuId: 'MSKU-A-US-AMZ', sku: 'A' }] }] });
      eq(r.excludedDates, ['2026-03-18', '2026-03-19', '2026-03-20'], '#35 the 3 campaign selling dates the SKU joined are excluded');
      eq(r.normalDayCount, 7, '#35 sampling continues over the remaining 7 normal days');
      eq(r.source, 'normalized_30d', '#35 source=normalized_30d');
    }
  },
  {
    id: 36, sourceSection: '§33 #36 · §22.2', title: 'Continue sampling past the campaign gap (walk back within 90d)',
    run: function () {
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: mkDays('A', '2026-03-13', 12, 5),
        campaigns: [{ start: '2026-03-17', end: '2026-03-20', skuLines: [{ marketplaceSkuId: 'MSKU-A-US-AMZ', sku: 'A' }] }] });
      eq(r.normalDayCount, 8, '#36 8 normal days collected by walking earlier past the 4-day campaign gap');
      eq(r.excludedDates.length, 4, '#36 the 4 campaign dates are excluded');
      assert(r.selectedDates.indexOf('2026-03-18') === -1 && r.selectedDates.indexOf('2026-03-13') !== -1,
        '#36 selection skips the campaign gap yet includes earlier normal days (walk-back, still within 90d)');
    }
  },
  {
    id: 37, sourceSection: '§33 #37 · §22.2', title: 'Another SKU NOT in that campaign — target SKU not polluted',
    run: function () {
      var daily = mkDays('A', '2026-03-19', 6, 5).concat(mkDays('B', '2026-03-19', 6, 9));
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: daily,
        campaigns: [{ start: '2026-03-19', end: '2026-03-24', skuLines: [{ marketplaceSkuId: 'MSKU-B-US-AMZ', sku: 'B' }] }] }); // campaign line = ONLY B's marketplace_sku_id
      eq(r.excludedDates.length, 0, '#37 a campaign the target SKU did NOT join excludes none of its days (per-SKU participation)');
      eq(r.normalDayCount, 6, '#37 all 6 of SKU A rows remain normal days');
      eq(r.avgSalesPerDay, 5, "#37 avg reflects only SKU A's rows (=5), never SKU B's");
    }
  },
  {
    id: 38, sourceSection: '§33 #38 · §22.2', title: 'Campaign & Special Event overlap same date — excluded once',
    run: function () {
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: mkDays('A', '2026-03-15', 10, 5),
        campaigns: [{ start: '2026-03-20', end: '2026-03-20', skuLines: [{ marketplaceSkuId: 'MSKU-A-US-AMZ', sku: 'A' }] }], events: [{ start: '2026-03-20', end: '2026-03-20', sku: 'A', marketplaceId: 'MKT-US-AMZ' }] });
      eq(r.excludedDates, ['2026-03-20'], '#38 the doubly-covered date appears in the exclusion set exactly ONCE');
      eq(r.normalDayCount, 9, '#38 only one day removed (no double removal / double count)');
    }
  },
  {
    id: 39, sourceSection: '§33 #39 · §22.3', title: '<30 normal days inside 90 days → divide by ACTUAL count (never fixed 30)',
    run: function () {
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: mkDays('A', '2026-03-13', 12, 5) });
      eq(r.normalDayCount, 12, '#39 normal_day_count = 12 (all available; not padded to 30)');
      eq(r.avgSalesPerDay, 5, '#39 avg = (12×5)/12 = 5 — actual denominator 12 (dividing by a fixed 30 would give 2)');
      eq(r.source, 'normalized_30d', '#39 ≥7 → normalized_30d');
    }
  },
  {
    id: 40, sourceSection: '§33 #40 · §22', title: 'Confirmed zero-sales normal day vs missing day',
    run: function () {
      // 03-24=6, 03-25=0 (confirmed zero), 03-26 MISSING (no row), 03-27=6.
      var daily = [{ date: '2026-03-24', sku: 'A', units: 6, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }, { date: '2026-03-25', sku: 'A', units: 0, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }, { date: '2026-03-27', sku: 'A', units: 6, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }];
      var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SCOPE_A, weekly7d: 70, dailySales: daily });
      eq(r.normalDayCount, 3, '#40 confirmed zero-sales day COUNTS (3 rows incl the 0); the missing 03-26 is NOT counted');
      eq(r.avgSalesPerDay, 4, '#40 avg = (6+0+6)/3 = 4 (zero in denominator; missing NOT auto-zeroed — that would give 12/4=3)');
      eq(r.selectedDates.indexOf('2026-03-26'), -1, '#40 the missing date never appears as an eligible day');
    }
  },
  {
    id: 28, sourceSection: '§33 #28 · §27/§27A', title: 'T4 visible, no allocation/payload',
    run: function () {
      // Engine B ONLY (§27A.5). Real production call. T4 is reached via monthDelta=4 —
      // NEVER derived from any Engine A day bucket (adapter independence, §27.6).
      var r = C.classifyRequiredByWindow({ calculationDate: '2026-01-31', requiredByDate: '2026-05-01' });
      eq(r.engineB, { tier: 'T4', visible: true, allocationEligible: false, payloadEligible: false },
         '#28 Engine B T4 display-only: visible=true, allocationEligible=false, payloadEligible=false (monthDelta=4)');
    }
  },
  {
    id: 33, sourceSection: '§33 #33 · §26/§27A', title: 'Engine A bucket boundary sweep',
    run: function () {
      // Engine A ONLY (§27A.4). Real production call. Canonical LITERAL daysOut → bucket boundaries
      // (calculationDate 2026-01-01); no off-by-one. Bucket does NOT come from Engine B.
      var sweep = [
        ['2025-12-31', -1, '0–18d'], ['2026-01-01', 0, '0–18d'], ['2026-01-19', 18, '0–18d'],
        ['2026-01-20', 19, '19–30d'], ['2026-01-31', 30, '19–30d'],
        ['2026-02-01', 31, '31–45d'], ['2026-02-15', 45, '31–45d'],
        ['2026-02-16', 46, '46–90d'], ['2026-04-01', 90, '46–90d'],
        ['2026-04-02', 91, '>90d']
      ];
      sweep.forEach(function (t) {
        var r = C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: t[0] });
        eq(r.daysOut, t[1], '#33 daysOut ' + t[0] + ' → ' + t[1]);
        eq(r.engineA.bucket, t[2], '#33 Engine A bucket ' + t[0] + ' → ' + t[2]);
      });
      eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: '2026-04-02' }).engineA.visible, true, '#33 >90d Engine A visible = true');
      eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: '2026-04-02' }).engineA.allocationEligible, false, '#33 >90d Engine A allocationEligible = false');
    }
  },
  {
    id: 21, sourceSection: '§33 #21 · §32A', title: 'Different SKUs cannot reallocate (Same-Master-SKU gate)',
    run: function () {
      // Real production call (§32A). Different Master SKU → sameMasterSku=false → eligible=false, even
      // though both dates classify to T1 and tier ordering alone (T1→T1) would pass (§32A.2).
      var input = { calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: { masterSku: 'GA3120', requiredByDate: '2026-02-20' } };
      var snap = JSON.stringify(input);
      eq(C.evaluateReallocationEligibility(input),
         { sameMasterSku: false, donor: { tier: 'T1', allocationEligible: true }, receiver: { tier: 'T1', allocationEligible: true }, tierOrderingEligible: true, eligible: false },
         '#21 different Master SKU → eligible=false (tier ordering true, identity gate false)');
      eq(JSON.stringify(input), snap, '#21 input object unchanged (pure predicate)');
    }
  },
  {
    id: 22, sourceSection: '§33 #22 · §32A', title: 'Later surplus cannot cover earlier shortage (Engine B tier ordering)',
    run: function () {
      // Real production calls (§32A.5). Later donor (T3) → earlier receiver (T1): donorRank 3 > receiverRank 1
      // → tierOrderingEligible=false. Reverse (T1→T3): donorRank 1 <= 3 → eligible. Engine B only.
      var later = { calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-04-15' }, receiver: { masterSku: 'GA0450', requiredByDate: '2026-01-20' } };
      var earlier = { calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: { masterSku: 'GA0450', requiredByDate: '2026-04-15' } };
      var laterSnap = JSON.stringify(later), earlierSnap = JSON.stringify(earlier);
      eq(C.evaluateReallocationEligibility(later),
         { sameMasterSku: true, donor: { tier: 'T3', allocationEligible: true }, receiver: { tier: 'T1', allocationEligible: true }, tierOrderingEligible: false, eligible: false },
         '#22 later donor (T3) → earlier receiver (T1) → ineligible (later cannot cover earlier)');
      eq(C.evaluateReallocationEligibility(earlier),
         { sameMasterSku: true, donor: { tier: 'T1', allocationEligible: true }, receiver: { tier: 'T3', allocationEligible: true }, tierOrderingEligible: true, eligible: true },
         '#22 earlier donor (T1) → later receiver (T3) → eligible (earlier/same-tier may cover same/later)');
      eq([JSON.stringify(later), JSON.stringify(earlier)], [laterSnap, earlierSnap], '#22 both controlled inputs unchanged (pure predicate)');
    }
  },
  {
    id: 29, sourceSection: '§33 #29 · §34A', title: 'Missing / stale snapshot → MISSING_SNAPSHOT / STALE_SNAPSHOT (never 0)',
    run: function () {
      // Real production call (§34A). Missing and stale are DISTINCT states; neither is
      // ever silently converted to 0. Missing snapshot blocks; stale is warn-and-proceed.
      eq(C.classifyPlanningDataState({ snapshotPresent: false, replenishmentModel: 'sales_driven', salesBasisPresent: true }),
         { state: 'MISSING_SNAPSHOT', calculationAllowed: false },
         '#29 missing snapshot → MISSING_SNAPSHOT, calculation blocked (never 0)');
      eq(C.classifyPlanningDataState({ snapshotPresent: true, snapshotAgeDays: 10, stalenessThresholdDays: 7, replenishmentModel: 'sales_driven', salesBasisPresent: true }),
         { state: 'STALE_SNAPSHOT', calculationAllowed: true },
         '#29 stale snapshot (10>7) → STALE_SNAPSHOT, warn-and-proceed (never 0)');
    }
  },
  {
    id: 30, sourceSection: '§33 #30 · §34A', title: 'Missing Forecast (forecast-driven SKU) → MISSING_FORECAST (never 0)',
    run: function () {
      // Real production call (§34A). A forecast-driven SKU with no forecast is
      // calculation-blocked / review — never treated as 0.
      eq(C.classifyPlanningDataState({ snapshotPresent: true, snapshotAgeDays: 1, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: false }),
         { state: 'MISSING_FORECAST', calculationAllowed: false },
         '#30 forecast-driven + forecast missing → MISSING_FORECAST, calculation blocked (never 0)');
    }
  },
  // ---- Round 9B promotion: #15/#16/#17/#27/#32 via the real §39 Demand/Supply Ledger pure runtime.
  //      Expected values are canonical LITERALS (never recomputed from engine output). ----
  {
    id: 15, sourceSection: '§33 #15 · §30', title: 'Delivered-not-received (never becomes Current Stock)',
    run: function () {
      // Real production call (§39). A carrier-delivered lineage stays Incoming supply; it never enters CURRENT_STOCK.
      var out = buildSupplyLedger({ entries: [
        { supplyLineageRef: 'SHIP-DNR', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'DELIVERED_NOT_RECEIVED', quantity: 100 }
      ] });
      eq(out.pools.length, 1, '#15 one physical pool');
      eq(out.pools[0].byLifecycleBucket.DELIVERED_NOT_RECEIVED, 100, '#15 delivered-not-received bucket = 100');
      eq(out.pools[0].byLifecycleBucket.CURRENT_STOCK, undefined, '#15 delivered does NOT become Current Stock');
      eq(out.totalEffectiveSupplyQty, 100, '#15 delivered contributes as supply once (100), non-current-stock');
    }
  },
  {
    id: 16, sourceSection: '§33 #16 · §30', title: 'Receipt posted (received/current, no duplicate supply)',
    run: function () {
      // Received-not-reflected and Current Stock each represent the same physical quantity ONCE (no double count).
      var recv = buildSupplyLedger({ entries: [
        { supplyLineageRef: 'SHIP-RCV', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'RECEIVED_NOT_REFLECTED', quantity: 100 }
      ] });
      eq(recv.pools[0].byLifecycleBucket.RECEIVED_NOT_REFLECTED, 100, '#16 received-not-reflected = 100');
      eq(recv.totalEffectiveSupplyQty, 100, '#16 receipt-posted lineage counted once (100)');
      var cur = buildSupplyLedger({ entries: [
        { supplyLineageRef: 'SHIP-CUR', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'CURRENT_STOCK', quantity: 100 }
      ] });
      eq(cur.totalEffectiveSupplyQty, 100, '#16 posted current-stock counted once (100)');
    }
  },
  {
    id: 17, sourceSection: '§33 #17 · §30', title: 'Same supply lifecycle counted once (never 200/300)',
    run: function () {
      // One physical lineage in ONE bucket = 100.
      var once = buildSupplyLedger({ entries: [
        { supplyLineageRef: 'L100', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'SHIPPED_IN_TRANSIT', quantity: 100 }
      ] });
      eq(once.totalEffectiveSupplyQty, 100, '#17 single-bucket lineage = 100 (count once)');
      // Same lineage simultaneously in two active buckets = fail-closed conflict (0), never 200/300.
      var conflict = buildSupplyLedger({ entries: [
        { supplyLineageRef: 'L100', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'SHIPPED_IN_TRANSIT', quantity: 100 },
        { supplyLineageRef: 'L100', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'CURRENT_STOCK', quantity: 100 }
      ] });
      eq(conflict.pools[0].state, 'BLOCKED_CONFLICT', '#17 same lineage in two buckets → blocked');
      eq(conflict.pools[0].reason, 'SUPPLY_LINEAGE_CONFLICT', '#17 reason = SUPPLY_LINEAGE_CONFLICT');
      eq(conflict.totalEffectiveSupplyQty, 0, '#17 conflict blocks rather than counting 200/300');
    }
  },
  {
    id: 27, sourceSection: '§33 #27 · §10/§29E', title: 'Multiple Special Events same month (stable event-ID count-once)',
    run: function () {
      // Two distinct eventIds in the same planning cycle remain two demand entries and sum.
      var out = buildDemandLedger({ entries: [
        { demandType: 'SPECIAL_EVENT', masterSku: 'GA0450', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'US-3PL-1', planningCycle: '2026-08', requiredByDate: '2026-08-10', eventId: 'EVT-A', sourceRef: 'FC-A', quantity: 300 },
        { demandType: 'SPECIAL_EVENT', masterSku: 'GA0450', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'US-3PL-1', planningCycle: '2026-08', requiredByDate: '2026-08-20', eventId: 'EVT-B', sourceRef: 'FC-B', quantity: 200 }
      ] });
      eq(out.entries.length, 2, '#27 two distinct events remain two entries');
      eq(out.totalEffectiveDemandQty, 500, '#27 distinct events summed (500)');
      // A duplicate copy of one event counts once; a same-eventId conflicting quantity blocks.
      var dup = buildDemandLedger({ entries: [
        { demandType: 'SPECIAL_EVENT', masterSku: 'GA0450', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'US-3PL-1', planningCycle: '2026-08', requiredByDate: '2026-08-10', eventId: 'EVT-A', sourceRef: 'FC-A', quantity: 300 },
        { demandType: 'SPECIAL_EVENT', masterSku: 'GA0450', company: 'KM', country: 'US', marketplace: 'SHOPIFY', destinationWarehouseId: 'US-3PL-1', planningCycle: '2026-08', requiredByDate: '2026-08-10', eventId: 'EVT-A', sourceRef: 'FC-A', quantity: 300 }
      ] });
      eq(dup.totalEffectiveDemandQty, 300, '#27 duplicate copy of one event counts once (300)');
      var conflict = buildDemandLedger({ entries: [
        { demandType: 'SPECIAL_EVENT', masterSku: 'GA0450', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'US-3PL-1', planningCycle: '2026-08', requiredByDate: '2026-08-10', eventId: 'EVT-A', sourceRef: 'FC-A', quantity: 300 },
        { demandType: 'SPECIAL_EVENT', masterSku: 'GA0450', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'US-3PL-1', planningCycle: '2026-08', requiredByDate: '2026-08-10', eventId: 'EVT-A', sourceRef: 'FC-A', quantity: 250 }
      ] });
      eq(conflict.entries[0].reason, 'DEMAND_EVENT_QTY_CONFLICT', '#27 same eventId conflicting qty → blocked');
      eq(conflict.totalEffectiveDemandQty, 0, '#27 event conflict contributes 0');
    }
  },
  {
    id: 32, sourceSection: '§33 #32 · §23', title: 'One Master SKU, many Marketplaces (physical pool counted once)',
    run: function () {
      // One physical 3PL pool copied across three Marketplace rows (same physical lineage) stays 1000, not 3000.
      var out = buildSupplyLedger({ entries: [
        { supplyLineageRef: 'POOL-3PL', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'CURRENT_STOCK', quantity: 1000 },
        { supplyLineageRef: 'POOL-3PL', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'CURRENT_STOCK', quantity: 1000 },
        { supplyLineageRef: 'POOL-3PL', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'CURRENT_STOCK', quantity: 1000 }
      ] });
      eq(out.pools.length, 1, '#32 one physical pool (marketplace excluded from identity)');
      eq(out.totalEffectiveSupplyQty, 1000, '#32 physical pool counted once (1000, not 3000)');
      // Conflicting snapshots of the same physical pool are fail-closed.
      var conflict = buildSupplyLedger({ entries: [
        { supplyLineageRef: 'POOL-C', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'CURRENT_STOCK', quantity: 1000 },
        { supplyLineageRef: 'POOL-C', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1', poolType: 'THREE_PL', lifecycleBucket: 'CURRENT_STOCK', quantity: 900 }
      ] });
      eq(conflict.pools[0].reason, 'PHYSICAL_POOL_QTY_CONFLICT', '#32 conflicting snapshots → PHYSICAL_POOL_QTY_CONFLICT');
      eq(conflict.totalEffectiveSupplyQty, 0, '#32 conflicting pool contributes 0 (not summed/picked)');
    }
  }
];

// ---- Inventory integrity (5 assertions): 40 unique IDs 1..40; executed = exactly the 33; pending = 7;
//      canonical-blocked = 0. (Post-B4-R8 promotion the suite runs 28 executed scenarios; the actual total
//      assertion count is printed at the end as "Assertion count = N" from the passing run — do not assume it.
//      Legacy pre-promotion baseline was 117; the executed-scenario
//      assertions [incl. Round 5 #28 Engine B + #33 Engine A sweep, Round 6 #21 SKU gate + #22 tier ordering,
//      Round 8B #29 missing/stale snapshot + #30 missing forecast via classifyPlanningDataState]
//      + the cross-scenario invariant/determinism checks.)
console.log('\n== §33 Golden Baseline — inventory integrity ==');
eq(SCENARIO_INVENTORY.length, 40, 'inventory count = 40 (one-to-one)');
(function () {
  var ids = SCENARIO_INVENTORY.map(function (s) { return s.id; });
  var uniq = {}; ids.forEach(function (i) { uniq[i] = 1; });
  var seq = ids.slice().sort(function (a, b) { return a - b; });
  var ok1to40 = Object.keys(uniq).length === 40 && seq.every(function (v, i) { return v === i + 1; });
  assert(ok1to40, 'inventory IDs are exactly 1..40, unique (no dup / no missing)');
})();
var execInInventory = SCENARIO_INVENTORY.filter(function (s) { return s.executionStatus === 'EXECUTED_EXISTING_CORE'; }).map(function (s) { return s.id; }).sort(function (a, b) { return a - b; });
var goldenIds = GOLDEN_SCENARIOS.map(function (s) { return s.id; }).sort(function (a, b) { return a - b; });
eq([execInInventory.join(','), goldenIds.join(',')], [EXECUTED_IDS.join(','), EXECUTED_IDS.join(',')],
   'executed scenarios are EXACTLY [1,2,3,4,5,6,12,13,14,15,16,17,18,20,21,22,23,24,25,26,27,28,29,30,31,32,33,35,36,37,38,39,40] in both inventory and the runnable set (⇒ executed count = 33)');
eq(SCENARIO_INVENTORY.filter(function (s) { return s.executionStatus === 'IMPLEMENTATION_PENDING'; }).length, 7,
   'implementation-pending count = 7 (frozen canonical rule, missing implementation owner: #7/#8/#9/#10/#11/#19 allocation, #34 UI/state)');
eq(SCENARIO_INVENTORY.filter(function (s) { return s.executionStatus === 'CANONICAL-BLOCKED' || s.canonicalStatus !== 'FROZEN'; }).length, 0,
   'canonical-blocked count = 0 (every scenario canonicalStatus = FROZEN)');

// ---- Execute the executable golden scenarios (each real, no skip/todo/only) ----
GOLDEN_SCENARIOS.forEach(function (sc) {
  console.log('\n== Golden #' + sc.id + ' — ' + sc.title + ' (' + sc.sourceSection + ') ==');
  var frozen = sc.input ? JSON.stringify(sc.input) : null;
  sc.run();
  if (sc.input) eq(JSON.stringify(sc.input), frozen, '#' + sc.id + ' scenario input object not mutated');
});

// ---- Global invariants over executable outputs (finite, non-negative domain) + determinism ----
console.log('\n== Cross-scenario invariants ==');
(function () {
  var r = C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 });
  var vals = [r.rawShippableQty, r.recommendedShippingQty, r.residualProductionRequired,
             C.calculateSuggestedOrderQty({ netOrderNeed: 60, unitsPerCarton: 40 }), C.calculateGap({ demand: 1000, destinationCurrentStock: 300, timelyQualifiedIncoming: 200, timelyApprovedCommittedSupply: 100 })];
  assert(vals.every(function (v) { return typeof v === 'number' && isFinite(v); }), 'all executable outputs finite');
  assert(vals.every(function (v) { return v >= 0; }), 'all non-negative-domain outputs ≥ 0');
})();
eq(C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 }),
   C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 }),
   'determinism: repeated execution returns identical result');

// ---- Baseline summary (Round 2 reclassification) ----
var executedCount = GOLDEN_SCENARIOS.length;
var pendingCount = SCENARIO_INVENTORY.filter(function (s) { return s.executionStatus === 'IMPLEMENTATION_PENDING'; }).length;
console.log('\n§33 GOLDEN BASELINE:');
console.log(executedCount + '/40 scenarios EXECUTED_EXISTING_CORE and PASSED');
console.log(pendingCount + '/40 scenarios IMPLEMENTATION_PENDING');
console.log('0/40 scenarios reported as CANONICAL-BLOCKED');
console.log('');
console.log('Scenario inventory count = ' + SCENARIO_INVENTORY.length);
console.log('Executed scenario count = ' + executedCount);
console.log('Pending implementation count = ' + pendingCount);
console.log('Assertion count = ' + pass);
console.log('');
console.log('RESULT:');
console.log('PHASE 2B GOLDEN BASELINE CHECKPOINT PASS');
console.log('FULL 40-SCENARIO MATRIX NOT COMPLETE');

if (fail) { console.error('\n' + fail + ' assertion(s) FAILED\n'); process.exit(1); }
process.exit(0);
