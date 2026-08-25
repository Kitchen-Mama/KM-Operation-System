/**
 * 56_api_v1_ai_plan_first_layer.gs
 * Kitchen Mama Operation System — API v1 · AI-Plan first-layer COMPOSER (Phase API / F1-7E-PREREQ-5).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped page read model for the request-order.js (下單系統 / AI-Plan)
 * FIRST-LAYER table. Action = "aiPlanFirstLayer.get" (body-carrying READ, no write).
 *
 * THIS IS A COMPOSER, NOT AN ENGINE. It builds the SAME rows the browser `_buildRequestOrderRowsFromDb()` builds, by
 * REUSING the already-frozen pure fact functions from the Layer-1 read owners (all global in Apps Script):
 *   Basic FC / Special FC   -> 53_ fcrParseCycle_/fcrWindow_/fcrBasicRawT3_/fcrSpecialRawQty_/fcrEventScopeMatch_
 *   Site / Overseas Stock   -> 54_ rivSiteStock_/rivOverseasStock_/rivPick_ (+ RIV_FACTORY_FLAG_)
 *   Factory Stock           -> 54_ rivPick_ (Σ fac_current_stock per SKU)
 *   Open PO Remaining       -> 52_ oprLineRemaining_ (+ OPR_OPEN_STATUS_)
 *   Lead Time               -> 55_ ltoLeadTimeForSku_
 * It authors NO new formula and duplicates NO owner arithmetic — it only (a) builds the SKU-scope indexes those pure
 * functions take, (b) iterates marketplace_skus to form the row identity, and (c) maps each owner's "raw fact 0/absent"
 * back to the browser's DISPLAY null convention (see below) so BEFORE == AFTER for the exact displayed table AND for the
 * allocation-draft snapshot writes that read these values.
 *
 * NULL-FIDELITY (the browser `_buildRequestOrderRowsFromDb` semantics, preserved EXACTLY):
 *   basicFcT3        = null when no fc_regular_forecast row for the site key; else the raw N+1..N+3 sum (incl 0).
 *   specialEventsFc  = null when no scoped fc_special_events; else the raw prep-month sum (incl 0).
 *   siteStock        = null when no amazon_inventory_snapshot row matches the site; else available+transfer+processing.
 *   thirdPartyStock  = null when no overseas row matches; else the pooled Σ.
 *   factoryStock     = Σ factory_stock (|| 0) — NEVER null (browser uses `|| 0`).
 *   totalOngoingOrders = null when no OPEN-PO line contributes (>0); else the pooled remaining (browser `ongoing` is
 *                        always null or positive — never 0 — so raw 0 <-> null is exact).
 *   leadTimeDays     = the 55_ owner value (already null / number).
 *
 * TIME AUTHORITY (PDR-2): planning_cycle "RECO-YYYY-MM" is REQUIRED and supplied by the caller (the client resolves the
 * current Asia/Taipei cycle from the SAME _roTpeNow() the browser window uses). The server NEVER uses its clock.
 *
 * LAYER SEPARATION: this composer produces ONLY Layer-1 RAW facts + identity. Layer-2 (materialized Gap / Suggested /
 * Recommendation) stays on the EXISTING scoped path (orderPlanningGap.get / recommendation.workspace.get, consumed on
 * expand) — NOT recomputed here. Layer-3 (chosen qty / allocation / Request Order) stays owned by the draft flow.
 *
 * READ-ONLY. Reads a TARGETED table set (never getOperationDb). Writes nothing. No Gap/Recommendation/allocation/FIFO.
 *
 * Testability: pure `aplBuild_` is a `function` declaration (extract+eval friendly). The impure orchestrator
 * `handleAiPlanFirstLayerGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO SpreadsheetApp.
 */

var APL_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

var APL_TABLES_ = [
  { name: 'marketplace_skus',            requiredCols: [], optional: true },   // row universe (identity)
  { name: 'sku_details',                 requiredCols: [], optional: true },   // category / series / units_per_carton
  { name: 'fc_regular_forecast',         requiredCols: [], optional: true },
  { name: 'fc_special_events',           requiredCols: [], optional: true },
  { name: 'amazon_inventory_snapshot',   requiredCols: [], optional: true },
  { name: 'overseas_inventory_snapshot', requiredCols: [], optional: true },
  { name: 'factory_stock',               requiredCols: [], optional: true },
  { name: 'warehouses',                  requiredCols: [], optional: true },
  { name: 'purchase_orders',             requiredCols: [], optional: true },
  { name: 'purchase_order_lines',        requiredCols: [], optional: true },
  { name: 'supplier_price_list',         requiredCols: [], optional: true }
];

// small local string helpers (the reused owner helpers carry the numeric coercions).
function aplStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function aplUpper_(v) { return aplStr_(v).toUpperCase(); }
function aplLower_(v) { return aplStr_(v).toLowerCase(); }
function aplNum_(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

function aplBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'aiPlanFirstLayer.get', workspace: 'aiPlanFirstLayer', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// Did any amazon_inventory_snapshot row for this SKU match the site filter? (presence for the site-stock null convention.)
function aplSiteHasMatch_(amzBySku, sku, country, marketplace) {
  var rows = amzBySku[aplUpper_(sku)]; if (!rows || !rows.length) return false;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (country && aplUpper_(r.country) !== aplUpper_(country)) continue;
    if (marketplace && aplLower_(r.marketplace || 'Amazon') !== aplLower_(marketplace)) continue;
    return true;
  }
  return false;
}

// Did any overseas_inventory_snapshot row for this SKU match? (presence for the overseas null convention — same predicate
// as the browser thirdParty / 54_ rivOverseasStock_, without summing.)
function aplOverseasHasMatch_(overseasRows, whById, sku, country) {
  for (var i = 0; i < overseasRows.length; i++) {
    var r = overseasRows[i];
    if (aplUpper_(r.sku) !== aplUpper_(sku)) continue;
    var wh = whById[aplStr_(r.warehouse_id)];
    if (wh) {
      if (country && aplUpper_(wh.country) !== aplUpper_(country)) continue;
      if (RIV_FACTORY_FLAG_[aplLower_(wh.is_factory_warehouse || '')] === 1) continue;
    } else if (country) { continue; }
    return true;
  }
  return false;
}

// Open-PO remaining per SKU (browser `ongoing`): Σ oprLineRemaining_ over OPEN-status POs, adding only >0; null when 0.
function aplOpenPoRemaining_(linesBySku, poById, sku) {
  var lines = linesBySku[aplUpper_(sku)];
  if (!lines || !lines.length) return null;
  var total = 0;
  for (var i = 0; i < lines.length; i++) {
    var po = poById[aplStr_(lines[i].purchase_order_id)];
    var st = aplLower_(po ? (po.order_status || po.status) : '');
    if (OPR_OPEN_STATUS_[st] !== 1) continue;
    var rem = oprLineRemaining_(lines[i]);   // reused from 52_
    if (rem > 0) total += rem;
  }
  return total > 0 ? total : null;   // browser ongoing is null or positive (never 0)
}

// The pure orchestrator: targeted raw tables + planning_cycle -> the AI-Plan first-layer rows (byte-identical to
// `_buildRequestOrderRowsFromDb`), composed from the reused Layer-1 owner functions.
function aplBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var mskus = tables.marketplace_skus || [], skuDetails = tables.sku_details || [];
  var fcRows = tables.fc_regular_forecast || [], eventRows = tables.fc_special_events || [];
  var amzRows = tables.amazon_inventory_snapshot || [], overseasRows = tables.overseas_inventory_snapshot || [];
  var factoryRows = tables.factory_stock || [], whRows = tables.warehouses || [];
  var poRows = tables.purchase_orders || [], poLineRows = tables.purchase_order_lines || [], splRows = tables.supplier_price_list || [];

  var anchor = fcrParseCycle_(payload.planning_cycle);   // reused from 53_ (fail-closed on malformed cycle)
  var windowMonths = fcrWindow_(anchor);
  var windowKeys = {}; for (var w = 0; w < windowMonths.length; w++) windowKeys[windowMonths[w].label] = 1;

  // --- indexes the reused pure functions take (grouping only; no formula) ---
  var detailBySku = {}; for (var d = 0; d < skuDetails.length; d++) { var dk = aplStr_(skuDetails[d].sku); if (dk !== '' && !detailBySku[dk]) detailBySku[dk] = skuDetails[d]; }
  var fcByKey = {}; for (var i = 0; i < fcRows.length; i++) { var fk = aplUpper_(fcRows[i].sku) + '|' + aplUpper_(fcRows[i].country) + '|' + aplLower_(fcRows[i].marketplace); (fcByKey[fk] = fcByKey[fk] || []).push(fcRows[i]); }
  var amzBySku = {}; for (var a = 0; a < amzRows.length; a++) { var ak = aplUpper_(amzRows[a].sku); (amzBySku[ak] = amzBySku[ak] || []).push(amzRows[a]); }
  var whById = {}; for (var wh = 0; wh < whRows.length; wh++) { var wid = aplStr_(whRows[wh].warehouse_id); if (wid !== '') whById[wid] = whRows[wh]; }
  var factoryBySku = {}; for (var f = 0; f < factoryRows.length; f++) { var fak = aplUpper_(factoryRows[f].sku); factoryBySku[fak] = (factoryBySku[fak] || 0) + aplNum_(rivPick_(factoryRows[f], 'fac_current_stock', 'current_stock')); }
  var poById = {}; for (var p = 0; p < poRows.length; p++) { var pid = aplStr_(poRows[p].purchase_order_id); if (pid !== '') poById[pid] = poRows[p]; }
  var linesBySku = {}; for (var l = 0; l < poLineRows.length; l++) { var lk = aplUpper_(poLineRows[l].sku); if (lk === '') continue; (linesBySku[lk] = linesBySku[lk] || []).push(poLineRows[l]); }
  var splBySku = {}; for (var s = 0; s < splRows.length; s++) { var sk = aplUpper_(splRows[s].sku); (splBySku[sk] = splBySku[sk] || []).push(splRows[s]); }

  // F1-7N-FB-3B §F — THE CAUSE OF THE >45-SECOND AI-PLAN READ, and it is algorithmic, not transport.
  // The per-row loop below used to scan TWO WHOLE TABLES for every single SKU row:
  //   · fc_special_events        — one full scan per row, to answer "is there any scoped event?"
  //   · overseas_inventory_snapshot — TWO full scans per row (aplOverseasHasMatch_, then rivOverseasStock_)
  // At the reported live shape that is 495 rows x (E + 2xO) string-uppercasing comparisons — millions of
  // operations, all of them redundant, because BOTH owner predicates require an exact SKU match before they
  // consider a row at all. Pre-indexing by SKU once turns the quadratic term into a linear one.
  //
  // OUTPUT IS UNCHANGED BY CONSTRUCTION, and that is why this is a safe fix rather than a behaviour change:
  //   · rivOverseasStock_ / aplOverseasHasMatch_ both begin with `if (upper(r.sku) !== upper(sku)) continue;`
  //     so a row outside the SKU bucket could never have contributed. Passing the bucket yields the identical
  //     total and the identical matched/unmatched verdict.
  //   · fcrEventScopeMatch_ requires `upper(row.sku) === upper(scope.sku)` OR (scope_type='sku' AND
  //     upper(scope_id) === upper(scope.sku)) — so an event row is only ever relevant to the SKU named by
  //     row.sku or by row.scope_id. Indexing under BOTH keys therefore loses nothing.
  // No owner function is modified, no arithmetic is re-implemented, and no null convention moves. The read
  // TIMEOUT WAS NOT RAISED — a slow read is fixed, not accommodated.
  var overseasBySku = {};
  for (var ov = 0; ov < overseasRows.length; ov++) {
    var ovk = aplUpper_(overseasRows[ov].sku);
    (overseasBySku[ovk] = overseasBySku[ovk] || []).push(overseasRows[ov]);
  }
  var eventsBySku = {};
  for (var ev = 0; ev < eventRows.length; ev++) {
    var evr = eventRows[ev];
    var k1 = aplUpper_(evr.sku);
    if (k1 !== '') (eventsBySku[k1] = eventsBySku[k1] || []).push(evr);
    if (aplLower_(evr.scope_type) === 'sku') {
      var k2 = aplUpper_(evr.scope_id);
      if (k2 !== '' && k2 !== k1) (eventsBySku[k2] = eventsBySku[k2] || []).push(evr);
    }
  }
  var APL_EMPTY_ = [];

  var rows = [];
  for (var mi = 0; mi < mskus.length; mi++) {
    var m = mskus[mi];
    var sku = aplStr_(m.sku), country = aplStr_(m.country), marketplace = aplStr_(m.marketplace), company = aplStr_(m.company);
    var dd = detailBySku[sku] || {};

    // Basic FC (raw): null when no rows for the site key; else the reused N+1..N+3 sum.
    var fcKey = aplUpper_(sku) + '|' + aplUpper_(country) + '|' + aplLower_(marketplace);
    var basicRows = fcByKey[fcKey];
    var basicFcT3 = (basicRows && basicRows.length) ? fcrBasicRawT3_(fcByKey, sku, country, marketplace, windowMonths) : null;

    // Special Event FC (raw): null when no scoped events; else the reused prep-month sum.
    var evScope = { sku: sku, company: company, country: country, marketplace: marketplace };
    var skuEvents = eventsBySku[aplUpper_(sku)] || APL_EMPTY_;   // §F: this SKU's candidates only (see the index note)
    var anyScopedEvent = false;
    for (var e = 0; e < skuEvents.length; e++) { if (fcrEventScopeMatch_(skuEvents[e], evScope)) { anyScopedEvent = true; break; } }
    var specialEventsFc = anyScopedEvent ? fcrSpecialRawQty_(skuEvents, evScope, windowKeys) : null;

    // Site / Overseas (raw): null when no matching row; else the reused aggregation.
    var siteStock = aplSiteHasMatch_(amzBySku, sku, country, marketplace) ? rivSiteStock_(amzBySku, sku, country, marketplace) : null;
    var skuOverseas = overseasBySku[aplUpper_(sku)] || APL_EMPTY_;   // §F: this SKU's candidates only
    var thirdPartyStock = aplOverseasHasMatch_(skuOverseas, whById, sku, country) ? rivOverseasStock_(skuOverseas, whById, sku, country) : null;

    rows.push({
      sku: sku, country: country, marketplace: marketplace, marketplaceId: aplStr_(m.marketplace_id),
      category: aplStr_(dd.category), series: aplStr_(dd.series), company: company,
      basicFcT3: basicFcT3,
      specialEventsFc: specialEventsFc,
      siteStock: siteStock,
      thirdPartyStock: thirdPartyStock,
      factoryStock: factoryBySku[aplUpper_(sku)] || 0,
      totalOngoingOrders: aplOpenPoRemaining_(linesBySku, poById, sku),
      leadTime: ltoLeadTimeForSku_(splBySku, sku),   // reused from 55_ (null | number)
      risk: null, remaining: null, suggestedOrder: null,
      boxSize: aplNum_(dd.units_per_carton),
      _dbPlaceholder: true
    });
  }

  return {
    planningCycle: aplStr_(payload.planning_cycle),
    anchorMonth: anchor.year + '-' + ('0' + (anchor.monthIdx + 1)).slice(-2),
    windowMonths: windowMonths.map(function (mo) { return mo.label; }),
    rows: rows,
    count: rows.length
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function aplRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function aplDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { APL_SEQ_++; return APL_SEQ_; },
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
      return aplRowsToObjects_(sheet);
    }
  };
}

function handleAiPlanFirstLayerGet_(body, io) {
  io = io || aplDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = aplStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  try {
    var payload = (body && body.payload) || {};
    // F1-7N-FB-3B §F — PER-PHASE SERVER INSTRUMENTATION. A single serverDurationMs could not distinguish "the
    // spreadsheet is slow to open", "one table is enormous", "the composition is quadratic" and "the payload is
    // too big to serialize" — so the >45 s read had no nameable cause. Each phase is now timed separately, every
    // table reports its own read cost and row count, and the response's serialized BYTE SIZE is measured. These
    // are diagnostic meta only: not one business value, null convention or row is affected by their presence.
    var phases = [];
    var tOpen = io.now();
    var ss = io.openTarget();
    phases.push({ phase: 'sheet_open', ms: io.now() - tOpen });
    var tRead = io.now(), tables = {}, readCount = 0, perTable = [];
    for (var i = 0; i < APL_TABLES_.length; i++) {
      var spec = APL_TABLES_[i], tT = io.now();
      tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true);
      perTable.push({ table: spec.name, rows: (tables[spec.name] || []).length, ms: io.now() - tT });
      readCount++;
    }
    phases.push({ phase: 'header_resolution_and_row_read', ms: io.now() - tRead, tables: perTable });
    var tMap = io.now();
    var vm = aplBuild_(tables, payload);
    phases.push({ phase: 'current_run_filtering_and_mapping', ms: io.now() - tMap, rows_out: (vm && vm.rows ? vm.rows.length : 0) });
    var tSer = io.now();
    var bytes = 0;
    try { bytes = JSON.stringify(vm).length; } catch (eS) { bytes = -1; }
    phases.push({ phase: 'serialization', ms: io.now() - tSer, response_bytes: bytes });
    return aplBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount,
      phases: phases, response_bytes: bytes });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'AI_PLAN_FIRST_LAYER_BUILD_FAILED';
    return aplBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
