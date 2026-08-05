// Kitchen Mama Operation System — Supply Lifecycle source projection tests (Phase 2C, Round 1K).
// Run: node assets/tests/supply-planning-supply-lifecycle.test.js
// Pure Node — exercises projectSupplyLifecycle in assets/js/core/supply-planning-source-facts.js. Verifies the
// table-specific source-status → §39.5 lifecycle-bucket mapping, the REAL B4-R3/R4/R6 shipment chain + REAL
// buildSupplyLedger (never duplicated), count-once via the real Ledger, delivered≠current-stock, missing≠zero,
// unknown-status fail-closed, and determinism/purity. Assertion count reported separately.

'use strict';
var SF = require('../js/core/supply-planning-source-facts.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- fixtures --------------------------------------------------------------
function prodRow(ref, status, qty) { return { supplyLineageRef: ref, company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: qty, status: status }; }
function planRow(ref, status, qty) { return { supplyLineageRef: ref, company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: qty, status: status }; }
function eventRow(ref, evt, qty) { return { supplyLineageRef: ref, company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: qty, eventType: evt }; }
function recvRow(ref, status, qty) { return { supplyLineageRef: ref, company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: qty, status: status }; }
function corrRow(ref, qty) { return { supplyLineageRef: ref, company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: qty }; }
var SCOPE = { company: 'KM', sku: 'CO1100-R', destinationWarehouseId: 'WH1', country: 'US', marketplace: 'Amazon' };
function shipInput(id, status, qty, eta) {
  return { shipment: { shipmentId: id, company: 'KM', country: 'US', marketplace: 'Amazon', eta: eta || '2026-08-15', status: status, destinationWarehouseId: 'WH1' },
           line: { shipmentLineId: id + '-L1', sku: 'CO1100-R', shipmentQty: qty } };
}
function shipments(inputs, extra) {
  var s = { shipmentInputs: inputs, scope: SCOPE, requiredByDate: '2026-09-01' };
  if (extra) for (var k in extra) s[k] = extra[k];
  return s;
}
// find a pool by bucket in the ledger
function poolBucket(res, bucket) {
  for (var i = 0; i < res.ledger.pools.length; i++) { var p = res.ledger.pools[i]; if (p.byLifecycleBucket && p.byLifecycleBucket[bucket] !== undefined) return p; }
  return null;
}

// ==========================================================================
section('S. status mapping — Production / PO (REQUEST_ORDER §1)');
(function () {
  ['issued', 'in_production', 'partial_completed', 'completed'].forEach(function (st) {
    var r = SF.projectSupplyLifecycle({ committedProduction: [prodRow('po:' + st, st, 100)] });
    eq(r.entries.length && r.entries[0].lifecycleBucket, 'COMMITTED_PRODUCTION', 'S: production ' + st + ' → COMMITTED_PRODUCTION');
  });
  eq(SF.projectSupplyLifecycle({ committedProduction: [prodRow('po:d', 'draft', 100)] }).entries[0].lifecycleBucket, 'DRAFT', 'S: production draft → DRAFT');
  eq(SF.projectSupplyLifecycle({ committedProduction: [prodRow('po:c', 'cancelled', 100)] }).entries[0].lifecycleBucket, 'CANCELLED_INVALID', 'S: production cancelled → CANCELLED_INVALID');
  eq(SF.projectSupplyLifecycle({ committedProduction: [prodRow('po:x', 'closure', 100)] }).entries[0].lifecycleBucket, 'CANCELLED_INVALID', 'S: production closure → CANCELLED_INVALID');
  var shippedPo = SF.projectSupplyLifecycle({ committedProduction: [prodRow('po:s', 'shipped', 100)] });
  eq([shippedPo.entries.length, shippedPo.issues[0].reason.indexOf('LINEAGE_TRANSFERRED_DOWNSTREAM') === 0], [0, true], 'S: production shipped → OMIT (ownership transferred, no entry)');
  var unk = SF.projectSupplyLifecycle({ committedProduction: [prodRow('po:u', 'weird', 100)] });
  eq([unk.entries.length, unk.issues[0].reason.indexOf('UNKNOWN_STATUS') === 0], [0, true], 'S: production unknown status → fail-closed issue, no entry');
})();

section('S. status mapping — Shipping Plan');
(function () {
  eq(SF.projectSupplyLifecycle({ approvedShippingPlans: [planRow('pl:a', 'approved', 100)] }).entries[0].lifecycleBucket, 'APPROVED_SHIPPING_PLAN', 'S: plan approved → APPROVED_SHIPPING_PLAN');
  eq(SF.projectSupplyLifecycle({ approvedShippingPlans: [planRow('pl:d', 'draft', 100)] }).entries[0].lifecycleBucket, 'DRAFT', 'S: plan draft → DRAFT');
  eq(SF.projectSupplyLifecycle({ approvedShippingPlans: [planRow('pl:p', 'pending_approval', 100)] }).entries[0].lifecycleBucket, 'DRAFT', 'S: plan pending_approval → DRAFT');
  eq(SF.projectSupplyLifecycle({ approvedShippingPlans: [planRow('pl:c', 'cancelled', 100)] }).entries[0].lifecycleBucket, 'CANCELLED_INVALID', 'S: plan cancelled → CANCELLED_INVALID');
  var completed = SF.projectSupplyLifecycle({ approvedShippingPlans: [planRow('pl:done', 'completed', 100)] });
  eq([completed.entries.length, completed.issues[0].reason.indexOf('LINEAGE_TRANSFERRED_DOWNSTREAM') === 0], [0, true], 'S: plan completed → OMIT (transferred to shipment)');
})();

section('S. status mapping — Shipment (real B4-R3/R4/R6 chain)');
(function () {
  eq(poolBucket(SF.projectSupplyLifecycle({ shipments: shipments([shipInput('S1', 'shipped', 100)]) }), 'SHIPPED_IN_TRANSIT') !== null, true, 'S: shipment shipped → SHIPPED_IN_TRANSIT');
  eq(poolBucket(SF.projectSupplyLifecycle({ shipments: shipments([shipInput('S2', 'in_transit', 100)]) }), 'SHIPPED_IN_TRANSIT') !== null, true, 'S: shipment in_transit → SHIPPED_IN_TRANSIT');
  eq(poolBucket(SF.projectSupplyLifecycle({ shipments: shipments([shipInput('S3', 'ready_to_ship', 100)]) }), 'APPROVED_SHIPPING_PLAN') !== null, true, 'S: shipment ready_to_ship → APPROVED_SHIPPING_PLAN (pre-dispatch, evidence SHIPMENT_CENTER §4/§15.1)');
  eq(poolBucket(SF.projectSupplyLifecycle({ shipments: shipments([shipInput('S4', 'arrived', 100)]) }), 'SHIPPED_IN_TRANSIT') !== null, true, 'S: shipment arrived → SHIPPED_IN_TRANSIT (F1-3a SC-11.4-B; DELIVERED_NOT_RECEIVED only from a delivery-event authority per SC-11.4-C)');
  var shipRecv = SF.projectSupplyLifecycle({ shipments: shipments([shipInput('S5', 'received', 100)]) });
  eq([shipRecv.entries.length, shipRecv.issues.filter(function (x) { return x.reason.indexOf('RECEIVING_AUTHORITY_REQUIRED') === 0; }).length], [0, 1], 'S: shipment received → OMIT (F1-3b SC-11.4-B/SC-11.5: raw status never itself a receiving authority; RECEIVED_NOT_REFLECTED only from receivingFacts)');
  eq(SF.projectSupplyLifecycle({ shipments: shipments([shipInput('S6', 'draft', 100)]) }).entries[0].lifecycleBucket, 'DRAFT', 'S: shipment draft → DRAFT (excluded, visible)');
  eq(SF.projectSupplyLifecycle({ shipments: shipments([shipInput('S7', 'cancelled', 100)]) }).entries[0].lifecycleBucket, 'CANCELLED_INVALID', 'S: shipment cancelled → CANCELLED_INVALID');
  var closed = SF.projectSupplyLifecycle({ shipments: shipments([shipInput('S8', 'closed', 100)]) });
  eq([closed.entries.length, closed.issues.filter(function (x) { return x.reason.indexOf('POSTED_TO_CURRENT_STOCK_AUTHORITY') === 0; }).length], [0, 1], 'S: shipment closed → OMIT (belongs to CURRENT_STOCK authority)');
})();

section('S. status mapping — Route event / Receiving / Correction');
(function () {
  eq(SF.projectSupplyLifecycle({ routeEvents: [eventRow('e:1', 'delivered', 100)] }).entries[0].lifecycleBucket, 'DELIVERED_NOT_RECEIVED', 'S: route delivered → DELIVERED_NOT_RECEIVED');
  eq(SF.projectSupplyLifecycle({ routeEvents: [eventRow('e:2', 'received', 100)] }).entries[0].lifecycleBucket, 'RECEIVED_NOT_REFLECTED', 'S: route received → RECEIVED_NOT_REFLECTED');
  eq(SF.projectSupplyLifecycle({ routeEvents: [eventRow('e:3', 'arrived', 100)] }).entries[0].lifecycleBucket, 'SHIPPED_IN_TRANSIT', 'S: route arrived → SHIPPED_IN_TRANSIT (F1-3b SC-11.4-C: arrival milestone ≠ delivery; DELIVERED only from a real delivered event)');
  eq(SF.projectSupplyLifecycle({ routeEvents: [eventRow('e:4', 'arrived_port', 100)] }).entries[0].lifecycleBucket, 'SHIPPED_IN_TRANSIT', 'S: route arrived_port → SHIPPED_IN_TRANSIT (F1-3b SC-11.4-C: arrival milestone ≠ delivery)');
  eq(SF.projectSupplyLifecycle({ receivingFacts: [recvRow('r:1', 'confirmed', 100)] }).entries[0].lifecycleBucket, 'RECEIVED_NOT_REFLECTED', 'S: receiving confirmed → RECEIVED_NOT_REFLECTED');
  eq(SF.projectSupplyLifecycle({ receivingFacts: [recvRow('r:2', 'reversed', 100)] }).entries[0].lifecycleBucket, 'CORRECTION_REVERSAL', 'S: receiving reversed → CORRECTION_REVERSAL');
  eq(SF.projectSupplyLifecycle({ correctionFacts: [corrRow('c:1', 100)] }).entries[0].lifecycleBucket, 'CORRECTION_REVERSAL', 'S: correction → CORRECTION_REVERSAL');
})();

// ==========================================================================
section('L. lifecycle — one 100-unit lineage at each stage (transition snapshots)');
(function () {
  function only(res, bucket) {
    var p = poolBucket(res, bucket);
    var activeBuckets = 0, keys = p ? Object.keys(p.byLifecycleBucket) : [];
    keys.forEach(function (b) { if (SF.ACTIVE_LIFECYCLE_BUCKETS[b]) activeBuckets++; });
    return { present: !!p, eff: p ? p.effectiveSupplyQty : null, activeBuckets: activeBuckets };
  }
  eq(only(SF.projectSupplyLifecycle({ committedProduction: [prodRow('L', 'issued', 100)] }), 'COMMITTED_PRODUCTION'), { present: true, eff: 100, activeBuckets: 1 }, 'L: COMMITTED_PRODUCTION 100, exactly one active bucket');
  eq(only(SF.projectSupplyLifecycle({ approvedShippingPlans: [planRow('L', 'approved', 100)] }), 'APPROVED_SHIPPING_PLAN'), { present: true, eff: 100, activeBuckets: 1 }, 'L: APPROVED_SHIPPING_PLAN 100');
  eq(only(SF.projectSupplyLifecycle({ shipments: shipments([shipInput('L', 'shipped', 100)]) }), 'SHIPPED_IN_TRANSIT'), { present: true, eff: 100, activeBuckets: 1 }, 'L: SHIPPED_IN_TRANSIT 100');
  eq(only(SF.projectSupplyLifecycle({ routeEvents: [eventRow('L', 'delivered', 100)] }), 'DELIVERED_NOT_RECEIVED'), { present: true, eff: 100, activeBuckets: 1 }, 'L: DELIVERED_NOT_RECEIVED 100');
  eq(only(SF.projectSupplyLifecycle({ receivingFacts: [recvRow('L', 'confirmed', 100)] }), 'RECEIVED_NOT_REFLECTED'), { present: true, eff: 100, activeBuckets: 1 }, 'L: RECEIVED_NOT_REFLECTED 100');
  eq(only(SF.projectSupplyLifecycle({ masterSku: 'CO1100-R', company: 'KM', currentStockFacts: [{ poolType: 'THREE_PL', warehouseId: 'WH1', quantity: 100, supplyLineageRef: 'L' }] }), 'CURRENT_STOCK'), { present: true, eff: 100, activeBuckets: 1 }, 'L: CURRENT_STOCK 100 (reuses Round 1J builder)');
})();

section('L. delivered ≠ current stock; received-not-reflected ≠ current stock');
(function () {
  var delivered = SF.projectSupplyLifecycle({ routeEvents: [eventRow('d', 'delivered', 100)] });
  eq([poolBucket(delivered, 'DELIVERED_NOT_RECEIVED') !== null, poolBucket(delivered, 'CURRENT_STOCK') === null], [true, true], 'L: delivered is DELIVERED_NOT_RECEIVED and NOT CURRENT_STOCK');
  var recv = SF.projectSupplyLifecycle({ receivingFacts: [recvRow('rr', 'confirmed', 100)] });
  eq([poolBucket(recv, 'RECEIVED_NOT_REFLECTED') !== null, poolBucket(recv, 'CURRENT_STOCK') === null], [true, true], 'L: received-not-reflected is distinct from CURRENT_STOCK');
})();

// ==========================================================================
section('C. count-once / conflict (buildSupplyLedger owns resolution)');
(function () {
  // exact duplicate dedup
  var dup = SF.projectSupplyLifecycle({ committedProduction: [prodRow('X', 'issued', 100), prodRow('X', 'issued', 100)] });
  eq([dup.status, poolBucket(dup, 'COMMITTED_PRODUCTION').effectiveSupplyQty], ['OK', 100], 'C: exact-duplicate same lineage/bucket/qty → deduped to 100');
  // same lineage across two active buckets → SUPPLY_LINEAGE_CONFLICT
  var xbucket = SF.projectSupplyLifecycle({ committedProduction: [prodRow('Y', 'issued', 100)], approvedShippingPlans: [planRow('Y', 'approved', 100)] });
  eq([xbucket.ready, xbucket.status, xbucket.reason], [false, 'BLOCKED_CONFLICT', 'SUPPLY_LINEAGE_CONFLICT'], 'C: one lineage in two active buckets → SUPPLY_LINEAGE_CONFLICT (fail-closed)');
  // same lineage same bucket different qty → PHYSICAL_POOL_QTY_CONFLICT
  var qtyc = SF.projectSupplyLifecycle({ committedProduction: [prodRow('Z', 'issued', 100), prodRow('Z', 'issued', 120)] });
  eq([qtyc.ready, qtyc.reason], [false, 'PHYSICAL_POOL_QTY_CONFLICT'], 'C: same lineage/bucket different qty → PHYSICAL_POOL_QTY_CONFLICT');
  // distinct lineages same pool → summed
  var summed = SF.projectSupplyLifecycle({ committedProduction: [prodRow('A', 'issued', 60), prodRow('B', 'issued', 40)] });
  eq([summed.status, poolBucket(summed, 'COMMITTED_PRODUCTION').effectiveSupplyQty], ['OK', 100], 'C: distinct lineages same pool → summed to 100');
  // excluded + active in same pool: DRAFT contributes 0, active counts
  var mix = SF.projectSupplyLifecycle({ committedProduction: [prodRow('act', 'issued', 100)], approvedShippingPlans: [planRow('drf', 'draft', 999)] });
  eq(mix.ledger.totalEffectiveSupplyQty, 100, 'C: excluded DRAFT (999) contributes 0; only active 100 counts');
  // conflict propagates through the REAL ledger (blockedCount)
  eq(xbucket.ledger.blockedCount, 1, 'C: pool conflict surfaced by the real buildSupplyLedger (blockedCount=1)');
})();

// ==========================================================================
section('Q. Qualified Incoming integration (real modules, not bypassed)');
(function () {
  // eligible shipment counted once
  var one = SF.projectSupplyLifecycle({ shipments: shipments([shipInput('Q1', 'shipped', 200)]) });
  eq([one.entries.length, one.entries[0].supplyLineageRef, one.entries[0].quantity], [1, 'shipment:Q1:Q1-L1', 200], 'Q: eligible shipment → one SHIPPED_IN_TRANSIT entry with canonical lineageKey');
  // posted-to-current-stock evidence → shipment lineage skipped (count-once owned elsewhere)
  var posted = SF.projectSupplyLifecycle({ shipments: shipments([shipInput('Q2', 'shipped', 100)], { postedToCurrentStockLineageKeys: ['shipment:Q2:Q2-L1'] }) });
  eq([posted.entries.length, posted.issues.filter(function (x) { return x.reason.indexOf('COUNT_ONCE_OWNED_ELSEWHERE') === 0; }).length], [0, 1], 'Q: shipment already posted to current stock → skipped (Gate 9), no double count');
  // active-in-other-bucket evidence → skipped
  var other = SF.projectSupplyLifecycle({ shipments: shipments([shipInput('Q3', 'shipped', 100)], { activeOtherBucketLineageKeys: ['shipment:Q3:Q3-L1'] }) });
  eq(other.entries.length, 0, 'Q: shipment already in another active bucket → skipped (Gate 10)');
  // draft shipment excluded from active supply but visible as DRAFT (0 effective)
  var draft = SF.projectSupplyLifecycle({ shipments: shipments([shipInput('Q4', 'draft', 100)]) });
  eq([draft.entries[0].lifecycleBucket, draft.ledger.totalEffectiveSupplyQty], ['DRAFT', 0], 'Q: draft shipment → DRAFT bucket, 0 effective supply');
  // absent shipment quantity: B4-R3 (the reused quantity authority) normalizes absent → explicit 0, so the
  // projector emits a 0-qty entry (visible, contributes 0) — it does NOT re-derive quantity (§11 no-duplication).
  var noqty = SF.projectSupplyLifecycle({ shipments: shipments([{ shipment: { shipmentId: 'Q5', company: 'KM', country: 'US', marketplace: 'Amazon', eta: '2026-08-15', status: 'shipped', destinationWarehouseId: 'WH1' }, line: { shipmentLineId: 'Q5-L1', sku: 'CO1100-R' } }]) });
  eq([noqty.entries.length, noqty.entries[0].quantity, noqty.ledger.totalEffectiveSupplyQty], [1, 0, 0], 'Q: absent shipment qty → B4-R3 explicit 0 entry, 0 effective (projector does not re-derive qty)');
  // delivered-not-received (arrived) remains incoming, not current stock
  var arrived = SF.projectSupplyLifecycle({ shipments: shipments([shipInput('Q6', 'arrived', 100)]) });
  eq([poolBucket(arrived, 'SHIPPED_IN_TRANSIT') !== null, poolBucket(arrived, 'CURRENT_STOCK') === null], [true, true], 'Q: arrived shipment → SHIPPED_IN_TRANSIT (F1-3a SC-11.4-B), still incoming (not current stock)');
})();

// ==========================================================================
section('M. missing / zero / invalid');
(function () {
  // explicit zero is valid + visible
  var zero = SF.projectSupplyLifecycle({ committedProduction: [prodRow('z', 'issued', 0)] });
  eq([zero.entries.length, zero.entries[0].quantity, zero.ledger.totalEffectiveSupplyQty], [1, 0, 0], 'M: explicit 0 → valid visible entry, 0 effective');
  // missing quantity → issue
  eq(SF.projectSupplyLifecycle({ committedProduction: [{ supplyLineageRef: 'm', company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', status: 'issued' }] }).entries.length, 0, 'M: missing quantity → no entry');
  // blank quantity → issue
  eq(SF.projectSupplyLifecycle({ committedProduction: [prodRow('b', 'issued', '')] }).entries.length, 0, 'M: blank quantity → no entry (missing, never 0)');
  // negative → fail-closed issue (no throw)
  var neg = SF.projectSupplyLifecycle({ committedProduction: [prodRow('n', 'issued', -5)] });
  eq([neg.entries.length, neg.issues[0].reason.indexOf('NEGATIVE_QUANTITY') === 0], [0, true], 'M: negative quantity → issue, no throw');
  // NaN / Infinity → treated as missing → issue
  eq(SF.projectSupplyLifecycle({ committedProduction: [prodRow('nan', 'issued', NaN)] }).entries.length, 0, 'M: NaN quantity → no entry');
  eq(SF.projectSupplyLifecycle({ committedProduction: [prodRow('inf', 'issued', Infinity)] }).entries.length, 0, 'M: Infinity quantity → no entry');
  // missing identity fields
  eq(SF.projectSupplyLifecycle({ committedProduction: [{ company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: 5, status: 'issued' }] }).issues[0].reason, 'MISSING_SUPPLY_LINEAGE_REF', 'M: missing lineage ref → issue');
  eq(SF.projectSupplyLifecycle({ committedProduction: [{ supplyLineageRef: 'x', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: 5, status: 'issued' }] }).issues[0].reason, 'MISSING_COMPANY', 'M: missing company → issue');
  eq(SF.projectSupplyLifecycle({ committedProduction: [{ supplyLineageRef: 'x', company: 'KM', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: 5, status: 'issued' }] }).issues[0].reason, 'MISSING_MASTER_SKU', 'M: missing masterSku → issue');
  eq(SF.projectSupplyLifecycle({ committedProduction: [{ supplyLineageRef: 'x', company: 'KM', masterSku: 'CO1100-R', poolType: 'THREE_PL', quantity: 5, status: 'issued' }] }).issues[0].reason, 'MISSING_WAREHOUSE_ID', 'M: missing warehouseId → issue');
  // unknown poolType → issue
  eq(SF.projectSupplyLifecycle({ committedProduction: [{ supplyLineageRef: 'x', company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'MARS', quantity: 5, status: 'issued' }] }).issues[0].reason, 'UNKNOWN_POOL_TYPE:MARS', 'M: unknown poolType → issue');
  // malformed structural input → TypeError
  throwsType(function () { SF.projectSupplyLifecycle(null); }, 'M: null input → TypeError');
  throwsType(function () { SF.projectSupplyLifecycle({ committedProduction: [42] }); }, 'M: non-object row → TypeError');
  throwsType(function () { SF.projectSupplyLifecycle({ committedProduction: 'nope' }); }, 'M: non-array collection → TypeError');
})();

// ==========================================================================
section('P. determinism / purity');
(function () {
  var input = { committedProduction: [prodRow('A', 'issued', 60), prodRow('B', 'issued', 40)], approvedShippingPlans: [planRow('P', 'approved', 10)] };
  var snapshot = JSON.stringify(input);
  var r1 = SF.projectSupplyLifecycle(input);
  ok(JSON.stringify(input) === snapshot, 'P: input not mutated');
  var r2 = SF.projectSupplyLifecycle(input);
  eq(r1, r2, 'P: repeat call deep-equal (deterministic)');
  ok(r1 !== r2 && r1.entries !== r2.entries, 'P: fresh result objects each call');
  // permutation invariance
  var permuted = { approvedShippingPlans: [planRow('P', 'approved', 10)], committedProduction: [prodRow('B', 'issued', 40), prodRow('A', 'issued', 60)] };
  eq(SF.projectSupplyLifecycle(permuted).entries, r1.entries, 'P: permuted input → identical sorted entries');
  eq(SF.projectSupplyLifecycle(permuted).ledger.totalEffectiveSupplyQty, r1.ledger.totalEffectiveSupplyQty, 'P: permuted input → identical ledger total');
  // mutating output does not affect later calls
  r1.entries.push({ tampered: true });
  eq(SF.projectSupplyLifecycle(input).entries.length, 3, 'P: mutating a prior result does not leak into a fresh call');
  // no Sheet objects / lineage stable-sorted
  eq(r1.lineage.slice().sort(), r1.lineage, 'P: lineage is stable-sorted');
})();

// ==========================================================================
// ==========================================================================
section('F1-3a. arrived SC-11.4-B/C conformance (canonical bridge; no formula change)');
(function () {
  // A. raw arrived (no delivery event, no receiving fact) → SHIPPED_IN_TRANSIT; never DELIVERED/RECEIVED/CURRENT_STOCK
  var a = SF.projectSupplyLifecycle({ shipments: shipments([shipInput('A1', 'arrived', 100)]) });
  eq([poolBucket(a, 'SHIPPED_IN_TRANSIT') !== null, poolBucket(a, 'DELIVERED_NOT_RECEIVED') === null, poolBucket(a, 'RECEIVED_NOT_REFLECTED') === null, poolBucket(a, 'CURRENT_STOCK') === null],
     [true, true, true, true], 'F1-3a.A arrived → SHIPPED_IN_TRANSIT; raw arrived alone never creates DELIVERED/RECEIVED/CURRENT_STOCK');
  // B. delivery authority stays explicit: a canonical route delivery event still → DELIVERED_NOT_RECEIVED
  eq(poolBucket(SF.projectSupplyLifecycle({ routeEvents: [eventRow('B1', 'delivered', 100)] }), 'DELIVERED_NOT_RECEIVED') !== null, true, 'F1-3a.B canonical delivery-event authority still → DELIVERED_NOT_RECEIVED (unchanged)');
  // C. receiving authority stays explicit: a canonical receiving fact still → RECEIVED_NOT_REFLECTED
  eq(poolBucket(SF.projectSupplyLifecycle({ receivingFacts: [recvRow('C1', 'confirmed', 100)] }), 'RECEIVED_NOT_REFLECTED') !== null, true, 'F1-3a.C canonical receiving authority still → RECEIVED_NOT_REFLECTED (unchanged)');
  // D. quantity neutrality: only the bucket label changed; effective supply is still 100 (no formula change)
  eq(a.ledger.totalEffectiveSupplyQty, 100, 'F1-3a.D quantity-neutral: arrived qty 100 unchanged by the bucket correction');
  // E. Current Stock unchanged: inventory snapshot → CURRENT_STOCK directly (not via the shipment arrived path)
  var cs = SF.projectSupplyLifecycle({ masterSku: 'CO1100-R', company: 'KM', currentStockFacts: [{ poolType: 'THREE_PL', warehouseId: 'WH1', quantity: 100, supplyLineageRef: 'E-stk' }] });
  eq([poolBucket(cs, 'CURRENT_STOCK') !== null, cs.ledger.totalEffectiveSupplyQty], [true, 100], 'F1-3a.E Current Stock path unchanged (inventory → CURRENT_STOCK, 100)');
  // F. external quarantine unchanged: an external authority result contributes 0 + is never emitted as a supply entry
  var ext = SF.projectSupplyLifecycle({ shipments: shipments([shipInput('F1', 'shipped', 100)], { externalResults: [{ adapterType: 'EXTERNAL_INCOMING_AUTHORITY', planningEligible: false, adapterEligibleQuantity: 0, observedQuantity: 100, stateClass: 'QUARANTINED_UNLINKED', linkedEvidence: false, quarantined: true, adoptedToKm: false, requiresHumanReview: true, exclusionReasons: [], reviewReasons: [], candidate: { sku: 'CO1100-R' } }] }) });
  eq([ext.entries.length, ext.ledger.totalEffectiveSupplyQty], [1, 100], 'F1-3a.F external quarantine unchanged: external contributes 0 (only the KM shipment 100 counts, one entry)');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1K Supply Lifecycle source-projection assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
