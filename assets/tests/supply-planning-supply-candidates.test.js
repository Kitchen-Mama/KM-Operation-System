// B4-R3 — Normalized KM Shipment Supply Candidate pure DTO (buildKmShipmentSupplyCandidate).
// Unit-tests the real pure module assets/js/core/supply-planning-supply-candidates.js: deterministic identity,
// B4-R1 quantity precedence, B4-R2 destination precedence, KM-canonical authority, source-completeness review
// flags, structural validation, and immutability. Plus a source-adapter fixture proving one current Shipment
// header row + one Shipment line row can feed the builder (without using aggregate byDest).
// Run: node assets/tests/supply-planning-supply-candidates.test.js

var path = require('path');
var mod = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-supply-candidates.js'));
var build = mod.buildKmShipmentSupplyCandidate;

var fail = 0, pass = 0;
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
  else { pass++; console.log('ok   ' + l); }
}
function throwsType(fn, type, l) {
  try { fn(); fail++; console.error('FAIL ' + l + ' (no throw)'); }
  catch (e) { if (e instanceof type) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + ' (wrong type: ' + (e && e.constructor && e.constructor.name) + ')'); } }
}
function baseInput() {
  return {
    shipment: { shipmentId: 'S1', status: 'in_transit', company: 'KM', country: 'US', marketplace: 'amazon_us',
                eta: '2026-09-01', destinationWarehouseId: 'WH-A', legacyWarehouseId: 'WH-LEG', sourceUpdatedAt: '2026-08-01T00:00:00Z' },
    line: { shipmentLineId: 'SHL-1', sku: 'SKU-X', siteSku: 'SITE-X', shipmentQty: 100, legacyQty: 80,
            purchaseOrderLineId: 'POL-1', shippingPlanLineId: 'SPL-1' }
  };
}

eq(typeof build, 'function', 'module exports buildKmShipmentSupplyCandidate');

// -------- Identity --------
var c = build(baseInput());
eq(c.supplyCandidateId, 'shipment:S1:SHL-1', '1 deterministic supplyCandidateId');
eq(c.sourceRef, 'shipment:S1', '2 deterministic sourceRef');
eq(c.sourceLineRef, 'shipment:S1:SHL-1', '3 deterministic sourceLineRef');
eq(c.lineageKey, 'shipment:S1:SHL-1', '4 deterministic lineageKey (stable shipment-line key)');
eq(JSON.stringify(build(baseInput())), JSON.stringify(build(baseInput())), '5 repeated calls produce identical candidate');
(function () {
  var i = baseInput(); i.shipment.status = 'arrived'; i.shipment.eta = '2027-01-01'; i.line.shipmentQty = 5;
  i.shipment.destinationWarehouseId = 'WH-Z'; i.shipment.sourceUpdatedAt = '2099-01-01';
  eq(build(i).supplyCandidateId, 'shipment:S1:SHL-1', '6 mutable fields (status/eta/qty/dest/updated) do NOT affect id');
})();

// -------- Quantity (B4-R1 semantics) --------
eq(build(baseInput()).quantityOriginal, 100, '7 canonical shipment_qty preferred (100 not 80)');
(function () { var i = baseInput(); i.line.shipmentQty = 0; i.line.legacyQty = 80; var r = build(i);
  eq(r.quantityOriginal, 0, '8 canonical zero preserved'); eq(r.reviewFlags.indexOf('INVALID_QUANTITY'), -1, '8b clean zero is NOT flagged invalid'); })();
(function () { var i = baseInput(); i.line.shipmentQty = ''; i.line.legacyQty = 80; eq(build(i).quantityOriginal, 80, '9 blank canonical → legacy fallback'); })();
(function () { var i = baseInput(); delete i.line.shipmentQty; i.line.legacyQty = 80; eq(build(i).quantityOriginal, 80, '10 absent canonical → legacy fallback'); })();
(function () { var i = baseInput(); i.line.shipmentQty = 'abc'; i.line.legacyQty = 80; var r = build(i);
  eq(r.quantityOriginal, 0, '11 malformed canonical → 0 (no legacy override)'); eq(r.reviewFlags.indexOf('INVALID_QUANTITY') >= 0, true, '11b malformed → INVALID_QUANTITY flag'); })();
(function () { var i = baseInput(); i.line.shipmentQty = -5; i.line.legacyQty = 80; eq(build(i).quantityOriginal, 0, '12 negative canonical → 0'); })();
eq(build(baseInput()).quantityRemaining, 100, '13 quantityRemaining = original (no receipt/cancel subtraction); never summed with legacy');

// -------- Destination (B4-R2 semantics) --------
eq(build(baseInput()).destinationWarehouseId, 'WH-A', '14 canonical destination preferred');
eq(build(baseInput()).destinationIdentitySource, 'CANONICAL_DESTINATION_WAREHOUSE_ID', '14b destinationIdentitySource token = canonical');
(function () { var i = baseInput(); i.shipment.destinationWarehouseId = ''; var r = build(i);
  eq(r.destinationWarehouseId, 'WH-LEG', '15 legacy warehouse_id fallback'); eq(r.destinationIdentitySource, 'LEGACY_WAREHOUSE_ID_FALLBACK', '15b token = legacy fallback'); })();
(function () { var i = baseInput(); i.shipment.destinationWarehouseId = 'WH-A'; i.shipment.legacyWarehouseId = 'WH-LEG'; eq(build(i).destinationWarehouseId, 'WH-A', '16 conflict → canonical wins'); })();
(function () { var i = baseInput(); i.shipment.destinationWarehouseId = ''; i.shipment.legacyWarehouseId = ''; var r = build(i);
  eq(r.destinationWarehouseId, null, '17 missing destination represented structurally (null)'); eq(r.destinationIdentitySource, 'MISSING', '17b token = MISSING'); })();
(function () { var i = baseInput(); i.shipment.destinationWarehouseId = '0'; eq(build(i).destinationWarehouseId, '0', '18 string id "0" preserved'); })();
(function () { var i = baseInput(); i.shipment.destinationWarehouseId = ''; i.shipment.legacyWarehouseId = ''; i.shipment.warehouseCode = 'CODE-A'; i.shipment.destination = 'Some Text';
  eq(build(i).destinationWarehouseId, null, '19 warehouse_code / display text NEVER used as identity'); })();
(function () { var i = baseInput(); i.shipment.destinationWarehouseId = ''; i.shipment.legacyWarehouseId = ''; i.shipment.sourceWarehouseId = 'SRC-1';
  eq(build(i).destinationIdentitySource, 'MISSING', '20 origin/source warehouse NEVER a destination fallback'); })();

// -------- Authority / source / domain / stage --------
eq(build(baseInput()).authorityType, 'KM_CANONICAL', '21 authorityType = KM_CANONICAL');
eq(build(baseInput()).sourceType, 'KM_SHIPMENT_LINE', '22 sourceType = KM_SHIPMENT_LINE');
eq([build(baseInput()).supplyDomain, build(baseInput()).supplyStage], ['KM_3PL_OVERSEAS', 'FORMAL_SHIPMENT'], '23 domain + stage fixed');
(function () { var i = baseInput(); i.shipment.status = '  Ready_To_Ship  '; eq(build(i).status, 'Ready_To_Ship', '24 raw status preserved (trimmed, case unchanged, NOT qualified)'); })();
(function () { var r = build(baseInput());
  eq([r.qualifiedIncoming, r.calculationAllowed, r.requiredByDate, r.coverageQty, r.lateRiskQty, r.exclusionReason, r.gap, r.currentStock].every(function (v) { return v === undefined; }), true, '25 NO qualification result keys exist'); })();

// -------- Review flags --------
(function () { var i = baseInput(); i.shipment.destinationWarehouseId = ''; i.shipment.legacyWarehouseId = ''; eq(build(i).reviewFlags.indexOf('MISSING_DESTINATION_IDENTITY') >= 0, true, '26 missing destination flag'); })();
(function () { var i = baseInput(); i.shipment.eta = ''; eq(build(i).reviewFlags.indexOf('MISSING_ETA') >= 0, true, '27 missing ETA flag'); })();
(function () { var i = baseInput(); i.shipment.status = ''; eq(build(i).reviewFlags.indexOf('MISSING_STATUS') >= 0, true, '28 missing status flag'); })();
(function () { var i = baseInput(); i.shipment.company = ''; i.shipment.destinationWarehouseId = ''; i.shipment.legacyWarehouseId = ''; i.shipment.eta = ''; i.shipment.status = '';
  eq(build(i).reviewFlags, ['MISSING_COMPANY', 'MISSING_DESTINATION_IDENTITY', 'MISSING_ETA', 'MISSING_STATUS'], '29 deterministic flag order'); })();
(function () { var i = baseInput(); i.shipment.company = ''; var f = build(i).reviewFlags; var seen = {}; var dup = false; f.forEach(function (x) { if (seen[x]) dup = true; seen[x] = 1; }); eq(dup, false, '30 no duplicate flags'); })();

// -------- Validation --------
throwsType(function () { return build(null); }, TypeError, '31a null input → TypeError');
throwsType(function () { return build([]); }, TypeError, '31b array input → TypeError');
throwsType(function () { return build('x'); }, TypeError, '31c primitive input → TypeError');
throwsType(function () { var i = baseInput(); delete i.shipment; return build(i); }, TypeError, '32 missing shipment object → TypeError');
throwsType(function () { var i = baseInput(); i.line = []; return build(i); }, TypeError, '33 array line object → TypeError');
throwsType(function () { var i = baseInput(); i.shipment.shipmentId = ''; return build(i); }, RangeError, '34a blank shipmentId → RangeError');
throwsType(function () { var i = baseInput(); i.shipment.shipmentId = 123; return build(i); }, TypeError, '34b non-string shipmentId → TypeError');
throwsType(function () { var i = baseInput(); i.line.shipmentLineId = '   '; return build(i); }, RangeError, '35 blank shipmentLineId → RangeError');
throwsType(function () { var i = baseInput(); i.line.sku = ''; return build(i); }, RangeError, '36 blank sku → RangeError');

// -------- Immutability --------
(function () { var i = baseInput(); var snap = JSON.stringify(i); build(i); eq(JSON.stringify(i), snap, '37 input object not mutated'); })();
(function () { var i = baseInput(); var s = JSON.stringify(i.shipment), l = JSON.stringify(i.line); build(i); eq([JSON.stringify(i.shipment), JSON.stringify(i.line)], [s, l], '38 nested shipment/line not mutated'); })();
(function () { var i = baseInput(); var a = build(i), b = build(i); a.reviewFlags.push('X'); a.company = 'MUT';
  eq([b.reviewFlags.length, b.company], [0, 'KM'], '39 output fresh per call (mutating one does not affect another)'); })();
(function () { var i = baseInput(); i.shipment.company = ''; var a = build(i), b = build(i); a.reviewFlags.push('Y'); eq(b.reviewFlags.indexOf('Y'), -1, '40 reviewFlags array fresh per call'); })();

// -------- Source adapter fixture (§19): one Shipment header row + one Shipment line row → candidate --------
(function () {
  var shHeader = ['shipment_id', 'status', 'company', 'country', 'marketplace', 'eta', 'destination_warehouse_id', 'warehouse_id', 'warehouse_code', 'source_warehouse_id'];
  var shRow = ['S9', 'in_transit', 'KM', 'US', 'amazon_us', '2026-10-01', 'WH-9', 'WH-OLD', 'CODE-9', 'SRC-9'];
  var lnHeader = ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty', 'qty', 'purchase_order_line_id'];
  var lnRow = ['SHL-9', 'S9', 'SKU-Z', 250, 999, 'POL-9'];
  function pick(header, row, name) { var i = header.indexOf(name); return i === -1 ? undefined : row[i]; }
  // Adapter maps CURRENT source field semantics into the pure builder input (B4-R1 qty + B4-R2 destination raw values).
  var candidate = build({
    shipment: {
      shipmentId: pick(shHeader, shRow, 'shipment_id'), status: pick(shHeader, shRow, 'status'),
      company: pick(shHeader, shRow, 'company'), country: pick(shHeader, shRow, 'country'),
      marketplace: pick(shHeader, shRow, 'marketplace'), eta: pick(shHeader, shRow, 'eta'),
      destinationWarehouseId: pick(shHeader, shRow, 'destination_warehouse_id'),
      legacyWarehouseId: pick(shHeader, shRow, 'warehouse_id')
    },
    line: {
      shipmentLineId: pick(lnHeader, lnRow, 'shipment_line_id'), sku: pick(lnHeader, lnRow, 'sku'),
      shipmentQty: pick(lnHeader, lnRow, 'shipment_qty'), legacyQty: pick(lnHeader, lnRow, 'qty'),
      purchaseOrderLineId: pick(lnHeader, lnRow, 'purchase_order_line_id')
    }
  });
  eq(candidate.supplyCandidateId, 'shipment:S9:SHL-9', 'adapter: candidate id from real source row');
  eq(candidate.quantityOriginal, 250, 'adapter: B4-R1 shipment_qty primary (legacy 999 ignored)');
  eq(candidate.destinationWarehouseId, 'WH-9', 'adapter: B4-R2 canonical destination (not code/source/legacy)');
  eq([candidate.linkedShipmentId, candidate.linkedShipmentLineId, candidate.linkedPurchaseOrderLineId], ['S9', 'SHL-9', 'POL-9'], 'adapter: lineage from source row');
  eq(candidate.authorityType, 'KM_CANONICAL', 'adapter: KM canonical authority');
})();

if (fail) { console.error('\n' + fail + ' ASSERTION(S) FAILED'); process.exit(1); }
console.log('\nAll B4-R3 supply-candidate assertions passed (' + pass + ' assertions).');
