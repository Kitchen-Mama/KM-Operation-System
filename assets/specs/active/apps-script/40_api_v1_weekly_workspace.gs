/**
 * 40_api_v1_weekly_workspace.gs
 * Kitchen Mama Operation System — API v1 · Weekly Shipping Plan READ-ONLY Workspace (Phase API-2).
 *
 * SOURCE MIRROR / NOT DEPLOYED. The FIRST real Workspace resolver server owner. Read-only:
 *   action = "weeklyShipping.workspace.get"  (dispatched from 01_router.gs doPost; a body-carrying READ, no write).
 *
 * Contract:
 *   - reads ONLY the Weekly tables (shipping_plans, shipping_plan_lines, warehouses, carriers) — NEVER the
 *     whole-DB getOperationDb (44 tabs);
 *   - one server execution: open+validate the exact bound Spreadsheet ONCE, read each required table ONCE,
 *     build header maps once, filter/join/group in memory, return ONE bounded page-oriented View Model;
 *   - preserves S0/S0.5: exact Spreadsheet-ID gate, validate-only sheet/column presence (NEVER create/repair/
 *     append/migrate). Missing Sheet / missing required column / wrong target FAIL CLOSED with a token;
 *   - authors NO business logic: no status transition, no quantity math beyond summing existing line qty for a
 *     display total, no recommendation, no submit, no reservation, no write.
 *
 * Testability: every pure builder below is a `function` declaration (extract+eval friendly). The one impure
 * orchestrator `handleWeeklyShippingWorkspaceGet_(body, io)` takes an injectable `io` (now/nextSeq/openTarget/
 * readTable) so it runs deterministically against fixtures with ZERO SpreadsheetApp. Wall-clock / sequence live
 * ONLY in the API diagnostic layer (io), never in the pure builder.
 */

var WEEKLY_WS_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

// The minimum Weekly table set + the columns the builder keys on (presence-checked, order-independent).
var WEEKLY_WORKSPACE_TABLES_ = [
  { name: 'shipping_plans',      requiredCols: ['shipping_plan_id', 'status'] },
  { name: 'shipping_plan_lines', requiredCols: ['shipping_plan_id', 'sku'] },
  { name: 'warehouses',          requiredCols: ['warehouse_id'] },
  { name: 'carriers',            requiredCols: ['carrier_id'] }
];

// Allow-listed sort fields (View-Model field → raw comparator). Anything else → VALIDATION_FAILED.
var WEEKLY_WS_SORT_FIELDS_ = {
  'updated_at': 1, 'updatedAt': 1, 'status': 1, 'company': 1, 'country': 1, 'marketplace': 1,
  'total_qty': 1, 'totalQty': 1, 'plan_version': 1, 'planVersion': 1, 'plan_id': 1, 'planId': 1
};

// Canonical Weekly status → display label (raw status is ALWAYS retained; this is display only). Unknown status
// falls back to a humanized code. Mirrors the backend status authority — no NEW status enum is introduced.
var WEEKLY_WS_STATUS_LABELS_ = {
  draft: 'Draft', pending_approval: 'Pending Approval', approved: 'Approved', site_confirmed: 'Site Confirmed',
  rejected: 'Rejected', cancelled: 'Cancelled', completed: 'Completed', submitted: 'Submitted', open: 'Open'
};

var WEEKLY_WS_PAGE_MAX_ = 100;
var WEEKLY_WS_PAGE_DEFAULT_ = 25;

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock / no Spreadsheet)
// --------------------------------------------------------------------------------------------------------
function weeklyWsStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function weeklyWsNum_(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
function weeklyWsLc_(v) { return weeklyWsStr_(v).toLowerCase(); }

function weeklyStatusLabel_(status) {
  var s = weeklyWsLc_(status);
  if (Object.prototype.hasOwnProperty.call(WEEKLY_WS_STATUS_LABELS_, s)) return WEEKLY_WS_STATUS_LABELS_[s];
  if (s === '') return '';
  return weeklyWsStr_(status).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });   // humanize unknown
}

// correlation id: keep a valid client-provided id; otherwise mint a safe server id from the injected sequence.
function weeklyMakeRequestId_(provided, io) {
  var p = weeklyWsStr_(provided);
  if (/^REQ-[A-Za-z0-9_-]{1,40}$/.test(p)) return p;
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var padded = ('000000' + seq).slice(-6);
  return 'REQ-S' + padded;
}

function weeklyBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'weeklyShipping.workspace.get', workspace: 'weeklyShipping', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

function weeklyIndexBy_(rows, key) {
  var idx = {}; for (var i = 0; i < (rows || []).length; i++) { var id = weeklyWsStr_(rows[i][key]); if (id !== '' && !idx[id]) idx[id] = rows[i]; } return idx;
}

function weeklyNormalizeFilters_(filters, search) {
  filters = filters || {};
  function f(v) { var s = weeklyWsStr_(v); return s === '' ? null : s; }
  return {
    company: f(filters.company), country: f(filters.country), marketplace: f(filters.marketplace),
    status: f(filters.status), planningCycle: f(filters.planningCycle),
    sourceWarehouseId: f(filters.sourceWarehouseId), destinationWarehouseId: f(filters.destinationWarehouseId),
    search: (function () { var s = weeklyWsStr_(search); return s === '' ? null : s.toLowerCase(); })()
  };
}

function weeklyWarehouseRef_(id, whIndex) {
  var w = whIndex[weeklyWsStr_(id)];
  return { id: weeklyWsStr_(id), code: w ? weeklyWsStr_(w.warehouse_code) : '', name: w ? weeklyWsStr_(w.warehouse_name) : '' };
}

function weeklyMapLine_(r) {
  return {
    lineId: weeklyWsStr_(r.shipping_plan_line_id), planId: weeklyWsStr_(r.shipping_plan_id),
    sku: weeklyWsStr_(r.sku), siteSku: weeklyWsStr_(r.site_sku), marketplace: weeklyWsStr_(r.marketplace),
    requestedQty: weeklyWsNum_(r.requested_qty) || 0, approvedQty: weeklyWsNum_(r.approved_qty) || 0,
    cartonQty: weeklyWsNum_((r.plan_carton_qty === '' || r.plan_carton_qty == null) ? r.carton_qty : r.plan_carton_qty) || 0,
    unitsPerCarton: weeklyWsNum_(r.units_per_carton) || 0,
    status: weeklyWsStr_(r.line_status || r.status), statusLabel: weeklyStatusLabel_(r.line_status || r.status),
    note: weeklyWsStr_(r.note), flags: [],
    raw: r   // API-3A §22 read-only passthrough (same shipping_plan_lines table already read)
  };
}
// display total = sum of the line's effective qty (approved when present else requested). NOT a recommendation.
function weeklyLineQty_(r) { var a = weeklyWsNum_(r.approved_qty); return (a && a > 0) ? a : (weeklyWsNum_(r.requested_qty) || 0); }

function weeklyMapPlan_(r, whIndex, carrierIndex, linesByPlan) {
  var planId = weeklyWsStr_(r.shipping_plan_id);
  var lines = linesByPlan[planId] || [];
  var totalQty = 0; for (var i = 0; i < lines.length; i++) totalQty += weeklyLineQty_(lines[i]);
  var carrier = carrierIndex[weeklyWsStr_(r.carrier_id)];
  return {
    planId: planId, planNo: weeklyWsStr_(r.shipping_plan_no), planName: weeklyWsStr_(r.plan_name),
    planningCycle: weeklyWsStr_(r.planning_cycle), company: weeklyWsStr_(r.company), country: weeklyWsStr_(r.country),
    marketplace: weeklyWsStr_(r.marketplace), status: weeklyWsStr_(r.status), statusLabel: weeklyStatusLabel_(r.status),
    sourceWarehouse: weeklyWarehouseRef_(r.source_warehouse_id, whIndex),
    destinationWarehouse: weeklyWarehouseRef_(r.destination_warehouse_id, whIndex),
    shippingMethod: weeklyWsStr_(r.shipping_method), lastMileDelivery: weeklyWsStr_(r.last_mile_delivery), customsType: weeklyWsStr_(r.customs_type),
    carrier: { id: weeklyWsStr_(r.carrier_id), name: carrier ? weeklyWsStr_(carrier.carrier_name) : '' },
    planVersion: weeklyWsNum_(r.plan_version) || 1,
    totalQty: totalQty,
    estimatedCost: weeklyWsNum_(r.estimated_total_cost),
    currency: weeklyWsStr_(r.currency) || null,
    updatedAt: weeklyWsStr_(r.updated_at) || null,
    lineCount: lines.length, flags: [],
    // API-3A §22 read-only passthrough: the source row (same shipping_plans table already read). Lets a page
    // adapter reproduce the existing render's canonical fields without broadening table scope. Read-only.
    raw: r
  };
}

function weeklyFilterPlans_(mapped, f) {
  return mapped.filter(function (p) {
    if (f.company && p.company !== f.company) return false;
    if (f.country && p.country !== f.country) return false;
    if (f.marketplace && p.marketplace !== f.marketplace) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.planningCycle && p.planningCycle !== f.planningCycle) return false;
    if (f.sourceWarehouseId && p.sourceWarehouse.id !== f.sourceWarehouseId) return false;
    if (f.destinationWarehouseId && p.destinationWarehouse.id !== f.destinationWarehouseId) return false;
    if (f.search) { var hay = (p.planId + ' ' + p.planNo + ' ' + p.planName + ' ' + p.company + ' ' + p.country + ' ' + p.marketplace).toLowerCase(); if (hay.indexOf(f.search) < 0) return false; }
    return true;
  });
}

function weeklySortPlans_(rows, sort) {
  var spec = (Array.isArray(sort) && sort.length) ? sort[0] : { field: 'updated_at', direction: 'desc' };
  var field = weeklyWsStr_(spec.field) || 'updated_at';
  if (!WEEKLY_WS_SORT_FIELDS_[field]) { var e = new Error('invalid sort field: ' + field); e.validationCode = 'VALIDATION_FAILED'; throw e; }
  var dir = weeklyWsLc_(spec.direction) === 'asc' ? 1 : -1;
  function val(p) {
    switch (field) {
      case 'updated_at': case 'updatedAt': return weeklyWsStr_(p.updatedAt);
      case 'status': return weeklyWsStr_(p.status);
      case 'company': return weeklyWsStr_(p.company);
      case 'country': return weeklyWsStr_(p.country);
      case 'marketplace': return weeklyWsStr_(p.marketplace);
      case 'total_qty': case 'totalQty': return p.totalQty;
      case 'plan_version': case 'planVersion': return p.planVersion;
      default: return weeklyWsStr_(p.planId);
    }
  }
  var copy = rows.slice();
  copy.sort(function (a, b) {
    var va = val(a), vb = val(b), c;
    if (typeof va === 'number' && typeof vb === 'number') c = (va < vb ? -1 : va > vb ? 1 : 0);
    else c = (String(va) < String(vb) ? -1 : String(va) > String(vb) ? 1 : 0);
    if (c !== 0) return c * dir;
    return a.planId < b.planId ? -1 : a.planId > b.planId ? 1 : 0;   // deterministic tie-break (always asc)
  });
  return copy;
}

function weeklyPaginate_(rows, page) {
  page = page || {};
  var size = weeklyWsNum_(page.size); size = (size && size > 0) ? Math.min(Math.floor(size), WEEKLY_WS_PAGE_MAX_) : WEEKLY_WS_PAGE_DEFAULT_;
  var number = weeklyWsNum_(page.number); number = (number && number > 0) ? Math.floor(number) : 1;
  var total = rows.length, totalPages = size > 0 ? Math.ceil(total / size) : 0;
  var start = (number - 1) * size;
  var items = (start >= 0 && start < total) ? rows.slice(start, start + size) : [];
  return { items: items, pageNumber: number, pageSize: size, totalItems: total, totalPages: totalPages };
}

function weeklyBuildSummary_(filteredPlans) {
  var totalUnits = 0, draft = 0, approved = 0, cancelled = 0, byCcy = {};
  for (var i = 0; i < filteredPlans.length; i++) {
    var p = filteredPlans[i]; totalUnits += (p.totalQty || 0);
    var s = weeklyWsLc_(p.status);
    if (s === 'draft') draft++; if (s === 'approved') approved++; if (s === 'cancelled') cancelled++;
    if (p.estimatedCost != null && p.currency) { byCcy[p.currency] = (byCcy[p.currency] || 0) + p.estimatedCost; }
  }
  var currencySummary = Object.keys(byCcy).sort().map(function (c) { return { currency: c, amount: byCcy[c] }; });
  return {
    totalPlans: filteredPlans.length, draftPlans: draft, approvedPlans: approved, cancelledPlans: cancelled,
    totalUnits: totalUnits,
    estimatedCost: (currencySummary.length === 1 ? currencySummary[0].amount : null),   // never aggregate across currencies
    currencySummary: currencySummary
  };
}

function weeklyBuildFilterOptions_(mappedAll, warehouses) {
  function uniq(arr) { var seen = {}, out = []; arr.forEach(function (v) { var k = weeklyWsStr_(v); if (k !== '' && !seen[k]) { seen[k] = 1; out.push(k); } }); return out.sort(); }
  var whById = {}; (warehouses || []).forEach(function (w) { var id = weeklyWsStr_(w.warehouse_id); if (id && !whById[id]) whById[id] = { warehouseId: id, warehouseCode: weeklyWsStr_(w.warehouse_code), name: weeklyWsStr_(w.warehouse_name), type: weeklyWsStr_(w.warehouse_type) }; });
  function whOpts(ids) { return uniq(ids).map(function (id) { return whById[id] || { warehouseId: id, warehouseCode: '', name: '', type: '' }; }); }
  return {
    companies: uniq(mappedAll.map(function (p) { return p.company; })),
    countries: uniq(mappedAll.map(function (p) { return p.country; })),
    marketplaces: uniq(mappedAll.map(function (p) { return p.marketplace; })),
    statuses: uniq(mappedAll.map(function (p) { return p.status; })).map(function (s) { return { status: s, statusLabel: weeklyStatusLabel_(s) }; }),
    planningCycles: uniq(mappedAll.map(function (p) { return p.planningCycle; })),
    sourceWarehouses: whOpts(mappedAll.map(function (p) { return p.sourceWarehouse.id; })),
    destinationWarehouses: whOpts(mappedAll.map(function (p) { return p.destinationWarehouse.id; }))
  };
}

function weeklyBuildDetails_(pagePlans, linesByPlan) {
  var out = {};
  for (var i = 0; i < pagePlans.length; i++) {
    var id = pagePlans[i].planId, lines = linesByPlan[id] || [];
    out[id] = { lines: lines.map(weeklyMapLine_), notes: [], readiness: {}, issues: [] };
  }
  return out;
}

function weeklyDataVersion_(filteredPlans) {
  var latest = ''; for (var i = 0; i < filteredPlans.length; i++) { var u = weeklyWsStr_(filteredPlans[i].updatedAt); if (u > latest) latest = u; }
  return { sourceDataAsOf: latest || null, latestUpdatedAt: latest || null };
}

// The pure orchestrator: raw tables + request payload → bounded page-oriented View Model.
function weeklyWorkspaceBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var plans = tables.shipping_plans || [], lines = tables.shipping_plan_lines || [];
  var warehouses = tables.warehouses || [], carriers = tables.carriers || [];
  var include = payload.include || { summary: true, plans: true, details: true, filterOptions: true };

  var whIndex = weeklyIndexBy_(warehouses, 'warehouse_id');
  var carrierIndex = weeklyIndexBy_(carriers, 'carrier_id');
  var linesByPlan = {}; for (var i = 0; i < lines.length; i++) { var pid = weeklyWsStr_(lines[i].shipping_plan_id); if (pid === '') continue; (linesByPlan[pid] = linesByPlan[pid] || []).push(lines[i]); }

  var mappedAll = plans.map(function (r) { return weeklyMapPlan_(r, whIndex, carrierIndex, linesByPlan); });
  var f = weeklyNormalizeFilters_(payload.filters, payload.search);
  var filtered = weeklyFilterPlans_(mappedAll, f);
  var sorted = weeklySortPlans_(filtered, payload.sort);
  var pageResult = weeklyPaginate_(sorted, payload.page);

  return {
    filters: { options: (include.filterOptions !== false) ? weeklyBuildFilterOptions_(mappedAll, warehouses) : null, applied: f },
    summary: (include.summary !== false) ? weeklyBuildSummary_(filtered) : null,
    plans: (include.plans !== false) ? pageResult.items : [],
    detailsByPlanId: (include.details !== false) ? weeklyBuildDetails_(pageResult.items, linesByPlan) : {},
    pagination: { pageNumber: pageResult.pageNumber, pageSize: pageResult.pageSize, totalItems: pageResult.totalItems, totalPages: pageResult.totalPages },
    dataVersion: weeklyDataVersion_(filtered)
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function weeklyRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function weeklyWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },                              // API diagnostic layer only
    nextSeq: function () { WEEKLY_WS_SEQ_++; return WEEKLY_WS_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);   // fail closed on empty config
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);                                        // S0-5 exact-ID gate (redundant, defense in depth)
      return ss;
    },
    readTable: function (ss, name, requiredCols) {
      var sheet = prodRequireSheet_(ss, name, []);                        // validate-only: exists + header present, no repair
      prodRequireColumns_(sheet, requiredCols);                          // presence-only, order-independent (fail closed if missing)
      return weeklyRowsToObjects_(sheet);
    }
  };
}

function handleWeeklyShippingWorkspaceGet_(body, io) {
  io = io || weeklyWorkspaceDefaultIo_();
  var t0 = io.now();
  var reqId = weeklyMakeRequestId_(body && body.requestId, io);
  try {
    var payload = (body && body.payload) || {};
    var ss = io.openTarget();                                            // exact-ID validated / fail closed
    var tables = {}, readCount = 0;
    for (var i = 0; i < WEEKLY_WORKSPACE_TABLES_.length; i++) {
      var spec = WEEKLY_WORKSPACE_TABLES_[i];
      tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols); // one read per required table, this execution
      readCount++;
    }
    var vm = weeklyWorkspaceBuild_(tables, payload);
    return weeklyBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'WEEKLY_WORKSPACE_BUILD_FAILED';
    return weeklyBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
