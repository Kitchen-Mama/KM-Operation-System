// Overseas Outbound — Origin Fulfillment Operation WORKSPACE (Preview Mode).
//
// Interactive operation workspace (list → drawer → lifecycle → SKU lines → movement impact), NOT a
// read-only field table. Runtime tables/handlers in OVERSEAS_OUTBOUND_SPEC.md are spec-only (not
// implemented), so the lifecycle runs in an in-memory session store — clearly badged Preview Mode —
// and no overseas_inventory_movements are posted (no reserve, no deduction). Selectors and the
// Movement/Inventory Impact panel read REAL data via KM.DB.
// Shared engine: assets/js/pages/overseas-ops-preview.js (KM.OverseasOps.createController).

(function () {
  'use strict';
  if (!(window.KM && window.KM.lifecycle && window.KM.OverseasOps)) {
    console.warn('[OverseasOutbound] KM.OverseasOps controller unavailable.');
    return;
  }

  var OO = window.KM.OverseasOps;

  var statusMeta = {
    draft: { label: 'Draft', tone: 'neutral' },
    locked: { label: 'Locked (Reserved)', tone: 'info' },
    submitted: { label: 'Instruction Submitted', tone: 'info' },
    acknowledged: { label: 'Acknowledged', tone: 'info' },
    picking: { label: 'Picking', tone: 'warn' },
    packed: { label: 'Packed', tone: 'warn' },
    ready_to_ship: { label: 'Ready to Ship', tone: 'warn' },
    shipped: { label: 'Shipped', tone: 'good' },
    closed: { label: 'Closed', tone: 'done' },
    cancelled: { label: 'Cancelled', tone: 'danger' }
  };

  var lifecycleSteps = ['draft', 'locked', 'submitted', 'acknowledged', 'picking', 'packed', 'ready_to_ship', 'shipped', 'closed'];

  var actions = [
    { id: 'lock', label: 'Lock & Reserve', from: ['draft'], to: 'locked', kind: 'lock' },
    { id: 'submit', label: 'Submit Instruction (WMS)', from: ['locked'], to: 'submitted', kind: 'submit' },
    { id: 'ack', label: 'Acknowledge (WMS)', from: ['submitted'], to: 'acknowledged', kind: 'ack' },
    { id: 'pick', label: 'Start Picking', from: ['acknowledged'], to: 'picking', kind: 'advance' },
    { id: 'pack', label: 'Mark Packed', from: ['picking'], to: 'packed', kind: 'advance' },
    { id: 'ready', label: 'Ready to Ship', from: ['packed'], to: 'ready_to_ship', kind: 'advance' },
    { id: 'shipConfirm', label: 'Ship Confirm (Dispatch)', from: ['ready_to_ship'], to: 'shipped', kind: 'ship' },
    { id: 'close', label: 'Close Operation', from: ['shipped'], to: 'closed', kind: 'advance' },
    { id: 'cancel', label: 'Cancel (Release Reserve)', from: ['draft', 'locked', 'submitted', 'acknowledged', 'picking', 'packed', 'ready_to_ship'], to: 'cancelled', kind: 'cancel' }
  ];

  function kpis(ops) {
    function cnt(fn) { return ops.filter(fn).length; }
    var requested = ops.reduce(function (a, o) { return a + o.lines.reduce(function (x, l) { return x + (l.plannedQty || 0); }, 0); }, 0);
    var reserved = ops.reduce(function (a, o) { return a + o.lines.reduce(function (x, l) { return x + (l.reservedQty || 0); }, 0); }, 0);
    var shipped = ops.reduce(function (a, o) { return a + o.lines.reduce(function (x, l) { return x + (l.shippedQty || 0); }, 0); }, 0);
    return [
      { label: 'Operations', value: OO.num(ops.length), tone: 'neutral' },
      { label: 'Draft', value: OO.num(cnt(function (o) { return o.status === 'draft'; })), tone: 'neutral' },
      { label: 'Reserved / In-progress', value: OO.num(cnt(function (o) { return ['locked', 'submitted', 'acknowledged', 'picking', 'packed', 'ready_to_ship'].indexOf(o.status) >= 0; })), tone: 'info' },
      { label: 'Shipped', value: OO.num(cnt(function (o) { return o.status === 'shipped'; })), tone: 'good' },
      { label: 'Closed', value: OO.num(cnt(function (o) { return o.status === 'closed'; })), tone: 'done' },
      { label: 'Requested units', value: OO.num(requested), tone: 'neutral' },
      { label: 'Reserved (preview)', value: OO.num(reserved), tone: 'info' },
      { label: 'Shipped (preview)', value: OO.num(shipped), tone: 'good' }
    ];
  }

  // Movement / Inventory Impact — projected ONLY. Lock moves available → reserved; Ship Confirm
  // deducts current_stock AND reserved_stock by the actual shipped qty (spec §7/§8). Nothing posted.
  function movementImpact(op) {
    var rows = [];
    var stage = op.status;
    var shippedTotal = op.lines.reduce(function (a, l) { return a + (l.shippedQty || 0); }, 0);
    var reserveStages = ['locked', 'submitted', 'acknowledged', 'picking', 'packed', 'ready_to_ship'];

    // Once actual shipped qty is entered (or the op is shipped/closed), preview the Ship Confirm
    // deduction: current_stock AND reserved_stock both decrease by the actual shipped qty (§7/§8).
    if (stage === 'shipped' || stage === 'closed' || shippedTotal > 0) {
      op.lines.forEach(function (l) {
        var shp = l.shippedQty || 0; if (shp <= 0) return;
        var snap = OO.snapshotAt(op.warehouseId, l.sku);
        var cur = snap ? snap.physicalStock : 0, reserved = snap ? snap.reservedStock : 0;
        rows.push({ sku: l.sku, bucket: 'current_stock', current: cur, delta: -shp, projected: cur - shp, missing: !snap });
        rows.push({ sku: l.sku, bucket: 'reserved_stock', current: reserved, delta: -shp, projected: reserved - shp, missing: !snap });
      });
      return { rows: rows, emptyText: 'No shipped quantity entered yet.', note: 'Projected Ship Confirm deduction (current_stock and reserved_stock both −shipped qty), keyed by confirmation_idempotency_key. Runtime handler NOT implemented — nothing is posted. Formal Shipment / Delivered never deducts; only a confirmed shipout does.' };
    }

    // Reserve projection (available → reserved) once Locked, before any actual shipout.
    if (reserveStages.indexOf(stage) >= 0) {
      op.lines.forEach(function (l) {
        var rsv = l.reservedQty || 0; if (rsv <= 0) return;
        var snap = OO.snapshotAt(op.warehouseId, l.sku);
        var avail = snap ? snap.availableStock : 0, reserved = snap ? snap.reservedStock : 0;
        rows.push({ sku: l.sku, bucket: 'available_stock', current: avail, delta: -rsv, projected: avail - rsv, missing: !snap });
        rows.push({ sku: l.sku, bucket: 'reserved_stock', current: reserved, delta: rsv, projected: reserved + rsv, missing: !snap });
      });
      return { rows: rows, emptyText: 'No reserved quantity.', note: 'Projected reserve (available → reserved) applied at Lock. Runtime handler NOT implemented — nothing is posted. Enter shipped quantities to preview the Ship Confirm deduction.' };
    }

    return { rows: [], emptyText: 'Reserve happens at Lock; deduction happens at Ship Confirm. Draft touches no inventory.', note: 'Draft never touches inventory (spec §2). Advance to Lock to preview the reserve, then enter shipped qty for the shipout deduction.' };
  }

  var controller = OO.createController({
    direction: 'outbound',
    sectionId: 'overseas-outbound-section',
    mountSelector: '#overseas-outbound-mount',
    partialUrl: 'assets/html/pages/overseas-outbound.html',
    partialKey: 'overseas-outbound',
    initialStatus: 'draft',
    plannedLabel: 'Requested units',
    actualLabel: 'Shipped',
    actualNoun: 'shipped',
    newOpLabel: '+ New Outbound Operation (Preview)',
    statusMeta: statusMeta,
    lifecycleSteps: lifecycleSteps,
    entryStatuses: ['picking', 'packed', 'ready_to_ship'],
    actions: actions,
    kpis: kpis,
    movementImpact: movementImpact
  });

  window.KM.lifecycle.register('overseas-outbound-section', controller);
})();
