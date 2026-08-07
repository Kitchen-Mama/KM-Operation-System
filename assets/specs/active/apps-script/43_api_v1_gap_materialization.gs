// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 43_api_v1_gap_materialization.gs — F1-4B-FM5 Materialized Gap Tables + Manual Batch Recalculation
// NOTE: All .gs files in this folder share ONE global scope in the Apps Script project. Copy them together
//       and REDEPLOY. No imports. Structure-only split.
// ============================================================
//
// Persists the LATEST canonical planning result into two USER-CREATED tables so the UI can eventually READ
// precomputed results instead of recomputing on every SKU expand:
//   • inventory_replenishment_gap  — latest D18/D30/D45/D90 gap+suggested per company/country/marketplace/sku
//   • order_planning_gap           — latest T1/T2/T3/T4 month+gap+suggested per company/country/marketplace/sku
//
// HARD RULES (F1-4B-FM5):
//   - Reuses the EXISTING canonical calculation ONLY (handleRecommendationWorkspaceGet_ → KMHP horizons /
//     KMTPP monthlyProjection). NO new gap formula, NO second engine, NO browser math, NO Inventory↔Order
//     convergence.
//   - ONE bounded server batch per manual button — enumerate scopes, ONE canonical read per scope, batched
//     UPSERT. NEVER one HTTP per SKU, NEVER a per-SKU recompute loop in the browser.
//   - Multi-warehouse self-fulfilled: each destination is calculated INDEPENDENTLY by the frozen runtime
//     (warehouse isolation); the site row is the SUM of the per-destination window/tier results. This is a
//     materialization AGGREGATION, never inventory pooling. Destination routing stays Execution Plan authority
//     and is NOT stored here.
//   - Status semantics: READY | BLOCKED | ERROR. missing/unresolved data NEVER becomes qty 0 (READY+0 is a
//     canonical valid zero; BLOCKED/ERROR leave qty blank). `note` carries the concise canonical reason.
//   - Writes ONLY the two gap tables, bounded UPSERT of the LATEST result by business key. Fails CLOSED via the
//     S0.5 validate-only resolver if the table/header is missing or invalid — never creates/repairs a table.
//   - calculation_date / calculation_month come from the frozen planning config (server), NOT a browser clock;
//     calculated_at / updated_at are batch write timestamps.

var INV_GAP_TABLE_ = 'inventory_replenishment_gap';
var INV_GAP_HEADERS_ = ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_date',
  'd18_gap_qty', 'd18_suggested_qty', 'd30_gap_qty', 'd30_suggested_qty', 'd45_gap_qty', 'd45_suggested_qty',
  'd90_gap_qty', 'd90_suggested_qty', 'note', 'calculated_at', 'updated_at'];

var OP_GAP_TABLE_ = 'order_planning_gap';
var OP_GAP_HEADERS_ = ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_month',
  't1_month', 't1_gap_qty', 't1_suggested_qty', 't2_month', 't2_gap_qty', 't2_suggested_qty',
  't3_month', 't3_gap_qty', 't3_suggested_qty', 't4_month', 't4_gap_qty', 't4_suggested_qty',
  'note', 'calculated_at', 'updated_at'];

var GAP_KEY_COLS_ = ['company', 'country', 'marketplace', 'sku'];
var GAP_MAX_SKUS_ = 5000;          // bounded page size for the per-scope canonical read (no per-SKU HTTP)
var GAP_INV_WINDOWS_ = ['D18', 'D30', 'D45', 'D90'];
var GAP_OP_TIERS_ = ['T1', 'T2', 'T3', 'T4'];

// ---- small pure helpers -------------------------------------------------------------------------------
function gapIsFiniteNum_(v) { return typeof v === 'number' && isFinite(v); }
function gapStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

// Read a sheet as header-mapped row objects (READ ONLY; [] when absent/empty). No write, no whole-DB load.
function gapReadObjects_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 1) return [];
  var vals = sh.getDataRange().getValues();
  var hdr = vals[0].map(function (h) { return gapStr_(h); });
  var out = [];
  for (var r = 1; r < vals.length; r++) {
    var o = {}; for (var c = 0; c < hdr.length; c++) o[hdr[c]] = vals[r][c];
    out.push(o);
  }
  return out;
}

// Distinct plannable scopes (company/country/marketplace) from marketplace_skus. No clock, no invented scope.
function gapEnumerateScopes_(ss) {
  var rows = gapReadObjects_(ss, 'marketplace_skus');
  var seen = {}, out = [];
  rows.forEach(function (r) {
    var company = gapStr_(r.company), country = gapStr_(r.country), marketplace = gapStr_(r.marketplace);
    if (!company || !country || !marketplace) return;
    var k = company + '||' + country + '||' + marketplace;
    if (seen[k]) return; seen[k] = 1;
    out.push({ company: company, country: country, marketplace: marketplace });
  });
  return out;
}

// ---- PURE mappers: canonical destination lines → one materialized gap row (SUM after independent calc) ----
// Inventory: aggregate D18/D30/D45/D90 gap + suggested across a SKU's destination lines. READY requires EVERY
// contributing destination non-blocked with all four numeric windows; else BLOCKED (qty left null — never 0).
function gapInvMapFromLines_(lines, scope, sku, calcDate) {
  var base = {
    company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku,
    calculation_status: 'READY', calculation_date: calcDate || '',
    d18_gap_qty: null, d18_suggested_qty: null, d30_gap_qty: null, d30_suggested_qty: null,
    d45_gap_qty: null, d45_suggested_qty: null, d90_gap_qty: null, d90_suggested_qty: null, note: ''
  };
  if (!lines || !lines.length) { base.calculation_status = 'BLOCKED'; base.note = 'RECOMMENDATION_LINE_NOT_FOUND'; return base; }
  var acc = { D18: { g: 0, s: 0 }, D30: { g: 0, s: 0 }, D45: { g: 0, s: 0 }, D90: { g: 0, s: 0 } };
  var blockedReason = null;
  for (var i = 0; i < lines.length && !blockedReason; i++) {
    var L = lines[i];
    if (L && L.blocked) { blockedReason = gapStr_(L.blockedReason) || 'BLOCKED'; break; }
    var hz = L && L.horizons;
    if (!hz || !hz.length) { blockedReason = 'HORIZONS_NOT_AVAILABLE'; break; }
    var byW = {}; hz.forEach(function (h) { if (h && h.windowCode) byW[h.windowCode] = h; });
    for (var w = 0; w < GAP_INV_WINDOWS_.length; w++) {
      var wc = GAP_INV_WINDOWS_[w], h = byW[wc];
      if (!h || !gapIsFiniteNum_(h.gapQty) || !gapIsFiniteNum_(h.suggestedOrderQty)) { blockedReason = 'HORIZON_WINDOW_MISSING:' + wc; break; }
      acc[wc].g += h.gapQty; acc[wc].s += h.suggestedOrderQty;   // SUM across destinations (aggregation, NOT pooling)
    }
  }
  if (blockedReason) { base.calculation_status = 'BLOCKED'; base.note = blockedReason; return base; }
  base.d18_gap_qty = acc.D18.g; base.d18_suggested_qty = acc.D18.s;
  base.d30_gap_qty = acc.D30.g; base.d30_suggested_qty = acc.D30.s;
  base.d45_gap_qty = acc.D45.g; base.d45_suggested_qty = acc.D45.s;
  base.d90_gap_qty = acc.D90.g; base.d90_suggested_qty = acc.D90.s;
  var anyGap = acc.D18.g > 0 || acc.D30.g > 0 || acc.D45.g > 0 || acc.D90.g > 0;
  base.note = !anyGap ? 'No shortage' : ((acc.D18.g > 0 || acc.D30.g > 0) ? 'Shortage within 30 days' : 'Replenishment required');
  return base;
}

// Order Planning: aggregate T1/T2/T3/T4 remainingGapQty + suggestedOrderQty across destination lines from the
// canonical monthlyProjection (KMTPP). NEVER reuses the Inventory D18/D30/D45/D90 arithmetic. READY requires all
// four tiers numeric on every contributing destination; else BLOCKED (qty left null — never 0).
function gapOpMapFromLines_(lines, scope, sku, calcMonth) {
  var base = {
    company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku,
    calculation_status: 'READY', calculation_month: calcMonth || '',
    t1_month: '', t1_gap_qty: null, t1_suggested_qty: null, t2_month: '', t2_gap_qty: null, t2_suggested_qty: null,
    t3_month: '', t3_gap_qty: null, t3_suggested_qty: null, t4_month: '', t4_gap_qty: null, t4_suggested_qty: null, note: ''
  };
  if (!lines || !lines.length) { base.calculation_status = 'BLOCKED'; base.note = 'RECOMMENDATION_LINE_NOT_FOUND'; return base; }
  var tiers = { T1: { m: '', g: 0, s: 0, seen: false }, T2: { m: '', g: 0, s: 0, seen: false }, T3: { m: '', g: 0, s: 0, seen: false }, T4: { m: '', g: 0, s: 0, seen: false } };
  var blockedReason = null;
  for (var i = 0; i < lines.length && !blockedReason; i++) {
    var L = lines[i];
    if (L && L.blocked) { blockedReason = gapStr_(L.blockedReason) || 'BLOCKED'; break; }
    var mp = L && L.monthlyProjection;
    if (!mp || !mp.length) { blockedReason = 'MONTHLY_PROJECTION_NOT_AVAILABLE'; break; }
    for (var t = 0; t < mp.length && !blockedReason; t++) {
      var row = mp[t], k = row && row.tier;
      if (!k || !tiers[k]) continue;
      if (!gapIsFiniteNum_(row.remainingGapQty) || !gapIsFiniteNum_(row.suggestedOrderQty)) { blockedReason = 'TIER_VALUE_MISSING:' + k; break; }
      tiers[k].m = gapStr_(row.month); tiers[k].g += row.remainingGapQty; tiers[k].s += row.suggestedOrderQty; tiers[k].seen = true;
    }
  }
  if (!blockedReason) { for (var q = 0; q < GAP_OP_TIERS_.length; q++) { if (!tiers[GAP_OP_TIERS_[q]].seen) { blockedReason = 'TIER_MISSING:' + GAP_OP_TIERS_[q]; break; } } }
  if (blockedReason) { base.calculation_status = 'BLOCKED'; base.note = blockedReason; return base; }
  base.t1_month = tiers.T1.m; base.t1_gap_qty = tiers.T1.g; base.t1_suggested_qty = tiers.T1.s;
  base.t2_month = tiers.T2.m; base.t2_gap_qty = tiers.T2.g; base.t2_suggested_qty = tiers.T2.s;
  base.t3_month = tiers.T3.m; base.t3_gap_qty = tiers.T3.g; base.t3_suggested_qty = tiers.T3.s;
  base.t4_month = tiers.T4.m; base.t4_gap_qty = tiers.T4.g; base.t4_suggested_qty = tiers.T4.s;
  var anyGap = tiers.T1.g > 0 || tiers.T2.g > 0 || tiers.T3.g > 0 || tiers.T4.g > 0;
  base.note = anyGap ? 'Order need' : 'No order need';
  return base;
}

// ---- bounded UPSERT-by-business-key (latest result only; no history, no duplicate) --------------------
// Builds the row in the sheet's own header order (extra additive columns preserved on update). null/undefined →
// blank cell (BLOCKED/ERROR leave qty blank); a numeric 0 is written as 0 (valid zero). Returns 'insert'|'update'.
function gapUpsertByKey_(sheet, rowObj) {
  var lastCol = sheet.getLastColumn();
  var hdr = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return gapStr_(h); });
  var colIdx = {}; for (var i = 0; i < hdr.length; i++) colIdx[hdr[i]] = i;
  function cell(v) { return (v === null || v === undefined) ? '' : v; }
  function buildArr(existing) {
    var arr = [];
    for (var c = 0; c < hdr.length; c++) arr.push(existing ? existing[c] : '');
    for (var key in rowObj) { if (Object.prototype.hasOwnProperty.call(rowObj, key) && colIdx[key] !== undefined) arr[colIdx[key]] = cell(rowObj[key]); }
    return arr;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var r = 0; r < data.length; r++) {
      var match = true;
      for (var kk = 0; kk < GAP_KEY_COLS_.length; kk++) { var kc = GAP_KEY_COLS_[kk]; if (gapStr_(data[r][colIdx[kc]]) !== gapStr_(rowObj[kc])) { match = false; break; } }
      if (match) { sheet.getRange(2 + r, 1, 1, lastCol).setValues([buildArr(data[r])]); return 'update'; }
    }
  }
  sheet.appendRow(buildArr(null));
  return 'insert';
}

// ---- default IO (memoized spreadsheet open; frozen config authorities; reuse the canonical calc) ------
function gapMaterializationDefaultIo_() {
  var _ss = null;
  return {
    now: function () { return new Date(); },
    tz: function () { try { return Session.getScriptTimeZone(); } catch (e) { return 'UTC'; } },
    openTarget: function () {
      if (_ss) return _ss;                                  // memoized: open ONCE for the whole batch
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      _ss = ss; return ss;
    },
    // Reuse the EXISTING canonical calculation. A reco-io shares the SAME memoized spreadsheet so the batch
    // opens the target once; each scope still performs ONE canonical snapshot read (bounded, no per-SKU HTTP).
    workspaceGet: function (body, sharedSs) {
      var recoIo = recommendationWorkspaceDefaultIo_();
      recoIo.openTarget = function () { return sharedSs; };
      return handleRecommendationWorkspaceGet_(body, recoIo);
    }
  };
}

function gapBatchTimestamp_(io) {
  try { return Utilities.formatDate(io.now(), io.tz(), 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return ''; }
}
function gapBatchEnvelope_(ok, data, errorToken, message) {
  return ok ? { success: true, data: data, errors: [] }
    : { success: false, data: null, errors: [{ code: errorToken || 'GAP_BATCH_ERROR', message: message || errorToken || 'gap batch error', details: null }] };
}

// ---- shared batch orchestration (Inventory + Order Planning share the enumerate→calc→map→UPSERT skeleton) --
function gapRunBatch_(body, io, cfg) {
  io = io || gapMaterializationDefaultIo_();
  try {
    var ss = io.openTarget();
    var sheet = prodRequireSheet_(ss, cfg.table, cfg.headers);          // fail CLOSED if table/header missing/invalid
    var scopes = io.enumerateScopes ? io.enumerateScopes(ss) : gapEnumerateScopes_(ss);
    var summary = { product: cfg.product, totalScopes: scopes.length, scopesCalculated: 0, ready: 0, blocked: 0, errors: 0, written: 0, calculatedAt: null, scopeErrors: [] };
    for (var s = 0; s < scopes.length; s++) {
      var scope = scopes[s];
      var reqBody = { requestId: 'GAP-' + cfg.product + '-' + (s + 1), payload: { scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace }, pagination: { page: 1, size: GAP_MAX_SKUS_ } } };
      var env;
      try { env = io.workspaceGet(reqBody, ss); } catch (e) { env = null; }
      if (!env || env.success !== true) {
        summary.errors++;
        summary.scopeErrors.push({ scope: scope.company + '/' + scope.country + '/' + scope.marketplace, code: (env && env.errors && env.errors[0] && env.errors[0].code) || 'SCOPE_CALCULATION_FAILED' });
        continue;
      }
      summary.scopesCalculated++;
      var meta = env.meta || {};
      var calcAuthority = cfg.product === 'INVENTORY' ? (meta.calculationDate || '') : (meta.calculationMonth || '');
      var lines = (env.data && env.data.lines) ? env.data.lines : [];
      var bySku = {}; lines.forEach(function (L) { var k = gapStr_(L.sku); if (!k) return; (bySku[k] = bySku[k] || []).push(L); });
      for (var sku in bySku) {
        if (!Object.prototype.hasOwnProperty.call(bySku, sku)) continue;
        var row = cfg.map(bySku[sku], scope, sku, calcAuthority);
        row.calculated_at = summary.calculatedAt || gapBatchTimestamp_(io);
        row.updated_at = row.calculated_at;
        gapUpsertByKey_(sheet, row);
        summary.written++;
        if (row.calculation_status === 'READY') summary.ready++;
        else if (row.calculation_status === 'BLOCKED') summary.blocked++;
        else summary.errors++;
      }
    }
    summary.calculatedAt = gapBatchTimestamp_(io);
    return gapBatchEnvelope_(true, summary);
  } catch (e) {
    var token = (e && e.safetyToken) ? e.safetyToken : (e && e.schemaStatus) ? e.schemaStatus : 'GAP_BATCH_ERROR';
    return gapBatchEnvelope_(false, null, token, e && e.message ? String(e.message) : String(e));
  }
}

// ---- PUBLIC batch owners (one bounded server batch per manual button) ---------------------------------
function handleRecalculateInventoryReplenishmentGapBatch_(body, io) {
  return gapRunBatch_(body, io, { product: 'INVENTORY', table: INV_GAP_TABLE_, headers: INV_GAP_HEADERS_, map: gapInvMapFromLines_ });
}
function handleRecalculateOrderPlanningGapBatch_(body, io) {
  return gapRunBatch_(body, io, { product: 'ORDER_PLANNING', table: OP_GAP_TABLE_, headers: OP_GAP_HEADERS_, map: gapOpMapFromLines_ });
}

// ---- F1-4B-FM5-R1 · bounded MATERIALIZED READ owners (page reads STORED result; NO calculation) -------
// The normal page flow reads these — it does NOT run recommendation.workspace.get on expand. Returns the stored
// rows for the scope VERBATIM (no page-side / server-side gap math; the batch already computed them). Fails
// CLOSED via the S0.5 validate-only resolver if the table/header is missing. Filter = company/country/marketplace
// exact (case-insensitive); an optional sku narrows further. Numeric cells returned as-is (valid 0 stays 0; a
// blank stays blank so the UI can render "—" and never fabricate a 0).
function gapReadScopeRows_(body, io, cfg) {
  io = io || gapMaterializationDefaultIo_();
  var reqId = (body && body.requestId) || null;
  try {
    var payload = (body && body.payload) || body || {};
    var scope = payload.scope || payload || {};
    var company = gapStr_(scope.company), country = gapStr_(scope.country), marketplace = gapStr_(scope.marketplace), sku = gapStr_(scope.sku);
    if (!company || !country || !marketplace) return gapBatchEnvelope_(false, null, 'INVALID_SCOPE', 'company + country + marketplace required');
    var ss = io.openTarget();
    var sheet = prodRequireSheet_(ss, cfg.table, cfg.headers);   // validate-only; fail CLOSED if missing/invalid
    var all = gapReadObjects_(ss, cfg.table);
    var lc = function (v) { return gapStr_(v).toLowerCase(); };
    var rows = [];
    all.forEach(function (r) {
      if (lc(r.company) !== lc(company) || lc(r.country) !== lc(country) || lc(r.marketplace) !== lc(marketplace)) return;
      if (sku && lc(r.sku) !== lc(sku)) return;
      var out = {}; for (var i = 0; i < cfg.headers.length; i++) { var h = cfg.headers[i]; out[h] = (r[h] === undefined ? null : r[h]); }
      rows.push(out);
    });
    return gapBatchEnvelope_(true, { product: cfg.product, scope: { company: company, country: country, marketplace: marketplace, sku: sku || null }, rows: rows, requestId: reqId });
  } catch (e) {
    var token = (e && e.safetyToken) ? e.safetyToken : (e && e.schemaStatus) ? e.schemaStatus : 'GAP_READ_ERROR';
    return gapBatchEnvelope_(false, null, token, e && e.message ? String(e.message) : String(e));
  }
}
function handleGetInventoryReplenishmentGap_(body, io) {
  return gapReadScopeRows_(body, io, { product: 'INVENTORY', table: INV_GAP_TABLE_, headers: INV_GAP_HEADERS_ });
}
function handleGetOrderPlanningGap_(body, io) {
  return gapReadScopeRows_(body, io, { product: 'ORDER_PLANNING', table: OP_GAP_TABLE_, headers: OP_GAP_HEADERS_ });
}
