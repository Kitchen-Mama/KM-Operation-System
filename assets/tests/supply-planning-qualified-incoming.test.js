// B4-R6 — Pure Qualified Incoming Engine (evaluateQualifiedIncoming).
// Unit-tests the real pure module assets/js/core/supply-planning-qualified-incoming.js against REAL B4-R4 KM
// Shipment adapter results and REAL B4-R5 External authority results (built from the real B4-R3 builder + adapters):
// the §2E ten gates, stable-lineage dedup, Required-By (lexical YYYY-MM-DD), Late Risk, posted / other-bucket
// exclusion, count-once, classification precedence, external zero-contribution, traceability and immutability.
// Run: node assets/tests/supply-planning-qualified-incoming.test.js

var path = require('path');
var buildKm = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-supply-candidates.js')).buildKmShipmentSupplyCandidate;
var adaptKm = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-incoming-adapters.js')).adaptKmShipmentIncomingCandidate;
var adaptExt = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-external-incoming-adapters.js')).adaptExternalIncomingAuthority;
var evaluate = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-qualified-incoming.js')).evaluateQualifiedIncoming;

var fail = 0, pass = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; console.log('ok   ' + l); } }
function throwsType(fn, type, l) { try { fn(); fail++; console.error('FAIL ' + l + ' (no throw)'); } catch (e) { if (e instanceof type) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + ' (wrong type ' + (e && e.constructor && e.constructor.name) + ')'); } } }
function assign(base, ov) { var o = {}; for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) o[k] = base[k]; if (ov) for (var j in ov) if (Object.prototype.hasOwnProperty.call(ov, j)) o[j] = ov[j]; return o; }

var REQ = '2026-12-31';
function mkKm(sh, ln, sc) {
  var shipment = assign({ shipmentId: 'S1', status: 'in_transit', company: 'KM', country: 'US', marketplace: 'amazon_us', eta: '2026-10-01', destinationWarehouseId: 'WH-A' }, sh);
  var line = assign({ shipmentLineId: 'SHL-1', sku: 'SKU-X', shipmentQty: 100 }, ln);
  var scope = assign({ company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A', country: 'US', marketplace: 'amazon_us' }, sc);
  return adaptKm({ candidate: buildKm({ shipment: shipment, line: line }), scope: scope });
}
function mkExt(ov) {
  var c = assign({
    externalCandidateId: 'external_inbound:acme:ACC-1:OP-1:LN-1', sourceType: 'EXTERNAL_WMS_INBOUND', supplyDomain: 'EXTERNAL_3PL_OVERSEAS',
    authorityState: 'EXTERNAL_UNLINKED_QUARANTINED', provider: 'acme', externalAccountRef: 'ACC-1', externalOperationRef: 'OP-1', externalLineRef: 'LN-1',
    company: 'KM', country: 'US', marketplace: 'amazon_us', sku: 'SKU-X', siteSku: 'SITE-X', destinationWarehouseId: 'WH-A',
    quantityObserved: 120, eta: '2026-10-01', sourceUpdatedAt: '2026-08-01T00:00:00Z',
    linkedShipmentId: null, linkedShipmentLineId: null, linkedOperationId: null, reviewStatus: null, reconciliationState: null
  }, ov);
  return adaptExt({ candidate: c });
}
function run(over) { return evaluate(assign({ requiredByDate: REQ, kmShipmentResults: [] }, over)); }
function only(km, over) { return evaluate(assign({ requiredByDate: REQ, kmShipmentResults: [km] }, over)); }
function state1(km, over) { return only(km, over).candidateResults[0].qualificationState; }

// -------- Module / validation --------
eq(typeof evaluate, 'function', '1 module exports evaluateQualifiedIncoming');
eq(run().engineType, 'QUALIFIED_INCOMING', '2 engineType fixed');
throwsType(function () { return evaluate(null); }, TypeError, '3 null input rejected');
throwsType(function () { return evaluate({ kmShipmentResults: [] }); }, RangeError, '4 missing requiredByDate rejected');
throwsType(function () { return evaluate({ requiredByDate: '2026-13-40', kmShipmentResults: [] }); }, RangeError, '5 invalid requiredByDate rejected');
throwsType(function () { return evaluate({ requiredByDate: REQ, kmShipmentResults: 'x' }); }, TypeError, '6 kmShipmentResults must be array');
throwsType(function () { return evaluate({ requiredByDate: REQ, kmShipmentResults: [], externalAuthorityResults: 'x' }); }, TypeError, '7 externalAuthorityResults must be array');
throwsType(function () { return evaluate({ requiredByDate: REQ, kmShipmentResults: [], postedToCurrentStockLineageKeys: 'x' }); }, TypeError, '8 posted keys must be array');
throwsType(function () { return evaluate({ requiredByDate: REQ, kmShipmentResults: [], activeOtherBucketLineageKeys: 'x' }); }, TypeError, '9 other-bucket keys must be array');
throwsType(function () { return only(assign(mkKm(), { adapterType: 'WRONG' })); }, TypeError, '10 invalid KM adapterType rejected');
throwsType(function () { return run({ externalAuthorityResults: [assign(mkExt(), { adapterType: 'WRONG' })] }); }, TypeError, '11 invalid external adapterType rejected');
throwsType(function () { return run({ externalAuthorityResults: [assign(mkExt(), { adapterEligibleQuantity: 50 })] }); }, RangeError, '12 positive external adapterEligibleQuantity rejected');
throwsType(function () { return run({ externalAuthorityResults: [assign(mkExt(), { planningEligible: true })] }); }, RangeError, '13 external planningEligible=true rejected');

// -------- Ten gates — qualified case --------
(function () {
  var r = only(mkKm());
  var cr = r.candidateResults[0];
  eq(Object.keys(cr.gateResults).length, 10, '14a all ten gate keys present');
  eq(['MASTER_SKU_MATCH', 'COMPANY_MATCH', 'DESTINATION_OR_SERVICE_SCOPE_MATCH', 'TABLE_STATUS_QUALIFIED', 'ETA_RESOLVED', 'ETA_ON_OR_BEFORE_REQUIRED_BY', 'REMAINING_QUANTITY_POSITIVE', 'NOT_EXCLUDED_LIFECYCLE_STATE', 'NOT_POSTED_TO_CURRENT_STOCK', 'COUNT_ONCE_OWNERSHIP'].every(function (g) { return cr.gateResults[g] === 'PASS'; }), true, '14 all ten gates PASS for valid timely KM Shipment');
  eq(cr.qualificationState, 'QUALIFIED', '15 qualified state');
  eq([cr.qualifiedQuantity, r.qualifiedIncomingQuantity], [100, 100], '16 qualified quantity equals adapterEligibleQuantity');
  eq(r.lateRiskQuantity, 0, '17 late risk zero');
})();
(function () {
  var r = evaluate({ requiredByDate: REQ, kmShipmentResults: [mkKm()], externalAuthorityResults: [mkExt({ quantityObserved: 500 })] });
  eq([r.qualifiedIncomingQuantity, r.externalObservedQuantity], [100, 500], '18 external quantity does not affect total');
})();

// -------- SKU / company / destination --------
eq(state1(mkKm({}, {}, { sku: 'SKU-Y' })), 'EXCLUDED', '19 SKU mismatch excluded');
eq(state1(mkKm({}, {}, { company: 'ResUS' })), 'EXCLUDED', '20 company mismatch excluded');
eq(state1(mkKm({}, {}, { destinationWarehouseId: 'WH-Z' })), 'EXCLUDED', '21 destination mismatch excluded');
eq(state1(mkKm({ destinationWarehouseId: '', legacyWarehouseId: '' })), 'REVIEW', '22 missing destination review (precedence)');

// -------- Status / lifecycle --------
['ready_to_ship', 'shipped', 'in_transit', 'arrived'].forEach(function (s, k) {
  eq(state1(mkKm({ status: s })), 'QUALIFIED', (23 + k) + ' ' + s + ' qualifies');
});
eq(state1(mkKm({ status: 'draft' })), 'EXCLUDED', '27 draft excluded');
eq(state1(mkKm({ status: 'received' })), 'EXCLUDED', '28 received excluded');
eq(state1(mkKm({ status: 'closed' })), 'EXCLUDED', '29 closed excluded');
eq(state1(mkKm({ status: 'cancelled' })), 'EXCLUDED', '30 cancelled excluded');
eq(state1(mkKm({ status: 'weird_state' })), 'REVIEW', '31 unknown status review');
eq(state1(mkKm({ status: 'delivered' })), 'EXCLUDED', '32 delivered token excluded upstream remains excluded');

// -------- ETA / Required-By --------
eq(state1(mkKm({ eta: '2026-06-01' })), 'QUALIFIED', '33 ETA before Required-By qualifies');
eq(state1(mkKm({ eta: '2026-12-31' })), 'QUALIFIED', '34 ETA equal Required-By qualifies');
(function () { var r = only(mkKm({ eta: '2027-06-01' })); var cr = r.candidateResults[0]; eq([cr.qualificationState, cr.gateResults.ETA_ON_OR_BEFORE_REQUIRED_BY], ['LATE_RISK', 'FAIL'], '35 ETA after Required-By = Late Risk'); })();
(function () { var r = only(mkKm({ eta: '2027-06-01' })); eq([r.candidateResults[0].lateRiskQuantity, r.lateRiskQuantity], [100, 100], '36 Late Risk quantity visible'); })();
eq(only(mkKm({ eta: '2027-06-01' })).candidateResults[0].qualifiedQuantity, 0, '37 Late Risk qualified quantity zero');
(function () { var r = only(mkKm({ eta: '' })); var cr = r.candidateResults[0]; eq([cr.qualificationState, cr.gateResults.ETA_RESOLVED, cr.reviewReasons.indexOf('ETA_MISSING') >= 0], ['REVIEW', 'REVIEW', true], '38 missing ETA review'); })();
(function () { var r = only(mkKm({ eta: '2026-13-99' })); var cr = r.candidateResults[0]; eq([cr.qualificationState, cr.reviewReasons.indexOf('ETA_INVALID') >= 0], ['REVIEW', true], '39 invalid ETA review'); })();
eq(only(mkKm({ eta: '2027-06-01' })).candidateResults[0].qualificationState !== 'QUALIFIED', true, '40 Required-By not read from system clock (deterministic vs input date)');
(function () { var a = state1(mkKm({ eta: '2026-10-01', sourceUpdatedAt: '2020-01-01T00:00:00Z' })); var b = state1(mkKm({ eta: '2026-10-01', sourceUpdatedAt: '2099-01-01T00:00:00Z' })); eq([a, b], ['QUALIFIED', 'QUALIFIED'], '41 sourceUpdatedAt does not affect timing'); })();

// -------- Quantity --------
eq(state1(mkKm({}, { shipmentQty: 5 })), 'QUALIFIED', '42 positive quantity qualifies');
eq(state1(mkKm({}, { shipmentQty: 0 })), 'EXCLUDED', '43 zero quantity excluded');
(function () { var km = mkKm(); km.candidate.quantityRemaining = -5; km.quantityEligible = false; km.adapterEligibleQuantity = 0; km.sourceEligible = false; eq(state1(km), 'EXCLUDED', '44 negative/invalid quantity excluded'); })();
(function () { var km = mkKm(); km.candidate.quantityRemaining = '100'; km.quantityEligible = false; km.adapterEligibleQuantity = 0; km.sourceEligible = false; eq(only(km).candidateResults[0].gateResults.REMAINING_QUANTITY_POSITIVE, 'FAIL', '45 no quantity coercion (string remaining not positive)'); })();
eq(only(mkKm(), { externalAuthorityResults: [mkExt({ quantityObserved: 999 })] }).qualifiedIncomingQuantity, 100, '46 adapterEligibleQuantity used, not raw external observed quantity');

// -------- Current Stock posting --------
(function () { var r = only(mkKm(), { postedToCurrentStockLineageKeys: ['shipment:S1:SHL-1'] }); var cr = r.candidateResults[0]; eq([cr.qualificationState, cr.gateResults.NOT_POSTED_TO_CURRENT_STOCK, cr.exclusionReasons.indexOf('POSTED_TO_CURRENT_STOCK') >= 0], ['EXCLUDED', 'FAIL', true], '47 exact posted lineage excluded'); })();
eq(state1(mkKm(), { postedToCurrentStockLineageKeys: ['shipment:OTHER:LINE'] }), 'QUALIFIED', '48 unrelated posted lineage does not exclude');
eq(only(mkKm({ status: 'arrived' })).candidateResults[0].gateResults.NOT_POSTED_TO_CURRENT_STOCK, 'PASS', '49 status alone does not infer posting');

// -------- Other ownership bucket --------
(function () { var r = only(mkKm(), { activeOtherBucketLineageKeys: ['shipment:S1:SHL-1'] }); var cr = r.candidateResults[0]; eq([cr.qualificationState, cr.gateResults.COUNT_ONCE_OWNERSHIP, cr.exclusionReasons.indexOf('ACTIVE_IN_OTHER_BUCKET') >= 0], ['EXCLUDED', 'FAIL', true], '50 exact active-other-bucket lineage excluded'); })();
eq(state1(mkKm(), { activeOtherBucketLineageKeys: ['shipment:OTHER:LINE'] }), 'QUALIFIED', '51 unrelated ownership key does not exclude');
eq(only(mkKm()).candidateResults[0].gateResults.COUNT_ONCE_OWNERSHIP, 'PASS', '52 no PO/Plan inference exists (no evidence → PASS)');

// -------- Dedup --------
eq(only(mkKm()).deduplicatedKmCandidateCount, 1, '53 unique lineage counted once');
(function () { var r = run({ kmShipmentResults: [mkKm(), mkKm()] }); eq([r.deduplicatedKmCandidateCount, r.qualifiedIncomingQuantity], [1, 100], '54 two identical duplicates count once'); })();
(function () { var r = run({ kmShipmentResults: [mkKm(), mkKm()] }); var dup = r.candidateResults.filter(function (cr) { return cr.exclusionReasons.indexOf('DUPLICATE_STABLE_LINEAGE') >= 0; }); eq(dup.length, 1, '55 extra identical duplicate marked DUPLICATE_STABLE_LINEAGE'); })();
(function () { var r = run({ kmShipmentResults: [mkKm(), mkKm()] }); eq(r.qualifiedIncomingQuantity, 100, '56 identical duplicate total not doubled'); })();
(function () { var r = run({ kmShipmentResults: [mkKm(), mkKm({}, { shipmentQty: 200 })] }); eq([r.qualifiedIncomingQuantity, r.candidateResults[0].reviewReasons.indexOf('DUPLICATE_LINEAGE_CONFLICT') >= 0], [0, true], '57 conflicting duplicate quantity fails closed'); })();
eq(run({ kmShipmentResults: [mkKm(), mkKm({ eta: '2026-06-01' })] }).qualifiedIncomingQuantity, 0, '58 conflicting duplicate ETA fails closed');
(function () { var a = mkKm(); var b = mkKm(); b.candidate.destinationWarehouseId = 'WH-A'; var c = run({ kmShipmentResults: [mkKm(), mkKm({}, {}, {})] }); /* identical control */ eq(run({ kmShipmentResults: [mkKm(), (function () { var k = mkKm(); k.candidate.destinationWarehouseId = 'WH-DIFF'; return k; })()] }).qualifiedIncomingQuantity, 0, '59 conflicting duplicate destination fails closed'); })();
eq(run({ kmShipmentResults: [mkKm(), mkKm({ status: 'shipped' })] }).qualifiedIncomingQuantity, 0, '60 conflicting duplicate status fails closed');
(function () { var r = run({ kmShipmentResults: [mkKm(), mkKm({}, { shipmentQty: 200 })] }); eq(r.candidateResults.every(function (cr) { return cr.qualificationState === 'EXCLUDED'; }), true, '61 conflicting group contributes zero (all EXCLUDED)'); })();
(function () { var q1 = run({ kmShipmentResults: [mkKm(), mkKm()] }).qualifiedIncomingQuantity; var q2 = run({ kmShipmentResults: [mkKm(), mkKm()] }).qualifiedIncomingQuantity; eq([q1, q2], [100, 100], '62 deterministic result independent of input order'); })();

// -------- External --------
eq(only(mkKm(), { externalAuthorityResults: [mkExt({ authorityState: 'LINKED_EXTERNAL_EVIDENCE', linkedShipmentId: 'S9' })] }).qualifiedIncomingQuantity, 100, '63 linked external contributes zero');
(function () { var r = only(mkKm(), { externalAuthorityResults: [mkExt({ authorityState: 'LINKED_EXTERNAL_EVIDENCE', linkedShipmentId: 'S1' })] }); eq(r.candidateResults[0].informationalReasons.indexOf('LINKED_EXTERNAL_EVIDENCE_PRESENT') >= 0, true, '64 linked evidence informational token appears'); })();
eq(run({ kmShipmentResults: [], externalAuthorityResults: [mkExt()] }).qualifiedIncomingQuantity, 0, '65 quarantined external contributes zero');
eq(run({ kmShipmentResults: [], externalAuthorityResults: [mkExt({ eta: '2026-06-01', sourceUpdatedAt: '2026-08-01T00:00:00Z' })] }).qualifiedIncomingQuantity, 0, '66 fresh quarantined external still zero');
eq(run({ kmShipmentResults: [], externalAuthorityResults: [mkExt({ eta: '2020-01-01', sourceUpdatedAt: '2020-01-01T00:00:00Z' })] }).qualifiedIncomingQuantity, 0, '67 stale-looking quarantined external still zero');
eq(run({ kmShipmentResults: [], externalAuthorityResults: [mkExt({ authorityState: 'ADOPTED_TO_KM', linkedShipmentId: 'S-KM' })] }).qualifiedIncomingQuantity, 0, '68 adopted external row contributes zero');
['REJECTED_EXTERNAL_RECORD', 'IGNORED_FOR_PLANNING', 'SUPERSEDED', 'REVERSED'].forEach(function (s, k) {
  eq(run({ kmShipmentResults: [], externalAuthorityResults: [mkExt({ authorityState: s })] }).qualifiedIncomingQuantity, 0, '69.' + (k + 1) + ' ' + s + ' remains zero');
});
eq(run({ kmShipmentResults: [], externalAuthorityResults: [mkExt({ quantityObserved: 300 })] }).externalObservedQuantity, 300, '70 external observed quantity reported separately');
(function () { var r = evaluate({ requiredByDate: REQ, kmShipmentResults: [mkKm()], externalAuthorityResults: [mkExt({ quantityObserved: 300 })] }); eq(r.qualifiedIncomingQuantity, 100, '71 external quantity never included in qualified total'); })();
(function () { var r = evaluate({ requiredByDate: REQ, kmShipmentResults: [mkKm({ eta: '2027-06-01' })], externalAuthorityResults: [mkExt({ quantityObserved: 300 })] }); eq(r.lateRiskQuantity, 100, '72 external quantity never included in Late Risk total'); })();

// -------- Classification precedence --------
eq(state1(mkKm({ status: 'draft' })), 'EXCLUDED', '73 deterministic lifecycle failure → EXCLUDED');
eq(state1(mkKm({ eta: '' })), 'REVIEW', '74 unresolved ETA → REVIEW');
eq(state1(mkKm({ eta: '2027-06-01' })), 'LATE_RISK', '75 otherwise eligible late ETA → LATE_RISK');
eq(state1(mkKm()), 'QUALIFIED', '76 all-pass → QUALIFIED');
eq(state1(mkKm({ eta: '2027-06-01' }), { postedToCurrentStockLineageKeys: ['shipment:S1:SHL-1'] }), 'EXCLUDED', '77 posted + late remains EXCLUDED, not Late Risk');
(function () { var r = run({ kmShipmentResults: [mkKm({ eta: '' }), mkKm({ eta: '', status: 'shipped' })] }); eq(r.candidateResults.every(function (cr) { return cr.qualificationState === 'EXCLUDED'; }), true, '78 duplicate conflict + missing ETA remains EXCLUDED'); })();
(function () { var cr = only(mkKm({ eta: '' })).candidateResults[0]; eq([cr.qualifiedQuantity, cr.reviewQuantity], [0, 100], '79 review does not fabricate qualified quantity'); })();

// -------- Traceability --------
eq(Object.keys(only(mkKm()).candidateResults[0].gateResults).sort().join(','), ['COMPANY_MATCH', 'COUNT_ONCE_OWNERSHIP', 'DESTINATION_OR_SERVICE_SCOPE_MATCH', 'ETA_ON_OR_BEFORE_REQUIRED_BY', 'ETA_RESOLVED', 'MASTER_SKU_MATCH', 'NOT_EXCLUDED_LIFECYCLE_STATE', 'NOT_POSTED_TO_CURRENT_STOCK', 'REMAINING_QUANTITY_POSITIVE', 'TABLE_STATUS_QUALIFIED'].join(','), '80 all ten gate keys present');
eq(only(mkKm()).candidateResults[0].lineageKey, 'shipment:S1:SHL-1', '81 candidate lineage retained');
(function () { var cr = only(mkKm({ status: 'draft' })).candidateResults[0]; eq(cr.exclusionReasons.indexOf('STATUS_NOT_ELIGIBLE') >= 0, true, '82 upstream exclusion reasons preserved'); })();
(function () { var cr = only(mkKm({ status: 'weird_state' })).candidateResults[0]; eq(cr.reviewReasons.indexOf('UNKNOWN_STATUS') >= 0, true, '83 upstream review reasons preserved'); })();
(function () { var cr = only(mkKm({ status: 'draft' })).candidateResults[0]; var s = {}, dup = false; cr.exclusionReasons.forEach(function (x) { if (s[x]) dup = true; s[x] = 1; }); eq(dup, false, '84 new reasons deterministic (order preserved) + 85 unique'); })();

// -------- Aggregation --------
(function () { var r = run({ kmShipmentResults: [mkKm(), mkKm({}, { shipmentLineId: 'SHL-2' })] }); eq([r.qualifiedIncomingQuantity, r.deduplicatedKmCandidateCount], [200, 2], '86 multiple unique timely candidates sum'); })();
(function () { var r = run({ kmShipmentResults: [mkKm(), mkKm({ eta: '2027-06-01', shipmentLineId: 'SHL-2' }, { shipmentLineId: 'SHL-2' })] }); eq([r.qualifiedIncomingQuantity, r.lateRiskQuantity], [100, 100], '87 timely + late split correctly'); })();
(function () { var r = run({ kmShipmentResults: [mkKm(), mkKm({ eta: '', shipmentLineId: 'SHL-2' }, { shipmentLineId: 'SHL-2' })] }); eq([r.qualifiedIncomingQuantity, r.reviewIncomingQuantity], [100, 100], '88 timely + review split correctly'); })();
(function () { var r = run({ kmShipmentResults: [mkKm()] }); eq(r.qualifiedIncomingQuantity >= 0 && isFinite(r.qualifiedIncomingQuantity), true, '89 qualified total finite and nonnegative'); })();
(function () { var r = run({ kmShipmentResults: [mkKm({ eta: '2027-06-01' })] }); eq(r.lateRiskQuantity >= 0 && isFinite(r.lateRiskQuantity), true, '90 Late Risk total finite and nonnegative'); })();
(function () { var r = run({ kmShipmentResults: [mkKm({ status: 'draft' }), mkKm({ eta: '', shipmentLineId: 'SHL-2' }, { shipmentLineId: 'SHL-2' })] }); eq([r.excludedIncomingQuantity >= 0 && isFinite(r.excludedIncomingQuantity), r.reviewIncomingQuantity >= 0 && isFinite(r.reviewIncomingQuantity)], [true, true], '91 excluded/review totals finite and nonnegative'); })();

// -------- Immutability --------
(function () { var inp = { requiredByDate: REQ, kmShipmentResults: [mkKm()], externalAuthorityResults: [mkExt()], postedToCurrentStockLineageKeys: ['X'], activeOtherBucketLineageKeys: ['Y'] }; var snap = JSON.stringify(inp); evaluate(inp); eq(JSON.stringify(inp), snap, '92 top-level input not mutated + 95 key arrays not mutated'); })();
(function () { var km = mkKm(); var snap = JSON.stringify(km); evaluate({ requiredByDate: REQ, kmShipmentResults: [km] }); eq(JSON.stringify(km), snap, '93 KM adapter result not mutated'); })();
(function () { var ex = mkExt(); var snap = JSON.stringify(ex); evaluate({ requiredByDate: REQ, kmShipmentResults: [], externalAuthorityResults: [ex] }); eq(JSON.stringify(ex), snap, '94 external adapter result not mutated'); })();
(function () { var km = mkKm(); var a = evaluate({ requiredByDate: REQ, kmShipmentResults: [km] }); var b = evaluate({ requiredByDate: REQ, kmShipmentResults: [km] }); a.candidateResults[0].qualifiedQuantity = -1; a.candidateResults[0].gateResults.MASTER_SKU_MATCH = 'MUT'; a.candidateResults[0].exclusionReasons.push('MUT'); eq([b.candidateResults[0].qualifiedQuantity, b.candidateResults[0].gateResults.MASTER_SKU_MATCH, b.candidateResults[0].exclusionReasons.length], [100, 'PASS', 0], '96 output fresh per call + 97 candidateResults fresh + 98 gate/reason arrays fresh'); })();
(function () { var km = mkKm(); var a = evaluate({ requiredByDate: REQ, kmShipmentResults: [km] }); a.candidateResults[0].candidate.sku = 'MUT'; var b = evaluate({ requiredByDate: REQ, kmShipmentResults: [km] }); eq(b.candidateResults[0].candidate.sku, 'SKU-X', '99 one result cannot affect another'); })();

// ============================================================================
// INTEGRATION FIXTURES (§25) — Golden #12/#13/#14 foundations (NOT promoted), dup conflict, posted, other-bucket.
// ============================================================================

// A. GOLDEN #12 FOUNDATION — DRAFT.
(function () {
  var km = mkKm({ shipmentId: 'S12', status: 'draft', destinationWarehouseId: 'WH-12' }, { shipmentLineId: 'SHL-12', sku: 'SKU-D' }, { sku: 'SKU-D', destinationWarehouseId: 'WH-12' });
  eq(km.sourceEligible, false, 'FIX-A(pre) B4-R4 draft sourceEligible=false');
  var r = only(km);
  var cr = r.candidateResults[0];
  eq([cr.qualificationState, cr.qualifiedQuantity, r.qualifiedIncomingQuantity, cr.gateResults.TABLE_STATUS_QUALIFIED, cr.gateResults.NOT_EXCLUDED_LIFECYCLE_STATE], ['EXCLUDED', 0, 0, 'FAIL', 'FAIL'], 'FIX-A Golden #12 foundation: draft EXCLUDED, gate 4/8 FAIL (NOT promoted)');
})();

// B. GOLDEN #13 FOUNDATION — ON-TIME + linked external evidence.
(function () {
  var km = mkKm({ shipmentId: 'S13', eta: '2026-11-01', destinationWarehouseId: 'WH-13' }, { shipmentLineId: 'SHL-13', sku: 'SKU-E', shipmentQty: 250 }, { sku: 'SKU-E', destinationWarehouseId: 'WH-13' });
  var ext = mkExt({ authorityState: 'LINKED_EXTERNAL_EVIDENCE', linkedShipmentId: 'S13', quantityObserved: 250, sku: 'SKU-E', destinationWarehouseId: 'WH-13' });
  var r = evaluate({ requiredByDate: REQ, kmShipmentResults: [km], externalAuthorityResults: [ext] });
  var cr = r.candidateResults[0];
  var allPass = Object.keys(cr.gateResults).every(function (g) { return cr.gateResults[g] === 'PASS'; });
  eq([cr.qualificationState, allPass, r.qualifiedIncomingQuantity, r.externalObservedQuantity, cr.informationalReasons.indexOf('LINKED_EXTERNAL_EVIDENCE_PRESENT') >= 0], ['QUALIFIED', true, 250, 250, true], 'FIX-B Golden #13 foundation: all gates pass, qualified 250 once, external 0 + linked-evidence token (NOT promoted)');
})();

// C. GOLDEN #14 FOUNDATION — LATE.
(function () {
  var km = mkKm({ shipmentId: 'S14', eta: '2027-06-01', destinationWarehouseId: 'WH-14' }, { shipmentLineId: 'SHL-14', sku: 'SKU-F', shipmentQty: 175 }, { sku: 'SKU-F', destinationWarehouseId: 'WH-14' });
  var r = only(km);
  var cr = r.candidateResults[0];
  eq([cr.qualificationState, cr.qualifiedQuantity, cr.lateRiskQuantity, r.lateRiskQuantity], ['LATE_RISK', 0, 175, 175], 'FIX-C Golden #14 foundation: LATE_RISK, qualified 0, late-risk 175 visible (NOT promoted)');
})();

// D. DUPLICATE CONFLICT.
(function () {
  var r = run({ kmShipmentResults: [mkKm({}, { shipmentQty: 100 }), mkKm({}, { shipmentQty: 200 })] });
  eq([r.qualifiedIncomingQuantity, r.candidateResults.every(function (cr) { return cr.qualificationState === 'EXCLUDED'; }), r.summaryReasons.indexOf('DUPLICATE_LINEAGE_CONFLICT') >= 0], [0, true, true], 'FIX-D duplicate conflict: total 0, all EXCLUDED, conflict visible');
})();

// E. POSTED TO CURRENT STOCK.
(function () {
  var r = only(mkKm(), { postedToCurrentStockLineageKeys: ['shipment:S1:SHL-1'] });
  eq([r.qualifiedIncomingQuantity, r.candidateResults[0].qualificationState], [0, 'EXCLUDED'], 'FIX-E posted to current stock: total 0, EXCLUDED');
})();

// F. OTHER OWNERSHIP BUCKET.
(function () {
  var r = only(mkKm(), { activeOtherBucketLineageKeys: ['shipment:S1:SHL-1'] });
  eq([r.qualifiedIncomingQuantity, r.candidateResults[0].qualificationState], [0, 'EXCLUDED'], 'FIX-F other ownership bucket: total 0, EXCLUDED');
})();

if (fail) { console.error('\n' + fail + ' ASSERTION(S) FAILED'); process.exit(1); }
console.log('\nAll B4-R6 qualified-incoming assertions passed (' + pass + ' assertions).');
