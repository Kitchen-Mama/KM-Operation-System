/**
 * 60_api_v1_inventory_replenishment_workspace.gs
 * Kitchen Mama Operation System — API v1 · Inventory Replenishment READ-ONLY Workspace (Phase API / F1-7I).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped read owner for the active Inventory Replenishment page primary
 * render (inventory-replenishment.js `_getCloudReplenishmentData` main table). Action = "inventoryReplenishment.workspace.get"
 * (a body-carrying READ, no write).
 *
 * SCOPE — PRIMARY-RENDER READ MODEL / COMPOSER ONLY. Reads ONLY the table set the page's main-table assembly consumes
 * (the 19 tables `_getCloudReplenishmentData` reads via its local get()) — never getOperationDb. It is the LARGEST
 * workspace because the Inventory Replenishment main table is genuinely a broad read model; it still bounds the read to
 * exactly this page's tables (19) instead of the ~44-tab getOperationDb, and removes the page's global-cache dependency.
 *   marketplaces, marketplace_skus, sku_details, warehouses                         (identity / master / scope)
 *   amazon_inventory_snapshot, amazon_inventory_health_snapshot,
 *   amazon_daily_sales_snapshot, amazon_weekly_sales_snapshot                        (site stock + sales velocity + LTS)
 *   fc_regular_forecast, fc_target_rules, fc_special_events                          (forecast context)
 *   overseas_inventory_snapshot, factory_stock                                        (3PL + factory pools)
 *   shipments, shipment_lines, shipping_plans, shipping_plan_lines                    (incoming reconstruction + lineage)
 *   shipping_allocation_drafts, shipping_allocation_draft_lines                       (existing draft context in the row)
 *
 * NOT served here (they stay on their EXISTING separate scoped owners — this workspace does NOT duplicate them):
 *   Inventory Gap        → inventoryReplenishmentGap.get (43_/46_)      [canonical planning fact, read verbatim]
 *   Recommendation       → recommendation.workspace.get (42_)           [canonical planning fact]
 *   Allocation-draft SSOT→ getShippingAllocationDraftWorkspace (16_)    [scoped working-draft readback]
 *
 * AUTHORITY — reads only; authors NO business logic and NO write side effects. It runs NO Gap, NO Recommendation, NO
 * inventory allocation, NO Open-PO-Remaining, NO FIFO, NO PO shipped/remaining, and creates NO Request Order / Purchase
 * Order (FLOW-A boundary: Inventory Gap → Recommendation → Shipping Plan → Shipment, never Request Order). It does NOT
 * initialize Factory Stock (that stays with master-SKU creation) and does NOT change the marketplace-SKU trigger boundary.
 * The incoming-inventory reconstruction (MAX(0, shipment_qty − shipment_received_qty) + ETA bucketing + shipping-plan
 * lineage receiver attribution) stays PRESENTATION-SIDE over these raw rows (a documented deferred authority item,
 * INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED) — this workspace only transports the persisted rows verbatim.
 *
 * FULL-SET (NOT server-filtered) BY DESIGN — BEFORE == AFTER. The page derives its scope (Country + Marketplace →
 * Company) and filters/assembles per-SKU rows CLIENT-side; reproducing that scope filter server-side would risk drift.
 * So the workspace returns raw passthrough of the tables (bounded by a non-silent `capped` backstop) and the client
 * assembly runs unchanged. (Server-side scope reduction is a documented future optimization, not this transport round.)
 *
 * Testability: pure `sirWorkspaceBuild_` is a `function` declaration (extract+eval friendly). The impure orchestrator
 * `handleInventoryReplenishmentWorkspaceGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO
 * SpreadsheetApp.
 */

var SIR_WS_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

// Structural masters fail-closed on missing schema; the data/snapshot/import tables are missing-safe ([] when absent —
// matching the browser's `_opDbCache.X || []` graceful-empty, so an unprovisioned import tab never spuriously errors).
var SIR_WORKSPACE_TABLES_ = [
  { name: 'marketplaces',                    requiredCols: ['marketplace_id'] },
  { name: 'marketplace_skus',                requiredCols: ['sku'] },
  { name: 'sku_details',                     requiredCols: ['sku'] },
  { name: 'warehouses',                      requiredCols: ['warehouse_id'] },
  { name: 'amazon_inventory_snapshot',        requiredCols: [], optional: true },
  { name: 'amazon_inventory_health_snapshot', requiredCols: [], optional: true },
  { name: 'amazon_daily_sales_snapshot',      requiredCols: [], optional: true },
  { name: 'amazon_weekly_sales_snapshot',     requiredCols: [], optional: true },
  { name: 'fc_regular_forecast',             requiredCols: [], optional: true },
  { name: 'fc_target_rules',                 requiredCols: [], optional: true },
  { name: 'fc_special_events',               requiredCols: [], optional: true },
  { name: 'overseas_inventory_snapshot',      requiredCols: [], optional: true },
  { name: 'factory_stock',                   requiredCols: [], optional: true },
  { name: 'shipments',                       requiredCols: [], optional: true },
  { name: 'shipment_lines',                  requiredCols: [], optional: true },
  { name: 'shipping_plans',                  requiredCols: [], optional: true },
  { name: 'shipping_plan_lines',             requiredCols: [], optional: true },
  { name: 'shipping_allocation_drafts',       requiredCols: [], optional: true },
  { name: 'shipping_allocation_draft_lines',  requiredCols: [], optional: true },
  // F1-7J-A2: carrier reference tables for the SECONDARY Execution-Plan panel (ETA + method options). INCLUDE-gated
  // ('carrierPlanning') + missing-safe — NOT read on the primary render (no read cost, base payload unchanged) unless
  // the caller sets include.carrierPlanning. Reference data only; the workspace authors NO carrier selection/booking.
  { name: 'carrier_lead_times', requiredCols: [], optional: true, include: 'carrierPlanning' },
  { name: 'carrier_rate_cards', requiredCols: [], optional: true, include: 'carrierPlanning' }
];

// Generous safety backstop. In real data these tables are well under this; the cap only guards a runaway payload and is
// reported via `capped` so truncation is NEVER silent (would break BEFORE==AFTER).
var SIR_WS_ROW_MAX_ = 80000;

// --------------------------------------------------------------------------------------------------------
// PURE helpers
// --------------------------------------------------------------------------------------------------------
function sirWsStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function sirBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'inventoryReplenishment.workspace.get', workspace: 'inventoryReplenishment', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

function sirCap_(rows) {
  rows = rows || [];
  if (rows.length <= SIR_WS_ROW_MAX_) return { rows: rows, capped: false, total: rows.length };
  return { rows: rows.slice(0, SIR_WS_ROW_MAX_), capped: true, total: rows.length };
}

// The pure orchestrator: raw tables → ONE bounded View Model. Every array is RAW passthrough (each source row unmodified)
// so the page adapter reproduces the existing assembly byte-for-byte via the SAME db-api normalizers.
function sirWorkspaceBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var include = (payload && payload.include && typeof payload.include === 'object') ? payload.include : {};
  var out = { summary: null, capped: {}, counts: {} };
  var summary = {};
  for (var i = 0; i < SIR_WORKSPACE_TABLES_.length; i++) {
    var spec = SIR_WORKSPACE_TABLES_[i];
    var name = spec.name;
    if (spec.include && !include[spec.include]) continue;   // F1-7J-A2: skip un-requested include tables → base payload identical (BEFORE==AFTER)
    var c = sirCap_(tables[name] || []);
    out[name] = c.rows;                 // raw passthrough, keyed by table name
    out.capped[name] = c.capped;
    out.counts[name] = c.total;
    summary[name] = c.total;
  }
  out.summary = (include.summary === false) ? null : summary;
  return out;
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function sirWsRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function sirWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { SIR_WS_SEQ_++; return SIR_WS_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      if (optional && !ss.getSheetByName(name)) return [];
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return sirWsRowsToObjects_(sheet);
    }
  };
}

function handleInventoryReplenishmentWorkspaceGet_(body, io) {
  io = io || sirWorkspaceDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = sirWsStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  try {
    var payload = (body && body.payload) || {};
    var include = (payload && payload.include && typeof payload.include === 'object') ? payload.include : {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < SIR_WORKSPACE_TABLES_.length; i++) {
      var spec = SIR_WORKSPACE_TABLES_[i];
      if (spec.include && !include[spec.include]) continue;   // F1-7J-A2: skip un-requested include tables (no read cost)
      tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true);
      readCount++;
    }
    var vm = sirWorkspaceBuild_(tables, payload);
    return sirBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'INVENTORY_REPLENISHMENT_WORKSPACE_BUILD_FAILED';
    return sirBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
