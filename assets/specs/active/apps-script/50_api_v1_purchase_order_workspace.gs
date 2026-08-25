/**
 * 50_api_v1_purchase_order_workspace.gs
 * Kitchen Mama Operation System — API v1 · Purchase Order READ-ONLY Workspace (Phase API / F1-7C).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped read owner for the Purchase Order pages
 * (purchase-order-overview.js, purchase-order-list.js). Read-only:
 *   action = "purchaseOrder.workspace.get"  (dispatched from 01_router.gs doPost; a body-carrying READ, no write).
 *
 * Contract (identical discipline to 40_ Weekly Workspace):
 *   - reads ONLY the PO tables (purchase_orders, purchase_order_lines, warehouses, sku_details) — NEVER getOperationDb;
 *   - one server execution: open+validate the bound Spreadsheet ONCE, read each table ONCE, join/group in memory,
 *     return ONE bounded page-oriented View Model;
 *   - preserves S0/S0.5 (exact Spreadsheet-ID gate, validate-only presence — NEVER create/repair/append/migrate);
 *   - authors NO business logic. It does NOT recompute FIFO, shipped_qty, or shipment allocations. The ONLY quantity
 *     projection is the CANONICAL PO read-model fact remaining_qty = max(0, completed_qty - shipped_qty) — the SAME
 *     definition 13_procurement_handlers already persists at write time — surfaced here so the FRONTEND never derives
 *     it. shipped_qty / completed_qty / ordered_qty are passed through verbatim (canonical persisted facts).
 *
 * Testability: every pure builder is a `function` declaration (extract+eval friendly). The impure orchestrator
 * `handlePurchaseOrderWorkspaceGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO
 * SpreadsheetApp.
 */

var PO_WS_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

var PO_WORKSPACE_TABLES_ = [
  { name: 'purchase_orders',      requiredCols: ['purchase_order_id'] },
  { name: 'purchase_order_lines', requiredCols: ['purchase_order_id'] },
  { name: 'warehouses',           requiredCols: ['warehouse_id'] },
  { name: 'sku_details',          requiredCols: ['sku'] },
  // F1-7N-FB-1B §P — the generated_documents registry, projected onto each PO's Document Panel. Optional so a DB
  // without the table degrades to "no documents" rather than failing the whole workspace read.
  // F1-7N-FB-2 §H — BOUNDED by an include, matching the shipment workspace. FB-1B shipped this without an
  // `include` key, so EVERY Purchase Order page load performed an extra unbounded registry read whether or not
  // the caller wanted documents. That was a real added read on the hottest PO path.
  { name: 'generated_documents',  requiredCols: [], optional: true, include: 'documents' }
];

var PO_WS_SORT_FIELDS_ = {
  'order_date': 1, 'orderDate': 1, 'status': 1, 'company': 1, 'po_no': 1, 'poNo': 1,
  'remaining': 1, 'remaining_qty': 1, 'ordered': 1, 'completed': 1, 'shipped': 1
};

// The PO pages paginate/filter client-side, so the client requests one large page (all POs) — the workspace's win is
// table SCOPE (4 PO tables, never the 48-tab getOperationDb), not server pagination. Cap high enough to avoid a silent
// truncation at Phase-1 PO volumes; pagination.totalItems lets the client detect if it were ever exceeded.
var PO_WS_PAGE_MAX_ = 2000;
var PO_WS_PAGE_DEFAULT_ = 200;

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock / no Spreadsheet)
// --------------------------------------------------------------------------------------------------------
function poWsStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function poWsNum_(v) { if (v === '' || v === null || v === undefined) return 0; var n = Number(v); return isFinite(n) ? n : 0; }
function poWsHasNum_(v) { return !(v === '' || v === null || v === undefined); }
function poWsLc_(v) { return poWsStr_(v).toLowerCase(); }

function poMakeRequestId_(provided, io) {
  var p = poWsStr_(provided);
  if (/^REQ-[A-Za-z0-9_-]{1,40}$/.test(p)) return p;
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  return 'REQ-S' + ('000000' + seq).slice(-6);
}

function poBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'purchaseOrder.workspace.get', workspace: 'purchaseOrder', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

function poIndexBy_(rows, key) {
  var idx = {}; for (var i = 0; i < (rows || []).length; i++) { var id = poWsStr_(rows[i][key]); if (id !== '' && !idx[id]) idx[id] = rows[i]; } return idx;
}

// CANONICAL PO read-model remaining_qty: the persisted value when present, else max(0, completed - shipped).
// This is the SAME definition the write handlers persist (13_) — NOT a second shipped calculation, NOT FIFO.
function poLineRemaining_(lineRow) {
  if (poWsHasNum_(lineRow.remaining_qty)) return Math.max(0, poWsNum_(lineRow.remaining_qty));
  return Math.max(0, poWsNum_(lineRow.completed_qty) - poWsNum_(lineRow.shipped_qty));
}

function poNormalizeFilters_(filters, search) {
  filters = filters || {};
  function f(v) { var s = poWsStr_(v); return s === '' ? null : s; }
  return {
    company: f(filters.company), status: f(filters.status), factoryId: f(filters.factoryId),
    warehouseId: f(filters.warehouseId), requestBucket: f(filters.requestBucket), supplierId: f(filters.supplierId),
    requestOrderId: f(filters.requestOrderId),
    // F1-7M-B2-3: OPTIONAL exact-PO filter for a bounded post-write readback. Absent → null → the clause below is inert
    // (filter-absent response byte-identical). Present → only that PO survives; reference tables (warehouses/sku_details)
    // are emitted from their own arrays and are structurally never touched by this order-level filter.
    purchaseOrderId: f(filters.purchaseOrderId),
    search: (function () { var s = poWsStr_(search); return s === '' ? null : s.toLowerCase(); })()
  };
}

// One PO View-Model: identity + display refs + line-derived qty rollups. raw = the source purchase_orders row
// (read-only passthrough) so a page adapter reproduces the existing render's canonical fields (via the SAME
// db-api normalizer) without broadening table scope.
// F1-7N-FB-1B §P — project the generated_documents registry onto ONE entity's view-model. This is the read path
// the STOP audit proved was missing: the Document Panels were already correct, but no workspace owner ever
// produced `documents`, so every panel truthfully rendered "No documents generated yet". Rows are grouped ONCE
// and projected through the single canonical DTO owner (dgsDocumentDto_ / dgsBatchState_ in 39_) so the API, the
// diagnostics and the panels can never disagree. It is PURE: the rows were already read by the io layer, and the
// browser still never touches Drive — it only follows a URL the backend resolved.
function poWsDocumentsFor_(rowsByEntity, entityId) {
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
    documentGenerationStatus: dgsBatchState_(live, { entity_committed: false }),
    documentGenerationError: firstErr ? { reason: firstErr.reason, message: firstErr.message, documentLabel: firstErr.document_label, templateKey: firstErr.template_key, retryable: firstErr.retryable } : null,
    canRetryDocuments: docs.some(function (d) { return d.retryable; })
  };
}
function poWsGroupDocuments_(rows, entityType) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (dgsLc_(r.related_entity_type) !== entityType) return;
    var id = dgsStr_(r.related_entity_id); if (!id) return;
    (out[id] = out[id] || []).push(r);
  });
  return out;
}

function poMapOrder_(r, whIndex, linesByPo, docsByPo) {
  var poId = poWsStr_(r.purchase_order_id);
  var lines = linesByPo[poId] || [];
  var ordered = 0, completed = 0, shipped = 0, remaining = 0;
  for (var i = 0; i < lines.length; i++) {
    ordered += poWsNum_(lines[i].ordered_qty);
    completed += poWsNum_(lines[i].completed_qty);
    shipped += poWsNum_(lines[i].shipped_qty);
    remaining += poLineRemaining_(lines[i]);
  }
  var wid = poWsStr_(r.warehouse_id), fid = poWsStr_(r.factory_id);
  var whByWid = whIndex[wid.toUpperCase()], whByFid = whIndex[fid.toUpperCase()];
  var factoryName = (whByWid ? poWsStr_(whByWid.warehouse_name) : '') || (whByFid ? poWsStr_(whByFid.warehouse_name) : '');
  var docs = poWsDocumentsFor_(docsByPo || {}, poId);
  return {
    purchaseOrderId: poId, poNo: poWsStr_(r.po_no || r.purchase_order_no),
    requestOrderId: poWsStr_(r.request_order_id), requestBucket: poWsStr_(r.request_bucket),
    company: poWsStr_(r.company), factoryId: fid, warehouseId: wid, factoryName: factoryName,
    supplierId: poWsStr_(r.supplier_id), supplierName: poWsStr_(r.supplier_name),
    currency: poWsStr_(r.currency), status: poWsStr_(r.order_status || r.status),
    orderDate: poWsStr_(r.order_date),
    orderedQty: ordered, completedQty: completed, shippedQty: shipped, remainingQty: remaining,
    lineCount: lines.length,
    documents: docs.documents, documentFolderUrl: docs.documentFolderUrl,
    documentGenerationStatus: docs.documentGenerationStatus, documentGenerationError: docs.documentGenerationError,
    canRetryDocuments: docs.canRetryDocuments,
    raw: r   // read-only passthrough (same purchase_orders table already read)
  };
}

// One PO line View-Model. remainingQty is the CANONICAL backend-owned read-model fact (never client-derived).
function poMapLine_(r, skuIndex) {
  var info = skuIndex[poWsLc_(r.sku)] || {};
  return {
    purchaseOrderLineId: poWsStr_(r.purchase_order_line_id), purchaseOrderId: poWsStr_(r.purchase_order_id),
    sku: poWsStr_(r.sku), series: poWsStr_(r.series) || poWsStr_(info.series), category: poWsStr_(info.category),
    orderedQty: poWsNum_(r.ordered_qty), completedQty: poWsNum_(r.completed_qty), shippedQty: poWsNum_(r.shipped_qty),
    remainingQty: poLineRemaining_(r),   // backend-owned: persisted, else max(0, completed - shipped)
    raw: r
  };
}

function poFilterOrders_(mapped, f) {
  return mapped.filter(function (p) {
    if (f.company && p.company !== f.company) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.factoryId && p.factoryId !== f.factoryId) return false;
    if (f.warehouseId && p.warehouseId !== f.warehouseId) return false;
    if (f.requestBucket && p.requestBucket !== f.requestBucket) return false;
    if (f.supplierId && p.supplierId !== f.supplierId) return false;
    if (f.requestOrderId && p.requestOrderId !== f.requestOrderId) return false;
    if (f.purchaseOrderId && p.purchaseOrderId !== f.purchaseOrderId) return false;   // F1-7M-B2-3 exact-PO bounded readback
    if (f.search) { var hay = (p.purchaseOrderId + ' ' + p.poNo + ' ' + p.company + ' ' + p.supplierName + ' ' + p.requestOrderId).toLowerCase(); if (hay.indexOf(f.search) < 0) return false; }
    return true;
  });
}

function poSortOrders_(rows, sort) {
  var spec = (Array.isArray(sort) && sort.length) ? sort[0] : { field: 'order_date', direction: 'desc' };
  var field = poWsStr_(spec.field) || 'order_date';
  if (!PO_WS_SORT_FIELDS_[field]) { var e = new Error('invalid sort field: ' + field); e.validationCode = 'VALIDATION_FAILED'; throw e; }
  var dir = poWsLc_(spec.direction) === 'asc' ? 1 : -1;
  function val(p) {
    switch (field) {
      case 'order_date': case 'orderDate': return poWsStr_(p.orderDate);
      case 'status': return poWsStr_(p.status);
      case 'company': return poWsStr_(p.company);
      case 'po_no': case 'poNo': return poWsStr_(p.poNo);
      case 'remaining': case 'remaining_qty': return p.remainingQty;
      case 'ordered': return p.orderedQty;
      case 'completed': return p.completedQty;
      case 'shipped': return p.shippedQty;
      default: return poWsStr_(p.orderDate);
    }
  }
  var copy = rows.slice();
  copy.sort(function (a, b) {
    var va = val(a), vb = val(b), c;
    if (typeof va === 'number' && typeof vb === 'number') c = (va < vb ? -1 : va > vb ? 1 : 0);
    else c = (String(va) < String(vb) ? -1 : String(va) > String(vb) ? 1 : 0);
    if (c !== 0) return c * dir;
    return a.purchaseOrderId < b.purchaseOrderId ? -1 : a.purchaseOrderId > b.purchaseOrderId ? 1 : 0;   // deterministic tie-break
  });
  return copy;
}

function poPaginate_(rows, page) {
  page = page || {};
  var size = poWsNum_(page.size); size = (size && size > 0) ? Math.min(Math.floor(size), PO_WS_PAGE_MAX_) : PO_WS_PAGE_DEFAULT_;
  var number = poWsNum_(page.number); number = (number && number > 0) ? Math.floor(number) : 1;
  var total = rows.length, totalPages = size > 0 ? Math.ceil(total / size) : 0;
  var start = (number - 1) * size;
  var items = (start >= 0 && start < total) ? rows.slice(start, start + size) : [];
  return { items: items, pageNumber: number, pageSize: size, totalItems: total, totalPages: totalPages };
}

function poBuildSummary_(filtered) {
  var ordered = 0, completed = 0, shipped = 0, remaining = 0, byStatus = {};
  for (var i = 0; i < filtered.length; i++) {
    var p = filtered[i]; ordered += p.orderedQty; completed += p.completedQty; shipped += p.shippedQty; remaining += p.remainingQty;
    var s = poWsLc_(p.status); byStatus[s] = (byStatus[s] || 0) + 1;
  }
  return { totalPurchaseOrders: filtered.length, totalOrdered: ordered, totalCompleted: completed, totalShipped: shipped, totalRemaining: remaining, byStatus: byStatus };
}

function poBuildFilterOptions_(mappedAll) {
  function uniq(arr) { var seen = {}, out = []; arr.forEach(function (v) { var k = poWsStr_(v); if (k !== '' && !seen[k]) { seen[k] = 1; out.push(k); } }); return out.sort(); }
  return {
    companies: uniq(mappedAll.map(function (p) { return p.company; })),
    statuses: uniq(mappedAll.map(function (p) { return p.status; })),
    factories: uniq(mappedAll.map(function (p) { return p.factoryId; })),
    suppliers: uniq(mappedAll.map(function (p) { return p.supplierId; })),
    requestBuckets: uniq(mappedAll.map(function (p) { return p.requestBucket; }))
  };
}

function poBuildDetails_(pageOrders, linesByPo, skuIndex) {
  var out = {};
  for (var i = 0; i < pageOrders.length; i++) {
    var id = pageOrders[i].purchaseOrderId, lines = linesByPo[id] || [];
    out[id] = { lines: lines.map(function (l) { return poMapLine_(l, skuIndex); }) };
  }
  return out;
}

// The pure orchestrator: raw tables + request payload → bounded page-oriented View Model.
function poWorkspaceBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var orders = tables.purchase_orders || [], lines = tables.purchase_order_lines || [];
  var warehouses = tables.warehouses || [], skuDetails = tables.sku_details || [];
  var include = payload.include || { summary: true, orders: true, details: true, filterOptions: true };

  var whIndex = poIndexBy_(warehouses, 'warehouse_id');   // keyed uppercased below
  var whUpper = {}; for (var w = 0; w < warehouses.length; w++) { var wid = poWsStr_(warehouses[w].warehouse_id).toUpperCase(); if (wid && !whUpper[wid]) whUpper[wid] = warehouses[w]; }
  var skuIndex = {}; for (var s = 0; s < skuDetails.length; s++) { var sk = poWsLc_(skuDetails[s].sku); if (sk && !skuIndex[sk]) skuIndex[sk] = skuDetails[s]; }
  var linesByPo = {}; for (var i = 0; i < lines.length; i++) { var pid = poWsStr_(lines[i].purchase_order_id); if (pid === '') continue; (linesByPo[pid] = linesByPo[pid] || []).push(lines[i]); }

  var docsByPo = poWsGroupDocuments_(tables.generated_documents || [], 'purchase_order');
  var mappedAll = orders.map(function (r) { return poMapOrder_(r, whUpper, linesByPo, docsByPo); });
  var f = poNormalizeFilters_(payload.filters, payload.search);
  var filtered = poFilterOrders_(mappedAll, f);
  var sorted = poSortOrders_(filtered, payload.sort);
  var pageResult = poPaginate_(sorted, payload.page);

  return {
    filters: { options: (include.filterOptions !== false) ? poBuildFilterOptions_(mappedAll) : null, applied: f },
    summary: (include.summary !== false) ? poBuildSummary_(filtered) : null,
    purchaseOrders: (include.orders !== false) ? pageResult.items : [],
    detailsByPurchaseOrderId: (include.details !== false) ? poBuildDetails_(pageResult.items, linesByPo, skuIndex) : {},
    // scoped join subsets the page adapter needs (category/series + factory name) — NOT the whole masters.
    skuDetails: skuDetails.map(function (r) { return { sku: poWsStr_(r.sku), category: poWsStr_(r.category), series: poWsStr_(r.series) }; }),
    warehouses: warehouses.map(function (r) { return { warehouseId: poWsStr_(r.warehouse_id), warehouseName: poWsStr_(r.warehouse_name) }; }),
    pagination: { pageNumber: pageResult.pageNumber, pageSize: pageResult.pageSize, totalItems: pageResult.totalItems, totalPages: pageResult.totalPages }
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function poWsRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function poWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { PO_WS_SEQ_++; return PO_WS_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      if (optional && !ss.getSheetByName(name)) return [];   // absent optional table -> [] (never a hard failure)
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return poWsRowsToObjects_(sheet);
    }
  };
}

function handlePurchaseOrderWorkspaceGet_(body, io) {
  io = io || poWorkspaceDefaultIo_();
  var t0 = io.now();
  var reqId = poMakeRequestId_(body && body.requestId, io);
  try {
    var payload = (body && body.payload) || {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    // F1-7N-FB-2 §H — honour `include` and `optional`, exactly as the shipment workspace does. Without this the
    // table-spec keys were inert: an un-requested table was still read on every load (a real cost on the hottest
    // PO path), and an absent optional table would have failed the entire workspace read instead of degrading.
    var include = payload.include || {};
    for (var i = 0; i < PO_WORKSPACE_TABLES_.length; i++) {
      var spec = PO_WORKSPACE_TABLES_[i];
      if (spec.include && !include[spec.include]) continue;   // skip un-requested tables (no read cost)
      tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true);
      readCount++;
    }
    var vm = poWorkspaceBuild_(tables, payload);
    return poBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'PO_WORKSPACE_BUILD_FAILED';
    return poBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
