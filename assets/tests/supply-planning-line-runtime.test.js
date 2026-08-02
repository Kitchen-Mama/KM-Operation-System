// B4-R7 — Minimal Supply-Planning Line Runtime (runSupplyPlanningLine).
// Unit/integration-tests the real pure module assets/js/core/supply-planning-line-runtime.js against REAL B4-R4 KM
// Shipment adapter results, REAL B4-R5 external authority results, the REAL B4-R6 evaluateQualifiedIncoming engine
// and the REAL canonical calculateGap: one-line orchestration, strict qualifiedIncomingQuantity → timelyQualified
// Incoming wiring, scope-consistency fail-closed, Late/Review/Excluded/external zero-contribution, and immutability.
// Run: node assets/tests/supply-planning-line-runtime.test.js

var path = require('path');
var fs = require('fs');
var buildKm = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-supply-candidates.js')).buildKmShipmentSupplyCandidate;
var adaptKm = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-incoming-adapters.js')).adaptKmShipmentIncomingCandidate;
var adaptExt = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-external-incoming-adapters.js')).adaptExternalIncomingAuthority;
var evaluate = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-qualified-incoming.js')).evaluateQualifiedIncoming;
var calculateGap = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-calculations.js')).calculateGap;
var MODULE_PATH = path.join(__dirname, '..', 'js', 'core', 'supply-planning-line-runtime.js');
var runLineFn = require(MODULE_PATH).runSupplyPlanningLine;

var fail = 0, pass = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; console.log('ok   ' + l); } }
function throwsType(fn, type, l) { try { fn(); fail++; console.error('FAIL ' + l + ' (no throw)'); } catch (e) { if (e instanceof type) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + ' (wrong type ' + (e && e.constructor && e.constructor.name) + ')'); } } }
function assign(base, ov) { var o = {}; for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) o[k] = base[k]; if (ov) for (var j in ov) if (Object.prototype.hasOwnProperty.call(ov, j)) o[j] = ov[j]; return o; }

function mkKm(sh, ln, sc) {
  var shipment = assign({ shipmentId: 'S1', status: 'in_transit', company: 'KM', country: 'US', marketplace: 'amazon_us', eta: '2026-10-01', destinationWarehouseId: 'WH-A' }, sh);
  var line = assign({ shipmentLineId: 'SHL-1', sku: 'SKU-X', shipmentQty: 200 }, ln);
  var scope = assign({ company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A', country: 'US', marketplace: 'amazon_us' }, sc);
  return adaptKm({ candidate: buildKm({ shipment: shipment, line: line }), scope: scope });
}
function mkExt(ov) {
  var c = assign({
    externalCandidateId: 'external_inbound:acme:ACC-1:OP-1:LN-1', sourceType: 'EXTERNAL_WMS_INBOUND', supplyDomain: 'EXTERNAL_3PL_OVERSEAS',
    authorityState: 'EXTERNAL_UNLINKED_QUARANTINED', provider: 'acme', externalAccountRef: 'ACC-1', externalOperationRef: 'OP-1', externalLineRef: 'LN-1',
    company: 'KM', country: 'US', marketplace: 'amazon_us', sku: 'SKU-X', siteSku: 'SITE-X', destinationWarehouseId: 'WH-A',
    quantityObserved: 200, eta: '2026-10-01', sourceUpdatedAt: '2026-08-01T00:00:00Z',
    linkedShipmentId: null, linkedShipmentLineId: null, linkedOperationId: null, reviewStatus: null, reconciliationState: null
  }, ov);
  return adaptExt({ candidate: c });
}
function baseInput(over) { return assign({ lineScope: { company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A' }, requiredByDate: '2026-12-31', demand: 1000, destinationCurrentStock: 300, timelyApprovedCommittedSupply: 100, kmShipmentResults: [] }, over); }
function runLine(over) { return runLineFn(baseInput(over)); }

// -------- Module / dependency --------
eq(typeof runLineFn, 'function', '1 runSupplyPlanningLine export exists');
eq(runLine().runtimeType, 'SUPPLY_PLANNING_LINE', '2 runtimeType fixed');
(function () { // 3/4 real dependencies used: results equal calling the real functions directly.
  var km = mkKm(); var q = evaluate({ requiredByDate: '2026-12-31', kmShipmentResults: [km], externalAuthorityResults: [], postedToCurrentStockLineageKeys: [], activeOtherBucketLineageKeys: [] });
  var directGap = calculateGap({ demand: 1000, destinationCurrentStock: 300, timelyQualifiedIncoming: q.qualifiedIncomingQuantity, timelyApprovedCommittedSupply: 100 });
  var line = runLine({ kmShipmentResults: [mkKm()] });
  eq([line.timelyQualifiedIncoming, line.calculatedGap], [q.qualifiedIncomingQuantity, directGap], '3+4 real evaluateQualifiedIncoming & real calculateGap used (match direct calls)');
})();
(function () { var src = fs.readFileSync(MODULE_PATH, 'utf8'); eq([/Math\.max/.test(src), /calculateGap\(/.test(src)], [false, true], '5 no copied gap formula (no Math.max; calls calculateGap)'); })();

// -------- Validation --------
throwsType(function () { return runLineFn(null); }, TypeError, '6 null input rejected');
throwsType(function () { return runLineFn(baseInput({ lineScope: [] })); }, TypeError, '7 invalid lineScope rejected');
throwsType(function () { return runLineFn(baseInput({ lineScope: { company: '', sku: 'SKU-X', destinationWarehouseId: 'WH-A' } })); }, RangeError, '8 blank company rejected');
throwsType(function () { return runLineFn(baseInput({ lineScope: { company: 'KM', sku: '', destinationWarehouseId: 'WH-A' } })); }, RangeError, '9 blank SKU rejected');
throwsType(function () { return runLineFn(baseInput({ lineScope: { company: 'KM', sku: 'SKU-X', destinationWarehouseId: '' } })); }, RangeError, '10 blank destination rejected');
throwsType(function () { return runLine({ requiredByDate: '2026-13-40' }); }, RangeError, '11 invalid Required-By rejected (B4-R6)');
throwsType(function () { return runLine({ demand: '1000' }); }, TypeError, '12 demand numeric string rejected (no coercion)');
throwsType(function () { return runLine({ demand: -5 }); }, RangeError, '13 negative demand rejected');
throwsType(function () { return runLine({ demand: NaN }); }, RangeError, '14 NaN demand rejected');
throwsType(function () { return runLine({ demand: Infinity }); }, RangeError, '15 Infinity demand rejected');
throwsType(function () { return runLine({ destinationCurrentStock: -1 }); }, RangeError, '16 negative current stock rejected');
throwsType(function () { return runLine({ timelyApprovedCommittedSupply: '50' }); }, TypeError, '17 invalid committed supply rejected (string)');
throwsType(function () { return runLine({ kmShipmentResults: 'x' }); }, TypeError, '18 KM results must be array');
throwsType(function () { return runLine({ externalAuthorityResults: 'x' }); }, TypeError, '19 external results must be array');

// -------- Scope consistency --------
eq(runLine({ kmShipmentResults: [mkKm()] }).calculatedGap, 400, '20 matching company accepted');
eq(runLine({ kmShipmentResults: [mkKm({}, { sku: 'SKU-X' })] }).timelyQualifiedIncoming, 200, '21 matching SKU accepted');
eq(runLine({ kmShipmentResults: [mkKm()] }).timelyQualifiedIncoming, 200, '22 matching destination accepted');
eq(runLineFn(baseInput({ lineScope: { company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A', country: 'US' }, kmShipmentResults: [mkKm()] })).timelyQualifiedIncoming, 200, '23 optional country accepted');
eq(runLineFn(baseInput({ lineScope: { company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A', marketplace: 'amazon_us' }, kmShipmentResults: [mkKm()] })).timelyQualifiedIncoming, 200, '24 optional marketplace accepted');
throwsType(function () { return runLine({ kmShipmentResults: [mkKm({ company: 'ResUS' }, {}, { company: 'ResUS' })] }); }, RangeError, '25 company mismatch rejected');
throwsType(function () { return runLine({ kmShipmentResults: [mkKm({}, { sku: 'SKU-Y' }, { sku: 'SKU-Y' })] }); }, RangeError, '26 SKU mismatch rejected');
throwsType(function () { return runLine({ kmShipmentResults: [mkKm({ destinationWarehouseId: 'WH-B' }, {}, { destinationWarehouseId: 'WH-B' })] }); }, RangeError, '27 destination mismatch rejected');
throwsType(function () { return runLineFn(baseInput({ lineScope: { company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A', country: 'CA' }, kmShipmentResults: [mkKm()] })); }, RangeError, '28 country mismatch rejected when supplied');
throwsType(function () { return runLineFn(baseInput({ lineScope: { company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A', marketplace: 'ebay_us' }, kmShipmentResults: [mkKm()] })); }, RangeError, '29 marketplace mismatch rejected when supplied');
throwsType(function () { return runLine({ kmShipmentResults: [mkKm(), mkKm({ company: 'ResUS' }, {}, { company: 'ResUS' })] }); }, RangeError, '30 mixed-scope KM candidates rejected');
throwsType(function () { return runLine({ kmShipmentResults: [mkKm({ destinationWarehouseId: 'WH-CODE-X' }, {}, { destinationWarehouseId: 'WH-CODE-X' })] }); }, RangeError, '31 warehouse_code cannot satisfy destination identity (only destinationWarehouseId compared)');

// -------- Core Gap wiring --------
(function () { var line = runLine({ kmShipmentResults: [mkKm()] }); eq(line.qualifiedIncomingResult.qualifiedIncomingQuantity, line.timelyQualifiedIncoming, '32 qualifiedIncomingQuantity wired to timelyQualifiedIncoming'); })();
eq(runLine({ demand: 900, kmShipmentResults: [mkKm()] }).demand, 900, '33 demand passed unchanged');
eq(runLine({ destinationCurrentStock: 250, kmShipmentResults: [mkKm()] }).destinationCurrentStock, 250, '34 destinationCurrentStock passed unchanged');
eq(runLine({ timelyApprovedCommittedSupply: 150, kmShipmentResults: [mkKm()] }).timelyApprovedCommittedSupply, 150, '35 timelyApprovedCommittedSupply passed unchanged');
(function () { var line = runLine({ kmShipmentResults: [mkKm()] }); eq(line.calculatedGap, calculateGap({ demand: 1000, destinationCurrentStock: 300, timelyQualifiedIncoming: 200, timelyApprovedCommittedSupply: 100 }), '36 calculatedGap matches calculateGap'); })();
eq(runLine({ demand: 100, destinationCurrentStock: 300 }).calculatedGap, 0, '37 calculateGap floors at zero');
eq(runLine().calculatedGap, 600, '38 no incoming case (1000-300-0-100=600)');
eq(runLine({ demand: 500, destinationCurrentStock: 500, timelyApprovedCommittedSupply: 0 }).calculatedGap, 0, '39 stock-only case');
eq(runLine({ demand: 500, destinationCurrentStock: 0, timelyApprovedCommittedSupply: 500 }).calculatedGap, 0, '40 committed-only case');
eq(runLine({ demand: 500, destinationCurrentStock: 0, timelyApprovedCommittedSupply: 0, kmShipmentResults: [mkKm({}, { shipmentQty: 500 })] }).calculatedGap, 0, '41 incoming-only case');
eq(runLine({ demand: 1000, destinationCurrentStock: 100, timelyApprovedCommittedSupply: 100, kmShipmentResults: [mkKm({}, { shipmentQty: 200 })] }).calculatedGap, 600, '42 stock+incoming+committed deducted once each (1000-100-200-100)');

// -------- Timely Shipment --------
eq(runLine({ kmShipmentResults: [mkKm()] }).calculatedGap, 400, '43 one timely qualified Shipment reduces gap');
eq(runLine({ kmShipmentResults: [mkKm({}, { shipmentQty: 100 }), mkKm({ shipmentId: 'S2' }, { shipmentLineId: 'SHL-2', shipmentQty: 100 })] }).timelyQualifiedIncoming, 200, '44 multiple timely unique Shipments sum');
eq(runLine({ kmShipmentResults: [mkKm()], externalAuthorityResults: [mkExt({ authorityState: 'LINKED_EXTERNAL_EVIDENCE', linkedShipmentId: 'S1', quantityObserved: 200 })] }).calculatedGap, 400, '45 linked external evidence does not add a second reduction');
eq(runLine({ kmShipmentResults: [mkKm()], externalAuthorityResults: [mkExt({ authorityState: 'ADOPTED_TO_KM', linkedShipmentId: 'S-OTHER', quantityObserved: 200 })] }).calculatedGap, 400, '46 adopted external row does not add a second reduction');
eq(runLine({ kmShipmentResults: [mkKm(), mkKm()] }).timelyQualifiedIncoming, 200, '47 identical duplicate Shipment counts once');
eq(runLine({ kmShipmentResults: [mkKm({}, { shipmentQty: 200 }), mkKm({}, { shipmentQty: 150 })] }).timelyQualifiedIncoming, 0, '48 conflicting duplicate Shipment reduces gap by zero');

// -------- Draft / terminal --------
eq(runLine({ kmShipmentResults: [mkKm({ status: 'draft' })] }).timelyQualifiedIncoming, 0, '49 draft Shipment does not reduce gap');
eq(runLine({ kmShipmentResults: [mkKm({ status: 'received' })] }).timelyQualifiedIncoming, 0, '50 received Shipment does not reduce gap');
eq(runLine({ kmShipmentResults: [mkKm({ status: 'closed' })] }).timelyQualifiedIncoming, 0, '51 closed Shipment does not reduce gap');
eq(runLine({ kmShipmentResults: [mkKm({ status: 'cancelled' })] }).timelyQualifiedIncoming, 0, '52 cancelled Shipment does not reduce gap');

// -------- Late / Review --------
(function () { var line = runLine({ kmShipmentResults: [mkKm({ eta: '2027-06-01' })] }); eq([line.incomingBreakdown.lateRiskQuantity, line.timelyQualifiedIncoming, line.calculatedGap], [200, 0, 600], '53+54 late Shipment in Late Risk, does not reduce gap'); })();
(function () { var line = runLine({ kmShipmentResults: [mkKm({ eta: '' })] }); eq([line.incomingBreakdown.reviewIncomingQuantity, line.timelyQualifiedIncoming, line.calculatedGap], [200, 0, 600], '55+56 missing ETA in Review, does not reduce gap'); })();
(function () { var line = runLine({ kmShipmentResults: [mkKm({ eta: '2026-13-40' })] }); eq([line.incomingBreakdown.reviewIncomingQuantity, line.timelyQualifiedIncoming], [200, 0], '57+58 invalid ETA in Review, does not reduce gap'); })();
eq(runLine({ kmShipmentResults: [mkKm({ destinationWarehouseId: '', legacyWarehouseId: '' })] }).timelyQualifiedIncoming, 0, '59 missing destination does not reduce gap');

// -------- Count-once evidence --------
eq(runLine({ kmShipmentResults: [mkKm()], postedToCurrentStockLineageKeys: ['shipment:S1:SHL-1'] }).timelyQualifiedIncoming, 0, '60 posted-to-current-stock lineage does not reduce gap');
eq(runLine({ kmShipmentResults: [mkKm()], activeOtherBucketLineageKeys: ['shipment:S1:SHL-1'] }).timelyQualifiedIncoming, 0, '61 active-other-bucket lineage does not reduce gap');
eq(runLine({ kmShipmentResults: [mkKm()], postedToCurrentStockLineageKeys: ['shipment:OTHER:LINE'] }).timelyQualifiedIncoming, 200, '62 unrelated evidence does not block valid incoming');

// -------- External --------
eq(runLine({ externalAuthorityResults: [mkExt({ quantityObserved: 300 })] }).incomingBreakdown.externalObservedQuantity, 300, '63 external observed quantity visible');
eq(runLine({ externalAuthorityResults: [mkExt({ quantityObserved: 300 })] }).calculatedGap, 600, '64 external observed quantity not gap-deductible');
eq(runLine({ externalAuthorityResults: [mkExt({ eta: '2026-06-01' })] }).timelyQualifiedIncoming, 0, '65 fresh quarantined external remains zero');
eq(runLine({ externalAuthorityResults: [mkExt({ eta: '2020-01-01', sourceUpdatedAt: '2020-01-01T00:00:00Z' })] }).timelyQualifiedIncoming, 0, '66 stale quarantined external remains zero');
eq(runLine({ externalAuthorityResults: [mkExt({ authorityState: 'LINKED_EXTERNAL_EVIDENCE', linkedShipmentId: 'S9' })] }).timelyQualifiedIncoming, 0, '67 linked external remains zero');
eq(runLine({ externalAuthorityResults: [mkExt({ authorityState: 'ADOPTED_TO_KM', linkedShipmentId: 'S9' })] }).timelyQualifiedIncoming, 0, '68 adopted external remains zero');
['REJECTED_EXTERNAL_RECORD', 'IGNORED_FOR_PLANNING', 'SUPERSEDED', 'REVERSED'].forEach(function (s, k) {
  eq(runLine({ externalAuthorityResults: [mkExt({ authorityState: s })] }).calculatedGap, 600, '69.' + (k + 1) + ' ' + s + ' remains zero (gap unchanged)');
});

// -------- Output --------
eq(runLine({ kmShipmentResults: [mkKm()] }).timelyQualifiedIncoming, 200, '70 timelyQualifiedIncoming exact');
eq(runLine({ kmShipmentResults: [mkKm()] }).calculatedGap, 400, '71 calculatedGap exact');
(function () { var line = runLine({ kmShipmentResults: [mkKm({ eta: '2027-06-01' })] }); eq(line.incomingBreakdown, { timelyQualifiedIncoming: 0, lateRiskQuantity: 200, excludedIncomingQuantity: 0, reviewIncomingQuantity: 0, externalObservedQuantity: 0 }, '72 incomingBreakdown exact'); })();
(function () { var line = runLine({ kmShipmentResults: [mkKm()], externalAuthorityResults: [mkExt({ authorityState: 'LINKED_EXTERNAL_EVIDENCE', linkedShipmentId: 'S1', quantityObserved: 200 })] }); eq(line.sourceSummary, { kmCandidateCount: 1, deduplicatedKmCandidateCount: 1, externalObservationCount: 1, linkedExternalEvidenceCount: 1, quarantinedExternalCount: 0, adoptedExternalCount: 0, adoptionPendingCount: 0 }, '73 sourceSummary exact'); })();
eq(runLine({ kmShipmentResults: [mkKm()] }).qualifiedIncomingResult.engineType, 'QUALIFIED_INCOMING', '74 full B4-R6 trace preserved');
(function () { var line = runLine({ kmShipmentResults: [mkKm()] }); eq(Object.keys(line.qualifiedIncomingResult.candidateResults[0].gateResults).length, 10, '75 gate results preserved'); })();
(function () { var line = runLine({ kmShipmentResults: [mkKm({ status: 'draft' })] }); eq(line.qualifiedIncomingResult.candidateResults[0].exclusionReasons.indexOf('STATUS_NOT_ELIGIBLE') >= 0, true, '76 candidate reasons preserved'); })();
(function () { var line = runLine({ externalAuthorityResults: [mkExt()] }); eq(line.qualifiedIncomingResult.externalResults.length, 1, '77 external audit output preserved'); })();
(function () { var line = runLine({ kmShipmentResults: [mkKm()] }); eq([line.recommendedShippingQty, line.orderQty, line.persistenceStatus].every(function (v) { return v === undefined; }), true, '78+79+80 no recommendedShippingQty/orderQty/persistence output'); })();

// -------- Immutability --------
(function () { var inp = baseInput({ kmShipmentResults: [mkKm()], externalAuthorityResults: [mkExt()], postedToCurrentStockLineageKeys: ['X'], activeOtherBucketLineageKeys: ['Y'] }); var snap = JSON.stringify(inp); runLineFn(inp); eq(JSON.stringify(inp), snap, '81+82+85 top-level input / lineScope / evidence arrays not mutated'); })();
(function () { var km = mkKm(); var snap = JSON.stringify(km); runLine({ kmShipmentResults: [km] }); eq(JSON.stringify(km), snap, '83 KM adapter results not mutated'); })();
(function () { var ex = mkExt(); var snap = JSON.stringify(ex); runLine({ externalAuthorityResults: [ex] }); eq(JSON.stringify(ex), snap, '84 external results not mutated'); })();
(function () { var a = runLine({ kmShipmentResults: [mkKm()] }); var b = runLine({ kmShipmentResults: [mkKm()] }); a.calculatedGap = -1; a.incomingBreakdown.timelyQualifiedIncoming = -1; a.lineScope.company = 'MUT'; a.qualifiedIncomingResult.qualifiedIncomingQuantity = -1; eq([b.calculatedGap, b.incomingBreakdown.timelyQualifiedIncoming, b.lineScope.company, b.qualifiedIncomingResult.qualifiedIncomingQuantity], [400, 200, 'KM', 200], '86+87+88 output fresh, nested trace fresh, one output cannot affect another'); })();

// ============================================================================
// INTEGRATION FIXTURES (§24)
// ============================================================================

// A. NO INCOMING.
eq(runLineFn({ lineScope: { company: 'KM', sku: 'SKU-X', destinationWarehouseId: 'WH-A' }, requiredByDate: '2026-12-31', demand: 1000, destinationCurrentStock: 300, timelyApprovedCommittedSupply: 100, kmShipmentResults: [] }).calculatedGap, 600, 'FIX-A no incoming: timely 0, gap 600');

// B. GOLDEN #12 LINE FOUNDATION — DRAFT (NOT promoted).
(function () { var line = runLine({ kmShipmentResults: [mkKm({ status: 'draft' }, { shipmentQty: 200 })] }); eq([line.qualifiedIncomingResult.candidateResults[0].qualificationState, line.timelyQualifiedIncoming, line.calculatedGap], ['EXCLUDED', 0, 600], 'FIX-B Golden #12 line foundation: draft EXCLUDED, timely 0, gap 600 (NOT promoted)'); })();

// C. GOLDEN #13 LINE FOUNDATION — ON-TIME + linked external evidence (NOT promoted).
(function () { var line = runLine({ kmShipmentResults: [mkKm({}, { shipmentQty: 200 })], externalAuthorityResults: [mkExt({ authorityState: 'LINKED_EXTERNAL_EVIDENCE', linkedShipmentId: 'S1', quantityObserved: 200 })] }); eq([line.timelyQualifiedIncoming, line.incomingBreakdown.externalObservedQuantity, line.calculatedGap], [200, 200, 400], 'FIX-C Golden #13 line foundation: timely 200, external 200 not deducted, gap 400 (NOT promoted)'); })();

// D. GOLDEN #14 LINE FOUNDATION — LATE (NOT promoted).
(function () { var line = runLine({ kmShipmentResults: [mkKm({ eta: '2027-06-01' }, { shipmentQty: 200 })] }); eq([line.timelyQualifiedIncoming, line.incomingBreakdown.lateRiskQuantity, line.calculatedGap], [0, 200, 600], 'FIX-D Golden #14 line foundation: timely 0, lateRisk 200, gap 600 (NOT promoted)'); })();

// E. POSTED TO CURRENT STOCK.
eq(runLine({ kmShipmentResults: [mkKm({}, { shipmentQty: 200 })], postedToCurrentStockLineageKeys: ['shipment:S1:SHL-1'] }).calculatedGap, 600, 'FIX-E posted to current stock: timely 0, no incoming deduction (gap 600)');

// F. OTHER ACTIVE BUCKET.
eq(runLine({ kmShipmentResults: [mkKm({}, { shipmentQty: 200 })], activeOtherBucketLineageKeys: ['shipment:S1:SHL-1'] }).timelyQualifiedIncoming, 0, 'FIX-F other active bucket: timely 0');

// G. OVERSUPPLY.
eq(runLine({ demand: 100, destinationCurrentStock: 300, timelyApprovedCommittedSupply: 100, kmShipmentResults: [mkKm()] }).calculatedGap, 0, 'FIX-G oversupply: gap floors at 0');

if (fail) { console.error('\n' + fail + ' ASSERTION(S) FAILED'); process.exit(1); }
console.log('\nAll B4-R7 line-runtime assertions passed (' + pass + ' assertions).');
