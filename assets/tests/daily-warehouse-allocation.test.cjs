'use strict';
const assert = require('node:assert/strict');
const A = require('../js/core/supply-planning-daily-warehouse-allocation');
const HP = require('../js/core/supply-planning-horizon-projection');
let checks = 0;
function eq(a, b) { assert.deepEqual(a, b); checks++; }
const base = { company: 'KM', country: 'US', sku: 'S', calculationDate: '2026-11-24' };
const d1 = '2026-11-25', d2 = '2026-11-26';
function receiver(key, priority, demand, warehouseIds = ['W']) {
  return { ...base, key, priority, warehouseIds, ownedOpeningQty: 0, ownedIncoming: [], demand };
}
function lot(qty, options = {}) { return { ...base, id: 'STOCK:W', warehouseId: 'W', qty, date: base.calculationDate, opening: true, ...options }; }
function run(receivers, lots) { const r = A.allocate({ ...base, receivers, lots }); eq(r.ready, true); return r; }
const demand = qty => [{ date: d1, qty }];
let result = run([receiver('a', 90, demand(10)), receiver('b', 105, demand(10))], [lot(12)]);
eq([result.bySite.a.openingQty, result.bySite.b.openingQty], [10, 2]);
result = run([receiver('a', 100, demand(20)), receiver('b', 100, demand(10))], [lot(12)]);
eq([result.bySite.a.openingQty, result.bySite.b.openingQty], [8, 4]);
result = run([receiver('a', 1, [{ date: d2, qty: 20 }]), receiver('b', 110, demand(20))], [lot(20)]);
eq([result.bySite.a.openingQty, result.bySite.b.openingQty], [0, 20]); // date before rank
result = run([receiver('a', 100, demand(10)), receiver('b', 100, demand(10), ['W', 'X'])], [
  lot(5), lot(15, { id: 'STOCK:X', warehouseId: 'X' })
]);
eq([result.bySite.a.openingQty, result.bySite.b.openingQty], [5, 10]);
eq(result.reconciliation.reduce((n, l) => n + l.unallocatedQty, 0), 5);
result = run([receiver('a', 1, demand(10))], [lot(100)]);
eq([result.bySite.a.openingQty, result.reconciliation[0].unallocatedQty], [10, 90]);
result = run([receiver('a', 1, [{ date: d1, qty: 10 }, { date: d2, qty: 10 }])], [
  lot(10, { id: 'SHIP', date: d2, opening: false, sourceType: 'SHIPMENT' })
]);
eq([result.bySite.a.openingQty, result.bySite.a.incoming[0].eta, result.bySite.a.incoming[0].qty], [0, d2, 10]);
const projection = HP.projectHorizons({ ...base, calculationDate: base.calculationDate, demandMode: 'sales_driven',
  avgSalesPerDay: 10, openingSupplyQty: 0, incomingEvents: result.bySite.a.incoming, unitsPerCarton: 1 });
eq(projection.horizons[0].gapQty, 170); // late supply never erases the first lost demand day
result = run([{ ...receiver('a', 1, demand(10)), ownedOpeningQty: 7 }, receiver('b', 1, demand(10))], [lot(13)]);
eq([result.bySite.a.openingQty, result.bySite.b.openingQty], [3, 10]);
result = run([{ ...receiver('a', 1, demand(10)), ownedIncoming: [{ incomingId: 'OWN', eta: d1, qty: 10 }] },
  receiver('b', 1, demand(10))], [lot(10)]);
eq([result.bySite.a.openingQty, result.bySite.b.openingQty], [0, 10]);
result = run([receiver('a', 1, demand(0.4)), receiver('b', 1, demand(0.4))], [lot(1)]);
eq([result.bySite.a.openingQty, result.bySite.b.openingQty], [1, 0]);
const fractional = [{ date: d1, qty: 0.4 }, { date: d2, qty: 0.4 }];
result = run([receiver('a', 1, fractional)], [lot(1), lot(1, { id: 'IN', opening: false, date: d2 })]);
eq(result.bySite.a.allocatedQty, 1);
for (const change of [
  { lots: [lot(null)] }, { lots: [lot(1.5)] }, { lots: [lot(1), lot(1)] },
  { lots: [lot(1, { company: 'OTHER' })] },
  { receivers: [receiver('a', 1, [{ date: '2027-02-23', qty: 1 }])] },
  { receivers: [receiver('a', -1, demand(10))] },
  { receivers: [receiver('a', 1, demand(NaN))] },
  { receivers: [receiver('a', 1, demand(10)), receiver('a', 1, demand(10))] }
]) eq(A.allocate({ ...base, lots: [lot(10)], receivers: [receiver('a', 1, demand(10))], ...change }).ready, false);
// Deterministic conservation sweep, fractional demand and overlapping eligibility.
for (let seed = 0; seed < 100; seed++) {
  const rr = ['a', 'b', 'c'].map((k, i) => receiver(k, (seed + i) % 2 ? 105.5 : 90,
    Array.from({ length: 90 }, (_, d) => ({ date: new Date(Date.parse(d1 + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10),
      qty: ((seed + i + d) % 17) / 7 })), i === 0 ? ['W'] : ['W', 'X']));
  const ll = [lot(seed * 3), lot(seed, { id: 'X', warehouseId: 'X' }),
    lot(seed + 1, { id: 'IN', opening: false, date: d2 })];
  const before = JSON.stringify({ rr, ll }), r = run(rr, ll);
  eq(r, A.allocate({ ...base, receivers: rr.slice().reverse(), lots: ll.slice().reverse() }));
  eq(JSON.stringify({ rr, ll }), before);
  for (const l of r.reconciliation) eq(l.allocatedQty + l.unallocatedQty, l.poolQty);
  for (const s of Object.values(r.bySite)) { assert(Number.isInteger(s.allocatedQty) && s.allocatedQty <= Math.ceil(s.exactQty + 1e-8)); checks++; }
}
console.log('DAILY_WAREHOUSE_ALLOCATION_PASS ' + checks);
