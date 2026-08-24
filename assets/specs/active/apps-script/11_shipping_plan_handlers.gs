// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 11_shipping_plan_handlers.gs — Weekly Shipping Plan (Decision Layer) writes
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements docs/planning/WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md (Draft v1.2)
//   - createShippingPlansBatch : Submit Plan → shipping_plans + shipping_plan_lines
//   - updateShippingPlanStatus : draft/pending_approval/approved/rejected/cancelled flow
//   - updateShippingPlanLineQty: edit approved_qty/carton_qty (Draft only)
// Tables live in the OPERATION DB spreadsheet (getActiveSpreadsheet). If a tab is
// missing it is created with the documented header row (the two NEW Decision-Layer
// tables only — no existing table/field is altered).
// ============================================================

// CANONICAL shipping_plans header (2026-07-28 DB sync). Weekly Plan = rough-quote layer: it snapshots the
// chosen carrier_id + carrier_unit_rate + carrier_rate_type + import_duty_treatment (NO rate_card_id / Route /
// Lead Time — those are resolved later at Shipment Draft). Warehouse endpoints: ship_from / destination
// (human-readable snapshots) + source_warehouse_id / destination_warehouse_id (authoritative ids) +
// ship_from_type / destination_type. NO origin_warehouse_id / origin_type. All reads/writes are by header NAME.
var SHIPPING_PLANS_HEADERS_ = [
  'shipping_plan_id', 'parent_shipping_plan_id', 'shipping_plan_no', 'plan_name',
  'company', 'country', 'marketplace',
  'ship_from', 'source_warehouse_id', 'ship_from_type',
  'destination', 'destination_warehouse_id', 'destination_type',
  'shipping_method', 'last_mile_delivery', 'customs_type',
  'carrier_id', 'carrier_unit_rate', 'carrier_rate_type', 'import_duty_treatment',
  'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'currency',
  'status', 'submit_batch_id', 'batch_status', 'plan_version',
  'created_by', 'created_at', 'cancelled_by', 'cancelled_at', 'submitted_by', 'submitted_at',
  'approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'rejected_reason', 'rejected_comment',
  'completed_by', 'completed_at', 'note', 'source', 'updated_at', 'updated_by',
  'transferred_to_shipment_at', 'transferred_shipment_id'
];

// CANONICAL shipping_plan_lines header (2026-07-28 DB sync). NEW: site_sku + marketplace (each line keeps its
// real Marketplace + site SKU — a Combined Plan NEVER merges Marketplace lines in the DB) + the avg-sales
// provenance snapshots. The retained snapshot_* Decision-Snapshot columns (current_stock / avg_sales_per_day /
// days_of_supply / suggested_qty / target_days / fc_context / event_context) are STILL WRITTEN and copied into
// the shipment Execution Snapshot — kept (additive) per the no-delete rule; NOT canonical-minimal but in use.
var SHIPPING_PLAN_LINES_HEADERS_ = [
  'shipping_plan_line_id', 'shipping_plan_id', 'sku', 'site_sku', 'marketplace',
  // plan_carton_qty = CANONICAL renamed column (was carton_qty; legacy read-fallback only).
  'requested_qty', 'approved_qty', 'plan_carton_qty', 'units_per_carton',
  // Logistics Decision Snapshot (computed from sku_details carton dims/weights at Submit Plan / Save).
  'carton_cbm', 'cbm', 'gross_weight', 'net_weight',
  // Avg-sales provenance snapshots (canonical).
  'snapshot_avg_sales_source', 'snapshot_normal_days_count', 'snapshot_excluded_event_days_count', 'snapshot_avg_sales_warning',
  'source_page', 'source_reason', 'inventory_snapshot_date', 'note', 'created_at', 'updated_at',
  // Retained in-use Decision Snapshot columns (additive; copied to shipment Execution Snapshot).
  'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply',
  'snapshot_suggested_qty', 'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context'
];

// ---- helpers ------------------------------------------------------

function shippingPlanTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function shippingPlanToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Get (or create with the documented header row) a Decision-Layer tab in the operation DB. */
// Production Safety Round S0.5 (RULE S0-2/S0-5): VALIDATE-ONLY (no auto-create / no Header write). Delegates to the
// shared safety adapter (29_); create is migration-only (prodMigrateCreateSheet_), unreachable from Runtime.
function shippingPlanEnsureSheet_(ss, name, headers) {
  return prodRequireSheet_(ss, name, headers);
}

/**
 * Production Safety Round S0.5 (RULE S0-2): shared VALIDATE-ONLY column guard (single global scope). Normal Runtime
 * no longer appends missing Header columns — any missing REQUIRED column fails closed (MISSING_REQUIRED_HEADER) with
 * ZERO mutation. Additive column migration is migration-only (prodMigrateAppendColumns_ in 29_), never on a write.
 */
function sheetEnsureColumns_(sheet, names) {
  return prodRequireColumns_(sheet, names);
}

/** Append a row to a sheet using its existing header row (writes only known columns). */
function shippingPlanAppendByHeader_(sheet, obj) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var row = new Array(headers.length).fill('');
  for (var i = 0; i < headers.length; i++) {
    if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) {
      row[i] = obj[headers[i]];
    }
  }
  sheet.appendRow(row);
}

/** sku -> units_per_carton from sku_details (0 when unavailable). */
function shippingPlanUpcMap_(ss) {
  var map = {};
  var sh = ss.getSheetByName('sku_details');
  if (!sh) return map;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return map;
  var headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var skuCol = headers.indexOf('sku');
  var upcCol = headers.indexOf('units_per_carton');
  if (skuCol === -1) return map;
  for (var i = 1; i < data.length; i++) {
    var s = String(data[i][skuCol] || '').trim();
    if (s) map[s] = upcCol !== -1 ? (parseFloat(data[i][upcCol]) || 0) : 0;
  }
  return map;
}

function shippingPlanNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

function shippingPlanRound_(v, d) { var f = Math.pow(10, d); return Math.round((parseFloat(v) || 0) * f) / f; }

/**
 * sku -> logistics record from sku_details:
 *   { cartonL, cartonW, cartonH, cartonDimUnit, cartonWeight, itemWeight, upc }
 * Used to compute the shipping_plan_lines logistics snapshot (cbm / gross_weight / net_weight).
 */
function shippingPlanSkuLogisticsMap_(ss) {
  var map = {};
  var sh = ss.getSheetByName('sku_details');
  if (!sh) return map;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return map;
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  function ix(n) { return h.indexOf(n); }
  var cSku = ix('sku');
  if (cSku === -1) return map;
  var cL = ix('carton_length'), cW = ix('carton_width'), cH = ix('carton_height'),
      cDU = ix('carton_dimension_unit'), cWt = ix('carton_weight'), iWt = ix('item_weight'), cUpc = ix('units_per_carton');
  for (var i = 1; i < data.length; i++) {
    var s = String(data[i][cSku] || '').trim();
    if (!s) continue;
    map[s] = {
      cartonL: cL === -1 ? 0 : (parseFloat(data[i][cL]) || 0),
      cartonW: cW === -1 ? 0 : (parseFloat(data[i][cW]) || 0),
      cartonH: cH === -1 ? 0 : (parseFloat(data[i][cH]) || 0),
      cartonDimUnit: cDU === -1 ? '' : String(data[i][cDU] || '').trim().toLowerCase(),
      cartonWeight: cWt === -1 ? 0 : (parseFloat(data[i][cWt]) || 0),
      itemWeight: iWt === -1 ? 0 : (parseFloat(data[i][iWt]) || 0),
      upc: cUpc === -1 ? 0 : (parseFloat(data[i][cUpc]) || 0)
    };
  }
  return map;
}

/**
 * Logistics snapshot for one line (WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §5.4; SKU_DETAILS_LOGISTICS_SPEC §4):
 *   carton_cbm = L*W*H/1,000,000  (cm only; other units deferred → 0)
 *   cbm        = carton_qty * carton_cbm
 *   gross_weight = carton_qty * carton_weight
 *   net_weight   = approved_qty * item_weight
 * Returns blanks when no sku_details logistics row exists (never fabricates).
 */
function shippingPlanLineLogistics_(logi, approvedQty, cartonQty) {
  if (!logi) return { carton_cbm: '', cbm: '', gross_weight: '', net_weight: '' };
  var unit = logi.cartonDimUnit || 'cm';
  var cartonCbm = (unit === 'cm' || unit === '') ? (logi.cartonL * logi.cartonW * logi.cartonH) / 1000000 : 0;
  cartonCbm = shippingPlanRound_(cartonCbm, 6);
  return {
    carton_cbm: cartonCbm,
    cbm: shippingPlanRound_(cartonQty * cartonCbm, 4),
    gross_weight: shippingPlanRound_(cartonQty * (logi.cartonWeight || 0), 3),
    net_weight: shippingPlanRound_(approvedQty * (logi.itemWeight || 0), 3)
  };
}

/**
 * Company resolution maps for shipping_plans.company (WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §3.3).
 * Source priority is applied by the caller: marketplaces (country+marketplace) →
 * marketplace_skus (country+marketplace+sku) → payload company → blank (with warning).
 * Returns { bySku: { 'country||marketplace||sku': company }, byMarket: { 'country||marketplace': company } }.
 */
function shippingPlanCompanyMaps_(ss) {
  var bySku = {}, byMarket = {};
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  var mpSku = ss.getSheetByName('marketplace_skus');
  if (mpSku) {
    var d = mpSku.getDataRange().getValues();
    if (d.length >= 2) {
      var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
      var cCol = h.indexOf('company'), coCol = h.indexOf('country'), mCol = h.indexOf('marketplace'), sCol = h.indexOf('sku');
      if (cCol !== -1 && coCol !== -1 && mCol !== -1 && sCol !== -1) {
        for (var i = 1; i < d.length; i++) {
          var comp = String(d[i][cCol] || '').trim();
          if (!comp) continue;
          bySku[lc(d[i][coCol]) + '||' + lc(d[i][mCol]) + '||' + lc(d[i][sCol])] = comp;
        }
      }
    }
  }

  var mp = ss.getSheetByName('marketplaces');
  if (mp) {
    var d2 = mp.getDataRange().getValues();
    if (d2.length >= 2) {
      var h2 = d2[0].map(function (x) { return String(x).trim().toLowerCase(); });
      var cCol2 = h2.indexOf('company'), coCol2 = h2.indexOf('country'), mCol2 = h2.indexOf('marketplace');
      if (cCol2 !== -1 && coCol2 !== -1 && mCol2 !== -1) {
        for (var k = 1; k < d2.length; k++) {
          var comp2 = String(d2[k][cCol2] || '').trim();
          if (!comp2) continue;
          var key2 = lc(d2[k][coCol2]) + '||' + lc(d2[k][mCol2]);
          if (!byMarket[key2]) byMarket[key2] = comp2;
        }
      }
    }
  }
  return { bySku: bySku, byMarket: byMarket };
}

/** country||marketplace||sku -> site_sku from marketplace_skus (blank when unavailable). */
function shippingPlanSiteSkuMap_(ss) {
  var map = {};
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  var sh = ss.getSheetByName('marketplace_skus');
  if (!sh) return map;
  var d = sh.getDataRange().getValues();
  if (d.length < 2) return map;
  var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cCo = h.indexOf('country'), cMk = h.indexOf('marketplace'), cSku = h.indexOf('sku'), cSite = h.indexOf('site_sku');
  if (cSku === -1 || cSite === -1) return map;
  for (var i = 1; i < d.length; i++) {
    var site = String(d[i][cSite] || '').trim();
    if (!site) continue;
    var key = (cCo === -1 ? '' : lc(d[i][cCo])) + '||' + (cMk === -1 ? '' : lc(d[i][cMk])) + '||' + lc(d[i][cSku]);
    if (!map[key]) map[key] = site;
  }
  return map;
}

/** Resolve a line's company per spec §3.3 priority (marketplaces → marketplace_skus → payload → blank). */
function shippingPlanResolveCompany_(maps, country, marketplace, sku, payloadCompany) {
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  var pc = String(payloadCompany == null ? '' : payloadCompany).trim();
  if (pc === '--') pc = '';
  // 1) marketplaces by country+marketplace (PRIMARY — company is marketplace-level ownership)
  var m = maps.byMarket[lc(country) + '||' + lc(marketplace)];
  if (m) return m;
  // 2) marketplace_skus by country+marketplace+sku (fallback)
  var s = maps.bySku[lc(country) + '||' + lc(marketplace) + '||' + lc(sku)];
  if (s) return s;
  // 3) payload company if already resolved by the frontend
  if (pc) return pc;
  // 4) blank — log a warning so the unresolved gap is visible
  Logger.log('[createShippingPlansBatch] company unresolved for country=' + country + ' marketplace=' + marketplace + ' sku=' + sku);
  return '';
}

// ---- R6E1 idempotency + canonical snapshot helpers (PURE where possible) ------------------------------------

/**
 * F1-7N-FA-3C-R6E1-R1 — canonical snapshot serialization. A context field (snapshot_fc_context /
 * snapshot_event_context) may arrive as an object/array; a raw appendRow would coerce it to the useless
 * "[object Object]". Serialize objects/arrays as canonical JSON; pass primitives through unchanged; null/undefined
 * → ''. NEVER emits "[object Object]".
 */
function shippingPlanSnapshotValue_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return ''; } }
  return v;
}

// F1-7N-FA-3C-R6E1A — COMPLETE canonical payload fingerprint. The R6E1 signature ([country|ship_from|destination|
// method|marketplace|sku|requested_qty]) was too narrow to prove semantic equivalence (a changed carrier / last-mile /
// customs / cost / note / snapshot would have compared EQUAL). The fingerprint below covers every persisted user/
// business field on BOTH the header and each line — but EXCLUDES server-generated identity/audit fields
// (shipping_plan_id, shipping_plan_line_id, created_at/updated_at, created_by/updated_by, submission timestamps,
// status/plan_version/batch fields). It is computed identically from (a) the server-DERIVED would-be batch on the
// incoming side (company already resolved, quote/logistics/carton already computed — the SAME objects that get
// written) and (b) the persisted rows on the existing side, so a true retry hashes equal while any material change
// diverges. Canonical JSON (fixed key order + sorted lines/headers), typed canonicalization (numbers coerced so
// 400 === "400"; blank/null unified to null; objects already serialized to JSON strings by shippingPlanSnapshotValue_),
// then an FNV-1a hash prefixed with a version tag. Deterministic — no clock / no uuid.
var SHIPPING_PLAN_FINGERPRINT_VERSION_ = 'spfp-1';
var SP_HDR_FP_STR_ = ['company', 'country', 'marketplace', 'ship_from', 'source_warehouse_id', 'ship_from_type',
  'destination', 'destination_warehouse_id', 'destination_type', 'shipping_method', 'last_mile_delivery', 'customs_type',
  'carrier_id', 'carrier_rate_type', 'import_duty_treatment', 'currency', 'plan_name', 'note', 'source'];
var SP_HDR_FP_NUM_ = ['carrier_unit_rate', 'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost'];
var SP_LINE_FP_STR_ = ['sku', 'site_sku', 'marketplace', 'source_page', 'source_reason', 'inventory_snapshot_date', 'note',
  'snapshot_avg_sales_source', 'snapshot_avg_sales_warning', 'snapshot_fc_context', 'snapshot_event_context'];
var SP_LINE_FP_NUM_ = ['requested_qty', 'approved_qty', 'plan_carton_qty', 'units_per_carton', 'carton_cbm', 'cbm',
  'gross_weight', 'net_weight', 'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply',
  'snapshot_suggested_qty', 'snapshot_target_days', 'snapshot_normal_days_count', 'snapshot_excluded_event_days_count'];

function shippingPlanFpStr_(v) { if (v === undefined || v === null) return null; var s = String(v).trim(); return s === '' ? null : s; }
function shippingPlanFpNum_(v) { if (v === undefined || v === null || String(v).trim() === '') return null; var n = Number(v); return isFinite(n) ? n : String(v).trim(); }
function shippingPlanFnv_(s) { var h = 0x811c9dc5; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
function shippingPlanHdrSortKey_(h) { return [h.company, h.country, h.ship_from, h.destination, h.shipping_method, h.marketplace].map(function (x) { return x == null ? '' : String(x); }).join(''); }
function shippingPlanLineSortKey_(l) { return [l.sku, l.site_sku, l.marketplace, l.requested_qty].map(function (x) { return x == null ? '' : String(x); }).join(''); }

// PURE projector: flat plan/line row objects → canonical, sorted, fixed-key-order structure (ids/audit excluded).
function shippingPlanProjectBatch_(planObjs, lineObjs) {
  var linesByPlan = {};
  (lineObjs || []).forEach(function (l) { var pid = String(l.shipping_plan_id || '').trim(); (linesByPlan[pid] = linesByPlan[pid] || []).push(l); });
  var headers = (planObjs || []).map(function (p) {
    var h = {}; SP_HDR_FP_STR_.forEach(function (f) { h[f] = shippingPlanFpStr_(p[f]); }); SP_HDR_FP_NUM_.forEach(function (f) { h[f] = shippingPlanFpNum_(p[f]); });
    var pid = String(p.shipping_plan_id || '').trim();
    var ls = (linesByPlan[pid] || []).map(function (l) { var o = {}; SP_LINE_FP_STR_.forEach(function (f) { o[f] = shippingPlanFpStr_(l[f]); }); SP_LINE_FP_NUM_.forEach(function (f) { o[f] = shippingPlanFpNum_(l[f]); }); return o; });
    ls.sort(function (a, b) { var ka = shippingPlanLineSortKey_(a), kb = shippingPlanLineSortKey_(b); return ka < kb ? -1 : (ka > kb ? 1 : 0); });
    return { header: h, lines: ls };
  });
  headers.sort(function (a, b) { var ka = shippingPlanHdrSortKey_(a.header), kb = shippingPlanHdrSortKey_(b.header); return ka < kb ? -1 : (ka > kb ? 1 : 0); });
  return headers;
}
function shippingPlanCanonicalFingerprint_(planObjs, lineObjs) {
  return SHIPPING_PLAN_FINGERPRINT_VERSION_ + ':' + shippingPlanFnv_(JSON.stringify(shippingPlanProjectBatch_(planObjs, lineObjs)));
}
// A persisted line row can be completely fingerprinted only if it carries every canonical fingerprint field as an own
// key. A pre-migration (23-col) row LACKS marketplace + the 7 snapshot columns → not completely comparable.
function shippingPlanLinesSchemaComplete_(lineObjs) {
  if (!lineObjs || !lineObjs.length) return true;
  var req = SP_LINE_FP_STR_.concat(SP_LINE_FP_NUM_);
  for (var i = 0; i < lineObjs.length; i++) { for (var k = 0; k < req.length; k++) { if (!Object.prototype.hasOwnProperty.call(lineObjs[i], req[k])) return false; } }
  return true;
}

/**
 * F1-7N-FA-3C-R6E1A — PURE find-or-reuse classifier over already-read plan/line row objects for one execution key.
 * Returns { state, planIds[], lineCount, fingerprint }. States:
 *   CREATE               — no plan header carries this key → proceed to create exactly one batch.
 *   DUPLICATE_CONFLICT   — two headers under the key share a route group (a corrupt double-write; the lock+reuse
 *                          normally prevents this) → fail closed, do not reconstruct.
 *   COMMITTED_UNVERIFIED — header(s) exist but zero lines while the payload has lines → no blind retry.
 *   RECONCILIATION_REQUIRED — persisted lines are schema-incomplete (e.g. pre-migration rows lacking canonical fields)
 *                          so a COMPLETE fingerprint cannot be computed → never a false REUSE.
 *   REUSED               — complete persisted fingerprint EQUALS the incoming canonical fingerprint → zero writes.
 *   CONFLICT             — complete fingerprint DIFFERS (any material header/line change) → SUBMIT_EXECUTION_DUPLICATE_CONFLICT.
 * Deterministic; reads nothing (arrays passed in).
 */
function shippingPlanClassifyBatch_(persistedPlans, persistedLines, batchId, incomingFingerprint, incomingLineCount) {
  var key = String(batchId || '').trim();
  var plansForKey = [], planIdSet = {};
  (persistedPlans || []).forEach(function (p) { if (String(p.submit_batch_id || '').trim() === key) { plansForKey.push(p); var id = String(p.shipping_plan_id || '').trim(); if (id) planIdSet[id] = 1; } });
  var planIds = Object.keys(planIdSet);
  if (!plansForKey.length) return { state: 'CREATE', planIds: [], lineCount: 0, fingerprint: '' };
  var routes = {}, dupRoute = false;
  plansForKey.forEach(function (p) { var r = [p.company, p.country, p.ship_from, p.destination, p.shipping_method].map(function (x) { return String(x == null ? '' : x).trim().toLowerCase(); }).join('||'); if (routes[r]) dupRoute = true; routes[r] = 1; });
  if (dupRoute) return { state: 'DUPLICATE_CONFLICT', planIds: planIds, lineCount: 0, fingerprint: '' };
  var linesForKey = (persistedLines || []).filter(function (l) { return planIdSet[String(l.shipping_plan_id || '').trim()]; });
  if (linesForKey.length === 0 && incomingLineCount > 0) return { state: 'COMMITTED_UNVERIFIED', planIds: planIds, lineCount: 0, fingerprint: '' };
  if (!shippingPlanLinesSchemaComplete_(linesForKey)) return { state: 'RECONCILIATION_REQUIRED', planIds: planIds, lineCount: linesForKey.length, fingerprint: '' };
  var fp = shippingPlanCanonicalFingerprint_(plansForKey, linesForKey);
  if (fp === incomingFingerprint) return { state: 'REUSED', planIds: planIds, lineCount: linesForKey.length, fingerprint: fp };
  return { state: 'CONFLICT', planIds: planIds, lineCount: linesForKey.length, fingerprint: fp };
}

/** Read a sheet's rows as header-keyed objects (values only; no mutation). Used by the idempotency find. */
function shippingPlanReadObjects_(sheet) {
  var out = [];
  if (!sheet) return out;
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return out;
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  for (var r = 1; r < values.length; r++) {
    var o = {};
    for (var c = 0; c < headers.length; c++) o[headers[c]] = values[r][c];
    out.push(o);
  }
  return out;
}

// ---- createShippingPlansBatch -------------------------------------

/**
 * Submit Plan write. Groups lines by the ROUTE key (company + country + ship_from + destination +
 * shipping_method) — Marketplace is NOT part of the key, so one plan can COMBINE several Marketplaces
 * (Combined Plan). Header marketplace is DERIVED from the plan's lines: one distinct → the actual
 * Marketplace; two or more distinct → `MULTI` (a header scope marker, not a real Marketplace). Each line
 * keeps its own real marketplace + site_sku (Marketplace lines are NEVER merged in the DB). All plans in
 * this call share one submit_batch_id. Creates shipping_plans (status=draft, plan_version=1, parent=self,
 * batch_status=open) + shipping_plan_lines. Carrier/cost snapshot is written only when a carrier is chosen
 * (rough estimate); otherwise carrier + estimated_* stay blank (Not Applied — never 0).
 */
// F1-7N-FA-4B — DEPRECATED COMPATIBILITY WRAPPER. `createShippingPlansBatch` is no longer an independent writer: it
// must not trust frontend-authored lines nor write through its old path. The ONE canonical Submit authority is
// `handleSubmitAllocationDraftsToShippingPlans_` (16_), which re-reads the persisted allocation drafts server-side.
// This wrapper delegates when the caller supplies `allocation_draft_ids`; the legacy frontend-`lines[]` shape is refused
// (zero write) with a typed deprecation directing callers to the canonical action. Old API name kept for staged cutover;
// remove after controlled live validation. See docs/planning/TWO_MAIN_FLOWS_CONNECTIVITY_AUDIT_F1-7N-FA-4A.md.
function handleCreateShippingPlansBatch_(body) {
  body = body || {};
  var draftIds = body.allocation_draft_ids || body.draft_ids || null;
  if (draftIds && draftIds.length) {
    // canonical server-owned path (one authority; re-reads drafts). Delegate verbatim.
    return handleSubmitAllocationDraftsToShippingPlans_(body);
  }
  // legacy frontend-authored `lines[]` path — no longer an independent writer.
  return jsonResponse_({ success: false, error: 'SUBMIT_ROUTE_DEPRECATED — createShippingPlansBatch no longer accepts frontend-authored lines. Persist the allocation draft, then call submitAllocationDraftsToShippingPlans with allocation_draft_ids.',
    code: 'SUBMIT_ROUTE_DEPRECATED', deprecated: true, canonical_action: 'submitAllocationDraftsToShippingPlans', stage: 'deprecated', zero_write: true });
}

// F1-7N-FA-4B — the SINGLE shipping_plans mutation authority (no lock here; the caller holds the ScriptLock). Takes an
// already-derived normalized `lines[]` (each: sku/company/country/marketplace/ship_from/destination/shipping_method/
// warehouses/requested_qty/units_per_carton/site_sku/snapshot_*/source_page/source_reason/lineage) — it does NOT know
// or care whether the lines came from the server re-read of drafts; the ONLY live caller is the canonical draft submit.
// Groups by route, derives header/line objects, computes the canonical fingerprint, classifies idempotency, and writes.
// Returns a PLAIN result object (never a ContentService payload) so both public entrypoints can wrap it uniformly.
//   ctx = { source, createdBy, providedKey }
function shippingPlanCommitFromLines_(ss, lines, ctx) {
  lines = lines || [];
  ctx = ctx || {};
  if (!lines.length) return { success: false, error: 'No lines provided', stage: 'input', zero_write: true };
  var source = String(ctx.source || 'inventory_replenishment_submit_plan').trim();
  var createdBy = String(ctx.createdBy || 'inventory_replenishment').trim();
  // stable execution key (idempotency): same key + identical canonical fingerprint → REUSED (zero write); differ → CONFLICT.
  var providedKey = String(ctx.providedKey || '').trim();
  {
  // shipping_plans: strict ORDERED canonical gate (its 49-col live schema is order-valid).
  var planSheet = shippingPlanEnsureSheet_(ss, 'shipping_plans', SHIPPING_PLANS_HEADERS_);
  // shipping_plan_lines: PRESENCE-based gate (order-tolerant) — mirrors the READ owners (40_/60_) and is safe because
  // shippingPlanAppendByHeader_ writes by header NAME, not position. The R6E1 additive migration appends the 8 missing
  // canonical columns at the right edge (keeping the legacy `marketplace_seperate` as a tolerated extra); a strict
  // ORDERED gate would still reject that as HEADER_ORDER_MISMATCH even though every canonical column is present. This
  // still FAILS CLOSED (MISSING_REQUIRED_HEADER) on any genuinely missing canonical column — so it stays blocked on the
  // current live 23-col sheet until the USER-owned migration runs. No new permissiveness beyond the READ contract.
  var lineSheet = prodRequireSheet_(ss, 'shipping_plan_lines', []);
  prodRequireColumns_(lineSheet, SHIPPING_PLAN_LINES_HEADERS_);
  // Additive migration for the CANONICAL columns on shipping_plans tabs that predate them (validate-only in Runtime).
  sheetEnsureColumns_(planSheet, ['parent_shipping_plan_id', 'source_warehouse_id', 'ship_from_type',
    'destination_warehouse_id', 'destination_type', 'last_mile_delivery',
    'customs_type', 'carrier_id', 'carrier_unit_rate', 'carrier_rate_type',
    'import_duty_treatment', 'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee',
    'estimated_total_cost', 'currency', 'rejected_comment']);

  var upcMap = shippingPlanUpcMap_(ss);
  var companyMaps = shippingPlanCompanyMaps_(ss);
  var logisticsMap = shippingPlanSkuLogisticsMap_(ss);
  var siteSkuMap = shippingPlanSiteSkuMap_(ss);

  var now = shippingPlanTimestamp_();
  var today = shippingPlanToday_();
  var submitBatchId = providedKey || ('SB-' + Utilities.getUuid().substring(0, 12));

  // Group by the ROUTE key (company + country + ship_from + destination + shipping_method) — NOT marketplace.
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  var groups = {};
  var order = [];
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i] || {};
    var country = String(ln.country || '').trim();
    var marketplace = String(ln.marketplace || '').trim();
    var shipFrom = String(ln.ship_from || '').trim();
    var destination = String(ln.destination || '').trim();
    var method = String(ln.shipping_method || '').trim();
    var sku = String(ln.sku || '').trim();
    if (!sku) continue;
    // Resolve company from marketplace context (never leave it blank when a source exists).
    var company = shippingPlanResolveCompany_(companyMaps, country, marketplace, sku, ln.company);
    var key = [company, country, shipFrom, destination, method].join('||');
    if (!groups[key]) {
      groups[key] = { meta: {
        company: company, country: country, ship_from: shipFrom, destination: destination, shipping_method: method,
        source_warehouse_id: String(ln.source_warehouse_id || '').trim(),
        ship_from_type: String(ln.ship_from_type || '').trim(),
        destination_warehouse_id: String(ln.destination_warehouse_id || '').trim(),
        destination_type: String(ln.destination_type || '').trim(),
        last_mile_delivery: String(ln.last_mile_delivery || '').trim(),
        carrier_id: String(ln.carrier_id || '').trim(),
        customs_type: String(ln.customs_type || '').trim()
      }, lines: [] };
      order.push(key);
    }
    groups[key].lines.push(ln);
  }

  // ---- BUILD the derived batch (company already resolved; quote/logistics/carton computed) WITHOUT writing. The exact
  // objects below are what get appended; the incoming canonical fingerprint is computed from them, so a true retry
  // (identical payload → identical derived objects) hashes equal → REUSED, while any material change diverges.
  var derivedHeaderObjs = [], derivedLineObjs = [], created = [], totalLines = 0;

  for (var g = 0; g < order.length; g++) {
    var grp = groups[order[g]];
    var meta = grp.meta;
    var planId = 'SP-' + Utilities.getUuid().substring(0, 10).toUpperCase();
    var planNo = 'WSP-' + today.replace(/-/g, '') + '-' + (g + 1);

    // Header marketplace: one distinct line marketplace → actual; two or more → MULTI (scope marker).
    var mkSet = {};
    grp.lines.forEach(function (l) { var m = String(l.marketplace || '').trim(); if (m) mkSet[m] = 1; });
    var distinctMk = Object.keys(mkSet);
    var headerMarketplace = distinctMk.length === 1 ? distinctMk[0] : (distinctMk.length >= 2 ? 'MULTI' : '');
    var planName = [meta.company, meta.country, (headerMarketplace || ''), meta.shipping_method, today].filter(String).join(' / ');

    // Rough carrier/cost snapshot (only when a carrier is chosen for this route). Never throws.
    var quote = shippingPlanRoughQuote_(ss, meta, grp.lines, today);

    derivedHeaderObjs.push({
      shipping_plan_id: planId,
      parent_shipping_plan_id: planId, // MVP: parent = self
      shipping_plan_no: planNo,
      plan_name: planName,
      company: meta.company,
      country: meta.country,
      marketplace: headerMarketplace,
      ship_from: meta.ship_from,
      source_warehouse_id: meta.source_warehouse_id,
      ship_from_type: meta.ship_from_type,
      destination: meta.destination,
      destination_warehouse_id: meta.destination_warehouse_id,
      destination_type: meta.destination_type,
      shipping_method: meta.shipping_method,
      last_mile_delivery: meta.last_mile_delivery,
      customs_type: quote.customs_type,
      carrier_id: quote.carrier_id,
      carrier_unit_rate: quote.carrier_unit_rate,
      carrier_rate_type: quote.carrier_rate_type,
      import_duty_treatment: quote.import_duty_treatment,
      estimated_freight_cost: quote.estimated_freight_cost,
      estimated_duty: quote.estimated_duty,
      estimated_customs_fee: quote.estimated_customs_fee,
      estimated_total_cost: quote.estimated_total_cost,
      currency: quote.currency,
      status: 'draft',
      submit_batch_id: submitBatchId,
      batch_status: 'open',
      plan_version: 1,
      created_by: createdBy,
      created_at: now,
      note: '',
      source: source,
      updated_by: createdBy,
      updated_at: now
    });

    for (var j = 0; j < grp.lines.length; j++) {
      var l = grp.lines[j];
      var sku2 = String(l.sku || '').trim();
      var lineMk = String(l.marketplace || '').trim();
      var requested = shippingPlanNum_(l.requested_qty);
      var upc = shippingPlanNum_(l.units_per_carton) || upcMap[sku2] || 0;
      var approved = requested;
      var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
      var logi = shippingPlanLineLogistics_(logisticsMap[sku2], approved, carton);
      var siteSku = String(l.site_sku || '').trim() || siteSkuMap[lc(l.country) + '||' + lc(lineMk) + '||' + lc(sku2)] || '';

      derivedLineObjs.push({
        shipping_plan_line_id: 'SPL-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
        shipping_plan_id: planId,
        sku: sku2,
        site_sku: siteSku,
        marketplace: lineMk,   // the line's REAL marketplace (never MULTI)
        requested_qty: requested,
        approved_qty: approved,
        plan_carton_qty: carton,
        units_per_carton: upc,
        carton_cbm: logi.carton_cbm,
        cbm: logi.cbm,
        gross_weight: logi.gross_weight,
        net_weight: logi.net_weight,
        snapshot_avg_sales_source: String(l.snapshot_avg_sales_source || '').trim(),
        snapshot_normal_days_count: (l.snapshot_normal_days_count === '' || l.snapshot_normal_days_count == null) ? '' : l.snapshot_normal_days_count,
        snapshot_excluded_event_days_count: (l.snapshot_excluded_event_days_count === '' || l.snapshot_excluded_event_days_count == null) ? '' : l.snapshot_excluded_event_days_count,
        snapshot_avg_sales_warning: String(l.snapshot_avg_sales_warning || '').trim(),
        source_page: String(l.source_page || 'inventory_replenishment').trim(),
        source_reason: String(l.source_reason || 'manual_submit').trim(),
        inventory_snapshot_date: String(l.inventory_snapshot_date || '').trim(),
        note: '',
        created_at: now,
        updated_at: now,
        snapshot_current_stock: shippingPlanNum_(l.snapshot_current_stock),
        snapshot_avg_sales_per_day: shippingPlanNum_(l.snapshot_avg_sales_per_day),
        snapshot_days_of_supply: (l.snapshot_days_of_supply === '' || l.snapshot_days_of_supply == null) ? '' : l.snapshot_days_of_supply,
        snapshot_suggested_qty: shippingPlanNum_(l.snapshot_suggested_qty),
        snapshot_target_days: shippingPlanNum_(l.snapshot_target_days),
        // R6E1 (F): canonical serialization — an object/array context becomes canonical JSON, never "[object Object]".
        snapshot_fc_context: shippingPlanSnapshotValue_(l.snapshot_fc_context),
        snapshot_event_context: shippingPlanSnapshotValue_(l.snapshot_event_context)
      });
      totalLines++;
    }

    created.push({ shipping_plan_id: planId, shipping_plan_no: planNo, marketplace: headerMarketplace, shipping_method: meta.shipping_method, line_count: grp.lines.length });
  }

  // COMPLETE canonical payload fingerprint over the derived (would-be-persisted) batch.
  var incomingFingerprint = shippingPlanCanonicalFingerprint_(derivedHeaderObjs, derivedLineObjs);

  // Idempotency find-or-reuse (only when a stable execution key was provided) — re-read INSIDE the lock, compare the
  // COMPLETE fingerprint. Never reconstruct an incomplete/legacy persisted payload and call it equivalent.
  if (providedKey) {
    var existingPlans = shippingPlanReadObjects_(planSheet);
    var existingLines = shippingPlanReadObjects_(lineSheet);
    var cls = shippingPlanClassifyBatch_(existingPlans, existingLines, providedKey, incomingFingerprint, totalLines);
    if (cls.state === 'REUSED') {
      return { success: true, data: { submit_batch_id: providedKey, outcome: 'REUSED', reused: true,
        fingerprint: cls.fingerprint, fingerprint_version: SHIPPING_PLAN_FINGERPRINT_VERSION_,
        plan_count: cls.planIds.length, line_count: cls.lineCount, plans: cls.planIds } };
    }
    if (cls.state === 'CONFLICT') {
      return { success: false, error: 'SUBMIT_EXECUTION_DUPLICATE_CONFLICT', code: 'SUBMIT_EXECUTION_DUPLICATE_CONFLICT',
        stage: 'idempotency', zero_write: true, data: { submit_batch_id: providedKey, fingerprint_version: SHIPPING_PLAN_FINGERPRINT_VERSION_,
        incoming_fingerprint: incomingFingerprint, existing_fingerprint: cls.fingerprint, existing_plan_count: cls.planIds.length } };
    }
    if (cls.state === 'DUPLICATE_CONFLICT') {
      return { success: false, error: 'DUPLICATE_CONFLICT', code: 'DUPLICATE_CONFLICT',
        stage: 'idempotency', zero_write: true, data: { submit_batch_id: providedKey, existing_plan_count: cls.planIds.length } };
    }
    if (cls.state === 'COMMITTED_UNVERIFIED') {
      return { success: false, error: 'COMMITTED_UNVERIFIED', code: 'COMMITTED_UNVERIFIED',
        stage: 'idempotency', zero_write: true, data: { submit_batch_id: providedKey, existing_plan_count: cls.planIds.length, existing_line_count: cls.lineCount } };
    }
    if (cls.state === 'RECONCILIATION_REQUIRED') {
      return { success: false, error: 'RECONCILIATION_REQUIRED', code: 'RECONCILIATION_REQUIRED',
        stage: 'idempotency', zero_write: true, data: { submit_batch_id: providedKey, existing_plan_count: cls.planIds.length, existing_line_count: cls.lineCount,
        reason: 'persisted rows are schema-incomplete / an unknown fingerprint version — cannot prove equivalence' } };
    }
    // state === 'CREATE' → no header carries this key yet → proceed to write exactly one batch under it.
  }

  // WRITE the derived batch (what was fingerprinted == what is written → a subsequent identical retry REUSES).
  derivedHeaderObjs.forEach(function (h) { shippingPlanAppendByHeader_(planSheet, h); });
  derivedLineObjs.forEach(function (ln2) { shippingPlanAppendByHeader_(lineSheet, ln2); });

  // J — READBACK verification: re-read the just-written batch by its execution key and confirm every intended plan +
  // line id is durably present. A shortfall is a typed COMMITTED_UNVERIFIED (never a silent success, never a blind retry).
  if (providedKey) {
    var rbPlans = shippingPlanReadObjects_(planSheet), rbLines = shippingPlanReadObjects_(lineSheet);
    var rbPlanIds = {}; rbPlans.forEach(function (p) { if (String(p.submit_batch_id || '').trim() === providedKey) rbPlanIds[String(p.shipping_plan_id || '').trim()] = 1; });
    var wantPlanIds = derivedHeaderObjs.map(function (h) { return String(h.shipping_plan_id).trim(); });
    var missingPlans = wantPlanIds.filter(function (id) { return !rbPlanIds[id]; });
    var rbLineCount = rbLines.filter(function (l) { return rbPlanIds[String(l.shipping_plan_id || '').trim()]; }).length;
    if (missingPlans.length || rbLineCount < totalLines) {
      return { success: false, error: 'COMMITTED_UNVERIFIED', code: 'COMMITTED_UNVERIFIED', stage: 'readback', zero_write: false,
        data: { submit_batch_id: providedKey, missing_plan_ids: missingPlans, expected_line_count: totalLines, readback_line_count: rbLineCount } };
    }
  }

  return { success: true, data: { submit_batch_id: submitBatchId, outcome: 'CREATED', reused: false,
    fingerprint: incomingFingerprint, fingerprint_version: SHIPPING_PLAN_FINGERPRINT_VERSION_,
    plan_count: created.length, line_count: totalLines, plans: created } };
  }
}

/**
 * Rough carrier + cost snapshot for a Weekly Shipping Plan group. Returns blanks (Not Applied) when no
 * carrier is chosen for the route or no active rate-card candidate exists (e.g. overseas → FBA has no rate
 * system yet) — estimated_* stay '' (never 0). When a carrier IS chosen, resolves the rough candidate
 * (country + method + last_mile + battery + active + effective; postal/route NOT required) and snapshots
 * carrier_unit_rate / carrier_rate_type (= charge_type) / import_duty_treatment, then computes Phase-1 cost.
 * Never throws.
 */
function shippingPlanRoughQuote_(ss, meta, groupLines, today) {
  var blank = { carrier_id: String(meta.carrier_id || '').trim(), carrier_unit_rate: '', carrier_rate_type: '',
    import_duty_treatment: '', customs_type: String(meta.customs_type || '').trim(),
    estimated_freight_cost: '', estimated_duty: '', estimated_customs_fee: '',
    estimated_total_cost: '', currency: '' };
  try {
    var carrierId = String(meta.carrier_id || '').trim();
    if (!carrierId) return blank;   // no carrier chosen → rough estimate not applicable yet
    var skus = groupLines.map(function (l) { return String(l.sku || '').trim(); }).filter(String);
    var battery = shippingBatteryClass_(ss, skus);
    var candidates = shippingMatchRateCards_(ss, {
      originCountry: '', destinationCountry: meta.country, shippingMethod: meta.shipping_method,
      lastMile: meta.last_mile_delivery, batteryType: battery, quoteDate: today
    }, false).filter(function (rc) { return String(rc.carrier_id || '').trim() === carrierId; });
    if (!candidates.length) return blank;   // no candidate → Not Applied (blank)
    var rc = candidates[0];
    // Measures from the plan lines (approved_qty = requested at submit). gross weight in kg.
    var upcMap = shippingPlanUpcMap_(ss), logisticsMap = shippingPlanSkuLogisticsMap_(ss);
    var totCartons = 0, totCbm = 0, totGross = 0, dutyLines = [];
    groupLines.forEach(function (l) {
      var sku = String(l.sku || '').trim();
      var qty = shippingPlanNum_(l.requested_qty);
      var upc = shippingPlanNum_(l.units_per_carton) || upcMap[sku] || 0;
      var carton = upc > 0 ? Math.ceil(qty / upc) : 0;
      var logi = shippingPlanLineLogistics_(logisticsMap[sku], qty, carton);
      totCartons += carton;
      totCbm += shippingPlanNum_(logi.cbm);
      totGross += shippingPlanNum_(logi.gross_weight);
      dutyLines.push({ sku: sku, qty: qty });
    });
    var freight = shippingFreight_(rc, { grossWeightKg: totGross, cbm: totCbm, cartons: totCartons });
    var customsFee = shippingCustomsFee_(rc);
    var treat = String(rc.import_duty_treatment || '').trim();
    var duty = shippingDuty_(ss, dutyLines, treat, meta.country, today);
    var total = freight.freight + customsFee + (duty === '' ? 0 : duty);
    return {
      carrier_id: carrierId,
      carrier_unit_rate: shippingPlanNum_(rc.unit_rate),
      carrier_rate_type: String(rc.charge_type || '').trim(),
      import_duty_treatment: treat,
      customs_type: String(meta.customs_type || rc.customs_type || '').trim(),
      estimated_freight_cost: freight.freight,
      estimated_duty: duty,
      estimated_customs_fee: customsFee,
      estimated_total_cost: shippingPlanRound_(total, 2),
      currency: String(rc.currency || '').trim()
    };
  } catch (e) {
    return blank;
  }
}

// ---- updateShippingPlanStatus -------------------------------------

/**
 * Status transitions on shipping_plans (header-based row lookup by shipping_plan_id):
 *   submit  : draft -> pending_approval (if previously rejected, plan_version +1, clear rejected_*)
 *   approve : pending_approval -> approved
 *   reject  : pending_approval -> draft (rejected_* recorded; reason appended to note)
 *   cancel  : draft|pending_approval -> cancelled (SOFT cancel — row + lines preserved)
 * Actor fields are placeholder identities for MVP (see WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §13A);
 * a future Role & Permission module replaces them with real user identity.
 */
function handleUpdateShippingPlanStatus_(body) {
  var planId = String((body && body.shipping_plan_id) || '').trim();
  var transition = String((body && body.transition) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  var reason = String((body && body.rejected_reason) || '').trim();
  // Placeholder actor identities (MVP) — never block the flow if absent.
  var submittedBy = String((body && (body.submitted_by || body.updated_by)) || actor || 'system_user').trim();
  var cancelledBy = String((body && (body.cancelled_by || body.updated_by)) || actor || 'system_user').trim();
  var rejectedBy  = String((body && (body.rejected_by || body.updated_by)) || actor || 'system_user').trim();
  var approvedBy  = String((body && (body.approved_by || body.updated_by)) || actor || 'system_user').trim();
  var updatedBy   = String((body && body.updated_by) || actor || 'system_user').trim();

  if (!planId) return jsonResponse_({ success: false, error: 'Missing shipping_plan_id' });
  var VALID_TRANSITIONS = ['submit', 'approve', 'reject', 'cancel'];
  if (VALID_TRANSITIONS.indexOf(transition) === -1) {
    return jsonResponse_({ success: false, error: 'Invalid transition. Valid: ' + VALID_TRANSITIONS.join(', ') });
  }
  if (transition === 'reject' && !reason) {
    return jsonResponse_({ success: false, error: 'rejected_reason is required to reject' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('shipping_plans');
  if (!sheet) return jsonResponse_({ success: false, error: 'shipping_plans sheet not found' });

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'shipping_plans is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };

  var idCol = col('shipping_plan_id');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipping_plan_id column not found' });

  var targetRow = -1, rowVals = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === planId) { targetRow = i + 1; rowVals = data[i]; break; }
  }
  if (targetRow === -1) return jsonResponse_({ success: false, error: 'Shipping plan not found: ' + planId });

  var curStatus = col('status') !== -1 ? String(rowVals[col('status')]).trim() : '';
  var now = shippingPlanTimestamp_();
  function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(targetRow, c + 1).setValue(value); }

  // Combined-Plan guard: a CHILD (parent_shipping_plan_id points at a Combined Parent) can NOT be submitted /
  // approved / cancelled independently — the Combined Parent owns those actions (§七). transfer is likewise
  // blocked in createShipmentFromApprovedPlan_.
  var pcCol = col('parent_shipping_plan_id');
  var parentRef = pcCol !== -1 ? String(rowVals[pcCol] || '').trim() : '';
  if (parentRef && parentRef !== planId && (transition === 'submit' || transition === 'approve' || transition === 'cancel')) {
    return jsonResponse_({ success: false, error: 'Plan ' + planId + ' is a child of Combined Parent ' + parentRef + ' — submit/approve/cancel via the Combined Parent (or uncombine first).' });
  }

  if (transition === 'submit') {
    if (curStatus !== 'draft') return jsonResponse_({ success: false, error: 'Only a Draft plan can be submitted (current: ' + curStatus + ')' });
    // Resubmit after a prior rejection bumps the decision revision and clears the rejection marker.
    var wasRejected = col('rejected_at') !== -1 && String(rowVals[col('rejected_at')]).trim() !== '';
    if (wasRejected) {
      var curVer = col('plan_version') !== -1 ? (parseFloat(rowVals[col('plan_version')]) || 1) : 1;
      setCell('plan_version', curVer + 1);
      setCell('rejected_by', ''); setCell('rejected_at', ''); setCell('rejected_reason', '');
    }
    setCell('status', 'pending_approval');
    setCell('submitted_by', submittedBy);
    setCell('submitted_at', now);
  } else if (transition === 'approve') {
    if (curStatus !== 'pending_approval') return jsonResponse_({ success: false, error: 'Only a Pending Approval plan can be approved (current: ' + curStatus + ')' });
    setCell('status', 'approved');
    setCell('approved_by', approvedBy);
    setCell('approved_at', now);
  } else if (transition === 'reject') {
    if (curStatus !== 'pending_approval') return jsonResponse_({ success: false, error: 'Only a Pending Approval plan can be rejected (current: ' + curStatus + ')' });
    var verForNote = col('plan_version') !== -1 ? (parseFloat(rowVals[col('plan_version')]) || 1) : 1;
    setCell('rejected_by', rejectedBy);
    setCell('rejected_at', now);
    setCell('rejected_reason', reason);
    // Append the reason to the note history (preserve existing notes).
    if (col('note') !== -1) {
      var existingNote = String(rowVals[col('note')] || '').trim();
      var appended = '[REJECTED v' + verForNote + ' @' + now + '] ' + reason;
      setCell('note', existingNote ? (existingNote + '\n' + appended) : appended);
    }
    setCell('status', 'draft'); // returns to Draft (editable again); resubmit will bump plan_version
  } else if (transition === 'cancel') {
    // SOFT cancel: allowed from Draft or Pending Approval; row + lines are NEVER deleted.
    if (curStatus !== 'draft' && curStatus !== 'pending_approval') {
      return jsonResponse_({ success: false, error: 'Only a Draft or Pending Approval plan can be cancelled (current: ' + curStatus + ')' });
    }
    setCell('status', 'cancelled');
    setCell('cancelled_by', cancelledBy);
    setCell('cancelled_at', now);
  }

  setCell('updated_by', updatedBy);
  setCell('updated_at', now);

  // EXECUTION COMMIT: approving a plan creates its Shipment Draft (shipments + shipment_lines),
  // copying the Decision Snapshot into the Execution Snapshot (SHIPMENT_CENTER_SPEC §15 step 10;
  // ARCHITECTURE §3A/§4A). Idempotent. A failure here does NOT roll back the approval — the
  // explicit createShipmentFromPlan action can retry.
  var shipmentResult = null;
  if (transition === 'approve') {
    try {
      shipmentResult = createShipmentFromApprovedPlan_(ss, planId, approvedBy);
    } catch (e) {
      shipmentResult = { created: false, error: String(e && e.message ? e.message : e) };
    }
  }

  return jsonResponse_({ success: true, data: { shipping_plan_id: planId, transition: transition, shipment: shipmentResult } });
}

// ---- updateShippingPlanLineQty ------------------------------------

/**
 * Edit approved_qty on shipping_plan_lines (Draft only). Recomputes carton_qty from
 * units_per_carton. Body: { lines: [ { shipping_plan_line_id, approved_qty } ] }.
 * Lines whose parent plan is not Draft are skipped (reported).
 */
function handleUpdateShippingPlanLineQty_(body) {
  var reqLines = (body && body.lines) || [];
  if (!reqLines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSheet = ss.getSheetByName('shipping_plan_lines');
  var planSheet = ss.getSheetByName('shipping_plans');
  if (!lineSheet) return jsonResponse_({ success: false, error: 'shipping_plan_lines sheet not found' });
  if (!planSheet) return jsonResponse_({ success: false, error: 'shipping_plans sheet not found' });
  // Ensure the CANONICAL renamed carton column so the qty edit writes plan_carton_qty (not legacy).
  sheetEnsureColumns_(lineSheet, ['plan_carton_qty']);

  // plan_id -> status
  var planData = planSheet.getDataRange().getValues();
  var planHeaders = planData[0].map(function (h) { return String(h).trim(); });
  var pIdCol = planHeaders.indexOf('shipping_plan_id');
  var pStatusCol = planHeaders.indexOf('status');
  var statusById = {};
  for (var p = 1; p < planData.length; p++) {
    if (pIdCol !== -1) statusById[String(planData[p][pIdCol]).trim()] = pStatusCol !== -1 ? String(planData[p][pStatusCol]).trim() : '';
  }

  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'shipping_plan_lines is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var idCol = col('shipping_plan_line_id');
  var planIdCol = col('shipping_plan_id');
  var skuCol = col('sku');
  var approvedCol = col('approved_qty');
  // Write the CANONICAL plan_carton_qty; fall back to the legacy carton_qty column only on old tabs.
  var cartonCol = col('plan_carton_qty');
  if (cartonCol === -1) cartonCol = col('carton_qty');
  var upcCol = col('units_per_carton');
  var cartonCbmCol = col('carton_cbm');
  var cbmCol = col('cbm');
  var grossCol = col('gross_weight');
  var netCol = col('net_weight');
  var updatedCol = col('updated_at');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipping_plan_line_id column not found' });

  // sku -> logistics, to recompute the line logistics snapshot on a qty edit (Save).
  var logisticsMap = shippingPlanSkuLogisticsMap_(ss);

  // index line id -> sheet row
  var rowById = {};
  for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };

  var now = shippingPlanTimestamp_();
  var updated = 0, skipped = 0;
  for (var r = 0; r < reqLines.length; r++) {
    var rq = reqLines[r] || {};
    var lineId = String(rq.shipping_plan_line_id || '').trim();
    if (!lineId || !rowById[lineId]) { skipped++; continue; }
    var ref = rowById[lineId];
    var parentId = planIdCol !== -1 ? String(ref.vals[planIdCol]).trim() : '';
    if (statusById[parentId] !== 'draft') { skipped++; continue; } // editable only in Draft
    var approved = parseFloat(rq.approved_qty); if (isNaN(approved) || approved < 0) approved = 0;
    var upc = upcCol !== -1 ? (parseFloat(ref.vals[upcCol]) || 0) : 0;
    var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
    if (approvedCol !== -1) lineSheet.getRange(ref.row, approvedCol + 1).setValue(approved);
    if (cartonCol !== -1) lineSheet.getRange(ref.row, cartonCol + 1).setValue(carton);
    // Recompute the logistics Decision Snapshot (cbm / gross_weight / net_weight) on Save.
    var skuVal = skuCol !== -1 ? String(ref.vals[skuCol] || '').trim() : '';
    var logi = shippingPlanLineLogistics_(logisticsMap[skuVal], approved, carton);
    if (cartonCbmCol !== -1) lineSheet.getRange(ref.row, cartonCbmCol + 1).setValue(logi.carton_cbm);
    if (cbmCol !== -1) lineSheet.getRange(ref.row, cbmCol + 1).setValue(logi.cbm);
    if (grossCol !== -1) lineSheet.getRange(ref.row, grossCol + 1).setValue(logi.gross_weight);
    if (netCol !== -1) lineSheet.getRange(ref.row, netCol + 1).setValue(logi.net_weight);
    if (updatedCol !== -1) lineSheet.getRange(ref.row, updatedCol + 1).setValue(now);
    updated++;
  }

  return jsonResponse_({ success: true, data: { updated: updated, skipped: skipped } });
}

// ---- completeShippingPlan (Decision Layer Completion) -------------

/**
 * Mark an Approved + transferred Weekly Shipping Plan as COMPLETED (Decision Layer finished its job;
 * the Execution Layer has taken over). Writes ONLY completed_at / completed_by (+ updated_*).
 * Body: { shipping_plan_id, actor? }.
 * Guards: plan must be status=approved AND already transferred to a Shipment Draft
 *         (transferred_shipment_id OR transferred_to_shipment_at present).
 * Does NOT touch shipments / shipment_lines / Decision Snapshot / Execution Snapshot. No row delete.
 */
function handleCompleteShippingPlan_(body) {
  var planId = String((body && body.shipping_plan_id) || '').trim();
  var actor = String((body && (body.completed_by || body.actor)) || 'system_user').trim();
  if (!planId) return jsonResponse_({ success: false, error: 'Missing shipping_plan_id' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('shipping_plans');
  if (!sheet) return jsonResponse_({ success: false, error: 'shipping_plans sheet not found' });

  // Auto-add the completion + transfer columns if the tab predates them (no manual migration).
  // Ensuring transfer columns up front lets us BACKFILL them when the Execution Commit created a
  // shipment but the transfer writeback was silently skipped (missing header on an old tab).
  sheetEnsureColumns_(sheet, ['completed_at', 'completed_by', 'transferred_shipment_id', 'transferred_to_shipment_at', 'updated_by', 'updated_at']);

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'shipping_plans is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var idCol = col('shipping_plan_id');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipping_plan_id column not found' });

  var targetRow = -1, rowVals = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === planId) { targetRow = i + 1; rowVals = data[i]; break; }
  }
  if (targetRow === -1) return jsonResponse_({ success: false, error: 'Shipping plan not found: ' + planId });

  var curStatus = col('status') !== -1 ? String(rowVals[col('status')]).trim() : '';
  if (curStatus !== 'approved') {
    return jsonResponse_({ success: false, error: 'Only an Approved plan can be completed (current: ' + curStatus + ')' });
  }

  var now = shippingPlanTimestamp_();
  function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(targetRow, c + 1).setValue(value); }

  // Transfer detection: the plan's own transferred_shipment_id / transferred_to_shipment_at, OR an
  // actual shipments row that references this plan (robust — the transfer metadata may never have
  // persisted). If a shipment exists but the columns are blank, BACKFILL them here.
  var transferredId = col('transferred_shipment_id') !== -1 ? String(rowVals[col('transferred_shipment_id')]).trim() : '';
  var transferredAt = col('transferred_to_shipment_at') !== -1 ? String(rowVals[col('transferred_to_shipment_at')]).trim() : '';
  if (!transferredId && !transferredAt) {
    var foundShipmentId = shipmentFindForPlan_(ss, planId);
    if (foundShipmentId) {
      transferredId = foundShipmentId;
      transferredAt = now;
      setCell('transferred_shipment_id', foundShipmentId);
      setCell('transferred_to_shipment_at', now);
    }
  }
  if (!transferredId && !transferredAt) {
    return jsonResponse_({ success: false, error: 'Plan has not been transferred to a Shipment Draft yet (Execution Commit required before Done).' });
  }

  setCell('completed_at', now);
  setCell('completed_by', actor);
  setCell('updated_by', actor);
  setCell('updated_at', now);

  return jsonResponse_({ success: true, data: { shipping_plan_id: planId, completed_at: now, completed_by: actor, transferred_shipment_id: transferredId } });
}

// ---- appendShippingPlanNote ---------------------------------------

/**
 * Append a note to shipping_plans.note (append-only history). Body: { shipping_plan_id, note, actor? }.
 * - Preserves all existing notes (never overwrites).
 * - Never touches rejected_reason (that remains the formal rejection field).
 */
function handleAppendShippingPlanNote_(body) {
  var planId = String((body && body.shipping_plan_id) || '').trim();
  var note = String((body && body.note) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  if (!planId) return jsonResponse_({ success: false, error: 'Missing shipping_plan_id' });
  if (!note) return jsonResponse_({ success: false, error: 'note is required' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('shipping_plans');
  if (!sheet) return jsonResponse_({ success: false, error: 'shipping_plans sheet not found' });

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'shipping_plans is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var idCol = headers.indexOf('shipping_plan_id');
  var noteCol = headers.indexOf('note');
  var updatedCol = headers.indexOf('updated_at');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipping_plan_id column not found' });
  if (noteCol === -1) return jsonResponse_({ success: false, error: 'note column not found' });

  var targetRow = -1, rowVals = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === planId) { targetRow = i + 1; rowVals = data[i]; break; }
  }
  if (targetRow === -1) return jsonResponse_({ success: false, error: 'Shipping plan not found: ' + planId });

  var now = shippingPlanTimestamp_();
  var existing = String(rowVals[noteCol] || '').trim();
  var appended = '[NOTE @' + now + ' by ' + actor + '] ' + note;
  sheet.getRange(targetRow, noteCol + 1).setValue(existing ? (existing + '\n' + appended) : appended);
  if (updatedCol !== -1) sheet.getRange(targetRow, updatedCol + 1).setValue(now);

  return jsonResponse_({ success: true, data: { shipping_plan_id: planId } });
}
