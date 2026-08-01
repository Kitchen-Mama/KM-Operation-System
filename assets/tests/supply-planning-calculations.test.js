// Canonical Supply Planning Calculation Core test (pure Node, no DOM / no DB / no Apps Script).
// Run: node assets/tests/supply-planning-calculations.test.js
//
// Expected values are derived from the CANONICAL SPEC (SUPPLY_PLANNING_CALCULATION_RULES.md v4.4),
// not from runtime output:
//   §10 Event Preparation Date = Event Start − 30 calendar days
//   §11 Shortage/Surplus from Projected Balance
//   §12/§32 Feasible reallocation MIN primitive + Net Order Need = Σ remaining shortage
//   §14 Suggested Order Qty = CEILING(need ÷ UPC) × UPC (missing UPC blocks — no default)
//   §31 Calculated Gap → Shipment FLOOR → Residual Production → Order CEILING (worked example)
//
// The suite covers the Phase 2A primitives plus the implemented Round 3 normalized-sales engine, the
// Round 3.1/3.1.1 marketplace-scope acceptance guards, the Round 4 §2D/§29F/§29G Forecast-Driven demand
// engine, the Round 5 §26/§27/§27A Required-By Window classifier (classifyRequiredByWindow — nested
// contract §27A.1; Engine A daysOut buckets + Engine B monthDelta tiers as independent adapters, exact
// TypeError/RangeError constructors), the Round 6 §32A Reallocation Eligibility pure predicate
// (evaluateReallocationEligibility — Same-Master-SKU exact equality + Engine B-only tier ordering), and the
// Round 8B §34A Missing / Stale Data pure classifier (classifyPlanningDataState — pure input-readiness
// { state, calculationAllowed }; branch-scoped TypeError/RangeError; Golden #29/#30 executed).
// Total = 325 assertions. It does NOT claim that all 40 Golden
// Scenarios are implemented — the current Golden Matrix is 25 executed / 15 pending / 0 canonical-blocked — and
// it does NOT test allocation/concurrency (B-6), line/source grain (B-5), Qualified-Incoming allowlist (B-4), or
// group-key (B-2), which remain future/Runtime boundaries.

var C = require('../js/core/supply-planning-calculations.js');

var fail = 0, pass = 0;
function eq(actual, expected, label) {
  var A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + A); }
  else { pass++; console.log('ok   ' + label); }
}
function throws(fn, label) {
  var threw = false;
  try { fn(); } catch (e) { threw = true; }
  if (!threw) { fail++; console.error('FAIL ' + label + ' (expected throw, none thrown)'); }
  else { pass++; console.log('ok   ' + label); }
}
// Stricter than throws(): the throw must occur AND its Error message must match the expected RegExp,
// so a test cannot pass on an unrelated failure reason (a wrong-cause throw is a FAIL, not a pass).
function throwsMatch(fn, expectedPattern, label) {
  var threw = false, msg = '';
  try { fn(); } catch (e) { threw = true; msg = (e && e.message) != null ? String(e.message) : String(e); }
  if (!threw) { fail++; console.error('FAIL ' + label + ' (expected throw matching ' + expectedPattern + ', none thrown)'); }
  else if (!expectedPattern.test(msg)) { fail++; console.error('FAIL ' + label + '\n  expected message to match ' + expectedPattern + '\n  got message ' + JSON.stringify(msg)); }
  else { pass++; console.log('ok   ' + label); }
}

// ============================================================================
console.log('\n== §10 Event Preparation Date (Event Start − 30 calendar days) ==');
eq(C.eventPreparationDate('2026-10-01'), '2026-09-01', '2026-10-01 → 2026-09-01');
eq(C.eventPreparationDate('2026-03-01'), '2026-01-30', '2026-03-01 → 2026-01-30 (Feb=28d, 2026 non-leap)');
eq(C.eventPreparationDate('2026-01-15'), '2025-12-16', '2026-01-15 → 2025-12-16 (crosses year boundary)');
eq(C.eventPreparationDate('2028-03-30'), '2028-02-29', '2028-03-30 → 2028-02-29 (leap year)');
eq(C.eventPreparationMonth('2026-10-01'), '2026-09', 'prep MONTH of 2026-10-01 → 2026-09');
eq(C.eventPreparationMonth('2026-01-15'), '2025-12', 'prep MONTH of 2026-01-15 → 2025-12');
throws(function () { C.eventPreparationDate('2026-13-01'); }, 'invalid month rejected');
throws(function () { C.eventPreparationDate('2026-02-30'); }, 'invalid day (02-30) rejected');
throws(function () { C.eventPreparationDate('2027-02-29'); }, 'non-leap 2027-02-29 rejected');
throws(function () { C.eventPreparationDate('2026-2-9'); }, 'non-strict format (single-digit) rejected — no locale parsing');
throws(function () { C.eventPreparationDate(20261001); }, 'non-string date rejected');
// No timezone drift / deterministic: repeated calls identical, and a date that could shift under a
// local-timezone parse (midnight UTC) still lands on the exact calendar day.
eq(C.eventPreparationDate('2026-10-01'), C.eventPreparationDate('2026-10-01'), 'deterministic: repeated call identical (no drift)');
eq(C.eventPreparationDate('2026-06-30'), '2026-05-31', 'no timezone drift: 2026-06-30 → 2026-05-31 exact');

// ============================================================================
console.log('\n== §31 Calculated Gap = MAX(Demand − Stock − Timely Incoming − Timely Committed, 0) ==');
eq(C.calculateGap({ demand: 1000, destinationCurrentStock: 300, timelyQualifiedIncoming: 200, timelyApprovedCommittedSupply: 100 }),
   400, 'gap = 1000 − 300 − 200 − 100 = 400');
eq(C.calculateGap({ demand: 100, destinationCurrentStock: 300, timelyQualifiedIncoming: 50, timelyApprovedCommittedSupply: 0 }),
   0, 'oversupply → gap floored at 0');
eq(C.calculateGap({ demand: 0, destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0 }),
   0, 'all zero → 0');
(function () {
  var inp = { demand: 1000, destinationCurrentStock: 300, timelyQualifiedIncoming: 200, timelyApprovedCommittedSupply: 100 };
  var snap = JSON.stringify(inp);
  C.calculateGap(inp);
  eq(JSON.stringify(inp), snap, 'calculateGap does not mutate input');
})();
throws(function () { C.calculateGap({ demand: -1, destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0 }); }, 'negative demand rejected');
throws(function () { C.calculateGap({ demand: NaN, destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0 }); }, 'NaN rejected');
throws(function () { C.calculateGap({ demand: Infinity, destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0 }); }, 'Infinity rejected');
throws(function () { C.calculateGap({ demand: '1000', destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0 }); }, 'numeric string rejected (no coercion)');

// ============================================================================
console.log('\n== §11 Shortage / Surplus from Projected Balance ==');
eq(C.classifyProjectedBalance(-300), { shortage: 300, surplus: 0 }, '−300 → shortage 300 / surplus 0');
eq(C.classifyProjectedBalance(0), { shortage: 0, surplus: 0 }, '0 → 0 / 0');
eq(C.classifyProjectedBalance(1000), { shortage: 0, surplus: 1000 }, '+1000 → shortage 0 / surplus 1000');
throws(function () { C.classifyProjectedBalance(NaN); }, 'NaN projected balance rejected');
throws(function () { C.classifyProjectedBalance('0'); }, 'string projected balance rejected');
throws(function () { C.classifyProjectedBalance(-Infinity); }, '−Infinity projected balance rejected');

// ============================================================================
console.log('\n== §31 Worked Example (Gap 300, Source 279, UPC 40) ==');
(function () {
  var r = C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 });
  eq(r.rawShippableQty, 279, 'Raw Shippable = MIN(300, 279) = 279');
  eq(r.recommendedShippingQty, 240, 'Recommended Shipping = FLOOR(279/40)×40 = 240');
  eq(r.residualProductionRequired, 60, 'Residual Production = 300 − 240 = 60');
  eq(r.residualProductionRequired === 21, false, 'FORBIDDEN Gap−RawSource (=21) never produced');
  eq(C.calculateSuggestedOrderQty({ netOrderNeed: 60, unitsPerCarton: 40 }), 80, 'Suggested Order = CEILING(60/40)×40 = 80');
})();

// ============================================================================
console.log('\n== §31 Shipping FLOOR / Residual — other cases ==');
(function () {
  var r = C.calculateShippingAndResidual({ calculatedGap: 100, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 });
  eq(r, { rawShippableQty: 100, recommendedShippingQty: 80, residualProductionRequired: 20 }, 'source > gap → raw=gap 100, ship 80, residual 20');
})();
(function () {
  var r = C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 0, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 });
  eq(r, { rawShippableQty: 0, recommendedShippingQty: 0, residualProductionRequired: 300 }, 'source = 0 → ship 0, residual = full gap');
})();
(function () {
  var r = C.calculateShippingAndResidual({ calculatedGap: 0, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 });
  eq(r, { rawShippableQty: 0, recommendedShippingQty: 0, residualProductionRequired: 0 }, 'gap = 0 → all 0');
})();
(function () {
  var r = C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 30, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 });
  eq(r, { rawShippableQty: 30, recommendedShippingQty: 0, residualProductionRequired: 300 }, 'source below one carton → ship 0 (partial carton never ships)');
})();
(function () {
  var r = C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 30, unitsPerCarton: 40 });
  eq(r.residualProductionRequired, 30, 'other legally allocated timely supply reduces residual (300−240−30=30)');
})();
(function () {
  var r = C.calculateShippingAndResidual({ calculatedGap: 100, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 50, unitsPerCarton: 40 });
  eq(r.residualProductionRequired, 0, 'residual never negative (100−80−50 → 0)');
  eq(r.recommendedShippingQty <= Math.min(100, 279), true, 'recommended shipping never exceeds gap or source');
})();
throws(function () { C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 0 }); }, 'UPC 0 rejected (no default)');
throws(function () { C.calculateShippingAndResidual({ calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0 }); }, 'missing UPC rejected (blocks calculation)');

// ============================================================================
console.log('\n== §14 Suggested Order Qty = CEILING(need ÷ UPC) × UPC ==');
eq(C.calculateSuggestedOrderQty({ netOrderNeed: 300, unitsPerCarton: 40 }), 320, 'need 300 / UPC 40 → 320');
eq(C.calculateSuggestedOrderQty({ netOrderNeed: 80, unitsPerCarton: 40 }), 80, 'need 80 / UPC 40 → 80 (exact multiple)');
eq(C.calculateSuggestedOrderQty({ netOrderNeed: 60, unitsPerCarton: 40 }), 80, 'need 60 / UPC 40 → 80');
eq(C.calculateSuggestedOrderQty({ netOrderNeed: 0, unitsPerCarton: 40 }), 0, 'need 0 → 0');
throws(function () { C.calculateSuggestedOrderQty({ netOrderNeed: 300 }); }, 'missing UPC → blocked/error (no fabricated qty)');
throws(function () { C.calculateSuggestedOrderQty({ netOrderNeed: 300, unitsPerCarton: 0 }); }, 'UPC 0 rejected');
throws(function () { C.calculateSuggestedOrderQty({ netOrderNeed: 300, unitsPerCarton: -40 }); }, 'UPC negative rejected');
throws(function () { C.calculateSuggestedOrderQty({ netOrderNeed: 300, unitsPerCarton: 40.5 }); }, 'UPC decimal rejected');
throws(function () { C.calculateSuggestedOrderQty({ netOrderNeed: 300, unitsPerCarton: '40' }); }, 'UPC string rejected (no coercion)');

// ============================================================================
console.log('\n== §12/§32 Feasible Reallocation primitive ==');
eq(C.feasibleReallocationQty({ receiverRemainingShortage: 1000, donorRemainingSurplus: 1200, timelyTransferableQty: 700 }),
   700, 'MIN(1000, 1200, 700) = 700 (timely-transferable binds)');
eq(C.feasibleReallocationQty({ receiverRemainingShortage: 200, donorRemainingSurplus: 1200, timelyTransferableQty: 700 }),
   200, 'receiver shortage is the MIN');
eq(C.feasibleReallocationQty({ receiverRemainingShortage: 1000, donorRemainingSurplus: 150, timelyTransferableQty: 700 }),
   150, 'donor surplus is the MIN');
eq(C.feasibleReallocationQty({ receiverRemainingShortage: 1000, donorRemainingSurplus: 1200, timelyTransferableQty: 50 }),
   50, 'timely transferable is the MIN');
eq(C.feasibleReallocationQty({ receiverRemainingShortage: 0, donorRemainingSurplus: 1200, timelyTransferableQty: 700 }),
   0, 'zero receiver shortage → 0');
eq(C.feasibleReallocationQty({ receiverRemainingShortage: 1000, donorRemainingSurplus: 0, timelyTransferableQty: 700 }),
   0, 'zero donor surplus → 0');
throws(function () { C.feasibleReallocationQty({ receiverRemainingShortage: -1, donorRemainingSurplus: 1200, timelyTransferableQty: 700 }); }, 'negative input rejected');

console.log('\n== §32 applyFeasibleReallocation (consume-once bookkeeping, no mutation) ==');
(function () {
  var inp = { receiverRemainingShortage: 1000, donorRemainingSurplus: 1200, timelyTransferableQty: 700 };
  var snap = JSON.stringify(inp);
  var out = C.applyFeasibleReallocation(inp);
  eq(out, { reallocatedQty: 700, receiverRemainingShortage: 300, donorRemainingSurplus: 500 }, 'apply → qty 700, receiver 300, donor 500');
  eq(JSON.stringify(inp), snap, 'applyFeasibleReallocation does not mutate input');
  // consume-once: the returned donor surplus (500) limits any further reallocation.
  eq(C.feasibleReallocationQty({ receiverRemainingShortage: 900, donorRemainingSurplus: out.donorRemainingSurplus, timelyTransferableQty: 900 }),
     500, 'surplus consumed once: remaining donor surplus (500) caps the next reallocation');
})();
(function () {
  var out = C.applyFeasibleReallocation({ receiverRemainingShortage: 100, donorRemainingSurplus: 1200, timelyTransferableQty: 700 });
  eq(out.receiverRemainingShortage >= 0 && out.donorRemainingSurplus >= 0, true, 'apply outputs never negative');
})();

// ============================================================================
console.log('\n== §12 Net Order Need = Σ remaining shortage ==');
eq(C.sumRemainingShortages([300, 500, 0]), 800, 'Σ[300,500,0] = 800');
eq(C.sumRemainingShortages([]), 0, 'Σ[] = 0');
(function () {
  var arr = [300, 500]; var snap = JSON.stringify(arr);
  C.sumRemainingShortages(arr);
  eq(JSON.stringify(arr), snap, 'sumRemainingShortages does not mutate input array');
})();
throws(function () { C.sumRemainingShortages('300'); }, 'non-array rejected');
throws(function () { C.sumRemainingShortages([300, -5]); }, 'negative element rejected');

// ============================================================================
console.log('\n== Determinism: same input → identical output ==');
(function () {
  var args = { calculatedGap: 300, eligibleSourceAvailable: 279, otherLegallyAllocatedTimelySupply: 0, unitsPerCarton: 40 };
  eq(C.calculateShippingAndResidual(args), C.calculateShippingAndResidual(args), 'calculateShippingAndResidual repeatable');
  eq(C.calculateGap({ demand: 500, destinationCurrentStock: 100, timelyQualifiedIncoming: 50, timelyApprovedCommittedSupply: 25 }),
     C.calculateGap({ demand: 500, destinationCurrentStock: 100, timelyQualifiedIncoming: 50, timelyApprovedCommittedSupply: 25 }),
     'calculateGap repeatable');
})();

// ============================================================================
console.log('\n== §22/§29E normalized-sales sampling engine ==');
function _nsPad2(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }
// Round 3.1/3.1.1 canonical scope (Master SKU 'A' on KM/US/Amazon). marketplace_sku_id = campaign identity.
// Event identity precedence: Event marketplaceId is AUTHORITATIVE when present; an active same-SKU
// ID-bearing Event REQUIRES a resolved scope.marketplaceId; an exact ID match is in scope; an ID mismatch is
// out of scope and NEVER falls back to the composite; company+country+marketplace is used ONLY when the Event
// marketplaceId is absent; an incomplete/mismatched composite is out of scope (never guessed into a match).
// The PERSISTED daily-sales source natural key stays snapshot_date+country+marketplace+
// channel+sku; `company` is a REQUIRED upstream-resolved Analysis-Layer identity (NOT a DB column and NOT
// inferred from channel) that the engine additionally enforces during Daily-Sales selection.
var NS_SCOPE = { marketplaceSkuId: 'MSKU-A-US-AMZ', marketplaceId: 'MKT-US-AMZ', sku: 'A', company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' };
function _nsDays(sku, startIso, n, units, scope) {
  scope = scope || NS_SCOPE;
  var ms = Date.UTC(+startIso.slice(0, 4), +startIso.slice(5, 7) - 1, +startIso.slice(8, 10)), out = [];
  for (var k = 0; k < n; k++) { var d = new Date(ms + k * 86400000); out.push({ date: d.getUTCFullYear() + '-' + _nsPad2(d.getUTCMonth() + 1) + '-' + _nsPad2(d.getUTCDate()), sku: sku, units: units, company: scope.company, country: scope.country, marketplace: scope.marketplace, channel: scope.channel }); }
  return out;
}
// 90 completed-day window, calc date excluded (calc 2026-04-01 ⇒ 2026-01-01 … 2026-03-31).
(function () {
  var daily = _nsDays('A', '2026-02-10', 5, 5).concat([
    { date: '2025-12-31', sku: 'A', units: 9, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' },  // calc − 91: OUTSIDE window
    { date: '2026-01-01', sku: 'A', units: 5, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' },  // calc − 90: window START (inside)
    { date: '2026-03-31', sku: 'A', units: 5, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' },  // calc − 1:  window END (inside)
    { date: '2026-04-01', sku: 'A', units: 9, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }   // calc date: EXCLUDED
  ]);
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: 70, dailySales: daily });
  eq(r.windowStart, '2026-01-01', 'window start = calc − 90d');
  eq(r.windowEnd, '2026-03-31', 'window end = calc − 1d');
  eq(r.normalDayCount, 7, 'only the 7 in-window rows are eligible (calc−91 and calc date excluded)');
  eq(r.selectedDates.indexOf('2026-01-01') !== -1 && r.selectedDates.indexOf('2026-03-31') !== -1, true, 'both window boundary dates are eligible');
  eq(r.selectedDates.indexOf('2025-12-31'), -1, 'calc − 91 (before window) is never sampled');
  eq(r.selectedDates.indexOf('2026-04-01'), -1, 'calc date itself is never sampled');
})();
// Fallback ladder rungs.
(function () {
  eq(C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: 70, dailySales: _nsDays('A', '2026-03-20', 8, 4) }).source, 'normalized_30d', '≥7 → normalized_30d');
  var mid = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: 70, dailySales: _nsDays('A', '2026-03-26', 4, 4) });
  eq([mid.source, mid.warning], ['normalized_30d', 'low_sample_warning'], '3–6 → normalized_30d + low_sample_warning');
  var lo = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: 70, dailySales: _nsDays('A', '2026-03-30', 2, 4) });
  eq([lo.source, lo.warning, lo.avgSalesPerDay], ['weekly_7d', 'insufficient_normal_days', 10], '<3 → weekly_7d = 70/7 = 10');
})();
// Cancelled/invalid campaign or event is NOT a contamination day.
(function () {
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: 70, dailySales: _nsDays('A', '2026-03-20', 8, 4),
    campaigns: [{ start: '2026-03-22', end: '2026-03-24', skuLines: [{ marketplaceSkuId: 'MSKU-A-US-AMZ', sku: 'A' }], status: 'cancelled' }] });
  eq(r.excludedDates.length, 0, 'cancelled campaign excludes NO dates');
  eq(r.normalDayCount, 8, 'all 8 days remain normal (cancelled campaign ignored)');
})();
// Event Preparation Date (start − 30d) is NOT a contamination period — only start..end selling dates are.
(function () {
  var daily = _nsDays('A', '2026-03-10', 12, 5).concat([{ date: '2026-02-18', sku: 'A', units: 5, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }]); // 02-18 = 03-20 − 30d (prep)
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: 70, dailySales: daily,
    events: [{ start: '2026-03-20', end: '2026-03-20', sku: 'A', marketplaceId: 'MKT-US-AMZ' }] });
  eq(r.excludedDates, ['2026-03-20'], 'only the event SELLING date is excluded');
  eq(r.selectedDates.indexOf('2026-02-18') !== -1, true, 'the Preparation Date (start − 30d) stays a NORMAL day (not contamination)');
})();
// Full numeric precision (no UI rounding in the sampling layer).
(function () {
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: 70,
    dailySales: [{ date: '2026-03-24', sku: 'A', units: 1, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }, { date: '2026-03-25', sku: 'A', units: 1, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }, { date: '2026-03-26', sku: 'A', units: 2, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }] });
  eq(r.avgSalesPerDay, 4 / 3, 'avg keeps full precision (4/3, not rounded)');
})();
// Input validation — no silent coercion / default.
throws(function () { C.normalizedAvgSalesPerDay({ calcDate: '2026-13-01', scope: NS_SCOPE, weekly7d: 70, dailySales: [] }); }, 'bad calcDate month rejected');
throws(function () { C.normalizedAvgSalesPerDay({ scope: NS_SCOPE, weekly7d: 70, dailySales: [] }); }, 'missing calcDate rejected');
throws(function () { C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', weekly7d: 70, dailySales: [] }); }, 'missing scope rejected');
throws(function () { C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: { sku: '', company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }, weekly7d: 70, dailySales: [] }); }, 'empty scope.sku rejected');
throws(function () { C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: { sku: 'A', marketplace: 'Amazon', channel: 'amazon' }, weekly7d: 70, dailySales: [] }); }, 'missing scope.country rejected');
throws(function () { C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: '70', dailySales: [] }); }, 'non-number weekly7d rejected (no coercion)');
throws(function () { C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: 70, dailySales: 'x' }); }, 'non-array dailySales rejected');
throws(function () { C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: 70, dailySales: [{ date: '2026-03-20', sku: 'A', units: -1, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }] }); }, 'negative units rejected');
// Does not mutate inputs.
(function () {
  var daily = _nsDays('A', '2026-03-20', 5, 5), camps = [{ start: '2026-03-21', end: '2026-03-21', skuLines: [{ marketplaceSkuId: 'MSKU-A-US-AMZ', sku: 'A' }] }];
  var snap = JSON.stringify([daily, camps]);
  C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: NS_SCOPE, weekly7d: 70, dailySales: daily, campaigns: camps });
  eq(JSON.stringify([daily, camps]), snap, 'normalizedAvgSalesPerDay does not mutate dailySales / campaigns');
})();

// ===== Round 3.1 · Marketplace-SKU scope isolation =====
console.log('\n== Round 3.1 marketplace-scope isolation ==');
var SC_A1 = { marketplaceSkuId: 'MSKU-A-US-AMZ', marketplaceId: 'MKT-US-AMZ', sku: 'A', company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' };
var SC_A2 = { marketplaceSkuId: 'MSKU-A-CA-AMZ', marketplaceId: 'MKT-CA-AMZ', sku: 'A', company: 'KM', country: 'CA', marketplace: 'Amazon', channel: 'amazon' };
// (1)+(6) Same Master SKU, different marketplace_sku_id: campaign belongs to Scope A1 only.
(function () {
  var camp = [{ start: '2026-03-18', end: '2026-03-20', skuLines: [{ marketplaceSkuId: 'MSKU-A-US-AMZ', sku: 'A' }] }];
  var rA1 = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SC_A1, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 10, 5, SC_A1), campaigns: camp });
  eq(rA1.excludedDates, ['2026-03-18', '2026-03-19', '2026-03-20'], 'Scope A1 (matching marketplace_sku_id) excludes the campaign dates');
  var rA2 = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SC_A2, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 10, 5, SC_A2), campaigns: camp });
  eq(rA2.excludedDates.length, 0, 'Scope A2 (different marketplace_sku_id, same Master SKU) excludes ZERO dates');
})();
// (2) Same SKU, same Amazon, different Company: ResUS campaign/event must not contaminate KM.
(function () {
  var kmScope = { marketplaceSkuId: 'MSKU-A-KM-US-AMZ', marketplaceId: 'MKT-KM-US-AMZ', sku: 'A', company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' };
  var resusCamp = [{ start: '2026-03-18', end: '2026-03-20', skuLines: [{ marketplaceSkuId: 'MSKU-A-RESUS-US-AMZ', sku: 'A' }] }];
  var resusEvent = [{ start: '2026-03-22', end: '2026-03-23', sku: 'A', company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-RESUS-US-AMZ' }];
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: kmScope, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 10, 5, kmScope), campaigns: resusCamp, events: resusEvent });
  eq(r.excludedDates.length, 0, 'ResUS Amazon campaign/event does NOT contaminate KM Amazon (same Master SKU)');
  eq(r.normalDayCount, 10, 'all 10 KM rows remain normal days');
})();
// (3) Event scope isolation: matching marketplace_id excludes; different scope does not.
(function () {
  var d = _nsDays('A', '2026-03-15', 10, 5, SC_A1);
  var match = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SC_A1, weekly7d: 70, dailySales: d, events: [{ start: '2026-03-18', end: '2026-03-19', sku: 'A', marketplaceId: 'MKT-US-AMZ' }] });
  eq(match.excludedDates, ['2026-03-18', '2026-03-19'], 'event with matching marketplace_id excludes its selling dates');
  var other = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SC_A1, weekly7d: 70, dailySales: d, events: [{ start: '2026-03-18', end: '2026-03-19', sku: 'A', marketplaceId: 'MKT-CA-AMZ', company: 'KM', country: 'CA', marketplace: 'Amazon' }] });
  eq(other.excludedDates.length, 0, 'event on a different marketplace_id / company+country+marketplace excludes nothing');
})();
// (4) Daily Sales same date/same Master SKU/two scopes: each calc uses only its own scoped row (no last-write-wins).
(function () {
  var mixed = _nsDays('A', '2026-03-20', 5, 5, SC_A1).concat(_nsDays('A', '2026-03-20', 5, 9, SC_A2));
  var rA1 = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SC_A1, weekly7d: 70, dailySales: mixed });
  var rA2 = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SC_A2, weekly7d: 70, dailySales: mixed });
  eq(rA1.avgSalesPerDay, 5, 'Scope A1 uses only its own units (=5), never A2 rows');
  eq(rA2.avgSalesPerDay, 9, 'Scope A2 uses only its own units (=9); no overwrite by A1 same-date rows');
})();
// (5) Duplicate exact natural key → deterministic failure.
throws(function () {
  C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SC_A1, weekly7d: 70, dailySales: [
    { date: '2026-03-20', sku: 'A', units: 5, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' },
    { date: '2026-03-20', sku: 'A', units: 8, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }
  ] });
}, 'duplicate snapshot_date+country+marketplace+channel+sku natural key rejected (no last-write-wins)');
// (7) Different Master SKU campaign does not contaminate the target SKU (retained).
(function () {
  var daily = _nsDays('A', '2026-03-19', 6, 5, SC_A1).concat(_nsDays('B', '2026-03-19', 6, 9, SC_A1));
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SC_A1, weekly7d: 70, dailySales: daily,
    campaigns: [{ start: '2026-03-19', end: '2026-03-24', skuLines: [{ marketplaceSkuId: 'MSKU-B-US-AMZ', sku: 'B' }] }] });
  eq(r.excludedDates.length, 0, 'a campaign for another Master SKU (different marketplace_sku_id) excludes none');
  eq(r.avgSalesPerDay, 5, "avg reflects only SKU A's rows (=5)");
})();
// (8) Same-Master-SKU campaign line missing marketplace_sku_id → deterministic failure (refuse to guess by sku).
throws(function () {
  C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: SC_A1, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 10, 5, SC_A1),
    campaigns: [{ start: '2026-03-18', end: '2026-03-20', skuLines: [{ sku: 'A' }] }] });
}, 'campaign line with the same Master SKU but no marketplace_sku_id is rejected (no sku-based guessing)');
// Campaigns present but scope lacks marketplace_sku_id → deterministic failure (cannot isolate).
throws(function () {
  C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: { sku: 'A', company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 5, 5, SC_A1),
    campaigns: [{ start: '2026-03-18', end: '2026-03-20', skuLines: [{ marketplaceSkuId: 'MSKU-A-US-AMZ', sku: 'A' }] }] });
}, 'campaigns present but scope.marketplaceSkuId missing is rejected');

// ===== Round 3.1.1 · Event identity precedence + Daily Sales Company isolation =====
console.log('\n== Round 3.1.1 event precedence + company isolation ==');
var KM_US = { marketplaceSkuId: 'MSKU-A-KM-US-AMZ', marketplaceId: 'MKT-KM-US-AMZ', sku: 'A', company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' };
var RESUS_US = { marketplaceSkuId: 'MSKU-A-RESUS-US-AMZ', marketplaceId: 'MKT-RESUS-US-AMZ', sku: 'A', company: 'ResUS', country: 'US', marketplace: 'Amazon', channel: 'amazon' };

// -- Event identity precedence (Repair A) --
// E1: an ID MISMATCH overrides a matching composite (no fallback rescue).
(function () {
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 10, 5, KM_US),
    events: [{ start: '2026-03-18', end: '2026-03-19', sku: 'A', marketplaceId: 'MKT-RESUS-US-AMZ', company: 'KM', country: 'US', marketplace: 'Amazon' }] });
  eq(r.excludedDates.length, 0, 'E1: mismatched marketplaceId does NOT contaminate even though company+country+marketplace match (ID authoritative)');
})();
// E2: a matching ID is authoritative even when the composite intentionally differs.
(function () {
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 10, 5, KM_US),
    events: [{ start: '2026-03-18', end: '2026-03-19', sku: 'A', marketplaceId: 'MKT-KM-US-AMZ', company: 'ResUS', country: 'CA', marketplace: 'Walmart' }] });
  eq(r.excludedDates, ['2026-03-18', '2026-03-19'], 'E2: matching marketplaceId excludes the selling dates despite a differing composite');
})();
// E3: ID absent ⇒ exact company+country+marketplace fallback excludes.
(function () {
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 10, 5, KM_US),
    events: [{ start: '2026-03-18', end: '2026-03-19', sku: 'A', company: 'KM', country: 'US', marketplace: 'Amazon' }] });
  eq(r.excludedDates, ['2026-03-18', '2026-03-19'], 'E3: no marketplaceId + exact composite match → excluded');
})();
// E4a: ID absent + INCOMPLETE composite → never guessed into a match (out-of-scope, no pollution).
(function () {
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 10, 5, KM_US),
    events: [{ start: '2026-03-18', end: '2026-03-19', sku: 'A', company: 'KM', country: 'US' }] });
  eq(r.excludedDates.length, 0, 'E4a: no marketplaceId + incomplete composite (missing marketplace) is not guessed → no pollution');
})();
// E4b: ID absent + mismatched composite → out-of-scope.
(function () {
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 10, 5, KM_US),
    events: [{ start: '2026-03-18', end: '2026-03-19', sku: 'A', company: 'ResUS', country: 'US', marketplace: 'Amazon' }] });
  eq(r.excludedDates.length, 0, 'E4b: no marketplaceId + mismatched company → out-of-scope, no pollution');
})();
// E5: a present-but-non-string marketplaceId is deterministically rejected (never treated as "missing").
// throwsMatch: the failure must be the TYPE defect, not any arbitrary throw.
throwsMatch(function () {
  C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 5, 5, KM_US),
    events: [{ start: '2026-03-18', end: '2026-03-19', sku: 'A', marketplaceId: 12345, company: 'KM', country: 'US', marketplace: 'Amazon' }] });
}, /events\[\d+\]\.marketplaceId must be a string when present/, 'E5: present-but-non-string event.marketplaceId is rejected as a TYPE defect (not downgraded to the composite fallback)');

// E6: an ACTIVE same-SKU ID-bearing Event with an UNRESOLVED scope.marketplaceId must fail-fast — even when
// the company+country+marketplace composite matches exactly (the composite must NOT rescue an ID-bearing event,
// and the event must NOT be silently ignored). Uses throwsMatch to pin the intended reason.
throwsMatch(function () {
  C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01',
    scope: { marketplaceSkuId: 'MSKU-A-KM-US-AMZ', sku: 'A', company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }, // scope.marketplaceId intentionally absent
    weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 5, 5, KM_US),
    events: [{ start: '2026-03-18', end: '2026-03-19', sku: 'A', marketplaceId: 'MKT-KM-US-AMZ', company: 'KM', country: 'US', marketplace: 'Amazon' }] });
}, /scope\.marketplaceId is required to isolate an ID-bearing event/, 'E6: active same-SKU ID-bearing event + unresolved scope.marketplaceId → deterministic fail-fast (composite does NOT rescue it)');

// E6 non-regression guard: a MISSING scope.marketplaceId must NOT be a blanket rejection just because events
// are present. A cancelled same-SKU ID-bearing event and an active DIFFERENT-SKU ID-bearing event both need no
// ID isolation for THIS scope, so with scope.marketplaceId absent the call must NOT throw and excludes nothing.
(function () {
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01',
    scope: { marketplaceSkuId: 'MSKU-A-KM-US-AMZ', sku: 'A', company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }, // scope.marketplaceId intentionally absent
    weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 5, 5, KM_US),
    events: [
      { start: '2026-03-18', end: '2026-03-19', sku: 'A', marketplaceId: 'MKT-KM-US-AMZ', status: 'cancelled', company: 'KM', country: 'US', marketplace: 'Amazon' }, // cancelled → excluded before ID isolation
      { start: '2026-03-20', end: '2026-03-21', sku: 'B', marketplaceId: 'MKT-KM-US-AMZ-B', company: 'KM', country: 'US', marketplace: 'Amazon' }                     // other SKU → excluded before ID isolation
    ] });
  eq(r.excludedDates.length, 0, 'E6-guard: missing scope.marketplaceId is NOT a blanket failure — cancelled + other-SKU ID-bearing events do not force a throw and exclude nothing');
})();

// -- Daily Sales Company isolation (Repair B) --
// D1: wrong-company-only rows are never sampled — KM falls to the canonical weekly fallback, NOT ResUS units.
(function () {
  var resusRows = _nsDays('A', '2026-03-15', 10, 9, RESUS_US);   // company=ResUS, identical source dims to KM scope
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: resusRows });
  eq(r.normalDayCount, 0, 'D1: ResUS rows are NOT counted for a KM scope (normalDayCount = 0)');
  eq(r.selectedDates.length, 0, 'D1: no ResUS date is selected for KM');
  eq([r.source, r.warning], ['weekly_7d', 'insufficient_normal_days'], 'D1: KM has <3 own rows → canonical weekly fallback (NOT the ResUS avg of 9)');
  eq(r.avgSalesPerDay, 10, 'D1: value = weekly7d(70)/7 = 10 — a fallback, never the ResUS units');
})();
// D2: matching-company rows are sampled normally.
(function () {
  var r = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: _nsDays('A', '2026-03-15', 10, 5, KM_US) });
  eq(r.normalDayCount, 10, 'D2: matching KM rows are sampled (10)');
  eq(r.avgSalesPerDay, 5, 'D2: avg = 5 from KM rows');
})();
// D3: same source dims, different Company, DIFFERENT dates (no persisted-key duplicate) — each scope its own.
(function () {
  var km = _nsDays('A', '2026-03-10', 8, 5, KM_US);          // KM 03-10..03-17
  var resus = _nsDays('A', '2026-03-20', 8, 9, RESUS_US);    // ResUS 03-20..03-27 (distinct dates)
  var mixed = km.concat(resus);
  var rKm = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: mixed });
  var rRe = C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: RESUS_US, weekly7d: 70, dailySales: mixed });
  eq([rKm.normalDayCount, rKm.avgSalesPerDay], [8, 5], 'D3: KM scope takes only the 8 KM rows (avg 5)');
  eq([rRe.normalDayCount, rRe.avgSalesPerDay], [8, 9], 'D3: ResUS scope takes only the 8 ResUS rows (avg 9)');
})();
// D4: a row matching the source dims but MISSING company → deterministic throw (pinned to the reason).
throwsMatch(function () {
  C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70,
    dailySales: [{ date: '2026-03-20', sku: 'A', units: 5, country: 'US', marketplace: 'Amazon', channel: 'amazon' }] });
}, /unresolved daily-sales company scope/, 'D4: source-dim-matching row with no resolved company is rejected (unresolved company scope)');
// D5: scope.company missing → deterministic throw (pinned to the reason).
throwsMatch(function () {
  C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: { marketplaceSkuId: 'MSKU-A-KM-US-AMZ', marketplaceId: 'MKT-KM-US-AMZ', sku: 'A', country: 'US', marketplace: 'Amazon', channel: 'amazon' }, weekly7d: 70, dailySales: [] });
}, /scope\.company must be a non-empty string/, 'D5: scope.company missing is rejected (non-empty string required)');
// D6: ONE persisted source key resolving to two companies → ambiguity failure (before window/company filter).
throwsMatch(function () {
  C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: [
    { date: '2026-03-20', sku: 'A', units: 5, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' },
    { date: '2026-03-20', sku: 'A', units: 9, company: 'ResUS', country: 'US', marketplace: 'Amazon', channel: 'amazon' }
  ] });
}, /ambiguous daily-sales company resolution for one source natural key/, 'D6: same persisted source key resolving to KM and ResUS is an ambiguous-company failure');
// D7: exact duplicate (same source key + same company) still rejected (regression guard).
throwsMatch(function () {
  C.normalizedAvgSalesPerDay({ calcDate: '2026-04-01', scope: KM_US, weekly7d: 70, dailySales: [
    { date: '2026-03-20', sku: 'A', units: 5, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' },
    { date: '2026-03-20', sku: 'A', units: 8, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon' }
  ] });
}, /duplicate daily-sales natural key/, 'D7: exact duplicate persisted natural key (same company) is still rejected');

// ============================================================================
console.log('\n== §2D/§29F/§29G Forecast-Driven demand engine ==');
// Canonical §2D/§29F/§29G fixture (frozen — Golden Scenario #6). Percent 50 = 50% (never a fraction 0.5).
var FD_FX = {
  forecastMonth1: { month: '2027-01', baseForecast: 620 },
  forecastMonth2: { month: '2027-02', baseForecast: 560 },
  targetRules: { skuPercent: 50, seriesPercent: 80, categoryPercent: 90 },
  specialEventDemand: 200,
  destinationCurrentStock: 300,
  timelyQualifiedIncoming: 200,
  timelyApprovedCommittedSupply: 100
};
(function () {
  var r = C.calculateForecastDrivenRemainingNeed(FD_FX);
  eq(r.targetRuleSource, 'sku', 'FD#1 targetRuleSource = sku (highest priority present)');
  eq(r.targetRulePercent, 50, 'FD#2 targetRulePercent = 50 (50%, not 0.5)');
  eq(r.adjustedForecastMonth1, 310, 'FD#3 adjustedForecastMonth1 = 620 × 50% = 310');
  eq(r.adjustedForecastMonth2, 280, 'FD#4 adjustedForecastMonth2 = 560 × 50% = 280');
  eq(r.adjustedRegularForecast, 590, 'FD#5 adjustedRegularForecast = 310 + 280 = 590');
  eq([r.month1CalendarDays, r.month2CalendarDays], [31, 28], 'FD#6 actual calendar days = [31, 28] (Jan 31 / Feb 2027 non-leap 28)');
  eq(r.forecastDailyDemand, 10, 'FD#7 forecastDailyDemand = 590 ÷ 59 = 10');
  eq(r.safetyDemand, 300, 'FD#8 safetyDemand = 10 × 30 = 300 (additional 30-day coverage)');
  eq(r.specialEventDemand, 200, 'FD#9 specialEventDemand = 200 (added once at 100%, never target-adjusted)');
  eq(r.totalForecastDrivenDemand, 1090, 'FD#10 total = 590 + 300 + 200 = 1090');
  eq(r.forecastDrivenRemainingNeed, 490, 'FD#11 remaining = MAX(1090 − 300 − 200 − 100, 0) = 490');
})();
// FD#12 — Approved/Committed Supply deducted EXACTLY ONCE (committed 0 → 590; the only difference vs FD#11).
eq(C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { timelyApprovedCommittedSupply: 0 })).forecastDrivenRemainingNeed, 590,
   'FD#12 committed 0 → remaining 590 (proves committed 100 deducted exactly once: 590 → 490)');
// Target Rule priority: SKU > Series > Category > default 100%.
eq(C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { targetRules: { seriesPercent: 80, categoryPercent: 90 } })).targetRuleSource, 'series',
   'FD#13 SKU absent → Series rule selected');
eq(C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { targetRules: { categoryPercent: 90 } })).targetRuleSource, 'category',
   'FD#14 SKU + Series absent → Category rule selected');
(function () {
  var r = C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { targetRules: {} }));
  eq([r.targetRuleSource, r.targetRulePercent], ['default', 100], 'FD#15 all three absent → default 100%');
})();
(function () {
  var r = C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { targetRules: { skuPercent: 0, seriesPercent: 80 } }));
  eq([r.targetRulePercent, r.targetRuleSource, r.adjustedRegularForecast], [0, 'sku', 0], 'FD#16 explicit SKU 0% stays 0% — never falls through to Series (adjusted FC = 0)');
})();
// Calendar — leap year + cross-year (Month 2 must be the next calendar month).
(function () {
  var r = C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { forecastMonth1: { month: '2028-02', baseForecast: 620 }, forecastMonth2: { month: '2028-03', baseForecast: 560 } }));
  eq([r.month1CalendarDays, r.month2CalendarDays], [29, 31], 'FD#17 2028-02 / 2028-03 → [29, 31] (leap-year February)');
})();
(function () {
  var r = C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { forecastMonth1: { month: '2027-12', baseForecast: 620 }, forecastMonth2: { month: '2028-01', baseForecast: 560 } }));
  eq([r.month1CalendarDays, r.month2CalendarDays], [31, 31], 'FD#18 2027-12 / 2028-01 → [31, 31] (Dec → next-year Jan)');
})();
throwsMatch(function () { C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { forecastMonth1: { month: '2027-01', baseForecast: 620 }, forecastMonth2: { month: '2027-03', baseForecast: 560 } })); },
   /immediately after/, 'FD#19 non-consecutive Month 1 / Month 2 throws');
// Validation + purity — a present-but-invalid HIGHER-priority rule throws and never falls back.
throwsMatch(function () { C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { targetRules: { skuPercent: 'x', seriesPercent: 80 } })); },
   /targetRules\.skuPercent must be a finite number/, 'FD#20 invalid highest-priority Target Rule throws (no fallback to Series)');
throwsMatch(function () { C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { forecastMonth1: { month: '2027-01', baseForecast: '620' } })); },
   /forecastMonth1\.baseForecast must be a finite number/, 'FD#21 numeric-string Base Forecast throws (no coercion)');
throwsMatch(function () { C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { timelyQualifiedIncoming: -1 })); },
   /timelyQualifiedIncoming must be non-negative/, 'FD#22 negative Timely Incoming throws');
(function () {
  var snap = JSON.stringify(FD_FX);
  C.calculateForecastDrivenRemainingNeed(FD_FX);
  eq(JSON.stringify(FD_FX), snap, 'FD#23 canonical input object is not mutated');
})();
eq(JSON.stringify(C.calculateForecastDrivenRemainingNeed(FD_FX)), JSON.stringify(C.calculateForecastDrivenRemainingNeed(FD_FX)),
   'FD#24 repeated identical input → identical result (deterministic)');
eq(C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { destinationCurrentStock: 100000 })).forecastDrivenRemainingNeed, 0,
   'FD#25 excess supply floors Remaining Need at 0');
eq(C.calculateForecastDrivenRemainingNeed({ forecastMonth1: { month: '2027-01', baseForecast: 0 }, forecastMonth2: { month: '2027-02', baseForecast: 0 }, targetRules: {}, specialEventDemand: 0, destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0 }).forecastDrivenRemainingNeed, 0,
   'FD#26 all-zero demand/supply → Remaining Need 0');
throwsMatch(function () { C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { forecastMonth1: { month: '2027-1', baseForecast: 620 } })); },
   /must match strict YYYY-MM/, 'FD#27 invalid YYYY-MM throws (no locale parsing)');
throwsMatch(function () { C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { specialEventDemand: NaN })); },
   /specialEventDemand must be a finite number/, 'FD#28 NaN Special Event Demand throws');
throwsMatch(function () { C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { forecastMonth1: { month: '2027-01', baseForecast: Infinity } })); },
   /forecastMonth1\.baseForecast must be a finite number/, 'FD#29 Infinity Base Forecast throws');
throwsMatch(function () { C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { forecastMonth2: { month: '2027-02' } })); },
   /forecastMonth2\.baseForecast must be a finite number/, 'FD#30 missing Month 2 Base Forecast throws');
(function () {
  var r = C.calculateForecastDrivenRemainingNeed({ forecastMonth1: { month: '2027-04', baseForecast: 1 }, forecastMonth2: { month: '2027-05', baseForecast: 1 }, targetRules: {}, specialEventDemand: 0, destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0 });
  eq([r.forecastDailyDemand, r.safetyDemand], [0.03278688524590164, 0.9836065573770492], 'FD#31 full precision: (2 ÷ 61) daily, × 30 safety — no intermediate rounding');
})();
throwsMatch(function () { C.calculateForecastDrivenRemainingNeed(Object.assign({}, FD_FX, { targetRules: { skuPercent: -50 } })); },
   /targetRules\.skuPercent must be non-negative/, 'FD#32 negative selected Target Rule throws');

// ============================================================================
// Round 5 — §26 / §27 / §27A Required-By Window pure classifier (classifyRequiredByWindow).
// Nested contract per §27A.1; Engine A (daysOut, §27A.4) and Engine B (monthDelta, §27A.5)
// are INDEPENDENT adapters (§27.6 — no 1:1 map). All expected values below are Canonical
// literals, never produced from production output.
console.log('\n== §26/§27/§27A Required-By Window classifier (classifyRequiredByWindow) ==');

// Exact-constructor throw helper: the throw must occur AND error.constructor must be the
// expected class (a wrong-cause throw or wrong error type is a FAIL, not a pass).
function throwsType(fn, ExpectedCtor, label) {
  var threw = false, ctorName = '';
  try { fn(); } catch (e) { threw = true; ctorName = (e && e.constructor) ? e.constructor.name : String(e); if (e && e.constructor === ExpectedCtor) { pass++; console.log('ok   ' + label); return; } }
  fail++;
  if (!threw) console.error('FAIL ' + label + ' (expected ' + ExpectedCtor.name + ', none thrown)');
  else console.error('FAIL ' + label + ' (expected ' + ExpectedCtor.name + ', got ' + ctorName + ')');
}

// -- 13.A Nested output shape --------------------------------------------------
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-31', requiredByDate: '2026-05-01' }),
   { daysOut: 90, monthDelta: 4, engineA: { bucket: '46–90d', visible: true, allocationEligible: true }, engineB: { tier: 'T4', visible: true, allocationEligible: false, payloadEligible: false } },
   'CW#1 Independence Example A complete object (A=46–90d alloc, B=T4 display-only)');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: '2026-04-30' }),
   { daysOut: 119, monthDelta: 3, engineA: { bucket: '>90d', visible: true, allocationEligible: false }, engineB: { tier: 'T3', visible: true, allocationEligible: true, payloadEligible: true } },
   'CW#2 Independence Example B complete object (A=>90d no-alloc, B=T3 payload)');
(function () {
  var r = C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: '2026-02-10' });
  eq(Object.keys(r).sort(), ['daysOut', 'engineA', 'engineB', 'monthDelta'], 'CW#3 top-level keys are exactly daysOut/monthDelta/engineA/engineB');
  eq('engineABucket' in r, false, 'CW#4 no flat engineABucket (superseded flat contract NOT implemented)');
  eq(['tier', 'visible', 'allocationEligible', 'payloadEligible', 'bucket'].some(function (k) { return k in r; }), false,
     'CW#5 no top-level tier/visible/allocationEligible/payloadEligible/bucket');
  eq(Object.keys(r.engineA).sort(), ['allocationEligible', 'bucket', 'visible'], 'CW#6 engineA keys exactly bucket/visible/allocationEligible (NO payloadEligible)');
  eq(Object.keys(r.engineB).sort(), ['allocationEligible', 'payloadEligible', 'tier', 'visible'], 'CW#7 engineB keys exactly tier/visible/allocationEligible/payloadEligible');
})();

// -- 13.B Engine A boundary sweep (calculationDate = 2026-01-01) ----------------
// daysOut and bucket are Canonical literals; ranges use the frozen en-dash tokens.
var CW_SWEEP = [
  ['2025-12-31', -1, '0–18d'], ['2026-01-01', 0, '0–18d'], ['2026-01-19', 18, '0–18d'],
  ['2026-01-20', 19, '19–30d'], ['2026-01-31', 30, '19–30d'],
  ['2026-02-01', 31, '31–45d'], ['2026-02-15', 45, '31–45d'],
  ['2026-02-16', 46, '46–90d'], ['2026-04-01', 90, '46–90d'],
  ['2026-04-02', 91, '>90d']
];
for (var si = 0; si < CW_SWEEP.length; si++) {
  (function (rb, expDays, expBucket) {
    var r = C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: rb });
    eq(r.daysOut, expDays, 'CW#A daysOut ' + rb + ' → ' + expDays);
    eq(r.engineA.bucket, expBucket, 'CW#A bucket ' + rb + ' → ' + expBucket);
  })(CW_SWEEP[si][0], CW_SWEEP[si][1], CW_SWEEP[si][2]);
}
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: '2026-04-02' }).engineA.visible, true, 'CW#A8 >90d visible = true');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: '2026-04-02' }).engineA.allocationEligible, false, 'CW#A9 >90d allocationEligible = false');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: '2026-04-01' }).engineA.allocationEligible, true, 'CW#A10 in-range 46–90d allocationEligible = true');
(function () {
  var r = C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: '2025-12-31' });
  eq([r.daysOut, Number.isInteger(r.daysOut), r.engineA.bucket], [-1, true, '0–18d'], 'CW#A11 overdue keeps negative integer daysOut, bucket folds to 0–18d');
})();

// -- 13.C Engine B tiers (overdue first, then monthDelta) -----------------------
eq(C.classifyRequiredByWindow({ calculationDate: '2026-02-15', requiredByDate: '2026-01-20' }).engineB,
   { tier: 'T1', visible: true, allocationEligible: true, payloadEligible: true }, 'CW#B1 overdue prior-month → engineB T1 (all eligible)');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-05', requiredByDate: '2026-01-20' }).engineB.tier, 'T1', 'CW#B2 monthDelta 0 → T1');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-05', requiredByDate: '2026-02-20' }).engineB.tier, 'T1', 'CW#B3 monthDelta 1 → T1');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-05', requiredByDate: '2026-03-01' }).engineB.tier, 'T2', 'CW#B4 monthDelta 2 → T2');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-05', requiredByDate: '2026-04-01' }).engineB.tier, 'T3', 'CW#B5 monthDelta 3 → T3');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-05', requiredByDate: '2026-05-01' }).engineB,
   { tier: 'T4', visible: true, allocationEligible: false, payloadEligible: false }, 'CW#B6 monthDelta 4 → T4 display-only');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-05', requiredByDate: '2026-06-01' }).engineB,
   { tier: null, visible: false, allocationEligible: false, payloadEligible: false }, 'CW#B7 monthDelta 5 → tier null, all false');
eq([C.classifyRequiredByWindow({ calculationDate: '2026-12-15', requiredByDate: '2027-01-10' }).engineB.tier, C.classifyRequiredByWindow({ calculationDate: '2026-12-15', requiredByDate: '2027-01-10' }).monthDelta],
   ['T1', 1], 'CW#B8 year-crossing 2026-12 → 2027-01 → monthDelta 1 → T1');

// -- 13.D Date arithmetic / purity ---------------------------------------------
eq(C.classifyRequiredByWindow({ calculationDate: '2026-03-10', requiredByDate: '2026-03-10' }).daysOut, 0, 'CW#D1 same date → daysOut 0');
eq([C.classifyRequiredByWindow({ calculationDate: '2026-01-31', requiredByDate: '2026-02-01' }).daysOut, C.classifyRequiredByWindow({ calculationDate: '2026-01-31', requiredByDate: '2026-02-01' }).monthDelta], [1, 1], 'CW#D2 Jan 31 → Feb 1 → daysOut 1, monthDelta 1');
eq(C.classifyRequiredByWindow({ calculationDate: '2028-02-28', requiredByDate: '2028-03-01' }).daysOut, 2, 'CW#D3 leap-year boundary: 2028-02-29 exists → daysOut 2');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-02-28', requiredByDate: '2026-03-01' }).daysOut, 1, 'CW#D4 non-leap boundary: 2026 Feb has 28 days → daysOut 1');
eq([C.classifyRequiredByWindow({ calculationDate: '2026-12-31', requiredByDate: '2027-01-01' }).daysOut, C.classifyRequiredByWindow({ calculationDate: '2026-12-31', requiredByDate: '2027-01-01' }).monthDelta], [1, 1], 'CW#D5 year boundary 2026-12-31 → 2027-01-01 → daysOut 1, monthDelta 1');
eq(C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: '2026-04-30' }), C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: '2026-04-30' }), 'CW#D6 deterministic: repeated identical input → identical result');
(function () {
  var inp = { calculationDate: '2026-01-01', requiredByDate: '2026-04-30' };
  var snap = JSON.stringify(inp);
  var a = C.classifyRequiredByWindow(inp);
  var b = C.classifyRequiredByWindow(inp);
  eq(JSON.stringify(inp), snap, 'CW#D7 input object is not mutated');
  eq(a.engineA !== b.engineA && a.engineB !== b.engineB && a !== b, true, 'CW#D8 each call returns fresh top-level/engineA/engineB objects');
  a.engineA.bucket = 'MUT'; a.engineB.tier = 'MUT';
  eq(C.classifyRequiredByWindow(inp).engineA.bucket, '>90d', 'CW#D9 mutating one output does not pollute later calls');
})();

// -- 13.E Exact error constructors (TypeError shape / RangeError value) ---------
throwsType(function () { C.classifyRequiredByWindow(undefined); }, TypeError, 'CW#E1 undefined input → TypeError');
throwsType(function () { C.classifyRequiredByWindow(null); }, TypeError, 'CW#E2 null input → TypeError');
throwsType(function () { C.classifyRequiredByWindow('2026-01-01'); }, TypeError, 'CW#E3 primitive input → TypeError');
throwsType(function () { C.classifyRequiredByWindow(['2026-01-01', '2026-02-01']); }, TypeError, 'CW#E4 Array input → TypeError');
throwsType(function () { C.classifyRequiredByWindow({ requiredByDate: '2026-02-01' }); }, TypeError, 'CW#E5 missing calculationDate → TypeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-01-01' }); }, TypeError, 'CW#E6 missing requiredByDate → TypeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: 20260101, requiredByDate: '2026-02-01' }); }, TypeError, 'CW#E7 numeric calculationDate → TypeError (no coercion)');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: new Date(), requiredByDate: '2026-02-01' }); }, TypeError, 'CW#E8 Date-object calculationDate → TypeError (no coercion)');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: null, requiredByDate: '2026-02-01' }); }, TypeError, 'CW#E9 null calculationDate → TypeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: 20260201 }); }, TypeError, 'CW#E10 numeric requiredByDate → TypeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: new Date() }); }, TypeError, 'CW#E11 Date-object requiredByDate → TypeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-01-01', requiredByDate: null }); }, TypeError, 'CW#E12 null requiredByDate → TypeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-2-01', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E13 "2026-2-01" (non-padded month) → RangeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-02-1', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E14 "2026-02-1" (non-padded day) → RangeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026/02/01', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E15 slash date → RangeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '20260201', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E16 compact "20260201" → RangeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-02-01T00:00:00', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E17 datetime form → RangeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-02-01Z', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E18 timezone suffix → RangeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-00-01', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E19 month 00 → RangeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-13-01', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E20 month 13 → RangeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-02-00', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E21 day 00 → RangeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-02-30', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E22 February 30 → RangeError');
throwsType(function () { C.classifyRequiredByWindow({ calculationDate: '2026-02-29', requiredByDate: '2026-02-01' }); }, RangeError, 'CW#E23 non-leap February 29 → RangeError');

// ============================================================================
// Round 6 — §32A Reallocation Eligibility pure predicate (evaluateReallocationEligibility).
// Same-Master-SKU EXACT equality + Engine B-only tier ordering (donorRank <= receiverRank over
// T1/T2/T3); T4/null ineligible; Engine A never read; no quantity in/out; pure/fresh outputs.
// All expected values are Canonical literals per §32A, never produced from production output.
// Controlled dates (calculationDate = 2026-01-01): T1 = 2026-01-20 (monthDelta 0), T2 = 2026-03-15
// (monthDelta 2), T3 = 2026-04-15 (monthDelta 3), T4 = 2026-05-15 (monthDelta 4), null = 2026-06-15
// (monthDelta 5). Exactly 55 assertions. (§32A brought the running total to 227 + 55 = 282; the Round 8B
// §34A classifyPlanningDataState section below adds 43 more → 325 grand total.)
console.log('\n== §32A Reallocation Eligibility predicate (evaluateReallocationEligibility) ==');

var RE = C.evaluateReallocationEligibility;
function reInput(donorSku, donorRB, recvSku, recvRB) {
  return { calculationDate: '2026-01-01', donor: { masterSku: donorSku, requiredByDate: donorRB }, receiver: { masterSku: recvSku, requiredByDate: recvRB } };
}
function keysOf(o) { return Object.keys(o); }

// -- 6.A Public contract (4) --------------------------------------------------
eq(RE(reInput('GA0450', '2026-01-20', 'GA0450', '2026-03-15')),
   { sameMasterSku: true, donor: { tier: 'T1', allocationEligible: true }, receiver: { tier: 'T2', allocationEligible: true }, tierOrderingEligible: true, eligible: true },
   'RE#A1 exact canonical T1 → T2 output');
eq(keysOf(RE(reInput('GA0450', '2026-01-20', 'GA0450', '2026-03-15'))),
   ['sameMasterSku', 'donor', 'receiver', 'tierOrderingEligible', 'eligible'], 'RE#A2 exact top-level key set');
eq(keysOf(RE(reInput('GA0450', '2026-01-20', 'GA0450', '2026-03-15')).donor), ['tier', 'allocationEligible'], 'RE#A3 exact donor key set');
eq(keysOf(RE(reInput('GA0450', '2026-01-20', 'GA0450', '2026-03-15')).receiver), ['tier', 'allocationEligible'], 'RE#A4 exact receiver key set');

// -- 6.B Same-Master-SKU EXACT equality (3) -----------------------------------
// Each different-SKU case is same-tier (T1→T1) so tierOrderingEligible=true while eligible stays false.
function skuFacts(o) { return { sameMasterSku: o.sameMasterSku, tierOrderingEligible: o.tierOrderingEligible, eligible: o.eligible }; }
eq(skuFacts(RE(reInput('GA0450', '2026-01-20', 'GA3120', '2026-01-20'))), { sameMasterSku: false, tierOrderingEligible: true, eligible: false }, 'RE#B1 GA0450 vs GA3120 → sameMasterSku false (tierOrdering true, eligible false)');
eq(skuFacts(RE(reInput('GA0450', '2026-01-20', 'ga0450', '2026-01-20'))), { sameMasterSku: false, tierOrderingEligible: true, eligible: false }, 'RE#B2 GA0450 vs ga0450 → false (case-sensitive; never case-folded)');
eq(skuFacts(RE(reInput('GA0450', '2026-01-20', ' GA0450', '2026-01-20'))), { sameMasterSku: false, tierOrderingEligible: true, eligible: false }, 'RE#B3 GA0450 vs " GA0450" → false (never trimmed for equality)');

// -- 6.C Complete T1/T2/T3 truth table (9) ------------------------------------
var RB = { T1: '2026-01-20', T2: '2026-03-15', T3: '2026-04-15' };
var TT = { T1: 1, T2: 2, T3: 3 };
['T1', 'T2', 'T3'].forEach(function (d) {
  ['T1', 'T2', 'T3'].forEach(function (r) {
    var expected = TT[d] <= TT[r];
    var o = RE(reInput('GA0450', RB[d], 'GA0450', RB[r]));
    eq([o.tierOrderingEligible, o.eligible], [expected, expected], 'RE#C ' + d + ' → ' + r + ' → eligible ' + expected);
  });
});

// -- 6.D T4 / null exclusion (6) ----------------------------------------------
var EXC = { T3: '2026-04-15', T4: '2026-05-15', NULL: '2026-06-15' };
[['T4', 'T3'], ['T3', 'T4'], ['T4', 'T4'], ['NULL', 'T3'], ['T3', 'NULL'], ['NULL', 'NULL']].forEach(function (p) {
  var o = RE(reInput('GA0450', EXC[p[0]], 'GA0450', EXC[p[1]]));
  eq([o.tierOrderingEligible, o.eligible], [false, false], 'RE#D ' + p[0] + ' → ' + p[1] + ' → ineligible (T4/null not an allocation rank)');
});

// -- 6.E Engine A independence (1) --------------------------------------------
// 2026-04-15 under calc 2026-01-01: Engine A bucket=">90d"/allocationEligible=false, Engine B tier=T3/
// allocationEligible=true. The predicate must decide on Engine B (T3→T3 eligible), never on Engine A.
eq(RE(reInput('GA0450', '2026-04-15', 'GA0450', '2026-04-15')),
   { sameMasterSku: true, donor: { tier: 'T3', allocationEligible: true }, receiver: { tier: 'T3', allocationEligible: true }, tierOrderingEligible: true, eligible: true },
   'RE#E1 Engine A false + Engine B T3 true → eligible via Engine B only (Engine A not read)');

// -- 6.F Purity / fresh objects (6) -------------------------------------------
var reI = reInput('GA0450', '2026-01-20', 'GA0450', '2026-03-15');
var reSnap = JSON.stringify(reI);
var reO1 = RE(reI);
var reO2 = RE(reI);
eq(JSON.stringify(reI), reSnap, 'RE#F1 input object is not mutated');
eq(reO1, reO2, 'RE#F2 repeated identical input → identical value');
eq(reO1 !== reO2, true, 'RE#F3 each call returns a fresh top-level object');
eq(reO1.donor !== reO2.donor, true, 'RE#F4 each call returns a fresh donor object');
eq(reO1.receiver !== reO2.receiver, true, 'RE#F5 each call returns a fresh receiver object');
reO1.donor.tier = 'MUTATED';
eq(RE(reI).donor.tier, 'T1', 'RE#F6 mutating one output does not pollute later calls');

// -- 6.G Validation constructors (26) -----------------------------------------
// input shapes (4)
throwsType(function () { RE(undefined); }, TypeError, 'RE#G1 undefined input → TypeError');
throwsType(function () { RE(null); }, TypeError, 'RE#G2 null input → TypeError');
throwsType(function () { RE('x'); }, TypeError, 'RE#G3 primitive input → TypeError');
throwsType(function () { RE([reI]); }, TypeError, 'RE#G4 Array input → TypeError');
// donor shapes (4)
throwsType(function () { RE({ calculationDate: '2026-01-01', receiver: { masterSku: 'GA0450', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G5 missing donor → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: null, receiver: { masterSku: 'GA0450', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G6 null donor → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: 'GA0450', receiver: { masterSku: 'GA0450', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G7 primitive donor → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: [], receiver: { masterSku: 'GA0450', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G8 Array donor → TypeError');
// receiver shapes (4)
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G9 missing receiver → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: null }); }, TypeError, 'RE#G10 null receiver → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: 'GA0450' }); }, TypeError, 'RE#G11 primitive receiver → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: [] }); }, TypeError, 'RE#G12 Array receiver → TypeError');
// donor.masterSku (4)
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { requiredByDate: '2026-01-20' }, receiver: { masterSku: 'GA0450', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G13 missing donor.masterSku → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 123, requiredByDate: '2026-01-20' }, receiver: { masterSku: 'GA0450', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G14 non-string donor.masterSku → TypeError (no coercion)');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: '', requiredByDate: '2026-01-20' }, receiver: { masterSku: 'GA0450', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G15 empty donor.masterSku → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: '   ', requiredByDate: '2026-01-20' }, receiver: { masterSku: 'GA0450', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G16 whitespace-only donor.masterSku → TypeError');
// receiver.masterSku (4)
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: { requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G17 missing receiver.masterSku → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: { masterSku: 123, requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G18 non-string receiver.masterSku → TypeError (no coercion)');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: { masterSku: '', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G19 empty receiver.masterSku → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: { masterSku: '   ', requiredByDate: '2026-01-20' } }); }, TypeError, 'RE#G20 whitespace-only receiver.masterSku → TypeError');
// date TypeError / RangeError delegation to classifyRequiredByWindow (6)
throwsType(function () { RE({ calculationDate: 20260101, donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: { masterSku: 'GA0450', requiredByDate: '2026-03-15' } }); }, TypeError, 'RE#G21 numeric calculationDate → TypeError (classifier delegation)');
throwsType(function () { RE({ calculationDate: '2026-13-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: { masterSku: 'GA0450', requiredByDate: '2026-03-15' } }); }, RangeError, 'RE#G22 invalid calculationDate → RangeError (classifier delegation)');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: 20260120 }, receiver: { masterSku: 'GA0450', requiredByDate: '2026-03-15' } }); }, TypeError, 'RE#G23 non-string donor.requiredByDate → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-02-30' }, receiver: { masterSku: 'GA0450', requiredByDate: '2026-03-15' } }); }, RangeError, 'RE#G24 invalid donor.requiredByDate → RangeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: { masterSku: 'GA0450', requiredByDate: new Date() } }); }, TypeError, 'RE#G25 non-string receiver.requiredByDate → TypeError');
throwsType(function () { RE({ calculationDate: '2026-01-01', donor: { masterSku: 'GA0450', requiredByDate: '2026-01-20' }, receiver: { masterSku: 'GA0450', requiredByDate: '2026/03/15' } }); }, RangeError, 'RE#G26 invalid receiver.requiredByDate → RangeError');

// ============================================================================
// §34A Missing / Stale Data pure classifier — classifyPlanningDataState (Round 8B)
//   Pure/deterministic input-readiness classifier → { state, calculationAllowed }.
//   Tokens MISSING_SNAPSHOT / STALE_SNAPSHOT are verbatim §34; MISSING_FORECAST /
//   MISSING_SALES_BASIS / OK are the machine representation of §34's prose rows.
//   Precedence: missing snapshot ▸ missing demand basis ▸ stale (STRICT >) ▸ OK.
// ============================================================================
console.log('\n== §34A Missing / Stale Data classifier (classifyPlanningDataState) ==');
var PD = C.classifyPlanningDataState;

// -- 34A.A Valid output paths (16) -------------------------------------------
eq(PD({ snapshotPresent: false, replenishmentModel: 'forecast_driven', forecastPresent: true }),
   { state: 'MISSING_SNAPSHOT', calculationAllowed: false }, 'PD#A1 missing snapshot → MISSING_SNAPSHOT/false');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 10, stalenessThresholdDays: 7, replenishmentModel: 'sales_driven', salesBasisPresent: true }),
   { state: 'STALE_SNAPSHOT', calculationAllowed: true }, 'PD#A2 stale snapshot (10>7) → STALE_SNAPSHOT/true (warn-and-proceed)');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 1, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true }),
   { state: 'OK', calculationAllowed: true }, 'PD#A3 fresh snapshot (1<7) → OK/true');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 7, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true }),
   { state: 'OK', calculationAllowed: true }, 'PD#A4 age === threshold (7===7) → fresh (STRICT >) → OK/true');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 0, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true }),
   { state: 'OK', calculationAllowed: true }, 'PD#A5 forecast-driven + forecast present → OK/true');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 0, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: false }),
   { state: 'MISSING_FORECAST', calculationAllowed: false }, 'PD#A6 forecast-driven + forecast missing → MISSING_FORECAST/false');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 0, stalenessThresholdDays: 7, replenishmentModel: 'sales_driven', salesBasisPresent: true }),
   { state: 'OK', calculationAllowed: true }, 'PD#A7 sales-driven + sales basis present → OK/true');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 0, stalenessThresholdDays: 7, replenishmentModel: 'sales_driven', salesBasisPresent: false }),
   { state: 'MISSING_SALES_BASIS', calculationAllowed: false }, 'PD#A8 sales-driven + sales basis missing → MISSING_SALES_BASIS/false');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 0, stalenessThresholdDays: 7, replenishmentModel: 'sales_driven', salesBasisPresent: true, forecastPresent: false }),
   { state: 'OK', calculationAllowed: true }, 'PD#A9 sales-driven ignores forecastPresent (false ignored) → OK/true');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 0, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true, salesBasisPresent: false }),
   { state: 'OK', calculationAllowed: true }, 'PD#A10 forecast-driven ignores salesBasisPresent (false ignored) → OK/true');
eq(PD({ snapshotPresent: false, replenishmentModel: 'forecast_driven', forecastPresent: false }),
   { state: 'MISSING_SNAPSHOT', calculationAllowed: false }, 'PD#A11 missing snapshot OUTRANKS missing forecast → MISSING_SNAPSHOT');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 10, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: false }),
   { state: 'MISSING_FORECAST', calculationAllowed: false }, 'PD#A12 missing forecast OUTRANKS stale → MISSING_FORECAST');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 10, stalenessThresholdDays: 7, replenishmentModel: 'sales_driven', salesBasisPresent: false }),
   { state: 'MISSING_SALES_BASIS', calculationAllowed: false }, 'PD#A13 missing sales basis OUTRANKS stale → MISSING_SALES_BASIS');
var pdI = { snapshotPresent: true, snapshotAgeDays: 3, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true };
var pdSnap = JSON.stringify(pdI);
var pdO1 = PD(pdI), pdO2 = PD(pdI);
eq(pdO1 !== pdO2, true, 'PD#A14 each call returns a fresh output object');
eq(JSON.stringify(pdI), pdSnap, 'PD#A15 input object is not mutated');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 3, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true, someExtra: 'ignored', another: 42 }),
   { state: 'OK', calculationAllowed: true }, 'PD#A16 unexpected extra properties are ignored (no error, no effect)');

// -- 34A.B TypeError cases (16) ----------------------------------------------
throwsType(function () { PD(undefined); }, TypeError, 'PD#B1 undefined input → TypeError');
throwsType(function () { PD(null); }, TypeError, 'PD#B2 null input → TypeError');
throwsType(function () { PD([{ snapshotPresent: true }]); }, TypeError, 'PD#B3 array input → TypeError');
throwsType(function () { PD('x'); }, TypeError, 'PD#B4 primitive input → TypeError');
throwsType(function () { PD({ replenishmentModel: 'forecast_driven', forecastPresent: true }); }, TypeError, 'PD#B5 missing snapshotPresent → TypeError');
throwsType(function () { PD({ snapshotPresent: 'yes', replenishmentModel: 'forecast_driven', forecastPresent: true }); }, TypeError, 'PD#B6 non-boolean snapshotPresent → TypeError (no coercion)');
throwsType(function () { PD({ snapshotPresent: false }); }, TypeError, 'PD#B7 missing replenishmentModel → TypeError');
throwsType(function () { PD({ snapshotPresent: false, replenishmentModel: 123 }); }, TypeError, 'PD#B8 non-string replenishmentModel → TypeError');
throwsType(function () { PD({ snapshotPresent: true, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true }); }, TypeError, 'PD#B9 snapshotPresent=true + missing snapshotAgeDays → TypeError');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: '3', stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true }); }, TypeError, 'PD#B10 snapshotPresent=true + non-number snapshotAgeDays → TypeError (no coercion)');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: 3, replenishmentModel: 'forecast_driven', forecastPresent: true }); }, TypeError, 'PD#B11 snapshotPresent=true + missing stalenessThresholdDays → TypeError');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: 3, stalenessThresholdDays: '7', replenishmentModel: 'forecast_driven', forecastPresent: true }); }, TypeError, 'PD#B12 snapshotPresent=true + non-number stalenessThresholdDays → TypeError (no coercion)');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: 3, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven' }); }, TypeError, 'PD#B13 forecast-driven + missing forecastPresent → TypeError');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: 3, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: 1 }); }, TypeError, 'PD#B14 forecast-driven + non-boolean forecastPresent → TypeError (no coercion)');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: 3, stalenessThresholdDays: 7, replenishmentModel: 'sales_driven' }); }, TypeError, 'PD#B15 sales-driven + missing salesBasisPresent → TypeError');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: 3, stalenessThresholdDays: 7, replenishmentModel: 'sales_driven', salesBasisPresent: 0 }); }, TypeError, 'PD#B16 sales-driven + non-boolean salesBasisPresent → TypeError (no coercion)');

// -- 34A.C RangeError cases (7) ----------------------------------------------
throwsType(function () { PD({ snapshotPresent: false, replenishmentModel: 'weekly_driven', forecastPresent: true }); }, RangeError, 'PD#C1 unsupported replenishmentModel string → RangeError');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: NaN, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true }); }, RangeError, 'PD#C2 NaN age → RangeError');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: Infinity, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true }); }, RangeError, 'PD#C3 Infinity age → RangeError');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: -1, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true }); }, RangeError, 'PD#C4 negative age → RangeError');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: 3, stalenessThresholdDays: NaN, replenishmentModel: 'forecast_driven', forecastPresent: true }); }, RangeError, 'PD#C5 NaN threshold → RangeError');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: 3, stalenessThresholdDays: Infinity, replenishmentModel: 'forecast_driven', forecastPresent: true }); }, RangeError, 'PD#C6 Infinity threshold → RangeError');
throwsType(function () { PD({ snapshotPresent: true, snapshotAgeDays: 3, stalenessThresholdDays: -5, replenishmentModel: 'forecast_driven', forecastPresent: true }); }, RangeError, 'PD#C7 negative threshold → RangeError');

// -- 34A.D Branch-scoped validation (4) --------------------------------------
eq(PD({ snapshotPresent: false, snapshotAgeDays: NaN, stalenessThresholdDays: -99, replenishmentModel: 'forecast_driven', forecastPresent: true }),
   { state: 'MISSING_SNAPSHOT', calculationAllowed: false }, 'PD#D1 age/threshold IGNORED when snapshotPresent=false (bad values do not throw)');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 2, stalenessThresholdDays: 7, replenishmentModel: 'sales_driven', salesBasisPresent: true, forecastPresent: 'garbage' }),
   { state: 'OK', calculationAllowed: true }, 'PD#D2 forecastPresent IGNORED when sales_driven (garbage value does not throw)');
eq(PD({ snapshotPresent: true, snapshotAgeDays: 2, stalenessThresholdDays: 7, replenishmentModel: 'forecast_driven', forecastPresent: true, salesBasisPresent: 'garbage' }),
   { state: 'OK', calculationAllowed: true }, 'PD#D3 salesBasisPresent IGNORED when forecast_driven (garbage value does not throw)');
eq(PD({ snapshotPresent: false, replenishmentModel: 'sales_driven', salesBasisPresent: false }),
   { state: 'MISSING_SNAPSHOT', calculationAllowed: false }, 'PD#D4 snapshotPresent=false returns MISSING_SNAPSHOT before the demand-basis check');

if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed)\n'); process.exit(1); }
console.log('\nAll supply-planning-calculation assertions passed (' + pass + ' assertions).\n');
