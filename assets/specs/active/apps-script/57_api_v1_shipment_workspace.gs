/**
 * 57_api_v1_shipment_workspace.gs
 * Kitchen Mama Operation System — API v1 · Shipment READ-ONLY Workspace (Phase API / F1-7F).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped read owner for the active Shipment surfaces:
 *   - shipping-history.js  (Shipment Draft + Shipment Overview)
 *   - global-logistics-map.js  (On-the-Way Map)
 * Action = "shipment.workspace.get" (a body-carrying READ, no write).
 *
 * Contract (identical discipline to 40_/50_/51_):
 *   - reads ONLY the Shipment table set (never getOperationDb). BASE tables (shipments, shipment_lines, warehouses,
 *     carrier_rate_cards) serve the Draft/Overview page; the On-the-Way MAP tables (shipment_routes, shipment_events,
 *     logistics_locations, shipment_route_templates, shipment_route_template_nodes) are returned ONLY when the caller
 *     sets the matching include flag (bounded includes, not broad loading);
 *   - one server execution: open+validate the bound Spreadsheet ONCE, read each requested table ONCE, return ONE bounded
 *     page-oriented View Model (raw passthrough per row so a page adapter reproduces the existing render byte-for-byte
 *     via the SAME db-api normalizers);
 *   - preserves S0/S0.5 (exact Spreadsheet-ID gate, validate-only presence). BASE tables fail-closed on missing schema;
 *     the MAP-extra tables are read missing-safe (a sparse/absent route/event tab → [] , matching the browser getters);
 *   - authors NO business logic. It does NOT run FIFO, does NOT reconstruct shipment_line_allocations, does NOT compute
 *     PO shipped_qty/remaining, does NOT deduct factory stock, does NOT own receipt qty. shipment_qty / shipment_received_qty
 *     and every route/event coord are passed through verbatim (canonical persisted facts). The FRONTEND display facts
 *     (received/remaining sums, derivedReceiptStatus, attention buckets) stay presentation-side.
 *
 * Testability: pure `shipWorkspaceBuild_` is a `function` declaration (extract+eval friendly). The impure orchestrator
 * `handleShipmentWorkspaceGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO SpreadsheetApp.
 */

var SHIP_WS_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

// BASE tables (Draft/Overview) — fail-closed on missing schema. MAP-extra tables (On-the-Way) — include-gated + missing-safe.
var SHIP_WORKSPACE_TABLES_ = [
  { name: 'shipments',                     requiredCols: ['shipment_id'] },
  { name: 'shipment_lines',                requiredCols: ['shipment_id'] },
  { name: 'warehouses',                    requiredCols: ['warehouse_id'] },
  { name: 'carrier_rate_cards',            requiredCols: [] },
  { name: 'shipment_routes',               requiredCols: [], optional: true, include: 'routes' },
  { name: 'shipment_events',               requiredCols: [], optional: true, include: 'events' },
  { name: 'logistics_locations',           requiredCols: [], optional: true, include: 'locations' },
  { name: 'shipment_route_templates',      requiredCols: [], optional: true, include: 'templates' },
  { name: 'shipment_route_template_nodes', requiredCols: [], optional: true, include: 'templates' }
];

var SHIP_WS_SORT_FIELDS_ = {
  'updated_at': 1, 'updatedAt': 1, 'status': 1, 'company': 1, 'country': 1, 'shipment_no': 1, 'shipmentNo': 1,
  'etd': 1, 'eta': 1, 'created_at': 1, 'createdAt': 1
};

// Both pages filter/paginate client-side (Draft/Overview lists; the global map reads all), so the client requests one
// large page — the workspace's win is table SCOPE (9 tables, never the 44-tab getOperationDb), not server pagination.
var SHIP_WS_PAGE_MAX_ = 3000;
var SHIP_WS_PAGE_DEFAULT_ = 500;

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock / no Spreadsheet)
// --------------------------------------------------------------------------------------------------------
function shipWsStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function shipWsNum_(v) { if (v === '' || v === null || v === undefined) return 0; var n = Number(v); return isFinite(n) ? n : 0; }
function shipWsLc_(v) { return shipWsStr_(v).toLowerCase(); }

function shipBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'shipment.workspace.get', workspace: 'shipment', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// One Shipment collection View-Model: identity + display refs + line-derived display totals. raw = the source shipments
// row (read-only passthrough) so a page adapter reproduces the existing render's canonical fields (via the SAME db-api
// normalizer). Line totals here are the SAME display sums the pages already compute over persisted per-line columns.
function shipMapShipment_(r, linesByShipment) {
  var sid = shipWsStr_(r.shipment_id);
  var lines = linesByShipment[sid] || [];
  var totalQty = 0, receivedQty = 0, lineCount = lines.length;
  for (var i = 0; i < lines.length; i++) {
    var shipped = shipWsNum_((lines[i].shipment_qty === '' || lines[i].shipment_qty == null) ? lines[i].qty : lines[i].shipment_qty);
    var recv = (lines[i].shipment_received_qty === '' || lines[i].shipment_received_qty == null) ? 0 : shipWsNum_(lines[i].shipment_received_qty);
    totalQty += shipped; receivedQty += recv;
  }
  var destWh = shipWsStr_((r.destination_warehouse_id === '' || r.destination_warehouse_id == null) ? r.warehouse_id : r.destination_warehouse_id);
  return {
    shipmentId: sid, shipmentNo: shipWsStr_(r.shipment_no), shippingPlanId: shipWsStr_(r.shipping_plan_id),
    company: shipWsStr_(r.company), country: shipWsStr_(r.country), marketplace: shipWsStr_(r.marketplace),
    sourceWarehouseId: shipWsStr_(r.source_warehouse_id), destinationWarehouseId: destWh,
    carrierId: shipWsStr_(r.carrier_id), shippingMethod: shipWsStr_(r.shipping_method), status: shipWsStr_(r.status),
    etd: shipWsStr_(r.etd), eta: shipWsStr_(r.eta),
    trackingNumber: shipWsStr_(r.tracking_number), containerNo: shipWsStr_(r.container_no),
    lineCount: lineCount, sumShipmentQty: totalQty, sumReceivedQty: receivedQty,
    updatedAt: shipWsStr_(r.updated_at),
    raw: r   // read-only passthrough (same shipments table already read)
  };
}

function shipNormalizeFilters_(filters, search) {
  filters = filters || {};
  function f(v) { var s = shipWsStr_(v); return s === '' ? null : s; }
  return {
    company: f(filters.company), status: f(filters.status), country: f(filters.country),
    destinationWarehouseId: f(filters.destinationWarehouseId), carrierId: f(filters.carrierId),
    shippingPlanId: f(filters.shippingPlanId),
    // F1-7M-B2-1: OPTIONAL exact-shipment filter for a bounded post-write readback. Absent → null → inert (filter-absent
    // response byte-identical). Present → only that shipment survives, and its routes/events are scoped to match (below).
    shipmentId: f(filters.shipmentId),
    search: (function () { var s = shipWsStr_(search); return s === '' ? null : s.toLowerCase(); })()
  };
}

function shipFilterShipments_(mapped, f) {
  return mapped.filter(function (p) {
    if (f.company && p.company !== f.company) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.country && p.country !== f.country) return false;
    if (f.destinationWarehouseId && p.destinationWarehouseId !== f.destinationWarehouseId) return false;
    if (f.carrierId && p.carrierId !== f.carrierId) return false;
    if (f.shippingPlanId && p.shippingPlanId !== f.shippingPlanId) return false;
    if (f.shipmentId && p.shipmentId !== f.shipmentId) return false;   // F1-7M-B2-1 exact-shipment bounded readback
    if (f.search) { var hay = (p.shipmentId + ' ' + p.shipmentNo + ' ' + p.trackingNumber + ' ' + p.containerNo + ' ' + p.company).toLowerCase(); if (hay.indexOf(f.search) < 0) return false; }
    return true;
  });
}

function shipSortShipments_(rows, sort) {
  var spec = (Array.isArray(sort) && sort.length) ? sort[0] : { field: 'updated_at', direction: 'desc' };
  var field = shipWsStr_(spec.field) || 'updated_at';
  if (!SHIP_WS_SORT_FIELDS_[field]) { var e = new Error('invalid sort field: ' + field); e.validationCode = 'VALIDATION_FAILED'; throw e; }
  var dir = shipWsLc_(spec.direction) === 'asc' ? 1 : -1;
  function val(p) {
    switch (field) {
      case 'status': return shipWsStr_(p.status); case 'company': return shipWsStr_(p.company);
      case 'country': return shipWsStr_(p.country); case 'shipment_no': case 'shipmentNo': return shipWsStr_(p.shipmentNo);
      case 'etd': return shipWsStr_(p.etd); case 'eta': return shipWsStr_(p.eta);
      case 'created_at': case 'createdAt': return shipWsStr_(p.raw && p.raw.created_at);
      default: return shipWsStr_(p.updatedAt);
    }
  }
  var copy = rows.slice();
  copy.sort(function (a, b) {
    var va = val(a), vb = val(b), c = (String(va) < String(vb) ? -1 : String(va) > String(vb) ? 1 : 0);
    if (c !== 0) return c * dir;
    return a.shipmentId < b.shipmentId ? -1 : a.shipmentId > b.shipmentId ? 1 : 0;   // deterministic tie-break
  });
  return copy;
}

function shipPaginate_(rows, page) {
  page = page || {};
  var size = shipWsNum_(page.size); size = (size && size > 0) ? Math.min(Math.floor(size), SHIP_WS_PAGE_MAX_) : SHIP_WS_PAGE_DEFAULT_;
  var number = shipWsNum_(page.number); number = (number && number > 0) ? Math.floor(number) : 1;
  var total = rows.length, totalPages = size > 0 ? Math.ceil(total / size) : 0;
  var start = (number - 1) * size;
  var items = (start >= 0 && start < total) ? rows.slice(start, start + size) : [];
  return { items: items, pageNumber: number, pageSize: size, totalItems: total, totalPages: totalPages };
}

function shipBuildSummary_(filtered) {
  var byStatus = {};
  for (var i = 0; i < filtered.length; i++) { var s = shipWsLc_(filtered[i].status); byStatus[s] = (byStatus[s] || 0) + 1; }
  return { totalShipments: filtered.length, byStatus: byStatus };
}

function shipBuildFilterOptions_(mappedAll) {
  function uniq(arr) { var seen = {}, out = []; arr.forEach(function (v) { var k = shipWsStr_(v); if (k !== '' && !seen[k]) { seen[k] = 1; out.push(k); } }); return out.sort(); }
  return {
    companies: uniq(mappedAll.map(function (p) { return p.company; })),
    statuses: uniq(mappedAll.map(function (p) { return p.status; })),
    countries: uniq(mappedAll.map(function (p) { return p.country; })),
    carriers: uniq(mappedAll.map(function (p) { return p.carrierId; }))
  };
}

// The pure orchestrator: raw tables + request payload → bounded page-oriented View Model. Flat raw passthrough arrays for
// lines/routes/events (the pages group them by shipment_id) + master subsets. include gates the MAP-extra tables.
function shipWorkspaceBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var shipments = tables.shipments || [], lines = tables.shipment_lines || [];
  var warehouses = tables.warehouses || [], carrierRateCards = tables.carrier_rate_cards || [];
  var include = payload.include || {};

  var linesByShipment = {}; for (var i = 0; i < lines.length; i++) { var sid = shipWsStr_(lines[i].shipment_id); if (sid === '') continue; (linesByShipment[sid] = linesByShipment[sid] || []).push(lines[i]); }

  var mappedAll = shipments.map(function (r) { return shipMapShipment_(r, linesByShipment); });
  var f = shipNormalizeFilters_(payload.filters, payload.search);
  var filtered = shipFilterShipments_(mappedAll, f);
  var sorted = shipSortShipments_(filtered, payload.sort);
  var pageResult = shipPaginate_(sorted, payload.page);

  // shipment_lines for the returned page shipments (flat raw passthrough; the pages group by shipment_id).
  var pageIds = {}; for (var p = 0; p < pageResult.items.length; p++) pageIds[pageResult.items[p].shipmentId] = 1;
  var pageLines = lines.filter(function (l) { return pageIds[shipWsStr_(l.shipment_id)]; });

  var out = {
    filters: { options: (include.filterOptions !== false) ? shipBuildFilterOptions_(mappedAll) : null, applied: f },
    summary: (include.summary !== false) ? shipBuildSummary_(filtered) : null,
    shipments: pageResult.items,
    shipmentLines: pageLines,
    warehouses: warehouses,
    carrierRateCards: carrierRateCards,
    pagination: { pageNumber: pageResult.pageNumber, pageSize: pageResult.pageSize, totalItems: pageResult.totalItems, totalPages: pageResult.totalPages }
  };
  // MAP-extra tables (On-the-Way) — returned ONLY when requested (bounded includes). F1-7M-B2-1: when the exact-shipment
  // filter is active, scope routes/events to that shipment's id too (they carry shipment_id); filter-absent → full tables
  // exactly as before. logistics_locations / route templates / template_nodes carry NO shipment_id → REFERENCE, unscoped.
  if (include.routes) out.shipmentRoutes = f.shipmentId ? (tables.shipment_routes || []).filter(function (r) { return pageIds[shipWsStr_(r.shipment_id)]; }) : (tables.shipment_routes || []);
  if (include.events) out.shipmentEvents = f.shipmentId ? (tables.shipment_events || []).filter(function (r) { return pageIds[shipWsStr_(r.shipment_id)]; }) : (tables.shipment_events || []);
  if (include.locations) out.logisticsLocations = tables.logistics_locations || [];
  if (include.templates) { out.shipmentRouteTemplates = tables.shipment_route_templates || []; out.shipmentRouteTemplateNodes = tables.shipment_route_template_nodes || []; }
  return out;
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function shipWsRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function shipWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { SHIP_WS_SEQ_++; return SHIP_WS_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      if (optional && !ss.getSheetByName(name)) return [];   // sparse/absent MAP tab → [] (match browser getters)
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return shipWsRowsToObjects_(sheet);
    }
  };
}

function handleShipmentWorkspaceGet_(body, io) {
  io = io || shipWorkspaceDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = shipWsStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  try {
    var payload = (body && body.payload) || {};
    var include = payload.include || {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < SHIP_WORKSPACE_TABLES_.length; i++) {
      var spec = SHIP_WORKSPACE_TABLES_[i];
      if (spec.include && !include[spec.include]) continue;   // skip un-requested MAP-extra tables (no read cost)
      tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true);
      readCount++;
    }
    var vm = shipWorkspaceBuild_(tables, payload);
    return shipBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'SHIPMENT_WORKSPACE_BUILD_FAILED';
    return shipBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
