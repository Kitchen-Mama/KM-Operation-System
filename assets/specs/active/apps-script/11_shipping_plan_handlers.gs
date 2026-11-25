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
// F1-7N-FB-4D §E — deployment build stamp for the SHIPPING PLAN SUBMIT OWNER. FB-4D changed NOTHING in this
// file; the stamp records the round that last changed its behaviour (F1-7N-FA-4B2, the physical
// shipment-compatibility group key) so the manifest never claims a change this file did not receive. It is
// registered because Submit is the last write in the Site Inventory chain: if this owner is a round behind
// while the allocation owner is current, the plan commit and the draft it consumes disagree silently.
// F1-7N-FC-1A: the Approve result is no longer a bare success. It now carries execution_commit and a typed
// recovery object, and the Weekly page BINDS to both. An 11_ one round behind still approves and still fails
// to create the shipment, but reports plain success — the exact silence this round closes, and
// indistinguishable from a healthy deployment without this stamp moving.
var SP_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1G-R15F2-R15G-S2-TAX1-WDL1-SBX-AF1-AD3-AD4-DW1-DW2';

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
// SANDBOX-GATE-1e: a Decision-Snapshot measure that was not supplied is UNKNOWN (blank), never a measured 0
function shippingPlanNumOrBlank_(v) { var t = String(v == null ? '' : v).trim(); if (t === '') return ''; var n = parseFloat(t); return isNaN(n) ? '' : n; }

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
    var cartonWeight = cWt === -1 ? null : spRcTierNumber_(data[i][cWt]);
    map[s] = {
      cartonL: cL === -1 ? 0 : (parseFloat(data[i][cL]) || 0),
      cartonW: cW === -1 ? 0 : (parseFloat(data[i][cW]) || 0),
      cartonH: cH === -1 ? 0 : (parseFloat(data[i][cH]) || 0),
      cartonDimUnit: cDU === -1 ? '' : String(data[i][cDU] || '').trim().toLowerCase(),
      cartonWeight: cartonWeight === null ? '' : cartonWeight,
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
  var weight = spRcTierNumber_(logi.cartonWeight), cartons = spRcTierNumber_(cartonQty);
  var grossKnown = weight !== null && cartons !== null && !(approvedQty > 0 && !(cartons > 0));
  return {
    carton_cbm: cartonCbm,
    cbm: shippingPlanRound_(cartonQty * cartonCbm, 4),
    gross_weight: grossKnown ? shippingPlanRound_(cartons * weight, 3) : '',
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
  // SANDBOX-GATE-1d: EVERY company per key, never the first row. A site is company + country + marketplace (the marketplaces row /
  // marketplace_id); one country + marketplace may be served by several companies, so a key maps to the SET of its companies.
  var bySku = {}, byMarket = {};
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function add(map, key, comp) { var l = map[key] || (map[key] = []); for (var a = 0; a < l.length; a++) if (lc(l[a]) === lc(comp)) return; l.push(comp); }
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
          add(bySku, lc(d[i][coCol]) + '||' + lc(d[i][mCol]) + '||' + lc(d[i][sCol]), comp);
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
          add(byMarket, lc(d2[k][coCol2]) + '||' + lc(d2[k][mCol2]), comp2);
        }
      }
    }
  }
  return { bySku: bySku, byMarket: byMarket };
}

/** company||country||marketplace||sku -> site_sku (rows carrying a company); country||marketplace||sku only for company-less rows.
 *  A key with two different site_sku values resolves to none (never the first row). Blank when unavailable. */
function shippingPlanSiteSkuMap_(ss) {
  var map = {}, bad = {};
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  var sh = ss.getSheetByName('marketplace_skus');
  if (!sh) return map;
  var d = sh.getDataRange().getValues();
  if (d.length < 2) return map;
  var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cCo = h.indexOf('country'), cMk = h.indexOf('marketplace'), cSku = h.indexOf('sku'), cSite = h.indexOf('site_sku'), cComp = h.indexOf('company');
  if (cSku === -1 || cSite === -1) return map;
  for (var i = 1; i < d.length; i++) {
    var site = String(d[i][cSite] || '').trim();
    if (!site) continue;
    var comp = cComp === -1 ? '' : lc(d[i][cComp]);
    var key = (comp ? comp + '||' : '') + (cCo === -1 ? '' : lc(d[i][cCo])) + '||' + (cMk === -1 ? '' : lc(d[i][cMk])) + '||' + lc(d[i][cSku]);
    if (bad[key]) continue;
    if (map[key] && map[key] !== site) { delete map[key]; bad[key] = 1; continue; }
    map[key] = site;
  }
  return map;
}
/** SANDBOX-GATE-1d: the site_sku of ONE site - its own company first; a company-less master row only as the legacy fallback. */
function shippingPlanSiteSkuFor_(map, company, country, marketplace, sku) {
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  var tail = lc(country) + '||' + lc(marketplace) + '||' + lc(sku);
  return (lc(company) && map[lc(company) + '||' + tail]) || map[tail] || '';
}

/** SANDBOX-GATE-1d: resolve a line's company. The line company (16_: the PERSISTED draft header company) is the authority and is
 *  VALIDATED against master data; with none, master data decides only when it names exactly one company. Never the first row.
 *  Returns { ok, company } or { ok:false, code, companies }. */
function shippingPlanResolveCompany_(maps, country, marketplace, sku, payloadCompany) {
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  var pc = String(payloadCompany == null ? '' : payloadCompany).trim();
  if (pc === '--') pc = '';
  var mk = maps.byMarket[lc(country) + '||' + lc(marketplace)] || [];
  var sk = maps.bySku[lc(country) + '||' + lc(marketplace) + '||' + lc(sku)] || [];
  var master = mk.length ? mk : sk;
  if (pc) {
    if (!master.length) return { ok: true, company: pc, basis: 'LINE_COMPANY_NO_MASTER_ROW' };
    for (var i = 0; i < master.length; i++) if (lc(master[i]) === lc(pc)) return { ok: true, company: master[i], basis: mk.length ? 'LINE_COMPANY_MARKETPLACES' : 'LINE_COMPANY_MARKETPLACE_SKUS' };
    return { ok: false, code: 'PLAN_COMPANY_NOT_A_SITE', company: pc, companies: master.slice(0, 10) };
  }
  if (master.length === 1) return { ok: true, company: master[0], basis: mk.length ? 'MARKETPLACES_UNIQUE' : 'MARKETPLACE_SKUS_UNIQUE' };
  if (master.length > 1) return { ok: false, code: 'PLAN_COMPANY_AMBIGUOUS', company: '', companies: master.slice(0, 10) };
  Logger.log('[createShippingPlansBatch] company unresolved for country=' + country + ' marketplace=' + marketplace + ' sku=' + sku);
  return { ok: true, company: '', basis: 'UNRESOLVED_BLANK' };
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

// F1-7N-FA-4B2(A) — PURE physical shipment-compatibility group key (company already resolved). Determines which lines may
// share one Shipping Plan: company + country + source_warehouse_id + ship_from + destination_warehouse_id + destination +
// shipping_method + last_mile_delivery + planning_cycle + carrier_id + customs_type. Marketplace EXCLUDED (MULTI header,
// real marketplace per line). Unchosen carrier/customs stay blank; explicit incompatible choices must not collapse.
// Groups ONLY the current Submit's lines, never an older plan. Every dimension is spfp-1-bound (header FP for the route fields
// incl. last_mile_delivery; planning_cycle via each line's source_reason `cyc:`).
function shippingPlanRouteGroupKey_(ln, company) {
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  ln = ln || {};
  return [company, ln.country, ln.source_warehouse_id, ln.ship_from, ln.destination_warehouse_id, ln.destination, ln.shipping_method, ln.last_mile_delivery, ln.planning_cycle, ln.carrier_id, ln.customs_type].map(lc).join('||');
}

// PURE projector: flat plan/line row objects → canonical, sorted, fixed-key-order structure (ids/audit excluded).
function shippingPlanProjectBatch_(planObjs, lineObjs) {
  var linesByPlan = {};
  (lineObjs || []).forEach(function (l) { var pid = String(l.shipping_plan_id || '').trim(); (linesByPlan[pid] = linesByPlan[pid] || []).push(l); });
  var headers = (planObjs || []).map(function (p) {
    var h = {}; SP_HDR_FP_STR_.forEach(function (f) { h[f] = shippingPlanFpStr_(p[f]); }); SP_HDR_FP_NUM_.forEach(function (f) { h[f] = shippingPlanFpNum_(p[f]); });
    var pid = String(p.shipping_plan_id || '').trim();
    var ls = (linesByPlan[pid] || []).map(function (l) { var o = {}; SP_LINE_FP_STR_.forEach(function (f) { o[f] = shippingPlanFpStr_(l[f]); }); SP_LINE_FP_NUM_.forEach(function (f) { o[f] = shippingPlanFpNum_(l[f]); }); return o; });
    ls.sort(function (a, b) { var ka = shippingPlanLineSortKey_(a), kb = shippingPlanLineSortKey_(b); if (ka === kb) { ka = JSON.stringify(a); kb = JSON.stringify(b); } return ka < kb ? -1 : (ka > kb ? 1 : 0); });
    return { header: h, lines: ls };
  });
  // Equal display routes may differ in customs, last mile or cycle; sort ties by the complete canonical payload.
  headers.sort(function (a, b) { var ka = shippingPlanHdrSortKey_(a.header), kb = shippingPlanHdrSortKey_(b.header); if (ka === kb) { ka = JSON.stringify(a); kb = JSON.stringify(b); } return ka < kb ? -1 : (ka > kb ? 1 : 0); });
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
 *   DUPLICATE_CONFLICT   — headers share a final route but the complete batch differs from the trusted incoming
 *                          payload (unexpected duplicate content) → fail closed, do not reconstruct.
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
  // Headers omit planning_cycle; recover it from immutable line provenance for replay grouping.
  plansForKey.forEach(function (p) {
    var cycles = {};
    (persistedLines || []).forEach(function (l) {
      if (String(l.shipping_plan_id || '').trim() !== String(p.shipping_plan_id || '').trim()) return;
      var m = /(?:^|\|)cyc:([^|]*)/.exec(String(l.source_reason || ''));
      cycles[m ? m[1].trim().toLowerCase() : ''] = 1;
    });
    var r = JSON.stringify([p.company, p.country, p.source_warehouse_id, p.ship_from, p.destination_warehouse_id,
      p.destination, p.shipping_method, p.last_mile_delivery, Object.keys(cycles).sort().join('|'), p.carrier_id, p.customs_type]
      .map(function (x) { return String(x == null ? '' : x).trim().toLowerCase(); }));
    if (routes[r]) dupRoute = true; routes[r] = 1;
  });
  var linesForKey = (persistedLines || []).filter(function (l) { return planIdSet[String(l.shipping_plan_id || '').trim()]; });
  if (linesForKey.length === 0 && incomingLineCount > 0) return { state: 'COMMITTED_UNVERIFIED', planIds: planIds, lineCount: 0, fingerprint: '' };
  if (!shippingPlanLinesSchemaComplete_(linesForKey)) return { state: 'RECONCILIATION_REQUIRED', planIds: planIds, lineCount: linesForKey.length, fingerprint: '' };
  var fp = shippingPlanCanonicalFingerprint_(plansForKey, linesForKey);
  // Blank and explicit carrier/service groups can converge after quote defaults. Equal final routes alone are
  // not corruption: require exact full-batch content AND cardinality before reusing, otherwise fail closed below.
  if (fp === incomingFingerprint && linesForKey.length === incomingLineCount) return { state: 'REUSED', planIds: planIds, lineCount: linesForKey.length, fingerprint: fp };
  if (dupRoute) return { state: 'DUPLICATE_CONFLICT', planIds: planIds, lineCount: linesForKey.length, fingerprint: fp };
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
    out.push(shippingPlanNormalizeLineMkt_(o));   // F1-7N-FA-4B1(B): expose LOGICAL `marketplace` regardless of physical column
  }
  return out;
}

// ================================================================================================================
// F1-7N-FA-4B1 (A/B/J/K) — PHYSICAL vs LOGICAL marketplace authority for shipping_plan_lines.
// The LOGICAL application field is `marketplace` (used by the writer, reader, fingerprint and every DTO). The frozen
// PHYSICAL live DB column is the (misspelled) `marketplace_seperate` on the deployed sheet; a cleanly-migrated sheet
// instead carries `marketplace`. ONE canonical accessor bridges them — the write/read column is `marketplace` when the
// sheet has it, else `marketplace_seperate`, else NONE (fail closed with SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED).
// The line's REAL marketplace is written to EXACTLY ONE physical column (never both, no new column, no rename, no
// migration). The header alone may be `MULTI`. USER-frozen authority (F1-7N-FA-4B1): marketplace_seperate is the live
// physical column — do NOT spell-correct it. (Confirmed by the frozen live-header diagnostic in the R6E/R6E1 tests.)
// ================================================================================================================
var SP_LINE_MKT_LOGICAL_ = 'marketplace';
var SP_LINE_MKT_PHYSICAL_ALIAS_ = 'marketplace_seperate';
// resolve the single physical WRITE column for a plan line's marketplace on THIS sheet ('' ⇒ neither ⇒ fail closed).
// F1-7N-FA-4B2(B): the frozen live physical authority is `marketplace_seperate` — when BOTH columns exist it WINS
// (never silently prefer `marketplace` over the physical authority). Only `marketplace` (a canonical/legacy/test schema)
// → use it. Neither → '' (SCHEMA_MAPPING_REQUIRED). A NEW row is written to exactly ONE column (never both).
function shippingPlanLineMktPhysicalCol_(sheet) {
  if (!sheet || typeof sheet.getLastColumn !== 'function') return '';
  var lastCol = sheet.getLastColumn(); if (lastCol < 1) return '';
  var hdr = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var have = {}; hdr.forEach(function (h) { have[h] = 1; });
  if (have[SP_LINE_MKT_PHYSICAL_ALIAS_]) return SP_LINE_MKT_PHYSICAL_ALIAS_;   // frozen live physical authority (wins even if marketplace also present)
  if (have[SP_LINE_MKT_LOGICAL_]) return SP_LINE_MKT_LOGICAL_;                 // canonical / legacy / test schema
  return '';                                                                   // neither → SCHEMA_MAPPING_REQUIRED
}
// F1-7N-FA-4B2(B): per-ROW logical resolution with a documented deterministic compatibility rule + conflict fail-close.
// status: 'blank' (both empty) · 'ok' (one nonblank, or both equal) · 'conflict' (both nonblank AND differ → fail closed;
// never silently pick one). Returns { value, status }.
function shippingPlanResolveLineMkt_(row) {
  row = row || {};
  var m = String(row[SP_LINE_MKT_LOGICAL_] == null ? '' : row[SP_LINE_MKT_LOGICAL_]).trim();
  var a = String(row[SP_LINE_MKT_PHYSICAL_ALIAS_] == null ? '' : row[SP_LINE_MKT_PHYSICAL_ALIAS_]).trim();
  if (m === '' && a === '') return { value: '', status: 'blank' };
  if (m !== '' && a === '') return { value: m, status: 'ok' };
  if (a !== '' && m === '') return { value: a, status: 'ok' };
  if (m === a) return { value: m, status: 'ok' };
  return { value: '', status: 'conflict' };   // both nonblank AND differ → fail closed
}
// normalize a persisted row so the LOGICAL `marketplace` is readable regardless of the physical column. Fills a blank
// logical field from the alias; a genuine value–value conflict is left UNresolved (logical untouched) and flagged
// __mkt_conflict so readers/preflight fail closed rather than silently pick. Plan rows (no alias) pass through.
function shippingPlanNormalizeLineMkt_(row) {
  if (!row) return row;
  var r = shippingPlanResolveLineMkt_(row);
  if (r.status === 'conflict') { row.__mkt_conflict = true; return row; }
  if (String(row[SP_LINE_MKT_LOGICAL_] == null ? '' : row[SP_LINE_MKT_LOGICAL_]).trim() === '' && r.value !== '') row[SP_LINE_MKT_LOGICAL_] = r.value;
  return row;
}
// map a derived (logical-keyed) line object onto the resolved physical column. Writes ONE column; never both. Returns a
// shallow copy when a remap is needed (leaving the fingerprinted derived object untouched).
function shippingPlanApplyLineMktPhysical_(lineObj, physicalCol) {
  if (physicalCol === SP_LINE_MKT_PHYSICAL_ALIAS_) {
    var row = {}; Object.keys(lineObj).forEach(function (k) { row[k] = lineObj[k]; });
    row[SP_LINE_MKT_PHYSICAL_ALIAS_] = lineObj[SP_LINE_MKT_LOGICAL_]; delete row[SP_LINE_MKT_LOGICAL_];
    return row;
  }
  return lineObj;   // physical column already IS the logical name
}
// inserted-only reverse-FK rollback of ONE Submit batch's plan rows (used when a post-write step fails). Deletes ONLY
// rows whose submit_batch_id === execKey AND shipping_plan_id ∈ planIds (never a pre-existing / other-batch row).
function shippingPlanDeleteRowsByColumn_(sheet, colName, idSet) {
  if (!sheet) return 0;
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return 0;
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); }), ci = headers.indexOf(colName);
  if (ci === -1) return 0;
  var toDel = []; for (var r = 1; r < values.length; r++) { if (idSet[String(values[r][ci]).trim()]) toDel.push(r + 1); }
  toDel.sort(function (a, b) { return b - a; }); toDel.forEach(function (n) { sheet.deleteRow(n); }); return toDel.length;
}
// remove exactly this execution's committed plan + line rows (reverse FK: lines then headers), flush, verify absent.
function shippingPlanRollbackBatch_(ss, execKey, planIds) {
  var planSheet = ss.getSheetByName('shipping_plans'), lineSheet = ss.getSheetByName('shipping_plan_lines');
  var planSet = {}; (planIds || []).forEach(function (id) { planSet[String(id).trim()] = 1; });
  var removedLines = lineSheet ? shippingPlanDeleteRowsByColumn_(lineSheet, 'shipping_plan_id', planSet) : 0;
  var removedPlans = planSheet ? shippingPlanDeleteRowsByColumn_(planSheet, 'shipping_plan_id', planSet) : 0;
  SpreadsheetApp.flush();
  var ok = true;
  if (planSheet) shippingPlanReadObjects_(planSheet).forEach(function (p) { if (planSet[String(p.shipping_plan_id || '').trim()]) ok = false; });
  return { ok: ok, removed_plans: removedPlans, removed_lines: removedLines };
}

// ================================================================================================================
// F1-7N-FA-4B1 (I) — STRICTLY READ-ONLY Flow A schema/lineage preflight. Reports the exact shipping_plans /
// shipping_plan_lines headers + hash, the physical/logical marketplace resolution, the real/MULTI/blank line-marketplace
// counts, plan/line counts, FK integrity, and the presence of the downstream lineage tables (shipment_plan_links —
// spec-only; shipment_line_allocations — the PO-supply bridge). NEVER writes a row/cell/property. PURE core is unit-
// testable via DEMO/synthetic sheet reads; the GAS entrypoint reads live sheets only.
// ================================================================================================================
function shippingPlanRawRows_(sheet) {   // RAW read (no marketplace normalization) — the preflight must see physical truth
  var out = { headers: [], rows: [] };
  if (!sheet) return out;
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastCol < 1) return out;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  out.headers = headers;
  if (lastRow < 2) return out;
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (var r = 0; r < values.length; r++) { var o = {}; for (var c = 0; c < headers.length; c++) o[headers[c]] = values[r][c]; out.rows.push(o); }
  return out;
}
// PURE preflight core over already-read raw tables. tables = { shipping_plans, shipping_plan_lines, shipment_plan_links,
// shipment_line_allocations } each { headers:[], rows:[] } (missing sheet ⇒ headers:[] rows:[] present:false).
function shippingPlanFlowAPreflightCore_(tables) {
  function s(v) { return String(v == null ? '' : v).trim(); }
  var plans = tables.shipping_plans || { headers: [], rows: [] };
  var lines = tables.shipping_plan_lines || { headers: [], rows: [] };
  var links = tables.shipment_plan_links || { headers: [], rows: [], present: false };
  var alloc = tables.shipment_line_allocations || { headers: [], rows: [], present: false };
  var lineHdr = lines.headers || [];
  var mktIdx = lineHdr.indexOf(SP_LINE_MKT_LOGICAL_), aliasIdx = lineHdr.indexOf(SP_LINE_MKT_PHYSICAL_ALIAS_);
  // F1-7N-FA-4B2(B): the physical WRITE authority is marketplace_seperate — it WINS when both columns are present.
  var physicalCol = aliasIdx !== -1 ? SP_LINE_MKT_PHYSICAL_ALIAS_ : (mktIdx !== -1 ? SP_LINE_MKT_LOGICAL_ : '');
  var mappingVerdict = mktIdx !== -1 && aliasIdx !== -1 ? 'BOTH_PRESENT_PHYSICAL_ALIAS_WINS'
    : aliasIdx !== -1 ? 'PHYSICAL_LOGICAL_ALIAS_REQUIRED'
    : mktIdx !== -1 ? 'CANONICAL_MARKETPLACE'
    : 'SCHEMA_MAPPING_MISSING';
  // real/MULTI/blank counts + per-row physical/logical CONFLICT (both nonblank & differ → fail closed).
  var realMk = 0, multiMk = 0, blankMk = 0, conflictMk = 0;
  (lines.rows || []).forEach(function (r) {
    var res = shippingPlanResolveLineMkt_(r);
    if (res.status === 'conflict') { conflictMk++; return; }
    var v = res.value;
    if (v === '') blankMk++; else if (v.toUpperCase() === 'MULTI') multiMk++; else realMk++;
  });
  var everyLineRealMarketplace = (lines.rows || []).length === 0 ? true : (blankMk === 0 && multiMk === 0 && conflictMk === 0);
  // plan header MULTI count + FK integrity (line.shipping_plan_id → an existing plan)
  var planIds = {}; (plans.rows || []).forEach(function (p) { planIds[s(p.shipping_plan_id)] = 1; });
  var multiPlans = (plans.rows || []).filter(function (p) { return s(p.marketplace).toUpperCase() === 'MULTI'; }).length;
  var fkOrphans = (lines.rows || []).filter(function (l) { return s(l.shipping_plan_id) !== '' && !planIds[s(l.shipping_plan_id)]; }).length;
  // Flow A SUBMIT-schema readiness is SEPARATE from downstream Shipment-consolidation readiness.
  var flowASubmitSchemaReady = physicalCol !== '' && conflictMk === 0;
  var schemaVerdict = physicalCol === '' ? 'SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED'
    : conflictMk > 0 ? 'SHIPPING_PLAN_LINES_MARKETPLACE_CONFLICT'
    : multiMk > 0 ? 'LINE_MARKETPLACE_AMBIGUOUS'
    : mappingVerdict === 'PHYSICAL_LOGICAL_ALIAS_REQUIRED' || mappingVerdict === 'BOTH_PRESENT_PHYSICAL_ALIAS_WINS' ? 'PHYSICAL_LOGICAL_ALIAS_REQUIRED'
    : 'FLOW_A_SCHEMA_LINEAGE_READY';
  // C/D — downstream Shipment-consolidation lineage classification (TRUTHFUL; Flow A does not implement it).
  var linksWriterPresent = false, linksReaderPresent = false;   // shipment_plan_links has NO .gs writer/reader (spec-only)
  var consolidatedContributionAuthority = 'MISSING';            // no table carries shipment_line_id + shipping_plan_line_id + contributed_qty
  var downstreamBlocker = 'MISSING_SHIPPING_PLAN_LINE_CONTRIBUTION_AUTHORITY';
  return {
    grouping: { dimensions: ['company', 'country', 'source_warehouse_id', 'ship_from', 'destination_warehouse_id', 'destination', 'shipping_method', 'last_mile_delivery', 'planning_cycle'],
      marketplace_excluded: true, last_mile_included: true, planning_cycle_included: true, carrier_deferred: true, all_dimensions_fingerprint_bound: true },
    shipping_plans: { headers: plans.headers, header_hash: shippingPlanFnv_((plans.headers || []).join('|')), row_count: (plans.rows || []).length, multi_plan_count: multiPlans },
    shipping_plan_lines: { headers: lineHdr, header_hash: shippingPlanFnv_(lineHdr.join('|')), row_count: (lines.rows || []).length,
      marketplace_index: mktIdx, marketplace_seperate_index: aliasIdx, resolved_physical_marketplace_col: physicalCol,
      real_marketplace_lines: realMk, multi_marketplace_lines: multiMk, blank_marketplace_lines: blankMk, conflict_marketplace_lines: conflictMk,
      every_line_retains_real_marketplace: everyLineRealMarketplace },
    physical_logical_marketplace_verdict: mappingVerdict,
    fk_integrity: { line_orphans: fkOrphans, ok: fkOrphans === 0 },
    shipment_plan_links: { present: !!links.present, headers: links.headers || [], runtime_writer_present: linksWriterPresent, runtime_reader_present: linksReaderPresent,
      classification: 'SPEC_DEFINED_NOT_IMPLEMENTED', note: 'Header Shipment↔Shipping-Plan lineage — DB/spec authority exists; NO runtime writer/reader.' },
    shipment_line_shipping_plan_line_id: { capability: 'ONE_SOURCE_ONLY', note: 'Exact ONLY for a 1:1 non-consolidated transfer; a single FK cannot represent multiple plan-line contributions to one consolidated shipment_line.' },
    shipment_line_allocations: { present: !!alloc.present, headers: alloc.headers || [], authority: 'PO_LINE_SUPPLY_ONLY', note: 'shipment_line_id → purchase_order_line_id (allocated_qty/shipped_qty) — PO supply lineage, NOT Shipping-Plan contribution lineage.' },
    consolidated_contribution_authority: consolidatedContributionAuthority,
    downstream_lineage_verdict: downstreamBlocker,
    flow_a_submit_schema_ready: flowASubmitSchemaReady,
    shipment_consolidation_lineage_ready: false,
    downstream_blocker: downstreamBlocker,
    schema_lineage_verdict: schemaVerdict
  };
}
function handleFlowASchemaLineagePreflight_(body) {
  var out = { tool: 'handleFlowASchemaLineagePreflight_', mode: 'STRICTLY READ-ONLY (getSheetByName + getValues only)' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    function rd(name) { var sh = ss.getSheetByName(name); var t = shippingPlanRawRows_(sh); t.present = !!sh; return t; }
    var pre = shippingPlanFlowAPreflightCore_({ shipping_plans: rd('shipping_plans'), shipping_plan_lines: rd('shipping_plan_lines'), shipment_plan_links: rd('shipment_plan_links'), shipment_line_allocations: rd('shipment_line_allocations') });
    Object.keys(pre).forEach(function (k) { out[k] = pre[k]; });
    out.success = true;
  } catch (e) { out.success = false; out.error = (e && e.message) ? e.message : String(e); out.schema_lineage_verdict = 'PREFLIGHT_THREW'; }
  out.ZERO_WRITE_CONFIRMED = 'YES (read-only; no row/cell/property write)';
  return jsonResponse_(out);
}

// ---- createShippingPlansBatch -------------------------------------

/**
 * Submit Plan write. Groups lines by the PHYSICAL shipment-compatibility key (company + country + source_warehouse_id
 * + ship_from + destination_warehouse_id + destination + shipping_method + last_mile_delivery + planning_cycle; carrier
 * DEFERRED) — Marketplace is NOT part of the key, so one plan can COMBINE several Marketplaces
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
  // F1-7N-FA-4B1(B/K): validate the canonical line columns EXCEPT marketplace via the rigid gate; resolve marketplace
  // through the physical/logical accessor so a live sheet carrying only `marketplace_seperate` is ACCEPTED (mapped),
  // not failed as MISSING_REQUIRED_HEADER. Neither column present ⇒ typed fail-closed SCHEMA_MAPPING_REQUIRED (zero write).
  prodRequireColumns_(lineSheet, SHIPPING_PLAN_LINES_HEADERS_.filter(function (h) { return h !== SP_LINE_MKT_LOGICAL_; }));
  var lineMktCol = shippingPlanLineMktPhysicalCol_(lineSheet);
  if (!lineMktCol) return { success: false, error: 'SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED', code: 'SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED', stage: 'schema', zero_write: true, data: { required_one_of: [SP_LINE_MKT_LOGICAL_, SP_LINE_MKT_PHYSICAL_ALIAS_] } };
  // Additive migration for the CANONICAL columns on shipping_plans tabs that predate them (validate-only in Runtime).
  sheetEnsureColumns_(planSheet, ['parent_shipping_plan_id', 'source_warehouse_id', 'ship_from_type',
    'destination_warehouse_id', 'destination_type', 'last_mile_delivery',
    'customs_type', 'carrier_id', 'carrier_unit_rate', 'carrier_rate_type',
    'import_duty_treatment', 'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee',
    'estimated_total_cost', 'currency', 'rejected_comment']);

  var readStageS2 = shipWriteReadStage_(ss, ['sku_details', 'warehouses', 'marketplace_skus', 'sites', 'carriers', 'carrier_rate_cards', 'carrier_lead_times', 'tax_referral_rates', 'tax_rate_components']); ss = readStageS2.ss; // CODEX-S2: caller owns lock
  var upcMap = shippingPlanUpcMap_(ss);
  var companyMaps = shippingPlanCompanyMaps_(ss);
  var logisticsMap = shippingPlanSkuLogisticsMap_(ss);
  var siteSkuMap = shippingPlanSiteSkuMap_(ss);

  var now = shippingPlanTimestamp_();
  var today = shippingPlanToday_();
  var submitBatchId = providedKey || ('SB-' + Utilities.getUuid().substring(0, 12));

  // F1-7N-FA-4B2(A) — group by the PHYSICAL shipment-compatibility key so incompatible plans NEVER combine:
  //   company + country + source_warehouse_id + ship_from + destination_warehouse_id + destination + shipping_method
  //   + last_mile_delivery + planning_cycle + explicitly chosen carrier/customs.
  // Marketplace stays EXCLUDED → compatible marketplace lines consolidate and the Header may become MULTI (each line keeps
  // its real marketplace). CARRIER is DEFERRED: it is not authoritative at Shipping Plan creation (derived later by the
  // rough-quote / approval-routing layer). Blank choices are never fabricated, but different explicit choices separate. Every
  // grouping dimension is checksum-bound in spfp-1 (header FP: company/country/ship_from/source_warehouse_id/destination/
  // destination_warehouse_id/shipping_method/last_mile_delivery; planning_cycle via each line's source_reason `cyc:`).
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  var groups = {};
  var order = [];
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i] || {};
    var country = String(ln.country || '').trim();
    var marketplace = String(ln.marketplace || '').trim();
    var shipFrom = String(ln.ship_from || '').trim();
    var sourceWh = String(ln.source_warehouse_id || '').trim();
    var destination = String(ln.destination || '').trim();
    var destWh = String(ln.destination_warehouse_id || '').trim();
    var method = String(ln.shipping_method || '').trim();
    var lastMile = String(ln.last_mile_delivery || '').trim();
    var planningCycle = String(ln.planning_cycle || '').trim();
    var sku = String(ln.sku || '').trim();
    if (!sku) continue;
    // Resolve company from marketplace context (never leave it blank when a source exists).
    var _coR = shippingPlanResolveCompany_(companyMaps, country, marketplace, sku, ln.company);   // SANDBOX-GATE-1d
    if (!_coR.ok) return { success: false, error: _coR.code + ' - the company of this line is not determinable from the site master data (country ' + country + ', marketplace ' + marketplace + '); nothing was written.', code: _coR.code, stage: 'company', zero_write: true, data: { line_company: String(ln.company || ''), country: country, marketplace: marketplace, sku: sku, master_companies: _coR.companies || [] } };
    var company = _coR.company;
    var key = shippingPlanRouteGroupKey_(ln, company);
    if (!groups[key]) {
      groups[key] = { meta: {
        company: company, country: country, ship_from: shipFrom, destination: destination, shipping_method: method,
        source_warehouse_id: sourceWh,
        ship_from_type: String(ln.ship_from_type || '').trim(),
        destination_warehouse_id: destWh,
        destination_type: String(ln.destination_type || '').trim(),
        last_mile_delivery: lastMile,
        planning_cycle: planningCycle,
        carrier_id: String(ln.carrier_id || '').trim(),   // blank is deferred; an explicit choice participates in grouping
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
    var quote = shippingPlanRoughQuote_(ss, Object.assign({}, meta, { marketplace: headerMarketplace }), grp.lines, today);

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
      shipping_method: quote.shipping_method || meta.shipping_method,
      last_mile_delivery: quote.last_mile_delivery == null ? meta.last_mile_delivery : quote.last_mile_delivery,
      customs_type: quote.customs_type,
      carrier_id: quote.carrier_id,
      carrier_unit_rate: quote.carrier_unit_rate,
      carrier_rate_type: quote.carrier_rate_type,
      import_duty_treatment: quote.import_duty_treatment,
      estimated_freight_cost: quote.estimated_freight_cost,
      estimated_duty: quote.estimated_duty, estimated_duty_currency: quote.estimated_duty_currency,
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
      var siteSku = String(l.site_sku || '').trim() || shippingPlanSiteSkuFor_(siteSkuMap, meta.company, l.country, lineMk, sku2);   // SANDBOX-GATE-1d: the plan's own site

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
        snapshot_current_stock: shippingPlanNumOrBlank_(l.snapshot_current_stock),   // SANDBOX-GATE-1e: unknown stays blank
        snapshot_avg_sales_per_day: shippingPlanNumOrBlank_(l.snapshot_avg_sales_per_day),
        snapshot_days_of_supply: (l.snapshot_days_of_supply === '' || l.snapshot_days_of_supply == null) ? '' : l.snapshot_days_of_supply,
        snapshot_suggested_qty: shippingPlanNumOrBlank_(l.snapshot_suggested_qty),
        snapshot_target_days: shippingPlanNumOrBlank_(l.snapshot_target_days),
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

  readStageS2.close(); ss = readStageS2.real; // CODEX-S2: BEFORE journal and every write
  // G — DURABLE rollback evidence bound BEFORE the first business mutation: execution key + canonical payload
  // fingerprint + intended plan ids + intended plan-line ids (+ any caller draft/before-state via ctx.journalExtra) +
  // an integrity checksum. Persisted to a Script Property so a mid-write crash in a later execution is still
  // inserted-only recoverable. Absent a stable execution key the writer still rolls back in-execution (no durable id).
  var wantPlanIds = derivedHeaderObjs.map(function (h) { return String(h.shipping_plan_id).trim(); });
  var wantLineIds = derivedLineObjs.map(function (l) { return String(l.shipping_plan_line_id).trim(); });
  var journalKey = '';
  if (providedKey) {
    var journal = { v: 'SPCFL-J1', execution_key: providedKey, fingerprint: incomingFingerprint, fingerprint_version: SHIPPING_PLAN_FINGERPRINT_VERSION_,
      intended_plan_ids: wantPlanIds, intended_line_ids: wantLineIds, line_marketplace_col: lineMktCol, journal_extra: (ctx.journalExtra || null) };
    journal.integrity = shippingPlanFnv_(JSON.stringify({ k: journal.execution_key, f: journal.fingerprint, p: journal.intended_plan_ids, l: journal.intended_line_ids }));
    journalKey = 'SPCFL_JOURNAL_' + providedKey;
    try { PropertiesService.getScriptProperties().setProperty(journalKey, JSON.stringify(journal)); } catch (eJ) { journalKey = ''; }
  }

  // WRITE the derived batch (what was fingerprinted == what is written → a subsequent identical retry REUSES). The line
  // marketplace is written to the resolved PHYSICAL column (marketplace | marketplace_seperate); exactly one, never both.
  derivedHeaderObjs.forEach(function (h) { shippingPlanAppendByHeader_(planSheet, h); });
  derivedLineObjs.forEach(function (ln2) { shippingPlanAppendByHeader_(lineSheet, shippingPlanApplyLineMktPhysical_(ln2, lineMktCol)); });
  SpreadsheetApp.flush();

  // J/G — READBACK verification: confirm every intended plan + line id is durably present. A shortfall now triggers an
  // INSERTED-ONLY reverse-FK ROLLBACK of exactly this batch (never COMMITTED_UNVERIFIED, never an orphan plan): delete
  // this batch's lines then headers, verify absent, then return COMMIT_FAILED_ROLLED_BACK / _ROLLBACK_UNVERIFIED.
  var rbPlans = shippingPlanReadObjects_(planSheet), rbLines = shippingPlanReadObjects_(lineSheet);
  var rbPlanIds = {}; rbPlans.forEach(function (p) { if (!providedKey || String(p.submit_batch_id || '').trim() === providedKey) { if (wantPlanIds.indexOf(String(p.shipping_plan_id || '').trim()) !== -1) rbPlanIds[String(p.shipping_plan_id || '').trim()] = 1; } });
  var missingPlans = wantPlanIds.filter(function (id) { return !rbPlanIds[id]; });
  var rbLineCount = rbLines.filter(function (l) { return rbPlanIds[String(l.shipping_plan_id || '').trim()]; }).length;
  if (missingPlans.length || rbLineCount < totalLines) {
    var rb = shippingPlanRollbackBatch_(ss, providedKey, wantPlanIds);
    if (journalKey) try { PropertiesService.getScriptProperties().deleteProperty(journalKey); } catch (eD) { /* best-effort */ }
    return { success: false, error: rb.ok ? 'COMMIT_FAILED_ROLLED_BACK' : 'COMMIT_FAILED_ROLLBACK_UNVERIFIED',
      code: rb.ok ? 'COMMIT_FAILED_ROLLED_BACK' : 'COMMIT_FAILED_ROLLBACK_UNVERIFIED', stage: 'readback', zero_write: rb.ok,
      data: { submit_batch_id: providedKey, missing_plan_ids: missingPlans, expected_line_count: totalLines, readback_line_count: rbLineCount, rolled_back: rb } };
  }
  if (journalKey) try { PropertiesService.getScriptProperties().deleteProperty(journalKey); } catch (eD2) { /* success → drop the durable evidence */ }

  return { success: true, data: { submit_batch_id: submitBatchId, outcome: 'CREATED', reused: false,
    fingerprint: incomingFingerprint, fingerprint_version: SHIPPING_PLAN_FINGERPRINT_VERSION_,
    line_marketplace_col: lineMktCol,
    plan_count: created.length, line_count: totalLines, plans: created } };
  }
}

/**
 * Creation-only service default and cost snapshot. Exactly one eligible carrier/method/last-mile may
 * supply a missing service; customs is never inferred. Ambiguous or unresolved prices remain blank.
 * Called while building the existing locked write batch, never by a read. Never throws.
 */
function shippingPlanRoughQuote_(ss, meta, groupLines, today) {
  var blank = { carrier_id: String(meta.carrier_id || '').trim(), shipping_method: meta.shipping_method, last_mile_delivery: meta.last_mile_delivery, carrier_unit_rate: '', carrier_rate_type: '',
    import_duty_treatment: '', customs_type: String(meta.customs_type || '').trim(),
    estimated_freight_cost: '', estimated_duty: '', estimated_duty_currency: '', estimated_customs_fee: '',
    estimated_total_cost: '', currency: '' };
  try {
    var upcMap = shippingPlanUpcMap_(ss), logisticsMap = shippingPlanSkuLogisticsMap_(ss);
    var lines = groupLines.map(function (l) {
      var sku = spRcStr_(l.sku), qty = shippingPlanNum_(l.requested_qty);
      var upc = shippingPlanNum_(l.units_per_carton) || upcMap[sku] || 0;
      var carton = upc > 0 ? Math.ceil(qty / upc) : 0;
      return Object.assign({ sku: sku, approved_qty: qty, plan_carton_qty: carton }, shippingPlanLineLogistics_(logisticsMap[sku], qty, carton));
    });
    var plan = Object.assign({}, meta), lane = spRcLaneCards_(ss, plan, lines, today);
    if (!blank.carrier_id) {
      var service = spRcUniqueService_(ss, plan, lane.cards);
      if (!service) return blank;
      plan.carrier_id = service.carrier_id; plan.shipping_method = service.shipping_method; plan.last_mile_delivery = service.last_mile_delivery;
      blank.carrier_id = plan.carrier_id; blank.shipping_method = plan.shipping_method; blank.last_mile_delivery = plan.last_mile_delivery;
    }
    return Object.assign(blank, spRcPricingSnapshot_(ss, plan, lines, today, lane).fields);
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
// ==============================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5 §4.6 — THE RECHECK AND THE WRITE MUST BE ONE OPERATION.
//
// This handler held NO LOCK. It read the row, decided, and wrote cells, and two operators submitting two plans
// that draw on the same factory pool could each pass a check that was true when they read it and false by the
// time they wrote. A fingerprint cannot close that window on its own: both would compute the SAME fingerprint
// from the SAME pre-write snapshot, so both confirmations would be valid and both plans would commit.
//
// So the guard's read and the status cells are now inside one ScriptLock, and the core keeps its original body.
// A wrapper rather than a rewrite: the core has more than a dozen early returns, and threading a release through
// every one of them is exactly how a lock comes to be leaked on the one path nobody tested.
//
// 30 000 ms matches every other writer in this project (16_, 21_, 12_). A caller that cannot get the lock is told
// to READ BACK rather than retry, because a submit that timed out waiting is indeterminate, not failed.
// ==============================================================================================================
// ==============================================================================================================
// S6-R5 §2/§7 — MAY THIS APPROVED PLAN BE CANCELLED.  __SP_APPROVED_CANCEL_ELIGIBILITY_START__
//
// THE DEFECT THIS CLOSES. An approved plan whose Shipment Draft creation failed had no exit. It could not
// be cancelled (cancel accepted only draft and pending_approval), and it went on holding plan exposure
// against the factory pool for ever, because KMFSG counts `approved` as PLAN_EXPOSURE and releases it only
// on `cancelled` / `completed`. Done refuses a plan that never transferred. Retry was the only door, and a
// retry that keeps failing is not an exit. That is the ghost exposure S6-R2 recorded.
//
// WHY THIS IS A PURE ELIGIBILITY QUESTION AND RELEASES NOTHING. In the frozen model a RESERVATION is owned
// by a shipment and only by a shipment - FSTX_RESERVATION_OWNER_TYPE_ and OVSTX_RESERVATION_OWNER_TYPE_ are
// both 'shipment', and the only two acquire sites in the project pass a shipment_id as the owner. A plan
// never owns one. What a plan owns is EXPOSURE, which KMFSG derives from its status, so cancelling it IS
// the release: there is no quantity for this handler to move and no movement row for it to write. The
// baton is passed exactly once - a transferred plan stops holding exposure in the same moment its shipment
// starts holding a reservation - so there is no window in which both count and none in which neither does.
//
// WHICH IS WHY THE ONLY THING THAT MATTERS HERE IS WHETHER A SHIPMENT EXISTS. If one does, the shipment
// owns the quantity and the plan may not cancel; rollback belongs to the shipment lifecycle. If one does
// not, the plan may cancel and its exposure is released by the status write alone.
//
// AND WHY 'DO NOT KNOW' IS ITS OWN ANSWER. §7 is explicit that an UNKNOWN shipment lookup must not become
// 'the shipment does not exist'. Reading a missing sheet as ABSENT would release the exposure of a plan
// whose shipment is alive and holding a reservation against it. UNKNOWN therefore REFUSES, and says so.
// ==============================================================================================================
var SP_CANCEL_REFUSE_TRANSFERRED_ = 'PLAN_ALREADY_TRANSFERRED_TO_SHIPMENT';
var SP_CANCEL_REFUSE_SHIPMENT_EXISTS_ = 'SHIPMENT_EXISTS_FOR_PLAN';
var SP_CANCEL_REFUSE_SHIPMENT_UNKNOWN_ = 'SHIPMENT_EXISTENCE_UNKNOWN';
var SP_CANCEL_REFUSE_SEAM_MISSING_ = 'SHIPMENT_STATE_SEAM_MISSING';

/**
 * { ok, code, message, shipment_state, shipment_id }. Nothing is written by this function, and it is
 * called before the first setCell on the cancel path.
 */
function spApprovedCancelEligibility_(ss, planId, transferredId, transferredAt) {
  // A MIXED DEPLOYMENT. 11_ is ahead of 12_, so the question cannot be asked at all — which is UNKNOWN,
  // not ABSENT, and is refused for the same reason.
  if (typeof shipmentStateForPlan_ !== 'function') {
    return { ok: false, code: SP_CANCEL_REFUSE_SEAM_MISSING_, shipment_state: 'UNKNOWN', shipment_id: '',
      message: 'SHIPMENT_STATE_SEAM_MISSING — 12_shipment_handlers.gs is not present in this Apps Script '
        + 'project, so whether this plan has a Shipment cannot be determined. The cancellation is refused '
        + 'rather than run on an assumption. Sync 12_shipment_handlers.gs and publish a new deployment.' };
  }
  // The plan's own handoff marker is checked FIRST and is sufficient on its own: a plan that recorded a
  // transfer has handed its exposure over, whatever a later read of the shipments sheet says.
  var marker = String(transferredId || '').trim() || String(transferredAt || '').trim();
  if (marker) {
    return { ok: false, code: SP_CANCEL_REFUSE_TRANSFERRED_, shipment_state: 'EXISTS',
      shipment_id: String(transferredId || '').trim(),
      message: 'PLAN_ALREADY_TRANSFERRED_TO_SHIPMENT — this plan has already handed its quantity to a '
        + 'Shipment. Cancel the Shipment Draft instead; the Shipment lifecycle owns what happens after '
        + 'creation.' };
  }
  // The marker may never have persisted, so its absence proves nothing. Ask the authoritative rows.
  var st = shipmentStateForPlan_(ss, planId);
  if (st.state === SHIPMENT_FOR_PLAN_EXISTS_) {
    return { ok: false, code: SP_CANCEL_REFUSE_SHIPMENT_EXISTS_, shipment_state: st.state,
      shipment_id: st.shipment_id,
      message: 'SHIPMENT_EXISTS_FOR_PLAN — Shipment ' + st.shipment_id + ' was created for this plan, so '
        + 'the plan is no longer the owner of rollback. Cancel the Shipment Draft instead.' };
  }
  if (st.state !== SHIPMENT_FOR_PLAN_ABSENT_) {
    return { ok: false, code: SP_CANCEL_REFUSE_SHIPMENT_UNKNOWN_, shipment_state: st.state, shipment_id: '',
      message: 'SHIPMENT_EXISTENCE_UNKNOWN — whether a Shipment exists for this plan could not be '
        + 'established (' + st.reason + '). Cancelling would release this plan\'s exposure on an '
        + 'assumption, so it is refused. Nothing was written.' };
  }
  return { ok: true, code: '', shipment_state: st.state, shipment_id: '', message: '' };
}
// __SP_APPROVED_CANCEL_ELIGIBILITY_END__

function handleUpdateShippingPlanStatus_(body) { if (typeof editP1Gate15f2_ !== 'function' || typeof editTokWritten15f2_ !== 'function') return jsonResponse_({ success: false, zero_write: true, code: 'DEPLOYMENT_HALF_SYNCED', error: 'This deployment is half updated (11_ needs the R15F2 12_). Nothing was written. Ask the Owner to finish the update.' });   /* R15F2 H-2 */
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock(), locked = false;
  try { locked = lock.tryLock(30000); }
  catch (eLk) {
    return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_ERROR', stage: 'lock',
      error: 'Lock error: ' + (eLk && eLk.message ? eLk.message : eLk) });
  }
  if (!locked) {
    return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_UNAVAILABLE', stage: 'lock',
      error: 'The database is busy with another operation. This request did not write anything. Try again shortly.',
      data: { shipping_plan_id: String((body && body.shipping_plan_id) || '').trim() } });
  }
  SHIP_EDIT_TOKEN_IGNORED_ = '';
  try { return editTagIgnored_(spUpdateShippingPlanStatusCore_(ss, body)); }   // r8: token_ignored reported
  finally { try { lock.releaseLock(); } catch (eRl) { /* best-effort */ } }
}

function spUpdateShippingPlanStatusCore_(ss, body) {
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
  if(typeof wdlBeforeStatus_==='function'){var wdlStatusCode=wdlBeforeStatus_(ss,planId,col('note')<0?'':rowVals[col('note')],transition);if(wdlStatusCode)return wdlNo_(wdlStatusCode,'Reload and verify the Weekly SKU edit before changing status.');}
  // INT-CAND9 r7 (edit conflict): an optional expected_updated_at on a transition (Submit sends it) against the plan row read under the lock
  var p1s_ = editP1Gate15f2_(col('updated_at') === -1 ? undefined : rowVals[col('updated_at')], body && body.expected_updated_at); if (p1s_) return jsonResponse_({ success: false, zero_write: true, code: p1s_.code, stage: 'edit_conflict', error: p1s_.error, data: { shipping_plan_id: planId, transition: transition, current_updated_at: p1s_.data.current_updated_at, current_status: curStatus } });   /* R15F2 P1 */ if (body && body.expected_updated_at != null && String(body.expected_updated_at).trim() !== '' && col('updated_at') !== -1 && editTokSame_(rowVals[col('updated_at')], body.expected_updated_at) === 'DIFF') {   /* r8 (CH8-1) */
    var pCur_ = col('updated_at') !== -1 ? editTok_(rowVals[col('updated_at')]) : '';
    return jsonResponse_({ success: false, zero_write: true, code: 'EDIT_CONFLICT', stage: 'edit_conflict', data: { shipping_plan_id: planId, transition: transition, expected_updated_at: editTok_(body.expected_updated_at), current_updated_at: pCur_, current_status: curStatus },
      error: 'EDIT_CONFLICT: this plan was changed by someone else (now ' + curStatus + ', saved ' + (pCur_ || '?') + ') since you opened it. Nothing was written. Reload the plan, then decide again.' }); }
  // SANDBOX-GATE-1g (review MINOR-1): a carrier / method choice that did not finish is never submitted or approved
  if ((transition === 'submit' || transition === 'approve') && col('carrier_rate_type') !== -1 && String(rowVals[col('carrier_rate_type')]).trim().indexOf(SP_RC_PENDING_1G_) === 0)
    return jsonResponse_({ success: false, zero_write: true, code: 'RATE_CARD_SELECTION_PENDING', stage: 'validation', data: { shipping_plan_id: planId, transition: transition },
      error: 'RATE_CARD_SELECTION_PENDING: the carrier / method choice on this plan did not finish. Nothing was written. Choose the carrier and method again on the Draft.' });
  // AD3-B (Author C request, Owner decisions 2 / 12): a plan whose warehouse To Confirm would refuse (logical WFS row, another platform, 3PL -> 3PL
  // outside C's branch) is not submitted / approved - so no Shipment Draft reserves stock for it. Zero write. The 22_ rules decide (12_ gate).
  if ((transition === 'submit' || transition === 'approve') && typeof shipDestinationDraftGate_ === 'function') {
    var pvAd3_ = function (n) { var c = col(n); return c === -1 ? '' : rowVals[c]; };
    var dgAd3_ = shipDestinationDraftGate_(ss, { company: pvAd3_('company'), country: pvAd3_('country'), marketplace: pvAd3_('marketplace'), source_warehouse_id: pvAd3_('source_warehouse_id'), destination_warehouse_id: pvAd3_('destination_warehouse_id') });
    if (dgAd3_) return jsonResponse_({ success: false, zero_write: true, code: dgAd3_.code, stage: 'validation', data: { shipping_plan_id: planId, transition: transition, reason: dgAd3_.reason, overseas_transfer_check: dgAd3_.check || null },
      error: dgAd3_.reason + ': the plan To cannot be shipped from this From (Confirm would refuse it). Nothing was written; no stock was reserved.' });
  }
  var now = shippingPlanTimestamp_();
  // ============================================================================================================
  // R6-R7-R5-R1 §B — EVERY CELL THIS FUNCTION WRITES IS JOURNALLED, SO IT CAN BE PUT BACK.
  //
  // "The recheck and the write are in the same ScriptLock" is an ISOLATION property. It says no other writer
  // interleaves. It says nothing whatsoever about what is left behind when the third write of five throws, and
  // R5 left something behind: the status cell moved, the audit append threw SCHEMA_NOT_PROVISIONED, the throw
  // was swallowed into `auditRows = -1`, and the plan sat in Pending Approval with an accepted overage that no
  // record justified. A lock cannot fix that. Only a journal can.
  //
  // The journal entry shape is `{ kind, sheet, row, col, prev }` — the SAME entries factoryStockRollbackJournal_
  // (21_) already replays for 12_ and 13_, so a plan transition unwinds through the vocabulary this codebase
  // already has rather than a second one invented here. The replay is fsgRollbackVerified_, which additionally
  // READS EVERY CELL BACK: 21_'s replay swallows its own errors, which is honest only when the caller reports
  // failure regardless, and this caller has to distinguish 'rolled back' from 'could not be rolled back'.
  //
  // A repeated setCell on the same column is safe. Replay runs newest-first, so the OLDEST recorded prev is
  // written last and the cell ends up with the value it had before this function ran.
  // ============================================================================================================
  var spTxn = [];
  function setCell(name, value) {
    var c = col(name); if (c === -1) return;
    spTxn.push({ kind: 'cell', sheet: sheet, row: targetRow, col: c, prev: rowVals[c] });
    sheet.getRange(targetRow, c + 1).setValue(value);
  }

  // Combined-Plan guard: a CHILD (parent_shipping_plan_id points at a Combined Parent) can NOT be submitted /
  // approved / cancelled independently — the Combined Parent owns those actions (§七). transfer is likewise
  // blocked in createShipmentFromApprovedPlan_.
  var pcCol = col('parent_shipping_plan_id');
  var parentRef = pcCol !== -1 ? String(rowVals[pcCol] || '').trim() : '';
  if (parentRef && parentRef !== planId && (transition === 'submit' || transition === 'approve' || transition === 'cancel')) {
    return jsonResponse_({ success: false, error: 'Plan ' + planId + ' is a child of Combined Parent ' + parentRef + ' — submit/approve/cancel via the Combined Parent (or uncombine first).' });
  }

  // ============================================================================================================
  // R6-R7-R5 §4 — THE SHARED FACTORY STOCK GATE, ON THE TRANSITION ITSELF.
  //
  // IT IS HERE, AND NOT IN A `confirmOverage` ACTION OF ITS OWN, BECAUSE §4 REQUIRES THAT AN API CALLER IS
  // GOVERNED BY THE SAME GUARD AS THE MODAL. A separate confirm endpoint would be a second door into the same
  // room: the page would use the guarded one and anything else would walk past it. There is one door.
  //
  // The gate runs ONLY for submit and approve. reject and cancel REDUCE exposure, and a plan that cannot be
  // cancelled because the factory is short is a plan nobody can get rid of.
  //
  // NOTHING IS MUTATED ON A REFUSAL. Every path in fsgGatePlanTransition_ that does not return proceed:true
  // returns a complete response and writes nothing, and it is reached before the first setCell below.
  // ============================================================================================================
  var fsgGate = { proceed: true, audit: null };
  if (transition === 'submit' || transition === 'approve') {
    if (typeof fsgGatePlanTransition_ !== 'function') {
      // A MIXED DEPLOYMENT. 11_ is one round ahead of 71_/90_, and proceeding would leave the transition as
      // unguarded as it was before this round while the operator had every reason to believe otherwise.
      return jsonResponse_({ success: false, zero_write: true, stage: 'inventory_guard',
        code: 'FACTORY_STOCK_GUARD_SEAM_MISSING',
        error: 'FACTORY_STOCK_GUARD_SEAM_MISSING — 71_api_v1_factory_stock_guard.gs is not present in this Apps '
          + 'Script project, so this transition is refused rather than run unguarded.',
        data: { shipping_plan_id: planId, transition: transition,
          next_action: 'Sync 71_api_v1_factory_stock_guard.gs and 90_generated_supply_planning_bundle.gs, then '
            + 'publish a new deployment version.' } });
    }
    // The row status is validated by the branches below; the gate is asked only about inventory. Passing the
    // row itself keeps the gate from re-reading what this function already holds.
    fsgGate = fsgGatePlanTransition_(ss, planId, transition, { shipping_plan_id: planId, status: curStatus }, body);
    if (!fsgGate.proceed) return fsgGate.response;
  }

  // ============================================================================================================
  // R6-R7-R5-R1 §B — THE TRANSACTION BOUNDARY.
  //
  // Everything from the first status cell to the verified audit read-back is ONE unit. If any part of it
  // throws — a status cell, the note, the ledger append, or the read-back that proves they landed — the
  // journal is replayed and VERIFIED, and the caller is told which of the two things happened:
  //
  //   rollback verified      -> OVERRIDE_COMMIT_FAILED_ROLLED_BACK, zero_write: true. Nothing changed.
  //   rollback NOT verified  -> OVERRIDE_COMMIT_INDETERMINATE, zero_write: false, indeterminate: true, and
  //                             the exact cells it could not restore. This is deliberately NOT reported as a
  //                             failure with nothing written, because that would be a claim nobody checked.
  //
  // The Shipment Draft creation is OUTSIDE this boundary and stays outside it. That is a frozen decision (§D):
  // an approval is committed and KEPT even when the shipment cannot be built, and the typed recovery answer
  // below is how that is reported. Rolling an approval back because a downstream draft failed would undo a
  // human decision on account of a machine one.
  // ============================================================================================================
  var spExpectedStatus = transition === 'submit' ? 'pending_approval'
    : (transition === 'approve' ? 'approved' : (transition === 'reject' ? 'draft' : 'cancelled'));
  var overrideAudit = null;
  var spCancelReleasedExposure = false;
  try {
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
      // F1-7N-FC-1A §D.6 A SECOND APPROVE CLICK IS AN IDEMPOTENT READBACK, NOT A FAILURE.
      //
      // An already-approved plan previously answered "Only a Pending Approval plan can be approved (current:
      // approved)", which reads to the operator as though the approval did not happen. The dangerous version of
      // that confusion is the one this round exists to fix: approval committed, shipment creation failed, and the
      // operator clicks Approve again looking for the missing shipment. The truthful answer is the CURRENT state
      // computed from the authoritative rows, so a re-click can never duplicate the approval and can never
      // duplicate the shipment either. Nothing is written on this path.
      if (curStatus === 'approved') {
        // INT-CAND9 (local candidate): the same derivation as the first answer, from the rows. A live draft the plan row names is the healthy
        // case (unchanged answer); a live draft the plan row does not name needs review (R1); no live row: a second click knows no cause, so
        // the outcome is UNKNOWN - never 'not created / nothing reserved / retrying is safe' (R2; also after an I1 books refusal, F-I1-6).
        // Round 3 (review INT9 F3 / F5 / F7): one read (spPlanShipmentEvidence_) also gives the cancelled ids (R3) and legacy-only links; the
        // cause names what was seen; retry_effect is this path's own; one guidance text. Nothing is written here.
        var spEv2 = spPlanShipmentEvidence_(ss, planId), spLive2 = spEv2.live;
        var spMark2 = col('transferred_shipment_id') !== -1 ? String(rowVals[col('transferred_shipment_id')] == null ? '' : rowVals[col('transferred_shipment_id')]).trim() : '';
        var existingShipmentId = spLive2 || '';
        var spRec2 = null;
        if (!(spLive2 && spMark2 === spLive2)) {
          spRec2 = spApprovalRecoveryState_(planId, { reason: 'RESERVATION_OUTCOME_UNKNOWN' }, spLive2);   // the REVIEW shape (retry_idempotent false)
          spRec2.cause = spLive2 ? 'SHIPMENT_PRESENT_WITHOUT_PLAN_MARKER' : (spLive2 === null ? (spEv2.cause || 'SHIPMENTS_UNREADABLE')
            : (spEv2.legacy_ids.length ? 'SHIPMENT_LINKED_ONLY_BY_LEGACY_PLAN_COLUMN' : (spEv2.cancelled_ids.length ? 'ONLY_CANCELLED_SHIPMENT_DRAFTS' : 'CREATION_OUTCOME_NOT_RECORDED')));
          spRec2.basis = 'SECOND_APPROVE_CLICK_READBACK';
          spRec2.cancelled_shipment_ids = spEv2.cancelled_ids.slice(0, 20);
          spRec2.legacy_linked_shipment_ids = spEv2.legacy_ids.slice(0, 20); spRec2.legacy_linked_count = spEv2.legacy_ids.length;
          spRec2.draft_shipment_no = (spLive2 && spEv2.sheet_read && spEv2.sheet_read.col('shipment_no') !== -1) ? String(spEv2.live_row[spEv2.sheet_read.col('shipment_no')] || '').trim() : '';
          spRec2.retry_effect = spLive2 ? 'RECHECK_ONLY_THE_EXISTING_DRAFT_IS_REUSED_OR_REFUSED' : (spLive2 === null ? 'UNKNOWN_THE_SERVER_RECHECKS' : 'MAY_CREATE_A_NEW_DRAFT_IF_THE_BOOKS_AGREE');
          spRec2.retry_location = 'Weekly Shipping Plan -- the Approved plan card carries a "Retry Shipment Draft" action';
          spRec2.message = 'The approval was committed and is kept. ' + (spLive2
            ? 'A Shipment Draft (' + spLive2 + ') exists for this plan, but the plan row does not record it as created: its creation may not have finished cleanly. Review the draft, its lines and the reservation ledger. '
            : (spLive2 === null ? (spEv2.cause === 'NO_PLAN_REFERENCE_COLUMN' ? 'The shipments table has no shipping_plan_id column, so whether a Shipment Draft exists is UNKNOWN. ' : 'The shipments table could not be read, so whether a Shipment Draft exists is UNKNOWN. ')
              : (spEv2.legacy_ids.length ? 'No live Shipment Draft names this plan in shipping_plan_id; ' + spEv2.legacy_ids.length + ' shipment(s) (' + spEv2.legacy_ids.slice(0, 5).join(', ') + ') reference it only through a legacy plan column and are not treated as its draft. '
                : 'No live Shipment Draft row exists for this plan' + (spEv2.cancelled_ids.length ? ' (only cancelled drafts: ' + spEv2.cancelled_ids.slice(0, 5).join(', ') + ')' : '') + ', and whether an earlier attempt left stock or ledger rows behind cannot be confirmed from the rows alone. '))
              + 'The Shipment Draft state is UNKNOWN until reviewed. ')
            + 'Do NOT retry until the owner has reviewed; any retry is re-checked by the server and repairs nothing. The server refuses stock keys whose reservation books disagree.';
        }
        if (spRec2 && !spLive2 && !spMark2 && typeof xcoCleanCancelState_ === 'function') { var xcoK11_ = xcoCleanCancelState_(ss, planId, spEv2); if (xcoK11_) spRec2 = xcoK11_; }   // XCO-R15G B1-MINOR-6
        return jsonResponse_({
          success: true,
          data: {
            shipping_plan_id: planId, transition: 'approve', already_approved: true, approval_committed: true,
            shipment: existingShipmentId ? { created: false, reason: 'already_exists', shipment_id: existingShipmentId } : null,
            execution_commit: existingShipmentId ? 'SHIPMENT_PRESENT' : 'APPROVED_SHIPMENT_CREATION_PENDING',
            recovery: spRec2,
            note: 'This plan was already approved. Nothing was written; the state above is the current truth.'
          }
        });
      }
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
      // SOFT cancel: row + lines are NEVER deleted, and no approved quantity is rewritten to make the
      // transition easier — only the four cells below plus the shared updated_* pair.
      //
      // S6-R5 §0 — APPROVED joins Draft and Pending Approval, on ONE condition: no Shipment exists. That
      // condition is evaluated BEFORE the first setCell, so a refusal cannot leave a partial transition.
      if (curStatus !== 'draft' && curStatus !== 'pending_approval' && curStatus !== 'approved') {
        return jsonResponse_({ success: false, error: 'Only a Draft, Pending Approval or Approved plan can be cancelled (current: ' + curStatus + ')' });
      }
      if (curStatus === 'approved') {
        var spElig = spApprovedCancelEligibility_(ss, planId,
          col('transferred_shipment_id') !== -1 ? rowVals[col('transferred_shipment_id')] : '',
          col('transferred_to_shipment_at') !== -1 ? rowVals[col('transferred_to_shipment_at')] : '');
        if (!spElig.ok) {
          return jsonResponse_({ success: false, zero_write: true, stage: 'cancel_eligibility',
            code: spElig.code, error: spElig.message,
            data: { shipping_plan_id: planId, transition: 'cancel', status_unchanged: curStatus,
              shipment_state: spElig.shipment_state, shipment_id: spElig.shipment_id,
              inventory_unchanged: true, retry_safe: true } });
        }
      }
      setCell('status', 'cancelled');
      setCell('cancelled_by', cancelledBy);
      setCell('cancelled_at', now);
      spCancelReleasedExposure = true;
    }

    setCell('updated_by', updatedBy);
    setCell('updated_at', editNextStamp_(now, [col('updated_at') === -1 ? '' : rowVals[col('updated_at')]]));   // R71 (D4): strictly later than the row's

    // S6-R5 §8 — THE CANCELLATION IS CLAIMED FROM THE ROW, NOT FROM THE ABSENCE OF AN EXCEPTION.
    //
    // A cancel now RELEASES exposure, so 'cancelled' is a claim other readers act on: KMFSG stops counting
    // this plan against the pool the moment the cell says so. Reporting success because setValue did not
    // throw would be exactly the write-truth failure this project has met before — the API accepted it and
    // the sheet does not carry it. The status is READ BACK, and a mismatch is a throw, which lands in the
    // catch below and unwinds through the journal that is already there. No second transaction, no second
    // rollback vocabulary. Scoped to cancel deliberately: submit / approve / reject are unchanged by this
    // round and are not given new failure modes by it.
    if (transition === 'cancel' && col('status') !== -1) {
      var spBack = String(sheet.getRange(targetRow, col('status') + 1).getValue()).trim();
      if (spBack !== 'cancelled') {
        throw new Error('CANCEL_STATUS_READBACK_MISMATCH:' + JSON.stringify({ status_read_back: spBack }));
      }
    }

    // R6-R7-R5-R1 §4.6/§B — THE OVERRIDE AUDIT, IN THE SAME TRANSACTION AS THE STATUS IT JUSTIFIES.
    //
    // Not merely "in the same lock": in the same JOURNAL. The append is handed spTxn, so its rows are entries
    // that a rollback deletes, and its failure is a THROW that reaches the catch below instead of a -1 nobody
    // acts on. The append is also idempotent by row identity, so a replayed confirmation cannot double-write.
    //
    // Two records, deliberately: the append-only ledger is the audit, and the one line on the plan's own note is
    // what makes it findable by someone who does not know the ledger exists. Both are journalled.
    if (fsgGate && fsgGate.audit) {
      if (typeof fsgAppendOverrideAudit_ !== 'function' || typeof fsgRollbackVerified_ !== 'function') {
        throw new Error('FACTORY_STOCK_GUARD_SEAM_MISSING — the override audit writer is not present');
      }
      var ap = fsgAppendOverrideAudit_(ss, 'shipping_plan', planId, transition,
        { company: col('company') !== -1 ? rowVals[col('company')] : '',
          country: col('country') !== -1 ? rowVals[col('country')] : '',
          marketplace: col('marketplace') !== -1 ? rowVals[col('marketplace')] : '' },
        fsgGate.audit,
        { confirmation_token: (fsgGate.confirmation && fsgGate.confirmation.evaluation)
            ? fsgGate.confirmation.evaluation.confirmation_token : '',
          journal: spTxn });
      // A refusal is NOT absorbed. The gate already required the ledger before it honoured the confirmation, so
      // reaching here with !ok means the schema moved under the lock — and that is a failed transaction, not a
      // transition with a missing footnote.
      if (!ap.ok) throw new Error(String(ap.code || 'OVERRIDE_AUDIT_APPEND_REFUSED'));
      if (col('note') !== -1) {
        var noteLine = fsgOverrideNoteLine_(fsgGate.audit);
        if (noteLine) {
          var prevNote = String(rowVals[col('note')] || '').trim();
          var stamped = '[' + noteLine + ' @' + now + ']';
          setCell('note', prevNote ? (prevNote + '\n' + stamped) : stamped);
        }
      }
      // ---- READ IT BACK. A write the API accepted and the sheet does not carry is the failure mode a writer
      // that only watches for exceptions cannot see, and it is the one this project has met more than once.
      var vr = fsgVerifyOverrideCommit_(ss, sheet, targetRow, col('status') + 1, spExpectedStatus,
        planId, transition, fsgGate.audit);
      if (!vr.ok) throw new Error('OVERRIDE_COMMIT_READBACK_FAILED:' + String(vr.code || '') + ' '
        + JSON.stringify({ status_read_back: vr.status_read_back, missing_rows: vr.missing_rows }));
      overrideAudit = { inventory_override: true,
        audit_rows_appended: ap.appended, audit_rows_already_present: ap.skipped_existing,
        audit_rows_expected: ap.expected,
        override_reason: fsgGate.audit.override_reason, override_by: fsgGate.audit.override_by,
        override_at: fsgGate.audit.override_at, total_overage_qty: fsgGate.audit.total_overage_qty,
        inventory_snapshot_fingerprint: fsgGate.audit.inventory_snapshot_fingerprint,
        pools: fsgGate.audit.pools,
        // No longer a guess and no longer -1: the rows were SEARCHED FOR by their own identity after the write.
        audit_persisted: true, audit_readback_verified: true,
        transaction: { journal_entries: spTxn.length, rolled_back: false } };
    }
  } catch (eTxn) {
    // ONE unwind path for every participant. `fsgRollbackVerified_` restores each journalled cell, deletes each
    // appended row, and then READS EVERY ONE OF THEM BACK; `unverified` is what it could not prove.
    var spRb = (typeof fsgRollbackVerified_ === 'function')
      ? fsgRollbackVerified_(spTxn)
      : { ok: false, entries: spTxn.length, restored: 0, deleted: 0,
          unverified: [{ error: 'ROLLBACK_UNAVAILABLE — 71_api_v1_factory_stock_guard.gs is not deployed' }] };
    var spCause = String((eTxn && eTxn.message) ? eTxn.message : eTxn);
    if (spRb.ok) {
      return jsonResponse_({ success: false, zero_write: true, stage: 'transition_transaction',
        code: 'OVERRIDE_COMMIT_FAILED_ROLLED_BACK',
        error: 'OVERRIDE_COMMIT_FAILED_ROLLED_BACK — the transition could not be completed and every write it '
          + 'had made was put back and verified. The plan is exactly as it was. Cause: ' + spCause,
        data: { shipping_plan_id: planId, transition: transition, cause: spCause, rollback: spRb,
          status_unchanged: curStatus, retry_safe: true } });
    }
    // INDETERMINATE. Not a success, and not a clean refusal either — saying zero_write here would be exactly
    // the false claim this round was opened to remove.
    return jsonResponse_({ success: false, zero_write: false, indeterminate: true,
      stage: 'transition_transaction', code: 'OVERRIDE_COMMIT_INDETERMINATE_ROLLBACK_UNVERIFIED',
      error: 'OVERRIDE_COMMIT_INDETERMINATE_ROLLBACK_UNVERIFIED — the transition failed AND the rollback could '
        + 'not be verified. The plan may carry part of a transition. Do NOT retry blindly: read the plan and '
        + 'the override audit ledger, then decide. Cause: ' + spCause,
      data: { shipping_plan_id: planId, transition: transition, cause: spCause, rollback: spRb,
        unverified: spRb.unverified, status_before: curStatus, retry_safe: false,
        next_action: 'Inspect shipping_plans.' + planId + ' and factory_stock_override_audit for entity_id '
          + planId + ' before any further action.' } });
  }
  // EXECUTION COMMIT: approving a plan creates its Shipment Draft (shipments + shipment_lines),
  // copying the Decision Snapshot into the Execution Snapshot (SHIPMENT_CENTER_SPEC §15 step 10;
  // ARCHITECTURE §3A/§4A). Idempotent. A failure here does NOT roll back the approval — the
  // explicit createShipmentFromPlan action can retry.
  var shipmentResult = null;
  if (transition === 'approve') {
    try {
      shipmentResult = createShipmentFromApprovedPlan_(ss, planId, approvedBy, { planJustStamped: true });   // R71 small-4: the status core has just stamped this plan row
    } catch (e) {
      shipmentResult = { created: false, error: String(e && e.message ? e.message : e) };
    }
  }

  // ---- F1-7N-FC-1A §D — THE APPROVE RESULT NO LONGER READS AS "FULLY COMPLETE". --------------------
  // The human Approval is committed and STAYS committed (that decision is frozen in SS0), but a failed
  // automatic Shipment Draft creation is a DIFFERENT outcome from a successful one and must be reported as
  // one. `execution_commit` is the single field a caller binds to, and `recovery` carries the typed cause and
  // where to fix it. Both are derived from the authoritative rows, never from a new stored status column
  // (§D.3/§D.4) -- so a reload shows exactly the same thing without any migration.
  var commitState = 'SHIPMENT_PRESENT';
  var recovery = null;
  if (transition === 'approve') {
    var made = !!(shipmentResult && shipmentResult.created === true);
    var reused = !!(shipmentResult && shipmentResult.created === false && shipmentResult.reason === 'already_exists');
    if (!made && !reused) {
      // INT-CAND6 (local candidate): derived from the ROWS, as section D requires - a creation that failed can still have left a
      // draft (quarantined half draft, a reservation outcome kept as UNKNOWN). null = the rows could not be read.
      var spLive = spLiveShipmentForPlan_(ss, planId);
      commitState = spLive ? 'SHIPMENT_PRESENT' : 'APPROVED_SHIPMENT_CREATION_PENDING';
      recovery = spApprovalRecoveryState_(planId, shipmentResult, spLive);
    }
  } else {
    commitState = 'NOT_APPLICABLE';
  }

  return jsonResponse_({ success: true, data: {
    shipping_plan_id: planId, transition: transition, shipment: shipmentResult,
    // S6-R5 §5 — stated, so 'the hold is gone' is a reported fact rather than something a caller infers
    // from a status. Both numbers are ZERO BY CONSTRUCTION on this path: the exposure is released by the
    // status cell itself, and a plan that owned a reservation would have been refused above.
    cancellation: transition === 'cancel' ? {
      exposure_released: spCancelReleasedExposure, exposure_release_owner: 'KMFSG.PLAN_RELEASED_STATUSES',
      plan_active_exposure: 0, plan_owned_reservation: 0,
      reservation_released_qty: 0, movement_rows_written: 0,
      status_readback_verified: spCancelReleasedExposure
    } : null,
    approval_committed: (transition === 'approve'),
    execution_commit: commitState,
    recovery: recovery,
    // R6-R7-R5 §4 — present on EVERY guarded transition, so "no overage" is a stated fact rather than the
    // absence of a field. null only on reject/cancel, which the gate does not run for.
    inventory_guard: (transition === 'submit' || transition === 'approve') ? {
      evaluated: true,
      overage_present: !!(fsgGate && fsgGate.overage && fsgGate.overage.ok === false),
      inventory_snapshot_fingerprint: (fsgGate && fsgGate.overage)
        ? (fsgGate.overage.inventory_snapshot_fingerprint || null) : null,
      recheck: (fsgGate && fsgGate.recheck) ? { snapshot_unchanged: fsgGate.recheck.snapshot_unchanged,
        silent: fsgGate.recheck.silent, code: fsgGate.recheck.code } : null,
      override: overrideAudit,
      // §B — the transaction that carried this transition, stated on every guarded success.
      transaction: { journalled: true, rolled_back: false,
        readback_verified: !!(overrideAudit && overrideAudit.audit_readback_verified) }
    } : null
  } });
}

/**
 * F1-7N-FC-1A §D — THE RECOVERABLE CONDITION, AS ONE TYPED OBJECT.
 *
 * Built from the two authoritative facts and nothing else: the plan is `approved`, and no shipment row
 * references it. There is deliberately NO new stored status. A status column would be a third copy of a fact
 * two tables already carry, and the one thing every previous round has proved about duplicated state is that
 * it eventually disagrees. Derivation cannot disagree with itself.
 */
// INT-CAND6 (local candidate): the plan's NON-cancelled shipment id, read-only. '' = none; null = the rows could not be read.
function spLiveShipmentForPlan_(ss, planId) {
  try {
    var scLinked = sc13LinkForPlan_(ss, String(planId || '').trim());
    if (scLinked) return scLinked;
    var sh = ss.getSheetByName('shipments');
    if (!sh) return '';
    var t = shipmentReadSheet_(sh), idC = t.col('shipment_id'), pC = t.col('shipping_plan_id'), stC = t.col('status');
    if (pC === -1) return null;
    for (var r = 1; r < t.rows.length; r++) {
      if (String(t.rows[r][pC]).trim() !== String(planId || '').trim()) continue;
      if (stC !== -1 && String(t.rows[r][stC]).trim().toLowerCase() === SHIPMENT_CANCELLED_STATUS_) continue;
      return idC !== -1 ? (String(t.rows[r][idC]).trim() || 'MATCH') : 'MATCH';
    }
    return '';
  } catch (e) { return null; }
}

// INT-CAND9 round 3 (local candidate; review INT9 F2 / F5): what the shipments table says about this plan, from ONE read. live = the first
// non-cancelled row whose shipping_plan_id names the plan (as spLiveShipmentForPlan_ and the create / retry path): '' none, null = unreadable
// or no shipping_plan_id column (cause says which). cancelled_ids: cancelled rows naming the plan. legacy_ids: non-cancelled rows that name
// it ONLY through source_shipping_plan_id / plan_id - counted and reported, never treated as this plan's draft. Read-only.
function spPlanShipmentEvidence_(ss, planId) {
  var ev = { live: '', live_row: null, live_status: '', sheet_read: null, cause: '', cancelled_ids: [], legacy_ids: [] };
  planId = String(planId || '').trim();
  try {
    var sh = ss.getSheetByName('shipments');
    if (!sh) return ev;
    var t = shipmentReadSheet_(sh), idC = t.col('shipment_id'), pC = t.col('shipping_plan_id'), stC = t.col('status');
    var lc = ['source_shipping_plan_id', 'plan_id'].map(function (n) { return t.col(n); }).filter(function (c) { return c !== -1; });
    ev.sheet_read = t;
    for (var r = 1; r < t.rows.length; r++) {
      var row = t.rows[r], st = stC !== -1 ? String(row[stC]).trim().toLowerCase() : '', id = idC !== -1 ? (String(row[idC]).trim() || 'MATCH') : 'MATCH';
      var byMain = (pC !== -1 && String(row[pC]).trim() === planId) || sc13LinkForPlan_(ss, planId) === id;
      var byLegacy = !byMain && (pC === -1 || String(row[pC]).trim() === '') && lc.some(function (c) { return String(row[c]).trim() === planId; });   // round 5 (review CHAIN5 CH5-8): a row naming ANY plan in shipping_plan_id is not legacy-only
      if (!byMain && !byLegacy) continue;
      if (st === SHIPMENT_CANCELLED_STATUS_) { ev.cancelled_ids.push(id); continue; }
      if (byLegacy) { ev.legacy_ids.push(id); continue; }
      ev.live_count = (ev.live_count || 0) + 1; if (!ev.live) { ev.live = id; ev.live_row = row; ev.live_status = st; }   // round 4: live_count (review R4R3 F-R3-4)
    }
    if (pC === -1) { ev.live = null; ev.cause = 'NO_PLAN_REFERENCE_COLUMN'; }
    return ev;
  } catch (e) { ev.live = null; ev.cause = 'SHIPMENTS_UNREADABLE'; ev.error = String(e && e.message ? e.message : e); return ev; }
}

// INT-CAND6: causes after which stock or ledger rows may have changed even when no shipment row is left.
var SP_RECOVERY_RESIDUE_CAUSES_ = ['RESERVATION_OUTCOME_UNKNOWN', 'RESERVATION_ROLLBACK_UNVERIFIED', 'SHIPMENT_DRAFT_INCOMPLETE', 'SHIPMENT_DRAFT_CHECK_FAILED'];

function spApprovalRecoveryState_(planId, shipmentResult, liveShipmentId) {
  var cause = 'UNKNOWN';
  if (shipmentResult) {
    if (shipmentResult.error) cause = String(shipmentResult.error);
    else if (shipmentResult.reason) cause = String(shipmentResult.reason).toUpperCase();
  }
  // INT-CAND6: a draft row present, the rows unreadable, or a cause that can leave residue -> a REVIEW answer that claims nothing
  // it does not know: no 'not created', no 'nothing reserved', no 'retrying is safe'. Otherwise the previous object, unchanged.
  var reasonU = shipmentResult && shipmentResult.reason ? String(shipmentResult.reason).toUpperCase() : '';
  // INT-CAND8 (I1, spec r2 F9): the reservation-books guard refused before any write; a retry is refused the same way until the books agree.
  // INT-CAND8 r5: the create was refused BEFORE any write because the plan has a live shipment linked only through a legacy plan column, or
  // its existing shipment's dispatch state is not consistent in the rows. Nothing was written; a retry is refused the same way.
  if (reasonU === 'LEGACY_LINKED_SHIPMENT_EXISTS' || reasonU === 'DISPATCH_STATE_INCONSISTENT' || reasonU === 'DISPATCH_STATE_UNKNOWN') {   // r6: + UNKNOWN (CH5-6)
    return {
      state: 'SHIPMENT_CREATION_REFUSED_REVIEW_REQUIRED', approval_committed: true, shipment_created: false, review_required: true, cause: reasonU,
      draft_shipment_id: String(shipmentResult.shipment_id || ''), legacy_linked_shipment_ids: shipmentResult.legacy_linked_shipment_ids || [], shipping_plan_id: String(planId || ''),
      retry_action: 'createShipmentFromPlan', retry_location: 'Weekly Shipping Plan -- the Approved plan card carries a "Retry Shipment Draft" action',
      retry_idempotent: false, retry_effect: 'REFUSED_UNTIL_REVIEWED',
      message: 'The approval was committed and is kept. The Shipment Draft was refused before anything was written: '
        + (reasonU === 'LEGACY_LINKED_SHIPMENT_EXISTS' ? 'a live shipment (' + (shipmentResult.legacy_linked_shipment_ids || []).slice(0, 5).join(', ') + ') is linked to this plan only through a legacy plan column, so a new draft would be a second shipment for the plan'
          : 'the existing shipment of this plan (' + String(shipmentResult.shipment_id || '') + ') has a dispatch state that could not be confirmed consistent from its rows')
        + '. Do NOT retry until the owner has reviewed; any retry is re-checked by the server and repairs nothing.'
    };
  }
  if (reasonU === 'RESERVATION_BOOKS_MISMATCH' || reasonU === 'RESERVATION_BOOKS_UNKNOWN') {
    return {
      state: 'RESERVATION_BOOKS_REVIEW_REQUIRED', approval_committed: true, shipment_created: false, review_required: true, cause: reasonU,
      keys_mismatched: shipmentResult.keys_mismatched || [], keys_unknown: shipmentResult.keys_unknown || [], shipping_plan_id: String(planId || ''),
      retry_action: 'createShipmentFromPlan', retry_location: 'Weekly Shipping Plan -- the Approved plan card carries a "Retry Shipment Draft" action',
      retry_idempotent: false, retry_effect: 'REFUSED_UNTIL_THE_BOOKS_AGREE',
      message: 'The approval was committed and is kept. The Shipment Draft was refused before anything was written, because the reservation books of its stock keys '
        + (reasonU === 'RESERVATION_BOOKS_MISMATCH' ? 'disagree' : 'cannot be confirmed') + '. Do not retry: a retry is refused the same way until the books agree. Review these keys with the read-only reservation reconcile.'
    };
  }
  var residue = SP_RECOVERY_RESIDUE_CAUSES_.indexOf(reasonU) >= 0;
  if (liveShipmentId === null || liveShipmentId || (liveShipmentId === '' && residue)) {
    var present = !!liveShipmentId;
    return {
      state: present ? 'SHIPMENT_DRAFT_REVIEW_REQUIRED' : 'SHIPMENT_CREATION_OUTCOME_UNKNOWN',
      approval_committed: true,
      shipment_created: present ? true : null,
      draft_shipment_id: present ? String(liveShipmentId) : '',
      draft_shipment_no: (shipmentResult && shipmentResult.shipment_no) || '',
      review_required: true,
      cause: cause,
      observed: (shipmentResult && (shipmentResult.observed || shipmentResult.gaps || shipmentResult.left)) || null,
      shortfalls: (shipmentResult && shipmentResult.shortfalls) || null,
      shipping_plan_id: String(planId || ''),
      retry_action: 'createShipmentFromPlan',
      retry_idempotent: false,
      retry_effect: present ? 'RECHECK_ONLY' : 'MAY_CREATE_A_NEW_DRAFT',
      message: 'The approval was committed and is kept. ' + (present
        ? 'A Shipment Draft (' + String(liveShipmentId) + ') exists for this plan, but its creation did not finish cleanly (' + cause + '): it may be incomplete. '
        : (liveShipmentId === null ? 'The shipments table could not be read, so whether a Shipment Draft exists is UNKNOWN. '
          : 'No Shipment Draft row is left, but the creation stopped after writes may have landed (' + cause + '): stock or ledger rows may have changed. '))
        + 'Do not retry: a retry repairs nothing. Review the draft, its lines and the reservation ledger first.'
    };
  }
  return {
    state: 'APPROVED_SHIPMENT_CREATION_PENDING',
    approval_committed: true,
    shipment_created: false,
    cause: cause,
    shortfalls: (shipmentResult && shipmentResult.shortfalls) || null,
    shipping_plan_id: String(planId || ''),
    retry_action: 'createShipmentFromPlan',
    retry_location: 'Weekly Shipping Plan -- the Approved plan card carries a "Retry Shipment Draft" action',
    retry_idempotent: true,
    message: 'The approval was committed and is kept. The Shipment Draft was NOT created. Use Retry Shipment ' +
      'Draft on the approved plan card; retrying is safe and can never create two shipments.'
  };
}

// ---- updateShippingPlanLineQty ------------------------------------

/**
 * Edit approved_qty on shipping_plan_lines (Draft only). Recomputes carton_qty from
 * units_per_carton. Body: { lines: [ { shipping_plan_line_id, approved_qty } ] }.
 * Lines whose parent plan is not Draft are skipped (reported).
 */
// INT-CAND9 r7 (review CHAIN7 CH7-4 / CH7-14, edit conflict): a plan-line quantity edit runs under the script lock (the status
// transitions take the same lock), so its 'still Draft' check and its writes cannot interleave with a Submit / approve.
function handleUpdateShippingPlanLineQty_(body) { if (typeof editP1Gate15f2_ !== 'function' || typeof editTokWritten15f2_ !== 'function') return jsonResponse_({ success: false, zero_write: true, code: 'DEPLOYMENT_HALF_SYNCED', error: 'This deployment is half updated (11_ needs the R15F2 12_). Nothing was written. Ask the Owner to finish the update.' });   /* R15F2 H-2 */
  if(body && body.line_edits) return typeof handleWeeklyDraftLines_==='function' ? handleWeeklyDraftLines_(body) : jsonResponse_({success:false,zero_write:true,code:'DEPLOYMENT_HALF_SYNCED',error:'Weekly SKU editor is not installed.'});
  var lock = null, locked = false;
  try { lock = LockService.getScriptLock(); locked = lock.tryLock(30000); }
  catch (eLk) { return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_ERROR', stage: 'lock', error: 'Lock error: ' + (eLk && eLk.message ? eLk.message : eLk) }); }
  if (!locked) return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_UNAVAILABLE', stage: 'lock', error: 'Another change is in progress, so the quantities could not be saved. Nothing was written. Reload the plan, then try again.' });
  SHIP_EDIT_TOKEN_IGNORED_ = '';
  try { return editTagIgnored_(spUpdateLineQtyCore_(body)); }   // r8: token_ignored reported
  finally { try { lock.releaseLock(); } catch (eRl) { /* only the lock taken above */ } }
}
function spUpdateLineQtyCore_(body) {
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

  if(typeof wdlGuard_==='function'){var wdlParent=String(body&&body.shipping_plan_id||'');for(var wdi=1;wdi<planData.length;wdi++)if(String(planData[wdi][pIdCol])===wdlParent){var wdc=wdlGuard_(ss,wdlParent,planHeaders.indexOf('note')<0?'':planData[wdi][planHeaders.indexOf('note')]);if(wdc)return wdlNo_(wdc);}}
  // index line id -> sheet row
  var rowById = {};
  for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };
  if(typeof wdlGuard_==='function'){for(var wqi=0;wqi<reqLines.length;wqi++){var wqref=rowById[String(reqLines[wqi].shipping_plan_line_id||'')];if(!wqref)continue;var wqpid=String(wqref.vals[planIdCol]||'');var wqcode=wdlGuard_(ss,wqpid,'');if(wqcode)return wdlNo_(wqcode);}}

  // INT-CAND9 r7 (edit conflict): optional tokens - expected_plan_updated_at (the plan row) and lines[].expected_updated_at (each line
  // row), compared with the rows read under the lock, ALL before the first write; a mismatch is EDIT_CONFLICT with zero writes. Absent = unchanged.
  var qcf_ = [];
  (function () { var pid = String((body && body.shipping_plan_id) || '').trim(), pu = planHeaders.indexOf('updated_at'), pr = null; for (var i = 1; i < planData.length; i++) if (pIdCol !== -1 && String(planData[i][pIdCol]).trim() === pid) { pr = planData[i]; break; } if (!pr) return; var g = editP1Gate15f2_(pu === -1 ? undefined : pr[pu], body && body.expected_plan_updated_at); if (g) qcf_.push({ shipping_plan_id: pid, reason: g.code, current_updated_at: g.data.current_updated_at }); })();   /* R15F2 P1 */ if (body && body.expected_plan_updated_at != null && String(body.expected_plan_updated_at).trim() !== '') {
    var qPid_ = String(body.shipping_plan_id || '').trim(), qPu_ = planHeaders.indexOf('updated_at'), qPr_ = null;
    for (var qp = 1; qp < planData.length; qp++) if (pIdCol !== -1 && String(planData[qp][pIdCol]).trim() === qPid_) { qPr_ = planData[qp]; break; }
    var qPc_ = qPr_ && qPu_ !== -1 ? editTok_(qPr_[qPu_]) : '';
    if (!qPr_ || (qPu_ !== -1 && editTokSame_(qPr_[qPu_], body.expected_plan_updated_at) === 'DIFF'))   /* r8 (CH8-1) */ qcf_.push({ shipping_plan_id: qPid_, expected_updated_at: editTok_(body.expected_plan_updated_at), current_updated_at: qPc_, current_status: qPr_ && pStatusCol !== -1 ? String(qPr_[pStatusCol]).trim() : '' });
  }
  reqLines.forEach(function (rq) { rq = rq || {}; var p1r_ = rowById[String(rq.shipping_plan_line_id || '').trim()]; if (p1r_) { var p1g_ = editP1Gate15f2_(updatedCol === -1 ? undefined : p1r_.vals[updatedCol], rq.expected_updated_at); if (p1g_) { qcf_.push({ shipping_plan_line_id: String(rq.shipping_plan_line_id || ''), reason: p1g_.code, current_updated_at: p1g_.data.current_updated_at }); return; } }   /* R15F2 P1 */ if (rq.expected_updated_at == null || String(rq.expected_updated_at).trim() === '') return;
    var qRef_ = rowById[String(rq.shipping_plan_line_id || '').trim()], qCur_ = qRef_ && updatedCol !== -1 ? editTok_(qRef_.vals[updatedCol]) : '';
    if (!qRef_ || (updatedCol !== -1 && editTokSame_(qRef_.vals[updatedCol], rq.expected_updated_at) === 'DIFF'))   /* r8 (CH8-1) */ qcf_.push({ shipping_plan_line_id: String(rq.shipping_plan_line_id || ''), expected_updated_at: editTok_(rq.expected_updated_at), current_updated_at: qCur_, current_approved_qty: qRef_ && approvedCol !== -1 ? qRef_.vals[approvedCol] : null }); });
  if (qcf_.length) return jsonResponse_({ success: false, code: 'EDIT_CONFLICT', zero_write: true, data: { conflicts: qcf_ },
    error: (function () { var isP1 = function (c) { return /^EDIT_(TOKEN|VERSION)_/.test(String(c.reason || '')); }, p1 = qcf_.filter(isP1), other = qcf_.filter(function (c) { return !isP1(c); }); return (p1.length ? 'Not saved: this change carried no readable version for ' + p1.map(function (c) { return (c.shipping_plan_line_id || c.shipping_plan_id) + ' (' + c.reason + ')'; }).join('; ') + ', so it cannot be checked against later changes. ' : '') + (other.length ? 'EDIT_CONFLICT: the plan or its lines were changed by someone else since you opened them (' + other.map(function (c) { return (c.shipping_plan_line_id || c.shipping_plan_id) + (c.current_status ? ' now ' + c.current_status : '') + (c.current_approved_qty != null ? ' qty now ' + c.current_approved_qty : '') + ' saved ' + (c.current_updated_at || '?'); }).join('; ') + '). ' : '') + 'Nothing was saved. Reload the plan to see the current values, then make your change again.'; })() });   // R15F2 step 30 (P1-3)
  try {
    var stockEdits={}, stockPlans={}, stockSeen={};
    reqLines.forEach(function(rq){var id=String(rq.shipping_plan_line_id||'').trim(),ref=rowById[id];if(!ref)return;var pid=String(ref.vals[planIdCol]||'');if(statusById[pid]!=='draft')return;
      if(stockSeen[id])throw new Error('WEEKLY_LINE_NOT_UNIQUE');stockSeen[id]=true;
      var qty=Number(rq.approved_qty);if(typeof rq.approved_qty==='boolean'||String(rq.approved_qty==null?'':rq.approved_qty).trim()===''||!isFinite(qty)||Math.floor(qty)!==qty||qty<0||qty>9007199254740991)throw new Error('WEEKLY_QUANTITY_INVALID');
      var obj={};headers.forEach(function(k,c){obj[k]=ref.vals[c];});(stockEdits[pid]=stockEdits[pid]||[]).push({op:'update',line:obj,values:{approved_qty:qty}});
    });
    for(var sp=1;sp<planData.length;sp++){var sid=String(planData[sp][pIdCol]||'');if(stockEdits[sid]){var po={};planHeaders.forEach(function(k,c){po[k]=planData[sp][c];});stockPlans[sid]=po;}}
    Object.keys(stockEdits).forEach(function(pid){
      if(typeof wdlCheckStock_!=='function')throw new Error('DEPLOYMENT_HALF_SYNCED');
      var ls=data.slice(1).filter(function(r){return String(r[planIdCol]||'')===pid;}).map(function(r){var o={};headers.forEach(function(k,c){o[k]=r[c];});return o;});
      wdlCheckStock_(ss,stockPlans[pid],ls,stockEdits[pid]);
    });
  }catch(stockError){return jsonResponse_({success:false,zero_write:true,code:stockError.importCode||String(stockError.message||'WEEKLY_STOCK_UNKNOWN'),error:String(stockError.message||stockError)});}
  var qtyPricing = [];
  try {
    Object.keys(stockEdits).forEach(function (pid) {
      var plan = spRcPlanRow_(ss, pid);
      if (!plan || plan.dup) throw new Error('SHIPPING_PLAN_NOT_UNIQUE');
      if (spRcStr_(plan.v.carrier_rate_type).indexOf(SP_RC_PENDING_1G_) === 0) throw new Error('RATE_CARD_SELECTION_PENDING');
      var edits = {};
      stockEdits[pid].forEach(function (e) { edits[spRcStr_(e.line.shipping_plan_line_id)] = e.values.approved_qty; });
      var nextLines = spRcPlanLines_(ss, pid).map(function (l) {
        var id = spRcStr_(l.shipping_plan_line_id);
        if (!Object.prototype.hasOwnProperty.call(edits, id)) return l;
        var q = edits[id], upc = shippingPlanNum_(l.units_per_carton), cartons = upc > 0 ? Math.ceil(q / upc) : 0;
        return Object.assign({}, l, { approved_qty: q, plan_carton_qty: cartons }, shippingPlanLineLogistics_(logisticsMap[spRcStr_(l.sku)], q, cartons));
      });
      var pricing = spRcPricingSnapshot_(ss, plan.v, nextLines, shippingPlanToday_());
      if (Object.keys(pricing.fields).concat(['updated_at']).some(function (k) { return plan.headers.indexOf(k) < 0; })) throw new Error('SHIPPING_PLAN_COLUMNS_MISSING');
      qtyPricing.push({ plan: plan, pricing: pricing });
    });
  } catch (pricingError) { return spRcNo_(String(pricingError.message || 'RATE_CARD_COST_UNRESOLVED')); }
  var now = shippingPlanTimestamp_();
  // R71 (D4): one stamp for every line written (it is also the returned token), strictly later than each of their current stamps
  if (updatedCol !== -1) now = editNextStamp_(now, reqLines.map(function (q0) { var x0 = rowById[String((q0 || {}).shipping_plan_line_id || '').trim()];
    return x0 && statusById[planIdCol !== -1 ? String(x0.vals[planIdCol]).trim() : ''] === 'draft' ? x0.vals[updatedCol] : ''; }));
  var updated = 0, skipped = 0;
  // An interrupted quantity/quote write must not leave a formerly valid quote looking current.
  qtyPricing.forEach(function (x) { x.plan.sheet.getRange(x.plan.row, x.plan.headers.indexOf('carrier_rate_type') + 1).setValue(SP_RC_PENDING_1G_ + 'QUANTITY'); });
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

  var repriced = qtyPricing.map(function (x) {
    var p = x.plan, fields = x.pricing.fields, stamp = editNextStamp_(now, [p.v.updated_at]);
    Object.keys(fields).forEach(function (k) { if (k !== 'carrier_rate_type') p.sheet.getRange(p.row, p.headers.indexOf(k) + 1).setValue(fields[k]); });
    p.sheet.getRange(p.row, p.headers.indexOf('updated_at') + 1).setValue(stamp);
    p.sheet.getRange(p.row, p.headers.indexOf('carrier_rate_type') + 1).setValue(fields.carrier_rate_type);
    return { shipping_plan_id: p.v.shipping_plan_id, priced: x.pricing.priced, unpriced_reason: x.pricing.unpriced_reason,
      rate_card_id: x.pricing.rate_card_id, updated_at: editTokWritten15f2_(stamp) };
  });

  return jsonResponse_({ success: true, data: { updated: updated, skipped: skipped, updated_at: editTokWritten15f2_(now), repriced_plans: repriced } });
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
// INT-CAND9 round 6 (Owner-approved night scope 3.3; review F-CC-1 / F-CC-2): Done runs under the existing script lock with the approve
// wait budget. Everything Done reads and checks is re-read inside the lock, right up to the completion write. A timeout writes nothing.
function handleCompleteShippingPlan_(body) {
  var lock = null, locked = false;
  try { lock = LockService.getScriptLock(); locked = lock.tryLock(30000); }
  catch (eLk) { return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_ERROR', stage: 'lock', error: 'Lock error: ' + (eLk && eLk.message ? eLk.message : eLk) }); }
  if (!locked) return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_UNAVAILABLE', stage: 'lock', data: { shipping_plan_id: String((body && body.shipping_plan_id) || '').trim() },
    error: 'Another change is in progress, so Done could not start. Nothing was written. Read the plan back, then try again.' });
  try { return spCompleteShippingPlanCore_(body); }
  finally { try { lock.releaseLock(); } catch (eRl) { /* best-effort; only the lock taken above */ } }
}
function spCompleteShippingPlanCore_(body) {
  var planId = String((body && body.shipping_plan_id) || '').trim();
  var actor = String((body && (body.completed_by || body.actor)) || 'system_user').trim();
  if (!planId) return jsonResponse_({ success: false, error: 'Missing shipping_plan_id' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    var linked14 = sc13LinkForPlan_(ss, planId);
    if (linked14) {
      var linkedShip14 = sc13One_(sc13Read_(ss, 'shipments', []).rows, 'shipment_id', linked14);
      sc13AssertReady_(linkedShip14); sc13Verify_(ss, linkedShip14);
    }
  } catch (e14) { return jsonResponse_({ success: false, zero_write: true, code: 'DONE_CONSOLIDATION_REVIEW_REQUIRED' }); }
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

  // INT-CAND9 round 4 (fail-closed on the next operation; BEFORE any Done write): Done refuses, with zero writes, while the plan's live shipment has reservation books
  // that disagree on any key it touches, or a dispatch that is not consistent in the rows (status / movement / routes / events / allocations / PO).
  var dcEv_ = (typeof dnEv !== 'undefined' && dnEv) ? dnEv : spPlanShipmentEvidence_(ss, planId), dcWhy_ = [];
  if (dcEv_.live === null) dcWhy_.push('SHIPMENT_STATE_UNKNOWN ' + (dcEv_.cause || ''));
  if ((dcEv_.live_count || 0) > 1) dcWhy_.push('TWO_OR_MORE_LIVE_SHIPMENTS_NAME_THIS_PLAN ' + dcEv_.live_count);   // review R4R3 F-R3-4
  else if (dcEv_.live) {
    var dcSc_ = dcEv_.sheet_read.col('source_warehouse_id'), dcBk_ = shipmentCancelBooks_(ss, dcEv_.live, dcSc_ !== -1 ? String(dcEv_.live_row[dcSc_] || '').trim() : '');
    if (dcBk_.verdict !== 'RECONCILED') dcWhy_.push('RESERVATION_BOOKS ' + dcBk_.verdict + ' ' + dcBk_.mismatched.concat(dcBk_.unknown).slice(0, 5).join('; '));
    var dcR_ = csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', dcEv_.live), dcE_ = csdEventExists_(ss, dcEv_.live), dcM_ = csdMovementExists_(ss, dcEv_.live), dcD_ = csdIsDispatchedStatus_(dcEv_.live_status);
    if (!dcD_ && (dcR_ > 0 || dcE_ || dcM_)) dcWhy_.push('DISPATCH_EVIDENCE_UNDER_STATUS ' + dcEv_.live_status);
    else if (dcD_) { var dcC_ = csdDispatchConsistency_(ss, dcEv_.live, dcR_, dcE_, dcM_); if (!dcC_.ok) dcWhy_ = dcWhy_.concat(dcC_.why); }
  }
  if (dcWhy_.length) return jsonResponse_({ success: false, code: dcEv_.live === null ? 'DONE_SHIPMENT_STATE_UNKNOWN' : 'DONE_SHIPMENT_REVIEW_REQUIRED', shipping_plan_id: planId, data: { shipment_id: dcEv_.live || '', not_consistent: dcWhy_.slice(0, 20) },
    error: 'Done refused: the plan shipment ' + (dcEv_.live || '') + ' is not consistent (' + dcWhy_.slice(0, 3).join('; ') + '). Nothing was written. The plan stays Approved; review the shipment before marking the plan Done.' });
  // Transfer detection: the plan's own transferred_shipment_id / transferred_to_shipment_at, OR an
  // actual shipments row that references this plan (robust — the transfer metadata may never have
  // persisted). If a shipment exists but the columns are blank, BACKFILL them here.
  var transferredId = col('transferred_shipment_id') !== -1 ? String(rowVals[col('transferred_shipment_id')]).trim() : '';
  var transferredAt = col('transferred_to_shipment_at') !== -1 ? String(rowVals[col('transferred_to_shipment_at')]).trim() : '';
  if (!transferredId && !transferredAt) {
    // INT-CAND9 round 3 (local candidate; review INT9 F2): the backfill writes the plan marker only for a LIVE draft that names this plan in
    // shipping_plan_id and is proven: dispatched, or complete (shipmentDraftGaps_, the check the retry uses) with reservation books that
    // agree for every key it holds (shipmentCancelBooks_, the I1 guard). UNKNOWN, only cancelled / legacy-linked drafts, an incomplete
    // draft or books that do not agree -> a typed refusal, nothing written. (Plain 'no shipment at all' keeps its old answer below.)
    var dnEv = spPlanShipmentEvidence_(ss, planId), dnWhy = '', dnObs = null;
    if (dnEv.live === null) dnWhy = 'DONE_SHIPMENT_STATE_UNKNOWN';
    else if (!dnEv.live) { if (dnEv.cancelled_ids.length || dnEv.legacy_ids.length) dnWhy = 'DONE_NO_LIVE_SHIPMENT_DRAFT'; }
    else if (SHIPMENT_DISPATCHED_STATUSES_.indexOf(dnEv.live_status) < 0) {
      var dnLs = ss.getSheetByName('shipping_plan_lines'), dnGaps;
      try { dnGaps = dnLs ? shipmentDraftGaps_(ss, planId, dnEv.live, dnEv.live_row, dnEv.sheet_read, dnLs) : ['PLAN_LINES_SHEET_MISSING']; }
      catch (eDG) { dnGaps = ['DRAFT_CHECK_FAILED: ' + String(eDG && eDG.message ? eDG.message : eDG)]; }
      if (dnGaps.length) { dnWhy = 'DONE_SHIPMENT_REVIEW_REQUIRED'; dnObs = { gaps: dnGaps.slice(0, 20) }; }
      else {
        var dnSc = dnEv.sheet_read.col('source_warehouse_id'), dnBk = shipmentCancelBooks_(ss, dnEv.live, dnSc !== -1 ? String(dnEv.live_row[dnSc] || '').trim() : '');
        if (dnBk.verdict !== 'RECONCILED') { dnWhy = 'DONE_SHIPMENT_REVIEW_REQUIRED'; dnObs = { books: dnBk.verdict, keys_mismatched: dnBk.mismatched, keys_unknown: dnBk.unknown }; }
      }
    }
    if (dnWhy) {
      return jsonResponse_({ success: false, code: dnWhy, shipping_plan_id: planId,
        data: { shipment_id: dnEv.live || '', cause: dnEv.cause || '', cancelled_shipment_ids: dnEv.cancelled_ids.slice(0, 20), legacy_linked_shipment_ids: dnEv.legacy_ids.slice(0, 20), observed: dnObs },
        error: 'Done refused: ' + (dnWhy === 'DONE_SHIPMENT_STATE_UNKNOWN' ? 'whether this plan has a Shipment Draft is UNKNOWN (' + (dnEv.cause || 'SHIPMENTS_UNREADABLE') + ').'
          : dnWhy === 'DONE_NO_LIVE_SHIPMENT_DRAFT' ? 'this plan has no live Shipment Draft (cancelled: ' + (dnEv.cancelled_ids.join(', ') || 'none') + '; linked only through a legacy plan column: ' + (dnEv.legacy_ids.join(', ') || 'none') + ').'
          : 'Shipment Draft ' + dnEv.live + ' is not recorded on the plan and could not be proven complete with agreeing reservation books.')
          + ' Nothing was written. The plan stays Approved; review it before marking it Done.' });
    }
    if (dnEv.live) {
      transferredId = dnEv.live;
      transferredAt = now;
      setCell('transferred_shipment_id', dnEv.live);
      setCell('transferred_to_shipment_at', now);
    }
  }
  if (!transferredId && !transferredAt) {
    return jsonResponse_({ success: false, error: 'Plan has not been transferred to a Shipment Draft yet (Execution Commit required before Done).' });
  }

  setCell('completed_at', now);
  setCell('completed_by', actor);
  setCell('updated_by', actor);
  setCell('updated_at', editNextStamp_(now, [col('updated_at') === -1 ? '' : rowVals[col('updated_at')]]));   // R71 small-3 (review m1)

  return jsonResponse_({ success: true, data: { shipping_plan_id: planId, completed_at: now, completed_by: actor, transferred_shipment_id: transferredId } });
}

// ---- appendShippingPlanNote ---------------------------------------

/**
 * Append a note to shipping_plans.note (append-only history). Body: { shipping_plan_id, note, actor? }.
 * - Preserves all existing notes (never overwrites).
 * - Never touches rejected_reason (that remains the formal rejection field).
 */
// INT-CAND9 r8 (CH8-5): the note append under the script lock (a reject writes note from the row it read under the same lock)
function handleAppendShippingPlanNote_(body) {
  var lock = null, locked = false;
  try { lock = LockService.getScriptLock(); locked = lock.tryLock(30000); }
  catch (eLk) { return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_ERROR', stage: 'lock', error: 'Lock error: ' + (eLk && eLk.message ? eLk.message : eLk) }); }
  if (!locked) return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_UNAVAILABLE', stage: 'lock', error: 'Another change is in progress, so the note could not be added. Nothing was written. Try again.' });
  try { return spAppendShippingPlanNoteCore_(body); }
  finally { try { lock.releaseLock(); } catch (eRl) { /* only the lock taken above */ } }
}
function spAppendShippingPlanNoteCore_(body) {
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
  if (updatedCol !== -1) sheet.getRange(targetRow, updatedCol + 1).setValue(editNextStamp_(now, [rowVals[updatedCol]]));   // R71 small-4 (re-review m1b)

  return jsonResponse_({ success: true, data: { shipping_plan_id: planId } });
}


// ============================================================================================================
// SANDBOX-GATE-1f — WEEKLY PLAN RATE CARD (carrier -> method -> server price). Draft only. The plan's REAL lane: destination country,
// marketplace (MULTI -> whole-plan cards), destination warehouse code (a warehouse destination), customs type, battery class of its SKUs,
// validity today. Pricing is shipmentExactRateAndCost_ over the plan's own totals (gross weight / CBM / cartons / qty) - the same engine
// the Shipment uses. Persisted into the plan header's existing columns; nothing is invented, nothing is shown that the server did not price.
// ============================================================================================================
function spRcStr_(v) { return String(v == null ? '' : v).trim(); }
function spRcPlanRow_(ss, planId) {
  var sh = ss.getSheetByName('shipping_plans'); if (!sh) return null;
  var d = sh.getDataRange().getValues(), h = d[0].map(function (x) { return spRcStr_(x); }), c = h.indexOf('shipping_plan_id'), hit = null;
  for (var i = 1; i < d.length; i++) if (spRcStr_(d[i][c]) === planId) { if (hit) return { dup: true }; var o = {}; h.forEach(function (k, j) { o[k] = d[i][j]; }); hit = { row: i + 1, sheet: sh, headers: h, v: o }; }
  return hit;
}
function spRcPlanLines_(ss, planId) {
  var sh = ss.getSheetByName('shipping_plan_lines'); if (!sh) return [];
  return shippingPlanReadObjects_(sh).filter(function (l) { return spRcStr_(l.shipping_plan_id) === planId; });
}
function spRcDestCode_(ss, p) {
  var wid = spRcStr_(p.destination_warehouse_id); if (!wid) return '';
  var sh = ss.getSheetByName('warehouses'); if (!sh) return '';
  var rows = shippingPlanReadObjects_(sh).filter(function (w) { return spRcStr_(w.warehouse_id).toLowerCase() === wid.toLowerCase(); });
  return rows.length === 1 ? spRcStr_(rows[0].warehouse_code) : '';
}
function spRcTotals_(lines) {
  var t = { gw: 0, cbm: 0, cartons: 0, qty: 0, items: [] }, unk = {};   // R15C-AGL: one blank line makes that total unknown (''), never 0
  var add = function (k, v) { var n = spRcTierNumber_(v); if (n !== null) t[k] += n; else unk[k] = 1; };
  lines.forEach(function (l) {
    var q = shippingPlanNum_(spRcStr_(l.approved_qty) !== '' ? l.approved_qty : l.requested_qty);
    add('gw', l.gross_weight); add('cbm', l.cbm); add('cartons', spRcStr_(l.plan_carton_qty) !== '' ? l.plan_carton_qty : l.carton_qty); t.qty += q;
    t.items.push({ sku: spRcStr_(l.sku), qty: q });
  });
  Object.keys(unk).forEach(function (k) { t[k] = ''; });
  if (!lines.length) t.gw = t.cbm = t.cartons = '';
  return t;
}
// Only the threshold and its price vary within a tier ladder. Distinct service/lane/terms stay choices.
function spRcTierKey_(c) {
  return JSON.stringify(['carrier_id', 'origin_country', 'origin_city', 'destination_country', 'destination_city',
    'destination_postal_code_start', 'destination_postal_code_end', 'destination_warehouse_code', 'marketplace',
    'shipping_method', 'last_mile_delivery', 'currency', 'customs_type', 'battery_type', 'transit_type',
    'charge_type', 'charge_unit', 'dim_divisor', 'min_box_weight', 'min_box_weight_unit', 'min_charge',
    'fuel_surcharge', 'customs_fee', 'doc_fee', 'import_duty_treatment'].map(function (k) { return k === 'carrier_id' ? spRcStr_(c[k]) : spRcStr_(c[k]).toLowerCase(); }));
}
function spRcTierNumber_(v) {
  if (typeof v === 'boolean' || spRcStr_(v) === '') return null;
  var n = Number(v); return isFinite(n) && n >= 0 ? n : null;
}
function spRcTierWeightKg_(c, tot) {
  // Display eligibility uses the existing physical gross-kg snapshot. Freight remains engine-owned.
  // Dimensional/min-box fields are distinct terms, not a reason to hide an otherwise eligible card.
  return spRcTierNumber_(tot.gw);
}
function spRcApplicableTiers_(cards, tot) {
  var best = {}, eligible = [];
  (cards || []).forEach(function (c) {
    var tier = spRcStr_(c.weight_tier) === '' ? 0 : spRcTierNumber_(c.weight_tier);
    var unit = spRcStr_(c.weight_tier_unit).toLowerCase(), weight = spRcTierWeightKg_(c, tot);
    if (tier === null || weight === null || (tier > 0 && unit !== 'kg' && unit !== 'lb')) return;
    if (unit === 'lb') tier /= 2.20462; // Same kg/lb conversion as shippingFreight_.
    if (tier > weight) return;
    var key = spRcTierKey_(c);
    if (best[key] == null || tier > best[key]) best[key] = tier;
    eligible.push({ card: c, key: key, tier: tier });
  });
  return eligible.filter(function (e) { return e.tier === best[e.key]; }).map(function (e) { return e.card; });
}
// A blank card axis covers a stated plan preference; a blank plan never matches a specific card implicitly.
function spRcLastMileMatches_(cardLast, planLast) {
  var card = spRcStr_(cardLast).toLowerCase(), plan = spRcStr_(planLast).toLowerCase();
  return !card || card === plan;
}
function spRcUniqueService_(ss, p, cards) {
  var seen = {}, choices = [], method = spRcMethod15_(p.shipping_method), last = spRcStr_(p.last_mile_delivery).toLowerCase();
  // A plan without an intended method is not enough evidence to choose a service.
  if (!method || typeof shipCarrierCheck_ !== 'function') return null;
  (cards || []).forEach(function (c) {
    if (spRcMethod15_(c.shipping_method) !== method || (last && !spRcLastMileMatches_(c.last_mile_delivery, last))) return;
    var carrier = shipCarrierCheck_(ss, spRcStr_(c.carrier_id)); if (!carrier.ok) return;
    var effectiveLast = spRcStr_(p.last_mile_delivery) || spRcStr_(c.last_mile_delivery);
    var key = JSON.stringify([spRcStr_(c.carrier_id), method, effectiveLast.toLowerCase()]);
    if (seen[key]) return; seen[key] = true;
    choices.push({ carrier_id: spRcStr_(c.carrier_id), shipping_method: method, last_mile_delivery: effectiveLast });
  });
  return choices.length === 1 ? choices[0] : null;
}
function spRcPricingSnapshot_(ss, p, lines, day, lane) {
  var fields = { carrier_unit_rate: '', carrier_rate_type: '', import_duty_treatment: '', currency: '',
    estimated_freight_cost: '', estimated_duty: '', estimated_duty_currency: '', estimated_customs_fee: '', estimated_total_cost: '' };
  lane = lane || spRcLaneCards_(ss, p, lines, day);
  var fit = lane.cards.filter(function (c) { return spRcStr_(c.carrier_id) === spRcStr_(p.carrier_id)
    && spRcMethod15_(c.shipping_method) === spRcMethod15_(p.shipping_method)
    && spRcLastMileMatches_(c.last_mile_delivery, p.last_mile_delivery); });
  var why = !spRcStr_(p.carrier_id) ? 'NO_CARRIER' : !fit.length ? 'NO_APPLICABLE_CARD' : fit.length > 1 ? 'CARD_CHOICE_REQUIRED' : '';
  if (!why && !spRcStr_(p.customs_type) && (typeof shipCustomsApplicability_ !== 'function'
      || shipCustomsApplicability_(ss, p, { allow_planned_destination: true }).applicable !== false)) why = 'PLAN_CUSTOMS_REQUIRED';
  if (!why) {
    var c = fit[0], q = spRcStr_(c.shipping_method_label) ? spRcQuote_(ss, p, c, lines, spRcTotals_(lines), day, lane.origin, lane) : null;
    if (!q || q.rateCardId !== spRcStr_(c.rate_card_id) || !shippingQuoteComplete_(q)) why = 'RATE_CARD_COST_UNRESOLVED';
    else fields = { carrier_unit_rate: c.unit_rate, carrier_rate_type: spRcStr_(c.charge_type), import_duty_treatment: spRcStr_(c.import_duty_treatment), currency: q.currency,
      estimated_freight_cost: q.estimatedFreightCost, estimated_duty: q.estimatedDuty, estimated_duty_currency: q.estimatedDutyCurrency,
      estimated_customs_fee: q.estimatedCustomsFee, estimated_total_cost: q.estimatedTotalCost };
  }
  return { fields: fields, priced: !why, unpriced_reason: why, rate_card_id: !why ? spRcStr_(fit[0].rate_card_id) : '' };
}
function spRcLaneCards_(ss, p, lines, day) {   // WK1 r3 (D-6): + the plan's origin country (its From warehouse); unresolved -> nothing listed or priced
  var org = spRcOrigin15_(ss, p);
  if (!org) return { cards: [], unclassified: [], origin: '', originUnresolved: true };
  var bc = shipBatteryClass_(ss, lines.map(function (l) { return spRcStr_(l.sku); }));
  if (bc.unclassified.length) return { cards: [], unclassified: bc.unclassified };
  var mk = spRcStr_(p.marketplace), multi = mk.toUpperCase() === 'MULTI';
  var dest = shipRateDestination_(ss, p);
  var estimate = !spRcStr_(p.destination_warehouse_id) && !dest.code && !dest.city && !dest.postal && !spRcSetMembers15e_(p.country);
  var c = shippingMatchRateCards_(ss, { originCountry: org, destinationCountry: p.country, shippingMethod: '', lastMile: '', customsType: spRcStr_(p.customs_type),
    marketplace: multi ? 'MULTI' : mk, destinationWarehouseCode: shipRateDestination_(ss, p).code,
    destinationCity: dest.city, destinationPostalCode: dest.postal, batteryType: bc.cls, quoteDate: day }, !estimate);
  c = c.filter(function (x) { return !spRcStr_(x.marketplace) || spRcStr_(x.marketplace).toLowerCase() === mk.toLowerCase(); });
  c = multi ? c.filter(function (x) { return spRcStr_(x.marketplace) === ''; }) : c;
  c = spRcApplicableTiers_(c, spRcTotals_(lines));
  if (estimate) {
    var carrierSheet = ss.getSheetByName('carriers'), activeCarriers = carrierSheet ? shippingPlanReadObjects_(carrierSheet).filter(function (r) { return !/^(inactive|disabled|false|0)$/i.test(spRcStr_(r.status || r.is_active)); }) : [];
    c = c.filter(function (r) { return spRcStr_(r.shipping_method_label) && spRcTierNumber_(r.unit_rate) !== null && Number(r.unit_rate) >= 0
      && activeCarriers.filter(function (a) { return spRcStr_(a.carrier_id) === spRcStr_(r.carrier_id); }).length === 1; });
    // Stable representative per service, not a cheapest-carrier recommendation.
    var seen = {};
    c = c.slice().sort(function (a, b) { return spRcStr_(a.rate_card_id).localeCompare(spRcStr_(b.rate_card_id)); }).filter(function (x) {
      var key = JSON.stringify([x.carrier_id, spRcMethod15_(x.shipping_method), spRcStr_(x.last_mile_delivery).toLowerCase()]);
      if (seen[key]) return false; seen[key] = true; return true;
    });
  }
  return { cards: c, unclassified: [], origin: org, estimate_only: estimate };
}
function spRcQuote_(ss, p, rc, lines, tot, day, org, lane) {   // WK1 r3 (D-6): priced only with the plan's origin; no origin -> not priced
  lane = lane || spRcLaneCards_(ss, p, lines, day);
  if (!spRcStr_(org) || !lane.cards.some(function (c) { return spRcStr_(c.rate_card_id) === spRcStr_(rc.rate_card_id); })
      || ['weight', 'volume', 'carton', 'shipment', 'container'].indexOf(spRcStr_(rc.charge_type).toLowerCase()) < 0)
    return { rateCardId: '', currency: '', estimatedFreightCost: '', estimatedDuty: '', estimatedCustomsFee: '', estimatedTotalCost: '', estimatedUnitCost: '' };
  var dest = lane.estimate_only ? { code: spRcStr_(rc.destination_warehouse_code), city: spRcStr_(rc.destination_city), postal: spRcStr_(rc.destination_postal_code_start) } : shipRateDestination_(ss, p);
  return shipmentExactRateAndCost_(ss, { originCountry: spRcStr_(org), planRateCardId: spRcStr_(rc.rate_card_id), carrierId: spRcStr_(rc.carrier_id), country: p.country, marketplace: p.marketplace,
    shippingMethod: spRcStr_(rc.shipping_method), lastMile: spRcStr_(rc.last_mile_delivery), importDutyTreatment: spRcStr_(rc.import_duty_treatment) /* R15F2 duty (i): the card's own value only */,
    destinationWarehouseCode: dest.code, destinationCity: dest.city,
    destinationPostalCode: dest.postal, quoteDate: day, grossWeightKg: tot.gw, cbm: tot.cbm, cartons: tot.cartons, totalQty: tot.qty, lines: tot.items });
}
// WK1 (Weekly unified Save): the customs a request asks for, validated against the lane customs list (12_ sc13PlanLaneOptions_, i.e. the
// carrier_rate_cards customs codes); returns { plan } = the plan row as it would be priced with that customs (a COPY - nothing is written).
function spRcWk1Customs_(ss, p, body) {
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'customs_type')) return { ok: true, plan: p, asked: false };
  var cx = spRcStr_(body.customs_type);
  var na4 = (typeof shipCustomsApplicability_ === 'function') ? shipCustomsApplicability_(ss, p, { allow_planned_destination: true }) : { applicable: true };
  if (na4.applicable === false) { if (!cx || cx === spRcStr_(p.customs_type)) return { ok: true, plan: p, asked: false, customs_type: spRcStr_(p.customs_type), label: spRcStr_(p.customs_type), customs_not_applicable: true }; return { ok: false, code: 'PLAN_CUSTOMS_NOT_APPLICABLE' }; }   // Preserve old stored values, including on the explicit-service save path.
  if (!cx) return { ok: false, code: 'PLAN_CUSTOMS_REQUIRED' };
  var list = (typeof sc13PlanLaneOptions_ === 'function') ? (sc13PlanLaneOptions_(ss, p).customs || []) : null;
  if (!list) return { ok: false, code: 'PLAN_CUSTOMS_LIST_UNAVAILABLE' };
  var hit = list.filter(function (o) { return o.id === cx; }); if (hit.length !== 1) return { ok: false, code: 'PLAN_CUSTOMS_NOT_VALID' };
  return { ok: true, plan: Object.assign({}, p, { customs_type: cx }), asked: true, customs_type: cx, label: hit[0].label };
}
function spRcWk1CardCheck_(ss, p0, curOpt, org) {   // WK1 r3 (review R2-M1 + Owner card identity): never picks a card; reports what is known
  var low = function (v) { return spRcStr_(v).toLowerCase(); };
  var same = function (a, b) { a = spRcStr_(a); b = spRcStr_(b); return a === b || (a !== '' && b !== '' && isFinite(Number(a)) && isFinite(Number(b)) && Number(a) === Number(b)); };
  var terms = function (c) { return spRcStr_(c.carrier_id) === spRcStr_(p0.carrier_id) && low(c.shipping_method) === low(p0.shipping_method) && spRcLastMileMatches_(c.last_mile_delivery, p0.last_mile_delivery)
    && same(c.unit_rate, p0.carrier_unit_rate) && spRcStr_(c.charge_type) === spRcStr_(p0.carrier_rate_type) && (low(c.customs_type) === '' || low(c.customs_type) === low(p0.customs_type))
    && (spRcStr_(c.currency) === '' || spRcStr_(c.currency) === spRcStr_(p0.currency)) && (spRcStr_(c.destination_country) === '' || low(c.destination_country) === low(p0.country)) && (spRcStr_(c.origin_country) === '' || low(c.origin_country) === low(org)); };
  var table = shippingReadRateCards_(ss).filter(terms);   // every card with the saved terms - any status / validity / destination code / battery / threshold
  var live = curOpt.filter(terms);   // the ones that apply to this plan today
  var money = function (a, b) { return spRcTierNumber_(a) !== null && spRcTierNumber_(b) !== null && Math.round(Number(a) * 100) === Math.round(Number(b) * 100); };
  var rep = live.filter(function (o) {
    var q = o.quote;
    if (!q || !q.priced || spRcStr_(p0.currency) !== q.currency || spRcStr_(p0.estimated_duty_currency) !== (q.duty_currency || q.currency)
        || !money(p0.estimated_freight_cost, q.freight) || !money(p0.estimated_duty, q.duty) || !money(p0.estimated_customs_fee, q.customs_fee)) return false;
    return q.split_currency ? spRcStr_(p0.estimated_total_cost) === '' : money(p0.estimated_total_cost, q.total);
  });
  var status = !live.length ? 'NO_CURRENT_CARD' : live.length > 1 ? 'AMBIGUOUS' : table.length > 1 ? (rep.length === 1 ? 'CURRENT_EQUIVALENT' : 'AMBIGUOUS') : 'UNIQUE';
  return { status: status, basis: 'SAVED_TERMS_NO_CARD_ID', cards_with_saved_terms: table.length, applicable_with_saved_terms: live.length, cost_reproduced: rep.length > 0,
    rate_card_id: (status === 'UNIQUE' && rep.length === 1) ? spRcStr_(rep[0].rate_card_id) : '' };
}
// WK1 r3 (Owner): a customs-only change SAVES and re-validates the quote in one lock. The current carrier / method / last mile is re-matched
// under the new customs: exactly one applicable card -> re-priced with it; none or several -> the cost fields are cleared (explicitly UNPRICED,
// the old cost is never kept as valid; several = the user must choose - never the first card). Never writes destination_* (no warehouse).
function spRcWk1CustomsOnly_(body) { if (typeof editP1Gate15f2_ !== 'function' || typeof editTokWritten15f2_ !== 'function' || typeof shipWriteReadStage_ !== 'function') return jsonResponse_({ success: false, zero_write: true, code: 'DEPLOYMENT_HALF_SYNCED', error: 'This deployment is half updated (11_ needs the R15F2 12_). Nothing was written. Ask the Owner to finish the update.' });   /* R15F2 H-2 */
  var planId = spRcStr_(body.shipping_plan_id), actor = spRcStr_(body.actor || body.updated_by) || 'operation-system';
  if (!planId || !Object.prototype.hasOwnProperty.call(body, 'expected_current_carrier_id')) return spRcNo_('CUSTOMS_SAVE_INCOMPLETE');
  if (spRcStr_(body.rate_card_id) !== '') return spRcNo_('CUSTOMS_SAVE_WITH_CARD', { correction: 'a card choice is saved by the unified Save' });
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return spRcNo_('LOCK_TIMEOUT', { retryable: true }); } catch (e) { return spRcNo_('LOCK_TIMEOUT', { retryable: true }); }
  try {
    var readStageS2 = shipWriteReadStage_(SpreadsheetApp.getActiveSpreadsheet(), ['shipping_plans', 'shipping_plan_lines', 'sku_details', 'warehouses', 'carrier_rate_cards', 'carrier_lead_times', 'tax_referral_rates', 'tax_rate_components']); // CODEX-S2: after lock
    var ss = readStageS2.ss, r = spRcPlanRow_(ss, planId), day = shippingPlanToday_();
    if (!r || r.dup) return spRcNo_(r ? 'SHIPPING_PLAN_DUPLICATED' : 'SHIPPING_PLAN_NOT_FOUND');
    if (r.headers.indexOf('estimated_duty_currency') < 0) return spRcNo_('DUTY_CURRENCY_COLUMN_REQUIRED', { needs: 'shipping_plans.estimated_duty_currency' });
    var p0 = r.v, st = spRcStr_(p0.status).toLowerCase();
    if (st !== 'draft') return spRcNo_('SHIPPING_PLAN_NOT_EDITABLE', { status: st });
    if (r.headers.indexOf('updated_at') !== -1 && spRcStr_(body.expected_updated_at) === '') return spRcNo_('EXPECTED_UPDATED_AT_REQUIRED', { correction: 're-read the plan, then choose again' });
    if (spRcStr_(body.expected_updated_at) !== '' && r.headers.indexOf('updated_at') !== -1 && editTokSame_(p0.updated_at, body.expected_updated_at) !== 'SAME')
      return spRcNo_('EDIT_CONFLICT', { stage: 'edit_conflict', data: { shipping_plan_id: planId, current_updated_at: editTok_(p0.updated_at) } });
    if (spRcStr_(body.expected_current_carrier_id) !== spRcStr_(p0.carrier_id)) return spRcNo_('RATE_CARD_SELECTION_CONFLICT', { current_carrier_id: spRcStr_(p0.carrier_id) });
    // The real client omits blank customs. Waive it only after reading the saved lane inside the lock.
    if (!Object.prototype.hasOwnProperty.call(body, 'customs_type')) {
      if (body.service_only !== true || typeof shipCustomsApplicability_ !== 'function' || shipCustomsApplicability_(ss, p0, { allow_planned_destination: true }).applicable !== false) return spRcNo_('CUSTOMS_SAVE_INCOMPLETE');
      body = Object.assign({}, body, { customs_type: '' });
    }
    var exp15 = body.service_only === true && body.explicit_service === true;   // AD3-B (Owner 10): an explicit service, not derived from cards
    var cxs = (exp15 && spRcStr_(body.customs_type) === spRcStr_(p0.customs_type)) ? { ok: true, plan: p0, asked: true, customs_type: spRcStr_(p0.customs_type), label: spRcStr_(p0.customs_type) } : spRcWk1Customs_(ss, p0, body); if (!cxs.ok) return spRcNo_(cxs.code);
    var p = cxs.plan, curC = spRcStr_(p0.carrier_id), curM = spRcStr_(p0.shipping_method).toLowerCase(), curL = spRcStr_(p0.last_mile_delivery).toLowerCase();
    if (body.service_only === true) { curC = spRcStr_(body.carrier_id); curM = spRcStr_(body.shipping_method).toLowerCase(); curL = spRcStr_(body.last_mile_delivery).toLowerCase(); }
    if (exp15) { var ex15 = spRcExplicitService_(ss, p0, body); if (ex15.code) return spRcNo_(ex15.code, ex15.more); curC = ex15.c; curM = ex15.m; curL = ex15.l; }
    var lines = spRcPlanLines_(ss, planId), tot = spRcTotals_(lines), lane = spRcLaneCards_(ss, p, lines, day);
    if (lane.originUnresolved) return spRcNo_('PLAN_ORIGIN_COUNTRY_UNRESOLVED', { correction: 'the plan From warehouse has no country - no rate card is listed or priced' });
    if (lane.unclassified.length && exp15) lane = { cards: [], unclassified: [], origin: lane.origin };   // AD3-B: battery unknown -> the explicit service stays, only the quote is undecidable (unpriced)
  if (lane.unclassified.length) return spRcNo_('RATE_CARD_BATTERY_UNCLASSIFIED');
    if (body.service_only === true && !exp15 && !spRcServiceAllowed15_(ss, p, lines, lane, day, curC, curM, curL)) return spRcNo_('PLAN_SERVICE_NOT_APPLICABLE');
    var fit = curC ? lane.cards.filter(function (c) { return spRcStr_(c.carrier_id) === curC && spRcStr_(c.shipping_method).toLowerCase() === curM && spRcLastMileMatches_(c.last_mile_delivery, curL); }) : [];
    var rc = null, q = null, why = !curC ? 'NO_CARRIER' : !fit.length ? 'NO_APPLICABLE_CARD' : fit.length > 1 ? 'CARD_CHOICE_REQUIRED' : '';
    if (!why) { rc = fit[0]; q = spRcStr_(rc.shipping_method_label) ? spRcQuote_(ss, p, rc, lines, tot, day, lane.origin, lane) : null;
      if (!q || q.rateCardId !== spRcStr_(rc.rate_card_id) || !shippingQuoteComplete_(q)) { why = q ? 'RATE_CARD_COST_UNRESOLVED' : 'RATE_CARD_LABEL_BLANK'; rc = null; q = null; } }
    var w = rc ? { carrier_unit_rate: (rc.unit_rate === '' || rc.unit_rate == null) ? '' : rc.unit_rate, carrier_rate_type: spRcStr_(rc.charge_type), currency: q.currency,
        estimated_freight_cost: q.estimatedFreightCost, estimated_duty: q.estimatedDuty, estimated_duty_currency: q.estimatedDutyCurrency, estimated_customs_fee: q.estimatedCustomsFee, estimated_total_cost: q.estimatedTotalCost }
      : { carrier_unit_rate: '', carrier_rate_type: '', estimated_freight_cost: '', estimated_duty: '', estimated_duty_currency: '', estimated_customs_fee: '', estimated_total_cost: '' };   // explicitly UNPRICED
    if (body.service_only === true) { w.carrier_id = curC; w.shipping_method = curM; w.last_mile_delivery = curL; }
    w.customs_type = cxs.customs_type; w.updated_by = actor; w.updated_at = editNextStamp_(shippingPlanTimestamp_(), [p0.updated_at]);
    var miss = Object.keys(w).filter(function (k) { return r.headers.indexOf(k) === -1 && k !== 'updated_by'; });
    if (miss.length) return spRcNo_('SHIPPING_PLAN_COLUMNS_MISSING', { columns: miss });
    readStageS2.close(); // CODEX-S2: BEFORE PENDING, writes and readback
    var n = 0;
    try {   // the same PENDING flow as the unified Save: mark, write, clear the mark, read back
      var cRt = r.headers.indexOf('carrier_rate_type');
      r.sheet.getRange(r.row, cRt + 1).setValue(SP_RC_PENDING_1G_ + 'CUSTOMS'); n++;
      Object.keys(w).forEach(function (k) { if (k === 'carrier_rate_type') return; var c = r.headers.indexOf(k); if (c !== -1) { n++; r.sheet.getRange(r.row, c + 1).setValue(w[k]); } });
      r.sheet.getRange(r.row, cRt + 1).setValue(w.carrier_rate_type); n++;
      SpreadsheetApp.flush();
      var b = spRcPlanRow_(ss, planId).v;
      var bad = ['customs_type', 'estimated_duty_currency', 'estimated_duty', 'estimated_freight_cost', 'estimated_customs_fee', 'estimated_total_cost', 'carrier_rate_type'].concat(body.service_only === true ? ['carrier_id', 'shipping_method', 'last_mile_delivery'] : []).concat(rc ? ['currency'] : []).filter(function (k) { return shipRcCanon_(b[k]) !== shipRcCanon_(w[k]); });
      if (bad.length) return jsonResponse_({ success: false, code: 'RATE_CARD_SELECTION_UNVERIFIED', error: 'RATE_CARD_SELECTION_UNVERIFIED', zero_write: false, writes: n, data: { fields: bad } });
    } catch (eW) { return jsonResponse_({ success: false, code: 'RATE_CARD_SELECTION_INTERRUPTED', error: 'RATE_CARD_SELECTION_INTERRUPTED', zero_write: n === 0, writes: n }); }
    return jsonResponse_({ success: true, verified: true, customs_only: true, explicit_service: exp15, quote_state: rc ? 'PRICED' : 'COST_PENDING', shipping_plan_id: planId, customs_type: cxs.customs_type, customs_type_label: cxs.label, carrier_id: curC,
      shipping_method: curM, last_mile_delivery: curL, priced: !!rc, unpriced_reason: why, rate_card_id: rc ? spRcStr_(rc.rate_card_id) : '', shipping_method_label: rc ? spRcStr_(rc.shipping_method_label) : '', currency: rc ? q.currency : '',
      estimated_total_cost: w.estimated_total_cost, updated_at: editTokWritten15f2_(w.updated_at), writes: n });   // R15F2: as a read would return it
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}
function spRcOrigin15_(ss, plan) {
  var id = spRcStr_(plan.source_warehouse_id || plan.ship_from), sh = ss.getSheetByName('warehouses');
  if (!id || !sh) return '';
  var rows = shippingPlanReadObjects_(sh).filter(function(w) { return spRcStr_(w.warehouse_id) === id; });
  return rows.length === 1 ? spRcStr_(rows[0].country) : '';
}
function spRcMethod15_(value) {
  var s = spRcStr_(value).toLowerCase();
  return ({ 'sea express': 'sea_express', 'sea_express': 'sea_express', 'sea': 'sea', 'air freight': 'air', 'air': 'air', 'express': 'express', 'truck': 'truck', 'rail': 'rail' })[s] || s;
}
function spRcServices15_(ss, p, lines, lane, day) {
  var low = function (v) { return spRcStr_(v).toLowerCase(); }, names = {}, out = [], seen = {};
  var cs = ss.getSheetByName('carriers');
  if (!cs) throw new Error('CARRIER_TABLE_UNAVAILABLE');
  shippingPlanReadObjects_(cs).forEach(function (c) { if (!/^(inactive|disabled|false|0)$/i.test(spRcStr_(c.status || c.is_active))) names[low(c.carrier_id)] = { id: spRcStr_(c.carrier_id), name: spRcStr_(c.carrier_name) }; });
  var set15e = spRcSetMembers15e_(p.country), byKey15e = {};   // R15C-EU: the plan country is a planning set -> the member countries' union
  function add(c, m, l, label, ct) {
    m = spRcMethod15_(m);
    l = spRcStr_(l) || spRcStr_(p.last_mile_delivery);
    var car = names[low(c)]; if (!car || !spRcStr_(m)) return;
    var key = JSON.stringify([low(c),low(m),low(l)]);
    if (set15e) { ct = spRcStr_(ct).toUpperCase(); var o0 = byKey15e[key]; if (o0) { if (ct && o0.destination_countries.indexOf(ct) === -1) { o0.destination_countries.push(ct); o0.destination_countries.sort(); o0.lead_time.by_country[ct] = shipLt1g_(ss,car.id,m,l,lane.origin,ct); } return; } }
    if(seen[key]) return; seen[key]=true;
    var o15e = { service_only:true, rate_card_id:'', rate_card_version:'', carrier_id:car.id, carrier_name:car.name,
      shipping_method:spRcStr_(m), shipping_method_label:spRcStr_(label)||spRcStr_(m), last_mile_delivery:spRcStr_(l),
      quote:{priced:false}, lead_time: set15e ? { state:'REGION_UNDETERMINED', reason:'the destination is a planning set; the transit time is the chosen warehouse country\'s', by_country:{} } : shipLt1g_(ss,car.id,m,l,lane.origin,p.country) };
    if (set15e) { o15e.destination_set = spRcStr_(p.country).toUpperCase(); o15e.destination_countries = ct ? [ct] : []; o15e.quote.reason = 'NOT_PRICED_UNTIL_WAREHOUSE'; if (ct) o15e.lead_time.by_country[ct] = shipLt1g_(ss,car.id,m,l,lane.origin,ct); byKey15e[key] = o15e; }
    out.push(o15e);
  }
  // Broad service discovery is NOT pricing: exact warehouse/city/postal constraints remain in lane.cards and in Save.
  var bc = shipBatteryClass_(ss,lines.map(function(l){return spRcStr_(l.sku);}));
  if (bc.unclassified.length || !lane.origin) return [];
  (set15e || [p.country]).forEach(function (dc15e) { shippingRateMatch_(ss,{mode:'rough',originCountry:lane.origin,destinationCountry:dc15e,customsType:spRcStr_(p.customs_type),batteryType:bc.cls,quoteDate:day}).forEach(function(c){
    if (spRcStr_(c.marketplace) && low(c.marketplace)!==low(p.marketplace)) return;
    add(c.carrier_id,c.shipping_method,c.last_mile_delivery,c.shipping_method_label,dc15e);
  }); });   // R15C-EU: one rough match per member country (the card keeps its own country; nothing is priced here)
  var ls=ss.getSheetByName('carrier_lead_times');
  if(ls) shippingPlanReadObjects_(ls).forEach(function(l){
    if(low(l.origin_country)!==low(lane.origin)||(set15e ? set15e.indexOf(spRcStr_(l.destination_country).toUpperCase())===-1 : low(l.destination_country)!==low(p.country))||/^(inactive|disabled|false|0)$/i.test(spRcStr_(l.status))||(typeof shipLtActive_==='function'&&!shipLtActive_(l))) return;   // R15C-EU; AD3-B: is_active FALSE (e.g. Codex's owner_estimate drafts) is never a service option
    if(![l.avg_days,l.min_days,l.max_days].some(function(v){return spRcStr_(v)!==''&&isFinite(Number(v))&&Number(v)>0;})) return;
    add(l.carrier_id,l.shipping_method,l.last_mile_delivery,l.shipping_method_label,l.destination_country);
  });
  return out;
}
function spRcDisplayOptions15_(ss,p,lines,lane,day,priced,names) {
  var key=function(o){return JSON.stringify([spRcStr_(o.carrier_id).toLowerCase(),spRcStr_(o.shipping_method).toLowerCase(),spRcStr_(o.last_mile_delivery).toLowerCase()]);};
  var have={}; priced.forEach(function(o){have[key(o)]=true;});
  return priced.concat(spRcServices15_(ss,p,lines,lane,day).filter(function(o){return !have[key(o)];}));
}
function spRcServiceAllowed15_(ss,p,lines,lane,day,c,m,l) {
  var low=function(v){return spRcStr_(v).toLowerCase();};
  return spRcServices15_(ss,Object.assign({},p,{last_mile_delivery:l}),lines,lane,day).some(function(o){return low(o.carrier_id)===low(c)&&low(o.shipping_method)===low(m)&&spRcLastMileMatches_(o.last_mile_delivery,l);});
}

function spRcNo_(code, more) { return jsonResponse_(Object.assign({ success: false, code: code, error: code, zero_write: true }, more || {})); }
function handleShippingPlanRateCardOptions_(body) {
  var planId = spRcStr_(body && body.shipping_plan_id); if (!planId) return spRcNo_('SHIPPING_PLAN_ID_REQUIRED');
  var ss = shipRateReadView_(SpreadsheetApp.getActiveSpreadsheet()), r = spRcPlanRow_(ss, planId), day = shippingPlanToday_();
  if (!r || r.dup) return spRcNo_(r ? 'SHIPPING_PLAN_DUPLICATED' : 'SHIPPING_PLAN_NOT_FOUND');
  var p0 = r.v, cxv = spRcWk1Customs_(ss, p0, body); if (!cxv.ok) return spRcNo_(cxv.code);   // WK1: optional read-only customs preview
  var p = cxv.plan, lines = spRcPlanLines_(ss, planId), tot = spRcTotals_(lines), lane = spRcLaneCards_(ss, p, lines, day);
  if (lane.originUnresolved) return spRcNo_('PLAN_ORIGIN_COUNTRY_UNRESOLVED', { correction: 'the plan From warehouse has no country - no rate card is listed or priced' });
  if (lane.unclassified.length) return spRcNo_('RATE_CARD_BATTERY_UNCLASSIFIED', { lines: lane.unclassified.length });
  var names = {}, cs = ss.getSheetByName('carriers'); if (cs) shippingPlanReadObjects_(cs).forEach(function (c) { names[spRcStr_(c.carrier_id)] = spRcStr_(c.carrier_name); });
  var org1g = shipOriginCountry1g_(ss, p.source_warehouse_id || p.ship_from);   // SANDBOX-GATE-1g
  var opts = lane.cards.map(function (c) {
    var q = spRcQuote_(ss, p, c, lines, tot, day, lane.origin, lane);
    return { rate_card_id: spRcStr_(c.rate_card_id), rate_card_version: shipRateCardVersion_(c), carrier_id: spRcStr_(c.carrier_id), carrier_name: names[spRcStr_(c.carrier_id)] || '',
      shipping_method: spRcStr_(c.shipping_method), shipping_method_label: spRcStr_(c.shipping_method_label), last_mile_delivery: spRcStr_(c.last_mile_delivery) || spRcStr_(p.last_mile_delivery), customs_type: spRcStr_(c.customs_type),
      estimate_only: !!lane.estimate_only, estimate_basis: lane.estimate_only ? 'COUNTRY_SERVICE' : '',
      charge_type: spRcStr_(c.charge_type), unit_rate: c.unit_rate, weight_tier: c.weight_tier, weight_tier_unit: spRcStr_(c.weight_tier_unit), effective_from: spRcStr_(c.effective_from), effective_to: spRcStr_(c.effective_to),
      quote: { cost_unknown: q.costUnknown || '', priced: q.rateCardId === spRcStr_(c.rate_card_id) && shippingQuoteComplete_(q), duty_currency: q.estimatedDutyCurrency || '', split_currency: !!q.splitCurrency, tax_reason: q.taxReason || '', currency: q.currency, freight: q.estimatedFreightCost, duty: q.estimatedDuty, customs_fee: q.estimatedCustomsFee, total: q.estimatedTotalCost, unit_cost: q.estimatedUnitCost },
      lead_time: shipLt1g_(ss, c.carrier_id, c.shipping_method, spRcStr_(c.last_mile_delivery) || spRcStr_(p.last_mile_delivery), org1g, p.country) };
  });
  var curC = spRcStr_(p0.carrier_id), curM = spRcStr_(p0.shipping_method), curL = spRcStr_(p0.last_mile_delivery);
  var curOpt = opts.filter(function (o) { return o.carrier_id === curC && o.shipping_method.toLowerCase() === curM.toLowerCase() && spRcLastMileMatches_(o.last_mile_delivery, curL); });
  var stored = { carrier_id: curC, shipping_method: curM, last_mile_delivery: curL, currency: spRcStr_(p0.currency), freight: p0.estimated_freight_cost, duty: p0.estimated_duty, duty_currency: spRcStr_(p0.estimated_duty_currency),
    customs_fee: p0.estimated_customs_fee, total: p0.estimated_total_cost, carrier_unit_rate: p0.carrier_unit_rate, carrier_rate_type: spRcStr_(p0.carrier_rate_type), customs_type: spRcStr_(p0.customs_type) };
  var priced = curC && spRcStr_(p0.estimated_duty_currency) !== '' && shippingTaxNumber_(p0.estimated_duty) !== null && shippingTaxNumber_(p0.estimated_freight_cost) !== null;
  var cc = (curC && priced && curOpt.length) ? spRcWk1CardCheck_(ss, p0, curOpt, lane.origin) : null;   // WK1 r3: what is known about the saved card
  var available15 = spRcDisplayOptions15_(ss, p, lines, lane, day, opts, names);
  var hasService15 = available15.some(function(o) { return o.carrier_id === curC && o.shipping_method === curM && spRcLastMileMatches_(o.last_mile_delivery, curL); });
  var preview = cxv.asked && cxv.customs_type !== spRcStr_(p0.customs_type);   // WK1: a customs that is not the stored one is a PREVIEW
  var state = (spRcStr_(p0.carrier_rate_type).indexOf(SP_RC_PENDING_1G_) === 0) ? 'PENDING' : preview ? 'PREVIEW_CUSTOMS' : !curC ? 'NONE' : (!priced && hasService15) ? 'NOT_PRICED' : !curOpt.length ? 'NOT_APPLICABLE' : !priced ? 'NOT_PRICED'
    : !cc.cost_reproduced ? 'NEEDS_REPRICING' : (cc.status === 'UNIQUE' || cc.status === 'CURRENT_EQUIVALENT') ? 'PRICED' : 'COST_SAVED_CARD_UNVERIFIED';   // A current equivalent verifies today's quote, not the unrecorded historical card identity.
  return jsonResponse_({ success: true, shipping_plan_id: planId, estimate_only: !!lane.estimate_only, quote_date: day, status: spRcStr_(p0.status), editable: spRcStr_(p0.status).toLowerCase() === 'draft',
    service_vocabulary: (typeof shipServiceVocabulary_ === 'function') ? shipServiceVocabulary_(ss) : null,   // AD3-B: explicit service choices (carriers master + server vocabulary), never derived from cards
    preview_customs_type: cxv.asked ? cxv.customs_type : null, lane: sc13PlanLaneOptions_(ss, p0), totals: { gross_weight: tot.gw, cbm: tot.cbm, cartons: tot.cartons, qty: tot.qty }, current: Object.assign({ state: state, lead_time: shipLt1g_(ss, curC, curM, curL, org1g, p.country), cost_saved: !!priced, card_check: cc || { status: 'NOT_CHECKED', basis: 'SAVED_TERMS_NO_CARD_ID' } }, stored), options: available15 });
}
function handleShippingPlanSelectRateCard_(body) { if (typeof editP1Gate15f2_ !== 'function' || typeof editTokWritten15f2_ !== 'function' || typeof shipWriteReadStage_ !== 'function') return jsonResponse_({ success: false, zero_write: true, code: 'DEPLOYMENT_HALF_SYNCED', error: 'This deployment is half updated (11_ needs the R15F2 12_). Nothing was written. Ask the Owner to finish the update.' });   /* R15F2 H-2 */
  if (body && body.save_lane === true) return spRcNo_('PLAN_SAVE_ROUTE_RETIRED', { correction: 'the Weekly Save route is retired; the To is never written from Weekly and the actual warehouse is chosen in Shipment Draft' });   // WK1 r2 (review M-2)
  if (body && (body.customs_only === true || body.service_only === true)) return spRcWk1CustomsOnly_(body);   // WK1 r3 (Owner): a customs-only change saves and re-validates the quote
  var planId = spRcStr_(body && body.shipping_plan_id), id = spRcStr_(body && body.rate_card_id), ver = spRcStr_(body && body.rate_card_version), actor = spRcStr_(body && (body.actor || body.updated_by)) || 'operation-system';
  if (!planId || !id || !ver || !body.hasOwnProperty('expected_current_carrier_id')) return spRcNo_('RATE_CARD_SELECTION_INCOMPLETE');
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return spRcNo_('LOCK_TIMEOUT', { retryable: true }); } catch (e) { return spRcNo_('LOCK_TIMEOUT', { retryable: true }); }
  try {
    var readStageS2 = shipWriteReadStage_(SpreadsheetApp.getActiveSpreadsheet(), ['shipping_plans', 'shipping_plan_lines', 'sku_details', 'warehouses', 'carrier_rate_cards', 'carrier_lead_times', 'tax_referral_rates', 'tax_rate_components']); // CODEX-S2: after lock
    var ss = readStageS2.ss, r = spRcPlanRow_(ss, planId), day = shippingPlanToday_();
    if (!r || r.dup) return spRcNo_(r ? 'SHIPPING_PLAN_DUPLICATED' : 'SHIPPING_PLAN_NOT_FOUND');
    if (r.headers.indexOf('estimated_duty_currency') < 0) return spRcNo_('DUTY_CURRENCY_COLUMN_REQUIRED', { needs: 'shipping_plans.estimated_duty_currency' });
    var p = r.v, st = spRcStr_(p.status).toLowerCase();
    if (st !== 'draft') return spRcNo_('SHIPPING_PLAN_NOT_EDITABLE', { status: st });
    if (r.headers.indexOf('updated_at') !== -1 && spRcStr_(body.expected_updated_at) === '') return spRcNo_('EXPECTED_UPDATED_AT_REQUIRED', { correction: 're-read the plan, then choose again' });   // SANDBOX-GATE-1g (review MINOR-2)
    if (body.expected_updated_at != null && spRcStr_(body.expected_updated_at) !== '' && r.headers.indexOf('updated_at') !== -1 && editTokSame_(p.updated_at, body.expected_updated_at) !== 'SAME')
      return spRcNo_('EDIT_CONFLICT', { stage: 'edit_conflict', data: { shipping_plan_id: planId, current_updated_at: editTok_(p.updated_at) } });
    if (spRcStr_(body.expected_current_carrier_id) !== spRcStr_(p.carrier_id)) return spRcNo_('RATE_CARD_SELECTION_CONFLICT', { current_carrier_id: spRcStr_(p.carrier_id) });
    var rows = shippingReadRateCards_(ss).filter(function (x) { return spRcStr_(x.rate_card_id) === id; });
    if (rows.length !== 1) return spRcNo_(rows.length ? 'RATE_CARD_DUPLICATED' : 'RATE_CARD_NOT_FOUND');
    var rc = rows[0];
    if (shipRateCardVersion_(rc) !== ver) return spRcNo_('RATE_CARD_CHANGED', { correction: 'reload the options and choose again' });
    var cxs = spRcWk1Customs_(ss, p, body); if (!cxs.ok) return spRcNo_(cxs.code);   // WK1: validated INSIDE the lock
    var p0 = p; p = cxs.plan;   // from here on the rate card applicability and the quote use the requested customs
    if (!spRcStr_(rc.shipping_method_label)) return spRcNo_('RATE_CARD_LABEL_BLANK');
    var lines = spRcPlanLines_(ss, planId), tot = spRcTotals_(lines), lane = spRcLaneCards_(ss, p, lines, day);
    if (lane.originUnresolved) return spRcNo_('PLAN_ORIGIN_COUNTRY_UNRESOLVED', { correction: 'the plan From warehouse has no country - no rate card is listed or priced' });
  if (lane.unclassified.length) return spRcNo_('RATE_CARD_BATTERY_UNCLASSIFIED');
    if (!lane.cards.some(function (x) { return spRcStr_(x.rate_card_id) === id; })) return spRcNo_('RATE_CARD_NOT_APPLICABLE');
    var q = spRcQuote_(ss, p, rc, lines, tot, day, lane.origin, lane);
    if (q.rateCardId !== id || !shippingQuoteComplete_(q)) return spRcNo_('RATE_CARD_COST_UNRESOLVED');
    var w = { carrier_id: spRcStr_(rc.carrier_id), shipping_method: spRcStr_(rc.shipping_method), last_mile_delivery: spRcStr_(rc.last_mile_delivery) || spRcStr_(p.last_mile_delivery),
      carrier_unit_rate: (rc.unit_rate === '' || rc.unit_rate == null) ? '' : rc.unit_rate, carrier_rate_type: spRcStr_(rc.charge_type), currency: q.currency,
      estimated_freight_cost: q.estimatedFreightCost, estimated_duty: q.estimatedDuty, estimated_duty_currency: q.estimatedDutyCurrency, estimated_customs_fee: q.estimatedCustomsFee, estimated_total_cost: q.estimatedTotalCost,
      updated_by: actor, updated_at: editNextStamp_(shippingPlanTimestamp_(), [p0.updated_at]) };
    if (cxs.asked) w.customs_type = cxs.customs_type;   // WK1: the customs is written with the cost it was priced with - never destination_* fields
    var miss = Object.keys(w).filter(function (k) { return r.headers.indexOf(k) === -1 && k !== 'updated_by'; });
    if (miss.length) return spRcNo_('SHIPPING_PLAN_COLUMNS_MISSING', { columns: miss });
    readStageS2.close(); // CODEX-S2: BEFORE PENDING, writes and readback
    var n = 0;
    try {
      // SANDBOX-GATE-1g (review MINOR-1): phase 1 marks the row PENDING, phase 2 writes the choice and its cost, phase 3 clears the mark.
      // An interruption leaves PENDING_SELECTION: the options read says PENDING and Submit / Approve refuse the plan.
      var cRt = r.headers.indexOf('carrier_rate_type');
      r.sheet.getRange(r.row, cRt + 1).setValue(SP_RC_PENDING_1G_ + id); n++;
      Object.keys(w).forEach(function (k) { if (k === 'carrier_rate_type') return; var c = r.headers.indexOf(k); if (c !== -1) { n++; r.sheet.getRange(r.row, c + 1).setValue(w[k]); } });
      r.sheet.getRange(r.row, cRt + 1).setValue(w.carrier_rate_type); n++;
      SpreadsheetApp.flush();
      var b = spRcPlanRow_(ss, planId).v;
      var bad = ['carrier_id', 'shipping_method', 'last_mile_delivery', 'currency', 'estimated_duty_currency', 'estimated_duty', 'estimated_freight_cost', 'estimated_customs_fee', 'estimated_total_cost', 'carrier_rate_type'].concat(cxs.asked ? ['customs_type'] : []).filter(function (k) { return shipRcCanon_(b[k]) !== shipRcCanon_(w[k]); });
      if (bad.length) return jsonResponse_({ success: false, code: 'RATE_CARD_SELECTION_UNVERIFIED', error: 'RATE_CARD_SELECTION_UNVERIFIED', zero_write: false, writes: n, data: { fields: bad } });
    } catch (eW) { return jsonResponse_({ success: false, code: 'RATE_CARD_SELECTION_INTERRUPTED', error: 'RATE_CARD_SELECTION_INTERRUPTED', zero_write: n === 0, writes: n }); }
    return jsonResponse_({ success: true, verified: true, shipping_plan_id: planId, rate_card_id: id, carrier_id: w.carrier_id, shipping_method: w.shipping_method,
      shipping_method_label: spRcStr_(rc.shipping_method_label), last_mile_delivery: w.last_mile_delivery, currency: w.currency, estimated_freight_cost: w.estimated_freight_cost,
      estimated_duty: w.estimated_duty, estimated_duty_currency: w.estimated_duty_currency, estimated_customs_fee: w.estimated_customs_fee, estimated_total_cost: w.estimated_total_cost, estimated_unit_cost: q.estimatedUnitCost,
      customs_type: spRcStr_(p.customs_type), customs_type_label: cxs.asked ? cxs.label : '',
      updated_at: editTokWritten15f2_(w.updated_at), writes: n });   // R15F2: as a read would return it
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

var SP_RC_PENDING_1G_ = 'PENDING_SELECTION:';   // SANDBOX-GATE-1g (review MINOR-1)
// AD3-B (Owner 8 / 9 / 10): the explicit service of a Weekly plan - carrier from the carriers master (exists once, active), method / last mile from the
// server vocabulary (12_ shipServiceVocabulary_), or a DOMESTIC delivery type SPD / LTL. -> { c, m, l } | { code, more }. Never derived from rate cards.
function spRcExplicitService_(ss, p, body) {
  if (typeof shipServiceVocabulary_ !== 'function' || typeof shipCarrierCheck_ !== 'function') return { code: 'DEPLOYMENT_HALF_SYNCED', more: { correction: '11_ needs the AD3 12_ (service vocabulary)' } };
  var c = spRcStr_(body.carrier_id), m = spRcStr_(body.shipping_method), l = spRcStr_(body.last_mile_delivery), dt = spRcStr_(body.delivery_type).toUpperCase(), V = shipServiceVocabulary_(ss);
  var cc = shipCarrierCheck_(ss, c); if (!cc.ok) return { code: c ? cc.code : 'CARRIER_REQUIRED', more: { carrier_id: c, carrier_state: cc.state } };
  if (dt) {
    var d = V.delivery_type.filter(function (x) { return x.value === dt; })[0]; if (!d) return { code: 'DELIVERY_TYPE_UNKNOWN' };
    var oc = spRcOrigin15_(ss, p).toUpperCase(), dw = spRcStr_(p.destination_warehouse_id), dc = (dw ? spRcStr_(shipOriginCountry1g_(ss, dw)) : spRcStr_(p.country)).toUpperCase();
    if (!oc || !dc) return { code: 'DELIVERY_TYPE_COUNTRY_UNKNOWN', more: { missing_field: !oc ? 'source_warehouse_id.country' : 'destination country' } };
    if (oc !== dc) return { code: 'DELIVERY_TYPE_DOMESTIC_ONLY', more: { origin_country: oc, destination_country: dc } };
    if ((m && m !== d.shipping_method) || (l && l !== d.last_mile_delivery)) return { code: 'DELIVERY_TYPE_CONFLICT' };
    m = d.shipping_method; l = d.last_mile_delivery;
  }
  if (!shipSvcInVocab_(V, 'shipping_method', m)) return { code: 'SHIPPING_METHOD_NOT_IN_VOCABULARY', more: { value: m } };
  if (!shipSvcInVocab_(V, 'last_mile_delivery', l)) return { code: 'LAST_MILE_NOT_IN_VOCABULARY', more: { value: l } };
  var dw2 = spRcStr_(p.destination_warehouse_id), cap = shipSvcCapabilityCheck_(ss, c, m, l, spRcOrigin15_(ss, p), dw2 ? spRcStr_(shipOriginCountry1g_(ss, dw2)) : spRcStr_(p.country));   // AD3-B (Owner supplement 1)
  if (cap) return { code: cap.code, more: { message: cap.message, allowed: cap.allowed } };
  return { c: c, m: m.toLowerCase(), l: l.toLowerCase() };
}

// R15F-11 (sbx-r15f): patched
// R15F2-11 (sbx-r15f2 step 22): patched
// R15F2-P1-11 (sbx-r15f2 step 26): patched
// R15F2-P1B-11 (sbx-r15f2 step 30): patched
// R15F2-STAMPS (sbx-r15f2 step 23): patched

// R15C-EU-11 (sbx-r15c-eu): patched
// R15C-EU: the members of a planning set from the ONE server definition (KMCID, the 90_ bundle); null = not a set (or a bundle without it).
function spRcSetMembers15e_(code) { try { return (typeof KMCID !== 'undefined' && KMCID && typeof KMCID.planningSetMembers === 'function') ? KMCID.planningSetMembers(code) : null; } catch (e) { return null; } }

// XCO-R15G B1-MINOR-6: a cleanly cancelled plan (H1 proven) is a KNOWN state, not "outcome unknown". -> recovery object | null (keep today's answer)
function xcoCleanCancelState_(ss, planId, ev) {
  try {
    if (!ev || ev.live !== '' || (ev.legacy_ids || []).length) return null;
    if (typeof sc13Read_ !== 'function' || !ss.getSheetByName('shipment_plan_links')) return null;
    var pid = sc13Str_(planId), ships = sc13ShipIndex_(ss);
    var rows = sc13Read_(ss, 'shipment_plan_links', SC13_LINK_HEADERS_).rows.filter(function (r) { return sc13Str_(r.shipping_plan_id) === pid; });
    if (!rows.length || rows.some(function (r) { return !sc13LinkEnded_(ships[sc13Str_(r.shipment_id)], pid, r); })) return null;
    var cids = []; rows.forEach(function (r) { var k = sc13Str_(r.shipment_id), s0 = ships[k]; if (s0 && sc13Str_(s0.status).toLowerCase() === 'cancelled' && cids.indexOf(k) < 0) cids.push(k); });
    var proven = cids.some(function (sid) { var s = ships[sc13Str_(sid)], n = s ? sc13Str_(s.note) : '';
      return (n.match(/\[SC13_CANCELLED:[^\]\r\n]*\]/g) || []).some(function (m) { return m.slice(m.lastIndexOf(':') + 1, -1).split(',').indexOf(pid) >= 0; }); });
    if (!proven) return null;
    return { state: 'APPROVED_NO_SHIPMENT_AFTER_CANCEL', approval_committed: true, shipment_created: false, review_required: false, cause: 'SHIPMENT_DRAFT_CANCELLED_CLEANLY',
      basis: 'SECOND_APPROVE_CLICK_READBACK', cancelled_shipment_ids: cids.slice(0, 20), shipping_plan_id: pid,
      next_action: 'createShipmentFromPlan', retry_action: 'createShipmentFromPlan', retry_idempotent: true, retry_effect: 'CREATES_A_NEW_DRAFT_IF_THE_BOOKS_AGREE',
      retry_location: 'Weekly Shipping Plan -- the Approved plan card carries a "Retry Shipment Draft" action',
      message: 'The approval is kept. Its Shipment Draft was cancelled cleanly (the cancel recorded this plan and released its reservation), so no draft exists now. Create a new Shipment Draft with Retry Shipment Draft.' };
  } catch (e) { return null; }
}
// XCO-R15G-11 (xco-r15g-impl): patched
// R15G-STAMPS (final candidate): patched

// CODEX-TAX-SPLIT-1: local candidate, Owner fractional rates and separate currencies.
