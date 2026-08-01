// B4-R4 — KM Shipment Incoming Adapter (adaptKmShipmentIncomingCandidate).
// Unit-tests the real pure module assets/js/core/supply-planning-incoming-adapters.js against real B4-R3
// candidates from assets/js/core/supply-planning-supply-candidates.js: canonical status allowlist, scope
// matching, quantity/ETA/destination source-eligibility, deterministic exclusion/review reasons, fail-closed
// authority/source/domain, and immutability. Source-level only — NOT final Qualified Incoming.
// Run: node assets/tests/supply-planning-incoming-adapters.test.js

var path = require('path');
var build = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-supply-candidates.js')).buildKmShipmentSupplyCandidate;
var adapt = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-incoming-adapters.js')).adaptKmShipmentIncomingCandidate;

var fail = 0, pass = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; console.log('ok   ' + l); } }
function throwsType(fn, type, l) { try { fn(); fail++; console.error('FAIL ' + l + ' (no throw)'); } catch (e) { if (e instanceof type) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + ' (wrong type ' + (e && e.constructor && e.constructor.name) + ')'); } } }

function baseCandInput() {
  return { shipment: { shipmentId: 'S1', status: 'in_transit', company: 'KM', country: 'US', marketplace: 'amazon_us', eta: '2026-09-01', destinationWarehouseId: 'WH-A', legacyWarehouseId: 'WH-LEG' },
           line: { shipmentLineId: 'SHL-1', sku: 'SKU-X', shipmentQty: 100 } };
}
function baseScope() { return { company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A', country: 'US', marketplace: 'amazon_us' }; }
function run(candMut, scopeMut) { var ci = baseCandInput(); if (candMut) candMut(ci); var c = build(ci); var sc = baseScope(); if (scopeMut) scopeMut(sc); return adapt({ candidate: c, scope: sc }); }

eq(typeof adapt, 'function', 'module exports adaptKmShipmentIncomingCandidate');

// -------- Eligible statuses --------
['ready_to_ship', 'shipped', 'in_transit', 'arrived'].forEach(function (s, k) {
  var r = run(function (ci) { ci.shipment.status = s; });
  eq([r.statusClass, r.statusEligible, r.sourceEligible], ['ELIGIBLE_INCOMING_STATUS', true, true], (k + 1) + ' status ' + s + ' eligible');
});
eq(run(function (ci) { ci.shipment.status = '  In_Transit '; }).statusClass, 'ELIGIBLE_INCOMING_STATUS', '5 status case/whitespace normalized');

// -------- Excluded statuses --------
eq(run(function (ci) { ci.shipment.status = 'draft'; }).statusClass, 'EXCLUDED_DRAFT', '6 draft excluded');
eq(run(function (ci) { ci.shipment.status = 'received'; }).statusClass, 'EXCLUDED_ALREADY_RECEIVED', '7 received excluded');
eq(run(function (ci) { ci.shipment.status = 'closed'; }).statusClass, 'EXCLUDED_TERMINAL', '8 closed excluded');
eq(run(function (ci) { ci.shipment.status = 'cancelled'; }).statusClass, 'EXCLUDED_CANCELLED', '9 cancelled excluded');
eq(run(function (ci) { ci.shipment.status = 'planned'; }).statusClass, 'EXCLUDED_LEGACY_STATUS', '10 planned excluded legacy');
eq(run(function (ci) { ci.shipment.status = 'completed'; }).statusClass, 'EXCLUDED_LEGACY_STATUS', '11 completed excluded legacy');
eq(run(function (ci) { ci.shipment.status = 'partial_received'; }).statusClass, 'EXCLUDED_LEGACY_STATUS', '12 partial_received excluded legacy');
eq(run(function (ci) { ci.shipment.status = 'stuck'; }).statusClass, 'EXCLUDED_OPERATIONAL_ALERT', '13 stuck excluded operational');
eq(run(function (ci) { ci.shipment.status = 'delivered'; }).statusClass, 'EXCLUDED_EVENT_TOKEN', '14 delivered excluded event token');
(function () { var r = run(function (ci) { ci.shipment.status = ''; }); eq([r.statusClass, r.reviewReasons.indexOf('MISSING_STATUS') >= 0], ['MISSING_STATUS', true], '15 missing status → review'); })();
(function () { var r = run(function (ci) { ci.shipment.status = 'weird_state'; }); eq([r.statusClass, r.sourceEligible, r.reviewReasons.indexOf('UNKNOWN_STATUS') >= 0], ['UNKNOWN_STATUS', false, true], '16 unknown status fails closed + review'); })();
eq(run(function (ci) { ci.shipment.status = 'draft'; }).exclusionReasons.indexOf('STATUS_NOT_ELIGIBLE') >= 0, true, '16b definite-excluded status → STATUS_NOT_ELIGIBLE');

// -------- Scope --------
eq(run().sourceEligible, true, '17 exact required scope match → eligible');
eq(run(null, function (sc) { sc.company = 'ResUS'; }).exclusionReasons.indexOf('COMPANY_SCOPE_MISMATCH') >= 0, true, '18 company mismatch');
eq(run(null, function (sc) { sc.sku = 'SKU-Y'; }).exclusionReasons.indexOf('SKU_SCOPE_MISMATCH') >= 0, true, '19 SKU mismatch');
eq(run(null, function (sc) { sc.destinationWarehouseId = 'WH-Z'; }).exclusionReasons.indexOf('DESTINATION_SCOPE_MISMATCH') >= 0, true, '20 destination mismatch');
eq(run(null, function (sc) { sc.country = 'CA'; }).exclusionReasons.indexOf('COUNTRY_SCOPE_MISMATCH') >= 0, true, '21 optional country mismatch');
eq(run(null, function (sc) { sc.marketplace = 'ebay_us'; }).exclusionReasons.indexOf('MARKETPLACE_SCOPE_MISMATCH') >= 0, true, '22 optional marketplace mismatch');
eq(run(null, function (sc) { delete sc.country; delete sc.marketplace; }).sourceEligible, true, '23 omitted optional scope does not block');
eq(run(function (ci) { ci.shipment.company = ''; }).reviewReasons.indexOf('MISSING_COMPANY') >= 0, true, '24 missing candidate company → review');
eq(run(function (ci) { ci.shipment.destinationWarehouseId = ''; ci.shipment.legacyWarehouseId = ''; }).reviewReasons.indexOf('MISSING_DESTINATION_IDENTITY') >= 0, true, '25 missing destination → review');
eq(run(function (ci) { ci.line.sku = 'sku-x'; }, function (sc) { sc.sku = 'SKU-X'; }).scopeEligible, true, '25b SKU scope match is case-insensitive');

// -------- Quantity (consume candidate.quantityRemaining only) --------
eq(run().quantityEligible, true, '26 positive remaining eligible');
(function () { var r = run(function (ci) { ci.line.shipmentQty = 0; }); eq([r.quantityEligible, r.exclusionReasons.indexOf('ZERO_REMAINING_QUANTITY') >= 0], [false, true], '27 zero remaining excluded'); })();
(function () { var c = build(baseCandInput()); c.quantityRemaining = -5; var r = adapt({ candidate: c, scope: baseScope() }); eq([r.quantityEligible, r.exclusionReasons.indexOf('INVALID_REMAINING_QUANTITY') >= 0], [false, true], '28 negative remaining excluded'); })();
(function () { var c = build(baseCandInput()); c.quantityRemaining = NaN; var r = adapt({ candidate: c, scope: baseScope() }); eq([r.quantityEligible, r.exclusionReasons.indexOf('INVALID_REMAINING_QUANTITY') >= 0], [false, true], '29 NaN remaining excluded'); })();
(function () { var c = build(baseCandInput()); c.quantityRemaining = Infinity; var r = adapt({ candidate: c, scope: baseScope() }); eq(r.quantityEligible, false, '30 Infinity remaining excluded'); })();
(function () { var c = build(baseCandInput()); c.quantityRemaining = '100'; var r = adapt({ candidate: c, scope: baseScope() }); eq([r.quantityEligible, r.exclusionReasons.indexOf('INVALID_REMAINING_QUANTITY') >= 0], [false, true], '31 string remaining excluded (not coerced)'); })();

// -------- ETA presence --------
eq(run().etaPresent, true, '32 ETA present');
(function () { var r = run(function (ci) { ci.shipment.eta = ''; }); eq([r.etaPresent, r.sourceEligible, r.reviewReasons.indexOf('MISSING_ETA') >= 0], [false, false, true], '33 ETA missing → review + blocks eligibility'); })();
eq(run(function (ci) { ci.shipment.eta = '2026-09-01'; }).candidate.status, 'in_transit', '34 ETA not parsed (raw candidate values retained)');
(function () { var r = run(); eq([r.requiredByDate, r.lateRiskQty].every(function (v) { return v === undefined; }), true, '35 no Required-By comparison exists'); })();

// -------- Authority / source / domain (fail closed) --------
eq(run().sourceEligible, true, '36 KM canonical Shipment candidate accepted');
(function () { var c = build(baseCandInput()); c.authorityType = 'EXTERNAL_UNLINKED'; var r = adapt({ candidate: c, scope: baseScope() }); eq([r.sourceEligible, r.exclusionReasons.indexOf('AUTHORITY_NOT_SUPPORTED') >= 0], [false, true], '37 unsupported authority fails closed'); })();
(function () { var c = build(baseCandInput()); c.sourceType = 'EXTERNAL_ROW'; var r = adapt({ candidate: c, scope: baseScope() }); eq([r.sourceEligible, r.exclusionReasons.indexOf('SOURCE_TYPE_NOT_SUPPORTED') >= 0], [false, true], '38 unsupported sourceType fails closed'); })();
(function () { var c = build(baseCandInput()); c.supplyDomain = 'PLATFORM_FBA'; var r = adapt({ candidate: c, scope: baseScope() }); eq([r.sourceEligible, r.exclusionReasons.indexOf('DOMAIN_NOT_SUPPORTED') >= 0], [false, true], '39 unsupported domain fails closed'); })();

// -------- Output --------
eq(run().adapterType, 'KM_SHIPMENT_INCOMING', '40 adapterType fixed');
eq(run(function (ci) { ci.shipment.status = 'draft'; }).sourceEligible, false, '41 sourceEligible false when a gate fails');
eq(run().adapterEligibleQuantity, 100, '42 adapterEligibleQuantity positive only when sourceEligible');
eq(run(function (ci) { ci.shipment.status = 'draft'; }).adapterEligibleQuantity, 0, '43 adapterEligibleQuantity zero on exclusion');
(function () { var r = run(); eq([r.qualifiedIncoming, r.timelyQualifiedIncoming, r.lateRiskQty, r.requiredByDate, r.coverageQty].every(function (v) { return v === undefined; }), true, '44-47 no qualifiedIncoming/timelyQualifiedIncoming/lateRiskQty/requiredByDate keys'); })();

// -------- Reasons --------
eq(run(function (ci) { ci.shipment.status = 'draft'; ci.line.shipmentQty = 0; }, function (sc) { sc.sku = 'SKU-Y'; }).exclusionReasons,
   ['STATUS_NOT_ELIGIBLE', 'SKU_SCOPE_MISMATCH', 'ZERO_REMAINING_QUANTITY'], '48 deterministic exclusion order');
eq(run(function (ci) { ci.shipment.status = ''; ci.shipment.company = ''; ci.shipment.eta = ''; }).reviewReasons,
   ['MISSING_STATUS', 'MISSING_COMPANY', 'MISSING_ETA'], '49 deterministic review order');
(function () { var f = run(function (ci) { ci.shipment.status = 'draft'; }).exclusionReasons; var seen = {}, dup = false; f.forEach(function (x) { if (seen[x]) dup = true; seen[x] = 1; }); eq(dup, false, '50 no duplicate reasons'); })();

// -------- Validation --------
throwsType(function () { return adapt(null); }, TypeError, 'V1 null input → TypeError');
throwsType(function () { return adapt({ candidate: [], scope: baseScope() }); }, TypeError, 'V2 array candidate → TypeError');
throwsType(function () { return adapt({ candidate: build(baseCandInput()) }); }, TypeError, 'V3 missing scope → TypeError');
throwsType(function () { var c = build(baseCandInput()); c.supplyCandidateId = ''; return adapt({ candidate: c, scope: baseScope() }); }, RangeError, 'V4 blank supplyCandidateId → RangeError');
throwsType(function () { return adapt({ candidate: build(baseCandInput()), scope: { company: '', sku: 'X', destinationWarehouseId: 'W' } }); }, RangeError, 'V5 blank scope company → RangeError');
throwsType(function () { return adapt({ candidate: build(baseCandInput()), scope: { company: 'KM', sku: 'X', destinationWarehouseId: 5 } }); }, TypeError, 'V6 non-string scope destination → TypeError');

// -------- Immutability --------
(function () { var c = build(baseCandInput()); var snap = JSON.stringify(c); adapt({ candidate: c, scope: baseScope() }); eq(JSON.stringify(c), snap, '51 candidate not mutated'); })();
(function () { var sc = baseScope(); var snap = JSON.stringify(sc); adapt({ candidate: build(baseCandInput()), scope: sc }); eq(JSON.stringify(sc), snap, '52 scope not mutated'); })();
(function () { var c = build(baseCandInput()); var a = adapt({ candidate: c, scope: baseScope() }), b = adapt({ candidate: c, scope: baseScope() }); a.exclusionReasons.push('X'); a.adapterEligibleQuantity = -1; a.candidate.sku = 'MUT'; eq([b.exclusionReasons.length, b.adapterEligibleQuantity, b.candidate.sku], [0, 100, 'SKU-X'], '53 output fresh per call'); })();
(function () { var c = build(baseCandInput()); var a = adapt({ candidate: c, scope: baseScope() }); a.reviewReasons.push('Y'); var b = adapt({ candidate: c, scope: baseScope() }); eq(b.reviewReasons.indexOf('Y'), -1, '54 reason arrays fresh per call'); })();

// -------- Regression (B4-R3 contracts consumed, not recomputed) --------
eq(run().candidate.supplyCandidateId, 'shipment:S1:SHL-1', '55 B4-R3 deterministic identity retained');
(function () { var c = build(baseCandInput()); c.quantityRemaining = 77; c.destinationWarehouseId = 'WH-CONSUMED'; var r = adapt({ candidate: c, scope: (function () { var s = baseScope(); s.destinationWarehouseId = 'WH-CONSUMED'; return s; })() }); eq([r.adapterEligibleQuantity, r.candidate.destinationWarehouseId], [77, 'WH-CONSUMED'], '56 B4-R3 quantity/destination consumed, not recomputed'); })();
eq(run(function (ci) { ci.shipment.status = '  Ready_To_Ship  '; }).candidate.status, 'Ready_To_Ship', '57 raw candidate status retained unchanged');

// -------- Integration fixture: raw rows → build → adapt (eligible) --------
(function () {
  var shH = ['shipment_id', 'status', 'company', 'country', 'marketplace', 'eta', 'destination_warehouse_id', 'warehouse_id'];
  var shR = ['S9', 'in_transit', 'KM', 'US', 'amazon_us', '2026-10-01', 'WH-9', 'WH-OLD'];
  var lnH = ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty', 'qty'];
  var lnR = ['SHL-9', 'S9', 'SKU-Z', 250, 999];
  function pick(h, r, n) { var i = h.indexOf(n); return i === -1 ? undefined : r[i]; }
  var c = build({ shipment: { shipmentId: pick(shH, shR, 'shipment_id'), status: pick(shH, shR, 'status'), company: pick(shH, shR, 'company'), country: pick(shH, shR, 'country'), marketplace: pick(shH, shR, 'marketplace'), eta: pick(shH, shR, 'eta'), destinationWarehouseId: pick(shH, shR, 'destination_warehouse_id'), legacyWarehouseId: pick(shH, shR, 'warehouse_id') },
                  line: { shipmentLineId: pick(lnH, lnR, 'shipment_line_id'), sku: pick(lnH, lnR, 'sku'), shipmentQty: pick(lnH, lnR, 'shipment_qty'), legacyQty: pick(lnH, lnR, 'qty') } });
  var r = adapt({ candidate: c, scope: { company: 'KM', sku: 'SKU-Z', destinationWarehouseId: 'WH-9', country: 'US', marketplace: 'amazon_us' } });
  eq([r.sourceEligible, r.adapterEligibleQuantity, r.adapterEligibleQuantity === c.quantityRemaining, r.qualifiedIncoming], [true, 250, true, undefined], 'INT eligible fixture: sourceEligible, adapterEligibleQuantity == quantityRemaining, no Qualified Incoming');
})();

// -------- Draft fixture (Golden #12 executable foundation; NOT promoted) --------
(function () {
  var c = build({ shipment: { shipmentId: 'S12', status: 'draft', company: 'KM', country: 'US', marketplace: 'amazon_us', eta: '2026-10-01', destinationWarehouseId: 'WH-12' }, line: { shipmentLineId: 'SHL-12', sku: 'SKU-D', shipmentQty: 100 } });
  var r = adapt({ candidate: c, scope: { company: 'KM', sku: 'SKU-D', destinationWarehouseId: 'WH-12' } });
  eq([r.sourceEligible, r.adapterEligibleQuantity, r.statusClass], [false, 0, 'EXCLUDED_DRAFT'], 'DRAFT fixture: draft → not eligible, 0, EXCLUDED_DRAFT (Golden #12 foundation, not promoted)');
})();

if (fail) { console.error('\n' + fail + ' ASSERTION(S) FAILED'); process.exit(1); }
console.log('\nAll B4-R4 incoming-adapter assertions passed (' + pass + ' assertions).');
