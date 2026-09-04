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

// F1-7N-FC-1B-E3-R4-A1 §A1 — 60_ HAD NO BUILD STAMP, AND THAT IS NOW A REPORTABLE RISK.
//
// This file was pure passthrough until R4, so nothing depended on WHICH version answered. It does now: a
// deployment carrying the pre-R4-A1 60_ ignores `payload.recentWindow` and `payload.only` SILENTLY — it
// returns all twenty-one tables and reports no echo — while the browser believes it asked for two. That is
// precisely the shape of failure this round spent its evidence on, and it must be a named fault rather than a
// number someone has to notice is too large.
var SIR_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A1';

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
// F1-7N-FC-1B-E3-R4 §C/§D — THE RECENT-PERIOD PROJECTION.
//
// THE MEASURED ROOT CAUSE OF THE FIRST-LOAD TIMEOUT IS THAT THIS READ HAS NO BOUND ON TIME.
//
// The request carries no scope and this handler has no scope parameter: every call reads twenty-one whole
// sheets and returns every row raw. Naming a company/country/marketplace/sku in the payload changes nothing.
// Two of those tables are the only ones that grow without limit — they gain rows every day forever — and
// they are the two whose consumers read only a recent tail:
//
//   * amazon_daily_sales_snapshot  -> IR.salesTrend7d, which uses exactly SEVEN calendar dates ending on the
//     LATEST date present for that scope. Everything older is read, transferred, parsed and discarded.
//   * amazon_weekly_sales_snapshot -> IR.avgSalesPerDay / IRCountry.weeklyUnits7d, which use the LATEST WEEK
//     row per market and nothing else.
//
// So this keeps, PER SCOPE KEY, that key's own most recent periods — fourteen dates and four weeks, both
// comfortably above the seven days and one week the consumers actually read. The window is per KEY, not an
// absolute date cut, and that is the whole reason the result is unchanged: salesTrend7d anchors on each
// scope's OWN latest date, so a site whose data stopped six months ago still gets its own seven days. An
// absolute cut would have silently emptied that chart, which is exactly the kind of quiet wrongness this
// must not trade for speed.
//
// EQUIVALENCE, stated so it can be checked rather than trusted: for any scope, the rows the consumers read
// are a subset of the last 7 dates / last 1 week of each contributing key, and 14 >= 7 and 4 >= 1. The EU
// roll-up sums member markets, each anchored on its own latest week, so per-key retention covers it too; a
// member whose latest date falls outside the union's seven-day window contributes nothing either way.
//
// IT IS OPT-IN AND IT IS REPORTED. A caller that does not ask for it gets today's payload byte for byte, and
// a caller that does gets `meta.recentWindow` naming the rows dropped per table. A reduction nobody can see
// is indistinguishable from data loss.
var SIR_WS_RECENT_WINDOW_ = {
  amazon_daily_sales_snapshot:  { keyCols: ['company', 'country', 'marketplace', 'sku'], periodCols: ['snapshot_date'], keep: 14 },
  amazon_weekly_sales_snapshot: { keyCols: ['company', 'country', 'marketplace', 'sku'], periodCols: ['week_end_date', 'snapshot_week'], keep: 4 }
};

// F1-7N-FC-1B-E3-R4-A1 §A1 — READ FEWER TABLES, NOT MERELY RETURN FEWER ROWS.
//
// The live evidence changed what the expensive thing is. R4 assumed payload size, because the fixture said
// 101 319 rows; production returns 13 107 and still spends THIRTY-ONE SECONDS of server time doing it. Thirteen
// thousand rows do not take thirty-one seconds to serialize. The cost is opening the spreadsheet and calling
// getDataRange().getValues() twenty-one times, and no amount of trimming the response reaches it.
//
// `only` lets a caller name the tables it actually needs. It is opt-in and it is INTERSECTED with the existing
// include gate rather than replacing it, so a caller cannot use it to reach an include-gated table it did not
// also ask for. An unknown table name is ignored rather than erroring: the caller gets fewer tables, never a
// different contract, and the echo says exactly which ones were honoured.
//
// The FIRST beneficiary is the carrier catalogue. F1-7J-A2 gated the two carrier tables off the primary read;
// FB-4G-A1-R1 then merged them back ON to it, because the alternative at the time was a SECOND read of all
// nineteen other tables to obtain two small ones. With `only` that alternative no longer exists: the catalogue
// is two sheets, not twenty-one, so the merge can be undone and the primary render stops paying for reference
// data a collapsed row never displays.
function sirWsOnlyList_(payload) {
  var raw = (payload && payload.only);
  if (!raw || Object.prototype.toString.call(raw) !== '[object Array]' || !raw.length) return null;
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var n = sirWsStr_(raw[i]);
    if (n && out.indexOf(n) === -1) out.push(n);
  }
  return out.length ? out : null;
}
function sirWsOnlySet_(payload) {
  var list = sirWsOnlyList_(payload);
  if (!list) return null;
  var m = {};
  for (var i = 0; i < list.length; i++) m[list[i]] = true;
  return m;
}

// PURE. Keeps, for each key, the rows whose period is among that key's `keep` most recent DISTINCT periods.
// A row with no readable period is ALWAYS kept: it cannot be placed in time, and dropping what we cannot
// order would be a guess. Returns the rows in their original order (the consumers sort for themselves, but
// order stability keeps BEFORE==AFTER checkable field by field).
function sirWsRecentWindow_(rows, spec) {
  rows = rows || [];
  if (!spec || !(spec.keep > 0) || !rows.length) return { rows: rows, before: rows.length, after: rows.length, dropped: 0 };
  var keyCols = spec.keyCols || [], periodCols = spec.periodCols || [];
  function keyOf(r) {
    var parts = [];
    for (var i = 0; i < keyCols.length; i++) parts.push(sirWsStr_(r[keyCols[i]]).toUpperCase());
    return parts.join('\u0001');
  }
  function periodOf(r) {
    for (var i = 0; i < periodCols.length; i++) {
      var v = r[periodCols[i]];
      // A Date cell must become the same comparable YYYY-MM-DD the sheet's text form would be, or two rows
      // written on the same day by different importers would sort into different periods.
      if (v instanceof Date && !isNaN(v.getTime())) {
        return v.getUTCFullYear() + '-' + ('0' + (v.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + v.getUTCDate()).slice(-2);
      }
      var s = sirWsStr_(v);
      if (s) return s;
    }
    return '';
  }
  // Pass 1: the distinct periods each key actually has.
  var seen = {};
  for (var i = 0; i < rows.length; i++) {
    var per = periodOf(rows[i]);
    if (!per) continue;
    var k = keyOf(rows[i]);
    if (!seen[k]) seen[k] = {};
    seen[k][per] = true;
  }
  // Pass 2: that key's most recent `keep` of them.
  var keepSet = {};
  for (var k2 in seen) {
    if (!Object.prototype.hasOwnProperty.call(seen, k2)) continue;
    var periods = Object.keys(seen[k2]).sort();
    var tail = periods.slice(Math.max(0, periods.length - spec.keep));
    var m = {};
    for (var t = 0; t < tail.length; t++) m[tail[t]] = true;
    keepSet[k2] = m;
  }
  // Pass 3: keep the rows in those periods, plus every row we could not place in time.
  var out = [];
  for (var j = 0; j < rows.length; j++) {
    var pj = periodOf(rows[j]);
    if (!pj) { out.push(rows[j]); continue; }
    var kj = keyOf(rows[j]);
    if (keepSet[kj] && keepSet[kj][pj]) out.push(rows[j]);
  }
  return { rows: out, before: rows.length, after: out.length, dropped: rows.length - out.length };
}

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
  var out = { summary: null, capped: {}, counts: {}, recentWindow: {} };
  var summary = {};
  // §C/SECTD - OPT-IN. Absent or false means the payload is byte-for-byte what it was before this round.
  var windowOn = (payload.recentWindow === true);
  // F1-7N-FC-1B-E3-R4-A1 §A1 — ECHO WHAT WAS ASKED FOR, ALWAYS, INCLUDING WHEN THE ANSWER IS "NOTHING".
  //
  // R4 reported `recentWindow` only when a projection actually ran, so "the caller did not ask" and "the
  // caller asked and the request never arrived" produced the identical null. That is exactly the ambiguity
  // the live log fell into. The REQUEST is now echoed separately from the RESULT, so a null result beside a
  // true request is a visible contradiction rather than a silent one.
  out.requestEcho = { recentWindow: (payload.recentWindow === true), only: null };
  // §A1 — RESOLVED INLINE, ON PURPOSE. This function is documented PURE and four suites lift it BY
  // ITSELF, with no other function from this file in scope. Calling a sibling helper here broke every one of
  // them with a ReferenceError — not a wrong answer, but a harness that could no longer run at all. Six
  // lines of duplication are the price of a function that means what its docstring says; the orchestrator's
  // copy is checked against this one by test rather than kept in step by hope.
  var onlyRaw = (payload && payload.only), onlySet = null, onlyList = null;
  if (onlyRaw && Object.prototype.toString.call(onlyRaw) === '[object Array]' && onlyRaw.length) {
    onlyList = [];
    for (var oi = 0; oi < onlyRaw.length; oi++) {
      var on = sirWsStr_(onlyRaw[oi]);
      if (on && onlyList.indexOf(on) === -1) onlyList.push(on);
    }
    if (onlyList.length) { onlySet = {}; for (var oj = 0; oj < onlyList.length; oj++) onlySet[onlyList[oj]] = true; }
    else onlyList = null;
  }
  if (onlySet) out.requestEcho.only = onlyList;
  for (var i = 0; i < SIR_WORKSPACE_TABLES_.length; i++) {
    var spec = SIR_WORKSPACE_TABLES_[i];
    var name = spec.name;
    if (onlySet && !onlySet[name]) continue;                // §A1: an explicit subset was requested
    if (spec.include && !include[spec.include]) continue;   // F1-7J-A2: skip un-requested include tables → base payload identical (BEFORE==AFTER)
    var src = tables[name] || [];
    // §C/§D - the recent-period projection, when the caller asked for it and this table has a window.
    if (windowOn && SIR_WS_RECENT_WINDOW_[name]) {
      var w = sirWsRecentWindow_(src, SIR_WS_RECENT_WINDOW_[name]);
      out.recentWindow[name] = { before: w.before, after: w.after, dropped: w.dropped, keep: SIR_WS_RECENT_WINDOW_[name].keep };
      src = w.rows;
    }
    var c = sirCap_(src);
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
    var tOpen = io.now();
    var ss = io.openTarget();
    var openMs = io.now() - tOpen;
    var onlySet = sirWsOnlySet_(payload);
    var tables = {}, readCount = 0, tableMs = {};
    for (var i = 0; i < SIR_WORKSPACE_TABLES_.length; i++) {
      var spec = SIR_WORKSPACE_TABLES_[i];
      if (onlySet && !onlySet[spec.name]) continue;           // §A1: an explicit subset was requested
      if (spec.include && !include[spec.include]) continue;   // F1-7J-A2: skip un-requested include tables (no read cost)
      // §A1 - TIME EACH SHEET. `serverDurationMs = 30833` names the total and nothing else, so the next
      // question ("which sheet") had no answer but a guess. Per-table timing is what turns one number into a
      // decision about which table to stop reading.
      var tT = io.now();
      tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true);
      tableMs[spec.name] = io.now() - tT;
      readCount++;
    }
    var vm = sirWorkspaceBuild_(tables, payload);
    // §B - serverDurationMs was ALREADY here and the client was reporting server execution time as null. It
    // is now carried through to the page's stage report, together with what the projection actually removed,
    // so "the read is slow" can be answered with a number from the side that did the work.
    var rowsOut = 0, wKeys = [];
    for (var t2 in vm.counts) { if (Object.prototype.hasOwnProperty.call(vm.counts, t2)) rowsOut += vm.counts[t2]; }
    for (var w2 in vm.recentWindow) { if (Object.prototype.hasOwnProperty.call(vm.recentWindow, w2)) wKeys.push(w2); }
    // §A1 - the slowest tables, named. Sorted descending and capped at five: enough to decide, small enough
    // that the meta never becomes a log of its own.
    var slow = [];
    for (var tn in tableMs) { if (Object.prototype.hasOwnProperty.call(tableMs, tn)) slow.push({ table: tn, ms: tableMs[tn], rows: (vm.counts[tn] || 0) }); }
    slow.sort(function (a, b) { return b.ms - a.ms; });
    return sirBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount,
      rowsReturned: rowsOut, recentWindow: (wKeys.length ? vm.recentWindow : null),
      // §A1 - THE REQUEST CONTRACT, echoed. `recentWindowRequested` is what the caller asked for and
      // `recentWindowApplied` is what happened; a true beside a false means the request lost the field on the
      // way in, which is precisely the defect R4 shipped and this log would have caught on day one.
      recentWindowRequested: (vm.requestEcho && vm.requestEcho.recentWindow === true),
      recentWindowApplied: (wKeys.length > 0),
      onlyRequested: (vm.requestEcho && vm.requestEcho.only) || null,
      openMs: openMs, slowestTables: slow.slice(0, 5) });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'INVENTORY_REPLENISHMENT_WORKSPACE_BUILD_FAILED';
    return sirBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
