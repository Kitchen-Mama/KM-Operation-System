/**
 * 51_api_v1_request_order_workspace.gs
 * Kitchen Mama Operation System — API v1 · Request Order READ-ONLY Workspace (Phase API / F1-7D).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped read owner for the Request Order Draft page
 * (request-order-draft.js — the persisted Draft / Pending Approval / Approved card workflow). Read-only:
 *   action = "requestOrder.workspace.get"  (dispatched from 01_router.gs doPost; a body-carrying READ, no write).
 *
 * Contract (identical discipline to 40_ Weekly / 50_ Purchase Order workspaces):
 *   - reads ONLY the Request Order tables + the masters the page consumes (request_orders, request_order_lines,
 *     request_order_line_sources, warehouses, sku_details, supplier_price_list) — NEVER getOperationDb;
 *   - one server execution: open+validate the bound Spreadsheet ONCE, read each table ONCE, join/group in memory,
 *     return ONE bounded page-oriented View Model;
 *   - preserves S0/S0.5 (exact Spreadsheet-ID gate, validate-only presence — NEVER create/repair/append/migrate).
 *     request_order_line_sources is OPTIONAL (its write path is documented PENDING) → missing = empty, never a throw;
 *     the provisioned tables stay fail-closed (SCHEMA_NOT_PROVISIONED) exactly like 50_;
 *   - authors NO business logic. It does NOT run Gap / Forecast / Recommendation, does NOT generate or persist a
 *     draft, does NOT create a Request Order, does NOT touch RO->PO conversion or FIFO. It composes ONLY persisted
 *     canonical truth (request_orders / request_order_lines as written by 13_/24_). requested_qty / approved_qty /
 *     company / request_bucket / request_order_id / request_order_line_id are passed through verbatim (raw), so a
 *     page adapter reproduces the existing render byte-for-byte via the SAME db-api normalizers.
 *
 * Testability: every pure builder is a `function` declaration (extract+eval friendly). The impure orchestrator
 * `handleRequestOrderWorkspaceGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO
 * SpreadsheetApp.
 */

var RO_WS_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

var RO_WORKSPACE_TABLES_ = [
  { name: 'request_orders',             requiredCols: ['request_order_id'] },
  { name: 'request_order_lines',        requiredCols: ['request_order_id'] },
  { name: 'request_order_line_sources', requiredCols: [], optional: true },   // write path PENDING → missing-safe
  { name: 'warehouses',                 requiredCols: ['warehouse_id'] },
  { name: 'sku_details',                requiredCols: ['sku'] },
  { name: 'supplier_price_list',        requiredCols: ['sku'] }
];

var RO_WS_SORT_FIELDS_ = {
  'created_at': 1, 'createdAt': 1, 'request_order_no': 1, 'requestOrderNo': 1, 'company': 1, 'status': 1, 'request_status': 1
};

// The RO Draft page renders ALL visible cards (client-side grouping/filter), so the client requests one large page.
// The workspace's win is table SCOPE (6 tables, never the 48-tab getOperationDb), not server pagination. Cap high
// enough to avoid a silent truncation at Phase-1 RO volumes; pagination.totalItems lets the client detect an overflow.
var RO_WS_PAGE_MAX_ = 2000;
var RO_WS_PAGE_DEFAULT_ = 500;

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock / no Spreadsheet)
// --------------------------------------------------------------------------------------------------------
function roWsStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function roWsNum_(v) { if (v === '' || v === null || v === undefined) return 0; var n = Number(v); return isFinite(n) ? n : 0; }
function roWsLc_(v) { return roWsStr_(v).toLowerCase(); }

function roMakeRequestId_(provided, io) {
  var p = roWsStr_(provided);
  if (/^REQ-[A-Za-z0-9_-]{1,40}$/.test(p)) return p;
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  return 'REQ-S' + ('000000' + seq).slice(-6);
}

function roBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'requestOrder.workspace.get', workspace: 'requestOrder', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// One Request Order View-Model: identity + status + line-derived rollups. raw = the source request_orders row
// (read-only passthrough) so a page adapter reproduces the existing render's canonical fields (via the SAME db-api
// normalizer) without broadening table scope. request_status is canonical (legacy `status` fallback), matching
// normalizeRequestOrderRecord.
function roMapOrder_(r, linesByRo) {
  var roId = roWsStr_(r.request_order_id);
  var lines = linesByRo[roId] || [];
  var totalRequested = 0, totalApproved = 0;
  for (var i = 0; i < lines.length; i++) { totalRequested += roWsNum_(lines[i].requested_qty); totalApproved += roWsNum_(lines[i].approved_qty); }
  return {
    requestOrderId: roId,
    requestOrderNo: roWsStr_(r.request_order_no),
    company: roWsStr_(r.company),
    status: roWsStr_(r.request_status || r.status),
    createdAt: roWsStr_(r.created_at),
    completedAt: roWsStr_(r.completed_at),
    lineCount: lines.length,
    totalRequested: totalRequested,
    totalApproved: totalApproved,
    raw: r   // read-only passthrough (same request_orders table already read)
  };
}

// One Request Order line View-Model — minimal server fields + raw passthrough (the adapter re-normalizes raw so the
// page consumes byte-identical records; requested_qty / approved_qty / company / request_bucket are canonical persisted
// facts passed through verbatim — never recomputed here).
function roMapLine_(r) {
  return {
    requestOrderLineId: roWsStr_(r.request_order_line_id),
    requestOrderId: roWsStr_(r.request_order_id),
    sku: roWsStr_(r.sku),
    company: roWsStr_(r.company),
    requestBucket: roWsStr_(r.request_bucket),
    lineStatus: roWsStr_(r.line_status),
    raw: r
  };
}

function roNormalizeFilters_(filters, search) {
  filters = filters || {};
  function f(v) { var s = roWsStr_(v); return s === '' ? null : s; }
  return {
    company: f(filters.company), status: f(filters.status), requestOrderId: f(filters.requestOrderId),
    search: (function () { var s = roWsStr_(search); return s === '' ? null : s.toLowerCase(); })()
  };
}

function roFilterOrders_(mapped, f) {
  return mapped.filter(function (o) {
    if (f.company && o.company !== f.company) return false;
    if (f.status && o.status !== f.status) return false;
    if (f.requestOrderId && o.requestOrderId !== f.requestOrderId) return false;
    if (f.search) { var hay = (o.requestOrderId + ' ' + o.requestOrderNo + ' ' + o.company).toLowerCase(); if (hay.indexOf(f.search) < 0) return false; }
    return true;
  });
}

function roSortOrders_(rows, sort) {
  var spec = (Array.isArray(sort) && sort.length) ? sort[0] : { field: 'created_at', direction: 'desc' };
  var field = roWsStr_(spec.field) || 'created_at';
  if (!RO_WS_SORT_FIELDS_[field]) { var e = new Error('invalid sort field: ' + field); e.validationCode = 'VALIDATION_FAILED'; throw e; }
  var dir = roWsLc_(spec.direction) === 'asc' ? 1 : -1;
  function val(o) {
    switch (field) {
      case 'created_at': case 'createdAt': return roWsStr_(o.createdAt);
      case 'request_order_no': case 'requestOrderNo': return roWsStr_(o.requestOrderNo);
      case 'company': return roWsStr_(o.company);
      case 'status': case 'request_status': return roWsStr_(o.status);
      default: return roWsStr_(o.createdAt);
    }
  }
  var copy = rows.slice();
  copy.sort(function (a, b) {
    var va = val(a), vb = val(b);
    var c = (String(va) < String(vb) ? -1 : String(va) > String(vb) ? 1 : 0);
    if (c !== 0) return c * dir;
    return a.requestOrderId < b.requestOrderId ? -1 : a.requestOrderId > b.requestOrderId ? 1 : 0;   // deterministic tie-break
  });
  return copy;
}

function roPaginate_(rows, page) {
  page = page || {};
  var size = roWsNum_(page.size); size = (size && size > 0) ? Math.min(Math.floor(size), RO_WS_PAGE_MAX_) : RO_WS_PAGE_DEFAULT_;
  var number = roWsNum_(page.number); number = (number && number > 0) ? Math.floor(number) : 1;
  var total = rows.length, totalPages = size > 0 ? Math.ceil(total / size) : 0;
  var start = (number - 1) * size;
  var items = (start >= 0 && start < total) ? rows.slice(start, start + size) : [];
  return { items: items, pageNumber: number, pageSize: size, totalItems: total, totalPages: totalPages };
}

function roBuildSummary_(filtered) {
  var byStatus = {};
  for (var i = 0; i < filtered.length; i++) { var s = roWsLc_(filtered[i].status); byStatus[s] = (byStatus[s] || 0) + 1; }
  return { totalRequestOrders: filtered.length, byStatus: byStatus };
}

function roBuildFilterOptions_(mappedAll) {
  function uniq(arr) { var seen = {}, out = []; arr.forEach(function (v) { var k = roWsStr_(v); if (k !== '' && !seen[k]) { seen[k] = 1; out.push(k); } }); return out.sort(); }
  return {
    companies: uniq(mappedAll.map(function (o) { return o.company; })),
    statuses: uniq(mappedAll.map(function (o) { return o.status; }))
  };
}

function roBuildDetails_(pageOrders, linesByRo) {
  var out = {};
  for (var i = 0; i < pageOrders.length; i++) {
    var id = pageOrders[i].requestOrderId, lines = linesByRo[id] || [];
    out[id] = { lines: lines.map(function (l) { return roMapLine_(l); }) };
  }
  return out;
}

// The pure orchestrator: raw tables + request payload → bounded page-oriented View Model. The master subsets
// (line sources / warehouses / sku_details / supplier_price_list) are passed through as raw rows so the page adapter
// runs the SAME canonical db-api normalizers → byte-identical records (BEFORE == AFTER), never a second authority.
function roWorkspaceBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var orders = tables.request_orders || [], lines = tables.request_order_lines || [];
  var lineSources = tables.request_order_line_sources || [];
  var warehouses = tables.warehouses || [], skuDetails = tables.sku_details || [], supplierPriceList = tables.supplier_price_list || [];
  var include = payload.include || { summary: true, orders: true, details: true, filterOptions: true };

  var linesByRo = {}; for (var i = 0; i < lines.length; i++) { var rid = roWsStr_(lines[i].request_order_id); if (rid === '') continue; (linesByRo[rid] = linesByRo[rid] || []).push(lines[i]); }

  var mappedAll = orders.map(function (r) { return roMapOrder_(r, linesByRo); });
  var f = roNormalizeFilters_(payload.filters, payload.search);
  var filtered = roFilterOrders_(mappedAll, f);
  var sorted = roSortOrders_(filtered, payload.sort);
  var pageResult = roPaginate_(sorted, payload.page);

  return {
    filters: { options: (include.filterOptions !== false) ? roBuildFilterOptions_(mappedAll) : null, applied: f },
    summary: (include.summary !== false) ? roBuildSummary_(filtered) : null,
    requestOrders: (include.orders !== false) ? pageResult.items : [],
    detailsByRequestOrderId: (include.details !== false) ? roBuildDetails_(pageResult.items, linesByRo) : {},
    // raw master passthrough subsets the page adapter re-normalizes (allocation popup + create-modal masters). These are
    // small/bounded Phase-1 tables; passing raw guarantees the adapter reproduces the legacy getters exactly.
    lineSources: lineSources,
    warehouses: warehouses,
    skuDetails: skuDetails,
    supplierPriceList: supplierPriceList,
    pagination: { pageNumber: pageResult.pageNumber, pageSize: pageResult.pageSize, totalItems: pageResult.totalItems, totalPages: pageResult.totalPages }
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function roWsRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function roWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { RO_WS_SEQ_++; return RO_WS_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      // OPTIONAL (documented-pending) table absent → empty, never a SCHEMA_NOT_PROVISIONED throw. Provisioned tables
      // stay fail-closed via prodRequireSheet_.
      if (optional && !ss.getSheetByName(name)) return [];
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return roWsRowsToObjects_(sheet);
    }
  };
}

function handleRequestOrderWorkspaceGet_(body, io) {
  io = io || roWorkspaceDefaultIo_();
  var t0 = io.now();
  var reqId = roMakeRequestId_(body && body.requestId, io);
  try {
    var payload = (body && body.payload) || {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < RO_WORKSPACE_TABLES_.length; i++) {
      var spec = RO_WORKSPACE_TABLES_[i];
      tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true);
      readCount++;
    }
    var vm = roWorkspaceBuild_(tables, payload);
    return roBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'RO_WORKSPACE_BUILD_FAILED';
    return roBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
