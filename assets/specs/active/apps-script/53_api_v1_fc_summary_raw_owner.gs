/**
 * 53_api_v1_fc_summary_raw_owner.gs
 * Kitchen Mama Operation System — API v1 · AI-Plan Layer-1 RAW forecast read owner (Phase API / F1-7E-PREREQ-2).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped backend read owner for TWO AI-Plan Layer-1 RAW OPERATIONAL
 * FACTS (per SKU, per site, per planning_cycle):
 *     basicFcRawT3Qty        — SUM raw fc_regular_forecast over the N+1..N+3 window (NOT Target%-adjusted, NOT blended)
 *     specialEventFcRawQty   — SUM raw fc_special_events.fc_qty whose prep-month (start-30d) falls in the same window
 * Action = "fcSummary.raw.get" (body-carrying READ, no write).
 *
 * OWNER PLACEMENT: a DEDICATED bounded raw-forecast read owner (NOT the broader fcSummary WORKSPACE the fc-summary.js
 * page will need). We deliberately use action "fcSummary.raw.get" (not ".workspace.get") so this bounded raw read does
 * not claim/collide with the future full fcSummary workspace. It is NOT a forecast engine: it sums PERSISTED forecast
 * rows exactly as the current AI-Plan browser does (BEFORE FACT == AFTER FACT). No Target%, no KMPD adjusted/blended
 * demand, no Recommendation/Gap.
 *
 * FROZEN FACT CONTRACT (extracted verbatim from request-order.js basicT3() + _roSpecialEventsTotal()):
 *   TIME AUTHORITY (PDR-2): the N+1..N+3 window is derived from planning_cycle = "RECO-YYYY-MM" (REQUIRED), never the
 *     server/browser clock. anchor = the cycle month; window[i] = anchor + 1 + i (i=0..2), with year wrap — identical to
 *     the browser _roMonthWindow(1,3) anchored to the cycle month. There is no existing canonical RECO-YYYY-MM window
 *     parser in the repo (planning_cycle is only an opaque scope key elsewhere), so it is parsed inline here.
 *   BASIC (per sku, scope.country, scope.marketplace; company does NOT participate — matches the browser key):
 *     group fc_regular_forecast by UPPER(sku)|UPPER(country)|LOWER(marketplace); for each window month pick the row whose
 *     String(year)===String(window.year) else the first row; add parseFloat(row[monthKey])||0. 0 when no rows (browser
 *     returns null; the raw fact is 0 — the display "--" convention is preserved by the PREREQ-5 composer).
 *   SPECIAL (per sku, scope {sku, company, country, marketplace}; company DOES participate — asymmetry preserved):
 *     scope-match each event (skuMatch via sku OR scope_type='sku'+scope_id; company/country/marketplace filter ONLY when
 *     both event and scope carry the field; drop dead statuses {inactive,deleted,archived,cancelled,void}); prep-month =
 *     UTC(eventStartDate) - 30 days; if prep YYYY-MM is in the window add parseFloat(fc_qty||qty)||0 (100% — never
 *     Target%-multiplied, each event once). 0 when no scoped events.
 *   Basic and Special stay SEPARATE facts — never blended in this owner.
 *
 * READ-ONLY. Reads ONLY fc_regular_forecast + fc_special_events (missing-safe — a missing FC table yields 0 facts, never
 * an error, matching the browser's graceful-empty behavior; ERROR != EMPTY != ZERO for transport failures). NEVER
 * getOperationDb. Writes nothing. No second forecast engine.
 *
 * Testability: pure `fcrBuild_` + helpers are `function` declarations (extract+eval friendly). The impure orchestrator
 * `handleFcSummaryRawGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO SpreadsheetApp.
 */

var FCR_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

var FCR_TABLES_ = [
  { name: 'fc_regular_forecast', requiredCols: [], optional: true },   // missing-safe (match browser graceful-empty)
  { name: 'fc_special_events',   requiredCols: [], optional: true }
];

var FCR_MONTH_KEYS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];   // == RO_MONTH_KEYS
var FCR_EVENT_DEAD_ = { inactive: 1, deleted: 1, archived: 1, cancelled: 1, 'void': 1 };   // == _RO_EVT_DEAD_SET
var FCR_PREP_OFFSET_MS_ = 30 * 24 * 60 * 60 * 1000;   // event_start_date - 30 days

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no server clock as authority). Match the db-api normalizer coercions exactly.
// --------------------------------------------------------------------------------------------------------
function fcrStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function fcrUpper_(v) { return fcrStr_(v).toUpperCase(); }
function fcrLower_(v) { return fcrStr_(v).toLowerCase(); }
function fcrNum_(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }   // parseFloat(v) || 0
function fcrPad2_(n) { return ('0' + n).slice(-2); }

// planning_cycle "RECO-YYYY-MM" -> { year, monthIdx } (monthIdx 0-based). Fail closed on malformed input.
function fcrParseCycle_(planningCycle) {
  var s = fcrStr_(planningCycle);
  var m = s.match(/^RECO-(\d{4})-(\d{1,2})$/);
  if (!m) { var e = new Error('planning_cycle must be "RECO-YYYY-MM" (got: ' + s + ')'); e.validationCode = 'VALIDATION_FAILED'; throw e; }
  var year = parseInt(m[1], 10), mon = parseInt(m[2], 10);
  if (!(mon >= 1 && mon <= 12)) { var e2 = new Error('planning_cycle month out of range: ' + s); e2.validationCode = 'VALIDATION_FAILED'; throw e2; }
  return { year: year, monthIdx: mon - 1 };
}

// The N+1..N+3 window from the anchor — identical to the browser _roMonthWindow(1, 3).
function fcrWindow_(anchor) {
  var out = [];
  for (var i = 0; i < 3; i++) {
    var mm = anchor.monthIdx + 1 + i;
    var yy = anchor.year + Math.floor(mm / 12);
    var idx = ((mm % 12) + 12) % 12;
    out.push({ monthKey: FCR_MONTH_KEYS_[idx], year: yy, idx: idx, label: yy + '-' + fcrPad2_(idx + 1) });
  }
  return out;
}

// BASIC FC (raw) — reproduce basicT3(sku, country, marketplace). fcByKey grouped by UPPER(sku)|UPPER(country)|LOWER(mp).
function fcrBasicRawT3_(fcByKey, sku, country, marketplace, windowMonths) {
  var key = fcrUpper_(sku) + '|' + fcrUpper_(country) + '|' + fcrLower_(marketplace);
  var rows = fcByKey[key];
  if (!rows || !rows.length) return 0;   // browser null -> raw fact 0
  var total = 0;
  for (var i = 0; i < windowMonths.length; i++) {
    var mo = windowMonths[i], row = null;
    for (var r = 0; r < rows.length; r++) { if (fcrStr_(rows[r].year) === String(mo.year)) { row = rows[r]; break; } }
    if (!row) row = rows[0];
    total += fcrNum_(row[mo.monthKey]);
  }
  return total;
}

// event_start_date resolution — explicit column, else parse yyyy-mm-dd tokens from the free-text period (== _fcParseEventPeriodDates start).
function fcrEventStartDate_(row) {
  var startCol = fcrStr_(row.event_start_date || row.start_date);
  if (startCol !== '') return startCol;
  var period = fcrStr_(row.event_period || row.period);
  if (period === '') return '';
  var re = /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/g, m;
  while ((m = re.exec(period)) !== null) { return m[1] + '-' + fcrPad2_(m[2]) + '-' + fcrPad2_(m[3]); }   // first token = start
  return '';
}

// == _roParseDate: strict yyyy-mm-dd -> UTC; else Date.parse fallback; null when unparseable.
function fcrParseDate_(s) {
  s = fcrStr_(s); if (!s) return null;
  var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  var t = Date.parse(s); return isNaN(t) ? null : new Date(t);
}

// == _roEventPrepMonth: prep = start - 30 days; return { year, idx } (UTC) or null.
function fcrEventPrepMonth_(row) {
  var dt = fcrParseDate_(fcrEventStartDate_(row));
  if (!dt) return null;
  var prep = new Date(dt.getTime() - FCR_PREP_OFFSET_MS_);
  return { year: prep.getUTCFullYear(), idx: prep.getUTCMonth() };
}

// == _roEventScopeMatch: sku (or scope_type='sku' + scope_id); conditional company/country/marketplace; drop dead statuses.
function fcrEventScopeMatch_(row, scope) {
  var skuMatch = (fcrUpper_(row.sku) === fcrUpper_(scope.sku)) || (fcrLower_(row.scope_type) === 'sku' && fcrUpper_(row.scope_id) === fcrUpper_(scope.sku));
  if (!skuMatch) return false;
  if (fcrStr_(row.company) && fcrStr_(scope.company) && fcrUpper_(row.company) !== fcrUpper_(scope.company)) return false;
  if (fcrStr_(row.country) && fcrStr_(scope.country) && fcrUpper_(row.country) !== fcrUpper_(scope.country)) return false;
  if (fcrStr_(row.marketplace) && fcrStr_(scope.marketplace) && fcrLower_(row.marketplace) !== fcrLower_(scope.marketplace)) return false;
  var st = fcrLower_(row.status);
  if (st && FCR_EVENT_DEAD_[st]) return false;
  return true;
}

// SPECIAL EVENT FC (raw) — reproduce _roSpecialEventsTotal(scope). eventRows = raw fc_special_events.
function fcrSpecialRawQty_(eventRows, scope, windowKeys) {
  var scoped = [];
  for (var i = 0; i < eventRows.length; i++) { if (fcrEventScopeMatch_(eventRows[i], scope)) scoped.push(eventRows[i]); }
  if (!scoped.length) return 0;   // browser null -> raw fact 0
  var total = 0;
  for (var j = 0; j < scoped.length; j++) {
    var pm = fcrEventPrepMonth_(scoped[j]);
    if (!pm) continue;
    if (windowKeys[pm.year + '-' + fcrPad2_(pm.idx + 1)] !== 1) continue;
    var e = scoped[j];
    var q = (e.fc_qty !== null && e.fc_qty !== undefined && e.fc_qty !== '') ? e.fc_qty : e.qty;   // == normalizer fcQty source
    total += fcrNum_(q);   // 100% — never Target%-multiplied
  }
  return total;
}

function fcrBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'fcSummary.raw.get', workspace: 'fcSummary', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// The pure orchestrator: raw FC tables + payload -> bounded per-SKU raw-forecast View Model.
//   payload.planning_cycle (REQUIRED, "RECO-YYYY-MM") — the time authority (never the server clock).
//   payload.scope { country, marketplace, company? } — applied per requested SKU (company: BASIC ignores it, SPECIAL uses it).
//   payload.skus [ ... ] (REQUIRED) — the SKUs to answer (per-site call).
function fcrBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var fcRows = tables.fc_regular_forecast || [], eventRows = tables.fc_special_events || [];
  var scope = (payload.scope && typeof payload.scope === 'object') ? payload.scope : {};
  var country = fcrStr_(scope.country), marketplace = fcrStr_(scope.marketplace), company = fcrStr_(scope.company);

  var anchor = fcrParseCycle_(payload.planning_cycle);
  var windowMonths = fcrWindow_(anchor);
  var windowKeys = {}; for (var w = 0; w < windowMonths.length; w++) windowKeys[windowMonths[w].label] = 1;

  // group fc_regular_forecast by UPPER(sku)|UPPER(country)|LOWER(marketplace) (== browser fcByKey)
  var fcByKey = {};
  for (var i = 0; i < fcRows.length; i++) {
    var k = fcrUpper_(fcRows[i].sku) + '|' + fcrUpper_(fcRows[i].country) + '|' + fcrLower_(fcRows[i].marketplace);
    (fcByKey[k] = fcByKey[k] || []).push(fcRows[i]);
  }

  var reqSkus = Array.isArray(payload.skus) ? payload.skus : [];
  var items = [], seen = {};
  for (var s = 0; s < reqSkus.length; s++) {
    var sku = fcrStr_(reqSkus[s]); if (sku === '') continue;
    var dk = sku.toUpperCase(); if (seen[dk]) continue; seen[dk] = 1;
    var basic = fcrBasicRawT3_(fcByKey, sku, country, marketplace, windowMonths);
    var special = fcrSpecialRawQty_(eventRows, { sku: sku, company: company, country: country, marketplace: marketplace }, windowKeys);
    items.push({ sku: sku, basicFcRawT3Qty: basic, specialEventFcRawQty: special });
  }

  return {
    planningCycle: fcrStr_(payload.planning_cycle),
    anchorMonth: anchor.year + '-' + fcrPad2_(anchor.monthIdx + 1),
    windowMonths: windowMonths.map(function (mo) { return mo.label; }),
    scope: { country: country, marketplace: marketplace, company: company },
    items: items,
    count: items.length
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function fcrRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function fcrDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { FCR_SEQ_++; return FCR_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      if (optional && !ss.getSheetByName(name)) return [];   // missing FC table -> [] (match browser graceful-empty)
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return fcrRowsToObjects_(sheet);
    }
  };
}

function handleFcSummaryRawGet_(body, io) {
  io = io || fcrDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = fcrStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  try {
    var payload = (body && body.payload) || {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < FCR_TABLES_.length; i++) { var spec = FCR_TABLES_[i]; tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true); readCount++; }
    var vm = fcrBuild_(tables, payload);
    return fcrBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'FC_SUMMARY_RAW_BUILD_FAILED';
    return fcrBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
