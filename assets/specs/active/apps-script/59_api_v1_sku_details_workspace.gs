/**
 * 59_api_v1_sku_details_workspace.gs
 * Kitchen Mama Operation System — API v1 · SKU Details READ-ONLY Workspace (Phase API / F1-7H).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped read owner for the active SKU Details master-data surface:
 *   - sku-details.js  (the four SKU lifecycle tables + the per-Series HS-code / Tax subpage)  [PRIMARY, cut over now]
 *   - sku-regional-details.js  (Layer-2 regional workspace)                                    [SECONDARY, deferred]
 * Action = "skuDetails.workspace.get" (a body-carrying READ, no write).
 *
 * SCOPE — MASTER/REFERENCE READ MODEL ONLY. Reads the SKU Details master/reference table set — never getOperationDb:
 *     sku_details          (the master SKU identity table — the four lifecycle tables render from this)      [BASE]
 *     tax_referral_rates   (per-Series HS-code / duty / referral-rate SSOT — the Tax subpage)                [BASE]
 *     tax_rate_components  (child tax components, read-only in the Tax subpage)                               [BASE]
 *     marketplace_skus     (operational site-SKU status join for the regional page)         [INCLUDE-gated 'regional']
 *     sku_regional_details (Layer-2 regional detail rows)                                    [INCLUDE-gated 'regional']
 * The MAP-extra ('regional') tables are returned ONLY when the caller sets include.regional (bounded includes, not broad
 * loading; read missing-safe). This is a READ MODEL owner, NOT a write-orchestration engine.
 *
 * AUTHORITY — reads only; authors NO business logic and NO write side effects. It does NOT create sku_details, does NOT
 * create marketplace_skus, and — critically — does NOT initialize Factory Stock. Factory Stock baseline initialization
 * remains owned by MASTER SKU creation (handleUpsertSkuDetail_ -> ensureFactoryStockBaseline_, gated on the
 * non-running -> "Running in the Market" transition) — this READ workspace never touches factory_stock, never derives an
 * inventory quantity, and never changes the marketplace-SKU trigger boundary. HS-code semantics are unchanged: the
 * workspace only transports the persisted tax_referral_rates / tax_rate_components rows (the canonical owner is
 * upsertTaxReferralRate). No Forecast / Target% / Gap / Recommendation / allocation / PO / Shipment logic.
 *
 * FULL-SET (NOT server-filtered) BY DESIGN — BEFORE == AFTER. Both SKU pages filter/search/sort/paginate CLIENT-side over
 * the complete dataset (sku-details.js builds its Series/Category option universes and lifecycle sections from ALL rows;
 * sku-regional-details.js builds its filter universes + country tabs from ALL rows). Server-side narrowing would shrink
 * those universes -> a user-visible change. So this workspace returns raw passthrough of the ENTIRE tables (bounded by a
 * generous safety cap that is NEVER silently applied — see `capped`), and the client keeps ALL filtering/pagination. The
 * win is table SCOPE (3-5 tables, never the ~44-tab getOperationDb), not server pagination.
 *
 * Testability: pure `skdWorkspaceBuild_` is a `function` declaration (extract+eval friendly). The impure orchestrator
 * `handleSkuDetailsWorkspaceGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO SpreadsheetApp.
 */

var SKD_WS_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

// BASE tables (sku-details.js) — fail-closed on missing schema. 'regional' tables (sku-regional-details.js) — include-gated + missing-safe.
var SKD_WORKSPACE_TABLES_ = [
  { name: 'sku_details',          requiredCols: ['sku'] },
  { name: 'tax_referral_rates',   requiredCols: [] },
  { name: 'tax_rate_components',  requiredCols: [] },
  { name: 'marketplace_skus',     requiredCols: [], optional: true, include: 'regional' },
  { name: 'sku_regional_details', requiredCols: [], optional: true, include: 'regional' }
];

// Generous safety backstop. In real data the SKU master/reference tables are well under this; the cap only guards against
// a runaway payload and is reported via `capped` so truncation is NEVER silent (would break BEFORE==AFTER).
var SKD_WS_ROW_MAX_ = 50000;

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock / no Spreadsheet)
// --------------------------------------------------------------------------------------------------------
function skdWsStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function skdBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'skuDetails.workspace.get', workspace: 'skuDetails', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// Cap an array to SKD_WS_ROW_MAX_, reporting whether truncation occurred (never silent).
function skdCap_(rows) {
  rows = rows || [];
  if (rows.length <= SKD_WS_ROW_MAX_) return { rows: rows, capped: false, total: rows.length };
  return { rows: rows.slice(0, SKD_WS_ROW_MAX_), capped: true, total: rows.length };
}

// The pure orchestrator: raw tables + request payload → ONE bounded SKU Details View Model. Every array is RAW passthrough
// (each source row unmodified) so a page adapter reproduces the existing render byte-for-byte via the SAME db-api
// normalizers (normalizeSkuDetailsRecord / normalizeTaxReferralRateRecord / normalizeTaxRateComponentRecord /
// normalizeMarketplaceSkuRecord / normalizeSkuRegionalDetailRecord).
function skdWorkspaceBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var include = (payload && payload.include && typeof payload.include === 'object') ? payload.include : {};

  var skuDetails = skdCap_(tables.sku_details || []);
  var taxRates   = skdCap_(tables.tax_referral_rates || []);
  var taxComps   = skdCap_(tables.tax_rate_components || []);

  var out = {
    summary: (include.summary === false) ? null : {
      skuDetailsCount: skuDetails.total,
      taxReferralRateCount: taxRates.total,
      taxRateComponentCount: taxComps.total
    },
    skuDetails: skuDetails.rows,          // raw passthrough
    taxReferralRates: taxRates.rows,      // raw passthrough
    taxRateComponents: taxComps.rows,     // raw passthrough
    capped: { skuDetails: skuDetails.capped, taxReferralRates: taxRates.capped, taxRateComponents: taxComps.capped },
    counts: { skuDetails: skuDetails.total, taxReferralRates: taxRates.total, taxRateComponents: taxComps.total }
  };

  // 'regional' tables (sku-regional-details.js) — returned ONLY when requested (bounded includes).
  if (include.regional) {
    var mktSkus  = skdCap_(tables.marketplace_skus || []);
    var regional = skdCap_(tables.sku_regional_details || []);
    out.marketplaceSkus = mktSkus.rows;             // raw passthrough
    out.skuRegionalDetails = regional.rows;         // raw passthrough
    out.capped.marketplaceSkus = mktSkus.capped;
    out.capped.skuRegionalDetails = regional.capped;
    out.counts.marketplaceSkus = mktSkus.total;
    out.counts.skuRegionalDetails = regional.total;
    if (out.summary) { out.summary.marketplaceSkuCount = mktSkus.total; out.summary.skuRegionalDetailCount = regional.total; }
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function skdWsRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function skdWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { SKD_WS_SEQ_++; return SKD_WS_SEQ_; },
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
      return skdWsRowsToObjects_(sheet);
    }
  };
}

function handleSkuDetailsWorkspaceGet_(body, io) {
  io = io || skdWorkspaceDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = skdWsStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  try {
    var payload = (body && body.payload) || {};
    var include = payload.include || {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < SKD_WORKSPACE_TABLES_.length; i++) {
      var spec = SKD_WORKSPACE_TABLES_[i];
      if (spec.include && !include[spec.include]) continue;   // skip un-requested 'regional' tables (no read cost)
      tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true);
      readCount++;
    }
    var vm = skdWorkspaceBuild_(tables, payload);
    return skdBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'SKU_DETAILS_WORKSPACE_BUILD_FAILED';
    return skdBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
