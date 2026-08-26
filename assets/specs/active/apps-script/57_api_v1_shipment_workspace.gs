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
  { name: 'shipment_route_template_nodes', requiredCols: [], optional: true, include: 'templates' },
  // F1-7N-FB-1B §P — the generated_documents registry, projected onto each shipment's Document Panel. Bounded:
  // read only when the caller asks for it, and optional so a DB without the table degrades to "no documents"
  // rather than failing the whole workspace read.
  { name: 'generated_documents',           requiredCols: [], optional: true, include: 'documents' }
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
// F1-7N-FB-4A §E — DATE-ONLY projection for the date-formatted shipment columns (eta / etd).
//
// THIS IS THE HALF OF THE ETA DEFECT THAT LIVED ON THE READ SIDE. shipments.eta is a DATE-FORMATTED column, so
// getValues() hands back a Date OBJECT. shipWsStr_ is String(v), which turns that into
// 'Thu Oct 15 2026 00:00:00 GMT+0800 (…)'. The Global Logistics Map tests an ETA with /^\d{4}-\d{2}-\d{2}$/
// before putting it into its <input type="date">, so a perfectly good persisted ETA rendered as a BLANK date box
// and a nonsense card line — indistinguishable from "the write did not happen".
//
// The legacy whole-DB read never had this problem because 02_ formatValue_ normalizes every Date to 'yyyy-MM-dd'
// before it leaves the server. When the map moved to this SCOPED workspace it lost that normalization. Restoring
// it here makes the scoped read agree with the broad read it replaced — the same contract, not a new one, and
// the same timezone authority (Session.getScriptTimeZone()). Non-date values pass through untouched, so a row
// that already stores plain text is byte-identical to before.
function shipWsDateOnly_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && typeof shipEtaDateOnly_ === 'function') {
    return shipEtaDateOnly_(v);
  }
  return shipWsStr_(v);
}

// ------------------------------------------------------------------------------------------------------------
// F1-7N-FB-4B §C — THE RAW PASSTHROUGH WAS THE HOLE, AND FB-4A ONLY CLOSED HALF THE PATH.
//
// FB-4A normalized the PROJECTED `eta` field (shipWsDateOnly_ above) and that was correct but INSUFFICIENT,
// because nothing on the client reads the projected field: operation-system-db-api.js builds its shipment
// view-model with normalizeShipmentRecord(s.raw) — from the RAW ROW PASSTHROUGH. A Sheets date cell is a Date
// OBJECT, and JSON.stringify(Date) calls Date.prototype.toJSON -> toISOString(), so `raw.eta` left this server
// as '2026-08-30T16:00:00.000Z' — Asia/Taipei midnight on the 31st, serialized as the previous day in UTC. The
// operator saw "ETA saved and verified: 2026-08-31", a blank date input (the page's ^\d{4}-\d{2}-\d{2}$ test
// fails on an ISO timestamp) and a card reading 2026-08-30T16:00:00.000Z. The write was right the whole time.
//
// So the normalization is applied HERE, at the serialization boundary every consumer passes through:
//   · a DATE-ONLY column (eta / etd / the *_date family) -> 'yyyy-MM-dd'
//   · any OTHER Date cell (created_at / updated_at / *_at) -> 'yyyy-MM-dd HH:mm:ss', the exact form
//     shipmentTimestamp_ writes, so a timestamp keeps its time instead of being flattened or UTC-shifted
//   · anything that is not a Date is passed through UNTOUCHED, so a row already stored as text is byte-identical
// Both use Session.getScriptTimeZone() — the single date authority 02_ formatValue_, 11_, 12_ and 13_ share.
// NO ISO-8601 / UTC / 'Z' string can leave this module for a shipments row.
var SHIP_WS_DATE_ONLY_COLS_ = {
  eta: 1, etd: 1,
  actual_departure_date: 1, actual_arrival_date: 1, customs_clearance_date: 1, delivered_date: 1,
  planned_arrival_date: 1, planned_departure_date: 1, inventory_snapshot_date: 1
};
function shipWsIsDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function shipWsDateTime_(v) {
  if (!shipWsIsDate_(v) || isNaN(v.getTime())) return shipWsStr_(v);
  if (typeof Utilities === 'undefined' || typeof Session === 'undefined') return shipWsStr_(v);
  return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
// Shallow copy with every Date cell normalized. Shallow on purpose: the row is a flat header-keyed object, and a
// copy (rather than mutating `r`) keeps the caller's own read model untouched.
function shipWsNormalizeRawRow_(r) {
  if (!r || typeof r !== 'object') return r;
  var out = {};
  for (var k in r) {
    if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
    var v = r[k];
    if (!shipWsIsDate_(v)) { out[k] = v; continue; }
    out[k] = SHIP_WS_DATE_ONLY_COLS_[k] === 1 ? shipWsDateOnly_(v) : shipWsDateTime_(v);
  }
  return out;
}
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
// F1-7N-FB-1B §P — project the generated_documents registry onto ONE entity's view-model. This is the read path
// the STOP audit proved was missing: the Document Panels were already correct, but no workspace owner ever
// produced `documents`, so every panel truthfully rendered "No documents generated yet". Rows are grouped ONCE
// and projected through the single canonical DTO owner (dgsDocumentDto_ / dgsBatchState_ in 39_) so the API, the
// diagnostics and the panels can never disagree. It is PURE: the rows were already read by the io layer, and the
// browser still never touches Drive — it only follows a URL the backend resolved.
function shipWsDocumentsFor_(rowsByEntity, entityId) {
  var rows = (rowsByEntity && rowsByEntity[entityId]) || [];
  var live = rows.filter(function (r) { return dgsRowState_(r) !== 'SUPERSEDED'; });
  if (!live.length) return { documents: [], documentFolderUrl: '', documentGenerationStatus: 'NONE', documentGenerationError: null, canRetryDocuments: false };
  var docs = live.map(function (r) { return dgsDocumentDto_(r); });
  var folderId = '';
  for (var i = live.length - 1; i >= 0; i--) { if (dgsStr_(live[i].output_folder_id)) { folderId = dgsStr_(live[i].output_folder_id); break; } }
  var firstErr = null;
  for (var j = 0; j < docs.length; j++) { if (docs[j].status !== 'READY' && docs[j].reason) { firstErr = docs[j]; break; } }
  return {
    documents: docs,
    documentFolderUrl: dgsFolderUrl_(folderId),
    documentGenerationStatus: dgsBatchState_(live, { entity_committed: true }),
    documentGenerationError: firstErr ? { reason: firstErr.reason, message: firstErr.message, documentLabel: firstErr.document_label, templateKey: firstErr.template_key, retryable: firstErr.retryable } : null,
    canRetryDocuments: docs.some(function (d) { return d.retryable; })
  };
}
function shipWsGroupDocuments_(rows, entityType) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (dgsLc_(r.related_entity_type) !== entityType) return;
    var id = dgsStr_(r.related_entity_id); if (!id) return;
    (out[id] = out[id] || []).push(r);
  });
  return out;
}

function shipMapShipment_(r, linesByShipment, docsByShipment) {
  var sid = shipWsStr_(r.shipment_id);
  var lines = linesByShipment[sid] || [];
  var totalQty = 0, receivedQty = 0, lineCount = lines.length;
  for (var i = 0; i < lines.length; i++) {
    var shipped = shipWsNum_((lines[i].shipment_qty === '' || lines[i].shipment_qty == null) ? lines[i].qty : lines[i].shipment_qty);
    var recv = (lines[i].shipment_received_qty === '' || lines[i].shipment_received_qty == null) ? 0 : shipWsNum_(lines[i].shipment_received_qty);
    totalQty += shipped; receivedQty += recv;
  }
  var destWh = shipWsStr_((r.destination_warehouse_id === '' || r.destination_warehouse_id == null) ? r.warehouse_id : r.destination_warehouse_id);
  var docs = shipWsDocumentsFor_(docsByShipment || {}, sid);
  return {
    shipmentId: sid, shipmentNo: shipWsStr_(r.shipment_no), shippingPlanId: shipWsStr_(r.shipping_plan_id),
    company: shipWsStr_(r.company), country: shipWsStr_(r.country), marketplace: shipWsStr_(r.marketplace),
    sourceWarehouseId: shipWsStr_(r.source_warehouse_id), destinationWarehouseId: destWh,
    carrierId: shipWsStr_(r.carrier_id), shippingMethod: shipWsStr_(r.shipping_method), status: shipWsStr_(r.status),
    etd: shipWsDateOnly_(r.etd), eta: shipWsDateOnly_(r.eta),
    trackingNumber: shipWsStr_(r.tracking_number), containerNo: shipWsStr_(r.container_no),
    lineCount: lineCount, sumShipmentQty: totalQty, sumReceivedQty: receivedQty,
    updatedAt: shipWsStr_(r.updated_at),
    externalShipmentId: shipWsStr_(r.external_shipment_id), shippedAt: shipWsStr_(r.shipped_at),
    documents: docs.documents, documentFolderUrl: docs.documentFolderUrl,
    documentGenerationStatus: docs.documentGenerationStatus, documentGenerationError: docs.documentGenerationError,
    canRetryDocuments: docs.canRetryDocuments,
    // FB-4B §C — the passthrough is still the SAME row, but with its Date cells rendered in the canonical
    // timezone. Without this, JSON.stringify turns every date cell into a UTC ISO timestamp and the client — which
    // builds its view-model from THIS object, not from the projected fields above — shows the wrong calendar day.
    raw: shipWsNormalizeRawRow_(r)
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
      case 'etd': return shipWsStr_(p.etd); case 'eta': return shipWsStr_(p.eta);   // already date-only via shipWsDateOnly_ in the mapper
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

  var docsByShipment = shipWsGroupDocuments_(tables.generated_documents || [], 'shipment');
  var mappedAll = shipments.map(function (r) { return shipMapShipment_(r, linesByShipment, docsByShipment); });
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
