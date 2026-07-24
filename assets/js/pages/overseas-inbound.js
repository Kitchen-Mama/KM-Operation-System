// Overseas Inbound — Destination Receiving Operation WORKSPACE (Preview Mode).
//
// This page is now a real, interactive operation workspace (list → drawer → lifecycle → SKU lines →
// movement impact), NOT a read-only field table. Because the runtime tables/handlers in
// OVERSEAS_INBOUND_SPEC.md §10 are spec-only (not implemented), the lifecycle runs in an in-memory
// session store — clearly badged Preview Mode — and no overseas_inventory_movements are posted.
// Selectors and the Movement/Inventory Impact panel read REAL data via KM.DB.
// Shared engine: assets/js/pages/overseas-ops-preview.js (KM.OverseasOps.createController).

(function () {
  'use strict';
  if (!(window.KM && window.KM.lifecycle && window.KM.OverseasOps)) {
    console.warn('[OverseasInbound] KM.OverseasOps controller unavailable.');
    return;
  }

  var OO = window.KM.OverseasOps;

  var statusMeta = {
    draft: { label: 'Draft', tone: 'neutral' },
    submitted: { label: 'Pre-Advice Submitted', tone: 'info' },
    acknowledged: { label: 'Acknowledged', tone: 'info' },
    receiving: { label: 'Receiving', tone: 'warn' },
    received: { label: 'Received', tone: 'good' },
    closed: { label: 'Closed', tone: 'done' },
    exception: { label: 'Exception', tone: 'danger' }
  };

  var lifecycleSteps = ['draft', 'submitted', 'acknowledged', 'receiving', 'received', 'closed'];

  var actions = [
    { id: 'submit', label: 'Submit Pre-Advice', from: ['draft'], to: 'submitted', kind: 'submit' },
    { id: 'ack', label: 'Acknowledge (WMS)', from: ['submitted'], to: 'acknowledged', kind: 'ack' },
    { id: 'startRecv', label: 'Start Receiving', from: ['acknowledged'], to: 'receiving', kind: 'advance' },
    { id: 'confirmRecv', label: 'Confirm Receipt', from: ['receiving'], to: 'received', kind: 'receive' },
    { id: 'reopen', label: 'Record Another Receipt', from: ['received'], to: 'receiving', kind: 'advance' },
    { id: 'close', label: 'Close Operation', from: ['received'], to: 'closed', kind: 'advance' },
    { id: 'cancel', label: 'Cancel', from: ['draft', 'submitted', 'acknowledged'], to: 'exception', kind: 'cancel' }
  ];

  function kpis(ops) {
    function cnt(fn) { return ops.filter(fn).length; }
    var expected = ops.reduce(function (a, o) { return a + o.lines.reduce(function (x, l) { return x + (l.plannedQty || 0); }, 0); }, 0);
    var received = ops.reduce(function (a, o) { return a + o.lines.reduce(function (x, l) { return x + (l.goodQty || 0); }, 0); }, 0);
    return [
      { label: 'Operations', value: OO.num(ops.length), tone: 'neutral' },
      { label: 'Draft / Pre-Advice', value: OO.num(cnt(function (o) { return o.status === 'draft' || o.status === 'submitted' || o.status === 'acknowledged'; })), tone: 'info' },
      { label: 'Receiving', value: OO.num(cnt(function (o) { return o.status === 'receiving'; })), tone: 'warn' },
      { label: 'Received', value: OO.num(cnt(function (o) { return o.status === 'received'; })), tone: 'good' },
      { label: 'Closed', value: OO.num(cnt(function (o) { return o.status === 'closed'; })), tone: 'done' },
      { label: 'Expected units', value: OO.num(expected), tone: 'neutral' },
      { label: 'Good received (preview)', value: OO.num(received), tone: 'good' }
    ];
  }

  // Movement / Inventory Impact — projected ONLY (nothing posted). Confirmed good qty would increase
  // overseas available_stock; damaged never increases sellable stock (spec §10.5/§10.6).
  function movementImpact(op) {
    var rows = [];
    var meaningful = ['receiving', 'received', 'closed'].indexOf(op.status) >= 0;
    if (meaningful) {
      op.lines.forEach(function (l) {
        var good = l.goodQty || 0, dmg = l.damagedQty || 0;
        if (good <= 0 && dmg <= 0) return;
        var snap = OO.snapshotAt(op.warehouseId, l.sku);
        var curAvail = snap ? snap.availableStock : 0;
        if (good > 0) rows.push({ sku: l.sku, bucket: 'available_stock', current: curAvail, delta: good, projected: curAvail + good, missing: !snap });
        if (dmg > 0) {
          var curDmg = snap ? snap.damagedStock : 0;
          rows.push({ sku: l.sku, bucket: 'damaged_stock', current: curDmg, delta: dmg, projected: curDmg + dmg, missing: !snap });
        }
      });
    }
    return {
      rows: rows,
      emptyText: meaningful ? 'No good/damaged quantity entered yet.' : 'Inventory changes only on confirmed receipt (Receiving stage). Delivered ≠ Received.',
      note: 'Projected against the current real overseas snapshot. On Confirm Receipt the runtime handler will post overseas_inventory_movements (good qty → available_stock) keyed by receipt_idempotency_key — NOT yet implemented, so nothing is posted here.'
    };
  }

  var controller = OO.createController({
    direction: 'inbound',
    sectionId: 'overseas-inbound-section',
    mountSelector: '#overseas-inbound-mount',
    partialUrl: 'assets/html/pages/overseas-inbound.html',
    partialKey: 'overseas-inbound',
    initialStatus: 'draft',
    plannedLabel: 'Expected units',
    actualLabel: 'Received (good)',
    actualNoun: 'received',
    newOpLabel: '+ New Inbound Operation (Preview)',
    statusMeta: statusMeta,
    lifecycleSteps: lifecycleSteps,
    entryStatuses: ['receiving'],
    actions: actions,
    kpis: kpis,
    movementImpact: movementImpact
  });

  window.KM.lifecycle.register('overseas-inbound-section', controller);
})();
