/**
 * 55_api_v1_lead_time_owner.gs
 * Kitchen Mama Operation System — API v1 · AI-Plan Layer-1 RAW/REFERENCE read owner (Phase API / F1-7E-PREREQ-4).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped backend read owner for ONE AI-Plan Layer-1 reference fact:
 *     leadTimeDays  (supplier lead time in days, per SKU).  Action = "leadTime.raw.get" (body-carrying READ, no write).
 *
 * WHY A DEDICATED OWNER: no existing backend read owner exposes supplier_price_list lead_time_days at this grain/semantic
 * (the recommendation/gap backends read no supplier_price_list; carrier lead_time is a different concept). It is NOT an
 * engine — it looks up a persisted reference value exactly as the current AI-Plan browser does (BEFORE FACT == AFTER
 * FACT). See F1_7E_PREREQ_0_AI_PLAN_FACT_AUTHORITY_DECISION_R1.md.
 *
 * FROZEN FACT CONTRACT (extracted verbatim from request-order.js leadTime(sku)):
 *   - Group supplier_price_list by UPPER(sku) (company/country/marketplace/supplier/factory ALL IGNORED — the browser
 *     leadTime() takes ONLY sku).
 *   - Keep ACTIVE rows: LOWER(TRIM(is_active)) in {active, true, yes, 1}. A blank/other is_active is NOT active.
 *   - Sort the active rows by effective_from DESCENDING via String(b).localeCompare(String(a)); ties keep the original
 *     (sheet) order (stable sort, V8 in both the browser and Apps Script). Take the FIRST row (latest effective_from).
 *   - leadTimeDays = that row's lead_time_days: NULL when the cell is blank ('' / null); else parseFloat(lead_time_days)
 *     || 0 (a present-but-invalid value -> 0; a real 0 -> 0). NULL also when the SKU has no rows / no active rows.
 *   - EMPTY (null) is DISTINCT from ZERO (0): a real 0-day lead time is 0; "no applicable/active price row" or a blank
 *     lead_time_days is null (the browser shows "--"). The PREREQ-5 composer preserves the display convention.
 *   - ERROR != EMPTY != ZERO: a missing supplier_price_list table -> null facts (match browser graceful-empty); a
 *     transport/backend failure -> error envelope, never a number.
 *
 * READ-ONLY. Reads ONLY supplier_price_list. NEVER getOperationDb. Writes nothing. No Forecast/Gap/Recommendation/
 * inventory/PO/shipment read. No factory<->company inference (neither is read).
 *
 * Testability: pure `ltoBuild_` + helpers are `function` declarations (extract+eval friendly). The impure orchestrator
 * `handleLeadTimeRawGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO SpreadsheetApp.
 */

var LTO_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

var LTO_TABLES_ = [
  { name: 'supplier_price_list', requiredCols: [], optional: true }   // missing-safe (match browser graceful-empty)
];

var LTO_ACTIVE_FLAG_ = { 'active': 1, 'true': 1, 'yes': 1, '1': 1 };   // == _roIsActiveFlag set

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic). Match the db-api normalizer coercions exactly.
// --------------------------------------------------------------------------------------------------------
function ltoStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function ltoUpper_(v) { return ltoStr_(v).toUpperCase(); }
function ltoLower_(v) { return ltoStr_(v).toLowerCase(); }
function ltoIsActive_(rawIsActive) { return LTO_ACTIVE_FLAG_[ltoLower_(rawIsActive)] === 1; }

// leadTimeDays for a supplier_price_list row: null when the raw cell is blank; else parseFloat||0 (== normalizer + browser).
function ltoLeadTimeDays_(row) {
  var v = row.lead_time_days;
  if (v === '' || v === null || v === undefined) return null;   // blank -> normalizer '' -> browser null
  var n = parseFloat(v); return isFinite(n) ? n : 0;            // present -> parseFloat(v) || 0 (invalid/0 -> 0)
}

// The frozen browser selection: active rows, sorted by effective_from DESC (stable), take the first -> its lead time.
function ltoLeadTimeForSku_(splBySku, sku) {
  var rows = splBySku[ltoUpper_(sku)];
  if (!rows || !rows.length) return null;
  var active = [];
  for (var i = 0; i < rows.length; i++) { if (ltoIsActive_(rows[i].is_active)) active.push(rows[i]); }
  if (!active.length) return null;
  active.sort(function (a, b) { return String(ltoStr_(b.effective_from)).localeCompare(String(ltoStr_(a.effective_from))); });   // DESC; stable ties
  return ltoLeadTimeDays_(active[0]);
}

function ltoBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'leadTime.raw.get', workspace: 'leadTime', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// The pure orchestrator: raw supplier_price_list + payload -> bounded per-SKU lead-time View Model.
//   payload.skus [ ... ] (REQUIRED) — the SKUs to answer. payload.scope { ... } is CONTEXT_ONLY (echoed; leadTime()
//   uses only sku, so NO scope dimension filters the fact).
function ltoBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var splRows = tables.supplier_price_list || [];
  var scope = (payload.scope && typeof payload.scope === 'object') ? payload.scope : {};

  var splBySku = {};   // == browser splBySku
  for (var i = 0; i < splRows.length; i++) { var k = ltoUpper_(splRows[i].sku); (splBySku[k] = splBySku[k] || []).push(splRows[i]); }

  var reqSkus = Array.isArray(payload.skus) ? payload.skus : [];
  var items = [], seen = {};
  for (var s = 0; s < reqSkus.length; s++) {
    var sku = ltoStr_(reqSkus[s]); if (sku === '') continue;
    var dk = sku.toUpperCase(); if (seen[dk]) continue; seen[dk] = 1;
    items.push({ sku: sku, leadTimeDays: ltoLeadTimeForSku_(splBySku, sku) });   // number or null (EMPTY != ZERO)
  }

  return {
    scope: {
      company: ltoStr_(scope.company), country: ltoStr_(scope.country), marketplace: ltoStr_(scope.marketplace),
      factoryId: ltoStr_(scope.factory_id), supplierId: ltoStr_(scope.supplier_id)
    },
    items: items,
    count: items.length
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function ltoRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function ltoDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { LTO_SEQ_++; return LTO_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      if (optional && !ss.getSheetByName(name)) return [];   // missing supplier_price_list -> [] (match browser graceful-empty)
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return ltoRowsToObjects_(sheet);
    }
  };
}

function handleLeadTimeRawGet_(body, io) {
  io = io || ltoDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = ltoStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  try {
    var payload = (body && body.payload) || {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < LTO_TABLES_.length; i++) { var spec = LTO_TABLES_[i]; tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true); readCount++; }
    var vm = ltoBuild_(tables, payload);
    return ltoBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'LEAD_TIME_BUILD_FAILED';
    return ltoBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
