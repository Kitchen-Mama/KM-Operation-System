// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 13_procurement_handlers.gs — Procurement Layer (Phase 1) writes
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md (Phase 1)
//   - createRequestOrderDraft        : create request_orders + request_order_lines (status=draft)
//   - updateRequestOrderStatus       : submit/approve/reject/cancel/done flow
//   - updateRequestOrderLineQty      : edit approved_qty (Draft only)
//   - createPurchaseOrderFromRequest : Approved request → purchase_orders + purchase_order_lines
//   - updatePurchaseOrderStatus      : issue/confirm/start_production/ready_to_ship/complete/cancel
//   - updatePurchaseOrderLine        : edit ordered_qty / unit_cost / note (Draft PO only)
// Immutable Flow: PO copies Request Order but NEVER writes it back (except the one-time
//   request_orders.status = converted_to_po marker set at conversion). Request Order NEVER
//   writes shipments / inventory / factory_stock. Tables auto-created with documented header
//   (missing-header safe; no existing table/field altered). Shares sheetEnsureColumns_ (11_).
// ============================================================

var REQUEST_ORDERS_HEADERS_ = [
  'request_order_id', 'request_order_no', 'request_order_version', 'parent_request_order_id',
  'company', 'supplier_id', 'supplier_name', 'factory_id', 'warehouse_id',
  // request_status is the CANONICAL header status (draft / pending_approval / approved / cancelled /
  // converted_to_po). The legacy `status` column is NO LONGER written / ensured (read-fallback only).
  'request_status',
  // tier_group summarizes the buckets present across the request's lines: T1 / T2_T3 / mixed / blank.
  'tier_group',
  'total_sku', 'total_qty', 'total_cartons', 'estimated_amount', 'currency',
  'source', 'source_ref_type', 'source_ref_id',
  'created_by', 'created_at', 'submitted_by', 'submitted_at',
  'approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'rejected_reason',
  'cancelled_by', 'cancelled_at', 'completed_by', 'completed_at',
  'note', 'updated_by', 'updated_at'
];

var REQUEST_ORDER_LINES_HEADERS_ = [
  'request_order_line_id', 'request_order_id', 'sku', 'series',
  // company = the site owner (KM / ResUS / ResTW …) this line's demand belongs to (one company per line).
  'company',
  // Demand bucket preserved on EVERY line (canonical T1/T2/T3 field — NOT tier_type). request_month = YYYY-MM.
  'request_bucket', 'request_month',
  // Decision-layer schedule fields (line-level; per tier). Blank until entered.
  'inspection_date', 'expected_ready_date', 'expected_ship_date',
  // Quantities. km_qty/resus_qty/restw_qty = per-company allocation for this line (matched company = qty,
  // others = 0). shortage_qty kept as primary.
  'requested_qty', 'approved_qty', 'km_qty', 'resus_qty', 'restw_qty', 'units_per_carton', 'carton_qty', 'shortage_qty',
  'supplier_id', 'supplier_name', 'supplier_sku', 'unit_cost', 'estimated_amount', 'currency',
  // purchase_order_line_id = the created PO line (traceability). Canonical name — REPLACES the deprecated
  // linked_purchase_order_line_id (no longer written/ensured; legacy column kept only if physically present).
  'calculation_method', 'line_status', 'purchase_order_line_id',
  'note', 'created_at', 'updated_at'
];

// request_order_line_sources — SOURCE OF TRUTH for company / site / month allocation detail. One row per
// request line (append-only). Written at request creation (Send Request → createRequestOrderDraft).
// Canonical PK column = request_order_line_source_id (legacy tabs may still carry line_source_id — the
// write dual-writes both so an existing sheet stays populated; the normalizer reads either).
var REQUEST_ORDER_LINE_SOURCES_HEADERS_ = [
  'request_order_line_source_id', 'request_order_line_id', 'request_order_id', 'sku',
  'company', 'country', 'marketplace', 'site_sku', 'marketplace_product_id',
  'tier_type', 'source_month',
  'forecast_qty', 'current_stock', 'on_the_way_qty', 'shortage_qty',
  'reallocation_qty', 'recommended_qty', 'requested_qty', 'approved_qty',
  'allocation_method', 'source_bucket', 'source_priority', 'source_type', 'note',
  'created_at', 'updated_at'
];

// FINAL purchase_orders schema (PO v2). order_status is CANONICAL; legacy `status`, `expected_ready_date`,
// `confirmed_ready_date` are DEPRECATED — no longer written or ensured (kept only if physically present).
var PURCHASE_ORDERS_HEADERS_ = [
  'purchase_order_id', 'po_no', 'km_po_no', 'warehouse_id', 'supplier_name',
  'order_status', 'order_date', 'deposit_due_date', 'inspection_date', 'expected_completion_date', 'expected_ship_date',
  'subtotal_amount', 'deposit_amount', 'balance_amount', 'paid_amount', 'payment_status', 'payment_term_id',
  'currency', 'note', 'purchase_order_no', 'po_version', 'parent_purchase_order_id',
  'request_order_id', 'company', 'supplier_id', 'factory_id',
  'total_sku', 'total_qty', 'total_cartons', 'total_amount',
  'supplier_expected_ready_date', 'supplier_confirmed_ready_date', 'request_bucket',
  'created_by', 'created_at', 'updated_by', 'updated_at',
  'issued_by', 'issued_at', 'confirmed_by', 'confirmed_at',
  'cancelled_by', 'cancelled_at', 'completed_by', 'completed_at',
  'closure_reason', 'closed_by', 'closed_at'
];

// FINAL purchase_order_lines schema (PO v2). `product_name` is DEPRECATED — no longer written or ensured.
var PURCHASE_ORDER_LINES_HEADERS_ = [
  'purchase_order_line_id', 'purchase_order_id', 'request_order_line_id', 'request_order_id', 'request_bucket',
  'sku', 'company', 'series', 'factory_item_no', 'factory_item_name',
  'supplier_id', 'supplier_name', 'supplier_sku', 'supplier_warehouse_id',
  'km_qty', 'resus_qty', 'restw_qty', 'recommended_qty', 'requested_qty', 'approved_qty',
  'ordered_qty', 'completed_qty', 'shipped_qty', 'remaining_qty',
  'carton_qty', 'units_per_carton', 'unit_cost', 'line_amount', 'currency', 'line_status',
  'inspection_date', 'expected_completion_date', 'expected_ship_date',
  'related_shipment_id', 'note', 'created_at', 'updated_at'
];

// ---- helpers ------------------------------------------------------

function procurementTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function procurementToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Add N BUSINESS days (Mon–Fri; Sat/Sun excluded) to a yyyy-MM-dd date-only string.
 *  Holiday calendar deferred (weekends only). Blank / unparseable input → '' (never computed from created_at). */
function procurementAddBusinessDays_(ymd, n) {
  var s = String(ymd == null ? '' : ymd).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  if (isNaN(d.getTime())) return '';
  var added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    var dow = d.getDay();               // 0=Sun … 6=Sat
    if (dow !== 0 && dow !== 6) added++; // count weekdays only
  }
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Normalize a schedule value to a DATE-ONLY string (yyyy-MM-dd) — no time / timezone / seconds.
 *  Handles Sheets Date cells (getValues returns Date objects) and already-formatted strings. Blank → ''. */
function procurementDateOnly_(v) {
  if (v === '' || v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);   // already date-only (or datetime prefixed with a date)
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var d = new Date(s);                            // parse a full datetime string → date-only
  return isNaN(d.getTime()) ? s : Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function procurementNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

/** Map a company + qty onto { km_qty, resus_qty, restw_qty } (matched company = qty, others = 0). */
function procurementCompanyQty_(company, qty) {
  var c = String(company || '').trim().toUpperCase();
  var out = { km_qty: 0, resus_qty: 0, restw_qty: 0 };
  var q = procurementNum_(qty);
  if (c.indexOf('RESUS') !== -1 || c === 'RES US') out.resus_qty = q;
  else if (c.indexOf('RESTW') !== -1 || c === 'RES TW') out.restw_qty = q;
  else if (c === 'KM' || c.indexOf('KITCHEN MAMA') !== -1 || c === 'KITCHENMAMA') out.km_qty = q;
  // Unknown company → all 0 (documented). Never blank.
  return out;
}

/** Canonical request status: prefer request_status, fall back to legacy status (read-only back-compat). */
function procurementReqStatus_(ref) {
  var rs = ref.col('request_status') !== -1 ? String(ref.vals[ref.col('request_status')]).trim() : '';
  if (rs) return rs;
  return ref.col('status') !== -1 ? String(ref.vals[ref.col('status')]).trim() : '';
}

/** tier_group from an array of buckets: only T1 → 'T1'; only T2/T3 → 'T2_T3'; both → 'mixed'; none → ''. */
function procurementTierGroup_(buckets) {
  var hasT1 = false, hasT23 = false;
  (buckets || []).forEach(function (b) {
    var t = String(b || '').trim().toUpperCase();
    if (t === 'T1' || t === '') { if (t === 'T1') hasT1 = true; }
    else if (t === 'T2' || t === 'T3') hasT23 = true;
  });
  if (hasT1 && hasT23) return 'mixed';
  if (hasT1) return 'T1';
  if (hasT23) return 'T2_T3';
  return '';
}

/** Get (or create with the documented header row) a procurement tab in the operation DB. */
function procurementEnsureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  }
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  // Ensure any newer columns exist on an already-created tab (uses shared global helper).
  sheetEnsureColumns_(sh, headers);
  return sh;
}

/** Append a row to a sheet using its existing header row (writes only known columns). */
function procurementAppendByHeader_(sheet, obj) {
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
function procurementUpcMap_(ss) {
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

/** sku -> { product_name, series } from sku_details (blank when unavailable). */
function procurementSkuInfoMap_(ss) {
  var map = {};
  var sh = ss.getSheetByName('sku_details');
  if (!sh) return map;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return map;
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cSku = h.indexOf('sku'), cName = h.indexOf('product_name'), cSeries = h.indexOf('series');
  if (cSku === -1) return map;
  for (var i = 1; i < data.length; i++) {
    var s = String(data[i][cSku] || '').trim();
    if (!s) continue;
    map[s] = {
      product_name: cName === -1 ? '' : String(data[i][cName] || '').trim(),
      series: cSeries === -1 ? '' : String(data[i][cSeries] || '').trim()
    };
  }
  return map;
}

// ---- request_order_line_sources mapping helpers (Part A) ----------
// All maps are built ONCE per createRequestOrderDraft call (small draft; cheap). Every source table is
// missing-tab / missing-header safe — absent data yields '' / 0 (never fabricated). Match grain for the
// identity fields = sku + company + country + marketplace (lowercased).

function procSrcNorm_(v) { return String(v == null ? '' : v).trim(); }
function procSrcKey_(sku, company, country, marketplace) {
  return procSrcNorm_(sku).toLowerCase() + '|' + procSrcNorm_(company).toLowerCase() + '|' +
         procSrcNorm_(country).toLowerCase() + '|' + procSrcNorm_(marketplace).toLowerCase();
}
var PROC_MONTH_KEYS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** source_priority from bucket: T1→1, T2→2, T3→3 (else ''). */
function procurementSourcePriority_(bucket) {
  var b = String(bucket || '').trim().toUpperCase();
  if (b === 'T1') return 1;
  if (b === 'T2') return 2;
  if (b === 'T3') return 3;
  return '';
}

/** marketplace_skus identity map: sku|company|country|marketplace -> { site_sku, marketplace_product_id }.
 *  marketplace_product_id falls back to legacy asin (read-only). Missing-tab safe. */
function procurementMarketplaceSkuMap_(ss) {
  var map = {};
  var sh = ss.getSheetByName('marketplace_skus');
  if (!sh) return map;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return map;
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cS = h.indexOf('sku'), cC = h.indexOf('company'), cCo = h.indexOf('country'), cM = h.indexOf('marketplace'),
      cSite = h.indexOf('site_sku'), cPid = h.indexOf('marketplace_product_id'), cAsin = h.indexOf('asin');
  if (cS === -1) return map;
  for (var i = 1; i < data.length; i++) {
    var key = procSrcKey_(data[i][cS], cC !== -1 ? data[i][cC] : '', cCo !== -1 ? data[i][cCo] : '', cM !== -1 ? data[i][cM] : '');
    if (map[key]) continue;   // first wins
    map[key] = {
      site_sku: cSite !== -1 ? procSrcNorm_(data[i][cSite]) : '',
      marketplace_product_id: (cPid !== -1 ? procSrcNorm_(data[i][cPid]) : '') || (cAsin !== -1 ? procSrcNorm_(data[i][cAsin]) : '')
    };
  }
  return map;
}

/** fc_target_rules → a resolver fn(sku, series, category) => multiplier (priority SKU > Series > Category
 *  > default 1.0). target_percentage is normalized to a multiplier: >1 treated as percent (÷100), else
 *  as a fraction; blank/absent → 1.0 (100%). Missing-tab safe. */
function procurementTargetRuleResolver_(ss) {
  var bySku = {}, bySeries = {}, byCat = {};
  var sh = ss.getSheetByName('fc_target_rules');
  function toMult(v) {
    if (v === '' || v == null) return null;
    var n = parseFloat(v); if (isNaN(n)) return null;
    return n > 1 ? (n / 100) : n;   // 80 -> 0.8 ; 0.8 -> 0.8 ; 100 -> 1.0
  }
  if (sh) {
    var data = sh.getDataRange().getValues();
    if (data.length >= 2) {
      var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
      var cScope = h.indexOf('scope_type'); if (cScope === -1) cScope = h.indexOf('scope'); if (cScope === -1) cScope = h.indexOf('level');
      var cScopeId = h.indexOf('scope_id');
      var cSku = h.indexOf('sku'), cSeries = h.indexOf('series'), cCat = h.indexOf('category');
      var cPct = h.indexOf('target_percentage'); if (cPct === -1) cPct = h.indexOf('target_rate'); if (cPct === -1) cPct = h.indexOf('target'); if (cPct === -1) cPct = h.indexOf('percentage');
      for (var i = 1; i < data.length; i++) {
        var mult = cPct !== -1 ? toMult(data[i][cPct]) : null;
        if (mult == null) continue;
        var scope = cScope !== -1 ? String(data[i][cScope]).trim().toLowerCase() : '';
        var scopeId = cScopeId !== -1 ? procSrcNorm_(data[i][cScopeId]) : '';
        // Resolve the target key: prefer explicit scope_type + scope_id; else infer from sku/series/category columns.
        if (scope === 'sku' || (!scope && cSku !== -1 && procSrcNorm_(data[i][cSku]))) { bySku[(scopeId || procSrcNorm_(data[i][cSku])).toUpperCase()] = mult; }
        else if (scope === 'series' || (!scope && cSeries !== -1 && procSrcNorm_(data[i][cSeries]))) { bySeries[(scopeId || procSrcNorm_(data[i][cSeries])).toUpperCase()] = mult; }
        else if (scope === 'category' || (!scope && cCat !== -1 && procSrcNorm_(data[i][cCat]))) { byCat[(scopeId || procSrcNorm_(data[i][cCat])).toUpperCase()] = mult; }
        else if (scopeId) { bySku[scopeId.toUpperCase()] = mult; }   // best-effort: bare scope_id treated as SKU
      }
    }
  }
  return function (sku, series, category) {
    var s = String(sku || '').trim().toUpperCase(), se = String(series || '').trim().toUpperCase(), c = String(category || '').trim().toUpperCase();
    if (s && bySku[s] != null) return bySku[s];
    if (se && bySeries[se] != null) return bySeries[se];
    if (c && byCat[c] != null) return byCat[c];
    return 1.0;   // default 100%
  };
}

/** fc_regular_forecast → map sku|company|country|marketplace -> summed next-3-month forecast with the
 *  target multiplier applied (SKU>Series>Category>100%). "Next 3 months" = the three calendar months
 *  AFTER the current month (M+1, M+2, M+3), matched against each forecast row's `year`. Missing-tab safe. */
function procurementForecastNext3Map_(ss, targetResolver) {
  var map = {};
  var sh = ss.getSheetByName('fc_regular_forecast');
  if (!sh) return map;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return map;
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cS = h.indexOf('sku'), cC = h.indexOf('company'), cCo = h.indexOf('country'), cM = h.indexOf('marketplace'),
      cYear = h.indexOf('year'), cSeries = h.indexOf('series'), cCat = h.indexOf('category');
  if (cS === -1) return map;
  var monthCol = PROC_MONTH_KEYS_.map(function (mk) { return h.indexOf(mk); });
  // Next 3 months (M+1..M+3) as {year, monthIndex} pairs relative to today.
  var now = new Date();
  var yNow = now.getFullYear(), mNow = now.getMonth();   // 0-based
  var windows = [];
  for (var k = 1; k <= 3; k++) { var mm = mNow + k; windows.push({ year: yNow + Math.floor(mm / 12), mi: ((mm % 12) + 12) % 12 }); }
  for (var i = 1; i < data.length; i++) {
    var rowYear = cYear !== -1 ? parseInt(String(data[i][cYear]).trim(), 10) : NaN;
    var mult = targetResolver(cS !== -1 ? data[i][cS] : '', cSeries !== -1 ? data[i][cSeries] : '', cCat !== -1 ? data[i][cCat] : '');
    var add = 0;
    for (var w = 0; w < windows.length; w++) {
      // If the forecast rows carry a year, only add the month when the row's year matches the window's year.
      if (!isNaN(rowYear) && rowYear !== windows[w].year) continue;
      var mc = monthCol[windows[w].mi];
      if (mc !== -1) add += (parseFloat(data[i][mc]) || 0) * mult;
    }
    if (!add) continue;
    var key = procSrcKey_(data[i][cS], cC !== -1 ? data[i][cC] : '', cCo !== -1 ? data[i][cCo] : '', cM !== -1 ? data[i][cM] : '');
    map[key] = (map[key] || 0) + add;
  }
  return map;
}

/** amazon_inventory_snapshot → current_stock lookup. The snapshot has NO company column, so identity is
 *  matched on sku (+ country + marketplace when present on the line). Returns { exact, bySku } where
 *  exact[sku|country|marketplace] = latest available_qty and bySku[sku] = Σ latest per (country,marketplace).
 *  Limitation: company is not part of this table — documented; matched on sku/country/marketplace only. */
function procurementInventoryStockMaps_(ss) {
  var exact = {}, bySku = {}, latestDate = {};
  var sh = ss.getSheetByName('amazon_inventory_snapshot');
  if (!sh) return { exact: exact, bySku: bySku };
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return { exact: exact, bySku: bySku };
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cS = h.indexOf('sku'), cCo = h.indexOf('country'), cM = h.indexOf('marketplace'),
      cQty = h.indexOf('available_qty'), cDate = h.indexOf('snapshot_date');
  if (cS === -1 || cQty === -1) return { exact: exact, bySku: bySku };
  for (var i = 1; i < data.length; i++) {
    var sku = procSrcNorm_(data[i][cS]); if (!sku) continue;
    var country = cCo !== -1 ? procSrcNorm_(data[i][cCo]) : '';
    var mkt = cM !== -1 ? procSrcNorm_(data[i][cM]) : '';
    var date = cDate !== -1 ? procSrcNorm_(data[i][cDate]) : '';
    var qty = parseFloat(data[i][cQty]) || 0;
    var ek = sku.toLowerCase() + '|' + country.toLowerCase() + '|' + mkt.toLowerCase();
    // Keep only the latest snapshot_date per (sku,country,marketplace).
    if (latestDate[ek] === undefined || date >= latestDate[ek]) { latestDate[ek] = date; exact[ek] = qty; }
  }
  // bySku = sum of the latest per-key value across all (country,marketplace) for that sku.
  Object.keys(exact).forEach(function (ek) { var sku = ek.split('|')[0]; bySku[sku] = (bySku[sku] || 0) + exact[ek]; });
  return { exact: exact, bySku: bySku };
}

/** current_stock for a line from the inventory maps. Exact (sku|country|marketplace) when country+marketplace
 *  are present; else sum-by-sku (documented fallback). */
function procurementCurrentStock_(invMaps, sku, country, marketplace) {
  var s = procSrcNorm_(sku); if (!s) return 0;
  if (procSrcNorm_(country) && procSrcNorm_(marketplace)) {
    var ek = s.toLowerCase() + '|' + procSrcNorm_(country).toLowerCase() + '|' + procSrcNorm_(marketplace).toLowerCase();
    return invMaps.exact[ek] || 0;
  }
  return invMaps.bySku[s.toLowerCase()] || 0;
}

/** shipment_lines → on_the_way_qty per sku, counting ONLY lines whose parent shipment is ACTIVE
 *  (status NOT in completed/received/closed/cancelled/delivered). When the line has country/marketplace
 *  and the parent shipment records them, they must match (best-effort narrowing). Missing-tab safe.
 *  LIMITATION: if the shipments status join is unavailable, returns {} (0 for every sku) — never fabricated. */
function procurementOnTheWayMaps_(ss) {
  var active = {};   // shipment_id -> { country, marketplace }
  var CLOSED = { completed: 1, received: 1, closed: 1, cancelled: 1, canceled: 1, delivered: 1 };
  var shSh = ss.getSheetByName('shipments');
  if (shSh) {
    var sd = shSh.getDataRange().getValues();
    if (sd.length >= 2) {
      var sh = sd[0].map(function (x) { return String(x).trim().toLowerCase(); });
      var cId = sh.indexOf('shipment_id'), cStatus = sh.indexOf('status'),
          cCo = sh.indexOf('country'), cM = sh.indexOf('marketplace');
      if (cId !== -1) {
        for (var i = 1; i < sd.length; i++) {
          var id = procSrcNorm_(sd[i][cId]); if (!id) continue;
          var st = cStatus !== -1 ? String(sd[i][cStatus]).trim().toLowerCase() : '';
          if (CLOSED[st]) continue;   // not active
          active[id] = { country: cCo !== -1 ? procSrcNorm_(sd[i][cCo]) : '', marketplace: cM !== -1 ? procSrcNorm_(sd[i][cM]) : '' };
        }
      }
    }
  }
  // Sum active shipment_lines.qty into a per-(sku|country|marketplace) and per-sku structure.
  var exact = {}, bySku = {};
  var lnSh = ss.getSheetByName('shipment_lines');
  if (lnSh) {
    var ld = lnSh.getDataRange().getValues();
    if (ld.length >= 2) {
      var lh = ld[0].map(function (x) { return String(x).trim().toLowerCase(); });
      var cSid = lh.indexOf('shipment_id'), cSku = lh.indexOf('sku'), cQty = lh.indexOf('qty');
      if (cSid !== -1 && cSku !== -1 && cQty !== -1) {
        for (var j = 1; j < ld.length; j++) {
          var sid = procSrcNorm_(ld[j][cSid]);
          if (!active[sid]) continue;   // parent not active (or status join unavailable)
          var sku = procSrcNorm_(ld[j][cSku]); if (!sku) continue;
          var qty = parseFloat(ld[j][cQty]) || 0;
          var ap = active[sid];
          var ek = sku.toLowerCase() + '|' + ap.country.toLowerCase() + '|' + ap.marketplace.toLowerCase();
          exact[ek] = (exact[ek] || 0) + qty;
          bySku[sku.toLowerCase()] = (bySku[sku.toLowerCase()] || 0) + qty;
        }
      }
    }
  }
  return { exact: exact, bySku: bySku };
}

/** on_the_way_qty for a line: narrow by country+marketplace when present (via parent shipment), else sum-by-sku. */
function procurementOnTheWay_(otwMaps, sku, country, marketplace) {
  var s = procSrcNorm_(sku); if (!s) return 0;
  if (procSrcNorm_(country) && procSrcNorm_(marketplace)) {
    var ek = s.toLowerCase() + '|' + procSrcNorm_(country).toLowerCase() + '|' + procSrcNorm_(marketplace).toLowerCase();
    if (otwMaps.exact[ek] !== undefined) return otwMaps.exact[ek];
  }
  return otwMaps.bySku[s.toLowerCase()] || 0;
}

/** Find the sheet row (1-indexed) whose id column matches; returns { row, vals, headers, col } or null. */
function procurementFindRow_(sheet, idColName, idValue) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var idCol = headers.indexOf(idColName);
  if (idCol === -1) return null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === idValue) {
      return {
        row: i + 1,
        vals: data[i],
        headers: headers,
        col: function (n) { return headers.indexOf(n); }
      };
    }
  }
  return null;
}

// ---- createRequestOrderDraft --------------------------------------

/**
 * Create ONE Request Order Draft (Procurement Planning Draft) + its lines. Body:
 *   { company?, supplier_id?, supplier_name?, factory_id?, warehouse_id?, source?, currency?,
 *     note?, created_by?, source_ref_type?, source_ref_id?,
 *     lines: [ { sku, product_name?, series?, requested_qty, units_per_carton?, supplier_id?,
 *                supplier_name?, supplier_sku?, unit_cost?, currency?, need_reason?,
 *                related_entity_type?, related_entity_id? } ] }
 * status=draft, request_order_version=1, parent=self. approved_qty defaults to requested_qty.
 */
function handleCreateRequestOrderDraft_(body) {
  var lines = (body && body.lines) || [];
  if (!lines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var roSheet = procurementEnsureSheet_(ss, 'request_orders', REQUEST_ORDERS_HEADERS_);
  var rolSheet = procurementEnsureSheet_(ss, 'request_order_lines', REQUEST_ORDER_LINES_HEADERS_);
  var srcSheet = procurementEnsureSheet_(ss, 'request_order_line_sources', REQUEST_ORDER_LINE_SOURCES_HEADERS_);
  var upcMap = procurementUpcMap_(ss);
  var infoMap = procurementSkuInfoMap_(ss);
  // request_order_line_sources mapping inputs (built once; all missing-tab / missing-header safe).
  var mskuMap = procurementMarketplaceSkuMap_(ss);
  var targetResolver = procurementTargetRuleResolver_(ss);
  var forecastMap = procurementForecastNext3Map_(ss, targetResolver);
  var invMaps = procurementInventoryStockMaps_(ss);
  var otwMaps = procurementOnTheWayMaps_(ss);

  var now = procurementTimestamp_();
  var today = procurementToday_();
  var createdBy = String((body && body.created_by) || 'procurement').trim();
  var source = String((body && body.source) || 'manual').trim();
  var currency = String((body && body.currency) || '').trim();
  var supplierId = String((body && body.supplier_id) || '').trim();
  var supplierName = String((body && body.supplier_name) || '').trim();
  // Default preferred factory warehouse (CN Youxin) when none supplied.
  var DEFAULT_WAREHOUSE_ID = 'WH-TW-CN-FACTORY-YOUXIN';
  var warehouseId = String((body && body.warehouse_id) || '').trim() || DEFAULT_WAREHOUSE_ID;

  var requestOrderId = 'RO-' + Utilities.getUuid().substring(0, 10).toUpperCase();
  var requestOrderNo = 'REQ-' + today.replace(/-/g, '') + '-' + Utilities.getUuid().substring(0, 4).toUpperCase();

  var totalQty = 0, totalCartons = 0, estimatedAmount = 0, lineCount = 0;
  var distinctSku = {};   // total_sku = COUNT(DISTINCT sku), never line count
  var buckets = [];

  for (var j = 0; j < lines.length; j++) {
    var l = lines[j] || {};
    var sku = String(l.sku || '').trim();
    if (!sku) continue;
    var requested = procurementNum_(l.requested_qty);
    var upc = procurementNum_(l.units_per_carton) || upcMap[sku] || 0;
    var approved = requested; // draft: approved defaults to requested
    var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
    var hasUnitCost = (l.unit_cost !== '' && l.unit_cost != null && !isNaN(parseFloat(l.unit_cost)));
    var unitCost = hasUnitCost ? parseFloat(l.unit_cost) : '';
    var lineAmount = hasUnitCost ? Math.round(approved * unitCost * 100) / 100 : '';
    var info = infoMap[sku] || { product_name: '', series: '' };
    var company = String(l.company || '').trim();
    var bucket = String(l.request_bucket || '').trim();
    var month = String(l.request_month || '').trim();
    var shortage = (l.shortage_qty !== '' && l.shortage_qty != null && !isNaN(parseFloat(l.shortage_qty))) ? procurementNum_(l.shortage_qty) : '';
    var coQty = procurementCompanyQty_(company, approved);
    var lineId = 'ROL-' + Utilities.getUuid().substring(0, 10).toUpperCase();
    buckets.push(bucket);

    procurementAppendByHeader_(rolSheet, {
      request_order_line_id: lineId,
      request_order_id: requestOrderId,
      sku: sku,
      series: String(l.series || info.series || '').trim(),
      company: company,                                                      // site owner (KM/ResUS/ResTW …)
      request_bucket: bucket,                                                // canonical T1 / T2 / T3 (NOT tier_type)
      request_month: month,
      inspection_date: String(l.inspection_date || '').trim(),
      expected_ready_date: String(l.expected_ready_date || '').trim(),
      expected_ship_date: String(l.expected_ship_date || '').trim(),
      requested_qty: requested,
      approved_qty: approved,
      km_qty: coQty.km_qty,
      resus_qty: coQty.resus_qty,
      restw_qty: coQty.restw_qty,
      units_per_carton: upc,
      carton_qty: carton,
      shortage_qty: shortage,
      supplier_id: String(l.supplier_id || supplierId || '').trim(),
      supplier_name: String(l.supplier_name || supplierName || '').trim(),
      supplier_sku: String(l.supplier_sku || '').trim(),
      unit_cost: unitCost,
      estimated_amount: lineAmount,
      currency: String(l.currency || currency || '').trim(),
      calculation_method: String(l.calculation_method || 'manual_order_allocation').trim(),
      line_status: String(l.line_status || 'draft').trim(),
      purchase_order_line_id: '',                                            // blank until PO created (canonical; replaces linked_purchase_order_line_id)
      note: String(l.note || '').trim(),
      created_at: now,
      updated_at: now
    });

    // request_order_line_sources — source of truth for company/site/month allocation (one row per line).
    var country = String(l.country || '').trim();
    var marketplace = String(l.marketplace || '').trim();
    var identity = mskuMap[procSrcKey_(sku, company, country, marketplace)] || { site_sku: '', marketplace_product_id: '' };
    var srcKey = procSrcKey_(sku, company, country, marketplace);
    // forecast_qty = next-3-month FC × target% (SKU>Series>Category>100%); rounded to whole units.
    var forecastQty = forecastMap[srcKey] !== undefined ? Math.round(forecastMap[srcKey]) : '';
    var currentStock = procurementCurrentStock_(invMaps, sku, country, marketplace);
    var onTheWayQty = procurementOnTheWay_(otwMaps, sku, country, marketplace);
    var sourceId = 'ROLS-' + Utilities.getUuid().substring(0, 10).toUpperCase();
    procurementAppendByHeader_(srcSheet, {
      request_order_line_source_id: sourceId,   // canonical PK
      line_source_id: sourceId,                 // legacy column dual-write (only written if the tab has it)
      request_order_line_id: lineId,
      request_order_id: requestOrderId,
      sku: sku,
      company: company,
      country: country,
      marketplace: marketplace,
      site_sku: identity.site_sku,                                   // from marketplace_skus (sku+co+country+mkt)
      marketplace_product_id: identity.marketplace_product_id,       // from marketplace_skus (asin fallback)
      tier_type: bucket,
      source_month: month,
      forecast_qty: forecastQty,                                     // next-3-month FC w/ target rules
      current_stock: currentStock,                                   // amazon_inventory_snapshot.available_qty
      on_the_way_qty: onTheWayQty,                                   // active shipment_lines.qty sum
      shortage_qty: '',                                              // blank — Calculation Engine not implemented
      reallocation_qty: '',                                          // blank — Calculation Engine not implemented
      recommended_qty: '',                                           // blank — Calculation Engine not implemented
      requested_qty: requested,
      approved_qty: approved,
      allocation_method: 'manual_order_allocation',                  // never blank (current manual/request flow)
      source_bucket: bucket,                                         // T1 / T2 / T3
      source_priority: procurementSourcePriority_(bucket),           // T1=1 / T2=2 / T3=3
      source_type: 'request_order_draft',
      note: String(l.note || '').trim(),
      created_at: now,
      updated_at: now
    });

    totalQty += approved;
    totalCartons += carton;
    if (hasUnitCost) estimatedAmount += (approved * unitCost);
    if (sku) distinctSku[String(sku).toLowerCase()] = 1;   // distinct-SKU accumulator
    lineCount++;
  }

  if (!lineCount) return jsonResponse_({ success: false, error: 'No valid lines (each line needs a sku)' });

  procurementAppendByHeader_(roSheet, {
    request_order_id: requestOrderId,
    request_order_no: requestOrderNo,
    request_order_version: 1,
    parent_request_order_id: requestOrderId, // MVP: parent = self
    company: String((body && body.company) || '').trim(),
    supplier_id: supplierId,
    supplier_name: supplierName,
    factory_id: String((body && body.factory_id) || '').trim(),
    warehouse_id: warehouseId,
    request_status: 'draft',
    tier_group: procurementTierGroup_(buckets),
    total_sku: Object.keys(distinctSku).length,   // COUNT(DISTINCT sku), not line count
    total_qty: totalQty,
    total_cartons: totalCartons,
    estimated_amount: (estimatedAmount > 0 ? Math.round(estimatedAmount * 100) / 100 : ''),
    currency: currency,
    source: source,
    source_ref_type: String((body && body.source_ref_type) || '').trim(),
    source_ref_id: String((body && body.source_ref_id) || '').trim(),
    created_by: createdBy,
    created_at: now,
    note: String((body && body.note) || '').trim(),
    updated_by: createdBy,
    updated_at: now
  });

  return jsonResponse_({ success: true, data: { request_order_id: requestOrderId, request_order_no: requestOrderNo, line_count: lineCount, total_qty: totalQty } });
}

// ---- updateRequestOrderStatus -------------------------------------

/**
 * Request Order status transitions (header-based lookup by request_order_id):
 *   submit  : draft -> pending_approval (if previously rejected: version +1, clear rejected_*)
 *   approve : pending_approval -> approved
 *   reject  : pending_approval -> draft (rejected_* recorded; reason appended to note; reason required)
 *   cancel  : draft|pending_approval -> cancelled (SOFT — row + lines preserved)
 *   done    : approved|converted_to_po -> sets completed_by/at (visual hide; status unchanged; no delete)
 * Actor fields are placeholder identities (MVP) — never block the flow.
 */
function handleUpdateRequestOrderStatus_(body) {
  var roId = String((body && body.request_order_id) || '').trim();
  var transition = String((body && body.transition) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  var reason = String((body && body.rejected_reason) || '').trim();
  if (!roId) return jsonResponse_({ success: false, error: 'Missing request_order_id' });
  var VALID = ['submit', 'approve', 'reject', 'cancel', 'done'];
  if (VALID.indexOf(transition) === -1) {
    return jsonResponse_({ success: false, error: 'Invalid transition. Valid: ' + VALID.join(', ') });
  }
  if (transition === 'reject' && !reason) {
    return jsonResponse_({ success: false, error: 'rejected_reason is required to reject' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('request_orders');
  if (!sheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found' });
  // Ensure canonical columns exist BEFORE findRow captures headers (old rows may predate request_status).
  sheetEnsureColumns_(sheet, ['request_status', 'tier_group', 'completed_by', 'completed_at', 'updated_by', 'updated_at']);

  var ref = procurementFindRow_(sheet, 'request_order_id', roId);
  if (!ref) return jsonResponse_({ success: false, error: 'Request order not found: ' + roId });
  var col = ref.col;
  var curStatus = procurementReqStatus_(ref);   // canonical request_status (falls back to legacy status)
  var now = procurementTimestamp_();
  function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(ref.row, c + 1).setValue(value); }
  // Write ONLY request_status (legacy `status` is no longer written / recreated).
  function setStatus(value) { setCell('request_status', value); }

  if (transition === 'submit') {
    if (curStatus !== 'draft') return jsonResponse_({ success: false, error: 'Only a Draft request can be submitted (current: ' + curStatus + ')' });
    var wasRejected = col('rejected_at') !== -1 && String(ref.vals[col('rejected_at')]).trim() !== '';
    if (wasRejected) {
      var curVer = col('request_order_version') !== -1 ? (parseFloat(ref.vals[col('request_order_version')]) || 1) : 1;
      setCell('request_order_version', curVer + 1);
      setCell('rejected_by', ''); setCell('rejected_at', ''); setCell('rejected_reason', '');
    }
    setStatus('pending_approval');
    setCell('submitted_by', actor);
    setCell('submitted_at', now);
  } else if (transition === 'approve') {
    if (curStatus !== 'pending_approval') return jsonResponse_({ success: false, error: 'Only a Pending Approval request can be approved (current: ' + curStatus + ')' });
    setStatus('approved');
    setCell('approved_by', actor);
    setCell('approved_at', now);
  } else if (transition === 'reject') {
    if (curStatus !== 'pending_approval') return jsonResponse_({ success: false, error: 'Only a Pending Approval request can be rejected (current: ' + curStatus + ')' });
    var verForNote = col('request_order_version') !== -1 ? (parseFloat(ref.vals[col('request_order_version')]) || 1) : 1;
    setCell('rejected_by', actor);
    setCell('rejected_at', now);
    setCell('rejected_reason', reason);
    if (col('note') !== -1) {
      var existingNote = String(ref.vals[col('note')] || '').trim();
      var appended = '[REJECTED v' + verForNote + ' @' + now + '] ' + reason;
      setCell('note', existingNote ? (existingNote + '\n' + appended) : appended);
    }
    setStatus('draft');
  } else if (transition === 'cancel') {
    if (curStatus !== 'draft' && curStatus !== 'pending_approval') {
      return jsonResponse_({ success: false, error: 'Only a Draft or Pending Approval request can be cancelled (current: ' + curStatus + ')' });
    }
    setStatus('cancelled');
    setCell('cancelled_by', actor);
    setCell('cancelled_at', now);
  } else if (transition === 'done') {
    if (curStatus !== 'approved' && curStatus !== 'converted_to_po') {
      return jsonResponse_({ success: false, error: 'Only an Approved / Converted request can be marked Done (current: ' + curStatus + ')' });
    }
    setCell('completed_by', actor);
    setCell('completed_at', now);
  }

  // Propagate line_status (final_order_qty is deprecated — no longer written).
  if (transition === 'submit') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'submitted' });
  else if (transition === 'approve') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'approved' });
  else if (transition === 'reject') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'draft' });
  else if (transition === 'cancel') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'cancelled' });

  setCell('updated_by', actor);
  setCell('updated_at', now);

  return jsonResponse_({ success: true, data: { request_order_id: roId, transition: transition } });
}

/** Set line_status on all request_order_lines of a request. opts: { lineStatus? }. Missing cols skipped.
 *  (final_order_qty is deprecated and no longer written.) */
function procurementUpdateRequestLines_(ss, roId, opts) {
  var sh = ss.getSheetByName('request_order_lines');
  if (!sh) return;
  sheetEnsureColumns_(sh, ['line_status', 'updated_at']);
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return;
  var h = data[0].map(function (x) { return String(x).trim(); });
  var roCol = h.indexOf('request_order_id'), lsCol = h.indexOf('line_status'), upCol = h.indexOf('updated_at');
  if (roCol === -1) return;
  var now = procurementTimestamp_();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][roCol]).trim() !== roId) continue;
    // A1 — cancelled lines are IMMUTABLE in the Request Order flow: once line_status = cancelled they are
    // never re-statused (submit/approve/reject) or re-stamped. This prevents a cancelled tier (e.g. T1)
    // from being pushed back to 'submitted' when T2/T3 is submitted.
    if (lsCol !== -1 && String(data[i][lsCol]).trim() === 'cancelled') continue;
    if (opts.lineStatus && lsCol !== -1) sh.getRange(i + 1, lsCol + 1).setValue(opts.lineStatus);
    if (upCol !== -1) sh.getRange(i + 1, upCol + 1).setValue(now);
  }
}

/**
 * Company-specific site fields for (sku, company): sku|company -> { site_sku, marketplace_product_id,
 * country, marketplace, warehouse_id, ownership_company }. Built from marketplace_skus first, then filled
 * from sku_regional_details (first non-empty wins). Missing-tab / missing-col safe (returns {}).
 * Used to populate a NEW company's request_order_line_sources row (Manual Allocation) so site_sku is not blank.
 */
function procurementSiteFieldsByCompany_(ss) {
  var map = {};
  function key(sku, co) { return String(sku || '').trim().toLowerCase() + '|' + String(co || '').trim().toLowerCase(); }
  var FIELDS = ['site_sku', 'marketplace_product_id', 'country', 'marketplace', 'warehouse_id', 'ownership_company'];
  function ingest(sheetName, aliases) {
    var sh = ss.getSheetByName(sheetName); if (!sh) return;
    var d = sh.getDataRange().getValues(); if (d.length < 2) return;
    var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
    var ci = {};
    Object.keys(aliases).forEach(function (f) {
      aliases[f].some(function (a) { var idx = h.indexOf(a); if (idx !== -1) { ci[f] = idx; return true; } return false; });
    });
    if (ci.sku === undefined || ci.company === undefined) return;   // need identity to match by sku+company
    for (var i = 1; i < d.length; i++) {
      var sku = String(d[i][ci.sku] || '').trim(), co = String(d[i][ci.company] || '').trim();
      if (!sku || !co) continue;
      var k = key(sku, co);
      var cur = map[k] || (map[k] = { site_sku: '', marketplace_product_id: '', country: '', marketplace: '', warehouse_id: '', ownership_company: '' });
      FIELDS.forEach(function (f) { if (!cur[f] && ci[f] !== undefined) { var v = String(d[i][ci[f]] || '').trim(); if (v) cur[f] = v; } });
    }
  }
  ingest('marketplace_skus', { sku: ['sku'], company: ['company'], site_sku: ['site_sku'], marketplace_product_id: ['marketplace_product_id', 'asin'], country: ['country'], marketplace: ['marketplace'], warehouse_id: ['warehouse_id'], ownership_company: ['ownership_company'] });
  ingest('sku_regional_details', { sku: ['sku'], company: ['company'], site_sku: ['site_sku'], marketplace_product_id: ['marketplace_product_id', 'asin'], country: ['country'], marketplace: ['marketplace'], warehouse_id: ['warehouse_id'], ownership_company: ['ownership_company'] });
  return map;
}

// ---- updateRequestOrderLineQty ------------------------------------

/**
 * Edit approved_qty on request_order_lines (Draft only). Recomputes carton_qty + estimated_amount.
 * Body: { lines: [ { request_order_line_id, approved_qty?, inspection_date?, expected_ready_date?,
 *   expected_ship_date?, note? } | { new_line:true, request_order_id, sku, company, request_bucket?,
 *   request_month?, units_per_carton?, approved_qty } ] }.
 *   - Existing lines: whose parent request is not Draft, or whose line_status = cancelled (A1 immutable),
 *     are skipped (reported). approved_qty parallel-syncs the matching request_order_line_sources row.
 *   - new_line entries (A2 Manual Allocation, line-per-company): create a NEW request_order_line for a
 *     company that had no line for this SKU/tier (requested_qty=0, km/resus/restw derived).
 * Recomputes the parent header totals afterward (cancelled lines excluded).
 */
function handleUpdateRequestOrderLineQty_(body) {
  var reqLines = (body && body.lines) || [];
  if (!reqLines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSheet = ss.getSheetByName('request_order_lines');
  var roSheet = ss.getSheetByName('request_orders');
  if (!lineSheet) return jsonResponse_({ success: false, error: 'request_order_lines sheet not found' });
  if (!roSheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found' });

  // request_order_id -> canonical status (request_status, fallback legacy status)
  var roData = roSheet.getDataRange().getValues();
  var roHeaders = roData[0].map(function (h) { return String(h).trim(); });
  var roIdCol = roHeaders.indexOf('request_order_id');
  var roReqStatusCol = roHeaders.indexOf('request_status');
  var roStatusCol = roHeaders.indexOf('status');
  var statusById = {};
  for (var p = 1; p < roData.length; p++) {
    if (roIdCol === -1) continue;
    var rs = roReqStatusCol !== -1 ? String(roData[p][roReqStatusCol]).trim() : '';
    if (!rs && roStatusCol !== -1) rs = String(roData[p][roStatusCol]).trim();
    statusById[String(roData[p][roIdCol]).trim()] = rs;
  }

  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'request_order_lines is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var idCol = col('request_order_line_id');
  var roLineIdCol = col('request_order_id');
  var approvedCol = col('approved_qty');
  var cartonCol = col('carton_qty');
  var upcCol = col('units_per_carton');
  var unitCostCol = col('unit_cost');
  var estCol = col('estimated_amount');
  var updatedCol = col('updated_at');
  var inspCol = col('inspection_date');
  var readyCol = col('expected_ready_date');
  var shipCol = col('expected_ship_date');
  var noteCol = col('note');
  var companyCol = col('company');
  var skuCol = col('sku'), bucketCol = col('request_bucket'), monthCol = col('request_month');
  var kmCol = col('km_qty'), resusCol = col('resus_qty'), restwCol = col('restw_qty');
  var lineStatusCol = col('line_status');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'request_order_line_id column not found' });

  var rowById = {};
  for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };

  // A — sibling line lookup for Manual Allocation new-company lines. Copies stable (non-company) fields from a
  // sibling request_order_line with the SAME request_order_id + sku + request_bucket (non-cancelled).
  var seriesCol = col('series'), supIdCol = col('supplier_id'), supNameCol = col('supplier_name'), supSkuCol = col('supplier_sku');
  var factItemNoCol = col('factory_item_no'), factItemNameCol = col('factory_item_name'), supWhCol = col('supplier_warehouse_id');
  var currencyCol = col('currency'), calcMethodCol = col('calculation_method'), recQtyCol = col('recommended_qty'), reqQtyCol = col('requested_qty');
  function findSiblingLine_(roId2, sku2, bucket2) {
    for (var k = 1; k < data.length; k++) {
      if (roLineIdCol !== -1 && String(data[k][roLineIdCol]).trim() !== roId2) continue;
      if (skuCol !== -1 && nl_(data[k][skuCol]) !== nl_(sku2)) continue;
      if (bucketCol !== -1 && bucket2 && nl_(data[k][bucketCol]) !== nl_(bucket2)) continue;
      if (lineStatusCol !== -1 && nl_(data[k][lineStatusCol]) === 'cancelled') continue;
      return data[k];
    }
    return null;
  }
  // Lazy marketplace_skus / sku_regional_details site-field map (built only if a new company line is created).
  var siteFieldsMap = null;
  function siteFieldsFor_(sku2, company2) {
    if (siteFieldsMap === null) siteFieldsMap = procurementSiteFieldsByCompany_(ss);
    return siteFieldsMap[nl_(sku2) + '|' + nl_(company2)] || null;
  }

  // ---- request_order_line_sources parallel-sync setup (read ONCE; missing-tab safe) ----
  // request_order_lines and request_order_line_sources are BOTH SKU/company/tier based; on Save we set
  // the matching source row's approved_qty to the SAME decision qty (NO proportional / ratio split).
  // Snapshot fields (forecast_qty / current_stock / on_the_way_qty / shortage_qty / reallocation_qty /
  // recommended_qty / requested_qty / source_month / source_bucket / source_priority / site_sku /
  // marketplace_product_id) are NEVER touched — only approved_qty + updated_at.
  function nl_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  var srcSheet = ss.getSheetByName('request_order_line_sources');
  var srcByLineId = null, srcApprovedCol = -1, srcUpdatedCol = -1, srcUpdatedCount = 0;
  // B — sibling source index: sku|bucket|company -> { site_sku, marketplace_product_id, country, marketplace,
  // ownership_company, warehouse_id } for populating a NEW company's source row (priority 1 over masters).
  var srcSiblingByKey = null;
  var warnings = [];
  if (srcSheet) {
    var sData = srcSheet.getDataRange().getValues();
    if (sData.length >= 2) {
      var sH = sData[0].map(function (x) { return String(x).trim(); });
      function sc(n) { return sH.indexOf(n); }
      var sLineIdCol = sc('request_order_line_id');
      var sSkuCol = sc('sku'), sCompanyCol = sc('company'), sTierCol = sc('tier_type'), sBucketCol = sc('source_bucket'), sMonthCol = sc('source_month');
      var sSiteSkuCol = sc('site_sku'), sMpidCol = sc('marketplace_product_id'), sCountryCol = sc('country'), sMktCol = sc('marketplace'), sOwnerCol = sc('ownership_company'), sWhCol = sc('warehouse_id');
      srcApprovedCol = sc('approved_qty');
      srcUpdatedCol = sc('updated_at');
      if (sLineIdCol !== -1 && srcApprovedCol !== -1) {
        srcByLineId = {};
        srcSiblingByKey = {};
        for (var si = 1; si < sData.length; si++) {
          var lid = String(sData[si][sLineIdCol]).trim();
          if (lid) {
            (srcByLineId[lid] = srcByLineId[lid] || []).push({
              rowIndex: si + 1,
              sku: sSkuCol !== -1 ? sData[si][sSkuCol] : '',
              company: sCompanyCol !== -1 ? sData[si][sCompanyCol] : '',
              tier: sTierCol !== -1 ? sData[si][sTierCol] : (sBucketCol !== -1 ? sData[si][sBucketCol] : ''),
              month: sMonthCol !== -1 ? sData[si][sMonthCol] : ''
            });
          }
          // Index site fields by sku|bucket|company (first non-empty per field wins).
          var kSku = sSkuCol !== -1 ? nl_(sData[si][sSkuCol]) : '';
          var kBucket = sTierCol !== -1 ? nl_(sData[si][sTierCol]) : (sBucketCol !== -1 ? nl_(sData[si][sBucketCol]) : '');
          var kCo = sCompanyCol !== -1 ? nl_(sData[si][sCompanyCol]) : '';
          if (kSku && kCo) {
            var sk = kSku + '|' + kBucket + '|' + kCo;
            var cur = srcSiblingByKey[sk] || (srcSiblingByKey[sk] = { site_sku: '', marketplace_product_id: '', country: '', marketplace: '', ownership_company: '', warehouse_id: '' });
            function fill_(f, ci2) { if (!cur[f] && ci2 !== -1) { var v = String(sData[si][ci2] || '').trim(); if (v) cur[f] = v; } }
            fill_('site_sku', sSiteSkuCol); fill_('marketplace_product_id', sMpidCol); fill_('country', sCountryCol);
            fill_('marketplace', sMktCol); fill_('ownership_company', sOwnerCol); fill_('warehouse_id', sWhCol);
          }
        }
      }
    }
  } else {
    warnings.push('request_order_line_sources tab not found — request_order_lines updated only.');
  }

  // Set the matching source row(s) approved_qty for one line (by request_order_line_id + sku + company +
  // tier + source_month). No ratio; only approved_qty + updated_at written.
  function syncLineSourceApproved_(lineId, sku, company, bucket, month, approvedQty) {
    if (!srcByLineId) return;   // no source table / unusable header → skip (already warned)
    var candidates = srcByLineId[lineId] || [];
    if (!candidates.length) { warnings.push('Line ' + lineId + ': no matching request_order_line_sources row (request_order_lines updated; source unchanged).'); return; }
    // Safety filter by sku / company / tier when the source carries them.
    var filtered = candidates.filter(function (cd) {
      if (sku && String(cd.sku).trim() && nl_(cd.sku) !== nl_(sku)) return false;
      if (company && String(cd.company).trim() && nl_(cd.company) !== nl_(company)) return false;
      if (bucket && String(cd.tier).trim() && nl_(cd.tier) !== nl_(bucket)) return false;
      return true;
    });
    if (!filtered.length) filtered = candidates;   // fall back to line-id link (same request line)
    // Prefer an exact source_month match when the line carries a month.
    if (month) {
      var mm = filtered.filter(function (cd) { return String(cd.month).trim() && nl_(cd.month) === nl_(month); });
      if (mm.length) filtered = mm;
    }
    filtered.forEach(function (cd) {
      srcSheet.getRange(cd.rowIndex, srcApprovedCol + 1).setValue(approvedQty);
      if (srcUpdatedCol !== -1) srcSheet.getRange(cd.rowIndex, srcUpdatedCol + 1).setValue(now);
      srcUpdatedCount++;
    });
    if (filtered.length > 1) {
      warnings.push('Line ' + lineId + ': ' + filtered.length + ' source rows matched — each set to approved_qty=' + approvedQty + ' (same company/SKU/tier decision qty; no proportional split).');
    }
  }

  var now = procurementTimestamp_();
  var updated = 0, skipped = 0, createdLines = 0;
  var affectedRoIds = {};

  // A2 — Manual Allocation Mode (line-per-company): create a NEW request_order_line for a company that had
  // no line for this SKU/tier. requested_qty = 0 (this is a reallocation), approved_qty = the entered qty,
  // km/resus/restw derived from the company (never blank). A minimal request_order_line_sources row is
  // appended so the source-of-truth table stays populated (snapshot fields blank — no Calculation Engine).
  function createManualAllocLine_(rq) {
    var roId = String(rq.request_order_id || '').trim();
    var sku = String(rq.sku || '').trim();
    var company = String(rq.company || '').trim();
    if (!roId || !sku || !company) return null;
    if (statusById[roId] !== 'draft') return null;   // only Draft requests accept new allocation lines
    var approved = parseFloat(rq.approved_qty); if (isNaN(approved) || approved < 0) approved = 0;
    if (approved <= 0) return null;                   // nothing to allocate
    var bucket = String(rq.request_bucket || '').trim();

    // A — copy stable (non-company) fields from a sibling line (same request_order_id + sku + request_bucket).
    var sib = findSiblingLine_(roId, sku, bucket);
    function sibStr(c) { return (sib && c !== -1) ? String(sib[c] || '').trim() : ''; }
    function sibNum(c) { return (sib && c !== -1) ? (parseFloat(sib[c]) || 0) : 0; }

    // units_per_carton / carton: prefer payload, fall back to sibling.
    var upc = parseFloat(rq.units_per_carton) || 0;
    if (!upc) upc = sibNum(upcCol);
    var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
    var month = String(rq.request_month || '').trim() || sibStr(monthCol);
    // Schedule: prefer payload (the tier's edited schedule), fall back to sibling — stored DATE-ONLY.
    var inspection = procurementDateOnly_(String(rq.inspection_date || '').trim() || (sib && inspCol !== -1 ? sib[inspCol] : ''));
    var readyDate = procurementDateOnly_(String(rq.expected_ready_date || '').trim() || (sib && readyCol !== -1 ? sib[readyCol] : ''));
    var shipDate = procurementDateOnly_(String(rq.expected_ship_date || '').trim() || (sib && shipCol !== -1 ? sib[shipCol] : ''));
    var note = String(rq.note || '').trim() || sibStr(noteCol);
    var cq = procurementCompanyQty_(company, approved);
    var newLineId = 'ROL-' + Utilities.getUuid().substring(0, 10).toUpperCase();

    // Only known header columns are written by procurementAppendByHeader_; unknown keys are ignored safely.
    procurementAppendByHeader_(lineSheet, {
      request_order_line_id: newLineId,
      request_order_id: roId,
      sku: sku,
      series: sibStr(seriesCol),                              // A — no longer blank when sibling has series
      company: company,
      request_bucket: bucket,
      request_month: month,
      inspection_date: inspection,
      expected_ready_date: readyDate,
      expected_ship_date: shipDate,
      requested_qty: 0,                                        // reallocation — not originally requested
      approved_qty: approved,
      km_qty: cq.km_qty, resus_qty: cq.resus_qty, restw_qty: cq.restw_qty,
      recommended_qty: '',                                    // blank (no formula)
      units_per_carton: upc,
      carton_qty: carton,
      supplier_id: sibStr(supIdCol),
      supplier_name: sibStr(supNameCol),
      supplier_sku: sibStr(supSkuCol),
      factory_item_no: sibStr(factItemNoCol),
      factory_item_name: sibStr(factItemNameCol),
      supplier_warehouse_id: sibStr(supWhCol),
      unit_cost: sib && unitCostCol !== -1 ? sib[unitCostCol] : '',
      currency: sibStr(currencyCol),
      calculation_method: sibStr(calcMethodCol) || 'manual_order_allocation',
      line_status: 'draft',
      note: note,
      created_at: now,
      updated_at: now
    });

    if (srcSheet) {
      // B — resolve company-specific site fields: (1) sibling source same sku+bucket+company, then
      // (2) marketplace_skus / (3) sku_regional_details by sku+company. Blank only if no source exists.
      var sf = (srcSiblingByKey && srcSiblingByKey[nl_(sku) + '|' + nl_(bucket) + '|' + nl_(company)]) || null;
      if (!sf || !sf.site_sku) {
        var mf = siteFieldsFor_(sku, company);
        if (mf) {
          sf = sf || { site_sku: '', marketplace_product_id: '', country: '', marketplace: '', ownership_company: '', warehouse_id: '' };
          ['site_sku', 'marketplace_product_id', 'country', 'marketplace', 'ownership_company', 'warehouse_id'].forEach(function (f) { if (!sf[f] && mf[f]) sf[f] = mf[f]; });
        }
      }
      sf = sf || {};
      var sid = 'ROLS-' + Utilities.getUuid().substring(0, 10).toUpperCase();
      procurementAppendByHeader_(srcSheet, {
        request_order_line_source_id: sid,
        line_source_id: sid,
        request_order_line_id: newLineId,
        request_order_id: roId,
        sku: sku,
        company: company,
        country: sf.country || '',
        marketplace: sf.marketplace || '',
        ownership_company: sf.ownership_company || '',
        warehouse_id: sf.warehouse_id || '',
        site_sku: sf.site_sku || '',                          // B — populated from sibling / masters when available
        marketplace_product_id: sf.marketplace_product_id || '',
        tier_type: bucket,
        source_month: month,
        requested_qty: 0,
        approved_qty: approved,
        allocation_method: 'manual_order_allocation',
        source_bucket: bucket,
        source_priority: procurementSourcePriority_(bucket),
        source_type: 'manual_reallocation',
        created_at: now,
        updated_at: now
      });
    }
    return { roId: roId, lineId: newLineId };
  }

  for (var r = 0; r < reqLines.length; r++) {
    var rq = reqLines[r] || {};
    // A2 — new allocation line for a company that had none (line-per-company model).
    if (rq.new_line) {
      var np = createManualAllocLine_(rq);
      if (np) { createdLines++; updated++; affectedRoIds[np.roId] = true; }
      else skipped++;
      continue;
    }
    var lineId = String(rq.request_order_line_id || '').trim();
    if (!lineId || !rowById[lineId]) { skipped++; continue; }
    var ent = rowById[lineId];
    var parentId = roLineIdCol !== -1 ? String(ent.vals[roLineIdCol]).trim() : '';
    if (statusById[parentId] !== 'draft') { skipped++; continue; }
    // A1 — never update a cancelled line (immutable: no approved_qty / company split / dates / status change).
    if (lineStatusCol !== -1 && String(ent.vals[lineStatusCol]).trim() === 'cancelled') { skipped++; continue; }
    // approved_qty is optional now (a line may be updated only for schedule/note).
    if (rq.approved_qty !== undefined) {
      var approved = parseFloat(rq.approved_qty); if (isNaN(approved) || approved < 0) approved = 0;
      var upc = upcCol !== -1 ? (parseFloat(ent.vals[upcCol]) || 0) : 0;
      var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
      if (approvedCol !== -1) lineSheet.getRange(ent.row, approvedCol + 1).setValue(approved);
      if (cartonCol !== -1) lineSheet.getRange(ent.row, cartonCol + 1).setValue(carton);
      var uc = unitCostCol !== -1 ? parseFloat(ent.vals[unitCostCol]) : NaN;
      if (estCol !== -1 && !isNaN(uc)) lineSheet.getRange(ent.row, estCol + 1).setValue(Math.round(approved * uc * 100) / 100);
      // Re-derive the per-company allocation (this line's company gets approved; others 0).
      var lineCompany = companyCol !== -1 ? String(ent.vals[companyCol] || '').trim() : '';
      var cq = procurementCompanyQty_(lineCompany, approved);
      if (kmCol !== -1) lineSheet.getRange(ent.row, kmCol + 1).setValue(cq.km_qty);
      if (resusCol !== -1) lineSheet.getRange(ent.row, resusCol + 1).setValue(cq.resus_qty);
      if (restwCol !== -1) lineSheet.getRange(ent.row, restwCol + 1).setValue(cq.restw_qty);
      // Parallel-sync the matching source row(s) to the SAME decision qty (no ratio) — snapshots preserved.
      var lineSku = skuCol !== -1 ? String(ent.vals[skuCol] || '').trim() : '';
      var lineBucket = bucketCol !== -1 ? String(ent.vals[bucketCol] || '').trim() : '';
      var lineMonth = monthCol !== -1 ? String(ent.vals[monthCol] || '').trim() : '';
      syncLineSourceApproved_(lineId, lineSku, lineCompany, lineBucket, lineMonth, approved);
    }
    // Optional decision-layer schedule fields + note (per tier → applied to each tier line).
    if (rq.inspection_date !== undefined && inspCol !== -1) lineSheet.getRange(ent.row, inspCol + 1).setValue(String(rq.inspection_date || '').trim());
    if (rq.expected_ready_date !== undefined && readyCol !== -1) lineSheet.getRange(ent.row, readyCol + 1).setValue(String(rq.expected_ready_date || '').trim());
    if (rq.expected_ship_date !== undefined && shipCol !== -1) lineSheet.getRange(ent.row, shipCol + 1).setValue(String(rq.expected_ship_date || '').trim());
    if (rq.note !== undefined && noteCol !== -1) lineSheet.getRange(ent.row, noteCol + 1).setValue(String(rq.note || '').trim());
    if (updatedCol !== -1) lineSheet.getRange(ent.row, updatedCol + 1).setValue(now);
    if (parentId) affectedRoIds[parentId] = true;
    updated++;
  }

  // Recompute header totals for affected requests.
  Object.keys(affectedRoIds).forEach(function (id) { procurementRecalcRequestTotals_(ss, id); });

  return jsonResponse_({ success: true, data: { updated: updated, skipped: skipped, created_lines: createdLines, sources_updated: srcUpdatedCount, warnings: warnings } });
}

/** Recompute request_orders totals (total_sku / total_qty / total_cartons / estimated_amount) from its lines. */
function procurementRecalcRequestTotals_(ss, requestOrderId) {
  var lineSheet = ss.getSheetByName('request_order_lines');
  var roSheet = ss.getSheetByName('request_orders');
  if (!lineSheet || !roSheet) return;
  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return;
  var h = data[0].map(function (x) { return String(x).trim(); });
  var roIdCol = h.indexOf('request_order_id'), aCol = h.indexOf('approved_qty'), cCol = h.indexOf('carton_qty'), ucCol = h.indexOf('unit_cost'), lsCol = h.indexOf('line_status'), skCol = h.indexOf('sku');
  if (roIdCol === -1) return;
  var distinctSku = {}, totalQty = 0, totalCartons = 0, est = 0;   // total_sku = COUNT(DISTINCT sku), not line count
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][roIdCol]).trim() !== requestOrderId) continue;
    if (lsCol !== -1 && String(data[i][lsCol]).trim() === 'cancelled') continue;   // exclude cancelled lines
    var sku = skCol !== -1 ? String(data[i][skCol] || '').trim() : '';
    if (sku) distinctSku[sku.toLowerCase()] = 1;
    var q = aCol !== -1 ? (parseFloat(data[i][aCol]) || 0) : 0;
    totalQty += q;
    totalCartons += cCol !== -1 ? (parseFloat(data[i][cCol]) || 0) : 0;
    var uc = ucCol !== -1 ? parseFloat(data[i][ucCol]) : NaN;
    if (!isNaN(uc)) est += q * uc;
  }
  var ref = procurementFindRow_(roSheet, 'request_order_id', requestOrderId);
  if (!ref) return;
  function setCell(name, value) { var c = ref.col(name); if (c !== -1) roSheet.getRange(ref.row, c + 1).setValue(value); }
  setCell('total_sku', Object.keys(distinctSku).length);
  setCell('total_qty', totalQty);
  setCell('total_cartons', totalCartons);
  setCell('estimated_amount', est > 0 ? Math.round(est * 100) / 100 : '');
}

// ---- cancelRequestOrderTier ---------------------------------------

/**
 * Cancel a tier/block of a Request Order Draft by STATUS (soft — never hard-deletes). Body:
 *   { request_order_line_ids: [ ... ], actor? }.
 * Sets line_status = 'cancelled' + updated_at on each line (Draft parent only). If, afterwards, EVERY
 * line of a parent request is cancelled, the request header transitions status = 'cancelled'
 * (+ cancelled_by/at). Header totals are recomputed (cancelled lines excluded). Rows are preserved.
 * NOTE: request_order_line_sources is spec-only (not implemented) — its status is not updated here;
 * documented as a follow-up.
 */
function handleCancelRequestOrderTier_(body) {
  var ids = (body && body.request_order_line_ids) || [];
  if (!ids.length) return jsonResponse_({ success: false, error: 'request_order_line_ids required' });
  var actor = String((body && body.actor) || 'operation-system').trim();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSheet = ss.getSheetByName('request_order_lines');
  var roSheet = ss.getSheetByName('request_orders');
  if (!lineSheet) return jsonResponse_({ success: false, error: 'request_order_lines sheet not found' });
  if (!roSheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found' });
  sheetEnsureColumns_(lineSheet, ['line_status', 'updated_at']);
  sheetEnsureColumns_(roSheet, ['request_status']);   // ensure canonical column before the header cancel

  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'request_order_lines is empty' });
  var h = data[0].map(function (x) { return String(x).trim(); });
  var idCol = h.indexOf('request_order_line_id'), roCol = h.indexOf('request_order_id'),
      lsCol = h.indexOf('line_status'), upCol = h.indexOf('updated_at');
  if (idCol === -1 || roCol === -1) return jsonResponse_({ success: false, error: 'required columns not found' });

  // request_order_id -> canonical status (request_status, fallback legacy status). Draft-only cancellation.
  var roData = roSheet.getDataRange().getValues();
  var rh = roData[0].map(function (x) { return String(x).trim(); });
  var rIdCol = rh.indexOf('request_order_id'), rReqStatusCol = rh.indexOf('request_status'), rStatusCol = rh.indexOf('status');
  var roStatus = {};
  for (var p = 1; p < roData.length; p++) {
    if (rIdCol === -1) continue;
    var rsv = rReqStatusCol !== -1 ? String(roData[p][rReqStatusCol]).trim() : '';
    if (!rsv && rStatusCol !== -1) rsv = String(roData[p][rStatusCol]).trim();
    roStatus[String(roData[p][rIdCol]).trim()] = rsv;
  }

  var idSet = {}; ids.forEach(function (x) { idSet[String(x).trim()] = 1; });
  var now = procurementTimestamp_();
  var cancelled = 0, skipped = 0;
  var affectedRoIds = {};
  for (var i = 1; i < data.length; i++) {
    var lid = String(data[i][idCol]).trim();
    if (!idSet[lid]) continue;
    var parent = String(data[i][roCol]).trim();
    if (roStatus[parent] !== 'draft') { skipped++; continue; }   // only Draft lines cancellable here
    if (lsCol !== -1) lineSheet.getRange(i + 1, lsCol + 1).setValue('cancelled');
    if (upCol !== -1) lineSheet.getRange(i + 1, upCol + 1).setValue(now);
    affectedRoIds[parent] = true;
    cancelled++;
  }

  // If a parent request now has NO active (non-cancelled) line, cancel the whole request.
  var fresh = lineSheet.getDataRange().getValues();
  var fh = fresh[0].map(function (x) { return String(x).trim(); });
  var fRo = fh.indexOf('request_order_id'), fLs = fh.indexOf('line_status');
  var fullyCancelled = [];
  Object.keys(affectedRoIds).forEach(function (roId) {
    var total = 0, active = 0;
    for (var i = 1; i < fresh.length; i++) {
      if (String(fresh[i][fRo]).trim() !== roId) continue;
      total++;
      if (!(fLs !== -1 && String(fresh[i][fLs]).trim() === 'cancelled')) active++;
    }
    if (total > 0 && active === 0) {
      var ref = procurementFindRow_(roSheet, 'request_order_id', roId);
      if (ref) {
        function setRo(name, val) { var c = ref.col(name); if (c !== -1) roSheet.getRange(ref.row, c + 1).setValue(val); }
        setRo('request_status', 'cancelled');   // canonical status (legacy `status` no longer written)
        setRo('cancelled_by', actor);
        setRo('cancelled_at', now);
        setRo('updated_by', actor);
        setRo('updated_at', now);
        fullyCancelled.push(roId);
      }
    } else {
      procurementRecalcRequestTotals_(ss, roId);   // recompute totals excluding the cancelled lines
    }
  });

  return jsonResponse_({ success: true, data: { cancelled_lines: cancelled, skipped: skipped, cancelled_requests: fullyCancelled } });
}

// ---- createPurchaseOrderFromRequest -------------------------------

/**
 * Convert an APPROVED Request Order into a Purchase Order (Procurement Commitment). Body:
 *   { request_order_id, actor? }.
 * Creates purchase_orders (status=draft) + purchase_order_lines (copied from request_order_lines:
 *   approved_qty -> ordered_qty, unit_cost, line_amount, carton_qty, ...). Sets the SOURCE request's
 *   status = converted_to_po (the request recording its own conversion — the ONLY write back, per
 *   Immutable Flow). Idempotency: a request already converted_to_po is rejected.
 */
function handleCreatePurchaseOrderFromRequest_(body) {
  var roId = String((body && body.request_order_id) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  if (!roId) return jsonResponse_({ success: false, error: 'Missing request_order_id' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var roSheet = ss.getSheetByName('request_orders');
  var rolSheet = ss.getSheetByName('request_order_lines');
  if (!roSheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found' });
  if (!rolSheet) return jsonResponse_({ success: false, error: 'request_order_lines sheet not found' });
  sheetEnsureColumns_(roSheet, ['request_status']);   // ensure canonical column before findRow

  var ref = procurementFindRow_(roSheet, 'request_order_id', roId);
  if (!ref) return jsonResponse_({ success: false, error: 'Request order not found: ' + roId });
  var col = ref.col;
  var curStatus = procurementReqStatus_(ref);   // canonical request_status (fallback legacy status)
  if (curStatus === 'converted_to_po') return jsonResponse_({ success: false, error: 'Request order already converted to a Purchase Order' });
  if (curStatus !== 'approved') return jsonResponse_({ success: false, error: 'Only an Approved request can be converted (current: ' + curStatus + ')' });

  var poSheet = procurementEnsureSheet_(ss, 'purchase_orders', PURCHASE_ORDERS_HEADERS_);
  var polSheet = procurementEnsureSheet_(ss, 'purchase_order_lines', PURCHASE_ORDER_LINES_HEADERS_);

  var now = procurementTimestamp_();
  var today = procurementToday_();

  function roVal(name) { var c = col(name); return c !== -1 ? ref.vals[c] : ''; }
  var company = String(roVal('company') || '').trim();
  var supplierId = String(roVal('supplier_id') || '').trim();
  var supplierName = String(roVal('supplier_name') || '').trim();
  var warehouseId = String(roVal('warehouse_id') || '').trim();
  // factory_id resolved from warehouse_id via the warehouses master; fall back to the request's factory_id,
  // then the warehouse_id itself (never crash / never blank-out silently).
  var factoryId = procurementResolveFactoryId_(ss, warehouseId, String(roVal('factory_id') || '').trim());
  var currency = String(roVal('currency') || '').trim();

  // ---- read request lines once; group ACTIVE (non-cancelled) lines by PO bucket group ----
  // Bucket group: T1 → 'T1'; T2/T3 → 'T2_T3'. Each line keeps its ORIGINAL request_bucket (T1/T2/T3).
  // Ensure the back-reference column exists BEFORE reading (so its index is valid on legacy sheets).
  sheetEnsureColumns_(rolSheet, ['purchase_order_line_id']);
  var data = rolSheet.getDataRange().getValues();
  var lh = data[0].map(function (x) { return String(x).trim(); });
  function lc(n) { return lh.indexOf(n); }
  var lineIdCol = lc('request_order_line_id');
  var poLineIdBackCol = lc('purchase_order_line_id');
  var groups = { 'T1': [], 'T2_T3': [] };
  for (var i = 1; i < data.length; i++) {
    if (lc('request_order_id') === -1 || String(data[i][lc('request_order_id')]).trim() !== roId) continue;
    var sku = lc('sku') !== -1 ? String(data[i][lc('sku')]).trim() : '';
    if (!sku) continue;
    // A1 — cancelled request lines are NEVER converted.
    var ls = lc('line_status') !== -1 ? String(data[i][lc('line_status')]).trim().toLowerCase() : '';
    if (ls === 'cancelled') continue;
    var bucket = lc('request_bucket') !== -1 ? String(data[i][lc('request_bucket')]).trim().toUpperCase() : '';
    var groupKey = (bucket === 'T2' || bucket === 'T3') ? 'T2_T3' : 'T1';   // blank/legacy → T1
    groups[groupKey].push({ rowIndex: i, bucket: (bucket || 'T1') });
  }

  if (!groups['T1'].length && !groups['T2_T3'].length) {
    return jsonResponse_({ success: false, error: 'Request order has no active (non-cancelled) lines to convert' });
  }

  function cellNum(row, name) { return lc(name) !== -1 ? (parseFloat(data[row][lc(name)]) || 0) : 0; }
  function cellStr(row, name) { return lc(name) !== -1 ? String(data[row][lc(name)] || '').trim() : ''; }
  // Date-only (yyyy-MM-dd) copy of a schedule cell — strips any time/timezone (D).
  function cellDate(row, name) { return lc(name) !== -1 ? procurementDateOnly_(data[row][lc(name)]) : ''; }

  // Create ONE purchase order per non-empty bucket group.
  var createdPOs = [];
  ['T1', 'T2_T3'].forEach(function (groupKey) {
    var members = groups[groupKey];
    if (!members.length) return;   // never create an empty PO header

    var purchaseOrderId = 'PO-' + Utilities.getUuid().substring(0, 10).toUpperCase();
    var purchaseOrderNo = 'PO-' + today.replace(/-/g, '') + '-' + Utilities.getUuid().substring(0, 4).toUpperCase() + '-' + groupKey;

    var totalQty = 0, totalCartons = 0, totalAmount = 0, distinctSku = {};
    // Representative tier schedule (first member) → header dates.
    var s0 = members[0].rowIndex;
    var hdrInspection = cellDate(s0, 'inspection_date');            // date-only
    var hdrCompletion = cellDate(s0, 'expected_ready_date');        // expected_completion_date ← expected_ready_date (date-only)
    var hdrShip = cellDate(s0, 'expected_ship_date');               // date-only

    members.forEach(function (m) {
      var row = m.rowIndex;
      var sku = cellStr(row, 'sku');
      var orderedQty = cellNum(row, 'approved_qty');
      var upc = cellNum(row, 'units_per_carton');
      var carton = lc('carton_qty') !== -1 ? cellNum(row, 'carton_qty') : ((upc > 0) ? Math.ceil(orderedQty / upc) : 0);
      var ucRaw = lc('unit_cost') !== -1 ? data[row][lc('unit_cost')] : '';
      var hasUc = (ucRaw !== '' && ucRaw != null && !isNaN(parseFloat(ucRaw)));
      var unitCost = hasUc ? parseFloat(ucRaw) : '';
      var lineAmount = hasUc ? Math.round(orderedQty * unitCost * 100) / 100 : '';
      var poLineId = 'POL-' + Utilities.getUuid().substring(0, 10).toUpperCase();

      procurementAppendByHeader_(polSheet, {
        purchase_order_line_id: poLineId,
        purchase_order_id: purchaseOrderId,
        request_order_line_id: cellStr(row, 'request_order_line_id'),
        request_order_id: roId,
        request_bucket: m.bucket,                                   // ORIGINAL T1 / T2 / T3
        sku: sku,
        company: cellStr(row, 'company'),
        series: cellStr(row, 'series'),
        factory_item_no: cellStr(row, 'factory_item_no'),
        factory_item_name: cellStr(row, 'factory_item_name'),
        supplier_id: cellStr(row, 'supplier_id') || supplierId,
        supplier_name: cellStr(row, 'supplier_name') || supplierName,
        supplier_sku: cellStr(row, 'supplier_sku'),
        supplier_warehouse_id: cellStr(row, 'supplier_warehouse_id'),
        km_qty: cellNum(row, 'km_qty'),
        resus_qty: cellNum(row, 'resus_qty'),
        restw_qty: cellNum(row, 'restw_qty'),
        recommended_qty: lc('recommended_qty') !== -1 ? cellNum(row, 'recommended_qty') : '',
        requested_qty: cellNum(row, 'requested_qty'),
        approved_qty: orderedQty,
        ordered_qty: orderedQty,
        completed_qty: 0,
        shipped_qty: 0,
        // remaining_qty = available-to-ship = completed_qty − shipped_qty (both 0 at creation → 0).
        // NOT ordered_qty: no completed goods means no available remaining qty (PO Remaining / Shipment source).
        remaining_qty: 0,
        carton_qty: carton,
        units_per_carton: upc,
        unit_cost: unitCost,
        line_amount: lineAmount,
        currency: cellStr(row, 'currency') || currency,
        line_status: cellStr(row, 'line_status') || 'draft',
        inspection_date: cellDate(row, 'inspection_date'),                 // date-only
        expected_completion_date: cellDate(row, 'expected_ready_date'),    // ← request_order_lines.expected_ready_date (date-only)
        expected_ship_date: cellDate(row, 'expected_ship_date'),           // date-only
        related_shipment_id: '',
        note: cellStr(row, 'note'),
        created_at: now,
        updated_at: now
      });

      // Back-reference the request line to its created PO line (active converted lines only).
      if (poLineIdBackCol !== -1) rolSheet.getRange(row + 1, poLineIdBackCol + 1).setValue(poLineId);

      totalQty += orderedQty;
      totalCartons += carton;   // total_cartons = SUM(purchase_order_lines.carton_qty)
      if (hasUc) totalAmount += orderedQty * unitCost;
      if (sku) distinctSku[sku.toLowerCase()] = 1;
    });

    var subtotal = (totalAmount > 0 ? Math.round(totalAmount * 100) / 100 : '');
    procurementAppendByHeader_(poSheet, {
      purchase_order_id: purchaseOrderId,
      po_no: purchaseOrderNo,
      km_po_no: '',
      warehouse_id: warehouseId,
      supplier_name: supplierName,
      order_status: 'draft',                       // canonical (legacy `status` no longer written)
      order_date: '',                              // Send PO date — blank at Convert (Convert = Draft creation)
      deposit_due_date: '',                        // = order_date + 5 business days; blank at Convert (order_date blank) — stamped at Send PO

      inspection_date: hdrInspection,
      expected_completion_date: hdrCompletion,     // ← request line expected_ready_date
      expected_ship_date: hdrShip,
      subtotal_amount: subtotal,
      deposit_amount: '',                          // blank (no payment-term ratio yet)
      balance_amount: '',                          // blank (deposit blank)
      paid_amount: '',
      payment_status: 'unpaid',                    // default convention
      payment_term_id: '',
      currency: currency,
      note: '',
      purchase_order_no: purchaseOrderNo,          // back-compat (mirrors po_no)
      po_version: 1,
      parent_purchase_order_id: purchaseOrderId,
      request_order_id: roId,
      company: company,
      supplier_id: supplierId,
      factory_id: factoryId,
      total_sku: Object.keys(distinctSku).length,  // COUNT(DISTINCT sku)
      total_qty: totalQty,
      total_cartons: totalCartons,                 // SUM(purchase_order_lines.carton_qty)
      total_amount: subtotal,
      supplier_expected_ready_date: '',            // BLANK at Convert (future supplier-confirmation add-on; use expected_completion_date as working date)
      supplier_confirmed_ready_date: '',           // BLANK at Convert
      request_bucket: groupKey,                     // T1 or T2_T3
      created_by: actor,
      created_at: now,
      updated_by: actor,
      updated_at: now
    });

    createdPOs.push({
      purchase_order_id: purchaseOrderId,
      purchase_order_no: purchaseOrderNo,
      po_no: purchaseOrderNo,
      request_bucket: groupKey,
      line_count: members.length,
      total_qty: totalQty
    });
  });

  // The request records its OWN conversion (the only write back to request_orders).
  sheetEnsureColumns_(roSheet, ['request_status', 'updated_by', 'updated_at']);
  function setRo(name, value) { var c = ref.col(name); if (c !== -1) roSheet.getRange(ref.row, c + 1).setValue(value); }
  setRo('request_status', 'converted_to_po');   // canonical status (legacy `status` no longer written)
  setRo('updated_by', actor);
  setRo('updated_at', now);

  // Back-compat: expose the first PO at the top level; full list in purchase_orders.
  return jsonResponse_({ success: true, data: {
    request_order_id: roId,
    purchase_orders: createdPOs,
    po_count: createdPOs.length,
    purchase_order_id: createdPOs[0].purchase_order_id,
    purchase_order_no: createdPOs[0].purchase_order_no
  } });
}

/** Resolve factory_id from a warehouse_id via the warehouses master (warehouse_id → factory_id when present).
 *  Falls back to the request's own factory_id, then to warehouse_id. Missing-tab / missing-col safe. */
function procurementResolveFactoryId_(ss, warehouseId, fallbackFactoryId) {
  var wid = String(warehouseId || '').trim();
  if (fallbackFactoryId) return fallbackFactoryId;   // request already carries an explicit factory_id
  if (!wid) return '';
  var sh = ss.getSheetByName('warehouses');
  if (sh) {
    var d = sh.getDataRange().getValues();
    if (d.length >= 2) {
      var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
      var cId = h.indexOf('warehouse_id'), cFac = h.indexOf('factory_id');
      if (cId !== -1 && cFac !== -1) {
        for (var i = 1; i < d.length; i++) {
          if (String(d[i][cId]).trim().toUpperCase() === wid.toUpperCase()) {
            var f = String(d[i][cFac] || '').trim();
            if (f) return f;
            break;
          }
        }
      }
    }
  }
  return wid;   // no mapping → copy warehouse_id (never crash / never blank)
}

// ---- updatePurchaseOrderStatus ------------------------------------

/**
 * Purchase Order status transitions (header-based lookup by purchase_order_id):
 *   issue           : draft -> issued (issued_by/at)
 *   confirm         : issued -> confirmed (confirmed_by/at; optional confirmed_ready_date)
 *   start_production: confirmed -> in_production
 *   ready_to_ship   : in_production -> ready_to_ship
 *   complete        : ready_to_ship -> completed (completed_by/at)
 *   cancel          : any non-completed -> cancelled
 * Optional fields accepted on any transition: expected_ready_date, confirmed_ready_date, note.
 */
function handleUpdatePurchaseOrderStatus_(body) {
  var poId = String((body && body.purchase_order_id) || '').trim();
  var transition = String((body && body.transition) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  if (!poId) return jsonResponse_({ success: false, error: 'Missing purchase_order_id' });
  var VALID = ['issue', 'confirm', 'start_production', 'ready_to_ship', 'complete', 'cancel'];
  if (VALID.indexOf(transition) === -1) {
    return jsonResponse_({ success: false, error: 'Invalid transition. Valid: ' + VALID.join(', ') });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('purchase_orders');
  if (!sheet) return jsonResponse_({ success: false, error: 'purchase_orders sheet not found' });
  sheetEnsureColumns_(sheet, ['order_status', 'order_date', 'deposit_due_date']);   // ensure columns before findRow captures headers

  var ref = procurementFindRow_(sheet, 'purchase_order_id', poId);
  if (!ref) return jsonResponse_({ success: false, error: 'Purchase order not found: ' + poId });
  var col = ref.col;
  // Canonical order_status (falls back to legacy `status` for old rows).
  var curStatus = col('order_status') !== -1 ? String(ref.vals[col('order_status')]).trim() : '';
  if (!curStatus && col('status') !== -1) curStatus = String(ref.vals[col('status')]).trim();
  var now = procurementTimestamp_();
  function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(ref.row, c + 1).setValue(value); }
  // Write ONLY canonical order_status (legacy `status` no longer written / recreated).
  function setStatus(value) { setCell('order_status', value); }

  var EXPECTED_PREV = {
    issue: 'draft', confirm: 'issued', start_production: 'confirmed',
    ready_to_ship: 'in_production', complete: 'ready_to_ship'
  };
  if (transition === 'cancel') {
    if (curStatus === 'completed' || curStatus === 'cancelled') {
      return jsonResponse_({ success: false, error: 'A completed / cancelled PO cannot be cancelled (current: ' + curStatus + ')' });
    }
    setStatus('cancelled');
    setCell('cancelled_by', actor);
    setCell('cancelled_at', now);
  } else {
    if (curStatus !== EXPECTED_PREV[transition]) {
      return jsonResponse_({ success: false, error: 'Transition "' + transition + '" requires status "' + EXPECTED_PREV[transition] + '" (current: ' + curStatus + ')' });
    }
    if (transition === 'issue') {
      setStatus('issued'); setCell('issued_by', actor); setCell('issued_at', now);
      var orderDate = procurementToday_();                       // order_date = Send PO date (date-only)
      setCell('order_date', orderDate);
      // deposit_due_date = order_date + 5 BUSINESS days (weekends excluded; NOT from created_at). Holidays deferred.
      setCell('deposit_due_date', procurementAddBusinessDays_(orderDate, 5));
    }
    else if (transition === 'confirm') { setStatus('confirmed'); setCell('confirmed_by', actor); setCell('confirmed_at', now); }
    else if (transition === 'start_production') { setStatus('in_production'); }
    else if (transition === 'ready_to_ship') { setStatus('ready_to_ship'); }
    else if (transition === 'complete') { setStatus('completed'); setCell('completed_by', actor); setCell('completed_at', now); }
  }

  // Optional supplier-timeline updates (accepted on any transition). Canonical supplier_* fields; legacy
  // body keys expected_ready_date / confirmed_ready_date are accepted and remapped (deprecated columns are
  // NOT written/recreated).
  var expReady = (body.supplier_expected_ready_date !== undefined) ? body.supplier_expected_ready_date : body.expected_ready_date;
  var confReady = (body.supplier_confirmed_ready_date !== undefined) ? body.supplier_confirmed_ready_date : body.confirmed_ready_date;
  if (expReady !== undefined) { setCell('supplier_expected_ready_date', String(expReady || '').trim()); setCell('expected_completion_date', String(expReady || '').trim()); }
  if (confReady !== undefined) setCell('supplier_confirmed_ready_date', String(confReady || '').trim());
  if (body.note !== undefined && col('note') !== -1) {
    var existing = String(ref.vals[col('note')] || '').trim();
    var appended = '[' + transition + ' @' + now + ' by ' + actor + '] ' + String(body.note || '').trim();
    setCell('note', existing ? (existing + '\n' + appended) : appended);
  }

  setCell('updated_by', actor);
  setCell('updated_at', now);

  return jsonResponse_({ success: true, data: { purchase_order_id: poId, transition: transition } });
}

// ---- updatePurchaseOrderHeader ------------------------------------

/**
 * Edit PO Overview execution HEADER fields on purchase_orders (by purchase_order_id). Body:
 *   { purchase_order_id, inspection_date?, expected_completion_date?, expected_ship_date?, deposit_due_date?, note?,
 *     deposit_amount?, balance_amount?, paid_amount?, payment_status?, actor? }.
 * Writes ONLY purchase_orders — never request_orders / request_order_lines / lines. Date fields are
 * stored DATE-ONLY (yyyy-MM-dd). supplier_expected_ready_date / supplier_confirmed_ready_date are NOT
 * touched here (future supplier-confirmation flow). Only provided keys are written (partial update).
 */
function handleUpdatePurchaseOrderHeader_(body) {
  var poId = String((body && body.purchase_order_id) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  if (!poId) return jsonResponse_({ success: false, error: 'Missing purchase_order_id' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('purchase_orders');
  if (!sheet) return jsonResponse_({ success: false, error: 'purchase_orders sheet not found' });
  // Ensure the editable columns exist BEFORE findRow captures headers (additive; deprecated cols untouched).
  sheetEnsureColumns_(sheet, ['inspection_date', 'expected_completion_date', 'expected_ship_date', 'deposit_due_date', 'note',
    'deposit_amount', 'balance_amount', 'paid_amount', 'payment_status', 'updated_by', 'updated_at']);

  var ref = procurementFindRow_(sheet, 'purchase_order_id', poId);
  if (!ref) return jsonResponse_({ success: false, error: 'Purchase order not found: ' + poId });
  var col = ref.col;
  var now = procurementTimestamp_();
  function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(ref.row, c + 1).setValue(value); }
  function numOrBlank(v) { if (v === '' || v == null) return ''; var n = parseFloat(v); return isNaN(n) ? '' : n; }

  var applied = [];
  // Date fields → date-only. `deposit_due_date` editable here (manual adjust); auto-value is stamped at Send PO.
  ['inspection_date', 'expected_completion_date', 'expected_ship_date', 'deposit_due_date'].forEach(function (f) {
    if (body[f] !== undefined) { setCell(f, procurementDateOnly_(body[f])); applied.push(f); }
  });
  // Numeric payment fields (blank allowed).
  ['deposit_amount', 'balance_amount', 'paid_amount'].forEach(function (f) {
    if (body[f] !== undefined) { setCell(f, numOrBlank(body[f])); applied.push(f); }
  });
  // Free-text / status fields.
  if (body.payment_status !== undefined) { setCell('payment_status', String(body.payment_status || '').trim()); applied.push('payment_status'); }
  if (body.note !== undefined) { setCell('note', String(body.note || '').trim()); applied.push('note'); }

  if (!applied.length) return jsonResponse_({ success: false, error: 'No supported header fields provided' });

  setCell('updated_by', actor);
  setCell('updated_at', now);

  return jsonResponse_({ success: true, data: { purchase_order_id: poId, updated_fields: applied } });
}

// ---- updatePurchaseOrderLine --------------------------------------

/**
 * Edit purchase_order_lines fields (Draft PO only). Body:
 *   { lines: [ { purchase_order_line_id, ordered_qty?, unit_cost?, note? } ] }.
 * Recomputes carton_qty (from units_per_carton), line_amount (ordered × unit_cost),
 * remaining_qty (completed − shipped, clamp ≥ 0). Lines whose parent PO is not Draft are skipped (reported).
 * Recomputes the parent PO header totals afterward.
 */
function handleUpdatePurchaseOrderLine_(body) {
  var reqLines = (body && body.lines) || [];
  if (!reqLines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSheet = ss.getSheetByName('purchase_order_lines');
  var poSheet = ss.getSheetByName('purchase_orders');
  if (!lineSheet) return jsonResponse_({ success: false, error: 'purchase_order_lines sheet not found' });
  if (!poSheet) return jsonResponse_({ success: false, error: 'purchase_orders sheet not found' });

  var poData = poSheet.getDataRange().getValues();
  var poHeaders = poData[0].map(function (h) { return String(h).trim(); });
  var poIdCol = poHeaders.indexOf('purchase_order_id');
  var poOrderStatusCol = poHeaders.indexOf('order_status');   // canonical
  var poStatusCol = poHeaders.indexOf('status');              // legacy fallback
  var statusById = {};
  for (var p = 1; p < poData.length; p++) {
    if (poIdCol === -1) continue;
    var st = poOrderStatusCol !== -1 ? String(poData[p][poOrderStatusCol]).trim() : '';
    if (!st && poStatusCol !== -1) st = String(poData[p][poStatusCol]).trim();
    statusById[String(poData[p][poIdCol]).trim()] = st;
  }

  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'purchase_order_lines is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var idCol = col('purchase_order_line_id');
  var poLineIdCol = col('purchase_order_id');
  var orderedCol = col('ordered_qty');
  var completedCol = col('completed_qty');
  var shippedCol = col('shipped_qty');
  var remainingCol = col('remaining_qty');
  var cartonCol = col('carton_qty');
  var upcCol = col('units_per_carton');
  var unitCostCol = col('unit_cost');
  var lineAmountCol = col('line_amount');
  var noteCol = col('note');
  var updatedCol = col('updated_at');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'purchase_order_line_id column not found' });

  var rowById = {};
  for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };

  var now = procurementTimestamp_();
  var updated = 0, skipped = 0;
  var affectedPoIds = {};
  for (var r = 0; r < reqLines.length; r++) {
    var rq = reqLines[r] || {};
    var lineId = String(rq.purchase_order_line_id || '').trim();
    if (!lineId || !rowById[lineId]) { skipped++; continue; }
    var ent = rowById[lineId];
    var parentId = poLineIdCol !== -1 ? String(ent.vals[poLineIdCol]).trim() : '';
    if (statusById[parentId] !== 'draft') { skipped++; continue; } // editable only in Draft PO

    var ordered = orderedCol !== -1 ? (parseFloat(ent.vals[orderedCol]) || 0) : 0;
    if (rq.ordered_qty !== undefined) {
      ordered = parseFloat(rq.ordered_qty); if (isNaN(ordered) || ordered < 0) ordered = 0;
      if (orderedCol !== -1) lineSheet.getRange(ent.row, orderedCol + 1).setValue(ordered);
      var upc = upcCol !== -1 ? (parseFloat(ent.vals[upcCol]) || 0) : 0;
      var carton = (upc > 0) ? Math.ceil(ordered / upc) : 0;
      if (cartonCol !== -1) lineSheet.getRange(ent.row, cartonCol + 1).setValue(carton);
      // remaining_qty = available-to-ship = completed_qty − shipped_qty (NOT ordered − shipped).
      var shipped = shippedCol !== -1 ? (parseFloat(ent.vals[shippedCol]) || 0) : 0;
      var completedNow = completedCol !== -1 ? (parseFloat(ent.vals[completedCol]) || 0) : 0;
      if (remainingCol !== -1) lineSheet.getRange(ent.row, remainingCol + 1).setValue(Math.max(0, completedNow - shipped));
    }
    var unitCost = unitCostCol !== -1 ? parseFloat(ent.vals[unitCostCol]) : NaN;
    if (rq.unit_cost !== undefined) {
      var hasUc = (rq.unit_cost !== '' && rq.unit_cost != null && !isNaN(parseFloat(rq.unit_cost)));
      unitCost = hasUc ? parseFloat(rq.unit_cost) : NaN;
      if (unitCostCol !== -1) lineSheet.getRange(ent.row, unitCostCol + 1).setValue(hasUc ? unitCost : '');
    }
    if (lineAmountCol !== -1) {
      lineSheet.getRange(ent.row, lineAmountCol + 1).setValue(!isNaN(unitCost) ? Math.round(ordered * unitCost * 100) / 100 : '');
    }
    if (rq.note !== undefined && noteCol !== -1) lineSheet.getRange(ent.row, noteCol + 1).setValue(String(rq.note || '').trim());
    if (updatedCol !== -1) lineSheet.getRange(ent.row, updatedCol + 1).setValue(now);
    if (parentId) affectedPoIds[parentId] = true;
    updated++;
  }

  Object.keys(affectedPoIds).forEach(function (id) { procurementRecalcPoTotals_(ss, id); });

  return jsonResponse_({ success: true, data: { updated: updated, skipped: skipped } });
}

// ---- receivePurchaseOrderLines (PO Workspace Receive flow) --------------------

/**
 * Receive produced/received quantity against purchase_order_lines. Body:
 *   { purchase_order_id, lines: [ { purchase_order_line_id, receive_qty } ], actor? }.
 * Per line: completed_qty += receive_qty, clamped so 0 < receive_qty <= ordered_qty - completed_qty
 * (cannot exceed unreceived = ordered − completed, cannot re-receive completed); then
 * remaining_qty = completed_qty − shipped_qty (available-to-ship, clamp ≥ 0).
 * Then the PO order_status is recomputed from ALL its lines: every line completed_qty >= ordered_qty
 *   -> 'completed' (+ completed_by / completed_at); otherwise if any completed -> 'partial_completed'.
 * Writes ONLY purchase_orders / purchase_order_lines. NEVER touches request orders / shipments /
 * inventory / factory stock / carrier. No schema change (columns are additive-ensured).
 */
function handleReceivePurchaseOrderLines_(body) {
  var poId = String((body && body.purchase_order_id) || '').trim();
  var reqLines = (body && body.lines) || [];
  var actor = String((body && body.actor) || 'operation-system').trim();
  if (!poId) return jsonResponse_({ success: false, error: 'Missing purchase_order_id' });
  if (!reqLines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSheet = ss.getSheetByName('purchase_order_lines');
  var poSheet = ss.getSheetByName('purchase_orders');
  if (!lineSheet) return jsonResponse_({ success: false, error: 'purchase_order_lines sheet not found' });
  if (!poSheet) return jsonResponse_({ success: false, error: 'purchase_orders sheet not found' });

  sheetEnsureColumns_(lineSheet, ['completed_qty', 'remaining_qty', 'updated_at']);
  sheetEnsureColumns_(poSheet, ['order_status', 'completed_by', 'completed_at', 'updated_by', 'updated_at']);

  var poRef = procurementFindRow_(poSheet, 'purchase_order_id', poId);
  if (!poRef) return jsonResponse_({ success: false, error: 'Purchase order not found: ' + poId });
  var curStatus = poRef.col('order_status') !== -1 ? String(poRef.vals[poRef.col('order_status')]).trim() : '';
  if (!curStatus && poRef.col('status') !== -1) curStatus = String(poRef.vals[poRef.col('status')]).trim();
  if (curStatus === 'cancelled') return jsonResponse_({ success: false, error: 'A cancelled PO cannot receive.' });

  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'purchase_order_lines is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var idCol = col('purchase_order_line_id');
  var poLineIdCol = col('purchase_order_id');
  var orderedCol = col('ordered_qty');
  var completedCol = col('completed_qty');
  var shippedCol = col('shipped_qty');
  var remainingCol = col('remaining_qty');
  var updatedCol = col('updated_at');
  if (idCol === -1 || completedCol === -1 || orderedCol === -1) {
    return jsonResponse_({ success: false, error: 'required line columns not found' });
  }

  var rowById = {};
  for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };

  var now = procurementTimestamp_();
  var received = 0, skipped = 0;
  var newCompletedById = {};   // applied completed per line (to evaluate status without re-read)

  for (var r = 0; r < reqLines.length; r++) {
    var rq = reqLines[r] || {};
    var lineId = String(rq.purchase_order_line_id || '').trim();
    if (!lineId || !rowById[lineId]) { skipped++; continue; }
    var ent = rowById[lineId];
    if (poLineIdCol !== -1 && String(ent.vals[poLineIdCol]).trim() !== poId) { skipped++; continue; }
    var ordered = parseFloat(ent.vals[orderedCol]) || 0;
    var completed = parseFloat(ent.vals[completedCol]) || 0;
    var shipped = shippedCol !== -1 ? (parseFloat(ent.vals[shippedCol]) || 0) : 0;
    var recv = parseFloat(rq.receive_qty);
    var maxRecv = ordered - completed;   // unreceived qty = ordered − completed
    if (isNaN(recv) || recv <= 0 || maxRecv <= 0) { skipped++; continue; }
    if (recv > maxRecv) recv = maxRecv;   // clamp: never exceed unreceived qty
    var newCompleted = completed + recv;
    lineSheet.getRange(ent.row, completedCol + 1).setValue(newCompleted);
    // remaining_qty = available-to-ship = completed_qty − shipped_qty (clamp ≥ 0). shipped_qty untouched.
    if (remainingCol !== -1) lineSheet.getRange(ent.row, remainingCol + 1).setValue(Math.max(0, newCompleted - shipped));
    if (updatedCol !== -1) lineSheet.getRange(ent.row, updatedCol + 1).setValue(now);
    newCompletedById[lineId] = newCompleted;
    received++;
  }

  if (!received) return jsonResponse_({ success: false, error: 'No receivable quantity applied (receive_qty must be > 0 and <= remaining).' });

  // Recompute PO status from ALL its lines (fresh values + applied overrides).
  var allComplete = true, anyCompleted = false, hasLine = false;
  for (var j = 1; j < data.length; j++) {
    if (poLineIdCol !== -1 && String(data[j][poLineIdCol]).trim() !== poId) continue;
    hasLine = true;
    var lid = String(data[j][idCol]).trim();
    var ord = parseFloat(data[j][orderedCol]) || 0;
    var comp = newCompletedById.hasOwnProperty(lid) ? newCompletedById[lid] : (parseFloat(data[j][completedCol]) || 0);
    if (comp < ord) allComplete = false;
    if (comp > 0) anyCompleted = true;
  }

  function setPoCell(name, value) { var c = poRef.col(name); if (c !== -1) poSheet.getRange(poRef.row, c + 1).setValue(value); }
  var newStatus = curStatus;
  if (hasLine && allComplete) {
    newStatus = 'completed';
    setPoCell('order_status', 'completed');
    setPoCell('completed_by', actor);
    setPoCell('completed_at', now);
  } else if (anyCompleted) {
    newStatus = 'partial_completed';
    setPoCell('order_status', 'partial_completed');
  }
  setPoCell('updated_by', actor);
  setPoCell('updated_at', now);

  return jsonResponse_({ success: true, data: { purchase_order_id: poId, received: received, skipped: skipped, order_status: newStatus } });
}

/** Recompute purchase_orders totals (total_sku / total_qty / total_cartons / total_amount) from its lines. */
function procurementRecalcPoTotals_(ss, purchaseOrderId) {
  var lineSheet = ss.getSheetByName('purchase_order_lines');
  var poSheet = ss.getSheetByName('purchase_orders');
  if (!lineSheet || !poSheet) return;
  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return;
  var h = data[0].map(function (x) { return String(x).trim(); });
  var poIdCol = h.indexOf('purchase_order_id'), oCol = h.indexOf('ordered_qty'), ucCol = h.indexOf('unit_cost'), skuCol = h.indexOf('sku'), ctnCol = h.indexOf('carton_qty');
  if (poIdCol === -1) return;
  var distinctSku = {}, totalQty = 0, totalCartons = 0, totalAmount = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][poIdCol]).trim() !== purchaseOrderId) continue;
    var sku = skuCol !== -1 ? String(data[i][skuCol] || '').trim() : '';
    if (sku) distinctSku[sku.toLowerCase()] = 1;   // total_sku = COUNT(DISTINCT sku)
    var q = oCol !== -1 ? (parseFloat(data[i][oCol]) || 0) : 0;
    totalQty += q;
    totalCartons += ctnCol !== -1 ? (parseFloat(data[i][ctnCol]) || 0) : 0;   // SUM(carton_qty)
    var uc = ucCol !== -1 ? parseFloat(data[i][ucCol]) : NaN;
    if (!isNaN(uc)) totalAmount += q * uc;
  }
  var ref = procurementFindRow_(poSheet, 'purchase_order_id', purchaseOrderId);
  if (!ref) return;
  function setCell(name, value) { var c = ref.col(name); if (c !== -1) poSheet.getRange(ref.row, c + 1).setValue(value); }
  var amt = totalAmount > 0 ? Math.round(totalAmount * 100) / 100 : '';
  setCell('total_sku', Object.keys(distinctSku).length);
  setCell('total_qty', totalQty);
  setCell('total_cartons', totalCartons);   // keep synced with lines
  setCell('total_amount', amt);
  setCell('subtotal_amount', amt);   // subtotal mirrors total_amount (no payment-term split yet)
}

// ---- Connection test / sample data (Part 5) -----------------------
/**
 * One-off validation helper. Run manually from the Apps Script editor to (1) auto-create the four
 * procurement tabs with their documented headers and (2) insert ONE sample Request Order (approved)
 * + ONE sample Purchase Order (in_production) with lines, so Request Order Draft / PO Overview /
 * PO List show real rows. Idempotent-ish: appends a fresh sample each run (delete rows to reset).
 * NOT wired to any action/trigger — purely a manual connection test. No factory-stock / shipment
 * side effects.
 */
function seedProcurementSampleData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var roSheet  = procurementEnsureSheet_(ss, 'request_orders', REQUEST_ORDERS_HEADERS_);
  var rolSheet = procurementEnsureSheet_(ss, 'request_order_lines', REQUEST_ORDER_LINES_HEADERS_);
  var poSheet  = procurementEnsureSheet_(ss, 'purchase_orders', PURCHASE_ORDERS_HEADERS_);
  var polSheet = procurementEnsureSheet_(ss, 'purchase_order_lines', PURCHASE_ORDER_LINES_HEADERS_);

  var now = procurementTimestamp_();
  var today = procurementToday_();
  var roId = 'RO-SAMPLE-' + Utilities.getUuid().substring(0, 6).toUpperCase();
  var poId = 'PO-SAMPLE-' + Utilities.getUuid().substring(0, 6).toUpperCase();

  // Request Order (approved) — appears on Request Order Draft under Approved (Convert to PO ready).
  var srcSheet = procurementEnsureSheet_(ss, 'request_order_line_sources', REQUEST_ORDER_LINE_SOURCES_HEADERS_);
  procurementAppendByHeader_(roSheet, {
    request_order_id: roId, request_order_no: 'REQ-' + today.replace(/-/g, '') + '-SMPL',
    request_order_version: 1, parent_request_order_id: roId,
    company: 'ResTW', supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin',
    factory_id: 'CN_YOUXIN', warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', request_status: 'approved', tier_group: 'T1',
    total_sku: 2, total_qty: 900, total_cartons: 0, estimated_amount: 2250, currency: 'USD',
    source: 'manual', created_by: 'sample', created_at: now, submitted_by: 'sample', submitted_at: now,
    approved_by: 'sample', approved_at: now, note: 'Sample seed', updated_by: 'sample', updated_at: now
  });
  procurementAppendByHeader_(rolSheet, {
    request_order_line_id: 'ROL-SMPL-1', request_order_id: roId, sku: 'CO1100-R',
    series: 'CO1100', company: 'ResTW', request_bucket: 'T1', request_month: today.substring(0, 7),
    requested_qty: 500, approved_qty: 500, km_qty: 0, resus_qty: 0, restw_qty: 500, units_per_carton: 40, carton_qty: 13,
    supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin', supplier_sku: 'YX-CO1100R',
    unit_cost: 2.5, estimated_amount: 1250, currency: 'USD', calculation_method: 'manual_order_allocation',
    line_status: 'approved', created_at: now, updated_at: now
  });
  procurementAppendByHeader_(rolSheet, {
    request_order_line_id: 'ROL-SMPL-2', request_order_id: roId, sku: 'CO1150-S',
    series: 'CO1150', company: 'ResTW', request_bucket: 'T1', request_month: today.substring(0, 7),
    requested_qty: 400, approved_qty: 400, km_qty: 0, resus_qty: 0, restw_qty: 400, units_per_carton: 40, carton_qty: 10,
    supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin', supplier_sku: 'YX-CO1150S',
    unit_cost: 2.5, estimated_amount: 1000, currency: 'USD', calculation_method: 'manual_order_allocation',
    line_status: 'approved', created_at: now, updated_at: now
  });
  procurementAppendByHeader_(srcSheet, {
    line_source_id: 'ROLS-SMPL-1', request_order_line_id: 'ROL-SMPL-1', request_order_id: roId, sku: 'CO1100-R',
    company: 'ResTW', country: 'US', marketplace: 'amazon', tier_type: 'T1', source_month: today.substring(0, 7),
    requested_qty: 500, approved_qty: 500, shortage_qty: '', source_type: 'manual_order_allocation', note: 'Sample seed',
    created_at: now, updated_at: now
  });
  procurementAppendByHeader_(srcSheet, {
    line_source_id: 'ROLS-SMPL-2', request_order_line_id: 'ROL-SMPL-2', request_order_id: roId, sku: 'CO1150-S',
    company: 'ResTW', country: 'US', marketplace: 'amazon', tier_type: 'T1', source_month: today.substring(0, 7),
    requested_qty: 400, approved_qty: 400, shortage_qty: '', source_type: 'manual_order_allocation', note: 'Sample seed',
    created_at: now, updated_at: now
  });

  // Purchase Order (in_production) — appears on PO Overview + PO List with production/shipment qtys.
  procurementAppendByHeader_(poSheet, {
    purchase_order_id: poId, po_no: 'PO-' + today.replace(/-/g, '') + '-SMPL-T1', km_po_no: '',
    purchase_order_no: 'PO-' + today.replace(/-/g, '') + '-SMPL-T1',
    po_version: 1, parent_purchase_order_id: poId, request_order_id: roId, request_bucket: 'T1',
    company: 'ResTW', supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin',
    factory_id: 'CN_YOUXIN', warehouse_id: '', order_status: 'in_production', currency: 'USD',
    total_sku: 2, total_qty: 900, total_amount: 2250, subtotal_amount: 2250,
    expected_completion_date: today, supplier_expected_ready_date: today, payment_status: 'unpaid',
    note: 'Sample seed', created_by: 'sample', created_at: now, updated_by: 'sample', updated_at: now
  });
  procurementAppendByHeader_(polSheet, {
    purchase_order_line_id: 'POL-SMPL-1', purchase_order_id: poId, request_order_line_id: 'ROL-SMPL-1',
    request_order_id: roId, request_bucket: 'T1', sku: 'CO1100-R', company: 'ResTW', series: 'CO1100',
    km_qty: 0, resus_qty: 0, restw_qty: 500, requested_qty: 500, approved_qty: 500,
    ordered_qty: 500, completed_qty: 300, shipped_qty: 0, remaining_qty: 300,   // completed − shipped
    units_per_carton: 40, carton_qty: 13, supplier_id: 'SUP-YOUXIN', supplier_sku: 'YX-CO1100R',
    unit_cost: 2.5, line_amount: 1250, currency: 'USD', line_status: 'approved', created_at: now, updated_at: now
  });
  procurementAppendByHeader_(polSheet, {
    purchase_order_line_id: 'POL-SMPL-2', purchase_order_id: poId, request_order_line_id: 'ROL-SMPL-2',
    request_order_id: roId, request_bucket: 'T1', sku: 'CO1150-S', company: 'ResTW', series: 'CO1150',
    km_qty: 0, resus_qty: 0, restw_qty: 400, requested_qty: 400, approved_qty: 400,
    ordered_qty: 400, completed_qty: 400, shipped_qty: 100, remaining_qty: 300,
    units_per_carton: 40, carton_qty: 10, supplier_id: 'SUP-YOUXIN', supplier_sku: 'YX-CO1150S',
    unit_cost: 2.5, line_amount: 1000, currency: 'USD', line_status: 'approved', created_at: now, updated_at: now
  });

  return jsonResponse_({ success: true, data: { request_order_id: roId, purchase_order_id: poId, note: 'Sample procurement data created.' } });
}
