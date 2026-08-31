/**
 * 70_api_v1_overseas_stock_workspace.gs
 * Kitchen Mama Operation System — API v1 · OVERSEAS STOCK READ-ONLY Workspace (F1-7N-FB-4E-R3 §C).
 *
 * SOURCE MIRROR / requires Apps Script sync. Action = "overseasStock.workspace.get" — a body-carrying READ.
 *
 * WHY THIS EXISTS, MEASURED RATHER THAN ASSUMED. FB-4E established that Overseas Inventory still mounted through
 * a FOUR-TABLE `getTable` fan-out and had no scoped workspace action, and set an explicit decision gate: if the
 * fan-out dominates the mount, replace it with one scoped workspace DTO. R3 §A measured the mount at FOUR
 * requests — and on Apps Script each request is a separate Web App EXECUTION, so four is four cold starts, four
 * spreadsheet opens and four round trips for one page. That is the gate satisfied, and this is the replacement:
 * ONE request.
 *
 * SCOPE — exactly the four tables the page reads, never getOperationDb:
 *     overseas_inventory_snapshot     the page's subject: stock rows                          [rows: ALL]
 *     overseas_inventory_movements    the Movement Log                                        [rows: ALL]
 *     warehouses                      joined for company / country / warehouse_name           [rows: FILTERED]
 *     sku_details                     joined for category / series, and the import template   [cols: PROJECTED]
 *
 * WHAT IS NARROWED SERVER-SIDE, AND WHY EACH ONE IS MECHANICALLY SAFE (§C.3). A projection that is too narrow
 * fails SILENTLY — a field simply renders blank — so each is justified against the call site that reads it, and
 * anything not provable is left alone rather than guessed at:
 *
 *   warehouses ROWS. `_overseasWarehouseMap()` builds warehouse_id -> the WHOLE ROW, so no column may be
 *     dropped; columns are passed through untouched. Rows are narrowed to the union of (a) warehouses flagged
 *     is_overseas_warehouse and (b) every warehouse_id actually referenced by a returned snapshot or movement
 *     row. That union is provably sufficient: a join can only look up an id that appears in the returned rows.
 *
 *   sku_details COLUMNS. This is the byte win — sku_details is the widest table in the database and Overseas
 *     Stock reads four things from it. `_overseasSkuMetaMap()` reads `sku`, `category`, `series`; the lifecycle
 *     badge reads `lifecycle`. `product_name` and `units_per_carton` are ALSO included although the page does
 *     not currently read them: they are identity/label fields, the cost is two columns, and the failure modes
 *     are asymmetric — too narrow renders a blank cell that nobody traces back to here, too wide costs bytes.
 *     That asymmetry is the whole argument for the wider set, and it is stated rather than left implicit.
 *
 *   sku_details ROWS ARE **NOT** NARROWED, and this is the one that looks wrong until you check the second call
 *     site. Filtering to the SKUs present in the snapshot would be a big further saving and would BREAK the
 *     page: the CSV import template (`_downloadOverseasCsvTemplate_`) builds its SKU dropdown from ALL
 *     sku_details rows, and its entire purpose is to add snapshot rows for SKUs that are NOT in the snapshot
 *     yet. A snapshot-scoped filter would silently make exactly the SKUs the operator needs unselectable.
 *
 * AUTHORITY — READS ONLY. Writes nothing, takes no lock, creates no sheet, derives no quantity, and authors no
 * business rule. Every returned array is RAW PASSTHROUGH of persisted rows (subject only to the row filter and
 * column projection above), so the client normalizes it with the SAME normalizeOperationDb it already uses and
 * the render is unchanged: BEFORE == AFTER. Snapshot semantics, movement log, filters, quantities and warning
 * thresholds all stay exactly where they are — on the client, computed from the same rows.
 *
 * Testability: the pure builder `oswWorkspaceBuild_` is a `function` declaration (extract+eval friendly), and
 * the impure orchestrator takes an injectable `io` so it runs against fixtures with ZERO SpreadsheetApp.
 */

// Deployment build stamp for the OVERSEAS WORKSPACE OWNER. New in R3.
var OSW_BUILD_VERSION_ = 'F1-7N-FB-4E-R3';

var OSW_WS_SEQ_ = 0;   // server correlation counter (diagnostic layer, not business runtime)

var OSW_WORKSPACE_TABLES_ = [
  { name: 'overseas_inventory_snapshot',  requiredCols: ['warehouse_id', 'sku'] },
  { name: 'overseas_inventory_movements', requiredCols: [], optional: true },
  { name: 'warehouses',                   requiredCols: ['warehouse_id'] },
  { name: 'sku_details',                  requiredCols: ['sku'] }
];

// The sku_details columns this page can actually use. See the header note for why this exact set.
var OSW_SKU_COLUMNS_ = ['sku', 'product_name', 'category', 'series', 'lifecycle', 'units_per_carton'];

// Generous safety backstop. Never silently applied: truncation is reported through `capped`, because a silently
// shortened table would be a change in what the page shows while looking like a successful read.
var OSW_WS_ROW_MAX_ = 50000;

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock, no Spreadsheet)
// --------------------------------------------------------------------------------------------------------
function oswStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function oswTrue_(v) {
  if (v === true) return true;
  var s = oswStr_(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function oswBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'overseasStock.workspace.get',
    workspace: 'overseasStock', build: OSW_BUILD_VERSION_, read_only: true, db_writes: 0, cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

function oswCap_(rows) {
  rows = rows || [];
  if (rows.length <= OSW_WS_ROW_MAX_) return { rows: rows, capped: false, total: rows.length };
  return { rows: rows.slice(0, OSW_WS_ROW_MAX_), capped: true, total: rows.length };
}

// Keep only the named columns, and ONLY when the row actually carries them. A column that is absent from the
// sheet stays absent rather than being invented as an empty string, so a schema gap remains visible downstream.
function oswProject_(rows, columns) {
  return (rows || []).map(function (r) {
    var o = {};
    for (var i = 0; i < columns.length; i++) {
      var c = columns[i];
      if (Object.prototype.hasOwnProperty.call(r, c)) o[c] = r[c];
    }
    return o;
  });
}

// The warehouse rows a client join could possibly need: overseas-flagged, plus every id referenced by the rows
// being returned. Column-complete on purpose — the page maps warehouse_id to the whole row.
function oswRelevantWarehouses_(warehouses, snapshot, movements) {
  var referenced = {};
  (snapshot || []).forEach(function (r) { var id = oswStr_(r.warehouse_id); if (id) referenced[id] = 1; });
  (movements || []).forEach(function (r) { var id = oswStr_(r.warehouse_id); if (id) referenced[id] = 1; });
  return (warehouses || []).filter(function (w) {
    return oswTrue_(w.is_overseas_warehouse) || referenced[oswStr_(w.warehouse_id)] === 1;
  });
}

// The pure orchestrator: raw tables in, ONE bounded Overseas Stock read model out.
function oswWorkspaceBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var include = (payload && payload.include && typeof payload.include === 'object') ? payload.include : {};

  var rawSnapshot = tables.overseas_inventory_snapshot || [];
  var rawMovements = tables.overseas_inventory_movements || [];
  var rawWarehouses = tables.warehouses || [];
  var rawSkus = tables.sku_details || [];

  var snapshot = oswCap_(rawSnapshot);
  var movements = oswCap_(rawMovements);
  var warehouses = oswCap_(oswRelevantWarehouses_(rawWarehouses, snapshot.rows, movements.rows));
  var skus = oswCap_(oswProject_(rawSkus, OSW_SKU_COLUMNS_));

  return {
    summary: (include.summary === false) ? null : {
      snapshotCount: snapshot.total,
      movementCount: movements.total,
      warehouseCount: warehouses.total,
      skuCount: skus.total
    },
    // RAW PASSTHROUGH under the sheet's own column names, so the client's existing normalizers apply unchanged.
    overseas_inventory_snapshot: snapshot.rows,
    overseas_inventory_movements: movements.rows,
    warehouses: warehouses.rows,
    sku_details: skus.rows,
    // What was narrowed, stated in the answer rather than only in this file, so a page can report it and a test
    // can assert it without reading source.
    projection: {
      sku_details_columns: OSW_SKU_COLUMNS_.slice(),
      warehouses_rows: 'overseas-flagged UNION referenced-by-returned-rows',
      sku_details_rows: 'ALL (the CSV import template needs SKUs that are not in the snapshot yet)',
      warehouses_total_before_filter: (rawWarehouses || []).length
    },
    capped: { overseas_inventory_snapshot: snapshot.capped, overseas_inventory_movements: movements.capped,
      warehouses: warehouses.capped, sku_details: skus.capped },
    counts: { overseas_inventory_snapshot: snapshot.total, overseas_inventory_movements: movements.total,
      warehouses: warehouses.total, sku_details: skus.total }
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator
// --------------------------------------------------------------------------------------------------------
function oswWsRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var o = {}, blank = true;
    for (var c = 0; c < headers.length; c++) {
      o[headers[c]] = data[r][c];
      if (String(data[r][c]).trim() !== '') blank = false;
    }
    if (!blank) out.push(o);
  }
  return out;
}

function oswWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { OSW_WS_SEQ_++; return OSW_WS_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      if (optional && !ss.getSheetByName(name)) return [];
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return oswWsRowsToObjects_(sheet);
    }
  };
}

function handleOverseasStockWorkspaceGet_(body, io) {
  io = io || oswWorkspaceDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = oswStr_(body && body.requestId) || ('REQ-O' + ('000000' + seq).slice(-6));
  try {
    var payload = (body && body.payload) || {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < OSW_WORKSPACE_TABLES_.length; i++) {
      var spec = OSW_WORKSPACE_TABLES_[i];
      tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true);
      readCount++;
    }
    var vm = oswWorkspaceBuild_(tables, payload);
    return oswBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'OVERSEAS_STOCK_WORKSPACE_BUILD_FAILED';
    return oswBuildEnvelope_(false, null,
      [{ code: code, message: String((e && e.message) || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
