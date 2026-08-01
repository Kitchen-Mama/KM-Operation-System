// B4-R5 — External Incoming Authority Fail-Closed Adapter (adaptExternalIncomingAuthority).
// Unit-tests the real pure module assets/js/core/supply-planning-external-incoming-adapters.js: stable external
// identity, authority-state vocabulary + classification, linkage validation, quarantine/adoption/rejected/ignored/
// superseded/reversed behavior, observed-quantity audit projection, ETA/timestamp preservation, deterministic
// exclusion/review reasons, immutability, and cross-adapter authority separation vs the B4-R4 KM Shipment adapter.
// INVARIANT under test: every external record → planningEligible = false, adapterEligibleQuantity = 0.
// Run: node assets/tests/supply-planning-external-incoming-adapters.test.js

var path = require('path');
var adaptExt = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-external-incoming-adapters.js')).adaptExternalIncomingAuthority;
var buildKm = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-supply-candidates.js')).buildKmShipmentSupplyCandidate;
var adaptKm = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-incoming-adapters.js')).adaptKmShipmentIncomingCandidate;

var fail = 0, pass = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; console.log('ok   ' + l); } }
function throwsType(fn, type, l) { try { fn(); fail++; console.error('FAIL ' + l + ' (no throw)'); } catch (e) { if (e instanceof type) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + ' (wrong type ' + (e && e.constructor && e.constructor.name) + ')'); } } }

function baseExt() {
  return {
    externalCandidateId: 'external_inbound:acme3pl:ACC-1:OP-1:LN-1',
    sourceType: 'EXTERNAL_WMS_INBOUND',
    supplyDomain: 'EXTERNAL_3PL_OVERSEAS',
    authorityState: 'EXTERNAL_UNLINKED_QUARANTINED',
    provider: 'acme3pl',
    externalAccountRef: 'ACC-1',
    externalOperationRef: 'OP-1',
    externalLineRef: 'LN-1',
    company: 'KM', country: 'US', marketplace: 'amazon_us',
    sku: 'SKU-X', siteSku: 'SITE-X',
    destinationWarehouseId: 'WH-A',
    quantityObserved: 120,
    eta: '2026-10-01', sourceUpdatedAt: '2026-08-01T00:00:00Z',
    linkedShipmentId: null, linkedShipmentLineId: null, linkedOperationId: null,
    reviewStatus: null, reconciliationState: null
  };
}
function runExt(mut) { var c = baseExt(); if (mut) mut(c); return adaptExt({ candidate: c }); }
function has(arr, x) { return arr.indexOf(x) >= 0; }

// -------- Module / export --------
eq(typeof adaptExt, 'function', '1 module exports adaptExternalIncomingAuthority');
eq(runExt().adapterType, 'EXTERNAL_INCOMING_AUTHORITY', '2 adapterType fixed');

// -------- Identity --------
eq([runExt().planningEligible, runExt().adapterEligibleQuantity], [false, 0], '3 valid stable identity accepted structurally, still 0');
eq(has(runExt(function (c) { c.externalCandidateId = ''; }).reviewReasons, 'EXTERNAL_IDENTITY_INCOMPLETE'), true, '4 missing externalCandidateId fails closed (review, not throw)');
eq(runExt(function (c) { c.externalCandidateId = ''; }).adapterEligibleQuantity, 0, '4b missing externalCandidateId still 0');
eq(has(runExt(function (c) { c.provider = ''; }).reviewReasons, 'EXTERNAL_IDENTITY_INCOMPLETE'), true, '5 missing provider → identity incomplete review');
eq(has(runExt(function (c) { c.externalAccountRef = ''; }).reviewReasons, 'EXTERNAL_IDENTITY_INCOMPLETE'), true, '6 missing external account ref → review');
eq(has(runExt(function (c) { c.externalOperationRef = ''; }).reviewReasons, 'EXTERNAL_IDENTITY_INCOMPLETE'), true, '7 missing external operation ref → review');
eq(has(runExt(function (c) { c.externalLineRef = ''; }).reviewReasons, 'EXTERNAL_IDENTITY_INCOMPLETE'), true, '8 missing external line ref → review');
// 9/10 no identity inference: even with SKU+ETA (and a quantity) present, an incomplete external identity is NOT
// silently replaced/minted — it stays incomplete and fails closed.
(function () { var r = runExt(function (c) { c.externalCandidateId = ''; c.externalOperationRef = ''; c.externalLineRef = ''; /* sku+eta+qty present */ }); eq([has(r.reviewReasons, 'EXTERNAL_IDENTITY_INCOMPLETE'), r.candidate.externalCandidateId, r.adapterEligibleQuantity], [true, '', 0], '9 no SKU+ETA identity inference (id not minted)'); })();
(function () { var r = runExt(function (c) { c.externalCandidateId = ''; c.quantityObserved = 999; }); eq([has(r.reviewReasons, 'EXTERNAL_IDENTITY_INCOMPLETE'), r.candidate.externalCandidateId], [true, ''], '10 no quantity-based identity inference'); })();

// -------- Linked evidence --------
(function () { var r = runExt(function (c) { c.authorityState = 'LINKED_EXTERNAL_EVIDENCE'; c.linkedShipmentId = 'S1'; }); eq([r.stateClass, r.linkedEvidence, r.adapterEligibleQuantity], ['LINKED_EVIDENCE_ONLY', true, 0], '11 linked evidence with Shipment ID → evidence only, 0'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'LINKED_EXTERNAL_EVIDENCE'; c.linkedOperationId = 'OP-KM-9'; }); eq([r.stateClass, r.adapterEligibleQuantity], ['LINKED_EVIDENCE_ONLY', 0], '12 linked evidence with Operation ID → evidence only, 0'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'LINKED_EXTERNAL_EVIDENCE'; c.linkedShipmentId = 'S1'; }); eq([r.planningEligible, r.adapterEligibleQuantity, has(r.exclusionReasons, 'EXTERNAL_RECORD_NOT_PLANNING_AUTHORITY')], [false, 0, true], '13 linked evidence independently contributes zero'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'LINKED_EXTERNAL_EVIDENCE'; c.linkedShipmentId = 'S1'; }); eq([r.candidate.authorityState, has(r.exclusionReasons, 'LINKED_EXTERNAL_EVIDENCE_ONLY')], ['LINKED_EXTERNAL_EVIDENCE', true], '14 linked evidence does not become KM_CANONICAL (authorityState unchanged)'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'LINKED_EXTERNAL_EVIDENCE'; /* no linkage */ }); eq([has(r.reviewReasons, 'LINKAGE_MISSING'), r.adapterEligibleQuantity], [true, 0], '15 linked evidence with no KM linkage → LINKAGE_MISSING'); })();

// -------- Quarantine --------
eq(runExt().stateClass, 'QUARANTINED_UNLINKED', '16 unlinked quarantined record → QUARANTINED_UNLINKED, 0');
eq(runExt().adapterEligibleQuantity, 0, '16b quarantined contributes zero');
(function () { var r = runExt(function (c) { c.eta = '2026-01-01'; c.sourceUpdatedAt = '2026-08-01T00:00:00Z'; }); eq(r.adapterEligibleQuantity, 0, '17 fresh quarantined record still contributes zero'); })();
(function () { var r = runExt(function (c) { c.eta = '2020-01-01'; c.sourceUpdatedAt = '2020-01-01T00:00:00Z'; }); eq([r.adapterEligibleQuantity, r.quarantined], [0, true], '18 stale-looking quarantined record still contributes zero'); })();
eq(runExt().requiresHumanReview, true, '19 quarantined record requires human review');
(function () { var r = runExt(function (c) { c.linkedShipmentId = 'S1'; }); eq([has(r.reviewReasons, 'QUARANTINE_LINKAGE_CONFLICT'), r.adapterEligibleQuantity], [true, 0], '20 quarantine with linkage conflict flagged'); })();

// -------- Adoption --------
(function () { var r = runExt(function (c) { c.authorityState = 'ADOPTION_PENDING'; }); eq([r.stateClass, r.adapterEligibleQuantity, r.requiresHumanReview], ['ADOPTION_REVIEW_PENDING', 0, true], '21 adoption pending contributes zero'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'ADOPTED_TO_KM'; c.linkedShipmentId = 'S-KM-1'; }); eq(r.adapterEligibleQuantity, 0, '22 adopted-to-KM external row contributes zero'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'ADOPTED_TO_KM'; c.linkedShipmentId = 'S-KM-1'; }); eq([r.stateClass, r.adoptedToKm, has(r.exclusionReasons, 'ADOPTED_USE_KM_CANONICAL_RECORD')], ['ADOPTED_USE_KM_CANONICAL_RECORD', true, true], '23 adopted-to-KM with Shipment linkage points to KM record'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'ADOPTED_TO_KM'; /* no linkage */ }); eq([has(r.reviewReasons, 'ADOPTED_KM_LINK_MISSING'), r.adapterEligibleQuantity], [true, 0], '24 adopted-to-KM missing KM linkage flagged'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'ADOPTED_TO_KM'; c.linkedShipmentId = 'S-KM-1'; }); eq(r.planningEligible, false, '25 adopted row does not itself become planning eligible'); })();

// -------- Other states --------
(function () { var r = runExt(function (c) { c.authorityState = 'REJECTED_EXTERNAL_RECORD'; }); eq([r.stateClass, r.adapterEligibleQuantity, has(r.exclusionReasons, 'REJECTED_EXTERNAL_RECORD')], ['REJECTED', 0, true], '26 rejected contributes zero'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'IGNORED_FOR_PLANNING'; }); eq([r.stateClass, r.adapterEligibleQuantity, has(r.exclusionReasons, 'IGNORED_FOR_PLANNING')], ['IGNORED', 0, true], '27 ignored contributes zero'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'SUPERSEDED'; }); eq([r.stateClass, r.adapterEligibleQuantity, has(r.exclusionReasons, 'SUPERSEDED_EXTERNAL_RECORD')], ['SUPERSEDED', 0, true], '28 superseded contributes zero'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'REVERSED'; }); eq([r.stateClass, r.adapterEligibleQuantity, has(r.exclusionReasons, 'REVERSED_EXTERNAL_RECORD')], ['REVERSED', 0, true], '29 reversed contributes zero'); })();
(function () { var r = runExt(function (c) { c.authorityState = null; }); eq([r.stateClass, has(r.reviewReasons, 'MISSING_AUTHORITY_STATE'), r.adapterEligibleQuantity], ['MISSING_AUTHORITY_STATE', true, 0], '30 missing authority state review'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'SOMETHING_ELSE'; }); eq([r.stateClass, has(r.reviewReasons, 'UNKNOWN_AUTHORITY_STATE'), r.adapterEligibleQuantity], ['UNKNOWN_AUTHORITY_STATE', true, 0], '31 unknown authority state review'); })();

// -------- Source / domain --------
['EXTERNAL_INBOUND_RECORD', 'EXTERNAL_WMS_INBOUND', 'EXTERNAL_OMS_INBOUND'].forEach(function (s, k) {
  eq(has(runExt(function (c) { c.sourceType = s; }).exclusionReasons, 'SOURCE_TYPE_NOT_SUPPORTED'), false, '32.' + (k + 1) + ' supported source ' + s + ' accepted structurally');
});
eq(has(runExt(function (c) { c.sourceType = 'EXTERNAL_RANDOM'; }).exclusionReasons, 'SOURCE_TYPE_NOT_SUPPORTED'), true, '33 unsupported source type fail closed');
eq([has(runExt(function (c) { c.supplyDomain = 'PLATFORM_FBA'; }).exclusionReasons, 'DOMAIN_NOT_SUPPORTED'), runExt(function (c) { c.supplyDomain = 'PLATFORM_FBA'; }).adapterEligibleQuantity], [true, 0], '34 platform/FBA domain fail closed/deferred');
eq(has(runExt(function (c) { c.sourceType = 'EXTERNAL_OUTBOUND_RECORD'; }).exclusionReasons, 'SOURCE_TYPE_NOT_SUPPORTED'), true, '35 outbound source fail closed/deferred');
// KM Shipment candidate must NOT be accepted here (KM_SHIPMENT_LINE / KM_3PL_OVERSEAS fail closed).
eq([has(runExt(function (c) { c.sourceType = 'KM_SHIPMENT_LINE'; c.supplyDomain = 'KM_3PL_OVERSEAS'; }).exclusionReasons, 'SOURCE_TYPE_NOT_SUPPORTED'), has(runExt(function (c) { c.sourceType = 'KM_SHIPMENT_LINE'; c.supplyDomain = 'KM_3PL_OVERSEAS'; }).exclusionReasons, 'DOMAIN_NOT_SUPPORTED')], [true, true], '35b KM Shipment candidate rejected by this external adapter');

// -------- Quantity --------
eq([runExt(function (c) { c.quantityObserved = 120; }).observedQuantity, runExt().adapterEligibleQuantity], [120, 0], '36 valid observed quantity preserved (audit), planning 0');
eq(runExt(function (c) { c.quantityObserved = 0; }).observedQuantity, 0, '37 zero observed quantity preserved');
eq([has(runExt(function (c) { c.quantityObserved = -5; }).reviewReasons, 'INVALID_EXTERNAL_QUANTITY'), runExt(function (c) { c.quantityObserved = -5; }).observedQuantity], [true, 0], '38 negative quantity flagged');
eq(has(runExt(function (c) { c.quantityObserved = NaN; }).reviewReasons, 'INVALID_EXTERNAL_QUANTITY'), true, '39 NaN flagged');
eq(has(runExt(function (c) { c.quantityObserved = Infinity; }).reviewReasons, 'INVALID_EXTERNAL_QUANTITY'), true, '40 Infinity flagged');
(function () { var r = runExt(function (c) { c.quantityObserved = '120'; }); eq([has(r.reviewReasons, 'INVALID_EXTERNAL_QUANTITY'), r.observedQuantity, r.candidate.quantityObserved], [true, 0, '120'], '41 string quantity flagged/not coerced (raw retained)'); })();
['LINKED_EXTERNAL_EVIDENCE', 'EXTERNAL_UNLINKED_QUARANTINED', 'ADOPTION_PENDING', 'ADOPTED_TO_KM', 'REJECTED_EXTERNAL_RECORD', 'IGNORED_FOR_PLANNING', 'SUPERSEDED', 'REVERSED', null, 'WEIRD'].forEach(function (s, k) {
  eq(runExt(function (c) { c.authorityState = s; c.linkedShipmentId = 'S1'; c.quantityObserved = 500; }).adapterEligibleQuantity, 0, '42.' + (k + 1) + ' adapterEligibleQuantity always zero (' + s + ')');
});

// -------- ETA / freshness --------
eq(runExt(function (c) { c.eta = '2026-10-01'; }).candidate.eta, '2026-10-01', '43 ETA preserved without parsing');
eq(runExt(function (c) { c.sourceUpdatedAt = '2026-08-01T00:00:00Z'; }).candidate.sourceUpdatedAt, '2026-08-01T00:00:00Z', '44 sourceUpdatedAt preserved without evaluation');
eq(has(runExt(function (c) { c.eta = ''; }).reviewReasons, 'MISSING_EXTERNAL_ETA'), true, '45 missing ETA may be reviewed');
eq(has(runExt(function (c) { c.sourceUpdatedAt = ''; }).reviewReasons, 'MISSING_EXTERNAL_SOURCE_TIMESTAMP'), true, '46 missing source timestamp may be reviewed');
(function () { var r = runExt(); eq([r.requiredByDate, r.lateRiskQty].every(function (v) { return v === undefined; }), true, '47 no Required-By result'); })();
(function () { var r = runExt(function (c) { c.eta = '2099-01-01'; c.sourceUpdatedAt = '2099-01-01T00:00:00Z'; }); eq([r.candidate.eta instanceof Date, r.adapterEligibleQuantity], [false, 0], '48 no freshness-admission result (ETA not a Date, still 0)'); })();

// -------- Output invariants --------
['LINKED_EXTERNAL_EVIDENCE', 'EXTERNAL_UNLINKED_QUARANTINED', 'ADOPTED_TO_KM'].forEach(function (s, k) {
  eq(runExt(function (c) { c.authorityState = s; c.linkedShipmentId = 'S1'; }).planningEligible, false, '49.' + (k + 1) + ' planningEligible always false (' + s + ')');
});
(function () { var r = runExt(); eq([r.qualifiedIncoming, r.timelyQualifiedIncoming, r.coverageQty, r.lateRiskQty, r.dedupWinner].every(function (v) { return v === undefined; }), true, '50-54 no qualifiedIncoming/timely/coverage/lateRisk/dedup keys'); })();

// -------- Reasons --------
(function () { var r = runExt(function (c) { c.sourceType = 'BAD'; c.supplyDomain = 'BAD'; c.authorityState = 'EXTERNAL_UNLINKED_QUARANTINED'; }); eq(r.exclusionReasons, ['EXTERNAL_RECORD_NOT_PLANNING_AUTHORITY', 'SOURCE_TYPE_NOT_SUPPORTED', 'DOMAIN_NOT_SUPPORTED', 'EXTERNAL_UNLINKED_QUARANTINED'], '55 deterministic exclusion order'); })();
(function () { var r = runExt(function (c) { c.externalCandidateId = ''; c.authorityState = 'ADOPTED_TO_KM'; c.linkedShipmentId = null; c.linkedOperationId = null; c.quantityObserved = -1; c.eta = ''; c.sourceUpdatedAt = ''; }); eq(r.reviewReasons, ['EXTERNAL_IDENTITY_INCOMPLETE', 'ADOPTED_KM_LINK_MISSING', 'INVALID_EXTERNAL_QUANTITY', 'MISSING_EXTERNAL_ETA', 'MISSING_EXTERNAL_SOURCE_TIMESTAMP'], '56 deterministic review order'); })();
(function () { var r = runExt(function (c) { c.authorityState = 'REJECTED_EXTERNAL_RECORD'; }); var e = r.exclusionReasons, seen = {}, dup = false; e.forEach(function (x) { if (seen[x]) dup = true; seen[x] = 1; }); eq(dup, false, '57 no duplicate reasons'); })();

// -------- Validation --------
throwsType(function () { return adaptExt(null); }, TypeError, '58 null input → TypeError');
throwsType(function () { return adaptExt({ candidate: [] }); }, TypeError, '59 array candidate → TypeError');
throwsType(function () { return adaptExt({}); }, TypeError, '60 missing candidate → TypeError');
throwsType(function () { return adaptExt({ candidate: 42 }); }, TypeError, '61 invalid candidate shape → TypeError');
throwsType(function () { var c = baseExt(); c.sku = ''; return adaptExt({ candidate: c }); }, RangeError, '62 blank required SKU → RangeError');
throwsType(function () { var c = baseExt(); c.sku = 7; return adaptExt({ candidate: c }); }, TypeError, '63 non-string SKU (unsupported shape) → TypeError');

// -------- Immutability --------
(function () { var c = baseExt(); var snap = JSON.stringify(c); adaptExt({ candidate: c }); eq(JSON.stringify(c), snap, '64 input candidate not mutated'); })();
(function () { var c = baseExt(); var r = adaptExt({ candidate: c }); eq(r.candidate === c, false, '65 output snapshot fresh (not input ref)'); })();
(function () { var c = baseExt(); var a = adaptExt({ candidate: c }); a.reviewReasons.push('Z'); a.exclusionReasons.push('Z'); var b = adaptExt({ candidate: c }); eq([has(b.reviewReasons, 'Z'), has(b.exclusionReasons, 'Z')], [false, false], '66 reason arrays fresh per call'); })();
(function () { var c = baseExt(); var a = adaptExt({ candidate: c }), b = adaptExt({ candidate: c }); a.candidate.sku = 'MUT'; a.observedQuantity = -9; eq([b.candidate.sku, b.observedQuantity], ['SKU-X', 120], '67 one result cannot affect another'); })();

// ============================================================================
// CROSS-ADAPTER INTEGRATION FIXTURES (§23) — authority separation only; NO dedup, NO summing.
// ============================================================================

// A. LINKED EVIDENCE + KM SHIPMENT — KM adapter may be eligible; external linked evidence contributes 0 separately.
(function () {
  var km = adaptKm({
    candidate: buildKm({ shipment: { shipmentId: 'S1', status: 'in_transit', company: 'KM', country: 'US', marketplace: 'amazon_us', eta: '2026-10-01', destinationWarehouseId: 'WH-A' },
                         line: { shipmentLineId: 'SHL-1', sku: 'SKU-X', shipmentQty: 250 } }),
    scope: { company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A', country: 'US', marketplace: 'amazon_us' }
  });
  var ext = adaptExt({ candidate: (function () { var c = baseExt(); c.authorityState = 'LINKED_EXTERNAL_EVIDENCE'; c.linkedShipmentId = 'S1'; c.quantityObserved = 250; c.destinationWarehouseId = 'WH-A'; return c; })() });
  eq([km.sourceEligible, km.adapterEligibleQuantity, ext.adapterEligibleQuantity, ext.linkedEvidence], [true, 250, 0, true], 'FIX-A linked evidence + KM Shipment: KM 250, external 0, authority separated (no sum)');
})();

// B. UNLINKED EXTERNAL — positive qty, valid ETA, fresh timestamp, no KM linkage → quarantined, 0, review required.
(function () {
  var ext = adaptExt({ candidate: (function () { var c = baseExt(); c.authorityState = 'EXTERNAL_UNLINKED_QUARANTINED'; c.quantityObserved = 300; c.eta = '2026-10-01'; c.sourceUpdatedAt = '2026-08-01T00:00:00Z'; c.linkedShipmentId = null; c.linkedOperationId = null; return c; })() });
  eq([ext.observedQuantity, ext.adapterEligibleQuantity, ext.quarantined, ext.requiresHumanReview, ext.planningEligible], [300, 0, true, true, false], 'FIX-B unlinked external: observed 300 visible, planning 0, quarantined, review required');
})();

// C. ADOPTED EXTERNAL + RESULTING KM SHIPMENT — external row 0; the separate resulting KM Shipment may be eligible.
(function () {
  var ext = adaptExt({ candidate: (function () { var c = baseExt(); c.authorityState = 'ADOPTED_TO_KM'; c.linkedShipmentId = 'S-ADOPT-1'; c.quantityObserved = 180; return c; })() });
  var kmResulting = adaptKm({
    candidate: buildKm({ shipment: { shipmentId: 'S-ADOPT-1', status: 'in_transit', company: 'KM', country: 'US', marketplace: 'amazon_us', eta: '2026-10-01', destinationWarehouseId: 'WH-A' },
                         line: { shipmentLineId: 'SHL-ADOPT-1', sku: 'SKU-X', shipmentQty: 180 } }),
    scope: { company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A', country: 'US', marketplace: 'amazon_us' }
  });
  eq([ext.adapterEligibleQuantity, ext.adoptedToKm, kmResulting.sourceEligible, kmResulting.adapterEligibleQuantity], [0, true, true, 180], 'FIX-C adopted external 0; resulting KM Shipment (S-ADOPT-1) may be eligible 180');
})();

if (fail) { console.error('\n' + fail + ' ASSERTION(S) FAILED'); process.exit(1); }
console.log('\nAll B4-R5 external-incoming-authority assertions passed (' + pass + ' assertions).');
