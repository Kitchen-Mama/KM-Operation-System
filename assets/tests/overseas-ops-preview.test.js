// Overseas Inbound / Outbound — Preview workspace logic regression test (pure Node, no DOM).
// Mirrors the lifecycle transition + projected movement-impact math implemented in
// assets/js/pages/overseas-inbound.js / overseas-outbound.js (createController engine). Asserts the
// PREVIEW never fabricates a posted movement and the projections match the spec (§10.5/§10.6 inbound,
// §7/§8 outbound). Run: node assets/tests/overseas-ops-preview.test.js

var failures = 0;
function eq(actual, expected, label) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.error('FAIL ' + label + '\n  expected ' + e + '\n  actual   ' + a); }
  else { console.log('ok   ' + label); }
}

// --- inbound projected impact (good → available_stock; damaged → damaged_stock) ---
function inboundImpact(status, snap, line) {
  var meaningful = ['receiving', 'received', 'closed'].indexOf(status) >= 0;
  var rows = [];
  if (meaningful) {
    var good = line.goodQty || 0, dmg = line.damagedQty || 0;
    if (good > 0) { var a = snap ? snap.availableStock : 0; rows.push({ bucket: 'available_stock', current: a, delta: good, projected: a + good, missing: !snap }); }
    if (dmg > 0) { var d = snap ? snap.damagedStock : 0; rows.push({ bucket: 'damaged_stock', current: d, delta: dmg, projected: d + dmg, missing: !snap }); }
  }
  return rows;
}

eq(inboundImpact('receiving', { availableStock: 100, damagedStock: 0 }, { goodQty: 40, damagedQty: 5 }),
   [{ bucket: 'available_stock', current: 100, delta: 40, projected: 140, missing: false },
    { bucket: 'damaged_stock', current: 0, delta: 5, projected: 5, missing: false }],
   'inbound receiving: good 40 → available 140, damaged 5 → 5');

eq(inboundImpact('acknowledged', { availableStock: 100, damagedStock: 0 }, { goodQty: 40, damagedQty: 5 }),
   [], 'inbound Delivered≠Received: no movement before Receiving stage');

eq(inboundImpact('received', null, { goodQty: 12, damagedQty: 0 }),
   [{ bucket: 'available_stock', current: 0, delta: 12, projected: 12, missing: true }],
   'inbound missing snapshot: current 0 + missing flag');

// --- outbound projected impact: Lock (available→reserved) / Ship (current & reserved −shipped) ---
function outboundReserve(snap, reservedQty) {
  if (reservedQty <= 0) return [];
  var a = snap ? snap.availableStock : 0, r = snap ? snap.reservedStock : 0;
  return [
    { bucket: 'available_stock', current: a, delta: -reservedQty, projected: a - reservedQty, missing: !snap },
    { bucket: 'reserved_stock', current: r, delta: reservedQty, projected: r + reservedQty, missing: !snap }
  ];
}
function outboundShip(snap, shippedQty) {
  if (shippedQty <= 0) return [];
  var c = snap ? snap.physicalStock : 0, r = snap ? snap.reservedStock : 0;
  return [
    { bucket: 'current_stock', current: c, delta: -shippedQty, projected: c - shippedQty, missing: !snap },
    { bucket: 'reserved_stock', current: r, delta: -shippedQty, projected: r - shippedQty, missing: !snap }
  ];
}

eq(outboundReserve({ availableStock: 200, reservedStock: 10 }, 30),
   [{ bucket: 'available_stock', current: 200, delta: -30, projected: 170, missing: false },
    { bucket: 'reserved_stock', current: 10, delta: 30, projected: 40, missing: false }],
   'outbound lock: reserve 30 (available 200→170, reserved 10→40)');

eq(outboundShip({ physicalStock: 200, reservedStock: 40 }, 30),
   [{ bucket: 'current_stock', current: 200, delta: -30, projected: 170, missing: false },
    { bucket: 'reserved_stock', current: 40, delta: -30, projected: 10, missing: false }],
   'outbound ship confirm: deduct 30 from current AND reserved');

eq(outboundReserve({ availableStock: 200, reservedStock: 10 }, 0), [], 'outbound draft: no reserve → no movement');

// --- lifecycle transition guards ---
var inboundActions = {
  submit: { from: ['draft'], to: 'submitted' },
  confirmRecv: { from: ['receiving'], to: 'received' },
  close: { from: ['received'], to: 'closed' }
};
function canRun(actions, id, status) { return actions[id] && actions[id].from.indexOf(status) >= 0; }
eq(canRun(inboundActions, 'confirmRecv', 'draft'), false, 'inbound: cannot Confirm Receipt from draft');
eq(canRun(inboundActions, 'confirmRecv', 'receiving'), true, 'inbound: Confirm Receipt allowed from receiving');
eq(canRun(inboundActions, 'close', 'received'), true, 'inbound: Close allowed from received');

var outboundActions = {
  lock: { from: ['draft'], to: 'locked' },
  shipConfirm: { from: ['ready_to_ship'], to: 'shipped' }
};
eq(canRun(outboundActions, 'shipConfirm', 'locked'), false, 'outbound: cannot Ship Confirm before ready_to_ship');
eq(canRun(outboundActions, 'shipConfirm', 'ready_to_ship'), true, 'outbound: Ship Confirm allowed from ready_to_ship');

// --- over/short reconciliation (inbound line) ---
function overShort(planned, good, dmg) { return (good + dmg) - planned; }
eq(overShort(100, 100, 0), 0, 'inbound over/short: exact = 0');
eq(overShort(100, 90, 0), -10, 'inbound over/short: short = -10');
eq(overShort(100, 100, 5), 5, 'inbound over/short: over (incl damaged) = +5');

console.log('\n' + (failures ? (failures + ' FAILURE(S)') : 'ALL PASS'));
process.exit(failures ? 1 : 0);
