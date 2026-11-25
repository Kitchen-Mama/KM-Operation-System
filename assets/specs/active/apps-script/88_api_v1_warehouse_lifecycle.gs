// Read-only warehouse lifecycle joins. Physical balances remain owned by their stock ledgers.
var FIW_BUILD_VERSION_ = 'WAREHOUSE-LIFECYCLE-20261125-V1';
var WIL_SHIPPING_TABLES_ = [
  { name: 'shipments', requiredCols: ['shipment_id', 'status'] },
  { name: 'shipment_lines', requiredCols: ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty'] },
  { name: 'shipping_plans', requiredCols: ['shipping_plan_id'], optional: true },
  { name: 'shipping_plan_lines', requiredCols: ['shipping_plan_line_id'], optional: true },
  { name: 'shipment_plan_links', requiredCols: [], optional: true }
];
function wilStr_(v) { return String(v == null ? '' : v).trim(); }
function wilStatus_(v) { return wilStr_(v).toLowerCase(); }
function wilQty_(v) {
  if (v === '' || v == null || typeof v === 'boolean') return null;
  var n = Number(v); return isFinite(n) && n >= 0 && Math.floor(n) === n ? n : null;
}
function wilKey_(w, s) { return JSON.stringify([wilStr_(w), wilStr_(s)]); }
function wilIndex_(rows, field) {
  var out = Object.create(null);
  (rows || []).forEach(function (r) {
    var id = wilStr_(r[field]);
    if (!id || out[id]) throw new Error('WAREHOUSE_LIFECYCLE_DUPLICATE_OR_MISSING_ID:' + field + ':' + id);
    out[id] = r;
  });
  return out;
}
function wilFactory_(w) {
  return !!w && (oswTrue_(w.is_factory_warehouse) || /^(factory|factory_warehouse)$/i.test(wilStr_(w.warehouse_type)));
}
function wilRow_(map, w, s) {
  var k = wilKey_(w, s);
  if (!map[k]) map[k] = { warehouseId: wilStr_(w), sku: wilStr_(s), inProduction: 0,
    pendingShipout: 0, onTheWayQty: 0, issues: [], shipments: [], purchaseOrders: [] };
  return map[k];
}
function wilIssue_(row, metric, reason) {
  row[metric] = null;
  if (row.issues.indexOf(reason) < 0) row.issues.push(reason);
}
function wilAdd_(row, metric, qty) { if (row[metric] !== null) row[metric] += qty; }
function wilShipping_(t) {
  if (typeof KMSLS === 'undefined') throw new Error('WAREHOUSE_LIFECYCLE_SHIPMENT_OWNER_UNAVAILABLE');
  wilIndex_(t.shipments, 'shipment_id'); wilIndex_(t.shipment_lines, 'shipment_line_id');
  var links = Object.create(null);
  (t.shipment_plan_links || []).forEach(function (r) {
    if (/^(cancelled|canceled|removed|deleted|inactive)$/i.test(wilStr_(r.status || r.link_status))) return;
    var id = wilStr_(r.shipment_id); if (id) links[id] = (links[id] || 0) + 1;
  });
  var built = KMSLS.buildShipmentLineCandidates({ shipments: t.shipments, shipmentLines: t.shipment_lines,
    shippingPlans: t.shipping_plans, shippingPlanLines: t.shipping_plan_lines,
    shipmentLinkCountById: links, includeDisplayOnlyOpening: true });
  built.issues.forEach(function (i) {
    if (/^(SHIPMENT_NOT_FOUND:|MALFORMED_LINE)/.test(i.reason)) throw new Error('WAREHOUSE_LIFECYCLE_' + i.reason);
  });
  return built;
}
function wilBuildOverseas_(t) {
  var wh = wilIndex_(t.warehouses, 'warehouse_id'), map = Object.create(null), issues = [];
  var ships = wilIndex_(t.shipments, 'shipment_id');
  var stockWarehouses = Object.create(null);
  (t.overseas_inventory_snapshot || []).forEach(function (r) { stockWarehouses[wilStr_(r.warehouse_id)] = true; });
  (t.overseas_inventory_snapshot || []).forEach(function (r) {
    if (map[wilKey_(r.warehouse_id, r.sku)]) throw new Error('WAREHOUSE_LIFECYCLE_DUPLICATE_OVERSEAS_STOCK');
    wilRow_(map, r.warehouse_id, r.sku);
  });
  var built = wilShipping_(t);
  var incoming = { shipped: 1, in_transit: 1, arrived: 1, delivered: 1, partial_received: 1, partially_received: 1 };
  built.candidates.forEach(function (entry) {
    var c = entry.candidate, sh = ships[c.linkedShipmentId], st = wilStatus_(entry.shipmentStatus);
    if (/^(draft|ready_to_ship|received|closed|completed|cancelled|canceled)$/.test(st)) return;
    // A legacy source warehouse must NEVER be treated as an inbound destination.
    var wid = c.destinationIdentitySource === 'LEGACY_WAREHOUSE_ID_FALLBACK' ? '' : wilStr_(c.destinationWarehouseId);
    var w = wh[wid];
    if (!w || wilFactory_(w)) {
      // Platform shipments without overseas stock are outside this workspace, unresolved identities are not.
      if (!w) issues.push('UNRESOLVED_DESTINATION:' + c.linkedShipmentId + ':' + c.linkedShipmentLineId);
      return;
    }
    if (!stockWarehouses[wid] && !oswTrue_(w.is_overseas_warehouse) && !/^(3pl|overseas|overseas_warehouse)$/i.test(wilStr_(w.warehouse_type))) return;
    var row = wilRow_(map, wid, c.sku);
    if (!incoming[st]) { wilIssue_(row, 'onTheWayQty', 'UNKNOWN_SHIPMENT_STATUS:' + c.linkedShipmentId); return; }
    if (!wilStr_(w.company) || wilStatus_(w.company) !== wilStatus_(entry.headerScope.company)) {
      wilIssue_(row, 'onTheWayQty', 'SHIPMENT_WAREHOUSE_COMPANY_MISMATCH:' + c.linkedShipmentId); return;
    }
    if ((c.reviewFlags || []).some(function (f) { return /^(INVALID_QUANTITY|INVALID_RECEIVED_QUANTITY|RECEIVED_EXCEEDS_SHIPPED)$/.test(f); }) || wilQty_(c.quantityRemaining) === null) {
      wilIssue_(row, 'onTheWayQty', 'INVALID_SHIPMENT_QUANTITY:' + c.linkedShipmentLineId); return;
    }
    if (!c.quantityRemaining) return;
    wilAdd_(row, 'onTheWayQty', c.quantityRemaining);
    row.shipments.push({ shipmentId: c.linkedShipmentId, shipmentNo: sh.shipment_no || c.linkedShipmentId,
      shipmentLineId: c.linkedShipmentLineId, quantity: c.quantityRemaining, eta: sh.eta || null });
    if (!sh.eta) row.issues.push('MISSING_ETA:' + c.linkedShipmentId);
  });
  built.issues.forEach(function (i) {
    if (i.reason === 'LINE_REMOVED') return;
    var l = (t.shipment_lines || [])[i.i], sh = l && ships[l.shipment_id];
    if (!sh || !incoming[wilStatus_(sh.status)]) return;
    var w = wh[wilStr_(sh.destination_warehouse_id)];
    if (w && !wilFactory_(w)) wilIssue_(wilRow_(map, w.warehouse_id, l.sku), 'onTheWayQty', i.reason);
    issues.push(i.reason);
  });
  return { version: FIW_BUILD_VERSION_, source: 'SHIPMENT_UNRECEIVED', rows: Object.keys(map).map(function (k) { return map[k]; }), issues: issues };
}
function wilBuildFactory_(t) {
  var wh = wilIndex_(t.warehouses, 'warehouse_id'), po = wilIndex_(t.purchase_orders, 'purchase_order_id');
  var ships = wilIndex_(t.shipments, 'shipment_id'), map = Object.create(null), stocks = Object.create(null);
  wilIndex_(t.purchase_order_lines, 'purchase_order_line_id');
  (t.factory_stock || []).forEach(function (s) {
    var k = wilKey_(s.warehouse_id, s.sku);
    if (stocks[k]) throw new Error('WAREHOUSE_LIFECYCLE_DUPLICATE_FACTORY_STOCK:' + k);
    stocks[k] = s; wilRow_(map, s.warehouse_id, s.sku);
  });
  var open = { issued: 1, confirmed: 1, in_production: 1, partial_completed: 1, partial_shipped: 1, ready_to_ship: 1 };
  (t.purchase_order_lines || []).forEach(function (l) {
    var h = po[wilStr_(l.purchase_order_id)];
    if (!h) throw new Error('WAREHOUSE_LIFECYCLE_ORPHAN_PO_LINE:' + l.purchase_order_line_id);
    var st = wilStatus_(h.order_status);
    if (/^(draft|completed|shipped|cancelled|canceled|closure|closed)$/.test(st) || /^(cancelled|canceled|removed|deleted|inactive|closed|closure)$/.test(wilStatus_(l.line_status))) return;
    if (!wilFactory_(wh[wilStr_(h.warehouse_id)]) || !wilStr_(l.sku)) throw new Error('WAREHOUSE_LIFECYCLE_PO_FACTORY_UNRESOLVED:' + h.purchase_order_id);
    var r = wilRow_(map, h.warehouse_id, l.sku), ordered = wilQty_(l.ordered_qty), done = wilQty_(l.completed_qty);
    if (!open[st]) { wilIssue_(r, 'inProduction', 'UNKNOWN_PO_STATUS:' + h.purchase_order_id); return; }
    if (ordered === null || done === null || done > ordered) { wilIssue_(r, 'inProduction', 'INVALID_PO_QUANTITY:' + l.purchase_order_line_id); return; }
    // Production is ordered minus completed, NOT PO remaining-to-ship or historical shipped counters.
    wilAdd_(r, 'inProduction', ordered - done);
    if (ordered > done) r.purchaseOrders.push({ purchaseOrderId: h.purchase_order_id, poNo: h.po_no, quantity: ordered - done });
  });
  var built = wilShipping_(t);
  built.candidates.forEach(function (e) {
    var c = e.candidate, h = ships[c.linkedShipmentId], st = wilStatus_(e.shipmentStatus);
    if (st !== 'draft' && st !== 'ready_to_ship') return;
    if (wilStr_(h.record_origin) === 'IMPORT_HISTORICAL') return;
    var wid = wilStr_(h.source_warehouse_id);
    if (!wilFactory_(wh[wid])) return;
    var r = wilRow_(map, wid, c.sku);
    if (wilQty_(c.quantityOriginal) === null || c.quantityReceived !== 0 || (c.reviewFlags || []).some(function (f) { return /^(INVALID_QUANTITY|INVALID_RECEIVED_QUANTITY|RECEIVED_EXCEEDS_SHIPPED)$/.test(f); })) {
      wilIssue_(r, 'pendingShipout', 'INVALID_DRAFT_QUANTITY:' + c.linkedShipmentLineId); return;
    }
    wilAdd_(r, 'pendingShipout', c.quantityOriginal);
    r.shipments.push({ shipmentId: c.linkedShipmentId, shipmentNo: h.shipment_no, quantity: c.quantityOriginal });
  });
  built.issues.forEach(function (i) {
    if (i.reason === 'LINE_REMOVED') return;
    var l = (t.shipment_lines || [])[i.i], h = l && ships[l.shipment_id];
    if (h && /^(draft|ready_to_ship)$/.test(wilStatus_(h.status)) && wilFactory_(wh[wilStr_(h.source_warehouse_id)])) {
      wilIssue_(wilRow_(map, h.source_warehouse_id, l.sku), 'pendingShipout', i.reason);
    }
  });
  Object.keys(map).forEach(function (k) {
    var r = map[k], s = stocks[k], reserved = s ? wilQty_(s.fac_reserved_stock) : 0;
    if (reserved === null || r.pendingShipout !== reserved) wilIssue_(r, 'pendingShipout', 'FACTORY_RESERVATION_RECONCILIATION_REQUIRED');
  });
  return { version: FIW_BUILD_VERSION_, source: 'PO_PRODUCTION_AND_SHIPMENT_RESERVATIONS', rows: Object.keys(map).map(function (k) { return map[k]; }) };
}
function handleFactoryInventoryWorkspaceGet_(body, io) {
  io = io || oswWorkspaceDefaultIo_();
  try {
    var ss = io.openTarget(), t = {}, specs = [
      { name: 'factory_stock', requiredCols: ['warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock'] },
      { name: 'warehouses', requiredCols: ['warehouse_id'] },
      { name: 'sku_details', requiredCols: ['sku'] },
      { name: 'sku_regional_details', requiredCols: [], optional: true },
      { name: 'purchase_orders', requiredCols: ['purchase_order_id', 'warehouse_id', 'order_status'] },
      { name: 'purchase_order_lines', requiredCols: ['purchase_order_line_id', 'purchase_order_id', 'sku', 'ordered_qty', 'completed_qty'] }
    ].concat(WIL_SHIPPING_TABLES_);
    specs.forEach(function (spec) {
      var rows = io.readTable(ss, spec.name, spec.requiredCols, !!spec.optional);
      if (rows.length > OSW_WS_ROW_MAX_) throw new Error('WAREHOUSE_LIFECYCLE_ROW_LIMIT:' + spec.name);
      t[spec.name] = rows;
    });
    return { success: true, data: { factory_stock: t.factory_stock, warehouses: t.warehouses,
      sku_details: oswProject_(t.sku_details, OSW_SKU_COLUMNS_),
      sku_regional_details: oswProject_(t.sku_regional_details, ['sku', 'site_sku']), lifecycle: wilBuildFactory_(t) },
      meta: { action: 'factoryInventory.workspace.get', build: FIW_BUILD_VERSION_, read_only: true, db_writes: 0, tablesRead: specs.length }, errors: [] };
  } catch (e) {
    return { success: false, data: null, meta: { action: 'factoryInventory.workspace.get', read_only: true, db_writes: 0 },
      errors: [{ code: 'FACTORY_LIFECYCLE_READ_FAILED', message: String(e.message || e) }] };
  }
}
