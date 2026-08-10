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

// F1-4B-FM5-R4UI-R5C — READ-ONLY deployment/version PROBE (diagnostics only; NO DB write, NO schema, NO formula).
// Stamped into every batch response envelope's `meta` so ONE browser Network response from "Recalculate All Sites"
// proves which deployed gap-materialization handler is actually live (distinguishes a stale Apps Script deployment
// from a genuine remaining defect). Bump this token on each round that touches the live server path.
var GAP_MATERIALIZATION_HANDLER_VERSION_ = 'fm5-r4ui-r5c';

var GAP_KEY_COLS_ = ['company', 'country', 'marketplace', 'sku'];
var GAP_MAX_SKUS_ = 5000;          // bounded page size for the per-scope canonical read (no per-SKU HTTP)
var GAP_INV_WINDOWS_ = ['D18', 'D30', 'D45', 'D90'];
var GAP_OP_TIERS_ = ['T1', 'T2', 'T3', 'T4'];

// ---- small pure helpers -------------------------------------------------------------------------------
function gapIsFiniteNum_(v) { return typeof v === 'number' && isFinite(v); }
function gapStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
// MISSING vs ZERO: '' / null / undefined → null (never coerced to 0); an explicit finite value (incl. 0) → that value.
function gapNum_(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
function gapTruthy_(v) { if (v === true) return true; var s = gapStr_(v).toLowerCase(); return s === 'true' || s === 'yes' || s === '1'; }
// Canonical country identity (UK ≡ GB) via the bundled KMCID owner; fallback upper-case (never guesses an alias).
function gapCanonCountry_(v) { return (typeof KMCID !== 'undefined' && KMCID && typeof KMCID.canonicalCountryCode === 'function') ? KMCID.canonicalCountryCode(v) : gapStr_(v).toUpperCase(); }
// Canonical KMMSA receiver key (company||canonicalCountry||marketplace||sku) — MUST match the key the recommendation
// workspace computes for supplyAllocationByReceiver, so the injected allocation lands on the right receiver.
function gapReceiverKey_(company, country, marketplace, sku) {
  return (typeof KMMSA !== 'undefined' && KMMSA && typeof KMMSA.receiverKeyOf === 'function')
    ? KMMSA.receiverKeyOf({ company: company, country: country, marketplace: marketplace, sku: sku })
    : [gapStr_(company), gapCanonCountry_(country), gapStr_(marketplace), gapStr_(sku)].join('||');
}

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
    // F1-4B-FM5-R4UI-R7 §1/§4 — surface the SPECIFIC upstream horizon reason (e.g. SALES_BASIS_UNAVAILABLE /
    // SALES_BASIS_AMBIGUOUS, stamped by recoWsExpandMarketplace_/recoWsExpandWarehouse_) instead of masking it as
    // the generic HORIZONS_NOT_AVAILABLE. Falls back to the generic token only when no specific reason was provided.
    if (!hz || !hz.length) { blockedReason = gapStr_(L && L.horizonsBlockedReason) || 'HORIZONS_NOT_AVAILABLE'; break; }
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

// ============================================================================================================
// F1-4B-FM5-R4 — canonical CALCULATION-CONTEXT owner (Asia/Taipei; deterministic; ONE owner for date+month+cycle)
// ------------------------------------------------------------------------------------------------------------
// calculationDate = YYYY-MM-DD · calculationMonth = the date's YYYY-MM · planningCycle = RECO-{month}. After R4 the
// three are NEVER independent authorities — month + cycle are DERIVED from the date. Asia/Taipei is a FIXED UTC+8
// offset (Taiwan observes no DST), so the calendar date is pure epoch arithmetic — no Utilities, no local/UTC clock
// leak, no DST drift. Job rule (§2/§3): INVENTORY uses the execution's Asia/Taipei date (13:30 Day D); ORDER_PLANNING
// uses the PREVIOUS Asia/Taipei calendar date (its 03:30 Day D+1 run precedes that day's 12:00–13:00 source refresh,
// so it belongs to the latest COMPLETED source cycle = Day D). ONE owner for scheduled AND manual (§6). The scheduler
// INJECTS the derived context into the batch io — it never mutates a Script Property (§5).
var GAP_CALC_TZ_ = 'Asia/Taipei';
var GAP_CALC_UTC_OFFSET_MIN_ = 480;   // Asia/Taipei = UTC+8, fixed (no DST in Taiwan)
function gapCalcLeap_(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
function gapCalcDaysInMonth_(y, m) { return [31, gapCalcLeap_(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
function gapCalcYmdValid_(ymd) {
  ymd = String(ymd == null ? '' : ymd);
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(ymd)) return false;
  return +ymd.slice(8, 10) <= gapCalcDaysInMonth_(+ymd.slice(0, 4), +ymd.slice(5, 7));   // reject 2026-02-30 etc.
}
// PURE: epoch ms → Asia/Taipei calendar date (shift by the fixed UTC+8 offset, then read the UTC wall-clock).
function gapCalcTaipeiYmd_(epochMs) {
  var d = new Date(epochMs + GAP_CALC_UTC_OFFSET_MIN_ * 60000);
  var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}
// PURE: previous calendar day (correct across month/year/leap boundaries; string arithmetic, NO Date subtraction).
function gapCalcPrevYmd_(ymd) {
  var y = +ymd.slice(0, 4), m = +ymd.slice(5, 7), d = +ymd.slice(8, 10);
  d -= 1; if (d < 1) { m -= 1; if (m < 1) { m = 12; y -= 1; } d = gapCalcDaysInMonth_(y, m); }
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
}
// PURE: canonical calculation context for a job from an Asia/Taipei execution date. Month + cycle derive from the date.
function gapCalcContextForJob_(jobType, execYmd) {
  if (!gapCalcYmdValid_(execYmd)) return { ok: false, code: 'CALCULATION_CONTEXT_DATE_INVALID', message: 'execution Asia/Taipei date invalid: ' + execYmd };
  var calcDate = (String(jobType) === 'ORDER_PLANNING') ? gapCalcPrevYmd_(execYmd) : execYmd;
  var calcMonth = calcDate.slice(0, 7);
  return { ok: true, jobType: String(jobType), calculationDate: calcDate, calculationMonth: calcMonth, planningCycle: 'RECO-' + calcMonth, timezone: GAP_CALC_TZ_ };
}
function gapCalcNowMs_() { return new Date().getTime(); }                                   // the ONLY clock read (server-side)
// Resolve the canonical context for a job at an execution instant (default = now). One owner; scheduled + manual.
function gapCalcResolveContext_(jobType, nowMs) { return gapCalcContextForJob_(jobType, gapCalcTaipeiYmd_(nowMs != null ? nowMs : gapCalcNowMs_())); }

// ---- default IO (memoized spreadsheet open; injectable canonical calc-context; reuse the canonical calc) ------
// F1-4B-FM5-R4: when `calcContext` is supplied, the reco-io's calculation DATE + MONTH come from it (the canonical
// deterministic context) — NOT from the RECOMMENDATION_CALCULATION_DATE / _MONTH Script Properties. When it is
// absent (a direct/diagnostic workspace.get), the Script Properties remain the debug/override authority (§5).
function gapMaterializationDefaultIo_(calcContext) {
  var _ss = null;
  var ctx = (calcContext && calcContext.ok) ? calcContext : null;
  return {
    now: function () { return new Date(); },
    tz: function () { try { return Session.getScriptTimeZone(); } catch (e) { return 'UTC'; } },
    calcContext: ctx,
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
      if (ctx) {                                            // inject the canonical deterministic context (no Script Property)
        recoIo.configDate = function () { return ctx.calculationDate; };
        recoIo.configMonth = function () { return ctx.calculationMonth; };
      }
      return handleRecommendationWorkspaceGet_(body, recoIo);
    }
  };
}

function gapBatchTimestamp_(io) {
  try { return Utilities.formatDate(io.now(), io.tz(), 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return ''; }
}
function gapBatchEnvelope_(ok, data, errorToken, message) {
  // R5C: additive READ-ONLY version marker on the meta (both success and failure) — proves the live handler.
  var meta = { gapMaterializationHandlerVersion: GAP_MATERIALIZATION_HANDLER_VERSION_ };
  return ok ? { success: true, data: data, meta: meta, errors: [] }
    : { success: false, data: null, meta: meta, errors: [{ code: errorToken || 'GAP_BATCH_ERROR', message: message || errorToken || 'gap batch error', details: null }] };
}

// F1-4B-FM5-R4T — additive DIAGNOSTIC run identity for the manual/scheduled batch. Format
// GAP-{INV|OP}-{yyyymmddThhmmss}-{seq} (e.g. GAP-INV-20260809T131500-0001). Derived ONLY from the injected io
// clock (Asia/Taipei) + a bounded in-memory sequence — NO Math.random, NO DB, NO new table. Lets the client
// correlate a batch response with its logs when the transport response is later recovered.
var gapRunSeq_ = 0;
function gapRunId_(product, io) {
  var p = (product === 'INVENTORY') ? 'INV' : ((product === 'ORDER_PLANNING') ? 'OP' : gapStr_(product) || 'GAP');
  var ts = (gapBatchTimestamp_(io) || '').replace(/-/g, '').replace(/:/g, '').replace(' ', 'T');   // yyyymmddThhmmss
  gapRunSeq_ = (gapRunSeq_ + 1) % 10000;
  return 'GAP-' + p + '-' + ts + '-' + ('000' + gapRunSeq_).slice(-4);
}

// ---- shared batch orchestration (Inventory + Order Planning share the enumerate→calc→map→UPSERT skeleton) --
// F1-4B-FM5-R4J — the per-scope enumerate→calc→map→UPSERT body is extracted into gapProcessScopeSlice_ so the SAME
// canonical calculation can be driven either over ALL scopes (the monolithic manual/all path, unchanged behavior)
// or over a BOUNDED SLICE of scopes (the backend-owned resumable job, 46_..._job.gs). NO calculation/mapping change:
// the loop body, the workspace.get call, cfg.map, and the latest-state UPSERT are byte-for-byte the prior logic —
// only the surrounding batch summary/loop ownership moved. Each Inventory scope is fully independent (no shared
// pool), so any scope subset is safe to process alone and resume-by-scope is exact.
function gapProcessScopeSlice_(scopes, io, sheet, cfg) {
  var acc = { scopesCalculated: 0, written: 0, ready: 0, blocked: 0, errors: 0, calculationAuthority: null, scopeErrors: [], calculatedAt: null };
  var ts = gapBatchTimestamp_(io);
  acc.calculatedAt = ts;
  var ss = io.openTarget();                                              // memoized: the shared spreadsheet for this batch/slice
  for (var s = 0; s < scopes.length; s++) {
    var scope = scopes[s];
    var reqBody = { requestId: 'GAP-' + cfg.product + '-' + (scope.company + '/' + scope.country + '/' + scope.marketplace), payload: { scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace }, pagination: { page: 1, size: GAP_MAX_SKUS_ } } };
    var env;
    try { env = io.workspaceGet(reqBody, ss); } catch (e) { env = null; }
    if (!env || env.success !== true) {
      acc.errors++;
      acc.scopeErrors.push({ scope: scope.company + '/' + scope.country + '/' + scope.marketplace, code: (env && env.errors && env.errors[0] && env.errors[0].code) || 'SCOPE_CALCULATION_FAILED' });
      continue;
    }
    acc.scopesCalculated++;
    var meta = env.meta || {};
    var calcAuthority = cfg.product === 'INVENTORY' ? (meta.calculationDate || '') : (meta.calculationMonth || '');
    if (acc.calculationAuthority == null && calcAuthority) acc.calculationAuthority = calcAuthority;
    var lines = (env.data && env.data.lines) ? env.data.lines : [];
    var bySku = {}; lines.forEach(function (L) { var k = gapStr_(L.sku); if (!k) return; (bySku[k] = bySku[k] || []).push(L); });
    for (var sku in bySku) {
      if (!Object.prototype.hasOwnProperty.call(bySku, sku)) continue;
      var row = cfg.map(bySku[sku], scope, sku, calcAuthority);
      row.calculated_at = ts;                                            // latest-state UPSERT by business key → idempotent on re-run
      row.updated_at = ts;
      gapUpsertByKey_(sheet, row);
      acc.written++;
      if (row.calculation_status === 'READY') acc.ready++;
      else if (row.calculation_status === 'BLOCKED') acc.blocked++;
      else acc.errors++;
    }
  }
  return acc;
}

function gapRunBatch_(body, io, cfg) {
  io = io || gapMaterializationDefaultIo_();
  try {
    var startedAt = gapBatchTimestamp_(io);                              // R4T: batch start (diagnostic; compact summary)
    var runId = gapRunId_(cfg.product, io);                              // R4T: diagnostic run identity (no DB)
    var ss = io.openTarget();
    var sheet = prodRequireSheet_(ss, cfg.table, cfg.headers);          // fail CLOSED if table/header missing/invalid
    var scopes = io.enumerateScopes ? io.enumerateScopes(ss) : gapEnumerateScopes_(ss);
    var acc = gapProcessScopeSlice_(scopes, io, sheet, cfg);            // process ALL scopes (behavior identical to prior loop)
    // COMPACT summary ONLY (R4T §5) — counts + timestamps + run identity; NEVER per-SKU rows.
    var summary = { product: cfg.product, materializationRunId: runId, startedAt: startedAt, finishedAt: acc.calculatedAt,
      calculationAuthority: acc.calculationAuthority, totalScopes: scopes.length, scopesCalculated: acc.scopesCalculated,
      ready: acc.ready, blocked: acc.blocked, errors: acc.errors, written: acc.written, calculatedAt: acc.calculatedAt, scopeErrors: acc.scopeErrors };
    return gapBatchEnvelope_(true, summary);
  } catch (e) {
    var token = (e && e.safetyToken) ? e.safetyToken : (e && e.schemaStatus) ? e.schemaStatus : 'GAP_BATCH_ERROR';
    return gapBatchEnvelope_(false, null, token, e && e.message ? String(e.message) : String(e));
  }
}

// ============================================================================================================
// F1-4B-FM5-R2b — Order Planning MONTHLY supply-allocation orchestration (Overseas + Factory → opening supply)
// ------------------------------------------------------------------------------------------------------------
// Wires the FROZEN marketplace-receiver allocation contract (KMMSA, FM5-R2A supplemental) into the Order Planning
// batch. The competing MONTHLY marketplace receivers of a company+SKU share the lineage-net physical pools, so the
// allocation MUST be computed ONCE across the complete bounded receiver set and only then fed back into each
// receiver's own KMTPP projection (§12/§14) — never one marketplace at a time (which would duplicate a shared pool).
//   • FACTORY  — company-wide competing set (factory_stock is the FACTORY_SHARED pool; is_factory_warehouse eligible).
//   • OVERSEAS — per (company, canonical country) competing set (overseas_inventory_snapshot THREE_PL current stock);
//                the frozen overseas allocator is single-country and R2b §0 forbids a new allocator, so overseas
//                competition is per-country while factory is company-wide. FBA is Site Stock (excluded — no double
//                count). Overseas + Factory are INDEPENDENT pools, INDEPENDENTLY conserved (FM5-R2A supplemental §6).
// Lineage-net BY SOURCE CONSTRUCTION: only the current-stock snapshots enter the pool; a quantity transitioned to
// SHIPPED_IN_TRANSIT lives in `shipments` (surfaced as ETA-dated qualified incoming), never in these snapshots — so
// NO heuristic subtraction and NO SKU+qty dedup (§4/§16). Opening supply = Site + allocated Overseas + allocated
// Factory (§1/§7); the shipment stays incoming-only (§8) — the same physical lineage is never counted twice.

// Read the lineage-net source pools + marketplace authorities ONCE for the whole batch (bounded; READ ONLY).
function gapOpReadSupplyPoolFacts_(ss) {
  var whById = {}, factoryWhIds = {};
  gapReadObjects_(ss, 'warehouses').forEach(function (w) {
    var id = gapStr_(w.warehouse_id); if (!id) return;
    whById[id] = { company: gapStr_(w.company), country: gapCanonCountry_(w.country), type: gapStr_(w.warehouse_type).toUpperCase(), active: gapTruthy_(w.is_active), factory: gapTruthy_(w.is_factory_warehouse) };
    if (whById[id].factory) factoryWhIds[id] = 1;
  });
  var priorityByMkt = {};
  gapReadObjects_(ss, 'marketplaces').forEach(function (m) {
    var key = gapStr_(m.company) + '||' + gapCanonCountry_(m.country) + '||' + gapStr_(m.marketplace);
    var ap = gapNum_(m.allocation_priority); if (ap !== null) priorityByMkt[key] = ap;   // §20.4 DB-confirmed; missing → KMMSA default 0
  });
  // OVERSEAS THREE_PL pools per company||canonicalCountry||sku (warehouses join: 3PL + active only; FBA excluded).
  var overseasPoolsByKey = {};
  gapReadObjects_(ss, 'overseas_inventory_snapshot').forEach(function (r) {
    var q = gapNum_(r.wh_available_stock); if (q === null || q < 0) return;                 // missing ≠ 0; negative fail-closed
    var wh = gapStr_(r.warehouse_id), sku = gapStr_(r.sku); if (!wh || !sku) return;
    var meta = whById[wh]; if (!meta) return;                                               // unknown warehouse → not eligible
    if (meta.type && meta.type !== '3PL') return;                                           // THREE_PL lane only
    if (!meta.active) return;                                                               // inactive → excluded
    var k = gapStr_(meta.company) + '||' + meta.country + '||' + sku;
    (overseasPoolsByKey[k] = overseasPoolsByKey[k] || []).push({ poolKey: 'OV:' + wh + ':' + sku, poolType: 'THREE_PL', warehouseId: wh, effectiveSupplyQty: q });
  });
  // FACTORY pools per sku (company-wide FACTORY_SHARED); only is_factory_warehouse stock is eligible.
  var factoryPoolsBySku = {};
  gapReadObjects_(ss, 'factory_stock').forEach(function (r) {
    var q = gapNum_(r.fac_current_stock); if (q === null || q < 0) return;
    var wh = gapStr_(r.warehouse_id), sku = gapStr_(r.sku); if (!wh || !sku) return;
    if (!factoryWhIds[wh]) return;                                                          // only factory warehouses
    (factoryPoolsBySku[sku] = factoryPoolsBySku[sku] || []).push({ poolKey: 'FC:' + wh + ':' + sku, poolType: 'FACTORY', warehouseId: wh, effectiveSupplyQty: q });
  });
  return { overseasPoolsByKey: overseasPoolsByKey, factoryPoolsBySku: factoryPoolsBySku,
    eligibleFactoryWarehouseIds: Object.keys(factoryWhIds).sort(), priorityByMkt: priorityByMkt };
}

// PURE. Run the FROZEN KMMSA contract over the harvested competing receiver set: FACTORY once per (company, sku)
// company-wide; OVERSEAS once per (company, canonicalCountry, sku). 0 receivers → nothing; 1 → 100% of the eligible
// pool; >1 → conserved KMMSA/KMALLOC. Independent pools, independently conserved (§6). Returns the per-receiver
// {overseasCoveredQty, factoryCoveredQty} keyed by the canonical receiver key + any allocation issues.
function gapOpBuildSupplyAllocation_(receivers, poolFacts) {
  var out = {}, issues = [];
  if (typeof KMMSA === 'undefined' || !KMMSA || typeof KMMSA.allocateMarketplaceReceiverSupply !== 'function') {
    return { byReceiverKey: out, issues: [{ scope: '', code: 'KMMSA_NOT_BUNDLED' }] };
  }
  var byCompanySku = {}, byCompanyCountrySku = {};
  (receivers || []).forEach(function (r) {
    var cc = gapCanonCountry_(r.country);   // canonical (UK ≡ GB) so the group key matches the canonical pool key
    (byCompanySku[r.company + '||' + r.sku] = byCompanySku[r.company + '||' + r.sku] || []).push(r);
    (byCompanyCountrySku[r.company + '||' + cc + '||' + r.sku] = byCompanyCountrySku[r.company + '||' + cc + '||' + r.sku] || []).push(r);
  });
  function ensure(k) { if (!out[k]) out[k] = { overseasCoveredQty: 0, factoryCoveredQty: 0 }; return out[k]; }
  function msaReceivers(list, eligiblePoolTypes) {
    return list.map(function (r) {
      var o = { company: r.company, country: r.country, marketplace: r.marketplace, sku: r.sku, demandQty: r.demandQty, allocationPriority: r.allocationPriority, requiredByDate: r.requiredByDate };
      if (eligiblePoolTypes) o.eligiblePoolTypes = eligiblePoolTypes;
      return o;
    });
  }
  Object.keys(byCompanySku).forEach(function (cs) {                                          // FACTORY — company-wide
    var list = byCompanySku[cs], pools = poolFacts.factoryPoolsBySku[list[0].sku] || [];
    if (!pools.length) return;                                                               // no factory pool → 0 (valid)
    var res = KMMSA.allocateMarketplaceReceiverSupply({ company: list[0].company, masterSku: list[0].sku, factoryPools: pools, eligibleFactoryWarehouseIds: poolFacts.eligibleFactoryWarehouseIds, receivers: msaReceivers(list) });
    if (!res || res.blocked) { issues.push({ scope: cs, code: (res && res.issues && res.issues[0] && res.issues[0].code) || 'FACTORY_ALLOCATION_BLOCKED' }); return; }
    for (var k in res.byReceiver) if (Object.prototype.hasOwnProperty.call(res.byReceiver, k)) ensure(k).factoryCoveredQty += (res.byReceiver[k].allocatedFactoryQty || 0);
  });
  Object.keys(byCompanyCountrySku).forEach(function (ccs) {                                   // OVERSEAS — per country
    var list = byCompanyCountrySku[ccs], pools = poolFacts.overseasPoolsByKey[ccs] || [];
    if (!pools.length) return;
    var res = KMMSA.allocateMarketplaceReceiverSupply({ company: list[0].company, masterSku: list[0].sku, overseasPools: pools, receivers: msaReceivers(list, ['THREE_PL']) });
    if (!res || res.blocked) { issues.push({ scope: ccs, code: (res && res.issues && res.issues[0] && res.issues[0].code) || 'OVERSEAS_ALLOCATION_BLOCKED' }); return; }
    for (var k2 in res.byReceiver) if (Object.prototype.hasOwnProperty.call(res.byReceiver, k2)) ensure(k2).overseasCoveredQty += (res.byReceiver[k2].allocatedOverseasQty || 0);
  });
  return { byReceiverKey: out, issues: issues };
}

// ---- PUBLIC batch owners (one bounded server batch per manual button) ---------------------------------
// F1-4B-FM5-R4: when no io is injected (the manual "Recalculate All Sites" / router path), derive the canonical
// deterministic Asia/Taipei context (INVENTORY → today) and inject it — the SAME owner + rule the scheduler uses,
// so manual and scheduled never calculate different business periods (§6). An injected io (scheduler / tests) is
// used as-is. Fail closed on an invalid context (§10) — never a fabricated/blank/UTC date.
function handleRecalculateInventoryReplenishmentGapBatch_(body, io) {
  if (!io) {
    var ctx = gapCalcResolveContext_('INVENTORY');
    if (!ctx.ok) return gapBatchEnvelope_(false, null, ctx.code, ctx.message);
    io = gapMaterializationDefaultIo_(ctx);
  }
  return gapRunBatch_(body, io, { product: 'INVENTORY', table: INV_GAP_TABLE_, headers: INV_GAP_HEADERS_, map: gapInvMapFromLines_ });
}

// F1-4B-FM5-R4J — Order Planning HARVEST→ALLOCATE→RE-PROJECT→MATERIALIZE extracted into a scope-slice processor so
// the SAME two-pass logic drives either ALL scopes (monolithic) or a BOUNDED SLICE (the resumable job). CONSERVATION
// INVARIANT: gapOpBuildSupplyAllocation_ groups the competing set strictly by `company||sku` (FACTORY) and
// `company||canonicalCountry||sku` (OVERSEAS) — there is NEVER cross-company pool sharing — so a slice that contains
// a COMPLETE COMPANY yields byte-identical allocation to the monolithic run for that company. The job therefore
// chunks Order Planning by whole company (never splitting a company across slices); this processor re-runs the full
// harvest→allocate→reproject over EXACTLY the passed scopes, so it MUST be handed a company-complete scope set.
// NO calculation/allocation/mapping change — only the loop ownership moved.
function gapProcessOrderPlanningScopeSlice_(scopes, io, ss, sheet, poolFacts, map) {
  var acc = { scopesCalculated: 0, written: 0, ready: 0, blocked: 0, errors: 0, scopeErrors: [], allocationIssues: [], receiversConsidered: 0, scopesReprojected: 0, calculatedAt: null };
  var ts = gapBatchTimestamp_(io);
  acc.calculatedAt = ts;

  // ---- PASS 1: harvest MONTHLY marketplace receivers (demand + required-by) across the passed competing set ----
  var receivers = [], envByScope = {}, s, scope, env, lines;
  for (s = 0; s < scopes.length; s++) {
    scope = scopes[s];
    var reqBody = { requestId: 'GAP-OP-H-' + (scope.company + '/' + scope.country + '/' + scope.marketplace), payload: { scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace }, pagination: { page: 1, size: GAP_MAX_SKUS_ } } };
    try { env = io.workspaceGet(reqBody, ss); } catch (e) { env = null; }
    envByScope[scope.company + '||' + scope.country + '||' + scope.marketplace] = env;
    if (!env || env.success !== true) continue;
    lines = (env.data && env.data.lines) ? env.data.lines : [];
    var country = gapCanonCountry_(scope.country), pkey = scope.company + '||' + country + '||' + scope.marketplace;
    lines.forEach(function (L) {
      if (!L || L.recommendationMode !== 'MARKETPLACE_ORDER_NEED' || L.blocked) return;   // MARKETPLACE receivers only
      var sku = gapStr_(L.sku); if (!sku) return;
      var demandQty = gapNum_(L.allocatedForecastQty); if (demandQty === null) return;     // no quantified demand → not competing
      var mp = L.monthlyProjection; if (!mp || !mp.length || !gapStr_(mp[0].month)) return; // needs a T1 month for required-by
      receivers.push({ company: scope.company, country: country, marketplace: scope.marketplace, sku: sku,
        demandQty: demandQty, requiredByDate: gapStr_(mp[0].month) + '-01',
        allocationPriority: (poolFacts.priorityByMkt[pkey] != null ? poolFacts.priorityByMkt[pkey] : 0),
        key: gapReceiverKey_(scope.company, country, scope.marketplace, sku) });
    });
  }

  // ---- ALLOCATE the shared pools ONCE across the passed competing set (conserved; per-company by construction) ----
  var alloc = gapOpBuildSupplyAllocation_(receivers, poolFacts);
  acc.allocationIssues = alloc.issues; acc.receiversConsidered = receivers.length;
  var allocMap = alloc.byReceiverKey, scopeHasAlloc = {};
  receivers.forEach(function (r) { var a = allocMap[r.key]; if (a && (a.overseasCoveredQty > 0 || a.factoryCoveredQty > 0)) scopeHasAlloc[r.company + '||' + r.country + '||' + r.marketplace] = 1; });

  // ---- PASS 2 + MATERIALIZE: re-project scopes with injected allocation (else reuse harvest), map, UPSERT ----
  for (s = 0; s < scopes.length; s++) {
    scope = scopes[s];
    var envKey = scope.company + '||' + scope.country + '||' + scope.marketplace;
    var canonKey = scope.company + '||' + gapCanonCountry_(scope.country) + '||' + scope.marketplace;
    var env2;
    if (scopeHasAlloc[canonKey]) {
      var reqBody2 = { requestId: 'GAP-OP-M-' + (scope.company + '/' + scope.country + '/' + scope.marketplace), payload: { scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace }, pagination: { page: 1, size: GAP_MAX_SKUS_ }, supplyAllocationByReceiver: allocMap } };
      try { env2 = io.workspaceGet(reqBody2, ss); } catch (e2) { env2 = null; }
      if (env2 && env2.success === true) acc.scopesReprojected++;
    } else {
      env2 = envByScope[envKey];                                                           // Site-Stock-only projection already correct
    }
    if (!env2 || env2.success !== true) {
      acc.errors++;
      acc.scopeErrors.push({ scope: envKey, code: (env2 && env2.errors && env2.errors[0] && env2.errors[0].code) || 'SCOPE_CALCULATION_FAILED' });
      continue;
    }
    acc.scopesCalculated++;
    var calcAuthority = (env2.meta && env2.meta.calculationMonth) || '';
    var lines2 = (env2.data && env2.data.lines) ? env2.data.lines : [];
    var bySku = {}; lines2.forEach(function (L) { var k = gapStr_(L.sku); if (!k) return; (bySku[k] = bySku[k] || []).push(L); });
    for (var sku2 in bySku) {
      if (!Object.prototype.hasOwnProperty.call(bySku, sku2)) continue;
      var row = map(bySku[sku2], scope, sku2, calcAuthority);
      row.calculated_at = ts; row.updated_at = ts;
      gapUpsertByKey_(sheet, row);
      acc.written++;
      if (row.calculation_status === 'READY') acc.ready++;
      else if (row.calculation_status === 'BLOCKED') acc.blocked++;
      else acc.errors++;
    }
  }
  return acc;
}

// Order Planning batch — HARVEST competing receivers (one canonical read per scope) → ALLOCATE the shared lineage-net
// pools ONCE across the full set (conserved) → RE-PROJECT each scope with its injected allocation (Site-Stock-only
// scopes reuse the harvest pass; no wasted read) → map + UPSERT order_planning_gap. ONE bounded server batch, no
// per-SKU HTTP loop, no shared-pool duplication. Inventory batch is untouched (§18).
function handleRecalculateOrderPlanningGapBatch_(body, io) {
  if (!io) {
    var opCtx = gapCalcResolveContext_('ORDER_PLANNING');   // §3 latest completed source cycle = the PREVIOUS Asia/Taipei date
    if (!opCtx.ok) return gapBatchEnvelope_(false, null, opCtx.code, opCtx.message);
    io = gapMaterializationDefaultIo_(opCtx);
  }
  try {
    var ss = io.openTarget();
    var sheet = prodRequireSheet_(ss, OP_GAP_TABLE_, OP_GAP_HEADERS_);                        // fail CLOSED if missing/invalid
    var scopes = io.enumerateScopes ? io.enumerateScopes(ss) : gapEnumerateScopes_(ss);
    var poolFacts = io.readSupplyPoolFacts ? io.readSupplyPoolFacts(ss) : gapOpReadSupplyPoolFacts_(ss);
    var acc = gapProcessOrderPlanningScopeSlice_(scopes, io, ss, sheet, poolFacts, gapOpMapFromLines_);   // ALL scopes (behavior identical)
    var summary = { product: 'ORDER_PLANNING', totalScopes: scopes.length, scopesCalculated: acc.scopesCalculated, ready: acc.ready, blocked: acc.blocked, errors: acc.errors, written: acc.written, calculatedAt: acc.calculatedAt, scopeErrors: acc.scopeErrors, allocationIssues: acc.allocationIssues, receiversConsidered: acc.receiversConsidered, scopesReprojected: acc.scopesReprojected };
    return gapBatchEnvelope_(true, summary);
  } catch (e) {
    var token = (e && e.safetyToken) ? e.safetyToken : (e && e.schemaStatus) ? e.schemaStatus : 'GAP_BATCH_ERROR';
    return gapBatchEnvelope_(false, null, token, e && e.message ? String(e.message) : String(e));
  }
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
