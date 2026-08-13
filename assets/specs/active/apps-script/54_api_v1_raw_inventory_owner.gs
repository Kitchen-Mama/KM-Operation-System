/**
 * 54_api_v1_raw_inventory_owner.gs
 * Kitchen Mama Operation System — API v1 · AI-Plan Layer-1 RAW inventory read owner (Phase API / F1-7E-PREREQ-3).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped backend read owner for THREE AI-Plan Layer-1 RAW OPERATIONAL
 * FACTS (per SKU, per site):
 *     siteStockRawQty     — latest amazon_inventory_snapshot row for the site: available + fc_transfer + fc_processing
 *     overseasStockRawQty — Σ overseas_inventory_snapshot.available_stock over same-country NON-factory warehouses (pooled)
 *     factoryStockRawQty  — Σ factory_stock.current_stock per SKU (company/factory-INDEPENDENT shared pool)
 * Action = "rawInventory.get" (body-carrying READ, no write).
 *
 * These are RAW physical/context facts — NOT allocated planning supply, NOT gap-consumed, NOT recommendation supply,
 * NOT company-pooled allocation, NOT incoming. This owner runs NO allocation, NO Gap, NO Forecast, NO Recommendation. It
 * sums PERSISTED snapshot/stock rows exactly as the current AI-Plan browser does (BEFORE FACT == AFTER FACT). It is NOT
 * a second inventory engine, and it does NOT reuse KMPS/KMHP/KMTPP (those expose ALLOCATED/projected supply — different
 * facts, see F1_7E_PREREQ_0_AI_PLAN_FACT_AUTHORITY_DECISION_R1.md).
 *
 * FROZEN FACT CONTRACTS (extracted verbatim from request-order.js siteStock() / thirdParty() / factoryBySku):
 *   SITE STOCK (per sku, scope.country, scope.marketplace; company IGNORED): group amazon_inventory_snapshot by
 *     UPPER(sku); keep rows matching country (UPPER, only when scope.country present) AND marketplace (LOWER of
 *     marketplace||'Amazon', only when scope.marketplace present); pick the LATEST by String(snapshot_date) (lexicographic,
 *     ties -> first in sheet order); value = num(available_qty)+num(fc_transfer_qty)+num(fc_processing_qty). 0 when no
 *     rows / no match.
 *   OVERSEAS STOCK (per sku, scope.country; marketplace & company IGNORED): for each overseas_inventory_snapshot row
 *     matching UPPER(sku), resolve its warehouse (warehouses by warehouse_id); if found, drop when scope.country present
 *     and warehouse country != scope.country, and drop factory warehouses (is_factory_warehouse in {true,1,yes}); if not
 *     found, drop when scope.country present (cannot confirm country); Σ num(wh_available_stock||available_stock) over ALL
 *     matching rows (POOLED across warehouses — NO latest-snapshot dedup; the source is a current per-warehouse snapshot).
 *     0 when the table is empty / no match.
 *   FACTORY STOCK (per sku; company/country/marketplace/factory ALL IGNORED): Σ num(fac_current_stock||current_stock)
 *     over ALL factory_stock rows with UPPER(sku). company/factory-INDEPENDENT — the SAME shared per-SKU pool for KM /
 *     ResTW / ResUS. 0 when no rows. factory_id NEVER implies company; company NEVER implies factory.
 *   ERROR != EMPTY != ZERO: a missing snapshot/stock table -> 0 facts (match browser graceful-empty); transport/backend
 *   failure -> error envelope, never 0.
 *
 * READ-ONLY. Reads ONLY amazon_inventory_snapshot + overseas_inventory_snapshot + factory_stock + warehouses. NEVER
 * getOperationDb. Writes nothing.
 *
 * Testability: pure `rivBuild_` + helpers are `function` declarations (extract+eval friendly). The impure orchestrator
 * `handleRawInventoryGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO SpreadsheetApp.
 */

var RIV_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

var RIV_TABLES_ = [
  { name: 'amazon_inventory_snapshot',   requiredCols: [], optional: true },   // missing-safe (match browser graceful-empty)
  { name: 'overseas_inventory_snapshot', requiredCols: [], optional: true },
  { name: 'factory_stock',               requiredCols: [], optional: true },
  { name: 'warehouses',                  requiredCols: [], optional: true }
];

var RIV_FACTORY_FLAG_ = { 'true': 1, '1': 1, 'yes': 1 };   // is_factory_warehouse truthy set (== browser)

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic). Match the db-api normalizer coercions exactly.
// --------------------------------------------------------------------------------------------------------
function rivStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function rivUpper_(v) { return rivStr_(v).toUpperCase(); }
function rivLower_(v) { return rivStr_(v).toLowerCase(); }
function rivNum_(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }   // parseFloat(v) || 0
// == _invPick: canonical column when present (not undefined/null/''), else the legacy column.
function rivPick_(row, canonicalKey, legacyKey) {
  var v = row ? row[canonicalKey] : undefined;
  return (v === undefined || v === null || v === '') ? (row ? row[legacyKey] : undefined) : v;
}

// SITE STOCK — reproduce siteStock(sku, country, marketplace): latest matching amazon_inventory_snapshot row, 3-field sum.
function rivSiteStock_(amzBySku, sku, country, marketplace) {
  var rows = amzBySku[rivUpper_(sku)];
  if (!rows || !rows.length) return 0;   // browser null -> raw fact 0
  var best = null, bestSd = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (country && rivUpper_(r.country) !== rivUpper_(country)) continue;
    if (marketplace && rivLower_(r.marketplace || 'Amazon') !== rivLower_(marketplace)) continue;   // normalizer defaults blank -> 'Amazon'
    var sd = rivStr_(r.snapshot_date);
    if (best === null || sd > bestSd) { best = r; bestSd = sd; }   // lexicographic latest; ties keep the first
  }
  if (!best) return 0;
  return rivNum_(best.available_qty) + rivNum_(best.fc_transfer_qty) + rivNum_(best.fc_processing_qty);
}

// OVERSEAS STOCK — reproduce thirdParty(sku, country): pooled Σ over same-country NON-factory warehouses.
function rivOverseasStock_(overseasRows, whById, sku, country) {
  if (!overseasRows.length) return 0;   // browser null -> raw fact 0
  var total = 0, matched = false;
  for (var i = 0; i < overseasRows.length; i++) {
    var r = overseasRows[i];
    if (rivUpper_(r.sku) !== rivUpper_(sku)) continue;
    var wh = whById[rivStr_(r.warehouse_id)];
    if (wh) {
      if (country && rivUpper_(wh.country) !== rivUpper_(country)) continue;
      var isF = rivLower_(wh.is_factory_warehouse || '');
      if (RIV_FACTORY_FLAG_[isF] === 1) continue;
    } else if (country) {
      continue;   // no warehouse record -> cannot confirm country -> do not leak into this site
    }
    total += rivNum_(rivPick_(r, 'wh_available_stock', 'available_stock'));
    matched = true;
  }
  return matched ? total : 0;
}

function rivBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'rawInventory.get', workspace: 'rawInventory', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// The pure orchestrator: raw inventory tables + payload -> bounded per-SKU raw View Model.
//   payload.scope { country?, marketplace?, company?, factory_id? } — country filters SITE + OVERSEAS; marketplace filters
//     SITE only; company + factory_id are CONTEXT_ONLY (echoed, never filter any of the three raw pools).
//   payload.skus [ ... ] (REQUIRED) — the SKUs to answer.
function rivBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var amzRows = tables.amazon_inventory_snapshot || [], overseasRows = tables.overseas_inventory_snapshot || [];
  var factoryRows = tables.factory_stock || [], whRows = tables.warehouses || [];
  var scope = (payload.scope && typeof payload.scope === 'object') ? payload.scope : {};
  var country = rivStr_(scope.country), marketplace = rivStr_(scope.marketplace);

  // group amazon snapshots by UPPER(sku) (== browser amzBySku)
  var amzBySku = {};
  for (var a = 0; a < amzRows.length; a++) { var ak = rivUpper_(amzRows[a].sku); (amzBySku[ak] = amzBySku[ak] || []).push(amzRows[a]); }
  // warehouses by warehouse_id (LAST-wins, == browser forEach) — only rows with a warehouse_id
  var whById = {};
  for (var w = 0; w < whRows.length; w++) { var wid = rivStr_(whRows[w].warehouse_id); if (wid !== '') whById[wid] = whRows[w]; }
  // factory_stock summed per UPPER(sku) (== browser factoryBySku) — company/factory-independent
  var factoryBySku = {};
  for (var f = 0; f < factoryRows.length; f++) { var fk = rivUpper_(factoryRows[f].sku); factoryBySku[fk] = (factoryBySku[fk] || 0) + rivNum_(rivPick_(factoryRows[f], 'fac_current_stock', 'current_stock')); }

  var reqSkus = Array.isArray(payload.skus) ? payload.skus : [];
  var items = [], seen = {};
  for (var s = 0; s < reqSkus.length; s++) {
    var sku = rivStr_(reqSkus[s]); if (sku === '') continue;
    var dk = sku.toUpperCase(); if (seen[dk]) continue; seen[dk] = 1;
    items.push({
      sku: sku,
      siteStockRawQty: rivSiteStock_(amzBySku, sku, country, marketplace),
      overseasStockRawQty: rivOverseasStock_(overseasRows, whById, sku, country),
      factoryStockRawQty: factoryBySku[dk] || 0
    });
  }

  return {
    scope: { country: country, marketplace: marketplace, company: rivStr_(scope.company), factoryId: rivStr_(scope.factory_id) },
    items: items,
    count: items.length
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function rivRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function rivDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { RIV_SEQ_++; return RIV_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      if (optional && !ss.getSheetByName(name)) return [];   // missing snapshot/stock table -> [] (match browser graceful-empty)
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return rivRowsToObjects_(sheet);
    }
  };
}

function handleRawInventoryGet_(body, io) {
  io = io || rivDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = rivStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  try {
    var payload = (body && body.payload) || {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < RIV_TABLES_.length; i++) { var spec = RIV_TABLES_[i]; tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true); readCount++; }
    var vm = rivBuild_(tables, payload);
    return rivBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'RAW_INVENTORY_BUILD_FAILED';
    return rivBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
